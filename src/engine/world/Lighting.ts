import { EMIT_TABLE, OPAQUE_TABLE } from './Blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, type Chunk } from './Chunk';

/**
 * Two-channel voxel lighting (sky + block), stored packed in `Chunk.light`
 * (sky = high nibble, block = low nibble).
 *
 *  - Sky light is 15 in any open column and spreads sideways/down with -1 per
 *    step, so overhangs, cave mouths and rooms with windows get soft gradients
 *    instead of a hard on/off column test.
 *  - Block light comes from emissive blocks (`BlockDef.light`: torches,
 *    lanterns, glowstone, lava, …) and spreads with -1 per step.
 *
 * Both channels use the classic breadth-first flood fill. Placing or breaking a
 * block updates light incrementally (a removal pass that un-lights everything
 * the old light reached, then a re-propagation pass from whatever survives),
 * and light crosses chunk borders in both directions as neighbours stream in.
 *
 * Transparent blocks (leaves, glass, water, plants) pass light without
 * attenuation; only opaque blocks stop it.
 */

export interface LightWorld {
  /** A generated chunk, or undefined when that chunk isn't loaded. */
  getChunk(cx: number, cz: number): Chunk | undefined;
  /** A chunk's lit appearance changed; its mesh needs rebuilding. */
  markLightDirty(cx: number, cz: number): void;
}

const SKY = 0;
const BLK = 1;
type Channel = typeof SKY | typeof BLK;

/** dx, dy, dz for the six neighbours. Index 3 is straight down. */
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;

/** Growable queue of fixed-stride integer records (no per-entry allocation). */
class IntQueue {
  private data: Int32Array;
  private head = 0;
  private tail = 0;

  constructor(private readonly stride: number, capacity = 1024) {
    this.data = new Int32Array(capacity * stride);
  }

  get size(): number {
    return (this.tail - this.head) / this.stride;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
  }

  push3(a: number, b: number, c: number): void {
    this.ensure();
    const d = this.data;
    d[this.tail] = a;
    d[this.tail + 1] = b;
    d[this.tail + 2] = c;
    this.tail += 3;
  }

  push4(a: number, b: number, c: number, e: number): void {
    this.ensure();
    const d = this.data;
    d[this.tail] = a;
    d[this.tail + 1] = b;
    d[this.tail + 2] = c;
    d[this.tail + 3] = e;
    this.tail += 4;
  }

  /** Read the record at the head into `out` and advance. */
  shift(out: Int32Array): void {
    for (let i = 0; i < this.stride; i++) out[i] = this.data[this.head + i];
    this.head += this.stride;
    if (this.head === this.tail) {
      this.head = 0;
      this.tail = 0;
    }
  }

  private ensure(): void {
    if (this.tail + this.stride <= this.data.length) return;
    // Compact first if there's dead space at the front, otherwise grow.
    if (this.head > 0) {
      this.data.copyWithin(0, this.head, this.tail);
      this.tail -= this.head;
      this.head = 0;
      if (this.tail + this.stride <= this.data.length) return;
    }
    const grown = new Int32Array(this.data.length * 2);
    grown.set(this.data.subarray(0, this.tail));
    this.data = grown;
  }
}

function ckey(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}

export class LightEngine {
  private readonly addQueue = new IntQueue(3, 4096);
  private readonly removeQueue = new IntQueue(4, 4096);
  private readonly relightQueue = new IntQueue(3, 1024);
  private readonly scratch = new Int32Array(4);
  private readonly touched = new Set<number>();

  // One-entry chunk cache; BFS hammers the same chunk for long runs.
  private cacheCx = Number.NaN;
  private cacheCz = Number.NaN;
  private cacheChunk: Chunk | undefined;

