import * as THREE from 'three';
import { BLOCKS, BLOCK_BY_KEY, collectTileNames, type BlockDef } from '../world/Blocks';
import { drawTile, TILE_SIZE } from './BlockTextureArt';

export interface UVRect { u0: number; v0: number; u1: number; v1: number }

const PAD = 2;
const CELL = TILE_SIZE + PAD * 2;
const COLS = 16;

export type FaceName = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';

export function tileForFace(def: BlockDef, face: FaceName): string | undefined {
  const t = def.tiles;
  if (face === 'top') return t.top ?? t.side;
  if (face === 'bottom') return t.bottom ?? t.side;
  return t[face] ?? t.side ?? t.top;
}

/**
 * One procedurally generated texture atlas for every block face.
 * Also owns the four shared block materials and the 2D isometric icon renderer.
 * No external image assets are required.
 */
export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly tileNames: string[];
  readonly width: number;
  readonly height: number;
  readonly cols = COLS;
  readonly rows: number;
  readonly cell = CELL;
  readonly pad = PAD;

  private tileCanvases = new Map<string, HTMLCanvasElement>();
  private tileUrls = new Map<string, string>();
  private uvMap = new Map<string, UVRect>();
  private iconCache = new Map<string, string>();

  readonly materials: {
    opaque: THREE.MeshLambertMaterial;
    cutout: THREE.MeshLambertMaterial;
    liquid: THREE.MeshLambertMaterial;
    plant: THREE.MeshLambertMaterial;
  };

  constructor() {
    this.tileNames = collectTileNames();
    this.rows = Math.ceil(this.tileNames.length / COLS);
    this.width = COLS * CELL;
    this.height = this.rows * CELL;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    this.buildTiles();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 4;
    this.texture.needsUpdate = true;

    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: this.texture, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({
        map: this.texture, vertexColors: true, transparent: true, alphaTest: 0.02,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      liquid: new THREE.MeshLambertMaterial({
        map: this.texture, vertexColors: true, transparent: true, opacity: 0.76,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      plant: new THREE.MeshLambertMaterial({
        map: this.texture, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide,
      }),
    };
  }

  private buildTiles() {
    this.tileNames.forEach((name, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = col * CELL;
      const y = row * CELL;
      const tile = drawTile(name);
      this.tileCanvases.set(name, tile);
      this.ctx.drawImage(tile, x + PAD, y + PAD);

      // Stretch the edge pixels into the padding so mipmaps cannot bleed
      // colours from a neighbouring tile.
      this.ctx.drawImage(tile, 0, 0, 1, TILE_SIZE, x + PAD - 2, y + PAD, 2, TILE_SIZE);
      this.ctx.drawImage(tile, TILE_SIZE - 1, 0, 1, TILE_SIZE, x + PAD + TILE_SIZE, y + PAD, 2, TILE_SIZE);
      this.ctx.drawImage(tile, 0, 0, TILE_SIZE, 1, x + PAD, y + PAD - 2, TILE_SIZE, 2);
      this.ctx.drawImage(tile, 0, TILE_SIZE - 1, TILE_SIZE, 1, x + PAD, y + PAD + TILE_SIZE, TILE_SIZE, 2);
      this.ctx.drawImage(tile, 0, 0, 1, 1, x + PAD - 2, y + PAD - 2, 2, 2);
      this.ctx.drawImage(tile, TILE_SIZE - 1, 0, 1, 1, x + PAD + TILE_SIZE, y + PAD - 2, 2, 2);
      this.ctx.drawImage(tile, 0, TILE_SIZE - 1, 1, 1, x + PAD - 2, y + PAD + TILE_SIZE, 2, 2);
      this.ctx.drawImage(tile, TILE_SIZE - 1, TILE_SIZE - 1, 1, 1, x + PAD + TILE_SIZE, y + PAD + TILE_SIZE, 2, 2);

      const inset = 0.28;
      const u0 = (x + PAD + inset) / this.width;
      const u1 = (x + PAD + TILE_SIZE - inset) / this.width;
      const vTop = 1 - (y + PAD + inset) / this.height;
      const vBottom = 1 - (y + PAD + TILE_SIZE - inset) / this.height;
      this.uvMap.set(name, { u0, v0: vBottom, u1, v1: vTop });
    });
  }

  getUV(name: string | undefined): UVRect {
    return (name && this.uvMap.get(name)) || this.uvMap.get('missing')!;
  }

  getTileCanvas(name: string): HTMLCanvasElement {
    return this.tileCanvases.get(name) ?? this.tileCanvases.get('missing')!;
  }

  getTileURL(name: string): string {
    let url = this.tileUrls.get(name);
    if (!url) {
      url = this.getTileCanvas(name).toDataURL();
      this.tileUrls.set(name, url);
    }
    return url;
  }

  /** A crisp 2D isometric cube icon rendered from the block's actual tiles. */
  getBlockIcon(blockKey: string): string {
    const cached = this.iconCache.get(blockKey);
    if (cached) return cached;
    const def = BLOCK_BY_KEY.get(blockKey);
    if (!def) return '';
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    if (def.render === 'cross') {
      const tileName = def.tiles.side ?? 'missing';
      const tile = this.getTileCanvas(tileName);
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = 8;
      g.shadowOffsetY = 4;
      g.drawImage(tile, 10, 6, 44, 44);
      g.shadowColor = 'transparent';
      // A small dirt base for context.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(32, 55, 18, 5, 0, 0, Math.PI * 2);
      g.fill();
      const url = c.toDataURL();
      this.iconCache.set(blockKey, url);
      return url;
    }

    const topName = def.tiles.top ?? def.tiles.side ?? 'missing';
    const sideName = def.tiles.south ?? def.tiles.side ?? topName;
    const top = this.getTileCanvas(topName);
    const side = this.getTileCanvas(sideName);

    const T = { x: 32, y: 5 };
    const R = { x: 58, y: 19 };
    const B = { x: 32, y: 33 };
    const L = { x: 6, y: 19 };
    const D = 20;
    const Ld = { x: L.x, y: L.y + D };
    const Bd = { x: B.x, y: B.y + D };
    const Rd = { x: R.x, y: R.y + D };

    const drawFace = (img: HTMLCanvasElement, o: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }, shade: number) => {
      g.save();
      g.setTransform(u.x / TILE_SIZE, u.y / TILE_SIZE, v.x / TILE_SIZE, v.y / TILE_SIZE, o.x, o.y);
      g.globalAlpha = 1;
      g.drawImage(img, 0, 0);
      g.restore();
      g.save();
      g.beginPath();
      g.moveTo(o.x, o.y);
      g.lineTo(o.x + u.x, o.y + u.y);
      g.lineTo(o.x + u.x + v.x, o.y + u.y + v.y);
      g.lineTo(o.x + v.x, o.y + v.y);
      g.closePath();
      g.fillStyle = shade >= 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      g.fill();
      g.restore();
    };

    // Side faces first, then top.
    drawFace(side, L, { x: B.x - L.x, y: B.y - L.y }, { x: 0, y: D }, -0.22);
    drawFace(side, B, { x: R.x - B.x, y: R.y - B.y }, { x: 0, y: D }, -0.36);
    drawFace(top, L, { x: T.x - L.x, y: T.y - L.y }, { x: B.x - L.x, y: B.y - L.y }, 0.06);

    // outline
    g.strokeStyle = 'rgba(3,8,12,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(T.x + 0.5, T.y + 0.5);
    g.lineTo(R.x + 0.5, R.y + 0.5);
    g.lineTo(Rd.x + 0.5, Rd.y + 0.5);
    g.lineTo(Bd.x + 0.5, Bd.y + 0.5);
    g.lineTo(Ld.x + 0.5, Ld.y + 0.5);
    g.lineTo(L.x + 0.5, L.y + 0.5);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(L.x + 0.5, L.y + 0.5);
    g.lineTo(B.x + 0.5, B.y + 0.5);
    g.lineTo(R.x + 0.5, R.y + 0.5);
    g.moveTo(B.x + 0.5, B.y + 0.5);
    g.lineTo(Bd.x + 0.5, Bd.y + 0.5);
    g.stroke();

    const url = c.toDataURL();
    this.iconCache.set(blockKey, url);
    return url;
  }

  /** A square icon of a single texture, useful for material palettes. */
  getTileIcon(name: string): string {
    return this.getTileURL(name);
  }

  dispose() {
    this.texture.dispose();
    this.materials.opaque.dispose();
    this.materials.cutout.dispose();
    this.materials.liquid.dispose();
    this.materials.plant.dispose();
  }
}
