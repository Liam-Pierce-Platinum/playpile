// Weapon handling on the cube men: grips, gun aim/low-ready/recoil/reload, melee swing arcs, claw-on-blade contact.
// Everything is solved in world space AFTER rig.animate(): the weapon's pose is decided first (barrel on the aim ray,
// stock in the shoulder pocket, blade through the target on the hit frame), then the hands are put on it with
// exact two-bone IK (rig lengths are the cube rig's joint distances) and the hand joints are turned to the grip.
//
// Hand joint frame (both hands): -Y = wrist -> fingers, +Z = thumb side, palm = +X on the right hand, -X on the left.
// Weapon models (src/weapons.js): blade/barrel along model -Y, guns' top along model -Z, grips at the origin.
import * as THREE from 'three';
import { aimArmAt } from './rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), PI = Math.PI;
const ANCHOR = 0.06; // fist centre below the wrist joint (rig.handAnchor)
// grip offset per weapon, in the hand frame: rotation (model -> hand) and the model origin's position.
// Blades: model -Y (the blade) out of the thumb side (+Z), the edge (model +Z) toward the knuckles (-Y).
// Guns: the barrel (model -Y) along the fingers (-Y), the grip (model +Z, down) toward the pinky (-Z).
const BLADE = 'blade', GUN = 'gun';
export const GRIP = {
  baton: { r: BLADE, p: [0.02, -0.015, 0.0], len: 0.62, hit: 0.62 },
  pipe: { r: BLADE, p: [0.02, -0.015, 0.0], len: 0.6, hit: 0.65 },
  machete: { r: BLADE, p: [0.02, -0.015, 0.0], len: 0.54, hit: 0.6 },
  katana: { r: BLADE, p: [0.02, -0.015, -0.015], len: 0.85, hit: 0.55, two: [0, 0.15, 0] },
  pistol: { r: GUN, p: [0.015, -0.01, 0], mag: [0, 0.0, 0.07] },
  smg: { r: GUN, p: [0.015, -0.01, 0], butt: [0, 0.21, -0.03], fore: [0, -0.2, 0.0], mag: [0, -0.07, 0.14] },
  shotgun: { r: GUN, p: [0.015, -0.01, 0], butt: [0, 0.28, -0.02], fore: [0, -0.3, -0.01], mag: [0, -0.3, -0.01] },
  rifle: { r: GUN, p: [0.015, -0.01, 0], butt: [0, 0.29, -0.03], fore: [0, -0.26, -0.015], mag: [0, -0.1, 0.13] },
  sniper: { r: GUN, p: [0.015, -0.01, 0], butt: [0, 0.29, -0.03], fore: [0, -0.3, -0.015], mag: [0, -0.1, 0.1] },
};
function gq(A, B) { const Y = A.clone().negate(), X = new THREE.Vector3().crossVectors(Y, B); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, B)); }
const Q_BLADE = gq(V(0, 0, 1), V(0, -1, 0)), Q_GUN = gq(V(0, -1, 0), V(0, 0, -1));
for (const k in GRIP) { const g = GRIP[k]; g.q = (g.r === BLADE ? Q_BLADE : Q_GUN).clone(); g.qi = g.q.clone().invert(); }
// put a weapon in a hand anchor (grip offset) or on a holster mount (as modelled)
export function seatWeapon(mesh, parent, inHand, side = 'R') {
  parent.add(mesh); const g = inHand && GRIP[mesh.name];
  if (g) { mesh.quaternion.copy(g.q); mesh.position.set(g.p[0] * (side === 'L' ? -1 : 1), g.p[1], g.p[2]); }
  else { mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); }
}

