// Checks the animation database end to end, and prints what is still missing.
//
// The point is the coverage table: with a sparse library the resolver always
// answers, so nothing visibly breaks - it just quietly plays the wrong clip.
// This turns that into a printed shopping list of Mixamo searches.
//
//   npm run check:anim

import { launch, assertNoErrors, hasFlag } from './harness.mjs'

// An incomplete library is the normal state while clips are still being
// collected, so gaps are reported loudly but do not fail the run. Pass
// --strict once the library is meant to be complete.
const STRICT = hasFlag('strict')

const { page, close, errors } = await launch()
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
  if (!ok) failures++
}

try {
  const info = await page.evaluate(async () => {
    await window.__siren.charactersReady()
    return window.__siren.anim()
  })

  check('animation index loaded', info.loaded)
  check('index has entries', info.entries > 0, `${info.entries} clip(s)`)
  check('character is skinned and animating', info.skinned && info.clip !== null, info.clip ?? 'placeholder only')

  // Every file the index points at must actually be there.
  const missing = await page.evaluate(async () => {
    const res = await fetch('/models/anim/anim-index.json')
    const index = await res.json()
    const bad = []
    for (const file of new Set(index.entries.map((e) => e.file))) {
      const head = await fetch('/' + file, { method: 'HEAD' })
      if (!head.ok) bad.push(file)
    }
    return bad
  })
  check('every indexed file resolves', missing.length === 0, missing.join(', '))

  // Retiming must stay inside the range where a clip still reads correctly.
  const retime = await page.evaluate(() => {
    const walk = window.__siren.resolve({ category: 'locomotion', posture: 'stand', speed: 1.9, loop: true })
    const run = window.__siren.resolve({ category: 'locomotion', posture: 'stand', speed: 4.6, loop: true })
    return { walk, run }
  })
  check('walking resolves', retime.walk !== null, retime.walk?.id ?? '')
  if (retime.walk) {
    check('walk playback rate stays believable',
      retime.walk.timeScale >= 0.55 && retime.walk.timeScale <= 1.75,
      `x${retime.walk.timeScale.toFixed(2)}`)
  }

  const coverage = await page.evaluate(() => window.__siren.coverage())
  const unresolved = coverage.filter((c) => c.essential && !c.picked)
  if (STRICT) {
    check('every essential slot resolves to something', unresolved.length === 0,
      unresolved.map((c) => c.slot).join(', '))
  } else if (unresolved.length) {
    console.log(`warn  ${unresolved.length} essential slot(s) have no clip yet (--strict to fail on this)`)
  }

  // The database is only useful if something in it is actually a real match.
  const exact = coverage.filter((c) => c.picked && c.exact && c.postureOk)
  check('database covers at least one slot properly', exact.length > 0,
    `${exact.length}/${coverage.length} slots`)

  console.log('\ncoverage')
  console.log('slot'.padEnd(22) + 'picked'.padEnd(22) + 'match'.padEnd(10) + 'rate'.padStart(6))
  for (const c of coverage) {
    const quality = !c.picked ? 'MISSING' : c.exact && c.postureOk ? 'exact' : 'fallback'
    console.log(
      c.slot.padEnd(22) +
      (c.picked ?? '-').slice(0, 21).padEnd(22) +
      quality.padEnd(10) +
      (c.timeScale ? 'x' + c.timeScale.toFixed(2) : '-').padStart(6),
    )
  }

  const gaps = coverage.filter((c) => !c.picked || !c.exact || !c.postureOk)
  if (gaps.length) {
    console.log(`\n${gaps.length} slot(s) not covered by a real clip.`)
    console.log('Download these from mixamo.com (FBX Binary, 30fps, no keyframe reduction,')
    console.log('"Without Skin") and drop them in public/models/anim/, then: npm run anim:index\n')
    const terms = new Set()
    for (const g of gaps) for (const t of g.search) terms.add(t)
    for (const t of [...terms].sort()) console.log('  - ' + t)
  }
} finally {
  assertNoErrors(errors)
  await close()
}

if (failures) {
  console.error(`\n${failures} animation check(s) failed`)
  process.exit(1)
}
console.log('\nanimation checks passed')

process.exit(process.exitCode ?? 0)
