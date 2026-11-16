/**
 * Browser WebSocket client for the VoxelForge multiplayer server.
 *
 * Phase 1 deliberately keeps the transport tiny: JSON text frames, one socket
 * per session, no reconnect loop. The server owns the room and the world
 * descriptor; this client only relays presence, movement, chat and block edits.
 */
import {
  NET_CLIENT_VERSION,
  NET_PROTOCOL_VERSION,
  normalizeName,
  normalizeRoomCode,
  type NetChatMessage,
  type NetClientMessage,
  type NetMode,
  type NetOpenAccess,
  type NetOpenWorldInfo,
  type NetPlayerState,
  type NetRoomInfo,
  type NetRoomSettings,
  type NetServerMessage,
  type NetVec3,
  type NetWelcome,
  type NetWorld,
} from './protocol';

export interface NetHandlers {
  onRoomJoined?: (welcome: NetWelcome) => void;
  onPlayerJoined?: (player: NetPlayerState) => void;
  onPlayerLeft?: (playerId: string, name: string) => void;
  onSnapshot?: (players: NetPlayerState[], tick: number) => void;
  onBlock?: (x: number, y: number, z: number, id: number, from: string) => void;
  onChat?: (message: NetChatMessage) => void;
  onSettings?: (settings: NetRoomSettings, by: string) => void;
  onHostChanged?: (hostId: string, name: string) => void;
  onTime?: (value: number) => void;
  onOp?: (op: boolean, by: string) => void;
  onRoomClosed?: (reason: string) => void;
  onError?: (code: string, message: string) => void;
  onClosed?: (reason: string, intentional: boolean) => void;
}

/** Turn a configured http(s) origin or bare host into a WebSocket URL. */
export function resolveServerUrl(raw: string): string {
  let value = raw.trim();
  if (!value) return '';
  if (value.startsWith('http://')) value = `ws://${value.slice(7)}`;
  else if (value.startsWith('https://')) value = `wss://${value.slice(8)}`;
  else if (!value.startsWith('ws://') && !value.startsWith('wss://')) value = `ws://${value}`;
  return value.replace(/\/+$/, '');
}

export class NetClient {
  readonly url: string;
  handlers: NetHandlers = {};
  playerId = '';
  room: NetRoomInfo | null = null;
  latency = 0;
  online = false;
  /** Capabilities reported by the server's hello. Empty until connected. */
  modes: NetMode[] = [];
  /** Summary of the server's shared world, or null when it has none yet. */
  openWorld: NetOpenWorldInfo | null = null;
  /** Whether the shared world needs a password and/or an allowlisted name. */
  openAccess: NetOpenAccess = { locked: false, private: false };
  /** True when the server accepts an operator token. */
  adminAllowed = false;

  private socket: WebSocket | null = null;
  private helloDone = false;
  private leaving = false;
  private name = 'Wanderer';
  private seq = 0;
  private pingTimer?: number;
  private pingSentAt = 0;
  private pendingHello?: { resolve: () => void; reject: (error: Error) => void; timer: number };
  private pendingJoin?: { resolve: (welcome: NetWelcome) => void; reject: (error: Error) => void; timer: number };
  private pendingCheck?: { resolve: () => void; reject: (error: Error) => void; timer: number };
  private pendingInfo?: { resolve: () => void; timer: number };

  constructor(url: string) {
    this.url = resolveServerUrl(url);
  }

