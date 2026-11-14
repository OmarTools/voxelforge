import { Noise, hash3 } from '../core/Noise';
import { clamp, smoothstep } from '../core/Utils';
import { block } from './Blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, type Chunk } from './Chunk';

export type WorldPresetKey = 'overworld' | 'islands' | 'flat' | 'desert' | 'snow' | 'dark' | 'sky';

export const SEA_LEVEL = 29;

export const WORLD_PRESETS: Array<{ key: WorldPresetKey; name: string; desc: string; icon: string }> = [
  { key: 'overworld', name: 'Overworld', desc: 'Rolling biome-rich terrain with caves, ores, forests and oceans.', icon: '🌍' },
  { key: 'islands', name: 'Island Chain', desc: 'A bright archipelago of small islands surrounded by deep water.', icon: '🏝' },
  { key: 'flat', name: 'Flatland', desc: 'A superflat build canvas. Perfect for arenas and architecture.', icon: '⬜' },
  { key: 'desert', name: 'Dunes', desc: 'Endless sun-baked dunes, cacti and buried sandstone.', icon: '🏜' },
  { key: 'snow', name: 'Frostlands', desc: 'Snowy taiga, frozen peaks and quiet spruce forests.', icon: '❄️' },
  { key: 'dark', name: 'Ashen Void', desc: 'A crimson, cavernous realm lit by magma and strange blooms.', icon: '🌋' },
  { key: 'sky', name: 'Skylands', desc: 'Floating islands suspended in an endless pastel sky.', icon: '☁️' },
];

export interface BiomeDef {
  id: number;
  key: string;
  name: string;
  color: string;
  surface: string;
  filler: string;
  treeChance: number;
  treeType: 'oak' | 'birch' | 'spruce' | 'acacia' | 'cactus' | 'none';
  grassChance: number;
  flowerChance: number;
}

export const BIOMES: BiomeDef[] = [
  { id: 0, key: 'ocean', name: 'Ocean', color: '#2f5b9e', surface: 'sand', filler: 'sand', treeChance: 0, treeType: 'none', grassChance: 0, flowerChance: 0 },
  { id: 1, key: 'beach', name: 'Beach', color: '#d9c991', surface: 'sand', filler: 'sand', treeChance: 0.0008, treeType: 'oak', grassChance: 0, flowerChance: 0 },
  { id: 2, key: 'plains', name: 'Plains', color: '#7eb74e', surface: 'grass_block', filler: 'dirt', treeChance: 0.004, treeType: 'oak', grassChance: 0.17, flowerChance: 0.025 },
  { id: 3, key: 'forest', name: 'Forest', color: '#4e8a39', surface: 'grass_block', filler: 'dirt', treeChance: 0.026, treeType: 'oak', grassChance: 0.2, flowerChance: 0.02 },
  { id: 4, key: 'birch_forest', name: 'Birch Forest', color: '#8fae5a', surface: 'grass_block', filler: 'dirt', treeChance: 0.021, treeType: 'birch', grassChance: 0.18, flowerChance: 0.025 },
  { id: 5, key: 'desert', name: 'Desert', color: '#d8c58b', surface: 'sand', filler: 'sandstone', treeChance: 0.006, treeType: 'cactus', grassChance: 0, flowerChance: 0 },
  { id: 6, key: 'savanna', name: 'Savanna', color: '#a9ab4c', surface: 'grass_block', filler: 'dirt', treeChance: 0.005, treeType: 'acacia', grassChance: 0.2, flowerChance: 0.01 },
  { id: 7, key: 'snowy', name: 'Snowy Plains', color: '#e6eef1', surface: 'snow_block', filler: 'dirt', treeChance: 0.007, treeType: 'spruce', grassChance: 0, flowerChance: 0 },
  { id: 8, key: 'taiga', name: 'Taiga', color: '#507a55', surface: 'grass_block', filler: 'dirt', treeChance: 0.02, treeType: 'spruce', grassChance: 0.06, flowerChance: 0.005 },
  { id: 9, key: 'mountain', name: 'Mountain', color: '#9ba2a1', surface: 'stone', filler: 'stone', treeChance: 0.002, treeType: 'spruce', grassChance: 0.01, flowerChance: 0 },
  { id: 10, key: 'swamp', name: 'Swamp', color: '#5e7650', surface: 'grass_block', filler: 'dirt', treeChance: 0.01, treeType: 'oak', grassChance: 0.12, flowerChance: 0.005 },
  { id: 11, key: 'badlands', name: 'Badlands', color: '#b66a3f', surface: 'terracotta', filler: 'terracotta', treeChance: 0.002, treeType: 'cactus', grassChance: 0, flowerChance: 0 },
  { id: 12, key: 'ashlands', name: 'Ashlands', color: '#6d3030', surface: 'netherrack', filler: 'netherrack', treeChance: 0.002, treeType: 'none', grassChance: 0, flowerChance: 0.006 },
  { id: 13, key: 'sky', name: 'Skylands', color: '#9ccfbb', surface: 'grass_block', filler: 'dirt', treeChance: 0.014, treeType: 'oak', grassChance: 0.16, flowerChance: 0.02 },
];

