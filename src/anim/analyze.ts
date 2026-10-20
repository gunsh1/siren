import * as THREE from 'three'
import type {
  AnimCategory, AnimEntry, AnimMeasurements, Direction, Posture, SpeedBand,
} from './types'

export const BONES = {
  hips: 'mixamorig:Hips',
  head: 'mixamorig:Head',
  headTop: 'mixamorig:HeadTop_End',
  leftFoot: 'mixamorig:LeftFoot',
  rightFoot: 'mixamorig:RightFoot',
  leftToe: 'mixamorig:LeftToeBase',
  rightToe: 'mixamorig:RightToeBase',
  leftHand: 'mixamorig:LeftHand',
  rightHand: 'mixamorig:RightHand',
  leftShoulder: 'mixamorig:LeftArm',
  rightShoulder: 'mixamorig:RightArm',
  // The hip joints are rigid relative to the pelvis, so the line between them
  // gives a facing direction that arm swing cannot corrupt.
  leftUpLeg: 'mixamorig:LeftUpLeg',
  rightUpLeg: 'mixamorig:RightUpLeg',
} as const

export type BoneKey = keyof typeof BONES

/** One sampled frame: world positions in metres plus the hips yaw. */
export interface Frame {
  t: number
  pos: Record<BoneKey, THREE.Vector3>
  hipsYaw: number
}

/**
 * Mixamo exports in centimetres. Rather than hard-coding 0.01 we measure the
 * rig and check the result lands on a human, which also catches models that
 * were rescaled on export.
 */
export function detectUnitScale(restHeightInUnits: number): { scale: number; heightMeters: number } {
  const candidates = [1, 0.01, 0.1, 0.001]
  let best = 1
  let bestErr = Infinity
  for (const s of candidates) {
    const h = restHeightInUnits * s
    const err = Math.abs(h - 1.75)
    if (h > 0.9 && h < 2.6 && err < bestErr) { best = s; bestErr = err }
  }
  return { scale: best, heightMeters: restHeightInUnits * best }
}

function pathLengthOf(frames: Frame[], key: BoneKey): number {
  let sum = 0
  for (let i = 1; i < frames.length; i++) sum += frames[i].pos[key].distanceTo(frames[i - 1].pos[key])
  return sum
}

export interface Contact { start: number; end: number; side: 'L' | 'R' }

/**
 * Contact intervals for one foot, with hysteresis.
 *
 * A single threshold double-counts: the toe hovers within a millimetre of the
 * cutoff during stance and every wobble reads as a new footfall. Requiring the
 * foot to rise well clear before the next contact can start fixes it.
 */
function contactIntervals(
  frames: Frame[], key: BoneKey, tolerance: number, side: 'L' | 'R',
): Contact[] {
  let min = Infinity
  for (const f of frames) min = Math.min(min, f.pos[key].y)
  const down = min + tolerance * 0.6
  const up = min + tolerance * 1.8

  const out: Contact[] = []
  let openedAt = -1
  for (const f of frames) {
    const y = f.pos[key].y
    if (openedAt < 0 && y <= down) openedAt = f.t
    else if (openedAt >= 0 && y >= up) { out.push({ start: openedAt, end: f.t, side }); openedAt = -1 }
  }
  if (openedAt >= 0) out.push({ start: openedAt, end: frames[frames.length - 1].t, side })
  return out
}

/** How strictly the feet take turns. A walk alternates; a shuffle does not. */
function alternationOf(contacts: Contact[]): number {
  if (contacts.length < 2) return 0
  let swaps = 0
  for (let i = 1; i < contacts.length; i++) {
    if (contacts[i].side !== contacts[i - 1].side) swaps++
  }
  return swaps / (contacts.length - 1)
}

/** How evenly spaced the contacts are, 1 = metronomic. */
function regularityOf(contacts: Contact[]): number {
  if (contacts.length < 3) return contacts.length === 2 ? 0.5 : 0
  const gaps: number[] = []
  for (let i = 1; i < contacts.length; i++) gaps.push(contacts[i].start - contacts[i - 1].start)
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (mean <= 1e-4) return 0
  const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length
  return Math.max(0, 1 - Math.sqrt(variance) / mean)
}

/**
 * Speed implied by the planted foot sliding backwards under the hips.
 * This is what makes in-place clips usable: the runtime can time-scale a
 * "walk in place" so the visual pace matches the character's real velocity.
 */
