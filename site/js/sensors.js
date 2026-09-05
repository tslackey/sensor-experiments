/**
 * DeviceMotion wrapper with iOS permission flow.
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
  if (!needsMotionPermission()) return "granted";
  const motion = await DeviceMotionEvent.requestPermission();
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch {
      // optional
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
 *   source: 'linear' | 'including-gravity' | 'sim'
 * }} SensorSample
 */

export class SensorStream {
  constructor({ preferLinear = true } = {}) {
    this.preferLinear = preferLinear;
    /** @type {((s: SensorSample) => void) | null} */
    this.onSample = null;
    this._running = false;
    this._onMotion = this._handleMotion.bind(this);
    this._count = 0;
    this._windowStart = performance.now();
    this.sampleRateHz = 0;
  }

  get running() {
    return this._running;
  }

  start() {
    if (this._running) return;
    this._running = true;
    window.addEventListener("devicemotion", this._onMotion);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    window.removeEventListener("devicemotion", this._onMotion);
  }

  setPreferLinear(value) {
    this.preferLinear = Boolean(value);
  }

  pushSim(ax, ay, az, t = performance.now()) {
    this._note();
    if (!this.onSample) return;
    this.onSample({ t, ax, ay, az, source: "sim" });
  }

  _handleMotion(event) {
    const linear = event.acceleration;
    const including = event.accelerationIncludingGravity;
    let ax = 0;
    let ay = 0;
    let az = 0;
    /** @type {'linear' | 'including-gravity'} */
    let source = "including-gravity";

    const linearOk =
      linear &&
      typeof linear.x === "number" &&
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
      source = "including-gravity";
    } else if (linear) {
      ax = linear.x || 0;
      ay = linear.y || 0;
      az = linear.z || 0;
      source = "linear";
    }

    this._note();
    if (!this.onSample) return;
    this.onSample({ t: performance.now(), ax, ay, az, source });
  }

  _note() {
    this._count += 1;
    const now = performance.now();
    const elapsed = now - this._windowStart;
    if (elapsed >= 1000) {
      this.sampleRateHz = (this._count * 1000) / elapsed;
      this._count = 0;
      this._windowStart = now;
    }
  }
}
