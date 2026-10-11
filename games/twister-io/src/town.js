// Seeded town layout: a block grid with zones (homes, main street, downtown,
// parks, a farm, docks + harbour, a stadium). Produces the painted ground
// canvas, the raised block slabs and a flat list of objects to place.
import { mulberry32 } from './rng.js';

export const PITCH = 30, BLOCK = 23, SLAB = 0.32;

export function genTown(seed, opt = {}) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const chance = (p) => rnd() < p;
  const N = opt.N || 8;
  const chase = !!opt.chase;
  const half = (N * PITCH) / 2;
  const edge = half + 3.5; // outer edge of the ring road
  const harbour = !chase;
  const waterZ = -edge - 4; // north of this is sea (harbour maps only)

  // ---- zones ----
  const zone = [...Array(N)].map(() => Array(N).fill('res'));
  let stad = null;
  if (chase) {
    zone[0][N - 1] = 'farm';
    zone[N - 1][0] = 'park';
    zone[1 + ((rnd() * (N - 2)) | 0)][1] = 'main';
  } else {
    for (let i = 0; i < N; i++) zone[i][0] = 'docks';
    const si = 1 + ((rnd() * (N - 3)) | 0), sj = 2 + ((rnd() * (N - 5)) | 0);
    stad = { i: si, j: sj };
    zone[si][sj] = zone[si + 1][sj] = zone[si][sj + 1] = zone[si + 1][sj + 1] = 'stadium';
    const fi = chance(0.5) ? 0 : N - 2;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (zone[fi + a][N - 2 + b] === 'res') zone[fi + a][N - 2 + b] = 'farm';
    let mc = 2 + ((rnd() * (N - 4)) | 0);
    for (let j = 1; j < N; j++) if (zone[mc][j] === 'res') zone[mc][j] = 'main';
    const cj = N >> 1;
    for (const [a, b] of [[-1, -1], [-1, 0], [1, -1], [1, 0], [-1, 1], [1, 1]]) {
      const i = mc + a, j = cj + b;
      if (i >= 0 && i < N && j > 0 && j < N && zone[i][j] === 'res') zone[i][j] = 'down';
    }
    let parks = 0, guard = 0;
    while (parks < 5 && guard++ < 100) {
      const i = (rnd() * N) | 0, j = 1 + ((rnd() * (N - 1)) | 0);
      if (zone[i][j] === 'res') { zone[i][j] = 'park'; parks++; }
    }
  }

  const objs = [];
  const put = (key, x, z, rot = R(0, Math.PI * 2), base = SLAB) => objs.push({ key, x, z, rot, base });
  const center = (i, j) => [(i + 0.5) * PITCH - half, (j + 0.5) * PITCH - half];
  const L = (cx, cz, q, lx, lz) => {
    const c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
    return [cx + lx * c - lz * s, cz + lx * s + lz * c];
  };
  const people = () => pick(['person_a', 'person_b', 'person_c']);
  const cars = () => pick(['car_coral', 'car_teal', 'car_mustard', 'car_white', 'car_blue']);
  const houses = () => pick(['house_coral', 'house_teal', 'house_mustard']);
  const shops = () => pick(['shop_a', 'shop_b', 'shop_c']);
  const towers = () => pick(['tower_a', 'tower_b', 'tower_c']);
  const K = (keys) => (typeof keys === 'function' ? keys() : pick(keys));
  const scatter = (cx, cz, n, keys, r = 9.5) => { for (let k = 0; k < n; k++) put(K(keys), cx + R(-r, r), cz + R(-r, r)); };
  const sidewalk = (cx, cz, n, keys) => {
    for (let k = 0; k < n; k++) {
      const [x, z] = L(cx, cz, (rnd() * 4) | 0, R(-10, 10), 10.8);
      put(K(keys), x, z);
    }
  };

  const blocks = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const z = zone[i][j];
    const [cx, cz] = center(i, j);
    if (z === 'stadium') {
      if (i === stad.i && j === stad.j) blocks.push({ x: cx + PITCH / 2, z: cz + PITCH / 2, w: BLOCK + PITCH, d: BLOCK + PITCH, zone: 'stadium' });
      continue;
    }
    blocks.push({ x: cx, z: cz, w: BLOCK, d: BLOCK, zone: z });
    if (z === 'res') {
      for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const hx = cx + qx * 5.2, hz = cz + qz * 4.6;
        put(houses(), hx, hz, (qz > 0 ? 0 : Math.PI) + R(-0.04, 0.04));
        if (chance(0.6)) put(cars(), cx + qx * 2.6, cz + qz * 8.2, Math.PI / 2 + R(-0.08, 0.08));
        put('mailbox', hx + 1.4, cz + qz * 9.6, 0);
        for (let b = 0, nb = 1 + ((rnd() * 2) | 0); b < nb; b++) put('bin', hx + qx * 2.4, hz + qz * (b ? -0.4 : 0.6), 0);
        if (chance(0.75)) put(chance(0.7) ? 'tree' : 'pine', cx + qx * R(7.5, 8.8), cz + qz * R(0.6, 1.4));
        if (chance(0.7)) put('bush', hx + R(-1.5, 1.5), hz - qz * 2.5);
        if (chance(0.35)) put(people(), hx + R(-2, 2), cz + qz * R(7.5, 9));
        if (chance(0.2)) put('bike', hx - qx * 1.4, cz + qz * 7.3);
      }
      sidewalk(cx, cz, 2, ['hydrant', 'bin', 'cone']);
      sidewalk(cx, cz, 2 + ((rnd() * 2) | 0), people);
    } else if (z === 'down') {
      const q = (rnd() * 4) | 0;
      let [x, zz] = L(cx, cz, q, -5, -5); put(towers(), x, zz, q * Math.PI / 2);
      if (chance(0.6)) { [x, zz] = L(cx, cz, q, 5, -5); put(towers(), x, zz, q * Math.PI / 2); } else { [x, zz] = L(cx, cz, q, 5, -6); put(shops(), x, zz, q * Math.PI / 2 + Math.PI); }
      [x, zz] = L(cx, cz, q, -5, 5.5); put(shops(), x, zz, q * Math.PI / 2);
      [x, zz] = L(cx, cz, q, 5, 5.5); put(chance(0.5) ? shops() : 'kiosk', x, zz, q * Math.PI / 2);
      scatter(cx, cz, 4, people);
      scatter(cx, cz, 2, ['bench', 'bin', 'bike', 'cone']);
      sidewalk(cx, cz, 4, ['hydrant', 'bin', 'cone', 'cone']);
      sidewalk(cx, cz, 4, people);
    } else if (z === 'main') {
      for (const side of [-1, 1]) for (const t of [-6, 0, 6]) {
        put(chance(0.85) ? shops() : 'kiosk', cx + side * 6.6, cz + t, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      for (let k = 0; k < 5; k++) put(people(), cx + R(-3, 3), cz + R(-10, 10));
      for (let k = 0; k < 2; k++) put('bench', cx + R(-2.5, 2.5), cz + R(-9, 9), Math.PI / 2);
      for (let k = 0; k < 2; k++) put('bike', cx + R(-2.5, 2.5), cz + R(-9, 9));
      put('bin', cx + R(-2, 2), cz + R(-9, 9));
      put(chance(0.5) ? 'fountain' : 'kiosk', cx, cz + R(-2, 2), 0);
      sidewalk(cx, cz, 4, people);
      sidewalk(cx, cz, 3, ['cone', 'hydrant', 'bin']);
    } else if (z === 'park') {
      put('fountain', cx, cz, 0);
      for (let k = 0; k < 9; k++) { const a = R(0, 6.28), r = R(4.5, 9.5); put(chance(0.75) ? 'tree' : 'pine', cx + Math.cos(a) * r, cz + Math.sin(a) * r); }
      for (let k = 0; k < 6; k++) { const a = R(0, 6.28), r = R(3, 9.5); put('bush', cx + Math.cos(a) * r, cz + Math.sin(a) * r); }
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + R(0, 1); put('bench', cx + Math.cos(a) * 3.4, cz + Math.sin(a) * 3.4, -a - Math.PI / 2); }
      for (let k = 0; k < 6; k++) put(people(), cx + R(-9, 9), cz + R(-9, 9));
      for (let k = 0; k < 2; k++) put('bike', cx + R(-8, 8), cz + R(-8, 8));
      if (chance(0.5)) put('kiosk', cx + R(-7, 7), cz + R(-7, 7));
      put('bin', cx + R(-6, 6), cz + R(-6, 6));
    } else if (z === 'farm') {
      const v = (rnd() * 3) | 0;
      if (v === 0) { put('barn', cx - 4, cz - 4, R(-0.2, 0.2)); put('silo', cx + 2.5, cz - 6); if (chance(0.6)) put('silo', cx + 5.3, cz - 6); put('tractor', cx + 3, cz + 1); }
      else if (v === 1) { put('watertower', cx + 5, cz - 5); put('tractor', cx - 3, cz + 5); }
      for (let k = 0; k < 4 + ((rnd() * 4) | 0); k++) put('cow', cx + R(-8, 8), cz + R(-1, 8));
      for (let k = 0; k < 4 + ((rnd() * 4) | 0); k++) put('hay', cx + R(-9, 9), cz + R(-9, 9), R(0, 3));
      for (let k = -9; k <= 9; k += 4.5) if (chance(0.7)) put('pine', cx + k, cz - 10);
      if (chance(0.7)) put(people(), cx + R(-5, 5), cz + R(-5, 5));
      put('bush', cx + R(-9, 9), cz + 9.5);
    } else if (z === 'docks') {
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) if (chance(0.8)) put(pick(['container_a', 'container_b', 'container_c']), cx - 5 + k * 5, cz - 6 + r * 4, (chance(0.15) ? Math.PI / 2 : 0) + R(-0.05, 0.05));
      if (chance(0.5)) put('warehouse', cx + R(-3, 3), cz + 6, 0); else { put('van', cx - 4, cz + 6, R(-0.3, 0.3)); put('van', cx + 3, cz + 6.5, Math.PI + R(-0.3, 0.3)); }
      scatter(cx, cz, 3, ['cone', 'bin', 'cone']);
      scatter(cx, cz, 2, people);
    }
  }
  if (stad) {
    const [cx0, cz0] = center(stad.i, stad.j);
    const sx = cx0 + PITCH / 2, sz = cz0 + PITCH / 2;
    put('stadium', sx, sz, 0);
    for (let k = 0; k < 10; k++) { const a = R(0, 6.28); put(cars(), sx + Math.cos(a) * 21.5, sz + Math.sin(a) * 19, a + Math.PI / 2); }
    for (let k = 0; k < 12; k++) { const a = R(0, 6.28), r = R(17, 23); put(people(), sx + Math.cos(a) * r, sz + Math.sin(a) * r * 0.85); }
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { put('kiosk', sx + a * 22, sz + b * 20, 0); put('cone', sx + a * 19, sz + b * 23); put('cone', sx + a * 20.2, sz + b * 23); }
  }
  // roads: parked cars, cone lines, jaywalkers
  for (let k = 0; k <= N; k++) for (let m = 0; m < N; m++) {
    const line = k * PITCH - half, mid = (m + 0.5) * PITCH - half;
    for (const dir of [0, 1]) {
      if (stad && dir === 0 && k === stad.j + 1 && (m === stad.i || m === stad.i + 1)) continue;
      if (stad && dir === 1 && k === stad.i + 1 && (m === stad.j || m === stad.j + 1)) continue;
      const n = chance(0.5) ? 1 : chance(0.4) ? 2 : 0;
      for (let c = 0; c < n; c++) {
        const t = mid + R(-9, 9), lane = chance(0.5) ? 2.1 : -2.1;
        if (dir === 0) put(cars(), t, line + lane, lane > 0 ? 0 : Math.PI, 0);
        else put(cars(), line + lane, t, lane > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      }
      if (chance(0.18)) {
        const t = mid + R(-8, 8);
        for (let c = 0; c < 3; c++) dir === 0 ? put('cone', t + c * 1.2, line + 0.6, 0, 0) : put('cone', line + 0.6, t + c * 1.2, 0, 0);
      }
      if (chance(0.15)) dir === 0 ? put(people(), mid + R(-6, 6), line + R(-2, 2), undefined, 0) : put(people(), line + R(-2, 2), mid + R(-6, 6), undefined, 0);
    }
  }
  // border woods hug the ring road (the arena ends 4 units past it, so a big
  // storm can still reach them); the sea, boats and a lighthouse to the north
  for (let a = -edge - 6; a <= edge + 6; a += 3.2) {
    for (const side of [0, 1, 2, 3]) {
      if (harbour && side === 0) continue;
      const d = edge + R(1.5, 6);
      let x, z;
      if (side === 0) { x = a; z = -d; } else if (side === 1) { x = a; z = d; } else if (side === 2) { x = -d; z = a; } else { x = d; z = a; }
      if (harbour && z < waterZ + 2) continue;
      if (chance(0.55)) put(chance(0.5) ? 'pine' : 'tree', x + R(-1, 1), z + R(-1, 1), undefined, 0);
      else if (chance(0.4)) put('bush', x, z, undefined, 0);
    }
  }
  let light = null;
  if (harbour) {
    light = { x: R(-half * 0.6, half * 0.6), z: waterZ - 17 };
    for (let k = 0; k < 12; k++) {
      let x = R(-half, half);
      if (Math.abs(x - light.x) < 5) x += 10;
      put('boat', x, waterZ - R(6, 20), R(-0.4, 0.4) + (chance(0.5) ? 0 : Math.PI), 0);
    }
    put('lighthouse', light.x, light.z, 0, SLAB);
  }
  // ground height under a point: block slabs are raised, roads are not
  const baseAt = (x, z) => {
    const lx = x + half, lz = z + half;
    const i = Math.floor(lx / PITCH), j = Math.floor(lz / PITCH);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    if (zone[i][j] === 'stadium') return SLAB;
    const fx = lx - i * PITCH - PITCH / 2, fz = lz - j * PITCH - PITCH / 2;
    return Math.abs(fx) < BLOCK / 2 && Math.abs(fz) < BLOCK / 2 ? SLAB : 0;
  };
  const zoneAt = (x, z) => {
    const i = Math.floor((x + half) / PITCH), j = Math.floor((z + half) / PITCH);
    return i < 0 || j < 0 || i >= N || j >= N ? 'out' : zone[i][j];
  };
  let spawn = null;
  if (opt.easy) {
    spawn = { x: 0, z: 0 };
    for (let k = 0; k < 30; k++) { const a = R(0, 6.28), r = R(2, 13); put(chance(0.5) ? 'cone' : 'bin', Math.cos(a) * r, Math.sin(a) * r, undefined, 0); }
  } else if (!chase) {
    // Player spawn: the busiest of 30 candidate spots for a Category-1 storm
    // (cones, bins, hydrants, then people), never inside the stadium, plus a
    // small cone carpet round it so the first ten seconds always feed back.
    const small = objs.filter((o) => o.key === 'cone' || o.key === 'bin' || o.key === 'hydrant');
    const people = objs.filter((o) => o.key.startsWith('person'));
    let best = null, bs = -1;
    for (let k = 0; k < 30; k++) {
      const x = R(-half + 12, half - 12), z = R(-half + 12, half - 12);
      if (zoneAt(x, z) === 'stadium') continue;
      let v = 0;
      for (const o of small) if (Math.hypot(o.x - x, o.z - z) < 15) v += 2;
      for (const o of people) if (Math.hypot(o.x - x, o.z - z) < 15) v += 1;
      if (v > bs) { bs = v; best = { x, z }; }
    }
    spawn = best || { x: 0, z: 0 };
    for (let k = 0, n = 10 + ((rnd() * 5) | 0); k < n; k++) {
      const a = R(0, 6.28), r = R(2.5, 10);
      const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
      put(chance(0.6) ? 'cone' : 'bin', x, z, undefined, baseAt(x, z));
    }
  }

  // the arena ends just past the ring road: no empty green void to be chased into
  const bounds = { minX: -edge - 4, maxX: edge + 4, minZ: harbour ? waterZ - 26 : -edge - 4, maxZ: edge + 4 };
  return { N, half, edge, zone, blocks, objs, bounds, harbour, waterZ, light, stad, seed, spawn };
}

