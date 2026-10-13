// Low-poly geometry: a merger that bakes boxes/cylinders/rocks into one vertex-coloured
// mesh (with per-face shade jitter and a cheap bottom-darkening "AO"), gun models with
// visible attachments, and the soldier rig.
import * as THREE from '../vendor/three.module.js';
import { WEAPONS } from './weapons.js';
import { rng } from './util.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export const SHAPES = {};
function shape(key, make) { if (!SHAPES[key]) SHAPES[key] = make(); return SHAPES[key]; }
export function unitShape(t, seg = 8) {
  switch (t) {
    case 'box': return shape('box', () => new THREE.BoxGeometry(1, 1, 1).toNonIndexed());
    case 'cyl': return shape('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1).toNonIndexed());
    case 'cone': return shape('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg, 1).toNonIndexed());
    case 'ico': return shape('ico', () => new THREE.IcosahedronGeometry(1, 0));
    case 'bag': return shape('bag', () => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1); g.rotateZ(Math.PI / 2); g.scale(1, 1, 1); return g.toNonIndexed(); });
    case 'prism': return shape('prism', () => {
      // triangular prism, base on y=0, ridge along z, width 1 (x), height 1
      const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g.toNonIndexed();
    });
  }
  return shape('box', () => new THREE.BoxGeometry(1, 1, 1).toNonIndexed());
}

export class Merger {
  constructor(seed = 1) { this.pos = []; this.nor = []; this.col = []; this.r = rng(seed); }
  // geo: non-indexed unit geometry; matrix: world transform; color: hex or THREE.Color
  add(geo, matrix, color, o = {}) {
    const p = geo.attributes.position.array, n = geo.attributes.normal.array;
    _c.set(color);
    const base = [_c.r, _c.g, _c.b];
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const jit = o.jit ?? 0.05, ao = o.ao ?? 0.18;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    // vertical extent of the unit shape for AO
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < p.length; i += 3) { if (p[i] < minY) minY = p[i]; if (p[i] > maxY) maxY = p[i]; }
    const span = maxY - minY || 1;
    const rj = o.rock ? 1 : 0;
    for (let i = 0; i < p.length; i += 9) {
      const f = 1 + (this.r() - 0.5) * 2 * jit;
      for (let k = 0; k < 3; k++) {
        const j = i + k * 3;
        v.set(p[j], p[j + 1], p[j + 2]);
        if (rj) { const h = Math.sin(p[j] * 12.9 + p[j + 1] * 78.2 + p[j + 2] * 37.7 + (o.seed || 0)) * 43758.5; const q = (h - Math.floor(h) - 0.5) * (o.rockJ || 0.25); v.multiplyScalar(1 + q); }
        const yN = (p[j + 1] - minY) / span;
        v.applyMatrix4(matrix);
        this.pos.push(v.x, v.y, v.z);
        const a = 1 - ao + ao * yN;
        this.col.push(base[0] * f * a, base[1] * f * a, base[2] * f * a);
      }
      if (rj) {
        // recompute face normal after jitter
        const L = this.pos.length;
        const ax = this.pos[L - 9], ay = this.pos[L - 8], az = this.pos[L - 7];
        const bx = this.pos[L - 6], by = this.pos[L - 5], bz = this.pos[L - 4];
        const cx = this.pos[L - 3], cy = this.pos[L - 2], cz = this.pos[L - 1];
        nn.set(bx - ax, by - ay, bz - az).cross(v.set(cx - ax, cy - ay, cz - az)).normalize();
        for (let k = 0; k < 3; k++) this.nor.push(nn.x, nn.y, nn.z);
      } else {
        for (let k = 0; k < 3; k++) { const j = i + k * 3; nn.set(n[j], n[j + 1], n[j + 2]).applyMatrix3(nm).normalize(); this.nor.push(nn.x, nn.y, nn.z); }
      }
    }
  }
  addBox(x, y, z, sx, sy, sz, color, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.add(unitShape('box'), _m, color, o);
  }
  addShape(t, x, y, z, sx, sy, sz, color, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.add(unitShape(t, o.seg || 8), _m, color, o);
  }
  get count() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export const MAT = {
  world: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
};

// --------------------------------------------------------------------------------- guns
const gunCache = new Map();
function partColor(c, w) { return c === 'body' ? w.tint : c === 'wood' ? '#7a5232' : c; }

