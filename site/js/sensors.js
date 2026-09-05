/**
 * Thin wrapper around DeviceMotion / DeviceOrientation with iOS permission flow.
 */

export function sensorsSupported() {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

export function needsMotionPermission() {
  return (
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function"
  );
}

export async function requestMotionPermission() {
  if (!needsMotionPermission()) {
    return "granted";
  }

  const motion = await DeviceMotionEvent.requestPermission();
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch {
      // Orientation is optional for this experiment.
    }
  }
  return motion;
}

/**
 * @typedef {{
 *   t: number,
 *   ax: number,
 *   ay: number,
 *   az: number,
 *   gx: number,
 *   gy: number,
 *   gz: number,
 *   alpha: number | null,
 *   beta: number | null,
 *   gamma: number | null,
 *   source: 'linear' | 'including-gravity' | 'sim'
 * }} SensorSample
 */

export class SensorStream {
  constructor({ preferLinear = true } = {}) {
    this.preferLinear = preferLinear;
    /** @type {((sample: SensorSample) => void) | null} */
    this.onSample = null;
    this._running = false;
    this._boundMotion = this._onMotion.bind(this);
    this._boundOrientation = this._onOrientation.bind(this);
    this._orientation = { alpha: null, beta: null, gamma: null };
    this._sampleCount = 0;
    this._rateWindowStart = performance.now();
    this.sampleRateHz = 0;
  }

  get running() {
    return this._running;
  }

  start() {
    if (this._running) return;
    this._running = true;
    window.addEventListener("devicemotion", this._boundMotion);
    window.addEventListener("deviceorientation", this._boundOrientation);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    window.removeEventListener("devicemotion", this._boundMotion);
    window.removeEventListener("deviceorientation", this._boundOrientation);
  }

  setPreferLinear(value) {
    this.preferLinear = Boolean(value);
  }

  _onOrientation(event) {
    this._orientation = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
    };
  }

  _onMotion(event) {
    const linear = event.acceleration;
    const including = event.accelerationIncludingGravity;
    const rotation = event.rotationRate || {};

    let ax = 0;
    let ay = 0;
    let az = 0;
    /** @type {'linear' | 'including-gravity'} */
    let source = "including-gravity";

    const linearOk =
      linear &&
      typeof linear.x === "number" &&
      typeof linear.y === "number" &&
      typeof linear.z === "number" &&
      !(linear.x === 0 && linear.y === 0 && linear.z === 0);

    if (this.preferLinear && linearOk) {
      ax = linear.x;
      ay = linear.y;
      az = linear.z;
      source = "linear";
    } else if (including) {
      ax = including.x || 0;
      ay = including.y || 0;
      az = including.z || 0;
      // Rough gravity removal when only including-gravity is available and device is mostly upright.
      // Keep raw for magnitude peaks; gravity bias is okay for swing detection thresholds.
      source = "including-gravity";
    } else if (linear) {
      ax = linear.x || 0;
      ay = linear.y || 0;
      az = linear.z || 0;
      source = "linear";
    }

    this._noteSample();

    /** @type {SensorSample} */
    const sample = {
      t: performance.now(),
      ax,
      ay,
      az,
      gx: rotation.alpha || 0,
      gy: rotation.beta || 0,
      gz: rotation.gamma || 0,
      alpha: this._orientation.alpha,
      beta: this._orientation.beta,
      gamma: this._orientation.gamma,
      source,
    };

    if (this.onSample) this.onSample(sample);
  }

  /** Push a synthetic sample (simulation). */
  pushSim(ax, ay, az, t = performance.now()) {
    this._noteSample();
    if (!this.onSample) return;
    this.onSample({
      t,
      ax,
      ay,
      az,
      gx: 0,
      gy: 0,
      gz: 0,
      alpha: null,
      beta: null,
      gamma: null,
      source: "sim",
    });
  }

  _noteSample() {
    this._sampleCount += 1;
    const now = performance.now();
    const elapsed = now - this._rateWindowStart;
    if (elapsed >= 1000) {
      this.sampleRateHz = (this._sampleCount * 1000) / elapsed;
      this._sampleCount = 0;
      this._rateWindowStart = now;
    }
  }
}
