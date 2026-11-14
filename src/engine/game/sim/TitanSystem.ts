import * as THREE from 'three';
import type { Game } from '../Game';
import type { GameEntity } from '../../entities/EntityManager';
import {
  TITANS,
  TITAN_ENTITY_PREFIX,
  TITAN_PLAYER_SPAWN,
  TITAN_SEALS,
  TITAN_STATIONS,
  type TitanDef,
  type TitanElement,
} from '../../../content/TitanLayout';
import type { SimHud, SimSpec, SimSystem } from './SimTypes';
import { formatCoins, giveItem, groundAt } from './SimUtils';

type Stage = 'intro' | 'fight' | 'break' | 'won';

interface AddState {
  entity: GameEntity;
  dead: boolean;
  reward: number;
  xp: number;
}

interface Hazard {
  x: number;
  z: number;
  radius: number;
  inner: number;
  delay: number;
  timer: number;
  damage: number;
  slow: number;
  color: string;
  ring: boolean;
  resolved: boolean;
  fade: number;
  group: THREE.Group;
  disc: THREE.Mesh;
  rim: THREE.Mesh;
  innerRim: THREE.Mesh | null;
  discMat: THREE.MeshBasicMaterial;
  rimMat: THREE.MeshBasicMaterial;
}

interface Bolt {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  color: string;
  element: TitanElement;
}

const ANVIL_SWORD_COST = 90;
const ANVIL_ARROW_COST = 12;
const HEARTH_COST = 25;
const OBELISK_HEART_COST = 70;
const OBELISK_SWIFT_COST = 55;
const OBELISK_APPLE_COST = 15;

const ARENA_LIMIT = 18.4;

/**
 * Titan Trials: a three-fight boss rush inside the forge colosseum.
 * Each titan is an engine boss with custom movement, phase transitions,
 * telegraphed arena hazards and adds. The forge stations between fights
 * sell permanent upgrades that survive a rematch.
 */
export class TitanSystem implements SimSystem {
  readonly kind = 'titan' as const;

  private game: Game;
  private floorY: number;
  private center: THREE.Vector3;
  private spawn: THREE.Vector3;
  private baseWalk: number;
  private baseSprint: number;
  private baseMaxHealth: number;

  private lights: THREE.PointLight[] = [];
  private boss: GameEntity | null = null;
  private adds: AddState[] = [];
  private hazards: Hazard[] = [];
  private bolts: Bolt[] = [];

  private stage: Stage = 'intro';
  private index = 0;
  private phase = 1;
  private everStarted = false;
  private won = false;
  private sawEnd = false;

  private hurtCd = 0;
  private chillTimer = 0;
  private attackCd = 0;
  private slamCd = 0;
  private boltCd = 0;
  private specialCd = 0;
  private strafe = 0;
  private uid = 0;

  private anvilSword = false;
  private obeliskHeart = false;
  private obeliskSwift = false;
  private stationUses = 0;

  private lastResult = 'Warden Kael waits at the forge gate.';

  constructor(spec: SimSpec, game: Game) {
    this.game = game;
    this.floorY = game.baseY + 1;
    const cx = spec.center?.x ?? 0;
    const cz = spec.center?.z ?? 0;
    this.center = new THREE.Vector3(cx + 0.5, this.floorY, cz + 0.5);
    this.spawn = new THREE.Vector3(TITAN_PLAYER_SPAWN.x, game.baseY + TITAN_PLAYER_SPAWN.y, TITAN_PLAYER_SPAWN.z);

    this.baseWalk = game.player.walkSpeed;
    this.baseSprint = game.player.sprintSpeed;
    this.baseMaxHealth = game.player.maxHealth;

    // One warm forge heart and a lamp at each station.
    this.addLamp(this.center.x, this.floorY + 4.4, this.center.z, 0xff9a3c, 26, 26);
    this.addLamp(TITAN_STATIONS.anvil.x + 0.5, this.floorY + 1.9, TITAN_STATIONS.anvil.z + 0.5, 0xffb060, 10, 10);
    this.addLamp(TITAN_STATIONS.hearth.x + 0.5, this.floorY + 2.1, TITAN_STATIONS.hearth.z + 0.5, 0xff6a2d, 12, 11);
    this.addLamp(TITAN_STATIONS.obelisk.x + 0.5, this.floorY + 2.1, TITAN_STATIONS.obelisk.z + 0.5, 0x9a7aff, 10, 10);

    this.game.hud.showWaveBanner('Titan Trials', 'The Forge Gate', 'Three titans. One forge.', 4.2);
    this.game.toast('Speak with Kael, then begin the trial at the forge gate.', 'info');
  }

