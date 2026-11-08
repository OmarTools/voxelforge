# Template Tracker

Living list of every VoxelForge template — shipped, in progress and queued.
Keep this file updated when a template ships or the roadmap changes.

**Legend:** `✅ shipped` · `🚧 in progress` · `🔜 next` · `💤 queued` · `🧪 variant`

---

## Shipped

| # | Template | Key | Mode / System | Hook |
|---|---|---|---|---|
| 1 | Creative Sandbox | `creative` | — | Build without limits in a bright exhibition valley |
| 2 | First Dawn | `survival` | — | Classic gather → craft → survive loop |
| 3 | Skyblock Refuge | `skyblock` | — | Island start, limited resources |
| 4 | Parkour Spire | `parkour` | — | Checkpoint climb with fall resets |
| 5 | Arena of Echoes | `arena` | — | Wave combat in a colosseum |
| 6 | Emberfall Quest | `rpg` | — | Quest hub, NPCs, dungeon run |
| 7 | Hollow Manor | `horror` | — | Scripted haunted-house night |
| 8 | Crystal Depths | `dungeon` | — | Multi-room crystal cavern crawl |
| 9 | Sunset Circuit | `racing` | `race` | Kart laps against the clock |
| 10 | Ironhold Siege | `army` | — | Two-army battlefield push |
| 11 | Neon Heights | `city` | — | Vertical neon city sandbox |
| 12 | Spore Valley | `platformer` | — | Mushroom platforming |
| 13 | Blank Studio | `studio` | — | Empty authoring project |
| 14 | Frostpeak Expedition | `frostpeak` | — | Snowfield survival + ice caves |
| 15 | Sunscour Wastes | `dune` | — | Desert ruins and heat |
| 16 | Sky Temple Trials | `skytemple` | — | Floating temple platforming |
| 17 | Ember & Oak Kitchen | `kitchen` | `cooking` | Overcooked-style service window |
| 18 | Corner & Candle | `shopkeep` | `store` | Stock, price and serve customers |
| 19 | Lucky Block Gauntlet | `lucky` | `lucky` | Open lucky blocks, survive the rolls |
| 20 | Stormfall: Last Light | `royale` | `royale` | 8-contestant battle royale + storm ring |
| 21 | Emberhold Siege | `siege` | `siege` | 5-wave fortress defense, upgradable turrets |
| 22 | Cinderburst | `bomber` | `bomber` | Bomberman arena: TNT, crates, 3 rival bots |
| 23 | Nightfall Survivors | `survivors` | `survivors` | 8-minute auto-battler: soul shards, 11 upgrades, elites, Nightfang |
| 24 | Willow Creek | `farm` | `farm` | Day-cycle farm: crops, animals, shipping bin, daily requests |
| 25 | Hollowwatch | `hollowwatch` | `hollowwatch` | 12-wave tower defense: 3 tower types, 16 pads, rune gate, Hollow King |

Current total: **25 templates**.

---

## Recently shipped

### ✅ Hollowwatch — `hollowwatch`

**Pitch:** Five lanes, sixteen rune pads and one cracked gate between the moor and the
village. Raise and upgrade towers through twelve waves and put the Hollow King down.

| | |
|---|---|
| Inspired by | Plants vs. Zombies / Bloons TD |
| Core loop | Buy towers → place on rune pads → upgrade Mk I–III → call waves → repair the gate → break the Hollow King |
| New system | `HollowwatchSystem` (block towers, pad validation, targeting, slow/splash, gate attacks, repair, waves) |
| Reuses | Siege waves, entity combat, particles, HUD actions, NPC shops, objectives, quests, saves |
| Content | `hollowwatch` prefab (5 lanes, 16 pads, 93-block rune gate, gatehouse, watchtower, camps), 3 tower blocks, Warden Maelin + Tinker Ives + Ser Aldric, 12 waves |
| Length | 12 waves + boss; 5 objectives + 3 quests |
| Effort | high |

