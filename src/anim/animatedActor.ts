import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Ps2Material } from '../render/ps2/material'
import type { StanceId } from '../player/stance'
import { detectUnitScale } from './analyze'
import { findBones, restHeightUnits, restHipsUnits } from './sample'
import type { AnimationLibrary } from './library'
import type { AnimPick, AnimRequest } from './resolve'
import type { AnimCategory } from './types'

/** Must match the clamp in resolve.ts, or update() re-resolves every frame. */
const clampRate = (r: number) => Math.min(1.75, Math.max(0.55, r))

/** What every character view needs to render a character. Kept small so the
 *  code-generated placeholder and the real skinned model are interchangeable. */
export interface CharacterView {
  readonly root: THREE.Object3D
  update(dt: number, speed: number, stance: StanceId): void
  dispose?(): void
}

export interface AnimatedActorOptions {
  /**
   * Bias for the resolver when several clips fit equally well. Unused while
   * the player is the only character, but the plumbing is what lets a second
   * one share this library instead of needing its own.
   */
  flavour?: string[]
  /** Seconds of crossfade between clips. */
  fade?: number
}

/**
 * A skinned character driven by the animation database.
 *
 * The controller only ever says how fast it is going and what stance it is in;
 * this class turns that into a clip request, lets the resolver pick, and
 * time-scales the result so the feet match the ground speed.
 */
export class AnimatedActor implements CharacterView {
  readonly root = new THREE.Group()
  private mixer: THREE.AnimationMixer
  private current: THREE.AnimationAction | null = null
  private currentPick: AnimPick | null = null
  private pending = 0
  private oneShotUntil = 0
  private time = 0
  /** Set while a specific clip is pinned for inspection. */
  private locked = false

  private constructor(
    private model: THREE.Group,
    private library: AnimationLibrary,
    readonly hipsUnits: number,
    readonly heightMeters: number,
    private opts: AnimatedActorOptions,
  ) {
    this.root.add(model)
    this.mixer = new THREE.AnimationMixer(model)
  }

  static async load(
    url: string,
    library: AnimationLibrary,
    opts: AnimatedActorOptions = {},
  ): Promise<AnimatedActor> {
    const model = await new FBXLoader().loadAsync(url)
    const bones = findBones(model)
    const raw = restHeightUnits(model, bones)
    const { scale, heightMeters } = detectUnitScale(raw)
    const hipsUnits = restHipsUnits(model, bones)

    model.scale.setScalar(scale)
    toPs2Materials(model)

    const actor = new AnimatedActor(model, library, hipsUnits, heightMeters, opts)
    await actor.play({ category: 'idle', loop: true })
    return actor
  }

  get playing(): AnimPick | null { return this.currentPick }

  /** Resolve, load and crossfade to whatever best matches the request. */
  async play(req: AnimRequest, fade = this.opts.fade ?? 0.22): Promise<void> {
    const full: AnimRequest = { ...req, flavour: req.flavour ?? this.opts.flavour }
    const pick = this.library.resolve(full)
    if (!pick) return
    if (this.currentPick?.entry.id === pick.entry.id) {
      // Same clip, different pace: just retime, do not restart it.
      this.currentPick = pick
      if (this.current) this.current.timeScale = pick.timeScale
      return
    }

    const token = ++this.pending
    const clip = await this.library.clipFor(pick.entry, { targetHipsUnits: this.hipsUnits })
    if (token !== this.pending) return // a newer request overtook this one

    const next = this.mixer.clipAction(clip)
    next.enabled = true
    next.setLoop(pick.entry.loops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    next.clampWhenFinished = !pick.entry.loops
    next.timeScale = pick.timeScale
    next.reset()

    if (this.current && this.current !== next) {
      next.crossFadeFrom(this.current, fade, true)
    }
    next.play()

    this.current = next
    this.currentPick = pick
  }

/**
   * Pin one clip by id and hold it, for the animation contact sheet and for
   * eyeballing a single clip. Normal state-driven selection resumes on release.
   */
  async playById(id: string, phase = 0.35): Promise<boolean> {
    const entry = this.library.entries.find((e) => e.id === id)
    if (!entry) return false
    // Lock before awaiting, not after: play() is async, and update() would
    // otherwise slip its own request in and win the race for the mixer.
    this.locked = true
    await this.play({
      category: entry.category,
      posture: entry.posture,
      speed: entry.measurements.effectiveSpeed,
      exclude: this.library.entries.filter((e) => e.id !== id).map((e) => e.id),
    }, 0)
    if (this.current) {
      this.current.timeScale = 1
      this.current.time = entry.measurements.duration * phase
      this.mixer.update(0)
    }
    return this.currentPick?.entry.id === id
  }

  releaseClip(): void { this.locked = false }

  /** Play a one-shot (an attack, a hit reaction) and hold it for its duration. */
  async trigger(category: AnimCategory, req: Partial<AnimRequest> = {}): Promise<void> {
    const pick = this.library.resolve({ category, loop: false, ...req, flavour: req.flavour ?? this.opts.flavour })
    if (!pick) return
    this.oneShotUntil = this.time + pick.entry.measurements.duration / Math.max(pick.timeScale, 0.01)
    await this.play({ category, loop: false, ...req }, 0.1)
  }

  update(dt: number, speed: number, stance: StanceId): void {
    this.time += dt
    this.mixer.update(dt)
    if (this.locked || this.time < this.oneShotUntil) return

    const moving = speed > 0.15
    const req: AnimRequest = moving
      ? { category: 'locomotion', posture: stance, speed, direction: 'forward', loop: true }
      : { category: 'idle', posture: stance, speed: 0, loop: true }

    // Only re-resolve when the answer could actually change: same clip at a
    // slightly different pace is handled by timeScale inside play().
    const cur = this.currentPick
    const changed =
      !cur ||
      (moving ? cur.entry.category !== 'locomotion' : cur.entry.category !== 'idle') ||
      cur.entry.posture !== stance
    const wanted = clampRate(speed / Math.max(cur?.entry.measurements.effectiveSpeed ?? 1, 0.01))
    const retimed = !!cur && moving && Math.abs(cur.timeScale - wanted) > 0.02

    if (changed || retimed) void this.play(req)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  }
}

/**
 * Swap the FBX's Phong materials for the PS2 pipeline's vertex-lit one,
 * keeping the diffuse texture. Without this the character is lit by a
 * completely different model to the world around them and stands out badly.
 */
function toPs2Materials(model: THREE.Object3D): void {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const map = (source as THREE.MeshStandardMaterial).map ?? null
    if (map) {
      map.colorSpace = THREE.NoColorSpace
      map.anisotropy = 1
      map.needsUpdate = true
    }
    const replacement = new Ps2Material({ map, color: 0xffffff })
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
    else mesh.material.dispose()
    mesh.material = replacement
    mesh.frustumCulled = false
  })
}
