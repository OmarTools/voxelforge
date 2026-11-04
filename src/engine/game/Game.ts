import * as THREE from 'three';
import { TextureAtlas } from '../render/TextureAtlas';
import { Sky } from '../render/Sky';
import { Particles } from '../render/Particles';
import { VoxelWorld, type BlockHit, type EditRecord } from '../world/VoxelWorld';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../world/Chunk';
import { block, blockById, isSolidId } from '../world/Blocks';
import { BIOME_BY_ID } from '../world/TerrainGenerator';
import { Player } from './Player';
import { EntityManager, type GameEntity, type SpawnOptions } from '../entities/EntityManager';
import { AudioSystem } from '../core/Audio';
import { Input } from '../core/Input';
import { Inventory } from './Inventory';
import { HUD } from './HUD';
import { InventoryUI } from './InventoryUI';
import { StudioUI } from './StudioUI';
import { ScriptUI } from './ScriptUI';
import { PublishUI } from './PublishUI';
import { TouchControls } from './TouchControls';
import { type CameraMode, cameraModeLabel, isCameraMode } from './CameraModes';
import { ScriptRuntime, type ScriptHost, type ScriptPlayerSnapshot } from '../scripting/ScriptRuntime';
import { RaceSystem } from './RaceSystem';
import { PostFX } from '../render/PostFX';
import { WorldFX } from '../render/WorldFX';
import { emptyScriptProject, type ScriptProject } from '../scripting/ScriptTypes';
import { DialogueUI, Menus, loadSettings, openShop, saveSettings, type GameSettings } from './Menus';
import {
  getTemplate,
  type CheckpointSpec,
  type GameMode,
  type GameTemplate,
  type ObjectiveDef,
  type QuestDef,
  type WaveSpec,
  type WorldRules,
} from '../../content/Templates';
import { PREFAB_BY_KEY, stampPrefab, type Prefab } from '../../content/Prefabs';
import { buildAssetModel, getAsset } from '../../content/Models';
import { loadBlockbenchModel } from '../blockbench/BBModelLoader';
import { ITEM_BY_KEY, itemOrNull, type Station } from '../../content/Recipes';
import { entityDef, HOSTILE_KEYS } from '../../content/EntityTypes';
import { clamp, downloadFile, readFileAsText, uuid } from '../core/Utils';

export type StudioTool = 'select' | 'paint' | 'erase' | 'prefab' | 'prop' | 'entity' | 'pan';

export interface GameStats {
  kills: number;
  blocksMined: number;
  blocksPlaced: number;
  deaths: number;
  damageDealt: number;
  distance: number;
  playTime: number;
}

export interface ObjectiveState {
  def: ObjectiveDef;
  progress: number;
  done: boolean;
}

export interface EntitySaveData {
  key: string;
  position: [number, number, number];
  yaw: number;
  id: string;
  displayName: string;
  role: string;
  dialogue?: string;
  questId?: string;
  behavior?: SpawnOptions['behavior'];
  boss?: boolean;
  health: number;
}

export interface StudioPropSave {
  id: string;
  name: string;
  assetKey?: string;
  source?: unknown;
  position: [number, number, number];
  rotation: number;
  scale: number;
}

export interface StudioAssetSave {
  key: string;
  name: string;
  source: unknown;
}

export interface StudioProp {
  id: string;
  name: string;
  assetKey?: string;
  source?: unknown;
  object: THREE.Group;
}

export interface StudioAsset {
  key: string;
  name: string;
  source: unknown;
}

interface QuestState {
  active: boolean;
  complete: boolean;
  turnedIn: boolean;
  objectives: ObjectiveState[];
}

interface WaveRuntime {
  index: number;
  cleared: number;
  timer: number;
  active: boolean;
  entities: GameEntity[];
}

interface ObjectiveCounters {
  kills: Record<string, number>;
  crafts: Record<string, number>;
  places: Record<string, number>;
  talks: Record<string, number>;
}

export interface GameSaveData {
  version: number;
  templateKey: GameMode;
  templateName: string;
  seed: number;
  baseY: number;
  rules: WorldRules;
  edits: EditRecord[];
  entities: EntitySaveData[];
  player: {
    position: [number, number, number];
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
    air: number;
    xp: number;
    level: number;
    coins: number;
    flying: boolean;
    inventory: ReturnType<Inventory['serialize']>;
  };
  skyTime: number;
  dayCount: number;
  stats: GameStats;
  objectives: Record<string, { progress: number; done: boolean }>;
  counters: ObjectiveCounters;
  quests: Record<string, { active: boolean; complete: boolean; turnedIn: boolean; objectives: Record<string, number> }>;
  waves: { index: number; cleared: number; timer: number; active: boolean };
  checkpointIndex: number;
  respawn: [number, number, number] | null;
  studio: { props: StudioPropSave[]; assets: StudioAssetSave[] };
  scripts?: ScriptProject;
  cameraMode?: CameraMode;
  vehicle?: { enabled: boolean; style: 'kart' | 'car' };
  victoryShown: boolean;
  savedAt: number;
  projectName?: string;
}

interface BlockChange {
  x: number;
  y: number;
  z: number;
  before: number;
  after: number;
}

interface StudioCommand {
  label: string;
  undo: () => void;
  redo: () => void;
}

const SAVE_KEY = 'voxelforge.save.latest';
const PROJECT_PREFIX = 'voxelforge.project.';
const GRAVITY_PLAYER_REACH = 6;

const DIFFICULTY_SCALE: Record<string, number> = {
  peaceful: 0.55,
  easy: 0.8,
  normal: 1,
  hard: 1.2,
  nightmare: 1.45,
};

export function readLatestSave(): GameSaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameSaveData;
    if (!data || typeof data !== 'object' || !data.templateKey) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasLatestSave(): boolean {
  return readLatestSave() !== null;
}

