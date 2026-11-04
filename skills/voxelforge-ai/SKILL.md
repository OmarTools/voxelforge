---
name: voxelforge-ai
description: Drive a live VoxelForge game/engine through its MCP tools — inspect state, switch the five cameras, drive karts, build worlds, edit VoxelScript and visual rules, launch templates, and publish web/desktop/Android/iOS packages. Use when the task mentions VoxelForge, its MCP server, or editing/publishing a VoxelForge game.
---

# VoxelForge AI control

VoxelForge is a TypeScript + Three.js voxel engine and studio. A local MCP
server (`mcp/voxelforge-mcp.mjs`) talks to the running browser game through a
localhost queue. Every tool returns plain JSON in `structuredContent` and as a
text block.

## Boot checklist

1. The game must be open in a browser (dev server or published build).
2. The browser bridge must be running: **Publish → AI control → Start bridge**.
   Its badge shows **ONLINE**.
3. The MCP server must be running: `node mcp/voxelforge-mcp.mjs`.
   For raw HTTP-only control, start it with `--http-only` (or
   `VOXELFORGE_MCP_HTTP_ONLY=1`); MCP stdio is then disabled but `/health` and
   `/command` keep working.
4. Call `voxelforge_state` first. If it times out, fix the bridge before editing.

`voxelforge_health` is not an MCP tool; use HTTP `GET /health` or the
`voxelforge_state` call. The AI tab also has **Ping server**.

## Golden rules

- **Read before write.** `voxelforge_state` and `voxelforge_get_scripts` first.
- **Discover keys.** `voxelforge_list` with `kind` = `templates`, `items`,
  `blocks`, `prefabs`, `entities`, `cameras` or `commands`.
- **Coordinate space is absolute world space.** Y is up. The template spawn is
  `[x, z]` with feet at `baseY + 1`. Prefab stamp positions are also absolute;
  a prefab's own Y is added to the given Y.
- **Publishing uses a fresh start.** `voxelforge_export` / `voxelforge_publish`
  reset the player, objectives, waves and stats to the template start while
  keeping world edits, studio props, rules, scripts, camera, vehicle and
  starting gear.
- **Do not stamp giant prefabs without checking the area.** Read state, then
  teleport or inspect nearby coordinates.
- **Scripts are sandboxed VoxelScript, not full JavaScript.** Only the API below
  is in scope inside the script factory; browser globals are not provided.
- **One change at a time when debugging.** Re-read state after each command.

## Tools

| Tool | Arguments | Notes |
| --- | --- | --- |
| `voxelforge_state` | none | Player, camera, vehicle, race, sim, world, objectives, scripts |
| `voxelforge_list` | `kind` | Content catalog |
| `voxelforge_launch` | `template` | Starts a template from scratch |
| `voxelforge_camera` | `mode` or `cycle` | `first`, `third`, `isometric`, `top-down`, `side`, `next` |
| `voxelforge_vehicle` | `enabled?`, `style?` | `kart` or `car`; omit enabled to toggle |
| `voxelforge_teleport` | `x`, `y`, `z` | Absolute position |
| `voxelforge_look` | `yaw?`, `pitch?` | Radians; pitch clamped ±1.5 |
| `voxelforge_give` | `item`, `count?` | Item keys from `list kind=items` |
| `voxelforge_spawn` | `entity`, `x?`, `y?`, `z?`, `name?`, `behavior?` | Entity keys look like `human:soldier_rifle` |
| `voxelforge_set_time` | `hour` | 0–23.99 |
| `voxelforge_set_weather` | `weather` | `clear`, `rain`, `snow`, `ash` |
| `voxelforge_get_scripts` | none | Full script project |
| `voxelforge_run_script` | `source` | Replaces and restarts VoxelScript |
| `voxelforge_set_rule` | `rule`, `value` | World rules |
| `voxelforge_set_objective` | `id`, `progress` | Objective ids from state |
| `voxelforge_set_block` | `x`, `y`, `z`, `block` | `air` erases |
| `voxelforge_stamp_prefab` | `prefab`, `x`, `y?`, `z` | Prefab keys from list |
| `voxelforge_entities` | `entity?`, `limit?` | Living entities |
| `voxelforge_export` | `name?` | Returns project JSON, no download |
| `voxelforge_publish` | `target`, `name?` | Starts a ZIP download in the browser |
| `voxelforge_open_panel` | `panel` | `studio`, `scripts`, `publish`, `inventory` |
| `voxelforge_command` | `type`, `payload?` | Any command, including `sim`, `save`, `pause`, `toast` |

