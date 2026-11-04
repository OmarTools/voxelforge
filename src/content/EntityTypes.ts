import { ASSETS, type AssetEntry } from './Models';

export type EntityClass = 'npc' | 'monster' | 'animal' | 'prop';
export type AIBehavior = 'idle' | 'wander' | 'hostile' | 'ranged' | 'flying' | 'guard' | 'flee' | 'stationary' | 'exploder';
export type EntityAttack = 'melee' | 'ranged' | 'explode' | 'none';

export interface ShopOffer {
  item: string;
  price: number;
  count?: number;
}

export interface EntityDefinition {
  key: string;
  assetKey: string;
  name: string;
  role: string;
  class: EntityClass;
  behavior: AIBehavior;
  attack: EntityAttack;
  health: number;
  damage: number;
  speed: number;
  attackRange: number;
  cooldown: number;
  sight: number;
  xp: number;
  scale: number;
  knockback: number;
  flying?: boolean;
  aquatic?: boolean;
  bodyRadius: number;
  bodyHeight: number;
  drops: Array<{ item: string; min: number; max: number; chance?: number }>;
  dialogue?: string;
  shop?: ShopOffer[];
  tags: string[];
  hostileToPlayer?: boolean;
  guardRadius?: number;
  boss?: boolean;
  explodeRadius?: number;
  spawnBiomes?: string[];
  lightAvoidance?: boolean;
}

interface EntryOptions extends Partial<EntityDefinition> {
  role?: string;
  dialogue?: string;
}

const SHOP_COMMON: ShopOffer[] = [
  { item: 'bread', price: 3, count: 2 },
  { item: 'torch', price: 2, count: 8 },
  { item: 'oak_planks', price: 2, count: 16 },
  { item: 'iron_ingot', price: 9, count: 2 },
];

