// Campaign traversal on top of the hero: vent crawling (elbows and knees, low camera, kicking grates out),
// ladders, and trees (claw-grab branches from the air, wall-jump from a trunk leaps to the trunk you look at).
// Hooked in through G.traverse(hero, dt, move) (returns true when it owns the hero this frame) and
// G.traverseClick(hero, btn) (returns true when it used the click). Only active while a campaign level is loaded.
import * as THREE from 'three';
import { collideCylinder, nearestWall, pointInBox, boxes } from '../world.js';
import { aimArmAt } from '../rig.js';
import { sfx } from '../audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CR = 0.3, CH = 0.75, CRAWL = 1.7, CRAWL_FAST = 2.5, LADDER = 2.1;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const inZone = (z, p, pad = 0) => p.x > z.min.x - pad && p.x < z.max.x + pad && p.z > z.min.z - pad && p.z < z.max.z + pad && p.y > z.min.y - 0.3 && p.y < z.max.y - 0.3;
// room to stand up: nothing solid where the standing body would be
const headroom = p => !pointInBox(V(p.x, p.y + 1.15, p.z)) && !pointInBox(V(p.x, p.y + 1.75, p.z)) && !pointInBox(V(p.x + 0.25, p.y + 1.5, p.z)) && !pointInBox(V(p.x - 0.25, p.y + 1.5, p.z)) && !pointInBox(V(p.x, p.y + 1.5, p.z + 0.25)) && !pointInBox(V(p.x, p.y + 1.5, p.z - 0.25));

