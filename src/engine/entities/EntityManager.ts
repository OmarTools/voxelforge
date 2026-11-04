import * as THREE from 'three';
import { loadBlockbenchModel, ModelInstance, type LoadedModel } from '../blockbench/BBModelLoader';
import { buildAssetModel } from '../../content/Models';
import { entityDef, type EntityDefinition, type ShopOffer } from '../../content/EntityTypes';
import { ITEM_BY_KEY, itemIcon } from '../../content/Recipes';
import type { VoxelWorld } from '../world/VoxelWorld';
import { block, blockById, isSolidId } from '../world/Blocks';
import type { TextureAtlas } from '../render/TextureAtlas';
import type { AudioSystem } from '../core/Audio';
import type { Inventory } from '../game/Inventory';

export interface ParticleSink {
  burst(position: THREE.Vector3, color: string | number, count: number, opts?: { speed?: number; gravity?: number; life?: number; size?: number; spread?: number }): void;
}

export interface PlayerHandle {
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  inventory: Inventory;
  eyeHeight: number;
  damage(amount: number, source?: string): boolean;
  heal(amount: number): void;
  addXp(amount: number): void;
  isAlive(): boolean;
}

export interface EntityHooks {
  onNotify?: (message: string, kind?: 'info' | 'good' | 'warn' | 'bad') => void;
  onKill?: (entity: GameEntity, byPlayer: boolean) => void;
  onBoss?: (entity: GameEntity | null) => void;
  onBossHealth?: (entity: GameEntity) => void;
  onExplosion?: (x: number, y: number, z: number, radius: number) => void;
  onDamagePlayer?: (amount: number, entity: GameEntity) => void;
  onPickup?: (item: string, count: number) => void;
}

export interface SpawnOptions {
  name?: string;
  role?: string;
  dialogue?: string;
  id?: string;
  questId?: string;
  behavior?: EntityDefinition['behavior'];
  healthScale?: number;
  boss?: boolean;
  yaw?: number;
  exactY?: boolean;
  scale?: number;
}

interface Projectile {
  object: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  radius: number;
  fromPlayer: boolean;
  gravity: number;
  kind: 'arrow' | 'bolt' | 'fireball' | 'bomb' | 'bullet';
  splash: number;
  source?: GameEntity;
}

interface ItemDrop {
  sprite: THREE.Sprite;
  item: string;
  count: number;
  position: THREE.Vector3;
  vy: number;
  age: number;
  pickupDelay: number;
  bob: number;
}

const GRAVITY = 24;

function hashAngle(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * Math.PI * 2;
}

