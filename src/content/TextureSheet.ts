import { mulberry32 } from '../engine/core/Noise';
import { hexToRgb, shadeHex } from '../engine/core/Utils';

export type TileRect = [number, number, number, number];

const TILE = 16;
const COLS = 16;
const SHEET = 256;

/** A tiny per-model texture sheet. Each 16×16 tile is addressable with pixel UVs. */
export class TextureSheet {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private nextIndex = 0;
  private tiles = new Map<string, TileRect>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SHEET;
    this.canvas.height = SHEET;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  tile(name: string, painter: (ctx: CanvasRenderingContext2D) => void): TileRect {
    const existing = this.tiles.get(name);
    if (existing) return existing;
    if (this.nextIndex >= COLS * COLS) throw new Error('Texture sheet is full');
    const col = this.nextIndex % COLS;
    const row = Math.floor(this.nextIndex / COLS);
    this.nextIndex++;
    const x = col * TILE;
    const y = row * TILE;
    this.ctx.save();
    this.ctx.translate(x, y);
    painter(this.ctx);
    this.ctx.restore();
    const rect: TileRect = [x, y, x + TILE, y + TILE];
    this.tiles.set(name, rect);
    return rect;
  }

  has(name: string): boolean {
    return this.tiles.has(name);
  }

  get(name: string): TileRect {
    const t = this.tiles.get(name);
    if (!t) throw new Error(`Unknown tile: ${name}`);
    return t;
  }

  dataURL(): string {
    return this.canvas.toDataURL('image/png');
  }

  preview(tile: string, scale = 4): string {
    const rect = this.get(tile);
    const c = document.createElement('canvas');
    c.width = TILE * scale;
    c.height = TILE * scale;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, rect[0], rect[1], TILE, TILE, 0, 0, TILE * scale, TILE * scale);
    return c.toDataURL();
  }
}

/* ------------------------------------------------------------------ */
/*  primitive painters                                                 */
/* ------------------------------------------------------------------ */

type Ctx = CanvasRenderingContext2D;

function fill(ctx: Ctx, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE, TILE);
}

function px(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function noiseFill(ctx: Ctx, color: string, variance = 6, seed = 1) {
  const rand = mulberry32(seed);
  const [r, g, b] = hexToRgb(color);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = (rand() * 2 - 1) * variance;
      px(ctx, x, y, `rgb(${(r + v) | 0},${(g + v) | 0},${(b + v) | 0})`);
    }
  }
}

function rgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function paintFlat(color: string, variance = 5, seed = 1) {
  return (ctx: Ctx) => noiseFill(ctx, color, variance, seed);
}

export function paintSkin(color: string, seed = 2, freckles = true) {
  return (ctx: Ctx) => {
    noiseFill(ctx, color, 4, seed);
    const rand = mulberry32(seed + 9);
    if (freckles) {
      for (let i = 0; i < 5; i++) px(ctx, 2 + Math.floor(rand() * 12), 4 + Math.floor(rand() * 10), rgba(shadeHex(color, -0.18), 0.4));
    }
    px(ctx, 0, 0, rgba('#ffffff', 0.04), TILE, 1);
  };
}

export function paintHair(color: string, seed = 3) {
  return (ctx: Ctx) => {
    noiseFill(ctx, color, 6, seed);
    const rand = mulberry32(seed + 22);
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rand() * 15);
      const y = Math.floor(rand() * 15);
      px(ctx, x, y, rgba(rand() > 0.5 ? shadeHex(color, 0.2) : shadeHex(color, -0.22), 0.55), 1, 2 + Math.floor(rand() * 3));
    }
  };
}

export interface FaceOptions {
  skin: string;
  hair: string;
  hairStyle?: 'short' | 'long' | 'bald' | 'helmet' | 'hood' | 'hat';
  eyes?: 'normal' | 'zombie' | 'skeleton' | 'robot' | 'ninja' | 'glow' | 'sleepy';
  eyeColor?: string;
  mouth?: string;
  beard?: string;
  helmet?: string;
  mask?: boolean;
  seed?: number;
  villager?: boolean;
}

