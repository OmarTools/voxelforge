/**
 * VoxelForge multiplayer server — invite rooms + persistent shared world.
 *
 * What this server owns today:
 *   - room creation and join-by-code (in-memory, host-owned)
 *   - one optional shared world (persistent, server-owned, no code)
 *   - the authoritative world descriptor (seed / baseY / edits)
 *   - presence, movement relay and 12 Hz snapshots
 *   - chat, room settings and host controls
 *   - basic block-edit validation (reach + id range)
 *
 * What it does not own yet: full block/entity simulation. Movement is
 * client-simulated and server-relayed until the headless core split lands.
 * See docs/multiplayer.md for the staged plan.
 */
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { loadWorldRecord, saveWorldRecord } from './world-store.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const PROTOCOL = 1;
const SERVER_VERSION = '0.3.0';
const MAX_PLAYERS = 8;
const MAX_EDITS = 200_000;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_HZ = 12;
const AUTOSAVE_MS = 30 * 1000;
const MAX_NAME = 20;
const MAX_CHAT = 180;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

/** `rooms` (default), `open`, or `both`. `--open` is a shortcut for open-only. */
function parseModes(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return process.argv.includes('--open') ? new Set(['open']) : new Set(['rooms']);
  if (value === 'both' || value === 'all') return new Set(['rooms', 'open']);
  const modes = new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
  for (const mode of modes) {
    if (mode !== 'rooms' && mode !== 'open') {
      console.warn(`[net] ignoring unknown mode "${mode}"`);
      modes.delete(mode);
    }
  }
  if (!modes.size) modes.add('rooms');
  return modes;
}

const MODES = parseModes(process.env.MODES);
const OPEN_WORLD_FILE = path.resolve(process.env.WORLD_FILE || 'data/worlds/open.json');
const WORLD_BACKUPS = Math.max(0, Number(process.env.WORLD_BACKUPS ?? 8) || 0);
/** Optional shared-world gate. Both are operator secrets, never sent to clients. */
const OPEN_PASSWORD = String(process.env.OPEN_PASSWORD ?? '');
const OPEN_ALLOWLIST = new Set(
  String(process.env.OPEN_ALLOWLIST ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);
/** When set, a client may claim operator rights with this token. */
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN ?? '');
/** Operator names resolved at join time would be spoofable, so ops are per session. */
const OPEN_ACCESS = { locked: OPEN_PASSWORD.length > 0, private: OPEN_ALLOWLIST.size > 0 };

const startedAt = Date.now();
const rooms = new Map();
const joinFails = new Map();
/** The one shared world, when `open` mode is enabled. Never in `rooms`. */
let openRoom = null;
let saveChain = Promise.resolve();
let consoleInput = null;
let shuttingDown = false;

const ROOM_WORDS = [
  'CINDER', 'FORGE', 'EMBER', 'TITAN', 'RUNE', 'FROST', 'MAGMA', 'VAULT',
  'HOLLOW', 'CROWN', 'ASHEN', 'GLIMMER', 'STORM', 'WILLOW', 'BEACON', 'GRAVEL',
  'ORBIT', 'PIXEL', 'QUARTZ', 'RIVER', 'SOLAR', 'THORN', 'UMBRA', 'VALE',
];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomId() {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

function randomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const word = ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const code = `${word}-${suffix}`;
    if (!rooms.has(code)) return code;
  }
  return `ROOM-${randomId().slice(0, 4).toUpperCase()}`;
}

function normalizeName(input, fallback = 'Wanderer') {
  const clean = String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, MAX_NAME);
}

function sanitizeChatText(input) {
  return String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
}

function clampNumber(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSettings(input, current = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    pvp: typeof src.pvp === 'boolean' ? src.pvp : current.pvp ?? false,
    friendlyFire: typeof src.friendlyFire === 'boolean' ? src.friendlyFire : current.friendlyFire ?? true,
    keepInventory: typeof src.keepInventory === 'boolean' ? src.keepInventory : current.keepInventory ?? true,
    difficulty: src.difficulty === 'hard' ? 'hard' : src.difficulty === 'normal' ? 'normal' : current.difficulty ?? 'normal',
    maxPlayers: Math.round(clampNumber(src.maxPlayers ?? current.maxPlayers ?? MAX_PLAYERS, 2, MAX_PLAYERS, MAX_PLAYERS)),
  };
}

function sanitizeRules(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'boolean' || typeof value === 'number') out[key] = value;
  }
  return out;
}

