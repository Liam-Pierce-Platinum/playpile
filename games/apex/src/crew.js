// =====================================================================
// APEX :: crew.js - THE PEOPLE WHO DO THE PIT STOP
// =====================================================================
//
// Liam: "a 360 animation that shows the people fixing the car".
//
// A crew is seventeen people in the team's colours, built from boxes the
// way the car is built from numbers, and animated from pits.js's clock -
// nothing here decides anything, it only draws what the timeline says is
// happening at `pit.t` seconds into the stop:
//
//   front and rear jack    in, lift the car, drop it at the end
//   at each wheel, three   the gunner kneels and undoes the nut, one pulls
//                          the old wheel off and carries it away, one brings
//                          the new wheel in; the gun goes back on and the
//                          gunner's arm goes up when that corner is done
//   front / rear wing      two people carry a new one in, when it is needed
//   lollipop               a board on a pole in front of the car; it swings
//                          up when the car can go
//
// Everything is in the CAR's frame (+X left, +Z forward, y = 0 on the road),
// placed at the car when it stops and at the painted box while waiting.
//
// Each person is five meshes: a body (torso, head, helmet, visor, one
// vertex-coloured geometry), two arms and two legs that swing from the
// shoulder and the hip. The geometry is made once per team colour.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const span = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

const R = 0.36;              // wheel radius: wheel centres are this far above the road
const WHEELS = [[-1, 1.96], [1, 1.96], [-1, -1.64], [1, -1.64]];   // car.js order: FR FL RR RL, as [x, z]

