import * as THREE from 'three'
import { BONES, type BoneKey, type Frame } from './analyze'

export type BoneMap = Record<BoneKey, THREE.Object3D>

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Bone lookup that tolerates how the name arrived.
 *
 * three's FBXLoader runs every node name through PropertyBinding.sanitizeNodeName,
 * which strips the colon: "mixamorig:Hips" becomes "mixamorigHips". Other
 * exporters emit "mixamorig1:Hips" or drop the prefix entirely. Matching on the
 * normalised name, then on the bare bone name as a suffix, covers all of them.
 */
export function findBones(root: THREE.Object3D): BoneMap {
  const byNormalised = new Map<string, THREE.Object3D>()
  const all: THREE.Object3D[] = []
  root.traverse((o) => {
    if (!o.name) return
    all.push(o)
    const n = normalise(o.name)
    if (!byNormalised.has(n)) byNormalised.set(n, o)
  })

  const out = {} as BoneMap
  const missing: string[] = []
  for (const [key, name] of Object.entries(BONES) as [BoneKey, string][]) {
    const full = normalise(name)
    const bare = normalise(name.split(':').pop() ?? name)

    let bone = byNormalised.get(full) ?? byNormalised.get(bare)
    if (!bone) {
      // Prefer the shortest suffix match so LeftHand does not lose to
      // something longer that happens to share the ending.
      let best: THREE.Object3D | null = null
      for (const o of all) {
        const n = normalise(o.name)
        if (!n.endsWith(bare)) continue
        if (!best || o.name.length < best.name.length) best = o
      }
      bone = best ?? undefined
    }
    if (!bone) { missing.push(name); continue }
    out[key] = bone
  }

  if (missing.length) {
    const sample = all.slice(0, 12).map((o) => o.name).join(', ')
    throw new Error(
      `not a Mixamo rig - missing ${missing.length} bone(s): ${missing.join(', ')}. ` +
      `Nodes found: ${sample}${all.length > 12 ? ', ...' : ''}`,
    )
  }
  return out
}

/** The prefix the rig actually uses, for the record in the index. */
export function detectSkeletonPrefix(bones: BoneMap): string {
  const hips = bones.hips.name
  const idx = hips.toLowerCase().lastIndexOf('hips')
  return idx > 0 ? hips.slice(0, idx) : 'none'
}

/** Standing height in raw file units: crown of the head down to the toes. */
export function restHeightUnits(root: THREE.Object3D, bones: BoneMap): number {
  root.updateMatrixWorld(true)
  const top = new THREE.Vector3()
  const toeL = new THREE.Vector3()
  const toeR = new THREE.Vector3()
  bones.headTop.getWorldPosition(top)
  bones.leftToe.getWorldPosition(toeL)
  bones.rightToe.getWorldPosition(toeR)
  return top.y - Math.min(toeL.y, toeR.y)
}

/** Rest height of the hips above the toes, in raw file units. */
export function restHipsUnits(root: THREE.Object3D, bones: BoneMap): number {
  root.updateMatrixWorld(true)
  const hips = new THREE.Vector3()
  const toeL = new THREE.Vector3()
  const toeR = new THREE.Vector3()
  bones.hips.getWorldPosition(hips)
  bones.leftToe.getWorldPosition(toeL)
  bones.rightToe.getWorldPosition(toeR)
  return hips.y - Math.min(toeL.y, toeR.y)
}

const _right = new THREE.Vector3()
const _l = new THREE.Vector3()
const _r = new THREE.Vector3()

/**
 * Steps the clip at a fixed rate and records world-space bone positions in
 * metres. Sampling rather than reading keyframes means every clip is measured
 * the same way regardless of how it was authored or how sparse its curves are.
 */
export function sampleClip(
  root: THREE.Object3D,
  bones: BoneMap,
  clip: THREE.AnimationClip,
  unitScale: number,
  fps = 30,
): Frame[] {
  const mixer = new THREE.AnimationMixer(root)
  const action = mixer.clipAction(clip)
  // AnimationAction loops by default, so setTime(duration) wraps straight back
  // to frame 0. That silently made every clip's last sample identical to its
  // first: perfect loop scores, zero displacement, and no clip ever reading as
  // travelling. Clamp instead of wrapping so the end of the clip is the end.
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()

  const steps = Math.max(2, Math.round(clip.duration * fps) + 1)
  const frames: Frame[] = []
  const keys = Object.keys(BONES) as BoneKey[]

  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * clip.duration
    mixer.setTime(t)
    root.updateMatrixWorld(true)

    const pos = {} as Record<BoneKey, THREE.Vector3>
    for (const k of keys) {
      const v = new THREE.Vector3()
      bones[k].getWorldPosition(v)
      pos[k] = v.multiplyScalar(unitScale)
    }

    bones.leftUpLeg.getWorldPosition(_l)
    bones.rightUpLeg.getWorldPosition(_r)
    _right.subVectors(_r, _l)
    // forward = up x right = (right.z, -right.x), expressed as a yaw where
    // forward is (sin yaw, cos yaw) in the ground plane.
    const hipsYaw = Math.atan2(_right.z, -_right.x)

    frames.push({ t, pos, hipsYaw })
  }

  action.stop()
  mixer.uncacheClip(clip)
  return frames
}