  get connected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN && this.helloDone;
  }

  async connect(name: string): Promise<void> {
    this.name = normalizeName(name);
    if (this.connected) return;
    if (this.socket) this.close();

    const socket = new WebSocket(this.url);
    this.socket = socket;
    this.helloDone = false;
    this.leaving = false;

    const hello = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingHello = undefined;
        socket.close();
        reject(new Error(`Could not reach ${this.url}. Start the multiplayer server with "npm run server".`));
      }, 8000);
      this.pendingHello = { resolve, reject, timer };
    });

    socket.addEventListener('open', () => {
      this.send({ t: 'hello', protocol: NET_PROTOCOL_VERSION, name: this.name, version: NET_CLIENT_VERSION });
    });
    socket.addEventListener('message', (event) => this.handleRaw(event.data));
    socket.addEventListener('error', () => {
      // The close handler carries the user-facing message.
    });
    socket.addEventListener('close', (event) => {
      const wasIntentional = this.leaving;
      this.online = false;
      this.helloDone = false;
      this.modes = [];
      this.openWorld = null;
      this.openAccess = { locked: false, private: false };
      this.adminAllowed = false;
      this.stopPing();
      this.failPending(`Connection closed (${event.code}).`);
      if (this.pendingInfo) {
        clearTimeout(this.pendingInfo.timer);
        this.pendingInfo.resolve();
        this.pendingInfo = undefined;
      }
      this.pendingHello?.reject(new Error('Connection closed before the server said hello.'));
      if (this.pendingHello) {
        clearTimeout(this.pendingHello.timer);
        this.pendingHello = undefined;
      }
      this.handlers.onClosed?.(event.reason || `Connection closed (${event.code}).`, wasIntentional);
    });

    await hello;
    this.online = true;
    this.startPing();
  }

  async joinRoom(code: string, name: string): Promise<NetWelcome> {
    await this.connect(name);
    const normalized = normalizeRoomCode(code);
    if (!normalized) throw new Error('Enter the room code from your invite.');
    return this.awaitJoin({ t: 'join_room', name: normalizeName(name), code: normalized });
  }

  /**
   * Join the server's shared world. Send `world` only when the server has none
   * yet (genesis); afterwards the server's saved descriptor wins.
   */
  async joinOpen(name: string, password = '', world?: NetWorld): Promise<NetWelcome> {
    await this.connect(name);
    return this.awaitJoin({
      t: 'join_open',
      name: normalizeName(name),
      ...(password ? { password } : {}),
      ...(world ? { world } : {}),
    });
  }

  /** Claim operator rights for this session with the server's admin token. */
  claimOp(token: string): void {
    if (!token) return;
    this.send({ t: 'op', token });
  }

  /**
   * Ask the server whether this name/password may enter the shared world
   * without creating or joining it. Lets the lobby reject a bad password
   * before the client spends time generating terrain.
   */
  async checkOpen(name: string, password = ''): Promise<void> {
    await this.connect(name);
    if (this.pendingCheck) this.failCheck('A newer access check replaced this one.');
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingCheck = undefined;
        reject(new Error('The server did not answer the access check.'));
      }, 8000);
      this.pendingCheck = { resolve, reject, timer };
      this.send({ t: 'check_open', name: normalizeName(name), ...(password ? { password } : {}) });
    });
  }

  /** Re-read the server's hello so a reopened lobby sees current capabilities. */
  async refreshInfo(): Promise<void> {
    if (!this.connected) {
      await this.connect(this.name);
      return;
    }
    await new Promise<void>((resolve) => {
      if (this.pendingInfo) clearTimeout(this.pendingInfo.timer);
      const timer = window.setTimeout(() => {
        this.pendingInfo = undefined;
        resolve();
      }, 2500);
      this.pendingInfo = { resolve, timer };
      this.send({ t: 'hello', protocol: NET_PROTOCOL_VERSION, name: this.name, version: NET_CLIENT_VERSION });
    });
  }

  async createRoom(world: NetWorld, name: string, settings: Partial<NetRoomSettings> = {}): Promise<NetWelcome> {
    await this.connect(name);
    return this.awaitJoin({ t: 'create_room', name: normalizeName(name), world, settings });
  }

  private awaitJoin(message: NetClientMessage): Promise<NetWelcome> {
    if (this.pendingJoin) this.failPending('A room request was replaced by a newer one.');
    return new Promise<NetWelcome>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingJoin = undefined;
        reject(new Error('The room request timed out.'));
      }, 12_000);
      this.pendingJoin = { resolve, reject, timer };
      this.send(message);
    });
  }

  sendInput(x: number, y: number, z: number, yaw: number, pitch: number, moving: boolean): void {
    if (!this.connected) return;
    this.send({ t: 'input', seq: ++this.seq, x, y, z, yaw, pitch, moving });
  }

  sendBlock(x: number, y: number, z: number, id: number): void {
    this.send({ t: 'block', x, y, z, id });
  }

  sendChat(text: string): void {
    this.send({ t: 'chat', text });
  }

  updateSettings(patch: Partial<NetRoomSettings>): void {
    this.send({ t: 'settings', patch });
  }

  kick(playerId: string): void {
    this.send({ t: 'kick', playerId });
  }

  /** Leave politely as a guest; the host closes the socket so the room ends. */
  leave(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.send({ t: 'leave' });
    this.close();
  }

  close(): void {
    this.leaving = true;
    this.stopPing();
    this.online = false;
    this.room = null;
    this.modes = [];
    this.openWorld = null;
    this.openAccess = { locked: false, private: false };
    this.adminAllowed = false;
    this.socket?.close(1000, 'left');
    this.socket = null;
    this.helloDone = false;
    this.failPending('Disconnected.');
    if (this.pendingInfo) {
      clearTimeout(this.pendingInfo.timer);
      this.pendingInfo.resolve();
      this.pendingInfo = undefined;
    }
  }

  private send(message: NetClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      /* the close handler reports the real problem */
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingSentAt = performance.now();
    this.send({ t: 'ping', at: this.pingSentAt });
    this.pingTimer = window.setInterval(() => {
      this.pingSentAt = performance.now();
      this.send({ t: 'ping', at: this.pingSentAt });
    }, 4000);
  }

  private stopPing(): void {
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private failPending(reason: string): void {
    const pending = this.pendingJoin;
    if (pending) {
      this.pendingJoin = undefined;
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.failCheck(reason);
  }

  private failCheck(reason: string): void {
    const pending = this.pendingCheck;
    if (!pending) return;
    this.pendingCheck = undefined;
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
  }

  private handleRaw(raw: unknown): void {
    let message: NetServerMessage;
    try {
      message = JSON.parse(String(raw)) as NetServerMessage;
    } catch {
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;
    switch (message.t) {
      case 'hello':
        this.playerId = message.playerId;
        this.modes = Array.isArray(message.modes) ? message.modes : [];
        this.openWorld = message.openWorld ?? null;
        this.openAccess = {
          locked: message.openAccess?.locked === true,
          private: message.openAccess?.private === true,
        };
        this.adminAllowed = message.admin === true;
        this.helloDone = true;
        if (this.pendingHello) {
          clearTimeout(this.pendingHello.timer);
          this.pendingHello.resolve();
          this.pendingHello = undefined;
        }
        if (this.pendingInfo) {
          clearTimeout(this.pendingInfo.timer);
          this.pendingInfo.resolve();
          this.pendingInfo = undefined;
        }
        return;
      case 'room_joined':
        this.room = message.room;
        if (this.pendingJoin) {
          clearTimeout(this.pendingJoin.timer);
          this.pendingJoin.resolve(message);
          this.pendingJoin = undefined;
        }
        this.handlers.onRoomJoined?.(message);
        return;
      case 'player_joined':
        this.handlers.onPlayerJoined?.(message.player);
        return;
      case 'player_left':
        this.handlers.onPlayerLeft?.(message.playerId, message.name);
        return;
      case 'snapshot':
        this.handlers.onSnapshot?.(message.players, message.tick);
        return;
      case 'block':
        this.handlers.onBlock?.(message.x, message.y, message.z, message.id, message.from);
        return;
      case 'chat':
        this.handlers.onChat?.(message);
        return;
      case 'settings':
        this.handlers.onSettings?.(message.settings, message.by);
        return;
      case 'host_changed':
        this.handlers.onHostChanged?.(message.hostId, message.name);
        return;
      case 'time':
        this.handlers.onTime?.(message.value);
        return;
      case 'op':
        this.handlers.onOp?.(message.op === true, message.by || '');
        return;
      case 'open_ok':
        if (this.pendingCheck) {
          clearTimeout(this.pendingCheck.timer);
          this.pendingCheck.resolve();
          this.pendingCheck = undefined;
        }
        return;
      case 'room_closed':
        this.handlers.onRoomClosed?.(message.reason);
        return;
      case 'pong': {
        const sent = Number(message.at) || this.pingSentAt;
        const sample = Math.max(0, performance.now() - sent);
        this.latency = this.latency ? this.latency * 0.7 + sample * 0.3 : sample;
        return;
      }
      case 'error':
        this.handlers.onError?.(message.code, message.message);
        this.failPending(message.message);
        return;
      default:
        return;
    }
  }
}

export type { NetPlayerState, NetVec3, NetWelcome, NetWorld };