function impliedSpeedOf(
  frames: Frame[], contacts: Contact[], keyOf: (side: 'L' | 'R') => BoneKey,
): { speed: number; lateralRatio: number } {
  let distance = 0
  let time = 0
  let along = 0
  let lateral = 0
  for (const c of contacts) {
    const key = keyOf(c.side)
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]
      const b = frames[i]
      if (b.t <= c.start || a.t >= c.end) continue
      const ax = a.pos[key].x - a.pos.hips.x
      const az = a.pos[key].z - a.pos.hips.z
      const bx = b.pos[key].x - b.pos.hips.x
      const bz = b.pos[key].z - b.pos.hips.z
      const dx = bx - ax
      const dz = bz - az
      distance += Math.hypot(dx, dz)
      time += b.t - a.t

      // Split the slide into "under the body" and "across the body".
      const fx = Math.sin(b.hipsYaw)
      const fz = Math.cos(b.hipsYaw)
      along += Math.abs(dx * fx + dz * fz)
      lateral += Math.abs(dx * fz - dz * fx)
    }
  }
  const total = along + lateral
  return {
    speed: time > 1e-4 ? distance / time : 0,
    lateralRatio: total > 1e-5 ? lateral / total : 0,
  }
}

function shortestAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}

export function measure(frames: Frame[], height: number, duration: number): AnimMeasurements {
  const first = frames[0]
  const last = frames[frames.length - 1]

  const flatFirst = new THREE.Vector2(first.pos.hips.x, first.pos.hips.z)
  const flatLast = new THREE.Vector2(last.pos.hips.x, last.pos.hips.z)
  const displacement = flatFirst.distanceTo(flatLast)

  let pathLength = 0
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].pos.hips
    const b = frames[i].pos.hips
    pathLength += Math.hypot(b.x - a.x, b.z - a.z)
  }

  // Net turn, plus how much the pelvis swung about in total getting there.
  let turn = 0
  let wander = 0
  for (let i = 1; i < frames.length; i++) {
    const d = shortestAngle(frames[i].hipsYaw - frames[i - 1].hipsYaw)
    turn += d
    wander += Math.abs(d)
  }

  // Heading of travel measured in the character's own starting frame.
  const forward = new THREE.Vector2(Math.sin(first.hipsYaw), Math.cos(first.hipsYaw))
  const travel = new THREE.Vector2().subVectors(flatLast, flatFirst)
  const travelHeading = displacement > 0.02
    ? THREE.MathUtils.radToDeg(Math.atan2(
      travel.x * forward.y - travel.y * forward.x,
      travel.x * forward.x + travel.y * forward.y,
    ))
    : 0

  let hipsSum = 0
  let hipsMin = Infinity
  let hipsMax = -Infinity
  for (const f of frames) {
    hipsSum += f.pos.hips.y
    hipsMin = Math.min(hipsMin, f.pos.hips.y)
    hipsMax = Math.max(hipsMax, f.pos.hips.y)
  }
  const hipsHeight = hipsSum / frames.length

  const toeTol = height * 0.03
  const contacts = [
    ...contactIntervals(frames, 'leftToe', toeTol, 'L'),
    ...contactIntervals(frames, 'rightToe', toeTol, 'R'),
  ].sort((a, b) => a.start - b.start)
  const steps = contacts.length
  const implied = impliedSpeedOf(frames, contacts, (side) => (side === 'L' ? 'leftToe' : 'rightToe'))

  let groundedFrames = 0
  let footMin = Infinity
  for (const f of frames) footMin = Math.min(footMin, f.pos.leftToe.y, f.pos.rightToe.y)
  const airTol = footMin + height * 0.05
  // Genuinely off the ground means the feet are up AND the body went with them.
  const hipsAirborne = height * 0.38
  for (const f of frames) {
    const feetUp = f.pos.leftToe.y > airTol && f.pos.rightToe.y > airTol
    if (!feetUp || f.pos.hips.y < hipsAirborne) groundedFrames++
  }

  const armEnergy = pathLengthOf(frames, 'leftHand') + pathLengthOf(frames, 'rightHand')
  const legEnergy = pathLengthOf(frames, 'leftToe') + pathLengthOf(frames, 'rightToe')

  // Loopability: how close the last pose is to the first, across every joint
  // we track, normalised by the character height.
  let poseDelta = 0
  const keys = Object.keys(BONES) as BoneKey[]
  for (const k of keys) {
    if (k === 'hips') continue
    const a = first.pos[k].clone().sub(first.pos.hips)
    const b = last.pos[k].clone().sub(last.pos.hips)
    poseDelta += a.distanceTo(b)
  }
  poseDelta += Math.abs(shortestAngle(last.hipsYaw - first.hipsYaw)) * height * 0.5
  const loopScore = THREE.MathUtils.clamp(1 - poseDelta / (height * 0.9), 0, 1)

  const speed = duration > 0 ? displacement / duration : 0

  return {
    duration,
    speed,
    displacement,
    pathLength,
    turnDegrees: THREE.MathUtils.radToDeg(turn),
    travelHeading,
    hipsHeight,
    hipsRatio: hipsHeight / height,
    verticalTravel: hipsMax - hipsMin,
    steps,
    cadence: duration > 0 ? steps / duration : 0,
    strideLength: steps > 0 ? displacement / steps : 0,
    impliedSpeed: implied.speed,
    // Translating clips are believed over the estimate; the estimate only
    // fills in for clips that were exported in place.
    effectiveSpeed: speed > 0.12 ? speed : implied.speed,
    alternation: alternationOf(contacts),
    gaitRegularity: regularityOf(contacts),
    yawWander: THREE.MathUtils.radToDeg(wander),
    lateralRatio: implied.lateralRatio,
    airborne: 1 - groundedFrames / frames.length,
    armEnergy,
    legEnergy,
    activity: duration > 0 ? (armEnergy + legEnergy) / duration / height : 0,
    loopScore,
    startHipsRatio: first.pos.hips.y / height,
    endHipsRatio: last.pos.hips.y / height,
  }
}

