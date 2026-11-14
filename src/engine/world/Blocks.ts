export type BlockCategory = 'natural' | 'building' | 'decoration' | 'wool' | 'concrete' | 'special' | 'plants';
export type BlockSound = 'stone' | 'dirt' | 'grass' | 'wood' | 'glass' | 'sand' | 'cloth' | 'metal' | 'water' | 'plant' | 'gravel';

export interface BlockTiles {
  top?: string;
  bottom?: string;
  side?: string;
  north?: string;
  south?: string;
  east?: string;
  west?: string;
}

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  category: BlockCategory;
  render: 'cube' | 'cross' | 'liquid';
  solid: boolean;
  opaque: boolean;
  breakable: boolean;
  hardness: number;
  tiles: BlockTiles;
  mapColor: string;
  light: number;
  sound: BlockSound;
  drop?: string;
  description: string;
  /** Excluded from normal survival drops and not placeable from the inventory. */
  unlisted?: boolean;
}

interface BlockFaceTiles {
  top?: string;
  bottom?: string;
  north?: string;
  south?: string;
  east?: string;
  west?: string;
  color?: string;
  description?: string;
}

type BlockOptions = Partial<Omit<BlockDef, 'id' | 'key' | 'name' | 'category' | 'tiles' | 'render' | 'mapColor' | 'description'>> & BlockFaceTiles;

const defs: Array<Omit<BlockDef, 'id'> & { id?: number }> = [];

function cube(
  key: string,
  name: string,
  category: BlockCategory,
  side: string,
  opts: BlockOptions = {},
) {
  const { color = '#888888', top, bottom, north, south, east, west, description = '', ...rest } = opts;
  defs.push({
    key,
    name,
    category,
    render: 'cube',
    solid: true,
    opaque: true,
    breakable: true,
    hardness: 1,
    light: 0,
    sound: 'stone',
    ...rest,
    mapColor: color,
    description,
    tiles: {
      top: top ?? side,
      bottom: bottom ?? side,
      side,
      north,
      south,
      east,
      west,
    },
  });
}

function plant(
  key: string,
  name: string,
  tile: string,
  opts: BlockOptions & { color: string; description?: string },
) {
  const { color, description = '', ...rest } = opts;
  defs.push({
    key,
    name,
    category: 'plants',
    render: 'cross',
    solid: false,
    opaque: false,
    breakable: true,
    hardness: 0.05,
    light: 0,
    sound: 'plant',
    ...rest,
    mapColor: color,
    description,
    tiles: { side: tile, top: tile, bottom: tile },
  });
}

/* ------------------------------------------------------------------ */
/*  NATURAL                                                            */
/* ------------------------------------------------------------------ */
defs.push({
  key: 'air', name: 'Air', category: 'special', render: 'cube', solid: false, opaque: false,
  breakable: false, hardness: 0, tiles: {}, mapColor: '#000000', light: 0, sound: 'stone',
  description: 'Empty space.', unlisted: true,
});