export function paintFace(opts: FaceOptions) {
  return (ctx: Ctx) => {
    const seed = opts.seed ?? 7;
    noiseFill(ctx, opts.skin, 4, seed);
    const hairStyle = opts.hairStyle ?? 'short';
    const rand = mulberry32(seed + 18);

    // Hair fringe / helmet top
    if (hairStyle !== 'bald' && hairStyle !== 'helmet') {
      ctx.fillStyle = opts.hair;
      ctx.fillRect(0, 0, TILE, 3);
      for (let x = 0; x < TILE; x += 2) {
        const h = 1 + Math.floor(rand() * 2);
        ctx.fillRect(x, 3, 2, h);
      }
      if (hairStyle === 'long' || hairStyle === 'hood') {
        px(ctx, 0, 3, opts.hair, 2, 10);
        px(ctx, 14, 3, opts.hair, 2, 10);
      }
      px(ctx, 2, 1, rgba(shadeHex(opts.hair, 0.25), 0.35), 4, 1);
    }
    if (hairStyle === 'helmet' && opts.helmet) {
      fill(ctx, opts.helmet);
      px(ctx, 2, 4, rgba('#ffffff', 0.2), 3, 1);
      dxHelmetVisor(ctx);
      return;
    }

    const eyes = opts.eyes ?? 'normal';
    const eyeColor = opts.eyeColor ?? '#2a2b31';
    if (eyes === 'skeleton') {
      px(ctx, 2, 5, '#15151a', 4, 3);
      px(ctx, 10, 5, '#15151a', 4, 3);
      px(ctx, 3, 8, '#1d1d22', 2, 2);
      px(ctx, 11, 8, '#1d1d22', 2, 2);
      px(ctx, 7, 9, '#2b2b2e', 2, 2);
      px(ctx, 4, 12, '#3c3c40', 8, 1);
      for (let x = 5; x < 12; x += 2) px(ctx, x, 13, '#d8d4c7', 1, 1);
      return;
    }
    if (eyes === 'zombie') {
      px(ctx, 3, 5, '#1b2617', 3, 2);
      px(ctx, 10, 5, '#1b2617', 3, 2);
      px(ctx, 4, 6, '#c9d17a', 1, 1);
      px(ctx, 11, 6, '#c9d17a', 1, 1);
      px(ctx, 4, 10, '#2b201d', 8, 1);
      px(ctx, 5, 11, '#6b3d37', 1, 1);
      px(ctx, 9, 11, '#6b3d37', 1, 1);
      px(ctx, 11, 12, '#1f2e1b', 1, 1);
      px(ctx, 3, 3, '#31412c', 2, 1);
      return;
    }
    if (eyes === 'robot') {
      fill(ctx, opts.skin);
      for (let y = 0; y < TILE; y += 4) px(ctx, 0, y, rgba('#000000', 0.15), TILE, 1);
      px(ctx, 3, 5, '#0b1518', 10, 3);
      px(ctx, 4, 6, opts.eyeColor ?? '#65f4ff', 3, 1);
      px(ctx, 9, 6, opts.eyeColor ?? '#65f4ff', 3, 1);
      px(ctx, 5, 11, '#2a3438', 6, 2);
      for (let x = 5; x < 11; x += 2) px(ctx, x, 11, '#67efff', 1, 1);
      px(ctx, 12, 11, '#e8ad3e', 1, 1);
      return;
    }
    if (eyes === 'ninja') {
      ctx.fillStyle = opts.mask ? '#181c23' : opts.skin;
      ctx.fillRect(0, 0, TILE, TILE);
      px(ctx, 0, 4, opts.skin, TILE, 4);
      px(ctx, 2, 5, '#f1e8dc', 4, 2);
      px(ctx, 10, 5, '#f1e8dc', 4, 2);
      px(ctx, 4, 5, '#171d23', 2, 2);
      px(ctx, 10, 5, '#171d23', 2, 2);
      px(ctx, 0, 8, '#181c23', TILE, 8);
      px(ctx, 7, 0, '#e0b03a', 2, 3);
      return;
    }
    if (eyes === 'glow') {
      px(ctx, 3, 5, '#0b1112', 3, 3);
      px(ctx, 10, 5, '#0b1112', 3, 3);
      px(ctx, 4, 6, opts.eyeColor ?? '#87fff2', 2, 2);
      px(ctx, 10, 6, opts.eyeColor ?? '#87fff2', 2, 2);
      px(ctx, 7, 10, '#16241f', 3, 1);
      return;
    }

    // Normal / sleepy eyes
    const eyeY = eyes === 'sleepy' ? 7 : 6;
    px(ctx, 3, eyeY - 1, '#4a3932', 4, 1);
    px(ctx, 9, eyeY - 1, '#4a3932', 4, 1);
    if (eyes === 'sleepy') {
      px(ctx, 3, eyeY, '#2b2524', 4, 1);
      px(ctx, 9, eyeY, '#2b2524', 4, 1);
    } else {
      px(ctx, 3, eyeY, '#f3ece1', 4, 3);
      px(ctx, 9, eyeY, '#f3ece1', 4, 3);
      px(ctx, 5, eyeY + 1, eyeColor, 2, 2);
      px(ctx, 9, eyeY + 1, eyeColor, 2, 2);
      px(ctx, 5, eyeY + 1, rgba('#ffffff', 0.75), 1, 1);
      px(ctx, 9, eyeY + 1, rgba('#ffffff', 0.75), 1, 1);
    }
    // nose
    px(ctx, 7, 8, rgba(shadeHex(opts.skin, -0.18), 0.6), 2, 2);
    // mouth
    const mouth = opts.mouth ?? '#6b443e';
    px(ctx, 5, 12, mouth, 6, 1);
    px(ctx, 6, 13, rgba(mouth, 0.6), 4, 1);

    if (opts.villager) {
      px(ctx, 3, 4, '#3b2a20', 4, 1);
      px(ctx, 9, 4, '#3b2a20', 4, 1);
      px(ctx, 7, 7, rgba(shadeHex(opts.skin, -0.15), 0.8), 2, 3);
    }
    if (opts.beard) {
      ctx.fillStyle = opts.beard;
      ctx.fillRect(3, 12, 10, 4);
      for (let x = 4; x < 13; x += 2) ctx.fillRect(x, 11, 1, 1);
      ctx.clearRect(6, 12, 4, 2);
      px(ctx, 6, 12, '#5c3f3b', 4, 1);
    }
  };
}

