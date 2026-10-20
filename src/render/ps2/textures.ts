import * as THREE from 'three'
import { Rng } from '../../core/rng'

/**
 * All textures are generated on a 2D canvas at PS2 sizes (64-128px) and read
 * with bilinear + mipmaps, anisotropy 1. Low resolution is what sells the era,
 * not point sampling - PS2 had proper bilinear filtering.
 */
const cache = new Map<string, THREE.Texture>()

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, rng: Rng, s: number) => void): THREE.Texture {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  let seed = 0
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0
  draw(ctx, new Rng(seed), size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 1
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

function speckle(ctx: CanvasRenderingContext2D, rng: Rng, s: number, count: number, colors: string[], min: number, max: number) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng.pick(colors)
    ctx.fillRect(rng.range(0, s), rng.range(0, s), rng.range(min, max), rng.range(min, max))
  }
}

export const textures = {
  dirt: () => make('dirt', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#5b5348'; ctx.fillRect(0, 0, s, s)
    speckle(ctx, rng, s, 900, ['#6a6154', '#4e473d', '#736a5b', '#443e35'], 1, 5)
  }),
  grass: () => make('grass', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#525641'; ctx.fillRect(0, 0, s, s)
    speckle(ctx, rng, s, 1200, ['#5b5f48', '#484c39', '#63664c', '#3e4231'], 1, 4)
    speckle(ctx, rng, s, 140, ['#6d7057', '#7a7c63'], 1, 3)
  }),
  path: () => make('path', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#5f574b'; ctx.fillRect(0, 0, s, s)
    speckle(ctx, rng, s, 620, ['#665d50', '#574f45', '#6d6355'], 2, 7)
    // Wheel ruts run along V so they follow the track once it is repeated.
    for (const x of [s * 0.22, s * 0.74]) {
      ctx.fillStyle = 'rgba(58,52,44,0.55)'
      ctx.fillRect(x, 0, s * 0.12, s)
    }
    speckle(ctx, rng, s, 90, ['#7b7264', '#4a443a'], 1, 3)
  }),
  stoneWall: () => make('stoneWall', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#3d3a33'; ctx.fillRect(0, 0, s, s)
    for (let y = 0; y < s; y += 15) {
      let x = -rng.range(0, 20)
      while (x < s) {
        const w = rng.range(16, 34)
        ctx.fillStyle = rng.pick(['#635e52', '#585349', '#6b6558', '#4d4941', '#726b5c'])
        ctx.fillRect(x + 1.5, y + 1.5, w - 2.5, 12)
        x += w
      }
    }
    // Moss gathers in the joints and towards the bottom of the wall.
    for (let i = 0; i < 220; i++) {
      const y = s - Math.pow(rng.next(), 0.55) * s
      ctx.fillStyle = rng.pick(['rgba(86,94,63,0.55)', 'rgba(70,78,52,0.45)', 'rgba(99,104,74,0.4)'])
      ctx.fillRect(rng.range(0, s), y, rng.range(2, 9), rng.range(2, 6))
    }
    speckle(ctx, rng, s, 200, ['#332f29', '#7d7666'], 1, 3)
  }),
  woodPlank: () => make('woodPlank', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#4a3f33'; ctx.fillRect(0, 0, s, s)
    for (let y = 0; y < s; y += 12) {
      ctx.fillStyle = rng.pick(['#54483a', '#463b30', '#5b4e3f', '#3f362c'])
      ctx.fillRect(0, y, s, 11)
      ctx.fillStyle = '#2e271f'
      ctx.fillRect(0, y + 11, s, 1)
    }
    speckle(ctx, rng, s, 260, ['#3a3128', '#63563f'], 1, 6)
  }),
  tatami: () => make('tatami', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#6e6a4c'; ctx.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 2) {
      ctx.fillStyle = rng.next() > 0.5 ? '#78744f' : '#666246'
      ctx.fillRect(x, 0, 1, s)
    }
    ctx.fillStyle = '#2b2a21'
    ctx.fillRect(0, 0, s, 3); ctx.fillRect(0, s - 3, s, 3)
  }),
  shoji: () => make('shoji', 128, (ctx, _rng, s) => {
    ctx.fillStyle = '#b9b3a2'; ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#4a4236'
    for (let x = 0; x <= s; x += 32) ctx.fillRect(x - 1, 0, 3, s)
    for (let y = 0; y <= s; y += 32) ctx.fillRect(0, y - 1, s, 3)
  }),
  plaster: () => make('plaster', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#7d7768'; ctx.fillRect(0, 0, s, s)
    speckle(ctx, rng, s, 500, ['#878071', '#736d5f', '#5f5a4e'], 1, 6)
  }),
  roofTile: () => make('roofTile', 128, (ctx, rng, s) => {
    ctx.fillStyle = '#31353a'; ctx.fillRect(0, 0, s, s)
    for (let y = 0; y < s; y += 10) {
      for (let x = 0; x < s; x += 10) {
        ctx.fillStyle = rng.pick(['#3a3f45', '#2b2f34', '#434850'])
        ctx.fillRect(x, y, 9, 9)
      }
    }
  }),
  /** Grass clump: blades reach the bottom edge so the quad sits in the ground. */
  foliage: () => make('foliage', 64, (ctx, rng, s) => {
    ctx.clearRect(0, 0, s, s)
    const blade = (x: number, h: number, w: number) => {
      const top = s - h
      ctx.fillStyle = rng.pick(['#4d5339', '#3f452e', '#59603f'])
      ctx.fillRect(x, top + h * 0.35, w, h * 0.65)
      ctx.fillStyle = rng.pick(['#8b9070', '#9ca083', '#7b8163', '#666c4c'])
      ctx.fillRect(x, top, w, h * 0.4)
    }
    // Tallest in the middle so the silhouette is a clump, not a hedge.
    for (let i = 0; i < 120; i++) {
      const x = rng.range(1, s - 6)
      const centre = 1 - Math.abs(x / s - 0.5) * 1.7
      blade(x, s * rng.range(0.35, 0.95) * Math.max(centre, 0.35), rng.range(3, 6))
    }
  }),

  /** Tree canopy: a roundish mass of leaf marks, transparent at the corners. */
  leafClump: () => make('leafClump', 64, (ctx, rng, s) => {
    ctx.clearRect(0, 0, s, s)
    for (let i = 0; i < 260; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = Math.pow(rng.next(), 0.6) * s * 0.46
      const x = s / 2 + Math.cos(a) * r
      const y = s / 2 + Math.sin(a) * r * 0.8
      ctx.fillStyle = rng.pick(['#7d8464', '#8e9578', '#6a7054', '#9ea684', '#6e7452'])
      ctx.fillRect(x, y, rng.range(2.5, 5.5), rng.range(2, 4))
    }
  }),

  bark: () => make('bark', 64, (ctx, rng, s) => {
    ctx.fillStyle = '#453d33'; ctx.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 3) {
      ctx.fillStyle = rng.pick(['#4e463a', '#3a332b', '#565043'])
      ctx.fillRect(x, 0, 2, s)
    }
  }),
  paper: () => make('paper', 64, (ctx, rng, s) => {
    ctx.fillStyle = '#c8c3b4'; ctx.fillRect(0, 0, s, s)
    speckle(ctx, rng, s, 60, ['#b4ae9d', '#d4cfc0'], 1, 4)
  }),
}
