import * as THREE from 'three';
import { TEMPLATES, getTemplate } from '../../content/Templates';
import { ITEM_BY_KEY } from '../../content/Recipes';
import { BLOCKS } from '../world/Blocks';
import { PREFABS } from '../../content/Prefabs';
import { ENTITY_DEFS } from '../../content/EntityTypes';
import { CAMERA_MODES, isCameraMode, type CameraMode } from '../game/CameraModes';
import type { Game } from '../game/Game';
import { Publisher, type PublishTarget } from '../publish/Publisher';
import { downloadBlob } from '../publish/Zip';

export interface AiCommand {
  type: string;
  payload?: Record<string, unknown>;
}

export interface AiResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface AiCommandInfo {
  type: string;
  label: string;
  description: string;
  payload?: string;
}

export const AI_COMMANDS: AiCommandInfo[] = [
  { type: 'state', label: 'Session state', description: 'Player, camera, vehicle, objectives and script status.' },
  { type: 'templates', label: 'List templates', description: 'Every built-in game template with key, name and mode.' },
  { type: 'launch', label: 'Launch template', description: 'Start a template from scratch.', payload: '{ "template": "racing" }' },
  { type: 'camera', label: 'Camera mode', description: 'Switch or cycle the five camera modes.', payload: '{ "mode": "third" }' },
  { type: 'vehicle', label: 'Vehicle', description: 'Enter or leave the kart / car.', payload: '{ "enabled": true, "style": "kart" }' },
  { type: 'teleport', label: 'Teleport', description: 'Move the player.', payload: '{ "x": 0, "y": 40, "z": 0 }' },
  { type: 'look', label: 'Look direction', description: 'Set yaw and pitch in radians.', payload: '{ "yaw": 0, "pitch": 0 }' },
  { type: 'give', label: 'Give item', description: 'Add an item to the player inventory.', payload: '{ "item": "diamond_sword", "count": 1 }' },
  { type: 'spawn', label: 'Spawn entity', description: 'Spawn any entity at a world position.', payload: '{ "entity": "human:soldier_rifle", "x": 0, "y": 40, "z": 0 }' },
  { type: 'time', label: 'Set time', description: 'Set the sky hour (0–23.99).', payload: '{ "hour": 20.5 }' },
  { type: 'weather', label: 'Weather', description: 'clear, rain, snow or ash.', payload: '{ "weather": "rain" }' },
  { type: 'toast', label: 'Toast', description: 'Show a HUD message.', payload: '{ "message": "Hello", "kind": "good" }' },
  { type: 'scripts.get', label: 'Read scripts', description: 'Return the full visual + text script project.' },
  { type: 'scripts.set', label: 'Write scripts', description: 'Replace the script project or source.', payload: '{ "source": "onStart(() => say(\\"Hi\\"));" }' },
  { type: 'scripts.run', label: 'Run source', description: 'Compile and start a VoxelScript source string.', payload: '{ "source": "..." }' },
  { type: 'rule', label: 'Set rule', description: 'Toggle a world rule.', payload: '{ "rule": "keepInventory", "value": true }' },
  { type: 'objective', label: 'Set objective', description: 'Force objective progress.', payload: '{ "id": "flag", "progress": 1 }' },
  { type: 'block', label: 'Set block', description: 'Place or erase a single block.', payload: '{ "x": 0, "y": 40, "z": 0, "block": "glowstone" }' },
  { type: 'prefab', label: 'Stamp prefab', description: 'Stamp a prefab at a world position.', payload: '{ "prefab": "army_base", "x": 0, "y": 32, "z": 0 }' },
  { type: 'entities', label: 'List entities', description: 'Live entities with positions and health.' },
  { type: 'sim', label: 'Simulation action', description: 'Inspect or drive the active cooking / shop / lucky simulation.', payload: '{ "action": "cook:burger" }' },
  { type: 'list', label: 'List content', description: 'items, blocks, prefabs, entities, cameras, templates.', payload: '{ "kind": "items" }' },
  { type: 'open', label: 'Open panel', description: 'studio, scripts, publish or inventory.', payload: '{ "panel": "scripts" }' },
  { type: 'close', label: 'Close panel', description: 'Close an overlay.', payload: '{ "panel": "scripts" }' },
  { type: 'pause', label: 'Pause', description: 'Open the pause menu.' },
  { type: 'export', label: 'Export project', description: 'Return the publishable project JSON.' },
  { type: 'publish', label: 'Publish', description: 'Build and download a package.', payload: '{ "target": "web", "name": "My Game" }' },
  { type: 'save', label: 'Save', description: 'Save the current world to browser storage.' },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function fail(message: string): AiResult {
  return { ok: false, message };
}

function done(message: string, data?: unknown): AiResult {
  return { ok: true, message, data };
}

/**
 * Serialisable command surface shared by the browser console, the MCP bridge
 * and external AI agents. Everything returns plain JSON so results can travel
 * over HTTP without special cases.
 */
export class CommandAPI {
  private publisher = new Publisher();

  constructor(private game: Game) {}

  get commandList(): AiCommandInfo[] {
    return AI_COMMANDS;
  }

  async execute(type: string, payload: Record<string, unknown> = {}): Promise<AiResult> {
    const command = (type || '').trim();
    const args = asObject(payload);
    try {
      switch (command) {
        case 'state':
          return done('Session state', this.state());
        case 'templates':
          return done(`${TEMPLATES.length} templates`, TEMPLATES.map((t) => ({
            key: t.key,
            name: t.name,
            mode: t.key,
            difficulty: t.difficulty,
            camera: t.cameraMode ?? 'first',
            vehicle: t.vehicle ?? null,
          })));
        case 'launch':
          return await this.launch(args);
        case 'camera':
          return this.camera(args);
        case 'vehicle':
          return this.vehicle(args);
        case 'teleport':
          return this.teleport(args);
        case 'look':
          return this.look(args);
        case 'give':
          return this.give(args);
        case 'spawn':
          return this.spawn(args);
        case 'time':
          return this.time(args);
        case 'weather':
          return this.weather(args);
        case 'toast':
          return this.toast(args);
        case 'scripts.get':
          return done('Script project', this.game.scripts.getProject());
        case 'scripts.set':
          return this.setScripts(args);
        case 'scripts.run':
          return this.runScript(args);
        case 'rule':
          return this.rule(args);
        case 'objective':
          return this.objective(args);
        case 'block':
          return this.block(args);
        case 'prefab':
          return this.prefab(args);
        case 'entities':
          return this.entities(args);
        case 'sim':
          return this.simCommand(args);
        case 'list':
          return this.list(args);
        case 'open':
          return this.openPanel(args);
        case 'close':
          return this.closePanel(args);
        case 'pause':
          this.game.requestPause();
          return done('Pause menu opened.');
        case 'save':
          this.game.saveGame(false);
          return done('World saved to browser storage.');
        case 'export':
          return this.exportProject(args);
        case 'publish':
          return await this.publish(args);
        default:
          return fail(`Unknown command "${command}". Try "state" or "templates".`);
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private state(): unknown {
    const game = this.game;
    const player = game.getScriptPlayer();
    const scripts = game.scripts.getProject();
    return {
      started: game.started,
      paused: game.paused,
      ended: game.ended,
      uiOpen: game.uiOpen,
      studioOpen: game.studioOpen,
      projectName: game.projectName,
      template: {
        key: game.template.key,
        name: game.template.name,
        subtitle: game.template.subtitle,
        mode: game.mode,
        camera: game.cameraMode,
        vehicle: game.template.vehicle ?? null,
        race: game.template.race ?? null,
        sim: game.template.sim ?? null,
        fx: game.template.fx ?? null,
      },
      player,
      camera: { mode: game.cameraMode, label: game.cameraLabel },
      vehicle: { enabled: player.vehicle, style: game.vehicleStyle },
      race: game.race ? { ...game.race.hud(), standings: game.race.standings() } : null,
      sim: game.sim ? game.sim.hud() : null,
      world: {
        seed: game.seed,
        baseY: game.baseY,
        day: game.dayCount,
        time: Number(game.scriptTime().toFixed(2)),
        entities: game.entities?.entities.filter((entity) => entity.alive).length ?? 0,
      },
      objectives: game.objectives.map((objective) => ({
        id: objective.def.id,
        title: objective.def.title,
        progress: objective.progress,
        count: objective.def.count,
        done: objective.done,
      })),
      scripts: {
        enabled: scripts.enabled,
        rules: scripts.rules.length,
        variables: scripts.variables,
        sourceLength: scripts.source.length,
        compileError: game.scripts.getCompileError() || null,
      },
      bridge: { ready: true },
    };
  }

  private async launch(args: Record<string, unknown>): Promise<AiResult> {
    const key = asString(args.template ?? args.key, '');
    const template = TEMPLATES.find((entry) => entry.key === key);
    if (!template) return fail(`Unknown template "${key}". Use "templates" to list them.`);
    const save = args.save && typeof args.save === 'object' ? (args.save as Parameters<Game['launch']>[1]) : undefined;
    await this.game.launch(template, save);
    return done(`Launched ${template.name}.`);
  }

  private camera(args: Record<string, unknown>): AiResult {
    if (args.cycle) {
      const mode = this.game.cycleCameraMode();
      return done(`Camera: ${mode}`, { mode });
    }
    const mode = asString(args.mode, '');
    if (mode === 'next') {
      const next = this.game.cycleCameraMode();
      return done(`Camera: ${next}`, { mode: next });
    }
    if (!isCameraMode(mode)) {
      return fail(`Unknown camera "${mode}". Options: ${CAMERA_MODES.map((entry) => entry.key).join(', ')}.`);
    }
    this.game.setCameraMode(mode as CameraMode);
    return done(`Camera set to ${mode}.`, { mode });
  }

  private vehicle(args: Record<string, unknown>): AiResult {
    const style = asString(args.style, this.game.vehicleStyle) === 'car' ? 'car' : 'kart';
    const enabled = args.enabled === undefined ? !this.game.player?.vehicleMode : asBool(args.enabled);
    this.game.setVehicleMode(enabled, style);
    return done(enabled ? `${style === 'kart' ? 'Kart' : 'Car'} engaged.` : 'Vehicle parked.', { enabled, style });
  }

  private teleport(args: Record<string, unknown>): AiResult {
    if (!this.game.player) return fail('No active player.');
    const x = asNumber(args.x, this.game.player.position.x);
    const y = asNumber(args.y, this.game.player.position.y);
    const z = asNumber(args.z, this.game.player.position.z);
    this.game.player.teleport(new THREE.Vector3(x, y, z));
    return done(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`, { x, y, z });
  }

  private look(args: Record<string, unknown>): AiResult {
    if (!this.game.player) return fail('No active player.');
    if (args.yaw !== undefined) this.game.player.setYaw(asNumber(args.yaw, 0));
    if (args.pitch !== undefined) this.game.player.pitch = Math.max(-1.5, Math.min(1.5, asNumber(args.pitch, 0)));
    return done('Look direction updated.');
  }

  private give(args: Record<string, unknown>): AiResult {
    const item = asString(args.item, '');
    if (!ITEM_BY_KEY.has(item)) return fail(`Unknown item "${item}".`);
    const count = Math.max(1, Math.round(asNumber(args.count, 1)));
    this.game.scriptGiveItem(item, count);
    return done(`Gave ${count}× ${ITEM_BY_KEY.get(item)?.name ?? item}.`, { item, count });
  }

  private spawn(args: Record<string, unknown>): AiResult {
    const entity = asString(args.entity, '');
    const player = this.game.getScriptPlayer();
    const x = asNumber(args.x, player.x + 3);
    const y = asNumber(args.y, player.y);
    const z = asNumber(args.z, player.z);
    const ok = this.game.scriptSpawnEntity(entity, x, y, z, {
      name: typeof args.name === 'string' ? args.name : undefined,
      behavior: typeof args.behavior === 'string' ? args.behavior : undefined,
    });
    return ok ? done(`Spawned ${entity}.`, { entity, x, y, z }) : fail(`Could not spawn "${entity}".`);
  }

  private time(args: Record<string, unknown>): AiResult {
    const hour = Math.max(0, Math.min(23.99, asNumber(args.hour, 12)));
    this.game.scriptSetTime(hour);
    return done(`Time set to ${hour.toFixed(2)}.`, { hour });
  }

  private weather(args: Record<string, unknown>): AiResult {
    const weather = asString(args.weather, 'clear');
    if (!['clear', 'rain', 'snow', 'ash'].includes(weather)) return fail('Weather must be clear, rain, snow or ash.');
    this.game.scriptSetWeather(weather as 'clear' | 'rain' | 'snow' | 'ash');
    return done(`Weather: ${weather}.`, { weather });
  }

  private toast(args: Record<string, unknown>): AiResult {
    const message = asString(args.message, '');
    if (!message) return fail('A toast needs a message.');
    const kind = ['info', 'good', 'warn', 'bad'].includes(asString(args.kind, 'info')) ? (asString(args.kind, 'info') as 'info' | 'good' | 'warn' | 'bad') : 'info';
    this.game.toast(message, kind);
    return done('Toast shown.');
  }

  private setScripts(args: Record<string, unknown>): AiResult {
    if (args.source !== undefined) {
      const error = this.game.scripts.setSource(asString(args.source, ''));
      if (error) return fail(error);
      this.game.scripts.start();
      return done('Script source replaced and restarted.');
    }
    if (args.project && typeof args.project === 'object') {
      this.game.scripts.load(args.project);
      this.game.scripts.start();
      return done('Script project replaced and restarted.');
    }
    return fail('Provide either "project" or "source".');
  }

  private runScript(args: Record<string, unknown>): AiResult {
    const source = asString(args.source, '');
    if (!source) return fail('Provide a "source" string.');
    const error = this.game.scripts.setSource(source);
    if (error) return fail(error);
    this.game.scripts.start();
    return done('Script compiled and started.');
  }

  private rule(args: Record<string, unknown>): AiResult {
    const rule = asString(args.rule, '');
    if (!(rule in this.game.rules)) return fail(`Unknown rule "${rule}".`);
    this.game.scriptSetRule(rule, asBool(args.value, true));
    return done(`Rule ${rule} = ${asBool(args.value, true)}.`);
  }

  private objective(args: Record<string, unknown>): AiResult {
    const id = asString(args.id, '');
    this.game.scriptSetObjective(id, asNumber(args.progress, 1));
    return done(`Objective ${id} updated.`);
  }

  private block(args: Record<string, unknown>): AiResult {
    const x = Math.round(asNumber(args.x));
    const y = Math.round(asNumber(args.y));
    const z = Math.round(asNumber(args.z));
    const key = asString(args.block, 'air');
    this.game.studioPaintBlock(x, y, z, key);
    this.game.studioEndStroke();
    return done(`Block at ${x},${y},${z} set to ${key}.`, { x, y, z, block: key });
  }

  private prefab(args: Record<string, unknown>): AiResult {
    const key = asString(args.prefab, '');
    const x = Math.round(asNumber(args.x));
    const y = Math.round(asNumber(args.y, this.game.baseY));
    const z = Math.round(asNumber(args.z));
    const prefab = this.game.studioStampPrefab(key, x, y, z);
    return prefab ? done(`Stamped ${prefab.name}.`, { prefab: key, x, y, z }) : fail(`Unknown prefab "${key}".`);
  }

  private entities(args: Record<string, unknown>): AiResult {
    if (!this.game.entities) return done('No active session', []);
    const filter = asString(args.entity, '').toLowerCase();
    const limit = Math.max(1, Math.min(500, Math.round(asNumber(args.limit, 100))));
    const list = this.game.entities.entities
      .filter((entity) => entity.alive && (!filter || entity.def.key.toLowerCase().includes(filter)))
      .slice(0, limit)
      .map((entity) => ({
        key: entity.def.key,
        name: entity.displayName,
        x: Number(entity.position.x.toFixed(2)),
        y: Number(entity.position.y.toFixed(2)),
        z: Number(entity.position.z.toFixed(2)),
        health: Math.round(entity.health),
        behavior: entity.behavior,
        boss: entity.boss,
      }));
    return done(`${list.length} entities`, list);
  }

  private simCommand(args: Record<string, unknown>): AiResult {
    const sim = this.game.sim;
    if (!sim) return fail('No simulation is active in this session.');
    const action = asString(args.action, '');
    if (action) this.game.simAction(action);
    return done(`${sim.kind} simulation`, { kind: sim.kind, hud: sim.hud(), action: action || null });
  }

  private list(args: Record<string, unknown>): AiResult {
    const kind = asString(args.kind, 'templates');
    switch (kind) {
      case 'items':
        return done(`${ITEM_BY_KEY.size} items`, [...ITEM_BY_KEY.values()].map((item) => ({ key: item.key, name: item.name, kind: item.kind })));
      case 'blocks':
        return done(`${BLOCKS.length} blocks`, BLOCKS.map((entry) => ({ key: entry.key, name: entry.name, solid: entry.solid })));
      case 'prefabs':
        return done(`${PREFABS.length} prefabs`, PREFABS.map((entry) => ({ key: entry.key, name: entry.name, size: entry.size, tags: entry.tags })));
      case 'entities':
        return done(`${ENTITY_DEFS.length} entities`, ENTITY_DEFS.map((entry) => ({ key: entry.key, name: entry.name, class: entry.class, behavior: entry.behavior })));
      case 'cameras':
        return done(`${CAMERA_MODES.length} cameras`, CAMERA_MODES);
      case 'commands':
        return done(`${AI_COMMANDS.length} commands`, AI_COMMANDS);
      case 'templates':
      default:
        return done(`${TEMPLATES.length} templates`, TEMPLATES.map((entry) => ({ key: entry.key, name: entry.name, difficulty: entry.difficulty })));
    }
  }

  private openPanel(args: Record<string, unknown>): AiResult {
    const panel = asString(args.panel, 'studio');
    if (panel === 'studio') this.game.openStudio();
    else if (panel === 'scripts') this.game.openScripts();
    else if (panel === 'publish') this.game.openPublish();
    else if (panel === 'inventory') this.game.openInventory();
    else return fail(`Unknown panel "${panel}".`);
    return done(`Opened ${panel}.`);
  }

  private closePanel(args: Record<string, unknown>): AiResult {
    const panel = asString(args.panel, '');
    if (panel === 'studio') this.game.closeStudio();
    else if (panel === 'scripts') this.game.closeScripts();
    else if (panel === 'publish') this.game.closePublish();
    else if (panel === 'inventory' && this.game.inventoryUI?.isOpen) this.game.inventoryUI.close();
    else return fail(`Unknown panel "${panel}".`);
    return done(`Closed ${panel}.`);
  }

  private exportProject(args: Record<string, unknown>): AiResult {
    const name = asString(args.name, this.game.projectName);
    const project = this.game.exportProject(name);
    return done('Project exported.', project);
  }

  private async publish(args: Record<string, unknown>): Promise<AiResult> {
    const target = asString(args.target, 'web') as PublishTarget;
    if (!['web', 'desktop', 'android', 'ios'].includes(target)) return fail('Target must be web, desktop, android or ios.');
    const name = asString(args.name, this.game.projectName || this.game.template.name);
    const result = await this.publisher.build({ target, name, save: this.game.exportProject(name) });
    downloadBlob(result.blob, result.filename);
    return done(`Built ${result.filename} (${result.fileCount} files, ${result.bytes} bytes) and started the download.`, {
      filename: result.filename,
      files: result.fileCount,
      bytes: result.bytes,
      notes: result.notes,
    });
  }
}
