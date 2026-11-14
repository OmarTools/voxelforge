import type { Game, ObjectiveState } from './Game';
import { itemIcon, itemOrNull } from '../../content/Recipes';
import { blockById } from '../world/Blocks';
import { formatClock } from '../core/Utils';

const HEART_COUNT = 10;
const HUNGER_COUNT = 10;
const AIR_COUNT = 10;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

/**
 * In-game heads-up display: vitals, hotbar, objectives, minimap, boss bar,
 * crosshair/break meter, interaction prompts, toasts and the debug overlay.
 */
export class HUD {
  readonly el: HTMLDivElement;
  private game: Game;

  private damageVignette: HTMLDivElement;
  private underwaterTint: HTMLDivElement;
  private sessionName: HTMLDivElement;
  private sessionIcon: HTMLDivElement;
  private sessionClock: HTMLElement;
  private objectivePanel: HTMLDivElement;
  private objectiveList: HTMLDivElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCoords: HTMLDivElement;
  private minimapLabel: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private breakMeter: HTMLDivElement;
  private breakFill: HTMLDivElement;
  private interactHint: HTMLDivElement;
  private hearts: HTMLDivElement;
  private hunger: HTMLDivElement;
  private airbar: HTMLDivElement;
  private vitals: HTMLDivElement;
  private hotbar: HTMLDivElement;
  private hotbarSignature = '';
  private objectiveSignature = '';
  private waveBanner: HTMLDivElement;
  private waveTimer?: number;
  private toastStack: HTMLDivElement;
  private debug: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private racePanel: HTMLDivElement;
  private racePosition: HTMLSpanElement;
  private raceLap: HTMLSpanElement;
  private raceClock: HTMLDivElement;
  private raceLast: HTMLSpanElement;
  private raceBest: HTMLSpanElement;
  private raceSpeed: HTMLElement;
  private raceWarning: HTMLDivElement;
  private raceStandings: HTMLDivElement;
  private raceSignature = '';
  private simPanel: HTMLDivElement;
  private simKicker: HTMLSpanElement;
  private simTitle: HTMLSpanElement;
  private simRows: HTMLDivElement;
  private simProgress: HTMLDivElement;
  private simProgressLabel: HTMLDivElement;
  private simBar: HTMLDivElement;
  private simActions: HTMLDivElement;
  private simFooter: HTMLDivElement;
  private simSignature = '';
  private lastSim = 0;
  private xpFill: HTMLDivElement;
  private levelLabel: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private lastVitals = 0;
  private lastMinimap = 0;
  private lastFps = 0;
  private minimapAcc = 0;
  private fps = 60;

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    this.el = el('div', 'hud');
    if (game.input.touchMode) this.el.classList.add('touch-mode');
    this.el.innerHTML = `
      <div class="damage-vignette"></div>
      <div class="hud-underwater"></div>
      <div class="hud-top-left">
        <div class="session-card clickable" data-role="pause">
          <div class="session-icon"></div>
          <div style="min-width:0">
            <div class="session-label">Current World</div>
            <div class="session-name">—</div>
          </div>
          <div class="session-time"><b>--:--</b><span>Day 1</span></div>
        </div>
        <div class="objective-panel">
          <div class="objective-head">Objectives</div>
          <div class="objective-list"></div>
        </div>
      </div>
      <div class="hud-top-right">
        <div class="minimap clickable" data-role="map">
          <canvas width="384" height="384"></canvas>
          <div class="minimap-label">FORGEHEART</div>
          <div class="minimap-coords">0, 0</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn ghost small clickable" data-role="inventory">Inventory <kbd>E</kbd></button>
          <button class="btn ghost small icon clickable" data-role="pause" title="Pause (Esc)">II</button>
        </div>
      </div>
      <div class="hud-center">
        <div class="crosshair"></div>
        <div class="break-meter"><div></div></div>
        <div class="interact-hint hidden"></div>
      </div>
      <div class="wave-banner hidden">
        <div class="kicker"></div>
        <div class="big"></div>
        <div class="sub"></div>
      </div>
      <div style="position:absolute;top:64px;left:50%;transform:translateX(-50%);width:min(440px,60vw);display:none;pointer-events:none" class="boss-wrap">
        <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#ffb3a6;text-shadow:0 1px 3px #000;margin-bottom:3px">
          <span class="boss-name"></span><span class="boss-hp"></span>
        </div>
        <div style="height:7px;border:1px solid #5c2a2a;background:rgba(10,5,5,.72);box-shadow:0 3px 14px rgba(0,0,0,.4)">
          <div class="boss-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#c2463d,#ff7c5c);transition:width .25s"></div>
        </div>
      </div>
      <div class="race-panel hidden">
        <div class="race-top">
          <span class="race-position">P1</span>
          <span class="race-lap">LAP 1/3</span>
        </div>
        <div class="race-clock">0:00.00</div>
        <div class="race-lines">
          <span class="race-last">LAST --</span>
          <span class="race-best">BEST --</span>
        </div>
        <div class="race-speed"><b>0</b><span>km/h</span></div>
        <div class="race-warning hidden">WRONG WAY</div>
        <div class="race-standings"></div>
      </div>
      <div class="sim-panel hidden">
        <div class="sim-head">
          <span class="sim-kicker"></span>
          <span class="sim-title"></span>
        </div>
        <div class="sim-rows"></div>
        <div class="sim-progress hidden">
          <div class="sim-progress-label"></div>
          <div class="sim-bar"><i></i></div>
        </div>
        <div class="sim-actions"></div>
        <div class="sim-footer"></div>
      </div>
      <div class="hud-bottom">
        <div class="vitals">
          <div class="vital-group hearts"></div>
          <div class="vital-group hunger"></div>
          <div class="vital-group airbar"></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;width:100%;padding:0 2px">
          <div style="font-family:var(--mono);font-size:9px;color:#bce85d;text-shadow:0 1px 2px #000;min-width:30px">Lv <span class="level-label">0</span></div>
          <div style="flex:1;height:4px;background:rgba(0,0,0,.45);border:1px solid #38503d">
            <div class="xp-fill" style="height:100%;width:0%;background:#8ce05f;box-shadow:0 0 8px rgba(140,224,95,.4);transition:width .2s"></div>
          </div>
          <div style="font-family:var(--mono);font-size:9px;color:#e6c46a;text-shadow:0 1px 2px #000">◈ <span class="coin-label">0</span></div>
        </div>
        <div class="hotbar-wrap">
          <div class="hotbar"></div>
        </div>
      </div>
      <div class="hud-hints">
        <span class="kbd">WASD</span> move <span class="kbd">Space</span> jump <span class="kbd">Shift</span> sprint<br/>
        <span class="kbd">E</span> inventory <span class="kbd">B</span> studio <span class="kbd">F5</span> camera <span class="kbd">F6</span> vehicle
      </div>
      <div class="hud-debug hidden"></div>
      <div class="toast-stack"></div>
    `;
    root.appendChild(this.el);

