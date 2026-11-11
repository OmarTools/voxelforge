import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { block, blockById, isSolidId } from '../../world/Blocks';
import {
  DEADLIGHT_BOARDS_PER_BREACH,
  DEADLIGHT_BOSS_ROUND,
  DEADLIGHT_BREACHES,
  DEADLIGHT_PLAYER_SPAWN,
  DEADLIGHT_ROUNDS,
  DEADLIGHT_ZOMBIE_PREFIX,
  deadlightBreachAt,
  deadlightBreachSlot,
  type DeadlightBreachDef,
} from '../../../content/DeadlightLayout';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { formatCoins, giveItem, groundAt } from './SimUtils';

type Phase = 'prep' | 'live' | 'between' | 'won';

interface BreachState {
  def: DeadlightBreachDef;
  boards: number;
  center: THREE.Vector3;
}

interface ZombieState {
  entity: GameEntity;
  breach: number;
  slot: number;
  speed: number;
  contact: number;
  reward: number;
  attackTimer: number;
  dead: boolean;
  boss: boolean;
}

interface Perk {
  id: string;
  name: string;
  detail: string;
  cost: number;
}

const PERKS: Perk[] = [
  { id: 'jugg', name: 'Juggernog', detail: '+10 max health', cost: 100 },
  { id: 'stride', name: 'Stamin-Up', detail: '+8% move speed', cost: 80 },
  { id: 'revive', name: 'Quick Revive', detail: 'Regenerate 0.2 HP per second', cost: 120 },
];

const ZOMBIE_POOL: Array<{ key: string; role: string; weight: number; minRound: number }> = [
  { key: 'human:zombie_walker', role: 'Husk', weight: 10, minRound: 1 },
  { key: 'human:skeleton_warrior', role: 'Bone Picker', weight: 6, minRound: 3 },
  { key: 'human:ghost_wisp', role: 'Shade', weight: 3, minRound: 5 },
  { key: 'human:orc_brute', role: 'Grave Brute', weight: 2, minRound: 6 },
];

const BOSS_KEY = 'creature:stone_golem';
const BOSS_NAME = 'The Gravewarden';
const ARMORY_RIFLE_COST = 120;
const ARMORY_AMMO_COST = 40;
const REPAIR_COST_PER_BOARD = 4;
const PREP_FIRST = 20;
const PREP_BETWEEN = 12;
const ROUND_BREAK = 9;

/**
 * Deadlight: a round-based chapel siege. Four boarded windows are the only way
 * in. The dead tear the boards away, the player repairs them, and between
 * rounds the armory and perk machines sell a little more survival.
 */
export class DeadlightSystem implements SimSystem {
  readonly kind = 'deadlight' as const;

  private game: Game;
  private center: THREE.Vector3;
  private floorY: number;
  private spawn: THREE.Vector3;
  private baseWalk: number;
  private baseSprint: number;
  private baseMaxHealth: number;

  private breaches: BreachState[] = [];
  private zombies: ZombieState[] = [];
  private lights: THREE.PointLight[] = [];
  private playerLight: THREE.PointLight | null = null;
  private phase: Phase = 'prep';
  private round = 1;
  private prepTimer = PREP_FIRST;
  private breakTimer = 0;
  private elapsed = 0;

  private spawnTimer = 0.8;
  private spawnRemaining = 0;
  private spawnTotal = 0;
  private bossPending = false;
  private bossTimer = 0;
  private bossSpawned = false;
  private boss: ZombieState | null = null;

  private kills = 0;
  private roundKills = 0;
  private hurtCd = 0;
  private regen = 0;
  private perks = new Set<string>();
  private won = false;
  private sawEnd = false;
  private uid = 0;
  private slots = 0;
  private lastResult = 'Board the windows. They are coming.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.floorY = game.baseY + 1;
    const cx = spec.center?.x ?? 0;
    const cz = spec.center?.z ?? 0;
    this.center = new THREE.Vector3(cx + 0.5, this.floorY, cz + 0.5);
    this.spawn = new THREE.Vector3(DEADLIGHT_PLAYER_SPAWN.x, this.floorY + 0.02, DEADLIGHT_PLAYER_SPAWN.z);
    this.baseWalk = game.player.walkSpeed;
    this.baseSprint = game.player.sprintSpeed;
    this.baseMaxHealth = game.player.maxHealth;