**Verified**
- [x] `hollowwatch` prefab (five lanes, 16 tower pads, long rune gate, gatehouse, watchtower, camps, dead trees)
- [x] Lantern / frost / mortar towers with Mk I–III upgrades (right-click; 50c then 70c)
- [x] Placement only on empty pads; invalid placement removed and refunded; breaking a tower packs it up
- [x] Single-target, slow and splash targeting with per-level range/damage/rate scaling
- [x] Gate HP 200, enemy gate attacks, 20c / 40 HP repair, defeat + rematch
- [x] 12 waves with elites and **The Hollow King** (frost dragon, 1.25× scale, 5× health)
- [x] Kill coins, wave rewards (coins/XP/arrows/apples), Warden Maelin tower shop
- [x] 5 objectives, 3 quests (Maelin, Ives, Aldric), `hollow_enemy_` save filtering
- [x] Headless QA suite + 25-template smoke test
- [x] Runtime rebuild, commit, push

### ✅ Willow Creek — `farm`

**Pitch:** A quiet day-cycle farm. Till the creek rows, plant four crops, tend the animals
and keep the inn's daily table stocked — then sleep and do it again.

| | |
|---|---|
| Inspired by | Stardew Valley / Harvest Moon |
| Core loop | Till → plant → water-adjacent growth → harvest → ship / daily request → sleep → new day |
| New system | `FarmSystem` (crops, growth stages, watering, animals, shipping, daily requests, sleep) |
| Reuses | Sky day cycle, NPC dialogue/shops, quests, objectives, prefab system, autosave |
| Content | `willow_creek` prefab, 3 NPCs, 8 animals, 4 crops × 3 stages, 4 seed items, `farmland`/`shipping_bin`/`bed` blocks |
| Length | Endless farm days; 5 objectives + 3 quests (Marigold, Berta, Thomas) |
| Effort | high |

**Verified**
- [x] `willow_creek` prefab (farmhouse, barn, fields, creek, seed stall, shipping bin)
- [x] Till → plant → watered growth advantage → 3-stage harvest loop
- [x] Chickens/cows/sheep with per-entity egg/milk/wool cooldowns
- [x] Shipping bin sales + coin/produce counters
- [x] Daily request from Berta, delivered through normal dialogue
- [x] Sleep at bed or **T** after 17:00; overnight crop growth and autosave
- [x] 5 objectives, 3 quests, farm counters saved/reloaded (`harvest`, `tend`)
- [x] Headless QA suite + 24-template smoke test
- [x] Runtime rebuild, commit, push

### ✅ Nightfall Survivors — `survivors`

**Pitch:** 8-minute auto-battler run. The lantern fires on its own; you only move, choose
upgrades and stay out of the horde.

| | |
|---|---|
| Inspired by | Vampire Survivors / Brotato |
| Core loop | Move → auto-attack → collect soul shards → level → pick 1 of 3 upgrades → elites every 2 min → final boss at 7:00 |
| New system | `SurvivorsSystem` + upgrade-choice hotkeys (Digit1–3) |
| Reuses | Wave spawner patterns, boss entities, particles, HUD, objectives, quests |
| Content | `nightfall_hollow` prefab, `soul_shard` item, 2 NPC quests |
| Length | 8:00 run, 11 upgrades, 5 enemy types + 3 elites + Nightfang |
| Effort | medium |

**Verified**
- [x] `nightfall_hollow` prefab (ruined chapel, graveyard, ritual circle)
- [x] `soul_shard` item + drop/collect conversion
- [x] `SurvivorsSystem` with spawn director, auto-attack, XP, levels
- [x] Upgrade pool + 3-choice HUD (Digit1–3, R fallback)
- [x] Elite cadence + final boss + win/rematch
- [x] Template entry, NPCs, objectives, quests, scripts
- [x] Headless QA + 23-template smoke test
- [x] Runtime rebuild, commit, push

---

## Roadmap

Ranked by value-to-effort. Effort is relative to the existing engine.

