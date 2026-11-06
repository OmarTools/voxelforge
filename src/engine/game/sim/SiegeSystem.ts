import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { blockCenter, formatCoins, giveItem, groundAt, pick, scanBlocks, type BlockPos } from './SimUtils';

interface AssaultGroup {
  key: string;
  count: number;
  name?: string;
  boss?: boolean;
  healthScale?: number;
}

interface AssaultWave {
  label: string;
  groups: AssaultGroup[];
  rewardCoins: number;
  rewardItems?: Array<{ item: string; count: number }>;
}

const WAVES: AssaultWave[] = [
  {
    label: 'Scouting Party',
    groups: [{ key: 'human:bandit_road', count: 3 }, { key: 'creature:slime', count: 2 }],
    rewardCoins: 24,
    rewardItems: [{ item: 'crystal_shard', count: 1 }],
  },
  {
    label: 'Bone Volley',
    groups: [{ key: 'human:skeleton_warrior', count: 3 }, { key: 'human:bandit_road', count: 2 }],
    rewardCoins: 34,
    rewardItems: [{ item: 'crystal_shard', count: 2 }],
  },
  {
    label: 'Greenskin Rush',
    groups: [{ key: 'human:orc_brute', count: 3 }, { key: 'creature:spider', count: 3 }],
    rewardCoins: 46,
    rewardItems: [{ item: 'iron_ingot', count: 3 }],
  },
  {
    label: 'Siegebreakers',
    groups: [{ key: 'human:soldier_heavy', count: 2 }, { key: 'human:orc_brute', count: 3 }, { key: 'human:cultist_void', count: 2 }],
    rewardCoins: 62,
    rewardItems: [{ item: 'golden_apple', count: 2 }],
  },
  {
    label: "Warlord's Fist",
    groups: [
      { key: 'human:orc_brute', count: 4 },
      { key: 'human:pirate_captain', count: 2 },
      { key: 'human:orc_brute', count: 1, name: 'Warlord Gorm', boss: true, healthScale: 2.6 },
    ],
    rewardCoins: 120,
    rewardItems: [{ item: 'diamond', count: 2 }, { item: 'dragon_scale', count: 1 }],
  },
];

const REPAIR_COST = 12;
const REPAIR_AMOUNT = 25;

/**
 * Emberhold siege: raiders spawn at the four gates, run the lanes and hammer
 * the Ember Core while the player and the clockwork turrets hold the yard.
 */
export class SiegeSystem implements SimSystem {
  readonly kind = 'siege' as const;