  constructor(private readonly world: LightWorld) {}

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Compute light for a freshly generated chunk that is already registered
   * with the world. Pulls light in from loaded neighbours and pushes this
   * chunk's light out into them.
   */
  initChunk(chunk: Chunk): void {
    this.begin();
    const light = chunk.light;
    const blocks = chunk.blocks;
    light.fill(0);

    // 1. Direct sunlight straight down each column, until the first opaque block.
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let top = -1;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const idx = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          if (OPAQUE_TABLE[blocks[idx]]) {
            top = y;
            break;
          }
          light[idx] = 0xf0;
        }
        chunk.skyTop[x + z * CHUNK_SIZE] = top;
      }
    }

    const add = this.addQueue;
    add.clear();
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    // 2. Emissive blocks seed block light.
    const volume = blocks.length;
    for (let idx = 0; idx < volume; idx++) {
      const id = blocks[idx];
      if (id === 0) continue;
      const e = EMIT_TABLE[id];
      if (e === 0) continue;
      light[idx] = (light[idx] & 0xf0) | e;
      const lx = idx & 15;
      const lz = (idx >> 4) & 15;
      const y = idx >> 8;
      add.push3(baseX + lx, y, baseZ + lz);
    }
    this.propagate(add, BLK);

    // 3. Sunlight spills sideways beneath overhangs. Only sunlit cells next to
    //    a column with a ceiling above that height can possibly light anything.
    const east = this.world.getChunk(chunk.cx + 1, chunk.cz);
    const west = this.world.getChunk(chunk.cx - 1, chunk.cz);
    const south = this.world.getChunk(chunk.cx, chunk.cz + 1);
    const north = this.world.getChunk(chunk.cx, chunk.cz - 1);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const top = chunk.skyTop[x + z * CHUNK_SIZE];
        let seedMax = -1;
        const consider = (ntop: number) => {
          if (ntop > seedMax) seedMax = ntop;
        };
        if (x < CHUNK_SIZE - 1) consider(chunk.skyTop[x + 1 + z * CHUNK_SIZE]);
        else if (east) consider(east.skyTop[z * CHUNK_SIZE]);
        if (x > 0) consider(chunk.skyTop[x - 1 + z * CHUNK_SIZE]);
        else if (west) consider(west.skyTop[CHUNK_SIZE - 1 + z * CHUNK_SIZE]);
        if (z < CHUNK_SIZE - 1) consider(chunk.skyTop[x + (z + 1) * CHUNK_SIZE]);
        else if (south) consider(south.skyTop[x]);
        if (z > 0) consider(chunk.skyTop[x + (z - 1) * CHUNK_SIZE]);
        else if (north) consider(north.skyTop[x + (CHUNK_SIZE - 1) * CHUNK_SIZE]);
        for (let y = top + 1; y <= seedMax && y < WORLD_HEIGHT; y++) add.push3(baseX + x, y, baseZ + z);
      }
    }

    // 4. Pull light across each border from neighbours that already exist.
    const pullSky = (n: Chunk | undefined, lx: number, lz: number, wx: number, wz: number) => {
      if (!n) return;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const v = n.light[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
        if (v >> 4 > 1) add.push3(wx, y, wz);
      }
    };
    const blockPull = this.relightQueue;
    blockPull.clear();
    const pullBlock = (n: Chunk | undefined, lx: number, lz: number, wx: number, wz: number) => {
      if (!n) return;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const v = n.light[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
        if ((v & 15) > 1) blockPull.push3(wx, y, wz);
      }
    };
    for (let i = 0; i < CHUNK_SIZE; i++) {
      pullSky(east, 0, i, baseX + CHUNK_SIZE, baseZ + i);
      pullSky(west, CHUNK_SIZE - 1, i, baseX - 1, baseZ + i);
      pullSky(south, i, 0, baseX + i, baseZ + CHUNK_SIZE);
      pullSky(north, i, CHUNK_SIZE - 1, baseX + i, baseZ - 1);
      pullBlock(east, 0, i, baseX + CHUNK_SIZE, baseZ + i);
      pullBlock(west, CHUNK_SIZE - 1, i, baseX - 1, baseZ + i);
      pullBlock(south, i, 0, baseX + i, baseZ + CHUNK_SIZE);
      pullBlock(north, i, CHUNK_SIZE - 1, baseX + i, baseZ - 1);
    }
    this.propagate(add, SKY);
    this.propagate(blockPull, BLK);

    this.flush();
  }

  /**
   * A block changed at world (x, y, z). The chunk's block array must already
   * hold `newId`. Updates both light channels incrementally.
   */
  onBlockChanged(x: number, y: number, z: number, oldId: number, newId: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.begin();
    const chunk = this.chunkAt(x, z);
    if (!chunk) return;
    const lx = x & 15;
    const lz = z & 15;
    const idx = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;

    const oldOpaque = OPAQUE_TABLE[oldId] === 1;
    const newOpaque = OPAQUE_TABLE[newId] === 1;
    const oldEmit = EMIT_TABLE[oldId];
    const newEmit = EMIT_TABLE[newId];

    // Column ceiling bookkeeping (used to seed light for newly generated chunks).
    const col = lx + lz * CHUNK_SIZE;
    if (newOpaque && y > chunk.skyTop[col]) {
      chunk.skyTop[col] = y;
    } else if (!newOpaque && oldOpaque && y === chunk.skyTop[col]) {
      let top = -1;
      for (let yy = y - 1; yy >= 0; yy--) {
        if (OPAQUE_TABLE[chunk.blocks[lx + lz * CHUNK_SIZE + yy * CHUNK_SIZE * CHUNK_SIZE]]) {
          top = yy;
          break;
        }
      }
      chunk.skyTop[col] = top;
    }

    // --- Block light: remove what the old block was responsible for.
    if ((chunk.light[idx] & 15) > 0 && (newOpaque || oldEmit > newEmit)) this.unlight(x, y, z, BLK);
    // --- Sky light: an opaque block shadows its cell and everything it fed.
    if (chunk.light[idx] >> 4 > 0 && newOpaque) this.unlight(x, y, z, SKY);

    const add = this.addQueue;
    add.clear();

    // --- Opacity removed: let neighbours flow into the freed cell.
    if (oldOpaque && !newOpaque) {
      if (y === WORLD_HEIGHT - 1) {
        // Open to the sky above the world ceiling.
        chunk.light[idx] = (chunk.light[idx] & 15) | 0xf0;
        this.mark(chunk, lx, lz);
      }
      this.pullFromNeighbours(x, y, z, SKY);
      this.pullFromNeighbours(x, y, z, BLK);
    }

    // --- New light source.
    if (newEmit > 0) {
      if ((chunk.light[idx] & 15) < newEmit) {
        chunk.light[idx] = (chunk.light[idx] & 0xf0) | newEmit;
        this.mark(chunk, lx, lz);
      }
      add.clear();
      add.push3(x, y, z);
      this.propagate(add, BLK);
    }

    this.flush();
  }

  /* ------------------------------------------------------------------ */
  /*  Flood fill                                                         */
  /* ------------------------------------------------------------------ */

  /** Spread light outward from every cell in `queue` (each already holds its level). */
  private propagate(queue: IntQueue, channel: Channel): void {
    const rec = this.scratch;
    while (queue.size > 0) {
      queue.shift(rec);
      const x = rec[0];
      const y = rec[1];
      const z = rec[2];
      const chunk = this.chunkAt(x, z);
      if (!chunk) continue;
      const here = chunk.light[(x & 15) + (z & 15) * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
      const level = channel === SKY ? here >> 4 : here & 15;
      if (level < 2) continue;

      for (let d = 0; d < 6; d++) {
        const ny = y + DY[d];
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const nx = x + DX[d];
        const nz = z + DZ[d];
        const nc = this.chunkAt(nx, nz);
        if (!nc) continue;
        const nlx = nx & 15;
        const nlz = nz & 15;
        const nidx = nlx + nlz * CHUNK_SIZE + ny * CHUNK_SIZE * CHUNK_SIZE;
        if (OPAQUE_TABLE[nc.blocks[nidx]]) continue;
        // Sunlight falls straight down without fading.
        const next = channel === SKY && d === DOWN && level === 15 ? 15 : level - 1;
        const cur = nc.light[nidx];
        if (channel === SKY) {
          if (cur >> 4 >= next) continue;
          nc.light[nidx] = (cur & 15) | (next << 4);
        } else {
          if ((cur & 15) >= next) continue;
          nc.light[nidx] = (cur & 0xf0) | next;
        }
        this.mark(nc, nlx, nlz);
        queue.push3(nx, ny, nz);
      }
    }
  }

  /**
   * Re-flood a cell that just became transparent: queue the cell itself (when it
   * already holds light, e.g. the world-ceiling case) and every lit neighbour,
   * then spread.
   */
  private pullFromNeighbours(x: number, y: number, z: number, channel: Channel): void {
    const add = this.addQueue;
    add.clear();
    const here = this.chunkAt(x, z);
    if (here) {
      const v = here.light[(x & 15) + (z & 15) * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
      if ((channel === SKY ? v >> 4 : v & 15) > 1) add.push3(x, y, z);
    }
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const nc = this.chunkAt(nx, nz);
      if (!nc) continue;
      const v = nc.light[(nx & 15) + (nz & 15) * CHUNK_SIZE + ny * CHUNK_SIZE * CHUNK_SIZE];
      if ((channel === SKY ? v >> 4 : v & 15) > 1) add.push3(nx, ny, nz);
    }
    this.propagate(add, channel);
  }

  /**
   * Remove all light of `channel` that flowed from the cell (x, y, z), then
   * re-propagate from the independent sources that border the cleared region.
   * The cell's current level is what is removed; it ends at 0.
   */
  private unlight(x: number, y: number, z: number, channel: Channel): void {
    const chunk = this.chunkAt(x, z);
    if (!chunk) return;
    const rq = this.removeQueue;
    const relight = this.relightQueue;
    rq.clear();
    relight.clear();

    const lx = x & 15;
    const lz = z & 15;
    const idx = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    const start = channel === SKY ? chunk.light[idx] >> 4 : chunk.light[idx] & 15;
    if (start === 0) return;
    chunk.light[idx] = channel === SKY ? chunk.light[idx] & 15 : chunk.light[idx] & 0xf0;
    this.mark(chunk, lx, lz);
    rq.push4(x, y, z, start);

    const rec = this.scratch;
    while (rq.size > 0) {
      rq.shift(rec);
      const cx = rec[0];
      const cy = rec[1];
      const cz = rec[2];
      const level = rec[3];
      for (let d = 0; d < 6; d++) {
        const ny = cy + DY[d];
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const nx = cx + DX[d];
        const nz = cz + DZ[d];
        const nc = this.chunkAt(nx, nz);
        if (!nc) continue;
        const nlx = nx & 15;
        const nlz = nz & 15;
        const nidx = nlx + nlz * CHUNK_SIZE + ny * CHUNK_SIZE * CHUNK_SIZE;
        const cur = nc.light[nidx];
        const nl = channel === SKY ? cur >> 4 : cur & 15;
        if (nl === 0) continue;

        // Sunlight at 15 feeds the cell below it at 15, so that cell is dependent too.
        const dependent = nl < level || (channel === SKY && d === DOWN && level === 15);
        if (dependent) {
          const emit = channel === BLK ? EMIT_TABLE[nc.blocks[nidx]] : 0;
          if (emit > 0) {
            // An emitter swallowed by the removal region keeps its own light.
            nc.light[nidx] = (cur & 0xf0) | emit;
            relight.push3(nx, ny, nz);
            if (emit < nl) rq.push4(nx, ny, nz, nl);
          } else {
            nc.light[nidx] = channel === SKY ? cur & 15 : cur & 0xf0;
            rq.push4(nx, ny, nz, nl);
          }
          this.mark(nc, nlx, nlz);
        } else {
          // Equal or brighter: an independent source that must re-flood the hole.
          relight.push3(nx, ny, nz);
        }
      }
    }
    this.propagate(relight, channel);
  }

  /* ------------------------------------------------------------------ */
  /*  Chunk access + dirty tracking                                      */
  /* ------------------------------------------------------------------ */

  private begin(): void {
    this.cacheCx = Number.NaN;
    this.cacheCz = Number.NaN;
    this.cacheChunk = undefined;
    this.touched.clear();
  }

  private chunkAt(x: number, z: number): Chunk | undefined {
    const cx = x >> 4;
    const cz = z >> 4;
    if (cx === this.cacheCx && cz === this.cacheCz) return this.cacheChunk;
    const chunk = this.world.getChunk(cx, cz);
    this.cacheCx = cx;
    this.cacheCz = cz;
    this.cacheChunk = chunk;
    return chunk;
  }

  /** A light value in (chunk, lx, lz) changed: chunks whose meshes sample it need a rebuild. */
  private mark(chunk: Chunk, lx: number, lz: number): void {
    const t = this.touched;
    const cx = chunk.cx;
    const cz = chunk.cz;
    t.add(ckey(cx, cz));
    const ox = lx === 0 ? -1 : lx === CHUNK_SIZE - 1 ? 1 : 0;
    const oz = lz === 0 ? -1 : lz === CHUNK_SIZE - 1 ? 1 : 0;
    if (ox !== 0) t.add(ckey(cx + ox, cz));
    if (oz !== 0) t.add(ckey(cx, cz + oz));
    if (ox !== 0 && oz !== 0) t.add(ckey(cx + ox, cz + oz));
  }

  private flush(): void {
    for (const key of this.touched) {
      // Sign-extend the packed 16-bit halves back to chunk coordinates.
      const cx = (key >> 16) << 16 >> 16;
      const cz = (key << 16) >> 16;
      this.world.markLightDirty(cx, cz);
    }
    this.touched.clear();
  }
}
