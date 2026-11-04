import type { Game } from './Game';
import {
  SCRIPT_ACTIONS,
  SCRIPT_CONDITIONS,
  SCRIPT_EVENTS,
  createRule,
  defaultParams,
  normalizeScriptProject,
  type ScriptAction,
  type ScriptCatalogEntry,
  type ScriptCondition,
  type ScriptParamSpec,
  type ScriptParamValue,
  type ScriptProject,
  type ScriptRule,
} from '../scripting/ScriptTypes';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

const CODE_EXAMPLES: Array<{ label: string; code: string }> = [
  {
    label: 'Wave defense',
    code: `onStart(() => {
  say('Hold the line. Hostiles inbound.', 'warn');
  setVar('wave', 0);
});

every(20, () => {
  addVar('wave', 1);
  const wave = getVar('wave');
  say('Wave ' + wave + ' incoming!', 'bad');
  for (let i = 0; i < 2 + wave; i++) {
    spawn('human:zombie_walker', Math.random() * 12 - 6, 0, Math.random() * 12 - 6);
  }
});

onEvent('kill', () => {
  addVar('kills', 1);
  give('coin', 1);
});
`,
  },
  {
    label: 'Platformer coins',
    code: `onStart(() => {
  say('Collect 10 coins and reach the flag!', 'good');
  setVar('coins', 0);
});

onEvent('collect', (event) => {
  if (event.item !== 'coin') return;
  addVar('coins', 1);
  if (getVar('coins') >= 10) {
    say('All coins collected!', 'good');
    win('Course cleared!');
  }
});

onEvent('respawn', () => {
  say('Back to the checkpoint.', 'info');
  camera('side');
});
`,
  },
  {
    label: 'Racing start',
    code: `onStart(() => {
  camera('third');
  say('3... 2... 1... GO!', 'good');
});

onEvent('key', (event) => {
  if (event.key === 'KeyR') {
    teleport(-38, 2, 0);
    say('Back to the grid.', 'info');
  }
});
`,
  },
];

export class ScriptUI {
  private readonly game: Game;
  private readonly el: HTMLDivElement;
  private project: ScriptProject = normalizeScriptProject(null);
  private onChange?: (project: ScriptProject) => void;
  private onCloseCallback?: () => void;
  private selectedId: string | null = null;
  private tab: 'blocks' | 'code' | 'variables' = 'blocks';
  private listEl!: HTMLElement;
  private editorEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private openState = false;

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'overlay script-overlay hidden';
    this.el.innerHTML = `
      <div class="modal script-modal" role="dialog" aria-label="Script Studio">
        <div class="modal-head">
          <div>
            <h3>Script Studio</h3>
            <div class="sub">Visual rules, VoxelScript code and saved variables</div>
          </div>
          <div class="spacer"></div>
          <div class="script-tabs">
            <button class="script-tab active" data-script-tab="blocks">Blocks</button>
            <button class="script-tab" data-script-tab="code">Code</button>
            <button class="script-tab" data-script-tab="variables">Variables</button>
          </div>
          <button class="close-x" data-script-close>✕</button>
        </div>
        <div class="script-body">
          <aside class="script-list" data-script-list></aside>
          <section class="script-editor" data-script-editor></section>
        </div>
        <div class="script-foot">
          <span class="script-status" data-script-status>Visual rules run alongside code.</span>
          <div class="spacer"></div>
          <button class="btn ghost small" data-script-duplicate>Duplicate</button>
          <button class="btn ghost small" data-script-delete>Delete</button>
          <button class="btn ghost small" data-script-add>+ New rule</button>
          <button class="btn primary small" data-script-apply>Apply &amp; Save</button>
        </div>
      </div>
    `;
    root.appendChild(this.el);
    this.listEl = this.must('[data-script-list]');
    this.editorEl = this.must('[data-script-editor]');
    this.statusEl = this.must('[data-script-status]');
    this.bind();
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(project: ScriptProject, onChange: (project: ScriptProject) => void, onClose?: () => void): void {
    this.project = normalizeScriptProject(clone(project));
    this.onChange = onChange;
    this.onCloseCallback = onClose;
    this.selectedId = this.project.rules[0]?.id ?? null;
    this.openState = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.el.classList.add('hidden');
    this.onCloseCallback?.();
  }

  private must<T extends HTMLElement = HTMLElement>(selector: string): T {
    const el = this.el.querySelector<T>(selector);
    if (!el) throw new Error(`ScriptUI: missing ${selector}`);
    return el;
  }

