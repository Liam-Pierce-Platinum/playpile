// CHAPTER: TORONTO (open world). Downtown Toronto, the Financial District around King St W and Bay St, from real
// OpenStreetMap footprints and heights (assets/levels/toronto/city.js, baked by bake.mjs; the street grid is rotated
// onto the axes: +x runs east along King, +z runs south toward the lake). Free roam on the streets and rooftops.
// Rourke has three crews downtown: a WAREHOUSE off Front St, a PARKING GARAGE on Yonge, and the top OFFICE FLOOR of a
// York St block. Each has a skylight and a window way in (E cuts the glass quietly, C / a hard landing smashes it) or
// a front door for going loud. Clearing a crew gives intel; the third piece reveals ROURKE TOWER (the tallest tower on
// King St W). Reach its foot and the chapter ends (next: 'tower'). M opens the map; a marker shows the current target.
// Direct URL: ?level=toronto&play=1. Offline test: node assets/levels/toronto/pathtest.mjs
import * as THREE from 'three';
import CITY from '../../assets/levels/toronto/city.js';
import { removeBox, groundBelow } from '../world.js';
import { sfx } from '../audio.js';
import { buildLife, updateLife } from './toronto_life.js';
import { skyDome } from './escape_kit.js';

const PLAY = [-245, -270, 228, 315]; // [minX, minZ, maxX, maxZ] free-roam area (collision inside, skyline outside)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hasDoc = typeof document !== 'undefined' && document.body;

// the three crews. site = ground cleared of OSM buildings for the base; door = the waypoint / respawn at the front
const BASES = {
  wh: { n: 1, name: 'WAREHOUSE', street: 'Front St', site: [-206, 262, -150, 306], door: [-180, 268, Math.PI], centre: [-180, 286] },
  pg: { n: 2, name: 'PARKING GARAGE', street: 'Yonge St', site: [160, -262, 218, -220], door: [216, -247, -Math.PI / 2], centre: [189, -242] },
  of: { n: 3, name: 'OFFICE FLOOR', street: 'York St', site: [-238, -116, -190, -78], door: [-236, -97, Math.PI / 2], centre: [-214, -97] },
};
const IDS = ['wh', 'pg', 'of'];
const TOWER = { box: [-104, -52, -46, -4], foot: [-75, 3], name: 'THE TOWER' }; // First Canadian Place's footprint

// ---------- geometry helpers ----------
// a growable quad soup (one merged mesh per material: the whole city is a handful of draw calls)
class Quads {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  quad(a, b, c, d, n, uv, col) {
    const k = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let q = 0; q < 4; q++) { this.n.push(n[0], n[1], n[2]); if (col) this.c.push(col, col, col); }
    if (uv) this.u.push(...uv); else this.u.push(0, 0, 1, 0, 1, 1, 0, 1);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  // an axis-aligned box from y0 to y1; sides UV'd in world metres / (su, sv), top UV'd by x, z / st
  box(x0, z0, x1, z1, y0, y1, o = {}) {
    const su = o.su || 12, sv = o.sv || 14.8, st = o.st || 8, col = o.col, U = (a, b) => [a / su, y0 / sv, b / su, y0 / sv, b / su, y1 / sv, a / su, y1 / sv];
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], U(z1, z0), col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], U(z0, z1), col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], U(x0, x1), col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], U(x1, x0), col);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0 / st, z0 / st, x1 / st, z0 / st, x1 / st, z1 / st, x0 / st, z1 / st], col);
    if (o.top !== false) (o.topTo || this).quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 / st, z1 / st, x1 / st, z1 / st, x1 / st, z0 / st, x0 / st, z0 / st], o.topTo ? null : col);
  }
  // a flat strip on the ground from a to b, width w, at height y
  strip(a, b, w, y) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, px = -dz / l * w / 2, pz = dx / l * w / 2;
    this.quad([a[0] + px, y, a[1] + pz], [b[0] + px, y, b[1] + pz], [b[0] - px, y, b[1] - pz], [a[0] - px, y, a[1] - pz], [0, 1, 0]); // CCW from above
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}
// rectangle minus rectangles (both [x0, z0, x1, z1]) -> rectangles
function subtract(r, h) {
  if (h[0] >= r[2] || h[2] <= r[0] || h[1] >= r[3] || h[3] <= r[1]) return [r];
  const out = [], [x0, z0, x1, z1] = r, cx0 = Math.max(x0, h[0]), cx1 = Math.min(x1, h[2]);
  if (h[0] > x0) out.push([x0, z0, h[0], z1]);
  if (h[2] < x1) out.push([h[2], z0, x1, z1]);
  if (h[1] > z0) out.push([cx0, z0, cx1, h[1]]);
  if (h[3] < z1) out.push([cx0, h[3], cx1, z1]);
  return out;
}
function rectMinus(r, holes) { let rs = [r]; for (const h of holes) rs = rs.flatMap(q => subtract(q, h)); return rs.filter(q => q[2] - q[0] > 0.05 && q[3] - q[1] > 0.05); }

