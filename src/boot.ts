import * as THREE from 'three'

/**
 * Turn three's linear colour workflow off.
 *
 * Two reasons. First, correctness: this pipeline writes into a plain RGBA8
 * target and composites it by hand, so there is nowhere for three to apply the
 * linear->sRGB encode - leaving colour management on just darkens everything
 * by one gamma. Second, authenticity: PS2 hardware shaded in gamma space. Hex
 * colours here mean exactly what they look like, which is also what makes the
 * ambience presets tunable by eye.
 *
 * Imported first from main.ts, before anything constructs a THREE.Color.
 */
THREE.ColorManagement.enabled = false
