// Build pieces: wooden alphabet blocks, domino walls, staircases, ramps, ruler bridges.
// Each piece = a mesh + a handful of axis-aligned collision boxes (rotations are 90deg steps).
import * as THREE from '../vendor/three.module.js';
import { roundedBox, canvasTex, rng } from './util.js';
import { woodTex, letterTex, BUILD } from './world.js';

export const PIECES = {
  block: { name: 'BLOCK', cost: 1, hp: 150, w: 2, d: 2, key: '1', rank: 0, boxes: [[-1, 0, -1, 1, 2, 1]] },
  wall: { name: 'DOMINO WALL', cost: 1, hp: 190, w: 4, d: 1, key: '2', rank: 0, boxes: [[-2, 0, -0.4, 2, 2.2, 0.4]] },
  stairs: { name: 'STAIRS', cost: 2, hp: 220, w: 2, d: 4, key: '3', rank: 0, boxes: [0, 1, 2, 3].map((i) => [-1, 0, -2 + i, 1, 0.5 * (i + 1), -1 + i]) },
  ramp: { name: 'RAMP', cost: 2, hp: 200, w: 2, d: 4, key: '4', rank: 1, boxes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [-1, 0, -2 + i * 0.5, 1, 0.25 * (i + 1), -1.5 + i * 0.5]) },
  plank: { name: 'RULER BRIDGE', cost: 1, hp: 110, w: 2, d: 6, key: '5', rank: 2, boxes: [[-1, 0, -3, 1, 0.3, 3]] },
};
export const ORDER = ['block', 'wall', 'stairs', 'ramp', 'plank'];
export const MAX_H = 6.2;

const LETTERS = 'ABCDEFGHKLMNPRSTWXYZ';
const TEAMCOL = [['#2f8f5b', '#2e6da4', '#7aa63a'], ['#c0392b', '#d35400', '#b03a6a']];
const matCache = {};
function cached(k, f) { return matCache[k] || (matCache[k] = f()); }

function dominoMats() {
  return cached('domino', () => {
    const black = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
    const face = (pips) => new THREE.MeshPhysicalMaterial({
      roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15,
      map: canvasTex(512, 256, (g, w, h) => {
        g.fillStyle = '#15161a'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#e9e4d8'; g.fillRect(w / 2 - 4, 22, 8, h - 44);
        const P = { 1: [[0.5, 0.5]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.25, 0.2], [0.25, 0.5], [0.25, 0.8], [0.75, 0.2], [0.75, 0.5], [0.75, 0.8]] };
        pips.forEach((n, half) => { for (const [u, v] of P[n]) { g.beginPath(); g.arc(half * w / 2 + u * w / 2, v * h, 20, 0, 7); g.fill(); } });
      }),
    });
    return [black, black, black, black, face([6, 3]), face([5, 4])];
  });
}
function rulerMat() {
  return cached('ruler', () => new THREE.MeshPhysicalMaterial({
    roughness: 0.35, clearcoat: 0.6,
    map: canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = '#f5d76e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b2b2b';
      for (let i = 0; i <= 60; i++) { const y = i / 60 * h, l = i % 10 === 0 ? 46 : i % 5 === 0 ? 30 : 16; g.fillRect(0, y - 1, l, 2); if (i % 10 === 0 && i < 60) { g.font = 'bold 18px Arial'; g.fillText(String(i / 10), 50, y + 7); } }
    }),
  }));
}
function stairMats() { return cached('stairs', () => { const w = woodTex('#e3b778', '#b98546', 1, 21); return new THREE.MeshStandardMaterial({ map: w.map, normalMap: w.normal, roughness: 0.55 }); }); }
function rampMat(team) { return cached('ramp' + team, () => { const w = woodTex(team ? '#d9634a' : '#4a9ad9', team ? '#9a3d2a' : '#2a6a9a', 1, 31); return new THREE.MeshPhysicalMaterial({ map: w.map, normalMap: w.normal, roughness: 0.4, clearcoat: 0.4 }); }); }
function blockMat(team, i) {
  return cached('blk' + team + '_' + i, () => new THREE.MeshPhysicalMaterial({ map: letterTex(LETTERS[(i * 7 + team * 3) % LETTERS.length], TEAMCOL[team][i % 3]), roughness: 0.5, clearcoat: 0.25 }));
}
let rampGeo = null;
function rampGeometry() {
  if (rampGeo) return rampGeo;
  const s = new THREE.Shape(); s.moveTo(-2, 0); s.lineTo(2, 0); s.lineTo(2, 2); s.lineTo(-2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.84, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3 });
  g.translate(0, 0, -0.92); g.rotateY(-Math.PI / 2); // profile along z, width along x
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25);
  g.computeVertexNormals();
  return (rampGeo = g);
}

