import type { AnimRequest } from './resolve'

/**
 * The animation slots the game actually asks for.
 *
 * This list is the shopping list. `npm run check:anim` resolves every slot
 * against the database and reports which ones are only being covered by a
 * fallback, so the gaps in the library are a printed table rather than
 * something you notice when a character T-poses mid-chase.
 *
 * `search` is what to type into Mixamo to fill the slot.
 *
 * Only traversal is listed. Combat, damage reactions and shibito slots go back
 * in when there is something in the game that plays them; clips for those are
 * parked in public/models/anim-later/.
 */
export interface AnimSlot {
  name: string
  request: AnimRequest
  search: string[]
  /** Slots the game cannot look right without. */
  essential: boolean
}

export const REQUIRED_SLOTS: AnimSlot[] = [
  // --- player, standing ----------------------------------------------------
  { name: 'player.idle', essential: true, search: ['Idle', 'Breathing Idle'],
    request: { category: 'idle', posture: 'stand', speed: 0, loop: true } },
  { name: 'player.walk', essential: true, search: ['Walking'],
    request: { category: 'locomotion', posture: 'stand', speed: 1.9, direction: 'forward', loop: true } },
  { name: 'player.run', essential: true, search: ['Running', 'Fast Run'],
    request: { category: 'locomotion', posture: 'stand', speed: 4.6, direction: 'forward', loop: true } },
  { name: 'player.walkBack', essential: false, search: ['Walking Backwards'],
    request: { category: 'locomotion', posture: 'stand', speed: 1.2, direction: 'backward', loop: true } },
  { name: 'player.turn', essential: false, search: ['Left Turn', 'Right Turn'],
    request: { category: 'turn', posture: 'stand', speed: 0, loop: false } },

  // --- player, crouched and prone -----------------------------------------
  { name: 'player.crouchIdle', essential: true, search: ['Crouch Idle', 'Crouching Idle'],
    request: { category: 'idle', posture: 'crouch', speed: 0, loop: true } },
  { name: 'player.crouchWalk', essential: true, search: ['Crouched Walking', 'Sneak Walk'],
    request: { category: 'locomotion', posture: 'crouch', speed: 1.0, direction: 'forward', loop: true } },
  { name: 'player.proneIdle', essential: true, search: ['Prone Idle', 'Laying Idle'],
    request: { category: 'idle', posture: 'prone', speed: 0, loop: true } },
  { name: 'player.crawl', essential: true, search: ['Crawling', 'Army Crawl', 'Crawl Forward'],
    request: { category: 'locomotion', speed: 0.45, direction: 'forward', loop: true } },

]
