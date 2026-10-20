import { Rng } from './rng'

/** Seeded value noise with cubic interpolation. Enough for terrain and scatter. */
export class ValueNoise2D {
  private perm: Uint8Array
  private grad: Float32Array

  constructor(seed = 1337) {
    const rng = new Rng(seed)
    this.perm = new Uint8Array(512)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i)
      const t = p[i]; p[i] = p[j]; p[j] = t
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
    this.grad = new Float32Array(256)
    for (let i = 0; i < 256; i++) this.grad[i] = rng.range(-1, 1)
  }

  private at(ix: number, iy: number): number {
    return this.grad[this.perm[(this.perm[ix & 255] + iy) & 255]]
  }

  sample(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = this.at(ix, iy), b = this.at(ix + 1, iy)
    const c = this.at(ix, iy + 1), d = this.at(ix + 1, iy + 1)
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy
  }

  /** Fractal sum. Returns roughly -1..1. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq) * amp
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}