    this.breaches = DEADLIGHT_BREACHES.map((def) => ({
      def,
      boards: this.countBoards(def),
      center: new THREE.Vector3(def.outside.x, this.floorY, def.outside.z),
    }));

    this.addLamp(this.center.x, this.floorY + 4.6, this.center.z, 0xffb774, 26, 22);
    for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
      this.addLamp(x + 0.5, this.floorY + 4.1, z + 0.5, 0xffb774, 14, 13);
    }
    this.addLamp(-9.5, this.floorY + 1.4, 10.5, 0xff7a2d, 10, 9);
    this.playerLight = this.addLamp(this.spawn.x, this.spawn.y + 1.8, this.spawn.z, 0xffd8a8, 4, 8);

    this.game.hud.showWaveBanner('Deadlight', 'Night One', 'Board the windows', 3.4);
    this.game.toast('The dead are walking. Board the chapel windows and hold until dawn.', 'warn');
  }

  private addLamp(x: number, y: number, z: number, color: number, intensity: number, distance: number): THREE.PointLight {
    const light = new THREE.PointLight(color, intensity, distance, 1.7);
    light.position.set(x, y, z);
    this.game.scene.add(light);
    this.lights.push(light);
    return light;
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    if (this.playerLight) {
      const p = this.game.player.position;
      this.playerLight.position.set(p.x, p.y + 1.8, p.z);
    }
    if (this.game.ended) {
      this.sawEnd = true;
      return;
    }
    if (this.sawEnd) {
      this.sawEnd = false;
      if (!this.won) this.resetRun();
      return;
    }
    if (this.won || !this.game.player.isAlive()) return;

    this.elapsed += dt;
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    if (this.regen > 0) this.game.player.heal(this.regen * dt);

    if (this.phase === 'prep') {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) this.startRound();
      return;
    }
    if (this.phase === 'between') {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.nextRound();
      return;
    }

    this.updateDirector(dt);
    this.updateZombies(dt);
    this.checkDeaths();
    this.checkRoundEnd();
  }

  hud(): SimHud {
    const alive = this.aliveZombies();
    const boards = this.standingBoards();
    const left = this.spawnRemaining + alive;
    const repairable = this.nearestRepairable();
    const actions: SimHud['actions'] = [];

    if (this.won) {
      actions.push({ id: 'rematch', label: 'Hold another night' });
    } else if (this.phase === 'prep') {
      actions.push({ id: 'start', label: `Start round ${this.round} (R)` });
    } else {
      actions.push({
        id: 'repair',
        label: repairable ? `Repair ${repairable.def.label} (R)` : 'Repair nearest breach (R)',
        disabled: !repairable,
      });
    }

    const title = this.won
      ? 'Dawnbreak'
      : this.phase === 'between'
        ? 'Round Cleared'
        : this.bossSpawned && this.boss && this.boss.entity.alive
          ? 'The Gravewarden'
          : this.phase === 'prep'
            ? `Night ${this.round}`
            : `Round ${this.round}`;

    return {
      kicker: 'Deadlight',
      title,
      rows: [
        { label: 'Round', value: `${this.round} / ${DEADLIGHT_ROUNDS}` },
        {
          label: 'Undead',
          value: this.phase === 'prep' ? `${this.roundTotal(this.round)} gathering` : `${Math.max(0, left)} left`,
          tone: alive > 12 ? 'bad' : alive > 7 ? 'warn' : undefined,
        },
        {
          label: 'Barricades',
          value: `${boards} / ${DEADLIGHT_BOARDS_PER_BREACH * this.breaches.length} boards`,
          tone: boards <= 9 ? 'bad' : boards <= 18 ? 'warn' : 'good',
        },
        { label: 'Points', value: formatCoins(this.game.player.coins) },
        { label: 'Perks', value: `${this.perks.size} / ${PERKS.length}` },
      ],
      progress: {
        label: 'Barricades standing',
        value: boards,
        max: DEADLIGHT_BOARDS_PER_BREACH * this.breaches.length,
      },
      actions,
      footer: this.lastResult,
    };
  }

  // ------------------------------------------------------------- interaction

  interactBlock(key: string, x: number, y: number, z: number): boolean {
    if (key === 'deadlight_barricade') {
      const index = deadlightBreachAt(x, y, z, this.game.baseY);
      if (index >= 0) this.repairBreach(index);
      return true;
    }
    if (key === 'deadlight_armory') {
      this.buyArmory();
      return true;
    }
    if (key === 'deadlight_perk') {
      this.buyPerk();
      return true;
    }
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string, x = 0, y = 0, z = 0): string | null {
    if (key === 'deadlight_barricade') {
      const index = deadlightBreachAt(x, y, z, this.game.baseY);
      if (index < 0) return null;
      const breach = this.breaches[index];
      const missing = this.maxBoards() - this.countBoards(breach.def);
      if (missing <= 0) return `<b>${breach.def.label}</b> · sound`;
      return `<b>${breach.def.label}</b> · ${missing} boards missing · repair ${missing * REPAIR_COST_PER_BOARD}c`;
    }
    if (key === 'deadlight_armory') {
      return this.game.player.inventory.count('rifle') > 0
        ? `<b>Armory</b> · 30 rifle rounds · ${ARMORY_AMMO_COST}c`
        : `<b>Armory</b> · Service Rifle + 30 rounds · ${ARMORY_RIFLE_COST}c`;
    }
    if (key === 'deadlight_perk') {
      const perk = this.nextPerk();
      return perk
        ? `<b>Perk Machine</b> · ${perk.name} — ${perk.detail} · ${perk.cost}c`
        : `<b>Perk Machine</b> · Golden apple · 25c`;
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const zombie = this.zombies.find((entry) => entry.entity.id === entity.id && !entry.dead);
    if (!zombie) return null;
    const health = `${Math.ceil(entity.health)} / ${entity.maxHealth} HP`;
    if (zombie.boss) return `<b>${BOSS_NAME}</b> · Chapel Breaker · ${health}`;
    return `<b>${entity.role}</b> · ${health}`;
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    if (key !== 'deadlight_barricade') return false;
    const index = deadlightBreachAt(x, y, z, this.game.baseY);
    if (index >= 0) this.breaches[index].boards = this.countBoards(this.breaches[index].def);
    return true;
  }

  onRespawn(): void {
    if (!this.won) this.resetRun();
  }

  action(id: string): void {
    if (id === 'start') {
      if (this.phase === 'prep') this.startRound();
      return;
    }
    if (id === 'repair') {
      this.repairNearest();
      return;
    }
    if (id === 'rematch') this.resetRun();
  }

  dispose(): void {
    for (const zombie of this.zombies) {
      if (zombie.entity.alive) this.game.entities.remove(zombie.entity);
    }
    this.zombies = [];
    for (const light of this.lights) {
      this.game.scene.remove(light);
      light.dispose();
    }
    this.lights = [];
    this.playerLight = null;
    this.restoreAllBoards();
    const player = this.game.player;
    player.walkSpeed = this.baseWalk;
    player.sprintSpeed = this.baseSprint;
    player.maxHealth = this.baseMaxHealth;
    player.health = Math.min(player.health, player.maxHealth);
  }

  // ------------------------------------------------------------------ rounds

  private startRound(): void {
    this.phase = 'live';
    this.spawnTotal = this.roundTotal(this.round);
    this.spawnRemaining = this.spawnTotal;
    this.spawnTimer = 0.6;
    this.roundKills = 0;
    this.bossPending = this.round >= DEADLIGHT_BOSS_ROUND;
    this.bossTimer = this.bossPending ? 2.4 : 0;
    this.bossSpawned = false;
    this.boss = null;
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Deadlight', `Round ${this.round}`, this.bossPending ? 'The Gravewarden is coming' : 'They are at the windows', 3.4);
    this.game.toast(this.bossPending ? 'The ground shakes. The Gravewarden is coming.' : `Round ${this.round}. Keep the boards up.`, this.bossPending ? 'bad' : 'warn');
    this.lastResult = this.bossPending ? 'Something enormous is walking.' : `Round ${this.round}. The dead are moving.`;
    this.soulFlash(18);
  }

  /** Violet flash under the eaves, well above the camera so it never whites out the view. */
  private soulFlash(count: number): void {
    this.game.particles.burst(
      new THREE.Vector3(this.center.x, this.floorY + 4.3, this.center.z),
      '#8f6bd0',
      count,
      { speed: 2.4, life: 0.85, size: 0.07, glow: true },
    );
  }

  private nextRound(): void {
    this.round += 1;
    this.phase = 'prep';
    this.prepTimer = PREP_BETWEEN;
    this.lastResult = `Round ${this.round} in ${PREP_BETWEEN}s. Board up.`;
    this.game.hud.showWaveBanner('Deadlight', `Round ${this.round}`, 'Board up', 3);
    this.game.audio.play('checkpoint');
  }

  private endRound(): void {
    this.phase = 'between';
    this.breakTimer = ROUND_BREAK;
    const coins = 20 + this.round * 6;
    this.game.player.addCoins(coins);
    this.game.player.addXp(35 + this.round * 10);
    this.game.recordSim('defend', 'round', 1);
    this.game.recordSim('earn', 'coin', coins);
    this.game.audio.play('levelup');
    this.game.hud.showWaveBanner('Deadlight', `Round ${this.round} cleared`, `+${coins} coins · catch your breath`, 3.6);
    this.game.toast(`Round ${this.round} cleared. +${coins} coins.`, 'good');
    this.lastResult = `Round ${this.round} cleared. ${ROUND_BREAK}s to repair and rearm.`;
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 2.8, 0)), '#ffe6a0', 26);
  }

  private win(): void {
    if (this.won) return;
    this.won = true;
    this.phase = 'won';
    for (const zombie of this.zombies) {
      if (zombie.entity.alive) this.game.entities.remove(zombie.entity);
    }
    this.zombies = [];
    this.game.player.addCoins(300);
    this.game.player.addXp(500);
    this.game.recordSim('defend', 'round', 1);
    this.game.recordSim('defend', 'boss', 1);
    this.game.recordSim('defend', 'match', 1);
    this.game.recordSim('earn', 'coin', 300);
    this.game.audio.play('win');
    this.game.hud.showWaveBanner('Deadlight', 'Dawnbreak', 'The Gravewarden falls', 5);
    this.game.toast('Dawn breaks. +300 coins, +500 XP.', 'good');
    this.lastResult = 'Dawn breaks over the chapel.';
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 3.2, 0)), '#ffd27a', 80);
  }

  private resetRun(): void {
    for (const zombie of this.zombies) {
      if (zombie.entity.alive) this.game.entities.remove(zombie.entity);
    }
    this.zombies = [];
    this.restoreAllBoards();
    this.round = 1;
    this.phase = 'prep';
    this.prepTimer = PREP_FIRST;
    this.breakTimer = 0;
    this.elapsed = 0;
    this.spawnTimer = 0.8;
    this.spawnRemaining = 0;
    this.spawnTotal = 0;
    this.bossPending = false;
    this.bossTimer = 0;
    this.bossSpawned = false;
    this.boss = null;
    this.kills = 0;
    this.roundKills = 0;
    this.hurtCd = 0;
    this.won = false;
    this.uid = 0;
    this.slots = 0;

    const player = this.game.player;
    if (!player.isAlive()) player.revive();
    player.health = player.maxHealth;
    player.teleport(this.spawn.clone());
    player.velocity.set(0, 0, 0);
    player.refreshHeldItem();
    this.game.hud.showWaveBanner('Deadlight', 'Night One', 'Board the windows', 3.4);
    this.game.audio.play('wave');
    this.lastResult = 'A new night. The dead are walking.';
    this.soulFlash(24);
  }

  // --------------------------------------------------------------- director

  private updateDirector(dt: number): void {
    if (this.bossPending) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.bossPending = false;
        this.spawnBoss();
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    if (this.spawnRemaining <= 0) return;
    if (this.aliveZombies() >= Math.min(18, 8 + this.round)) {
      this.spawnTimer = 0.6;
      return;
    }
    this.spawnZombie();
    this.spawnRemaining -= 1;
    this.spawnTimer = Math.max(0.38, 1.65 - this.round * 0.13);
  }

  private roundTotal(round: number): number {
    if (round >= DEADLIGHT_BOSS_ROUND) return 14;
    return 4 + round * 3;
  }

  private pickZombie(): { key: string; role: string } {
    const pool = ZOMBIE_POOL.filter((entry) => entry.minRound <= this.round);
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return pool[0];
  }

  private spawnZombie(): void {
    const pick = this.pickZombie();
    this.spawnEntity(pick.key, pick.role, false);
  }

  private spawnBoss(): void {
    const boss = this.spawnEntity(BOSS_KEY, 'Chapel Breaker', true);
    if (!boss) return;
    this.bossSpawned = true;
    this.boss = boss;
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Deadlight', BOSS_NAME, 'The chapel shakes', 4.4);
    this.game.toast(`${BOSS_NAME} is smashing the windows.`, 'bad');
    this.lastResult = `${BOSS_NAME} is here.`;
    this.game.particles.burst(boss.entity.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ff7d5a', 38, {
      speed: 3.6, life: 1, size: 0.13, glow: true,
    });
  }

  private spawnEntity(key: string, role: string, boss: boolean): ZombieState | null {
    const breachIndex = boss ? 0 : this.slots % this.breaches.length;
    const position = this.spawnOutsideBreach(breachIndex, boss ? 8 : 2.4 + Math.random() * 4.2);
    const healthScale = boss ? 5 : 0.65 + this.round * 0.1;
    const entity = this.game.entities.spawn(key, position, {
      exactY: true,
      behavior: 'stationary',
      role,
      healthScale,
      scale: boss ? 1.15 : undefined,
      boss,
      name: boss ? BOSS_NAME : undefined,
      id: `${DEADLIGHT_ZOMBIE_PREFIX}${this.round}_${this.uid++}`,
    });
    if (!entity) return null;
    entity.aggro = false;

    const slot = this.slots++;
    let breach = breachIndex;
    if (this.breaches[breach].boards <= 0 || this.playerOutside()) breach = -1;

    const zombie: ZombieState = {
      entity,
      breach,
      slot,
      speed: (boss ? 1.95 : 1.42 + this.round * 0.09) * (key === 'human:ghost_wisp' ? 1.1 : 1),
      contact: boss ? 10 : 2 + this.round * 0.38,
      reward: boss ? 120 : 5 + this.round * 2,
      attackTimer: 0.5 + Math.random() * 0.6,
      dead: false,
      boss,
    };
    this.zombies.push(zombie);
    this.game.particles.burst(position.clone().add(new THREE.Vector3(0, 0.8, 0)), boss ? '#ff7d5a' : '#7f5aa8', boss ? 26 : 8, {
      speed: boss ? 3 : 2, life: 0.7, size: boss ? 0.12 : 0.07, glow: true,
    });
    return zombie;
  }

  /**
   * Spawn in the dark outside a specific window. Keeping each zombie on its own
   * side of the chapel means the direct-steering AI never has to path around a
   * wall to reach the breach it is supposed to be tearing down.
   */
  private spawnOutsideBreach(index: number, distance: number): THREE.Vector3 {
    const def = this.breaches[index].def;
    const normalX = def.side === 'north' ? 0 : def.side === 'south' ? 0 : def.side === 'west' ? -1 : 1;
    const normalZ = def.side === 'north' ? -1 : def.side === 'south' ? 1 : 0;
    const world = this.game.world;
    for (let attempt = 0; attempt < 14; attempt++) {
      const lateral = (Math.random() * 2 - 1) * 3;
      const out = distance + attempt * 0.6;
      const x = def.outside.x + normalX * out - normalZ * lateral;
      const z = def.outside.z + normalZ * out + normalX * lateral;
      const feet = groundAt(this.game, x, z, this.floorY + 2, this.floorY);
      const floor = world.getBlock(Math.floor(x), feet - 1, Math.floor(z));
      const lower = world.getBlock(Math.floor(x), feet, Math.floor(z));
      const upper = world.getBlock(Math.floor(x), feet + 1, Math.floor(z));
      if (isSolidId(floor) && !isSolidId(lower) && !isSolidId(upper)) {
        return new THREE.Vector3(x, feet, z);
      }
    }
    return new THREE.Vector3(def.outside.x + normalX * (distance + 2), this.floorY, def.outside.z + normalZ * (distance + 2));
  }

  // ------------------------------------------------------------------ horde

  private updateZombies(dt: number): void {
    const player = this.game.player;
    const px = player.position.x;
    const pz = player.position.z;
    const outside = this.playerOutside();

    for (const zombie of this.zombies) {
      if (zombie.dead || !zombie.entity.alive) continue;
      const position = zombie.entity.position;
      const distanceToPlayer = Math.hypot(px - position.x, pz - position.z);
      zombie.attackTimer = Math.max(0, zombie.attackTimer - dt);

      let targetX = px + Math.cos(zombie.slot * 1.7) * 0.55;
      let targetZ = pz + Math.sin(zombie.slot * 1.7) * 0.55;

      if (!outside && zombie.breach >= 0) {
        const breach = this.breaches[zombie.breach];
        if (breach.boards <= 0) {
          zombie.breach = -1;
        } else {
          const slot = deadlightBreachSlot(zombie.breach, zombie.slot);
          targetX = slot.x;
          targetZ = slot.z;
          const distanceToWindow = Math.hypot(position.x - breach.center.x, position.z - breach.center.z);
          if (distanceToWindow < 2.5) {
            zombie.entity.moveOverride = null;
            if (zombie.attackTimer <= 0) {
              zombie.attackTimer = zombie.boss ? 1.35 : 1.55;
              this.damageBreach(zombie.breach, zombie.boss ? 3 : 1);
            }
            if (distanceToPlayer < 1.9) this.hitPlayer(zombie);
            continue;
          }
        }
      }

      zombie.entity.moveOverride = { x: targetX, z: targetZ, speed: zombie.speed };
      if (distanceToPlayer < (zombie.boss ? 2.6 : 1.9)) this.hitPlayer(zombie);
    }
  }

  private hitPlayer(zombie: ZombieState): void {
    const player = this.game.player;
    if (!player.isAlive() || this.hurtCd > 0 || zombie.attackTimer > 0) return;
    this.hurtCd = 0.5;
    zombie.attackTimer = 1.15;
    player.damage(Math.round(zombie.contact * 10) / 10, zombie.boss ? BOSS_NAME : 'the restless dead');
    this.game.audio.play('hurt');
    this.game.hud.flashDamage();
    this.game.particles.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#ff5a6a', 10, {
      speed: 2.2, life: 0.45, size: 0.09, glow: true,
    });
    if (!player.isAlive()) this.lastResult = 'The chapel falls.';
  }

  private checkDeaths(): void {
    for (const zombie of this.zombies) {
      if (zombie.dead || zombie.entity.alive) continue;
      zombie.dead = true;
      zombie.entity.moveOverride = null;
      this.kills += 1;
      this.roundKills += 1;

      const position = zombie.entity.position.clone().add(new THREE.Vector3(0, 0.6, 0));
      this.game.player.addCoins(zombie.reward);
      this.game.recordSim('defend', 'zombie', 1);
      this.game.recordSim('earn', 'coin', zombie.reward);
      this.game.particles.burst(position, zombie.boss ? '#ffd27a' : '#8d6bb8', zombie.boss ? 50 : 9, {
        speed: zombie.boss ? 4 : 2.2, life: 0.7, size: zombie.boss ? 0.14 : 0.08, glow: true,
      });

      if (zombie.boss) {
        this.game.toast(`${BOSS_NAME} collapses. Dawn is close.`, 'good');
        this.win();
        return;
      }

      // A little salvage keeps the bow and rifle in the fight.
      if (Math.random() < 0.16) this.game.entities.spawnDrop('arrow', 2 + Math.floor(Math.random() * 4), position);
      else if (Math.random() < 0.1) this.game.entities.spawnDrop('rifle_ammo', 3 + Math.floor(Math.random() * 5), position);
    }
  }

  private checkRoundEnd(): void {
    if (this.phase !== 'live') return;
    if (this.spawnRemaining > 0 || this.bossPending) return;
    if (this.aliveZombies() > 0) return;
    if (this.round >= DEADLIGHT_BOSS_ROUND) {
      this.win();
      return;
    }
    this.endRound();
  }

  private aliveZombies(): number {
    return this.zombies.reduce((count, zombie) => count + (!zombie.dead && zombie.entity.alive ? 1 : 0), 0);
  }

  private playerOutside(): boolean {
    const player = this.game.player.position;
    return Math.hypot(player.x - this.center.x, player.z - this.center.z) > 6.05;
  }

  // ------------------------------------------------------------- barricades

  private maxBoards(): number {
    return DEADLIGHT_BOARDS_PER_BREACH;
  }

  private countBoards(def: DeadlightBreachDef): number {
    const id = block('deadlight_barricade').id;
    let count = 0;
    for (const board of def.boards) {
      if (this.game.world.getBlock(board.x, this.game.baseY + board.y, board.z) === id) count += 1;
    }
    return count;
  }

  private standingBoards(): number {
    let total = 0;
    for (const breach of this.breaches) total += this.countBoards(breach.def);
    return total;
  }

  private damageBreach(index: number, amount: number): void {
    const breach = this.breaches[index];
    const id = block('deadlight_barricade').id;
    const air = 0;
    let removed = 0;
    for (let i = breach.def.boards.length - 1; i >= 0 && removed < amount; i--) {
      const board = breach.def.boards[i];
      const wy = this.game.baseY + board.y;
      if (this.game.world.getBlock(board.x, wy, board.z) !== id) continue;
      this.game.world.setBlock(board.x, wy, board.z, air);
      this.game.particles.burst(new THREE.Vector3(board.x + 0.5, wy + 0.5, board.z + 0.5), '#a5774c', 8, {
        speed: 2.2, life: 0.55, size: 0.08,
      });
      removed += 1;
    }
    breach.boards = this.countBoards(breach.def);
    if (removed > 0) {
      this.game.audio.play('hit', 2);
      if (breach.boards <= 0) {
        this.game.toast(`${breach.def.label} is open.`, 'bad');
        this.lastResult = `${breach.def.label} has fallen open.`;
        this.game.hud.showWaveBanner('Deadlight', 'Breach', `${breach.def.label} is open`, 2.6);
      } else {
        this.lastResult = `${breach.def.label} is giving way.`;
      }
    }
  }

  private repairNearest(): void {
    const repairable = this.nearestRepairable();
    if (!repairable) {
      this.game.toast('No damaged window within reach.', 'info');
      return;
    }
    this.repairBreach(this.breaches.indexOf(repairable));
  }

  private nearestRepairable(): BreachState | null {
    const player = this.game.player.position;
    let best: BreachState | null = null;
    let bestDistance = 9.5;
    for (const breach of this.breaches) {
      const missing = this.maxBoards() - this.countBoards(breach.def);
      if (missing <= 0) continue;
      const distance = Math.hypot(player.x - breach.center.x, player.z - breach.center.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = breach;
      }
    }
    return best;
  }

  private repairBreach(index: number): void {
    const breach = this.breaches[index];
    if (!breach) return;
    const missing = this.maxBoards() - this.countBoards(breach.def);
    if (missing <= 0) {
      this.game.toast(`${breach.def.label} is already boarded.`, 'info');
      return;
    }
    const cost = missing * REPAIR_COST_PER_BOARD;
    if (this.game.player.coins < cost) {
      this.game.toast(`Need ${formatCoins(cost)} to board ${breach.def.label}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    if (cost > 0) this.game.player.addCoins(-cost);
    const id = block('deadlight_barricade').id;
    for (const board of breach.def.boards) {
      const wy = this.game.baseY + board.y;
      if (this.game.world.getBlock(board.x, wy, board.z) === id) continue;
      this.game.world.setBlock(board.x, wy, board.z, id);
    }
    breach.boards = this.maxBoards();
    this.game.recordSim('defend', 'repair', missing);
    this.game.audio.play('craft');
    this.game.particles.burst(new THREE.Vector3(breach.center.x, this.floorY + 1.5, breach.center.z), '#c9a15a', 16, {
      speed: 2, life: 0.6, size: 0.07,
    });
    this.game.toast(`${breach.def.label} boarded · ${missing} planks · -${formatCoins(cost)}`, 'good');
    this.lastResult = `${breach.def.label} is boarded again.`;
  }

  private restoreAllBoards(): void {
    const id = block('deadlight_barricade').id;
    for (const breach of this.breaches) {
      for (const board of breach.def.boards) this.game.world.setBlock(board.x, this.game.baseY + board.y, board.z, id);
      breach.boards = this.maxBoards();
    }
  }

  // ------------------------------------------------------------------ shops

  private buyArmory(): void {
    const player = this.game.player;
    if (player.inventory.count('rifle') <= 0) {
      if (player.coins < ARMORY_RIFLE_COST) {
        this.game.toast(`The Service Rifle costs ${formatCoins(ARMORY_RIFLE_COST)}.`, 'warn');
        this.game.audio.play('error');
        return;
      }
      player.addCoins(-ARMORY_RIFLE_COST);
      giveItem(this.game, 'rifle', 1, player.position.clone());
      giveItem(this.game, 'rifle_ammo', 30, player.position.clone());
      this.game.recordSim('defend', 'buy', 1);
      this.game.audio.play('craft');
      this.game.toast(`Service Rifle + 30 rounds · -${formatCoins(ARMORY_RIFLE_COST)}`, 'good');
      this.lastResult = 'Service Rifle acquired.';
      return;
    }
    if (player.coins < ARMORY_AMMO_COST) {
      this.game.toast(`A box of rounds costs ${formatCoins(ARMORY_AMMO_COST)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    player.addCoins(-ARMORY_AMMO_COST);
    giveItem(this.game, 'rifle_ammo', 30, player.position.clone());
    this.game.audio.play('craft');
    this.game.toast(`30 rifle rounds · -${formatCoins(ARMORY_AMMO_COST)}`, 'good');
    this.lastResult = 'Ammunition restocked.';
  }

  private nextPerk(): Perk | null {
    return PERKS.find((perk) => !this.perks.has(perk.id)) ?? null;
  }

  private buyPerk(): void {
    const perk = this.nextPerk();
    if (!perk) {
      if (this.game.player.coins < 25) {
        this.game.toast('Need 25c for a golden apple.', 'warn');
        this.game.audio.play('error');
        return;
      }
      this.game.player.addCoins(-25);
      giveItem(this.game, 'golden_apple', 1, this.game.player.position.clone());
      this.game.audio.play('pickup');
      this.game.toast('Golden apple · -25c', 'good');
      return;
    }
    if (this.game.player.coins < perk.cost) {
      this.game.toast(`${perk.name} costs ${formatCoins(perk.cost)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-perk.cost);
    this.perks.add(perk.id);
    if (perk.id === 'jugg') {
      this.game.player.raiseMaxHealth(10);
    } else if (perk.id === 'stride') {
      this.game.player.walkSpeed *= 1.08;
      this.game.player.sprintSpeed *= 1.08;
    } else if (perk.id === 'revive') {
      this.regen += 0.2;
      this.game.player.heal(this.game.player.maxHealth);
    }
    this.game.recordSim('defend', 'perk', 1);
    this.game.audio.play('levelup');
    this.game.toast(`${perk.name} · ${perk.detail} · -${formatCoins(perk.cost)}`, 'good');
    this.lastResult = `${perk.name} acquired.`;
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#8ff4e6', 30);
  }
}
