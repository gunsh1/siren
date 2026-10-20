// Builds public/models/anim/anim-index.json by actually playing every animation
// and measuring it.
//
// Mixamo names every exported clip "mixamo.com", so the file name is the only
// text there is - and it never tells you how fast the character moves. The
// index records measured speed, stride, posture and loopability so the runtime
// can pick a clip that matches the character's real velocity and time-scale it
// until the feet stop sliding.
//
//   npm run anim:index

import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { launch, assertNoErrors } from './harness.mjs'

const PUBLIC = 'public'
const ANIM_DIR = 'models/anim'
const ACTOR_DIR = 'models/actors'
const OUT = path.join(PUBLIC, ANIM_DIR, 'anim-index.json')

async function fbxUnder(dir) {
  const abs = path.join(PUBLIC, dir)
  const out = []
  let entries
  try {
    entries = await readdir(abs, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isDirectory()) out.push(...await fbxUnder(path.join(dir, e.name)))
    else if (e.name.toLowerCase().endsWith('.fbx')) out.push('/' + path.join(dir, e.name).split(path.sep).join('/'))
  }
  return out
}

const files = [...await fbxUnder(ANIM_DIR), ...await fbxUnder(ACTOR_DIR)]
if (!files.length) {
  console.error(`no .fbx found under ${PUBLIC}/${ANIM_DIR} or ${PUBLIC}/${ACTOR_DIR}`)
  process.exit(1)
}
console.log(`analysing ${files.length} file(s)`)

const { page, close, errors } = await launch({
  dev: true,
  port: 5199,
  path: '/tools/anim-index/index.html',
  ready: 'typeof window.__buildAnimIndex === "function"',
})

try {
  const result = await page.evaluate((list) => window.__buildAnimIndex(list), files)

  for (const e of result.errors) console.error(`  SKIP ${e.file}: ${e.message}`)

  const { index } = result
  await writeFile(OUT, JSON.stringify(index, null, 2) + '\n')

  console.log(`\nreference height: ${index.referenceHeight.toFixed(2)} m`)
  console.log(
    'id'.padEnd(24) + 'category'.padEnd(12) + 'posture'.padEnd(8) +
    'dir'.padEnd(10) + 'speed'.padStart(7) + 'impl'.padStart(7) +
    'steps'.padStart(6) + 'alt'.padStart(6) + 'reg'.padStart(6) + 'yaw'.padStart(7) + 'lat'.padStart(6) +
    'loop'.padStart(6) + 'dur'.padStart(7),
  )
  for (const e of index.entries) {
    const m = e.measurements
    console.log(
      e.id.slice(0, 23).padEnd(24) +
      e.category.padEnd(12) +
      e.posture.padEnd(8) +
      e.direction.padEnd(10) +
      m.speed.toFixed(2).padStart(7) +
      m.impliedSpeed.toFixed(2).padStart(7) +
      String(m.steps).padStart(6) +
      m.alternation.toFixed(2).padStart(6) +
      m.gaitRegularity.toFixed(2).padStart(6) +
      m.yawWander.toFixed(0).padStart(7) +
      m.lateralRatio.toFixed(2).padStart(6) +
      m.loopScore.toFixed(2).padStart(6) +
      m.duration.toFixed(2).padStart(7),
    )
  }
  console.log(`\nwrote ${OUT} (${index.entries.length} entries)`)
  if (result.errors.length) process.exitCode = 1
} finally {
  assertNoErrors(errors)
  await close()
}

process.exit(process.exitCode ?? 0)
