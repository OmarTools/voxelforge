import { block } from '../engine/world/Blocks';
import type { VoxelWorld } from '../engine/world/VoxelWorld';

/**
 * Deterministic block structures used by the game templates and the studio.
 * Every coordinate in a prefab builder is relative to its bottom-centre.
 */
export class PrefabStamp {
  private readonly world: VoxelWorld;
  private readonly record: boolean;
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;

  constructor(world: VoxelWorld, ox: number, oy: number, oz: number, record = true) {
    this.world = world;
    this.record = record;
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
  }

  set(x: number, y: number, z: number, key: string) {
    const id = key === 'air' ? 0 : block(key).id;
    if (this.record) this.world.setBlock(this.ox + x, this.oy + y, this.oz + z, id);
    else this.world.setBlockNoRecord(this.ox + x, this.oy + y, this.oz + z, id);
  }

  get(x: number, y: number, z: number): number {
    return this.world.getBlock(this.ox + x, this.oy + y, this.oz + z);
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, key: string) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        for (let x = ax; x <= bx; x++) this.set(x, y, z, key);
      }
    }
  }

  frame(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, key: string) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1) this.set(x, y, z, key);
        }
      }
    }
  }

  walls(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, key: string) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (x === x0 || x === x1 || z === z0 || z === z1) this.set(x, y, z, key);
        }
      }
    }
  }

  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.fill(x0, y0, z0, x1, y1, z1, 'air');
  }

  post(x: number, z: number, height: number, key: string) {
    this.fill(x, 0, z, x, height, z, key);
  }

  door(x: number, z: number, y = 0) {
    this.set(x, y, z, 'air');
    this.set(x, y + 1, z, 'air');
    this.set(x, y + 2, z, 'air');
  }

  window(x: number, y: number, z: number) {
    this.set(x, y, z, 'glass');
  }

  gableRoof(x0: number, z0: number, x1: number, z1: number, baseY: number, key: string) {
    let inset = 0;
    for (let y = baseY; y <= baseY + Math.ceil((x1 - x0) / 2) + 1; y++) {
      const ax = x0 + inset;
      const bx = x1 - inset;
      if (ax > bx) break;
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        this.set(ax, y, z, key);
        this.set(bx, y, z, key);
      }
      inset++;
    }
  }

  tree(x: number, z: number, height: number, logKey = 'oak_log', leafKey = 'oak_leaves') {
    this.fill(x, 0, z, x, height - 1, z, logKey);
    const r = height >= 7 ? 3 : 2;
    for (let y = height - 3; y <= height; y++) {
      const radius = y === height ? 1 : y === height - 1 ? 2 : r;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dz * dz > radius * radius + 1) continue;
          if (dx === 0 && dz === 0 && y < height) continue;
          if (this.get(x + dx, y, z + dz) === 0) this.set(x + dx, y, z + dz, leafKey);
        }
      }
    }
  }

  torch(x: number, y: number, z: number) {
    this.set(x, y, z, 'torch');
  }

  lamp(x: number, y: number, z: number) {
    this.set(x, y, z, 'glowstone');
  }
}

export interface Prefab {
  key: string;
  name: string;
  description: string;
  size: [number, number, number];
  tags: string[];
  glyph: string;
  build: (s: PrefabStamp) => void;
}

