import * as THREE from 'three'
import { Clock, FIXED_DT } from './core/time'
import { Input } from './core/input'
import { Ps2Renderer } from './render/renderer'
import { World, AMBIENCE } from './world/world'
import { CameraRig } from './player/cameraRig'
import { PlayerController } from './player/controller'
import { NoiseField } from './player/noise'
import { buildStage1 } from './world/stages/s1'
import { AnimationLibrary } from './anim/library'
import { CHARACTERS, loadCharacterView } from './assets/actorRegistry'

/**
 * Owns the fixed-step simulation and the render call. Keeping `stepFixed`
 * public and side-effect-free with respect to wall time is what lets the
 * headless checks run hundreds of deterministic steps in milliseconds.
 */
export class Game {
  readonly renderer: Ps2Renderer
  readonly input: Input
  readonly rig = new CameraRig()
  readonly noise = new NoiseField()
  world!: World
  player!: PlayerController
  frameCount = 0
  animations: AnimationLibrary | null = null
  /** Resolves once the real character has loaded, or failed to. */
  readonly charactersReady: Promise<void>
  private clock = new Clock()
  private running = true

  constructor(container: HTMLElement) {
    this.renderer = new Ps2Renderer(container)
    this.input = new Input(this.renderer.domElement)
    this.loadStage1()
    this.charactersReady = this.loadCharacters()
  }

  /**
   * Runs after the world is already playable. The placeholder body is on
   * screen from frame one, so a slow or missing model never blocks the game.
   */
  private async loadCharacters(): Promise<void> {
    try {
      this.animations = await AnimationLibrary.load()
    } catch (err) {
      console.warn('[anim] no animation database -', err)
      return
    }
    const view = await loadCharacterView(CHARACTERS.kyoya, this.animations)
    if (view) this.player.setView(view)
  }

  loadStage1(): void {
    const built = buildStage1()
    this.world = built.world
    this.player = new PlayerController(this.world, this.rig, this.noise)
    this.player.spawn(built.spawn.x, built.spawn.z, 0)
    this.rig.camera.aspect = 4 / 3
    this.rig.camera.updateProjectionMatrix()
  }

  setAmbience(name: string): void {
    const a = AMBIENCE[name]
    if (a) this.world.setAmbience(a)
  }

  /** One deterministic simulation step. Never reads wall time. */
  stepFixed(dt: number): void {
    this.rig.look(this.input.mouseDX, this.input.mouseDY)
    this.player.update(dt, this.input)
    this.noise.drain()
    this.rig.update(this.player.position, this.player.eyeHeight, this.world.collision, dt)
  }

  render(): void {
    this.renderer.draw(this.world.scene, this.rig.camera, this.world.ambience.clearColor)
    this.frameCount++
  }

  frame = (nowMs: number): void => {
    if (!this.running) return
    const steps = this.clock.advance(nowMs)
    for (let i = 0; i < steps; i++) this.stepFixed(FIXED_DT)
    if (steps === 0) {
      // Still consume look input so the camera is not stuck between steps.
      this.rig.update(this.player.position, this.player.eyeHeight, this.world.collision, 1 / 240)
    }
    this.input.endFrame()
    this.render()
    requestAnimationFrame(this.frame)
  }

  start(): void {
    requestAnimationFrame(this.frame)
  }

  stop(): void { this.running = false }
}

void THREE
