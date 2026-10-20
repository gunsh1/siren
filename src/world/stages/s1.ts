import * as THREE from 'three'
import { Rng } from '../../core/rng'
import { Terrain } from '../terrain'
import { World, AMBIENCE } from '../world'
import { buildPath, buildStoneWall, buildFence } from '../props'
import { scatterFoliage, TreeFarm, RoofLine, RockField } from '../scatter'
import { textures } from '../../render/ps2/textures'

/** Centreline of the track at a given z. Everything else is placed relative to it. */
export function trackX(z: number): number {
  return 6 + Math.sin(z * 0.017) * 2.2
}

const Z_START = 95
const Z_END = -95

/**
 * Stage 1 - the foggy mountain track above the terraced fields.
 * Wide, sloping, almost no landmarks: the fog is the level design. The player
 * follows the low retaining wall downhill toward the hamlet.
 */
export function buildStage1(): { world: World; spawn: THREE.Vector3; goal: THREE.Vector3 } {
  const world = new World()
  const rng = new Rng(0x51524e31)

  const terrain = new Terrain({
    size: 220,
    cell: 2,
    seed: 4711,
    amplitude: 2.6,
    frequency: 0.016,
    texture: textures.grass(),
    // A hillside falling away to the north. The ground drops sharply just left
    // of the track, which is what the retaining wall is holding up.
    shape: (x, z) => {
      const slope = -z * 0.075
      const drop = -THREE.MathUtils.smoothstep(x, trackX(z) - 9, trackX(z) - 3.2) * -2.6 - 2.6
      const terrace = Math.floor((x + 110) / 40) * 0.8
      return slope + terrace + drop
    },
  })
  world.setTerrain(terrain)
  world.setAmbience(AMBIENCE.fogDay)

  const track: THREE.Vector2[] = []
  for (let z = Z_START; z >= Z_END; z -= 3) track.push(new THREE.Vector2(trackX(z), z))
  world.add(buildPath(terrain, track, 2.6))

  // Low retaining wall on the downhill side - waist high, grass above it.
  const wallLine = track.map((p) => new THREE.Vector2(p.x - 2.4, p.y))
  world.add(buildStoneWall(terrain, world.collision, wallLine, 0.95, 0.5))

  // A second terrace wall further down the slope, mostly lost in the fog.
  const lowerWall: THREE.Vector2[] = []
  for (let z = Z_START; z >= Z_END; z -= 3) lowerWall.push(new THREE.Vector2(trackX(z) - 17, z))
  world.add(buildStoneWall(terrain, world.collision, lowerWall, 0.85, 0.5))

  world.add(buildFence(terrain, world.collision, [
    new THREE.Vector2(26, 60), new THREE.Vector2(30, 18), new THREE.Vector2(27, -22),
  ]))

  const offTrack = (x: number, z: number) => Math.abs(x - trackX(z)) > 1.15
  // Trees never crowd the track - a trunk filling half the frame kills the shot.
  const treeClear = (x: number, z: number) => Math.abs(x - trackX(z)) > 7

  // Grass creeping over the edge of the track, then the wider fields.
  world.add(scatterFoliage(terrain, {
    count: 900, seed: 12, area: { x: 6, z: 0, w: 12, d: 200 },
    width: [0.3, 0.6], height: [0.45, 0.9], accept: offTrack,
  }))
  world.add(scatterFoliage(terrain, {
    count: 1100, seed: 13, area: { x: 0, z: 0, w: 210, d: 210 },
    width: [0.5, 1.1], height: [0.8, 1.7], accept: offTrack,
  }))

  // Sparse, thin trees. In the fog they are the only depth cue.
  const trees = new TreeFarm()
  for (let i = 0; i < 110; i++) {
    const x = rng.range(-100, 100)
    const z = rng.range(-100, 100)
    if (!treeClear(x, z)) continue
    const h = rng.range(5, 9)
    const y = terrain.heightAt(x, z)
    trees.add(rng, h, new THREE.Vector3(x, y, z), rng.range(0, Math.PI * 2))
    world.collision.add(
      new THREE.Vector3(x, y + h * 0.35, z),
      new THREE.Vector3(0.24, h * 0.35, 0.24), 0, false, 'tree',
    )
  }
  // A few trees placed deliberately close to the track. Scattered trees all
  // land in the fog; the player needs something with scale near the path.
  for (const [z, side, h] of [[62, 1, 8.5], [30, -1, 7.2], [-4, 1, 9], [-40, -1, 7.8], [-70, 1, 8.2]] as const) {
    const x = trackX(z) + side * rng.range(8, 12)
    const y = terrain.heightAt(x, z)
    trees.add(rng, h, new THREE.Vector3(x, y, z), rng.range(0, Math.PI * 2))
    world.collision.add(
      new THREE.Vector3(x, y + h * 0.35, z),
      new THREE.Vector3(0.24, h * 0.35, 0.24), 0, false, 'tree',
    )
  }
  world.add(...trees.build())

  // The hamlet downhill: never reachable in this stage, only ever a shape.
  const roofs = new RoofLine()
  for (let i = 0; i < 14; i++) {
    const x = rng.range(-55, 55)
    const z = rng.range(-105, -55)
    roofs.add(rng, rng.range(6, 11), new THREE.Vector3(x, terrain.heightAt(x, z), z), rng.range(0, Math.PI * 2))
  }
  world.add(...roofs.build())

  const rocks = new RockField()
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-90, 90)
    const z = rng.range(-90, 90)
    if (!offTrack(x, z)) continue
    rocks.add(rng, rng.range(0.3, 0.9), new THREE.Vector3(x, terrain.heightAt(x, z), z), rng.range(0, Math.PI * 2))
  }
  world.add(...rocks.build())

  return {
    world,
    spawn: new THREE.Vector3(trackX(80), terrain.heightAt(trackX(80), 80), 80),
    goal: new THREE.Vector3(trackX(-88), terrain.heightAt(trackX(-88), -88), -88),
  }
}
