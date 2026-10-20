import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { CollisionWorld } from '../src/world/collision'

describe('collision', () => {
  it('pushes a cylinder out of a box', () => {
    const w = new CollisionWorld()
    w.add(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 1))
    const p = new THREE.Vector3(0.5, 0, 0)
    w.resolve(p, 0.32, 1.7)
    expect(Math.abs(p.x)).toBeGreaterThan(1)
  })

  it('ignores boxes the cylinder does not overlap vertically', () => {
    const w = new CollisionWorld()
    w.add(new THREE.Vector3(0, 6, 0), new THREE.Vector3(1, 1, 1))
    const p = new THREE.Vector3(0, 0, 0)
    w.resolve(p, 0.32, 1.7)
    expect(p.x).toBe(0)
    expect(p.z).toBe(0)
  })

  it('respects yaw', () => {
    const w = new CollisionWorld()
    w.add(new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 1, 0.2), Math.PI / 2)
    // The wall now runs along z, so approaching along x must be blocked.
    const p = new THREE.Vector3(0.1, 0, 3)
    w.resolve(p, 0.32, 1.7)
    expect(Math.abs(p.x)).toBeGreaterThan(0.4)
  })

  it('blocks line of sight through opaque boxes only', () => {
    const w = new CollisionWorld()
    w.add(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 1), 0, true)
    expect(w.blocked(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(5, 1, 0))).toBe(true)

    const open = new CollisionWorld()
    open.add(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 1), 0, false)
    expect(open.blocked(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(5, 1, 0))).toBe(false)
  })

  it('does not report a hit past the end of the segment', () => {
    const w = new CollisionWorld()
    w.add(new THREE.Vector3(20, 1, 0), new THREE.Vector3(1, 1, 1))
    expect(w.blocked(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(5, 1, 0))).toBe(false)
  })
})
