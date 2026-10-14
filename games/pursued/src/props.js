// Things you can knock over: bins, wheelie bins, trolleys, pallets, chairs, shelving units,
// laundry carts, barriers, boxes. Each one is a small rigid box: gravity, eight corner contacts
// against whatever floor is under it (impulse + Coulomb friction), push-out from walls, sleep.
// That is enough for things to tip, topple, tumble and slide believably, and a fallen shelf
// lying across a corridor is a real obstacle the monster trips over.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOW } from './collide.js';
import * as TX from './textures.js';

const G = 9.81;
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3();
const _m3 = new THREE.Matrix3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const CORNERS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push(new THREE.Vector3(x, y, z));

// ---------------- meshes ----------------
function std(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o }); }
function boxGeo(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return g.translate(x, y, z);
}
function rod(a, b, r = 0.012) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function group(parts) {   // parts: [[geometries[], material]] -> Group centred at origin
  const g = new THREE.Group();
  for (const [geos, mat] of parts) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos.map(x => x.index ? x.toNonIndexed() : x)) : geos[0], mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function makeTypes(P) {
  const T = {};
  const plasticG = std(0x1d3a24, { roughness: 0.35 }), plasticB = std(0x111214, { roughness: 0.32 });
  const steel = std(0x9aa0a6, { metalness: 0.85, roughness: 0.32 });
  const darkSteel = std(0x2c2f33, { metalness: 0.7, roughness: 0.45 });
  const wood = TX.woodPlanks();
  const woodM = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.8, color: 0xb08a66 });
  const orange = std(0xd2561c, { roughness: 0.45 }), white = std(0xe8e4dc, { roughness: 0.45 });
  const canvas = std(0x6e6a5c, { roughness: 0.9 });
  const prodCols = [0xb3261e, 0x1f5fa8, 0xd9a21b, 0xd8d0bf, 0x2c7a52, 0x6b2b1a];

  // GLB-based: metal trash can, cardboard box
  const fromGLB = (root, filter, wantH) => {
    root.updateMatrixWorld(true);
    const geos = new Map();
    const bb = new THREE.Box3();
    root.traverse(o => { if (o.isMesh && filter(o.name || '')) bb.expandByObject(o); });
    const ctr = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
    const s = wantH ? wantH / size.y : 1;
    const g = new THREE.Group();
    root.traverse(o => {
      if (!o.isMesh || !filter(o.name || '')) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).translate(-ctr.x, -ctr.y, -ctr.z).scale(s, s, s);
      const mat = o.material.clone(); if (mat.roughness !== undefined) mat.roughness *= 0.6;
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
    return { mesh: () => g.clone(), he: [size.x * s / 2, size.y * s / 2, size.z * s / 2] };
  };
  if (P.metal_trash_can) {
    const c = fromGLB(P.metal_trash_can.scene, n => /^metal_trash_can(_handle_left|_handle_right)?$/.test(n), 0.78);
    T.can = { ...c, mass: 7, mu: 0.5, sound: 'metal' };
  }
  if (P.cardboard_box_01) { const c = fromGLB(P.cardboard_box_01.scene, () => true, 0.42); T.box = { ...c, mass: 2, mu: 0.6, sound: 'card' }; }

  // wheelie bin
  {
    const body = [boxGeo(0.56, 0.92, 0.66, 0, -0.05, 0)];
    body[0].attributes.position.array.forEach((v, i, a) => { if (i % 3 === 1 && v < 0) { a[i - 1] *= 0.86; a[i + 1] *= 0.88; } });
    const lid = [boxGeo(0.62, 0.05, 0.74, 0, 0.44, 0.02), boxGeo(0.6, 0.06, 0.06, 0, 0.42, -0.36)];
    const wheels = [new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateZ(Math.PI / 2).translate(0.27, -0.43, -0.3), new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateZ(Math.PI / 2).translate(-0.27, -0.43, -0.3)];
    T.bin = { mesh: () => group([[body, plasticG], [lid, plasticG], [wheels, plasticB]]), he: [0.3, 0.53, 0.37], mass: 11, mu: 0.45, sound: 'plastic' };
  }
  // shopping trolley (wire basket)
  {
    const w = [], L = 0.9, Wd = 0.55, H = 0.42, y0 = 0.05;
    for (let i = 0; i <= 8; i++) { const x = -L / 2 + L * i / 8; w.push(rod(V(x, y0, -Wd / 2), V(x, y0 + H, -Wd / 2)), rod(V(x, y0, Wd / 2), V(x, y0 + H, Wd / 2))); }
    for (let k = 0; k <= 4; k++) { const y = y0 + H * k / 4; w.push(rod(V(-L / 2, y, -Wd / 2), V(L / 2, y, -Wd / 2)), rod(V(-L / 2, y, Wd / 2), V(L / 2, y, Wd / 2)), rod(V(-L / 2, y, -Wd / 2), V(-L / 2, y, Wd / 2)), rod(V(L / 2, y, -Wd / 2), V(L / 2, y, Wd / 2))); }
    for (let i = 0; i <= 5; i++) { const z = -Wd / 2 + Wd * i / 5; w.push(rod(V(-L / 2, y0, z), V(L / 2, y0, z))); }
    const frame = [rod(V(-L / 2, y0, -Wd / 2), V(-L / 2 + 0.05, -0.38, -Wd / 2 + 0.05), 0.016), rod(V(-L / 2, y0, Wd / 2), V(-L / 2 + 0.05, -0.38, Wd / 2 - 0.05), 0.016), rod(V(L / 2, y0, -Wd / 2), V(L / 2 - 0.05, -0.38, -Wd / 2 + 0.05), 0.016), rod(V(L / 2, y0, Wd / 2), V(L / 2 - 0.05, -0.38, Wd / 2 - 0.05), 0.016),
      rod(V(L / 2 + 0.12, y0 + H + 0.08, -Wd / 2), V(L / 2 + 0.12, y0 + H + 0.08, Wd / 2), 0.02)];
    const handle = [rod(V(L / 2 + 0.12, y0 + H + 0.08, -Wd / 2), V(L / 2 + 0.12, y0 + H + 0.08, Wd / 2), 0.025)];
    const wheels = [[-L / 2 + 0.05, -Wd / 2 + 0.05], [-L / 2 + 0.05, Wd / 2 - 0.05], [L / 2 - 0.05, -Wd / 2 + 0.05], [L / 2 - 0.05, Wd / 2 - 0.05]].map(([x, z]) => new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10).rotateX(Math.PI / 2).translate(x, -0.43, z));
    T.trolley = { mesh: () => group([[w.concat(frame), steel], [handle, std(0xb3261e)], [wheels, plasticB]]), he: [0.5, 0.48, 0.3], mass: 13, mu: 0.12, sound: 'metal' };
  }
  // wooden pallet stood on edge
  {
    const g = [];
    for (let i = 0; i < 7; i++) g.push(boxGeo(0.11, 1.0, 0.022, -0.55 + i * 0.183, 0, 0.06));
    for (let i = 0; i < 3; i++) g.push(boxGeo(0.11, 1.0, 0.022, -0.5 + i * 0.5, 0, -0.06));
    for (const y of [-0.42, 0, 0.42]) g.push(boxGeo(1.2, 0.09, 0.1, 0, y, 0));
    T.pallet = { mesh: () => group([[g, woodM]]), he: [0.6, 0.5, 0.075], mass: 14, mu: 0.7, sound: 'wood' };
  }
  // metal shelving unit with stock on it
  {
    const posts = [], shelves = [], stock = [[], [], [], [], [], []];
    const Wd = 0.9, H = 1.85, Dp = 0.4;
    for (const x of [-Wd / 2 + 0.02, Wd / 2 - 0.02]) for (const z of [-Dp / 2 + 0.02, Dp / 2 - 0.02]) posts.push(boxGeo(0.035, H, 0.035, x, 0, z));
    for (let k = 0; k < 5; k++) {
      const y = -H / 2 + 0.08 + k * 0.43;
      shelves.push(boxGeo(Wd, 0.025, Dp, 0, y, 0));
      if (k < 4) for (let x = -Wd / 2 + 0.06; x < Wd / 2 - 0.1;) {
        const w = 0.08 + Math.random() * 0.14, h = 0.12 + Math.random() * 0.22;
        if (Math.random() < 0.8) stock[Math.floor(Math.random() * 6)].push(boxGeo(w, h, 0.18 + Math.random() * 0.15, x + w / 2, y + h / 2 + 0.015, (Math.random() - 0.5) * 0.05));
        x += w + 0.02;
      }
    }
    T.shelf = { mesh: () => group([[posts.concat(shelves), darkSteel], ...stock.map((s, i) => [s, std(prodCols[i], { roughness: 0.6 })])]), he: [Wd / 2, H / 2, Dp / 2], mass: 24, mu: 0.6, sound: 'metalBig' };
  }
  // chair
  {
    const legs = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => boxGeo(0.035, 0.45, 0.035, x, -0.225, z));
    const seat = [boxGeo(0.46, 0.04, 0.44, 0, 0.0, 0)];
    const back = [boxGeo(0.035, 0.45, 0.035, -0.2, 0.24, 0.2), boxGeo(0.035, 0.45, 0.035, 0.2, 0.24, 0.2), boxGeo(0.44, 0.16, 0.025, 0, 0.38, 0.2)];
    const g = group([[legs.concat(back), darkSteel], [seat, woodM]]);
    g.children.forEach(m => m.position.y = 0.0);
    T.chair = { mesh: () => { const c = g.clone(); c.children.forEach(m => m.position.y = 0.0); return c; }, he: [0.24, 0.45, 0.24], mass: 4, mu: 0.6, sound: 'wood', meshOffset: 0.0 };
    // the chair geometry spans y -0.45..0.47 already
  }
  // laundry cart
  {
    const fr = [], L = 0.8, Wd = 0.5, H = 0.6;
    for (const [x, z] of [[-L / 2, -Wd / 2], [L / 2, -Wd / 2], [-L / 2, Wd / 2], [L / 2, Wd / 2]]) fr.push(rod(V(x, -0.38, z), V(x, 0.42, z), 0.014));
    for (const y of [0.42, -0.2]) { fr.push(rod(V(-L / 2, y, -Wd / 2), V(L / 2, y, -Wd / 2), 0.014), rod(V(-L / 2, y, Wd / 2), V(L / 2, y, Wd / 2), 0.014), rod(V(-L / 2, y, -Wd / 2), V(-L / 2, y, Wd / 2), 0.014), rod(V(L / 2, y, -Wd / 2), V(L / 2, y, Wd / 2), 0.014)); }
    const bag = [boxGeo(L - 0.04, 0.55, Wd - 0.04, 0, 0.12, 0)];
    const wheels = [[-L / 2, -Wd / 2], [L / 2, -Wd / 2], [-L / 2, Wd / 2], [L / 2, Wd / 2]].map(([x, z]) => new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10).rotateX(Math.PI / 2).translate(x, -0.41, z));
    T.cart = { mesh: () => group([[fr, steel], [bag, canvas], [wheels, plasticB]]), he: [0.42, 0.46, 0.27], mass: 11, mu: 0.15, sound: 'metal' };
  }
  // sawhorse barrier
  {
    const board = [boxGeo(1.2, 0.2, 0.04, 0, 0.36, 0)];
    const stripes = [];
    for (let i = 0; i < 4; i++) stripes.push(boxGeo(0.12, 0.205, 0.045, -0.45 + i * 0.3, 0.36, 0, 0, 0, 0.6));
    const legs = [boxGeo(0.06, 0.95, 0.05, -0.5, -0.05, 0.12, -0.3), boxGeo(0.06, 0.95, 0.05, -0.5, -0.05, -0.12, 0.3), boxGeo(0.06, 0.95, 0.05, 0.5, -0.05, 0.12, -0.3), boxGeo(0.06, 0.95, 0.05, 0.5, -0.05, -0.12, 0.3)];
    T.cone = { mesh: () => group([[board, orange], [stripes, white], [legs, std(0x3a3a38)]]), he: [0.62, 0.5, 0.3], mass: 7, mu: 0.6, sound: 'wood' };
  }
  // door slab (spawned when the monster smashes a door off its hinges)
  T.door = { mesh: () => new THREE.Group(), he: [0.59, 1.12, 0.03], mass: 18, mu: 0.6, sound: 'wood' };
  return T;
}

