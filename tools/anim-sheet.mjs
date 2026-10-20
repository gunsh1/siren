// Renders one screenshot per clip in the database.
//
// The measurements say a clip is a crouched walk; this is how you confirm it
// actually looks like one on your character. Cheap to run, and the only way to
// catch a clip that imported wrong.
//
//   npm run anim:sheet
//   npm run anim:sheet -- --only "Crawling"

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { launch, argOf, assertNoErrors } from './harness.mjs'

const OUT = path.resolve(argOf('out', 'tools/shots/anim'))
const ONLY = argOf('only', null)
const PHASE = Number(argOf('phase', 0.35))

await mkdir(OUT, { recursive: true })
const { page, close, errors } = await launch({ width: 640, height: 480 })

try {
  await page.evaluate(() => window.__siren.charactersReady())

  // Open ground, well clear of the retaining wall - the point is to see the
  // feet meet the floor, and the wall hides exactly that.
  await page.evaluate(() => {
    window.__siren.setAmbience('fogDay')
    window.__siren.teleport(18, 40, Math.PI * 0.85)
    window.__siren.step(10)
    // Full body, slightly above and looking down: feet visible, which is the
    // only way to see whether a clip actually sits on the ground.
    window.__siren.camera(4.2, -0.28, 0.85)
  })

  const ids = await page.evaluate(() => window.__siren.clipIds())
  const wanted = ONLY ? ids.filter((id) => id.toLowerCase().includes(ONLY.toLowerCase())) : ids
  console.log(`${wanted.length} clip(s)`)

  for (const id of wanted) {
    const ok = await page.evaluate(
      ([id, phase]) => window.__siren.playClip(id, phase),
      [id, PHASE],
    )
    await page.waitForTimeout(120)
    const file = path.join(OUT, `${id.replace(/[^\w -]/g, '_')}.png`)
    await page.screenshot({ path: file })
    console.log(`${ok ? 'ok  ' : 'MISS'}  ${id}`)
  }
  console.log(`\nwrote ${OUT}`)
} finally {
  assertNoErrors(errors)
  await close()
}

process.exit(process.exitCode ?? 0)
