import * as THREE from 'three'
import { ps2Live } from '../render/ps2/params'
import { REQUIRED_SLOTS } from '../anim/requirements'
import type { Game } from '../game'

/**
 * window.__siren - the seam every headless check drives the game through.
 * Anything the tools need must be exposed here rather than poked at directly.
 */
export interface SirenDebugApi {
  ready: boolean
  ps2: typeof ps2Live
  frame: number
  player: { x: number; y: number; z: number; stance: string; speed: number }
  /** Place the player and camera instantly (screenshot presets, checks). */
  teleport(x: number, z: number, yaw?: number): void
  setStance(s: 'stand' | 'crouch' | 'prone'): void
  hold(action: string, on: boolean): void
  look(dx: number, dy: number): void
  /** Run N fixed steps without waiting for real frames. */
  step(count: number): void
  /** Internal buffer size, for the render regression check. */
  bufferSize(): [number, number]
  /** Unique colours in the presented frame - proves the dither/quantise ran. */
  sampleFrame(): { width: number; height: number; uniqueColors: number; mean: number }
  setAmbience(name: string): void
  /** Draw calls and triangles for the last frame. */
  stats(): { calls: number; triangles: number; objects: number }
  /** Wait for the character model and animation database to finish loading. */
  charactersReady(): Promise<void>
  /** What the animation resolver picked, and why. */
  anim(): {
    loaded: boolean
    entries: number
    skinned: boolean
    clip: string | null
    timeScale: number
    reason: string | null
  }
  /** Frame the character for inspection: boom length and downward pitch. */
  camera(distance: number, pitch: number, height?: number): void
  /** Pin one clip by id, for the animation contact sheet. */
  playClip(id: string, phase?: number): Promise<boolean>
  /** Every clip id in the database. */
  clipIds(): string[]
  /** Ask the resolver directly, without touching the game state. */
  resolve(req: unknown): { id: string; timeScale: number; reason: string } | null
  /** Resolve every slot the game needs and report how well it is covered. */
  coverage(): {
    slot: string
    essential: boolean
    picked: string | null
    exact: boolean
    postureOk: boolean
    timeScale: number
    search: string[]
  }[]
}

export function installDebugApi(game: Game): void {
  const api: SirenDebugApi = {
    ready: true,
    ps2: ps2Live,
    get frame() { return game.frameCount },
    get player() {
      const p = game.player.position
      return { x: p.x, y: p.y, z: p.z, stance: game.player.stance, speed: game.player.speed }
    },
    teleport(x, z, yaw) {
      game.player.position.set(x, game.world.groundAt(x, z), z)
      game.player.velocity.set(0, 0, 0)
      if (yaw !== undefined) {
        game.rig.yaw = yaw
        // Face where the camera faces, not where the camera sits.
        game.player.facing = yaw + Math.PI
      }
      game.rig.snap()
      game.stepFixed(1 / 60)
    },
    setStance(s) { game.player.stance = s },
    hold(action, on) { game.input.set(action as never, on) },
    look(dx, dy) { game.input.look(dx, dy) },
    step(count) { for (let i = 0; i < count; i++) game.stepFixed(1 / 60); game.render() },
    bufferSize() { return [game.renderer.target.width, game.renderer.target.height] },
    sampleFrame() {
      // readPixels sees the last presented frame, and rAF has not run since the
      // caller changed state - so present one synchronously first.
      game.render()
      const canvas = game.renderer.domElement
      const rect = game.renderer.viewportRect()
      const gl = game.renderer.renderer.getContext()
      const w = Math.min(rect.w, 256)
      const h = Math.min(rect.h, 256)
      const x = rect.x + Math.floor((rect.w - w) / 2)
      const y = rect.y + Math.floor((rect.h - h) / 2)
      const buf = new Uint8Array(w * h * 4)
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
      const seen = new Set<number>()
      let sum = 0
      for (let i = 0; i < buf.length; i += 4) {
        seen.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2])
        sum += (buf[i] + buf[i + 1] + buf[i + 2]) / 3
      }
      void canvas
      return { width: w, height: h, uniqueColors: seen.size, mean: sum / (buf.length / 4) }
    },
    setAmbience(name) { game.setAmbience(name) },
    charactersReady: () => game.charactersReady,
    anim() {
      const view = game.player.view as { playing?: { entry: { id: string }; timeScale: number; reason: string } }
      const pick = view.playing ?? null
      return {
        loaded: game.animations !== null,
        entries: game.animations?.entries.length ?? 0,
        skinned: pick !== undefined && view.playing !== undefined,
        clip: pick?.entry.id ?? null,
        timeScale: pick?.timeScale ?? 0,
        reason: pick?.reason ?? null,
      }
    },
    coverage() {
      const lib = game.animations
      return REQUIRED_SLOTS.map((slot) => {
        const pick = lib?.resolve(slot.request) ?? null
        return {
          slot: slot.name,
          essential: slot.essential,
          picked: pick?.entry.id ?? null,
          // The resolver annotates a downgraded match, so trust that rather
          // than re-deriving the rule here.
          exact: !!pick && !pick.reason.includes('fallback'),
          postureOk: !slot.request.posture || pick?.entry.posture === slot.request.posture,
          timeScale: pick?.timeScale ?? 0,
          search: slot.search,
        }
      })
    },
    camera(distance, pitch, height) {
      game.rig.distance = distance
      game.rig.pitch = pitch
      game.rig.focusHeight = height
      game.rig.snap()
      game.stepFixed(1 / 60)
      game.render()
    },
    clipIds() { return (game.animations?.entries ?? []).map((e) => e.id) },
    async playClip(id, phase) {
      const view = game.player.view as { playById?: (id: string, phase?: number) => Promise<boolean> }
      if (!view.playById) return false
      const ok = await view.playById(id, phase)
      game.render()
      return ok
    },
    resolve(req) {
      const pick = game.animations?.resolve(req as never)
      if (!pick) return null
      return { id: pick.entry.id, timeScale: pick.timeScale, reason: pick.reason }
    },
    stats() {
      game.render()
      const info = game.renderer.sceneStats
      let objects = 0
      game.world.scene.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) objects++ })
      return { calls: info.calls, triangles: info.triangles, objects }
    },
  }
  ;(window as unknown as { __siren: SirenDebugApi }).__siren = api
  void THREE
}