/**
 * Central runtime. Owns the persistent renderer, atlas, audio, input and sky,
 * and swaps complete world sessions in and out on top of them. Every template,
 * save file and studio project is driven through this class.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly atlas: TextureAtlas;
  readonly audio: AudioSystem;
  readonly input: Input;
  readonly particles: Particles;
  readonly sky: Sky;
  readonly postfx: PostFX;
  worldFx: WorldFX | null = null;
  readonly menus: Menus;
  readonly root: HTMLElement;

  world!: VoxelWorld;
  player!: Player;
  entities!: EntityManager;
  template: GameTemplate = getTemplate('creative');
  mode: GameMode = 'creative';
  settings: GameSettings;
  stats: GameStats = { kills: 0, blocksMined: 0, blocksPlaced: 0, deaths: 0, damageDealt: 0, distance: 0, playTime: 0 };
  objectives: ObjectiveState[] = [];
  dayCount = 1;
  playTime = 0;
  baseY = 32;
  seed = 0;
  projectName = 'Untitled Project';
  rules: WorldRules = { ...this.template.rules };

  uiOpen = false;
  paused = false;
  ended = false;
  started = false;
  studioOpen = false;

  hud: HUD;
  touchControls: TouchControls;
  inventoryUI: InventoryUI;
  dialogue: DialogueUI;
  studio: StudioUI;
  scriptUI: ScriptUI;
  publishUI: PublishUI;
  readonly scripts: ScriptRuntime;
  cameraMode: CameraMode = 'first';
  vehicleStyle: 'kart' | 'car' = 'kart';
  race: RaceSystem | null = null;

  studioProps: StudioProp[] = [];
  studioAssets: StudioAsset[] = [];
  readonly studioPropsGroup = new THREE.Group();

  onExitToMenu?: () => void;

  private clock = new THREE.Clock();
  private playMode: GameMode = 'creative';
  private questStates: Record<string, QuestState> = {};
  private counters: ObjectiveCounters = { kills: {}, crafts: {}, places: {}, talks: {} };
  private wave: WaveRuntime = { index: 0, cleared: 0, timer: 0, active: false, entities: [] };
  private checkpoints: Array<{ spec: CheckpointSpec; reached: boolean }> = [];
  private respawnPoint = new THREE.Vector3();
  private pendingChests = new Set<string>();
  private shopOverlay: HTMLDivElement | null = null;
  private shopOpen = false;
  private mapOverlay: HTMLDivElement | null = null;
  private victoryShown = false;
  private victoryTimer = 0;
  private raceFinishTimer = 0;
  private autosaveTimer = 0;
  private mobTimer = 24;
  private checkpointFx = 0;
  private miningTarget: BlockHit | null = null;
  private miningProgress = 0;
  private attackCooldown = 0;
  private useCooldown = 0;
  private banking = false;
  private menuTime = 0;
  private pendingStroke: { label: string; changes: BlockChange[] } | null = null;
  private undoStack: StudioCommand[] = [];
  private redoStack: StudioCommand[] = [];
  private studioAssetMap = new Map<string, StudioAsset>();

  constructor(root: HTMLElement, menus: Menus) {
    this.root = root;
    this.menus = menus;
    const canvas = (document.getElementById('game-canvas') as HTMLCanvasElement | null) ?? document.createElement('canvas');
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x0a1418, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);

    this.atlas = new TextureAtlas();
    this.audio = new AudioSystem();
    this.input = new Input(canvas);
    this.particles = new Particles();
    this.scene.add(this.particles.mesh, this.particles.sparkMesh);
    this.sky = new Sky();
    this.sky.setTime(this.template.timeOfDay);
    this.scene.add(this.sky.group, this.sky.sunLight, this.sky.hemi, this.sky.ambient);
    this.sky.applyToScene(this.scene);
    this.studioPropsGroup.name = 'studio-props';
    this.scene.add(this.studioPropsGroup);

    this.settings = loadSettings();
    this.hud = new HUD(root, this);
    this.hud.el.classList.add('hidden');
    this.touchControls = new TouchControls(root, this);
    this.inventoryUI = new InventoryUI(root, this);
    this.dialogue = new DialogueUI(root, this);
    this.studio = new StudioUI(root, this);
    this.scriptUI = new ScriptUI(root, this);
    this.publishUI = new PublishUI(root, this);
    this.scripts = new ScriptRuntime(this.scriptHost());

    this.applySettings(this.settings);
    window.addEventListener('resize', () => this.onResize());
    this.input.setLockListener((locked) => {
      if (!locked && this.started && !this.uiOpen && !this.paused && !this.ended && !this.studioOpen) {
        this.requestPause();
      }
    });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.started && !this.ended) this.saveGame(false);
    });
    this.clock.start();
    requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------- accessors

  get creativeMode(): boolean {
    return this.template.key === 'creative' || this.template.key === 'studio';
  }

  get biomeName(): string {
    if (!this.world || !this.player) return 'Overworld';
    return BIOME_BY_ID.get(this.world.getBiomeId(this.player.position.x, this.player.position.z))?.name ?? 'Overworld';
  }

  get isStudioOpen(): boolean {
    return this.studioOpen;
  }

  get cameraLabel(): string {
    return cameraModeLabel(this.cameraMode);
  }

  // --------------------------------------------------------------- scripting

  getScriptPlayer(): ScriptPlayerSnapshot {
    const player = this.player;
    if (!player) {
      return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, health: 0, hunger: 0, coins: 0, xp: 0, onGround: false, vehicle: false, camera: this.cameraMode };
    }
    return {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      hunger: player.hunger,
      coins: player.coins,
      xp: player.xp,
      onGround: player.onGround,
      vehicle: player.vehicleMode,
      camera: this.cameraMode,
    };
  }

  scriptGiveItem(item: string, count: number): void {
    if (!this.player || !ITEM_BY_KEY.has(item)) {
      this.toast(`Unknown item: ${item}`, 'warn');
      return;
    }
    const amount = Math.max(1, Math.floor(count));
    const left = this.player.inventory.add(item, amount);
    const added = amount - left;
    if (added <= 0) {
      this.toast('Your inventory is full.', 'warn');
      return;
    }
    this.player.refreshHeldItem();
    this.audio.play('pickup');
    this.scripts.emit('collect', { item, amount: added });
  }

  scriptSpawnEntity(entity: string, x: number, y: number, z: number, options: { name?: string; behavior?: string } = {}): boolean {
    if (!this.entities || !entityDef(entity)) {
      this.toast(`Unknown entity: ${entity}`, 'warn');
      return false;
    }
    const def = entityDef(entity)!;
    const exactY = !!def.flying || y > this.baseY + 1.4;
    const spawned = this.entities.spawn(entity, new THREE.Vector3(x, y, z), {
      name: options.name,
      behavior: options.behavior as SpawnOptions['behavior'],
      exactY,
    });
    return !!spawned;
  }

  scriptSetCamera(mode: CameraMode): void {
    this.setCameraMode(mode, false);
  }

  scriptSetVehicle(enabled: boolean, style: 'kart' | 'car' = this.vehicleStyle): void {
    if (!this.player) return;
    this.setVehicleMode(Boolean(enabled), style === 'car' ? 'car' : 'kart');
  }

  scriptSetTime(hour: number): void {
    if (!this.sky) return;
    this.sky.setTime(clamp(Number(hour) || 0, 0, 23.99));
    this.sky.update(0, this.camera.position);
  }

  scriptSetWeather(weather: 'clear' | 'rain' | 'snow' | 'ash'): void {
    if (!this.sky) return;
    if (!['clear', 'rain', 'snow', 'ash'].includes(weather)) return;
    this.sky.setWeather(weather);
  }

  scriptWin(message: string): void {
    if (!this.started || this.ended) return;
    this.endGame(true, 'Victory', message || 'Victory!');
  }

  scriptLose(message: string): void {
    if (!this.started || this.ended) return;
    this.endGame(false, 'Game Over', message || 'Game over');
  }

  scriptTeleport(x: number, y: number, z: number): void {
    if (!this.player) return;
    this.player.teleport(new THREE.Vector3(Number(x) || 0, Number(y) || 0, Number(z) || 0));
    this.player.velocity.set(0, 0, 0);
  }

  scriptPlaySound(name: string): void {
    this.audio.play(name as Parameters<AudioSystem['play']>[0]);
  }

  scriptApplyEffect(effect: string, amount: number): void {
    if (!this.player) return;
    const value = Math.max(0, Number(amount) || 0);
    switch (effect) {
      case 'heal':
        this.player.heal(value);
        this.toast(`+${value} health`, 'good');
        break;
      case 'damage':
        this.player.damage(value, 'A script');
        break;
      case 'feed':
        this.player.feed(value);
        break;
      case 'xp':
        this.player.addXp(value);
        break;
      case 'coins':
        this.player.addCoins(value);
        break;
      case 'speed':
        this.player.walkSpeed = clamp(4.35 + value * 0.22, 2, 14);
        this.player.sprintSpeed = clamp(6.1 + value * 0.3, 3, 20);
        break;
      case 'jump':
        this.player.velocity.y = Math.max(this.player.velocity.y, value * 0.7);
        break;
      case 'god':
        this.player.godMode = !this.player.godMode;
        this.toast(this.player.godMode ? 'God mode enabled.' : 'God mode disabled.', 'info');
        break;
      default:
        break;
    }
  }

  scriptSetObjective(id: string, progress: number): void {
    const objective = this.objectives.find((entry) => entry.def.id === id);
    if (!objective) {
      this.toast(`Unknown objective: ${id}`, 'warn');
      return;
    }
    objective.progress = Math.max(objective.progress, Number(progress) || 0);
    objective.done = objective.progress >= objective.def.count;
    if (objective.done) {
      this.toast(`Objective complete: ${objective.def.title}`, 'good');
      this.audio.play('quest');
    }
  }

  scriptSetRule(rule: string, value: boolean): void {
    if (!(rule in this.rules)) return;
    (this.rules as unknown as Record<string, boolean>)[rule] = value;
    this.applyRules();
  }

  scriptBoost(amount: number): void {
    if (!this.player) return;
    const value = clamp(Number(amount) || 0, 0, 80);
    if (this.player.vehicleMode) {
      this.player.vehicleSpeed = Math.min(46, this.player.vehicleSpeed + value);
    } else {
      const forward = this.player.forward;
      this.player.velocity.addScaledVector(forward, value * 0.6);
    }
  }

  scriptInventoryCount(item: string): number {
    if (!this.player) return 0;
    if (item === 'coin') return this.player.coins + this.player.inventory.count('coin');
    return this.player.inventory.count(item);
  }

  scriptNearestEntityDistance(entity?: string): number {
    if (!this.player || !this.entities) return Infinity;
    let nearest = Infinity;
    const wanted = (entity ?? '').toLowerCase();
    for (const candidate of this.entities.entities) {
      if (!candidate.alive) continue;
      if (wanted && !candidate.def.key.toLowerCase().includes(wanted)) continue;
      nearest = Math.min(nearest, candidate.position.distanceTo(this.player.position));
    }
    return nearest;
  }

  scriptTime(): number {
    return this.sky?.time ?? 0;
  }

  scriptScore(): number {
    if (!this.player) return 0;
    return this.stats.kills * 10 + this.player.coins + this.player.xp + this.player.level * 20;
  }

  private scriptHost(): ScriptHost {
    return {
      toast: (message, kind) => this.toast(message, kind),
      getScriptPlayer: () => this.getScriptPlayer(),
      scriptGiveItem: (item, count) => this.scriptGiveItem(item, count),
      scriptSpawnEntity: (entity, x, y, z, options) => this.scriptSpawnEntity(entity, x, y, z, options),
      scriptSetCamera: (mode) => this.scriptSetCamera(mode),
      scriptSetVehicle: (enabled, style) => this.scriptSetVehicle(enabled, style),
      scriptSetTime: (hour) => this.scriptSetTime(hour),
      scriptSetWeather: (weather) => this.scriptSetWeather(weather),
      scriptWin: (message) => this.scriptWin(message),
      scriptLose: (message) => this.scriptLose(message),
      scriptTeleport: (x, y, z) => this.scriptTeleport(x, y, z),
      scriptPlaySound: (name) => this.scriptPlaySound(name),
      scriptApplyEffect: (effect, amount) => this.scriptApplyEffect(effect, amount),
      scriptSetObjective: (id, progress) => this.scriptSetObjective(id, progress),
      scriptSetRule: (rule, value) => this.scriptSetRule(rule, value),
      scriptBoost: (amount) => this.scriptBoost(amount),
      scriptInventoryCount: (item) => this.scriptInventoryCount(item),
      scriptNearestEntityDistance: (entity) => this.scriptNearestEntityDistance(entity),
      scriptTime: () => this.scriptTime(),
      scriptScore: () => this.scriptScore(),
    };
  }

  // ------------------------------------------------------------------- launch

  async launch(template: GameTemplate, save?: GameSaveData): Promise<void> {
    this.audio.unlock();
    this.menus.hideMain();
    this.menus.hideEnd();
    this.menus.hidePause();
    this.menus.showLoading(template.name, template.subtitle);
    try {
      await this.start(template, save, (fraction, label, detail) => this.menus.setLoading(fraction, label, detail));
    } catch (error) {
      console.error(error);
      this.menus.hideLoading();
      this.endSession();
      this.toast('The world failed to generate. Check the console for details.', 'bad');
      this.onExitToMenu?.();
      return;
    }
    this.menus.hideLoading();
    this.hud.el.classList.remove('hidden');
    this.started = true;
    this.stats.playTime = this.stats.playTime || 0;
    this.scripts.start();
    this.input.requestLock();
    this.toast(
      this.input.touchMode
        ? `${template.name} ready. Stick to move, drag to look.`
        : `${template.name} ready. Click to capture the mouse.`,
      'good',
    );
    if (template.showStudioOnStart) this.openStudio();
  }

  async continueLatest(): Promise<void> {
    const save = readLatestSave();
    if (!save) {
      this.toast('No saved world found.', 'warn');
      return;
    }
    const template = getTemplate(save.templateKey);
    await this.launch(template, save);
  }

  restart(): void {
    const template = this.template;
    void this.launch(template);
  }

  returnToMenu(): void {
    this.saveGame(false);
    this.endSession();
    this.onExitToMenu?.();
  }

  // -------------------------------------------------------------- world setup

  /** Build a complete playable session from a template and optional save. */
  async start(template: GameTemplate, save?: GameSaveData, progress?: (fraction: number, label: string, detail?: string) => void): Promise<void> {
    this.endSession();
    this.template = template;
    this.playMode = template.key === 'studio' ? 'creative' : template.key;
    this.mode = this.playMode;
    this.rules = { ...template.rules, ...(save?.rules ?? {}) };
    this.seed = save?.seed ?? Math.floor(Math.random() * 1_000_000_000);
    this.projectName = save?.projectName ?? template.name;
    this.dayCount = save?.dayCount ?? 1;
    this.stats = save?.stats ? { ...save.stats } : { kills: 0, blocksMined: 0, blocksPlaced: 0, deaths: 0, damageDealt: 0, distance: 0, playTime: 0 };
    this.stats.playTime = this.stats.playTime || 0;
    this.playTime = this.stats.playTime;
    this.victoryShown = save?.victoryShown ?? false;
    this.victoryTimer = 0;
    this.autosaveTimer = 0;
    this.mobTimer = 24;
    this.checkpointFx = 0;
    this.miningTarget = null;
    this.miningProgress = 0;
    this.attackCooldown = 0;
    this.useCooldown = 0;
    this.pendingChests.clear();
    this.pendingStroke = null;
    this.undoStack = [];
    this.redoStack = [];
    this.checkpoints = [];
    this.respawnPoint.set(template.spawn[0] + 0.5, 40, template.spawn[1] + 0.5);

    const report = (fraction: number, label: string, detail?: string) => progress?.(fraction, label, detail);
    report(0.02, 'Reading the forge', 'Preparing session');

    // Fresh HUD for the new template.
    this.hud.el.remove();
    this.hud = new HUD(this.root, this);
    this.hud.el.classList.add('hidden');

    const spawnX = template.spawn[0];
    const spawnZ = template.spawn[1];
    this.world = new VoxelWorld(this.atlas, this.seed, template.preset);
    this.world.setRenderDistance(this.settings.renderDistance);
    this.scene.add(this.world.group);

    // Determine the session's base surface height.
    if (save?.baseY) {
      this.baseY = save.baseY;
    } else if (template.heightMode === 'sky') {
      this.baseY = template.skyBase ?? 49;
    } else {
      this.world.ensureArea(spawnX - 2, spawnZ - 2, spawnX + 2, spawnZ + 2, false);
      const feet = this.world.findSpawnY(spawnX, spawnZ);
      this.baseY = clamp(feet > 1 ? feet - 1 : 32, 30, 44);
    }
    report(0.08, 'Shaping the horizon', 'Biomes and terrain');

    // Work out how much of the world must exist before we can stamp structures.
    const radius = template.platform?.radius ?? 12;
    let minX = spawnX - radius - 4;
    let maxX = spawnX + radius + 4;
    let minZ = spawnZ - radius - 4;
    let maxZ = spawnZ + radius + 4;
    for (const placement of template.prefabs) {
      const prefab = PREFAB_BY_KEY.get(placement.prefab);
      const size = prefab?.size ?? [10, 10, 10];
      minX = Math.min(minX, placement.x - size[0] / 2 - 3);
      maxX = Math.max(maxX, placement.x + size[0] / 2 + 3);
      minZ = Math.min(minZ, placement.z - size[2] / 2 - 3);
      maxZ = Math.max(maxZ, placement.z + size[2] / 2 + 3);
    }
    this.world.ensureArea(minX, minZ, maxX, maxZ, false);

    this.carvePlatform(template);
    report(0.22, 'Laying foundations', template.platform ? 'Carving the build platform' : 'Opening the sky');
    await frame();

    this.stampTemplatePrefabs(template);
    report(0.38, 'Raising structures', `${template.prefabs.length} prefabs placed`);
    await frame();

    if (save?.edits?.length) this.world.loadEdits(save.edits);
    report(0.46, 'Restoring your changes', `${save?.edits?.length ?? 0} recorded edits`);

    // Pre-mesh the area around spawn so the first frame looks complete.
    await this.preloadChunks(spawnX, spawnZ, Math.min(3, this.settings.renderDistance), report);

    // Player.
    const inventory = new Inventory();
    this.player = new Player(this.camera, this.world, this.atlas, this.audio, inventory);
    this.scene.add(this.player.group, this.player.camera);
    this.player.hooks = {
      onDamage: (amount, source) => {
        this.hud.flashDamage();
        this.scripts?.emit('damage', { amount, source });
      },
      onDeath: (source) => this.handleDeath(source),
      onNotify: (message, kind) => this.toast(message, kind),
      onStep: () => undefined,
    };
    inventory.onChange = () => {
      this.player.refreshHeldItem();
      if (!this.banking) this.bankCoins();
    };

    const spawnY = Math.max(this.baseY + 1, this.world.getNearestGround(spawnX, spawnZ, this.baseY + 8)) + (template.spawnYOffset ?? 0);
    this.respawnPoint.set(spawnX + 0.5, spawnY + 0.02, spawnZ + 0.5);
    this.player.spawnAt(this.respawnPoint.clone(), template.spawnYaw ?? 0);

    if (save?.player) {
      const p = save.player;
      this.player.spawnAt(new THREE.Vector3(p.position[0], p.position[1], p.position[2]), p.yaw);
      this.player.pitch = p.pitch;
      this.player.health = p.health;
      this.player.hunger = p.hunger;
      this.player.air = p.air;
      this.player.xp = p.xp;
      this.player.level = p.level;
      this.player.coins = p.coins;
      this.player.flying = p.flying && this.rules.allowFlight;
      inventory.load(p.inventory);
    } else {
      this.giveStartingGear(template);
    }
    this.player.baseFov = this.settings.fov;
    this.applyRules();
    if (!save) this.bankCoins();

    // Entities.
    this.entities = new EntityManager(this.world, this.particles, this.audio, this.atlas);
    this.entities.group.name = 'entities';
    this.entities.player = this.player;
    this.entities.setPlayer(this.player);
    this.entities.difficultyScale = DIFFICULTY_SCALE[template.difficulty] ?? 1;
    this.entities.hooks = {
      onNotify: (message, kind) => this.toast(message, kind),
      onKill: (entity, byPlayer) => this.onEntityKilled(entity, byPlayer),
      onBoss: (entity) => {
        if (entity) this.toast(`${entity.displayName} has awakened.`, 'bad');
      },
      onBossHealth: () => undefined,
      onExplosion: () => this.hud.flashDamage(),
      onDamagePlayer: () => this.hud.flashDamage(),
      onPickup: (item, count) => this.scripts?.emit('collect', { item, amount: count }),
    };
    this.scene.add(this.entities.group);

    if (save && Array.isArray(save.entities) && save.entities.length > 0) {
      for (const data of save.entities) this.spawnSavedEntity(data);
    } else {
      this.spawnTemplateEntities(template);
    }
    report(0.74, 'Waking the inhabitants', `${this.entities.entities.length} entities spawned`);

    // Checkpoints + quests + objectives.
    this.checkpoints = template.checkpoints.map((spec, index) => ({
      spec,
      reached: save ? index <= save.checkpointIndex : false,
    }));
    this.respawnPoint.set(spawnX + 0.5, spawnY + 0.02, spawnZ + 0.5);
    if (save) {
      for (let i = 0; i <= save.checkpointIndex && i < this.checkpoints.length; i++) {
        const cp = this.checkpoints[i];
        const cpPos = new THREE.Vector3(cp.spec.offset[0] + 0.5, this.baseY + cp.spec.offset[1], cp.spec.offset[2] + 0.5);
        this.respawnPoint.copy(cpPos);
      }
    }
    this.setupObjectives(save);
    this.setupQuests(save);

    this.counters = save?.counters
      ? {
          kills: { ...save.counters.kills },
          crafts: { ...save.counters.crafts },
          places: { ...save.counters.places },
          talks: { ...save.counters.talks },
        }
      : { kills: {}, crafts: {}, places: {}, talks: {} };

    this.wave = {
      index: save?.waves.index ?? 0,
      cleared: save?.waves.cleared ?? 0,
      timer: save?.waves.timer ?? (template.waves.length > 0 ? 3 : 0),
      active: false,
      entities: [],
    };
    if (save?.waves.active) this.wave.active = true;

    // Sky, weather and rules.
    this.sky.setTime(save?.skyTime ?? template.timeOfDay);
    this.sky.setWeather(template.weather ?? 'clear');
    this.sky.setMood(template.key === 'horror' ? 'horror' : 'normal');
    this.sky.setRenderDistance(this.settings.renderDistance);
    this.sky.dayCycle = this.rules.dayCycle;
    this.sky.update(0, this.camera.position);
    this.audio.setMood(template.music);
    this.audio.play('open');

    // Session-level scripting, camera and vehicle state.
    this.cameraMode = save?.cameraMode ?? template.cameraMode ?? 'first';
    const vehicle = save?.vehicle ?? template.vehicle;
    this.vehicleStyle = vehicle?.style === 'car' ? 'car' : 'kart';
    this.scripts.load(save?.scripts ?? template.scripts ?? emptyScriptProject());

    // Studio data.
    this.studioPropsGroup.clear();
    this.studioProps = [];
    this.studioAssets = [];
    this.studioAssetMap.clear();
    if (save?.studio) this.loadStudioData(save.studio);
    this.studio.refresh();

    this.paused = false;
    this.ended = false;
    this.uiOpen = false;
    this.studioOpen = false;
    this.mode = this.playMode;
    this.dayCount = Math.max(1, this.dayCount);

    this.player.setCameraMode(this.cameraMode);
    if (vehicle?.enabled) this.setVehicleMode(true, this.vehicleStyle, false);
    else this.setVehicleMode(false, this.vehicleStyle, false);
    this.player.setCameraMode(this.cameraMode);

    this.world.update(spawnX, spawnZ, 0);
    report(0.92, 'Warming the renderer', 'Building chunk meshes');
    await frame();
    this.worldFx?.dispose();
    this.worldFx = null;
    const preset = template.fx?.post
      ?? (template.key === 'racing' ? 'racing' : template.key === 'city' ? 'neon' : template.key === 'horror' ? 'horror' : 'default');
    this.postfx.setPreset(preset);
    if (template.fx) {
      this.worldFx = new WorldFX(this.scene, template.fx, this.baseY);
    }
    this.raceFinishTimer = 0;
    if (template.race) {
      const config = template.race;
      this.race = new RaceSystem(
        this.scene,
        this.player,
        this.audio,
        {
          laps: config.laps,
          rx: config.rx,
          rz: config.rz,
          startAngle: config.startAngle ?? Math.PI + 0.25,
          gateRadius: config.gateRadius ?? 6.2,
          baseY: this.baseY,
        },
        {
          banner: (kicker, big, sub, duration) => this.hud.showWaveBanner(kicker, big, sub, duration),
          toast: (message, kind) => this.toast(message, kind),
          onFinish: () => {
            this.raceFinishTimer = 5.2;
          },
        },
      );
    }
    this.hud.setInteractHint(null);
    this.hud.setBreakProgress(0);
    report(1, 'Ready', template.name);
  }

  private async preloadChunks(
    x: number,
    z: number,
    radius: number,
    report: (f: number, label: string, detail?: string) => void,
  ): Promise<void> {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const jobs: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        jobs.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
      }
    }
    jobs.sort((a, b) => a.d - b.d);
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      this.world.generateChunkNow(job.cx, job.cz);
      this.world.meshChunkNow(job.cx, job.cz);
      if (i % 8 === 0) {
        report(0.5 + (i / jobs.length) * 0.4, 'Forging terrain', `Chunk ${i + 1} / ${jobs.length}`);
        await frame();
      }
    }
  }

  private carvePlatform(template: GameTemplate): void {
    const world = this.world;
    const baseY = this.baseY;
    if (template.heightMode === 'sky' && !template.platform) {
      // Clear the spawn column so the authored island sits in open sky.
      for (let z = -9; z <= 9; z++) {
        for (let x = -9; x <= 9; x++) {
          if (x * x + z * z > 86) continue;
          for (let y = baseY + 1; y < WORLD_HEIGHT; y++) world.setBlockNoRecord(x, y, z, 0);
        }
      }
      return;
    }
    const platform = template.platform;
    if (!platform) return;
    const r = platform.radius;
    const surface = block(platform.surface).id;
    const border = platform.border ? block(platform.border).id : surface;
    const filler = block('dirt').id;
    const stone = block('stone').id;
    const clearHeight = platform.clearHeight ?? 22;
    for (let z = -r - 1; z <= r + 1; z++) {
      for (let x = -r - 1; x <= r + 1; x++) {
        const dist = Math.hypot(x, z);
        if (dist <= r + 1) {
          for (let y = baseY + 1; y <= baseY + clearHeight + 4; y++) world.setBlockNoRecord(x, y, z, 0);
        }
        if (dist > r) continue;
        const top = dist > r - 1.1 && platform.border ? border : surface;
        world.setBlockNoRecord(x, baseY, z, top);
        world.setBlockNoRecord(x, baseY - 1, z, filler);
        world.setBlockNoRecord(x, baseY - 2, z, filler);
        world.setBlockNoRecord(x, baseY - 3, z, stone);
        world.setBlockNoRecord(x, baseY - 4, z, stone);
        if (template.heightMode === 'sky') {
          // Carve a floating lens beneath the rim.
          const depth = dist > r - 2 ? 2 : 4;
          for (let y = baseY - 5; y > baseY - 5 - depth; y--) {
            if (dist > (r - 2) * (1 - (baseY - 5 - y) * 0.12)) continue;
            world.setBlockNoRecord(x, y, z, stone);
          }
        }
      }
    }
  }

  private stampTemplatePrefabs(template: GameTemplate): void {
    for (const placement of template.prefabs) {
      const prefab = PREFAB_BY_KEY.get(placement.prefab);
      if (!prefab) continue;
      const y = this.baseY + (placement.y ?? 0);
      // Make sure the prefab footprint exists before stamping.
      this.world.ensureArea(
        placement.x - prefab.size[0] / 2 - 1,
        placement.z - prefab.size[2] / 2 - 1,
        placement.x + prefab.size[0] / 2 + 1,
        placement.z + prefab.size[2] / 2 + 1,
        false,
      );
      stampPrefab(this.world, placement.prefab, placement.x, y, placement.z, false);
    }
  }

  private spawnTemplateEntities(template: GameTemplate): void {
    for (const spec of template.spawns) {
      const def = entityDef(spec.entity);
      if (!def) continue;
      const count = Math.max(1, spec.count ?? 1);
      const spread = spec.spread ?? 0;
      for (let i = 0; i < count; i++) {
        const ox = spec.offset[0] + (i === 0 ? 0 : (Math.random() * 2 - 1) * spread);
        const oz = spec.offset[2] + (i === 0 ? 0 : (Math.random() * 2 - 1) * spread);
        const pos = new THREE.Vector3(ox + 0.5, this.baseY + 1 + spec.offset[1], oz + 0.5);
        const exact = !!def.flying || !!def.aquatic || spec.offset[1] > 0.4;
        this.entities.spawn(spec.entity, pos, {
          name: i === 0 ? spec.name : undefined,
          role: spec.role,
          dialogue: spec.dialogue,
          id: i === 0 ? spec.id : undefined,
          questId: spec.questId,
          behavior: spec.behavior,
          boss: spec.boss,
          exactY: exact,
        });
      }
    }
  }

  private spawnSavedEntity(data: EntitySaveData): GameEntity | null {
    if (!data || !entityDef(data.key)) return null;
    const pos = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
    const entity = this.entities.spawn(data.key, pos, {
      id: data.id,
      name: data.displayName,
      role: data.role,
      dialogue: data.dialogue,
      questId: data.questId,
      behavior: data.behavior,
      boss: data.boss,
      exactY: true,
      yaw: data.yaw,
    });
    if (entity) entity.health = clamp(data.health, 1, entity.maxHealth);
    return entity;
  }

  private giveStartingGear(template: GameTemplate): void {
    this.fillStartingGear(this.player.inventory, template);
  }

  private fillStartingGear(inv: Inventory, template: GameTemplate): void {
    const totals = new Map<string, number>();
    for (const entry of template.startingItems) {
      totals.set(entry.item, (totals.get(entry.item) ?? 0) + entry.count);
    }
    const creative = this.creativeMode;
    if (creative && template.hotbar.length) {
      for (const key of template.hotbar) {
        if (totals.has(key)) continue;
        totals.set(key, 64);
      }
    }
    // Fill the hotbar in the template's authored order.
    const hotbar = template.hotbar.slice(0, 9);
    for (let i = 0; i < hotbar.length; i++) {
      const key = hotbar[i];
      const available = totals.get(key);
      if (!available || !ITEM_BY_KEY.has(key)) continue;
      const def = ITEM_BY_KEY.get(key)!;
      const amount = Math.min(available, def.stack);
      inv.setSlot(i, { item: key, count: amount, durability: def.durability });
      totals.set(key, available - amount);
    }
    for (const [key, count] of totals) {
      if (count <= 0 || !ITEM_BY_KEY.has(key)) continue;
      inv.add(key, count);
    }
  }

  applyRules(): void {
    const rules = this.rules;
    if (!this.player) return;
    this.player.godMode = rules.invulnerable;
    this.player.hungerEnabled = rules.hunger;
    this.player.naturalRegen = rules.naturalRegen;
    this.player.fallDamageEnabled = rules.fallDamage;
    this.player.canFly = rules.allowFlight || this.creativeMode;
    if (!this.player.canFly) this.player.flying = false;
    this.sky.dayCycle = rules.dayCycle;
    this.world.setRenderDistance(this.settings.renderDistance);
  }

  private bankCoins(): void {
    if (!this.player || this.banking) return;
    const inv = this.player.inventory;
    const coins = inv.count('coin');
    if (coins <= 0) return;
    this.banking = true;
    inv.remove('coin', coins);
    this.player.addCoins(coins);
    this.banking = false;
    this.audio.play('pickup');
  }

  // ------------------------------------------------------------------- ticking

  private onResize(): void {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.resolution);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(width, height);
  }

  private renderFrame(dt: number): void {
    const speed = this.started && this.player
      ? Math.min(1, this.template.race ? Math.abs(this.player.vehicleSpeed) / 28 : this.player.sprinting ? 0.16 : 0)
      : 0;
    this.postfx.render(dt, { speed, underwater: Boolean(this.player?.underwater) });
  }

  private tick = (): void => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.touchControls) this.touchControls.setActive(this.started);
    if (this.started) {
      if (this.studioOpen) {
        this.sky.update(dt, this.camera.position);
        this.world.update(this.camera.position.x, this.camera.position.z, dt);
        this.particles.update(dt);
        this.worldFx?.update(dt);
        this.studio.update(dt);
        this.audio.update(dt, {
          night: this.sky.isNight,
          horror: this.template.key === 'horror',
          paused: false,
          underwater: false,
        });
      } else if (!this.paused && !this.uiOpen && !this.ended && this.player?.isAlive()) {
        this.updateSession(dt);
      } else {
        this.input.endFrame();
        this.renderFrame(dt);
        return;
      }
    } else {
      this.renderMenuBackdrop(dt);
    }
    this.renderFrame(dt);
    this.input.endFrame();
  };

  private renderMenuBackdrop(dt: number): void {
    this.menuTime += dt;
    const angle = this.menuTime * 0.035;
    this.camera.position.set(Math.sin(angle) * 74, 66, Math.cos(angle) * 74);
    this.camera.lookAt(0, 38, 0);
    this.sky.setTime(7.1 + (this.menuTime * 0.002) % 0.8);
    this.sky.update(dt, this.camera.position);
  }

  private updateSession(dt: number): void {
    const player = this.player;
    const input = this.input;

    this.stats.playTime += dt;
    this.playTime = this.stats.playTime;

    const look = input.takeLook();
    if (look.dx || look.dy) {
      player.look(look.dx, look.dy * (this.settings.invertY ? -1 : 1), this.settings.sensitivity);
    }
    if (input.wheel) {
      const next = (player.inventory.active + Math.sign(input.wheel) + 9) % 9;
      player.inventory.setActive(next);
      this.audio.play('click');
    }
    for (let digit = 1; digit <= 9; digit++) {
      if (input.consume(`Digit${digit}`)) {
        player.inventory.setActive(digit - 1);
        this.audio.play('click');
      }
    }

    const before = player.position.clone();
    player.update(dt, input, { paused: this.race?.controlsLocked ?? false });
    this.stats.distance += before.distanceTo(player.position);

    if (this.race) {
      this.race.update(dt);
      if (this.raceFinishTimer > 0) {
        this.raceFinishTimer = Math.max(0, this.raceFinishTimer - dt);
        if (this.raceFinishTimer === 0 && !this.ended) {
          const state = this.race.hud();
          this.endGame(true, 'Race Complete', `P${state.finishPosition} of ${state.total} · ${this.formatRaceTime(state.finishTime)}`);
        }
      }
    }

    const previousTime = this.sky.time;
    this.sky.advance(dt);
    if (this.sky.time < previousTime - 0.0001) {
      this.dayCount += 1;
      this.toast(`Day ${this.dayCount}.`, 'info');
      this.saveGame(false);
    }
    this.sky.update(dt, this.camera.position);
    this.world.update(player.position.x, player.position.z, dt);

    this.entities.update(dt);
    this.particles.update(dt);
    this.worldFx?.update(dt);

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.useCooldown = Math.max(0, this.useCooldown - dt);
    if (input.consumeMouse(0)) {
      if (!input.locked && !input.touchMode) input.requestLock();
      else this.handlePrimaryClick();
    }
    if (input.consumeMouse(2)) {
      if (!input.locked && !input.touchMode) input.requestLock();
      else if (this.useCooldown <= 0) {
        this.useCooldown = 0.22;
        this.handleUse();
      }
    }
    if (input.mouse.left && (input.locked || input.touchMode)) this.updateMining(dt);
    else this.resetMining();

    this.updateInteractHint();
    this.updateObjectives(dt);
    this.updateQuests();
    this.updateCheckpoints(dt);
    this.updateWaves(dt);
    this.spawnAmbientMobs(dt);
    this.scripts.update(dt);

    if (this.template.fallReset && player.position.y < this.baseY - 10) {
      this.player.teleport(this.respawnPoint.clone());
      this.player.velocity.set(0, 0, 0);
      this.scripts.emit('respawn', {});
      this.toast('Back to the last checkpoint.', 'warn');
      this.audio.play('checkpoint');
    }

    if (!this.victoryShown && this.objectives.length > 0 && this.objectives.every((o) => o.done)) {
      this.victoryTimer += dt;
      if (this.victoryTimer > 2.2) this.endGame(true);
    } else {
      this.victoryTimer = 0;
    }

    this.autosaveTimer += dt;
    if (this.autosaveTimer > 90) {
      this.autosaveTimer = 0;
      this.saveGame(false);
    }

    this.audio.update(dt, {
      night: this.sky.isNight,
      horror: this.template.key === 'horror',
      paused: false,
      underwater: player.underwater,
    });
    this.hud.update(dt);
  }

  // -------------------------------------------------------------------- input

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      this.handleEscape();
      return;
    }
    if (!this.started || this.ended) return;
    if (event.repeat) return;
    this.scripts.emit('key', { key: event.code });

    if (event.code === 'KeyE' && !this.studioOpen && !this.paused && !this.dialogue.isOpen && !this.shopOpen && !this.scriptUI.isOpen && !this.publishUI.isOpen) {
      event.preventDefault();
      if (this.inventoryUI.isOpen) this.inventoryUI.close();
      else this.openInventory();
      return;
    }
    if (event.code === 'KeyB' && !this.paused && !this.shopOpen && !this.scriptUI.isOpen && !this.publishUI.isOpen) {
      event.preventDefault();
      if (this.studioOpen) this.closeStudio();
      else this.openStudio();
      return;
    }
    if (this.uiOpen || this.paused || this.studioOpen) return;

    if (event.code === 'KeyF') {
      event.preventDefault();
      this.player.toggleFly();
    } else if (event.code === 'F3') {
      event.preventDefault();
      this.hud.toggleDebug();
    } else if (event.code === 'F5') {
      event.preventDefault();
      this.cycleCameraMode();
    } else if (event.code === 'F6') {
      event.preventDefault();
      this.toggleVehicle();
    } else if (event.code === 'KeyQ') {
      event.preventDefault();
      this.dropSelected();
    } else if (event.code === 'KeyH') {
      event.preventDefault();
      this.hud.toggleHints();
    }
  }

  private handleEscape(): void {
    if (this.menus.hasModal) {
      this.menus.closeModal();
      return;
    }
    if (this.mapOverlay) {
      this.closeLargeMap();
      return;
    }
    if (this.shopOverlay) {
      this.closeShop();
      return;
    }
    if (this.dialogue.isOpen) {
      this.dialogue.close();
      return;
    }
    if (this.scriptUI?.isOpen) {
      this.closeScripts();
      return;
    }
    if (this.publishUI?.isOpen) {
      this.closePublish();
      return;
    }
    if (this.inventoryUI.isOpen) {
      this.inventoryUI.close();
      return;
    }
    if (this.studioOpen) {
      this.closeStudio();
      return;
    }
    if (this.paused) {
      this.resume();
      return;
    }
    if (this.started && !this.ended) this.requestPause();
  }

  private dropSelected(): void {
    const inv = this.player.inventory;
    const stack = inv.slots[inv.active];
    if (!stack) return;
    const removed = inv.removeAt(inv.active, 1);
    if (!removed) return;
    const dir = this.player.forward;
    const pos = this.player.eyePosition.addScaledVector(dir, 0.7);
    this.entities.spawnDrop(removed.item, 1, pos);
    this.audio.play('click');
    this.player.refreshHeldItem();
  }

  // ------------------------------------------------------------------- mining

  private resetMining(): void {
    if (this.miningTarget) {
      this.miningTarget = null;
      this.miningProgress = 0;
      this.hud.setBreakProgress(0);
      this.player?.setMining(false);
    }
  }

  private handlePrimaryClick(): void {
    const origin = this.player.eyePosition;
    const dir = this.player.forward;
    const entity = this.entities.raycast(origin, dir, 4.2);
    const hit = this.world.raycast(origin, dir, GRAVITY_PLAYER_REACH);
    if (entity && (!hit || entity.position.distanceTo(origin) <= hit.distance + 0.5)) {
      this.attackEntity(entity);
      this.resetMining();
      return;
    }
    if (hit) {
      this.miningTarget = hit;
      this.miningProgress = 0;
      this.player.setMining(true);
    }
  }

  private attackEntity(entity: GameEntity): void {
    if (this.attackCooldown > 0 || !entity.alive) return;
    this.attackCooldown = 0.4;
    const held = this.player.inventory.selectedDef;
    const damage = Math.max(1, held?.damage ?? 1);
    this.player.swing(1);
    this.player.playAction('attack');
    this.stats.damageDealt += damage;
    const died = entity.hurt(damage, this.player, 1);
    this.audio.play('hit');
    this.hud.setCrosshairActive(true);
    window.setTimeout(() => this.hud.setCrosshairActive(false), 130);
    if (died) this.stats.kills += 1;
  }

  private updateMining(dt: number): void {
    if (!this.rules.blockBreaking) {
      this.resetMining();
      return;
    }
    const origin = this.player.eyePosition;
    const dir = this.player.forward;
    const hit = this.world.raycast(origin, dir, GRAVITY_PLAYER_REACH);
    if (!hit) {
      this.resetMining();
      return;
    }
    const def = blockById(hit.id);
    if (!def || !def.breakable || def.hardness > 100) {
      this.resetMining();
      return;
    }
    if (!this.miningTarget || this.miningTarget.x !== hit.x || this.miningTarget.y !== hit.y || this.miningTarget.z !== hit.z) {
      this.miningTarget = hit;
      this.miningProgress = 0;
      this.player.setMining(true);
    }
    const held = this.player.inventory.selectedDef;
    let breakTime: number;
    if (this.creativeMode) {
      breakTime = 0.06;
    } else {
      const effective = this.toolMatches(def.sound, held?.toolType);
      const speed = effective ? this.toolSpeed(held?.tier ?? 0) : 1;
      breakTime = (def.hardness * 0.72) / speed;
      if (!effective) breakTime *= 1.6;
      breakTime = Math.max(0.12, breakTime);
    }
    this.miningProgress += dt / breakTime;
    this.hud.setBreakProgress(this.miningProgress);
    if (this.miningProgress >= 1) {
      this.breakBlock(hit);
      this.miningProgress = 0;
      this.hud.setBreakProgress(0);
      this.player.setMining(false);
      this.miningTarget = null;
    }
  }

  private toolMatches(sound: string, tool?: string): boolean {
    if (!tool) return false;
    if (tool === 'pickaxe') return sound === 'stone' || sound === 'metal' || sound === 'glass';
    if (tool === 'axe') return sound === 'wood' || sound === 'cloth';
    if (tool === 'shovel') return sound === 'dirt' || sound === 'sand' || sound === 'gravel' || sound === 'grass';
    if (tool === 'sword') return sound === 'plant' || sound === 'cloth';
    return false;
  }

  private toolSpeed(tier: number): number {
    return [1, 1.6, 2.6, 4.2, 7.2, 7.2][Math.min(5, Math.max(0, tier))];
  }

  private breakBlock(hit: BlockHit): void {
    if (!this.rules.blockBreaking) return;
    const def = blockById(hit.id);
    if (!def || !def.breakable || def.key === 'air') return;
    this.world.setBlock(hit.x, hit.y, hit.z, 0, true);
    this.stats.blocksMined += 1;
    this.particles.dust(new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5), def.mapColor, 12);
    this.audio.play('break', hit.y % 4);
    if (!this.creativeMode) {
      this.player.inventory.damageHeld(1);
      if (this.rules.dropItems !== false && !def.unlisted) {
        const dropKey = def.drop && def.drop !== 'none' ? def.drop : def.key;
        if (ITEM_BY_KEY.has(dropKey)) {
          this.entities.spawnDrop(dropKey, 1, new THREE.Vector3(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5));
        }
      }
    }
    this.player.swing(0.6);
  }

  // --------------------------------------------------------------------- use

  private handleUse(): void {
    const player = this.player;
    const held = player.inventory.selectedDef;
    const origin = player.eyePosition;
    const dir = player.forward;

    // Ranged items.
    if (held?.toolType === 'bow') {
      if (this.creativeMode || player.inventory.remove('arrow', 1)) {
        this.entities.playerShoot(origin, dir, held.damage ?? 6, 'arrow');
        player.swing(1);
        this.stats.damageDealt += held.damage ?? 6;
      } else {
        this.toast('You are out of arrows.', 'warn');
        this.audio.play('error');
      }
      return;
    }
    if (held?.toolType === 'gun') {
      if (this.creativeMode || player.inventory.remove('rifle_ammo', 1)) {
        this.entities.playerShoot(origin, dir, held.damage ?? 8, 'bullet');
        player.swing(1);
        this.particles.sparkle(origin.clone().addScaledVector(dir, 1.1), '#ffd27a', 4);
        this.stats.damageDealt += held.damage ?? 8;
      } else {
        this.toast('The rifle is empty. Find 5.56 rounds.', 'warn');
        this.audio.play('error');
      }
      return;
    }
    if (held?.toolType === 'staff') {
      this.entities.playerShoot(origin, dir, held.damage ?? 8, 'bolt');
      player.swing(1);
      this.particles.sparkle(origin.clone().addScaledVector(dir, 1), '#7be6ff', 10);
      this.stats.damageDealt += held.damage ?? 8;
      return;
    }

    // NPCs / interaction targets.
    const entity = this.entities.raycast(origin, dir, 4.5);
    if (entity) {
      if (entity.isNpc) {
        this.talkTo(entity);
        return;
      }
      if (entity.alive) {
        this.attackEntity(entity);
        return;
      }
    }

    const hit = this.world.raycast(origin, dir, GRAVITY_PLAYER_REACH);
    if (hit) {
      const def = blockById(hit.id);
      if (def.key === 'crafting_table') {
        this.openInventory('table');
        return;
      }
      if (def.key === 'furnace') {
        this.openInventory('furnace');
        return;
      }
      if (def.key === 'chest') {
        this.lootChest(hit);
        return;
      }
    }

    // Food first, then placement.
    if (held?.foodHunger) {
      if (player.hunger >= 19.5 && player.health >= player.maxHealth) {
        this.toast('You are not hungry.', 'info');
      } else {
        player.inventory.remove(held.key, 1);
        player.feed(held.foodHunger);
        player.heal(held.foodHeal ?? 0);
        this.audio.play('eat');
        this.toast(`Ate ${held.name}.`, 'good');
        player.refreshHeldItem();
      }
      return;
    }

    if (held?.block) this.placeBlock(hit, held.block);
  }

  private placeBlock(hit: BlockHit | null, blockKey: string): void {
    if (!this.rules.blockPlacing) return;
    if (!hit) return;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const target = this.world.getBlock(x, y, z);
    if (target && blockById(target).render !== 'liquid') return;
    const def = block(blockKey);
    if (!def) return;
    if (def.solid && this.playerBoxIntersects(x, y, z)) {
      this.toast('There is no room to place that here.', 'warn');
      return;
    }
    // Torches and plants need something solid underneath.
    if (def.render === 'cross' && !isSolidId(this.world.getBlock(x, y - 1, z))) return;
    if (this.world.setBlock(x, y, z, def.id, true)) {
      this.player.swing(0.5);
      this.player.inventory.remove(blockKey, 1);
      this.player.refreshHeldItem();
      this.stats.blocksPlaced += 1;
      this.recordPlace(blockKey);
      this.scripts.emit('place', { block: blockKey });
      this.audio.play('place', y % 4);
      this.particles.dust(new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5), def.mapColor, 5);
    }
  }

  private playerBoxIntersects(x: number, y: number, z: number): boolean {
    const p = this.player.position;
    const height = this.player.height;
    return (
      x + 1 > p.x - 0.3 && x < p.x + 0.3 &&
      z + 1 > p.z - 0.3 && z < p.z + 0.3 &&
      y + 1 > p.y && y < p.y + height
    );
  }

  private lootChest(hit: BlockHit): void {
    const key = `${hit.x},${hit.y},${hit.z}`;
    if (this.pendingChests.has(key)) {
      this.toast('The chest is empty.', 'info');
      return;
    }
    this.pendingChests.add(key);
    const loot = ['iron_ingot', 'bread', 'coal', 'torch', 'arrow', 'gold_ingot', 'emerald', 'cooked_beef', 'stone_pickaxe'];
    const picks = 2 + Math.floor(Math.random() * 2);
    const given: string[] = [];
    for (let i = 0; i < picks; i++) {
      const itemKey = loot[Math.floor(Math.random() * loot.length)];
      const def = itemOrNull(itemKey);
      if (!def) continue;
      const amount = def.stack > 1 ? 1 + Math.floor(Math.random() * 4) : 1;
      this.player.inventory.add(itemKey, amount);
      given.push(`${def.name} ×${amount}`);
    }
    this.audio.play('pickup');
    this.particles.sparkle(new THREE.Vector3(hit.x + 0.5, hit.y + 1, hit.z + 0.5), '#f6d98a', 14);
    this.toast(given.length ? `Found ${given.join(', ')}` : 'The chest was empty.', given.length ? 'good' : 'info');
  }

  private updateInteractHint(): void {
    const origin = this.player.eyePosition;
    const dir = this.player.forward;
    const entity = this.entities.raycast(origin, dir, 4.5);
    if (entity && entity.isNpc) {
      this.hud.setInteractHint(`<b>${entity.displayName}</b> · right-click to talk`);
      return;
    }
    const hit = this.world.raycast(origin, dir, GRAVITY_PLAYER_REACH);
    if (hit) {
      const def = blockById(hit.id);
      if (def.key === 'crafting_table') {
        this.hud.setInteractHint('<b>Crafting Table</b> · right-click to craft');
        return;
      }
      if (def.key === 'furnace') {
        this.hud.setInteractHint('<b>Furnace</b> · right-click to smelt');
        return;
      }
      if (def.key === 'chest') {
        this.hud.setInteractHint('<b>Chest</b> · right-click to loot');
        return;
      }
    }
    const held = this.player.inventory.selectedDef;
    if (held?.block) {
      this.hud.setInteractHint(`<b>${held.name}</b> · right-click to place`);
    } else if (held?.foodHunger) {
      this.hud.setInteractHint(`<b>${held.name}</b> · right-click to eat`);
    } else {
      this.hud.setInteractHint(null);
    }
  }

  // ---------------------------------------------------------------- dialogues

  private talkTo(entity: GameEntity): void {
    entity.interact(this.player);
    this.scripts.emit('interact', { target: entity.id || entity.displayName, source: entity.def.key });
    const id = entity.id;
    this.counters.talks[id] = (this.counters.talks[id] ?? 0) + 1;
    this.counters.talks.__any = (this.counters.talks.__any ?? 0) + 1;
    const quest = this.template.quests.find((q) => q.id === entity.questId);
    const questState = quest ? this.questStates[quest.id] : undefined;
    this.dialogue.open(entity, {
      hasQuest: !!quest && !questState?.turnedIn,
      questActive: !!questState?.active,
      questComplete: !!questState?.complete,
      questTitle: quest?.title,
      onClose: () => {
        this.refreshUiOpen();
      },
      onAcceptQuest: () => {
        if (!quest || !questState || questState.active || questState.turnedIn) return;
        this.acceptQuest(quest, questState);
      },
      onOpenShop: () => {
        if (entity.shop) this.openShopFor(entity);
      },
      onCompleteQuest: () => {
        if (quest && questState) this.turnInQuest(quest, questState);
      },
    });
    this.uiOpen = true;
    this.input.exitLock();
  }

  private acceptQuest(quest: QuestDef, state: QuestState): void {
    state.active = true;
    state.complete = false;
    this.audio.play('quest');
    this.toast(`Quest accepted: ${quest.title}`, 'good');
    this.dialogue.updateQuest(true, false, quest.title);
  }

  private turnInQuest(quest: QuestDef, state: QuestState): void {
    if (!state.complete || state.turnedIn) return;
    state.turnedIn = true;
    state.active = false;
    state.complete = false;
    const reward = quest.reward;
    this.player.addXp(reward.xp);
    for (const item of reward.items) this.player.inventory.add(item.item, item.count);
    if (reward.coins) this.player.addCoins(reward.coins);
    this.audio.play('quest');
    this.toast(`Quest complete: ${quest.title} · +${reward.xp} XP`, 'good');
    this.dialogue.close();
  }

  private openShopFor(entity: GameEntity): void {
    if (this.shopOverlay) this.closeShop();
    this.shopOverlay = openShop(
      this.root,
      {
        player: this.player,
        atlas: this.atlas,
        audio: { play: (name: string) => this.audio.play(name as 'click') },
        toast: (message, kind) => this.toast(message, kind),
      },
      entity,
      () => {
        this.shopOverlay = null;
        this.shopOpen = false;
        this.refreshUiOpen();
      },
    );
    this.shopOpen = true;
    this.uiOpen = true;
    this.audio.play('open');
  }

  private closeShop(): void {
    if (!this.shopOverlay) return;
    this.shopOverlay.remove();
    this.shopOverlay = null;
    this.shopOpen = false;
    this.refreshUiOpen();
  }

  // ------------------------------------------------------------------ overlays

  openScripts(): void {
    if (!this.started || this.ended || this.scriptUI.isOpen) return;
    this.menus.hidePause();
    this.paused = false;
    this.closeLargeMap();
    if (this.inventoryUI.isOpen) this.inventoryUI.close();
    if (this.dialogue.isOpen) this.dialogue.close();
    if (this.shopOverlay) this.closeShop();
    if (this.publishUI.isOpen) this.publishUI.close();
    this.uiOpen = true;
    this.input.exitLock();
    this.scriptUI.open(
      this.scripts.getProject(),
      (project) => {
        this.scripts.load(project);
        this.scripts.start();
      },
      () => {
        this.refreshUiOpen();
        if (!this.uiOpen) this.input.requestLock();
      },
    );
    this.audio.play('open');
  }

  closeScripts(): void {
    this.scriptUI.close();
  }

  openPublish(): void {
    if (!this.started || this.ended || this.publishUI.isOpen) return;
    this.menus.hidePause();
    this.paused = false;
    this.closeLargeMap();
    if (this.inventoryUI.isOpen) this.inventoryUI.close();
    if (this.dialogue.isOpen) this.dialogue.close();
    if (this.shopOverlay) this.closeShop();
    if (this.scriptUI.isOpen) this.scriptUI.close();
    this.uiOpen = true;
    this.input.exitLock();
    this.publishUI.open(() => {
      this.refreshUiOpen();
      if (!this.uiOpen) this.input.requestLock();
    });
    this.audio.play('open');
  }

  closePublish(): void {
    this.publishUI.close();
  }

  openInventory(station?: Station): void {
    if (!this.started || this.ended || this.studioOpen) return;
    this.menus.hidePause();
    this.paused = false;
    this.inventoryUI.open(station ?? this.stationNearPlayer());
    this.input.exitLock();
    this.uiOpen = true;
  }

  private stationNearPlayer(): Station {
    const p = this.player.position;
    let table = false;
    let furnace = false;
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const def = blockById(this.world.getBlock(p.x + dx, p.y + dy, p.z + dz));
          if (def.key === 'furnace') furnace = true;
          if (def.key === 'crafting_table') table = true;
        }
      }
    }
    return furnace ? 'furnace' : table ? 'table' : 'hand';
  }

  requestPause(): void {
    if (!this.started || this.ended || this.studioOpen) return;
    this.menus.hidePause();
    if (this.inventoryUI.isOpen) this.inventoryUI.close();
    if (this.dialogue.isOpen) this.dialogue.close();
    if (this.shopOverlay) this.closeShop();
    this.closeLargeMap();
    this.paused = true;
    this.uiOpen = true;
    this.input.exitLock();
    this.menus.showPause(
      {
        title: this.template.name,
        subtitle: this.template.subtitle,
        day: this.dayCount,
        playTime: this.stats.playTime,
        stats: {
          kills: this.stats.kills,
          blocksMined: this.stats.blocksMined,
          blocksPlaced: this.stats.blocksPlaced,
          objectives: this.objectives.filter((o) => o.done).length,
          totalObjectives: this.objectives.length,
        },
        inStudio: this.studioOpen,
      },
      {
        onResume: () => this.resume(),
        onInventory: () => {
          this.menus.hidePause();
          this.paused = false;
          this.openInventory();
        },
        onSettings: () => {
          this.menus.openSettings(this.settings, (settings) => this.applySettings(settings));
        },
        onSave: () => this.saveGame(true),
        onStudio: () => {
          this.menus.hidePause();
          this.paused = false;
          this.openStudio();
        },
        onScripts: () => {
          this.menus.hidePause();
          this.paused = false;
          this.openScripts();
        },
        onPublish: () => {
          this.menus.hidePause();
          this.paused = false;
          this.openPublish();
        },
        onRestart: () => {
          this.menus.hidePause();
          this.paused = false;
          this.restart();
        },
        onMenu: () => {
          this.menus.hidePause();
          this.paused = false;
          this.returnToMenu();
        },
      },
    );
  }

  private resume(): void {
    this.menus.hidePause();
    this.paused = false;
    this.closeLargeMap();
    this.refreshUiOpen();
    if (!this.uiOpen) this.input.requestLock();
  }

  closeOtherOverlays(except: string): void {
    if (except !== 'inventory' && this.inventoryUI?.isOpen) this.inventoryUI.close();
    if (except !== 'dialogue' && this.dialogue?.isOpen) this.dialogue.close();
    if (except !== 'shop' && this.shopOverlay) this.closeShop();
    if (except !== 'scripts' && this.scriptUI?.isOpen) this.scriptUI.close();
    if (except !== 'publish' && this.publishUI?.isOpen) this.publishUI.close();
    if (except !== 'pause' && this.paused) {
      this.menus.hidePause();
      this.paused = false;
    }
    if (except !== 'studio' && this.studioOpen) this.closeStudio();
    this.refreshUiOpen();
  }

  onOverlayClosed(): void {
    this.refreshUiOpen();
  }

  private refreshUiOpen(): void {
    if (!this.started) {
      this.uiOpen = false;
      return;
    }
    this.uiOpen = this.inventoryUI.isOpen || this.dialogue.isOpen || this.shopOpen || this.paused || this.ended || this.studioOpen || this.scriptUI?.isOpen || this.publishUI?.isOpen;
    if (!this.uiOpen && !this.studioOpen && !this.ended) this.input.requestLock();
  }

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    saveSettings(this.settings);
    this.onResize();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMusic(this.settings.music);
    this.audio.setEnabled(this.settings.sfx);
    if (this.player) this.player.baseFov = this.settings.fov;
    if (this.world) {
      this.world.setRenderDistance(this.settings.renderDistance);
      this.sky.setRenderDistance(this.settings.renderDistance);
    }
    if (this.hud?.el) {
      const hints = this.hud.el.querySelector('.hud-hints') as HTMLElement | null;
      if (hints) hints.style.display = this.settings.showHints ? '' : 'none';
    }
  }

  toast(message: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info'): void {
    this.hud?.toast(message, kind);
  }

  setCameraMode(mode: CameraMode, announce = true): void {
    if (!this.player || !isCameraMode(mode)) return;
    this.cameraMode = mode;
    this.player.setCameraMode(mode);
    if (announce) this.toast(`Camera: ${cameraModeLabel(mode)}`, 'info');
  }

  cycleCameraMode(): CameraMode {
    if (!this.player) return this.cameraMode;
    const mode = this.player.cycleCameraMode();
    this.cameraMode = mode;
    this.toast(`Camera: ${cameraModeLabel(mode)}`, 'info');
    return mode;
  }

  setVehicleMode(enabled: boolean, style: 'kart' | 'car' = this.vehicleStyle, announce = true): void {
    if (!this.player) return;
    this.vehicleStyle = style === 'car' ? 'car' : 'kart';
    this.player.setVehicleMode(enabled, this.vehicleStyle);
    this.cameraMode = this.player.cameraMode;
    if (announce) {
      this.toast(
        enabled ? (this.vehicleStyle === 'kart' ? 'Kart engaged. W/S throttle, A/D steer, Shift boost.' : 'Car engaged. W/S throttle, A/D steer, Shift boost.') : 'Back on foot.',
        'info',
      );
    }
  }

  toggleVehicle(): boolean {
    if (!this.player) return false;
    const enabled = !this.player.vehicleMode;
    this.setVehicleMode(enabled, this.vehicleStyle);
    return enabled;
  }

  // ------------------------------------------------------------------- combat

  private onEntityKilled(entity: GameEntity, byPlayer: boolean): void {
    this.stats.kills += 1;
    this.counters.kills[entity.def.key] = (this.counters.kills[entity.def.key] ?? 0) + 1;
    this.counters.kills.__any = (this.counters.kills.__any ?? 0) + 1;
    if (byPlayer) this.stats.damageDealt += 1;
    this.scripts?.emit('kill', { entity: entity.def.key, target: entity.displayName });
    if (entity.boss) {
      this.toast(`${entity.displayName} has been defeated.`, 'good');
      this.particles.burst(entity.center, '#ffd27a', 60, { speed: 7, life: 1.2, size: 0.16 });
    }
  }

  private handleDeath(source: string): void {
    this.stats.deaths += 1;
    this.endGame(false, 'You Died', `${source} · Day ${this.dayCount}`);
  }

  private formatRaceTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  private endGame(win: boolean, title?: string, subtitle?: string): void {
    if (this.ended) return;
    this.ended = true;
    this.input.exitLock();
    this.menus.hidePause();
    this.closeLargeMap();
    if (this.inventoryUI.isOpen) this.inventoryUI.close();
    if (this.dialogue.isOpen) this.dialogue.close();
    if (win) {
      this.victoryShown = true;
      this.audio.play('win');
    }
    const done = this.objectives.filter((o) => o.done).length;
    this.menus.showEnd(
      {
        win,
        title: title ?? (win ? 'Victory' : 'You Died'),
        subtitle: subtitle ?? (win ? `${this.template.name} conquered in ${this.dayCount} day${this.dayCount === 1 ? '' : 's'}.` : this.template.name),
        playTime: this.stats.playTime,
        kills: this.stats.kills,
        blocks: this.stats.blocksMined + this.stats.blocksPlaced,
        objectives: done,
        level: this.player.level,
      },
      {
        onRespawn: () => this.respawn(),
        onContinue: () => {
          this.menus.hideEnd();
          this.ended = false;
          this.uiOpen = false;
          this.input.requestLock();
        },
        onRestart: () => {
          this.menus.hideEnd();
          this.ended = false;
          this.restart();
        },
        onMenu: () => {
          this.menus.hideEnd();
          this.returnToMenu();
        },
      },
    );
  }

  private respawn(): void {
    this.menus.hideEnd();
    this.ended = false;
    this.uiOpen = false;
    if (!this.rules.keepInventory) {
      this.player.inventory.clear();
      this.giveStartingGear(this.template);
    }
    this.player.revive();
    this.player.teleport(this.respawnPoint.clone());
    this.player.spawnAt(this.respawnPoint.clone(), this.template.spawnYaw ?? 0);
    this.scripts.emit('respawn', {});
    this.toast('You wake up at the last checkpoint.', 'info');
    this.audio.play('checkpoint');
    this.refreshUiOpen();
    if (!this.uiOpen) this.input.requestLock();
  }

  // ------------------------------------------------------------------- saving

  buildProjectData(): GameSaveData {
    const objectives: Record<string, { progress: number; done: boolean }> = {};
    for (const objective of this.objectives) objectives[objective.def.id] = { progress: objective.progress, done: objective.done };
    const quests: GameSaveData['quests'] = {};
    for (const [id, state] of Object.entries(this.questStates)) {
      const obj: Record<string, number> = {};
      for (const o of state.objectives) obj[o.def.id] = o.progress;
      quests[id] = { active: state.active, complete: state.complete, turnedIn: state.turnedIn, objectives: obj };
    }
    return {
      version: 3,
      templateKey: this.template.key,
      templateName: this.template.name,
      seed: this.seed,
      baseY: this.baseY,
      rules: { ...this.rules },
      edits: this.world ? this.world.getEdits() : [],
      entities: this.entities
        ? this.entities.entities.filter((e) => e.alive).map((e) => this.serializeEntity(e))
        : [],
      player: {
        position: [this.player.position.x, this.player.position.y, this.player.position.z],
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.player.health,
        hunger: this.player.hunger,
        air: this.player.air,
        xp: this.player.xp,
        level: this.player.level,
        coins: this.player.coins,
        flying: this.player.flying,
        inventory: this.player.inventory.serialize(),
      },
      skyTime: this.sky.time,
      dayCount: this.dayCount,
      stats: { ...this.stats },
      objectives,
      counters: {
        kills: { ...this.counters.kills },
        crafts: { ...this.counters.crafts },
        places: { ...this.counters.places },
        talks: { ...this.counters.talks },
      },
      quests,
      waves: { index: this.wave.index, cleared: this.wave.cleared, timer: this.wave.timer, active: this.wave.active },
      checkpointIndex: this.checkpoints.reduce((last, cp, index) => (cp.reached ? index : last), 0),
      respawn: [this.respawnPoint.x, this.respawnPoint.y, this.respawnPoint.z],
      studio: {
        props: this.studioProps.map((prop) => ({
          id: prop.id,
          name: prop.name,
          assetKey: prop.assetKey,
          source: prop.source,
          position: [prop.object.position.x, prop.object.position.y, prop.object.position.z],
          rotation: prop.object.rotation.y,
          scale: prop.object.scale.x,
        })),
        assets: this.studioAssets.map((asset) => ({ key: asset.key, name: asset.name, source: asset.source })),
      },
      victoryShown: this.victoryShown,
      savedAt: Date.now(),
      projectName: this.projectName,
      scripts: this.scripts ? this.scripts.getProject() : emptyScriptProject(),
      cameraMode: this.cameraMode,
      vehicle: { enabled: this.player?.vehicleMode ?? false, style: this.vehicleStyle },
    };
  }

  /**
   * A fresh-start snapshot suitable for publishing. Keeps authored world edits,
   * studio objects, rule tweaks, scripts, camera and vehicle setup, but resets
   * the player, objectives, waves and transient stats so every copy of the
   * exported game begins at the spawn point with the template's starting gear.
   */
  exportProject(name?: string): GameSaveData {
    const data = this.buildProjectData();
    const template = this.template;
    const inventory = new Inventory();
    this.fillStartingGear(inventory, template);
    data.projectName = (name || this.projectName || template.name).trim() || template.name;
    data.templateName = template.name;
    data.entities = [];
    data.player = {
      position: [this.respawnPoint.x, this.respawnPoint.y, this.respawnPoint.z],
      yaw: template.spawnYaw ?? 0,
      pitch: 0,
      health: 20,
      hunger: 20,
      air: 10,
      xp: 0,
      level: 0,
      coins: 0,
      flying: false,
      inventory: inventory.serialize(),
    };
    data.stats = { kills: 0, blocksMined: 0, blocksPlaced: 0, deaths: 0, damageDealt: 0, distance: 0, playTime: 0 };
    data.objectives = {};
    data.counters = { kills: {}, crafts: {}, places: {}, talks: {} };
    data.quests = {};
    data.waves = { index: 0, cleared: 0, timer: template.waves.length > 0 ? 3 : 0, active: false };
    data.checkpointIndex = -1;
    data.skyTime = template.timeOfDay;
    data.dayCount = 1;
    data.victoryShown = false;
    data.savedAt = Date.now();
    return data;
  }

  saveGame(showToast = true): void {
    if (!this.started || !this.world || !this.player) return;
    try {
      const data = this.buildProjectData();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (showToast) this.toast('World saved to this browser.', 'good');
    } catch (error) {
      console.error(error);
      if (showToast) this.toast('Save failed — browser storage may be full.', 'bad');
    }
  }

  private serializeEntity(entity: GameEntity): EntitySaveData {
    return {
      key: entity.def.key,
      position: [entity.position.x, entity.position.y, entity.position.z],
      yaw: entity.yaw,
      id: entity.id,
      displayName: entity.displayName,
      role: entity.role,
      dialogue: entity.dialogue,
      questId: entity.questId,
      behavior: entity.behavior,
      boss: entity.boss,
      health: entity.health,
    };
  }

  private endSession(): void {
    this.started = false;
    this.paused = false;
    this.ended = false;
    this.uiOpen = false;
    this.studioOpen = false;
    this.mode = this.playMode;
    this.closeLargeMap();
    this.closeShop();
    if (this.inventoryUI?.isOpen) this.inventoryUI.close();
    if (this.dialogue?.isOpen) this.dialogue.close();
    this.scriptUI?.close();
    this.publishUI?.close();
    this.menus.hidePause();
    this.menus.hideEnd();
    if (this.hud?.el) this.hud.el.classList.add('hidden');
    if (this.touchControls) this.touchControls.setActive(false);
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    if (this.worldFx) {
      this.worldFx.dispose();
      this.worldFx = null;
    }
    this.raceFinishTimer = 0;
    this.studio.close();
    this.input.exitLock();
    if (this.studioPropsGroup) this.studioPropsGroup.clear();
    this.studioProps = [];
    this.studioAssets = [];
    this.studioAssetMap.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.pendingStroke = null;
    if (this.entities) {
      this.entities.clear();
      this.entities.dispose();
      this.entities.group.removeFromParent();
    }
    if (this.world) {
      this.world.group.removeFromParent();
      this.world.dispose();
    }
    if (this.player) {
      this.player.group.removeFromParent();
      this.player.camera.removeFromParent();
      this.player.dispose();
    }
    this.objectives = [];
    this.questStates = {};
    this.counters = { kills: {}, crafts: {}, places: {}, talks: {} };
    this.wave = { index: 0, cleared: 0, timer: 0, active: false, entities: [] };
    this.checkpoints = [];
    this.victoryTimer = 0;
    this.miningTarget = null;
    this.miningProgress = 0;
    this.particles.clear();
  }

  // ---------------------------------------------------------------- objectives

  private setupObjectives(save?: GameSaveData): void {
    this.objectives = this.template.objectives.map((def) => {
      const saved = save?.objectives?.[def.id];
      return { def, progress: saved?.progress ?? 0, done: saved?.done ?? false };
    });
  }

  private setupQuests(save?: GameSaveData): void {
    this.questStates = {};
    for (const quest of this.template.quests) {
      const saved = save?.quests?.[quest.id];
      this.questStates[quest.id] = {
        active: saved?.active ?? false,
        complete: saved?.complete ?? false,
        turnedIn: saved?.turnedIn ?? false,
        objectives: quest.objectives.map((def) => ({
          def,
          progress: saved?.objectives?.[def.id] ?? 0,
          done: false,
        })),
      };
    }
    for (const state of Object.values(this.questStates)) {
      for (const objective of state.objectives) {
        objective.done = objective.progress >= objective.def.count;
      }
    }
  }

  private updateObjectives(dt: number): void {
    for (const state of this.objectives) {
      if (state.done) continue;
      this.progressObjective(state, dt);
      if (state.progress >= state.def.count || (state.def.kind === 'reach' && state.progress >= 1)) {
        state.done = true;
        this.toast(`Objective complete: ${state.def.title}`, 'good');
        this.audio.play('quest');
      }
    }
  }

  private progressObjective(state: ObjectiveState, dt: number): void {
    const def = state.def;
    const target = def.target;
    switch (def.kind) {
      case 'collect': {
        const inv = this.player.inventory;
        const count = target ? inv.count(target) : inv.slots.reduce((sum, s) => sum + (s ? s.count : 0), 0);
        state.progress = Math.max(state.progress, count);
        break;
      }
      case 'kill':
        state.progress = Math.max(state.progress, this.counters.kills[target && target !== 'any' ? target : '__any'] ?? 0);
        break;
      case 'craft':
        state.progress = Math.max(state.progress, this.counters.crafts[target ?? '__any'] ?? 0);
        break;
      case 'place':
        state.progress = Math.max(state.progress, this.counters.places[target ?? '__any'] ?? 0);
        break;
      case 'talk':
        state.progress = Math.max(state.progress, this.counters.talks[target ?? '__any'] ?? 0);
        break;
      case 'wave':
        state.progress = Math.max(state.progress, this.wave.cleared);
        break;
      case 'survive':
        state.progress = Math.min(def.count, state.progress + Math.max(0, dt));
        break;
      case 'reach': {
        if (!def.offset) break;
        const pos = new THREE.Vector3(def.offset[0] + 0.5, this.baseY + def.offset[1], def.offset[2] + 0.5);
        const radius = def.radius ?? 4;
        if (this.player.position.distanceTo(pos) <= radius) state.progress = 1;
        break;
      }
    }
  }

  private updateQuests(): void {
    for (const quest of this.template.quests) {
      const state = this.questStates[quest.id];
      if (!state || !state.active || state.turnedIn) continue;
      let allDone = true;
      for (const objective of state.objectives) {
        if (!objective.done) this.progressObjective(objective, 0);
        if (objective.progress >= objective.def.count || (objective.def.kind === 'reach' && objective.progress >= 1)) objective.done = true;
        if (!objective.done) allDone = false;
      }
      if (allDone && !state.complete) {
        state.complete = true;
        this.toast(`Quest ready to turn in: ${quest.title}`, 'good');
        this.audio.play('quest');
        if (this.dialogue.isOpen) this.dialogue.updateQuest(true, true, quest.title);
      }
    }
  }

  recordCraft(itemKey: string, count: number): void {
    this.counters.crafts[itemKey] = (this.counters.crafts[itemKey] ?? 0) + count;
    this.counters.crafts.__any = (this.counters.crafts.__any ?? 0) + count;
  }

  private recordPlace(itemKey: string): void {
    this.counters.places[itemKey] = (this.counters.places[itemKey] ?? 0) + 1;
    this.counters.places.__any = (this.counters.places.__any ?? 0) + 1;
  }

  // ---------------------------------------------------------------- checkpoints

  private updateCheckpoints(dt: number): void {
    this.checkpointFx -= dt;
    const p = this.player.position;
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      const pos = new THREE.Vector3(cp.spec.offset[0] + 0.5, this.baseY + cp.spec.offset[1], cp.spec.offset[2] + 0.5);
      if (!cp.reached && this.player.isAlive()) {
        const horizontal = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (horizontal <= cp.spec.radius && Math.abs(p.y - pos.y) <= 5) {
          cp.reached = true;
          this.respawnPoint.copy(pos);
          this.toast(`Checkpoint: ${cp.spec.label}`, 'good');
          this.audio.play('checkpoint');
          this.particles.sparkle(pos, '#9ef7d0', 22);
        }
      }
      if (this.checkpointFx <= 0 && p.distanceTo(pos) < 26 && !cp.reached) {
        this.particles.sparkle(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), '#8df0cd', 3);
      }
    }
    if (this.checkpointFx <= 0) this.checkpointFx = 1.4;
  }

  // --------------------------------------------------------------------- waves

  private updateWaves(dt: number): void {
    const waves = this.template.waves;
    if (!waves.length) return;
    if (this.wave.active) {
      const alive = this.wave.entities.filter((e) => e.alive);
      if (!alive.length) {
        this.wave.active = false;
        this.wave.cleared = Math.max(this.wave.cleared, this.wave.index + 1);
        const clearedWave = waves[this.wave.index];
        if (clearedWave?.reward) {
          this.player.addXp(clearedWave.reward.xp ?? 0);
          for (const item of clearedWave.reward.items ?? []) this.player.inventory.add(item.item, item.count);
        }
        this.audio.play('wave');
        this.toast('Wave cleared.', 'good');
        this.wave.index += 1;
        if (this.wave.index < waves.length) {
          this.wave.timer = 6;
          this.hud.showWaveBanner('Next wave', `Wave ${this.wave.index + 1}`, 'Prepare yourself', 3);
        } else {
          this.hud.showWaveBanner('Victory', 'All waves cleared', 'The arena falls silent', 4);
        }
        this.saveGame(false);
      }
      return;
    }
    if (this.wave.index >= waves.length) return;
    this.wave.timer -= dt;
    if (this.wave.timer > 0) return;
    this.startWave(waves[this.wave.index]);
  }

  private startWave(spec: WaveSpec): void {
    const center = new THREE.Vector3(this.template.spawn[0] + 0.5, this.baseY + 1, this.template.spawn[1] + 0.5);
    const spawned: GameEntity[] = [];
    let index = 0;
    for (const entry of spec.entities) {
      const def = entityDef(entry.key);
      for (let i = 0; i < entry.count; i++) {
        const angle = (index / Math.max(1, spec.entities.length * 3)) * Math.PI * 2 + Math.random() * 0.6;
        const radius = def?.flying ? 5 : 7 + Math.random() * 2;
        const pos = new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          center.y + (def?.flying ? 5 + Math.random() * 4 : 0),
          center.z + Math.sin(angle) * radius,
        );
        const entity = this.entities.spawn(entry.key, pos, {
          exactY: !!def?.flying,
          healthScale: spec.healthScale,
        });
        if (entity) spawned.push(entity);
        index += 1;
      }
    }
    this.wave.entities = spawned;
    this.wave.active = spawned.length > 0;
    this.wave.timer = 0;
    this.hud.showWaveBanner('Wave incoming', spec.label, `${spawned.length} enemies`, 3.6);
    this.audio.play('wave');
    if (!spawned.length) this.wave.active = false;
  }

  private spawnAmbientMobs(dt: number): void {
    if (!this.rules.mobSpawning || this.creativeMode || this.template.waves.length > 0) return;
    this.mobTimer -= dt;
    if (this.mobTimer > 0) return;
    this.mobTimer = 22 + Math.random() * 18;
    if (!this.sky.isNight && this.template.key !== 'horror') return;
    const alive = this.entities.entities.filter((e) => e.alive && e.isHostile).length;
    if (alive >= 10) return;
    const pool = HOSTILE_KEYS.filter((key) => {
      const def = entityDef(key);
      return !!def && !def.flying && !def.aquatic;
    });
    if (!pool.length) return;
    const key = pool[Math.floor(Math.random() * pool.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = 24 + Math.random() * 16;
    const x = this.player.position.x + Math.cos(angle) * distance;
    const z = this.player.position.z + Math.sin(angle) * distance;
    const ground = this.world.getNearestGround(x, z, Math.min(WORLD_HEIGHT - 2, this.baseY + 20));
    if (ground < 0 || ground < 4) return;
    this.entities.spawn(key, new THREE.Vector3(x, ground, z), { exactY: true });
  }

  // ------------------------------------------------------------------ big map

  toggleLargeMap(): void {
    if (this.mapOverlay) {
      this.closeLargeMap();
      return;
    }
    if (!this.started || !this.world) return;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal xl" style="width:min(820px,calc(100vw - 32px))">
        <div class="modal-head">
          <div><h3>World Map</h3><div class="sub">${this.template.name} · ${this.biomeName} · Day ${this.dayCount}</div></div>
          <div class="spacer"></div>
          <button class="close-x" data-map-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
          <canvas width="640" height="640" style="width:100%;max-height:60vh;image-rendering:pixelated;background:#07100c;border:1px solid #2e4438"></canvas>
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-family:var(--mono);font-size:9px;color:#8ba79a">
            <span><b style="color:#9fe08a">■</b> Survivable land</span>
            <span><b style="color:#2c5a9e">■</b> Water</span>
            <span><b style="color:#ff6a5c">■</b> Hostile</span>
            <span><b style="color:#ffd76a">■</b> NPC</span>
            <span><b style="color:#f4ffe8">▲</b> You</span>
          </div>
        </div>
        <div class="modal-foot"><span class="muted tiny">The map samples the loaded world around you.</span><div class="spacer"></div><button class="btn ghost small" data-map-close>Close</button></div>
      </div>
    `;
    this.root.appendChild(overlay);
    this.mapOverlay = overlay;
    overlay.querySelectorAll('[data-map-close]').forEach((button) => button.addEventListener('click', () => this.closeLargeMap()));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeLargeMap();
    });
    this.drawLargeMap(overlay.querySelector('canvas') as HTMLCanvasElement);
    this.input.exitLock();
    this.audio.play('open');
  }

  private closeLargeMap(): void {
    if (!this.mapOverlay) return;
    this.mapOverlay.remove();
    this.mapOverlay = null;
  }

  private drawLargeMap(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const samples = 128;
    const cell = size / samples;
    const radius = 96;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    ctx.fillStyle = '#07100c';
    ctx.fillRect(0, 0, size, size);
    const topY = Math.min(WORLD_HEIGHT - 2, Math.floor(this.player.position.y) + 34);
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const wx = Math.floor(px - radius + (sx / samples) * radius * 2);
        const wz = Math.floor(pz - radius + (sy / samples) * radius * 2);
        let color = '#0d1713';
        for (let y = topY; y >= Math.max(0, topY - 54); y--) {
          const id = this.world.getBlock(wx, y, wz);
          if (!id) continue;
          const def = blockById(id);
          if (def.render === 'liquid') {
            color = def.key === 'lava' ? '#e05a15' : '#2c5a9e';
            break;
          }
          if (def.render === 'cross') continue;
          color = def.mapColor;
          const shade = 0.72 + clamp((y - 20) / 70, 0, 1) * 0.36;
          const v = color.replace('#', '');
          if (v.length === 6) {
            const r = Math.min(255, Math.round(parseInt(v.slice(0, 2), 16) * shade));
            const g = Math.min(255, Math.round(parseInt(v.slice(2, 4), 16) * shade));
            const b = Math.min(255, Math.round(parseInt(v.slice(4, 6), 16) * shade));
            color = `rgb(${r},${g},${b})`;
          }
          break;
        }
        ctx.fillStyle = color;
        ctx.fillRect(sx * cell, sy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    const toScreen = (x: number, z: number) => ({
      x: ((x - px) / (radius * 2) + 0.5) * size,
      y: ((z - pz) / (radius * 2) + 0.5) * size,
    });
    for (const entity of this.entities.entities) {
      if (!entity.alive) continue;
      const p = toScreen(entity.position.x, entity.position.z);
      if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
      ctx.fillStyle = entity.isHostile ? '#ff6a5c' : entity.isNpc ? '#ffd76a' : '#9fe08a';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    for (const cp of this.checkpoints) {
      const p = toScreen(cp.spec.offset[0] + 0.5, cp.spec.offset[2] + 0.5);
      ctx.strokeStyle = cp.reached ? '#7ed957' : '#64b9c9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const center = size / 2;
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-this.player.yaw);
    ctx.fillStyle = '#f4ffe8';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.fillStyle = 'rgba(230,245,230,.6)';
    ctx.textAlign = 'center';
    ctx.fillText('N', center, 20);
    ctx.fillText('S', center, size - 10);
    ctx.textAlign = 'left';
    ctx.fillText('W', 8, center);
    ctx.textAlign = 'right';
    ctx.fillText('E', size - 8, center);
    void ctx;
  }

  // -------------------------------------------------------------------- studio

  openStudio(): void {
    if (!this.started || this.ended || this.studioOpen) return;
    this.menus.hidePause();
    this.paused = false;
    this.closeLargeMap();
    if (this.inventoryUI.isOpen) this.inventoryUI.close();
    if (this.dialogue.isOpen) this.dialogue.close();
    if (this.shopOverlay) this.closeShop();
    this.studioOpen = true;
    this.uiOpen = true;
    this.mode = 'studio';
    this.input.exitLock();
    this.player.group.visible = false;
    this.player.setViewmodelEnabled(false);
    this.studio.open();
    this.audio.play('open');
    this.toast('Studio opened. Right-drag to orbit, wheel to zoom.', 'info');
  }

  closeStudio(): void {
    if (!this.studioOpen) return;
    this.studio.close();
    this.studioOpen = false;
    this.mode = this.playMode;
    this.uiOpen = false;
    this.player.group.visible = true;
    this.player.setViewmodelEnabled(true);
    this.refreshUiOpen();
    this.audio.play('close');
    if (!this.uiOpen) this.input.requestLock();
  }

  studioBeginStroke(label: string): void {
    if (this.pendingStroke) this.studioEndStroke();
    this.pendingStroke = { label, changes: [] };
  }

  studioPaintBlock(x: number, y: number, z: number, blockKey: string): void {
    if (!this.world) return;
    const key = blockKey || 'air';
    const id = key === 'air' ? 0 : block(key).id;
    const before = this.world.getBlock(x, y, z);
    if (before === id) return;
    this.world.ensureArea(x, z, x, z, false);
    if (!this.world.setBlock(x, y, z, id, true)) return;
    if (!this.pendingStroke) this.pendingStroke = { label: 'Paint block', changes: [] };
    this.pendingStroke.changes.push({ x, y, z, before, after: id });
  }

  studioEraseBlock(x: number, y: number, z: number): void {
    this.studioPaintBlock(x, y, z, 'air');
  }

  studioEndStroke(): void {
    const stroke = this.pendingStroke;
    this.pendingStroke = null;
    if (!stroke || !stroke.changes.length) return;
    const changes = stroke.changes;
    this.pushStudioCommand({
      label: stroke.label,
      undo: () => {
        for (let i = changes.length - 1; i >= 0; i--) {
          const c = changes[i];
          this.world.setBlock(c.x, c.y, c.z, c.before, true);
        }
      },
      redo: () => {
        for (const c of changes) this.world.setBlock(c.x, c.y, c.z, c.after, true);
      },
    });
  }

  studioStampPrefab(prefabKey: string, x: number, y: number, z: number): Prefab | null {
    const prefab = PREFAB_BY_KEY.get(prefabKey);
    if (!prefab) return null;
    this.world.ensureArea(
      x - prefab.size[0] / 2 - 1,
      z - prefab.size[2] / 2 - 1,
      x + prefab.size[0] / 2 + 1,
      z + prefab.size[2] / 2 + 1,
      false,
    );
    this.studioBeginStroke(`Stamp ${prefab.name}`);
    const changes = new Map<string, BlockChange>();
    const halfW = Math.ceil(prefab.size[0] / 2) + 1;
    const halfD = Math.ceil(prefab.size[2] / 2) + 1;
    const height = prefab.size[1] + 3;
    for (let dz = -halfD; dz <= halfD; dz++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        for (let dy = 0; dy <= height; dy++) {
          const wx = x + dx;
          const wy = y + dy;
          const wz = z + dz;
          const before = this.world.getBlock(wx, wy, wz);
          changes.set(`${wx},${wy},${wz}`, { x: wx, y: wy, z: wz, before, after: before });
        }
      }
    }
    stampPrefab(this.world, prefabKey, x, y, z, true);
    for (const change of changes.values()) change.after = this.world.getBlock(change.x, change.y, change.z);
    const diff = [...changes.values()].filter((c) => c.before !== c.after);
    if (this.pendingStroke) this.pendingStroke.changes.push(...diff);
    this.studioEndStroke();
    return prefab;
  }

  studioAddProp(assetKey: string, position: THREE.Vector3, rotation = 0, scale = 1): StudioProp | null {
    const asset = this.studioAssetMap.get(assetKey);
    const catalog = getAsset(assetKey);
    const name = asset?.name ?? catalog?.name ?? assetKey;
    const raw = asset?.source ?? (catalog ? buildAssetModel(assetKey) : null);
    if (!raw) return null;
    try {
      const loaded = loadBlockbenchModel(raw, { name });
      const group = new THREE.Group();
      group.name = `studio:${name}`;
      group.add(loaded.root);
      group.position.copy(position);
      group.rotation.y = rotation;
      group.scale.setScalar(clamp(scale, 0.1, 8));
      group.userData.studio = true;
      const prop: StudioProp = {
        id: `prop_${uuid()}`,
        name,
        assetKey: catalog ? assetKey : undefined,
        source: asset?.source,
        object: group,
      };
      group.userData.studioPropId = prop.id;
      this.studioPropsGroup.add(group);
      this.studioProps.push(prop);
      this.pushStudioCommand({
        label: `Place ${name}`,
        undo: () => {
          group.removeFromParent();
          const index = this.studioProps.indexOf(prop);
          if (index >= 0) this.studioProps.splice(index, 1);
        },
        redo: () => {
          if (!this.studioProps.includes(prop)) this.studioProps.push(prop);
          this.studioPropsGroup.add(group);
        },
      });
      return prop;
    } catch (error) {
      console.error(error);
      this.toast('That model could not be loaded.', 'bad');
      return null;
    }
  }

  studioAddEntity(entityKey: string, position: THREE.Vector3): GameEntity | null {
    if (!entityDef(entityKey)) return null;
    const entity = this.entities.spawn(entityKey, position, { exactY: true, yaw: Math.random() * Math.PI * 2 });
    if (!entity) return null;
    const data = this.serializeEntity(entity);
    this.pushStudioCommand({
      label: `Place ${entity.displayName}`,
      undo: () => {
        const live = this.entities.entities.find((e) => e.id === entity.id);
        if (live) this.entities.remove(live);
      },
      redo: () => {
        if (!this.entities.entities.some((e) => e.id === data.id)) this.spawnSavedEntity(data);
      },
    });
    return entity;
  }

  studioRemoveEntity(entity: GameEntity): void {
    const data = this.serializeEntity(entity);
    this.entities.remove(entity);
    this.pushStudioCommand({
      label: `Delete ${data.displayName}`,
      undo: () => {
        if (!this.entities.entities.some((e) => e.id === data.id)) this.spawnSavedEntity(data);
      },
      redo: () => {
        const live = this.entities.entities.find((e) => e.id === data.id);
        if (live) this.entities.remove(live);
      },
    });
  }

  studioRemoveProp(prop: StudioProp): void {
    const index = this.studioProps.indexOf(prop);
    if (index < 0) return;
    this.studioProps.splice(index, 1);
    prop.object.removeFromParent();
    this.pushStudioCommand({
      label: `Delete ${prop.name}`,
      undo: () => {
        if (!this.studioProps.includes(prop)) this.studioProps.push(prop);
        this.studioPropsGroup.add(prop.object);
      },
      redo: () => {
        prop.object.removeFromParent();
        const i = this.studioProps.indexOf(prop);
        if (i >= 0) this.studioProps.splice(i, 1);
      },
    });
  }

  /** Copy a studio prop (catalog or imported) to a new world position. */
  studioCloneProp(prop: StudioProp, position: THREE.Vector3): StudioProp | null {
    const data: StudioPropSave = {
      id: `prop_${uuid()}`,
      name: prop.name,
      assetKey: prop.assetKey,
      source: prop.source,
      position: [position.x, position.y, position.z],
      rotation: prop.object.rotation.y,
      scale: prop.object.scale.x,
    };
    const clone = this.addPropWithoutCommand(data, position);
    if (!clone) return null;
    this.pushStudioCommand({
      label: `Duplicate ${prop.name}`,
      undo: () => {
        clone.object.removeFromParent();
        const index = this.studioProps.indexOf(clone);
        if (index >= 0) this.studioProps.splice(index, 1);
      },
      redo: () => {
        if (!this.studioProps.includes(clone)) this.studioProps.push(clone);
        this.studioPropsGroup.add(clone.object);
      },
    });
    return clone;
  }

  studioApplyTransform(): void {
    // Objects are edited directly by the inspector; nothing else to sync.
  }

  studioUndo(): void {
    const command = this.undoStack.pop();
    if (!command) {
      this.toast('Nothing to undo.', 'info');
      return;
    }
    command.undo();
    this.redoStack.push(command);
    this.studio.refresh();
    this.audio.play('click');
    this.toast(`Undo: ${command.label}`, 'info');
  }

  studioRedo(): void {
    const command = this.redoStack.pop();
    if (!command) {
      this.toast('Nothing to redo.', 'info');
      return;
    }
    command.redo();
    this.undoStack.push(command);
    this.studio.refresh();
    this.audio.play('click');
    this.toast(`Redo: ${command.label}`, 'info');
  }

  private pushStudioCommand(command: StudioCommand): void {
    this.undoStack.push(command);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  async studioImportModel(file: File, position: THREE.Vector3): Promise<StudioProp | null> {
    try {
      const text = await readFileAsText(file);
      const raw = JSON.parse(text);
      loadBlockbenchModel(raw);
      const name = file.name.replace(/\.bbmodel$/i, '') || 'Imported Model';
      const asset: StudioAsset = { key: `import:${uuid()}`, name, source: raw };
      this.studioAssets.push(asset);
      this.studioAssetMap.set(asset.key, asset);
      this.toast(`Imported ${name}.`, 'good');
      return this.studioAddProp(asset.key, position);
    } catch (error) {
      console.error(error);
      this.toast('That file is not a valid .bbmodel.', 'bad');
      return null;
    }
  }

  studioExportProp(prop: StudioProp): void {
    try {
      const raw = prop.source ?? (prop.assetKey ? buildAssetModel(prop.assetKey) : null);
      if (!raw) {
        this.toast('No model data to export.', 'warn');
        return;
      }
      const safe = prop.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'model';
      downloadFile(`${safe}.bbmodel`, JSON.stringify(raw, null, 2));
      this.toast(`Exported ${safe}.bbmodel`, 'good');
    } catch (error) {
      console.error(error);
      this.toast('Export failed.', 'bad');
    }
  }

  studioSaveProject(name: string): boolean {
    if (!this.started) return false;
    try {
      this.projectName = name;
      const data = this.buildProjectData();
      data.projectName = name;
      localStorage.setItem(`${PROJECT_PREFIX}${name}`, JSON.stringify(data));
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.toast(`Project "${name}" saved.`, 'good');
      return true;
    } catch (error) {
      console.error(error);
      this.toast('Project save failed — storage may be full.', 'bad');
      return false;
    }
  }

  studioExportProject(name: string): void {
    this.projectName = name;
    const data = this.buildProjectData();
    data.projectName = name;
    const safe = name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'voxelforge-project';
    downloadFile(`${safe}.voxelforge.json`, JSON.stringify(data));
    this.toast(`Exported ${safe}.voxelforge.json`, 'good');
  }

  async studioImportProject(file: File): Promise<void> {
    try {
      const text = await readFileAsText(file);
      const data = JSON.parse(text) as GameSaveData;
      if (!data || typeof data !== 'object' || !data.templateKey) throw new Error('Invalid project');
      const template = getTemplate(data.templateKey);
      await this.launch(template, data);
      if (this.started && !this.studioOpen) this.openStudio();
    } catch (error) {
      console.error(error);
      this.toast('That file is not a VoxelForge project.', 'bad');
    }
  }

  studioAssetList(): StudioAsset[] {
    return this.studioAssets;
  }

  private loadStudioData(studio: { props: StudioPropSave[]; assets: StudioAssetSave[] }): void {
    for (const asset of studio.assets ?? []) {
      const entry: StudioAsset = { key: asset.key, name: asset.name, source: asset.source };
      this.studioAssets.push(entry);
      this.studioAssetMap.set(entry.key, entry);
    }
    for (const data of studio.props ?? []) {
      const position = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
      const prop = this.addPropWithoutCommand(data, position);
      if (prop) {
        prop.object.rotation.y = data.rotation ?? 0;
        prop.object.scale.setScalar(clamp(data.scale ?? 1, 0.1, 8));
      }
    }
  }

  private addPropWithoutCommand(data: StudioPropSave, position: THREE.Vector3): StudioProp | null {
    const asset = data.assetKey ? this.studioAssetMap.get(data.assetKey) : undefined;
    const catalog = data.assetKey ? getAsset(data.assetKey) : undefined;
    const raw = data.source ?? asset?.source ?? (catalog ? buildAssetModel(data.assetKey!) : null);
    if (!raw) return null;
    try {
      const name = data.name || catalog?.name || 'Prop';
      const loaded = loadBlockbenchModel(raw, { name });
      const group = new THREE.Group();
      group.name = `studio:${name}`;
      group.add(loaded.root);
      group.position.copy(position);
      group.rotation.y = data.rotation ?? 0;
      group.scale.setScalar(clamp(data.scale ?? 1, 0.1, 8));
      group.userData.studioPropId = data.id;
      const prop: StudioProp = {
        id: data.id || `prop_${uuid()}`,
        name,
        assetKey: data.assetKey,
        source: data.source,
        object: group,
      };
      this.studioPropsGroup.add(group);
      this.studioProps.push(prop);
      return prop;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
