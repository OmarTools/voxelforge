import * as THREE from 'three';
import { BLOCKS, OPAQUE_TABLE, RENDER_CROSS, RENDER_LIQUID, RENDER_TABLE } from './Blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, type Chunk } from './Chunk';
import type { VoxelWorld } from './VoxelWorld';
import { tileForFace, type TextureAtlas } from '../render/TextureAtlas';
import { hash3 } from '../core/Noise';

/**
 * Chunk mesher.
 *
 * Faces are culled against the six neighbours and written into reusable
 * typed-array buckets (no per-face allocations). Every vertex carries:
 *   - `color`: face shade × ambient occlusion × a tiny per-block tint (RGB)
 *   - `aLight`: smoothed sky light and block light (0..1 each), averaged over the
 *     four voxels touching that corner, so light fades across a face instead of
 *     stepping block by block. The shader (see `WorldLight.ts`) combines them
 *     with the day/night cycle.
 */

interface FaceDef {
  name: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
  normal: [number, number, number];
  corners: Array<[number, number, number]>;
  axis1: 0 | 1 | 2;
  axis2: 0 | 1 | 2;
  shade: number;
}

const FACES: FaceDef[] = [
  {
    name: 'top', normal: [0, 1, 0], axis1: 0, axis2: 2, shade: 1.0,
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  },
  {
    name: 'bottom', normal: [0, -1, 0], axis1: 0, axis2: 2, shade: 0.52,
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  },
  {
    name: 'east', normal: [1, 0, 0], axis1: 1, axis2: 2, shade: 0.82,
    corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  },
  {
    name: 'west', normal: [-1, 0, 0], axis1: 1, axis2: 2, shade: 0.74,
    corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  },
  {
    name: 'south', normal: [0, 0, 1], axis1: 0, axis2: 1, shade: 0.9,
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  },
  {
    name: 'north', normal: [0, 0, -1], axis1: 0, axis2: 1, shade: 0.8,
    corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
  },
];

const AO_FACTORS = [0.48, 0.66, 0.83, 1.0];

/**
 * Per face and vertex: the three neighbouring voxel offsets (side 1, side 2,
 * corner) in the plane of the face, relative to the voxel the face looks into.
 * Layout: [face][vertex][9] = o1xyz, o2xyz, o3xyz.
 */
const VERTEX_OFFSETS: Int8Array[][] = FACES.map((face) =>
  face.corners.map((c) => {
    const s1 = c[face.axis1] === 1 ? 1 : -1;
    const s2 = c[face.axis2] === 1 ? 1 : -1;
    const o1 = [0, 0, 0];
    const o2 = [0, 0, 0];
    const o3 = [0, 0, 0];
    o1[face.axis1] = s1;
    o2[face.axis2] = s2;
    o3[face.axis1] = s1;
    o3[face.axis2] = s2;
    return Int8Array.from([...o1, ...o2, ...o3]);
  }),
);

const FACE_NX = Int8Array.from(FACES.map((f) => f.normal[0]));
const FACE_NY = Int8Array.from(FACES.map((f) => f.normal[1]));
const FACE_NZ = Int8Array.from(FACES.map((f) => f.normal[2]));
const FACE_TOP = 0;
const FACE_BOTTOM = 1;

const CROSS_HEIGHT: Record<string, number> = {
  tall_grass: 0.92,
  poppy: 0.82,
  dandelion: 0.82,
  torch: 0.64,
  dead_bush: 0.75,
  mushroom_red: 0.5,
  mushroom_brown: 0.45,
  crystal_flower: 0.85,
};

/** Light assumed where a neighbouring chunk isn't loaded: bright sky, no block light. */
const UNKNOWN_LIGHT = 12 << 4;

/** Per-atlas UV lookup: [blockId][face][u0, v0, u1, v1] (NaN when a face has no tile). */
interface UvTables {
  faces: Float32Array;
  cross: Float32Array;
}
const uvTables = new WeakMap<TextureAtlas, UvTables>();

