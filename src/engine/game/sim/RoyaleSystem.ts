import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { block } from '../../world/Blocks';
import { ITEM_BY_KEY } from '../../../content/Recipes';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { formatCoins, giveItem, groundAt, nearestBlock, pick, randomInt, scanBlocks, type BlockPos } from './SimUtils';

interface Contestant {
  key: string;
  name: string;
}

const CONTESTANTS: Contestant[] = [
  { key: 'human:bandit_road', name: 'Rook' },
  { key: 'human:ninja_ember', name: 'Kestrel' },
  { key: 'human:skeleton_warrior', name: 'Osric' },
  { key: 'human:pirate_captain', name: 'Sable' },
  { key: 'human:cultist_void', name: 'Morrow' },
  { key: 'human:necromancer', name: 'Ilyra' },
  { key: 'human:orc_brute', name: 'Brakka' },
  { key: 'human:soldier_rifle', name: 'Juno' },
];

const LOOT: Array<{ item: string; min: number; max: number; weight: number }> = [
  { item: 'coin', min: 12, max: 32, weight: 5 },
  { item: 'arrow', min: 6, max: 14, weight: 4 },
  { item: 'rifle_ammo', min: 4, max: 10, weight: 3 },
  { item: 'golden_apple', min: 1, max: 2, weight: 3 },
  { item: 'iron_ingot', min: 1, max: 3, weight: 3 },
  { item: 'bread', min: 2, max: 4, weight: 3 },
  { item: 'crystal_shard', min: 1, max: 2, weight: 2 },
  { item: 'shield', min: 1, max: 1, weight: 1 },
  { item: 'iron_sword', min: 1, max: 1, weight: 1 },
  { item: 'diamond', min: 1, max: 2, weight: 1 },
];

/**
 * Battle-royale match: eight rival contestants, shrinking storm damage, loot
 * caches and called supply drops. The last light standing takes the arena.
 */
export class RoyaleSystem implements SimSystem {
  readonly kind = 'royale' as const;