// ---------------- the simulation ----------------
export class Props {
  constructor(scene, statics, P) {
    this.scene = scene; this.S = statics; this.list = []; this.T = makeTypes(P);
    this.events = [];    // {type:'hit', p, speed, sound} for audio / AI noise
  }
  spawn(type, x, y, z, rot, opts = {}) {
    const T = this.T[type]; if (!T) return null;
    const mesh = opts.mesh || T.mesh();
    this.scene.add(mesh);
    const he = new THREE.Vector3(...T.he);
    const m = T.mass, invM = 1 / m;
    const I = new THREE.Vector3((m / 3) * (he.y * he.y + he.z * he.z), (m / 3) * (he.x * he.x + he.z * he.z), (m / 3) * (he.x * he.x + he.y * he.y));
    const p = {
      type, T, mesh, he, invM, invI: new THREE.Vector3(1 / I.x, 1 / I.y, 1 / I.z), mu: T.mu,
      pos: new THREE.Vector3(x, (y ?? this.S.groundAt(x, z, 2)) + he.y + 0.01, z), q: new THREE.Quaternion().setFromAxisAngle(_up, rot || 0),
      vel: new THREE.Vector3(), w: new THREE.Vector3(), asleep: true, still: 0, home: null, lastHit: -9, tripT: -9, sound: T.sound, id: this.list.length,
    };
    if (opts.vel) { p.vel.copy(opts.vel); p.asleep = false; }
    if (opts.q) p.q.copy(opts.q);
    if (opts.w) { p.w.copy(opts.w); p.asleep = false; }
    if (!opts.mesh) p.init = { pos: p.pos.clone(), q: p.q.clone() };
    this.sync(p);
    this.list.push(p);
    return p;
  }
  sync(p) { p.mesh.position.copy(p.pos); p.mesh.quaternion.copy(p.q); }
  // put every prop back where the level placed it; smashed-off doors are removed
  resetAll() {
    this.list = this.list.filter(p => {
      if (!p.init) { this.scene.remove(p.mesh); return false; }
      p.pos.copy(p.init.pos); p.q.copy(p.init.q); p.vel.set(0, 0, 0); p.w.set(0, 0, 0); p.asleep = true; p.still = 0; p.tripT = -9; p.lastHit = -9;
      this.sync(p); return true;
    });
    this.list.forEach((p, i) => p.id = i);
    this.events.length = 0;
  }
  // how upright is it (1 = standing as placed)
  upright(p) { return _v.set(0, 1, 0).applyQuaternion(p.q).y; }
  // horizontal footprint half extents in world (approx)
  footprint(p) {
    const ax = _v.set(p.he.x, 0, 0).applyQuaternion(p.q), ay = _r.set(0, p.he.y, 0).applyQuaternion(p.q), az = _n.set(0, 0, p.he.z).applyQuaternion(p.q);
    return { ex: Math.abs(ax.x) + Math.abs(ay.x) + Math.abs(az.x), ey: Math.abs(ax.y) + Math.abs(ay.y) + Math.abs(az.y), ez: Math.abs(ax.z) + Math.abs(ay.z) + Math.abs(az.z) };
  }
  // apply impulse J (world) at world point pt
  impulse(p, J, pt) {
    p.asleep = false; p.still = 0;
    p.vel.addScaledVector(J, p.invM);
    _r.subVectors(pt, p.pos);
    const tq = _t.crossVectors(_r, J);
    this._applyInvI(p, tq, _c);
    p.w.add(_c);
  }
  _applyInvI(p, v, out) {   // out = R * invI * R^T * v
    _q.copy(p.q).invert();
    out.copy(v).applyQuaternion(_q);
    out.set(out.x * p.invI.x, out.y * p.invI.y, out.z * p.invI.z).applyQuaternion(p.q);
    return out;
  }
  update(dt, t) {
    const sub = 3, h = dt / sub;
    for (const p of this.list) {
      if (p.asleep) continue;
      for (let s = 0; s < sub; s++) this.step(p, h, t);
      // sleep
      if (p.vel.lengthSq() < 0.02 && p.w.lengthSq() < 0.05) { p.still += dt; if (p.still > 0.4) { p.asleep = true; p.vel.set(0, 0, 0); p.w.set(0, 0, 0); } }
      else p.still = 0;
      this.sync(p);
      if (p.pos.y < -5) { p.pos.y = 1; p.vel.set(0, 0, 0); }
    }
  }
  step(p, h, t) {
    p.vel.y -= G * h;
    p.pos.addScaledVector(p.vel, h);
    // integrate rotation
    const w = p.w, wl = w.length();
    if (wl > 1e-6) { _q.setFromAxisAngle(_v.copy(w).divideScalar(wl), wl * h); p.q.premultiply(_q).normalize(); }
    // corner contacts against the floor under each corner
    let maxPen = 0;
    const fp = this.footprint(p);
    const floorY = this.S.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.2, Math.min(fp.ex, fp.ez) * 0.6);
    for (let it = 0; it < 2; it++) for (const c of CORNERS) {
      _r.set(c.x * p.he.x, c.y * p.he.y, c.z * p.he.z).applyQuaternion(p.q);
      const wy = p.pos.y + _r.y;
      const pen = floorY - wy;
      if (pen <= 0) continue;
      if (pen > maxPen) maxPen = pen;
      // relative velocity at the contact
      const vc = _v.crossVectors(p.w, _r).add(p.vel);
      const vn = vc.y;
      if (vn >= 0) continue;
      _n.set(0, 1, 0);
      const rn = _t.crossVectors(_r, _n);
      this._applyInvI(p, rn, _c);
      const k = p.invM + _c.cross(_r).dot(_n);
      const e = vn < -2.5 ? 0.25 : 0.05;
      const jn = -(1 + e) * vn / k / 4;
      // friction
      const vt = _c.set(vc.x, 0, vc.z);
      const vtl = vt.length();
      const J = new THREE.Vector3(0, jn, 0);
      if (vtl > 1e-4) {
        const jt = Math.min(p.mu * jn, vtl / (p.invM * 4 + 1e-6));
        J.x = -vc.x / vtl * jt; J.z = -vc.z / vtl * jt;
      }
      this.impulse(p, J, _t.copy(p.pos).add(_r));
      if (vn < -1.6 && t - p.lastHit > 0.15) { p.lastHit = t; this.events.push({ type: 'hit', p, speed: -vn, sound: p.sound, pos: p.pos.clone() }); }
    }
    if (maxPen > 0) p.pos.y += maxPen * 0.8;
    // walls
    const rr = Math.max(0.12, Math.min(fp.ex, fp.ez) * 0.9);
    const before = _c.copy(p.pos);
    const bx = before.x, bz = before.z;
    const out = this._out || (this._out = {});
    this.S.resolveCircle(p.pos, rr, p.pos.y - fp.ey * 0.6, p.pos.y + fp.ey * 0.9, out, b => b.k === LOW);
    if (out.hits) {
      const nx = p.pos.x - bx, nz = p.pos.z - bz, nl = Math.hypot(nx, nz);
      if (nl > 1e-5) { const vn = (p.vel.x * nx + p.vel.z * nz) / nl; if (vn < 0) { p.vel.x -= 1.4 * vn * nx / nl; p.vel.z -= 1.4 * vn * nz / nl; } }
    }
    // air drag
    p.w.multiplyScalar(1 - 0.6 * h);
  }
  // props near a point (for player / monster contact)
  near(x, z, r, fn) {
    for (const p of this.list) { const dx = p.pos.x - x, dz = p.pos.z - z; if (dx * dx + dz * dz < (r + 1.2) * (r + 1.2)) fn(p, Math.hypot(dx, dz)); }
  }
  // simple prop-prop separation so piles do not interpenetrate forever
  separate() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.asleep) continue;
      for (let j = 0; j < L.length; j++) {
        if (i === j) continue; const b = L[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
        const ra = Math.min(a.he.x, a.he.z) + 0.05, rb = Math.min(b.he.x, b.he.z) + 0.05;
        if (d2 > (ra + rb) * (ra + rb) || Math.abs(a.pos.y - b.pos.y) > 1) continue;
        const d = Math.sqrt(d2) || 0.01, pen = ra + rb - d;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * pen * 0.5; a.pos.z -= nz * pen * 0.5;
        if (!b.asleep || a.vel.length() > 1) { b.pos.x += nx * pen * 0.5; b.pos.z += nz * pen * 0.5; b.asleep = false; b.vel.x += nx * 0.5 * Math.max(0, a.vel.x * nx + a.vel.z * nz); b.vel.z += nz * 0.5 * Math.max(0, a.vel.x * nx + a.vel.z * nz); }
      }
    }
  }
}