function getUvTables(atlas: TextureAtlas): UvTables {
  let tables = uvTables.get(atlas);
  if (tables) return tables;
  const faces = new Float32Array(BLOCKS.length * 6 * 4).fill(Number.NaN);
  const cross = new Float32Array(BLOCKS.length * 4).fill(Number.NaN);
  for (const def of BLOCKS) {
    if (def.id === 0) continue;
    if (def.render === 'cross') {
      const tile = def.tiles.side ?? def.tiles.top;
      if (tile) {
        const uv = atlas.getUV(tile);
        cross.set([uv.u0, uv.v0, uv.u1, uv.v1], def.id * 4);
      }
      continue;
    }
    FACES.forEach((face, fi) => {
      const tile = tileForFace(def, face.name);
      if (!tile) return;
      const uv = atlas.getUV(tile);
      faces.set([uv.u0, uv.v0, uv.u1, uv.v1], (def.id * 6 + fi) * 4);
    });
  }
  tables = { faces, cross };
  uvTables.set(atlas, tables);
  return tables;
}

/** Growable vertex/index buffers, reused between chunk builds. */
class Bucket {
  position = new Float32Array(3 * 2048);
  normal = new Int8Array(3 * 2048);
  uv = new Float32Array(2 * 2048);
  color = new Uint8Array(3 * 2048);
  light = new Uint8Array(2 * 2048);
  index = new Uint32Array(6 * 1024);
  vertexCount = 0;
  indexCount = 0;

