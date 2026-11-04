import type { CameraMode } from '../game/CameraModes';
import { isCameraMode } from '../game/CameraModes';
import {
  normalizeScriptProject,
  type ScriptAction,
  type ScriptCondition,
  type ScriptEventPayload,
  type ScriptParamValue,
  type ScriptProject,
  type ScriptRule,
} from './ScriptTypes';

export interface ScriptPlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  coins: number;
  xp: number;
  onGround: boolean;
  vehicle: boolean;
  camera: CameraMode;
}

export interface ScriptHost {
  toast(message: string, kind?: 'info' | 'good' | 'warn' | 'bad'): void;
  getScriptPlayer(): ScriptPlayerSnapshot;
  scriptGiveItem(item: string, count: number): void;
  scriptSpawnEntity(entity: string, x: number, y: number, z: number, options: { name?: string; behavior?: string }): boolean;
  scriptSetCamera(mode: CameraMode): void;
  scriptSetVehicle(enabled: boolean, style?: 'kart' | 'car'): void;
  scriptSetTime(hour: number): void;
  scriptSetWeather(weather: 'clear' | 'rain' | 'snow' | 'ash'): void;
  scriptWin(message: string): void;
  scriptLose(message: string): void;
  scriptTeleport(x: number, y: number, z: number): void;
  scriptPlaySound(name: string): void;
  scriptApplyEffect(effect: string, amount: number): void;
  scriptSetObjective(id: string, progress: number): void;
  scriptSetRule(rule: string, value: boolean): void;
  scriptBoost(amount: number): void;
  scriptInventoryCount(item: string): number;
  scriptNearestEntityDistance(entity?: string): number;
  scriptTime(): number;
  scriptScore(): number;
}

interface TextHandlers {
  start: Array<() => void>;
  tick: Array<(dt: number) => void>;
  events: Record<string, Array<(payload: ScriptEventPayload) => void>>;
  timers: Array<{ seconds: number; next: number; fn: () => void }>;
}

interface PendingAction {
  at: number;
  actions: ScriptAction[];
  index: number;
  rule: ScriptRule;
  payload: ScriptEventPayload;
}

const SUPPORTED_EVENTS = new Set(['start', 'tick', 'timer', 'kill', 'collect', 'place', 'interact', 'damage', 'respawn', 'key']);

export class ScriptRuntime {
  private readonly host: ScriptHost;
  private project: ScriptProject = normalizeScriptProject(null);
  private enabled = true;
  private time = 0;
  private lastTick = 0;
  private ruleLastRun = new Map<string, number>();
  private ruleStarted = new Set<string>();
  private pending: PendingAction[] = [];
  private text: TextHandlers = { start: [], tick: [], events: {}, timers: [] };
  private variables: Record<string, number> = {};
  private errorCount = 0;
  private compileError = '';

  constructor(host: ScriptHost) {
    this.host = host;
  }

  load(project: unknown): void {
    this.project = normalizeScriptProject(project);
    this.enabled = this.project.enabled;
    this.variables = { ...this.project.variables };
    this.ruleLastRun.clear();
    this.ruleStarted.clear();
    this.pending = [];
    this.time = 0;
    this.lastTick = 0;
    this.errorCount = 0;
    this.compiled = false;
    this.compileText();
  }

  getProject(): ScriptProject {
    return {
      ...this.project,
      rules: this.project.rules.map((rule) => ({
        ...rule,
        event: { ...rule.event, params: { ...rule.event.params } },
        conditions: rule.conditions.map((condition) => ({ ...condition, params: { ...condition.params } })),
        actions: rule.actions.map((action) => ({ ...action, params: { ...action.params } })),
      })),
      variables: { ...this.variables },
    };
  }

  getVariables(): Record<string, number> {
    return { ...this.variables };
  }

  getCompileError(): string {
    return this.compileError;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.project.enabled = enabled;
  }

