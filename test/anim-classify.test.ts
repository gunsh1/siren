import { describe, it, expect } from 'vitest'
import { classifyCategory, classifyDirection, classifyPosture, classifySpeed, detectUnitScale } from '../src/anim/analyze'
import type { AnimMeasurements } from '../src/anim/types'

/** Neutral measurements; each test overrides only what it is about. */
function m(over: Partial<AnimMeasurements> = {}): AnimMeasurements {
  const base: AnimMeasurements = {
    duration: 1, speed: 0, displacement: 0, pathLength: 0,
    turnDegrees: 0, travelHeading: 0,
    hipsHeight: 0.95, hipsRatio: 0.54, verticalTravel: 0.03,
    steps: 0, cadence: 0, strideLength: 0, impliedSpeed: 0, effectiveSpeed: 0,
    alternation: 0, gaitRegularity: 0, yawWander: 5, lateralRatio: 0,
    airborne: 0, armEnergy: 0.1, legEnergy: 0.1, activity: 0.1,
    loopScore: 0.95, startHipsRatio: 0.54, endHipsRatio: 0.54,
  }
  return { ...base, ...over }
}

const walk = m({
  speed: 1.4, displacement: 1.4, effectiveSpeed: 1.4, steps: 2, cadence: 2,
  alternation: 1, gaitRegularity: 0.8, yawWander: 20, lateralRatio: 0.1,
  armEnergy: 0.8, legEnergy: 1.6, activity: 1.4, travelHeading: 0,
})

describe('unit detection', () => {
  it('reads centimetre rigs as metres', () => {
    expect(detectUnitScale(177).scale).toBe(0.01)
    expect(detectUnitScale(177).heightMeters).toBeCloseTo(1.77, 2)
  })
  it('leaves metre rigs alone', () => {
    expect(detectUnitScale(1.8).scale).toBe(1)
  })
})

describe('posture', () => {
  it('separates standing, crouching and floor', () => {
    expect(classifyPosture(m({ hipsRatio: 0.55 }))).toBe('stand')
    expect(classifyPosture(m({ hipsRatio: 0.34 }))).toBe('crouch')
    expect(classifyPosture(m({ hipsRatio: 0.12 }))).toBe('prone')
  })
})

describe('category', () => {
  it('calls a walk a walk', () => {
    expect(classifyCategory(walk, 'stand')).toBe('locomotion')
  })

  it('calls a walk-in-place a walk, using the implied pace', () => {
    const inPlace = { ...walk, speed: 0, displacement: 0, impliedSpeed: 1.5, effectiveSpeed: 1.5 }
    expect(classifyCategory(inPlace, 'stand')).toBe('locomotion')
  })

  it('does not mistake a dance for walking', () => {
    // Alternating, looping foot contacts - but the pelvis swings and the feet
    // travel sideways, which walking never does.
    const dance = m({
      impliedSpeed: 1.0, effectiveSpeed: 1.0, steps: 4, cadence: 2,
      alternation: 1, gaitRegularity: 0.47, yawWander: 111, lateralRatio: 0.57,
      armEnergy: 4, legEnergy: 4, activity: 3.5, loopScore: 1,
    })
    expect(classifyCategory(dance, 'stand')).not.toBe('locomotion')
    expect(classifyCategory(dance, 'stand')).not.toBe('idle')
  })

  it('does not file a perfectly looping busy clip as an idle', () => {
    const busy = m({ loopScore: 1, activity: 2.5, armEnergy: 3, legEnergy: 0.4 })
    expect(classifyCategory(busy, 'stand')).toBe('action')
  })

  it('recognises an idle by stillness', () => {
    expect(classifyCategory(m({ activity: 0.2, loopScore: 0.9 }), 'stand')).toBe('idle')
  })

  it('tells getting up from going down', () => {
    expect(classifyCategory(m({ startHipsRatio: 0.54, endHipsRatio: 0.1 }), 'stand')).toBe('death')
    expect(classifyCategory(m({ startHipsRatio: 0.1, endHipsRatio: 0.54 }), 'stand')).toBe('getUp')
  })

  it('spots a jump', () => {
    expect(classifyCategory(m({ airborne: 0.4, verticalTravel: 0.6 }), 'stand')).toBe('jump')
  })
})

describe('direction and speed bands', () => {
  it('reads travel heading in the character frame', () => {
    expect(classifyDirection({ ...walk, travelHeading: 0 })).toBe('forward')
    expect(classifyDirection({ ...walk, travelHeading: 180 })).toBe('backward')
    expect(classifyDirection({ ...walk, travelHeading: 90 })).toBe('left')
    expect(classifyDirection({ ...walk, travelHeading: -90 })).toBe('right')
    expect(classifyDirection(m())).toBe('inPlace')
  })

  it('bands in-place clips by their implied pace, not by zero', () => {
    // 2 m/s is a jog; a human run is north of 3 m/s.
    expect(classifySpeed(m({ speed: 0, impliedSpeed: 2.0, effectiveSpeed: 2.0 }))).toBe('jog')
    expect(classifySpeed(m({ speed: 0, impliedSpeed: 4.2, effectiveSpeed: 4.2 }))).toBe('run')
    expect(classifySpeed(m({ effectiveSpeed: 1.2 }))).toBe('walk')
    expect(classifySpeed(m())).toBe('still')
  })
})
