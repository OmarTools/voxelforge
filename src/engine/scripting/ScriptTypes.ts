import { CAMERA_MODES } from '../game/CameraModes';

export type ScriptEventType =
  | 'start' | 'tick' | 'timer' | 'kill' | 'collect' | 'place'
  | 'interact' | 'damage' | 'respawn' | 'key';

export type ScriptConditionType =
  | 'health_below' | 'health_at_least' | 'has_item' | 'var_compare'
  | 'score_at_least' | 'near_entity' | 'time_after' | 'time_before'
  | 'chance' | 'vehicle';

export type ScriptActionType =
  | 'say' | 'give' | 'spawn' | 'camera' | 'time' | 'weather'
  | 'win' | 'lose' | 'set_var' | 'add_var' | 'teleport' | 'sound'
  | 'effect' | 'objective' | 'rule' | 'boost' | 'wait';

export type ScriptParamValue = string | number | boolean;

export interface ScriptParamSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  defaultValue?: ScriptParamValue;
  min?: number;
  max?: number;
  step?: number;
}

export interface ScriptCatalogEntry {
  value: string;
  label: string;
  description: string;
  params: ScriptParamSpec[];
}

export interface ScriptEvent {
  type: ScriptEventType;
  params: Record<string, ScriptParamValue>;
}

export interface ScriptCondition {
  id: string;
  type: ScriptConditionType;
  params: Record<string, ScriptParamValue>;
}

export interface ScriptAction {
  id: string;
  type: ScriptActionType;
  params: Record<string, ScriptParamValue>;
}

export interface ScriptRule {
  id: string;
  name: string;
  enabled: boolean;
  event: ScriptEvent;
  conditions: ScriptCondition[];
  actions: ScriptAction[];
  once?: boolean;
}

export interface ScriptProject {
  version: 1;
  enabled: boolean;
  rules: ScriptRule[];
  variables: Record<string, number>;
  source: string;
  updatedAt: number;
}

export interface ScriptEventPayload {
  entity?: string;
  item?: string;
  block?: string;
  amount?: number;
  source?: string;
  key?: string;
  target?: string;
}

const modeOptions = CAMERA_MODES.map((mode) => ({ value: mode.key, label: mode.label }));
const soundOptions = [
  ['click', 'UI click'], ['pickup', 'Pickup'], ['hit', 'Hit'], ['break', 'Block break'],
  ['place', 'Block place'], ['jump', 'Jump'], ['levelup', 'Level up'], ['quest', 'Quest'],
  ['checkpoint', 'Checkpoint'], ['open', 'Open'], ['error', 'Error'], ['eat', 'Eat'],
].map(([value, label]) => ({ value, label }));

const itemParam = (key = 'item', label = 'Item key'): ScriptParamSpec => ({
  key, label, type: 'text', placeholder: 'e.g. coin, iron_sword, bread', defaultValue: 'coin',
});
const numberParam = (key: string, label: string, value = 1, min = 0, max = 9999): ScriptParamSpec => ({
  key, label, type: 'number', defaultValue: value, min, max, step: 1,
});
const textParam = (key: string, label: string, value = ''): ScriptParamSpec => ({
  key, label, type: 'text', defaultValue: value,
});

export const SCRIPT_EVENTS: ScriptCatalogEntry[] = [
  { value: 'start', label: 'When the game starts', description: 'Runs once as the world becomes playable.', params: [] },
  { value: 'tick', label: 'Every frame', description: 'Runs continuously. Keep the action list short.', params: [] },
  { value: 'timer', label: 'Every N seconds', description: 'A repeating timer.', params: [numberParam('seconds', 'Seconds', 5, 0.1, 3600)] },
  { value: 'kill', label: 'When an enemy is defeated', description: 'Fires when any entity (or a matching key) dies.', params: [textParam('entity', 'Entity key (blank = any)')] },
  { value: 'collect', label: 'When an item is collected', description: 'Fires when the player receives an item.', params: [textParam('item', 'Item key (blank = any)')] },
  { value: 'place', label: 'When a block is placed', description: 'Fires after the player places a block.', params: [textParam('block', 'Block key (blank = any)')] },
  { value: 'interact', label: 'When talking to an NPC', description: 'Fires when dialogue opens.', params: [textParam('target', 'NPC id or name (blank = any)')] },
  { value: 'damage', label: 'When the player takes damage', description: 'Fires after damage is applied.', params: [] },
  { value: 'respawn', label: 'When the player respawns', description: 'Fires after a checkpoint respawn.', params: [] },
  { value: 'key', label: 'When a key is pressed', description: 'Keyboard shortcut trigger.', params: [{ key: 'key', label: 'Key code', type: 'text', defaultValue: 'KeyR', placeholder: 'KeyR, KeyG, Digit1' }] },
];

