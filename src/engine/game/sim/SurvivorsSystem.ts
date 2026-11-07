import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { isSolidId } from '../../world/Blocks';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { groundAt } from './SimUtils';

/** Length of a full night, in seconds. */
const RUN_TIME = 480;
/** Nightfang arrives once the clock runs down this far. */
const BOSS_TIME = 420;
const ELITE_TIMES = [120, 240, 360];
const MAX_ENEMIES = 46;

interface EnemySpec {
  key: string;
  name?: string;
  role: string;
  weight: number;
  minTime: number;
  hp: number;
  speed: number;
  contact: number;
  xp: number;
  scale?: number;
  boss?: boolean;
}

const HORDE: EnemySpec[] = [
  { key: 'human:zombie_walker', role: 'Husk', weight: 44, minTime: 0, hp: 1, speed: 1.75, contact: 2.6, xp: 5 },
  { key: 'human:skeleton_warrior', role: 'Bone Picker', weight: 26, minTime: 45, hp: 1.1, speed: 2.35, contact: 3.2, xp: 7 },
  { key: 'human:ghost_wisp', role: 'Shade', weight: 16, minTime: 100, hp: 0.8, speed: 2.8, contact: 3.6, xp: 9 },
  { key: 'human:cultist_void', role: 'Night Cultist', weight: 9, minTime: 170, hp: 1.4, speed: 2.05, contact: 4.4, xp: 12 },
  { key: 'human:orc_brute', role: 'Grave Brute', weight: 5, minTime: 240, hp: 2.4, speed: 2.1, contact: 5.2, xp: 18 },
];

const SHADE: EnemySpec = { key: 'human:ghost_wisp', role: 'Shade', weight: 1, minTime: 0, hp: 1, speed: 2.8, contact: 3.6, xp: 9 };

const ELITE: EnemySpec = {
  key: 'creature:stone_golem', name: 'Grave Warden', role: 'Elite', weight: 1, minTime: 0,
  hp: 3.4, speed: 2.15, contact: 7, xp: 40, scale: 1.15,
};

const BOSS: EnemySpec = {
  key: 'creature:frost_dragon', name: 'Nightfang', role: 'Hollow Wyrm', weight: 1, minTime: 0,
  hp: 6, speed: 2.45, contact: 10, xp: 200, scale: 1.2, boss: true,
};

interface EnemyState {
  entity: GameEntity;
  spec: EnemySpec;
  speed: number;
  contact: number;
  xp: number;
  elite: boolean;
  boss: boolean;
  cooldown: number;
  slot: number;
  dead: boolean;
}

interface Choice {
  id: string;
  name: string;
  detail: string;
  max: number;
  apply: () => void;
}

/**
 * Nightfall Survivors: an eight-minute horde run. The lantern attacks on its
 * own, soul shards feed levels, and every level offers three ways to stay
 * alive until dawn.
 */
export class SurvivorsSystem implements SimSystem {
  readonly kind = 'survivors' as const;

  private game: Game;
  private center: THREE.Vector3;
  private floorY: number;
  private spawn: THREE.Vector3;
  private baseWalk: number;
  private baseSprint: number;
  private baseMaxHealth: number;

  private enemies: EnemyState[] = [];
  private elapsed = 0;
  private level = 1;
  private xp = 0;
  private xpNext = 14;
  private kills = 0;

  private damage = 13;
  private interval = 0.8;
  private bolts = 1;
  private range = 16;
  private crit = 0.05;
  private magnet = 0;
  private shardXp = 2;
  private regen = 0;
  private ward = 0;
  private upgrades: Record<string, number> = {};

  private spawnTimer = 1.1;
  private attackTimer = 0.4;
  private nextElite = 0;
  private bossSpawned = false;
  private boss: EnemyState | null = null;
  private bossPhase = 0;
  private hurtCd = 0;

