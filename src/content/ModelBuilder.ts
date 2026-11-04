import type { BBAnimation, BBAnimator, BBBone, BBElement, BBModel } from '../engine/blockbench/BBModel';
import { TextureSheet, type TileRect } from './TextureSheet';

export type FaceKey = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';
export type FaceTiles = Partial<Record<FaceKey, string>>;

export interface CubeSpec {
  name: string;
  bone: string;
  from: [number, number, number];
  to: [number, number, number];
  tiles: string | FaceTiles;
  rotation?: [number, number, number];
  origin?: [number, number, number];
  inflate?: number;
  hidden?: FaceKey[];
}

export interface BoneSpec {
  name: string;
  origin: [number, number, number];
  parent?: string;
  rotation?: [number, number, number];
  visible?: boolean;
}

export interface AnimationSpec {
  name: string;
  length: number;
  loop?: 'loop' | 'once' | 'hold';
  channels: Record<string, {
    rotation?: Record<string, [number, number, number]>;
    position?: Record<string, [number, number, number]>;
    scale?: Record<string, [number, number, number]>;
  }>;
}

const FACE_KEYS: FaceKey[] = ['up', 'down', 'north', 'south', 'east', 'west'];

/** Build Blockbench-compatible JSON from procedural cubes, bones and keyframes. */
export class ModelBuilder {
  readonly sheet = new TextureSheet();
  readonly name: string;
  private cubes: CubeSpec[] = [];
  private bones: BoneSpec[] = [];
  private animations: AnimationSpec[] = [];
  private cubeCounter = 0;

  constructor(name: string) {
    this.name = name;
  }

  tile(name: string, painter: (ctx: CanvasRenderingContext2D) => void): this {
    this.sheet.tile(name, painter);
    return this;
  }

  /** Ensure a solid colour tile exists and return its name. */
  colorTile(name: string, color: string): string {
    if (!this.sheet.has(name)) this.sheet.tile(name, (ctx) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 16, 16);
    });
    return name;
  }

  bone(name: string, origin: [number, number, number], parent?: string, rotation?: [number, number, number]): this {
    if (this.bones.some((b) => b.name === name)) return this;
    this.bones.push({ name, origin, parent, rotation });
    return this;
  }

  cube(
    bone: string,
    name: string,
    from: [number, number, number],
    to: [number, number, number],
    tiles: string | FaceTiles,
    opts: { rotation?: [number, number, number]; origin?: [number, number, number]; inflate?: number; hidden?: FaceKey[] } = {},
  ): this {
    if (!this.bones.some((b) => b.name === bone)) this.bone(bone, [0, 0, 0]);
    this.cubes.push({
      name: name || `cube_${this.cubeCounter++}`,
      bone,
      from,
      to,
      tiles,
      rotation: opts.rotation,
      origin: opts.origin,
      inflate: opts.inflate,
      hidden: opts.hidden,
    });
    return this;
  }

  anim(spec: AnimationSpec): this {
    this.animations.push(spec);
    return this;
  }

  /** Convenience: all six faces, with sensible fallbacks. */
  static faces(front: string, side: string, back: string, top: string, bottom: string): FaceTiles {
    return { south: front, east: side, west: side, north: back, up: top, down: bottom };
  }

  build(): BBModel {
    const elements: BBElement[] = [];
    const faceRects = new Map<string, TileRect>();
    const tile = (name: string): TileRect => {
      let rect = faceRects.get(name);
      if (!rect) {
        // Hex colours are accepted as inline tiles so ad-hoc accents never break a build.
        const key = /^#[0-9a-f]{3,8}$/i.test(name) ? this.colorTile(`__color_${name.slice(1).toLowerCase()}`, name) : name;
        rect = this.sheet.get(key);
        faceRects.set(name, rect);
      }
      return rect;
    };

    for (const cube of this.cubes) {
      const uuid = `el_${this.name}_${cube.name}`;
      const faces: BBElement['faces'] = {};
      for (const key of FACE_KEYS) {
        if (cube.hidden?.includes(key)) continue;
        const tileName = typeof cube.tiles === 'string' ? cube.tiles : cube.tiles[key] ?? cube.tiles.south ?? cube.tiles.up ?? cube.tiles.north;
        if (!tileName) continue;
        const rect = tile(tileName);
        faces[key] = {
          uv: [rect[0], rect[1], rect[2], rect[3]],
          texture: 0,
        };
      }
      elements.push({
        uuid,
        name: cube.name,
        type: 'cube',
        from: cube.from,
        to: cube.to,
        origin: cube.origin,
        rotation: cube.rotation,
        inflate: cube.inflate ?? 0,
        faces,
        visibility: true,
        export: true,
      });
    }

    const bonesByName = new Map<string, BBBone>();
    for (const spec of this.bones) {
      bonesByName.set(spec.name, {
        uuid: `bone_${this.name}_${spec.name}`,
        name: spec.name,
        origin: spec.origin,
        rotation: spec.rotation,
        children: [],
        visibility: spec.visible ?? true,
      });
    }

    for (const cube of this.cubes) {
      const bone = bonesByName.get(cube.bone);
      if (bone) bone.children.push(`el_${this.name}_${cube.name}`);
    }

    const roots: BBBone[] = [];
    for (const spec of this.bones) {
      const bone = bonesByName.get(spec.name)!;
      if (spec.parent) {
        const parent = bonesByName.get(spec.parent);
        if (parent) parent.children.push(bone);
        else roots.push(bone);
      } else {
        roots.push(bone);
      }
    }

    const animations: BBAnimation[] = this.animations.map((anim) => {
      const animators: Record<string, BBAnimator> = {};
      for (const [bone, channel] of Object.entries(anim.channels)) {
        animators[bone] = {
          ...(channel.rotation ? { rotation: channel.rotation } : {}),
          ...(channel.position ? { position: channel.position } : {}),
          ...(channel.scale ? { scale: channel.scale } : {}),
        };
      }
      return { name: anim.name, length: anim.length, loop: anim.loop ?? 'loop', animators };
    });

    return {
      meta: { format_version: '4.10', model_format: 'free', box_uv: false },
      name: this.name,
      model_identifier: this.name,
      resolution: { width: 256, height: 256 },
      elements,
      outliner: roots,
      textures: [{
        name: `${this.name}_texture`,
        source: this.sheet.dataURL(),
        width: 256,
        height: 256,
        uv_width: 256,
        uv_height: 256,
      }],
      animations,
    };
  }
}

/** A compact cyclic keyframe helper for procedural animations. */
export function cycle(steps: Array<[number, [number, number, number]]>): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const [time, value] of steps) out[String(time)] = value;
  return out;
}

export function pairs(a: [number, number, number], b: [number, number, number], length = 1): Record<string, [number, number, number]> {
  return {
    '0': a,
    [String(length / 2)]: b,
    [String(length)]: a,
  };
}
