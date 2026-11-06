import type { WorldPresetKey } from '../engine/world/TerrainGenerator';
import type { CameraMode } from '../engine/game/CameraModes';
import type { ScriptProject } from '../engine/scripting/ScriptTypes';
import type { SimSpec } from '../engine/game/sim/SimTypes';

export type GameMode = 'creative' | 'survival' | 'skyblock' | 'parkour' | 'arena' | 'rpg' | 'horror' | 'dungeon' | 'racing' | 'army' | 'city' | 'platformer' | 'frostpeak' | 'dune' | 'skytemple' | 'kitchen' | 'shopkeep' | 'lucky' | 'royale' | 'siege' | 'studio';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard' | 'nightmare';
export type ObjectiveKind = 'collect' | 'kill' | 'reach' | 'craft' | 'place' | 'talk' | 'survive' | 'wave' | 'serve' | 'sell' | 'restock' | 'earn' | 'open' | 'cook' | 'defend';

export interface WorldRules {
  keepInventory: boolean;
  mobSpawning: boolean;
  hunger: boolean;
  allowFlight: boolean;
  invulnerable: boolean;
  naturalRegen: boolean;
  dayCycle: boolean;
  fallDamage: boolean;
  blockBreaking: boolean;
  blockPlacing: boolean;
  dropItems: boolean;
  pvp: boolean;
}

export interface ObjectiveDef {
  id: string;
  title: string;
  kind: ObjectiveKind;
  target?: string;
  count: number;
  description?: string;
  radius?: number;
  offset?: [number, number, number];
  hidden?: boolean;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  summary: string;
  objectives: ObjectiveDef[];
  reward: { xp: number; items: Array<{ item: string; count: number }>; coins?: number };
}

export interface WaveSpec {
  label: string;
  entities: Array<{ key: string; count: number }>;
  boss?: boolean;
  healthScale?: number;
  reward?: { xp: number; items?: Array<{ item: string; count: number }> };
}

export interface PrefabPlacement {
  prefab: string;
  offset: [number, number, number];
}

export interface SpawnSpec {
  entity: string;
  offset: [number, number, number];
  count?: number;
  spread?: number;
  name?: string;
  role?: string;
  dialogue?: string;
  id?: string;
  questId?: string;
  behavior?: 'idle' | 'wander' | 'hostile' | 'ranged' | 'flying' | 'guard' | 'flee' | 'stationary' | 'exploder';
  boss?: boolean;
}

export interface CheckpointSpec {
  offset: [number, number, number];
  radius: number;
  label: string;
}

export interface TemplatePlacement {
  prefab: string;
  x: number;
  z: number;
  y?: number;
}

export interface GameTemplate {
  key: GameMode;
  name: string;
  subtitle: string;
  description: string;
  story: string;
  icon: string;
  accent: string;
  difficulty: Difficulty;
  tags: string[];
  preset: WorldPresetKey;
  heightMode: 'ground' | 'flat' | 'sky';
  skyBase?: number;
  timeOfDay: number;
  weather?: 'clear' | 'rain' | 'snow' | 'ash';
  music: 'day' | 'night' | 'horror' | 'arena';
  platform?: { radius: number; surface: string; border?: string; clearHeight?: number };
  prefabs: TemplatePlacement[];
  spawn: [number, number];
  spawnYaw?: number;
  spawnYOffset?: number;
  cameraMode?: CameraMode;
  vehicle?: { enabled: boolean; style: 'kart' | 'car' };
  race?: { laps: number; rx: number; rz: number; startAngle?: number; gateRadius?: number };
  sim?: SimSpec;
  fx?: {
    neon?: boolean;
    hologram?: boolean;
    aurora?: boolean;
    energy?: boolean;
    water?: { x: number; z: number; width: number; depth: number; y?: number; rotation?: number };
    post?: 'default' | 'racing' | 'neon' | 'horror' | 'frost' | 'desert';
  };
  scripts?: ScriptProject;
  fallReset?: boolean;
  spawns: SpawnSpec[];
  objectives: ObjectiveDef[];
  quests: QuestDef[];
  waves: WaveSpec[];
  checkpoints: CheckpointSpec[];
  startingItems: Array<{ item: string; count: number }>;
  hotbar: string[];
  rules: WorldRules;
  showStudioOnStart?: boolean;
  stats: Array<{ label: string; value: string }>;
}

const BASE_RULES: WorldRules = {
  keepInventory: true,
  mobSpawning: true,
  hunger: true,
  allowFlight: false,
  invulnerable: false,
  naturalRegen: true,
  dayCycle: true,
  fallDamage: true,
  blockBreaking: true,
  blockPlacing: true,
  dropItems: true,
  pvp: false,
};

const CREATIVE_BLOCKS = [
  'grass_block', 'dirt', 'stone', 'cobblestone', 'oak_log', 'oak_planks', 'spruce_planks', 'sand',
  'sandstone', 'bricks', 'stone_bricks', 'glass', 'quartz_block', 'glowstone', 'torch', 'oak_leaves',
  'wool_white', 'wool_red', 'wool_blue', 'concrete_white', 'concrete_gray', 'crystal_block', 'water', 'lava',
];

const templateScript = (source: string): ScriptProject => ({
  version: 1,
  enabled: true,
  rules: [],
  variables: {},
  source,
  updatedAt: Date.now(),
});