function dxHelmetVisor(ctx: Ctx) {
  px(ctx, 3, 7, '#12151a', 10, 2);
  px(ctx, 4, 7, '#79d8f2', 3, 1);
  px(ctx, 9, 7, '#79d8f2', 2, 1);
  px(ctx, 7, 11, '#272e35', 3, 1);
  px(ctx, 4, 3, 'rgba(255,255,255,0.14)', 4, 1);
}

export function paintHeat(ctx: Ctx) {
  fill(ctx, '#2a2e33');
  px(ctx, 3, 3, '#79e8ff', 4, 2);
  px(ctx, 9, 3, '#79e8ff', 4, 2);
  px(ctx, 2, 6, '#1b2024', 12, 1);
}

export function paintFabric(base: string, accent?: string, style: 'plain' | 'stripes' | 'torn' | 'grid' | 'armor' | 'robe' = 'plain', seed = 5) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 4, seed);
    const rand = mulberry32(seed + 4);
    if (style === 'stripes' && accent) {
      for (let x = 1; x < TILE; x += 4) px(ctx, x, 0, rgba(accent, 0.55), 2, TILE);
    }
    if (style === 'grid' && accent) {
      for (let x = 0; x < TILE; x += 4) px(ctx, x, 0, rgba(accent, 0.3), 1, TILE);
      for (let y = 0; y < TILE; y += 4) px(ctx, 0, y, rgba(accent, 0.3), TILE, 1);
    }
    if (style === 'torn') {
      ctx.clearRect(13, 1, 2, 2);
      ctx.clearRect(2, 12, 2, 2);
      ctx.clearRect(10, 7, 1, 2);
      px(ctx, 13, 1, rgba(shadeHex(base, -0.4), 0.9), 2, 1);
    }
    if (style === 'armor') {
      px(ctx, 0, 3, rgba('#0c1015', 0.45), TILE, 1);
      px(ctx, 0, 10, rgba('#0c1015', 0.45), TILE, 1);
      for (let x = 0; x < TILE; x += 5) px(ctx, x, 0, rgba('#ffffff', 0.12), 1, TILE);
      px(ctx, 2, 1, 'rgba(255,255,255,0.15)', 3, 1);
      px(ctx, 11, 12, 'rgba(0,0,0,0.2)', 3, 1);
    }
    if (style === 'robe' && accent) {
      px(ctx, 0, 0, accent, TILE, 1);
      px(ctx, 0, 14, accent, TILE, 2);
      px(ctx, 7, 0, rgba(accent, 0.4), 1, 14);
    }
    // wrinkles
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(rand() * 13);
      px(ctx, x, 4 + Math.floor(rand() * 9), rgba('#000000', 0.12), 2, 1);
    }
  };
}

