import * as THREE from 'three';
import type { ItemDef } from '../../content/Recipes';

/**
 * First-person held item models.
 *
 * Every model is built from a handful of chunky boxes so it matches the voxel
 * look of the world. Origin sits near the grip; +Y is up and -Z points away
 * from the camera. Models are cached by the caller, so geometry and materials
 * can be shared between frames.
 */

export type HeldCategory =
  | 'sword' | 'tool' | 'gun' | 'bow' | 'staff' | 'shield'
  | 'food' | 'torch' | 'potion' | 'armor' | 'material' | 'special';

export interface HeldModel {
  group: THREE.Group;
  category: HeldCategory;
  /** Optional muzzle anchor for guns / staves. */
  muzzle?: THREE.Object3D;
  /** Extra length so the caller can tune the swing arc. */
  reach: number;
}

const materials = new Map<string, THREE.MeshLambertMaterial>();

function mat(color: string | number, emissive = 0, emissiveIntensity = 0): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const m = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
  });
  materials.set(key, m);
  return m;
}

function box(
  parent: THREE.Object3D,
  color: string | number,
  w: number, h: number, d: number,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  emissive = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, emissive, emissive ? 0.55 : 0));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function wedge(
  parent: THREE.Object3D,
  color: string | number,
  radius: number, height: number,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, height, 4);
  geo.rotateY(Math.PI / 4);
  geo.scale(1, 1, 0.42);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function tierColors(key: string, fallback: string): { metal: string; dark: string; guard: string } {
  if (key.startsWith('wood')) return { metal: '#a9753f', dark: '#6b4526', guard: '#6b4526' };
  if (key.startsWith('stone')) return { metal: '#9296a0', dark: '#555b66', guard: '#6d5a44' };
  if (key.startsWith('gold')) return { metal: '#f1c64c', dark: '#8d6f22', guard: '#f7dd80' };
  if (key.startsWith('diamond')) return { metal: '#5fddcf', dark: '#2c7d78', guard: '#bff8ef' };
  if (key.startsWith('iron')) return { metal: '#cfd6dd', dark: '#6f7a86', guard: '#8e98a3' };
  return { metal: fallback, dark: '#4a4f57', guard: fallback };
}

function addArm(group: THREE.Group, skin = '#d9a273', sleeve = '#3f6b6a'): void {
  // Forearm enters from the lower-right of the screen.
  box(group, sleeve, 0.16, 0.36, 0.16, 0.02, -0.30, 0.18, 0.22, 0, -0.18);
  box(group, skin, 0.13, 0.14, 0.13, 0.12, -0.10, 0.0, 0.1, 0, -0.18);
  // Three chunky fingers wrapping the grip.
  box(group, skin, 0.035, 0.09, 0.05, 0.15, -0.055, -0.03, 0.15, 0, -0.2);
  box(group, skin, 0.035, 0.08, 0.05, 0.155, -0.055, 0.03, 0.15, 0, -0.2);
  box(group, skin, 0.035, 0.07, 0.05, 0.15, -0.05, 0.085, 0.15, 0, -0.2);
}

/* ------------------------------------------------------------------ models */

function swordModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const { metal, dark, guard } = tierColors(def.key, def.color);
  const key = def.key;
  const glow = key === 'katana' ? 0xff5a2a : key === 'mace' || key === 'hammer' ? 0x9fb6c8 : 0;

  if (key === 'spear') {
    // Long shaft with a leaf-shaped head and a small collar.
    box(g, '#8a5a32', 0.038, 0.78, 0.038, 0, 0.06, 0);
    box(g, '#5c3d24', 0.05, 0.12, 0.05, 0, -0.13, 0);
    box(g, guard, 0.1, 0.035, 0.06, 0, 0.35, 0);
    box(g, metal, 0.075, 0.16, 0.03, 0, 0.48, 0, 0, 0, 0, glow);
    wedge(g, metal, 0.06, 0.17, 0, 0.63, 0);
  } else if (key === 'mace') {
    // Studded war mace: shaft, pommel and a spiked cube head.
    box(g, '#5c3d24', 0.048, 0.58, 0.048, 0, 0.1, 0);
    box(g, guard, 0.075, 0.05, 0.075, 0, -0.2, 0);
    box(g, metal, 0.16, 0.16, 0.16, 0, 0.45, 0, 0, 0, 0, glow);
    for (const [dx, dy, dz] of [[0.11, 0, 0], [-0.11, 0, 0], [0, 0, 0.11], [0, 0, -0.11], [0, 0.11, 0]]) {
      box(g, '#7d8792', 0.055, 0.055, 0.055, dx, 0.45 + dy, dz);
    }
  } else if (key === 'hammer') {
    // Square forge hammer with a broad steel face and a pointed peen.
    box(g, '#5c3d24', 0.048, 0.62, 0.048, 0, 0.08, 0);
    box(g, guard, 0.075, 0.05, 0.075, 0, -0.23, 0);
    box(g, '#6d7781', 0.3, 0.17, 0.17, 0, 0.42, 0, 0, 0, 0, glow);
    box(g, metal, 0.06, 0.2, 0.2, 0.18, 0.42, 0);
    box(g, '#4f5962', 0.05, 0.06, 0.06, -0.17, 0.42, 0);
  } else {
    // Sword family: grip, pommel, crossguard, blade and pointed tip.
    const dagger = key === 'dagger';
    const bladeH = dagger ? 0.28 : 0.44;
    box(g, dark, 0.045, 0.17, 0.05, 0, -0.06, 0);
    box(g, guard, 0.065, 0.055, 0.075, 0, -0.155, 0);
    box(g, guard, dagger ? 0.15 : 0.21, 0.045, 0.065, 0, 0.045, 0);
    const blade = box(g, metal, dagger ? 0.055 : 0.072, bladeH, 0.026, 0, 0.055 + bladeH / 2, 0, 0, 0, 0, glow);
    blade.scale.x = dagger ? 0.9 : 1;
    wedge(g, metal, 0.05, 0.13, 0, 0.06 + bladeH, 0).scale.x = dagger ? 0.7 : 1;
    if (key === 'katana') box(g, '#2a2320', 0.085, 0.03, 0.04, 0, 0.05, 0, 0, 0, 0.12);
  }

  addArm(g);
  g.rotation.set(0.12, -0.08, -0.3);
  return { group: g, category: 'sword', reach: key === 'spear' ? 1.1 : 0.9 };
}

function toolModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const type = def.toolType ?? 'pickaxe';
  const { metal, dark } = tierColors(def.key, def.color);
  const handle = '#8a5a32';
  box(g, handle, 0.042, 0.5, 0.042, 0, 0.02, 0);
  box(g, dark, 0.055, 0.05, 0.055, 0, -0.23, 0);

  if (type === 'pickaxe') {
    box(g, metal, 0.33, 0.055, 0.075, 0, 0.275, 0, 0, 0, 0.12);
    wedge(g, metal, 0.045, 0.13, -0.17, 0.245, 0, 0, 0, Math.PI / 2 + 0.12);
    wedge(g, metal, 0.045, 0.13, 0.17, 0.275, 0, 0, 0, -Math.PI / 2 + 0.12);
  } else if (type === 'axe') {
    box(g, metal, 0.16, 0.17, 0.055, 0.1, 0.25, 0, 0, 0, 0.05);
    box(g, '#e8eef2', 0.035, 0.18, 0.06, 0.19, 0.25, 0);
  } else if (type === 'shovel') {
    box(g, metal, 0.13, 0.17, 0.05, 0, 0.29, 0);
    box(g, '#e8eef2', 0.13, 0.035, 0.055, 0, 0.215, 0);
  } else {
    box(g, metal, 0.22, 0.045, 0.055, 0.08, 0.27, 0, 0, 0, -0.12);
    box(g, metal, 0.045, 0.1, 0.055, 0.185, 0.24, 0);
  }
  addArm(g);
  g.rotation.set(0.1, -0.05, -0.34);
  return { group: g, category: 'tool', reach: 0.85 };
}

function gunModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const metal = '#4a5158';
  const dark = '#22262b';
  const wood = '#6f4a2c';
  // Stock + receiver.
  box(g, wood, 0.065, 0.1, 0.24, 0, -0.015, 0.16, -0.08, 0, 0);
  box(g, metal, 0.07, 0.09, 0.3, 0, 0.02, -0.08);
  box(g, '#333a41', 0.055, 0.055, 0.28, 0, 0.035, -0.35);
  // Barrel.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.26, 8), mat('#1c2024'));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.045, -0.55);
  g.add(barrel);
  box(g, '#111417', 0.038, 0.038, 0.09, 0, 0.045, -0.69);
  // Scope.
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.16, 10), mat('#181c20'));
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.11, -0.1);
  g.add(scope);
  box(g, '#0d1013', 0.075, 0.075, 0.03, 0, 0.11, -0.19);
  box(g, '#2a3036', 0.02, 0.05, 0.03, 0, 0.075, -0.02);
  box(g, '#2a3036', 0.02, 0.05, 0.03, 0, 0.075, -0.18);
  // Magazine + grip.
  box(g, '#2f363d', 0.04, 0.14, 0.07, 0, -0.09, -0.11, 0.22, 0, 0);
  box(g, dark, 0.045, 0.12, 0.055, 0, -0.075, 0.06, -0.3, 0, 0);
  box(g, '#1a1e22', 0.03, 0.06, 0.04, 0, 0.02, 0.04);
  // Muzzle flash (hidden until fired).
  const flash = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), fm);
  flash.add(core);
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), fm);
    spike.rotation.z = Math.PI / 2;
    spike.rotation.x = (i / 3) * Math.PI;
    spike.position.z = -0.06;
    flash.add(spike);
  }
  flash.position.set(0, 0.045, -0.75);
  flash.visible = false;
  g.add(flash);
  addArm(g);
  g.rotation.set(0.02, -0.04, -0.02);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, -0.76);
  g.add(muzzle);
  g.userData.flash = flash;
  return { group: g, category: 'gun', muzzle, reach: 1.05 };
}

function bowModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const wood = '#7c5230';
  // Grip.
  box(g, '#5f3d24', 0.05, 0.22, 0.06, 0, 0, 0);
  // Curved limbs built from short segments.
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = dir * (0.16 + i * 0.12);
      const x = 0.02 + i * 0.028;
      box(g, wood, 0.045, 0.15, 0.05, x, y, 0, 0, 0, dir * (0.18 + i * 0.12));
    }
  }
  box(g, '#e7dfc8', 0.008, 0.74, 0.008, -0.015, 0, -0.02);
  // Nocked arrow.
  box(g, '#b99a6b', 0.014, 0.014, 0.5, 0.03, 0.01, -0.22);
  wedge(g, '#cfd6dd', 0.03, 0.08, 0.03, 0.01, -0.48, Math.PI / 2, 0, 0);
  box(g, '#e8e2d2', 0.05, 0.06, 0.01, 0.03, 0.01, 0.0);
  addArm(g);
  g.rotation.set(0.05, 0.3, -0.28);
  return { group: g, category: 'bow', reach: 0.95 };
}

function staffModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  box(g, '#5a3d29', 0.038, 0.72, 0.038, 0, 0.02, 0);
  box(g, '#c9a15a', 0.055, 0.045, 0.055, 0, -0.3, 0);
  box(g, '#c9a15a', 0.05, 0.04, 0.05, 0, 0.1, 0);
  box(g, '#c9a15a', 0.05, 0.04, 0.05, 0, 0.22, 0);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), mat(def.color, 0x2f6f88, 0.9));
  crystal.position.set(0, 0.42, 0);
  crystal.scale.set(0.8, 1.3, 0.8);
  g.add(crystal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.008, 4, 16), mat('#bff4ff', 0x4fb8d8, 0.8));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.42;
  g.add(ring);
  addArm(g);
  g.rotation.set(0.06, -0.05, -0.22);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.42, -0.12);
  g.add(muzzle);
  return { group: g, category: 'staff', muzzle, reach: 1 };
}

function shieldModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  box(g, '#8b6238', 0.34, 0.42, 0.05, 0, 0.02, 0);
  for (let i = 0; i < 4; i++) {
    box(g, i % 2 === 0 ? '#9a6d3f' : '#7f5731', 0.075, 0.4, 0.062, -0.12 + i * 0.08, 0.02, 0);
  }
  // Iron rim.
  box(g, '#aab4bd', 0.36, 0.035, 0.065, 0, 0.225, 0);
  box(g, '#aab4bd', 0.36, 0.035, 0.065, 0, -0.185, 0);
  box(g, '#aab4bd', 0.035, 0.43, 0.065, -0.172, 0.02, 0);
  box(g, '#aab4bd', 0.035, 0.43, 0.065, 0.172, 0.02, 0);
  box(g, '#d5dce2', 0.11, 0.11, 0.075, 0, 0.02, 0.01);
  box(g, '#77828c', 0.05, 0.16, 0.02, 0, 0.02, 0.05, 0, 0, Math.PI / 4);
  addArm(g);
  g.rotation.set(0.02, -0.12, -0.12);
  return { group: g, category: 'shield', reach: 0.7 };
}

function foodModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const color = def.color;
  if (def.key === 'apple' || def.key === 'golden_apple') {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(color, def.key === 'golden_apple' ? 0x8a6a10 : 0, 0.5));
    fruit.scale.set(1, 0.94, 1);
    fruit.position.y = 0.06;
    g.add(fruit);
    box(g, '#5a3d24', 0.018, 0.09, 0.018, 0, 0.19, 0, 0, 0, 0.2);
    box(g, '#4f8a3a', 0.09, 0.02, 0.05, 0.05, 0.16, 0, 0, 0, -0.35);
  } else if (def.key === 'bread') {
    box(g, '#b07a42', 0.24, 0.12, 0.11, 0, 0.03, 0);
    box(g, '#d3a15f', 0.2, 0.03, 0.09, 0, 0.1, 0);
    for (let i = 0; i < 3; i++) box(g, '#7d4f27', 0.015, 0.02, 0.08, -0.06 + i * 0.06, 0.115, 0, 0, 0, 0.4);
  } else if (def.key === 'carrot') {
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 5), mat(color));
    root.rotation.z = Math.PI;
    root.position.set(0, -0.02, 0);
    g.add(root);
    box(g, '#4c8a3a', 0.02, 0.1, 0.03, 0, 0.16, 0, 0, 0, 0.2);
    box(g, '#4c8a3a', 0.02, 0.09, 0.03, 0.03, 0.17, 0, 0, 0, -0.2);
    box(g, '#4c8a3a', 0.02, 0.09, 0.03, -0.03, 0.17, 0, 0, 0, 0.5);
  } else if (def.key.includes('bottle')) {
    return potionModel(def, true);
  } else {
    // Generic cut of meat / cooked dish.
    box(g, color, 0.2, 0.1, 0.15, 0, 0.03, 0);
    box(g, '#e9c7a3', 0.16, 0.035, 0.11, 0, 0.085, 0);
    box(g, '#6b3a26', 0.06, 0.06, 0.06, 0.09, 0.06, 0.03);
    box(g, '#b9b2a5', 0.02, 0.12, 0.02, -0.1, 0.02, 0.02, 0, 0, 0.5);
  }
  addArm(g, '#d9a273', '#8a6242');
  g.rotation.set(0.1, -0.1, -0.2);
  return { group: g, category: 'food', reach: 0.7 };
}

function potionModel(def: ItemDef, water = false): HeldModel {
  const g = new THREE.Group();
  const liquid = water ? '#5fb6e0' : def.color;
  const glass = new THREE.MeshLambertMaterial({ color: 0xbfe8f4, transparent: true, opacity: 0.42 });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.17, 8), glass);
  bottle.position.y = 0.02;
  g.add(bottle);
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.072, 0.12, 8), mat(liquid, 0x1c5a70, 0.45));
  fill.position.y = -0.005;
  g.add(fill);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.08, 8), glass);
  neck.position.y = 0.14;
  g.add(neck);
  box(g, '#8a5a32', 0.05, 0.035, 0.05, 0, 0.195, 0);
  addArm(g, '#d9a273', '#6a4a30');
  g.rotation.set(0.06, -0.08, -0.1);
  return { group: g, category: 'potion', reach: 0.6 };
}

