/**
 * Multiplayer session orchestration for the browser client.
 *
 * The runtime owns the lobby, the in-game room panel, chat, remote avatars and
 * the movement/block relay. It never changes the offline path: the whole class
 * is only constructed when `?server=` or `VITE_MULTIPLAYER_URL` is configured.
 */
import * as THREE from 'three';
import { getTemplate, TEMPLATES } from '../content/Templates';
import type { Game } from '../engine/game/Game';
import type { GameEntity } from '../engine/entities/EntityManager';
import { NetClient, resolveServerUrl } from './NetClient';
import {
  sanitizeChat,
  type NetChatMessage,
  type NetPlayerState,
  type NetWelcome,
  type NetWorld,
} from './protocol';

const NAME_KEY = 'voxelforge.net.name';

/** Server URL from the query string, then the build-time environment. */
export function configuredServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('server') ?? '';
  const env = (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined) ?? '';
  return resolveServerUrl(query || env);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'Wanderer';
  } catch {
    return 'Wanderer';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

interface RemoteAvatar {
  entity: GameEntity;
  target: THREE.Vector3;
  yaw: number;
  moving: boolean;
}

export class MultiplayerRuntime {
  readonly url: string;
  readonly client: NetClient;

  private game: Game;
  private name = loadName();
  private attached = false;
  private room: NetWelcome['room'] | null = null;
  private selfId = '';
  private players = new Map<string, NetPlayerState>();
  private avatars = new Map<string, RemoteAvatar>();
  private lobbyEl?: HTMLDivElement;
  private lobbyKeyHandler?: (event: KeyboardEvent) => void;
  private prefillCode = '';
  private layerEl?: HTMLDivElement;
  private rosterEl?: HTMLDivElement;
  private metaEl?: HTMLDivElement;
  private feedEl?: HTMLDivElement;
  private chatInputEl?: HTMLInputElement;
  private chatHintEl?: HTMLDivElement;
  private chatOpen = false;
  private busy = false;
  private rosterSignature = '';
  private lastFrame = 0;
  private rafId = 0;
  private inputTimer = 0;
  private metaTimer = 0;

  constructor(game: Game, serverUrl: string) {
    this.game = game;
    this.url = resolveServerUrl(serverUrl);
    this.client = new NetClient(this.url);
    this.client.handlers = {
      onPlayerJoined: (player) => {
        if (!this.attached) return;
        this.players.set(player.id, player);
        this.spawnAvatar(player);
        this.renderRoster();
      },
      onPlayerLeft: (playerId) => {
        if (!this.attached) return;
        this.players.delete(playerId);
        this.removeAvatar(playerId);
        this.renderRoster();
      },
      onSnapshot: (players) => {
        if (!this.attached) return;
        const seen = new Set<string>();
        for (const player of players) {
          seen.add(player.id);
          this.players.set(player.id, player);
          const avatar = this.avatars.get(player.id);
          if (avatar) {
            avatar.target.set(player.x, player.y, player.z);
            avatar.yaw = player.yaw;
            avatar.moving = player.moving;
          } else if (player.id !== this.selfId) {
            this.spawnAvatar(player);
          }
        }
        for (const id of [...this.avatars.keys()]) {
          if (!seen.has(id)) {
            this.players.delete(id);
            this.removeAvatar(id);
          }
        }
        this.renderRoster();
      },
      onBlock: (x, y, z, id, from) => {
        if (!this.attached || from === this.selfId) return;
        this.game.applyRemoteBlock(x, y, z, id);
      },
      onChat: (message) => {
        if (!this.attached) return;
        this.appendChat(message);
      },
      onSettings: (settings, by) => {
        if (!this.attached) return;
        if (this.room) this.room.settings = settings;
        this.renderRoster();
        if (by !== this.selfId) this.game.toast('The host updated the room settings.', 'info');
      },
      onHostChanged: (hostId, name) => {
        if (!this.attached) return;
        if (this.room) this.room.hostId = hostId;
        for (const player of this.players.values()) player.host = player.id === hostId;
        this.renderRoster();
        this.game.toast(`${name} is now the host.`, 'info');
      },
      onRoomClosed: (reason) => {
        if (!this.attached) return;
        this.game.toast(reason || 'The room closed.', 'warn');
        this.exitToMenu();
      },
      onError: (code, message) => {
        if (this.lobbyEl) this.setLobbyStatus(message, 'bad');
        else if (this.attached) this.game.toast(message, 'warn');
        console.warn(`[net] ${code}: ${message}`);
      },
      onClosed: (reason, intentional) => {
        if (intentional) return;
        if (this.attached) {
          this.game.toast('Disconnected from the multiplayer server.', 'bad');
          this.exitToMenu();
        } else if (this.lobbyEl) {
          this.setLobbyStatus(reason, 'bad');
        }
      },
    };
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  // ------------------------------------------------------------------- lobby

  openLobby(prefillCode = ''): void {
    if (this.attached) {
      this.game.toast('You are already in a room. Leave it first.', 'warn');
      return;
    }
    if (this.lobbyEl) return;
    const params = new URLSearchParams(window.location.search);
    const code = prefillCode || params.get('room') || '';
    const overlay = document.createElement('div');
    overlay.className = 'overlay net-overlay';
    overlay.innerHTML = `
      <div class="modal net-lobby" style="width:min(780px,calc(100vw - 32px))">
        <div class="modal-head">
          <div>
            <h3>Multiplayer</h3>
            <div class="sub">Invite rooms · shared world · live block sync</div>
          </div>
          <div class="spacer"></div>
          <span class="pill green">Server configured</span>
          <button class="close-x" data-net-close>✕</button>
        </div>
        <div class="modal-body">
          <div class="net-player-row">
            <div class="field" style="flex:1;margin:0">
              <label>Your display name</label>
              <input class="input" data-net-name maxlength="20" autocomplete="off" value="${escapeHtml(this.name)}"/>
            </div>
            <div class="net-server-chip">
              <span class="dot-live"></span>
              <span class="mono">${escapeHtml(this.url)}</span>
            </div>
          </div>
          <div data-net-body>
            <div class="net-empty">Connecting to ${escapeHtml(this.url)}…</div>
          </div>
          <div class="net-lobby-foot">
            <span data-net-status>Connecting…</span>
            <span class="muted tiny">Protocol 1 · JSON transport · optional, never required</span>
          </div>
        </div>
      </div>
    `;
    this.game.root.appendChild(overlay);
    this.lobbyEl = overlay;
    this.prefillCode = code;
    overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === overlay || target.closest('[data-net-close]')) {
        this.closeLobby();
        return;
      }
      if (target.closest('[data-net-host]')) {
        void this.hostRoom();
        return;
      }
      if (target.closest('[data-net-join]')) {
        void this.joinRoom();
        return;
      }
      if (target.closest('[data-net-open-join]')) {
        void this.joinOpen();
        return;
      }
      if (target.closest('[data-net-open-start]')) {
        void this.startSharedWorld();
        return;
      }
      if (target.closest('[data-net-retry]')) {
        this.setLobbyStatus('Connecting…', 'info');
        void this.prepareLobby();
      }
    });
    overlay.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if (event.key !== 'Enter' || !target.closest('[data-net-code]')) return;
      event.preventDefault();
      void this.joinRoom();
    });
    const onKey = (event: KeyboardEvent) => {
      if (this.lobbyEl !== overlay) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeLobby();
      }
    };
    this.lobbyKeyHandler = onKey;
    window.addEventListener('keydown', onKey);
    void this.prepareLobby();
  }

  /** Ask the server what it offers, then build the lobby around that. */
  private async prepareLobby(): Promise<void> {
    const overlay = this.lobbyEl;
    if (!overlay) return;
    try {
      await this.client.connect(this.readName());
      await this.client.refreshInfo();
    } catch (error) {
      if (this.lobbyEl !== overlay) return;
      this.renderLobbyBody();
      this.setLobbyStatus(error instanceof Error ? error.message : 'Could not reach the multiplayer server.', 'bad');
      return;
    }
    if (this.lobbyEl !== overlay) return;
    this.renderLobbyBody();
    this.setLobbyStatus(this.lobbyReadyText(), 'info');
    const codeInput = overlay.querySelector('[data-net-code]') as HTMLInputElement | null;
    if (codeInput && this.prefillCode) codeInput.focus();
    else (overlay.querySelector('[data-net-name]') as HTMLInputElement | null)?.focus();
  }

  private lobbyReadyText(): string {
    const modes = this.client.modes;
    if (modes.includes('open') && !modes.includes('rooms')) {
      return 'Shared world · up to 8 players · saved on the server.';
    }
    if (modes.includes('open')) return 'Rooms and the shared world are both open.';
    return 'Ready. Rooms hold up to 8 players.';
  }

  private renderLobbyBody(): void {
    const body = this.lobbyEl?.querySelector('[data-net-body]') as HTMLElement | null;
    if (!body) return;
    if (!this.client.connected) {
      body.innerHTML = `
        <div class="net-empty">
          <p>The multiplayer server is not responding.</p>
          <p class="muted tiny">Start it with <b>npm run server</b>, then try again.</p>
          <button class="btn ghost" data-net-retry>Try again</button>
        </div>
      `;
      return;
    }
    const modes = this.client.modes;
    const rooms = modes.includes('rooms');
    const open = modes.includes('open');
    const shared = this.client.openWorld;
    const templateOptions = TEMPLATES.map(
      (template) =>
        `<option value="${template.key}"${template.key === 'creative' ? ' selected' : ''}>${escapeHtml(template.name)} — ${escapeHtml(template.subtitle)}</option>`,
    ).join('');
    const roomsHtml = rooms
      ? `<div class="net-grid">
            <section class="net-card">
              <h4>Host a room</h4>
              <p class="muted">Your seed, structures and edits become the shared world. Leaving closes the room.</p>
              <div class="field">
                <label>Template</label>
                <select class="input" data-net-template>${templateOptions}</select>
              </div>
              <button class="btn primary wide" data-net-host>Create invite room</button>
            </section>
            <section class="net-card">
              <h4>Join a room</h4>
              <p class="muted">Paste the code from an invite, for example <b>CINDER-4F2K</b>.</p>
              <div class="field">
                <label>Room code</label>
                <input class="input" data-net-code maxlength="24" autocomplete="off" spellcheck="false" placeholder="CINDER-4F2K" value="${escapeHtml(this.prefillCode)}"/>
              </div>
              <button class="btn blue wide" data-net-join>Join room</button>
            </section>
          </div>`
      : '';
    const sharedHtml = open
      ? `<section class="net-shared">
            <div class="net-shared-info">
              <h4>Shared world</h4>
              <p class="muted">One persistent world for everyone on this server. Blocks are saved on the server, not in this browser.</p>
              <div class="net-shared-meta">${
                shared
                  ? `${escapeHtml(shared.templateName)} · ${shared.edits} edits · ${shared.players} online`
                  : 'Not created yet — the first player picks the template.'
              }</div>
            </div>
            <div class="net-shared-actions">
              ${
                shared
                  ? '<button class="btn blue wide" data-net-open-join>Join shared world</button>'
                  : `<div class="field">
                       <label>First world template</label>
                       <select class="input" data-net-open-template>${templateOptions}</select>
                     </div>
                     <button class="btn primary wide" data-net-open-start>Start shared world</button>`
              }
            </div>
          </section>`
      : '';
    body.innerHTML = `${roomsHtml}${sharedHtml}`;
    if (!roomsHtml && !sharedHtml) {
      body.innerHTML = '<div class="net-empty">This server has no mode enabled.</div>';
    }
  }

  private closeLobby(): void {
    if (this.lobbyKeyHandler) {
      window.removeEventListener('keydown', this.lobbyKeyHandler);
      this.lobbyKeyHandler = undefined;
    }
    this.lobbyEl?.remove();
    this.lobbyEl = undefined;
    this.busy = false;
  }

  private readName(): string {
    const input = this.lobbyEl?.querySelector('[data-net-name]') as HTMLInputElement | null;
    const value = (input?.value || this.name).replace(/\s+/g, ' ').trim().slice(0, 20) || 'Wanderer';
    this.name = value;
    saveName(value);
    return value;
  }

  private setLobbyStatus(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    const el = this.lobbyEl?.querySelector('[data-net-status]') as HTMLElement | null;
    if (!el) return;
    el.textContent = text;
    el.className = kind === 'bad' ? 'bad' : kind === 'good' ? 'good' : '';
  }

  private setLobbyBusy(busy: boolean): void {
    this.busy = busy;
    for (const selector of [
      '[data-net-host]',
      '[data-net-join]',
      '[data-net-open-start]',
      '[data-net-open-join]',
      '[data-net-retry]',
    ]) {
      const button = this.lobbyEl?.querySelector(selector);
      if (button instanceof HTMLButtonElement) button.disabled = busy;
    }
    for (const selector of ['[data-net-name]', '[data-net-template]', '[data-net-open-template]']) {
      const input = this.lobbyEl?.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null;
      if (input) input.disabled = busy;
    }
  }

  /** Build the world descriptor the server persists as this room's world. */
  private worldDescriptor(): NetWorld {
    const player = this.game.player;
    return {
      templateKey: this.game.template.key,
      templateName: this.game.template.name,
      seed: this.game.seed,
      baseY: this.game.baseY,
      skyTime: this.game.sky.time,
      rules: { ...this.game.rules },
      spawn: [player.position.x, player.position.y + 0.05, player.position.z],
      edits: this.game.world.getEdits(),
    };
  }

  private async hostRoom(): Promise<void> {
    if (this.busy) return;
    if (this.client.modes.length && !this.client.modes.includes('rooms')) {
      this.setLobbyStatus('This server does not host invite rooms.', 'bad');
      return;
    }
    const name = this.readName();
    const select = this.lobbyEl?.querySelector('[data-net-template]') as HTMLSelectElement | null;
    const template = getTemplate((select?.value || 'creative') as Parameters<typeof getTemplate>[0]);
    this.setLobbyBusy(true);
    this.setLobbyStatus('Generating the world…', 'info');
    this.closeLobby();
    await this.game.launch(template);
    if (!this.game.started) {
      this.game.multiplayerActive = false;
      return;
    }
    // Set before the network round trip so the freshly generated world is
    // never written over the local single-player save.
    this.game.multiplayerActive = true;
    try {
      const welcome = await this.client.createRoom(this.worldDescriptor(), name);
      this.attach(welcome);
    } catch (error) {
      this.game.toast(error instanceof Error ? error.message : 'Could not create the room.', 'bad');
      this.game.returnToMenu();
    }
  }

  private async joinRoom(): Promise<void> {
    if (this.busy) return;
    if (this.client.modes.length && !this.client.modes.includes('rooms')) {
      this.setLobbyStatus('This server does not host invite rooms.', 'bad');
      return;
    }
    const name = this.readName();
    const codeInput = this.lobbyEl?.querySelector('[data-net-code]') as HTMLInputElement | null;
    const code = (codeInput?.value || '').trim();
    if (!code) {
      this.setLobbyStatus('Enter the room code from your invite.', 'bad');
      codeInput?.focus();
      return;
    }
    this.setLobbyBusy(true);
    this.setLobbyStatus(`Joining ${code.toUpperCase()}…`, 'info');
    let welcome: NetWelcome;
    try {
      welcome = await this.client.joinRoom(code, name);
    } catch (error) {
      this.setLobbyBusy(false);
      this.setLobbyStatus(error instanceof Error ? error.message : 'Could not join that room.', 'bad');
      return;
    }
    this.closeLobby();
    await this.launchFromWelcome(welcome);
  }

  private async joinOpen(): Promise<void> {
    if (this.busy) return;
    if (!this.client.modes.includes('open')) {
      this.setLobbyStatus('This server does not host a shared world.', 'bad');
      return;
    }
    const name = this.readName();
    this.setLobbyBusy(true);
    this.setLobbyStatus('Joining the shared world…', 'info');
    let welcome: NetWelcome;
    try {
      welcome = await this.client.joinOpen(name);
      this.rememberOpenWorld(welcome);
    } catch (error) {
      this.setLobbyBusy(false);
      this.setLobbyStatus(error instanceof Error ? error.message : 'Could not join the shared world.', 'bad');
      return;
    }
    this.closeLobby();
    await this.launchFromWelcome(welcome);
  }

  private async startSharedWorld(): Promise<void> {
    if (this.busy) return;
    if (!this.client.modes.includes('open')) {
      this.setLobbyStatus('This server does not host a shared world.', 'bad');
      return;
    }
    const name = this.readName();
    const select = this.lobbyEl?.querySelector('[data-net-open-template]') as HTMLSelectElement | null;
    const template = getTemplate((select?.value || 'creative') as Parameters<typeof getTemplate>[0]);
    this.setLobbyBusy(true);
    this.setLobbyStatus('Generating the shared world…', 'info');
    this.closeLobby();
    await this.game.launch(template);
    if (!this.game.started) {
      this.game.multiplayerActive = false;
      return;
    }
    this.game.multiplayerActive = true;
    try {
      const welcome = await this.client.joinOpen(name, this.worldDescriptor());
      this.rememberOpenWorld(welcome);
      this.attach(welcome);
    } catch (error) {
      this.game.toast(error instanceof Error ? error.message : 'Could not start the shared world.', 'bad');
      this.game.returnToMenu();
    }
  }

  private rememberOpenWorld(welcome: NetWelcome): void {
    this.client.openWorld = {
      templateKey: welcome.world.templateKey,
      templateName: welcome.world.templateName,
      players: welcome.players.length,
      edits: welcome.world.edits.length,
    };
  }

  private async launchFromWelcome(welcome: NetWelcome): Promise<void> {
    const template =
      getTemplate(welcome.world.templateKey as Parameters<typeof getTemplate>[0]) || getTemplate('creative');
    this.selfId = welcome.you.id;
    this.room = welcome.room;
    this.game.multiplayerActive = true;
    await this.game.launch(template, undefined, {
      seed: welcome.world.seed,
      baseY: welcome.world.baseY,
      skyTime: welcome.world.skyTime,
      rules: welcome.world.rules,
      edits: welcome.world.edits,
      spawn: welcome.you.spawn,
      yaw: welcome.you.yaw,
    });
    if (!this.game.started) {
      this.cleanupTransport();
      this.game.multiplayerActive = false;
      return;
    }
    this.attach(welcome);
  }

  // ----------------------------------------------------------------- session

  private attach(welcome: NetWelcome): void {
    this.attached = true;
    this.room = welcome.room;
    this.selfId = welcome.you.id;
    const shared = welcome.room.code === 'SHARED';
    this.players.clear();
    for (const player of welcome.players) this.players.set(player.id, player);
    this.game.multiplayerActive = true;
    this.game.onBlockEdited = (x, y, z, id) => {
      if (this.attached) this.client.sendBlock(x, y, z, id);
    };
    this.game.onLeaveRoomRequested = () => this.leave();
    this.buildSessionUI();
    this.renderRoster();
    for (const player of this.players.values()) this.spawnAvatar(player);
    this.appendChat({
      from: 'server',
      name: 'Room',
      text: shared
        ? `Joined the shared world (${welcome.room.templateName}). Edits save on the server. Press Enter to chat.`
        : `Joined ${welcome.room.code}. Press Enter to chat.`,
      at: Date.now(),
      system: true,
    });
    this.game.toast(
      shared
        ? 'Joined the shared world. Press Enter to chat.'
        : welcome.you.host
          ? `Room ${welcome.room.code} is live. Copy the invite from the room panel.`
          : `Joined ${welcome.room.code}. Press Enter to chat.`,
      'good',
    );
    this.startLoop();
    this.inputTimer = window.setInterval(() => this.sendInput(), 66);
    this.metaTimer = window.setInterval(() => this.updateMeta(), 500);
  }

  private get sharedRoom(): boolean {
    return this.room?.code === 'SHARED';
  }

  private buildSessionUI(): void {
    const layer = document.createElement('div');
    layer.className = 'net-layer';
    const shared = this.sharedRoom;
    layer.innerHTML = `
      <div class="net-session">
        <div class="net-session-head">
          <span class="dot-live"></span>
          <b data-net-room-code>${escapeHtml(shared ? 'SHARED' : this.room?.code ?? 'ROOM')}</b>
          <div class="spacer"></div>
          ${shared ? '' : '<button class="btn ghost small" data-net-copy title="Copy invite link">Invite</button>'}
          <button class="btn ghost small danger-text" data-net-leave title="Leave the room">Leave</button>
        </div>
        <div class="net-session-meta" data-net-meta></div>
        <div class="net-roster" data-net-roster></div>
      </div>
      <div class="net-feed" data-net-feed></div>
      <div class="net-chat-bar">
        <div class="net-chat-hint" data-net-hint>Press <kbd>Enter</kbd> to chat</div>
        <input class="net-chat-input hidden" data-net-chat maxlength="180" autocomplete="off" placeholder="Say something…"/>
      </div>
    `;
    this.game.root.appendChild(layer);
    this.layerEl = layer;
    this.rosterEl = layer.querySelector('[data-net-roster]') as HTMLDivElement;
    this.metaEl = layer.querySelector('[data-net-meta]') as HTMLDivElement;
    this.feedEl = layer.querySelector('[data-net-feed]') as HTMLDivElement;
    this.chatInputEl = layer.querySelector('[data-net-chat]') as HTMLInputElement;
    this.chatHintEl = layer.querySelector('[data-net-hint]') as HTMLDivElement;
    layer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-net-copy]')) {
        void this.copyInvite();
        return;
      }
      if (target.closest('[data-net-leave]')) this.leave();
    });
    this.chatInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.sendChat();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeChat();
      }
    });
    this.updateMeta();
  }

  private renderRoster(): void {
    if (!this.rosterEl) return;
    const players = [...this.players.values()].sort((a, b) => {
      if (a.host !== b.host) return a.host ? -1 : 1;
      if (a.id === this.selfId) return -1;
      if (b.id === this.selfId) return 1;
      return a.name.localeCompare(b.name);
    });
    const signature = players.map((p) => `${p.id}:${p.name}:${p.host}`).join('|');
    if (signature === this.rosterSignature) return;
    this.rosterSignature = signature;
    this.rosterEl.innerHTML = players
      .map((player) => {
        const self = player.id === this.selfId;
        return `<div class="net-player${self ? ' self' : ''}">
          <span class="net-player-dot" style="background:${player.host ? '#f7c65a' : self ? '#8ce05f' : '#7bb7dd'}"></span>
          <span class="net-player-name">${escapeHtml(player.name)}${self ? ' (you)' : ''}</span>
          ${player.host ? '<span class="pill gold tiny-pill">Host</span>' : ''}
        </div>`;
      })
      .join('');
  }

  private updateMeta(): void {
    if (!this.metaEl || !this.room) return;
    const max = this.room.settings.maxPlayers || 8;
    const latency = Math.round(this.client.latency);
    this.metaEl.textContent = `${this.players.size}/${max} players · ${latency > 0 ? `${latency} ms` : 'syncing…'}`;
  }

  private spawnAvatar(player: NetPlayerState): void {
    if (player.id === this.selfId || this.avatars.has(player.id)) return;
    if (!this.game.entities) return;
    const entity = this.game.entities.spawn(
      'human:adventurer',
      new THREE.Vector3(player.x, player.y, player.z),
      {
        name: player.name,
        role: player.host ? 'Host' : 'Player',
        behavior: 'stationary',
        id: `net_player_${player.id}`,
        exactY: true,
      },
    );
    if (!entity) return;
    entity.isRemote = true;
    entity.root.rotation.y = player.yaw;
    this.avatars.set(player.id, {
      entity,
      target: new THREE.Vector3(player.x, player.y, player.z),
      yaw: player.yaw,
      moving: player.moving,
    });
  }

  private removeAvatar(playerId: string): void {
    const avatar = this.avatars.get(playerId);
    if (!avatar) return;
    this.avatars.delete(playerId);
    if (this.game.started && this.game.entities?.entities.includes(avatar.entity)) {
      this.game.entities.remove(avatar.entity);
    }
  }

  private removeAllAvatars(): void {
    for (const id of [...this.avatars.keys()]) this.removeAvatar(id);
  }

  private startLoop(): void {
    this.stopLoop();
    this.lastFrame = performance.now();
    const frame = () => {
      if (!this.attached) return;
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      for (const avatar of this.avatars.values()) {
        avatar.entity.position.lerp(avatar.target, Math.min(1, dt * 12));
        let delta = avatar.yaw - avatar.entity.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        avatar.entity.yaw += delta * Math.min(1, dt * 10);
        avatar.entity.remoteMoving = avatar.moving;
        avatar.entity.root.position.copy(avatar.entity.position);
        avatar.entity.root.rotation.y = avatar.entity.yaw;
      }
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private stopLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private sendInput(): void {
    if (!this.attached || !this.game.player) return;
    const player = this.game.player;
    const moving = Math.hypot(player.velocity.x, player.velocity.z) > 0.6;
    this.client.sendInput(player.position.x, player.position.y, player.position.z, player.yaw, player.pitch, moving);
  }

  // -------------------------------------------------------------------- chat

  private get canChat(): boolean {
    return (
      this.attached &&
      this.game.started &&
      !this.game.paused &&
      !this.game.uiOpen &&
      !this.game.studioOpen &&
      !this.game.input.touchMode
    );
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.attached) return;
    const target = event.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if (event.key === 'Enter') {
      if (this.chatOpen) {
        event.preventDefault();
        event.stopPropagation();
        this.sendChat();
        return;
      }
      if (!typing && this.canChat) {
        event.preventDefault();
        event.stopPropagation();
        this.openChat();
      }
      return;
    }
    if (event.key === 'Escape' && this.chatOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.closeChat();
    }
  };

  private openChat(): void {
    if (!this.chatInputEl || this.chatOpen) return;
    this.chatOpen = true;
    this.chatInputEl.classList.remove('hidden');
    this.chatHintEl?.classList.add('hidden');
    this.game.suppressPointerPause = true;
    this.game.input.exitLock();
    this.chatInputEl.value = '';
    this.chatInputEl.focus();
  }

  private closeChat(): void {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatInputEl?.classList.add('hidden');
    this.chatHintEl?.classList.remove('hidden');
    this.game.suppressPointerPause = false;
    this.chatInputEl?.blur();
    if (this.canChat) this.game.input.requestLock();
  }

  private sendChat(): void {
    const text = sanitizeChat(this.chatInputEl?.value ?? '');
    if (text) this.client.sendChat(text);
    this.closeChat();
  }

  private appendChat(message: NetChatMessage): void {
    if (!this.feedEl) return;
    const line = document.createElement('div');
    line.className = `net-chat-line${message.system ? ' system' : ''}`;
    const name = message.system ? 'Server' : message.name || 'Player';
    line.innerHTML = `<b>${escapeHtml(name)}</b><span>${escapeHtml(message.text)}</span>`;
    this.feedEl.appendChild(line);
    while (this.feedEl.childElementCount > 8) this.feedEl.firstElementChild?.remove();
  }

  // ------------------------------------------------------------------ invites

  private inviteLink(): string {
    const url = new URL(window.location.href);
    url.searchParams.set('server', this.url);
    if (this.room) url.searchParams.set('room', this.room.code);
    return url.toString();
  }

  private async copyInvite(): Promise<void> {
    const link = this.inviteLink();
    try {
      await navigator.clipboard.writeText(link);
      this.game.toast('Invite link copied. Send it to a friend.', 'good');
    } catch {
      window.prompt('Copy this invite link:', link);
    }
  }

  // ------------------------------------------------------------------ cleanup

  /** Called after the game returns to the main menu. */
  handleGameExit(): void {
    this.cleanupTransport();
    this.game.multiplayerActive = false;
  }

  /** Leave the current room and go back to the main menu. */
  leave(): void {
    if (!this.attached) return;
    const isHost = !!this.room && this.room.hostId === this.selfId;
    if (isHost) this.client.close();
    else this.client.leave();
    if (this.game.started) {
      // Keep multiplayerActive true through returnToMenu so saveGame() skips.
      this.game.returnToMenu();
    } else {
      this.cleanupTransport();
      this.game.multiplayerActive = false;
    }
  }

  private exitToMenu(): void {
    if (this.game.started) {
      this.game.returnToMenu();
      return;
    }
    this.cleanupTransport();
    this.game.multiplayerActive = false;
  }

  private cleanupTransport(): void {
    const attached = this.attached;
    this.attached = false;
    if (this.chatOpen) {
      this.chatOpen = false;
      this.game.suppressPointerPause = false;
    }
    this.stopLoop();
    if (this.inputTimer) window.clearInterval(this.inputTimer);
    if (this.metaTimer) window.clearInterval(this.metaTimer);
    this.inputTimer = 0;
    this.metaTimer = 0;
    this.game.onBlockEdited = undefined;
    this.game.onLeaveRoomRequested = undefined;
    if (attached) this.removeAllAvatars();
    this.avatars.clear();
    this.players.clear();
    this.room = null;
    this.rosterSignature = '';
    this.layerEl?.remove();
    this.layerEl = undefined;
    this.rosterEl = undefined;
    this.metaEl = undefined;
    this.feedEl = undefined;
    this.chatInputEl = undefined;
    this.chatHintEl = undefined;
    this.client.close();
  }
}
