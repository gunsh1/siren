// Opens a real browser window so you can sign in to Mixamo once.
//
//   npm run mixamo:login
//
// The session lives in .mixamo-profile/ (gitignored). Nothing here reads,
// stores or transmits credentials - the profile holds the session exactly the
// way a normal browser does.
//
// Signing in bounces through Adobe and can land in a new tab, so this watches
// every open tab rather than the one it started with.

import { openSession, readToken, api, MIXAMO } from './mixamo/session.mjs'

const WAIT_MS = Number(process.env.MIXAMO_LOGIN_WAIT ?? 900_000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { context, page, close } = await openSession({ headless: false })

let closed = false
context.on('close', () => { closed = true })

try {
  await page.goto(MIXAMO, { waitUntil: 'domcontentloaded' }).catch(() => {})
  console.log('A browser window is open. Sign in to Mixamo with your Adobe ID.')
  console.log('Leave the window open - it closes itself once the session is detected.\n')

  const deadline = Date.now() + WAIT_MS
  let found = null
  let mixamoPage = page

  while (!closed && Date.now() < deadline) {
    const pages = context.pages().filter((p) => !p.isClosed())
    if (!pages.length) {
      console.error('\nAll tabs were closed before sign-in completed. Run the command again.')
      process.exit(1)
    }

    // The token belongs to mixamo.com, so only that origin can hold it.
    const onMixamo = pages.filter((p) => p.url().includes('mixamo.com'))
    for (const candidate of onMixamo) {
      const result = await readToken(candidate).catch(() => ({ token: null }))
      if (result.token) { found = result; mixamoPage = candidate; break }
    }
    if (found) break

    // Signed in on Adobe but never sent back? Nudge the tab home.
    if (!onMixamo.length) {
      await pages[0].goto(MIXAMO, { waitUntil: 'domcontentloaded' }).catch(() => {})
    }

    await sleep(2000)
  }

  if (closed) {
    console.error('\nThe browser was closed before sign-in completed. Run the command again.')
    process.exit(1)
  }
  if (!found) {
    console.error('\nNo session appeared before the timeout. Run the command again.')
    process.exit(1)
  }

  console.log(`signed in - token found in ${found.source}`)

  // Prove the token authenticates before declaring victory.
  const me = await api(mixamoPage, '/api/v1/characters?limit=10', found.token)
  console.log(`api check: HTTP ${me.status}`)
  if (!me.ok) {
    console.error('Token did not authenticate:', me.text ?? JSON.stringify(me.json).slice(0, 300))
    process.exit(1)
  }

  const characters = me.json?.results ?? []
  console.log(`\ncharacters in your account: ${me.json?.pagination?.num_results ?? characters.length}`)
  for (const c of characters) console.log(`  ${c.id}  ${c.name ?? c.description ?? '(unnamed)'}`)
  console.log('\nready. Next: npm run mixamo:probe')
} finally {
  await close()
}

process.exit(process.exitCode ?? 0)
