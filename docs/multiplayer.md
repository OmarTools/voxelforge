# VoxelForge Multiplayer — Design Proposal

**Status:** proposal only — nothing in this document is implemented.
**Scope:** an *additional* way to play. Single-player stays first-class and fully offline.

---

## 0. Ground rules

These are non-negotiable and should be checked on every multiplayer PR.

1. **Additive, never replacing.** `npm run dev` and `npm run build` keep producing today's offline
   game. No server, no account, no network call is required to launch, save, or finish a world.
2. **Same codebase, second entry point.** The server reuses `src/content` (templates, prefabs,
   recipes, entities) and the game systems. It is not a fork.
3. **Local saves keep working.** `localStorage["voxelforge.save.latest"]` and the
   `GameSaveData` shape stay the single-player format. Server worlds use the same shape plus
   server-only fields, so a world can be exported from a server and opened locally (and vice versa).
4. **Offline UI is unchanged.** Multiplayer entries only appear when a server URL is configured
   (build flag or `?server=`), so the GitHub Pages / static build looks and behaves exactly as it
   does now.
5. **No silent world mutation.** Joining a server never overwrites the local save slot.

---

## 1. The two modes

The request is explicit: one invite-based mode, and one mode where players join a single shared
world directly — **not** a room per group.

### Mode A — Invite Rooms

A private world created on demand, reachable only by code or link.

| | |
|---|---|
| Entry | "Create room" in the main menu, or "Invite friends" in the pause menu |
| Address | `https://play.example.com/room/CINDER-4F2K` (code is the whole credential) |
| Capacity | 2–8 (Cinderburst: 4) |
| Lifetime | host-owned; ends when the host leaves, or 24 h TTL for "keep alive" rooms |
| Discovery | none — no public list, no matchmaking |
| Persistence | snapshot on create, autosave while active, kept 30 min after the last player leaves |
| Settings | host picks template, difficulty, PvP, keepInventory, friendly fire |
| Use cases | friends playing Cinderburst, a one-off survival session, testing a template together |

Room codes are short, human-readable, and rate-limited (5 failed joins per IP per minute) so they
can't be brute-forced.

### Mode B — Open World (one shared shard)

The server hosts **one** world. Everyone who connects is in that same world. There is no room
concept and no per-group instancing.

| | |
|---|---|
| Entry | "Join server" → address, or a server-browser entry, or a `voxelforge://` link |
| Address | `wss://play.example.com` — one world per server process |
| Capacity | 16–32 concurrent (configurable); queue with position when full |
| Lifetime | persistent 24/7; the world only ticks while at least one player is connected |
| Discovery | optional public server list; otherwise address-only |
| Persistence | SQLite world file + rolling backups every 15 min, 48 h retention |
| Permissions | guest → member → op; optional allowlist and/or server password |
| Use cases | a community survival world, a persistent Cinderburst ladder, a shared creative plot world |

**The distinction in one line:** *a room creates a world for a group; open world is a world that
people join.*

Both modes share the same server binary, protocol, and world format. The only difference is how a
session is allocated:

```
connect ──► auth ──► mode?
                     ├─ room  : look up code → attach to that world instance
                     └─ open  : attach to the singleton shard world
```

A server can enable either mode, both, or neither (`mode: "rooms" | "open" | "both"`).

---

## 2. Architecture

### 2.1 Authority model

**Server-authoritative, client-predicted.** The server owns blocks, entities, inventory, damage,
bombs, fuses, crates, and objective counters. Clients send *inputs*; the server sends *state*.

Lockstep is explicitly rejected: floating-point physics is not bit-identical across machines and
browsers, so determinism cannot be assumed. Prediction + reconciliation is the correct model.

| Loop | Rate | Payload |
|---|---|---|
| Server sim tick | 20 Hz | inputs applied, physics, sim systems |
| Server snapshot | 12 Hz | player states, entity deltas, bomb/fuse state |
| Client input | 20 Hz | move vector, yaw/pitch, action bits |
| Client render | display rate | interpolate remote players 100 ms behind |

### 2.2 Module split

The blocker today is coupling: world gen, entities, and sims all assume a browser + `THREE`.