    this.damageVignette = this.el.querySelector('.damage-vignette') as HTMLDivElement;
    this.underwaterTint = this.el.querySelector('.hud-underwater') as HTMLDivElement;
    this.sessionName = this.el.querySelector('.session-name') as HTMLDivElement;
    this.sessionIcon = this.el.querySelector('.session-icon') as HTMLDivElement;
    this.sessionClock = this.el.querySelector('.session-time') as HTMLElement;
    this.objectivePanel = this.el.querySelector('.objective-panel') as HTMLDivElement;
    this.objectiveList = this.el.querySelector('.objective-list') as HTMLDivElement;
    this.minimapCanvas = this.el.querySelector('.minimap canvas') as HTMLCanvasElement;
    this.minimapCoords = this.el.querySelector('.minimap-coords') as HTMLDivElement;
    this.minimapLabel = this.el.querySelector('.minimap-label') as HTMLDivElement;
    this.crosshair = this.el.querySelector('.crosshair') as HTMLDivElement;
    this.breakMeter = this.el.querySelector('.break-meter') as HTMLDivElement;
    this.breakFill = this.el.querySelector('.break-meter > div') as HTMLDivElement;
    this.interactHint = this.el.querySelector('.interact-hint') as HTMLDivElement;
    this.hearts = this.el.querySelector('.hearts') as HTMLDivElement;
    this.hunger = this.el.querySelector('.hunger') as HTMLDivElement;
    this.airbar = this.el.querySelector('.airbar') as HTMLDivElement;
    this.vitals = this.el.querySelector('.vitals') as HTMLDivElement;
    this.hotbar = this.el.querySelector('.hotbar') as HTMLDivElement;
    this.waveBanner = this.el.querySelector('.wave-banner') as HTMLDivElement;
    this.toastStack = this.el.querySelector('.toast-stack') as HTMLDivElement;
    this.debug = this.el.querySelector('.hud-debug') as HTMLDivElement;
    this.bossBar = this.el.querySelector('.boss-wrap') as HTMLDivElement;
    this.bossFill = this.el.querySelector('.boss-fill') as HTMLDivElement;
    this.bossName = this.el.querySelector('.boss-name') as HTMLDivElement;
    this.racePanel = this.el.querySelector('.race-panel') as HTMLDivElement;
    this.racePosition = this.el.querySelector('.race-position') as HTMLSpanElement;
    this.raceLap = this.el.querySelector('.race-lap') as HTMLSpanElement;
    this.raceClock = this.el.querySelector('.race-clock') as HTMLDivElement;
    this.raceLast = this.el.querySelector('.race-last') as HTMLSpanElement;
    this.raceBest = this.el.querySelector('.race-best') as HTMLSpanElement;
    this.raceSpeed = this.el.querySelector('.race-speed') as HTMLElement;
    this.raceWarning = this.el.querySelector('.race-warning') as HTMLDivElement;
    this.raceStandings = this.el.querySelector('.race-standings') as HTMLDivElement;
    this.simPanel = this.el.querySelector('.sim-panel') as HTMLDivElement;
    this.simKicker = this.el.querySelector('.sim-kicker') as HTMLSpanElement;
    this.simTitle = this.el.querySelector('.sim-title') as HTMLSpanElement;
    this.simRows = this.el.querySelector('.sim-rows') as HTMLDivElement;
    this.simProgress = this.el.querySelector('.sim-progress') as HTMLDivElement;
    this.simProgressLabel = this.el.querySelector('.sim-progress-label') as HTMLDivElement;
    this.simBar = this.el.querySelector('.sim-bar > i') as HTMLDivElement;
    this.simActions = this.el.querySelector('.sim-actions') as HTMLDivElement;
    this.simFooter = this.el.querySelector('.sim-footer') as HTMLDivElement;
    this.xpFill = this.el.querySelector('.xp-fill') as HTMLDivElement;
    this.levelLabel = this.el.querySelector('.level-label') as HTMLDivElement;
    this.hintEl = this.el.querySelector('.hud-hints') as HTMLDivElement;

