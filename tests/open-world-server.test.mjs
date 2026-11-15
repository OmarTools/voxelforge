import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'server', 'index.mjs');

function health(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('health timeout')));
  });
}

async function waitForHealth(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await health(port);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error('server did not start');
}

function startServer(port, worldFile) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MODES: 'open', WORLD_FILE: worldFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  return { child, output };
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 3000).unref();
  });
}

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    inbox.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.match(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    inbox,
    waitFor(match, timeoutMs = 5000) {
      const found = inbox.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`timed out waiting for message; saw ${inbox.map((m) => m.t).join(', ')}`));
        }, timeoutMs);
        const waiter = { match, resolve, timer };
        waiters.push(waiter);
      });
    },
    async send(message) {
      await ready;
      ws.send(JSON.stringify(message));
    },
  };
}

async function waitForFile(file, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`world file was not written: ${file}`);
}

const WORLD = {
  templateKey: 'creative',
  templateName: 'Creative Sandbox',
  seed: 424242,
  baseY: 48,
  skyTime: 12,
  rules: { blockBreaking: true, blockPlacing: true },
  spawn: [4, 50, 4],
  edits: [],
};

test('open mode creates, persists and reloads one shared world', { timeout: 40000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voxelforge-open-'));
  const worldFile = path.join(dir, 'open.json');
  const port = 19000 + Math.floor(Math.random() * 500);
  let server = startServer(port, worldFile);
  try {
    const before = await waitForHealth(port);
    assert.deepEqual(before.modes, ['open']);
    assert.equal(before.openWorld, null);

    const first = connect(port);
    await first.send({ t: 'hello', protocol: 1, name: 'Probe', version: '0.1.0' });
    const hello = await first.waitFor((m) => m.t === 'hello');
    assert.equal(hello.openWorld, null);

    await first.send({ t: 'join_open', name: 'Probe', world: WORLD });
    const joined = await first.waitFor((m) => m.t === 'room_joined');
    assert.equal(joined.room.code, 'SHARED');
    assert.equal(joined.room.hostId, null);
    assert.equal(joined.you.host, false);
    assert.equal(joined.world.seed, WORLD.seed);
    assert.deepEqual(joined.you.spawn, [4, 50.02, 4]);

    await first.send({ t: 'block', x: 4, y: 50, z: 4, id: 5 });
    const echo = await first.waitFor((m) => m.t === 'block');
    assert.deepEqual([echo.x, echo.y, echo.z, echo.id], [4, 50, 4, 5]);

    first.ws.close();
    await waitForFile(worldFile);
    const saved = JSON.parse(await readFile(worldFile, 'utf8'));
    assert.equal(saved.world.seed, WORLD.seed);
    assert.deepEqual(saved.edits, [[4, 50, 4, 5]]);

    await stopServer(server.child);
    server = startServer(port, worldFile);
    const after = await waitForHealth(port);
    assert.equal(after.openWorld.templateKey, 'creative');
    assert.equal(after.openWorld.edits, 1);

    const second = connect(port);
    await second.send({ t: 'hello', protocol: 1, name: 'Late', version: '0.1.0' });
    const hello2 = await second.waitFor((m) => m.t === 'hello');
    assert.equal(hello2.openWorld.edits, 1);

    await second.send({ t: 'join_open', name: 'Late' });
    const joined2 = await second.waitFor((m) => m.t === 'room_joined');
    assert.equal(joined2.world.seed, WORLD.seed);
    assert.deepEqual(joined2.world.edits, [[4, 50, 4, 5]]);
    second.ws.close();
  } finally {
    await stopServer(server.child);
    await rm(dir, { recursive: true, force: true });
  }
});

test('rooms-only servers reject open joins and advertise no shared world', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voxelforge-rooms-'));
  const port = 19500 + Math.floor(Math.random() * 400);
  const server = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MODES: 'rooms' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForHealth(port);
    const client = connect(port);
    await client.send({ t: 'hello', protocol: 1, name: 'Probe', version: '0.1.0' });
    const hello = await client.waitFor((m) => m.t === 'hello');
    assert.deepEqual(hello.modes, ['rooms']);
    assert.equal(hello.openWorld, null);
    await client.send({ t: 'join_open', name: 'Probe', world: WORLD });
    const error = await client.waitFor((m) => m.t === 'error');
    assert.equal(error.code, 'mode_disabled');
    client.ws.close();
  } finally {
    await stopServer(server);
    await rm(dir, { recursive: true, force: true });
  }
});
