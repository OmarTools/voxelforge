# VoxelForge Multiplayer — Design & Implementation

**Status:** Phase 1 (invite rooms) and the Phase 2 shared-world slices — persistence, access control and
operator tools — are implemented and shipped behind a server flag. The remaining Phase 2–4 work is still
design.
**Scope:** an *additional* way to play. Single-player stays first-class and fully offline.

---

## What ships today

The online slices run on top of the existing offline game. Everything here is opt-in: with no server
configured, the bundle behaves exactly like the single-player build.

### Running it locally

```bash
npm run server        # invite rooms on ws://127.0.0.1:8787, health at /health
npm run server:open   # shared world only (persists to data/worlds/open.json)
npm run dev           # game on http://127.0.0.1:5177
```

Open `http://127.0.0.1:5177/?server=ws://127.0.0.1:8787`, choose **Multiplayer** on the title screen,
then host a room or start/join the shared world. Invite links look like
`http://127.0.0.1:5177/?server=ws://127.0.0.1:8787&room=CINDER-4F2K`; `?room=` pre-fills the join box
and a bare suffix (`4F2K`) also works. Building with `VITE_MULTIPLAYER_URL=wss://play.example.com`
shows the Multiplayer entry without any query string.

The server reads:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | WebSocket + health port |
| `HOST` | `0.0.0.0` | Bind address |
| `MODES` | `rooms` | `rooms`, `open`, or `both` (`--open` = open only) |
| `WORLD_FILE` | `data/worlds/open.json` | Shared-world save location |
| `WORLD_BACKUPS` | `8` | Rolling backups kept beside the save |
| `OPEN_PASSWORD` | *(empty)* | Shared-world password; unset means no password |
| `OPEN_ALLOWLIST` | *(empty)* | Comma-separated display names allowed into the shared world |
| `ADMIN_TOKEN` | *(empty)* | Token a client may claim per-session operator rights with |
| `ALLOWED_ORIGINS` | *(any)* | Comma-separated browser-origin allowlist |

`OPEN_PASSWORD` and `OPEN_ALLOWLIST` gate the shared world *before* genesis, so an unauthorized
visitor cannot create the world or fill the save file with a stranger's template. Both are operator
secrets and are never sent to clients; the lobby only learns whether a password or allowlist exists.
Set `ADMIN_TOKEN` when the operator cannot reach the server console (hosted deployments) — otherwise
grant op with the console `op <name>` command.

Set `ALLOWED_ORIGINS` before exposing the socket publicly, and terminate TLS in front of it.

### What works today

| Area | Behaviour |
|---|---|
| Transport | One WebSocket per session, JSON text frames, protocol `1`, 4 s ping |
| Modes | Invite rooms, one persistent shared world, or both per server |
| Invite rooms | `WORD-XXXX` codes, create/join/late join, 8 players, 24 h TTL, host-owned |
| Shared world | One world per process, joins without a code, survives restarts, up to 8 players |
| World | Host/first player uploads `seed`, `baseY`, `skyTime`, `rules`, `spawn` and the edit list; everyone regenerates the same deterministic terrain and replays the edits |
| Movement | 66 ms client input (≈15 Hz), 12 Hz server snapshots, remote avatars smoothed toward the latest snapshot |
| Blocks | Place/break apply locally first, are relayed, then reach peers through `Game.applyRemoteBlock` (never re-recorded in the local edit log) |
| Chat | Enter opens chat, Enter sends, Esc cancels; 180 chars, 5 messages / 10 s; `/help` and operator commands |
| Roster | Live player list with host and op badges, player count and round-trip latency |
| Access | Optional `OPEN_PASSWORD` and/or `OPEN_ALLOWLIST`, checked before genesis; the lobby shows only "password"/"private" flags |
| Operators | Per-session rights from the console (`op <name>`) or `ADMIN_TOKEN`; `/kick`, `/time`, `/save`, `/say`, `/op`, `/deop` |
| Persistence | Shared world: atomic JSON write + rolling backups, autosave every 30 s, on last leave, and on shutdown |
| Saves | `saveGame()` is a no-op while `game.multiplayerActive`; the local slot is never written from a server world |
| Leaving | Pause menu → *Leave multiplayer room*; the host leaving closes an invite room, a shared world stays open |

