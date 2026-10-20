import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { resolveAnim, type AnimPick, type AnimRequest } from './resolve'
import type { AnimEntry, AnimIndex } from './types'

export interface ClipOptions {
  /**
   * Hips rest height of the character this clip is going onto, in file units.
   * Rescales the baked hips curve so a clip authored on a taller rig does not
   * leave this character floating.
   */
  targetHipsUnits?: number
  /**
   * Remove the baked horizontal translation. The controller owns where the
   * character is; without this the animation fights it and the character
   * drifts off the path.
   */
  stripRootMotion?: boolean
}

/**
 * The animation database at runtime: the measured index plus lazy loading of
 * the FBX files it points at.
 *
 * Clips are cached per (entry, target rig) because preparing one means cloning
 * and rewriting its hips curve.
 */
export class AnimationLibrary {
  private files = new Map<string, Promise<THREE.Group>>()
  private clips = new Map<string, THREE.AnimationClip>()
  private loader = new FBXLoader()

  private constructor(readonly index: AnimIndex, private baseUrl: string) {}

  static async load(url = '/models/anim/anim-index.json'): Promise<AnimationLibrary> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`no animation index at ${url} - run: npm run anim:index`)
    const index = (await res.json()) as AnimIndex
    const base = url.slice(0, url.lastIndexOf('/models/')) || ''
    return new AnimationLibrary(index, base)
  }

  get entries(): readonly AnimEntry[] { return this.index.entries }

  /** How tall the rig the index was built from stands, in metres. */
  get referenceHeight(): number { return this.index.referenceHeight }

  resolve(req: AnimRequest): AnimPick | null {
    return resolveAnim(this.index.entries, req)
  }

  private loadFile(file: string): Promise<THREE.Group> {
    let p = this.files.get(file)
    if (!p) {
      p = this.loader.loadAsync(`${this.baseUrl}/${file}`)
      this.files.set(file, p)
    }
    return p
  }

  async clipFor(entry: AnimEntry, opts: ClipOptions = {}): Promise<THREE.AnimationClip> {
    const strip = opts.stripRootMotion ?? true
    const key = `${entry.id}|${opts.targetHipsUnits ?? 0}|${strip}`
    const cached = this.clips.get(key)
    if (cached) return cached

    const group = await this.loadFile(entry.file)
    const index = entry.id.includes('#') ? Number(entry.id.split('#')[1]) : 0
    const source = group.animations[index] ?? group.animations[0]
    if (!source) throw new Error(`no clip in ${entry.file}`)

    const clip = source.clone()
    const heightScale = opts.targetHipsUnits && entry.rig.hipsUnits > 0
      ? opts.targetHipsUnits / entry.rig.hipsUnits
      : 1

    for (const track of clip.tracks) {
      if (!track.name.endsWith('.position')) continue
      const isHips = /hips\.position$/i.test(track.name)
      if (!isHips) continue
      const values = track.values as Float32Array
      for (let i = 0; i < values.length; i += 3) {
        if (strip) {
          // Keep the first frame's X/Z so the character stays where the
          // controller put them, but keep every frame's Y so weight shifts,
          // crouches and falls still read.
          values[i] = values[0]
          values[i + 2] = values[2]
        }
        values[i + 1] *= heightScale
      }
    }

    clip.name = entry.id
    this.clips.set(key, clip)
    return clip
  }

  /** Frees the parsed FBX meshes; the extracted clips stay cached. */
  releaseSources(): void {
    for (const p of this.files.values()) {
      p.then((group) => {
        group.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.geometry) mesh.geometry.dispose()
        })
      }).catch(() => {})
    }
    this.files.clear()
  }
}