cube('bedrock', 'Bedrock', 'natural', 'bedrock', { color: '#4a4a4a', hardness: 9999, breakable: false, sound: 'stone', unlisted: true, description: 'The unbreakable edge of the world.' });
cube('stone', 'Stone', 'natural', 'stone', { color: '#7d7d7d', hardness: 1.35, drop: 'cobblestone', sound: 'stone', description: 'Solid rock. Mine it for cobblestone.' });
cube('dirt', 'Dirt', 'natural', 'dirt', { color: '#79553a', hardness: 0.45, sound: 'dirt', description: 'Soft earth, perfect for building.' });
cube('grass_block', 'Grass Block', 'natural', 'grass_side', { top: 'grass_top', bottom: 'dirt', color: '#65a544', hardness: 0.55, sound: 'grass', drop: 'dirt', description: 'Dirt with a living green top.' });
cube('sand', 'Sand', 'natural', 'sand', { color: '#dcc88f', hardness: 0.4, sound: 'sand', description: 'Warm, fine-grained sand.' });
cube('sandstone', 'Sandstone', 'natural', 'sandstone_side', { top: 'sandstone_top', color: '#d8c58e', hardness: 0.9, sound: 'stone', description: 'Layered desert rock.' });
cube('gravel', 'Gravel', 'natural', 'gravel', { color: '#8a8580', hardness: 0.5, sound: 'gravel', description: 'Loose pebbles and stones.' });
cube('cobblestone', 'Cobblestone', 'building', 'cobblestone', { color: '#7b7b7b', hardness: 1.5, sound: 'stone', description: 'Rough, reliable building stone.' });
cube('oak_log', 'Oak Log', 'natural', 'oak_log_side', { top: 'oak_log_top', color: '#7d5f3b', hardness: 1.15, sound: 'wood', description: 'A sturdy oak log. Craft it into planks.' });
cube('oak_planks', 'Oak Planks', 'building', 'oak_planks', { color: '#b68a55', hardness: 0.85, sound: 'wood', description: 'Classic wooden planks.' });
cube('oak_leaves', 'Oak Leaves', 'natural', 'oak_leaves', { color: '#4f8a35', hardness: 0.25, sound: 'plant', description: 'A dense canopy of oak leaves.' });
cube('birch_log', 'Birch Log', 'natural', 'birch_log_side', { top: 'birch_log_top', color: '#d9d4c1', hardness: 1.1, sound: 'wood', description: 'Pale birch wood with dark flecks.' });
cube('birch_planks', 'Birch Planks', 'building', 'birch_planks', { color: '#d7c79e', hardness: 0.8, sound: 'wood', description: 'Light, clean birch planks.' });
cube('birch_leaves', 'Birch Leaves', 'natural', 'birch_leaves', { color: '#6da94a', hardness: 0.25, sound: 'plant', description: 'Bright, airy birch foliage.' });
cube('spruce_log', 'Spruce Log', 'natural', 'spruce_log_side', { top: 'spruce_log_top', color: '#5d432b', hardness: 1.2, sound: 'wood', description: 'Dark spruce timber.' });
cube('spruce_planks', 'Spruce Planks', 'building', 'spruce_planks', { color: '#86613d', hardness: 0.9, sound: 'wood', description: 'Rich, dark wooden planks.' });
cube('spruce_leaves', 'Spruce Leaves', 'natural', 'spruce_leaves', { color: '#3f6d3c', hardness: 0.25, sound: 'plant', description: 'Deep green evergreen needles.' });
cube('snow_block', 'Snow Block', 'natural', 'snow', { color: '#eef4f4', hardness: 0.35, sound: 'cloth', description: 'Packed, powdery snow.' });
cube('ice', 'Ice', 'natural', 'ice', { color: '#a9d7e8', hardness: 0.5, sound: 'glass', opaque: false, description: 'Slippery frozen water.' });
cube('coal_ore', 'Coal Ore', 'natural', 'coal_ore', { color: '#5f5f5f', hardness: 1.9, sound: 'stone', description: 'Stone studded with black coal.' });
cube('iron_ore', 'Iron Ore', 'natural', 'iron_ore', { color: '#7e7a70', hardness: 2.1, sound: 'stone', description: 'Rock veined with iron.' });
cube('gold_ore', 'Gold Ore', 'natural', 'gold_ore', { color: '#85806c', hardness: 2.3, sound: 'stone', description: 'Rock glittering with gold.' });
cube('diamond_ore', 'Diamond Ore', 'natural', 'diamond_ore', { color: '#70827d', hardness: 2.7, sound: 'stone', description: 'Precious blue diamonds in stone.' });
cube('redstone_ore', 'Redstone Ore', 'natural', 'redstone_ore', { color: '#756565', hardness: 2.1, sound: 'stone', description: 'A stone laced with glowing red dust.' });
cube('obsidian', 'Obsidian', 'natural', 'obsidian', { color: '#2b2138', hardness: 4.5, sound: 'stone', description: 'Volcanic glass, dark as night.' });
cube('clay', 'Clay', 'natural', 'clay', { color: '#9ea6ad', hardness: 0.5, sound: 'dirt', description: 'Smooth grey clay.' });
cube('terracotta', 'Terracotta', 'natural', 'terracotta', { color: '#a35f43', hardness: 1.2, sound: 'stone', description: 'Fired earthen clay.' });
cube('netherrack', 'Netherrack', 'natural', 'netherrack', { color: '#6d3030', hardness: 0.7, sound: 'stone', description: 'Porous crimson rock.' });
cube('magma', 'Magma Block', 'natural', 'magma', { color: '#913c1a', hardness: 1.2, sound: 'stone', light: 7, description: 'Cracked stone glowing with heat.' });
cube('mycelium', 'Mycelium', 'natural', 'mycelium_side', { top: 'mycelium_top', bottom: 'dirt', color: '#81657a', hardness: 0.55, sound: 'grass', drop: 'dirt', description: 'Dirt threaded with purple fungus.' });
cube('podzol', 'Podzol', 'natural', 'podzol_side', { top: 'podzol_top', bottom: 'dirt', color: '#8b5e33', hardness: 0.55, sound: 'grass', drop: 'dirt', description: 'Acidic forest soil.' });
cube('moss_block', 'Moss Block', 'natural', 'moss', { color: '#5c8f4a', hardness: 0.35, sound: 'plant', description: 'A soft cushion of green moss.' });
cube('dirt_path', 'Dirt Path', 'natural', 'dirt_path_side', { top: 'dirt_path_top', bottom: 'dirt', color: '#8c6f4e', hardness: 0.5, sound: 'dirt', drop: 'dirt', description: 'A well-trodden path.' });