  private game: Game;
  private center: THREE.Vector3;
  private core: BlockPos | null = null;
  private turrets: BlockPos[] = [];
  private coreMax = 100;
  private coreHealth = 100;
  private turretLevel = 1;
  private maxWaves: number;
  private waveIndex = 0;
  private waveTimer = 22;
  private phase: 'prep' | 'assault' | 'won' | 'lost' = 'prep';
  private queue: AssaultGroup[] = [];
  private spawnTimer = 0;
  private raiders: GameEntity[] = [];
  private attackTimers = new Map<string, number>();
  private turretTimer = 1.2;
  private waveElapsed = 0;
  private emberTimer = 0;
  private finished = false;
  private lastResult = 'The gates are quiet. For now.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.maxWaves = Math.min(WAVES.length, Math.max(1, spec.waveCount ?? WAVES.length));
    const found = scanBlocks(game, ['siege_core', 'siege_turret'], 56, 16);
    const cores = found.get('siege_core') ?? [];
    this.core = cores[0] ?? { x: Math.round(spec.center?.x ?? 0), y: game.baseY + 1, z: Math.round(spec.center?.z ?? 0) };
    this.turrets = found.get('siege_turret') ?? [];
    this.center = blockCenter(this.core);
  }

  update(dt: number): void {
    if (this.phase === 'lost' || this.phase === 'won') return;
    this.updateAmbient(dt);

    if (this.phase === 'prep') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
      this.updateTurrets(dt);
      return;
    }

    this.waveElapsed += dt;
    this.spawnTimer -= dt;
    if (this.queue.length > 0 && this.spawnTimer <= 0) {
      this.spawnRaider();
      this.spawnTimer = 0.9;
    }

    this.raiders = this.raiders.filter((raider) => raider.alive);
    for (const raider of this.raiders) this.moveRaider(raider, dt);
    this.updateTurrets(dt);

    // Failsafe: if a lane gets walled off, rage-teleport stragglers near the
    // core so an assault can never stall forever.
    if (this.waveElapsed > 78) {
      for (const raider of this.raiders) {
        const distance = Math.hypot(raider.position.x - this.center.x, raider.position.z - this.center.z);
        if (distance > 7) {
          const angle = Math.random() * Math.PI * 2;
          raider.position.set(this.center.x + Math.cos(angle) * 5, this.center.y, this.center.z + Math.sin(angle) * 5);
          raider.velocity.set(0, 0, 0);
          raider.moveOverride = null;
          this.game.particles.burst(raider.center.clone(), '#ff8a4a', 12, { speed: 2, life: 0.6, size: 0.1, glow: true });
        }
      }
    }

    if (this.queue.length === 0 && this.raiders.length === 0) this.clearWave();
  }

  hud(): SimHud {
    const waveLabel = this.phase === 'prep'
      ? `Wave ${Math.min(this.waveIndex + 1, this.maxWaves)} in ${Math.max(0, Math.ceil(this.waveTimer))}s`
      : this.phase === 'assault'
        ? `Wave ${this.waveIndex} / ${this.maxWaves}`
        : this.phase === 'won' ? 'Held' : 'Fallen';
    return {
      kicker: 'Emberhold',
      title: 'Hold the Line',
      rows: [
        { label: 'Wave', value: waveLabel, tone: this.phase === 'prep' ? 'warn' : undefined },
        { label: 'Ember Core', value: `${Math.ceil(this.coreHealth)} / ${this.coreMax}`, tone: this.coreHealth < 35 ? 'bad' : this.coreHealth < 65 ? 'warn' : 'good' },
        { label: 'Raiders', value: String(this.raiders.length + this.queue.reduce((total, group) => total + group.count, 0)) },
        { label: 'Turrets', value: `Mk ${this.turretLevel} · ${formatCoins(this.game.player.coins)}` },
      ],
      progress: { label: 'Core integrity', value: this.coreHealth, max: this.coreMax },
      actions: [
        {
          id: 'repair',
          label: `Repair core · ${formatCoins(REPAIR_COST)}`,
          disabled: this.phase === 'lost' || this.phase === 'won' || this.coreHealth >= this.coreMax || this.game.player.coins < REPAIR_COST,
        },
        {
          id: 'upgrade',
          label: this.turretLevel >= 3 ? 'Turrets maxed' : `Upgrade turrets · ${formatCoins(this.upgradeCost())}`,
          disabled: this.phase === 'lost' || this.phase === 'won' || this.turretLevel >= 3 || this.game.player.coins < this.upgradeCost(),
        },
      ],
      footer: this.phase === 'prep'
        ? `${this.lastResult} Use the breather to repair, upgrade and take a firing line.`
        : 'Raiders run the four lanes for the core. Kill them before they reach it.',
    };
  }

  interactBlock(key: string): boolean {
    if (key === 'siege_core') {
      this.repairCore();
      return true;
    }
    if (key === 'siege_turret') {
      this.upgradeTurrets();
      return true;
    }
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string): string | null {
    if (key === 'siege_core') {
      return `<b>Ember Core</b> · ${Math.ceil(this.coreHealth)}/${this.coreMax} · right-click to repair (${formatCoins(REPAIR_COST)})`;
    }
    if (key === 'siege_turret') {
      return `<b>Siege Turret</b> · Mk ${this.turretLevel} · right-click to upgrade`;
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const raider = this.raiders.find((entry) => entry.id === entity.id && entry.alive);
    if (!raider) return null;
    return `<b>${raider.displayName}</b> · ${Math.ceil(raider.health)}/${raider.maxHealth} HP`;
  }

  onBlockBroken(): boolean {
    return false;
  }

  action(id: string): void {
    if (id === 'repair') this.repairCore();
    if (id === 'upgrade') this.upgradeTurrets();
  }

  dispose(): void {
    for (const raider of this.raiders) {
      if (raider.alive) this.game.entities.remove(raider);
    }
    this.raiders = [];
    this.queue = [];
  }

  private startWave(): void {
    const index = this.waveIndex;
    if (index >= this.maxWaves) {
      this.finishSiege();
      return;
    }
    const wave = WAVES[index];
    this.waveIndex += 1;
    this.phase = 'assault';
    this.waveElapsed = 0;
    this.spawnTimer = 0;
    this.queue = wave.groups.map((group) => ({ ...group }));
    this.lastResult = `Wave ${this.waveIndex}: ${wave.label}.`;
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Assault', wave.label, `Wave ${this.waveIndex} of ${this.maxWaves}`, 3.6);
    this.game.toast(`Wave ${this.waveIndex}: ${wave.label}. Hold the core.`, 'warn');
  }

  private spawnRaider(): void {
    const group = this.queue[0];
    if (!group) return;
    const lanes = [
      new THREE.Vector3(this.center.x, 0, this.center.z + 22),
      new THREE.Vector3(this.center.x + 22, 0, this.center.z),
      new THREE.Vector3(this.center.x, 0, this.center.z - 22),
      new THREE.Vector3(this.center.x - 22, 0, this.center.z),
    ];
    const lane = pick(lanes);
    const index = this.raiders.length + this.queue.reduce((total, entry) => total + entry.count, 0);
    const ground = groundAt(this.game, lane.x, lane.z, Math.floor(this.center.y) + 10, this.center.y);
    const position = new THREE.Vector3(lane.x, ground, lane.z);
    const entity = this.game.entities.spawn(group.key, position, {
      exactY: true,
      name: group.name ?? `Raider ${String(index + 1).padStart(2, '0')}`,
      role: group.boss ? 'Warlord' : 'Raider',
      behavior: 'hostile',
      healthScale: group.healthScale ?? 1,
      boss: group.boss,
      id: `siege_raider_${this.waveIndex}_${this.raiders.length}_${Math.floor(Math.random() * 100000)}`,
    });
    if (!entity) {
      this.spawnTimer = 1.2;
      return;
    }
    group.count -= 1;
    if (group.count <= 0) this.queue.shift();
    entity.moveOverride = { x: this.center.x, z: this.center.z, speed: Math.max(1.5, entity.def.speed * 0.82) };
    this.raiders.push(entity);
    if (group.boss) {
      this.game.audio.play('wave');
      this.game.hud.showWaveBanner('Warlord', group.name ?? 'Warlord Gorm', 'The gate is down', 4);
      this.game.toast(`${group.name ?? 'A warlord'} enters the yard.`, 'bad');
    }
    this.game.particles.burst(position.clone().add(new THREE.Vector3(0, 0.8, 0)), group.boss ? '#ff6b4a' : '#ffb15a', group.boss ? 34 : 12, {
      speed: 3.2, life: 0.7, size: 0.1, glow: true,
    });
  }

  private moveRaider(raider: GameEntity, dt: number): void {
    if (!raider.alive) return;
    const distance = Math.hypot(raider.position.x - this.center.x, raider.position.z - this.center.z);
    if (distance > 2.9) {
      if (!raider.moveOverride) raider.moveOverride = { x: this.center.x, z: this.center.z, speed: Math.max(1.5, raider.def.speed * 0.82) };
      return;
    }
    raider.moveOverride = null;
    const timer = (this.attackTimers.get(raider.id) ?? 0) - dt;
    if (timer > 0) {
      this.attackTimers.set(raider.id, timer);
      return;
    }
    this.attackTimers.set(raider.id, 1.6);
    const damage = 3 + Math.round(this.waveIndex * 0.6);
    this.coreHealth = Math.max(0, this.coreHealth - damage);
    raider.instance.play('attack', { once: true, overlay: true });
    this.game.audio.play('hit', 2);
    this.game.particles.burst(this.center.clone(), '#ff8a3c', 18, { speed: 3.5, life: 0.6, size: 0.11, glow: true });
    this.game.particles.burst(raider.center.clone(), '#ffd27a', 5, { speed: 1.5, life: 0.4, size: 0.08 });
    this.game.hud.flashDamage();
    this.lastResult = `${raider.displayName} is hammering the core.`;
    if (this.coreHealth <= 0) this.coreFell();
  }

  /** Embers curling off the core, plus the occasional turret lens glint. */
  private updateAmbient(dt: number): void {
    this.emberTimer -= dt;
    if (this.emberTimer > 0) return;
    this.emberTimer = 0.16;
    const ember = this.center.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 2.2,
      0.6 + Math.random() * 2.6,
      (Math.random() - 0.5) * 2.2,
    ));
    this.game.particles.burst(ember, Math.random() < 0.3 ? '#ffd27a' : '#ff7a3c', 1, {
      speed: 0.2, life: 1.4 + Math.random() * 0.8, size: 0.06, gravity: -0.5,
      drag: 0.985, glow: true, spread: 0.3, upward: 0.25,
    });
    if (this.turrets.length > 0 && Math.random() < 0.14) {
      const turret = pick(this.turrets);
      this.game.particles.trail(blockCenter(turret).add(new THREE.Vector3(0, 0.9, 0)), '#8fe6ff', 0.06);
    }
  }

  private updateTurrets(dt: number): void {
    this.turretTimer -= dt;
    if (this.turretTimer > 0) return;
    this.turretTimer = Math.max(0.95, 1.9 - this.turretLevel * 0.15);
    if (this.turrets.length === 0) return;
    const range = 8 + this.turretLevel * 2.2;
    const damage = 2 + this.turretLevel * 1.5;
    for (const turret of this.turrets) {
      const origin = blockCenter(turret);
      let target: GameEntity | null = null;
      let best = range;
      for (const raider of this.raiders) {
        if (!raider.alive) continue;
        const distance = raider.position.distanceTo(origin);
        if (distance < best) {
          best = distance;
          target = raider;
        }
      }
      if (!target) continue;
      target.hurt(damage, this.game.player, 0.15);
      const hit = target.center.clone();
      for (let step = 1; step <= 4; step++) {
        const point = origin.clone().lerp(hit, step / 5);
        this.game.particles.trail(point, '#8fe6ff', 0.085);
      }
      this.game.particles.sparkle(hit, '#a9f0ff', 6);
      this.game.audio.play('hit', 3);
    }
  }

  private clearWave(): void {
    const wave = WAVES[Math.max(0, this.waveIndex - 1)];
    this.phase = 'prep';
    this.waveTimer = 18;
    this.waveElapsed = 0;
    this.game.recordSim('defend', 'wave', 1);
    this.game.player.addCoins(wave.rewardCoins);
    this.game.player.addXp(30 + this.waveIndex * 12);
    for (const item of wave.rewardItems ?? []) {
      giveItem(this.game, item.item, item.count, this.center.clone());
    }
    this.lastResult = `Wave ${this.waveIndex} cleared. ${formatCoins(wave.rewardCoins)} recovered from the yard.`;
    this.game.audio.play('quest');
    this.game.particles.burst(this.center.clone(), '#ffd27a', 30, { speed: 4, life: 1, size: 0.12, glow: true });
    this.game.toast(`Wave ${this.waveIndex} cleared. +${formatCoins(wave.rewardCoins)}`, 'good');
    if (this.waveIndex >= this.maxWaves) this.finishSiege();
  }

  private repairCore(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    if (this.coreHealth >= this.coreMax) {
      this.game.toast('The Ember Core is already at full heat.', 'info');
      return;
    }
    if (this.game.player.coins < REPAIR_COST) {
      this.game.toast(`A core repair costs ${formatCoins(REPAIR_COST)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-REPAIR_COST);
    this.coreHealth = Math.min(this.coreMax, this.coreHealth + REPAIR_AMOUNT);
    this.lastResult = `Core patched for ${REPAIR_AMOUNT}. It is holding.`;
    this.game.audio.play('craft');
    this.game.particles.sparkle(this.center.clone(), '#ffd27a', 24);
    this.game.toast(`Ember Core repaired to ${Math.ceil(this.coreHealth)}.`, 'good');
  }

  private upgradeTurrets(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    if (this.turretLevel >= 3) {
      this.game.toast('The turrets are already at Mk III.', 'info');
      return;
    }
    const cost = this.upgradeCost();
    if (this.game.player.coins < cost) {
      this.game.toast(`A turret upgrade costs ${formatCoins(cost)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-cost);
    this.turretLevel += 1;
    this.lastResult = `Turrets upgraded to Mk ${this.turretLevel}. Faster, longer, meaner.`;
    this.game.audio.play('craft');
    for (const turret of this.turrets) {
      this.game.particles.sparkle(blockCenter(turret).add(new THREE.Vector3(0, 0.4, 0)), '#8fe6ff', 16);
    }
    this.game.toast(`Siege turrets upgraded to Mk ${this.turretLevel}.`, 'good');
  }

  private upgradeCost(): number {
    return 20 + this.turretLevel * 18;
  }

  private coreFell(): void {
    if (this.phase === 'lost') return;
    this.phase = 'lost';
    this.lastResult = 'The Ember Core is dark.';
    this.game.audio.play('lose');
    this.game.hud.showWaveBanner('Defeat', 'The core is lost', 'Emberhold falls', 5);
    this.game.particles.burst(this.center.clone(), '#ff6b3c', 80, { speed: 7, life: 1.4, size: 0.16, glow: true });
    this.game.particles.burst(this.center.clone(), '#4a3b52', 40, { speed: 4, life: 1.8, size: 0.2 });
    this.game.player.damage(999, 'The Ember Core was destroyed');
  }

  private finishSiege(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'won';
    this.game.player.addCoins(180);
    this.game.player.addXp(320);
    this.game.recordSim('earn', 'coin', 180);
    this.lastResult = 'All five assaults broken. Emberhold still burns.';
    this.game.audio.play('quest');
    this.game.particles.sparkle(this.center.clone(), '#ffe6a0', 60);
    this.game.hud.showWaveBanner('Victory', 'Emberhold stands', 'Every assault broken', 5);
    this.game.toast('Emberhold stands. +180 coins, +320 XP.', 'good');
  }
}
