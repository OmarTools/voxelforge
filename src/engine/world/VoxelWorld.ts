import * as THREE from 'three';
import { BLOCK_BY_ID, block, isOpaqueId, isSolidId } from './Blocks';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT, chunkIndex, chunkKey, chunkKeyNum } from './Chunk';
import { TerrainGenerator, type WorldPresetKey } from './TerrainGenerator';
import { buildChunkMesh } from './ChunkMesher';
import { LightEngine, type LightWorld } from './Lighting';
import type { TextureAtlas } from '../render/TextureAtlas';

export interface BlockHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  id: number;
  distance: number;
  point: THREE.Vector3;
}

export type EditRecord = [number, number, number, number];

export class VoxelWorld implements LightWorld {
  readonly group = new THREE.Group();
  /** String-keyed view kept for tooling/UI (`chunks.size`); hot paths use `byCoord`. */
  readonly chunks = new Map<string, Chunk>();
  readonly editsByChunk = new Map<string, Map<number, number>>();
  readonly generator: TerrainGenerator;
  readonly atlas: TextureAtlas;
  readonly lighting: LightEngine;
  renderDistance = 5;

  private readonly byCoord = new Map<number, Chunk>();
  private lastCx = Number.NaN;
  private lastCz = Number.NaN;
  private lastChunk: Chunk | undefined;

  private dirty = new Set<Chunk>();
  private genQueue: Array<{ cx: number; cz: number }> = [];
  /** Chunks waiting in `genQueue`; lets the mesher hold off until neighbours exist. */
  private genPending = new Set<number>();
  private lastCenter = { cx: Number.NaN, cz: Number.NaN };
  private meshBudget = 2;
  private genBudget = 2;

  onChunkGenerated?: (chunk: Chunk) => void;

  constructor(atlas: TextureAtlas, seed: number, preset: WorldPresetKey) {
    this.atlas = atlas;
    this.generator = new TerrainGenerator(seed, preset);
    this.lighting = new LightEngine(this);
    this.group.name = 'world';
    this.group.matrixAutoUpdate = false;
  }

  setRenderDistance(rd: number) {
    this.renderDistance = Math.max(2, Math.min(9, Math.floor(rd)));
    this.lastCenter = { cx: Number.NaN, cz: Number.NaN };
  }

