// Adaptive combat camera: frames the hero and his current opponent, pulls out for groups, pushes in and swings on
// heavy hits, plays finisher shots, leads/lags the motion, rolls into dashes, and never ends up inside a wall.
import * as THREE from 'three';
import { rayWorld, pointInBox } from './world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0);

// smooth 1D noise for shake (sum of sines, cheap and continuous)
const sn = (t, s) => Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.3 + s * 1.7) * 0.3 + Math.sin(t * 5.1 + s * 3.1) * 0.2;

export class CombatCam {
  constructor(camera) {
    this.cam = camera;
    this.target = V(0, 1.5, 0); this.dist = 3.9; this.roll = 0; this.fov = 68; this.time = 0;
    this.push = 0; this.swing = 0; this.swingV = 0; this.fovK = 0; this.cineK = 0;
    this.shot = { yaw: 0, pitch: 0.1, dist: 3.5, fov: 64 }; this.frame = V(0, 0, 0); this.frameK = 0;
  }
  // heavy hit: push in and swing around a little (side picked by caller or random)
  impulse(push, swing = 0) { this.push = Math.min(1, Math.max(this.push, push)); this.swingV += swing; }

  // safe distance along a direction from a pivot: centre ray + four offset rays (a fat probe), minus a skin
  clear(from, dir, want) {
    const right = _c.set(-dir.z, 0, dir.x); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
    const up = _d.crossVectors(right, dir).normalize();
    let d = rayWorld(from, dir, want + 0.3);
    for (const [x, y] of [[0.22, 0], [-0.22, 0], [0, 0.18], [0, -0.18]]) {
      _a.copy(from).addScaledVector(right, x).addScaledVector(up, y);
      if (pointInBox(_a)) continue;
      d = Math.min(d, rayWorld(_a, dir, want + 0.3));
    }
    return Math.max(0.35, d - 0.3);
  }

