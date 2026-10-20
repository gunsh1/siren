import * as THREE from 'three'

export interface NoiseEvent {
  position: THREE.Vector3
  /** Metres at which the sound is still meaningful. */
  radius: number
  /** 0..1, scales how strongly a shibito reacts. */
  loudness: number
  source: 'footstep' | 'door' | 'gunshot' | 'impact' | 'voice' | 'object'
}

/**
 * Central noise queue. Producers push, the AI drains it each fixed step.
 * Keeping it a queue (not a callback) makes headless replay deterministic.
 */
export class NoiseField {
  private pending: NoiseEvent[] = []
  readonly recent: NoiseEvent[] = []

  emit(e: NoiseEvent): void {
    this.pending.push(e)
  }

  drain(): NoiseEvent[] {
    const out = this.pending
    this.pending = []
    this.recent.length = 0
    this.recent.push(...out)
    return out
  }
}

/** Surface -> how loud a footstep on it is. */
export const SURFACE_NOISE: Record<string, number> = {
  dirt: 0.75,
  grass: 0.55,
  gravel: 1.0,
  wood: 0.95,
  tatami: 0.45,
  water: 1.15,
}
