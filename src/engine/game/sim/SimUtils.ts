import * as THREE from 'three';
import type { Game } from '../Game';
import { blockById } from '../../world/Blocks';

export interface BlockPos {
  x: number;
  y: number;
  z: number;
}

/** Scan a bounded volume for the fixture blocks a simulation cares about. */
export function scanBlocks(game: Game, keys: string[], radius = 58, height = 22): Map<string, BlockPos[]> {
  const found = new Map<string, BlockPos[]>();
  for (const key of keys) found.set(key, []);
  const keySet = new Set(keys);
  const origin = game.player?.position ?? new THREE.Vector3();
  const cx = Math.floor(origin.x);
  const cz = Math.floor(origin.z);
  const baseY = game.baseY;
  for (let y = baseY - 2; y <= baseY + height; y++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const def = blockById(game.world.getBlock(x, y, z));
        if (!def || !keySet.has(def.key)) continue;
        found.get(def.key)!.push({ x, y, z });
      }
    }
  }
  return found;
}

export function blockCenter(pos: BlockPos): THREE.Vector3 {
  return new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
}

export function nearestBlock(game: Game, blocks: BlockPos[], maxDistance = 5.5): BlockPos | null {
  const eye = game.player.eyePosition;
  let best: BlockPos | null = null;
  let bestDistance = maxDistance;
  for (const block of blocks) {
    const distance = eye.distanceTo(blockCenter(block));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = block;
    }
  }
  return best;
}

export function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function formatCoins(value: number): string {
  return `${Math.max(0, Math.round(value))}c`;
}

export function giveItem(game: Game, item: string, count: number, position?: THREE.Vector3): number {
  const leftover = game.player.inventory.add(item, count);
  if (leftover > 0 && position) {
    game.entities.spawnDrop(item, leftover, position.clone());
  }
  return leftover;
}
