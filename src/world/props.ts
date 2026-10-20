import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Ps2Material } from '../render/ps2/material'
import { textures } from '../render/ps2/textures'
import type { Terrain } from './terrain'
import type { CollisionWorld } from './collision'

/** A dirt ribbon laid over the terrain - PS2 games used separate path geometry. */
export function buildPath(terrain: Terrain, points: THREE.Vector2[], width: number): THREE.Mesh {
  const segments = points.length - 1
  const pos: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  const lift = 0.04
  let dist = 0

  for (let i = 0; i <= segments; i++) {
    const p = points[Math.min(i, segments)]
    const prev = points[Math.max(i - 1, 0)]
    const next = points[Math.min(i + 1, segments)]
    const dir = new THREE.Vector2().subVectors(next, prev).normalize()
    const nrm = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2)
    if (i > 0) dist += p.distanceTo(prev)

    const lx = p.x + nrm.x, lz = p.y + nrm.y
    const rx = p.x - nrm.x, rz = p.y - nrm.y
    pos.push(lx, terrain.heightAt(lx, lz) + lift, lz)
    pos.push(rx, terrain.heightAt(rx, rz) + lift, rz)
    uvs.push(0, dist / 4, 1, dist / 4)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, c, b, b, c, d)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()

  const tex = textures.path()
  tex.repeat.set(1, 1)
  const mesh = new THREE.Mesh(geo, new Ps2Material({ map: tex, color: 0xd2ccc0 }))
  mesh.name = 'path'
  mesh.renderOrder = 1
  return mesh
}

/** Dry-stone retaining wall following a polyline, like the terraced fields. */
export function buildStoneWall(
  terrain: Terrain,
  collision: CollisionWorld,
  points: THREE.Vector2[],
  height: number,
  thickness = 0.55,
): THREE.Group {
  const tex = textures.stoneWall()
  const mat = new Ps2Material({ map: tex.clone(), color: 0xffffff })
  ;(mat.uniforms.map.value as THREE.Texture).repeat.set(1, 1)
  const parts: THREE.BufferGeometry[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const len = a.distanceTo(b)
    if (len < 0.01) continue
    const mid = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5)
    const yaw = Math.atan2(b.y - a.y, b.x - a.x)
    const ground = Math.min(terrain.heightAt(a.x, a.y), terrain.heightAt(b.x, b.y))
    const skirt = 0.8

    const geo = new THREE.BoxGeometry(len, height + skirt, thickness)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * len / 2.2, uv.getY(v) * (height + skirt) / 1.6)
    uv.needsUpdate = true

    geo.rotateY(-yaw)
    geo.translate(mid.x, ground + height / 2 - skirt / 2, mid.y)
    parts.push(geo)

    collision.add(
      new THREE.Vector3(mid.x, ground + height / 2 - skirt / 2, mid.y),
      new THREE.Vector3(len / 2, (height + skirt) / 2, thickness / 2),
      -yaw, true, 'wall',
    )
  }

  const group = new THREE.Group()
  group.name = 'stoneWall'
  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat)
    mesh.frustumCulled = false
    group.add(mesh)
  }
  return group
}

/** Simple wooden utility pole / fence post row. */
export function buildFence(
  terrain: Terrain,
  collision: CollisionWorld,
  points: THREE.Vector2[],
  height = 1.2,
): THREE.Group {
  const mat = new Ps2Material({ map: textures.bark(), color: 0xa89e8c })
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const len = a.distanceTo(b)
    const yaw = Math.atan2(b.y - a.y, b.x - a.x)
    const steps = Math.max(1, Math.round(len / 2.4))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const x = a.x + (b.x - a.x) * t
      const z = a.y + (b.y - a.y) * t
      const post = new THREE.BoxGeometry(0.12, height, 0.12)
      post.translate(x, terrain.heightAt(x, z) + height / 2, z)
      parts.push(post)
    }
    for (const yOff of [height * 0.55, height * 0.9]) {
      const mid = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5)
      const rail = new THREE.BoxGeometry(len, 0.08, 0.06)
      rail.rotateY(-yaw)
      rail.translate(mid.x, terrain.heightAt(mid.x, mid.y) + yOff, mid.y)
      parts.push(rail)
    }
    const mid = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5)
    collision.add(
      new THREE.Vector3(mid.x, terrain.heightAt(mid.x, mid.y) + height / 2, mid.y),
      new THREE.Vector3(len / 2, height / 2, 0.12),
      -yaw, false, 'fence',
    )
  }

  const group = new THREE.Group()
  group.name = 'fence'
  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat)
    mesh.frustumCulled = false
    group.add(mesh)
  }
  return group
}