function torchModel(): HeldModel {
  const g = new THREE.Group();
  box(g, '#7c5230', 0.04, 0.42, 0.04, 0, -0.02, 0);
  box(g, '#3f2c1c', 0.05, 0.05, 0.05, 0, 0.21, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.07), mat('#ffb347', 0xff8a1e, 1));
  head.position.y = 0.27;
  g.add(head);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 5), mat('#ffdc7a', 0xffa21e, 1));
  flame.position.y = 0.37;
  g.add(flame);
  addArm(g, '#d9a273', '#5c4430');
  g.rotation.set(0.1, -0.05, -0.3);
  return { group: g, category: 'torch', reach: 0.8 };
}

function armorModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const color = def.color;
  const dark = '#4c5560';
  if (def.key === 'chef_hat') {
    // A tall pleated toque: band, two puff tiers and a soft crown.
    box(g, color, 0.15, 0.07, 0.15, 0, -0.07, 0);
    box(g, '#ddd8c8', 0.16, 0.02, 0.16, 0, -0.03, 0);
    box(g, color, 0.18, 0.08, 0.18, 0, 0.04, 0);
    box(g, color, 0.19, 0.07, 0.19, 0, 0.11, 0);
    box(g, color, 0.14, 0.06, 0.14, 0, 0.17, 0);
    box(g, '#e6e1d1', 0.1, 0.02, 0.1, 0, 0.2, 0);
    for (const x of [-0.06, 0, 0.06]) box(g, '#dcd7c7', 0.012, 0.1, 0.19, x, 0.09, 0);
  } else if (def.key === 'apron') {
    // A folded apron: bib, skirt, neck loop and a deep order pocket.
    box(g, color, 0.2, 0.18, 0.035, 0, 0.0, 0);
    box(g, color, 0.14, 0.09, 0.035, 0, 0.15, 0.004);
    box(g, '#b9b3a2', 0.2, 0.025, 0.04, 0, -0.1, 0);
    box(g, '#c9c3b1', 0.07, 0.06, 0.02, 0.045, -0.02, -0.022);
    box(g, '#cfc9b7', 0.1, 0.02, 0.02, 0, 0.205, 0);
    box(g, '#b9b3a2', 0.045, 0.1, 0.015, 0.055, -0.055, 0.028);
  } else if (def.armorSlot === 'helmet') {
    box(g, color, 0.22, 0.12, 0.22, 0, 0.08, 0);
    box(g, color, 0.24, 0.1, 0.06, 0, 0.01, -0.09);
    box(g, color, 0.06, 0.1, 0.22, -0.1, 0.01, 0);
    box(g, color, 0.06, 0.1, 0.22, 0.1, 0.01, 0);
    box(g, dark, 0.16, 0.06, 0.02, 0, 0.05, -0.11);
  } else if (def.armorSlot === 'chestplate') {
    box(g, color, 0.26, 0.26, 0.14, 0, 0.02, 0);
    box(g, color, 0.1, 0.12, 0.15, -0.17, 0.1, 0);
    box(g, color, 0.1, 0.12, 0.15, 0.17, 0.1, 0);
    box(g, '#c9a15a', 0.08, 0.08, 0.02, 0, 0.05, -0.075);
  } else if (def.armorSlot === 'leggings') {
    box(g, color, 0.24, 0.1, 0.14, 0, 0.14, 0);
    box(g, color, 0.1, 0.22, 0.13, -0.06, -0.02, 0);
    box(g, color, 0.1, 0.22, 0.13, 0.06, -0.02, 0);
  } else {
    box(g, dark, 0.11, 0.1, 0.24, -0.06, 0, -0.02);
    box(g, dark, 0.11, 0.1, 0.24, 0.06, 0, -0.02);
    box(g, color, 0.12, 0.07, 0.12, -0.06, 0.08, 0.05);
    box(g, color, 0.12, 0.07, 0.12, 0.06, 0.08, 0.05);
  }
  addArm(g, '#d9a273', '#6c7078');
  g.scale.setScalar(0.85);
  g.rotation.set(0.1, 0.15, -0.15);
  return { group: g, category: 'armor', reach: 0.6 };
}

function materialModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const color = def.color;
  if (def.key.includes('ingot')) {
    box(g, color, 0.2, 0.055, 0.1, 0, 0.02, 0, 0, 0, 0);
    box(g, color, 0.15, 0.05, 0.08, 0, 0.075, 0, 0, 0, 0);
    box(g, '#ffffff', 0.05, 0.01, 0.03, -0.03, 0.1, 0, 0, 0, 0);
  } else if (def.key === 'diamond' || def.key === 'emerald' || def.key === 'amethyst' || def.key === 'ruby') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat(color, 0x1f5a55, 0.5));
    gem.position.y = 0.1;
    gem.scale.set(1, 1.35, 1);
    g.add(gem);
  } else if (def.key === 'stick') {
    box(g, color, 0.03, 0.34, 0.03, 0, 0.05, 0, 0.1, 0, 0.25);
  } else if (def.key === 'coal' || def.key === 'charcoal') {
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), mat(color));
    lump.position.y = 0.08;
    lump.rotation.set(0.3, 0.6, 0.1);
    g.add(lump);
    box(g, '#171a1e', 0.05, 0.04, 0.04, 0.04, 0.14, 0.02);
  } else if (def.key === 'string') {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 4, 16), mat(color));
    coil.rotation.x = Math.PI / 2.4;
    coil.position.y = 0.1;
    g.add(coil);
    g.add(coil.clone());
  } else if (def.key === 'arrow') {
    box(g, '#b99a6b', 0.014, 0.014, 0.42, 0, 0.06, 0);
    wedge(g, '#cfd6dd', 0.03, 0.08, 0, 0.06, -0.24, -Math.PI / 2, 0, 0);
    box(g, '#e8e2d2', 0.06, 0.05, 0.01, 0, 0.06, 0.18);
    box(g, '#e8e2d2', 0.01, 0.05, 0.06, 0, 0.06, 0.18);
  } else if (def.key === 'rifle_ammo') {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.035;
      box(g, '#c9a15a', 0.022, 0.1, 0.022, x, 0.06, 0);
      wedge(g, '#8d6a3a', 0.02, 0.05, x, 0.135, 0, 0, 0, 0);
    }
  } else if (def.key === 'paper') {
    box(g, '#e9e3d2', 0.18, 0.012, 0.22, 0, 0.04, 0, 0, 0, 0.05);
    box(g, '#b9b2a0', 0.15, 0.014, 0.19, 0, 0.06, 0, 0, 0, -0.03);
  } else if (def.key === 'leather') {
    box(g, '#8a5a32', 0.18, 0.03, 0.15, 0, 0.04, 0, 0, 0, 0.1);
    box(g, '#6b4526', 0.06, 0.035, 0.1, 0.05, 0.06, 0);
  } else {
    // Generic pouch / stack of parts.
    box(g, color, 0.14, 0.12, 0.1, 0, 0.05, 0);
    box(g, '#3b3f46', 0.1, 0.03, 0.08, 0, 0.12, 0);
    box(g, '#3b3f46', 0.04, 0.06, 0.02, 0, 0.09, -0.055);
  }
  addArm(g, '#d9a273', '#6c4e34');
  g.rotation.set(0.1, -0.15, -0.2);
  return { group: g, category: 'material', reach: 0.65 };
}

