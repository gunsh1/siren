export type StanceId = 'stand' | 'crouch' | 'prone'

export interface StanceProfile {
  /** Capsule height in metres. */
  height: number
  /** Eye/camera focus height. */
  eye: number
  walkSpeed: number
  runSpeed: number
  /** Multiplier on the noise a footstep makes. */
  noise: number
  /** How large a target the player is to shibito vision, 0..1. */
  visibility: number
  /** Seconds to change into this stance. */
  transition: number
}

/**
 * One table drives movement, audibility and visibility. Tuning stealth means
 * editing these numbers and nothing else.
 */
export const STANCES: Record<StanceId, StanceProfile> = {
  stand: { height: 1.72, eye: 1.55, walkSpeed: 1.9, runSpeed: 4.6, noise: 1.0, visibility: 1.0, transition: 0.25 },
  crouch: { height: 1.05, eye: 0.95, walkSpeed: 1.0, runSpeed: 1.6, noise: 0.42, visibility: 0.55, transition: 0.3 },
  prone: { height: 0.45, eye: 0.35, walkSpeed: 0.45, runSpeed: 0.6, noise: 0.14, visibility: 0.22, transition: 0.55 },
}

export const STANCE_ORDER: StanceId[] = ['stand', 'crouch', 'prone']
