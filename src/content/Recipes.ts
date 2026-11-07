import { BLOCKS } from '../engine/world/Blocks';
import type { TextureAtlas } from '../engine/render/TextureAtlas';
import { renderItemIcon } from './ItemIconArt';

export type ItemKind = 'block' | 'tool' | 'weapon' | 'armor' | 'food' | 'material' | 'special';
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'bow' | 'staff' | 'shield' | 'gun';
export type ArmorSlot = 'helmet' | 'chestplate' | 'leggings' | 'boots';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  key: string;
  name: string;
  kind: ItemKind;
  description: string;
  stack: number;
  block?: string;
  toolType?: ToolType;
  tier?: number;
  tierName?: string;
  damage?: number;
  armor?: number;
  armorSlot?: ArmorSlot;
  durability?: number;
  foodHunger?: number;
  foodHeal?: number;
  rarity: Rarity;
  color: string;
  price?: number;
}

const items: ItemDef[] = [];

function add(def: ItemDef) {
  if (items.some((i) => i.key === def.key)) return;
  items.push(def);
}

for (const block of BLOCKS) {
  if (block.unlisted || block.key === 'air' || block.key === 'water' || block.key === 'lava') continue;
  add({
    key: block.key,
    name: block.name,
    kind: 'block',
    description: block.description,
    stack: 64,
    block: block.key,
    rarity: block.category === 'special' ? 'rare' : 'common',
    color: block.mapColor,
  });
}

const TIERS = [
  { key: 'wood', name: 'Wooden', color: '#b5844e', damage: 2, durability: 60, speed: 1.6, tier: 1 },
  { key: 'stone', name: 'Stone', color: '#9b9d9b', damage: 3, durability: 132, speed: 2.6, tier: 2 },
  { key: 'iron', name: 'Iron', color: '#d5dbe0', damage: 4, durability: 250, speed: 4.2, tier: 3 },
  { key: 'gold', name: 'Golden', color: '#f5c84b', damage: 3, durability: 90, speed: 6.0, tier: 1 },
  { key: 'diamond', name: 'Diamond', color: '#65e0d0', damage: 6, durability: 1561, speed: 7.2, tier: 4 },
];

const TOOL_NAMES: Array<{ type: ToolType; label: string; damageScale?: number }> = [
  { type: 'pickaxe', label: 'Pickaxe' },
  { type: 'axe', label: 'Axe' },
  { type: 'shovel', label: 'Shovel' },
  { type: 'hoe', label: 'Hoe' },
  { type: 'sword', label: 'Sword', damageScale: 1.35 },
];

for (const tier of TIERS) {
  for (const tool of TOOL_NAMES) {
    const isSword = tool.type === 'sword';
    add({
      key: `${tier.key}_${tool.type}`,
      name: `${tier.name} ${tool.label}`,
      kind: isSword ? 'weapon' : 'tool',
      description: isSword
        ? `A ${tier.name.toLowerCase()} blade. Deals ${Math.round(tier.damage * (tool.damageScale ?? 1))} damage.`
        : `A ${tier.name.toLowerCase()} ${tool.label.toLowerCase()} for harvesting blocks quickly.`,
      stack: 1,
      toolType: tool.type,
      tier: tier.tier,
      tierName: tier.name,
      damage: Math.round(tier.damage * (tool.damageScale ?? 1)),
      durability: tier.durability,
      rarity: tier.key === 'diamond' ? 'rare' : tier.key === 'gold' ? 'uncommon' : 'common',
      color: tier.color,
      price: 4 + tier.tier * 8,
    });
  }
}