export const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));

const IDS = {
  bedrock: block('bedrock').id,
  stone: block('stone').id,
  dirt: block('dirt').id,
  grass: block('grass_block').id,
  sand: block('sand').id,
  sandstone: block('sandstone').id,
  gravel: block('gravel').id,
  water: block('water').id,
  lava: block('lava').id,
  snow: block('snow_block').id,
  ice: block('ice').id,
  clay: block('clay').id,
  terracotta: block('terracotta').id,
  netherrack: block('netherrack').id,
  magma: block('magma').id,
  oakLog: block('oak_log').id,
  oakLeaves: block('oak_leaves').id,
  birchLog: block('birch_log').id,
  birchLeaves: block('birch_leaves').id,
  spruceLog: block('spruce_log').id,
  spruceLeaves: block('spruce_leaves').id,
  cactus: block('cactus').id,
  coal: block('coal_ore').id,
  iron: block('iron_ore').id,
  gold: block('gold_ore').id,
  diamond: block('diamond_ore').id,
  redstone: block('redstone_ore').id,
  tallGrass: block('tall_grass').id,
  poppy: block('poppy').id,
  dandelion: block('dandelion').id,
  deadBush: block('dead_bush').id,
  mushroomRed: block('mushroom_red').id,
  mushroomBrown: block('mushroom_brown').id,
  crystalFlower: block('crystal_flower').id,
  crystalBlock: block('crystal_block').id,
  glowstone: block('glowstone').id,
  moss: block('moss_block').id,
  podzol: block('podzol').id,
  mycelium: block('mycelium').id,
  stoneBricks: block('stone_bricks').id,
  mossyBricks: block('mossy_stone_bricks').id,
  cobble: block('cobblestone').id,
  torch: block('torch').id,
  chest: block('chest').id,
  hay: block('hay_bale').id,
  woolRed: block('wool_red').id,
  oakPlanks: block('oak_planks').id,
  sprucePlanks: block('spruce_planks').id,
};

interface ColumnInfo {
  height: number;
  bottom: number;
  biome: BiomeDef;
  ocean: boolean;
  snowy: boolean;
}

export class TerrainGenerator {
  readonly seed: number;
  readonly preset: WorldPresetKey;
  readonly heightNoise: Noise;
  readonly detailNoise: Noise;
  readonly ridgeNoise: Noise;
  readonly caveA: Noise;
  readonly caveB: Noise;
  readonly tempNoise: Noise;
  readonly humidityNoise: Noise;
  readonly islandNoise: Noise;

  constructor(seed: number, preset: WorldPresetKey) {
    this.seed = seed >>> 0;
    this.preset = preset;
    this.heightNoise = new Noise(seed + 11);
    this.detailNoise = new Noise(seed + 23);
    this.ridgeNoise = new Noise(seed + 37);
    this.caveA = new Noise(seed + 53);
    this.caveB = new Noise(seed + 71);
    this.tempNoise = new Noise(seed + 89);
    this.humidityNoise = new Noise(seed + 101);
    this.islandNoise = new Noise(seed + 131);
  }