export const PREFABS: Prefab[] = [
  {
    key: 'oak_cottage', name: 'Oak Cottage', description: 'A warm two-room starter cottage with a porch, windows and a stocked workshop.',
    size: [9, 7, 9], tags: ['house', 'village', 'starter'], glyph: '⌂',
    build(s) {
      s.clear(-5, 0, -5, 5, 8, 5);
      s.fill(-4, -1, -4, 4, -1, 4, 'cobblestone');
      s.fill(-4, 0, -4, 4, 0, 4, 'oak_planks');
      s.walls(-4, -4, 4, 4, 1, 4, 'oak_planks');
      s.fill(-4, 1, -4, 4, 1, 4, 'spruce_planks');
      // Corner posts.
      for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) s.fill(x, 1, z, x, 4, z, 'oak_log');
      // Windows and door.
      s.door(0, 4);
      s.window(-2, 2, 4); s.window(2, 2, 4);
      s.window(-4, 2, -1); s.window(-4, 2, 2);
      s.window(4, 2, 0);
      s.door(0, 4);
      s.fill(-1, 0, 5, 1, 0, 6, 'oak_planks');
      // Gable roof.
      for (let y = 5; y <= 8; y++) {
        const inset = y - 5;
        const x0 = -4 + inset, x1 = 4 - inset;
        if (x0 > x1) break;
        for (let z = -5; z <= 5; z++) {
          s.set(x0, y, z, 'spruce_planks');
          if (x1 !== x0) s.set(x1, y, z, 'spruce_planks');
        }
      }
      s.fill(0, 5, -4, 0, 5, 4, 'oak_log');
      // Interior.
      s.set(-2, 1, -2, 'crafting_table');
      s.set(2, 1, -2, 'chest');
      s.set(-2, 1, 2, 'bookshelf');
      s.torch(0, 3, -3);
      s.torch(-3, 3, 0);
      s.torch(3, 3, 0);
      // Garden.
      s.set(-5, 0, 2, 'oak_leaves');
      s.set(5, 0, 3, 'poppy');
      s.set(5, 0, -2, 'tall_grass');
      s.set(-5, 0, -2, 'dandelion');
    },
  },
  {
    key: 'watchtower', name: 'Watchtower', description: 'A sturdy timber watchtower with a crenellated lookout and a signal lantern.',
    size: [7, 14, 7], tags: ['military', 'village', 'lookout'], glyph: '⛫',
    build(s) {
      s.clear(-4, 0, -4, 4, 16, 4);
      s.fill(-3, 0, -3, 3, 0, 3, 'stone_bricks');
      for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s.fill(x, 1, z, x, 9, z, 'oak_log');
      for (let y = 1; y <= 9; y++) {
        s.set(-3, y, 0, y % 2 ? 'oak_planks' : 'air');
        s.set(3, y, 0, y % 2 ? 'oak_planks' : 'air');
        s.set(0, y, -3, y % 2 ? 'oak_planks' : 'air');
        s.set(0, y, 3, y % 2 ? 'oak_planks' : 'air');
      }
      s.fill(-4, 10, -4, 4, 10, 4, 'spruce_planks');
      s.walls(-4, -4, 4, 4, 11, 12, 'spruce_planks');
      for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) s.fill(x, 11, z, x, 13, z, 'oak_log');
      for (let i = -4; i <= 4; i += 2) {
        s.set(i, 13, -4, 'oak_planks');
        s.set(i, 13, 4, 'oak_planks');
        s.set(-4, 13, i, 'oak_planks');
        s.set(4, 13, i, 'oak_planks');
      }
      s.lamp(0, 11, 0);
      s.torch(0, 12, -3);
      // Ladder-like climbing blocks.
      for (let y = 1; y <= 9; y++) s.set(-2, y, 0, y % 2 ? 'oak_planks' : 'air');
    },
  },
  {
    key: 'market_stall', name: 'Market Row', description: 'Three colorful market stalls with striped awnings and crates of goods.',
    size: [13, 4, 7], tags: ['market', 'village', 'trade'], glyph: '⚖',
    build(s) {
      s.fill(-6, 0, -3, 6, 0, 3, 'oak_planks');
      for (let i = 0; i < 3; i++) {
        const x = -4 + i * 4;
        s.fill(x, 1, -2, x, 3, -2, 'oak_log');
        s.fill(x, 1, 2, x, 3, 2, 'oak_log');
        s.fill(x, 3, -2, x + 1, 3, 2, i % 2 ? 'wool_red' : 'wool_blue');
        s.fill(x - 1, 1, 0, x - 1, 2, 0, 'barrel');
        s.set(x, 1, 1, 'crate');
        s.set(x, 1, -1, 'chest');
        s.torch(x, 2, -2);
      }
      s.set(0, 1, 0, 'crafting_table');
      s.fill(-6, 0, 3, 6, 0, 4, 'dirt_path');
    },
  },
  {
    key: 'blacksmith', name: 'Blacksmith Forge', description: 'A working forge with a stone chimney, smelting furnace and weapon racks.',
    size: [11, 7, 9], tags: ['village', 'crafting', 'trade'], glyph: '⚒',
    build(s) {
      s.fill(-5, -1, -4, 5, -1, 4, 'cobblestone');
      s.fill(-5, 0, -4, 5, 0, 4, 'stone_bricks');
      s.walls(-5, -4, 5, 4, 1, 4, 'stone_bricks');
      s.fill(-5, 1, -4, 5, 1, 4, 'cobblestone');
      s.door(0, 4);
      for (let y = 5; y <= 6; y++) {
        for (let x = -5; x <= 5; x++) {
          if (Math.abs(x) % 2 === 0) s.set(x, y, -4, 'spruce_planks');
        }
      }
      s.fill(-4, 4, -4, 4, 4, 4, 'spruce_planks');
      s.fill(-2, 0, -3, -1, 3, -3, 'bricks');
      s.set(-2, 1, -3, 'furnace');
      s.set(-1, 1, -3, 'furnace');
      s.fill(1, 1, -3, 3, 1, -3, 'stone_bricks');
      s.set(2, 2, -3, 'crafting_table');
      s.set(4, 1, 1, 'chest');
      s.set(4, 1, 2, 'barrel');
      s.torch(-3, 3, 2);
      s.torch(3, 3, 2);
      s.set(0, 1, 5, 'crate');
    },
  },
  {
    key: 'wizard_tower', name: 'Arcane Spire', description: 'A slender mage tower with spiral steps, rune-lit walls and a crystal crown.',
    size: [9, 22, 9], tags: ['magic', 'tower', 'dungeon'], glyph: '✦',
    build(s) {
      s.clear(-5, 0, -5, 5, 25, 5);
      s.fill(-4, -1, -4, 4, -1, 4, 'stone_bricks');
      for (let y = 0; y <= 17; y++) {
        const r = y < 3 ? 4 : 3;
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) {
            if (x * x + z * z > r * r + 1) continue;
            const edge = x * x + z * z > (r - 1) * (r - 1);
            if (edge) s.set(x, y, z, y % 6 === 5 ? 'rune_block' : 'stone_bricks');
          }
        }
      }
      // Spiral interior steps.
      for (let i = 0; i < 26; i++) {
        const angle = i * 0.9;
        const r = 1.8;
        s.set(Math.round(Math.cos(angle) * r), 1 + i, Math.round(Math.sin(angle) * r), 'stone_bricks');
      }
      s.door(0, 4);
      s.door(0, 0);
      // Roof cone.
      for (let i = 0; i < 6; i++) {
        const r = 3 - Math.floor(i / 2);
        if (r <= 0) break;
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) {
            if (x * x + z * z <= r * r + 1) s.set(x, 18 + i, z, i === 5 ? 'crystal_block' : 'rune_block');
          }
        }
      }
      s.lamp(0, 21, 0);
      s.set(0, 22, 0, 'crystal_block');
      s.set(-2, 1, -2, 'bookshelf');
      s.set(2, 1, -2, 'bookshelf');
      s.set(2, 1, 2, 'crafting_table');
      s.set(-2, 1, 2, 'chest');
      s.torch(0, 3, 2);
      s.set(0, 12, 0, 'glowstone');
    },
  },
  {
    key: 'dungeon_room', name: 'Dungeon Hall', description: 'A mossy stone chamber with pillars, iron-barred alcoves and a treasure chest.',
    size: [15, 6, 13], tags: ['dungeon', 'combat', 'loot'], glyph: '⚿',
    build(s) {
      s.clear(-7, 0, -6, 7, 8, 6);
      s.fill(-7, -1, -6, 7, -1, 6, 'stone_bricks');
      s.fill(-7, 0, -6, 7, 0, 6, 'mossy_stone_bricks');
      s.walls(-7, -6, 7, 6, 1, 4, 'stone_bricks');
      s.fill(-7, 5, -6, 7, 5, 6, 'stone_bricks');
      for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
        s.fill(x, 1, z, x, 4, z, 'stone_bricks');
        s.torch(x, 3, z - 1);
      }
      s.fill(-7, 1, -6, -6, 3, -6, 'cobblestone');
      s.door(0, 6);
      s.door(0, 5);
      // Treasure dais.
      s.fill(-1, 1, -4, 1, 1, -2, 'stone_bricks');
      s.set(0, 2, -3, 'chest');
      s.set(-1, 2, -3, 'chest');
      s.lamp(0, 4, -4);
      s.set(-5, 1, 4, 'barrel');
      s.set(5, 1, 4, 'barrel');
      s.set(5, 1, 3, 'crate');
      s.fill(-2, 1, 4, 2, 1, 4, 'mossy_stone_bricks');
      for (let i = 0; i < 5; i++) s.set(-5 + i * 3, 0, 0, 'stone_bricks');
    },
  },
  {
    key: 'stone_bridge', name: 'Stone Bridge', description: 'A wide arched bridge with lantern posts, built for spanning ravines.',
    size: [19, 5, 7], tags: ['infrastructure', 'village'], glyph: '⌒',
    build(s) {
      for (let x = -9; x <= 9; x++) {
        const arch = Math.abs(x) < 5 ? 3 - Math.floor(Math.abs(x) * 0.8) : 0;
        for (let z = -3; z <= 3; z++) {
          s.set(x, arch, z, 'stone_bricks');
          if (Math.abs(z) >= 2) s.set(x, arch + 1, z, 'stone_bricks');
        }
        if (Math.abs(x) % 5 === 0) {
          s.fill(x, arch + 1, -3, x, arch + 3, -3, 'oak_log');
          s.fill(x, arch + 1, 3, x, arch + 3, 3, 'oak_log');
          s.torch(x, arch + 4, -3);
          s.torch(x, arch + 4, 3);
        }
      }
    },
  },
  {
    key: 'village_well', name: 'Village Well', description: 'A cobblestone well with a little shingle roof and cool water at the bottom.',
    size: [5, 5, 5], tags: ['village', 'water', 'centerpiece'], glyph: '◍',
    build(s) {
      s.fill(-2, 0, -2, 2, 0, 2, 'cobblestone');
      s.frame(-2, 0, -2, 2, 1, 2, 'cobblestone');
      s.fill(-1, 0, -1, 1, 0, 1, 'water');
      s.fill(-2, 2, -2, -2, 3, -2, 'oak_log');
      s.fill(2, 2, 2, 2, 3, 2, 'oak_log');
      s.fill(-2, 4, -2, 2, 4, 2, 'spruce_planks');
      s.fill(-1, 3, 0, 1, 3, 0, 'spruce_planks');
      s.set(0, 3, 0, 'oak_planks');
    },
  },
  {
    key: 'farm_plot', name: 'Farm Plot', description: 'A tidy irrigated field with crop rows, a scarecrow-ready fence and hay storage.',
    size: [13, 3, 11], tags: ['farm', 'village', 'food'], glyph: '❧',
    build(s) {
      s.fill(-6, 0, -5, 6, 0, 5, 'dirt');
      s.fill(-6, 0, 0, 6, 0, 0, 'water');
      for (let z = -4; z <= 4; z++) {
        if (z === 0) continue;
        for (let x = -5; x <= 5; x++) {
          if (x % 3 === 0) s.set(x, 0, z, 'dirt');
          else s.set(x, 1, z, (x + z) % 4 === 0 ? 'poppy' : 'tall_grass');
        }
      }
      for (const [x, z] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) s.post(x, z, 2, 'oak_log');
      s.fill(-6, 1, -5, 6, 1, -5, 'oak_planks');
      s.fill(-6, 1, 5, 6, 1, 5, 'oak_planks');
      s.set(-6, 1, 0, 'hay_bale');
      s.set(6, 1, 0, 'hay_bale');
      s.set(6, 1, -1, 'hay_bale');
      s.set(6, 1, -2, 'crate');
    },
  },
  {
    key: 'campsite', name: 'Trail Campsite', description: 'A sheltered camp with bedrolls, a fire ring, supply crates and a lookout perch.',
    size: [11, 4, 11], tags: ['camp', 'survival', 'starter'], glyph: '⛺',
    build(s) {
      s.fill(-5, 0, -5, 5, 0, 5, 'dirt_path');
      s.fill(-2, 0, 0, 2, 0, 2, 'cobblestone');
      s.set(0, 1, 1, 'torch');
      // Lean-to.
      s.fill(-5, 1, -5, -1, 2, -2, 'wool_green');
      for (const [x, z] of [[-5, -5], [-1, -5], [-5, -2], [-1, -2]]) s.fill(x, 0, z, x, 2, z, 'oak_log');
      s.fill(-4, 1, -4, -2, 1, -3, 'wool_red');
      s.set(-5, 1, 3, 'crate');
      s.set(-4, 1, 3, 'barrel');
      s.set(4, 1, 3, 'crafting_table');
      s.set(4, 1, 2, 'chest');
      s.fill(2, 0, -5, 4, 0, -5, 'oak_planks');
      s.torch(4, 2, -3);
    },
  },
  {
    key: 'sky_island', name: 'Floating Island', description: 'A levitating island of grass, roots and a lone oak tree. A perfect skyblock start.',
    size: [13, 9, 13], tags: ['sky', 'island', 'starter'], glyph: '☁',
    build(s) {
      for (let y = 0; y >= -5; y--) {
        const r = 6 + y;
        for (let z = -6; z <= 6; z++) {
          for (let x = -6; x <= 6; x++) {
            if (x * x + z * z > r * r + 2) continue;
            s.set(x, y, z, y === 0 ? 'grass_block' : y > -3 ? 'dirt' : 'stone');
          }
        }
      }
      s.tree(2, 1, 7);
      s.set(-2, 1, 2, 'poppy');
      s.set(-3, 1, -1, 'tall_grass');
      s.fill(0, 1, -3, 1, 1, -3, 'cobblestone');
      s.set(2, 1, -2, 'crafting_table');
      s.set(3, 1, -2, 'chest');
    },
  },
  {
    key: 'arena_stage', name: 'Arena of Echoes', description: 'A circular stone arena with pillars, braziers and four gated entries.',
    size: [21, 7, 21], tags: ['arena', 'combat', 'boss'], glyph: '◉',
    build(s) {
      for (let z = -10; z <= 10; z++) {
        for (let x = -10; x <= 10; x++) {
          const d = Math.hypot(x, z);
          if (d > 10.5) continue;
          s.set(x, 0, z, d > 9 ? 'stone_bricks' : d > 7.5 ? 'mossy_stone_bricks' : 'stone_bricks');
          if (d > 9.4) s.set(x, 1, z, 'cobblestone');
        }
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * 8);
        const z = Math.round(Math.sin(a) * 8);
        s.fill(x, 1, z, x, 4, z, 'stone_bricks');
        s.set(x, 5, z, 'glowstone');
      }
      s.fill(-1, 0, 10, 1, 0, 10, 'stone_bricks');
      s.door(0, 10);
      s.fill(-1, 0, -10, 1, 0, -10, 'stone_bricks');
      s.door(0, -10);
      s.fill(10, 0, -1, 10, 0, 1, 'stone_bricks');
      s.door(10, 0);
      s.fill(-10, 0, -1, -10, 0, 1, 'stone_bricks');
      s.door(-10, 0);
      s.fill(-2, 0, -2, 2, 0, 2, 'crystal_block');
    },
  },
  {
    key: 'parkour_tower', name: 'Parkour Spire', description: 'A vertical gauntlet of floating platforms, jumps and risky shortcuts.',
    size: [11, 30, 11], tags: ['parkour', 'challenge'], glyph: '⇧',
    build(s) {
      s.fill(-2, 0, -2, 2, 0, 2, 'stone_bricks');
      for (let i = 0; i < 16; i++) {
        const y = 2 + i * 2;
        const angle = i * 1.35;
        const r = 3.3;
        const x = Math.round(Math.cos(angle) * r);
        const z = Math.round(Math.sin(angle) * r);
        s.fill(x, y, z, x, y, z, i % 4 === 3 ? 'glowstone' : i % 3 === 0 ? 'wool_yellow' : 'quartz_block');
        if (i === 15) s.set(0, 33, 0, 'crystal_block');
      }
      s.torch(0, 2, 0);
    },
  },
  {
    key: 'spooky_manor', name: 'Hollow Manor', description: 'A decaying two-storey manor with creaking floors, cobwebs and a sealed cellar.',
    size: [13, 11, 11], tags: ['horror', 'mansion', 'dungeon'], glyph: '☠',
    build(s) {
      s.clear(-6, 0, -5, 6, 14, 5);
      s.fill(-6, -1, -5, 6, -1, 5, 'cobblestone');
      s.fill(-6, 0, -5, 6, 0, 5, 'spruce_planks');
      s.walls(-6, -5, 6, 5, 1, 5, 'spruce_planks');
      for (const [x, z] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) s.fill(x, 1, z, x, 5, z, 'spruce_log');
      s.window(-3, 2, 5); s.window(3, 2, 5); s.window(-6, 2, 0); s.window(6, 2, 0);
      s.door(0, 5);
      for (let i = -5; i <= 5; i += 2) {
        s.set(i, 1, 5, i % 4 === 0 ? 'air' : 'spruce_planks');
      }
      for (let y = 6; y <= 9; y++) {
        const inset = y - 6;
        for (let z = -5; z <= 5; z++) {
          s.set(-6 + inset, y, z, z % 3 === 0 ? 'cobblestone' : 'spruce_planks');
          s.set(6 - inset, y, z, z % 3 === 0 ? 'cobblestone' : 'spruce_planks');
        }
      }
      s.fill(-6, 6, -5, 6, 6, 5, 'spruce_planks');
      s.set(-2, 1, -2, 'bookshelf');
      s.set(2, 1, -2, 'bookshelf');
      s.set(3, 1, 2, 'chest');
      s.set(0, 6, 0, 'glowstone');
      s.torch(-4, 2, -4); s.torch(4, 2, -4);
      s.fill(-1, 0, -5, 1, 3, -5, 'mossy_stone_bricks');
      s.set(0, 1, -5, 'air');
      // Graveyard garden.
      for (const x of [-4, -1, 2, 5]) {
        s.fill(x, 1, 7, x, 2, 7, 'cobblestone');
      }
    },
  },
  {
    key: 'crystal_cavern', name: 'Crystal Cavern', description: 'A glowing geode chamber packed with crystals, underground water and hidden ore.',
    size: [15, 9, 15], tags: ['cave', 'magic', 'dungeon'], glyph: '♦',
    build(s) {
      for (let y = 0; y <= 8; y++) {
        for (let z = -7; z <= 7; z++) {
          for (let x = -7; x <= 7; x++) {
            const d = Math.hypot(x, z);
            if (d > 7.5) {
              if (y < 6) s.set(x, y, z, (x + z + y) % 7 === 0 ? 'diamond_ore' : 'stone');
            } else if (y === 0) {
              s.set(x, y, z, d < 2.5 ? 'water' : 'stone');
            }
          }
        }
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * 5);
        const z = Math.round(Math.sin(a) * 5);
        const h = 1 + (i % 3);
        s.fill(x, 1, z, x, h, z, 'crystal_block');
      }
      s.set(0, 1, 0, 'crystal_flower');
      s.set(3, 1, 3, 'crystal_flower');
      s.set(-3, 1, -2, 'crystal_flower');
      s.set(2, 1, -5, 'chest');
      s.set(-5, 1, 3, 'glowstone');
      s.fill(-7, 7, -7, 7, 7, 7, 'stone');
    },
  },
  {
    key: 'village_square', name: 'Village Square', description: 'A cobbled plaza with a well, flower beds, market benches and lamp posts.',
    size: [17, 4, 17], tags: ['village', 'market', 'centerpiece'], glyph: '⌘',
    build(s) {
      for (let z = -8; z <= 8; z++) {
        for (let x = -8; x <= 8; x++) s.set(x, 0, z, (x + z) % 3 === 0 ? 'stone_bricks' : 'cobblestone');
      }
      s.frame(-2, 0, -2, 2, 1, 2, 'cobblestone');
      s.fill(-1, 0, -1, 1, 0, 1, 'water');
      for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
        s.fill(x, 1, z, x, 3, z, 'oak_log');
        s.lamp(x, 4, z);
      }
      for (const [x, z] of [[-5, 0], [5, 0]]) {
        s.fill(x, 1, z, x, 1, z + 2, 'oak_planks');
      }
      s.fill(-8, 1, -8, -7, 1, -8, 'poppy');
      s.fill(7, 1, 7, 8, 1, 8, 'dandelion');
      s.set(4, 1, 4, 'barrel');
      s.set(-4, 1, 4, 'crate');
      s.set(-4, 1, -4, 'crafting_table');
    },
  },
  {
    key: 'castle_gate', name: 'Castle Gate', description: 'A defended gatehouse with twin towers, a murder-hole arch and banner walls.',
    size: [17, 13, 9], tags: ['castle', 'fortress', 'military'], glyph: '♜',
    build(s) {
      s.fill(-8, -1, -4, 8, -1, 4, 'stone_bricks');
      s.fill(-8, 0, -4, 8, 0, 4, 'stone_bricks');
      s.fill(-8, 1, -4, -3, 7, 4, 'stone_bricks');
      s.fill(3, 1, -4, 8, 7, 4, 'stone_bricks');
      s.fill(-3, 5, -4, 3, 8, 4, 'stone_bricks');
      s.fill(-2, 1, -4, 2, 4, 4, 'air');
      s.door(0, -4);
      s.door(0, 4);
      for (let x = -8; x <= 8; x += 2) {
        s.set(x, 8, -4, 'stone_bricks');
        s.set(x, 8, 4, 'stone_bricks');
      }
      for (const x of [-7, -5, 5, 7]) {
        s.fill(x, 8, -3, x, 9, -3, 'stone_bricks');
        s.torch(x, 8, -4);
      }
      s.fill(-8, 8, -4, -8, 10, 4, 'stone_bricks');
      s.fill(8, 8, -4, 8, 10, 4, 'stone_bricks');
      s.fill(-7, 6, 4, -4, 6, 4, 'wool_red');
      s.fill(4, 6, 4, 7, 6, 4, 'wool_blue');
      s.set(0, 7, 4, 'glowstone');
    },
  },
  {
    key: 'mine_entrance', name: 'Mine Entrance', description: 'A timber-framed mineshaft entrance with rails, lanterns and an ore cart bay.',
    size: [9, 5, 7], tags: ['mine', 'cave', 'industry'], glyph: '⛏',
    build(s) {
      s.fill(-4, 0, -3, 4, 0, 3, 'gravel');
      s.fill(-2, 0, -3, 2, 2, 1, 'air');
      s.fill(-2, 3, -3, 2, 3, 1, 'stone');
      s.fill(-3, 1, 0, -3, 3, 0, 'oak_log');
      s.fill(3, 1, 0, 3, 3, 0, 'oak_log');
      s.fill(-3, 3, 0, 3, 3, 0, 'oak_log');
      s.torch(-3, 2, 0); s.torch(3, 2, 0);
      s.fill(-1, 1, 1, 1, 1, 3, 'oak_planks');
      s.set(2, 1, 3, 'chest');
      s.set(2, 1, 2, 'barrel');
      s.fill(-4, 1, 3, -3, 2, 3, 'cobblestone');
      s.set(-4, 1, -1, 'cobblestone');
    },
  },
  {
    key: 'shrine', name: 'Forest Shrine', description: 'A quiet quartz shrine ringed by lanterns, with a glowing crystal at its heart.',
    size: [11, 6, 11], tags: ['magic', 'nature', 'quest'], glyph: '✧',
    build(s) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * 4);
        const z = Math.round(Math.sin(a) * 4);
        s.fill(x, 0, z, x, 1, z, 'quartz_block');
        s.set(x, 2, z, 'glowstone');
      }
      s.fill(-2, 0, -2, 2, 0, 2, 'quartz_block');
      s.fill(-1, 1, -1, 1, 1, 1, 'stone_bricks');
      s.set(0, 2, 0, 'crystal_block');
      s.fill(-3, 0, 3, 3, 0, 3, 'stone_bricks');
      s.set(-2, 1, 3, 'poppy');
      s.set(2, 1, 3, 'crystal_flower');
    },
  },
  {
    key: 'lighthouse', name: 'Coastal Lighthouse', description: 'A tall red-and-white beacon with a lantern room visible for miles.',
    size: [9, 26, 9], tags: ['coast', 'light', 'landmark'], glyph: '✹',
    build(s) {
      for (let y = 0; y <= 18; y++) {
        const r = y < 3 ? 4 : y < 14 ? 3 : 2;
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) {
            if (x * x + z * z > r * r + 1) continue;
            const edge = x * x + z * z > (r - 1) * (r - 1);
            if (edge) s.set(x, y, z, Math.floor(y / 3) % 2 === 0 ? 'wool_white' : 'wool_red');
          }
        }
      }
      s.fill(-2, 19, -2, 2, 19, 2, 'stone_bricks');
      s.fill(-1, 20, -1, 1, 22, 1, 'glass');
      s.lamp(0, 22, 0);
      s.fill(-2, 23, -2, 2, 23, 2, 'stone_bricks');
      s.door(0, 2);
      s.door(0, 1);
      s.set(0, 3, 0, 'glowstone');
    },
  },
  {
    key: 'treehouse', name: 'Jungle Treehouse', description: 'A roomy platform nestled in a colossal tree, reached by a spiral stair.',
    size: [13, 20, 13], tags: ['nature', 'house', 'jungle'], glyph: '♣',
    build(s) {
      s.fill(0, 0, 0, 0, 13, 0, 'spruce_log');
      for (let i = 0; i < 15; i++) {
        const a = i * 0.75;
        s.set(Math.round(Math.cos(a) * 3), 1 + i, Math.round(Math.sin(a) * 3), 'oak_planks');
      }
      s.fill(-4, 10, -4, 4, 10, 4, 'oak_planks');
      s.walls(-4, -4, 4, 4, 11, 14, 'oak_planks');
      s.walls(-4, -4, 4, 4, 11, 11, 'oak_planks');
      s.door(0, 4, 10);
      s.window(-2, 12, 4); s.window(2, 12, 4); s.window(-2, 12, -4); s.window(2, 12, -4);
      s.fill(-4, 15, -4, 4, 15, 4, 'spruce_planks');
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        s.set(Math.round(Math.cos(a) * 3), 16, Math.round(Math.sin(a) * 3), 'oak_leaves');
      }
      for (let y = 14; y <= 18; y++) {
        for (let z = -6; z <= 6; z++) {
          for (let x = -6; x <= 6; x++) {
            if (x * x + z * z > 34) continue;
            if (Math.abs(x) + Math.abs(z) < 4 && y > 15) continue;
            if (y === 18 && Math.abs(x) + Math.abs(z) > 3) continue;
            s.set(x, y, z, 'oak_leaves');
          }
        }
      }
      s.set(2, 11, 2, 'crafting_table');
      s.set(-2, 11, 2, 'chest');
      s.torch(0, 13, 2);
    },
  },
  {
    key: 'fishing_hut', name: 'Lakeside Hut', description: 'A tiny stilted hut with a fishing pier, barrel store and warm lantern light.',
    size: [11, 6, 13], tags: ['lake', 'house', 'fishing'], glyph: '≈',
    build(s) {
      for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s.fill(x, 0, z, x, 2, z, 'oak_log');
      s.fill(-3, 3, -3, 3, 3, 3, 'oak_planks');
      s.walls(-3, -3, 3, 3, 4, 6, 'spruce_planks');
      s.door(0, 3, 3);
      s.fill(-3, 7, -3, 3, 7, 3, 'spruce_planks');
      s.fill(-2, 5, -2, 2, 5, 2, 'air');
      for (let z = 4; z <= 9; z++) {
        s.set(0, 2, z, 'oak_planks');
        s.set(1, 2, z, 'oak_planks');
        if (z % 3 === 0) s.fill(2, 1, z, 2, 3, z, 'oak_log');
      }
      s.set(-2, 4, 2, 'barrel');
      s.set(2, 4, 2, 'chest');
      s.set(0, 5, 0, 'glowstone');
      s.set(-3, 4, 0, 'crafting_table');
      s.set(3, 2, 8, 'water');
    },
  },
  {
    key: 'bandit_camp', name: 'Bandit Camp', description: 'A fortified outlaw camp with tents, watch posts, loot and a captured supply wagon.',
    size: [15, 6, 13], tags: ['camp', 'bandit', 'combat'], glyph: '⚑',
    build(s) {
      s.fill(-7, 0, -6, 7, 0, 6, 'dirt');
      for (let i = -6; i <= 6; i += 3) {
        s.fill(i, 1, -6, i, 3, -6, 'oak_log');
        s.fill(i, 1, 6, i, 3, 6, 'oak_log');
        s.set(i, 1, 6, 'oak_log');
      }
      // Tents.
      for (const x of [-4, 3]) {
        s.fill(x - 2, 1, -2, x + 2, 1, 2, 'wool_red');
        for (let y = 2; y <= 4; y++) {
          const inset = y - 1;
          for (let z = -2 + inset; z <= 2 - inset; z++) {
            s.set(x - 2 + inset, y, z, 'wool_red');
            s.set(x + 2 - inset, y, z, 'wool_red');
          }
        }
        s.fill(x - 1, 1, 3, x + 1, 1, 3, 'oak_planks');
      }
      s.fill(0, 1, 1, 1, 1, 2, 'oak_planks');
      s.set(0, 2, 2, 'glowstone');
      s.fill(-1, 1, 4, 2, 1, 4, 'crate');
      s.set(-2, 1, 4, 'barrel');
      s.set(3, 1, 4, 'chest');
      s.fill(-5, 1, 4, -3, 2, 4, 'cobblestone');
      s.fill(4, 1, -5, 5, 3, -5, 'oak_log');
      s.torch(5, 4, -5);
    },
  },
  {
    key: 'graveyard', name: 'Old Graveyard', description: 'A walled burial ground with leaning headstones, dead trees and an iron gate.',
    size: [15, 4, 13], tags: ['horror', 'graveyard', 'dungeon'], glyph: '†',
    build(s) {
      s.fill(-7, 0, -6, 7, 0, 6, 'dirt_path');
      s.walls(-7, -6, 7, 6, 1, 2, 'cobblestone');
      s.door(0, 6);
      for (let i = 0; i < 8; i++) {
        const x = -5 + (i % 4) * 3;
        const z = -3 + Math.floor(i / 4) * 5;
        s.fill(x, 1, z, x, 1 + (i % 2), z, 'stone_bricks');
        s.set(x, 2 + (i % 2), z, i % 3 === 0 ? 'poppy' : 'air');
      }
      s.fill(-6, 1, 0, -6, 4, 0, 'spruce_log');
      s.set(-6, 3, 0, 'spruce_leaves');
      s.set(6, 3, -2, 'spruce_leaves');
      s.torch(-6, 3, 5); s.torch(6, 3, 5);
    },
  },
  {
    key: 'library', name: 'Grand Library', description: 'A candlelit hall of tall bookshelves, reading tables and a globe-like crystal.',
    size: [13, 7, 11], tags: ['village', 'knowledge', 'quest'], glyph: '▤',
    build(s) {
      s.fill(-6, 0, -5, 6, 0, 5, 'oak_planks');
      s.walls(-6, -5, 6, 5, 1, 5, 'stone_bricks');
      s.fill(-6, 6, -5, 6, 6, 5, 'spruce_planks');
      s.door(0, 5);
      for (let y = 1; y <= 4; y++) {
        for (let x = -5; x <= 5; x += 2) {
          if (x === 0) continue;
          s.set(x, y, -4, 'bookshelf');
          s.set(x, y, 4, 'bookshelf');
        }
      }
      s.fill(-2, 1, -1, 2, 1, 1, 'oak_planks');
      s.set(0, 2, 0, 'crafting_table');
      s.set(-2, 2, 0, 'glowstone');
      s.set(2, 2, 0, 'bookshelf');
      s.fill(-6, 1, 0, -5, 3, 0, 'bookshelf');
      s.fill(5, 1, 0, 6, 3, 0, 'bookshelf');
      s.torch(-3, 3, 4); s.torch(3, 3, 4);
    },
  },
  {
    key: 'nether_portal', name: 'Obsidian Gate', description: 'A humming obsidian frame filled with shimmering crystal light.',
    size: [7, 8, 3], tags: ['portal', 'magic', 'dungeon'], glyph: '◎',
    build(s) {
      s.fill(-3, 0, -1, 3, 0, 1, 'obsidian');
      s.fill(-3, 4, -1, 3, 4, 1, 'obsidian');
      s.fill(-3, 1, 0, -3, 3, 0, 'obsidian');
      s.fill(3, 1, 0, 3, 3, 0, 'obsidian');
      s.fill(-2, 1, 0, 2, 3, 0, 'crystal_block');
      s.fill(-3, 0, 1, 3, 0, 1, 'rune_block');
      s.fill(-3, 5, 0, 3, 5, 0, 'stone_bricks');
      s.torch(-2, 2, 1); s.torch(2, 2, 1);
    },
  },
  {
    key: 'tavern', name: 'Wayfarer Tavern', description: 'A lantern-lit tavern with a bar, tables, a hearth and rooms above.',
    size: [13, 9, 11], tags: ['village', 'inn', 'quest'], glyph: '♨',
    build(s) {
      s.fill(-6, 0, -5, 6, 0, 5, 'spruce_planks');
      s.walls(-6, -5, 6, 5, 1, 5, 'oak_planks');
      s.fill(-6, 1, -5, 6, 1, 5, 'oak_planks');
      s.door(0, 5);
      for (let y = 2; y <= 4; y++) {
        for (let x = -6; x <= 6; x++) {
          if (x % 2 === 0) s.set(x, y, -5, 'spruce_planks');
        }
      }
      s.fill(-6, 5, -5, 6, 5, 5, 'spruce_planks');
      s.fill(-2, 1, -3, 2, 1, -2, 'oak_planks');
      s.fill(-2, 2, -3, 2, 2, -3, 'barrel');
      s.set(0, 2, -3, 'glowstone');
      s.fill(-4, 1, 1, -3, 1, 2, 'oak_planks');
      s.fill(3, 1, 1, 4, 1, 2, 'oak_planks');
      s.torch(-4, 2, 3); s.torch(4, 2, 3);
      s.set(0, 3, 0, 'glowstone');
      s.set(5, 1, 4, 'chest');
      for (let y = 6; y <= 8; y++) {
        const inset = y - 6;
        for (let z = -5; z <= 5; z++) {
          s.set(-6 + inset, y, z, 'spruce_planks');
          s.set(6 - inset, y, z, 'spruce_planks');
        }
      }
    },
  },
  {
    key: 'race_track', name: 'Sunset Circuit', description: 'A banked oval race circuit with checkered curbs, a start gantry, pit lane and grandstand.',
    size: [63, 10, 43], tags: ['racing', 'track', 'vehicle'], glyph: '⚑',
    build(s) {
      const rx = 29;
      const rz = 19;
      const inRx = 22;
      const inRz = 13;
      for (let x = -31; x <= 31; x++) {
        for (let z = -21; z <= 21; z++) {
          const outer = Math.sqrt((x / rx) ** 2 + (z / rz) ** 2);
          const inner = Math.sqrt((x / inRx) ** 2 + (z / inRz) ** 2);
          if (outer <= 1 && inner >= 1) {
            const curb = outer > 0.94 || inner < 1.06;
            let key = 'concrete_black';
            if (curb) key = (x + z) % 2 === 0 ? 'concrete_white' : 'concrete_red';
            else if ((x + z) % 7 === 0) key = 'concrete_gray';
            s.set(x, 0, z, key);
          } else if (outer > 1 && outer <= 1.06) {
            s.set(x, 0, z, 'grass_block');
          }
        }
      }
      // Start / finish line and grid boxes.
      for (let x = -29; x <= -22; x++) {
        s.set(x, 0, -4, (x - 4) % 2 === 0 ? 'concrete_white' : 'concrete_black');
      }
      for (let i = 0; i < 4; i++) {
        const gx = -28 + i * 2;
        for (let dz = 0; dz <= 4; dz++) s.set(gx, 0, 2 + dz, 'concrete_gray');
      }
      // Start gantry.
      s.fill(-31, 1, -6, -31, 5, -6, 'concrete_white');
      s.fill(-18, 1, -6, -18, 5, -6, 'concrete_white');
      s.fill(-31, 6, -6, -18, 6, -6, 'concrete_black');
      s.fill(-29, 7, -6, -20, 7, -6, 'concrete_red');
      for (let x = -28; x <= -21; x += 2) s.set(x, 7, -6, 'glowstone');
      // Pit building in the infield.
      s.fill(0, 1, -5, 13, 1, 5, 'concrete_gray');
      s.walls(0, -5, 13, 5, 2, 5, 'concrete_white');
      s.fill(0, 6, -5, 13, 6, 5, 'concrete_black');
      for (let x = 2; x <= 10; x += 3) s.window(x, 3, 5);
      s.door(6, 5, 2);
      s.fill(1, 2, -4, 3, 2, -4, 'crate');
      s.fill(9, 2, -4, 11, 2, -4, 'barrel');
      s.set(13, 2, 0, 'chest');
      s.fill(0, 7, -5, 13, 7, -4, 'concrete_white');
      s.fill(1, 8, -5, 3, 8, -5, 'glowstone');
      s.fill(10, 8, -5, 12, 8, -5, 'glowstone');
      // Grandstand along the east side.
      for (let z = -8; z <= 8; z++) {
        for (let step = 0; step < 4; step++) {
          s.fill(15 + step, 1, z, 15 + step, 1 + step, z, step % 2 === 0 ? 'concrete_gray' : 'concrete_white');
        }
        s.fill(15, 5, z, 18, 5, z, 'concrete_red');
      }
      s.fill(14, 6, -9, 20, 6, 9, 'wool_red');
      for (let z = -8; z <= 8; z += 4) {
        s.fill(20, 1, z, 20, 6, z, 'concrete_white');
        s.torch(20, 6, z);
      }
      // Tire stacks and marshal posts around the infield rim.
      for (const [x, z] of [[-18, -11], [18, 11], [-18, 11], [18, -11], [-14, 0], [14, 0]]) {
        s.fill(x, 1, z, x + 1, 2, z, 'wool_black');
        s.set(x, 3, z, 'wool_black');
      }
      for (const [x, z] of [[-20, -12], [20, -12], [-20, 12], [20, 12]]) {
        s.fill(x, 1, z, x, 5, z, 'concrete_white');
        s.set(x, 6, z, 'glowstone');
      }
      // Infield podium and chequered flags.
      s.fill(-7, 1, 7, -2, 1, 11, 'concrete_white');
      s.fill(-6, 2, 8, -3, 2, 10, 'concrete_gray');
      s.fill(-5, 3, 9, -4, 3, 9, 'gold_ore');
      for (const [x, z] of [[6, -12], [9, -12], [12, -12]]) {
        s.fill(x, 1, z, x, 6, z, 'stone_bricks');
        for (let y = 2; y <= 5; y++) s.set(x, y, z + 1, (x + y) % 2 === 0 ? 'wool_white' : 'wool_black');
      }
    },
  },
  {
    key: 'army_base', name: 'Ironhold Base', description: 'A fortified military base with barracks, command bunker, watchtowers, helipad, armour and sandbag lines.',
    size: [49, 16, 49], tags: ['military', 'army', 'shooter', 'base'], glyph: '⌖',
    build(s) {
      // Concrete apron.
      s.fill(-23, 0, -23, 23, 0, 23, 'concrete_gray');
      // Perimeter wall and gate.
      s.walls(-23, -23, 23, 23, 1, 4, 'stone_bricks');
      s.fill(-23, 5, -23, 23, 5, 23, 'concrete_black');
      s.fill(-4, 1, 23, 4, 4, 23, 'air');
      s.fill(-5, 5, 23, 5, 6, 23, 'concrete_white');
      s.fill(-4, 1, 24, 4, 2, 26, 'concrete_black');
      s.fill(-4, 1, 24, -4, 3, 24, 'concrete_yellow');
      s.fill(4, 1, 24, 4, 3, 24, 'concrete_yellow');
      // Corner watchtowers.
      for (const [x, z] of [[-23, -23], [23, -23], [-23, 23], [23, 23]]) {
        s.fill(x - 1, 1, z - 1, x + 1, 9, z + 1, 'concrete_gray');
        s.fill(x - 2, 10, z - 2, x + 2, 10, z + 2, 'concrete_black');
        s.fill(x - 1, 11, z - 1, x + 1, 11, z + 1, 'concrete_white');
        s.set(x, 12, z, 'glowstone');
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) s.window(x + dx, 8, z + dz);
      }
      // Barracks on the west side.
      s.fill(-21, 1, -17, -9, 1, -5, 'concrete_white');
      s.walls(-21, -17, -9, -5, 2, 5, 'concrete_gray');
      s.fill(-21, 6, -17, -9, 6, -5, 'concrete_black');
      s.door(-15, -5, 2);
      for (let x = -19; x <= -11; x += 4) s.window(x, 3, -5);
      for (let x = -20; x <= -16; x += 4) {
        s.fill(x, 2, -12, x + 1, 2, -9, 'wool_white');
        s.fill(x, 2, -15, x + 1, 2, -14, 'wool_red');
      }
      s.fill(-20, 2, -7, -19, 3, -7, 'crate');
      s.set(-10, 2, -7, 'chest');
      s.torch(-13, 4, -5);
      // Command bunker at the north end.
      s.fill(-8, 1, -21, 8, 1, -10, 'concrete_black');
      s.walls(-8, -21, 8, -10, 2, 8, 'concrete_gray');
      s.fill(-8, 9, -21, 8, 9, -10, 'concrete_black');
      s.door(0, -10, 2);
      s.fill(-2, 2, -22, 2, 4, -22, 'glass');
      s.fill(-10, 10, -23, 10, 10, -8, 'concrete_white');
      s.fill(-8, 11, -21, -6, 11, -19, 'glowstone');
      s.fill(6, 11, -21, 8, 11, -19, 'glowstone');
      // Antenna and radar.
      s.fill(0, 11, -16, 0, 15, -16, 'stone_bricks');
      s.fill(-1, 15, -17, 1, 15, -15, 'concrete_white');
      s.fill(4, 10, -18, 4, 13, -18, 'stone_bricks');
      s.fill(5, 13, -18, 8, 13, -18, 'concrete_white');
      s.fill(5, 12, -18, 8, 12, -18, 'concrete_white');
      // Helipad.
      for (let x = 6; x <= 18; x++) {
        for (let z = 3; z <= 15; z++) {
          const d = Math.hypot(x - 12, z - 9);
          if (d <= 6) s.set(x, 1, z, d > 5 ? 'concrete_white' : 'concrete_black');
        }
      }
      s.fill(10, 1, 5, 10, 1, 13, 'concrete_white');
      s.fill(14, 1, 5, 14, 1, 13, 'concrete_white');
      s.fill(10, 1, 9, 14, 1, 9, 'concrete_white');
      // Sandbag lines and barriers.
      for (let x = -16; x <= -10; x += 2) {
        s.fill(x, 1, 6, x + 1, 2, 6, 'clay');
        s.fill(x, 3, 6, x + 1, 3, 6, 'sandstone');
      }
      for (let z = 2; z <= 10; z += 2) {
        s.fill(-4, 1, z, -4, 2, z, 'clay');
        s.fill(-4, 3, z, -4, 3, z, 'sandstone');
      }
      for (let x = 2; x <= 10; x += 4) {
        s.fill(x, 1, 19, x, 2, 19, 'concrete_yellow');
        s.fill(x, 3, 19, x, 3, 19, 'concrete_black');
      }
      // Armour: a tank and a jeep.
      s.fill(-10, 2, 10, -3, 3, 13, 'concrete_green');
      s.fill(-11, 2, 9, -2, 2, 14, 'concrete_black');
      s.fill(-7, 4, 11, -5, 5, 12, 'concrete_green');
      s.fill(-12, 4, 11, -11, 4, 12, 'concrete_black');
      s.fill(-3, 3, 11, 2, 3, 11, 'concrete_black');
      for (const [x, z] of [[-9, 9], [-9, 14], [-2, 9], [-2, 14]]) s.fill(x, 1, z, x + 1, 2, z, 'wool_black');
      s.fill(14, 2, 18, 20, 3, 21, 'concrete_green');
      s.fill(15, 4, 19, 19, 4, 20, 'wool_black');
      for (const [x, z] of [[14, 17], [20, 17], [14, 22], [20, 22]]) s.fill(x, 1, z, x, 2, z, 'wool_black');
      // Supply yard and flags.
      for (let i = 0; i < 4; i++) {
        s.fill(-19 + i * 2, 1, 19, -18 + i * 2, 2, 20, 'crate');
        s.set(-19 + i * 2, 3, 19, 'barrel');
      }
      s.fill(20, 1, -16, 22, 4, -14, 'crate');
      s.fill(-1, 1, 16, 1, 6, 16, 'concrete_white');
      s.fill(1, 5, 16, 4, 6, 16, 'wool_red');
      s.torch(3, 3, 16);
    },
  },
  {
    key: 'city_block', name: 'Neon Block', description: 'A dense city block with cross streets, glass offices, a corner diner, neon signs and street clutter.',
    size: [33, 38, 33], tags: ['city', 'urban', 'gta', 'modern'], glyph: '▥',
    build(s) {
      // Streets and sidewalks.
      s.fill(-16, 0, -16, 16, 0, 16, 'concrete_gray');
      s.fill(-16, 0, -4, 16, 0, 4, 'concrete_black');
      s.fill(-4, 0, -16, 4, 0, 16, 'concrete_black');
      s.fill(-16, 0, -5, 16, 0, -5, 'concrete_white');
      s.fill(-16, 0, 5, 16, 0, 5, 'concrete_white');
      s.fill(-5, 0, -16, -5, 0, 16, 'concrete_white');
      s.fill(5, 0, -16, 5, 0, 16, 'concrete_white');
      for (let x = -15; x <= 15; x += 3) {
        if (Math.abs(x) > 4) s.set(x, 0, 0, 'concrete_yellow');
      }
      for (let z = -15; z <= 15; z += 3) {
        if (Math.abs(z) > 4) s.set(0, 0, z, 'concrete_yellow');
      }
      // North-west office tower.
      s.fill(-16, 1, -16, -6, 1, -6, 'concrete_white');
      s.walls(-16, -16, -6, -6, 2, 20, 'concrete_gray');
      for (let y = 3; y <= 19; y += 3) {
        for (let x = -15; x <= -7; x += 2) {
          s.window(x, y, -6);
          s.window(x, y, -16);
        }
        for (let z = -15; z <= -7; z += 2) {
          s.window(-16, y, z);
          s.window(-6, y, z);
        }
      }
      s.fill(-16, 21, -16, -6, 21, -6, 'concrete_black');
      s.fill(-15, 22, -15, -7, 22, -7, 'concrete_gray');
      s.fill(-13, 23, -13, -11, 23, -11, 'glowstone');
      s.fill(-9, 22, -9, -7, 24, -7, 'concrete_white');
      s.fill(-16, 2, -6, -14, 4, -6, 'glass');
      s.door(-11, -6, 2);
      // North-east glass skyscraper.
      s.fill(6, 1, -16, 16, 1, -6, 'concrete_black');
      s.walls(6, -16, 16, -6, 2, 30, 'glass');
      for (let y = 4; y <= 28; y += 4) {
        s.fill(6, y, -16, 16, y, -6, 'concrete_white');
      }
      for (const [x, z] of [[6, -16], [16, -16], [6, -6], [16, -6]]) s.fill(x, 2, z, x, 30, z, 'concrete_gray');
      s.fill(6, 31, -16, 16, 31, -6, 'concrete_black');
      s.fill(9, 32, -13, 13, 32, -9, 'concrete_white');
      s.fill(10, 33, -12, 10, 34, -12, 'stone_bricks');
      s.set(10, 35, -12, 'glowstone');
      s.door(11, -6, 2);
      // South-west diner.
      s.fill(-16, 1, 6, -7, 1, 15, 'bricks');
      s.walls(-16, 6, -7, 15, 2, 6, 'concrete_white');
      s.fill(-16, 6, 6, -7, 6, 15, 'concrete_red');
      s.door(-12, 15, 2);
      s.fill(-15, 3, 15, -9, 4, 15, 'glass');
      s.fill(-16, 7, 6, -7, 7, 15, 'wool_red');
      s.set(-12, 8, 10, 'glowstone');
      s.fill(-14, 2, 8, -13, 2, 9, 'oak_planks');
      s.fill(-10, 2, 8, -9, 2, 9, 'oak_planks');
      s.set(-13, 2, 12, 'barrel');
      s.set(-8, 2, 12, 'crate');
      // South-east neon arcade.
      s.fill(7, 1, 6, 16, 1, 15, 'concrete_gray');
      s.walls(7, 6, 16, 15, 2, 10, 'concrete_black');
      s.fill(7, 11, 6, 16, 11, 15, 'concrete_white');
      s.door(11, 15, 2);
      for (let x = 8; x <= 15; x += 2) s.fill(x, 3, 15, x, 8, 15, (x % 4 === 0) ? 'wool_cyan' : 'wool_purple');
      s.fill(8, 12, 15, 15, 13, 15, 'wool_cyan');
      s.fill(7, 2, 7, 9, 3, 7, 'quartz_block');
      s.fill(13, 2, 7, 15, 3, 7, 'quartz_block');
      // Rooftop details, street lamps and clutter.
      for (const [x, z] of [[-14, 12], [-9, 12], [8, -8], [14, -8], [-8, -8], [8, 8]]) {
        s.fill(x, 1, z, x, 4, z, 'concrete_white');
        s.set(x, 5, z, 'glowstone');
      }
      s.fill(-3, 1, -14, -2, 2, -13, 'concrete_red');
      s.fill(0, 1, 8, 1, 2, 9, 'concrete_blue');
      s.fill(-3, 1, 12, -2, 1, 13, 'crate');
      s.fill(12, 1, 1, 13, 2, 2, 'barrel');
      s.fill(-14, 1, 1, -13, 2, 2, 'wool_black');
      s.torch(-14, 3, 1);
      for (const [x, z] of [[-16, 0], [16, 0], [0, -16], [0, 16]]) s.lamp(x, 1, z);
    },
  },
  {
    key: 'skyscraper', name: 'Aurora Tower', description: 'A 50-block glass skyscraper with lobby, elevator core, rooftop helipad and a glowing spire.',
    size: [19, 56, 19], tags: ['city', 'tower', 'landmark'], glyph: '▲',
    build(s) {
      s.fill(-8, 0, -8, 8, 0, 8, 'concrete_black');
      s.fill(-7, 1, -7, 7, 1, 7, 'concrete_white');
      s.walls(-7, -7, 7, 7, 2, 44, 'concrete_gray');
      // Glass curtain walls with concrete floor bands.
      for (let y = 3; y <= 43; y++) {
        for (let x = -6; x <= 6; x++) {
          if (y % 4 !== 0 && Math.abs(x) % 2 === 0) {
            s.set(x, y, -7, 'glass');
            s.set(x, y, 7, 'glass');
            s.set(-7, y, x, 'glass');
            s.set(7, y, x, 'glass');
          }
        }
        if (y % 4 === 0) {
          s.fill(-7, y, -7, 7, y, 7, 'concrete_white');
        }
      }
      // Lobby, doors and canopy.
      s.fill(-7, 2, -7, 7, 2, 7, 'concrete_white');
      s.door(0, -7, 2);
      s.fill(-4, 4, -9, 4, 4, -8, 'concrete_black');
      s.fill(-3, 3, -8, 3, 3, -8, 'glowstone');
      s.fill(-5, 2, -6, -3, 3, -6, 'glass');
      s.fill(3, 2, -6, 5, 3, -6, 'glass');
      // Elevator core.
      s.fill(-2, 2, -2, 2, 44, 2, 'stone_bricks');
      s.fill(-1, 2, -1, 1, 44, 1, 'glass');
      // Corner columns.
      for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) s.fill(x, 2, z, x, 44, z, 'concrete_black');
      // Crown.
      s.fill(-7, 45, -7, 7, 45, 7, 'concrete_black');
      s.fill(-6, 46, -6, 6, 46, 6, 'concrete_gray');
      s.fill(-4, 47, -4, 4, 47, 4, 'concrete_white');
      s.fill(-2, 48, -2, 2, 50, 2, 'glass');
      s.fill(-1, 51, -1, 1, 53, 1, 'quartz_block');
      s.set(0, 54, 0, 'glowstone');
      // Roof helipad.
      s.fill(-6, 46, 3, 6, 46, 6, 'concrete_black');
      s.fill(-5, 46, 4, 5, 46, 4, 'concrete_white');
      s.fill(-5, 46, 6, 5, 46, 6, 'concrete_white');
      s.fill(-1, 46, 4, 1, 46, 6, 'concrete_white');
      // Neon signage strips.
      for (let y = 8; y <= 36; y += 7) {
        s.fill(8, y, -4, 8, y + 1, 4, 'wool_cyan');
        s.fill(-8, y + 3, -4, -8, y + 4, 4, 'wool_purple');
      }
      s.torch(-5, 3, -7);
      s.torch(5, 3, -7);
    },
  },
  {
    key: 'platform_course', name: 'Spore Valley Course', description: 'A side-scrolling platform course with chasms, floating steps, pipes, a stair pyramid and a finish flag.',
    size: [79, 28, 19], tags: ['platformer', 'side', 'course', 'mario'], glyph: '▶',
    build(s) {
      const ground = (x0: number, x1: number) => {
        for (let x = x0; x <= x1; x++) {
          for (let z = -7; z <= 7; z++) {
            s.set(x, 0, z, 'grass_block');
            s.set(x, -1, z, 'dirt');
            s.set(x, -2, z, 'dirt');
            s.set(x, -3, z, 'stone');
            s.set(x, -4, z, 'stone');
          }
        }
      };
      const pit = (x0: number, x1: number) => {
        for (let x = x0; x <= x1; x++) {
          for (let z = -7; z <= 7; z++) {
            for (let y = 1; y >= -24; y--) s.set(x, y, z, 'air');
          }
        }
      };
      ground(-37, -24);
      ground(-19, -5);
      ground(1, 13);
      ground(17, 29);
      ground(31, 37);
      pit(-23, -20);
      pit(-4, 0);
      pit(14, 16);
      pit(30, 30);
      // Floating steps over the first chasm.
      s.fill(-23, 3, -2, -22, 3, 2, 'quartz_block');
      s.fill(-21, 5, -1, -20, 5, 1, 'quartz_block');
      s.fill(-19, 3, -1, -18, 3, 1, 'quartz_block');
      // Brick question blocks and coin rows.
      for (let x = -18; x <= -8; x += 3) {
        s.set(x, 4, -3, (x / 3) % 2 === 0 ? 'gold_ore' : 'bricks');
        s.fill(x, 6, -3, x, 7, -3, 'glowstone');
      }
      // Pipe pair.
      s.fill(-12, 1, -1, -10, 2, 2, 'concrete_green');
      s.fill(-13, 3, -2, -9, 3, 3, 'concrete_green');
      s.fill(3, 1, -2, 5, 4, 1, 'concrete_green');
      s.fill(2, 5, -3, 6, 5, 2, 'concrete_green');
      // Stair pyramid over the central gap.
      for (let step = 0; step < 5; step++) {
        s.fill(-4 + step, 1 + step, -3, -3 + step, 1 + step, 3, 'stone_bricks');
      }
      for (let step = 0; step < 4; step++) {
        s.fill(10 - step, 1 + step, -3, 11 - step, 1 + step, 3, 'stone_bricks');
      }
      // Raised brick platform and floating route.
      s.fill(1, 6, -2, 8, 6, 2, 'bricks');
      s.set(3, 7, 0, 'glowstone');
      s.set(6, 7, 0, 'glowstone');
      s.fill(10, 4, -2, 13, 4, 2, 'quartz_block');
      s.fill(14, 6, -1, 16, 6, 1, 'quartz_block');
      s.fill(17, 3, -3, 21, 3, 3, 'oak_planks');
      s.set(19, 4, 0, 'glowstone');
      // Finish plateau with flag.
      s.fill(29, 1, -4, 37, 1, 4, 'stone_bricks');
      s.fill(31, 2, -3, 36, 2, 3, 'quartz_block');
      s.fill(33, 3, 0, 33, 9, 0, 'quartz_block');
      s.fill(34, 8, 0, 37, 9, 0, 'wool_red');
      s.fill(34, 6, 0, 36, 7, 0, 'wool_yellow');
      s.set(33, 10, 0, 'glowstone');
      // Scenery.
      for (const [x, z] of [[-34, -5], [-28, 5], [-6, -5], [9, 5], [22, -5], [35, 5]]) {
        s.fill(x, 1, z, x, 3, z, 'oak_log');
        s.fill(x - 1, 4, z - 1, x + 1, 5, z + 1, 'oak_leaves');
      }
      for (const [x, z] of [[-25, 0], [0, 0], [15, 0], [30, 0]]) {
        s.fill(x, 1, z, x, 3, z, 'concrete_white');
        s.set(x, 4, z, 'glowstone');
      }
      // Small mushroom clusters.
      for (const [x, z] of [[-16, 4], [-7, -4], [8, 3], [23, -3], [34, 3]]) {
        s.set(x, 4, z, 'wool_red');
        s.set(x, 3, z, 'quartz_block');
      }
    },
  },
  {
    key: 'frost_village', name: 'Frostpeak Village', description: 'A snowbound village of spruce longhouses, a campfire, watchtower, hot spring and palisade gate.',
    size: [49, 24, 49], tags: ['snow', 'village', 'survival', 'frost'], glyph: '❄',
    build(s) {
      // Palisade with a south gate.
      for (let x = -24; x <= 24; x++) {
        for (const z of [-24, 24]) {
          if (z === 24 && x >= -3 && x <= 3) continue;
          s.fill(x, 1, z, x, 3, z, 'spruce_log');
          if (x % 2 === 0) s.set(x, 4, z, 'snow_block');
        }
      }
      for (let z = -24; z <= 24; z++) {
        for (const x of [-24, 24]) {
          s.fill(x, 1, z, x, 3, z, 'spruce_log');
          if (z % 2 === 0) s.set(x, 4, z, 'snow_block');
        }
      }
      // Gate arch.
      s.fill(-4, 4, 24, 4, 4, 24, 'spruce_planks');
      s.fill(-4, 5, 24, 4, 5, 24, 'snow_block');
      s.set(-4, 6, 24, 'glowstone');
      s.set(4, 6, 24, 'glowstone');

      // Main longhouse.
      s.fill(-11, 1, -10, 11, 1, 2, 'spruce_planks');
      s.walls(-11, -10, 11, 2, 2, 6, 'spruce_log');
      s.fill(-11, 7, -10, 11, 7, 2, 'spruce_planks');
      s.gableRoof(-11, -10, 11, 2, 8, 'spruce_planks');
      s.door(0, 2, 2);
      s.window(-7, 4, 2); s.window(7, 4, 2);
      s.window(-11, 4, -4); s.window(11, 4, -4);
      s.set(-8, 2, -7, 'furnace');
      s.set(8, 2, -7, 'crafting_table');
      s.set(-2, 2, -7, 'chest');
      s.set(2, 2, -7, 'chest');
      s.fill(-9, 2, -2, -7, 2, -1, 'wool_red');
      s.fill(7, 2, -2, 9, 2, -1, 'wool_blue');
      s.torch(-5, 4, -1); s.torch(5, 4, -1);
      s.set(0, 3, -9, 'glowstone');

      // Side cabins.
      for (const [cx, cz, wool] of [[-18, -13, 'wool_yellow'], [17, -14, 'wool_green']] as const) {
        s.fill(cx - 4, 1, cz - 4, cx + 4, 1, cz + 4, 'spruce_planks');
        s.walls(cx - 4, cz - 4, cx + 4, cz + 4, 2, 4, 'spruce_log');
        s.fill(cx - 4, 5, cz - 4, cx + 4, 5, cz + 4, 'snow_block');
        s.door(cx, cz + 4, 2);
        s.window(cx - 2, 3, cz + 4);
        s.fill(cx - 2, 2, cz - 2, cx + 1, 2, cz - 1, wool);
        s.set(cx + 3, 2, cz - 3, 'chest');
        s.torch(cx - 2, 3, cz + 3);
      }

      // Central campfire.
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.set(dx, 1, 12 + dz, 'cobblestone');
      s.set(0, 1, 12, 'magma');
      for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) s.set(dx, 1, 12 + dz, 'spruce_log');
      s.set(0, 2, 12, 'glowstone');

      // Watchtower.
      s.fill(15, 1, 11, 21, 1, 17, 'stone_bricks');
      for (const [x, z] of [[15, 11], [21, 11], [15, 17], [21, 17]]) s.fill(x, 2, z, x, 9, z, 'spruce_log');
      s.fill(15, 6, 11, 21, 6, 17, 'spruce_planks');
      s.fill(15, 10, 11, 21, 10, 17, 'snow_block');
      s.fill(14, 11, 10, 22, 11, 18, 'spruce_planks');
      for (const [x, z] of [[15, 11], [21, 11], [15, 17], [21, 17]]) s.set(x, 7, z, 'torch');
      s.set(18, 9, 14, 'chest');

      // Market crates and lumber.
      for (const [x, z] of [[-6, 18], [-7, 18], [-6, 19], [7, 17], [8, 17]]) s.set(x, 1, z, 'crate');
      s.fill(10, 1, 20, 14, 1, 20, 'spruce_log');
      s.fill(10, 2, 20, 14, 2, 20, 'spruce_log');
      s.set(12, 3, 20, 'snow_block');

      // Snowy pines around the edge.
      for (const [x, z] of [[-20, 18], [-21, -2], [20, 20], [21, -6], [-14, 21], [14, -21], [-22, 9]]) {
        s.fill(x, 1, z, x, 5, z, 'spruce_log');
        s.fill(x - 2, 3, z - 2, x + 2, 4, z + 2, 'spruce_leaves');
        s.fill(x - 1, 5, z - 1, x + 1, 6, z + 1, 'spruce_leaves');
        s.set(x, 7, z, 'spruce_leaves');
        s.set(x, 8, z, 'snow_block');
      }
      // Paths.
      for (let z = 3; z <= 23; z++) s.set(0, 1, z, 'dirt_path');
      for (let x = -16; x <= 16; x++) s.set(x, 1, 12, 'dirt_path');
    },
  },
  {
    key: 'ice_cavern', name: 'Rime Cavern', description: 'A frozen cave mouth descending into a crystal chamber with ice pillars, treasure and a sleeping colossus.',
    size: [33, 22, 33], tags: ['snow', 'cave', 'dungeon', 'frost'], glyph: '⛰',
    build(s) {
      // Snow mound with a carved entrance facing south.
      for (let y = 0; y <= 7; y++) {
        const r = 13 - Math.floor(y * 1.4);
        for (let z = -13; z <= 13; z++) {
          for (let x = -13; x <= 13; x++) {
            if (x * x + z * z > r * r) continue;
            s.set(x, y, z, y >= 4 ? 'snow_block' : y > 0 ? 'ice' : 'snow_block');
          }
        }
      }
      // Entrance arch.
      s.clear(-3, 1, 9, 3, 4, 13);
      s.clear(-3, 1, 10, 3, 4, 10);
      s.fill(-5, 1, 11, -4, 6, 11, 'ice');
      s.fill(4, 1, 11, 5, 6, 11, 'ice');
      s.fill(-4, 7, 11, 4, 7, 11, 'snow_block');
      s.set(-3, 8, 11, 'glowstone'); s.set(3, 8, 11, 'glowstone');

      // Descending corridor.
      for (let i = 0; i < 10; i++) {
        const z = 9 - i;
        const y = -i;
        s.clear(-2, y + 1, z, 2, y + 4, z);
        s.fill(-3, y, z, 3, y, z, 'stone_bricks');
        s.fill(-3, y + 1, z, -3, y + 4, z, 'ice');
        s.fill(3, y + 1, z, 3, y + 4, z, 'ice');
        s.fill(-3, y + 5, z, 3, y + 5, z, 'stone_bricks');
        if (i % 3 === 0) s.set(0, y + 4, z, 'glowstone');
      }

      // Crystal chamber.
      s.clear(-12, -12, -12, 12, -4, 0);
      s.fill(-12, -13, -12, 12, -13, 0, 'stone_bricks');
      for (let z = -12; z <= 0; z++) {
        for (let x = -12; x <= 12; x++) {
          if (x === -12 || x === 12 || z === -12 || z === 0) {
            s.fill(x, -11, z, x, -4, z, 'ice');
          }
        }
      }
      // Ice pillars.
      for (const [x, z] of [[-8, -4], [-8, -9], [8, -4], [8, -9], [0, -3]]) {
        s.fill(x, -12, z, x, -4, z, 'ice');
        s.set(x, -3, z, 'snow_block');
      }
      // Crystals and treasure.
      for (const [x, z, y] of [[-6, -8, -12], [6, -8, -12], [0, -10, -12], [-3, -5, -12], [4, -6, -12]]) {
        s.fill(x, y, z, x, y + 2, z, 'crystal_block');
        s.set(x, y + 3, z, 'glowstone');
      }
      s.set(-10, -12, -2, 'chest');
      s.set(10, -12, -2, 'chest');
      s.set(0, -12, -12, 'gold_ore');
      s.set(-1, -12, -12, 'gold_ore');
      s.set(1, -12, -12, 'gold_ore');
      // Frozen throne for the boss.
      s.fill(-3, -12, -11, 3, -11, -11, 'stone_bricks');
      s.fill(-3, -10, -11, -3, -7, -11, 'ice');
      s.fill(3, -10, -11, 3, -7, -11, 'ice');
      s.fill(-3, -6, -11, 3, -6, -11, 'ice');
      // Stalactites.
      for (const [x, z] of [[-9, -2], [9, -11], [-4, -7], [4, -2]]) {
        s.fill(x, -4, z, x, -5, z, 'ice');
        s.set(x, -6, z, 'ice');
      }
    },
  },
  {
    key: 'summit_shrine', name: 'Frostpeak Summit', description: 'A stepped snow mountain crowned by a quartz shrine, beacon fire and dragon perch.',
    size: [45, 38, 45], tags: ['snow', 'mountain', 'boss', 'frost'], glyph: '▲',
    build(s) {
      // Stepped cone.
      for (let y = 0; y <= 22; y++) {
        const r = 18 - y * 0.68;
        const top = y === 22;
        for (let z = -18; z <= 18; z++) {
          for (let x = -18; x <= 18; x++) {
            if (x * x + z * z > r * r) continue;
            s.set(x, y, z, top ? 'snow_block' : y % 3 === 0 ? 'snow_block' : 'stone');
          }
        }
      }
      // Spiral ledge of packed snow.
      for (let i = 0; i < 34; i++) {
        const a = i * 0.52;
        const y = 2 + Math.floor(i * 0.6);
        const r = 17 - y * 0.62;
        const x = Math.round(Math.cos(a) * r);
        const z = Math.round(Math.sin(a) * r);
        s.set(x, y + 1, z, 'snow_block');
        if (i % 5 === 0) s.set(x, y + 2, z, 'glowstone');
      }
      // Summit platform and shrine.
      s.fill(-6, 23, -6, 6, 23, 6, 'quartz_block');
      s.fill(-5, 24, -5, 5, 24, 5, 'snow_block');
      for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        s.fill(x, 24, z, x, 28, z, 'quartz_block');
        s.set(x, 29, z, 'glowstone');
      }
      s.fill(-5, 30, -5, 5, 30, 5, 'quartz_block');
      s.fill(-4, 31, -4, 4, 31, 4, 'snow_block');
      s.set(0, 32, 0, 'crystal_block');
      s.set(0, 33, 0, 'glowstone');
      s.set(0, 24, 0, 'gold_ore');
      s.set(-2, 24, 0, 'chest');
      // Dragon perch.
      s.fill(-3, 24, -8, 3, 24, -7, 'obsidian');
      s.fill(-2, 25, -8, 2, 25, -8, 'stone_bricks');
      // Pine cluster on the lower slopes.
      for (const [x, z] of [[-15, 6], [14, 10], [-10, -14], [16, -6]]) {
        s.fill(x, 1, z, x, 5, z, 'spruce_log');
        s.fill(x - 2, 3, z - 2, x + 2, 4, z + 2, 'spruce_leaves');
        s.fill(x - 1, 5, z - 1, x + 1, 6, z + 1, 'spruce_leaves');
        s.set(x, 7, z, 'snow_block');
      }
      // Ice spikes.
      for (const [x, z, h] of [[-12, 2, 9], [11, -12, 11], [-6, 12, 8], [13, 3, 7]]) {
        s.fill(x, 1, z, x, h, z, 'ice');
        s.set(x, h + 1, z, 'snow_block');
      }
    },
  },
  {
    key: 'hot_spring', name: 'Hot Spring', description: 'A steaming stone pool with benches and lantern posts — the warm heart of Frostpeak.',
    size: [17, 6, 15], tags: ['snow', 'water', 'frost', 'decor'], glyph: '♨',
    build(s) {
      for (let z = -6; z <= 6; z++) {
        for (let x = -7; x <= 7; x++) {
          const d = (x / 6.2) ** 2 + (z / 5.2) ** 2;
          if (d <= 1) s.set(x, 0, z, 'water');
          else if (d <= 1.36) s.set(x, 0, z, 'stone_bricks');
        }
      }
      for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
        s.fill(x, 1, z, x, 3, z, 'spruce_log');
        s.set(x, 4, z, 'glowstone');
      }
      s.fill(-7, 0, 0, -6, 0, 0, 'stone_bricks');
      s.fill(6, 0, 0, 7, 0, 0, 'stone_bricks');
      for (const [x, z] of [[-5, -4], [5, -4]]) s.set(x, 1, z, 'snow_block');
      s.fill(-2, 0, 6, 2, 0, 6, 'spruce_planks');
      s.fill(-1, 1, 6, 1, 1, 6, 'spruce_planks');
    },
  },
  {
    key: 'desert_outpost', name: 'Sunscour Outpost', description: 'A sandstone trading outpost with a gate, well, bazaar awnings, palms and two flat-roofed houses.',
    size: [47, 20, 47], tags: ['desert', 'village', 'outpost'], glyph: '☀',
    build(s) {
      // Courtyard.
      s.fill(-22, 0, -22, 22, 0, 22, 'sandstone');
      // Walls + corner towers.
      s.walls(-22, -22, 22, 22, 1, 4, 'sandstone');
      s.fill(-22, 5, -22, 22, 5, -22, 'sandstone');
      s.fill(-22, 5, 22, 22, 5, 22, 'sandstone');
      s.fill(-22, 5, -22, -22, 5, 22, 'sandstone');
      s.fill(22, 5, -22, 22, 5, 22, 'sandstone');
      s.fill(-3, 1, 22, 3, 4, 22, 'air');
      s.fill(-4, 5, 22, 4, 6, 22, 'sandstone');
      s.set(-4, 7, 22, 'glowstone'); s.set(4, 7, 22, 'glowstone');
      for (const [x, z] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
        s.fill(x - 2, 1, z - 2, x + 2, 7, z + 2, 'sandstone');
        s.fill(x - 2, 8, z - 2, x + 2, 8, z + 2, 'terracotta');
        s.set(x, 9, z, 'glowstone');
      }
      // Well.
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) === 2 || Math.abs(z) === 2) s.set(x, 1, z, 'cobblestone');
        else s.set(x, 1, z, 'water');
      }
      s.fill(-2, 2, -2, -2, 4, -2, 'cobblestone');
      s.fill(2, 2, -2, 2, 4, -2, 'cobblestone');
      s.fill(-2, 5, -2, 2, 5, -2, 'spruce_planks');
      // Bazaar awnings.
      for (const [cx, cz, wool] of [[-12, 8, 'wool_red'], [11, 8, 'wool_yellow'], [-11, -6, 'wool_blue']] as const) {
        s.fill(cx - 3, 1, cz - 2, cx + 3, 1, cz + 2, 'sandstone');
        s.fill(cx - 3, 4, cz - 2, cx + 3, 4, cz + 2, wool);
        for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) s.fill(cx + dx, 1, cz + dz, cx + dx, 3, cz + dz, 'spruce_log');
        s.set(cx, 2, cz, 'chest');
        s.set(cx - 2, 2, cz + 2, 'crafting_table');
      }
      // Flat-roof houses.
      for (const [cx, cz] of [[-16, -15], [15, -15]]) {
        s.fill(cx - 5, 1, cz - 4, cx + 5, 1, cz + 4, 'sandstone');
        s.walls(cx - 5, cz - 4, cx + 5, cz + 4, 2, 5, 'sandstone');
        s.fill(cx - 5, 6, cz - 4, cx + 5, 6, cz + 4, 'terracotta');
        s.door(cx, cz + 4, 2);
        s.window(cx - 2, 3, cz + 4); s.window(cx + 2, 3, cz + 4);
        s.set(cx - 4, 2, cz - 3, 'furnace');
        s.set(cx + 4, 2, cz - 3, 'chest');
        s.torch(cx, 3, cz + 3);
      }
      // Palms.
      for (const [x, z] of [[-18, 16], [18, 16], [-18, -2], [18, 4]]) {
        s.fill(x, 1, z, x, 5, z, 'spruce_log');
        for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1]]) {
          s.fill(x + dx, 6, z + dz, x + dx, 6, z + dz, 'oak_leaves');
        }
        s.set(x, 7, z, 'oak_leaves');
      }
      // Crates and rugs.
      s.fill(6, 1, 18, 9, 1, 18, 'wool_red');
      for (const [x, z] of [[-8, 18], [-9, 18], [-8, 19], [10, 14]]) s.set(x, 1, z, 'crate');
      s.set(16, 1, 18, 'chest');
    },
  },
  {
    key: 'bandit_camp', name: 'Sunscour Bandit Camp', description: 'A raider camp of hide tents, a watchtower, cages, a campfire and stolen loot.',
    size: [33, 14, 33], tags: ['desert', 'bandit', 'camp', 'combat'], glyph: '⚔',
    build(s) {
      // Sandy floor and partial palisade.
      s.fill(-15, 0, -15, 15, 0, 15, 'sand');
      for (let i = -14; i <= 14; i += 3) {
        s.fill(i, 1, -14, i, 3, -14, 'spruce_log');
        s.fill(-14, 1, i, -14, 3, i, 'spruce_log');
        s.fill(14, 1, i, 14, 3, i, 'spruce_log');
      }
      // Hide tents.
      for (const [cx, cz, wool] of [[-6, 3, 'wool_red'], [7, 2, 'wool_yellow'], [1, -7, 'wool_black']] as const) {
        s.fill(cx - 3, 1, cz - 3, cx + 3, 1, cz + 3, 'sand');
        s.fill(cx - 3, 2, cz, cx - 3, 3, cz, 'spruce_log');
        s.fill(cx + 3, 2, cz, cx + 3, 3, cz, 'spruce_log');
        s.fill(cx - 3, 4, cz - 3, cx + 3, 4, cz + 3, wool);
        s.fill(cx - 2, 3, cz - 2, cx + 2, 3, cz + 2, wool);
        s.set(cx, 2, cz, 'chest');
        s.set(cx + 1, 2, cz + 1, 'wool_white');
      }
      // Campfire.
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.set(dx, 1, dz, 'cobblestone');
      s.set(0, 1, 0, 'magma');
      s.set(0, 2, 0, 'glowstone');
      for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) s.set(dx, 1, dz, 'spruce_log');
      // Watchtower.
      for (const [x, z] of [[9, 9], [13, 9], [9, 13], [13, 13]]) s.fill(x, 1, z, x, 7, z, 'spruce_log');
      s.fill(9, 6, 9, 13, 6, 13, 'spruce_planks');
      s.fill(8, 8, 8, 14, 8, 14, 'wool_red');
      s.set(11, 7, 11, 'chest');
      // Cages.
      for (const [x, z] of [[-11, 8], [-7, 11]]) {
        s.fill(x - 1, 1, z - 1, x + 1, 1, z + 1, 'cobblestone');
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.fill(x + dx, 2, z + dz, x + dx, 4, z + dz, 'spruce_log');
        s.fill(x - 1, 4, z - 1, x + 1, 4, z + 1, 'spruce_log');
      }
      // Banner poles and loot.
      for (const [x, z] of [[-12, -10], [11, -10], [0, 12]]) {
        s.fill(x, 1, z, x, 5, z, 'spruce_log');
        s.fill(x + 1, 4, z, x + 2, 5, z, 'wool_red');
      }
      s.set(-4, 1, -4, 'chest');
      s.set(4, 1, -8, 'chest');
      s.fill(2, 1, 8, 5, 1, 9, 'wool_yellow');
    },
  },
  {
    key: 'sunken_temple', name: 'Sunscour Temple', description: 'A stepped sandstone pyramid half-buried in the dunes, with a loot chamber, traps and a summit shrine.',
    size: [39, 26, 39], tags: ['desert', 'temple', 'dungeon', 'boss'], glyph: '▲',
    build(s) {
      // Sand apron and courtyard.
      s.fill(-17, 0, -17, 17, 0, 17, 'sand');
      s.fill(-14, 1, 16, 14, 1, 20, 'sandstone');
      // Stepped pyramid tiers.
      for (let tier = 0; tier < 6; tier++) {
        const half = 15 - tier * 2;
        const y = 1 + tier * 2;
        s.fill(-half, y, -half, half, y + 1, half, tier % 2 === 0 ? 'sandstone' : 'terracotta');
      }
      // Entrance corridor from the south.
      s.clear(-2, 2, 14, 2, 5, 14);
      s.clear(-2, 2, 8, 2, 5, 14);
      s.fill(-3, 2, 8, -3, 5, 14, 'sandstone');
      s.fill(3, 2, 8, 3, 5, 14, 'sandstone');
      s.fill(-3, 6, 8, 3, 6, 14, 'sandstone');
      s.set(0, 6, 12, 'glowstone');
      // Central chamber.
      s.clear(-9, 2, -8, 9, 6, 8);
      s.fill(-9, 1, -8, 9, 1, 8, 'sandstone');
      s.fill(-9, 2, -8, -9, 6, 8, 'sandstone');
      s.fill(9, 2, -8, 9, 6, 8, 'sandstone');
      s.fill(-9, 2, 8, 9, 6, 8, 'sandstone');
      s.fill(-9, 7, -8, 9, 7, 8, 'sandstone');
      for (const [x, z] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) s.fill(x, 2, z, x, 6, z, 'terracotta');
      // Treasure and altar.
      s.fill(-2, 2, -7, 2, 2, -6, 'gold_ore');
      s.set(-3, 2, -7, 'chest');
      s.set(3, 2, -7, 'chest');
      s.fill(-1, 3, -7, 1, 4, -7, 'crystal_block');
      s.set(0, 5, -7, 'glowstone');
      // Traps.
      s.set(-6, 2, 0, 'tnt');
      s.set(6, 2, 0, 'tnt');
      s.fill(-4, 2, 3, 4, 2, 3, 'gold_ore');
      // Summit shrine.
      s.fill(-5, 13, -5, 5, 13, 5, 'sandstone');
      for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        s.fill(x, 14, z, x, 17, z, 'quartz_block');
      }
      s.fill(-5, 18, -5, 5, 18, 5, 'terracotta');
      s.set(0, 19, 0, 'glowstone');
      s.set(0, 14, 0, 'gold_ore');
      // Obelisks and palms.
      for (const [x, z] of [[-13, 14], [13, 14], [-13, -14], [13, -14]]) {
        s.fill(x, 1, z, x, 5, z, 'terracotta');
        s.set(x, 6, z, 'glowstone');
      }
      for (const [x, z] of [[-16, 4], [16, 2], [-15, -8], [15, -9]]) {
        s.fill(x, 1, z, x, 5, z, 'spruce_log');
        s.fill(x - 2, 6, z, x + 2, 6, z, 'oak_leaves');
        s.fill(x, 6, z - 2, x, 6, z + 2, 'oak_leaves');
      }
      // Fallen blocks and half-buried ruins.
      for (const [x, z] of [[-17, 10], [17, 9], [-16, -2], [18, -3]]) {
        s.fill(x, 1, z, x + 1, 2, z, 'sandstone');
      }
    },
  },
  {
    key: 'sky_temple', name: 'Sky Temple Trials', description: 'A chain of floating islands climbing through the clouds to a quartz temple, its guardian and a crystal crown.',
    size: [90, 36, 90], tags: ['sky', 'temple', 'platformer', 'parkour'], glyph: '☁',
    build(s) {
      const island = (cx: number, cz: number, r: number, top: number) => {
        for (let y = top; y >= top - 6; y--) {
          const rr = Math.max(1, r + (y - top) * 0.72);
          for (let z = -Math.ceil(rr); z <= Math.ceil(rr); z++) {
            for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) {
              if (x * x + z * z > rr * rr) continue;
              s.set(cx + x, y, cz + z, y === top ? 'grass_block' : y > top - 3 ? 'dirt' : 'stone');
            }
          }
        }
        // Hanging crystals.
        if (r >= 4) {
          s.set(cx, top - 4, cz, 'crystal_block');
          s.set(cx, top - 5, cz, 'glowstone');
        }
      };
      // Start island.
      island(0, 8, 7, 0);
      s.set(2, 1, 9, 'crafting_table');
      s.set(-2, 1, 9, 'chest');
      s.fill(-1, 1, 4, 1, 1, 4, 'quartz_block');
      s.set(0, 2, 4, 'glowstone');
      // Stepping islands. Each one rises a single block so the route is a
      // genuine jump course rather than a wall of floating platforms.
      island(0, -3, 5, 1);
      island(7, -11, 4, 2);
      island(-1, -19, 4, 3);
      island(0, -25, 3, 4);
      // Floating stepping stones halfway across the two widest gaps.
      for (const [x, y, z] of [[4, 2, -7], [3, 3, -15]]) {
        s.fill(x, y, z, x, y, z, 'quartz_block');
      }
      // The final stair: one-block rises from the last island to the temple
      // floor at y = 8.
      s.fill(-2, 5, -27, 2, 5, -27, 'quartz_block');
      s.fill(-2, 6, -28, 2, 6, -28, 'quartz_block');
      s.fill(-2, 7, -29, 2, 7, -29, 'quartz_block');
      // Temple platform with an underside.
      for (let y = 8; y >= 3; y--) {
        const shrink = (8 - y) * 1.4;
        const hx = Math.max(4, 11 - shrink);
        const hz = Math.max(4, 10 - shrink);
        s.fill(-hx, y, -40 - hz, hx, y, -40 + hz, y === 8 ? 'quartz_block' : 'stone');
      }
      // Temple floor and steps.
      s.fill(-11, 8, -50, 11, 8, -30, 'quartz_block');
      s.fill(-3, 9, -32, 3, 9, -31, 'quartz_block');
      // Pillars and roof.
      for (const [x, z] of [[-8, -47], [8, -47], [-8, -33], [8, -33]]) {
        s.fill(x, 9, z, x, 14, z, 'quartz_block');
        s.set(x, 15, z, 'gold_ore');
      }
      s.fill(-9, 15, -48, 9, 15, -32, 'quartz_block');
      s.fill(-7, 16, -46, 7, 16, -34, 'snow_block');
      // Shrine.
      s.fill(-3, 9, -46, 3, 9, -40, 'quartz_block');
      s.fill(-1, 10, -44, 1, 12, -42, 'crystal_block');
      s.set(0, 13, -43, 'glowstone');
      s.set(0, 14, -43, 'gold_ore');
      s.set(-4, 9, -43, 'chest');
      // Guardian dais.
      s.fill(-2, 9, -38, 2, 9, -36, 'stone_bricks');
      // Cloud-edge decoration.
      for (const [x, z] of [[-35, -5], [30, -35], [-25, -45], [25, 15]]) {
        s.set(x, -2, z, 'wool_white');
        s.set(x + 1, -2, z, 'wool_white');
        s.set(x, -1, z, 'wool_white');
      }
    },
  },
  {
    key: 'restaurant', name: 'Ember & Oak Restaurant', description: 'A working restaurant: four iron stoves, a long service counter, pantry crates and a lantern-lit dining room.',
    size: [23, 10, 18], tags: ['kitchen', 'restaurant', 'village', 'trade'], glyph: '♨',
    build(s) {
      s.clear(-11, 0, -8, 11, 9, 8);
      s.fill(-10, -1, -7, 10, -1, 7, 'cobblestone');
      s.fill(-10, 0, -7, 10, 0, 7, 'oak_planks');
      for (let z = -7; z <= 7; z++) {
        for (let x = -10; x <= 10; x++) {
          if ((x + z) % 5 === 0) s.set(x, 0, z, 'birch_planks');
        }
      }
      s.walls(-10, -7, 10, 7, 1, 5, 'oak_planks');
      for (const [x, z] of [[-10, -7], [10, -7], [-10, 7], [10, 7]]) s.fill(x, 1, z, x, 5, z, 'oak_log');
      // Wide framed entrance, broad windows and a glass-canopied entry.
      s.door(0, 7);
      s.set(-1, 1, 7, 'air'); s.set(-1, 2, 7, 'air'); s.set(-1, 3, 7, 'air');
      s.set(1, 1, 7, 'air'); s.set(1, 2, 7, 'air'); s.set(1, 3, 7, 'air');
      s.fill(-1, 4, 7, 1, 4, 7, 'oak_log');
      s.set(0, 0, 7, 'oak_planks');
      s.fill(-8, 2, 7, -5, 3, 7, 'glass');
      s.fill(5, 2, 7, 8, 3, 7, 'glass');
      s.window(-10, 2, -2); s.window(-10, 2, 3); s.window(10, 2, -2); s.window(10, 2, 3);
      s.fill(-2, 4, 8, 2, 4, 9, 'glass');
      for (const x of [-2, 2]) s.fill(x, 1, 9, x, 3, 9, 'oak_log');
      s.fill(-1, 0, 8, 1, 0, 10, 'dirt_path');
      s.set(0, 4, 7, 'chalkboard');
      // Service counter with a pass-through gap.
      s.fill(-7, 1, -3, -1, 1, -3, 'counter');
      s.fill(2, 1, -3, 7, 1, -3, 'counter');
      s.set(-4, 2, -3, 'barrel');
      s.set(4, 2, -3, 'crate');
      // Kitchen line.
      for (const x of [-5, -2, 2, 5]) {
        s.set(x, 1, -6, 'stove');
        s.set(x, 2, -7, 'torch');
      }
      s.set(0, 1, -6, 'crafting_table');
      s.set(-9, 1, -6, 'barrel'); s.set(-8, 1, -6, 'crate');
      s.set(9, 1, -6, 'barrel'); s.set(8, 1, -6, 'crate');
      s.set(-9, 1, -5, 'crate'); s.set(9, 1, -5, 'crate');
      // Dining tables down both sides, leaving a clear aisle to the pass.
      s.fill(-8, 1, 0, -7, 1, 1, 'oak_planks');
      s.fill(-4, 1, 0, -3, 1, 1, 'oak_planks');
      s.fill(2, 1, 0, 3, 1, 1, 'oak_planks');
      s.fill(6, 1, 0, 7, 1, 1, 'oak_planks');
      s.torch(-7, 2, 0); s.torch(-3, 2, 0); s.torch(2, 2, 0); s.torch(6, 2, 0);
      s.set(7, 2, 6, 'chalkboard');
      s.set(-7, 2, 6, 'bookshelf');
      // Chandeliers and a timber-framed glass roof.
      for (const x of [-5, 0, 5]) s.set(x, 5, 2, 'glowstone');
      s.fill(-10, 6, -7, 10, 6, 7, 'spruce_planks');
      s.fill(-9, 6, -6, 9, 6, 6, 'glass');
      for (const z of [-5, 3]) s.fill(-9, 6, z, 9, 6, z, 'oak_log');
      // Outdoor planters.
      for (const [x, z] of [[-7, 9], [7, 9]]) {
        s.set(x, 1, z, 'oak_planks');
        s.set(x, 2, z, 'dandelion');
      }
    },
  },
  {
    key: 'general_store', name: 'Corner & Candle Store', description: 'A tidy neighbourhood shop with stocked display shelves, a checkout counter, a chalkboard of specials and storeroom crates.',
    size: [21, 9, 18], tags: ['shop', 'store', 'village', 'trade'], glyph: '▤',
    build(s) {
      s.clear(-10, 0, -8, 10, 8, 8);
      s.fill(-9, -1, -7, 9, -1, 7, 'cobblestone');
      s.fill(-9, 0, -7, 9, 0, 7, 'birch_planks');
      for (let z = -7; z <= 7; z++) {
        for (let x = -9; x <= 9; x++) {
          if ((x * 3 + z * 2) % 7 === 0) s.set(x, 0, z, 'oak_planks');
        }
      }
      s.walls(-9, -7, 9, 7, 1, 5, 'oak_planks');
      for (const [x, z] of [[-9, -7], [9, -7], [-9, 7], [9, 7]]) s.fill(x, 1, z, x, 5, z, 'spruce_log');
      s.door(0, 7);
      s.set(-1, 1, 7, 'air'); s.set(-1, 2, 7, 'air'); s.set(-1, 3, 7, 'air');
      s.set(1, 1, 7, 'air'); s.set(1, 2, 7, 'air'); s.set(1, 3, 7, 'air');
      s.fill(-1, 4, 7, 1, 4, 7, 'spruce_log');
      s.set(0, 0, 7, 'birch_planks');
      s.fill(-7, 2, 7, -3, 3, 7, 'glass');
      s.fill(3, 2, 7, 7, 3, 7, 'glass');
      s.window(-9, 2, -2); s.window(9, 2, -2); s.window(-9, 2, 3); s.window(9, 2, 3);
      // Shelving: one long back run and two side runs.
      s.fill(-6, 1, -6, 6, 1, -6, 'store_shelf');
      for (let z = -4; z <= 4; z++) {
        s.set(-8, 1, z, 'store_shelf');
        s.set(8, 1, z, 'store_shelf');
      }
      s.fill(-6, 2, -6, 6, 2, -6, 'air');
      // Checkout counter and till.
      s.fill(-2, 1, 4, 4, 1, 4, 'counter');
      s.set(1, 2, 4, 'chest');
      s.set(-1, 2, 4, 'bookshelf');
      // Chalkboard specials by the door.
      s.set(6, 2, 6, 'chalkboard');
      s.set(-6, 2, 6, 'bookshelf');
      // Storeroom crates and barrels behind the shelves.
      s.set(-8, 1, -6, 'crate'); s.set(-7, 1, -6, 'barrel');
      s.set(7, 1, -6, 'crate'); s.set(8, 1, -6, 'barrel');
      s.set(-8, 2, -6, 'crate');
      s.set(8, 2, -6, 'crate');
      // Aisle lights and a glass-canopied shopfront.
      for (const x of [-4, 0, 4]) s.set(x, 5, 0, 'glowstone');
      s.fill(-3, 4, 8, 3, 4, 9, 'glass');
      for (const x of [-3, 3]) s.fill(x, 1, 9, x, 3, 9, 'oak_log');
      s.fill(-1, 0, 8, 1, 0, 10, 'dirt_path');
      // Timber-framed glass roof and sign.
      s.fill(-9, 6, -7, 9, 6, 7, 'spruce_planks');
      s.fill(-8, 6, -6, 8, 6, 6, 'glass');
      for (const z of [-3, 2]) s.fill(-8, 6, z, 8, 6, z, 'oak_log');
      s.set(-3, 7, 6, 'glowstone'); s.set(3, 7, 6, 'glowstone');
      s.set(0, 4, 7, 'chalkboard');
    },
  },
  {
    key: 'lucky_arena', name: 'Lucky Block Arena', description: 'A gold-trimmed arena ringed with lucky blocks, cursed blocks, braziers and spectator benches.',
    size: [29, 12, 29], tags: ['lucky', 'arena', 'fortune', 'minigame'], glyph: '?',
    build(s) {
      s.clear(-13, 0, -13, 13, 11, 13);
      s.fill(-12, -1, -12, 12, -1, 12, 'stone_bricks');
      s.fill(-12, 0, -12, 12, 0, 12, 'stone_bricks');
      for (let z = -12; z <= 12; z++) {
        for (let x = -12; x <= 12; x++) {
          if (Math.abs(x) === 12 || Math.abs(z) === 12) continue;
          if ((x + z) % 6 === 0) s.set(x, 0, z, 'quartz_block');
          if ((x - z) % 6 === 0) s.set(x, 0, z, 'quartz_block');
        }
      }
      // Low arena wall with gold caps.
      s.walls(-12, -12, 12, 12, 1, 2, 'stone_bricks');
      for (let i = -12; i <= 12; i += 4) {
        s.set(i, 2, -12, 'gold_block');
        s.set(i, 2, 12, 'gold_block');
        s.set(-12, 2, i, 'gold_block');
        s.set(12, 2, i, 'gold_block');
      }
      // Entrance gap and approach.
      s.door(0, 12);
      s.set(0, 0, 12, 'stone_bricks');
      s.set(0, 0, 13, 'stone_bricks');
      s.fill(-1, 0, 13, 1, 0, 15, 'dirt_path');
      // Corner pylons.
      for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
        s.fill(x, 1, z, x, 5, z, 'quartz_block');
        s.set(x, 6, z, 'glowstone');
        s.set(x, 7, z, 'gold_block');
      }
      // Pedestals of fortune.
      const lucky: Array<[number, number]> = [
        [-8, -4], [-4, -4], [0, -4], [4, -4], [8, -4],
        [-8, 0], [8, 0],
        [-8, 4], [-4, 4], [0, 4], [4, 4], [8, 4],
      ];
      for (const [x, z] of lucky) {
        s.set(x, 0, z, 'quartz_block');
        s.set(x, 1, z, 'lucky_block');
        s.set(x, 2, z - 1, 'torch');
      }
      const cursed: Array<[number, number]> = [[-4, 0], [4, 0], [0, 8]];
      for (const [x, z] of cursed) {
        s.set(x, 0, z, 'obsidian');
        s.set(x, 1, z, 'cursed_lucky_block');
      }
      // Central obelisk.
      s.fill(-2, 1, -1, 2, 1, 1, 'stone_bricks');
      s.fill(-1, 2, -1, 1, 3, 1, 'quartz_block');
      s.set(0, 4, 0, 'gold_block');
      s.set(0, 5, 0, 'glowstone');
      s.set(0, 6, 0, 'gold_block');
      // Braziers along the arena edge.
      for (const [x, z] of [[-10, -7], [10, -7], [-10, 7], [10, 7]]) {
        s.fill(x, 1, z, x, 2, z, 'stone_bricks');
        s.set(x, 3, z, 'glowstone');
      }
      // Spectator benches outside the ring at the entrance.
      for (const z of [14, 16]) {
        s.fill(-8, 1, z, 8, 1, z, z === 14 ? 'wool_red' : 'wool_yellow');
        s.fill(-9, 0, z, 9, 0, z, 'oak_planks');
      }
      // Banners.
      for (const [x, z] of [[-12, -8], [12, -8], [-12, 8], [12, 8]]) {
        s.fill(x, 3, z, x, 4, z, 'wool_purple');
      }
    },
  },
  {
    key: 'storm_arena', name: 'Stormfall Arena', description: 'A ruined contest ground with four loot districts, broken cover, storm pylons and a central beacon. Built for eight contestants and one shrinking ring.',
    size: [61, 24, 61], tags: ['royale', 'arena', 'storm', 'loot'], glyph: '☈',
    build(s) {
      s.clear(-30, 0, -30, 30, 22, 30);
      // Circular fighting floor with worn roads and mossy patches.
      for (let z = -28; z <= 28; z++) {
        for (let x = -28; x <= 28; x++) {
          if (Math.hypot(x, z) > 28.4) continue;
          let key = 'grass_block';
          const d = Math.hypot(x, z);
          if (d > 26.6) key = 'mossy_stone_bricks';
          else if (Math.abs(x) <= 2 || Math.abs(z) <= 2) key = 'dirt_path';
          else if ((x * x + z * z) % 41 < 5) key = 'stone_bricks';
          else if ((x * 7 + z * 11 + 100) % 23 < 3) key = 'podzol';
          s.set(x, 0, z, key);
        }
      }
      // Central storm beacon.
      s.fill(-3, 0, -3, 3, 0, 3, 'stone_bricks');
      s.fill(-2, 1, -2, 2, 1, 2, 'quartz_block');
      s.fill(-1, 2, -1, 1, 2, 1, 'crystal_block');
      s.set(0, 3, 0, 'glowstone');
      s.set(0, 4, 0, 'crystal_block');
      s.set(0, 5, 0, 'gold_block');
      s.set(0, 6, 0, 'glowstone');
      // Outer wall with four broken gates and crenellations.
      for (let i = -28; i <= 28; i++) {
        const gate = Math.abs(i) <= 3;
        if (!gate) {
          s.fill(i, 1, -28, i, 3, -28, 'mossy_stone_bricks');
          s.fill(i, 1, 28, i, 3, 28, 'mossy_stone_bricks');
          s.fill(-28, 1, i, -28, 3, i, 'mossy_stone_bricks');
          s.fill(28, 1, i, 28, 3, i, 'mossy_stone_bricks');
          if (i % 4 === 0) {
            s.set(i, 4, -28, 'stone_bricks');
            s.set(i, 4, 28, 'stone_bricks');
            s.set(-28, 4, i, 'stone_bricks');
            s.set(28, 4, i, 'stone_bricks');
          }
        }
      }
      // Corner ruins.
      for (const [cx, cz] of [[-23, -23], [23, -23], [-23, 23], [23, 23]]) {
        s.fill(cx - 3, 1, cz - 3, cx + 3, 2, cz + 3, 'mossy_stone_bricks');
        s.fill(cx - 2, 1, cz - 2, cx + 2, 5, cz + 2, 'air');
        s.fill(cx - 1, 5, cz - 1, cx + 1, 5, cz + 1, 'stone_bricks');
        s.set(cx, 6, cz, 'glowstone');
        s.set(cx - 2, 1, cz - 2, 'torch');
        s.set(cx + 2, 2, cz + 2, 'stone_bricks');
      }
      // North-west chapel ruin.
      s.fill(-18, 1, -18, -11, 1, -11, 'stone_bricks');
      s.walls(-18, -18, -11, -11, 2, 4, 'stone_bricks');
      s.fill(-16, 1, -18, -13, 3, -18, 'air');
      s.fill(-18, 1, -15, -18, 3, -14, 'air');
      s.fill(-15, 2, -15, -14, 2, -14, 'mossy_stone_bricks');
      s.set(-17, 2, -17, 'torch');
      s.set(-12, 1, -12, 'supply_cache');
      s.set(-13, 1, -17, 'crate');
      s.set(-17, 1, -12, 'barrel');
      // North-east market wreck.
      s.fill(10, 0, -19, 21, 0, -9, 'dirt_path');
      for (const [x, z] of [[12, -17], [17, -17], [12, -11], [17, -11]]) {
        s.fill(x, 1, z, x, 3, z, 'oak_log');
        s.set(x, 4, z, 'wool_orange');
      }
      s.fill(11, 3, -18, 18, 3, -10, 'wool_red');
      s.fill(13, 1, -16, 16, 1, -16, 'oak_planks');
      s.set(14, 2, -16, 'crate');
      s.set(15, 2, -12, 'barrel');
      s.set(19, 1, -18, 'supply_cache');
      s.set(20, 1, -10, 'supply_cache');
      s.set(12, 1, -19, 'crate');
      // South-west warehouse shell.
      s.fill(-20, 1, 9, -10, 1, 19, 'oak_planks');
      s.walls(-20, 9, -10, 19, 2, 5, 'spruce_planks');
      s.fill(-19, 1, 9, -17, 3, 9, 'air');
      s.fill(-10, 2, 14, -10, 3, 16, 'air');
      s.fill(-20, 2, 13, -20, 3, 15, 'air');
      s.fill(-19, 6, 10, -11, 6, 18, 'spruce_planks');
      s.fill(-17, 1, 15, -13, 1, 15, 'oak_planks');
      s.set(-15, 2, 15, 'supply_cache');
      s.set(-19, 1, 12, 'crate');
      s.set(-18, 1, 18, 'barrel');
      s.set(-12, 1, 18, 'crate');
      s.set(-11, 2, 11, 'torch');
      // South-east rocky pocket with cover.
      for (const [x, z, h] of [[10, 10, 2], [14, 12, 3], [18, 10, 2], [11, 16, 2], [16, 18, 3], [20, 15, 2]]) {
        s.fill(x, 1, z, x + 1, h, z + 1, 'mossy_stone_bricks');
        s.set(x, h + 1, z, 'stone_bricks');
      }
      s.set(13, 1, 19, 'supply_cache');
      s.set(9, 1, 13, 'hay_bale');
      s.set(19, 1, 13, 'barrel');
      // Low cover walls across the open field.
      for (const [x, z, len, dir] of [[-8, -7, 4, 'x'], [7, -8, 5, 'z'], [9, 7, 4, 'x'], [-9, 8, 5, 'z'], [-20, 1, 4, 'z'], [21, -2, 3, 'z']] as Array<[number, number, number, 'x' | 'z']>) {
        for (let i = 0; i < len; i++) {
          const bx = dir === 'x' ? x + i : x;
          const bz = dir === 'z' ? z + i : z;
          s.set(bx, 1, bz, i % 2 === 0 ? 'mossy_stone_bricks' : 'stone_bricks');
          if (i === 0 || i === len - 1) s.set(bx, 2, bz, 'stone_bricks');
        }
      }
      // Storm pylons.
      for (const [x, z] of [[20, 0], [0, 20], [-20, 0], [0, -20]]) {
        s.fill(x - 1, 1, z - 1, x + 1, 1, z + 1, 'stone_bricks');
        s.fill(x, 1, z, x, 5, z, 'rune_block');
        s.set(x, 6, z, 'crystal_block');
        s.set(x, 7, z, 'glowstone');
        s.set(x + 2, 1, z, 'torch');
        s.set(x - 2, 1, z, 'torch');
      }
      // Braziers and scattered cover.
      for (const [x, z] of [[-6, 4], [6, -4], [-4, -12], [8, 12], [-12, 4], [12, -3], [4, 17], [-17, 4]]) {
        s.fill(x, 1, z, x, 2, z, 'stone_bricks');
        s.set(x, 3, z, 'glowstone');
      }
      for (const [x, z, key] of [[-4, -6, 'crate'], [5, 5, 'barrel'], [-6, 12, 'crate'], [12, 4, 'hay_bale'], [-14, 6, 'barrel'], [2, -11, 'crate']] as Array<[number, number, string]>) {
        s.set(x, 1, z, key);
      }
      // Supply caches: ten ways to change the odds.
      for (const [x, z] of [[-18, -8], [-9, -19], [6, -20], [19, -11], [21, 5], [14, 19], [1, 21], [-13, 18], [-21, 7], [-5, 9]]) {
        s.set(x, 1, z, 'supply_cache');
        s.set(x + 1, 1, z, 'torch');
      }
      // Dead trees and banners on the rim.
      for (const [x, z] of [[-25, -6], [25, 7], [-7, 25], [6, -25]]) {
        s.fill(x, 1, z, x, 4, z, 'spruce_log');
        s.fill(x - 1, 4, z, x + 1, 4, z, 'spruce_leaves');
      }
      for (const [x, z] of [[-28, -6], [28, 6], [-6, 28], [6, -28]]) {
        s.fill(x, 1, z, x, 4, z, 'wool_purple');
      }
    },
  },
  {
    key: 'emberhold', name: 'Emberhold Keep', description: 'A four-gate fortress yard built around a burning Ember Core: lanes, barracks, clockwork turrets and a repair yard ready for a siege.',
    size: [57, 22, 57], tags: ['siege', 'fortress', 'defense', 'arena'], glyph: '♜',
    build(s) {
      s.clear(-28, 0, -28, 28, 20, 28);
      // Courtyard floor.
      s.fill(-26, 0, -26, 26, 0, 26, 'stone_bricks');
      for (let z = -26; z <= 26; z++) {
        for (let x = -26; x <= 26; x++) {
          if ((x + z + 52) % 9 === 0) s.set(x, 0, z, 'cobblestone');
          if ((x * 5 + z * 7 + 100) % 29 === 0) s.set(x, 0, z, 'mossy_stone_bricks');
        }
      }
      // Cardinal lanes to the core.
      s.fill(-2, 0, -26, 2, 0, 26, 'dirt_path');
      s.fill(-26, 0, -2, 26, 0, 2, 'dirt_path');
      // Outer curtain wall with four gates.
      for (let i = -26; i <= 26; i++) {
        const gate = Math.abs(i) <= 3;
        if (gate) continue;
        s.fill(i, 1, -26, i, 5, -26, 'stone_bricks');
        s.fill(i, 1, 26, i, 5, 26, 'stone_bricks');
        s.fill(-26, 1, i, -26, 5, i, 'stone_bricks');
        s.fill(26, 1, i, 26, 5, i, 'stone_bricks');
        if (i % 3 === 0) {
          s.set(i, 6, -26, 'stone_bricks');
          s.set(i, 6, 26, 'stone_bricks');
          s.set(-26, 6, i, 'stone_bricks');
          s.set(26, 6, i, 'stone_bricks');
        }
        if (Math.abs(i) % 9 === 0) {
          s.set(i, 4, -26, 'glowstone');
          s.set(i, 4, 26, 'glowstone');
          s.set(-26, 4, i, 'glowstone');
          s.set(26, 4, i, 'glowstone');
        }
      }
      // Gatehouses: twin posts, lintel and braziers.
      for (const [x, z, yaw] of [[0, -26, 0], [0, 26, 0], [-26, 0, 1], [26, 0, 1]]) {
        if (yaw === 0) {
          s.fill(x - 4, 1, z, x - 4, 5, z, 'stone_bricks');
          s.fill(x + 4, 1, z, x + 4, 5, z, 'stone_bricks');
          s.fill(x - 4, 6, z, x + 4, 6, z, 'stone_bricks');
          s.set(x - 3, 2, z, 'glowstone');
          s.set(x + 3, 2, z, 'glowstone');
        } else {
          s.fill(x, 1, z - 4, x, 5, z - 4, 'stone_bricks');
          s.fill(x, 1, z + 4, x, 5, z + 4, 'stone_bricks');
          s.fill(x, 6, z - 4, x, 6, z + 4, 'stone_bricks');
          s.set(x, 2, z - 3, 'glowstone');
          s.set(x, 2, z + 3, 'glowstone');
        }
      }
      // Corner towers.
      for (const [cx, cz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
        s.fill(cx - 3, 1, cz - 3, cx + 3, 8, cz + 3, 'stone_bricks');
        s.fill(cx - 2, 2, cz - 2, cx + 2, 8, cz + 2, 'air');
        s.fill(cx - 2, 9, cz - 2, cx + 2, 9, cz + 2, 'stone_bricks');
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
          s.set(cx + dx, 10, cz + dz, 'stone_bricks');
        }
        s.set(cx, 10, cz, 'glowstone');
        s.set(cx, 5, cz - 3, 'wool_red');
      }
      // Central dais and Ember Core.
      s.fill(-4, 0, -4, 4, 0, 4, 'quartz_block');
      s.fill(-3, 1, -3, 3, 1, 3, 'stone_bricks');
      s.fill(-2, 1, -2, 2, 1, 2, 'glowstone');
      s.set(0, 2, 0, 'siege_core');
      // Four clockwork turrets on diagonal plinths.
      for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
        s.fill(x - 1, 0, z - 1, x + 1, 0, z + 1, 'stone_bricks');
        s.fill(x - 1, 1, z - 1, x + 1, 1, z + 1, 'stone_bricks');
        s.set(x, 2, z, 'siege_turret');
        s.set(x + 1, 2, z, 'torch');
      }
      // Core-side repair yard: crates, barrels and a workbench.
      s.fill(4, 1, 4, 6, 1, 5, 'oak_planks');
      s.set(5, 2, 4, 'crafting_table');
      s.set(6, 2, 5, 'barrel');
      s.set(3, 1, 5, 'crate');
      // Barracks in each quadrant, doors facing the courtyard.
      for (const [bx, bz] of [[-16, -15], [16, -15], [-16, 15], [16, 15]]) {
        s.fill(bx - 5, 0, bz - 4, bx + 5, 0, bz + 4, 'spruce_planks');
        s.walls(bx - 5, bz - 4, bx + 5, bz + 4, 1, 4, 'spruce_planks');
        if (bz < 0) {
          s.fill(bx - 1, 1, bz + 4, bx + 1, 3, bz + 4, 'air');
          s.fill(bx - 5, 1, bz - 3, bx - 3, 3, bz - 3, 'stone_bricks');
        } else {
          s.fill(bx - 1, 1, bz - 4, bx + 1, 3, bz - 4, 'air');
          s.fill(bx + 3, 1, bz + 3, bx + 5, 3, bz + 3, 'stone_bricks');
        }
        s.fill(bx - 5, 5, bz - 4, bx + 5, 5, bz + 4, 'spruce_planks');
        s.fill(bx - 3, 5, bz - 2, bx + 3, 5, bz + 2, 'air');
        s.set(bx - 4, 6, bz - 3, 'glowstone');
        s.set(bx + 4, 6, bz + 3, 'glowstone');
        s.fill(bx + 3, 1, bz - 3, bx + 3, 2, bz - 3, 'wool_red');
        s.set(bx - 4, 1, bz + 3, 'crate');
        s.set(bx + 4, 1, bz + 2, 'barrel');
        s.torch(bx, 3, bz);
      }
      // Lane braziers and cover that does not block the lanes.
      for (const [x, z] of [[-12, -4], [12, 4], [-4, 12], [4, -12], [-18, -4], [18, 4], [-4, -18], [4, 18]]) {
        s.fill(x, 1, z, x, 2, z, 'stone_bricks');
        s.set(x, 3, z, 'glowstone');
      }
      for (const [x, z, key] of [[-10, -10, 'barrel'], [10, -10, 'crate'], [-10, 10, 'crate'], [10, 10, 'barrel'], [-20, 0, 'hay_bale'], [20, 0, 'hay_bale']] as Array<[number, number, string]>) {
        s.set(x, 1, z, key);
      }
      // Banners along the curtain wall.
      for (const [x, z] of [[-9, -26], [9, -26], [-9, 26], [9, 26], [-26, -9], [-26, 9], [26, -9], [26, 9]]) {
        s.fill(x, 3, z, x, 5, z, 'wool_red');
        s.set(x, 2, z, 'torch');
      }
      // A shallow fire trench around the core dais.
      for (let i = -6; i <= 6; i++) {
        if (Math.abs(i) <= 3) continue;
        s.set(i, 0, -6, 'magma');
        s.set(i, 0, 6, 'magma');
        s.set(-6, 0, i, 'magma');
        s.set(6, 0, i, 'magma');
      }
    },
  },
];

export const PREFAB_BY_KEY = new Map(PREFABS.map((p) => [p.key, p]));

export const PREFAB_TAGS = [...new Set(PREFABS.flatMap((p) => p.tags))].sort();

export function findPrefabs(query = '', tag = 'all'): Prefab[] {
  const q = query.trim().toLowerCase();
  return PREFABS.filter((p) => {
    if (tag !== 'all' && !p.tags.includes(tag)) return false;
    return !q || `${p.name} ${p.key} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(q);
  });
}

export function stampPrefab(world: VoxelWorld, key: string, x: number, y: number, z: number, record = true): Prefab | null {
  const prefab = PREFAB_BY_KEY.get(key);
  if (!prefab) return null;
  const stamp = new PrefabStamp(world, Math.round(x), Math.round(y), Math.round(z), record);
  prefab.build(stamp);
  return prefab;
}

/** Build a prefab in memory without touching a world (used by the editor preview). */
export function describePrefab(key: string): string {
  const p = PREFAB_BY_KEY.get(key);
  if (!p) return 'Unknown prefab';
  return `${p.name} ? ${p.size[0]}?${p.size[1]}?${p.size[2]} ? ${p.description}`;
}
