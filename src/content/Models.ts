import type { BBModel } from '../engine/blockbench/BBModel';
import { HUMANOIDS, getHumanoidModel, getHumanoidSpec, humanoidPortrait } from './Humanoids';
import { CREATURES_LIST, getCreatureModel, getCreatureSpec } from './Creatures';
import { PROPS, getPropModel, getPropSpec } from './Props';

export type AssetKind = 'character' | 'creature' | 'prop';
export type AssetCategory =
  | 'heroes' | 'villagers' | 'villains' | 'monsters' | 'animals'
  | 'structures' | 'lighting' | 'nature' | 'dungeon' | 'market';

export interface AssetEntry {
  key: string;
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  tags: string[];
  description: string;
  role: string;
  portrait?: string;
  light?: number;
  solid?: boolean;
  /** Approximate footprint used by the studio placement ghost. */
  size: [number, number, number];
}

const HUMAN_META: Record<string, { category: AssetCategory; size: [number, number, number]; description?: string; solid?: boolean }> = {
  adventurer: { category: 'heroes', size: [0.7, 1.85, 0.55] },
  ranger_alex: { category: 'heroes', size: [0.68, 1.8, 0.55] },
  knight_royal: { category: 'heroes', size: [0.85, 1.9, 0.7] },
  mage_arcane: { category: 'heroes', size: [0.7, 1.82, 0.58] },
  rogue_shadow: { category: 'heroes', size: [0.66, 1.78, 0.52] },
  dwarf_smith: { category: 'villagers', size: [0.84, 1.3, 0.66] },
  elf_archer: { category: 'heroes', size: [0.66, 1.86, 0.52] },
  orc_brute: { category: 'villains', size: [0.95, 2.0, 0.82] },
  villager_farmer: { category: 'villagers', size: [0.72, 1.8, 0.6] },
  villager_blacksmith: { category: 'villagers', size: [0.78, 1.8, 0.64] },
  priest_light: { category: 'villagers', size: [0.7, 1.8, 0.58] },
  necromancer: { category: 'villains', size: [0.72, 1.84, 0.6], solid: false },
  pirate_captain: { category: 'villains', size: [0.78, 1.82, 0.62] },
  ninja_ember: { category: 'villains', size: [0.66, 1.8, 0.52] },
  explorer_jungle: { category: 'heroes', size: [0.7, 1.8, 0.58] },
  king_gold: { category: 'villagers', size: [0.8, 1.84, 0.64] },
  robot_sentinel: { category: 'monsters', size: [0.9, 2.0, 0.72] },
  skeleton_warrior: { category: 'monsters', size: [0.66, 1.82, 0.5] },
  zombie_walker: { category: 'monsters', size: [0.7, 1.82, 0.56] },
  ghost_wisp: { category: 'monsters', size: [0.7, 1.7, 0.5], solid: false },
  cultist_void: { category: 'villains', size: [0.72, 1.8, 0.58] },
  bard_wanderer: { category: 'villagers', size: [0.68, 1.78, 0.55] },
  chef_inn: { category: 'villagers', size: [0.8, 1.78, 0.66] },
  guard_city: { category: 'villagers', size: [0.8, 1.86, 0.64] },
  bandit_road: { category: 'villains', size: [0.72, 1.8, 0.58] },
  snow_hunter: { category: 'heroes', size: [0.72, 1.8, 0.58] },
  desert_nomad: { category: 'heroes', size: [0.7, 1.8, 0.58] },
  crumble_host: { category: 'heroes', size: [0.8, 1.9, 0.64] },
};