function sanitizeWorld(input) {
  if (!input || typeof input !== 'object') return null;
  const templateKey = String(input.templateKey ?? '').slice(0, 40);
  const templateName = String(input.templateName ?? '').slice(0, 80);
  const seed = Math.trunc(Number(input.seed));
  const baseY = Math.trunc(Number(input.baseY));
  const skyTime = clampNumber(input.skyTime, 0, 24, 12);
  if (!templateKey || !templateName || !Number.isFinite(seed) || !Number.isFinite(baseY)) return null;
  if (baseY < 0 || baseY > 255) return null;
  const spawnRaw = Array.isArray(input.spawn) ? input.spawn : [0.5, baseY + 2, 0.5];
  const spawn = [
    clampNumber(spawnRaw[0], -1e6, 1e6, 0.5),
    clampNumber(spawnRaw[1], 0, 255, baseY + 2),
    clampNumber(spawnRaw[2], -1e6, 1e6, 0.5),
  ];
  const edits = [];
  if (Array.isArray(input.edits)) {
    for (const entry of input.edits) {
      if (!Array.isArray(entry) || entry.length < 4) continue;
      const x = Math.trunc(Number(entry[0]));
      const y = Math.trunc(Number(entry[1]));
      const z = Math.trunc(Number(entry[2]));
      const id = Math.trunc(Number(entry[3]));
      if (![x, y, z, id].every(Number.isFinite)) continue;
      if (y < 0 || y > 255 || id < 0 || id > 255) continue;
      if (Math.abs(x) > 1e6 || Math.abs(z) > 1e6) continue;
      edits.push([x, y, z, id]);
      if (edits.length >= MAX_EDITS) break;
    }
  }
  return {
    templateKey,
    templateName,
    seed,
    baseY,
    skyTime,
    rules: sanitizeRules(input.rules),
    spawn,
    edits,
  };
}

function send(client, message) {
  if (client.ws.readyState !== 1) return;
  try {
    client.ws.send(JSON.stringify(message));
  } catch {
    /* socket is already gone */
  }
}

function fail(client, code, message) {
  send(client, { t: 'error', code, message });
}

function broadcast(room, message, except = null) {
  for (const player of room.players.values()) {
    if (player === except) continue;
    send(player, message);
  }
}

function systemChat(text) {
  return { t: 'chat', from: 'server', name: 'Server', text, at: Date.now(), system: true };
}

/** System chat only to one client (command feedback, not room chatter). */
function note(client, text) {
  send(client, systemChat(text));
}

function isOp(client) {
  return client.op === true;
}

function digest(value) {
  return createHash('sha256').update(String(value ?? '')).digest();
}

function secretMatches(input, expected) {
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected));
}

/** Shared gate for genesis and preflight checks. Failed attempts share the join limiter. */
function gateOpenAccess(ip, name, password) {
  if (OPEN_ALLOWLIST.size && !OPEN_ALLOWLIST.has(name.toLowerCase())) {
    noteJoinFailure(ip);
    return { code: 'not_allowlisted', message: 'This shared world is private.' };
  }
  if (OPEN_PASSWORD && !secretMatches(password, OPEN_PASSWORD)) {
    noteJoinFailure(ip);
    return { code: 'bad_password', message: 'That shared-world password is wrong.' };
  }
  return null;
}

function formatClock(hour) {
  const total = Math.round((((hour % 24) + 24) % 24) * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Find one connected player by display name across every room. */
function findPlayer(rawName) {
  const wanted = normalizeName(rawName).toLowerCase();
  if (!wanted) return null;
  for (const room of allRooms()) {
    for (const player of room.players.values()) {
      if (player.name.toLowerCase() === wanted) return { room, player };
    }
  }
  return null;
}

/** Prefer the caller's room so duplicate names elsewhere cannot shadow a kick. */
function findPlayerInRoom(room, rawName) {
  const wanted = normalizeName(rawName).toLowerCase();
  if (!wanted) return null;
  for (const player of room.players.values()) {
    if (player.name.toLowerCase() === wanted) return player;
  }
  return null;
}

function setOp(player, room, op, by) {
  player.op = op;
  send(player, { t: 'op', op, by });
  if (room) {
    broadcast(room, systemChat(op ? `${player.name} is now an operator (${by}).` : `${player.name} is no longer an operator.`));
  }
}

/** Remove a player from a room and close their socket without touching the room. */
function evict(room, target, reason, byName) {
  target.room = null;
  room.players.delete(target.id);
  room.lastActive = Date.now();
  send(target, { t: 'room_closed', reason });
  target.ws.close(4001, 'kicked');
  broadcast(room, { t: 'player_left', playerId: target.id, name: target.name });
  broadcast(room, systemChat(`${target.name} was removed by ${byName}.`));
  if (room.players.size === 0 && room.open) void saveSharedWorld(room, 'empty');
}

function roomPlayers(room) {
  return [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    host: room.hostId === player.id,
    op: isOp(player),
    x: player.last.x,
    y: player.last.y,
    z: player.last.z,
    yaw: player.last.yaw,
    pitch: player.last.pitch,
    moving: player.last.moving,
  }));
}

