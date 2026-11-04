import type { Game } from './Game';
import { PUBLISH_TARGETS, Publisher, formatBytes, type PublishResult, type PublishTarget } from '../publish/Publisher';
import { downloadBlob } from '../publish/Zip';
import { getSharedBridge } from '../ai/McpBridge';
import { AI_COMMANDS } from '../ai/CommandAPI';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bytesSummary(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TARGET_KEY = 'voxelforge.publish.target';

/**
 * Publish panel: builds standalone packages (web, Electron desktop, Capacitor
 * Android/iOS) and hosts the browser side of the AI/MCP bridge.
 */
export class PublishUI {
  readonly el: HTMLDivElement;
  isOpen = false;

  private game: Game;
  private publisher = new Publisher((message) => this.setStatus(message, 'info'));
  private onClose?: () => void;
  private target: PublishTarget = 'web';
  private tab: 'build' | 'ai' = 'build';
  private nameInput!: HTMLInputElement;
  private targetWrap!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private filesEl!: HTMLDivElement;
  private noteEl!: HTMLDivElement;
  private buildButton!: HTMLButtonElement;
  private lastResult: PublishResult | null = null;
  private redownloadButton!: HTMLButtonElement;

  private aiStatusEl!: HTMLDivElement;
  private aiUrlInput!: HTMLInputElement;
  private aiTokenInput!: HTMLInputElement;
  private aiLogEl!: HTMLDivElement;
  private aiStartButton!: HTMLButtonElement;
  private aiStopButton!: HTMLButtonElement;

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    this.target = (localStorage.getItem(TARGET_KEY) as PublishTarget | null) ?? 'web';
    if (!PUBLISH_TARGETS.some((entry) => entry.key === this.target)) this.target = 'web';

    this.el = document.createElement('div');
    this.el.className = 'publish-overlay hidden';
    this.el.innerHTML = `
      <div class="publish-shell">
        <header class="publish-head">
          <div class="publish-title">
            <span class="publish-kicker">VoxelForge</span>
            <strong>Publish <em>·</em> AI control</strong>
          </div>
          <div class="publish-tabs" role="tablist">
            <button class="publish-tab active" data-ptab="build" role="tab">Build</button>
            <button class="publish-tab" data-ptab="ai" role="tab">AI control</button>
          </div>
          <div class="spacer"></div>
          <button class="close-x" data-pclose title="Close">✕</button>
        </header>

        <div class="publish-body">
          <section class="publish-panel active" data-ppanel="build">
            <div class="publish-grid">
              <div class="publish-form">
                <label class="publish-field">
                  <span>Game name</span>
                  <input data-publish-name spellcheck="false" maxlength="60" placeholder="Untitled Game">
                </label>

                <div class="publish-label">Build target</div>
                <div class="publish-targets" data-targets></div>

                <div class="publish-label">Package</div>
                <div class="publish-includes">
                  <span class="publish-chip">World seed &amp; edits</span>
                  <span class="publish-chip">Studio props</span>
                  <span class="publish-chip">Rules</span>
                  <span class="publish-chip">VoxelScript</span>
                  <span class="publish-chip">Camera &amp; vehicle</span>
                  <span class="publish-chip">Starting inventory</span>
                </div>

                <div class="publish-actions">
                  <button class="btn primary" data-build>Build &amp; download .zip</button>
                  <button class="btn ghost" data-redownload disabled>Download again</button>
                </div>
                <div class="publish-status" data-status>Pick a target and build a package.</div>
              </div>

              <aside class="publish-side">
                <div class="publish-card">
                  <div class="publish-card-head">
                    <h4>What is inside</h4>
                    <span data-target-badge class="pill blue">HTML + JS</span>
                  </div>
                  <p data-target-desc class="publish-card-desc"></p>
                  <div class="publish-files" data-files>
                    <span class="muted tiny">Build once to see the file list.</span>
                  </div>
                </div>
                <div class="publish-card">
                  <div class="publish-card-head"><h4>Platform notes</h4></div>
                  <div class="publish-note" data-note>Web builds run anywhere, including itch.io.</div>
                </div>
                <div class="publish-card publish-tip">
                  <div class="publish-card-head"><h4>Fresh start</h4></div>
                  <p>Every export resets the player, objectives and waves, so players begin at the spawn point with the template's starting gear. Your world edits, prefabs, rules, scripts, camera and vehicle setup are kept.</p>
                </div>
              </aside>
            </div>
          </section>

          <section class="publish-panel" data-ppanel="ai">
            <div class="publish-grid ai-grid">
              <div class="publish-form">
                <div class="publish-ai-head">
                  <div>
                    <div class="publish-label" style="margin:0 0 4px">Local MCP bridge</div>
                    <p class="muted tiny" style="margin:0">Run <code>node mcp/voxelforge-mcp.mjs</code> in the project folder, then start the bridge here. AI agents can read state, drive the world, edit scripts and publish builds.</p>
                  </div>
                  <span class="ai-status" data-ai-status>OFF</span>
                </div>

                <div class="publish-row">
                  <label class="publish-field grow">
                    <span>Bridge URL</span>
                    <input data-ai-url spellcheck="false" placeholder="http://127.0.0.1:8765">
                  </label>
                  <label class="publish-field grow">
                    <span>Token (optional)</span>
                    <input data-ai-token spellcheck="false" placeholder="shared secret">
                  </label>
                </div>
                <div class="publish-actions">
                  <button class="btn primary" data-ai-start>Start bridge</button>
                  <button class="btn ghost" data-ai-stop disabled>Stop</button>
                  <button class="btn ghost" data-ai-probe>Ping server</button>
                  <button class="btn ghost" data-ai-test>Run state command</button>
                </div>
                <div class="publish-status" data-ai-message>Bridge is stopped.</div>
                <div class="ai-log" data-ai-log>
                  <span class="muted tiny">No commands yet.</span>
                </div>
              </div>

              <aside class="publish-side">
                <div class="publish-card">
                  <div class="publish-card-head">
                    <h4>Agent setup</h4>
                    <button class="btn ghost small" data-ai-copy>Copy config</button>
                  </div>
                  <p class="publish-card-desc">Add this to your MCP client (Claude Desktop, OpenCode, Cursor…). Use the absolute path to <code>mcp/voxelforge-mcp.mjs</code>.</p>
                  <pre class="ai-config" data-ai-config></pre>
                </div>
                <div class="publish-card">
                  <div class="publish-card-head"><h4>Command surface</h4><span class="pill" data-ai-count>${AI_COMMANDS.length}</span></div>
                  <div class="ai-commands">
                    ${AI_COMMANDS.slice(0, 10)
                      .map(
                        (command) =>
                          `<div class="ai-command"><code>${escapeHtml(command.type)}</code><span>${escapeHtml(command.description)}</span></div>`,
                      )
                      .join('')}
                  </div>
                  <p class="muted tiny" style="margin:10px 0 0">Full catalog: <code>skills/voxelforge-ai/SKILL.md</code> and <code>mcp/README.md</code>.</p>
                </div>
              </aside>
            </div>
          </section>
        </div>

        <footer class="publish-foot">
          <span data-foot-left>Standalone packages are generated in your browser. Nothing is uploaded.</span>
          <div class="spacer"></div>
          <button class="btn ghost small" data-pclose>Close</button>
        </footer>
      </div>
    `;
    root.appendChild(this.el);

    this.nameInput = this.el.querySelector('[data-publish-name]') as HTMLInputElement;
    this.targetWrap = this.el.querySelector('[data-targets]') as HTMLDivElement;
    this.statusEl = this.el.querySelector('[data-status]') as HTMLDivElement;
    this.filesEl = this.el.querySelector('[data-files]') as HTMLDivElement;
    this.noteEl = this.el.querySelector('[data-note]') as HTMLDivElement;
    this.buildButton = this.el.querySelector('[data-build]') as HTMLButtonElement;
    this.redownloadButton = this.el.querySelector('[data-redownload]') as HTMLButtonElement;
    this.aiStatusEl = this.el.querySelector('[data-ai-status]') as HTMLDivElement;
    this.aiUrlInput = this.el.querySelector('[data-ai-url]') as HTMLInputElement;
    this.aiTokenInput = this.el.querySelector('[data-ai-token]') as HTMLInputElement;
    this.aiLogEl = this.el.querySelector('[data-ai-log]') as HTMLDivElement;
    this.aiStartButton = this.el.querySelector('[data-ai-start]') as HTMLButtonElement;
    this.aiStopButton = this.el.querySelector('[data-ai-stop]') as HTMLButtonElement;

    this.renderTargets();
    this.bind();
    this.refreshAi();
    window.addEventListener('voxelforge:mcp', () => this.refreshAi());
  }

  open(onClose?: () => void): void {
    this.onClose = onClose;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.nameInput.value = this.game.projectName || this.game.template.name || 'Untitled Game';
    this.syncTargetCopy();
    this.setStatus(this.game.started ? 'Ready to build.' : 'Start a world before publishing.', this.game.started ? 'info' : 'warn');
    this.buildButton.disabled = !this.game.started;
    this.redownloadButton.disabled = !this.lastResult;
    this.renderFiles(this.lastResult);
    this.refreshAi();
    this.setTab(this.tab);
  }

  close(): void {
    if (!this.isOpen && this.el.classList.contains('hidden')) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    const callback = this.onClose;
    this.onClose = undefined;
    callback?.();
  }

  private bind(): void {
    this.el.querySelectorAll<HTMLElement>('[data-pclose]').forEach((button) => {
      button.addEventListener('click', () => this.close());
    });
    this.el.querySelectorAll<HTMLElement>('[data-ptab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.ptab === 'ai' ? 'ai' : 'build';
        this.setTab(tab);
      });
    });
    this.targetWrap.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('[data-target]');
      if (!card) return;
      const target = card.dataset.target as PublishTarget;
      if (!PUBLISH_TARGETS.some((entry) => entry.key === target)) return;
      this.target = target;
      localStorage.setItem(TARGET_KEY, target);
      this.renderTargets();
      this.syncTargetCopy();
      this.setStatus('Target changed. Build when ready.', 'info');
    });

    this.buildButton.addEventListener('click', () => void this.build());
    this.redownloadButton.addEventListener('click', () => {
      if (!this.lastResult) return;
      downloadBlob(this.lastResult.blob, this.lastResult.filename);
      this.setStatus(`Downloaded ${this.lastResult.filename} again.`, 'good');
    });

    const bridge = getSharedBridge();
    this.aiUrlInput.value = bridge?.url ?? 'http://127.0.0.1:8765';
    if (bridge) this.aiTokenInput.value = bridge.snapshot.token;

    this.aiStartButton.addEventListener('click', () => {
      const bridge = getSharedBridge();
      if (!bridge) return;
      bridge.setToken(this.aiTokenInput.value);
      bridge.start(this.aiUrlInput.value);
      this.refreshAi();
      this.setAiMessage('Bridge started. Waiting for the MCP server…', 'info');
    });
    this.aiStopButton.addEventListener('click', () => {
      getSharedBridge()?.stop();
      this.refreshAi();
      this.setAiMessage('Bridge stopped.', 'info');
    });
    this.el.querySelector('[data-ai-probe]')?.addEventListener('click', () => {
      const bridge = getSharedBridge();
      if (!bridge) return;
      bridge.setUrl(this.aiUrlInput.value);
      bridge.setToken(this.aiTokenInput.value);
      void bridge.probe().then((ok) => {
        this.setAiMessage(ok ? 'MCP server answered. Bridge is online.' : `No answer from ${bridge.url}. Start the server with node mcp/voxelforge-mcp.mjs.`, ok ? 'good' : 'bad');
        this.refreshAi();
      });
    });
    this.el.querySelector('[data-ai-test]')?.addEventListener('click', () => {
      const commands = window.voxelforge?.commands;
      if (!commands) return;
      void commands.execute('state').then((result) => {
        this.setAiMessage(result.ok ? 'State command executed locally.' : result.message ?? 'Command failed.', result.ok ? 'good' : 'bad');
        const log = this.aiLogEl;
        log.textContent = JSON.stringify(result.data ?? result, null, 2);
      });
    });
    this.el.querySelector('[data-ai-copy]')?.addEventListener('click', () => {
      void this.copyConfig();
    });
    this.aiUrlInput.addEventListener('change', () => {
      getSharedBridge()?.setUrl(this.aiUrlInput.value);
    });
    this.aiTokenInput.addEventListener('change', () => {
      getSharedBridge()?.setToken(this.aiTokenInput.value);
    });
  }

  private setTab(tab: 'build' | 'ai'): void {
    this.tab = tab;
    this.el.querySelectorAll<HTMLElement>('[data-ptab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.ptab === tab);
    });
    this.el.querySelectorAll<HTMLElement>('[data-ppanel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.ppanel === tab);
    });
  }

  private renderTargets(): void {
    this.targetWrap.innerHTML = PUBLISH_TARGETS.map(
      (target) => `
        <button class="publish-target ${target.key === this.target ? 'active' : ''}" data-target="${target.key}" type="button">
          <span class="pt-glyph">${target.glyph}</span>
          <span class="pt-body">
            <span class="pt-name">${escapeHtml(target.label)}</span>
            <span class="pt-desc">${escapeHtml(target.description)}</span>
            <span class="pt-badge">${escapeHtml(target.badge)}</span>
          </span>
          <span class="pt-check">✓</span>
        </button>`,
    ).join('');
  }

  private syncTargetCopy(): void {
    const info = PUBLISH_TARGETS.find((entry) => entry.key === this.target) ?? PUBLISH_TARGETS[0];
    const badge = this.el.querySelector('[data-target-badge]');
    const desc = this.el.querySelector('[data-target-desc]');
    if (badge) badge.textContent = info.badge;
    if (desc) desc.textContent = info.description;
    const notes: Record<PublishTarget, string> = {
      web: 'Web: upload the zip contents to itch.io, Netlify, GitHub Pages or any static host. Runs in Chromium, Firefox and Safari.',
      desktop: 'Desktop: install Node.js, run npm install then npm start. Run npm run dist to build a Windows installer or Linux AppImage. macOS DMGs must be built on macOS.',
      android: 'Android: needs Android Studio + JDK 17. Run npm install, npx cap add android, then npx cap open android. The game is already in www/.',
      ios: 'iOS: needs macOS + Xcode 15+. Run npm install, npx cap add ios, then npx cap open ios. Signing requires an Apple Developer account.',
    };
    if (this.noteEl) this.noteEl.textContent = notes[this.target];
  }

  private async build(): Promise<void> {
    if (!this.game.started) {
      this.setStatus('Start a world before publishing.', 'warn');
      return;
    }
    const name = this.nameInput.value.trim() || this.game.template.name || 'Untitled Game';
    this.game.projectName = name;
    this.buildButton.disabled = true;
    this.redownloadButton.disabled = true;
    this.setStatus('Preparing the export…', 'info');
    try {
      const save = this.game.exportProject(name);
      const result = await this.publisher.build({ name, target: this.target, save });
      this.lastResult = result;
      downloadBlob(result.blob, result.filename);
      this.renderFiles(result);
      this.redownloadButton.disabled = false;
      this.setStatus(`Built ${result.filename} — ${result.fileCount} files, ${bytesSummary(result.bytes)}. Download started.`, 'good');
      this.game.toast(`Publish package ready: ${result.filename}`, 'good');
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, 'bad');
      this.game.toast('Publish failed. See the publish panel for details.', 'bad');
    } finally {
      this.buildButton.disabled = !this.game.started;
    }
  }

  private renderFiles(result: PublishResult | null): void {
    if (!result) {
      this.filesEl.innerHTML = '<span class="muted tiny">Build once to see the file list.</span>';
      return;
    }
    const shown = result.files.slice(0, 14);
    this.filesEl.innerHTML = `
      <div class="publish-file-head"><span>${escapeHtml(result.filename)}</span><b>${formatBytes(result.bytes)}</b></div>
      ${shown
        .map(
          (file) =>
            `<div class="publish-file"><code>${escapeHtml(file.path)}</code><span>${formatBytes(file.bytes)}</span></div>`,
        )
        .join('')}
      ${result.files.length > shown.length ? `<div class="publish-file more">+ ${result.files.length - shown.length} more files</div>` : ''}
    `;
  }

  private setStatus(message: string, kind: 'info' | 'good' | 'warn' | 'bad'): void {
    this.statusEl.textContent = message;
    this.statusEl.className = `publish-status ${kind}`;
  }

  private setAiMessage(message: string, kind: 'info' | 'good' | 'warn' | 'bad'): void {
    const element = this.el.querySelector('[data-ai-message]');
    if (!element) return;
    element.textContent = message;
    element.className = `publish-status ${kind}`;
  }

  private lastAiStatus = '';

  refreshAi(): void {
    const bridge = getSharedBridge();
    if (!bridge) {
      this.aiStatusEl.textContent = 'OFF';
      this.aiStatusEl.className = 'ai-status off';
      return;
    }
    const snapshot = bridge.snapshot;
    this.aiStatusEl.textContent = snapshot.status.toUpperCase();
    this.aiStatusEl.className = `ai-status ${snapshot.status}`;
    this.aiStartButton.disabled = snapshot.enabled;
    this.aiStopButton.disabled = !snapshot.enabled;
    if (document.activeElement !== this.aiUrlInput) this.aiUrlInput.value = snapshot.url;
    if (document.activeElement !== this.aiTokenInput) this.aiTokenInput.value = snapshot.token;
    if (snapshot.status !== this.lastAiStatus) {
      this.lastAiStatus = snapshot.status;
      if (snapshot.status === 'online') this.setAiMessage(`Bridge online at ${snapshot.url}.`, 'good');
      else if (snapshot.status === 'connecting') this.setAiMessage('Connecting to the MCP server…', 'info');
      else if (snapshot.status === 'error') this.setAiMessage(snapshot.lastError || 'Bridge error. Check the URL and server.', 'bad');
      else this.setAiMessage('Bridge is stopped. Start it to let AI agents control the game.', 'info');
    }
    this.aiLogEl.innerHTML = snapshot.log.length
      ? snapshot.log
          .map(
            (entry) =>
              `<div class="ai-log-row ${entry.ok ? 'ok' : 'bad'}"><code>${escapeHtml(entry.type)}</code><span>${escapeHtml(entry.message)}</span><time>${new Date(entry.at).toLocaleTimeString()}</time></div>`,
          )
          .join('')
      : '<span class="muted tiny">No commands yet.</span>';
    const config = this.el.querySelector('[data-ai-config]');
    if (config) config.textContent = this.mcpConfig();
  }

  private mcpConfig(): string {
    const bridge = getSharedBridge();
    const url = bridge?.url ?? 'http://127.0.0.1:8765';
    return JSON.stringify(
      {
        mcpServers: {
          voxelforge: {
            command: 'node',
            args: ['C:\\\\path\\\\to\\\\voxelforge\\\\mcp\\\\voxelforge-mcp.mjs'],
            env: { VOXELFORGE_MCP_PORT: url.split(':').pop() || '8765' },
          },
        },
      },
      null,
      2,
    );
  }

  private async copyConfig(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.mcpConfig());
      this.setAiMessage('MCP config copied. Replace the path with your project folder.', 'good');
    } catch {
      this.setAiMessage('Clipboard blocked. Select the config text and copy it manually.', 'warn');
    }
  }
}