/* ------------------------------------------------------------------ */
/*  LIQUIDS / GLASS                                                   */
/* ------------------------------------------------------------------ */
defs.push({
  key: 'water', name: 'Water', category: 'natural', render: 'liquid', solid: false, opaque: false,
  breakable: false, hardness: 0, mapColor: '#3f76d9', light: 0, sound: 'water',
  tiles: { top: 'water', bottom: 'water', side: 'water' }, description: 'Cool, clear water. Swim with Space.',
});
defs.push({
  key: 'lava', name: 'Lava', category: 'natural', render: 'liquid', solid: false, opaque: false,
  breakable: false, hardness: 0, mapColor: '#e05a15', light: 14, sound: 'water',
  tiles: { top: 'lava', bottom: 'lava', side: 'lava' }, description: 'Molten rock. Extremely hot.',
});
cube('glass', 'Glass', 'building', 'glass', { color: '#cfeaf0', hardness: 0.3, sound: 'glass', opaque: false, description: 'Clear panes of glass that let the light through.' });

/* ------------------------------------------------------------------ */
/*  BUILDING / SPECIAL                                                */
/* ------------------------------------------------------------------ */
cube('bricks', 'Bricks', 'building', 'bricks', { color: '#9e5945', hardness: 1.9, sound: 'stone', description: 'Traditional fired clay bricks.' });
cube('stone_bricks', 'Stone Bricks', 'building', 'stone_bricks', { color: '#8a8d8a', hardness: 1.7, sound: 'stone', description: 'Refined, masonry-cut stone.' });
cube('mossy_stone_bricks', 'Mossy Stone Bricks', 'building', 'mossy_stone_bricks', { color: '#77836b', hardness: 1.7, sound: 'stone', description: 'Ancient stone bricks with moss.' });
cube('glowstone', 'Glowstone', 'special', 'glowstone', { color: '#e8be64', hardness: 0.45, sound: 'glass', light: 15, description: 'A warm, glowing crystal block.' });
cube('bookshelf', 'Bookshelf', 'decoration', 'bookshelf', { top: 'oak_planks', bottom: 'oak_planks', color: '#9a7448', hardness: 0.9, sound: 'wood', description: 'Shelves packed with colorful books.' });
cube('crafting_table', 'Crafting Table', 'decoration', 'crafting_table_side', { top: 'crafting_table_top', bottom: 'oak_planks', color: '#a9794b', hardness: 1.1, sound: 'wood', description: 'A workbench for crafting every recipe.' });
cube('furnace', 'Furnace', 'decoration', 'furnace_side', { top: 'furnace_top', bottom: 'furnace_top', south: 'furnace_front', color: '#7b7d7d', hardness: 1.9, sound: 'stone', description: 'A stone furnace for smelting ore and cooking food.' });
cube('tnt', 'TNT', 'special', 'tnt_side', { top: 'tnt_top', bottom: 'tnt_bottom', color: '#c7483f', hardness: 0.3, sound: 'cloth', description: 'Unstable explosive. Handle with care.' });
cube('pumpkin', 'Pumpkin', 'decoration', 'pumpkin_side', { top: 'pumpkin_top', color: '#d98a33', hardness: 0.7, sound: 'wood', description: 'A carved pumpkin with a toothy grin.' });
cube('melon', 'Melon', 'decoration', 'melon_side', { top: 'melon_top', color: '#76a83e', hardness: 0.65, sound: 'grass', description: 'A heavy, striped melon.' });
cube('cactus', 'Cactus', 'natural', 'cactus_side', { top: 'cactus_top', bottom: 'cactus_top', color: '#4e8a3c', hardness: 0.5, sound: 'plant', description: 'A prickly desert cactus.' });
cube('quartz_block', 'Quartz Block', 'building', 'quartz', { color: '#e8e4dc', hardness: 1.4, sound: 'stone', description: 'Clean, bright quartz masonry.' });
cube('prismarine', 'Prismarine', 'building', 'prismarine', { color: '#5e9f96', hardness: 1.6, sound: 'stone', description: 'Ocean-worn aquamarine stone.' });
cube('wool_white', 'White Wool', 'wool', 'wool_white', { color: '#e9ecec', hardness: 0.5, sound: 'cloth', description: 'Soft white wool.' });
cube('wool_red', 'Red Wool', 'wool', 'wool_red', { color: '#b4443c', hardness: 0.5, sound: 'cloth', description: 'Soft crimson wool.' });
cube('wool_blue', 'Blue Wool', 'wool', 'wool_blue', { color: '#3f5fa8', hardness: 0.5, sound: 'cloth', description: 'Soft blue wool.' });
cube('wool_green', 'Green Wool', 'wool', 'wool_green', { color: '#4e7d3c', hardness: 0.5, sound: 'cloth', description: 'Soft forest-green wool.' });
cube('wool_yellow', 'Yellow Wool', 'wool', 'wool_yellow', { color: '#d8b64a', hardness: 0.5, sound: 'cloth', description: 'Soft golden wool.' });
cube('wool_black', 'Black Wool', 'wool', 'wool_black', { color: '#25272c', hardness: 0.5, sound: 'cloth', description: 'Soft charcoal wool.' });
cube('wool_orange', 'Orange Wool', 'wool', 'wool_orange', { color: '#cf7531', hardness: 0.5, sound: 'cloth', description: 'Soft pumpkin-orange wool.' });
cube('wool_purple', 'Purple Wool', 'wool', 'wool_purple', { color: '#7b4ca1', hardness: 0.5, sound: 'cloth', description: 'Soft royal-purple wool.' });
cube('wool_cyan', 'Cyan Wool', 'wool', 'wool_cyan', { color: '#3e9495', hardness: 0.5, sound: 'cloth', description: 'Soft teal wool.' });
cube('concrete_white', 'White Concrete', 'concrete', 'concrete_white', { color: '#e4e7e1', hardness: 1.2, sound: 'stone', description: 'Smooth modern white concrete.' });
cube('concrete_gray', 'Gray Concrete', 'concrete', 'concrete_gray', { color: '#7a7f83', hardness: 1.2, sound: 'stone', description: 'Smooth modern gray concrete.' });
cube('concrete_black', 'Black Concrete', 'concrete', 'concrete_black', { color: '#25292c', hardness: 1.2, sound: 'stone', description: 'Smooth modern black concrete.' });
cube('concrete_red', 'Red Concrete', 'concrete', 'concrete_red', { color: '#a53f3d', hardness: 1.2, sound: 'stone', description: 'Smooth modern red concrete.' });
cube('concrete_blue', 'Blue Concrete', 'concrete', 'concrete_blue', { color: '#3c5d9c', hardness: 1.2, sound: 'stone', description: 'Smooth modern blue concrete.' });
cube('concrete_green', 'Green Concrete', 'concrete', 'concrete_green', { color: '#4a7540', hardness: 1.2, sound: 'stone', description: 'Smooth modern green concrete.' });
cube('concrete_yellow', 'Yellow Concrete', 'concrete', 'concrete_yellow', { color: '#cfac3f', hardness: 1.2, sound: 'stone', description: 'Smooth modern yellow concrete.' });
cube('crystal_block', 'Crystal Block', 'special', 'crystal_block', { color: '#68e0d0', hardness: 1.4, sound: 'glass', light: 11, description: 'A luminous crystal block humming with energy.' });
cube('rune_block', 'Rune Block', 'special', 'rune_block', { color: '#6f52a3', hardness: 2, sound: 'stone', light: 8, description: 'Ancient stone inscribed with faint runes.' });
cube('chest', 'Chest', 'decoration', 'chest_side', { top: 'chest_top', south: 'chest_front', color: '#8d6837', hardness: 1, sound: 'wood', description: 'A sturdy storage chest.' });
cube('barrel', 'Barrel', 'decoration', 'barrel_side', { top: 'barrel_top', bottom: 'barrel_top', color: '#856336', hardness: 1, sound: 'wood', description: 'A banded wooden storage barrel.' });
cube('crate', 'Crate', 'decoration', 'crate', { color: '#a77f4d', hardness: 0.9, sound: 'wood', description: 'A rough wooden supply crate.' });
cube('hay_bale', 'Hay Bale', 'decoration', 'hay_side', { top: 'hay_top', bottom: 'hay_top', color: '#c9a849', hardness: 0.6, sound: 'grass', description: 'A tightly bound bale of hay.' });
cube('sponge', 'Sponge', 'decoration', 'sponge', { color: '#c5bc55', hardness: 0.6, sound: 'grass', description: 'A porous yellow sponge.' });

