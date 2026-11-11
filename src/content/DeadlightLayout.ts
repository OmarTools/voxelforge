/**
 * Shared geometry for the Deadlight chapel siege.
 *
 * Coordinates are prefab-local: XZ are absolute world blocks because the
 * chapel is stamped at the origin, while board Y values are heights above the
 * prefab base (1..3). Use `deadlightBoardY(baseY, y)` when touching the world.
 *
 * The chapel sits at the centre of the yard. Each of its four windows is
 * boarded with a 3×3 block breach; zombies gather outside a breach, tear the
 * boards away one at a time, then pour through the opening. The door on the
 * south wall is always open so the player can step out into the yard.
 */
export interface DeadlightBoard {
  x: number;
  y: number;
  z: number;
}

export interface DeadlightBreachDef {
  id: string;
  label: string;
  side: 'north' | 'south' | 'west' | 'east';
  /** Board positions, ordered bottom to top. */
  boards: DeadlightBoard[];
  /** Where zombies gather outside the window. */
  outside: { x: number; z: number };
  /** Where zombies aim once the window is open. */
  inside: { x: number; z: number };
}

/** Rounds in a full night. Round 8 is the Gravewarden's round. */
export const DEADLIGHT_ROUNDS = 8;
export const DEADLIGHT_BOSS_ROUND = DEADLIGHT_ROUNDS;

/** Boards per window (3 wide × 3 high). */
export const DEADLIGHT_BOARDS_PER_BREACH = 9;

/** Inside the chapel, just in front of the south window. */
export const DEADLIGHT_PLAYER_SPAWN = { x: 0.5, y: 1.02, z: 2.5 };

export const DEADLIGHT_ZOMBIE_PREFIX = 'deadlight_zombie_';

function breachBoards(side: DeadlightBreachDef['side']): DeadlightBoard[] {
  const boards: DeadlightBoard[] = [];
  for (let y = 1; y <= 3; y++) {
    for (let offset = -1; offset <= 1; offset++) {
      if (side === 'north') boards.push({ x: offset, y, z: -5 });
      else if (side === 'south') boards.push({ x: offset, y, z: 5 });
      else if (side === 'west') boards.push({ x: -5, y, z: offset });
      else boards.push({ x: 5, y, z: offset });
    }
  }
  return boards;
}

export const DEADLIGHT_BREACHES: DeadlightBreachDef[] = [
  {
    id: 'north',
    label: 'North Window',
    side: 'north',
    boards: breachBoards('north'),
    outside: { x: 0, z: -6.2 },
    inside: { x: 0, z: -3.4 },
  },
  {
    id: 'south',
    label: 'South Window',
    side: 'south',
    boards: breachBoards('south'),
    outside: { x: 0, z: 6.2 },
    inside: { x: 0, z: 3.4 },
  },
  {
    id: 'west',
    label: 'West Window',
    side: 'west',
    boards: breachBoards('west'),
    outside: { x: -6.2, z: 0 },
    inside: { x: -3.4, z: 0 },
  },
  {
    id: 'east',
    label: 'East Window',
    side: 'east',
    boards: breachBoards('east'),
    outside: { x: 6.2, z: 0 },
    inside: { x: 3.4, z: 0 },
  },
];

/** World Y of a board, given the session's base Y (prefab heights are local). */
export function deadlightBoardY(baseY: number, localY: number): number {
  return baseY + localY;
}

/** Board lookup used by the player's repair interaction. `y` is a world Y. */
export function deadlightBreachAt(x: number, y: number, z: number, baseY: number): number {
  const localY = y - baseY;
  if (localY < 1 || localY > 3) return -1;
  for (let i = 0; i < DEADLIGHT_BREACHES.length; i++) {
    const breach = DEADLIGHT_BREACHES[i];
    if (breach.side === 'north' && z === -5 && Math.abs(x) <= 1) return i;
    if (breach.side === 'south' && z === 5 && Math.abs(x) <= 1) return i;
    if (breach.side === 'west' && x === -5 && Math.abs(z) <= 1) return i;
    if (breach.side === 'east' && x === 5 && Math.abs(z) <= 1) return i;
  }
  return -1;
}

/** The outside point for a breach, shifted sideways to spread a queue of zombies. */
export function deadlightBreachSlot(index: number, slot: number): { x: number; z: number } {
  const breach = DEADLIGHT_BREACHES[index];
  const lateral = (slot % 4 - 1.5) * 1.05;
  if (breach.side === 'north' || breach.side === 'south') {
    return { x: breach.outside.x + lateral, z: breach.outside.z };
  }
  return { x: breach.outside.x, z: breach.outside.z + lateral };
}
