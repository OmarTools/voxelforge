import * as THREE from 'three';

export interface BurstOptions {
  speed?: number;
  gravity?: number;
  life?: number;
  size?: number;
  spread?: number;
  drag?: number;
  glow?: boolean;
  upward?: number;
}

interface Particle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  spin: number;
  rotation: number;
  color: THREE.Color;
  glow: boolean;
}

const MAX_PARTICLES = 900;

/**
 * Blocky GPU-instanced particle system: debris, sparks, smoke, splashes and
 * ambient motes. Deliberately chunky to match the voxel art direction.
 */
export class Particles {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  readonly sparkMesh: THREE.InstancedMesh;

  private particles: Particle[] = [];
  private dummy = new THREE.Object3D();
  private cursor = 0;
  private counter = 0;
  private readonly sparkCapacity = Math.floor(MAX_PARTICLES / 2);

  constructor() {
    this.group.name = 'particles';
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'particle-cubes';
    this.group.add(this.mesh);

    const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, Math.floor(MAX_PARTICLES / 2));
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.name = 'particle-sparks';
    this.group.add(this.sparkMesh);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.1,
        gravity: 14,
        drag: 0.98,
        spin: 0,
        rotation: 0,
        color: new THREE.Color(0xffffff),
        glow: false,
      });
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.active) n++;
    return n;
  }

  burst(position: THREE.Vector3, color: string | number, count: number, opts: BurstOptions = {}): void {
    const speed = opts.speed ?? 3;
    const spread = opts.spread ?? 0.25;
    const life = opts.life ?? 0.75;
    const size = opts.size ?? 0.13;
    const glow = opts.glow ?? false;
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.takeParticle();
      if (!p) return;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const mag = speed * (0.35 + Math.random() * 0.9);
      p.position.set(
        position.x + (Math.random() - 0.5) * spread,
        position.y + (Math.random() - 0.5) * spread,
        position.z + (Math.random() - 0.5) * spread,
      );
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * mag,
        Math.abs(Math.cos(phi)) * mag * 0.75 + (opts.upward ?? 0.5),
        Math.sin(phi) * Math.sin(theta) * mag,
      );
      p.maxLife = life * (0.65 + Math.random() * 0.7);
      p.life = p.maxLife;
      p.size = size * (0.6 + Math.random() * 0.9);
      p.gravity = opts.gravity ?? 14;
      p.drag = opts.drag ?? 0.94;
      p.spin = (Math.random() - 0.5) * 16;
      p.rotation = Math.random() * Math.PI;
      p.color.copy(base);
      const jitter = 0.82 + Math.random() * 0.32;
      p.color.multiplyScalar(jitter);
      p.glow = glow;
      p.active = true;
    }
  }

  /** Dust kicked up by movement or landings. */
  dust(position: THREE.Vector3, color: string | number, count = 6): void {
    this.burst(position, color, count, { speed: 1.2, life: 0.5, size: 0.1, gravity: 3.5, upward: 0.6, spread: 0.35 });
  }

  /** Sparkle used for checkpoints, portals and pickups. */
  sparkle(position: THREE.Vector3, color: string | number, count = 12): void {
    this.burst(position, color, count, { speed: 2.4, life: 0.9, size: 0.075, gravity: -1.5, glow: true, spread: 0.4 });
  }

  trail(position: THREE.Vector3, color: string | number, size = 0.09): void {
    this.burst(position, color, 1, { speed: 0.2, life: 0.32, size, gravity: 0, drag: 0.9, glow: true, spread: 0.05, upward: 0 });
  }

  ambientMote(position: THREE.Vector3, color: string | number): void {
    this.burst(position, color, 1, { speed: 0.25, life: 3.2, size: 0.05, gravity: -0.08, drag: 0.99, glow: true, spread: 0.4, upward: 0.15 });
  }

  update(dt: number): void {
    const capped = Math.min(dt, 0.05);
    let cubeCount = 0;
    let sparkCount = 0;
    this.counter += capped;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= capped;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.velocity.y -= p.gravity * capped;
      const drag = Math.pow(p.drag, capped * 60);
      p.velocity.multiplyScalar(drag);
      p.position.addScaledVector(p.velocity, capped);
      p.rotation += p.spin * capped;

      const t = p.life / p.maxLife;
      const scale = p.size * (0.35 + 0.65 * Math.min(1, t * 2.2));
      this.dummy.position.copy(p.position);
      this.dummy.rotation.set(p.rotation, p.rotation * 0.7 + this.counter, p.rotation * 0.3);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();

      if (p.glow) {
        if (sparkCount < this.sparkCapacity) {
          this.sparkMesh.setMatrixAt(sparkCount, this.dummy.matrix);
          this.sparkMesh.setColorAt(sparkCount, p.color);
          sparkCount++;
        }
      } else if (cubeCount < MAX_PARTICLES) {
        this.mesh.setMatrixAt(cubeCount, this.dummy.matrix);
        this.mesh.setColorAt(cubeCount, p.color);
        cubeCount++;
      }
    }
    this.mesh.count = cubeCount;
    this.sparkMesh.count = sparkCount;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  private takeParticle(): Particle | null {
    for (let i = 0; i < this.particles.length; i++) {
      const idx = (this.cursor + i) % this.particles.length;
      if (!this.particles[idx].active) {
        this.cursor = (idx + 1) % this.particles.length;
        return this.particles[idx];
      }
    }
    // Recycle the oldest if fully saturated.
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.particles.length;
    return p;
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    this.mesh.count = 0;
    this.sparkMesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
