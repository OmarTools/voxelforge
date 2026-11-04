import type { CommandAPI } from './CommandAPI';

export type BridgeStatus = 'off' | 'connecting' | 'online' | 'error';

export interface McpSettings {
  enabled: boolean;
  url: string;
  token: string;
}

export interface BridgeLogEntry {
  at: number;
  type: string;
  ok: boolean;
  message: string;
}

export interface BridgeSnapshot {
  status: BridgeStatus;
  enabled: boolean;
  url: string;
  token: string;
  lastError: string;
  lastContact: number;
  commandsSeen: number;
  log: BridgeLogEntry[];
}

const MCP_KEY = 'voxelforge.mcp';
export const DEFAULT_MCP_URL = 'http://127.0.0.1:8765';

function normaliseUrl(value: string): string {
  const trimmed = (value || DEFAULT_MCP_URL).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export function loadMcpSettings(): McpSettings {
  try {
    const raw = localStorage.getItem(MCP_KEY);
    if (!raw) return { enabled: false, url: DEFAULT_MCP_URL, token: '' };
    const parsed = JSON.parse(raw) as Partial<McpSettings>;
    return {
      enabled: !!parsed.enabled,
      url: normaliseUrl(parsed.url || DEFAULT_MCP_URL),
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return { enabled: false, url: DEFAULT_MCP_URL, token: '' };
  }
}

export function saveMcpSettings(settings: McpSettings): void {
  try {
    localStorage.setItem(MCP_KEY, JSON.stringify({ ...settings, url: normaliseUrl(settings.url) }));
  } catch {
    // Storage unavailable; the bridge still works for this session.
  }
}

/**
 * Browser half of the VoxelForge AI bridge. It polls a localhost MCP server for
 * queued commands, executes them through CommandAPI and posts the results back.
 * The server itself is `mcp/voxelforge-mcp.mjs` (no dependencies).
 */
export class McpBridge {
  status: BridgeStatus = 'off';
  lastError = '';
  lastContact = 0;
  commandsSeen = 0;
  log: BridgeLogEntry[] = [];
  onChange?: (snapshot: BridgeSnapshot) => void;

  private settings: McpSettings;
  private running = false;
  private timer: number | null = null;
  private pollInFlight = false;

  constructor(private api: CommandAPI) {
    this.settings = loadMcpSettings();
  }

  get snapshot(): BridgeSnapshot {
    return {
      status: this.status,
      enabled: this.settings.enabled,
      url: this.settings.url,
      token: this.settings.token,
      lastError: this.lastError,
      lastContact: this.lastContact,
      commandsSeen: this.commandsSeen,
      log: this.log.slice(0, 12),
    };
  }

  get url(): string {
    return this.settings.url;
  }

  get enabled(): boolean {
    return this.settings.enabled;
  }

  setUrl(url: string): void {
    this.settings.url = normaliseUrl(url);
    saveMcpSettings(this.settings);
    this.emit();
  }

  setToken(token: string): void {
    this.settings.token = token.trim();
    saveMcpSettings(this.settings);
    this.emit();
  }

  start(url?: string): void {
    if (url) this.settings.url = normaliseUrl(url);
    this.settings.enabled = true;
    saveMcpSettings(this.settings);
    if (this.running) {
      this.emit();
      return;
    }
    this.running = true;
    this.status = 'connecting';
    this.lastError = '';
    this.emit();
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    this.settings.enabled = false;
    saveMcpSettings(this.settings);
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.status = 'off';
    this.emit();
  }

  async probe(): Promise<boolean> {
    try {
      const response = await this.request('/health', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.status = 'online';
      this.lastContact = Date.now();
      this.lastError = '';
      this.emit();
      return true;
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit();
      return false;
    }
  }

  private schedule(delay: number): void {
    if (!this.running) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delay);
  }

  private async poll(): Promise<void> {
    if (!this.running || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const response = await this.request('/poll', { method: 'GET' });
      if (response.status === 204) {
        this.markOnline();
        this.schedule(650);
        return;
      }
      if (!response.ok) throw new Error(`Bridge returned HTTP ${response.status}`);
      const data = (await response.json()) as {
        command?: { id?: string; type?: string; payload?: Record<string, unknown> } | null;
      };
      this.markOnline();
      if (data.command?.id) {
        await this.runCommand(data.command.id, data.command.type ?? 'state', data.command.payload ?? {});
      }
      this.schedule(250);
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit();
      this.schedule(2200);
    } finally {
      this.pollInFlight = false;
    }
  }

  private async runCommand(id: string, type: string, payload: Record<string, unknown>): Promise<void> {
    this.commandsSeen += 1;
    let result;
    try {
      result = await this.api.execute(type, payload);
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    this.log.unshift({
      at: Date.now(),
      type,
      ok: result.ok,
      message: result.ok ? result.message ?? 'ok' : result.message ?? 'failed',
    });
    this.log = this.log.slice(0, 40);
    this.emit();
    try {
      await this.request('/result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...result }),
      });
    } catch (error) {
      this.lastError = `Could not deliver result: ${error instanceof Error ? error.message : String(error)}`;
      this.emit();
    }
  }

  private markOnline(): void {
    if (this.status !== 'online') {
      this.status = 'online';
      this.lastError = '';
      this.emit();
    }
    this.lastContact = Date.now();
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    const headers = new Headers(init.headers);
    if (this.settings.token) headers.set('x-voxelforge-token', this.settings.token);
    return fetch(`${this.settings.url}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeout));
  }

  private emit(): void {
    this.onChange?.(this.snapshot);
    window.dispatchEvent(new CustomEvent('voxelforge:mcp', { detail: this.snapshot }));
  }
}

let sharedBridge: McpBridge | null = null;

export function setSharedBridge(bridge: McpBridge): void {
  sharedBridge = bridge;
}

export function getSharedBridge(): McpBridge | null {
  return sharedBridge;
}