/* ------------------------------------------------------------------ */
/*  FARM FIXTURES AND CROPS                                           */
/* ------------------------------------------------------------------ */
cube('farmland', 'Farmland', 'natural', 'farmland_side', {
  top: 'farmland_top', bottom: 'dirt', color: '#5d3f28', hardness: 0.5, sound: 'dirt', drop: 'dirt',
  unlisted: true, description: 'Tilled soil, ready for seeds. Water nearby helps crops grow faster.',
});
cube('shipping_bin', 'Shipping Bin', 'decoration', 'shipping_bin_side', {
  top: 'shipping_bin_top', bottom: 'oak_planks', south: 'shipping_bin_front', color: '#8a6238', hardness: 1.0,
  sound: 'wood', description: 'A sturdy collection bin. Right-click with produce to sell it.',
});
cube('bed', 'Farm Bed', 'decoration', 'bed_side', {
  top: 'bed_top', bottom: 'oak_planks', color: '#b0443c', hardness: 0.7, sound: 'cloth',
  description: 'A warm bed. Right-click in the evening to sleep until morning.',
});

const CROP_STAGE_BLOCKS: Array<[string, string, string]> = [
  ['wheat', 'Wheat', '#7fa84a'],
  ['carrot', 'Carrot', '#6f9e42'],
  ['potato', 'Potato', '#5f9445'],
  ['tomato', 'Tomato', '#5c8f3f'],
];
for (const [crop, label, color] of CROP_STAGE_BLOCKS) {
  for (let stage = 0; stage < 3; stage++) {
    plant(`${crop}_crop_${stage}`, `${label} ${stage === 2 ? 'Crop' : 'Sprout'}`, `${crop}_crop_${stage}`, {
      color, unlisted: true, hardness: 0.03,
      description: stage === 2 ? `Ripe ${label.toLowerCase()}. Right-click to harvest.` : `A ${label.toLowerCase()} plant, still growing.`,
    });
  }
}
defs.push({
  key: 'torch', name: 'Torch', category: 'decoration', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#e6b450', light: 13, sound: 'plant',
  tiles: { side: 'torch', top: 'torch', bottom: 'torch' }, description: 'A flickering light for the dark.',
});
defs.push({
  key: 'tall_grass', name: 'Tall Grass', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#79a94e', light: 0, sound: 'plant',
  tiles: { side: 'tall_grass', top: 'tall_grass', bottom: 'tall_grass' }, description: 'Wild grass swaying in the breeze.',
});
defs.push({
  key: 'poppy', name: 'Poppy', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#c94b45', light: 0, sound: 'plant',
  tiles: { side: 'poppy', top: 'poppy', bottom: 'poppy' }, description: 'A bright red wildflower.',
});
defs.push({
  key: 'dandelion', name: 'Dandelion', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#d9c34a', light: 0, sound: 'plant',
  tiles: { side: 'dandelion', top: 'dandelion', bottom: 'dandelion' }, description: 'A cheerful yellow wildflower.',
});
defs.push({
  key: 'dead_bush', name: 'Dead Bush', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#8b6b3f', light: 0, sound: 'plant',
  tiles: { side: 'dead_bush', top: 'dead_bush', bottom: 'dead_bush' }, description: 'Dry, brittle branches.',
});
defs.push({
  key: 'mushroom_red', name: 'Red Mushroom', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#c7443d', light: 0, sound: 'plant',
  tiles: { side: 'mushroom_red', top: 'mushroom_red', bottom: 'mushroom_red' }, description: 'A spotted red mushroom.',
});
defs.push({
  key: 'mushroom_brown', name: 'Brown Mushroom', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.02, mapColor: '#a28661', light: 0, sound: 'plant',
  tiles: { side: 'mushroom_brown', top: 'mushroom_brown', bottom: 'mushroom_brown' }, description: 'A humble brown mushroom.',
});
defs.push({
  key: 'crystal_flower', name: 'Crystal Bloom', category: 'plants', render: 'cross', solid: false, opaque: false,
  breakable: true, hardness: 0.05, mapColor: '#79e6de', light: 8, sound: 'plant',
  tiles: { side: 'crystal_flower', top: 'crystal_flower', bottom: 'crystal_flower' }, description: 'A rare flower that glows with soft cyan light.',
});

