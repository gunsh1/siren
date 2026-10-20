// Dumps the raw shape of the Mixamo API responses we depend on.
//
// The export endpoint needs a "gms_hash" lifted out of the product detail and
// reshaped, and the exact field names have drifted over the years. Guessing
// wastes a login round-trip each time, so look first.
//
//   npm run mixamo:probe -- --query "zombie walk"

import { openSession, readToken, api, MIXAMO, bail } from './mixamo/session.mjs'
import { argOf } from './harness.mjs'

const QUERY = argOf('query', 'walking')

const { page, close } = await openSession({ headless: true })

try {
  await page.goto(MIXAMO, { waitUntil: 'domcontentloaded' })
  const { token, source } = await readToken(page)
  if (!token) bail('not signed in - run: npm run mixamo:login')
  console.log(`token from ${source}\n`)

  const chars = await api(page, '/api/v1/characters?limit=10', token)
  console.log('--- characters ---')
  console.log(JSON.stringify(chars.json, null, 2).slice(0, 2000))

  const search = await api(
    page,
    `/api/v1/products?page=1&limit=4&order=&type=Motion%2CMotionPack&query=${encodeURIComponent(QUERY)}`,
    token,
  )
  console.log('\n--- search results (trimmed) ---')
  const results = search.json?.results ?? []
  for (const r of results) {
    console.log(`${r.id}  ${JSON.stringify(r.name ?? r.description)}  type=${r.type}`)
  }

  if (results[0]) {
    const charId = chars.json?.results?.[0]?.id
    const detail = await api(
      page,
      `/api/v1/products/${results[0].id}?similar=0&character_id=${charId}`,
      token,
    )
    console.log('\n--- product detail ---')
    console.log(JSON.stringify(detail.json, null, 2).slice(0, 3000))
  }
} finally {
  await close()
}

process.exit(process.exitCode ?? 0)