// returns { geo, magGeo, muzzle:[x,y,z], sightY, scoped }
export function gunGeometry(id, att = []) {
  const key = id + ':' + att.slice().sort().join(',');
  if (gunCache.has(key)) return gunCache.get(key);
  const w = WEAPONS[id];
  const m = new Merger(7), mm = new Merger(9);
  for (const p of w.model) {
    const [x, y, z, sx, sy, sz, c, rx] = p;
    if (w.magPart && x === w.magPart[0] && y === w.magPart[1] && z === w.magPart[2] && att.includes('extmag')) continue; // replaced below
    if (w.magPart && x === w.magPart[0] && y === w.magPart[1] && z === w.magPart[2]) { mm.addBox(x, y, z, sx, sy, sz, partColor(c, w), { rx: rx || 0, jit: 0.03, ao: 0.1 }); continue; }
    if (x === 0 && z > 0 && sx <= 0.03 && sy <= 0.03 && sz <= 0.02 && w.id !== 'pistol') { // rear sight -> two posts (notch)
      m.addBox(-sx * 0.42, y, z, sx * 0.25, sy, sz, partColor(c, w), { jit: 0.02, ao: 0 }); m.addBox(sx * 0.42, y, z, sx * 0.25, sy, sz, partColor(c, w), { jit: 0.02, ao: 0 }); continue;
    }
    m.addBox(x, y, z, sx, sy, sz, partColor(c, w), { rx: rx || 0, jit: 0.04, ao: 0.12 });
  }
  let sightY = w.sightY, muzzle = w.muzzle.slice();
  if (att.includes('extmag') && w.magPart) {
    const [x, y, z, sx, sy, sz] = w.magPart;
    mm.addBox(x, y - sy * 0.28, z, sx * 1.05, sy * 1.55, sz * 1.05, '#2e3034', { jit: 0.03, ao: 0.1 });
    mm.addBox(x, y - sy * 0.98, z, sx * 1.12, 0.02, sz * 1.12, '#c8a030', { ao: 0 });
  }
  const scoped = att.includes('scope') || w.builtInScope;
  if (scoped) {
    const [h, z0] = w.scopeAt || [0.11, -0.08];
    const big = w.builtInScope || w.id === 'dmr';
    const r = big ? 0.026 : 0.021, L = big ? 0.3 : 0.18;
    m.addBox(0, h - 0.035, z0, 0.03, 0.03, 0.12, '#222428');
    m.addShape('cyl', 0, h, z0, r, L, r, '#1d1f22', { rx: Math.PI / 2, seg: 8 });
    m.addShape('cyl', 0, h, z0 - L / 2, r * 1.35, 0.05, r * 1.35, '#1d1f22', { rx: Math.PI / 2, seg: 8 });
    m.addShape('cyl', 0, h, z0 + L / 2, r * 1.2, 0.04, r * 1.2, '#1d1f22', { rx: Math.PI / 2, seg: 8 });
    m.addShape('cyl', 0, h, z0 - L / 2 - 0.026, r * 1.15, 0.004, r * 1.15, '#3a7ac8', { rx: Math.PI / 2, seg: 8, ao: 0 });
    m.addShape('cyl', 0, h, z0 + L / 2 + 0.021, r * 1.0, 0.004, r * 1.0, '#7ac8ff', { rx: Math.PI / 2, seg: 8, ao: 0 });
    sightY = h;
  }
  if (att.includes('grip') && w.gripAt) {
    const [x, y, z] = w.gripAt;
    m.addBox(x, y - 0.06, z, 0.035, 0.1, 0.04, '#1c1d20');
    m.addBox(x, y - 0.012, z, 0.04, 0.02, 0.06, '#2a2c30');
  }
  if (att.includes('suppressor')) {
    const [x, y, z] = w.muzzle;
    m.addShape('cyl', x, y, z - 0.09, 0.024, 0.19, 0.024, '#232528', { rx: Math.PI / 2, seg: 8 });
    m.addShape('cyl', x, y, z - 0.005, 0.026, 0.02, 0.026, '#3a3d42', { rx: Math.PI / 2, seg: 8 });
    muzzle = [x, y, z - 0.19];
  } else if (w.id !== 'knife' && w.id !== 'rocket') {
    const [x, y, z] = w.muzzle;
    m.addBox(x, y, z + 0.015, 0.032, 0.032, 0.035, '#1c1d20');
  }
  const out = { geo: m.build(), magGeo: mm.count ? mm.build() : null, muzzle, sightY, scoped };
  gunCache.set(key, out);
  return out;
}

let flashGeo = null;
function getFlashGeo() {
  if (flashGeo) return flashGeo;
  // a four-point star + a cone, along -z
  const pos = [];
  const star = (r1, r2, n, z) => {
    for (let i = 0; i < n * 2; i++) {
      const a0 = (i / (n * 2)) * Math.PI * 2, a1 = ((i + 1) / (n * 2)) * Math.PI * 2;
      const ra = i % 2 ? r2 : r1, rb = i % 2 ? r1 : r2;
      pos.push(0, 0, z, Math.cos(a0) * ra, Math.sin(a0) * ra, z, Math.cos(a1) * rb, Math.sin(a1) * rb, z);
    }
  };
  star(0.12, 0.035, 4, -0.02);
  // side blades
  pos.push(0, 0, 0, 0, 0.04, -0.22, 0, -0.04, -0.22, 0, 0, 0, 0.04, 0, -0.22, -0.04, 0, -0.22);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flashGeo = g;
  return g;
}

