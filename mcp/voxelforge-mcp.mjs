#!/usr/bin/env node
/**
 * VoxelForge MCP server.
 *
 * A dependency-free MCP (Model Context Protocol) server for VoxelForge. It
 * speaks newline-delimited JSON-RPC on stdio and runs a small localhost HTTP
 * queue that the browser game polls. AI clients call the MCP tools; the tools
 * enqueue commands; the browser bridge executes them and posts results back.
 *
 *   node mcp/voxelforge-mcp.mjs
 *
 * Environment:
 *   VOXELFORGE_MCP_PORT     HTTP port (default 8765)
 *   VOXELFORGE_MCP_HOST     bind address (default 127.0.0.1)
 *   VOXELFORGE_MCP_TOKEN    optional shared secret; must match the browser field
 *   VOXELFORGE_MCP_TIMEOUT  command timeout in ms (default 30000)
 */

import http from 'node:http';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const VERSION = '1.1.0';
const PORT = Number(process.env.VOXELFORGE_MCP_PORT || 8765);
const HOST = process.env.VOXELFORGE_MCP_HOST || '127.0.0.1';
const TOKEN = process.env.VOXELFORGE_MCP_TOKEN || '';
const COMMAND_TIMEOUT = Number(process.env.VOXELFORGE_MCP_TIMEOUT || 30000);
const HTTP_ONLY = process.argv.includes('--http-only') || process.env.VOXELFORGE_MCP_HTTP_ONLY === '1';

const queue = [];
const pending = new Map();
let lastBrowserContact = 0;
let browserPollCount = 0;
let commandsRun = 0;

function log(...args) {
  process.stderr.write(`[voxelforge-mcp] ${args.join(' ')}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Enqueue a command for the browser and wait for its result. Commands are
 * removed again on timeout so a stale tool call cannot fire much later.
 */
function dispatch(type, payload = {}) {
  const id = newId();
  const command = { id, type, payload, createdAt: Date.now() };
  queue.push(command);
  commandsRun += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      const index = queue.findIndex((entry) => entry.id === id);
      if (index !== -1) queue.splice(index, 1);
      reject(
        new Error(
          `No response from VoxelForge after ${COMMAND_TIMEOUT} ms. Open the game, then Publish → AI control → Start bridge.`,
        ),
      );
    }, COMMAND_TIMEOUT);
    pending.set(id, { resolve, reject, timer, command });
  });
}

function resolveCommand(id, result) {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  clearTimeout(entry.timer);
  entry.resolve(result);
  return true;
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve('');
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'content-type, x-voxelforge-token',
  );
  res.setHeader('Access-Control-Max-Age', '600');
}

function authorised(req) {
  if (!TOKEN) return true;
  return req.headers['x-voxelforge-token'] === TOKEN;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      const browserOnline = Date.now() - lastBrowserContact < 5000;
      sendJson(res, 200, {
        ok: true,
        name: 'voxelforge-mcp',
        version: VERSION,
        browser: browserOnline ? 'online' : 'offline',
        lastBrowserContact: lastBrowserContact ? nowIso() : null,
        queued: queue.length,
        commandsRun,
        pollCount: browserPollCount,
        tokenRequired: Boolean(TOKEN),
        hint: 'Open VoxelForge → Publish → AI control → Start bridge, then call the MCP tools.',
      });
      return;
    }

    if (!authorised(req)) {
      sendJson(res, 401, { ok: false, message: 'Missing or invalid x-voxelforge-token header.' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/poll') {
      lastBrowserContact = Date.now();
      browserPollCount += 1;
      const command = queue.shift();
      if (!command) {
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      sendJson(res, 200, { command });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/result') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body || typeof body.id !== 'string') {
        sendJson(res, 400, { ok: false, message: 'A result needs a command id.' });
        return;
      }
      lastBrowserContact = Date.now();
      const found = resolveCommand(body.id, {
        ok: body.ok !== false,
        message: typeof body.message === 'string' ? body.message : body.ok === false ? 'Command failed.' : 'OK',
        data: body.data,
      });
      sendJson(res, found ? 200 : 404, { ok: found, message: found ? 'Result delivered.' : 'Unknown or expired command id.' });
      return;
    }

    // Handy for scripts, curl and non-MCP automation. Waits for the browser.
    if (req.method === 'POST' && url.pathname === '/command') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const type = typeof body.type === 'string' ? body.type : '';
      if (!type) {
        sendJson(res, 400, { ok: false, message: 'Provide a command "type".' });
        return;
      }
      try {
        const result = await dispatch(type, body.payload && typeof body.payload === 'object' ? body.payload : {});
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 503, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    sendJson(res, 404, { ok: false, message: 'Not found.' });
  } catch (error) {
    log('HTTP error:', error instanceof Error ? error.stack || error.message : String(error));
    if (!res.headersSent) sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  log(`HTTP bridge listening on http://${HOST}:${PORT}${TOKEN ? ' (token required)' : ''}`);
  log('Waiting for the browser bridge. Start it in VoxelForge → Publish → AI control.');
});

