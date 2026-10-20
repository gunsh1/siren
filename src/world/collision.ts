import * as THREE from 'three'

/** Yaw-aligned box. Cheap enough that a whole village is a few hundred of them. */
export interface BoxCollider {
  center: THREE.Vector3
  half: THREE.Vector3
  yaw: number
  /** Blocks line of sight as well as movement. Windows and fences do not. */
  opaque: boolean
  tag?: string
}

const _local = new THREE.Vector3()
const _closest = new THREE.Vector3()

export class CollisionWorld {
  readonly boxes: BoxCollider[] = []

  add(center: THREE.Vector3, half: THREE.Vector3, yaw = 0, opaque = true, tag?: string): BoxCollider {
    const b: BoxCollider = { center: center.clone(), half: half.clone(), yaw, opaque, tag }
    this.boxes.push(b)
    return b
  }

  clear(): void { this.boxes.length = 0 }

  /**
   * Push a vertical cylinder (radius r, from y to y+height) out of every box.
   * Iterated twice so corners resolve without jitter.
   */
  resolve(pos: THREE.Vector3, radius: number, height: number): void {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.boxes) {
        const top = b.center.y + b.half.y
        const bottom = b.center.y - b.half.y
        if (pos.y + height < bottom || pos.y > top) continue

        _local.set(pos.x - b.center.x, 0, pos.z - b.center.z)
        if (b.yaw !== 0) {
          const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw)
          const x = _local.x * c - _local.z * s
          const z = _local.x * s + _local.z * c
          _local.set(x, 0, z)
        }
        const cx = THREE.MathUtils.clamp(_local.x, -b.half.x, b.half.x)
        const cz = THREE.MathUtils.clamp(_local.z, -b.half.z, b.half.z)
        const dx = _local.x - cx
        const dz = _local.z - cz
        const d2 = dx * dx + dz * dz

        if (d2 > radius * radius) continue

        let nx: number, nz: number, push: number
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2)
          nx = dx / d; nz = dz / d
          push = radius - d
        } else {
          // Centre is inside the box: escape along the shallowest axis.
          const ox = b.half.x - Math.abs(_local.x)
          const oz = b.half.z - Math.abs(_local.z)
          if (ox < oz) { nx = Math.sign(_local.x) || 1; nz = 0; push = ox + radius }
          else { nx = 0; nz = Math.sign(_local.z) || 1; push = oz + radius }
        }

        _closest.set(nx * push, 0, nz * push)
        if (b.yaw !== 0) {
          const c = Math.cos(b.yaw), s = Math.sin(b.yaw)
          const x = _closest.x * c - _closest.z * s
          const z = _closest.x * s + _closest.z * c
          _closest.set(x, 0, z)
        }
        pos.x += _closest.x
        pos.z += _closest.z
      }
    }
  }

  /** True if an opaque box blocks the segment. Used by AI vision. */
  blocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = _local.copy(to).sub(from)
    const len = dir.length()
    if (len < 1e-5) return false
    dir.divideScalar(len)
    for (const b of this.boxes) {
      if (!b.opaque) continue
      if (raySlab(from, dir, len, b)) return true
    }
    return false
  }
}

const _o = new THREE.Vector3()
const _d = new THREE.Vector3()

function raySlab(origin: THREE.Vector3, dir: THREE.Vector3, maxLen: number, b: BoxCollider): boolean {
  _o.copy(origin).sub(b.center)
  _d.copy(dir)
  if (b.yaw !== 0) {
    const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw)
    _o.set(_o.x * c - _o.z * s, _o.y, _o.x * s + _o.z * c)
    _d.set(_d.x * c - _d.z * s, _d.y, _d.x * s + _d.z * c)
  }
  let tmin = 0
  let tmax = maxLen
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? _o.x : axis === 1 ? _o.y : _o.z
    const d = axis === 0 ? _d.x : axis === 1 ? _d.y : _d.z
    const h = axis === 0 ? b.half.x : axis === 1 ? b.half.y : b.half.z
    if (Math.abs(d) < 1e-8) {
      if (o < -h || o > h) return false
    } else {
      let t1 = (-h - o) / d
      let t2 = (h - o) / d
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return false
    }
  }
  return true
}