add({ key: 'bow', name: 'Hunting Bow', kind: 'weapon', description: 'Fires arrows at whatever is unlucky enough to stand in front of you.', stack: 1, toolType: 'bow', damage: 6, durability: 220, rarity: 'uncommon', color: '#9b6a3b', price: 18 });
add({ key: 'rifle', name: 'Service Rifle', kind: 'weapon', description: 'A scoped automatic rifle. Loud, fast and built for the Ironhold line.', stack: 1, toolType: 'gun', damage: 8, durability: 700, rarity: 'rare', color: '#8d9aa4', price: 48 });
add({ key: 'rifle_ammo', name: '5.56 Round', kind: 'material', description: 'A brass rifle cartridge. Feed the Service Rifle.', stack: 64, rarity: 'common', color: '#c9a15a', damage: 0 });
add({ key: 'arrow', name: 'Arrow', kind: 'material', description: 'A sharpened shaft for your bow.', stack: 64, rarity: 'common', color: '#c7c2b2', damage: 0 });
add({ key: 'staff', name: 'Arcane Staff', kind: 'weapon', description: 'Channels sparkling arcane bolts.', stack: 1, toolType: 'staff', damage: 9, durability: 320, rarity: 'rare', color: '#7be6ff', price: 30 });
add({ key: 'shield', name: 'Iron Shield', kind: 'weapon', description: 'Blocks part of incoming melee damage while held.', stack: 1, toolType: 'shield', armor: 4, durability: 380, rarity: 'uncommon', color: '#a9b4be', price: 16 });
add({ key: 'cutlass', name: 'Cutlass', kind: 'weapon', description: 'A curved sailor\'s blade, quick and cruel.', stack: 1, toolType: 'sword', damage: 7, durability: 300, rarity: 'uncommon', color: '#d6dde4', price: 24 });
add({ key: 'katana', name: 'Ember Katana', kind: 'weapon', description: 'A folded blade that leaves a faint red trail.', stack: 1, toolType: 'sword', damage: 8, durability: 420, rarity: 'rare', color: '#ff7d5a', price: 36 });
add({ key: 'hammer', name: 'War Hammer', kind: 'weapon', description: 'Slow, heavy, and extremely persuasive.', stack: 1, toolType: 'sword', damage: 10, durability: 500, rarity: 'rare', color: '#8e9aa5', price: 38 });
add({ key: 'spear', name: 'Hunter Spear', kind: 'weapon', description: 'Long reach for keeping toothy things at a distance.', stack: 1, toolType: 'sword', damage: 7, durability: 280, rarity: 'uncommon', color: '#b78b53', price: 22 });
add({ key: 'mace', name: 'Spiked Mace', kind: 'weapon', description: 'A brutal iron bludgeon.', stack: 1, toolType: 'sword', damage: 8, durability: 340, rarity: 'uncommon', color: '#a7b0b8', price: 26 });
add({ key: 'dagger', name: 'Shadow Dagger', kind: 'weapon', description: 'Quick strikes from behind deal bonus damage.', stack: 1, toolType: 'sword', damage: 5, durability: 190, rarity: 'uncommon', color: '#9aa7b3', price: 14 });

const ARMOR_TIERS = [
  { key: 'leather', name: 'Leather', color: '#9b6a3d', points: 1, durability: 80 },
  { key: 'iron', name: 'Iron', color: '#ced6dd', points: 2, durability: 240 },
  { key: 'gold', name: 'Golden', color: '#f4ca56', points: 2, durability: 110 },
  { key: 'diamond', name: 'Diamond', color: '#66dfd1', points: 3, durability: 420 },
];

for (const tier of ARMOR_TIERS) {
  const slots: Array<{ slot: ArmorSlot; label: string }> = [
    { slot: 'helmet', label: 'Helmet' },
    { slot: 'chestplate', label: 'Chestplate' },
    { slot: 'leggings', label: 'Leggings' },
    { slot: 'boots', label: 'Boots' },
  ];
  for (const s of slots) {
    add({
      key: `${tier.key}_${s.slot}`,
      name: `${tier.name} ${s.label}`,
      kind: 'armor',
      description: `${tier.name} armor. +${tier.points} protection when worn.`,
      stack: 1,
      armor: tier.points,
      armorSlot: s.slot,
      durability: tier.durability,
      rarity: tier.key === 'diamond' ? 'rare' : tier.key === 'gold' ? 'uncommon' : 'common',
      color: tier.color,
      price: 8,
    });
  }
}

