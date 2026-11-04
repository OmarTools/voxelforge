import type { ItemDef } from './Recipes';
import { hexToRgb } from '../engine/core/Utils';

/**
 * Hand-authored 16x16 item sprites, upscaled 4x with a crisp dark contour.
 * Every icon is drawn on the same pixel grid so tools, food and materials
 * read cleanly at hotbar size and in the inventory.
 */

type Ctx = CanvasRenderingContext2D;
const ART = 16;

function p(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, thickness = 1): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const half = Math.floor(thickness / 2);
  for (;;) {
    p(ctx, x - half, y - half, color, thickness, thickness);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry + 0.001);
    if (t <= 0) continue;
    const w = Math.floor(rx * Math.sqrt(t));
    p(ctx, cx - w, cy + y, color, w * 2 + 1, 1);
  }
}

function wedge(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, lean = 0): void {
  for (let row = 0; row < h; row++) {
    p(ctx, x + Math.floor((row * lean) / h), y + row, color, Math.max(1, w - row), 1);
  }
}

function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function metal(color: string): { base: string; light: string; dark: string; edge: string } {
  return { base: color, light: shade(color, 0.45), dark: shade(color, -0.32), edge: shade(color, -0.48) };
}

const WOOD = '#7b5530';
const WOOD_LIGHT = '#a57645';
const WOOD_DARK = '#4a3019';
const GOLD = '#d8a93f';
const GOLD_LIGHT = '#f6d77c';
const GOLD_DARK = '#8f6720';

/* ------------------------------------------------------------------ */
/*  Weapons and tools                                                  */
/* ------------------------------------------------------------------ */

function sword(ctx: Ctx, def: ItemDef): void {
  const m = metal(def.color);
  if (def.key === 'hammer') {
    line(ctx, 3, 14, 9, 8, WOOD, 2);
    line(ctx, 4, 13, 9, 8, WOOD_LIGHT, 1);
    p(ctx, 8, 2, m.dark, 6, 6);
    p(ctx, 9, 2, m.base, 5, 5);
    p(ctx, 9, 2, m.light, 4, 1);
    p(ctx, 8, 7, GOLD_DARK, 6, 1);
    p(ctx, 13, 3, m.edge, 1, 3);
    p(ctx, 11, 4, GOLD, 1, 1);
    return;
  }
  if (def.key === 'mace') {
    line(ctx, 2, 14, 8, 8, WOOD, 2);
    line(ctx, 3, 13, 8, 8, WOOD_LIGHT, 1);
    p(ctx, 8, 1, m.edge, 1, 2); p(ctx, 8, 8, m.edge, 1, 2);
    p(ctx, 6, 3, m.edge, 2, 1); p(ctx, 10, 3, m.edge, 2, 1);
    p(ctx, 6, 7, m.edge, 2, 1); p(ctx, 10, 7, m.edge, 2, 1);
    blob(ctx, 9, 5, 3, 3, m.dark);
    blob(ctx, 9, 5, 2, 2, m.base);
    p(ctx, 8, 3, m.light, 2, 1);
    p(ctx, 7, 5, m.light, 1, 1);
    return;
  }
  if (def.key === 'spear') {
    line(ctx, 2, 14, 12, 4, WOOD, 1);
    line(ctx, 3, 14, 13, 4, WOOD_LIGHT, 1);
    p(ctx, 12, 1, m.light, 1, 2);
    p(ctx, 11, 2, m.base, 1, 2);
    p(ctx, 10, 3, m.base, 1, 2);
    p(ctx, 9, 4, m.dark, 1, 1);
    p(ctx, 12, 3, m.dark, 1, 1);
    p(ctx, 10, 2, GOLD, 1, 1);
    p(ctx, 8, 12, '#c7b48a', 2, 2);
    return;
  }
  if (def.key === 'dagger') {
    line(ctx, 8, 10, 13, 4, m.dark, 2);
    line(ctx, 8, 10, 13, 4, m.base, 1);
    line(ctx, 9, 9, 13, 4, m.light, 1);
    p(ctx, 7, 11, GOLD, 4, 1);
    p(ctx, 6, 12, GOLD_DARK, 2, 1);
    p(ctx, 5, 13, WOOD_DARK, 2, 2);
    p(ctx, 4, 14, GOLD, 1, 1);
    return;
  }
  if (def.key === 'cutlass') {
    const pts: Array<[number, number]> = [[7, 11], [8, 10], [9, 9], [10, 8], [11, 7], [12, 6], [13, 5], [14, 4], [14, 3]];
    for (const [x, y] of pts) p(ctx, x, y, m.dark, 2, 1);
    for (const [x, y] of pts.slice(0, -1)) {
      p(ctx, x, y - 1, m.base, 1, 1);
      p(ctx, x + 1, y, m.light, 1, 1);
    }
    p(ctx, 14, 2, m.light, 1, 1);
    p(ctx, 4, 11, GOLD, 5, 1);
    p(ctx, 5, 12, GOLD_DARK, 3, 1);
    p(ctx, 4, 13, WOOD_DARK, 2, 2);
    p(ctx, 3, 14, GOLD, 2, 1);
    return;
  }
  if (def.key === 'katana') {
    for (let i = 0; i < 8; i++) p(ctx, 7 + i, 11 - i, m.base, 1, 1);
    for (let i = 0; i < 7; i++) p(ctx, 8 + i, 11 - i, m.light, 1, 1);
    p(ctx, 14, 3, m.light, 1, 1);
    p(ctx, 14, 4, '#ff9a63', 1, 1);
    p(ctx, 8, 11, '#2a1a12', 4, 1);
    p(ctx, 7, 12, '#3a2416', 2, 1);
    p(ctx, 6, 13, '#20120c', 2, 2);
    p(ctx, 5, 14, GOLD, 2, 1);
    p(ctx, 13, 5, '#ffb27a', 1, 1);
    return;
  }
  if (def.key === 'lucky_sword') {
    for (let i = 0; i < 7; i++) p(ctx, 7 + i, 10 - i, '#f4d25a', 2, 1);
    for (let i = 0; i < 6; i++) p(ctx, 8 + i, 10 - i, '#fff3b0', 1, 1);
    p(ctx, 14, 2, '#ffffff', 1, 1); p(ctx, 13, 2, '#fff3b0', 1, 1);
    p(ctx, 4, 11, '#3fc27a', 5, 2);
    p(ctx, 4, 11, '#9cf7bc', 5, 1);
    p(ctx, 4, 13, WOOD_DARK, 2, 2);
    p(ctx, 2, 14, GOLD, 2, 2);
    p(ctx, 10, 3, '#ffffff', 1, 1);
    p(ctx, 12, 1, '#b6ffd2', 1, 1);
    return;
  }
  // Generic tier sword.
  for (let i = 0; i < 7; i++) p(ctx, 7 + i, 10 - i, m.base, 2, 2);
  for (let i = 0; i < 6; i++) p(ctx, 7 + i, 10 - i, m.light, 1, 1);
  for (let i = 1; i < 7; i++) p(ctx, 8 + i, 11 - i, m.dark, 1, 1);
  p(ctx, 14, 2, m.light, 1, 1);
  p(ctx, 4, 11, GOLD, 5, 2);
  p(ctx, 4, 11, GOLD_LIGHT, 5, 1);
  p(ctx, 5, 13, WOOD_DARK, 2, 2);
  p(ctx, 3, 14, GOLD, 2, 1);
  p(ctx, 2, 14, GOLD_DARK, 1, 1);
}

