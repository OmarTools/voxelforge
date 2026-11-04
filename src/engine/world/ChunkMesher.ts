import * as THREE from 'three';
import { BLOCK_BY_ID, isOpaqueId, type BlockDef } from '../world/Blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, type Chunk } from '../world/Chunk';
import type { VoxelWorld } from '../world/VoxelWorld';
import { tileForFace, type TextureAtlas, type UVRect } from '../render/TextureAtlas';
import { hash3 } from '../core/Noise';

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

interface Bucket {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function bucket(): Bucket {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

interface BuildData {
  opaque: Bucket;
  cutout: Bucket;
  liquid: Bucket;
  plant: Bucket;
}

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

function addQuad(data: Bucket, positions: number[], normals: number[], colors: number[], uv: UVRect) {
  const base = data.positions.length / 3;
  for (let i = 0; i < 4; i++) {
    data.positions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    data.normals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    data.colors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    const u = i === 1 || i === 2 ? uv.u1 : uv.u0;
    const v = i >= 2 ? uv.v1 : uv.v0;
    data.uvs.push(u, v);
  }
  data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function isFaceVisible(def: BlockDef, neighborId: number): boolean {
  if (!neighborId) return true;
  const n = BLOCK_BY_ID.get(neighborId);
  if (!n) return true;
  if (n.opaque) return false;
  if (!def.opaque) {
    if (neighborId === def.id) return false;
  }
  return true;
}

/** Build all four geometry buckets for a chunk. */
export function buildChunkMesh(world: VoxelWorld, chunk: Chunk, atlas: TextureAtlas): THREE.Mesh[] {
  const data: BuildData = { opaque: bucket(), cutout: bucket(), liquid: bucket(), plant: bucket() };
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
        if (!id) continue;
        const def = BLOCK_BY_ID.get(id);
        if (!def) continue;
        const wx = baseX + x;
        const wz = baseZ + z;

        if (def.render === 'cross') {
          addCross(data.plant, x, y, z, wx, wz, def, atlas, chunk);
          continue;
        }

        const isLiquid = def.render === 'liquid';
        const target = isLiquid ? data.liquid : def.opaque ? data.opaque : data.cutout;
        const aboveSame = isLiquid && world.getBlock(wx, y + 1, wz) === id;
        const surfaceY = isLiquid && !aboveSame ? 0.875 : 1;

        for (const face of FACES) {
          const nx = wx + face.normal[0];
          const ny = y + face.normal[1];
          const nz = wz + face.normal[2];
          const neighbor = world.getBlock(nx, ny, nz);
          if (!isFaceVisible(def, neighbor)) continue;

          // Don't draw a liquid's top face under another liquid.
          if (isLiquid && face.name === 'top' && aboveSame) continue;
          if (isLiquid && face.name === 'bottom' && world.getBlock(wx, y - 1, wz) === id) continue;

          const tile = tileForFace(def, face.name);
          if (!tile) continue;
          const uv = atlas.getUV(tile);

          const positions: number[] = [];
          const normals: number[] = [];
          const colors: number[] = [];
          const lightLevel = world.getSkyLight(nx, ny, nz);
          const light = 0.2 + 0.8 * (lightLevel / 15);
          const tint = 0.97 + hash3(wx, y, wz, 1337) * 0.06;

          for (let v = 0; v < 4; v++) {
            const c = face.corners[v];
            let ay = y + c[1];
            if (isLiquid && c[1] === 1) ay = y + surfaceY;
            positions.push(x + c[0], ay, z + c[2]);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);

            let ao = 1;
            if (def.opaque && !isLiquid) {
              const s1 = c[face.axis1] === 1 ? 1 : -1;
              const s2 = c[face.axis2] === 1 ? 1 : -1;
              const o1 = [nx, ny, nz];
              const o2 = [nx, ny, nz];
              const o3 = [nx, ny, nz];
              o1[face.axis1] += s1;
              o2[face.axis2] += s2;
              o3[face.axis1] += s1;
              o3[face.axis2] += s2;
              const a = isOpaqueId(world.getBlock(o1[0], o1[1], o1[2])) ? 1 : 0;
              const b = isOpaqueId(world.getBlock(o2[0], o2[1], o2[2])) ? 1 : 0;
              const cc = isOpaqueId(world.getBlock(o3[0], o3[1], o3[2])) ? 1 : 0;
              const level = a && b ? 0 : 3 - (a + b + cc);
              ao = AO_FACTORS[level];
            }

            const shade = face.shade * ao * light * tint;
            // A whisper of warmth in the highlights keeps the scene from feeling flat.
            colors.push(Math.min(1, shade * 1.01), Math.min(1, shade), Math.min(1, shade * 0.96));
          }

          addQuad(target, positions, normals, colors, uv);
        }
      }
    }
  }

  return makeMeshes(data, atlas, chunk);
}

function addCross(
  target: Bucket,
  x: number,
  y: number,
  z: number,
  wx: number,
  wz: number,
  def: BlockDef,
  atlas: TextureAtlas,
  chunk: Chunk,
) {
  const tile = def.tiles.side ?? def.tiles.top;
  if (!tile) return;
  const uv = atlas.getUV(tile);
  const h = CROSS_HEIGHT[def.key] ?? 0.85;
  const lightLevel = chunk.getLight(x, y, z);
  const light = 0.28 + 0.72 * (lightLevel / 15);
  const tint = 0.94 + hash3(wx, y, wz, 4321) * 0.1;
  const jx = (hash3(wx, 3, wz, 991) - 0.5) * 0.12;
  const jz = (hash3(wx, 4, wz, 993) - 0.5) * 0.12;
  const angle = hash3(wx, 5, wz, 995) * Math.PI;
  const half = def.key === 'torch' ? 0.08 : 0.46;
  const cx = x + 0.5 + jx;
  const cz = z + 0.5 + jz;

  for (let plane = 0; plane < 2; plane++) {
    const a = angle + plane * Math.PI * 0.5;
    const dx = Math.cos(a) * half;
    const dz = Math.sin(a) * half;
    const positions = [
      cx - dx, y + 0.02, cz - dz,
      cx + dx, y + 0.02, cz + dz,
      cx + dx, y + h, cz + dz,
      cx - dx, y + h, cz - dz,
    ];
    const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    const colors: number[] = [];
    for (let v = 0; v < 4; v++) {
      const c = light * tint;
      colors.push(Math.min(1, c * 1.02), Math.min(1, c), Math.min(1, c * 0.94));
    }
    addQuad(target, positions, normals, colors, uv);
  }
}

function makeMesh(b: Bucket, material: THREE.Material, transparentOrder: number): THREE.Mesh | null {
  if (b.positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  geo.setIndex(b.indices);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = transparentOrder;
  mesh.frustumCulled = true;
  return mesh;
}

function makeMeshes(data: BuildData, atlas: TextureAtlas, chunk: Chunk): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const opaque = makeMesh(data.opaque, atlas.materials.opaque, 0);
  const cutout = makeMesh(data.cutout, atlas.materials.cutout, 2);
  const liquid = makeMesh(data.liquid, atlas.materials.liquid, 1);
  const plants = makeMesh(data.plant, atlas.materials.plant, 3);
  for (const m of [opaque, liquid, cutout, plants]) {
    if (!m) continue;
    m.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    m.updateMatrix();
    m.userData.chunkKey = chunk.key;
    meshes.push(m);
  }
  return meshes;
}
