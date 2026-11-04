import * as THREE from 'three';
import { buildKartModel, type KartVisual } from './Karts';
import type { AudioSystem } from '../core/Audio';
import type { Player } from './Player';

/**
 * Sunset Circuit race director: grid, countdown, AI opponents, gates, laps,
 * lap timing and live standings. The player's own kart is owned by Player;
 * this system only drives the opponents and the race state.
 */

export interface RaceConfig {
  laps: number;
  rx: number;
  rz: number;
  startAngle: number;
  gateRadius?: number;
  baseY: number;
}

export interface RaceHudState {
  state: 'countdown' | 'racing' | 'finished';
  lap: number;
  laps: number;
  position: number;
  total: number;
  time: number;
  lastLap: number | null;
  bestLap: number | null;
  speed: number;
  countdown: number;
  wrongWay: boolean;
  finishPosition: number;
  finishTime: number;
}

export interface RaceHooks {
  banner: (kicker: string, big: string, sub: string, duration?: number) => void;
  toast: (message: string, kind?: 'info' | 'good' | 'warn' | 'bad') => void;
  onFinish: (position: number, time: number) => void;
}

interface AiRacer {
  name: string;
  color: string;
  theta: number;
  lane: number;
  baseSpeed: number;
  speed: number;
  lap: number;
  nextGate: number;
  finished: boolean;
  finishTime: number;
  kart: KartVisual;
  root: THREE.Group;
}

interface PlayerRacer {
  lap: number;
  nextGate: number;
  finished: boolean;
  finishTime: number;
  lastLap: number | null;
  bestLap: number | null;
}

const GATE_COUNT = 16;
const AI_COLORS: Array<{ name: string; body: string; accent: string; suit: string; helmet: string }> = [
  { name: 'Vega', body: '#3c7fd4', accent: '#f2c94c', suit: '#2f5fa6', helmet: '#f2c94c' },
  { name: 'Rook', body: '#6bbf59', accent: '#1f3a24', suit: '#3f7a35', helmet: '#e8eef1' },
  { name: 'Mira', body: '#b05fd4', accent: '#f5d76e', suit: '#6f3a86', helmet: '#f0f4f6' },
  { name: 'Dax', body: '#e8a33c', accent: '#2a2f35', suit: '#a86f22', helmet: '#2a2f35' },
  { name: 'Kilo', body: '#4fc7c1', accent: '#1c3d3b', suit: '#2a7a76', helmet: '#e8eef1' },
];

export class RaceSystem {
  readonly group = new THREE.Group();
  readonly config: RaceConfig;
  state: 'countdown' | 'racing' | 'finished' = 'countdown';
  private timer = 4.0;
  private raceTime = 0;
  private lapStart = 0;
  private lastCountdown = 0;
  private gates: THREE.Vector3[] = [];
  private ai: AiRacer[] = [];
  private player: PlayerRacer = { lap: 0, nextGate: 0, finished: false, finishTime: 0, lastLap: null, bestLap: null };
  private hooks: RaceHooks;
  private playerEntity: Player;
  private audio: AudioSystem;
  private wrongWayTimer = 0;
  private finishPosition = 0;
  private finishTime = 0;
  private finishedAt = -1;

  constructor(scene: THREE.Scene, player: Player, audio: AudioSystem, config: RaceConfig, hooks: RaceHooks) {
    this.config = config;
    this.playerEntity = player;
    this.audio = audio;
    this.hooks = hooks;
    this.group.name = 'race';
    this.buildGates();
    this.buildGateMarkers();
    this.buildGrid();
    scene.add(this.group);
  }

  get controlsLocked(): boolean {
    return this.state === 'countdown';
  }

  get active(): boolean {
    return this.state !== 'finished' || this.finishedAt < 0;
  }

  private buildGates(): void {
    const { rx, rz, startAngle } = this.config;
    for (let i = 0; i < GATE_COUNT; i++) {
      const a = startAngle + (i / GATE_COUNT) * Math.PI * 2;
      this.gates.push(new THREE.Vector3(Math.cos(a) * rx, this.config.baseY + 1, Math.sin(a) * rz));
    }
  }

