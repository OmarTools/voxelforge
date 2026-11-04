import type { BBModel } from '../engine/blockbench/BBModel';
import { ModelBuilder } from './ModelBuilder';
import {
  paintCloth,
  paintFabric,
  paintFur,
  paintGem,
  paintGlow,
  paintGold,
  paintLeather,
  paintMetal,
  paintRune,
  paintScale,
  paintSkin,
  paintWood,
  paintWool,
} from './TextureSheet';

export interface PropSpec {
  key: string;
  name: string;
  description: string;
  tags: string[];
  light?: number;
  solid?: boolean;
  build: (b: ModelBuilder) => void;
}

function baseTiles(b: ModelBuilder) {
  b.tile('wood', paintWood('#7d5934', '#55391f', 201));
  b.tile('dark_wood', paintWood('#4e3722', '#312214', 202));
  b.tile('stone', paintFur('#7f837d', '#565b55', '#a8aca4', 203));
  b.tile('dark_stone', paintFur('#555b58', '#383d3b', '#777d79', 204));
  b.tile('moss', paintFur('#617a4e', '#405534', '#899f71', 205));
  b.tile('cloth', paintCloth('#b64b42', '#e08b78', 206));
  b.tile('cloth_blue', paintCloth('#3e5f9b', '#7393c9', 207));
  b.tile('cloth_gold', paintCloth('#c99d43', '#f1d68a', 208));
  b.tile('metal', paintMetal('#8b99a8', '#8fe9ff', 209));
  b.tile('gold', paintGold(210));
  b.tile('gem', paintGem('#64e0d0', '#c4fff8', 211));
  b.tile('fire', paintGlow('#d85324', '#ffd66b', 212));
  b.tile('bone', paintFur('#d6cfb9', '#a49d88', '#f1ebd8', 213));
  b.tile('leaf', paintFur('#4f7d3b', '#355829', '#78a55e', 214));
  b.tile('snow', paintWool('#edf3f4', '#bccbd1', 215));
  b.tile('rune', paintRune('#5d5170', '#b58cff', 216));
  b.tile('water', paintCloth('#3c7f9c', '#a0d9e8', 217));
}

function box(b: ModelBuilder, bone: string, name: string, from: [number, number, number], to: [number, number, number], tile: string, opts?: { rotation?: [number, number, number]; origin?: [number, number, number] }) {
  b.cube(bone, name, from, to, tile, opts);
}

function flameAnim(b: ModelBuilder) {
  b.anim({ name: 'idle', length: 1.2, loop: 'loop', channels: {
    flame: { scale: { '0': [1, 1, 1], '0.3': [1.15, 1.3, 1.15], '0.6': [0.9, 0.86, 0.9], '0.9': [1.08, 1.12, 1.08], '1.2': [1, 1, 1] }, rotation: { '0': [0, 0, 0], '0.4': [0, 9, 0], '0.8': [0, -7, 0], '1.2': [0, 0, 0] } },
  } });
}

function glowPulseAnim(b: ModelBuilder, bone = 'glow') {
  b.anim({ name: 'idle', length: 2.8, loop: 'loop', channels: {
    [bone]: { scale: { '0': [1, 1, 1], '1.4': [1.08, 1.08, 1.08], '2.8': [1, 1, 1] } },
  } });
}

