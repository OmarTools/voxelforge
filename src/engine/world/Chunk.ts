import * as THREE from 'three';
import { blockById, isOpaqueId } from './Blocks';

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
  readonly light = new Uint8Array(CHUNK_VOLUME);
  readonly biomes = new Uint8Array(CHUNK_AREA);
  readonly heights = new Uint8Array(CHUNK_AREA);

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

  getLight(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return 15;
    return this.light[chunkIndex(x, y, z)];
  }

  getBiome(x: number, z: number): number {
    return this.biomes[z * CHUNK_SIZE + x] ?? 0;
  }

  /** Column-based sunlight: light falls from the sky until the first opaque block. */
  computeLight() {
    this.light.fill(0);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let lit = true;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const idx = chunkIndex(x, y, z);
          if (lit) this.light[idx] = 15;
          const id = this.blocks[idx];
          if (id !== 0 && isOpaqueId(id)) lit = false;
        }
      }
    }
  }

  recomputeColumnLight(x: number, z: number) {
    let lit = true;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const idx = chunkIndex(x, y, z);
      this.light[idx] = lit ? 15 : 0;
      if (this.blocks[idx] !== 0 && isOpaqueId(this.blocks[idx])) lit = false;
    }
  }

  setBiome(x: number, z: number, biome: number) {
    this.biomes[z * CHUNK_SIZE + x] = biome;
  }
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number; lx: number; lz: number } {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return { cx, cz, lx: x - cx * CHUNK_SIZE, lz: z - cz * CHUNK_SIZE };
}

export function blockByIdSafe(id: number) {
  return blockById(id);
}