/* ------------------------------------------------------------------ */
/*  KITCHEN, SHOP AND LUCKY FIXTURES                                  */
/* ------------------------------------------------------------------ */
cube('counter', 'Kitchen Counter', 'decoration', 'counter_side', {
  top: 'counter_top', bottom: 'oak_planks', color: '#b98a58', hardness: 1.1, sound: 'wood',
  description: 'A scrubbed wooden service counter. Stoves and dishes live here.',
});
cube('stove', 'Iron Stove', 'decoration', 'stove_side', {
  top: 'stove_top', bottom: 'stone', south: 'stove_front', color: '#6e7478', hardness: 2.1, sound: 'metal', light: 5,
  description: 'A hot iron range. Interact to cook a dish from the pantry.',
});
cube('store_shelf', 'Shop Shelf', 'decoration', 'store_shelf_side', {
  top: 'store_shelf_top', bottom: 'oak_planks', color: '#9d7444', hardness: 1.0, sound: 'wood',
  description: 'A stocked display shelf. Interact to restock the shop.',
});
cube('chalkboard', 'Chalkboard', 'decoration', 'chalkboard', {
  top: 'oak_planks', bottom: 'oak_planks', color: '#31403a', hardness: 1.0, sound: 'wood',
  description: 'Today\'s specials, chalked up for the whole street to see.',
});
cube('gold_block', 'Block of Gold', 'building', 'gold_block', {
  color: '#f2c94c', hardness: 2.4, sound: 'metal', description: 'Nine ingots pressed into one heavy, gleaming block.',
});
cube('lucky_block', 'Lucky Block', 'special', 'lucky_block', {
  color: '#e8b93f', hardness: 0.55, sound: 'glass', light: 7,
  description: 'A golden question block. Break it for a surprise. Usually a good one.',
});
cube('cursed_lucky_block', 'Cursed Lucky Block', 'special', 'cursed_lucky_block', {
  color: '#7b3fa8', hardness: 0.55, sound: 'glass', light: 4,
  description: 'A purple question block that whispers bad ideas. Break it anyway.',
});

