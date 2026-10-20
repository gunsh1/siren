import * as THREE from 'three'
import { ValueNoise2D } from '../core/noise'
import { Ps2Material } from '../render/ps2/material'
import { textures } from '../render/ps2/textures'

export interface TerrainOptions {
  size: number
  /** Metres per grid cell. PS2 terrain was coarse - 2m keeps the tri count low. */
  cell: number
  seed: number
  /** World-space height function; noise is added on top. */
  shape?: (x: number, z: number) => number
  amplitude?: number
  frequency?: number
  texture?: THREE.Texture
  color?: number
}

/**
 * Heightfield terrain. Owns the authoritative ground height so the player
 * controller, AI navigation and prop placement all agree on where the floor is.
 */
export class Terrain {
  readonly mesh: THREE.Mesh
  readonly size: number
  readonly cell: number
  private cols: number
  private heights: Float32Array

  constructor(opts: TerrainOptions) {
    this.size = opts.size
    this.cell = opts.cell
    const noise = new ValueNoise2D(opts.seed)
    const amp = opts.amplitude ?? 6
    const freq = opts.frequency ?? 0.012
    const n = Math.round(opts.size / opts.cell)
    this.cols = n + 1
    this.heights = new Float32Array(this.cols * this.cols)

    const half = opts.size / 2
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = -half + i * opts.cell
        const z = -half + j * opts.cell
        const base = opts.shape ? opts.shape(x, z) : 0
        this.heights[j * this.cols + i] = base + noise.fbm(x * freq, z * freq, 4) * amp
      }
    }

    const geo = new THREE.PlaneGeometry(opts.size, opts.size, n, n)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const vi = j * this.cols + i
        pos.setY(vi, this.heights[vi])
        // Baked variation so flat-lit ground is not a single dead colour.
        const t = 0.78 + noise.sample(i * 0.35, j * 0.35) * 0.22
        colors[vi * 3] = t
        colors[vi * 3 + 1] = t
        colors[vi * 3 + 2] = t * 0.98
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const tex = opts.texture ?? textures.grass()
    tex.repeat.set(opts.size / 6, opts.size / 6)
    this.mesh = new THREE.Mesh(geo, new Ps2Material({
      map: tex,
      color: opts.color ?? 0xffffff,
      vertexColors: true,
    }))
    this.mesh.name = 'terrain'
    this.mesh.frustumCulled = false
  }

  /** Bilinear-sampled ground height. Outside the field returns the edge value. */
  heightAt(x: number, z: number): number {
    const half = this.size / 2
    const fx = THREE.MathUtils.clamp((x + half) / this.cell, 0, this.cols - 1.001)
    const fz = THREE.MathUtils.clamp((z + half) / this.cell, 0, this.cols - 1.001)
    const i = Math.floor(fx), j = Math.floor(fz)
    const tx = fx - i, tz = fz - j
    const h00 = this.heights[j * this.cols + i]
    const h10 = this.heights[j * this.cols + i + 1]
    const h01 = this.heights[(j + 1) * this.cols + i]
    const h11 = this.heights[(j + 1) * this.cols + i + 1]
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
  }

  /** Steepness in radians, used to keep the player off cliffs. */
  slopeAt(x: number, z: number): number {
    const d = this.cell
    const dx = this.heightAt(x + d, z) - this.heightAt(x - d, z)
    const dz = this.heightAt(x, z + d) - this.heightAt(x, z - d)
    return Math.atan(Math.hypot(dx, dz) / (2 * d))
  }
}
