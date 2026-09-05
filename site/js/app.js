import {
  SensorStream,
  sensorsSupported,
  needsMotionPermission,
  requestMotionPermission,
} from "./sensors.js";
import { SwingDetector } from "./swing-detector.js";
import { Waveform, setMeter, tiltBat } from "./viz.js";
import { PlayArena, MODES, powerFromSwing } from "./play.js";

const $ = (id) => document.getElementById(id);

const ui = {
  tabLab: $("tab-lab"),
  tabPlay: $("tab-play"),
  gotoPlay: $("goto-play"),
  buildLabel: $("build-label"),
  pager: $("pager"),
  pageLab: $("page-lab"),
  pagePlay: $("page-play"),
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
  playCanvas: $("play-canvas"),
  hudMode: $("hud-mode"),
  hudPower: $("hud-power"),
  hudHint: $("hud-hint"),
  playFire: $("play-fire"),
  playReset: $("play-reset"),
};

function applyBuildLabel(label) {
  if (ui.buildLabel) ui.buildLabel.textContent = label;
  document.title = `Swing Lab ${label} · Sensor Experiments`;
}

async function loadBuildInfo() {
  const stamped = ui.buildLabel?.textContent?.trim();
  if (stamped && !stamped.includes("__BUILD_NUMBER__")) {
    document.title = `Swing Lab ${stamped} · Sensor Experiments`;
  }
  try {
    const res = await fetch("./build.json", { cache: "no-store" });
    if (!res.ok) throw new Error("build.json missing");
    const info = await res.json();
    const label = info.label || (info.build != null ? `v${info.build}` : "vdev");
    applyBuildLabel(label);
  } catch {
    if (stamped?.includes("__BUILD_NUMBER__")) applyBuildLabel("vdev");
  }
}

const stream = new SensorStream({ preferLinear: true });
const detector = new SwingDetector();
const wave = new Waveform(ui.wave);

const arena = new PlayArena(ui.playCanvas, {
  onHud: (info) => {
    const mode = String(info.mode || arena.mode);
    ui.hudMode.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    if (typeof info.power === "number" && info.power > 0) {
      ui.hudPower.textContent = `Power ${(info.power * 100).toFixed(0)}%`;
    } else if (info.state === "ready") {
      ui.hudPower.textContent = "Power —";
    }
    if (info.state === "hit") ui.hudHint.textContent = "Contact!";
    else if (info.state === "swing") ui.hudHint.textContent = "Swing mapped → physics";
    else ui.hudHint.textContent = "Swing phone or tap Fire demo swing";
  },
});

let swingCount = 0;
let sessionPeak = 0;
let simulating = false;
let simTimer = 0;
let simPhase = 0;
let activeTab = "lab";

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

function showTab(name, { scroll = true } = {}) {
  activeTab = name;
  const lab = name === "lab";
  ui.tabLab.classList.toggle("is-active", lab);
  ui.tabPlay.classList.toggle("is-active", !lab);
  ui.tabLab.setAttribute("aria-selected", String(lab));
  ui.tabPlay.setAttribute("aria-selected", String(!lab));
  ui.pagePlay.hidden = false;
  if (scroll) {
    (lab ? ui.pageLab : ui.pagePlay).scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  }
  if (!lab) {
    arena.resize();
    arena.start();
  }
}

ui.tabLab.addEventListener("click", () => showTab("lab"));
ui.tabPlay.addEventListener("click", () => showTab("play"));
ui.gotoPlay?.addEventListener("click", () => showTab("play"));

ui.pager.addEventListener(
  "scroll",
  () => {
    const w = ui.pager.clientWidth || 1;
    const next = ui.pager.scrollLeft > w * 0.5 ? "play" : "lab";
    if (next !== activeTab) showTab(next, { scroll: false });
  },
  { passive: true }
);

document.querySelectorAll(".mode-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.getAttribute("data-mode");
    if (!mode || !MODES.includes(mode)) return;
    document.querySelectorAll(".mode-chip").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });
    arena.setMode(mode);
  });
});

ui.playReset.addEventListener("click", () => {
  arena.setMode(arena.mode);
});