const FOOD: Array<[string, string, number, number, string]> = [
  ['apple', 'Apple', 4, 2, '#d1483f'],
  ['golden_apple', 'Golden Apple', 8, 6, '#f4ca56'],
  ['bread', 'Bread', 6, 3, '#c99753'],
  ['stew', 'Hearty Stew', 9, 5, '#a86a3b'],
  ['raw_porkchop', 'Raw Porkchop', 2, 1, '#e8a196'],
  ['cooked_porkchop', 'Cooked Porkchop', 7, 4, '#b96f43'],
  ['raw_beef', 'Raw Beef', 3, 1, '#b4504b'],
  ['cooked_beef', 'Steak', 8, 5, '#8d4a2f'],
  ['chicken_meat', 'Raw Chicken', 2, 1, '#e7c3a1'],
  ['cooked_chicken', 'Roast Chicken', 6, 4, '#c58d51'],
  ['carrot', 'Carrot', 3, 2, '#e5853a'],
  ['potato', 'Potato', 2, 1, '#c9a76a'],
  ['baked_potato', 'Baked Potato', 5, 3, '#d9b269'],
  ['water_bottle', 'Water Bottle', 0, 0, '#6ebfe8'],
];

for (const [key, name, hunger, heal, color] of FOOD) {
  add({
    key, name, kind: 'food',
    description: key === 'golden_apple' ? 'A shimmering fruit. Restores a lot of health.' : 'Edible. Restores hunger and a little health.',
    stack: key === 'water_bottle' ? 16 : 64, foodHunger: hunger, foodHeal: heal,
    rarity: key === 'golden_apple' ? 'epic' : 'common', color, price: key === 'golden_apple' ? 16 : 2,
  });
}

const MATERIALS: Array<[string, string, string, string, Rarity?]> = [
  ['stick', 'Stick', '#9a6f3f', 'A straight piece of wood.'],
  ['coal', 'Coal', '#34363b', 'A black lump of burnable carbon.'],
  ['charcoal', 'Charcoal', '#4a4a4a', 'Wood burned down to a clean-burning core.'],
  ['iron_ingot', 'Iron Ingot', '#d3dae0', 'Smelted iron, ready for tools and armor.'],
  ['gold_ingot', 'Gold Ingot', '#f1c64c', 'A soft, gleaming bar of gold.'],
  ['diamond', 'Diamond', '#61e0d3', 'A flawless blue gemstone.', 'rare'],
  ['emerald', 'Emerald', '#48cf7a', 'A vivid green gem, prized by traders.', 'uncommon'],
  ['redstone', 'Redstone Dust', '#e13f3b', 'Glowing dust that carries a charge.', 'uncommon'],
  ['string', 'String', '#dcd7c8', 'Fine thread, useful for bows and traps.'],
  ['feather', 'Feather', '#e9ecec', 'A light, stiff quill.'],
  ['leather', 'Leather', '#a47643', 'Cured hide.'],
  ['rabbit_hide', 'Rabbit Hide', '#c5ad93', 'A small, soft pelt.'],
  ['bone', 'Bone', '#dad4c1', 'A bleached bone.'],
  ['wheat', 'Wheat', '#d9b64e', 'Golden stalks ready for milling.'],
  ['paper', 'Paper', '#e7e1cf', 'Pressed plant fiber.'],
  ['book', 'Book', '#8c5a37', 'Pages bound in leather.'],
  ['gunpowder', 'Gunpowder', '#5d5d5d', 'Volatile black powder.', 'uncommon'],
  ['slimeball', 'Slimeball', '#7ed466', 'A wobbly green blob.'],
  ['magma_cream', 'Magma Cream', '#e97b3c', 'Warm, sticky and faintly glowing.', 'uncommon'],
  ['spider_eye', 'Spider Eye', '#a8474e', 'It is still looking at you.', 'uncommon'],
  ['crystal_shard', 'Crystal Shard', '#6de7db', 'A humming shard of raw crystal.', 'uncommon'],
  ['rune_stone', 'Rune Stone', '#b08cff', 'A pebble etched with a sleeping glyph.', 'rare'],
  ['void_essence', 'Void Essence', '#a376e8', 'A cold drop of nothing at all.', 'rare'],
  ['dragon_scale', 'Dragon Scale', '#e68b4b', 'A palm-sized scale, still warm.', 'epic'],
  ['honeycomb', 'Honeycomb', '#f0b53b', 'Sweet golden wax.'],
  ['raw_fish', 'Raw Fish', '#8fb8c2', 'Freshly caught and very slippery.'],
  ['cooked_fish', 'Cooked Fish', '#c79a62', 'Flaky and filling.'],
  ['rotten_flesh', 'Rotten Flesh', '#786a4e', 'Technically edible. Technically.'],
  ['coin', 'Gold Coin', '#f3c951', 'Currency accepted by merchants.'],
];