export function makeMesh(type, team, seed = 0) {
  const g = new THREE.Group(), add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  if (type === 'block') add(roundedBox(1.98, 1.98, 1.98, 0.14), blockMat(team, seed % 3), 0, 0.99, 0).rotation.y = (seed % 4) * Math.PI / 2;
  else if (type === 'wall') add(roundedBox(4, 2.2, 0.8, 0.16), dominoMats(), 0, 1.1, 0);
  else if (type === 'stairs') { for (let i = 0; i < 4; i++) add(roundedBox(1.96, 0.5 * (i + 1), 0.98, 0.08, 2), stairMats(), 0, 0.25 * (i + 1), -1.5 + i); }
  else if (type === 'ramp') { const m = add(rampGeometry(), rampMat(team)); m.position.set(0, 0, 0); }
  else if (type === 'plank') add(roundedBox(1.9, 0.3, 6, 0.08, 2), rulerMat(), 0, 0.15, 0);
  return g;
}

export function rotBox(b, rot) {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let r = 0; r < rot; r++) { [x0, z0, x1, z1] = [z0, -x1, z1, -x0]; }
  return [Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)];
}
export function footprint(type, rot) { const P = PIECES[type]; return rot % 2 ? [P.d, P.w] : [P.w, P.d]; }
export function snap(type, rot, x, z) {
  const [w, d] = footprint(type, rot);
  return [Math.round(x - w / 2) + w / 2, Math.round(z - d / 2) + d / 2];
}

export class Pieces {
  constructor(scene, world) { this.scene = scene; this.world = world; this.list = []; this.nextId = 1; this.group = new THREE.Group(); scene.add(this.group); this._boxes = null; world.extra = () => this.boxes(); this.onBreak = null; }
  clear() { for (const p of this.list) this.group.remove(p.mesh); this.list = []; this._boxes = null; this.nextId = 1; }
  boxes() { if (!this._boxes) { this._boxes = []; for (const p of this.list) this._boxes.push(...p.boxes); } return this._boxes; }
  spent(team) { return this.list.filter((p) => p.team === team).reduce((a, p) => a + PIECES[p.type].cost, 0); }

  // where would it go and is it allowed? returns {ok, x, y, z, why}
  test(type, rot, x, z, team) {
    [x, z] = snap(type, rot, x, z);
    const [w, d] = footprint(type, rot);
    const sz = team === 0 ? -1 : 1, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    let why = '';
    const nz = Math.min(Math.abs(z0), Math.abs(z1)), fz = Math.max(Math.abs(z0), Math.abs(z1));
    if (Math.sign(z) !== sz || Math.sign(z0) !== Math.sign(z1) && Math.abs(z0) > 0.01 && Math.abs(z1) > 0.01) why = 'your half only';
    else if (nz < BUILD.zMin - 0.01 || fz > BUILD.zMax + 0.01 || x0 < -BUILD.x - 0.01 || x1 > BUILD.x + 0.01) why = 'outside build zone';
    const y = this.world.supportAt(x0, z0, x1, z1);
    if (!why && y + Math.max(...PIECES[type].boxes.map((b) => b[4])) > MAX_H + 2.3) why = 'too high';
    const bx = PIECES[type].boxes.map((b) => { const r = rotBox(b, rot); return { x0: x + r[0], y0: y + r[1], z0: z + r[2], x1: x + r[3], y1: y + r[4], z1: z + r[5] }; });
    if (!why) for (const b of bx) for (const o of this.world.allBoxes()) {
      if (o.floor || o.wall) continue;
      if (b.x0 < o.x1 - 0.02 && b.x1 > o.x0 + 0.02 && b.y0 < o.y1 - 0.02 && b.y1 > o.y0 + 0.02 && b.z0 < o.z1 - 0.02 && b.z1 > o.z0 + 0.02) { why = 'blocked'; break; }
    }
    return { ok: !why, x, y, z, why, boxes: bx };
  }