function tool(ctx: Ctx, def: ItemDef): void {
  const m = metal(def.color);
  const type = def.toolType;
  if (type === 'shield') {
    p(ctx, 7, 1, '#6b4a28', 2, 2);
    for (let y = 2; y <= 13; y++) {
      const inset = y < 7 ? 4 : 4 + Math.floor((y - 6) / 2);
      p(ctx, 8 - inset, y, m.dark, inset * 2, 1);
      p(ctx, 8 - inset + 1, y, m.base, inset * 2 - 2, 1);
    }
    p(ctx, 4, 6, m.light, 8, 1);
    p(ctx, 7, 4, GOLD, 2, 8);
    p(ctx, 4, 7, GOLD_DARK, 8, 1);
    p(ctx, 5, 10, GOLD_DARK, 6, 1);
    p(ctx, 7, 4, GOLD_LIGHT, 1, 7);
    return;
  }
  if (type === 'staff') {
    line(ctx, 4, 14, 10, 7, WOOD, 2);
    line(ctx, 5, 14, 10, 8, WOOD_LIGHT, 1);
    p(ctx, 8, 6, GOLD_DARK, 4, 1);
    p(ctx, 9, 5, GOLD, 2, 1);
    blob(ctx, 11, 4, 3, 3, shade(def.color, -0.35));
    blob(ctx, 11, 4, 2, 2, def.color);
    p(ctx, 10, 2, shade(def.color, 0.6), 2, 1);
    p(ctx, 13, 4, shade(def.color, 0.35), 1, 1);
    p(ctx, 9, 1, shade(def.color, 0.4), 1, 1);
    p(ctx, 5, 12, '#5b3d21', 2, 1);
    return;
  }
  if (type === 'gun') {
    p(ctx, 2, 8, '#4b2f19', 4, 3);
    p(ctx, 2, 10, '#2c1b0e', 4, 2);
    p(ctx, 5, 7, m.dark, 9, 3);
    p(ctx, 6, 7, m.base, 8, 1);
    p(ctx, 12, 6, m.light, 3, 1);
    p(ctx, 7, 5, '#434c52', 3, 2);
    p(ctx, 8, 4, '#6d7a82', 2, 1);
    p(ctx, 13, 9, m.dark, 1, 2);
    p(ctx, 8, 10, '#5b3d21', 3, 2);
    p(ctx, 9, 12, '#3a2614', 2, 2);
    p(ctx, 5, 6, m.edge, 6, 1);
    p(ctx, 3, 7, m.light, 1, 2);
    return;
  }
  if (type === 'bow') {
    line(ctx, 10, 1, 13, 4, WOOD, 2);
    line(ctx, 13, 4, 13, 9, WOOD, 2);
    line(ctx, 13, 9, 10, 13, WOOD, 2);
    line(ctx, 11, 1, 14, 4, WOOD_LIGHT, 1);
    line(ctx, 14, 4, 14, 9, WOOD_LIGHT, 1);
    line(ctx, 14, 9, 11, 13, WOOD_LIGHT, 1);
    p(ctx, 12, 3, GOLD, 1, 1);
    p(ctx, 13, 9, GOLD, 1, 1);
    for (let y = 2; y <= 12; y++) p(ctx, 6 + Math.floor(Math.abs(y - 7) / 3), y, '#ded7bd', 1, 1);
    p(ctx, 10, 7, '#6b4a28', 3, 2);
    line(ctx, 7, 7, 12, 7, '#c9c1a8', 1);
    p(ctx, 12, 6, '#eee7d3', 2, 1);
    p(ctx, 14, 6, '#c9c1a8', 1, 3);
    return;
  }

  // All remaining tools use the same diagonal haft.
  line(ctx, 2, 14, 9, 7, WOOD_DARK, 2);
  line(ctx, 3, 14, 9, 8, WOOD, 2);
  line(ctx, 4, 14, 9, 9, WOOD_LIGHT, 1);
  p(ctx, 2, 14, '#c9a24e', 2, 1);

  if (type === 'pickaxe') {
    line(ctx, 2, 5, 5, 2, m.dark, 2);
    line(ctx, 5, 2, 10, 2, m.dark, 2);
    line(ctx, 10, 2, 14, 5, m.dark, 2);
    line(ctx, 3, 4, 6, 2, m.base, 1);
    line(ctx, 6, 2, 10, 2, m.base, 1);
    line(ctx, 10, 2, 13, 4, m.base, 1);
    p(ctx, 1, 6, m.base, 1, 1); p(ctx, 2, 7, m.dark, 1, 1);
    p(ctx, 14, 6, m.light, 1, 1); p(ctx, 13, 7, m.dark, 1, 1);
    p(ctx, 7, 2, m.light, 2, 1);
    return;
  }
  if (type === 'axe') {
    for (let row = 0; row < 6; row++) {
      const start = 8 + Math.floor(row / 2);
      p(ctx, start, 2 + row, row < 2 ? m.light : m.base, 13 - start, 1);
    }
    p(ctx, 8, 2, m.dark, 2, 1);
    p(ctx, 12, 2, m.base, 1, 1);
    p(ctx, 13, 3, m.light, 1, 1);
    p(ctx, 8, 7, m.edge, 5, 1);
    p(ctx, 7, 5, m.dark, 1, 2);
    return;
  }
  if (type === 'shovel') {
    p(ctx, 9, 1, m.light, 5, 1);
    p(ctx, 8, 2, m.base, 6, 2);
    p(ctx, 9, 4, m.base, 4, 1);
    p(ctx, 10, 5, m.dark, 2, 1);
    p(ctx, 9, 2, m.light, 1, 3);
    p(ctx, 13, 2, m.edge, 1, 3);
    p(ctx, 10, 1, m.light, 2, 1);
    return;
  }
  if (type === 'hoe') {
    p(ctx, 8, 2, m.dark, 6, 2);
    p(ctx, 8, 2, m.base, 5, 1);
    p(ctx, 13, 3, m.dark, 2, 3);
    p(ctx, 13, 3, m.light, 1, 2);
    p(ctx, 8, 1, m.light, 3, 1);
    p(ctx, 7, 3, m.dark, 2, 1);
    return;
  }

  // Shield-ish fallback.
  p(ctx, 5, 4, m.base, 6, 8);
  p(ctx, 6, 3, m.light, 4, 1);
}

