import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Rng } from '../core/rng'
import { Ps2Material } from '../render/ps2/material'
import { textures } from '../render/ps2/textures'
import type { Terrain } from './terrain'

/**
 * Everything static in a stage is merged down to a handful of draw calls.
 * PS2 was draw-call bound and so is the software renderer the headless checks
 * run on - a tree built from 16 separate meshes will grind both to a halt.
 */

let _barkMat: Ps2Material | null = null
let _leafMat: Ps2Material | null = null
let _grassMat: Ps2Material | null = null

function barkMaterial(): Ps2Material {
  _barkMat ??= new Ps2Material({ map: textures.bark(), color: 0xa9a397 })
  return _barkMat
}

/** Ground vegetation. */
function grassMaterial(): Ps2Material {
  _grassMat ??= new Ps2Material({
    map: textures.foliage(),
    alphaTest: 0.33,
    side: THREE.DoubleSide,
    color: 0xe2e6d4,
  })
  return _grassMat
}

/** Tree canopies use a different, rounder mask than ground grass. */
function leafMaterial(): Ps2Material {
  _leafMat ??= new Ps2Material({
    map: textures.leafClump(),
    alphaTest: 0.33,
    side: THREE.DoubleSide,
    color: 0xe2e6d4,
  })
  return _leafMat
}

/**
 * Alpha-tested cross-quads, instanced. This is exactly how PS2-era games did
 * vegetation: no sorting, no soft edges, two intersecting planes per clump.
 */
function crossQuad(width: number, height: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(width, height)
  a.translate(0, height / 2, 0)
  const b = a.clone()
  b.rotateY(Math.PI / 2)
  return mergeGeometries([a, b])!
}

export interface ScatterOptions {
  count: number
  seed: number
  area: { x: number; z: number; w: number; d: number }
  width: [number, number]
  height: [number, number]
  maxSlope?: number
  /** Return false to reject a candidate position (paths, buildings). */
  accept?: (x: number, z: number) => boolean
}

export function scatterFoliage(terrain: Terrain, opts: ScatterOptions): THREE.InstancedMesh {
  const geo = crossQuad(1, 1)
  const rng = new Rng(opts.seed)
  const placements: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const axis = new THREE.Vector3(0, 1, 0)
  const maxSlope = opts.maxSlope ?? 0.7

  let attempts = 0
  while (placements.length < opts.count && attempts < opts.count * 12) {
    attempts++
    const x = opts.area.x + rng.range(-opts.area.w / 2, opts.area.w / 2)
    const z = opts.area.z + rng.range(-opts.area.d / 2, opts.area.d / 2)
    if (terrain.slopeAt(x, z) > maxSlope) continue
    if (opts.accept && !opts.accept(x, z)) continue
    pos.set(x, terrain.heightAt(x, z) - 0.05, z)
    q.setFromAxisAngle(axis, rng.range(0, Math.PI * 2))
    scl.set(rng.range(opts.width[0], opts.width[1]), rng.range(opts.height[0], opts.height[1]), 1)
    placements.push(new THREE.Matrix4().compose(pos, q, scl))
  }

  const mesh = new THREE.InstancedMesh(geo, grassMaterial(), Math.max(placements.length, 1))
  placements.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.count = placements.length
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.name = 'foliage'
  return mesh
}

/**
 * Accumulates every tree in a stage into two meshes: one for wood, one for
 * leaves. Trees are static, so the transform is baked into the vertices.
 */
export class TreeFarm {
  private wood: THREE.BufferGeometry[] = []
  private leaves: THREE.BufferGeometry[] = []

  /**
   * Thin, half-bare trees. The frame is mostly fog, so a tree has to read as a
   * vertical line with a few pale leaf clumps hanging off it - a solid blob of
   * canopy just looks like a smudge at this resolution.
   */
  add(rng: Rng, height: number, position: THREE.Vector3, yaw: number): void {
    const root = new THREE.Matrix4().makeRotationY(yaw)
    root.premultiply(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z))

    const trunkH = height * 0.88
    const trunk = new THREE.CylinderGeometry(height * 0.012, height * 0.032, trunkH, 5, 1)
    trunk.translate(0, trunkH / 2, 0)
    trunk.applyMatrix4(root)
    this.wood.push(trunk)

    const clump = (x: number, y: number, z: number, size: number, yaw: number) => {
      // Crossed pair so the clump has volume from every angle.
      for (let k = 0; k < 2; k++) {
        const leaf = new THREE.PlaneGeometry(size, size * rng.range(0.7, 0.95))
        leaf.rotateY(yaw + (k * Math.PI) / 2)
        leaf.translate(x, y, z)
        leaf.applyMatrix4(root)
        this.leaves.push(leaf)
      }
    }