  private choosing = false;
  private choices: Choice[] = [];
  private pendingLevels = 0;
  private finished = false;
  private won = false;
  private sawEnd = false;
  private uid = 0;
  private lastResult = 'The lantern is lit. Keep moving.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.floorY = game.baseY + 1;
    const cx = spec.center?.x ?? 0;
    const cz = spec.center?.z ?? 0;
    this.center = new THREE.Vector3(cx, this.floorY, cz);
    this.spawn = new THREE.Vector3(cx + 0.5, this.floorY, cz + 20.5);
    this.baseWalk = game.player.walkSpeed;
    this.baseSprint = game.player.sprintSpeed;
    this.baseMaxHealth = game.player.maxHealth;
  }

  update(dt: number): void {
    if (this.game.ended) {
      this.sawEnd = true;
      return;
    }
    if (this.sawEnd) {
      this.sawEnd = false;
      if (!this.won) this.resetRun();
      return;
    }
    if (this.finished || this.choosing) return;
    if (!this.game.player.isAlive()) return;
    if (this.elapsed >= RUN_TIME) {
      this.game.hud.showWaveBanner('Nightfall', 'Dawnless', 'The hollow does not let go', 4);
      this.game.toast('The night swallows the lantern.', 'bad');
      this.lastResult = 'Dawn never comes.';
      this.game.player.damage(9999, 'the endless night');
      return;
    }

    this.elapsed += dt;
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    if (this.regen > 0) this.game.player.heal(this.regen * dt);

    this.updateDirector(dt);
    this.updateEnemies(dt);
    this.updateWeapon(dt);
    this.updatePickups(dt);
    this.checkDeaths();
    this.updateBossPhases();
  }

  hud(): SimHud {
    const alive = this.aliveCount();
    const remaining = Math.max(0, RUN_TIME - this.elapsed);
    const clock = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
    const actions: SimHud['actions'] = [];

    if (this.choosing) {
      this.choices.forEach((choice, index) => {
        actions.push({
          id: `up:${index}`,
          label: `${index + 1} · ${choice.name} — ${choice.detail}`,
          hotkey: `Digit${index + 1}`,
        });
      });
    } else if (this.finished) {
      actions.push({ id: 'rematch', label: 'Run it back' });
    }

    return {
      kicker: 'Nightfall',
      title: this.choosing ? 'Level Up' : this.finished ? 'Dawnbreak' : this.bossSpawned ? 'Nightfang' : 'Run the Dark',
      rows: [
        { label: 'Level', value: `${this.level}`, tone: 'good' },
        { label: 'Souls', value: `${this.xp} / ${this.xpNext}` },
        { label: 'Lantern', value: `${Math.round(this.damage)} dmg · ${(1 / this.interval).toFixed(1)}/s` },
        { label: 'Horde', value: `${alive}`, tone: alive > 30 ? 'bad' : alive > 18 ? 'warn' : undefined },
        { label: this.bossSpawned ? 'Boss' : 'Dawn in', value: this.bossSpawned ? 'now' : clock, tone: this.bossSpawned ? 'warn' : undefined },
      ],
      progress: this.choosing ? undefined : { label: 'Night', value: Math.min(this.elapsed, RUN_TIME), max: RUN_TIME },
      actions,
      footer: this.choosing ? 'Choose an upgrade — press 1, 2 or 3.' : this.lastResult,
    };
  }

  interactBlock(): boolean {
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(): string | null {
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const enemy = this.enemies.find((entry) => entry.entity.id === entity.id && !entry.dead);
    if (!enemy) return null;
    const health = `${Math.ceil(entity.health)} / ${entity.maxHealth}`;
    if (enemy.boss) return `<b>Nightfang</b> · Hollow Wyrm · ${health} HP`;
    if (enemy.elite) return `<b>Grave Warden</b> · elite · ${health} HP`;
    return `<b>${enemy.spec.role}</b> · ${health} HP`;
  }

  onBlockBroken(): boolean {
    return false;
  }

  /** A death ends the night; the next spawn starts a clean run. */
  onRespawn(): void {
    if (!this.finished) this.resetRun();
  }

  action(id: string): void {
    if (id.startsWith('up:')) {
      this.takeChoice(Number(id.slice(3)));
      return;
    }
    if (id === 'rematch') this.resetRun();
  }

  dispose(): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) this.game.entities.remove(enemy.entity);
    }
    this.enemies = [];
    const player = this.game.player;
    player.walkSpeed = this.baseWalk;
    player.sprintSpeed = this.baseSprint;
    player.maxHealth = this.baseMaxHealth;
    player.health = Math.min(player.health, player.maxHealth);
  }

  // ---------------------------------------------------------------- director

  private updateDirector(dt: number): void {
    if (!this.bossSpawned && this.elapsed >= BOSS_TIME) this.spawnBoss();
    if (this.nextElite < ELITE_TIMES.length && this.elapsed >= ELITE_TIMES[this.nextElite]) {
      this.spawnElite();
      this.nextElite += 1;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    if (this.aliveCount() >= MAX_ENEMIES) {
      this.spawnTimer = 0.7;
      return;
    }
    this.spawnTimer = Math.max(0.45, 1.55 - this.elapsed / 430);
    const batch = 1 + Math.floor(this.elapsed / 140);
    for (let i = 0; i < batch && this.aliveCount() < MAX_ENEMIES; i++) {
      this.spawnEnemy(this.pickHorde());
    }
  }

  private pickHorde(): EnemySpec {
    const pool = HORDE.filter((entry) => entry.minTime <= this.elapsed);
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return pool[0] ?? HORDE[0];
  }

  private spawnElite(): void {
    const elite = this.spawnEnemy(ELITE);
    if (!elite) return;
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Nightfall', 'Grave Warden', 'An elite has risen', 3.2);
    this.game.toast('A Grave Warden claws out of the graveyard.', 'warn');
    this.lastResult = 'A Grave Warden is on the field.';
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const boss = this.spawnEnemy(BOSS);
    if (!boss) return;
    this.boss = boss;
    this.bossPhase = 0;
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Nightfall', 'Nightfang', 'The hollow wyrm descends', 4.6);
    this.game.toast('Nightfang has come for the lantern.', 'bad');
    this.lastResult = 'Nightfang circles the hollow.';
  }

  /** Pick a ring position that is not buried inside a tree, wall or gravestone. */
  private spawnPosition(radius: number): THREE.Vector3 {
    const world = this.game.world;
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = radius + (attempt > 7 ? (attempt - 7) * 0.6 : 0);
      const x = this.center.x + Math.cos(angle) * r;
      const z = this.center.z + Math.sin(angle) * r;
      const feet = groundAt(this.game, x, z, this.floorY + 2, this.floorY);
      const floor = world.getBlock(Math.floor(x), feet - 1, Math.floor(z));
      const lower = world.getBlock(Math.floor(x), feet, Math.floor(z));
      const upper = world.getBlock(Math.floor(x), feet + 1, Math.floor(z));
      if (isSolidId(floor) && !isSolidId(lower) && !isSolidId(upper)) {
        return new THREE.Vector3(x, feet, z);
      }
    }
    const angle = Math.random() * Math.PI * 2;
    return new THREE.Vector3(
      this.center.x + Math.cos(angle) * radius,
      this.floorY,
      this.center.z + Math.sin(angle) * radius,
    );
  }

  private spawnEnemy(spec: EnemySpec): EnemyState | null {
    const position = this.spawnPosition(spec.boss ? 18 : 23 + Math.random() * 2.5);
    const x = position.x;
    const z = position.z;
    const ground = position.y;
    const healthScale = spec.boss ? spec.hp : spec.hp * (0.55 + this.elapsed / 480);
    const entity = this.game.entities.spawn(spec.key, new THREE.Vector3(x, ground, z), {
      exactY: true,
      behavior: 'stationary',
      role: spec.role,
      healthScale,
      scale: spec.scale,
      boss: spec.boss,
      name: spec.name,
      id: `survivor_${this.uid++}_${Math.floor(Math.random() * 100000)}`,
    });
    if (!entity) return null;
    entity.aggro = false;
    const enemy: EnemyState = {
      entity,
      spec,
      speed: spec.speed,
      contact: spec.contact,
      xp: spec.xp,
      elite: spec === ELITE,
      boss: !!spec.boss,
      cooldown: Math.random() * 0.7,
      slot: Math.random() * Math.PI * 2,
      dead: false,
    };
    this.enemies.push(enemy);
    this.game.particles.burst(new THREE.Vector3(x, ground + 0.8, z), spec.boss ? '#8fd8ff' : '#9b8ad8', spec.boss ? 40 : 12, {
      speed: spec.boss ? 3.6 : 2.4, life: 0.8, size: spec.boss ? 0.14 : 0.09, glow: true,
    });
    return enemy;
  }

  // ------------------------------------------------------------------ horde

  private updateEnemies(dt: number): void {
    const player = this.game.player;
    const px = player.position.x;
    const pz = player.position.z;

    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.entity.alive) continue;
      const position = enemy.entity.position;
      const dx = px - position.x;
      const dz = pz - position.z;
      const distance = Math.hypot(dx, dz);
      const reach = enemy.boss ? 2.7 : 1.5;

      enemy.entity.moveOverride = {
        x: px + Math.cos(enemy.slot) * 0.9,
        z: pz + Math.sin(enemy.slot) * 0.9,
        speed: enemy.speed,
      };
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);

      if (distance > reach || enemy.cooldown > 0 || this.hurtCd > 0 || !player.isAlive()) continue;
      enemy.cooldown = 1.35;
      this.hurtCd = 0.55;
      const amount = Math.max(1, enemy.contact * (1 + this.elapsed / 520) * (1 - this.ward));
      player.damage(Math.round(amount * 10) / 10, enemy.boss ? 'Nightfang' : 'the night');
      this.game.audio.play('hurt');
      this.game.hud.flashDamage();
      this.game.particles.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#ff5a6a', 10, {
        speed: 2.2, life: 0.45, size: 0.09, glow: true,
      });
      if (!player.isAlive()) {
        this.lastResult = 'The lantern goes out.';
        return;
      }
    }
  }

  private updateWeapon(dt: number): void {
    this.attackTimer -= dt;
    if (this.attackTimer > 0) return;
    const player = this.game.player;
    if (!player.isAlive()) return;

    const inRange = this.enemies
      .filter((enemy) => !enemy.dead && enemy.entity.alive && enemy.entity.position.distanceTo(player.position) <= this.range)
      .sort((a, b) => a.entity.position.distanceToSquared(player.position) - b.entity.position.distanceToSquared(player.position));
    if (inRange.length === 0) {
      this.attackTimer = 0.16;
      return;
    }

    this.attackTimer = this.interval;
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    for (const target of inRange.slice(0, this.bolts)) {
      const hit = target.entity.center.clone();
      const critical = Math.random() < this.crit;
      target.entity.hurt(this.damage * (critical ? 2 : 1), player, 0.12);
      for (let step = 1; step <= 6; step++) {
        const point = origin.clone().lerp(hit, step / 6);
        this.game.particles.trail(point, critical ? '#ffe6a0' : '#c9b6ff', 0.07);
      }
      this.game.particles.sparkle(hit, critical ? '#ffe6a0' : '#b9a7ff', critical ? 10 : 5);
    }
    this.game.particles.burst(origin, '#b9a7ff', 4, {
      speed: 1.4, life: 0.3, size: 0.06, glow: true,
    });
    this.game.audio.play('shot', 2);
  }

  private updatePickups(dt: number): void {
    const player = this.game.player;
    if (this.magnet > 0) {
      this.game.entities.attractDrops(player.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 3 + this.magnet * 2.2, dt);
    }
    const inventory = player.inventory;
    const shards = inventory.count('soul_shard');
    if (shards <= 0) return;
    inventory.remove('soul_shard', shards);
    this.gainXp(shards * this.shardXp);
    this.game.audio.play('pickup');
    this.game.particles.sparkle(player.position.clone().add(new THREE.Vector3(0, 1.1, 0)), '#b9a7ff', 4);
    this.game.player.refreshHeldItem();
  }

  private checkDeaths(): void {
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.entity.alive) continue;
      enemy.dead = true;
      enemy.entity.moveOverride = null;
      this.kills += 1;

      const position = enemy.entity.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      const shards = enemy.boss ? 24 : enemy.elite ? 10 : Math.max(1, Math.round(enemy.xp / 4));
      this.game.entities.spawnDrop('soul_shard', shards, position);
      this.game.particles.burst(position, enemy.boss ? '#e0d4ff' : '#a99bff', enemy.boss ? 44 : enemy.elite ? 26 : 9, {
        speed: enemy.boss ? 4.2 : 2.6, life: 0.8, size: 0.1, glow: true,
      });

      if (enemy.elite) {
        this.game.recordSim('defend', 'elite', 1);
        this.game.toast('The Grave Warden crumbles.', 'good');
        this.lastResult = 'The Grave Warden is down.';
      }
      if (enemy.boss) {
        this.finishRun();
        return;
      }
    }
  }

  private updateBossPhases(): void {
    if (!this.boss || this.boss.dead || !this.boss.entity.alive) return;
    const ratio = this.boss.entity.health / this.boss.entity.maxHealth;
    const phase = ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 1 : 0;
    if (phase <= this.bossPhase) return;
    this.bossPhase = phase;
    for (let i = 0; i < phase + 1; i++) this.spawnEnemy(SHADE);
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Nightfang', `Phase ${phase}`, 'The wyrm calls the dark', 2.6);
    this.game.toast('Nightfang shrieks. Shades answer.', 'warn');
    this.game.particles.burst(this.boss.entity.center.clone(), '#9ad8ff', 26, {
      speed: 3.8, life: 0.9, size: 0.12, glow: true,
    });
    this.lastResult = `Nightfang phase ${phase}.`;
  }

  private aliveCount(): number {
    return this.enemies.reduce((count, enemy) => count + (!enemy.dead && enemy.entity.alive ? 1 : 0), 0);
  }

  // ---------------------------------------------------------------- progress

  private gainXp(amount: number): void {
    if (amount <= 0) return;
    this.xp += amount;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = Math.round(this.xpNext * 1.3 + 6);
      this.pendingLevels += 1;
      this.game.player.heal(2);
      this.game.recordSim('defend', 'level', 1);
    }
    if (this.pendingLevels > 0 && !this.choosing) this.openChoices();
  }

  private openChoices(): void {
    const pool = this.upgradePool().filter((choice) => (this.upgrades[choice.id] ?? 0) < choice.max);
    if (pool.length === 0) {
      this.pendingLevels = 0;
      this.game.player.raiseMaxHealth(2);
      return;
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.choices = pool.slice(0, 3);
    this.choosing = true;
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) enemy.entity.moveOverride = null;
    }
    this.game.audio.play('levelup');
    this.game.hud.showWaveBanner('Nightfall', `Level ${this.level}`, 'Choose an upgrade', 2.4);
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#b9a7ff', 30);
  }

  private takeChoice(index: number): void {
    const choice = this.choices[index];
    if (!choice) return;
    choice.apply();
    this.upgrades[choice.id] = (this.upgrades[choice.id] ?? 0) + 1;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.choosing = false;
    this.choices = [];
    this.game.audio.play('craft');
    this.game.toast(`${choice.name} — ${choice.detail}.`, 'good');
    this.lastResult = `${choice.name} taken.`;
    if (this.pendingLevels > 0) this.openChoices();
  }

  private upgradePool(): Choice[] {
    return [
      { id: 'edge', name: 'Keen Edge', detail: '+4 lantern damage', max: 8, apply: () => { this.damage += 4; } },
      { id: 'haste', name: 'Quickdraw', detail: '12% faster attacks', max: 6, apply: () => { this.interval = Math.max(0.16, this.interval * 0.88); } },
      { id: 'bolt', name: 'Split Bolt', detail: '+1 bolt', max: 3, apply: () => { this.bolts += 1; } },
      { id: 'reach', name: 'Long Sight', detail: '+4 attack range', max: 4, apply: () => { this.range += 4; } },
      {
        id: 'stride', name: 'Night Stride', detail: '+8% move speed', max: 5,
        apply: () => { this.game.player.walkSpeed *= 1.08; this.game.player.sprintSpeed *= 1.08; },
      },
      { id: 'vigor', name: 'Grave Vigor', detail: '+5 max health', max: 5, apply: () => { this.game.player.raiseMaxHealth(5); } },
      { id: 'magnet', name: 'Soul Magnet', detail: 'wider shard pull', max: 4, apply: () => { this.magnet += 1; } },
      { id: 'harvest', name: 'Soul Harvest', detail: '+1 XP per shard', max: 3, apply: () => { this.shardXp += 1; } },
      { id: 'crit', name: "Hunter's Eye", detail: '+8% critical chance', max: 4, apply: () => { this.crit += 0.08; } },
      { id: 'regen', name: 'Second Wind', detail: '+0.35 HP per second', max: 4, apply: () => { this.regen += 0.35; } },
      { id: 'ward', name: 'Bone Ward', detail: '-8% contact damage', max: 4, apply: () => { this.ward = Math.min(0.5, this.ward + 0.08); } },
    ];
  }

  private finishRun(): void {
    this.finished = true;
    this.won = true;
    for (const enemy of this.enemies) enemy.entity.moveOverride = null;
    this.game.player.addCoins(180);
    this.game.player.addXp(320);
    this.game.recordSim('defend', 'boss', 1);
    this.game.recordSim('earn', 'coin', 180);
    this.game.audio.play('win');
    this.game.hud.showWaveBanner('Nightfall', 'Dawnbreak', 'Nightfang is down', 5);
    this.game.toast('Nightfall survived. +180 coins, +320 XP.', 'good');
    this.lastResult = 'Dawn breaks over the hollow.';
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ffe6a0', 70);
  }

  private resetRun(): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) this.game.entities.remove(enemy.entity);
    }
    this.enemies = [];
    this.elapsed = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = 14;
    this.kills = 0;
    this.damage = 13;
    this.interval = 0.8;
    this.bolts = 1;
    this.range = 16;
    this.crit = 0.05;
    this.magnet = 0;
    this.shardXp = 2;
    this.regen = 0;
    this.ward = 0;
    this.upgrades = {};
    this.spawnTimer = 1.1;
    this.attackTimer = 0.4;
    this.nextElite = 0;
    this.bossSpawned = false;
    this.boss = null;
    this.bossPhase = 0;
    this.hurtCd = 0;
    this.choosing = false;
    this.choices = [];
    this.pendingLevels = 0;
    this.finished = false;
    this.won = false;

    const player = this.game.player;
    if (!player.isAlive()) player.revive();
    player.walkSpeed = this.baseWalk;
    player.sprintSpeed = this.baseSprint;
    player.maxHealth = this.baseMaxHealth;
    player.health = player.maxHealth;
    const shards = player.inventory.count('soul_shard');
    if (shards > 0) player.inventory.remove('soul_shard', shards);
    player.refreshHeldItem();
    player.teleport(this.spawn.clone());
    player.velocity.set(0, 0, 0);

    this.lastResult = 'A new night. The lantern is lit.';
    this.game.hud.showWaveBanner('Nightfall', 'Run the Dark', 'New night', 2.8);
    this.game.audio.play('wave');
    this.game.particles.burst(this.spawn.clone(), '#b9a7ff', 26, {
      speed: 3.4, life: 0.9, size: 0.1, glow: true,
    });
  }
}
