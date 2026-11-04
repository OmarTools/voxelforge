import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { ITEM_BY_KEY } from '../../../content/Recipes';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { blockCenter, formatCoins, nearestBlock, pick, randomInt, scanBlocks, type BlockPos } from './SimUtils';

interface StoreProduct {
  item: string;
  price: number;
  wholesale: number;
}

export const STORE_PRODUCTS: Record<string, StoreProduct> = {
  bread: { item: 'bread', price: 8, wholesale: 3 },
  apple: { item: 'apple', price: 5, wholesale: 2 },
  torch: { item: 'torch', price: 6, wholesale: 2 },
  soap: { item: 'soap', price: 15, wholesale: 6 },
  candle: { item: 'candle', price: 17, wholesale: 7 },
  soda: { item: 'soda', price: 9, wholesale: 4 },
  snack_bar: { item: 'snack_bar', price: 9, wholesale: 4 },
  toy_car: { item: 'toy_car', price: 24, wholesale: 10 },
  lucky_coin: { item: 'lucky_coin', price: 52, wholesale: 22 },
};

const CUSTOMER_KEYS = ['human:adventurer', 'human:villager_farmer', 'human:guard_city', 'human:snow_hunter', 'human:desert_nomad', 'human:mage_arcane'];
const CUSTOMER_NAMES = ['Edda', 'Corin', 'Mabel', 'Rook', 'Sana', 'Bex', 'Otto', 'Lila', 'Fenn', 'Greta', 'Ash', 'Nim'];
const CAPACITY = 12;
const RESTOCK_AMOUNT = 5;

interface ShelfStock {
  product: StoreProduct;
  stock: number;
}

interface ShopCustomer {
  serial: number;
  entityId: string;
  name: string;
  product: StoreProduct;
  patience: number;
  maxPatience: number;
}

/**
 * Shop management loop: keep shelves stocked, read the chalkboard special and
 * serve customers before they give up and walk out.
 */
export class StoreSystem implements SimSystem {
  readonly kind = 'store' as const;

