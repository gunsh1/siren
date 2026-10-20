import * as THREE from 'three'
import { Terrain } from './terrain'
import { CollisionWorld } from './collision'
import { lightRig } from '../render/ps2/lightRig'

export interface Ambience {
  fogColor: number
  fogDensity: number
  clearColor: number
  hemiSky: number
  hemiGround: number
  ambient: number
  sunColor: number
  sunDirection: THREE.Vector3
}

export const AMBIENCE: Record<string, Ambience> = {
  /** Reference image 1: flat grey-blue daylight, everything drowned in fog. */
  fogDay: {
    fogColor: 0x8f959c,
    fogDensity: 0.045,
    clearColor: 0x8f959c,
    hemiSky: 0x6e747c,
    hemiGround: 0x33352f,
    ambient: 0x2a2d31,
    sunColor: 0x3a3e42,
    sunDirection: new THREE.Vector3(0.25, 0.85, 0.35),
  },
  /** Reference image 2: interior at night, barely readable silhouettes. */
  nightInterior: {
    fogColor: 0x05070a,
    fogDensity: 0.11,
    clearColor: 0x04060a,
    hemiSky: 0x1a2029,
    hemiGround: 0x05070a,
    ambient: 0x090c11,
    sunColor: 0x0d1219,
    sunDirection: new THREE.Vector3(0.2, 0.9, -0.3),
  },
  nightExterior: {
    fogColor: 0x0d1116,
    fogDensity: 0.055,
    clearColor: 0x0b0f14,
    hemiSky: 0x232b35,
    hemiGround: 0x070a0d,
    ambient: 0x0e1218,
    sunColor: 0x1b222b,
    sunDirection: new THREE.Vector3(-0.3, 0.8, 0.4),
  },
}

/** Everything a stage needs to exist: visuals, ground truth, and blockers. */
export class World {
  readonly scene = new THREE.Scene()
  readonly collision = new CollisionWorld()
  terrain!: Terrain
  ambience: Ambience = AMBIENCE.fogDay

  setTerrain(t: Terrain): void {
    this.terrain = t
    this.scene.add(t.mesh)
  }

  setAmbience(a: Ambience): void {
    this.ambience = a
    lightRig.setFog(a.fogColor, a.fogDensity)
    lightRig.setAmbient(a.hemiSky, a.hemiGround, a.ambient)
    lightRig.setSun(a.sunDirection, a.sunColor)
  }

  add(...objects: THREE.Object3D[]): void {
    for (const o of objects) this.scene.add(o)
  }

  /** Ground height with a floor fallback for interiors built on flat pads. */
  groundAt(x: number, z: number): number {
    return this.terrain ? this.terrain.heightAt(x, z) : 0
  }
}
