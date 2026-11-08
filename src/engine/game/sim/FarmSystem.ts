import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { block, blockById } from '../../world/Blocks';
import { ITEM_BY_KEY, type ItemDef } from '../../../content/Recipes';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { blockCenter, formatCoins, giveItem, pick, randomInt, scanBlocks } from './SimUtils';

interface CropInfo {
  key: string;
  label: string;
  seed: string;
  produce: string;
  stageSeconds: [number, number];
  yieldMin: number;
  yieldMax: number;
  color: string;
}

const CROPS: Record<string, CropInfo> = {
  wheat: { key: 'wheat', label: 'Wheat', seed: 'wheat_seeds', produce: 'wheat', stageSeconds: [34, 40], yieldMin: 2, yieldMax: 4, color: '#d9b64e' },
  carrot: { key: 'carrot', label: 'Carrot', seed: 'carrot_seeds', produce: 'carrot', stageSeconds: [30, 36], yieldMin: 2, yieldMax: 4, color: '#e5853a' },
  potato: { key: 'potato', label: 'Potato', seed: 'potato_seeds', produce: 'potato', stageSeconds: [32, 38], yieldMin: 2, yieldMax: 5, color: '#c9a76a' },
  tomato: { key: 'tomato', label: 'Tomato', seed: 'tomato_seeds', produce: 'tomato', stageSeconds: [36, 42], yieldMin: 1, yieldMax: 3, color: '#d4553c' },
};

const SEED_TO_CROP = new Map<string, CropInfo>();
const PRODUCE_TO_CROP = new Map<string, CropInfo>();
const CROP_BLOCK_INFO = new Map<string, { info: CropInfo; stage: number }>();
for (const info of Object.values(CROPS)) {
  SEED_TO_CROP.set(info.seed, info);
  PRODUCE_TO_CROP.set(info.produce, info);
  for (let stage = 0; stage < 3; stage++) CROP_BLOCK_INFO.set(`${info.key}_crop_${stage}`, { info, stage });
}

const PRODUCE_PRICES: Record<string, number> = {
  wheat: 3,
  carrot: 4,
  potato: 3,
  tomato: 5,
  egg: 4,
  milk: 5,
  cheese: 8,
  butter: 6,
  wool_white: 6,
  pumpkin: 5,
  melon: 6,
  honeycomb: 7,
};

const REQUEST_ITEMS = ['wheat', 'carrot', 'potato', 'tomato', 'egg', 'milk', 'wool_white'];

const ANIMAL_PRODUCTS: Record<string, { item: string; label: string; seconds: number; count: [number, number] }> = {
  'creature:chicken': { item: 'egg', label: 'eggs', seconds: 85, count: [1, 2] },
  'creature:cow': { item: 'milk', label: 'milk', seconds: 110, count: [1, 2] },
  'creature:sheep': { item: 'wool_white', label: 'wool', seconds: 125, count: [1, 2] },
};

interface CropState {
  info: CropInfo;
  stage: number;
  timer: number;
  x: number;
  y: number;
  z: number;
}

interface FarmRequest {
  item: string;
  count: number;
  reward: number;
}

/**
 * Willow Creek's farming loop: till soil with a hoe, plant seed by seed,
 * water-adjacent plots grow faster, animals supply eggs and milk, the shipping
 * bin turns produce into coins, and each morning brings a new village request.
 */
export class FarmSystem implements SimSystem {
  readonly kind = 'farm' as const;

  private game: Game;
  private requestGiverId: string;
  private requestGiverName = 'Berta';
  private crops = new Map<string, CropState>();
  private watered = new Set<string>();
  private animalReady = new Map<string, number>();
  private request: FarmRequest | null = null;
  private requestDone = false;
  private lastDay = 1;
  private shipped = 0;
  private shippedValue = 0;
  private lastResult = 'The fields are quiet. The day is yours.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.requestGiverId = spec.requestGiverId ?? 'berta';
    this.lastDay = game.dayCount;

    const giver = game.entities?.entities.find((e) => e.id === this.requestGiverId);
    if (giver) this.requestGiverName = giver.displayName;