## Launchable templates

`creative`, `survival`, `skyblock`, `parkour`, `arena`, `rpg`, `horror`,
`dungeon`, `racing`, `army`, `city`, `platformer`, `frostpeak`, `dune`,
`skytemple`, `kitchen`, `shopkeep`, `lucky`, `studio`.

New in 1.1:

| Key | Template | Camera / vehicle |
| --- | --- | --- |
| `racing` | Sunset Circuit | Third-person kart, `F6` toggles |
| `army` | Ironhold Siege | First-person, rifle waves and animated soldiers |
| `city` | Neon Heights | Third-person / vehicle car, GTA-style blocks |
| `platformer` | Spore Valley | Side view, locked look, A/D screen-relative |
| `frostpeak` | Frostpeak Expedition | First-person snow adventure, village + ice cavern + wyrm |
| `dune` | Sunscour Wastes | First-person desert adventure, outpost + bandits + temple |
| `skytemple` | Sky Temple Trials | First-person sky parkour, five islands + crystal guardian |
| `kitchen` | Ember & Oak Kitchen | First-person cooking service sim, stoves + customers + reputation |
| `shopkeep` | Corner & Candle | First-person store management sim, shelves + specials + customers |
| `lucky` | Lucky Block Gauntlet | First-person lucky-block arena, prizes + curses + jackpots |

## Camera and vehicle

- Five modes: `first`, `third`, `isometric`, `top-down`, `side`.
- In `side`, look input is locked, A/D run screen-relative and the camera faces
  −Z.
- `voxelforge_vehicle` enters a procedural kart or car and forces third-person.
  W/S throttle, A/D steer, Shift boosts. Leaving restores the prior mode where
  possible.
- Player-facing keys: `F5` cycles cameras, `F6` toggles the vehicle.

## Racing and race state

`racing` is a full race, not an empty track: the player kart and five AI karts
share the voxel kart model, a countdown locks the controls, and the director
tracks 16 gates over three laps with lap/best times, live positions and a
results screen. `voxelforge_state` exposes:

```json
"race": {
  "state": "countdown | racing | finished",
  "lap": 1, "laps": 3, "position": 6, "total": 6,
  "time": 12.34, "lastLap": null, "bestLap": null,
  "speed": 0, "countdown": 3.2, "wrongWay": false,
  "finishPosition": 0, "finishTime": 0,
  "standings": [{ "name": "You", "lap": 1, "player": true }]
}
```

Use `voxelforge_launch` with `racing` to restart the race. The template's
`race` config (`laps`, `rx`, `rz`, gate radius) is returned under
`state.template.race`.

## Cooking, shop and lucky simulations

`kitchen`, `shopkeep` and `lucky` run a template-scoped `sim` in addition to the
normal world. `voxelforge_state` returns `template.sim` (the authored config)
and `sim` (live HUD data):

```json
"sim": {
  "kicker": "Kitchen",
  "title": "Lunch Service",
  "rows": [{ "label": "Orders waiting", "value": "2" }],
  "progress": { "label": "Stock level", "value": 54, "max": 108 },
  "actions": [{ "id": "cook:pizza", "label": "Cheese Pizza · 26c", "disabled": false }],
  "footer": "Stand near a stove to cook…"
}
```

