import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { block, blockById } from '../../world/Blocks';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { randomInt, scanBlocks, type BlockPos } from './SimUtils';

/** Grid spacing between bomb lanes, in blocks. */
const CELL = 2;
const MIN_CELL = -7;
const MAX_CELL = 7;
const BOMB_FUSE = 2.35;
const BLAST_DAMAGE = 8;

interface Cell {
  i: number;
  j: number;
}

interface Bomb {
  x: number;
  y: number;
  z: number;
  fuse: number;
  range: number;
  bot?: GameEntity;
}

interface BotState {
  entity: GameEntity;
  name: string;
  cell: Cell;
  path: Cell[];
  think: number;
  repath: number;
  cooldown: number;
  range: number;
  maxBombs: number;
  speed: number;
  dead: boolean;
}

const BOT_DEFS = [
  { key: 'human:bandit_road', name: 'Fizz', cell: { i: -7, j: -7 } },
  { key: 'human:ninja_ember', name: 'Ash', cell: { i: 7, j: -7 } },
  { key: 'human:orc_brute', name: 'Coal', cell: { i: -7, j: 7 } },
];

const NEIGHBORS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const CRATE_DROPS: Array<{ item: string; weight: number }> = [
  { item: 'bomb_up', weight: 22 },
  { item: 'blast_core', weight: 22 },
  { item: 'speed_skates', weight: 16 },
  { item: 'tnt', weight: 18 },
  { item: 'coin', weight: 10 },
  { item: 'golden_apple', weight: 5 },
];

/**
 * Cinderburst: a grid of pillars and powder crates, four bombers and one rule.
 * Arm a fuse, step out of the cross and be the last one standing.
 */
export class BomberSystem implements SimSystem {
  readonly kind = 'bomber' as const;

  private game: Game;
  private origin: THREE.Vector3;
  private floorY: number;
  private spawn = new THREE.Vector3();
  private initialCrates: BlockPos[] = [];
  private crateKeys = new Set<string>();
  private bombs: Bomb[] = [];
  private bombAt = new Map<string, Bomb>();
  private bots: BotState[] = [];
  private maxBombs = 2;
  private blastRange = 2;
  private speedLevel = 0;
  private baseWalk: number;
  private baseSprint: number;
  private placeCooldown = 0;
  private powerupTimer = 0;
  private sparkTimer = 0;
  private ambientTimer = 0;
  private finished = false;
  private won = false;
  private sawEnd = false;
  private lastResult = 'Three rivals, one powder floor. Fuses up.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.floorY = game.baseY + 1;
    const cx = spec.center?.x ?? 0;
    const cz = spec.center?.z ?? 0;
    this.origin = new THREE.Vector3(cx, this.floorY, cz);
    this.spawn.set(cx + 0.5, this.floorY, cz + 14.5);
    this.baseWalk = game.player.walkSpeed;
    this.baseSprint = game.player.sprintSpeed;

    const found = scanBlocks(game, ['crate'], 34, 6);
    this.initialCrates = (found.get('crate') ?? []).filter((pos) => (
      pos.y === this.floorY
      && Math.abs(pos.x - cx) <= 16
      && Math.abs(pos.z - cz) <= 16
    ));
    for (const pos of this.initialCrates) this.crateKeys.add(this.blockKey(pos.x, pos.y, pos.z));

