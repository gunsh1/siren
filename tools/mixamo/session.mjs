// Shared Mixamo session handling.
//
// Mixamo is behind an Adobe login and its API wants a bearer token, so
// everything here runs inside a persistent browser profile that the user has
// logged into once. Nothing reads, stores or transmits their credentials -
// the profile directory holds the session, the same way a normal browser does.

import './../env.mjs'

import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

export const PROFILE_DIR = path.resolve('.mixamo-profile')
export const MIXAMO = 'https://www.mixamo.com'
export const API_KEY = 'mixamo2'

export async function openSession({ headless = false } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: headless ? { width: 1280, height: 900 } : null,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const page = context.pages()[0] ?? await context.newPage()
  return { context, page, close: async () => { await context.close().catch(() => {}) } }
}

/**
 * Pulls the API token out of the logged-in page.
 *
 * Mixamo has moved this between storage keys over the years, so search rather
 * than hard-coding one name - a silent null here looks exactly like "not
 * logged in" and is miserable to debug.
 */
export async function readToken(page) {
  return page.evaluate(() => {
    const candidates = []
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        const value = store.getItem(key) ?? ''
        candidates.push({ key, value })
      }
    }
    const direct = candidates.find((c) => /access[_-]?token/i.test(c.key) && c.value.length > 20)
    if (direct) return { token: direct.value, source: direct.key }

    // Some builds nest it inside a JSON blob.
    for (const c of candidates) {
      if (!c.value.startsWith('{')) continue
      try {
        const parsed = JSON.parse(c.value)
        for (const [k, v] of Object.entries(parsed)) {
          if (/access[_-]?token/i.test(k) && typeof v === 'string' && v.length > 20) {
            return { token: v, source: `${c.key}.${k}` }
          }
        }
      } catch { /* not json after all */ }
    }
    return { token: null, source: null, keys: candidates.map((c) => c.key) }
  })
}

/** Calls the Mixamo API from inside the page, so cookies and CORS just work. */
export async function api(page, pathname, token, init = {}) {
  return page.evaluate(
    async ({ pathname, token, init, apiKey }) => {
      const res = await fetch(pathname, {
        ...init,
        headers: {
          'X-Api-Key': apiKey,
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
        credentials: 'include',
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* keep the raw text */ }
      return { status: res.status, ok: res.ok, json, text: json ? null : text.slice(0, 400) }
    },
    { pathname, token, init, apiKey: API_KEY },
  )
}

export function bail(message) {
  console.error(message)
  process.exit(1)
}
