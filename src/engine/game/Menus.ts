import { TEMPLATES, difficultyLabel, type GameTemplate } from '../../content/Templates';
import { itemIcon, itemName } from '../../content/Recipes';
import { getAsset } from '../../content/Models';
import { formatClock, escapeHtml } from '../core/Utils';
import type { GameEntity } from '../entities/EntityManager';
import type { TextureAtlas } from '../render/TextureAtlas';
import type { Inventory } from './Inventory';

export interface GameSettings {
  renderDistance: number;
  resolution: number;
  fov: number;
  sensitivity: number;
  volume: number;
  music: boolean;
  sfx: boolean;
  invertY: boolean;
  showHints: boolean;
  cameraShake: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  renderDistance: 5,
  resolution: 1,
  fov: 75,
  sensitivity: 0.0022,
  volume: 0.55,
  music: true,
  sfx: true,
  invertY: false,
  showHints: true,
  cameraShake: true,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem('voxelforge.settings');
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as GameSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem('voxelforge.settings', JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

interface SaveSummary {
  template: string;
  templateName: string;
  day: number;
  playTime: number;
  savedAt: number;
  level: number;
}

function readSaveSummary(): SaveSummary | null {
  try {
    const raw = localStorage.getItem('voxelforge.save.latest');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      template: data.templateKey ?? 'creative',
      templateName: data.templateName ?? 'Saved World',
      day: data.dayCount ?? 1,
      playTime: data.stats?.playTime ?? 0,
      savedAt: data.savedAt ?? Date.now(),
      level: data.player?.level ?? 0,
    };
  } catch {
    return null;
  }
}

export interface MainMenuCallbacks {
  onStart: (template: GameTemplate) => void;
  onContinue: () => void;
  onSettings: () => void;
  onGuide: () => void;
}

export interface PauseCallbacks {
  onResume: () => void;
  onInventory: () => void;
  onSettings: () => void;
  onSave: () => void;
  onStudio: () => void;
  onScripts: () => void;
  onPublish: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export interface EndCallbacks {
  onRespawn: () => void;
  onContinue: () => void;
  onMenu: () => void;
  onRestart: () => void;
}

export interface EndStats {
  win: boolean;
  title: string;
  subtitle: string;
  playTime: number;
  kills: number;
  blocks: number;
  objectives: number;
  level: number;
}

const TIPS = [
  'Hold left mouse to mine. Stone needs a pickaxe to drop anything useful.',
  'Right-click a crafting table to unlock the full recipe book.',
  'Press F in creative worlds to fly. Space and Ctrl control altitude.',
  'Mobs cannot see you through solid walls — use terrain to break line of sight.',
  'Torches are cheap. The dark is not empty.',
  'Sneak (Ctrl) to avoid walking off ledges. Your future self will thank you.',
  'B opens the Studio: paint terrain, stamp prefabs and place Blockbench models.',
  'Lanterns, glowstone and crystals all emit real block light.',
  'A shield in your hotbar reduces incoming damage while held.',
  'The Studio can export a complete project as JSON — edits, entities, rules and all.',
];

/**
 * Front-end shell: title screen, template picker, loading, pause, settings,
 * guide and the victory/defeat screen.
 */
export class Menus {
  readonly el: HTMLDivElement;
  private root: HTMLElement;
  private mainEl?: HTMLDivElement;
  private loadingEl?: HTMLDivElement;
  private pauseEl?: HTMLDivElement;
  private endEl?: HTMLDivElement;
  private modalEl?: HTMLDivElement;
  private loadingTitle?: HTMLElement;
  private loadingSub?: HTMLElement;
  private loadFill?: HTMLElement;
  private loadLabel?: HTMLElement;
  private loadDetail?: HTMLElement;
  private loadingTip?: HTMLElement;
  private tipTimer?: number;
  private disposed = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = 'menus';
    root.appendChild(this.el);
    const style = document.createElement('style');
    style.textContent = '.menus{position:absolute;inset:0;pointer-events:none;z-index:50}.menus > *{pointer-events:auto}';
    document.head.appendChild(style);
  }