  private rawHeight(wx: number, wz: number): { height: number; bottom: number; ocean: boolean } {
    if (this.preset === 'flat') {
      return { height: 32, bottom: 0, ocean: false };
    }
    if (this.preset === 'sky') {
      const mask = this.islandNoise.fbm2(wx * 0.006 + 20, wz * 0.006 - 12, 3) * 0.5 + 0.5;
      const fine = this.detailNoise.fbm2(wx * 0.018, wz * 0.018, 3) * 4;
      if (mask < 0.39) return { height: 0, bottom: 0, ocean: false };
      const raw = 44 + (mask - 0.39) * 72 + fine;
      const thickness = 6 + (1 - mask) * 18 + this.detailNoise.noise2(wx * 0.02, wz * 0.02) * 3;
      return { height: Math.round(clamp(raw, 36, 78)), bottom: Math.round(Math.max(18, raw - thickness)), ocean: false };
    }
    if (this.preset === 'islands') {
      const d = Math.hypot(wx, wz);
      const mask = smoothstep(clamp(1 - d / 260, 0, 1));
      const n = this.heightNoise.fbm2(wx * 0.0022 + 10, wz * 0.0022, 4) * 14;
      const fine = this.detailNoise.fbm2(wx * 0.009, wz * 0.009, 3) * 5;
      const height = 27 + mask * (10 + n + fine);
      return { height: Math.round(clamp(height, 10, 70)), bottom: 0, ocean: height < SEA_LEVEL + 1 };
    }
    if (this.preset === 'desert') {
      const dunes = this.heightNoise.fbm2(wx * 0.004, wz * 0.004, 4) * 12;
      const fine = this.detailNoise.fbm2(wx * 0.017, wz * 0.017, 3) * 3;
      const h = 36 + dunes + fine;
      return { height: Math.round(clamp(h, 28, 54)), bottom: 0, ocean: false };
    }
    if (this.preset === 'snow') {
      const base = this.heightNoise.fbm2(wx * 0.002, wz * 0.002, 4) * 16;
      const hills = this.detailNoise.fbm2(wx * 0.01, wz * 0.01, 3) * 6;
      const h = 35 + base + hills;
      return { height: Math.round(clamp(h, 18, 70)), bottom: 0, ocean: h < SEA_LEVEL };
    }
    if (this.preset === 'dark') {
      const base = this.heightNoise.fbm2(wx * 0.003, wz * 0.003, 4) * 13;
      const hills = this.detailNoise.fbm2(wx * 0.012, wz * 0.012, 3) * 5;
      const h = 34 + base + hills;
      return { height: Math.round(clamp(h, 14, 64)), bottom: 0, ocean: false };
    }

    // Overworld
    const continent = this.heightNoise.fbm2(wx * 0.00165 + 4, wz * 0.00165 - 7, 4) * 17;
    const hills = this.detailNoise.fbm2(wx * 0.0072, wz * 0.0072, 4) * 8;
    const ridge = this.ridgeNoise.ridged2(wx * 0.0031, wz * 0.0031, 3);
    const mountain = Math.pow(clamp((ridge - 0.57) / 0.43, 0, 1), 1.7) * 42;
    const fine = this.detailNoise.noise2(wx * 0.031, wz * 0.031) * 1.4;
    const h = 34 + continent + hills + mountain + fine;
    return { height: Math.round(clamp(h, 8, 86)), bottom: 0, ocean: h < SEA_LEVEL + 0.5 };
  }

  private pickBiome(wx: number, wz: number, height: number, ocean: boolean, bottom: number): BiomeDef {
    if (this.preset === 'flat') return BIOMES[2];
    if (this.preset === 'desert') return BIOMES[5];
    if (this.preset === 'snow') return height > 52 ? BIOMES[9] : BIOMES[7];
    if (this.preset === 'dark') return BIOMES[12];
    if (this.preset === 'sky') return BIOMES[13];

    if (bottom > 0) return BIOMES[13];
    if (height < SEA_LEVEL - 1) return BIOMES[0];
    if (height <= SEA_LEVEL + 2) return BIOMES[1];
    if (height > 61) return BIOMES[9];

    const temp = this.tempNoise.fbm2(wx * 0.0023 + 33, wz * 0.0023 - 17, 3);
    const humidity = this.humidityNoise.fbm2(wx * 0.0029 - 12, wz * 0.0029 + 41, 3);

    if (temp < -0.3) {
      if (humidity > 0.06) return BIOMES[8];
      return BIOMES[7];
    }
    if (temp > 0.36) {
      if (humidity < -0.22) return BIOMES[11];
      return BIOMES[5];
    }
    if (humidity > 0.35) return BIOMES[3];
    if (temp > 0.15) return BIOMES[6];
    if (humidity > 0.05) {
      return this.detailNoise.noise2(wx * 0.004, wz * 0.004) > 0.12 ? BIOMES[4] : BIOMES[3];
    }
    return BIOMES[2];
  }