### Shared-world access and operators

The shared world is public by default. Two independent gates can be added before launch:

```bash
OPEN_PASSWORD=hunter2 OPEN_ALLOWLIST="Ada, Grace" npm run server:open
```

- The password is compared as SHA-256 digests with `timingSafeEqual`; the plaintext never leaves the
  process.
- The allowlist matches display names case-insensitively. Names are not identities, so the allowlist
  is a filter for friendly servers, not an account system.
- Failed password/allowlist attempts share the 5-per-minute per-IP join limiter.
- The lobby renders the lock flags, a password field, and a Join/Start button. The client performs
  a `check_open` preflight, so a typo is rejected in the lobby instead of after terrain generation.

Operators are **per session**, not a property of a display name (which could be spoofed). An operator
is created by:

1. the server console (`op <name>`), or
2. a client claiming `ADMIN_TOKEN` with the `op` message; the browser keeps the token in
   `sessionStorage` and re-claims it after a reload.

Operator chat commands:

| Command | Effect |
|---|---|
| `/help` | Show the command list (everyone can run this) |
| `/kick <name> [reason]` | Remove one player and close their socket; the world stays open |
| `/time <0-24>` | Set the shared-world sky time and push it to every client |
| `/save` | Write the shared world to disk immediately |
| `/say <text>` | Broadcast a system chat line |
| `/op <name>` / `/deop <name>` | Grant/revoke operator rights for a connected session in this room |

Server console: `help`, `status`/`players`, `say <text>`, `kick <name> [reason]`,
`op <name>`, `deop <name>`, `save`, `time <0-24>`, `quit`. The console is line-based and safe to
pipe from a process manager, and its `kick`/`op`/`deop` search every room.

### Deliberate limits

- **Relay authority, not simulation.** The server validates and rebroadcasts; it does not run physics
  yet. A horizontal speed guard (18 m/s) rejects teleport-style input, and block edits are checked for
  reach (≤ 7.5 blocks) and id range.
- **No host migration.** Invite rooms belong to their creator; when the host leaves, the room closes.
- **Shared-world genesis comes from the first player.** The server cannot compute a template's base
  height on its own yet, so whichever client starts an empty shared world uploads its descriptor. From
  then on the server's saved copy is authoritative.
- **Shared-world settings are operator-managed.** There is no player host, so ordinary clients cannot
  change room settings; operators moderate through chat commands or the server console. Time and
  persistence commands apply to the shared world only.
- **Sky time is frozen at genesis until an operator changes it.** `/time` updates the descriptor and
  all connected clients; day/night still does not advance on its own.
- **No reconnect loop.** A dropped socket returns to the main menu; rejoining reloads the world.
- **JSON, not binary.** Frames stay human-inspectable until the message set settles.
- **Per-client systems.** Entities, damage, objectives and sims still run locally and are not
  synchronised, so there is no PvP yet.

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

| Aspect | Behaviour | Status |
|---|---|---|
| Entry | Multiplayer on the title screen; leave from the pause menu | **shipped** |
| Address | `https://play.example.com/?server=wss://play.example.com&room=CINDER-4F2K` (code is the whole credential) | shipped |
| Capacity | 2–8 | shipped (max 8) |
| Lifetime | host-owned; ends when the host leaves, 24 h TTL | shipped |
| Discovery | none — no public list, no matchmaking | shipped |
| Persistence | snapshot on create, autosave while active, kept 30 min after the last player leaves | **rooms are in-memory; shared world persists** |
| Settings | host picks template, difficulty, PvP, keepInventory, friendly fire | wire format + server relay only; no host UI yet |
| Use cases | friends playing Cinderburst, a one-off survival session, testing a template together | any of the 28 templates can be hosted today |

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