  /** The generated chunk at these chunk coordinates, if loaded. */
  getChunk(cx: number, cz: number): Chunk | undefined {
    if (cx === this.lastCx && cz === this.lastCz) return this.lastChunk;
    const chunk = this.byCoord.get(chunkKeyNum(cx, cz));
    if (chunk) {
      this.lastCx = cx;
      this.lastCz = cz;
      this.lastChunk = chunk;
    }
    return chunk;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!(y >= 0 && y < WORLD_HEIGHT)) return 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const chunk = this.getChunk(xi >> 4, zi >> 4);
    if (!chunk || !chunk.generated) return 0;
    return chunk.blocks[(xi & 15) + ((zi & 15) << 4) + (yi << 8)];
  }

  getBlockRaw(x: number, y: number, z: number): number {
    return this.getBlock(x, y, z);
  }

  /** Sky light 0..15 at a cell (12 where the chunk isn't loaded). */
  getSkyLight(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= WORLD_HEIGHT) return 15;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const chunk = this.getChunk(xi >> 4, zi >> 4);
    if (!chunk) return 12;
    return chunk.light[(xi & 15) + ((zi & 15) << 4) + (yi << 8)] >> 4;
  }

  /** Block (torch, lantern, lava…) light 0..15 at a cell. */
  getBlockLight(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const chunk = this.getChunk(xi >> 4, zi >> 4);
    if (!chunk) return 0;
    return chunk.light[(xi & 15) + ((zi & 15) << 4) + (yi << 8)] & 15;
  }

  isLoaded(cx: number, cz: number): boolean {
    return this.byCoord.has(chunkKeyNum(cx, cz));
  }

  setBlock(x: number, y: number, z: number, id: number, record = true): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const cx = xi >> 4;
    const cz = zi >> 4;
    const lx = xi & 15;
    const lz = zi & 15;
    const key = chunkKey(cx, cz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) {
      if (record) {
        let map = this.editsByChunk.get(key);
        if (!map) {
          map = new Map();
          this.editsByChunk.set(key, map);
        }
        map.set(chunkIndex(lx, yi, lz), id);
      }
      this.queueGeneration(cx, cz);
      return false;
    }
    const idx = chunkIndex(lx, yi, lz);
    const oldId = chunk.blocks[idx];
    if (oldId === id) return false;
    chunk.blocks[idx] = id;
    if (record) {
      let map = this.editsByChunk.get(key);
      if (!map) {
        map = new Map();
        this.editsByChunk.set(key, map);
      }
      map.set(idx, id);
    }
    this.lighting.onBlockChanged(xi, yi, zi, oldId, id);
    this.markBlockDirty(cx, cz, lx, lz);
    return true;
  }

  setBlockNoRecord(x: number, y: number, z: number, id: number) {
    this.setBlock(x, y, z, id, false);
  }

  /** A block changed at a chunk-local column: remesh that chunk and any border neighbour. */
  private markBlockDirty(cx: number, cz: number, lx: number, lz: number) {
    this.setDirty(cx, cz);
    if (lx === 0) this.setDirty(cx - 1, cz);
    if (lx === 15) this.setDirty(cx + 1, cz);
    if (lz === 0) this.setDirty(cx, cz - 1);
    if (lz === 15) this.setDirty(cx, cz + 1);
  }

  private setDirty(cx: number, cz: number) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    chunk.dirty = true;
    this.dirty.add(chunk);
  }

  /** `LightWorld`: light spilled into a chunk, so its mesh must be rebuilt. */
  markLightDirty(cx: number, cz: number): void {
    this.setDirty(cx, cz);
  }

  private queueGeneration(cx: number, cz: number) {
    const num = chunkKeyNum(cx, cz);
    if (this.byCoord.has(num) || this.genPending.has(num)) return;
    this.genPending.add(num);
    this.genQueue.push({ cx, cz });
  }

  generateChunkNow(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const chunk = new Chunk(cx, cz);
    this.generator.generate(chunk);
    chunk.generated = true;

    const editMap = this.editsByChunk.get(key);
    if (editMap) {
      for (const [idx, id] of editMap) chunk.blocks[idx] = id;
    }
    this.chunks.set(key, chunk);
    this.byCoord.set(chunkKeyNum(cx, cz), chunk);
    this.genPending.delete(chunkKeyNum(cx, cz));
    this.lighting.initChunk(chunk);
    chunk.dirty = true;
    this.dirty.add(chunk);

    // Existing neighbours need a border remesh now that this chunk exists.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) {
        n.dirty = true;
        this.dirty.add(n);
      }
    }
    this.onChunkGenerated?.(chunk);
    return chunk;
  }

  meshChunkNow(cx: number, cz: number): void {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    for (const m of chunk.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    chunk.meshes = buildChunkMesh(this, chunk, this.atlas);
    for (const m of chunk.meshes) this.group.add(m);
    chunk.dirty = false;
    this.dirty.delete(chunk);
  }

  disposeChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (const m of chunk.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    chunk.meshes = [];
    this.chunks.delete(key);
    this.byCoord.delete(chunkKeyNum(cx, cz));
    this.dirty.delete(chunk);
    if (this.lastChunk === chunk) {
      this.lastChunk = undefined;
      this.lastCx = Number.NaN;
      this.lastCz = Number.NaN;
    }
  }

  /**
   * A chunk is ready to mesh once every neighbour is either loaded or isn't
   * about to be. Meshing earlier just wastes work: each late neighbour would
   * invalidate the border faces and force another rebuild.
   */
  private neighboursSettled(chunk: Chunk): boolean {
    const { cx, cz } = chunk;
    for (let i = 0; i < 4; i++) {
      const num = chunkKeyNum(cx + (i === 0 ? 1 : i === 1 ? -1 : 0), cz + (i === 2 ? 1 : i === 3 ? -1 : 0));
      if (!this.byCoord.has(num) && this.genPending.has(num)) return false;
    }
    return true;
  }

  /** Closest dirty chunk (to the player) that is in range and ready to mesh. */
  private nextChunkToMesh(pcx: number, pcz: number, rd: number): Chunk | null {
    let best: Chunk | null = null;
    let bestD = Infinity;
    for (const chunk of this.dirty) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (Math.abs(dx) > rd + 1 || Math.abs(dz) > rd + 1) continue;
      const d = dx * dx + dz * dz;
      if (d >= bestD) continue;
      if (!this.neighboursSettled(chunk)) continue;
      best = chunk;
      bestD = d;
    }
    return best;
  }

  /** Queue every chunk in a square and lightly stream them. */
  update(playerX: number, playerZ: number, dt: number) {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    const now = performance.now();
    const rd = this.renderDistance;
    const deadline = now + 6;

    if (cx !== this.lastCenter.cx || cz !== this.lastCenter.cz) {
      this.lastCenter = { cx, cz };
      const list: Array<{ cx: number; cz: number; d: number }> = [];
      for (let dz = -rd; dz <= rd; dz++) {
        for (let dx = -rd; dx <= rd; dx++) {
          if (dx * dx + dz * dz > rd * rd + rd) continue;
          if (this.byCoord.has(chunkKeyNum(cx + dx, cz + dz))) continue;
          list.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
        }
      }
      list.sort((a, b) => a.d - b.d);
      this.genQueue = list;
      this.genPending = new Set(list.map((q) => chunkKeyNum(q.cx, q.cz)));
      this.unloadFar(cx, cz, rd + 2);
    }

    let ops = 0;
    while (this.genQueue.length && ops < this.genBudget && performance.now() < deadline) {
      const next = this.genQueue.shift()!;
      this.genPending.delete(chunkKeyNum(next.cx, next.cz));
      if (!this.byCoord.has(chunkKeyNum(next.cx, next.cz))) this.generateChunkNow(next.cx, next.cz);
      ops++;
    }

    // Mesh the closest dirty chunks first.
    let meshes = 0;
    while (this.dirty.size && meshes < this.meshBudget && performance.now() <= deadline + 4) {
      const chunk = this.nextChunkToMesh(cx, cz, rd);
      if (!chunk) break;
      this.meshChunkNow(chunk.cx, chunk.cz);
      meshes++;
    }
    void dt;
  }

  private unloadFar(cx: number, cz: number, rd: number) {
    for (const [key, chunk] of [...this.chunks.entries()]) {
      if (Math.abs(chunk.cx - cx) > rd || Math.abs(chunk.cz - cz) > rd) {
        this.disposeChunk(chunk.cx, chunk.cz);
        void key;
      }
    }
  }

  /** Used by the editor/template setup to guarantee a block can be placed. */
  ensureArea(minX: number, minZ: number, maxX: number, maxZ: number, mesh = true) {
    const c0x = Math.floor(Math.min(minX, maxX) / CHUNK_SIZE);
    const c1x = Math.floor(Math.max(minX, maxX) / CHUNK_SIZE);
    const c0z = Math.floor(Math.min(minZ, maxZ) / CHUNK_SIZE);
    const c1z = Math.floor(Math.max(minZ, maxZ) / CHUNK_SIZE);
    // Generate the whole area first so every chunk meshes against its real
    // neighbours instead of being rebuilt as each one appears.
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!this.byCoord.has(chunkKeyNum(cx, cz))) this.generateChunkNow(cx, cz);
      }
    }
    if (!mesh) return;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) this.meshChunkNow(cx, cz);
    }
  }

  findSpawnY(x: number, z: number): number {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    for (let y = WORLD_HEIGHT - 2; y > 1; y--) {
      const id = this.getBlock(xi, y, zi);
      if (id && isSolidId(id) && !this.getBlock(xi, y + 1, zi) && !this.getBlock(xi, y + 2, zi)) {
        return y + 1;
      }
    }
    return 0;
  }

  getTopBlock(x: number, z: number): number {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(xi, y, zi);
      if (id && id !== block('water').id) return id;
    }
    return 0;
  }

  getBiomeId(x: number, z: number): number {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const chunk = this.getChunk(xi >> 4, zi >> 4);
    if (!chunk) return 2;
    return chunk.biomes[(xi & 15) + (zi & 15) * CHUNK_SIZE];
  }

  /** Amanatides & Woo DDA voxel raycast. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 6, includeLiquid = false): BlockHit | null {
    const dir = direction.clone().normalize();
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    let tMaxX = dir.x === 0 ? Infinity : ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dir.x));
    let tMaxY = dir.y === 0 ? Infinity : ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dir.y));
    let tMaxZ = dir.z === 0 ? Infinity : ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dir.z));
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    for (let i = 0; i < 96 && t <= maxDistance; i++) {
      const id = this.getBlock(x, y, z);
      if (id) {
        const def = BLOCK_BY_ID.get(id);
        const hit = def && (def.solid || def.render !== 'cube' || includeLiquid) && (includeLiquid || def.render !== 'liquid');
        if (hit) {
          return {
            x, y, z, nx, ny, nz, id, distance: t,
            point: origin.clone().addScaledVector(dir, t),
          };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (y < 0 || y >= WORLD_HEIGHT) break;
    }
    return null;
  }

  raycastSolid(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance = 20): BlockHit | null {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    let tMaxX = dir.x === 0 ? Infinity : ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dir.x));
    let tMaxY = dir.y === 0 ? Infinity : ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dir.y));
    let tMaxZ = dir.z === 0 ? Infinity : ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dir.z));
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 128 && t <= maxDistance; i++) {
      const id = this.getBlock(x, y, z);
      if (id && isSolidId(id)) {
        return { x, y, z, nx, ny, nz, id, distance: t, point: origin.clone().addScaledVector(dir, t) };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (y < 0 || y >= WORLD_HEIGHT) break;
    }
    return null;
  }

  getNearestGround(x: number, z: number, maxY = WORLD_HEIGHT): number {
    const xi = Math.floor(x), zi = Math.floor(z);
    for (let y = Math.min(WORLD_HEIGHT - 1, maxY); y >= 0; y--) {
      const id = this.getBlock(xi, y, zi);
      if (id && isSolidId(id) && !isOpaqueId(this.getBlock(xi, y + 1, zi)) && !this.getBlock(xi, y + 1, zi)) return y + 1;
    }
    return -1;
  }

  getEdits(): EditRecord[] {
    const out: EditRecord[] = [];
    for (const [key, map] of this.editsByChunk) {
      const [cxs, czs] = key.split(',');
      const cx = Number(cxs);
      const cz = Number(czs);
      for (const [idx, id] of map) {
        const lx = idx & 15;
        const lz = (idx >> 4) & 15;
        const y = idx >> 8;
        out.push([cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz, id]);
      }
    }
    return out;
  }

  loadEdits(records: EditRecord[]) {
    for (const [x, y, z, id] of records) {
      if (y < 0 || y >= WORLD_HEIGHT) continue;
      const xi = Math.floor(x), zi = Math.floor(z);
      const cx = xi >> 4, cz = zi >> 4;
      const lx = xi & 15, lz = zi & 15;
      const key = chunkKey(cx, cz);
      let map = this.editsByChunk.get(key);
      if (!map) {
        map = new Map();
        this.editsByChunk.set(key, map);
      }
      map.set(chunkIndex(lx, y, lz), id);
      const chunk = this.getChunk(cx, cz);
      if (chunk) {
        const idx = chunkIndex(lx, y, lz);
        const oldId = chunk.blocks[idx];
        if (oldId !== id) {
          chunk.blocks[idx] = id;
          this.lighting.onBlockChanged(xi, y, zi, oldId, id);
          this.markBlockDirty(cx, cz, lx, lz);
        }
      }
    }
  }

  get editCount(): number {
    let n = 0;
    for (const map of this.editsByChunk.values()) n += map.size;
    return n;
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      for (const m of chunk.meshes) {
        this.group.remove(m);
        m.geometry.dispose();
      }
    }
    this.chunks.clear();
    this.byCoord.clear();
    this.dirty.clear();
    this.genQueue = [];
    this.genPending.clear();
    this.lastChunk = undefined;
    this.lastCx = Number.NaN;
    this.lastCz = Number.NaN;
  }
}