export function makeTraverse(L) {
  const G = L.G;
  const st = { lastTree: null, leap: null, stepAcc: 0 };

  function crawl(h, dt, mv, inp) {
    const C = h.crawlSt || (h.crawlSt = { ph: 0 });
    h.crawling = true; h.tight = true; h.crouching = true; h.atk = null; h.queued = null; h.blocking = false; h.climbing = false; h.lock = null;
    // kicking a grate out: turn the feet to it, chamber, mule-kick both legs, the grate flies
    if (h.crawlKick) {
      const K = h.crawlKick; K.t += dt;
      const away = Math.atan2(h.pos.x - K.grate.at.x, h.pos.z - K.grate.at.z); h.yaw += wrap(away - h.yaw) * Math.min(1, dt * 14);
      const ch = Math.min(1, K.t / 0.25), ex = K.t > 0.25 ? Math.min(1, (K.t - 0.25) / 0.08) : 0, back = K.t > 0.45 ? Math.min(1, (K.t - 0.45) / 0.3) : 0;
      const k = ex * (1 - back);
      if (ex >= 1 && !K.hit) { K.hit = true; K.grate.pop(K.grate.n.clone().multiplyScalar(7).setY(2)); G.shake(0.3); G.hitstop(0.05); }
      h.vel.set(0, 0, 0); h.grounded = true;
      h.anim(dt, { crawl: true, noArms: true, torsoX: 0.1, headX: -0.5, legs: { tl: -0.75 + ch * (1 - k) * -0.5 + k * 1.3, tr: -0.75 + ch * (1 - k) * -0.5 + k * 1.3, kl: 1.5 + ch * (1 - k) * 0.6 - k * 1.5, kr: 1.5 + ch * (1 - k) * 0.6 - k * 1.5 } }, 0);
      h.rig.j.pelvis.position.y = 0.5; planted(h, C, dt, 0);
      if (K.t > 0.8) h.crawlKick = null;
      return true;
    }
    const fast = !!(inp.keys.ShiftLeft || inp.keys.ShiftRight), sp = fast ? CRAWL_FAST : CRAWL;
    const k = 1 - Math.exp(-10 * dt);
    h.vel.x += (mv.x * sp - h.vel.x) * k; h.vel.z += (mv.z * sp - h.vel.z) * k; h.vel.y -= 36 * dt;
    const prevY = h.pos.y; h.pos.addScaledVector(h.vel, dt);
    const c = collideCylinder(h.pos, h.vel, CR, CH, prevY); h.grounded = c.grounded;
    const hs = Math.hypot(h.vel.x, h.vel.z);
    if (mv.lengthSq() > 0.01) h.yaw += wrap(Math.atan2(mv.x, mv.z) - h.yaw) * Math.min(1, dt * 8);
    C.ph += hs * dt * 3.4;
    st.stepAcc += hs * dt; if (st.stepAcc > 0.7) { st.stepAcc = 0; G.noise?.(h.pos, 1.2, false); if (Math.random() < 0.5) sfx.metal(); }
    const s = Math.sin(C.ph);
    h.anim(dt, { crawl: true, noArms: true, torsoX: 0.1 + Math.sin(C.ph * 2) * 0.03, headX: -0.85, roll: Math.cos(C.ph) * 0.05 * Math.min(1, hs), legs: { tl: -0.72 + s * 0.28, tr: -0.72 - s * 0.28, kl: 1.5 - s * 0.15, kr: 1.5 + s * 0.15 } }, 0);
    h.rig.j.pelvis.position.y = 0.5;
    planted(h, C, dt, hs);
    return true;
  }
  // elbows and forearms planted ahead, alternating reach-and-pull
  function planted(h, C, dt, hs) {
    h.rig.root.updateMatrixWorld(true);
    const f = h.forward(), side = V(f.z, 0, -f.x); // +side = the hero's left
    for (const [hd, s, off] of [['L', 1, 0], ['R', -1, Math.PI]]) {
      const ph = C.ph + off, reach = 0.5 + Math.sin(ph) * 0.18 * Math.min(1, hs + 0.2), lift = Math.max(0, Math.cos(ph)) * 0.1 * Math.min(1, hs);
      const p = h.pos.clone().addScaledVector(f, reach).addScaledVector(side, s * 0.2); p.y = h.pos.y + 0.07 + lift;
      aimArmAt(h.rig, hd, p, 20, dt);
    }
  }

  function ladder(h, dt, mv, inp) {
    const Ld = h.ladder, n = Ld.n;
    h.crawling = false; h.tight = Ld.tight; h.climbing = false; h.atk = null; h.blocking = false;
    h.pos.x = Ld.x + n.x * 0.42; h.pos.z = Ld.z + n.z * 0.42; h.yaw = Math.atan2(-n.x, -n.z); h.vel.set(0, 0, 0);
    const up = (inp.keys.KeyW ? 1 : 0) - (inp.keys.KeyS ? 1 : 0);
    h.pos.y = Math.max(Ld.y0, Math.min(Ld.y1, h.pos.y + up * LADDER * dt));
    const C = h.ladSt || (h.ladSt = { ph: 0, acc: 0 }); C.ph += Math.abs(up) * dt * 7; C.acc += Math.abs(up) * dt;
    if (C.acc > 0.3) { C.acc = 0; sfx.step(); }
    if (h.jumpBuf > 0) { h.jumpBuf = 0; h.ladder = null; h.vel.set(n.x * 4, 5, n.z * 4); h.grounded = false; h.airKind = 'jump'; h.regrab = 0.3; return false; }
    if (up < 0 && h.pos.y <= Ld.y0 + 0.01) { h.ladder = null; h.grounded = true; return false; }
    if (up > 0 && h.pos.y >= Ld.y1 - 0.05) { // over the top
      const to = V(Ld.x - n.x * 0.75, Ld.y1, Ld.z - n.z * 0.75);
      h.ladder = null; h.mantle = { from: h.pos.clone(), to, t: 0, dur: 0.5 }; sfx.jump(); return false;
    }
    const s = Math.sin(C.ph);
    h.grounded = true;
    h.anim(dt, { noArms: true, torsoX: 0.05, headX: -0.15, legs: { tl: -0.55 + s * 0.4, tr: -0.55 - s * 0.4, kl: 0.9 + s * 0.5, kr: 0.9 - s * 0.5 } }, 0);
    h.rig.root.updateMatrixWorld(true);
    for (const [hd, sg, off] of [['L', 1, 0], ['R', -1, Math.PI]]) {
      const ry = h.pos.y + 1.55 + Math.sin(C.ph + off) * 0.15, rung = Math.round((ry - Ld.y0) / 0.3) * 0.3 + Ld.y0;
      const p = V(Ld.x + n.x * 0.08, Math.min(rung, Ld.y1 + 0.6), Ld.z + n.z * 0.08).addScaledVector(Ld.side, -sg * Ld.w * 0.42);
      aimArmAt(h.rig, hd, p, 22, dt);
    }
    return true;
  }
  function tryLadder(h, mv, inp) {
    if (h.climbing || h.fin || h.mantle || h.regrab > 0) return false;
    for (const Ld of L.ladders) {
      const n = Ld.n, bx = Ld.x + n.x * 0.42, bz = Ld.z + n.z * 0.42, d = Math.hypot(h.pos.x - bx, h.pos.z - bz);
      const into = -(mv.x * n.x + mv.z * n.z), facing = -(h.forward().x * n.x + h.forward().z * n.z);
      // from below / the side: walk into it with W held
      if (d < 0.65 && h.pos.y >= Ld.y0 - 0.3 && h.pos.y < Ld.y1 - 0.9 && inp.keys.KeyW && (into > 0.4 || facing > 0.6)) { h.ladder = Ld; return true; }
      // from the top: walk off the edge over it
      const tx = Ld.x - n.x * 0.4, tz = Ld.z - n.z * 0.4;
      if (Math.hypot(h.pos.x - tx, h.pos.z - tz) < 0.7 && Math.abs(h.pos.y - Ld.y1) < 0.3 && (mv.x * n.x + mv.z * n.z) > 0.5) { h.ladder = Ld; h.pos.y = Ld.y1 - 1.2; return true; }
    }
    return false;
  }

  G.traverse = (h, dt, mv) => {
    const inp = G.input;
    if (h.ladder) { if (ladder(h, dt, mv, inp)) return true; }
    else if (tryLadder(h, mv, inp)) return ladder(h, dt, mv, inp);
    if (h.mantle) { h.crawling = false; return false; }
    // vents: inside a crawl zone (or a mouth, crouched or pushing into it) you crawl; out with headroom you stand
    const p = h.pos, inside = L.crawlZones.some(z => inZone(z, p)), mouth = L.mouths.find(m => inZone(m, p, 0.1));
    if (!h.crawling && !h.climbing && (inside || (mouth && h.grounded && (h.crouching || inp.crouch || -(mv.x * mouth.out.x + mv.z * mouth.out.z) > 0.4)))) { h.crawling = true; h.crawlSt = null; }
    if (h.crawling && !inside && !mouth && headroom(p)) { h.crawling = false; h.tight = false; }
    if (h.crawling && !inside && mouth && headroom(p) && (mv.x * mouth.out.x + mv.z * mouth.out.z) > 0.4) { h.crawling = false; h.tight = false; }
    if (h.crawling) return crawl(h, dt, mv, inp);
    h.tight = false;
    // trees: remember the trunk you leapt from; steer the leap onto the trunk you are looking at; grab on arrival
    if (h.climbing && h.wall?.box?.tree) { st.lastTree = h.wall.box; st.lastN = h.wall.normal.clone(); }
    else if (h.climbing) st.lastTree = null;
    if (!h.climbing && st.lastTree && h.wallJumpT > 0.25 && !st.leap) {
      const camF = V(Math.sin(inp.yaw), 0, Math.cos(inp.yaw));
      let best = null, bs = -1;
      for (const T of L.trees) {
        if (T.box === st.lastTree) continue;
        const c = V(T.x, 0, T.z), d = V(c.x - p.x, 0, c.z - p.z), D = d.length(); if (D > 11 || D < 1.5) continue;
        const dot = d.normalize().dot(camF); if (d.dot(st.lastN) < 0.15) continue; // never through the trunk you are on
        if (dot > 0.55 && dot / (1 + D * 0.05) > bs) { bs = dot / (1 + D * 0.05); best = T; }
      }
      if (best) {
        const d = V(best.x - p.x, 0, best.z - p.z), D = d.length(); d.normalize();
        const rx = p.x - best.x, rz = p.z - best.z, fn = Math.abs(rx) > Math.abs(rz) ? V(Math.sign(rx), 0, 0) : V(0, 0, Math.sign(rz)); // the face toward you
        const face = V(best.x, 0, best.z).addScaledVector(fn, best.r + 0.4), dist = Math.hypot(face.x - p.x, face.z - p.z); d.set(face.x - p.x, 0, face.z - p.z).normalize();
        const ty = Math.min(best.y + best.h - 2, Math.max(best.y + 0.5, p.y + 0.6)), T = Math.max(0.35, dist / 10);
        h.vel.set(d.x * dist / T, (ty - p.y + 0.5 * 31 * T * T) / T, d.z * dist / T); h.yaw = Math.atan2(d.x, d.z);
        st.leap = { tree: best, t: T + 0.5, age: 0 };
      }
      st.lastTree = null;
    }
    if (st.leap) {
      st.leap.t -= dt; st.leap.age += dt;
      if (h.climbing || (h.grounded && st.leap.age > 0.15) || st.leap.t <= 0) st.leap = null;
      else if (h.regrab <= 0) { const w = nearestWall(p, 0.36, 1.85, 0.8); if (w && w.box === st.leap.tree.box && w.dist < 0.35) { st.leap = null; h.grab('L', w); } }
    }
    return false;
  };
  // claw-grab a branch from the air: pull up onto it. In a vent or on a ladder clicks do nothing.
  G.traverseClick = (h, btn) => {
    if (h.crawling || h.ladder) return true;
    if (h.grounded || h.climbing || !h.clawsOut || h.fin || h.mantle) return false;
    const p = h.pos;
    for (const b of boxes) {
      if (!b.branch) continue;
      if (b.max.y < p.y + 0.3 || b.max.y > p.y + 2.4) continue;
      const cx = Math.max(b.min.x + 0.12, Math.min(p.x, b.max.x - 0.12)), cz = Math.max(b.min.z + 0.12, Math.min(p.z, b.max.z - 0.12));
      if (Math.hypot(cx - p.x, cz - p.z) > 1.0) continue;
      const to = V(cx, b.max.y, cz);
      if (pointInBox(V(to.x, to.y + 1, to.z))) continue;
      h.mantle = { from: p.clone(), to, t: 0, dur: 0.38 }; h.vel.set(0, 0, 0);
      G.fx.gouge(V(cx, b.max.y - 0.01, cz), V(0, 1, 0), 0.3, h.forward(), 0.7); sfx.clang(); G.shake(0.1);
      return true;
    }
    return false;
  };
  return () => { G.traverse = null; G.traverseClick = null; };
}