| Priority | Template | Inspired by | Core loop | New system | Reuses | Effort | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Nightfall Survivors** | Vampire Survivors / Brotato | Auto-attack horde survival, XP upgrades, boss | `SurvivorsSystem` | Waves, bosses, particles, HUD | medium | ✅ |
| 2 | **Willow Creek** | Stardew Valley / Harvest Moon | Farm plots, crops, animals, villagers, shipping bin | `FarmSystem` | Day cycle, dialogue, quests, shops | high | ✅ |
| 3 | **Hollowwatch** | Plants vs. Zombies / Bloons TD | Place and upgrade towers along lanes, 12 waves + boss | `HollowwatchSystem` (block placement + targeting) | Siege turrets/waves | medium | ✅ |
| 4 | **Bannerfall** | TF2 / Overwatch | Bot teams, CTF + king of the hill, class kits | `MatchSystem` | Entity combat, HUD, objectives | high | 💤 |
| 5 | **Deadlight** | CoD Zombies | Round-based zombies, barricades, buy weapons, boss round | `ZombiesSystem` | Wave spawner, economy, particles | medium | 💤 |
| 6 | **Crumble** | Spleef / Fall Guys | 3 quick rounds, collapsing floor, bots | `SpleefSystem` | Royale elimination, arena prefabs | low | 💤 |
| 7 | **Titan Trials** | Shadow of the Colossus / Cuphead | 3 phased bosses with arena hazards | `BossRushSystem` | Boss entities, arena FX, HUD | medium | 💤 |
| 8 | **Skyhold** | Minecraft Bed Wars | Generators, bridges, destroy the enemy core | `BedwarsSystem` | Skyblock + siege | high | 💤 |
| 9 | **Cogworks** | Factorio / Create | Drills, conveyors, smelters, quotas | Block-entity / logistics layer | Big engine addition | very high | 💤 |
| 10 | **Gloop Ranch** | Slime Rancher / Pikmin | Catch, feed, breed and sell creatures | `RanchSystem` | Creatures, NPC quests, economy | high | 💤 |
| 11 | 🧪 **Diner Rush** | Overcooked | Moving orders, fire hazards, combos, NPC cooks | Variant of `CookingSystem` | Kitchen template | low | 💤 |
| 12 | 🧪 **Test Chamber** | Portal | Pressure plates, doors, lasers, moving platforms | `PuzzleSystem` | Block entities, scripting | medium | 💤 |

### Sequenced plan

1. **Nightfall Survivors** — shipped; proves the auto-battler + upgrade-choice pattern.
2. **Willow Creek** — shipped; validates long-form day systems, persistent counters and saves.
3. **Hollowwatch** — shipped; validates player-placed towers, pad validation, upgrades and a shared gate pool.
4. **Crumble** — quick party mode, small scope, good palette cleanser. (next)
5. **Deadlight** — round-based horror, reuses waves + economy.
6. **Titan Trials** — boss-rush showcase for entity phases.
7. **Bannerfall** — team AI and objective modes; biggest combat investment.
8. **Skyhold** — needs generators + bridging + core destruction.
9. **Gloop Ranch** — creature husbandry and economy.
10. **Cogworks** — only after a block-entity layer exists.

### Shared systems worth extracting as templates land

| Need | Current home | Reuse |
|---|---|---|
| Timed spawn director | `RoyaleSystem`, `SiegeSystem` | Extract a `SpawnDirector` helper by the third user |
| Upgrade choice | `SurvivorsSystem` | Reuse for roguelike modifiers in other modes |
| Tower placement + targeting | `HollowwatchSystem`, `SiegeSystem` | Generalised block towers; reuse for future defense modes |
| Round/elimination flow | `RoyaleSystem`, `BomberSystem` | Shared `MatchFlow` for Crumble/Bannerfall |
| Economy + shop UI | `StoreSystem` | Deadlight, Willow Creek, Gloop Ranch |
| Day cycle + sleep/save rollover | `FarmSystem`, `Sky` | Reuse for any day-based survival or town mode |

---

## Build log

| Date | Change |
|---|---|
| 2026-11-08 | Hollowwatch (`hollowwatch`) shipped — 12-wave tower defense with player-placed lantern/frost/mortar towers, Mk I–III upgrades, 16 rune pads, a 200 HP gate and the Hollow King. |
| 2026-11-08 | Willow Creek (`farm`) shipped — day-cycle farm with 4 crops, 3 animal species, shipping bin, daily requests and sleep/save rollover. |
| 2026-11-07 | Nightfall Survivors (`survivors`) shipped — 8-minute horde run, soul-shard XP, 11 upgrades, 3 elites and Nightfang. |
| 2026-11-07 | Tracker created. 22 templates shipped, Nightfall Survivors started. |
| 2026-11-06 | Cinderburst (`bomber`) shipped — Bomberman arena with bots, crates, power-ups. |
| 2026-11-06 | Emberhold Siege (`siege`) shipped. |
| 2026-11-06 | Stormfall: Last Light (`royale`) shipped. |