  reset(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  /** Make room for `verts` more vertices and `indices` more indices. */
  private reserve(verts: number, indices: number): void {
    const needV = this.vertexCount + verts;
    if (needV * 3 > this.position.length) {
      let cap = this.position.length / 3;
      while (cap < needV) cap *= 2;
      this.position = grow(this.position, cap * 3);
      this.normal = grow(this.normal, cap * 3);
      this.uv = grow(this.uv, cap * 2);
      this.color = grow(this.color, cap * 3);
      this.light = grow(this.light, cap * 2);
    }
    const needI = this.indexCount + indices;
    if (needI > this.index.length) {
      let cap = this.index.length;
      while (cap < needI) cap *= 2;
      this.index = grow(this.index, cap);
    }
  }

  /** Append a quad; `flip` picks the other diagonal for the two triangles. */
  quad(
    px: ArrayLike<number>,
    nx: number, ny: number, nz: number,
    u0: number, v0: number, u1: number, v1: number,
    col: ArrayLike<number>,
    lit: ArrayLike<number>,
    flip: boolean,
  ): void {
    this.reserve(4, 6);
    const base = this.vertexCount;
    for (let i = 0; i < 4; i++) {
      const v = base + i;
      this.position[v * 3] = px[i * 3];
      this.position[v * 3 + 1] = px[i * 3 + 1];
      this.position[v * 3 + 2] = px[i * 3 + 2];
      this.normal[v * 3] = nx * 127;
      this.normal[v * 3 + 1] = ny * 127;
      this.normal[v * 3 + 2] = nz * 127;
      this.uv[v * 2] = i === 1 || i === 2 ? u1 : u0;
      this.uv[v * 2 + 1] = i >= 2 ? v1 : v0;
      this.color[v * 3] = col[i * 3];
      this.color[v * 3 + 1] = col[i * 3 + 1];
      this.color[v * 3 + 2] = col[i * 3 + 2];
      this.light[v * 2] = lit[i * 2];
      this.light[v * 2 + 1] = lit[i * 2 + 1];
    }
    const ix = this.index;
    let n = this.indexCount;
    if (flip) {
      ix[n++] = base + 1; ix[n++] = base + 2; ix[n++] = base + 3;
      ix[n++] = base + 1; ix[n++] = base + 3; ix[n++] = base;
    } else {
      ix[n++] = base; ix[n++] = base + 1; ix[n++] = base + 2;
      ix[n++] = base; ix[n++] = base + 2; ix[n++] = base + 3;
    }
    this.indexCount = n;
    this.vertexCount = base + 4;
  }
}

function grow<T extends Float32Array | Int8Array | Uint8Array | Uint32Array>(src: T, length: number): T {
  const next = new (src.constructor as new (n: number) => T)(length);
  next.set(src);
  return next;
}

const OPAQUE_BUCKET = new Bucket();
const CUTOUT_BUCKET = new Bucket();
const LIQUID_BUCKET = new Bucket();
const PLANT_BUCKET = new Bucket();

// Scratch for one quad (avoids per-face allocations).
const quadPos = new Float32Array(12);
const quadCol = new Uint8Array(12);
const quadLit = new Uint8Array(8);
const vertexBright = new Float32Array(4);

function isFaceVisible(id: number, neighborId: number): boolean {
  if (!neighborId) return true;
  if (OPAQUE_TABLE[neighborId]) return false;
  if (!OPAQUE_TABLE[id] && neighborId === id) return false;
  return true;
}

/** Build all four geometry buckets for a chunk. */
export function buildChunkMesh(world: VoxelWorld, chunk: Chunk, atlas: TextureAtlas): THREE.Mesh[] {
  OPAQUE_BUCKET.reset();
  CUTOUT_BUCKET.reset();
  LIQUID_BUCKET.reset();
  PLANT_BUCKET.reset();

  const uvs = getUvTables(atlas);
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  const H = WORLD_HEIGHT;

  // Resolve the 3x3 chunk neighbourhood once; every voxel read below is plain array access.
  const nbBlocks: Array<Uint16Array | undefined> = new Array(9);
  const nbLight: Array<Uint8Array | undefined> = new Array(9);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = dx === 0 && dz === 0 ? chunk : world.getChunk(chunk.cx + dx, chunk.cz + dz);
      nbBlocks[(dz + 1) * 3 + dx + 1] = c?.blocks;
      nbLight[(dz + 1) * 3 + dx + 1] = c?.light;
    }
  }

  // x and z may be -1..16 (one voxel into a neighbouring chunk).
  const blockAt = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= H) return 0;
    const b = nbBlocks[((z >> 4) + 1) * 3 + (x >> 4) + 1];
    return b ? b[(x & 15) + ((z & 15) << 4) + (y << 8)] : 0;
  };
  /** Packed light (sky << 4 | block) at a voxel, or -1 if that chunk isn't loaded. */
  const lightAt = (x: number, y: number, z: number): number => {
    if (y >= H) return 0xf0;
    if (y < 0) return 0;
    const l = nbLight[((z >> 4) + 1) * 3 + (x >> 4) + 1];
    return l ? l[(x & 15) + ((z & 15) << 4) + (y << 8)] : -1;
  };

  // Skip the empty air above the highest block in this chunk.
  const blocks = chunk.blocks;
  let maxY = -1;
  for (let y = H - 1; y >= 0 && maxY < 0; y--) {
    const row = y << 8;
    for (let i = 0; i < 256; i++) {
      if (blocks[row + i] !== 0) {
        maxY = y;
        break;
      }
    }
  }

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = blocks[x + (z << 4) + (y << 8)];
        if (!id) continue;
        const kind = RENDER_TABLE[id];
        const wx = baseX + x;
        const wz = baseZ + z;

        if (kind === RENDER_CROSS) {
          addCross(PLANT_BUCKET, uvs, id, x, y, z, wx, wz, lightAt(x, y, z));
          continue;
        }

        const isLiquid = kind === RENDER_LIQUID;
        const opaque = OPAQUE_TABLE[id] === 1;
        const target = isLiquid ? LIQUID_BUCKET : opaque ? OPAQUE_BUCKET : CUTOUT_BUCKET;
        const aboveSame = isLiquid && blockAt(x, y + 1, z) === id;
        const surfaceY = isLiquid && !aboveSame ? 0.875 : 1;
        const useAo = opaque && !isLiquid;
        const tint = 0.97 + hash3(wx, y, wz, 1337) * 0.06;

        for (let fi = 0; fi < 6; fi++) {
          const nx = x + FACE_NX[fi];
          const ny = y + FACE_NY[fi];
          const nz = z + FACE_NZ[fi];
          const neighbor = blockAt(nx, ny, nz);
          if (!isFaceVisible(id, neighbor)) continue;

          // Don't draw a liquid's top face under another liquid.
          if (isLiquid && fi === FACE_TOP && aboveSame) continue;
          if (isLiquid && fi === FACE_BOTTOM && blockAt(x, y - 1, z) === id) continue;

          const uvBase = (id * 6 + fi) * 4;
          const u0 = uvs.faces[uvBase];
          if (u0 !== u0) continue; // NaN: this face has no tile
          const v0 = uvs.faces[uvBase + 1];
          const u1 = uvs.faces[uvBase + 2];
          const v1 = uvs.faces[uvBase + 3];

          const face = FACES[fi];
          const centerRaw = lightAt(nx, ny, nz);
          const center = centerRaw < 0 ? UNKNOWN_LIGHT : centerRaw;
          const offsets = VERTEX_OFFSETS[fi];

          for (let v = 0; v < 4; v++) {
            const c = face.corners[v];
            quadPos[v * 3] = x + c[0];
            quadPos[v * 3 + 1] = isLiquid && c[1] === 1 ? y + surfaceY : y + c[1];
            quadPos[v * 3 + 2] = z + c[2];

            const o = offsets[v];
            const ax = nx + o[0], ay = ny + o[1], az = nz + o[2];
            const bx = nx + o[3], by = ny + o[4], bz = nz + o[5];
            const cx = nx + o[6], cy = ny + o[7], cz = nz + o[8];
            const sideA = OPAQUE_TABLE[blockAt(ax, ay, az)];
            const sideB = OPAQUE_TABLE[blockAt(bx, by, bz)];
            const corner = OPAQUE_TABLE[blockAt(cx, cy, cz)];

            let ao = 1;
            if (useAo) {
              const level = sideA && sideB ? 0 : 3 - (sideA + sideB + corner);
              ao = AO_FACTORS[level];
            }

            // Smooth light: average the four voxels around this corner. Opaque
            // voxels (and a corner hidden behind two of them) contribute the
            // centre value so walls don't punch dark seams into the gradient.
            let la = center;
            if (!sideA) {
              const r = lightAt(ax, ay, az);
              if (r >= 0) la = r;
            }
            let lb = center;
            if (!sideB) {
              const r = lightAt(bx, by, bz);
              if (r >= 0) lb = r;
            }
            let lc = center;
            if (!corner && !(sideA && sideB)) {
              const r = lightAt(cx, cy, cz);
              if (r >= 0) lc = r;
            }
            const sky = ((center >> 4) + (la >> 4) + (lb >> 4) + (lc >> 4)) * (255 / 60);
            const blk = ((center & 15) + (la & 15) + (lb & 15) + (lc & 15)) * (255 / 60);
            quadLit[v * 2] = sky + 0.5;
            quadLit[v * 2 + 1] = blk + 0.5;

            const shade = face.shade * ao * tint;
            // A whisper of warmth in the highlights keeps the scene from feeling flat.
            quadCol[v * 3] = Math.min(1, shade * 1.01) * 255 + 0.5;
            quadCol[v * 3 + 1] = Math.min(1, shade) * 255 + 0.5;
            quadCol[v * 3 + 2] = Math.min(1, shade * 0.96) * 255 + 0.5;

            // Rough perceived brightness, used only to choose the quad diagonal.
            const lit = Math.max(sky, blk) / 255;
            vertexBright[v] = ao * (0.2 + 0.8 * lit);
          }

          // Split along the brighter diagonal so a single dark corner doesn't smear
          // across the whole face (classic AO anisotropy artifact).
          const flip = vertexBright[0] + vertexBright[2] < vertexBright[1] + vertexBright[3];
          target.quad(quadPos, FACE_NX[fi], FACE_NY[fi], FACE_NZ[fi], u0, v0, u1, v1, quadCol, quadLit, flip);
        }
      }
    }
  }

  return makeMeshes(atlas, chunk);
}

