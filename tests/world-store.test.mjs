import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadWorldRecord, pruneBackups, saveWorldRecord, WORLD_RECORD_VERSION } from '../server/world-store.mjs';

async function tempWorld() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voxelforge-world-'));
  return { dir, file: path.join(dir, 'open.json') };
}

test('loadWorldRecord returns null when the file does not exist', async () => {
  const { dir, file } = await tempWorld();
  try {
    assert.equal(await loadWorldRecord(file), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveWorldRecord writes atomically and backs up the previous file', async () => {
  const { dir, file } = await tempWorld();
  try {
    const first = { version: WORLD_RECORD_VERSION, edits: [[1, 2, 3, 4]], savedAt: 1 };
    assert.deepEqual(await saveWorldRecord(file, first, { backups: 8 }), { backedUp: false, backups: [] });
    assert.deepEqual(await loadWorldRecord(file), first);
    assert.equal(existsSync(`${file}.tmp`), false);

    const second = { version: WORLD_RECORD_VERSION, edits: [[1, 2, 3, 4], [5, 6, 7, 8]], savedAt: 2 };
    const result = await saveWorldRecord(file, second, { backups: 8 });
    assert.equal(result.backedUp, true);
    assert.deepEqual(await loadWorldRecord(file), second);

    const backups = await readdir(path.join(dir, 'backups'));
    assert.equal(backups.length, 1);
    const previous = JSON.parse(await readFile(path.join(dir, 'backups', backups[0]), 'utf8'));
    assert.deepEqual(previous, first);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pruneBackups keeps the newest files only', async () => {
  const { dir, file } = await tempWorld();
  try {
    for (let i = 0; i < 5; i++) {
      await saveWorldRecord(file, { version: WORLD_RECORD_VERSION, savedAt: i }, { backups: 2 });
    }
    const backups = await readdir(path.join(dir, 'backups'));
    assert.equal(backups.length, 2);
    const removed = await pruneBackups(path.join(dir, 'backups'), 1);
    assert.equal(removed.length, 1);
    assert.equal((await readdir(path.join(dir, 'backups'))).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadWorldRecord rejects a corrupt file instead of silently starting fresh', async () => {
  const { dir, file } = await tempWorld();
  try {
    await writeFile(file, '{ not json', 'utf8');
    await assert.rejects(() => loadWorldRecord(file));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