/* ------------------------------------------------------------------ */
/*  STORM AND SIEGE FIXTURES                                          */
/* ------------------------------------------------------------------ */
cube('supply_cache', 'Supply Cache', 'special', 'supply_cache', {
  top: 'supply_cache_top', color: '#3f7684', hardness: 0.8, sound: 'metal', light: 3,
  description: 'A sealed drop crate. Right-click to crack it open for weapons, coins and storm shards.',
});
cube('siege_core', 'Ember Core', 'special', 'siege_core', {
  color: '#d8752f', hardness: 9999, breakable: false, sound: 'glass', light: 12, unlisted: true,
  description: 'The burning heart of Emberhold. Keep it alive.',
});
cube('siege_turret', 'Siege Turret', 'special', 'siege_turret', {
  top: 'siege_turret_top', color: '#66737c', hardness: 9999, breakable: false, sound: 'metal', light: 4, unlisted: true,
  description: 'A clockwork ballista. Right-click to upgrade its damage and range.',
});

/* ------------------------------------------------------------------ */
/*  HOLLOWWATCH TOWER DEFENSE FIXTURES                                */
/* ------------------------------------------------------------------ */
cube('hollow_gate', 'Hollow Gate', 'special', 'hollow_gate', {
  color: '#4b3a63', hardness: 9999, breakable: false, sound: 'metal', light: 8, unlisted: true,
  description: 'The warded gate between the moor and the village. Keep it standing.',
});
cube('tower_pad', 'Tower Pad', 'special', 'tower_pad', {
  color: '#6d6a58', hardness: 9999, breakable: false, sound: 'stone', light: 3, unlisted: true,
  description: 'A rune-cut socket. Place a tower block on it to raise a defender.',
});
cube('lantern_tower', 'Lantern Tower', 'special', 'lantern_tower', {
  color: '#e2b65a', hardness: 1.8, sound: 'metal', light: 11,
  description: 'A fast lantern ballista. Right-click the tower to upgrade it.',
});
cube('frost_tower', 'Frost Tower', 'special', 'frost_tower', {
  color: '#7fd6e8', hardness: 1.8, sound: 'glass', light: 8,
  description: 'A crystal spire that chills the hollow. Slows whatever it hits.',
});
cube('mortar_tower', 'Mortar Tower', 'special', 'mortar_tower', {
  color: '#8c5a3c', hardness: 1.8, sound: 'metal', light: 5,
  description: 'A squat iron mortar. Slow, splashy and very loud.',
});

