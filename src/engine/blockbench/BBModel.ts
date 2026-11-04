/** Blockbench .bbmodel document types (loose, forward-compatible). */

export interface BBFace {
  uv?: [number, number, number, number] | number[];
  texture?: number;
  rotation?: number;
  tint?: number;
  cullface?: string;
}

export interface BBElement {
  uuid?: string;
  name?: string;
  type?: string;
  from: [number, number, number];
  to: [number, number, number];
  origin?: [number, number, number];
  rotation?: [number, number, number];
  inflate?: number;
  faces?: Record<string, BBFace>;
  visibility?: boolean;
  export?: boolean;
}

export interface BBTexture {
  name?: string;
  source?: string;
  uv_width?: number;
  uv_height?: number;
  width?: number;
  height?: number;
  id?: string;
}

export interface BBBone {
  uuid?: string;
  name: string;
  origin: [number, number, number];
  rotation?: [number, number, number];
  children: Array<string | BBBone>;
  visibility?: boolean;
}

export interface BBKeyframeDataPoint {
  x?: number;
  y?: number;
  z?: number;
  timeline?: number;
}

export interface BBKeyframe {
  channel?: string;
  data_points?: BBKeyframeDataPoint[];
  interpolation?: string;
}

export interface BBAnimator {
  name?: string;
  type?: string;
  rotation?: Record<string, [number, number, number] | { x?: number; y?: number; z?: number }> | { keyframes?: BBKeyframe[] } | [number, number, number];
  position?: Record<string, [number, number, number] | { x?: number; y?: number; z?: number }> | { keyframes?: BBKeyframe[] } | [number, number, number];
  scale?: Record<string, [number, number, number] | { x?: number; y?: number; z?: number }> | { keyframes?: BBKeyframe[] } | [number, number, number];
  keyframes?: BBKeyframe[];
}

export interface BBAnimation {
  name: string;
  loop?: 'loop' | 'once' | 'hold' | string;
  length?: number;
  animators?: Record<string, BBAnimator>;
  uuid?: string;
}

export interface BBModel {
  meta?: { format_version?: string; model_format?: string; box_uv?: boolean; [key: string]: unknown };
  name?: string;
  model_identifier?: string;
  resolution?: { width?: number; height?: number };
  elements?: BBElement[];
  outliner?: Array<string | BBBone>;
  textures?: BBTexture[];
  animations?: BBAnimation[];
  [key: string]: unknown;
}

export type Vec3Tuple = [number, number, number];

export interface AnimationChannel {
  rotation?: Array<{ t: number; value: Vec3Tuple }>;
  position?: Array<{ t: number; value: Vec3Tuple }>;
  scale?: Array<{ t: number; value: Vec3Tuple }>;
}

export interface ParsedAnimation {
  name: string;
  length: number;
  loop: 'loop' | 'once' | 'hold';
  channels: Map<string, AnimationChannel>;
}

function vec(value: unknown, fallback: Vec3Tuple = [0, 0, 0]): Vec3Tuple {
  if (Array.isArray(value)) return [Number(value[0] ?? 0), Number(value[1] ?? 0), Number(value[2] ?? 0)];
  if (value && typeof value === 'object') {
    const v = value as { x?: number; y?: number; z?: number };
    return [Number(v.x ?? 0), Number(v.y ?? 0), Number(v.z ?? 0)];
  }
  return fallback;
}

export function parseBBModel(raw: unknown): BBModel {
  if (!raw || typeof raw !== 'object') throw new Error('This file does not contain a Blockbench model.');
  const model = raw as BBModel;
  if (!Array.isArray(model.elements) && !Array.isArray(model.outliner)) {
    throw new Error('Invalid Blockbench model: no elements or outliner.');
  }
  model.elements = Array.isArray(model.elements) ? model.elements : [];
  model.outliner = Array.isArray(model.outliner) ? model.outliner : [];
  model.textures = Array.isArray(model.textures) ? model.textures : [];
  model.animations = Array.isArray(model.animations) ? model.animations : [];
  for (const el of model.elements) {
    if (!el.from || !el.to) continue;
    el.from = vec(el.from);
    el.to = vec(el.to);
    if (el.origin) el.origin = vec(el.origin);
    if (el.rotation) el.rotation = vec(el.rotation);
    if (typeof el.inflate !== 'number') el.inflate = 0;
    if (!el.faces) el.faces = {};
  }
  return model;
}

