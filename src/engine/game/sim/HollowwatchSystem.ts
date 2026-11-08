import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { blockById } from '../../world/Blocks';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { blockCenter, formatCoins, giveItem, groundAt, pick, scanBlocks, type BlockPos } from './SimUtils';

type TowerKind = 'lantern' | 'frost' | 'mortar';

interface TowerInfo {
  block: string;
  name: string;
  cost: number;
  range: number;
  damage: number;
  interval: number;
  splash?: number;
  slow?: number;
}

const TOWERS: Record<TowerKind, TowerInfo> = {
  lantern: {
    block: 'lantern_tower', name: 'Lantern Tower', cost: 30,
    range: 9, damage: 5, interval: 0.8,
  },
  frost: {
    block: 'frost_tower', name: 'Frost Tower', cost: 45,
    range: 7.5, damage: 3, interval: 1.5, slow: 2,
  },
  mortar: {
    block: 'mortar_tower', name: 'Mortar Tower', cost: 65,
    range: 11, damage: 9, interval: 2.4, splash: 2.6,
  },
};

const TOWER_BLOCKS: Record<string, TowerKind> = {
  lantern_tower: 'lantern',
  frost_tower: 'frost',
  mortar_tower: 'mortar',
};

const LANES = [-12, -6, 0, 6, 12];
const GATE_MAX = 200;
const REPAIR_COST = 20;
const REPAIR_AMOUNT = 40;
const FIRST_PREP = 24;
const WAVE_PREP = 16;
const MAX_LEVEL = 3;

interface EnemyGroup {
  key: string;
  count: number;
  name?: string;
  role?: string;
  boss?: boolean;
  healthScale?: number;
  scale?: number;
}

interface WatchWave {
  label: string;
  groups: EnemyGroup[];
  rewardCoins: number;
  rewardItems?: Array<{ item: string; count: number }>;
}

const WAVES: WatchWave[] = [
  {
    label: 'First Rustle',
    groups: [{ key: 'human:zombie_walker', count: 4 }],
    rewardCoins: 24,
    rewardItems: [{ item: 'arrow', count: 8 }],
  },
  {
    label: 'Bone Pickets',
    groups: [{ key: 'human:zombie_walker', count: 4 }, { key: 'human:skeleton_warrior', count: 2 }],
    rewardCoins: 30,
  },
  {
    label: 'Shade Drift',
    groups: [{ key: 'human:zombie_walker', count: 4 }, { key: 'human:ghost_wisp', count: 3 }],
    rewardCoins: 38,
    rewardItems: [{ item: 'arrow', count: 12 }],
  },
  {
    label: 'Hollow Choir',
    groups: [{ key: 'human:skeleton_warrior', count: 3 }, { key: 'human:cultist_void', count: 3 }],
    rewardCoins: 46,
  },
  {
    label: 'Grave Brutes',
    groups: [{ key: 'human:zombie_walker', count: 4 }, { key: 'human:orc_brute', count: 3 }],
    rewardCoins: 54,
    rewardItems: [{ item: 'golden_apple', count: 1 }],
  },
  {
    label: 'Silk and Bone',
    groups: [{ key: 'human:skeleton_warrior', count: 3 }, { key: 'creature:spider', count: 5 }],
    rewardCoins: 62,
    rewardItems: [{ item: 'arrow', count: 16 }],
  },
  {
    label: 'The Waiting Dark',
    groups: [{ key: 'human:zombie_walker', count: 3 }, { key: 'human:ghost_wisp', count: 4 }, { key: 'human:cultist_void', count: 3 }],
    rewardCoins: 72,
  },
  {
    label: 'Bone Warden',
    groups: [
      { key: 'human:skeleton_warrior', count: 4 },
      { key: 'creature:stone_golem', count: 1, name: 'Bone Warden', role: 'Elite', healthScale: 2.4, scale: 1.2 },
    ],
    rewardCoins: 84,
    rewardItems: [{ item: 'golden_apple', count: 1 }],
  },
  {
    label: 'Crushing Tide',
    groups: [{ key: 'human:zombie_walker', count: 5 }, { key: 'human:orc_brute', count: 5 }],
    rewardCoins: 96,
    rewardItems: [{ item: 'arrow', count: 20 }],
  },
  {
    label: 'Void Chorus',
    groups: [{ key: 'human:ghost_wisp', count: 4 }, { key: 'human:cultist_void', count: 5 }],
    rewardCoins: 110,
  },
  {
    label: 'The Last Watch',
    groups: [
      { key: 'human:orc_brute', count: 4 },
      { key: 'human:skeleton_warrior', count: 4 },
      { key: 'creature:stone_golem', count: 2, name: 'Gatebreaker', role: 'Elite', healthScale: 2.2, scale: 1.15 },
    ],
    rewardCoins: 132,
    rewardItems: [{ item: 'golden_apple', count: 2 }],
  },
  {
    label: 'The Hollow King',
    groups: [
      { key: 'human:cultist_void', count: 4 },
      {
        key: 'creature:frost_dragon', count: 1, name: 'The Hollow King', role: 'Hollow King',
        boss: true, healthScale: 5, scale: 1.25,
      },
    ],
    rewardCoins: 200,
  },
];