// --- hand helpers -------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _X = V(0, 0, 0), _Y = V(0, 0, 0), _Z = V(0, 0, 0);
// world rotation of a hand whose fingers point along fwd and whose +X leans toward xHint
export function handQuat(fwd, xHint, out = new THREE.Quaternion()) {
  _Y.copy(fwd).normalize().negate(); _X.copy(xHint).addScaledVector(_Y, -xHint.dot(_Y));
  if (_X.lengthSq() < 1e-6) _X.set(1, 0, 0).addScaledVector(_Y, -_Y.x); _X.normalize(); _Z.crossVectors(_X, _Y);
  return out.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
}
export function setHandWorld(rig, side, q, k = 1e5, dt = 1) {
  const la = rig.j['larm' + side], h = rig.j['hand' + side]; la.updateWorldMatrix(true, false); la.getWorldQuaternion(_q2);
  _q.copy(_q2.invert()).multiply(q); h.quaternion.slerp(_q, 1 - Math.exp(-k * dt)); h.updateWorldMatrix(false, false);
}
// wrist on W, then the hand turned to q (instant: the weapon's own pose is what gets smoothed)
export function placeHand(rig, side, W, q) {
  rig.root.updateMatrixWorld(true); aimArmAt(rig, side, W, 1e5, 1); rig.j['uarm' + side].updateMatrixWorld(true); setHandWorld(rig, side, q);
}
// weapon model point (model frame) -> world, given the hand's world pose
const _hm = new THREE.Matrix4(), _gm = new THREE.Matrix4(), _s1 = V(1, 1, 1);
function weaponMatrix(handPos, handQ, kind, side = 'R', out = new THREE.Matrix4()) {
  const g = GRIP[kind]; _hm.compose(handPos, handQ, _s1);
  _gm.compose(V(g.p[0] * (side === 'L' ? -1 : 1), g.p[1] - ANCHOR, g.p[2]), g.q, _s1); return out.multiplyMatrices(_hm, _gm);
}
// the wrist position that puts the weapon origin at P with world rotation Qw
function wristFor(kind, P, Qw, side = 'R', outQ = new THREE.Quaternion()) {
  const g = GRIP[kind]; outQ.copy(Qw).multiply(g.qi);
  return { W: P.clone().sub(V(g.p[0] * (side === 'L' ? -1 : 1), g.p[1] - ANCHOR, g.p[2]).applyQuaternion(outQ)), qh: outQ };
}
// weapon rotation with its barrel/blade (model -Y) along d and its top (model -Z) toward up
function weaponQuat(d, up, out = new THREE.Quaternion()) {
  const Y = d.clone().normalize().negate(), Z = up.clone().addScaledVector(Y, -up.dot(Y)).normalize().negate(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const body = e => { const y = e.rig.root.rotation.y; return { f: V(Math.sin(y), 0, Math.cos(y)), r: V(-Math.cos(y), 0, Math.sin(y)), u: V(0, 1, 0) }; };
const wp = o => o.getWorldPosition(V(0, 0, 0));
const armOK = (e, s) => !(e.armLost && e.armLost[s]) && !(e.armHurt && e.armHurt[s] > 0);
const LONG = { smg: 1, shotgun: 1, rifle: 1, sniper: 1 };
export const aimTarget = e => e.G.hero.center;

// --- before animate(): which arms the weapon owns, and the torso's share of the aim -------------------------------
export function weaponPre(e, s) {
  if (!e.wmesh || !e.grip || e.wmesh.parent !== e.grip || !e.alive) return null;
  if (e.gun) {
    const o = { ...s };
    if (armOK(e, 'R')) o.armR = 'ik';
    if (armOK(e, 'L') && armOK(e, 'R') && (e.mode === 'alert' || LONG[e.gun])) o.armL = 'ik';
    const kick = e._kick || 0;
    if (e.state === 'gunaim') { // chest follows the aim's elevation, a slight athletic lean into the gun
      const c = e.center || e.pos, d = aimTarget(e).clone().sub(V(e.pos.x, e.pos.y + 1.45, e.pos.z)), el = Math.atan2(d.y, Math.hypot(d.x, d.z));
      o.torsoX = 0.06 - Math.max(-0.5, Math.min(0.5, el)) * 0.45; o.twist = LONG[e.gun] ? 0.12 : 0;
    }
    o.torsoX = (o.torsoX || 0) - kick * (LONG[e.gun] ? 0.08 : 0.04);
    return o;
  }
  const m = e.move, sw = m && !m.kick && (e.state === 'windup' || e.state === 'strike' || e.state === 'feint' || (e.state === 'recover' && e.recT));
  const o = { ...s }; let own = false;
  if (armOK(e, 'R')) { o.armR = 'ik'; own = true; }
  if (e.wkind === 'katana' && armOK(e, 'L') && armOK(e, 'R') && !e.offMesh) o.armL = 'ik';
  if (sw && m.arm === 'L') return null; // a left-hand jab with the free fist: the procedural arm
  return own ? o : null;
}

// --- after animate(): pose the weapon and put the hands on it ------------------------------------------------------
const _P = V(0, 0, 0), _Q = new THREE.Quaternion(), _wm = new THREE.Matrix4();
export function weaponPost(e, dt) {
  if (!e.wmesh || !e.grip || e.wmesh.parent !== e.grip || !e.alive || !armOK(e, 'R')) return;
  e.rig.root.updateMatrixWorld(true);
  const want = e.gun ? gunPose(e, dt) : meleePose(e, dt); if (!want) return;
  // smooth the weapon, never the hands
  const k = want.snap ? 1 : 1 - Math.exp(-(want.k || 14) * dt);
  if (!e._wP) { e._wP = want.P.clone(); e._wQ = want.Q.clone(); } else { e._wP.lerp(want.P, k); e._wQ.slerp(want.Q, k); }
  const kind = e.wkind, { W, qh } = wristFor(kind, e._wP, e._wQ, 'R');
  placeHand(e.rig, 'R', W, qh);
  const hw = wp(e.rig.j.handR); weaponMatrix(hw, e.rig.j.handR.getWorldQuaternion(_Q), kind, 'R', _wm);
  e._wm = _wm.clone(); // the weapon as the hand actually holds it (asserts, contact)
  const L = want.left; if (L && armOK(e, 'L')) {
    const q = L.q || handQuat(L.fwd(_wm), L.x(_wm)), pt = L.abs ? L.abs.clone() : V(...L.pt).applyMatrix4(_wm);
    placeHand(e.rig, 'L', pt.addScaledVector(V(0, -1, 0).applyQuaternion(q), -ANCHOR), q);
  }
}
const axis = (m, x, y, z) => V(x, y, z).transformDirection(m);

// guns: aim (barrel on the aim ray), low-ready, one-hand patrol (pistol), recoil kick, reload
function gunPose(e, dt) {
  const G = GRIP[e.gun]; if (!G) return null;
  const { f, r, u } = body(e), long = !!LONG[e.gun], j = e.rig.j;
  const shR = wp(j.uarmR), shL = wp(j.uarmL), mid = shR.clone().add(shL).multiplyScalar(0.5);
  // events: a shot kicks, the end of an aim starts the reload
  const fl = (e.flashT || 0) > 0; if (fl && !e._fl) e._kick = 1; e._fl = fl;
  e._kick = Math.max(0, (e._kick || 0) - dt * (long ? 7 : 6));
  if (e._wasAim && e.state !== 'gunaim' && e.alive) e._reload = e.gun === 'shotgun' ? 0.5 : 1.15;
  e._wasAim = e.state === 'gunaim'; e._reload = Math.max(0, (e._reload || 0) - dt);
  const tgt = aimTarget(e), aiming = e.state === 'gunaim', alert = e.mode === 'alert';
  let d, up = u, P, Q = new THREE.Quaternion(), k = aiming ? 22 : 9, left = null;
  const pocket = shR.clone().addScaledVector(r, -0.07).addScaledVector(f, 0.06).addScaledVector(u, -0.035);
  if (long) {
    // stock in the right shoulder pocket; aim: barrel on the line to the target; low-ready: muzzle 40 deg down
    d = aiming ? tgt.clone().sub(pocket).normalize() : f.clone().multiplyScalar(alert ? 0.77 : 0.6).addScaledVector(u, alert ? -0.64 : -0.8).addScaledVector(r, -0.12).normalize();
    for (let it = 0; it < 4; it++) { // converge so the line from the MUZZLE (not the stock) runs along the barrel to the target
      weaponQuat(d, up, Q); P = pocket.clone().sub(V(...G.butt).applyQuaternion(Q));
      if (!aiming) break; d = tgt.clone().sub(e.wmesh.userData.muzzle.position.clone().applyQuaternion(Q).add(P)).normalize();
    }
    left = { pt: G.fore, fwd: m => axis(m, 1, 0, 0).multiplyScalar(0.8).add(axis(m, 0, -1, 0).multiplyScalar(0.35)).normalize(), x: m => axis(m, 0, 0, 1) };
  } else if (aiming || alert) {
    // pistol, two hands: isosceles at arm's length, sights at chin height; low-ready: the same grip, 45 deg down
    const base = mid.clone().addScaledVector(u, aiming ? -0.03 : -0.2);
    d = aiming ? tgt.clone().sub(base).normalize() : f.clone().multiplyScalar(0.75).addScaledVector(u, -0.66).normalize();
    P = base.clone().addScaledVector(aiming ? d : f, aiming ? 0.42 : 0.3);
    for (let it = 0; it < 2 && aiming; it++) { weaponQuat(d, up, Q); const mz = e.wmesh.userData.muzzle.position.clone().applyQuaternion(Q).add(P); d = tgt.clone().sub(mz).normalize(); }
    weaponQuat(d, up, Q);
    // support hand wraps the grip from the left side, fingers under the trigger guard
    left = armOK(e, 'L') ? { pt: [-0.035, 0.03, 0.05], fwd: m => axis(m, 1, 0, 0).multiplyScalar(0.6).add(axis(m, 0, 0, 1).multiplyScalar(0.55)).add(axis(m, 0, 1, 0).multiplyScalar(0.2)).normalize(), x: m => axis(m, -1, 0, 0) } : null;
  } else { // pistol patrol: one hand, relaxed, muzzle at the ground ahead
    d = f.clone().multiplyScalar(0.45).addScaledVector(u, -0.9).addScaledVector(r, 0.08).normalize(); up = f.clone().addScaledVector(r, 0.4);
    P = shR.clone().addScaledVector(u, -0.43).addScaledVector(f, 0.12).addScaledVector(r, 0.04); weaponQuat(d, up, Q);
  }
  // recoil: muzzle flips up about the gun's right axis and the gun drives back
  if (e._kick > 0) {
    const kk = e._kick * e._kick, rax = V(1, 0, 0).applyQuaternion(Q);
    Q.premultiply(new THREE.Quaternion().setFromAxisAngle(rax, kk * ({ pistol: 0.45, smg: 0.14, shotgun: 0.42, rifle: 0.12, sniper: 0.3 }[e.gun] || 0.2)));
    P.addScaledVector(d, -kk * (long ? 0.05 : 0.06)); k = 60;
  }
  // reload: gun in to the chest and canted, support hand to the belt pouch and back up into the magwell
  if (e._reload > 0 && !aiming) {
    const T = e.gun === 'shotgun' ? 0.5 : 1.15, x = 1 - e._reload / T;
    if (e.gun === 'shotgun') { // rack the pump: the support hand slides back and forward on the pump
      const s = Math.sin(Math.min(1, x / 0.8) * PI); left = { ...left, pt: [0, -0.3 + s * 0.11, -0.01] };
    } else {
      const cant = Math.sin(Math.min(1, x / 0.9) * PI);
      const c = mid.clone().addScaledVector(f, 0.3).addScaledVector(u, -0.18);
      P = P.clone().lerp(c, cant * 0.85); const dd = f.clone().multiplyScalar(0.8).addScaledVector(u, 0.35).addScaledVector(r, 0.2).normalize();
      weaponQuat(d.clone().lerp(dd, cant).normalize(), up, Q);
      Q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -cant * 0.6)); // cant toward the support hand
      const pouch = x > 0.2 && x < 0.55;
      if (pouch) { const hip = wp(j.pelvis).addScaledVector(r, -0.2).addScaledVector(f, 0.06).addScaledVector(u, -0.02); left = { abs: hip, q: handQuat(u.clone().negate().addScaledVector(f, 0.3), r.clone().negate()) }; }
      else left = { pt: G.mag, fwd: m => axis(m, 0, 0, -1).multiplyScalar(0.8).add(axis(m, -1, 0, 0).multiplyScalar(0.3)).normalize(), x: m => axis(m, 0, 1, 0) };
    }
    k = 16;
  }
  return { P, Q, k, left };
}