  private game: Game;
  private center: THREE.Vector3;
  private caches: BlockPos[] = [];
  private looted = new Set<string>();
  private rivals: GameEntity[] = [];
  private defeated = new Set<string>();
  private spawnTimer = 3.5;
  private spawned = 0;
  private totalContestants: number;
  private stormElapsed = 0;
  private stormDuration: number;
  private botDamageTimer = 0;
  private botBrawlTimer = 2;
  private stormFxTimer = 0;
  private stormMoteTimer = 0;
  private cacheFxTimer = 0;
  private stormTick = 1;
  private warnTimer = 0;
  private supplyCooldown = 0;
  private supplyDrops = 0;
  private finished = false;
  private lastResult = 'Eight contestants. One ring. No second place.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.center = new THREE.Vector3((spec.center?.x ?? 0) + 0.5, game.baseY + 1, (spec.center?.z ?? 0) + 0.5);
    this.totalContestants = Math.max(2, spec.contestants ?? CONTESTANTS.length);
    this.stormDuration = Math.max(60, spec.stormTime ?? 170);
    const found = scanBlocks(game, ['supply_cache'], 52, 18);
    this.caches = found.get('supply_cache') ?? [];
  }

  update(dt: number): void {
    if (this.finished) return;
    this.stormElapsed += dt;
    this.spawnTimer -= dt;
    this.botDamageTimer -= dt;
    this.botBrawlTimer -= dt;
    this.stormFxTimer -= dt;
    this.stormMoteTimer -= dt;
    this.cacheFxTimer -= dt;
    this.warnTimer -= dt;
    this.supplyCooldown = Math.max(0, this.supplyCooldown - dt);

    this.spawnNextContestant();
    this.updateStorm(dt);
    this.updateCacheFx();

    for (const rival of this.rivals) {
      if (!rival.alive && !this.defeated.has(rival.id)) {
        this.defeated.add(rival.id);
        this.lastResult = `${rival.displayName} is out. ${Math.max(0, this.remainingRivals())} still breathing.`;
        if (this.remainingRivals() === 0 && this.spawned >= this.totalContestants) {
          this.finishMatch();
        }
      }
    }

    if (this.botBrawlTimer <= 0) {
      this.botBrawlTimer = 2.4;
      this.brawl();
    }
    if (this.spawned >= this.totalContestants && this.remainingRivals() === 0 && !this.finished) {
      this.finishMatch();
    }
  }

  hud(): SimHud {
    const t = Math.min(1, this.stormElapsed / this.stormDuration);
    const radius = this.stormRadius();
    const outside = this.playerOutside();
    const nextSpawn = this.spawned < this.totalContestants
      ? `${Math.max(0, this.spawnTimer).toFixed(0)}s`
      : 'All dropped';
    return {
      kicker: 'Stormfall',
      title: 'Last Light',
      rows: [
        { label: 'Rivals alive', value: `${this.remainingRivals()} / ${this.totalContestants}`, tone: this.remainingRivals() <= 2 ? 'good' : undefined },
        { label: 'Storm ring', value: `${radius.toFixed(0)}m`, tone: outside ? 'bad' : t > 0.66 ? 'warn' : undefined },
        { label: 'Next drop', value: nextSpawn },
        { label: 'Caches', value: `${this.caches.filter((cache) => !this.looted.has(this.cacheKey(cache))).length} left` },
      ],
      progress: { label: outside ? 'In the storm' : 'Ring closing', value: t * 100, max: 100 },
      actions: [
        {
          id: 'supply',
          label: this.supplyCooldown > 0
            ? `Supply drop · ${Math.ceil(this.supplyCooldown)}s`
            : this.supplyDrops >= 3 ? 'No drops left' : 'Call supply drop',
          disabled: this.supplyCooldown > 0 || this.supplyDrops >= 3 || this.finished,
        },
      ],
      footer: outside
        ? 'Get inside the ring. The storm is eating your health.'
        : `${this.lastResult} Right-click supply caches to loot.`,
    };
  }

  interactBlock(key: string, x: number, y: number, z: number): boolean {
    if (key !== 'supply_cache') return false;
    this.openCache({ x, y, z });
    return true;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string): string | null {
    if (key === 'supply_cache') {
      return '<b>Supply Cache</b> · right-click to loot';
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const rival = this.rivals.find((entry) => entry.id === entity.id && entry.alive);
    if (!rival) return null;
    return `<b>${rival.displayName}</b> · rival · ${Math.ceil(rival.health)}/${rival.maxHealth} HP`;
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    if (key !== 'supply_cache') return false;
    this.openCache({ x, y, z });
    return true;
  }

  action(id: string): void {
    if (id !== 'supply') return;
    if (this.finished) return;
    if (this.supplyDrops >= 3) {
      this.game.toast('The drop ship has already made its three passes.', 'warn');
      return;
    }
    if (this.supplyCooldown > 0) return;
    const player = this.game.player;
    const dir = player.flatForward;
    const x = Math.floor(player.position.x + dir.x * 3.5);
    const z = Math.floor(player.position.z + dir.z * 3.5);
    const ground = this.game.world.getNearestGround(x, z, Math.floor(player.position.y) + 8);
    if (ground < 0 || Math.abs(ground - player.position.y) > 6) {
      this.game.toast('No clear ground for a supply drop here.', 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.world.setBlock(x, ground, z, block('supply_cache').id, true);
    const cache = { x, y: ground, z };
    this.caches.push(cache);
    this.supplyDrops += 1;
    this.supplyCooldown = 38;
    this.game.audio.play('open');
    this.game.particles.burst(new THREE.Vector3(x + 0.5, ground + 0.6, z + 0.5), '#8fd8e6', 26, { speed: 4, life: 1.1, size: 0.12, glow: true });
    this.game.toast('Supply drop inbound. It landed at your feet.', 'good');
  }

  dispose(): void {
    for (const rival of this.rivals) {
      if (rival.alive) this.game.entities.remove(rival);
    }
    this.rivals = [];
  }

  private stormRadius(): number {
    const t = Math.min(1, this.stormElapsed / this.stormDuration);
    return 30 - 26 * Math.pow(t, 1.22);
  }

  private updateStorm(dt: number): void {
    const radius = this.stormRadius();
    const outside = this.playerOutside();

    if (outside) {
      if (this.warnTimer <= 0) {
        this.warnTimer = 5;
        this.game.toast('The storm is burning through you. Get inside the ring.', 'bad');
        this.game.audio.play('error');
      }
      this.stormTick -= dt;
      if (this.stormTick <= 0) {
        this.stormTick = 1;
        const damage = 3 + Math.round((1 - radius / 30) * 5);
        this.game.player.damage(damage, 'The Storm');
        this.game.particles.burst(this.game.player.position.clone().add(new THREE.Vector3(0, 0.9, 0)), '#b07cff', 10, {
          speed: 2.2, life: 0.7, size: 0.1, gravity: -1.5, glow: true, spread: 0.7,
        });
      }
    } else {
      this.stormTick = Math.min(this.stormTick, 1);
    }

    // Near the wall the storm needs to read up close, not just at the horizon.
    const playerDistance = Math.hypot(
      this.game.player.position.x - this.center.x,
      this.game.player.position.z - this.center.z,
    );
    if ((outside || playerDistance > radius - 5) && this.stormMoteTimer <= 0) {
      this.stormMoteTimer = 0.13;
      const mote = this.game.player.position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 3.2,
        0.4 + Math.random() * 2.4,
        (Math.random() - 0.5) * 3.2,
      ));
      this.game.particles.burst(mote, outside ? '#c58cff' : '#9a7fd0', 1, {
        speed: 0.4, life: 1.2, size: 0.07, gravity: -0.5, drag: 0.99, glow: true, spread: 0.4,
      });
    }

    if (this.botDamageTimer <= 0) {
      this.botDamageTimer = 1.1;
      for (const rival of this.rivals) {
        if (!rival.alive) continue;
        const distance = Math.hypot(rival.position.x - this.center.x, rival.position.z - this.center.z);
        if (distance <= radius) continue;
        rival.hurt(2 + Math.round((1 - radius / 30) * 3));
        this.rotateRival(rival, radius);
        this.game.particles.burst(rival.center.clone(), '#9d6bff', 4, { speed: 1.4, life: 0.45, size: 0.09, glow: true });
      }
    }

    // Ring of storm sparks: cheap, atmospheric and visible from inside.
    if (this.stormFxTimer <= 0) {
      this.stormFxTimer = 0.22;
      const angle = Math.random() * Math.PI * 2;
      const point = new THREE.Vector3(this.center.x + Math.cos(angle) * radius, this.center.y + 0.4 + Math.random() * 2.2, this.center.z + Math.sin(angle) * radius);
      if (point.distanceTo(this.game.player.position) < 44) {
        this.game.particles.burst(point, Math.random() < 0.45 ? '#c58cff' : '#6d5b9f', 1, {
          speed: 0.5, life: 1.4, size: 0.075, gravity: -0.3, glow: true, spread: 0.8,
        });
      }
    }
  }

  /** Faint teal shimmer so unlooted caches stand out across the arena. */
  private updateCacheFx(): void {
    if (this.cacheFxTimer > 0 || this.caches.length === 0) return;
    this.cacheFxTimer = 0.75;
    const player = this.game.player.position;
    const open = this.caches.filter((cache) => (
      !this.looted.has(this.cacheKey(cache))
      && Math.hypot(cache.x - player.x, cache.z - player.z) < 26
    ));
    if (open.length === 0) return;
    const cache = pick(open);
    this.game.particles.burst(new THREE.Vector3(cache.x + 0.5, cache.y + 1.05, cache.z + 0.5), '#7fe3e0', 2, {
      speed: 0.35, life: 1.1, size: 0.06, gravity: -0.4, drag: 0.98, glow: true, spread: 0.35, upward: 0.2,
    });
  }

  private playerOutside(): boolean {
    const player = this.game.player;
    return Math.hypot(player.position.x - this.center.x, player.position.z - this.center.z) > this.stormRadius();
  }

  private rotateRival(rival: GameEntity, radius: number): void {
    const dx = rival.position.x - this.center.x;
    const dz = rival.position.z - this.center.z;
    const len = Math.hypot(dx, dz) || 1;
    const wanted = Math.max(3, radius * 0.62);
    rival.moveOverride = {
      x: this.center.x + (dx / len) * wanted,
      z: this.center.z + (dz / len) * wanted,
      speed: Math.max(1.6, rival.def.speed * 0.9),
    };
  }

  private spawnNextContestant(): void {
    if (this.spawned >= this.totalContestants || this.spawnTimer > 0) return;
    const contestant = CONTESTANTS[this.spawned % CONTESTANTS.length];
    const isChampion = this.spawned === this.totalContestants - 1;
    const angle = (this.spawned / Math.max(1, this.totalContestants)) * Math.PI * 2 + 0.45;
    const distance = 15 + (this.spawned % 3) * 3.5;
    const x = this.center.x + Math.cos(angle) * distance;
    const z = this.center.z + Math.sin(angle) * distance;
    const ground = groundAt(this.game, x, z, Math.floor(this.center.y) + 12, this.center.y);
    const entity = this.game.entities.spawn(contestant.key, new THREE.Vector3(x, ground, z), {
      exactY: true,
      name: isChampion ? `${contestant.name} · Champion` : contestant.name,
      role: isChampion ? 'Final Rival' : 'Rival',
      behavior: 'hostile',
      healthScale: isChampion ? 1.8 : 1,
      boss: isChampion,
      id: `royale_rival_${this.spawned + 1}`,
    });
    if (!entity) {
      this.spawnTimer = 1.5;
      return;
    }
    this.spawned += 1;
    if (this.spawned < this.totalContestants) this.spawnTimer = 16;
    entity.aggro = true;
    this.rivals.push(entity);
    this.lastResult = isChampion
      ? `${contestant.name} drops in with the champion's mark.`
      : `${contestant.name} drops into the arena.`;
    this.game.audio.play('wave');
    this.game.particles.burst(entity.center.clone(), isChampion ? '#ffd27a' : '#8fd8e6', isChampion ? 40 : 22, {
      speed: 4.5, life: 1.1, size: 0.12, glow: true,
    });
    this.game.toast(isChampion ? `${contestant.name} is the champion. Finish it.` : `${contestant.name} drops in.`, isChampion ? 'bad' : 'info');
    this.game.hud.showWaveBanner('Drop pod', contestant.name, isChampion ? 'Final rival' : 'Contestant inbound', 2.6);
  }

  private brawl(): void {
    const alive = this.rivals.filter((rival) => rival.alive);
    if (alive.length < 2) return;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        if (a.position.distanceTo(b.position) > 7) continue;
        if (Math.random() > 0.34) continue;
        a.hurt(randomInt(2, 5), b);
        this.game.particles.sparkle(a.center.clone(), '#ffb37a', 4);
      }
    }
  }

  private openCache(pos: BlockPos): void {
    const key = this.cacheKey(pos);
    if (this.looted.has(key)) {
      this.game.toast('That cache is already empty.', 'info');
      return;
    }
    if (!nearestBlock(this.game, [pos], 6.5)) {
      this.game.toast('Get closer to the cache.', 'warn');
      return;
    }
    this.looted.add(key);
    this.game.world.setBlock(pos.x, pos.y, pos.z, block('crate').id, true);
    this.game.particles.burst(new THREE.Vector3(pos.x + 0.5, pos.y + 0.6, pos.z + 0.5), '#ffd27a', 26, {
      speed: 4, life: 0.9, size: 0.12, glow: true,
    });
    this.game.audio.play('pickup');
    const lines: string[] = [];
    const coins = randomInt(12, 30);
    this.game.player.addCoins(coins);
    this.game.recordSim('earn', 'coin', coins);
    lines.push(`${formatCoins(coins)}`);
    for (let roll = 0; roll < 2; roll++) {
      let entry = pick(LOOT);
      let guard = 0;
      while (entry.item === 'coin' && guard++ < 4) entry = pick(LOOT);
      const count = randomInt(entry.min, entry.max);
      giveItem(this.game, entry.item, count, new THREE.Vector3(pos.x + 0.5, pos.y + 0.8, pos.z + 0.5));
      lines.push(`${ITEM_BY_KEY.get(entry.item)?.name ?? entry.item} ×${count}`);
    }
    this.game.recordSim('open', 'supply_cache', 1);
    this.game.player.addXp(14);
    this.lastResult = `Cache cracked: ${lines.join(', ')}.`;
    this.game.toast(`Supply cache: ${lines.join(' · ')}`, 'good');
  }

  private finishMatch(): void {
    if (this.finished) return;
    this.finished = true;
    this.game.player.addCoins(120);
    this.game.player.addXp(220);
    this.game.recordSim('earn', 'coin', 120);
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ffe6a0', 48);
    this.game.audio.play('quest');
    this.game.hud.showWaveBanner('Last Light', 'Arena clear', 'Every rival is out', 4.5);
    this.game.toast('Last light standing. +120 coins, +220 XP.', 'good');
    this.lastResult = 'The storm rolls on, but there is nobody left to hear it.';
  }

  private remainingRivals(): number {
    return this.rivals.filter((rival) => rival.alive).length;
  }

  private cacheKey(pos: BlockPos): string {
    return `${pos.x},${pos.y},${pos.z}`;
  }
}
