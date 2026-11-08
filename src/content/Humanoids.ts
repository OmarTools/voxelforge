import type { BBModel } from '../engine/blockbench/BBModel';
import { mulberry32 } from '../engine/core/Noise';
import { shadeHex } from '../engine/core/Utils';
import { ModelBuilder } from './ModelBuilder';
import {
  paintBodyShirt,
  paintFabric,
  paintFace,
  paintFur,
  paintGold,
  paintHair,
  paintHood,
  paintLeather,
  paintMetal,
  paintPants,
  paintRune,
  paintSkin,
  paintSleeve,
  paintWood,
  paintGlow,
  paintCloth,
} from './TextureSheet';

export type BodyType = 'standard' | 'slim' | 'dwarf' | 'orc' | 'elf' | 'hero' | 'skeleton' | 'robot' | 'ghost' | 'bulky';
export type Headgear = 'none' | 'helmet' | 'wizard' | 'hood' | 'crown' | 'straw' | 'tricorn' | 'pith' | 'turban' | 'horns' | 'halo' | 'beanie' | 'antlers';
export type WeaponKind = 'none' | 'sword' | 'staff' | 'bow' | 'axe' | 'spear' | 'hammer' | 'cutlass' | 'katana' | 'scepter' | 'mace' | 'lantern' | 'cleaver' | 'rifle';

export interface HumanoidSpec {
  key: string;
  name: string;
  role: string;
  body: BodyType;
  skin: string;
  hair: string;
  hairStyle?: 'short' | 'long' | 'bald' | 'helmet' | 'hood' | 'hat';
  eyes?: 'normal' | 'zombie' | 'skeleton' | 'robot' | 'ninja' | 'glow' | 'sleepy';
  eyeColor?: string;
  mouth?: string;
  beard?: string;
  shirt: string;
  accent: string;
  pants: string;
  boots: string;
  outfit?: 'plain' | 'tunic' | 'armor' | 'robe' | 'torn';
  sleeveStyle?: 'plain' | 'stripes' | 'torn' | 'grid' | 'armor' | 'robe';
  headgear?: Headgear;
  headgearColor?: string;
  helmetMetal?: string;
  cape?: string;
  capeColor?: string;
  shoulder?: boolean;
  shoulderColor?: string;
  backpack?: boolean;
  robe?: boolean;
  weapon?: WeaponKind;
  shield?: boolean;
  mask?: boolean;
  ears?: boolean;
  horns?: boolean;
  glow?: string;
  tags: string[];
}

const PALETTE = {
  steel: '#8b99a8',
  darkSteel: '#596675',
  gold: '#e1b84c',
  leather: '#74502f',
  darkLeather: '#49331f',
  wood: '#8d6538',
  bone: '#d8d2bd',
  void: '#3a2a56',
  ember: '#b6482f',
  forest: '#446d3a',
  ice: '#9bc9db',
  royal: '#4b3d8f',
  white: '#e7e4d8',
  red: '#a33b3b',
  teal: '#2f8b86',
};

