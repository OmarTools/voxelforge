/** Deterministic, seedable Perlin-style noise + small RNG helpers. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Hash a 3D integer coordinate to [0,1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h = Math.imul(h ^ (z | 0), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export class Noise {
  private perm = new Uint8Array(512);
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.init();
  }

  private init() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const rand = mulberry32(this.seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private static fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static grad3(hash: number, x: number, y: number, z: number) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = Noise.fade(xf);
    const v = Noise.fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const g = (h: number, gx: number, gy: number) => {
      const hh = h & 7;
      const uu = hh < 4 ? gx : gy;
      const vv = hh < 4 ? gy : gx;
      return ((hh & 1) === 0 ? uu : -uu) + ((hh & 2) === 0 ? vv : -vv);
    };
    const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
    const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
    return x1 + v * (x2 - x1);
  }

  noise3(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = Noise.fade(xf);
    const v = Noise.fade(yf);
    const w = Noise.fade(zf);
    const p = this.perm;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    const g = Noise.grad3;
    const x1 = g(p[AA], xf, yf, zf) + u * (g(p[BA], xf - 1, yf, zf) - g(p[AA], xf, yf, zf));
    const x2 = g(p[AB], xf, yf - 1, zf) + u * (g(p[BB], xf - 1, yf - 1, zf) - g(p[AB], xf, yf - 1, zf));
    const y1 = x1 + v * (x2 - x1);
    const x3 = g(p[AA + 1], xf, yf, zf - 1) + u * (g(p[BA + 1], xf - 1, yf, zf - 1) - g(p[AA + 1], xf, yf, zf - 1));
    const x4 = g(p[AB + 1], xf, yf - 1, zf - 1) + u * (g(p[BB + 1], xf - 1, yf - 1, zf - 1) - g(p[AB + 1], xf, yf - 1, zf - 1));
    const y2 = x3 + v * (x4 - x3);
    return y1 + w * (y2 - y1);
  }

  fbm2(x: number, y: number, octaves = 4, gain = 0.5, lacunarity = 2): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x: number, y: number, z: number, octaves = 3, gain = 0.5, lacunarity = 2): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  ridged2(x: number, y: number, octaves = 4): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
