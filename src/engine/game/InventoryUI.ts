import type { Game } from './Game';
import {
  ARMOR_LABEL,
  ITEM_CATEGORIES,
  ITEM_BY_KEY,
  ITEMS,
  availableRecipes,
  itemIcon,
  itemName,
  itemOrNull,
  recipeCost,
  type ItemDef,
  type Recipe,
  type Station,
} from '../../content/Recipes';
import { ARMOR_ORDER, type ItemStack } from './Inventory';

type View = 'inventory' | 'craft' | 'blocks';

const ARMOR_SLOTS = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/**
 * Inventory, equipment, crafting and creative-library interface.
 */
export class InventoryUI {
  readonly el: HTMLDivElement;
  private game: Game;
  private modal!: HTMLDivElement;
  private body!: HTMLDivElement;
  private tabRow!: HTMLDivElement;
  private searchInput!: HTMLInputElement;
  private tooltip: HTMLDivElement;
  private openState = false;
  private view: View = 'inventory';
  private category = 'all';
  private search = '';
  private selectedSlot: number | null = null;
  private station: Station = 'hand';

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'overlay hidden';
    this.el.id = 'inventory-overlay';
    root.appendChild(this.el);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'inv-tooltip hidden';
    document.body.appendChild(this.tooltip);
    this.build();
  }

  get isOpen(): boolean {
    return this.openState;
  }

  private build(): void {
    this.el.innerHTML = `
      <div class="modal xl" role="dialog" aria-label="Inventory and crafting">
        <div class="modal-head">
          <div>
            <h3>Field Kit</h3>
            <div class="sub">Inventory · Equipment · Crafting</div>
          </div>
          <div class="spacer"></div>
          <div class="search-box" style="width:230px;margin:0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
            <input type="text" placeholder="Search items and recipes…" />
          </div>
          <button class="close-x" data-action="close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <div class="tabs" data-role="tabs">
            <button class="tab active" data-view="inventory">Inventory</button>
            <button class="tab" data-view="craft">Crafting</button>
            <button class="tab" data-view="blocks">Creative Library</button>
          </div>
          <div class="inv-layout"></div>
        </div>
        <div class="modal-foot">
          <span class="pill" data-role="station">Hand crafting</span>
          <span class="muted tiny">Right-click a slot to quick-move · Click to pick up / place · Double-click to use</span>
          <div class="spacer"></div>
          <button class="btn ghost small" data-action="close">Close <kbd>Esc</kbd></button>
        </div>
      </div>
    `;
    this.modal = this.el.querySelector('.modal') as HTMLDivElement;
    this.body = this.el.querySelector('.inv-layout') as HTMLDivElement;
    this.tabRow = this.el.querySelector('[data-role="tabs"]') as HTMLDivElement;
    this.searchInput = this.el.querySelector('.search-box input') as HTMLInputElement;

    this.tabRow.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest('[data-view]') as HTMLElement | null;
      if (!btn) return;
      this.view = btn.dataset.view as View;
      this.selectedSlot = null;
      this.game.audio.play('click');
      this.render();
    });
    this.searchInput.addEventListener('input', () => {
      this.search = this.searchInput.value.trim().toLowerCase();
      this.render();
    });
    this.el.addEventListener('click', (event) => this.onClick(event));
    this.el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const slot = (event.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
      if (!slot) return;
      const index = Number(slot.dataset.slot);
      if (index < 36) {
        this.game.player.inventory.quickMove(index);
        this.game.audio.play('click');
        this.render();
      }
    });
    this.el.addEventListener('mouseover', (event) => this.onHover(event));
    this.el.addEventListener('mouseout', (event) => {
      const target = (event.target as HTMLElement).closest('[data-item]');
      const related = (event.relatedTarget as HTMLElement | null)?.closest('[data-item]');
      if (target && target !== related) this.tooltip.classList.add('hidden');
    });
    this.el.addEventListener('mousemove', (event) => {
      if (this.tooltip.classList.contains('hidden')) return;
      const x = Math.min(window.innerWidth - this.tooltip.offsetWidth - 12, event.clientX + 16);
      const y = Math.min(window.innerHeight - this.tooltip.offsetHeight - 12, event.clientY + 18);
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.top = `${y}px`;
    });
    this.el.addEventListener('mousedown', (event) => {
      if (event.target === this.el) this.close();
    });
  }

  open(station: Station = 'hand'): void {
    this.station = station;
    this.openState = true;
    this.el.classList.remove('hidden');
    this.game.uiOpen = true;
    this.game.input.exitLock();
    this.searchInput.value = '';
    this.search = '';
    this.selectedSlot = null;
    this.view = this.game.creativeMode ? 'blocks' : 'inventory';
    this.render();
    this.game.audio.play('open');
    this.game.closeOtherOverlays('inventory');
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.el.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.game.uiOpen = false;
    this.game.onOverlayClosed();
    this.game.audio.play('close');
  }

  toggle(station: Station = 'hand'): void {
    if (this.openState) this.close();
    else this.open(station);
  }

  setStation(station: Station): void {
    this.station = station;
    if (this.openState) this.render();
  }

  private render(): void {
    const inv = this.game.player.inventory;
    for (const tab of Array.from(this.tabRow.querySelectorAll('.tab'))) {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.view === this.view);
    }
    const blocksTab = this.tabRow.querySelector('[data-view="blocks"]') as HTMLElement;
    blocksTab.classList.toggle('hidden', !this.game.creativeMode);
    if (this.view === 'blocks' && !this.game.creativeMode) this.view = 'inventory';
    (this.el.querySelector('[data-role="station"]') as HTMLElement).textContent =
      this.station === 'furnace' ? 'Furnace smelting' : this.station === 'table' ? 'Crafting table' : 'Hand crafting';

    const categoryButtons = this.view === 'inventory'
      ? `<div class="inv-side-title">Views</div>
         <button class="category-btn active"><span>▤</span> All Slots <span class="count">${inv.slots.filter(Boolean).length}</span></button>
         <button class="category-btn" data-view-jump="craft"><span>⚒</span> Crafting <span class="count">${availableRecipes(this.station).length}</span></button>
         ${this.game.creativeMode ? '<button class="category-btn" data-view-jump="blocks"><span>✦</span> Creative Library <span class="count">∞</span></button>' : ''}`
      : `<div class="inv-side-title">Categories</div>` + ITEM_CATEGORIES.map((cat) => {
          const count = this.catalogFor(cat.id).length;
          return `<button class="category-btn ${this.category === cat.id ? 'active' : ''}" data-category="${cat.id}">
            <span>${cat.icon}</span> ${escape(cat.label)} <span class="count">${count}</span>
          </button>`;
        }).join('') + `<div class="divider"></div><div class="inv-side-title">Shortcuts</div>
        <button class="category-btn" data-view-jump="inventory"><span>▤</span> Back to Inventory</button>`;

    const left = `<aside class="inv-side">${categoryButtons}</aside>`;

    const center = this.view === 'inventory'
      ? this.renderInventoryGrid()
      : this.view === 'craft'
        ? this.renderRecipes()
        : this.renderCatalog();

    const right = this.renderCharacter();

    this.body.innerHTML = `${left}<section class="inv-main">${center}</section><aside class="inv-side">${right}</aside>`;
    this.tooltip.classList.add('hidden');
  }

  private renderInventoryGrid(): string {
    const inv = this.game.player.inventory;
    const slotHtml = (stack: ItemStack | null, index: number): string => {
      const selected = this.selectedSlot === index;
      if (!stack) return `<div class="slot ${selected ? 'active' : ''}" data-slot="${index}"><span class="slot-num">${index < 9 ? index + 1 : ''}</span></div>`;
      const def = itemOrNull(stack.item);
      return `<div class="slot ${selected ? 'active' : ''}" data-slot="${index}" data-item="${escape(stack.item)}">
        <span class="slot-num">${index < 9 ? index + 1 : ''}</span>
        <img class="slot-icon" src="${itemIcon(stack.item, this.game.atlas)}" alt="${escape(def?.name ?? stack.item)}" style="image-rendering:pixelated"/>
        ${stack.count > 1 ? `<span class="slot-count">${stack.count}</span>` : ''}
        ${def?.durability && stack.durability !== undefined && stack.durability < def.durability
          ? `<div style="position:absolute;left:3px;right:3px;bottom:2px;height:2px;background:rgba(0,0,0,.6)"><div style="height:100%;width:${(stack.durability / def.durability) * 100}%;background:${stack.durability / def.durability > 0.3 ? '#8ce05f' : '#ff6464'}"></div></div>` : ''}
      </div>`;
    };
    const hotbar = Array.from({ length: 9 }, (_, i) => slotHtml(inv.slots[i], i)).join('');
    const main = Array.from({ length: 27 }, (_, i) => slotHtml(inv.slots[i + 9], i + 9)).join('');
    return `<div class="inv-side-title">Hotbar</div>
      <div class="hotbar-row">${hotbar}</div>
      <div class="inv-side-title">Backpack <span class="muted tiny" style="margin-left:auto">${inv.slots.slice(9).filter(Boolean).length} / 27 used</span></div>
      <div class="inv-grid" style="grid-template-columns:repeat(9,1fr);max-height:none">${main}</div>
      <div class="divider"></div>
      <div class="muted tiny" style="line-height:1.8">
        ${this.selectedSlot !== null ? 'Select another slot to swap, or right-click to quick-move.' : 'Click an item to pick it up. Right-click quick-moves it between hotbar and backpack.'}
      </div>`;
  }

  private renderCatalog(): string {
    const items = this.catalogFor(this.category).filter((def) => {
      if (!this.search) return true;
      return `${def.name} ${def.key} ${def.description} ${def.kind}`.toLowerCase().includes(this.search);
    });
    return `<div class="inv-side-title">Creative Library <span class="muted tiny" style="margin-left:auto">${items.length} entries · click to give</span></div>
      <div class="inv-grid">${items.map((def) => this.itemCard(def, def.stack > 1 ? def.stack : 1)).join('')}</div>`;
  }

  private itemCard(def: ItemDef, count = 1): string {
    return `<button class="item-card" data-give="${escape(def.key)}" data-item="${escape(def.key)}" title="${escape(def.name)}">
      <img class="item-swatch" src="${itemIcon(def.key, this.game.atlas)}" alt="" style="image-rendering:pixelated"/>
      <span class="item-name">${escape(def.name)}</span>
      ${count > 1 ? `<span class="item-count">${count}</span>` : ''}
    </button>`;
  }

  private renderRecipes(): string {
    const all = availableRecipes(this.game.creativeMode ? 'furnace' : this.station);
    const recipes = all.filter((recipe) => {
      if (!this.search) return true;
      const hay = `${itemName(recipe.output)} ${recipe.output} ${recipe.ingredients.map((i) => `${itemName(i.item)} ${i.item}`).join(' ')} ${recipe.station}`;
      return hay.toLowerCase().includes(this.search);
    }).sort((a, b) => Number(this.canCraft(b)) - Number(this.canCraft(a)));
    const list = recipes.map((recipe) => this.recipeRow(recipe)).join('');
    return `<div class="inv-side-title">Recipes <span class="muted tiny" style="margin-left:auto">${recipes.length} available · ${this.station === 'hand' ? 'stand near a crafting table for more' : this.station + ' unlocked'}</span></div>
      <div class="recipe-list">${list || '<div class="empty"><span class="big">⚒</span>No recipes match that search.</div>'}</div>`;
  }

  private recipeRow(recipe: Recipe): string {
    const craftable = this.canCraft(recipe);
    const out = ITEM_BY_KEY.get(recipe.output);
    return `<div class="recipe-row" data-item="${escape(recipe.output)}">
      <img class="recipe-icon" src="${itemIcon(recipe.output, this.game.atlas)}" alt="" style="image-rendering:pixelated"/>
      <div class="recipe-info">
        <div class="recipe-name">${escape(out?.name ?? recipe.output)} ${recipe.count > 1 ? `×${recipe.count}` : ''}</div>
        <div class="recipe-cost">${escape(recipeCost(recipe))}${recipe.station !== 'hand' ? ` · ${recipe.station}` : ''}</div>
      </div>
      <button class="craft-btn" data-craft="${escape(recipe.id)}" ${craftable ? '' : 'disabled'}>Craft</button>
    </div>`;
  }

  private renderCharacter(): string {
    const inv = this.game.player.inventory;
    const player = this.game.player;
    const armorHtml = inv.armor.map((stack, i) => {
      if (!stack) return `<div class="slot mini-slot" data-armor="${i}" title="${ARMOR_SLOTS[i]}"><span style="opacity:.35;font-size:9px">${ARMOR_SLOTS[i][0]}</span></div>`;
      return `<div class="slot mini-slot" data-armor="${i}" data-item="${escape(stack.item)}"><img class="slot-icon" src="${itemIcon(stack.item, this.game.atlas)}" alt="${escape(itemName(stack.item))}" style="image-rendering:pixelated"/></div>`;
    }).join('');
    const held = inv.selectedDef;
    return `<div class="inv-side-title">Character</div>
      <div class="hotbar-row">${armorHtml}</div>
      <div class="stat-line"><span>Health</span><b>${player.health.toFixed(0)} / ${player.maxHealth}</b></div>
      <div class="stat-line"><span>Armor</span><b>${inv.armorPoints()} (${Math.round((1 - inv.armorMultiplier()) * 100)}%)</b></div>
      <div class="stat-line"><span>Attack</span><b>${held?.damage ?? 1}</b></div>
      <div class="stat-line"><span>Level</span><b>${player.level} · ${player.xp}/${player.xpForNext()} XP</b></div>
      <div class="stat-line"><span>Coins</span><b>◈ ${player.coins}</b></div>
      <div class="divider"></div>
      <div class="inv-side-title">Hotbar</div>
      <div class="hotbar-row">${inv.hotbar().map((stack, i) => stack
        ? `<div class="slot mini-slot ${i === inv.active ? 'active' : ''}" data-slot="${i}" data-item="${escape(stack.item)}"><img class="slot-icon" src="${itemIcon(stack.item, this.game.atlas)}" alt="" style="image-rendering:pixelated"/><span class="slot-count">${stack.count}</span></div>`
        : `<div class="slot mini-slot ${i === inv.active ? 'active' : ''}" data-slot="${i}"></div>`).join('')}</div>
      <div class="divider"></div>
      <div class="inv-side-title">World</div>
      <div class="stat-line"><span>Template</span><b>${escape(this.game.template.name)}</b></div>
      <div class="stat-line"><span>Blocks placed</span><b>${this.game.stats.blocksPlaced}</b></div>
      <div class="stat-line"><span>Blocks mined</span><b>${this.game.stats.blocksMined}</b></div>
      <div class="stat-line"><span>Enemies slain</span><b>${this.game.stats.kills}</b></div>
      <div class="stat-line"><span>World edits</span><b>${this.game.world.editCount}</b></div>`;
  }

  private catalogFor(category: string): ItemDef[] {
    const list = ITEMS.filter((def) => !(def.kind === 'special' && def.key === 'air'));
    if (category === 'all') return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.filter((def) => def.kind === category).sort((a, b) => a.name.localeCompare(b.name));
  }

  private canCraft(recipe: Recipe): boolean {
    if (this.game.creativeMode) return true;
    const inv = this.game.player.inventory;
    return recipe.ingredients.every((ing) => inv.count(ing.item) >= ing.count)
      && inv.canAdd(recipe.output, recipe.count);
  }

  private onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="close"]')) {
      this.close();
      return;
    }
    const viewJump = target.closest('[data-view-jump]') as HTMLElement | null;
    if (viewJump) {
      this.view = viewJump.dataset.viewJump as View;
      this.game.audio.play('click');
      this.render();
      return;
    }
    const category = target.closest('[data-category]') as HTMLElement | null;
    if (category) {
      this.category = category.dataset.category ?? 'all';
      this.game.audio.play('click');
      this.render();
      return;
    }
    const give = target.closest('[data-give]') as HTMLElement | null;
    if (give) {
      const key = give.dataset.give!;
      const def = ITEM_BY_KEY.get(key);
      if (!def) return;
      const amount = event.shiftKey ? Math.min(def.stack, 16) : 1;
      this.game.player.inventory.add(key, amount);
      this.game.audio.play('pickup');
      this.game.player.refreshHeldItem();
      this.render();
      return;
    }
    const craftBtn = target.closest('[data-craft]') as HTMLElement | null;
    if (craftBtn) {
      const recipe = availableRecipes('furnace').find((r) => r.id === craftBtn.dataset.craft);
      if (recipe && this.canCraft(recipe)) this.craft(recipe);
      return;
    }
    const armor = target.closest('[data-armor]') as HTMLElement | null;
    if (armor) {
      const index = Number(armor.dataset.armor);
      const inv = this.game.player.inventory;
      if (this.selectedSlot !== null) {
        const stack = inv.slots[this.selectedSlot];
        const def = stack ? itemOrNull(stack.item) : undefined;
        if (def?.armorSlot && ARMOR_ORDER.indexOf(def.armorSlot) === index) {
          inv.equipArmor(index, this.selectedSlot);
          this.selectedSlot = null;
          this.game.audio.play('craft');
          this.render();
        }
      } else if (inv.armor[index]) {
        inv.unequipArmor(index);
        this.game.audio.play('click');
        this.render();
      }
      return;
    }
    const slot = target.closest('[data-slot]') as HTMLElement | null;
    if (slot) {
      const index = Number(slot.dataset.slot);
      const inv = this.game.player.inventory;
      if (this.selectedSlot === null) {
        if (inv.slots[index]) {
          this.selectedSlot = index;
          this.game.audio.play('click');
          this.render();
        }
      } else if (this.selectedSlot === index) {
        this.selectedSlot = null;
        this.render();
      } else {
        inv.swap(this.selectedSlot, index);
        this.selectedSlot = null;
        this.game.player.refreshHeldItem();
        this.game.audio.play('click');
        this.render();
      }
    }
  }

  private craft(recipe: Recipe): void {
    const inv = this.game.player.inventory;
    if (!this.game.creativeMode) {
      for (const ing of recipe.ingredients) {
        if (!inv.remove(ing.item, ing.count)) return;
      }
    }
    const leftover = inv.add(recipe.output, recipe.count);
    this.game.recordCraft(recipe.output, recipe.count);
    this.game.audio.play('craft');
    this.game.toast(`Crafted ${itemName(recipe.output)} ×${recipe.count}`, 'good');
    this.game.player.addXp(3);
    if (leftover > 0) this.game.entities.spawnDrop(recipe.output, leftover, this.game.player.position.clone());
    this.render();
  }

  private onHover(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest('[data-item]') as HTMLElement | null;
    if (!target) return;
    const key = target.dataset.item!;
    const def = ITEM_BY_KEY.get(key);
    if (!def) return;
    const stack = this.game.player.inventory.slots.find((s) => s?.item === key);
    const durability = stack?.durability !== undefined && def.durability
      ? `<div class="tt-sub">Durability ${stack.durability} / ${def.durability}</div>` : '';
    this.tooltip.innerHTML = `<div>${escape(def.name)}${def.stack > 1 ? ` <span class="muted">×${stack?.count ?? 1}</span>` : ''}</div>
      <div class="tt-sub">${escape(def.description)}</div>
      <div class="tt-sub">${def.kind.toUpperCase()}${def.tierName ? ` · ${escape(def.tierName)}` : ''}${def.damage ? ` · ${def.damage} damage` : ''}${def.armor ? ` · ${def.armor} armor` : ''}</div>
      ${durability}`;
    this.tooltip.classList.remove('hidden');
    const x = Math.min(window.innerWidth - 240, event.clientX + 16);
    const y = Math.min(window.innerHeight - 140, event.clientY + 18);
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  refresh(): void {
    if (this.openState) this.render();
  }

  dispose(): void {
    this.el.remove();
    this.tooltip.remove();
  }
}