  private addLamp(x: number, y: number, z: number, color: number, intensity: number, distance: number): THREE.PointLight {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.set(x, y, z);
    this.game.scene.add(light);
    this.lights.push(light);
    return light;
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    if (this.game.ended) {
      this.sawEnd = true;
      return;
    }
    if (this.sawEnd) {
      this.sawEnd = false;
      if (!this.won) this.stopFight();
    }

    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.chillTimer = Math.max(0, this.chillTimer - dt);
    this.applyChill();

    if (this.won) {
      this.updateHazards(dt);
      return;
    }
    if (!this.game.player.isAlive()) return;

    if (this.stage === 'fight') {
      this.stageFight(dt);
    } else {
      this.updateHazards(dt);
      this.updateBolts(dt);
    }
  }

  private stageFight(dt: number): void {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.slamCd = Math.max(0, this.slamCd - dt);
    this.boltCd = Math.max(0, this.boltCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.strafe += dt;

    const boss = this.boss;
    if (!boss) return;
    if (!boss.alive) {
      this.settleBoss();
      return;
    }

    const def = TITANS[this.index];
    this.updatePhases(def, boss);
    this.moveBoss(def, boss, dt);
    this.checkAdds();

    const player = this.game.player;
    const dist = Math.hypot(player.position.x - boss.position.x, player.position.z - boss.position.z);
    if (dist < (def.element === 'stone' ? 3.1 : 2.7) && this.attackCd <= 0) {
      this.attackCd = 1.1;
      this.hurtPlayer(def.contact, def.name, 0.5);
      this.game.particles.burst(player.position.clone().add(new THREE.Vector3(0, 1.1, 0)), def.accent, 8, {
        speed: 2.4, life: 0.4, size: 0.08, glow: true,
      });
    }

    if (this.specialCd <= 0) this.specialCd = this.castSpecial(def);
    this.updateHazards(dt);
    this.updateBolts(dt);
  }

  private moveBoss(def: TitanDef, boss: GameEntity, dt: number): void {
    const player = this.game.player;
    const dx = player.position.x - boss.position.x;
    const dz = player.position.z - boss.position.z;
    const dist = Math.hypot(dx, dz);

    if (def.element === 'stone') {
      boss.moveOverride = { x: player.position.x, z: player.position.z, speed: def.speed };
      if (this.slamCd <= 0 && dist < 4.2) {
        this.slamCd = this.phase >= 3 ? 2.3 : 3.1;
        this.slam(boss, def);
      }
      return;
    }

    // Dragons keep their distance, circle the player and fire elemental bolts.
    const orbit = 8.2 + Math.sin(this.strafe * 0.6) * 1.4;
    const dir = this.index === 1 ? 1 : -1;
    const angle = this.strafe * 0.55 * dir;
    const targetX = THREE.MathUtils.clamp(player.position.x + Math.cos(angle) * orbit, -ARENA_LIMIT, ARENA_LIMIT);
    const targetZ = THREE.MathUtils.clamp(player.position.z + Math.sin(angle) * orbit, -ARENA_LIMIT, ARENA_LIMIT);
    boss.moveOverride = { x: targetX, z: targetZ, speed: def.speed };

    if (this.boltCd <= 0) {
      this.boltCd = this.phase >= 3 ? 1.45 : this.phase === 2 ? 1.9 : 2.5;
      this.fireBolts(def, boss, this.phase >= 3 ? 3 : 1);
    }
  }

  private updatePhases(def: TitanDef, boss: GameEntity): void {
    if (this.phase >= 3) return;
    const pct = boss.health / Math.max(1, boss.maxHealth);
    if (this.phase === 1 && pct <= 0.66) this.enterPhase(def, boss, 2);
    else if (this.phase === 2 && pct <= 0.33) this.enterPhase(def, boss, 3);
  }

  private enterPhase(def: TitanDef, boss: GameEntity, phase: number): void {
    this.phase = phase;
    const message = phase === 2 ? def.phase2 : def.phase3;
    const color = this.hazardColor(def.element);

    this.game.audio.play('wave');
    this.game.hud.showWaveBanner(def.name, `Phase ${phase}`, message, 4.2);
    this.game.toast(message, 'bad');
    this.lastResult = message;
    this.game.particles.burst(boss.position.clone().add(new THREE.Vector3(0, 1.4, 0)), color, 48, {
      speed: 4.2, life: 1, size: 0.14, glow: true,
    });

    // Every phase opens with a shockwave, then two adds join the fight.
    this.addHazard(boss.position.x, boss.position.z, def.element === 'frost' ? 9 : 7.6, 1.15, 4 + this.index + phase, {
      ring: true, inner: 1, color,
    });
    if (phase === 3) {
      this.addHazard(boss.position.x, boss.position.z, def.element === 'frost' ? 11 : 8.8, 1.5, 6 + this.index, {
        ring: true, inner: 0.5, color,
      });
    }
    this.spawnAdds(def, 2);
    this.specialCd = Math.min(this.specialCd, 1.2);
  }

  private castSpecial(def: TitanDef): number {
    const player = this.game.player;
    if (def.element === 'stone') {
      const count = this.phase >= 3 ? 7 : 5;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.4 + Math.random() * 6.4;
        this.addHazard(player.position.x + Math.cos(angle) * radius, player.position.z + Math.sin(angle) * radius, 1.8, 0.95 + Math.random() * 0.35, 5 + this.index, {
          color: '#ffb066',
        });
      }
      this.game.audio.play('hit', 1);
      this.lastResult = 'The Colossus calls the ceiling down.';
      return this.phase >= 3 ? 3.7 : 5.2;
    }
    if (def.element === 'ember') {
      const count = this.phase >= 3 ? 6 : 4;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.8 + Math.random() * 6.2;
        this.addHazard(player.position.x + Math.cos(angle) * radius, player.position.z + Math.sin(angle) * radius, 2.2, 1 + Math.random() * 0.3, 5 + this.index, {
          color: '#ff6a2d',
        });
      }
      if (this.phase >= 3) {
        this.addHazard(this.center.x, this.center.z, 12, 1.35, 7, { ring: true, inner: 0.4, color: '#ff5a2d' });
      }
      this.game.audio.play('shot', 2);
      this.lastResult = 'Cinderwing rains fire across the forge.';
      return this.phase >= 3 ? 3.3 : 4.5;
    }