- `kitchen` — `cook:<recipe>` actions start a stove job; serve seated customers
  by right-clicking them while holding the ordered dish. Pantry crates sell
  random ingredient bundles for 10 coins.
- `shopkeep` — `restock:<item>` actions buy shelf stock; shelves, the chalkboard
  special and the checkout counter are interactable blocks. Customers are served
  by right-clicking them.
- `lucky` — break `lucky_block` and `cursed_lucky_block` with a pickaxe. The sim
  handles the roll, loot, ambush or explosion, respawns gold blocks and skips
  the normal block drop.

Drive actions through the generic command surface:

```json
{ "type": "sim", "payload": { "action": "cook:pizza" } }
```

Omit `action` to read the current sim HUD. New objective kinds (`serve`, `sell`,
`restock`, `earn`, `open`, `cook`) are counted by the sim and work in template
objectives and quests exactly like `kill` or `craft`.

## Template look: post-processing and world FX

Templates may declare an `fx` block. `post` selects a grading preset
(`default`, `racing`, `neon`, `horror`, `frost`, `desert`); `neon`, `hologram`,
`aurora`, `energy`, and `water` add animated shader props. The reusable
materials live in `src/engine/render/Shaders.ts`, the composer in `PostFX.ts`,
and the decoration in `WorldFX.ts`. All of it is optional and driven by the
template, so AI commands do not need to enable it manually.

## VoxelScript reference

The source is compiled inside:

```js
new Function('api', `"use strict"; const { ... } = api; ${source}; return ...`)
```

Available functions:

```js
onStart(fn)                       // once, on launch
onTick(fn)                        // every frame, receives dt
onEvent(name, fn)                 // 'kill' | 'collect' | 'place' | 'interact' |
                                  // 'damage' | 'respawn' | 'key'
every(seconds, fn)                // repeating timer

say(message, kind?)               // info | good | warn | bad
give(item, count?)
spawn(entity, dx, dy, dz, { name?, behavior? }) // relative to the player
camera(mode)                      // first | third | isometric | top-down | side
vehicle(enabled?, style?)         // style: kart | car; forces third-person
time(hour)                        // 0–23.99
weather('clear' | 'rain' | 'snow' | 'ash')
win(message?)
lose(message?)
teleport(x, y, z)
sound(name)                       // click, pickup, hit, break, place, jump,
                                  // levelup, quest, checkpoint, open, error, eat
effect(effect, amount?)           // heal, damage, feed, xp, coins, speed, jump, god
objective(id, progress?)
rule(name, value?)
boost(amount)
setVar(name, value) / addVar(name, value) / getVar(name)
score()                           // kills*10 + coins + xp + level*20
hour()
log(...args)
math                              // Math

player.x / y / z / yaw / pitch / health / hunger / coins / xp /
player.onGround / player.vehicle / player.camera
player.count(item) / player.nearest(entity?)

variables.get(name) / set(name, value) / add(name, value) / all()
```

Example racing intro:

```js
onStart(() => {
  camera('third');
  vehicle(true, 'kart');
  say('Lights out. W to drive, Shift to boost.', 'good');
});

every(15, () => {
  say(`Lap check — score ${score()}`, 'info');
  sound('checkpoint');
});

onEvent('key', (payload) => {
  if (payload.key === 'KeyR') {
    teleport(-25, 34, 2);
    say('Back to the grid.', 'warn');
  }
});
```

Text handlers and visual rules run together. `voxelforge_run_script` replaces
the text source but leaves the visual rules and variables intact. To edit those,
call `voxelforge_get_scripts`, change the JSON and send the whole project through
`voxelforge_command` with type `scripts.set` and payload `{ project }`.

## Visual rule JSON