**Implemented subset (2026-11-15):** one shard per process (`MODES=open|both`), joins without a code,
genesis from the first player's descriptor, atomic JSON save with 8 rolling backups, autosave every
30 s / on last leave / on shutdown, optional password + allowlist gates, per-session operators with
kick/time/save/say/op commands and a server console. Not yet: SQLite + 48 h retention, a full
guest/member/op account model, join queue, public server list.

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
  index.mjs              ← ws server, room/shard manager, validation
  world-store.mjs        ← atomic JSON persistence + rolling backups
  (protocol stays shared via src/net/protocol.ts)
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

Phase 1 ships a JSON envelope that mirrors the binary plan, so the transport can be swapped without
touching session logic. Every frame is `{ "t": "<type>", … }`:

```
C→S  hello        { protocol, name, version }
S→C  hello        { protocol, version, playerId, serverTime, modes, openAccess, admin, openWorld }
C→S  create_room  { name, world: { templateKey, seed, baseY, skyTime, rules, spawn, edits[] }, settings }
C→S  join_room    { name, code }
C→S  check_open   { name, password? }   // gate preflight, no join
S→C  open_ok      { locked, private }
C→S  join_open    { name, password?, world? }   // world only for genesis
S→C  room_joined  { room, you: { id, op, spawn, yaw }, world, players[] }
S→C  player_joined / player_left / host_changed / room_closed
C→S  op           { token }             S→C  op      { op, by? }
C→S  input        { seq, x, y, z, yaw, pitch, moving }
S→C  snapshot     { tick, players: [{ id, x, y, z, yaw, pitch, moving, host, op }] }
C→S  block        { x, y, z, id }
S→C  block        { x, y, z, id, from }
C→S  chat         { text }              S→C  chat   { from, name, text, at, system? }
C→S  settings|kick|leave|ping           S→C  settings|time|error|pong
```

The binary target (still the goal for Phase 2+) is:

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

Binary target rules:
- Inputs carry a sequence number; snapshots ack the last one processed.
- Positions are sent as fixed-point (1/32 block) — 3 × `int32` per player.
- Entity deltas, not full lists: spawn/despawn/state-change only.
- Edits are broadcast as diffs; late joiners get `WorldEdits` once.

### 2.5 Persistence

Invite rooms are in memory only: they die with the host. The shared world is written to disk:

```
data/
  worlds/
    open.json                 ← { version, savedAt, createdAt, world, settings, edits[] }
    backups/
      open-<timestamp>-<rand>.json
```

Writes go to `open.json.tmp` and are renamed over the save, with the previous version copied into
`backups/` first. The store keeps 8 backups (`WORLD_BACKUPS`). Flushes happen every 30 s while dirty,
when the last player leaves, and on `SIGINT`/`SIGTERM`; a corrupt save is reported and the server
starts a fresh world rather than crashing.

The larger layout below remains the target for multi-world hosting:

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

- Never trust a client block placement: validate reach, id range and the edit budget. Phase 1
  enforces reach ≤ 7.5 blocks, a known block id, and a per-room edit cap; line-of-sight and
  target-cell checks come with server-side simulation.
- Rate-limit inputs (drop clients sending > 60/s), chat (5 msgs / 10 s), and room-code attempts.
  Phase 1 ships the chat limit and 5 failed joins per IP per minute. Failed shared-world passwords
  and operator tokens use the same per-IP limiter.
- Shared-world passwords and `ADMIN_TOKEN` are compared by SHA-256 digest with `timingSafeEqual`;
  the plaintexts stay on the server. Operator rights are per session, so a copied display name
  cannot inherit them. The name allowlist is a friendly-server filter, not an identity system.
- Server owns damage and drops; the client only renders the result. Not yet — each client still owns
  its own entities.
- Cap snapshot size per player per tick (drop far entities before dropping nearby ones).
- Optional TLS via a reverse proxy (Caddy/nginx) — never ship a plaintext public endpoint.

---

## 3. Refactor checklist

Phase 1 shipped *without* this split: it relays client-simulated positions and trusts each client's
own entities. The checklist stays the gate for server-authoritative movement, damage and sims.

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

