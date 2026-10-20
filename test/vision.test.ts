import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { sampleVision, Awareness, DEFAULT_VISION } from '../src/ai/vision'

const clear = () => false
const target = (x: number, z: number, over: Partial<Parameters<typeof sampleVision>[2]> = {}) => ({
  position: new THREE.Vector3(x, 0, z),
  visibility: 1,
  light: 0.5,
  speed: 1.5,
  ...over,
})

/** Seconds of continuous exposure before a shibito is certain. */
function timeToDetect(t: ReturnType<typeof target>, eye = new THREE.Vector3(0, 0, 0), yaw = 0): number {
  const a = new Awareness()
  const dt = 1 / 60
  for (let i = 0; i < 60 * 30; i++) {
    const r = sampleVision(eye, yaw, t, DEFAULT_VISION, clear)
    if (a.update(dt, r.rate)) return (i + 1) * dt
  }
  return Infinity
}

describe('vision', () => {
  it('sees straight ahead and not behind', () => {
    const front = sampleVision(new THREE.Vector3(), 0, target(0, -8), DEFAULT_VISION, clear)
    const back = sampleVision(new THREE.Vector3(), 0, target(0, 8), DEFAULT_VISION, clear)
    expect(front.inSight).toBe(true)
    expect(back.inSight).toBe(false)
  })

  it('notices anyone inside the proximity bubble regardless of facing', () => {
    const r = sampleVision(new THREE.Vector3(), 0, target(0, 1.5), DEFAULT_VISION, clear)
    expect(r.inSight).toBe(true)
  })

  it('is blocked by geometry', () => {
    const r = sampleVision(new THREE.Vector3(), 0, target(0, -8), DEFAULT_VISION, () => true)
    expect(r.inSight).toBe(false)
    expect(r.rate).toBe(0)
  })

  it('sees nothing past its range', () => {
    const r = sampleVision(new THREE.Vector3(), 0, target(0, -(DEFAULT_VISION.range + 1)), DEFAULT_VISION, clear)
    expect(r.inSight).toBe(false)
  })

  it('detects faster the closer you are', () => {
    expect(timeToDetect(target(0, -4))).toBeLessThan(timeToDetect(target(0, -18)))
  })

  it('rewards crouching and prone with more time', () => {
    const standing = timeToDetect(target(0, -12, { visibility: 1 }))
    const crouched = timeToDetect(target(0, -12, { visibility: 0.55 }))
    const prone = timeToDetect(target(0, -12, { visibility: 0.22 }))
    expect(crouched).toBeGreaterThan(standing)
    expect(prone).toBeGreaterThan(crouched)
  })

  it('punishes moving fast and being lit', () => {
    const sneaking = timeToDetect(target(0, -14, { speed: 0.4, light: 0.15 }))
    const sprinting = timeToDetect(target(0, -14, { speed: 4.5, light: 1 }))
    expect(sprinting).toBeLessThan(sneaking)
  })

  it('keeps close-range detection inside a human reaction window', () => {
    // Walking upright at 5m in half light: dangerous, but ducking behind the
    // wall still saves you. Roughly 1.7s at the current tuning.
    const walking = timeToDetect(target(0, -5))
    expect(walking).toBeGreaterThan(0.3)
    expect(walking).toBeLessThan(2.0)

    // Sprinting into a lit doorway at the same distance must not be survivable.
    const exposed = timeToDetect(target(0, -5, { speed: 4.6, light: 1 }))
    expect(exposed).toBeLessThan(1.0)
  })

  it('decays awareness when the target is lost, but slowly once suspicious', () => {
    const a = new Awareness()
    a.value = 0.8
    for (let i = 0; i < 60; i++) a.update(1 / 60, 0)
    expect(a.value).toBeGreaterThan(0.5)
    expect(a.value).toBeLessThan(0.8)
  })
})