  /** Voxel gate posts + a glowing strip so the 16 checkpoints are readable. */
  private buildGateMarkers(): void {
    const { rx, rz } = this.config;
    const post = new THREE.MeshLambertMaterial({ color: 0xeef4f8, emissive: 0x1a2830 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x20272e });
    const neon = new THREE.MeshBasicMaterial({ color: 0x58d8ff });
    const startNeon = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const gateStrip = new THREE.BoxGeometry(9.4, 0.05, 0.5);
    const postBox = new THREE.BoxGeometry(0.45, 2.8, 0.45);
    const capBox = new THREE.BoxGeometry(0.5, 0.14, 0.5);
    const checkerBox = new THREE.BoxGeometry(0.46, 0.7, 0.46);

    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      const a = this.config.startAngle + (i / GATE_COUNT) * Math.PI * 2;
      const normal = new THREE.Vector3(Math.cos(a) / rx, 0, Math.sin(a) / rz).normalize();
      const yaw = Math.atan2(-normal.z, normal.x);
      const isStart = i === 0;

      for (const side of [-1, 1]) {
        const px = gate.x + normal.x * 5.2 * side;
        const pz = gate.z + normal.z * 5.2 * side;
        if (isStart) {
          // Chequered start posts.
          for (let s = 0; s < 4; s++) {
            const block = new THREE.Mesh(checkerBox, s % 2 === 0 ? post : dark);
            block.position.set(px, gate.y - 0.65 + s * 0.7, pz);
            this.group.add(block);
          }
        } else {
          const pillar = new THREE.Mesh(postBox, i % 2 === 0 ? post : dark);
          pillar.position.set(px, gate.y + 0.4, pz);
          this.group.add(pillar);
        }
        const cap = new THREE.Mesh(capBox, isStart ? startNeon : neon);
        cap.position.set(px, gate.y + 1.88, pz);
        this.group.add(cap);
      }

      const strip = new THREE.Mesh(gateStrip, isStart ? startNeon : neon);
      strip.position.set(gate.x, gate.y - 0.96, gate.z);
      strip.rotation.y = yaw;
      this.group.add(strip);
    }
  }

  private gridPoint(theta: number, lane: number): THREE.Vector3 {
    const { rx, rz } = this.config;
    const px = Math.cos(theta) * rx;
    const pz = Math.sin(theta) * rz;
    // Outward normal of the ellipse.
    const nx = Math.cos(theta) / rx;
    const nz = Math.sin(theta) / rz;
    const len = Math.hypot(nx, nz) || 1;
    return new THREE.Vector3(px + (nx / len) * lane, this.config.baseY + 1, pz + (nz / len) * lane);
  }

  private buildGrid(): void {
    const start = this.config.startAngle;
    const lanes = [-1.9, 1.9, -1.9, 1.9, 0];
    for (let i = 0; i < AI_COLORS.length; i++) {
      const theta = start - 0.2 - i * 0.075;
      const lane = lanes[i] ?? 0;
      const point = this.gridPoint(theta, lane);
      const style = AI_COLORS[i];
      const kart = buildKartModel({
        body: style.body,
        accent: style.accent,
        suit: style.suit,
        helmet: style.helmet,
      });
      kart.root.position.copy(point);
      const tangent = new THREE.Vector3(-Math.sin(theta) * this.config.rx, 0, Math.cos(theta) * this.config.rz).normalize();
      kart.root.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      this.group.add(kart.root);
      this.ai.push({
        name: style.name,
        color: style.body,
        theta,
        lane,
        baseSpeed: 17.5 + i * 0.45,
        speed: 0,
        lap: 0,
        nextGate: 0,
        finished: false,
        finishTime: 0,
        kart,
        root: kart.root,
      });
    }
  }

  update(dt: number): void {
    if (this.state === 'countdown') {
      this.timer -= dt;
      const step = Math.ceil(this.timer - 1);
      if (this.timer > 1) {
        if (step !== this.lastCountdown) {
          this.lastCountdown = step;
          this.hooks.banner('Sunset Circuit', String(Math.max(1, step)), 'Hold the throttle', 0.9);
          this.audio.play('click');
        }
      } else if (this.timer > 0) {
        if (this.lastCountdown !== 0) {
          this.lastCountdown = 0;
          this.hooks.banner('Sunset Circuit', 'GO!', 'Three laps — make them count', 1.1);
          this.audio.play('levelup');
        }
      } else {
        this.state = 'racing';
        this.raceTime = 0;
        this.lapStart = 0;
      }
      this.syncPlayerKart();
      return;
    }

    if (this.state === 'racing') this.raceTime += dt;
    this.updateAi(dt);
    this.trackPlayer(dt);
    this.checkPlayerFinish();

    if (this.state === 'finished') {
      this.finishedAt = Math.max(0, this.finishedAt + dt);
    }
  }

  private trackPlayer(dt: number): void {
    const p = this.player;
    if (p.finished) return;
    const gate = this.gates[p.nextGate];
    const dx = gate.x - this.playerEntity.position.x;
    const dz = gate.z - this.playerEntity.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (this.config.gateRadius ?? 6.2)) {
      this.passGate(p, this.playerEntity);
    }
    // Wrong-way detector: are we driving away from the next gate?
    if (Math.abs(this.playerEntity.vehicleSpeed) > 4 && this.state === 'racing') {
      const heading = this.playerEntity.flatForward;
      const dot = (heading.x * dx + heading.z * dz) / Math.max(1, dist);
      this.wrongWayTimer = dot < -0.35 ? this.wrongWayTimer + dt : 0;
    } else {
      this.wrongWayTimer = 0;
    }
  }

  private passGate(p: PlayerRacer, player: Player): void {
    const passed = p.nextGate;
    p.nextGate = (p.nextGate + 1) % GATE_COUNT;
    if (passed !== 0) return;
    if (p.lap === 0) {
      p.lap = 1;
      this.lapStart = this.raceTime;
      this.hooks.toast('Lap 1 — green light.', 'good');
      return;
    }
    const lapTime = this.raceTime - this.lapStart;
    p.lastLap = lapTime;
    p.bestLap = p.bestLap === null ? lapTime : Math.min(p.bestLap, lapTime);
    this.lapStart = this.raceTime;
    if (p.lap >= this.config.laps) {
      p.finished = true;
      p.finishTime = this.raceTime;
      this.finishTime = this.raceTime;
      this.state = 'finished';
      this.finishedAt = 0;
      this.finishPosition = this.positionOf(true);
      this.playerEntity.vehicleSpeed = Math.max(0, this.playerEntity.vehicleSpeed * 0.3);
      this.hooks.banner('Finish', `P${this.finishPosition}`, this.formatTime(this.raceTime), 4.2);
      this.audio.play('levelup');
      this.hooks.toast(`Race complete — ${this.formatTime(this.raceTime)}`, 'good');
      this.hooks.onFinish(this.finishPosition, this.raceTime);
      return;
    }
    p.lap += 1;
    this.hooks.banner('Lap', `${p.lap} / ${this.config.laps}`, `Last ${this.formatTime(lapTime)}`, 1.8);
    this.audio.play('checkpoint');
    void player;
  }

  private updateAi(dt: number): void {
    const playerProgress = this.playerProgress();
    for (const racer of this.ai) {
      if (racer.finished) {
        racer.speed = Math.max(0, racer.speed - dt * 4);
      } else {
        // Cornering + gentle rubber banding keeps the pack together.
        const corner = Math.abs(Math.cos(racer.theta));
        const target = racer.baseSpeed * (1 - 0.24 * corner);
        const aiProgress = racer.lap * GATE_COUNT + racer.nextGate;
        const gap = playerProgress - aiProgress;
        const rubber = gap > 2 ? 1.1 : gap < -3 ? -1.2 : 0;
        racer.speed += (Math.max(12, target + rubber) - racer.speed) * Math.min(1, dt * 1.8);
      }
      if (this.state === 'countdown') racer.speed = 0;
      const { rx, rz } = this.config;
      const radius = Math.hypot(rx * Math.sin(racer.theta), rz * Math.cos(racer.theta));
      racer.theta += (racer.speed / Math.max(6, radius)) * dt;
      const point = this.gridPoint(racer.theta, racer.lane + Math.sin(racer.theta * 2.3) * 0.35);
      racer.root.position.lerp(point, Math.min(1, dt * 12));
      const tangent = new THREE.Vector3(-Math.sin(racer.theta) * rx, 0, Math.cos(racer.theta) * rz).normalize();
      const targetYaw = Math.atan2(-tangent.x, -tangent.z);
      racer.root.rotation.y = this.lerpAngle(racer.root.rotation.y, targetYaw, Math.min(1, dt * 8));
      const steer = Math.cos(racer.theta) * 0.32;
      for (const wheel of racer.kart.frontWheels) wheel.rotation.y = steer;
      for (const wheel of racer.kart.wheels) wheel.rotation.x -= racer.speed * dt * 2.6;
      racer.root.rotation.z = -steer * 0.14;
      for (const light of racer.kart.brakeLights) light.scale.y = racer.speed < 6 ? 1.6 : 1;
      for (const flame of racer.kart.flames) flame.visible = racer.speed > racer.baseSpeed * 1.02;

      // Lap gates for the AI.
      if (racer.lap > 0 && !racer.finished) {
        const gate = this.gates[racer.nextGate];
        if (Math.hypot(gate.x - racer.root.position.x, gate.z - racer.root.position.z) < (this.config.gateRadius ?? 6.2)) {
          const passed = racer.nextGate;
          racer.nextGate = (racer.nextGate + 1) % GATE_COUNT;
          if (passed === 0) {
            if (racer.lap >= this.config.laps) {
              racer.finished = true;
              racer.finishTime = this.raceTime;
            } else {
              racer.lap += 1;
            }
          }
        }
      } else if (racer.lap === 0 && !racer.finished) {
        const gate = this.gates[0];
        if (Math.hypot(gate.x - racer.root.position.x, gate.z - racer.root.position.z) < (this.config.gateRadius ?? 6.2)) {
          racer.lap = 1;
          racer.nextGate = 1;
        }
      }
    }
  }

  private syncPlayerKart(): void {
    // Face the player down the straight during the countdown.
    void this.playerEntity;
  }

  private checkPlayerFinish(): void {
    if (this.state !== 'finished' || this.finishedAt < 4.5) return;
    // Game handles the victory screen; this only becomes true once.
    this.finishedAt = -1;
  }

  private playerProgress(): number {
    const p = this.player;
    const gate = this.gates[p.nextGate];
    const dist = Math.hypot(gate.x - this.playerEntity.position.x, gate.z - this.playerEntity.position.z);
    return p.lap * GATE_COUNT + p.nextGate + (1 - Math.min(1, dist / 24));
  }

  private positionOf(player: boolean): number {
    const entries: Array<{ player: boolean; progress: number; finished: boolean; finishTime: number }> = [
      { player: true, progress: this.playerProgress(), finished: this.player.finished, finishTime: this.player.finishTime },
    ];
    for (const racer of this.ai) {
      entries.push({
        player: false,
        progress: racer.lap * GATE_COUNT + racer.nextGate + (1 - Math.min(1, this.gateDistance(racer) / 24)),
        finished: racer.finished,
        finishTime: racer.finishTime,
      });
    }
    entries.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    const index = entries.findIndex((entry) => entry.player === player);
    return index < 0 ? entries.length : index + 1;
  }

  private gateDistance(racer: AiRacer): number {
    const gate = this.gates[racer.nextGate];
    return Math.hypot(gate.x - racer.root.position.x, gate.z - racer.root.position.z);
  }

  hud(): RaceHudState {
    const now = this.state === 'countdown' ? 0 : this.raceTime;
    return {
      state: this.state,
      lap: Math.max(1, this.player.lap),
      laps: this.config.laps,
      position: this.state === 'finished' ? this.finishPosition : this.positionOf(true),
      total: this.ai.length + 1,
      time: this.state === 'finished' ? this.finishTime : now,
      lastLap: this.player.lastLap,
      bestLap: this.player.bestLap,
      speed: Math.abs(this.playerEntity.vehicleSpeed) * 3.6,
      countdown: Math.max(0, this.timer),
      wrongWay: this.wrongWayTimer > 0.8,
      finishPosition: this.finishPosition,
      finishTime: this.finishTime,
    };
  }

  standings(): Array<{ name: string; color: string; lap: number; player: boolean }> {
    const entries = [
      { name: 'You', color: '#e8552f', lap: this.player.lap, progress: this.playerProgress(), player: true, finished: this.player.finished, finishTime: this.player.finishTime },
      ...this.ai.map((r) => ({
        name: r.name,
        color: r.color,
        lap: r.lap,
        progress: r.lap * GATE_COUNT + r.nextGate + (1 - Math.min(1, this.gateDistance(r) / 24)),
        player: false,
        finished: r.finished,
        finishTime: r.finishTime,
      })),
    ];
    entries.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    return entries.map((e) => ({ name: e.name, color: e.color, lap: e.lap, player: e.player }));
  }

  get isFinished(): boolean {
    return this.state === 'finished';
  }

  get finishedSeconds(): number {
    return this.finishedAt;
  }

  private lerpAngle(from: number, to: number, t: number): number {
    let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * t;
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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
  }
}