const CREATURE_META: Record<string, { category: AssetCategory; size: [number, number, number]; solid?: boolean }> = {
  wolf: { category: 'animals', size: [0.9, 1.1, 1.35] },
  fox: { category: 'animals', size: [0.7, 0.85, 1.1] },
  boar: { category: 'animals', size: [1.0, 1.1, 1.4] },
  cow: { category: 'animals', size: [1.2, 1.35, 1.8] },
  pig: { category: 'animals', size: [0.9, 0.95, 1.25] },
  sheep: { category: 'animals', size: [1.05, 1.2, 1.3] },
  bear: { category: 'animals', size: [1.4, 1.8, 2.0] },
  horse: { category: 'animals', size: [1.25, 1.85, 2.1] },
  chicken: { category: 'animals', size: [0.55, 0.75, 0.65] },
  rabbit: { category: 'animals', size: [0.45, 0.6, 0.65] },
  slime: { category: 'monsters', size: [0.9, 0.9, 0.9], solid: false },
  magma_slime: { category: 'monsters', size: [1.1, 1.1, 1.1], solid: false },
  spider: { category: 'monsters', size: [1.3, 0.9, 1.4] },
  creeper: { category: 'monsters', size: [0.75, 1.6, 0.75] },
  bat: { category: 'animals', size: [0.65, 0.5, 0.5], solid: false },
  bee: { category: 'animals', size: [0.55, 0.5, 0.55], solid: false },
  fish: { category: 'animals', size: [0.5, 0.4, 0.8], solid: false },
  mushroomling: { category: 'monsters', size: [0.7, 1.0, 0.7] },
  scorpion: { category: 'monsters', size: [1.0, 0.7, 1.3] },
  wisp: { category: 'monsters', size: [0.55, 0.55, 0.55], solid: false },
  stone_golem: { category: 'monsters', size: [1.4, 2.3, 1.2] },
  crystal_golem: { category: 'monsters', size: [1.5, 2.4, 1.3] },
  ember_dragon: { category: 'monsters', size: [2.2, 2.0, 3.0] },
  frost_dragon: { category: 'monsters', size: [2.2, 2.1, 3.0] },
};

const PROP_META: Record<string, { category: AssetCategory; size: [number, number, number] }> = {
  lamp_post: { category: 'lighting', size: [0.6, 2.4, 0.6] },
  campfire: { category: 'lighting', size: [0.9, 0.7, 0.9] },
  tent: { category: 'structures', size: [2.2, 1.8, 2.5] },
  market_stall: { category: 'market', size: [2.8, 2.6, 1.8] },
  well: { category: 'structures', size: [2.0, 2.2, 2.0] },
  statue_knight: { category: 'dungeon', size: [1.0, 2.8, 1.0] },
  portal_arcane: { category: 'dungeon', size: [2.4, 3.0, 0.8] },
  crystal_cluster: { category: 'nature', size: [1.1, 1.5, 1.1] },
  obelisk: { category: 'dungeon', size: [1.2, 3.2, 1.2] },
  signpost: { category: 'structures', size: [0.9, 1.8, 0.4] },
  bench: { category: 'market', size: [1.8, 0.8, 0.7] },
  cart: { category: 'market', size: [1.7, 1.3, 1.1] },
  training_dummy: { category: 'dungeon', size: [0.8, 1.9, 0.8] },
  grave: { category: 'dungeon', size: [0.8, 1.1, 0.6] },
  fountain: { category: 'structures', size: [3.0, 1.6, 3.0] },
  brazier: { category: 'lighting', size: [0.8, 1.3, 0.8] },
  tree_ancient: { category: 'nature', size: [4.2, 6.5, 4.2] },
  snowman: { category: 'nature', size: [0.9, 1.7, 0.9] },
  scarecrow: { category: 'nature', size: [1.2, 2.1, 0.8] },
  throne: { category: 'dungeon', size: [1.3, 2.2, 1.2] },
  banner: { category: 'market', size: [0.9, 2.4, 0.3] },
};

const propsByKey = new Map(PROPS.map((p) => [p.key, p]));

export const ASSETS: AssetEntry[] = [
  ...HUMANOIDS.map((spec): AssetEntry => {
    const meta = HUMAN_META[spec.key] ?? { category: 'villagers', size: [0.72, 1.8, 0.58] };
    return {
      key: `human:${spec.key}`,
      id: spec.key,
      name: spec.name,
      kind: 'character',
      category: meta.category,
      tags: spec.tags,
      description: `${spec.role}. ${spec.tags.join(' · ')}`,
      role: spec.role,
      portrait: humanoidPortrait(spec),
      size: meta.size,
      solid: meta.solid ?? true,
    };
  }),
  ...CREATURES_LIST.map((spec): AssetEntry => {
    const meta = CREATURE_META[spec.key] ?? { category: 'animals', size: [1, 1, 1] };
    return {
      key: `creature:${spec.key}`,
      id: spec.key,
      name: spec.name,
      kind: 'creature',
      category: meta.category,
      tags: spec.tags,
      description: spec.description,
      role: spec.form,
      size: meta.size,
      solid: meta.solid ?? true,
    };
  }),
  ...PROPS.map((spec): AssetEntry => {
    const meta = PROP_META[spec.key] ?? { category: 'structures', size: [1, 1, 1] };
    return {
      key: `prop:${spec.key}`,
      id: spec.key,
      name: spec.name,
      kind: 'prop',
      category: meta.category,
      tags: spec.tags,
      description: spec.description,
      role: propsByKey.get(spec.key)?.tags[0] ?? 'prop',
      light: spec.light,
      solid: spec.solid ?? true,
      size: meta.size,
    };
  }),
];