/* ------------------------------------------------------------------ */
/*  DEADLIGHT CHAPEL SIEGE                                            */
/* ------------------------------------------------------------------ */
cube('deadlight_barricade', 'Barricade', 'special', 'deadlight_barricade', {
  color: '#7a5432', hardness: 2.2, sound: 'wood', drop: 'none', unlisted: true,
  description: 'Nailed boards over a chapel window. Right-click to repair the breach.',
});
cube('deadlight_armory', 'Armory Crate', 'special', 'deadlight_armory', {
  color: '#44503c', hardness: 2.6, sound: 'metal', drop: 'none', unlisted: true, light: 4, breakable: false,
  description: 'A wall-mounted rifle rack. Right-click to buy a weapon or ammunition.',
});
cube('deadlight_perk', 'Perk Machine', 'special', 'deadlight_perk', {
  color: '#5a3f74', hardness: 2.6, sound: 'metal', drop: 'none', unlisted: true, light: 6, breakable: false,
  description: 'A humming elixir cabinet. Right-click to buy a perk.',
});

/* ------------------------------------------------------------------ */
/*  CRUMBLE PARTY FLOOR                                               */
/* ------------------------------------------------------------------ */
cube('crumble_tile', 'Crumble Tile', 'special', 'crumble_tile', {
  color: '#e6cfa6', hardness: 0.18, sound: 'cloth', drop: 'none', unlisted: true,
  description: 'A painted festival tile. It cracks the moment you stand on it.',
});
cube('crumble_tile_alt', 'Teal Crumble Tile', 'special', 'crumble_tile_alt', {
  color: '#9fd8c8', hardness: 0.18, sound: 'cloth', drop: 'none', unlisted: true,
  description: 'A teal festival tile. It cracks just as fast as the cream ones.',
});
cube('crumble_cracked', 'Cracked Tile', 'special', 'crumble_cracked', {
  color: '#c2ad8e', hardness: 0.12, sound: 'cloth', drop: 'none', unlisted: true,
  description: 'A floor tile on its last legs. Move.',
});

/* ------------------------------------------------------------------ */
/*  TITAN TRIALS FORGE                                                */
/* ------------------------------------------------------------------ */
cube('titan_anvil', 'Titan Anvil', 'special', 'titan_anvil', {
  color: '#6f7a84', hardness: 9999, breakable: false, sound: 'metal', drop: 'none', unlisted: true, light: 3,
  description: 'A colossal anvil humming with old heat. Right-click to buy titan-slaying steel.',
});
cube('titan_hearth', 'Trial Hearth', 'special', 'titan_hearth', {
  color: '#c96a2e', hardness: 9999, breakable: false, sound: 'stone', drop: 'none', unlisted: true, light: 12,
  description: 'The arena hearth. Right-click to rest, heal, and stock up on golden apples.',
});
cube('titan_obelisk', 'Titan Obelisk', 'special', 'titan_obelisk', {
  color: '#5a4f8a', hardness: 9999, breakable: false, sound: 'stone', drop: 'none', unlisted: true, light: 9,
  description: 'A rune-carved obelisk that trades coins for permanent strength.',
});

