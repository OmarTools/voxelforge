import * as THREE from 'three';

/**
 * Voxel kart models shared by the player vehicle and the AI racers.
 * Forward is -Z, the ground sits at y = 0.
 */

export interface KartVisual {
  root: THREE.Group;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  brakeLights: THREE.Mesh[];
  flames: THREE.Mesh[];
  helmet: THREE.Mesh;
}

export interface KartStyle {
  body: string;
  accent: string;
  suit: string;
  helmet: string;
  number?: string;
}

const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
const frontWheelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.22, 12);

function lam(color: string, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function part(
  parent: THREE.Object3D,
  color: string,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
  emissive = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color, emissive));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function wheel(parent: THREE.Object3D, x: number, z: number, front: boolean): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, front ? 0.29 : 0.34, z);
  const tire = new THREE.Mesh(front ? frontWheelGeo : wheelGeo, lam('#17191d'));
  tire.rotation.z = Math.PI / 2;
  pivot.add(tire);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(front ? 0.15 : 0.17, front ? 0.15 : 0.17, front ? 0.24 : 0.28, 8),
    lam('#b9c2ca'),
  );
  hub.rotation.z = Math.PI / 2;
  pivot.add(hub);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(front ? 0.25 : 0.29, 0.07, 0.07), lam('#5d6872'));
  cap.position.x = front ? 0.11 : 0.13;
  pivot.add(cap);
  parent.add(pivot);
  return pivot;
}

export function buildKartModel(style: KartStyle): KartVisual {
  const root = new THREE.Group();
  root.name = 'kart';
  const body = style.body;
  const accent = style.accent;
  const dark = '#23282e';
  const metal = '#8d99a4';

  // Floor pan and chassis.
  part(root, dark, 1.42, 0.12, 2.3, 0, 0.34, 0);
  part(root, body, 1.5, 0.24, 1.05, 0, 0.48, -0.72);
  part(root, body, 1.56, 0.3, 0.66, 0, 0.5, 0.45);
  part(root, accent, 0.26, 0.15, 1.42, 0, 0.55, -0.62, 0, 0, 0.03);
  part(root, accent, 0.26, 0.15, 1.42, 0, 0.55, -0.62, 0, 0, -0.03);

  // Nose cone.
  part(root, body, 1.1, 0.24, 0.62, 0, 0.46, -1.28);
  part(root, accent, 0.86, 0.1, 0.3, 0, 0.35, -1.52);
  part(root, '#d9e2e8', 0.5, 0.035, 0.18, 0, 0.585, -1.4);

  // Side pods.
  part(root, body, 0.26, 0.24, 1.25, -0.87, 0.48, -0.05);
  part(root, body, 0.26, 0.24, 1.25, 0.87, 0.48, -0.05);
  part(root, accent, 0.28, 0.08, 1.15, -0.87, 0.61, -0.05);
  part(root, accent, 0.28, 0.08, 1.15, 0.87, 0.61, -0.05);

  // Rear bumper and engine.
  part(root, dark, 1.58, 0.16, 0.22, 0, 0.42, 1.14);
  part(root, metal, 0.72, 0.36, 0.62, 0, 0.66, 0.82);
  part(root, dark, 0.62, 0.12, 0.48, 0, 0.88, 0.82);
  for (const x of [-0.24, 0.24]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 7), lam('#b9c2ca'));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.6, 1.2);
    root.add(pipe);
  }

  // Seat + driver.
  part(root, '#3a3f46', 0.6, 0.14, 0.52, 0, 0.66, 0.18);
  part(root, '#3a3f46', 0.16, 0.52, 0.62, 0, 0.9, 0.42, -0.16, 0, 0);
  part(root, style.suit, 0.46, 0.5, 0.36, 0, 0.94, 0.14);
  part(root, style.suit, 0.16, 0.34, 0.2, -0.31, 0.94, -0.06, -0.55, 0, 0.1);
  part(root, style.suit, 0.16, 0.34, 0.2, 0.31, 0.94, -0.06, -0.55, 0, -0.1);
  part(root, '#e8c9a8', 0.16, 0.14, 0.16, -0.29, 0.86, -0.26);
  part(root, '#e8c9a8', 0.16, 0.14, 0.16, 0.29, 0.86, -0.26);
  const helmet = part(root, style.helmet, 0.36, 0.36, 0.38, 0, 1.32, 0.1);
  part(root, '#1c2733', 0.3, 0.14, 0.06, 0, 1.34, -0.1);
  part(root, '#f0f4f6', 0.08, 0.06, 0.04, 0, 1.36, -0.13);

  // Steering column + wheel.
  part(root, metal, 0.06, 0.06, 0.46, 0, 0.86, -0.26, -0.55, 0, 0);
  const steer = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 5, 14), lam('#2a2f35'));
  steer.position.set(0, 0.98, -0.4);
  steer.rotation.x = 1.15;
  root.add(steer);
  part(root, accent, 0.3, 0.05, 0.05, 0, 0.98, -0.4);

  // Spoiler.
  part(root, accent, 1.44, 0.07, 0.34, 0, 1.16, 1.18);
  part(root, dark, 0.07, 0.26, 0.16, -0.52, 1.03, 1.16);
  part(root, dark, 0.07, 0.26, 0.16, 0.52, 1.03, 1.16);
  part(root, body, 1.2, 0.18, 0.08, 0, 1.1, 1.34);

  // Number plate.
  part(root, '#e8eef1', 0.44, 0.24, 0.04, 0, 0.53, -1.2);
  part(root, '#20262c', 0.3, 0.05, 0.02, 0, 0.53, -1.225);
  part(root, style.accent, 0.34, 0.08, 0.03, 0, 1.01, 1.39);

  // Brake lights.
  const brakeLights = [part(root, '#e04b3f', 0.24, 0.09, 0.05, -0.5, 0.5, 1.27, 0, 0, 0, 0.5), part(root, '#e04b3f', 0.24, 0.09, 0.05, 0.5, 0.5, 1.27, 0, 0, 0, 0.5)];

  // Wheels.
  const wheels: THREE.Group[] = [];
  const frontWheels: THREE.Group[] = [];
  const bl = wheel(root, -0.92, 0.78, false); wheels.push(bl);
  const br = wheel(root, 0.92, 0.78, false); wheels.push(br);
  const fl = wheel(root, -0.88, -0.86, true); wheels.push(fl); frontWheels.push(fl);
  const fr = wheel(root, 0.88, -0.86, true); wheels.push(fr); frontWheels.push(fr);

  // Boost flames out of the exhausts.
  const flames: THREE.Mesh[] = [];
  for (const x of [-0.24, 0.24]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.4, 5), lam('#ffb347', 0xff7a1e));
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.6, 1.48);
    flame.visible = false;
    root.add(flame);
    flames.push(flame);
  }

  return { root, wheels, frontWheels, brakeLights, flames, helmet };
}

export function paintKart(visual: KartVisual, style: KartStyle): void {
  // Recolour the body panels in place (used for the player's chosen livery).
  visual.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (!mat.color) return;
    if (mat.color.getHexString() === 'e8552f' || mat.color.getHexString() === 'd9b33f') {
      mat.color.set(style.body);
    }
  });
}