function roomInfo(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    templateKey: room.world.templateKey,
    templateName: room.world.templateName,
    createdAt: room.createdAt,
    settings: room.settings,
  };
}

function spawnFor(room, slot) {
  const [x, y, z] = room.world.spawn;
  if (slot === 0) return [x, y + 0.02, z];
  const angle = slot * 2.399963229728653;
  const radius = 1.5 + (slot % 3) * 0.45;
  return [x + Math.cos(angle) * radius, y + 0.02, z + Math.sin(angle) * radius];
}

function roomWorld(room) {
  return {
    templateKey: room.world.templateKey,
    templateName: room.world.templateName,
    seed: room.world.seed,
    baseY: room.world.baseY,
    skyTime: room.world.skyTime,
    rules: room.world.rules,
    spawn: room.world.spawn,
    edits: [...room.edits.values()],
  };
}

// ------------------------------------------------------------ shared world

const OPEN_CODE = 'SHARED';

function makeOpenRoom(world, settings, createdAt = Date.now()) {
  const room = {
    code: OPEN_CODE,
    hostId: null,
    open: true,
    createdAt,
    lastActive: Date.now(),
    tick: 0,
    settings,
    world,
    players: new Map(),
    edits: new Map(),
    revision: 0,
    savedRevision: 0,
    dirty: false,
    savedAt: 0,
  };
  for (const [x, y, z, id] of world.edits) room.edits.set(`${x},${y},${z}`, [x, y, z, id]);
  return room;
}

function worldRecord(room) {
  return {
    version: 1,
    savedAt: Date.now(),
    createdAt: room.createdAt,
    world: {
      templateKey: room.world.templateKey,
      templateName: room.world.templateName,
      seed: room.world.seed,
      baseY: room.world.baseY,
      skyTime: room.world.skyTime,
      rules: room.world.rules,
      spawn: room.world.spawn,
    },
    settings: room.settings,
    edits: [...room.edits.values()],
  };
}

function saveSharedWorld(room, reason, force = false) {
  if (!room.open) return Promise.resolve();
  room.dirty = true;
  const revision = room.revision;
  saveChain = saveChain.then(async () => {
    if (!force && revision <= room.savedRevision) return;
    try {
      await saveWorldRecord(OPEN_WORLD_FILE, worldRecord(room), { backups: WORLD_BACKUPS });
      room.savedRevision = Math.max(room.savedRevision, revision);
      room.savedAt = Date.now();
      room.dirty = room.revision > room.savedRevision;
      console.log(`[net] shared world saved (${reason}) · ${room.edits.size} edits`);
    } catch (error) {
      room.dirty = true;
      console.error('[net] shared world save failed', error);
    }
  });
  return saveChain;
}

async function loadSharedWorld() {
  if (!MODES.has('open')) return;
  let record;
  try {
    record = await loadWorldRecord(OPEN_WORLD_FILE);
  } catch (error) {
    console.error(`[net] could not read ${OPEN_WORLD_FILE}; starting a fresh shared world`, error);
    return;
  }
  if (!record) {
    console.log(`[net] shared world: no save yet; the first player starts one`);
    return;
  }
  const world = sanitizeWorld({ ...(record.world || {}), edits: record.edits });
  if (!world) {
    console.warn('[net] shared world save is invalid; starting a fresh shared world');
    return;
  }
  openRoom = makeOpenRoom(world, sanitizeSettings(record.settings), Number(record.createdAt) || Date.now());
  openRoom.savedAt = Number(record.savedAt) || 0;
  console.log(`[net] shared world loaded: ${world.templateKey} (seed ${world.seed}, ${world.edits.length} edits)`);
}

function allRooms() {
  return openRoom ? [...rooms.values(), openRoom] : [...rooms.values()];
}


function joinRoom(room, client, name) {
  const slot = room.players.size;
  const spawn = spawnFor(room, slot);
  client.name = normalizeName(name, `Wanderer-${client.id.slice(0, 3)}`);
  client.room = room;
  client.last = { x: spawn[0], y: spawn[1], z: spawn[2], yaw: 0, pitch: 0, moving: false, seq: 0 };
  client.lastInputAt = Date.now();
  room.players.set(client.id, client);
  room.lastActive = Date.now();

  send(client, {
    t: 'room_joined',
    room: roomInfo(room),
    you: { id: client.id, name: client.name, host: room.hostId === client.id, op: isOp(client), spawn, yaw: 0 },
    world: roomWorld(room),
    players: roomPlayers(room),
  });
  return spawn;
}