export const PROPS: PropSpec[] = [
  {
    key: 'lamp_post', name: 'Lantern Post', description: 'A tall wooden post with a warm iron lantern.', tags: ['light', 'village', 'path'], light: 12,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('lamp', [0, 34, 0], 'root');
      box(b, 'root', 'post', [-1.2, 0, -1.2], [1.2, 35, 1.2], 'dark_wood');
      box(b, 'root', 'base', [-3, 0, -3], [3, 3, 3], 'stone');
      box(b, 'root', 'arm', [-1, 33, -1], [1, 35, 7], 'wood');
      box(b, 'lamp', 'chain', [-0.2, 29, 5.8], [0.2, 34, 6.2], 'metal');
      box(b, 'lamp', 'frame', [-2.6, 23, 3.4], [2.6, 30, 8.6], 'metal');
      box(b, 'lamp', 'glass', [-2.1, 23.6, 3.9], [2.1, 29.2, 8.1], 'fire');
      box(b, 'lamp', 'cap', [-3, 30, 3], [3, 32, 9], 'dark_stone');
      b.anim({ name: 'idle', length: 3, loop: 'loop', channels: {
        lamp: { rotation: { '0': [0, 0, 0], '0.8': [2, 3, 0], '1.6': [-1.5, -2, 0], '2.4': [1, 2, 0], '3': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'campfire', name: 'Campfire', description: 'Crackling logs ringed with stones. A cozy spawn point.', tags: ['light', 'camp', 'warmth'], light: 14,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('flame', [0, 0, 0], 'root');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        box(b, 'root', `stone_${i}`, [Math.cos(a) * 8 - 2, 0, Math.sin(a) * 8 - 2], [Math.cos(a) * 8 + 2, 3, Math.sin(a) * 8 + 2], i % 2 ? 'stone' : 'dark_stone');
      }
      box(b, 'root', 'log_a', [-7, 1, -1.8], [7, 4, 1.8], 'wood', { rotation: [0, 25, 0], origin: [0, 2, 0] });
      box(b, 'root', 'log_b', [-7, 1, -1.8], [7, 4, 1.8], 'wood', { rotation: [0, -25, 0], origin: [0, 2, 0] });
      box(b, 'flame', 'flame_a', [-4, 4, -4], [4, 13, 4], 'fire', { rotation: [0, 12, 0], origin: [0, 4, 0] });
      box(b, 'flame', 'flame_b', [-2.5, 4, -2.5], [2.5, 17, 2.5], 'fire', { rotation: [0, -15, 0], origin: [0, 4, 0] });
      box(b, 'flame', 'ember_1', [-6, 6, -3], [-4.5, 7.5, -1.5], 'fire');
      box(b, 'flame', 'ember_2', [5, 5, 2], [6.5, 6.5, 3.5], 'fire');
      flameAnim(b);
    },
  },
  {
    key: 'tent', name: 'Explorer Tent', description: 'A canvas tent for weary travelers.', tags: ['camp', 'shelter', 'village'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('door', [0, 0, 10], 'root');
      box(b, 'root', 'floor', [-14, 0, -12], [14, 1, 12], 'cloth');
      box(b, 'root', 'left_wall', [-17, 0, -16], [-14, 20, 14], 'cloth', { rotation: [0, 0, 22], origin: [-14, 0, 0] });
      box(b, 'root', 'right_wall', [14, 0, -16], [17, 20, 14], 'cloth', { rotation: [0, 0, -22], origin: [14, 0, 0] });
      box(b, 'root', 'back_wall', [-15, 0, -17], [15, 14, -14], 'cloth');
      box(b, 'root', 'ridge', [-1, 22, -17], [1, 24, 15], 'dark_wood');
      box(b, 'root', 'pole_a', [-1, 0, 13], [1, 24, 15], 'wood');
      box(b, 'root', 'pole_b', [-1, 0, -17], [1, 24, -15], 'wood');
      box(b, 'door', 'flap', [-9, 0, 10], [0, 17, 11], 'cloth_blue', { rotation: [0, 22, 0], origin: [-9, 0, 10] });
      b.anim({ name: 'idle', length: 4, loop: 'loop', channels: {
        door: { rotation: { '0': [0, 0, 0], '2': [0, -10, 0], '4': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'market_stall', name: 'Market Stall', description: 'A striped awning over a wooden counter.', tags: ['village', 'trade', 'market'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      box(b, 'root', 'counter', [-12, 8, -8], [12, 12, 8], 'wood');
      box(b, 'root', 'counter_front', [-12, 0, 5], [12, 8, 8], 'dark_wood');
      box(b, 'root', 'post_a', [-12, 0, -8], [-10, 27, -6], 'wood');
      box(b, 'root', 'post_b', [10, 0, -8], [12, 27, -6], 'wood');
      box(b, 'root', 'post_c', [-12, 0, 6], [-10, 27, 8], 'wood');
      box(b, 'root', 'post_d', [10, 0, 6], [12, 27, 8], 'wood');
      box(b, 'root', 'awning_a', [-16, 27, -12], [0, 29, 12], 'cloth');
      box(b, 'root', 'awning_b', [0, 27, -12], [16, 29, 12], 'cloth_gold');
      box(b, 'root', 'awning_fringe', [-16, 25, 10], [16, 27, 12], 'cloth');
      box(b, 'root', 'crate', [-10, 12, -4], [-4, 18, 2], 'wood');
      box(b, 'root', 'fruit_a', [-2, 12, -2], [0, 14, 0], 'fire');
      box(b, 'root', 'fruit_b', [2, 12, 1], [4, 14, 3], 'fire');
      box(b, 'root', 'pot', [5, 12, -3], [9, 16, 1], 'metal');
      b.anim({ name: 'idle', length: 5, loop: 'loop', channels: {
        awning_fringe: { rotation: { '0': [0, 0, 0], '2.5': [0, 3, 0], '5': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'well', name: 'Village Well', description: 'A stone well with a little roof and bucket.', tags: ['village', 'water', 'landmark'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('bucket', [0, 24, 0], 'root');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = Math.cos(a) * 10;
        const z = Math.sin(a) * 10;
        box(b, 'root', `ring_${i}`, [x - 2.5, 0, z - 2.5], [x + 2.5, 5, z + 2.5], i % 3 ? 'stone' : 'moss');
      }
      box(b, 'root', 'water', [-7, 3, -7], [7, 4, 7], 'water');
      box(b, 'root', 'post_a', [-11, 4, -2], [-9, 26, 2], 'wood');
      box(b, 'root', 'post_b', [9, 4, -2], [11, 26, 2], 'wood');
      box(b, 'root', 'roof_a', [-15, 26, -10], [0, 30, 10], 'cloth_blue', { rotation: [0, 0, 18], origin: [0, 26, 0] });
      box(b, 'root', 'roof_b', [0, 26, -10], [15, 30, 10], 'cloth_blue', { rotation: [0, 0, -18], origin: [0, 26, 0] });
      box(b, 'root', 'crossbar', [-11, 24, -1], [11, 26, 1], 'dark_wood');
      box(b, 'bucket', 'rope', [-0.15, 13, -0.15], [0.15, 24, 0.15], '#c9b26f');
      box(b, 'bucket', 'bucket', [-2, 9, -2], [2, 13, 2], 'wood');
      box(b, 'bucket', 'bucket_band', [-2.2, 11, -2.2], [2.2, 12, 2.2], 'metal');
      b.anim({ name: 'idle', length: 4, loop: 'loop', channels: {
        bucket: { rotation: { '0': [0, 0, 0], '2': [0, 12, 0], '4': [0, 0, 0] }, position: { '0': [0, 0, 0], '2': [0, 2, 0], '4': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'statue_knight', name: 'Fallen Knight Statue', description: 'A weathered stone knight standing eternal watch.', tags: ['statue', 'ruin', 'landmark'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('head', [0, 42, 0], 'root');
      b.bone('sword', [10, 22, 0], 'root');
      box(b, 'root', 'plinth', [-12, 0, -12], [12, 7, 12], 'dark_stone');
      box(b, 'root', 'plinth_top', [-10, 7, -10], [10, 9, 10], 'stone');
      box(b, 'root', 'legs', [-7, 9, -4], [7, 23, 4], 'moss');
      box(b, 'root', 'torso', [-9, 23, -5], [9, 40, 5], 'stone');
      box(b, 'root', 'cape', [-10, 16, 4], [10, 39, 6], 'moss');
      box(b, 'head', 'helm', [-6, 40, -5], [6, 50, 5], 'stone');
      box(b, 'head', 'visor', [-5, 43, 4.6], [5, 45.5, 5.4], 'dark_stone');
      box(b, 'head', 'crest', [-1, 49, -1], [1, 55, 1], 'moss');
      box(b, 'root', 'arm_r', [-13, 25, -3], [-8, 40, 3], 'stone');
      box(b, 'root', 'arm_l', [8, 25, -3], [13, 40, 3], 'stone');
      box(b, 'sword', 'blade', [-0.8, 9, -0.8], [0.8, 33, 0.8], 'metal');
      box(b, 'sword', 'guard', [-4, 31, -1.2], [4, 33, 1.2], 'metal');
      box(b, 'sword', 'grip', [-0.6, 33, -0.6], [0.6, 38, 0.6], 'dark_wood');
      b.anim({ name: 'idle', length: 6, loop: 'loop', channels: {
        head: { rotation: { '0': [0, 0, 0], '3': [2, 10, 0], '6': [0, 0, 0] } },
        sword: { rotation: { '0': [0, 0, 0], '3': [0, 0, 1.5], '6': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'portal_arcane', name: 'Arcane Portal', description: 'A humming gateway framed in rune-carved stone.', tags: ['magic', 'portal', 'landmark'], light: 10,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('veil', [0, 0, 0], 'root');
      box(b, 'root', 'base', [-16, 0, -6], [16, 5, 6], 'dark_stone');
      box(b, 'root', 'pillar_l', [-16, 5, -4], [-10, 40, 4], 'rune');
      box(b, 'root', 'pillar_r', [10, 5, -4], [16, 40, 4], 'rune');
      box(b, 'root', 'lintel', [-16, 37, -4], [16, 43, 4], 'rune');
      box(b, 'root', 'keystone', [-4, 42, -3], [4, 48, 3], 'gem');
      box(b, 'veil', 'plane', [-10, 5, -1.5], [10, 37, -0.7], 'gem');
      box(b, 'root', 'step_l', [-20, 0, -8], [-14, 3, 8], 'stone');
      box(b, 'root', 'step_r', [14, 0, -8], [20, 3, 8], 'stone');
      b.anim({ name: 'idle', length: 2.4, loop: 'loop', channels: {
        veil: { scale: { '0': [1, 1, 1], '1.2': [1.03, 1, 1.3], '2.4': [1, 1, 1] }, rotation: { '0': [0, 0, 0], '1.2': [0, 2, 0], '2.4': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'crystal_cluster', name: 'Crystal Cluster', description: 'A luminous outcropping of teal crystals.', tags: ['crystal', 'light', 'cave'], light: 13,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('crystal', [0, 0, 0], 'root');
      box(b, 'root', 'rock', [-9, 0, -8], [9, 4, 8], 'dark_stone');
      box(b, 'crystal', 'main', [-3, 2, -3], [3, 26, 3], 'gem', { rotation: [0, 12, 4], origin: [0, 2, 0] });
      box(b, 'crystal', 'side_a', [-8, 1, -2], [-4, 17, 2], 'gem', { rotation: [0, -18, -22], origin: [-4, 1, 0] });
      box(b, 'crystal', 'side_b', [4, 1, -2], [8, 20, 2], 'gem', { rotation: [0, 25, 20], origin: [4, 1, 0] });
      box(b, 'crystal', 'side_c', [-2, 0, 4], [2, 12, 8], 'gem', { rotation: [22, 0, 6], origin: [0, 0, 4] });
      box(b, 'crystal', 'side_d', [-1, 1, -8], [2, 14, -4], 'gem', { rotation: [-18, 0, 0], origin: [0, 1, -4] });
      glowPulseAnim(b, 'crystal');
    },
  },
  {
    key: 'obelisk', name: 'Ancient Obelisk', description: 'A rune-lit monolith from a forgotten age.', tags: ['ruin', 'magic', 'landmark'], light: 6,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      box(b, 'root', 'base', [-10, 0, -10], [10, 5, 10], 'dark_stone');
      box(b, 'root', 'mid', [-7, 5, -7], [7, 46, 7], 'stone');
      box(b, 'root', 'cap', [-5, 46, -5], [5, 52, 5], 'rune');
      box(b, 'root', 'tip', [-2, 52, -2], [2, 58, 2], 'gem');
      box(b, 'root', 'rune_1', [-7.3, 12, -3], [-6.6, 20, 3], 'rune');
      box(b, 'root', 'rune_2', [-3, 22, -7.3], [3, 26, -6.6], 'rune');
      box(b, 'root', 'rune_3', [6.6, 32, -4], [7.3, 38, 4], 'rune');
      b.anim({ name: 'idle', length: 4, loop: 'loop', channels: {
        root: { position: { '0': [0, 0, 0], '2': [0, 0.6, 0], '4': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'signpost', name: 'Wooden Signpost', description: 'A handwritten sign pointing toward adventure.', tags: ['village', 'path', 'quest'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('board', [0, 20, 0], 'root');
      box(b, 'root', 'post', [-1, 0, -1], [1, 24, 1], 'dark_wood');
      box(b, 'board', 'board', [-8, 17, -1], [8, 26, 1], 'wood');
      box(b, 'board', 'line_1', [-6, 22, 0.7], [5, 23, 1.1], 'dark_wood');
      box(b, 'board', 'line_2', [-5, 19.5, 0.7], [2, 20.5, 1.1], 'dark_wood');
      box(b, 'board', 'arrow', [5, 21, 0.8], [8, 24, 1.2], 'dark_wood');
      b.anim({ name: 'idle', length: 5, loop: 'loop', channels: {
        board: { rotation: { '0': [0, 0, 0], '2': [0, 0, 1.5], '4': [0, 0, -1], '5': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'bench', name: 'Oak Bench', description: 'A simple bench beneath an old tree.', tags: ['village', 'rest', 'park'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      box(b, 'root', 'seat', [-10, 6, -4], [10, 8, 4], 'wood');
      box(b, 'root', 'back', [-10, 8, 3], [10, 16, 5], 'wood');
      box(b, 'root', 'leg_a', [-9, 0, -3], [-7, 6, 3], 'dark_wood');
      box(b, 'root', 'leg_b', [7, 0, -3], [9, 6, 3], 'dark_wood');
      box(b, 'root', 'back_post_a', [-9, 8, 3], [-7, 16, 5], 'dark_wood');
      box(b, 'root', 'back_post_b', [7, 8, 3], [9, 16, 5], 'dark_wood');
    },
  },
  {
    key: 'cart', name: 'Supply Cart', description: 'A sturdy cart loaded with crates and barrels.', tags: ['village', 'market', 'travel'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('wheel_l', [-9, 7, 0], 'root');
      b.bone('wheel_r', [9, 7, 0], 'root');
      box(b, 'root', 'bed', [-10, 7, -14], [10, 10, 14], 'wood');
      box(b, 'root', 'side_l', [-12, 9, -14], [-10, 20, 14], 'dark_wood');
      box(b, 'root', 'side_r', [10, 9, -14], [12, 20, 14], 'dark_wood');
      box(b, 'root', 'front', [-10, 9, 12], [10, 20, 14], 'dark_wood');
      box(b, 'root', 'crate_a', [-8, 10, -10], [-2, 18, -4], 'wood');
      box(b, 'root', 'crate_b', [0, 10, -12], [6, 16, -6], 'wood');
      box(b, 'root', 'barrel', [-4, 10, 0], [2, 17, 6], 'wood');
      box(b, 'root', 'barrel_band', [-4.4, 12, -0.4], [2.4, 13.2, 6.4], 'metal');
      box(b, 'root', 'shaft', [-2, 6, 14], [2, 10, 24], 'dark_wood');
      box(b, 'wheel_l', 'wheel_l', [-2, -7, -7], [2, 7, 7], 'dark_wood', { rotation: [0, 0, 0] });
      box(b, 'wheel_l', 'spoke_l', [-1, -6, -0.6], [1, 6, 0.6], 'wood');
      box(b, 'wheel_r', 'wheel_r', [-2, -7, -7], [2, 7, 7], 'dark_wood');
      box(b, 'wheel_r', 'spoke_r', [-1, -6, -0.6], [1, 6, 0.6], 'wood');
      b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
        wheel_l: { rotation: { '0': [0, 0, 0], '2': [360, 0, 0] } },
        wheel_r: { rotation: { '0': [0, 0, 0], '2': [360, 0, 0] } },
      } });
    },
  },
  {
    key: 'training_dummy', name: 'Training Dummy', description: 'Straw-stuffed practice target on a wooden frame.', tags: ['combat', 'training', 'camp'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('dummy', [0, 0, 0], 'root');
      box(b, 'root', 'base', [-6, 0, -4], [6, 2, 4], 'dark_wood');
      box(b, 'root', 'post', [-1, 2, -1], [1, 22, 1], 'wood');
      box(b, 'dummy', 'body', [-5, 10, -4], [5, 22, 4], 'cloth');
      box(b, 'dummy', 'head', [-3.5, 22, -3.5], [3.5, 29, 3.5], 'cloth_gold');
      box(b, 'dummy', 'arm', [-11, 17, -2], [11, 19, 2], 'wood');
      box(b, 'dummy', 'belt', [-5.3, 13, -4.3], [5.3, 14.5, 4.3], 'leather');
      box(b, 'dummy', 'target', [-3, 15, -4.4], [3, 21, -3.9], 'cloth_gold');
      box(b, 'dummy', 'target_dot', [-1, 17, -4.5], [1, 19, -4.0], 'fire');
      b.anim({ name: 'idle', length: 2, loop: 'loop', channels: {
        dummy: { rotation: { '0': [0, 0, 0], '1': [4, 0, 2], '2': [0, 0, 0] } },
      } });
      b.anim({ name: 'hit', length: 0.5, loop: 'once', channels: {
        dummy: { rotation: { '0': [0, 0, 0], '0.1': [-8, 0, -12], '0.3': [3, 0, 5], '0.5': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'grave', name: 'Mossy Gravestone', description: 'A crooked stone marker, half swallowed by moss.', tags: ['graveyard', 'spooky', 'ruin'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      box(b, 'root', 'mound', [-8, 0, -6], [8, 3, 6], 'moss');
      box(b, 'root', 'stone', [-5, 2, -2], [5, 16, 2], 'stone', { rotation: [0, 0, -5], origin: [0, 2, 0] });
      box(b, 'root', 'top', [-5, 14, -2], [5, 18, 2], 'stone', { rotation: [0, 0, -5], origin: [0, 2, 0] });
      box(b, 'root', 'cross', [-1, 8, -2.2], [1, 14, 2.2], 'dark_stone');
      box(b, 'root', 'moss_patch', [-5.2, 4, -2.2], [-1, 9, 2.2], 'moss');
      box(b, 'root', 'flowers', [-6, 2, 4], [-2, 5, 7], 'leaf');
      b.anim({ name: 'idle', length: 7, loop: 'loop', channels: {
        root: { rotation: { '0': [0, 0, 0], '3': [0, 0, 0.5], '7': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'fountain', name: 'Courtyard Fountain', description: 'A tiered fountain with clear, sparkling water.', tags: ['village', 'water', 'landmark'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('water', [0, 0, 0], 'root');
      box(b, 'root', 'basin', [-18, 0, -18], [18, 6, 18], 'stone');
      box(b, 'root', 'rim', [-20, 5, -20], [20, 8, 20], 'dark_stone');
      box(b, 'water', 'water_low', [-16, 6, -16], [16, 7, 16], 'water');
      box(b, 'root', 'pedestal', [-4, 6, -4], [4, 20, 4], 'stone');
      box(b, 'root', 'bowl', [-10, 18, -10], [10, 22, 10], 'stone');
      box(b, 'water', 'water_high', [-9, 21, -9], [9, 22.2, 9], 'water');
      box(b, 'root', 'spire', [-2, 22, -2], [2, 32, 2], 'stone');
      box(b, 'root', 'finial', [-3, 32, -3], [3, 36, 3], 'gem');
      box(b, 'water', 'fall_a', [-1, 8, 8], [1, 22, 9], 'water');
      box(b, 'water', 'fall_b', [-1, 8, -9], [1, 22, -8], 'water');
      box(b, 'water', 'fall_c', [8, 8, -1], [9, 22, 1], 'water');
      box(b, 'water', 'fall_d', [-9, 8, -1], [-8, 22, 1], 'water');
      b.anim({ name: 'idle', length: 3, loop: 'loop', channels: {
        water: { scale: { '0': [1, 1, 1], '1.5': [1.01, 1.02, 1.01], '3': [1, 1, 1] } },
      } });
    },
  },
  {
    key: 'brazier', name: 'Iron Brazier', description: 'A broad iron bowl of burning coals.', tags: ['light', 'camp', 'dungeon'], light: 13,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('flame', [0, 0, 0], 'root');
      box(b, 'root', 'foot', [-5, 0, -5], [5, 2, 5], 'metal');
      box(b, 'root', 'stem', [-2, 2, -2], [2, 12, 2], 'metal');
      box(b, 'root', 'bowl', [-8, 12, -8], [8, 18, 8], 'metal');
      box(b, 'root', 'rim', [-9, 17, -9], [9, 19, 9], 'dark_stone');
      box(b, 'flame', 'coals', [-6.5, 18, -6.5], [6.5, 20, 6.5], 'fire');
      box(b, 'flame', 'flame_a', [-4, 19, -4], [4, 27, 4], 'fire', { rotation: [0, 10, 0], origin: [0, 19, 0] });
      box(b, 'flame', 'flame_b', [-2, 20, -2], [2, 32, 2], 'fire', { rotation: [0, -14, 0], origin: [0, 20, 0] });
      flameAnim(b);
    },
  },
  {
    key: 'tree_ancient', name: 'Ancient Oak', description: 'An enormous hollow oak, older than memory.', tags: ['nature', 'landmark', 'forest'], solid: true,
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('canopy', [0, 40, 0], 'root');
      box(b, 'root', 'trunk', [-7, 0, -7], [7, 32, 7], 'dark_wood');
      box(b, 'root', 'root_a', [-12, 0, -3], [0, 5, 3], 'wood', { rotation: [0, 22, 0], origin: [0, 0, 0] });
      box(b, 'root', 'root_b', [0, 0, -2], [12, 4, 4], 'wood', { rotation: [0, -30, 0], origin: [0, 0, 0] });
      box(b, 'root', 'branch_a', [-13, 25, -2], [0, 29, 2], 'wood', { rotation: [0, 18, -18], origin: [0, 27, 0] });
      box(b, 'root', 'branch_b', [0, 28, -2], [14, 31, 2], 'wood', { rotation: [0, -25, 16], origin: [0, 29, 0] });
      box(b, 'canopy', 'leaves_a', [-20, 30, -18], [20, 48, 18], 'leaf');
      box(b, 'canopy', 'leaves_b', [-14, 24, -14], [-2, 36, 14], 'leaf');
      box(b, 'canopy', 'leaves_c', [2, 26, -14], [16, 38, 14], 'leaf');
      box(b, 'canopy', 'leaves_d', [-12, 38, -12], [12, 54, 12], 'leaf');
      box(b, 'canopy', 'leaves_e', [-6, 48, -8], [8, 58, 8], 'leaf');
      box(b, 'root', 'knot', [-7.2, 18, -3], [-6.4, 24, 3], 'dark_stone');
      b.anim({ name: 'idle', length: 6, loop: 'loop', channels: {
        canopy: { rotation: { '0': [0, 0, 0], '1.5': [0, 1.2, 0.4], '3': [0, 0, 0], '4.5': [0, -1.2, -0.3], '6': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'snowman', name: 'Snowman', description: 'A cheerful snowman with a carrot nose.', tags: ['snow', 'fun', 'winter'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('head', [0, 24, 0], 'root');
      b.bone('arm_r', [-8, 20, 0], 'root');
      b.bone('arm_l', [8, 20, 0], 'root');
      box(b, 'root', 'base', [-10, 0, -10], [10, 14, 10], 'snow');
      box(b, 'root', 'mid', [-7, 13, -7], [7, 25, 7], 'snow');
      box(b, 'head', 'head', [-6, 24, -6], [6, 36, 6], 'snow');
      box(b, 'head', 'eye_r', [-3.5, 31, 5.6], [-1.5, 33, 6.3], '#252729');
      box(b, 'head', 'eye_l', [1.5, 31, 5.6], [3.5, 33, 6.3], '#252729');
      box(b, 'head', 'nose', [-0.8, 29, 6], [0.8, 30.5, 10], '#e08a35');
      box(b, 'head', 'scarf', [-6.3, 24, -6.3], [6.3, 27, 6.3], 'cloth');
      box(b, 'head', 'scarf_tail', [5, 17, 4], [7, 25, 6], 'cloth');
      box(b, 'head', 'hat', [-5, 36, -5], [5, 40, 5], 'dark_wood');
      box(b, 'head', 'hat_brim', [-7, 35, -7], [7, 36.5, 7], 'dark_wood');
      box(b, 'arm_r', 'stick_r', [-16, 17, -0.6], [-7, 19, 0.6], 'wood', { rotation: [0, 0, -18], origin: [-8, 18, 0] });
      box(b, 'arm_l', 'stick_l', [7, 17, -0.6], [16, 19, 0.6], 'wood', { rotation: [0, 0, 18], origin: [8, 18, 0] });
      box(b, 'root', 'button_1', [-1, 19, 7], [1, 21, 7.5], '#252729');
      box(b, 'root', 'button_2', [-1, 15, 10], [1, 17, 10.5], '#252729');
      b.anim({ name: 'idle', length: 4, loop: 'loop', channels: {
        head: { rotation: { '0': [0, 0, 0], '2': [0, 8, 0], '4': [0, 0, 0] } },
        arm_r: { rotation: { '0': [0, 0, 0], '2': [0, 0, -6], '4': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'scarecrow', name: 'Field Scarecrow', description: 'A patched guardian of the harvest.', tags: ['farm', 'village', 'spooky'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('body', [0, 0, 0], 'root');
      box(b, 'root', 'post', [-1, 0, -1], [1, 30, 1], 'dark_wood');
      box(b, 'root', 'crossbar', [-14, 22, -1], [14, 24, 1], 'wood');
      box(b, 'body', 'shirt', [-6, 12, -3], [6, 24, 3], 'cloth');
      box(b, 'body', 'patch_1', [-6.2, 15, -3.2], [-2, 19, 3.2], 'cloth_blue');
      box(b, 'body', 'patch_2', [2, 17, 3], [5, 20, 3.3], 'dark_wood');
      box(b, 'body', 'head', [-4, 24, -4], [4, 33, 4], 'cloth_gold');
      box(b, 'body', 'eye_r', [-2.6, 28, 3.8], [-1.2, 30, 4.3], '#252729');
      box(b, 'body', 'eye_l', [1.2, 28, 3.8], [2.6, 30, 4.3], '#252729');
      box(b, 'body', 'mouth', [-1.5, 26, 3.8], [1.5, 27.2, 4.3], '#252729');
      box(b, 'body', 'hat', [-5, 33, -5], [5, 36, 5], 'dark_wood');
      box(b, 'body', 'hat_brim', [-8, 32, -8], [8, 33.5, 8], 'dark_wood');
      box(b, 'root', 'straw_r', [-13, 20, -1], [-8, 22, 1], 'cloth_gold');
      box(b, 'root', 'straw_l', [8, 20, -1], [13, 22, 1], 'cloth_gold');
      b.anim({ name: 'idle', length: 5, loop: 'loop', channels: {
        body: { rotation: { '0': [0, 0, 0], '1.5': [0, 8, 3], '3': [0, -5, -2], '5': [0, 0, 0] } },
      } });
    },
  },
  {
    key: 'throne', name: 'Rune Throne', description: 'A regal seat carved from dark stone and gold.', tags: ['royal', 'dungeon', 'boss'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      box(b, 'root', 'base', [-14, 0, -10], [14, 4, 10], 'dark_stone');
      box(b, 'root', 'seat', [-11, 4, -8], [11, 9, 8], 'stone');
      box(b, 'root', 'back', [-11, 8, 4], [11, 34, 8], 'rune');
      box(b, 'root', 'top', [-13, 34, 3], [13, 39, 9], 'gold');
      box(b, 'root', 'cushion', [-9, 9, -7], [9, 12, 6], 'cloth');
      box(b, 'root', 'arm_l', [-14, 9, -6], [-11, 18, 7], 'stone');
      box(b, 'root', 'arm_r', [11, 9, -6], [14, 18, 7], 'stone');
      box(b, 'root', 'arm_gold_l', [-14.2, 17, -6.2], [-10.8, 19, 7.2], 'gold');
      box(b, 'root', 'arm_gold_r', [10.8, 17, -6.2], [14.2, 19, 7.2], 'gold');
      box(b, 'root', 'gem', [-2, 40, 4], [2, 44, 8], 'gem');
      box(b, 'root', 'step', [-12, 0, 8], [12, 2, 14], 'stone');
    },
  },
  {
    key: 'banner', name: 'Guild Banner', description: 'A tall banner marking a faction or quest hub.', tags: ['village', 'faction', 'quest'],
    build(b) {
      baseTiles(b);
      b.bone('root', [0, 0, 0]);
      b.bone('banner', [0, 0, 0], 'root');
      box(b, 'root', 'pole', [-0.7, 0, -0.7], [0.7, 46, 0.7], 'dark_wood');
      box(b, 'root', 'finial', [-2, 46, -2], [2, 50, 2], 'gold');
      box(b, 'root', 'cross', [-10, 43, -0.6], [10, 45, 0.6], 'dark_wood');
      box(b, 'banner', 'cloth', [-10, 20, 0], [10, 43, 0.6], 'cloth_blue');
      box(b, 'banner', 'trim', [-10, 20, -0.1], [10, 22, 0.7], 'gold');
      box(b, 'banner', 'emblem', [-4, 29, -0.2], [4, 37, 0.5], 'gold');
      box(b, 'banner', 'emblem_dot', [-2, 31, -0.3], [2, 35, 0.6], 'cloth');
      b.anim({ name: 'idle', length: 3.4, loop: 'loop', channels: {
        banner: { rotation: { '0': [0, 0, 0], '0.8': [3, 0, 2], '1.7': [-2, 0, -1], '2.5': [2, 0, 1], '3.4': [0, 0, 0] } },
      } });
    },
  },
];

export const PROP_BY_KEY = new Map(PROPS.map((p) => [p.key, p]));
const cache = new Map<string, BBModel>();

export function getPropModel(key: string): BBModel {
  const cached = cache.get(key);
  if (cached) return cached;
  const spec = PROP_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown prop: ${key}`);
  const builder = new ModelBuilder(`prop_${spec.key}`);
  baseTiles(builder);
  spec.build(builder);
  const model = builder.build();
  cache.set(key, model);
  return model;
}

export function getPropSpec(key: string): PropSpec | undefined {
  return PROP_BY_KEY.get(key);
}
