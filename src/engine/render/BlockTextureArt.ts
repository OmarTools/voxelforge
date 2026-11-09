import { hashString, mulberry32 } from '../core/Noise';
import { shadeHex, mixHex, hexToRgb } from '../core/Utils';

const TILE = 16;

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;

function makeTile(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function paintBase(ctx: Ctx, rand: Rand, base: string, variance = 10, alpha = 1) {
  const [r, g, b] = hexToRgb(base);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = (rand() * 2 - 1) * variance;
      ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + v)) | 0},${Math.max(0, Math.min(255, g + v)) | 0},${Math.max(0, Math.min(255, b + v)) | 0},${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function px(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function speckle(ctx: Ctx, rand: Rand, colors: string[], count: number, maxSize = 2) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * TILE);
    const y = Math.floor(rand() * TILE);
    const s = 1 + Math.floor(rand() * maxSize);
    px(ctx, x, y, colors[Math.floor(rand() * colors.length)], s, s);
  }
}

function stoneBase(ctx: Ctx, rand: Rand, base = '#7d7d7d') {
  paintBase(ctx, rand, base, 13);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * 14);
    const y = Math.floor(rand() * 14);
    px(ctx, x, y, rgba('#4e4e4e', 0.5), 2, 1);
  }
}

function planks(ctx: Ctx, rand: Rand, base: string, seam: string, light: string) {
  paintBase(ctx, rand, base, 7);
  for (let y = 0; y < TILE; y += 4) {
    px(ctx, 0, y, seam, TILE, 1);
    px(ctx, 0, y + 1, light, TILE, 1);
    const split = 4 + Math.floor(rand() * 9);
    px(ctx, split, y + 1, rgba(seam, 0.5), 1, 3);
  }
  speckle(ctx, rand, [rgba(seam, 0.35), rgba(light, 0.35)], 7, 1);
}

function leaves(ctx: Ctx, rand: Rand, base: string, dark: string, light: string) {
  paintBase(ctx, rand, base, 12);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rand() * 15);
    const y = Math.floor(rand() * 15);
    const col = rand() > 0.55 ? dark : rand() > 0.3 ? light : base;
    px(ctx, x, y, col, 1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2));
  }
  speckle(ctx, rand, [rgba('#1d3d17', 0.7), rgba('#9ac96a', 0.45)], 8, 1);
}

function ore(ctx: Ctx, rand: Rand, color: string, bright: string) {
  stoneBase(ctx, rand);
  const clusters = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < clusters; i++) {
    const x = 1 + Math.floor(rand() * 12);
    const y = 1 + Math.floor(rand() * 12);
    const w = 2 + Math.floor(rand() * 3);
    const h = 1 + Math.floor(rand() * 2);
    px(ctx, x, y, shadeHex(color, -0.18), w, h);
    px(ctx, x, y, color, Math.max(1, w - 1), Math.max(1, h - 1));
    px(ctx, x, y, bright, 1, 1);
  }
}

function wool(ctx: Ctx, rand: Rand, base: string) {
  paintBase(ctx, rand, base, 6);
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rand() * 15);
    const y = Math.floor(rand() * 15);
    px(ctx, x, y, rgba(shadeHex(base, 0.3), 0.45), 2, 1);
    px(ctx, x + 1, y + 1, rgba(shadeHex(base, -0.32), 0.4), 1, 1);
  }
}

function concrete(ctx: Ctx, rand: Rand, base: string) {
  paintBase(ctx, rand, base, 3);
  px(ctx, 0, 0, rgba('#ffffff', 0.1), TILE, 1);
  speckle(ctx, rand, [rgba('#000000', 0.14), rgba('#ffffff', 0.1)], 10, 1);
}

function brickPattern(ctx: Ctx, rand: Rand, brick = '#9e5945', mortar = '#6c4034') {
  paintBase(ctx, rand, mortar, 5);
  const rowH = 4;
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : 4;
    for (let bx = -8; bx < TILE; bx += 8) {
      const x = bx + offset;
      const y = row * rowH;
      const c = shadeHex(brick, (rand() * 0.24) - 0.12);
      px(ctx, x + 1, y + 1, c, 6, rowH - 1);
      px(ctx, x + 1, y + 1, rgba('#ffffff', 0.08), 6, 1);
    }
  }
}

function stoneBrickPattern(ctx: Ctx, rand: Rand, base = '#8a8d8a', mortar = '#5f6462', mossy = false) {
  paintBase(ctx, rand, base, 8);
  for (let y = 0; y < TILE; y += 8) {
    px(ctx, 0, y, mortar, TILE, 1);
    if (y + 8 < TILE) px(ctx, 0, y + 8, mortar, TILE, 1);
  }
  px(ctx, 0, 0, mortar, 1, TILE);
  px(ctx, 8, 0, mortar, 1, 4);
  px(ctx, 15, 0, mortar, 1, TILE);
  px(ctx, 8, 8, mortar, 1, 8);
  for (let i = 0; i < 5; i++) {
    px(ctx, 2 + Math.floor(rand() * 12), 2 + Math.floor(rand() * 12), rgba('#ffffff', 0.08), 2, 1);
  }
  if (mossy) {
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rand() * 14);
      const y = 1 + Math.floor(rand() * 13);
      px(ctx, x, y, rgba(rand() > 0.5 ? '#658a4b' : '#4f743e', 0.8), 2 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2));
    }
  }
}

function woodLog(ctx: Ctx, rand: Rand, side: string, dark: string, light: string) {
  paintBase(ctx, rand, side, 7);
  for (let x = 0; x < TILE; x += 3) {
    const h = 8 + Math.floor(rand() * 8);
    px(ctx, x, Math.floor(rand() * 4), rgba(dark, 0.55), 1, h);
    px(ctx, x + 1, Math.floor(rand() * 5), rgba(light, 0.3), 1, h - 2);
  }
  px(ctx, 0, 0, rgba('#000000', 0.15), 1, TILE);
  px(ctx, 15, 0, rgba('#000000', 0.15), 1, TILE);
}