interface EnemyState {
  entity: GameEntity;
  lane: number;
  speed: number;
  slowTimer: number;
  attackTimer: number;
  reward: number;
  boss: boolean;
  dead: boolean;
}

interface TowerState {
  x: number;
  y: number;
  z: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
}

interface SpawnQueueEntry extends EnemyGroup {
  left: number;
}

/**
 * Hollowwatch: a lane-defense night watch. Hollow things climb the five lanes
 * toward the rune gate while the player builds lantern, frost and mortar towers
 * on the ward pads and fights beside them.
 */
export class HollowwatchSystem implements SimSystem {
  readonly kind = 'hollowwatch' as const;

  private game: Game;
  private baseY: number;
  private spawn: THREE.Vector3;
  private gateBlocks: BlockPos[] = [];
  private pads: BlockPos[] = [];
  private gateCenter: THREE.Vector3;
  private gateMax = GATE_MAX;
  private gateHealth = GATE_MAX;
  private towers: TowerState[] = [];
  private enemies: EnemyState[] = [];
  private queue: SpawnQueueEntry[] = [];
  private maxWaves: number;
  private waveIndex = 0;
  private phase: 'prep' | 'wave' | 'won' | 'lost' = 'prep';
  private prepTimer = FIRST_PREP;
  private spawnTimer = 0;
  private finished = false;
  private lastResult = 'The gate is quiet. Buy a tower and pick a pad.';
  private uid = 0;
  private ambientTimer = 0;

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.baseY = game.baseY;
    this.maxWaves = Math.min(WAVES.length, Math.max(1, spec.waveCount ?? WAVES.length));
    const [sx, sz] = game.template.spawn;
    this.spawn = new THREE.Vector3(sx + 0.5, this.baseY + 1, sz + 0.5);

    const found = scanBlocks(game, ['hollow_gate', 'tower_pad', 'lantern_tower', 'frost_tower', 'mortar_tower'], 64, 22);
    this.gateBlocks = found.get('hollow_gate') ?? [];
    this.pads = found.get('tower_pad') ?? [];
    for (const tower of found.get('lantern_tower') ?? []) this.rebuildTower('lantern', tower);
    for (const tower of found.get('frost_tower') ?? []) this.rebuildTower('frost', tower);
    for (const tower of found.get('mortar_tower') ?? []) this.rebuildTower('mortar', tower);