```
src/
  core/                  ← NEW: no DOM, no renderer, no THREE
    world/               ← VoxelWorld generation + edits (seed → chunks)
    sim/                 ← BomberSystem, RoyaleSystem, SiegeSystem, …
    entities/            ← spawn, AI, damage resolution
    inventory/           ← stack logic, power-up consumption
  engine/                ← browser-only: renderer, input, HUD, audio, menus
  net/                   ← NEW: protocol, client transport, prediction
server/                  ← NEW: node entry point
  index.ts               ← ws server, room/shard manager, auth
  world-store.ts         ← SQLite persistence, backups
  protocol.ts            ← shared with src/net
```

`THREE.Vector3` is the main offender. Replace it in `core/` with a tiny `Vec3` struct and convert
at the renderer boundary. This is mechanical but touches a lot of files; do it incrementally,
template by template.

### 2.3 What is already sync-friendly

| Existing piece | Multiplayer use |
|---|---|
| `VoxelWorld.getEdits()` → `[x, y, z, id][]` | The world is a seed plus a diff list. Sync the seed once, then stream edits. |
| Seeded terrain generation | No terrain transfer on join; both sides generate identical chunks. |
| `Game.buildProjectData()` | Already contains seed, edits, entities, player, rules — becomes the world file. |
| `serializeEntity()` | Clean entity wire format; add a `netId` and velocity. |
| `SimSystem` interface | Sims are already isolated behind one interface; Cinderburst is a 4-slot arena with compact state. |
| `BomberSystem` | Best first online mode: fixed grid, 3 power-ups, no terrain generation during a round. |

### 2.4 Protocol sketch

Binary WebSocket frames, little-endian, quantized:

```
C→S  Hello        { protocol, name, version }
S→C  Welcome      { playerId, mode, worldName, tickRate, seed, templateKey, rules }
S→C  ChunkData    { cx, cz, palette, rle }
S→C  WorldEdits   { [[x,y,z,id], …] }
C→S  Input        { seq, moveX, moveZ, yaw, pitch, buttons }
S→C  Snapshot     { tick, ackSeq, players[], entities[], bombs[] }
S→C  BlockChanged { x, y, z, id }
C→S  PlaceBlock   { x, y, z, face, item }
C→S  UseItem      { slot }
C→S  Chat         { text }
S→C  Event        { kind, payload }   // crate opened, rival out, round won
```

Rules:
- Inputs carry a sequence number; snapshots ack the last one processed.
- Positions are sent as fixed-point (1/32 block) — 3 × `int32` per player.
- Entity deltas, not full lists: spawn/despawn/state-change only.
- Edits are broadcast as diffs; late joiners get `WorldEdits` once.

### 2.5 Persistence

```
data/
  worlds/
    <worldId>/
      world.json      ← GameSaveData + { version, createdAt, rules, allowlist }
      players.json    ← per-player inventory, position, stats
      backups/<ts>.json
  rooms/
    <code>.json       ← room metadata + pointer to a world snapshot
```

Autosave every 30 s while dirty, on last-player-leave, and on SIGINT. Write to a temp file then
rename (atomic), keeping the previous version as a backup.

### 2.6 Security

- Never trust a client block placement: validate reach (≤ 6 blocks), line of sight, and that the
  target cell is empty.
- Rate-limit inputs (drop clients sending > 60/s), chat (5 msgs / 10 s), and room-code attempts.
- Server owns damage and drops; the client only renders the result.
- Cap snapshot size per player per tick (drop far entities before dropping nearby ones).
- Optional TLS via a reverse proxy (Caddy/nginx) — never ship a plaintext public endpoint.

---

## 3. Refactor checklist

- [ ] Introduce `Vec3` and remove `THREE` from `core/`
- [ ] Move `VoxelWorld` generation + edits behind a renderer-free interface
- [ ] Decouple `GameEntity` from `THREE.Object3D` (separate sim state from the visual model)
- [ ] Extract inventory/power-up logic from `Player`
- [ ] Make `SimSystem` implementations tick without `Game`'s DOM-bound fields
- [ ] Add `netId` to entities and a stable entity id scheme
- [ ] Split `GameSaveData` into `WorldState` (server) and `ClientState` (camera, HUD, settings)
- [ ] Keep `npm run build` byte-compatible with today's offline bundle

---

## 4. Phases

### Phase 0 — Foundations (no networking yet)
- [ ] `core/` split, `Vec3`, headless world tick test
- [ ] `server/smoke.ts` that generates a world and ticks it 600 times in Node
- [ ] Verify a headless round of Cinderburst resolves with bots (already possible via sim QA)