// a gun as a Group: .userData = { muzzle:Object3D, flash:Mesh, mag:Mesh|null, sightY }
export function buildGun(id, att = [], mat = MAT.world) {
  const gg = gunGeometry(id, att);
  const grp = new THREE.Group();
  const body = new THREE.Mesh(gg.geo, mat);
  body.castShadow = true;
  grp.add(body);
  let mag = null;
  if (gg.magGeo) { mag = new THREE.Mesh(gg.magGeo, mat); mag.castShadow = true; grp.add(mag); }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...gg.muzzle);
  grp.add(muzzle);
  const flash = new THREE.Mesh(getFlashGeo(), MAT.flash.clone());
  flash.position.copy(muzzle.position);
  flash.visible = false;
  flash.renderOrder = 10;
  grp.add(flash);
  grp.userData = { id, muzzle, flash, mag, sightY: gg.sightY, scoped: gg.scoped, body };
  return grp;
}

// ------------------------------------------------------------------------------ soldier
export const TEAM_LOOK = [
  { name: 'VANGUARD', uniform: '#6a8fb8', uniform2: '#58789c', vest: '#3e5470', helmet: '#4f6f96', accent: '#3d9bff', boots: '#2e2a26', css: '#4da3ff' },
  { name: 'IRONCLAW', uniform: '#c09564', uniform2: '#a67f55', vest: '#7a5638', helmet: '#8f6a44', accent: '#ff6a2e', boots: '#2e2620', css: '#ff6a3d' },
];
const SKIN = ['#e8bf98', '#c99a72', '#a87452', '#7a5236', '#f0cfae'];
const partCache = new Map();
function cachedPart(key, build) { if (!partCache.has(key)) { const m = new Merger(key.length * 31); build(m); partCache.set(key, m.build()); } return partCache.get(key); }