  update(G, dt, rdt) {
    const cam = this.cam, h = G.hero, inp = G.input; this.time += rdt;
    // what we frame: finisher victim, else the locked opponent, else nobody
    let foe = h.fin ? h.fin.e : (h.lock && h.lock.alive && !h.lock.held ? h.lock : null);
    if (foe && foe.pos.distanceTo(h.pos) > 9) foe = null;
    const anchor = h.dead && h.rd ? _a.copy(h.rd.coreObj.position) : _a.set(h.pos.x, h.pos.y + (h.crawling ? 0.5 : 1.5), h.pos.z);
    // lead: look a little ahead of where he is running
    const lead = _b.set(h.vel.x, 0, h.vel.z).multiplyScalar(h.climbing ? 0 : 0.11);
    this.frameK = damp(this.frameK, foe && !h.climbing ? 1 : 0, 3, rdt);
    if (foe) this.frame.copy(foe.center);
    const want = anchor.clone().add(lead).lerp(_c.copy(this.frame).setY(Math.max(this.frame.y, anchor.y - 0.3)), 0.22 * this.frameK);
    want.y += 0.1 * this.frameK; // shoulder height
    this.target.x = damp(this.target.x, want.x, 9, rdt); this.target.z = damp(this.target.z, want.z, 9, rdt);
    this.target.y = damp(this.target.y, want.y, h.climbing ? 7 : 12, rdt);

    // group framing: pull out with the spread of nearby enemies
    let spread = 0, near = 0;
    for (const e of G.enemies) { const d = e.pos.distanceTo(h.pos); if (d < 11) { near++; spread = Math.max(spread, d); } }
    // tight over-the-shoulder in a fight, wide for traversal
    this.combatK = damp(this.combatK || 0, foe && !h.climbing ? 1 : 0, 2.5, rdt);
    let wantD = (4.4 - this.combatK * 1.6) + (near > 1 ? Math.min(1.6, Math.max(0, spread - 3) * 0.22) : 0) + (h.diving ? 1.2 : 0) - (h.blocking ? 0.3 : 0) + (h.climbing ? 0.3 : 0);
    // impulses decay: push back out, swing springs home
    this.push = Math.max(0, this.push - rdt * 2.2);
    this.swingV += -this.swing * 18 * rdt; this.swingV *= Math.exp(-7 * rdt); this.swing += this.swingV * rdt;
    wantD *= 1 - this.push * 0.32;
    if (h.tight) wantD = 1.45; // in a vent or shaft: tight behind him

    // auto-assist: if the mouse rests, ease the view so the opponent is not lost off-screen
    if (foe && !h.fin && !h.climbing && performance.now() - (inp.lastMouse || 0) > 700) {
      const tf = Math.atan2(foe.pos.x - h.pos.x, foe.pos.z - h.pos.z), d = wrap(tf - inp.yaw);
      if (Math.abs(d) > 0.55) inp.yaw += Math.sign(d) * (Math.abs(d) - 0.55) * Math.min(1, 1.6 * rdt);
    }

    // orbit camera (player controlled)
    this.tilt = damp(this.tilt || 0, h.slide ? -0.32 : 0, 3, rdt); // look down the wall while sliding
    const cy = inp.yaw + this.swing, cp = h.crawling ? Math.max(-0.35, Math.min(0.2, inp.pitch)) : Math.max(-1.25, inp.pitch + this.tilt);
    const dir = V(Math.sin(cy) * Math.cos(cp), Math.sin(cp), Math.cos(cy) * Math.cos(cp));
    const right = V(-Math.cos(cy), 0, Math.sin(cy));
    // shoulder offset, shortened if a wall is right there
    const sh = h.tight ? 0 : Math.min(0.75 - this.combatK * 0.2, rayWorld(this.target, right, 0.95) - 0.25);
    const pivot = this.target.clone().addScaledVector(right, Math.max(0, sh));
    const back = dir.clone().negate().add(V(0, h.crawling ? 0.02 : 0.12, 0)).normalize();
    const free = this.clear(pivot, back, wantD);
    this.dist = Math.min(free, damp(this.dist, wantD, 6, rdt)); this.dist = Math.max(0.6, this.dist);
    const pos = pivot.clone().addScaledVector(back, this.dist);
    const look = pivot.clone().addScaledVector(dir, 8);

    // finisher shots: orbit around the pair, smoothly swinging between framings
    this.cineK = damp(this.cineK, G.cine && G.cine.shot ? 1 : 0, G.cine ? 5 : 3, rdt);
    if (G.cine && G.cine.shot) for (const k of ['yaw', 'pitch', 'dist', 'fov']) this.shot[k] = k === 'yaw' ? this.shot.yaw + wrap(G.cine.shot.yaw - this.shot.yaw) * (1 - Math.exp(-4 * rdt)) : damp(this.shot[k], G.cine.shot[k], 4, rdt);
    let cineFov = this.shot.fov;
    if (this.cineK > 0.001 && h.fin) {
      const f = h.fin, focus = h.pos.clone().setY(h.pos.y + 1.3).lerp(f.e.center.clone(), 0.5);
      const y = f.yaw + this.shot.yaw, p = this.shot.pitch;
      const cdir = V(Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)); // view direction
      const cb = cdir.clone().negate();
      const cd = this.clear(focus, cb, this.shot.dist);
      const cpos = focus.clone().addScaledVector(cb, Math.min(cd, this.shot.dist));
      pos.lerp(cpos, this.cineK); look.lerp(focus, this.cineK);
    } else if (!h.fin) this.shot.yaw = wrap(inp.yaw - h.yaw);

    // final safety: never inside a box
    for (let i = 0; i < 8 && pointInBox(pos); i++) pos.lerp(anchor, 0.25);
    cam.position.copy(pos); cam.lookAt(look);

    // roll into lateral motion and dashes, plus smooth trauma shake
    const lat = h.vel.x * right.x + h.vel.z * right.z;
    const rollT = Math.max(-0.12, Math.min(0.12, -lat * (h.dashT > 0 ? 0.02 : 0.008)));
    this.roll = damp(this.roll, rollT, 5, rdt);
    const s = G.shakeAmt * G.shakeAmt, t = this.time * 22;
    cam.position.x += sn(t, 1) * s * 0.35; cam.position.y += sn(t, 7) * s * 0.35;
    cam.rotateZ(this.roll + sn(t, 4) * s * 0.07);
    G.shakeAmt = Math.max(0, G.shakeAmt - rdt * 2.4);

    // FOV: sprint and dives widen, kicks snap, claw punch pinches, finisher shots set their own
    const sprinting = Math.hypot(h.vel.x, h.vel.z) > 7.5;
    this.fovK = damp(this.fovK, 0, 4, rdt);
    this.fov = damp(this.fov, 68 + (sprinting ? 6 : 0) + (h.diving ? 12 : 0) + (h.dashT > 0 ? 4 : 0), 5, rdt);
    cam.fov = this.fov * (1 - this.cineK) + cineFov * this.cineK + this.fovK - G.camPunch * 7;
    cam.updateProjectionMatrix();
    G.camPunch = Math.max(0, G.camPunch - rdt * 4);
    return { pos, foe };
  }
}
