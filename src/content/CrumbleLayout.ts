/**
 * Shared geometry for the Crumble party arena. Coordinates are block offsets
 * from the arena centre; `level` is the height above the session's base Y.
 */
export interface CrumbleTierDef {
  level: number;
  /** Outer quartz rim radius. */
  radius: number;
  /** Playable crumble-tile radius (inside the rim). */
  tileRadius: number;
  name: string;
}

export const CRUMBLE_TIERS: CrumbleTierDef[] = [
  { level: 0, radius: 15, tileRadius: 14, name: 'Lower Ring' },
  { level: 5, radius: 10, tileRadius: 9, name: 'Middle Ring' },
  { level: 10, radius: 6, tileRadius: 5, name: 'Crown Ring' },
];

export const CRUMBLE_DECK = { x0: -6, x1: 6, z0: 18, z1: 24 };

/** Deck standing spot used by the template spawn and every round reset. */
export const CRUMBLE_DECK_SPAWN = { x: 0, z: 19 };

/** Where the player drops in at the start of each round. */
export const CRUMBLE_PLAYER_SPAWN = { x: 0, z: 3, tier: 2 };

/** Opponent drop spots on the crown ring, as [x, z] offsets from centre. */
export const CRUMBLE_BOT_SPAWNS: Array<[number, number]> = [
  [-3.2, -1.2],
  [3.2, -1.2],
  [-2.1, -3.4],
  [2.1, -3.4],
  [0, -4.6],
];

export function crumbleTileKey(dx: number, dz: number): 'crumble_tile' | 'crumble_tile_alt' {
  return ((dx + dz) & 1) === 0 ? 'crumble_tile' : 'crumble_tile_alt';
}

/** True when the offset falls on a playable tile of the given tier (inside its rim). */
export function crumbleTileAt(dx: number, dz: number, tier: CrumbleTierDef): boolean {
  return dx * dx + dz * dz <= tier.tileRadius * tier.tileRadius;
}