for (const [key, name, color, desc, rarity = 'common'] of MATERIALS) {
  add({
    key, name, kind: 'material', description: desc, stack: 64,
    rarity, color, price: key === 'dragon_scale' ? 60 : rarity === 'rare' ? 18 : 3,
  });
}

/* ------------------------------------------------------------------ */
/*  Cooking sim ingredients, dishes and shop stock                     */
/* ------------------------------------------------------------------ */

const INGREDIENTS: Array<[string, string, string, string, number]> = [
  ['tomato', 'Tomato', '#d4553c', 'A ripe red tomato, still warm from the vine.', 2],
  ['lettuce', 'Lettuce', '#6fae3f', 'Crisp green leaves, ready for a salad or a burger.', 2],
  ['onion', 'Onion', '#a47ac4', 'Sharp, sweet and guaranteed to make you cry.', 2],
  ['mushroom', 'Mushroom', '#b4443c', 'A firm, earthy mushroom for soups and sautés.', 2],
  ['egg', 'Egg', '#f2e8cf', 'A fresh egg. Useful in almost everything.', 2],
  ['cheese', 'Cheese', '#f3c951', 'A sharp wedge of aged cheese.', 4],
  ['rice', 'Rice', '#e8e2cc', 'A handful of long white rice.', 2],
  ['noodles', 'Noodles', '#e8cf8a', 'Springy egg noodles, ready for the broth.', 3],
  ['dough', 'Dough', '#e0c27a', 'Soft dough waiting for an oven.', 3],
  ['butter', 'Butter', '#f2d27a', 'A golden block of butter.', 3],
  ['chocolate', 'Chocolate', '#7a4028', 'Dark baking chocolate with a snap.', 4],
  ['coffee_bean', 'Coffee Beans', '#8f5a34', 'Roasted beans with a deep, bitter smell.', 3],
  ['tea_leaf', 'Tea Leaves', '#78bf4a', 'Fragrant green tea leaves.', 3],
  ['broth', 'Broth', '#c98f4c', 'A rich stock simmered for hours.', 4],
];

for (const [key, name, color, desc, price] of INGREDIENTS) {
  add({ key, name, kind: 'material', description: desc, stack: 64, rarity: 'common', color, price });
}

const DISHES: Array<[string, string, number, number, string, string]> = [
  ['burger', 'Forge Burger', 11, 6, '#e0a14f', 'A double-stacked burger with melted cheese and a toasted bun.'],
  ['cheese_pizza', 'Cheese Pizza', 10, 5, '#e8bb62', 'A whole stone-baked pizza, cut into slices that never last long.'],
  ['garden_salad', 'Garden Salad', 7, 4, '#78bf4a', 'Crisp leaves, tomato and a bright vinaigrette.'],
  ['cake_slice', 'Cake Slice', 8, 4, '#f2e1c9', 'A thick slice of chocolate cake with cream and a cherry.'],
  ['coffee', 'Hot Coffee', 3, 2, '#5b3520', 'Strong, hot and better than sleep.'],
  ['tea', 'Herbal Tea', 2, 3, '#b5762d', 'Soothing tea with a spoonful of honey.'],
  ['ramen', 'Ember Ramen', 12, 7, '#e8c06b', 'A steaming bowl of noodles, egg and rich broth.'],
  ['pumpkin_soup', 'Pumpkin Soup', 9, 5, '#e3a25a', 'Velvety pumpkin soup with a swirl of cream.'],
];

