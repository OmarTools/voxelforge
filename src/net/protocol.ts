/**
 * Shared multiplayer wire format.
 *
 * The first online slice uses JSON text frames so rooms and protocol traffic can
 * be inspected without a decoder. The message shapes are intentionally close to
 * the binary plan in docs/multiplayer.md; switching the transport to binary
 * later should not change the session logic.
 */
import type { WorldRules } from '../content/Templates';
import type { EditRecord } from '../engine/world/VoxelWorld';

export const NET_PROTOCOL_VERSION = 1;
export const NET_CLIENT_VERSION = '0.1.0';
export const NET_MAX_PLAYERS = 8;
export const NET_MAX_NAME = 20;
export const NET_MAX_CHAT = 180;
export const NET_MAX_EDITS = 200_000;

export type NetVec3 = [number, number, number];

/** What a server offers. `rooms` is invite-by-code, `open` is one shared world. */
export type NetMode = 'rooms' | 'open';

export interface NetOpenWorldInfo {
  templateKey: string;
  templateName: string;
  players: number;
  edits: number;
}

export interface NetServerHello {
  t: 'hello';
  protocol: number;
  version: string;
  playerId: string;
  serverTime: number;
  modes: NetMode[];
  openWorld: NetOpenWorldInfo | null;
}

export interface NetWorld {
  templateKey: string;
  templateName: string;
  seed: number;
  baseY: number;
  skyTime: number;
  rules: WorldRules;
  spawn: NetVec3;
  edits: EditRecord[];
}

export interface NetRoomSettings {
  pvp: boolean;
  friendlyFire: boolean;
  keepInventory: boolean;
  difficulty: 'normal' | 'hard';
  maxPlayers: number;
}

export interface NetPlayerState {
  id: string;
  name: string;
  host: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  moving: boolean;
}

export interface NetRoomInfo {
  code: string;
  hostId: string;
  templateKey: string;
  templateName: string;
  createdAt: number;
  settings: NetRoomSettings;
}

export interface NetWelcome {
  room: NetRoomInfo;
  you: { id: string; name: string; host: boolean; spawn: NetVec3; yaw: number };
  world: NetWorld;
  players: NetPlayerState[];
}

export interface NetChatMessage {
  from: string;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export type NetClientMessage =
  | { t: 'hello'; protocol: number; name: string; version: string }
  | { t: 'create_room'; name: string; world: NetWorld; settings: Partial<NetRoomSettings> }
  | { t: 'join_room'; name: string; code: string }
  | { t: 'join_open'; name: string; world?: NetWorld; settings?: Partial<NetRoomSettings> }
  | { t: 'input'; seq: number; x: number; y: number; z: number; yaw: number; pitch: number; moving: boolean }
  | { t: 'block'; x: number; y: number; z: number; id: number }
  | { t: 'chat'; text: string }
  | { t: 'settings'; patch: Partial<NetRoomSettings> }
  | { t: 'kick'; playerId: string }
  | { t: 'leave' }
  | { t: 'ping'; at: number };

export type NetServerMessage =
  | NetServerHello
  | ({ t: 'room_joined' } & NetWelcome)
  | { t: 'player_joined'; player: NetPlayerState }
  | { t: 'player_left'; playerId: string; name: string }
  | { t: 'snapshot'; tick: number; players: NetPlayerState[] }
  | { t: 'block'; x: number; y: number; z: number; id: number; from: string }
  | ({ t: 'chat' } & NetChatMessage)
  | { t: 'settings'; settings: NetRoomSettings; by: string }
  | { t: 'host_changed'; hostId: string; name: string }
  | { t: 'room_closed'; reason: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong'; at: number; serverTime: number };

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeName(input: string, fallback = 'Wanderer'): string {
  const clean = input.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, NET_MAX_NAME);
}

export function sanitizeChat(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NET_MAX_CHAT);
}
