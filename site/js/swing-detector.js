/**
 * Simple rising-edge peak detector for swing feasibility experiments.
 *
 * State machine: idle → rising → falling → cooldown → idle
 */

/**
 * @typedef {{
 *   id: number,
 *   t: number,
 *   peak: number,
 *   durationMs: number,
 *   axis: 'x' | 'y' | 'z',
 *   direction: { x: number, y: number, z: number }
 * }} SwingEvent
 */

export class SwingDetector {
  constructor({
    threshold = 12,
    resetFloor = 4,
    minDurationMs = 40,
    cooldownMs = 220,
  } = {}) {
    this.threshold = threshold;
    this.resetFloor = resetFloor;
    this.minDurationMs = minDurationMs;
    this.cooldownMs = cooldownMs;

    this._state = "idle";
    this._riseStart = 0;
    this._peak = 0;
    this._peakVec = { x: 0, y: 0, z: 0 };
    this._cooldownUntil = 0;
    this._id = 0;
    /** @type {((swing: SwingEvent) => void) | null} */
    this.onSwing = null;
  }

  configure( partial ) {
    Object.assign(this, partial);
  }

  reset() {
    this._state = "idle";
    this._riseStart = 0;
    this._peak = 0;
    this._peakVec = { x: 0, y: 0, z: 0 };
    this._cooldownUntil = 0;
  }

  /**
   * @param {{ t: number, ax: number, ay: number, az: number }} sample
   */
  push(sample) {
    const mag = Math.hypot(sample.ax, sample.ay, sample.az);
    const t = sample.t;

    if (t < this._cooldownUntil) {
      return mag;
    }

    if (this._state === "idle") {
      if (mag >= this.threshold) {
        this._state = "rising";
        this._riseStart = t;
        this._peak = mag;
        this._peakVec = { x: sample.ax, y: sample.ay, z: sample.az };
      }
      return mag;
    }

    if (this._state === "rising") {
      if (mag > this._peak) {
        this._peak = mag;
        this._peakVec = { x: sample.ax, y: sample.ay, z: sample.az };
      }
      if (mag < this._peak * 0.85) {
        this._state = "falling";
      }
      return mag;
    }

    if (this._state === "falling") {
      if (mag > this._peak) {
        this._peak = mag;
        this._peakVec = { x: sample.ax, y: sample.ay, z: sample.az };
        this._state = "rising";
        return mag;
      }

      if (mag <= this.resetFloor) {
        const durationMs = t - this._riseStart;
        if (durationMs >= this.minDurationMs && this._peak >= this.threshold) {
          this._emit(t, durationMs);
        }
        this._state = "idle";
        this._cooldownUntil = t + this.cooldownMs;
      }
      return mag;
    }

    return mag;
  }

  _emit(t, durationMs) {
    const { x, y, z } = this._peakVec;
    const abs = { x: Math.abs(x), y: Math.abs(y), z: Math.abs(z) };
    /** @type {'x' | 'y' | 'z'} */
    let axis = "x";
    if (abs.y >= abs.x && abs.y >= abs.z) axis = "y";
    else if (abs.z >= abs.x && abs.z >= abs.y) axis = "z";

    const norm = Math.hypot(x, y, z) || 1;
    /** @type {SwingEvent} */
    const swing = {
      id: ++this._id,
      t,
      peak: this._peak,
      durationMs,
      axis,
      direction: { x: x / norm, y: y / norm, z: z / norm },
    };

    if (this.onSwing) this.onSwing(swing);
  }
}
