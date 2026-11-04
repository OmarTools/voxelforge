import * as THREE from 'three';
import { assetThumbnailer } from '../render/AssetThumbnailer';
import {
  ASSETS,
  ASSET_CATEGORIES,
  assetGlyph,
  findAssets,
  getAsset,
  type AssetCategory,
  type AssetEntry,
  type AssetKind,
} from '../../content/Models';
import { BLOCKS, BLOCK_CATEGORIES, blockById } from '../world/Blocks';
import { PREFABS, PREFAB_TAGS, findPrefabs, type Prefab } from '../../content/Prefabs';
import { escapeHtml } from '../core/Utils';
import { WORLD_HEIGHT } from '../world/Chunk';
import type { Game, StudioProp, StudioTool } from './Game';
import type { GameEntity } from '../entities/EntityManager';
import type { AIBehavior } from '../../content/EntityTypes';
import type { WeatherKind } from '../render/Sky';
import type { WorldRules } from '../../content/Templates';

const TOOL_ORDER: StudioTool[] = ['select', 'paint', 'erase', 'prefab', 'prop', 'entity', 'pan'];

const TOOL_INFO: Record<StudioTool, { label: string; glyph: string; key: string }> = {
  select: { label: 'Select & inspect', glyph: '↖', key: '1' },
  paint: { label: 'Paint blocks', glyph: '▣', key: '2' },
  erase: { label: 'Erase blocks', glyph: '⌫', key: '3' },
  prefab: { label: 'Stamp prefab', glyph: '⌂', key: '4' },
  prop: { label: 'Place prop', glyph: '❖', key: '5' },
  entity: { label: 'Place entity', glyph: '☺', key: '6' },
  pan: { label: 'Pan camera', glyph: '✥', key: '7' },
};

const RULE_ROWS: Array<{ key: keyof WorldRules; label: string; hint: string }> = [
  { key: 'dayCycle', label: 'Day / night cycle', hint: 'The sun moves while you build' },
  { key: 'mobSpawning', label: 'Mob spawning', hint: 'Ambient hostiles at night' },
  { key: 'allowFlight', label: 'Allow flight', hint: 'Players can press F' },
  { key: 'hunger', label: 'Hunger', hint: 'Food and starvation' },
  { key: 'naturalRegen', label: 'Natural regeneration', hint: 'Health refills over time' },
  { key: 'fallDamage', label: 'Fall damage', hint: 'Gravity hurts' },
  { key: 'invulnerable', label: 'Invulnerable player', hint: 'Ignore all damage' },
  { key: 'keepInventory', label: 'Keep inventory on death', hint: 'No dropped gear' },
  { key: 'blockBreaking', label: 'Block breaking', hint: 'Survival mining' },
  { key: 'blockPlacing', label: 'Block placing', hint: 'Survival building' },
  { key: 'dropItems', label: 'Block drops', hint: 'Mined blocks become items' },
  { key: 'pvp', label: 'PvP', hint: 'Player-versus-player damage' },
];

const BEHAVIORS: AIBehavior[] = [
  'idle', 'wander', 'hostile', 'ranged', 'flying', 'guard', 'flee', 'stationary', 'exploder',
];

const WEATHER: Array<{ key: WeatherKind; label: string; glyph: string }> = [
  { key: 'clear', label: 'Clear', glyph: '☀' },
  { key: 'rain', label: 'Rain', glyph: '☂' },
  { key: 'snow', label: 'Snow', glyph: '❄' },
  { key: 'ash', label: 'Ash', glyph: '✦' },
];

interface PlacementPoint {
  x: number;
  z: number;
  feetY: number;
  stampY: number;
}

interface HoverPoint {
  x: number;
  y: number;
}

type DragMode = 'orbit' | 'pan';

/**
 * The VoxelForge level studio. It runs on top of the live game session, drives
 * the shared camera directly, and turns pointer input over the viewport into
 * block painting, prefab stamping, prop/entity placement and selection.
 */
export class StudioUI {
  readonly el: HTMLDivElement;
  private game: Game;

  private view: HTMLElement;
  private toolStrip: HTMLElement;
  private hintEl: HTMLElement;
  private leftContent: HTMLElement;
  private rightContent: HTMLElement;
  private leftTabs: HTMLElement;
  private rightTabs: HTMLElement;
  private projectInput: HTMLInputElement;
  private modePill: HTMLElement;
  private statusProps: HTMLElement;
  private statusEntities: HTMLElement;
  private statusChunks: HTMLElement;
  private statusEdits: HTMLElement;
  private statusTarget: HTMLElement;
  private statusTime: HTMLElement;
  private statusMode: HTMLElement;

  private modelInput: HTMLInputElement;
  private projectFileInput: HTMLInputElement;

  private grid: THREE.GridHelper;
  private selectionBox: THREE.Box3Helper;
  private blockHighlight: THREE.LineSegments;
  private ghost: THREE.Group;
  private ghostMesh: THREE.Mesh;
  private ghostEdges: THREE.LineSegments;

  private openState = false;
  private tab: 'assets' | 'blocks' | 'prefabs' | 'world' = 'assets';
  private rightTab: 'inspector' | 'scene' = 'inspector';
  private tool: StudioTool = 'select';
  private paintMode: 'place' | 'replace' = 'place';
  private gridVisible = true;
  private projectName = 'Untitled Project';
  private savedDayCycle = true;

  private assetQuery = '';
  private assetKind: AssetKind | 'all' = 'all';
  private assetCategory: AssetCategory | 'all' = 'all';
  private blockQuery = '';
  private blockCategory = 'all';
  private prefabQuery = '';
  private prefabTag = 'all';

  private activeAssetKey = 'human:adventurer';
  private activePrefab = 'oak_cottage';
  private blockKey = 'grass_block';

  private selectedProp: StudioProp | null = null;
  private selectedEntity: GameEntity | null = null;
  private selectedBlock: { x: number; y: number; z: number; key: string } | null = null;

  private hover: HoverPoint | null = null;
  private hoverBlock: { x: number; y: number; z: number } | null = null;
  private lastHoverKey = '';
  private drag: DragMode | null = null;
  private dragLastX = 0;
  private dragLastY = 0;
  private painting = false;
  private lastPaintKey = '';

  private target = new THREE.Vector3(0, 40, 0);
  private yaw = 0;
  private pitch = 0.42;
  private distance = 14;
  private statusTimer = 0;
  private weather: WeatherKind = 'clear';
  private sceneFilter: 'all' | 'props' | 'entities' = 'all';

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'studio hidden';
    this.el.innerHTML = `
      <div class="studio-topbar">
        <div class="st-brand">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 2 30 10v12L16 30 2 22V10z" fill="#7ed957"/>
            <path d="M16 2 30 10l-14 8L2 10z" fill="#9aef70"/>
            <path d="M2 10v12l14 8V18z" fill="#4b9f3d"/>
            <path d="M16 18v12l14-8V10z" fill="#367a2f"/>
          </svg>
          <div>
            <div class="st-brand-name">Voxel<em>Forge</em></div>
            <div class="st-brand-tag">Level Studio</div>
          </div>
        </div>
        <div class="st-project">
          <label>Project</label>
          <input data-project-name spellcheck="false" value="Untitled Project" aria-label="Project name">
        </div>
        <div class="st-mode-pill" data-mode-pill><span class="dot"></span><span data-mode-text>Edit mode</span></div>
        <div class="st-actions">
          <button class="btn ghost small" data-action="undo" title="Undo (Ctrl+Z)">↶</button>
          <button class="btn ghost small" data-action="redo" title="Redo (Ctrl+Y)">↷</button>
          <button class="btn ghost small" data-action="save" title="Save project (Ctrl+S)">Save</button>
          <button class="btn ghost small" data-action="export" title="Export project JSON (Ctrl+E)">Export</button>
          <button class="btn ghost small" data-action="import-project" title="Open a .voxelforge.json project">Import</button>
          <button class="btn ghost small" data-action="scripts" title="Open the visual + text script editor">Scripts</button>
          <button class="btn ghost small" data-action="publish" title="Build a standalone package or connect AI control">Publish</button>
          <button class="btn primary small" data-action="play" title="Return to play mode">▶ Play</button>
          <button class="btn ghost small" data-action="exit" title="Close the studio and open the pause menu">Exit</button>
        </div>
      </div>
      <div class="studio-body">
        <aside class="studio-panel left-panel">
          <div class="panel-tabs" data-left-tabs>
            <button class="panel-tab active" data-left-tab="assets">Assets</button>
            <button class="panel-tab" data-left-tab="blocks">Blocks</button>
            <button class="panel-tab" data-left-tab="prefabs">Prefabs</button>
            <button class="panel-tab" data-left-tab="world">World</button>
          </div>
          <div class="panel-content" data-left-content></div>
        </aside>
        <section class="studio-view" data-view>
          <div class="tool-strip" data-tool-strip></div>
          <div class="studio-hint" data-hint></div>
        </section>
        <aside class="studio-panel right-panel">
          <div class="panel-tabs" data-right-tabs>
            <button class="panel-tab active" data-right-tab="inspector">Inspector</button>
            <button class="panel-tab" data-right-tab="scene">Scene</button>
          </div>
          <div class="panel-content" data-right-content></div>
        </aside>
      </div>
      <div class="studio-bottom">
        <span class="status-dot"></span><span data-status-mode>Edit mode</span>
        <span>·</span><span data-status-target>—</span>
        <span class="spacer"></span>
        <span><b data-count-props>0</b> props</span>
        <span><b data-count-entities>0</b> entities</span>
        <span><b data-count-chunks>0</b> chunks</span>
        <span><b data-count-edits>0</b> edits</span>
        <span data-status-time>—</span>
      </div>
    `;
    root.appendChild(this.el);

    this.view = this.must('[data-view]');
    this.toolStrip = this.must('[data-tool-strip]');
    this.hintEl = this.must('[data-hint]');
    this.leftContent = this.must('[data-left-content]');
    this.rightContent = this.must('[data-right-content]');
    this.leftTabs = this.must('[data-left-tabs]');
    this.rightTabs = this.must('[data-right-tabs]');
    this.projectInput = this.must<HTMLInputElement>('[data-project-name]');
    this.modePill = this.must('[data-mode-pill]');
    this.statusProps = this.must('[data-count-props]');
    this.statusEntities = this.must('[data-count-entities]');
    this.statusChunks = this.must('[data-count-chunks]');
    this.statusEdits = this.must('[data-count-edits]');
    this.statusTarget = this.must('[data-status-target]');
    this.statusTime = this.must('[data-status-time]');
    this.statusMode = this.must('[data-status-mode]');

    this.modelInput = this.createFileInput('.bbmodel,application/json');
    this.projectFileInput = this.createFileInput('.json,application/json');
    this.el.append(this.modelInput, this.projectFileInput);