export const BLOCKS: BlockDef[] = defs.map((d, i) => ({ ...d, id: i } as BlockDef));
export const AIR = BLOCKS[0];
export const BLOCK_BY_KEY = new Map(BLOCKS.map((b) => [b.key, b]));
export const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));

export function block(key: string): BlockDef {
  const b = BLOCK_BY_KEY.get(key);
  if (!b) throw new Error(`Unknown block: ${key}`);
  return b;
}

export function blockById(id: number): BlockDef {
  return BLOCK_BY_ID.get(id) ?? AIR;
}

/**
 * Flat lookup tables indexed by block id. The block registry is static (ids are
 * dense 0..n-1), so the hot paths (meshing, lighting, physics, raycasts) read
 * these typed arrays instead of doing a Map lookup per voxel.
 */
const TABLE_SIZE = BLOCKS.length;
export const OPAQUE_TABLE = new Uint8Array(TABLE_SIZE);
export const SOLID_TABLE = new Uint8Array(TABLE_SIZE);
/** 0 = cube, 1 = cross (plants), 2 = liquid. */
export const RENDER_TABLE = new Uint8Array(TABLE_SIZE);
export const RENDER_CUBE = 0;
export const RENDER_CROSS = 1;
export const RENDER_LIQUID = 2;
/** Light emitted by each block, clamped to 0..15. */
export const EMIT_TABLE = new Uint8Array(TABLE_SIZE);
for (const b of BLOCKS) {
  OPAQUE_TABLE[b.id] = b.opaque ? 1 : 0;
  SOLID_TABLE[b.id] = b.solid ? 1 : 0;
  RENDER_TABLE[b.id] = b.render === 'cross' ? RENDER_CROSS : b.render === 'liquid' ? RENDER_LIQUID : RENDER_CUBE;
  EMIT_TABLE[b.id] = Math.max(0, Math.min(15, Math.floor(b.light || 0)));
}

export function isSolidId(id: number): boolean {
  return id >= 0 && id < TABLE_SIZE && SOLID_TABLE[id] === 1;
}
export function isOpaqueId(id: number): boolean {
  return id >= 0 && id < TABLE_SIZE && OPAQUE_TABLE[id] === 1;
}
export function isLiquidId(id: number): boolean {
  return id >= 0 && id < TABLE_SIZE && RENDER_TABLE[id] === RENDER_LIQUID;
}
export function isCrossId(id: number): boolean {
  return id >= 0 && id < TABLE_SIZE && RENDER_TABLE[id] === RENDER_CROSS;
}
export function isTransparentId(id: number): boolean {
  return !isOpaqueId(id);
}
/** Light (0..15) emitted by a block id. */
export function emissionOf(id: number): number {
  return id >= 0 && id < TABLE_SIZE ? EMIT_TABLE[id] : 0;
}

export const BLOCK_CATEGORIES: Array<{ id: string; label: string; icon: string }> = [
  { id: 'all', label: 'All Blocks', icon: '▦' },
  { id: 'natural', label: 'Natural', icon: '⛰' },
  { id: 'building', label: 'Building', icon: '▥' },
  { id: 'decoration', label: 'Decoration', icon: '❖' },
  { id: 'wool', label: 'Wool', icon: '◼' },
  { id: 'concrete', label: 'Concrete', icon: '▩' },
  { id: 'plants', label: 'Plants', icon: '❧' },
  { id: 'special', label: 'Special', icon: '✦' },
];

/** Collect every unique tile name used by a block. */
export function collectTileNames(): string[] {
  const set = new Set<string>();
  for (const b of BLOCKS) {
    for (const value of Object.values(b.tiles)) {
      if (value) set.add(value);
    }
  }
  set.add('missing');
  return [...set].sort();
}