// ---- geometry, once per colour ---------------------------------------------
const GEO = new Map();
function coloured(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

function geometry(team, trim) {
  const key = team + ':' + trim;
  if (GEO.has(key)) return GEO.get(key);
  const dark = 0x1a1c20;
  // BODY, from the hips up: y = 0 is the hip joint
  const body = mergeGeometries([
    coloured(box(0.40, 0.56, 0.24, 0, 0.30, 0), team),              // torso
    coloured(box(0.42, 0.10, 0.26, 0, 0.02, 0), trim),              // belt
    coloured(box(0.40, 0.08, 0.25, 0, 0.44, 0), trim),              // chest stripe
    coloured(box(0.12, 0.08, 0.12, 0, 0.62, 0), dark),              // neck
    coloured(new THREE.SphereGeometry(0.14, 12, 9).translate(0, 0.78, 0), trim),   // helmet
    coloured(box(0.20, 0.09, 0.06, 0, 0.79, 0.12), dark),           // visor
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  // AN ARM hangs from the shoulder: y = 0 is the shoulder joint
  const arm = mergeGeometries([
    coloured(box(0.11, 0.56, 0.11, 0, -0.28, 0), team),
    coloured(box(0.12, 0.12, 0.13, 0, -0.62, 0), dark),             // glove
  ]);
  // A LEG hangs from the hip
  const leg = mergeGeometries([
    coloured(box(0.15, 0.80, 0.17, 0, -0.40, 0), team),
    coloured(box(0.16, 0.12, 0.28, 0, -0.86, 0.05), dark),          // boot
  ]);
  const set = { body, arm, leg };
  GEO.set(key, set);
  return set;
}

let MAT = null;
function mats() {
  if (MAT) return MAT;
  MAT = {
    person: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.7, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6 }),
    sign: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
  };
  return MAT;
}

/** one person, feet at y = 0, facing +Z */
function person(G) {
  const M = mats();
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const body = new THREE.Mesh(G.body, M.person); body.castShadow = true; hips.add(body);
  const arms = [1, -1].map((s) => {
    const a = new THREE.Group(); a.position.set(s * 0.26, 0.52, 0);
    const m = new THREE.Mesh(G.arm, M.person); m.castShadow = true; a.add(m);
    hips.add(a); return a;
  });
  const legs = [1, -1].map((s) => {
    const l = new THREE.Group(); l.position.set(s * 0.1, 0, 0);
    const m = new THREE.Mesh(G.leg, M.person); m.castShadow = true; l.add(m);
    hips.add(l); return l;
  });
  return { root, hips, arms, legs, hand: new THREE.Vector3() };
}

// ---- poses -----------------------------------------------------------------
function stand(p, armsOut = 0.08) {
  p.hips.position.y = 0.92; p.hips.rotation.set(0, 0, 0);
  p.legs.forEach((l) => l.rotation.set(0, 0, 0));
  p.arms.forEach((a, i) => a.rotation.set(0, 0, (i ? -1 : 1) * armsOut));
}
/** crouched on one knee, leaning in, both hands forward at wheel height */
function kneel(p, reach = 1) {
  p.hips.position.y = 0.52;
  p.hips.rotation.x = 0.35 * reach;
  p.legs[0].rotation.x = -1.35;          // front leg, foot flat
  p.legs[1].rotation.x = 0.55;           // back leg, knee on the ground
  p.arms.forEach((a) => a.rotation.set(-1.35 * reach, 0, 0));
}
/** bent over, hands out in front at a height */
function reachOut(p, lean = 0.4, arms = -1.2) {
  p.hips.position.y = 0.86; p.hips.rotation.x = lean;
  p.legs[0].rotation.x = -0.35; p.legs[1].rotation.x = 0.2;
  p.arms.forEach((a) => a.rotation.set(arms, 0, 0));
}
function walk(p, phase, amount = 1) {
  stand(p);
  const s = Math.sin(phase) * 0.55 * amount;
  p.legs[0].rotation.x = s; p.legs[1].rotation.x = -s;
}
function place(p, x, z, faceX, faceZ) {
  p.root.position.set(x, 0, z);
  p.root.rotation.y = Math.atan2(faceX - x, faceZ - z);
}

export class Crew {
  constructor(scene, livery) {
    this.scene = scene;
    const G = geometry(livery.body, livery.trim === livery.body ? livery.accent : livery.trim);
    const M = mats();
    this.group = new THREE.Group();
    this.people = [];
    const add = () => { const p = person(G); this.group.add(p.root); this.people.push(p); return p; };

    this.jackF = add(); this.jackR = add();
    this.corner = WHEELS.map(() => ({ gun: add(), off: add(), on: add() }));
    this.wingF = [add(), add()];
    this.wingR = [add(), add()];
    this.lolly = add();

    // props
    const bar = new THREE.BoxGeometry(0.08, 0.08, 1.5); bar.translate(0, 0, 0.75);
    this.jackBars = [new THREE.Mesh(bar, M.black), new THREE.Mesh(bar, M.black)];
    this.jackBars.forEach((b) => { b.castShadow = true; this.group.add(b); });
    this.guns = this.corner.map(() => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), M.metal);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8).rotateX(Math.PI / 2).translate(0, 0, 0.2), M.black);
      g.add(body, nozzle);
      this.group.add(g);
      return g;
    });
    const pole = new THREE.Group();
    pole.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6).translate(0, 0.95, 0), M.black));
    const board = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20).rotateX(Math.PI / 2).translate(0, 1.95, 0), M.sign);
    pole.add(board);
    this.pole = pole;
    this.group.add(pole);
    this.props = [];          // wheels and wings, cloned from the car when the stop starts
    scene.add(this.group);
    this.visible = true;
  }

  /** clone what the crew carry from this car's art: two wheels per corner, the wings */
  arm(art) {
    for (const p of this.props) this.group.remove(p);
    this.props = [];
    this.oldWheels = art.wheels.map((w) => { const c = w.clone(true); c.visible = false; c.rotation.set(0, 0, 0); this.group.add(c); this.props.push(c); return c; });
    this.newWheels = art.wheels.map((w) => { const c = w.clone(true); c.visible = false; c.rotation.set(0, 0, 0); c.traverse((o) => { o.visible = true; }); this.group.add(c); this.props.push(c); return c; });
    const wing = (names) => {
      const g = new THREE.Group();
      for (const n of names) { const c = art.pieces[n].clone(true); c.visible = true; g.add(c); }
      g.visible = false; this.group.add(g); this.props.push(g); return g;
    };
    this.newFront = wing(['fwing', 'epL', 'epR']);
    this.newRear = wing(['rwing']);
    this.art = art;
  }

  /** standing ready in the box, before the car arrives */
  ready(pose, now) {
    this.group.position.set(pose.x, pose.y, pose.z);
    this.group.rotation.set(0, pose.h, 0);
    const bob = Math.sin(now * 2.2) * 0.02;
    const at = (p, x, z, fx, fz) => { place(p, x, z, fx, fz); stand(p); p.hips.position.y += bob; };
    at(this.jackF, 0, 4.6, 0, 0);
    at(this.jackR, 0, -4.0, 0, 0);
    this.corner.forEach((c, k) => {
      const [sx, wz] = WHEELS[k];
      at(c.gun, sx * 1.9, wz, 0, wz);
      at(c.off, sx * 2.1, wz - 0.8, 0, wz);
      at(c.on, sx * 2.5, wz + 0.5, 0, wz);
      this.guns[k].position.set(sx * 1.75, 0.9, wz);
    });
    this.wingF.forEach((p, i) => { p.root.visible = false; place(p, (i ? -1 : 1) * 1.2, 5.2, 0, 0); });
    this.wingR.forEach((p, i) => { p.root.visible = false; place(p, (i ? -1 : 1) * 1.2, -4.6, 0, 0); });
    at(this.lolly, -0.9, 6.2, 0, 0);
    this.pole.position.set(-0.7, 0, 6.0); this.pole.rotation.set(-1.35, 0, 0);
    this.jackBars.forEach((b) => { b.visible = false; });
    for (const p of this.props) p.visible = false;
  }

  /**
   * Draw the stop at `pit.t` seconds in. `art` is the car, whose wheels are
   * hidden while they are off it.
   */
  service(pit, art) {
    const P = pit.plan, t = pit.t, T = pit.total;
    this.group.position.set(P.pose.x, P.pose.y, P.pose.z);
    this.group.rotation.set(0, P.pose.yaw, 0);
    const lift = pit.lift;

    // ---- JACKS: walk in, bars under the nose and the gearbox, lift, drop
    const jIn = span(t, 0, 0.25);
    for (const [p, z0, z1, bar, zCar] of [[this.jackF, 4.6, 4.05, this.jackBars[0], 3.0], [this.jackR, -4.0, -3.55, this.jackBars[1], -2.6]]) {
      const zz = lerp(z0, z1, jIn);
      place(p, 0, zz, 0, 0);
      reachOut(p, 0.35, -0.9 - lift * 3);
      bar.visible = true;
      // the bar runs from his hands to the lift point under the car
      const hy = 0.72, ly = 0.12 + lift;
      bar.position.set(0, hy, zz + (zCar > 0 ? -0.35 : 0.35));
      const dz = zCar - bar.position.z;
      bar.rotation.set(Math.atan2(hy - ly, Math.abs(dz)) * (dz > 0 ? 1 : 1), dz > 0 ? 0 : Math.PI, 0);
      bar.scale.z = Math.hypot(dz, hy - ly) / 1.5;
    }

    // ---- WHEELS
    const [a, b] = P.tyres, dur = b - a;
    this.corner.forEach((c, k) => {
      const [sx, wz] = WHEELS[k];
      const u = (t - a) / dur;
      const wheelY = R + lift;
      // the gunner: kneeling at the hub the whole time, arm up when done
      place(c.gun, sx * 1.55, wz, 0, wz);
      kneel(c.gun, u < 0.97 ? 1 : 0.7);
      if (u > 0.97) c.gun.arms[1].rotation.set(-3.0, 0, 0);
      const gunOn = (u > 0.02 && u < 0.2) || (u > 0.72 && u < 0.95);
      this.guns[k].position.set(sx * (gunOn ? 1.2 : 1.32), wheelY, wz);
      this.guns[k].rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, gunOn ? t * 40 : 0);

      // the wheel on the car is hidden from the moment it comes off until the new one is bolted on
      const off = u >= 0.2 && u < 0.72;
      const carWheel = art.wheels[k];
      if (!P.wheelsOff[k]) carWheel.visible = !off;
      else carWheel.visible = u >= 0.72;

      // the off man: takes the old wheel straight out and walks it back
      const pull = span(u, 0.2, 0.42), away = span(u, 0.42, 0.62);
      const ow = this.oldWheels[k];
      ow.visible = !P.wheelsOff[k] && u >= 0.2 && u < 0.9;
      const oz = wz - away * 1.5, ox = sx * (1 + pull * 0.8 + away * 0.6);
      ow.position.set(ox, lerp(wheelY, 0.9, away), oz);
      place(c.off, sx * (1.7 + pull * 0.6 + away * 0.6), lerp(wz - 0.7, oz - 0.2, pull), 0, u < 0.2 ? wz : oz + 3);
      if (u < 0.2) reachOut(c.off, 0.5, -1.2);
      else if (u < 0.9) { reachOut(c.off, 0.3, -1.0); }
      else stand(c.off);

      // the on man: holds the new wheel ready, steps in, pushes it on
      const inT = span(u, 0.38, 0.7);
      const nw = this.newWheels[k];
      nw.visible = u < 0.72 && u > -2;
      nw.position.set(sx * lerp(1.95, 1.0, inT), lerp(0.85, wheelY, inT), lerp(wz + 0.55, wz, inT));
      place(c.on, sx * lerp(2.5, 1.65, inT), lerp(wz + 0.55, wz + 0.05, inT), 0, wz);
      if (u < 0.72) reachOut(c.on, 0.25 + inT * 0.3, -1.1);
      else stand(c.on);
    });

    // ---- WINGS: two people bring the new part in from the front or the back
    const wing = (crew, range, prop, zFrom, zTo, pieceY, pieces) => {
      if (!range) { crew.forEach((p) => { p.root.visible = false; }); prop.visible = false; return; }
      const v = (t - range[0]) / (range[1] - range[0]);
      const walkIn = span(v, 0, 0.45), fit = span(v, 0.45, 0.9);
      crew.forEach((p, i) => {
        p.root.visible = true;
        const s = i ? -1 : 1;
        place(p, s * 1.15, lerp(zFrom, zTo, walkIn), 0, zTo - 5 * Math.sign(zTo));
        if (walkIn < 1) walk(p, t * 9 + i * 3, 1 - walkIn); else reachOut(p, 0.45, -1.1);
      });
      prop.visible = v < 0.95;
      prop.position.set(0, lerp(0.8, pieceY + lift, fit), lerp(zFrom, zTo, walkIn) + (zTo > 0 ? -0.7 : 0.7) * walkIn - (zTo > 0 ? -0.7 : 0.7) * fit);
      if (v >= 0.9) for (const n of pieces) art.pieces[n].visible = true;
    };
    wing(this.wingF, P.fwing, this.newFront, 6.5, 3.6, R, ['fwing', 'epL', 'epR']);
    wing(this.wingR, P.rwing, this.newRear, -6.0, -3.2, R, ['rwing']);

    // ---- LOLLIPOP: across the car's path until it is time to go
    place(this.lolly, -0.9, 6.2, 0, 0);
    stand(this.lolly);
    const up = span(t, T - 0.35, T - 0.05);
    this.pole.position.set(-0.7, 0, 6.0);
    this.pole.rotation.set(lerp(-1.35, 0.15, up), 0, 0);
    this.lolly.arms[1].rotation.set(lerp(-1.4, -2.9, up), 0, 0);
  }

  /** the car has gone: everyone steps back and waves it off */
  after(dt, since) {
    for (const [k, c] of this.corner.entries()) { stand(c.gun, 0.1); stand(c.off); stand(c.on); this.guns[k].visible = since < 0.3; }
    stand(this.jackF); stand(this.jackR);
    this.jackBars.forEach((b) => { b.visible = false; });
    for (const p of this.props) p.visible = false;
    this.wingF.concat(this.wingR).forEach((p) => { p.root.visible = false; });
    this.lolly.arms[1].rotation.set(-3.0 + Math.sin(since * 8) * 0.2, 0, 0);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

/** the painted box on the lane floor for one car: an outline in its colour and a stop bar */
export function boxMarking(pose, color) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
  const strip = (w, d, x, z) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
    s.position.set(x, 0.02, z);
    g.add(s);
  };
  strip(0.14, 6.6, 1.5, 0); strip(0.14, 6.6, -1.5, 0);
  strip(3.1, 0.14, 0, 3.3); strip(3.1, 0.14, 0, -3.3);
  // where the front wheels go
  strip(0.9, 0.12, 1.0, 1.96); strip(0.9, 0.12, -1.0, 1.96);
  g.position.set(pose.x, pose.y, pose.z);
  g.rotation.y = pose.h;
  return g;
}