function addCross(
  target: Bucket,
  uvs: UvTables,
  id: number,
  x: number,
  y: number,
  z: number,
  wx: number,
  wz: number,
  packedLight: number,
) {
  const uvBase = id * 4;
  const u0 = uvs.cross[uvBase];
  if (u0 !== u0) return;
  const v0 = uvs.cross[uvBase + 1];
  const u1 = uvs.cross[uvBase + 2];
  const v1 = uvs.cross[uvBase + 3];
  const def = BLOCKS[id];
  const h = CROSS_HEIGHT[def.key] ?? 0.85;
  const sky = ((packedLight >> 4) / 15) * 255;
  const blk = ((packedLight & 15) / 15) * 255;
  const tint = 0.94 + hash3(wx, y, wz, 4321) * 0.1;
  const jx = (hash3(wx, 3, wz, 991) - 0.5) * 0.12;
  const jz = (hash3(wx, 4, wz, 993) - 0.5) * 0.12;
  const angle = hash3(wx, 5, wz, 995) * Math.PI;
  const half = def.key === 'torch' ? 0.08 : 0.46;
  const cx = x + 0.5 + jx;
  const cz = z + 0.5 + jz;

  const r = Math.min(1, tint * 1.02) * 255 + 0.5;
  const g = Math.min(1, tint) * 255 + 0.5;
  const b = Math.min(1, tint * 0.94) * 255 + 0.5;
  for (let v = 0; v < 4; v++) {
    quadCol[v * 3] = r;
    quadCol[v * 3 + 1] = g;
    quadCol[v * 3 + 2] = b;
    quadLit[v * 2] = sky + 0.5;
    quadLit[v * 2 + 1] = blk + 0.5;
  }

  for (let plane = 0; plane < 2; plane++) {
    const a = angle + plane * Math.PI * 0.5;
    const dx = Math.cos(a) * half;
    const dz = Math.sin(a) * half;
    quadPos[0] = cx - dx; quadPos[1] = y + 0.02; quadPos[2] = cz - dz;
    quadPos[3] = cx + dx; quadPos[4] = y + 0.02; quadPos[5] = cz + dz;
    quadPos[6] = cx + dx; quadPos[7] = y + h; quadPos[8] = cz + dz;
    quadPos[9] = cx - dx; quadPos[10] = y + h; quadPos[11] = cz - dz;
    target.quad(quadPos, 0, 1, 0, u0, v0, u1, v1, quadCol, quadLit, false);
  }
}

