// Browsers live inside the project so the tools work without writing to the
// user profile. Must be imported before `playwright` - ESM evaluates modules
// in import order, so keep this first in every tool.
import path from 'node:path'
import { existsSync } from 'node:fs'
import process from 'node:process'

const local = path.resolve('.playwright')
if (existsSync(local) && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = local
}