    this.spawnBots();
  }

  update(dt: number): void {
    if (this.game.ended) {
      this.sawEnd = true;
      return;
    }
    if (this.sawEnd) {
      this.sawEnd = false;
      if (!this.won) this.resetRound();
    }
    if (this.finished) return;

    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.updateBombs(dt);
    this.updateBots(dt);
    this.updatePowerups(dt);
    this.updateAmbient(dt);
    this.checkBots();
  }

  hud(): SimHud {
    const alive = this.bots.filter((bot) => !bot.dead && bot.entity.alive).length;
    const playerBombs = this.bombs.filter((bomb) => !bomb.bot).length;
    const actions: SimHud['actions'] = [
      {
        id: 'bomb',
        label: this.placeCooldown > 0
          ? `Fuse cooling · ${Math.ceil(this.placeCooldown * 10) / 10}s`
          : `Place TNT · ${this.game.player.inventory.count('tnt')}`,
        disabled: this.finished || this.placeCooldown > 0 || this.playerBombs() >= this.maxBombs,
      },
    ];
    if (this.finished) actions.push({ id: 'rematch', label: 'Rematch' });
    return {
      kicker: 'Cinderburst',
      title: this.finished ? (this.won ? 'Arena Cleared' : 'Fuses Out') : 'Light the Fuse',
      rows: [
        { label: 'Rivals', value: `${alive} / ${this.bots.length}`, tone: alive <= 1 ? 'good' : undefined },
        { label: 'Your fuses', value: `${playerBombs} / ${this.maxBombs}`, tone: playerBombs >= this.maxBombs ? 'warn' : undefined },
        { label: 'Blast', value: `${this.blastRange} blocks` },
        { label: 'Crates', value: `${this.crateKeys.size} left` },
      ],
      progress: { label: 'Rivals out', value: this.bots.length - alive, max: Math.max(1, this.bots.length) },
      actions,
      footer: this.lastResult,
    };
  }

  interactBlock(): boolean {
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string, x?: number, y?: number, z?: number): string | null {
    if (key === 'crate') return '<b>Crate</b> · blast it open for a power-up';
    if (key === 'tnt' && x !== undefined && y !== undefined && z !== undefined
      && this.bombAt.has(this.blockKey(x, y, z))) {
      return '<b>TNT</b> · fuse burning · <b>run</b>';
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const bot = this.bots.find((entry) => entry.entity.id === entity.id && !entry.dead);
    if (!bot) return null;
    return `<b>${bot.name}</b> · rival bomber · ${Math.ceil(bot.entity.health)}/${bot.entity.maxHealth} HP`;
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    if (key === 'crate') {
      this.crateDestroyed(x, y, z, false);
      return true;
    }
    if (key === 'tnt') {
      const bomb = this.bombAt.get(this.blockKey(x, y, z));
      if (bomb) {
        bomb.fuse = 0.02;
        this.game.toast('You struck a live fuse.', 'bad');
        return true;
      }
    }
    return false;
  }

  onBlockPlaced(key: string, x: number, y: number, z: number): void {
    if (key !== 'tnt') return;
    if (this.playerBombs() >= this.maxBombs) {
      this.game.world.setBlock(x, y, z, 0, true);
      this.game.player.inventory.add('tnt', 1);
      this.game.player.refreshHeldItem();
      this.game.audio.play('error');
      this.game.toast(`Only ${this.maxBombs} fuses can burn at once.`, 'warn');
      return;
    }
    if (!this.registerBomb(x, y, z, this.blastRange)) return;
    this.lastResult = 'Fuse lit. Clear the cross.';
    this.game.particles.burst(new THREE.Vector3(x + 0.5, y + 0.8, z + 0.5), '#ffd27a', 10, {
      speed: 2.2, life: 0.45, size: 0.08, glow: true,
    });
  }

  action(id: string): void {
    if (id === 'bomb') this.dropBomb();
    if (id === 'rematch') this.resetRound();
  }

  dispose(): void {
    for (const bot of this.bots) {
      if (bot.entity.alive) this.game.entities.remove(bot.entity);
    }
    this.bots = [];
    for (const bomb of this.bombs) {
      const def = blockById(this.game.world.getBlock(bomb.x, bomb.y, bomb.z));
      if (def?.key === 'tnt') this.game.world.setBlock(bomb.x, bomb.y, bomb.z, 0, true);
    }
    this.bombs = [];
    this.bombAt.clear();
    this.game.player.walkSpeed = this.baseWalk;
    this.game.player.sprintSpeed = this.baseSprint;
  }

  // ------------------------------------------------------------------ bombs

  private playerBombs(): number {
    return this.bombs.filter((bomb) => !bomb.bot).length;
  }

  private registerBomb(x: number, y: number, z: number, range: number, bot?: GameEntity): boolean {
    const key = this.blockKey(x, y, z);
    if (this.bombAt.has(key)) return false;
    const current = blockById(this.game.world.getBlock(x, y, z));
    if (!current || current.key !== 'tnt') {
      if (!this.game.world.setBlock(x, y, z, block('tnt').id, true)) return false;
    }
    const bomb: Bomb = { x, y, z, fuse: BOMB_FUSE, range, bot };
    this.bombs.push(bomb);
    this.bombAt.set(key, bomb);
    this.game.audio.play('place', 1);
    return true;
  }

  private dropBomb(): void {
    if (this.finished) return;
    if (this.placeCooldown > 0) return;
    if (this.playerBombs() >= this.maxBombs) {
      this.game.audio.play('error');
      this.game.toast(`Only ${this.maxBombs} fuses can burn at once.`, 'warn');
      return;
    }
    if (this.game.player.inventory.count('tnt') <= 0) {
      this.game.audio.play('error');
      this.game.toast('Out of TNT. Blast crates to restock.', 'warn');
      return;
    }
    const player = this.game.player;
    const forward = player.flatForward;
    const x = Math.floor(player.position.x + forward.x * CELL);
    const z = Math.floor(player.position.z + forward.z * CELL);
    if (Math.abs(x - this.origin.x) > 17 || Math.abs(z - this.origin.z) > 17) {
      this.game.toast('That is outside the arena floor.', 'warn');
      return;
    }
    const ground = this.game.world.getNearestGround(x, z, Math.floor(player.position.y) + 3);
    if (ground < 0 || Math.abs(ground - player.position.y) > 2.5) {
      this.game.toast('No clear floor to drop TNT here.', 'warn');
      return;
    }
    if (this.bombAt.has(this.blockKey(x, ground, z))) {
      this.game.toast('There is already a fuse there.', 'warn');
      return;
    }
    player.inventory.remove('tnt', 1);
    player.refreshHeldItem();
    if (!this.registerBomb(x, ground, z, this.blastRange)) {
      player.inventory.add('tnt', 1);
      player.refreshHeldItem();
      return;
    }
    this.placeCooldown = 0.45;
    this.lastResult = 'Fuse lit. Clear the cross.';
    this.game.particles.burst(new THREE.Vector3(x + 0.5, ground + 0.8, z + 0.5), '#ffd27a', 10, {
      speed: 2.2, life: 0.45, size: 0.08, glow: true,
    });
  }

  private updateBombs(dt: number): void {
    this.sparkTimer -= dt;
    const spark = this.sparkTimer <= 0;
    if (spark) this.sparkTimer = 0.16;
    for (const bomb of this.bombs) {
      bomb.fuse -= dt;
      if (spark && Math.random() < 0.6) {
        this.game.particles.burst(new THREE.Vector3(bomb.x + 0.5, bomb.y + 1.02, bomb.z + 0.5), '#ffe07a', 1, {
          speed: 0.7, life: 0.35, size: 0.05, gravity: -2.2, glow: true, spread: 0.2,
        });
      }
    }
    const ready = this.bombs.filter((bomb) => bomb.fuse <= 0);
    for (const bomb of ready) {
      if (this.bombAt.has(this.blockKey(bomb.x, bomb.y, bomb.z))) this.detonate(bomb);
    }
  }

  private detonate(bomb: Bomb): void {
    this.untrackBomb(bomb);

    const by = this.floorY;
    const cells = new Map<string, { x: number; z: number }>();
    const addCell = (x: number, z: number) => cells.set(`${x},${z}`, { x, z });
    addCell(bomb.x, bomb.z);

    // A bomb placed on top of a crate still cracks the crate underneath it.
    const below = blockById(this.game.world.getBlock(bomb.x, by, bomb.z));
    if (below?.key === 'crate') this.crateDestroyed(bomb.x, by, bomb.z, true);

    for (const [dx, dz] of NEIGHBORS) {
      for (let step = 1; step <= bomb.range; step++) {
        const x = bomb.x + dx * step;
        const z = bomb.z + dz * step;
        const def = blockById(this.game.world.getBlock(x, by, z));
        if (!def || def.key === 'air') {
          addCell(x, z);
          continue;
        }
        if (def.key === 'crate') {
          this.crateDestroyed(x, by, z, true);
          addCell(x, z);
          break;
        }
        if (def.key === 'tnt') {
          addCell(x, z);
          const chained = this.bombAt.get(this.blockKey(x, by, z));
          if (chained) chained.fuse = Math.min(chained.fuse, 0.04);
          break;
        }
        break;
      }
    }

    const source = bomb.bot ? bomb.bot : this.game.player;
    for (const bot of this.bots) {
      if (bot.dead || !bot.entity.alive) continue;
      const bx = Math.floor(bot.entity.position.x);
      const bz = Math.floor(bot.entity.position.z);
      if (!cells.has(`${bx},${bz}`)) continue;
      if (Math.abs(bot.entity.position.y - by) > 2) continue;
      bot.entity.hurt(BLAST_DAMAGE, source, 0.35);
    }

    const player = this.game.player;
    if (player.isAlive()) {
      const px = Math.floor(player.position.x);
      const pz = Math.floor(player.position.z);
      if (cells.has(`${px},${pz}`) && Math.abs(player.position.y - by) <= 2) {
        player.damage(BLAST_DAMAGE, bomb.bot ? `${bomb.bot.displayName}'s bomb` : 'Cinderburst');
      }
    }

    for (const cell of cells.values()) {
      const center = new THREE.Vector3(cell.x + 0.5, by + 0.55, cell.z + 0.5);
      this.game.particles.burst(center, '#ffb24a', 5, {
        speed: 3.2, life: 0.38, size: 0.1, gravity: -2.4, glow: true, spread: 0.55, upward: 0.2,
      });
      this.game.particles.burst(center.clone().add(new THREE.Vector3(0, 0.6, 0)), '#6b5448', 2, {
        speed: 1.6, life: 0.95, size: 0.16, gravity: -1.2, spread: 0.6,
      });
    }
    this.game.audio.play('explode');
    this.game.hud.flashDamage();
    this.lastResult = bomb.bot ? `${bomb.bot.displayName} sets off a charge.` : 'Your charge goes off.';
  }

  private untrackBomb(bomb: Bomb): void {
    const index = this.bombs.indexOf(bomb);
    if (index >= 0) this.bombs.splice(index, 1);
    this.bombAt.delete(this.blockKey(bomb.x, bomb.y, bomb.z));
    const def = blockById(this.game.world.getBlock(bomb.x, bomb.y, bomb.z));
    if (def?.key === 'tnt') this.game.world.setBlock(bomb.x, bomb.y, bomb.z, 0, true);
  }

  // ----------------------------------------------------------------- crates

  private crateDestroyed(x: number, y: number, z: number, removeBlock: boolean): void {
    const key = this.blockKey(x, y, z);
    if (!this.crateKeys.has(key)) {
      if (removeBlock) {
        const def = blockById(this.game.world.getBlock(x, y, z));
        if (def?.key === 'crate') this.game.world.setBlock(x, y, z, 0, true);
      }
      return;
    }
    this.crateKeys.delete(key);
    if (removeBlock) {
      const def = blockById(this.game.world.getBlock(x, y, z));
      if (def?.key === 'crate') this.game.world.setBlock(x, y, z, 0, true);
    }
    this.game.recordSim('open', 'crate', 1);
    this.game.particles.dust(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), '#b98a53', 14);
    this.game.particles.burst(new THREE.Vector3(x + 0.5, y + 0.7, z + 0.5), '#d8b070', 8, {
      speed: 2.6, life: 0.6, size: 0.1, gravity: -4,
    });
    this.game.audio.play('break', 2);

    const drop = this.rollCrateDrop();
    if (!drop) return;
    if (drop === 'coin') {
      this.game.entities.spawnDrop('coin', randomInt(4, 8), new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5));
    } else {
      this.game.entities.spawnDrop(drop, 1, new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5));
    }
  }

  private rollCrateDrop(): string | null {
    const total = CRATE_DROPS.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of CRATE_DROPS) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return null;
  }

  // --------------------------------------------------------------- powerups

  private updatePowerups(dt: number): void {
    this.powerupTimer -= dt;
    if (this.powerupTimer > 0) return;
    this.powerupTimer = 0.35;
    if (!this.game.player.isAlive()) return;
    const inventory = this.game.player.inventory;
    if (inventory.count('bomb_up') > 0) {
      inventory.remove('bomb_up', 1);
      if (this.maxBombs < 5) {
        this.maxBombs += 1;
        this.toastPowerup(`Bomb rack upgraded: ${this.maxBombs} fuses at once.`, '#ff9b4a');
      } else {
        this.game.player.addCoins(6);
        this.game.toast('Bomb rack full. +6c', 'info');
      }
      return;
    }
    if (inventory.count('blast_core') > 0) {
      inventory.remove('blast_core', 1);
      if (this.blastRange < 6) {
        this.blastRange += 2;
        this.toastPowerup(`Blast core fitted: ${this.blastRange} blocks of reach.`, '#ff5a3c');
      } else {
        this.game.player.addCoins(6);
        this.game.toast('Blast core already maxed. +6c', 'info');
      }
      return;
    }
    if (inventory.count('speed_skates') > 0) {
      inventory.remove('speed_skates', 1);
      if (this.speedLevel < 4) {
        this.speedLevel += 1;
        this.applySpeed();
        this.toastPowerup('Cinder skates fitted. Faster on the floor.', '#7be6ff');
      } else {
        this.game.player.addCoins(6);
        this.game.toast('Skates already maxed. +6c', 'info');
      }
    }
  }

  private applySpeed(): void {
    this.game.player.walkSpeed = this.baseWalk + this.speedLevel * 0.32;
    this.game.player.sprintSpeed = this.baseSprint + this.speedLevel * 0.42;
  }

  private toastPowerup(message: string, color: string): void {
    this.game.audio.play('craft');
    this.game.toast(message, 'good');
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.1, 0)), color, 20);
  }

  // ------------------------------------------------------------------- bots

  private spawnBots(): void {
    for (const def of BOT_DEFS) {
      const x = this.origin.x + def.cell.i * CELL;
      const z = this.origin.z + def.cell.j * CELL;
      const entity = this.game.entities.spawn(def.key, new THREE.Vector3(x, this.floorY, z), {
        exactY: true,
        name: def.name,
        role: 'Rival Bomber',
        behavior: 'stationary',
        healthScale: 0.5,
        id: `cinder_bot_${def.cell.i}_${def.cell.j}`,
      });
      if (!entity) continue;
      entity.aggro = false;
      entity.yaw = Math.atan2(this.origin.x - x, this.origin.z - z);
      this.bots.push({
        entity,
        name: def.name,
        cell: { ...def.cell },
        path: [],
        think: Math.random() * 0.3,
        repath: 0,
        cooldown: 1.5 + Math.random() * 1.5,
        range: 2,
        maxBombs: 1,
        speed: Math.max(2.2, entity.def.speed * 0.92),
        dead: false,
      });
      this.game.particles.burst(new THREE.Vector3(x, this.floorY + 0.8, z), '#ff8a4a', 18, {
        speed: 3.4, life: 0.8, size: 0.11, glow: true,
      });
    }
  }

  private updateBots(dt: number): void {
    const danger = this.dangerCells();
    const playerCell = this.cellOf(this.game.player.position);
    for (const bot of this.bots) {
      if (bot.dead || !bot.entity.alive) continue;
      bot.think -= dt;
      bot.repath -= dt;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      this.advancePath(bot);
      if (bot.think > 0) continue;
      bot.think = 0.28 + Math.random() * 0.14;

      const cell = this.cellOf(bot.entity.position);
      if (danger.has(this.cellKey(cell.i, cell.j))) {
        const escape = this.findPath(cell, (i, j) => !danger.has(this.cellKey(i, j)));
        if (escape && escape.length) this.setPath(bot, escape);
        else bot.entity.moveOverride = null;
        continue;
      }

      if (this.game.player.isAlive() && bot.cooldown <= 0 && this.botShouldBomb(bot, cell, playerCell)) {
        this.botPlaceBomb(bot, cell, playerCell);
        continue;
      }

      if (bot.path.length > 0 && bot.repath > 0) continue;
      bot.repath = 1.3 + Math.random() * 1.2;
      let path = this.findPath(
        cell,
        (i, j) => this.botGoal(i, j, playerCell) && !danger.has(this.cellKey(i, j)),
      );
      if (!path) path = this.findPath(cell, (i, j) => i === playerCell.i && j === playerCell.j);
      if (!path) {
        for (let tries = 0; tries < 6 && !path; tries++) {
          const ri = randomInt(MIN_CELL, MAX_CELL);
          const rj = randomInt(MIN_CELL, MAX_CELL);
          path = this.findPath(cell, (i, j) => i === ri && j === rj && !danger.has(this.cellKey(i, j)));
        }
      }
      if (path && path.length) this.setPath(bot, path);
      else bot.entity.moveOverride = null;
    }
  }

  private botGoal(i: number, j: number, playerCell: Cell): boolean {
    if (!this.cellOpen(i, j)) return false;
    if (!this.game.player.isAlive()) return this.cellOpen(i, j);
    const distance = Math.abs(i - playerCell.i) + Math.abs(j - playerCell.j);
    return distance === 2 && (i === playerCell.i || j === playerCell.j);
  }

  private botShouldBomb(bot: BotState, cell: Cell, playerCell: Cell): boolean {
    if (this.bombsFor(bot) >= bot.maxBombs) return false;
    const di = playerCell.i - cell.i;
    const dj = playerCell.j - cell.j;
    if (di !== 0 && dj !== 0) return false;
    if (Math.abs(di) + Math.abs(dj) !== 2) return false;
    const bi = cell.i + Math.sign(di);
    const bj = cell.j + Math.sign(dj);
    if (!this.cellOpen(bi, bj)) return false;
    const wx = this.origin.x + bi * CELL;
    const wz = this.origin.z + bj * CELL;
    return !this.bombAt.has(this.blockKey(wx, this.floorY, wz));
  }

  private botPlaceBomb(bot: BotState, cell: Cell, playerCell: Cell): void {
    const bi = cell.i + Math.sign(playerCell.i - cell.i);
    const bj = cell.j + Math.sign(playerCell.j - cell.j);
    const x = this.origin.x + bi * CELL;
    const z = this.origin.z + bj * CELL;
    if (!this.registerBomb(x, this.floorY, z, bot.range, bot.entity)) return;
    bot.cooldown = 4.2 + Math.random() * 2.4;
    this.lastResult = `${bot.name} lights a fuse and runs.`;
    this.game.particles.burst(new THREE.Vector3(x + 0.5, this.floorY + 0.9, z + 0.5), '#ffd27a', 8, {
      speed: 2, life: 0.4, size: 0.08, glow: true,
    });
    const danger = this.dangerCells();
    const from = this.cellOf(bot.entity.position);
    const escape = this.findPath(from, (i, j) => !danger.has(this.cellKey(i, j)) && this.cellOpen(i, j));
    if (escape && escape.length) this.setPath(bot, escape);
  }

  private bombsFor(bot: BotState): number {
    return this.bombs.filter((bomb) => bomb.bot === bot.entity).length;
  }

  private advancePath(bot: BotState): void {
    if (bot.path.length === 0) {
      bot.entity.moveOverride = null;
      return;
    }
    let next = bot.path[0];
    let tx = this.origin.x + next.i * CELL;
    let tz = this.origin.z + next.j * CELL;
    if (Math.hypot(bot.entity.position.x - tx, bot.entity.position.z - tz) < 1.15) {
      bot.path.shift();
      if (bot.path.length === 0) {
        bot.entity.moveOverride = null;
        return;
      }
      next = bot.path[0];
      tx = this.origin.x + next.i * CELL;
      tz = this.origin.z + next.j * CELL;
    }
    bot.entity.moveOverride = { x: tx, z: tz, speed: bot.speed };
  }

  private setPath(bot: BotState, path: Cell[]): void {
    bot.path = path;
    this.advancePath(bot);
  }

  private checkBots(): void {
    for (const bot of this.bots) {
      if (bot.dead || bot.entity.alive) continue;
      bot.dead = true;
      bot.entity.moveOverride = null;
      this.game.recordSim('defend', 'rival', 1);
      const left = this.bots.filter((entry) => !entry.dead).length;
      this.lastResult = left === 0
        ? 'The arena falls quiet. Every rival fuse is out.'
        : `${bot.name} is out. ${left} still breathing.`;
      this.game.toast(left === 0 ? `${bot.name} is out. Arena clear.` : `${bot.name} is out. ${left} rivals left.`, 'good');
      this.game.particles.burst(bot.entity.center.clone(), '#ffb24a', 30, {
        speed: 4.2, life: 0.9, size: 0.12, glow: true,
      });
    }
    if (!this.finished && this.bots.length > 0 && this.bots.every((bot) => bot.dead)) {
      this.finishMatch();
    }
  }

  private finishMatch(): void {
    this.finished = true;
    this.won = true;
    this.maxBombs = Math.max(this.maxBombs, 3);
    this.game.player.addCoins(120);
    this.game.player.addXp(240);
    this.game.recordSim('earn', 'coin', 120);
    this.game.recordSim('defend', 'match', 1);
    this.game.audio.play('quest');
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ffe6a0', 60);
    this.game.hud.showWaveBanner('Cinderburst', 'Last fuse standing', 'Every rival bomber is out', 4.5);
    this.game.toast('Cinderburst won. +120 coins, +240 XP.', 'good');
    this.lastResult = 'Last fuse standing. The powder floor is yours.';
  }

  private resetRound(): void {
    for (const bomb of this.bombs) {
      const def = blockById(this.game.world.getBlock(bomb.x, bomb.y, bomb.z));
      if (def?.key === 'tnt') this.game.world.setBlock(bomb.x, bomb.y, bomb.z, 0, true);
    }
    this.bombs = [];
    this.bombAt.clear();
    for (const bot of this.bots) {
      if (bot.entity.alive) this.game.entities.remove(bot.entity);
    }
    this.bots = [];
    for (const crate of this.initialCrates) {
      const id = this.game.world.getBlock(crate.x, crate.y, crate.z);
      if (!id) this.game.world.setBlock(crate.x, crate.y, crate.z, block('crate').id, true);
    }
    this.crateKeys = new Set(this.initialCrates.map((pos) => this.blockKey(pos.x, pos.y, pos.z)));
    this.maxBombs = 2;
    this.blastRange = 2;
    this.speedLevel = 0;
    this.applySpeed();
    const inventory = this.game.player.inventory;
    for (const key of ['bomb_up', 'blast_core', 'speed_skates']) {
      const count = inventory.count(key);
      if (count > 0) inventory.remove(key, count);
    }
    if (inventory.count('tnt') < 8) inventory.add('tnt', 8 - inventory.count('tnt'));
    this.game.player.refreshHeldItem();
    this.placeCooldown = 0;
    this.powerupTimer = 0;
    this.finished = false;
    this.won = false;
    this.lastResult = 'New round. Three rivals, one powder floor.';
    this.game.player.revive();
    this.game.player.teleport(this.spawn.clone());
    this.game.player.velocity.set(0, 0, 0);
    this.spawnBots();
    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Cinderburst', 'Fuses up', 'New round', 2.8);
    this.game.particles.burst(this.spawn.clone(), '#ffb24a', 26, { speed: 3.6, life: 0.9, size: 0.12, glow: true });
  }

  // ------------------------------------------------------------------- grid

  private cellOpen(i: number, j: number): boolean {
    if (!this.inBounds(i, j)) return false;
    const x = this.origin.x + i * CELL;
    const z = this.origin.z + j * CELL;
    const id = this.game.world.getBlock(x, this.floorY, z);
    return !id;
  }

  private cellKey(i: number, j: number): string {
    return `${i},${j}`;
  }

  private blockKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private cellOf(position: THREE.Vector3): Cell {
    return {
      i: Math.max(MIN_CELL, Math.min(MAX_CELL, Math.round((position.x - this.origin.x) / CELL))),
      j: Math.max(MIN_CELL, Math.min(MAX_CELL, Math.round((position.z - this.origin.z) / CELL))),
    };
  }

  private inBounds(i: number, j: number): boolean {
    return i >= MIN_CELL && i <= MAX_CELL && j >= MIN_CELL && j <= MAX_CELL;
  }

  /** Cell coordinates covered by every burning fuse, used by bot flight. */
  private dangerCells(): Set<string> {
    const danger = new Set<string>();
    for (const bomb of this.bombs) {
      const cell = this.cellOf(new THREE.Vector3(bomb.x, bomb.y, bomb.z));
      danger.add(this.cellKey(cell.i, cell.j));
      const reach = Math.max(1, Math.ceil(bomb.range / CELL));
      for (const [di, dj] of NEIGHBORS) {
        for (let step = 1; step <= reach; step++) {
          const i = cell.i + di * step;
          const j = cell.j + dj * step;
          if (!this.inBounds(i, j)) break;
          danger.add(this.cellKey(i, j));
          if (!this.cellOpen(i, j)) break;
        }
      }
    }
    return danger;
  }

  /** Breadth-first path over open cells; excludes the starting cell from the result. */
  private findPath(from: Cell, goal: (i: number, j: number) => boolean): Cell[] | null {
    const startKey = this.cellKey(from.i, from.j);
    const queue: Cell[] = [{ i: from.i, j: from.j }];
    const prev = new Map<string, string | null>();
    prev.set(startKey, null);
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      if ((current.i !== from.i || current.j !== from.j) && goal(current.i, current.j)) {
        const path: Cell[] = [];
        let key: string | null = this.cellKey(current.i, current.j);
        let guard = 0;
        while (key && key !== startKey && guard++ < 400) {
          const [i, j] = key.split(',').map(Number);
          path.push({ i, j });
          key = prev.get(key) ?? null;
        }
        path.reverse();
        return path;
      }
      for (const [di, dj] of NEIGHBORS) {
        const i = current.i + di;
        const j = current.j + dj;
        const key = this.cellKey(i, j);
        if (prev.has(key)) continue;
        if (!this.cellOpen(i, j)) continue;
        prev.set(key, this.cellKey(current.i, current.j));
        queue.push({ i, j });
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- ambient

  private updateAmbient(dt: number): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 0.2;
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 12;
    const point = new THREE.Vector3(
      this.origin.x + 0.5 + Math.cos(angle) * radius,
      this.floorY + 0.15 + Math.random() * 3,
      this.origin.z + 0.5 + Math.sin(angle) * radius,
    );
    if (point.distanceTo(this.game.player.position) > 42) return;
    this.game.particles.burst(point, Math.random() < 0.35 ? '#ffd27a' : '#ff8a4a', 1, {
      speed: 0.2, life: 1.6 + Math.random(), size: 0.055, gravity: -0.55,
      drag: 0.99, glow: true, spread: 0.35, upward: 0.25,
    });
  }
}