export const HUMANOIDS: HumanoidSpec[] = [
  {
    key: 'adventurer', name: 'Rowan the Wanderer', role: 'Adventurer', body: 'hero',
    skin: '#c98f63', hair: '#5a3b24', hairStyle: 'short', eyes: 'normal', eyeColor: '#3b5f46',
    shirt: '#2f8b86', accent: '#e1b84c', pants: '#3f577a', boots: '#4a3424', outfit: 'tunic',
    headgear: 'none', weapon: 'sword', backpack: true,
    tags: ['hero', 'starter', 'balanced'],
  },
  {
    key: 'ranger_alex', name: 'Alex Thorn', role: 'Ranger', body: 'slim',
    skin: '#d8a577', hair: '#b56535', hairStyle: 'short', eyes: 'normal', eyeColor: '#4d6f3b',
    shirt: '#4b7a45', accent: '#8b6534', pants: '#5b4630', boots: '#3d2d1e', outfit: 'tunic',
    headgear: 'hood', headgearColor: '#3f6639', weapon: 'bow', backpack: true,
    tags: ['ranged', 'scout', 'nature'],
  },
  {
    key: 'knight_royal', name: 'Sir Gareth', role: 'Royal Knight', body: 'bulky',
    skin: '#c28b63', hair: '#42352b', hairStyle: 'short', eyes: 'normal', eyeColor: '#3d5a74',
    shirt: '#7f8d9b', accent: '#d4ae55', pants: '#5a6572', boots: '#3e4852', outfit: 'armor',
    headgear: 'helmet', helmetMetal: '#8997a5', shoulder: true, shoulderColor: '#98a5b0',
    cape: 'royal', capeColor: '#7d2e36', weapon: 'sword', shield: true,
    tags: ['tank', 'melee', 'royal'],
  },
  {
    key: 'mage_arcane', name: 'Elara the Arcane', role: 'Arcane Mage', body: 'standard',
    skin: '#d9a77d', hair: '#ded7cd', hairStyle: 'long', eyes: 'glow', eyeColor: '#88e7ff',
    shirt: '#4b3d8f', accent: '#d8b45a', pants: '#38305e', boots: '#2d2645', outfit: 'robe', sleeveStyle: 'robe',
    headgear: 'wizard', headgearColor: '#4b3d8f', weapon: 'staff', glow: '#89e8ff', robe: true,
    tags: ['magic', 'ranged', 'scholar'],
  },
  {
    key: 'rogue_shadow', name: 'Nyx', role: 'Shadow Rogue', body: 'slim',
    skin: '#b9855f', hair: '#25262d', hairStyle: 'hood', eyes: 'ninja', eyeColor: '#c5d26a', mask: true,
    shirt: '#2d3138', accent: '#8a9c4b', pants: '#24272c', boots: '#191b1f', outfit: 'torn', sleeveStyle: 'torn',
    headgear: 'hood', headgearColor: '#24272c', weapon: 'katana', backpack: false,
    tags: ['stealth', 'agile', 'melee'],
  },
  {
    key: 'dwarf_smith', name: 'Brokk Emberhand', role: 'Dwarven Smith', body: 'dwarf',
    skin: '#c08a5b', hair: '#9c4a24', hairStyle: 'short', eyes: 'sleepy', eyeColor: '#57432e', beard: '#9c4a24',
    shirt: '#79502f', accent: '#8b99a8', pants: '#4b3826', boots: '#332519', outfit: 'torn',
    headgear: 'beanie', headgearColor: '#5a3a24', weapon: 'hammer', backpack: true, shoulder: true, shoulderColor: '#7b5738',
    tags: ['builder', 'crafter', 'melee'],
  },
  {
    key: 'elf_archer', name: 'Liriel Swiftwind', role: 'Elven Archer', body: 'elf',
    skin: '#e0b58a', hair: '#c8b06a', hairStyle: 'long', eyes: 'glow', eyeColor: '#8fd46a',
    shirt: '#3b6b4a', accent: '#d5bd68', pants: '#4a5e37', boots: '#35472a', outfit: 'tunic',
    headgear: 'none', ears: true, weapon: 'bow', cape: 'forest', capeColor: '#315c3c',
    tags: ['ranged', 'agile', 'nature'],
  },
  {
    key: 'orc_brute', name: 'Grommash', role: 'Orc Brute', body: 'orc',
    skin: '#6f9a4c', hair: '#2e2924', hairStyle: 'bald', eyes: 'glow', eyeColor: '#d6753a',
    shirt: '#59452f', accent: '#a55b34', pants: '#453728', boots: '#30261c', outfit: 'torn',
    headgear: 'none', horns: true, shoulder: true, shoulderColor: '#5a4732', weapon: 'axe',
    tags: ['brute', 'melee', 'hostile'],
  },
  {
    key: 'villager_farmer', name: 'Thomas Greenfield', role: 'Farmer', body: 'standard',
    skin: '#c9986c', hair: '#74543a', hairStyle: 'short', eyes: 'sleepy', eyeColor: '#4f3b2b',
    shirt: '#6f5b3b', accent: '#a58a5f', pants: '#534530', boots: '#3a2d1f', outfit: 'tunic',
    headgear: 'straw', weapon: 'none',
    tags: ['npc', 'villager', 'friendly'],
  },
  {
    key: 'villager_seed_merchant', name: 'Marigold Thistle', role: 'Seed Keeper', body: 'standard',
    skin: '#d3a377', hair: '#a85d33', hairStyle: 'long', eyes: 'normal', eyeColor: '#4c6b3b',
    shirt: '#54703e', accent: '#d9b25f', pants: '#594830', boots: '#3c2e20', outfit: 'tunic',
    headgear: 'straw', headgearColor: '#d9b25f', backpack: true, weapon: 'none',
    tags: ['npc', 'villager', 'friendly', 'merchant'],
  },
  {
    key: 'villager_blacksmith', name: 'Marta Ironhall', role: 'Blacksmith', body: 'bulky',
    skin: '#a8754f', hair: '#49372b', hairStyle: 'long', eyes: 'normal', eyeColor: '#4d3729',
    shirt: '#57422e', accent: '#8b99a8', pants: '#453826', boots: '#2d2419', outfit: 'torn',
    headgear: 'none', weapon: 'hammer', backpack: false,
    tags: ['npc', 'villager', 'crafter'],
  },
  {
    key: 'priest_light', name: 'Brother Alden', role: 'Priest of Light', body: 'standard',
    skin: '#d1a278', hair: '#a0937f', hairStyle: 'short', eyes: 'normal', eyeColor: '#66839a',
    shirt: '#ddd8c7', accent: '#d8b45a', pants: '#b7ae96', boots: '#847b66', outfit: 'robe', sleeveStyle: 'robe',
    headgear: 'halo', weapon: 'staff', glow: '#ffe6a0', robe: true,
    tags: ['npc', 'healer', 'holy'],
  },
  {
    key: 'necromancer', name: 'Corvus the Pale', role: 'Necromancer', body: 'slim',
    skin: '#b7b29f', hair: '#22221f', hairStyle: 'bald', eyes: 'glow', eyeColor: '#b6f0a0',
    shirt: '#2e3240', accent: '#7a8f5a', pants: '#252833', boots: '#1c1f27', outfit: 'robe', sleeveStyle: 'torn',
    headgear: 'hood', headgearColor: '#262a35', weapon: 'staff', glow: '#a8ed8b', robe: true,
    tags: ['villain', 'magic', 'undead'],
  },
  {
    key: 'pirate_captain', name: 'Captain Rook', role: 'Pirate Captain', body: 'hero',
    skin: '#b97f56', hair: '#2d241e', hairStyle: 'long', eyes: 'normal', eyeColor: '#354d3d',
    shirt: '#8c3232', accent: '#d6b050', pants: '#3c3a3c', boots: '#28221d', outfit: 'tunic',
    headgear: 'tricorn', headgearColor: '#2a2730', cape: 'royal', capeColor: '#5c2424', weapon: 'cutlass',
    tags: ['melee', 'rogue', 'sea'],
  },
  {
    key: 'ninja_ember', name: 'Kaze', role: 'Ember Ninja', body: 'slim',
    skin: '#c38e62', hair: '#211e20', hairStyle: 'hood', eyes: 'ninja', eyeColor: '#f0d06c', mask: true,
    shirt: '#29262b', accent: '#b6482f', pants: '#232126', boots: '#171619', outfit: 'plain', sleeveStyle: 'torn',
    headgear: 'hood', headgearColor: '#211f23', weapon: 'katana',
    tags: ['stealth', 'melee', 'agile'],
  },
  {
    key: 'explorer_jungle', name: 'Indiana Flint', role: 'Explorer', body: 'hero',
    skin: '#ca9a70', hair: '#6e4b2d', hairStyle: 'short', eyes: 'normal', eyeColor: '#435a42',
    shirt: '#a08b63', accent: '#6c5738', pants: '#6f5c3f', boots: '#443521', outfit: 'tunic',
    headgear: 'pith', headgearColor: '#b8a275', weapon: 'cutlass', backpack: true,
    tags: ['explorer', 'melee', 'jungle'],
  },
  {
    key: 'king_gold', name: 'King Aldric', role: 'The Golden King', body: 'standard',
    skin: '#d0a077', hair: '#b6a58d', hairStyle: 'long', eyes: 'normal', eyeColor: '#4b5f70',
    shirt: '#5b3f85', accent: '#e1b84c', pants: '#3f315a', boots: '#2e2442', outfit: 'robe', sleeveStyle: 'robe',
    headgear: 'crown', cape: 'royal', capeColor: '#7b2c37', weapon: 'scepter', glow: '#ffe29a', robe: true,
    tags: ['npc', 'royal', 'quest'],
  },
  {
    key: 'robot_sentinel', name: 'Sentinel-7', role: 'Clockwork Sentinel', body: 'robot',
    skin: '#8d99a2', hair: '#59636b', hairStyle: 'bald', eyes: 'robot', eyeColor: '#66eaff',
    shirt: '#64717a', accent: '#d3a746', pants: '#4a545c', boots: '#394147', outfit: 'armor', sleeveStyle: 'armor',
    headgear: 'none', shoulder: true, shoulderColor: '#7b8790', glow: '#66eaff',
    tags: ['robot', 'construct', 'hostile'],
  },
  {
    key: 'skeleton_warrior', name: 'Boneguard', role: 'Skeleton Warrior', body: 'skeleton',
    skin: '#d1cab4', hair: '#b9b29c', hairStyle: 'bald', eyes: 'skeleton',
    shirt: '#8f8c7f', accent: '#6d6a5f', pants: '#77746a', boots: '#5c594f', outfit: 'torn', sleeveStyle: 'torn',
    headgear: 'helmet', helmetMetal: '#6c7077', weapon: 'sword', shield: true,
    tags: ['undead', 'hostile', 'melee'],
  },
  {
    key: 'zombie_walker', name: 'Restless Dead', role: 'Zombie', body: 'standard',
    skin: '#708b59', hair: '#38432c', hairStyle: 'short', eyes: 'zombie', eyeColor: '#b8c56a',
    shirt: '#41706a', accent: '#5c4a3a', pants: '#4d4861', boots: '#38313e', outfit: 'torn', sleeveStyle: 'torn',
    headgear: 'none', weapon: 'none',
    tags: ['undead', 'hostile', 'melee'],
  },
  {
    key: 'ghost_wisp', name: 'Pale Wisp', role: 'Wandering Spirit', body: 'ghost',
    skin: '#c7d4d4', hair: '#aebfc0', hairStyle: 'long', eyes: 'glow', eyeColor: '#b8ffff',
    shirt: '#aabcc1', accent: '#d8e6e2', pants: '#9cb0b6', boots: '#889aa0', outfit: 'robe', sleeveStyle: 'robe',
    headgear: 'none', glow: '#b5ffff', robe: true, weapon: 'lantern',
    tags: ['spirit', 'neutral', 'spooky'],
  },
  {
    key: 'cultist_void', name: 'Void Cultist', role: 'Cultist', body: 'standard',
    skin: '#a29083', hair: '#2a2233', hairStyle: 'hood', eyes: 'glow', eyeColor: '#d78cff',
    shirt: '#342448', accent: '#7c5ab0', pants: '#28203a', boots: '#1e182c', outfit: 'robe', sleeveStyle: 'robe',
    headgear: 'hood', headgearColor: '#2a203a', weapon: 'staff', glow: '#d28cff', robe: true,
    tags: ['villain', 'magic', 'void'],
  },
  {
    key: 'bard_wanderer', name: 'Filo Brightnote', role: 'Wandering Bard', body: 'slim',
    skin: '#d6a77d', hair: '#b6703c', hairStyle: 'long', eyes: 'normal', eyeColor: '#547164',
    shirt: '#7a3f63', accent: '#d8b45a', pants: '#4a3d5c', boots: '#352a3f', outfit: 'tunic',
    headgear: 'beanie', headgearColor: '#6a3457', cape: 'royal', capeColor: '#5f2f50', weapon: 'none', backpack: true,
    tags: ['npc', 'friendly', 'music'],
  },
  {
    key: 'chef_inn', name: 'Berta Loaf', role: 'Innkeeper', body: 'standard',
    skin: '#ca9468', hair: '#7d5a3a', hairStyle: 'short', eyes: 'sleepy', eyeColor: '#4e3a29',
    shirt: '#d9d2c1', accent: '#b9aa90', pants: '#6f5a43', boots: '#4a3a2b', outfit: 'tunic',
    headgear: 'beanie', headgearColor: '#e6dfce', weapon: 'cleaver',
    tags: ['npc', 'villager', 'food'],
  },
  {
    key: 'guard_city', name: 'City Watch', role: 'Guard', body: 'bulky',
    skin: '#bb875e', hair: '#4b3a2c', hairStyle: 'short', eyes: 'normal', eyeColor: '#465a6b',
    shirt: '#6e7c88', accent: '#b99b58', pants: '#505b66', boots: '#373f47', outfit: 'armor',
    headgear: 'helmet', helmetMetal: '#737f8a', shoulder: true, shoulderColor: '#818d97', weapon: 'spear',
    tags: ['npc', 'guard', 'melee'],
  },
  {
    key: 'bandit_road', name: 'Road Bandit', role: 'Bandit', body: 'hero',
    skin: '#b47f57', hair: '#322820', hairStyle: 'short', eyes: 'normal', eyeColor: '#56402f',
    shirt: '#5b4432', accent: '#8f3f32', pants: '#463728', boots: '#2f251b', outfit: 'torn', sleeveStyle: 'torn',
    headgear: 'hood', headgearColor: '#3b3027', weapon: 'axe', mask: true,
    tags: ['hostile', 'bandit', 'melee'],
  },
  {
    key: 'snow_hunter', name: 'Frost Hunter', role: 'Hunter', body: 'standard',
    skin: '#d2a57c', hair: '#d8d2c4', hairStyle: 'long', eyes: 'normal', eyeColor: '#5d7d8b',
    shirt: '#8d9aa2', accent: '#d8e2e6', pants: '#5c6b74', boots: '#46525a', outfit: 'tunic',
    headgear: 'hood', headgearColor: '#c7cfd2', weapon: 'bow', cape: 'snow', capeColor: '#b9c6cc',
    tags: ['ranged', 'snow', 'hunter'],
  },
  {
    key: 'desert_nomad', name: 'Sahir the Wayfarer', role: 'Nomad', body: 'standard',
    skin: '#b98257', hair: '#42332a', hairStyle: 'hood', eyes: 'normal', eyeColor: '#4e3a2a', beard: '#42332a',
    shirt: '#b99a68', accent: '#7c5e3b', pants: '#8f7650', boots: '#5a4630', outfit: 'robe', sleeveStyle: 'robe',
    headgear: 'turban', headgearColor: '#d0b985', weapon: 'staff', robe: true,
    tags: ['npc', 'desert', 'wanderer'],
  },
  {
    key: 'soldier_rifle', name: 'Ironhold Rifleman', role: 'Rifleman', body: 'bulky',
    skin: '#b9875f', hair: '#3b3229', hairStyle: 'helmet', eyes: 'normal', eyeColor: '#46504a',
    shirt: '#4e5c3f', accent: '#c2a24a', pants: '#3c4636', boots: '#2a2d28', outfit: 'armor', sleeveStyle: 'armor',
    headgear: 'helmet', helmetMetal: '#5d6b52', shoulder: true, shoulderColor: '#59684d', weapon: 'rifle',
    tags: ['hostile', 'soldier', 'ranged', 'army'],
  },
  {
    key: 'soldier_heavy', name: 'Ironhold Breacher', role: 'Heavy Trooper', body: 'bulky',
    skin: '#a97854', hair: '#29241f', hairStyle: 'helmet', eyes: 'normal', eyeColor: '#3d4540',
    shirt: '#343a34', accent: '#8f3f32', pants: '#2b302b', boots: '#1e211e', outfit: 'armor', sleeveStyle: 'armor',
    headgear: 'helmet', helmetMetal: '#3e4740', shoulder: true, shoulderColor: '#4c554a', weapon: 'rifle',
    tags: ['hostile', 'soldier', 'heavy', 'army'],
  },
  {
    key: 'commander_iron', name: 'Colonel Varga', role: 'Base Commander', body: 'bulky',
    skin: '#c08c62', hair: '#2f2a24', hairStyle: 'helmet', eyes: 'glow', eyeColor: '#d45b43',
    shirt: '#2f3b33', accent: '#d4a640', pants: '#242b26', boots: '#171a17', outfit: 'armor', sleeveStyle: 'armor',
    headgear: 'helmet', helmetMetal: '#67725f', shoulder: true, shoulderColor: '#7a856f', weapon: 'rifle',
    cape: 'royal', capeColor: '#7d2e36',
    tags: ['hostile', 'soldier', 'boss', 'army'],
  },
  {
    key: 'captain_steel', name: 'Captain Reyes', role: 'Ally Commander', body: 'hero',
    skin: '#b07a52', hair: '#40342a', hairStyle: 'short', eyes: 'normal', eyeColor: '#405b4d',
    shirt: '#5d6e4c', accent: '#d6b45c', pants: '#454f3c', boots: '#2e332b', outfit: 'armor',
    headgear: 'helmet', helmetMetal: '#77846a', shoulder: true, shoulderColor: '#6c7a60', weapon: 'rifle',
    tags: ['npc', 'ally', 'soldier', 'army'],
  },
];