for (const [key, name, hunger, heal, color, desc] of DISHES) {
  add({
    key, name, kind: 'food', description: desc, stack: 16,
    foodHunger: hunger, foodHeal: heal, rarity: key === 'ramen' ? 'uncommon' : 'common',
    color, price: Math.max(4, Math.round(hunger * 0.8)),
  });
}

add({ key: 'milk', name: 'Milk', kind: 'food', description: 'A cold bottle of milk. Drink it, or steam it for coffee.', stack: 16, foodHunger: 2, foodHeal: 1, rarity: 'common', color: '#f3efe2', price: 2 });

const SHOP_GOODS: Array<[string, string, string, string, number, Rarity?]> = [
  ['soap', 'Lavender Soap', '#d9f2e8', 'A neatly wrapped bar of lavender soap.', 6],
  ['candle', 'Honey Candle', '#f0c969', 'A hand-poured candle with a honey scent.', 7],
  ['soda', 'Cherry Soda', '#d4553c', 'A fizzy red bottle with a metal cap.', 4],
  ['snack_bar', 'Trail Bar', '#f2c14f', 'Oats, honey and nuts pressed into a bar.', 4],
  ['toy_car', 'Tin Toy Car', '#f07a5c', 'A wind-up car with painted wheels.', 10, 'uncommon'],
  ['newspaper', 'The Forge Gazette', '#e7e1cf', 'Today\'s news, yesterday\'s fish wrapping.', 3],
];

for (const [key, name, color, desc, price, rarity = 'common'] of SHOP_GOODS) {
  add({ key, name, kind: 'material', description: desc, stack: 32, rarity, color, price });
}

add({ key: 'lucky_coin', name: 'Lucky Coin', kind: 'material', description: 'A coin that always lands on its edge. Traders love them.', stack: 16, rarity: 'rare', color: '#f7d85a', price: 28 });
add({ key: 'lucky_sword', name: 'Fortune\'s Edge', kind: 'weapon', description: 'A golden blade pulled from a lucky block. It hums when the odds are in your favour.', stack: 1, toolType: 'sword', damage: 14, durability: 1400, rarity: 'legendary', color: '#f4d25a', price: 220 });
add({ key: 'chef_hat', name: 'Chef\'s Toque', kind: 'armor', description: 'A tall white hat. Wearing it makes every plate look intentional.', stack: 1, armor: 1, armorSlot: 'helmet', durability: 140, rarity: 'uncommon', color: '#f7f5ec', price: 12 });
add({ key: 'apron', name: 'Service Apron', kind: 'armor', description: 'A sturdy apron with a deep pocket for order slips.', stack: 1, armor: 2, armorSlot: 'chestplate', durability: 200, rarity: 'uncommon', color: '#e8e4d6', price: 16 });

add({ key: 'bucket', name: 'Iron Bucket', kind: 'special', description: 'Scoops water and lava. Place with right click.', stack: 1, rarity: 'uncommon', color: '#bcc6ce', price: 12 });
add({ key: 'tnt', name: 'TNT', kind: 'block', block: 'tnt', description: 'Light it and run.', stack: 64, rarity: 'uncommon', color: '#c7483f' });
add({ key: 'bomb_up', name: 'Bomb Rack', kind: 'special', description: 'Cinderburst power-up. Keeps one more bomb burning at once.', stack: 8, rarity: 'rare', color: '#ff9b4a' });
add({ key: 'blast_core', name: 'Blast Core', kind: 'special', description: 'Cinderburst power-up. Adds two blocks of blast reach.', stack: 8, rarity: 'rare', color: '#ff5a3c' });
add({ key: 'speed_skates', name: 'Cinder Skates', kind: 'special', description: 'Cinderburst power-up. Faster feet on the powder floor.', stack: 8, rarity: 'rare', color: '#7be6ff' });
add({ key: 'soul_shard', name: 'Soul Shard', kind: 'special', description: 'A cold scrap of night. Nightfall survivors drink these for power.', stack: 64, rarity: 'uncommon', color: '#b9a7ff' });
add({ key: 'totem', name: 'Totem of Returning', kind: 'special', description: 'Once per life, cheats death and returns you to safety.', stack: 1, rarity: 'legendary', color: '#7be7a8', price: 100 });
add({ key: 'compass', name: 'Explorer\'s Compass', kind: 'special', description: 'Points toward the nearest objective marker.', stack: 1, rarity: 'uncommon', color: '#d6c089', price: 20 });
add({ key: 'map', name: 'Region Map', kind: 'special', description: 'Reveals nearby terrain on the minimap for a while.', stack: 1, rarity: 'uncommon', color: '#d8c99d', price: 14 });
add({ key: 'lantern', name: 'Lantern', kind: 'special', description: 'A portable light source. Place it to brighten a room.', stack: 16, block: 'glowstone', rarity: 'uncommon', color: '#f0c969', price: 10 });
add({ key: 'spawn_egg', name: 'Spawn Marker', kind: 'special', description: 'Studio-only marker for a creature spawn point.', stack: 64, rarity: 'rare', color: '#b48cff' });