// melee: one swing = windup -> contact (the blade passes through the target, or the hero's crossed claws when he
// blocks) -> follow-through, driven by the shoulder and the torso twist that src/enemy.js already applies
// keyframes: hand offset from the right shoulder (body frame x = his left, y = up, z = forward) and blade direction
const ARCS = {
  bash: { w: [[0.0, 0.22, -0.08], [0.25, 0.45, -0.85]], f: [[0.32, -0.42, 0.22], [0.55, -0.7, 0.3]] },
  chop: { w: [[0.08, 0.34, -0.06], [0.05, 0.35, -1]], f: [[0.16, -0.46, 0.28], [0.05, -0.85, 0.45]] },
  sweep: { w: [[-0.22, 0.02, -0.14], [-0.9, 0.18, -0.35]], f: [[0.42, -0.08, 0.22], [0.92, -0.05, 0.25]] },
  back: { w: [[0.4, 0.08, 0.1], [0.9, 0.3, -0.25]], f: [[-0.32, -0.06, 0.2], [-0.92, -0.05, 0.3]] },
  thrust: { w: [[-0.04, -0.12, -0.18], [0.04, 0.06, 1]], f: [[0.12, -0.02, 0.46], [0.06, 0.0, 1]] },
  jab: { w: [[0.06, -0.06, 0.05], [0.05, 0.1, 1]], f: [[0.12, -0.02, 0.4], [0.05, 0.05, 1]] },
  cross: { w: [[0.06, -0.06, 0.05], [0.05, 0.1, 1]], f: [[0.12, -0.02, 0.4], [0.05, 0.05, 1]] },
  hook: { w: [[-0.2, 0.05, 0.0], [-0.9, 0.2, 0.3]], f: [[0.35, 0.0, 0.25], [0.9, 0.0, 0.3]] },
};
const toW = (b, v) => b.r.clone().multiplyScalar(-v[0]).addScaledVector(b.u, v[1]).addScaledVector(b.f, v[2]);
const ease = t => t * t * (3 - 2 * t);
// where the blade meets the hero this swing: his crossed claws if he is blocking, else his chest
export function meleeTarget(e) {
  const h = e.G.hero;
  if (h.blocking && h.clawsOut && h.claws) { h.rig.root.updateMatrixWorld(true); return h.clawTip('L', 0.4).add(h.clawTip('R', 0.4)).multiplyScalar(0.5); }
  const to = V(e.pos.x - h.pos.x, 0, e.pos.z - h.pos.z).normalize();
  return h.center.clone().add(V(0, 0.2, 0)).addScaledVector(to, 0.13); // his chest's surface on the attacker's side
}
// how far this swing can really reach (m, from his root to the hero's root), so a hit only lands when the blade does
export function meleeReach(e) {
  const g = GRIP[e.wkind]; if (!g || e.gun) return null;
  return ((e.rig.armA || 0.32) + (e.rig.armB || 0.16)) * 1.04 + g.len * 0.88; // measured: the blade meets his chest's surface out to here
}
function meleePose(e, dt) {
  const g = GRIP[e.wkind]; if (!g) return null;
  const b = body(e), sh = wp(e.rig.j.uarmR), m = e.move;
  const two = !!g.two && armOK(e, 'L') && !e.offMesh;
  const left = two ? { pt: g.two, fwd: mm => axis(mm, 0, 0, 1), x: mm => axis(mm, -1, 0, 0) } : null;
  let spine = b.u.clone().addScaledVector(b.f, -0.5);
  const at = (hand, blade) => { const d = toW(b, blade).normalize(); const Hh = sh.clone().add(toW(b, hand)); const Q = weaponQuat(d, spine); return { P: Hh, Q, d }; };
  const swinging = m && !m.kick && m.arm !== 'L' && (e.state === 'windup' || e.state === 'strike' || e.state === 'feint' || (e.state === 'recover' && e.recT));
  if (!swinging) { // guard: blade up and forward, hand at the belly (two-handed katana at the navel, tip at the eyes)
    const relax = e.mode !== 'alert';
    const hand = relax ? [-0.03, -0.5, 0.06] : two ? [0.2, -0.36, 0.3] : [0.06, -0.32, 0.26];
    const blade = relax ? [-0.15, -0.9, 0.35] : two ? [0.1, 0.55, 0.85] : [0.15, 0.45, 0.85];
    const p = at(hand, blade); return { P: originFromHand(p.P, p.Q, e.wkind), Q: p.Q, k: 8, left: relax ? null : left };
  }
  const A = ARCS[e.combo?.[Math.min(e.ci, e.combo.length - 1)]] || ARCS.bash;
  const mo = toW(b, A.f[1]).sub(toW(b, A.w[1])); if (mo.lengthSq() > 0.05) spine = mo.normalize().negate(); // the edge leads the cut
  let W = at(...A.w), F = at(...A.f);
  // contact: blade direction halfway through the arc, hand placed so the hit point of the blade is on the target
  const T = meleeTarget(e), dC = W.d.clone().lerp(F.d, 0.5).normalize(); const toT = T.clone().sub(sh);
  dC.multiplyScalar(0.25).add(toT.clone().normalize()).normalize(); // at contact the blade points through the target, a little along the cut
  const inTo = T.clone().sub(W.P.clone().addScaledVector(W.d, g.len * g.hit)); // the way the blade's hit point travels into the target
  const Qc = weaponQuat(dC, inTo.lengthSq() > 0.01 && A !== ARCS.thrust ? inTo.normalize().negate() : spine), reach = (e.rig.armA || 0.32) + (e.rig.armB || 0.16) - 0.005;
  let Hc = null; // the target meets the blade as near the hilt as the arm allows (out toward the tip when it is far)
  for (let h = g.hit; h <= 0.96 && !(Hc && Hc.distanceTo(sh) <= reach); h += 0.05) Hc = wristFor(e.wkind, T.clone().addScaledVector(dC, -g.len * h), Qc).W;
  const v = Hc.clone().sub(sh); if (v.length() > reach) Hc = sh.clone().addScaledVector(v.normalize(), reach);
  const C = { P: Hc, Q: Qc };
  if (A === ARCS.thrust) { W = { P: Hc.clone().addScaledVector(dC, -0.32), Q: Qc, d: dC }; F = { P: Hc.clone().addScaledVector(dC, 0.12), Q: Qc, d: dC }; } // straight in along the blade, tip first
  let A0, A1, x;
  if (e.state === 'windup' || e.state === 'feint') { const guard = at([0.06, -0.32, 0.26], [0.15, 0.45, 0.85]); A0 = guard; A1 = W; x = e.state === 'feint' ? 0.5 : ease(Math.min(1, 1 - Math.max(0, e.t) / m.w)); }
  else if (e.state === 'strike') { const s = Math.min(1, 1 - Math.max(0, e.t) / m.a); if (s < 0.4) { A0 = W; A1 = C; x = s / 0.4; } else { A0 = C; A1 = F; x = (s - 0.4) / 0.6; } }
  else { A0 = F; A1 = at([0.06, -0.32, 0.26], [0.15, 0.45, 0.85]); x = ease(Math.min(1, 1 - Math.max(0, e.t) / (e.recT || 0.5))); }
  // the hand travels on an arc around the shoulder (not a straight line), the blade turns with it
  const p0 = A0.P.clone().sub(sh), p1 = A1.P.clone().sub(sh), r0 = p0.length(), r1 = p1.length();
  const dir = p0.clone().normalize().lerp(p1.clone().normalize(), x); if (dir.lengthSq() < 1e-4) dir.copy(p1).normalize(); dir.normalize();
  const Hh = sh.clone().addScaledVector(dir, r0 + (r1 - r0) * x), Q = A0.Q.clone().slerp(A1.Q, x);
  return { P: originFromHand(Hh, Q, e.wkind), Q, k: e.state === 'strike' ? 1e3 : 30, snap: e.state === 'strike', left };
}
// the weapon origin for a wrist at H (inverse of wristFor)
function originFromHand(H, Qw, kind) { const g = GRIP[kind], qh = Qw.clone().multiply(g.qi); return H.clone().add(V(g.p[0], g.p[1] - ANCHOR, g.p[2]).applyQuaternion(qh)); }