function logRing(ctx: Ctx, rand: Rand, base: string, dark: string, light: string) {
  paintBase(ctx, rand, base, 5);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  for (const r of [2.5, 5, 7]) {
    ctx.beginPath();
    ctx.arc(8, 8, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  px(ctx, 7, 7, dark, 2, 2);
  ctx.strokeStyle = rgba(light, 0.4);
  ctx.beginPath();
  ctx.arc(8, 8, 6.2, 0.2, 2.3);
  ctx.stroke();
}

const WOOL_COLORS: Record<string, string> = {
  wool_white: '#e9ecec', wool_red: '#b4443c', wool_blue: '#3f5fa8', wool_green: '#4e7d3c',
  wool_yellow: '#d8b64a', wool_black: '#25272c', wool_orange: '#cf7531', wool_purple: '#7b4ca1',
  wool_cyan: '#3e9495',
};
const CONCRETE_COLORS: Record<string, string> = {
  concrete_white: '#e4e7e1', concrete_gray: '#7a7f83', concrete_black: '#25292c', concrete_red: '#a53f3d',
  concrete_blue: '#3c5d9c', concrete_green: '#4a7540', concrete_yellow: '#cfac3f',
};

function drawText5x5(ctx: Ctx, text: string, x: number, y: number, color: string) {
  const font: Record<string, string[]> = {
    T: ['111', '010', '010', '010', '010'],
    N: ['101', '111', '111', '101', '101'],
    X: ['101', '101', '010', '101', '101'],
  };
  let ox = x;
  for (const ch of text) {
    const glyph = font[ch];
    if (glyph) {
      glyph.forEach((row, ry) => {
        [...row].forEach((cell, rx) => {
          if (cell === '1') px(ctx, ox + rx, y + ry, color);
        });
      });
    }
    ox += 4;
  }
}

function flower(ctx: Ctx, rand: Rand, petal: string, center: string) {
  ctx.clearRect(0, 0, TILE, TILE);
  px(ctx, 7, 8, '#4f7e35', 2, 8);
  px(ctx, 5, 11, '#4f7e35', 2, 1);
  px(ctx, 9, 12, '#55903a', 2, 1);
  px(ctx, 6, 3, shadeHex(petal, -0.2), 4, 1);
  px(ctx, 5, 4, petal, 6, 3);
  px(ctx, 6, 7, petal, 4, 1);
  px(ctx, 7, 5, center, 2, 2);
  px(ctx, 4, 5, shadeHex(petal, 0.2), 1, 1);
  px(ctx, 11, 6, shadeHex(petal, 0.15), 1, 1);
  speckle(ctx, rand, [rgba('#ffffff', 0.25)], 3, 1);
}

function torchTile(ctx: Ctx) {
  ctx.clearRect(0, 0, TILE, TILE);
  px(ctx, 7, 7, '#5b4328', 2, 9);
  px(ctx, 7, 7, '#7d5d36', 1, 8);
  px(ctx, 6, 4, '#d87925', 4, 1);
  px(ctx, 6, 5, '#e8a132', 4, 2);
  px(ctx, 7, 3, '#ffd86a', 2, 1);
  px(ctx, 7, 5, '#fff0a8', 2, 1);
}

function furnaceLikeSide(ctx: Ctx, rand: Rand) {
  stoneBase(ctx, rand, '#7b7d7d');
  px(ctx, 3, 5, '#3d3d3d', 10, 7);
  px(ctx, 4, 6, '#262626', 8, 5);
  px(ctx, 5, 7, '#e06e2a', 2, 2);
  px(ctx, 8, 7, '#f0a03a', 1, 1);
}

/** Cross-rendered crop sprites, drawn on a transparent tile. */
function cropSprite(ctx: Ctx, rand: Rand, crop: 'wheat' | 'carrot' | 'potato' | 'tomato', stage: number) {
  ctx.clearRect(0, 0, TILE, TILE);
  const green = stage === 2 && crop === 'wheat' ? '#c9a849' : '#6f9e42';
  const light = stage === 2 && crop === 'wheat' ? '#e6cf72' : '#8fc35a';
  const dark = stage === 2 && crop === 'wheat' ? '#96752e' : '#4c7630';

  if (crop === 'wheat') {
    const count = stage === 0 ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor((i * 13) / Math.max(1, count - 1));
      const h = stage === 0 ? 3 + Math.floor(rand() * 3) : stage === 1 ? 8 + Math.floor(rand() * 3) : 12 + Math.floor(rand() * 3);
      const top = 15 - h;
      px(ctx, x, top, dark, 1, h);
      px(ctx, x, top, green, 1, Math.max(1, h - 1));
      if (stage > 0) {
        px(ctx, x - 1, top + 3, light, 1, 2);
        px(ctx, x + 1, top + 5, light, 1, 2);
      }
      if (stage === 2) {
        px(ctx, x - 1, top - 2, light, 3, 3);
        px(ctx, x, top - 3, dark, 1, 2);
        px(ctx, x + 2, top - 2, light, 1, 2);
      }
    }
    return;
  }

  if (crop === 'carrot') {
    const height = stage === 0 ? 4 : stage === 1 ? 7 : 10;
    for (let i = -2; i <= 2; i++) {
      const x = 8 + i;
      const lean = i * (stage === 0 ? 1 : 2);
      for (let y = 0; y < height; y++) {
        const yy = 14 - y;
        const xx = x + Math.round((lean * y) / height);
        px(ctx, xx, yy, y > height - 3 ? dark : green, 1, 1);
        if (y > 1 && y < height - 1) px(ctx, xx + (i >= 0 ? 1 : -1), yy, light, 1, 1);
      }
    }
    if (stage === 2) {
      px(ctx, 6, 13, '#d9803a', 5, 2);
      px(ctx, 7, 12, '#ec9a4f', 3, 1);
      px(ctx, 5, 15, '#a85c28', 2, 1);
    }
    return;
  }

  if (crop === 'potato') {
    const height = stage === 0 ? 4 : stage === 1 ? 8 : 11;
    px(ctx, 7, 15 - height, dark, 2, height);
    for (let i = 0; i < (stage === 0 ? 5 : stage === 1 ? 9 : 13); i++) {
      const y = 5 + Math.floor(rand() * (height + 2));
      const x = 2 + Math.floor(rand() * 12);
      px(ctx, x, y, rand() > 0.45 ? green : light, 2, 2);
      px(ctx, x + 1, y + 1, dark, 1, 1);
    }
    if (stage === 2) {
      for (const [x, y] of [[4, 4], [11, 5], [7, 7]]) {
        px(ctx, x, y, '#f2ecd9', 1, 3);
        px(ctx, x - 1, y + 1, '#f2ecd9', 3, 1);
        px(ctx, x, y + 1, '#e0c766', 1, 2);
      }
    }
    return;
  }

  const height = stage === 0 ? 5 : stage === 1 ? 9 : 12;
  px(ctx, 7, 15 - height, dark, 2, height);
  for (let i = 0; i < (stage === 0 ? 4 : stage === 1 ? 8 : 11); i++) {
    const y = 4 + Math.floor(rand() * (height + 1));
    const side = rand() > 0.5 ? 1 : -1;
    px(ctx, 8 + side * (1 + Math.floor(rand() * 3)), y, green, 2, 1);
    px(ctx, 8 + side * 2, y - 1, light, 1, 1);
  }
  if (stage === 2) {
    for (const [x, y] of [[3, 6], [10, 8], [5, 10]]) {
      px(ctx, x, y, '#b93f35', 3, 3);
      px(ctx, x + 1, y + 1, '#d95a4a', 1, 1);
      px(ctx, x, y - 1, dark, 1, 1);
    }
  }
}

/** Draw a single 16×16 pixel-art tile. */
export function drawTile(name: string): HTMLCanvasElement {
  const { canvas, ctx } = makeTile();
  const rand = mulberry32(hashString(name));
  const [r, g, b] = hexToRgb('#888888');

  switch (name) {
    case 'bedrock':
      paintBase(ctx, rand, '#4c4c4c', 22);
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(rand() * 13);
        const y = Math.floor(rand() * 13);
        px(ctx, x, y, rgba(rand() > 0.5 ? '#252525' : '#767676', 0.8), 2 + Math.floor(rand() * 3), 2);
      }
      break;
    case 'stone':
      stoneBase(ctx, rand);
      break;
    case 'dirt':
      paintBase(ctx, rand, '#79553a', 16);
      speckle(ctx, rand, ['#5f402a', '#8f6747', '#6a4930'], 16, 2);
      break;
    case 'grass_top':
      paintBase(ctx, rand, '#63a543', 13);
      speckle(ctx, rand, ['#77b957', '#4f8b33', '#8ac768'], 22, 2);
      break;
    case 'grass_side': {
      paintBase(ctx, rand, '#79553a', 15);
      for (let x = 0; x < TILE; x++) {
        const h = 3 + Math.floor(rand() * 3);
        for (let y = 0; y < h; y++) px(ctx, x, y, shadeHex('#63a543', (rand() * 0.2) - 0.1));
      }
      for (let x = 0; x < TILE; x += 2) px(ctx, x, 3 + Math.floor(rand() * 3), '#4d7c35', 1, 1);
      speckle(ctx, rand, ['#4f8b33', '#72b052'], 6, 1);
      break;
    }
    case 'sand':
      paintBase(ctx, rand, '#dcc88f', 8);
      speckle(ctx, rand, ['#cdb87d', '#ead9a5', '#c7b175'], 20, 1);
      break;
    case 'sandstone_top':
      paintBase(ctx, rand, '#d8c58e', 6);
      px(ctx, 0, 0, rgba('#b9a572', 0.5), TILE, 1);
      px(ctx, 0, 15, rgba('#b9a572', 0.5), TILE, 1);
      speckle(ctx, rand, ['#c5b179', '#e6d5a1'], 8, 1);
      break;
    case 'sandstone_side':
      paintBase(ctx, rand, '#d4c089', 6);
      px(ctx, 0, 4, '#b8a36e', TILE, 1);
      px(ctx, 0, 10, '#c3ae78', TILE, 1);
      px(ctx, 0, 11, '#e3d29d', TILE, 1);
      speckle(ctx, rand, ['#c2ad76', '#e7d7a5'], 9, 1);
      break;
    case 'gravel':
      paintBase(ctx, rand, '#85807b', 18);
      for (let i = 0; i < 20; i++) {
        const x = Math.floor(rand() * 13);
        const y = Math.floor(rand() * 13);
        const c = rand() > 0.5 ? '#aaa49c' : rand() > 0.5 ? '#66615c' : '#948a7f';
        px(ctx, x, y, c, 2 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2));
      }
      break;
    case 'cobblestone': {
      paintBase(ctx, rand, '#55595a', 6);
      const stones = [
        [0, 0, 6, 5], [7, 0, 4, 4], [12, 0, 4, 6], [0, 6, 4, 4], [5, 4, 6, 5],
        [12, 7, 4, 5], [0, 11, 6, 5], [6, 10, 5, 6], [12, 13, 4, 3],
      ];
      for (const [x, y, w, h] of stones) {
        const c = shadeHex('#85898a', (rand() * 0.3) - 0.12);
        px(ctx, x + 1, y + 1, c, w - 1, h - 1);
        px(ctx, x + 1, y + 1, rgba('#ffffff', 0.12), w - 2, 1);
        px(ctx, x + 1, y + h - 1, rgba('#000000', 0.22), w - 1, 1);
      }
      break;
    }
    case 'oak_log_side':
      woodLog(ctx, rand, '#765a37', '#574024', '#9a7a4c');
      break;
    case 'oak_log_top':
      logRing(ctx, rand, '#a78555', '#6e512d', '#d0b075');
      break;
    case 'oak_planks':
      planks(ctx, rand, '#b68a55', '#7b5935', '#cdaa77');
      break;
    case 'oak_leaves':
      leaves(ctx, rand, '#4f8a35', '#2e6124', '#77b24f');
      break;
    case 'birch_log_side':
      paintBase(ctx, rand, '#d9d4c1', 5);
      for (let i = 0; i < 7; i++) {
        const x = 1 + Math.floor(rand() * 12);
        const y = Math.floor(rand() * 16);
        px(ctx, x, y, rgba('#4f4a42', 0.8), 2 + Math.floor(rand() * 4), 1);
      }
      px(ctx, 0, 0, rgba('#9a927e', 0.4), 1, TILE);
      break;
    case 'birch_log_top':
      logRing(ctx, rand, '#d7ccb0', '#8f846b', '#f0e5c9');
      break;
    case 'birch_planks':
      planks(ctx, rand, '#d8c8a0', '#a3926f', '#eadcb9');
      break;
    case 'birch_leaves':
      leaves(ctx, rand, '#70a94a', '#4b8132', '#9bcb6b');
      break;
    case 'spruce_log_side':
      woodLog(ctx, rand, '#5c432b', '#402d1d', '#7b5b3a');
      break;
    case 'spruce_log_top':
      logRing(ctx, rand, '#755433', '#4a331f', '#9a774c');
      break;
    case 'spruce_planks':
      planks(ctx, rand, '#86613d', '#5d442b', '#a17a50');
      break;
    case 'spruce_leaves':
      leaves(ctx, rand, '#3f6d3c', '#2b4e2c', '#588c4f');
      break;
    case 'glass':
      ctx.clearRect(0, 0, TILE, TILE);
      ctx.fillStyle = 'rgba(190,230,240,0.16)';
      ctx.fillRect(1, 1, 14, 14);
      px(ctx, 0, 0, 'rgba(225,248,255,0.75)', TILE, 1);
      px(ctx, 0, 15, 'rgba(225,248,255,0.55)', TILE, 1);
      px(ctx, 0, 0, 'rgba(225,248,255,0.65)', 1, TILE);
      px(ctx, 15, 0, 'rgba(225,248,255,0.65)', 1, TILE);
      for (let i = 0; i < 9; i++) px(ctx, 3 + i, 11 - i, 'rgba(255,255,255,0.32)', 1, 1);
      px(ctx, 4, 3, 'rgba(255,255,255,0.45)', 1, 1);
      px(ctx, 11, 3, 'rgba(255,255,255,0.2)', 1, 1);
      break;
    case 'water':
      paintBase(ctx, rand, '#3f76d9', 7);
      for (let i = 0; i < 5; i++) {
        const y = 2 + i * 3;
        px(ctx, 1 + (i % 2) * 2, y, 'rgba(140,196,255,0.35)', 10, 1);
        px(ctx, 4 + (i % 3), y + 1, 'rgba(28,65,150,0.35)', 7, 1);
      }
      speckle(ctx, rand, ['#75a7ff', '#2d5fbf'], 5, 1);
      break;
    case 'lava':
      paintBase(ctx, rand, '#b33f12', 16);
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(rand() * 13);
        const y = Math.floor(rand() * 13);
        px(ctx, x, y, '#f08a25', 2 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2));
        px(ctx, x, y, '#ffd45d', 1, 1);
      }
      speckle(ctx, rand, ['#5c1a08', '#ffae2f'], 6, 2);
      break;
    case 'snow':
      paintBase(ctx, rand, '#eef4f4', 5);
      speckle(ctx, rand, ['#ffffff', '#dce9ee', '#e5f0f2'], 12, 2);
      break;
    case 'ice':
      paintBase(ctx, rand, '#a9d7e8', 6, 0.88);
      for (let i = 0; i < 4; i++) {
        const x = 2 + Math.floor(rand() * 11);
        px(ctx, x, 1 + Math.floor(rand() * 8), 'rgba(235,255,255,0.5)', 1, 3 + Math.floor(rand() * 3));
      }
      px(ctx, 2, 12, 'rgba(255,255,255,0.35)', 7, 1);
      break;
    case 'coal_ore':
      ore(ctx, rand, '#2d2d2d', '#6a6a6a');
      break;
    case 'iron_ore':
      ore(ctx, rand, '#d8ad8c', '#f0d7c4');
      break;
    case 'gold_ore':
      ore(ctx, rand, '#e8bd3a', '#fff1a0');
      break;
    case 'diamond_ore':
      ore(ctx, rand, '#4fe0d2', '#c8fff8');
      break;
    case 'redstone_ore':
      ore(ctx, rand, '#b33131', '#ff6b6b');
      break;
    case 'bricks':
      brickPattern(ctx, rand);
      break;
    case 'stone_bricks':
      stoneBrickPattern(ctx, rand);
      break;
    case 'mossy_stone_bricks':
      stoneBrickPattern(ctx, rand, '#7b8572', '#56624f', true);
      break;
    case 'obsidian':
      paintBase(ctx, rand, '#211a2c', 10);
      for (let i = 0; i < 6; i++) {
        px(ctx, Math.floor(rand() * 14), Math.floor(rand() * 14), rgba('#6d4a95', 0.5), 2, 1);
        px(ctx, Math.floor(rand() * 14), Math.floor(rand() * 14), rgba('#100b18', 0.8), 3, 1);
      }
      px(ctx, 3, 3, 'rgba(160,120,210,0.25)', 1, 1);
      px(ctx, 11, 9, 'rgba(160,120,210,0.18)', 1, 2);
      break;
    case 'glowstone':
      paintBase(ctx, rand, '#8d6a29', 13);
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(rand() * 14);
        const y = Math.floor(rand() * 14);
        px(ctx, x, y, '#f5d26a', 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
        px(ctx, x, y, '#fff1b8', 1, 1);
      }
      break;
    case 'bookshelf': {
      paintBase(ctx, rand, '#8d6b3e', 5);
      px(ctx, 0, 0, '#a97e48', TILE, 2);
      px(ctx, 0, 14, '#a97e48', TILE, 2);
      px(ctx, 0, 2, '#5f4428', TILE, 1);
      px(ctx, 0, 13, '#5f4428', TILE, 1);
      const cols = ['#a84943', '#3f6a9c', '#6f8c3f', '#b38633', '#825a9a', '#b85f3f'];
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 5; i++) {
          const x = 1 + i * 3;
          const y = row === 0 ? 3 : 9;
          const h = 5;
          px(ctx, x, y, cols[(i + row * 2) % cols.length], 2, h);
          px(ctx, x, y, rgba('#ffffff', 0.18), 1, 2);
          px(ctx, x, y + h - 1, rgba('#000000', 0.2), 2, 1);
        }
        px(ctx, 0, row === 0 ? 8 : 14, '#5f4428', TILE, 1);
      }
      break;
    }
    case 'furnace_side':
      stoneBase(ctx, rand, '#777a7a');
      px(ctx, 2, 2, '#4c4f4f', 12, 1);
      px(ctx, 2, 2, '#4c4f4f', 1, 12);
      px(ctx, 13, 2, '#4c4f4f', 1, 12);
      px(ctx, 2, 13, '#4c4f4f', 12, 1);
      px(ctx, 4, 4, '#5d6060', 3, 2);
      px(ctx, 10, 9, '#909494', 3, 2);
      px(ctx, 5, 11, '#8a8d8d', 2, 1);
      break;
    case 'furnace_top':
      stoneBase(ctx, rand, '#6f7272');
      px(ctx, 4, 3, '#3e4141', 8, 8);
      px(ctx, 5, 4, '#2a2c2c', 6, 6);
      px(ctx, 6, 5, '#565a5a', 2, 2);
      px(ctx, 10, 8, '#4a4d4d', 1, 1);
      break;
    case 'furnace_front':
      stoneBase(ctx, rand, '#777a7a');
      px(ctx, 2, 2, '#4c4f4f', 12, 1);
      px(ctx, 2, 2, '#4c4f4f', 1, 12);
      px(ctx, 13, 2, '#4c4f4f', 1, 12);
      px(ctx, 2, 13, '#4c4f4f', 12, 1);
      px(ctx, 3, 5, '#302f2c', 10, 8);
      px(ctx, 4, 6, '#161514', 8, 6);
      px(ctx, 5, 9, '#e06e2a', 3, 2);
      px(ctx, 8, 8, '#f0a03a', 2, 3);
      px(ctx, 10, 10, '#ffcf62', 1, 1);
      px(ctx, 4, 4, '#9a9d9d', 8, 1);
      px(ctx, 6, 3, '#585b5b', 4, 1);
      break;
    case 'crafting_table_top': {
      planks(ctx, rand, '#a9794b', '#70502f', '#c79863');
      px(ctx, 1, 1, '#57402a', 14, 1);
      px(ctx, 1, 14, '#57402a', 14, 1);
      px(ctx, 1, 1, '#57402a', 1, 14);
      px(ctx, 14, 1, '#57402a', 1, 14);
      px(ctx, 5, 5, '#57402a', 6, 1);
      px(ctx, 5, 10, '#57402a', 6, 1);
      px(ctx, 5, 5, '#57402a', 1, 6);
      px(ctx, 10, 5, '#57402a', 1, 6);
      px(ctx, 2, 2, '#d0a36c', 2, 1);
      px(ctx, 12, 12, '#d0a36c', 1, 1);
      break;
    }
    case 'crafting_table_side': {
      planks(ctx, rand, '#a9794b', '#70502f', '#c79863');
      for (let i = 0; i < 3; i++) {
        const x = 3 + i * 4;
        px(ctx, x, 3, '#3d3a35', 2, 7);
        px(ctx, x, 3, '#9ba1a5', 1, 6);
      }
      px(ctx, 0, 0, '#d0a36c', TILE, 1);
      px(ctx, 2, 12, '#70502f', 12, 1);
      break;
    }
    case 'tnt_side':
      paintBase(ctx, rand, '#b93c36', 8);
      px(ctx, 0, 4, '#ede0cf', TILE, 8);
      px(ctx, 0, 4, '#c9b9a5', TILE, 1);
      px(ctx, 0, 11, '#c9b9a5', TILE, 1);
      drawText5x5(ctx, 'TNT', 3, 5, '#372a25');
      px(ctx, 0, 0, '#922623', TILE, 1);
      px(ctx, 0, 15, '#922623', TILE, 1);
      break;
    case 'tnt_top':
      paintBase(ctx, rand, '#c7483f', 8);
      px(ctx, 0, 0, '#8e2d28', TILE, 1);
      px(ctx, 0, 15, '#8e2d28', TILE, 1);
      px(ctx, 0, 0, '#8e2d28', 1, TILE);
      px(ctx, 15, 0, '#8e2d28', 1, TILE);
      px(ctx, 6, 5, '#3e3028', 4, 5);
      px(ctx, 7, 4, '#6b5747', 2, 2);
      px(ctx, 8, 2, '#c9b9a5', 1, 2);
      break;
    case 'tnt_bottom':
      paintBase(ctx, rand, '#a5342e', 8);
      px(ctx, 2, 2, '#7c2622', 12, 12);
      break;
    case 'pumpkin_side':
      paintBase(ctx, rand, '#d98a33', 9);
      for (let x = 1; x < TILE; x += 4) px(ctx, x, 0, 'rgba(160,86,22,0.55)', 1, TILE);
      for (let x = 2; x < TILE; x += 4) px(ctx, x, 0, 'rgba(255,184,82,0.35)', 1, TILE);
      px(ctx, 3, 4, '#3a2812', 3, 1);
      px(ctx, 2, 5, '#3a2812', 4, 2);
      px(ctx, 10, 4, '#3a2812', 3, 1);
      px(ctx, 10, 5, '#3a2812', 4, 2);
      px(ctx, 5, 11, '#3a2812', 6, 1);
      px(ctx, 4, 10, '#3a2812', 1, 1);
      px(ctx, 11, 10, '#3a2812', 1, 1);
      px(ctx, 6, 12, '#3a2812', 1, 1);
      px(ctx, 9, 12, '#3a2812', 1, 1);
      break;
    case 'pumpkin_top':
      paintBase(ctx, rand, '#d98a33', 8);
      for (let r = 2; r < 8; r += 2) {
        ctx.strokeStyle = 'rgba(150,78,20,0.5)';
        ctx.beginPath();
        ctx.arc(8, 8, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      px(ctx, 7, 6, '#4f7b32', 2, 4);
      px(ctx, 6, 6, '#5e8a3a', 1, 2);
      break;
    case 'melon_side':
      paintBase(ctx, rand, '#658f34', 7);
      for (let x = 0; x < TILE; x += 3) {
        px(ctx, x, 0, 'rgba(40,84,28,0.6)', 2, TILE);
        px(ctx, x + 2, 0, 'rgba(130,180,70,0.35)', 1, TILE);
      }
      speckle(ctx, rand, ['#4f7a2c', '#88b34b'], 8, 1);
      break;
    case 'melon_top':
      paintBase(ctx, rand, '#7baa3d', 7);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        px(ctx, 8 + Math.round(Math.cos(a) * 6), 8 + Math.round(Math.sin(a) * 6), '#4f7a2c', 2, 1);
      }
      px(ctx, 7, 7, '#5c8a30', 2, 2);
      break;
    case 'cactus_side':
      paintBase(ctx, rand, '#4e8a3c', 8);
      for (let y = 0; y < TILE; y += 5) {
        px(ctx, 0, y, 'rgba(35,70,27,0.6)', 1, 1);
        px(ctx, 15, y + 2, 'rgba(35,70,27,0.6)', 1, 1);
        px(ctx, 2, y + 1, 'rgba(210,230,160,0.7)', 1, 1);
        px(ctx, 13, y + 3, 'rgba(210,230,160,0.7)', 1, 1);
      }
      px(ctx, 7, 0, 'rgba(36,78,30,0.5)', 2, TILE);
      break;
    case 'cactus_top':
      paintBase(ctx, rand, '#59963f', 7);
      ctx.strokeStyle = '#386a2c';
      ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.stroke();
      px(ctx, 7, 7, '#c3d883', 2, 2);
      px(ctx, 0, 0, '#3b712e', TILE, 1);
      break;
    case 'clay':
      paintBase(ctx, rand, '#9ea6ad', 7);
      speckle(ctx, rand, ['#8e969d', '#b4bcc2'], 10, 1);
      break;
    case 'terracotta':
      paintBase(ctx, rand, '#a35f43', 7);
      for (let y = 3; y < TILE; y += 5) px(ctx, 0, y, 'rgba(110,55,35,0.4)', TILE, 1);
      speckle(ctx, rand, ['#ba7152', '#8b4d34'], 8, 1);
      break;
    case 'quartz':
      paintBase(ctx, rand, '#e8e4dc', 4);
      px(ctx, 0, 0, 'rgba(255,255,255,0.45)', TILE, 1);
      px(ctx, 0, 15, 'rgba(190,185,175,0.5)', TILE, 1);
      px(ctx, 15, 0, 'rgba(190,185,175,0.4)', 1, TILE);
      speckle(ctx, rand, ['#d8d2c7', '#f5f2ed'], 6, 1);
      break;
    case 'prismarine':
      paintBase(ctx, rand, '#5e9f96', 8);
      for (let y = 0; y < TILE; y += 5) {
        for (let x = (y / 5) % 2 === 0 ? 0 : 3; x < TILE; x += 6) {
          px(ctx, x, y, 'rgba(35,80,80,0.5)', 1, 1);
          px(ctx, x + 1, y + 1, 'rgba(130,200,185,0.35)', 4, 3);
        }
      }
      break;
    case 'netherrack':
      paintBase(ctx, rand, '#6d3030', 15);
      speckle(ctx, rand, ['#4f2020', '#8a3d38', '#5e2a2a'], 22, 2);
      for (let i = 0; i < 6; i++) px(ctx, Math.floor(rand() * 14), Math.floor(rand() * 14), '#3a1414', 2, 1);
      break;
    case 'magma':
      paintBase(ctx, rand, '#4f2417', 12);
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(rand() * 14);
        const y = Math.floor(rand() * 14);
        px(ctx, x, y, '#d4581e', 1 + Math.floor(rand() * 3), 1);
        px(ctx, x, y, '#ffb347', 1, 1);
      }
      break;
    case 'mycelium_top':
      paintBase(ctx, rand, '#81657a', 10);
      speckle(ctx, rand, ['#6d5168', '#a1849a', '#5c435d'], 20, 2);
      break;
    case 'mycelium_side':
      paintBase(ctx, rand, '#79553a', 15);
      for (let x = 0; x < TILE; x++) {
        const h = 2 + Math.floor(rand() * 3);
        for (let y = 0; y < h; y++) px(ctx, x, y, '#7c5d72');
      }
      speckle(ctx, rand, ['#916f87', '#5d4358'], 6, 1);
      break;
    case 'podzol_top':
      paintBase(ctx, rand, '#8b5e33', 11);
      speckle(ctx, rand, ['#a87642', '#6e4726', '#c0894e'], 18, 2);
      break;
    case 'podzol_side':
      paintBase(ctx, rand, '#79553a', 15);
      for (let x = 0; x < TILE; x++) {
        const h = 3 + Math.floor(rand() * 3);
        for (let y = 0; y < h; y++) px(ctx, x, y, '#8b5e33');
      }
      break;
    case 'moss':
      paintBase(ctx, rand, '#5c8f4a', 12);
      for (let i = 0; i < 26; i++) {
        px(ctx, Math.floor(rand() * 15), Math.floor(rand() * 15), rand() > 0.5 ? '#6fa558' : '#477437', 1 + Math.floor(rand() * 2), 1);
      }
      break;
    case 'dirt_path_top':
      paintBase(ctx, rand, '#8c6f4e', 9);
      speckle(ctx, rand, ['#a1815a', '#6f5437', '#947451'], 16, 2);
      break;
    case 'dirt_path_side':
      paintBase(ctx, rand, '#79553a', 15);
      for (let x = 0; x < TILE; x++) {
        const h = 3 + Math.floor(rand() * 2);
        for (let y = 0; y < h; y++) px(ctx, x, y, '#8c6f4e');
      }
      break;
    case 'glowstone_anim': break;
    case 'tall_grass': {
      ctx.clearRect(0, 0, TILE, TILE);
      const blades = [[3, 15, 5, 7], [6, 15, 7, 4], [8, 16, 9, 5], [10, 15, 12, 8], [12, 15, 13, 10], [5, 15, 4, 10], [9, 15, 11, 12]];
      for (const [x1, y1, x2, y2] of blades) {
        const steps = Math.max(Math.abs(y1 - y2), 1);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = Math.round(x1 + (x2 - x1) * t);
          const y = Math.round(y1 + (y2 - y1) * t);
          px(ctx, x, y, t > 0.6 ? '#5d913c' : '#72a94d');
        }
      }
      px(ctx, 7, 12, '#4c7c33', 3, 1);
      break;
    }
    case 'poppy':
      flower(ctx, rand, '#c94b45', '#3a2a1f');
      break;
    case 'dandelion':
      flower(ctx, rand, '#e2c53d', '#8a6a15');
      break;
    case 'dead_bush': {
      ctx.clearRect(0, 0, TILE, TILE);
      const branches = [[8, 15, 8, 8], [8, 10, 4, 6], [8, 11, 12, 7], [8, 8, 6, 3], [8, 9, 11, 4], [5, 8, 3, 5]];
      for (const [x1, y1, x2, y2] of branches) {
        const steps = Math.max(Math.abs(y1 - y2), Math.abs(x1 - x2));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          px(ctx, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), rand() > 0.5 ? '#8b6b3f' : '#6e5330');
        }
      }
      break;
    }
    case 'mushroom_red':
      ctx.clearRect(0, 0, TILE, TILE);
      px(ctx, 7, 8, '#d8c6a2', 2, 7);
      px(ctx, 6, 4, '#b53732', 5, 4);
      px(ctx, 5, 5, '#c7443d', 7, 2);
      px(ctx, 6, 6, '#d9574e', 5, 1);
      px(ctx, 5, 5, '#f0e8d9', 1, 1);
      px(ctx, 9, 4, '#f0e8d9', 1, 1);
      px(ctx, 7, 6, '#f0e8d9', 1, 1);
      break;
    case 'mushroom_brown':
      ctx.clearRect(0, 0, TILE, TILE);
      px(ctx, 7, 8, '#c2b18e', 2, 7);
      px(ctx, 4, 5, '#7d5f43', 9, 3);
      px(ctx, 5, 4, '#967554', 7, 1);
      px(ctx, 6, 4, '#a5845e', 5, 1);
      break;
    case 'torch':
      torchTile(ctx);
      break;
    case 'crystal_block': {
      paintBase(ctx, rand, '#234d4c', 10);
      for (let i = 0; i < 7; i++) {
        const x = 1 + Math.floor(rand() * 11);
        const y = 1 + Math.floor(rand() * 11);
        px(ctx, x, y, '#68e0d0', 2 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2));
        px(ctx, x, y, '#c8fff8', 1, 1);
      }
      px(ctx, 2, 2, 'rgba(120,255,240,0.35)', 1, 4);
      break;
    }
    case 'rune_block':
      paintBase(ctx, rand, '#3d3350', 10);
      for (let i = 0; i < 5; i++) {
        const x = 2 + i * 3;
        px(ctx, x, 3, '#8a6fbd', 1, 10);
        px(ctx, x - 1, 3 + (i % 3) * 3, '#b895ee', 2, 1);
      }
      px(ctx, 0, 0, '#2a2438', TILE, 1);
      px(ctx, 0, 15, '#2a2438', TILE, 1);
      break;
    case 'chest_front':
      planks(ctx, rand, '#8d6837', '#5f431f', '#b08a51');
      px(ctx, 0, 5, '#3d2a14', TILE, 2);
      px(ctx, 7, 5, '#c9a24c', 2, 6);
      px(ctx, 7, 7, '#2e2417', 2, 2);
      px(ctx, 7, 7, '#f0d076', 1, 1);
      px(ctx, 1, 1, '#b08a51', 14, 1);
      break;
    case 'chest_side':
      planks(ctx, rand, '#8d6837', '#5f431f', '#b08a51');
      px(ctx, 0, 5, '#6d4e28', TILE, 1);
      px(ctx, 1, 1, '#b08a51', 2, 13);
      px(ctx, 13, 1, '#b08a51', 2, 13);
      break;
    case 'chest_top':
      planks(ctx, rand, '#9a7340', '#64461f', '#b89056');
      px(ctx, 0, 6, '#3d2a14', TILE, 1);
      px(ctx, 0, 0, '#5f431f', TILE, 1);
      px(ctx, 0, 0, '#5f431f', 1, TILE);
      px(ctx, 15, 0, '#5f431f', 1, TILE);
      break;
    case 'barrel_side':
      paintBase(ctx, rand, '#856336', 7);
      for (let x = 0; x < TILE; x += 4) px(ctx, x, 0, 'rgba(70,49,25,0.5)', 1, TILE);
      px(ctx, 0, 2, '#4b3d2b', TILE, 1);
      px(ctx, 0, 12, '#4b3d2b', TILE, 1);
      px(ctx, 0, 3, '#6d5b42', TILE, 1);
      px(ctx, 0, 13, '#6d5b42', TILE, 1);
      break;
    case 'barrel_top':
      paintBase(ctx, rand, '#a07a44', 6);
      ctx.strokeStyle = '#5e4528';
      ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#7a5c34';
      ctx.beginPath(); ctx.arc(8, 8, 3, 0, Math.PI * 2); ctx.stroke();
      px(ctx, 0, 0, '#4b3820', TILE, 1);
      px(ctx, 0, 15, '#4b3820', TILE, 1);
      break;
    case 'crate':
      planks(ctx, rand, '#a77f4d', '#70532c', '#c49a61');
      px(ctx, 1, 1, '#6f522b', 14, 1);
      px(ctx, 1, 14, '#6f522b', 14, 1);
      px(ctx, 1, 1, '#6f522b', 1, 14);
      px(ctx, 14, 1, '#6f522b', 1, 14);
      for (let i = 2; i < 14; i++) {
        px(ctx, i, i, 'rgba(80,58,30,0.65)', 1, 1);
        px(ctx, 15 - i, i, 'rgba(80,58,30,0.65)', 1, 1);
      }
      break;
    case 'hay_side': {
      paintBase(ctx, rand, '#c9a849', 10);
      for (let i = 0; i < 30; i++) {
        const x = Math.floor(rand() * 15);
        const y = Math.floor(rand() * 15);
        px(ctx, x, y, rand() > 0.5 ? '#e0c262' : '#a58534', 1, 2 + Math.floor(rand() * 3));
      }
      px(ctx, 0, 5, '#8a6d2b', TILE, 1);
      px(ctx, 0, 11, '#8a6d2b', TILE, 1);
      break;
    }
    case 'hay_top': {
      paintBase(ctx, rand, '#d0b158', 9);
      for (let i = 0; i < 20; i++) {
        const a = rand() * Math.PI * 2;
        px(ctx, 8 + Math.round(Math.cos(a) * (2 + rand() * 5)), 8 + Math.round(Math.sin(a) * (2 + rand() * 5)), '#a98a3a', 1, 1);
      }
      break;
    }
    case 'sponge':
      paintBase(ctx, rand, '#c5bc55', 12);
      for (let i = 0; i < 18; i++) {
        px(ctx, Math.floor(rand() * 14), Math.floor(rand() * 14), '#8f8937', 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
      }
      break;
    case 'farmland_top':
      paintBase(ctx, rand, '#5c3f28', 9);
      for (let y = 1; y < TILE; y += 4) {
        px(ctx, 0, y, '#422c1b', TILE, 1);
        px(ctx, 0, y + 1, '#78573a', TILE, 1);
        px(ctx, 2 + Math.floor(rand() * 10), y + 1, '#4d3521', 3, 1);
      }
      speckle(ctx, rand, ['#3d2919', '#7f5c3c', '#4e3722'], 14, 1);
      break;
    case 'farmland_side':
      paintBase(ctx, rand, '#6b4a2e', 11);
      px(ctx, 0, 0, '#4b3220', TILE, 4);
      px(ctx, 0, 4, '#3c2818', TILE, 1);
      for (let x = 0; x < TILE; x += 3) px(ctx, x, 1 + Math.floor(rand() * 3), '#7d5a3a', 1, 1);
      speckle(ctx, rand, ['#5a3d26', '#7d5a3a'], 9, 1);
      break;
    case 'shipping_bin_side':
      planks(ctx, rand, '#8a6238', '#5f4224', '#a87c4c');
      px(ctx, 0, 2, '#4c5154', TILE, 2);
      px(ctx, 0, 11, '#4c5154', TILE, 2);
      px(ctx, 0, 2, '#788084', TILE, 1);
      px(ctx, 0, 11, '#788084', TILE, 1);
      for (const x of [2, 13]) {
        px(ctx, x, 2, '#363b3e', 1, 11);
        px(ctx, x + 1, 3, '#8b959a', 1, 8);
      }
      break;
    case 'shipping_bin_front':
      planks(ctx, rand, '#8a6238', '#5f4224', '#a87c4c');
      px(ctx, 0, 2, '#4c5154', TILE, 2);
      px(ctx, 0, 12, '#4c5154', TILE, 2);
      px(ctx, 3, 5, '#24180f', 10, 5);
      px(ctx, 4, 6, '#0e0a07', 8, 3);
      px(ctx, 5, 6, '#c9a849', 2, 1);
      px(ctx, 8, 7, '#d9873a', 2, 1);
      px(ctx, 11, 6, '#79a94e', 1, 2);
      px(ctx, 2, 2, '#363b3e', 1, 11);
      px(ctx, 13, 2, '#363b3e', 1, 11);
      break;
    case 'shipping_bin_top':
      planks(ctx, rand, '#966c3f', '#684a29', '#b58a57');
      px(ctx, 3, 3, '#24180f', 10, 10);
      px(ctx, 4, 4, '#100c08', 8, 8);
      px(ctx, 5, 5, '#c9a849', 2, 2);
      px(ctx, 8, 6, '#d9873a', 2, 1);
      px(ctx, 4, 9, '#79a94e', 2, 1);
      px(ctx, 0, 0, '#4c5154', TILE, 1);
      px(ctx, 0, 15, '#4c5154', TILE, 1);
      break;
    case 'bed_side':
      planks(ctx, rand, '#966c3f', '#684a29', '#b58a57');
      px(ctx, 0, 4, '#a33b3b', TILE, 10);
      px(ctx, 0, 4, '#c6544e', TILE, 1);
      px(ctx, 0, 13, '#7d2d2c', TILE, 2);
      px(ctx, 2, 6, '#f2ecd9', 2, 3);
      px(ctx, 12, 6, '#f2ecd9', 2, 3);
      break;
    case 'bed_top':
      paintBase(ctx, rand, '#a33b3b', 6);
      px(ctx, 0, 0, '#7d2d2c', TILE, 2);
      px(ctx, 0, 14, '#7d2d2c', TILE, 2);
      px(ctx, 0, 0, '#7d2d2c', 2, TILE);
      px(ctx, 14, 0, '#7d2d2c', 2, TILE);
      px(ctx, 3, 2, '#f4efe1', 10, 4);
      px(ctx, 3, 5, '#d7cfbc', 10, 1);
      px(ctx, 4, 10, '#c6544e', 8, 1);
      px(ctx, 4, 12, '#c6544e', 8, 1);
      for (let i = 0; i < 8; i++) px(ctx, 3 + Math.floor(rand() * 10), 8 + Math.floor(rand() * 6), '#b0443c', 1, 1);
      break;
    case 'wheat_crop_0':
      cropSprite(ctx, rand, 'wheat', 0);
      break;
    case 'wheat_crop_1':
      cropSprite(ctx, rand, 'wheat', 1);
      break;
    case 'wheat_crop_2':
      cropSprite(ctx, rand, 'wheat', 2);
      break;
    case 'carrot_crop_0':
      cropSprite(ctx, rand, 'carrot', 0);
      break;
    case 'carrot_crop_1':
      cropSprite(ctx, rand, 'carrot', 1);
      break;
    case 'carrot_crop_2':
      cropSprite(ctx, rand, 'carrot', 2);
      break;
    case 'potato_crop_0':
      cropSprite(ctx, rand, 'potato', 0);
      break;
    case 'potato_crop_1':
      cropSprite(ctx, rand, 'potato', 1);
      break;
    case 'potato_crop_2':
      cropSprite(ctx, rand, 'potato', 2);
      break;
    case 'tomato_crop_0':
      cropSprite(ctx, rand, 'tomato', 0);
      break;
    case 'tomato_crop_1':
      cropSprite(ctx, rand, 'tomato', 1);
      break;
    case 'tomato_crop_2':
      cropSprite(ctx, rand, 'tomato', 2);
      break;
    case 'crystal_flower': {
      ctx.clearRect(0, 0, TILE, TILE);
      px(ctx, 7, 8, '#4d9c8b', 2, 8);
      px(ctx, 5, 11, '#5db7a3', 2, 1);
      px(ctx, 9, 12, '#5db7a3', 2, 1);
      px(ctx, 7, 2, '#b9fff5', 2, 6);
      px(ctx, 4, 4, '#68e0d0', 3, 2);
      px(ctx, 9, 4, '#68e0d0', 3, 2);
      px(ctx, 7, 4, '#eafffd', 2, 2);
      px(ctx, 3, 6, '#91f4e5', 2, 1);
      px(ctx, 11, 6, '#91f4e5', 2, 1);
      break;
    }
    case 'counter_top':
      planks(ctx, rand, '#b98a58', '#8a6238', '#d2a873');
      px(ctx, 0, 0, '#8a6238', TILE, 1);
      px(ctx, 0, 0, '#8a6238', 1, TILE);
      px(ctx, 15, 0, '#7a5530', 1, TILE);
      px(ctx, 0, 15, '#7a5530', TILE, 1);
      px(ctx, 2, 3, 'rgba(255,236,200,0.35)', 5, 1);
      px(ctx, 9, 9, 'rgba(255,236,200,0.22)', 4, 1);
      break;
    case 'counter_side':
      planks(ctx, rand, '#a97c4c', '#7d5932', '#c69a68');
      px(ctx, 1, 2, '#6d4c2b', 6, 12);
      px(ctx, 9, 2, '#6d4c2b', 6, 12);
      px(ctx, 2, 3, '#c0915d', 4, 10);
      px(ctx, 10, 3, '#c0915d', 4, 10);
      px(ctx, 4, 7, '#e3c07c', 1, 2);
      px(ctx, 12, 7, '#e3c07c', 1, 2);
      px(ctx, 0, 0, '#7d5932', TILE, 1);
      px(ctx, 0, 15, '#6d4c2b', TILE, 1);
      break;
    case 'stove_top':
      paintBase(ctx, rand, '#4b5054', 6);
      px(ctx, 0, 0, '#2c3033', TILE, 1);
      px(ctx, 0, 15, '#2c3033', TILE, 1);
      for (const [cx, cy] of [[4, 4], [11, 4], [4, 11], [11, 11]]) {
        px(ctx, cx - 2, cy - 2, '#262a2d', 5, 5);
        px(ctx, cx - 2, cy - 2, '#6f767b', 5, 1);
        px(ctx, cx - 1, cy - 1, '#8b9297', 3, 1);
        px(ctx, cx + 1, cy + 1, '#15181a', 2, 1);
      }
      px(ctx, 6, 8, '#d9a44c', 4, 1);
      break;
    case 'stove_side':
      paintBase(ctx, rand, '#5c6266', 5);
      px(ctx, 0, 0, '#3a3f43', TILE, 1);
      px(ctx, 0, 2, '#7b8287', TILE, 1);
      px(ctx, 0, 13, '#33373a', TILE, 1);
      for (let i = 0; i < 4; i++) px(ctx, 2 + i * 4, 5, '#8d9499', 1, 1);
      px(ctx, 2, 9, '#2f3336', 12, 2);
      px(ctx, 3, 8, '#d9a44c', 2, 1);
      px(ctx, 3, 9, '#d9a44c', 2, 1);
      break;
    case 'stove_front':
      paintBase(ctx, rand, '#5c6266', 5);
      px(ctx, 0, 0, '#3a3f43', TILE, 1);
      px(ctx, 2, 4, '#2a2d30', 12, 8);
      px(ctx, 3, 5, '#141618', 10, 6);
      px(ctx, 4, 7, '#e07a2a', 4, 2);
      px(ctx, 7, 6, '#f5b45a', 3, 2);
      px(ctx, 10, 8, '#ffd98a', 2, 1);
      px(ctx, 4, 12, '#8d9499', 8, 1);
      px(ctx, 6, 2, '#c9a24c', 4, 1);
      break;
    case 'store_shelf_top':
      planks(ctx, rand, '#9d7444', '#6f4f2b', '#bd8f59');
      px(ctx, 0, 0, '#6f4f2b', TILE, 1);
      px(ctx, 0, 0, '#6f4f2b', 1, TILE);
      px(ctx, 15, 0, '#5c4124', 1, TILE);
      px(ctx, 0, 15, '#5c4124', TILE, 1);
      break;
    case 'store_shelf_side': {
      planks(ctx, rand, '#956d40', '#684a29', '#b88a56');
      for (let row = 0; row < 3; row++) {
        const y = 2 + row * 4;
        px(ctx, 1, y + 3, '#4f381f', 14, 1);
        px(ctx, 1, y + 3, '#c49a66', 14, 1);
        const colors = ['#c94b45', '#4f8f5a', '#d9a63f', '#5b7fb8', '#a86fc4'];
        for (let i = 0; i < 4; i++) {
          const c = colors[(row * 3 + i) % colors.length];
          px(ctx, 1 + i * 3, y, c, 2, 3);
          px(ctx, 1 + i * 3, y, rgba('#ffffff', 0.28), 1, 1);
          px(ctx, 1 + i * 3, y + 2, rgba('#000000', 0.22), 2, 1);
        }
      }
      px(ctx, 0, 0, '#684a29', TILE, 1);
      px(ctx, 0, 15, '#4f381f', TILE, 1);
      break;
    }
    case 'chalkboard':
      planks(ctx, rand, '#6b4c2c', '#4c351e', '#87643c');
      px(ctx, 1, 1, '#2c3a34', 14, 14);
      px(ctx, 2, 2, '#35463e', 12, 12);
      px(ctx, 3, 4, '#d8e0cf', 6, 1);
      px(ctx, 3, 6, '#aeb8a7', 9, 1);
      px(ctx, 3, 8, '#aeb8a7', 7, 1);
      px(ctx, 3, 10, '#e8c86a', 5, 1);
      px(ctx, 3, 12, '#aeb8a7', 8, 1);
      px(ctx, 11, 10, '#e8c86a', 1, 1);
      px(ctx, 12, 11, '#e8c86a', 1, 1);
      break;
    case 'gold_block':
      paintBase(ctx, rand, '#e2b23c', 8);
      px(ctx, 0, 0, '#f8dc7a', TILE, 1);
      px(ctx, 0, 0, '#f8dc7a', 1, TILE);
      px(ctx, 15, 0, '#9c7220', 1, TILE);
      px(ctx, 0, 15, '#9c7220', TILE, 1);
      px(ctx, 3, 3, '#b8892a', 4, 4);
      px(ctx, 9, 3, '#b8892a', 4, 4);
      px(ctx, 3, 9, '#b8892a', 4, 4);
      px(ctx, 9, 9, '#b8892a', 4, 4);
      px(ctx, 4, 4, '#ffe9a0', 2, 1);
      px(ctx, 10, 4, '#ffe9a0', 2, 1);
      px(ctx, 4, 10, '#ffe9a0', 2, 1);
      px(ctx, 10, 10, '#ffe9a0', 2, 1);
      break;
    case 'lucky_block':
      paintBase(ctx, rand, '#e8b93f', 6);
      px(ctx, 0, 0, '#8a651a', TILE, 1);
      px(ctx, 0, 15, '#8a651a', TILE, 1);
      px(ctx, 0, 0, '#8a651a', 1, TILE);
      px(ctx, 15, 0, '#8a651a', 1, TILE);
      px(ctx, 1, 1, '#f6d873', 14, 1);
      px(ctx, 1, 1, '#f6d873', 1, 14);
      px(ctx, 2, 2, '#f9e7a4', 2, 2);
      px(ctx, 12, 12, '#f9e7a4', 2, 2);
      // Question mark.
      px(ctx, 6, 4, '#5c410f', 5, 1);
      px(ctx, 5, 5, '#5c410f', 2, 2);
      px(ctx, 10, 5, '#5c410f', 1, 2);
      px(ctx, 9, 7, '#5c410f', 2, 2);
      px(ctx, 8, 9, '#5c410f', 2, 1);
      px(ctx, 8, 10, '#5c410f', 1, 2);
      px(ctx, 8, 13, '#5c410f', 1, 1);
      px(ctx, 5, 4, '#fff3b8', 4, 1);
      px(ctx, 6, 5, '#fff3b8', 1, 1);
      px(ctx, 11, 3, '#ffffff', 1, 1);
      px(ctx, 3, 11, '#f6d873', 1, 1);
      break;
    case 'cursed_lucky_block':
      paintBase(ctx, rand, '#6f3c93', 7);
      px(ctx, 0, 0, '#3a1d50', TILE, 1);
      px(ctx, 0, 15, '#3a1d50', TILE, 1);
      px(ctx, 0, 0, '#3a1d50', 1, TILE);
      px(ctx, 15, 0, '#3a1d50', 1, TILE);
      px(ctx, 1, 1, '#9a63be', 14, 1);
      px(ctx, 1, 1, '#9a63be', 1, 14);
      px(ctx, 11, 3, '#d59cff', 1, 1);
      px(ctx, 3, 12, '#d59cff', 1, 1);
      // Cracked question mark with red eyes.
      px(ctx, 6, 4, '#24112f', 5, 1);
      px(ctx, 5, 5, '#24112f', 2, 2);
      px(ctx, 10, 5, '#24112f', 1, 2);
      px(ctx, 9, 7, '#24112f', 2, 2);
      px(ctx, 8, 9, '#24112f', 2, 1);
      px(ctx, 8, 10, '#24112f', 1, 2);
      px(ctx, 8, 13, '#24112f', 1, 1);
      px(ctx, 6, 6, '#ff5c5c', 1, 1);
      px(ctx, 9, 6, '#ff5c5c', 1, 1);
      px(ctx, 4, 9, '#24112f', 1, 3);
      px(ctx, 11, 10, '#24112f', 1, 2);
      break;
    case 'supply_cache':
      paintBase(ctx, rand, '#356b78', 6);
      px(ctx, 0, 0, '#16323b', TILE, 2);
      px(ctx, 0, 14, '#16323b', TILE, 2);
      px(ctx, 0, 0, '#16323b', 2, TILE);
      px(ctx, 14, 0, '#16323b', 2, TILE);
      px(ctx, 2, 2, '#4f8b96', 12, 1);
      px(ctx, 2, 2, '#4f8b96', 1, 12);
      px(ctx, 2, 13, '#21454e', 12, 1);
      px(ctx, 13, 2, '#21454e', 1, 12);
      // Gold cargo band and latch.
      px(ctx, 2, 7, '#c89534', 12, 2);
      px(ctx, 2, 7, '#f0cb6a', 12, 1);
      px(ctx, 6, 5, '#d8a640', 4, 1);
      px(ctx, 6, 9, '#b38128', 4, 1);
      px(ctx, 7, 6, '#ffe49a', 2, 3);
      px(ctx, 5, 8, '#ffe49a', 1, 1);
      px(ctx, 10, 8, '#ffe49a', 1, 1);
      // Stencil chevrons.
      px(ctx, 4, 3, '#bcd7d2', 1, 1);
      px(ctx, 5, 4, '#bcd7d2', 1, 1);
      px(ctx, 6, 5, '#bcd7d2', 1, 1);
      px(ctx, 10, 3, '#bcd7d2', 1, 1);
      px(ctx, 9, 4, '#bcd7d2', 1, 1);
      px(ctx, 11, 12, '#6da3ac', 2, 1);
      px(ctx, 12, 11, '#8dc2c9', 1, 1);
      break;
    case 'supply_cache_top':
      paintBase(ctx, rand, '#2f606c', 5);
      px(ctx, 0, 0, '#16323b', TILE, 1);
      px(ctx, 0, 15, '#16323b', TILE, 1);
      px(ctx, 0, 0, '#16323b', 1, TILE);
      px(ctx, 15, 0, '#16323b', 1, TILE);
      // Cross bracing.
      for (let i = 2; i < 14; i++) {
        px(ctx, i, i, '#2a4f59', 1, 1);
        px(ctx, 15 - i, i, '#2a4f59', 1, 1);
      }
      px(ctx, 2, 2, '#4f8b96', 12, 1);
      px(ctx, 2, 2, '#4f8b96', 1, 12);
      px(ctx, 6, 6, '#d8a640', 4, 4);
      px(ctx, 7, 7, '#ffe49a', 2, 2);
      px(ctx, 3, 3, '#8dc2c9', 1, 1);
      px(ctx, 12, 12, '#8dc2c9', 1, 1);
      break;
    case 'siege_core':
      paintBase(ctx, rand, '#2a1d28', 7);
      px(ctx, 0, 0, '#120d14', TILE, 2);
      px(ctx, 0, 14, '#120d14', TILE, 2);
      px(ctx, 0, 0, '#120d14', 2, TILE);
      px(ctx, 14, 0, '#120d14', 2, TILE);
      // Obsidian frame with heated cracks.
      px(ctx, 2, 2, '#4c2f3b', 12, 1);
      px(ctx, 2, 2, '#4c2f3b', 1, 12);
      px(ctx, 2, 13, '#3a202b', 12, 1);
      px(ctx, 13, 2, '#3a202b', 1, 12);
      px(ctx, 4, 4, '#8c3822', 1, 2);
      px(ctx, 11, 4, '#b34b26', 1, 3);
      px(ctx, 4, 10, '#b34b26', 2, 1);
      px(ctx, 10, 11, '#7e2c1e', 2, 1);
      // Molten core.
      px(ctx, 6, 5, '#c8451f', 4, 1);
      px(ctx, 5, 6, '#f07a2a', 6, 1);
      px(ctx, 4, 7, '#ffb44f', 8, 2);
      px(ctx, 5, 9, '#ffd27a', 6, 1);
      px(ctx, 6, 10, '#f07a2a', 4, 1);
      px(ctx, 7, 11, '#c8451f', 2, 1);
      px(ctx, 7, 7, '#fff0b0', 2, 2);
      px(ctx, 5, 6, '#ffdf8c', 1, 1);
      px(ctx, 10, 9, '#ffdf8c', 1, 1);
      break;
    case 'siege_turret':
      paintBase(ctx, rand, '#5c6770', 6);
      stoneBase(ctx, rand, '#59636c');
      px(ctx, 0, 0, '#2d353b', TILE, 1);
      px(ctx, 0, 15, '#2d353b', TILE, 1);
      px(ctx, 0, 0, '#2d353b', 1, TILE);
      px(ctx, 15, 0, '#2d353b', 1, TILE);
      // Iron turret face and glowing lens.
      px(ctx, 3, 3, '#7d8992', 10, 2);
      px(ctx, 3, 5, '#3b444b', 10, 6);
      px(ctx, 4, 5, '#a9b6bd', 1, 5);
      px(ctx, 11, 5, '#222a2f', 1, 5);
      px(ctx, 6, 6, '#20272c', 4, 4);
      px(ctx, 7, 7, '#ff9d3c', 2, 2);
      px(ctx, 7, 7, '#ffe6a6', 1, 1);
      px(ctx, 4, 12, '#8b979f', 8, 1);
      px(ctx, 5, 13, '#394248', 6, 1);
      px(ctx, 4, 3, '#c9d4d8', 1, 1);
      px(ctx, 11, 3, '#c9d4d8', 1, 1);
      px(ctx, 2, 6, '#d8a640', 1, 3);
      px(ctx, 13, 6, '#d8a640', 1, 3);
      break;
    case 'siege_turret_top':
      paintBase(ctx, rand, '#4d575f', 5);
      stoneBase(ctx, rand, '#545e66');
      px(ctx, 0, 0, '#2d353b', TILE, 1);
      px(ctx, 0, 15, '#2d353b', TILE, 1);
      px(ctx, 0, 0, '#2d353b', 1, TILE);
      px(ctx, 15, 0, '#2d353b', 1, TILE);
      px(ctx, 4, 4, '#333c42', 8, 8);
      px(ctx, 5, 5, '#77828a', 6, 6);
      px(ctx, 6, 6, '#ff9d3c', 4, 4);
      px(ctx, 7, 7, '#ffe6a6', 2, 2);
      px(ctx, 3, 3, '#c9d4d8', 1, 1);
      px(ctx, 12, 3, '#c9d4d8', 1, 1);
      px(ctx, 3, 12, '#c9d4d8', 1, 1);
      px(ctx, 12, 12, '#c9d4d8', 1, 1);
      break;

    case 'hollow_gate':
      paintBase(ctx, rand, '#2c2238', 6);
      // Iron-banded planks.
      for (let x = 2; x < 14; x += 3) {
        px(ctx, x, 1, '#4a3b52', 2, 14);
        px(ctx, x, 1, '#5c4a68', 1, 14);
      }
      px(ctx, 1, 2, '#1b1424', 14, 1);
      px(ctx, 1, 7, '#1b1424', 14, 1);
      px(ctx, 1, 12, '#1b1424', 14, 1);
      px(ctx, 1, 2, '#7b6a8c', 14, 1);
      // Rivets.
      for (const y of [2, 7, 12]) {
        px(ctx, 3, y, '#c9b9d6', 1, 1);
        px(ctx, 12, y, '#c9b9d6', 1, 1);
      }
      // Rune lock.
      px(ctx, 6, 8, '#6f52a3', 4, 4);
      px(ctx, 7, 9, '#8f74c4', 2, 2);
      px(ctx, 7, 8, '#b9a7ff', 2, 1);
      px(ctx, 5, 9, '#b9a7ff', 1, 2);
      px(ctx, 10, 9, '#b9a7ff', 1, 2);
      px(ctx, 7, 11, '#b9a7ff', 2, 1);
      break;
    case 'tower_pad':
      paintBase(ctx, rand, '#6b6a58', 5);
      stoneBase(ctx, rand, '#6b6a58');
      px(ctx, 0, 0, '#3c3d33', TILE, 1);
      px(ctx, 0, 15, '#3c3d33', TILE, 1);
      px(ctx, 0, 0, '#3c3d33', 1, TILE);
      px(ctx, 15, 0, '#3c3d33', 1, TILE);
      // Rune ring.
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        px(ctx, 8 + Math.round(Math.cos(angle) * 5), 8 + Math.round(Math.sin(angle) * 5), '#b9a7ff', 1, 1);
      }
      px(ctx, 5, 5, '#8f74c4', 6, 1);
      px(ctx, 5, 10, '#8f74c4', 6, 1);
      px(ctx, 5, 5, '#8f74c4', 1, 6);
      px(ctx, 10, 5, '#8f74c4', 1, 6);
      px(ctx, 7, 7, '#4a3b52', 2, 2);
      px(ctx, 7, 7, '#e2b65a', 1, 1);
      px(ctx, 3, 3, '#9b9a86', 1, 1);
      px(ctx, 12, 12, '#9b9a86', 1, 1);
      break;
    case 'lantern_tower':
      paintBase(ctx, rand, '#4a3f2e', 6);
      stoneBase(ctx, rand, '#5d5340');
      // Iron cage foot.
      px(ctx, 3, 11, '#2d2a24', 10, 4);
      px(ctx, 3, 11, '#6b6354', 10, 1);
      // Brass column.
      px(ctx, 6, 5, '#8f6d2c', 4, 7);
      px(ctx, 7, 5, '#c99a3e', 2, 7);
      // Lantern housing.
      px(ctx, 4, 1, '#2d2a24', 8, 4);
      px(ctx, 5, 1, '#c98f3c', 6, 3);
      px(ctx, 6, 2, '#ffe6a6', 4, 2);
      px(ctx, 7, 2, '#fff6cf', 2, 1);
      px(ctx, 4, 0, '#e2b65a', 8, 1);
      px(ctx, 5, 5, '#e2b65a', 6, 1);
      // Side rivets.
      px(ctx, 4, 6, '#9a7a3a', 1, 4);
      px(ctx, 11, 6, '#9a7a3a', 1, 4);
      break;
    case 'frost_tower':
      paintBase(ctx, rand, '#33414a', 6);
      stoneBase(ctx, rand, '#4a5a66');
      px(ctx, 3, 11, '#26323a', 10, 4);
      px(ctx, 3, 11, '#7a99a8', 10, 1);
      // Crystal spire.
      px(ctx, 7, 0, '#b9f2ff', 2, 2);
      px(ctx, 6, 2, '#7fd6e8', 4, 2);
      px(ctx, 5, 4, '#5bb6cc', 6, 4);
      px(ctx, 4, 8, '#3f8fa6', 8, 3);
      px(ctx, 7, 1, '#e8fbff', 1, 2);
      px(ctx, 6, 5, '#b9f2ff', 1, 3);
      px(ctx, 10, 6, '#8fe6ff', 1, 2);
      // Frost shards.
      px(ctx, 3, 6, '#8fe6ff', 1, 3);
      px(ctx, 12, 7, '#8fe6ff', 1, 2);
      px(ctx, 2, 10, '#5bb6cc', 2, 1);
      px(ctx, 12, 10, '#5bb6cc', 2, 1);
      break;
    case 'mortar_tower':
      paintBase(ctx, rand, '#3c302a', 6);
      stoneBase(ctx, rand, '#5d4a3c');
      // Squat iron barrel.
      px(ctx, 3, 4, '#2d2724', 10, 10);
      px(ctx, 4, 3, '#4a403a', 8, 2);
      px(ctx, 3, 12, '#241f1c', 10, 2);
      px(ctx, 4, 5, '#7a6a5c', 1, 6);
      px(ctx, 11, 5, '#3a332e', 1, 6);
      // Muzzle.
      px(ctx, 5, 1, '#26211e', 6, 4);
      px(ctx, 6, 2, '#403833', 4, 2);
      px(ctx, 7, 2, '#ff9d3c', 2, 2);
      px(ctx, 7, 2, '#ffe6a6', 1, 1);
      // Bands and fuse.
      px(ctx, 3, 7, '#8f6d2c', 10, 1);
      px(ctx, 3, 10, '#8f6d2c', 10, 1);
      px(ctx, 12, 4, '#c9a15a', 2, 1);
      px(ctx, 13, 3, '#ffd27a', 1, 1);
      break;

    case 'crumble_tile':
      paintBase(ctx, rand, '#e6cfa6', 6);
      // Painted grout frame.
      px(ctx, 0, 0, '#a98255', TILE, 1);
      px(ctx, 0, 15, '#a98255', TILE, 1);
      px(ctx, 0, 0, '#a98255', 1, TILE);
      px(ctx, 15, 0, '#a98255', 1, TILE);
      px(ctx, 1, 1, '#f6e7c9', 14, 1);
      px(ctx, 1, 1, '#f6e7c9', 1, 14);
      px(ctx, 1, 14, '#c8a170', 14, 1);
      px(ctx, 14, 1, '#c8a170', 1, 14);
      // Coral festival chevron.
      for (let i = 0; i < 6; i++) {
        px(ctx, 4 + i, 5 + i, '#e07a52', 2, 1);
        px(ctx, 11 - i, 5 + i, '#e07a52', 2, 1);
      }
      px(ctx, 7, 11, '#f2b48c', 2, 2);
      speckle(ctx, rand, ['#d4b887', '#f4dfba'], 5, 1);
      break;
    case 'crumble_tile_alt':
      paintBase(ctx, rand, '#9fd8c8', 6);
      px(ctx, 0, 0, '#4f9487', TILE, 1);
      px(ctx, 0, 15, '#4f9487', TILE, 1);
      px(ctx, 0, 0, '#4f9487', 1, TILE);
      px(ctx, 15, 0, '#4f9487', 1, TILE);
      px(ctx, 1, 1, '#c9f0e3', 14, 1);
      px(ctx, 1, 1, '#c9f0e3', 1, 14);
      px(ctx, 1, 14, '#78bbaa', 14, 1);
      px(ctx, 14, 1, '#78bbaa', 1, 14);
      // Gold star.
      px(ctx, 7, 4, '#f5d27a', 2, 8);
      px(ctx, 4, 7, '#f5d27a', 8, 2);
      px(ctx, 5, 5, '#fff0bd', 2, 2);
      px(ctx, 9, 9, '#fff0bd', 2, 2);
      speckle(ctx, rand, ['#84c4b3', '#b9e8da'], 5, 1);
      break;
    case 'crumble_cracked':
      paintBase(ctx, rand, '#c9b79c', 8);
      px(ctx, 0, 0, '#7c6a52', TILE, 1);
      px(ctx, 0, 15, '#7c6a52', TILE, 1);
      px(ctx, 0, 0, '#7c6a52', 1, TILE);
      px(ctx, 15, 0, '#7c6a52', 1, TILE);
      // Jagged cracks.
      px(ctx, 7, 1, '#5d4d3a', 1, 6);
      px(ctx, 8, 6, '#5d4d3a', 4, 1);
      px(ctx, 11, 7, '#5d4d3a', 1, 3);
      px(ctx, 3, 9, '#5d4d3a', 4, 1);
      px(ctx, 3, 10, '#5d4d3a', 1, 3);
      px(ctx, 10, 11, '#5d4d3a', 3, 1);
      px(ctx, 12, 12, '#5d4d3a', 1, 2);
      px(ctx, 6, 7, '#6d5c47', 2, 1);
      px(ctx, 8, 7, '#8a765b', 1, 2);
      px(ctx, 2, 5, '#b3a084', 1, 1);
      px(ctx, 13, 4, '#b3a084', 1, 1);
      break;

    case 'missing':
    default: {
      for (let y = 0; y < TILE; y += 4) {
        for (let x = 0; x < TILE; x += 4) {
          px(ctx, x, y, (x + y) % 8 === 0 ? '#2b1e2b' : '#d54bd5', 4, 4);
        }
      }
      break;
    }
  }

  // If a wool/concrete tile slipped through, paint it from the palettes.
  if (name.startsWith('wool_') && WOOL_COLORS[name]) wool(ctx, rand, WOOL_COLORS[name]);
  if (name.startsWith('concrete_') && CONCRETE_COLORS[name]) concrete(ctx, rand, CONCRETE_COLORS[name]);

  // A no-op reference so tooling doesn't flag unused color destructuring.
  void [r, g, b];
  return canvas;
}

export const TILE_SIZE = TILE;
