import * as THREE from 'three';
import { createAuroraMaterial, createEnergyMaterial, createHologramMaterial, createNeonMaterial, createWaterMaterial } from './Shaders';

export interface WorldFxConfig {
  neon?: boolean;
  hologram?: boolean;
  aurora?: boolean;
  energy?: boolean;
  water?: { x: number; z: number; width: number; depth: number; y?: number; rotation?: number };
}

/**
 * Template-level shader decoration. Everything here is optional and cheap:
 * neon billboards, a rotating hologram, an aurora curtain, portal rings and an
 * animated water surface. Materials share the same elapsed-time clock.
 */
export class WorldFX {
  readonly group = new THREE.Group();
  private materials: THREE.ShaderMaterial[] = [];
  private elapsed = 0;
  private signs: THREE.Object3D[] = [];
  private hologram?: THREE.Object3D;
  private portal?: THREE.Object3D;

  constructor(scene: THREE.Scene, config: WorldFxConfig, baseY: number) {
    this.group.name = 'world-fx';
    scene.add(this.group);
    if (config.neon) this.buildNeon(baseY);
    if (config.hologram) this.buildHologram(baseY);
    if (config.aurora) this.buildAurora(baseY);
    if (config.energy) this.buildPortal(baseY);
    if (config.water) this.buildWater(config.water, baseY);
    for (const mat of this.materials) {
      if (typeof mat.userData.tick === 'function') mat.userData.tick(0);
    }
  }

  private registerMaterial(mat: THREE.ShaderMaterial): THREE.ShaderMaterial {
    this.materials.push(mat);
    return mat;
  }

  private sign(baseY: number, x: number, z: number, color: string, height: number, size: number, yaw: number): void {
    const holder = new THREE.Group();
    holder.position.set(x, baseY + 1, z);
    holder.rotation.y = yaw;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x232a31 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.28, height, 0.28), poleMat);
    pole.position.y = height / 2;
    holder.add(pole);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * 0.42),
      this.registerMaterial(createNeonMaterial(color)),
    );
    panel.position.y = height;
    panel.position.z = 0.18;
    holder.add(panel);
    const back = new THREE.Mesh(new THREE.BoxGeometry(size + 0.16, size * 0.42 + 0.16, 0.14), new THREE.MeshLambertMaterial({ color: 0x161b20 }));
    back.position.y = height;
    holder.add(back);
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.72, 0.14),
      this.registerMaterial(createNeonMaterial('#ffffff', { intensity: 0.8 })),
    );
    bar.position.set(0, height - size * 0.1, 0.26);
    holder.add(bar);
    this.group.add(holder);
    this.signs.push(holder);
  }

  private buildNeon(baseY: number): void {
    const palette = ['#59d8ff', '#ff5fa2', '#ffd166', '#8c7bff', '#5fffc2'];
    const spots: Array<[number, number, number]> = [
      [-23, 17, 0],
      [23, 15, Math.PI],
      [-19, -19, Math.PI / 2],
      [19, -18, -Math.PI / 2],
      [0, 25, Math.PI],
      [0, -25, 0],
    ];
    spots.forEach(([x, z, yaw], index) => {
      this.sign(baseY, x, z, palette[index % palette.length], 6 + (index % 3) * 2.2, 5.4, yaw);
    });
    // Low neon strips along the central crossing.
    for (let i = 0; i < 8; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.16, 0.16),
        this.registerMaterial(createNeonMaterial(palette[i % palette.length], { intensity: 0.75, speed: 1.4 })),
      );
      strip.position.set(-17.5 + i * 5, baseY + 0.35, i % 2 === 0 ? 12 : -12);
      this.group.add(strip);
    }
  }

  private buildHologram(baseY: number): void {
    const holder = new THREE.Group();
    holder.position.set(0, baseY + 10, -6);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.6), this.registerMaterial(createHologramMaterial('#61d8ff')));
    holder.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.12, 0.18), new THREE.MeshLambertMaterial({ color: 0x2b333c }));
    frame.position.y = 2.86;
    holder.add(frame);
    const frame2 = frame.clone();
    frame2.position.y = -2.86;
    holder.add(frame2);
    this.group.add(holder);
    this.hologram = holder;
  }

  private buildAurora(baseY: number): void {
    const mat = this.registerMaterial(createAuroraMaterial('#52ffb8', '#7a6bff'));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(150, 46, 1, 1), mat);
    plane.position.set(0, baseY + 52, -95);
    plane.renderOrder = -50;
    this.group.add(plane);
    const plane2 = new THREE.Mesh(new THREE.PlaneGeometry(110, 34), this.registerMaterial(createAuroraMaterial('#4fd8ff', '#c46bff')));
    plane2.position.set(-35, baseY + 58, -70);
    plane2.rotation.y = 0.4;
    plane2.renderOrder = -50;
    this.group.add(plane2);
  }

  private buildPortal(baseY: number): void {
    const holder = new THREE.Group();
    holder.position.set(0, baseY + 5, -18);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.32, 8, 28), new THREE.MeshLambertMaterial({ color: 0x3a2c4a }));
    holder.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.15, 32), this.registerMaterial(createEnergyMaterial('#b06bff')));
    disc.position.z = 0.05;
    holder.add(disc);
    for (let i = 0; i < 6; i++) {
      const rune = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.9, 0.12),
        this.registerMaterial(createNeonMaterial('#d9a6ff', { intensity: 0.9 })),
      );
      const a = (i / 6) * Math.PI * 2;
      rune.position.set(Math.cos(a) * 4.1, Math.sin(a) * 4.1, 0.1);
      rune.rotation.z = a;
      holder.add(rune);
    }
    this.group.add(holder);
    this.portal = holder;
  }

  private buildWater(water: NonNullable<WorldFxConfig['water']>, baseY: number): void {
    const geo = new THREE.PlaneGeometry(water.width, water.depth, 40, 40);
    const mat = this.registerMaterial(createWaterMaterial('#174a5a', '#3f9fb0'));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = water.rotation ?? 0;
    mesh.position.set(water.x, baseY + (water.y ?? 0.88), water.z);
    mesh.renderOrder = 2;
    this.group.add(mesh);
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (const mat of this.materials) {
      if (typeof mat.userData.tick === 'function') mat.userData.tick(this.elapsed);
    }
    for (let i = 0; i < this.signs.length; i++) {
      this.signs[i].rotation.y += Math.sin(this.elapsed * 0.4 + i) * dt * 0.03;
    }
    if (this.hologram) {
      this.hologram.position.y += Math.sin(this.elapsed * 0.9) * dt * 0.12;
      this.hologram.rotation.y = Math.sin(this.elapsed * 0.22) * 0.16;
    }
    if (this.portal) {
      this.portal.rotation.z += dt * 0.22;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) mat?.dispose();
    });
    this.materials = [];
    this.signs = [];
  }
}
