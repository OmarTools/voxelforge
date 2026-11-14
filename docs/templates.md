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
| 26 | Crumble | `crumble` | `crumble` | 3-round sky spleef: cracking tiles, 5 bots, shove, best-of-three |
| 27 | Deadlight | `deadlight` | `deadlight` | 8-round chapel zombie siege: barricades, wall buys, perks, the Gravewarden |
| 28 | Titan Trials | `titan` | `titan` | Three phased titans, arena hazards, forge upgrades between fights |

Current total: **28 templates**.

---

## Recently shipped

### ✅ Titan Trials — `titan`

**Pitch:** Three titans wait behind three summoning seals in a walled forge-colosseum.
Learn the telegraphed slams, rockfalls, meteors and frost novas, spend coins at the anvil,
hearth and obelisk between fights, then break the last seal and claim the forge.

| | |
|---|---|
| Inspired by | Shadow of the Colossus / Cuphead boss rush |
| Core loop | Talk to Kael → begin the trial → dodge telegraphed hazards → break the titan at 66% / 33% → spend coins at three stations → next seal → win → rematch |
| New system | `TitanSystem` (boss phases, element specials, hazard telegraphs, adds, station economy, boss-rush flow) |
| Reuses | Boss entities, wave banners, particles, HUD actions, objectives, quests, saves, forge blocks |
| Content | `titan_forge` prefab (circular colosseum, five floor rings, eight pillars, south forge gate, three stations, three seals, 17-block titan statue + mountain niche), `titan_anvil` / `titan_hearth` / `titan_obelisk` blocks, Warden Kael + Oren the Anvil + Seer Ilyra, 3 titans |
| Length | 3 titans × 3 phases; 6 objectives + 3 quests |
| Effort | high |

**Verified**
- [x] `titan_forge` prefab — radius-21 colosseum with obsidian/gold/magma/netherrack/ice rings, 8 pillars, south gate, three forge stations, three elemental seals, brazier lights and a 17-block statue in a carved mountain niche
- [x] Three station blocks with right-click economy: anvil (Diamond Sword 90c once, then 32 arrows/12c), hearth (full heal + 2 golden apples/25c), obelisk (Titan Heart +6 max HP/70c, Swiftstep +8%/55c, then apples/15c)
- [x] **Iron Colossus** (365 HP, stone golem), **Cinderwing** (416 HP, ember dragon), **Rimefang** (498 HP, frost dragon) with enlarged readable scale
- [x] Three phases each at 66% / 33%: banner, expanding shockwave, two adds, plus rockfalls / meteors / ice patches and a frost nova
- [x] Telegraphed thin-ring hazards in saturated per-element colors, boss bolts, chill slow, god-mode-safe QA paths
- [x] Boss-rush flow `intro → fight → break → repeat → won`, player-triggered begin/next, rematch preserves gear and permanent upgrades
- [x] 6 objectives, 3 quests (Kael, Oren, Ilyra), `titan_` save filtering, forge lights cleaned up on dispose
- [x] Headless QA suite + 28-template smoke test on the enhanced lighting engine
- [x] Runtime rebuild, commit, push

### ✅ Deadlight — `deadlight`

**Pitch:** One lit chapel in a walled graveyard, four boarded windows and eight rounds
until dawn. Tear the boards back up between waves, buy a rifle off the wall and put the
Gravewarden down before it breaks the nave open.

| | |
|---|---|
| Inspired by | Call of Duty: Zombies |
| Core loop | Prep countdown → undead tear boards off a window → repair (right-click / **R**) → shoot, earn coins → wall buys and perks → clear the round → boss round 8 → dawn |
| New system | `DeadlightSystem` (round director, breach/board damage, repair economy, wall buys, perks, boss round, win/rematch, chapel lights) |
| Reuses | Wave spawner patterns, entity combat, economy, particles, HUD actions, objectives, quests, saves |
| Content | `deadlight_yard` prefab (walled graveyard, chapel, altar, graves, dead trees, campfire, lantern posts), `deadlight_barricade` / `deadlight_armory` / `deadlight_perk` blocks, Sergeant Vale + Sister Halley + Cobb the Armorer, 8 rounds |
| Length | 8 rounds + boss; 7 objectives + 3 quests |
| Effort | medium |