### Phase 1 — Invite Rooms MVP
- [ ] WebSocket server + room create/join by code
- [ ] Movement sync with prediction + reconciliation
- [ ] Block place/break sync
- [ ] Chat + player list + join/leave toasts
- [ ] Room settings and host controls
- [ ] One template end-to-end (Survival first, then Cinderburst)

### Phase 2 — Open World
- [ ] Singleton shard mode, persistent world file, autosave + backups
- [ ] Allowlist / password / op commands (`/op`, `/kick`, `/save`, `/time`)
- [ ] Join queue and capacity handling
- [ ] Public server-list JSON endpoint (optional)

### Phase 3 — Game modes online
- [ ] Cinderburst 2–4 player PvP with server-owned fuses and crates
- [ ] Royale and Siege co-op
- [ ] Shared objectives and quest progress rules (per-player vs world)

### Phase 4 — Operations
- [ ] Dockerfile + `docker-compose.yml` (server + Caddy)
- [ ] Metrics endpoint, structured logs, crash restart
- [ ] Backup restore CLI
- [ ] Version handshake and graceful "server outdated" message

---

## 5. Hosting

| Option | Fit | Notes |
|---|---|---|
| Hetzner CX22 / DigitalOcean droplet + Docker | Best value; full control; persistent disk | €4–6/mo, dozens of 8-player rooms or one 32-player shard |
| Fly.io (shared-cpu-1x, 512 MB + volume) | Easiest deploys, scale-to-zero, regions | $3–5/mo per machine; volume for worlds |
| Railway / Render | Zero-ops beta | $5–7/mo; watch idle spin-down |
| Cloudflare Durable Objects | One DO per world, WebSocket hibernation | Cheap at small scale, but the 20 Hz tick needs alarm-driven design |

A single Node process is enough for the first year. Shard only when one process can't hold the
player count — the world format is per-file, so sharding is "one process per world directory".

Bandwidth budget: ~30–60 KB/s per player after the initial chunk load. A 32-player shard is
roughly 2 MB/s outbound at peak, which any small VPS handles.

---

## 6. Effort

| Milestone | Estimate |
|---|---|
| Phase 0 (core split) | 1–2 weeks |
| Phase 1 (rooms MVP) | 2–3 weeks |
| Phase 2 (open world + admin) | 2 weeks |
| Phase 3 (online game modes) | 3–4 weeks |
| Phase 4 (ops polish) | 1 week |
| **Total to product-grade** | **~2–3 months of focused work** |

Ship Phase 1 behind a flag first; it validates the protocol before the world-persistence and
permission work lands.

---

## 7. Open questions

- **Do open-world players share quest progress or keep their own?** Recommendation: per-player,
  with world-level events (boss kills, wave clears) shared.
- **Does the open world tick while empty?** Recommendation: no — freeze time and crops; resume on
  join. Keeps CPU and surprise logged-out deaths at zero.
- **One shard per template, or one world that changes template?** Recommendation: one shard per
  template key (`open/survival`, `open/creative`), so Cinderburst never fights a survival world
  for space.
- **Guest identity vs accounts.** Start with a device-bound guest id + optional display name;
  add accounts only when cross-device saves are requested.
- **Moderation.** Text chat filter + `/mute` + allowlist is enough for v1.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Core refactor destabilises single-player | Land it in small PRs with the 22-template smoke test as the gate |
| Snapshot bandwidth blows up with entities | Delta encoding + distance culling; measure early with a bot-filled world |
| Cheating in PvP | Server-owned sim state; client inputs only |
| Save corruption on crash | Atomic writes + rolling backups + a `--verify` CLI |
| Two code paths drift | One `GameSaveData` schema, shared types in `src/net/protocol.ts` |
| Scope creep into "replace single-player" | Section 0 ground rules, enforced in review |

---

## 9. Decision log

| Date | Decision |
|---|---|
| 2026-11-06 | Multiplayer stays a proposal; no implementation yet. |
| 2026-11-06 | Two modes required: invite rooms **and** one shared open world. No per-group instancing in open mode. |
| 2026-11-06 | Server is additive; offline builds and local saves are unchanged. |
| 2026-11-06 | Server-authoritative with client prediction; lockstep rejected. |