  private bind(): void {
    this.el.querySelector('[data-script-close]')?.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest<HTMLElement>('[data-script-tab]');
      if (tab) {
        this.tab = (tab.dataset.scriptTab as typeof this.tab) ?? 'blocks';
        this.render();
        return;
      }
      if (target.closest('[data-script-add]')) {
        this.addRule();
        return;
      }
      if (target.closest('[data-script-delete]')) {
        this.deleteRule();
        return;
      }
      if (target.closest('[data-script-duplicate]')) {
        this.duplicateRule();
        return;
      }
      if (target.closest('[data-script-apply]')) {
        this.apply();
        return;
      }
      if (target.closest('[data-code-example]')) {
        this.insertExample(target.closest<HTMLElement>('[data-code-example]')?.dataset.codeExample ?? '');
        return;
      }
      if (target.closest('[data-cond-add]')) {
        this.addCondition();
        return;
      }
      if (target.closest('[data-act-add]')) {
        this.addAction();
        return;
      }
      if (target.closest('[data-cond-remove]')) {
        this.removeCondition(target.closest<HTMLElement>('[data-cond-remove]')?.dataset.condRemove ?? '');
        return;
      }
      if (target.closest('[data-act-remove]')) {
        this.removeAction(target.closest<HTMLElement>('[data-act-remove]')?.dataset.actRemove ?? '');
        return;
      }
      if (target.closest('[data-rule-card]')) {
        this.selectedId = target.closest<HTMLElement>('[data-rule-card]')?.dataset.ruleCard ?? null;
        this.render();
        return;
      }
      if (target.closest('[data-var-add]')) {
        this.addVariable();
        return;
      }
      if (target.closest('[data-var-remove]')) {
        this.removeVariable(target.closest<HTMLElement>('[data-var-remove]')?.dataset.varRemove ?? '');
        return;
      }
      if (target.closest('[data-var-apply]')) {
        this.applyVariables();
        return;
      }
    });

    this.el.addEventListener('input', (event) => this.handleInput(event.target as HTMLInputElement));
    this.el.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      this.handleInput(target);
      if (target.matches('[data-event-type], [data-cond-type], [data-act-type]')) this.renderEditor();
      if (target.matches('[data-rule-enabled]')) this.renderList();
    });
  }

  private handleInput(target: HTMLInputElement): void {
    if (target.matches('[data-script-source]')) {
      this.project.source = target.value;
      this.statusEl.textContent = 'Code changed. Press Apply & Save to run it.';
      return;
    }
    if (target.matches('[data-rule-name]')) {
      const rule = this.selectedRule();
      if (!rule) return;
      rule.name = target.value || 'Rule';
      this.renderList();
      return;
    }
    if (target.matches('[data-rule-enabled]')) {
      const rule = this.selectedRule();
      if (rule) rule.enabled = target.checked;
      return;
    }
    if (target.matches('[data-rule-once]')) {
      const rule = this.selectedRule();
      if (rule) rule.once = target.checked;
      return;
    }
    if (target.matches('[data-event-type]')) {
      const rule = this.selectedRule();
      if (!rule) return;
      rule.event.type = target.value as ScriptRule['event']['type'];
      rule.event.params = defaultParams(this.eventCatalog(rule.event.type));
      return;
    }
    if (target.matches('[data-cond-type]')) {
      const condition = this.selectedRule()?.conditions.find((entry) => entry.id === target.dataset.condType);
      if (!condition) return;
      condition.type = target.value as ScriptCondition['type'];
      condition.params = defaultParams(this.conditionCatalog(condition.type));
      return;
    }
    if (target.matches('[data-act-type]')) {
      const action = this.selectedRule()?.actions.find((entry) => entry.id === target.dataset.actType);
      if (!action) return;
      action.type = target.value as ScriptAction['type'];
      action.params = defaultParams(this.actionCatalog(action.type));
      return;
    }
    const scope = target.dataset.scope;
    if (!scope) return;
    let params: Record<string, ScriptParamValue> | undefined;
    if (scope === 'event') params = this.selectedRule()?.event.params;
    else if (scope === 'condition') params = this.selectedRule()?.conditions.find((entry) => entry.id === target.dataset.id)?.params;
    else if (scope === 'action') params = this.selectedRule()?.actions.find((entry) => entry.id === target.dataset.id)?.params;
    else if (scope === 'variable') {
      // Handled by the explicit variables apply button.
      return;
    }
    if (!params || !target.dataset.param) return;
    params[target.dataset.param] = this.readValue(target);
  }

  private readValue(input: HTMLInputElement): ScriptParamValue {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number') return Number(input.value) || 0;
    return input.value;
  }

  private selectedRule(): ScriptRule | undefined {
    return this.project.rules.find((rule) => rule.id === this.selectedId);
  }

  private addRule(): void {
    const rule = createRule('start');
    this.project.rules.push(rule);
    this.selectedId = rule.id;
    this.tab = 'blocks';
    this.render();
  }

  private deleteRule(): void {
    if (!this.selectedId) return;
    this.project.rules = this.project.rules.filter((rule) => rule.id !== this.selectedId);
    this.selectedId = this.project.rules[0]?.id ?? null;
    this.render();
  }

  private duplicateRule(): void {
    const rule = this.selectedRule();
    if (!rule) return;
    const copy = clone(rule);
    copy.id = createRule(rule.event.type).id;
    copy.name = `${rule.name} copy`;
    this.project.rules.push(copy);
    this.selectedId = copy.id;
    this.render();
  }

  private addCondition(): void {
    const rule = this.selectedRule();
    if (!rule) return;
    const spec = SCRIPT_CONDITIONS[0];
    rule.conditions.push({ id: createRule().id.replace('rule', 'cond'), type: spec.value as ScriptCondition['type'], params: defaultParams([spec]) });
    this.renderEditor();
  }

  private addAction(): void {
    const rule = this.selectedRule();
    if (!rule) return;
    const spec = SCRIPT_ACTIONS[0];
    rule.actions.push({ id: createRule().id.replace('rule', 'act'), type: spec.value as ScriptAction['type'], params: defaultParams([spec]) });
    this.renderEditor();
  }

  private removeCondition(id: string): void {
    const rule = this.selectedRule();
    if (!rule) return;
    rule.conditions = rule.conditions.filter((condition) => condition.id !== id);
    this.renderEditor();
  }

  private removeAction(id: string): void {
    const rule = this.selectedRule();
    if (!rule) return;
    rule.actions = rule.actions.filter((action) => action.id !== id);
    this.renderEditor();
  }

  private addVariable(): void {
    const name = `var${Object.keys(this.variables()).length + 1}`;
    this.variables()[name] = 0;
    this.renderVariables();
  }

  private removeVariable(name: string): void {
    delete this.variables()[name];
    this.renderVariables();
  }

  private variables(): Record<string, number> {
    return this.project.variables ?? {};
  }

  private applyVariables(): void {
    const next: Record<string, number> = {};
    this.editorEl.querySelectorAll<HTMLInputElement>('[data-var-name]').forEach((input) => {
      const name = input.value.trim();
      if (!name) return;
      next[name] = Number(this.editorEl.querySelector<HTMLInputElement>(`[data-var-value="${CSS.escape(name)}"]`)?.value ?? 0) || 0;
    });
    this.project.variables = next;
    this.apply();
  }

  private insertExample(index: string): void {
    const example = CODE_EXAMPLES[Number(index)];
    if (!example) return;
    this.project.source = example.code;
    const textarea = this.editorEl.querySelector<HTMLTextAreaElement>('[data-script-source]');
    if (textarea) textarea.value = example.code;
    this.statusEl.textContent = `Loaded “${example.label}” example. Press Apply & Save.`;
  }

  private apply(): void {
    this.project.updatedAt = Date.now();
    this.onChange?.(clone(this.project));
    const error = this.game.scripts?.getCompileError() ?? '';
    this.statusEl.textContent = error ? `Script error: ${error}` : 'Applied. Rules and code are live.';
    this.statusEl.classList.toggle('bad', !!error);
    if (!error) this.game.toast('Scripts applied.', 'good');
  }

  private eventCatalog(type: string): ScriptCatalogEntry[] {
    return SCRIPT_EVENTS.filter((entry) => entry.value === type);
  }

  private conditionCatalog(type: string): ScriptCatalogEntry[] {
    return SCRIPT_CONDITIONS.filter((entry) => entry.value === type);
  }

  private actionCatalog(type: string): ScriptCatalogEntry[] {
    return SCRIPT_ACTIONS.filter((entry) => entry.value === type);
  }

  private render(): void {
    this.el.querySelectorAll<HTMLElement>('[data-script-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.scriptTab === this.tab);
    });
    const showList = this.tab === 'blocks';
    this.listEl.style.display = showList ? '' : 'none';
    this.editorEl.classList.toggle('wide', !showList);
    this.renderList();
    if (this.tab === 'blocks') this.renderEditor();
    else if (this.tab === 'code') this.renderCode();
    else this.renderVariables();
  }

  private renderList(): void {
    const rules = this.project.rules;
    this.listEl.innerHTML = `
      <div class="script-list-head">
        <span>Rules <b>${rules.length}</b></span>
        <span class="script-list-hint">${this.project.enabled ? 'Live' : 'Paused'}</span>
      </div>
      ${rules.length === 0 ? '<div class="script-empty">No visual rules yet.<br/>Press <b>+ New rule</b>.</div>' : ''}
      ${rules.map((rule) => {
        const event = SCRIPT_EVENTS.find((entry) => entry.value === rule.event.type);
        return `<button class="script-rule-card ${rule.id === this.selectedId ? 'active' : ''}" data-rule-card="${escapeHtml(rule.id)}">
          <span class="script-rule-dot ${rule.enabled ? 'on' : ''}"></span>
          <span class="script-rule-copy"><b>${escapeHtml(rule.name)}</b><small>${escapeHtml(event?.label ?? rule.event.type)}</small></span>
          <span class="script-rule-count">${rule.actions.length}</span>
        </button>`;
      }).join('')}
    `;
  }

  private renderEditor(): void {
    const rule = this.selectedRule();
    if (!rule) {
      this.editorEl.innerHTML = `<div class="script-empty large">
        <div class="script-empty-glyph">⌘</div>
        <h4>No rule selected</h4>
        <p>Create a visual rule, or switch to <b>Code</b> and write VoxelScript.</p>
        <button class="btn primary small" data-script-add>+ New rule</button>
      </div>`;
      return;
    }
    const eventSpec = SCRIPT_EVENTS.find((entry) => entry.value === rule.event.type) ?? SCRIPT_EVENTS[0];
    this.editorEl.innerHTML = `
      <div class="script-rule-head">
        <input class="input script-rule-name" data-rule-name value="${escapeHtml(rule.name)}" aria-label="Rule name">
        <label class="script-check"><input type="checkbox" data-rule-enabled ${rule.enabled ? 'checked' : ''}/> Enabled</label>
        <label class="script-check"><input type="checkbox" data-rule-once ${rule.once ? 'checked' : ''}/> Once</label>
      </div>
      <div class="script-block event-block">
        <div class="script-block-tag">WHEN</div>
        <div class="script-block-body">
          <select class="input script-select" data-event-type aria-label="Event">
            ${SCRIPT_EVENTS.map((entry) => `<option value="${entry.value}" ${entry.value === rule.event.type ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}
          </select>
          ${this.renderParams(eventSpec.params, rule.event.params, 'event')}
        </div>
      </div>
      <div class="script-section-head"><span>Conditions</span><button class="mini-btn" data-cond-add>+ IF</button></div>
      ${rule.conditions.length === 0 ? '<div class="script-none">Always run.</div>' : rule.conditions.map((condition) => {
        const spec = SCRIPT_CONDITIONS.find((entry) => entry.value === condition.type) ?? SCRIPT_CONDITIONS[0];
        return `<div class="script-block condition-block">
          <div class="script-block-tag">IF</div>
          <div class="script-block-body">
            <select class="input script-select" data-cond-type="${escapeHtml(condition.id)}">
              ${SCRIPT_CONDITIONS.map((entry) => `<option value="${entry.value}" ${entry.value === condition.type ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}
            </select>
            ${this.renderParams(spec.params, condition.params, 'condition', condition.id)}
            <button class="mini-btn danger" data-cond-remove="${escapeHtml(condition.id)}">✕</button>
          </div>
        </div>`;
      }).join('')}
      <div class="script-section-head"><span>Actions</span><button class="mini-btn" data-act-add>+ DO</button></div>
      ${rule.actions.length === 0 ? '<div class="script-none">No actions yet.</div>' : rule.actions.map((action) => {
        const spec = SCRIPT_ACTIONS.find((entry) => entry.value === action.type) ?? SCRIPT_ACTIONS[0];
        return `<div class="script-block action-block">
          <div class="script-block-tag">DO</div>
          <div class="script-block-body">
            <select class="input script-select" data-act-type="${escapeHtml(action.id)}">
              ${SCRIPT_ACTIONS.map((entry) => `<option value="${entry.value}" ${entry.value === action.type ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}
            </select>
            ${this.renderParams(spec.params, action.params, 'action', action.id)}
            <button class="mini-btn danger" data-act-remove="${escapeHtml(action.id)}">✕</button>
          </div>
        </div>`;
      }).join('')}
    `;
  }

  private renderParams(params: ScriptParamSpec[], values: Record<string, ScriptParamValue>, scope: string, id = ''): string {
    if (!params.length) return '';
    return `<div class="script-params">${params.map((param) => {
      const value = values[param.key] ?? param.defaultValue ?? '';
      const data = `data-scope="${scope}" ${id ? `data-id="${escapeHtml(id)}"` : ''} data-param="${escapeHtml(param.key)}"`;
      if (param.type === 'select') {
        return `<label class="script-param"><span>${escapeHtml(param.label)}</span><select class="input script-param-input" ${data}>
          ${(param.options ?? []).map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select></label>`;
      }
      if (param.type === 'checkbox') {
        return `<label class="script-param checkbox"><input type="checkbox" ${data} ${value ? 'checked' : ''}/><span>${escapeHtml(param.label)}</span></label>`;
      }
      return `<label class="script-param"><span>${escapeHtml(param.label)}</span><input class="input script-param-input" type="${param.type}" ${data} value="${escapeHtml(value)}" placeholder="${escapeHtml(param.placeholder ?? '')}" ${param.min !== undefined ? `min="${param.min}"` : ''} ${param.max !== undefined ? `max="${param.max}"` : ''} ${param.step !== undefined ? `step="${param.step}"` : ''}/></label>`;
    }).join('')}</div>`;
  }

  private renderCode(): void {
    this.editorEl.innerHTML = `
      <div class="script-code-head">
        <div>
          <h4>VoxelScript</h4>
          <p>JavaScript syntax with a safe game API. Runs alongside your visual rules.</p>
        </div>
        <div class="script-examples">
          ${CODE_EXAMPLES.map((example, index) => `<button class="mini-btn" data-code-example="${index}">${escapeHtml(example.label)}</button>`).join('')}
        </div>
      </div>
      <textarea class="script-code" data-script-source spellcheck="false" aria-label="VoxelScript code">${escapeHtml(this.project.source)}</textarea>
      <div class="script-api-help">
        <span><b>onStart(fn)</b></span><span><b>onTick(fn)</b></span><span><b>onEvent(name, fn)</b></span>
        <span><b>every(sec, fn)</b></span><span><b>say(text)</b></span><span><b>give(item, n)</b></span>
        <span><b>spawn(entity, x, y, z)</b></span><span><b>camera(mode)</b></span><span><b>win()</b></span>
        <span><b>setVar(name, n)</b></span><span><b>getVar(name)</b></span><span><b>player.x</b></span>
      </div>
      <div class="script-code-status ${this.game.scripts?.getCompileError() ? 'bad' : ''}">${escapeHtml(this.game.scripts?.getCompileError() || 'No compile errors.')}</div>
    `;
  }

  private renderVariables(): void {
    const entries = Object.entries(this.variables());
    this.editorEl.innerHTML = `
      <div class="script-code-head">
        <div>
          <h4>Variables</h4>
          <p>Numbers shared by visual rules and VoxelScript. Use them for score, waves, lives and timers.</p>
        </div>
        <button class="mini-btn" data-var-add>+ Add variable</button>
      </div>
      ${entries.length === 0 ? '<div class="script-empty">No variables yet.</div>' : `
        <div class="script-var-list">
          ${entries.map(([name, value]) => `<div class="script-var-row">
            <input class="input" data-var-name value="${escapeHtml(name)}" aria-label="Variable name"/>
            <input class="input" data-var-value="${escapeHtml(name)}" type="number" value="${value}" aria-label="Variable value"/>
            <button class="mini-btn danger" data-var-remove="${escapeHtml(name)}">✕</button>
          </div>`).join('')}
        </div>
        <button class="btn primary small" data-var-apply>Apply variables</button>
      `}
      <div class="script-api-help" style="margin-top:18px">
        <span><b>setVar('score', 0)</b></span><span><b>addVar('score', 1)</b></span><span><b>getVar('score')</b></span>
        <span><b>setVar(name, n)</b></span><span><b>variables.all()</b></span>
      </div>
    `;
  }
}
