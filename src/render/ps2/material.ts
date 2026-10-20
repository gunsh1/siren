import * as THREE from 'three'
import { lightUniforms, MAX_POINTS } from './lightRig'

/**
 * Gouraud (per-vertex) lit material with exp2 fog baked in.
 * PS2 hardware shaded per vertex; doing the same is most of the "look" -
 * flat facets, light that pops as geometry rotates, no specular highlights.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

uniform vec3 uAmbient;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uDirDirection;
uniform vec3 uDirColor;
uniform vec3 uPointPos[${MAX_POINTS}];
uniform vec3 uPointColor[${MAX_POINTS}];
uniform float uPointRange[${MAX_POINTS}];
uniform int uPointCount;
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec3 uSpotColor;
uniform float uSpotRange;
uniform float uSpotCos;

varying vec3 vLight;
varying vec2 vUv;
varying float vFogDepth;
#ifdef USE_COLOR
varying vec3 vVertexColor;
#endif

float falloff(float dist, float range) {
  float t = clamp(1.0 - dist / max(range, 0.0001), 0.0, 1.0);
  return t * t;
}

void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  #ifdef USE_INSTANCING
  vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vec3 N = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
  vec4 worldPos4 = modelMatrix * vec4(transformed, 1.0);
  vec3 N = normalize(mat3(modelMatrix) * objectNormal);
  #endif
  vec3 worldPos = worldPos4.xyz;

  // Hemisphere term: sky above, bounced ground below.
  float hemi = N.y * 0.5 + 0.5;
  vec3 light = uAmbient + mix(uHemiGround, uHemiSky, hemi);

  // Single directional "moon".
  light += uDirColor * max(dot(N, uDirDirection), 0.0);

  for (int i = 0; i < ${MAX_POINTS}; i++) {
    if (i >= uPointCount) break;
    vec3 toLight = uPointPos[i] - worldPos;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, 0.0001);
    light += uPointColor[i] * max(dot(N, L), 0.0) * falloff(dist, uPointRange[i]);
  }

  if (uSpotRange > 0.0) {
    vec3 toLight = uSpotPos - worldPos;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, 0.0001);
    float cone = dot(-L, uSpotDir);
    float edge = smoothstep(uSpotCos, mix(uSpotCos, 1.0, 0.35), cone);
    light += uSpotColor * max(dot(N, L), 0.0) * falloff(dist, uSpotRange) * edge;
  }

  vLight = light;
  #ifdef USE_COLOR
  vVertexColor = color;
  #endif

  vec4 mvPosition = viewMatrix * worldPos4;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogDensity;
#ifdef USE_MAP
uniform sampler2D map;
#endif
#ifdef ALPHATEST_ENABLED
uniform float uAlphaTest;
#endif

varying vec3 vLight;
varying vec2 vUv;
varying float vFogDepth;
#ifdef USE_COLOR
varying vec3 vVertexColor;
#endif

void main() {
  vec4 base = vec4(uColor, uOpacity);
  #ifdef USE_MAP
  base *= texture2D(map, vUv);
  #endif
  #ifdef ALPHATEST_ENABLED
  if (base.a < uAlphaTest) discard;
  #endif
  #ifdef USE_COLOR
  base.rgb *= vVertexColor;
  #endif

  vec3 col = base.rgb * vLight + uEmissive;

  float f = 1.0 - exp(-(vFogDepth * uFogDensity) * (vFogDepth * uFogDensity));
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));

  gl_FragColor = vec4(col, base.a);
}
`

export interface Ps2MaterialOptions {
  color?: THREE.ColorRepresentation
  map?: THREE.Texture | null
  emissive?: THREE.ColorRepresentation
  opacity?: number
  transparent?: boolean
  alphaTest?: number
  vertexColors?: boolean
  side?: THREE.Side
  depthWrite?: boolean
}

export class Ps2Material extends THREE.ShaderMaterial {
  constructor(opts: Ps2MaterialOptions = {}) {
    const defines: Record<string, string> = {}
    if (opts.map) defines.USE_MAP = ''
    if (opts.vertexColors) defines.USE_COLOR = ''
    if (opts.alphaTest) defines.ALPHATEST_ENABLED = ''

    super({
      vertexShader,
      fragmentShader,
      defines,
      vertexColors: opts.vertexColors ?? false,
      transparent: opts.transparent ?? false,
      side: opts.side ?? THREE.FrontSide,
      depthWrite: opts.depthWrite ?? true,
      uniforms: {
        // Shared by reference so lightRig updates hit every material at once.
        ...lightUniforms,
        uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
        uEmissive: { value: new THREE.Color(opts.emissive ?? 0x000000) },
        uOpacity: { value: opts.opacity ?? 1 },
        uAlphaTest: { value: opts.alphaTest ?? 0 },
        map: { value: opts.map ?? null },
      },
    })
  }

  setColor(c: THREE.ColorRepresentation): this {
    ;(this.uniforms.uColor.value as THREE.Color).set(c)
    return this
  }
}