  generate(chunk: Chunk) {
    const infos: ColumnInfo[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const raw = this.rawHeight(wx, wz);
        const biome = this.pickBiome(wx, wz, raw.height, raw.ocean, raw.bottom);
        const info: ColumnInfo = {
          height: raw.height,
          bottom: raw.bottom,
          biome,
          ocean: raw.ocean,
          snowy: biome.id === 7 || biome.id === 9,
        };
        infos[z * CHUNK_SIZE + x] = info;
        chunk.heights[z * CHUNK_SIZE + x] = raw.height;
        chunk.biomes[z * CHUNK_SIZE + x] = biome.id;

        if (raw.height <= 0) continue;
        const fillTop = raw.height;
        const start = raw.bottom;
        for (let y = start; y <= fillTop; y++) {
          let id = IDS.stone;
          if (y === 0 || (y < 3 && hash3(wx, y, wz, this.seed) < 0.45)) id = IDS.bedrock;
          else if (y === fillTop) {
            if (raw.ocean) id = hash3(wx, y, wz, this.seed + 1) < 0.3 ? IDS.gravel : IDS.sand;
            else if (info.biome.id === 5) id = IDS.sand;
            else if (info.biome.id === 11) id = IDS.terracotta;
            else if (info.biome.id === 12) id = IDS.netherrack;
            else if (info.snowy && raw.height > 58) id = IDS.snow;
            else if (info.biome.id === 7) id = IDS.snow;
            else if (info.biome.id === 9) id = raw.height > 66 ? IDS.snow : IDS.stone;
            else if (info.biome.id === 1) id = IDS.sand;
            else id = block(info.biome.surface).id;
          } else if (y > fillTop - 4) {
            if (info.biome.id === 5) id = IDS.sandstone;
            else if (info.biome.id === 11) id = IDS.terracotta;
            else if (info.biome.id === 12) id = IDS.netherrack;
            else if (info.biome.id === 7) id = IDS.dirt;
            else id = block(info.biome.filler).id;
          } else if (info.biome.id === 11) {
            const band = Math.floor((y + 6 + Math.floor(this.detailNoise.noise2(wx * 0.02, wz * 0.02) * 2)) / 4) % 4;
            id = band === 0 ? IDS.terracotta : band === 1 ? IDS.sandstone : IDS.terracotta;
          } else if (info.biome.id === 12) {
            id = hash3(wx, y, wz, this.seed + 9) < 0.06 ? IDS.magma : IDS.netherrack;
          }
          chunk.setBlock(x, y, z, id);
        }

        if (raw.ocean && raw.bottom === 0 && !this.preset.match(/desert|dark|sky/)) {
          for (let y = raw.height + 1; y <= SEA_LEVEL; y++) chunk.setBlock(x, y, z, IDS.water);
          if (raw.height < SEA_LEVEL - 2 && hash3(wx, 2, wz, this.seed) < 0.05) {
            chunk.setBlock(x, raw.height + 1, z, IDS.ice);
          }
        }
      }
    }