// grey canvas textures, made once
const TEX = {};
function facadeTex() {
  if (TEX.facade || !hasDoc) return TEX.facade || null;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  let s = 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#8a8682'; g.fillRect(0, 0, 256, 256);
  for (let f = 0; f < 4; f++) for (let b = 0; b < 3; b++) { // 4 floors x 3 bays per tile (12 m x 14.8 m)
    const v = 48 + r() * 40, lit = r() < 0.14; g.fillStyle = lit ? `rgb(${170 + r() * 50 | 0},${130 + r() * 40 | 0},${80 + r() * 30 | 0})` : `rgb(${v * 0.8 | 0},${v * 0.9 | 0},${v | 0})`;
    g.fillRect(b * 85.3 + 7, f * 64 + 12, 71, 42);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(b * 85.3 + 7, f * 64 + 12, 71, 6);
    g.fillStyle = 'rgba(40,40,40,0.8)'; g.fillRect(b * 85.3 + 42, f * 64 + 12, 2, 42);
  }
  g.fillStyle = 'rgba(60,60,60,0.5)'; for (let f = 0; f < 4; f++) g.fillRect(0, f * 64 + 58, 256, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (TEX.facade = t);
}
const MATS = {};
function mats(L) {
  if (MATS.facade) return MATS;
  const map = facadeTex();
  MATS.facade = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.82, metalness: 0.05 });
  MATS.facadeKit = new THREE.MeshStandardMaterial({ map, color: 0xb0b0b0, roughness: 0.82 });
  MATS.road = new THREE.MeshStandardMaterial({ color: 0x3e3e3e, roughness: 0.96, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  MATS.line = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  MATS.lake = new THREE.MeshStandardMaterial({ color: 0x6c6c6c, roughness: 0.18, metalness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  MATS.far = new THREE.MeshStandardMaterial({ map, color: 0x9c9c9c, roughness: 0.9 });
  MATS.beam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
  return MATS;
}

// level frame from lat/lon (same projection and rotation as the bake)
function ll(lat, lon) {
  const O = CITY.origin, KX = 111320 * Math.cos(O.lat * Math.PI / 180), KZ = 110574, x = (lon - O.lon) * KX, z = -(lat - O.lat) * KZ, c = Math.cos(-CITY.rot), s = Math.sin(-CITY.rot);
  return [x * c - z * s, x * s + z * c];
}

export default {
  id: 'toronto',
  title: 'KING & BAY',
  flags: { gunsKill: false },
  // overcast afternoon over the lake: everything grey, the far towers fade into haze
  env: { bg: 0x4a3552, fog: [90, 1300, 0x5a4058], hemi: 0.95, sun: 0.9, exposure: 1.1 }, // dusk: violet sky, orange city glow, neon
  bounds: [PLAY[0] + 2, PLAY[1] + 2, PLAY[2] - 2, PLAY[3] - 2],

  build(L) {
    const G = L.G, M = mats(L);
    const st = this.st = { cleared: {}, taken: {}, intel: 0, revealed: false, entries: [], intelAt: {}, pin: null, ui: null, said: {}, last: null };
    this.L = L; this.setupView(G); this.kq = new Map();

    // ---- ground, lake, bounds ----
    L.floor(0, 0, 4000, 4000, { mat: 'concreteLight', y: 0 });
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(8000, 4000), M.lake); lake.rotation.x = -Math.PI / 2; lake.position.set(0, 0.06, CITY.lakeZ - 90 + 2000); L.deco(lake).receiveShadow = false;
    const [bx0, bz0, bx1, bz1] = PLAY, BH = 420, inv = { visible: false, flags: { noClimb: true } };
    L.box((bx0 + bx1) / 2, 0, bz0 - 1, bx1 - bx0 + 4, BH, 2, inv); L.box((bx0 + bx1) / 2, 0, bz1 + 1, bx1 - bx0 + 4, BH, 2, inv);
    L.box(bx0 - 1, 0, (bz0 + bz1) / 2, 2, BH, bz1 - bz0 + 4, inv); L.box(bx1 + 1, 0, (bz0 + bz1) / 2, 2, BH, bz1 - bz0 + 4, inv);

    // ---- the real city: OSM boxes minus the three base sites; colliders inside the play area, one merged mesh ----
    const sites = IDS.map(k => BASES[k].site);
    const city = [];
    for (const b of CITY.boxes) for (const r of rectMinus([b[0], b[1], b[2], b[3]], sites)) city.push([...r, b[4]]);
    this.city = city;
    const walls = new Quads(), roofs = new Quads();
    const tint = h => 0.74 + (((h * 7919) % 97) / 97) * 0.3;
    const enter = [], tb0 = TOWER.box; // ordinary buildings you can walk into (toronto_life.js); the rest stay solid
    for (const [x0, z0, x1, z1, h] of city) {
      const inPlay = x1 > PLAY[0] && x0 < PLAY[2] && z1 > PLAY[1] && z0 < PLAY[3];
      const ok = inPlay && x0 > PLAY[0] + 6 && x1 < PLAY[2] - 6 && z0 > PLAY[1] + 6 && z1 < PLAY[3] - 6 && Math.min(x1 - x0, z1 - z0) >= 8 && (x1 - x0) * (z1 - z0) >= 100 && h >= 6 && enter.length < 120
        && !(x1 > tb0[0] && x0 < tb0[2] && z1 > tb0[1] && z0 < tb0[3]);
      if (ok) { enter.push([x0, z0, x1, z1, h]); continue; }
      walls.box(x0, z0, x1, z1, 0, h, { col: tint(h), topTo: roofs, st: 6 });
      if (inPlay) L.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, { visible: false });
    }
    this.enter = enter;
    // rooftop clutter on the low and mid roofs (visual: plant rooms, vents)
    for (const [x0, z0, x1, z1, h] of city) {
      if ((x1 - x0) * (z1 - z0) < 300 || h > 120) continue;
      const k = (x0 * 13 + z0 * 7) | 0, w = Math.min(6, (x1 - x0) * 0.3), d = Math.min(5, (z1 - z0) * 0.3);
      walls.box(x0 + 2 + (Math.abs(k) % 5), z0 + 2 + (Math.abs(k >> 2) % 4), x0 + 2 + (Math.abs(k) % 5) + w, z0 + 2 + (Math.abs(k >> 2) % 4) + d, h, h + 2.4, { col: 0.6, topTo: roofs });
    }
    // the skyline past the edge: a seeded ring of towers fading into the haze, no collision
    const far = new Quads(); let sd = 11; const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    for (let gx = -1500; gx < 1500; gx += 46) for (let gz = -1500; gz < CITY.lakeZ - 150; gz += 46) {
      if (gx > -345 && gx < 345 && gz > -345 && gz < 345) continue;
      const d = Math.hypot(gx, gz); if (d > 1500 || rnd() < 0.25) continue;
      const core = Math.max(0, 1 - d / 1100), h = 8 + rnd() * 30 + (rnd() < core * 0.5 ? rnd() * 190 * core : 0);
      const w = 14 + rnd() * 22, dd = 14 + rnd() * 22;
      if (Math.hypot(gx - CITY.cnTower[0], gz - CITY.cnTower[1]) < 70) continue;
      far.box(gx, gz, gx + w, gz + dd, 0, h, { st: 8 });
    }
    // CN-tower-like spire (silhouette only) and a domed stadium beside it
    const [cx, cz] = CITY.cnTower, spire = new THREE.Group();
    const seg = (r0, r1, y0, y1, n = 6) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, n), L.mat('concreteLight')); m.position.y = (y0 + y1) / 2; spire.add(m); };
    seg(14, 7, 0, 60, 3); seg(7, 4.5, 60, 335); seg(14, 19, 330, 342, 12); seg(19, 16, 342, 356, 12); seg(5, 5, 356, 446); seg(7.5, 7.5, 446, 454, 10); seg(2.2, 0.5, 454, 553, 6);
    spire.position.set(cx, 0, cz); L.deco(spire);
    const [dx, dz] = ll(43.6414, -79.3894), dome = new THREE.Mesh(new THREE.SphereGeometry(110, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), L.mat('concrete'));
    dome.scale.y = 0.55; dome.position.set(dx, 6, dz); L.deco(dome);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(118, 118, 8, 16, 1, true), L.mat('concreteDark')); ring.position.set(dx, 4, dz); L.deco(ring);

    // ---- streets: asphalt, lane dashes, streetlights (one merged mesh each) ----
    const road = new Quads(), line = new Quads(), poles = new Quads(), heads = new Quads();
    const solidAt = (x, z) => city.some(b => x > b[0] - 0.6 && x < b[2] + 0.6 && z > b[1] - 0.6 && z < b[3] + 0.6);
    for (const r of CITY.roads) {
      for (let i = 1; i < r.p.length; i++) {
        const a = r.p[i - 1], b = r.p[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.01) continue;
        road.strip(a, b, r.w, 0.02);
        if (r.w < 12) continue;
        const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
        for (let t = 2; t < l - 2; t += 7) line.strip([a[0] + ux * t, a[1] + uz * t], [a[0] + ux * (t + 3), a[1] + uz * (t + 3)], 0.16, 0.03);
        for (let t = 6; t < l; t += 32) for (const sgn of [-1, 1]) {
          const px = a[0] + ux * t - uz * sgn * (r.w / 2 + 0.9), pz = a[1] + uz * t + ux * sgn * (r.w / 2 + 0.9);
          if (px < PLAY[0] - 60 || px > PLAY[2] + 60 || pz < PLAY[1] - 60 || pz > PLAY[3] + 60 || solidAt(px, pz)) continue;
          poles.box(px - 0.09, pz - 0.09, px + 0.09, pz + 0.09, 0, 7.2, { su: 1, sv: 1 });
          const ax = px + uz * sgn * 1.5, az = pz - ux * sgn * 1.5;
          poles.box(Math.min(px, ax) - 0.06, Math.min(pz, az) - 0.06, Math.max(px, ax) + 0.06, Math.max(pz, az) + 0.06, 7.1, 7.22, { su: 1, sv: 1 });
          heads.box(ax - 0.3, az - 0.3, ax + 0.3, az + 0.3, 6.98, 7.1, { su: 1, sv: 1 });
        }
      }
    }
    L.deco(road.mesh(M.road)).castShadow = false; L.deco(line.mesh(M.line)).castShadow = false;
    L.deco(poles.mesh(L.mat('steel'))); L.deco(heads.mesh(L.mat('lamp'))).castShadow = false;
    // parked and dumped cars along the curbs (cover in a street fight)
    const cars = [[-120, 30.5, 'x'], [-20, 9.5, 'x'], [90, 30.5, 'x'], [150, 9.5, 'x'], [24, -60, 'z'], [39, 110, 'z'], [24, 230, 'z'], [-140, 166, 'x'], [60, 180, 'x'], [-60, -133, 'x'], [120, -119, 'x'], [-238, 40, 'z'], [222, 120, 'z'], [236, -60, 'z']];
    for (const [x, z, ax] of cars) if (!solidAt(x, z)) this.car(L, x, z, ax);

    // ---- the three crews ----
    this.warehouse(L); this.garage(L); this.office(L);
    const stands = [[205, 14, 'KING ST'], ...IDS.map(id => { const [x, z, yaw] = BASES[id].door; return [x + Math.sin(yaw) * -5 + Math.cos(yaw) * 4, z + Math.cos(yaw) * -5 - Math.sin(yaw) * 4, BASES[id].name]; })];
    skyDome(L, 0x1d1640, 0xd9774a);
    this.life = buildLife(L, this, { enter, walls, roofs, solidAt, Quads, PLAY, roads: CITY.roads, stands });
    for (const { mat, q } of this.kq.values()) L.deco(q.mesh(mat));
    for (const id of IDS) { // the site is concrete hardstanding, a shade darker than the sidewalk
      const s = BASES[id].site, q = new Quads(); q.strip([s[0], (s[1] + s[3]) / 2], [s[2], (s[1] + s[3]) / 2], s[3] - s[1], 0.015); L.deco(q.mesh(M.road)).castShadow = false;
    }
    walls.box(0, 0, 0, 0, 0, 0); // keeps the soup non-empty
    L.deco(walls.mesh(M.facade)); L.deco(roofs.mesh(L.mat('concreteDark')));
    const farMesh = L.deco(far.mesh(M.far)); farMesh.castShadow = false;

    // ---- free-roam threats: two rooftop snipers and a street pair on King St ----
    const roofNear = (x, z, h0, h1) => { let best = null, bd = 1e9; for (const b of city) { const [x0, z0, x1, z1, h] = b; if (h < h0 || h > h1 || (x1 - x0) < 8 || (z1 - z0) < 8 || x0 < PLAY[0] || x1 > PLAY[2] || z0 < PLAY[1] || z1 > PLAY[3]) continue; const d = Math.hypot((x0 + x1) / 2 - x, (z0 + z1) / 2 - z); if (d < bd) { bd = d; best = b; } } return best; };
    for (const [x, z, yaw] of [[-30, 140, 0], [110, -90, Math.PI]]) {
      const b = roofNear(x, z, 16, 40); if (!b) continue;
      L.enemy('sniper', (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, { y: b[4], yaw, tag: 'st', see: 0.8 });
    }
    L.enemy('thug_sword', -10, 20, { patrol: [[-10, 20, 3], [140, 20, 3]], tag: 'st' });
    L.enemy('guard_baton', -14, 22, { patrol: [[-14, 22, 3], [136, 22, 3]], tag: 'st' });

    // ---- Rourke Tower: a beacon on the roof (lit at the reveal) and the arrival trigger at its foot ----
    const tb = TOWER.box, top = Math.max(...city.filter(b => b[0] >= tb[0] - 1 && b[2] <= tb[2] + 1 && b[1] >= tb[1] - 1 && b[3] <= tb[3] + 1).map(b => b[4]), 0);
    this.towerTop = top;
    this.towerLamp = L.mesh(new THREE.BoxGeometry(3, 1.2, 3), 'lamp', (tb[0] + tb[2]) / 2 + 3, top + 0.6, (tb[1] + tb[3]) / 2 - 3); this.towerLamp.visible = false;
    L.trigger({ box: [TOWER.foot[0], -0.5, TOWER.foot[1] - 2, 70, 6, 14] }, () => { if (st.revealed && !st.arrived) this.arrive(L); }, { once: false });

    // ---- checkpoints: start, and one per (crews cleared mask, last crew) so a retry keeps the intel ----
    L.checkpoint('start', 215, 0, 20, -Math.PI / 2);
    for (let m = 1; m < 8; m++) for (const id of IDS) { if (!(m & (1 << (BASES[id].n - 1)))) continue; const [x, z, yaw] = BASES[id].door; L.checkpoint(`c${m}_${id}`, x, 0, z, yaw); }
    for (const id of IDS) { const [x, z, yaw] = BASES[id].door; L.checkpoint(`r_${id}`, x, 0, z, yaw); }

    // ---- arrival lines at each crew (once) ----
    const LINES = {
      wh: 'Warehouse. Glass on the roof, a fire escape up to the high windows. Or the front door.',
      pg: 'His garage. The office is on the top deck: roof glass, a ledge under the windows. Or up the ramps.',
      of: 'Top floor is his. Skylights, a ledge under the windows. Or the lobby and the service shaft.',
    };
    for (const id of IDS) { const [x, z] = BASES[id].centre; L.trigger({ at: [x, z], r: 48 }, () => { if (!st.taken[id]) L.say('CALDER', LINES[id], 4.5); }); }

    this.ui(L);
    L.every((dt) => this.tick(L, dt));
  },

  // ---------------- the crews ----------------
  // wall along x (axis 'x', at z) or along z (axis 'z', at x) from a to b, y0..y1, with gaps [[centre, width, gy0, gy1]]
  wallG(L, axis, at, a, b, y0, y1, gaps = [], o = {}) {
    const t = o.t || 0.4, mat = o.mat || 'concrete', seg = (s, e, ya, yb) => { if (e - s < 0.01 || yb - ya < 0.01) return; axis === 'x' ? this.bx(L, (s + e) / 2, ya, at, e - s, yb - ya, t, { mat, tile: 3 }) : this.bx(L, at, ya, (s + e) / 2, t, yb - ya, e - s, { mat, tile: 3 }); };
    let cur = a;
    for (const [c, w, gy0, gy1] of [...gaps].sort((p, q) => p[0] - q[0])) { seg(cur, c - w / 2, y0, y1); seg(c - w / 2, c + w / 2, y0, gy0); seg(c - w / 2, c + w / 2, gy1, y1); cur = c + w / 2; }
    seg(cur, b, y0, y1);
  },
  // a static base box: an invisible collider plus faces in one merged mesh per material (flushed at the end of build)
  qFor(L, m) { const key = typeof m === 'string' ? m : m.uuid; let q = this.kq.get(key); if (!q) this.kq.set(key, q = { mat: typeof m === 'string' ? L.mat(m) : m, q: new Quads() }); return q.q; },
  bx(L, x, y, z, w, h, d, o = {}) {
    const b = L.box(x, y, z, w, h, d, { ...o, visible: false }), t = o.tile || 4;
    this.qFor(L, o.mat || 'concrete').box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, y + h, { su: t, sv: t, st: t, bottom: true, topTo: o.topMat ? this.qFor(L, o.topMat) : undefined });
    return b;
  },
  slab(L, r, top, t, holes = [], mat = 'concreteDark') { for (const [x0, z0, x1, z1] of rectMinus(r, holes)) this.bx(L, (x0 + x1) / 2, top - t, (z0 + z1) / 2, x1 - x0, t, z1 - z0, { mat, tile: 4 }); },
  // a skylight: glass pane filling a roof hole (top flush with the roof). E cuts it out quietly; C or a hard landing smashes it
  skylight(L, base, x, z, w, d, top, t) {
    const b = L.box(x, top - t, z, w, t, d, { mat: 'glass', see: true, flags: { glass: true, noClimb: true }, shadow: false });
    const W = { b, x, z, y: top - t, w, h: t, ax: 'x', broken: false, sky: true, base };
    const q = this.qFor(L, 'steel'), y = top, f = 0.12;
    q.box(x - w / 2 - f, z - d / 2 - f, x + w / 2 + f, z - d / 2, y, y + 0.1, { su: 1, sv: 1, st: 1 }); q.box(x - w / 2 - f, z + d / 2, x + w / 2 + f, z + d / 2 + f, y, y + 0.1, { su: 1, sv: 1, st: 1 });
    q.box(x - w / 2 - f, z - d / 2, x - w / 2, z + d / 2, y, y + 0.1, { su: 1, sv: 1, st: 1 }); q.box(x + w / 2, z - d / 2, x + w / 2 + f, z + d / 2, y, y + 0.1, { su: 1, sv: 1, st: 1 });
    q.box(x - 0.03, z - d / 2, x + 0.03, z + d / 2, y, y + 0.06, { su: 1, sv: 1, st: 1 });
    L.windows.push(W); this.st.entries.push(W); return W;
  },
  entryWindow(L, base, x, z, o) { const W = L.window(x, z, o); W.base = base; this.st.entries.push(W); return W; },
  car(L, x, z, ax) {
    const w = ax === 'x' ? 4.4 : 1.9, d = ax === 'x' ? 1.9 : 4.4;
    this.bx(L, x, 0, z, w, 0.95, d, { mat: 'paintDark', cover: true, tile: 2 });
    this.bx(L, x - (ax === 'x' ? 0.2 : 0), 0.95, z - (ax === 'z' ? 0.2 : 0), ax === 'x' ? 2.4 : 1.7, 0.55, ax === 'x' ? 1.7 : 2.4, { mat: 'black', tile: 2 });
  },
  crate(L, x, z, y = 0, s = 1.4) { return this.bx(L, x, y, z, s, s, s, { mat: 'paint', cover: true, tile: 1.4 }); },
  desk(L, x, z, y) { return this.bx(L, x, y, z, 2.4, 0.8, 1.2, { mat: 'paintDark', cover: true, tile: 1.2 }); },
  intel(L, id, x, y, z) {
    this.bx(L, x, y, z, 1.4, 0.8, 0.8, { mat: 'steel', tile: 1 });
    L.mesh(new THREE.BoxGeometry(0.5, 0.12, 0.36), 'black', x, y + 0.86, z);
    const g = L.mesh(new THREE.OctahedronGeometry(0.16, 0), 'lamp', x, y + 1.5, z); g.visible = false; g.castShadow = false;
    this.st.intelAt[id] = { x, y, z, glow: g };
    L.trigger({ at: [x, z], r: 1.7, y0: y - 0.5, y1: y + 2.5 }, () => this.takeIntel(L, id), { once: false });
  },

  // WAREHOUSE (Front St): one tall hall, 40 x 24 x 10. Front: the roll-up door off the yard. Roof: three skylights.
  // Side: a fire-escape landing (ladder up) outside two high windows that open onto an inside catwalk.
  warehouse(L) {
    const x0 = -200, x1 = -160, z0 = 274, z1 = 298, H = 10, T = 'wh';
    this.wallG(L, 'x', z0, x0, x1, 0, H, [[-180, 5.2, 0, 4.6]]);
    this.wallG(L, 'x', z1, x0, x1, 0, H);
    this.wallG(L, 'z', x0, z0, z1, 0, H);
    this.wallG(L, 'z', x1, z0, z1, 0, H, [[280, 2.4, 5.6, 7.9], [292, 2.4, 5.6, 7.9]]);
    L.door(-180, z0, { axis: 'x', w: 5, h: 4.6, auto: true });
    this.entryWindow(L, T, x1, 280, { axis: 'z', w: 2.4, h: 2.3, y: 5.6 }); this.entryWindow(L, T, x1, 292, { axis: 'z', w: 2.4, h: 2.3, y: 5.6 });
    const sk = [-190, -180, -170].map(x => [x - 1.2, 284.2, x + 1.2, 287.8]);
    this.slab(L, [x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2], H + 0.3, 0.3, sk);
    for (const [a, b, c, d] of sk) this.skylight(L, T, (a + c) / 2, (b + d) / 2, c - a, d - b, H + 0.3, 0.3);
    // fire escape outside the east wall, catwalk inside
    this.bx(L, -158.7, 5.2, 286, 2.2, 0.3, 18, { mat: 'steel', tile: 1 }); L.ladder(-157.6, 294, { face: '+x', y1: 5.5 });
    this.bx(L, -161.2, 5.2, 286, 2, 0.3, 20, { mat: 'steel', tile: 1 }); L.ladder(-162.2, 277, { face: '-x', y1: 5.5 });
    // site office in the SW corner (its roof is a mezzanine), containers, crates, a truck in the yard
    this.wallG(L, 'x', 290, x0, -192, 0, 3.2, [[-195, 1.4, 0, 2.4]], { mat: 'paint', t: 0.25 }); this.wallG(L, 'z', -192, 290, z1, 0, 3.2, [], { mat: 'paint', t: 0.25 });
    this.bx(L, -196, 3.2, 294, 8, 0.2, 8, { mat: 'paintDark' });
    this.bx(L, -186, 0, 281, 6, 2.6, 2.4, { mat: 'metal', cover: true, tile: 2 }); this.bx(L, -172, 0, 292, 2.4, 2.6, 6, { mat: 'metal', cover: true, tile: 2 });
    for (const [x, z, y] of [[-176, 286], [-174.4, 286], [-176, 287.6], [-176, 286, 1.4], [-166, 280], [-166, 281.6], [-182, 294], [-194, 280], [-184, 270], [-186, 266.5], [-166, 290.5]]) this.crate(L, x, z, y || 0);
    this.bx(L, -166, 0, 267, 7, 2.9, 2.5, { mat: 'paintDark', cover: true, tile: 2 }); this.bx(L, -161.8, 0, 267, 1.6, 2.2, 2.5, { mat: 'black' });
    L.light(-190, 9.6, 286, { intensity: 10, dist: 22 }); L.light(-172, 9.6, 286, { intensity: 10, dist: 22 }); L.light(-196, 3.0, 294, { intensity: 4, dist: 7 });
    this.intel(L, T, -197.5, 0, 296.6);
    // the crew
    L.enemy('thug_sword', -190, 268, { patrol: [[-196, 268, 2], [-170, 270.5, 2]], tag: T });
    L.enemy('thug_pistol', -178, 265, { yaw: Math.PI, tag: T });
    L.enemy('guard_rifle', -196, 277, { patrol: [[-196, 277, 1], [-168, 277, 2], [-168, 289], [-196, 289, 2]], tag: T });
    L.enemy('guard_baton', -161.2, 278, { y: 5.5, patrol: [[-161.2, 278, 3], [-161.2, 295, 3]], tag: T });
    L.enemy('thug_pistol', -196, 293, { yaw: Math.PI, tag: T });
    L.enemy('thug_sword', -178, 291, { yaw: Math.PI / 2, tag: T });
    L.enemy('guard_baton', -195, 280, { y: H + 0.3, patrol: [[-195, 280, 3], [-165, 280, 3]], tag: T });
  },

  // PARKING GARAGE (Yonge St): three decks (0, 3.4, 6.8) and a roof (10.2) joined by stepped ramps. Front: the
  // vehicle entrance on Yonge. Rourke's crew office is the top-deck SW corner: roof glass above it, windows over an
  // outside ledge (ladder up from the lane).
  garage(L) {
    const x0 = 166, x1 = 212, z0 = -258, z1 = -226, T = 'pg', H = 11.2;
    this.wallG(L, 'x', z1, x0, x1, 0, H);
    this.wallG(L, 'x', z0, x0, x1, 0, H, [[170, 2.6, 7.1, 9.4], [176, 2.6, 7.1, 9.4]]);
    this.wallG(L, 'z', x0, z0, z1, 0, H);
    this.wallG(L, 'z', x1, z0, z1, 0, H, [[-247, 6, 0, 3.0]]);
    this.entryWindow(L, T, 170, z0, { axis: 'x', w: 2.6, h: 2.3, y: 7.1 }); this.entryWindow(L, T, 176, z0, { axis: 'x', w: 2.6, h: 2.3, y: 7.1 });
    const R = [x0, z0, x1, z1], rise = 3.4 / 12;
    this.slab(L, R, 3.4, 0.35, [[171, -233, 184, -227]]);
    this.slab(L, R, 6.8, 0.35, [[188, -257.6, 201, -251.6]]);
    const sk = [[169.8, -253.8, 172.2, -250.2], [174.8, -253.8, 177.2, -250.2]];
    this.slab(L, R, 10.2, 0.35, sk); for (const [a, b, c, d] of sk) this.skylight(L, T, (a + c) / 2, (b + d) / 2, c - a, d - b, 10.2, 0.35);
    for (let i = 0; i < 12; i++) { // ramps: ground -> P2 rising east, P2 -> P3 rising west
      this.bx(L, 172.5 + i, 0, -230, 1, (i + 1) * rise, 4, { mat: 'concrete', tile: 2 });
      this.bx(L, 199.5 - i, 3.4, -254.6, 1, (i + 1) * rise, 4, { mat: 'concrete', tile: 2 });
    }
    for (const [x, z] of [[178, -242], [194, -242], [204, -234], [204, -250]]) this.bx(L, x, 0, z, 0.7, 10.2, 0.7, { mat: 'concrete', tile: 2 });
    // crew office on the top deck
    this.wallG(L, 'x', -246, x0, 180, 6.8, 9.85, [[173, 1.6, 6.8, 9.0]], { mat: 'paint', t: 0.25 }); this.wallG(L, 'z', 180, z0, -246, 6.8, 9.85, [], { mat: 'paint', t: 0.25 });
    this.desk(L, 174, -251, 6.8);
    this.intel(L, T, 168.6, 6.8, -255.6);
    // outside ledge + ladder from the lane
    this.bx(L, 174, 6.5, -259, 16, 0.3, 1.6, { mat: 'steel', tile: 1 }); L.ladder(181, -259.8, { face: '-z', y1: 6.8 });
    // cars, a boom barrier at the entrance
    for (const [x, z, y] of [[192, -233], [200, -233], [190, -250], [176, -240, 3.4], [205, -242, 3.4], [184, -250, 3.4], [196, -238, 6.8], [205, -232, 6.8]]) { const yy = y || 0; this.bx(L, x, yy, z, 1.9, 0.95, 4.4, { mat: 'paintDark', cover: true, tile: 2 }); this.bx(L, x, yy + 0.95, z - 0.2, 1.7, 0.55, 2.4, { mat: 'black', tile: 2 }); }
    L.mesh(new THREE.BoxGeometry(0.12, 0.12, 5), 'paint', 214, 1.0, -247);
    L.light(190, 3.0, -242, { intensity: 8, dist: 20 }); L.light(194, 6.4, -244, { intensity: 8, dist: 20 }); L.light(173, 9.7, -252, { intensity: 5, dist: 9 });
    // the crew
    L.enemy('thug_pistol', 207, -247, { yaw: Math.PI / 2, tag: T });
    L.enemy('thug_sword', 200, -238, { patrol: [[200, -238, 2], [176, -240, 2], [176, -252], [200, -252, 2]], tag: T });
    L.enemy('guard_rifle', 190, -236, { y: 3.4, patrol: [[190, -236, 2], [207, -236, 2], [207, -248], [192, -247, 2]], tag: T });
    L.enemy('thug_sword', 180, -251, { y: 3.4, yaw: 0, tag: T });
    L.enemy('guard_baton', 184, -238, { y: 6.8, patrol: [[184, -238, 2], [207, -238, 2], [207, -248, 1]], tag: T });
    L.enemy('thug_pistol', 172, -249, { y: 6.8, yaw: 0, tag: T });
    L.enemy('sniper', 200, -230, { y: 10.2, yaw: Math.PI / 2, tag: T });
  },

  // OFFICE FLOOR (York St): six storeys. Lobby (front door on York) -> the service shaft ladder -> the top floor
  // (18.5 m). Top floor walls sit back 1.6 m on the south side: a ledge under three windows. Two skylights.
  office(L) {
    const x0 = -232, x1 = -196, z0 = -110, z1 = -84, F = 18.5, T = 'of', shaft = [-206, -100, -203.6, -97.6];
    this.wallG(L, 'z', x0, z0, z1, 0, 4, [[-97, 3, 0, 3], [-104, 3.6, 0.6, 3.4], [-90, 3.6, 0.6, 3.4]]);
    L.door(x0, -97, { axis: 'z', w: 3, h: 3, auto: true });
    this.entryWindow(L, T, x0, -104, { axis: 'z', w: 3.6, h: 2.8, y: 0.6 }); this.entryWindow(L, T, x0, -90, { axis: 'z', w: 3.6, h: 2.8, y: 0.6 });
    this.wallG(L, 'x', z0, x0, x1, 0, 4); this.wallG(L, 'x', z1, x0, x1, 0, 4); this.wallG(L, 'z', x1, z0, z1, 0, 4);
    // floors 2-5: one mass with the shaft through it (its faces are the climbable facade)
    for (const [a, b, c, d] of rectMinus([x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2], [shaft])) this.bx(L, (a + c) / 2, 4, (b + d) / 2, c - a, F - 4, d - b, { mat: mats(L).facadeKit, tile: 13, topMat: 'concreteDark' });
    L.ladder(-206, -98.8, { face: '+x', y0: 0, y1: F });
    this.bx(L, -203.65, F, -98.8, 0.1, 1.0, 2.4, { mat: 'steel', tile: 1 }); this.bx(L, -204.8, F, -100.05, 2.4, 1.0, 0.1, { mat: 'steel', tile: 1 }); this.bx(L, -204.8, F, -97.55, 2.4, 1.0, 0.1, { mat: 'steel', tile: 1 });
    // the top floor
    const zs = -85.6, wins = [-225, -214, -203];
    this.wallG(L, 'x', zs, x0, x1, F, F + 3.5, wins.map(x => [x, 2.6, F + 0.3, F + 2.6]));
    for (const x of wins) this.entryWindow(L, T, x, zs, { axis: 'x', w: 2.6, h: 2.3, y: F + 0.3 });
    this.wallG(L, 'x', z0, x0, x1, F, F + 3.5); this.wallG(L, 'z', x0, z0, zs, F, F + 3.5); this.wallG(L, 'z', x1, z0, zs, F, F + 3.5);
    const sk = [[-221.2, -98.8, -218.8, -95.2], [-210.2, -92.8, -207.8, -89.2]];
    this.slab(L, [x0 - 0.2, z0 - 0.2, x1 + 0.2, zs + 0.2], F + 3.9, 0.4, sk); for (const [a, b, c, d] of sk) this.skylight(L, T, (a + c) / 2, (b + d) / 2, c - a, d - b, F + 3.9, 0.4);
    // glass corner office (NW) with the intel
    L.window(-224, -107, { axis: 'z', w: 6, h: 3.4, y: F }); this.bx(L, -224, F, -110, 0.12, 3.5, 0.3, { mat: 'steel' });
    L.window(-228, -102, { axis: 'x', w: 8, h: 3.4, y: F });
    this.desk(L, -228, -108, F); this.intel(L, T, -229.5, F, -105.5);
    for (const [x, z] of [[-218, -106], [-212, -106], [-218, -91], [-212, -91], [-226, -91], [-199.5, -91], [-199.5, -106]]) this.desk(L, x, z, F);
    for (let i = 0; i < 4; i++) this.bx(L, -214 + i * 1.2, F, -109.4, 1.1, 2.0, 0.8, { mat: 'metal', tile: 1 }); // files
    L.mesh(new THREE.BoxGeometry(0.1, 0.5, 0.3), 'black', -196.3, F + 1.4, -108);
    L.light(-214, F + 3.4, -97, { intensity: 8, dist: 18 }); L.light(-228, F + 3.4, -94, { intensity: 6, dist: 12 }); L.light(-214, 3.7, -97, { intensity: 7, dist: 16 });
    // the crew
    L.enemy('guard_baton', -222, -102, { patrol: [[-226, -102, 2], [-208, -102, 2], [-208, -92], [-226, -92, 2]], tag: T });
    L.enemy('thug_pistol', -228, -104, { yaw: -Math.PI / 2, tag: T });
    L.enemy('guard_rifle', -222, -88, { y: F, patrol: [[-222, -88, 2], [-200, -88, 2], [-200, -100], [-215, -100, 2]], tag: T });
    L.enemy('thug_sword', -214, -103, { y: F, yaw: 0, tag: T });
    L.enemy('thug_sword', -203, -93, { y: F, yaw: Math.PI, tag: T });
    L.enemy('thug_pistol', -229, -106, { y: F, yaw: Math.PI / 2, tag: T });
    L.enemy('scientist', -215, -95, { y: F, yaw: Math.PI, alarm: [-197, -108], tag: T });
  },

  // ---------------- flow ----------------
  async start(L, ctx) {
    const st = this.st, cp = ctx.checkpoint || 'start';
    L.on('alarm', () => L.say('GUARD', 'He is here! Everybody up!', 2.4));
    // a checkpoint id carries the progress: c<mask>_<last crew> (intel taken), r_<crew> (tower revealed)
    let mask = 0, revealed = false;
    if (/^c\d_/.test(cp)) mask = +cp[1]; else if (cp.startsWith('r_')) { mask = 7; revealed = true; }
    for (const id of IDS) if (mask & (1 << (BASES[id].n - 1))) { st.cleared[id] = st.taken[id] = true; st.intel++; this.dropCrew(L, id); }
    this.objectives(L);
    if (revealed) return this.revealState(L);
    if (mask === 7) return this.reveal(L, cp.slice(-2));
    if (cp !== 'start') return;
    // intro: King St East at Yonge, looking west down the Financial District
    const me = L.actor({ hero: true, pose: 'idle' });
    await L.cutscene({
      shots: [
        { from: [238, 2.2, 24], to: [234, 30, 22], look: [140, 30, 20], lookTo: [-80, 140, 20], fov: 50, fovTo: 46, dur: 6 },
        { from: [170, 330, 170], to: [130, 335, 210], look: [-80, 120, 0], lookTo: [CITY.cnTower[0], 380, CITY.cnTower[1]], fov: 48, dur: 6.5 },
        { from: [210.8, 1.7, 23.6], to: [211.6, 1.75, 23.2], look: me, fov: 40, dur: 5 },
      ],
      lines: [
        [0.6, 'CALDER', 'Toronto. His town.', 2.4],
        [3.4, 'ROURKE', 'You walked out of Site 9 on foot. I am almost proud of you, Ash.', 3.6],
        [7.4, 'CALDER', 'Where are you, Vince?', 2],
        [9.8, 'ROURKE', 'Somewhere high. Three of my crews stand between us. Ask them.', 3.6],
        [13.8, 'CALDER', 'I will.', 1.8],
      ],
      beats: [[13.0, () => me.face(-Math.PI / 2)]],
      end: () => { L.dropActor(me); },
    });
    L.say('', 'M opens the map. Climb anything; the rooftops are yours.', 4);
  },

  objectives(L) {
    const st = this.st;
    if (st.revealed) { L.objective('tower', 'Get to the tower (King St W, west of Bay)'); return; }
    L.objective('hunt', `Clear the three crews and take their intel (${st.intel}/3)  ·  M map`);
    for (const id of IDS) {
      const B = BASES[id];
      if (st.taken[id]) { L.done(id); continue; }
      L.objective(id, st.cleared[id] ? `${B.name}: take the intel` : `${B.name}, ${B.street}: ${L.alive(id)} men`);
    }
  },
  dropCrew(L, id) {
    const G = L.G;
    for (const e of [...G.enemies]) if (e.tag === id) { G.scene?.remove(e.rig.root); e.rig.skin?.dispose?.(); if (e.laser) G.scene?.remove(e.laser); G.enemies.splice(G.enemies.indexOf(e), 1); }
  },

  takeIntel(L, id) {
    const st = this.st; if (st.taken[id] || st.busy) return;
    if (!st.cleared[id]) { if ((st.nag || 0) < L.time) { st.nag = L.time + 6; L.say('CALDER', 'Not with his men still breathing.', 2.2); } return; }
    st.taken[id] = true; st.intel++; st.intelAt[id].glow.visible = false;
    L.G.banner?.(`INTEL ${st.intel} / 3`, 1.6); sfx.ready?.();
    L.done(id); this.objectives(L);
    const mask = IDS.reduce((m, k) => m | (st.taken[k] ? 1 << (BASES[k].n - 1) : 0), 0);
    if (L.checkpoints[`c${mask}_${id}`]) L.C.reachCheckpoint(`c${mask}_${id}`);
    if (st.intel === 1) { L.say('CALDER', 'Shipping manifests. Crates out of Site 9. Signed V.R.', 3.4).then(() => L.say('ROURKE', 'Reading my mail now, Ash?', 2.4)); }
    else if (st.intel === 2) { L.say('CALDER', 'Payroll. Every man in there was paid by Rourke Holdings.', 3.4).then(() => L.say('ROURKE', 'They were good men. Expensive, too.', 2.6)); }
    else this.reveal(L, id);
  },

  // the third intel: flight logs -> the camera finds Rourke Tower
  async reveal(L, id) {
    const st = this.st; st.busy = true;
    const tb = TOWER.box, cx = (tb[0] + tb[2]) / 2, cz = (tb[1] + tb[3]) / 2, top = this.towerTop || 290;
    await L.cutscene({
      shots: [
        { from: [cx - 260, top + 40, cz + 230], to: [cx - 200, top + 30, cz + 190], look: [cx, top * 0.55, cz], lookTo: [cx, top - 10, cz], fov: 44, fovTo: 38, dur: 6 },
        { from: [cx + 60, top + 60, cz + 120], to: [cx + 40, top + 45, cz + 80], look: [cx, top, cz], fov: 40, dur: 5 },
      ],
      lines: [
        [0.4, 'CALDER', 'Flight logs. One helicopter. Same roof, every night.', 3.4],
        [4.2, 'ROURKE', 'Took you long enough. I am on the roof, Ash.', 3.0],
        [7.6, 'CALDER', 'Keep the rotor warm.', 2.2],
      ],
      beats: [[3.0, () => { this.towerLamp.visible = true; }]],
      end: () => { this.towerLamp.visible = true; },
    });
    st.busy = false;
    this.revealState(L);
    if (L.checkpoints[`r_${id}`]) L.C.reachCheckpoint(`r_${id}`);
  },
  revealState(L) {
    const st = this.st; st.revealed = true; this.towerLamp.visible = true;
    L.done('hunt'); for (const id of IDS) L.done(id);
    L.objective('tower', 'Get to the tower (King St W, west of Bay)');
  },
  async arrive(L) {
    const st = this.st; st.arrived = true; L.done('tower');
    const [fx, fz] = TOWER.foot, top = this.towerTop || 290;
    await L.cutscene({
      shots: [{ from: [fx + 10, 1.4, fz + 16], to: [fx + 6, 1.6, fz + 12], look: [fx, 12, fz - 20], lookTo: [fx, top, fz - 24], fov: 52, fovTo: 44, dur: 5.5 }],
      lines: [[0.5, 'CALDER', 'Seventy floors.', 1.8], [2.6, 'ROURKE', 'Seventy-two. Start climbing.', 2.6]],
    });
    L.end('tower');
  },

  // ---------------- per frame: crews, entries, the waypoint ----------------
  tick(L, dt) {
    const st = this.st, G = L.G, h = G.hero; if (!h) return;
    if (this.life) updateLife(L, this.life, dt);
    if (st.ui && !G.cut) { const S = this.life?.stands.find(s => Math.hypot(h.pos.x - s.x, h.pos.z - s.z) < 5 && h.pos.y < 1.5); st.stand = S || null; if (S && !st.taxiOpen) { st.ui.hint.style.display = 'block'; st.ui.hint.textContent = 'TAXI: press T'; } }
    else st.stand = null;
    // crews cleared?
    for (const id of IDS) {
      if (st.taken[id]) continue;
      const n = L.alive(id);
      if (!st.cleared[id] && n === 0) { st.cleared[id] = true; st.intelAt[id].glow.visible = true; L.say('CALDER', 'That is all of them. Now the intel.', 2.4); }
      if (st.count?.[id] !== n) { (st.count ||= {})[id] = n; this.objectives(L); }
      const I = st.intelAt[id]; // standing at the intel when the last man drops counts too
      if (st.cleared[id] && Math.hypot(h.pos.x - I.x, h.pos.z - I.z) < 1.7 && Math.abs(h.pos.y - I.y) < 2) this.takeIntel(L, id);
    }
    for (const id of IDS) { const g = st.intelAt[id]?.glow; if (g?.visible) g.rotation.y += dt * 2; }
    if ((st.visT = (st.visT || 0) - dt) <= 0) { st.visT = 0.25; for (const e of G.enemies) if (e.alive && e.tag !== 'st' && e.rig?.root) e.rig.root.visible = Math.abs(e.pos.x - h.pos.x) + Math.abs(e.pos.z - h.pos.z) < 170; }
    if (st.revealed && !G.cut) this.towerLamp.visible = (L.time % 1.2) < 0.8; // the roof beacon blinks
    // entries: E cuts the glass you are at (quiet); C on a skylight or a hard landing smashes it (loud)
    st.near = null;
    if (!h.dead && !G.cut) for (const W of st.entries) {
      if (W.broken) continue;
      const b = W.b;
      if (W.sky) {
        const over = h.pos.x > b.min.x - 0.1 && h.pos.x < b.max.x + 0.1 && h.pos.z > b.min.z - 0.1 && h.pos.z < b.max.z + 0.1;
        if (!over) continue;
        if (h.grounded && Math.abs(h.pos.y - b.max.y) < 0.2) { st.near = W; if (h.crouching) { L.shatter(W, V(0, -1, 0)); st.near = null; } }
        else if (!h.grounded && h.vel.y < -9 && h.pos.y - b.max.y < 0.6 && h.pos.y > b.min.y) { L.shatter(W, V(0, -1, 0)); st.near = null; }
      } else {
        const c = h.center || h.pos, dx = Math.max(b.min.x - c.x, 0, c.x - b.max.x), dz = Math.max(b.min.z - c.z, 0, c.z - b.max.z);
        if (Math.hypot(dx, dz) < 1.6 && h.pos.y > b.min.y - 1.2 && h.pos.y < b.max.y - 0.5) st.near = W;
      }
    }
    this.uiTick(L, dt);
  },
  cutGlass(L) {
    const W = this.st.near; if (!W || W.broken) return false;
    W.broken = true; removeBox(W.b); sfx.scrape?.(); L.G.noise?.(V(W.x, W.y + 1, W.z), 2.5, false); this.st.near = null; return true;
  },
  // where the marker points: the pinned or nearest unfinished crew (its intel once cleared, its last men when few
  // are left), then the tower
  target(L) {
    const st = this.st, h = L.G.hero.pos;
    if (st.revealed) return { p: V(TOWER.foot[0], 1, TOWER.foot[1]), label: TOWER.name, beam: true };
    const open = IDS.filter(id => !st.taken[id]); if (!open.length) return null;
    const id = open.includes(st.pin) ? st.pin : open.sort((a, b) => Math.hypot(h.x - BASES[a].centre[0], h.z - BASES[a].centre[1]) - Math.hypot(h.x - BASES[b].centre[0], h.z - BASES[b].centre[1]))[0];
    const B = BASES[id], I = st.intelAt[id];
    if (st.cleared[id]) return { p: V(I.x, I.y + 1, I.z), label: 'INTEL', id };
    const near = Math.hypot(h.x - B.centre[0], h.z - B.centre[1]) < 40, live = L.G.enemies.filter(e => e.alive && e.tag === id);
    if (near && live.length && live.length <= 2) { live.sort((a, b) => a.pos.distanceTo(h) - b.pos.distanceTo(h)); return { p: live[0].pos.clone().setY(live[0].pos.y + 2.1), label: 'LAST MEN', id }; }
    return { p: V(B.door[0], 1, B.door[1]), label: B.name, id, beam: true };
  },

  // ---------------- UI: waypoint marker, glass hint, map (M) ----------------
  ui(L) {
    const st = this.st;
    const beam = L.mesh(new THREE.CylinderGeometry(0.7, 0.7, 500, 8, 1, true), mats(L).beam, 0, 250, 0); beam.castShadow = beam.receiveShadow = false; beam.visible = false; this.beam = beam;
    if (!hasDoc) return;
    const el = (css, html = '') => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;pointer-events:none;z-index:30;font-family:inherit;color:#eee;' + css; d.innerHTML = html; document.body.appendChild(d); return d; };
    const marker = el('left:0;top:0;transform:translate(-50%,-100%);text-align:center;font-size:12px;letter-spacing:2px;text-shadow:0 1px 3px #000;display:none',
      '<div style="width:14px;height:14px;margin:0 auto 3px;border:2px solid #fff;transform:rotate(45deg);background:rgba(255,255,255,0.15)"></div>');
    const label = document.createElement('span'); marker.appendChild(label);
    const hint = el('left:50%;bottom:22%;transform:translateX(-50%);font-size:13px;letter-spacing:2px;padding:6px 12px;background:rgba(0,0,0,0.45);display:none');
    const wrap = el('inset:0;display:none;align-items:center;justify-content:center;background:rgba(10,10,10,0.55)');
    const cv = document.createElement('canvas'); cv.width = 700; cv.height = Math.ceil(700 / (PLAY[2] - PLAY[0] + 40) * (PLAY[3] - PLAY[1] + 40)); cv.style.cssText = 'height:min(90vh,' + cv.height + 'px);width:auto;border:1px solid #888;background:#1b1b1b'; wrap.appendChild(cv);
    st.ui = { marker, label, hint, wrap, cv, open: false, base: this.mapBase(cv) };
    st.ui.key = e => {
      const G = L.G; if (!G.playing || G.paused || G.over) return;
      if (e.code === 'KeyM' && !e.repeat && !G.cut) { st.ui.open = !st.ui.open; wrap.style.display = st.ui.open ? 'flex' : 'none'; }
      else if (st.ui.open && /^Digit[123]$/.test(e.code)) st.pin = IDS[+e.code[5] - 1];
      else if (e.code === 'KeyE' && !e.repeat && !G.cut) this.cutGlass(L);
      else if (e.code === 'KeyT' && !e.repeat && !G.cut && st.stand) this.taxiMenu(L, true);
      else if (st.taxiOpen && /^Digit[1-5]$/.test(e.code)) { const d = st.taxiDest[+e.code[5] - 1]; this.taxiMenu(L, false); if (d) this.ride(L, d); }
      else if (st.taxiOpen && e.code === 'Escape') this.taxiMenu(L, false);
    };
    addEventListener('keydown', st.ui.key);
  },
  // taxis: the stand menu (destinations: the three crews, the stands, the tower once revealed) and the ride
  taxiMenu(L, open) {
    const st = this.st; st.taxiOpen = open;
    if (!st.taxiEl && hasDoc) { st.taxiEl = document.createElement('div'); st.taxiEl.style.cssText = 'position:fixed;left:50%;top:30%;transform:translateX(-50%);z-index:31;background:rgba(10,10,14,0.85);border:1px solid #f2c200;padding:14px 22px;color:#eee;font:14px Arial;letter-spacing:2px;line-height:1.9;display:none'; document.body.appendChild(st.taxiEl); }
    if (!st.taxiEl) return;
    if (!open) { st.taxiEl.style.display = 'none'; return; }
    const d = IDS.map(id => { const [x, z, yaw] = BASES[id].door; return { name: BASES[id].name + ' (' + BASES[id].street + ')', x, z, yaw }; });
    d.push({ name: 'KING ST (start)', x: 215, z: 20, yaw: -Math.PI / 2 });
    if (st.revealed) d.push({ name: TOWER.name, x: TOWER.foot[0], z: TOWER.foot[1] + 6, yaw: Math.PI });
    st.taxiDest = d; st.taxiEl.innerHTML = '<b style="color:#f2c200">TAXI</b> where to?<br>' + d.map((q, i) => (i + 1) + '  ' + q.name).join('<br>') + '<br><small>ESC: never mind</small>'; st.taxiEl.style.display = 'block';
  },
  async ride(L, d) {
    const S = this.st.stand, h = L.hero; if (!S) return;
    const car = S.car;
    await L.cutscene({
      shots: [
        { from: [S.x - 6, 2.2, S.z + 6], to: [S.x - 4, 2.6, S.z + 4], look: [S.x + 2.6, 1, S.z], fov: 46, dur: 1.8 },
        { from: [d.x + 8, 3, d.z + 8], to: [d.x + 6, 2.4, d.z + 6], look: [d.x, 1, d.z], fov: 50, dur: 1.8 },
      ],
      lines: [[0.2, 'DRIVER', 'Where to, pal?', 1.4], [1.9, 'DRIVER', 'That is twenty. Keep the change? Sure.', 1.6]],
      beats: [[1.8, () => { car.position.set(d.x + Math.sin(d.yaw) * -6 + 2.5, 0, d.z + Math.cos(d.yaw) * -6); }]],
      end: () => { h.pos.set(d.x + Math.sin(d.yaw) * -3, 0, d.z + Math.cos(d.yaw) * -3); h.vel.set(0, 0, 0); h.yaw = d.yaw; L.G.input.yaw = d.yaw; car.position.set(S.x + 2.6, 0, S.z); },
    });
  },
  // the map projection: play area (+ margin) onto the canvas, north up
  mapXY(x, z) { const s = 700 / (PLAY[2] - PLAY[0] + 40); return [(x - PLAY[0] + 20) * s, (z - PLAY[1] + 20) * s]; },
  mapBase(cv) {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d');
    const s = 700 / (PLAY[2] - PLAY[0] + 40), P = (x, z) => this.mapXY(x, z);
    g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#4a4a4a';
    for (const r of CITY.roads) { g.lineWidth = Math.max(2, r.w * s); g.beginPath(); r.p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    for (const [x0, z0, x1, z1, h] of this.city) { const v = Math.min(225, 95 + h * 0.45) | 0; g.fillStyle = `rgb(${v},${v},${v})`; const [a, b] = P(x0, z0); g.fillRect(a, b, (x1 - x0) * s + 0.5, (z1 - z0) * s + 0.5); }
    g.fillStyle = '#bbb'; g.font = '11px sans-serif'; g.textAlign = 'center';
    for (const [n, [x, z, w, d]] of Object.entries(CITY.streets)) {
      if (x < PLAY[0] - 30 || x > PLAY[2] + 30 || z < PLAY[1] - 30 || z > PLAY[3] + 30) continue;
      const lbl = n.replace('Street', 'St').replace('Avenue', 'Ave').toUpperCase(); const [px, py] = P(Math.max(PLAY[0] + 40, Math.min(PLAY[2] - 40, x)), Math.max(PLAY[1] + 30, Math.min(PLAY[3] - 20, z)));
      g.save(); g.translate(px, py); if (d > w) g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-g.measureText(lbl).width / 2 - 3, -9, g.measureText(lbl).width + 6, 13); g.fillStyle = '#ddd'; g.fillText(lbl, 0, 1); g.restore();
    }
    g.fillStyle = '#ccc'; g.textAlign = 'left'; g.fillText('N ↑   LAKE ONTARIO ↓   1 / 2 / 3  pin a crew   ·   M  close', 10, c.height - 10);
    return c;
  },
  uiTick(L, dt) {
    const st = this.st, U = st.ui, G = L.G, T = this.target(L);
    if (this.beam) { this.beam.visible = !!(T && T.beam) && !G.cut; if (T) this.beam.position.set(T.p.x, 250, T.p.z); }
    if (!U) return;
    const hide = !G.playing || G.paused || G.over || !!G.cut;
    // marker
    if (hide || !T || !G.camera) U.marker.style.display = 'none';
    else {
      const v = T.p.clone().project(G.camera), behind = v.z > 1, W = innerWidth, H = innerHeight;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H * 0.85; }
      x = Math.max(30, Math.min(W - 30, x)); y = Math.max(40, Math.min(H - 30, y));
      U.marker.style.display = 'block'; U.marker.style.left = x + 'px'; U.marker.style.top = y + 'px';
      const d = Math.round(T.p.distanceTo(G.hero.pos)), txt = `${T.label}  ${d} m`;
      if (U.marker._t !== txt) { U.marker._t = txt; U.label.textContent = txt; }
    }
    // glass hint
    const W = st.near, ht = hide || !W ? '' : W.sky ? 'E  cut the skylight (quiet)   ·   C  smash through (loud)' : 'E  cut the glass (quiet)   ·   dash / slash  smash it (loud)';
    if (U.hint._t !== ht) { U.hint._t = ht; U.hint.textContent = ht; U.hint.style.display = ht ? 'block' : 'none'; }
    // map
    if (U.open && hide) { U.open = false; U.wrap.style.display = 'none'; }
    if (!U.open) return;
    const g = U.cv.getContext('2d'), s = 700 / (PLAY[2] - PLAY[0] + 40); g.drawImage(U.base, 0, 0);
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    if (st.revealed) { const tb = TOWER.box, [a, b] = this.mapXY(tb[0], tb[1]); g.fillStyle = (L.time % 1) < 0.6 ? '#fff' : '#999'; g.fillRect(a, b, (tb[2] - tb[0]) * s, (tb[3] - tb[1]) * s); g.fillStyle = '#fff'; g.fillText(TOWER.name, a + (tb[2] - tb[0]) * s / 2, b - 6); }
    for (const id of IDS) {
      const B = BASES[id], [a, b] = this.mapXY(B.site[0], B.site[1]), w = (B.site[2] - B.site[0]) * s, d = (B.site[3] - B.site[1]) * s;
      g.strokeStyle = st.taken[id] ? '#777' : '#fff'; g.lineWidth = st.pin === id ? 4 : 2; g.strokeRect(a, b, w, d);
      g.fillStyle = st.taken[id] ? '#888' : '#fff'; g.fillText(`${B.n}  ${B.name}${st.taken[id] ? '  ✓' : st.cleared[id] ? '  INTEL' : ''}`, a + w / 2, b - 6);
    }
    if (T) { const [x, y] = this.mapXY(T.p.x, T.p.z); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9 + Math.sin(L.time * 5) * 2, 0, 7); g.stroke(); }
    const hp = G.hero.pos, [hx, hy] = this.mapXY(hp.x, hp.z), yaw = G.hero.yaw;
    g.save(); g.translate(hx, hy); g.rotate(-yaw + Math.PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  },

  unload(L) {
    const st = this.st;
    st?.taxiEl?.remove();
    if (st?.ui) { removeEventListener('keydown', st.ui.key); for (const k of ['marker', 'hint', 'wrap']) st.ui[k].remove(); st.ui = null; }
    this.restoreView(L.G);
  },
  // a far camera for the skyline, and the sun's shadow box follows the hero up onto the rooftops (main.js pins it to
  // y = 0..26 around the hero's feet). Undone in unload.
  setupView(G) {
    if (G.camera && !this.far0) { this.far0 = G.camera.far; G.camera.far = 2600; G.camera.updateProjectionMatrix(); }
    if (G.sun && !this.sunPatched) {
      const lift = () => Math.max(0, (G.camOverride ? G.camOverride.look.y : G.hero?.pos.y) || 0), set = THREE.Vector3.prototype.set;
      G.sun.position.set = function (x, y, z) { return set.call(this, x, y + lift(), z); };
      G.sun.target.position.set = function (x, y, z) { return set.call(this, x, y + lift(), z); };
      this.sunPatched = true;
    }
  },
  restoreView(G) {
    if (G.camera && this.far0) { G.camera.far = this.far0; G.camera.updateProjectionMatrix(); this.far0 = null; }
    if (G.sun && this.sunPatched) { delete G.sun.position.set; delete G.sun.target.position.set; this.sunPatched = false; }
  },
};
