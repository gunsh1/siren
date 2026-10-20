// Regression guard for the PS2 render path.
//
// The look is easy to break silently: a stray colour-space change, a lost
// render target, a dither uniform that stops being uploaded. These assertions
// catch the classes of failure that a screenshot alone would not flag.

import { launch, assertNoErrors } from './harness.mjs'

const { page, close, errors } = await launch()
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
  if (!ok) failures++
}

try {
  const size = await page.evaluate(() => window.__siren.bufferSize())
  check('internal buffer is 512x448', size[0] === 512 && size[1] === 448, size.join('x'))

  // Bright fog scene: the quantiser must collapse it well below 24bit colour.
  const day = await page.evaluate(() => {
    window.__siren.setAmbience('fogDay')
    window.__siren.teleport(6, 60, 0)
    window.__siren.step(20)
    return window.__siren.sampleFrame()
  })
  const maxColors = day.width * day.height
  check('quantisation reduces colour count', day.uniqueColors < maxColors * 0.05,
    `${day.uniqueColors} unique in ${maxColors} px`)
  check('dither still produces gradation', day.uniqueColors > 120, `${day.uniqueColors} unique`)
  check('foggy day sits in the mid greys', day.mean > 70 && day.mean < 160, `mean=${day.mean.toFixed(1)}`)

  const night = await page.evaluate(() => {
    window.__siren.setAmbience('nightInterior')
    window.__siren.step(20)
    return window.__siren.sampleFrame()
  })
  check('night is dark but not crushed to black', night.mean > 3 && night.mean < 45,
    `mean=${night.mean.toFixed(1)}`)
  check('night keeps readable silhouettes', night.uniqueColors > 12, `${night.uniqueColors} unique`)

  // Draw-call budget. PS2 was draw-call bound and so is the software
  // renderer these checks run on: one mesh per tree took the frame from
  // milliseconds to tens of seconds. Static scenery must stay batched.
  const stats = await page.evaluate(() => {
    window.__siren.setAmbience('fogDay')
    window.__siren.teleport(6, 60, 0)
    return window.__siren.stats()
  })
  check('static scenery stays batched', stats.objects < 40, `${stats.objects} meshes in scene`)
  check('draw calls stay in budget', stats.calls < 40, `${stats.calls} calls`)
  check('triangle count is PS2-scale', stats.triangles < 200000, `${stats.triangles} tris`)

  // Turning the video pass off must visibly change the frame - proves the
  // composite uniforms are actually reaching the shader.
  const flat = await page.evaluate(() => {
    window.__siren.setAmbience('fogDay')
    window.__siren.ps2.color.dither = 0
    window.__siren.ps2.video.grain = 0
    window.__siren.step(4)
    const s = window.__siren.sampleFrame()
    window.__siren.ps2.color.dither = 1
    window.__siren.ps2.video.grain = 0.022
    return s
  })
  check('dither is doing work', flat.uniqueColors < day.uniqueColors,
    `${flat.uniqueColors} without vs ${day.uniqueColors} with`)
} finally {
  assertNoErrors(errors)
  await close()
}

if (failures) {
  console.error(`\n${failures} render check(s) failed`)
  process.exit(1)
}
console.log('\nrender checks passed')

process.exit(process.exitCode ?? 0)
