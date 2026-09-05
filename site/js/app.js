import {
  SensorStream,
  sensorsSupported,
  needsMotionPermission,
  requestMotionPermission,
} from "./sensors.js";
import { SwingDetector } from "./swing-detector.js";
import { Waveform, setMeter, tiltBat } from "./viz.js";

const $ = (id) => document.getElementById(id);

const ui = {
  enable: $("enable-sensors"),
  sim: $("toggle-sim"),
  status: $("status"),
  wave: $("wave"),
  bat: $("bat"),
  barX: $("bar-x"),
  barY: $("bar-y"),
  barZ: $("bar-z"),
  barMag: $("bar-mag"),
  valX: $("val-x"),
  valY: $("val-y"),
  valZ: $("val-z"),
  valMag: $("val-mag"),
  rate: $("stat-rate"),
  peak: $("stat-peak"),
  swings: $("stat-swings"),
  last: $("stat-last"),
  log: $("swing-log"),
  empty: $("empty-log"),
  threshold: $("threshold"),
  thresholdOut: $("threshold-out"),
  resetFloor: $("reset-floor"),
  resetFloorOut: $("reset-floor-out"),
  minDuration: $("min-duration"),
  minDurationOut: $("min-duration-out"),
  cooldown: $("cooldown"),
  cooldownOut: $("cooldown-out"),
  useLinear: $("use-linear"),
};

const stream = new SensorStream({ preferLinear: true });
const detector = new SwingDetector();
const wave = new Waveform(ui.wave);

let swingCount = 0;
let sessionPeak = 0;
let simulating = false;
let simTimer = 0;
let simPhase = 0;
let lastSample = { ax: 0, ay: 0, az: 0, t: 0 };

function setStatus(text, kind = "") {
  ui.status.textContent = text;
  ui.status.classList.remove("is-ok", "is-warn", "is-err");
  if (kind) ui.status.classList.add(kind);
}

function bindRange(input, output, onChange) {
  const sync = () => {
    output.textContent = input.value;
    onChange(Number(input.value));
  };
  input.addEventListener("input", sync);
  sync();
}

bindRange(ui.threshold, ui.thresholdOut, (v) => detector.configure({ threshold: v }));
bindRange(ui.resetFloor, ui.resetFloorOut, (v) => detector.configure({ resetFloor: v }));
bindRange(ui.minDuration, ui.minDurationOut, (v) => detector.configure({ minDurationMs: v }));
bindRange(ui.cooldown, ui.cooldownOut, (v) => detector.configure({ cooldownMs: v }));

ui.useLinear.addEventListener("change", () => {
  stream.setPreferLinear(ui.useLinear.checked);
});

stream.onSample = (sample) => {
  lastSample = sample;
  const mag = detector.push(sample);
  sessionPeak = Math.max(sessionPeak, mag);

  setMeter(ui.barX, ui.valX, sample.ax);
  setMeter(ui.barY, ui.valY, sample.ay);
  setMeter(ui.barZ, ui.valZ, sample.az);
  setMeter(ui.barMag, ui.valMag, mag, 50);
  tiltBat(ui.bat, sample.ax, sample.ay, sample.az);

  wave.push(mag);
  ui.peak.textContent = `${sessionPeak.toFixed(2)} m/s²`;
  ui.rate.textContent = stream.sampleRateHz
    ? `${stream.sampleRateHz.toFixed(0)} Hz · ${sample.source}`
    : `— · ${sample.source}`;
};

detector.onSwing = (swing) => {
  swingCount += 1;
  ui.swings.textContent = String(swingCount);
  ui.last.textContent = `${swing.peak.toFixed(1)} on ${swing.axis}`;
  wave.flash();
  ui.bat.classList.add("is-hit");
  window.setTimeout(() => ui.bat.classList.remove("is-hit"), 180);
  prependLog(swing);
};

function prependLog(swing) {
  ui.empty.classList.add("is-hidden");
  const tr = document.createElement("tr");
  const when = new Date();
  const time = when.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dir = swing.direction;
  tr.innerHTML = `
    <td>${swing.id}</td>
    <td>${time}</td>
    <td>${swing.peak.toFixed(2)}</td>
    <td>${swing.durationMs.toFixed(0)} ms</td>
    <td>${swing.axis}</td>
    <td>${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)}</td>
  `;
  ui.log.prepend(tr);
  while (ui.log.children.length > 40) {
    ui.log.lastElementChild?.remove();
  }
}

async function enableSensors() {
  if (!sensorsSupported() && !simulating) {
    setStatus("DeviceMotion not available in this browser — try Simulate.", "is-warn");
    return;
  }

  try {
    if (needsMotionPermission()) {
      setStatus("Requesting motion permission…", "is-warn");
      const result = await requestMotionPermission();
      if (result !== "granted") {
        setStatus("Motion permission denied.", "is-err");
        return;
      }
    }

    stopSimulation();
    stream.start();
    ui.enable.classList.add("is-live");
    ui.enable.textContent = "Sensors live";
    setStatus("Listening for swings — take a cut with the phone.", "is-ok");
  } catch (err) {
    console.error(err);
    setStatus(`Permission / sensor error: ${err.message || err}`, "is-err");
  }
}

function stopSimulation() {
  simulating = false;
  ui.sim.classList.remove("is-on");
  ui.sim.textContent = "Run simulated swings";
  if (simTimer) {
    window.clearInterval(simTimer);
    simTimer = 0;
  }
}

function startSimulation() {
  if (simulating) {
    stopSimulation();
    setStatus("Simulation stopped.", "is-warn");
    return;
  }

  stream.stop();
  ui.enable.classList.remove("is-live");
  ui.enable.textContent = "Enable motion sensors";
  simulating = true;
  ui.sim.classList.add("is-on");
  ui.sim.textContent = "Stop simulation";
  setStatus("Simulation on — synthetic swings every ~1.6s.", "is-ok");

  simPhase = 0;
  // ~60 Hz synthetic stream
  simTimer = window.setInterval(() => {
    simPhase += 1;
    const t = performance.now();
    // Quiet baseline with occasional swing envelope
    const cycle = simPhase % 100;
    let ax = (Math.random() - 0.5) * 0.4;
    let ay = (Math.random() - 0.5) * 0.4;
    let az = (Math.random() - 0.5) * 0.4;

    if (cycle >= 55 && cycle <= 68) {
      // Bell-shaped lateral swing burst
      const u = (cycle - 55) / 13;
      const envelope = Math.sin(Math.PI * u);
      ax = 18 * envelope + (Math.random() - 0.5);
      ay = 6 * envelope;
      az = -4 * envelope;
    }

    stream.pushSim(ax, ay, az, t);
  }, 16);
}

ui.enable.addEventListener("click", () => {
  void enableSensors();
});

ui.sim.addEventListener("click", () => {
  startSimulation();
});

function frame(now) {
  wave.draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (!sensorsSupported()) {
  setStatus("No DeviceMotion API here — use simulated swings on desktop.", "is-warn");
} else if (!window.isSecureContext) {
  setStatus("Needs a secure context (HTTPS or localhost) for sensors.", "is-err");
} else if (needsMotionPermission()) {
  setStatus("iOS-style permission required — tap Enable motion sensors.", "is-warn");
} else {
  setStatus("Sensors ready — tap Enable motion sensors, then swing.", "");
}

// Expose a tiny debug hook for manual tests
window.__swingLab = { stream, detector, wave, lastSample: () => lastSample };
