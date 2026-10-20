import { describe, it, expect } from 'vitest'
import { resolveAnim } from '../src/anim/resolve'
import type { AnimEntry, AnimMeasurements } from '../src/anim/types'

function meas(over: Partial<AnimMeasurements> = {}): AnimMeasurements {
  return {
    duration: 1, speed: 0, displacement: 0, pathLength: 0,
    turnDegrees: 0, travelHeading: 0,
    hipsHeight: 0.95, hipsRatio: 0.54, verticalTravel: 0.03,
    steps: 0, cadence: 0, strideLength: 0, impliedSpeed: 0, effectiveSpeed: 0,
    alternation: 0, gaitRegularity: 0.8, yawWander: 5, lateralRatio: 0,
    airborne: 0, armEnergy: 0.1, legEnergy: 0.1, activity: 0.1,
    loopScore: 0.95, startHipsRatio: 0.54, endHipsRatio: 0.54,
    ...over,
  }
}

function entry(over: Partial<AnimEntry> & { id: string }): AnimEntry {
  return {
    file: `models/anim/${over.id}.fbx`,
    clipName: 'mixamo.com',
    label: `${over.id}.fbx`,
    category: 'locomotion',
    posture: 'stand',
    direction: 'forward',
    speedBand: 'walk',
    loops: true,
    measurements: meas(),
    rig: { heightUnits: 177, hipsUnits: 100 },
    keywords: over.id.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean),
    ...over,
  }
}

const LIB: AnimEntry[] = [
  entry({ id: 'Idle', category: 'idle', direction: 'inPlace', speedBand: 'still' }),
  entry({
    id: 'Walking', speedBand: 'walk',
    measurements: meas({ speed: 1.5, effectiveSpeed: 1.5, gaitRegularity: 0.85 }),
  }),
  entry({
    id: 'Running', speedBand: 'run',
    measurements: meas({ speed: 4.4, effectiveSpeed: 4.4, gaitRegularity: 0.8 }),
  }),
  entry({
    id: 'Crouched Walking', posture: 'crouch', speedBand: 'walk',
    measurements: meas({ speed: 0.9, effectiveSpeed: 0.9, hipsRatio: 0.34 }),
  }),
  entry({
    id: 'Zombie Walk', speedBand: 'walk',
    measurements: meas({ speed: 0.8, effectiveSpeed: 0.8, gaitRegularity: 0.6 }),
  }),
  entry({
    id: 'Standing Melee Attack', category: 'action', loops: false,
    direction: 'inPlace', speedBand: 'still',
    measurements: meas({ loopScore: 0.2, activity: 2.4, armEnergy: 3 }),
  }),
]

describe('resolveAnim', () => {
  it('picks the walk for walking speed and the run for running speed', () => {
    expect(resolveAnim(LIB, { category: 'locomotion', speed: 1.6 })!.entry.id).toBe('Walking')
    expect(resolveAnim(LIB, { category: 'locomotion', speed: 4.2 })!.entry.id).toBe('Running')
  })

  it('time-scales the clip so the pace matches the character', () => {
    const pick = resolveAnim(LIB, { category: 'locomotion', speed: 1.2 })!
    expect(pick.entry.id).toBe('Walking')
    // 1.2 / 1.5
    expect(pick.timeScale).toBeCloseTo(0.8, 2)
  })

  it('never stretches a clip past the point it stops reading right', () => {
    const pick = resolveAnim(LIB, { category: 'locomotion', speed: 0.2 })!
    expect(pick.timeScale).toBeGreaterThanOrEqual(0.55)
  })

  it('respects posture as a hard requirement', () => {
    const pick = resolveAnim(LIB, { category: 'locomotion', speed: 1.0, posture: 'crouch' })!
    expect(pick.entry.id).toBe('Crouched Walking')
  })

  it('uses flavour only to break ties, not to override the speed match', () => {
    const zombie = resolveAnim(LIB, { category: 'locomotion', speed: 0.85, flavour: ['zombie'] })!
    expect(zombie.entry.id).toBe('Zombie Walk')

    // Same flavour, but sprinting: the pace has to win or the feet will skate.
    const sprinting = resolveAnim(LIB, { category: 'locomotion', speed: 4.4, flavour: ['zombie'] })!
    expect(sprinting.entry.id).toBe('Running')
  })

  it('honours one-shot vs looping', () => {
    const attack = resolveAnim(LIB, { category: 'action', loop: false })!
    expect(attack.entry.id).toBe('Standing Melee Attack')
  })

  it('can avoid repeating a clip', () => {
    const first = resolveAnim(LIB, { category: 'locomotion', speed: 1.5 })!
    const second = resolveAnim(LIB, { category: 'locomotion', speed: 1.5, exclude: [first.entry.id] })!
    expect(second.entry.id).not.toBe(first.entry.id)
  })

  it('falls back rather than returning nothing', () => {
    // No jump clips exist at all; the character still needs something to play.
    const pick = resolveAnim(LIB, { category: 'jump', speed: 2 })
    expect(pick).not.toBeNull()
    expect(pick!.reason).toContain('fallback')
  })

  it('relaxes posture only as a last resort', () => {
    const proneOnly = resolveAnim(LIB, { category: 'action', posture: 'prone', loop: false })
    expect(proneOnly).not.toBeNull()
    expect(proneOnly!.entry.posture).toBe('stand')
  })

  it('returns null for an empty library', () => {
    expect(resolveAnim([], { category: 'idle' })).toBeNull()
  })
})

describe('requests with no speed', () => {
  // A melee swing and a rifle idle are both standing still as far as ground
  // speed goes, but the swing's feet shuffle enough to measure. Scoring that
  // as "further from 0 m/s" made the rifle idle win the melee slot.
  const SHUFFLE: AnimEntry[] = [
    entry({
      id: 'Standing Melee Attack', category: 'action', loops: true,
      direction: 'inPlace', speedBand: 'still',
      measurements: meas({ impliedSpeed: 0.34, effectiveSpeed: 0.34, loopScore: 1 }),
    }),
    entry({
      id: 'Firing Rifle', category: 'action', loops: true,
      direction: 'inPlace', speedBand: 'still',
      measurements: meas({ impliedSpeed: 0.07, effectiveSpeed: 0.07, loopScore: 1 }),
    }),
  ]

  it('lets flavour decide when the caller gave no speed', () => {
    const pick = resolveAnim(SHUFFLE, {
      category: 'action', posture: 'stand', loop: false, flavour: ['melee', 'attack', 'swing'],
    })!
    expect(pick.entry.id).toBe('Standing Melee Attack')
  })

  it('still honours an explicit request to stand perfectly still', () => {
    const pick = resolveAnim(SHUFFLE, { category: 'action', speed: 0 })!
    expect(pick.entry.id).toBe('Firing Rifle')
  })

  it('leaves playback rate alone when no speed was asked for', () => {
    const pick = resolveAnim(SHUFFLE, { category: 'action', flavour: ['melee'] })!
    expect(pick.timeScale).toBe(1)
  })
})
