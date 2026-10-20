// Diagnostic: walks the character-loading path one step at a time with its own
// timeouts, so a hang points at a stage instead of just timing out silently.

import { launch, assertNoErrors } from './harness.mjs'

const { page, close, errors } = await launch()
const step = async (name, fn, ms = 45_000) => {
  const t0 = Date.now()
  try {
    const out = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms)),
    ])
    console.log(`ok   ${name} (${Date.now() - t0}ms)`, out === undefined ? '' : JSON.stringify(out))
    return out
  } catch (err) {
    console.log(`FAIL ${name} (${Date.now() - t0}ms): ${err.message}`)
    return null
  }
}

try {
  await step('fetch index', () => page.evaluate(async () => {
    const r = await fetch('/models/anim/anim-index.json')
    const j = await r.json()
    return { ok: r.ok, entries: j.entries?.length }
  }))

  await step('fetch character fbx head', () => page.evaluate(async () => {
    const r = await fetch('/models/actors/syun/syun.fbx')
    const b = await r.arrayBuffer()
    return { ok: r.ok, bytes: b.byteLength }
  }))

  await step('charactersReady', () => page.evaluate(() => window.__siren.charactersReady()), 120_000)
  await step('anim state', () => page.evaluate(() => window.__siren.anim()))
  await step('stats', () => page.evaluate(() => window.__siren.stats()))
} finally {
  assertNoErrors(errors)
  await close()
}

process.exit(process.exitCode ?? 0)