    // Caves
    if (this.preset !== 'flat' && this.preset !== 'sky') {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const wx = baseX + x;
          const wz = baseZ + z;
          const info = infos[z * CHUNK_SIZE + x];
          if (info.height <= 4) continue;
          const maxY = Math.min(info.height - 3, info.ocean ? Math.min(SEA_LEVEL - 3, info.height - 6) : info.height - 3);
          for (let y = 3; y <= maxY; y++) {
            const current = chunk.getBlock(x, y, z);
            if (current === IDS.water || current === IDS.bedrock) continue;
            // Short-circuit: the second worm noise only matters inside the narrow
            // first-noise band, and the cheese noise only when the worm missed.
            // Same result as evaluating all three, at roughly 2/3 the noise cost.
            const n1 = this.caveA.noise3(wx * 0.042, y * 0.055, wz * 0.042);
            const worm = Math.abs(n1) < 0.052
              && Math.abs(this.caveB.noise3(wx * 0.028 + 50, y * 0.049, wz * 0.028 - 31)) < 0.085;
            if (worm || this.caveB.noise3(wx * 0.017 + 100, y * 0.031, wz * 0.017 + 24) > 0.64) {
              chunk.setBlock(x, y, z, y < 7 ? IDS.lava : 0);
            }
          }
        }
      }
    }

    // Ore veins
    if (this.preset !== 'flat') {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const wx = baseX + x;
          const wz = baseZ + z;
          const info = infos[z * CHUNK_SIZE + x];
          for (let y = 4; y < info.height - 3; y++) {
            if (chunk.getBlock(x, y, z) !== IDS.stone) continue;
            const r = hash3(wx, y, wz, this.seed + 303);
            let ore = 0;
            if (y < 18 && r < 0.0018) ore = IDS.diamond;
            else if (y < 26 && r < 0.0038) ore = IDS.gold;
            else if (y < 34 && r < 0.006) ore = IDS.redstone;
            else if (y < 52 && r < 0.011) ore = IDS.iron;
            else if (r < 0.02) ore = IDS.coal;
            if (ore) {
              chunk.setBlock(x, y, z, ore);
              if (hash3(wx + 1, y, wz, this.seed + 304) < 0.55) chunk.setBlock(x + 1, y, z, ore);
              if (hash3(wx, y + 1, wz, this.seed + 305) < 0.35) chunk.setBlock(x, y + 1, z, ore);
            }
          }
        }
      }
    }

    // Surface soil variation
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const info = infos[z * CHUNK_SIZE + x];
        if (info.height <= SEA_LEVEL || info.ocean) continue;
        const top = chunk.getBlock(x, info.height, z);
        if (top === IDS.grass) {
          const r = hash3(baseX + x, 17, baseZ + z, this.seed + 44);
          if (r < 0.015) chunk.setBlock(x, info.height, z, IDS.podzol);
          else if (r < 0.025) chunk.setBlock(x, info.height, z, IDS.mycelium);
          else if (r < 0.05) chunk.setBlock(x, info.height, z, IDS.moss);
        }
      }
    }

    // Trees & plants
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const info = infos[z * CHUNK_SIZE + x];
        if (info.height <= 0 || info.ocean) continue;
        const wx = baseX + x;
        const wz = baseZ + z;
        const biome = info.biome;
        const ground = chunk.getBlock(x, info.height, z);
        if (ground === IDS.water || ground === IDS.lava) continue;

        if (x >= 2 && x <= 13 && z >= 2 && z <= 13) {
          const treeRoll = hash3(wx, 7, wz, this.seed + 901);
          if (treeRoll < biome.treeChance && info.height < WORLD_HEIGHT - 14) {
            if (biome.treeType === 'cactus') this.placeCactus(chunk, x, info.height + 1, z);
            else if (biome.treeType !== 'none') this.placeTree(chunk, x, info.height + 1, z, biome.treeType);
          }
        }

        if (info.height < WORLD_HEIGHT - 1) {
          const plantRoll = hash3(wx, 9, wz, this.seed + 902);
          const surface = chunk.getBlock(x, info.height, z);
          if (surface === IDS.grass || surface === IDS.moss || surface === IDS.podzol) {
            if (biome.grassChance > 0 && plantRoll < biome.grassChance) {
              chunk.setBlock(x, info.height + 1, z, IDS.tallGrass);
            } else if (biome.flowerChance > 0 && plantRoll < biome.grassChance + biome.flowerChance) {
              chunk.setBlock(x, info.height + 1, z, hash3(wx, 4, wz, this.seed + 903) > 0.5 ? IDS.poppy : IDS.dandelion);
            }
          } else if (surface === IDS.sand && biome.treeType === 'cactus' && plantRoll < 0.012) {
            chunk.setBlock(x, info.height + 1, z, IDS.deadBush);
          } else if (surface === IDS.netherrack && plantRoll < 0.012) {
            chunk.setBlock(x, info.height + 1, z, hash3(wx, 3, wz, this.seed + 904) > 0.5 ? IDS.crystalFlower : IDS.mushroomBrown);
          }
        }
      }
    }

    // Rare handcrafted landmarks.
    if (this.preset !== 'flat' && this.preset !== 'sky' && hash3(chunk.cx, 5, chunk.cz, this.seed + 1200) < 0.055) {
      const x = 4 + Math.floor(hash3(chunk.cx, 6, chunk.cz, this.seed) * 8);
      const z = 4 + Math.floor(hash3(chunk.cx, 7, chunk.cz, this.seed) * 8);
      const info = infos[z * CHUNK_SIZE + x];
      if (info && info.height > SEA_LEVEL + 1 && info.height < WORLD_HEIGHT - 16) this.placeRuin(chunk, x, info.height + 1, z);
    }

    // Floating sky islands get a few glowing veins under the crust.
    if (this.preset === 'sky') {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const info = infos[z * CHUNK_SIZE + x];
          if (info.height <= 0) continue;
          const r = hash3(baseX + x, info.bottom, baseZ + z, this.seed + 66);
          if (r < 0.02) chunk.setBlock(x, info.bottom + 1, z, IDS.crystalBlock);
          if (r > 0.985) chunk.setBlock(x, info.bottom + 2, z, IDS.glowstone);
        }
      }
    }
  }

  private placeTree(chunk: Chunk, x: number, y: number, z: number, type: 'oak' | 'birch' | 'spruce' | 'acacia') {
    const rand = (n: number) => hash3(x + n, y + n * 3, z - n, this.seed + 555);
    const log = type === 'birch' ? IDS.birchLog : type === 'spruce' ? IDS.spruceLog : IDS.oakLog;
    const leaves = type === 'birch' ? IDS.birchLeaves : type === 'spruce' ? IDS.spruceLeaves : IDS.oakLeaves;
    const H = type === 'birch' ? 5 + Math.floor(rand(1) * 3) : type === 'spruce' ? 6 + Math.floor(rand(2) * 4) : 4 + Math.floor(rand(3) * 3);

    const set = (lx: number, ly: number, lz: number, id: number) => {
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || ly < 0 || ly >= WORLD_HEIGHT) return;
      if (chunk.getBlock(lx, ly, lz) === 0 || id === log) chunk.setBlock(lx, ly, lz, id);
    };

    if (type === 'spruce') {
      for (let i = 0; i < H; i++) set(x, y + i, z, log);
      for (let layer = 0; layer < 5; layer++) {
        const ly = y + H - 6 + layer;
        const radius = layer === 0 ? 1 : layer < 3 ? 2 : 1;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) + Math.abs(dz) <= radius + 1 && !(dx === 0 && dz === 0)) set(x + dx, ly, z + dz, leaves);
          }
        }
      }
      set(x, y + H, z, leaves);
      return;
    }

    if (type === 'acacia') {
      for (let i = 0; i < H; i++) set(x, y + i, z, log);
      let dir = rand(4) > 0.5 ? 1 : -1;
      // The canopy sits 3 blocks out and spans +-3, so it reaches 6 blocks from the
      // trunk. Lean toward the chunk interior so it isn't sliced at the chunk edge.
      if (x < 6) dir = 1;
      else if (x > 9) dir = -1;
      for (let i = 0; i < 3; i++) set(x + dir * i, y + H - 1 + i, z, log);
      const cx = x + dir * 3;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dz) < 5) set(cx + dx, y + H + 1, z + dz, leaves);
        }
      }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) set(cx + dx, y + H + 2, z + dz, leaves);
      return;
    }

    for (let i = 0; i < H; i++) set(x, y + i, z, log);
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy <= -1 ? 2 : dy === 0 ? 2 : 1;
      const ly = y + H + dy;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && rand(10 + dx + dz) < 0.55) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          set(x + dx, ly, z + dz, leaves);
        }
      }
    }
    set(x, y + H + 1, z, leaves);
  }

  private placeCactus(chunk: Chunk, x: number, y: number, z: number) {
    const h = 2 + Math.floor(hash3(x, y, z, this.seed + 88) * 3);
    for (let i = 0; i < h; i++) chunk.setBlock(x, y + i, z, IDS.cactus);
  }

  private placeRuin(chunk: Chunk, x: number, y: number, z: number) {
    const r = (n: number) => hash3(x + n, y, z - n, this.seed + 1301);
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (r(dx * 13 + dz * 7) < 0.7) chunk.setBlock(x + dx, y - 1, z + dz, r(1) > 0.5 ? IDS.stoneBricks : IDS.cobble);
      }
    }
    for (let dx = -3; dx <= 3; dx++) {
      if (r(dx + 20) < 0.62) {
        const h = 1 + Math.floor(r(dx + 30) * 3);
        for (let dy = 0; dy < h; dy++) chunk.setBlock(x + dx, y + dy, z - 3, r(dx + dy) > 0.4 ? IDS.mossyBricks : IDS.stoneBricks);
      }
      if (r(dx + 40) < 0.4) {
        const h = 1 + Math.floor(r(dx + 50) * 2);
        for (let dy = 0; dy < h; dy++) chunk.setBlock(x + dx, y + dy, z + 3, IDS.cobble);
      }
    }
    chunk.setBlock(x, y, z, IDS.torch);
    if (r(77) > 0.5) chunk.setBlock(x + 2, y, z + 1, IDS.chest);
  }
}
