/**
 * Shared geometry and titan definitions for the Titan Trials forge arena.
 * The prefab and the simulation both read these coordinates so the seals,
 * stations and player spawn can never drift apart.
 */

export const TITAN_ARENA_RADIUS = 20;
export const TITAN_WALL_RADIUS = 21;

/** Player feet position inside the forge gate. */
export const TITAN_PLAYER_SPAWN = { x: 0.5, y: 1.02, z: 15.5 };

/** Forge stations, in world block coordinates at floor level. */
export const TITAN_STATIONS = {
  anvil: { x: -3, y: 1, z: 19, key: 'titan_anvil', label: 'Forge Anvil' },
  hearth: { x: 0, y: 1, z: 19, key: 'titan_hearth', label: 'Trial Hearth' },
  obelisk: { x: 3, y: 1, z: 19, key: 'titan_obelisk', label: 'Titan Obelisk' },
};

export const TITAN_STATION_LIST = [TITAN_STATIONS.anvil, TITAN_STATIONS.hearth, TITAN_STATIONS.obelisk];

export type TitanElement = 'stone' | 'ember' | 'frost';

export interface TitanSeal {
  index: number;
  x: number;
  z: number;
  element: TitanElement;
  label: string;
  ring: string;
  core: string;
}

/** The three summoning seals painted into the arena floor. */
export const TITAN_SEALS: TitanSeal[] = [
  { index: 0, x: -8, z: -8, element: 'stone', label: 'Seal of Stone', ring: 'cobblestone', core: 'rune_block' },
  { index: 1, x: 0, z: -12, element: 'ember', label: 'Seal of Ember', ring: 'netherrack', core: 'magma' },
  { index: 2, x: 8, z: -8, element: 'frost', label: 'Seal of Frost', ring: 'ice', core: 'crystal_block' },
];

export interface TitanDef {
  key: string;
  name: string;
  role: string;
  element: TitanElement;
  accent: string;
  spawn: { x: number; z: number };
  scale: number;
  healthScale: number;
  contact: number;
  speed: number;
  reward: number;
  xp: number;
  ranged: boolean;
  addKey: string;
  addRole: string;
  summon: string;
  phase2: string;
  phase3: string;
}

export const TITANS: TitanDef[] = [
  {
    key: 'creature:stone_golem',
    name: 'The Iron Colossus',
    role: 'First Titan',
    element: 'stone',
    accent: '#c9d2d8',
    spawn: { x: -8, z: -8 },
    scale: 1.8,
    healthScale: 2.9,
    contact: 6,
    speed: 2.15,
    reward: 120,
    xp: 220,
    ranged: false,
    addKey: 'human:skeleton_warrior',
    addRole: 'Trial Bones',
    summon: 'The Seal of Stone cracks. The first titan wakes.',
    phase2: 'The Colossus sheds its outer shell. The floor begins to break.',
    phase3: 'The Colossus is out of stone. Only the forge-fire inside remains.',
  },
  {
    key: 'creature:ember_dragon',
    name: 'Cinderwing',
    role: 'Second Titan',
    element: 'ember',
    accent: '#ff8a3d',
    spawn: { x: 0, z: -12 },
    scale: 1.45,
    healthScale: 1.793,
    contact: 5,
    speed: 2.7,
    reward: 160,
    xp: 300,
    ranged: true,
    addKey: 'human:ghost_wisp',
    addRole: 'Cinder Shade',
    summon: 'The Seal of Ember splits. Cinderwing takes the air.',
    phase2: 'Cinderwing climbs. The roof starts to fall in burning pieces.',
    phase3: 'Her wings are gone. The arena is her furnace now.',
  },
  {
    key: 'creature:frost_dragon',
    name: 'Rimefang',
    role: 'Last Titan',
    element: 'frost',
    accent: '#8feaff',
    spawn: { x: 8, z: -8 },
    scale: 1.5,
    healthScale: 1.844,
    contact: 7,
    speed: 2.45,
    reward: 220,
    xp: 420,
    ranged: true,
    addKey: 'human:zombie_walker',
    addRole: 'Rimebound Husk',
    summon: 'The Seal of Frost shatters. Rimefang comes for the last warm thing.',
    phase2: 'Rimefang drags the winter up through the floor.',
    phase3: 'The last titan has nothing left to lose. Neither does the arena.',
  },
];

/** IDs used by every simulation-spawned creature, filtered out of saves. */
export const TITAN_ENTITY_PREFIX = 'titan_';

export function titanDistanceToCenter(x: number, z: number, cx = 0, cz = 0): number {
  return Math.hypot(x - cx, z - cz);
}
