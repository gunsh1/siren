import type { AnimCategory, AnimEntry, Direction, Posture } from './types'

export interface AnimRequest {
  category: AnimCategory
  posture?: Posture
  /** Ground speed the character is actually moving at, m/s. */
  speed?: number
  direction?: Direction
  /** true = must loop cleanly, false = must be a one-shot, undefined = either. */
  loop?: boolean
  /**
   * Words that bias the choice without ever forcing it: 'zombie', 'injured',
   * 'rifle'. Matched against the file name. Deliberately a tiebreak only -
   * measurements decide whether a clip is usable at all.
   */
  flavour?: string[]
  /** Ids to avoid, so a repeated idle does not pick the same clip twice. */
  exclude?: string[]
}

export interface AnimPick {
  entry: AnimEntry
  /**
   * Playback rate that makes the clip's pace match the requested speed.
   * This is the whole reason speed is measured: play a 2.0 m/s walk at 0.7x
   * for a character moving 1.4 m/s and the feet stop skating.
   */
  timeScale: number
  score: number
  /** Why this clip won, for the debug overlay and the checks. */
  reason: string
}

/** Beyond this the clip stops reading as the same action. */
const MIN_TIME_SCALE = 0.55
const MAX_TIME_SCALE = 1.75

/** When the exact category has nothing, try these instead, in order. */
const FALLBACK: Partial<Record<AnimCategory, AnimCategory[]>> = {
  locomotion: ['idle'],
  turn: ['locomotion', 'idle'],
  idle: ['locomotion'],
  reaction: ['action', 'idle'],
  action: ['idle'],
  getUp: ['action', 'idle'],
  death: ['reaction', 'action'],
  jump: ['locomotion'],
  misc: ['idle'],
}

/**
 * @param wanted undefined when the caller does not care - an attack or a hit
 * reaction has no ground speed to match. Treating that as "wants 0 m/s" made
 * any clip whose feet shuffle slightly lose to one that stands perfectly
 * still, which is how a melee swing lost to a rifle idle.
 */
function speedScore(clipSpeed: number, wanted: number | undefined): number {
  if (wanted === undefined) return 0.5
  if (wanted <= 0.05) return clipSpeed <= 0.25 ? 1 : 0.2
  if (clipSpeed <= 0.05) return 0.35 // an in-place clip can be driven, badly
  const ratio = wanted / clipSpeed
  if (ratio < MIN_TIME_SCALE || ratio > MAX_TIME_SCALE) {
    // Reachable only by stretching the clip past where it looks right.
    return 0.25
  }
  // 1 when no retiming is needed, falling off as the stretch grows.
  return 1 - Math.min(Math.abs(Math.log(ratio)) / Math.log(MAX_TIME_SCALE), 1) * 0.6
}

function directionScore(clip: Direction, wanted: Direction | undefined): number {
  if (!wanted) return 0.5
  if (clip === wanted) return 1
  // In-place clips carry no direction of their own, so they fit anything -
  // the character's own facing does the work.
  if (clip === 'inPlace') return 0.7
  if (wanted === 'inPlace') return 0.3
  return 0
}

function flavourScore(entry: AnimEntry, flavour: string[] | undefined): number {
  if (!flavour?.length) return 0
  let hits = 0
  for (const want of flavour) {
    const w = want.toLowerCase()
    if (entry.keywords.some((k) => k === w || k.includes(w) || w.includes(k))) hits++
  }
  return hits / flavour.length
}

function scoreEntry(entry: AnimEntry, req: AnimRequest, categoryPenalty: number): AnimPick | null {
  if (req.exclude?.includes(entry.id)) return null
  if (req.posture && entry.posture !== req.posture) return null
  if (req.loop === true && !entry.loops) return null
  if (req.loop === false && entry.loops && entry.category !== 'action') return null

  const m = entry.measurements
  const wantedSpeed = req.speed
  const sSpeed = speedScore(m.effectiveSpeed, wantedSpeed)
  const sDir = directionScore(entry.direction, req.direction)
  const sFlavour = flavourScore(entry, req.flavour)
  const sQuality = req.loop === true ? m.loopScore : 0.5
  // A clean, regular gait beats a scrappy one when everything else is equal.
  const sGait = entry.category === 'locomotion' ? m.gaitRegularity : 0.5

  const score =
    sSpeed * 3 +
    sDir * 2 +
    sFlavour * 1.5 +
    sQuality * 1 +
    sGait * 0.5 -
    categoryPenalty

  let timeScale = 1
  if (wantedSpeed !== undefined && wantedSpeed > 0.05 && m.effectiveSpeed > 0.05) {
    timeScale = Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, wantedSpeed / m.effectiveSpeed))
  }

  const reason =
    `speed ${m.effectiveSpeed.toFixed(2)}->${wantedSpeed === undefined ? 'any' : wantedSpeed.toFixed(2)} (x${timeScale.toFixed(2)}), ` +
    `dir ${entry.direction}, loop ${m.loopScore.toFixed(2)}` +
    (sFlavour > 0 ? `, flavour ${sFlavour.toFixed(2)}` : '') +
    (categoryPenalty > 0 ? `, fallback from ${req.category}` : '')

  return { entry, timeScale, score, reason }
}

/**
 * Picks the best clip for what the character is doing right now.
 *
 * Hard requirements (posture, looping) filter; everything else is scored, so a
 * sparse library still answers every request instead of returning nothing.
 */
export function resolveAnim(entries: readonly AnimEntry[], req: AnimRequest): AnimPick | null {
  const tiers: { category: AnimCategory; penalty: number }[] = [
    { category: req.category, penalty: 0 },
    ...(FALLBACK[req.category] ?? []).map((c, i) => ({ category: c, penalty: 2 + i })),
  ]

  let best: AnimPick | null = null
  for (const tier of tiers) {
    for (const entry of entries) {
      if (entry.category !== tier.category) continue
      const pick = scoreEntry(entry, req, tier.penalty)
      if (pick && (!best || pick.score > best.score)) best = pick
    }
    // Stop as soon as a tier produced something: a real match always beats a
    // better-scoring fallback.
    if (best) break
  }

  if (best) return best

  // Nothing survived the hard filters. Relax posture last - a standing clip on
  // a crouching character is wrong, but it is better than a T-pose.
  if (req.posture) return resolveAnim(entries, { ...req, posture: undefined })
  if (req.loop !== undefined) return resolveAnim(entries, { ...req, loop: undefined })
  return null
}
