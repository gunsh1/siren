import * as THREE from 'three'
import type { Input } from '../core/input'
import type { World } from '../world/world'
import type { CameraRig } from './cameraRig'
import { STANCES, type StanceId } from './stance'
import type { CharacterView } from '../anim/animatedActor'
import { CHARACTERS, placeholderView } from '../assets/actorRegistry'
import type { NoiseField } from './noise'
import { SURFACE_NOISE } from './noise'

const RADIUS = 0.32

/**
 * Camera-relative movement with stance, terrain following and footstep noise.
 * The controller is the single source of truth for where the player is and how
 * loud/visible they currently are; AI reads those fields directly.
 */
export class PlayerController {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  view: CharacterView
  stance: StanceId = 'stand'
  facing = 0
  speed = 0
  running = false
  alive = true
  surface: keyof typeof SURFACE_NOISE = 'dirt'
  /** Rises while walking, fires a footstep noise when it wraps. */
  private stepAccum = 0
  private stanceBlend = 1

  private tmpF = new THREE.Vector3()
  private tmpR = new THREE.Vector3()
  private wish = new THREE.Vector3()

  constructor(
    private world: World,
    private rig: CameraRig,
    private noise: NoiseField,
  ) {
    this.view = placeholderView(CHARACTERS.kyoya)
    world.scene.add(this.view.root)
  }

  /** Swap the placeholder for the real skinned model once it has loaded. */
  setView(view: CharacterView): void {
    this.world.scene.remove(this.view.root)
    this.view.dispose?.()
    this.view = view
    view.root.position.copy(this.position)
    view.root.rotation.y = this.facing
    this.world.scene.add(view.root)
  }

  get profile() { return STANCES[this.stance] }
  get eyeHeight() { return this.profile.eye }
  /** 0..1 - how easy this player is to see right now. */
  get visibility() { return this.profile.visibility }

  spawn(x: number, z: number, facing = 0): void {
    this.position.set(x, this.world.groundAt(x, z), z)
    this.facing = facing
    this.rig.yaw = facing
    this.rig.snap()
  }

  private cycleStance(input: Input): void {
    if (input.pressed('crouch')) {
      this.stance = this.stance === 'crouch' ? 'stand' : 'crouch'
      this.stanceBlend = 0
    }
    if (input.pressed('prone')) {
      this.stance = this.stance === 'prone' ? 'crouch' : 'prone'
      this.stanceBlend = 0
    }
  }

  update(dt: number, input: Input): void {
    if (!this.alive) return
    this.cycleStance(input)
    this.stanceBlend = Math.min(1, this.stanceBlend + dt / this.profile.transition)

    this.rig.forward(this.tmpF)
    this.rig.right(this.tmpR)
    this.wish.set(0, 0, 0)
    if (input.held('forward')) this.wish.add(this.tmpF)
    if (input.held('back')) this.wish.sub(this.tmpF)
    if (input.held('right')) this.wish.add(this.tmpR)
    if (input.held('left')) this.wish.sub(this.tmpR)

    const moving = this.wish.lengthSq() > 1e-4
    if (moving) this.wish.normalize()

    this.running = input.held('run') && this.stance !== 'prone'
    const target = this.running ? this.profile.runSpeed : this.profile.walkSpeed
    // Stance changes are not instant: you cannot dive prone and keep sprinting.
    const allowed = target * (0.35 + 0.65 * this.stanceBlend)
    const desired = moving ? allowed : 0

    const accel = moving ? 14 : 18
    const currentSpeed = this.velocity.length()
    const newSpeed = THREE.MathUtils.damp(currentSpeed, desired, accel, dt)
    if (moving) this.velocity.copy(this.wish).multiplyScalar(newSpeed)
    else this.velocity.multiplyScalar(newSpeed / Math.max(currentSpeed, 1e-5))

    this.position.addScaledVector(this.velocity, dt)
    this.world.collision.resolve(this.position, RADIUS, this.profile.height)
    this.position.y = this.world.groundAt(this.position.x, this.position.z)

    this.speed = Math.hypot(this.velocity.x, this.velocity.z)
    if (moving) {
      const want = Math.atan2(this.wish.x, this.wish.z)
      this.facing = dampAngle(this.facing, want, 12, dt)
    }

    this.emitFootsteps(dt)

    this.view.root.position.copy(this.position)
    this.view.root.rotation.y = this.facing
    this.view.update(dt, this.speed, this.stance)
  }

  private emitFootsteps(dt: number): void {
    if (this.speed < 0.2) { this.stepAccum = 0.6; return }
    const stepsPerSecond = this.speed / (this.stance === 'stand' ? 0.85 : 0.6)
    this.stepAccum += stepsPerSecond * dt
    if (this.stepAccum < 1) return
    this.stepAccum -= 1
    const loud = this.profile.noise * (SURFACE_NOISE[this.surface] ?? 0.7) * (this.running ? 1.5 : 1)
    this.noise.emit({
      position: this.position.clone(),
      radius: 4 + loud * 14,
      loudness: THREE.MathUtils.clamp(loud, 0, 1.5),
      source: 'footstep',
    })
  }
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}
