import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { block } from '../../world/Blocks';
import {
  CRUMBLE_BOT_SPAWNS,
  CRUMBLE_DECK_SPAWN,
  CRUMBLE_PLAYER_SPAWN,
  CRUMBLE_TIERS,
  crumbleTileAt,
  crumbleTileKey,
} from '../../../content/CrumbleLayout';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { randomInt } from './SimUtils';

interface CrumbleTile {
  x: number;
  y: number;
  z: number;
  tier: number;
  key: string;
  /** Seconds until the tile gives way; -1 while whole. */
  crack: number;
  gone: boolean;
}

interface Rival {
  entity: GameEntity;
  name: string;
  think: number;
  shove: number;
  stagger: number;
  dead: boolean;
}

const RIVALS: Array<{ key: string; name: string }> = [
  { key: 'human:adventurer', name: 'Pip' },
  { key: 'human:rogue_shadow', name: 'Sable' },
  { key: 'human:snow_hunter', name: 'Bram' },
  { key: 'human:desert_nomad', name: 'Saffi' },
  { key: 'human:bard_wanderer', name: 'Fizz' },
  { key: 'human:elf_archer', name: 'Kestrel' },
  { key: 'human:guard_city', name: 'Orrin' },
];

const COUNTDOWN = 3.2;
const ROUND_TIME = 115;
const COLLAPSE_AFTER = 38;
const FALL_MARGIN = 6;
const SHOVE_COOLDOWN = 2.4;
const SHOVE_RANGE = 3.8;
/** Horizontal distance at which a contestant is out of the ring. The runway
 *  (z 15–18) stays safe so the deck is reachable between rounds, but the
 *  skydeck itself counts as out once the round is live. */
const ARENA_EDGE = 17.4;
const PLAYER_CRACK = 1.35;
const RIVAL_CRACK = 1.6;

/**
 * Crumble: a three-round, best-of-three party mode on three stacked festival
 * rings. Every tile cracks under a contestant and gives way in about a second.
 * Shove rivals over the rim, keep moving, and be the last one on the ring.
 */
export class CrumbleSystem implements SimSystem {
  readonly kind = 'crumble' as const;

  private game: Game;
  private baseY: number;
  private center: THREE.Vector3;
  private originX: number;
  private originZ: number;
  private tiles: CrumbleTile[] = [];
  private tileMap = new Map<string, CrumbleTile>();
  private openTiles: CrumbleTile[] = [];
  private playerSpawn = new THREE.Vector3();
  private deckSpawn = new THREE.Vector3();
  private rivals: Rival[] = [];
  private maxRivals = 5;
  private roundTarget: number;

  private phase: 'countdown' | 'live' | 'roundEnd' | 'matchEnd' = 'countdown';
  private round = 1;
  private playerWins = 0;
  private rivalWins = 0;
  private roundWonByPlayer = false;
  private matchWon = false;
  private countdown = COUNTDOWN;
  private roundEndTimer = 0;
  private matchEndTimer = 0;
  private elapsed = 0;
  private collapseClock = 0;
  private collapseWarned = false;
  private pressureTimer = 0;
  private shoveCooldown = 0;
  private bargeToast = 0;
  private ambientTimer = 0;
  private lastResult = 'Three rings. Six contestants. One crown.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.baseY = game.baseY;
    this.originX = Math.round(spec.center?.x ?? game.template.spawn[0] ?? 0);
    this.originZ = Math.round(spec.center?.z ?? game.template.spawn[1] ?? 0);
    this.center = new THREE.Vector3(this.originX + 0.5, this.baseY, this.originZ + 0.5);
    this.roundTarget = Math.max(1, Math.ceil(Math.max(1, spec.rounds ?? 3) / 2));
    this.maxRivals = Math.max(2, spec.bots ?? 5);

