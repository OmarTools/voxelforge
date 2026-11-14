import * as THREE from 'three';
import type { Game } from './Game';
import { block } from '../world/Blocks';

const DUST_BY_SOUND: Record<string, string> = {
  grass: '#93b56a',
  plant: '#8fae66',
  sand: '#e2d29b',
  gravel: '#9a938c',
  stone: '#b0aca4',
  wood: '#b98e5b',
  glass: '#d6e9f2',
  metal: '#c8d2da',
  snow: '#eef6ff',
};

const FALLBACK_DUST = '#b9b3a6';

/**
 * Local atmosphere: fireflies on clear nights, lazy daytime dust, weather
 * motes near the camera, and the little puffs the player kicks up when
 * walking, landing or hitting water. Sim-specific FX (storm wisps, siege
 * embers) live inside the simulations that own those landmarks.
 */
export class AmbientFX {
  private fireflyTimer = 0;
  private moteTimer = 0;
  private weatherTimer = 0;
  private readonly spot = new THREE.Vector3();

  constructor(private readonly game: Game) {}

  update(dt: number): void {
    const game = this.game;
    const player = game.player;
    if (!player || player.health <= 0) return;

    const night = game.sky.nightFactor;
    const weather = game.sky.weather;

    if (night > 0.4 && weather !== 'rain' && weather !== 'snow' && weather !== 'ash'
      && game.world.getSkyLight(player.position.x, player.position.y + 1, player.position.z) >= 14) {
      this.fireflyTimer += dt * night * 6.5;
      while (this.fireflyTimer >= 1) {
        this.fireflyTimer -= 1;
        this.spawnFirefly(night);
      }
    } else {
      this.fireflyTimer = 0;
    }

    if (night < 0.4 && weather !== 'ash') {
      this.moteTimer += dt * 2.1;
      while (this.moteTimer >= 1) {
        this.moteTimer -= 1;
        this.spawnDustMote();
      }
    } else {
      this.moteTimer = 0;
    }

    if (weather === 'ash') {
      this.weatherTimer += dt * 13;
      while (this.weatherTimer >= 1) {
        this.weatherTimer -= 1;
        this.spawnWeatherMote('#ff9a55', 0.16);
      }
    } else if (weather === 'snow') {
      this.weatherTimer += dt * 7;
      while (this.weatherTimer >= 1) {
        this.weatherTimer -= 1;
        this.spawnWeatherMote('#eaf6ff', 0);
      }
    } else {
      this.weatherTimer = 0;
    }
  }

  onStep(key: string): void {
    const player = this.game.player;
    if (!player) return;
    this.spot.copy(player.position);
    this.spot.y += 0.08;
    this.game.particles.dust(this.spot, this.dustColor(key), 3);
  }

  onLand(impact: number, key: string): void {
    const player = this.game.player;
    if (!player) return;
    const color = this.dustColor(key);
    this.spot.copy(player.position);
    this.spot.y += 0.1;
    const count = Math.max(4, Math.min(16, Math.round(impact * 0.9)));
    this.game.particles.dust(this.spot, color, count);
    if (impact > 9) {
      this.game.particles.burst(this.spot, color, 6, {
        speed: 1.7, life: 0.55, size: 0.12, gravity: 6, spread: 0.55,
      });
    }
  }

  onSplash(): void {
    const player = this.game.player;
    if (!player) return;
    this.spot.copy(player.position);
    this.spot.y += 0.2;
    this.game.particles.burst(this.spot, '#9fd8ff', 14, {
      speed: 2.6, life: 0.75, size: 0.09, gravity: 9, spread: 0.55, glow: true,
    });
    this.game.particles.burst(this.spot, '#e8f7ff', 6, {
      speed: 1.4, life: 0.9, size: 0.07, gravity: 2.5, spread: 0.4, glow: true,
    });
  }

  private spawnFirefly(night: number): void {
    const player = this.game.player;
    const angle = Math.random() * Math.PI * 2;
    const distance = 2.5 + Math.random() * 9;
    this.spot.set(
      player.position.x + Math.cos(angle) * distance,
      player.position.y + 0.3 + Math.random() * 2.4,
      player.position.z + Math.sin(angle) * distance,
    );
    this.game.particles.burst(this.spot, Math.random() < 0.35 ? '#b6ff7a' : '#ffe987', 1, {
      speed: 0.18, life: 2.6 + night, size: 0.055, gravity: -0.06,
      drag: 0.99, glow: true, spread: 0.3, upward: 0.1,
    });
  }

  private spawnDustMote(): void {
    const player = this.game.player;
    const angle = Math.random() * Math.PI * 2;
    const distance = 1.5 + Math.random() * 7;
    this.spot.set(
      player.position.x + Math.cos(angle) * distance,
      player.position.y + 0.6 + Math.random() * 3.4,
      player.position.z + Math.sin(angle) * distance,
    );
    this.game.particles.ambientMote(this.spot, '#fff6da');
  }

  private spawnWeatherMote(color: string, glowChance: number): void {
    const camera = this.game.camera.position;
    const angle = Math.random() * Math.PI * 2;
    const distance = 2 + Math.random() * 12;
    this.spot.set(
      camera.x + Math.cos(angle) * distance,
      camera.y + 1.5 + Math.random() * 6,
      camera.z + Math.sin(angle) * distance,
    );
    const glow = Math.random() < glowChance;
    this.game.particles.burst(this.spot, color, 1, {
      speed: 0.3, life: 1.8 + Math.random(), size: glow ? 0.07 : 0.05,
      gravity: 0.55, drag: 0.985, glow, spread: 0.35, upward: 0,
    });
  }

  private dustColor(key: string): string {
    if (!key || key === 'air') return FALLBACK_DUST;
    return DUST_BY_SOUND[block(key).sound] ?? FALLBACK_DUST;
  }
}