```json
{
  "version": 1,
  "enabled": true,
  "source": "",
  "variables": { "score": 0 },
  "rules": [
    {
      "id": "rule-example",
      "name": "Reward the first coin",
      "enabled": true,
      "once": true,
      "event": { "type": "collect", "params": { "item": "coin" } },
      "conditions": [],
      "actions": [
        { "id": "a1", "type": "say", "params": { "message": "Shiny!", "kind": "good" } },
        { "id": "a2", "type": "add_var", "params": { "name": "score", "value": 1 } }
      ]
    }
  ]
}
```

Events: `start`, `tick`, `timer`, `kill`, `collect`, `place`, `interact`,
`damage`, `respawn`, `key`.
Conditions: `health_below`, `health_at_least`, `has_item`, `var_compare`,
`score_at_least`, `near_entity`, `time_after`, `time_before`, `chance`, `vehicle`.
Actions: `say`, `give`, `spawn`, `camera`, `time`, `weather`, `win`, `lose`,
`set_var`, `add_var`, `teleport`, `sound`, `effect`, `objective`, `rule`,
`boost`, `wait`.

The `wait` action delays later actions in the same visual rule; it is not a
VoxelScript global.

## World editing

- `voxelforge_set_block` writes one block and records an undoable studio stroke.
- `voxelforge_stamp_prefab` stamps a prefab and records it.
- World edits are saved in the project (`edits` + `studio.props`), so both
  exports and saves keep them.
- The studio UI (`voxelforge_open_panel` with `studio`) offers the same tools
  with orbit/zoom and an asset inspector.

Prefab keys include `race_track`, `army_base`, `city_block`, `skyscraper`,
`platform_course`, `frost_village`, `ice_cavern`, `summit_shrine`, `hot_spring`,
`desert_outpost`, `bandit_camp`, `sunken_temple`, `sky_temple`, `restaurant`,
`general_store`, `lucky_arena` plus the original village, dungeon, arena and
parkour pieces. Use `voxelforge_list` with `kind=prefabs` for the current list
and sizes.

## Rules

`voxelforge_set_rule` / `rule(name, value)` accepts:

`keepInventory`, `mobSpawning`, `hunger`, `allowFlight`, `invulnerable`,
`naturalRegen`, `dayCycle`, `fallDamage`, `blockBreaking`, `blockPlacing`,
`dropItems`, `pvp`.

## Publishing

`voxelforge_publish` with:

- `web` — standalone HTML/JS zip, works on itch.io and static hosts.
- `desktop` — Electron project; `npm install && npm start`, `npm run dist`
  builds installers on the host OS.
- `android` — Capacitor project; need Android Studio + JDK 17, then
  `npx cap add android`.
- `ios` — Capacitor project; needs macOS + Xcode 15+ for a signed build.

The browser downloads `<slug>-<target>.zip`. Builds contain `index.html`,
`engine/voxelforge-runtime.js`, `project.json`, `icon.svg` and the platform
files. If the standalone runtime is missing, the publisher falls back to the
app's hashed production bundle; run `npm run build:runtime` to restore the
standalone path.

## Verification loop

1. `voxelforge_state` — confirm template, camera, vehicle and player.
2. Make one change.
3. `voxelforge_state` or `voxelforge_entities` — confirm it landed.
4. For scripts: `voxelforge_get_scripts`, check `compileError` in state.
5. For races: launch `racing`, read `state.race` for countdown, lap, position
   and standings; a finished race ends on the results screen.
6. For publishing: call with `web` first; confirm the download and inspect the
   console for runtime fetch errors.

## Useful project paths

- `src/engine/ai/CommandAPI.ts` — command surface.
- `src/engine/ai/McpBridge.ts` — browser polling bridge.
- `mcp/voxelforge-mcp.mjs` — this MCP server.
- `src/engine/scripting/ScriptRuntime.ts` — VoxelScript implementation.
- `src/engine/scripting/ScriptTypes.ts` — visual rule catalog.
- `src/engine/publish/Publisher.ts` — package builders.
- `src/content/Templates.ts`, `src/content/Prefabs.ts` — content.