/* ------------------------------------------------------------------ */
/*  Food                                                               */
/* ------------------------------------------------------------------ */

function food(ctx: Ctx, def: ItemDef): void {
  const k = def.key;
  const c = def.color;

  if (k === 'apple' || k === 'golden_apple') {
    blob(ctx, 8, 9, 4, 4, shade(c, -0.35));
    blob(ctx, 8, 8, 4, 4, c);
    p(ctx, 5, 6, shade(c, 0.5), 2, 2);
    p(ctx, 6, 5, shade(c, 0.62), 1, 1);
    p(ctx, 9, 3, '#5b3a1e', 1, 3);
    p(ctx, 10, 4, '#5d9a45', 3, 1);
    p(ctx, 12, 3, '#4a8338', 1, 1);
    if (k === 'golden_apple') {
      p(ctx, 11, 9, '#fff3b0', 1, 1);
      p(ctx, 4, 10, '#fff3b0', 1, 1);
      p(ctx, 8, 12, '#f6d77c', 1, 1);
      p(ctx, 3, 5, '#fff9d6', 1, 1);
    }
    return;
  }
  if (k === 'bread') {
    blob(ctx, 8, 8, 5, 3, '#8f5e30');
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 4, 7, shade(c, 0.3), 8, 1);
    p(ctx, 6, 6, '#8f5e30', 1, 1);
    p(ctx, 9, 6, '#8f5e30', 1, 1);
    p(ctx, 7, 9, '#8f5e30', 1, 1);
    p(ctx, 10, 9, '#8f5e30', 2, 1);
    p(ctx, 4, 10, shade(c, -0.25), 8, 1);
    return;
  }
  if (k === 'stew' || k === 'pumpkin_soup' || k === 'ramen') {
    p(ctx, 3, 8, '#5f656a', 10, 1);
    p(ctx, 4, 9, '#7b8287', 8, 4);
    p(ctx, 5, 13, '#4d5357', 6, 1);
    p(ctx, 5, 8, k === 'pumpkin_soup' ? '#d98a33' : '#a86a3b', 6, 1);
    p(ctx, 6, 7, '#d9a15c', 4, 1);
    if (k === 'ramen') {
      p(ctx, 6, 8, '#f2d98a', 4, 1);
      p(ctx, 5, 10, '#e8c06b', 6, 1);
      p(ctx, 7, 9, '#fff0c4', 2, 1);
      p(ctx, 9, 9, '#7fa84b', 2, 1);
      p(ctx, 6, 9, '#f7f2dd', 1, 1);
      p(ctx, 11, 9, '#f7f2dd', 1, 1);
    } else if (k === 'pumpkin_soup') {
      p(ctx, 6, 8, '#f0b45a', 4, 1);
      p(ctx, 8, 7, '#7fa84b', 1, 1);
      p(ctx, 5, 9, '#e3a25a', 1, 1);
    } else {
      p(ctx, 5, 8, '#e3a25a', 2, 1);
      p(ctx, 8, 7, '#c96f3c', 2, 1);
      p(ctx, 10, 8, '#7fa84b', 1, 1);
    }
    p(ctx, 6, 4, '#d9d2c1', 1, 1); p(ctx, 9, 3, '#d9d2c1', 1, 1);
    p(ctx, 4, 5, '#d9d2c1', 1, 1);
    return;
  }
  if (k === 'water_bottle' || k === 'milk') {
    p(ctx, 7, 2, '#b7c4c9', 2, 1);
    p(ctx, 6, 3, '#dce6e8', 4, 1);
    p(ctx, 5, 4, k === 'milk' ? '#f3efe2' : '#7ac7ea', 6, 8);
    p(ctx, 5, 11, k === 'milk' ? '#ded7c5' : '#4d94bd', 6, 1);
    p(ctx, 6, 5, '#ffffff', 1, 5);
    p(ctx, 6, 2, '#7c5b39', 4, 1);
    return;
  }
  if (k === 'burger') {
    p(ctx, 3, 11, '#c98f4c', 10, 2);
    p(ctx, 4, 12, '#a96f33', 8, 1);
    p(ctx, 3, 9, '#5aa53c', 10, 1);
    p(ctx, 4, 8, '#8f4a2c', 8, 1);
    p(ctx, 3, 7, '#f3c14f', 10, 1);
    p(ctx, 4, 5, '#e0a14f', 8, 2);
    p(ctx, 5, 4, '#f2c277', 6, 1);
    p(ctx, 6, 5, '#fff0c0', 1, 1); p(ctx, 10, 5, '#fff0c0', 1, 1);
    return;
  }
  if (k === 'cheese_pizza') {
    p(ctx, 2, 4, '#e8bb62', 12, 2);
    p(ctx, 3, 6, '#f2cf75', 10, 5);
    p(ctx, 4, 11, '#e8bb62', 8, 1);
    p(ctx, 6, 5, '#d4553c', 2, 2);
    p(ctx, 10, 6, '#d4553c', 2, 2);
    p(ctx, 7, 8, '#d4553c', 2, 2);
    p(ctx, 5, 7, '#fff0b0', 1, 1);
    p(ctx, 11, 9, '#fff0b0', 1, 1);
    p(ctx, 2, 4, '#f6df9f', 12, 1);
    return;
  }
  if (k === 'garden_salad') {
    p(ctx, 3, 8, '#cfd7d2', 10, 1);
    p(ctx, 4, 9, '#8f9a95', 8, 4);
    p(ctx, 5, 13, '#727d78', 6, 1);
    p(ctx, 4, 7, '#5aa53c', 3, 2);
    p(ctx, 7, 6, '#78bf4a', 3, 2);
    p(ctx, 10, 7, '#4e8a34', 2, 2);
    p(ctx, 6, 8, '#d4553c', 2, 1);
    p(ctx, 9, 8, '#f3c14f', 1, 1);
    return;
  }
  if (k === 'cake_slice') {
    p(ctx, 3, 5, '#f2e1c9', 9, 1);
    p(ctx, 3, 6, '#f7ece0', 9, 2);
    p(ctx, 3, 8, '#d7a06a', 9, 4);
    p(ctx, 3, 12, '#b97a48', 9, 1);
    p(ctx, 5, 8, '#f7ece0', 1, 3);
    p(ctx, 9, 8, '#f7ece0', 1, 3);
    p(ctx, 6, 4, '#d4553c', 2, 2);
    p(ctx, 7, 3, '#5d9a45', 1, 1);
    return;
  }
  if (k === 'coffee' || k === 'tea') {
    const liquid = k === 'tea' ? '#b5762d' : '#5b3520';
    p(ctx, 3, 6, '#e4e7e1', 8, 1);
    p(ctx, 3, 7, '#f2f5ef', 8, 5);
    p(ctx, 4, 8, liquid, 6, 3);
    p(ctx, 11, 8, '#f2f5ef', 2, 1);
    p(ctx, 12, 9, '#d7ded8', 1, 2);
    p(ctx, 3, 12, '#c4ccc6', 8, 1);
    p(ctx, 5, 2, '#d9d2c1', 1, 1);
    p(ctx, 7, 1, '#d9d2c1', 1, 1);
    if (k === 'tea') p(ctx, 9, 3, '#e0a14f', 1, 3);
    return;
  }
  if (k === 'golden_carrot') {
    for (let i = 0; i < 5; i++) p(ctx, 7 - Math.floor(i / 2), 5 + i * 2, '#f3c951', 3 + (i < 2 ? 1 : 0), 2);
    p(ctx, 9, 3, '#5d9a45', 1, 3);
    p(ctx, 7, 2, '#5d9a45', 2, 2);
    p(ctx, 11, 3, '#5d9a45', 2, 1);
    p(ctx, 8, 5, '#fff3b0', 1, 3);
    return;
  }
  if (k === 'carrot') {
    for (let i = 0; i < 6; i++) p(ctx, 7 - Math.floor(i / 3), 5 + i * 1.6, c, 3 + (i < 2 ? 1 : 0), 2);
    p(ctx, 9, 2, '#5d9a45', 1, 3);
    p(ctx, 7, 3, '#5d9a45', 2, 1);
    p(ctx, 8, 6, shade(c, 0.35), 1, 3);
    return;
  }
  if (k === 'potato' || k === 'baked_potato') {
    blob(ctx, 8, 8, 4, 3, shade(c, -0.25));
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 6, 6, shade(c, 0.3), 2, 1);
    p(ctx, 10, 7, '#6f4f2b', 1, 1);
    p(ctx, 7, 10, '#6f4f2b', 1, 1);
    if (k === 'baked_potato') {
      p(ctx, 4, 7, '#f2d27a', 1, 1);
      p(ctx, 12, 9, '#f2d27a', 1, 1);
    }
    return;
  }
  if (k === 'raw_fish' || k === 'cooked_fish') {
    const body = k === 'cooked_fish' ? c : c;
    blob(ctx, 7, 8, 4, 3, shade(body, -0.25));
    blob(ctx, 7, 8, 4, 3, body);
    p(ctx, 11, 7, body, 2, 1); p(ctx, 11, 9, body, 2, 1);
    p(ctx, 13, 6, shade(body, -0.2), 1, 1); p(ctx, 13, 7, shade(body, -0.2), 1, 3); p(ctx, 13, 10, shade(body, -0.2), 1, 1);
    p(ctx, 5, 7, '#f7f2dd', 1, 1); p(ctx, 6, 7, '#20242a', 1, 1);
    p(ctx, 7, 6, shade(body, 0.35), 3, 1);
    if (k === 'cooked_fish') {
      p(ctx, 6, 9, '#6f4429', 1, 1);
      p(ctx, 8, 10, '#6f4429', 1, 1);
    }
    return;
  }
  if (k === 'chicken_meat' || k === 'cooked_chicken') {
    blob(ctx, 8, 8, 4, 3, shade(c, -0.25));
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 5, 5, '#f3ecd9', 2, 2);
    p(ctx, 4, 4, '#f7f2e3', 2, 2);
    p(ctx, 7, 7, shade(c, 0.35), 3, 1);
    if (k === 'cooked_chicken') {
      p(ctx, 9, 10, '#6f4429', 2, 1);
      p(ctx, 6, 9, '#6f4429', 1, 1);
    }
    return;
  }
  if (k === 'raw_beef' || k === 'cooked_beef' || k === 'raw_porkchop' || k === 'cooked_porkchop') {
    blob(ctx, 8, 8, 4, 3, shade(c, -0.3));
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 5, 6, shade(c, 0.3), 3, 1);
    p(ctx, 10, 9, shade(c, -0.2), 2, 1);
    if (k.includes('pork')) {
      p(ctx, 4, 10, '#f3ecd9', 2, 2);
      p(ctx, 3, 11, '#e4dcc8', 1, 2);
    }
    if (k.startsWith('cooked')) {
      p(ctx, 6, 7, '#5e321c', 1, 1);
      p(ctx, 8, 9, '#5e321c', 1, 1);
      p(ctx, 10, 7, '#5e321c', 1, 1);
    } else {
      p(ctx, 6, 9, '#f3c6bd', 1, 1);
      p(ctx, 9, 6, '#f3c6bd', 1, 1);
    }
    return;
  }
  if (k === 'rotten_flesh') {
    p(ctx, 4, 5, c, 3, 3);
    p(ctx, 8, 6, shade(c, -0.18), 3, 4);
    p(ctx, 5, 8, shade(c, -0.1), 4, 4);
    p(ctx, 9, 10, shade(c, -0.25), 3, 2);
    p(ctx, 6, 5, shade(c, 0.25), 1, 1);
    p(ctx, 10, 8, '#4e5a35', 1, 1);
    return;
  }
  if (k === 'honeycomb') {
    p(ctx, 3, 4, '#c88e24', 10, 9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = 4 + col * 3 + (row % 2);
        const y = 5 + row * 3;
        p(ctx, x, y, '#f7d06f', 2, 2);
        p(ctx, x, y, '#fff0b0', 1, 1);
      }
    }
    p(ctx, 3, 4, '#f0b53b', 10, 1);
    return;
  }
  if (k === 'spider_eye') {
    blob(ctx, 8, 8, 4, 4, shade(c, -0.3));
    blob(ctx, 8, 8, 4, 4, c);
    p(ctx, 6, 6, '#5c1d23', 3, 3);
    p(ctx, 7, 7, '#e7d8a2', 2, 2);
    p(ctx, 5, 9, '#c96b6f', 1, 1);
    return;
  }
  if (k === 'magma_cream') {
    blob(ctx, 8, 8, 4, 3, '#b74a25');
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 5, 7, '#ffd36e', 2, 1);
    p(ctx, 9, 9, '#612817', 2, 1);
    p(ctx, 7, 5, '#ffb14f', 2, 1);
    return;
  }
  if (k === 'slimeball') {
    blob(ctx, 8, 9, 4, 3, shade(c, -0.3));
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 5, 6, shade(c, 0.55), 2, 2);
    p(ctx, 9, 10, shade(c, -0.2), 2, 1);
    return;
  }
  // Generic fruit / ingredient.
  blob(ctx, 8, 8, 4, 3, shade(c, -0.3));
  blob(ctx, 8, 8, 4, 3, c);
  p(ctx, 6, 6, shade(c, 0.4), 2, 1);
}