const HUMAN_DEFS: Record<string, EntryOptions> = {
  adventurer: { class: 'npc', behavior: 'wander', health: 30, role: 'Quest Giver', dialogue: 'Every great build starts with a single block. Need a hand finding your footing?' },
  ranger_alex: { class: 'npc', behavior: 'guard', health: 26, damage: 4, role: 'Ranger', dialogue: 'The treeline is quiet today. Too quiet, if you ask me.' },
  knight_royal: { class: 'npc', behavior: 'guard', health: 46, damage: 7, role: 'Royal Guard', dialogue: 'Halt. State your business in the royal quarter.' },
  mage_arcane: { class: 'npc', behavior: 'idle', health: 22, damage: 6, role: 'Arcane Mage', dialogue: 'The ley lines hum beneath us. I can feel every stone dreaming.', shop: [{ item: 'staff', price: 30 }, { item: 'crystal_shard', price: 8, count: 2 }, { item: 'rune_stone', price: 14 }] },
  rogue_shadow: { class: 'npc', behavior: 'wander', health: 24, damage: 6, role: 'Shadow Rogue', dialogue: 'You did not see me. I was never here.' },
  dwarf_smith: { class: 'npc', behavior: 'stationary', health: 32, role: 'Blacksmith', dialogue: 'Good steel, fair prices. What are you forging today?', shop: [{ item: 'iron_pickaxe', price: 18 }, { item: 'iron_sword', price: 20 }, { item: 'iron_ingot', price: 7, count: 2 }, { item: 'coal', price: 3, count: 6 }] },
  elf_archer: { class: 'npc', behavior: 'guard', health: 24, damage: 6, role: 'Elven Archer', dialogue: 'The forest remembers every arrow ever loosed within it.' },
  orc_brute: { class: 'monster', behavior: 'hostile', health: 48, damage: 9, role: 'Orc Brute', speed: 2.5, xp: 24, hostileToPlayer: true },
  villager_farmer: { class: 'npc', behavior: 'wander', health: 18, role: 'Farmer', dialogue: 'The wheat is coming in nicely. Have you tried bread fresh from the oven?', shop: [{ item: 'bread', price: 2, count: 2 }, { item: 'wheat', price: 1, count: 5 }, { item: 'carrot', price: 1, count: 3 }, { item: 'apple', price: 1, count: 3 }] },
  villager_blacksmith: { class: 'npc', behavior: 'stationary', health: 24, role: 'Village Smith', dialogue: 'Mind the sparks. Everything on the rack is for sale.', shop: [{ item: 'stone_pickaxe', price: 8 }, { item: 'iron_axe', price: 18 }, { item: 'coal', price: 2, count: 8 }] },
  priest_light: { class: 'npc', behavior: 'idle', health: 22, role: 'Priest', dialogue: 'Rest here, traveler. The light restores what the road takes.', shop: [{ item: 'golden_apple', price: 16 }, { item: 'bread', price: 2, count: 3 }] },
  necromancer: { class: 'monster', behavior: 'ranged', attack: 'ranged', health: 44, damage: 8, role: 'Necromancer', speed: 1.8, attackRange: 12, sight: 18, xp: 34, hostileToPlayer: true, drops: [{ item: 'void_essence', min: 1, max: 2 }, { item: 'bone', min: 1, max: 3 }] },
  pirate_captain: { class: 'monster', behavior: 'hostile', health: 54, damage: 10, role: 'Pirate Captain', speed: 2.7, xp: 30, hostileToPlayer: true, drops: [{ item: 'gold_ingot', min: 1, max: 3 }, { item: 'cutlass', min: 1, max: 1, chance: 0.25 }] },
  ninja_ember: { class: 'monster', behavior: 'hostile', health: 34, damage: 8, role: 'Ember Ninja', speed: 4.0, xp: 28, hostileToPlayer: true, drops: [{ item: 'emerald', min: 1, max: 2 }] },
  explorer_jungle: { class: 'npc', behavior: 'wander', health: 28, role: 'Explorer', dialogue: 'There is a cave behind the waterfall. Mark my words.' },
  king_gold: { class: 'npc', behavior: 'stationary', health: 40, role: 'The Gilded King', dialogue: 'Few earn an audience in this hall. You must have done something remarkable.' },
  robot_sentinel: { class: 'monster', behavior: 'ranged', attack: 'ranged', health: 62, damage: 9, role: 'Sentinel Unit', speed: 2.0, attackRange: 14, sight: 20, xp: 40, hostileToPlayer: true, drops: [{ item: 'iron_ingot', min: 2, max: 4 }, { item: 'redstone', min: 1, max: 3 }] },
  skeleton_warrior: { class: 'monster', behavior: 'hostile', health: 28, damage: 6, role: 'Skeleton Warrior', speed: 2.4, xp: 16, hostileToPlayer: true, drops: [{ item: 'bone', min: 1, max: 3 }, { item: 'arrow', min: 2, max: 5 }] },
  zombie_walker: { class: 'monster', behavior: 'hostile', health: 32, damage: 5, role: 'Zombie', speed: 1.6, xp: 14, hostileToPlayer: true, drops: [{ item: 'rotten_flesh', min: 1, max: 2 }] },
  ghost_wisp: { class: 'monster', behavior: 'flying', attack: 'ranged', health: 22, damage: 5, role: 'Restless Spirit', speed: 2.2, attackRange: 9, xp: 22, hostileToPlayer: true, drops: [{ item: 'void_essence', min: 1, max: 1 }] },
  cultist_void: { class: 'monster', behavior: 'ranged', attack: 'ranged', health: 36, damage: 7, role: 'Void Cultist', speed: 2.0, attackRange: 11, xp: 26, hostileToPlayer: true, drops: [{ item: 'void_essence', min: 1, max: 2 }, { item: 'rune_stone', min: 1, max: 1, chance: 0.3 }] },
  bard_wanderer: { class: 'npc', behavior: 'wander', health: 20, role: 'Wandering Bard', dialogue: 'A song for a coin? A story for free? You drive a hard bargain.' },
  chef_inn: { class: 'npc', behavior: 'stationary', health: 22, role: 'Innkeeper', dialogue: 'Hot stew, warm beds, and no questions about the cellar.', shop: [{ item: 'stew', price: 6 }, { item: 'bread', price: 2, count: 2 }, { item: 'cooked_porkchop', price: 5 }] },
  guard_city: { class: 'npc', behavior: 'guard', health: 38, damage: 7, role: 'City Guard', dialogue: 'Keep the peace and you will find no trouble here.' },
  bandit_road: { class: 'monster', behavior: 'hostile', health: 30, damage: 7, role: 'Road Bandit', speed: 2.8, xp: 20, hostileToPlayer: true, drops: [{ item: 'coin', min: 3, max: 8 }, { item: 'iron_sword', min: 1, max: 1, chance: 0.12 }] },
  snow_hunter: { class: 'npc', behavior: 'wander', health: 28, role: 'Frost Hunter', dialogue: 'The snow hides more than tracks. Watch the ridge.' },
  desert_nomad: { class: 'npc', behavior: 'wander', health: 26, role: 'Desert Nomad', dialogue: 'Water is worth more than gold out here. Remember that.', shop: [{ item: 'water_bottle', price: 4 }, { item: 'bread', price: 2, count: 2 }, { item: 'sandstone', price: 2, count: 12 }] },
  soldier_rifle: { class: 'monster', behavior: 'ranged', attack: 'ranged', health: 36, damage: 6, role: 'Rifleman', speed: 2.1, attackRange: 16, sight: 22, cooldown: 1.5, xp: 22, hostileToPlayer: true, drops: [{ item: 'coin', min: 2, max: 5 }, { item: 'iron_ingot', min: 1, max: 1, chance: 0.3 }] },
  soldier_heavy: { class: 'monster', behavior: 'ranged', attack: 'ranged', health: 58, damage: 8, role: 'Breacher', speed: 1.7, attackRange: 13, sight: 20, cooldown: 1.9, xp: 34, hostileToPlayer: true, drops: [{ item: 'coin', min: 4, max: 9 }, { item: 'iron_ingot', min: 1, max: 2 }] },
  commander_iron: { class: 'monster', behavior: 'ranged', attack: 'ranged', health: 180, damage: 11, role: 'Base Commander', speed: 2.0, attackRange: 18, sight: 26, cooldown: 1.2, xp: 140, hostileToPlayer: true, boss: true, scale: 1.18, drops: [{ item: 'gold_ingot', min: 3, max: 6 }, { item: 'diamond', min: 1, max: 2 }, { item: 'golden_apple', min: 2, max: 3 }] },
  captain_steel: { class: 'npc', behavior: 'guard', attack: 'ranged', health: 60, damage: 8, role: 'Ally Commander', speed: 2.2, attackRange: 15, sight: 22, cooldown: 1.4, dialogue: 'You made it. The Colonel has the helipad locked down — push through the courtyard and take him out.' },
};