export function textureUVSize(model: BBModel, textureIndex: number): [number, number] {
  const tex = model.textures?.[textureIndex];
  const w = tex?.uv_width ?? tex?.width ?? model.resolution?.width ?? 16;
  const h = tex?.uv_height ?? tex?.height ?? model.resolution?.height ?? 16;
  return [Math.max(1, Number(w)), Math.max(1, Number(h))];
}

function parseChannelValue(value: unknown): Array<{ t: number; value: Vec3Tuple }> {
  if (!value) return [];
  const result: Array<{ t: number; value: Vec3Tuple }> = [];
  const pushPoint = (p: BBKeyframeDataPoint) => {
    result.push({ t: Number(p.timeline ?? 0), value: vec(p) });
  };
  if (Array.isArray(value)) {
    // Bare [x,y,z] is treated as a constant at t=0.
    if (typeof value[0] === 'number') result.push({ t: 0, value: vec(value) });
    else {
      value.forEach((v, i) => {
        if (v && typeof v === 'object') {
          const point = v as BBKeyframeDataPoint & { time?: number };
          result.push({ t: Number(point.timeline ?? point.time ?? i), value: vec(point) });
        }
      });
    }
  } else if (typeof value === 'object') {
    const obj = value as Record<string, unknown> & { keyframes?: BBKeyframe[] };
    if (Array.isArray(obj.keyframes)) {
      for (const kf of obj.keyframes) {
        for (const p of kf.data_points ?? []) pushPoint(p);
      }
    } else {
      for (const [key, v] of Object.entries(obj)) {
        const t = Number(key);
        if (!Number.isFinite(t)) continue;
        result.push({ t, value: vec(v) });
      }
    }
  }
  result.sort((a, b) => a.t - b.t);
  return result;
}

export function parseAnimations(model: BBModel): ParsedAnimation[] {
  const animations: ParsedAnimation[] = [];
  for (const raw of model.animations ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const channels = new Map<string, AnimationChannel>();
    for (const [boneKey, animator] of Object.entries(raw.animators ?? {})) {
      if (!boneKey || !animator) continue;
      const channel: AnimationChannel = {};
      const rot = parseChannelValue(animator.rotation);
      const pos = parseChannelValue(animator.position);
      const scale = parseChannelValue(animator.scale);
      const fromKeyframes: BBKeyframe[] = animator.keyframes ?? [];
      if (fromKeyframes.length) {
        for (const kf of fromKeyframes) {
          if (!kf.channel) continue;
          const vals = parseChannelValue({ keyframes: [kf] });
          if (kf.channel === 'rotation') (channel.rotation ??= []).push(...vals);
          else if (kf.channel === 'position') (channel.position ??= []).push(...vals);
          else if (kf.channel === 'scale') (channel.scale ??= []).push(...vals);
        }
      }
      if (rot.length) channel.rotation = rot;
      if (pos.length) channel.position = pos;
      if (scale.length) channel.scale = scale;
      for (const arr of [channel.rotation, channel.position, channel.scale]) arr?.sort((a, b) => a.t - b.t);
      if (channel.rotation || channel.position || channel.scale) channels.set(boneKey, channel);
    }
    let length = Number(raw.length ?? 0);
    if (!length) {
      for (const channel of channels.values()) {
        for (const key of [channel.rotation, channel.position, channel.scale]) {
          for (const k of key ?? []) length = Math.max(length, k.t);
        }
      }
    }
    if (length <= 0) length = 1;
    const loop = raw.loop === 'once' ? 'once' : raw.loop === 'hold' ? 'hold' : 'loop';
    animations.push({ name: raw.name || 'animation', length, loop, channels });
  }
  return animations;
}

export function sampleChannel(points: Array<{ t: number; value: Vec3Tuple }> | undefined, time: number): Vec3Tuple | null {
  if (!points || points.length === 0) return null;
  if (points.length === 1) return points[0].value;
  if (time <= points[0].t) return points[0].value;
  const last = points[points.length - 1];
  if (time >= last.t) return last.value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.t && time <= b.t) {
      const span = b.t - a.t;
      const t = span <= 1e-6 ? 0 : (time - a.t) / span;
      return [
        a.value[0] + (b.value[0] - a.value[0]) * t,
        a.value[1] + (b.value[1] - a.value[1]) * t,
        a.value[2] + (b.value[2] - a.value[2]) * t,
      ];
    }
  }
  return last.value;
}

export function isBBModel(raw: unknown): raw is BBModel {
  return !!raw && typeof raw === 'object' && (Array.isArray((raw as BBModel).elements) || Array.isArray((raw as BBModel).outliner));
}