export const ASSET_BY_KEY = new Map(ASSETS.map((a) => [a.key, a]));
export const ASSETS_BY_KIND = {
  character: ASSETS.filter((a) => a.kind === 'character'),
  creature: ASSETS.filter((a) => a.kind === 'creature'),
  prop: ASSETS.filter((a) => a.kind === 'prop'),
};

export const ASSET_CATEGORIES: Array<{ id: AssetCategory | 'all'; label: string; icon: string }> = [
  { id: 'all', label: 'Everything', icon: '✦' },
  { id: 'heroes', label: 'Heroes', icon: '⚔' },
  { id: 'villagers', label: 'Villagers', icon: '☺' },
  { id: 'villains', label: 'Villains', icon: '☠' },
  { id: 'monsters', label: 'Monsters', icon: '☣' },
  { id: 'animals', label: 'Animals', icon: '🐾' },
  { id: 'structures', label: 'Structures', icon: '⌂' },
  { id: 'lighting', label: 'Lighting', icon: '✷' },
  { id: 'nature', label: 'Nature', icon: '❧' },
  { id: 'dungeon', label: 'Dungeon', icon: '⚿' },
  { id: 'market', label: 'Market', icon: '⚖' },
];

const modelCache = new Map<string, BBModel>();

/** Load one Blockbench document for any catalog asset. */
export function buildAssetModel(key: string): BBModel {
  const cached = modelCache.get(key);
  if (cached) return cached;
  const entry = ASSET_BY_KEY.get(key);
  if (!entry) throw new Error(`Unknown asset: ${key}`);
  let model: BBModel;
  if (entry.kind === 'character') model = getHumanoidModel(entry.id);
  else if (entry.kind === 'creature') model = getCreatureModel(entry.id);
  else model = getPropModel(entry.id);
  modelCache.set(key, model);
  return model;
}

export function getAsset(key: string): AssetEntry | undefined {
  return ASSET_BY_KEY.get(key);
}

export function getAssetBySpec(kind: AssetKind, id: string): AssetEntry | undefined {
  return ASSET_BY_KEY.get(`${kind}:${id}`);
}

export function findAssets(query: string, kind?: AssetKind, category?: AssetCategory | 'all'): AssetEntry[] {
  const q = query.trim().toLowerCase();
  return ASSETS.filter((a) => {
    if (kind && a.kind !== kind) return false;
    if (category && category !== 'all' && a.category !== category) return false;
    if (!q) return true;
    return `${a.name} ${a.id} ${a.role} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(q);
  });
}

export function assetDisplayName(key: string): string {
  return ASSET_BY_KEY.get(key)?.name ?? key;
}

export function characterForGame(key: string) {
  return getHumanoidSpec(key);
}

export function creatureForGame(key: string) {
  return getCreatureSpec(key);
}

export function propForGame(key: string) {
  return getPropSpec(key);
}

export function assetGlyph(entry: AssetEntry): string {
  if (entry.kind === 'prop') {
    if (entry.tags.includes('light')) return '✷';
    if (entry.tags.includes('village')) return '⌂';
    if (entry.tags.includes('nature')) return '❧';
    if (entry.tags.includes('dungeon')) return '⚿';
    if (entry.tags.includes('market')) return '⚖';
    return '❖';
  }
  if (entry.kind === 'creature') {
    if (entry.tags.includes('monster')) return '☣';
    if (entry.tags.includes('dragon')) return '🐉';
    if (entry.tags.includes('fish')) return '≈';
    if (entry.tags.includes('bird')) return '⌄';
    return '🐾';
  }
  if (entry.tags.includes('monster')) return '☠';
  if (entry.tags.includes('royal')) return '♛';
  if (entry.tags.includes('magic')) return '✦';
  return '☺';
}

export const ASSET_STATS = {
  characters: ASSETS_BY_KIND.character.length,
  creatures: ASSETS_BY_KIND.creature.length,
  props: ASSETS_BY_KIND.prop.length,
  total: ASSETS.length,
};