export const ITEMS = items;
export const ITEM_BY_KEY = new Map(ITEMS.map((i) => [i.key, i]));

export function item(key: string): ItemDef {
  const i = ITEM_BY_KEY.get(key);
  if (!i) throw new Error(`Unknown item: ${key}`);
  return i;
}

export function itemOrNull(key: string): ItemDef | undefined {
  return ITEM_BY_KEY.get(key);
}

export const ITEM_CATEGORIES = [
  { id: 'all', label: 'All Items', icon: '▦' },
  { id: 'block', label: 'Blocks', icon: '▥' },
  { id: 'tool', label: 'Tools', icon: '⛏' },
  { id: 'weapon', label: 'Weapons', icon: '⚔' },
  { id: 'armor', label: 'Armor', icon: '⛨' },
  { id: 'food', label: 'Food', icon: '❖' },
  { id: 'material', label: 'Materials', icon: '✦' },
  { id: 'special', label: 'Special', icon: '★' },
];

/* ------------------------------------------------------------------ */
/*  Item icons                                                         */
/* ------------------------------------------------------------------ */

const iconCache = new Map<string, string>();

const ARMOR_LABEL: Record<ArmorSlot, string> = { helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };

/** Get (and cache) a 64×64 data URL icon for an item. */
export function itemIcon(key: string, atlas?: TextureAtlas): string {
  const cached = iconCache.get(key);
  if (cached) return cached;
  const def = ITEM_BY_KEY.get(key);
  if (!def) return '';
  if (def.block && atlas) {
    const url = atlas.getBlockIcon(def.block);
    iconCache.set(key, url);
    return url;
  }
  const url = renderItemIcon(def);
  iconCache.set(key, url);
  return url;
}

/** Small icon for HUD slots keyed by item id. */
export function itemColor(key: string): string {
  return ITEM_BY_KEY.get(key)?.color ?? '#888';
}

/* ------------------------------------------------------------------ */
/*  Recipes                                                            */
/* ------------------------------------------------------------------ */

export type Station = 'hand' | 'table' | 'furnace';

export interface Ingredient {
  item: string;
  count: number;
}

export interface Recipe {
  id: string;
  output: string;
  count: number;
  ingredients: Ingredient[];
  station: Station;
  time?: number;
  hint?: string;
}

const recipes: Recipe[] = [];

function r(output: string, count: number, ingredients: Array<[string, number]>, station: Station = 'hand', hint?: string) {
  recipes.push({
    id: `${output}_${recipes.length}`,
    output,
    count,
    ingredients: ingredients.map(([itemKey, n]) => ({ item: itemKey, count: n })),
    station,
    time: station === 'furnace' ? 6 : 0.5,
    hint,
  });
}

