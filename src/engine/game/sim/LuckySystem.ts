import * as THREE from 'three';
import type { Game } from '../Game';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { block, blockById } from '../../world/Blocks';
import { giveItem, pick, randomInt, scanBlocks, type BlockPos } from './SimUtils';

interface Respawn {
  position: BlockPos;
  remaining: number;
}

const MOBS = ['creature:slime', 'creature:spider', 'creature:mushroomling', 'creature:scorpion', 'creature:magma_slime'];
const LOOT = ['diamond', 'emerald', 'gold_ingot', 'iron_ingot', 'crystal_shard', 'rune_stone', 'golden_apple'];
const FOOD = ['cooked_beef', 'bread', 'cake_slice', 'burger', 'golden_apple', 'ramen'];

/**
 * Lucky-block gauntlet: every golden block rolls a reward, every cursed block
 * rolls a consequence, and broken lucky blocks eventually respawn so a run can
 * always reach its target.
 */
export class LuckySystem implements SimSystem {
  readonly kind = 'lucky' as const;

  private game: Game;
  private spec: SimSpec;
  private luckyBlocks: BlockPos[] = [];
  private cursedBlocks: BlockPos[] = [];
  private respawns: Respawn[] = [];
  private opened = 0;
  private cursedOpened = 0;
  private jackpots = 0;
  private fortune = 0;
  private monsters = 0;
  private lastResult = 'The arena is waiting. Pick a block.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.spec = spec;
    const found = scanBlocks(game, ['lucky_block', 'cursed_lucky_block'], 64, 24);
    this.luckyBlocks = found.get('lucky_block') ?? [];
    this.cursedBlocks = found.get('cursed_lucky_block') ?? [];
  }

  update(dt: number): void {
    for (const respawn of [...this.respawns]) {
      respawn.remaining -= dt;
      if (respawn.remaining > 0) continue;
      this.respawns = this.respawns.filter((r) => r !== respawn);
      const current = this.game.world.getBlock(respawn.position.x, respawn.position.y, respawn.position.z);
      if (current !== 0) continue;
      this.game.world.setBlock(respawn.position.x, respawn.position.y, respawn.position.z, block('lucky_block').id, true);
      this.game.particles.sparkle(new THREE.Vector3(respawn.position.x + 0.5, respawn.position.y + 0.7, respawn.position.z + 0.5), '#ffe08a', 14);
    }
  }

  hud(): SimHud {
    const target = this.spec.targetOpen ?? 10;
    const loose = this.game.entities.entities.filter((entity) => entity.alive && MOBS.includes(entity.def.key)).length;
    return {
      kicker: 'Lucky arena',
      title: 'Fortune Favours the Bold',
      rows: [
        { label: 'Blocks opened', value: `${this.opened} / ${target}`, tone: this.opened >= target ? 'good' : undefined },
        { label: 'Cursed opened', value: String(this.cursedOpened), tone: this.cursedOpened > 0 ? 'warn' : undefined },
        { label: 'Fortune', value: `${Math.round(this.fortune)}%`, tone: this.fortune >= 80 ? 'good' : this.fortune < 25 ? 'bad' : undefined },
        { label: 'Monsters loose', value: String(loose) },
      ],
      progress: { label: 'Fortune charge', value: this.fortune, max: 100 },
      actions: [],
      footer: this.lastResult,
    };
  }

  interactBlock(): boolean {
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string): string | null {
    if (key === 'lucky_block') return '<b>Lucky Block</b> · break it for a prize';
    if (key === 'cursed_lucky_block') return '<b>Cursed Lucky Block</b> · break it if you dare';
    return null;
  }

  hintForEntity(): string | null {
    return null;
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    if (key !== 'lucky_block' && key !== 'cursed_lucky_block') return false;
    const position = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    this.game.recordSim('open', key, 1);
    if (key === 'lucky_block') {
      this.opened += 1;
      this.fortune = Math.min(100, this.fortune + 11);
      this.luckyBlocks = this.luckyBlocks.filter((b) => b.x !== x || b.y !== y || b.z !== z);
      this.respawns.push({ position: { x, y, z }, remaining: 26 });
      this.rollLucky(position);
    } else {
      this.cursedOpened += 1;
      this.fortune = Math.max(0, this.fortune - 28);
      this.cursedBlocks = this.cursedBlocks.filter((b) => b.x !== x || b.y !== y || b.z !== z);
      this.rollCursed(position);
    }
    this.game.particles.burst(position, key === 'lucky_block' ? '#ffd35a' : '#b26be0', 24, { speed: 4.5, glow: true });
    return true;
  }

  action(): void {
    /* The arena is played with the pickaxe, not with HUD buttons. */
  }

  dispose(): void {
    this.respawns = [];
  }

  private rollLucky(position: THREE.Vector3): void {
    if (this.fortune >= 100) {
      this.fortune = 0;
      this.jackpot(position);
      return;
    }
    const roll = Math.random();
    if (roll < 0.02) this.jackpot(position);
    else if (roll < 0.38) this.coinReward(position);
    else if (roll < 0.56) this.itemReward(position);
    else if (roll < 0.66) this.foodReward(position);
    else if (roll < 0.73) this.weaponReward(position);
    else if (roll < 0.84) this.mobAmbush(position);
    else if (roll < 0.92) this.explosion(position);
    else if (roll < 0.98) this.healReward(position);
    else this.empty(position);
  }

  private rollCursed(position: THREE.Vector3): void {
    const roll = Math.random();
    if (roll < 0.32) this.explosion(position, true);
    else if (roll < 0.66) this.mobAmbush(position, true);
    else if (roll < 0.76) this.cursedTax(position);
    else if (roll < 0.86) this.empty(position, true);
    else this.weaponReward(position, true);
  }

  private coinReward(position: THREE.Vector3): void {
    const amount = randomInt(14, 38);
    this.game.player.addCoins(amount);
    this.game.recordSim('earn', 'coin', amount);
    this.setResult(`Coins spill out of the block: +${amount}c.`, 'good');
    this.game.audio.play('pickup');
    this.game.particles.sparkle(position, '#ffd35a', 16);
  }

  private itemReward(position: THREE.Vector3): void {
    const item = pick(LOOT);
    const count = item === 'diamond' || item === 'crystal_shard' || item === 'rune_stone' ? randomInt(1, 3) : randomInt(2, 5);
    giveItem(this.game, item, count, position);
    const name = item === 'diamond' ? 'diamonds' : item.replace(/_/g, ' ');
    this.setResult(`The block coughs up ${count}× ${name}.`, 'good');
    this.game.audio.play('pickup');
  }

  private foodReward(position: THREE.Vector3): void {
    const item = pick(FOOD);
    giveItem(this.game, item, randomInt(1, 3), position);
    this.setResult(`Still warm: ${item.replace(/_/g, ' ')}.`, 'good');
    this.game.audio.play('eat');
  }

  private weaponReward(position: THREE.Vector3, cursed = false): void {
    if (this.game.player.inventory.count('lucky_sword') === 0) {
      giveItem(this.game, 'lucky_sword', 1, position);
      this.setResult(cursed ? 'A cursed blade chooses you. It still cuts.' : 'Fortune\'s Edge rises from the block!', cursed ? 'warn' : 'good');
      this.game.audio.play('levelup');
      return;
    }
    const amount = randomInt(35, 60);
    this.game.player.addCoins(amount);
    this.game.recordSim('earn', 'coin', amount);
    this.setResult(`A duplicate blade dissolves into ${amount} coins.`, 'good');
    this.game.audio.play('pickup');
  }

  private mobAmbush(position: THREE.Vector3, cursed = false): void {
    const count = randomInt(2, cursed ? 4 : 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.2 + Math.random() * 2.2;
      const spawn = new THREE.Vector3(
        position.x + Math.cos(angle) * radius,
        position.y + 0.6,
        position.z + Math.sin(angle) * radius,
      );
      const mob = this.game.entities.spawn(pick(MOBS), spawn, { exactY: false });
      if (mob) this.monsters += 1;
    }
    const messages = ['Something is loose.', 'The block was full of teeth.', 'You hear claws on stone.'];
    this.setResult(`${pick(messages)} ${count} hostiles spawned.`, 'bad');
    this.game.audio.play('wave');
    this.game.particles.burst(position, '#b04a8a', 18, { speed: 4.2 });
  }

  private explosion(position: THREE.Vector3, cursed = false): void {
    this.game.particles.burst(position, '#ff9a4a', 32, { speed: 6, gravity: -6 });
    this.game.particles.dust(position, '#6b5a4a', 16);
    this.game.audio.play('explode');
    const damage = cursed ? randomInt(8, 14) : randomInt(4, 9);
    const player = this.game.player;
    if (player.position.distanceTo(position) < 7) {
      player.damage(damage, cursed ? 'a cursed lucky block' : 'a lucky explosion');
      player.velocity.y = Math.max(player.velocity.y, 3.5);
      this.setResult(cursed ? `The cursed block detonates. −${damage} health.` : `An explosive surprise. −${damage} health.`, 'bad');
    } else {
      this.setResult(cursed ? 'The cursed block detonates harmlessly in the ring.' : 'A block detonates in a shower of sparks.', 'warn');
    }
  }

  private healReward(position: THREE.Vector3): void {
    this.game.player.heal(12);
    giveItem(this.game, 'golden_apple', 1, position);
    this.setResult('Warm golden light. +12 health and a golden apple.', 'good');
    this.game.audio.play('levelup');
    this.game.particles.sparkle(position, '#9cf7bc', 20);
  }

  private empty(position: THREE.Vector3, cursed = false): void {
    this.setResult(cursed ? 'The cursed block was empty. Somehow that is worse.' : 'The block was empty. Rude.', 'warn');
    this.game.audio.play('error');
  }

  private cursedTax(position: THREE.Vector3): void {
    const amount = Math.min(this.game.player.coins, randomInt(8, 18));
    if (amount <= 0) {
      this.setResult('The block tries to tax you and finds nothing.', 'warn');
      return;
    }
    this.game.player.addCoins(-amount);
    this.setResult(`The block collects a toll: −${amount}c.`, 'bad');
    this.game.audio.play('hurt');
    this.game.particles.sparkle(position, '#b26be0', 10);
  }

  private jackpot(position: THREE.Vector3): void {
    this.jackpots += 1;
    const coins = randomInt(90, 150);
    this.game.player.addCoins(coins);
    this.game.recordSim('earn', 'coin', coins);
    giveItem(this.game, 'diamond', 3, position);
    giveItem(this.game, 'lucky_coin', 2, position);
    this.setResult(`JACKPOT! +${coins}c, 3 diamonds and 2 lucky coins.`, 'good');
    this.game.audio.play('win');
    this.game.particles.sparkle(position, '#fff3a8', 40);
    this.game.toast('Lucky jackpot!', 'good');
  }

  private setResult(message: string, tone: 'good' | 'warn' | 'bad'): void {
    this.lastResult = message;
    this.game.toast(message, tone === 'good' ? 'good' : tone === 'warn' ? 'warn' : 'bad');
  }
}
