// TORONTO street life (used by toronto.js): every ordinary building gets a way in (a street door, ground-floor
// windows, a simple interior; low ones are hollow to the roof with a ladder up through a roof hatch), neon shop
// signs and awnings, traffic on the streets, pedestrians (civilians who flee violence), and TAXIS: walk up to a taxi
// stand and press T, pick a destination (1-5), a short ride cutscene, you get out at the door.
import * as THREE from 'three';

const hasDoc = typeof document !== 'undefined' && !!document.createElement;
const SHOPS = [['DELI', '#ff4d6d'], ['PHARMACY', '#3dff9a'], ['BAR', '#ff3df0'], ['NOODLES', '#ffb33d'], ['CAFE', '#3dd7ff'], ['PAWN', '#ffe14d'], ['LAUNDRY', '#8f7dff'], ['24H', '#ff6a3d']];
const AWN = [0x9b2226, 0x005f73, 0xca6702, 0x2a9d8f, 0x6a4c93, 0x3a5a40];
const CARCOL = [0x9b2226, 0x1d3557, 0xe9ecef, 0x2b2d42, 0x6c757d, 0x3a5a40, 0xbc6c25, 0x111111];
const FH = 4.2;

function signAtlas() {
  if (!hasDoc) return null;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  SHOPS.forEach(([t, col], i) => {
    const y = i * 64; g.fillStyle = '#0b0b10'; g.fillRect(4, y + 4, 504, 56);
    g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 256, y + 33); g.shadowBlur = 0;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildLife(L, M, o) {
  const { enter, walls, roofs, solidAt, Quads, PLAY, roads, stands } = o;
  const life = { cars: [], taxis: [], stands: [], doors: [] };
  // ---------------- enterable buildings ----------------
  const sign = new Quads(), awn = new Quads(), lamp = new Quads();
  let k = 0;
  for (const [x0, z0, x1, z1, h] of enter) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, low = h <= 9, top = low ? h : FH;
    // the street side: the first side with open ground in front of it
    const sides = [['+z', cx, z1 + 1.5], ['-z', cx, z0 - 1.5], ['+x', x1 + 1.5, cz], ['-x', x0 - 1.5, cz]];
    const side = (sides.find(s => !solidAt(s[1], s[2])) || sides[0])[0];
    const tint = 0.74 + (((h * 7919) % 97) / 97) * 0.3;
    if (!low) { walls.box(x0, z0, x1, z1, FH, h, { col: tint, topTo: roofs, st: 6, bottom: true }); L.box(cx, FH, cz, w, h - FH, d, { visible: false }); }
    for (const sd of ['+z', '-z', '+x', '-x']) {
      const ax = sd[1] === 'z' ? 'x' : 'z', at = sd === '+z' ? z1 - 0.2 : sd === '-z' ? z0 + 0.2 : sd === '+x' ? x1 - 0.2 : x0 + 0.2;
      const a = ax === 'x' ? x0 : z0, b = ax === 'x' ? x1 : z1, len = b - a, mid = a + len / 2, gaps = [];
      if (sd === side) { gaps.push([mid, 2.2, 0, 2.8]); if (len > 9) { gaps.push([a + len * 0.2, 2.4, 0.9, 2.9], [a + len * 0.8, 2.4, 0.9, 2.9]); } }
      else if (len > 10 && (k + sd.length) % 2) gaps.push([mid, 2.0, 1.0, 2.8]);
      M.wallG(L, ax, at, a, b, 0, top, gaps, { mat: 'concrete' });
      for (const [c, gw, gy0, gy1] of gaps) {
        const px = ax === 'x' ? c : at, pz = ax === 'x' ? at : c;
        if (gy0 === 0) L.door(px, pz, { axis: ax, w: gw, h: gy1, auto: true });
        else L.window(px, pz, { axis: ax, w: gw, h: gy1 - gy0, y: gy0 });
      }
      if (sd === side) { // neon sign over the door, a coloured awning
        const n = (k * 5 + 3) % SHOPS.length, v0 = 1 - (n + 1) / 8, v1 = 1 - n / 8, nx = sd === '+z' ? [0, 0, 1] : sd === '-z' ? [0, 0, -1] : sd === '+x' ? [1, 0, 0] : [-1, 0, 0];
        const out = 0.28, sw = 2.6, y0 = 3.05, y1 = 3.75, p = (u, y) => ax === 'x' ? [mid + u, y, at + nx[2] * out] : [at + nx[0] * out, y, mid + u];
        const flip = (sd === '-z' || sd === '+x') ? -1 : 1;
        sign.quad(p(-sw / 2 * flip, y0), p(sw / 2 * flip, y0), p(sw / 2 * flip, y1), p(-sw / 2 * flip, y1), nx, [0, v0, 1, v0, 1, v1, 0, v1]);
        if (len > 9) { const aw = Math.min(len * 0.8, 9), q = (u, y, o2) => ax === 'x' ? [mid + u, y, at + nx[2] * o2] : [at + nx[0] * o2, y, mid + u];
          awn.quad(q(-aw / 2 * flip, 3.0, 0.2), q(aw / 2 * flip, 3.0, 0.2), q(aw / 2 * flip, 2.6, 1.4), q(-aw / 2 * flip, 2.6, 1.4), [nx[0] * 0.5, 0.86, nx[2] * 0.5], null, (k % AWN.length) + 1); }
      }
    }
    // inside: a ceiling (low ones: the roof with a hatch and a ladder), counters / shelves / tables, a light panel
    if (low) { const hx = x0 + 1.6, hz = z0 + 1.6; M.slab(L, [x0, z0, x1, z1], h, 0.3, [[hx - 0.8, hz - 0.8, hx + 0.8, hz + 0.8]]); L.ladder(hx + 0.8, hz, { face: '-x', y1: h }); M.bx(L, hx + 0.95, 0, hz, 0.3, h - 0.3, 1.6, { mat: 'concrete', tile: 2 }); }
    let s = k * 9301 + 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 3; i++) { const px = x0 + 2.5 + r() * (w - 5), pz = z0 + 2.5 + r() * (d - 5); if (Math.hypot(px - (x0 + 1.6), pz - (z0 + 1.6)) < 2.5) continue; M.bx(L, px, 0, pz, i ? 1.2 : 3.2, i ? 1.9 : 1.0, i ? 3 : 1.1, { mat: i ? 'paintDark' : 'paint', cover: true, tile: 1.2 }); }
    lamp.box(cx - 1.2, cz - 0.3, cx + 1.2, cz + 0.3, top - 0.36, top - 0.3, { su: 1, sv: 1, st: 1 });
    k++;
  }
  const sm = new THREE.MeshBasicMaterial({ map: signAtlas(), toneMapped: false, side: THREE.DoubleSide }); const sgm = sign.mesh(sm); sgm.castShadow = false; L.deco(sgm);
  if (awn.c.length) { const cols = awn.c; for (let i = 0; i < cols.length; i += 3) { const c = new THREE.Color(AWN[(cols[i] - 1) % AWN.length]); cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; } }
  L.deco(awn.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })));
  L.deco(lamp.mesh(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 1.6 }))).castShadow = false;

  // ---------------- traffic: cars on the wide streets, out and back along each road ----------------
  const lanes = roads.filter(r => r.w >= 10 && r.p.length >= 2).map(r => r.p).filter(p => p.some(([x, z]) => x > PLAY[0] && x < PLAY[2] && z > PLAY[1] && z < PLAY[3]));
  const carMesh = (col, taxi) => {
    const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.4 }), dark = L.mat('black');
    const add = (m, w, hh, d, y, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(0, y, z); b.castShadow = true; g.add(b); return b; };
    add(body, 1.9, 0.7, 4.4, 0.6); add(new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6 }), 1.7, 0.55, 2.3, 1.22, -0.2);
    for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10), dark); wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.34, z); g.add(wh); }
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), tl = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    for (const x of [-0.65, 0.65]) { add(hl, 0.3, 0.14, 0.05, 0.7, 2.22); add(tl, 0.3, 0.12, 0.05, 0.7, -2.22); }
    if (taxi) { const tc = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe14d })); tc.position.set(0, 1.58, -0.2); g.add(tc); }
    L.deco(g); return g;
  };
  for (let i = 0; i < 16 && lanes.length; i++) {
    const p = lanes[i % lanes.length], taxi = i % 4 === 0;
    const C = { g: carMesh(taxi ? 0xf2c200 : CARCOL[i % CARCOL.length], taxi), p, seg: 0, t: (i * 0.37) % 1, dir: i % 2 ? 1 : -1, v: 0, vmax: 8 + (i % 3) * 2 };
    if (C.dir < 0) C.seg = p.length - 2;
    life.cars.push(C);
  }
  // ---------------- pedestrians: civilians walking the sidewalks ----------------
  const walk = [];
  for (const p of lanes) for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], l = Math.hypot(bx - ax, bz - az); if (l < 30) continue;
    const nx = -(bz - az) / l, nz = (bx - ax) / l, off = 8.5;
    const A = [ax + nx * off, az + nz * off], B = [bx + nx * off, bz + nz * off];
    if ([A, B].every(q => q[0] > PLAY[0] + 4 && q[0] < PLAY[2] - 4 && q[1] > PLAY[1] + 4 && q[1] < PLAY[3] - 4 && !solidAt(q[0], q[1]))) walk.push([A, B]);
  }
  for (let i = 0; i < Math.min(16, walk.length); i++) {
    const [A, B] = walk[(i * 7) % walk.length];
    L.enemy('scientist', A[0], A[1], { patrol: [[A[0], A[1], 1 + (i % 3)], [B[0], B[1], 1]], tag: 'civ', outfit: 'civilian', hp: 30 });
  }
  // ---------------- taxi stands ----------------
  for (const s of stands) {
    const [x, z, name] = s;
    M.bx(L, x, 0, z, 0.14, 3.2, 0.14, { mat: 'steel', tile: 1 });
    const pl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0xffe14d })); pl.position.set(x, 3.0, z); L.deco(pl);
    const t = carMesh(0xf2c200, true); t.position.set(x + 2.6, 0, z); life.stands.push({ x, z, name, car: t });
  }
  return life;
}

