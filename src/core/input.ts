export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'run' | 'crouch' | 'prone' | 'pause'

const KEY_MAP: Record<string, Action> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyC: 'crouch',
  KeyZ: 'prone',
  Escape: 'pause',
}

/**
 * Keyboard + pointer-lock mouse. Every consumer reads through `held`/`pressed`
 * so headless checks can drive the game by poking the same state.
 */
export class Input {
  private down = new Set<Action>()
  private justDown = new Set<Action>()
  private justUp = new Set<Action>()
  mouseDX = 0
  mouseDY = 0
  pointerLocked = false
  /** Set true by headless checks to stop real events from interfering. */
  scripted = false

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.target
    })
    target.addEventListener('click', () => {
      if (!this.pointerLocked && !this.scripted) this.target.requestPointerLock()
    })
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.scripted) return
    const a = KEY_MAP[e.code]
    if (!a) return
    if (a !== 'pause') e.preventDefault()
    if (!this.down.has(a)) this.justDown.add(a)
    this.down.add(a)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (this.scripted) return
    const a = KEY_MAP[e.code]
    if (!a) return
    this.down.delete(a)
    this.justUp.add(a)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.scripted || !this.pointerLocked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }

  held(a: Action): boolean { return this.down.has(a) }
  pressed(a: Action): boolean { return this.justDown.has(a) }
  released(a: Action): boolean { return this.justUp.has(a) }

  /** Scripted drivers: force an action on/off. */
  set(a: Action, on: boolean): void {
    if (on) { if (!this.down.has(a)) this.justDown.add(a); this.down.add(a) }
    else { if (this.down.has(a)) this.justUp.add(a); this.down.delete(a) }
  }
  look(dx: number, dy: number): void { this.mouseDX += dx; this.mouseDY += dy }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.justDown.clear()
    this.justUp.clear()
    this.mouseDX = 0
    this.mouseDY = 0
  }
}