const CREATURE_DEFS: Record<string, EntryOptions> = {
  wolf: { class: 'animal', behavior: 'hostile', health: 20, damage: 4, speed: 3.1, sight: 12, xp: 8, drops: [{ item: 'leather', min: 1, max: 2 }, { item: 'raw_beef', min: 1, max: 2, chance: 0.4 }] },
  fox: { class: 'animal', behavior: 'flee', health: 12, speed: 3.4, xp: 3, drops: [{ item: 'leather', min: 1, max: 1 }] },
  boar: { class: 'animal', behavior: 'hostile', health: 24, damage: 5, speed: 2.6, sight: 10, xp: 10, drops: [{ item: 'raw_porkchop', min: 1, max: 3 }] },
  cow: { class: 'animal', behavior: 'flee', health: 14, speed: 1.8, xp: 3, drops: [{ item: 'raw_beef', min: 1, max: 3 }, { item: 'leather', min: 1, max: 2 }] },
  pig: { class: 'animal', behavior: 'flee', health: 12, speed: 1.9, xp: 3, drops: [{ item: 'raw_porkchop', min: 1, max: 3 }] },
  sheep: { class: 'animal', behavior: 'flee', health: 12, speed: 1.8, xp: 3, drops: [{ item: 'wool_white', min: 1, max: 2 }, { item: 'raw_beef', min: 1, max: 1 }] },
  bear: { class: 'animal', behavior: 'hostile', health: 44, damage: 8, speed: 2.5, sight: 14, xp: 22, drops: [{ item: 'leather', min: 2, max: 4 }, { item: 'raw_beef', min: 2, max: 3 }] },
  horse: { class: 'animal', behavior: 'wander', health: 24, speed: 2.4, xp: 4, drops: [{ item: 'leather', min: 1, max: 3 }] },
  chicken: { class: 'animal', behavior: 'flee', health: 6, speed: 1.6, xp: 2, drops: [{ item: 'chicken_meat', min: 1, max: 1 }, { item: 'feather', min: 1, max: 2 }] },
  rabbit: { class: 'animal', behavior: 'flee', health: 6, speed: 2.8, xp: 2, drops: [{ item: 'rabbit_hide', min: 1, max: 1 }, { item: 'raw_beef', min: 1, max: 1, chance: 0.35 }] },
  slime: { class: 'monster', behavior: 'hostile', health: 16, damage: 3, speed: 1.7, sight: 10, xp: 8, hostileToPlayer: true, drops: [{ item: 'slimeball', min: 1, max: 2 }] },
  magma_slime: { class: 'monster', behavior: 'hostile', health: 26, damage: 5, speed: 1.6, sight: 12, xp: 15, hostileToPlayer: true, drops: [{ item: 'magma_cream', min: 1, max: 2 }] },
  spider: { class: 'monster', behavior: 'hostile', health: 20, damage: 4, speed: 3.6, sight: 14, xp: 10, hostileToPlayer: true, drops: [{ item: 'string', min: 1, max: 3 }, { item: 'spider_eye', min: 1, max: 1, chance: 0.4 }] },
  creeper: { class: 'monster', behavior: 'exploder', health: 20, damage: 16, speed: 2.1, sight: 12, xp: 12, hostileToPlayer: true, explodeRadius: 3.4, drops: [{ item: 'gunpowder', min: 1, max: 3 }] },
  bat: { class: 'animal', behavior: 'flying', health: 6, speed: 2.8, flying: true, xp: 2, drops: [] },
  bee: { class: 'animal', behavior: 'flying', health: 8, damage: 2, speed: 2.6, flying: true, sight: 7, xp: 3, drops: [{ item: 'honeycomb', min: 1, max: 1 }] },
  fish: { class: 'animal', behavior: 'flee', health: 4, speed: 2.2, aquatic: true, xp: 1, drops: [{ item: 'raw_fish', min: 1, max: 1 }] },
  mushroomling: { class: 'monster', behavior: 'hostile', health: 18, damage: 4, speed: 1.8, sight: 9, xp: 8, hostileToPlayer: true, drops: [{ item: 'mushroom_red', min: 1, max: 2 }] },
  scorpion: { class: 'monster', behavior: 'hostile', health: 22, damage: 6, speed: 2.9, sight: 11, xp: 12, hostileToPlayer: true, drops: [{ item: 'string', min: 1, max: 2 }] },
  wisp: { class: 'monster', behavior: 'flying', attack: 'ranged', health: 14, damage: 4, speed: 2.4, flying: true, sight: 13, attackRange: 8, xp: 10, hostileToPlayer: true, drops: [{ item: 'crystal_shard', min: 1, max: 1 }] },
  stone_golem: { class: 'monster', behavior: 'guard', health: 70, damage: 12, speed: 1.6, sight: 12, xp: 35, guardRadius: 10, drops: [{ item: 'cobblestone', min: 3, max: 6 }, { item: 'iron_ingot', min: 1, max: 2 }] },
  crystal_golem: { class: 'monster', behavior: 'hostile', health: 82, damage: 13, speed: 1.8, sight: 14, xp: 44, hostileToPlayer: true, drops: [{ item: 'crystal_shard', min: 2, max: 4 }, { item: 'emerald', min: 1, max: 2 }] },
  ember_dragon: { class: 'monster', behavior: 'flying', attack: 'ranged', health: 160, damage: 16, speed: 3.4, flying: true, sight: 26, attackRange: 16, xp: 160, boss: true, hostileToPlayer: true, drops: [{ item: 'dragon_scale', min: 2, max: 4 }, { item: 'gold_ingot', min: 3, max: 6 }] },
  frost_dragon: { class: 'monster', behavior: 'flying', attack: 'ranged', health: 180, damage: 17, speed: 3.2, flying: true, sight: 28, attackRange: 18, xp: 180, boss: true, hostileToPlayer: true, drops: [{ item: 'dragon_scale', min: 3, max: 5 }, { item: 'crystal_shard', min: 3, max: 6 }] },
};

