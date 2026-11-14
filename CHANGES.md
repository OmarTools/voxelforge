# VoxelForge enhancement notes

## Added
- **Real lighting engine** (`src/engine/world/Lighting.ts`). Sky light and block light
  flood-fill across chunk borders and update incrementally when blocks are placed or
  broken. Blocks' `light` values (torch, lantern, glowstone, lava, crystal, towers…) were
  defined and even shown in the Studio, but nothing used them; now they light the world.
  Overhangs, cave mouths and windowed rooms get soft gradients instead of a hard column test.
- **Smooth per-vertex lighting** in the mesher, plus a fix for the AO quad-diagonal
  artifact (a dark corner no longer smears across a whole face).
- **Day/night-aware block light** via a small Lambert shader patch (`render/WorldLight.ts`):
  warm torch glow that matters at night and in caves and fades under strong daylight.
- **Tests** (`npm test`): a fuzz test that checks the incremental lighting against a
  brute-force oracle, and an end-to-end world/mesher test.

## Performance (identical 81-chunk worlds, Node)
| | before | after |
|---|---|---|
| Remesh all chunks | 721 ms | 123 ms (5.9x) |
| Mine/place a block + remesh | 9.7 ms | 1.8 ms (5.5x) |
| `getBlock` x 2M | 109 ms | 40 ms (2.7x) |
| Chunk geometry memory | 31.1 MB | 19.8 MB (-36%) |
| Terrain+light+mesh, 9x9 chunks | 1424 ms | 557 ms (2.5x) |

Bulk block placement into open sky is ~2-3x slower per block (about +1-2 us each): the cost of real lighting.

Causes fixed: string-keyed chunk lookup on every voxel read, per-face temporary arrays,
Map lookups for block properties, chunks being meshed several times as neighbours
streamed in, and a per-frame allocation+sort whenever any out-of-range chunk was dirty.

## Fixed
- **MCP bridge security**: it sent `Access-Control-Allow-Origin: *` with no auth by default
  and parsed any POST as JSON, so any website could drive your editor (a `text/plain` POST
  needs no preflight). It now rejects non-loopback origins and unknown Host headers
  (DNS rebinding), compares tokens in constant time, caps the command queue, and returns
  400 for malformed JSON. See `mcp/README.md` for opt-in settings.
- Acacia canopies were sliced at chunk borders (they reach 6 blocks from the trunk).
- Autosave failures (full storage) were silent; the player is now warned once.
- Chunk-border neighbours weren't remeshed when `loadEdits` touched a border block.
- `public/engine/voxelforge-runtime.js` rebuilt so exported games get the new engine.

## Compatibility
Terrain generation is unchanged except acacia trees near chunk edges. The cave-carving
speedup was verified byte-identical on all 7 presets, so existing saves still line up.

## Known limitations / not changed
- User scripts run via `new Function` and are **not sandboxed** (full page access;
  `while(true){}` freezes the tab). Treat imported projects as trusted code. A real fix
  needs a Worker/iframe sandbox.
- Terrain generation and meshing still run on the main thread (a worker would remove
  streaming hitches but complicates the single-file exported runtime).
- Transparent blocks don't dim light, so water is not darker underwater.
- Verified: type-check, build, fuzz + e2e tests, shader anchors and GLSL compilation.
  Not verified: an actual in-browser render (no WebGL2 available in the sandbox), so
  give the lighting a visual once-over.
