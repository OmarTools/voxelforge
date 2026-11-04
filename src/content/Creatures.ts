import type { BBModel } from '../engine/blockbench/BBModel';
import { mulberry32 } from '../engine/core/Noise';
import { shadeHex } from '../engine/core/Utils';
import { ModelBuilder } from './ModelBuilder';
import {
  paintAnimalFace,
  paintCloth,
  paintFabric,
  paintFur,
  paintGlow,
  paintMetal,
  paintScale,
  paintSkin,
  paintWool,
} from './TextureSheet';

export type CreatureForm = 'quadruped' | 'bird' | 'slime' | 'spider' | 'creeper' | 'golem' | 'dragon' | 'fish' | 'bee' | 'mushroom' | 'scorpion' | 'wisp' | 'bat';
export type CreatureStyle = 'pig' | 'cow' | 'sheep' | 'chicken' | 'creeper' | 'wolf' | 'dragon' | 'slime';

export interface CreatureSpec {
  key: string;
  name: string;
  form: CreatureForm;
  base: string;
  dark: string;
  light: string;
  belly?: string;
  snout?: string;
  eye?: string;
  eyeGlow?: string;
  style?: CreatureStyle;
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  horns?: boolean;
  tusks?: boolean;
  spots?: boolean;
  wings?: boolean;
  shell?: boolean;
  glowing?: string;
  description: string;
  tags: string[];
}

const CREATURES: CreatureSpec[] = [
  {
    key: 'wolf', name: 'Timber Wolf', form: 'quadruped', base: '#8d969e', dark: '#5e686f', light: '#c4ccd1',
    belly: '#d7dcdf', snout: '#3b4045', eye: '#e8c565', style: 'wolf', size: 'medium',
    description: 'A grey wolf with keen eyes and a loyal heart.', tags: ['animal', 'pack', 'tameable'],
  },
  {
    key: 'fox', name: 'Red Fox', form: 'quadruped', base: '#c86a35', dark: '#8b4322', light: '#e9d7bd',
    belly: '#ecdcc4', snout: '#e7d6bf', eye: '#4a3b2a', style: 'wolf', size: 'small',
    description: 'Quick, clever and always curious.', tags: ['animal', 'forest', 'fast'],
  },
  {
    key: 'boar', name: 'Wild Boar', form: 'quadruped', base: '#6b4c36', dark: '#473124', light: '#94725a',
    belly: '#8e6b50', snout: '#b98f75', eye: '#d6b458', style: 'pig', size: 'medium', tusks: true,
    description: 'A bristly boar with a short temper and sharp tusks.', tags: ['animal', 'hostile', 'forest'],
  },
  {
    key: 'cow', name: 'Meadow Cow', form: 'quadruped', base: '#e7e3d9', dark: '#3b3a38', light: '#f7f4ec',
    belly: '#f0eadf', snout: '#d9a89a', eye: '#2f2b27', style: 'cow', size: 'large', spots: true, horns: true,
    description: 'A gentle cow that provides milk and leather.', tags: ['animal', 'farm', 'passive'],
  },
  {
    key: 'pig', name: 'Mud Pig', form: 'quadruped', base: '#e6a7a0', dark: '#b87470', light: '#f4c4bc',
    belly: '#efb9b0', snout: '#d18a84', eye: '#3f2b2a', style: 'pig', size: 'medium',
    description: 'A round pink pig that loves carrots and mud.', tags: ['animal', 'farm', 'passive'],
  },
  {
    key: 'sheep', name: 'Cloud Sheep', form: 'quadruped', base: '#e9e6dc', dark: '#b9b5a8', light: '#fbf9f2',
    belly: '#f2efe6', snout: '#c7b6a4', eye: '#34302c', style: 'sheep', size: 'medium',
    description: 'A fluffy sheep carrying a coat of soft wool.', tags: ['animal', 'farm', 'passive'],
  },
  {
    key: 'bear', name: 'Cave Bear', form: 'quadruped', base: '#6a4b33', dark: '#45301f', light: '#8f6a4a',
    belly: '#84603f', snout: '#c1a17d', eye: '#d3a44f', style: 'wolf', size: 'large',
    description: 'A massive bear that guards the deep woods.', tags: ['animal', 'hostile', 'strong'],
  },
  {
    key: 'horse', name: 'Ridgeback Horse', form: 'quadruped', base: '#8a5b33', dark: '#5c3b20', light: '#b48354',
    belly: '#a06f44', snout: '#4d3320', eye: '#2b211a', style: 'cow', size: 'large',
    description: 'A sure-footed horse with a flowing mane.', tags: ['animal', 'mount', 'passive'],
  },
  {
    key: 'chicken', name: 'Barn Chicken', form: 'bird', base: '#e7e2d2', dark: '#c9c0aa', light: '#fbf7e9',
    belly: '#f4eedb', snout: '#d9a33c', eye: '#2b2520', eyeGlow: '#c84d32', style: 'chicken', size: 'tiny',
    description: 'A plucky chicken that clucks around the farm.', tags: ['animal', 'farm', 'passive'],
  },
  {
    key: 'rabbit', name: 'Meadow Rabbit', form: 'bird', base: '#b99b7b', dark: '#8b6f52', light: '#ddc9ae',
    belly: '#f0e4d2', snout: '#d8a7a2', eye: '#2f2721', eyeGlow: '#bf5a62', size: 'tiny',
    description: 'A skittish rabbit with long ears and a quick hop.', tags: ['animal', 'passive', 'fast'],
  },
  {
    key: 'slime', name: 'Gel Slime', form: 'slime', base: '#65b84c', dark: '#3d7f31', light: '#9be07b',
    belly: '#87d16a', snout: '#3d7f31', eye: '#1f3b22', style: 'slime', size: 'small',
    description: 'A bouncy blob of living gel. It splits when struck.', tags: ['monster', 'hostile', 'bouncy'],
  },
  {
    key: 'magma_slime', name: 'Magma Slime', form: 'slime', base: '#b8542e', dark: '#6d2a17', light: '#f3a35c',
    belly: '#d77742', eye: '#ffd46e', glowing: '#ff8a3d', style: 'slime', size: 'medium',
    description: 'A bubbling slime of molten rock.', tags: ['monster', 'hostile', 'fire'],
  },
  {
    key: 'spider', name: 'Cave Spider', form: 'spider', base: '#38343d', dark: '#211e25', light: '#6c6472',
    belly: '#4a424f', snout: '#6d2731', eye: '#c9464e', eyeGlow: '#ff5d64', size: 'medium',
    description: 'An eight-legged horror that drops string.', tags: ['monster', 'hostile', 'cave'],
  },
  {
    key: 'creeper', name: 'Creeper', form: 'creeper', base: '#5ba64f', dark: '#326b30', light: '#8bcf77',
    belly: '#72b95f', snout: '#254d23', eye: '#0f2011', size: 'medium',
    description: 'A silent green stalker that explodes when close.', tags: ['monster', 'hostile', 'explosive'],
  },
  {
    key: 'bat', name: 'Cave Bat', form: 'bat', base: '#4a3c4b', dark: '#2a222d', light: '#7a657b',
    belly: '#6b546a', snout: '#2b222d', eye: '#ff5b66', eyeGlow: '#ff5b66', size: 'tiny',
    description: 'A leathery flyer that chitters in the dark.', tags: ['animal', 'flying', 'cave'],
  },
  {
    key: 'bee', name: 'Meadow Bee', form: 'bee', base: '#e3b64b', dark: '#3b3020', light: '#f6dc8b',
    belly: '#e8c769', snout: '#3d3024', eye: '#28211a', size: 'tiny',
    description: 'A busy bee carrying pollen across the meadow.', tags: ['animal', 'flying', 'passive'],
  },
  {
    key: 'fish', name: 'River Fish', form: 'fish', base: '#4c8fa8', dark: '#2f6479', light: '#9ccfdc',
    belly: '#cae6ec', snout: '#7dbccd', eye: '#1e2a30', size: 'tiny',
    description: 'A silver-blue fish darting through shallow water.', tags: ['animal', 'aquatic', 'passive'],
  },
  {
    key: 'mushroomling', name: 'Mushroomling', form: 'mushroom', base: '#d8c7a3', dark: '#a9846c', light: '#f2e6ce',
    belly: '#e6d7ba', snout: '#8f3c36', eye: '#2a2420', eyeGlow: '#7edb72', size: 'small',
    description: 'A little fungal creature with a glowing cap.', tags: ['monster', 'hostile', 'forest'],
  },
  {
    key: 'scorpion', name: 'Dune Scorpion', form: 'scorpion', base: '#a2743f', dark: '#644424', light: '#d0a468',
    belly: '#b98a51', snout: '#5d3d22', eye: '#f3c15c', eyeGlow: '#ffd76e', size: 'medium',
    description: 'A chitinous desert hunter with a venomous tail.', tags: ['monster', 'hostile', 'desert'],
  },
  {
    key: 'wisp', name: 'Will-o-Wisp', form: 'wisp', base: '#7edbd2', dark: '#3c8c89', light: '#d3fffa',
    belly: '#b8fff8', snout: '#d3fffa', eye: '#ffffff', eyeGlow: '#ffffff', glowing: '#79fff4', size: 'small',
    description: 'A floating lantern-light lost between worlds.', tags: ['spirit', 'flying', 'magic'],
  },
  {
    key: 'stone_golem', name: 'Stone Golem', form: 'golem', base: '#7d817c', dark: '#4f544f', light: '#a8ada5',
    belly: '#6a6f68', snout: '#5c615b', eye: '#7fe5ff', eyeGlow: '#7fe5ff', glowing: '#6bd7e8', size: 'huge',
    description: 'An ancient guardian carved from living stone.', tags: ['construct', 'boss', 'tank'],
  },
  {
    key: 'crystal_golem', name: 'Crystal Colossus', form: 'golem', base: '#4d8f8f', dark: '#2d5c60', light: '#8ee3dc',
    belly: '#5aa8a3', snout: '#71c9c2', eye: '#d8ffff', eyeGlow: '#d8ffff', glowing: '#75f2e4', size: 'huge',
    description: 'A towering colossus grown from raw crystal.', tags: ['construct', 'boss', 'crystal'],
  },
  {
    key: 'ember_dragon', name: 'Ember Dragon', form: 'dragon', base: '#7c2f2b', dark: '#421917', light: '#c05b3c',
    belly: '#b06b3e', snout: '#d58a56', eye: '#ffd45e', eyeGlow: '#ff8a3d', glowing: '#ff6a30', size: 'huge',
    description: 'A winged tyrant wreathed in ember and smoke.', tags: ['dragon', 'boss', 'flying'],
  },
  {
    key: 'frost_dragon', name: 'Frost Wyrm', form: 'dragon', base: '#4f7e9b', dark: '#2a4b61', light: '#a9dff2',
    belly: '#86b8cf', snout: '#c7edf7', eye: '#b5fbff', eyeGlow: '#8feaff', glowing: '#8feaff', size: 'huge',
    description: 'A serpent of ice that hunts beneath the aurora.', tags: ['dragon', 'boss', 'flying'],
  },
];