// per frame: cars along their roads (brake for people in front), a bump knocks the hero down
export function updateLife(L, life, dt) {
  const h = L.hero, v = new THREE.Vector3();
  for (const C of life.cars) {
    const p = C.p, i = C.seg, a = p[i], b = p[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    const f = C.dir > 0 ? C.t : 1 - C.t, lane = 2.2 * C.dir, x = a[0] + (b[0] - a[0]) * C.t - uz * lane, z = a[1] + (b[1] - a[1]) * C.t + ux * lane;
    const fx = ux * C.dir, fz = uz * C.dir;
    let block = false; // anyone 2-9 m ahead in the lane
    for (const q of [h.pos, ...L.G.enemies.filter(e => e.alive).map(e => e.pos)]) { const dx = q.x - x, dz = q.z - z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); if (ahead > 1 && ahead < 9 && side < 1.6 && q.y < 2) { block = true; break; } }
    C.v += ((block ? 0 : C.vmax) - C.v) * Math.min(1, dt * (block ? 4 : 0.8));
    C.t += C.dir * C.v * dt / l;
    if (C.t > 1 || C.t < 0) { C.seg += C.dir; if (C.seg < 0 || C.seg > p.length - 2) { C.dir *= -1; C.seg = Math.max(0, Math.min(p.length - 2, C.seg)); } C.t = C.dir > 0 ? 0 : 1; }
    C.g.position.set(x, 0, z); C.g.rotation.y = Math.atan2(fx, fz);
    if (C.v > 3 && !h.dead && h.pos.y < 1.5) { v.set(h.pos.x - x, 0, h.pos.z - z); if (v.length() < 1.7) { v.normalize(); h.damage(12, v.clone().negate(), null, {}); h.vel.x = v.x * 9; h.vel.z = v.z * 9; h.vel.y = 4; h.grounded = false; C.v = 0; } }
    void f;
  }
}