function makeMesh(b: Bucket, material: THREE.Material, transparentOrder: number): THREE.Mesh | null {
  if (b.vertexCount === 0) return null;
  const vc = b.vertexCount;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(b.position.slice(0, vc * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(b.normal.slice(0, vc * 3), 3, true));
  geo.setAttribute('uv', new THREE.BufferAttribute(b.uv.slice(0, vc * 2), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(b.color.slice(0, vc * 3), 3, true));
  geo.setAttribute('aLight', new THREE.BufferAttribute(b.light.slice(0, vc * 2), 2, true));
  const indices = vc > 65535 ? b.index.slice(0, b.indexCount) : new Uint16Array(b.index.subarray(0, b.indexCount));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = transparentOrder;
  mesh.frustumCulled = true;
  return mesh;
}

function makeMeshes(atlas: TextureAtlas, chunk: Chunk): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const opaque = makeMesh(OPAQUE_BUCKET, atlas.materials.opaque, 0);
  const cutout = makeMesh(CUTOUT_BUCKET, atlas.materials.cutout, 2);
  const liquid = makeMesh(LIQUID_BUCKET, atlas.materials.liquid, 1);
  const plants = makeMesh(PLANT_BUCKET, atlas.materials.plant, 3);
  for (const m of [opaque, liquid, cutout, plants]) {
    if (!m) continue;
    m.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    m.updateMatrix();
    m.userData.chunkKey = chunk.key;
    meshes.push(m);
  }
  return meshes;
}