  showMain(callbacks: MainMenuCallbacks): void {
    this.hideMain();
    const save = readSaveSummary();
    const cards = TEMPLATES.map((template) => this.templateCard(template)).join('');
    const main = document.createElement('div');
    main.className = 'menu-screen';
    main.innerHTML = `
      <div class="menu-top">
        <div class="brand">
          <div class="brand-mark">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 2 30 10v12L16 30 2 22V10z" fill="#7ed957"/>
              <path d="M16 2 30 10l-14 8L2 10z" fill="#9aef70"/>
              <path d="M2 10v12l14 8V18z" fill="#4b9f3d"/>
              <path d="M16 18v12l14-8V10z" fill="#367a2f"/>
            </svg>
          </div>
          <div>
            <div class="brand-name">Voxel<em>Forge</em><span class="pill green menu-badge">1.1</span></div>
            <div class="brand-sub">Engine · Studio · Scripting · Publishing</div>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="menu-top-links">
          <button class="btn ghost small" data-menu="guide">Guide <kbd>?</kbd></button>
          <button class="btn ghost small" data-menu="settings">Settings</button>
        </div>
      </div>
      <div class="menu-wrap">
        <div class="menu-left">
          <div class="hero-eyebrow">A voxel engine, studio and publisher</div>
          <h1 class="hero-title">Forge worlds.<span class="line2">Ship games.</span></h1>
          <p class="hero-desc">
            ${TEMPLATES.length} complete game templates, <strong>five camera modes</strong>, a Scratch-style block editor
            with VoxelScript, a full in-browser studio with <strong>Blockbench import</strong>, and one-click web, desktop
            and mobile publishing. MCP-ready for AI co-pilots.
          </p>
          <div class="hero-actions">
            <button class="btn primary" data-menu="quickplay">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Play Creative Sandbox
            </button>
            ${save ? `<button class="btn gold" data-menu="continue">Continue · ${escapeHtml(save.templateName)}</button>` : ''}
            <button class="btn ghost" data-menu="guide">How to play</button>
          </div>
          <div class="hero-secondary">
            <span class="pill blue">Chromium / Edge / Firefox</span>
            <span class="pill green">No install</span>
            <span class="pill">Local saves</span>
          </div>
          <div class="feature-row">
            <span class="feature-chip"><span class="dot"></span>Voxel world</span>
            <span class="feature-chip"><span class="dot"></span>Blockbench</span>
            <span class="feature-chip"><span class="dot"></span>Level studio</span>
            <span class="feature-chip"><span class="dot"></span>Visual scripting</span>
            <span class="feature-chip"><span class="dot"></span>AI / MCP</span>
            <span class="feature-chip"><span class="dot"></span>Publish anywhere</span>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><b>${String(TEMPLATES.length).padStart(2, '0')}</b><span>Game templates</span></div>
            <div class="hero-stat"><b>05</b><span>Camera modes</span></div>
            <div class="hero-stat"><b>88</b><span>Block types</span></div>
            <div class="hero-stat"><b>100+</b><span>Recipes</span></div>
          </div>
        </div>
        <div class="menu-right">
          <div class="section-heading">
            <h2>Choose a world</h2>
            <p>${TEMPLATES.length} templates · ${save ? 'save detected' : 'new game'}</p>
          </div>
          <div class="template-scroll">
            <div class="template-grid">
              ${save ? this.continueCard(save) : ''}
              ${cards}
            </div>
          </div>
        </div>
      </div>
      <div class="menu-footer">
        <span>VoxelForge</span><span class="sep"></span>
        <a href="#" data-menu="guide">Controls</a><span class="sep"></span>
        <a href="#" data-menu="settings">Settings</a><span class="sep"></span>
        <span>TypeScript · Three.js · WebGL2</span>
        <div class="spacer" style="flex:1"></div>
        <span class="dot-live"></span><span>Local engine online</span>
      </div>
    `;
    this.el.appendChild(main);
    this.mainEl = main;

    main.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-menu]') as HTMLElement | null;
      if (target) {
        const action = target.dataset.menu;
        if (action === 'settings') callbacks.onSettings();
        else if (action === 'guide') callbacks.onGuide();
        else if (action === 'continue') callbacks.onContinue();
        else if (action === 'quickplay') callbacks.onStart(TEMPLATES[0]);
        event.preventDefault();
        return;
      }
      const card = (event.target as HTMLElement).closest('[data-template]') as HTMLElement | null;
      if (card) {
        const template = TEMPLATES.find((t) => t.key === card.dataset.template);
        if (template) callbacks.onStart(template);
      }
    });
  }

  private templateCard(template: GameTemplate): string {
    return `<div class="template-card" data-template="${template.key}" role="button" tabindex="0" style="--tc-accent:${template.accent}">
      <div class="tc-top">
        <div class="tc-icon" style="color:${template.accent};border-color:${template.accent}55;background:linear-gradient(145deg, ${template.accent}22, #0b1319)">
          ${template.icon}
        </div>
        <div style="min-width:0;flex:1">
          <div class="tc-title">${escapeHtml(template.name)}</div>
          <div class="tc-sub">${escapeHtml(template.subtitle)}</div>
        </div>
        <span class="pill ${template.difficulty === 'peaceful' ? 'green' : template.difficulty === 'nightmare' ? 'red' : template.difficulty === 'hard' ? 'gold' : 'blue'}">${difficultyLabel(template.difficulty)}</span>
      </div>
      <p class="tc-desc">${escapeHtml(template.description)}</p>
      <div class="tc-bottom">
        ${template.tags.slice(0, 3).map((tag) => `<span class="tc-tag">${escapeHtml(tag)}</span>`).join('')}
        <span class="tc-play">Play →</span>
      </div>
    </div>`;
  }

  private continueCard(save: SaveSummary): string {
    return `<div class="template-card continue-card" data-menu="continue" role="button" tabindex="0" style="--tc-accent:#8ce05f">
      <div class="tc-top">
        <div class="tc-icon" style="color:#b8f68d;border-color:#5c8d44;background:linear-gradient(145deg,#33562a,#0b1319)">▸</div>
        <div style="min-width:0;flex:1">
          <div class="tc-title">${escapeHtml(save.templateName)}</div>
          <div class="tc-sub">Saved world · level ${save.level}</div>
        </div>
        <span class="pill green">Continue</span>
      </div>
      <div class="continue-meta">
        <span>Day <b>${save.day}</b></span>
        <span>Played <b>${formatClock(save.playTime)}</b></span>
        <span class="muted">${new Date(save.savedAt).toLocaleDateString()}</span>
      </div>
    </div>`;
  }

  hideMain(): void {
    this.mainEl?.remove();
    this.mainEl = undefined;
  }

  showLoading(templateName: string, subtitle: string): void {
    this.hideLoading();
    const screen = document.createElement('div');
    screen.className = 'loading-screen';
    screen.innerHTML = `
      <div class="loading-card">
        <div class="loader-cubes">
          <div class="loader-cube"></div><div class="loader-cube"></div><div class="loader-cube"></div><div class="loader-cube"></div>
        </div>
        <div class="loading-title">Forging ${escapeHtml(templateName)}</div>
        <div class="loading-sub">${escapeHtml(subtitle)}</div>
        <div class="load-bar"><div class="load-fill"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-family:var(--mono);font-size:9px;color:#7f9789">
          <span class="load-label">Preparing terrain…</span><span class="load-detail">0%</span>
        </div>
        <div class="loading-tip">Tip: hold left mouse to mine; the crack meter shows progress.</div>
      </div>
    `;
    this.el.appendChild(screen);
    this.loadingEl = screen;
    this.loadingTitle = screen.querySelector('.loading-title') as HTMLElement;
    this.loadingSub = screen.querySelector('.loading-sub') as HTMLElement;
    this.loadFill = screen.querySelector('.load-fill') as HTMLElement;
    this.loadLabel = screen.querySelector('.load-label') as HTMLElement;
    this.loadDetail = screen.querySelector('.load-detail') as HTMLElement;
    this.loadingTip = screen.querySelector('.loading-tip') as HTMLElement;
    let tip = 0;
    this.loadingTip.textContent = `Tip: ${TIPS[tip]}`;
    this.tipTimer = window.setInterval(() => {
      if (!this.loadingTip) return;
      tip = (tip + 1) % TIPS.length;
      this.loadingTip.textContent = `Tip: ${TIPS[tip]}`;
    }, 3200);
  }

  setLoading(fraction: number, label: string, detail?: string): void {
    if (!this.loadFill) return;
    const pct = Math.max(0, Math.min(1, fraction));
    this.loadFill.style.width = `${pct * 100}%`;
    if (this.loadLabel) this.loadLabel.textContent = label;
    if (this.loadDetail) this.loadDetail.textContent = detail ?? `${Math.round(pct * 100)}%`;
  }

  setLoadingTitle(title: string, sub?: string): void {
    if (this.loadingTitle) this.loadingTitle.textContent = title;
    if (sub && this.loadingSub) this.loadingSub.textContent = sub;
  }

  hideLoading(): void {
    if (this.tipTimer) window.clearInterval(this.tipTimer);
    this.tipTimer = undefined;
    this.loadingEl?.remove();
    this.loadingEl = undefined;
  }

  showPause(data: {
    title: string;
    subtitle: string;
    day: number;
    playTime: number;
    stats: { kills: number; blocksMined: number; blocksPlaced: number; objectives: number; totalObjectives: number };
    inStudio: boolean;
  }, callbacks: PauseCallbacks): void {
    this.hidePause();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:min(640px,calc(100vw - 32px))">
        <div class="modal-head">
          <div>
            <h3>Paused</h3>
            <div class="sub">${escapeHtml(data.title)} · Day ${data.day} · ${formatClock(data.playTime)}</div>
          </div>
          <div class="spacer"></div>
          <span class="pill green">${data.inStudio ? 'Studio' : 'Playing'}</span>
        </div>
        <div class="modal-body">
          <div class="grid-2" style="gap:20px">
            <div>
              <div class="inv-side-title">Session</div>
              <div class="stat-line"><span>Enemies slain</span><b>${data.stats.kills}</b></div>
              <div class="stat-line"><span>Blocks mined</span><b>${data.stats.blocksMined}</b></div>
              <div class="stat-line"><span>Blocks placed</span><b>${data.stats.blocksPlaced}</b></div>
              <div class="stat-line"><span>Objectives</span><b>${data.stats.objectives} / ${data.stats.totalObjectives}</b></div>
              <div class="divider"></div>
              <div style="display:flex;gap:7px;flex-wrap:wrap">
                <button class="btn primary" data-pause="resume">Resume <kbd>Esc</kbd></button>
                <button class="btn ghost" data-pause="inventory">Inventory</button>
              </div>
            </div>
            <div>
              <div class="inv-side-title">World</div>
              <button class="btn ghost wide" data-pause="save" style="margin-bottom:7px">Save world</button>
              <button class="btn ghost wide" data-pause="studio" style="margin-bottom:7px">${data.inStudio ? 'Back to play' : 'Open studio'}</button>
              <button class="btn ghost wide" data-pause="scripts" style="margin-bottom:7px">Script studio</button>
              <button class="btn ghost wide" data-pause="publish" style="margin-bottom:7px">Publish / AI control</button>
              <button class="btn ghost wide" data-pause="settings" style="margin-bottom:7px">Settings</button>
              <button class="btn ghost wide" data-pause="restart" style="margin-bottom:7px">Restart world</button>
              <button class="btn danger wide" data-pause="menu">Save &amp; main menu</button>
            </div>
          </div>
          <div class="divider"></div>
          <div class="controls-list" style="font-size:10px;color:#8ba1ad">
            <div class="control-row"><span>Move</span><span class="keys"><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span></span></div>
            <div class="control-row"><span>Jump / fly up</span><span class="keys"><span class="kbd">Space</span></span></div>
            <div class="control-row"><span>Sprint / fly down</span><span class="keys"><span class="kbd">Shift</span></span></div>
            <div class="control-row"><span>Sneak / descend</span><span class="keys"><span class="kbd">Ctrl</span></span></div>
            <div class="control-row"><span>Mine / attack</span><span class="keys"><span class="kbd">LMB</span></span></div>
            <div class="control-row"><span>Place / interact</span><span class="keys"><span class="kbd">RMB</span></span></div>
            <div class="control-row"><span>Camera mode</span><span class="keys"><span class="kbd">F5</span></span></div>
            <div class="control-row"><span>Drive / exit vehicle</span><span class="keys"><span class="kbd">F6</span></span></div>
            <div class="control-row"><span>Debug</span><span class="keys"><span class="kbd">F3</span></span></div>
          </div>
        </div>
      </div>
    `;
    this.el.appendChild(overlay);
    this.pauseEl = overlay;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        callbacks.onResume();
        return;
      }
      const btn = (event.target as HTMLElement).closest('[data-pause]') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.pause;
      if (action === 'resume') callbacks.onResume();
      else if (action === 'inventory') callbacks.onInventory();
      else if (action === 'settings') callbacks.onSettings();
      else if (action === 'save') callbacks.onSave();
      else if (action === 'studio') callbacks.onStudio();
      else if (action === 'scripts') callbacks.onScripts();
      else if (action === 'publish') callbacks.onPublish();
      else if (action === 'restart') callbacks.onRestart();
      else if (action === 'menu') callbacks.onMenu();
    });
  }

  hidePause(): void {
    this.pauseEl?.remove();
    this.pauseEl = undefined;
  }

  showEnd(stats: EndStats, callbacks: EndCallbacks): void {
    this.hideEnd();
    const overlay = document.createElement('div');
    overlay.className = 'end-screen';
    overlay.innerHTML = `
      <div class="end-card">
        <div class="end-kicker">${stats.win ? 'World conquered' : 'Session ended'}</div>
        <div class="end-title ${stats.win ? 'win' : ''}">${escapeHtml(stats.title)}</div>
        <div class="end-sub">${escapeHtml(stats.subtitle)}</div>
        <div class="end-stats">
          <div class="end-stat"><b>${formatClock(stats.playTime)}</b><span>Play time</span></div>
          <div class="end-stat"><b>${stats.kills}</b><span>Enemies</span></div>
          <div class="end-stat"><b>${stats.blocks}</b><span>Blocks</span></div>
          <div class="end-stat"><b>${stats.level}</b><span>Level</span></div>
        </div>
        <div class="muted tiny" style="margin-bottom:18px">${stats.objectives} objective${stats.objectives === 1 ? '' : 's'} completed</div>
        <div class="end-actions">
          ${stats.win
            ? '<button class="btn primary" data-end="continue">Keep exploring</button><button class="btn ghost" data-end="menu">Main menu</button>'
            : '<button class="btn primary" data-end="respawn">Respawn</button><button class="btn ghost" data-end="restart">Restart world</button><button class="btn ghost" data-end="menu">Main menu</button>'}
        </div>
      </div>
    `;
    this.el.appendChild(overlay);
    this.endEl = overlay;
    overlay.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest('[data-end]') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.end;
      if (action === 'respawn') callbacks.onRespawn();
      else if (action === 'continue') callbacks.onContinue();
      else if (action === 'restart') callbacks.onRestart();
      else if (action === 'menu') callbacks.onMenu();
    });
  }

  hideEnd(): void {
    this.endEl?.remove();
    this.endEl = undefined;
  }

  openSettings(settings: GameSettings, onChange: (settings: GameSettings) => void): void {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const s = { ...settings };
    overlay.innerHTML = `
      <div class="modal wide" style="width:min(780px,calc(100vw - 32px))">
        <div class="modal-head">
          <div><h3>Settings</h3><div class="sub">Rendering, controls and audio</div></div>
          <div class="spacer"></div>
          <button class="close-x" data-settings-close>✕</button>
        </div>
        <div class="modal-body">
          <div class="settings-grid">
            <div class="settings-section">
              <h4>Video</h4>
              <div class="field">
                <label>Render distance <span class="hint">chunks</span></label>
                <input class="input" type="range" min="3" max="9" step="1" value="${s.renderDistance}" data-setting="renderDistance"/>
                <div class="tiny muted" style="margin-top:4px"><span data-value="renderDistance">${s.renderDistance}</span> chunks</div>
              </div>
              <div class="field">
                <label>Resolution scale</label>
                <input class="input" type="range" min="0.5" max="1.5" step="0.1" value="${s.resolution}" data-setting="resolution"/>
                <div class="tiny muted" style="margin-top:4px"><span data-value="resolution">${s.resolution.toFixed(1)}</span>×</div>
              </div>
              <div class="field">
                <label>Field of view <span class="hint">degrees</span></label>
                <input class="input" type="range" min="60" max="100" step="1" value="${s.fov}" data-setting="fov"/>
                <div class="tiny muted" style="margin-top:4px"><span data-value="fov">${s.fov}</span>°</div>
              </div>
              <label class="toggle"><input type="checkbox" data-setting="showHints" ${s.showHints ? 'checked' : ''}/> Show control hints</label>
              <label class="toggle" style="margin-top:9px"><input type="checkbox" data-setting="cameraShake" ${s.cameraShake ? 'checked' : ''}/> Camera shake</label>
            </div>
            <div class="settings-section">
              <h4>Controls &amp; audio</h4>
              <div class="field">
                <label>Mouse sensitivity</label>
                <input class="input" type="range" min="0.0008" max="0.005" step="0.0001" value="${s.sensitivity}" data-setting="sensitivity"/>
                <div class="tiny muted" style="margin-top:4px"><span data-value="sensitivity">${(s.sensitivity * 1000).toFixed(1)}</span></div>
              </div>
              <div class="field">
                <label>Master volume</label>
                <input class="input" type="range" min="0" max="1" step="0.05" value="${s.volume}" data-setting="volume"/>
                <div class="tiny muted" style="margin-top:4px"><span data-value="volume">${Math.round(s.volume * 100)}</span>%</div>
              </div>
              <label class="toggle"><input type="checkbox" data-setting="music" ${s.music ? 'checked' : ''}/> Ambient music</label>
              <label class="toggle" style="margin-top:9px"><input type="checkbox" data-setting="sfx" ${s.sfx ? 'checked' : ''}/> Sound effects</label>
              <label class="toggle" style="margin-top:9px"><input type="checkbox" data-setting="invertY" ${s.invertY ? 'checked' : ''}/> Invert mouse Y</label>
              <div class="divider"></div>
              <div class="muted tiny" style="line-height:1.8">Settings are saved to this browser. Lower render distance and resolution on integrated GPUs for a smoother frame rate.</div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span class="muted tiny">Changes apply immediately</span>
          <div class="spacer"></div>
          <button class="btn primary" data-settings-close>Done</button>
        </div>
      </div>
    `;
    this.el.appendChild(overlay);
    this.modalEl = overlay;
    const apply = () => {
      saveSettings(s);
      onChange({ ...s });
      for (const key of ['renderDistance', 'resolution', 'fov', 'sensitivity', 'volume'] as const) {
        const span = overlay.querySelector(`[data-value="${key}"]`) as HTMLElement | null;
        if (!span) continue;
        if (key === 'resolution') span.textContent = s[key].toFixed(1);
        else if (key === 'sensitivity') span.textContent = (s[key] * 1000).toFixed(1);
        else if (key === 'volume') span.textContent = String(Math.round(s[key] * 100));
        else span.textContent = String(s[key]);
      }
    };
    overlay.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      const key = input.dataset.setting as keyof GameSettings | undefined;
      if (!key) return;
      if (input.type === 'checkbox') (s[key] as boolean) = input.checked;
      else (s[key] as number) = Number(input.value);
      apply();
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || (event.target as HTMLElement).closest('[data-settings-close]')) {
        apply();
        this.closeModal();
      }
    });
  }

  openGuide(): void {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal wide" style="width:min(850px,calc(100vw - 32px))">
        <div class="modal-head">
          <div><h3>Field Guide</h3><div class="sub">Everything you need to survive the first night</div></div>
          <div class="spacer"></div>
          <button class="close-x" data-guide-close>✕</button>
        </div>
        <div class="modal-body">
          <div class="grid-2" style="gap:24px">
            <div>
              <div class="inv-side-title">Controls</div>
              <div class="controls-list" style="grid-template-columns:1fr">
                <div class="control-row"><span>Move</span><span class="keys"><span class="kbd">WASD</span></span></div>
                <div class="control-row"><span>Jump / swim up</span><span class="keys"><span class="kbd">Space</span></span></div>
                <div class="control-row"><span>Sprint</span><span class="keys"><span class="kbd">Shift</span></span></div>
                <div class="control-row"><span>Sneak / descend</span><span class="keys"><span class="kbd">Ctrl</span></span></div>
                <div class="control-row"><span>Mine / attack</span><span class="keys"><span class="kbd">LMB</span></span></div>
                <div class="control-row"><span>Place / interact</span><span class="keys"><span class="kbd">RMB</span></span></div>
                <div class="control-row"><span>Inventory &amp; crafting</span><span class="keys"><span class="kbd">E</span></span></div>
                <div class="control-row"><span>Studio editor</span><span class="keys"><span class="kbd">B</span></span></div>
                <div class="control-row"><span>Toggle flight</span><span class="keys"><span class="kbd">F</span></span></div>
                <div class="control-row"><span>Cycle camera modes</span><span class="keys"><span class="kbd">F5</span></span></div>
                <div class="control-row"><span>Enter / exit vehicle</span><span class="keys"><span class="kbd">F6</span></span></div>
                <div class="control-row"><span>Drop held item</span><span class="keys"><span class="kbd">Q</span></span></div>
                <div class="control-row"><span>Hotbar slots</span><span class="keys"><span class="kbd">1</span>–<span class="kbd">9</span></span></div>
                <div class="control-row"><span>Pause / release mouse</span><span class="keys"><span class="kbd">Esc</span></span></div>
              </div>
            </div>
            <div>
              <div class="inv-side-title">Getting started</div>
              <div style="font-size:12px;line-height:1.75;color:#a9bdc4">
                <p><strong style="color:#dcebe1">1. Punch a tree.</strong> Oak logs drop from oak trees. Turn them into planks in the crafting tab (E), then sticks and a crafting table.</p>
                <p><strong style="color:#dcebe1">2. Find stone.</strong> Dig down a few blocks or find a cliff. Cobblestone makes stone tools — much faster than your fists.</p>
                <p><strong style="color:#dcebe1">3. Light the night.</strong> Torches need coal and a stick. Place them around your shelter before the sun goes down.</p>
                <p><strong style="color:#dcebe1">4. Build a shelter.</strong> Any enclosed space works. Mobs cannot path through solid walls, and a door keeps them out.</p>
                <p><strong style="color:#dcebe1">5. Follow objectives.</strong> The panel at the top-left tracks your current goals. Complete them all to win the template.</p>
              </div>
              <div class="divider"></div>
              <div class="inv-side-title">Studio, scripts &amp; publishing</div>
              <p style="font-size:12px;line-height:1.7;color:#a9bdc4">Press <span class="kbd">B</span> to open the studio. Paint terrain, stamp prefabs, spawn creatures and edit names, dialogue and world rules. Open <strong style="color:#dcebe1">Scripts</strong> from the studio top bar or the pause menu to build Scratch-style rules or write VoxelScript. <strong style="color:#dcebe1">Publish</strong> exports a standalone web, desktop, Android or iOS package.</p>
              <div class="divider"></div>
              <div class="inv-side-title">Cameras &amp; AI</div>
              <p style="font-size:12px;line-height:1.7;color:#a9bdc4"><span class="kbd">F5</span> cycles first-person, third-person, isometric, top-down and side view. <span class="kbd">F6</span> enters the kart or car. The Publish panel's <strong style="color:#dcebe1">AI control</strong> tab connects a local MCP server so an agent can inspect state, edit scripts and ship builds.</p>
              <div class="feature-row" style="margin-top:12px">
                <span class="feature-chip"><span class="dot"></span>Blockbench .bbmodel import</span>
                <span class="feature-chip"><span class="dot"></span>Visual + text scripting</span>
                <span class="feature-chip"><span class="dot"></span>${TEMPLATES.length} templates</span>
                <span class="feature-chip"><span class="dot"></span>5 cameras</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-foot"><div class="spacer"></div><button class="btn primary" data-guide-close>Got it</button></div>
      </div>
    `;
    this.el.appendChild(overlay);
    this.modalEl = overlay;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || (event.target as HTMLElement).closest('[data-guide-close]')) this.closeModal();
    });
  }

  openModal(html: string): HTMLDivElement {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = html;
    this.el.appendChild(overlay);
    this.modalEl = overlay;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeModal();
    });
    return overlay;
  }

  closeModal(): void {
    this.modalEl?.remove();
    this.modalEl = undefined;
  }

  get hasModal(): boolean {
    return !!this.modalEl;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hideMain();
    this.hideLoading();
    this.hidePause();
    this.hideEnd();
    this.closeModal();
    this.el.remove();
  }
}

