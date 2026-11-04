import * as THREE from 'three';
import {
  parseBBModel,
  parseAnimations,
  sampleChannel,
  textureUVSize,
  type BBElement,
  type BBBone,
  type BBModel,
  type ParsedAnimation,
} from './BBModel';

export interface LoadedModel {
  name: string;
  root: THREE.Group;
  bonesByName: Map<string, THREE.Group>;
  bonesByUuid: Map<string, THREE.Group>;
  animations: Map<string, ParsedAnimation>;
  source: BBModel;
  materials: THREE.Material[];
  size: THREE.Vector3;
  textureSizes: Array<[number, number]>;
}

export interface LoadOptions {
  opacity?: number;
  scale?: number;
  castShadow?: boolean;
  name?: string;
}

let checkerUrl: string | null = null;
function getChecker(): string {
  if (checkerUrl) return checkerUrl;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f55f8b' : '#22242e';
      g.fillRect(x * 4, y * 4, 4, 4);
    }
  }
  checkerUrl = c.toDataURL();
  return checkerUrl;
}

const FACES: Array<{
  key: string;
  normal: [number, number, number];
  corners: (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => Array<[number, number, number]>;
}> = [
  { key: 'up', normal: [0, 1, 0], corners: (x0, x1, y0, y1, z0, z1) => [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
  { key: 'down', normal: [0, -1, 0], corners: (x0, x1, y0, y1, z0, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  { key: 'east', normal: [1, 0, 0], corners: (x0, x1, y0, y1, z0, z1) => [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
  { key: 'west', normal: [-1, 0, 0], corners: (x0, x1, y0, y1, z0, z1) => [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
  { key: 'south', normal: [0, 0, 1], corners: (x0, x1, y0, y1, z0, z1) => [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
  { key: 'north', normal: [0, 0, -1], corners: (x0, x1, y0, y1, z0, z1) => [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
];

function makeTexture(source: string | undefined, onLoad?: () => void): THREE.Texture {
  const loader = new THREE.TextureLoader();
  const usable = !!source && (source.startsWith('data:') || /^https?:/i.test(source));
  const tex = loader.load(usable ? source! : getChecker(), (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    onLoad?.();
  }, undefined, () => {
    const checker = loader.load(getChecker(), (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      onLoad?.();
    });
    void checker;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function addElement(
  parent: THREE.Group,
  element: BBElement,
  containerOrigin: [number, number, number],
  textures: THREE.Material[],
  textureSizes: Array<[number, number]>,
) {
  const inflate = Number(element.inflate ?? 0);
  const x0 = Math.min(element.from[0], element.to[0]) - inflate;
  const x1 = Math.max(element.from[0], element.to[0]) + inflate;
  const y0 = Math.min(element.from[1], element.to[1]) - inflate;
  const y1 = Math.max(element.from[1], element.to[1]) + inflate;
  const z0 = Math.min(element.from[2], element.to[2]) - inflate;
  const z1 = Math.max(element.from[2], element.to[2]) + inflate;

  const rotating = !!element.rotation && element.rotation.some((v) => Math.abs(v) > 0.0001);
  const pivot = element.origin ?? [0, 0, 0];
  const reference = rotating ? pivot : containerOrigin;

  let targetParent = parent;
  let pivotGroup: THREE.Group | null = null;
  if (rotating) {
    pivotGroup = new THREE.Group();
    pivotGroup.name = `${element.name ?? 'element'}_pivot`;
    pivotGroup.position.set(pivot[0] - containerOrigin[0], pivot[1] - containerOrigin[1], pivot[2] - containerOrigin[2]);
    pivotGroup.rotation.order = 'ZYX';
    pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(element.rotation![0]),
      THREE.MathUtils.degToRad(element.rotation![1]),
      THREE.MathUtils.degToRad(element.rotation![2]),
    );
    parent.add(pivotGroup);
    targetParent = pivotGroup;
  }

  const byTexture = new Map<number, { pos: number[]; norm: number[]; uv: number[]; idx: number[] }>();
  const faces = element.faces ?? {};
  for (const face of FACES) {
    const faceData = faces[face.key];
    if (!faceData || !faceData.uv || faceData.uv.length < 4) continue;
    const textureIndex = Math.max(0, Math.min(textures.length - 1, Number(faceData.texture ?? 0)));
    const size = textureSizes[textureIndex] ?? [16, 16];
    const corners = face.corners(x0, x1, y0, y1, z0, z1).map((p) => [p[0] - reference[0], p[1] - reference[1], p[2] - reference[2]] as [number, number, number]);
    const [u1, v1, u2, v2] = faceData.uv;
    // Face corners are BL, BR, TR, TL. Blockbench UV rect corners are TL, TR, BR, BL.
    const uvPixel = [
      [u1, v2], [u2, v2], [u2, v1], [u1, v1],
    ];
    const rotation = ((Number(faceData.rotation ?? 0) / 90) % 4 + 4) % 4;
    const rotated = uvPixel.map((_, i) => uvPixel[(i + rotation) % 4]);
    if (!byTexture.has(textureIndex)) byTexture.set(textureIndex, { pos: [], norm: [], uv: [], idx: [] });
    const bucket = byTexture.get(textureIndex)!;
    const base = bucket.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      bucket.pos.push(...corners[i]);
      bucket.norm.push(...face.normal);
      bucket.uv.push(rotated[i][0] / size[0], 1 - rotated[i][1] / size[1]);
    }
    bucket.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  for (const [textureIndex, bucket] of byTexture) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    geo.setIndex(bucket.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, textures[textureIndex] ?? textures[0]);
    mesh.name = element.name ?? 'cube';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    targetParent.add(mesh);
  }
  void pivotGroup;
}

function buildBone(
  parent: THREE.Group,
  bone: BBBone,
  parentOrigin: [number, number, number],
  elementsByUuid: Map<string, BBElement>,
  elementsByName: Map<string, BBElement>,
  added: Set<string>,
  materials: THREE.Material[],
  textureSizes: Array<[number, number]>,
  bonesByName: Map<string, THREE.Group>,
  bonesByUuid: Map<string, THREE.Group>,
) {
  const origin = bone.origin ?? [0, 0, 0];
  const group = new THREE.Group();
  group.name = bone.name;
  group.position.set(origin[0] - parentOrigin[0], origin[1] - parentOrigin[1], origin[2] - parentOrigin[2]);
  const rot = bone.rotation ?? [0, 0, 0];
  group.rotation.order = 'ZYX';
  group.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
  group.userData.isBone = true;
  group.userData.boneName = bone.name;
  group.userData.boneUuid = bone.uuid ?? '';
  group.userData.restPosition = [group.position.x, group.position.y, group.position.z];
  group.userData.restRotation = [group.rotation.x, group.rotation.y, group.rotation.z];
  group.userData.restScale = [group.scale.x, group.scale.y, group.scale.z];
  parent.add(group);
  bonesByName.set(bone.name, group);
  if (bone.uuid) bonesByUuid.set(bone.uuid, group);

  for (const child of bone.children ?? []) {
    if (typeof child === 'string') {
      const el = elementsByUuid.get(child) ?? elementsByName.get(child);
      if (el) {
        addElement(group, el, origin, materials, textureSizes);
        added.add(el.uuid ?? el.name ?? child);
      }
    } else if (child && typeof child === 'object' && 'children' in child) {
      buildBone(group, child as BBBone, origin, elementsByUuid, elementsByName, added, materials, textureSizes, bonesByName, bonesByUuid);
    }
  }
}

/** Load a .bbmodel-compatible object into animated Three.js geometry. */
export function loadBlockbenchModel(raw: unknown, opts: LoadOptions = {}): LoadedModel {
  const source = parseBBModel(raw);
  const name = opts.name ?? source.name ?? 'Imported Model';
  const root = new THREE.Group();
  root.name = `bb:${name}`;
  root.scale.setScalar((opts.scale ?? 1) / 16);

  const opacity = opts.opacity ?? 1;
  const textureSizes: Array<[number, number]> = [];
  const materials: THREE.Material[] = [];
  const textureList = source.textures && source.textures.length ? source.textures : [{ source: getChecker() }];
  for (let i = 0; i < textureList.length; i++) {
    const tex = textureList[i];
    textureSizes.push(textureUVSize(source, i));
    const map = makeTexture(tex.source);
    const material = new THREE.MeshLambertMaterial({
      map,
      transparent: opacity < 1,
      opacity,
      alphaTest: opacity < 1 ? 0.02 : 0.04,
      side: THREE.DoubleSide,
      depthWrite: opacity >= 1,
    });
    materials.push(material);
  }

  const elements = source.elements ?? [];
  const elementsByUuid = new Map<string, BBElement>();
  const elementsByName = new Map<string, BBElement>();
  for (const el of elements) {
    if (el.uuid) elementsByUuid.set(el.uuid, el);
    if (el.name) elementsByName.set(el.name, el);
  }
  const added = new Set<string>();
  const bonesByName = new Map<string, THREE.Group>();
  const bonesByUuid = new Map<string, THREE.Group>();

  for (const node of source.outliner ?? []) {
    if (typeof node === 'string') {
      const el = elementsByUuid.get(node) ?? elementsByName.get(node);
      if (el) {
        addElement(root, el, [0, 0, 0], materials, textureSizes);
        added.add(el.uuid ?? el.name ?? node);
      }
    } else if (node && typeof node === 'object' && 'children' in node) {
      buildBone(root, node as BBBone, [0, 0, 0], elementsByUuid, elementsByName, added, materials, textureSizes, bonesByName, bonesByUuid);
    }
  }

  // Elements not referenced by an outliner node still belong in the model.
  for (const el of elements) {
    const key = el.uuid ?? el.name;
    if (key && added.has(key)) continue;
    if (el.uuid && added.has(el.uuid)) continue;
    addElement(root, el, [0, 0, 0], materials, textureSizes);
  }

  const animations = new Map<string, ParsedAnimation>();
  for (const anim of parseAnimations(source)) animations.set(anim.name, anim);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return {
    name,
    root,
    bonesByName,
    bonesByUuid,
    animations,
    source,
    materials,
    size,
    textureSizes,
  };
}

interface ActiveAction {
  name: string;
  time: number;
  speed: number;
  loop: boolean;
  once: boolean;
  weight: number;
  fadeIn: number;
  elapsed: number;
  overlay: boolean;
}

/**
 * A lightweight instance of a loaded Blockbench model. It clones the scene
 * graph but shares geometry, then layers animation channels on top of rest pose.
 */
export class ModelInstance {
  readonly loaded: LoadedModel;
  readonly root: THREE.Group;
  readonly bonesByName = new Map<string, THREE.Group>();
  readonly bonesByUuid = new Map<string, THREE.Group>();
  readonly materials: THREE.MeshLambertMaterial[] = [];

  private rest = new Map<THREE.Group, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }>();
  private base: ActiveAction | null = null;
  private overlays: ActiveAction[] = [];
  private hurtFlash = 0;

  constructor(loaded: LoadedModel) {
    this.loaded = loaded;
    this.root = loaded.root.clone(true);
    this.root.traverse((obj) => {
      const bone = obj as THREE.Group;
      if (bone.userData?.isBone) {
        this.bonesByName.set(bone.userData.boneName, bone);
        if (bone.userData.boneUuid) this.bonesByUuid.set(bone.userData.boneUuid, bone);
        this.rest.set(bone, {
          p: bone.position.clone(),
          r: bone.rotation.clone(),
          s: bone.scale.clone(),
        });
      }
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = mats.map((m) => {
          const c = (m as THREE.MeshLambertMaterial).clone();
          c.transparent = (m as THREE.MeshLambertMaterial).transparent;
          this.materials.push(c);
          return c;
        });
        mesh.material = cloned.length === 1 ? cloned[0] : cloned;
      }
    });
  }

  get object(): THREE.Group {
    return this.root;
  }

  get boneNames(): string[] {
    return [...this.bonesByName.keys()];
  }

  getBone(name: string): THREE.Group | undefined {
    return this.bonesByName.get(name) ?? this.bonesByUuid.get(name);
  }

  hasAnimation(name: string): boolean {
    return this.loaded.animations.has(name);
  }

  setBase(name: string, speed = 1) {
    if (!this.loaded.animations.has(name)) return;
    if (this.base?.name === name) {
      this.base.speed = speed;
      return;
    }
    const anim = this.loaded.animations.get(name)!;
    this.base = {
      name, time: 0, speed, loop: anim.loop === 'loop', once: false, weight: 1,
      fadeIn: 0, elapsed: 0, overlay: false,
    };
  }

  play(name: string, options: { speed?: number; once?: boolean; fadeIn?: number; overlay?: boolean } = {}) {
    const anim = this.loaded.animations.get(name);
    if (!anim) return;
    const action: ActiveAction = {
      name,
      time: 0,
      speed: options.speed ?? 1,
      loop: options.once ? false : anim.loop === 'loop',
      once: options.once ?? false,
      weight: 1,
      fadeIn: options.fadeIn ?? 0,
      elapsed: 0,
      overlay: options.overlay ?? true,
    };
    if (action.overlay) {
      this.overlays = this.overlays.filter((a) => a.name !== name);
      this.overlays.push(action);
    } else {
      this.base = action;
    }
  }

  stop(name: string) {
    if (this.base?.name === name) this.base = null;
    this.overlays = this.overlays.filter((a) => a.name !== name);
  }

  flashHurt(intensity = 0.7) {
    this.hurtFlash = Math.max(this.hurtFlash, intensity);
  }

  private applyAction(action: ActiveAction, weight: number, absolute: boolean) {
    const anim = this.loaded.animations.get(action.name);
    if (!anim) return;
    for (const [boneKey, channel] of anim.channels) {
      const bone = this.bonesByName.get(boneKey) ?? this.bonesByUuid.get(boneKey);
      if (!bone) continue;
      const rest = this.rest.get(bone);
      if (!rest) continue;
      if (channel.rotation) {
        const val = sampleChannel(channel.rotation, action.time);
        if (val) {
          const targetX = rest.r.x + THREE.MathUtils.degToRad(val[0]);
          const targetY = rest.r.y + THREE.MathUtils.degToRad(val[1]);
          const targetZ = rest.r.z + THREE.MathUtils.degToRad(val[2]);
          if (absolute) bone.rotation.set(targetX, targetY, targetZ);
          else {
            bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetX, weight);
            bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, targetY, weight);
            bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetZ, weight);
          }
        }
      }
      if (channel.position) {
        const val = sampleChannel(channel.position, action.time);
        if (val) {
          const target = new THREE.Vector3(rest.p.x + val[0], rest.p.y + val[1], rest.p.z + val[2]);
          if (absolute) bone.position.copy(target);
          else bone.position.lerp(target, weight);
        }
      }
      if (channel.scale) {
        const val = sampleChannel(channel.scale, action.time);
        if (val) {
          const sx = Math.abs(val[0]) > 8 ? val[0] / 100 : val[0];
          const sy = Math.abs(val[1]) > 8 ? val[1] / 100 : val[1];
          const sz = Math.abs(val[2]) > 8 ? val[2] / 100 : val[2];
          const target = new THREE.Vector3(rest.s.x * sx, rest.s.y * sy, rest.s.z * sz);
          if (absolute) bone.scale.copy(target);
          else bone.scale.lerp(target, weight);
        }
      }
    }
  }

  update(dt: number) {
    // Advance actions.
    const advance = (a: ActiveAction): boolean => {
      a.elapsed += dt;
      if (a.overlay) a.weight = Math.min(1, a.fadeIn > 0 ? a.elapsed / a.fadeIn : 1);
      a.time += dt * a.speed;
      const anim = this.loaded.animations.get(a.name);
      if (!anim) return false;
      if (a.time >= anim.length) {
        if (a.loop) a.time %= anim.length;
        else if (a.once) return false;
        else a.time = anim.length;
      }
      return true;
    };

    if (this.base) {
      const keep = advance(this.base);
      if (!keep) this.base = null;
    }
    this.overlays = this.overlays.filter((a) => advance(a));

    // Reset to rest.
    for (const [bone, rest] of this.rest) {
      bone.rotation.copy(rest.r);
      bone.position.copy(rest.p);
      bone.scale.copy(rest.s);
    }

    if (this.base) this.applyAction(this.base, 1, true);
    for (const overlay of this.overlays) this.applyAction(overlay, overlay.weight, false);

    // Hurt flash fades quickly.
    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      for (const mat of this.materials) {
        mat.emissive.setRGB(this.hurtFlash * 0.7, 0, 0);
      }
    } else {
      for (const mat of this.materials) {
        if (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0) mat.emissive.setRGB(0, 0, 0);
      }
    }
  }

  setOpacity(opacity: number) {
    for (const mat of this.materials) {
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
      mat.depthWrite = opacity >= 1;
      mat.needsUpdate = true;
    }
  }

  dispose() {
    this.root.removeFromParent();
    // Geometry and textures are owned by the loaded model and shared between clones.
  }
}

export function createModelInstance(loaded: LoadedModel): ModelInstance {
  return new ModelInstance(loaded);
}