export const ENTITY_DEFS: EntityDefinition[] = ASSETS.filter((a) => a.kind !== 'prop').map((asset) => {
  const raw = asset.kind === 'character' ? HUMAN_DEFS[asset.id] : CREATURE_DEFS[asset.id];
  if (!raw) throw new Error(`Entity definition missing for ${asset.key}`);
  const isHuman = asset.kind === 'character';
  const entityClass = raw.class ?? (asset.kind === 'creature' ? 'animal' : 'npc');
  const behavior = raw.behavior ?? 'wander';
  const health = raw.health ?? (entityClass === 'monster' ? 20 : 18);
  return {
    key: asset.key,
    assetKey: asset.key,
    name: asset.name,
    role: raw.role ?? asset.role,
    class: entityClass,
    behavior,
    attack: raw.attack ?? (entityClass === 'monster' || behavior === 'hostile' ? 'melee' : 'none'),
    health,
    damage: raw.damage ?? 0,
    speed: raw.speed ?? (behavior === 'stationary' ? 0 : 2.2),
    attackRange: raw.attackRange ?? 1.8,
    cooldown: raw.cooldown ?? 1.1,
    sight: raw.sight ?? (entityClass === 'npc' ? 8 : 14),
    xp: raw.xp ?? (entityClass === 'npc' ? 0 : 6),
    scale: raw.scale ?? 1,
    knockback: raw.knockback ?? 1,
    flying: raw.flying,
    aquatic: raw.aquatic,
    bodyRadius: raw.bodyRadius ?? (isHuman ? 0.33 : Math.max(0.26, asset.size[0] * 0.32)),
    bodyHeight: raw.bodyHeight ?? asset.size[1],
    drops: raw.drops ?? [],
    dialogue: raw.dialogue,
    shop: raw.shop ?? (entityClass === 'npc' && asset.tags.includes('merchant') ? SHOP_COMMON : undefined),
    tags: asset.tags,
    hostileToPlayer: raw.hostileToPlayer ?? (entityClass === 'monster' && behavior !== 'guard'),
    guardRadius: raw.guardRadius,
    boss: raw.boss,
    explodeRadius: raw.explodeRadius,
  } as EntityDefinition;
});

export const ENTITY_BY_KEY = new Map(ENTITY_DEFS.map((d) => [d.key, d]));

export function entityDef(key: string): EntityDefinition | undefined {
  return ENTITY_BY_KEY.get(key);
}

export function entityAsset(key: string): AssetEntry | undefined {
  return ASSETS.find((a) => a.key === key);
}

export const HOSTILE_KEYS = ENTITY_DEFS.filter((d) => d.hostileToPlayer || d.class === 'monster').map((d) => d.key);

export const NPC_KEYS = ENTITY_DEFS.filter((d) => d.class === 'npc').map((d) => d.key);

export const ANIMAL_KEYS = ENTITY_DEFS.filter((d) => d.class === 'animal').map((d) => d.key);

export const ENTITY_ROLES = {
  bosses: ENTITY_DEFS.filter((d) => d.boss),
  merchants: ENTITY_DEFS.filter((d) => d.shop?.length),
  questGivers: ENTITY_DEFS.filter((d) => d.class === 'npc'),
};

export function friendlyName(key: string): string {
  return ENTITY_BY_KEY.get(key)?.name ?? key;
}
