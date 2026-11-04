import type { Game } from './Game';

/**
 * On-screen controls for touch devices (phones, tablets and touch laptops).
 *
 * The left thumbstick writes the same WASD state the keyboard uses, the right
 * half of the screen drives the look deltas, and the action buttons pulse the
 * mouse buttons used by the normal gameplay code. This keeps mobile builds in
 * sync with desktop mechanics without a second input path.
 */
export class TouchControls {
  readonly el: HTMLDivElement;
  readonly enabled: boolean;

  private game: Game;
  private stickEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  private lookEl: HTMLDivElement;
  private stickPointer: number | null = null;
  private lookPointer: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private stickKeys = new Set<string>();
  private jumpHeld = false;
  private mineHeld = false;

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('touch');
    const coarse = window.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false;
    const coarseAny = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.enabled = forced === '1' ? true : forced === '0' ? false : coarse || (coarseAny && navigator.maxTouchPoints > 0);
    this.game.input.touchMode = this.enabled;

    this.el = document.createElement('div');
    this.el.className = `touch-controls${this.enabled ? '' : ' hidden'}`;
    this.el.innerHTML = `
      <div class="touch-look" data-touch-look aria-hidden="true"></div>
      <div class="touch-stick" data-touch-stick aria-label="Movement joystick">
        <div class="touch-stick-ring"></div>
        <div class="touch-stick-knob" data-touch-knob></div>
      </div>
      <div class="touch-actions">
        <div class="touch-row">
          <button class="touch-btn small" data-touch="bag" aria-label="Inventory">▣</button>
          <button class="touch-btn small" data-touch="view" aria-label="Change camera">◉</button>
          <button class="touch-btn small" data-touch="car" aria-label="Toggle vehicle">⛟</button>
          <button class="touch-btn small" data-touch="pause" aria-label="Pause menu">☰</button>
        </div>
        <div class="touch-row">
          <button class="touch-btn" data-touch="place" aria-label="Place or use">✚</button>
          <button class="touch-btn mine" data-touch="mine" aria-label="Mine or attack">⛏</button>
          <button class="touch-btn jump" data-touch="jump" aria-label="Jump">⤒</button>
        </div>
      </div>
    `;
    root.appendChild(this.el);

    this.stickEl = this.el.querySelector('[data-touch-stick]') as HTMLDivElement;
    this.knobEl = this.el.querySelector('[data-touch-knob]') as HTMLDivElement;
    this.lookEl = this.el.querySelector('[data-touch-look]') as HTMLDivElement;
    this.bind();
  }

  setActive(active: boolean): void {
    if (!this.enabled) return;
    const visible =
      active && this.game.started && !this.game.ended && !this.game.uiOpen && !this.game.paused && !this.game.studioOpen;
    this.el.classList.toggle('hidden', !visible);
    if (!visible) this.releaseAll();
  }

  private bind(): void {
    this.stickEl.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.stickPointer = event.pointerId;
      this.capture(this.stickEl, event.pointerId);
      this.updateStick(event);
    });
    this.stickEl.addEventListener('pointermove', (event) => {
      if (this.stickPointer !== event.pointerId) return;
      event.preventDefault();
      this.updateStick(event);
    });
    const endStick = (event: PointerEvent) => {
      if (this.stickPointer !== event.pointerId) return;
      this.stickPointer = null;
      this.releaseStick();
    };
    this.stickEl.addEventListener('pointerup', endStick);
    this.stickEl.addEventListener('pointercancel', endStick);

    this.lookEl.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.lookPointer = event.pointerId;
      this.capture(this.lookEl, event.pointerId);
      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
    });
    this.lookEl.addEventListener('pointermove', (event) => {
      if (this.lookPointer !== event.pointerId) return;
      event.preventDefault();
      const dx = event.clientX - this.lastLookX;
      const dy = event.clientY - this.lastLookY;
      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
      this.game.input.mouse.dx += dx * 1.7;
      this.game.input.mouse.dy += dy * 1.7;
    });
    const endLook = (event: PointerEvent) => {
      if (this.lookPointer !== event.pointerId) return;
      this.lookPointer = null;
    };
    this.lookEl.addEventListener('pointerup', endLook);
    this.lookEl.addEventListener('pointercancel', endLook);

    this.el.querySelectorAll<HTMLElement>('[data-touch]').forEach((button) => {
      const action = button.dataset.touch;
      button.addEventListener('pointerdown', (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        event.stopPropagation();
        button.classList.add('active');
        this.press(action, button);
      });
      const release = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        button.classList.remove('active');
        this.release(action);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', (event) => {
        if (event.buttons !== 0) release(event);
      });
    });
  }

  private capture(element: HTMLElement, pointerId: number): void {
    try {
      element.setPointerCapture?.(pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; dragging
      // still works because the move handlers accept the pointer id.
    }
  }

  private updateStick(event: PointerEvent): void {
    const rect = this.stickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const radius = rect.width * 0.34;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / radius;
    const ny = dy / radius;
    const deadzone = 0.18;

    this.setStickKey('KeyW', ny < -deadzone);
    this.setStickKey('KeyS', ny > deadzone);
    this.setStickKey('KeyA', nx < -deadzone);
    this.setStickKey('KeyD', nx > deadzone);
    this.setStickKey('ShiftLeft', Math.hypot(nx, ny) > 0.92);
  }

  private setStickKey(code: string, down: boolean): void {
    if (down && !this.stickKeys.has(code)) {
      this.stickKeys.add(code);
      this.game.input.keys.add(code);
    } else if (!down && this.stickKeys.has(code)) {
      this.stickKeys.delete(code);
      this.game.input.keys.delete(code);
    }
  }

  private releaseStick(): void {
    for (const code of this.stickKeys) this.game.input.keys.delete(code);
    this.stickKeys.clear();
    this.knobEl.style.transform = 'translate(0px, 0px)';
  }

  private press(action: string | undefined, _button: HTMLElement): void {
    const input = this.game.input;
    if (action === 'jump') {
      this.jumpHeld = true;
      input.keys.add('Space');
      input.pressed.add('Space');
    } else if (action === 'mine') {
      this.mineHeld = true;
      input.mouse.left = true;
      input.mousePressed.add(0);
    } else if (action === 'place') {
      input.mouse.right = true;
      input.mousePressed.add(2);
    } else if (action === 'bag') {
      this.game.openInventory();
    } else if (action === 'view') {
      this.game.cycleCameraMode();
    } else if (action === 'car') {
      this.game.toggleVehicle();
    } else if (action === 'pause') {
      this.game.requestPause();
    }
  }

  private release(action: string | undefined): void {
    const input = this.game.input;
    if (action === 'jump') {
      this.jumpHeld = false;
      input.keys.delete('Space');
    } else if (action === 'mine') {
      this.mineHeld = false;
      input.mouse.left = false;
    } else if (action === 'place') {
      input.mouse.right = false;
    }
  }

  private releaseAll(): void {
    this.releaseStick();
    if (this.jumpHeld) this.game.input.keys.delete('Space');
    if (this.mineHeld) this.game.input.mouse.left = false;
    this.jumpHeld = false;
    this.mineHeld = false;
    this.game.input.mouse.right = false;
  }
}