ui.playFire.addEventListener("click", () => {
  const demo = {
    id: 0,
    peak: 16 + Math.random() * 10,
    durationMs: 90,
    axis: "x",
    direction: {
      x: (Math.random() - 0.5) * 0.8,
      y: -0.2 - Math.random() * 0.4,
      z: 0.6 + Math.random() * 0.3,
    },
  };
  arena.triggerSwing(demo);
  ui.hudHint.textContent = `Demo ${(powerFromSwing(demo) * 100).toFixed(0)}% power`;
});

stream.onSample = (sample) => {
  const mag = detector.push(sample);
  sessionPeak = Math.max(sessionPeak, mag);
  setMeter(ui.barX, ui.valX, sample.ax);
  setMeter(ui.barY, ui.valY, sample.ay);
  setMeter(ui.barZ, ui.valZ, sample.az);
  setMeter(ui.barMag, ui.valMag, mag, 50);
  tiltBat(ui.bat, sample.ax, sample.ay, sample.az);
  wave.push(mag);
  ui.peak.textContent = sessionPeak.toFixed(2);
  ui.rate.textContent = stream.sampleRateHz
    ? `${stream.sampleRateHz.toFixed(0)} Hz · ${sample.source}`
    : `— · ${sample.source}`;
};

detector.onSwing = (swing) => {
  swingCount += 1;
  ui.swings.textContent = String(swingCount);
  ui.last.textContent = `${swing.peak.toFixed(1)} ${swing.axis}`;
  wave.flash();
  ui.bat.classList.add("is-hit");
  window.setTimeout(() => ui.bat.classList.remove("is-hit"), 180);
  prependLog(swing);
  arena.triggerSwing(swing);
  if (activeTab !== "play") {
    setStatus(`Swing #${swing.id} → Play (${arena.mode})`, "is-ok");
  }
};

function prependLog(swing) {
  ui.empty.classList.add("is-hidden");
  const tr = document.createElement("tr");
  const time = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  tr.innerHTML = `
    <td>${swing.id}</td>
    <td>${time}</td>
    <td>${swing.peak.toFixed(2)}</td>
    <td>${swing.durationMs.toFixed(0)}</td>
    <td>${swing.axis}</td>
  `;
  ui.log.prepend(tr);
  while (ui.log.children.length > 30) ui.log.lastElementChild?.remove();
}

async function enableSensors() {
  if (!sensorsSupported() && !simulating) {
    setStatus("DeviceMotion missing — use Simulate.", "is-warn");
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
    setStatus("Listening — swing, then swipe to Play.", "is-ok");
  } catch (err) {
    console.error(err);
    setStatus(`Sensor error: ${err.message || err}`, "is-err");
  }
}

function stopSimulation() {
  simulating = false;
  ui.sim.classList.remove("is-on");
  ui.sim.textContent = "Simulate";
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
  ui.enable.textContent = "Enable sensors";
  simulating = true;
  ui.sim.classList.add("is-on");
  ui.sim.textContent = "Stop sim";
  setStatus("Sim on — synthetic swings ~1.6s.", "is-ok");
  simPhase = 0;
  simTimer = window.setInterval(() => {
    simPhase += 1;
    const t = performance.now();
    const cycle = simPhase % 100;
    let ax = (Math.random() - 0.5) * 0.4;
    let ay = (Math.random() - 0.5) * 0.4;
    let az = (Math.random() - 0.5) * 0.4;
    if (cycle >= 55 && cycle <= 68) {
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
ui.sim.addEventListener("click", () => startSimulation());

function frame(now) {
  wave.draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (!sensorsSupported()) {
  setStatus("No DeviceMotion — Simulate on Lab, then swipe to Play.", "is-warn");
} else if (!window.isSecureContext) {
  setStatus("Needs HTTPS or localhost for sensors.", "is-err");
} else if (needsMotionPermission()) {
  setStatus("Tap Enable sensors for iOS permission.", "is-warn");
} else {
  setStatus("Ready — enable sensors, swing, swipe to Play.", "");
}

ui.pagePlay.hidden = false;
showTab("lab", { scroll: false });
void loadBuildInfo();

window.__swingLab = { stream, detector, arena, wave };
