import * as THREE from 'three'
import type { NoiseEvent } from '../player/noise'

export interface HearingParams {
  /** Multiplier on every noise radius. Deaf shibito are boring. */
  acuity: number
  /** Fraction of loudness that survives an opaque wall. */
  wallDamping: number
}

export const DEFAULT_HEARING: HearingParams = { acuity: 1, wallDamping: 0.45 }

export interface HeardNoise {
  position: THREE.Vector3
  strength: number
}

/**
 * Returns the strongest noise this listener can make out, or null.
 * Strength is what feeds the awareness meter, so a distant footstep nudges
 * them and a gunshot next door pins them.
 */
export function listen(
  earPos: THREE.Vector3,
  events: readonly NoiseEvent[],
  params: HearingParams,
  isBlocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
): HeardNoise | null {
  let best: HeardNoise | null = null
  for (const e of events) {
    const dist = earPos.distanceTo(e.position)
    const radius = e.radius * params.acuity
    if (dist > radius) continue
    let strength = e.loudness * (1 - dist / radius)
    if (isBlocked(earPos, e.position)) strength *= params.wallDamping
    if (strength <= 0.01) continue
    if (!best || strength > best.strength) {
      best = { position: e.position.clone(), strength }
    }
  }
  return best
}