    const count = this.phase >= 3 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1 + Math.random() * 6;
      this.addHazard(player.position.x + Math.cos(angle) * radius, player.position.z + Math.sin(angle) * radius, 2.5, 0.8 + Math.random() * 0.3, 3 + this.index, {
        color: '#7fe8ff', slow: 3.6,
      });
    }
    if (this.phase >= 3) {
      this.addHazard(this.center.x, this.center.z, 10.5, 1.3, 6 + this.index, { ring: true, inner: 0.5, color: '#bff4ff', slow: 3 });
    }
    this.game.audio.play('splash');
    this.lastResult = 'The floor freezes under Rimefang.';
    return this.phase >= 3 ? 3.4 : 4.4;
  }

  private slam(boss: GameEntity, def: TitanDef): void {
    this.game.audio.play('explode', 1);
    this.game.particles.burst(boss.position.clone().add(new THREE.Vector3(0, 0.4, 0)), def.accent, 18, {
      speed: 3.4, life: 0.6, size: 0.1,
    });
    this.addHazard(boss.position.x, boss.position.z, 4.4, 0.7, def.contact + 2, {
      ring: true, inner: 0.7, color: def.accent,
    });
    this.lastResult = `${def.name} brings its fists down.`;
  }

  private fireBolts(def: TitanDef, boss: GameEntity, count: number): void {
    const player = this.game.player;
    const origin = boss.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const target = new THREE.Vector3(player.position.x, player.position.y + player.eyeHeight * 0.65, player.position.z);
    const base = target.sub(origin).normalize();
    const speed = def.element === 'ember' ? 12.5 : 13.5;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.16;
      const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      this.spawnBolt(origin, dir, speed, def);
    }
    this.game.audio.play('shot', def.element === 'ember' ? 1 : 2);
    this.lastResult = `${def.name} hurls ${def.element === 'ember' ? 'a cinder lance' : 'a shard of winter'}.`;
  }

  private spawnBolt(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, def: TitanDef): void {
    const color = def.element === 'ember' ? '#ff8a3d' : '#8feaff';
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    this.bolts.push({
      mesh,
      mat,
      velocity: dir.clone().normalize().multiplyScalar(speed),
      damage: def.contact + 1,
      life: 4,
      color,
      element: def.element,
    });
  }

  // ------------------------------------------------------------------ hazards

  private addHazard(
    x: number,
    z: number,
    radius: number,
    delay: number,
    damage: number,
    opts: { ring?: boolean; inner?: number; color?: string; slow?: number } = {},
  ): void {
    const color = opts.color ?? '#ff9a3c';
    const ring = !!opts.ring;
    const inner = opts.inner ?? 0.6;
    const group = new THREE.Group();
    group.position.set(x, this.floorY + 0.045, z);

    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: ring ? 0.07 : 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    group.add(disc);

    const rimMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const width = Math.max(0.22, Math.min(0.5, radius * 0.05));
    const rim = new THREE.Mesh(new THREE.RingGeometry(radius - width, radius, 48), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.03;
    group.add(rim);

    let innerRim: THREE.Mesh | null = null;
    if (ring && inner > 0.25) {
      const innerWidth = Math.max(0.12, Math.min(0.26, inner * 0.16));
      innerRim = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.04, inner - innerWidth), inner + innerWidth, 32), rimMat);
      innerRim.rotation.x = -Math.PI / 2;
      innerRim.position.y = 0.03;
      group.add(innerRim);
    }

    group.scale.setScalar(0.4);
    this.game.scene.add(group);
    this.hazards.push({
      x, z, radius, inner, delay, timer: delay, damage,
      slow: opts.slow ?? 0, color, ring,
      resolved: false, fade: 0.4, group, disc, rim, innerRim, discMat, rimMat,
    });
  }

  private updateHazards(dt: number): void {
    const player = this.game.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hazard = this.hazards[i];
      if (!hazard.resolved) {
        hazard.timer -= dt;
        const progress = THREE.MathUtils.clamp(1 - hazard.timer / hazard.delay, 0, 1);
        hazard.group.scale.setScalar(0.4 + progress * 0.6);
        hazard.rimMat.opacity = 0.45 + Math.sin(progress * Math.PI * 7) * 0.2 + progress * 0.25;
        if (hazard.timer <= 0) this.resolveHazard(hazard);
        continue;
      }

      hazard.fade -= dt;
      if (hazard.slow > 0) {
        const dist = Math.hypot(player.position.x - hazard.x, player.position.z - hazard.z);
        if (dist <= hazard.radius) this.chillTimer = Math.max(this.chillTimer, 0.5);
      }
      const alpha = THREE.MathUtils.clamp(hazard.fade / 0.5, 0, 1);
      hazard.discMat.opacity = (hazard.slow > 0 ? 0.12 : 0.07) * alpha;
      hazard.rimMat.opacity = 0.55 * alpha;
      if (hazard.fade <= 0) {
        this.disposeHazard(hazard);
        this.hazards.splice(i, 1);
      }
    }
  }

  private resolveHazard(hazard: Hazard): void {
    hazard.resolved = true;
    hazard.fade = hazard.slow > 0 ? 3.2 : 0.4;
    hazard.group.scale.setScalar(1);
    hazard.discMat.opacity = hazard.slow > 0 ? 0.14 : 0.1;
    hazard.rimMat.opacity = 0.6;
    hazard.timer = 0;

    this.game.particles.burst(new THREE.Vector3(hazard.x, this.floorY + 0.4, hazard.z), hazard.color, hazard.slow > 0 ? 16 : 28, {
      speed: hazard.slow > 0 ? 2.2 : 4.2, life: 0.7, size: 0.1, glow: true,
    });

    const player = this.game.player;
    const dist = Math.hypot(player.position.x - hazard.x, player.position.z - hazard.z);
    const inside = hazard.ring ? dist >= hazard.inner && dist <= hazard.radius : dist <= hazard.radius;
    if (!inside) return;
    if (hazard.slow > 0) this.chillTimer = Math.max(this.chillTimer, hazard.slow);
    this.hurtPlayer(hazard.damage, 'a forge hazard', 0.6);
  }

  private disposeHazard(hazard: Hazard): void {
    this.game.scene.remove(hazard.group);
    hazard.disc.geometry.dispose();
    hazard.rim.geometry.dispose();
    hazard.innerRim?.geometry.dispose();
    hazard.discMat.dispose();
    hazard.rimMat.dispose();
  }

  private clearHazards(): void {
    for (const hazard of this.hazards) this.disposeHazard(hazard);
    this.hazards = [];
  }

  // -------------------------------------------------------------------- bolts

  private updateBolts(dt: number): void {
    const player = this.game.player;
    const chest = player.position.clone().add(new THREE.Vector3(0, player.eyeHeight * 0.65, 0));
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.life -= dt;
      if (bolt.life <= 0) {
        this.removeBolt(i);
        continue;
      }

      const desired = chest.clone().sub(bolt.mesh.position).normalize().multiplyScalar(bolt.velocity.length());
      bolt.velocity.lerp(desired, 1 - Math.exp(-dt * 1.15));
      bolt.mesh.position.addScaledVector(bolt.velocity, dt);
      bolt.mesh.rotation.x += dt * 8;

      if (Math.random() < dt * 18) {
        this.game.particles.burst(bolt.mesh.position.clone(), bolt.color, 2, {
          speed: 0.8, life: 0.35, size: 0.07, glow: true,
        });
      }

      if (bolt.mesh.position.distanceTo(chest) < 0.95) {
        this.game.particles.burst(bolt.mesh.position.clone(), bolt.color, 18, {
          speed: 3, life: 0.55, size: 0.11, glow: true,
        });
        this.hurtPlayer(bolt.damage, bolt.element === 'ember' ? 'Cinderwing' : 'Rimefang', 0.3);
        this.removeBolt(i);
        continue;
      }
      if (bolt.mesh.position.y <= this.floorY + 0.1) {
        this.game.particles.burst(bolt.mesh.position.clone(), bolt.color, 12, {
          speed: 2.2, life: 0.45, size: 0.09, glow: true,
        });
        this.removeBolt(i);
      }
    }
  }

  private removeBolt(index: number): void {
    const bolt = this.bolts[index];
    this.game.scene.remove(bolt.mesh);
    bolt.mesh.geometry.dispose();
    bolt.mat.dispose();
    this.bolts.splice(index, 1);
  }

  private clearBolts(): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) this.removeBolt(i);
  }

  // ------------------------------------------------------------------ phases

  private settleBoss(): void {
    const def = TITANS[this.index];
    const boss = this.boss;
    const position = boss?.position.clone() ?? this.center.clone();
    this.clearAdds();
    this.clearHazards();
    this.clearBolts();
    this.boss = null;
    if (boss) this.game.entities.remove(boss);

    const player = this.game.player;
    player.addCoins(def.reward);
    player.addXp(def.xp);
    this.game.recordSim('defend', `titan${this.index + 1}`, 1);
    this.game.recordSim('earn', 'coin', def.reward);

    this.game.audio.play('levelup');
    this.game.particles.sparkle(position.clone().add(new THREE.Vector3(0, 2, 0)), def.accent, 64);
    this.game.toast(`${def.name} falls. +${def.reward} coins, +${def.xp} XP.`, 'good');
    this.game.hud.showWaveBanner('Titan Down', def.name, `+${def.reward} coins · +${def.xp} XP`, 4.4);

    if (this.index >= TITANS.length - 1) {
      this.win();
      return;
    }

    this.stage = 'break';
    this.lastResult = `${def.name} is broken. The next seal is lit.`;
    this.game.audio.play('checkpoint');
  }

  private win(): void {
    if (this.won) return;
    this.won = true;
    this.stage = 'won';
    const player = this.game.player;
    player.addCoins(400);
    player.addXp(800);
    this.game.recordSim('defend', 'match', 1);
    this.game.recordSim('earn', 'coin', 400);
    this.game.audio.play('win');
    this.game.hud.showWaveBanner('Titan Trials', 'Forge Conquered', 'Three titans. One forge.', 5.2);
    this.game.toast('All three titans are down. +400 coins, +800 XP.', 'good');
    this.lastResult = 'The forge answers to you now.';
    this.game.particles.sparkle(this.game.player.position.clone().add(new THREE.Vector3(0, 3.4, 0)), '#ffd27a', 90);
    this.game.particles.sparkle(this.center.clone().add(new THREE.Vector3(0, 4, 0)), '#ff9a3c', 80);
  }

  private beginFight(): void {
    this.clearFight();
    const def = TITANS[this.index];
    this.stage = 'fight';
    this.phase = 1;
    this.everStarted = true;
    this.specialCd = 3.2;
    this.slamCd = 2.2;
    this.boltCd = 2.6;
    this.attackCd = 0.8;

    const height = def.element === 'stone' ? this.floorY + 0.04 : this.floorY + 5.2;
    const x = def.spawn.x;
    const z = def.spawn.z;
    const pos = new THREE.Vector3(x + 0.5, height, z + 0.5);
    this.boss = this.game.entities.spawn(def.key, pos, {
      exactY: true,
      behavior: 'stationary',
      role: def.role,
      name: def.name,
      id: `${TITAN_ENTITY_PREFIX}boss_${this.uid++}`,
      boss: true,
      scale: def.scale,
      healthScale: def.healthScale,
    });
    if (!this.boss) {
      this.stage = 'intro';
      this.game.toast('The titan could not enter the forge.', 'bad');
      return;
    }
    this.boss.aggro = false;
    this.boss.moveOverride = null;

    const seal = TITAN_SEALS[this.index];
    const color = def.element === 'stone' ? '#c9d2d8' : def.element === 'ember' ? '#ff8a3d' : '#8feaff';
    this.game.particles.burst(new THREE.Vector3(seal.x + 0.5, this.floorY + 1.2, seal.z + 0.5), color, 44, {
      speed: 4, life: 1.1, size: 0.13, glow: true,
    });
    if (def.element !== 'stone') {
      this.game.particles.burst(pos.clone(), color, 40, { speed: 4.2, life: 1.1, size: 0.14, glow: true });
    }

    this.game.audio.play('wave');
    this.game.hud.showWaveBanner('Titan Trials', def.name, def.summon, 4.6);
    this.game.toast(def.summon, 'warn');
    this.lastResult = def.summon;
  }

  private spawnAdds(def: TitanDef, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = this.uid * 1.7 + i * Math.PI;
      const radius = 11 + (i % 3) * 2.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const feet = groundAt(this.game, x, z, this.floorY + 3, this.floorY);
      const entity = this.game.entities.spawn(def.addKey, new THREE.Vector3(x, feet, z), {
        role: def.addRole,
        id: `${TITAN_ENTITY_PREFIX}add_${this.uid++}`,
        healthScale: 1.15 + this.index * 0.1,
      });
      if (!entity) continue;
      this.adds.push({ entity, dead: false, reward: 12 + this.index * 6, xp: 16 + this.index * 8 });
      this.game.particles.burst(entity.position.clone().add(new THREE.Vector3(0, 0.8, 0)), def.accent, 14, {
        speed: 2.6, life: 0.7, size: 0.09, glow: true,
      });
    }
    this.game.audio.play('hit', 2);
    this.lastResult = `${def.name} calls the fallen to its side.`;
  }

  private checkAdds(): void {
    for (const add of this.adds) {
      if (add.dead || add.entity.alive) continue;
      add.dead = true;
      const position = add.entity.position.clone().add(new THREE.Vector3(0, 0.6, 0));
      this.game.player.addCoins(add.reward);
      this.game.player.addXp(add.xp);
      this.game.particles.burst(position, '#ffd27a', 12, { speed: 2.2, life: 0.6, size: 0.09, glow: true });
    }
  }

  private clearAdds(): void {
    for (const add of this.adds) {
      if (add.entity.alive) this.game.entities.remove(add.entity);
    }
    this.adds = [];
  }

  private clearFight(): void {
    if (this.boss) this.game.entities.remove(this.boss);
    this.boss = null;
    this.clearAdds();
    this.clearHazards();
    this.clearBolts();
    this.chillTimer = 0;
    this.applyChill();
  }

  private stopFight(): void {
    this.clearFight();
    this.stage = 'intro';
    this.phase = 1;
    this.specialCd = 0;
  }

  private applyChill(): void {
    const player = this.game.player;
    if (this.chillTimer > 0) {
      player.walkSpeed = this.baseWalk * 0.62;
      player.sprintSpeed = this.baseSprint * 0.62;
    } else {
      player.walkSpeed = this.baseWalk * (this.obeliskSwift ? 1.08 : 1);
      player.sprintSpeed = this.baseSprint * (this.obeliskSwift ? 1.08 : 1);
    }
  }

  private hazardColor(element: TitanElement): string {
    return element === 'stone' ? '#ffb066' : element === 'ember' ? '#ff6a2d' : '#7fe8ff';
  }

  private hurtPlayer(amount: number, source: string, push: number): void {
    const player = this.game.player;
    if (!player.isAlive() || this.hurtCd > 0) return;
    this.hurtCd = 0.55;
    player.damage(amount, source);
    this.game.audio.play('hurt');
    this.game.hud.flashDamage();
    this.game.particles.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#ff5a6a', 10, {
      speed: 2.2, life: 0.45, size: 0.09, glow: true,
    });
    if (push > 0) {
      const boss = this.boss;
      if (boss) {
        const dir = new THREE.Vector3(player.position.x - boss.position.x, 0, player.position.z - boss.position.z);
        if (dir.lengthSq() > 0.001) player.position.addScaledVector(dir.normalize(), push);
      }
    }
    if (!player.isAlive()) {
      this.lastResult = 'The forge claims another challenger.';
    }
  }

  // ---------------------------------------------------------------------- hud

  hud(): SimHud {
    const def = TITANS[this.index];
    const boss = this.boss;
    const fighting = this.stage === 'fight' && boss?.alive;
    const actions: SimHud['actions'] = [];

    if (this.stage === 'intro') {
      actions.push({
        id: 'begin',
        label: this.everStarted ? `Challenge ${def.name} (R)` : 'Begin the trial (R)',
      });
    } else if (this.stage === 'break') {
      const next = TITANS[this.index + 1];
      actions.push({ id: 'next', label: next ? `Face ${next.name} (R)` : 'Claim the forge (R)' });
    } else if (this.won) {
      actions.push({ id: 'rematch', label: 'Fight them again (R)' });
    }

    const title = this.won
      ? 'Forge Conquered'
      : this.stage === 'break'
        ? 'Titan Down'
        : this.stage === 'intro'
          ? this.everStarted ? def.name : 'The Forge Gate'
          : def.name;

    const health = boss?.maxHealth ? Math.ceil(boss.health) : 0;
    const maxHealth = boss?.maxHealth ?? 1;
    const pct = boss ? boss.health / maxHealth : 0;
    const rows: SimHud['rows'] = [
      { label: 'Titan', value: `${Math.min(this.index + 1, TITANS.length)} / ${TITANS.length}` },
      {
        label: fighting ? 'Health' : 'Challenge',
        value: fighting ? `${health} / ${boss.maxHealth}` : def.role,
        tone: fighting ? (pct <= 0.33 ? 'bad' : pct <= 0.66 ? 'warn' : 'good') : undefined,
      },
      { label: 'Phase', value: `${this.phase} / 3`, tone: this.phase >= 3 ? 'bad' : this.phase === 2 ? 'warn' : undefined },
      { label: 'Forge', value: `${this.stationUses} upgrades · ${formatCoins(this.game.player.coins)}` },
    ];

    return {
      kicker: 'Titan Trials',
      title,
      rows,
      progress: fighting
        ? { label: def.name, value: Math.max(0, health), max: boss.maxHealth }
        : { label: 'Titans broken', value: this.won ? 3 : this.index, max: 3 },
      actions,
      footer: this.lastResult,
    };
  }

  // -------------------------------------------------------------- interaction

  interactBlock(key: string): boolean {
    if (key === TITAN_STATIONS.anvil.key) {
      this.useAnvil();
      return true;
    }
    if (key === TITAN_STATIONS.hearth.key) {
      this.useHearth();
      return true;
    }
    if (key === TITAN_STATIONS.obelisk.key) {
      this.useObelisk();
      return true;
    }
    return false;
  }

  interactEntity(): boolean {
    return false;
  }

  hintForBlock(key: string): string | null {
    if (key === TITAN_STATIONS.anvil.key) {
      return this.anvilSword
        ? `<b>Forge Anvil</b> · 32 arrows · ${ANVIL_ARROW_COST}c`
        : `<b>Forge Anvil</b> · Diamond Sword · ${ANVIL_SWORD_COST}c`;
    }
    if (key === TITAN_STATIONS.hearth.key) {
      return `<b>Trial Hearth</b> · Full heal + 2 golden apples · ${HEARTH_COST}c`;
    }
    if (key === TITAN_STATIONS.obelisk.key) {
      if (!this.obeliskHeart) return `<b>Titan Obelisk</b> · Titan Heart, +6 max HP · ${OBELISK_HEART_COST}c`;
      if (!this.obeliskSwift) return `<b>Titan Obelisk</b> · Swiftstep, +8% speed · ${OBELISK_SWIFT_COST}c`;
      return `<b>Titan Obelisk</b> · Golden apple · ${OBELISK_APPLE_COST}c`;
    }
    return null;
  }

  hintForEntity(entity: GameEntity): string | null {
    if (this.boss && entity.id === this.boss.id) {
      const def = TITANS[this.index];
      return `<b>${def.name}</b> · ${def.role} · Phase ${this.phase} · ${Math.ceil(entity.health)} / ${entity.maxHealth} HP`;
    }
    const add = this.adds.find((entry) => entry.entity.id === entity.id);
    if (add) return `<b>${entity.role}</b> · ${Math.ceil(entity.health)} / ${entity.maxHealth} HP`;
    return null;
  }

  onBlockBroken(): boolean {
    return false;
  }

  onRespawn(): void {
    if (this.won) return;
    this.stopFight();
    const def = TITANS[this.index];
    this.game.hud.showWaveBanner('Titan Trials', 'The Forge Remembers', `${def.name} waits at the seal`, 3.6);
    this.game.toast(`You died. ${def.name} still holds the seal.`, 'warn');
    this.lastResult = `Challenge ${def.name} again when you are ready.`;
  }

  action(id: string): void {
    if (id === 'begin') {
      if (this.stage === 'intro') this.beginFight();
      return;
    }
    if (id === 'next') {
      if (this.stage !== 'break') return;
      this.index = Math.min(this.index + 1, TITANS.length - 1);
      this.beginFight();
      return;
    }
    if (id === 'rematch') this.rematch();
  }

  private rematch(): void {
    if (!this.won) return;
    this.clearFight();
    this.index = 0;
    this.phase = 1;
    this.stage = 'intro';
    this.won = false;
    this.lastResult = 'The seals are cold again. The titans are waiting.';
    this.game.hud.showWaveBanner('Titan Trials', 'The Seals Relight', 'Fight them again', 3.6);
    this.game.toast('The titans rise again. Your forge upgrades remain.', 'warn');
  }

  dispose(): void {
    this.clearFight();
    for (const light of this.lights) {
      this.game.scene.remove(light);
      light.dispose();
    }
    this.lights = [];
    const player = this.game.player;
    player.walkSpeed = this.baseWalk;
    player.sprintSpeed = this.baseSprint;
    player.maxHealth = this.baseMaxHealth;
    player.health = Math.min(player.health, player.maxHealth);
  }

  // ----------------------------------------------------------------- stations

  private useAnvil(): void {
    const player = this.game.player;
    if (!this.anvilSword) {
      if (player.coins < ANVIL_SWORD_COST) {
        this.needCoins(ANVIL_SWORD_COST);
        return;
      }
      player.addCoins(-ANVIL_SWORD_COST);
      giveItem(this.game, 'diamond_sword', 1, player.position);
      this.anvilSword = true;
      this.stationUses += 1;
      this.game.recordSim('defend', 'anvil', 1);
      player.refreshHeldItem();
      this.game.audio.play('craft');
      this.game.toast('Forged a Diamond Sword. The anvil now sells arrows.', 'good');
      this.lastResult = 'The anvil rings. A diamond blade is yours.';
      this.game.particles.sparkle(new THREE.Vector3(TITAN_STATIONS.anvil.x + 0.5, this.floorY + 1.6, TITAN_STATIONS.anvil.z + 0.5), '#ffd27a', 24);
      return;
    }

    if (player.coins < ANVIL_ARROW_COST) {
      this.needCoins(ANVIL_ARROW_COST);
      return;
    }
    player.addCoins(-ANVIL_ARROW_COST);
    giveItem(this.game, 'arrow', 32, player.position);
    this.stationUses += 1;
    this.game.recordSim('defend', 'anvil', 1);
    this.game.audio.play('click', 2);
    this.game.toast('+32 arrows.', 'good');
    this.lastResult = 'Thirty-two arrows off the anvil.';
  }

  private useHearth(): void {
    const player = this.game.player;
    if (player.coins < HEARTH_COST) {
      this.needCoins(HEARTH_COST);
      return;
    }
    player.addCoins(-HEARTH_COST);
    player.health = player.maxHealth;
    giveItem(this.game, 'golden_apple', 2, player.position);
    this.stationUses += 1;
    this.game.recordSim('defend', 'anvil', 1);
    this.game.audio.play('levelup');
    this.game.toast('The hearth restores you. +2 golden apples.', 'good');
    this.lastResult = 'The forge heat closes your wounds.';
    this.game.particles.sparkle(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), '#ffb457', 30);
  }

  private useObelisk(): void {
    const player = this.game.player;
    if (!this.obeliskHeart) {
      if (player.coins < OBELISK_HEART_COST) {
        this.needCoins(OBELISK_HEART_COST);
        return;
      }
      player.addCoins(-OBELISK_HEART_COST);
      player.raiseMaxHealth(6);
      this.obeliskHeart = true;
      this.stationUses += 1;
      this.game.recordSim('defend', 'anvil', 1);
      this.game.audio.play('levelup');
      this.game.toast('Titan Heart: +6 max health.', 'good');
      this.lastResult = 'The obelisk burns a heart into your chest.';
    } else if (!this.obeliskSwift) {
      if (player.coins < OBELISK_SWIFT_COST) {
        this.needCoins(OBELISK_SWIFT_COST);
        return;
      }
      player.addCoins(-OBELISK_SWIFT_COST);
      this.obeliskSwift = true;
      this.stationUses += 1;
      this.game.recordSim('defend', 'anvil', 1);
      this.applyChill();
      this.game.audio.play('levelup');
      this.game.toast('Swiftstep: +8% movement speed.', 'good');
      this.lastResult = 'The obelisk lightens your step.';
    } else {
      if (player.coins < OBELISK_APPLE_COST) {
        this.needCoins(OBELISK_APPLE_COST);
        return;
      }
      player.addCoins(-OBELISK_APPLE_COST);
      giveItem(this.game, 'golden_apple', 1, player.position);
      this.stationUses += 1;
      this.game.recordSim('defend', 'anvil', 1);
      this.game.audio.play('pickup');
      this.game.toast('+1 golden apple.', 'good');
      this.lastResult = 'A golden apple from the obelisk.';
    }
    this.game.particles.sparkle(new THREE.Vector3(TITAN_STATIONS.obelisk.x + 0.5, this.floorY + 1.7, TITAN_STATIONS.obelisk.z + 0.5), '#b48cff', 26);
  }

  private needCoins(cost: number): void {
    this.game.toast(`Not enough coins. That costs ${cost}c.`, 'warn');
  }
}