/* ------------------------------------------------------------------ */
/*  Materials                                                          */
/* ------------------------------------------------------------------ */

function material(ctx: Ctx, def: ItemDef): void {
  const k = def.key;
  const c = def.color;

  if (k === 'stick') {
    line(ctx, 4, 12, 12, 4, WOOD_DARK, 2);
    line(ctx, 5, 12, 12, 5, WOOD, 2);
    line(ctx, 5, 11, 11, 5, WOOD_LIGHT, 1);
    p(ctx, 3, 13, '#5b3d21', 2, 1);
    return;
  }
  if (k === 'coal' || k === 'charcoal') {
    p(ctx, 4, 6, '#1c1d21', 6, 5);
    p(ctx, 7, 4, '#2e3036', 5, 6);
    p(ctx, 5, 9, '#383a40', 7, 3);
    p(ctx, 8, 5, '#55575d', 2, 1);
    p(ctx, 10, 9, '#121317', 2, 1);
    return;
  }
  if (k === 'iron_ingot' || k === 'gold_ingot' || k === 'copper_ingot' || k === 'netherite_ingot') {
    const m = metal(c);
    p(ctx, 3, 7, m.dark, 10, 2);
    p(ctx, 4, 5, m.base, 9, 4);
    p(ctx, 5, 4, m.light, 7, 2);
    p(ctx, 4, 9, m.edge, 9, 1);
    p(ctx, 5, 5, m.light, 3, 1);
    p(ctx, 11, 6, m.edge, 1, 2);
    return;
  }
  if (k === 'coin' || k === 'lucky_coin') {
    blob(ctx, 8, 8, 4, 4, GOLD_DARK);
    blob(ctx, 8, 8, 3, 3, k === 'lucky_coin' ? '#f7d85a' : c);
    p(ctx, 6, 5, GOLD_LIGHT, 2, 1);
    p(ctx, 8, 6, GOLD_DARK, 1, 4);
    p(ctx, 7, 8, GOLD_DARK, 2, 1);
    if (k === 'lucky_coin') p(ctx, 10, 10, '#ffffff', 1, 1);
    return;
  }
  if (k === 'diamond' || k === 'emerald' || k === 'crystal_shard' || k === 'void_essence' || k === 'rune_stone' || k === 'dragon_scale') {
    const light = shade(c, 0.55);
    const dark = shade(c, -0.35);
    if (k === 'rune_stone') {
      p(ctx, 3, 4, '#494455', 10, 9);
      p(ctx, 4, 3, '#5d586e', 8, 10);
      p(ctx, 6, 5, light, 2, 1);
      p(ctx, 5, 7, light, 2, 3);
      p(ctx, 7, 9, light, 3, 1);
      p(ctx, 9, 6, light, 1, 2);
      return;
    }
    if (k === 'dragon_scale') {
      p(ctx, 8, 1, c, 1, 3);
      p(ctx, 6, 3, c, 5, 2);
      p(ctx, 4, 5, c, 9, 4);
      p(ctx, 5, 9, c, 7, 3);
      p(ctx, 6, 12, c, 5, 2);
      p(ctx, 7, 4, light, 3, 2);
      p(ctx, 6, 9, dark, 3, 2);
      return;
    }
    if (k === 'void_essence') {
      blob(ctx, 8, 8, 4, 4, dark);
      blob(ctx, 8, 8, 3, 3, c);
      p(ctx, 6, 5, light, 2, 2);
      p(ctx, 9, 10, dark, 2, 1);
      p(ctx, 10, 4, light, 1, 1);
      return;
    }
    // Cut gem.
    p(ctx, 8, 2, c, 1, 2);
    p(ctx, 6, 4, c, 5, 2);
    p(ctx, 5, 6, c, 7, 3);
    p(ctx, 6, 9, c, 5, 2);
    p(ctx, 8, 11, c, 1, 1);
    p(ctx, 7, 4, light, 2, 2);
    p(ctx, 9, 8, dark, 2, 2);
    p(ctx, 6, 7, light, 1, 1);
    return;
  }
  if (k === 'redstone') {
    p(ctx, 4, 5, c, 2, 2); p(ctx, 9, 7, c, 2, 2); p(ctx, 6, 10, c, 2, 2);
    p(ctx, 11, 4, c, 1, 1); p(ctx, 3, 9, c, 1, 1); p(ctx, 10, 11, c, 1, 1);
    return;
  }
  if (k === 'string' || k === 'noodles') {
    if (k === 'noodles') {
      p(ctx, 4, 6, '#e8cf8a', 8, 5);
      p(ctx, 4, 7, '#f6e6b8', 1, 3); p(ctx, 6, 6, '#f6e6b8', 1, 4); p(ctx, 8, 7, '#d9b96b', 1, 3); p(ctx, 10, 6, '#f6e6b8', 1, 4);
      return;
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.bezierCurveTo(12, 4, 5, 10, 11, 10);
    ctx.bezierCurveTo(13, 10, 8, 6, 4, 12);
    ctx.stroke();
    return;
  }
  if (k === 'feather') {
    line(ctx, 4, 13, 11, 4, '#c9c1a8', 1);
    p(ctx, 10, 3, c, 2, 3);
    p(ctx, 8, 5, c, 2, 2);
    p(ctx, 6, 7, c, 2, 2);
    p(ctx, 11, 5, shade(c, -0.2), 1, 2);
    return;
  }
  if (k === 'leather' || k === 'rabbit_hide') {
    p(ctx, 3, 4, c, 2, 2); p(ctx, 5, 3, c, 6, 2); p(ctx, 11, 4, c, 2, 2);
    p(ctx, 2, 6, c, 12, 6);
    p(ctx, 4, 12, c, 7, 1);
    p(ctx, 4, 5, shade(c, 0.28), 4, 2);
    p(ctx, 5, 8, shade(c, -0.2), 2, 2);
    return;
  }
  if (k === 'bone') {
    p(ctx, 7, 4, c, 2, 8);
    p(ctx, 5, 2, c, 2, 2); p(ctx, 9, 2, c, 2, 2);
    p(ctx, 5, 10, c, 2, 2); p(ctx, 9, 10, c, 2, 2);
    p(ctx, 8, 4, shade(c, -0.18), 1, 7);
    return;
  }
  if (k === 'wheat') {
    p(ctx, 8, 4, '#8c9d45', 1, 10);
    p(ctx, 7, 13, '#8c9d45', 1, 1);
    for (let i = 0; i < 3; i++) {
      p(ctx, 4, 4 + i * 3, c, 4, 1);
      p(ctx, 9, 5 + i * 3, c, 3, 1);
    }
    p(ctx, 6, 3, c, 2, 1); p(ctx, 10, 4, c, 2, 1);
    return;
  }
  if (k === 'paper' || k === 'newspaper') {
    if (k === 'newspaper') {
      p(ctx, 3, 5, '#c9c2ae', 10, 7);
      p(ctx, 4, 6, '#f2edde', 8, 5);
      p(ctx, 4, 6, '#7d7a70', 8, 1);
      p(ctx, 5, 8, '#9a9588', 5, 1); p(ctx, 5, 10, '#9a9588', 6, 1);
      p(ctx, 3, 12, '#b3ac98', 10, 1);
      return;
    }
    p(ctx, 4, 3, '#d5cdb8', 9, 10);
    p(ctx, 5, 2, c, 8, 10);
    p(ctx, 6, 5, '#9a9280', 6, 1); p(ctx, 6, 7, '#9a9280', 5, 1); p(ctx, 6, 9, '#9a9280', 6, 1);
    return;
  }
  if (k === 'book' || k === 'enchanted_book') {
    const cover = k === 'enchanted_book' ? '#385a9e' : '#5d3c25';
    p(ctx, 3, 3, cover, 10, 11);
    p(ctx, 4, 4, k === 'enchanted_book' ? '#5f8fe0' : c, 8, 9);
    p(ctx, 4, 4, shade(cover, -0.25), 2, 9);
    p(ctx, 7, 5, '#e3d9b8', 4, 1); p(ctx, 7, 7, '#e3d9b8', 4, 1);
    p(ctx, 7, 9, '#e3d9b8', 3, 1);
    if (k === 'enchanted_book') {
      p(ctx, 11, 3, '#b6ffd2', 1, 1); p(ctx, 12, 5, '#ffffff', 1, 1); p(ctx, 5, 12, '#b6ffd2', 1, 1);
    }
    return;
  }
  if (k === 'gunpowder') {
    p(ctx, 3, 9, '#3b3b3d', 10, 3);
    p(ctx, 4, 7, '#2e2f33', 3, 2); p(ctx, 8, 6, '#4b4c50', 3, 2); p(ctx, 10, 9, '#6b6c70', 2, 2);
    p(ctx, 5, 8, '#74757a', 1, 1); p(ctx, 9, 7, '#8a8b90', 1, 1);
    return;
  }
  if (k === 'raw_fish' || k === 'cooked_fish') {
    food(ctx, def);
    return;
  }
  if (k === 'soap') {
    p(ctx, 4, 7, '#d9f2e8', 8, 5);
    p(ctx, 3, 8, '#b7dccf', 10, 3);
    p(ctx, 5, 6, '#ffffff', 4, 2);
    p(ctx, 10, 4, '#bfe9ff', 1, 1); p(ctx, 12, 6, '#bfe9ff', 1, 1); p(ctx, 11, 2, '#ffffff', 1, 1);
    return;
  }
  if (k === 'candle') {
    p(ctx, 7, 4, '#e8ddc4', 3, 7);
    p(ctx, 7, 4, '#fff4d8', 1, 6);
    p(ctx, 6, 11, '#c9a24e', 5, 1);
    p(ctx, 8, 2, '#ffb14f', 1, 2);
    p(ctx, 8, 1, '#fff3b0', 1, 1);
    return;
  }
  if (k === 'soda') {
    p(ctx, 5, 3, '#d4553c', 6, 10);
    p(ctx, 5, 3, '#f07a5c', 1, 9);
    p(ctx, 5, 1, '#c9c9c9', 6, 2);
    p(ctx, 6, 5, '#f2f2f2', 3, 2);
    p(ctx, 6, 5, '#7ac7ea', 2, 1);
    return;
  }
  if (k === 'snack_bar') {
    p(ctx, 3, 5, '#d9a62e', 10, 7);
    p(ctx, 4, 4, '#f2c14f', 8, 8);
    p(ctx, 5, 6, '#8f4a2c', 6, 4);
    p(ctx, 5, 5, '#b97a48', 6, 1);
    p(ctx, 4, 4, '#fff0c0', 8, 1);
    return;
  }
  if (k === 'toy_car') {
    p(ctx, 3, 7, '#d4553c', 10, 3);
    p(ctx, 5, 5, '#f07a5c', 5, 3);
    p(ctx, 6, 5, '#bfe9ff', 3, 2);
    p(ctx, 4, 10, '#25272c', 2, 2); p(ctx, 10, 10, '#25272c', 2, 2);
    p(ctx, 3, 9, '#f2c14f', 1, 1); p(ctx, 12, 9, '#f2c14f', 1, 1);
    return;
  }
  if (k === 'dough') {
    blob(ctx, 8, 8, 4, 3, '#d9b96b');
    p(ctx, 5, 6, '#f0dda8', 3, 1);
    p(ctx, 10, 9, '#b98f4a', 2, 1);
    p(ctx, 12, 5, '#f7f2dd', 1, 1); p(ctx, 3, 10, '#f7f2dd', 1, 1);
    return;
  }
  if (k === 'butter') {
    p(ctx, 3, 6, '#f2d27a', 10, 5);
    p(ctx, 4, 5, '#f7e6a3', 8, 2);
    p(ctx, 3, 10, '#d9b24f', 10, 1);
    p(ctx, 5, 6, '#fff3b0', 2, 1);
    return;
  }
  if (k === 'chocolate') {
    p(ctx, 3, 4, '#5e321c', 10, 9);
    p(ctx, 4, 4, '#8f4a2c', 8, 3);
    p(ctx, 4, 8, '#8f4a2c', 8, 4);
    p(ctx, 4, 7, '#3f2112', 8, 1);
    p(ctx, 8, 4, '#3f2112', 1, 8);
    return;
  }
  if (k === 'rice') {
    p(ctx, 4, 7, '#e8e2cc', 8, 5);
    p(ctx, 5, 6, '#f7f2dd', 6, 2);
    p(ctx, 6, 5, '#f7f2dd', 1, 1); p(ctx, 9, 5, '#f7f2dd', 1, 1);
    p(ctx, 4, 11, '#cfc7ae', 8, 1);
    return;
  }
  if (k === 'broth') {
    p(ctx, 5, 4, '#7d8a86', 7, 8);
    p(ctx, 6, 3, '#a4b0aa', 5, 1);
    p(ctx, 6, 5, '#c98f4c', 5, 5);
    p(ctx, 6, 5, '#e3a25a', 5, 1);
    p(ctx, 7, 7, '#f2d98a', 1, 1); p(ctx, 9, 8, '#7fa84b', 1, 1);
    return;
  }
  if (k === 'coffee_bean') {
    blob(ctx, 6, 7, 2, 3, '#5b3520'); blob(ctx, 10, 9, 2, 3, '#5b3520');
    p(ctx, 5, 5, '#8f5a34', 1, 1); p(ctx, 9, 7, '#8f5a34', 1, 1);
    p(ctx, 6, 6, '#2c1a0e', 1, 2); p(ctx, 10, 8, '#2c1a0e', 1, 2);
    return;
  }
  if (k === 'tea_leaf') {
    line(ctx, 8, 12, 8, 6, '#4e7d3c', 1);
    p(ctx, 5, 5, '#5aa53c', 3, 3); p(ctx, 9, 4, '#4e8a34', 3, 3); p(ctx, 7, 8, '#78bf4a', 3, 2);
    p(ctx, 5, 5, '#8ed46a', 1, 1); p(ctx, 9, 4, '#8ed46a', 1, 1);
    return;
  }
  if (k === 'tomato') {
    blob(ctx, 8, 8, 4, 3, '#a8322c');
    blob(ctx, 8, 8, 4, 3, c);
    p(ctx, 5, 6, '#f07a5c', 2, 1);
    p(ctx, 7, 4, '#5d9a45', 2, 1); p(ctx, 6, 5, '#5d9a45', 1, 1); p(ctx, 9, 5, '#5d9a45', 1, 1);
    return;
  }
  if (k === 'lettuce') {
    blob(ctx, 8, 8, 4, 4, '#4e8a34');
    blob(ctx, 8, 8, 3, 3, '#78bf4a');
    p(ctx, 5, 6, '#8ed46a', 2, 2); p(ctx, 9, 9, '#4e8a34', 2, 1);
    p(ctx, 7, 4, '#a4e07a', 1, 2);
    return;
  }
  if (k === 'onion') {
    blob(ctx, 8, 8, 4, 4, '#7b4ca1');
    blob(ctx, 8, 8, 3, 3, '#a47ac4');
    p(ctx, 7, 4, '#5d9a45', 1, 3);
    p(ctx, 9, 3, '#4e8a34', 1, 2);
    p(ctx, 6, 7, '#d4b8e8', 1, 3);
    return;
  }
  if (k === 'mushroom') {
    blob(ctx, 8, 6, 4, 2, '#b4443c');
    p(ctx, 4, 7, '#b4443c', 8, 2);
    p(ctx, 5, 5, '#e06a5c', 2, 1); p(ctx, 9, 6, '#f2b8a8', 1, 1);
    p(ctx, 7, 9, '#e8ddc4', 2, 4);
    return;
  }
  if (k === 'egg') {
    blob(ctx, 8, 8, 3, 4, '#d9cfb8');
    blob(ctx, 8, 8, 3, 3, '#f7f2dd');
    p(ctx, 6, 6, '#ffffff', 1, 2);
    p(ctx, 9, 9, '#cfc7ae', 1, 1);
    return;
  }
  if (k === 'cheese') {
    p(ctx, 3, 5, '#f3c951', 9, 7);
    p(ctx, 4, 4, '#f7dd8a', 7, 2);
    p(ctx, 10, 11, '#d9a62e', 2, 1);
    p(ctx, 6, 7, '#c98f24', 2, 2);
    p(ctx, 9, 9, '#c98f24', 1, 1);
    p(ctx, 4, 5, '#fff0b0', 3, 1);
    return;
  }
  if (k === 'milk') {
    food(ctx, def);
    return;
  }
  if (k === 'rifle_ammo') {
    p(ctx, 4, 4, '#b98c45', 2, 8);
    p(ctx, 4, 2, '#e6cf8a', 2, 2);
    p(ctx, 8, 4, '#b98c45', 2, 8);
    p(ctx, 8, 2, '#e6cf8a', 2, 2);
    p(ctx, 12, 6, '#c9a15a', 2, 6);
    p(ctx, 12, 5, '#e6cf8a', 2, 1);
    return;
  }
  if (k === 'arrow') {
    line(ctx, 3, 13, 12, 3, '#c7c2b2', 1);
    p(ctx, 12, 2, '#d9d3c2', 2, 2);
    p(ctx, 10, 4, '#d9d3c2', 2, 1);
    p(ctx, 2, 14, '#e8e2d2', 2, 1);
    p(ctx, 1, 13, '#e8e2d2', 1, 2);
    p(ctx, 8, 6, '#8a8474', 1, 1);
    return;
  }
  // Generic material fallback: faceted nugget.
  p(ctx, 5, 5, shade(c, -0.3), 6, 6);
  p(ctx, 6, 4, c, 4, 7);
  p(ctx, 6, 4, shade(c, 0.4), 2, 2);
}

/* ------------------------------------------------------------------ */
/*  Special items                                                      */
/* ------------------------------------------------------------------ */

function special(ctx: Ctx, def: ItemDef): void {
  const k = def.key;
  if (k === 'bucket') {
    p(ctx, 4, 5, '#9aa4ac', 8, 1);
    p(ctx, 4, 6, '#bcc6ce', 1, 6);
    p(ctx, 11, 6, '#8a949c', 1, 6);
    p(ctx, 4, 11, '#7b858d', 8, 1);
    p(ctx, 5, 6, '#6ebfe8', 6, 4);
    p(ctx, 5, 6, '#d8f2ff', 2, 1);
    return;
  }
  if (k === 'compass') {
    blob(ctx, 8, 8, 4, 4, '#6b7077');
    blob(ctx, 8, 8, 3, 3, '#d6c089');
    p(ctx, 7, 4, '#b4443c', 2, 4);
    p(ctx, 8, 8, '#f2f2f2', 1, 1);
    p(ctx, 6, 5, '#fff0c0', 1, 1);
    return;
  }
  if (k === 'map') {
    p(ctx, 3, 4, '#d8c99d', 10, 8);
    p(ctx, 4, 3, '#e8ddb8', 8, 10);
    p(ctx, 5, 6, '#8a7a4e', 1, 3); p(ctx, 7, 5, '#8a7a4e', 4, 1);
    p(ctx, 10, 8, '#8a7a4e', 1, 3); p(ctx, 6, 10, '#b4443c', 1, 1);
    p(ctx, 9, 4, '#b4443c', 1, 1);
    return;
  }
  if (k === 'totem') {
    p(ctx, 6, 3, '#7be7a8', 4, 2);
    p(ctx, 5, 5, '#4fbf83', 6, 6);
    p(ctx, 6, 2, '#c8ffdc', 1, 1); p(ctx, 9, 2, '#c8ffdc', 1, 1);
    p(ctx, 7, 7, '#1f6b47', 2, 1); p(ctx, 6, 9, '#1f6b47', 4, 1);
    p(ctx, 5, 11, '#3ea36f', 6, 2);
    p(ctx, 7, 12, '#7be7a8', 2, 1);
    return;
  }
  if (k === 'spawn_egg') {
    blob(ctx, 8, 8, 3, 4, '#b48cff');
    blob(ctx, 8, 8, 3, 3, '#d4bfff');
    p(ctx, 6, 6, '#7b4ca1', 1, 1); p(ctx, 9, 9, '#7b4ca1', 1, 1); p(ctx, 10, 6, '#7b4ca1', 1, 1);
    return;
  }
  material(ctx, def);
}

/* ------------------------------------------------------------------ */
/*  Armor                                                              */
/* ------------------------------------------------------------------ */

function armor(ctx: Ctx, def: ItemDef): void {
  const c = def.color;
  const light = shade(c, 0.4);
  const dark = shade(c, -0.32);
  if (def.key === 'chef_hat') {
    // Tall pleated toque with a wide band and a dark cream contour.
    p(ctx, 5, 1, '#c9c3b1', 6, 1);
    p(ctx, 4, 2, '#c9c3b1', 8, 1);
    p(ctx, 3, 3, '#c9c3b1', 1, 8);
    p(ctx, 12, 3, '#c9c3b1', 1, 8);
    p(ctx, 4, 10, '#c9c3b1', 8, 1);
    p(ctx, 4, 2, '#ffffff', 8, 8);
    p(ctx, 3, 4, '#f7f5ec', 1, 6);
    p(ctx, 12, 4, '#e8e4d6', 1, 6);
    p(ctx, 5, 1, '#ffffff', 6, 1);
    p(ctx, 6, 3, '#e8e4d6', 1, 7);
    p(ctx, 8, 2, '#e8e4d6', 1, 8);
    p(ctx, 10, 3, '#d9d3c2', 1, 7);
    p(ctx, 4, 3, '#ffffff', 1, 4);
    // Band.
    p(ctx, 3, 11, '#b9b3a2', 10, 3);
    p(ctx, 4, 11, '#f7f5ec', 8, 2);
    p(ctx, 4, 13, '#d9d3c2', 8, 1);
    return;
  }
  if (def.key === 'apron') {
    // V neck straps, bib, waist tie and a flared skirt with a deep pocket.
    p(ctx, 7, 1, '#8d8778', 2, 1);
    p(ctx, 6, 2, '#8d8778', 1, 2);
    p(ctx, 9, 2, '#8d8778', 1, 2);
    p(ctx, 5, 3, '#8d8778', 1, 1);
    p(ctx, 10, 3, '#8d8778', 1, 1);
    p(ctx, 5, 4, '#b9b3a2', 6, 4);
    p(ctx, 6, 4, '#f7f5ec', 4, 3);
    p(ctx, 3, 8, '#c9c3b1', 10, 1);
    p(ctx, 7, 8, '#b9b3a2', 2, 1);
    p(ctx, 5, 7, '#c9c3b1', 2, 1);
    p(ctx, 10, 7, '#c9c3b1', 2, 1);
    p(ctx, 3, 9, '#b9b3a2', 10, 1);
    p(ctx, 3, 10, '#f7f5ec', 10, 3);
    p(ctx, 4, 9, '#f7f5ec', 8, 1);
    p(ctx, 11, 10, '#e8e4d6', 2, 3);
    p(ctx, 2, 13, '#b9b3a2', 12, 1);
    p(ctx, 6, 10, '#c9c3b1', 4, 1);
    p(ctx, 7, 11, '#d9d3c2', 2, 1);
    p(ctx, 4, 9, '#ffffff', 2, 1);
    return;
  }
  switch (def.armorSlot) {
    case 'helmet':
      p(ctx, 4, 4, c, 8, 3);
      p(ctx, 3, 7, c, 10, 4);
      p(ctx, 4, 11, c, 2, 2); p(ctx, 10, 11, c, 2, 2);
      p(ctx, 5, 5, light, 5, 1);
      p(ctx, 4, 8, dark, 2, 3); p(ctx, 10, 8, dark, 2, 3);
      p(ctx, 7, 9, '#1b2226', 2, 2);
      break;
    case 'chestplate':
      p(ctx, 3, 4, c, 10, 3);
      p(ctx, 2, 7, c, 3, 3); p(ctx, 11, 7, c, 3, 3);
      p(ctx, 4, 7, c, 8, 6);
      p(ctx, 5, 5, light, 6, 1);
      p(ctx, 7, 7, dark, 2, 6);
      p(ctx, 4, 12, dark, 8, 1);
      break;
    case 'leggings':
      p(ctx, 4, 3, c, 8, 2);
      p(ctx, 4, 5, c, 3, 8); p(ctx, 9, 5, c, 3, 8);
      p(ctx, 5, 4, light, 6, 1);
      p(ctx, 4, 12, dark, 3, 2); p(ctx, 9, 12, dark, 3, 2);
      break;
    default:
      p(ctx, 3, 6, c, 4, 7); p(ctx, 9, 6, c, 4, 7);
      p(ctx, 2, 12, dark, 6, 2); p(ctx, 8, 12, dark, 6, 2);
      p(ctx, 4, 7, light, 2, 1); p(ctx, 10, 7, light, 2, 1);
      p(ctx, 3, 5, c, 4, 2); p(ctx, 9, 5, c, 4, 2);
      p(ctx, 3, 12, '#3a2a1c', 4, 1); p(ctx, 9, 12, '#3a2a1c', 4, 1);
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

function paint(def: ItemDef, ctx: Ctx): void {
  if (def.kind === 'tool' || def.kind === 'weapon') {
    if (def.toolType === 'sword') sword(ctx, def);
    else tool(ctx, def);
    return;
  }
  if (def.kind === 'armor') {
    armor(ctx, def);
    return;
  }
  if (def.kind === 'food') {
    food(ctx, def);
    return;
  }
  if (def.kind === 'special') {
    special(ctx, def);
    return;
  }
  material(ctx, def);
}

export function renderItemIcon(def: ItemDef): string {
  const art = document.createElement('canvas');
  art.width = ART;
  art.height = ART;
  const actx = art.getContext('2d')!;
  actx.imageSmoothingEnabled = false;
  paint(def, actx);

  const out = document.createElement('canvas');
  out.width = 64;
  out.height = 64;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = false;

  // Ground shadow.
  octx.fillStyle = 'rgba(0,0,0,0.24)';
  octx.beginPath();
  octx.ellipse(32, 53, 17, 5, 0, 0, Math.PI * 2);
  octx.fill();

  // Scaled sprite.
  const scaled = document.createElement('canvas');
  scaled.width = 64;
  scaled.height = 64;
  const sctx = scaled.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(art, 0, 0, 64, 64);

  // Dark contour derived from the sprite alpha.
  const src = sctx.getImageData(0, 0, 64, 64);
  const outline = octx.createImageData(64, 64);
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= 64 || y >= 64 ? 0 : src.data[(y * 64 + x) * 4 + 3]);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (alpha(x, y) > 20) continue;
      if (alpha(x - 1, y) > 40 || alpha(x + 1, y) > 40 || alpha(x, y - 1) > 40 || alpha(x, y + 1) > 40) {
        const i = (y * 64 + x) * 4;
        outline.data[i] = 12;
        outline.data[i + 1] = 15;
        outline.data[i + 2] = 19;
        outline.data[i + 3] = 205;
      }
    }
  }
  octx.putImageData(outline, 0, 0);
  octx.drawImage(scaled, 0, 0);
  return out.toDataURL();
}
