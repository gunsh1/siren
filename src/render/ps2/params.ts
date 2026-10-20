/**
 * Every knob for the PS2 look lives here so tuning is one file and one debug panel.
 * Start conservative; raise a single value at a time and compare screenshots.
 */
export const ps2 = {
  /** Internal framebuffer. PS2 NTSC games commonly ran 512x448. */
  width: 512,
  height: 448,

  screen: {
    /** Fraction of the window the 4:3 image occupies (rest is black frame). */
    safeArea: 0.9,
    aspect: 4 / 3,
  },

  color: {
    /** Bits per channel of the output. PS2 framebuffers were 16bit (RGB555). */
    bits: 5,
    /** Ordered-dither strength, 0..1.5 */
    dither: 1.0,
    saturation: 0.88,
  },

  video: {
    /** Darkening applied to the alternate field each frame. */
    interlace: 0.06,
    /** Horizontal chroma smear in internal pixels. */
    chromaBleed: 1.2,
    grain: 0.022,
    vignette: 0.3,
    /** Raised black level - capture footage never reaches 0. */
    blackLift: 0.035,
    /** Dark edge just inside the 4:3 frame. */
    border: 0.5,
  },
} as const

export type Ps2Params = typeof ps2

/** Mutable copy used at runtime so the debug panel can tweak without reloading. */
export const ps2Live: {
  -readonly [K in keyof Ps2Params]: Ps2Params[K] extends object
    ? { -readonly [P in keyof Ps2Params[K]]: Ps2Params[K][P] }
    : Ps2Params[K]
} = JSON.parse(JSON.stringify(ps2))