export function paintSleeve(shirt: string, skin: string, accent?: string, seed = 6) {
  return (ctx: Ctx) => {
    noiseFill(ctx, shirt, 5, seed);
    px(ctx, 0, 12, skin, TILE, 4);
    px(ctx, 0, 12, rgba('#000000', 0.18), TILE, 1);
    if (accent) px(ctx, 0, 10, accent, TILE, 1);
    const rand = mulberry32(seed + 11);
    for (let i = 0; i < 3; i++) px(ctx, 2 + Math.floor(rand() * 11), 2 + Math.floor(rand() * 7), rgba('#000000', 0.1), 2, 1);
  };
}

export function paintPants(pants: string, boots: string, seed = 8) {
  return (ctx: Ctx) => {
    noiseFill(ctx, pants, 4, seed);
    px(ctx, 0, 12, '#00000033', TILE, 1);
    px(ctx, 0, 13, boots, TILE, 3);
    px(ctx, 0, 13, rgba('#ffffff', 0.1), TILE, 1);
    px(ctx, 2, 9, rgba('#000000', 0.12), 3, 1);
  };
}

export function paintBodyShirt(shirt: string, accent: string, style: 'plain' | 'tunic' | 'armor' | 'robe' | 'torn' = 'plain', seed = 9) {
  return (ctx: Ctx) => {
    noiseFill(ctx, shirt, 4, seed);
    if (style === 'tunic') {
      px(ctx, 0, 0, accent, TILE, 1);
      px(ctx, 7, 1, accent, 2, 11);
      px(ctx, 0, 12, accent, TILE, 4);
      px(ctx, 7, 1, rgba('#ffffff', 0.18), 1, 8);
    } else if (style === 'armor') {
      px(ctx, 0, 0, rgba('#1b2229', 0.5), TILE, 2);
      px(ctx, 0, 12, rgba('#1b2229', 0.5), TILE, 2);
      px(ctx, 2, 3, rgba('#ffffff', 0.18), 5, 1);
      px(ctx, 9, 10, rgba('#000000', 0.22), 4, 1);
      px(ctx, 1, 6, accent, 1, 4);
      px(ctx, 14, 6, accent, 1, 4);
    } else if (style === 'robe') {
      px(ctx, 0, 0, accent, TILE, 1);
      px(ctx, 0, 14, accent, TILE, 2);
      px(ctx, 7, 0, rgba(accent, 0.5), 2, 14);
      px(ctx, 2, 11, 'rgba(255,255,255,0.08)', 2, 2);
    } else {
      px(ctx, 0, 1, rgba('#ffffff', 0.1), TILE, 1);
      px(ctx, 0, 11, accent, TILE, 2);
      px(ctx, 7, 3, accent, 2, 7);
    }
    if (style === 'torn') {
      ctx.clearRect(2, 4, 2, 1);
      ctx.clearRect(11, 8, 1, 3);
    }
  };
}

export function paintMetal(base: string, accent = '#8fe9ff', seed = 10) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 5, seed);
    for (let y = 0; y < TILE; y += 5) px(ctx, 0, y, rgba('#0a1115', 0.5), TILE, 1);
    for (let x = 0; x < TILE; x += 7) px(ctx, x, 0, rgba('#ffffff', 0.08), 1, TILE);
    px(ctx, 3, 2, rgba('#ffffff', 0.22), 4, 1);
    px(ctx, 12, 12, rgba(accent, 0.55), 2, 2);
    px(ctx, 13, 13, accent, 1, 1);
  };
}