  add(type, rot, x, z, team, id) {
    const t = this.test(type, rot, x, z, team);
    if (!t.ok) return null;
    return this.addAt(type, rot, t.x, t.y, t.z, team, id);
  }
  addAt(type, rot, x, y, z, team, id) {
    const p = { id: id || this.nextId++, type, rot, team, x, y, z, hp: PIECES[type].hp, mesh: makeMesh(type, team, Math.abs(Math.round(x * 3 + z * 5))), pop: 0, fallV: 0 };
    if (id && id >= this.nextId) this.nextId = id + 1;
    p.mesh.position.set(x, y, z); p.mesh.rotation.y = rot * Math.PI / 2; p.mesh.scale.setScalar(0.01);
    this.group.add(p.mesh);
    this.setBoxes(p);
    this.list.push(p); this._boxes = null;
    return p;
  }
  setBoxes(p) { p.boxes = PIECES[p.type].boxes.map((b) => { const r = rotBox(b, p.rot); return { x0: p.x + r[0], y0: p.y + r[1], z0: p.z + r[2], x1: p.x + r[3], y1: p.y + r[4], z1: p.z + r[5], piece: p }; }); this._boxes = null; }
  remove(p) { this.group.remove(p.mesh); this.list = this.list.filter((q) => q !== p); this._boxes = null; }
  byId(id) { return this.list.find((p) => p.id === id); }

  damage(p, dmg) {
    if (!p || p.hp <= 0) return false;
    p.hp -= dmg; p.pop = Math.max(p.pop, 0.12);
    if (p.hp <= 0) { this.remove(p); this.onBreak && this.onBreak(p); return true; }
    return false;
  }

  // pieces whose support vanished drop down (toys obey gravity)
  update(dt) {
    let moved = false;
    for (const p of this.list) {
      const s = p.mesh.scale.x;
      if (s < 1) p.mesh.scale.setScalar(Math.min(1, s + dt * 6 + (1 - s) * dt * 10));
      if (p.pop > 0) { p.pop -= dt; const k = 1 + Math.sin(p.pop * 60) * p.pop * 0.5; p.mesh.scale.set(k, 1 / k, k); if (p.pop <= 0) p.mesh.scale.setScalar(1); }
      const [w, d] = footprint(p.type, p.rot);
      const own = new Set(p.boxes);
      let sup = 0;
      for (const b of this.world.allBoxes()) {
        if (own.has(b) || b.wall) continue;
        if (b.x1 > p.x - w / 2 + 0.01 && b.x0 < p.x + w / 2 - 0.01 && b.z1 > p.z - d / 2 + 0.01 && b.z0 < p.z + d / 2 - 0.01 && b.y1 <= p.y + 0.05 && b.y1 > sup) sup = b.y1;
      }
      if (sup < p.y - 0.01) {
        p.fallV += 22 * dt; p.y = Math.max(sup, p.y - p.fallV * dt);
        if (p.y <= sup) { p.y = sup; if (p.fallV > 4) this.onLand && this.onLand(p); p.fallV = 0; }
        p.mesh.position.y = p.y; this.setBoxes(p); moved = true;
      }
    }
    return moved;
  }

  // ---- the planner: used by bots and by the AUTO button. Templates are written
  // for team 0 (z<0) as (x, distance-from-centre); team 1 is mirrored.
  plan(team, budget, seed) {
    const r = rng(seed || 1 + Math.floor(Math.random() * 1e6));
    const T = [
      [['wall', 0, -8, 5], ['wall', 0, 0, 6], ['wall', 0, 8, 5]],
      [['block', 0, -5, 9], ['block', 0, -3, 9], ['stairs', 0, -4, 12], ['wall', 0, -4, 8.5]],
      [['block', 0, 7, 11], ['block', 0, 7, 4], ['plank', 0, 7, 7.5], ['ramp', 0, 7, 14]],
      [['block', 0, -12, 6], ['block', 0, 12, 7], ['wall', 1, 2, 10]],
      [['wall', 0, -3, 4], ['wall', 0, 3, 4], ['block', 0, 0, 14]],
      [['stairs', 1, 11, 15], ['block', 0, 14, 15], ['block', 0, 14, 13]],
    ];
    // shuffle templates, flip x randomly per template
    const order = T.map((t, i) => [r(), t]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    const out = []; let left = budget;
    for (const tpl of order) {
      const fx = r() > 0.5 ? -1 : 1;
      for (const [type, rot, x, d] of tpl) {
        const P = PIECES[type]; if (P.cost > left) continue;
        let rr = rot; if (fx < 0 && rot % 2 === 1) rr = (rot + 2) % 4;
        const X = team === 0 ? x * fx : -x * fx, Z = team === 0 ? -d : d;
        const R = team === 0 ? rr : (rr + 2) % 4;
        out.push([type, R, X, Z]); left -= P.cost;
      }
      if (left <= 0) break;
    }
    // spend leftovers on scattered cover
    for (let k = 0; k < 40 && left > 0; k++) {
      const type = r() > 0.5 ? 'block' : 'wall'; const x = (r() - 0.5) * 30, d = 4 + r() * 14;
      out.push([type, r() > 0.7 ? 1 : 0, x, team === 0 ? -d : d]); left -= 1;
    }
    return out;
  }
}