export const HUMANOID_BY_KEY = new Map(HUMANOIDS.map((h) => [h.key, h]));

const cache = new Map<string, BBModel>();

function headSidePainter(skin: string, hair: string, seed: number) {
  return (ctx: CanvasRenderingContext2D) => {
    paintSkin(skin, seed)(ctx);
    ctx.fillStyle = hair;
    ctx.fillRect(0, 0, 16, 4);
    for (let x = 0; x < 16; x += 2) {
      const r = mulberry32(seed + 90 + x)();
      ctx.fillRect(x, 3, 2, 1 + Math.floor(r * 2));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(12, 5, 2, 6);
  };
}

function paintRibs(base: string, dark: string) {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = dark;
    ctx.fillRect(7, 1, 2, 14);
    for (let y = 3; y < 14; y += 3) {
      ctx.fillRect(2, y, 12, 1);
      ctx.fillStyle = shadeHex(base, 0.16);
      ctx.fillRect(2, y + 1, 10, 1);
      ctx.fillStyle = dark;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(2, 1, 4, 1);
  };
}

function paintStraw(color: string) {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = shadeHex(color, -0.2);
    for (let y = 2; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let x = 1; x < 16; x += 3) ctx.fillRect(x, 0, 1, 16);
  };
}

function paintTricorn(color: string) {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = shadeHex(color, -0.32);
    ctx.fillRect(0, 12, 16, 2);
    ctx.fillStyle = '#d6b050';
    ctx.fillRect(0, 9, 16, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(2, 2, 4, 1);
  };
}

function paintTurban(color: string) {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      ctx.fillStyle = shadeHex(color, y % 8 === 0 ? -0.16 : 0.08);
      ctx.fillRect(0, y, 16, 2);
    }
    ctx.fillStyle = '#c9ad62';
    ctx.fillRect(7, 0, 2, 16);
    ctx.fillStyle = '#6d4b2a';
    ctx.fillRect(6, 7, 4, 3);
  };
}