export function paintFur(base: string, dark: string, light: string, seed = 11) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 7, seed);
    const rand = mulberry32(seed + 30);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rand() * 15);
      const y = Math.floor(rand() * 15);
      px(ctx, x, y, rand() > 0.5 ? dark : light, 1, 1 + Math.floor(rand() * 3));
    }
    px(ctx, 1, 1, rgba('#ffffff', 0.07), 5, 1);
  };
}

export function paintWool(base: string, dark: string, seed = 12) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 6, seed);
    const rand = mulberry32(seed + 41);
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rand() * 15);
      const y = Math.floor(rand() * 15);
      px(ctx, x, y, rgba(dark, 0.35), 2, 1);
      px(ctx, x + 1, y + 1, rgba('#ffffff', 0.14), 1, 1);
    }
  };
}

export function paintAnimalFace(opts: {
  base: string;
  snout: string;
  eye?: string;
  eyeGlow?: string;
  style?: 'pig' | 'cow' | 'sheep' | 'chicken' | 'creeper' | 'wolf' | 'dragon' | 'slime';
  seed?: number;
}) {
  return (ctx: Ctx) => {
    noiseFill(ctx, opts.base, 5, opts.seed ?? 15);
    const style = opts.style ?? 'pig';
    if (style === 'creeper') {
      px(ctx, 2, 3, '#0e1a0f', 4, 4);
      px(ctx, 10, 3, '#0e1a0f', 4, 4);
      px(ctx, 6, 7, '#0e1a0f', 4, 6);
      px(ctx, 4, 8, '#0e1a0f', 2, 3);
      px(ctx, 10, 8, '#0e1a0f', 2, 3);
      px(ctx, 5, 9, '#162516', 2, 1);
      return;
    }
    if (style === 'chicken') {
      px(ctx, 4, 7, '#1c1c20', 2, 2);
      px(ctx, 10, 7, '#1c1c20', 2, 2);
      px(ctx, 7, 10, opts.snout, 3, 2);
      px(ctx, 7, 12, '#b58a2e', 2, 1);
      return;
    }
    if (style === 'slime') {
      px(ctx, 3, 6, '#183b22', 3, 3);
      px(ctx, 10, 6, '#183b22', 3, 3);
      px(ctx, 6, 11, '#183b22', 4, 1);
      px(ctx, 2, 2, 'rgba(255,255,255,0.28)', 4, 2);
      return;
    }
    if (style === 'dragon') {
      px(ctx, 2, 5, '#1a201c', 4, 2);
      px(ctx, 10, 5, '#1a201c', 4, 2);
      px(ctx, 4, 6, opts.eye ?? '#ffd257', 1, 1);
      px(ctx, 10, 6, opts.eye ?? '#ffd257', 1, 1);
      px(ctx, 5, 11, opts.snout, 6, 3);
      px(ctx, 6, 11, '#1a201c', 1, 1);
      px(ctx, 9, 11, '#1a201c', 1, 1);
      return;
    }
    if (style === 'sheep') {
      px(ctx, 4, 6, '#2a2522', 2, 2);
      px(ctx, 10, 6, '#2a2522', 2, 2);
      px(ctx, 6, 10, opts.snout, 4, 3);
      px(ctx, 7, 11, '#4a3f39', 2, 1);
      return;
    }
    // pig / cow / wolf style
    px(ctx, 3, 5, '#262225', 3, 2);
    px(ctx, 10, 5, '#262225', 3, 2);
    px(ctx, 4, 5, opts.eye ?? '#e8ddc7', 1, 1);
    px(ctx, 11, 5, opts.eye ?? '#e8ddc7', 1, 1);
    px(ctx, 5, 10, shadeHex(opts.snout, -0.12), 6, 4);
    px(ctx, 6, 11, '#3f2a29', 1, 1);
    px(ctx, 9, 11, '#3f2a29', 1, 1);
    if (opts.eyeGlow) px(ctx, 7, 9, opts.eyeGlow, 2, 1);
  };
}

