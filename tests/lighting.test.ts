/**
 * Fuzz test: the incremental LightEngine must always match a brute-force
 * oracle that relaxes every cell to a fixpoint. Covers generation order,
 * cross-chunk spreading, and random place/break edits (including at borders).
 */
import assert from 'node:assert/strict';
import { block, EMIT_TABLE, OPAQUE_TABLE } from '../src/engine/world/Blocks';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT, chunkKeyNum } from '../src/engine/world/Chunk';
import { LightEngine, type LightWorld } from '../src/engine/world/Lighting';
import { mulberry32 } from '../src/engine/core/Noise';

const H = WORLD_HEIGHT;
const AIR = 0;
const STONE = block('stone').id;
const GLASS = block('glass').id;
const TORCH = block('torch').id;
const GLOW = block('glowstone').id;
const CRYSTAL = block('crystal_block').id; // dimmer emitter (11)
const PALETTE = [AIR, AIR, AIR, STONE, GLASS, TORCH, GLOW, GLOW, CRYSTAL, CRYSTAL];

class TestWorld implements LightWorld {
  chunks = new Map<number, Chunk>();
  engine = new LightEngine(this);
  getChunk(cx: number, cz: number) { return this.chunks.get(chunkKeyNum(cx, cz)); }
  markLightDirty() {}
  add(cx: number, cz: number, fill: (c: Chunk) => void) {
    const c = new Chunk(cx, cz);
    fill(c);
    c.generated = true;
    this.chunks.set(chunkKeyNum(cx, cz), c);
    this.engine.initChunk(c);
  }
  block(x: number, y: number, z: number) {
    if (y < 0 || y >= H) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.blocks[(x & 15) + (z & 15) * 16 + y * 256] : -1; // -1 = not loaded
  }
  set(x: number, y: number, z: number, id: number) {
    const c = this.getChunk(x >> 4, z >> 4)!;
    const idx = (x & 15) + (z & 15) * 16 + y * 256;
    const old = c.blocks[idx];
    if (old === id) return;
    c.blocks[idx] = id;
    this.engine.onBlockChanged(x, y, z, old, id);
  }
}

/** Brute force: iterate to fixpoint over every loaded cell. */
function oracle(w: TestWorld, span: number) {
  const size = span * CHUNK_SIZE;
  const idx = (x: number, y: number, z: number) => x + z * size + y * size * size;
  const sky = new Uint8Array(size * size * H);
  const blk = new Uint8Array(size * size * H);
  const id = (x: number, y: number, z: number) => w.block(x, y, z);
  // Minimum world coord is 0 here (chunks 0..span-1).
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    let lit = true;
    for (let y = H - 1; y >= 0; y--) {
      if (OPAQUE_TABLE[id(x, y, z)]) lit = false;
      if (lit) sky[idx(x, y, z)] = 15;
    }
  }
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) for (let y = 0; y < H; y++) {
    blk[idx(x, y, z)] = EMIT_TABLE[id(x, y, z)];
  }
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let changed = true;
  while (changed) {
    changed = false;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) for (let y = 0; y < H; y++) {
      if (OPAQUE_TABLE[id(x, y, z)]) continue;
      const i = idx(x, y, z);
      for (const [dx, dy, dz] of dirs) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size || ny < 0 || ny >= H) continue;
        const ni = idx(nx, ny, nz);
        // sky: neighbour above at 15 feeds this cell at 15
        const s = sky[ni];
        const fromSky = dy === 1 && s === 15 ? 15 : s - 1;
        if (fromSky > sky[i]) { sky[i] = fromSky; changed = true; }
        const b = blk[ni] - 1;
        if (b > blk[i]) { blk[i] = b; changed = true; }
      }
    }
  }
  return { sky, blk, idx, size };
}

function compare(w: TestWorld, span: number, label: string) {
  const o = oracle(w, span);
  for (let z = 0; z < o.size; z++) for (let x = 0; x < o.size; x++) for (let y = 0; y < H; y++) {
    const c = w.getChunk(x >> 4, z >> 4)!;
    const v = c.light[(x & 15) + (z & 15) * 16 + y * 256];
    const i = o.idx(x, y, z);
    // The engine leaves opaque cells' sky at 0; the oracle does too.
    if ((v >> 4) !== o.sky[i] || (v & 15) !== o.blk[i]) {
      assert.fail(`${label}: mismatch at (${x},${y},${z}) block=${w.block(x, y, z)} engine sky=${v >> 4} blk=${v & 15} oracle sky=${o.sky[i]} blk=${o.blk[i]}`);
    }
  }
}

function randomChunk(rand: () => number, cx: number, cz: number) {
  return (c: Chunk) => {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      // hilly ground with overhang-ish noise
      const h = 20 + Math.floor(rand() * 18);
      for (let y = 0; y <= h; y++) c.blocks[x + z * 16 + y * 256] = STONE;
      if (rand() < 0.05) { // floating slab = overhang
        const y0 = h + 3 + Math.floor(rand() * 4);
        for (let y = y0; y < y0 + 2; y++) c.blocks[x + z * 16 + y * 256] = STONE;
      }
      if (rand() < 0.04) c.blocks[x + z * 16 + (h + 1) * 256] = rand() < 0.5 ? TORCH : GLOW;
      if (rand() < 0.08) { // cave pocket
        const y0 = 5 + Math.floor(rand() * 10);
        for (let y = y0; y < y0 + 3; y++) c.blocks[x + z * 16 + y * 256] = AIR;
      }
    }
    void cx; void cz;
  };
}

let total = 0;
for (let seed = 1; seed <= 8; seed++) {
  const rand = mulberry32(seed * 7919);
  const span = 2;
  const w = new TestWorld();
  // Generate in a shuffled order so chunks appear next to already-lit neighbours.
  const coords: Array<[number, number]> = [];
  for (let cz = 0; cz < span; cz++) for (let cx = 0; cx < span; cx++) coords.push([cx, cz]);
  coords.sort(() => rand() - 0.5);
  for (const [cx, cz] of coords) w.add(cx, cz, randomChunk(rand, cx, cz));
  compare(w, span, `seed ${seed} after generation`);

  const size = span * 16;
  for (let step = 0; step < 120; step++) {
    // Bias edits toward chunk borders (x or z = 15/16) and the surface.
    const hot = rand() < 0.7; // tight cluster straddling the chunk border
    const border = rand() < 0.5;
    const x = hot ? 11 + Math.floor(rand() * 10) : border ? (rand() < 0.5 ? 15 : 16) : Math.floor(rand() * size);
    const z = hot ? 11 + Math.floor(rand() * 10) : Math.floor(rand() * size);
    const y = hot ? 22 + Math.floor(rand() * 8) : 8 + Math.floor(rand() * 40);
    const id = PALETTE[Math.floor(rand() * PALETTE.length)];
    w.set(x, y, z, id);
    total++;
    if (step % 10 === 9) compare(w, span, `seed ${seed} step ${step}`);
  }
  compare(w, span, `seed ${seed} final`);
}
console.log(`lighting fuzz OK (${total} random edits verified against brute-force oracle)`);