    const keys = ['water', ...CROP_BLOCK_INFO.keys()];
    const found = scanBlocks(game, keys, 46, 12);
    for (const pos of found.get('water') ?? []) this.markWater(pos.x, pos.z);
    for (const [key, blocks] of found) {
      const info = CROP_BLOCK_INFO.get(key);
      if (!info) continue;
      for (const pos of blocks) this.addCrop(info.info, info.stage, pos.x, pos.y, pos.z);
    }
    this.rollRequest();
  }

  update(dt: number): void {
    if (this.game.dayCount !== this.lastDay) {
      this.lastDay = this.game.dayCount;
      this.onNewDay();
    }

    for (const [id, cooldown] of this.animalReady) {
      if (cooldown <= dt) this.animalReady.delete(id);
      else this.animalReady.set(id, cooldown - dt);
    }

    for (const [key, crop] of [...this.crops]) {
      if (crop.stage >= 2) continue;
      const def = blockById(this.game.world.getBlock(crop.x, crop.y, crop.z));
      if (!def.key.startsWith(`${crop.info.key}_crop_`)) {
        this.crops.delete(key);
        continue;
      }
      crop.timer += dt * (this.watered.has(`${crop.x},${crop.z}`) ? 1.65 : 1);
      if (crop.timer < crop.info.stageSeconds[crop.stage]) continue;
      crop.timer = 0;
      crop.stage += 1;
      this.writeCrop(crop);
      if (crop.stage === 2 && this.playerNear(crop.x, crop.z, 14)) {
        this.game.particles.sparkle(blockCenter(crop).add(new THREE.Vector3(0, 0.5, 0)), crop.info.color, 5);
      }
    }
  }

  hud(): SimHud {
    const total = this.crops.size;
    const ripe = [...this.crops.values()].filter((crop) => crop.stage >= 2).length;
    const animals = this.animalEntities();
    const ready = animals.filter((entity) => !this.animalReady.has(entity.id)).length;
    const requestName = this.request ? itemName(this.request.item) : 'None';
    const canSleep = this.canSleep();
    return {
      kicker: 'Willow Creek',
      title: 'Farm ledger',
      rows: [
        { label: 'Day', value: `${this.game.dayCount} · ${this.clock()}`, tone: canSleep ? 'warn' : undefined },
        { label: 'Crops', value: `${ripe} / ${total} ripe`, tone: ripe > 0 ? 'good' : undefined },
        { label: 'Animals', value: `${ready} / ${animals.length} ready` },
        { label: 'Request', value: this.request ? `${this.request.count}× ${requestName}${this.requestDone ? ' ✓' : ''}` : '—', tone: this.requestDone ? 'good' : undefined },
        { label: 'Shipped', value: `${this.shipped} items · ${formatCoins(this.shippedValue)}` },
      ],
      progress: total > 0 ? { label: 'Ripe crops', value: ripe, max: total } : undefined,
      actions: [
        {
          id: 'sleep',
          label: canSleep ? 'Sleep until morning' : 'Sleep (from 17:00)',
          disabled: !canSleep,
          hotkey: 'KeyT',
        },
      ],
      footer: `${this.lastResult} Till soil with the hoe · plant seeds on farmland · harvest ripe crops · ship produce in the bin · tend animals.`,
    };
  }

  interactBlock(key: string, x: number, y: number, z: number): boolean {
    const held = this.game.player.inventory.selectedDef;

    if (CROP_BLOCK_INFO.has(key)) {
      this.harvestAt(key, x, y, z);
      return true;
    }

    if (key === 'farmland') {
      this.plant(x, y, z, held);
      return true;
    }

    if (key === 'shipping_bin') {
      this.ship(held);
      return true;
    }

    if (key === 'bed') {
      this.sleep();
      return true;
    }

    if ((key === 'grass_block' || key === 'dirt' || key === 'dirt_path') && held?.toolType === 'hoe') {
      this.till(x, y, z);
      return true;
    }

    return false;
  }

  interactEntity(entity: GameEntity): boolean {
    if (entity.id === this.requestGiverId) {
      // Only intercept the click when there is a delivery to make. Otherwise
      // fall through so the normal dialogue (quest accept and turn-in) opens.
      const ready = !!this.request
        && !this.requestDone
        && this.game.player.inventory.count(this.request.item) >= this.request.count;
      if (!ready) return false;
      this.deliverRequest();
      return true;
    }

    const product = ANIMAL_PRODUCTS[entity.def.key];
    if (!product) return false;

    const cooldown = this.animalReady.get(entity.id) ?? 0;
    if (cooldown > 0) {
      this.game.toast(`${entity.displayName} is resting. Try again in ${Math.ceil(cooldown)}s.`, 'info');
      return true;
    }

    const amount = randomInt(product.count[0], product.count[1]);
    giveItem(this.game, product.item, amount, entity.center.clone());
    this.game.player.addXp(5);
    this.game.recordSim('tend', entity.def.key, 1);
    this.animalReady.set(entity.id, product.seconds);
    this.game.particles.sparkle(entity.center.clone(), '#f4e6b0', 9);
    this.game.audio.play('pickup');
    this.lastResult = `${entity.displayName} gave ${amount} ${product.label}.`;
    this.game.toast(`${entity.displayName} · +${amount} ${itemName(product.item)}`, 'good');
    return true;
  }

  hintForBlock(key: string): string | null {
    const held = this.game.player.inventory.selectedDef;
    if (CROP_BLOCK_INFO.has(key)) {
      const info = CROP_BLOCK_INFO.get(key)!;
      return info.stage >= 2
        ? `<b>${info.info.label}</b> · ripe, right-click to harvest`
        : `<b>${info.info.label}</b> · growing (stage ${info.stage + 1}/3)`;
    }
    if (key === 'farmland') {
      const crop = held ? SEED_TO_CROP.get(held.key) ?? PRODUCE_TO_CROP.get(held.key) : undefined;
      return crop
        ? `<b>Farmland</b> · right-click to plant <b>${crop.label}</b>`
        : '<b>Farmland</b> · hold seeds to plant a crop';
    }
    if (key === 'shipping_bin') {
      const count = this.produceCount(held);
      return count > 0
        ? `<b>Shipping Bin</b> · right-click to sell ${count} produce`
        : '<b>Shipping Bin</b> · hold produce to sell it';
    }
    if (key === 'bed') {
      return this.canSleep()
        ? '<b>Farm Bed</b> · right-click to sleep until morning'
        : '<b>Farm Bed</b> · sleep after 17:00';
    }
    if ((key === 'grass_block' || key === 'dirt' || key === 'dirt_path') && held?.toolType === 'hoe') {
      return '<b>Soil</b> · right-click to till with the hoe';
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    if (entity.id === this.requestGiverId) {
      if (!this.request) return `<b>${entity.displayName}</b> · no request today`;
      if (this.requestDone) return `<b>${entity.displayName}</b> · request delivered ✓`;
      const have = this.game.player.inventory.count(this.request.item);
      return `<b>${entity.displayName}</b> wants <b>${this.request.count}× ${itemName(this.request.item)}</b> · ${have}/${this.request.count}`;
    }
    const product = ANIMAL_PRODUCTS[entity.def.key];
    if (!product) return null;
    const cooldown = this.animalReady.get(entity.id) ?? 0;
    return cooldown > 0
      ? `<b>${entity.displayName}</b> · resting ${Math.ceil(cooldown)}s`
      : `<b>${entity.displayName}</b> · right-click to collect ${product.label}`;
  }

  onBlockBroken(key: string, x: number, y: number, z: number): boolean {
    const cropInfo = CROP_BLOCK_INFO.get(key);
    if (cropInfo) {
      const crop = this.crops.get(this.posKey(x, y, z));
      const stage = crop?.stage ?? cropInfo.stage;
      const info = crop?.info ?? cropInfo.info;
      this.crops.delete(this.posKey(x, y, z));
      if (stage >= 2) {
        const amount = randomInt(info.yieldMin, info.yieldMax);
        giveItem(this.game, info.produce, amount, blockCenter({ x, y, z }));
        this.game.recordSim('harvest', info.key, amount);
        this.lastResult = `A ripe ${info.label.toLowerCase()} plant was knocked loose.`;
      } else {
        giveItem(this.game, info.seed, 1, blockCenter({ x, y, z }));
      }
      return true;
    }
    if (key === 'farmland') {
      giveItem(this.game, 'dirt', 1, blockCenter({ x, y, z }));
      return true;
    }
    return false;
  }

  action(id: string): void {
    if (id === 'sleep') this.sleep();
  }

  dispose(): void {
    this.crops.clear();
    this.watered.clear();
    this.animalReady.clear();
  }

  private plant(x: number, y: number, z: number, held?: ItemDef): void {
    const info = held ? SEED_TO_CROP.get(held.key) ?? PRODUCE_TO_CROP.get(held.key) : undefined;
    const above = this.game.world.getBlock(x, y + 1, z);
    if (!info) {
      this.game.toast('Hold seeds and right-click farmland to plant.', 'info');
      return;
    }
    if (blockById(above).solid) {
      this.game.toast('There is something in the way.', 'warn');
      return;
    }
    if (!this.game.player.inventory.remove(held!.key, 1)) {
      this.game.toast(`You are out of ${held!.name}.`, 'warn');
      return;
    }

    const crop: CropState = { info, stage: 0, timer: 0, x, y: y + 1, z };
    this.crops.set(this.posKey(crop.x, crop.y, crop.z), crop);
    this.writeCrop(crop);
    this.game.audio.play('place');
    this.game.particles.sparkle(blockCenter({ x, y: y + 1, z: z }), info.color, 6);
    this.game.toast(`Planted ${info.label.toLowerCase()} seeds.`, 'good');
    this.lastResult = `Planted ${info.label.toLowerCase()} on the ${this.watered.has(`${x},${z}`) ? 'watered' : 'dry'} field.`;
  }

  private harvestAt(key: string, x: number, y: number, z: number): void {
    const found = CROP_BLOCK_INFO.get(key)!;
    const mapKey = this.posKey(x, y, z);
    let crop = this.crops.get(mapKey);
    if (!crop) {
      crop = { info: found.info, stage: found.stage, timer: 0, x, y, z };
      this.crops.set(mapKey, crop);
    }
    if (crop.stage < 2) {
      const needed = crop.info.stageSeconds[crop.stage];
      const left = Math.max(1, Math.ceil((needed - crop.timer) * (this.watered.has(`${x},${z}`) ? 0.6 : 1)));
      this.game.toast(`${crop.info.label} is still growing. About ${left}s to the next stage.`, 'info');
      return;
    }

    const amount = randomInt(crop.info.yieldMin, crop.info.yieldMax);
    giveItem(this.game, crop.info.produce, amount, blockCenter({ x, y, z }));
    if (Math.random() < 0.45) giveItem(this.game, crop.info.seed, 1, blockCenter({ x, y, z }));
    this.game.world.setBlock(x, y, z, 0);
    this.crops.delete(mapKey);
    this.game.recordSim('harvest', crop.info.key, amount);
    this.game.player.addXp(4);
    this.game.audio.play('pickup');
    this.game.particles.sparkle(blockCenter({ x, y, z }), crop.info.color, 10);
    this.game.toast(`Harvested ${amount}× ${itemName(crop.info.produce)}.`, 'good');
    this.lastResult = `Harvested ${amount}× ${itemName(crop.info.produce)}.`;
  }

  private till(x: number, y: number, z: number): void {
    if (blockById(this.game.world.getBlock(x, y + 1, z)).solid) {
      this.game.toast('Clear the space above the soil first.', 'warn');
      return;
    }
    const above = this.game.world.getBlock(x, y + 1, z);
    if (above !== 0) this.game.world.setBlock(x, y + 1, z, 0);
    this.game.world.setBlock(x, y, z, block('farmland').id);
    this.game.audio.play('place');
    this.game.particles.dust(blockCenter({ x, y, z }), '#6b4a2e', 8);
    this.game.toast('Tilled the soil. Plant seeds on it.', 'good');
    this.lastResult = 'Tilled another row of soil.';
  }

  private ship(held?: ItemDef): void {
    const inv = this.game.player.inventory;
    const entries: Array<[string, number]> = [];
    if (held && PRODUCE_PRICES[held.key]) {
      const count = inv.count(held.key);
      if (count > 0) entries.push([held.key, count]);
    } else {
      for (const item of Object.keys(PRODUCE_PRICES)) {
        const count = inv.count(item);
        if (count > 0) entries.push([item, count]);
      }
    }
    if (!entries.length) {
      this.game.toast('The shipping bin is empty. Hold produce to sell it.', 'warn');
      this.game.audio.play('error');
      return;
    }

    let total = 0;
    let count = 0;
    for (const [item, amount] of entries) {
      if (!inv.remove(item, amount)) continue;
      total += PRODUCE_PRICES[item] * amount;
      count += amount;
      this.game.recordSim('sell', item, amount);
    }
    if (!count) return;
    this.game.player.addCoins(total);
    this.game.recordSim('earn', 'coin', total);
    this.shipped += count;
    this.shippedValue += total;
    this.lastResult = `Shipped ${count} produce for ${formatCoins(total)}.`;
    this.game.audio.play('pickup');
    this.game.toast(`Shipped ${count} produce · +${formatCoins(total)}`, 'good');
  }

  private deliverRequest(): void {
    if (!this.request) {
      this.game.toast(`${this.requestGiverName} has no request today.`, 'info');
      return;
    }
    if (this.requestDone) {
      this.game.toast(`${this.requestGiverName} already has today's delivery. Come back tomorrow.`, 'info');
      return;
    }
    const have = this.game.player.inventory.count(this.request.item);
    if (have < this.request.count) {
      this.game.toast(`${this.requestGiverName} needs ${this.request.count}× ${itemName(this.request.item)} · you have ${have}.`, 'warn');
      return;
    }
    if (!this.game.player.inventory.remove(this.request.item, this.request.count)) return;
    this.game.player.addCoins(this.request.reward);
    this.game.player.addXp(20);
    this.game.recordSim('sell', this.request.item, this.request.count);
    this.game.recordSim('earn', 'coin', this.request.reward);
    this.requestDone = true;
    this.game.audio.play('quest');
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#f7d06a', 12);
    this.game.toast(`${this.requestGiverName} · +${formatCoins(this.request.reward)} for ${this.request.count}× ${itemName(this.request.item)}`, 'good');
    this.lastResult = `Delivered ${this.request.count}× ${itemName(this.request.item)} to ${this.requestGiverName}.`;
  }

  private sleep(): void {
    if (!this.canSleep()) {
      this.game.toast('The sun is still up. Sleep after 17:00, or wait for dusk.', 'info');
      this.game.audio.play('error');
      return;
    }
    this.game.player.heal(4);
    this.game.audio.play('checkpoint');
    this.game.advanceToMorning();
    this.lastResult = 'Slept through the night. The crops grew while you dreamed.';
  }

  private canSleep(): boolean {
    const time = this.game.sky.time;
    return time >= 17 || time < 4.5;
  }

  private onNewDay(): void {
    this.rollRequest();
    this.animalReady.clear();
    // A night under the sky advances every growing crop by one stage.
    for (const crop of this.crops.values()) {
      if (crop.stage >= 2) continue;
      crop.stage += 1;
      crop.timer = 0;
      this.writeCrop(crop);
    }
    this.lastResult = `Day ${this.game.dayCount}. ${this.requestGiverName} has a fresh request.`;
    // Persist the overnight growth and new request even when the day rolled
    // over naturally at midnight (the engine's own save ran a tick earlier).
    this.game.saveGame(false);
  }

  private rollRequest(): void {
    const item = pick(REQUEST_ITEMS);
    const count = randomInt(2, 5);
    const base = PRODUCE_PRICES[item] ?? 3;
    this.request = { item, count, reward: count * base * 2 + 8 };
    this.requestDone = false;
  }

  private writeCrop(crop: CropState): void {
    this.game.world.setBlock(crop.x, crop.y, crop.z, block(`${crop.info.key}_crop_${crop.stage}`).id);
  }

  private addCrop(info: CropInfo, stage: number, x: number, y: number, z: number): void {
    this.crops.set(this.posKey(x, y, z), { info, stage, timer: 0, x, y, z });
  }

  private markWater(x: number, z: number): void {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) this.watered.add(`${x + dx},${z + dz}`);
    }
  }

  private animalEntities(): GameEntity[] {
    if (!this.game.entities) return [];
    return this.game.entities.entities.filter((entity) => entity.alive && !!ANIMAL_PRODUCTS[entity.def.key]);
  }

  private produceCount(held?: ItemDef): number {
    const inv = this.game.player.inventory;
    if (held && PRODUCE_PRICES[held.key]) return inv.count(held.key);
    return Object.keys(PRODUCE_PRICES).reduce((sum, item) => sum + inv.count(item), 0);
  }

  private playerNear(x: number, z: number, radius: number): boolean {
    const p = this.game.player.position;
    return Math.hypot(p.x - x, p.z - z) <= radius;
  }

  private posKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private clock(): string {
    const hours = this.game.sky.time;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

function itemName(key: string): string {
  return ITEM_BY_KEY.get(key)?.name ?? key;
}
