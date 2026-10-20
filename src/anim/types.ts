/**
 * Schema for the animation database.
 *
 * Every field except `id`, `file` and `clipName` is MEASURED from the animation
 * itself, not guessed from the filename. Mixamo names every exported clip
 * "mixamo.com", so the filename is the only text signal there is - and it says
 * nothing about how fast the character actually moves. Measuring means the
 * resolver can match a clip to a real speed in m/s and time-scale it so the
 * feet do not slide.
 */

export type Posture = 'stand' | 'crouch' | 'prone'

export type AnimCategory =
  | 'idle'
  | 'locomotion'
  | 'turn'
  | 'jump'
  | 'action'
  | 'reaction'
  | 'death'
  | 'getUp'
  | 'misc'

export type Direction = 'inPlace' | 'forward' | 'backward' | 'left' | 'right'

export type SpeedBand = 'still' | 'walk' | 'jog' | 'run'

export interface AnimMeasurements {
  duration: number
  /** Metres per second of hips travel, 0 for in-place clips. */
  speed: number
  /** Straight-line hips displacement over the clip, metres. */
  displacement: number
  /** Distance actually travelled - much larger than displacement when turning. */
  pathLength: number
  /** Net hips yaw change over the clip, degrees. Signed: + is left. */
  turnDegrees: number
  /** Heading of travel relative to the character's starting facing, degrees. */
  travelHeading: number
  /** Mean hips height in metres, and as a fraction of standing height. */
  hipsHeight: number
  hipsRatio: number
  /** Peak-to-trough hips height - large values mean a jump or a fall. */
  verticalTravel: number
  /** Foot-ground contacts counted over the clip. */
  steps: number
  /** Steps per second. */
  cadence: number
  /** Metres covered per step. Zero for in-place clips. */
  strideLength: number
  /**
   * Ground speed the clip LOOKS like it is moving at, measured from how fast
   * the planted foot slides backwards under the hips. In-place clips report
   * speed 0 but still imply a pace; this is the number that stops the feet
   * skating when the clip is played on a character that really moves.
   */
  impliedSpeed: number
  /** speed when the clip translates, impliedSpeed when it does not. */
  effectiveSpeed: number
  /** 0..1 - how strictly left and right foot contacts alternate. */
  alternation: number
  /** 0..1 - how evenly spaced the contacts are. A walk is regular, a dance is not. */
  gaitRegularity: number
  /**
   * Total absolute pelvis yaw swing over the clip, degrees. Walking keeps the
   * hips pointed where you are going; dancing and fighting do not.
   */
  yawWander: number
  /**
   * 0..1 - of the planted foot's movement under the hips, how much is sideways
   * rather than along the facing direction. A walk is almost purely fore-aft.
   */
  lateralRatio: number
  /** Fraction of the clip with both feet off the ground. */
  airborne: number
  /** Path length of the hands and the feet, metres. Separates gestures from walks. */
  armEnergy: number
  legEnergy: number
  /**
   * Limb travel per second, in body heights. An idle barely registers; a walk
   * sits around one; a dance or a fight is several. This is what stops a
   * looping dance being filed as an idle just because it ends where it began.
   */
  activity: number
  /** 1 = first and last pose match perfectly, so the clip loops seamlessly. */
  loopScore: number
  /** Hips height at the start and end - tells getting up from falling down. */
  startHipsRatio: number
  endHipsRatio: number
}

export interface AnimEntry {
  /** Stable id, derived from the file name. */
  id: string
  /** Path under public/, e.g. models/anim/Walking.fbx */
  file: string
  /** Clip name inside the FBX. Mixamo always writes "mixamo.com". */
  clipName: string
  /** Original file name, kept only as a human label and a weak tiebreak. */
  label: string
  category: AnimCategory
  posture: Posture
  direction: Direction
  speedBand: SpeedBand
  loops: boolean
  measurements: AnimMeasurements
  /** Free-form keywords taken from the file name, used only to break ties. */
  keywords: string[]
  /**
   * The rig this clip was baked against, in raw file units.
   *
   * Mixamo bakes animation onto whichever character it was downloaded for, so
   * the hips position curve is in that skeleton's proportions. Playing it on a
   * differently-proportioned character makes them float or sink. Recording the
   * source lets the runtime rescale the hips curve to the target.
   */
  rig: { heightUnits: number; hipsUnits: number }
}

export interface AnimIndex {
  version: 1
  /** Skeleton every entry shares. Mismatched rigs cannot be pooled. */
  skeleton: string
  /** Standing height of the reference rig, metres. */
  referenceHeight: number
  generatedFrom: string[]
  entries: AnimEntry[]
}