**Verified**
- [x] `deadlight_yard` prefab — 40×40 walled yard, 11×11 chapel, open nave with plank eaves, permanent south door, altar, graves, dead trees, campfire, four lantern posts
- [x] Four windows × 9 boards (36 total); zombies spawn outside the window they attack, tear one board per swing (boss: three) and rush in once open
- [x] Repair a whole breach at 4c per board (right-click / **R**), counts toward the repair objective
- [x] Wall buys: Service Rifle + 30 rounds (120c, then 40c per 30); Juggernog 100c, Stamin-Up 80c, Quick Revive 120c, then golden apples 25c
- [x] Rounds 1–7 field `4 + round × 3` undead (7 → 25) with walkers, skeletons, wisps and orc brutes; rewards `5 + round × 2` coins
- [x] Round 8 is the boss round: 14 adds plus **The Gravewarden** (stone golem, 1.15× scale, 5× health, 3-board blows)
- [x] Round-clear payout `20 + round × 6` coins + XP; victory 300c / 500 XP and a rematch action
- [x] 7 objectives, 3 quests (Vale, Halley, Cobb), `deadlight_zombie_` save filtering
- [x] Night launch fix — `preparingSession` guard keeps template `timeOfDay` (Deadlight 22.4) from being overwritten by the menu backdrop
- [x] Headless QA suite (45 checks) + 27-template smoke test
- [x] Runtime rebuild, commit, push

### ✅ Crumble — `crumble`

**Pitch:** Three festival rings stacked above the clouds, six contestants and a floor that
cracks the moment you trust it. Shove rivals over the rim, keep moving and win two rounds
of three for the crown.

| | |
|---|---|
| Inspired by | Spleef / Fall Guys |
| Core loop | Countdown → tiles crack underfoot → dig or shove rivals → survive the stacked rings → first to 2 round wins takes the match |
| New system | `CrumbleSystem` (tile pressure, cracking, collapse, rival bots, shove, ring-out, best-of-three flow) |
| Reuses | Royale elimination, entity bots, prefab system, HUD actions, objectives, quests, saves |
| Content | `crumble_arena` prefab (3 stacked rings, 947 tiles, quartz rims, runway, skydeck, betting counter, gold crown), `crumble_tile` / `crumble_tile_alt` / `crumble_cracked` blocks, Marla Vane + Bix the Bookmaker |
| Length | 3 rounds, first to 2; 5 objectives + 2 quests |
| Effort | medium |

**Verified**
- [x] `crumble_arena` prefab (crown/middle/lower rings, quartz rims, stone keel, runway, skydeck, counter, scoreboard, clouds, hanging crown)
- [x] Tile pressure per contestant, crack stage, manual shovel digs, auto-collapse at 38s and a 115s round cap
- [x] Five named rival bots per round with steering, gap avoidance, shoving and self-preservation
- [x] Shove (right-click / **R**) with 2.4s cooldown, 3.8-block range and stagger; stacked rings catch one fall
- [x] Best-of-three flow: deck respawn on a lost round, 60c round + 300c match payouts, rematch on a win
- [x] 5 objectives, 2 quests (Marla Vane, Bix the Bookmaker), `crumble_bot_` save filtering
- [x] Headless QA suite + 26-template smoke test
- [x] Runtime rebuild, commit, push

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
| 5 | **Deadlight** | CoD Zombies | Round-based zombies, barricades, buy weapons, boss round | `DeadlightSystem` | Wave spawner, economy, particles | medium | ✅ |
| 6 | **Crumble** | Spleef / Fall Guys | 3 quick rounds, collapsing floor, bots | `CrumbleSystem` | Royale elimination, arena prefabs | low | ✅ |
| 7 | **Titan Trials** | Shadow of the Colossus / Cuphead | 3 phased bosses with arena hazards | `TitanSystem` | Boss entities, arena FX, HUD | medium | ✅ |
| 8 | **Skyhold** | Minecraft Bed Wars | Generators, bridges, destroy the enemy core | `BedwarsSystem` | Skyblock + siege | high | 💤 |
| 9 | **Cogworks** | Factorio / Create | Drills, conveyors, smelters, quotas | Block-entity / logistics layer | Big engine addition | very high | 💤 |
| 10 | **Gloop Ranch** | Slime Rancher / Pikmin | Catch, feed, breed and sell creatures | `RanchSystem` | Creatures, NPC quests, economy | high | 💤 |
| 11 | 🧪 **Diner Rush** | Overcooked | Moving orders, fire hazards, combos, NPC cooks | Variant of `CookingSystem` | Kitchen template | low | 💤 |
| 12 | 🧪 **Test Chamber** | Portal | Pressure plates, doors, lasers, moving platforms | `PuzzleSystem` | Block entities, scripting | medium | 💤 |

