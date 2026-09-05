/**
 * Low-poly Play arena: swing → throw / bowl / bat / golf.
 * Three.js (CDN ESM) + tiny custom integrator.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

export const MODES = ["throw", "bowl", "bat", "golf"];
const G = -18;

function poly(color) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.75,
    metalness: 0.05,
  });
}

export function powerFromSwing(swing) {
  return Math.max(0.22, Math.min(1, (swing.peak - 6) / 28));
}

export function aimFromSwing(swing) {
  const d = swing.direction;
  const lateral = THREE.MathUtils.clamp(d.x * 0.95 + d.z * 0.15, -1, 1);
  const loft = THREE.MathUtils.clamp(-d.y * 0.5 + 0.28, 0.08, 0.9);
  return new THREE.Vector3(lateral, loft, 1).normalize();
}

export class PlayArena {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onHud?: (info: object) => void }} [opts]
   */
  constructor(canvas, { onHud = null } = {}) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.mode = "throw";
    this.running = false;
    this._raf = 0;
    this._prev = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x09131c, 1);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x09131c, 16, 52);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);

    const hemi = new THREE.HemisphereLight(0xb9fff2, 0x1a1210, 0.9);
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.1);
    sun.position.set(5, 12, 6);
    sun.castShadow = true;
    this.scene.add(hemi, sun);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    /** @type {THREE.Mesh|null} */
    this.ball = null;
    /** @type {THREE.Group|null} */
    this.tool = null;
    /** @type {THREE.Group[]} */
    this.pins = [];

    this.vel = new THREE.Vector3();
    this.spin = 0;
    this.alive = false;
    this.radius = 0.25;
    this.groundY = 0;
    this.toolAngle = 0;
    this.toolTarget = 0;
    this.hit = false;
    this.pending = null;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);

    this.setMode("throw");
    this.resize();
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.mode = mode;
    this._rebuild();
    this._emit({ mode, state: "ready", power: 0 });
  }

  cycleMode(dir = 1) {
    const i = MODES.indexOf(this.mode);
    this.setMode(MODES[(i + dir + MODES.length) % MODES.length]);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._prev = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.033, (now - this._prev) / 1000);
      this._prev = now;
      this._step(dt);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    this._ro.disconnect();
    this.renderer.dispose();
  }

  resize() {
    const host = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** @param {any} swing */
  triggerSwing(swing) {
    const power = powerFromSwing(swing);
    const aim = aimFromSwing(swing);
    this._emit({ mode: this.mode, state: "swing", power, peak: swing.peak, axis: swing.axis });
    if (this.mode === "throw") this._fireThrow(power, aim);
    else if (this.mode === "bowl") this._fireBowl(power, aim);
    else if (this.mode === "bat") this._fireBat(power, aim);
    else this._fireGolf(power, aim);
  }

  _emit(info) {
    if (this.onHud) this.onHud(info);
  }

  _wipe() {
    while (this.root.children.length) {
      const c = this.root.children[0];
      this.root.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.ball = null;
    this.tool = null;
    this.pins = [];
    this.alive = false;
    this.hit = false;
    this.pending = null;
  }

  _rebuild() {
    this._wipe();
    if (this.mode === "throw") this._sceneThrow();
    else if (this.mode === "bowl") this._sceneBowl();
    else if (this.mode === "bat") this._sceneBat();
    else this._sceneGolf();
  }

  _addGround(w, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), poly(color));
    m.position.y = -0.15;
    m.receiveShadow = true;
    this.root.add(m);
    this.groundY = 0;
  }

  _addBall(r, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), poly(color));
    m.castShadow = true;
    m.position.set(x, y, z);
    this.root.add(m);
    this.ball = m;
    this.radius = r;
    return m;
  }

  _sceneThrow() {
    this._addGround(14, 24, 0x1c3a32);
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.1 + i * 0.12, 0.7),
        poly(i % 2 ? 0x2fe0c4 : 0xffb020)
      );
      t.position.set(-4 + i * 2, 0.65, -7.5);
      t.castShadow = true;
      this.root.add(t);
    }
    this._addBall(0.28, 0xf4f7fa, 0, 1.15, 4.2);
    this.camera.position.set(0, 3.2, 9);
    this.camera.lookAt(0, 1.3, 0);
  }

  _sceneBowl() {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 22), poly(0xd4b483));
    lane.position.set(0, 0.09, -2);
    lane.receiveShadow = true;
    this.root.add(lane);
    for (const x of [-1.35, 1.35]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 22), poly(0x243040));
      g.position.set(x, 0.05, -2);
      this.root.add(g);
    }
    this.groundY = 0.18;
    this._addBall(0.3, 0x1e2430, 0, 0.48, 7);

    this.pins = [];
    const spots = [
      [0, -8],
      [-0.42, -8.55],
      [0.42, -8.55],
      [-0.84, -9.1],
      [0, -9.1],
      [0.84, -9.1],
    ];
    for (const [x, z] of spots) {
      const pin = this._makePin();
      pin.position.set(x, 0.18, z);
      this.root.add(pin);
      this.pins.push(pin);
    }
    this.camera.position.set(0, 4.1, 11);
    this.camera.lookAt(0, 0.5, -2);
  }

  _makePin() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.68, 6), poly(0xf3efe6));
    body.position.y = 0.34;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), poly(0xf3efe6));
    head.position.y = 0.76;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 4, 8), poly(0xe23d3d));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.52;
    g.add(body, head, stripe);
    g.userData = { upright: true, vel: new THREE.Vector3(), ang: 0 };
    return g;
  }

  _sceneBat() {
    this._addGround(16, 20, 0x234f38);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.65), poly(0xe8eef2));
    plate.position.set(0, 0.03, 2.1);
    this.root.add(plate);

    const bat = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.65, 6), poly(0x8b5a2b));
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -0.15;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.05, 6), poly(0xc48a3a));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.55;
    bat.add(handle, barrel);
    bat.position.set(-0.15, 1.05, 2.35);
    this.root.add(bat);
    this.tool = bat;
    this.toolAngle = -1.0;
    this.toolTarget = -1.0;
    bat.rotation.y = this.toolAngle;

    this._addBall(0.2, 0xf4f7fa, 0.15, 1.1, -6);
    this.vel.set(0, 0.1, 7.2);
    this.alive = true;
    this.hit = false;

    this.camera.position.set(3.6, 2.7, 6.4);
    this.camera.lookAt(0, 1.05, 1);
  }

  _sceneGolf() {
    this._addGround(22, 28, 0x286742);
    const fair = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.05, 20), poly(0x3d8d56));
    fair.position.set(0, 0.03, -2);
    this.root.add(fair);
    const green = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.07, 8), poly(0x4aaa66));
    green.position.set(0, 0.04, -9);
    this.root.add(green);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.55, 5), poly(0xf0f0f0));
    pole.position.set(0, 0.85, -9);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), poly(0xff4d4d));
    flag.position.set(0.26, 1.45, -9);
    this.root.add(pole, flag);

    this._addBall(0.15, 0xf7f7f2, 0, 0.15, 5.4);

    const club = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.35, 5), poly(0xb0b8c0));
    shaft.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.2), poly(0x3a4450));
    head.position.set(0.04, 0.04, 0);
    club.add(shaft, head);
    club.position.set(-0.3, 0.08, 5.4);
    this.root.add(club);
    this.tool = club;
    this.toolAngle = -0.8;
    this.toolTarget = -0.8;
    club.rotation.z = this.toolAngle;

    this.camera.position.set(2.4, 3.5, 9.2);
    this.camera.lookAt(0, 0.5, -2);
  }

  _fireThrow(power, aim) {
    if (!this.ball) return;
    this.ball.position.set(0, 1.2, 4.2);
    this.vel.copy(aim).multiplyScalar(8 + power * 16);
    this.vel.y += 2.2 + power * 4;
    this.spin = power * 8;
    this.alive = true;
  }

  _fireBowl(power, aim) {
    if (!this.ball) return;
    this.ball.position.set(aim.x * 0.55, 0.48, 7);
    this.vel.set(aim.x * (1.4 + power * 1.2), 0, -(9 + power * 14));
    this.spin = power * 10;
    this.alive = true;
    for (const pin of this.pins) {
      pin.rotation.set(0, 0, 0);
      pin.position.y = 0.18;
      pin.userData.upright = true;
      pin.userData.vel.set(0, 0, 0);
      pin.userData.ang = 0;
    }
  }

  _fireBat(power, aim) {
    this.toolTarget = 1.25 + power * 0.35;
    this.hit = false;
    this.pending = { power, aim };
    if (!this.ball) this._addBall(0.2, 0xf4f7fa, 0.15, 1.1, -6);
    else this.ball.position.set(0.15, 1.1, -6);
    this.vel.set(aim.x * 1.2, 0.12, 7 + power * 1.5);
    this.alive = true;
  }

  _fireGolf(power, aim) {
    this.toolTarget = 1.05 + power * 0.3;
    this.hit = false;
    this.pending = { power, aim };
    if (this.ball) {
      this.ball.position.set(0, 0.15, 5.4);
      this.vel.set(0, 0, 0);
    }
    this.alive = false;
  }

  _step(dt) {
    if (this.tool && (this.mode === "bat" || this.mode === "golf")) {
      this.toolAngle += (this.toolTarget - this.toolAngle) * Math.min(1, dt * 13);
      if (this.mode === "bat") {
        this.tool.rotation.y = this.toolAngle;
        this.tool.rotation.z = -0.2 + this.toolAngle * 0.12;
      } else {
        this.tool.rotation.z = this.toolAngle;
      }

      if (!this.hit && this.toolAngle > 0.12 && this.pending) {
        if (this.mode === "bat" && this.ball && this.alive) {
          const near =
            this.ball.position.z > 0.4 &&
            this.ball.position.z < 3.4 &&
            this.ball.position.distanceTo(this.tool.position) < 1.4;
          if (near) {
            this.hit = true;
            const { power, aim } = this.pending;
            this.vel.set(aim.x * 6, 2 + power * 6, -(10 + power * 18));
            this.spin = power * 12;
            this._emit({ mode: "bat", state: "hit", power });
          }
        } else if (this.mode === "golf" && this.ball) {
          this.hit = true;
          const { power, aim } = this.pending;
          this.alive = true;
          this.vel.copy(aim).multiplyScalar(10 + power * 22);
          this.vel.y = 3 + power * 8;
          this.spin = power * 9;
          this.pending = null;
          this._emit({ mode: "golf", state: "hit", power });
        }
      }
      if (this.hit && this.toolAngle > 0.85) this.toolTarget = -0.75;
    }

    if (this.mode === "bat" && this.ball && this.alive && !this.hit) {
      this.ball.position.addScaledVector(this.vel, dt);
      if (this.ball.position.z > 5) this.alive = false;
    }

    if (this.ball && this.alive) {
      if (!(this.mode === "bat" && !this.hit)) {
        this.vel.y += G * dt;
        this.ball.position.addScaledVector(this.vel, dt);
      }
      this.ball.rotation.x += this.spin * dt;
      this.ball.rotation.z += this.spin * 0.35 * dt;

      if (this.ball.position.y < this.groundY + this.radius) {
        this.ball.position.y = this.groundY + this.radius;
        if (this.mode === "bowl") {
          this.vel.y = 0;
          this.vel.x *= 0.985;
          this.vel.z *= 0.992;
          for (const pin of this.pins) {
            if (!pin.userData.upright) continue;
            const dx = pin.position.x - this.ball.position.x;
            const dz = pin.position.z - this.ball.position.z;
            if (dx * dx + dz * dz < 0.09) {
              pin.userData.upright = false;
              pin.userData.vel.set(-dx * 5, 2.4, -Math.abs(this.vel.z) * 0.15);
              pin.userData.ang = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random());
              this.vel.x *= 0.72;
              this.vel.z *= 0.86;
            }
          }
          if (Math.hypot(this.vel.x, this.vel.z) < 0.3) this.alive = false;
        } else {
          this.vel.y *= -0.34;
          this.vel.x *= 0.82;
          this.vel.z *= 0.82;
          if (Math.abs(this.vel.y) < 1.1 && Math.hypot(this.vel.x, this.vel.z) < 1) {
            this.vel.set(0, 0, 0);
            this.alive = false;
          }
        }
      }

      if (this.ball.position.z < -22 || this.ball.position.z > 14 || Math.abs(this.ball.position.x) > 14) {
        this.alive = false;
      }
    }

    for (const pin of this.pins) {
      if (pin.userData.upright) continue;
      pin.userData.vel.y += G * dt;
      pin.position.addScaledVector(pin.userData.vel, dt);
      pin.rotation.z += pin.userData.ang * dt;
      pin.rotation.x += pin.userData.ang * 0.35 * dt;
      if (pin.position.y < 0.12) {
        pin.position.y = 0.12;
        pin.userData.vel.y *= -0.2;
        pin.userData.vel.x *= 0.8;
        pin.userData.vel.z *= 0.8;
      }
    }
  }
}