  setSource(source: string): string {
    this.project.source = source;
    this.project.updatedAt = Date.now();
    this.compileError = '';
    this.compiled = false;
    this.compileText();
    return this.compileError;
  }

  setRules(rules: ScriptRule[]): void {
    this.project.rules = rules;
    this.project.updatedAt = Date.now();
  }

  setVariables(variables: Record<string, number>): void {
    this.variables = { ...variables };
    this.project.variables = { ...variables };
  }

  getVariable(name: string): number {
    return this.variables[name] ?? 0;
  }

  setVariable(name: string, value: number): void {
    if (!name) return;
    this.variables[name] = Number.isFinite(value) ? value : 0;
    this.project.variables = { ...this.variables };
  }

  /** Run the once-per-session "start" event for rules and text handlers. */
  start(): void {
    if (!this.enabled) return;
    this.runRules('start', {}, 0);
    for (const handler of this.text.start) this.safe(handler);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.time += Math.max(0, dt);
    const step = Math.max(0, dt);
    this.runTimedActions();
    this.runRules('tick', {}, step);
    for (const handler of this.text.tick) this.safe(() => handler(step));
    for (const timer of this.text.timers) {
      if (this.time < timer.next) continue;
      timer.next = this.time + Math.max(0.05, timer.seconds);
      this.safe(timer.fn);
    }
  }

  emit(type: string, payload: ScriptEventPayload): void {
    if (!this.enabled) return;
    this.runRules(type, payload, 0);
    for (const handler of this.text.events[type] ?? []) this.safe(() => handler(payload));
  }

  runNow(source: string): { ok: boolean; error?: string } {
    const previous = this.project.source;
    this.project.source = source;
    this.compileError = '';
    this.compiled = false;
    this.compileText();
    const error = this.compileError;
    if (error) {
      this.project.source = previous;
      this.compiled = false;
      this.compileText();
      return { ok: false, error };
    }
    this.buildTextHandlers();
    this.emit('start', {});
    this.project.source = previous;
    return { ok: true };
  }

  private compiled = false;

