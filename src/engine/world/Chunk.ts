import * as THREE from 'three';
import { blockById } from './Blocks';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;

export function chunkIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_AREA;
}

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly key: string;
  readonly blocks = new Uint16Array(CHUNK_VOLUME);
  /**
   * Packed light per voxel: sky light in the high nibble, block light in the
   * low nibble (both 0..15). Maintained by `LightEngine`.
   */
  readonly light = new Uint8Array(CHUNK_VOLUME);
  readonly biomes = new Uint8Array(CHUNK_AREA);
  readonly heights = new Uint8Array(CHUNK_AREA);
  /** Highest opaque block in each column (-1 when the column is open to the sky). */
  readonly skyTop = new Int16Array(CHUNK_AREA).fill(-1);

  generated = false;
  dirty = true;
  meshes: THREE.Mesh[] = [];
  queuedForMesh = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.key = `${cx},${cz}`;
  }

  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.blocks[chunkIndex(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, id: number) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[chunkIndex(x, y, z)] = id;
  }

  /** Sky light (0..15) of a voxel in this chunk; out-of-range reads as fully lit. */
  getSkyLight(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return 15;
    return this.light[chunkIndex(x, y, z)] >> 4;
  }

  /** Block light (0..15) of a voxel in this chunk; out-of-range reads as dark. */
  getBlockLight(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.light[chunkIndex(x, y, z)] & 15;
  }

  getBiome(x: number, z: number): number {
    return this.biomes[z * CHUNK_SIZE + x] ?? 0;
  }

  setBiome(x: number, z: number, biome: number) {
    this.biomes[z * CHUNK_SIZE + x] = biome;
  }
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Collision-free integer key for chunk coordinates within ±32768 (no string allocation). */
export function chunkKeyNum(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number; lx: number; lz: number } {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return { cx, cz, lx: x - cx * CHUNK_SIZE, lz: z - cz * CHUNK_SIZE };
}

export function blockByIdSafe(id: number) {
  return blockById(id);
}
