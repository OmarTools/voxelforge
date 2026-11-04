import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import { ITEM_BY_KEY } from '../../../content/Recipes';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { blockCenter, formatCoins, giveItem, nearestBlock, pick, randomInt, scanBlocks, type BlockPos } from './SimUtils';

interface CookingRecipe {
  id: string;
  name: string;
  dish: string;
  ingredients: Array<{ item: string; count: number }>;
  time: number;
  price: number;
  xp: number;
}

export const COOKING_RECIPES: Record<string, CookingRecipe> = {
  burger: {
    id: 'burger', name: 'Forge Burger', dish: 'burger', time: 6.5, price: 28, xp: 10,
    ingredients: [{ item: 'bread', count: 1 }, { item: 'cooked_beef', count: 1 }, { item: 'cheese', count: 1 }, { item: 'lettuce', count: 1 }],
  },
  pizza: {
    id: 'pizza', name: 'Cheese Pizza', dish: 'cheese_pizza', time: 8, price: 26, xp: 12,
    ingredients: [{ item: 'dough', count: 1 }, { item: 'cheese', count: 2 }, { item: 'tomato', count: 1 }],
  },
  salad: {
    id: 'salad', name: 'Garden Salad', dish: 'garden_salad', time: 3.5, price: 17, xp: 7,
    ingredients: [{ item: 'lettuce', count: 2 }, { item: 'tomato', count: 1 }, { item: 'carrot', count: 1 }, { item: 'onion', count: 1 }],
  },
  cake: {
    id: 'cake', name: 'Cake Slice', dish: 'cake_slice', time: 7, price: 21, xp: 10,
    ingredients: [{ item: 'dough', count: 1 }, { item: 'egg', count: 1 }, { item: 'butter', count: 1 }, { item: 'chocolate', count: 1 }],
  },
  coffee: {
    id: 'coffee', name: 'Hot Coffee', dish: 'coffee', time: 2.5, price: 10, xp: 4,
    ingredients: [{ item: 'coffee_bean', count: 1 }, { item: 'milk', count: 1 }],
  },
  tea: {
    id: 'tea', name: 'Herbal Tea', dish: 'tea', time: 2.5, price: 9, xp: 4,
    ingredients: [{ item: 'tea_leaf', count: 1 }, { item: 'milk', count: 1 }],
  },
  ramen: {
    id: 'ramen', name: 'Ember Ramen', dish: 'ramen', time: 7, price: 30, xp: 14,
    ingredients: [{ item: 'noodles', count: 1 }, { item: 'broth', count: 1 }, { item: 'egg', count: 1 }],
  },
  soup: {
    id: 'soup', name: 'Pumpkin Soup', dish: 'pumpkin_soup', time: 6, price: 24, xp: 11,
    ingredients: [{ item: 'pumpkin', count: 1 }, { item: 'broth', count: 1 }, { item: 'butter', count: 1 }],
  },
};

const CUSTOMER_KEYS = ['human:adventurer', 'human:villager_farmer', 'human:guard_city', 'human:snow_hunter', 'human:desert_nomad', 'human:chef_inn'];
const CUSTOMER_NAMES = ['Nora', 'Bram', 'Iris', 'Tomas', 'Sable', 'Wren', 'Odo', 'Lark', 'Maeve', 'Pike', 'Jun', 'Rosa'];
const PANTRY_BUNDLE = ['tomato', 'lettuce', 'onion', 'mushroom', 'egg', 'cheese', 'rice', 'noodles', 'dough', 'butter', 'chocolate', 'coffee_bean', 'tea_leaf', 'broth', 'milk', 'bread', 'carrot'];
const PANTRY_COST = 10;

interface CustomerOrder {
  serial: number;
  entityId: string;
  name: string;
  recipe: CookingRecipe;
  patience: number;
  maxPatience: number;
}

interface CookJob {
  recipe: CookingRecipe;
  remaining: number;
  total: number;
  stove: BlockPos | null;
}

