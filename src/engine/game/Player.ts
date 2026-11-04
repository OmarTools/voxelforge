import * as THREE from 'three';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { TextureAtlas } from '../render/TextureAtlas';
import { tileForFace, type FaceName } from '../render/TextureAtlas';
import { block, blockById, isLiquidId, isSolidId } from '../world/Blocks';
import type { AudioSystem } from '../core/Audio';
import type { Input } from '../core/Input';
import type { Inventory } from './Inventory';
import type { PlayerHandle } from '../entities/EntityManager';
import { itemIcon, itemOrNull } from '../../content/Recipes';
import { buildAssetModel } from '../../content/Models';
import { loadBlockbenchModel, ModelInstance } from '../blockbench/BBModelLoader';
import { clamp } from '../core/Utils';
import { CAMERA_MODES, cameraModeLabel, isCameraMode, type CameraMode } from './CameraModes';

const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.52;
const EPS = 0.001;
const GRAVITY = 26;
const JUMP_SPEED = 8.6;

export interface PlayerHooks {
  onDamage?: (amount: number, source: string) => void;
  onDeath?: (source: string) => void;
  onLevelUp?: (level: number) => void;
  onNotify?: (message: string, kind?: 'info' | 'good' | 'warn' | 'bad') => void;
  onStep?: (blockKey: string) => void;
}

interface HeldView {
  group: THREE.Group;
  key: string;
  blockKey?: string;
}

/**
 * First/third-person voxel avatar with swept AABB collision, step assist,
 * swimming, flight, hunger, air, fall damage and a chunky held-item viewmodel.
 */
export class Player implements PlayerHandle {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly inventory: Inventory;
  readonly camera: THREE.PerspectiveCamera;
  readonly group = new THREE.Group();
  readonly eyeHeight = 1.62;
  readonly maxHealth = 20;

  yaw = 0;
  pitch = 0;
  health = 20;
  hunger = 20;
  air = 10;
  xp = 0;
  level = 0;
  coins = 0;
  onGround = false;
  sprinting = false;
  crouching = false;
  flying = false;
  thirdPerson = false;
  cameraMode: CameraMode = 'first';
  vehicleMode = false;
  vehicleStyle: 'kart' | 'car' = 'kart';
  vehicleSpeed = 0;
  inWater = false;
  underwater = false;
  inLava = false;
  godMode = false;
  hungerEnabled = true;
  naturalRegen = true;
  fallDamageEnabled = true;
  canFly = false;
  walkSpeed = 4.35;
  sprintSpeed = 6.1;
  eyeOffsetBob = 0;

  hooks: PlayerHooks = {};

  private world: VoxelWorld;
  private atlas: TextureAtlas;
  private audio: AudioSystem;
  private model: ModelInstance;
  private modelRoot = new THREE.Group();
  private vehicleRoot = new THREE.Group();
  private viewModel = new THREE.Group();
  private held?: HeldView;
  private viewCache = new Map<string, HeldView>();
  /** The studio hides the held-item overlay so its orbit camera stays clean. */
  private viewmodelEnabled = true;
  private blockTextureCache = new Map<string, THREE.Texture>();
  private iconTextureCache = new Map<string, THREE.Texture>();
  private swingTime = 0;
  private swingDuration = 0.3;
  private bobTime = 0;
  private stepTimer = 0;
  private fallDistance = 0;
  private lastY = 0;
  private hurtTimer = 0;
  private regenTimer = 0;
  private hungerTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;
  private lavaTimer = 0;
  private shake = 0;
  baseFov = 75;
  private alive = true;
  private minedRecently = false;