  private compileText(): void {
    this.text = { start: [], tick: [], events: {}, timers: [] };
    this.compileError = '';
    const source = this.project.source.trim();
    if (!source) {
      this.compiled = true;
      this.buildTextHandlers();
      return;
    }
    try {
      const host = this.host;
      const runtime = this;
      const playerProxy = {
        get x() { return host.getScriptPlayer().x; },
        get y() { return host.getScriptPlayer().y; },
        get z() { return host.getScriptPlayer().z; },
        get yaw() { return host.getScriptPlayer().yaw; },
        get pitch() { return host.getScriptPlayer().pitch; },
        get health() { return host.getScriptPlayer().health; },
        get hunger() { return host.getScriptPlayer().hunger; },
        get coins() { return host.getScriptPlayer().coins; },
        get xp() { return host.getScriptPlayer().xp; },
        get onGround() { return host.getScriptPlayer().onGround; },
        get vehicle() { return host.getScriptPlayer().vehicle; },
        get camera() { return host.getScriptPlayer().camera; },
        count(item: string) { return host.scriptInventoryCount(String(item)); },
        nearest(entity?: string) { return host.scriptNearestEntityDistance(entity); },
      };
      const api: Record<string, unknown> = {
        onStart: (fn: () => void) => { if (typeof fn === 'function') runtime.text.start.push(fn); },
        onTick: (fn: (dt: number) => void) => { if (typeof fn === 'function') runtime.text.tick.push(fn); },
        onEvent: (name: string, fn: (payload: ScriptEventPayload) => void) => {
          if (typeof fn !== 'function') return;
          const key = String(name || 'start');
          (runtime.text.events[key] ??= []).push(fn);
        },
        every: (seconds: number, fn: () => void) => {
          if (typeof fn !== 'function') return;
          runtime.text.timers.push({ seconds: Math.max(0.05, Number(seconds) || 1), next: runtime.time + Math.max(0.05, Number(seconds) || 1), fn });
        },
        say: (message: unknown, kind: 'info' | 'good' | 'warn' | 'bad' = 'info') => host.toast(String(message ?? ''), kind),
        give: (item: unknown, count = 1) => host.scriptGiveItem(String(item ?? ''), Math.max(1, Number(count) || 1)),
        spawn: (entity: unknown, x = 0, y = 0, z = 0, options: { name?: string; behavior?: string } = {}) => {
          const p = host.getScriptPlayer();
          return host.scriptSpawnEntity(String(entity ?? ''), p.x + Number(x || 0), p.y + Number(y || 0), p.z + Number(z || 0), options);
        },
        camera: (mode: unknown) => { if (isCameraMode(mode)) host.scriptSetCamera(mode); },
        vehicle: (enabled = true, style: 'kart' | 'car' = 'kart') => host.scriptSetVehicle(Boolean(enabled), style === 'car' ? 'car' : 'kart'),
        time: (hour: unknown) => host.scriptSetTime(Number(hour) || 0),
        weather: (weather: unknown) => host.scriptSetWeather(String(weather) as 'clear' | 'rain' | 'snow' | 'ash'),
        win: (message = 'Victory!') => host.scriptWin(String(message)),
        lose: (message = 'Game over') => host.scriptLose(String(message)),
        setVar: (name: unknown, value: unknown) => runtime.setVariable(String(name ?? ''), Number(value) || 0),
        addVar: (name: unknown, value: unknown) => runtime.setVariable(String(name ?? ''), runtime.getVariable(String(name ?? '')) + (Number(value) || 0)),
        getVar: (name: unknown) => runtime.getVariable(String(name ?? '')),
        teleport: (x: unknown, y: unknown, z: unknown) => host.scriptTeleport(Number(x) || 0, Number(y) || 0, Number(z) || 0),
        sound: (name: unknown) => host.scriptPlaySound(String(name ?? 'click')),
        effect: (effect: unknown, amount = 1) => host.scriptApplyEffect(String(effect ?? ''), Number(amount) || 0),
        objective: (id: unknown, progress = 1) => host.scriptSetObjective(String(id ?? ''), Number(progress) || 0),
        rule: (rule: unknown, value = true) => host.scriptSetRule(String(rule ?? ''), Boolean(value)),
        boost: (amount = 8) => host.scriptBoost(Number(amount) || 0),
        log: (...args: unknown[]) => console.log('[VoxelScript]', ...args),
        score: () => host.scriptScore(),
        hour: () => host.scriptTime(),
        player: playerProxy,
        variables: {
          get: (name: string) => runtime.getVariable(String(name)),
          set: (name: string, value: number) => runtime.setVariable(String(name), Number(value) || 0),
          add: (name: string, value: number) => runtime.setVariable(String(name), runtime.getVariable(String(name)) + (Number(value) || 0)),
          all: () => runtime.getVariables(),
        },
        math: Math,
      };
      const factory = new Function(
        'api',
        `"use strict";
         const { onStart, onTick, onEvent, every, say, give, spawn, camera, vehicle, time, weather, win, lose,
           setVar, addVar, getVar, teleport, sound, effect, objective, rule, boost, log, score, hour,
           player, variables, math } = api;
         ${source}
         return { onStart: typeof onStart === 'function' };`,
      );
      factory(api);
      this.compiled = true;
    } catch (error) {
      this.compiled = false;
      this.compileError = error instanceof Error ? error.message : String(error);
      this.host.toast(`Script error: ${this.compileError}`, 'bad');
      console.error('[VoxelScript] compile failed', error);
    }
    this.buildTextHandlers();
  }

  private buildTextHandlers(): void {
    // Handlers are registered by the factory directly; this method exists so
    // live recompiles can reset derived state consistently.
  }

