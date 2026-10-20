/** Fixed-step accumulator so simulation stays deterministic for headless checks. */
export const FIXED_DT = 1 / 60

export class Clock {
  private last = 0
  private acc = 0
  elapsed = 0
  /** Wall-clock frames since start (used for interlace field parity). */
  frame = 0

  /** Feed a timestamp (ms); returns how many fixed steps to run. */
  advance(nowMs: number): number {
    if (this.last === 0) { this.last = nowMs; return 0 }
    let dt = (nowMs - this.last) / 1000
    this.last = nowMs
    if (dt > 0.25) dt = 0.25 // tab-out guard
    this.acc += dt
    let steps = 0
    while (this.acc >= FIXED_DT && steps < 6) {
      this.acc -= FIXED_DT
      this.elapsed += FIXED_DT
      steps++
    }
    this.frame++
    return steps
  }
}