// ---------------------------------------------------------------------------
// MCP stdio server (newline-delimited JSON-RPC 2.0)
// ---------------------------------------------------------------------------

const tool = (name, description, schema, handler) => ({ name, description, schema, handler });

const DEFAULT_SCHEMA = { type: 'object', additionalProperties: true };

const TOOLS = [
  tool(
    'voxelforge_state',
    'Read the running game: player position, health, inventory, camera, vehicle, objectives and script status.',
    { type: 'object', properties: {} },
    () => dispatch('state'),
  ),
  tool(
    'voxelforge_list',
    'List VoxelForge content. Use kind = templates, items, blocks, prefabs, entities, cameras or commands.',
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['templates', 'items', 'blocks', 'prefabs', 'entities', 'cameras', 'commands'] },
      },
      required: ['kind'],
    },
    (args) => dispatch('list', { kind: args.kind }),
  ),
  tool(
    'voxelforge_launch',
    'Launch a built-in game template from scratch. Keys: creative, survival, skyblock, parkour, arena, rpg, horror, dungeon, racing, army, city, platformer.',
    { type: 'object', properties: { template: { type: 'string' } }, required: ['template'] },
    (args) => dispatch('launch', { template: args.template }),
  ),
  tool(
    'voxelforge_camera',
    'Switch camera: first, third, isometric, top-down or side. Set cycle=true to advance to the next mode.',
    {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['first', 'third', 'isometric', 'top-down', 'side', 'next'] },
        cycle: { type: 'boolean' },
      },
    },
    (args) => dispatch('camera', { mode: args.mode, cycle: args.cycle }),
  ),
  tool(
    'voxelforge_vehicle',
    'Enter or exit the kart/car. style is kart or car; omit enabled to toggle.',
    { type: 'object', properties: { enabled: { type: 'boolean' }, style: { type: 'string', enum: ['kart', 'car'] } } },
    (args) => dispatch('vehicle', { enabled: args.enabled, style: args.style }),
  ),
  tool(
    'voxelforge_teleport',
    'Teleport the player to a world position.',
    { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] },
    (args) => dispatch('teleport', { x: args.x, y: args.y, z: args.z }),
  ),
  tool(
    'voxelforge_look',
    'Set the player look direction. Yaw and pitch are radians.',
    { type: 'object', properties: { yaw: { type: 'number' }, pitch: { type: 'number' } } },
    (args) => dispatch('look', { yaw: args.yaw, pitch: args.pitch }),
  ),
  tool(
    'voxelforge_give',
    'Give the player an item. Use voxelforge_list kind=items for keys.',
    { type: 'object', properties: { item: { type: 'string' }, count: { type: 'integer', minimum: 1 } }, required: ['item'] },
    (args) => dispatch('give', { item: args.item, count: args.count }),
  ),
  tool(
    'voxelforge_spawn',
    'Spawn an entity at a world position. Entity keys look like human:soldier_rifle or creature:zombie.',
    {
      type: 'object',
      properties: {
        entity: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        name: { type: 'string' },
        behavior: { type: 'string' },
      },
      required: ['entity'],
    },
    (args) => dispatch('spawn', { entity: args.entity, x: args.x, y: args.y, z: args.z, name: args.name, behavior: args.behavior }),
  ),
  tool(
    'voxelforge_set_time',
    'Set the sky hour (0–23.99).',
    { type: 'object', properties: { hour: { type: 'number', minimum: 0, maximum: 23.99 } }, required: ['hour'] },
    (args) => dispatch('time', { hour: args.hour }),
  ),
  tool(
    'voxelforge_set_weather',
    'Set weather: clear, rain, snow or ash.',
    { type: 'object', properties: { weather: { type: 'string', enum: ['clear', 'rain', 'snow', 'ash'] } }, required: ['weather'] },
    (args) => dispatch('weather', { weather: args.weather }),
  ),
  tool(
    'voxelforge_run_script',
    'Replace and run VoxelScript text. Functions include say, give, spawn, camera, vehicle, time, weather, win, lose, teleport, sound, effect, objective, rule, boost, setVar, onStart, onTick, onEvent, every. Use player.vehicle and player.x/y/z for read-only state.',
    { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] },
    (args) => dispatch('scripts.run', { source: args.source }),
  ),
  tool(
    'voxelforge_get_scripts',
    'Read the current script project (visual rules, VoxelScript source, variables, enabled flag).',
    { type: 'object', properties: {} },
    () => dispatch('scripts.get'),
  ),
  tool(
    'voxelforge_set_rule',
    'Toggle a world rule, for example keepInventory, mobSpawning, dayCycle, hunger, fallDamage, blockBreaking, blockPlacing.',
    { type: 'object', properties: { rule: { type: 'string' }, value: { type: 'boolean' } }, required: ['rule', 'value'] },
    (args) => dispatch('rule', { rule: args.rule, value: args.value }),
  ),
  tool(
    'voxelforge_set_objective',
    'Set objective progress. Use voxelforge_state to discover objective ids.',
    { type: 'object', properties: { id: { type: 'string' }, progress: { type: 'number' } }, required: ['id', 'progress'] },
    (args) => dispatch('objective', { id: args.id, progress: args.progress }),
  ),
  tool(
    'voxelforge_set_block',
    'Place or erase a single block. Use "air" to erase; world coordinates are absolute.',
    {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, block: { type: 'string' } },
      required: ['x', 'y', 'z', 'block'],
    },
    (args) => dispatch('block', { x: args.x, y: args.y, z: args.z, block: args.block }),
  ),
  tool(
    'voxelforge_stamp_prefab',
    'Stamp a whole prefab into the world at a position. Use voxelforge_list kind=prefabs for keys.',
    {
      type: 'object',
      properties: { prefab: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
      required: ['prefab', 'x', 'z'],
    },
    (args) => dispatch('prefab', { prefab: args.prefab, x: args.x, y: args.y, z: args.z }),
  ),
  tool(
    'voxelforge_entities',
    'List living entities, optionally filtered by key, with positions, health and behaviour.',
    { type: 'object', properties: { entity: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 500 } } },
    (args) => dispatch('entities', { entity: args.entity, limit: args.limit }),
  ),
  tool(
    'voxelforge_export',
    'Export the current world as a fresh-start project JSON (does not download anything).',
    { type: 'object', properties: { name: { type: 'string' } } },
    (args) => dispatch('export', { name: args.name }),
  ),
  tool(
    'voxelforge_publish',
    'Build a standalone package and start a download in the browser. target: web, desktop, android or ios.',
    {
      type: 'object',
      properties: { target: { type: 'string', enum: ['web', 'desktop', 'android', 'ios'] }, name: { type: 'string' } },
      required: ['target'],
    },
    (args) => dispatch('publish', { target: args.target, name: args.name }),
  ),
  tool(
    'voxelforge_open_panel',
    'Open an in-game panel: studio, scripts, publish or inventory.',
    { type: 'object', properties: { panel: { type: 'string', enum: ['studio', 'scripts', 'publish', 'inventory'] } }, required: ['panel'] },
    (args) => dispatch('open', { panel: args.panel }),
  ),
  tool(
    'voxelforge_command',
    'Escape hatch: send any VoxelForge command by type with a JSON payload. Types include save, pause, toast, state, scripts.set, block, prefab, export, publish.',
    { type: 'object', properties: { type: { type: 'string' }, payload: { type: 'object' } }, required: ['type'] },
    (args) => dispatch(args.type, args.payload && typeof args.payload === 'object' ? args.payload : {}),
  ),
];

