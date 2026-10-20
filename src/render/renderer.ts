import * as THREE from 'three'
import { ps2Live } from './ps2/params'
import { CompositePass } from './ps2/composite'

/**
 * Renders any camera into one fixed low-res target, then letterboxes it onto
 * the canvas through the composite pass.
 *
 * renderView takes an arbitrary camera on purpose: sight-jack (M6) is just
 * "render a shibito camera into this same target with extra noise", so the
 * pipeline must never assume there is only one camera.
 */
export class Ps2Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly target: THREE.WebGLRenderTarget
  readonly composite: CompositePass
  private frame = 0
  /** Scene-pass stats, captured before the composite pass overwrites them. */
  readonly sceneStats = { calls: 0, triangles: 0 }

  constructor(container: HTMLElement) {
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(1)
    this.renderer.autoClear = false
    this.renderer.setClearColor(0x000000, 1)

    this.target = new THREE.WebGLRenderTarget(ps2Live.width, ps2Live.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      samples: 0,
      colorSpace: THREE.NoColorSpace,
    })

    this.composite = new CompositePass(this.target.texture, ps2Live.width, ps2Live.height)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  get domElement(): HTMLCanvasElement { return this.renderer.domElement }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
  }

  /** The 4:3 rectangle the image occupies inside the black frame. */
  viewportRect(): { x: number; y: number; w: number; h: number } {
    const cw = this.renderer.domElement.width
    const ch = this.renderer.domElement.height
    const safe = ps2Live.screen.safeArea
    const aspect = ps2Live.screen.aspect
    let w = cw * safe
    let h = w / aspect
    if (h > ch * safe) { h = ch * safe; w = h * aspect }
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w: Math.round(w), h: Math.round(h) }
  }

  /** Draw a scene through any camera into the internal low-res buffer. */
  renderView(scene: THREE.Scene, camera: THREE.Camera, clearColor: THREE.ColorRepresentation): void {
    const r = this.renderer
    r.setRenderTarget(this.target)
    r.setViewport(0, 0, ps2Live.width, ps2Live.height)
    r.setScissorTest(false)
    r.setClearColor(clearColor, 1)
    r.clear(true, true, false)
    r.render(scene, camera)
    this.sceneStats.calls = r.info.render.calls
    this.sceneStats.triangles = r.info.render.triangles
    r.setRenderTarget(null)
  }

  /** Composite the internal buffer onto the canvas, letterboxed. */
  present(): void {
    const r = this.renderer
    this.composite.sync(this.frame)
    r.setViewport(0, 0, r.domElement.width, r.domElement.height)
    r.setScissorTest(false)
    r.setClearColor(0x000000, 1)
    r.clear(true, true, false)

    const rect = this.viewportRect()
    r.setViewport(rect.x, rect.y, rect.w, rect.h)
    r.setScissor(rect.x, rect.y, rect.w, rect.h)
    r.setScissorTest(true)
    r.render(this.composite.scene, this.composite.camera)
    r.setScissorTest(false)
    this.frame++
  }

  /** Convenience for the common single-camera case. */
  draw(scene: THREE.Scene, camera: THREE.Camera, clearColor: THREE.ColorRepresentation): void {
    this.renderView(scene, camera, clearColor)
    this.present()
  }
}
