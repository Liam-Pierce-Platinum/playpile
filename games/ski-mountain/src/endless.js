// The course: one endless, procedurally generated run. A winding valley (random turns, rolls, steeper
// pitches the further you go) is built in 80 m chunks ahead of the rider and thrown away behind, so memory
// and frame time stay flat however long the run is. Each chunk owns its height grid (the physics reads the
// exact triangles that are drawn), its trees, rocks, logs, snow fences, snowcats, huts, kickers and rails.
//
// THE LINE: a guaranteed clear path (an offset from the centerline, in 40 m segments) is generated first.
// Every blockage is placed around it, so there is never an unavoidable wall; kickers and rails sit ON it, and
// it holds still through a kicker's flight so the landing is clear. Gates of trees across the piste leave a
// gap at the line, so riding fast means constant weaving. Density and speed both climb with distance.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, smoothstep, makeRng, fbm, vnoise } from './util.js';
import { kickerH, kickerMesh, railMesh } from './world.js';

export const CL = 80, ST = 2, SEG = 70, MARGIN = 150, AHEAD = 12, BEHIND = 2, CELL = 8, LSEG = 40, NEAR = 2;
const ZR = 7000; // distance (m) over which the course reaches full difficulty (it keeps creeping after that)

export function makeEndless(scene, A) {
  const root = new THREE.Group(); scene.add(root);
  const chunks = new Map(), cells = new Map();
  let pts = [], prng = makeRng(1), seed = 1, segs = [], lrng = makeRng(2), hold = 0, fly = null;
  const E = { root, rails: [], kickers: [], obst: [], chunks, cells };

  // difficulty: 0 at the top, 1 at 7 km, keeps creeping up to 2
  const lv = (z) => clamp(z / ZR, 0, 2);
  const hw = (z) => 34 - 8 * clamp(z / ZR, 0, 1);
  E.lv = lv; E.hw = hw;
  // SPEED climbs with distance and never plateaus: the m/s cap is 38 (a real 137 km/h) at the top, ~46 at 1 km,
  // ~54 at 3 km, ~66 at 8 km, ~75 at 14 km (270 km/h), and still rising. Rush (more gravity, less drag) is set so normal
  // riding sits just under the cap; carving hard and hitting things is what slows you.
  E.cap = (z) => { z = Math.max(0, z); return 38 + 12 * Math.log(1 + z / 1200) + 0.5 * z / 1000; };
  E.rush = (z) => 0.85 + 0.45 * Math.log(1 + Math.max(0, z) / 1000);
  E.mult = (z) => 1 + Math.floor(Math.min(3, lv(z) * 2)) * 0.5; // trick multiplier x1 / x1.5 every 3.5 km, up to x2.5
  E.rate = (z) => 2 + Math.max(0, z) / 1500; // distance points per metre: 2 at the top, 4 at 3 km, 7.3 at 8 km

  // ---- centerline: control points every SEG m, a damped random walk of headings (sharper turns later) ----
  function genPts(n) {
    while (pts.length <= n) {
      const i = pts.length;
      if (i < 4) { pts.push({ x: 0, h: 0 }); continue; }
      const L = Math.min(1, lv(i * SEG)), amp = 0.3 + 0.24 * L, prev = pts[i - 1];
      let h = prev.h * 0.35 + (prng() - 0.5) * 2 * amp;
      if (Math.abs(prev.x) > 600) h -= Math.sign(prev.x) * 0.15; // drift back toward x = 0 now and then
      h = clamp(h, -0.58, 0.58);
      pts.push({ x: prev.x + h * SEG, h });
    }
  }
  function cx(z) {
    if (z <= 0) return 0;
    const f = z / SEG, i = Math.floor(f), t = f - i; genPts(i + 2);
    const p0 = pts[Math.max(0, i - 1)].x, p1 = pts[i].x, p2 = pts[i + 1].x, p3 = pts[i + 2].x, t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  E.cx = cx;
  E.yaw = (z) => Math.atan2(cx(z + 2) - cx(z - 2), 4);

  // ---- the line: segment kinds 'warm' (start), 'slalom' (shifts across), 'jump' (kicker), 'hold' (the
  // kicker's flight: the line runs dead straight from the lip, as you fly), 'rail' (a rail / log / fence to grind) ----
  const flyS = (f, z) => f.x0 + (z - f.z0) * f.sl - cx(z);
  function genSegs(n) {
    while (segs.length <= n) {
      const i = segs.length, z = i * LSEG, L = Math.min(1, lv(z)), s0 = i ? segs[i - 1].s1 : 0, w = hw(z) * 0.6;
      let kind = 'slalom', s1 = s0, f = null;
      if (z < 160) kind = 'warm';
      else if (hold > 0) { kind = 'hold'; hold--; f = fly; s1 = flyS(f, z + LSEG); }
      else {
        const r = lrng();
        if (r < 0.32 + 0.12 * L) { // a kicker 26 m into the segment; only where the straight flight stays well inside the piste
          const zl = z + 26, sl = Math.tan(E.yaw(zl)), x0 = cx(zl) + s0, n = Math.ceil((2.6 * E.cap(z) + 10) / LSEG);
          let ok = true; for (let zz = zl; zz <= z + (n + 1) * LSEG; zz += 8) if (Math.abs(x0 + (zz - zl) * sl - cx(zz)) > hw(zz) * 0.7) { ok = false; break; }
          if (ok) { kind = 'jump'; f = fly = { x0, z0: zl, sl }; hold = n; s1 = flyS(f, z + LSEG); }
        } else if (r < 0.48 + 0.12 * L) kind = 'rail';
        if (kind === 'slalom') { // the faster the course, the gentler each shift (the gates still force the weave)
          const mx = (8 + 4 * L) * Math.min(1, Math.pow(44 / E.cap(z), 1.5)), sh = mx * (0.45 + 0.55 * lrng()) * (lrng() < 0.5 ? -1 : 1);
          s1 = clamp(s0 + sh, -w, w); if (Math.abs(s1 - s0) < mx * 0.4) s1 = clamp(s0 - sh, -w, w);
        }
      }
      segs.push({ i, z, s0, s1, kind, fly: f });
    }
  }
  const segAt = (z) => { const i = Math.max(0, Math.floor(z / LSEG)); genSegs(i); return segs[i]; };
  E.line = (z) => {
    const g = segAt(z);
    if (g.fly) return z >= g.fly.z0 ? flyS(g.fly, z) : g.s0;
    return g.kind === 'rail' ? g.s0 : g.s0 + (g.s1 - g.s0) * smoothstep(0, 1, (z - g.z) / LSEG);
  };
  E.lineX = (z) => cx(z) + E.line(z);
  E.segAt = segAt;
  // half-width of the clear gap around the line: 5.8 m at the top, 4.8 m from ~8 km; wider where you fly or grind
  const gapHalf = (z) => { const g = segAt(z); return lerp(5.8, 4.8, clamp(lv(z) / 1.15, 0, 1)) + (g.kind === 'hold' ? 4 : g.kind === 'jump' || g.kind === 'rail' ? 2.5 : 0); };
  E.gapHalf = gapHalf;

  // ---- profile: the fall line steepens slowly; rolls give steeper pitches and flatter run-outs ----
  const S0 = 0.235, S1 = 0.32;
  function baseY(z) {
    if (z < 0) return 0.3 * -z;
    const y = z <= ZR ? S0 * z + (S1 - S0) * z * z / (2 * ZR) : S0 * ZR + (S1 - S0) * ZR / 2 + S1 * (z - ZR);
    // rolls flatten as the course speeds up, so crests do not throw you 100 m at 250 km/h
    const r = smoothstep(0, 160, z) * ((3 + 2 * Math.min(1, lv(z))) * clamp(Math.pow(48 / E.cap(z), 2), 0.3, 1) * Math.sin(z / 33) + 2.4 * Math.sin(z / 57 + 1.3));
    return -(y + r);
  }
  // cross-section: a gentle bowl on the piste, banked walls that steepen into ridges
  function H(x, z, c, w) {
    const d = x - c, ad = Math.abs(d), q = Math.min(ad, w) / w;
    let h = baseY(z) + 2.5 * q * q + 0.35 * fbm(x * 0.06, z * 0.06, 2);
    const e = ad - w;
    if (e > 0) h += e * 0.36 + e * e * 0.005 + smoothstep(0, 30, e) * 9 * fbm(x * 0.015, z * 0.015, 3);
    return h;
  }
  const Hq = (x, z) => H(x, z, cx(z), hw(z));

  // ---- physics lookups (exact triangles of the drawn grid; analytic outside the loaded chunks) ----
  E.terrainH = (x, z) => {
    const ch = chunks.get(Math.floor(z / CL)); if (!ch) return Hq(x, z);
    let fx = (x - ch.x0) / ST + 1, fz = (z - ch.z0) / ST + 1;
    if (fx < 1 || fx > ch.nx - 2.001) return Hq(x, z);
    fz = clamp(fz, 1, ch.nz - 2.001);
    const i = fx | 0, j = fz | 0, n = ch.nx, G = ch.HG; fx -= i; fz -= j;
    const a = G[j * n + i], b = G[j * n + i + 1], c = G[(j + 1) * n + i], d = G[(j + 1) * n + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
  E.groundH = (x, z) => {
    let h = E.terrainH(x, z);
    const ks = E.kickers;
    for (let i = 0; i < ks.length; i++) { const k = ks[i]; if (Math.abs(z - k.z) < k.len + 6 && Math.abs(x - k.x) < k.len + 6) h += kickerH(k, x, z); }
    return h;
  };
  const ckey = (cx2, cz) => cz * 65536 + (cx2 & 0xffff);
  E.collidersNear = (x, z, out) => {
    out.length = 0; const a0 = Math.floor(x / CELL), b0 = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = cells.get(ckey(a0 + a, b0 + b)); if (arr) for (const o of arr) out.push(o); }
    return out;
  };
  E.offTrack = (x, z) => Math.abs(x - cx(z)) > hw(z);

  // ---- chunk build / dispose ----
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), tc = new THREE.Color(), UPV = new THREE.Vector3(0, 1, 0), XV = new THREE.Vector3(1, 0, 0), dv = new THREE.Vector3();
  function addCol(ch, o) { const k = ckey(Math.floor(o.x / CELL), Math.floor(o.z / CELL)); let a = cells.get(k); if (!a) { cells.set(k, (a = [])); ch.keys.push(k); } a.push(o); }
  function inst(ch, geo, mat, list, shadow, colors) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, i) => { im.setMatrixAt(i, colors ? mm[0] : mm); if (colors) im.setColorAt(i, mm[1]); });
    im.castShadow = !!shadow; im.receiveShadow = shadow === 2; im.computeBoundingSphere(); ch.group.add(im); return im;
  }
  function build(c) {
    const z0 = c * CL, nz = CL / ST + 3, cxs = new Float64Array(nz), hws = new Float64Array(nz);
    let xmin = 1e9, xmax = -1e9;
    for (let j = 0; j < nz; j++) { const z = z0 + (j - 1) * ST; cxs[j] = cx(z); hws[j] = hw(z); xmin = Math.min(xmin, cxs[j]); xmax = Math.max(xmax, cxs[j]); }
    const x0 = Math.floor((xmin - MARGIN) / ST) * ST, nx = Math.round((Math.ceil((xmax + MARGIN) / ST) * ST - x0) / ST) + 3;
    const HG = new Float32Array(nx * nz); // one extra row/column all round (for seamless normals)
    for (let j = 0; j < nz; j++) { const z = z0 + (j - 1) * ST; for (let i = 0; i < nx; i++) HG[j * nx + i] = H(x0 + (i - 1) * ST, z, cxs[j], hws[j]); }
    const rng = makeRng(seed * 7919 + c * 104729 + 17);
    const ch = { c, z0, x0, nx, nz, HG, group: new THREE.Group(), kickers: [], rails: [], obst: [], keys: [], lod: [] };
    chunks.set(c, ch); root.add(ch.group);
    // terrain mesh (inner grid only)
    const rows = nz - 2, cols = nx - 2, n = rows * cols;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), nv = new THREE.Vector3();
    for (let jj = 0; jj < rows; jj++) for (let ii = 0; ii < cols; ii++) {
      const j = jj + 1, i = ii + 1, o = jj * cols + ii, x = x0 + ii * ST, z = z0 + jj * ST, y = HG[j * nx + i];
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z; uv[o * 2] = x / 9; uv[o * 2 + 1] = z / 9;
      nv.set(HG[j * nx + i - 1] - HG[j * nx + i + 1], 2 * ST, HG[(j - 1) * nx + i] - HG[(j + 1) * nx + i]).normalize();
      nor[o * 3] = nv.x; nor[o * 3 + 1] = nv.y; nor[o * 3 + 2] = nv.z;
      const d = Math.abs(x - cxs[j]) / hws[j], piste = smoothstep(1.15, 0.85, d);
      const rock = smoothstep(0.8, 0.62, nv.y + 0.06 * vnoise(x * 0.2, z * 0.2)), rv = 0.36 + 0.08 * vnoise(x * 0.3, z * 0.3);
      const sr = 0.86 + 0.125 * piste, sg = 0.91 + 0.08 * piste;
      col[o * 3] = sr + (rv - sr) * rock; col[o * 3 + 1] = sg + (rv + 0.01 - sg) * rock; col[o * 3 + 2] = 1 + (rv + 0.05 - 1) * rock;
    }
    const idx = new Uint16Array((rows - 1) * (cols - 1) * 6); let k = 0;
    for (let jj = 0; jj < rows - 1; jj++) for (let ii = 0; ii < cols - 1; ii++) { const a = jj * cols + ii, b = a + 1, cc = a + cols, d = cc + 1; idx[k++] = a; idx[k++] = cc; idx[k++] = b; idx[k++] = b; idx[k++] = cc; idx[k++] = d; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
    const tm = new THREE.Mesh(g, A.tmat); tm.receiveShadow = true; ch.group.add(tm);

    const tang = (z) => { const y = E.yaw(z); return [Math.sin(y), Math.cos(y)]; };
    // ---- features on the line: kickers and rails (from the segments that start in this chunk) ----
    genSegs(Math.ceil((z0 + CL) / LSEG) + 1);
    for (let i = Math.max(0, Math.ceil(z0 / LSEG)); i * LSEG < z0 + CL; i++) {
      const sg = segs[i], L = Math.min(1.3, lv(sg.z));
      if (sg.kind === 'jump') {
        const z = sg.z + 26, [dx, dz] = tang(z);
        const kk = { x: sg.fly.x0, z, dx, dz, hgt: (1.4 + 1.0 * L) * (0.9 + rng() * 0.25), len: 7.5 + 2.5 * Math.min(1, L), wid: 7 };
        ch.kickers.push(kk);
      } else if (sg.kind === 'rail') {
        const r = rng(), type = r < 0.6 ? 'rail' : r < 0.82 ? 'log' : 'fence', len = type === 'rail' ? 14 + rng() * 6 : 11 + rng() * 4, z = sg.z + 8;
        const [ux, uz] = tang(z + len / 2), ax = cx(z) + sg.s0, az = z, bx = ax + ux * len, bz = az + uz * len, top = type === 'rail' ? 0.55 : type === 'log' ? 0.7 : 0.75;
        ch.rails.push({ type, top, ax, az, ay: 0, bx, bz, by: 0, len, ux, uz });
      }
    }
    // register the kickers before sampling rail heights / building meshes on them
    E.kickers.push(...ch.kickers);
    for (const r of ch.rails) { r.ay = E.terrainH(r.ax, r.az) + r.top; r.by = E.terrainH(r.bx, r.bz) + r.top; railMesh(r, ch.group); }
    for (const kk of ch.kickers) kickerMesh(kk, ch.group, A.kmat, 0xff5a1f);
    E.rails.push(...ch.rails);

    // ---- blockages around the line ----
    const trees = [], rocks = [], logs = [], fence = [], cats = [], huts = [], gpoles = [];
    const busy = []; // occupied spots on the piste (x, z, r), so things do not overlap
    const free = (x, z, r) => { for (const b of busy) if (Math.abs(b.z - z) < r + b.r && Math.hypot(b.x - x, b.z - z) < r + b.r) return false; return true; };
    const onLine = (x, z, r) => Math.abs(x - E.lineX(z)) < gapHalf(z) + r;
    const slopeOk = (x, z) => { const e = 0.6, ny = 2 * e / Math.hypot(E.terrainH(x + e, z) - E.terrainH(x - e, z), 2 * e, E.terrainH(x, z + e) - E.terrainH(x, z - e)); return ny > 0.72; };
    const tree = (x, z, inTrack, s = 0.75 + rng() * 0.75) => {
      if (inTrack && (onLine(x, z, 0.9) || !free(x, z, 0.8))) return false;
      if (!slopeOk(x, z)) return false;
      const h = E.terrainH(x, z);
      pp.set(x, h - 0.2, z); q4.setFromAxisAngle(UPV, rng() * 6.28); sc.set(s * (0.9 + rng() * 0.2), s * (0.85 + rng() * 0.4), s * (0.9 + rng() * 0.2));
      const v = 0.85 + rng() * 0.25; trees.push([m4.compose(pp, q4, sc).clone(), tc.setRGB(v, v * (0.95 + rng() * 0.1), v).clone()]);
      const o = { x, z, y0: h - 1, y1: h + 7.5 * sc.y, r: 0.55 * s, kind: 'tree' }; addCol(ch, o);
      if (inTrack) { ch.obst.push(o); busy.push({ x, z, r: 0.6 * s }); }
      return true;
    };
    const rock = (x, z, s, inTrack) => {
      if (inTrack && (onLine(x, z, s) || !free(x, z, s))) return false;
      const h = E.terrainH(x, z);
      pp.set(x, h + s * 0.1, z); q4.setFromEuler(new THREE.Euler(rng() * 0.4, rng() * 6.28, rng() * 0.4)); sc.set(s, s * (0.7 + rng() * 0.5), s);
      rocks.push(m4.compose(pp, q4, sc).clone()); const o = { x, z, y0: h - 1, y1: h + s * 0.75, r: s * 0.9, kind: 'rock' }; addCol(ch, o);
      if (inTrack) { ch.obst.push(o); busy.push({ x, z, r: s }); }
      return true;
    };
    // a straight blockage from lateral offset a to b at row z (log or snow fence; both can be jumped)
    const span = (z, a, b, kind) => {
      const c0 = cx(z), xa = c0 + a, za = z, xb = c0 + b, zb = z, len = Math.hypot(xb - xa, zb - za);
      if (len < 2.5) return;
      if (kind === 'log') {
        for (let s0 = 0; s0 < len - 1; s0 += 9) {
          const s1 = Math.min(len, s0 + 9), t0 = s0 / len, t1 = s1 / len, ax = xa + (xb - xa) * t0, az = za + (zb - za) * t0, bx = xa + (xb - xa) * t1, bz = za + (zb - za) * t1;
          const ay = E.terrainH(ax, az) + 0.32, by = E.terrainH(bx, bz) + 0.32;
          dv.set(bx - ax, by - ay, bz - az); const l = dv.length(); q4.setFromUnitVectors(XV, dv.normalize());
          pp.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); sc.set(l, 1, 1); logs.push(m4.compose(pp, q4, sc).clone());
        }
      } else {
        const yaw = Math.atan2(-(zb - za), xb - xa); q4.setFromAxisAngle(UPV, yaw);
        for (let s = 0.5; s < len; s += 1) { const t = s / len, x = xa + (xb - xa) * t, zz = za + (zb - za) * t; pp.set(x, E.terrainH(x, zz) - 0.05, zz); sc.set(1, 1, 1); fence.push(m4.compose(pp, q4, sc).clone()); }
      }
      const y1 = kind === 'log' ? 0.95 : 1.3, r = kind === 'log' ? 0.5 : 0.35;
      for (let s = 0; s <= len; s += 0.9) { const t = s / len, x = xa + (xb - xa) * t, zz = za + (zb - za) * t, h = E.terrainH(x, zz); const o = { x, z: zz, y0: h - 1, y1: h + y1, r, kind }; addCol(ch, o); ch.obst.push(o); }
      busy.push({ x: (xa + xb) / 2, z: (za + zb) / 2, r: len / 2 });
    };
    const bigThing = (z, s, kind) => {
      const [dx, dz] = tang(z), x = cx(z) + s, zz = z, h = E.terrainH(x, zz), R = kind === 'cat' ? 3.4 : 3.8;
      if (onLine(x, zz, R) || !free(x, zz, R)) return false;
      const yaw = Math.atan2(dx, dz) + (kind === 'cat' ? (rng() - 0.5) * 1.2 + (rng() < 0.5 ? Math.PI / 2 : 0) : rng() * 6.28);
      q4.setFromAxisAngle(UPV, yaw); pp.set(x, h - 0.15, zz); sc.set(1, 1, 1); (kind === 'cat' ? cats : huts).push(m4.compose(pp, q4, sc).clone());
      if (kind === 'cat') { const fx = Math.sin(yaw), fz = Math.cos(yaw); for (const u of [-1.9, 0, 1.9]) { const o = { x: x + fx * u, z: zz + fz * u, y0: h - 1, y1: h + 3.3, r: 1.75, kind }; addCol(ch, o); ch.obst.push(o); } }
      else { const o = { x, z: zz, y0: h - 1, y1: h + 6, r: 3.6, kind }; addCol(ch, o); ch.obst.push(o); }
      busy.push({ x, z: zz, r: R }); return true;
    };
    // the kickers and rails need their run-in and lips clear of everything else
    for (const kk of ch.kickers) busy.push({ x: kk.x - kk.dx * kk.len / 2, z: kk.z - kk.dz * kk.len / 2, r: kk.len / 2 + 4 });
    for (const r of ch.rails) for (let t = 0; t <= 1; t += 0.25) busy.push({ x: r.ax + (r.bx - r.ax) * t, z: r.az + (r.bz - r.az) * t, r: 3.2 });

    if (z0 >= 160) {
      const L = lv(z0), Lc = Math.min(1, L);
      // GATES: rows across the piste every ~0.55-0.9 s of riding, each leaving one gap at the line
      const rowSp = clamp(E.cap(z0) * lerp(0.9, 0.55, Lc), 22, 38);
      for (let z = z0 + 4 + rng() * rowSp * 0.6; z < z0 + CL - 2; z += rowSp * (0.85 + rng() * 0.3)) {
        const w = hw(z), ls = E.line(z), gh = gapHalf(z), at = (s) => [cx(z) + s, z];
        const r = rng(), side = rng() < 0.5 ? -1 : 1; // side = the half that gets the blockage on one-sided rows
        const fillTrees = (a, b, step = 2.7) => { for (let s = a; s <= b; s += step * (0.85 + rng() * 0.3)) { const [x, zz] = at(s + (rng() - 0.5) * 0.8); tree(x, zz + (rng() - 0.5) * 1.6, true); } };
        const left = [-w - 1, ls - gh - 0.6], right = [ls + gh + 0.6, w + 1];
        const pole = (s) => { const [x, zz] = at(s); gpoles.push(m4.makeTranslation(x, E.terrainH(x, zz) - 0.1, zz).clone()); };
        if (r < 0.4 + 0.2 * Lc) { // a full wall of trees with one gap (two staggered lines further down)
          fillTrees(...left); fillTrees(...right);
          if (L > 0.35 && rng() < 0.55) { const z2 = z + 2.6; if (z2 < z0 + CL) { const ls2 = E.line(z2), g2 = gapHalf(z2), at2 = (s) => [cx(z2) + s, z2]; for (const [a, b] of [[-w - 1, ls2 - g2 - 0.6], [ls2 + g2 + 0.6, w + 1]]) for (let s = a + 1.3; s <= b; s += 2.7) { const [x, zz] = at2(s); tree(x, zz, true); } } }
          pole(ls - gh + 0.2); pole(ls + gh - 0.2);
        } else if (r < 0.58 + 0.12 * Lc) { // a slalom gate: trees from one edge to the gap
          fillTrees(...(side < 0 ? left : right)); pole(side < 0 ? ls - gh + 0.2 : ls + gh - 0.2);
        } else if (r < 0.68 + 0.1 * Lc) { // a rock band
          for (const [a, b] of [left, right]) for (let s = a; s <= b; s += 3.2 + rng() * 1.5) { const [x, zz] = at(s); rock(x, zz + (rng() - 0.5) * 2, 0.8 + rng() * 1.2, true); }
        } else if (r < 0.78 + 0.06 * Lc) { // a fallen log across one side (jump it or go round), trees on the rest
          const [a, b] = side < 0 ? left : right, l = Math.min(b - a, 8 + rng() * 9);
          if (side < 0) { span(z, b - l, b, 'log'); fillTrees(a, b - l - 1.5); } else { span(z, a, a + l, 'log'); fillTrees(a + l + 1.5, b); }
        } else if (r < 0.86 + 0.04 * Lc) { // an orange snow fence (jumpable with a full pop)
          const [a, b] = side < 0 ? left : right, l = Math.min(b - a, 7 + rng() * 10);
          if (side < 0) span(z, b - l, b, 'fence'); else span(z, a, a + l, 'fence');
          if (rng() < 0.5) fillTrees(...(side < 0 ? right : left));
        } else if (r < 0.94) { // a parked snowcat or a hut on one side
          const [a, b] = side < 0 ? left : right; if (b - a > 6) bigThing(z, side < 0 ? b - 3.8 - rng() * Math.max(0, b - a - 8) : a + 3.8 + rng() * Math.max(0, b - a - 8), rng() < 0.6 ? 'cat' : 'hut');
        } else { // a loose cluster
          for (let i = 0; i < 4 + rng() * 5; i++) { const s = (rng() - 0.5) * 2 * w, [x, zz] = at(s); tree(x, zz + (rng() - 0.5) * 6, true); }
        }
      }
      // loose trees between the gates, thicker with distance
      const nS = Math.round(10 + 14 * Math.min(1.6, L) + rng() * 4);
      for (let a = 0; a < nS; a++) { const z = z0 + rng() * CL, w = hw(z), s = (rng() - 0.5) * 2 * (w - 1); tree(cx(z) + s, z, true); }
    }
    // the banks: dense forest above the piste walls
    for (let a = 0; a < 150; a++) { const z = z0 + rng() * CL, w = hw(z), side = rng() < 0.5 ? -1 : 1, d = w + 3 + rng() * rng() * 110; tree(cx(z) + side * d, z, false); }
    for (let a = 0; a < 10; a++) { const z = z0 + rng() * CL, side = rng() < 0.5 ? -1 : 1; rock(cx(z) + side * (hw(z) + 6 + rng() * 60), z, 0.6 + rng() * rng() * 3, false); }

    // trees: a full mesh near the rider, a ~30-triangle stand-in further out (swapped in E.update)
    const thi = inst(ch, A.tgeo, A.tmatT, trees, 1, true), tlo = inst(ch, A.tgeoLo, A.tmatT, trees, 0, true);
    if (thi) { ch.lod.push([thi, tlo]); }
    inst(ch, A.rgeos[((c % 3) + 3) % 3], A.rmat, rocks, 2);
    if (logs.length) inst(ch, A.logGeo, A.tmatT, logs, 1);
    if (fence.length) inst(ch, A.fenceGeo, A.tmatT, fence, 1);
    if (cats.length) inst(ch, A.catGeo, A.tmatT, cats, 1);
    if (huts.length) inst(ch, A.hutGeo, A.tmatT, huts, 1);
    // piste poles both sides every 20 m (they whip past and sell the speed) + orange poles marking the gate gaps
    for (let z = z0 + 10; z < z0 + CL; z += 20) for (const s of [-1, 1]) { const x = cx(z) + s * (hw(z) + 1.5); gpoles.push(m4.makeTranslation(x, E.terrainH(x, z) - 0.1, z).clone()); }
    inst(ch, A.poleGeo, poleMat, gpoles, 0);
    E.obst.push(...ch.obst);
    setLod(ch, true);
    return ch;
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  function setLod(ch, near) {
    if (ch.near === near) return; ch.near = near;
    for (const [hi, lo] of ch.lod) { hi.visible = near; lo.visible = !near; }
  }
  function dispose(ch) {
    root.remove(ch.group);
    ch.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const k of ch.keys) cells.delete(k);
    chunks.delete(ch.c);
  }
  function relist() {
    E.rails.length = 0; E.kickers.length = 0; E.obst.length = 0;
    for (const ch of [...chunks.values()].sort((a, b) => a.c - b.c)) { E.rails.push(...ch.rails); E.kickers.push(...ch.kickers); E.obst.push(...ch.obst); }
  }
  // keep [cur - BEHIND, cur + AHEAD] built; at most `budget` new chunks per call (one per frame while riding)
  E.update = (z, budget = 1) => {
    const cur = Math.floor(z / CL); let changed = false;
    for (const ch of [...chunks.values()]) if (ch.c < cur - BEHIND || ch.c > cur + AHEAD + 2) { dispose(ch); changed = true; }
    if (changed) relist();
    for (let c = cur - BEHIND; c <= cur + AHEAD && budget > 0; c++) if (!chunks.has(c)) { build(c); budget--; }
    for (const ch of chunks.values()) setLod(ch, ch.c >= cur - 1 && ch.c <= cur + NEAR);
  };
  E.reset = (s) => {
    for (const ch of [...chunks.values()]) dispose(ch);
    relist(); cells.clear();
    seed = s >>> 0; prng = makeRng(seed ^ 0x9e3779b9); lrng = makeRng(seed ^ 0x51ed270b); pts = []; segs = []; hold = 0; fly = null;
    E.update(0, 99);
  };
  E.info = () => {
    let tris = 0;
    for (const ch of chunks.values()) ch.group.traverse((o) => { if (!o.isMesh || !o.visible) return; const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += t * (o.isInstancedMesh ? o.count : 1); });
    return { chunks: chunks.size, cells: cells.size, rails: E.rails.length, kickers: E.kickers.length, obst: E.obst.length, pts: pts.length, segs: segs.length, children: root.children.length, tris: Math.round(tris) };
  };
  return E;
}
