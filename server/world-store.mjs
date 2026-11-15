/**
 * Small JSON store for the persistent shared world.
 *
 * Writes are atomic (temp file + rename) and the previous file is copied into
 * `backups/` first, so a crash mid-write can never truncate the only copy.
 * The server keeps the authoritative state in memory and flushes on a timer,
 * on the last player leaving, and on shutdown.
 */
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const WORLD_RECORD_VERSION = 1;

function backupDir(file) {
  return path.join(path.dirname(file), 'backups');
}

function backupName(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${path.basename(file, path.extname(file))}-${stamp}-${suffix}.json`;
}

export async function loadWorldRecord(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('world record is not an object');
    }
    return data;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Keep the newest `keep` backup files; return the names that were removed. */
export async function pruneBackups(dir, keep = 8) {
  let names;
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  if (names.length <= keep) return [];
  const entries = await Promise.all(
    names.map(async (name) => ({ name, at: (await stat(path.join(dir, name))).mtimeMs })),
  );
  entries.sort((a, b) => b.at - a.at);
  const stale = entries.slice(keep);
  await Promise.all(stale.map((entry) => unlink(path.join(dir, entry.name))));
  return stale.map((entry) => entry.name);
}

/**
 * Write `record` to `file`, copying the previous version into `backups/`.
 * Returns `{ backedUp, backups }`, where `backups` are pruned file names.
 */
export async function saveWorldRecord(file, record, options = {}) {
  const keep = Math.max(0, options.backups ?? 8);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  let previous = false;
  try {
    const info = await stat(file);
    previous = info.isFile() && info.size > 0;
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  let pruned = [];
  if (previous && keep > 0) {
    const dir = backupDir(file);
    await mkdir(dir, { recursive: true });
    await copyFile(file, path.join(dir, backupName(file)));
    pruned = await pruneBackups(dir, keep);
  }

  await rename(tmp, file);
  return { backedUp: previous, backups: pruned };
}