/* ================================================================== */
/*  DIALOGUE / SHOPS                                                   */
/* ================================================================== */

export interface DialogueActions {
  onClose: () => void;
  onAcceptQuest: () => void;
  onOpenShop: () => void;
  onCompleteQuest: () => void;
  hasQuest: boolean;
  questActive: boolean;
  questComplete: boolean;
  questTitle?: string;
}

export class DialogueUI {
  readonly el: HTMLDivElement;
  private game: { audio: { play: (name: 'click' | 'open' | 'close' | 'quest' | 'pickup' | 'error') => void }; uiOpen: boolean; player: { coins: number; inventory: Inventory }; atlas: TextureAtlas; toast: (msg: string, kind?: 'info' | 'good' | 'warn' | 'bad') => void; onOverlayClosed: () => void; closeOtherOverlays: (except: string) => void };
  private current?: GameEntity;
  private typeTimer?: number;
  private openState = false;
  private closeHandler?: () => void;
  private questInfo?: { active: boolean; complete: boolean; title?: string };

  constructor(root: HTMLElement, game: DialogueUI['game']) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'dialog-wrap hidden';
    root.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(entity: GameEntity, actions: DialogueActions): void {
    this.current = entity;
    this.closeHandler = actions.onClose;
    this.questInfo = { active: actions.questActive, complete: actions.questComplete, title: actions.questTitle };
    this.openState = true;
    this.el.classList.remove('hidden');
    this.game.uiOpen = true;
    this.game.closeOtherOverlays('dialogue');
    this.game.audio.play('open');

    const asset = getAsset(entity.def.assetKey);
    const portrait = asset?.portrait;
    const text = entity.dialogue ?? '...';
    this.el.innerHTML = `
      <div class="dialog-card">
        <div class="dialog-top">
          ${portrait ? `<img class="speaker-avatar" src="${portrait}" alt=""/>` : '<div class="speaker-avatar"></div>'}
          <div>
            <div class="dialog-name">${escapeHtml(entity.displayName)}</div>
            <div class="dialog-role">${escapeHtml(entity.role)}${entity.boss ? ' · BOSS' : ''}</div>
          </div>
          ${this.questInfo.active ? `<span class="pill gold" style="margin-left:auto">Quest: ${escapeHtml(this.questInfo.title ?? 'Active')}</span>` : ''}
        </div>
        <div class="dialog-text"></div>
        <div class="dialog-actions">
          ${entity.shop ? '<button class="btn gold small" data-dialog="shop">Trade</button>' : ''}
          ${actions.hasQuest && !actions.questActive && !actions.questComplete ? '<button class="btn primary small" data-dialog="accept">Accept quest</button>' : ''}
          ${actions.questComplete ? '<button class="btn primary small" data-dialog="complete">Turn in quest</button>' : ''}
          <button class="btn ghost small" data-dialog="close">${actions.questActive ? 'Leave' : actions.hasQuest ? 'Not now' : 'Farewell'}</button>
        </div>
      </div>
    `;
    const textEl = this.el.querySelector('.dialog-text') as HTMLElement;
    let index = 0;
    if (this.typeTimer) window.clearInterval(this.typeTimer);
    this.typeTimer = window.setInterval(() => {
      index += 2;
      textEl.textContent = text.slice(0, index);
      if (index >= text.length) {
        if (this.typeTimer) window.clearInterval(this.typeTimer);
        this.typeTimer = undefined;
      }
    }, 16);
    textEl.addEventListener('click', () => {
      if (this.typeTimer) window.clearInterval(this.typeTimer);
      this.typeTimer = undefined;
      textEl.textContent = text;
    });

    this.el.querySelectorAll('[data-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = (button as HTMLElement).dataset.dialog;
        if (action === 'shop') actions.onOpenShop();
        else if (action === 'accept') actions.onAcceptQuest();
        else if (action === 'complete') actions.onCompleteQuest();
        else this.close();
      });
    });
  }

  updateQuest(active: boolean, complete: boolean, title?: string): void {
    this.questInfo = { active, complete, title };
    if (!this.openState) return;
    const actions = this.el.querySelector('.dialog-actions');
    if (!actions) return;
    if (active) {
      actions.querySelector('[data-dialog="accept"]')?.remove();
      const closeButton = actions.querySelector<HTMLElement>('[data-dialog="close"]');
      if (closeButton) closeButton.textContent = 'Leave';
      const top = this.el.querySelector('.dialog-top');
      if (top && !top.querySelector('[data-dialog-quest-pill]')) {
        const pill = document.createElement('span');
        pill.className = 'pill gold';
        pill.dataset.dialogQuestPill = 'true';
        pill.style.marginLeft = 'auto';
        pill.textContent = `Quest: ${title ?? 'Active'}`;
        top.appendChild(pill);
      }
    }
    if (complete && !actions.querySelector('[data-dialog="complete"]')) {
      const button = document.createElement('button');
      button.className = 'btn primary small';
      button.dataset.dialog = 'complete';
      button.textContent = 'Turn in quest';
      actions.prepend(button);
    }
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    if (this.typeTimer) window.clearInterval(this.typeTimer);
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    const handler = this.closeHandler;
    this.closeHandler = undefined;
    handler?.();
    this.game.uiOpen = false;
    this.game.audio.play('close');
    this.game.onOverlayClosed();
  }

  dispose(): void {
    if (this.typeTimer) window.clearInterval(this.typeTimer);
    this.el.remove();
  }
}

