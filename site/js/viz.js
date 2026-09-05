/** Lab waveform + meter helpers. */

export class Waveform {
  constructor(canvas, { capacity = 240 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.capacity = capacity;
    this.values = new Array(capacity).fill(0);
    this.cursor = 0;
    this.maxSeen = 20;
    this.flashUntil = 0;
  }

  push(value) {
    this.values[this.cursor % this.capacity] = value;
    this.cursor += 1;
    this.maxSeen = Math.max(this.maxSeen * 0.995, value, 8);
  }

  flash(ms = 220) {
    this.flashUntil = performance.now() + ms;
  }

  draw(now = performance.now()) {
    const { canvas, ctx, values, capacity, cursor, maxSeen } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || 160;
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(47,224,196,0.08)";
    ctx.lineWidth = dpr;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const flashing = now < this.flashUntil;
    ctx.beginPath();
    for (let i = 0; i < capacity; i++) {
      const v = values[(cursor + i) % capacity];
      const x = (i / (capacity - 1)) * w;
      const y = h - (v / maxSeen) * h * 0.86 - h * 0.07;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = flashing ? "#ffb020" : "#2fe0c4";
    ctx.lineWidth = 2.2 * dpr;
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, flashing ? "rgba(255,176,32,0.28)" : "rgba(47,224,196,0.22)");
    grad.addColorStop(1, "rgba(47,224,196,0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

export function setMeter(barEl, valueEl, value, scale = 40) {
  barEl.style.width = `${Math.min(100, (Math.abs(value) / scale) * 100)}%`;
  valueEl.textContent = value.toFixed(2);
}

export function tiltBat(batEl, ax, ay, az) {
  const angle = Math.max(-55, Math.min(55, ax * 2.2 + ay * 1.1));
  const lift = Math.max(-18, Math.min(18, -az * 1.4));
  batEl.style.transform = `rotate(${angle}deg) translateY(${lift}px)`;
}