    this.buildTiles();
    this.computeSpawns();
    this.startMatch();
  }

  // ------------------------------------------------------------------ lifecycle

  private buildTiles(): void {
    for (let tier = 0; tier < CRUMBLE_TIERS.length; tier++) {
      const def = CRUMBLE_TIERS[tier];
      const y = this.baseY + def.level;
      for (let dz = -def.tileRadius; dz <= def.tileRadius; dz++) {
        for (let dx = -def.tileRadius; dx <= def.tileRadius; dx++) {
          if (!crumbleTileAt(dx, dz, def)) continue;
          const tile: CrumbleTile = {
            x: this.originX + dx,
            y,
            z: this.originZ + dz,
            tier,
            key: crumbleTileKey(dx, dz),
            crack: -1,
            gone: false,
          };
          this.tiles.push(tile);
          this.tileMap.set(this.tileKey(tile.x, tile.y, tile.z), tile);
        }
      }
    }
    this.openTiles = [...this.tiles];
  }

  private computeSpawns(): void {
    this.playerSpawn.set(
      this.originX + CRUMBLE_PLAYER_SPAWN.x + 0.5,
      this.baseY + (CRUMBLE_TIERS[CRUMBLE_PLAYER_SPAWN.tier]?.level ?? 10) + 1.02,
      this.originZ + CRUMBLE_PLAYER_SPAWN.z + 0.5,
    );
    const deckX = this.originX + CRUMBLE_DECK_SPAWN.x + 0.5;
    const deckZ = this.originZ + CRUMBLE_DECK_SPAWN.z + 0.5;
    const ground = this.game.world.getNearestGround(deckX, deckZ, this.baseY + 6);
    this.deckSpawn.set(deckX, ground >= 0 ? ground + 0.02 : this.baseY + 1.02, deckZ);
  }

  private startMatch(): void {
    this.round = 1;
    this.playerWins = 0;
    this.rivalWins = 0;
    this.matchWon = false;
    this.startRound();
  }

  private startRound(): void {
    this.clearRivals();
    this.restoreFloor();
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.collapseClock = 0;
    this.collapseWarned = false;
    this.pressureTimer = 0;
    this.shoveCooldown = 0;
    this.bargeToast = 0;
    this.lastResult = `Round ${this.round}. The ring is watching.`;
    this.teleportPlayer(this.playerSpawn);
    this.spawnRivals();
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Crumble', `Round ${this.round}`, `${this.playerWins} – ${this.rivalWins} · first to ${this.roundTarget}`, 2.8);
    this.game.particles.burst(this.playerSpawn.clone(), '#f2c76a', 34, {
      speed: 4.4, life: 1, size: 0.12, glow: true,
    });
  }

  private restoreFloor(): void {
    for (const tile of this.tiles) {
      tile.crack = -1;
      tile.gone = false;
      this.game.world.setBlock(tile.x, tile.y, tile.z, block(tile.key).id, true);
    }
    this.openTiles = [...this.tiles];
  }

  private clearRivals(): void {
    for (const rival of this.rivals) {
      if (this.game.entities.entities.includes(rival.entity)) this.game.entities.remove(rival.entity);
    }
    this.rivals = [];
  }

  private spawnRivals(): void {
    const count = Math.min(RIVALS.length, this.maxRivals);
    for (let i = 0; i < count; i++) {
      const roster = RIVALS[(i + (this.round - 1) * 2) % RIVALS.length];
      const spot = CRUMBLE_BOT_SPAWNS[i] ?? this.ringSpot(i, count);
      const x = this.originX + spot[0] + 0.5;
      const z = this.originZ + spot[1] + 0.5;
      const y = this.baseY + (CRUMBLE_TIERS[CRUMBLE_PLAYER_SPAWN.tier]?.level ?? 10) + 1.02;
      const entity = this.game.entities.spawn(roster.key, new THREE.Vector3(x, y, z), {
        exactY: true,
        name: roster.name,
        role: 'Contestant',
        behavior: 'stationary',
        healthScale: 0.9,
        id: `crumble_bot_${this.round}_${i}`,
      });
      if (!entity) continue;
      entity.aggro = false;
      entity.yaw = Math.atan2(this.center.x - x, this.center.z - z);
      this.rivals.push({
        entity,
        name: roster.name,
        think: 0.2 + Math.random() * 0.5,
        shove: 2 + Math.random() * 2,
        stagger: 0,
        dead: false,
      });
      this.game.particles.burst(new THREE.Vector3(x, y + 0.9, z), '#9fd8c8', 18, {
        speed: 3.4, life: 0.8, size: 0.1, glow: true,
      });
    }
  }

  private ringSpot(index: number, count: number): [number, number] {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return [Math.cos(angle) * 3.6, Math.sin(angle) * 3.6];
  }

  private teleportPlayer(position: THREE.Vector3): void {
    const player = this.game.player;
    player.teleport(position.clone());
    player.velocity.set(0, 0, 0);
    player.yaw = Math.atan2(-(this.center.x - position.x), -(this.center.z - position.z));
  }

  update(dt: number): void {
    if (this.game.ended) return;
    const player = this.game.player;
    this.ambient(dt);
    this.shoveCooldown = Math.max(0, this.shoveCooldown - dt);
    this.bargeToast = Math.max(0, this.bargeToast - dt);

    if (this.phase === 'matchEnd') {
      if (!this.matchWon) {
        this.matchEndTimer -= dt;
        if (this.matchEndTimer <= 0 && player.isAlive()) {
          player.damage(999, 'The Crumble Ring');
        }
      }
      if (player.isAlive() && player.position.y < this.baseY - FALL_MARGIN) this.teleportPlayer(this.deckSpawn);
      return;
    }

    if (player.isAlive() && player.position.y < this.baseY - FALL_MARGIN) {
      if (this.phase === 'live') {
        this.loseRound('You fell out of the ring.');
      } else {
        this.teleportPlayer(this.phase === 'countdown' ? this.playerSpawn : this.deckSpawn);
      }
      return;
    }

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'live';
        this.lastResult = 'Go! The floor is already cracking.';
        this.game.audio.play('wave');
        this.game.hud.showWaveBanner('Crumble', 'Keep moving', 'Every tile gives way', 2.2);
      }
      return;
    }

    if (this.phase === 'roundEnd') {
      this.roundEndTimer -= dt;
      if (this.roundEndTimer <= 0) this.resolveRoundEnd();
      return;
    }

    this.elapsed += dt;
    this.updatePressure(dt);
    this.updateCollapse(dt);
    this.updateRivals(dt);
    this.updateRingOuts();

    if (this.phase !== 'live') return;
    if (!player.isAlive()) {
      this.loseRound('You were carried off the ring.');
      return;
    }
    if (this.aliveRivals() === 0) {
      this.winRound();
      return;
    }
    if (this.elapsed > ROUND_TIME) this.resolveTimeout();
  }

  hud(): SimHud {
    const alive = this.aliveRivals();
    const playerTier = this.tierAtHeight(this.game.player.position.y);
    const intact = this.openTiles.length;
    const collapseIn = Math.max(0, Math.ceil(COLLAPSE_AFTER - this.elapsed));
    const scoreTone = this.playerWins > this.rivalWins ? 'good' : this.playerWins < this.rivalWins ? 'bad' : undefined;
    const actions: SimHud['actions'] = [
      {
        id: 'shove',
        label: this.shoveCooldown > 0 ? `Shove · ${Math.ceil(this.shoveCooldown)}s` : 'Shove a rival (R)',
        disabled: this.phase !== 'live' || this.shoveCooldown > 0,
        hotkey: 'KeyR',
      },
    ];
    if (this.phase === 'matchEnd' && this.matchWon) {
      actions.push({ id: 'rematch', label: 'Run the ring again' });
    }
    return {
      kicker: 'Crumble',
      title: this.phase === 'matchEnd'
        ? (this.matchWon ? 'Champion of the Ring' : 'The Ring Wins')
        : this.phase === 'roundEnd'
          ? (this.roundWonByPlayer ? 'Round Won' : 'Round Lost')
          : this.phase === 'countdown' ? 'Get Ready' : `Round ${this.round}`,
      rows: [
        { label: 'Match', value: `You ${this.playerWins} · Rivals ${this.rivalWins}`, tone: scoreTone },
        { label: 'Contestants', value: `${alive} rival${alive === 1 ? '' : 's'} left`, tone: alive <= 1 ? 'good' : undefined },
        { label: 'Arena', value: playerTier >= 0 ? CRUMBLE_TIERS[playerTier].name : 'Off the ring' },
        {
          label: 'Floor',
          value: this.elapsed >= COLLAPSE_AFTER ? 'Collapsing' : `Collapse in ${collapseIn}s`,
          tone: this.elapsed >= COLLAPSE_AFTER ? 'bad' : collapseIn <= 10 ? 'warn' : undefined,
        },
      ],
      progress: { label: 'Tiles standing', value: intact, max: Math.max(1, this.tiles.length) },
      actions,
      footer: this.phase === 'live'
        ? `${this.lastResult} Right-click a rival to shove, or press R. Stay inside the ring.`
        : this.lastResult,
    };
  }

  // ---------------------------------------------------------------- interaction

  interactEntity(entity: GameEntity): boolean {
    const rival = this.rivals.find((entry) => entry.entity.id === entity.id && !entry.dead);
    if (!rival) return false;
    this.shoveRival(rival, true);
    return true;
  }

  hintForEntity(entity: GameEntity): string | null {
    const rival = this.rivals.find((entry) => entry.entity.id === entity.id && !entry.dead);
    if (!rival) return null;
    return `<b>${rival.name}</b> · contestant · ${Math.ceil(rival.entity.health)}/${rival.entity.maxHealth} HP · right-click to shove`;
  }

  hintForBlock(key: string): string | null {
    if (key === 'crumble_tile' || key === 'crumble_tile_alt') {
      return '<b>Crumble Tile</b> · gives way about a second after you step on it · left-click to break it now';
    }
    if (key === 'crumble_cracked') return '<b>Cracked Tile</b> · about to give way · get off it';
    return null;
  }

  interactBlock(): boolean {
    return false;
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    if (key !== 'crumble_tile' && key !== 'crumble_tile_alt' && key !== 'crumble_cracked') return false;
    const tile = this.tileMap.get(this.tileKey(x, y, z));
    if (!tile) return false;
    this.shatterTile(tile, true);
    return true;
  }

  onRespawn(): void {
    this.startMatch();
  }

  action(id: string): void {
    if (id === 'shove') {
      const rival = this.nearestRival();
      if (rival) this.shoveRival(rival, false);
      else {
        this.game.toast('No rival in reach. Get closer and face them.', 'warn');
        this.game.audio.play('error');
      }
      return;
    }
    if (id === 'rematch' && this.phase === 'matchEnd' && this.matchWon) this.startMatch();
  }

  dispose(): void {
    this.clearRivals();
  }

  // -------------------------------------------------------------------- floor

  private tileKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private tileUnder(position: THREE.Vector3): CrumbleTile | undefined {
    const x = Math.floor(position.x);
    const z = Math.floor(position.z);
    const y = Math.floor(position.y - 0.03);
    return this.tileMap.get(this.tileKey(x, y, z));
  }

  private crackTile(tile: CrumbleTile, seconds: number): void {
    if (tile.gone || tile.crack >= 0) return;
    tile.crack = seconds;
    this.game.world.setBlock(tile.x, tile.y, tile.z, block('crumble_cracked').id, true);
  }

  private shatterTile(tile: CrumbleTile, byPlayer: boolean): void {
    if (tile.gone) return;
    tile.gone = true;
    tile.crack = -1;
    this.game.world.setBlock(tile.x, tile.y, tile.z, 0, true);
    const index = this.openTiles.indexOf(tile);
    if (index >= 0) {
      const last = this.openTiles.length - 1;
      this.openTiles[index] = this.openTiles[last];
      this.openTiles.pop();
    }
    if (byPlayer) this.game.recordSim('defend', 'tile', 1);
    const at = new THREE.Vector3(tile.x + 0.5, tile.y + 0.55, tile.z + 0.5);
    if (this.nearPlayer(at, 34)) {
      this.game.particles.burst(at, byPlayer ? '#ffd27a' : '#c9b79c', byPlayer ? 14 : 8, {
        speed: byPlayer ? 3.2 : 2.2, life: 0.7, size: 0.1, gravity: -6, glow: byPlayer,
      });
    }
  }

  private updatePressure(dt: number): void {
    this.pressureTimer -= dt;
    if (this.pressureTimer > 0) return;
    this.pressureTimer = 0.14;

    const player = this.game.player;
    if (player.isAlive()) {
      const tile = this.tileUnder(player.position);
      if (tile && !tile.gone) this.crackTile(tile, PLAYER_CRACK);
    }
    for (const rival of this.rivals) {
      if (rival.dead || !rival.entity.alive) continue;
      const tile = this.tileUnder(rival.entity.position);
      if (tile && !tile.gone) this.crackTile(tile, RIVAL_CRACK);
    }

    for (const tile of this.tiles) {
      if (tile.gone || tile.crack < 0) continue;
      tile.crack -= 0.14;
      if (tile.crack <= 0) this.shatterTile(tile, false);
    }
  }

  private updateCollapse(dt: number): void {
    if (this.elapsed < COLLAPSE_AFTER) return;
    if (!this.collapseWarned) {
      this.collapseWarned = true;
      this.game.hud.showWaveBanner('Crumble', 'The ring is giving way', 'The floor is collapsing on its own', 3.4);
      this.game.audio.play('error');
      this.lastResult = 'The ring has started to collapse.';
    }
    this.collapseClock -= dt;
    if (this.collapseClock > 0) return;
    const ramp = Math.min(1, (this.elapsed - COLLAPSE_AFTER) / 42);
    this.collapseClock = 0.55 - ramp * 0.33;
    const count = 1 + Math.round(ramp * 3);
    for (let i = 0; i < count; i++) {
      if (this.openTiles.length === 0) break;
      const tile = this.openTiles[Math.floor(Math.random() * this.openTiles.length)];
      this.shatterTile(tile, false);
    }
  }

  private updateRingOuts(): void {
    const player = this.game.player;
    if (player.isAlive()) {
      const distance = Math.hypot(player.position.x - this.center.x, player.position.z - this.center.z);
      if (distance > ARENA_EDGE && player.position.y > this.baseY - 1) {
        this.loseRound('You stepped out of the ring.');
        return;
      }
    }
    for (const rival of this.rivals) {
      if (rival.dead || !rival.entity.alive) continue;
      const distance = Math.hypot(rival.entity.position.x - this.center.x, rival.entity.position.z - this.center.z);
      if (distance > ARENA_EDGE && rival.entity.position.y > this.baseY - 1) {
        this.eliminateRival(rival, 'ring');
      }
    }
  }

  // -------------------------------------------------------------------- rivals

  private updateRivals(dt: number): void {
    const player = this.game.player;
    for (const rival of this.rivals) {
      if (rival.dead) continue;
      if (!rival.entity.alive) {
        this.eliminateRival(rival, 'defeat');
        continue;
      }
      const entity = rival.entity;
      if (entity.position.y < this.baseY - FALL_MARGIN) {
        this.eliminateRival(rival, 'fall');
        continue;
      }
      rival.shove = Math.max(0, rival.shove - dt);
      if (rival.stagger > 0) {
        rival.stagger -= dt;
        entity.moveOverride = null;
        continue;
      }

      const tier = this.tierAtHeight(entity.position.y);
      if (tier < 0) {
        entity.moveOverride = null;
        continue;
      }

      rival.think -= dt;
      if (rival.think <= 0) {
        rival.think = 0.34 + Math.random() * 0.22;
        const target = this.chooseTarget(rival, tier);
        if (target) {
          entity.moveOverride = { x: target.x, z: target.z, speed: 2.15 + Math.random() * 0.5 };
        } else {
          entity.moveOverride = null;
        }
      }

      if (player.isAlive() && rival.shove <= 0) {
        const distance = Math.hypot(player.position.x - entity.position.x, player.position.z - entity.position.z);
        if (distance < 2.1 && Math.abs(player.position.y - entity.position.y) < 2.2) {
          this.barge(rival);
        }
      }
    }
  }

  private chooseTarget(rival: Rival, tier: number): { x: number; z: number } | null {
    const def = CRUMBLE_TIERS[tier];
    const player = this.game.player;
    if (player.isAlive() && this.tierAtHeight(player.position.y) === tier && Math.random() < 0.32) {
      const distance = Math.hypot(player.position.x - rival.entity.position.x, player.position.z - rival.entity.position.z);
      if (distance < 7) return { x: player.position.x, z: player.position.z };
    }

    const candidates: CrumbleTile[] = [];
    for (const tile of this.openTiles) {
      if (tile.tier !== tier) continue;
      const distance = Math.hypot(tile.x + 0.5 - rival.entity.position.x, tile.z + 0.5 - rival.entity.position.z);
      if (distance > 1.2 && distance < def.tileRadius + 3) candidates.push(tile);
    }
    if (candidates.length === 0) return null;
    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    return { x: tile.x + 0.5, z: tile.z + 0.5 };
  }

  private barge(rival: Rival): void {
    const player = this.game.player;
    const dx = player.position.x - rival.entity.position.x;
    const dz = player.position.z - rival.entity.position.z;
    const length = Math.hypot(dx, dz) || 1;
    player.velocity.x += (dx / length) * 16;
    player.velocity.z += (dz / length) * 16;
    player.velocity.y = Math.max(player.velocity.y, 7.4);
    const tile = this.tileUnder(player.position);
    if (tile) this.crackTile(tile, 0.18);
    rival.shove = 4.2 + Math.random() * 2.2;
    rival.think = 0.2;
    this.lastResult = `${rival.name} barges you toward the rim.`;
    if (this.bargeToast <= 0) {
      this.bargeToast = 5.5;
      this.game.toast(`${rival.name} barges you!`, 'bad');
    }
    this.game.audio.play('hit');
    this.game.particles.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#f2a65a', 12, {
      speed: 3.2, life: 0.55, size: 0.09, glow: true,
    });
  }

  private eliminateRival(rival: Rival, reason: 'fall' | 'defeat' | 'ring'): void {
    if (rival.dead) return;
    rival.dead = true;
    rival.entity.moveOverride = null;
    if (reason !== 'defeat' && this.game.entities.entities.includes(rival.entity)) {
      this.game.entities.remove(rival.entity);
    }
    this.game.recordSim('defend', 'rival', 1);
    this.game.player.addCoins(4);
    this.game.player.addXp(10);
    this.game.recordSim('earn', 'coin', 4);
    this.lastResult = reason === 'defeat'
      ? `${rival.name} is knocked out of the round.`
      : reason === 'fall'
        ? `${rival.name} falls through the ring.`
        : `${rival.name} is out of bounds.`;
    this.game.toast(`${rival.name} is out. ${this.aliveRivals()} rivals left.`, 'good');
    const at = rival.entity.center.clone();
    this.game.particles.burst(at, '#9fd8c8', 22, { speed: 4.2, life: 0.9, size: 0.12, glow: true });
    if (!rival.entity.alive) this.game.audio.play('hit');
    if (this.phase === 'live' && this.aliveRivals() === 0) this.winRound();
  }

  private aliveRivals(): number {
    return this.rivals.filter((rival) => !rival.dead).length;
  }

  private nearestRival(): Rival | null {
    const player = this.game.player;
    const forward = player.flatForward;
    let best: Rival | null = null;
    let bestDistance = SHOVE_RANGE;
    for (const rival of this.rivals) {
      if (rival.dead || !rival.entity.alive) continue;
      const dx = rival.entity.position.x - player.position.x;
      const dz = rival.entity.position.z - player.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > bestDistance || distance < 0.05) continue;
      if (Math.abs(rival.entity.position.y - player.position.y) > 2.4) continue;
      const facing = (dx / distance) * forward.x + (dz / distance) * forward.z;
      if (facing < 0.15) continue;
      bestDistance = distance;
      best = rival;
    }
    return best;
  }

  private shoveRival(rival: Rival, fromClick: boolean): void {
    if (this.phase !== 'live' || rival.dead || !rival.entity.alive) return;
    const player = this.game.player;
    const dx = rival.entity.position.x - player.position.x;
    const dz = rival.entity.position.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > SHOVE_RANGE || Math.abs(rival.entity.position.y - player.position.y) > 2.4) {
      if (fromClick) this.game.toast('Get closer to shove them.', 'warn');
      return;
    }
    if (this.shoveCooldown > 0) {
      if (fromClick) this.game.toast('Catch your breath before the next shove.', 'info');
      return;
    }
    const length = distance || 1;
    rival.entity.velocity.x += (dx / length) * 30;
    rival.entity.velocity.z += (dz / length) * 30;
    rival.entity.velocity.y = Math.max(rival.entity.velocity.y, 7.2);
    rival.stagger = 1.15;
    rival.think = 1.15;
    const tile = this.tileUnder(rival.entity.position);
    if (tile) this.crackTile(tile, 0.12);
    this.shoveCooldown = SHOVE_COOLDOWN;
    this.lastResult = `You shove ${rival.name} toward the rim.`;
    this.game.audio.play('hit');
    this.game.particles.burst(rival.entity.center.clone(), '#f2c76a', 16, {
      speed: 3.6, life: 0.6, size: 0.1, glow: true,
    });
  }

  // -------------------------------------------------------------------- match

  private tierAtHeight(y: number): number {
    for (let i = CRUMBLE_TIERS.length - 1; i >= 0; i--) {
      const top = this.baseY + CRUMBLE_TIERS[i].level + 1;
      if (Math.abs(y - top) < 1.35) return i;
    }
    return -1;
  }

  private winRound(): void {
    if (this.phase !== 'live') return;
    this.playerWins += 1;
    this.roundWonByPlayer = true;
    this.phase = 'roundEnd';
    this.roundEndTimer = 4.2;
    this.freezeRivals();
    for (const rival of this.rivals) {
      if (rival.dead) continue;
      rival.dead = true;
      rival.entity.moveOverride = null;
      if (this.game.entities.entities.includes(rival.entity)) this.game.entities.remove(rival.entity);
      this.game.recordSim('defend', 'rival', 1);
    }
    this.game.player.addCoins(60);
    this.game.player.addXp(80);
    this.game.recordSim('earn', 'coin', 60);
    this.game.recordSim('defend', 'round', 1);
    this.lastResult = `Round ${this.round} won. ${this.playerWins} – ${this.rivalWins}.`;
    this.game.audio.play('quest');
    this.game.hud.showWaveBanner('Crumble', 'Round Won', `${this.playerWins} – ${this.rivalWins} · +60 coins`, 3.4);
    this.game.toast(`Round ${this.round} won. +60 coins, +80 XP.`, 'good');
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '#ffe6a0', 46);
  }

  private loseRound(reason: string): void {
    if (this.phase !== 'live') return;
    this.rivalWins += 1;
    this.roundWonByPlayer = false;
    this.phase = 'roundEnd';
    this.roundEndTimer = 4;
    this.freezeRivals();
    this.teleportPlayer(this.deckSpawn);
    this.lastResult = reason;
    this.game.audio.play('lose');
    this.game.hud.showWaveBanner('Crumble', 'Round Lost', `${this.playerWins} – ${this.rivalWins} · ${reason}`, 3.6);
    this.game.toast(reason, 'bad');
  }

  private freezeRivals(): void {
    for (const rival of this.rivals) {
      rival.entity.moveOverride = null;
      if (rival.entity.alive) rival.entity.velocity.set(0, 0, 0);
    }
  }

  private resolveRoundEnd(): void {
    if (this.playerWins >= this.roundTarget) {
      this.finishMatch(true);
      return;
    }
    if (this.rivalWins >= this.roundTarget) {
      this.finishMatch(false);
      return;
    }
    this.round += 1;
    this.startRound();
  }

  private resolveTimeout(): void {
    const playerTier = this.tierAtHeight(this.game.player.position.y);
    let bestRivalTier = -1;
    for (const rival of this.rivals) {
      if (rival.dead || !rival.entity.alive) continue;
      bestRivalTier = Math.max(bestRivalTier, this.tierAtHeight(rival.entity.position.y));
    }
    if (playerTier > bestRivalTier || (playerTier === bestRivalTier && Math.random() < 0.5)) {
      this.winRound();
    } else {
      this.loseRound('The ring ran out of time and the crowd called it for the rivals.');
    }
  }

  private finishMatch(win: boolean): void {
    this.phase = 'matchEnd';
    this.matchWon = win;
    this.matchEndTimer = 3;
    this.freezeRivals();
    if (win) {
      this.game.player.addCoins(300);
      this.game.player.addXp(500);
      this.game.recordSim('earn', 'coin', 300);
      this.game.recordSim('defend', 'match', 1);
      this.lastResult = 'Champion of the Crumble Ring.';
      this.game.audio.play('win');
      this.game.hud.showWaveBanner('Crumble', 'Champion of the Ring', `${this.playerWins} – ${this.rivalWins} · +300 coins`, 5);
      this.game.toast('You take the crown. +300 coins, +500 XP.', 'good');
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const at = new THREE.Vector3(
          this.center.x + Math.cos(angle) * (4 + i),
          this.baseY + 12 + i * 0.6,
          this.center.z + Math.sin(angle) * (4 + i),
        );
        this.game.particles.sparkle(at, i % 2 === 0 ? '#ffd27a' : '#9fd8c8', 34);
      }
    } else {
      this.lastResult = 'The ring takes the match.';
      this.game.audio.play('lose');
      this.game.hud.showWaveBanner('Crumble', 'The Ring Wins', `${this.playerWins} – ${this.rivalWins}`, 4.2);
      this.game.toast('The ring takes the match.', 'bad');
    }
  }

  // -------------------------------------------------------------------- flavour

  private ambient(dt: number): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 0.45;
    const player = this.game.player.position;
    const tier = CRUMBLE_TIERS[randomInt(0, CRUMBLE_TIERS.length - 1)];
    const angle = Math.random() * Math.PI * 2;
    const radius = tier.radius + 0.4;
    const at = new THREE.Vector3(
      this.center.x + Math.cos(angle) * radius,
      this.baseY + tier.level + 0.5 + Math.random() * 0.8,
      this.center.z + Math.sin(angle) * radius,
    );
    if (!this.nearPlayer(at, 42)) return;
    this.game.particles.burst(at, Math.random() < 0.5 ? '#f2c76a' : '#9fd8c8', 1, {
      speed: 0.4, life: 1.4, size: 0.06, gravity: -0.4, drag: 0.98, glow: true, spread: 0.4, upward: 0.2,
    });
  }

  private nearPlayer(position: THREE.Vector3, radius: number): boolean {
    const player = this.game.player.position;
    const dx = position.x - player.x;
    const dz = position.z - player.z;
    return dx * dx + dz * dz <= radius * radius;
  }
}
