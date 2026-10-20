// Takes the reference shots used to judge the PS2 look.
//
// The look IS the product here: fog density, dither strength and interlace
// cannot be tuned by reasoning about numbers. Run this after every render
// change and actually look at the files.
//
//   npm run build && npm run shot
//   npm run shot -- --only track --width 1280 --height 960

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { launch, argOf, assertNoErrors } from './harness.mjs'

const OUT = path.resolve(argOf('out', 'tools/shots'))
const WIDTH = Number(argOf('width', 1024))
const HEIGHT = Number(argOf('height', 768))
const ONLY = argOf('only', null)

// Mirrors trackX() in src/world/stages/s1.ts so presets stay on the path.
const trackX = (z) => 6 + Math.sin(z * 0.017) * 2.2

// x, z, yaw(radians), stance, ambience
const PRESETS = [
  { name: 'track', x: trackX(60), z: 60, yaw: 0, stance: 'stand', ambience: 'fogDay',
    note: 'Down the track - the reference-image framing' },
  { name: 'wall', x: trackX(20), z: 20, yaw: -Math.PI * 0.28, stance: 'stand', ambience: 'fogDay',
    note: 'Retaining wall on the left, fields beyond' },
  { name: 'uphill', x: trackX(-20), z: -20, yaw: Math.PI, stance: 'stand', ambience: 'fogDay',
    note: 'Looking back up the hill into the fog' },
  { name: 'crouch', x: trackX(40), z: 40, yaw: 0, stance: 'crouch', ambience: 'fogDay',
    note: 'Crouched, low camera' },
  { name: 'prone', x: trackX(40), z: 40, yaw: 0, stance: 'prone', ambience: 'fogDay',
    note: 'Prone in the grass' },
  { name: 'night', x: trackX(60), z: 60, yaw: 0, stance: 'stand', ambience: 'nightExterior',
    note: 'Same spot at night - checks the dark end of the curve' },
]

await mkdir(OUT, { recursive: true })
const { page, close, errors } = await launch({ width: WIDTH, height: HEIGHT })

try {
  const webgl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    return gl ? gl.getParameter(gl.VERSION) : null
  })
  console.log('WebGL:', webgl ?? 'UNAVAILABLE')

  // The skinned character loads after the world does; without this the shots
  // catch the placeholder body.
  await page.evaluate(() => window.__siren.charactersReady())
  const anim = await page.evaluate(() => window.__siren.anim())
  console.log('anim db:', anim.entries, 'entries, playing:', anim.clip ?? 'placeholder')

  for (const p of PRESETS) {
    if (ONLY && p.name !== ONLY) continue
    await page.evaluate((preset) => {
      window.__siren.setAmbience(preset.ambience)
      window.__siren.setStance(preset.stance)
      window.__siren.teleport(preset.x, preset.z, preset.yaw)
      window.__siren.step(30)
    }, p)
    await page.waitForTimeout(250)
    const file = path.join(OUT, `${p.name}.png`)
    await page.screenshot({ path: file })
    const stats = await page.evaluate(() => window.__siren.sampleFrame())
    console.log(
      `${p.name.padEnd(8)} colors=${String(stats.uniqueColors).padStart(5)}` +
      ` mean=${stats.mean.toFixed(1).padStart(6)}  ${p.note}`,
    )
  }
  console.log(`\nwrote ${OUT}`)
} finally {
  assertNoErrors(errors)
  await close()
}

process.exit(process.exitCode ?? 0)