### Sequenced plan

1. **Nightfall Survivors** — shipped; proves the auto-battler + upgrade-choice pattern.
2. **Willow Creek** — shipped; validates long-form day systems, persistent counters and saves.
3. **Hollowwatch** — shipped; validates player-placed towers, pad validation, upgrades and a shared gate pool.
4. **Crumble** — shipped; validates 3D spleef tiles, shove physics, bot elimination and best-of-three flow.
5. **Deadlight** — shipped; validates round-based siege pacing, destructible barricades, wall buys and a boss round.
6. **Titan Trials** — shipped; validates multi-phase bosses, telegraphed hazards, adds and a between-fight upgrade economy.
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
| Multi-phase boss + telegraphs | `TitanSystem` | Reuse phased health gates, hazard rings and add waves for future bosses |
| Round/elimination flow | `RoyaleSystem`, `BomberSystem`, `CrumbleSystem` | Shared `MatchFlow` for Bannerfall |
| Economy + shop UI | `StoreSystem` | Deadlight, Willow Creek, Gloop Ranch |
| Day cycle + sleep/save rollover | `FarmSystem`, `Sky` | Reuse for any day-based survival or town mode |

---

## Build log

| Date | Change |
|---|---|
| 2026-11-14 | Titan Trials (`titan`) shipped — radius-21 forge-colosseum, three phased titans (Iron Colossus 365 HP, Cinderwing 416 HP, Rimefang 498 HP), 66%/33% phase breaks, rockfall/meteor/frost hazards, three-station upgrade economy, 6 objectives, 3 quests, rematch flow. Enhanced lighting engine merged (real sky/block light, smooth vertex lighting, mesher perf) with lighting/world tests. |
| 2026-11-11 | Deadlight (`deadlight`) shipped — 8-round chapel zombie siege with 4 boarded windows (36 boards), breach repairs, rifle/perk wall buys, the Gravewarden boss round, 3 quests and a night-launch fix for all night templates. |
| 2026-11-09 | Crumble (`crumble`) shipped — 3-round best-of-three sky spleef with 947 cracking tiles, five rival bots, shove (**R**), stacked safety rings, skydeck and 2 quests. |
| 2026-11-08 | Hollowwatch (`hollowwatch`) shipped — 12-wave tower defense with player-placed lantern/frost/mortar towers, Mk I–III upgrades, 16 rune pads, a 200 HP gate and the Hollow King. |
| 2026-11-08 | Willow Creek (`farm`) shipped — day-cycle farm with 4 crops, 3 animal species, shipping bin, daily requests and sleep/save rollover. |
| 2026-11-07 | Nightfall Survivors (`survivors`) shipped — 8-minute horde run, soul-shard XP, 11 upgrades, 3 elites and Nightfang. |
| 2026-11-07 | Tracker created. 22 templates shipped, Nightfall Survivors started. |
| 2026-11-06 | Cinderburst (`bomber`) shipped — Bomberman arena with bots, crates, power-ups. |
| 2026-11-06 | Emberhold Siege (`siege`) shipped. |
| 2026-11-06 | Stormfall: Last Light (`royale`) shipped. |
