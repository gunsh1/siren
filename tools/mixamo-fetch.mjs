// Downloads the animations the game asks for, baked onto your own character.
//
//   npm run mixamo:fetch                       # everything still missing
//   npm run mixamo:fetch -- --query "Crawling" # just one
//   npm run mixamo:fetch -- --character <uuid>
//
// Requires `npm run mixamo:login` first. The search terms come from
// src/anim/requirements.ts, so the game's shopping list stays the one source
// of truth.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { openSession, readToken, api, MIXAMO, bail } from './mixamo/session.mjs'
import { argOf, hasFlag } from './harness.mjs'

const OUT_DIR = path.join('public', 'models', 'anim')
const ONE = argOf('query', null)
const CHARACTER = argOf('character', null)
const FORCE = hasFlag('force')
const asList = (json) => (Array.isArray(json) ? json : json?.results ?? [])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Pull the search terms out of the requirements table. */
function shoppingList() {
  const src = readFileSync('src/anim/requirements.ts', 'utf8')
  const terms = []
  for (const m of src.matchAll(/search:\s*\[([^\]]*)\]/g)) {
    for (const t of m[1].matchAll(/'([^']+)'/g)) terms.push(t[1])
  }
  const unique = [...new Set(terms)]
  if (unique.length < 5) {
    bail('could not read the search terms from src/anim/requirements.ts')
  }
  return unique
}

/** Prefer an exact name match; Mixamo search is fuzzy and returns packs too. */
function bestMatch(results, term) {
  const motions = results.filter((r) => r.type === 'Motion')
  const want = term.toLowerCase()
  return (
    motions.find((r) => (r.name ?? '').toLowerCase() === want) ??
    motions.find((r) => (r.name ?? '').toLowerCase().startsWith(want)) ??
    motions.find((r) => (r.name ?? '').toLowerCase().includes(want)) ??
    motions[0] ??
    null
  )
}

/**
 * The export endpoint wants the product's gms_hash with `params` flattened
 * from [[name, value], ...] to "value,value". Passing it through unchanged is
 * accepted and then silently produces the default motion.
 */
function exportHash(details) {
  const gms = details?.gms_hash
  if (!gms) return null
  const params = Array.isArray(gms.params) ? gms.params.map((p) => p[1]).join(',') : (gms.params ?? '')
  return { ...gms, params }
}

const terms = ONE ? [ONE] : shoppingList()
mkdirSync(OUT_DIR, { recursive: true })

const { page, close } = await openSession({ headless: true })
const done = []
const skipped = []
const failed = []

try {
  await page.goto(MIXAMO, { waitUntil: 'domcontentloaded' })
  const { token } = await readToken(page)
  if (!token) bail('not signed in - run: npm run mixamo:login')

  let characterId = CHARACTER
  if (!characterId) {
    const chars = asList((await api(page, '/api/v1/characters?limit=200', token)).json)
    const own = chars.filter((c) => c.type !== 'system')
    const target = own[0] ?? chars.find((c) => c.name === 'Y Bot') ?? chars[0]
    if (!target) bail('no characters available')
    characterId = target.uuid
    console.log(`baking onto: ${target.name} (${target.type === 'system' ? 'stock rig' : 'your upload'})\n`)
  }

  for (const term of terms) {
    const file = path.join(OUT_DIR, `${term.replace(/[^\w -]/g, '')}.fbx`)
    if (existsSync(file) && !FORCE) { skipped.push(term); continue }

    try {
      const search = await api(
        page,
        `/api/v1/products?page=1&limit=12&order=&type=Motion%2CMotionPack&query=${encodeURIComponent(term)}`,
        token,
      )
      const match = bestMatch(asList(search.json), term)
      if (!match) { failed.push(`${term}: no result`); continue }

      const detail = await api(page, `/api/v1/products/${match.id}?similar=0&character_id=${characterId}`, token)
      const gms = exportHash(detail.json?.details)
      if (!gms) { failed.push(`${term}: no gms_hash`); continue }

      const body = JSON.stringify({
        gms_hash: [gms],
        preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
        character_id: characterId,
        type: 'Motion',
        product_name: match.name,
      })
      const started = await api(page, '/api/v1/animations/export', token, { method: 'POST', body })
      if (!started.ok) { failed.push(`${term}: export HTTP ${started.status} ${started.text ?? ''}`); continue }

      // Mixamo processes one export per character, so poll rather than batch.
      let url = null
      for (let i = 0; i < 60; i++) {
        await sleep(1500)
        const mon = await api(page, `/api/v1/characters/${characterId}/monitor`, token)
        const status = mon.json?.status
        if (status === 'completed') { url = mon.json.job_result; break }
        if (status === 'failed') { failed.push(`${term}: mixamo reported failure`); break }
      }
      if (!url) { if (!failed.some((f) => f.startsWith(term))) failed.push(`${term}: timed out`); continue }

      const res = await fetch(url)
      if (!res.ok) { failed.push(`${term}: download HTTP ${res.status}`); continue }
      const bytes = Buffer.from(await res.arrayBuffer())
      writeFileSync(file, bytes)
      done.push(`${term} -> ${path.basename(file)} (${(bytes.length / 1024 / 1024).toFixed(2)} MB, "${match.name}")`)
      console.log(`ok    ${done[done.length - 1]}`)
    } catch (err) {
      failed.push(`${term}: ${err instanceof Error ? err.message : String(err)}`)
      console.log(`FAIL  ${term}: ${failed[failed.length - 1]}`)
    }
  }
} finally {
  await close()
}

console.log(`\ndownloaded ${done.length}, already present ${skipped.length}, failed ${failed.length}`)
for (const f of failed) console.log(`  FAIL ${f}`)
if (done.length) console.log('\nNext: npm run anim:index && npm run check:anim')
process.exit(failed.length && !done.length ? 1 : 0)
