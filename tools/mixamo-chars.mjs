// Lists the characters available for export.
// The endpoint returns a bare array, not the {results:[...]} envelope the
// product endpoints use - reading it the wrong way silently reports zero.

import { openSession, readToken, api, MIXAMO, bail } from './mixamo/session.mjs'

const asList = (json) => (Array.isArray(json) ? json : json?.results ?? [])

const { page, close } = await openSession({ headless: true })
try {
  await page.goto(MIXAMO, { waitUntil: 'domcontentloaded' })
  const { token } = await readToken(page)
  if (!token) bail('not signed in - run: npm run mixamo:login')

  const r = await api(page, '/api/v1/characters?limit=200', token)
  const all = asList(r.json)
  const own = all.filter((c) => c.type !== 'system')
  console.log(`characters visible: ${all.length}  (your own uploads: ${own.length})`)
  for (const c of own) console.log(`  YOURS  ${c.uuid}  ${c.name}`)
  console.log('\nneutral rigs suitable as an export target:')
  for (const c of all) {
    if (/bot|remy|leonard|ely|jody|kachujin|erika|michelle|louise|malcolm/i.test(c.name ?? '')) {
      console.log(`  ${c.uuid}  ${c.name}`)
    }
  }
} finally { await close() }
process.exit(process.exitCode ?? 0)
