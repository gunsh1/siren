// Shared plumbing for every headless tool: a server, and a Chromium page with
// the target loaded. Two modes:
//   preview - serves dist/, used by the game checks
//   dev     - serves source, used by tools that need extra entry points
//
// Headless Chromium has no real GPU, so WebGL2 comes from SwiftShader.

import './env.mjs'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright'

export const argOf = (name, fallback) => {
  const args = process.argv.slice(2)
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

export const hasFlag = (name) => process.argv.slice(2).includes(`--${name}`)

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`server did not start: ${url}`)
}

export async function launch({
  width = 1024,
  height = 768,
  port = 4173,
  dev = false,
  path = '/',
  ready = 'window.__siren?.ready === true',
  timeout = 60_000,
} = {}) {
  if (!dev && !existsSync('dist')) {
    console.error('dist/ not found. Run `npm run build` first.')
    process.exit(1)
  }

  const viteArgs = dev
    ? ['vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort']
    : ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1', '--strictPort']

  const server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    viteArgs,
    { stdio: 'pipe', shell: process.platform === 'win32' },
  )

  const origin = `http://127.0.0.1:${port}`
  await waitForServer(origin + '/', 30_000)

  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  })

  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(origin + path, { waitUntil: 'load' })
  try {
    await page.waitForFunction(ready, null, { timeout })
  } catch (err) {
    console.error('page never became ready. errors so far:')
    for (const e of errors) console.error('  ' + e)
    throw err
  }
  await page.waitForTimeout(300)

  // Chromium can take a long time to shut down cleanly once a page has held
  // large buffers - big FBX models and 2K textures are enough. Cap the wait;
  // every tool then calls process.exit, which drops the handle for good.
  // A hung teardown looks exactly like a hung test, so this matters.
  const close = async () => {
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise((r) => setTimeout(r, 8000)),
    ])
    server.kill()
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(server.pid), '/f', '/t'], { stdio: 'ignore' })
    }
  }

  return { page, close, errors, origin }
}

/** Fail loudly if the page logged anything. Silent WebGL errors waste hours. */
export function assertNoErrors(errors) {
  if (errors.length) {
    console.error('page errors:')
    for (const e of errors) console.error('  ' + e)
    process.exitCode = 1
  }
}