  private runRules(type: string, payload: ScriptEventPayload, dt: number): void {
    if (!SUPPORTED_EVENTS.has(type)) return;
    for (const rule of this.project.rules) {
      if (!rule.enabled) continue;
      if (!this.eventMatches(rule, type, dt)) continue;
      if (rule.once && this.ruleStarted.has(rule.id)) continue;
      if (!this.eventFilterMatches(rule, payload)) continue;
      if (!this.conditionsMatch(rule.conditions)) continue;
      const cooldown = Number(rule.event.params.cooldown ?? 0);
      if (cooldown > 0) {
        const last = this.ruleLastRun.get(rule.id) ?? -9999;
        if (this.time - last < cooldown) continue;
      }
      this.ruleLastRun.set(rule.id, this.time);
      if (rule.once) this.ruleStarted.add(rule.id);
      this.executeActions(rule.actions, rule, payload, 0);
    }
  }

  private eventMatches(rule: ScriptRule, type: string, dt: number): boolean {
    if (rule.event.type === 'tick') return type === 'tick';
    if (rule.event.type !== type) return false;
    if (rule.event.type === 'timer') {
      const seconds = Math.max(0.1, Number(rule.event.params.seconds ?? 5));
      const key = `__timer_${rule.id}`;
      const last = this.ruleLastRun.get(key) ?? 0;
      if (this.time - last < seconds) return false;
      this.ruleLastRun.set(key, this.time);
    }
    return true;
  }

  private eventFilterMatches(rule: ScriptRule, payload: ScriptEventPayload): boolean {
    const params = rule.event.params;
    if (rule.event.type === 'kill' && params.entity) {
      const wanted = String(params.entity).toLowerCase();
      if (!String(payload.entity ?? '').toLowerCase().includes(wanted)) return false;
    }
    if (rule.event.type === 'collect' && params.item) {
      if (String(payload.item ?? '').toLowerCase() !== String(params.item).toLowerCase()) return false;
    }
    if (rule.event.type === 'place' && params.block) {
      if (String(payload.block ?? '').toLowerCase() !== String(params.block).toLowerCase()) return false;
    }
    if (rule.event.type === 'interact' && params.target) {
      const wanted = String(params.target).toLowerCase();
      if (!String(payload.target ?? '').toLowerCase().includes(wanted)) return false;
    }
    if (rule.event.type === 'key' && params.key) {
      if (String(payload.key ?? '').toLowerCase() !== String(params.key).toLowerCase()) return false;
    }
    return true;
  }

  private conditionsMatch(conditions: ScriptCondition[]): boolean {
    for (const condition of conditions) {
      if (!this.checkCondition(condition)) return false;
    }
    return true;
  }

  private checkCondition(condition: ScriptCondition): boolean {
    const p = condition.params;
    const player = this.host.getScriptPlayer();
    switch (condition.type) {
      case 'health_below': return player.health < Number(p.value ?? 0);
      case 'health_at_least': return player.health >= Number(p.value ?? 0);
      case 'has_item': return this.host.scriptInventoryCount(String(p.item ?? '')) >= Number(p.count ?? 1);
      case 'var_compare': {
        const left = this.getVariable(String(p.name ?? ''));
        const right = Number(p.value ?? 0);
        switch (String(p.op ?? '>=')) {
          case '>': return left > right;
          case '<': return left < right;
          case '<=': return left <= right;
          case '==': return left === right;
          case '!=': return left !== right;
          default: return left >= right;
        }
      }
      case 'score_at_least': return this.host.scriptScore() >= Number(p.value ?? 0);
      case 'near_entity': return this.host.scriptNearestEntityDistance(p.entity ? String(p.entity) : undefined) <= Number(p.distance ?? 6);
      case 'time_after': return this.host.scriptTime() >= Number(p.hour ?? 0);
      case 'time_before': return this.host.scriptTime() < Number(p.hour ?? 0);
      case 'chance': return Math.random() * 100 < Number(p.percent ?? 25);
      case 'vehicle': return player.vehicle === (String(p.value ?? 'true') === 'true');
      default: return true;
    }
  }

