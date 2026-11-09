import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { CookingSystem } from './CookingSystem';
import { StoreSystem } from './StoreSystem';
import { LuckySystem } from './LuckySystem';
import { RoyaleSystem } from './RoyaleSystem';
import { SiegeSystem } from './SiegeSystem';
import { BomberSystem } from './BomberSystem';
import { SurvivorsSystem } from './SurvivorsSystem';
import { FarmSystem } from './FarmSystem';
import { HollowwatchSystem } from './HollowwatchSystem';
import { CrumbleSystem } from './CrumbleSystem';

export type SimKind = 'cooking' | 'store' | 'lucky' | 'royale' | 'siege' | 'bomber' | 'survivors' | 'farm' | 'hollowwatch' | 'crumble';

export interface SimSpot {
  x: number;
  y?: number;
  z: number;
}

export interface SimSpec {
  kind: SimKind;
  /** Customer standing spots in world XZ, with an optional offset above the floor. */
  customerSpots?: SimSpot[];
  /** Subset of the built-in recipe/product catalog this session uses. */
  recipes?: string[];
  products?: string[];
  spawnEvery?: number;
  maxCustomers?: number;
  /** Lucky-block sessions: blocks the player is expected to open. */
  targetOpen?: number;
  /** Arena-style sessions: where the storm ring or siege core is centred. */
  center?: { x: number; z: number };
  /** Battle royale: number of rival contestants and match length in seconds. */
  contestants?: number;
  stormTime?: number;
  /** Siege: number of assault waves. */
  waveCount?: number;
  /** Crumble: best-of round count and contestants per round. */
  rounds?: number;
  bots?: number;
  /** Farm: entity id of the villager who posts the daily request. */
  requestGiverId?: string;
}

export interface SimHudRow {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}

export interface SimHudAction {
  id: string;
  label: string;
  disabled?: boolean;
  /** KeyboardEvent.code that triggers this action, e.g. Digit1. */
  hotkey?: string;
}

export interface SimHud {
  kicker: string;
  title: string;
  rows: SimHudRow[];
  progress?: { label: string; value: number; max: number };
  actions: SimHudAction[];
  footer?: string;
}

export interface SimSystem {
  readonly kind: SimKind;
  update(dt: number): void;
  hud(): SimHud;
  /** Return true when the simulation consumed the interaction. */
  interactBlock(key: string, x: number, y: number, z: number): boolean;
  interactEntity(entity: GameEntity): boolean;
  hintForBlock(key: string, x?: number, y?: number, z?: number): string | null;
  hintForEntity(entity: GameEntity): string | null;
  /** Return true when the simulation handled the block and it should skip normal drops. */
  onBlockBroken(key: string, x: number, y: number, z: number): boolean;
  /** Called after the player successfully places a block. */
  onBlockPlaced?(key: string, x: number, y: number, z: number): void;
  /** Called when the player respawns after a death. */
  onRespawn?(): void;
  action(id: string): void;
  dispose(): void;
}

export function createSim(spec: SimSpec, game: Game): SimSystem {
  if (spec.kind === 'cooking') return new CookingSystem(spec, game);
  if (spec.kind === 'store') return new StoreSystem(spec, game);
  if (spec.kind === 'royale') return new RoyaleSystem(spec, game);
  if (spec.kind === 'siege') return new SiegeSystem(spec, game);
  if (spec.kind === 'bomber') return new BomberSystem(spec, game);
  if (spec.kind === 'survivors') return new SurvivorsSystem(spec, game);
  if (spec.kind === 'farm') return new FarmSystem(spec, game);
  if (spec.kind === 'hollowwatch') return new HollowwatchSystem(spec, game);
  if (spec.kind === 'crumble') return new CrumbleSystem(spec, game);
  return new LuckySystem(spec, game);
}
