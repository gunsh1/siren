import * as THREE from 'three'
import { ps2Live } from './params'

/**
 * Final "this was captured off a PS2 on a CRT and re-encoded" pass.
 * Order matters: chroma smear -> saturation -> interlace -> lift -> vignette
 * -> ordered dither to RGB555 -> grain. Dither must be near the end or the
 * later steps smooth the banding right back out.
 */
const fragmentShader = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uSize;
uniform float uFrame;
uniform float uBits;
uniform float uDither;
uniform float uSaturation;
uniform float uInterlace;
uniform float uChromaBleed;
uniform float uGrain;
uniform float uVignette;
uniform float uBlackLift;
uniform float uBorder;

varying vec2 vUv;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

// Compact ordered Bayer 4x4 in [0,1).
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 texel = 1.0 / uSize;
  vec2 uv = vUv;

  vec3 c1 = texture2D(tSource, uv).rgb;
  vec3 c0 = texture2D(tSource, uv - vec2(texel.x * uChromaBleed, 0.0)).rgb;
  vec3 c2 = texture2D(tSource, uv + vec2(texel.x * uChromaBleed, 0.0)).rgb;

  // Keep luma sharp, smear only chroma - that is what composite video does.
  float y = dot(c1, LUMA);
  vec3 chroma = ((c0 - dot(c0, LUMA)) + (c1 - dot(c1, LUMA)) + (c2 - dot(c2, LUMA))) / 3.0;
  vec3 col = vec3(y) + chroma * uSaturation;

  // Interlace: one field of scanlines sits slightly darker, alternating per frame.
  float row = floor(uv.y * uSize.y);
  float field = mod(uFrame, 2.0);
  float odd = step(0.5, abs(mod(row, 2.0) - field));
  col *= 1.0 - uInterlace * odd;

  col = col * (1.0 - uBlackLift) + uBlackLift;

  float r = length(uv - 0.5) * 1.42;
  col *= 1.0 - uVignette * r * r;

  // Dark edge just inside the frame, like a slightly overscanned capture.
  vec2 e = min(uv, 1.0 - uv);
  float edge = smoothstep(0.0, 0.012, min(e.x, e.y));
  col *= mix(1.0 - uBorder, 1.0, edge);

  // Quantise to the 16bit framebuffer with ordered dithering.
  float levels = pow(2.0, uBits) - 1.0;
  float d = (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
  col = floor(clamp(col, 0.0, 1.0) * levels + 0.5 + d) / levels;

  col += (hash(uv * uSize + uFrame) - 0.5) * uGrain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export class CompositePass {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  readonly material: THREE.ShaderMaterial

  constructor(source: THREE.Texture, width: number, height: number) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tSource: { value: source },
        uSize: { value: new THREE.Vector2(width, height) },
        uFrame: { value: 0 },
        uBits: { value: ps2Live.color.bits },
        uDither: { value: ps2Live.color.dither },
        uSaturation: { value: ps2Live.color.saturation },
        uInterlace: { value: ps2Live.video.interlace },
        uChromaBleed: { value: ps2Live.video.chromaBleed },
        uGrain: { value: ps2Live.video.grain },
        uVignette: { value: ps2Live.video.vignette },
        uBlackLift: { value: ps2Live.video.blackLift },
        uBorder: { value: ps2Live.video.border },
      },
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    quad.frustumCulled = false
    this.scene.add(quad)
  }

  /** Pull the live tuning values in. Called every frame; cheap. */
  sync(frame: number): void {
    const u = this.material.uniforms
    u.uFrame.value = frame
    u.uBits.value = ps2Live.color.bits
    u.uDither.value = ps2Live.color.dither
    u.uSaturation.value = ps2Live.color.saturation
    u.uInterlace.value = ps2Live.video.interlace
    u.uChromaBleed.value = ps2Live.video.chromaBleed
    u.uGrain.value = ps2Live.video.grain
    u.uVignette.value = ps2Live.video.vignette
    u.uBlackLift.value = ps2Live.video.blackLift
    u.uBorder.value = ps2Live.video.border
  }
}
