/**
 * End-to-end: real terrain generator + VoxelWorld + mesher (stub atlas).
 * Checks structural invariants of the generated meshes and that block edits
 * and torches flow through lighting into the vertex data.
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../src/engine/world/VoxelWorld';
import { block, OPAQUE_TABLE } from '../src/engine/world/Blocks';
import { WORLD_HEIGHT } from '../src/engine/world/Chunk';
import type { TextureAtlas } from '../src/engine/render/TextureAtlas';

const mat = () => new THREE.MeshBasicMaterial();
const atlas = {
  getUV: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }),
  materials: { opaque: mat(), cutout: mat(), liquid: mat(), plant: mat() },
} as unknown as TextureAtlas;

const world = new VoxelWorld(atlas, 1337, 'overworld');
world.ensureArea(-48, -48, 48, 48); // 7x7 chunks
assert.ok(world.chunks.size >= 49, 'chunks generated');

// 1. Opaque-bucket quad count == brute-force count of exposed opaque faces (interior chunk).
const centre = world.getChunk(0, 0)!;
let expected = 0;
for (let y = 0; y < WORLD_HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
  const id = world.getBlock(x, y, z);
  if (!id || !OPAQUE_TABLE[id] || world.getBlock(x, y, z) === 0) continue;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const n = world.getBlock(x + dx, y + dy, z + dz);
    if (!n || !OPAQUE_TABLE[n]) expected++;
  }
}
const opaqueMesh = centre.meshes.find((m) => m.material === atlas.materials.opaque)!;
const quads = opaqueMesh.geometry.getAttribute('position').count / 4;
assert.equal(quads, expected, 'opaque quad count matches brute-force visible faces');

// 2. Attribute sanity.
for (const m of centre.meshes) {
  const g = m.geometry;
  for (const name of ['position', 'normal', 'uv', 'color', 'aLight']) assert.ok(g.getAttribute(name), `has ${name}`);
  const idx = g.getIndex()!;
  const vc = g.getAttribute('position').count;
  for (let i = 0; i < idx.count; i++) assert.ok(idx.getX(i) < vc, 'index in range');
  assert.equal(idx.count % 6, 0);
}

// 3. Torch in a dark cave lights nearby faces; removing it restores darkness.
//    Carve a sealed 5x5x5 room deep underground in chunk (0,0).
const stone = block('stone').id;
const torch = block('torch').id;
for (let y = 8; y <= 14; y++) for (let z = 4; z <= 10; z++) for (let x = 4; x <= 10; x++) world.setBlock(x, y, z, stone);
for (let y = 9; y <= 13; y++) for (let z = 5; z <= 9; z++) for (let x = 5; x <= 9; x++) world.setBlock(x, y, z, 0);
assert.equal(world.getBlockLight(7, 11, 7), 0, 'sealed room starts dark');
assert.equal(world.getSkyLight(7, 11, 7), 0, 'sealed room has no sky light');
world.setBlock(7, 9, 7, torch);
assert.equal(world.getBlockLight(7, 9, 7), block('torch').light, 'torch cell holds its emission');
const lvl = (x: number, y: number, z: number) => world.getBlockLight(x, y, z);
assert.ok(lvl(7, 10, 7) === lvl(7, 9, 7) - 1, 'falls off by 1 per block');
assert.ok(lvl(5, 13, 5) > 0, 'reaches the far corner of the room');
world.meshChunkNow(0, 0);
const brightVerts = (() => {
  const m = world.getChunk(0, 0)!.meshes.find((mm) => mm.material === atlas.materials.opaque)!;
  const a = m.geometry.getAttribute('aLight');
  let n = 0;
  for (let i = 0; i < a.count; i++) if (a.getY(i) > 0.3) n++;
  return n;
})();
assert.ok(brightVerts > 20, `mesh carries block light in vertex data (${brightVerts} bright verts)`);
world.setBlock(7, 9, 7, 0);
assert.equal(world.getBlockLight(7, 10, 7), 0, 'removing the torch removes its light');
assert.equal(world.getBlockLight(5, 13, 5), 0);

// 4. Breaking a roof lets the sun in; placing it back shadows again.
for (let y = 15; y < WORLD_HEIGHT; y++) for (let z = 4; z <= 10; z++) for (let x = 4; x <= 10; x++) world.setBlock(x, y, z, 0);
world.setBlock(7, 14, 7, 0); // open a skylight hole above the room
assert.equal(world.getSkyLight(7, 13, 7), 15, 'sunlight pours through the hole');
assert.ok(world.getSkyLight(5, 9, 5) > 0, 'sky light spreads sideways in the room');
world.setBlock(7, 14, 7, stone);
assert.equal(world.getSkyLight(7, 13, 7), 0, 'sealing it restores darkness');

// 5. Streaming path: update() eventually meshes everything without remeshing loops.
const streaming = new VoxelWorld(atlas, 99, 'overworld');
for (let i = 0; i < 400; i++) streaming.update(0, 0, 0.016);
let unmeshed = 0;
for (const c of streaming.chunks.values()) if (c.dirty) unmeshed++;
assert.ok(streaming.chunks.size > 20, 'streamed chunks');
assert.ok(unmeshed <= streaming.chunks.size * 0.15, `most streamed chunks meshed (${unmeshed} dirty of ${streaming.chunks.size})`);

console.log('world/mesher end-to-end OK');
