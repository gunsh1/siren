import { AnimatedActor, type CharacterView } from '../anim/animatedActor'
import type { AnimationLibrary } from '../anim/library'
import { ProcgenActor, PALETTE_BOY, type ActorPalette } from './procgenActor'

export interface CharacterDef {
  id: string
  /** URL under public/. Absent means this character has no model yet. */
  model?: string
  /**
   * Words the resolver leans on when several clips fit equally well.
   * Never a hard filter, so a character still animates from a sparse library.
   */
  flavour: string[]
  /** Colours for the placeholder body used until the model loads. */
  palette: ActorPalette
}

/**
 * Only the player exists so far. A shibito entry belongs here when there is
 * actually one in the world - defining it early meant a second character that
 * reused the player's own model and animations for no reason.
 */
export const CHARACTERS: Record<string, CharacterDef> = {
  kyoya: {
    id: 'kyoya',
    model: '/models/actors/syun/syun.fbx',
    flavour: [],
    palette: PALETTE_BOY,
  },
}

/**
 * The placeholder body, always available and never async. Everything gameplay
 * touches works against this, so a missing or broken model file degrades the
 * visuals and nothing else.
 */
export function placeholderView(def: CharacterDef): CharacterView {
  return new ProcgenActor(def.palette)
}

/**
 * Tries to build the real skinned character. Returns null - never throws - so
 * a missing FBX or a non-Mixamo rig leaves the placeholder in place with a
 * message in the console rather than taking the game down.
 */
export async function loadCharacterView(
  def: CharacterDef,
  library: AnimationLibrary | null,
): Promise<CharacterView | null> {
  if (!def.model || !library) return null
  try {
    return await AnimatedActor.load(def.model, library, { flavour: def.flavour })
  } catch (err) {
    console.warn(`[actors] ${def.id}: falling back to placeholder -`, err)
    return null
  }
}