  private game: Game;
  private spec: SimSpec;
  private shelves: BlockPos[] = [];
  private chalkboards: BlockPos[] = [];
  private counters: BlockPos[] = [];
  private stock: ShelfStock[];
  private customers: ShopCustomer[] = [];
  private spawnTimer = 3;
  private serial = 0;
  private sales = 0;
  private revenue = 0;
  private missed = 0;
  private reputation = 70;
  private specialIndex = 0;
  private specialSales = 0;
  private lastResult = 'The bell over the door is quiet.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.spec = spec;
    const found = scanBlocks(game, ['store_shelf', 'chalkboard', 'counter'], 58, 18);
    this.shelves = found.get('store_shelf') ?? [];
    this.chalkboards = found.get('chalkboard') ?? [];
    this.counters = found.get('counter') ?? [];
    const allowed = (spec.products?.length ? spec.products : Object.keys(STORE_PRODUCTS))
      .map((id) => STORE_PRODUCTS[id])
      .filter((product): product is StoreProduct => !!product && !!ITEM_BY_KEY.get(product.item));
    this.stock = (allowed.length ? allowed : Object.values(STORE_PRODUCTS)).map((product) => ({ product, stock: 6 }));
    this.specialIndex = randomInt(0, Math.max(0, this.stock.length - 1));
  }

  update(dt: number): void {
    for (const customer of [...this.customers]) {
      customer.patience -= dt;
      if (customer.patience > 0) continue;
      this.removeCustomer(customer);
      this.customers = this.customers.filter((c) => c !== customer);
      this.missed += 1;
      this.reputation = Math.max(10, this.reputation - 5);
      this.game.audio.play('error');
      this.game.toast(`${customer.name} gave up waiting and left.`, 'bad');
    }

    if (this.customers.length < (this.spec.maxCustomers ?? 5)) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spec.spawnEvery ?? 9;
        this.spawnCustomer();
      }
    }
  }

  hud(): SimHud {
    const totalStock = this.stock.reduce((sum, entry) => sum + entry.stock, 0);
    const special = this.specialProduct();
    const low = this.lowStock().slice(0, 3);
    return {
      kicker: 'Shop floor',
      title: 'Corner & Candle',
      rows: [
        { label: 'Customers', value: String(this.customers.length), tone: this.customers.length >= 4 ? 'warn' : undefined },
        { label: 'Reputation', value: `${Math.round(this.reputation)}%`, tone: this.reputation < 45 ? 'bad' : this.reputation > 80 ? 'good' : undefined },
        { label: 'Special', value: special ? `${itemName(special.product.item)} ×1.5` : 'None', tone: 'good' },
        { label: 'Shelves', value: `${totalStock} / ${this.stock.length * CAPACITY} units` },
      ],
      progress: { label: 'Stock level', value: totalStock, max: Math.max(1, this.stock.length * CAPACITY) },
      actions: low.map((entry) => {
        const added = Math.min(RESTOCK_AMOUNT, CAPACITY - entry.stock);
        const cost = Math.max(1, Math.ceil(entry.product.wholesale * added));
        return {
          id: `restock:${entry.product.item}`,
          label: `Restock ${itemName(entry.product.item)} +${added} · ${formatCoins(cost)}`,
          disabled: this.game.player.coins < cost,
        };
      }),
      footer: this.shelves.length
        ? 'Right-click a shelf to restock the emptiest line. Right-click the chalkboard to rotate the special.'
        : 'No shelves found in this shop.',
    };
  }

  interactBlock(key: string): boolean {
    if (key === 'store_shelf') {
      const low = this.lowStock()[0];
      if (!low) {
        this.game.toast('Every shelf is already full.', 'info');
        return true;
      }
      this.restock(low.product.item);
      return true;
    }
    if (key === 'chalkboard') {
      this.rotateSpecial();
      return true;
    }
    if (key === 'counter') {
      if (this.customers.length >= (this.spec.maxCustomers ?? 5)) {
        this.game.toast('The queue is already at the counter.', 'warn');
        return true;
      }
      this.spawnCustomer();
      this.game.audio.play('click');
      return true;
    }
    return false;
  }

  interactEntity(entity: GameEntity): boolean {
    const customer = this.customers.find((c) => c.entityId === entity.id);
    if (!customer) return false;
    const shelf = this.stock.find((entry) => entry.product.item === customer.product.item);
    if (!shelf || shelf.stock <= 0) {
      this.game.toast(`${itemName(customer.product.item)} is sold out. Restock the shelf.`, 'warn');
      this.game.audio.play('error');
      return true;
    }
    shelf.stock -= 1;
    const special = this.specialProduct()?.product.item === customer.product.item;
    const patienceBonus = 1 + Math.max(0, customer.patience / customer.maxPatience) * 0.15;
    const total = Math.round(customer.product.price * (special ? 1.5 : 1) * patienceBonus);
    this.game.player.addCoins(total);
    this.game.player.addXp(special ? 12 : 7);
    this.game.recordSim('sell', customer.product.item, 1);
    this.game.recordSim('earn', 'coin', total);
    if (special) this.specialSales += 1;
    this.sales += 1;
    this.revenue += total;
    this.reputation = Math.min(100, this.reputation + 2);
    this.lastResult = `Sold ${itemName(customer.product.item)} to ${customer.name} for ${formatCoins(total)}.`;
    this.game.audio.play('pickup');
    this.game.particles.sparkle(entity.center.clone(), '#f7d06a', 10);
    this.game.toast(`Sold ${itemName(customer.product.item)} · +${formatCoins(total)}${special ? ' · special!' : ''}`, 'good');
    this.removeCustomer(customer);
    this.customers = this.customers.filter((c) => c !== customer);
    this.spawnTimer = Math.min(this.spawnTimer, 4);
    if (this.specialSales >= 6) this.rotateSpecial(true);
    return true;
  }

  hintForBlock(key: string): string | null {
    if (key === 'store_shelf') return '<b>Shop Shelf</b> · right-click to restock';
    if (key === 'chalkboard') return '<b>Chalkboard</b> · right-click to rotate today\'s special';
    if (key === 'counter') return '<b>Counter</b> · right-click to ring for the next customer';
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const customer = this.customers.find((c) => c.entityId === entity.id);
    if (!customer) return null;
    const shelf = this.stock.find((entry) => entry.product.item === customer.product.item);
    return `<b>${customer.name}</b> wants <b>${itemName(customer.product.item)}</b> · ${shelf?.stock ?? 0} in stock`;
  }

  onBlockBroken(): boolean {
    return false;
  }

  action(id: string): void {
    if (id.startsWith('restock:')) this.restock(id.slice(8));
  }

  dispose(): void {
    for (const customer of this.customers) this.removeCustomer(customer);
    this.customers = [];
  }

  private lowStock(): ShelfStock[] {
    return [...this.stock]
      .filter((entry) => entry.stock < CAPACITY)
      .sort((a, b) => a.stock - b.stock || a.product.wholesale - b.product.wholesale);
  }

  private specialProduct(): ShelfStock | undefined {
    return this.stock[this.specialIndex % Math.max(1, this.stock.length)];
  }

  private restock(item: string): void {
    const entry = this.stock.find((s) => s.product.item === item);
    if (!entry) return;
    const added = Math.min(RESTOCK_AMOUNT, CAPACITY - entry.stock);
    if (added <= 0) {
      this.game.toast(`${itemName(item)} is already fully stocked.`, 'info');
      return;
    }
    const cost = Math.max(1, Math.ceil(entry.product.wholesale * added));
    if (this.game.player.coins < cost) {
      this.game.toast(`Restocking ${itemName(item)} costs ${formatCoins(cost)}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-cost);
    entry.stock += added;
    this.game.recordSim('restock', item, 1);
    this.game.audio.play('place');
    this.game.toast(`Restocked ${itemName(item)} ×${added} for ${formatCoins(cost)}.`, 'good');
  }

  private rotateSpecial(auto = false): void {
    if (!this.stock.length) return;
    this.specialIndex = (this.specialIndex + 1) % this.stock.length;
    this.specialSales = 0;
    const product = this.specialProduct();
    if (!product) return;
    this.game.audio.play(auto ? 'quest' : 'click');
    this.game.toast(`Today's special: ${itemName(product.product.item)} · +50% price.`, 'good');
  }

  private spawnCustomer(): void {
    const spots = this.spec.customerSpots ?? [];
    if (!spots.length) return;
    const available = this.stock.filter((entry) => entry.stock > 0);
    if (!available.length) {
      this.game.toast('Every shelf is empty. Restock before the next customer arrives.', 'warn');
      return;
    }
    const free = spots.filter((spot) => !this.customers.some((c) => {
      const entity = this.entityById(c.entityId);
      return entity && Math.hypot(entity.position.x - (spot.x + 0.5), entity.position.z - (spot.z + 0.5)) < 1.4;
    }));
    const spot = pick(free.length ? free : spots);
    const product = pick(available).product;
    const name = pick(CUSTOMER_NAMES);
    const key = pick(CUSTOMER_KEYS);
    const entity = this.game.entities.spawn(key, new THREE.Vector3(spot.x + 0.5, this.game.baseY + 1 + (spot.y ?? 0), spot.z + 0.5), {
      name: `${name} · ${itemName(product.item)}`,
      role: 'Customer',
      id: `shop_customer_${++this.serial}`,
      behavior: 'stationary',
      exactY: true,
    });
    if (!entity) return;
    const maxPatience = 68;
    this.customers.push({
      serial: this.serial,
      entityId: entity.id,
      name,
      product,
      patience: maxPatience,
      maxPatience,
    });
    this.game.audio.play('open');
    this.game.toast(`${name} is looking for ${itemName(product.item)}.`, 'info');
  }

  private removeCustomer(customer: ShopCustomer): void {
    const entity = this.entityById(customer.entityId);
    if (entity) this.game.entities.remove(entity);
  }

  private entityById(id: string): GameEntity | undefined {
    return this.game.entities.entities.find((entity) => entity.id === id && entity.alive);
  }
}

function itemName(key: string): string {
  return ITEM_BY_KEY.get(key)?.name ?? key;
}