    const branches = rng.int(4, 6)
    for (let i = 0; i < branches; i++) {
      const t = 0.5 + (i / branches) * 0.45
      const y = trunkH * t
      const len = height * rng.range(0.16, 0.3) * (1.2 - t)
      const dir = rng.range(0, Math.PI * 2)
      // Branches lift away from vertical; too much tilt and they read as bars.
      const lift = rng.range(0.35, 0.75)

      const branch = new THREE.CylinderGeometry(height * 0.009, height * 0.019, len, 4, 1)
      branch.translate(0, len / 2, 0)
      branch.rotateX(lift)
      branch.rotateY(-dir)
      branch.translate(0, y, 0)
      branch.applyMatrix4(root)
      this.wood.push(branch)

      const tipX = Math.sin(dir) * Math.sin(lift) * len
      const tipZ = Math.cos(dir) * Math.sin(lift) * len
      const tipY = y + Math.cos(lift) * len
      clump(tipX, tipY, tipZ, height * rng.range(0.26, 0.4), -dir)
    }

    // A looser crown above the trunk, so the tree has a top rather than
    // trailing off into a bare spike.
    const crown = rng.int(2, 3)
    for (let i = 0; i < crown; i++) {
      clump(
        rng.range(-0.5, 0.5), trunkH + rng.range(-0.3, 0.6), rng.range(-0.5, 0.5),
        height * rng.range(0.3, 0.45), rng.range(0, Math.PI),
      )
    }
  }

  /** Two draw calls for every tree in the stage. */
  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    if (this.wood.length) {
      const m = new THREE.Mesh(mergeGeometries(this.wood)!, barkMaterial())
      m.name = 'trees.wood'
      m.frustumCulled = false
      out.push(m)
    }
    if (this.leaves.length) {
      const m = new THREE.Mesh(mergeGeometries(this.leaves)!, leafMaterial())
      m.name = 'trees.leaves'
      m.frustumCulled = false
      out.push(m)
    }
    return out
  }
}

/**
 * Roof-and-gable silhouettes parked at the edge of visibility. In fog this
 * thick they never resolve into buildings, which is exactly the point: the
 * hamlet is always just out of reach. Merged into a single mesh.
 */
/** Static rocks merged into one mesh. */
export class RockField {
  private parts: THREE.BufferGeometry[] = []

  add(rng: Rng, size: number, position: THREE.Vector3, yaw: number): void {
    const geo = new THREE.IcosahedronGeometry(size, 0)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i,
        pos.getX(i) * rng.range(0.7, 1.3),
        pos.getY(i) * rng.range(0.5, 0.9),
        pos.getZ(i) * rng.range(0.7, 1.3))
    }
    geo.computeVertexNormals()
    geo.rotateY(yaw)
    geo.translate(position.x, position.y, position.z)
    this.parts.push(geo)
  }

  build(): THREE.Object3D[] {
    if (!this.parts.length) return []
    const m = new THREE.Mesh(
      mergeGeometries(this.parts)!,
      new Ps2Material({ map: textures.stoneWall(), color: 0x9aa0a6 }),
    )
    m.name = 'rocks'
    m.frustumCulled = false
    return [m]
  }
}

export class RoofLine {
  private walls: THREE.BufferGeometry[] = []
  private roofs: THREE.BufferGeometry[] = []

  add(rng: Rng, width: number, position: THREE.Vector3, yaw: number): void {
    const root = new THREE.Matrix4().makeRotationY(yaw)
    root.premultiply(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z))

    const wallH = width * rng.range(0.28, 0.4)
    const body = new THREE.BoxGeometry(width, wallH, width * 0.7)
    body.translate(0, wallH / 2, 0)
    body.applyMatrix4(root)
    this.walls.push(body)

    const roof = new THREE.ConeGeometry(width * 0.78, width * rng.range(0.3, 0.45), 4)
    roof.rotateY(Math.PI / 4)
    roof.translate(0, wallH + width * 0.16, 0)
    roof.applyMatrix4(root)
    this.roofs.push(roof)
  }

  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    if (this.walls.length) out.push(new THREE.Mesh(mergeGeometries(this.walls)!, new Ps2Material({ color: 0x555b60 })))
    if (this.roofs.length) out.push(new THREE.Mesh(mergeGeometries(this.roofs)!, new Ps2Material({ color: 0x42484d })))
    for (const o of out) o.frustumCulled = false
    return out
  }
}