export function classifyPosture(m: AnimMeasurements): Posture {
  // Standing hips sit near 55% of total height; a deep crouch is around 35%;
  // anything on the floor is well under a quarter.
  if (m.hipsRatio > 0.45) return 'stand'
  if (m.hipsRatio > 0.22) return 'crouch'
  return 'prone'
}

export function classifyDirection(m: AnimMeasurements): Direction {
  if (m.speed < 0.12) return 'inPlace'
  const h = m.travelHeading
  if (h > -45 && h <= 45) return 'forward'
  if (h > 45 && h <= 135) return 'left'
  if (h <= -45 && h > -135) return 'right'
  return 'backward'
}

export function classifySpeed(m: AnimMeasurements): SpeedBand {
  const v = m.effectiveSpeed
  if (v < 0.25) return 'still'
  if (v < 1.7) return 'walk'
  if (v < 3.2) return 'jog'
  return 'run'
}

export function classifyCategory(m: AnimMeasurements, posture: Posture): AnimCategory {
  const heightChange = m.endHipsRatio - m.startHipsRatio

  // Fell over and stayed there, or got up off the floor. Check these first:
  // both look like "not much travel" to every other test.
  if (heightChange < -0.2 && m.endHipsRatio < 0.3) return 'death'
  if (heightChange > 0.2 && m.startHipsRatio < 0.3) return 'getUp'

  if (m.airborne > 0.15 && m.verticalTravel > 0.2) return 'jump'

  // A gait is not just "the feet touch the floor" - a dance does that too.
  // It alternates left/right on an even beat. Requiring both separates a walk
  // in place from a dance in place, which are otherwise identical numerically.
  // Two ways to be locomotion, because clips arrive in two forms.
  //
  // If it translates, that settles it: alternating foot contacts plus actual
  // ground covered is a gait, however odd it looks. This is what lets a
  // deliberately lurching zombie walk through - it swings its pelvis far too
  // much to pass a "does it look like walking" test, but it does travel.
  const alternates = m.steps >= 2 && m.alternation >= 0.5
  // No cadence floor on this branch: ground actually covered is the evidence,
  // and a slow shamble legitimately takes a step every two seconds.
  if (alternates && m.speed > 0.25) {
    if (Math.abs(m.turnDegrees) > 100 && m.speed < 0.4) return 'turn'
    return 'locomotion'
  }

  // If it does not translate, it has to look like walking instead: the planted
  // foot sliding straight back under a pelvis that stays pointed forward.
  // A dance in place alternates its feet too, and only fails on those two.
  const marchesInPlace = alternates && m.cadence > 0.55 && m.impliedSpeed > 0.5 &&
    m.alternation >= 0.6 && m.lateralRatio <= 0.35 && m.yawWander <= 120
  if (marchesInPlace) {
    if (Math.abs(m.turnDegrees) > 100) return 'turn'
    return 'locomotion'
  }

  if (Math.abs(m.turnDegrees) > 45 && m.speed < 0.5) return 'turn'

  // An idle is defined by stillness, not by looping. A dance loops perfectly
  // and would sail through a loop-only test. The duration floor keeps a quarter
  // second of rifle recoil from being offered as something to stand around in.
  const calm = m.activity < 0.6 && m.speed < 0.12 && m.verticalTravel < 0.15
  if (calm && m.loopScore > 0.5 && m.duration >= 0.8) return 'idle'

  // Upper body doing the work: swings, gestures, reaching.
  if (m.armEnergy > m.legEnergy * 1.3) return 'action'

  if (posture === 'prone') return 'reaction'
  return 'misc'
}

const KEYWORD_SPLIT = /[^a-z0-9]+/i

export function keywordsFrom(label: string): string[] {
  return label
    .replace(/\.fbx$/i, '')
    .split(KEYWORD_SPLIT)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1 && !/^\d+$/.test(s))
}

export function buildEntry(
  id: string, file: string, clipName: string, label: string,
  m: AnimMeasurements, rig: { heightUnits: number; hipsUnits: number },
): AnimEntry {
  const posture = classifyPosture(m)
  return {
    id,
    file,
    clipName,
    label,
    category: classifyCategory(m, posture),
    posture,
    direction: classifyDirection(m),
    speedBand: classifySpeed(m),
    // Below this the pop at the loop point is visible at 30fps.
    loops: m.loopScore > 0.72,
    measurements: m,
    keywords: keywordsFrom(label),
    rig,
  }
}