  constructor(camera: THREE.PerspectiveCamera, world: VoxelWorld, atlas: TextureAtlas, audio: AudioSystem, inventory: Inventory) {
    this.camera = camera;
    this.world = world;
    this.atlas = atlas;
    this.audio = audio;
    this.inventory = inventory;
    this.camera.rotation.order = 'YXZ';
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();

    this.group.name = 'player';
    const loaded = loadBlockbenchModel(buildAssetModel('human:adventurer'), { name: 'Wanderer' });
    this.model = new ModelInstance(loaded);
    this.modelRoot.name = 'player-model';
    this.modelRoot.add(this.model.root);
    this.modelRoot.visible = false;
    this.group.add(this.modelRoot);
    this.vehicleRoot.name = 'vehicle';
    this.vehicleRoot.visible = false;
    this.group.add(this.vehicleRoot);
    this.buildVehicle();

    this.viewModel.name = 'held-item';
    this.viewModel.position.set(0.46, -0.36, -0.78);
    this.viewModel.rotation.set(0.08, -0.48, 0.06);
    this.camera.add(this.viewModel);

    this.lastY = this.position.y;
    this.refreshHeldItem();
  }

  isAlive(): boolean {
    return this.alive;
  }

  get height(): number {
    return this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  get flatForward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight + this.eyeOffsetBob, this.position.z);
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  spawnAt(position: THREE.Vector3, yaw = 0): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.alive = true;
    this.onGround = false;
    this.health = this.maxHealth;
    this.hunger = 20;
    this.air = 10;
    this.fallDistance = 0;
    this.lastY = this.position.y;
    this.hurtTimer = 0;
    this.regroupModel();
    this.updateCameraTransform(0);
  }

  teleport(position: THREE.Vector3): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.fallDistance = 0;
    this.lastY = position.y;
  }

  look(dx: number, dy: number, sensitivity = 0.0022): void {
    if (!this.alive) return;
    // The side-on platformer camera is intentionally locked.
    if (this.cameraMode === 'side') return;
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  setCameraMode(mode: CameraMode): void {
    if (!isCameraMode(mode)) return;
    this.cameraMode = mode;
    this.thirdPerson = mode !== 'first';
    this.modelRoot.visible = this.thirdPerson && !this.vehicleMode && this.alive;
    this.viewModel.visible = this.viewmodelEnabled && mode === 'first' && this.alive;
    this.vehicleRoot.visible = this.vehicleMode;
  }

  cycleCameraMode(): CameraMode {
    const index = CAMERA_MODES.findIndex((mode) => mode.key === this.cameraMode);
    const next = CAMERA_MODES[(index + 1) % CAMERA_MODES.length];
    this.setCameraMode(next.key);
    return next.key;
  }

  get cameraModeLabel(): string {
    return cameraModeLabel(this.cameraMode);
  }

  toggleThirdPerson(): void {
    this.setCameraMode(this.thirdPerson ? 'first' : 'third');
  }

  setVehicleMode(enabled: boolean, style: 'kart' | 'car' = 'kart'): void {
    this.vehicleMode = enabled;
    this.vehicleStyle = style;
    this.vehicleSpeed = 0;
    this.vehicleRoot.visible = enabled;
    if (enabled) {
      this.buildVehicle();
      this.setCameraMode('third');
    } else {
      this.setCameraMode(this.cameraMode);
      this.modelRoot.visible = this.cameraMode !== 'first' && this.alive;
    }
  }

  toggleVehicleMode(): boolean {
    this.setVehicleMode(!this.vehicleMode, this.vehicleStyle);
    return this.vehicleMode;
  }

  private buildVehicle(): void {
    this.vehicleRoot.clear();
    const paint = this.vehicleStyle === 'car' ? 0xd9b33f : 0xe8552f;
    const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xe7eef1 });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x8ed9ef, transparent: true, opacity: 0.72 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x121417 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      this.vehicleRoot.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(1.9, 0.45, 3.1), bodyMat, 0, 0.55, 0);
    add(new THREE.BoxGeometry(1.5, 0.32, 1.1), bodyMat, 0, 0.92, -0.35);
    add(new THREE.BoxGeometry(1.25, 0.36, 0.12), glassMat, 0, 1.14, 0.15);
    add(new THREE.BoxGeometry(1.95, 0.14, 0.55), trimMat, 0, 0.34, -1.25);
    add(new THREE.BoxGeometry(0.24, 0.9, 0.24), darkMat, 0, 0.98, 1.35);
    add(new THREE.BoxGeometry(1.7, 0.18, 0.2), bodyMat, 0, 1.38, 1.35);
    add(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe9c18b }), 0, 1.15, 0.05);
    add(new THREE.BoxGeometry(0.5, 0.2, 0.55), new THREE.MeshLambertMaterial({ color: paint }), 0, 1.33, 0.05);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    for (const x of [-0.98, 0.98]) {
      for (const z of [-1.0, 1.0]) {
        const wheel = add(wheelGeo.clone(), wheelMat, x, 0.36, z);
        wheel.rotation.z = Math.PI / 2;
      }
    }
    this.vehicleRoot.rotation.order = 'YXZ';
  }

  toggleFly(): boolean {
    if (!this.canFly) {
      this.hooks.onNotify?.('Flight is disabled in this world.', 'warn');
      return false;
    }
    this.flying = !this.flying;
    this.velocity.set(0, 0, 0);
    this.hooks.onNotify?.(this.flying ? 'Flight enabled.' : 'Flight disabled.', 'info');
    return true;
  }

  setMining(active: boolean): void {
    this.minedRecently = active;
    if (active) this.model.setBase('mine');
    else if (this.model.hasAnimation('idle')) this.model.setBase('idle');
  }

  swing(power = 1): void {
    if (this.swingTime > 0) return;
    this.swingTime = this.swingDuration;
    this.shake = Math.max(this.shake, power * 0.01);
  }

  playAction(name: string): void {
    if (this.model.hasAnimation(name)) this.model.play(name, { once: true, overlay: true });
  }

  addXp(amount: number): void {
    this.xp += Math.max(0, Math.round(amount));
    const need = this.xpForNext();
    while (this.xp >= need) {
      this.xp -= need;
      this.level += 1;
      this.hooks.onLevelUp?.(this.level);
      this.hooks.onNotify?.(`Level ${this.level} reached.`, 'good');
      this.audio.play('levelup');
      this.heal(2);
    }
  }

  xpForNext(): number {
    return 40 + this.level * 28;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  feed(amount: number): void {
    this.hunger = Math.min(20, this.hunger + amount);
  }

  addCoins(amount: number): void {
    this.coins = Math.max(0, this.coins + amount);
  }

  damage(amount: number, source = 'The world'): boolean {
    if (!this.alive || this.godMode || amount <= 0) return false;
    const armor = this.inventory.armorMultiplier();
    let dmg = amount * armor;
    const held = this.inventory.selectedDef;
    if (held?.toolType === 'shield') dmg *= 0.7;
    dmg = Math.max(0.5, Math.round(dmg * 10) / 10);
    this.health = Math.max(0, this.health - dmg);
    this.hurtTimer = 0.45;
    this.shake = Math.max(this.shake, Math.min(0.16, 0.045 + dmg * 0.006));
    this.inventory.damageArmor(1);
    this.audio.play('hurt', 1);
    this.hooks.onDamage?.(dmg, source);
    if (this.health <= 0) this.die(source);
    return true;
  }

  die(source: string): void {
    if (!this.alive) return;
    this.alive = false;
    this.velocity.set(0, 0, 0);
    this.model.play('death', { once: true });
    this.audio.play('lose');
    this.hooks.onDeath?.(source);
  }

  revive(): void {
    this.alive = true;
    this.health = this.maxHealth;
    this.hunger = 20;
    this.air = 10;
    this.velocity.set(0, 0, 0);
    this.hurtTimer = 0;
    this.fallDistance = 0;
  }

  setViewmodelEnabled(enabled: boolean): void {
    this.viewmodelEnabled = enabled;
    this.viewModel.visible = enabled && !this.thirdPerson && this.alive;
  }

  refreshHeldItem(): void {
    const stack = this.inventory.selected;
    const key = stack?.item ?? '';
    if (this.held?.key === key) return;
    if (this.held) {
      this.viewModel.remove(this.held.group);
      this.held.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (mat && !this.isCachedMaterial(mat)) mat.dispose();
          }
        }
      });
    }
    this.viewModel.clear();
    this.held = undefined;
    if (!key) return;

    const cached = this.viewCache.get(key);
    if (cached) {
      this.viewModel.add(cached.group);
      this.held = cached;
      return;
    }

    const def = itemOrNull(key);
    const group = new THREE.Group();
    group.name = `held-${key}`;
    if (def?.block) {
      const cube = this.makeBlockCube(def.block, 0.22);
      cube.position.set(0, 0, 0);
      cube.rotation.set(0.32, 0.68, 0.12);
      group.add(cube);
    } else {
      const tex = this.iconTexture(key);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.36, 0.36, 1);
      sprite.renderOrder = 10;
      group.add(sprite);
      group.rotation.set(-0.25, -0.35, -0.35);
    }
    const entry: HeldView = { group, key, blockKey: def?.block };
    this.viewCache.set(key, entry);
    this.viewModel.add(group);
    this.held = entry;
  }

  private isCachedMaterial(mat: THREE.Material): boolean {
    for (const entry of this.viewCache.values()) {
      let found = false;
      entry.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.includes(mat)) found = true;
      });
      if (found) return true;
    }
    return false;
  }

  private makeBlockCube(blockKey: string, size: number): THREE.Mesh {
    const def = block(blockKey);
    const faces: FaceName[] = ['east', 'west', 'top', 'bottom', 'south', 'north'];
    const mats = faces.map((face) => {
      const tile = tileForFace(def, face) ?? def.tiles.side ?? def.key;
      return new THREE.MeshLambertMaterial({ map: this.blockTexture(tile) });
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
    return mesh;
  }

  private blockTexture(tile: string): THREE.Texture {
    const cached = this.blockTextureCache.get(tile);
    if (cached) return cached;
    const tex = new THREE.CanvasTexture(this.atlas.getTileCanvas(tile));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.blockTextureCache.set(tile, tex);
    return tex;
  }

  private iconTexture(key: string): THREE.Texture {
    const cached = this.iconTextureCache.get(key);
    if (cached) return cached;
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const img = new Image();
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
    };
    img.src = itemIcon(key, this.atlas);
    this.iconTextureCache.set(key, tex);
    return tex;
  }

  update(dt: number, input: Input, opts: { paused: boolean } = { paused: false }): void {
    if (!this.alive) {
      this.velocity.set(0, 0, 0);
      this.updateCameraTransform(dt);
      return;
    }
    if (this.vehicleMode) {
      this.updateVehicle(dt, input, opts);
      return;
    }

    const forward = this.flatForward;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    let moveX = 0;
    let moveZ = 0;
    if (!opts.paused) {
      if (input.down('KeyW')) { moveX += forward.x; moveZ += forward.z; }
      if (input.down('KeyS')) { moveX -= forward.x; moveZ -= forward.z; }
      if (input.down('KeyD')) { moveX += right.x; moveZ += right.z; }
      if (input.down('KeyA')) { moveX -= right.x; moveZ -= right.z; }
    }
    if (this.cameraMode === 'side' && !opts.paused) {
      // Screen-relative platformer movement: A/D run across the stage.
      moveX = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      moveZ = 0;
      if (moveX !== 0) this.yaw = moveX > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    const moving = moveX !== 0 || moveZ !== 0;
    const len = Math.hypot(moveX, moveZ) || 1;
    if (moving) {
      moveX /= len;
      moveZ /= len;
    }

    const wantSprint = !opts.paused && input.down('ShiftLeft') && moving && !this.crouching;
    const wantCrouch = !opts.paused && (input.down('ControlLeft') || input.down('ControlRight'));
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch && !this.canStand()) {
        // keep crouching under a low ceiling
      } else {
        this.crouching = wantCrouch;
      }
    }
    this.sprinting = wantSprint && !this.crouching && this.hunger > 3;

    if (!opts.paused && input.consume('Space')) {
      if (this.flying) {
        this.velocity.y = 7;
      } else if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
        this.audio.play('jump');
      } else if (this.inWater) {
        this.velocity.y = 4.4;
      }
    }

    const wasFlying = this.flying;
    if (wasFlying) {
      const flySpeed = this.sprinting ? 17 : 10.5;
      this.velocity.x = moveX * flySpeed;
      this.velocity.z = moveZ * flySpeed;
      let vy = 0;
      if (!opts.paused && input.down('Space')) vy += 7.5;
      if (!opts.paused && (input.down('ControlLeft') || input.down('ControlRight'))) vy -= 7.5;
      this.velocity.y += (vy - this.velocity.y) * Math.min(1, dt * 12);
      if (!moving) {
        this.velocity.x *= Math.pow(0.0015, dt);
        this.velocity.z *= Math.pow(0.0015, dt);
      }
    } else {
      const maxSpeed = (this.crouching ? 1.9 : this.sprinting ? this.sprintSpeed : this.walkSpeed) * (this.inWater ? 0.62 : 1);
      const accel = this.onGround ? 16 : this.inWater ? 7 : 4.2;
      const targetX = moveX * maxSpeed;
      const targetZ = moveZ * maxSpeed;
      this.velocity.x += (targetX - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (targetZ - this.velocity.z) * Math.min(1, accel * dt);
      if (!moving && this.onGround) {
        this.velocity.x *= Math.pow(0.0009, dt);
        this.velocity.z *= Math.pow(0.0009, dt);
      }

      const inWaterNow = this.checkWater();
      const gravity = inWaterNow ? 5.2 : GRAVITY;
      this.velocity.y -= gravity * dt;
      if (inWaterNow) {
        this.velocity.y = Math.max(this.velocity.y, -3.6);
        if (!opts.paused && input.down('Space')) this.velocity.y = Math.min(this.velocity.y + 16 * dt, 3.1);
        this.velocity.y *= Math.pow(0.6, dt);
      }
      this.velocity.y = Math.max(this.velocity.y, -46);
    }

    if (!this.flying) {
      this.fallDistance = this.velocity.y < -0.5 ? this.fallDistance + Math.max(0, this.lastY - this.position.y) : 0;
    } else {
      this.fallDistance = 0;
    }
    this.lastY = this.position.y;

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    this.onGround = false;
    this.groundProbe();
    if (this.flying) {
      this.moveAxis('x', dx);
      this.moveAxis('z', dz);
      this.moveAxis('y', this.velocity.y * dt);
      this.onGround = false;
    } else if (this.inWater) {
      this.moveAxis('x', dx);
      this.moveAxis('z', dz);
      this.moveAxis('y', this.velocity.y * dt);
      this.groundProbe();
    } else {
      this.moveHorizontal(dx, dz);
      this.moveAxis('y', this.velocity.y * dt);
      this.groundProbe();
    }

    const wasGround = this.onGround;
    if (!this.flying && this.onGround && this.fallDistance > 3.6 && !this.inWater) {
      if (this.fallDamageEnabled) {
        const dmg = Math.max(0, Math.floor((this.fallDistance - 3.2) * 1.25));
        if (dmg > 0) {
          this.damage(dmg, 'Fall damage');
          this.audio.play('land');
        }
      }
      this.fallDistance = 0;
    }
    if (this.onGround && !wasGround && this.velocity.y < -6) {
      this.audio.play('land');
      this.shake = Math.max(this.shake, 0.04);
    }

    // Environmental checks.
    this.inWater = this.checkWater();
    this.inLava = this.checkLava();
    const eyeBlock = this.world.getBlock(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.underwater = isLiquidId(eyeBlock) && blockById(eyeBlock).key === 'water';
    if (this.inLava) {
      this.lavaTimer -= dt;
      if (this.lavaTimer <= 0) {
        this.lavaTimer = 0.8;
        this.damage(4, 'Lava');
        this.audio.play('hurt', 2);
      }
    } else {
      this.lavaTimer = 0;
    }

    if (this.underwater) {
      this.air = Math.max(0, this.air - dt * 1.35);
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer > 1.2) {
          this.drownTimer = 0;
          this.damage(2, 'Drowning');
        }
      }
    } else {
      this.air = Math.min(10, this.air + dt * 5);
      this.drownTimer = 0;
    }

    this.updateVitals(dt);
    this.updateMovementFx(dt, moving);
    this.updateViewmodel(dt);
    this.updateModel(dt);

    if (this.position.y < -12) {
      this.damage(1000, 'The void');
    }

    this.updateCameraTransform(dt);
  }

  private updateVehicle(dt: number, input: Input, opts: { paused: boolean }): void {
    const drive = !opts.paused;
    const throttle = drive && input.down('KeyW');
    const brake = drive && input.down('KeyS');
    const boost = drive && input.down('ShiftLeft');
    const steer = drive ? (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0) : 0;
    const maxForward = boost ? 30 : 20;
    const target = throttle ? maxForward : brake ? -7.5 : 0;
    const accel = throttle ? (boost ? 18 : 11) : 16;
    const delta = target - this.vehicleSpeed;
    this.vehicleSpeed += clamp(delta, -accel * dt, accel * dt);
    if (!throttle && !brake) this.vehicleSpeed *= Math.pow(0.35, dt);
    if (Math.abs(this.vehicleSpeed) < 0.04) this.vehicleSpeed = 0;

    if (steer !== 0 && Math.abs(this.vehicleSpeed) > 0.6) {
      const grip = clamp(Math.abs(this.vehicleSpeed) / 15, 0.35, 1.25);
      this.yaw += steer * dt * 1.85 * grip * Math.sign(this.vehicleSpeed || 1);
    }
    this.sprinting = boost && throttle;
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    this.velocity.x = forwardX * this.vehicleSpeed;
    this.velocity.z = forwardZ * this.vehicleSpeed;
    this.velocity.y -= GRAVITY * dt;
    this.velocity.y = Math.max(this.velocity.y, -46);

    this.onGround = false;
    this.groundProbe();
    this.moveHorizontal(this.velocity.x * dt, this.velocity.z * dt);
    this.moveAxis('y', this.velocity.y * dt);
    this.groundProbe();
    this.inWater = this.checkWater();
    this.inLava = this.checkLava();
    this.fallDistance = 0;

    this.updateVitals(dt);
    this.updateMovementFx(dt, Math.abs(this.vehicleSpeed) > 0.4);
    this.vehicleRoot.position.set(0, 0, 0);
    this.vehicleRoot.rotation.y = this.yaw;
    this.vehicleRoot.rotation.z = -steer * Math.min(0.08, Math.abs(this.vehicleSpeed) * 0.004);
    this.modelRoot.visible = false;
    this.vehicleRoot.visible = true;
    this.updateCameraTransform(dt);
  }

  private updateVitals(dt: number): void {
    if (this.hungerEnabled) {
      const drain = this.sprinting ? 0.075 : this.speed > 0.5 ? 0.028 : 0.008;
      this.hunger = Math.max(0, this.hunger - drain * dt);
      if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer > 3.4) {
          this.starveTimer = 0;
          this.damage(1, 'Hunger');
        }
      } else {
        this.starveTimer = 0;
      }
    }
    if (this.naturalRegen && this.hunger > 15 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4.2) {
        this.regenTimer = 0;
        this.heal(1);
        this.hunger = Math.max(0, this.hunger - 0.5);
      }
    } else {
      this.regenTimer = 0;
    }
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.4);
    if (this.hungerTimer > 0) this.hungerTimer -= dt;
  }

  private updateMovementFx(dt: number, moving: boolean): void {
    if (!this.onGround || !moving || this.flying) {
      this.stepTimer = 0;
      return;
    }
    this.bobTime += dt * (this.sprinting ? 13 : 9.5);
    const speed = this.speed;
    if (speed < 0.4) return;
    this.stepTimer -= dt * (this.sprinting ? 1.4 : 1);
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.42;
      const below = this.world.getBlock(this.position.x, this.position.y - 0.15, this.position.z);
      if (below) {
        const def = blockById(below);
        this.hooks.onStep?.(def.key);
        this.audio.play('step', def.sound === 'stone' ? 0 : def.sound === 'wood' ? 1 : def.sound === 'sand' ? 2 : 3);
      }
    }
  }

  private updateModel(dt: number): void {
    this.modelRoot.position.copy(this.position);
    this.modelRoot.rotation.y = this.yaw + Math.PI;
    this.modelRoot.visible = this.thirdPerson && !this.vehicleMode && this.alive;
    this.vehicleRoot.visible = this.vehicleMode;
    if (!this.thirdPerson || this.vehicleMode) return;
    if (this.minedRecently) this.model.setBase('mine');
    else if (!this.onGround && !this.flying) this.model.setBase('jump');
    else if (this.speed > 0.6) this.model.setBase(this.sprinting ? 'run' : 'walk');
    else this.model.setBase('idle');
    this.model.update(dt);
  }

  private updateViewmodel(dt: number): void {
    if (!this.held) return;
    if (this.swingTime > 0) this.swingTime = Math.max(0, this.swingTime - dt);
    const t = this.swingTime / this.swingDuration;
    const swing = Math.sin((1 - t) * Math.PI * 1.5) * (t > 0 ? 1 : 0);
    const bob = this.speed > 0.4 && this.onGround ? Math.sin(this.bobTime) * 0.018 : 0;
    const sway = this.speed > 0.4 && this.onGround ? Math.cos(this.bobTime * 0.5) * 0.012 : 0;
    this.viewModel.position.set(0.46 + sway, -0.36 + bob - swing * 0.16, -0.78 + swing * 0.12);
    this.viewModel.rotation.set(0.08 - swing * 0.9, -0.48 + swing * 0.35, 0.06 - swing * 0.25);
    if (this.held.blockKey) {
      // subtle idle rotation
      this.held.group.rotation.y += dt * 0.16;
    }
  }

  private updateCameraTransform(dt: number): void {
    const eye = this.eyePosition;
    let targetPos = eye.clone();
    let roll = 0;
    let camPitch = this.pitch;
    let camYaw = this.yaw;
    const mode = this.cameraMode;

    if (mode === 'first') {
      const bob = this.speed > 0.4 && this.onGround ? Math.sin(this.bobTime * 2) * 0.028 : 0;
      const lateral = this.speed > 0.4 && this.onGround ? Math.cos(this.bobTime) * 0.016 : 0;
      targetPos.y += bob;
      targetPos.x += lateral * Math.cos(this.yaw);
      targetPos.z -= lateral * Math.sin(this.yaw);
      roll = this.speed > 0.4 && this.onGround ? Math.sin(this.bobTime) * 0.0045 : 0;
    } else {
      let distance = 3.6;
      if (mode === 'isometric') {
        distance = 9.5;
        camPitch = -0.72;
      } else if (mode === 'topdown') {
        distance = 15;
        camPitch = -1.32;
      } else if (mode === 'side') {
        distance = 9.5;
        camPitch = -0.12;
        camYaw = 0;
      } else if (this.vehicleMode) {
        distance = 6.6;
        camPitch = -0.2;
      }
      const back = new THREE.Vector3(
        Math.sin(camYaw) * Math.cos(camPitch),
        -Math.sin(camPitch),
        Math.cos(camYaw) * Math.cos(camPitch),
      );
      const origin = eye.clone();
      let dist = distance;
      const hit = this.world.raycast(origin, back, distance);
      if (hit) dist = Math.max(0.55, hit.distance - 0.22);
      targetPos = origin.clone().addScaledVector(back, dist);
      if (mode === 'third' || this.vehicleMode) targetPos.y += 0.15;
    }
    if (this.shake > 0) {
      const s = this.shake;
      targetPos.x += (Math.random() - 0.5) * s;
      targetPos.y += (Math.random() - 0.5) * s;
      targetPos.z += (Math.random() - 0.5) * s;
      roll += (Math.random() - 0.5) * s * 0.5;
    }
    this.camera.position.copy(targetPos);
    this.camera.rotation.set(camPitch, camYaw, roll, 'YXZ');
    const fovBoost = this.sprinting ? (this.vehicleMode ? 10 : 7) : 0;
    const targetFov = this.baseFov + fovBoost - (this.underwater ? 4 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6 || 1);
      this.camera.updateProjectionMatrix();
    }
    this.eyeOffsetBob = 0;
    this.viewModel.visible = this.viewmodelEnabled && mode === 'first' && !this.vehicleMode && this.alive;
    this.modelRoot.visible = mode !== 'first' && !this.vehicleMode && this.alive;
    this.vehicleRoot.visible = this.vehicleMode;
  }

  private regroupModel(): void {
    this.modelRoot.visible = this.thirdPerson;
  }

  private canStand(): boolean {
    const y = this.position.y + CROUCH_HEIGHT;
    const h = PLAYER_HEIGHT - CROUCH_HEIGHT;
    return !this.boxCollides(this.position.x, y, this.position.z, PLAYER_HALF_WIDTH, h);
  }

  private checkWater(): boolean {
    const y = this.position.y + 0.3;
    return isLiquidId(this.world.getBlock(this.position.x, y, this.position.z)) && blockById(this.world.getBlock(this.position.x, y, this.position.z)).key === 'water';
  }

  private checkLava(): boolean {
    const y = this.position.y + 0.2;
    const id = this.world.getBlock(this.position.x, y, this.position.z);
    return id !== 0 && blockById(id).key === 'lava';
  }

  private groundProbe(): boolean {
    if (this.velocity.y > 0.1) return false;
    if (this.boxCollides(this.position.x, this.position.y - 0.08, this.position.z, PLAYER_HALF_WIDTH, this.height)) {
      this.onGround = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
      return true;
    }
    return false;
  }

  private boxCollides(x: number, y: number, z: number, half: number, height: number): boolean {
    const minX = Math.floor(x - half + EPS);
    const maxX = Math.floor(x + half - EPS);
    const minY = Math.floor(y + EPS);
    const maxY = Math.floor(y + height - EPS);
    const minZ = Math.floor(z - half + EPS);
    const maxZ = Math.floor(z + half - EPS);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (isSolidId(this.world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number): boolean {
    if (amount === 0) return false;
    this.position[axis] += amount;
    const half = PLAYER_HALF_WIDTH;
    const height = this.height;
    const minX = Math.floor(this.position.x - half + EPS);
    const maxX = Math.floor(this.position.x + half - EPS);
    const minY = Math.floor(this.position.y + EPS);
    const maxY = Math.floor(this.position.y + height - EPS);
    const minZ = Math.floor(this.position.z - half + EPS);
    const maxZ = Math.floor(this.position.z + half - EPS);
    let collided = false;
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (!isSolidId(this.world.getBlock(bx, by, bz))) continue;
          collided = true;
          if (axis === 'x') {
            if (amount > 0) this.position.x = Math.min(this.position.x, bx - half - EPS);
            else this.position.x = Math.max(this.position.x, bx + 1 + half + EPS);
            this.velocity.x = 0;
          } else if (axis === 'z') {
            if (amount > 0) this.position.z = Math.min(this.position.z, bz - half - EPS);
            else this.position.z = Math.max(this.position.z, bz + 1 + half + EPS);
            this.velocity.z = 0;
          } else {
            if (amount > 0) {
              this.position.y = Math.min(this.position.y, by - height - EPS);
            } else {
              this.position.y = Math.max(this.position.y, by + 1 + EPS);
              this.onGround = true;
            }
            this.velocity.y = 0;
          }
        }
      }
    }
    return collided;
  }

  private moveHorizontal(dx: number, dz: number): void {
    if (this.flying) {
      this.moveAxis('x', dx);
      this.moveAxis('z', dz);
      return;
    }
    const startX = this.position.x;
    const startZ = this.position.z;
    const wanted = Math.hypot(dx, dz);
    this.moveAxis('x', dx);
    this.moveAxis('z', dz);
    const moved = Math.hypot(this.position.x - startX, this.position.z - startZ);
    if (!this.onGround || wanted < 1e-5 || moved > wanted * 0.42) return;

    // Try stepping up one block.
    const save = this.position.clone();
    const saveVel = this.velocity.clone();
    const saveGround = this.onGround;
    this.position.y += 1.03;
    if (!this.boxCollides(this.position.x, this.position.y, this.position.z, PLAYER_HALF_WIDTH, this.height)) {
      this.moveAxis('x', dx);
      this.moveAxis('z', dz);
      this.moveAxis('y', -1.05);
      const stepped = Math.hypot(this.position.x - startX, this.position.z - startZ);
      if (stepped > moved + 0.03) {
        this.onGround = true;
        return;
      }
    }
    this.position.copy(save);
    this.velocity.copy(saveVel);
    this.onGround = saveGround;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.camera.remove(this.viewModel);
    this.model.dispose();
    for (const tex of this.blockTextureCache.values()) tex.dispose();
    for (const tex of this.iconTextureCache.values()) tex.dispose();
    for (const view of this.viewCache.values()) {
      view.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) mat?.dispose();
      });
    }
  }
}