function nameplateTexture(name: string, role: string, hostile: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(4, 9, 12, 0.72)';
  ctx.fillRect(8, 8, 304, 62);
  ctx.strokeStyle = hostile ? 'rgba(255, 105, 105, 0.65)' : 'rgba(160, 220, 140, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 304, 62);
  ctx.textAlign = 'center';
  ctx.font = 'bold 25px "Cascadia Mono", Consolas, monospace';
  ctx.fillStyle = hostile ? '#ffc0b8' : '#e9f5df';
  ctx.fillText(name, 160, 38);
  ctx.font = '15px "Cascadia Mono", Consolas, monospace';
  ctx.fillStyle = hostile ? '#d98b82' : '#93ab8e';
  ctx.fillText(role.toUpperCase(), 160, 59);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class GameEntity {
  readonly def: EntityDefinition;
  readonly root = new THREE.Group();
  readonly instance: ModelInstance;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly spawnPosition = new THREE.Vector3();
  readonly manager: EntityManager;
  readonly id: string;
  displayName: string;
  role: string;
  dialogue?: string;
  questId?: string;
  boss: boolean;
  behavior: EntityDefinition['behavior'];
  health: number;
  readonly maxHealth: number;
  alive = true;
  yaw: number;
  onGround = false;
  state: 'idle' | 'walk' | 'run' | 'attack' | 'hurt' | 'dead' = 'idle';
  target: PlayerHandle | null = null;
  aggro = false;
  attackCooldown = 0;
  hurtTimer = 0;
  deathTimer = 0;
  removeTimer = 0;
  wanderTimer = Math.random() * 3;
  wanderAngle = Math.random() * Math.PI * 2;
  private currentBase = '';
  private fuse = 0;
  private exploded = false;
  private nameplate?: THREE.Sprite;
  private facing = 0;
  private stuckTime = 0;

  constructor(manager: EntityManager, def: EntityDefinition, position: THREE.Vector3, loaded: LoadedModel, opts: SpawnOptions = {}) {
    this.manager = manager;
    this.def = def;
    this.id = opts.id ?? `${def.key}_${Math.floor(Math.random() * 1e6)}`;
    this.displayName = opts.name ?? def.name;
    this.role = opts.role ?? def.role;
    this.dialogue = opts.dialogue ?? def.dialogue;
    this.questId = opts.questId;
    this.behavior = opts.behavior ?? def.behavior;
    this.boss = opts.boss ?? !!def.boss;
    const scale = opts.scale ?? def.scale;
    const healthScale = opts.healthScale ?? 1;
    this.maxHealth = Math.max(1, Math.round(def.health * scale * healthScale));
    this.health = this.maxHealth;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.position.copy(position);
    this.spawnPosition.copy(position);
    this.instance = new ModelInstance(loaded);
    this.instance.root.scale.multiplyScalar(scale);
    this.root.position.copy(position);
    this.root.rotation.y = this.yaw;
    this.root.add(this.instance.root);
    this.root.userData.entity = this;

    if (this.dialogue || this.boss || opts.name) {
      const tex = nameplateTexture(this.displayName, this.role, def.hostileToPlayer || def.class === 'monster');
      const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
      this.nameplate = new THREE.Sprite(material);
      this.nameplate.scale.set(2.5, 0.62, 1);
      this.nameplate.position.set(0, Math.max(1.4, def.bodyHeight * scale + 0.65), 0);
      this.nameplate.renderOrder = 3;
      this.root.add(this.nameplate);
    }
    this.instance.setBase('idle');
    this.currentBase = 'idle';
  }

  static create(manager: EntityManager, def: EntityDefinition, pos: THREE.Vector3, loaded: LoadedModel, opts: SpawnOptions = {}): GameEntity {
    return new GameEntity(manager, def, pos, loaded, opts);
  }

  get center(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.def.bodyHeight * 0.5, this.position.z);
  }

  get isHostile(): boolean {
    return this.def.class === 'monster' || this.def.hostileToPlayer === true || this.behavior === 'hostile' || this.behavior === 'ranged' || this.behavior === 'exploder';
  }

  get isNpc(): boolean {
    return this.def.class === 'npc';
  }

  get aquatic(): boolean {
    return this.def.aquatic === true;
  }

  get shop(): ShopOffer[] | undefined {
    return this.def.shop;
  }

  get magic(): boolean {
    return this.def.tags.includes('magic') || this.def.tags.includes('monster') && this.def.attack === 'ranged';
  }

  setState(state: GameEntity['state']) {
    if (this.state === state) return;
    this.state = state;
    if (this.alive) {
      if (state === 'walk' && this.instance.hasAnimation('walk')) this.instance.setBase('walk');
      else if (state === 'run' && this.instance.hasAnimation('run')) this.instance.setBase('run');
      else if (state === 'idle' && this.instance.hasAnimation('idle')) this.instance.setBase('idle');
      this.currentBase = state;
    }
  }

  private collidesAt(x: number, y: number, z: number): boolean {
    const r = Math.max(0.24, this.def.bodyRadius * this.def.scale);
    const h = Math.max(0.45, this.def.bodyHeight * this.def.scale * 0.9);
    const minX = Math.floor(x - r);
    const maxX = Math.floor(x + r);
    const minZ = Math.floor(z - r);
    const maxZ = Math.floor(z + r);
    const minY = Math.floor(y + 0.02);
    const maxY = Math.floor(y + h);
    const w = this.manager.world;
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          const id = w.getBlock(bx, by, bz);
          if (id && isSolidId(id)) return true;
        }
      }
    }
    return false;
  }

  private moveHorizontal(dx: number, dz: number) {
    if (dx !== 0) {
      const nx = this.position.x + dx;
      if (!this.collidesAt(nx, this.position.y, this.position.z)) this.position.x = nx;
      else {
        // Small step assist for mobs walking up single blocks.
        if (this.onGround && !this.collidesAt(nx, this.position.y + 1.01, this.position.z)) {
          this.position.x = nx;
          this.position.y += 1.01;
        } else {
          this.velocity.x = 0;
          this.stuckTime += 0.05;
        }
      }
    }
    if (dz !== 0) {
      const nz = this.position.z + dz;
      if (!this.collidesAt(this.position.x, this.position.y, nz)) this.position.z = nz;
      else {
        if (this.onGround && !this.collidesAt(this.position.x, this.position.y + 1.01, nz)) {
          this.position.z = nz;
          this.position.y += 1.01;
        } else {
          this.velocity.z = 0;
          this.stuckTime += 0.05;
        }
      }
    }
  }

  private physics(dt: number) {
    if (this.def.flying || this.behavior === 'flying') {
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
      this.onGround = false;
      return;
    }
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -32) this.velocity.y = -32;
    const ny = this.position.y + this.velocity.y * dt;
    if (this.collidesAt(this.position.x, ny, this.position.z)) {
      if (this.velocity.y <= 0) {
        this.onGround = true;
        this.position.y = Math.floor(this.position.y + 0.02);
      }
      this.velocity.y = 0;
    } else {
      this.position.y = ny;
      this.onGround = false;
    }
    this.moveHorizontal(this.velocity.x * dt, this.velocity.z * dt);
    if (this.onGround && this.stuckTime > 0.2) {
      this.velocity.y = 7.2;
      this.stuckTime = 0;
    }
  }

  update(dt: number, player: PlayerHandle) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.stuckTime = Math.max(0, this.stuckTime - dt);
    this.target = player;

    if (!this.alive) {
      this.deathTimer += dt;
      this.instance.update(dt);
      if (this.deathTimer > 0.9) {
        const fade = Math.max(0, 1 - (this.deathTimer - 0.9) / 1.1);
        this.instance.setOpacity(fade);
        this.nameplate?.material && ((this.nameplate.material as THREE.SpriteMaterial).opacity = fade);
      }
      return;
    }

    const dist = this.position.distanceTo(player.position);
    const playerAlive = player.isAlive();
    const aggroRange = this.def.sight;
    if (this.isHostile && playerAlive && dist < aggroRange) this.aggro = true;
    if (this.aggro && (!playerAlive || dist > aggroRange * 2.2)) this.aggro = false;

    let desiredX = 0;
    let desiredZ = 0;
    let speed = this.def.speed * (this.aggro ? 1.12 : 0.6);
    let moving = false;

    if (this.def.class === 'npc') {
      // Village guards defend against nearby monsters.
      if (this.behavior === 'guard' && this.def.damage > 0) {
        const threat = this.manager.nearestHostile(this.position, 13, this);
        if (threat) {
          const d = this.position.distanceTo(threat.position);
          if (d > 1.4) {
            desiredX = threat.position.x - this.position.x;
            desiredZ = threat.position.z - this.position.z;
            speed = this.def.speed;
            moving = true;
          } else if (this.attackCooldown <= 0) {
            threat.hurt(this.def.damage, this);
            this.attackCooldown = this.def.cooldown;
            this.instance.play('attack', { once: true, overlay: true });
            this.manager.audio.play('hit');
          }
        }
      }
      if (!moving) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 3 + Math.random() * 6;
          this.wanderAngle = Math.random() * Math.PI * 2;
          this.wandering = this.behavior === 'wander';
        }
        if (this.wandering) {
          const targetX = this.spawnPosition.x + Math.cos(this.wanderAngle) * 3.5;
          const targetZ = this.spawnPosition.z + Math.sin(this.wanderAngle) * 3.5;
          if (Math.hypot(targetX - this.position.x, targetZ - this.position.z) > 1.2) {
            desiredX = targetX - this.position.x;
            desiredZ = targetZ - this.position.z;
            speed = 1.25;
            moving = true;
          }
        }
      }
    } else if (this.behavior === 'flee') {
      if (dist < 7 && playerAlive) {
        desiredX = this.position.x - player.position.x;
        desiredZ = this.position.z - player.position.z;
        speed = this.def.speed * 1.15;
        moving = true;
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2 + Math.random() * 5;
          this.wanderAngle = Math.random() * Math.PI * 2;
        }
        desiredX = Math.cos(this.wanderAngle);
        desiredZ = Math.sin(this.wanderAngle);
        speed = this.def.speed * 0.35;
        moving = true;
      }
    } else if (this.behavior === 'exploder') {
      if (this.aggro && dist < 3.4) {
        this.fuse += dt;
        const pulse = 1 + Math.sin(this.fuse * 22) * 0.08;
        this.instance.root.scale.setScalar(pulse);
        if (this.fuse > 1.35 && !this.exploded) {
          this.exploded = true;
          this.manager.explode(this.position.x, this.position.y + 0.5, this.position.z, this.def.explodeRadius ?? 3, this.def.damage, true);
          this.die(true);
        }
      } else if (this.aggro) {
        desiredX = player.position.x - this.position.x;
        desiredZ = player.position.z - this.position.z;
        moving = true;
      }
    } else if (this.behavior === 'hostile' || this.behavior === 'ranged' || this.behavior === 'guard') {
      if (this.aggro && playerAlive) {
        const attackRange = this.def.attackRange;
        const ranged = this.def.attack === 'ranged' || this.behavior === 'ranged';
        if (ranged) {
          if (dist > attackRange * 0.8) {
            desiredX = player.position.x - this.position.x;
            desiredZ = player.position.z - this.position.z;
            moving = true;
          } else if (dist < attackRange * 0.45) {
            desiredX = this.position.x - player.position.x;
            desiredZ = this.position.z - player.position.z;
            moving = true;
          }
          if (dist < attackRange && this.attackCooldown <= 0) {
            this.attackCooldown = this.def.cooldown;
            this.instance.play(this.instance.hasAnimation('cast') ? 'cast' : 'attack', { once: true, overlay: true });
            this.manager.shoot(this, this.magic ? 'bolt' : 'arrow');
          }
        } else {
          if (dist > 1.55) {
            desiredX = player.position.x - this.position.x;
            desiredZ = player.position.z - this.position.z;
            moving = true;
          } else if (this.attackCooldown <= 0) {
            this.attackCooldown = this.def.cooldown;
            this.instance.play('attack', { once: true, overlay: true });
            const damage = Math.round(this.def.damage * (this.manager.difficultyScale ?? 1));
            player.damage(damage, this.displayName);
            this.manager.hooks.onDamagePlayer?.(damage, this);
            this.manager.audio.play('hurt', 2);
            const dir = new THREE.Vector3().subVectors(player.position, this.position).setY(0).normalize();
            player.position.addScaledVector(dir, 0.35);
          }
        }
      } else if (this.behavior === 'guard') {
        // stationary guard
      }
    }

    if (this.behavior === 'flying') {
      const hoverY = this.def.boss ? player.position.y + 4.2 : this.spawnPosition.y + Math.sin(performance.now() * 0.0012 + this.spawnPosition.x) * 0.8 + 1.4;
      if (this.aggro) {
        desiredX = player.position.x - this.position.x;
        desiredZ = player.position.z - this.position.z;
        const wantY = Math.min(player.position.y + 3.2, hoverY + 2.6);
        this.velocity.y = THREE.MathUtils.clamp((wantY - this.position.y) * 1.5, -3, 3);
        if (dist < 2) this.velocity.y = 1;
        if (this.def.attack === 'ranged' && dist < this.def.attackRange && this.attackCooldown <= 0) {
          this.attackCooldown = this.def.cooldown;
          this.instance.play('attack', { once: true, overlay: true });
          this.manager.shoot(this, this.def.boss ? 'fireball' : 'bolt');
        }
      } else if (!this.def.boss) {
        desiredX = Math.cos(performance.now() * 0.0005 + this.spawnPosition.z) * 2;
        desiredZ = Math.sin(performance.now() * 0.0004 + this.spawnPosition.x) * 2;
      }
      speed = this.def.speed;
      moving = Math.abs(desiredX) + Math.abs(desiredZ) > 0.1;
    }

    if (this.aquatic) {
      // Fish hover around their spawn in the water column.
      const targetY = this.spawnPosition.y + Math.sin(performance.now() * 0.001 + this.spawnPosition.x) * 0.5;
      this.velocity.y = THREE.MathUtils.clamp((targetY - this.position.y) * 1.4, -1.4, 1.4);
      desiredX = Math.cos(performance.now() * 0.0005 + this.spawnPosition.z) * 1.2;
      desiredZ = Math.sin(performance.now() * 0.0007 + this.spawnPosition.x) * 1.2;
      moving = true;
    }

    if (this.aggro && this.def.class !== 'npc') {
      this.facing = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
    } else if (moving) {
      const len = Math.hypot(desiredX, desiredZ) || 1;
      this.facing = Math.atan2(desiredX / len, desiredZ / len);
    }
    if (moving) {
      const len = Math.hypot(desiredX, desiredZ) || 1;
      this.velocity.x = (desiredX / len) * speed;
      this.velocity.z = (desiredZ / len) * speed;
    } else if (this.def.flying || this.aquatic) {
      this.velocity.x *= Math.pow(0.02, dt);
      this.velocity.z *= Math.pow(0.02, dt);
    } else {
      this.velocity.x *= Math.pow(0.0004, dt);
      this.velocity.z *= Math.pow(0.0004, dt);
    }

    this.physics(dt);

    // Face direction with smooth turn.
    let delta = this.facing - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;
    this.root.position.copy(this.position);

    if (this.hurtTimer <= 0) {
      if (moving && this.onGround) this.setState(speed > 2.4 ? 'run' : 'walk');
      else this.setState('idle');
    }
    this.instance.update(dt);
  }

  hurt(amount: number, source?: GameEntity | PlayerHandle, knockback = 1): boolean {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0.32;
    this.instance.flashHurt(0.8);
    this.instance.play('hurt', { once: true, overlay: true });
    this.manager.audio.play('hit');
    if (this.isHostile) this.aggro = true;
    if (source) {
      const dx = this.position.x - (source instanceof GameEntity ? source.position.x : source.position.x);
      const dz = this.position.z - (source instanceof GameEntity ? source.position.z : source.position.z);
      const len = Math.hypot(dx, dz) || 1;
      this.velocity.x += (dx / len) * 3.2 * knockback;
      this.velocity.z += (dz / len) * 3.2 * knockback;
      if (!this.def.flying) this.velocity.y = 4.5 * knockback;
    }
    if (this.boss) this.manager.hooks.onBossHealth?.(this);
    if (this.health <= 0) {
      this.die(source instanceof GameEntity || (source !== undefined && 'inventory' in source));
      return true;
    }
    return false;
  }

  die(byPlayer: boolean) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.deathTimer = 0;
    this.instance.play('death', { once: true, overlay: false });
    this.manager.audio.play(this.def.boss ? 'lose' : 'hit', 3);
    for (const drop of this.def.drops) {
      if (drop.chance !== undefined && Math.random() > drop.chance) continue;
      const n = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
      if (n > 0) this.manager.spawnDrop(drop.item, n, this.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
    }
    this.manager.hooks.onKill?.(this, byPlayer);
    if (byPlayer && this.def.xp) {
      this.manager.player?.addXp(this.def.xp);
    }
    if (this.boss) this.manager.hooks.onBoss?.(null);
    if (this.nameplate) {
      (this.nameplate.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  interact(player: PlayerHandle): boolean {
    if (!this.alive || this.def.class !== 'npc') return false;
    this.facing = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
    this.yaw = this.facing;
    this.root.rotation.y = this.yaw;
    if (this.instance.hasAnimation('wave')) this.instance.play('wave', { once: false, overlay: true });
    return true;
  }

  dispose() {
    this.root.removeFromParent();
    this.instance.dispose();
    this.root.traverse((obj) => {
      const sprite = obj as THREE.Sprite;
      if (sprite.isSprite) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
    });
    for (const mat of this.instance.materials) mat.dispose();
  }

  private wandering = false;
}

export class EntityManager {
  readonly group = new THREE.Group();
  readonly entities: GameEntity[] = [];
  readonly world: VoxelWorld;
  readonly atlas?: TextureAtlas;
  readonly particles: ParticleSink;
  readonly audio: AudioSystem;
  hooks: EntityHooks = {};
  player: PlayerHandle | null = null;
  difficultyScale = 1;
  boss: GameEntity | null = null;

  private loaded = new Map<string, LoadedModel>();
  private projectiles: Projectile[] = [];
  private drops: ItemDrop[] = [];
  private dropTextures = new Map<string, THREE.Texture>();
  private deadCleanup = new Map<GameEntity, number>();
  private projectileGroup = new THREE.Group();
  private dropGroup = new THREE.Group();

  constructor(world: VoxelWorld, particles: ParticleSink, audio: AudioSystem, atlas?: TextureAtlas) {
    this.world = world;
    this.particles = particles;
    this.audio = audio;
    this.atlas = atlas;
    this.group.name = 'entities';
    this.group.add(this.projectileGroup);
    this.dropGroup.name = 'drops';
    this.group.add(this.dropGroup);
  }

  spawn(key: string, position: THREE.Vector3, opts: SpawnOptions = {}): GameEntity | null {
    const def = entityDef(key);
    if (!def) {
      console.warn(`Unknown entity ${key}`);
      return null;
    }
    let model = this.loaded.get(key);
    if (!model) {
      model = loadBlockbenchModel(buildAssetModel(key), { name: def.name });
      this.loaded.set(key, model);
    }
    const pos = position.clone();
    if (!opts.exactY && !def.flying && !def.aquatic) {
      const ground = this.world.getNearestGround(pos.x, pos.z, Math.ceil(pos.y + 3));
      if (ground >= 0) pos.y = ground;
    }
    const entity = new GameEntity(this, def, pos, model, opts);
    this.entities.push(entity);
    this.group.add(entity.root);
    if (entity.boss) {
      this.boss = entity;
      this.hooks.onBoss?.(entity);
    }
    void hashAngle(pos.x, pos.z);
    return entity;
  }

  remove(entity: GameEntity) {
    const index = this.entities.indexOf(entity);
    if (index >= 0) this.entities.splice(index, 1);
    entity.dispose();
    if (this.boss === entity) {
      this.boss = null;
      this.hooks.onBoss?.(null);
    }
  }

  clear() {
    for (const entity of [...this.entities]) {
      entity.root.removeFromParent();
      entity.root.traverse((obj) => {
        const sprite = obj as THREE.Sprite;
        if (sprite.isSprite) {
          sprite.material.dispose();
        }
      });
    }
    this.entities.length = 0;
    for (const p of this.projectiles) {
      p.object.removeFromParent();
      const mesh = p.object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) (mesh.material as THREE.Material).dispose();
    }
    this.projectiles.length = 0;
    for (const d of this.drops) {
      d.sprite.removeFromParent();
      d.sprite.material.dispose();
    }
    this.drops.length = 0;
    this.boss = null;
  }

  setPlayer(player: PlayerHandle) {
    this.player = player;
  }

  nearestHostile(position: THREE.Vector3, radius: number, exclude?: GameEntity): GameEntity | null {
    let best: GameEntity | null = null;
    let bestDist = radius;
    for (const e of this.entities) {
      if (!e.alive || e === exclude || !e.isHostile) continue;
      const d = e.position.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  nearest(position: THREE.Vector3, radius: number, filter?: (e: GameEntity) => boolean): GameEntity | null {
    let best: GameEntity | null = null;
    let bestDist = radius;
    for (const e of this.entities) {
      if (!e.alive || (filter && !filter(e))) continue;
      const d = e.position.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 4.5): GameEntity | null {
    let best: GameEntity | null = null;
    let bestT = maxDistance;
    for (const e of this.entities) {
      if (!e.alive) continue;
      const center = e.center;
      const to = center.clone().sub(origin);
      const t = to.dot(direction);
      if (t < 0 || t > bestT) continue;
      const closest = origin.clone().addScaledVector(direction, t);
      const radius = Math.max(0.45, e.def.bodyRadius * e.def.scale + 0.25);
      if (closest.distanceTo(center) <= radius) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }

  update(dt: number) {
    const player = this.player;
    if (!player) return;
    for (const entity of [...this.entities]) {
      if (!entity.alive) {
        entity.update(dt, player);
        const done = entity.deathTimer > 2.1;
        if (done) this.remove(entity);
        continue;
      }
      // Cull entities that fall out of the world or stray absurdly far.
      if (entity.position.y < -8 || entity.position.distanceTo(player.position) > 130) {
        this.remove(entity);
        continue;
      }
      entity.update(dt, player);
    }
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    if (this.boss && !this.boss.alive) this.boss = null;
  }

  shoot(source: GameEntity, kind: 'arrow' | 'bolt' | 'fireball' | 'bomb') {
    const player = this.player;
    if (!player) return;
    const origin = source.center.clone();
    const target = new THREE.Vector3(player.position.x, player.position.y + player.eyeHeight * 0.7, player.position.z);
    const dir = target.sub(origin).normalize();
    const speed = kind === 'arrow' ? 22 : kind === 'bolt' ? 15 : kind === 'fireball' ? 14 : 11;
    this.spawnProjectile(origin, dir.multiplyScalar(speed), source.def.damage, false, kind, source);
  }

  playerShoot(origin: THREE.Vector3, direction: THREE.Vector3, damage: number, kind: 'arrow' | 'bolt' | 'bomb' | 'bullet' = 'arrow') {
    const speed = kind === 'arrow' ? 34 : kind === 'bullet' ? 95 : kind === 'bolt' ? 26 : 16;
    this.spawnProjectile(origin, direction.clone().normalize().multiplyScalar(speed), damage, true, kind);
    this.audio.play(kind === 'bullet' ? 'shot' : 'bow');
  }

  private spawnProjectile(origin: THREE.Vector3, velocity: THREE.Vector3, damage: number, fromPlayer: boolean, kind: Projectile['kind'], source?: GameEntity) {
    let object: THREE.Object3D;
    if (kind === 'arrow') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.7),
        new THREE.MeshBasicMaterial({ color: fromPlayer ? 0xe7e2cb : 0xc8b27d }),
      );
      object = mesh;
      mesh.lookAt(origin.clone().add(velocity));
    } else if (kind === 'bullet') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.55),
        new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      );
      object = mesh;
      mesh.lookAt(origin.clone().add(velocity));
    } else if (kind === 'fireball') {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8a3d }),
      );
      object = mesh;
      const glow = new THREE.PointLight(0xff7a2d, 3, 6, 2);
      mesh.add(glow);
    } else {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(kind === 'bomb' ? 0.24 : 0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: kind === 'bomb' ? 0x5bff87 : 0x8ce7ff }),
      );
      object = mesh;
    }
    object.position.copy(origin);
    this.projectileGroup.add(object);
    this.projectiles.push({
      object, position: origin.clone(), velocity: velocity.clone(), damage,
      life: kind === 'bullet' ? 1.4 : kind === 'fireball' ? 6 : 4,
      radius: kind === 'fireball' ? 0.38 : kind === 'bullet' ? 0.12 : 0.2,
      fromPlayer, gravity: kind === 'arrow' ? 10 : 0, kind,
      splash: kind === 'fireball' ? 2.4 : kind === 'bomb' ? 2.8 : 0,
      source,
    });
  }

  private updateProjectiles(dt: number) {
    const player = this.player;
    if (!player) return;
    for (const p of [...this.projectiles]) {
      p.life -= dt;
      p.velocity.y -= p.gravity * dt;
      // Substep fast arrows so they cannot tunnel through walls.
      const steps = Math.max(1, Math.ceil(p.velocity.length() * dt / 0.45));
      let hit = false;
      for (let i = 0; i < steps && !hit; i++) {
        p.position.addScaledVector(p.velocity, dt / steps);
        const bx = Math.floor(p.position.x), by = Math.floor(p.position.y), bz = Math.floor(p.position.z);
        const id = this.world.getBlock(bx, by, bz);
        if (id && isSolidId(id)) {
          hit = true;
          const color = blockById(id).mapColor;
          this.particles.burst(p.position, color, 8, { speed: 3 });
          if (p.kind === 'fireball' || p.kind === 'bomb') this.explode(p.position.x, p.position.y, p.position.z, p.splash, p.damage, true);
          break;
        }
        if (p.fromPlayer) {
          const target = this.raycast(p.position, p.velocity.clone().normalize(), 0.55);
          if (target && target.isHostile) {
            target.hurt(p.damage, undefined, 0.7);
            this.particles.burst(p.position, 0x9fffc8, 7, { speed: 2 });
            hit = true;
          }
        } else if (player.isAlive() && p.position.distanceTo(new THREE.Vector3(player.position.x, player.position.y + player.eyeHeight * 0.65, player.position.z)) < 0.55) {
          player.damage(p.damage, p.kind === 'fireball' ? 'Dragonfire' : p.kind === 'bolt' ? 'Arcane bolt' : 'Arrow');
          if (p.kind === 'fireball') this.explode(p.position.x, p.position.y, p.position.z, p.splash, 0, false);
          this.particles.burst(p.position, 0xffd08a, 8, { speed: 3 });
          this.audio.play('hurt', 1);
          hit = true;
        }
      }
      if (hit || p.life <= 0) {
        this.removeProjectile(p);
      } else {
        p.object.position.copy(p.position);
        if (p.kind === 'arrow' || p.kind === 'bullet') p.object.lookAt(p.position.clone().add(p.velocity));
      }
    }
  }

  private removeProjectile(p: Projectile) {
    const index = this.projectiles.indexOf(p);
    if (index >= 0) this.projectiles.splice(index, 1);
    p.object.removeFromParent();
    const mesh = p.object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
    else mesh.material?.dispose();
  }

  spawnDrop(itemKey: string, count: number, position: THREE.Vector3) {
    if (!ITEM_BY_KEY.has(itemKey)) return;
    const texture = this.dropTexture(itemKey);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.1, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.46, 0.46, 1);
    const pos = position.clone();
    pos.y += 0.35;
    sprite.position.copy(pos);
    this.dropGroup.add(sprite);
    this.drops.push({
      sprite, item: itemKey, count, position: pos, vy: 3 + Math.random() * 2,
      age: 0, pickupDelay: 0.5, bob: Math.random() * Math.PI * 2,
    });
  }

  private dropTexture(itemKey: string): THREE.Texture {
    let tex = this.dropTextures.get(itemKey);
    if (!tex) {
      const url = itemIcon(itemKey, this.atlas);
      tex = new THREE.TextureLoader().load(url);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.dropTextures.set(itemKey, tex);
    }
    return tex;
  }

  private updateDrops(dt: number) {
    const player = this.player;
    if (!player) return;
    for (const drop of [...this.drops]) {
      drop.age += dt;
      drop.bob += dt * 2.4;
      drop.vy -= 18 * dt;
      drop.position.y += drop.vy * dt;
      const ground = this.world.getBlock(Math.floor(drop.position.x), Math.floor(drop.position.y - 0.18), Math.floor(drop.position.z));
      if (ground && isSolidId(ground) && drop.vy < 0) {
        drop.position.y = Math.floor(drop.position.y - 0.18) + 1.18;
        drop.vy = 0;
      }
      drop.sprite.position.set(drop.position.x, drop.position.y + Math.sin(drop.bob) * 0.08, drop.position.z);
      if (drop.age > drop.pickupDelay && player.isAlive()) {
        const dx = drop.position.x - player.position.x;
        const dz = drop.position.z - player.position.z;
        const dy = drop.position.y - (player.position.y + 0.9);
        if (dx * dx + dy * dy + dz * dz < 3.4) {
          const left = player.inventory.add(drop.item, drop.count);
          if (left < drop.count) {
            this.audio.play('pickup');
            this.hooks.onPickup?.(drop.item, drop.count - left);
            this.hooks.onNotify?.(`+${drop.count - left} ${ITEM_BY_KEY.get(drop.item)?.name ?? drop.item}`, 'good');
            if (left > 0) drop.count = left;
            else {
              drop.sprite.removeFromParent();
              drop.sprite.material.dispose();
              this.drops.splice(this.drops.indexOf(drop), 1);
              continue;
            }
          }
        }
      }
      if (drop.age > 180) {
        drop.sprite.removeFromParent();
        drop.sprite.material.dispose();
        this.drops.splice(this.drops.indexOf(drop), 1);
      }
    }
  }

  explode(x: number, y: number, z: number, radius: number, damage: number, breakBlocks: boolean) {
    this.audio.play('explode');
    this.particles.burst(new THREE.Vector3(x, y, z), 0xffa04d, 80, { speed: 9, gravity: 12, life: 0.9, size: 0.18 });
    this.particles.burst(new THREE.Vector3(x, y, z), 0x5a5148, 40, { speed: 6, gravity: 4, life: 1.4, size: 0.3 });
    if (breakBlocks) {
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
            const id = this.world.getBlock(x + dx, y + dy, z + dz);
            if (!id) continue;
            const def = blockById(id);
            if (!def.breakable || def.hardness > 50) continue;
            if (Math.random() < 0.78) this.world.setBlock(x + dx, y + dy, z + dz, 0);
          }
        }
      }
    }
    const player = this.player;
    if (player?.isAlive()) {
      const d = player.position.distanceTo(new THREE.Vector3(x, y, z));
      if (d < radius + 1.5) {
        const falloff = Math.max(0.15, 1 - d / (radius + 1.5));
        player.damage(Math.round(damage * falloff), 'Explosion');
      }
    }
    for (const e of this.entities) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(new THREE.Vector3(x, y, z));
      if (d < radius + 1.2) e.hurt(Math.round(damage * Math.max(0.1, 1 - d / (radius + 1.2)) / 2));
    }
    this.hooks.onExplosion?.(x, y, z, radius);
  }

  dispose() {
    this.clear();
    for (const tex of this.dropTextures.values()) tex.dispose();
    this.dropTextures.clear();
    this.loaded.clear();
  }
}
