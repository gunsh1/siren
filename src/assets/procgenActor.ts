import * as THREE from 'three'
import { Ps2Material } from '../render/ps2/material'
import type { StanceId } from '../player/stance'
import type { CharacterView } from '../anim/animatedActor'

export interface ActorPalette {
  skin: number
  hair: number
  shirt: number
  trousers: number
  shoes: number
}

export const PALETTE_BOY: ActorPalette = {
  skin: 0xb9a290, hair: 0x1d1a18, shirt: 0x5d7f8c, trousers: 0x2b2f38, shoes: 0x16181c,
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new Ps2Material({ color }))
  return m
}

/** A pivot at the joint with the limb hanging below it, so rotation looks right. */
function limb(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group()
  const m = box(w, h, d, color)
  m.position.y = -h / 2
  g.add(m)
  return g
}

/**
 * Placeholder body: ~350 triangles of boxes with a hand-driven walk cycle.
 * Deliberately close to PS2 character proportions so swapping in a real
 * skinned mesh later does not change how the game reads.
 */
export class ProcgenActor implements CharacterView {
  readonly root = new THREE.Group()
  private hips = new THREE.Group()
  private torso: THREE.Mesh
  private head: THREE.Group
  private armL: THREE.Group
  private armR: THREE.Group
  private foreL: THREE.Group
  private foreR: THREE.Group
  private legL: THREE.Group
  private legR: THREE.Group
  private shinL: THREE.Group
  private shinR: THREE.Group
  private phase = 0

  constructor(p: ActorPalette = PALETTE_BOY, scale = 1) {
    const g = this.root
    g.add(this.hips)
    this.hips.position.y = 0.92

    this.torso = box(0.42, 0.58, 0.22, p.shirt)
    this.torso.position.y = 0.29
    this.hips.add(this.torso)

    const pelvis = box(0.34, 0.18, 0.2, p.trousers)
    pelvis.position.y = -0.06
    this.hips.add(pelvis)

    this.head = new THREE.Group()
    this.head.position.y = 0.62
    const skull = box(0.2, 0.24, 0.21, p.skin)
    skull.position.y = 0.12
    const hair = box(0.215, 0.16, 0.225, p.hair)
    hair.position.y = 0.19
    const fringe = box(0.215, 0.07, 0.03, p.hair)
    // Built facing +Z, matching rotation.y = atan2(moveX, moveZ).
    fringe.position.set(0, 0.11, 0.1)
    this.head.add(skull, hair, fringe)
    const neck = box(0.1, 0.08, 0.1, p.skin)
    neck.position.y = 0.58
    this.hips.add(this.head, neck)

    this.armL = limb(0.11, 0.28, 0.11, p.shirt); this.armL.position.set(0.26, 0.54, 0)
    this.armR = limb(0.11, 0.28, 0.11, p.shirt); this.armR.position.set(-0.26, 0.54, 0)
    this.foreL = limb(0.09, 0.28, 0.09, p.skin); this.foreL.position.y = -0.28
    this.foreR = limb(0.09, 0.28, 0.09, p.skin); this.foreR.position.y = -0.28
    this.armL.add(this.foreL); this.armR.add(this.foreR)
    this.hips.add(this.armL, this.armR)

    this.legL = limb(0.15, 0.44, 0.15, p.trousers); this.legL.position.set(0.11, -0.1, 0)
    this.legR = limb(0.15, 0.44, 0.15, p.trousers); this.legR.position.set(-0.11, -0.1, 0)
    this.shinL = limb(0.13, 0.42, 0.13, p.trousers); this.shinL.position.y = -0.44
    this.shinR = limb(0.13, 0.42, 0.13, p.trousers); this.shinR.position.y = -0.44
    const shoeL = box(0.15, 0.09, 0.25, p.shoes); shoeL.position.set(0, -0.42, 0.04)
    const shoeR = shoeL.clone(); shoeR.position.copy(shoeL.position)
    this.shinL.add(shoeL); this.shinR.add(shoeR)
    this.legL.add(this.shinL); this.legR.add(this.shinR)
    this.hips.add(this.legL, this.legR)

    g.scale.setScalar(scale)
  }

  /**
   * @param speed metres/second of horizontal movement
   * @param stance current stance, drives crouch/prone folding
   */
  update(dt: number, speed: number, stance: StanceId): void {
    const stride = speed > 0.05 ? THREE.MathUtils.clamp(speed * 2.1, 1.6, 9) : 0
    this.phase += stride * dt
    const swing = Math.sin(this.phase)
    const swing2 = Math.sin(this.phase * 2)
    const amt = THREE.MathUtils.clamp(speed / 4.0, 0, 1)

    this.legL.rotation.x = swing * 0.75 * amt
    this.legR.rotation.x = -swing * 0.75 * amt
    this.shinL.rotation.x = Math.max(0, -swing) * 0.9 * amt
    this.shinR.rotation.x = Math.max(0, swing) * 0.9 * amt
    this.armL.rotation.x = -swing * 0.55 * amt
    this.armR.rotation.x = swing * 0.55 * amt
    this.foreL.rotation.x = -0.25 - Math.max(0, swing) * 0.5 * amt
    this.foreR.rotation.x = -0.25 - Math.max(0, -swing) * 0.5 * amt

    const bob = Math.abs(swing2) * 0.035 * amt

    if (stance === 'stand') {
      this.hips.position.y = 0.92 + bob
      this.hips.rotation.x = 0.04 + amt * 0.08
      this.torso.rotation.x = 0
      this.head.rotation.x = -0.04
      this.armL.rotation.z = 0.06
      this.armR.rotation.z = -0.06
    } else if (stance === 'crouch') {
      this.hips.position.y = 0.56 + bob * 0.5
      this.hips.rotation.x = 0.32
      this.torso.rotation.x = -0.1
      this.head.rotation.x = -0.28
      this.legL.rotation.x += 0.5
      this.legR.rotation.x += 0.5
      this.shinL.rotation.x += 0.9
      this.shinR.rotation.x += 0.9
      this.armL.rotation.z = 0.2
      this.armR.rotation.z = -0.2
    } else {
      this.hips.position.y = 0.2
      this.hips.rotation.x = 1.42
      this.torso.rotation.x = -0.25
      this.head.rotation.x = -1.1
      this.legL.rotation.x = swing * 0.4 * amt
      this.legR.rotation.x = -swing * 0.4 * amt
      this.shinL.rotation.x = 0.3
      this.shinR.rotation.x = 0.3
      this.armL.rotation.z = 0.9
      this.armR.rotation.z = -0.9
      this.armL.rotation.x = -0.6 + swing * 0.4 * amt
      this.armR.rotation.x = -0.6 - swing * 0.4 * amt
    }
  }
}
