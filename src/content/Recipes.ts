import { BLOCKS } from '../engine/world/Blocks';
import type { TextureAtlas } from '../engine/render/TextureAtlas';
import { hexToRgb } from '../engine/core/Utils';

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

add({ key: 'bucket', name: 'Iron Bucket', kind: 'special', description: 'Scoops water and lava. Place with right click.', stack: 1, rarity: 'uncommon', color: '#bcc6ce', price: 12 });
add({ key: 'tnt', name: 'TNT', kind: 'block', block: 'tnt', description: 'Light it and run.', stack: 64, rarity: 'uncommon', color: '#c7483f' });
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
/*  Procedural item icons                                              */
/* ------------------------------------------------------------------ */

const iconCache = new Map<string, string>();

const ARMOR_LABEL: Record<ArmorSlot, string> = { helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 2, h = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawMaterialIcon(ctx: CanvasRenderingContext2D, def: ItemDef) {
  const c = def.color;
  switch (def.key) {
    case 'rifle_ammo':
      px(ctx, 8, 15, '#b98c45', 6, 10);
      px(ctx, 8, 11, '#e6cf8a', 6, 4);
      px(ctx, 16, 9, '#c9a15a', 5, 16);
      px(ctx, 16, 6, '#e6cf8a', 5, 4);
      px(ctx, 25, 17, '#b98c45', 4, 8);
      break;
    case 'stick':
      px(ctx, 12, 20, '#6e4b28', 3, 3);
      for (let i = 0; i < 5; i++) px(ctx, 13 + i * 2, 19 - i * 2, '#9a6f3f', 3, 3);
      px(ctx, 13, 19, '#b98a55', 2, 2);
      break;
    case 'coal':
    case 'charcoal':
      px(ctx, 10, 12, '#1c1d21', 12, 10);
      px(ctx, 8, 15, '#2e3036', 14, 7);
      px(ctx, 12, 14, '#4a4c52', 3, 2);
      px(ctx, 19, 18, '#121317', 3, 2);
      break;
    case 'iron_ingot':
    case 'gold_ingot':
    case 'coin': {
      const dark = shade(c, -0.35);
      const light = shade(c, 0.35);
      if (def.key === 'coin') {
        ctx.beginPath();
        ctx.arc(16, 16, 9, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = dark;
        ctx.stroke();
        px(ctx, 14, 13, light, 4, 2);
        px(ctx, 16, 15, dark, 2, 5);
      } else {
        px(ctx, 8, 14, dark, 16, 8);
        px(ctx, 10, 12, c, 14, 8);
        px(ctx, 10, 12, light, 10, 2);
        px(ctx, 8, 22, dark, 16, 2);
      }
      break;
    }
    case 'diamond':
    case 'emerald':
    case 'crystal_shard':
    case 'rune_stone':
    case 'void_essence':
    case 'dragon_scale': {
      const light = shade(c, 0.45);
      if (def.key === 'rune_stone') {
        px(ctx, 8, 9, '#494455', 16, 17);
        px(ctx, 6, 12, '#5d586e', 20, 11);
        px(ctx, 13, 8, light, 2, 15);
        px(ctx, 10, 14, light, 10, 2);
        px(ctx, 12, 17, light, 6, 2);
      } else if (def.key === 'dragon_scale') {
        ctx.beginPath();
        ctx.moveTo(16, 5);
        ctx.lineTo(26, 13);
        ctx.lineTo(22, 26);
        ctx.lineTo(10, 26);
        ctx.lineTo(6, 13);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = shade(c, -0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
        px(ctx, 13, 11, light, 4, 3);
      } else if (def.key === 'void_essence') {
        ctx.beginPath();
        ctx.arc(16, 15, 7, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        px(ctx, 13, 12, light, 4, 3);
        px(ctx, 15, 21, shade(c, -0.35), 2, 6);
      } else {
        ctx.beginPath();
        ctx.moveTo(16, 4);
        ctx.lineTo(25, 13);
        ctx.lineTo(16, 28);
        ctx.lineTo(7, 13);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        px(ctx, 11, 12, light, 4, 5);
        px(ctx, 15, 20, shade(c, -0.25), 5, 4);
      }
      break;
    }
    case 'redstone':
      px(ctx, 12, 10, c, 2, 2); px(ctx, 19, 14, c, 2, 2); px(ctx, 8, 20, c, 2, 2);
      px(ctx, 17, 23, c, 2, 2); px(ctx, 22, 7, c, 2, 2); px(ctx, 6, 12, c, 2, 2);
      px(ctx, 21, 19, c, 2, 2); px(ctx, 11, 17, c, 2, 2);
      break;
    case 'string':
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(7, 7);
      ctx.bezierCurveTo(25, 10, 7, 22, 25, 24);
      ctx.stroke();
      break;
    case 'feather':
      ctx.strokeStyle = shade(c, -0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9, 25);
      ctx.lineTo(24, 8);
      ctx.stroke();
      px(ctx, 16, 9, c, 5, 3); px(ctx, 13, 12, c, 4, 3); px(ctx, 19, 12, c, 3, 3);
      px(ctx, 11, 16, c, 4, 2);
      break;
    case 'leather':
    case 'rabbit_hide':
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(8, 9);
      ctx.lineTo(14, 6);
      ctx.lineTo(18, 9);
      ctx.lineTo(26, 8);
      ctx.lineTo(24, 17);
      ctx.lineTo(21, 25);
      ctx.lineTo(13, 26);
      ctx.lineTo(7, 18);
      ctx.closePath();
      ctx.fill();
      px(ctx, 11, 12, shade(c, 0.22), 4, 4);
      break;
    case 'bone':
      px(ctx, 13, 9, c, 6, 16);
      px(ctx, 9, 6, c, 5, 5); px(ctx, 18, 6, c, 5, 5);
      px(ctx, 9, 23, c, 5, 5); px(ctx, 18, 23, c, 5, 5);
      px(ctx, 14, 12, shade(c, -0.18), 2, 8);
      break;
    case 'wheat':
      px(ctx, 15, 12, '#8c9d45', 2, 17);
      for (let i = 0; i < 4; i++) {
        px(ctx, 9, 9 + i * 4, c, 6, 2);
        px(ctx, 17, 7 + i * 4, c, 6, 2);
      }
      break;
    case 'paper':
      px(ctx, 8, 7, '#d5cdb8', 17, 20);
      px(ctx, 10, 6, c, 15, 20);
      px(ctx, 13, 11, '#9a9280', 8, 1); px(ctx, 13, 15, '#9a9280', 9, 1); px(ctx, 13, 19, '#9a9280', 6, 1);
      break;
    case 'book':
      px(ctx, 8, 6, '#5d3c25', 17, 21);
      px(ctx, 10, 8, c, 13, 17);
      px(ctx, 10, 8, '#b07a4a', 3, 17);
      px(ctx, 16, 10, '#e3d9b8', 5, 1); px(ctx, 16, 13, '#e3d9b8', 5, 1); px(ctx, 16, 16, '#e3d9b8', 5, 1);
      break;
    case 'gunpowder':
      px(ctx, 9, 20, '#3b3b3d', 15, 4);
      for (let i = 0; i < 9; i++) px(ctx, 8 + Math.random() * 15, 8 + Math.random() * 10, i % 2 ? '#6b6c70' : '#2e2f33', 2, 2);
      break;
    case 'slimeball':
      ctx.beginPath();
      ctx.arc(16, 18, 9, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      px(ctx, 13, 13, shade(c, 0.45), 5, 4);
      px(ctx, 19, 21, shade(c, -0.25), 4, 3);
      break;
    case 'magma_cream':
      ctx.beginPath();
      ctx.arc(16, 17, 9, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      px(ctx, 11, 14, '#ffd36e', 3, 3); px(ctx, 19, 18, '#612817', 4, 2); px(ctx, 15, 21, '#ffb14f', 3, 2);
      break;
    case 'spider_eye':
      ctx.beginPath();
      ctx.arc(16, 16, 9, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      px(ctx, 13, 12, '#5c1d23', 7, 7);
      px(ctx, 15, 14, '#e7d8a2', 3, 3);
      break;
    case 'honeycomb':
      ctx.fillStyle = c;
      ctx.fillRect(7, 9, 18, 16);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
        px(ctx, 8 + x * 4, 10 + y * 4, (x + y) % 2 ? '#f7d06f' : '#c88e24', 3, 3);
      }
      break;
    case 'raw_fish':
    case 'cooked_fish':
      ctx.beginPath();
      ctx.ellipse(15, 16, 10, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(24, 16); ctx.lineTo(29, 11); ctx.lineTo(29, 21); ctx.closePath();
      ctx.fill();
      px(ctx, 9, 13, '#f7f2dd', 3, 3);
      px(ctx, 10, 14, '#222', 2, 2);
      break;
    case 'rotten_flesh':
      for (let i = 0; i < 6; i++) {
        px(ctx, 7 + (i % 3) * 6, 9 + Math.floor(i / 3) * 8, i % 2 ? c : shade(c, -0.18), 7, 6);
      }
      break;
    default:
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(16, 16, 8, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, 13, 12, shade(c, 0.4), 4, 3);
  }
}

function drawToolIcon(ctx: CanvasRenderingContext2D, def: ItemDef) {
  const c = def.color;
  const dark = shade(c, -0.32);
  const light = shade(c, 0.34);
  const handle = '#7b5530';
  const handleLight = '#a57645';
  const type = def.toolType;

  if (type === 'shield') {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(16, 4); ctx.lineTo(27, 8); ctx.lineTo(24, 22); ctx.lineTo(16, 28); ctx.lineTo(8, 22); ctx.lineTo(5, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
    px(ctx, 15, 9, '#e8c35d', 2, 13); px(ctx, 10, 13, '#e8c35d', 12, 2);
    return;
  }
  if (type === 'staff') {
    px(ctx, 14, 13, handle, 3, 16);
    for (let i = 0; i < 5; i++) px(ctx, 12 + i, 23 - i * 2, handleLight, 2, 2);
    ctx.beginPath(); ctx.arc(16, 9, 6, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    px(ctx, 13, 6, light, 4, 3);
    px(ctx, 9, 7, shade(c, 0.2), 2, 2); px(ctx, 22, 11, shade(c, 0.2), 2, 2);
    return;
  }
  if (type === 'gun') {
    px(ctx, 4, 13, dark, 21, 5);
    px(ctx, 6, 11, c, 17, 3);
    px(ctx, 3, 14, light, 3, 2);
    px(ctx, 10, 10, '#5a636a', 5, 2);
    px(ctx, 18, 18, handle, 4, 6);
    px(ctx, 23, 16, handleLight, 3, 8);
    px(ctx, 7, 15, '#39434a', 6, 2);
    return;
  }
  if (type === 'bow') {
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 5); ctx.quadraticCurveTo(25, 16, 10, 27); ctx.stroke();
    ctx.strokeStyle = '#ddd6bd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, 5); ctx.lineTo(10, 27); ctx.stroke();
    px(ctx, 11, 15, '#b9b2a0', 9, 2);
    px(ctx, 18, 13, '#d9d2c1', 2, 6);
    return;
  }

  // Handle diagonal.
  for (let i = 0; i < 7; i++) px(ctx, 9 + i * 2, 25 - i * 2, i % 2 ? handleLight : handle, 3, 3);

  if (type === 'pickaxe') {
    ctx.strokeStyle = c; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(6, 12); ctx.quadraticCurveTo(16, 5, 27, 11); ctx.stroke();
    px(ctx, 5, 11, dark, 4, 4); px(ctx, 26, 9, light, 3, 4);
    px(ctx, 13, 8, light, 7, 2);
  } else if (type === 'axe') {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(20, 5); ctx.lineTo(28, 9); ctx.lineTo(25, 18); ctx.lineTo(17, 14); ctx.closePath(); ctx.fill();
    px(ctx, 20, 6, light, 5, 2);
    px(ctx, 17, 13, dark, 3, 4);
  } else if (type === 'shovel') {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(17, 5); ctx.lineTo(26, 9); ctx.lineTo(24, 17); ctx.lineTo(15, 12); ctx.closePath(); ctx.fill();
    px(ctx, 18, 6, light, 5, 3);
  } else if (type === 'hoe') {
    px(ctx, 18, 6, c, 9, 4);
    px(ctx, 17, 6, light, 3, 2);
    px(ctx, 24, 9, dark, 3, 4);
  } else {
    // sword
    const blade = def.key.includes('ember') || def.key.includes('katana') ? '#ffb08a' : c;
    for (let i = 0; i < 6; i++) px(ctx, 15 + i * 2, 18 - i * 2, i % 2 ? light : blade, 4, 4);
    px(ctx, 21, 4, '#ffffff', 2, 2);
    px(ctx, 9, 20, '#c9a24e', 11, 3);
    px(ctx, 12, 23, handle, 5, 3);
  }
}

function drawArmorIcon(ctx: CanvasRenderingContext2D, def: ItemDef) {
  const c = def.color;
  const dark = shade(c, -0.3);
  const light = shade(c, 0.32);
  switch (def.armorSlot) {
    case 'helmet':
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(6, 20); ctx.quadraticCurveTo(6, 6, 16, 5); ctx.quadraticCurveTo(26, 6, 26, 20); ctx.lineTo(21, 24); ctx.lineTo(21, 14); ctx.lineTo(11, 14); ctx.lineTo(11, 24); ctx.closePath(); ctx.fill();
      px(ctx, 11, 8, light, 10, 3);
      px(ctx, 11, 17, dark, 3, 7); px(ctx, 19, 17, dark, 3, 7);
      break;
    case 'chestplate':
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(8, 6); ctx.lineTo(13, 8); ctx.lineTo(19, 8); ctx.lineTo(24, 6); ctx.lineTo(28, 11); ctx.lineTo(24, 16); ctx.lineTo(24, 27); ctx.lineTo(8, 27); ctx.lineTo(8, 16); ctx.lineTo(4, 11); ctx.closePath(); ctx.fill();
      px(ctx, 12, 10, light, 8, 3);
      px(ctx, 16, 14, dark, 2, 11);
      break;
    case 'leggings':
      px(ctx, 8, 5, c, 16, 6);
      px(ctx, 8, 10, c, 6, 18);
      px(ctx, 18, 10, c, 6, 18);
      px(ctx, 10, 6, light, 12, 2);
      px(ctx, 8, 25, dark, 6, 3); px(ctx, 18, 25, dark, 6, 3);
      break;
    default:
      px(ctx, 6, 14, c, 9, 13);
      px(ctx, 17, 14, c, 9, 13);
      px(ctx, 5, 24, dark, 11, 5);
      px(ctx, 16, 24, dark, 11, 5);
      px(ctx, 8, 15, light, 5, 2); px(ctx, 19, 15, light, 5, 2);
      px(ctx, 6, 11, c, 9, 4);
      break;
  }
}

function drawFoodIcon(ctx: CanvasRenderingContext2D, def: ItemDef) {
  const c = def.color;
  if (def.key.includes('bread')) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(16, 16, 12, 7, -0.2, 0, Math.PI * 2); ctx.fill();
    px(ctx, 6, 14, '#e0b26e', 20, 4);
    px(ctx, 10, 11, '#8f5e30', 3, 2); px(ctx, 17, 11, '#8f5e30', 3, 2); px(ctx, 21, 14, '#8f5e30', 2, 2);
    return;
  }
  if (def.key.includes('stew')) {
    ctx.fillStyle = '#6f7478';
    ctx.beginPath(); ctx.ellipse(16, 18, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(16, 16, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    px(ctx, 10, 14, '#e3a25a', 3, 3); px(ctx, 17, 13, '#c96f3c', 4, 3); px(ctx, 14, 17, '#7fa84b', 3, 2);
    return;
  }
  if (def.key.includes('water')) {
    px(ctx, 12, 6, '#5aa9d6', 8, 4);
    px(ctx, 9, 10, '#7ac7ea', 14, 15);
    px(ctx, 9, 23, '#4d94bd', 14, 3);
    px(ctx, 11, 9, '#d8f2ff', 3, 4);
    return;
  }
  if (def.key.includes('apple')) {
    ctx.beginPath(); ctx.arc(16, 18, 9, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill();
    px(ctx, 12, 12, shade(c, 0.4), 4, 3);
    px(ctx, 16, 6, '#6b4a28', 2, 5);
    px(ctx, 18, 7, '#639a44', 6, 3);
    if (def.key === 'golden_apple') px(ctx, 11, 17, '#fff2a3', 3, 3);
    return;
  }
  if (def.key.includes('chicken') || def.key.includes('beef') || def.key.includes('porkchop')) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(16, 17, 10, 8, 0.3, 0, Math.PI * 2); ctx.fill();
    px(ctx, 10, 12, shade(c, 0.25), 7, 4);
    px(ctx, 19, 19, shade(c, -0.25), 5, 3);
    px(ctx, 8, 22, '#e8dfc7', 2, 5);
    return;
  }
  if (def.key.includes('carrot')) {
    for (let i = 0; i < 5; i++) px(ctx, 13 + (i % 2), 9 + i * 4, c, 7 - i, 4);
    px(ctx, 16, 4, '#6ba348', 2, 6); px(ctx, 12, 5, '#6ba348', 2, 5); px(ctx, 20, 5, '#6ba348', 2, 5);
    return;
  }
  if (def.key.includes('potato')) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(16, 17, 9, 7, 0.4, 0, Math.PI * 2); ctx.fill();
    px(ctx, 11, 14, shade(c, 0.25), 4, 3);
    return;
  }
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(16, 16, 9, 0, Math.PI * 2); ctx.fill();
}

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
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(0, 0);
  ctx.scale(2, 2);
  ctx.lineJoin = 'round';
  if (def.kind === 'tool' || def.kind === 'weapon') drawToolIcon(ctx, def);
  else if (def.kind === 'armor') drawArmorIcon(ctx, def);
  else if (def.kind === 'food') drawFoodIcon(ctx, def);
  else drawMaterialIcon(ctx, def);
  ctx.restore();

  // Ground shadow and outline make cards pop against dark panels.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(32, 52, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const url = canvas.toDataURL();
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