    let cx = 0;
    let cz = -18;
    let cy = this.baseY + 2;
    if (this.gateBlocks.length > 0) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const blockPos of this.gateBlocks) {
        sx += blockPos.x;
        sy += blockPos.y;
        sz += blockPos.z;
      }
      cx = sx / this.gateBlocks.length + 0.5;
      cy = sy / this.gateBlocks.length + 0.5;
      cz = sz / this.gateBlocks.length + 0.5;
    }
    this.gateCenter = new THREE.Vector3(cx, cy, cz);
  }

  update(dt: number): void {
    this.ambient(dt);
    if (this.phase === 'won' || this.phase === 'lost' || this.finished) return;
    if (!this.game.player.isAlive()) return;

    if (this.phase === 'prep') {
      this.prepTimer -= dt;
      this.updateTowers(dt);
      if (this.prepTimer <= 0) this.startWave();
      return;
    }

    this.spawnTimer -= dt;
    if (this.queue.length > 0 && this.spawnTimer <= 0) this.spawnNext();

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.checkDeaths();

    if (this.queue.length === 0 && this.aliveCount() === 0) this.clearWave();
  }

  hud(): SimHud {
    const waveLabel = this.phase === 'prep'
      ? `Wave ${Math.min(this.waveIndex + 1, this.maxWaves)} in ${Math.max(0, Math.ceil(this.prepTimer))}s`
      : this.phase === 'wave'
        ? `Wave ${this.waveIndex} / ${this.maxWaves}`
        : this.phase === 'won' ? 'Held' : 'Fallen';
    const actions: SimHud['actions'] = [];
    if (this.phase === 'won' || this.phase === 'lost') {
      actions.push({ id: 'rematch', label: 'Sound the horn — new watch' });
    } else {
      actions.push({
        id: 'call',
        label: this.phase === 'prep' ? 'Call the wave now' : 'Wave in progress',
        disabled: this.phase !== 'prep',
      });
      actions.push({
        id: 'repair',
        label: `Repair the gate · ${formatCoins(REPAIR_COST)}`,
        disabled: this.gateHealth >= this.gateMax || this.game.player.coins < REPAIR_COST,
      });
    }
    return {
      kicker: 'Hollowwatch',
      title: this.phase === 'won' ? 'The Watch Holds' : this.phase === 'lost' ? 'The Gate is Lost' : 'Hold the Gate',
      rows: [
        { label: 'Wave', value: waveLabel, tone: this.phase === 'prep' ? 'warn' : undefined },
        {
          label: 'Hollow Gate',
          value: `${Math.ceil(this.gateHealth)} / ${this.gateMax}`,
          tone: this.gateHealth < 60 ? 'bad' : this.gateHealth < 130 ? 'warn' : 'good',
        },
        { label: 'Towers', value: `${this.towers.length} built · Mk ${this.averageTowerLevel()}` },
        { label: 'Hollow', value: `${this.aliveCount() + this.queue.reduce((total, entry) => total + entry.left, 0)} incoming` },
        { label: 'Purse', value: formatCoins(this.game.player.coins) },
      ],
      progress: { label: 'Gate integrity', value: this.gateHealth, max: this.gateMax },
      actions,
      footer: this.phase === 'prep'
        ? 'Buy towers from Warden Maelin, place them on the rune pads, then press R to call the wave. Right-click the gate (or the Repair button) to patch it.'
        : this.lastResult,
    };
  }

  interactBlock(key: string, x: number, y: number, z: number): boolean {
    if (key === 'hollow_gate') {
      this.repairGate();
      return true;
    }
    const kind = TOWER_BLOCKS[key];
    if (kind) {
      const tower = this.towerAt(x, y, z);
      if (tower) this.upgradeTower(tower);
      else this.registerTower(kind, x, y, z, 1, false);
      return true;
    }
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string, x?: number, y?: number, z?: number): string | null {
    if (key === 'hollow_gate') {
      return `<b>Hollow Gate</b> · ${Math.ceil(this.gateHealth)}/${this.gateMax} HP · right-click to repair (${formatCoins(REPAIR_COST)})`;
    }
    if (key === 'tower_pad') {
      const tower = x !== undefined && y !== undefined && z !== undefined ? this.towerAt(x, y + 1, z) : null;
      if (tower) return `<b>${TOWERS[tower.kind].name}</b> · Mk ${tower.level}`;
      return '<b>Tower Pad</b> · right-click with a tower block to build';
    }
    const kind = TOWER_BLOCKS[key];
    if (kind) {
      const tower = x !== undefined && y !== undefined && z !== undefined ? this.towerAt(x, y, z) : null;
      if (!tower) return `<b>${TOWERS[kind].name}</b>`;
      const cost = this.upgradeCost(tower);
      return tower.level >= MAX_LEVEL
        ? `<b>${TOWERS[kind].name}</b> · Mk ${tower.level} · maxed`
        : `<b>${TOWERS[kind].name}</b> · Mk ${tower.level} · right-click to upgrade (${formatCoins(cost)})`;
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const enemy = this.enemies.find((entry) => entry.entity.id === entity.id && !entry.dead);
    if (!enemy) return null;
    const role = enemy.boss ? 'Hollow King' : entity.role;
    return `<b>${entity.displayName}</b> · ${role} · ${Math.ceil(entity.health)}/${entity.maxHealth} HP`;
  }

  onBlockPlaced(key: string, x: number, y: number, z: number): void {
    const kind = TOWER_BLOCKS[key];
    if (!kind) return;
    const below = blockById(this.game.world.getBlock(x, y - 1, z));
    const onPad = below.key === 'tower_pad';
    if (!onPad || this.towerAt(x, y, z)) {
      this.game.world.setBlock(x, y, z, 0, true);
      giveItem(this.game, key, 1);
      this.game.toast('Towers can only be raised on an empty rune pad.', 'warn');
      this.game.audio.play('error');
      return;
    }
    this.registerTower(kind, x, y, z, 1, true);
    this.lastResult = `${TOWERS[kind].name} raised.`;
    this.game.toast(`${TOWERS[kind].name} raised. Right-click it to upgrade.`, 'good');
    this.game.particles.sparkle(blockCenter({ x, y, z }), '#b9a7ff', 18);
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    const kind = TOWER_BLOCKS[key];
    if (!kind) return false;
    const index = this.towers.findIndex((tower) => tower.x === x && tower.y === y && tower.z === z);
    if (index >= 0) this.towers.splice(index, 1);
    giveItem(this.game, key, 1);
    this.game.toast(`${TOWERS[kind].name} packed up.`, 'info');
    return true;
  }

  onRespawn(): void {
    if (this.phase === 'lost' || this.phase === 'won') this.resetWatch();
  }

  action(id: string): void {
    if (id === 'call') {
      if (this.phase === 'prep') this.startWave();
      return;
    }
    if (id === 'repair') {
      this.repairGate();
      return;
    }
    if (id === 'rematch') this.resetWatch();
  }

  dispose(): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) this.game.entities.remove(enemy.entity);
    }
    this.enemies = [];
    this.queue = [];
  }

  // ------------------------------------------------------------------ towers

  private rebuildTower(kind: TowerKind, pos: BlockPos): void {
    this.towers.push({ ...pos, kind, level: 1, cooldown: Math.random() * 0.4 });
  }

  private registerTower(kind: TowerKind, x: number, y: number, z: number, level: number, record: boolean): void {
    this.towers.push({ x, y, z, kind, level, cooldown: Math.random() * 0.3 });
    if (record) {
      this.game.recordSim('defend', 'build', 1);
      this.game.particles.burst(blockCenter({ x, y, z }), '#b9a7ff', 12, {
        speed: 2.2, life: 0.6, size: 0.09, glow: true,
      });
    }
  }

  private towerAt(x: number, y: number, z: number): TowerState | undefined {
    return this.towers.find((tower) => tower.x === x && tower.y === y && tower.z === z);
  }

  private upgradeCost(tower: TowerState): number {
    return 30 + tower.level * 20;
  }

  private upgradeTower(tower: TowerState): void {
    if (tower.level >= MAX_LEVEL) {
      this.game.toast(`${TOWERS[tower.kind].name} is already Mk III.`, 'info');
      return;
    }
    const cost = this.upgradeCost(tower);
    if (this.game.player.coins < cost) {
      this.game.toast(`That upgrade costs ${formatCoins(cost)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-cost);
    tower.level += 1;
    this.game.audio.play('craft');
    this.game.particles.sparkle(blockCenter(tower), '#ffe6a6', 22);
    this.game.toast(`${TOWERS[tower.kind].name} upgraded to Mk ${tower.level}.`, 'good');
    this.lastResult = `${TOWERS[tower.kind].name} Mk ${tower.level}.`;
  }

  private averageTowerLevel(): number {
    if (this.towers.length === 0) return 0;
    return Math.round((this.towers.reduce((sum, tower) => sum + tower.level, 0) / this.towers.length) * 10) / 10;
  }

  private towerRange(tower: TowerState): number {
    return TOWERS[tower.kind].range + (tower.level - 1) * 1.4;
  }

  private towerDamage(tower: TowerState): number {
    const info = TOWERS[tower.kind];
    return info.damage + (tower.level - 1) * (tower.kind === 'mortar' ? 5 : tower.kind === 'lantern' ? 3 : 2);
  }

  private towerInterval(tower: TowerState): number {
    return Math.max(0.35, TOWERS[tower.kind].interval - (tower.level - 1) * 0.16);
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const origin = blockCenter(tower).add(new THREE.Vector3(0, 0.6, 0));
      const target = this.nearestEnemy(origin, this.towerRange(tower));
      if (!target) {
        tower.cooldown = 0.12;
        continue;
      }
      tower.cooldown = this.towerInterval(tower);
      const damage = this.towerDamage(tower);
      const hit = target.entity.center.clone();
      const info = TOWERS[tower.kind];

      if (tower.kind === 'mortar') {
        const splash = (info.splash ?? 2.6) + (tower.level - 1) * 0.25;
        for (const enemy of this.enemies) {
          if (enemy.dead || !enemy.entity.alive) continue;
          if (enemy.entity.position.distanceTo(target.entity.position) <= splash) {
            enemy.entity.hurt(damage, this.game.player, 0.18);
          }
        }
        for (let step = 1; step <= 5; step++) {
          const point = origin.clone().lerp(hit, step / 6);
          point.y += Math.sin((step / 6) * Math.PI) * 2.2;
          this.game.particles.trail(point, '#ffb44f', 0.07);
        }
        this.game.particles.burst(hit, '#ff9d3c', 20, {
          speed: 3.4, life: 0.6, size: 0.12, glow: true,
        });
        this.game.particles.burst(hit, '#4a3b52', 10, {
          speed: 2.4, life: 0.8, size: 0.14,
        });
        this.game.audio.play('hit', 2);
      } else {
        target.entity.hurt(damage, this.game.player, 0.12);
        const beam = tower.kind === 'frost' ? '#8fe6ff' : '#ffd27a';
        for (let step = 1; step <= 5; step++) {
          const point = origin.clone().lerp(hit, step / 6);
          this.game.particles.trail(point, beam, 0.06);
        }
        if (tower.kind === 'frost') {
          enemySlow(target, (info.slow ?? 2) + (tower.level - 1) * 0.25);
          this.game.particles.sparkle(hit, '#b9f2ff', 6);
        } else {
          this.game.particles.sparkle(hit, '#ffe6a6', 5);
        }
        this.game.audio.play('shot', 3);
      }
    }
  }

  private nearestEnemy(origin: THREE.Vector3, range: number): EnemyState | null {
    let best: EnemyState | null = null;
    let bestDistance = range;
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.entity.alive) continue;
      const distance = origin.distanceTo(enemy.entity.center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ waves

  private startWave(): void {
    if (this.phase !== 'prep') return;
    const index = this.waveIndex;
    if (index >= this.maxWaves) {
      this.finishWatch();
      return;
    }
    const wave = WAVES[index];
    this.waveIndex += 1;
    this.phase = 'wave';
    this.spawnTimer = 0;
    this.queue = wave.groups.map((group) => ({ ...group, left: group.count }));
    this.lastResult = `Wave ${this.waveIndex}: ${wave.label}.`;
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Hollowwatch', wave.label, `Wave ${this.waveIndex} of ${this.maxWaves}`, 3.6);
    this.game.toast(`Wave ${this.waveIndex}: ${wave.label}. Hold the gate.`, 'warn');
    for (const gate of this.gateBlocks) {
      this.game.particles.sparkle(blockCenter(gate), '#8f74c4', 2);
    }
  }

  private spawnNext(): void {
    const entry = this.queue[0];
    if (!entry) return;
    const lane = entry.boss ? 0 : pick(LANES);
    this.spawnEnemy(entry, lane);
    entry.left -= 1;
    if (entry.left <= 0) this.queue.shift();
    this.spawnTimer = entry.boss ? 1.2 : 0.62;
  }

  private spawnEnemy(group: EnemyGroup, lane: number): void {
    const healthScale = group.healthScale ?? 1 + Math.max(0, this.waveIndex - 1) * 0.14;
    const x = lane + 0.5;
    const z = 24.5;
    const feet = groundAt(this.game, x, z, this.baseY + 8, this.baseY + 1);
    const entity = this.game.entities.spawn(group.key, new THREE.Vector3(x, feet, z), {
      exactY: true,
      behavior: 'stationary',
      healthScale,
      scale: group.scale,
      boss: group.boss,
      name: group.name,
      role: group.role ?? 'Hollow',
      id: `hollow_enemy_${this.uid++}_${Math.floor(Math.random() * 100000)}`,
    });
    if (!entity) {
      this.spawnTimer = 0.8;
      return;
    }
    entity.aggro = false;
    const enemy: EnemyState = {
      entity,
      lane,
      speed: Math.max(1.5, entity.def.speed * 0.9),
      slowTimer: 0,
      attackTimer: 0.6 + Math.random() * 0.5,
      reward: group.boss ? 40 : 2 + Math.floor(this.waveIndex * 0.7),
      boss: !!group.boss,
      dead: false,
    };
    this.enemies.push(enemy);
    this.game.particles.burst(new THREE.Vector3(x, feet + 0.8, z), group.boss ? '#b9a7ff' : '#7b6a8c', group.boss ? 36 : 10, {
      speed: group.boss ? 3.6 : 2.2, life: 0.8, size: group.boss ? 0.14 : 0.08, glow: true,
    });
    if (group.boss) {
      this.game.audio.play('wave');
      this.game.hud.showWaveBanner('Hollowwatch', group.name ?? 'The Hollow King', 'The gate shakes', 4.4);
      this.game.toast(`${group.name ?? 'A hollow king'} walks the causeway.`, 'bad');
      this.lastResult = `${group.name ?? 'The Hollow King'} is on the causeway.`;
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.entity.alive) continue;
      const position = enemy.entity.position;
      enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
      const speed = enemy.speed * (enemy.slowTimer > 0 ? 0.5 : 1);

      const gate = this.nearestGate(position);
      const gateX = gate ? gate.x + 0.5 : this.gateCenter.x;
      const gateZ = gate ? gate.z + 0.5 : this.gateCenter.z;
      const onApproach = position.z > -14.2;
      const targetX = onApproach ? enemy.lane + 0.5 : gateX;
      const targetZ = onApproach ? -14.2 : gateZ;
      enemy.entity.moveOverride = { x: targetX, z: targetZ, speed };

      const distanceToGate = Math.hypot(position.x - gateX, position.z - gateZ);
      if (distanceToGate > 2.5) continue;
      enemy.attackTimer -= dt;
      if (enemy.attackTimer > 0) continue;
      enemy.attackTimer = enemy.boss ? 1.1 : 1.5;
      const damage = enemy.boss
        ? 10 + this.waveIndex * 0.8
        : 2.5 + this.waveIndex * 0.55;
      this.gateHealth = Math.max(0, this.gateHealth - damage);
      enemy.entity.instance.play('attack', { once: true, overlay: true });
      this.game.audio.play('hit', 2);
      this.game.hud.flashDamage();
      this.game.particles.burst(new THREE.Vector3(gateX, this.gateCenter.y, gateZ), '#8f74c4', 14, {
        speed: 3, life: 0.6, size: 0.11, glow: true,
      });
      this.game.particles.burst(enemy.entity.center.clone(), '#ffd27a', 5, {
        speed: 1.6, life: 0.4, size: 0.08,
      });
      this.lastResult = `${enemy.entity.displayName} is battering the gate.`;
      if (this.gateHealth <= 0) {
        this.gateFell();
        return;
      }
    }
  }

  private nearestGate(position: THREE.Vector3): BlockPos | null {
    let best: BlockPos | null = null;
    let bestDistance = Infinity;
    for (const gate of this.gateBlocks) {
      const distance = Math.hypot(position.x - (gate.x + 0.5), position.z - (gate.z + 0.5));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = gate;
      }
    }
    return best;
  }

  private checkDeaths(): void {
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.entity.alive) continue;
      enemy.dead = true;
      enemy.entity.moveOverride = null;
      this.game.player.addCoins(enemy.reward);
      this.game.recordSim('earn', 'coin', enemy.reward);
      this.game.recordSim('defend', 'kill', 1);
      const position = enemy.entity.position.clone().add(new THREE.Vector3(0, 0.6, 0));
      this.game.particles.burst(position, enemy.boss ? '#e0d4ff' : '#a99bff', enemy.boss ? 44 : 10, {
        speed: enemy.boss ? 4.2 : 2.4, life: 0.8, size: 0.1, glow: true,
      });
      if (enemy.boss) {
        this.game.toast(`${enemy.entity.displayName} falls. +${enemy.reward} coins.`, 'good');
        this.lastResult = 'The Hollow King is down.';
      }
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.dead || enemy.entity.alive);
  }

  private clearWave(): void {
    if (this.phase !== 'wave') return;
    const wave = WAVES[Math.max(0, this.waveIndex - 1)];
    this.phase = 'prep';
    this.prepTimer = this.waveIndex >= this.maxWaves ? 0 : WAVE_PREP;
    this.game.recordSim('defend', 'wave', 1);
    this.game.player.addCoins(wave.rewardCoins);
    this.game.player.addXp(40 + this.waveIndex * 14);
    this.game.recordSim('earn', 'coin', wave.rewardCoins);
    for (const item of wave.rewardItems ?? []) {
      giveItem(this.game, item.item, item.count, this.gateCenter.clone());
    }
    this.lastResult = `Wave ${this.waveIndex} cleared. ${formatCoins(wave.rewardCoins)} found on the causeway.`;
    this.game.audio.play('quest');
    this.game.particles.burst(this.gateCenter.clone(), '#b9a7ff', 30, {
      speed: 4, life: 1, size: 0.12, glow: true,
    });
    this.game.toast(`Wave ${this.waveIndex} cleared. +${formatCoins(wave.rewardCoins)}`, 'good');
    this.game.hud.showWaveBanner('Hollowwatch', `Wave ${this.waveIndex} cleared`, 'Breathe. Rebuild.', 3);
    if (this.waveIndex >= this.maxWaves) this.finishWatch();
    else this.game.audio.play('checkpoint');
  }

  private finishWatch(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'won';
    this.game.player.addCoins(250);
    this.game.player.addXp(420);
    this.game.recordSim('earn', 'coin', 250);
    this.game.recordSim('defend', 'boss', 1);
    this.lastResult = 'All twelve waves broken. The Hollow Gate still burns.';
    this.game.audio.play('win');
    this.game.hud.showWaveBanner('Victory', 'The Watch Holds', 'Every wave broken', 5);
    this.game.toast('Hollowwatch holds. +250 coins, +420 XP.', 'good');
    this.game.particles.sparkle(this.gateCenter.clone(), '#ffe6a0', 70);
  }

  private gateFell(): void {
    if (this.phase === 'lost') return;
    this.phase = 'lost';
    this.lastResult = 'The Hollow Gate is dark. The moor comes through.';
    this.game.audio.play('lose');
    this.game.hud.showWaveBanner('Defeat', 'The gate is lost', 'Hollowwatch falls', 5);
    this.game.particles.burst(this.gateCenter.clone(), '#7b6a8c', 70, {
      speed: 6, life: 1.4, size: 0.16, glow: true,
    });
    this.game.particles.burst(this.gateCenter.clone(), '#241f2e', 40, {
      speed: 4, life: 1.8, size: 0.22,
    });
    this.game.player.damage(9999, 'the Hollow Gate');
  }

  private repairGate(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    if (this.gateHealth >= this.gateMax) {
      this.game.toast('The Hollow Gate is already whole.', 'info');
      return;
    }
    if (this.game.player.coins < REPAIR_COST) {
      this.game.toast(`A gate repair costs ${formatCoins(REPAIR_COST)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-REPAIR_COST);
    this.gateHealth = Math.min(this.gateMax, this.gateHealth + REPAIR_AMOUNT);
    this.lastResult = `Gate patched for ${REPAIR_AMOUNT}. It is holding.`;
    this.game.audio.play('craft');
    this.game.particles.sparkle(this.gateCenter.clone(), '#b9a7ff', 22);
    this.game.toast(`Hollow Gate repaired to ${Math.ceil(this.gateHealth)}.`, 'good');
  }

  private resetWatch(): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) this.game.entities.remove(enemy.entity);
    }
    this.enemies = [];
    this.queue = [];
    this.waveIndex = 0;
    this.phase = 'prep';
    this.prepTimer = FIRST_PREP;
    this.spawnTimer = 0;
    this.gateHealth = this.gateMax;
    this.finished = false;
    this.lastResult = 'A new watch. The gate is whole.';
    this.game.player.revive();
    this.game.player.health = this.game.player.maxHealth;
    this.game.player.teleport(this.spawn.clone());
    this.game.player.velocity.set(0, 0, 0);
    this.game.player.refreshHeldItem();
    this.game.hud.showWaveBanner('Hollowwatch', 'New Watch', 'The moor is stirring', 2.8);
    this.game.toast('A new watch begins. Rebuild and hold.', 'info');
    this.game.audio.play('wave');
    this.game.particles.burst(this.spawn.clone(), '#b9a7ff', 22, {
      speed: 3.2, life: 0.9, size: 0.1, glow: true,
    });
  }

  private aliveCount(): number {
    return this.enemies.reduce((count, enemy) => count + (!enemy.dead && enemy.entity.alive ? 1 : 0), 0);
  }

  private ambient(dt: number): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 0.22;
    if (this.gateBlocks.length > 0) {
      const gate = pick(this.gateBlocks);
      this.game.particles.burst(blockCenter(gate), '#8f74c4', 1, {
        speed: 0.15, life: 1.2, size: 0.05, glow: true, spread: 0.3, upward: 0.3,
      });
    }
    if (this.towers.length > 0 && Math.random() < 0.18) {
      const tower = pick(this.towers);
      const tint = tower.kind === 'frost' ? '#8fe6ff' : tower.kind === 'mortar' ? '#ff9d3c' : '#ffd27a';
      this.game.particles.trail(blockCenter(tower).add(new THREE.Vector3(0, 1.1, 0)), tint, 0.05);
    }
    if (this.pads.length > 0 && Math.random() < 0.3) {
      const open = this.pads.filter((pad) => !this.towerAt(pad.x, pad.y + 1, pad.z));
      if (open.length > 0) {
        const pad = pick(open);
        this.game.particles.burst(blockCenter(pad).add(new THREE.Vector3(0, 0.08, 0)), '#8f74c4', 1, {
          speed: 0.1, life: 1, size: 0.045, glow: true, spread: 0.45, upward: 0.4,
        });
      }
    }
  }
}

function enemySlow(enemy: EnemyState, seconds: number): void {
  enemy.slowTimer = Math.max(enemy.slowTimer, seconds);
}