  private executeActions(actions: ScriptAction[], rule: ScriptRule, payload: ScriptEventPayload, startIndex: number): void {
    for (let i = startIndex; i < actions.length; i++) {
      const action = actions[i];
      if (action.type === 'wait') {
        const seconds = Math.max(0.05, Number(action.params.seconds ?? 1));
        this.pending.push({ at: this.time + seconds, actions, index: i + 1, rule, payload });
        return;
      }
      this.executeAction(action, payload);
    }
  }

  private executeAction(action: ScriptAction, payload: ScriptEventPayload): void {
    const p = action.params;
    switch (action.type) {
      case 'say':
        this.host.toast(String(p.message ?? ''), String(p.kind ?? 'info') as 'info' | 'good' | 'warn' | 'bad');
        break;
      case 'give':
        this.host.scriptGiveItem(String(p.item ?? ''), Math.max(1, Number(p.count ?? 1)));
        break;
      case 'spawn': {
        const player = this.host.getScriptPlayer();
        const relative = p.relative !== false;
        const x = relative ? player.x + Number(p.x ?? 0) : Number(p.x ?? 0);
        const y = relative ? player.y + Number(p.y ?? 0) : Number(p.y ?? 0);
        const z = relative ? player.z + Number(p.z ?? 0) : Number(p.z ?? 0);
        this.host.scriptSpawnEntity(String(p.entity ?? ''), x, y, z, {
          name: p.name ? String(p.name) : undefined,
          behavior: p.behavior ? String(p.behavior) : undefined,
        });
        break;
      }
      case 'camera':
        if (isCameraMode(p.mode)) this.host.scriptSetCamera(p.mode);
        break;
      case 'time':
        this.host.scriptSetTime(Number(p.hour ?? 12));
        break;
      case 'weather':
        this.host.scriptSetWeather(String(p.weather ?? 'clear') as 'clear' | 'rain' | 'snow' | 'ash');
        break;
      case 'win':
        this.host.scriptWin(String(p.message ?? 'Victory!'));
        break;
      case 'lose':
        this.host.scriptLose(String(p.message ?? 'Game over'));
        break;
      case 'set_var':
        this.setVariable(String(p.name ?? ''), Number(p.value ?? 0));
        break;
      case 'add_var':
        this.setVariable(String(p.name ?? ''), this.getVariable(String(p.name ?? '')) + Number(p.value ?? 0));
        break;
      case 'teleport': {
        const player = this.host.getScriptPlayer();
        const relative = p.relative === true;
        this.host.scriptTeleport(
          relative ? player.x + Number(p.x ?? 0) : Number(p.x ?? 0),
          relative ? player.y + Number(p.y ?? 0) : Number(p.y ?? 0),
          relative ? player.z + Number(p.z ?? 0) : Number(p.z ?? 0),
        );
        break;
      }
      case 'sound':
        this.host.scriptPlaySound(String(p.sound ?? 'click'));
        break;
      case 'effect':
        this.host.scriptApplyEffect(String(p.effect ?? 'heal'), Number(p.amount ?? 1));
        break;
      case 'objective':
        this.host.scriptSetObjective(String(p.id ?? ''), Number(p.progress ?? 1));
        break;
      case 'rule':
        this.host.scriptSetRule(String(p.rule ?? ''), Boolean(p.value));
        break;
      case 'boost':
        this.host.scriptBoost(Number(p.amount ?? 8));
        break;
      case 'wait':
        break;
      default:
        break;
    }
    void payload;
  }

  private runTimedActions(): void {
    if (!this.pending.length) return;
    const due = this.pending.filter((entry) => entry.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((entry) => entry.at > this.time);
    for (const entry of due) {
      this.executeActions(entry.actions, entry.rule, entry.payload, entry.index);
    }
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      if (this.errorCount < 4) {
        this.errorCount += 1;
        console.error('[VoxelScript] runtime error', error);
        this.host.toast(`Script runtime error: ${error instanceof Error ? error.message : String(error)}`, 'bad');
      }
    }
  }

}