function paintCrown(ctx: CanvasRenderingContext2D) {
  paintGold()(ctx);
  ctx.fillStyle = '#74d8e8';
  ctx.fillRect(3, 6, 3, 3);
  ctx.fillRect(10, 6, 3, 3);
  ctx.fillStyle = '#b8385a';
  ctx.fillRect(7, 8, 2, 3);
}

function buildWeapon(b: ModelBuilder, weapon: WeaponKind, side: 'right' | 'left', hand: [number, number, number], metal: string, wood: string, accent: string, glow: string) {
  const [hx, hy] = hand;
  const s = side === 'right' ? -1 : 1;
  switch (weapon) {
    case 'sword':
    case 'cutlass':
    case 'katana': {
      const wide = weapon === 'cutlass' ? 0.55 : 0.32;
      const len = weapon === 'katana' ? 17 : weapon === 'cutlass' ? 13 : 15;
      const curve = weapon === 'katana' ? 1.2 : weapon === 'cutlass' ? 1.8 : 0;
      b.cube(`${side}_hand`, 'sword_blade', [hx - wide, hy + 1, -0.22], [hx + wide, hy + len, 0.22], metal, { rotation: [0, 0, s * curve], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'sword_edge', [hx - wide * 0.35, hy + 1, 0.22], [hx + wide * 0.35, hy + len - 0.5, 0.34], 'metal_edge', { rotation: [0, 0, s * curve], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'sword_guard', [hx - 2.4, hy + 0.2, -0.45], [hx + 2.4, hy + 1.2, 0.45], accent);
      b.cube(`${side}_hand`, 'sword_grip', [hx - 0.65, hy - 3.2, -0.55], [hx + 0.65, hy + 0.4, 0.55], '#4b3422');
      b.cube(`${side}_hand`, 'sword_pommel', [hx - 0.95, hy - 4, -0.8], [hx + 0.95, hy - 3.1, 0.8], accent);
      break;
    }
    case 'axe': {
      b.cube(`${side}_hand`, 'axe_handle', [hx - 0.5, hy - 4, -0.5], [hx + 0.5, hy + 16, 0.5], wood, { rotation: [0, 0, s * 0.12], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'axe_head', [hx - 3.6, hy + 9, -0.7], [hx + 1.2, hy + 15, 0.7], metal, { rotation: [0, 0, s * 0.12], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'axe_edge', [hx - 4.4, hy + 10, -0.4], [hx - 3.4, hy + 14, 0.4], 'metal_edge', { rotation: [0, 0, s * 0.12], origin: [hx, hy, 0] });
      break;
    }
    case 'staff':
    case 'scepter': {
      b.cube(`${side}_hand`, 'staff_pole', [hx - 0.55, hy - 8, -0.55], [hx + 0.55, hy + 22, 0.55], wood, { rotation: [0, 0, s * 0.08], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'staff_ring', [hx - 2.1, hy + 19, -1.1], [hx + 2.1, hy + 23, 1.1], accent);
      b.cube(`${side}_hand`, 'staff_gem', [hx - 1.2, hy + 20, -1.4], [hx + 1.2, hy + 24.5, 1.4], glow);
      b.cube(`${side}_hand`, 'staff_gem2', [hx - 0.5, hy + 24, -0.6], [hx + 0.5, hy + 26.4, 0.6], 'glow_bright');
      break;
    }
    case 'bow': {
      for (let i = 0; i < 3; i++) {
        const y = hy - 1 + i * 4;
        b.cube(`${side}_hand`, `bow_limb_${i}`, [hx - 0.45, y, -0.4], [hx + 0.45, y + 4.4, 0.4], wood, {
          rotation: [0, 0, s * (0.5 - i * 0.5)], origin: [hx, hy + 4, 0],
        });
      }
      b.cube(`${side}_hand`, 'bow_string', [hx - 0.08, hy - 4.6, 3.0], [hx + 0.08, hy + 12.5, 3.15], '#ddd6c2');
      b.cube(`${side}_hand`, 'bow_grip', [hx - 0.7, hy + 2, -0.5], [hx + 0.7, hy + 6, 0.5], '#4b3422');
      break;
    }
    case 'spear':
    case 'mace': {
      b.cube(`${side}_hand`, 'spear_pole', [hx - 0.55, hy - 8, -0.55], [hx + 0.55, hy + 26, 0.55], wood, { rotation: [0, 0, s * 0.05], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'spear_head', [hx - 1.1, hy + 24, -1.1], [hx + 1.1, hy + 31, 1.1], metal, { rotation: [0, 0, s * 0.05], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'spear_collar', [hx - 1.6, hy + 23, -1.6], [hx + 1.6, hy + 24.4, 1.6], accent);
      break;
    }
    case 'hammer': {
      b.cube(`${side}_hand`, 'hammer_handle', [hx - 0.55, hy - 4, -0.55], [hx + 0.55, hy + 17, 0.55], wood, { rotation: [0, 0, s * 0.08], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'hammer_head', [hx - 4.2, hy + 13, -1.5], [hx + 4.2, hy + 18, 1.5], metal, { rotation: [0, 0, s * 0.08], origin: [hx, hy, 0] });
      b.cube(`${side}_hand`, 'hammer_band', [hx - 1.6, hy + 13.2, -1.6], [hx + 1.6, hy + 17.8, 1.6], accent);
      break;
    }
    case 'cleaver': {
      b.cube(`${side}_hand`, 'cleaver_blade', [hx - 2.6, hy + 3, -0.3], [hx + 2.6, hy + 13, 0.3], metal);
      b.cube(`${side}_hand`, 'cleaver_grip', [hx - 0.6, hy - 1, -0.55], [hx + 0.6, hy + 3.5, 0.55], '#4b3422');
      b.cube(`${side}_hand`, 'cleaver_hole', [hx + 1.1, hy + 10, -0.36], [hx + 1.7, hy + 11, 0.36], '#2a2d31');
      break;
    }
    case 'lantern': {
      b.cube(`${side}_hand`, 'lantern_chain', [hx - 0.12, hy - 4, -0.12], [hx + 0.12, hy + 1, 0.12], '#5a5f63');
      b.cube(`${side}_hand`, 'lantern_frame', [hx - 1.5, hy - 8, -1.5], [hx + 1.5, hy - 3, 1.5], '#40474b');
      b.cube(`${side}_hand`, 'lantern_glass', [hx - 1.1, hy - 7.6, -1.1], [hx + 1.1, hy - 3.4, 1.1], glow);
      break;
    }
    case 'rifle': {
      // Held across the body, barrel pointing forward (-Z).
      b.cube(`${side}_hand`, 'rifle_stock', [hx - 0.9, hy + 1.6, 2.4], [hx + 0.9, hy + 4.2, 5.6], wood);
      b.cube(`${side}_hand`, 'rifle_body', [hx - 1.15, hy + 2.4, -4.4], [hx + 1.15, hy + 4.8, 3.4], '#3a3f45');
      b.cube(`${side}_hand`, 'rifle_barrel', [hx - 0.42, hy + 3.2, -10.5], [hx + 0.42, hy + 4.4, -4.2], metal);
      b.cube(`${side}_hand`, 'rifle_mag', [hx - 0.9, hy - 0.4, -1.8], [hx + 0.9, hy + 2.6, 0.2], accent);
      b.cube(`${side}_hand`, 'rifle_guard', [hx - 0.55, hy + 2.2, -6.5], [hx + 0.55, hy + 3.2, -4.4], wood);
      b.cube(`${side}_hand`, 'rifle_sight', [hx - 0.35, hy + 4.8, -3.0], [hx + 0.35, hy + 5.6, -1.8], '#20252a');
      break;
    }
    default:
      break;
  }
}

function paintLight(base: string, amount: number) {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = shadeHex(base, amount);
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(2, 2, 5, 1);
  };
}

function bodyDims(type: BodyType): { legH: number; bodyH: number; headH: number; bodyW: number; bodyD: number; armW: number; headW: number; neck: number } {
  switch (type) {
    case 'dwarf': return { legH: 8, bodyH: 11, headH: 9, bodyW: 10, bodyD: 5, armW: 4.6, headW: 9, neck: 0 };
    case 'orc': return { legH: 12, bodyH: 13, headH: 9, bodyW: 11, bodyD: 5.4, armW: 5.2, headW: 9, neck: 0 };
    case 'bulky': return { legH: 12, bodyH: 12.5, headH: 8.5, bodyW: 9.4, bodyD: 4.8, armW: 5, headW: 8.5, neck: 0 };
    case 'elf': return { legH: 14, bodyH: 13, headH: 8, bodyW: 8, bodyD: 4, armW: 3.7, headW: 7.6, neck: 0 };
    case 'hero': return { legH: 12, bodyH: 12, headH: 8, bodyW: 8.6, bodyD: 4.3, armW: 4.1, headW: 8, neck: 0 };
    case 'slim': return { legH: 12, bodyH: 12, headH: 8, bodyW: 7.6, bodyD: 3.8, armW: 3.4, headW: 7.6, neck: 0 };
    case 'skeleton': return { legH: 12, bodyH: 12, headH: 8, bodyW: 7, bodyD: 3.2, armW: 2.8, headW: 8, neck: 0 };
    case 'robot': return { legH: 12, bodyH: 12.5, headH: 8.2, bodyW: 9, bodyD: 4.8, armW: 4.5, headW: 8.2, neck: 0 };
    case 'ghost': return { legH: 0, bodyH: 20, headH: 8, bodyW: 8.5, bodyD: 4.5, armW: 4.4, headW: 8, neck: 0 };
    default: return { legH: 12, bodyH: 12, headH: 8, bodyW: 8, bodyD: 4, armW: 4, headW: 8, neck: 0 };
  }
}

export function buildHumanoid(spec: HumanoidSpec): BBModel {
  const d = bodyDims(spec.body);
  const metal = spec.helmetMetal ?? PALETTE.steel;
  const b = new ModelBuilder(`char_${spec.key}`);
  const skin = 'skin';
  const face = 'face';
  const headSide = 'head_side';
  const hair = 'hair';
  const shirt = 'shirt';
  const sleeve = 'sleeve';
  const pants = 'pants';
  const metalTile = 'metal';
  const accent = 'accent';
  const cloth = 'cloth';
  const wood = 'wood';
  const glow = 'glow';
  const capeTile = 'cape';
  const gold = 'gold';

  b.tile(skin, paintSkin(spec.skin, 31));
  b.tile(hair, paintHair(spec.hair, 32));
  b.tile(face, paintFace({
    skin: spec.skin, hair: spec.hair, hairStyle: spec.hairStyle, eyes: spec.eyes, eyeColor: spec.eyeColor,
    mouth: spec.mouth, beard: spec.beard, helmet: spec.headgear === 'helmet' ? spec.helmetMetal ?? metal : undefined,
    mask: spec.mask, seed: 33,
  }));
  b.tile(headSide, headSidePainter(spec.skin, spec.hairStyle === 'bald' || spec.body === 'skeleton' ? shadeHex(spec.skin, -0.18) : spec.hair, 34));
  b.tile(shirt, spec.body === 'skeleton' ? paintRibs('#b9b2a0', '#6f6a5d') : paintBodyShirt(spec.shirt, spec.accent, spec.outfit ?? 'plain', 35));
  b.tile(sleeve, paintSleeve(spec.body === 'skeleton' ? '#b9b2a0' : spec.shirt, spec.skin, spec.accent, 36));
  b.tile(pants, paintPants(spec.pants, spec.boots, 37));
  b.tile(metalTile, paintMetal(metal, '#8fe9ff', 38));
  b.tile('metal_edge', paintLight(shadeHex(metal, 0.22), 0.12));
  b.tile('glow_bright', paintLight(spec.glow ?? '#9ee7ff', 0.32));
  b.tile(accent, paintFabric(spec.accent, undefined, 'plain', 39));
  b.tile(cloth, paintCloth(spec.capeColor ?? spec.accent, shadeHex(spec.capeColor ?? spec.accent, 0.2), 40));
  b.tile(wood, paintWood('#7a5631', '#52371f', 41));
  b.tile(gold, paintGold(42));
  b.tile(glow, paintGlow(spec.glow ?? '#9ee7ff', '#ffffff', 43));
  b.tile(capeTile, spec.cape === 'snow' ? paintFur(spec.capeColor ?? '#cbd5d9', '#9faeb5', '#e9f0f2', 44) : paintCloth(spec.capeColor ?? '#7b2c37', shadeHex(spec.capeColor ?? '#7b2c37', 0.18), 45));

  const headgear = spec.headgear ?? 'none';
  const hairStyle = spec.hairStyle ?? 'short';
  if (headgear === 'helmet') {
    b.tile('visor', paintMetal(shadeHex(metal, -0.25), '#7de4ff', 46));
  }
  if (headgear === 'straw') b.tile('straw_hat', paintStraw(spec.headgearColor ?? '#c9a64e'));
  if (headgear === 'tricorn') b.tile('tricorn_hat', paintTricorn(spec.headgearColor ?? '#2b2830'));
  if (headgear === 'turban') b.tile('turban', paintTurban(spec.headgearColor ?? '#d0b985'));
  if (headgear === 'crown') b.tile('crown', paintCrown);
  if (headgear === 'hood') b.tile('hood', paintHood(spec.headgearColor ?? '#2c382c', shadeHex(spec.headgearColor ?? '#2c382c', -0.3), 47));
  if (headgear === 'wizard') b.tile('wizard_hat', paintFabric(spec.headgearColor ?? '#4b3d8f', spec.accent, 'stripes', 48));
  if (headgear === 'pith') b.tile('pith_hat', paintStraw(spec.headgearColor ?? '#b8a275'));

  const rootBone = 'root';
  b.bone(rootBone, [0, 0, 0]);
  const legH = d.legH;
  const shoulderY = legH + d.bodyH;
  const headBase = shoulderY;
  const bodyW = d.bodyW;
  const bodyD = d.bodyD;
  const armW = d.armW;
  const headW = d.headW;
  const headH = d.headH;

  if (spec.body !== 'ghost') {
    b.bone('body', [0, legH, 0], rootBone);
    b.bone('head', [0, shoulderY, 0], 'body');
    b.bone('right_arm', [-bodyW / 2, shoulderY, 0], 'body');
    b.bone('left_arm', [bodyW / 2, shoulderY, 0], 'body');
    b.bone('right_leg', [-bodyW / 4 - 1, legH, 0], rootBone);
    b.bone('left_leg', [bodyW / 4 + 1, legH, 0], rootBone);
  } else {
    b.bone('body', [0, 0, 0], rootBone);
    b.bone('head', [0, d.bodyH, 0], 'body');
    b.bone('right_arm', [-bodyW / 2, d.bodyH - 2, 0], 'body');
    b.bone('left_arm', [bodyW / 2, d.bodyH - 2, 0], 'body');
  }

  // Body
  b.cube('body', 'torso', [-bodyW / 2, legH, -bodyD / 2], [bodyW / 2, shoulderY, bodyD / 2], {
    south: shirt, north: shirt, east: shirt, west: shirt, up: shirt, down: shirt,
  });
  if (spec.body !== 'skeleton') {
    b.cube('body', 'belt', [-bodyW / 2 - 0.08, legH + 0.2, -bodyD / 2 - 0.08], [bodyW / 2 + 0.08, legH + 1.5, bodyD / 2 + 0.08], accent);
  }

  // Head
  b.cube('head', 'head', [-headW / 2, headBase, -headW / 2], [headW / 2, headBase + headH, headW / 2], {
    south: face, north: hairStyle === 'bald' || spec.body === 'skeleton' ? skin : hair,
    east: headSide, west: headSide, up: hairStyle === 'bald' || spec.body === 'skeleton' ? skin : hair, down: skin,
  }, { inflate: 0.02 });

  // Arms
  const armTop = shoulderY;
  const armBottom = legH + 1;
  const armLen = armTop - armBottom;
  for (const side of ['right', 'left'] as const) {
    const sign = side === 'right' ? -1 : 1;
    const x = sign * (bodyW / 2 + armW / 2);
    b.cube(`${side}_arm`, `${side}_arm`, [x - armW / 2, armBottom, -armW / 2], [x + armW / 2, armTop, armW / 2], {
      south: sleeve, north: sleeve, east: sleeve, west: sleeve, up: sleeve, down: skin,
    });
    if (spec.shoulder) {
      b.cube(`${side}_arm`, `${side}_shoulder`, [x - armW / 2 - 0.4, armTop - 1.5, -armW / 2 - 0.4], [x + armW / 2 + 0.4, armTop + 1.4, armW / 2 + 0.4], spec.shoulderColor ?? metal);
    }
    void armLen;
  }

  // Legs
  if (spec.body !== 'ghost') {
    const legW = bodyW * 0.36;
    for (const side of ['right', 'left'] as const) {
      const sign = side === 'right' ? -1 : 1;
      const x = sign * (bodyW / 4 + 0.4);
      b.cube(`${side}_leg`, `${side}_leg`, [x - legW / 2, 0, -legW / 2], [x + legW / 2, legH, legW / 2], {
        south: pants, north: pants, east: pants, west: pants, up: pants, down: pants,
      });
    }
  }

  if (spec.robe) {
    const skirtW = bodyW / 2 + 0.9;
    const skirtD = bodyD / 2 + 0.9;
    b.cube('body', 'robe_skirt', [-skirtW, spec.body === 'ghost' ? 0 : 1, -skirtD], [skirtW, legH + d.bodyH * 0.55, skirtD], {
      south: shirt, north: shirt, east: shirt, west: shirt, up: shirt, down: accent,
    });
    if (spec.body !== 'ghost') {
      b.cube('body', 'robe_trim', [-skirtW - 0.06, 1, -skirtD - 0.06], [skirtW + 0.06, 2.2, skirtD + 0.06], accent);
    }
  }

  // Headgear
  if (headgear === 'helmet') {
    b.cube('head', 'helmet', [-headW / 2 - 0.65, headBase - 0.3, -headW / 2 - 0.65], [headW / 2 + 0.65, headBase + headH + 0.55, headW / 2 + 0.65], {
      south: 'visor', north: metalTile, east: metalTile, west: metalTile, up: metalTile, down: metalTile,
    });
    b.cube('head', 'helmet_crest', [-0.8, headBase + headH + 0.5, -0.5], [0.8, headBase + headH + 2.4, 0.5], accent);
  } else if (headgear === 'hood') {
    b.cube('head', 'hood', [-headW / 2 - 0.55, headBase - 0.8, -headW / 2 - 0.55], [headW / 2 + 0.55, headBase + headH + 0.4, headW / 2 + 0.55], {
      south: 'hood', north: 'hood', east: 'hood', west: 'hood', up: 'hood', down: 'hood',
    });
    b.cube('head', 'hood_shoulder', [-headW / 2 - 1.5, headBase - 1.7, -headW / 2 - 1.3], [headW / 2 + 1.5, headBase - 0.1, headW / 2 + 1.3], 'hood');
  } else if (headgear === 'wizard') {
    b.cube('head', 'wizard_brim', [-headW / 2 - 3.4, headBase + headH - 0.3, -headW / 2 - 3.4], [headW / 2 + 3.4, headBase + headH + 0.6, headW / 2 + 3.4], 'wizard_hat');
    b.cube('head', 'wizard_crown', [-headW / 2 - 0.5, headBase + headH + 0.5, -headW / 2 - 0.5], [headW / 2 + 0.5, headBase + headH + 8, headW / 2 + 0.5], 'wizard_hat', { rotation: [0, 0, 8], origin: [0, headBase + headH, 0] });
    b.cube('head', 'wizard_tip', [-1.2, headBase + headH + 8, -1.2], [1.2, headBase + headH + 11.4, 1.2], 'wizard_hat', { rotation: [0, 0, 18], origin: [0, headBase + headH, 0] });
    b.cube('head', 'wizard_band', [-headW / 2 - 0.6, headBase + headH + 0.6, -headW / 2 - 0.6], [headW / 2 + 0.6, headBase + headH + 1.7, headW / 2 + 0.6], accent);
  } else if (headgear === 'crown') {
    b.cube('head', 'crown_band', [-headW / 2 - 0.4, headBase + headH - 0.5, -headW / 2 - 0.4], [headW / 2 + 0.4, headBase + headH + 1.5, headW / 2 + 0.4], 'crown');
    for (let i = 0; i < 4; i++) {
      const x = -headW / 2 + i * (headW / 3);
      b.cube('head', `crown_peak_${i}`, [x - 0.4, headBase + headH + 1.4, -headW / 2 - 0.4], [x + 0.4, headBase + headH + 3.6, headW / 2 + 0.4], 'crown');
    }
  } else if (headgear === 'straw') {
    b.cube('head', 'straw_brim', [-headW / 2 - 4.5, headBase + headH - 0.5, -headW / 2 - 4.5], [headW / 2 + 4.5, headBase + headH + 0.5, headW / 2 + 4.5], 'straw_hat');
    b.cube('head', 'straw_top', [-headW / 2 - 0.2, headBase + headH + 0.4, -headW / 2 - 0.2], [headW / 2 + 0.2, headBase + headH + 3, headW / 2 + 0.2], 'straw_hat');
  } else if (headgear === 'tricorn') {
    b.cube('head', 'tricorn_brim', [-headW / 2 - 3.2, headBase + headH - 0.2, -headW / 2 - 3.2], [headW / 2 + 3.2, headBase + headH + 0.8, headW / 2 + 3.2], 'tricorn_hat');
    b.cube('head', 'tricorn_top', [-headW / 2 - 0.4, headBase + headH + 0.7, -headW / 2 - 0.4], [headW / 2 + 0.4, headBase + headH + 3, headW / 2 + 0.4], 'tricorn_hat');
    b.cube('head', 'tricorn_skull', [-1.2, headBase + headH + 2, -headW / 2 - 1], [1.2, headBase + headH + 3.4, -headW / 2 + 0.2], '#ddd4bd');
  } else if (headgear === 'pith') {
    b.cube('head', 'pith_brim', [-headW / 2 - 3, headBase + headH - 0.4, -headW / 2 - 3], [headW / 2 + 3, headBase + headH + 0.6, headW / 2 + 3], 'pith_hat');
    b.cube('head', 'pith_top', [-headW / 2 - 0.3, headBase + headH + 0.5, -headW / 2 - 0.3], [headW / 2 + 0.3, headBase + headH + 4, headW / 2 + 0.3], 'pith_hat');
    b.cube('head', 'pith_band', [-headW / 2 - 0.4, headBase + headH + 0.7, -headW / 2 - 0.4], [headW / 2 + 0.4, headBase + headH + 1.6, headW / 2 + 0.4], '#5c4a32');
  } else if (headgear === 'turban') {
    b.cube('head', 'turban_wrap', [-headW / 2 - 1, headBase + headH - 1.4, -headW / 2 - 1], [headW / 2 + 1, headBase + headH + 3.2, headW / 2 + 1], 'turban');
    b.cube('head', 'turban_tail', [headW / 2 + 0.4, headBase + 1, -1.4], [headW / 2 + 2.2, headBase + headH, 1.4], 'turban');
  } else if (headgear === 'beanie') {
    b.cube('head', 'beanie', [-headW / 2 - 0.4, headBase + headH - 1, -headW / 2 - 0.4], [headW / 2 + 0.4, headBase + headH + 2.3, headW / 2 + 0.4], spec.headgearColor ?? accent);
    b.cube('head', 'beanie_pom', [-1.2, headBase + headH + 2.1, -1.2], [1.2, headBase + headH + 4.2, 1.2], shadeHex(spec.headgearColor ?? spec.accent, 0.24));
  } else if (headgear === 'halo') {
    b.cube('head', 'halo', [-headW / 2 - 1, headBase + headH + 2.6, -headW / 2 - 1], [headW / 2 + 1, headBase + headH + 3.2, headW / 2 + 1], 'gold');
    b.cube('head', 'halo_glow', [-headW / 2, headBase + headH + 2.5, -headW / 2], [headW / 2, headBase + headH + 3.3, headW / 2], glow);
  }

  if (spec.ears) {
    b.cube('head', 'ear_right', [-headW / 2 - 2.6, headBase + 3, -0.8], [-headW / 2 - 0.1, headBase + 6.2, 0.8], skin, { rotation: [0, 0, -18], origin: [-headW / 2, headBase + 5, 0] });
    b.cube('head', 'ear_left', [headW / 2 + 0.1, headBase + 3, -0.8], [headW / 2 + 2.6, headBase + 6.2, 0.8], skin, { rotation: [0, 0, 18], origin: [headW / 2, headBase + 5, 0] });
  }
  if (spec.horns) {
    b.cube('head', 'horn_r', [-headW / 2 - 1.2, headBase + headH - 1, -1], [-headW / 2 + 0.4, headBase + headH + 4.5, 1], '#d8ceb4', { rotation: [0, 0, -22], origin: [-headW / 2, headBase + headH, 0] });
    b.cube('head', 'horn_l', [headW / 2 - 0.4, headBase + headH - 1, -1], [headW / 2 + 1.2, headBase + headH + 4.5, 1], '#d8ceb4', { rotation: [0, 0, 22], origin: [headW / 2, headBase + headH, 0] });
  }

  // Cape, backpack, arms and weapons
  if (spec.cape) {
    b.bone('cape', [0, shoulderY - 1, bodyD / 2], 'body');
    b.cube('cape', 'cape', [-bodyW / 2 - 1.5, legH + 2, bodyD / 2 + 0.15], [bodyW / 2 + 1.5, shoulderY, bodyD / 2 + 0.8], {
      south: capeTile, north: capeTile, east: capeTile, west: capeTile, up: accent, down: capeTile,
    });
  }
  if (spec.backpack) {
    b.cube('body', 'backpack', [-bodyW / 2 + 0.6, legH + 3, bodyD / 2 + 0.3], [bodyW / 2 - 0.6, shoulderY - 2, bodyD / 2 + 3], {
      south: 'leather', north: 'leather', east: 'leather', west: 'leather', up: 'leather', down: 'leather',
    });
    b.cube('body', 'backpack_strap', [-bodyW / 2, shoulderY - 2.2, -bodyD / 2 - 0.14], [bodyW / 2, shoulderY - 1.3, -bodyD / 2 + 0.2], 'leather');
  }

  const rightHand: [number, number, number] = [-(bodyW / 2 + armW / 2), armBottom + 1, 0];
  const leftHand: [number, number, number] = [bodyW / 2 + armW / 2, armBottom + 1, 0];
  b.bone('right_hand', rightHand, spec.body === 'ghost' ? 'right_arm' : 'right_arm', [0, 0, -8]);
  b.bone('left_hand', leftHand, spec.body === 'ghost' ? 'left_arm' : 'left_arm', [0, 0, 8]);
  b.tile('leather', paintLeather(PALETTE.leather, '#c9a26d', 49));
  if (spec.weapon && spec.weapon !== 'none') {
    buildWeapon(b, spec.weapon, 'right', rightHand, metalTile, wood, accent, glow);
  }
  if (spec.shield) {
    b.cube('left_hand', 'shield', [leftHand[0] - 0.5, leftHand[1] - 6, -4.4], [leftHand[0] + 0.5, leftHand[1] + 7, 4.4], {
      south: 'shield_face', north: 'leather', east: 'leather', west: 'leather', up: 'leather', down: 'leather',
    });
    b.tile('shield_face', (ctx) => {
      paintWood('#6e4d2f', '#4b331f', 50)(ctx);
      ctx.fillStyle = metal;
      ctx.fillRect(0, 0, 16, 2);
      ctx.fillRect(0, 14, 16, 2);
      ctx.fillRect(7, 2, 2, 12);
      ctx.fillStyle = spec.accent;
      ctx.fillRect(6, 6, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7, 7, 1, 1);
    });
  }

  // Animations
  const idle: import('./ModelBuilder').AnimationSpec = {
    name: 'idle', length: 2.6, loop: 'loop',
    channels: {
      body: { rotation: { '0': [0, 0, 0], '1.3': [0, 1.5, 0], '2.6': [0, 0, 0] } },
      head: { rotation: { '0': [0, 0, 0], '0.9': [-2, 4, 0], '1.8': [1, -3, 0], '2.6': [0, 0, 0] } },
      right_arm: { rotation: { '0': [0, 0, 0], '1.3': [2, 0, -2], '2.6': [0, 0, 0] } },
      left_arm: { rotation: { '0': [0, 0, 0], '1.3': [-2, 0, 2], '2.6': [0, 0, 0] } },
    },
  };
  const walk: import('./ModelBuilder').AnimationSpec = {
    name: 'walk', length: 1.1, loop: 'loop',
    channels: {
      right_leg: { rotation: { '0': [28, 0, 0], '0.275': [0, 0, 0], '0.55': [-28, 0, 0], '0.825': [0, 0, 0], '1.1': [28, 0, 0] } },
      left_leg: { rotation: { '0': [-28, 0, 0], '0.275': [0, 0, 0], '0.55': [28, 0, 0], '0.825': [0, 0, 0], '1.1': [-28, 0, 0] } },
      right_arm: { rotation: { '0': [-30, 0, 0], '0.55': [30, 0, 0], '1.1': [-30, 0, 0] } },
      left_arm: { rotation: { '0': [30, 0, 0], '0.55': [-30, 0, 0], '1.1': [30, 0, 0] } },
      body: { rotation: { '0': [0, 0, 1.5], '0.55': [0, 0, -1.5], '1.1': [0, 0, 1.5] } },
      head: { rotation: { '0': [0, -2, 0], '0.55': [0, 2, 0], '1.1': [0, -2, 0] } },
    },
  };
  const run: import('./ModelBuilder').AnimationSpec = {
    name: 'run', length: 0.75, loop: 'loop',
    channels: {
      right_leg: { rotation: { '0': [55, 0, 0], '0.375': [-55, 0, 0], '0.75': [55, 0, 0] } },
      left_leg: { rotation: { '0': [-55, 0, 0], '0.375': [55, 0, 0], '0.75': [-55, 0, 0] } },
      right_arm: { rotation: { '0': [-62, 0, 0], '0.375': [62, 0, 0], '0.75': [-62, 0, 0] } },
      left_arm: { rotation: { '0': [62, 0, 0], '0.375': [-62, 0, 0], '0.75': [62, 0, 0] } },
      body: { rotation: { '0': [8, 0, 0], '0.75': [8, 0, 0] } },
      head: { rotation: { '0': [-6, 0, 0], '0.75': [-6, 0, 0] } },
    },
  };
  const attack: import('./ModelBuilder').AnimationSpec = {
    name: 'attack', length: 0.55, loop: 'once',
    channels: {
      right_arm: { rotation: { '0': [0, 0, 0], '0.16': [-125, 0, 10], '0.34': [-55, 0, 4], '0.55': [0, 0, 0] } },
      body: { rotation: { '0': [0, 0, 0], '0.16': [0, -16, 0], '0.55': [0, 0, 0] } },
      head: { rotation: { '0': [0, 0, 0], '0.16': [0, 12, 0], '0.55': [0, 0, 0] } },
    },
  };
  const mine: import('./ModelBuilder').AnimationSpec = {
    name: 'mine', length: 0.65, loop: 'loop',
    channels: {
      right_arm: { rotation: { '0': [-75, 0, 4], '0.32': [-18, 0, -2], '0.65': [-75, 0, 4] } },
      body: { rotation: { '0': [4, -7, 0], '0.65': [4, -7, 0] } },
    },
  };
  const spell: import('./ModelBuilder').AnimationSpec = {
    name: 'cast', length: 0.85, loop: 'once',
    channels: {
      right_arm: { rotation: { '0': [0, 0, 0], '0.25': [-145, 0, -18], '0.6': [-120, 0, -12], '0.85': [0, 0, 0] } },
      left_arm: { rotation: { '0': [0, 0, 0], '0.25': [-30, 0, 22], '0.85': [0, 0, 0] } },
      head: { rotation: { '0': [0, 0, 0], '0.25': [-12, 0, 0], '0.85': [0, 0, 0] } },
    },
  };
  const hurt: import('./ModelBuilder').AnimationSpec = {
    name: 'hurt', length: 0.4, loop: 'once',
    channels: {
      head: { rotation: { '0': [0, 0, 0], '0.14': [-18, 0, 8], '0.4': [0, 0, 0] } },
      body: { rotation: { '0': [0, 0, 0], '0.14': [7, 0, -5], '0.4': [0, 0, 0] } },
    },
  };
  const death: import('./ModelBuilder').AnimationSpec = {
    name: 'death', length: 1.15, loop: 'hold',
    channels: {
      root: { rotation: { '0': [0, 0, 0], '0.55': [-82, 0, 0], '1.15': [-88, 0, 0] }, position: { '0': [0, 0, 0], '1.15': [0, 1, 0] } },
      right_arm: { rotation: { '0': [0, 0, 0], '0.55': [-40, 0, -24], '1.15': [-20, 0, -35] } },
      left_arm: { rotation: { '0': [0, 0, 0], '0.55': [-40, 0, 24], '1.15': [-20, 0, 35] } },
    },
  };
  const jump: import('./ModelBuilder').AnimationSpec = {
    name: 'jump', length: 0.6, loop: 'once',
    channels: {
      right_arm: { rotation: { '0': [0, 0, 0], '0.22': [-145, 0, -20], '0.6': [-90, 0, -12] } },
      left_arm: { rotation: { '0': [0, 0, 0], '0.22': [-145, 0, 20], '0.6': [-90, 0, 12] } },
      right_leg: { rotation: { '0': [0, 0, 0], '0.22': [-28, 0, 0], '0.6': [20, 0, 0] } },
      left_leg: { rotation: { '0': [0, 0, 0], '0.22': [24, 0, 0], '0.6': [-20, 0, 0] } },
    },
  };
  const wave: import('./ModelBuilder').AnimationSpec = {
    name: 'wave', length: 1.4, loop: 'loop',
    channels: {
      right_arm: { rotation: { '0': [-10, 0, -155], '0.35': [-10, 0, -138], '0.7': [-10, 0, -158], '1.05': [-10, 0, -140], '1.4': [-10, 0, -155] } },
      head: { rotation: { '0': [0, 0, 0], '0.7': [0, 8, 0], '1.4': [0, 0, 0] } },
    },
  };
  const sit: import('./ModelBuilder').AnimationSpec = {
    name: 'sit', length: 2, loop: 'loop',
    channels: {
      root: { position: { '0': [0, -5.5, 0], '2': [0, -5.5, 0] } },
      right_leg: { rotation: { '0': [-88, 0, 0], '2': [-88, 0, 0] } },
      left_leg: { rotation: { '0': [-88, 0, 0], '2': [-88, 0, 0] } },
      right_arm: { rotation: { '0': [-14, 0, 8], '2': [-14, 0, 8] } },
      left_arm: { rotation: { '0': [-14, 0, -8], '2': [-14, 0, -8] } },
    },
  };
  const float: import('./ModelBuilder').AnimationSpec = {
    name: 'float', length: 3, loop: 'loop',
    channels: {
      root: { position: { '0': [0, 0, 0], '1.5': [0, 2.4, 0], '3': [0, 0, 0] } },
      head: { rotation: { '0': [0, 0, 0], '1.5': [4, -8, 0], '3': [0, 0, 0] } },
      right_arm: { rotation: { '0': [0, 0, -8], '1.5': [4, 0, -15], '3': [0, 0, -8] } },
      left_arm: { rotation: { '0': [0, 0, 8], '1.5': [4, 0, 15], '3': [0, 0, 8] } },
    },
  };
  const talk: import('./ModelBuilder').AnimationSpec = {
    name: 'talk', length: 1.6, loop: 'loop',
    channels: {
      head: { rotation: { '0': [0, 0, 0], '0.4': [-3, 7, 0], '0.8': [2, 2, 0], '1.2': [-2, -6, 0], '1.6': [0, 0, 0] } },
      right_arm: { rotation: { '0': [0, 0, 0], '0.5': [-38, 0, -12], '1.0': [-12, 0, -6], '1.6': [0, 0, 0] } },
      left_arm: { rotation: { '0': [0, 0, 0], '0.7': [-24, 0, 9], '1.3': [-8, 0, 4], '1.6': [0, 0, 0] } },
    },
  };

  b.anim(idle).anim(walk).anim(run).anim(attack).anim(mine).anim(spell).anim(hurt).anim(death).anim(jump).anim(wave).anim(sit).anim(float).anim(talk);
  if (spec.body === 'ghost') b.anim(float);
  return b.build();
}

export function getHumanoidModel(key: string): BBModel {
  const cached = cache.get(key);
  if (cached) return cached;
  const spec = HUMANOID_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown humanoid: ${key}`);
  const model = buildHumanoid(spec);
  cache.set(key, model);
  return model;
}

export function getHumanoidSpec(key: string): HumanoidSpec | undefined {
  return HUMANOID_BY_KEY.get(key);
}

/** A small 2D portrait built from the model's own face texture, for UI lists. */
export function humanoidPortrait(spec: HumanoidSpec): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, shadeHex(spec.shirt, -0.35));
  gradient.addColorStop(1, '#0b1116');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  // Pixel-art shoulders.
  ctx.fillStyle = spec.shirt;
  ctx.fillRect(12, 46, 40, 16);
  ctx.fillStyle = spec.accent;
  ctx.fillRect(12, 46, 40, 3);
  ctx.fillStyle = spec.skin;
  ctx.fillRect(22, 22, 20, 24);
  ctx.fillStyle = spec.hair;
  ctx.fillRect(20, 16, 24, 8);
  ctx.fillRect(20, 22, 3, 10);
  ctx.fillRect(41, 22, 3, 10);
  ctx.fillStyle = spec.eyeColor ?? '#25262b';
  ctx.fillRect(26, 31, 4, 3);
  ctx.fillRect(35, 31, 4, 3);
  ctx.fillStyle = shadeHex(spec.skin, -0.22);
  ctx.fillRect(30, 35, 4, 3);
  ctx.fillStyle = spec.mouth ?? '#6b443e';
  ctx.fillRect(27, 40, 10, 1);
  // headgear hints
  if (spec.headgear === 'helmet' || spec.headgear === 'crown' || spec.headgear === 'halo') {
    ctx.fillStyle = spec.headgear === 'crown' ? '#e1b84c' : spec.helmetMetal ?? '#8b99a8';
    ctx.fillRect(18, 12, 28, 7);
    if (spec.headgear === 'crown') {
      for (let i = 0; i < 4; i++) ctx.fillRect(19 + i * 7, 7, 3, 6);
    }
  } else if (spec.headgear === 'wizard' || spec.headgear === 'hood') {
    ctx.fillStyle = spec.headgearColor ?? spec.shirt;
    ctx.beginPath();
    ctx.moveTo(16, 24);
    ctx.lineTo(32, 2);
    ctx.lineTo(48, 24);
    ctx.closePath();
    ctx.fill();
  }
  return canvas.toDataURL();
}