// Paint the whole ground once onto a canvas (roads, dashes, sidewalks, grass, fields, docks, sea).
export function paintGround(t, ext, px = 2048) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const k = px / ext.size;
  const X = (x) => (x - ext.minX) * k, Y = (z) => (z - ext.minZ) * k;
  const rr = (x, z, w, d, r, col) => { g.fillStyle = col; g.beginPath(); g.roundRect(X(x - w / 2), Y(z - d / 2), w * k, d * k, r * k); g.fill(); };
  g.fillStyle = '#86cc62'; g.fillRect(0, 0, px, px);
  const rnd = mulberry32(t.seed ^ 0x9e3779b9);
  for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,110,40,0.06)'; g.beginPath(); g.arc(rnd() * px, rnd() * px, (2 + rnd() * 6) * k, 0, 7); g.fill(); }
  if (t.harbour) {
    g.fillStyle = '#4cc9ff'; g.fillRect(0, 0, px, Y(t.waterZ));
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 260; i++) g.fillRect(rnd() * px, rnd() * Y(t.waterZ - 1), (1.5 + rnd() * 3) * k, 0.18 * k);
    g.fillStyle = '#d9d2c5'; g.fillRect(0, Y(t.waterZ - 0.6), px, 4.6 * k);
    if (t.light) { rr(t.light.x, (t.waterZ + t.light.z) / 2, 3.2, t.waterZ - t.light.z, 0.4, '#cbbfa8'); rr(t.light.x, t.light.z, 7, 7, 3.5, '#cbbfa8'); }
  }
  rr(0, 0, t.edge * 2, t.edge * 2, 3, '#5c6272');
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let n = 0; n <= t.N; n++) {
    const l = n * PITCH - t.half;
    for (let a = -t.edge + 4; a < t.edge - 4; a += 3.4) {
      const near = (((a + t.half) % PITCH) + PITCH) % PITCH;
      if (near < 4.5 || near > PITCH - 6) continue;
      g.fillRect(X(a), Y(l) - 0.13 * k, 1.7 * k, 0.26 * k);
      g.fillRect(X(l) - 0.13 * k, Y(a), 0.26 * k, 1.7 * k);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let a = 0; a <= t.N; a++) for (let b = 0; b <= t.N; b++) {
    const x = a * PITCH - t.half, z = b * PITCH - t.half;
    for (let s = -2.6; s <= 2.61; s += 1.3) for (const sg of [-1, 1]) {
      g.fillRect(X(x + s - 0.3), Y(z + sg * 4.6 - 0.6), 0.6 * k, 1.2 * k);
      g.fillRect(X(x + sg * 4.6 - 0.6), Y(z + s - 0.3), 1.2 * k, 0.6 * k);
    }
  }
  const fill = { res: '#8fd16a', park: '#7fca5f', farm: '#a5d873', main: '#ece6dc', down: '#e9e4dc', docks: '#d3cdc3', stadium: '#cfd3da' };
  for (const b of t.blocks) {
    rr(b.x, b.z, b.w, b.d, 2.2, '#e8e3da');
    rr(b.x, b.z, b.w - 0.5, b.d - 0.5, 2.0, '#f3efe8');
    const inner = b.zone === 'main' || b.zone === 'down' || b.zone === 'stadium' || b.zone === 'docks' ? 1.0 : 3.0;
    rr(b.x, b.z, b.w - inner, b.d - inner, 1.4, fill[b.zone]);
    if (b.zone === 'park') {
      g.strokeStyle = '#efe0bd'; g.lineWidth = 1.4 * k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(b.x - 10), Y(b.z - 10)); g.lineTo(X(b.x + 10), Y(b.z + 10)); g.moveTo(X(b.x + 10), Y(b.z - 10)); g.lineTo(X(b.x - 10), Y(b.z + 10)); g.stroke();
      g.beginPath(); g.arc(X(b.x), Y(b.z), 3.6 * k, 0, 7); g.stroke();
      g.fillStyle = '#efe0bd'; g.beginPath(); g.arc(X(b.x), Y(b.z), 2.6 * k, 0, 7); g.fill();
    } else if (b.zone === 'farm') {
      for (let r = -9; r < 9; r += 1.5) { g.fillStyle = Math.round(r / 1.5) % 2 === 0 ? '#c9a46e' : '#b8d97a'; g.fillRect(X(b.x - 9.5), Y(b.z + r), 19 * k, 0.75 * k); }
      g.fillStyle = '#a5d873'; g.fillRect(X(b.x - 9.5), Y(b.z - 9.5), 19 * k, 7 * k);
    } else if (b.zone === 'res') {
      for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const z0 = b.z + qz * 6.1, z1 = b.z + qz * 11;
        rr(b.x + qx * 2.6, (z0 + z1) / 2, 1.9, Math.abs(z1 - z0), 0.3, '#e0dbd2');
      }
    } else if (b.zone === 'main' || b.zone === 'down') {
      g.strokeStyle = 'rgba(180,170,155,0.35)'; g.lineWidth = 0.08 * k;
      for (let r = -10; r <= 10; r += 2) { g.beginPath(); g.moveTo(X(b.x - 10.5), Y(b.z + r)); g.lineTo(X(b.x + 10.5), Y(b.z + r)); g.stroke(); g.beginPath(); g.moveTo(X(b.x + r), Y(b.z - 10.5)); g.lineTo(X(b.x + r), Y(b.z + 10.5)); g.stroke(); }
      if (b.zone === 'down') for (const qx of [-1, 1]) rr(b.x + qx * 2, b.z, 2.4, 2.4, 0.6, '#93d36f');
    } else if (b.zone === 'docks') {
      g.fillStyle = '#ffcc4d';
      for (let r = -9; r < 10; r += 4) g.fillRect(X(b.x - 10), Y(b.z + r), 20 * k, 0.18 * k);
    } else if (b.zone === 'stadium') {
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.14 * k;
      for (let a = 0; a < 6.28; a += 0.12) { g.beginPath(); g.moveTo(X(b.x + Math.cos(a) * 19.5), Y(b.z + Math.sin(a) * 15.5)); g.lineTo(X(b.x + Math.cos(a) * 24), Y(b.z + Math.sin(a) * 20)); g.stroke(); }
      g.fillStyle = '#e5e1d8'; g.beginPath(); g.ellipse(X(b.x), Y(b.z), 19 * k, 15 * k, 0, 0, 7); g.fill();
    }
  }
  return cv;
}
