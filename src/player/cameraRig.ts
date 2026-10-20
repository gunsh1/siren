import * as THREE from 'three'
import type { CollisionWorld } from '../world/collision'

/**
 * Over-the-shoulder follow camera. Yaw/pitch come from the mouse; the camera
 * springs toward a point behind the player and pulls in when a wall is closer.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  yaw = 0
  pitch = -0.08
  distance = 2.75
  shoulder = 0.42
  sensitivity = 0.0022
  /** Overrides the eye-height focus point when set. Inspection only. */
  focusHeight: number | undefined = undefined
  private current = new THREE.Vector3()
  private desired = new THREE.Vector3()
  private focus = new THREE.Vector3()
  private initialised = false

  constructor() {
    // 55mm-ish. PS2 survival horror ran narrow FOVs; wide angles read as modern.
    this.camera = new THREE.PerspectiveCamera(52, 4 / 3, 0.1, 260)
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.sensitivity, -0.9, 0.55)
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize()
  }

  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize()
  }

  update(target: THREE.Vector3, eyeHeight: number, collision: CollisionWorld, dt: number): void {
    this.focus.set(target.x, target.y + (this.focusHeight ?? eyeHeight), target.z)

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    )
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    let dist = this.distance
    // Cheap wall avoidance: shorten the boom until the segment is clear.
    for (let i = 0; i < 6; i++) {
      this.desired.copy(this.focus).addScaledVector(dir, dist).addScaledVector(side, this.shoulder)
      if (!collision.blocked(this.focus, this.desired)) break
      dist *= 0.72
    }

    if (!this.initialised) { this.current.copy(this.desired); this.initialised = true }
    const lambda = 1 - Math.exp(-14 * dt)
    this.current.lerp(this.desired, lambda)

    this.camera.position.copy(this.current)
    this.camera.lookAt(this.focus)
  }

  snap(): void { this.initialised = false }
}