export const CREATURE_BY_KEY = new Map(CREATURES.map((c) => [c.key, c]));
export const CREATURES_LIST = CREATURES;
const cache = new Map<string, BBModel>();

function animalBodyTiles(body: string, belly: string, dark: string, light: string) {
  return {
    south: 'body', north: 'body', east: 'body', west: 'body', up: 'body', down: 'belly',
  };
}

function headTiles(face: string): Record<string, string> {
  return { south: face, north: 'body', east: 'body', west: 'body', up: 'body', down: 'body' };
}

function buildQuadruped(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  const sizeScale = spec.size === 'large' ? 1.25 : spec.size === 'small' ? 0.82 : 1;
  const legH = Math.round(7 * sizeScale);
  const bodyH = Math.round(7 * sizeScale);
  const bodyW = Math.round(9 * sizeScale);
  const bodyL = Math.round(15 * sizeScale);
  const bodyY = legH;
  const bodyTop = legH + bodyH;
  const headH = Math.round(7 * sizeScale);

  b.tile('body', paintFur(spec.base, spec.dark, spec.light, 61));
  b.tile('belly', paintFur(spec.belly ?? spec.light, spec.dark, shadeHex(spec.base, 0.25), 62));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.eyeGlow, style: spec.style, seed: 63 }));
  b.tile('hoof', paintFur(spec.dark, '#28221d', spec.base, 64));
  b.tile('horn', paintCloth('#d7ccb0', '#f3ecd9', 65));
  b.tile('tooth', (ctx) => { ctx.fillStyle = '#eee7d4'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#c8bfa9'; ctx.fillRect(0, 12, 16, 4); });
  b.tile('nose', paintAnimalFace({ base: spec.snout ?? spec.dark, snout: spec.snout ?? spec.dark, eye: spec.eye, style: spec.style, seed: 66 }));
  if (spec.spots) {
    b.tile('spots', (ctx) => {
      paintFur(spec.base, spec.dark, spec.light, 67)(ctx);
      const rand = mulberry32(68);
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(rand() * 11), y = Math.floor(rand() * 11);
        ctx.fillStyle = spec.dark;
        ctx.fillRect(x, y, 3 + Math.floor(rand() * 2), 2 + Math.floor(rand() * 2));
      }
    });
  }

  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, bodyY, 0], 'root');
  b.bone('head', [0, bodyTop - 2, bodyL / 2 - 1], 'body');
  b.bone('tail', [0, bodyTop - 1, -bodyL / 2], 'body');

  b.cube('body', 'torso', [-bodyW / 2, bodyY, -bodyL / 2], [bodyW / 2, bodyTop, bodyL / 2], spec.spots ? { south: 'spots', north: 'spots', east: 'spots', west: 'spots', up: 'spots', down: 'belly' } : animalBodyTiles(spec.base, spec.belly ?? spec.light, spec.dark, spec.light));
  b.cube('head', 'head', [-bodyW / 2 + 0.5, bodyTop - 3, bodyL / 2 - 1], [bodyW / 2 - 0.5, bodyTop - 3 + headH, bodyL / 2 - 1 + headH], headTiles('face'));
  b.cube('head', 'snout', [-2.1, bodyTop - 2.3, bodyL / 2 - 1 + headH - 0.2], [2.1, bodyTop + 0.8, bodyL / 2 - 1 + headH + 2.4], 'nose');
  b.cube('head', 'ear_r', [-bodyW / 2 + 0.3, bodyTop - 3 + headH - 0.5, bodyL / 2], [-bodyW / 2 + 2.2, bodyTop - 3 + headH + 2.8, bodyL / 2 + 1.6], 'body');
  b.cube('head', 'ear_l', [bodyW / 2 - 2.2, bodyTop - 3 + headH - 0.5, bodyL / 2], [bodyW / 2 - 0.3, bodyTop - 3 + headH + 2.8, bodyL / 2 + 1.6], 'body');
  if (spec.horns) {
    b.cube('head', 'horn_r', [-bodyW / 2 + 0.4, bodyTop - 3 + headH - 0.2, bodyL / 2 + 0.3], [-bodyW / 2 + 2, bodyTop - 3 + headH + 3.4, bodyL / 2 + 2], 'horn', { rotation: [0, 0, -20], origin: [-bodyW / 2 + 1, bodyTop - 3 + headH, bodyL / 2 + 1] });
    b.cube('head', 'horn_l', [bodyW / 2 - 2, bodyTop - 3 + headH - 0.2, bodyL / 2 + 0.3], [bodyW / 2 - 0.4, bodyTop - 3 + headH + 3.4, bodyL / 2 + 2], 'horn', { rotation: [0, 0, 20], origin: [bodyW / 2 - 1, bodyTop - 3 + headH, bodyL / 2 + 1] });
  }
  if (spec.tusks) {
    b.cube('head', 'tusk_r', [-2.6, bodyTop - 2.4, bodyL / 2 + headH + 2], [-1.7, bodyTop - 0.2, bodyL / 2 + headH + 2.8], 'tooth');
    b.cube('head', 'tusk_l', [1.7, bodyTop - 2.4, bodyL / 2 + headH + 2], [2.6, bodyTop - 0.2, bodyL / 2 + headH + 2.8], 'tooth');
  }
  b.cube('tail', 'tail', [-1, bodyTop - 3, -bodyL / 2 - 4], [1, bodyTop + 1, -bodyL / 2 + 0.5], 'body', { rotation: [-24, 0, 0], origin: [0, bodyTop, -bodyL / 2] });

  const legs: Array<[string, number, number]> = [
    ['leg_fl', -bodyW / 2 + 1.4, bodyL / 2 - 3],
    ['leg_fr', bodyW / 2 - 1.4, bodyL / 2 - 3],
    ['leg_bl', -bodyW / 2 + 1.4, -bodyL / 2 + 3],
    ['leg_br', bodyW / 2 - 1.4, -bodyL / 2 + 3],
  ];
  for (const [name, x, z] of legs) {
    b.bone(name, [x, legH, z], 'root');
    b.cube(name, name, [x - 1.35, 0, z - 1.35], [x + 1.35, legH, z + 1.35], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'belly', down: 'hoof' });
  }

  const legSwing = 26;
  b.anim({ name: 'idle', length: 2.8, loop: 'loop', channels: {
    head: { rotation: { '0': [0, 0, 0], '1.4': [4, 6, 0], '2.1': [-2, -4, 0], '2.8': [0, 0, 0] } },
    tail: { rotation: { '0': [-24, 0, 0], '0.7': [-24, 10, 0], '1.4': [-24, 0, 0], '2.1': [-24, -10, 0], '2.8': [-24, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '1.4': [0, 0.25, 0], '2.8': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 1.05, loop: 'loop', channels: {
    leg_fl: { rotation: { '0': [legSwing, 0, 0], '0.525': [-legSwing, 0, 0], '1.05': [legSwing, 0, 0] } },
    leg_br: { rotation: { '0': [legSwing, 0, 0], '0.525': [-legSwing, 0, 0], '1.05': [legSwing, 0, 0] } },
    leg_fr: { rotation: { '0': [-legSwing, 0, 0], '0.525': [legSwing, 0, 0], '1.05': [-legSwing, 0, 0] } },
    leg_bl: { rotation: { '0': [-legSwing, 0, 0], '0.525': [legSwing, 0, 0], '1.05': [-legSwing, 0, 0] } },
    head: { rotation: { '0': [0, 0, 0], '0.525': [2, 0, 0], '1.05': [0, 0, 0] } },
  } });
  b.anim({ name: 'run', length: 0.65, loop: 'loop', channels: {
    leg_fl: { rotation: { '0': [45, 0, 0], '0.325': [-45, 0, 0], '0.65': [45, 0, 0] } },
    leg_br: { rotation: { '0': [45, 0, 0], '0.325': [-45, 0, 0], '0.65': [45, 0, 0] } },
    leg_fr: { rotation: { '0': [-45, 0, 0], '0.325': [45, 0, 0], '0.65': [-45, 0, 0] } },
    leg_bl: { rotation: { '0': [-45, 0, 0], '0.325': [45, 0, 0], '0.65': [-45, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.16': [0, 0.5, 0], '0.325': [0, 0, 0], '0.48': [0, 0.5, 0], '0.65': [0, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.55, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.16': [18, 0, 0], '0.32': [-12, 0, 0], '0.55': [0, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.16': [0, 0, 2.4], '0.32': [0, 0, 0], '0.55': [0, 0, 0] } },
    leg_fl: { rotation: { '0': [0, 0, 0], '0.16': [-20, 0, 0], '0.55': [0, 0, 0] } },
    leg_fr: { rotation: { '0': [0, 0, 0], '0.16': [-20, 0, 0], '0.55': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.35, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.12': [-16, 0, 10], '0.35': [0, 0, 0] } },
    body: { rotation: { '0': [0, 0, 0], '0.12': [0, 0, -5], '0.35': [0, 0, 0] } },
  } });
  b.anim({ name: 'death', length: 1.1, loop: 'hold', channels: {
    root: { rotation: { '0': [0, 0, 0], '0.55': [0, 0, -82], '1.1': [0, 0, -88] }, position: { '0': [0, 0, 0], '1.1': [0, -2, 0] } },
    head: { rotation: { '0': [0, 0, 0], '0.5': [-25, 0, 0], '1.1': [-35, 0, 0] } },
  } });
  b.anim({ name: 'sit', length: 2, loop: 'loop', channels: {
    body: { rotation: { '0': [0, 0, 12], '2': [0, 0, 12] }, position: { '0': [0, -2, 0], '2': [0, -2, 0] } },
    head: { rotation: { '0': [-10, 0, 0], '2': [-10, 0, 0] } },
    tail: { rotation: { '0': [-10, 20, 0], '1': [-10, -10, 0], '2': [-10, 20, 0] } },
  } });
  return b;
}

function buildBird(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  b.tile('body', paintWool(spec.base, spec.dark, 71));
  b.tile('belly', paintWool(spec.belly ?? spec.light, spec.dark, 72));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? '#d9a33c', eye: spec.eye, eyeGlow: spec.eyeGlow, style: spec.style ?? 'chicken', seed: 73 }));
  b.tile('beak', paintCloth(spec.snout ?? '#d9a33c', shadeHex(spec.snout ?? '#d9a33c', 0.2), 74));
  b.tile('wing', paintWool(shadeHex(spec.base, -0.12), spec.dark, 75));
  b.tile('leg', paintMetal('#c59a42', '#f0cf7a', 76));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 5, 0], 'root');
  b.bone('head', [0, 9, 3], 'body');
  b.bone('wing_r', [-3, 8, 0], 'body');
  b.bone('wing_l', [3, 8, 0], 'body');
  b.bone('leg_r', [-2, 5, 0], 'root');
  b.bone('leg_l', [2, 5, 0], 'root');
  b.cube('body', 'body', [-3.5, 3, -5], [3.5, 11, 5], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'body', down: 'belly' });
  b.cube('head', 'head', [-2.5, 9, 2], [2.5, 14, 7], headTiles('face'));
  b.cube('head', 'beak', [-1.1, 10, 7], [1.1, 11.6, 9.4], 'beak');
  b.cube('head', 'comb', [-0.8, 14, 3], [0.8, 16, 6], 'beak');
  b.cube('wing_r', 'wing_r', [-4.5, 4, -4], [-3.4, 10, 4], 'wing');
  b.cube('wing_l', 'wing_l', [3.4, 4, -4], [4.5, 10, 4], 'wing');
  b.cube('leg_r', 'leg_r', [-2.4, 0, -0.5], [-1.6, 5, 0.5], 'leg');
  b.cube('leg_l', 'leg_l', [1.6, 0, -0.5], [2.4, 5, 0.5], 'leg');

  b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.6': [0, 14, 0], '1.2': [0, -6, 0], '2': [0, 0, 0] } },
    wing_r: { rotation: { '0': [0, 0, 0], '1': [0, 0, -8], '2': [0, 0, 0] } },
    wing_l: { rotation: { '0': [0, 0, 0], '1': [0, 0, 8], '2': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 0.8, loop: 'loop', channels: {
    leg_r: { rotation: { '0': [24, 0, 0], '0.4': [-24, 0, 0], '0.8': [24, 0, 0] } },
    leg_l: { rotation: { '0': [-24, 0, 0], '0.4': [24, 0, 0], '0.8': [-24, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.2': [0, 0.8, 0], '0.4': [0, 0, 0], '0.6': [0, 0.8, 0], '0.8': [0, 0, 0] } },
    head: { rotation: { '0': [0, 0, 0], '0.4': [4, 0, 0], '0.8': [0, 0, 0] } },
  } });
  b.anim({ name: 'run', length: 0.5, loop: 'loop', channels: {
    leg_r: { rotation: { '0': [38, 0, 0], '0.25': [-38, 0, 0], '0.5': [38, 0, 0] } },
    leg_l: { rotation: { '0': [-38, 0, 0], '0.25': [38, 0, 0], '0.5': [-38, 0, 0] } },
    wing_r: { rotation: { '0': [0, 0, -30], '0.25': [0, 0, 10], '0.5': [0, 0, -30] } },
    wing_l: { rotation: { '0': [0, 0, 30], '0.25': [0, 0, -10], '0.5': [0, 0, 30] } },
  } });
  b.anim({ name: 'fly', length: 0.5, loop: 'loop', channels: {
    wing_r: { rotation: { '0': [0, 0, -55], '0.25': [0, 0, 20], '0.5': [0, 0, -55] } },
    wing_l: { rotation: { '0': [0, 0, 55], '0.25': [0, 0, -20], '0.5': [0, 0, 55] } },
    body: { position: { '0': [0, 0, 0], '0.25': [0, 1, 0], '0.5': [0, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.5, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.15': [30, 0, 0], '0.3': [-10, 0, 0], '0.5': [0, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.15': [0, 0, 1.8], '0.5': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.35, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.12': [-20, 0, 12], '0.35': [0, 0, 0] } },
  } });
  b.anim({ name: 'death', length: 1, loop: 'hold', channels: {
    root: { rotation: { '0': [0, 0, 0], '0.5': [0, 0, -80], '1': [0, 0, -88] }, position: { '0': [0, 0, 0], '1': [0, -2, 0] } },
  } });
  return b;
}

function buildSlime(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  b.tile('body', paintGlow(spec.base, spec.glowing ?? spec.light, 81));
  b.tile('core', paintGlow(spec.dark, spec.glowing ?? spec.light, 82));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.glowing, style: 'slime', seed: 83 }));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 0, 0], 'root');
  b.cube('body', 'outer', [-6, 0, -6], [6, 12, 6], { south: 'face', north: 'body', east: 'body', west: 'body', up: 'body', down: 'body' });
  b.cube('body', 'core', [-2.4, 3, -2.4], [2.4, 8, 2.4], 'core');
  b.cube('body', 'drip_r', [-7, 1, -3], [-5.4, 4, 3], 'body');
  b.cube('body', 'drip_l', [5.4, 2, -3], [7, 5, 3], 'body');
  b.anim({ name: 'idle', length: 1.8, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.9': [0, 0.3, 0], '1.8': [0, 0, 0] }, scale: { '0': [1, 1, 1], '0.45': [1.04, 0.94, 1.04], '0.9': [0.97, 1.06, 0.97], '1.8': [1, 1, 1] } },
  } });
  b.anim({ name: 'walk', length: 0.8, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.2': [0, 2.2, 0], '0.4': [0, 0, 0], '0.6': [0, 2.2, 0], '0.8': [0, 0, 0] }, scale: { '0': [1.12, 0.86, 1.12], '0.2': [0.9, 1.16, 0.9], '0.4': [1.12, 0.86, 1.12], '0.6': [0.9, 1.16, 0.9], '0.8': [1.12, 0.86, 1.12] } },
  } });
  b.anim({ name: 'run', length: 0.55, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.14': [0, 3.4, 0], '0.28': [0, 0, 0], '0.42': [0, 3.4, 0], '0.55': [0, 0, 0] }, scale: { '0': [1.18, 0.8, 1.18], '0.14': [0.86, 1.22, 0.86], '0.28': [1.18, 0.8, 1.18], '0.42': [0.86, 1.22, 0.86], '0.55': [1.18, 0.8, 1.18] } },
  } });
  b.anim({ name: 'attack', length: 0.5, loop: 'once', channels: {
    root: { position: { '0': [0, 0, 0], '0.15': [0, 4, 2.8], '0.32': [0, 0, 0], '0.5': [0, 0, 0] }, scale: { '0': [1, 1, 1], '0.15': [0.82, 1.2, 0.82], '0.5': [1, 1, 1] } },
  } });
  b.anim({ name: 'hurt', length: 0.35, loop: 'once', channels: {
    root: { scale: { '0': [1, 1, 1], '0.12': [1.3, 0.7, 1.3], '0.35': [1, 1, 1] } },
  } });
  b.anim({ name: 'death', length: 0.8, loop: 'hold', channels: {
    root: { scale: { '0': [1, 1, 1], '0.35': [1.35, 0.4, 1.35], '0.8': [0.2, 0.05, 0.2] }, position: { '0': [0, 0, 0], '0.8': [0, -1, 0] } },
  } });
  return b;
}

function buildSpider(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  b.tile('body', paintScale(spec.base, spec.dark, spec.light, 84));
  b.tile('belly', paintFur(spec.belly ?? spec.light, spec.dark, spec.light, 85));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.eyeGlow, style: 'cow', seed: 86 }));
  b.tile('leg', paintScale(shadeHex(spec.base, -0.1), spec.dark, spec.light, 87));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 5, -1], 'root');
  b.bone('head', [0, 6, 6], 'body');
  b.cube('body', 'abdomen', [-5, 5, -9], [5, 13, 3], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'body', down: 'belly' });
  b.cube('head', 'head', [-3.5, 5, 3], [3.5, 11, 9], headTiles('face'));
  b.cube('head', 'fang_r', [-1.8, 5, 8.5], [-0.7, 7, 10], '#d9cfb4');
  b.cube('head', 'fang_l', [0.7, 5, 8.5], [1.8, 7, 10], '#d9cfb4');
  for (let i = 0; i < 4; i++) {
    const z = -6 + i * 3.4;
    for (const side of ['r', 'l'] as const) {
      const sign = side === 'r' ? -1 : 1;
      const name = `leg_${side}${i}`;
      b.bone(name, [sign * 4, 7, z], 'body');
      b.cube(name, `${name}_upper`, [sign * 4 - 0.8, 4.2, z - 0.8], [sign * 9.5, 8, z + 0.8], 'leg', { rotation: [0, 0, sign * -22], origin: [sign * 4, 7, z] });
      b.cube(name, `${name}_lower`, [sign * 8.6, 0, z - 0.7], [sign * 9.8, 6.4, z + 0.7], 'leg');
    }
  }
  b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
    body: { position: { '0': [0, 0, 0], '1': [0, 0.3, 0], '2': [0, 0, 0] } },
    head: { rotation: { '0': [0, 0, 0], '0.7': [0, 8, 0], '1.4': [0, -5, 0], '2': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 0.85, loop: 'loop', channels: {
    leg_r0: { rotation: { '0': [0, 18, 0], '0.42': [0, -18, 0], '0.85': [0, 18, 0] } },
    leg_l1: { rotation: { '0': [0, 18, 0], '0.42': [0, -18, 0], '0.85': [0, 18, 0] } },
    leg_r2: { rotation: { '0': [0, 18, 0], '0.42': [0, -18, 0], '0.85': [0, 18, 0] } },
    leg_l3: { rotation: { '0': [0, 18, 0], '0.42': [0, -18, 0], '0.85': [0, 18, 0] } },
    leg_l0: { rotation: { '0': [0, -18, 0], '0.42': [0, 18, 0], '0.85': [0, -18, 0] } },
    leg_r1: { rotation: { '0': [0, -18, 0], '0.42': [0, 18, 0], '0.85': [0, -18, 0] } },
    leg_l2: { rotation: { '0': [0, -18, 0], '0.42': [0, 18, 0], '0.85': [0, -18, 0] } },
    leg_r3: { rotation: { '0': [0, -18, 0], '0.42': [0, 18, 0], '0.85': [0, -18, 0] } },
  } });
  b.anim({ name: 'run', length: 0.55, loop: 'loop', channels: {
    leg_r0: { rotation: { '0': [0, 35, 0], '0.27': [0, -35, 0], '0.55': [0, 35, 0] } },
    leg_l1: { rotation: { '0': [0, 35, 0], '0.27': [0, -35, 0], '0.55': [0, 35, 0] } },
    leg_r2: { rotation: { '0': [0, 35, 0], '0.27': [0, -35, 0], '0.55': [0, 35, 0] } },
    leg_l3: { rotation: { '0': [0, 35, 0], '0.27': [0, -35, 0], '0.55': [0, 35, 0] } },
    leg_l0: { rotation: { '0': [0, -35, 0], '0.27': [0, 35, 0], '0.55': [0, -35, 0] } },
    leg_r1: { rotation: { '0': [0, -35, 0], '0.27': [0, 35, 0], '0.55': [0, -35, 0] } },
    leg_l2: { rotation: { '0': [0, -35, 0], '0.27': [0, 35, 0], '0.55': [0, -35, 0] } },
    leg_r3: { rotation: { '0': [0, -35, 0], '0.27': [0, 35, 0], '0.55': [0, -35, 0] } },
    body: { position: { '0': [0, 0, 0], '0.27': [0, 0.5, 0], '0.55': [0, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.45, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.12': [20, 0, 0], '0.45': [0, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.12': [0, 0, 3], '0.45': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { head: { rotation: { '0': [0, 0, 0], '0.1': [-15, 0, 8], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: {
    root: { rotation: { '0': [0, 0, 0], '0.45': [0, 0, 75], '0.9': [0, 0, 88] }, position: { '0': [0, 0, 0], '0.9': [0, -1, 0] } },
  } });
  return b;
}

function buildCreeper(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder('creature_creeper');
  b.tile('body', paintFabric(spec.base, spec.dark, 'grid', 88));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, style: 'creeper', seed: 89 }));
  b.tile('foot', paintFur(spec.dark, '#283d26', spec.light, 90));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 5, 0], 'root');
  b.bone('head', [0, 17, 0], 'body');
  for (const [name, x, z] of [['leg_fl', -2.4, 2.4], ['leg_fr', 2.4, 2.4], ['leg_bl', -2.4, -2.4], ['leg_br', 2.4, -2.4]] as const) {
    b.bone(name, [x, 5, z], 'root');
    b.cube(name, name, [x - 1.7, 0, z - 1.7], [x + 1.7, 5, z + 1.7], { south: 'foot', north: 'foot', east: 'foot', west: 'foot', up: 'body', down: 'foot' });
  }
  b.cube('body', 'torso', [-3.3, 5, -2.6], [3.3, 17, 2.6], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'body', down: 'body' });
  b.cube('head', 'head', [-4, 17, -4], [4, 25, 4], { south: 'face', north: 'body', east: 'body', west: 'body', up: 'body', down: 'body' });
  b.anim({ name: 'idle', length: 2.4, loop: 'loop', channels: {
    body: { position: { '0': [0, 0, 0], '1.2': [0, 0.2, 0], '2.4': [0, 0, 0] } },
    head: { rotation: { '0': [0, 0, 0], '0.8': [0, 10, 0], '1.6': [0, -10, 0], '2.4': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 1, loop: 'loop', channels: {
    leg_fl: { rotation: { '0': [22, 0, 0], '0.25': [0, 0, 0], '0.5': [-22, 0, 0], '0.75': [0, 0, 0], '1': [22, 0, 0] } },
    leg_br: { rotation: { '0': [22, 0, 0], '0.25': [0, 0, 0], '0.5': [-22, 0, 0], '0.75': [0, 0, 0], '1': [22, 0, 0] } },
    leg_fr: { rotation: { '0': [-22, 0, 0], '0.25': [0, 0, 0], '0.5': [22, 0, 0], '0.75': [0, 0, 0], '1': [-22, 0, 0] } },
    leg_bl: { rotation: { '0': [-22, 0, 0], '0.25': [0, 0, 0], '0.5': [22, 0, 0], '0.75': [0, 0, 0], '1': [-22, 0, 0] } },
  } });
  b.anim({ name: 'run', length: 0.6, loop: 'loop', channels: {
    leg_fl: { rotation: { '0': [40, 0, 0], '0.3': [-40, 0, 0], '0.6': [40, 0, 0] } },
    leg_br: { rotation: { '0': [40, 0, 0], '0.3': [-40, 0, 0], '0.6': [40, 0, 0] } },
    leg_fr: { rotation: { '0': [-40, 0, 0], '0.3': [40, 0, 0], '0.6': [-40, 0, 0] } },
    leg_bl: { rotation: { '0': [-40, 0, 0], '0.3': [40, 0, 0], '0.6': [-40, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.9, loop: 'once', channels: {
    root: { scale: { '0': [1, 1, 1], '0.4': [1.18, 1.12, 1.18], '0.8': [1.35, 1.25, 1.35], '0.9': [1.5, 1.4, 1.5] } },
    head: { rotation: { '0': [0, 0, 0], '0.4': [-10, 0, 0], '0.9': [-20, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { head: { rotation: { '0': [0, 0, 0], '0.1': [-18, 0, 10], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: { root: { rotation: { '0': [0, 0, 0], '0.5': [0, 0, -82], '0.9': [0, 0, -88] }, position: { '0': [0, 0, 0], '0.9': [0, -1, 0] } } } });
  return b;
}

function buildGolem(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  b.tile('body', paintMetal(spec.base, spec.glowing ?? spec.light, 91));
  b.tile('rock', paintFur(spec.base, spec.dark, spec.light, 92));
  b.tile('face', paintMetal(shadeHex(spec.base, -0.12), spec.eyeGlow ?? '#7fe5ff', 93));
  b.tile('core', paintGlow(spec.dark, spec.glowing ?? spec.light, 94));
  b.tile('moss', paintFur('#6b7a52', '#435034', '#93a275', 95));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 12, 0], 'root');
  b.bone('head', [0, 38, 0], 'body');
  b.bone('right_arm', [-12, 35, 0], 'body');
  b.bone('left_arm', [12, 35, 0], 'body');
  b.bone('right_leg', [-5.5, 12, 0], 'root');
  b.bone('left_leg', [5.5, 12, 0], 'root');
  b.cube('body', 'torso', [-10, 12, -6], [10, 36, 6], { south: 'rock', north: 'rock', east: 'rock', west: 'rock', up: 'moss', down: 'rock' });
  b.cube('body', 'core', [-3, 20, 5.6], [3, 26, 7.1], 'core');
  b.cube('body', 'shoulder_r', [-14, 30, -5], [-8, 36, 5], 'rock');
  b.cube('body', 'shoulder_l', [8, 30, -5], [14, 36, 5], 'rock');
  b.cube('head', 'head', [-7, 38, -5], [7, 48, 5], { south: 'face', north: 'rock', east: 'rock', west: 'rock', up: 'moss', down: 'rock' });
  b.cube('head', 'brow', [-7.5, 44, -5.5], [7.5, 46, 5.5], 'rock');
  b.cube('head', 'jaw', [-4, 38, -6], [4, 41, 5], 'rock');
  b.cube('right_arm', 'arm_r', [-16, 10, -4], [-9, 34, 4], 'rock');
  b.cube('right_arm', 'fist_r', [-18, 4, -5], [-8, 12, 5], 'rock');
  b.cube('left_arm', 'arm_l', [9, 10, -4], [16, 34, 4], 'rock');
  b.cube('left_arm', 'fist_l', [8, 4, -5], [18, 12, 5], 'rock');
  b.cube('right_leg', 'leg_r', [-9, 0, -4], [-2, 13, 4], 'rock');
  b.cube('left_leg', 'leg_l', [2, 0, -4], [9, 13, 4], 'rock');
  b.cube('body', 'rune_1', [-9.8, 22, 4.5], [-7.8, 28, 6.3], 'core');
  b.cube('body', 'rune_2', [7.8, 15, 4.5], [9.8, 20, 6.3], 'core');
  b.anim({ name: 'idle', length: 3.2, loop: 'loop', channels: {
    body: { position: { '0': [0, 0, 0], '1.6': [0, 0.6, 0], '3.2': [0, 0, 0] } },
    head: { rotation: { '0': [0, 0, 0], '1.2': [0, 7, 0], '2.4': [0, -7, 0], '3.2': [0, 0, 0] } },
    right_arm: { rotation: { '0': [0, 0, 0], '1.6': [0, 0, -3], '3.2': [0, 0, 0] } },
    left_arm: { rotation: { '0': [0, 0, 0], '1.6': [0, 0, 3], '3.2': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 1.5, loop: 'loop', channels: {
    right_leg: { rotation: { '0': [20, 0, 0], '0.75': [-20, 0, 0], '1.5': [20, 0, 0] } },
    left_leg: { rotation: { '0': [-20, 0, 0], '0.75': [20, 0, 0], '1.5': [-20, 0, 0] } },
    right_arm: { rotation: { '0': [-15, 0, 0], '0.75': [15, 0, 0], '1.5': [-15, 0, 0] } },
    left_arm: { rotation: { '0': [15, 0, 0], '0.75': [-15, 0, 0], '1.5': [15, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.375': [0, 0.8, 0], '0.75': [0, 0, 0], '1.125': [0, 0.8, 0], '1.5': [0, 0, 0] } },
  } });
  b.anim({ name: 'run', length: 1, loop: 'loop', channels: {
    right_leg: { rotation: { '0': [35, 0, 0], '0.5': [-35, 0, 0], '1': [35, 0, 0] } },
    left_leg: { rotation: { '0': [-35, 0, 0], '0.5': [35, 0, 0], '1': [-35, 0, 0] } },
    right_arm: { rotation: { '0': [-30, 0, 0], '0.5': [30, 0, 0], '1': [-30, 0, 0] } },
    left_arm: { rotation: { '0': [30, 0, 0], '0.5': [-30, 0, 0], '1': [30, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 1, loop: 'once', channels: {
    right_arm: { rotation: { '0': [0, 0, 0], '0.3': [-150, 0, -18], '0.5': [-45, 0, -8], '1': [0, 0, 0] } },
    left_arm: { rotation: { '0': [0, 0, 0], '0.3': [-137, 0, 18], '0.5': [-35, 0, 8], '1': [0, 0, 0] } },
    body: { rotation: { '0': [0, 0, 0], '0.3': [10, 0, 0], '1': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.45, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.15': [-15, 0, 8], '0.45': [0, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.15': [0, 0, -1], '0.45': [0, 0, 0] } },
  } });
  b.anim({ name: 'death', length: 1.6, loop: 'hold', channels: {
    root: { rotation: { '0': [0, 0, 0], '0.8': [80, 0, 0], '1.6': [88, 0, 0] }, position: { '0': [0, 0, 0], '1.6': [0, -9, 0] } },
    head: { rotation: { '0': [0, 0, 0], '1.6': [35, 0, 0] } },
  } });
  return b;
}

function buildDragon(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  b.tile('scale', paintScale(spec.base, spec.dark, spec.light, 96));
  b.tile('belly', paintScale(spec.belly ?? spec.light, spec.dark, spec.light, 97));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.eyeGlow, style: 'dragon', seed: 98 }));
  b.tile('wing', (ctx) => {
    paintCloth(spec.dark, spec.light, 99)(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 1, 16);
  });
  b.tile('horn', paintCloth('#d9cdb2', '#f4eddd', 100));
  b.tile('fire', paintGlow(spec.glowing ?? '#ff6a30', '#fff2b8', 101));
  b.tile('claw', paintCloth('#e0d8c3', '#fff9ec', 102));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 24, 0], 'root');
  b.bone('neck', [0, 28, 8], 'body');
  b.bone('head', [0, 34, 18], 'neck');
  b.bone('tail', [0, 24, -12], 'body');
  b.bone('wing_r', [-6, 32, 4], 'body');
  b.bone('wing_l', [6, 32, 4], 'body');
  b.bone('leg_fr', [-7, 24, 8], 'root');
  b.bone('leg_fl', [7, 24, 8], 'root');
  b.bone('leg_br', [-7, 24, -6], 'root');
  b.bone('leg_bl', [7, 24, -6], 'root');
  b.cube('body', 'torso', [-9, 16, -14], [9, 30, 10], {
    south: 'scale', north: 'scale', east: 'scale', west: 'scale', up: 'scale', down: 'belly',
  });
  b.cube('body', 'chest', [-7, 24, 10], [7, 33, 15], 'scale');
  b.cube('neck', 'neck', [-5, 26, 9], [5, 36, 17], { south: 'scale', north: 'scale', east: 'scale', west: 'scale', up: 'scale', down: 'belly' }, { rotation: [25, 0, 0], origin: [0, 28, 8] });
  b.cube('head', 'head', [-6, 32, 16], [6, 40, 26], { south: 'face', north: 'scale', east: 'scale', west: 'scale', up: 'scale', down: 'belly' });
  b.cube('head', 'snout', [-4, 33, 25], [4, 37, 31], 'face');
  b.cube('head', 'jaw', [-3.5, 31, 24], [3.5, 33, 30], 'belly');
  b.cube('head', 'horn_r', [-5.5, 39, 18], [-2.8, 43, 29], 'horn', { rotation: [-15, 0, -18], origin: [-4, 40, 20] });
  b.cube('head', 'horn_l', [2.8, 39, 18], [5.5, 43, 29], 'horn', { rotation: [-15, 0, 18], origin: [4, 40, 20] });
  b.cube('head', 'eye_glow', [-6.2, 36, 21], [-3.8, 38.4, 25.4], 'fire');
  b.cube('head', 'eye_glow_l', [3.8, 36, 21], [6.2, 38.4, 25.4], 'fire');
  b.cube('body', 'spine_1', [-1, 30, -8], [1, 33, 6], 'horn');
  b.cube('body', 'spine_2', [-0.8, 30, -12], [0.8, 32, -8], 'horn');
  b.cube('wing_r', 'wing_r', [-35, 26, -10], [-6, 34, 8], 'wing', { rotation: [0, 0, 12], origin: [-6, 30, 4] });
  b.cube('wing_r', 'wing_r_tip', [-44, 28, -4], [-34, 33, 6], 'wing', { rotation: [0, 0, 24], origin: [-35, 30, 0] });
  b.cube('wing_l', 'wing_l', [6, 26, -10], [35, 34, 8], 'wing', { rotation: [0, 0, -12], origin: [6, 30, 4] });
  b.cube('wing_l', 'wing_l_tip', [34, 28, -4], [44, 33, 6], 'wing', { rotation: [0, 0, -24], origin: [35, 30, 0] });
  for (const [name, x, z, front] of [['leg_fr', -8, 8, true], ['leg_fl', 8, 8, true], ['leg_br', -8, -7, false], ['leg_bl', 8, -7, false]] as const) {
    b.cube(name, `${name}_leg`, [x - 3, 6, z - 3], [x + 3, 24, z + 3], 'scale');
    b.cube(name, `${name}_foot`, [x - 4, 2, z - 5], [x + 4, 7, z + 6], 'belly');
    b.cube(name, `${name}_claw`, [x - 3.8, 2, z + (front ? 5 : -6)], [x + 3.8, 4.2, z + (front ? 8 : -3)], 'claw');
  }
  b.cube('tail', 'tail_1', [-3, 20, -24], [3, 27, -10], 'scale', { rotation: [10, 0, 0], origin: [0, 24, -12] });
  b.cube('tail', 'tail_2', [-2, 17, -34], [2, 23, -23], 'scale', { rotation: [18, 0, 0], origin: [0, 24, -12] });
  b.cube('tail', 'tail_tip', [-4, 14, -42], [4, 21, -32], 'horn', { rotation: [24, 0, 0], origin: [0, 24, -12] });

  b.anim({ name: 'idle', length: 3, loop: 'loop', channels: {
    body: { position: { '0': [0, 0, 0], '1.5': [0, 1, 0], '3': [0, 0, 0] } },
    head: { rotation: { '0': [0, 0, 0], '1': [0, 12, 0], '2': [0, -8, 0], '3': [0, 0, 0] } },
    tail: { rotation: { '0': [0, 0, 0], '0.75': [0, 12, 0], '1.5': [0, 0, 0], '2.25': [0, -12, 0], '3': [0, 0, 0] } },
    wing_r: { rotation: { '0': [0, 0, 0], '1.5': [0, 0, -8], '3': [0, 0, 0] } },
    wing_l: { rotation: { '0': [0, 0, 0], '1.5': [0, 0, 8], '3': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 1.3, loop: 'loop', channels: {
    leg_fr: { rotation: { '0': [24, 0, 0], '0.65': [-24, 0, 0], '1.3': [24, 0, 0] } },
    leg_bl: { rotation: { '0': [24, 0, 0], '0.65': [-24, 0, 0], '1.3': [24, 0, 0] } },
    leg_fl: { rotation: { '0': [-24, 0, 0], '0.65': [24, 0, 0], '1.3': [-24, 0, 0] } },
    leg_br: { rotation: { '0': [-24, 0, 0], '0.65': [24, 0, 0], '1.3': [-24, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.325': [0, 1.2, 0], '0.65': [0, 0, 0], '0.975': [0, 1.2, 0], '1.3': [0, 0, 0] } },
    tail: { rotation: { '0': [0, -8, 0], '0.65': [0, 8, 0], '1.3': [0, -8, 0] } },
  } });
  b.anim({ name: 'run', length: 0.9, loop: 'loop', channels: {
    leg_fr: { rotation: { '0': [40, 0, 0], '0.45': [-40, 0, 0], '0.9': [40, 0, 0] } },
    leg_bl: { rotation: { '0': [40, 0, 0], '0.45': [-40, 0, 0], '0.9': [40, 0, 0] } },
    leg_fl: { rotation: { '0': [-40, 0, 0], '0.45': [40, 0, 0], '0.9': [-40, 0, 0] } },
    leg_br: { rotation: { '0': [-40, 0, 0], '0.45': [40, 0, 0], '0.9': [-40, 0, 0] } },
    wing_r: { rotation: { '0': [0, 0, -45], '0.45': [0, 0, 20], '0.9': [0, 0, -45] } },
    wing_l: { rotation: { '0': [0, 0, 45], '0.45': [0, 0, -20], '0.9': [0, 0, 45] } },
  } });
  b.anim({ name: 'fly', length: 0.8, loop: 'loop', channels: {
    wing_r: { rotation: { '0': [0, 0, -55], '0.4': [0, 0, 25], '0.8': [0, 0, -55] } },
    wing_l: { rotation: { '0': [0, 0, 55], '0.4': [0, 0, -25], '0.8': [0, 0, 55] } },
    body: { position: { '0': [0, 0, 0], '0.4': [0, 2, 0], '0.8': [0, 0, 0] } },
    tail: { rotation: { '0': [0, -6, 0], '0.4': [0, 6, 0], '0.8': [0, -6, 0] } },
  } });
  b.anim({ name: 'attack', length: 1.1, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.3': [20, 0, 0], '0.55': [-15, 0, 0], '1.1': [0, 0, 0] } },
    neck: { rotation: { '0': [25, 0, 0], '0.3': [42, 0, 0], '0.55': [10, 0, 0], '1.1': [25, 0, 0] } },
    body: { position: { '0': [0, 0, 0], '0.3': [0, 0, 3], '0.55': [0, 0, 0], '1.1': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.45, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.14': [-16, 0, 12], '0.45': [0, 0, 0] } },
    root: { position: { '0': [0, 0, 0], '0.14': [0, 0, -2], '0.45': [0, 0, 0] } },
  } });
  b.anim({ name: 'death', length: 2, loop: 'hold', channels: {
    root: { rotation: { '0': [0, 0, 0], '1': [0, 0, -70], '2': [0, 0, -88] }, position: { '0': [0, 0, 0], '2': [0, -18, 0] } },
    head: { rotation: { '0': [0, 0, 0], '2': [-30, 0, 0] } },
    wing_r: { rotation: { '0': [0, 0, 0], '2': [0, 0, -30] } },
    wing_l: { rotation: { '0': [0, 0, 0], '2': [0, 0, 30] } },
  } });
  return b;
}

function buildFish(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder(`creature_${spec.key}`);
  b.tile('body', paintScale(spec.base, spec.dark, spec.light, 103));
  b.tile('belly', paintScale(spec.belly ?? spec.light, spec.dark, spec.light, 104));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, style: 'wolf', seed: 105 }));
  b.tile('fin', paintCloth(shadeHex(spec.base, 0.15), spec.light, 106));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 0, 0], 'root');
  b.bone('tail', [0, 0, -7], 'body');
  b.cube('body', 'torso', [-3, 0, -8], [3, 6, 8], { south: 'face', north: 'body', east: 'body', west: 'body', up: 'body', down: 'belly' });
  b.cube('body', 'dorsal', [-0.5, 6, -4], [0.5, 9, 4], 'fin');
  b.cube('body', 'fin_r', [-5, 2, -2], [-3, 4, 3], 'fin');
  b.cube('body', 'fin_l', [3, 2, -2], [5, 4, 3], 'fin');
  b.cube('tail', 'tail', [-1, 1, -13], [1, 5, -7], 'fin', { rotation: [0, 35, 0], origin: [0, 3, -7] });
  b.cube('tail', 'tail_fin', [-4, 0, -10], [4, 7, -7], 'fin');
  b.anim({ name: 'idle', length: 1.6, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.8': [0, 0.4, 0], '1.6': [0, 0, 0] } },
    tail: { rotation: { '0': [0, 22, 0], '0.8': [0, -22, 0], '1.6': [0, 22, 0] } },
  } });
  b.anim({ name: 'walk', length: 1.2, loop: 'loop', channels: { tail: { rotation: { '0': [0, 26, 0], '0.3': [0, -26, 0], '0.6': [0, 26, 0], '0.9': [0, -26, 0], '1.2': [0, 26, 0] } } } });
  b.anim({ name: 'run', length: 0.6, loop: 'loop', channels: { tail: { rotation: { '0': [0, 38, 0], '0.15': [0, -38, 0], '0.3': [0, 38, 0], '0.45': [0, -38, 0], '0.6': [0, 38, 0] } } } });
  b.anim({ name: 'attack', length: 0.4, loop: 'once', channels: { root: { position: { '0': [0, 0, 0], '0.12': [0, 0, 3], '0.4': [0, 0, 0] } } } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { body: { rotation: { '0': [0, 0, 0], '0.1': [0, 0, 20], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: { root: { rotation: { '0': [0, 0, 0], '0.45': [0, 0, 80], '0.9': [0, 0, 90] }, position: { '0': [0, 0, 0], '0.9': [0, 2, 0] } } } });
  return b;
}

function buildBee(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder('creature_bee');
  b.tile('body', paintFabric(spec.base, spec.dark, 'stripes', 107));
  b.tile('belly', paintFabric(spec.belly ?? spec.light, spec.dark, 'stripes', 108));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.light, style: 'chicken', seed: 109 }));
  b.tile('wing', paintGlow('#dff6ff', '#ffffff', 110));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 6, 0], 'root');
  b.bone('wing_r', [-3, 10, 0], 'body');
  b.bone('wing_l', [3, 10, 0], 'body');
  b.cube('body', 'abdomen', [-4, 3, -9], [4, 11, 5], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'belly', down: 'belly' });
  b.cube('body', 'head', [-3, 8, 4], [3, 14, 10], headTiles('face'));
  b.cube('body', 'eye_r', [-2.8, 10, 9], [-0.8, 12, 10.2], '#1b1710');
  b.cube('body', 'eye_l', [0.8, 10, 9], [2.8, 12, 10.2], '#1b1710');
  b.cube('body', 'antenna_r', [-1.2, 14, 7], [-0.6, 18, 8], '#2c261e');
  b.cube('body', 'antenna_l', [0.6, 14, 7], [1.2, 18, 8], '#2c261e');
  b.cube('body', 'stinger', [0, 3, -11], [1, 5.5, -8], '#3a3025');
  b.cube('wing_r', 'wing_r', [-13, 9, -3], [-3, 10.5, 4], 'wing', { rotation: [0, 0, -8], origin: [-3, 10, 0] });
  b.cube('wing_l', 'wing_l', [3, 9, -3], [13, 10.5, 4], 'wing', { rotation: [0, 0, 8], origin: [3, 10, 0] });
  b.anim({ name: 'fly', length: 0.35, loop: 'loop', channels: {
    wing_r: { rotation: { '0': [0, 0, -45], '0.175': [0, 0, 20], '0.35': [0, 0, -45] } },
    wing_l: { rotation: { '0': [0, 0, 45], '0.175': [0, 0, -20], '0.35': [0, 0, 45] } },
    body: { position: { '0': [0, 0, 0], '0.175': [0, 1.2, 0], '0.35': [0, 0, 0] } },
  } });
  b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
    wing_r: { rotation: { '0': [0, 0, -18], '0.3': [0, 0, 5], '0.6': [0, 0, -18], '0.9': [0, 0, 5], '1.2': [0, 0, -18], '2': [0, 0, -18] } },
    wing_l: { rotation: { '0': [0, 0, 18], '0.3': [0, 0, -5], '0.6': [0, 0, 18], '0.9': [0, 0, -5], '1.2': [0, 0, 18], '2': [0, 0, 18] } },
    root: { position: { '0': [0, 0, 0], '1': [0, 1, 0], '2': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 1, loop: 'loop', channels: { root: { position: { '0': [0, 0, 0], '0.5': [0, 1, 0], '1': [0, 0, 0] } } } });
  b.anim({ name: 'run', length: 2, loop: 'loop', channels: { root: { position: { '0': [0, 0, 0], '0.5': [0, 1, 0], '1': [0, 2, 0], '1.5': [0, 1, 0], '2': [0, 0, 0] } } } });
  b.anim({ name: 'attack', length: 0.4, loop: 'once', channels: { root: { position: { '0': [0, 0, 0], '0.12': [0, 1, 3], '0.4': [0, 0, 0] } } } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { body: { rotation: { '0': [0, 0, 0], '0.1': [0, 0, 20], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: { root: { rotation: { '0': [0, 0, 0], '0.45': [80, 0, 0], '0.9': [88, 0, 0] }, position: { '0': [0, 0, 0], '0.9': [0, -2, 0] } } } });
  return b;
}

function buildMushroom(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder('creature_mushroomling');
  b.tile('body', paintSkin(spec.base, 111));
  b.tile('belly', paintSkin(spec.belly ?? spec.light, 112));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.eyeGlow, style: 'slime', seed: 113 }));
  b.tile('cap', (ctx) => {
    paintFur('#b04a42', '#7b302c', '#d87567', 114)(ctx);
    ctx.fillStyle = '#f0e8d4';
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(10, 2, 2, 2);
    ctx.fillRect(8, 8, 2, 2);
    ctx.fillRect(2, 10, 2, 2);
    ctx.fillRect(12, 9, 2, 2);
  });
  b.tile('stem', paintCloth('#d8c7a3', '#f2e6ce', 115));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 2, 0], 'root');
  b.bone('head', [0, 8, 0], 'body');
  b.bone('arm_r', [-3, 6, 0], 'body');
  b.bone('arm_l', [3, 6, 0], 'body');
  b.cube('body', 'stem', [-3, 0, -2.5], [3, 9, 2.5], { south: 'stem', north: 'stem', east: 'stem', west: 'stem', up: 'stem', down: 'stem' });
  b.cube('body', 'torso', [-3.6, 3, -3], [3.6, 9, 3], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'belly', down: 'belly' });
  b.cube('head', 'head', [-3.5, 9, -3.2], [3.5, 15, 3.2], headTiles('face'));
  b.cube('head', 'cap', [-7, 14, -7], [7, 20, 7], { south: 'cap', north: 'cap', east: 'cap', west: 'cap', up: 'cap', down: 'belly' });
  b.cube('head', 'cap_rim', [-8, 13, -8], [8, 15, 8], 'cap');
  b.cube('arm_r', 'arm_r', [-6, 3, -2], [-3, 8, 2], 'body');
  b.cube('arm_l', 'arm_l', [3, 3, -2], [6, 8, 2], 'body');
  b.cube('body', 'foot_r', [-4, 0, -3], [-0.5, 2.5, 4], 'stem');
  b.cube('body', 'foot_l', [0.5, 0, -3], [4, 2.5, 4], 'stem');
  b.anim({ name: 'idle', length: 1.8, loop: 'loop', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.6': [-3, 8, 0], '1.2': [2, -6, 0], '1.8': [0, 0, 0] } },
    arm_r: { rotation: { '0': [0, 0, 0], '0.9': [0, 0, -10], '1.8': [0, 0, 0] } },
    arm_l: { rotation: { '0': [0, 0, 0], '0.9': [0, 0, 10], '1.8': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 0.9, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.225': [0, 1, 0], '0.45': [0, 0, 0], '0.675': [0, 1, 0], '0.9': [0, 0, 0] } },
    body: { rotation: { '0': [0, 0, -4], '0.45': [0, 0, 4], '0.9': [0, 0, -4] } },
  } });
  b.anim({ name: 'run', length: 0.6, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.15': [0, 1.6, 0], '0.3': [0, 0, 0], '0.45': [0, 1.6, 0], '0.6': [0, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.45, loop: 'once', channels: {
    head: { rotation: { '0': [0, 0, 0], '0.12': [25, 0, 0], '0.3': [-8, 0, 0], '0.45': [0, 0, 0] } },
    root: { position: { '0': [0, 0, 0], '0.12': [0, 0, 2], '0.45': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { head: { rotation: { '0': [0, 0, 0], '0.1': [-18, 0, 10], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: { root: { rotation: { '0': [0, 0, 0], '0.45': [0, 0, -82], '0.9': [0, 0, -88] }, position: { '0': [0, 0, 0], '0.9': [0, -1, 0] } } } });
  return b;
}

function buildScorpion(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder('creature_scorpion');
  b.tile('body', paintScale(spec.base, spec.dark, spec.light, 116));
  b.tile('belly', paintFur(spec.belly ?? spec.light, spec.dark, spec.light, 117));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.eyeGlow, style: 'cow', seed: 118 }));
  b.tile('claw', paintScale(shadeHex(spec.light, 0.1), spec.dark, spec.light, 119));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 4, 0], 'root');
  b.bone('head', [0, 5, 8], 'body');
  b.bone('tail', [0, 6, -10], 'body');
  b.bone('claw_r', [-4, 7, 6], 'body');
  b.bone('claw_l', [4, 7, 6], 'body');
  b.cube('body', 'abdomen', [-5, 3, -10], [5, 10, 7], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'body', down: 'belly' });
  b.cube('head', 'head', [-4, 4, 7], [4, 9, 13], headTiles('face'));
  b.cube('tail', 'tail_1', [-2, 6, -17], [2, 11, -9], 'body', { rotation: [-20, 0, 0], origin: [0, 8, -10] });
  b.cube('tail', 'tail_2', [-1.5, 12, -22], [1.5, 16, -14], 'body', { rotation: [-38, 0, 0], origin: [0, 8, -10] });
  b.cube('tail', 'stinger', [-2, 16, -27], [2, 20, -21], 'claw', { rotation: [-55, 0, 0], origin: [0, 8, -10] });
  b.cube('claw_r', 'claw_arm', [-8, 4, 4], [-4, 8, 7], 'body');
  b.cube('claw_r', 'claw_head', [-12, 5, 8], [-6, 10, 13], 'claw');
  b.cube('claw_r', 'claw_pincer', [-13, 6, 10], [-10, 9, 15], 'claw');
  b.cube('claw_l', 'claw_arm', [4, 4, 4], [8, 8, 7], 'body');
  b.cube('claw_l', 'claw_head', [6, 5, 8], [12, 10, 13], 'claw');
  b.cube('claw_l', 'claw_pincer', [10, 6, 10], [13, 9, 15], 'claw');
  for (let i = 0; i < 3; i++) {
    const z = -7 + i * 4;
    for (const side of ['r', 'l'] as const) {
      const sign = side === 'r' ? -1 : 1;
      b.cube('body', `leg_${side}${i}`, [sign * 4, 0, z - 1], [sign * 10, 4, z + 1], 'body', { rotation: [0, 0, sign * -18], origin: [sign * 4, 3, z] });
    }
  }
  b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
    tail: { rotation: { '0': [0, 0, 0], '1': [0, 12, 0], '2': [0, 0, 0] } },
    claw_r: { rotation: { '0': [0, 0, 0], '0.7': [0, 0, -6], '1.4': [0, 0, 0], '2': [0, 0, 0] } },
    claw_l: { rotation: { '0': [0, 0, 0], '0.7': [0, 0, 6], '1.4': [0, 0, 0], '2': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 0.9, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.225': [0, 0.5, 0], '0.45': [0, 0, 0], '0.675': [0, 0.5, 0], '0.9': [0, 0, 0] } },
    tail: { rotation: { '0': [0, -8, 0], '0.45': [0, 8, 0], '0.9': [0, -8, 0] } },
  } });
  b.anim({ name: 'run', length: 0.6, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.15': [0, 1, 0], '0.3': [0, 0, 0], '0.45': [0, 1, 0], '0.6': [0, 0, 0] } },
    tail: { rotation: { '0': [0, -18, 0], '0.3': [0, 18, 0], '0.6': [0, -18, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.55, loop: 'once', channels: {
    claw_r: { rotation: { '0': [0, 0, 0], '0.15': [-20, -20, -15], '0.3': [10, 10, 0], '0.55': [0, 0, 0] } },
    claw_l: { rotation: { '0': [0, 0, 0], '0.15': [-20, 20, 15], '0.3': [10, -10, 0], '0.55': [0, 0, 0] } },
    tail: { rotation: { '0': [0, 0, 0], '0.25': [-20, 0, 0], '0.55': [0, 0, 0] } },
  } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { head: { rotation: { '0': [0, 0, 0], '0.1': [-15, 0, 10], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: { root: { rotation: { '0': [0, 0, 0], '0.45': [0, 0, -80], '0.9': [0, 0, -88] }, position: { '0': [0, 0, 0], '0.9': [0, -1, 0] } } } });
  return b;
}

function buildWisp(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder('creature_wisp');
  b.tile('glow', paintGlow(spec.base, spec.glowing ?? spec.light, 120));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.light, eye: spec.eye, eyeGlow: spec.eyeGlow, style: 'slime', seed: 121 }));
  b.tile('core', paintGlow(spec.light, '#ffffff', 122));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 8, 0], 'root');
  b.cube('body', 'orb', [-4, 4, -4], [4, 12, 4], { south: 'face', north: 'glow', east: 'glow', west: 'glow', up: 'glow', down: 'glow' });
  b.cube('body', 'core', [-1.8, 6.2, -1.8], [1.8, 9.8, 1.8], 'core');
  b.cube('body', 'trail_1', [-2, 1, -2], [2, 5, 2], 'glow');
  b.cube('body', 'trail_2', [-1, -2, -1], [1, 1.8, 1], 'glow');
  b.cube('body', 'spark_r', [-6, 7, 0], [-4.6, 8.4, 1.4], 'core');
  b.cube('body', 'spark_l', [4.6, 5, -1], [6, 6.4, 0.4], 'core');
  b.anim({ name: 'idle', length: 3, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '1.5': [0, 2, 0], '3': [0, 0, 0] } },
    body: { rotation: { '0': [0, 0, 0], '1': [0, 40, 0], '2': [0, -30, 0], '3': [0, 0, 0] } },
  } });
  b.anim({ name: 'walk', length: 2, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.5': [0, 1.4, 0], '1': [0, 0, 0], '1.5': [0, 1.4, 0], '2': [0, 0, 0] } },
    body: { rotation: { '0': [0, 0, 0], '1': [0, 20, 0], '2': [0, 0, 0] } },
  } });
  b.anim({ name: 'run', length: 1.2, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '0.3': [0, 2, 0], '0.6': [0, 0, 0], '0.9': [0, 2, 0], '1.2': [0, 0, 0] } },
  } });
  b.anim({ name: 'attack', length: 0.5, loop: 'once', channels: {
    root: { position: { '0': [0, 0, 0], '0.15': [0, 0, 5], '0.5': [0, 0, 0] } },
    body: { scale: { '0': [1, 1, 1], '0.15': [1.3, 1.3, 1.3], '0.5': [1, 1, 1] } },
  } });
  b.anim({ name: 'hurt', length: 0.35, loop: 'once', channels: { body: { scale: { '0': [1, 1, 1], '0.12': [0.7, 1.3, 0.7], '0.35': [1, 1, 1] } } } });
  b.anim({ name: 'death', length: 1, loop: 'hold', channels: { body: { scale: { '0': [1, 1, 1], '0.5': [1.2, 1.2, 1.2], '1': [0.05, 0.05, 0.05] } }, root: { position: { '0': [0, 0, 0], '1': [0, 3, 0] } } } });
  return b;
}

function buildBat(spec: CreatureSpec): ModelBuilder {
  const b = new ModelBuilder('creature_bat');
  b.tile('body', paintFur(spec.base, spec.dark, spec.light, 123));
  b.tile('belly', paintFur(spec.belly ?? spec.light, spec.dark, spec.light, 124));
  b.tile('face', paintAnimalFace({ base: spec.base, snout: spec.snout ?? spec.dark, eye: spec.eye, eyeGlow: spec.eyeGlow, style: 'wolf', seed: 125 }));
  b.tile('wing', paintCloth(spec.dark, spec.light, 126));
  b.bone('root', [0, 0, 0]);
  b.bone('body', [0, 8, 0], 'root');
  b.bone('wing_r', [-2, 10, 0], 'body');
  b.bone('wing_l', [2, 10, 0], 'body');
  b.cube('body', 'torso', [-2.5, 5, -3], [2.5, 11, 3], { south: 'body', north: 'body', east: 'body', west: 'body', up: 'body', down: 'belly' });
  b.cube('body', 'head', [-2.5, 10, 1], [2.5, 14, 6], headTiles('face'));
  b.cube('body', 'ear_r', [-2.4, 14, 3], [-0.8, 17, 5], 'body');
  b.cube('body', 'ear_l', [0.8, 14, 3], [2.4, 17, 5], 'body');
  b.cube('wing_r', 'wing_r', [-12, 8, -2], [-2, 11, 3], 'wing', { rotation: [0, 0, -10], origin: [-2, 10, 0] });
  b.cube('wing_l', 'wing_l', [2, 8, -2], [12, 11, 3], 'wing', { rotation: [0, 0, 10], origin: [2, 10, 0] });
  b.cube('body', 'feet', [-1.5, 3, -1], [1.5, 5.5, 2], 'body');
  b.anim({ name: 'fly', length: 0.4, loop: 'loop', channels: {
    wing_r: { rotation: { '0': [0, 0, -50], '0.2': [0, 0, 20], '0.4': [0, 0, -50] } },
    wing_l: { rotation: { '0': [0, 0, 50], '0.2': [0, 0, -20], '0.4': [0, 0, 50] } },
    body: { position: { '0': [0, 0, 0], '0.2': [0, 1, 0], '0.4': [0, 0, 0] } },
  } });
  b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
    root: { position: { '0': [0, 0, 0], '1': [0, 0, 0], '2': [0, 0, 0] } },
    body: { rotation: { '0': [0, 0, 0], '1': [0, 10, 0], '2': [0, 0, 0] } },
    wing_r: { rotation: { '0': [0, 0, -25], '0.2': [0, 0, -20], '0.4': [0, 0, -25], '2': [0, 0, -25] } },
  } });
  b.anim({ name: 'walk', length: 0.8, loop: 'loop', channels: { root: { position: { '0': [0, 0, 0], '0.4': [0, 0.7, 0], '0.8': [0, 0, 0] } } } });
  b.anim({ name: 'run', length: 0.5, loop: 'loop', channels: { root: { position: { '0': [0, 0, 0], '0.25': [0, 1, 0], '0.5': [0, 0, 0] } } } });
  b.anim({ name: 'attack', length: 0.4, loop: 'once', channels: { body: { position: { '0': [0, 0, 0], '0.12': [0, 0, 3], '0.4': [0, 0, 0] } } } });
  b.anim({ name: 'hurt', length: 0.3, loop: 'once', channels: { body: { rotation: { '0': [0, 0, 0], '0.1': [0, 0, 20], '0.3': [0, 0, 0] } } } });
  b.anim({ name: 'death', length: 0.9, loop: 'hold', channels: { root: { rotation: { '0': [0, 0, 0], '0.45': [0, 0, -80], '0.9': [0, 0, -88] }, position: { '0': [0, 0, 0], '0.9': [0, -6, 0] } } } });
  return b;
}

export function buildCreature(spec: CreatureSpec): BBModel {
  let builder: ModelBuilder;
  switch (spec.form) {
    case 'quadruped': builder = buildQuadruped(spec); break;
    case 'bird': builder = buildBird(spec); break;
    case 'slime': builder = buildSlime(spec); break;
    case 'spider': builder = buildSpider(spec); break;
    case 'creeper': builder = buildCreeper(spec); break;
    case 'golem': builder = buildGolem(spec); break;
    case 'dragon': builder = buildDragon(spec); break;
    case 'fish': builder = buildFish(spec); break;
    case 'bee': builder = buildBee(spec); break;
    case 'mushroom': builder = buildMushroom(spec); break;
    case 'scorpion': builder = buildScorpion(spec); break;
    case 'wisp': builder = buildWisp(spec); break;
    case 'bat': builder = buildBat(spec); break;
    default: builder = buildQuadruped(spec); break;
  }
  return builder.build();
}

export function getCreatureModel(key: string): BBModel {
  const cached = cache.get(key);
  if (cached) return cached;
  const spec = CREATURE_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown creature: ${key}`);
  const model = buildCreature(spec);
  cache.set(key, model);
  return model;
}

export function getCreatureSpec(key: string): CreatureSpec | undefined {
  return CREATURE_BY_KEY.get(key);
}