export const TEMPLATES: GameTemplate[] = [
  {
    key: 'creative',
    name: 'Creative Sandbox',
    subtitle: 'Build without limits',
    description: 'A bright exhibition valley with a village square, cottage, market and arcane spire. Fly, paint blocks and prototype your own world.',
    story: 'The Forgeheart Valley is yours. Every block in the library is unlocked, the sky is clear, and nothing is trying to eat you.',
    icon: '▦',
    accent: '#8ce05f',
    difficulty: 'peaceful',
    tags: ['Sandbox', 'Building', 'All Blocks'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 9.5,
    music: 'day',
    platform: { radius: 28, surface: 'grass_block', border: 'stone_bricks', clearHeight: 26 },
    prefabs: [
      { prefab: 'village_square', x: 0, z: 0 },
      { prefab: 'oak_cottage', x: 17, z: 9 },
      { prefab: 'market_stall', x: -17, z: 7 },
      { prefab: 'blacksmith', x: 18, z: -11 },
      { prefab: 'wizard_tower', x: -19, z: -15 },
      { prefab: 'treehouse', x: 30, z: 2 },
    ],
    spawn: [0, 8],
    spawns: [
      { entity: 'human:adventurer', offset: [4, 0, 5], name: 'Rowan', dialogue: 'The valley is your canvas. Press E for blocks, B for the studio, and F to fly.' },
      { entity: 'human:villager_farmer', offset: [-8, 0, 4], name: 'Mira', dialogue: 'Fresh carrots, straight from the field. Help yourself — it is creative mode, after all.' },
      { entity: 'human:mage_arcane', offset: [-14, 0, -10], name: 'Elara', dialogue: 'That spire took me three days. Please do not mine the load-bearing crystals.' },
      { entity: 'creature:chicken', offset: [8, 0, -4], count: 3, spread: 3 },
      { entity: 'creature:sheep', offset: [-10, 0, 11], count: 2, spread: 2 },
    ],
    objectives: [],
    quests: [],
    waves: [],
    checkpoints: [],
    startingItems: [],
    hotbar: ['grass_block', 'stone', 'oak_planks', 'stone_bricks', 'glass', 'torch', 'crystal_block', 'wool_red', 'glowstone'],
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: false, allowFlight: true, invulnerable: true, naturalRegen: true, fallDamage: false },
    stats: [
      { label: 'Blocks', value: '80+' },
      { label: 'Assets', value: '76' },
      { label: 'Mode', value: 'Creative' },
    ],
  },
  {
    key: 'survival',
    name: 'First Dawn',
    subtitle: 'Survive the first night',
    description: 'Wake at a forest campsite with nothing but a stone axe. Gather wood, build shelter, light a fire and last until morning.',
    story: 'You remember the crash, the river, and the long walk. The camp is yours now — but the forest is not empty, and the sun is already sinking.',
    icon: '☀',
    accent: '#f7c65a',
    difficulty: 'normal',
    tags: ['Survival', 'Crafting', 'Mobs'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 16.4,
    music: 'day',
    platform: { radius: 19, surface: 'grass_block', border: 'dirt', clearHeight: 22 },
    prefabs: [
      { prefab: 'campsite', x: 0, z: 0 },
      { prefab: 'oak_cottage', x: 18, z: -7 },
      { prefab: 'farm_plot', x: -17, z: -6 },
    ],
    spawn: [0, 7],
    spawns: [
      { entity: 'human:ranger_alex', offset: [2, 0, 4], name: 'Alex', role: 'Ranger', dialogue: 'You made it. There is a spare axe at the camp. When night falls, stay near the fire.' },
      { entity: 'creature:cow', offset: [11, 0, 8], count: 2, spread: 4 },
      { entity: 'creature:pig', offset: [-10, 0, 10], count: 2, spread: 3 },
      { entity: 'creature:sheep', offset: [13, 0, -1], count: 2, spread: 3 },
      { entity: 'creature:chicken', offset: [-6, 0, 5], count: 3, spread: 3 },
      { entity: 'creature:wolf', offset: [22, 0, 9], count: 2, spread: 5 },
    ],
    objectives: [
      { id: 'wood', title: 'Gather 12 oak logs', kind: 'collect', target: 'oak_log', count: 12, description: 'Punch trees until you have enough timber.' },
      { id: 'table', title: 'Craft a crafting table', kind: 'craft', target: 'crafting_table', count: 1, description: 'Four planks will do it.' },
      { id: 'torches', title: 'Place 4 torches', kind: 'place', target: 'torch', count: 4, description: 'Keep the dark at bay.' },
      { id: 'dawn', title: 'Survive until dawn', kind: 'survive', count: 150, description: 'Stay alive through the night.' },
    ],
    quests: [],
    waves: [],
    checkpoints: [],
    startingItems: [
      { item: 'stone_axe', count: 1 },
      { item: 'stone_pickaxe', count: 1 },
      { item: 'stone_sword', count: 1 },
      { item: 'bread', count: 4 },
      { item: 'torch', count: 6 },
      { item: 'oak_planks', count: 16 },
      { item: 'compass', count: 1 },
    ],
    hotbar: ['stone_axe', 'stone_pickaxe', 'stone_sword', 'torch', 'bread', 'oak_planks', 'compass', 'torch', 'bread'],
    rules: { ...BASE_RULES, keepInventory: false },
    stats: [
      { label: 'Nights', value: '1' },
      { label: 'Mobs', value: 'Hostile' },
      { label: 'Mode', value: 'Survival' },
    ],
  },
  {
    key: 'skyblock',
    name: 'Skyblock Refuge',
    subtitle: 'One island. Infinite sky.',
    description: 'A lone floating island above the clouds. Expand your platform, coax a tree to grow, and turn a handful of blocks into a home.',
    story: 'There is no ground below. Only the island, a tree, and a chest with just enough supplies to begin again.',
    icon: '☁',
    accent: '#8bd8ff',
    difficulty: 'hard',
    tags: ['Skyblock', 'Building', 'Survival'],
    preset: 'sky',
    heightMode: 'sky',
    skyBase: 49,
    timeOfDay: 7.2,
    music: 'day',
    spawn: [0, 5],
    prefabs: [
      { prefab: 'sky_island', x: 0, z: 0 },
      { prefab: 'sky_island', x: 27, z: -9, y: 7 },
    ],
    spawns: [
      { entity: 'human:explorer_jungle', offset: [4, 0, 2], name: 'Juniper', dialogue: 'Watch your step. The void is very patient.' },
      { entity: 'creature:chicken', offset: [-3, 0, 3], count: 2, spread: 2 },
    ],
    objectives: [
      { id: 'expand', title: 'Place 64 blocks', kind: 'place', count: 64, description: 'Grow the island outward, not downward.' },
      { id: 'tree', title: 'Gather 8 oak logs', kind: 'collect', target: 'oak_log', count: 8 },
      { id: 'night', title: 'Survive the first night', kind: 'survive', count: 130 },
      { id: 'bridge', title: 'Reach the far island', kind: 'reach', offset: [27, 9, -9], radius: 7, count: 1, description: 'A bridge, a leap, or something cleverer.' },
    ],
    quests: [],
    waves: [],
    checkpoints: [],
    startingItems: [
      { item: 'oak_log', count: 10 },
      { item: 'dirt', count: 48 },
      { item: 'stone', count: 24 },
      { item: 'torch', count: 8 },
      { item: 'bread', count: 5 },
      { item: 'stone_pickaxe', count: 1 },
      { item: 'stone_axe', count: 1 },
      { item: 'water_bottle', count: 2 },
    ],
    hotbar: ['oak_log', 'dirt', 'stone', 'torch', 'stone_axe', 'stone_pickaxe', 'bread', 'water_bottle', 'water_bottle'],
    rules: { ...BASE_RULES, keepInventory: false, fallDamage: true },
    stats: [
      { label: 'Islands', value: '2' },
      { label: 'Start', value: 'Tiny' },
      { label: 'Mode', value: 'Skyblock' },
    ],
  },
  {
    key: 'parkour',
    name: 'Parkour Spire',
    subtitle: 'Sixteen jumps to glory',
    description: 'A vertical gauntlet of floating platforms above a bottomless drop. Time your jumps, hit the checkpoints, reach the crystal crown.',
    story: 'The Spire was built by someone who thought gravity was a suggestion. Prove them right.',
    icon: '⇧',
    accent: '#ffd166',
    difficulty: 'normal',
    tags: ['Parkour', 'Precision', 'Checkpoints'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 12,
    music: 'day',
    platform: { radius: 10, surface: 'quartz_block', border: 'stone_bricks', clearHeight: 38 },
    prefabs: [{ prefab: 'parkour_tower', x: 0, z: 0 }],
    spawn: [0, 7],
    spawnYaw: Math.PI,
    spawns: [],
    objectives: [
      { id: 'check1', title: 'Reach the first checkpoint', kind: 'reach', offset: [0, 8, 0], radius: 4, count: 1 },
      { id: 'check2', title: 'Reach the upper checkpoint', kind: 'reach', offset: [0, 20, 0], radius: 4, count: 1 },
      { id: 'top', title: 'Claim the crystal crown', kind: 'reach', offset: [0, 34, 0], radius: 3, count: 1, description: 'The top of the Spire.' },
    ],
    quests: [],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 0], radius: 3, label: 'Spire Base' },
      { offset: [3, 8, 0], radius: 3, label: 'Lower Ring' },
      { offset: [-3, 18, 0], radius: 3.5, label: 'Upper Ring' },
      { offset: [0, 30, 2], radius: 3, label: 'Crown Approach' },
    ],
    startingItems: [],
    hotbar: [],
    rules: {
      ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: false, invulnerable: true,
      naturalRegen: true, dayCycle: false, fallDamage: false, blockBreaking: false, blockPlacing: false, dropItems: false,
    },
    stats: [
      { label: 'Height', value: '34m' },
      { label: 'Jumps', value: '16' },
      { label: 'Mode', value: 'Parkour' },
    ],
  },
  {
    key: 'arena',
    name: 'Arena of Echoes',
    subtitle: 'Five waves. One survivor.',
    description: 'A sealed stone arena, a crowd you cannot see, and five waves of things that want you dead. The last wave has wings.',
    story: 'They promised glory. They did not mention the dragon.',
    icon: '◉',
    accent: '#ff8a5c',
    difficulty: 'hard',
    tags: ['Combat', 'Waves', 'Boss'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 19,
    music: 'arena',
    platform: { radius: 14, surface: 'stone_bricks', border: 'cobblestone', clearHeight: 14 },
    prefabs: [{ prefab: 'arena_stage', x: 0, z: 0 }],
    spawn: [0, 6],
    spawns: [],
    objectives: [
      { id: 'waves', title: 'Survive all five waves', kind: 'wave', count: 5 },
      { id: 'kills', title: 'Defeat 18 enemies', kind: 'kill', target: 'any', count: 18 },
      { id: 'boss', title: 'Slay the Ember Dragon', kind: 'kill', target: 'creature:ember_dragon', count: 1 },
    ],
    quests: [],
    waves: [
      { label: 'Wave I · The Restless', entities: [{ key: 'human:zombie_walker', count: 4 }], reward: { xp: 20 } },
      { label: 'Wave II · Bone and Silk', entities: [{ key: 'human:skeleton_warrior', count: 3 }, { key: 'creature:spider', count: 3 }], reward: { xp: 35 } },
      { label: 'Wave III · Road Scum', entities: [{ key: 'human:bandit_road', count: 4 }, { key: 'creature:slime', count: 3 }], reward: { xp: 50, items: [{ item: 'cooked_beef', count: 3 }] } },
      { label: 'Wave IV · The Brutes', entities: [{ key: 'human:orc_brute', count: 3 }, { key: 'creature:stone_golem', count: 2 }], reward: { xp: 80, items: [{ item: 'golden_apple', count: 2 }] } },
      { label: 'Final Wave · Wings of Ash', entities: [{ key: 'creature:ember_dragon', count: 1 }], boss: true, reward: { xp: 250, items: [{ item: 'dragon_scale', count: 2 }, { item: 'totem', count: 1 }] } },
    ],
    checkpoints: [],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 48 },
      { item: 'iron_chestplate', count: 1 },
      { item: 'iron_helmet', count: 1 },
      { item: 'cooked_beef', count: 8 },
      { item: 'golden_apple', count: 2 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'cooked_beef', 'golden_apple', 'shield', 'iron_helmet', 'iron_chestplate', 'arrow'],
    rules: {
      ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: false, naturalRegen: false,
      dayCycle: false, blockBreaking: false, blockPlacing: false, dropItems: false,
    },
    stats: [
      { label: 'Waves', value: '5' },
      { label: 'Enemies', value: '23' },
      { label: 'Boss', value: 'Dragon' },
    ],
  },
  {
    key: 'rpg',
    name: 'Emberfall Quest',
    subtitle: 'A valley full of stories',
    description: 'A living village of merchants, guards and quest-givers. Take jobs, hunt bandits, cleanse the shrine and earn the mage\'s staff.',
    story: 'Emberfall has been quiet since the shrine went dark. Quiet is not the same as safe.',
    icon: '✦',
    accent: '#b48cff',
    difficulty: 'normal',
    tags: ['RPG', 'Quests', 'NPCs'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 10.5,
    music: 'day',
    platform: { radius: 29, surface: 'grass_block', border: 'cobblestone', clearHeight: 24 },
    prefabs: [
      { prefab: 'village_square', x: 0, z: 0 },
      { prefab: 'tavern', x: -18, z: 6 },
      { prefab: 'oak_cottage', x: 17, z: 7 },
      { prefab: 'blacksmith', x: 18, z: -12 },
      { prefab: 'library', x: -18, z: -13 },
      { prefab: 'shrine', x: 0, z: -22 },
      { prefab: 'graveyard', x: 23, z: -22 },
    ],
    spawn: [0, 7],
    spawns: [
      { entity: 'human:king_gold', offset: [0, 0, -5], name: 'King Aldren', role: 'Ruler of Emberfall', id: 'king', dialogue: 'Welcome to Emberfall. Speak with Elara — she has been fretting about that shrine for weeks.' },
      { entity: 'human:mage_arcane', offset: [-5, 0, -4], name: 'Elara', id: 'mage', questId: 'shrine', dialogue: 'The shrine\'s crystal has gone dark. Wisps are drawn to the failure, and worse things follow them.' },
      { entity: 'human:villager_blacksmith', offset: [18, 0, -8], name: 'Borin', id: 'smith', questId: 'bandits', dialogue: 'My ore shipments keep vanishing. Bandits, I tell you. Deal with them and I will make it worth your while.' },
      { entity: 'human:chef_inn', offset: [-18, 0, 9], name: 'Marta', id: 'chef', dialogue: 'The stew is always on. You look like you have not eaten in a week.' },
      { entity: 'human:priest_light', offset: [0, 0, -20], name: 'Father Ansel', id: 'priest', dialogue: 'The light still burns beneath the shrine. You only need to remind it.' },
      { entity: 'human:bard_wanderer', offset: [3, 0, 2], name: 'Fen', id: 'bard', dialogue: 'They will write songs about this, you know. Probably not good ones.' },
      { entity: 'human:guard_city', offset: [6, 0, 2], count: 2, spread: 5, name: 'City Guard' },
      { entity: 'human:necromancer', offset: [2, 0, -25], name: 'The Hollow One', boss: true },
      { entity: 'creature:wisp', offset: [0, 1, -24], count: 3, spread: 4 },
      { entity: 'human:bandit_road', offset: [24, 0, -14], count: 4, spread: 5 },
      { entity: 'creature:wolf', offset: [-24, 0, 2], count: 2, spread: 4 },
      { entity: 'creature:cow', offset: [10, 0, 18], count: 2, spread: 3 },
      { entity: 'creature:sheep', offset: [-9, 0, 15], count: 3, spread: 4 }
    ],
    objectives: [
      { id: 'talk-mage', title: 'Speak with Elara', kind: 'talk', target: 'mage', count: 1 },
      { id: 'shards', title: 'Recover 4 crystal shards', kind: 'collect', target: 'crystal_shard', count: 4, description: 'Wisps near the shrine carry them.' },
      { id: 'necromancer', title: 'Defeat the Hollow One', kind: 'kill', target: 'human:necromancer', count: 1 },
      { id: 'bandits', title: 'Drive off 4 road bandits', kind: 'kill', target: 'human:bandit_road', count: 4 },
    ],
    quests: [
      {
        id: 'shrine', title: 'The Sleeping Shrine', giver: 'Elara', summary: 'Elara believes the shrine crystal can be rekindled with four shards carried by the wisps nearby.',
        objectives: [
          { id: 'q-shards', title: 'Collect crystal shards', kind: 'collect', target: 'crystal_shard', count: 4 },
          { id: 'q-necro', title: 'Defeat the Hollow One', kind: 'kill', target: 'human:necromancer', count: 1 },
        ],
        reward: { xp: 180, items: [{ item: 'staff', count: 1 }, { item: 'golden_apple', count: 2 }], coins: 30 },
      },
      {
        id: 'bandits', title: 'Ore and Outlaws', giver: 'Borin', summary: 'Borin\'s shipments are being ambushed on the eastern road. Thin out the bandits.',
        objectives: [{ id: 'q-bandits', title: 'Defeat road bandits', kind: 'kill', target: 'human:bandit_road', count: 4 }],
        reward: { xp: 120, items: [{ item: 'iron_chestplate', count: 1 }, { item: 'iron_ingot', count: 6 }], coins: 25 },
      },
    ],
    waves: [],
    checkpoints: [{ offset: [0, 1, 0], radius: 5, label: 'Village Square' }],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'shield', count: 1 },
      { item: 'bread', count: 6 },
      { item: 'coin', count: 12 },
      { item: 'torch', count: 8 },
      { item: 'compass', count: 1 },
    ],
    hotbar: ['iron_sword', 'shield', 'bread', 'torch', 'coin', 'compass', 'bread', 'torch', 'iron_sword'],
    rules: { ...BASE_RULES, keepInventory: true },
    stats: [
      { label: 'NPCs', value: '14' },
      { label: 'Quests', value: '2' },
      { label: 'Villages', value: '1' },
    ],
  },
  {
    key: 'horror',
    name: 'Hollow Manor',
    subtitle: 'Do not go into the cellar',
    description: 'A decaying manor at midnight, a fog that swallows sound, and a ghost with one last request. Find the truth and escape the grounds.',
    story: 'The letter said the house had been empty for thirty years. The lights were on when you arrived.',
    icon: '☠',
    accent: '#d05a6e',
    difficulty: 'nightmare',
    tags: ['Horror', 'Story', 'Survival'],
    preset: 'dark',
    heightMode: 'ground',
    timeOfDay: 0.5,
    weather: 'ash',
    music: 'horror',
    platform: { radius: 22, surface: 'podzol', border: 'cobblestone', clearHeight: 24 },
    prefabs: [
      { prefab: 'spooky_manor', x: 0, z: -7 },
      { prefab: 'graveyard', x: 20, z: 11 },
      { prefab: 'campsite', x: -16, z: 14 },
      { prefab: 'stone_bridge', x: 0, z: 20 },
    ],
    spawn: [0, 15],
    spawnYaw: Math.PI,
    fx: { post: 'horror' },
    spawns: [
      { entity: 'human:ghost_wisp', offset: [0, 0, 4], name: 'The Pale Girl', id: 'ghost', dialogue: 'You can see me. Oh, thank the stars. Please — the cellar. He is still down there.' },
      { entity: 'human:cultist_void', offset: [0, 0, -10], count: 3, spread: 5, name: 'Hooded Figure' },
      { entity: 'human:zombie_walker', offset: [19, 0, 14], count: 3, spread: 5 },
      { entity: 'human:necromancer', offset: [0, 0, -12], name: 'The Master of the House', boss: true },
      { entity: 'creature:bat', offset: [-7, 4, -6], count: 4, spread: 4 },
      { entity: 'creature:wisp', offset: [16, 1, 8], count: 2, spread: 3 }
    ],
    objectives: [
      { id: 'ghost', title: 'Find the pale girl', kind: 'talk', target: 'ghost', count: 1, description: 'Something is waiting near the manor gate.' },
      { id: 'cultists', title: 'Break the ritual', kind: 'kill', target: 'human:cultist_void', count: 3 },
      { id: 'master', title: 'End the Master of the House', kind: 'kill', target: 'human:necromancer', count: 1 },
      { id: 'escape', title: 'Escape the grounds', kind: 'reach', offset: [0, 1, 27], radius: 4, count: 1 },
    ],
    quests: [],
    waves: [],
    checkpoints: [],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'torch', count: 20 },
      { item: 'bread', count: 4 },
      { item: 'golden_apple', count: 1 },
      { item: 'compass', count: 1 },
    ],
    hotbar: ['iron_sword', 'torch', 'bread', 'golden_apple', 'compass', 'torch', 'torch', 'iron_sword', 'bread'],
    rules: { ...BASE_RULES, keepInventory: false, naturalRegen: false, dayCycle: false, mobSpawning: false },
    stats: [
      { label: 'Time', value: 'Midnight' },
      { label: 'Threat', value: 'Severe' },
      { label: 'Mode', value: 'Horror' },
    ],
  },
  {
    key: 'dungeon',
    name: 'Crystal Depths',
    subtitle: 'Loot, monsters, portal',
    description: 'A ruined dungeon above a glowing geode. Fight through skeletons and cultists, break the crystal golem, and open the obsidian gate.',
    story: 'The miners dug too deep and found something that was already digging back.',
    icon: '⚿',
    accent: '#55e6d2',
    difficulty: 'hard',
    tags: ['Dungeon', 'Combat', 'Loot'],
    preset: 'dark',
    heightMode: 'flat',
    timeOfDay: 22,
    music: 'night',
    platform: { radius: 24, surface: 'stone', border: 'stone_bricks', clearHeight: 18 },
    prefabs: [
      { prefab: 'dungeon_room', x: 0, z: 0 },
      { prefab: 'crystal_cavern', x: 27, z: -3 },
      { prefab: 'nether_portal', x: 0, z: -14 },
      { prefab: 'mine_entrance', x: -14, z: 12 },
    ],
    spawn: [0, 10],
    spawnYaw: Math.PI,
    spawns: [
      { entity: 'human:explorer_jungle', offset: [0, 0, 12], name: 'Juniper', id: 'explorer', dialogue: 'The gate at the back is sealed. The golem in the geode is holding the key — or eating it. Hard to tell.' },
      { entity: 'human:skeleton_warrior', offset: [-4, 0, 1], count: 4, spread: 5 },
      { entity: 'human:cultist_void', offset: [18, 0, 2], count: 3, spread: 5 },
      { entity: 'creature:spider', offset: [5, 0, 5], count: 3, spread: 4 },
      { entity: 'creature:crystal_golem', offset: [27, 0, -3], name: 'Geode Warden', boss: true },
      { entity: 'creature:bat', offset: [10, 4, 2], count: 3, spread: 4 },
    ],
    objectives: [
      { id: 'golem', title: 'Defeat the Geode Warden', kind: 'kill', target: 'creature:crystal_golem', count: 1 },
      { id: 'shards', title: 'Collect 6 crystal shards', kind: 'collect', target: 'crystal_shard', count: 6 },
      { id: 'portal', title: 'Activate the obsidian gate', kind: 'reach', offset: [0, 1, -14], radius: 4, count: 1 },
      { id: 'skeletons', title: 'Clear the dungeon', kind: 'kill', target: 'human:skeleton_warrior', count: 4 },
    ],
    quests: [],
    waves: [],
    checkpoints: [{ offset: [0, 1, 9], radius: 5, label: 'Dungeon Entrance' }],
    startingItems: [
      { item: 'diamond_sword', count: 1 },
      { item: 'iron_pickaxe', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 32 },
      { item: 'iron_chestplate', count: 1 },
      { item: 'iron_helmet', count: 1 },
      { item: 'cooked_beef', count: 6 },
      { item: 'torch', count: 24 },
      { item: 'golden_apple', count: 2 },
    ],
    hotbar: ['diamond_sword', 'bow', 'arrow', 'torch', 'iron_pickaxe', 'cooked_beef', 'golden_apple', 'iron_chestplate', 'torch'],
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, dayCycle: false },
    stats: [
      { label: 'Rooms', value: '4' },
      { label: 'Boss', value: 'Golem' },
      { label: 'Loot', value: 'Rare' },
    ],
  },
  {
    key: 'racing',
    name: 'Sunset Circuit',
    subtitle: 'Kart racing at golden hour',
    description: 'A full three-lap kart race against five AI drivers on a banked oval circuit with checkered curbs, a start gantry, pit lane and packed grandstand. Shift is your boost; the chequered flag is the only thing that matters.',
    story: 'The sun is going down, the tyres are warm, and the only rule is that the finish line comes after the corners.',
    icon: '⚑',
    accent: '#ffb347',
    difficulty: 'normal',
    tags: ['Racing', 'Kart', 'Circuit'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 18.2,
    music: 'day',
    platform: { radius: 36, surface: 'grass_block', border: 'concrete_white', clearHeight: 12 },
    prefabs: [{ prefab: 'race_track', x: 0, z: 0 }],
    spawn: [-24, 9],
    spawnYaw: 0,
    cameraMode: 'third',
    vehicle: { enabled: true, style: 'kart' },
    race: { laps: 3, rx: 25.5, rz: 15.5, startAngle: 3.3916, gateRadius: 6.2 },
    fallReset: true,
    spawns: [
      { entity: 'human:guard_city', offset: [16, 0, 10], name: 'Marshal Okafor', dialogue: 'Keep it on the black stuff. The tyres are fresh and the brakes are... mostly there.' },
      { entity: 'human:adventurer', offset: [10, 0, -6], name: 'Crew Chief', dialogue: 'Three laps, five rivals. Shift is your boost — do not cook the engine on the first corner.' },
    ],
    objectives: [],
    quests: [],
    waves: [],
    checkpoints: [
      { offset: [-25, 1, -4], radius: 6, label: 'Start Line' },
    ],
    startingItems: [],
    hotbar: [],
    rules: {
      ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: false, invulnerable: true,
      naturalRegen: true, dayCycle: false, fallDamage: false, blockBreaking: false, blockPlacing: false, dropItems: false,
    },
    scripts: templateScript(`onStart(() => {
  camera('third');
  say('Lights out in three. W to drive, Shift to boost, A/D to steer.', 'good');
});
onEvent('respawn', () => say('Back on the grid. Go again.', 'info'));
`),
    stats: [
      { label: 'Circuit', value: '1.2 km' },
      { label: 'Rivals', value: '5 AI' },
      { label: 'Laps', value: '3' },
    ],
  },
  {
    key: 'army',
    name: 'Ironhold Siege',
    subtitle: 'Storm the military base',
    description: 'A fortified army base held by riflemen and a heavy breacher squad. Fight through the gate, clear the courtyard and take down Colonel Varga.',
    story: 'Ironhold went dark three days ago. The last transmission was a single word: traitors.',
    icon: '⌖',
    accent: '#d0b45a',
    difficulty: 'hard',
    tags: ['Shooter', 'Army', 'Boss'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 7.4,
    music: 'arena',
    platform: { radius: 30, surface: 'grass_block', border: 'concrete_black', clearHeight: 20 },
    prefabs: [{ prefab: 'army_base', x: 0, z: 0 }],
    spawn: [0, 28],
    spawnYaw: 0,
    cameraMode: 'third',
    spawns: [
      { entity: 'human:captain_steel', offset: [0, 0, 30], name: 'Captain Reyes', id: 'reyes', dialogue: 'You made it. Varga has the courtyard locked down and the helipad is his escape route. Push through and end this.' },
      { entity: 'human:soldier_rifle', offset: [-14, 0, 16], count: 2, spread: 4, name: 'Ironhold Rifleman' },
      { entity: 'human:soldier_rifle', offset: [12, 0, 8], count: 2, spread: 4, name: 'Ironhold Rifleman' },
      { entity: 'human:soldier_rifle', offset: [-17, 0, -12], count: 2, spread: 3, name: 'Ironhold Rifleman' },
      { entity: 'human:soldier_heavy', offset: [8, 0, -8], count: 2, spread: 4, name: 'Ironhold Breacher' },
      { entity: 'human:soldier_heavy', offset: [-13, 0, -18], name: 'Breacher Sergeant' },
      { entity: 'human:commander_iron', offset: [0, 0, -16], name: 'Colonel Varga', boss: true },
    ],
    objectives: [
      { id: 'reyes', title: 'Report to Captain Reyes', kind: 'talk', target: 'reyes', count: 1, description: 'Your ally is waiting outside the south gate.' },
      { id: 'riflemen', title: 'Clear the riflemen', kind: 'kill', target: 'human:soldier_rifle', count: 6 },
      { id: 'breachers', title: 'Break the heavy squad', kind: 'kill', target: 'human:soldier_heavy', count: 3 },
      { id: 'varga', title: 'Defeat Colonel Varga', kind: 'kill', target: 'human:commander_iron', count: 1 },
    ],
    quests: [],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 27], radius: 5, label: 'South Gate' },
      { offset: [0, 1, 0], radius: 6, label: 'Central Courtyard' },
    ],
    startingItems: [
      { item: 'rifle', count: 1 },
      { item: 'rifle_ammo', count: 120 },
      { item: 'iron_sword', count: 1 },
      { item: 'iron_chestplate', count: 1 },
      { item: 'iron_helmet', count: 1 },
      { item: 'cooked_beef', count: 8 },
      { item: 'golden_apple', count: 2 },
      { item: 'torch', count: 16 },
    ],
    hotbar: ['rifle', 'rifle_ammo', 'iron_sword', 'cooked_beef', 'golden_apple', 'iron_chestplate', 'iron_helmet', 'torch', 'rifle_ammo'],
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: true, naturalRegen: false, dayCycle: false },
    scripts: templateScript(`onStart(() => {
  camera('third');
  say('Ironhold is hostile. Use cover and clear the base.', 'warn');
});
onEvent('kill', (event) => {
  if (String(event.entity).includes('soldier')) give('coin', 2);
});
`),
    stats: [
      { label: 'Hostiles', value: '12' },
      { label: 'Boss', value: 'Varga' },
      { label: 'Camera', value: 'Over-shoulder' },
    ],
  },
  {
    key: 'city',
    name: 'Neon Heights',
    subtitle: 'Cars, crime and skyscrapers',
    description: 'A rain-slicked city block of glass towers, diners and neon arcades. Take jobs from the watch, break the syndicate and drive anywhere in your car.',
    story: 'The city never sleeps because somebody keeps stealing the light. Tonight, that somebody is wearing a very expensive suit.',
    icon: '▥',
    accent: '#59b8ff',
    difficulty: 'normal',
    tags: ['City', 'Open World', 'Crime'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 20.6,
    music: 'night',
    platform: { radius: 40, surface: 'concrete_gray', border: 'concrete_black', clearHeight: 52 },
    prefabs: [
      { prefab: 'city_block', x: 0, z: 0 },
      { prefab: 'skyscraper', x: 28, z: -25 },
    ],
    spawn: [0, 20],
    spawnYaw: 0,
    cameraMode: 'third',
    vehicle: { enabled: false, style: 'car' },
    fx: { neon: true, hologram: true, post: 'neon' },
    spawns: [
      { entity: 'human:guard_city', offset: [8, 0, 14], count: 2, spread: 3, name: 'City Watch' },
      { entity: 'human:bandit_road', offset: [-10, 0, 2], count: 3, spread: 5, name: 'Neon Syndicate' },
      { entity: 'human:ninja_ember', offset: [12, 0, -6], count: 2, spread: 4, name: 'Syndicate Runner' },
      { entity: 'human:orc_brute', offset: [0, 0, -12], name: 'Mr. Glass', boss: true },
      { entity: 'human:chef_inn', offset: [-12, 0, 11], name: 'Berta', dialogue: 'Diner is open all night. So is the syndicate, unfortunately.' },
      { entity: 'human:villager_farmer', offset: [7, 0, 9], name: 'Corner Vendor', dialogue: 'Fresh apples. No questions about where the crate came from.' },
    ],
    objectives: [
      { id: 'watch', title: 'Check in with the City Watch', kind: 'talk', target: 'City Watch', count: 1 },
      { id: 'syndicate', title: 'Push the syndicate off the block', kind: 'kill', target: 'human:bandit_road', count: 3 },
      { id: 'runner', title: 'Stop the syndicate runners', kind: 'kill', target: 'human:ninja_ember', count: 2 },
      { id: 'glass', title: 'Take down Mr. Glass', kind: 'kill', target: 'human:orc_brute', count: 1 },
      { id: 'tower', title: 'Reach Aurora Tower', kind: 'reach', offset: [26, 1, -22], radius: 6, count: 1, description: 'The glass tower on the north-east corner.' },
    ],
    quests: [],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 20], radius: 6, label: 'Neon Boulevard' },
      { offset: [0, 1, 0], radius: 6, label: 'Central Crossing' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 32 },
      { item: 'bread', count: 5 },
      { item: 'coin', count: 10 },
      { item: 'torch', count: 10 },
      { item: 'compass', count: 1 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'bread', 'torch', 'coin', 'compass', 'bread', 'arrow'],
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: true, naturalRegen: true, dayCycle: false },
    scripts: templateScript(`onStart(() => {
  camera('third');
  say('Neon Heights. Press F6 to summon your car.', 'good');
});
onEvent('key', (event) => {
  if (event.key === 'KeyR') say('The tower is north-east, past the arcade.', 'info');
});
`),
    stats: [
      { label: 'District', value: '1 block' },
      { label: 'Vehicle', value: 'Car' },
      { label: 'Camera', value: 'Third' },
    ],
  },
  {
    key: 'platformer',
    name: 'Spore Valley',
    subtitle: 'A side-scrolling platform adventure',
    description: 'A hand-built side-view course of floating steps, green pipes, brick blocks and bottomless gaps. Hop to the flag and stomp the sporelings.',
    story: 'The valley used to be a picnic spot. Then the mushrooms learned to walk.',
    icon: '▶',
    accent: '#8ce05f',
    difficulty: 'normal',
    tags: ['Platformer', 'Side View', 'Course'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 12.4,
    music: 'day',
    platform: { radius: 44, surface: 'grass_block', border: 'stone_bricks', clearHeight: 24 },
    prefabs: [{ prefab: 'platform_course', x: 0, z: 0 }],
    spawn: [-34, 0],
    spawnYaw: 0,
    cameraMode: 'side',
    fallReset: true,
    spawns: [
      { entity: 'creature:mushroomling', offset: [-28, 0, 2], count: 2, spread: 3, name: 'Sporeling' },
      { entity: 'creature:mushroomling', offset: [-12, 0, -2], count: 2, spread: 3, name: 'Sporeling' },
      { entity: 'creature:mushroomling', offset: [6, 0, 2], count: 2, spread: 3, name: 'Sporeling' },
      { entity: 'creature:slime', offset: [20, 0, 0], count: 2, spread: 4, name: 'Bouncebud' },
      { entity: 'creature:mushroomling', offset: [34, 0, -2], name: 'Sporeling Captain' },
      { entity: 'creature:chicken', offset: [24, 0, -4], count: 2, spread: 2 },
    ],
    objectives: [
      { id: 'spores', title: 'Clear the sporelings', kind: 'kill', target: 'creature:mushroomling', count: 7 },
      { id: 'mid', title: 'Reach the brick platform', kind: 'reach', offset: [4, 6, 0], radius: 4, count: 1 },
      { id: 'flag', title: 'Touch the finish flag', kind: 'reach', offset: [33, 9, 0], radius: 4, count: 1, description: 'The chequered flag at the far end.' },
    ],
    quests: [],
    waves: [],
    checkpoints: [
      { offset: [-34, 1, 0], radius: 4, label: 'Valley Start' },
      { offset: [-12, 1, 0], radius: 4, label: 'Pipe Crossing' },
      { offset: [8, 1, 0], radius: 4, label: 'Brick Rise' },
      { offset: [24, 1, 0], radius: 4, label: 'Final Stretch' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bread', count: 5 },
      { item: 'golden_apple', count: 1 },
    ],
    hotbar: ['iron_sword', 'bread', 'golden_apple', 'iron_sword', 'bread', 'iron_sword', 'bread', 'golden_apple', 'iron_sword'],
    rules: {
      ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: false, invulnerable: false,
      naturalRegen: true, dayCycle: false, fallDamage: false, blockBreaking: false, blockPlacing: false, dropItems: false,
    },
    scripts: templateScript(`onStart(() => {
  camera('side');
  say('A/D to run, Space to jump. Reach the flag on the right!', 'good');
});
onEvent('respawn', () => say('Mind the gaps.', 'warn'));
`),
    stats: [
      { label: 'Course', value: '74 m' },
      { label: 'Gaps', value: '4' },
      { label: 'Camera', value: 'Side' },
    ],
  },
  {
    key: 'studio',
    name: 'Blank Studio',
    subtitle: 'Make it your own',
    description: 'An empty flat canvas with the full studio unlocked. Paint terrain, stamp prefabs, place Blockbench models, set rules and play instantly.',
    story: 'No quest. No rules but the ones you write. Start with a single block.',
    icon: '✎',
    accent: '#8ce05f',
    difficulty: 'peaceful',
    tags: ['Studio', 'Sandbox', 'Level Design'],
    preset: 'flat',
    heightMode: 'flat',
    timeOfDay: 11,
    music: 'day',
    platform: { radius: 26, surface: 'grass_block', border: 'stone_bricks', clearHeight: 12 },
    prefabs: [],
    spawn: [0, 0],
    spawns: [],
    objectives: [],
    quests: [],
    waves: [],
    checkpoints: [],
    startingItems: [],
    hotbar: ['grass_block', 'dirt', 'stone', 'oak_planks', 'stone_bricks', 'glass', 'torch', 'glowstone', 'crystal_block'],
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, hunger: false, allowFlight: true, invulnerable: true, naturalRegen: true, fallDamage: false },
    showStudioOnStart: true,
    stats: [
      { label: 'Canvas', value: '512×512' },
      { label: 'Assets', value: '76' },
      { label: 'Mode', value: 'Studio' },
    ],
  },
  {
    key: 'frostpeak',
    name: 'Frostpeak Expedition',
    subtitle: 'A village under the aurora',
    description: 'A snowbound village, a crystal cavern and a windswept summit. Take hunts from the villagers, descend into the ice and face the wyrm that nests above the clouds.',
    story: 'The aurora has burned green for nine nights. Sigrun says that means the wyrm is awake — and that the mountain is waiting for someone foolish enough to climb it.',
    icon: '❄',
    accent: '#8bd8ff',
    difficulty: 'hard',
    tags: ['Adventure', 'Snow', 'Boss'],
    preset: 'snow',
    heightMode: 'ground',
    timeOfDay: 8.4,
    weather: 'snow',
    music: 'day',
    platform: { radius: 64, surface: 'snow_block', border: 'stone_bricks', clearHeight: 46 },
    prefabs: [
      { prefab: 'frost_village', x: 0, z: 0 },
      { prefab: 'ice_cavern', x: 44, z: 12 },
      { prefab: 'summit_shrine', x: 0, z: -46 },
      { prefab: 'hot_spring', x: -40, z: 8 },
    ],
    spawn: [0, 30],
    spawnYaw: 0,
    spawns: [
      { entity: 'human:snow_hunter', offset: [-5, 0, 18], name: 'Sigrun', id: 'sigrun', questId: 'winter', dialogue: 'Nine nights of green fire. The wyrm has woken under the summit, and my hunters will not go above the tree line. You will.' },
      { entity: 'human:adventurer', offset: [6, 0, 16], name: 'Cael', id: 'cael', questId: 'wyrm', dialogue: 'I climbed to the shrine once. I came back with a cracked rib and no story worth telling. Bring a bow.' },
      { entity: 'human:snow_hunter', offset: [-12, 0, 9], count: 2, spread: 4, name: 'Frost Hunter' },
      { entity: 'human:villager_farmer', offset: [13, 0, 18], name: 'Hilda', dialogue: 'The hot spring is west of the gate. Warm your bones before you go dying on that mountain.' },
      { entity: 'creature:sheep', offset: [12, 0, 6], count: 3, spread: 4 },
      { entity: 'creature:wolf', offset: [-30, 0, 22], count: 2, spread: 4 },
      { entity: 'creature:wisp', offset: [44, -13, 7], count: 3, spread: 3 },
      { entity: 'creature:stone_golem', offset: [46, -13, 8], name: 'Rime Colossus', boss: true },
      { entity: 'creature:frost_dragon', offset: [0, 27, -46], name: 'The Frost Wyrm', boss: true },
    ],
    objectives: [
      { id: 'sigrun', title: 'Speak with Sigrun', kind: 'talk', target: 'sigrun', count: 1 },
      { id: 'shards', title: 'Recover 4 crystal shards', kind: 'collect', target: 'crystal_shard', count: 4, description: 'Wisps haunt the crystal cavern east of the village.' },
      { id: 'colossus', title: 'Break the Rime Colossus', kind: 'kill', target: 'creature:stone_golem', count: 1 },
      { id: 'summit', title: 'Reach the summit shrine', kind: 'reach', offset: [0, 24, -46], radius: 8, count: 1, description: 'Follow the spiral ledge up the peak north of the village.' },
      { id: 'wyrm', title: 'Slay the Frost Wyrm', kind: 'kill', target: 'creature:frost_dragon', count: 1 },
    ],
    quests: [
      {
        id: 'winter', title: 'The Long Winter', giver: 'Sigrun', summary: 'Sigrun needs crystal shards to relight the village ward, and proof that the summit path can still be walked.',
        objectives: [
          { id: 'q-shards', title: 'Collect crystal shards', kind: 'collect', target: 'crystal_shard', count: 4 },
          { id: 'q-summit', title: 'Reach the summit shrine', kind: 'reach', offset: [0, 24, -46], radius: 8, count: 1 },
        ],
        reward: { xp: 220, items: [{ item: 'diamond_chestplate', count: 1 }, { item: 'golden_apple', count: 3 }], coins: 40 },
      },
      {
        id: 'wyrm', title: 'Wings Above the Peak', giver: 'Cael', summary: 'Cael wants the Frost Wyrm gone before it descends on the village. The Rime Colossus in the cavern guards the old ballista bolts.',
        objectives: [
          { id: 'q-colossus', title: 'Defeat the Rime Colossus', kind: 'kill', target: 'creature:stone_golem', count: 1 },
          { id: 'q-wyrm', title: 'Slay the Frost Wyrm', kind: 'kill', target: 'creature:frost_dragon', count: 1 },
        ],
        reward: { xp: 320, items: [{ item: 'diamond_sword', count: 1 }, { item: 'dragon_scale', count: 3 }], coins: 75 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 16], radius: 6, label: 'Frostpeak Village' },
      { offset: [44, -12, 3], radius: 6, label: 'Rime Cavern' },
      { offset: [0, 24, -46], radius: 7, label: 'Summit Shrine' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 24 },
      { item: 'iron_chestplate', count: 1 },
      { item: 'bread', count: 8 },
      { item: 'torch', count: 12 },
      { item: 'water_bottle', count: 2 },
      { item: 'coin', count: 15 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'bread', 'torch', 'water_bottle', 'iron_chestplate', 'coin', 'torch'],
    rules: { ...BASE_RULES, keepInventory: true, pvp: false },
    fx: { aurora: true, post: 'frost' },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Sigrun is waiting inside the village gate. The cavern lies east; the summit, north.', 'info');
  give('bread', 2);
});
onEvent('respawn', () => say('The cold takes you back to the last warm fire.', 'warn'));
`),
    stats: [
      { label: 'Regions', value: '4' },
      { label: 'Quests', value: '2' },
      { label: 'Boss', value: 'Frost Wyrm' },
    ],
  },
  {
    key: 'dune',
    name: 'Sunscour Wastes',
    subtitle: 'Water, gold and bad company',
    description: 'A desert outpost at the edge of the deep dunes, a bandit camp in the badlands and a buried temple full of traps. Keep your water close and your blade closer.',
    story: 'The well still runs, which is why the bandits keep coming. The temple under the sand is why nobody has stayed to defend it.',
    icon: '☀',
    accent: '#f0b45a',
    difficulty: 'normal',
    tags: ['Adventure', 'Desert', 'Dungeon'],
    preset: 'desert',
    heightMode: 'ground',
    timeOfDay: 12.6,
    music: 'day',
    platform: { radius: 66, surface: 'sand', border: 'sandstone', clearHeight: 32 },
    prefabs: [
      { prefab: 'desert_outpost', x: 0, z: 8 },
      { prefab: 'sunken_temple', x: 0, z: -42 },
      { prefab: 'bandit_camp', x: -40, z: 10 },
    ],
    spawn: [0, 38],
    spawnYaw: 0,
    spawns: [
      { entity: 'human:desert_nomad', offset: [0, 0, 24], name: 'Sahir', id: 'sahir', questId: 'water', dialogue: 'The well is ours. The bandits seem to think otherwise. Five of them camped west of here — thin them out and I will fill your skins for free.' },
      { entity: 'human:desert_nomad', offset: [3, 0, 14], name: 'Nadia', id: 'nadia', questId: 'crown', dialogue: 'My grandmother drew maps of the temple before the sand took it. The summit shrine is still there. So is whatever guards it.' },
      { entity: 'human:guard_city', offset: [-6, 0, 22], count: 2, spread: 3, name: 'Outpost Guard' },
      { entity: 'human:bandit_road', offset: [-40, 0, 20], count: 5, spread: 3 },
      { entity: 'creature:scorpion', offset: [18, 0, -12], count: 3, spread: 5 },
      { entity: 'creature:stone_golem', offset: [0, 1, -42], name: 'Temple Guardian', boss: true },
      { entity: 'creature:cow', offset: [14, 0, 20], count: 2, spread: 4 },
    ],
    objectives: [
      { id: 'sahir', title: 'Speak with Sahir', kind: 'talk', target: 'sahir', count: 1 },
      { id: 'bandits', title: 'Drive off 5 dune bandits', kind: 'kill', target: 'human:bandit_road', count: 5 },
      { id: 'scorpions', title: 'Clear 3 scorpion nests', kind: 'kill', target: 'creature:scorpion', count: 3 },
      { id: 'guardian', title: 'Defeat the Temple Guardian', kind: 'kill', target: 'creature:stone_golem', count: 1 },
      { id: 'summit', title: 'Climb the temple summit', kind: 'reach', offset: [0, 19, -42], radius: 7, count: 1, description: 'The shrine on top of the buried pyramid.' },
    ],
    quests: [
      {
        id: 'water', title: 'The Well at World\'s End', giver: 'Sahir', summary: 'The outpost well is the only water for a day\'s walk. The bandits west of the gate have been charging for it.',
        objectives: [
          { id: 'q-bandits', title: 'Defeat the dune bandits', kind: 'kill', target: 'human:bandit_road', count: 5 },
          { id: 'q-scorpions', title: 'Clear the scorpion nests', kind: 'kill', target: 'creature:scorpion', count: 3 },
        ],
        reward: { xp: 160, items: [{ item: 'iron_chestplate', count: 1 }, { item: 'water_bottle', count: 4 }], coins: 45 },
      },
      {
        id: 'crown', title: 'The Buried Crown', giver: 'Nadia', summary: 'Nadia wants proof that the temple summit still stands. The guardian beneath it has other ideas.',
        objectives: [
          { id: 'q-guardian', title: 'Defeat the Temple Guardian', kind: 'kill', target: 'creature:stone_golem', count: 1 },
          { id: 'q-summit', title: 'Reach the temple summit', kind: 'reach', offset: [0, 19, -42], radius: 7, count: 1 },
        ],
        reward: { xp: 280, items: [{ item: 'diamond_sword', count: 1 }, { item: 'gold_ingot', count: 6 }], coins: 80 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 22], radius: 6, label: 'Sunscour Outpost' },
      { offset: [-40, 1, 10], radius: 6, label: 'Bandit Camp' },
      { offset: [0, 1, -25], radius: 5, label: 'Temple Entrance' },
      { offset: [0, 19, -42], radius: 6, label: 'Temple Summit' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 16 },
      { item: 'leather_helmet', count: 1 },
      { item: 'water_bottle', count: 4 },
      { item: 'bread', count: 6 },
      { item: 'torch', count: 10 },
      { item: 'coin', count: 20 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'water_bottle', 'bread', 'torch', 'leather_helmet', 'coin', 'water_bottle'],
    rules: { ...BASE_RULES, keepInventory: true, pvp: false },
    fx: { post: 'desert' },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Sahir is by the well. Nadia keeps the map table. West is bandit country; north is the temple.', 'info');
});
onEvent('respawn', () => say('The sand gives you back. Your water did not survive the trip.', 'warn'));
`),
    stats: [
      { label: 'Regions', value: '3' },
      { label: 'Quests', value: '2' },
      { label: 'Boss', value: 'Temple Guardian' },
    ],
  },
  {
    key: 'skytemple',
    name: 'Sky Temple Trials',
    subtitle: 'A climb through the clouds',
    description: 'A chain of floating islands above an endless drop, ending at a quartz temple and its crystal guardian. Leap the gaps, light the shrines and claim the crown of the sky.',
    story: 'The temple was built for pilgrims who could fly. The stairs fell away centuries ago. The faithful learned to jump.',
    icon: '☁',
    accent: '#b8a4ff',
    difficulty: 'hard',
    tags: ['Sky', 'Parkour', 'Boss'],
    preset: 'sky',
    heightMode: 'sky',
    skyBase: 82,
    timeOfDay: 7.6,
    music: 'day',
    fallReset: true,
    prefabs: [{ prefab: 'sky_temple', x: 0, z: 0 }],
    spawn: [0, 12],
    spawnYaw: 0,
    spawns: [
      { entity: 'human:elf_archer', offset: [3, 0, 10], name: 'Warden Sylva', id: 'sylva', questId: 'steps', dialogue: 'Four islands, four shrines, one very angry guardian. The gaps are wider than they look. Do not look down for too long.' },
      { entity: 'human:adventurer', offset: [-2, 0, 8], name: 'Pip', id: 'pip', questId: 'guardian', dialogue: 'I made it to the third island once. Then I made friends with a wisp. It did not go well.' },
      { entity: 'creature:wisp', offset: [0, 1, -3], count: 2, spread: 2 },
      { entity: 'creature:wisp', offset: [7, 2, -11], count: 2, spread: 2 },
      { entity: 'creature:wisp', offset: [-1, 3, -19], count: 2, spread: 2 },
      { entity: 'creature:crystal_golem', offset: [0, 9, -37], name: 'Prism Guardian', boss: true },
    ],
    objectives: [
      { id: 'sylva', title: 'Speak with Warden Sylva', kind: 'talk', target: 'sylva', count: 1 },
      { id: 'shards', title: 'Gather 4 crystal shards', kind: 'collect', target: 'crystal_shard', count: 4, description: 'The wisps between the islands carry them.' },
      { id: 'guardian', title: 'Defeat the Prism Guardian', kind: 'kill', target: 'creature:crystal_golem', count: 1 },
      { id: 'temple', title: 'Enter the sky temple', kind: 'reach', offset: [0, 9, -43], radius: 6, count: 1, description: 'Cross all four islands to the quartz temple.' },
    ],
    quests: [
      {
        id: 'steps', title: 'Trial of Steps', giver: 'Sylva', summary: 'Sylva will open the temple way for anyone who can cross the islands and return with the wisps\' shards.',
        objectives: [
          { id: 'q-shards', title: 'Gather crystal shards', kind: 'collect', target: 'crystal_shard', count: 4 },
          { id: 'q-temple', title: 'Reach the sky temple', kind: 'reach', offset: [0, 9, -43], radius: 6, count: 1 },
        ],
        reward: { xp: 240, items: [{ item: 'diamond_boots', count: 1 }, { item: 'golden_apple', count: 2 }], coins: 35 },
      },
      {
        id: 'guardian', title: 'The Prism Heart', giver: 'Pip', summary: 'The guardian on the temple dais is the only thing keeping the sky islands aloft. Probably. Pip would like it gone anyway.',
        objectives: [
          { id: 'q-guardian', title: 'Defeat the Prism Guardian', kind: 'kill', target: 'creature:crystal_golem', count: 1 },
        ],
        reward: { xp: 300, items: [{ item: 'staff', count: 1 }, { item: 'crystal_shard', count: 4 }], coins: 70 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 8], radius: 5, label: 'Cloudfall Camp' },
      { offset: [0, 2, -3], radius: 4, label: 'First Island' },
      { offset: [-1, 4, -19], radius: 4, label: 'Third Island' },
      { offset: [0, 9, -38], radius: 5, label: 'Sky Temple' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 16 },
      { item: 'leather_boots', count: 1 },
      { item: 'bread', count: 6 },
      { item: 'water_bottle', count: 2 },
      { item: 'compass', count: 1 },
      { item: 'coin', count: 10 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'bread', 'water_bottle', 'compass', 'leather_boots', 'coin', 'bread'],
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, pvp: false },
    fx: { aurora: true, post: 'frost' },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Sylva waits at the camp. The stepping islands run north — follow the quartz markers.', 'info');
});
onEvent('respawn', () => say('The clouds catch you and set you back on the last island.', 'warn'));
`),
    stats: [
      { label: 'Islands', value: '5' },
      { label: 'Quests', value: '2' },
      { label: 'Boss', value: 'Prism Guardian' },
    ],
  },
  {
    key: 'kitchen',
    name: 'Ember & Oak Kitchen',
    subtitle: 'Dinner service starts now',
    description: 'Run a busy village restaurant: buy pantry bundles, cook dishes on the iron range, serve tables before patience runs out and build a reputation worth the queue.',
    story: 'Mira has run the Ember & Oak for eleven years. Tonight the regulars are coming, the stove is hot, and her new hire has exactly one shift to prove they can keep up.',
    icon: '♨',
    accent: '#f0a45c',
    difficulty: 'normal',
    tags: ['Cooking', 'Management', 'Cozy'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 16.4,
    music: 'day',
    platform: { radius: 30, surface: 'grass_block', border: 'stone_bricks', clearHeight: 44 },
    prefabs: [{ prefab: 'restaurant', x: 0, z: 0 }],
    spawn: [0, 9],
    spawnYaw: 0,
    spawns: [
      { entity: 'human:chef_inn', offset: [0, 0, -5], name: 'Mira', id: 'mira', questId: 'first_service', behavior: 'stationary', dialogue: 'Apron on, knife clean, pantry counted. We open in ten minutes. Cook what you can, serve it while it is hot, and do not let the pass back up.' },
      { entity: 'human:adventurer', offset: [-8, 0, 5], name: 'Tomas', id: 'tomas', questId: 'regulars', behavior: 'stationary', dialogue: 'I have eaten here every Thursday for six years. If you can keep my table fed and the coffee coming, I will tell everyone in the valley.' },
      { entity: 'human:villager_farmer', offset: [8, 0, 5], name: 'Pell', dialogue: 'The tomatoes came in this morning. Mira will pretend she grew them herself.' },
      { entity: 'creature:chicken', offset: [14, 0, 14], count: 3, spread: 4 },
    ],
    objectives: [
      { id: 'mira', title: 'Speak with Mira', kind: 'talk', target: 'mira', count: 1 },
      { id: 'cook', title: 'Cook 3 dishes', kind: 'cook', target: 'any', count: 3, description: 'Right-click a stove with the ingredients in your pack.' },
      { id: 'serve', title: 'Serve 4 customers', kind: 'serve', target: 'any', count: 4, description: 'Right-click a seated customer while holding their dish.' },
      { id: 'earn', title: 'Earn 120 coins in service', kind: 'earn', target: 'coin', count: 120 },
      { id: 'shift', title: 'Complete a full dinner rush', kind: 'serve', target: 'any', count: 8 },
    ],
    quests: [
      {
        id: 'first_service', title: 'First Service', giver: 'Mira', summary: 'Mira needs proof that her new hire can cook two plates and get them to the right table without burning the kitchen down.',
        objectives: [
          { id: 'q-cook', title: 'Cook two dishes', kind: 'cook', target: 'any', count: 2 },
          { id: 'q-serve', title: 'Serve two customers', kind: 'serve', target: 'any', count: 2 },
        ],
        reward: { xp: 180, items: [{ item: 'chef_hat', count: 1 }, { item: 'cheese', count: 4 }], coins: 30 },
      },
      {
        id: 'regulars', title: 'The Thursday Regulars', giver: 'Tomas', summary: 'Tomas has bet the whole village that the new hire can carry a dinner rush. Five plates and a hundred coins says he is right.',
        objectives: [
          { id: 'q-serve', title: 'Serve five customers', kind: 'serve', target: 'any', count: 5 },
          { id: 'q-earn', title: 'Earn 100 coins in tips and sales', kind: 'earn', target: 'coin', count: 100 },
        ],
        reward: { xp: 320, items: [{ item: 'apron', count: 1 }, { item: 'golden_apple', count: 2 }], coins: 60 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 3], radius: 6, label: 'Dining Room' },
      { offset: [0, 1, -5], radius: 5, label: 'Kitchen Line' },
    ],
    startingItems: [
      { item: 'chef_hat', count: 1 },
      { item: 'apron', count: 1 },
      { item: 'bread', count: 2 },
      { item: 'cheese', count: 4 },
      { item: 'tomato', count: 4 },
      { item: 'lettuce', count: 4 },
      { item: 'dough', count: 2 },
      { item: 'coffee_bean', count: 3 },
      { item: 'milk', count: 3 },
      { item: 'coin', count: 40 },
    ],
    hotbar: ['bread', 'cheese', 'tomato', 'lettuce', 'dough', 'coffee_bean', 'milk', 'chef_hat', 'apron'],
    sim: {
      kind: 'cooking',
      recipes: ['burger', 'pizza', 'salad', 'cake', 'coffee', 'ramen', 'soup'],
      customerSpots: [
        { x: -8, z: 3 }, { x: -3, z: 3 }, { x: 2, z: 3 }, { x: 7, z: 3 },
        { x: -8, z: 5 }, { x: 7, z: 5 },
      ],
      spawnEvery: 12,
      maxCustomers: 4,
    },
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, dayCycle: false, pvp: false },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Mira is behind the counter. The stoves are along the back wall; the pantry crates are beside them.', 'info');
  give('bread', 2);
});
onEvent('respawn', () => say('Mira points you back to the pass. Service is not over yet.', 'warn'));
`),
    stats: [
      { label: 'Recipes', value: '8' },
      { label: 'Quests', value: '2' },
      { label: 'Shift', value: 'Dinner rush' },
    ],
  },
  {
    key: 'shopkeep',
    name: 'Corner & Candle',
    subtitle: 'Keep the shelves full',
    description: 'Take over a village general store: restock shelves, watch the chalkboard special, ring up customers and turn a quiet corner shop into the busiest counter in the valley.',
    story: 'Mabel opened the Corner & Candle when the road was still mud. Now the road is cobbled, the shelves are half empty, and she has finally admitted she needs help.',
    icon: '▤',
    accent: '#e8c46a',
    difficulty: 'normal',
    tags: ['Shop', 'Management', 'Village'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 10.2,
    music: 'day',
    platform: { radius: 30, surface: 'grass_block', border: 'dirt_path', clearHeight: 44 },
    prefabs: [{ prefab: 'general_store', x: 0, z: 0 }],
    spawn: [0, 9],
    spawnYaw: 0,
    spawns: [
      { entity: 'human:villager_farmer', offset: [1, 0, 5], name: 'Mabel', id: 'mabel', questId: 'opening', behavior: 'stationary', dialogue: 'Till is on the counter, chalkboard is by the door, and the shelves are your problem now. Restock what is low, ring up what people want, and mind the special.' },
      { entity: 'human:guard_city', offset: [-7, 0, 6], name: 'Constable Rook', id: 'rook', questId: 'collector', behavior: 'stationary', dialogue: 'The collector from the city is coming. She wants a tin toy car and one of those lucky coins. I would not disappoint her.' },
      { entity: 'human:desert_nomad', offset: [7, 0, 6], name: 'Sana', dialogue: 'Your window display is the only reason I walk this street. Do not let it go empty.' },
      { entity: 'creature:cat', offset: [-8, 0, 6], name: 'Biscuit' },
    ],
    objectives: [
      { id: 'mabel', title: 'Speak with Mabel', kind: 'talk', target: 'mabel', count: 1 },
      { id: 'restock', title: 'Restock the shelves 3 times', kind: 'restock', target: 'any', count: 3, description: 'Right-click a shop shelf with coins in your pocket.' },
      { id: 'sell', title: 'Serve 5 customers', kind: 'sell', target: 'any', count: 5 },
      { id: 'earn', title: 'Earn 150 coins', kind: 'earn', target: 'coin', count: 150 },
    ],
    quests: [
      {
        id: 'opening', title: 'Opening Shift', giver: 'Mabel', summary: 'Mabel wants the shop running before the lunch crowd: restock two lines, serve three customers and get the till moving.',
        objectives: [
          { id: 'q-restock', title: 'Restock the shelves twice', kind: 'restock', target: 'any', count: 2 },
          { id: 'q-sell', title: 'Serve three customers', kind: 'sell', target: 'any', count: 3 },
        ],
        reward: { xp: 190, items: [{ item: 'candle', count: 2 }, { item: 'soap', count: 2 }], coins: 35 },
      },
      {
        id: 'collector', title: 'The City Collector', giver: 'Rook', summary: 'A collector is arriving for a tin toy car and a lucky coin. Rook would rather she leave with both and a good word about the village.',
        objectives: [
          { id: 'q-toy', title: 'Sell a tin toy car', kind: 'sell', target: 'toy_car', count: 1 },
          { id: 'q-lucky', title: 'Sell a lucky coin', kind: 'sell', target: 'lucky_coin', count: 1 },
          { id: 'q-earn', title: 'Earn 100 coins', kind: 'earn', target: 'coin', count: 100 },
        ],
        reward: { xp: 320, items: [{ item: 'lucky_coin', count: 1 }, { item: 'toy_car', count: 1 }], coins: 70 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 2], radius: 6, label: 'Shop Floor' },
      { offset: [2, 1, 5], radius: 3, label: 'Checkout Counter' },
    ],
    startingItems: [
      { item: 'apron', count: 1 },
      { item: 'bread', count: 2 },
      { item: 'torch', count: 6 },
      { item: 'soap', count: 2 },
      { item: 'coin', count: 50 },
    ],
    hotbar: ['bread', 'torch', 'soap', 'coin', 'coin', 'coin', 'coin', 'coin', 'apron'],
    sim: {
      kind: 'store',
      products: ['bread', 'apple', 'torch', 'soap', 'candle', 'soda', 'snack_bar', 'toy_car', 'lucky_coin'],
      customerSpots: [
        { x: -6, z: 2 }, { x: -3, z: 2 }, { x: 0, z: 2 }, { x: 3, z: 2 }, { x: 6, z: 2 },
        { x: -6, z: 6 }, { x: 6, z: 6 },
      ],
      spawnEvery: 10,
      maxCustomers: 5,
    },
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, pvp: false },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Mabel is at the counter. Shelves line the back and side walls; the chalkboard special is by the door.', 'info');
  give('coin', 10);
});
onEvent('respawn', () => say('Mabel taps the till. The queue is still waiting.', 'warn'));
`),
    stats: [
      { label: 'Products', value: '9' },
      { label: 'Quests', value: '2' },
      { label: 'Special', value: 'Rotating' },
    ],
  },
  {
    key: 'lucky',
    name: 'Lucky Block Gauntlet',
    subtitle: 'Risk it for the jackpot',
    description: 'A gold-trimmed arena stacked with lucky blocks and a few cursed ones. Every block is a roll: coins, loot, monsters, explosions or a jackpot. Break twelve, claim Fortune\'s Edge and survive the curses.',
    story: 'The arena was built by a gambler who could not stop. The blocks refill themselves. The crowd still comes. Nobody has ever asked where the monsters come from.',
    icon: '?',
    accent: '#f2cf5a',
    difficulty: 'easy',
    tags: ['Lucky Block', 'Arena', 'Loot'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 12.6,
    music: 'arena',
    platform: { radius: 34, surface: 'grass_block', border: 'stone_bricks', clearHeight: 44 },
    prefabs: [{ prefab: 'lucky_arena', x: 0, z: 0 }],
    spawn: [0, 10],
    spawnYaw: 0,
    spawns: [
      { entity: 'human:adventurer', offset: [-6, 0, 10], name: 'Cass', id: 'cass', questId: 'fortune', behavior: 'stationary', dialogue: 'Golden blocks are the good ones. Purple blocks are the honest ones. Break twelve gold and the arena pays out. Try not to stand next to an explosion.' },
      { entity: 'human:mage_arcane', offset: [6, 0, 10], name: 'Vex', id: 'vex', questId: 'curse', behavior: 'stationary', dialogue: 'The cursed blocks whisper. I have written down what they say. Most of it is rude, some of it is prophecy, all of it is a bad idea.' },
      { entity: 'creature:wisp', offset: [-9, 2, -9], count: 3, spread: 3 },
      { entity: 'creature:cat', offset: [9, 0, 8], name: 'Lucky' },
    ],
    objectives: [
      { id: 'cass', title: 'Speak with Cass', kind: 'talk', target: 'cass', count: 1 },
      { id: 'first', title: 'Break your first lucky block', kind: 'open', target: 'lucky_block', count: 1 },
      { id: 'twelve', title: 'Open 12 lucky blocks', kind: 'open', target: 'lucky_block', count: 12 },
      { id: 'cursed', title: 'Open 2 cursed blocks', kind: 'open', target: 'cursed_lucky_block', count: 2, description: 'They are the purple ones. You have been warned.' },
      { id: 'earn', title: 'Earn 200 coins from the arena', kind: 'earn', target: 'coin', count: 200 },
    ],
    quests: [
      {
        id: 'fortune', title: 'Fortune Favours the Bold', giver: 'Cass', summary: 'Cass wants a twelve-block run and a cut of the coins. She will settle for watching the explosions.',
        objectives: [
          { id: 'q-open', title: 'Open five lucky blocks', kind: 'open', target: 'lucky_block', count: 5 },
          { id: 'q-earn', title: 'Earn 80 coins', kind: 'earn', target: 'coin', count: 80 },
        ],
        reward: { xp: 220, items: [{ item: 'lucky_coin', count: 2 }, { item: 'golden_apple', count: 2 }], coins: 40 },
      },
      {
        id: 'curse', title: 'Cursed Curiosity', giver: 'Vex', summary: 'Vex needs two cursed blocks opened and a survivor to compare notes with. The arena is happy to provide both.',
        objectives: [
          { id: 'q-cursed', title: 'Open two cursed blocks', kind: 'open', target: 'cursed_lucky_block', count: 2 },
          { id: 'q-survive', title: 'Survive the arena for 2 minutes', kind: 'survive', count: 120 },
        ],
        reward: { xp: 300, items: [{ item: 'diamond', count: 3 }, { item: 'rune_block', count: 2 }], coins: 80 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 10], radius: 5, label: 'Arena Entrance' },
      { offset: [0, 1, 4], radius: 8, label: 'Lucky Ring' },
    ],
    startingItems: [
      { item: 'iron_pickaxe', count: 1 },
      { item: 'iron_sword', count: 1 },
      { item: 'lucky_coin', count: 3 },
      { item: 'bread', count: 6 },
      { item: 'golden_apple', count: 2 },
      { item: 'torch', count: 12 },
      { item: 'coin', count: 25 },
    ],
    hotbar: ['iron_pickaxe', 'iron_sword', 'lucky_coin', 'bread', 'golden_apple', 'torch', 'coin', 'bread', 'torch'],
    sim: {
      kind: 'lucky',
      targetOpen: 12,
    },
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, dayCycle: false, pvp: false },
    fx: { post: 'neon' },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Cass and Vex are by the entrance. Gold blocks are prizes, purple blocks are consequences.', 'info');
  give('torch', 4);
});
onEvent('respawn', () => say('The arena puts you back on your feet. The blocks are already refilling.', 'warn'));
`),
    stats: [
      { label: 'Blocks', value: '12 + 3 cursed' },
      { label: 'Quests', value: '2' },
      { label: 'Jackpot', value: 'Random' },
    ],
  },
  {
    key: 'royale',
    name: 'Stormfall: Last Light',
    subtitle: 'Outlast the ring',
    description: 'Eight contestants drop into a ruined arena, the storm eats the edges and every supply cache is a gamble. Loot, fight and be the last light standing.',
    story: 'The Stormfall began as a festival. Then the sky cracked, the ring appeared, and the contestants stopped leaving. The prize is still out there, hanging above the central beacon. So is everyone who tried to claim it.',
    icon: '☈',
    accent: '#b98cff',
    difficulty: 'normal',
    tags: ['Battle Royale', 'PvE', 'Storm', 'Loot'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 17.4,
    weather: 'ash',
    music: 'arena',
    platform: { radius: 34, surface: 'grass_block', border: 'mossy_stone_bricks', clearHeight: 48 },
    prefabs: [{ prefab: 'storm_arena', x: 0, z: 0 }],
    spawn: [0, 24],
    spawnYaw: 0,
    spawns: [
      {
        entity: 'human:ranger_alex', offset: [-5, 0, 20], name: 'Vale', id: 'vale', questId: 'lastlight', behavior: 'stationary',
        dialogue: 'Eight drop. One ring. Ten caches if the storm has not eaten them yet. The gold crates are supply caches — crack them with a right-click. Keep moving inward and let the others fight over the edges.',
      },
      {
        entity: 'human:explorer_jungle', offset: [5, 0, 20], name: 'Wren', id: 'wren', questId: 'shards', behavior: 'stationary',
        dialogue: 'The storm leaves shards in its wake. Purple, humming, slightly rude. Bring me four and I will make it worth your while. The cache at the old chapel is the safest first stop.',
      },
      { entity: 'creature:bat', offset: [-20, 4, -20], count: 3, spread: 3 },
      { entity: 'creature:bat', offset: [20, 5, 18], count: 2, spread: 3 },
    ],
    objectives: [
      { id: 'vale', title: 'Speak with Vale', kind: 'talk', target: 'vale', count: 1 },
      { id: 'cache', title: 'Loot 3 supply caches', kind: 'open', target: 'supply_cache', count: 3, description: 'Right-click the teal cargo crates scattered around the arena.' },
      { id: 'rivals', title: 'Eliminate all 8 rivals', kind: 'kill', target: 'any', count: 8 },
      { id: 'survive', title: 'Survive the storm for 2 minutes', kind: 'survive', count: 120, description: 'The ring never stops closing. Be inside it.' },
    ],
    quests: [
      {
        id: 'lastlight', title: 'Last Light', giver: 'Vale', summary: 'Vale is running the board. Four rivals down and two supply caches cracked will put you in the final circle.',
        objectives: [
          { id: 'q-kill', title: 'Eliminate four rivals', kind: 'kill', target: 'any', count: 4 },
          { id: 'q-cache', title: 'Loot two supply caches', kind: 'open', target: 'supply_cache', count: 2 },
        ],
        reward: { xp: 260, items: [{ item: 'rifle', count: 1 }, { item: 'rifle_ammo', count: 12 }], coins: 50 },
      },
      {
        id: 'shards', title: 'Storm Shards', giver: 'Wren', summary: 'Wren wants four storm shards and proof that the caches still hold. The ring is happy to supply both, at a price.',
        objectives: [
          { id: 'q-shards', title: 'Collect four storm shards', kind: 'collect', target: 'crystal_shard', count: 4 },
          { id: 'q-cache2', title: 'Loot two more supply caches', kind: 'open', target: 'supply_cache', count: 2 },
        ],
        reward: { xp: 300, items: [{ item: 'diamond', count: 2 }, { item: 'golden_apple', count: 2 }], coins: 40 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 24], radius: 6, label: 'Drop Gate' },
      { offset: [0, 1, 8], radius: 7, label: 'Stormheart' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 24 },
      { item: 'shield', count: 1 },
      { item: 'bread', count: 4 },
      { item: 'golden_apple', count: 2 },
      { item: 'torch', count: 8 },
      { item: 'coin', count: 25 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'shield', 'bread', 'golden_apple', 'torch', 'coin'],
    sim: {
      kind: 'royale',
      center: { x: 0, z: 0 },
      contestants: 8,
      stormTime: 170,
    },
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, dayCycle: false, pvp: false },
    fx: { post: 'racing' },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Vale and Wren are by the drop gate. Teal cargo crates are supply caches. The storm ring closes from the rim.', 'info');
  give('torch', 4);
});
onEvent('respawn', () => say('The storm spits you back onto the drop gate. It is already closing again.', 'warn'));
`),
    stats: [
      { label: 'Contestants', value: '8' },
      { label: 'Caches', value: '10 + drops' },
      { label: 'Storm', value: '170 seconds' },
    ],
  },
  {
    key: 'siege',
    name: 'Emberhold Siege',
    subtitle: 'Hold the core',
    description: 'A four-gate fortress, one burning core and five escalating assaults. Repair the core, upgrade the clockwork turrets and keep Emberhold standing.',
    story: 'Emberhold was built around a fire that never went out. Now the warlords have come to put it out. The garrison is dead, the gates are open, and the last engineer has handed you a wrench and a sword.',
    icon: '♜',
    accent: '#ff9b4a',
    difficulty: 'hard',
    tags: ['Siege', 'Tower Defense', 'Fortress', 'Waves'],
    preset: 'overworld',
    heightMode: 'ground',
    timeOfDay: 17.6,
    weather: 'ash',
    music: 'arena',
    platform: { radius: 32, surface: 'stone_bricks', border: 'stone_bricks', clearHeight: 40 },
    prefabs: [{ prefab: 'emberhold', x: 0, z: 0 }],
    spawn: [0, 20],
    spawnYaw: 0,
    spawns: [
      {
        entity: 'human:captain_steel', offset: [-4, 0, 5], name: 'Captain Steel', id: 'steel', questId: 'hold', behavior: 'stationary',
        dialogue: 'Four gates, five assaults, one core. The turrets are clockwork — right-click one to upgrade it. The core takes iron and coin to patch. I will hold the south lane; you keep the heart burning.',
      },
      {
        entity: 'human:mage_arcane', offset: [4, 0, 5], name: 'Warden Ilse', id: 'ilse', questId: 'embers', behavior: 'stationary',
        dialogue: 'The Ember Core is older than the keep. Feed it, shield it, and it will outlast the warlords. The turrets were built to my design; they get meaner with every mark. Bring me storm shards from the assault waves.',
      },
      { entity: 'human:knight_royal', offset: [-1, 0, -5], name: 'Sergeant Hallow', behavior: 'guard' },
      { entity: 'human:ranger_alex', offset: [1, 0, -5], name: 'Scout Fen', behavior: 'guard' },
      { entity: 'creature:fox', offset: [5, 0, 7], name: 'Cinder' },
    ],
    objectives: [
      { id: 'steel', title: 'Speak with Captain Steel', kind: 'talk', target: 'steel', count: 1 },
      { id: 'waves', title: 'Repel all 5 assault waves', kind: 'defend', target: 'wave', count: 5 },
      { id: 'raiders', title: 'Put down 20 raiders', kind: 'kill', target: 'any', count: 20 },
    ],
    quests: [
      {
        id: 'hold', title: 'Hold the Line', giver: 'Steel', summary: 'Steel wants two assault waves broken and eight raiders down before he will trust the yard to a stranger.',
        objectives: [
          { id: 'q-wave', title: 'Repel two assault waves', kind: 'defend', target: 'wave', count: 2 },
          { id: 'q-kill', title: 'Kill eight raiders', kind: 'kill', target: 'any', count: 8 },
        ],
        reward: { xp: 270, items: [{ item: 'iron_chestplate', count: 1 }, { item: 'iron_ingot', count: 4 }], coins: 45 },
      },
      {
        id: 'embers', title: 'Embers and Shards', giver: 'Ilse', summary: 'Ilse needs four storm shards from the assault waves and proof that Emberhold has held for four waves.',
        objectives: [
          { id: 'q-waves', title: 'Repel four assault waves', kind: 'defend', target: 'wave', count: 4 },
          { id: 'q-shards', title: 'Collect four storm shards', kind: 'collect', target: 'crystal_shard', count: 4 },
        ],
        reward: { xp: 360, items: [{ item: 'diamond_sword', count: 1 }, { item: 'golden_apple', count: 3 }], coins: 60 },
      },
    ],
    waves: [],
    checkpoints: [
      { offset: [0, 1, 20], radius: 6, label: 'South Gate' },
      { offset: [0, 1, 3], radius: 6, label: 'Ember Core' },
    ],
    startingItems: [
      { item: 'iron_sword', count: 1 },
      { item: 'bow', count: 1 },
      { item: 'arrow', count: 30 },
      { item: 'iron_chestplate', count: 1 },
      { item: 'shield', count: 1 },
      { item: 'golden_apple', count: 2 },
      { item: 'bread', count: 3 },
      { item: 'torch', count: 8 },
      { item: 'coin', count: 40 },
    ],
    hotbar: ['iron_sword', 'bow', 'arrow', 'iron_chestplate', 'shield', 'golden_apple', 'bread', 'torch', 'coin'],
    sim: {
      kind: 'siege',
      center: { x: 0, z: 0 },
      waveCount: 5,
    },
    rules: { ...BASE_RULES, keepInventory: true, mobSpawning: false, dayCycle: false, pvp: false },
    fx: { post: 'desert' },
    scripts: templateScript(`onStart(() => {
  camera('first');
  say('Steel and Ilse are by the core. Right-click the Ember Core to repair it and a turret to upgrade it. The first wave hits the four gates in twenty seconds.', 'info');
  give('coin', 10);
});
onEvent('respawn', () => say('The core is still burning. The next assault is already at the gates.', 'warn'));
`),
    stats: [
      { label: 'Waves', value: '5' },
      { label: 'Gates', value: '4' },
      { label: 'Turrets', value: '4 upgradable' },
    ],
  },
];

export const TEMPLATE_BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

export function getTemplate(key: GameMode): GameTemplate {
  return TEMPLATE_BY_KEY.get(key) ?? TEMPLATES[0];
}

export const TEMPLATE_STATS = {
  templates: TEMPLATES.length,
  characters: 27,
  creatures: 24,
  props: 21,
  blocks: 90,
  recipes: 100,
};

export function difficultyLabel(d: Difficulty): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function objectiveProgressText(obj: ObjectiveDef): string {
  if (obj.kind === 'reach' || obj.kind === 'talk') return '0 / 1';
  if (obj.kind === 'survive') {
    const m = Math.floor(obj.count / 60);
    const s = Math.floor(obj.count % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `0 / ${obj.count}`;
}