function specialModel(def: ItemDef): HeldModel {
  const g = new THREE.Group();
  const color = def.color;
  if (def.key === 'totem') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat(color, 0x2f8a56, 0.8));
    gem.position.y = 0.13;
    gem.scale.set(1, 1.3, 1);
    g.add(gem);
    box(g, '#5c4430', 0.04, 0.22, 0.04, 0, -0.05, 0);
    box(g, '#c9a15a', 0.11, 0.04, 0.11, 0, 0.03, 0);
  } else if (def.key === 'compass') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 12), mat('#b8934e'));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.1;
    g.add(body);
    box(g, '#1f2a33', 0.14, 0.14, 0.02, 0, 0.1, -0.015);
    box(g, '#e04b3f', 0.02, 0.1, 0.012, 0, 0.1, -0.03, 0, 0, 0);
    box(g, '#e9eef2', 0.02, 0.1, 0.012, 0, 0.1, -0.03, 0, 0, Math.PI);
  } else if (def.key === 'map') {
    box(g, '#d8c99d', 0.26, 0.02, 0.2, 0, 0.05, 0, 0.05, 0, 0.03);
    box(g, '#8a6b45', 0.2, 0.022, 0.015, 0, 0.062, 0, 0, 0, 0.3);
    box(g, '#5f8b58', 0.06, 0.022, 0.05, -0.05, 0.062, 0.04);
    box(g, '#c04b3f', 0.02, 0.024, 0.02, 0.07, 0.062, -0.04);
  } else if (def.key === 'bucket') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.18, 8, 1, true), mat(color));
    body.position.y = 0.06;
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 4, 12), mat('#8a949e'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.15;
    g.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 4, 12, Math.PI), mat('#5c6670'));
    handle.position.y = 0.16;
    g.add(handle);
  } else if (def.key === 'spawn_egg') {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(color, 0x5a2f9a, 0.5));
    egg.scale.set(1, 1.35, 1);
    egg.position.y = 0.1;
    g.add(egg);
  } else if (def.key === 'tnt') {
    box(g, '#c7483f', 0.2, 0.2, 0.2, 0, 0.1, 0);
    box(g, '#e9e3d2', 0.205, 0.05, 0.205, 0, 0.1, 0);
    box(g, '#2a2320', 0.03, 0.06, 0.02, 0, 0.22, 0);
  } else if (def.key === 'lantern') {
    box(g, '#3c4750', 0.15, 0.05, 0.15, 0, 0.02, 0);
    box(g, '#ffcf6e', 0.12, 0.16, 0.12, 0, 0.12, 0, 0, 0, 0, 0xffb23e);
    box(g, '#3c4750', 0.16, 0.04, 0.16, 0, 0.22, 0);
    box(g, '#3c4750', 0.02, 0.08, 0.02, 0, 0.27, 0);
  } else if (def.key === 'coin') {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 12), mat('#e8c45a', 0x7a5a10, 0.4));
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 0.1;
    g.add(coin);
  } else {
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(color, 0x2f5a7a, 0.5));
    gem.position.y = 0.1;
    g.add(gem);
  }
  addArm(g, '#d9a273', '#6c4e34');
  g.rotation.set(0.1, -0.1, -0.2);
  return { group: g, category: 'special', reach: 0.7 };
}

/**
 * Build the correct first-person model for an item. Blocks are handled by the
 * player (they use atlas textures), everything else gets a voxel model.
 */
export function buildHeldItemModel(def: ItemDef): HeldModel | null {
  const handHeldBlock = def.key === 'torch' || def.key === 'lantern';
  if (def.block && !handHeldBlock) return null;
  switch (def.toolType) {
    case 'gun': return gunModel(def);
    case 'bow': return bowModel(def);
    case 'staff': return staffModel(def);
    case 'shield': return shieldModel(def);
    case 'sword':
      if (def.key === 'hammer' || def.key === 'mace' || def.key === 'spear' || def.key === 'dagger' || def.key === 'katana' || def.key === 'cutlass') return swordModel(def);
      return swordModel(def);
    case 'pickaxe':
    case 'axe':
    case 'shovel':
    case 'hoe': return toolModel(def);
    default: break;
  }
  if (def.key === 'torch' || def.key === 'lantern') return def.key === 'lantern' ? specialModel(def) : torchModel();
  if (def.kind === 'food') return def.key === 'water_bottle' ? potionModel(def, true) : foodModel(def);
  if (def.kind === 'armor') return armorModel(def);
  if (def.kind === 'material') return materialModel(def);
  if (def.kind === 'special') return specialModel(def);
  if (def.kind === 'weapon') return swordModel(def);
  if (def.kind === 'tool') return toolModel(def);
  return materialModel(def);
}

export function disposeHeldMaterials(): void {
  for (const m of materials.values()) m.dispose();
  materials.clear();
}
