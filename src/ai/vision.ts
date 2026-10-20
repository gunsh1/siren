import * as THREE from 'three'

export interface VisionParams {
  /** Full horizontal cone in degrees. Shibito are not owls - keep it human. */
  fovDeg: number
  /** Distance at which detection rate reaches zero. */
  range: number
  eyeHeight: number
  /** Radius inside which they notice you regardless of facing. */
  proximity: number
}

export const DEFAULT_VISION: VisionParams = {
  fovDeg: 104,
  range: 26,
  eyeHeight: 1.5,
  proximity: 2.2,
}

export interface VisionTarget {
  position: THREE.Vector3
  /** Stance visibility 0..1. */
  visibility: number
  /** 0..1 how lit the target is - flashlight on is a beacon. */
  light: number
  /** Horizontal speed, m/s. Movement catches the eye. */
  speed: number
}

export interface VisionResult {
  /** True when nothing blocks the line and the target is inside the cone. */
  inSight: boolean
  distance: number
  /** Awareness gained per second, 0 when unseen. */
  rate: number
}

const _toTarget = new THREE.Vector3()
const _eye = new THREE.Vector3()
const _head = new THREE.Vector3()

/**
 * Detection is a rate, not a boolean. A shibito that glimpses you across the
 * field takes seconds to be sure; one two metres away is instant. That ramp is
 * the whole feel of the stealth, so it lives in one pure function that the
 * headless check can sweep across distance/stance/light.
 */
export function sampleVision(
  eyePos: THREE.Vector3,
  facingYaw: number,
  target: VisionTarget,
  params: VisionParams,
  isBlocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
): VisionResult {
  _eye.copy(eyePos)
  _eye.y += params.eyeHeight
  // Aim at the target's centre of mass, not their feet.
  _head.copy(target.position)
  _head.y += 0.35 + target.visibility * 0.7

  _toTarget.copy(_head).sub(_eye)
  const distance = _toTarget.length()
  if (distance > params.range) return { inSight: false, distance, rate: 0 }

  const forward = new THREE.Vector3(-Math.sin(facingYaw), 0, -Math.cos(facingYaw))
  const flat = new THREE.Vector3(_toTarget.x, 0, _toTarget.z)
  const flatLen = flat.length() || 1e-5
  const cos = flat.dot(forward) / flatLen
  const halfFov = Math.cos(THREE.MathUtils.degToRad(params.fovDeg / 2))

  const nearby = distance <= params.proximity
  if (!nearby && cos < halfFov) return { inSight: false, distance, rate: 0 }

  if (isBlocked(_eye, _head)) return { inSight: false, distance, rate: 0 }

  // Centre of vision is far more sensitive than the edge of the cone.
  const angleTerm = nearby ? 1 : THREE.MathUtils.smoothstep(cos, halfFov, 1) * 0.65 + 0.35
  const distTerm = 1 - Math.pow(THREE.MathUtils.clamp(distance / params.range, 0, 1), 0.7)
  const lightTerm = 0.18 + target.light * 0.82
  const motionTerm = 0.55 + THREE.MathUtils.clamp(target.speed / 4.5, 0, 1) * 0.75

  const rate = 1.85 * angleTerm * distTerm * lightTerm * motionTerm * target.visibility
  return { inSight: true, distance, rate: Math.max(rate, 0) }
}

/** Awareness meter shared by every shibito. */
export class Awareness {
  value = 0
  /** Above this they start investigating. */
  static readonly SUSPICIOUS = 0.32
  /** At 1 they have you. */
  static readonly DETECTED = 1

  /** @returns true on the frame detection completes. */
  update(dt: number, rate: number): boolean {
    const was = this.value
    if (rate > 0) {
      this.value = Math.min(1, this.value + rate * dt)
    } else {
      // Losing you is much slower than finding you - they keep looking.
      const decay = this.value > Awareness.SUSPICIOUS ? 0.16 : 0.34
      this.value = Math.max(0, this.value - decay * dt)
    }
    return was < Awareness.DETECTED && this.value >= Awareness.DETECTED
  }

  get suspicious(): boolean { return this.value >= Awareness.SUSPICIOUS }
  get detected(): boolean { return this.value >= Awareness.DETECTED }
  reset(): void { this.value = 0 }
}