    this.grid = this.buildGrid();
    this.selectionBox = this.buildSelectionBox();
    const highlight = this.buildBlockHighlight();
    this.blockHighlight = highlight;
    const ghost = this.buildGhost();
    this.ghost = ghost.group;
    this.ghostMesh = ghost.mesh;
    this.ghostEdges = ghost.edges;

    this.buildToolStrip();
    this.bindStaticEvents();
    this.updateMode();
    this.updateToolUi();
  }

  get isOpen(): boolean {
    return this.openState;
  }

  // ------------------------------------------------------------------ open/close

  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.el.classList.remove('hidden');
    this.game.hud?.el.classList.add('hidden');
    this.savedDayCycle = this.game.sky.dayCycle;
    this.game.sky.dayCycle = false;
    this.projectName = this.game.projectName || this.game.template.name;
    this.projectInput.value = this.projectName;
    this.weather = this.game.sky.weather;
    this.focusPlayer();
    this.grid.position.y = this.game.baseY + 1.02;
    this.grid.visible = this.gridVisible;
    this.updateMode();
    this.renderLeft();
    this.renderRight();
    this.updateStatus();
    this.updateToolUi();
    this.updateSelectionHelper();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.el.classList.add('hidden');
    this.painting = false;
    this.drag = null;
    this.hover = null;
    this.hoverBlock = null;
    this.ghost.visible = false;
    this.blockHighlight.visible = false;
    this.selectionBox.visible = false;
    this.grid.visible = false;
    if (this.game.started) {
      this.game.sky.dayCycle = this.game.rules.dayCycle;
      if (!this.game.ended) this.game.hud?.el.classList.remove('hidden');
    }
    this.updateMode();
  }

  /** Full UI rebuild. Safe to call while the studio is closed. */
  refresh(): void {
    if (!this.game?.world) return;
    this.projectName = this.game.projectName || this.projectName;
    if (document.activeElement !== this.projectInput) this.projectInput.value = this.projectName;
    this.renderLeft();
    this.renderRight();
    this.updateStatus();
    this.updateSelectionHelper();
  }

  update(dt: number): void {
    if (!this.openState) return;
    this.updateCamera();
    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.4;
      this.updateStatus();
      if (this.selectedEntity && (!this.game.entities?.entities.includes(this.selectedEntity) || !this.selectedEntity.alive)) {
        this.selectedEntity = null;
        this.renderRight();
      }
      if (this.selectedProp && !this.game.studioProps.includes(this.selectedProp)) {
        this.selectedProp = null;
        this.renderRight();
      }
    }
    this.updateSelectionHelper();
    this.updateTimeLabels();
  }

  // ------------------------------------------------------------------ DOM helpers

  private must<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = this.el.querySelector<T>(selector);
    if (!node) throw new Error(`Studio element missing: ${selector}`);
    return node;
  }

  private createFileInput(accept: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    return input;
  }

  private buildToolStrip(): void {
    this.toolStrip.innerHTML = `
      ${TOOL_ORDER.map((tool) => {
        const info = TOOL_INFO[tool];
        return `<button class="tool-btn" data-tool="${tool}" title="${info.label} (${info.key})">
          <span aria-hidden="true">${info.glyph}</span>
          <span class="tool-tip">${info.label} <span style="color:#6d8c78">[${info.key}]</span></span>
        </button>`;
      }).join('')}
      <span style="width:1px;background:#334a57;margin:4px 2px"></span>
      <button class="tool-btn" data-action="grid" title="Toggle build grid (G)"><span aria-hidden="true">#</span><span class="tool-tip">Build grid <span style="color:#6d8c78">[G]</span></span></button>
      <button class="tool-btn" data-action="focus" title="Focus selection (F)"><span aria-hidden="true">◎</span><span class="tool-tip">Focus selection <span style="color:#6d8c78">[F]</span></span></button>
      <button class="tool-btn" data-action="undo" title="Undo (Ctrl+Z)"><span aria-hidden="true">↶</span><span class="tool-tip">Undo</span></button>
      <button class="tool-btn" data-action="redo" title="Redo (Ctrl+Y)"><span aria-hidden="true">↷</span><span class="tool-tip">Redo</span></button>
    `;
    this.toolStrip.querySelectorAll<HTMLElement>('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool as StudioTool | undefined;
        if (tool) this.setTool(tool);
      });
    });
    this.toolStrip.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action === 'grid') this.toggleGrid();
        else if (action === 'focus') this.focusSelection();
        else if (action === 'undo') this.game.studioUndo();
        else if (action === 'redo') this.game.studioRedo();
      });
    });
  }

  private buildGrid(): THREE.GridHelper {
    const grid = new THREE.GridHelper(160, 160, 0x6f9666, 0x31473a);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.34;
      material.depthWrite = false;
    }
    grid.renderOrder = 2;
    grid.visible = false;
    this.game.scene.add(grid);
    return grid;
  }

  private buildSelectionBox(): THREE.Box3Helper {
    const helper = new THREE.Box3Helper(new THREE.Box3(), 0x8ce05f);
    const material = helper.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    material.opacity = 0.95;
    helper.renderOrder = 999;
    helper.visible = false;
    this.game.scene.add(helper);
    return helper;
  }

  private buildBlockHighlight(): THREE.LineSegments {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const material = new THREE.LineBasicMaterial({
      color: 0xb8f59a,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 998;
    lines.visible = false;
    this.game.scene.add(lines);
    return lines;
  }

  private buildGhost(): { group: THREE.Group; mesh: THREE.Mesh; edges: THREE.LineSegments } {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x8ce05f,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xa8ef82, transparent: true, opacity: 0.9, depthTest: false }),
    );
    group.add(mesh, edges);
    group.renderOrder = 997;
    group.visible = false;
    this.game.scene.add(group);
    return { group, mesh, edges };
  }

  private bindStaticEvents(): void {
    this.el.querySelector('.studio-topbar')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'undo') this.game.studioUndo();
      else if (action === 'redo') this.game.studioRedo();
      else if (action === 'save') this.saveProject();
      else if (action === 'export') this.exportProject();
      else if (action === 'import-project') this.projectFileInput.click();
      else if (action === 'scripts') {
        this.game.closeStudio();
        this.game.openScripts();
      } else if (action === 'publish') {
        this.game.closeStudio();
        this.game.openPublish();
      } else if (action === 'play') this.play();
      else if (action === 'exit') this.exit();
    });

    this.leftTabs.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-left-tab]');
      if (!button) return;
      const tab = button.dataset.leftTab as typeof this.tab | undefined;
      if (tab) this.setTab(tab);
    });

    this.rightTabs.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-right-tab]');
      if (!button) return;
      const tab = button.dataset.rightTab as typeof this.rightTab | undefined;
      if (tab) this.setRightTab(tab);
    });

    this.projectInput.addEventListener('input', () => {
      this.projectName = this.projectInput.value;
      this.game.projectName = this.projectName;
    });

    this.modelInput.addEventListener('change', () => {
      const file = this.modelInput.files?.[0];
      this.modelInput.value = '';
      if (!file) return;
      void this.importModel(file);
    });

    this.projectFileInput.addEventListener('change', () => {
      const file = this.projectFileInput.files?.[0];
      this.projectFileInput.value = '';
      if (!file) return;
      void this.importProject(file);
    });

    this.view.addEventListener('pointerdown', this.onPointerDown);
    this.view.addEventListener('pointerleave', () => {
      this.hover = null;
      this.ghost.visible = false;
      this.blockHighlight.visible = false;
    });
    this.view.addEventListener('wheel', this.onWheel, { passive: false });
    this.view.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  // ------------------------------------------------------------------ camera

  private focusPlayer(): void {
    if (!this.game.player) return;
    const p = this.game.player.position;
    this.target.set(p.x, p.y + 1.3, p.z);
    this.yaw = this.game.player.yaw;
    this.pitch = 0.4;
    this.distance = 14;
    this.updateCamera();
  }

  private updateCamera(): void {
    const cos = Math.cos(this.pitch);
    const x = this.target.x + Math.sin(this.yaw) * cos * this.distance;
    const y = this.target.y + Math.sin(this.pitch) * this.distance;
    const z = this.target.z + Math.cos(this.yaw) * cos * this.distance;
    this.game.camera.position.set(x, y, z);
    this.game.camera.lookAt(this.target.x, this.target.y, this.target.z);
    this.game.camera.updateMatrixWorld();
  }

  private onWheel = (event: WheelEvent): void => {
    if (!this.openState) return;
    event.preventDefault();
    this.distance = Math.min(170, Math.max(2, this.distance * Math.exp(event.deltaY * 0.0012)));
    this.updateCamera();
  };

  // ------------------------------------------------------------------ input

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.openState) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, textarea, .tool-strip')) return;
    this.hover = { x: event.clientX, y: event.clientY };
    if (event.button === 2 || event.button === 1) {
      event.preventDefault();
      this.drag = event.button === 1 || event.shiftKey ? 'pan' : 'orbit';
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      return;
    }
    if (event.button !== 0) return;
    if (this.tool === 'pan') {
      this.drag = 'pan';
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      event.preventDefault();
      return;
    }
    if (this.tool === 'paint' || this.tool === 'erase') {
      event.preventDefault();
      this.painting = true;
      this.lastPaintKey = '';
      this.game.studioBeginStroke(this.tool === 'erase' ? 'Erase blocks' : 'Paint blocks');
      this.applyPaintAt(event.clientX, event.clientY);
      return;
    }
    if (this.tool === 'select') {
      event.preventDefault();
      this.selectAt(event.clientX, event.clientY);
      return;
    }
    if (this.tool === 'prefab') {
      event.preventDefault();
      this.placePrefabAt(event.clientX, event.clientY);
      return;
    }
    if (this.tool === 'prop') {
      event.preventDefault();
      this.placePropAt(event.clientX, event.clientY);
      return;
    }
    if (this.tool === 'entity') {
      event.preventDefault();
      this.placeEntityAt(event.clientX, event.clientY);
    }
  };

  private onWindowPointerMove = (event: PointerEvent): void => {
    if (!this.openState) return;
    const rect = this.view.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (inside) {
      this.hover = { x: event.clientX, y: event.clientY };
      this.updateGhost();
    }
    if (this.drag) {
      const dx = event.clientX - this.dragLastX;
      const dy = event.clientY - this.dragLastY;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      if (this.drag === 'orbit') {
        this.yaw += dx * 0.0055;
        this.pitch = Math.min(1.48, Math.max(0.04, this.pitch + dy * 0.0045));
      } else {
        const scale = this.distance * 0.0019;
        const right = new THREE.Vector3().setFromMatrixColumn(this.game.camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.game.camera.matrix, 1);
        this.target.addScaledVector(right, -dx * scale);
        this.target.addScaledVector(up, dy * scale);
        this.target.y = Math.min(WORLD_HEIGHT - 1, Math.max(0, this.target.y));
      }
      this.updateCamera();
    }
    if (this.painting && inside && (event.buttons & 1) !== 0) {
      this.applyPaintAt(event.clientX, event.clientY);
    }
  };

  private onWindowPointerUp = (): void => {
    if (!this.openState) return;
    if (this.painting) {
      this.painting = false;
      this.lastPaintKey = '';
      this.game.studioEndStroke();
      this.updateStatus();
    }
    this.drag = null;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.openState) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) this.game.studioRedo();
      else this.game.studioUndo();
      return;
    }
    if (mod && event.code === 'KeyY') {
      event.preventDefault();
      this.game.studioRedo();
      return;
    }
    if (mod && event.code === 'KeyS') {
      event.preventDefault();
      this.saveProject();
      return;
    }
    if (mod && event.code === 'KeyE') {
      event.preventDefault();
      this.exportProject();
      return;
    }
    if (mod && event.code === 'KeyO') {
      event.preventDefault();
      this.projectFileInput.click();
      return;
    }
    if (mod && event.code === 'KeyD') {
      event.preventDefault();
      this.duplicateSelected();
      return;
    }
    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      this.removeSelected();
      return;
    }
    if (event.code === 'KeyG') {
      event.preventDefault();
      this.toggleGrid();
      return;
    }
    if (event.code === 'KeyF') {
      event.preventDefault();
      this.focusSelection();
      return;
    }
    const digitTools: Record<string, StudioTool> = {
      Digit1: 'select', Digit2: 'paint', Digit3: 'erase',
      Digit4: 'prefab', Digit5: 'prop', Digit6: 'entity', Digit7: 'pan',
    };
    const tool = digitTools[event.code];
    if (tool) {
      event.preventDefault();
      this.setTool(tool);
    }
  };

  // ------------------------------------------------------------------ placement

  private pointerRay(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.view.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.game.camera);
    return raycaster;
  }

  private hitAt(clientX: number, clientY: number): ReturnType<Game['world']['raycast']> {
    const ray = this.pointerRay(clientX, clientY);
    return this.game.world.raycast(ray.ray.origin, ray.ray.direction, 130);
  }

  private paintCell(hit: NonNullable<ReturnType<Game['world']['raycast']>>): { x: number; y: number; z: number } | null {
    if (this.paintMode === 'replace') return { x: hit.x, y: hit.y, z: hit.z };
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 0 || y >= WORLD_HEIGHT) return null;
    const current = this.game.world.getBlock(x, y, z);
    if (current !== 0 && blockById(current).render !== 'liquid') return null;
    return { x, y, z };
  }

  private applyPaintAt(clientX: number, clientY: number): void {
    const hit = this.hitAt(clientX, clientY);
    if (!hit) return;
    if (this.tool === 'erase') {
      const key = `e:${hit.x},${hit.y},${hit.z}`;
      if (key === this.lastPaintKey) return;
      this.lastPaintKey = key;
      if (blockById(hit.id).key === 'air') return;
      this.game.studioEraseBlock(hit.x, hit.y, hit.z);
      this.game.audio.play('break', hit.y % 4);
      this.syncSelectedBlock();
      this.updateStatus();
      return;
    }
    if (this.tool !== 'paint') return;
    const cell = this.paintCell(hit);
    if (!cell) return;
    const key = `${cell.x},${cell.y},${cell.z}`;
    if (key === this.lastPaintKey) return;
    this.lastPaintKey = key;
    this.game.studioPaintBlock(cell.x, cell.y, cell.z, this.blockKey);
    this.game.audio.play('place', cell.y % 4);
    this.syncSelectedBlock();
    this.updateStatus();
  }

  private placementFromHit(hit: NonNullable<ReturnType<Game['world']['raycast']>>): PlacementPoint {
    let x = hit.x;
    let z = hit.z;
    if (hit.ny !== 1) {
      x += hit.nx;
      z += hit.nz;
    }
    const ground = this.game.world.getNearestGround(
      x,
      z,
      Math.min(WORLD_HEIGHT - 1, Math.max(hit.y + 4, this.game.baseY + 4)),
    );
    const feetY = ground > 0 ? ground : hit.y + 1;
    return { x, z, feetY, stampY: feetY - 1 };
  }

  private focusPlacementPoint(): PlacementPoint {
    const x = Math.round(this.target.x);
    const z = Math.round(this.target.z);
    const ground = this.game.world.getNearestGround(
      x,
      z,
      Math.min(WORLD_HEIGHT - 1, Math.floor(this.target.y) + 10),
    );
    const feetY = ground > 0 ? ground : Math.max(1, Math.floor(this.target.y));
    return { x, z, feetY, stampY: feetY - 1 };
  }

  private placePrefabAt(clientX: number, clientY: number): void {
    const hit = this.hitAt(clientX, clientY);
    if (!hit) return;
    const point = this.placementFromHit(hit);
    this.stampPrefab(point);
  }

  private stampPrefab(point: PlacementPoint): void {
    const prefab = this.game.studioStampPrefab(this.activePrefab, point.x, point.stampY, point.z);
    if (!prefab) return;
    this.game.toast(`Stamped ${prefab.name}.`, 'good');
    this.updateStatus();
    this.updateGhost();
  }

  private placePropAt(clientX: number, clientY: number): void {
    const hit = this.hitAt(clientX, clientY);
    if (!hit) return;
    const point = this.placementFromHit(hit);
    const prop = this.game.studioAddProp(
      this.activeAssetKey,
      new THREE.Vector3(point.x + 0.5, point.feetY, point.z + 0.5),
    );
    if (!prop) return;
    this.selectedProp = prop;
    this.selectedEntity = null;
    this.selectedBlock = null;
    this.game.toast(`Placed ${prop.name}.`, 'good');
    this.renderRight();
    this.updateSelectionHelper();
    this.updateStatus();
    this.updateGhost();
  }

  private placeEntityAt(clientX: number, clientY: number): void {
    const hit = this.hitAt(clientX, clientY);
    if (!hit) return;
    const point = this.placementFromHit(hit);
    const entity = this.game.studioAddEntity(
      this.activeAssetKey,
      new THREE.Vector3(point.x + 0.5, point.feetY, point.z + 0.5),
    );
    if (!entity) return;
    this.selectedEntity = entity;
    this.selectedProp = null;
    this.selectedBlock = null;
    this.game.toast(`Spawned ${entity.displayName}.`, 'good');
    this.renderRight();
    this.updateSelectionHelper();
    this.updateStatus();
    this.updateGhost();
  }

  private placeActiveAtFocus(): void {
    const point = this.focusPlacementPoint();
    if (this.tool === 'prefab') {
      this.stampPrefab(point);
      return;
    }
    if (this.tool === 'prop') {
      const prop = this.game.studioAddProp(
        this.activeAssetKey,
        new THREE.Vector3(point.x + 0.5, point.feetY, point.z + 0.5),
      );
      if (prop) {
        this.selectedProp = prop;
        this.selectedEntity = null;
        this.selectedBlock = null;
        this.game.toast(`Placed ${prop.name}.`, 'good');
        this.renderRight();
        this.updateSelectionHelper();
        this.updateStatus();
      }
      return;
    }
    if (this.tool === 'entity') {
      const entity = this.game.studioAddEntity(
        this.activeAssetKey,
        new THREE.Vector3(point.x + 0.5, point.feetY, point.z + 0.5),
      );
      if (entity) {
        this.selectedEntity = entity;
        this.selectedProp = null;
        this.selectedBlock = null;
        this.game.toast(`Spawned ${entity.displayName}.`, 'good');
        this.renderRight();
        this.updateSelectionHelper();
        this.updateStatus();
      }
    }
  }

  private updateGhost(): void {
    if (!this.openState) return;
    this.ghost.visible = false;
    this.blockHighlight.visible = false;
    if (!this.hover) {
      this.hoverBlock = null;
      this.updateStatus();
      return;
    }
    const hit = this.hitAt(this.hover.x, this.hover.y);
    if (!hit) {
      this.hoverBlock = null;
      this.updateStatus();
      return;
    }
    const hoverKey = `${hit.x},${hit.y},${hit.z}`;
    if (hoverKey !== this.lastHoverKey) {
      this.lastHoverKey = hoverKey;
      this.updateStatus();
    }
    this.hoverBlock = { x: hit.x, y: hit.y, z: hit.z };
    this.blockHighlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.blockHighlight.visible = this.tool !== 'pan';

    if (this.tool === 'paint' || this.tool === 'erase') {
      const cell = this.tool === 'erase' ? { x: hit.x, y: hit.y, z: hit.z } : this.paintCell(hit);
      if (!cell) return;
      this.ghost.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      this.ghost.scale.set(1, 1, 1);
      this.ghost.visible = true;
      return;
    }
    if (this.tool === 'prefab') {
      const prefab = PREFABS.find((entry) => entry.key === this.activePrefab);
      if (!prefab) return;
      const point = this.placementFromHit(hit);
      const [w, h, d] = prefab.size;
      this.ghost.position.set(point.x + 0.5, point.stampY - 1 + h / 2, point.z + 0.5);
      this.ghost.scale.set(w, h, d);
      this.ghost.visible = true;
      return;
    }
    if (this.tool === 'prop' || this.tool === 'entity') {
      const asset = this.activeAssetEntry();
      const size = asset?.size ?? [1, 1.8, 1];
      const point = this.placementFromHit(hit);
      this.ghost.position.set(point.x + 0.5, point.feetY + size[1] / 2, point.z + 0.5);
      this.ghost.scale.set(size[0], size[1], size[2]);
      this.ghost.visible = true;
    }
  }

  // ------------------------------------------------------------------ selection

  private selectAt(clientX: number, clientY: number): void {
    const ray = this.pointerRay(clientX, clientY);
    let best = Infinity;
    let prop: StudioProp | null = null;
    let entity: GameEntity | null = null;
    let block: { x: number; y: number; z: number; key: string } | null = null;

    const propHits = ray.intersectObjects(this.game.studioProps.map((entry) => entry.object), true);
    if (propHits.length && propHits[0].distance < best) {
      best = propHits[0].distance;
      let node: THREE.Object3D | null = propHits[0].object;
      while (node && !node.userData.studioPropId) node = node.parent;
      const id = node?.userData.studioPropId as string | undefined;
      prop = this.game.studioProps.find((entry) => entry.id === id) ?? null;
    }

    const hitEntity = this.game.entities.raycast(ray.ray.origin, ray.ray.direction, 160);
    if (hitEntity) {
      const distance = hitEntity.center.distanceTo(ray.ray.origin);
      if (distance < best) {
        best = distance;
        prop = null;
        entity = hitEntity;
      }
    }

    const hit = this.game.world.raycast(ray.ray.origin, ray.ray.direction, 130);
    if (hit && hit.distance < best) {
      prop = null;
      entity = null;
      block = { x: hit.x, y: hit.y, z: hit.z, key: blockById(hit.id).key };
    }

    this.selectedProp = prop;
    this.selectedEntity = entity;
    this.selectedBlock = block;
    this.renderRight();
    this.updateSelectionHelper();
    this.updateHint();
  }

  private clearSelection(): void {
    this.selectedProp = null;
    this.selectedEntity = null;
    this.selectedBlock = null;
    this.updateSelectionHelper();
    this.renderRight();
    this.updateHint();
  }

  /** Keep the block inspector in sync when a stroke edits the selected cell. */
  private syncSelectedBlock(): void {
    const selected = this.selectedBlock;
    if (!selected) return;
    const key = blockById(this.game.world.getBlock(selected.x, selected.y, selected.z)).key;
    if (key === selected.key) return;
    if (key === 'air') {
      this.selectedBlock = null;
      this.updateSelectionHelper();
      this.renderRight();
      this.updateHint();
      return;
    }
    selected.key = key;
    this.updateSelectionHelper();
    this.renderRight();
  }

  private focusSelection(): void {
    let center: THREE.Vector3 | null = null;
    let distance = 10;
    if (this.selectedProp) {
      const box = new THREE.Box3().setFromObject(this.selectedProp.object);
      if (!box.isEmpty()) {
        center = box.getCenter(new THREE.Vector3());
        distance = Math.max(6, box.getSize(new THREE.Vector3()).length() * 1.6);
      }
    } else if (this.selectedEntity) {
      center = this.selectedEntity.position.clone().add(new THREE.Vector3(0, this.selectedEntity.def.bodyHeight * 0.5, 0));
      distance = Math.max(6, this.selectedEntity.def.bodyHeight * 3.2);
    } else if (this.selectedBlock) {
      center = new THREE.Vector3(this.selectedBlock.x + 0.5, this.selectedBlock.y + 0.5, this.selectedBlock.z + 0.5);
      distance = 8;
    }
    if (!center) {
      this.focusPlayer();
      return;
    }
    this.target.copy(center);
    this.distance = distance;
    this.pitch = 0.55;
    this.updateCamera();
    this.updateSelectionHelper();
  }

  private removeSelected(): void {
    if (this.selectedProp) {
      const prop = this.selectedProp;
      this.selectedProp = null;
      this.game.studioRemoveProp(prop);
      this.game.toast(`Deleted ${prop.name}.`, 'info');
      this.renderRight();
      this.updateSelectionHelper();
      this.updateStatus();
      return;
    }
    if (this.selectedEntity) {
      const entity = this.selectedEntity;
      this.selectedEntity = null;
      this.game.studioRemoveEntity(entity);
      this.game.toast(`Deleted ${entity.displayName}.`, 'info');
      this.renderRight();
      this.updateSelectionHelper();
      this.updateStatus();
      return;
    }
    if (this.selectedBlock) {
      const block = this.selectedBlock;
      this.selectedBlock = null;
      this.game.studioBeginStroke('Erase block');
      this.game.studioEraseBlock(block.x, block.y, block.z);
      this.game.studioEndStroke();
      this.game.toast('Block removed.', 'info');
      this.renderRight();
      this.updateSelectionHelper();
      this.updateStatus();
    }
  }

  private duplicateSelected(): void {
    if (this.selectedProp) {
      const prop = this.selectedProp;
      const position = prop.object.position.clone().add(new THREE.Vector3(1.5, 0, 0));
      const clone = this.game.studioCloneProp(prop, position);
      if (clone) {
        this.selectedProp = clone;
        this.game.toast(`Duplicated ${prop.name}.`, 'good');
        this.renderRight();
        this.updateSelectionHelper();
        this.updateStatus();
      }
      return;
    }
    if (this.selectedEntity) {
      const entity = this.selectedEntity;
      const position = entity.position.clone().add(new THREE.Vector3(1.5, 0, 0));
      const clone = this.game.studioAddEntity(entity.def.key, position);
      if (clone) {
        this.selectedEntity = clone;
        this.game.toast(`Duplicated ${entity.displayName}.`, 'good');
        this.renderRight();
        this.updateSelectionHelper();
        this.updateStatus();
      }
    }
  }

  private updateSelectionHelper(): void {
    let box: THREE.Box3 | null = null;
    if (this.selectedProp && this.game.studioProps.includes(this.selectedProp)) {
      const candidate = new THREE.Box3().setFromObject(this.selectedProp.object);
      if (!candidate.isEmpty()) box = candidate;
    } else if (this.selectedEntity && this.game.entities?.entities.includes(this.selectedEntity)) {
      const e = this.selectedEntity;
      const radius = Math.max(0.35, e.def.bodyRadius * e.def.scale);
      const height = Math.max(0.8, e.def.bodyHeight * e.def.scale);
      box = new THREE.Box3(
        new THREE.Vector3(e.position.x - radius, e.position.y, e.position.z - radius),
        new THREE.Vector3(e.position.x + radius, e.position.y + height, e.position.z + radius),
      );
    } else if (this.selectedBlock) {
      const b = this.selectedBlock;
      box = new THREE.Box3(
        new THREE.Vector3(b.x, b.y, b.z),
        new THREE.Vector3(b.x + 1, b.y + 1, b.z + 1),
      );
    }
    if (box) {
      this.selectionBox.box.copy(box);
      this.selectionBox.visible = this.openState;
    } else {
      this.selectionBox.visible = false;
    }
  }

  // ------------------------------------------------------------------ tool state

  private setTool(tool: StudioTool, announce = false): void {
    const kind = this.activeAssetKind();
    if (tool === 'prop' && kind !== 'prop' && kind !== 'imported') {
      this.activeAssetKey = 'prop:lamp_post';
    }
    if (tool === 'entity' && kind === 'prop') {
      this.activeAssetKey = 'human:adventurer';
    }
    this.tool = tool;
    if (tool === 'prefab') this.setTab('prefabs', false);
    else if (tool === 'prop' || tool === 'entity') this.setTab('assets', false);
    else if (tool === 'paint' || tool === 'erase') this.setTab('blocks', false);
    this.updateToolUi();
    this.renderList();
    this.renderRight();
    this.updateGhost();
    if (announce) {
      const info = TOOL_INFO[tool];
      this.game.toast(`${info.label} selected.`, 'info');
    }
  }

  private setTab(tab: typeof this.tab, rebuild = true): void {
    this.tab = tab;
    this.leftTabs.querySelectorAll<HTMLElement>('[data-left-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.leftTab === tab);
    });
    if (rebuild) this.renderLeft();
  }

  private setRightTab(tab: typeof this.rightTab): void {
    this.rightTab = tab;
    this.rightTabs.querySelectorAll<HTMLElement>('[data-right-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.rightTab === tab);
    });
    this.renderRight();
  }

  private toggleGrid(): void {
    this.gridVisible = !this.gridVisible;
    this.grid.visible = this.gridVisible && this.openState;
    const button = this.toolStrip.querySelector<HTMLElement>('[data-action="grid"]');
    button?.classList.toggle('active', this.gridVisible);
    this.game.toast(`Build grid ${this.gridVisible ? 'on' : 'off'}.`, 'info');
  }

  private updateToolUi(): void {
    this.toolStrip.querySelectorAll<HTMLElement>('[data-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === this.tool);
    });
    const gridButton = this.toolStrip.querySelector<HTMLElement>('[data-action="grid"]');
    gridButton?.classList.toggle('active', this.gridVisible);
    const cursors: Record<StudioTool, string> = {
      select: 'default',
      paint: 'crosshair',
      erase: 'crosshair',
      prefab: 'copy',
      prop: 'copy',
      entity: 'copy',
      pan: 'grab',
    };
    this.view.style.cursor = cursors[this.tool];
    this.updateHint();
  }

  private updateHint(): void {
    let text = '';
    if (this.tool === 'select') {
      text = '<b>Select</b> · click props, entities or blocks · <b>F</b> focus · <b>Del</b> delete';
    } else if (this.tool === 'paint') {
      text = `<b>Paint</b> · ${escapeHtml(this.blockName(this.blockKey))} · ${this.paintMode === 'replace' ? 'replaces the clicked block' : 'builds on the clicked face'} · drag to paint`;
    } else if (this.tool === 'erase') {
      text = '<b>Erase</b> · click or drag to remove blocks';
    } else if (this.tool === 'prefab') {
      const prefab = PREFABS.find((entry) => entry.key === this.activePrefab);
      text = `<b>Stamp prefab</b> · ${escapeHtml(prefab?.name ?? 'Prefab')} · click the ground to stamp`;
    } else if (this.tool === 'prop') {
      text = `<b>Place prop</b> · ${escapeHtml(this.activeAssetName())} · click the ground to place`;
    } else if (this.tool === 'entity') {
      text = `<b>Place entity</b> · ${escapeHtml(this.activeAssetName())} · click the ground to spawn`;
    } else {
      text = '<b>Pan</b> · left-drag to pan · right-drag to orbit · wheel to zoom';
    }
    this.hintEl.innerHTML = `${text} <span style="opacity:.55">· RMB orbit · wheel zoom</span>`;
  }

  private updateMode(): void {
    const editing = this.openState;
    this.modePill.classList.toggle('play', !editing);
    const label = this.modePill.querySelector<HTMLElement>('[data-mode-text]');
    if (label) label.textContent = editing ? 'Edit mode' : 'Play mode';
    this.statusMode.textContent = editing ? 'Edit mode' : 'Play mode';
  }

  private updateTimeLabels(): void {
    const label = this.formatTime(this.game.sky.time);
    this.statusTime.textContent = `${label} · ${this.game.sky.weather}`;
    const worldLabel = this.leftContent.querySelector<HTMLElement>('[data-time-label]');
    if (worldLabel) worldLabel.textContent = label;
  }

  private formatTime(hours: number): string {
    const h = Math.floor(((hours % 24) + 24) % 24);
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private updateStatus(): void {
    if (!this.game) return;
    const props = this.game.studioProps.length;
    const entities = this.game.entities?.entities.filter((entry) => entry.alive).length ?? 0;
    const chunks = this.game.world?.chunks.size ?? 0;
    const edits = this.game.world?.editCount ?? 0;
    this.statusProps.textContent = String(props);
    this.statusEntities.textContent = String(entities);
    this.statusChunks.textContent = String(chunks);
    this.statusEdits.textContent = String(edits);
    if (this.hoverBlock) {
      this.statusTarget.textContent = `${this.hoverBlock.x}, ${this.hoverBlock.y}, ${this.hoverBlock.z}`;
    } else {
      this.statusTarget.textContent = '—';
    }
    this.updateTimeLabels();
  }

  // ------------------------------------------------------------------ project actions

  private saveProject(): void {
    const name = (this.projectName || this.game.template.name).trim();
    if (!name) {
      this.game.toast('Give the project a name first.', 'warn');
      return;
    }
    this.projectName = name;
    this.game.projectName = name;
    this.game.studioSaveProject(name);
    this.updateStatus();
  }

  private exportProject(): void {
    const name = (this.projectName || this.game.template.name).trim() || 'VoxelForge Project';
    this.projectName = name;
    this.game.projectName = name;
    this.game.studioExportProject(name);
  }

  private play(): void {
    this.game.closeStudio();
    this.game.toast('Back in play mode. Click to capture the mouse.', 'info');
  }

  private exit(): void {
    this.game.closeStudio();
    this.game.requestPause();
  }

  private async importModel(file: File): Promise<void> {
    const point = this.focusPlacementPoint();
    const prop = await this.game.studioImportModel(
      file,
      new THREE.Vector3(point.x + 0.5, point.feetY, point.z + 0.5),
    );
    if (!prop) return;
    this.selectedProp = prop;
    this.selectedEntity = null;
    this.selectedBlock = null;
    this.tool = 'prop';
    this.updateToolUi();
    this.renderLeft();
    this.renderRight();
    this.updateSelectionHelper();
    this.updateStatus();
  }

  private async importProject(file: File): Promise<void> {
    await this.game.studioImportProject(file);
    if (this.game.started && !this.game.isStudioOpen) this.game.openStudio();
    this.refresh();
  }

  // ------------------------------------------------------------------ active asset

  private activeAssetEntry(): AssetEntry | undefined {
    return getAsset(this.activeAssetKey);
  }

  private activeAssetKind(): AssetKind | 'imported' {
    const entry = this.activeAssetEntry();
    if (entry) return entry.kind;
    return this.game.studioAssets.some((asset) => asset.key === this.activeAssetKey) ? 'imported' : 'prop';
  }

  private activeAssetName(): string {
    const entry = this.activeAssetEntry();
    if (entry) return entry.name;
    return this.game.studioAssets.find((asset) => asset.key === this.activeAssetKey)?.name ?? 'Asset';
  }

  private blockName(key: string): string {
    return BLOCKS.find((entry) => entry.key === key)?.name ?? key;
  }

  private selectAsset(key: string): void {
    const entry = getAsset(key);
    if (!entry) return;
    this.activeAssetKey = key;
    this.setTool(entry.kind === 'prop' ? 'prop' : 'entity');
    this.renderList();
    this.renderRight();
  }

  private selectImported(key: string): void {
    if (!this.game.studioAssets.some((asset) => asset.key === key)) return;
    this.activeAssetKey = key;
    this.setTool('prop');
    this.renderLeft();
    this.renderRight();
  }

  private selectBlock(key: string): void {
    this.blockKey = key;
    this.setTool('paint');
    this.renderList();
    this.renderRight();
  }

  private selectPrefab(key: string): void {
    this.activePrefab = key;
    this.setTool('prefab');
    this.renderList();
    this.renderRight();
  }

  // ------------------------------------------------------------------ left panel

  private renderLeft(): void {
    this.leftTabs.querySelectorAll<HTMLElement>('[data-left-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.leftTab === this.tab);
    });
    if (this.tab === 'assets') this.renderAssetsTab();
    else if (this.tab === 'blocks') this.renderBlocksTab();
    else if (this.tab === 'prefabs') this.renderPrefabsTab();
    else this.renderWorldTab();
  }

  private renderAssetsTab(): void {
    const kinds: Array<{ key: AssetKind | 'all'; label: string }> = [
      { key: 'all', label: 'All' },
      { key: 'character', label: 'Characters' },
      { key: 'creature', label: 'Creatures' },
      { key: 'prop', label: 'Props' },
    ];
    this.leftContent.innerHTML = `
      <div class="search-box studio-search">
        <input class="input" data-list-search placeholder="Search ${ASSETS.length} assets…" value="${escapeHtml(this.assetQuery)}" aria-label="Search assets">
      </div>
      <div class="studio-filter-row">
        ${kinds.map((kind) => `<button class="studio-chip ${this.assetKind === kind.key ? 'active' : ''}" data-kind="${kind.key}">${kind.label}</button>`).join('')}
      </div>
      <div class="studio-filter-row">
        <select class="input studio-select" data-category aria-label="Asset category">
          ${ASSET_CATEGORIES.map((category) => `<option value="${category.id}" ${this.assetCategory === category.id ? 'selected' : ''}>${category.icon} ${category.label}</option>`).join('')}
        </select>
      </div>
      <div class="panel-section">
        <div class="panel-title">Catalog <span class="spacer"></span><span data-list-count>—</span></div>
        <div data-list></div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Blockbench <span class="spacer"></span><span>${this.game.studioAssets.length}</span></div>
        <button class="btn ghost small wide" data-import-model>⬆ Import .bbmodel</button>
        <div class="entity-list" style="margin-top:6px">
          ${this.game.studioAssets.length
            ? this.game.studioAssets.map((asset) => `
                <div class="entity-row ${this.activeAssetKey === asset.key ? 'selected' : ''}" data-imported="${escapeHtml(asset.key)}" role="button" tabindex="0">
                  <span class="entity-dot prop"></span>
                  <span class="entity-name">${escapeHtml(asset.name)}</span>
                  <span class="entity-type">bbmodel</span>
                </div>`).join('')
            : '<div class="empty-selection" style="padding:12px 6px;font-size:9.5px">Drop a Blockbench model here to use it as a prop.</div>'}
        </div>
        <div class="muted tiny" style="margin-top:7px;line-height:1.5">Imported models are embedded in saves and exported projects.</div>
      </div>
    `;

    const search = this.leftContent.querySelector<HTMLInputElement>('[data-list-search]');
    search?.addEventListener('input', () => {
      this.assetQuery = search.value;
      this.renderList();
    });
    this.leftContent.querySelectorAll<HTMLElement>('[data-kind]').forEach((button) => {
      button.addEventListener('click', () => {
        this.assetKind = button.dataset.kind as AssetKind | 'all';
        this.renderAssetsTab();
      });
    });
    const category = this.leftContent.querySelector<HTMLSelectElement>('[data-category]');
    category?.addEventListener('change', () => {
      this.assetCategory = category.value as AssetCategory | 'all';
      this.renderList();
    });
    this.leftContent.querySelector<HTMLElement>('[data-import-model]')?.addEventListener('click', () => this.modelInput.click());
    this.leftContent.querySelectorAll<HTMLElement>('[data-imported]').forEach((row) => {
      row.addEventListener('click', () => this.selectImported(row.dataset.imported ?? ''));
    });
    this.renderList();
  }

  private renderBlocksTab(): void {
    this.leftContent.innerHTML = `
      <div class="search-box studio-search">
        <input class="input" data-list-search placeholder="Search ${BLOCKS.length} blocks…" value="${escapeHtml(this.blockQuery)}" aria-label="Search blocks">
      </div>
      <div class="studio-filter-row">
        <select class="input studio-select" data-block-category aria-label="Block category">
          ${BLOCK_CATEGORIES.map((category) => `<option value="${category.id}" ${this.blockCategory === category.id ? 'selected' : ''}>${category.label}</option>`).join('')}
        </select>
      </div>
      <div class="studio-filter-row">
        <button class="studio-chip ${this.paintMode === 'place' ? 'active' : ''}" data-paint-mode="place">Build on face</button>
        <button class="studio-chip ${this.paintMode === 'replace' ? 'active' : ''}" data-paint-mode="replace">Replace surface</button>
      </div>
      <div class="panel-section">
        <div class="panel-title">Block palette <span class="spacer"></span><span data-list-count>—</span></div>
        <div data-list class="block-palette"></div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Selected block</div>
        <div class="prop-static" data-selected-block>
          <img src="${this.game.atlas.getBlockIcon(this.blockKey)}" alt="" style="width:28px;height:28px;image-rendering:pixelated">
          <span>${escapeHtml(this.blockName(this.blockKey))}</span>
        </div>
      </div>
    `;
    const search = this.leftContent.querySelector<HTMLInputElement>('[data-list-search]');
    search?.addEventListener('input', () => {
      this.blockQuery = search.value;
      this.renderList();
    });
    const category = this.leftContent.querySelector<HTMLSelectElement>('[data-block-category]');
    category?.addEventListener('change', () => {
      this.blockCategory = category.value;
      this.renderList();
    });
    this.leftContent.querySelectorAll<HTMLElement>('[data-paint-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.paintMode = button.dataset.paintMode === 'replace' ? 'replace' : 'place';
        this.renderBlocksTab();
        this.updateHint();
        this.updateGhost();
      });
    });
    this.renderList();
  }

  private renderPrefabsTab(): void {
    this.leftContent.innerHTML = `
      <div class="search-box studio-search">
        <input class="input" data-list-search placeholder="Search ${PREFABS.length} prefabs…" value="${escapeHtml(this.prefabQuery)}" aria-label="Search prefabs">
      </div>
      <div class="studio-filter-row">
        <select class="input studio-select" data-prefab-tag aria-label="Prefab tag">
          <option value="all" ${this.prefabTag === 'all' ? 'selected' : ''}>All prefabs</option>
          ${PREFAB_TAGS.map((tag) => `<option value="${escapeHtml(tag)}" ${this.prefabTag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
        </select>
      </div>
      <div class="panel-section">
        <div class="panel-title">Structures <span class="spacer"></span><span data-list-count>—</span></div>
        <div data-list></div>
      </div>
      <div class="panel-section">
        <div class="panel-title">How stamping works</div>
        <div class="muted tiny" style="line-height:1.6">Click a prefab, then click the ground to stamp it. Prefabs keep their authored layout and can be undone with Ctrl+Z.</div>
      </div>
    `;
    const search = this.leftContent.querySelector<HTMLInputElement>('[data-list-search]');
    search?.addEventListener('input', () => {
      this.prefabQuery = search.value;
      this.renderList();
    });
    const tag = this.leftContent.querySelector<HTMLSelectElement>('[data-prefab-tag]');
    tag?.addEventListener('change', () => {
      this.prefabTag = tag.value;
      this.renderList();
    });
    this.renderList();
  }

  private renderWorldTab(): void {
    const sky = this.game.sky;
    const rules = this.game.rules;
    const world = this.game.world;
    this.leftContent.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Time of day <span class="spacer"></span><span data-time-label>${this.formatTime(sky.time)}</span></div>
        <input class="input" type="range" min="0" max="24" step="0.25" value="${sky.time}" data-sky-time aria-label="Time of day">
        <div class="studio-filter-row" style="margin-top:7px">
          <button class="studio-chip" data-time="6">Dawn</button>
          <button class="studio-chip" data-time="12">Noon</button>
          <button class="studio-chip" data-time="18">Dusk</button>
          <button class="studio-chip" data-time="0">Night</button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Weather</div>
        <div class="studio-filter-row">
          ${WEATHER.map((entry) => `<button class="studio-chip ${this.weather === entry.key ? 'active' : ''}" data-weather="${entry.key}">${entry.glyph} ${entry.label}</button>`).join('')}
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">World rules</div>
        ${RULE_ROWS.map((rule) => `
          <div class="rule-row" title="${escapeHtml(rule.hint)}">
            <span>${escapeHtml(rule.label)}</span>
            <label class="toggle"><input type="checkbox" data-rule="${rule.key}" ${rules[rule.key] ? 'checked' : ''}></label>
          </div>
        `).join('')}
      </div>
      <div class="panel-section">
        <div class="panel-title">Session</div>
        <div class="studio-stat-grid">
          <div class="studio-stat"><b>${this.game.seed}</b><span>seed</span></div>
          <div class="studio-stat"><b>${this.game.baseY}</b><span>base Y</span></div>
          <div class="studio-stat"><b>${world.chunks.size}</b><span>chunks</span></div>
          <div class="studio-stat"><b>${world.editCount}</b><span>edits</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
          <button class="mini-btn" data-world-action="focus">Focus player</button>
          <button class="mini-btn" data-world-action="teleport">Player to view</button>
          <button class="mini-btn" data-world-action="reload">Reload chunks</button>
          <button class="mini-btn" data-world-action="grid">Toggle grid</button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Template</div>
        <div class="prop-static" style="justify-content:space-between">
          <span>${escapeHtml(this.game.template.name)}</span>
          <span class="pill ${this.game.template.difficulty === 'peaceful' ? 'green' : this.game.template.difficulty === 'nightmare' ? 'red' : 'blue'}">${this.game.template.difficulty}</span>
        </div>
        <div class="muted tiny" style="margin-top:6px;line-height:1.55">Rules and world edits are saved with the project. Use Export to move the whole level to another browser.</div>
      </div>
    `;

    const time = this.leftContent.querySelector<HTMLInputElement>('[data-sky-time]');
    time?.addEventListener('input', () => {
      this.game.sky.setTime(parseFloat(time.value));
      this.game.sky.update(0, this.game.camera.position);
      this.updateTimeLabels();
    });
    this.leftContent.querySelectorAll<HTMLElement>('[data-time]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = parseFloat(button.dataset.time ?? '12');
        this.game.sky.setTime(value);
        this.game.sky.update(0, this.game.camera.position);
        this.renderWorldTab();
      });
    });
    this.leftContent.querySelectorAll<HTMLElement>('[data-weather]').forEach((button) => {
      button.addEventListener('click', () => {
        this.weather = (button.dataset.weather as WeatherKind | undefined) ?? 'clear';
        this.game.sky.setWeather(this.weather);
        this.game.sky.update(0, this.game.camera.position);
        this.renderWorldTab();
      });
    });
    this.leftContent.querySelectorAll<HTMLInputElement>('[data-rule]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.rule as keyof WorldRules | undefined;
        if (!key) return;
        this.game.rules[key] = input.checked;
        this.game.applyRules();
        this.updateHint();
      });
    });
    this.leftContent.querySelectorAll<HTMLElement>('[data-world-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.worldAction;
        if (action === 'focus') this.focusPlayer();
        else if (action === 'teleport') {
          const point = this.focusPlacementPoint();
          this.game.player.teleport(new THREE.Vector3(point.x + 0.5, point.feetY + 0.02, point.z + 0.5));
          this.game.toast('Player moved to the view center.', 'info');
        } else if (action === 'reload') {
          const p = this.game.camera.position;
          this.game.world.ensureArea(p.x - 34, p.z - 34, p.x + 34, p.z + 34, true);
          this.game.toast('Chunks rebuilt around the camera.', 'info');
          this.updateStatus();
        } else if (action === 'grid') {
          this.toggleGrid();
        }
      });
    });
  }

  private renderList(): void {
    const container = this.leftContent.querySelector<HTMLElement>('[data-list]');
    if (!container) return;
    if (this.tab === 'assets') this.renderAssetList(container);
    else if (this.tab === 'blocks') this.renderBlockList(container);
    else if (this.tab === 'prefabs') this.renderPrefabList(container);
  }

  private renderAssetList(container: HTMLElement): void {
    const kind = this.assetKind === 'all' ? undefined : this.assetKind;
    const assets = findAssets(this.assetQuery, kind, this.assetCategory);
    const count = this.leftContent.querySelector<HTMLElement>('[data-list-count]');
    if (count) count.textContent = `${assets.length} shown`;
    container.className = 'asset-grid';
    container.innerHTML = assets.map((asset) => {
      const selected = asset.key === this.activeAssetKey ? ' selected' : '';
      return `<button type="button" class="asset-card${selected}" data-asset="${escapeHtml(asset.key)}" title="${escapeHtml(asset.description)}">
        <div class="asset-thumb" data-thumb="${escapeHtml(asset.key)}">${this.thumbHtml(asset)}</div>
        <div class="asset-name">${escapeHtml(asset.name)}</div>
        <div class="asset-meta">${asset.kind} · ${escapeHtml(asset.role)}</div>
      </button>`;
    }).join('') || '<div class="empty-selection">No assets match that search.</div>';
    container.querySelectorAll<HTMLElement>('[data-asset]').forEach((card) => {
      const key = card.dataset.asset ?? '';
      card.addEventListener('click', () => this.selectAsset(key));
      card.addEventListener('dblclick', () => {
        this.selectAsset(key);
        this.placeActiveAtFocus();
      });
    });
  }

  private thumbHtml(asset: AssetEntry): string {
    const cached = assetThumbnailer().cached(asset.key);
    if (cached) return `<img src="${cached}" alt="">`;
    void assetThumbnailer().get(asset.key).then((url) => {
      this.leftContent.querySelectorAll<HTMLElement>(`[data-thumb="${asset.key}"]`).forEach((node) => {
        node.innerHTML = `<img src="${url}" alt="">`;
      });
    }).catch(() => undefined);
    return `<span class="glyph">${assetGlyph(asset)}</span>`;
  }

  private renderBlockList(container: HTMLElement): void {
    const query = this.blockQuery.trim().toLowerCase();
    const blocks = BLOCKS.filter((entry) => {
      if (entry.key === 'air' || entry.unlisted) return false;
      if (this.blockCategory !== 'all' && entry.category !== this.blockCategory) return false;
      if (!query) return true;
      return `${entry.name} ${entry.key}`.toLowerCase().includes(query);
    });
    const count = this.leftContent.querySelector<HTMLElement>('[data-list-count]');
    if (count) count.textContent = `${blocks.length} blocks`;
    container.className = 'block-palette';
    container.innerHTML = blocks.map((entry) => `
      <button type="button" class="block-swatch ${entry.key === this.blockKey ? 'active' : ''}" data-block="${escapeHtml(entry.key)}" title="${escapeHtml(entry.name)}">
        <img src="${this.game.atlas.getBlockIcon(entry.key)}" alt="${escapeHtml(entry.name)}" loading="lazy">
      </button>
    `).join('') || '<div class="empty-selection">No blocks match that search.</div>';
    container.querySelectorAll<HTMLElement>('[data-block]').forEach((swatch) => {
      swatch.addEventListener('click', () => this.selectBlock(swatch.dataset.block ?? 'grass_block'));
    });
  }

  private renderPrefabList(container: HTMLElement): void {
    const prefabs = findPrefabs(this.prefabQuery, this.prefabTag);
    const count = this.leftContent.querySelector<HTMLElement>('[data-list-count]');
    if (count) count.textContent = `${prefabs.length} prefabs`;
    container.className = '';
    container.innerHTML = prefabs.map((prefab) => `
      <div class="prefab-card ${prefab.key === this.activePrefab ? 'selected' : ''}" data-prefab="${escapeHtml(prefab.key)}" role="button" tabindex="0" title="${escapeHtml(prefab.description)}">
        <div class="prefab-art">${prefab.glyph}</div>
        <div class="prefab-info">
          <div class="prefab-name">${escapeHtml(prefab.name)}</div>
          <div class="prefab-size">${prefab.size[0]}×${prefab.size[1]}×${prefab.size[2]} · ${prefab.tags.slice(0, 2).join(' · ')}</div>
        </div>
      </div>
    `).join('') || '<div class="empty-selection">No prefabs match that search.</div>';
    container.querySelectorAll<HTMLElement>('[data-prefab]').forEach((card) => {
      const key = card.dataset.prefab ?? '';
      card.addEventListener('click', () => this.selectPrefab(key));
      card.addEventListener('dblclick', () => {
        this.selectPrefab(key);
        this.placeActiveAtFocus();
      });
    });
  }

  // ------------------------------------------------------------------ right panel

  private renderRight(): void {
    if (this.selectedProp && !this.game.studioProps.includes(this.selectedProp)) this.selectedProp = null;
    if (this.selectedEntity && !this.game.entities?.entities.includes(this.selectedEntity)) this.selectedEntity = null;
    this.rightTabs.querySelectorAll<HTMLElement>('[data-right-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.rightTab === this.rightTab);
    });
    if (this.rightTab === 'scene') this.renderScene();
    else this.renderInspector();
  }

  private renderInspector(): void {
    if (this.selectedProp) {
      this.renderPropInspector(this.selectedProp);
      return;
    }
    if (this.selectedEntity) {
      this.renderEntityInspector(this.selectedEntity);
      return;
    }
    if (this.selectedBlock) {
      this.renderBlockInspector(this.selectedBlock);
      return;
    }
    if (this.tool === 'prefab') {
      this.renderPrefabInspector();
      return;
    }
    if (this.tool === 'prop' || this.tool === 'entity') {
      this.renderPlacementInspector();
      return;
    }
    this.renderEmptyInspector();
  }

  private renderPropInspector(prop: StudioProp): void {
    const pos = prop.object.position;
    const degrees = Math.round((prop.object.rotation.y * 180) / Math.PI * 10) / 10;
    const asset = prop.assetKey ? getAsset(prop.assetKey) : undefined;
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="panel-section">
          <div class="panel-title">Prop <span class="spacer"></span><span>${prop.assetKey ? 'catalog' : 'imported'}</span></div>
          <div class="property">
            <label>Name</label>
            <input class="input" data-prop-name value="${escapeHtml(prop.name)}" aria-label="Prop name">
          </div>
          <div class="property">
            <label>Position <span class="val">world</span></label>
            <div class="vec-row">
              <input class="input" type="number" step="0.1" data-prop-pos="x" value="${pos.x.toFixed(2)}" aria-label="Position X">
              <input class="input" type="number" step="0.1" data-prop-pos="y" value="${pos.y.toFixed(2)}" aria-label="Position Y">
              <input class="input" type="number" step="0.1" data-prop-pos="z" value="${pos.z.toFixed(2)}" aria-label="Position Z">
            </div>
          </div>
          <div class="property">
            <label>Rotation Y <span class="val">${degrees}°</span></label>
            <input class="input" type="number" step="5" data-prop-rot value="${degrees}" aria-label="Rotation Y">
          </div>
          <div class="property">
            <label>Scale</label>
            <input class="input" type="number" step="0.05" min="0.1" max="8" data-prop-scale value="${prop.object.scale.x.toFixed(2)}" aria-label="Scale">
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">Actions</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            <button class="mini-btn" data-prop-action="focus">Focus</button>
            <button class="mini-btn" data-prop-action="duplicate">Duplicate</button>
            <button class="mini-btn" data-prop-action="export">Export .bbmodel</button>
            <button class="mini-btn danger" data-prop-action="delete">Delete</button>
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">Model</div>
          <div class="prop-static">${escapeHtml(asset?.role ?? (prop.assetKey ? prop.assetKey : 'Custom Blockbench import'))}</div>
          <div class="muted tiny" style="margin-top:6px;line-height:1.55">Props are scene objects, not entities. They are saved with the project and included in exports.</div>
        </div>
      </div>
    `;
    const name = this.rightContent.querySelector<HTMLInputElement>('[data-prop-name]');
    name?.addEventListener('change', () => {
      prop.name = name.value.trim() || prop.name;
      prop.object.name = `studio:${prop.name}`;
      this.renderRight();
    });
    this.rightContent.querySelectorAll<HTMLInputElement>('[data-prop-pos]').forEach((input) => {
      input.addEventListener('change', () => {
        const axis = input.dataset.propPos as 'x' | 'y' | 'z' | undefined;
        if (!axis) return;
        const value = parseFloat(input.value);
        if (Number.isFinite(value)) prop.object.position[axis] = value;
        this.updateSelectionHelper();
        this.updateStatus();
      });
    });
    const rotation = this.rightContent.querySelector<HTMLInputElement>('[data-prop-rot]');
    rotation?.addEventListener('change', () => {
      const value = parseFloat(rotation.value);
      if (Number.isFinite(value)) prop.object.rotation.y = (value * Math.PI) / 180;
      this.updateSelectionHelper();
    });
    const scale = this.rightContent.querySelector<HTMLInputElement>('[data-prop-scale]');
    scale?.addEventListener('change', () => {
      const value = parseFloat(scale.value);
      if (Number.isFinite(value)) prop.object.scale.setScalar(Math.min(8, Math.max(0.1, value)));
      this.updateSelectionHelper();
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-prop-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.propAction;
        if (action === 'focus') this.focusSelection();
        else if (action === 'duplicate') this.duplicateSelected();
        else if (action === 'export') this.game.studioExportProp(prop);
        else if (action === 'delete') this.removeSelected();
      });
    });
  }

  private renderEntityInspector(entity: GameEntity): void {
    const pos = entity.position;
    const degrees = Math.round((entity.yaw * 180) / Math.PI * 10) / 10;
    const asset = getAsset(entity.def.assetKey);
    const portrait = assetThumbnailer().cached(entity.def.assetKey);
    const kind = entity.isNpc ? 'NPC' : entity.isHostile ? 'Hostile' : 'Creature';
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="panel-section">
          <div class="panel-title">Entity <span class="spacer"></span><span>${kind}</span></div>
          <div class="prop-static" style="margin-bottom:9px">
            <div style="width:38px;height:38px;border:1px solid #334b55;background:#0e181e;display:flex;align-items:center;justify-content:center;flex:0 0 auto">
              ${portrait ? `<img src="${portrait}" alt="" style="width:34px;height:34px;object-fit:contain">` : `<span style="font-size:19px">${entity.isHostile ? '☠' : entity.isNpc ? '☺' : '🐾'}</span>`}
            </div>
            <div style="min-width:0">
              <div class="entity-name">${escapeHtml(entity.displayName)}</div>
              <div class="entity-type">${escapeHtml(entity.def.key)}</div>
            </div>
          </div>
          <div class="property">
            <label>Display name</label>
            <input class="input" data-entity-name value="${escapeHtml(entity.displayName)}" aria-label="Entity display name">
          </div>
          <div class="property">
            <label>Position <span class="val">world</span></label>
            <div class="vec-row">
              <input class="input" type="number" step="0.1" data-entity-pos="x" value="${pos.x.toFixed(2)}" aria-label="Entity X">
              <input class="input" type="number" step="0.1" data-entity-pos="y" value="${pos.y.toFixed(2)}" aria-label="Entity Y">
              <input class="input" type="number" step="0.1" data-entity-pos="z" value="${pos.z.toFixed(2)}" aria-label="Entity Z">
            </div>
          </div>
          <div class="property">
            <label>Facing <span class="val">${degrees}°</span></label>
            <input class="input" type="number" step="5" data-entity-yaw value="${degrees}" aria-label="Entity facing">
          </div>
          <div class="property">
            <label>AI behavior</label>
            <select class="input" data-entity-behavior aria-label="AI behavior">
              ${BEHAVIORS.map((behavior) => `<option value="${behavior}" ${entity.behavior === behavior ? 'selected' : ''}>${behavior}</option>`).join('')}
            </select>
          </div>
          <div class="property">
            <label>Dialogue</label>
            <textarea class="input" data-entity-dialogue rows="3" placeholder="What does this character say?">${escapeHtml(entity.dialogue ?? '')}</textarea>
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">Vitals</div>
          <div class="studio-stat-grid">
            <div class="studio-stat"><b>${Math.ceil(entity.health)} / ${entity.maxHealth}</b><span>health</span></div>
            <div class="studio-stat"><b>${entity.def.damage}</b><span>damage</span></div>
            <div class="studio-stat"><b>${entity.def.behavior}</b><span>behavior</span></div>
            <div class="studio-stat"><b>${entity.boss ? 'Yes' : 'No'}</b><span>boss</span></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
            <button class="mini-btn" data-entity-action="focus">Focus</button>
            <button class="mini-btn" data-entity-action="duplicate">Duplicate</button>
            <button class="mini-btn" data-entity-action="snap">Snap to ground</button>
            <button class="mini-btn danger" data-entity-action="delete">Delete</button>
          </div>
        </div>
      </div>
    `;
    const name = this.rightContent.querySelector<HTMLInputElement>('[data-entity-name]');
    name?.addEventListener('change', () => {
      entity.displayName = name.value.trim() || entity.displayName;
    });
    this.rightContent.querySelectorAll<HTMLInputElement>('[data-entity-pos]').forEach((input) => {
      input.addEventListener('change', () => {
        const axis = input.dataset.entityPos as 'x' | 'y' | 'z' | undefined;
        if (!axis) return;
        const value = parseFloat(input.value);
        if (Number.isFinite(value)) {
          entity.position[axis] = value;
          entity.root.position.copy(entity.position);
          entity.spawnPosition.copy(entity.position);
        }
        this.updateSelectionHelper();
      });
    });
    const yaw = this.rightContent.querySelector<HTMLInputElement>('[data-entity-yaw]');
    yaw?.addEventListener('change', () => {
      const value = parseFloat(yaw.value);
      if (Number.isFinite(value)) {
        entity.yaw = (value * Math.PI) / 180;
        entity.root.rotation.y = entity.yaw;
      }
      this.updateSelectionHelper();
    });
    const behavior = this.rightContent.querySelector<HTMLSelectElement>('[data-entity-behavior]');
    behavior?.addEventListener('change', () => {
      entity.behavior = behavior.value as AIBehavior;
    });
    const dialogue = this.rightContent.querySelector<HTMLTextAreaElement>('[data-entity-dialogue]');
    dialogue?.addEventListener('change', () => {
      entity.dialogue = dialogue.value;
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-entity-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.entityAction;
        if (action === 'focus') this.focusSelection();
        else if (action === 'duplicate') this.duplicateSelected();
        else if (action === 'delete') this.removeSelected();
        else if (action === 'snap') {
          const ground = this.game.world.getNearestGround(entity.position.x, entity.position.z, WORLD_HEIGHT - 1);
          if (ground > 0) {
            entity.position.y = ground;
            entity.root.position.copy(entity.position);
            entity.spawnPosition.copy(entity.position);
            this.renderRight();
            this.updateSelectionHelper();
          }
        }
      });
    });
  }

  private renderBlockInspector(block: { x: number; y: number; z: number; key: string }): void {
    const def = blockById(BLOCKS.find((entry) => entry.key === block.key)?.id ?? 0);
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="panel-section">
          <div class="panel-title">Block <span class="spacer"></span><span>${block.x}, ${block.y}, ${block.z}</span></div>
          <div class="prop-static" style="margin-bottom:8px">
            <img src="${this.game.atlas.getBlockIcon(block.key)}" alt="" style="width:38px;height:38px;image-rendering:pixelated">
            <div>
              <div class="entity-name">${escapeHtml(def.name)}</div>
              <div class="entity-type">${escapeHtml(def.category)} · ${def.render}</div>
            </div>
          </div>
          <div class="studio-stat-grid">
            <div class="studio-stat"><b>${def.hardness.toFixed(1)}</b><span>hardness</span></div>
            <div class="studio-stat"><b>${def.light || 0}</b><span>light</span></div>
            <div class="studio-stat"><b>${def.solid ? 'Yes' : 'No'}</b><span>solid</span></div>
            <div class="studio-stat"><b>${def.opaque ? 'Yes' : 'No'}</b><span>opaque</span></div>
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">Actions</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            <button class="mini-btn" data-block-action="paint">Paint with this</button>
            <button class="mini-btn" data-block-action="replace">Replace with selected</button>
            <button class="mini-btn danger" data-block-action="erase">Erase</button>
            <button class="mini-btn" data-block-action="focus">Focus</button>
          </div>
        </div>
      </div>
    `;
    this.rightContent.querySelectorAll<HTMLElement>('[data-block-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.blockAction;
        if (action === 'paint') {
          this.blockKey = block.key;
          this.setTool('paint');
          this.game.toast(`${def.name} selected for painting.`, 'info');
        } else if (action === 'replace') {
          this.game.studioBeginStroke('Replace block');
          this.game.studioPaintBlock(block.x, block.y, block.z, this.blockKey);
          this.game.studioEndStroke();
          this.syncSelectedBlock();
          this.updateStatus();
        } else if (action === 'erase') {
          this.game.studioBeginStroke('Erase block');
          this.game.studioEraseBlock(block.x, block.y, block.z);
          this.game.studioEndStroke();
          this.selectedBlock = null;
          this.renderRight();
          this.updateSelectionHelper();
          this.updateStatus();
        } else if (action === 'focus') {
          this.focusSelection();
        }
      });
    });
  }

  private renderPrefabInspector(): void {
    const prefab = PREFABS.find((entry) => entry.key === this.activePrefab);
    if (!prefab) {
      this.renderEmptyInspector();
      return;
    }
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="panel-section">
          <div class="panel-title">Prefab <span class="spacer"></span><span>${prefab.size[0]}×${prefab.size[1]}×${prefab.size[2]}</span></div>
          <div class="prop-static" style="margin-bottom:8px">
            <div class="prefab-art" style="width:44px;height:44px;font-size:24px">${prefab.glyph}</div>
            <div>
              <div class="entity-name">${escapeHtml(prefab.name)}</div>
              <div class="entity-type">${escapeHtml(prefab.key)}</div>
            </div>
          </div>
          <p class="muted" style="font-size:11px;line-height:1.6;margin:0 0 10px">${escapeHtml(prefab.description)}</p>
          <div class="studio-filter-row">
            ${prefab.tags.map((tag) => `<span class="studio-chip" style="cursor:default">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">Placement</div>
          <div class="muted tiny" style="line-height:1.6;margin-bottom:8px">Click anywhere in the viewport to stamp at that location, or stamp at the camera focus.</div>
          <button class="btn primary small wide" data-prefab-action="focus-stamp">Stamp at view center</button>
        </div>
      </div>
    `;
    this.rightContent.querySelector<HTMLElement>('[data-prefab-action="focus-stamp"]')?.addEventListener('click', () => this.placeActiveAtFocus());
  }

  private renderPlacementInspector(): void {
    const entry = this.activeAssetEntry();
    const imported = this.game.studioAssets.find((asset) => asset.key === this.activeAssetKey);
    const name = entry?.name ?? imported?.name ?? 'Asset';
    const kind = entry?.kind ?? 'prop';
    const size = entry?.size ?? [1, 1.8, 1];
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="panel-section">
          <div class="panel-title">Placement <span class="spacer"></span><span>${kind}</span></div>
          <div class="prop-static" style="margin-bottom:8px">
            <div style="width:44px;height:44px;border:1px solid #2c414d;background:#0e181e;display:flex;align-items:center;justify-content:center">
              ${entry ? (assetThumbnailer().cached(entry.key) ? `<img src="${assetThumbnailer().cached(entry.key)}" alt="" style="width:40px;height:40px;object-fit:contain">` : `<span style="font-size:24px">${assetGlyph(entry)}</span>`) : '<span style="font-size:22px">⬡</span>'}
            </div>
            <div style="min-width:0">
              <div class="entity-name">${escapeHtml(name)}</div>
              <div class="entity-type">${kind === 'prop' ? 'scene prop' : 'entity'}</div>
            </div>
          </div>
          ${entry ? `<p class="muted" style="font-size:11px;line-height:1.6;margin:0 0 8px">${escapeHtml(entry.description)}</p>` : ''}
          <div class="studio-stat-grid">
            <div class="studio-stat"><b>${size[0]}×${size[1]}×${size[2]}</b><span>footprint</span></div>
            <div class="studio-stat"><b>${this.tool === 'entity' ? 'AI' : 'Static'}</b><span>type</span></div>
          </div>
          <button class="btn primary small wide" style="margin-top:9px" data-placement-action="focus-place">Place at view center</button>
        </div>
        <div class="panel-section">
          <div class="panel-title">Placement controls</div>
          <div class="muted tiny" style="line-height:1.7">
            Click the ground to place. <b>RMB</b> orbits the camera, the wheel zooms and <b>Shift+RMB</b> pans.
            <br><br>Imported .bbmodel files become props. Characters and creatures become living entities with their own AI, health and dialogue.
          </div>
        </div>
      </div>
    `;
    this.rightContent.querySelector<HTMLElement>('[data-placement-action="focus-place"]')?.addEventListener('click', () => this.placeActiveAtFocus());
  }

  private renderEmptyInspector(): void {
    const props = this.game.studioProps.length;
    const entities = this.game.entities?.entities.length ?? 0;
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="empty-selection" style="padding-top:18px">
          <span class="glyph">⌖</span>
          Click a prop, creature or block to inspect it.<br>
          Pick a tool above and start building.
        </div>
        <div class="panel-section">
          <div class="panel-title">Scene</div>
          <div class="studio-stat-grid">
            <div class="studio-stat"><b>${props}</b><span>studio props</span></div>
            <div class="studio-stat"><b>${entities}</b><span>entities</span></div>
            <div class="studio-stat"><b>${this.game.world.chunks.size}</b><span>chunks</span></div>
            <div class="studio-stat"><b>${this.game.world.editCount}</b><span>edits</span></div>
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">Shortcuts</div>
          <div class="muted tiny" style="line-height:1.9">
            <b>1–7</b> tools · <b>F</b> focus · <b>Del</b> delete<br>
            <b>Ctrl+Z / Ctrl+Y</b> undo / redo<br>
            <b>Ctrl+S</b> save · <b>Ctrl+E</b> export<br>
            <b>RMB</b> orbit · <b>Wheel</b> zoom · <b>Shift+RMB</b> pan
          </div>
        </div>
        <div class="panel-section">
          <div class="panel-title">World</div>
          <div class="prop-static" style="justify-content:space-between"><span>${escapeHtml(this.game.template.name)}</span><span class="pill blue">${this.game.baseY}</span></div>
          <div class="muted tiny" style="margin-top:6px">Seed ${this.game.seed} · Day ${this.game.dayCount}</div>
        </div>
      </div>
    `;
  }

  private renderScene(): void {
    const filter = this.sceneFilter;
    const props = filter === 'entities' ? [] : this.game.studioProps;
    const entities = filter === 'props' ? [] : (this.game.entities?.entities.filter((entity) => entity.alive) ?? []);
    this.rightContent.innerHTML = `
      <div class="inspector">
        <div class="studio-filter-row" style="margin-bottom:8px">
          <button class="studio-chip ${filter === 'all' ? 'active' : ''}" data-scene-filter="all">All</button>
          <button class="studio-chip ${filter === 'props' ? 'active' : ''}" data-scene-filter="props">Props</button>
          <button class="studio-chip ${filter === 'entities' ? 'active' : ''}" data-scene-filter="entities">Entities</button>
        </div>
        ${filter !== 'entities' ? `
          <div class="panel-section">
            <div class="panel-title">Studio props <span class="spacer"></span><span>${props.length}</span></div>
            <div class="entity-list">
              ${props.length ? props.map((prop) => `
                <div class="entity-row ${this.selectedProp === prop ? 'selected' : ''}" data-scene-prop="${escapeHtml(prop.id)}" role="button" tabindex="0">
                  <span class="entity-dot prop"></span>
                  <span class="entity-name">${escapeHtml(prop.name)}</span>
                  <span class="entity-type">${prop.assetKey ? 'prop' : 'import'}</span>
                  <button class="eye" data-scene-focus-prop="${escapeHtml(prop.id)}" title="Focus">◎</button>
                  <button class="eye" data-scene-delete-prop="${escapeHtml(prop.id)}" title="Delete">✕</button>
                </div>`).join('') : '<div class="empty-selection" style="padding:14px;font-size:9.5px">No studio props yet.</div>'}
            </div>
          </div>` : ''}
        ${filter !== 'props' ? `
          <div class="panel-section">
            <div class="panel-title">Entities <span class="spacer"></span><span>${entities.length}</span></div>
            <div class="entity-list">
              ${entities.length ? entities.map((entity) => `
                <div class="entity-row ${this.selectedEntity === entity ? 'selected' : ''}" data-scene-entity="${escapeHtml(entity.id)}" role="button" tabindex="0">
                  <span class="entity-dot ${entity.isHostile ? 'hostile' : entity.isNpc ? 'npc' : ''}"></span>
                  <span class="entity-name">${escapeHtml(entity.displayName)}</span>
                  <span class="entity-type">${entity.isHostile ? 'hostile' : entity.isNpc ? 'npc' : 'creature'}</span>
                  <button class="eye" data-scene-focus-entity="${escapeHtml(entity.id)}" title="Focus">◎</button>
                  <button class="eye" data-scene-delete-entity="${escapeHtml(entity.id)}" title="Delete">✕</button>
                </div>`).join('') : '<div class="empty-selection" style="padding:14px;font-size:9.5px">No living entities.</div>'}
            </div>
          </div>` : ''}
        <div class="panel-section">
          <div class="muted tiny" style="line-height:1.6">Deleting entities and props is undoable with Ctrl+Z. The list updates as the scene changes.</div>
        </div>
      </div>
    `;
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        this.sceneFilter = (button.dataset.sceneFilter as typeof this.sceneFilter) ?? 'all';
        this.renderScene();
      });
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-prop]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        const prop = this.game.studioProps.find((entry) => entry.id === row.dataset.sceneProp);
        if (!prop) return;
        this.selectedProp = prop;
        this.selectedEntity = null;
        this.selectedBlock = null;
        this.rightTab = 'inspector';
        this.renderRight();
        this.updateSelectionHelper();
        this.focusSelection();
      });
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-entity]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        const entity = this.game.entities?.entities.find((entry) => entry.id === row.dataset.sceneEntity);
        if (!entity) return;
        this.selectedEntity = entity;
        this.selectedProp = null;
        this.selectedBlock = null;
        this.rightTab = 'inspector';
        this.renderRight();
        this.updateSelectionHelper();
        this.focusSelection();
      });
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-focus-prop]').forEach((button) => {
      button.addEventListener('click', () => {
        const prop = this.game.studioProps.find((entry) => entry.id === button.dataset.sceneFocusProp);
        if (!prop) return;
        this.selectedProp = prop;
        this.selectedEntity = null;
        this.focusSelection();
      });
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-delete-prop]').forEach((button) => {
      button.addEventListener('click', () => {
        const prop = this.game.studioProps.find((entry) => entry.id === button.dataset.sceneDeleteProp);
        if (!prop) return;
        if (this.selectedProp === prop) this.selectedProp = null;
        this.game.studioRemoveProp(prop);
        this.renderScene();
        this.updateSelectionHelper();
        this.updateStatus();
      });
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-focus-entity]').forEach((button) => {
      button.addEventListener('click', () => {
        const entity = this.game.entities?.entities.find((entry) => entry.id === button.dataset.sceneFocusEntity);
        if (!entity) return;
        this.selectedEntity = entity;
        this.selectedProp = null;
        this.focusSelection();
      });
    });
    this.rightContent.querySelectorAll<HTMLElement>('[data-scene-delete-entity]').forEach((button) => {
      button.addEventListener('click', () => {
        const entity = this.game.entities?.entities.find((entry) => entry.id === button.dataset.sceneDeleteEntity);
        if (!entity) return;
        if (this.selectedEntity === entity) this.selectedEntity = null;
        this.game.studioRemoveEntity(entity);
        this.renderScene();
        this.updateSelectionHelper();
        this.updateStatus();
      });
    });
  }
}