// Wood and basic crafting.
for (const wood of ['oak', 'birch', 'spruce']) {
  r(`${wood}_planks`, 4, [[`${wood}_log`, 1]], 'hand', 'Any log can be split into planks.');
  r('stick', 4, [[`${wood}_planks`, 2]], 'hand', 'Two planks make four sticks.');
  r('crafting_table', 1, [[`${wood}_planks`, 4]], 'hand');
  r('chest', 1, [[`${wood}_planks`, 8]], 'table');
  r('bookshelf', 1, [[`${wood}_planks`, 6], ['book', 3]], 'table');
  r('barrel', 1, [[`${wood}_planks`, 6], ['stick', 2]], 'table');
  r('crate', 1, [[`${wood}_planks`, 5], ['stick', 2]], 'table');
}
r('torch', 8, [['coal', 1], ['stick', 1]], 'hand', 'Coal and a stick light the dark.');
r('torch', 8, [['charcoal', 1], ['stick', 1]], 'hand');
r('furnace', 1, [['cobblestone', 8]], 'table', 'Smelt ores and cook food.');
r('glass', 4, [['sand', 1]], 'furnace');
r('stone', 1, [['cobblestone', 1]], 'furnace');
r('stone_bricks', 4, [['stone', 4]], 'table');
r('bricks', 4, [['clay', 4]], 'furnace');
r('terracotta', 4, [['clay', 4]], 'furnace');
r('charcoal', 2, [['oak_log', 1]], 'furnace');
r('cobblestone', 1, [['gravel', 4]], 'hand', 'Pack loose gravel into cobblestone.');

// Tools and weapons.
for (const tier of TIERS) {
  const mat = tier.key === 'wood' ? 'oak_planks' : tier.key === 'stone' ? 'cobblestone' : `${tier.key}_ingot`;
  if (tier.key === 'diamond') {
    // diamond is a gem, not an ingot
  }
  const material = tier.key === 'wood' ? 'oak_planks' : tier.key === 'stone' ? 'cobblestone' : tier.key === 'diamond' ? 'diamond' : `${tier.key}_ingot`;
  r(`${tier.key}_pickaxe`, 1, [[material, 3], ['stick', 2]], 'table');
  r(`${tier.key}_axe`, 1, [[material, 3], ['stick', 2]], 'table');
  r(`${tier.key}_shovel`, 1, [[material, 1], ['stick', 2]], 'table');
  r(`${tier.key}_hoe`, 1, [[material, 2], ['stick', 2]], 'table');
  r(`${tier.key}_sword`, 1, [[material, 2], ['stick', 1]], 'table');
  void mat;
}
r('bow', 1, [['stick', 3], ['string', 3]], 'table', 'A ranged weapon for hunters.');
r('rifle', 1, [['iron_ingot', 5], ['gunpowder', 2], ['stick', 2]], 'table', 'A service rifle. Loud, fast and very persuasive.');
r('rifle_ammo', 16, [['iron_ingot', 1], ['gunpowder', 1]], 'table', 'Brass cartridges for the service rifle.');
r('arrow', 8, [['stick', 2], ['feather', 1], ['iron_ingot', 1]], 'table');
r('shield', 1, [['oak_planks', 6], ['iron_ingot', 2]], 'table');
r('staff', 1, [['stick', 3], ['crystal_shard', 2], ['gold_ingot', 1]], 'table', 'Channels arcane bolts.');
r('spear', 1, [['stick', 3], ['iron_ingot', 2]], 'table');
r('dagger', 1, [['iron_ingot', 1], ['stick', 1], ['leather', 1]], 'table');
r('hammer', 1, [['iron_ingot', 4], ['stick', 2]], 'table');
r('katana', 1, [['diamond', 2], ['stick', 1], ['rune_stone', 1]], 'table');
r('cutlass', 1, [['iron_ingot', 3], ['gold_ingot', 1]], 'table');
r('mace', 1, [['iron_ingot', 4], ['stick', 2], ['crystal_shard', 1]], 'table');

// Armor.
for (const tier of ARMOR_TIERS) {
  const mat = tier.key === 'leather' ? 'leather' : tier.key === 'diamond' ? 'diamond' : `${tier.key}_ingot`;
  r(`${tier.key}_helmet`, 1, [[mat, 5]], 'table');
  r(`${tier.key}_chestplate`, 1, [[mat, 8]], 'table');
  r(`${tier.key}_leggings`, 1, [[mat, 7]], 'table');
  r(`${tier.key}_boots`, 1, [[mat, 4]], 'table');
}