export const SCRIPT_CONDITIONS: ScriptCatalogEntry[] = [
  { value: 'health_below', label: 'Player health is below', description: '', params: [numberParam('value', 'Health', 6)] },
  { value: 'health_at_least', label: 'Player health is at least', description: '', params: [numberParam('value', 'Health', 10)] },
  { value: 'has_item', label: 'Player has item', description: '', params: [itemParam(), numberParam('count', 'Count', 1)] },
  { value: 'var_compare', label: 'Variable compares', description: '', params: [
    textParam('name', 'Variable', 'score'),
    { key: 'op', label: 'Operator', type: 'select', defaultValue: '>=', options: [
      { value: '>=', label: '≥' }, { value: '>', label: '>' }, { value: '<=', label: '≤' },
      { value: '<', label: '<' }, { value: '==', label: '=' }, { value: '!=', label: '≠' },
    ] },
    numberParam('value', 'Value', 1),
  ] },
  { value: 'score_at_least', label: 'Score is at least', description: 'Score = kills × 10 + coins + XP.', params: [numberParam('value', 'Score', 10)] },
  { value: 'near_entity', label: 'An entity is nearby', description: '', params: [
    textParam('entity', 'Entity key (blank = any)', ''),
    numberParam('distance', 'Distance', 6, 0.5, 256),
  ] },
  { value: 'time_after', label: 'Time of day is after', description: '24-hour clock.', params: [numberParam('hour', 'Hour', 18, 0, 23)] },
  { value: 'time_before', label: 'Time of day is before', description: '24-hour clock.', params: [numberParam('hour', 'Hour', 6, 0, 23)] },
  { value: 'chance', label: 'Random chance', description: '', params: [numberParam('percent', 'Chance %', 25, 1, 100)] },
  { value: 'vehicle', label: 'Player is driving', description: '', params: [
    { key: 'value', label: 'Expected', type: 'select', defaultValue: 'true', options: [
      { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' },
    ] },
  ] },
];

export const SCRIPT_ACTIONS: ScriptCatalogEntry[] = [
  { value: 'say', label: 'Show message', description: '', params: [
    textParam('message', 'Message', 'Hello, world!'),
    { key: 'kind', label: 'Tone', type: 'select', defaultValue: 'info', options: [
      { value: 'info', label: 'Info' }, { value: 'good', label: 'Good' }, { value: 'warn', label: 'Warning' }, { value: 'bad', label: 'Bad' },
    ] },
  ] },
  { value: 'give', label: 'Give item', description: '', params: [itemParam(), numberParam('count', 'Count', 1)] },
  { value: 'spawn', label: 'Spawn entity', description: 'Coordinates are relative to the player unless “relative” is off.', params: [
    textParam('entity', 'Entity key', 'creature:slime'),
    numberParam('x', 'X', 3, -256, 256), numberParam('y', 'Y', 0, -64, 64), numberParam('z', 'Z', 3, -256, 256),
    textParam('name', 'Display name', ''),
    { key: 'behavior', label: 'Behavior', type: 'select', defaultValue: 'hostile', options: [
      { value: '', label: 'Entity default' }, { value: 'hostile', label: 'Hostile' }, { value: 'wander', label: 'Wander' },
      { value: 'guard', label: 'Guard' }, { value: 'ranged', label: 'Ranged' }, { value: 'flee', label: 'Flee' },
      { value: 'stationary', label: 'Stationary' }, { value: 'flying', label: 'Flying' }, { value: 'exploder', label: 'Exploder' },
    ] },
    { key: 'relative', label: 'Relative to player', type: 'checkbox', defaultValue: true },
  ] },
  { value: 'camera', label: 'Switch camera', description: '', params: [
    { key: 'mode', label: 'Mode', type: 'select', defaultValue: 'third', options: modeOptions },
  ] },
  { value: 'time', label: 'Set time of day', description: '0 = midnight, 12 = noon.', params: [numberParam('hour', 'Hour', 18, 0, 23.99)] },
  { value: 'weather', label: 'Set weather', description: '', params: [
    { key: 'weather', label: 'Weather', type: 'select', defaultValue: 'clear', options: [
      { value: 'clear', label: 'Clear' }, { value: 'rain', label: 'Rain' }, { value: 'snow', label: 'Snow' }, { value: 'ash', label: 'Ash' },
    ] },
  ] },
  { value: 'win', label: 'Win the game', description: '', params: [textParam('message', 'Message', 'Victory!')] },
  { value: 'lose', label: 'Lose the game', description: '', params: [textParam('message', 'Message', 'Game over')] },
  { value: 'set_var', label: 'Set variable', description: '', params: [textParam('name', 'Variable', 'score'), numberParam('value', 'Value', 0, -999999, 999999)] },
  { value: 'add_var', label: 'Add to variable', description: '', params: [textParam('name', 'Variable', 'score'), numberParam('value', 'Value', 1, -999999, 999999)] },
  { value: 'teleport', label: 'Teleport player', description: '', params: [
    numberParam('x', 'X', 0, -9999, 9999), numberParam('y', 'Y', 0, -128, 512), numberParam('z', 'Z', 0, -9999, 9999),
    { key: 'relative', label: 'Relative to player', type: 'checkbox', defaultValue: false },
  ] },
  { value: 'sound', label: 'Play sound', description: '', params: [
    { key: 'sound', label: 'Sound', type: 'select', defaultValue: 'click', options: soundOptions },
  ] },
  { value: 'effect', label: 'Apply effect', description: '', params: [
    { key: 'effect', label: 'Effect', type: 'select', defaultValue: 'heal', options: [
      { value: 'heal', label: 'Heal' }, { value: 'damage', label: 'Damage' }, { value: 'feed', label: 'Feed' },
      { value: 'xp', label: 'Give XP' }, { value: 'coins', label: 'Give coins' }, { value: 'speed', label: 'Speed boost' },
      { value: 'jump', label: 'Jump boost' }, { value: 'god', label: 'Toggle god mode' },
    ] },
    numberParam('amount', 'Amount', 5, 0, 9999),
  ] },
  { value: 'objective', label: 'Update objective', description: 'Uses the objective id from the template or studio.', params: [
    textParam('id', 'Objective id', 'objective-1'), numberParam('progress', 'Progress', 1, 0, 9999),
  ] },
  { value: 'rule', label: 'Change world rule', description: '', params: [
    { key: 'rule', label: 'Rule', type: 'select', defaultValue: 'mobSpawning', options: [
      { value: 'keepInventory', label: 'Keep inventory' }, { value: 'mobSpawning', label: 'Mob spawning' },
      { value: 'hunger', label: 'Hunger' }, { value: 'allowFlight', label: 'Allow flight' },
      { value: 'invulnerable', label: 'Invulnerable' }, { value: 'naturalRegen', label: 'Natural regen' },
      { value: 'dayCycle', label: 'Day cycle' }, { value: 'fallDamage', label: 'Fall damage' },
      { value: 'blockBreaking', label: 'Block breaking' }, { value: 'blockPlacing', label: 'Block placing' },
      { value: 'dropItems', label: 'Drop items' }, { value: 'pvp', label: 'PvP' },
    ] },
    { key: 'value', label: 'Enabled', type: 'checkbox', defaultValue: true },
  ] },
  { value: 'boost', label: 'Boost speed / vehicle', description: '', params: [numberParam('amount', 'Boost', 8, 0, 60)] },
  { value: 'wait', label: 'Wait, then continue', description: 'Delays all later actions in this rule.', params: [numberParam('seconds', 'Seconds', 1, 0.1, 60)] },
];

export function makeId(prefix = 'script'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-3)}`;
}

export function defaultParams(catalog: ScriptCatalogEntry[]): Record<string, ScriptParamValue> {
  const params: Record<string, ScriptParamValue> = {};
  for (const entry of catalog) for (const param of entry.params) if (param.defaultValue !== undefined) params[param.key] = param.defaultValue;
  return params;
}

export function createRule(event: ScriptEventType = 'start'): ScriptRule {
  const eventSpec = SCRIPT_EVENTS.find((entry) => entry.value === event) ?? SCRIPT_EVENTS[0];
  const actionSpec = SCRIPT_ACTIONS[0];
  return {
    id: makeId('rule'),
    name: 'New rule',
    enabled: true,
    event: { type: event, params: defaultParams([eventSpec]) },
    conditions: [],
    actions: [{ id: makeId('action'), type: 'say', params: defaultParams([actionSpec]) }],
  };
}

export function emptyScriptProject(): ScriptProject {
  return { version: 1, enabled: true, rules: [], variables: {}, source: '', updatedAt: Date.now() };
}

export function normalizeScriptProject(raw: unknown): ScriptProject {
  const base = emptyScriptProject();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<ScriptProject>;
  const rules = Array.isArray(data.rules) ? data.rules.filter((rule) => rule && typeof rule === 'object') : [];
  return {
    version: 1,
    enabled: data.enabled !== false,
    rules: rules.map((rule) => ({
      id: typeof rule.id === 'string' ? rule.id : makeId('rule'),
      name: typeof rule.name === 'string' ? rule.name : 'Rule',
      enabled: rule.enabled !== false,
      event: rule.event && typeof rule.event.type === 'string'
        ? { type: rule.event.type, params: rule.event.params ?? {} }
        : { type: 'start', params: {} },
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      actions: Array.isArray(rule.actions) ? rule.actions : [],
      once: rule.once === true,
    })),
    variables: data.variables && typeof data.variables === 'object' ? data.variables : {},
    source: typeof data.source === 'string' ? data.source : '',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}

export function serializeRule(rule: ScriptRule): string {
  return JSON.stringify(rule);
}