function toolList() {
  return TOOLS.map((entry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: entry.schema || DEFAULT_SCHEMA,
  }));
}

function writeRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  if (id === undefined || id === null) return;
  writeRpc({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message, data) {
  if (id === undefined || id === null) return;
  writeRpc({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
}

async function callTool(name, args) {
  const entry = TOOLS.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Unknown VoxelForge tool "${name}".`);
  const result = await entry.handler(args || {});
  const ok = result?.ok !== false;
  const text = JSON.stringify(result ?? { ok: true }, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: result,
    isError: !ok,
  };
}

async function handleRpc(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    replyError(message?.id, -32600, 'Invalid JSON-RPC request.');
    return;
  }
  const { id, method, params } = message;
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'voxelforge', version: VERSION },
        instructions:
          'VoxelForge controls a live voxel game in the browser. Start the bridge in Publish → AI control first. Read voxelforge_state before editing, and use voxelforge_list to discover content keys.',
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'initialized') return;
    if (method === 'ping') {
      reply(id, {});
      return;
    }
    if (method === 'tools/list') {
      reply(id, { tools: toolList() });
      return;
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        reply(id, await callTool(name, args));
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        reply(id, { content: [{ type: 'text', text: messageText }], isError: true });
      }
      return;
    }
    if (method === 'resources/list') {
      reply(id, { resources: [] });
      return;
    }
    if (method === 'prompts/list') {
      reply(id, { prompts: [] });
      return;
    }
    replyError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    replyError(id, -32603, error instanceof Error ? error.message : String(error));
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    replyError(null, -32700, 'Invalid JSON.');
    return;
  }
  if (Array.isArray(message)) {
    for (const item of message) void handleRpc(item);
  } else {
    void handleRpc(message);
  }
});

if (HTTP_ONLY) {
  rl.close();
  log('HTTP-only mode: MCP stdio disabled. Use the HTTP API or restart without --http-only.');
} else {
  rl.on('close', () => {
    log('stdin closed; shutting down.');
    server.close(() => process.exit(0));
  });
}

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('unhandledRejection', (reason) => {
  log('unhandled rejection:', reason instanceof Error ? reason.stack || reason.message : String(reason));
});