// --- asserts / contact ---------------------------------------------------------------------------------------------
// the weapon's blade (or barrel) as a world segment, from the hand-held pose
export function bladeSeg(e) {
  if (!e._wm) return null; const g = GRIP[e.wkind]; if (!g) return null;
  const a = V(0, 0, 0).applyMatrix4(e._wm), dir = axis(e._wm, 0, -1, 0);
  return { a, b: a.clone().addScaledVector(dir, g.len || 0.3), dir };
}
// the point where the blade meets the hero's claws (block) or body, or null
export function bladeContact(e) {
  const s = bladeSeg(e); if (!s) return null; const T = meleeTarget(e);
  const ab = s.b.clone().sub(s.a), t = Math.max(0, Math.min(1, T.clone().sub(s.a).dot(ab) / ab.lengthSq()));
  return s.a.clone().addScaledVector(ab, t);
}
export function barrelError(e) { // degrees between the barrel and the muzzle -> target line
  const mz = e.wmesh?.userData.muzzle; if (!mz || !e._wm) return null;
  const P = mz.position.clone().applyMatrix4(e._wm), ax = axis(e._wm, 0, -1, 0), to = aimTarget(e).clone().sub(P).normalize();
  return Math.acos(Math.min(1, ax.dot(to))) * 180 / PI;
}
