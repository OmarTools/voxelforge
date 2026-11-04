/**
 * Keyboard + mouse state. Game actions are sampled per frame.
 * UI key handling lives in the UI layer; this class only tracks raw state.
 */
export class Input {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly mouse = { x: 0, y: 0, dx: 0, dy: 0, left: false, right: false, middle: false };
  readonly mousePressed = new Set<number>();
  wheel = 0;
  locked = false;
  enabled = true;
  /**
   * Touch devices use on-screen controls and never take pointer lock. Look
   * deltas are written directly into `mouse.dx/dy` by the touch overlay.
   */
  touchMode = false;

  private canvas: HTMLCanvasElement;
  private listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions?]> = [];
  private onLockChange?: (locked: boolean) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bind();
  }

  private bind() {
    const add = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      this.listeners.push([target, type, fn, opts]);
    };

    add(window, 'keydown', ((e: KeyboardEvent) => {
      if (!this.enabled) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (['Space', 'Tab', 'F1', 'F3', 'F5'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    }) as EventListener);

    add(window, 'keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
    }) as EventListener);

    add(window, 'blur', (() => {
      this.keys.clear();
      this.mouse.left = false;
      this.mouse.right = false;
      this.mouse.middle = false;
    }) as EventListener);

    add(this.canvas, 'mousedown', ((e: MouseEvent) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 1) this.mouse.middle = true;
      if (e.button === 2) this.mouse.right = true;
      this.mousePressed.add(e.button);
    }) as EventListener);

    add(window, 'mouseup', ((e: MouseEvent) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 1) this.mouse.middle = false;
      if (e.button === 2) this.mouse.right = false;
    }) as EventListener);

    add(window, 'mousemove', ((e: MouseEvent) => {
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.locked) {
        this.mouse.dx += dx;
        this.mouse.dy += dy;
      }
    }) as EventListener);

    add(this.canvas, 'wheel', ((e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }) as EventListener, { passive: false });

    add(this.canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);

    add(document, 'pointerlockchange', (() => {
      this.locked = document.pointerLockElement === this.canvas;
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.onLockChange?.(this.locked);
    }) as EventListener);
  }

  setLockListener(fn: (locked: boolean) => void) {
    this.onLockChange = fn;
  }

  requestLock() {
    if (this.touchMode) return;
    if (!this.locked) {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  consume(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  consumeMouse(button: number): boolean {
    if (!this.mousePressed.has(button)) return false;
    this.mousePressed.delete(button);
    return true;
  }

  takeLook(): { dx: number; dy: number } {
    const result = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return result;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.wheel = 0;
  }

  destroy() {
    for (const [target, type, fn, opts] of this.listeners) {
      target.removeEventListener(type, fn, opts);
    }
    this.listeners = [];
  }
}