// builds a rigged soldier; returns { root, parts }
export function buildSoldier(team, role, skinIdx = 0) {
  const L = TEAM_LOOK[team];
  const skin = SKIN[skinIdx % SKIN.length];
  const mat = MAT.world;
  const mk = (geo, parent, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const piv = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Group();
  const body = piv(root, 0, 0, 0); // tilts on death
  const hips = piv(body, 0, 0.92, 0);
  mk(cachedPart('hips' + team, (m) => { m.addBox(0, 0, 0, 0.36, 0.2, 0.22, L.uniform2); m.addBox(0, 0.07, 0, 0.38, 0.06, 0.24, '#2a2622'); m.addBox(0.12, 0.0, -0.12, 0.08, 0.1, 0.04, L.vest); }), hips, 0, 0, 0);
  const torso = piv(hips, 0, 0.1, 0);
  mk(cachedPart('torso' + team + role, (m) => {
    m.addBox(0, 0.26, 0, 0.42, 0.52, 0.24, L.uniform);
    m.addBox(0, 0.24, -0.015, 0.45, 0.4, 0.28, L.vest); // vest
    m.addBox(-0.1, 0.12, -0.16, 0.1, 0.12, 0.05, shade(L.vest, 0.85)); m.addBox(0.1, 0.12, -0.16, 0.1, 0.12, 0.05, shade(L.vest, 0.85)); m.addBox(0, 0.12, -0.16, 0.08, 0.12, 0.05, shade(L.vest, 0.9));
    m.addBox(0, 0.5, 0, 0.2, 0.06, 0.2, L.uniform2);
    // backpack by role
    if (role === 'support') { m.addBox(0, 0.24, 0.2, 0.36, 0.42, 0.18, '#4a4a3a'); m.addBox(0, 0.46, 0.2, 0.3, 0.06, 0.16, '#3a3a2a'); }
    else if (role === 'medic') { m.addBox(0, 0.26, 0.18, 0.32, 0.36, 0.14, '#e8e8e0'); m.addBox(0, 0.28, 0.255, 0.18, 0.05, 0.01, '#3aaa5a', { ao: 0 }); m.addBox(0, 0.28, 0.255, 0.05, 0.18, 0.01, '#3aaa5a', { ao: 0 }); }
    else if (role === 'marksman') { m.addBox(0, 0.3, 0.16, 0.44, 0.5, 0.1, shade(L.uniform, 0.75)); m.addBox(0.14, 0.42, 0.17, 0.12, 0.2, 0.1, '#5a6a3a'); m.addBox(-0.12, 0.2, 0.18, 0.14, 0.16, 0.1, '#4a5a32'); }
    else if (role === 'flanker') { m.addBox(0, 0.32, 0.16, 0.26, 0.24, 0.1, shade(L.vest, 0.8)); }
    else { m.addBox(0, 0.28, 0.17, 0.3, 0.32, 0.12, shade(L.vest, 0.9)); m.addBox(0, 0.1, 0.17, 0.26, 0.1, 0.14, '#4a4232'); }
    // team accent on shoulders
    m.addBox(-0.235, 0.42, 0, 0.03, 0.08, 0.16, L.accent, { ao: 0, jit: 0 }); m.addBox(0.235, 0.42, 0, 0.03, 0.08, 0.16, L.accent, { ao: 0, jit: 0 });
  }), torso, 0, 0, 0);
  const neck = piv(torso, 0, 0.56, 0);
  const head = piv(neck, 0, 0.0, 0);
  mk(cachedPart('head' + team + role + skinIdx, (m) => {
    m.addBox(0, 0.13, 0, 0.21, 0.24, 0.23, skin);
    m.addBox(0, 0.09, -0.118, 0.17, 0.05, 0.01, shade(skin, 0.88), { ao: 0 }); // jaw shadow
    m.addBox(-0.05, 0.16, -0.118, 0.035, 0.03, 0.01, '#1a1a1a', { ao: 0, jit: 0 }); m.addBox(0.05, 0.16, -0.118, 0.035, 0.03, 0.01, '#1a1a1a', { ao: 0, jit: 0 });
    if (role === 'marksman') { m.addBox(0, 0.26, 0.01, 0.26, 0.1, 0.27, shade(L.uniform, 0.8)); m.addBox(0, 0.22, 0.0, 0.36, 0.03, 0.36, shade(L.uniform, 0.75)); }
    else if (role === 'flanker') { m.addBox(0, 0.27, 0.01, 0.24, 0.08, 0.25, L.helmet); m.addBox(0, 0.235, -0.15, 0.2, 0.025, 0.12, L.helmet); m.addBox(0, 0.06, -0.115, 0.215, 0.09, 0.02, '#3a3a3a'); }
    else { m.addBox(0, 0.27, 0.0, 0.27, 0.13, 0.29, L.helmet); m.addBox(0, 0.215, 0.0, 0.3, 0.03, 0.32, shade(L.helmet, 0.85)); m.addBox(0, 0.3, -0.12, 0.16, 0.05, 0.06, '#2a2a2a'); if (role === 'support') m.addBox(0, 0.17, -0.12, 0.2, 0.05, 0.03, '#2a3a4a'); }
  }), head, 0, 0, 0);
  const arm = (side) => {
    const sh = piv(torso, side * 0.27, 0.44, 0);
    mk(cachedPart('uarm' + team, (m) => { m.addBox(0, -0.15, 0, 0.13, 0.32, 0.14, L.uniform); m.addBox(0, -0.04, 0, 0.15, 0.1, 0.16, shade(L.uniform, 0.9)); }), sh, 0, 0, 0);
    const el = piv(sh, 0, -0.3, 0);
    mk(cachedPart('farm' + team + skinIdx, (m) => { m.addBox(0, -0.13, 0, 0.11, 0.26, 0.12, L.uniform2); m.addBox(0, -0.3, 0, 0.1, 0.1, 0.11, '#2b2b28'); }), el, 0, 0, 0);
    return { sh, el };
  };
  const armR = arm(-1), armL = arm(1);
  const leg = (side) => {
    const hp = piv(hips, side * 0.1, -0.05, 0);
    mk(cachedPart('thigh' + team, (m) => { m.addBox(0, -0.21, 0, 0.16, 0.43, 0.18, L.uniform2); m.addBox(side * 0.0, -0.25, -0.1, 0.1, 0.12, 0.03, shade(L.uniform2, 0.85)); }), hp, 0, 0, 0);
    const kn = piv(hp, 0, -0.42, 0);
    mk(cachedPart('shin' + team, (m) => { m.addBox(0, -0.2, 0, 0.14, 0.4, 0.16, L.uniform2); m.addBox(0, -0.02, -0.08, 0.13, 0.1, 0.03, shade(L.uniform2, 0.8)); m.addBox(0, -0.42, -0.04, 0.15, 0.12, 0.26, L.boots); }), kn, 0, 0, 0);
    return { hp, kn };
  };
  const legR = leg(-1), legL = leg(1);
  // gun mount on the torso (right side, chest height)
  const gunMount = piv(torso, -0.1, 0.34, -0.2);
  return { root, body, hips, torso, neck, head, armR, armL, legR, legL, gunMount };
}

export function shade(hex, k) {
  _c.set(hex);
  const r = Math.min(1, _c.r * k), g = Math.min(1, _c.g * k), b = Math.min(1, _c.b * k);
  _c.setRGB(r, g, b);
  return '#' + _c.getHexString();
}