export interface ShopHost {
  player: { coins: number; inventory: Inventory };
  atlas: TextureAtlas;
  audio: { play: (name: string) => void };
  toast: (message: string, kind?: 'info' | 'good' | 'warn' | 'bad') => void;
}

export function openShop(root: HTMLElement, host: ShopHost, entity: GameEntity, onClose: () => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const offers = entity.shop ?? [];
  const render = () => {
    overlay.innerHTML = `
      <div class="modal" style="width:min(620px,calc(100vw - 32px))">
        <div class="modal-head">
          <div><h3>${escapeHtml(entity.displayName)}</h3><div class="sub">Wandering merchant · ${host.player.coins} coins</div></div>
          <div class="spacer"></div>
          <span class="pill gold">◈ ${host.player.coins}</span>
          <button class="close-x" data-shop-close>✕</button>
        </div>
        <div class="modal-body">
          <div class="recipe-list" style="max-height:none">
            ${offers.map((offer, i) => {
              const def = itemName(offer.item);
              const count = offer.count ?? 1;
              const affordable = host.player.coins >= offer.price;
              return `<div class="recipe-row">
                <img class="recipe-icon" src="${itemIcon(offer.item, host.atlas)}" alt="" style="image-rendering:pixelated"/>
                <div class="recipe-info"><div class="recipe-name">${escapeHtml(def)} ${count > 1 ? `×${count}` : ''}</div><div class="recipe-cost">◈ ${offer.price} · ${escapeHtml(ITEM_INFO(offer.item))}</div></div>
                <button class="craft-btn" data-buy="${i}" ${affordable ? '' : 'disabled'}>Buy</button>
              </div>`;
            }).join('') || '<div class="empty">This merchant has nothing in stock.</div>'}
          </div>
        </div>
        <div class="modal-foot"><span class="muted tiny">Click Buy to purchase. Items go straight to your inventory.</span><div class="spacer"></div><button class="btn ghost small" data-shop-close>Leave</button></div>
      </div>
    `;
    overlay.querySelectorAll('[data-shop-close]').forEach((b) => b.addEventListener('click', close));
    overlay.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const index = Number((b as HTMLElement).dataset.buy);
      const offer = offers[index];
      if (!offer || host.player.coins < offer.price) {
        host.audio.play('error');
        return;
      }
      const count = offer.count ?? 1;
      const leftover = host.player.inventory.add(offer.item, count);
      if (leftover === count) {
        host.toast('Your inventory is full.', 'warn');
        host.audio.play('error');
        return;
      }
      host.player.coins -= offer.price;
      host.audio.play('pickup');
      host.toast(`Bought ${itemName(offer.item)} ×${count - leftover}`, 'good');
      render();
    }));
  };
  render();
  root.appendChild(overlay);
  const close = () => {
    overlay.remove();
    onClose();
  };
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  return overlay;
}

function ITEM_INFO(key: string): string {
  return itemName(key);
}