// Food and farming.
r('bread', 1, [['wheat', 3]], 'table');
r('stew', 1, [['carrot', 2], ['baked_potato', 1], ['cooked_beef', 1]], 'table');
r('golden_apple', 1, [['apple', 1], ['gold_ingot', 8]], 'table', 'A legendary restorative.');
r('baked_potato', 1, [['potato', 1]], 'furnace');
r('cooked_beef', 1, [['raw_beef', 1]], 'furnace');
r('cooked_porkchop', 1, [['raw_porkchop', 1]], 'furnace');
r('cooked_chicken', 1, [['chicken_meat', 1]], 'furnace');
r('cooked_fish', 1, [['raw_fish', 1]], 'furnace');
r('paper', 3, [['wheat', 1]], 'table');
r('book', 1, [['paper', 3], ['leather', 1]], 'table');

// Metallurgy and magic.
r('iron_ingot', 1, [['iron_ore', 1]], 'furnace');
r('gold_ingot', 1, [['gold_ore', 1]], 'furnace');
r('diamond', 1, [['diamond_ore', 1]], 'furnace', 'Smelting diamond ore yields a cut gem.');
r('glass', 1, [['sand', 1]], 'furnace');
r('crystal_block', 1, [['crystal_shard', 4]], 'table');
r('rune_block', 4, [['stone', 4], ['rune_stone', 1]], 'table');
r('glowstone', 4, [['gold_ingot', 2], ['crystal_shard', 4]], 'table');
r('tnt', 1, [['gunpowder', 5], ['sand', 4]], 'table');
r('torch', 4, [['stick', 1], ['charcoal', 1]], 'hand');
r('crystal_flower', 1, [['crystal_shard', 1], ['poppy', 1]], 'table');
r('totem', 1, [['dragon_scale', 2], ['crystal_shard', 4], ['emerald', 2]], 'table', 'Craft a second chance.');

// Kitchen, shop and lucky-block extras.
r('chef_hat', 1, [['wool_white', 3]], 'table', 'A proper toque for a proper kitchen.');
r('apron', 1, [['wool_white', 4], ['string', 2]], 'table');
r('gold_block', 1, [['gold_ingot', 9]], 'table');
r('candle', 2, [['honeycomb', 1], ['string', 1]], 'table');
r('soap', 2, [['honeycomb', 1], ['crystal_flower', 1]], 'table');
r('lucky_sword', 1, [['gold_block', 1], ['diamond', 2], ['lucky_coin', 3]], 'table', 'A blade forged from impossible luck.');

// Simple block conversions.
r('sandstone', 1, [['sand', 4]], 'table');
r('wool_white', 1, [['string', 4]], 'table');
for (const color of ['red', 'blue', 'green', 'yellow', 'black', 'orange', 'purple', 'cyan']) {
  r(`wool_${color}`, 1, [['wool_white', 1], [color === 'black' ? 'coal' : color === 'red' ? 'redstone' : color === 'yellow' ? 'gold_ingot' : 'crystal_shard', 1]], 'table');
}

export const RECIPES = recipes;
export const SMELTING_RECIPES = recipes.filter((x) => x.station === 'furnace');

export function recipesFor(itemKey: string): Recipe[] {
  return RECIPES.filter((x) => x.output === itemKey);
}

export function availableRecipes(station: Station): Recipe[] {
  const rank: Record<Station, number> = { hand: 0, table: 1, furnace: 2 };
  return RECIPES.filter((x) => rank[x.station] <= rank[station]);
}

export function recipeCost(recipe: Recipe): string {
  return recipe.ingredients.map((i) => `${ITEM_BY_KEY.get(i.item)?.name ?? i.item} ×${i.count}`).join('  ·  ');
}

export function itemName(key: string): string {
  return ITEM_BY_KEY.get(key)?.name ?? key;
}

export { ARMOR_LABEL };