### Phase 1 — Invite Rooms MVP (shipped 2026-11-15)
- [x] WebSocket server + room create/join by code
- [x] Movement sync — client-simulated and server-relayed; prediction/reconciliation pending
- [x] Block place/break sync
- [x] Chat + player list + join/leave toasts
- [x] Room settings and host controls — wire format + server relay; host UI pending
- [x] One template end-to-end — every template can host; Creative and Survival were QA'd

### Phase 2 — Open World (first slice shipped 2026-11-15)
- [x] Singleton shard mode — `MODES=open|both`, one shared world per process
- [x] Persistent world file, autosave + backups — `server/world-store.mjs`, `data/worlds/open.json`
- [ ] SQLite world file + 48 h retention
- [x] Allowlist / password / op commands — `OPEN_PASSWORD`, `OPEN_ALLOWLIST`, `ADMIN_TOKEN`, console,
      `/kick`, `/time`, `/save`, `/say`, `/op`, `/deop`
- [ ] Full guest/member/op account model and a durable allowlist UI
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
| Phase 1 (rooms MVP) — shipped 2026-11-15 as a relay slice | 2–3 weeks |
| Phase 2 (open world + admin) — shared-world, access-control and operator slices shipped 2026-11-15 | 2 weeks |
| Phase 3 (online game modes) | 3–4 weeks |
| Phase 4 (ops polish) | 1 week |
| **Total to product-grade** | **~2–3 months of focused work** |

Ship Phase 1 behind a flag first; it validates the protocol before the world-persistence and
permission work lands.

The shipped Phase 1 is a *relay* MVP: it proves rooms, joins, movement visibility, chat and block
sync without waiting on the headless core split. The server-authoritative version (Phase 0 + a real
server tick) is still the target, and the remaining Phase 1 checklist items are tracked in §3.

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
| Core refactor destabilises single-player | Land it in small PRs with the 28-template smoke test as the gate |
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
| 2026-11-15 | Phase 1 shipped as an invite-room **relay** slice: JSON frames, server rebroadcasts validated client positions. Server simulation waits for the headless core split. |
| 2026-11-15 | Room codes are `WORD-XXXX`, case-insensitive; joins accept the bare suffix. Rooms are host-owned and die with the host — no migration in v1. |
| 2026-11-15 | Multiplayer is gated on `?server=` or `VITE_MULTIPLAYER_URL`; no server means no socket, no extra UI, no change to the offline bundle. |
| 2026-11-15 | Local saves are frozen while attached: `Game.saveGame()` returns early on `multiplayerActive`, so a server world can never overwrite `voxelforge.save.latest`. |
| 2026-11-15 | Shared world: one shard per process, selected with `MODES=open` or `MODES=both`; rooms stay invite-only and in memory. |
| 2026-11-15 | Shared-world genesis comes from the first player's descriptor because the server cannot derive a template's `baseY` yet; the saved copy is authoritative afterwards. |
| 2026-11-15 | Shared world persists as atomic JSON with 8 rolling backups; SQLite and 48 h retention wait for the multi-world layout. |
| 2026-11-15 | Shared-world access is optional and checked **before** genesis: `OPEN_PASSWORD` plus a comma-separated, case-insensitive `OPEN_ALLOWLIST`. Secrets are compared as SHA-256 digests with `timingSafeEqual`, and failed gate attempts share the join limiter. |
| 2026-11-15 | Operators are per session, never name-based: the console can `op <name>`, or a client can claim `ADMIN_TOKEN`. The token lives in `sessionStorage` and is re-claimed after a reload. |
| 2026-11-15 | Operator chat commands are `/help`, `/kick`, `/time`, `/save`, `/say`, `/op`, `/deop`; the same actions exist on the stdin console. `/time` and `/save` apply to the shared world only. |
| 2026-11-15 | The lobby preflights the gate with `check_open`, so a wrong password is rejected before terrain generation. If two players race genesis, the server's saved descriptor wins and the losing client regenerates. |