export function paintLeather(base: string, accent: string, seed = 16) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 5, seed);
    px(ctx, 0, 3, rgba(accent, 0.7), TILE, 1);
    px(ctx, 0, 12, rgba(accent, 0.7), TILE, 1);
    for (let x = 2; x < 14; x += 4) px(ctx, x, 1, rgba('#ffffff', 0.15), 1, 1);
    px(ctx, 3, 5, rgba('#000000', 0.12), 2, 1);
  };
}

export function paintGem(base: string, light: string, seed = 17) {
  return (ctx: Ctx) => {
    ctx.clearRect(0, 0, TILE, TILE);
    px(ctx, 4, 2, rgba(light, 0.5), 8, 1);
    px(ctx, 2, 4, base, 12, 1);
    px(ctx, 3, 5, base, 10, 6);
    px(ctx, 5, 11, shadeHex(base, -0.2), 6, 2);
    px(ctx, 7, 13, shadeHex(base, -0.35), 2, 1);
    px(ctx, 4, 5, light, 2, 2);
    px(ctx, 9, 8, light, 2, 1);
    px(ctx, 5, 3, '#ffffff', 2, 1);
  };
}

export function paintGold(seed = 18) {
  return (ctx: Ctx) => {
    noiseFill(ctx, '#d6a53c', 7, seed);
    px(ctx, 0, 1, 'rgba(255,241,160,0.5)', TILE, 1);
    px(ctx, 0, 14, 'rgba(95,58,10,0.5)', TILE, 1);
    for (let x = 3; x < 14; x += 5) px(ctx, x, 4, 'rgba(255,245,180,0.4)', 1, 8);
  };
}

export function paintWood(base: string, dark: string, seed = 19) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 5, seed);
    for (let x = 1; x < TILE; x += 4) px(ctx, x, 0, dark, 1, TILE);
    px(ctx, 0, 3, rgba('#ffffff', 0.1), TILE, 1);
  };
}

export function paintScale(base: string, dark: string, light: string, seed = 20) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 5, seed);
    for (let y = 1; y < TILE; y += 4) {
      for (let x = (y % 8 === 1 ? 0 : 3); x < TILE; x += 6) {
        px(ctx, x, y, dark, 1, 1);
        px(ctx, x + 1, y + 1, light, 3, 1);
      }
    }
  };
}

export function paintRune(base: string, glow: string, seed = 21) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 8, seed);
    px(ctx, 3, 2, glow, 1, 12);
    px(ctx, 7, 4, glow, 1, 8);
    px(ctx, 11, 6, glow, 1, 4);
    px(ctx, 2, 6, glow, 2, 1);
    px(ctx, 10, 9, glow, 2, 1);
    px(ctx, 4, 3, rgba(glow, 0.5), 3, 1);
  };
}

export function paintGlow(base: string, glow: string, seed = 22) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 7, seed);
    px(ctx, 2, 2, glow, 5, 5);
    px(ctx, 9, 8, glow, 4, 4);
    px(ctx, 5, 11, glow, 3, 3);
    px(ctx, 7, 4, '#ffffff', 1, 1);
    px(ctx, 11, 9, '#ffffff', 1, 1);
  };
}

export function paintCloth(base: string, light: string, seed = 23) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 5, seed);
    px(ctx, 0, 0, rgba(light, 0.2), TILE, 1);
    for (let y = 4; y < TILE; y += 5) px(ctx, 0, y, rgba('#000000', 0.08), TILE, 1);
  };
}

export function paintHood(base: string, dark: string, seed = 24) {
  return (ctx: Ctx) => {
    noiseFill(ctx, base, 6, seed);
    ctx.fillStyle = 'rgba(5,8,12,0.85)';
    ctx.beginPath();
    ctx.arc(8, 9, 5, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 5, 8, '#ecd9a8', 2, 1);
    px(ctx, 9, 8, '#ecd9a8', 2, 1);
    px(ctx, 0, 0, rgba(dark, 0.5), TILE, 2);
  };
}