function detach(client) {
  const room = client.room;
  if (!room) return;
  client.room = null;
  room.players.delete(client.id);
  room.lastActive = Date.now();
  if (room.players.size === 0) {
    if (room.open) void saveSharedWorld(room, 'empty');
    return;
  }
  broadcast(room, { t: 'player_left', playerId: client.id, name: client.name });
  broadcast(room, {
    t: 'chat',
    from: 'server',
    name: 'Server',
    text: `${client.name} left the room.`,
    at: Date.now(),
    system: true,
  });
}

function closeRoom(room, reason) {
  for (const player of room.players.values()) {
    send(player, { t: 'room_closed', reason });
    player.room = null;
  }
  room.players.clear();
  rooms.delete(room.code);
  console.log(`[net] room ${room.code} closed: ${reason}`);
}

function findRoom(rawCode) {
  const code = String(rawCode ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return null;
  const exact = rooms.get(code);
  if (exact) return exact;
  for (const room of rooms.values()) {
    if (room.code.endsWith(`-${code}`)) return room;
  }
  return null;
}

function announceJoin(room, client) {
  broadcast(room, { t: 'player_joined', player: roomPlayers(room).find((p) => p.id === client.id) }, client);
  broadcast(room, {
    t: 'chat',
    from: 'server',
    name: 'Server',
    text: `${client.name} joined ${room.open ? 'the shared world' : 'the room'}.`,
    at: Date.now(),
    system: true,
  }, client);
}

// ---------------------------------------------------------------- commands

function setSharedTime(room, value) {
  room.world.skyTime = value;
  room.revision = (room.revision || 0) + 1;
  room.dirty = true;
  room.lastActive = Date.now();
  broadcast(room, { t: 'time', value });
}

/** Chat commands — available to operators, politely refused for everyone else. */
function handleCommand(client, room, text) {
  const body = text.replace(/^\//, '').trim();
  const [rawName, ...rest] = body.split(/\s+/);
  const command = (rawName || '').toLowerCase();
  const args = rest.join(' ').trim();
  if (!command) return;
  if (command === 'help') {
    note(
      client,
      isOp(client)
        ? 'Commands: /kick <name> [reason] · /time <0-24> · /save · /say <text> · /op <name> · /deop <name>'
        : 'Only operators can run commands. Ask the server owner for operator rights.',
    );
    return;
  }
  if (!isOp(client)) {
    note(client, `Unknown command /${command}. Only operators can run commands here.`);
    return;
  }

  if (command === 'kick') {
    const [targetName, ...reason] = args.split(/\s+/);
    const target = targetName ? findPlayerInRoom(room, targetName) : null;
    if (!target) return note(client, 'No player with that name is in this room.');
    if (target === client) return note(client, 'You cannot kick yourself.');
    evict(room, target, reason.join(' ') || 'You were removed by an operator.', client.name);
    return;
  }

  if (command === 'time') {
    if (!room.open) return note(client, 'Time control applies to the shared world only.');
    const value = Number(args);
    if (!Number.isFinite(value)) return note(client, 'Usage: /time <0-24>');
    setSharedTime(room, Math.max(0, Math.min(23.99, value)));
    broadcast(room, systemChat(`${client.name} set the time to ${formatClock(room.world.skyTime)}.`));
    console.log(`[net] ${client.name} set the shared-world time to ${formatClock(room.world.skyTime)}`);
    return;
  }

  if (command === 'save') {
    if (!room.open) return note(client, 'Only the shared world is saved to disk.');
    void saveSharedWorld(room, 'command', true).then(() => note(client, `Saved the shared world (${room.edits.size} edits).`));
    return;
  }

  if (command === 'say') {
    if (!args) return note(client, 'Usage: /say <text>');
    broadcast(room, systemChat(`${client.name}: ${args}`));
    return;
  }

  if (command === 'op' || command === 'deop') {
    // Room-scoped like /kick: a duplicate name in another room must not be granted
    // operator rights by someone who cannot see them. The console remains global.
    const found = args ? findPlayerInRoom(room, args) : null;
    if (!found) return note(client, 'No player with that name is in this room.');
    const op = command === 'op';
    if (found.op === op) return note(client, `${found.name} is ${op ? 'already' : 'not'} an operator.`);
    setOp(found, room, op, client.name);
    console.log(`[net] ${client.name} ${op ? 'granted' : 'revoked'} operator rights for ${found.name}`);
    return;
  }

  note(client, `Unknown command /${command}. Try /help.`);
}

// ----------------------------------------------------------- operator console

function consoleStatus() {
  const shared = openRoom
    ? `shared world: ${openRoom.world.templateName} · ${openRoom.players.size}/${openRoom.settings.maxPlayers} players · ${openRoom.edits.size} edits${openRoom.dirty ? ' · unsaved' : ''}`
    : 'shared world: not created';
  console.log(`[net]   ${shared}`);
  for (const room of allRooms()) {
    if (!room.players.size) continue;
    const names = [...room.players.values()].map(
      (player) => `${player.name}${player.op ? ' (op)' : ''}${player.id === room.hostId ? ' (host)' : ''}`,
    );
    console.log(`[net]   ${room.code}: ${names.join(', ')}`);
  }
}

function handleConsoleLine(line) {
  const body = String(line ?? '').replace(/^\//, '').trim();
  if (!body) return;
  const [rawName, ...rest] = body.split(/\s+/);
  const command = rawName.toLowerCase();
  const args = rest.join(' ').trim();
  if (command === 'help') {
    console.log('[net] console: help · status · say <text> · kick <name> [reason] · op <name> · deop <name> · save · time <0-24> · quit');
    return;
  }
  if (command === 'status' || command === 'players') {
    consoleStatus();
    return;
  }
  if (command === 'say') {
    if (!args) return console.log('[net] usage: say <text>');
    for (const room of allRooms()) broadcast(room, systemChat(args));
    console.log(`[net] said: ${args}`);
    return;
  }
  if (command === 'kick') {
    const [targetName, ...reason] = args.split(/\s+/);
    const found = targetName ? findPlayer(targetName) : null;
    if (!found) return console.log(`[net] no player named ${targetName || '(missing)'}`);
    evict(found.room, found.player, reason.join(' ') || 'You were removed by the server operator.', 'the server operator');
    console.log(`[net] kicked ${found.player.name} from ${found.room.code}`);
    return;
  }
  if (command === 'op' || command === 'deop') {
    const found = args ? findPlayer(args) : null;
    if (!found) return console.log(`[net] no player named ${args || '(missing)'}`);
    const op = command === 'op';
    setOp(found.player, found.room, op, 'server console');
    console.log(`[net] ${op ? 'granted' : 'revoked'} operator rights for ${found.player.name}`);
    return;
  }
  if (command === 'save') {
    if (!openRoom) return console.log('[net] no shared world to save');
    void saveSharedWorld(openRoom, 'console', true).then(() => console.log('[net] shared world saved'));
    return;
  }
  if (command === 'time') {
    if (!openRoom) return console.log('[net] time control needs an open shared world');
    const value = Number(args);
    if (!Number.isFinite(value)) return console.log('[net] usage: time <0-24>');
    setSharedTime(openRoom, Math.max(0, Math.min(23.99, value)));
    broadcast(openRoom, systemChat(`The operator set the time to ${formatClock(openRoom.world.skyTime)}.`));
    console.log(`[net] shared-world time set to ${formatClock(openRoom.world.skyTime)}`);
    return;
  }
  if (command === 'quit' || command === 'exit') {
    void shutdown('console');
    return;
  }
  console.log(`[net] unknown console command "${command}" — type help`);
}

function allowJoinAttempt(ip) {
  const now = Date.now();
  const times = (joinFails.get(ip) || []).filter((at) => now - at < 60_000);
  joinFails.set(ip, times);
  return times.length < 5;
}

function noteJoinFailure(ip) {
  const times = (joinFails.get(ip) || []).filter((at) => Date.now() - at < 60_000);
  times.push(Date.now());
  joinFails.set(ip, times);
}

function handleMessage(client, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return fail(client, 'bad_json', 'Malformed message.');
  }
  if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;

  if (message.t === 'hello') {
    if (Number(message.protocol) !== PROTOCOL) {
      fail(client, 'bad_protocol', `Server speaks protocol ${PROTOCOL}; reload the game.`);
      client.ws.close(4002, 'protocol');
      return;
    }
    client.hello = true;
    client.name = normalizeName(message.name, `Wanderer-${client.id.slice(0, 3)}`);
    send(client, {
      t: 'hello',
      protocol: PROTOCOL,
      version: SERVER_VERSION,
      playerId: client.id,
      serverTime: Date.now(),
      modes: [...MODES],
      openAccess: OPEN_ACCESS,
      admin: ADMIN_TOKEN.length > 0,
      openWorld: openRoom
        ? {
            templateKey: openRoom.world.templateKey,
            templateName: openRoom.world.templateName,
            players: openRoom.players.size,
            edits: openRoom.edits.size,
            locked: OPEN_ACCESS.locked,
            private: OPEN_ACCESS.private,
          }
        : null,
    });
    return;
  }

  if (!client.hello) return fail(client, 'no_hello', 'Send hello first.');

  if (message.t === 'ping') {
    send(client, { t: 'pong', at: Number(message.at) || 0, serverTime: Date.now() });
    return;
  }

  if (message.t === 'create_room') {
    if (!MODES.has('rooms')) return fail(client, 'mode_disabled', 'This server hosts a shared world, not invite rooms.');
    if (client.room) return fail(client, 'already_in_room', 'You are already in a room.');
    const world = sanitizeWorld(message.world);
    if (!world) return fail(client, 'invalid_world', 'The world descriptor is invalid.');
    const settings = sanitizeSettings(message.settings);
    const code = randomCode();
    const room = {
      code,
      hostId: client.id,
      createdAt: Date.now(),
      lastActive: Date.now(),
      tick: 0,
      settings,
      world,
      players: new Map(),
      edits: new Map(),
    };
    for (const [x, y, z, id] of world.edits) room.edits.set(`${x},${y},${z}`, [x, y, z, id]);
    rooms.set(code, room);
    joinRoom(room, client, message.name || client.name);
    console.log(`[net] room ${code} created by ${client.name} (${world.templateKey}, ${world.edits.length} edits)`);
    return;
  }

  if (message.t === 'join_room') {
    if (!MODES.has('rooms')) return fail(client, 'mode_disabled', 'This server hosts a shared world, not invite rooms.');
    if (client.room) return fail(client, 'already_in_room', 'You are already in a room.');
    const ip = client.ip;
    if (!allowJoinAttempt(ip)) return fail(client, 'rate_limited', 'Too many failed room codes. Wait a minute.');
    const room = findRoom(message.code);
    if (!room) {
      noteJoinFailure(ip);
      return fail(client, 'room_not_found', 'No room with that code.');
    }
    if (room.players.size >= room.settings.maxPlayers) {
      return fail(client, 'room_full', 'That room is full.');
    }
    joinRoom(room, client, message.name || client.name);
    announceJoin(room, client);
    console.log(`[net] ${client.name} joined ${room.code} (${room.players.size}/${room.settings.maxPlayers})`);
    return;
  }

  if (message.t === 'check_open') {
    if (!MODES.has('open')) return fail(client, 'mode_disabled', 'This server does not host a shared world.');
    if (!allowJoinAttempt(client.ip)) return fail(client, 'rate_limited', 'Too many failed joins. Wait a minute.');
    const name = normalizeName(message.name || client.name);
    const denied = gateOpenAccess(client.ip, name, message.password);
    if (denied) return fail(client, denied.code, denied.message);
    send(client, { t: 'open_ok', locked: OPEN_ACCESS.locked, private: OPEN_ACCESS.private });
    return;
  }

  if (message.t === 'join_open') {
    if (client.room) return fail(client, 'already_in_room', 'You are already in a room.');
    if (!MODES.has('open')) return fail(client, 'mode_disabled', 'This server does not host a shared world.');
    const ip = client.ip;
    if (!allowJoinAttempt(ip)) return fail(client, 'rate_limited', 'Too many failed joins. Wait a minute.');
    const name = normalizeName(message.name || client.name);
    const denied = gateOpenAccess(ip, name, message.password);
    if (denied) return fail(client, denied.code, denied.message);
    if (!openRoom) {
      const world = sanitizeWorld(message.world);
      if (!world) return fail(client, 'world_missing', 'This server has no shared world yet. Start one from the lobby.');
      openRoom = makeOpenRoom(world, sanitizeSettings(message.settings));
      console.log(`[net] shared world created: ${world.templateKey} (seed ${world.seed}, ${world.edits.length} edits)`);
      void saveSharedWorld(openRoom, 'genesis', true);
    }
    if (openRoom.players.size >= openRoom.settings.maxPlayers) {
      return fail(client, 'room_full', 'The shared world is full.');
    }
    joinRoom(openRoom, client, name);
    announceJoin(openRoom, client);
    console.log(`[net] ${client.name} joined the shared world (${openRoom.players.size}/${openRoom.settings.maxPlayers})`);
    return;
  }

  if (message.t === 'op') {
    if (!ADMIN_TOKEN) return fail(client, 'admin_disabled', 'This server does not accept operator tokens.');
    if (!allowJoinAttempt(client.ip)) return fail(client, 'rate_limited', 'Too many failed tokens. Wait a minute.');
    if (!secretMatches(message.token, ADMIN_TOKEN)) {
      noteJoinFailure(client.ip);
      return fail(client, 'bad_token', 'Operator token rejected.');
    }
    client.op = true;
    send(client, { t: 'op', op: true, by: 'token' });
    if (client.room) broadcast(client.room, systemChat(`${client.name} signed in as an operator.`));
    console.log(`[net] ${client.name} claimed operator rights with the server token`);
    return;
  }

  if (message.t === 'input') {
    const room = client.room;
    if (!room) return;
    const now = Date.now();
    const minGap = 10;
    if (now - client.lastInputAt < minGap) return;
    const x = clampNumber(message.x, -1e6, 1e6, client.last.x);
    const y = clampNumber(message.y, 0, 255, client.last.y);
    const z = clampNumber(message.z, -1e6, 1e6, client.last.z);
    const yaw = clampNumber(message.yaw, -100, 100, client.last.yaw);
    const pitch = clampNumber(message.pitch, -10, 10, client.last.pitch);
    const dt = Math.max(0.02, (now - client.lastInputAt) / 1000);
    const horizontal = Math.hypot(x - client.last.x, z - client.last.z);
    // Generous anti-teleport guard; prediction/reconciliation replaces this later.
    if (horizontal / dt <= 18) {
      client.last.x = x;
      client.last.z = z;
    }
    client.last.y = y;
    client.last.yaw = yaw;
    client.last.pitch = pitch;
    client.last.moving = message.moving === true;
    client.last.seq = Math.trunc(Number(message.seq) || 0);
    client.lastInputAt = now;
    room.lastActive = now;
    return;
  }

  if (message.t === 'block') {
    const room = client.room;
    if (!room) return;
    const x = Math.trunc(Number(message.x));
    const y = Math.trunc(Number(message.y));
    const z = Math.trunc(Number(message.z));
    const id = Math.trunc(Number(message.id));
    if (![x, y, z, id].every(Number.isFinite)) return fail(client, 'bad_block', 'Invalid block coordinates.');
    if (y < 0 || y > 255) return fail(client, 'bad_block', 'Block is outside the world height.');
    if (id < 0 || id > 255) return fail(client, 'bad_block', 'Unknown block id.');
    const reach = Math.hypot(x + 0.5 - client.last.x, y + 0.5 - client.last.y, z + 0.5 - client.last.z);
    if (reach > 7.5) return fail(client, 'out_of_reach', 'Block is out of reach.');
    const key = `${x},${y},${z}`;
    if (room.edits.size >= MAX_EDITS && !room.edits.has(key)) {
      return fail(client, 'edit_limit', 'This room has reached its edit limit.');
    }
    if (room.edits.get(key)?.[3] === id) return;
    room.edits.set(key, [x, y, z, id]);
    room.revision = (room.revision || 0) + 1;
    if (room.open) room.dirty = true;
    room.lastActive = Date.now();
    broadcast(room, { t: 'block', x, y, z, id, from: client.id });
    return;
  }

  if (message.t === 'chat') {
    const room = client.room;
    if (!room) return;
    const now = Date.now();
    client.chatTimes = (client.chatTimes || []).filter((at) => now - at < 10_000);
    if (client.chatTimes.length >= 5) return fail(client, 'chat_rate', 'Slow down — 5 messages per 10 seconds.');
    const text = sanitizeChatText(message.text);
    if (!text) return;
    client.chatTimes.push(now);
    room.lastActive = now;
    if (text.startsWith('/')) {
      handleCommand(client, room, text);
      return;
    }
    broadcast(room, { t: 'chat', from: client.id, name: client.name, text, at: now });
    return;
  }

  if (message.t === 'settings') {
    const room = client.room;
    if (!room) return;
    if (room.open) return fail(client, 'open_readonly', 'Shared-world settings are managed by the server operator.');
    if (room.hostId !== client.id) return fail(client, 'not_host', 'Only the host can change room settings.');
    room.settings = sanitizeSettings(message.patch, room.settings);
    room.lastActive = Date.now();
    broadcast(room, { t: 'settings', settings: room.settings, by: client.id });
    return;
  }

  if (message.t === 'kick') {
    const room = client.room;
    if (!room) return;
    if (room.open && !isOp(client)) {
      return fail(client, 'open_readonly', 'Only an operator can remove players from the shared world.');
    }
    if (!room.open && room.hostId !== client.id) {
      return fail(client, 'not_host', 'Only the host can kick players.');
    }
    const target = room.players.get(String(message.playerId ?? ''));
    if (!target || target === client) return;
    evict(
      room,
      target,
      room.open ? 'You were removed by an operator.' : 'You were removed by the host.',
      room.open ? client.name : 'the host',
    );
    return;
  }

  if (message.t === 'leave') {
    detach(client);
    return;
  }
}

const server = http.createServer((req, res) => {
  const url = req.url ? new URL(req.url, 'http://localhost') : null;
  if (url?.pathname === '/health') {
    let players = 0;
    for (const room of allRooms()) players += room.players.size;
    const modes = [...MODES];
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({
      ok: true,
      protocol: PROTOCOL,
      version: SERVER_VERSION,
      modes,
      rooms: rooms.size,
      players,
      admin: ADMIN_TOKEN.length > 0,
      openAccess: OPEN_ACCESS,
      openWorld: openRoom
        ? {
            templateKey: openRoom.world.templateKey,
            templateName: openRoom.world.templateName,
            players: openRoom.players.size,
            edits: openRoom.edits.size,
            savedAt: openRoom.savedAt,
            locked: OPEN_ACCESS.locked,
            private: OPEN_ACCESS.private,
          }
        : null,
      uptime: Math.round((Date.now() - startedAt) / 1000),
    }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('VoxelForge multiplayer server. Connect with a WebSocket. GET /health for status.\n');
});

const wss = new WebSocketServer({
  server,
  maxPayload: 4 * 1024 * 1024,
  verifyClient: (info, done) => {
    if (!ALLOWED_ORIGINS.length) return done(true);
    const origin = info.origin || '';
    done(ALLOWED_ORIGINS.includes(origin), 403, 'Origin not allowed');
  },
});

wss.on('connection', (ws, req) => {
  const client = {
    id: randomId(),
    ws,
    ip: req.socket.remoteAddress || 'unknown',
    name: 'Wanderer',
    hello: false,
    op: false,
    room: null,
    last: { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, moving: false, seq: 0 },
    lastInputAt: Date.now(),
    chatTimes: [],
  };

  ws.on('message', (raw) => {
    try {
      handleMessage(client, raw);
    } catch (error) {
      console.error('[net] message handler failed', error);
      fail(client, 'server_error', 'The server could not process that message.');
    }
  });

  ws.on('close', () => {
    const room = client.room;
    if (!room) return;
    if (room.hostId === client.id) {
      closeRoom(room, 'The host left the room.');
      return;
    }
    detach(client);
  });

  ws.on('error', (error) => {
    console.warn('[net] socket error', error?.message || error);
  });
});

setInterval(() => {
  for (const room of allRooms()) {
    if (room.players.size === 0) continue;
    room.tick += 1;
    broadcast(room, { t: 'snapshot', tick: room.tick, players: roomPlayers(room) });
  }
}, Math.round(1000 / SNAPSHOT_HZ));

setInterval(() => {
  if (openRoom?.dirty) void saveSharedWorld(openRoom, 'autosave');
}, AUTOSAVE_MS);

setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (room.players.size === 0) {
      if (now - room.lastActive > ROOM_IDLE_MS) {
        rooms.delete(room.code);
        console.log(`[net] room ${room.code} expired after idle timeout`);
      }
      continue;
    }
    if (now - room.createdAt > ROOM_MAX_AGE_MS) closeRoom(room, 'Room reached its 24 hour lifetime.');
  }
  for (const [ip, times] of joinFails) {
    const fresh = times.filter((at) => now - at < 60_000);
    if (fresh.length) joinFails.set(ip, fresh);
    else joinFails.delete(ip);
  }
}, 60_000);

await loadSharedWorld();

server.listen(PORT, HOST, () => {
  const modes = [...MODES].join('+');
  console.log(`[net] VoxelForge multiplayer server v${SERVER_VERSION} on ws://${HOST}:${PORT} (${modes})`);
  console.log(`[net] health: http://127.0.0.1:${PORT}/health · protocol ${PROTOCOL}`);
  if (MODES.has('open')) {
    const access = [OPEN_ACCESS.locked ? 'password' : '', OPEN_ACCESS.private ? 'allowlist' : ''].filter(Boolean);
    console.log(`[net] shared world file: ${OPEN_WORLD_FILE}${access.length ? ` · access: ${access.join(' + ')}` : ''}`);
  }
  if (ADMIN_TOKEN) console.log('[net] operator token: enabled');
  console.log('[net] console: type help for operator commands');
});

consoleInput = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
consoleInput.on('line', (line) => {
  try {
    handleConsoleLine(line);
  } catch (error) {
    console.error('[net] console command failed', error);
  }
});
consoleInput.on('error', () => {});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[net] ${signal} received, closing`);
  try {
    consoleInput?.close();
  } catch {
    /* already closed */
  }
  if (openRoom) {
    await saveSharedWorld(openRoom, 'shutdown', true);
    for (const player of openRoom.players.values()) {
      send(player, { t: 'room_closed', reason: 'Server is shutting down.' });
      player.room = null;
    }
    openRoom.players.clear();
  }
  for (const room of [...rooms.values()]) closeRoom(room, 'Server is shutting down.');
  for (const client of wss.clients) client.close(1001, 'server shutdown');
  wss.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
