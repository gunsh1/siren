import * as THREE from 'three'

export const MAX_POINTS = 4

/**
 * Shared uniform block for every Ps2Material. PS2 had no deferred lighting and
 * very few dynamic lights, so we keep one directional + a handful of points.
 */
export const lightUniforms = {
  uAmbient: { value: new THREE.Color(0x1a1e24) },
  uHemiSky: { value: new THREE.Color(0x2a3038) },
  uHemiGround: { value: new THREE.Color(0x0b0d10) },
  uDirDirection: { value: new THREE.Vector3(0.3, 0.9, 0.2).normalize() },
  uDirColor: { value: new THREE.Color(0x30363c) },
  uPointPos: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector3()) },
  uPointColor: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Color(0)) },
  uPointRange: { value: new Float32Array(MAX_POINTS) },
  uPointCount: { value: 0 },
  uSpotPos: { value: new THREE.Vector3() },
  uSpotDir: { value: new THREE.Vector3(0, 0, -1) },
  uSpotColor: { value: new THREE.Color(0) },
  uSpotRange: { value: 0 },
  uSpotCos: { value: Math.cos(0.5) },
  uFogColor: { value: new THREE.Color(0x8a9099) },
  uFogDensity: { value: 0.045 },
}

export interface PointLightDesc {
  position: THREE.Vector3
  color: THREE.ColorRepresentation
  range: number
  intensity?: number
}

export const lightRig = {
  setAmbient(sky: THREE.ColorRepresentation, ground: THREE.ColorRepresentation, ambient: THREE.ColorRepresentation) {
    lightUniforms.uHemiSky.value.set(sky)
    lightUniforms.uHemiGround.value.set(ground)
    lightUniforms.uAmbient.value.set(ambient)
  },
  setSun(direction: THREE.Vector3, color: THREE.ColorRepresentation) {
    lightUniforms.uDirDirection.value.copy(direction).normalize()
    lightUniforms.uDirColor.value.set(color)
  },
  setFog(color: THREE.ColorRepresentation, density: number) {
    lightUniforms.uFogColor.value.set(color)
    lightUniforms.uFogDensity.value = density
  },
  setPoints(lights: readonly PointLightDesc[]) {
    const n = Math.min(lights.length, MAX_POINTS)
    for (let i = 0; i < n; i++) {
      const l = lights[i]
      lightUniforms.uPointPos.value[i].copy(l.position)
      lightUniforms.uPointColor.value[i].set(l.color).multiplyScalar(l.intensity ?? 1)
      lightUniforms.uPointRange.value[i] = l.range
    }
    lightUniforms.uPointCount.value = n
  },
  /** The flashlight. Only one exists, so it gets its own slot. */
  setSpot(position: THREE.Vector3, direction: THREE.Vector3, color: THREE.ColorRepresentation, range: number, angleRad: number) {
    lightUniforms.uSpotPos.value.copy(position)
    lightUniforms.uSpotDir.value.copy(direction).normalize()
    lightUniforms.uSpotColor.value.set(color)
    lightUniforms.uSpotRange.value = range
    lightUniforms.uSpotCos.value = Math.cos(angleRad)
  },
  clearSpot() {
    lightUniforms.uSpotColor.value.setScalar(0)
    lightUniforms.uSpotRange.value = 0
  },
}
