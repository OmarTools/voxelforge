import { ITEM_BY_KEY, itemOrNull, type ItemDef, type ArmorSlot } from '../../content/Recipes';

export interface ItemStack {
  item: string;
  count: number;
  durability?: number;
}

export type InventoryChange = () => void;

const ARMOR_ORDER: ArmorSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];

export class Inventory {
  readonly slots: Array<ItemStack | null> = Array.from({ length: 36 }, () => null);
  readonly armor: Array<ItemStack | null> = Array.from({ length: 4 }, () => null);
  active = 0;
  onChange?: InventoryChange;

  get selected(): ItemStack | null {
    return this.slots[this.active] ?? null;
  }

  get selectedDef(): ItemDef | undefined {
    const stack = this.selected;
    return stack ? ITEM_BY_KEY.get(stack.item) : undefined;
  }

  markChanged() {
    this.onChange?.();
  }

  hotbar(): Array<ItemStack | null> {
    return this.slots.slice(0, 9);
  }

  mainInventory(): Array<ItemStack | null> {
    return this.slots.slice(9);
  }

  setActive(index: number) {
    this.active = ((index % 9) + 9) % 9;
    this.markChanged();
  }

  add(itemKey: string, count = 1): number {
    const def = itemOrNull(itemKey);
    if (!def || count <= 0) return count;
    let left = count;
    const max = def.stack;
    // Merge into existing stacks, hotbar first.
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const slot = this.slots[i];
      if (!slot || slot.item !== itemKey) continue;
      const space = max - slot.count;
      if (space <= 0) continue;
      const moved = Math.min(space, left);
      slot.count += moved;
      left -= moved;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(max, left);
      this.slots[i] = {
        item: itemKey,
        count: moved,
        durability: def.durability ? def.durability : undefined,
      };
      left -= moved;
    }
    if (left !== count) this.markChanged();
    return left;
  }

  addStack(stack: ItemStack): number {
    return this.add(stack.item, stack.count);
  }

  canAdd(itemKey: string, count: number): boolean {
    const def = itemOrNull(itemKey);
    if (!def) return false;
    let space = 0;
    for (const slot of this.slots) {
      if (!slot) space += def.stack;
      else if (slot.item === itemKey) space += Math.max(0, def.stack - slot.count);
      if (space >= count) return true;
    }
    return space >= count;
  }

  count(itemKey: string): number {
    let n = 0;
    for (const slot of this.slots) if (slot?.item === itemKey) n += slot.count;
    for (const slot of this.armor) if (slot?.item === itemKey) n += slot.count;
    return n;
  }

  remove(itemKey: string, count = 1): boolean {
    if (this.count(itemKey) < count) return false;
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const slot = this.slots[i];
      if (slot?.item !== itemKey) continue;
      const moved = Math.min(slot.count, left);
      slot.count -= moved;
      left -= moved;
      if (slot.count <= 0) this.slots[i] = null;
    }
    this.markChanged();
    return true;
  }

  removeAt(index: number, count = 1): ItemStack | null {
    const slot = this.slots[index];
    if (!slot) return null;
    const moved = Math.min(slot.count, count);
    const out: ItemStack = { ...slot, count: moved };
    slot.count -= moved;
    if (slot.count <= 0) this.slots[index] = null;
    this.markChanged();
    return out;
  }

  setSlot(index: number, stack: ItemStack | null) {
    this.slots[index] = stack;
    this.markChanged();
  }

  swap(a: number, b: number) {
    const tmp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
    this.markChanged();
  }

  quickMove(index: number) {
    const slot = this.slots[index];
    if (!slot) return;
    const def = itemOrNull(slot.item);
    if (!def) return;
    if (def.armorSlot && def.kind === 'armor') {
      const armorIndex = ARMOR_ORDER.indexOf(def.armorSlot);
      if (!this.armor[armorIndex]) {
        this.armor[armorIndex] = slot;
        this.slots[index] = null;
        this.markChanged();
        return;
      }
    }
    // Move between hotbar and main inventory.
    const [start, end] = index < 9 ? [9, 36] : [0, 9];
    for (let i = start; i < end; i++) {
      const other = this.slots[i];
      if (other && other.item === slot.item && other.count < def.stack) {
        const moved = Math.min(def.stack - other.count, slot.count);
        other.count += moved;
        slot.count -= moved;
        if (slot.count <= 0) this.slots[index] = null;
        this.markChanged();
        return;
      }
    }
    for (let i = start; i < end; i++) {
      if (!this.slots[i]) {
        this.slots[i] = slot;
        this.slots[index] = null;
        this.markChanged();
        return;
      }
    }
  }

  equipArmor(armorIndex: number, inventoryIndex: number) {
    const slot = this.slots[inventoryIndex];
    if (!slot) return;
    const def = itemOrNull(slot.item);
    if (!def?.armorSlot || ARMOR_ORDER.indexOf(def.armorSlot) !== armorIndex) return;
    const old = this.armor[armorIndex];
    this.armor[armorIndex] = slot;
    this.slots[inventoryIndex] = old;
    this.markChanged();
  }

  unequipArmor(armorIndex: number) {
    const slot = this.armor[armorIndex];
    if (!slot) return;
    const empty = this.slots.findIndex((s) => !s);
    if (empty < 0) return;
    this.slots[empty] = slot;
    this.armor[armorIndex] = null;
    this.markChanged();
  }

  armorPoints(): number {
    let points = 0;
    for (const slot of this.armor) {
      if (!slot) continue;
      points += itemOrNull(slot.item)?.armor ?? 0;
    }
    return points;
  }

  armorMultiplier(): number {
    return 1 - Math.min(0.62, this.armorPoints() * 0.035);
  }

  damageHeld(amount = 1): boolean {
    const stack = this.selected;
    if (!stack) return false;
    const def = itemOrNull(stack.item);
    if (!def?.durability) return false;
    stack.durability = (stack.durability ?? def.durability) - amount;
    if (stack.durability <= 0) {
      this.slots[this.active] = null;
      this.markChanged();
      return true;
    }
    this.markChanged();
    return false;
  }

  damageArmor(amount = 1) {
    for (let i = 0; i < this.armor.length; i++) {
      const stack = this.armor[i];
      if (!stack) continue;
      const def = itemOrNull(stack.item);
      if (!def?.durability) continue;
      stack.durability = (stack.durability ?? def.durability) - amount;
      if (stack.durability <= 0) this.armor[i] = null;
    }
    this.markChanged();
  }

  clear() {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = null;
    for (let i = 0; i < this.armor.length; i++) this.armor[i] = null;
    this.active = 0;
    this.markChanged();
  }

  serialize(): { slots: Array<ItemStack | null>; armor: Array<ItemStack | null>; active: number } {
    return {
      slots: this.slots.map((s) => (s ? { ...s } : null)),
      armor: this.armor.map((s) => (s ? { ...s } : null)),
      active: this.active,
    };
  }

  load(data: { slots?: Array<ItemStack | null>; armor?: Array<ItemStack | null>; active?: number }) {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = data.slots?.[i] ? { ...data.slots[i]! } : null;
    for (let i = 0; i < this.armor.length; i++) this.armor[i] = data.armor?.[i] ? { ...data.armor[i]! } : null;
    this.active = Math.max(0, Math.min(8, data.active ?? 0));
    this.markChanged();
  }

  /** Find the best tool type the player owns (for auto-select hints). */
  findTool(type: string): number {
    let best = -1;
    let bestTier = -1;
    for (let i = 0; i < 9; i++) {
      const stack = this.slots[i];
      if (!stack) continue;
      const def = itemOrNull(stack.item);
      if (!def || def.toolType !== type) continue;
      if ((def.tier ?? 0) > bestTier) {
        bestTier = def.tier ?? 0;
        best = i;
      }
    }
    return best;
  }
}

export { ARMOR_ORDER };