    this.sessionName.textContent = game.template.name;
    this.sessionIcon.textContent = game.template.icon;
    this.sessionIcon.style.background = `linear-gradient(150deg, ${game.template.accent}, #101a14)`;
    this.buildVitals();

    this.el.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-role]') as HTMLElement | null;
      if (!target) {
        const simButton = (event.target as HTMLElement).closest('[data-sim]') as HTMLButtonElement | null;
        if (simButton && !simButton.disabled) game.simAction(simButton.dataset.sim ?? '');
        return;
      }
      const role = target.dataset.role;
      if (role === 'pause') game.requestPause();
      if (role === 'inventory') game.openInventory();
      if (role === 'map') game.toggleLargeMap();
    });
  }

  private buildVitals(): void {
    this.hearts.innerHTML = Array.from({ length: HEART_COUNT }, () => '<div class="heart"><span></span></div>').join('');
    this.hunger.innerHTML = Array.from({ length: HUNGER_COUNT }, () => '<span class="hunger-drum">◆</span>').join('');
    this.airbar.innerHTML = Array.from({ length: AIR_COUNT }, () => '<span class="air-bubble"></span>').join('');
  }

  toast(message: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info'): void {
    if (!message) return;
    const icons = { info: '▸', good: '✦', warn: '△', bad: '✕' };
    const node = el('div', `toast ${kind}`, `<span class="ti">${icons[kind]}</span><span>${message}</span>`);
    this.toastStack.appendChild(node);
    while (this.toastStack.children.length > 5) this.toastStack.firstElementChild?.remove();
    window.setTimeout(() => {
      node.classList.add('out');
      window.setTimeout(() => node.remove(), 260);
    }, kind === 'bad' ? 3600 : 2800);
  }

  setBreakProgress(progress: number): void {
    if (progress <= 0.001) {
      this.breakMeter.classList.remove('show');
      this.breakFill.style.width = '0%';
      return;
    }
    this.breakMeter.classList.add('show');
    this.breakFill.style.width = `${Math.min(1, progress) * 100}%`;
  }

  setInteractHint(html: string | null): void {
    if (!html) {
      this.interactHint.classList.add('hidden');
      return;
    }
    this.interactHint.classList.remove('hidden');
    if (this.interactHint.innerHTML !== html) this.interactHint.innerHTML = html;
  }

  setCrosshairActive(active: boolean): void {
    this.crosshair.classList.toggle('hit', active);
  }

  flashDamage(): void {
    this.damageVignette.classList.add('show');
    window.setTimeout(() => this.damageVignette.classList.remove('show'), 220);
  }

  showWaveBanner(kicker: string, big: string, sub: string, duration = 3.4): void {
    (this.waveBanner.querySelector('.kicker') as HTMLElement).textContent = kicker;
    (this.waveBanner.querySelector('.big') as HTMLElement).textContent = big;
    (this.waveBanner.querySelector('.sub') as HTMLElement).textContent = sub;
    this.waveBanner.classList.remove('hidden');
    this.waveBanner.style.animation = 'none';
    void this.waveBanner.offsetWidth;
    this.waveBanner.style.animation = '';
    if (this.waveTimer) window.clearTimeout(this.waveTimer);
    this.waveTimer = window.setTimeout(() => this.waveBanner.classList.add('hidden'), duration * 1000);
  }

  setObjectives(objectives: ObjectiveState[]): void {
    const signature = objectives.map((o) => `${o.def.id}:${o.progress}:${o.done}`).join('|');
    if (signature === this.objectiveSignature) return;
    this.objectiveSignature = signature;
    const visible = objectives.filter((o) => !o.def.hidden).slice(0, 6);
    this.objectivePanel.classList.toggle('hidden', visible.length === 0);
    this.objectiveList.innerHTML = visible.map((o) => {
      const count = o.def.kind === 'survive'
        ? `${Math.floor(o.progress)}s / ${o.def.count}s`
        : o.def.kind === 'reach'
          ? (o.done ? 'Reached' : 'Not reached')
          : `${Math.floor(o.progress)} / ${o.def.count}`;
      const progress = o.def.count > 0 ? Math.min(1, o.progress / o.def.count) : o.done ? 1 : 0;
      return `<div class="objective ${o.done ? 'done' : ''}">
        <div class="objective-top"><span class="objective-check"></span><span>${o.def.title}</span><span class="objective-count">${count}</span></div>
        <div class="obj-bar"><div style="width:${progress * 100}%"></div></div>
      </div>`;
    }).join('');
  }

  toggleDebug(): void {
    this.debug.classList.toggle('hidden');
  }

  toggleHints(): void {
    this.hintEl.style.display = this.hintEl.style.display === 'none' ? '' : 'none';
  }

  update(dt: number): void {
    const game = this.game;
    const player = game.player;
    this.fps += ((1 / Math.max(0.0001, dt)) - this.fps) * 0.08;
    this.minimapAcc += dt;
    const now = performance.now() / 1000;

    // Clock + session panel.
    const hours = Math.floor(game.sky.time);
    const minutes = Math.floor((game.sky.time % 1) * 60);
    this.sessionClock.innerHTML = `<b>${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}</b><span>Day ${game.dayCount}</span>`;
    this.minimapLabel.textContent = game.biomeName.toUpperCase();
    this.minimapCoords.textContent = `${Math.floor(player.position.x)}, ${Math.floor(player.position.z)}`;

    // Vitals ~8 fps.
    if (now - this.lastVitals > 0.12) {
      this.lastVitals = now;
      const health = Math.max(0, Math.min(player.maxHealth, player.health));
      const hearts = this.hearts.children;
      for (let i = 0; i < hearts.length; i++) {
        const value = health - i * 2;
        const heart = hearts[i] as HTMLElement;
        heart.className = `heart ${value >= 2 ? 'full' : value >= 1 ? 'half' : ''} ${health <= 6 ? 'low' : ''}`;
      }
      const drums = this.hunger.children;
      for (let i = 0; i < drums.length; i++) {
        const value = player.hunger - i * 2;
        (drums[i] as HTMLElement).className = `hunger-drum ${value >= 1 ? 'full' : ''}`;
      }
      const showAir = player.underwater || player.air < 9.95;
      this.airbar.style.display = showAir ? '' : 'none';
      const bubbles = this.airbar.children;
      for (let i = 0; i < bubbles.length; i++) {
        (bubbles[i] as HTMLElement).className = `air-bubble ${player.air >= i + 1 ? 'full' : ''}`;
      }
      this.vitals.classList.toggle('hidden', game.mode === 'studio');
      this.underwaterTint.classList.toggle('show', player.underwater);
      this.xpFill.style.width = `${(player.xp / player.xpForNext()) * 100}%`;
      this.levelLabel.textContent = String(player.level);
      (this.el.querySelector('.coin-label') as HTMLElement).textContent = String(player.coins);
    }

    // Hotbar.
    const inv = player.inventory;
    const signature = inv.slots.slice(0, 9).map((s) => (s ? `${s.item}x${s.count}x${s.durability ?? ''}` : '-')).join('|') + `@${inv.active}`;
    if (signature !== this.hotbarSignature) {
      this.hotbarSignature = signature;
      this.renderHotbar();
      player.refreshHeldItem();
    }
    this.hotbar.classList.toggle('hidden', game.mode === 'studio');

    // Objectives.
    this.setObjectives(game.objectives);

    // Boss bar.
    const boss = game.entities.boss;
    if (boss && boss.alive) {
      this.bossBar.style.display = 'block';
      this.bossName.textContent = boss.displayName;
      const pct = Math.max(0, boss.health / boss.maxHealth);
      this.bossFill.style.width = `${pct * 100}%`;
      (this.bossBar.querySelector('.boss-hp') as HTMLElement).textContent = `${Math.ceil(boss.health)} / ${boss.maxHealth}`;
    } else {
      this.bossBar.style.display = 'none';
    }

    // Race director panel.
    const race = game.race?.hud() ?? null;
    this.racePanel.classList.toggle('hidden', !race);
    if (race) {
      this.racePosition.textContent = race.state === 'finished' ? `P${race.finishPosition}` : `P${race.position}/${race.total}`;
      this.raceLap.textContent = race.state === 'finished' ? 'FINISHED' : `LAP ${Math.min(Math.max(1, race.lap), race.laps)}/${race.laps}`;
      this.raceClock.textContent = this.timeText(race.time);
      this.raceLast.textContent = `LAST ${race.lastLap != null ? this.timeText(race.lastLap) : '--:--'}`;
      this.raceBest.textContent = `BEST ${race.bestLap != null ? this.timeText(race.bestLap) : '--:--'}`;
      this.raceSpeed.innerHTML = `<b>${Math.round(race.speed)}</b><span>km/h</span>`;
      this.raceWarning.classList.toggle('hidden', !race.wrongWay);
      this.racePanel.classList.toggle('finished', race.state === 'finished');
      const signature = `${race.state}|${game.race?.standings().map((s) => s.name).join(',') ?? ''}`;
      if (race.state === 'finished') {
        if (signature !== this.raceSignature) {
          this.raceSignature = signature;
          const rows = game.race?.standings() ?? [];
          this.raceStandings.innerHTML = rows
            .map((row, index) => `<div class="race-row${row.player ? ' you' : ''}"><span>${index + 1}</span><i style="background:${row.color}"></i><b>${row.name}</b></div>`)
            .join('');
        }
      } else if (this.raceStandings.innerHTML) {
        this.raceStandings.innerHTML = '';
        this.raceSignature = '';
      }
    }

    // Simulation panel (kitchen / shop / lucky arena).
    if (now - this.lastSim > 0.18) {
      this.lastSim = now;
      this.updateSim();
    }

    // Minimap at ~4 fps.
    if (now - this.lastMinimap > 0.24) {
      this.lastMinimap = now;
      this.drawMinimap();
    }

    // Debug overlay at ~6 fps.
    if (!this.debug.classList.contains('hidden') && now - this.lastFps > 0.16) {
      this.lastFps = now;
      const pos = player.position;
      const chunk = game.world.getChunk(Math.floor(pos.x / 16), Math.floor(pos.z / 16));
      const yaw = ((player.yaw * 180) / Math.PI + 540) % 360;
      this.debug.innerHTML = `
        <div class="hud-fps">${this.fps.toFixed(0)} FPS</div>
        <div>XYZ ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}</div>
        <div>CHUNK ${Math.floor(pos.x / 16)}, ${Math.floor(pos.z / 16)} ${chunk ? 'loaded' : 'pending'}</div>
        <div>BIOME ${game.biomeName}</div>
        <div>ENTITIES ${game.entities.entities.filter((e) => e.alive).length} · EDITS ${game.world.editCount}</div>
        <div>LIGHT sky ${game.world.getSkyLight(pos.x, pos.y + 1, pos.z)} · block ${game.world.getBlockLight(pos.x, pos.y + 1, pos.z)} · YAW ${yaw.toFixed(0)}°</div>
        <div>TIME ${formatClock(hours * 3600 + minutes * 60)} · ${game.sky.weather}</div>
        <div style="opacity:.65">${game.renderer.info.render.calls} draw calls · ${(game.renderer.info.render.triangles / 1000).toFixed(0)}k tris</div>
      `;
    }
    void this.minimapAcc;
  }

  private updateSim(): void {
    const hud = this.game.sim?.hud() ?? null;
    this.simPanel.classList.toggle('hidden', !hud);
    if (!hud) {
      this.simSignature = '';
      return;
    }
    const signature = JSON.stringify(hud);
    if (signature === this.simSignature) return;
    this.simSignature = signature;
    this.simKicker.textContent = hud.kicker;
    this.simTitle.textContent = hud.title;
    this.simRows.innerHTML = hud.rows
      .map((row) => `<div class="sim-row"><span>${row.label}</span><b class="${row.tone ?? ''}">${row.value}</b></div>`)
      .join('');
    this.simProgress.classList.toggle('hidden', !hud.progress);
    if (hud.progress) {
      const pct = Math.max(0, Math.min(100, (hud.progress.value / Math.max(1, hud.progress.max)) * 100));
      this.simProgressLabel.textContent = `${hud.progress.label} ${Math.round(pct)}%`;
      this.simBar.style.width = `${pct}%`;
    }
    this.simActions.innerHTML = hud.actions
      .map((action, index) => {
        const primary = !action.disabled && !hud.actions.slice(0, index).some((entry) => !entry.disabled);
        const hint = action.hotkey ? action.hotkey.replace(/^Digit/, '') : primary ? 'R' : '';
        const kbd = hint ? ` <kbd>${hint}</kbd>` : '';
        return `<button class="sim-action clickable" data-sim="${action.id}"${action.disabled ? ' disabled' : ''}>${action.label}${kbd}</button>`;
      })
      .join('');
    this.simActions.classList.toggle('hidden', hud.actions.length === 0);
    this.simFooter.textContent = hud.footer ?? '';
    this.simFooter.classList.toggle('hidden', !hud.footer);
  }

  private timeText(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  private renderHotbar(): void {
    const inv = this.game.player.inventory;
    const atlas = this.game.atlas;
    this.hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const stack = inv.slots[i];
      const slot = el('div', `slot ${i === inv.active ? 'active' : ''} clickable`);
      slot.dataset.index = String(i);
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
      if (stack) {
        const def = itemOrNull(stack.item);
        const img = document.createElement('img');
        img.className = 'slot-icon';
        img.src = itemIcon(stack.item, atlas);
        img.alt = def?.name ?? stack.item;
        img.style.imageRendering = 'pixelated';
        slot.appendChild(img);
        if (stack.count > 1) {
          const count = el('span', 'slot-count', String(stack.count));
          slot.appendChild(count);
        }
        if (def?.durability && stack.durability !== undefined && stack.durability < def.durability) {
          const bar = el('div');
          bar.style.cssText = 'position:absolute;left:3px;right:3px;bottom:2px;height:2px;background:rgba(0,0,0,.6)';
          const fill = el('div');
          fill.style.cssText = `height:100%;width:${Math.max(0, (stack.durability / def.durability) * 100)}%;background:${stack.durability / def.durability > 0.3 ? '#8ce05f' : '#ff6464'}`;
          bar.appendChild(fill);
          slot.appendChild(bar);
        }
      }
      slot.addEventListener('click', () => {
        inv.setActive(i);
        this.game.audio.play('click');
      });
      this.hotbar.appendChild(slot);
    }
  }

  private drawMinimap(): void {
    const game = this.game;
    const canvas = this.minimapCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const px = game.player.position.x;
    const pz = game.player.position.z;
    const radius = 46;
    const samples = 96;
    const cell = size / samples;
    const blockSize = (radius * 2) / samples;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#07100c';
    ctx.fillRect(0, 0, size, size);
    const topY = Math.min(94, Math.floor(game.player.position.y) + 26);
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const wx = Math.floor(px - radius + sx * blockSize);
        const wz = Math.floor(pz - radius + sy * blockSize);
        let color = '#101b16';
        let found = 0;
        for (let y = topY; y >= Math.max(0, topY - 42); y--) {
          const id = game.world.getBlock(wx, y, wz);
          if (!id) continue;
          const def = blockById(id);
          if (def.render === 'liquid') {
            color = def.key === 'lava' ? '#e05a15' : '#2c5a9e';
            found = y;
            break;
          }
          if (def.render === 'cross') continue;
          color = def.mapColor;
          found = y;
          break;
        }
        if (found) {
          const shade = 0.76 + Math.max(0, Math.min(1, (found - 20) / 70)) * 0.34;
          ctx.fillStyle = shadeColor(color, shade);
        } else {
          ctx.fillStyle = color;
        }
        ctx.fillRect(sx * cell, sy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    // Entities.
    for (const entity of game.entities.entities) {
      if (!entity.alive) continue;
      const ex = ((entity.position.x - px) / (radius * 2) + 0.5) * size;
      const ez = ((entity.position.z - pz) / (radius * 2) + 0.5) * size;
      if (ex < 0 || ex > size || ez < 0 || ez > size) continue;
      ctx.fillStyle = entity.isHostile ? '#ff6a5c' : entity.isNpc ? '#ffd76a' : '#9fe08a';
      ctx.fillRect(ex - 2, ez - 2, 5, 5);
    }
    // Player arrow.
    const cx = size / 2;
    const cz = size / 2;
    ctx.save();
    ctx.translate(cx, cz);
    ctx.rotate(-game.player.yaw);
    ctx.fillStyle = '#f4ffe8';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Compass letters.
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillStyle = 'rgba(230,245,230,.55)';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 15);
    ctx.fillText('S', size / 2, size - 6);
    ctx.textAlign = 'left';
    ctx.fillText('W', 4, size / 2);
    ctx.textAlign = 'right';
    ctx.fillText('E', size - 4, size / 2);
  }
}

function shadeColor(hex: string, factor: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const r = Math.min(255, Math.round(parseInt(value.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(value.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(value.slice(4, 6), 16) * factor));
  return `rgb(${r},${g},${b})`;
}