/**
 * Kitchen service loop: cook dishes at stoves, then serve the customers who
 * queue up at the restaurant tables before their patience runs out.
 */
export class CookingSystem implements SimSystem {
  readonly kind = 'cooking' as const;

  private game: Game;
  private spec: SimSpec;
  private stoves: BlockPos[] = [];
  private crates: BlockPos[] = [];
  private recipes: CookingRecipe[];
  private customers: CustomerOrder[] = [];
  private cooking: CookJob | null = null;
  private spawnTimer = 4;
  private serial = 0;
  private served = 0;
  private missed = 0;
  private reputation = 72;
  private lastResult = 'The pass is quiet. For now.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.spec = spec;
    const found = scanBlocks(game, ['stove', 'crate', 'barrel'], 58, 18);
    this.stoves = found.get('stove') ?? [];
    this.crates = [...(found.get('crate') ?? []), ...(found.get('barrel') ?? [])];
    const allowed = (spec.recipes?.length ? spec.recipes : Object.keys(COOKING_RECIPES))
      .map((id) => COOKING_RECIPES[id])
      .filter((recipe): recipe is CookingRecipe => !!recipe && !!ITEM_BY_KEY.get(recipe.dish));
    this.recipes = allowed.length ? allowed : Object.values(COOKING_RECIPES);
  }

  update(dt: number): void {
    if (this.cooking) {
      this.cooking.remaining -= dt;
      if (this.cooking.remaining <= 0) this.finishCooking(this.cooking);
      else if (this.cooking.stove && Math.random() < dt * 4) {
        this.game.particles.sparkle(blockCenter(this.cooking.stove).add(new THREE.Vector3(0, 0.55, 0)), '#ffb45a', 2);
      }
    }

    for (const customer of [...this.customers]) {
      customer.patience -= dt;
      if (customer.patience > 0) continue;
      this.removeCustomer(customer);
      this.customers = this.customers.filter((c) => c !== customer);
      this.missed += 1;
      this.reputation = Math.max(10, this.reputation - 6);
      this.game.audio.play('error');
      this.game.toast(`${customer.name} left without their ${customer.recipe.name}.`, 'bad');
    }

    if (this.customers.length < (this.spec.maxCustomers ?? 4)) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spec.spawnEvery ?? 11;
        this.spawnCustomer();
      }
    }
  }

  hud(): SimHud {
    const cookTime = this.cooking ? `${Math.max(0, this.cooking.remaining).toFixed(1)}s` : 'Ready';
    const nearStove = this.nearStove();
    const pantry = this.pantryCount();
    const actions = this.recipes.slice(0, 5).map((recipe) => ({
      id: `cook:${recipe.id}`,
      label: `${recipe.name} · ${formatCoins(recipe.price)}`,
      disabled: !!this.cooking || !nearStove || this.missingIngredients(recipe).length > 0,
    }));
    return {
      kicker: 'Kitchen',
      title: 'Lunch Service',
      rows: [
        { label: 'Orders waiting', value: String(this.customers.length), tone: this.customers.length >= 4 ? 'warn' : undefined },
        { label: 'Stove', value: this.cooking ? `${this.cooking.recipe.name} · ${cookTime}` : cookTime, tone: this.cooking ? 'good' : undefined },
        { label: 'Reputation', value: `${Math.round(this.reputation)}%`, tone: this.reputation < 45 ? 'bad' : this.reputation > 80 ? 'good' : undefined },
        { label: 'Pantry', value: `${pantry} ingredients` },
      ],
      progress: this.cooking ? { label: 'Cooking', value: this.cooking.total - this.cooking.remaining, max: this.cooking.total } : undefined,
      actions,
      footer: nearStove
        ? 'Right-click a stove to cook the first dish you can make. Right-click a crate to buy a pantry bundle.'
        : 'Stand near a stove to cook. Crates sell pantry bundles for 10 coins.',
    };
  }

  interactBlock(key: string): boolean {
    if (key === 'stove') {
      const recipe = this.recipes.find((r) => this.missingIngredients(r).length === 0);
      if (!recipe) {
        this.game.toast('You are missing ingredients for every dish on the menu.', 'warn');
        this.game.audio.play('error');
        return true;
      }
      this.beginCooking(recipe);
      return true;
    }
    if (key === 'crate' || key === 'barrel') {
      this.buyPantry();
      return true;
    }
    return false;
  }

  interactEntity(entity: GameEntity): boolean {
    const order = this.customers.find((c) => c.entityId === entity.id);
    if (!order) return false;
    const dish = order.recipe.dish;
    if (this.game.player.inventory.count(dish) < 1) {
      this.game.toast(`${order.name} wants ${order.recipe.name}. You have none ready.`, 'warn');
      this.game.audio.play('error');
      return true;
    }
    this.game.player.inventory.remove(dish, 1);
    const patienceRatio = Math.max(0, order.patience / order.maxPatience);
    const tip = Math.round(order.recipe.price * (0.18 + this.reputation / 220) * patienceRatio);
    const total = order.recipe.price + tip;
    this.game.player.addCoins(total);
    this.game.player.addXp(Math.round(order.recipe.xp * 0.5));
    this.game.recordSim('serve', dish, 1);
    this.game.recordSim('earn', 'coin', total);
    this.served += 1;
    this.reputation = Math.min(100, this.reputation + 3);
    this.lastResult = `Served ${order.recipe.name} to ${order.name} for ${formatCoins(total)}.`;
    this.game.audio.play('pickup');
    this.game.particles.sparkle(entity.center.clone(), '#ffd98a', 12);
    this.game.toast(`Served ${order.recipe.name} · +${formatCoins(total)}${tip ? ` (tip ${formatCoins(tip)})` : ''}`, 'good');
    this.removeCustomer(order);
    this.customers = this.customers.filter((c) => c !== order);
    this.spawnTimer = Math.min(this.spawnTimer, 4);
    return true;
  }

  hintForBlock(key: string): string | null {
    if (key === 'stove') return '<b>Iron Stove</b> · right-click to cook';
    if (key === 'crate' || key === 'barrel') return '<b>Pantry Crate</b> · right-click to buy ingredients · 10c';
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    const order = this.customers.find((c) => c.entityId === entity.id);
    if (!order) return null;
    const ready = this.game.player.inventory.count(order.recipe.dish);
    return `<b>${order.name}</b> wants <b>${order.recipe.name}</b> ${ready > 0 ? '· right-click to serve' : '· not ready'}`;
  }

  onBlockBroken(): boolean {
    return false;
  }

  action(id: string): void {
    if (id.startsWith('cook:')) {
      const recipe = this.recipes.find((r) => r.id === id.slice(5));
      if (recipe) this.beginCooking(recipe);
      return;
    }
    if (id === 'pantry') this.buyPantry();
  }

  dispose(): void {
    for (const customer of this.customers) this.removeCustomer(customer);
    this.customers = [];
    this.cooking = null;
  }

  private nearStove(): BlockPos | null {
    if (this.stoves.length === 0) return null;
    return nearestBlock(this.game, this.stoves);
  }

  private beginCooking(recipe: CookingRecipe): void {
    if (this.cooking) {
      this.game.toast('Something is already on the stove.', 'warn');
      return;
    }
    const stove = this.nearStove();
    if (!stove) {
      this.game.toast('Stand next to a stove to cook.', 'warn');
      this.game.audio.play('error');
      return;
    }
    const missing = this.missingIngredients(recipe);
    if (missing.length) {
      this.game.toast(`Missing ${missing.map((m) => ITEM_BY_KEY.get(m)?.name ?? m).join(', ')}.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    for (const ingredient of recipe.ingredients) this.game.player.inventory.remove(ingredient.item, ingredient.count);
    this.cooking = { recipe, remaining: recipe.time, total: recipe.time, stove };
    this.game.audio.play('craft');
    this.game.particles.sparkle(blockCenter(stove).add(new THREE.Vector3(0, 0.7, 0)), '#ffcf7a', 8);
    this.game.toast(`Cooking ${recipe.name}…`, 'info');
  }

  private finishCooking(job: CookJob): void {
    this.cooking = null;
    const position = job.stove ? blockCenter(job.stove) : this.game.player.position.clone();
    giveItem(this.game, job.recipe.dish, 1, position);
    this.game.player.addXp(job.recipe.xp);
    this.game.recordSim('cook', job.recipe.dish, 1);
    this.lastResult = `${job.recipe.name} came off the stove.`;
    this.game.audio.play('pickup');
    if (job.stove) this.game.particles.sparkle(blockCenter(job.stove).add(new THREE.Vector3(0, 0.8, 0)), '#ffe3a0', 12);
    this.game.toast(`${job.recipe.name} is ready. Serve it while it is hot.`, 'good');
  }

  private missingIngredients(recipe: CookingRecipe): string[] {
    const inv = this.game.player.inventory;
    return recipe.ingredients.filter((ingredient) => inv.count(ingredient.item) < ingredient.count).map((i) => i.item);
  }

  private pantryCount(): number {
    const inv = this.game.player.inventory;
    return PANTRY_BUNDLE.reduce((total, item) => total + inv.count(item), 0);
  }

  private buyPantry(): void {
    if (this.game.player.coins < PANTRY_COST) {
      this.game.toast(`A pantry bundle costs ${PANTRY_COST} coins.`, 'warn');
      this.game.audio.play('error');
      return;
    }
    this.game.player.addCoins(-PANTRY_COST);
    const granted: string[] = [];
    for (let i = 0; i < 4; i++) {
      const item = pick(PANTRY_BUNDLE);
      giveItem(this.game, item, item === 'milk' || item === 'broth' ? 1 : randomInt(1, 3));
      granted.push(ITEM_BY_KEY.get(item)?.name ?? item);
    }
    this.game.audio.play('pickup');
    this.game.toast(`Pantry restocked: ${granted.join(', ')}`, 'good');
  }

  private spawnCustomer(): void {
    const spots = this.spec.customerSpots ?? [];
    if (!spots.length) return;
    const free = spots.filter((spot) => !this.customers.some((c) => {
      const entity = this.entityById(c.entityId);
      return entity && Math.hypot(entity.position.x - (spot.x + 0.5), entity.position.z - (spot.z + 0.5)) < 1.4;
    }));
    const spot = pick(free.length ? free : spots);
    const recipe = pick(this.recipes);
    const name = pick(CUSTOMER_NAMES);
    const key = pick(CUSTOMER_KEYS);
    const entity = this.game.entities.spawn(key, new THREE.Vector3(spot.x + 0.5, this.game.baseY + 1 + (spot.y ?? 0), spot.z + 0.5), {
      name: `${name} · ${recipe.name}`,
      role: 'Customer',
      id: `cook_customer_${++this.serial}`,
      behavior: 'stationary',
      exactY: true,
    });
    if (!entity) return;
    const maxPatience = 82;
    this.customers.push({
      serial: this.serial,
      entityId: entity.id,
      name,
      recipe,
      patience: maxPatience,
      maxPatience,
    });
    this.game.audio.play('open');
    this.game.toast(`${name} sits down and orders ${recipe.name}.`, 'info');
  }

  private removeCustomer(order: CustomerOrder): void {
    const entity = this.entityById(order.entityId);
    if (entity) this.game.entities.remove(entity);
  }

  private entityById(id: string): GameEntity | undefined {
    return this.game.entities.entities.find((entity) => entity.id === id && entity.alive);
  }
}
