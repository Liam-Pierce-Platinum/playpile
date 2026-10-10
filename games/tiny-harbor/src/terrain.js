// The island: one analytic height function that everything asks
// (player feet, boats running aground, the water shader's foam, pickups),
// plus the low-poly mesh built from it.
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, hash2, segDist } from './util.js';

export const LH = { x: -33, z: 33 };                 // lighthouse islet centre
export const LH_TOP = 1.7;                           // islet ground height
export const CAUSE = { ax: -15, az: 15, bx: -29, bz: 29, ridge: -0.22 };
export const ISLET_TOP_R = 4.6;                      // flat rock around the tower
export const CABIN = { x: -7, z: -4 };
export const FIRE = { x: 2, z: 5.5 };
export const DOCK = { x0: 4.8, x1: 7.2, z0: 15, z1: 33.5, y: 1.0 };
export const MOOR = { x: 9.8, z: 30.5 };             // where a boat ties up
export const BOLLARD = { x: 7.0, z: 30.5 };
export const BRIDGE_SIGN = { x: -14, z: 12.6 };
export const TIDE_MID = 0.05, TIDE_AMP = 0.5;         // water swings -0.45 .. 0.55
export const WADE_LIMIT = 0.42;                      // deeper than this and you can't walk

// The causeway bridge runs from the beach right up onto the lighthouse islet,
// ramping up as it goes so it meets the rock.
// It lands on the flat rock well clear of the tower, so there's room to walk to the door.
export const BRIDGE = { ax: -15, az: 15, bx: LH.x + 3.2, bz: LH.z - 3.2, y0: 0.95, y1: 1.62 };

// Neighbouring islands you can sail to. dir points from the island to home;
// each gets a pier on that side.
// They're a long sail away and big enough for a whole village each.
export const ISLANDS = [
  { id: 'pebble', name: 'Pebble Isle', x: 285, z: -95, R: 46, seed: 1.3, hill: 5 },
  { id: 'drift', name: 'Driftwood Cay', x: -245, z: -205, R: 50, seed: 2.7, hill: 9 },
  { id: 'coral', name: 'Coral Cove', x: 105, z: 300, R: 44, seed: 4.1, hill: 3.5 },
];
export const VILLAGE_R = 31;
for (const I of ISLANDS) {
  const d = Math.hypot(I.x, I.z);
  I.dir = { x: -I.x / d, z: -I.z / d };
  I.th = Math.atan2(I.dir.z, I.dir.x);
  I.Rdir = I.R * (1 + 0.1 * Math.sin(3 * I.th + I.seed) + 0.05 * Math.sin(5 * I.th + I.seed * 2.3));
  I.plaza = { x: I.x + I.dir.x * I.Rdir * 0.3, z: I.z + I.dir.z * I.Rdir * 0.3 };
  I.hut = { x: I.plaza.x, z: I.plaza.z };
  I.hillC = { x: I.x - I.dir.x * I.R * 0.42, z: I.z - I.dir.z * I.R * 0.42 };
}

// Docks: the home dock plus one pier per island, all described the same way
// (start point, direction, length, width, deck height) so walking and
// mooring work everywhere.
export const DOCKS = [{ id: 'home', sx: 6, sz: 15, dx: 0, dz: 1, len: 18.5, w: 2.4, y: 1.0, side: 1 }];
export function finishDocks() {
for (const D of DOCKS) {
  // perpendicular, on the chosen side; the berth is beside the end of the pier
  const px = -D.dz * D.side, pz = D.dx * D.side;
  D.px = px; D.pz = pz;
  const ex = D.sx + D.dx * (D.len - 2), ez = D.sz + D.dz * (D.len - 2);
  D.berth = { x: ex + px * (D.w / 2 + 1.35), z: ez + pz * (D.w / 2 + 1.35), heading: Math.atan2(D.dx, D.dz) };
  D.board = { x: ex + px * (D.w / 2 - 0.5), z: ez + pz * (D.w / 2 - 0.5) };
}
}

// Hazards in the bay for boats: x, z, radius, top height.
export const BAY_ROCKS = [
  [-2, 46, 2.2, 0.9], [3, 55, 1.8, 0.3], [22, 50, 2.4, 1.1], [26, 63, 2.0, 0.25], [6, 66, 1.7, 0.7],
  [19.5, 41.5, 1.4, 0.15], [-9, 60, 2.5, 1.2], [33, 55, 1.8, 0.5], [9.5, 77, 2.1, 0.35], [28, 76, 1.6, 0.9],
  [-4, 72, 1.9, 0.2], [38, 68, 2.0, 1.0], [20.5, 58, 1.2, 0.1], [35, 40, 1.6, 0.6], [-14, 70, 1.6, 0.8],
];

function islandR(th) {
  return 26 * (1 + 0.09 * Math.sin(3 * th + 0.5) + 0.05 * Math.sin(5 * th + 1.3) + 0.03 * Math.sin(7 * th + 2.1));
}

function mainHeight(x, z) {
  const r = Math.hypot(x, z);
  const rr = r / islandR(Math.atan2(z, x));
  let h;
  if (rr < 0.6) h = 1.5;
  else if (rr < 0.8) h = lerp(1.5, 0.78, smooth(0.6, 0.8, rr));
  else if (rr < 1.05) h = lerp(0.78, -0.62, (rr - 0.8) / 0.25);
  else h = lerp(-0.62, -3.8, smooth(1.05, 1.6, rr));
  const inland = smooth(0.82, 0.55, rr);
  h += (fbm(x * 0.11 + 3, z * 0.11 - 7) - 0.45) * 0.6 * inland;
  h += 2.4 * Math.exp(-((x - 7) ** 2 + (z + 10) ** 2) / 50) * inland;
  if (rr > 0.95) h += (fbm(x * 0.25, z * 0.25) - 0.5) * 0.35 * smooth(0.95, 1.2, rr);
  // flat ground for the cabin plot and the campfire
  h = lerp(h, 1.55, smooth(7.5, 4.8, Math.hypot(x - CABIN.x, z - CABIN.z)));
  h = lerp(h, 1.5, smooth(3.5, 2.0, Math.hypot(x - FIRE.x, z - FIRE.z)));
  // the sandbar out to the lighthouse: only dry at low tide
  const ds = segDist(x, z, CAUSE.ax, CAUSE.az, CAUSE.bx, CAUSE.bz);
  const ridge = CAUSE.ridge + (fbm(x * 0.6, z * 0.6) - 0.5) * 0.08 - Math.max(0, ds - 1.15) * 1.6;
  if (ridge > h) h = ridge;
  // lighthouse islet
  const dl = Math.hypot(x - LH.x, z - LH.z);
  const T = ISLET_TOP_R;
  let isl = dl < T ? LH_TOP : dl < T + 2 ? lerp(LH_TOP, -0.4, (dl - T) / 2) : lerp(-0.4, -3.6, clamp((dl - T - 2) / 3, 0, 1));
  isl += (fbm(x * 0.5, z * 0.5) - 0.5) * 0.4 * smooth(T + 1.8, T + 0.2, dl);
  if (isl > h) h = isl;
  return h;
}

function isleHeight(I, x, z) {
  const dx = x - I.x, dz = z - I.z;
  const r = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  const R = I.R * (1 + 0.1 * Math.sin(3 * th + I.seed) + 0.05 * Math.sin(5 * th + I.seed * 2.3));
  const rr = r / R;
  let h;
  if (rr < 0.6) h = 1.4;
  else if (rr < 0.8) h = lerp(1.4, 0.78, smooth(0.6, 0.8, rr));
  else if (rr < 1.05) h = lerp(0.78, -0.62, (rr - 0.8) / 0.25);
  else h = lerp(-0.62, -3.8, smooth(1.05, 1.6, rr));
  const inland = smooth(0.82, 0.55, rr);
  h += (fbm(x * 0.07 + I.seed * 3, z * 0.07) - 0.45) * 1.1 * inland;
  const s2 = 2 * (I.R * 0.24) ** 2;
  h += I.hill * Math.exp(-((x - I.hillC.x) ** 2 + (z - I.hillC.z) ** 2) / s2) * inland;
  h = lerp(h, 1.5, smooth(VILLAGE_R + 7, VILLAGE_R - 3, Math.hypot(x - I.plaza.x, z - I.plaza.z)) * inland);
  return h;
}

export function heightAt(x, z) {
  let h = mainHeight(x, z);
  for (const I of ISLANDS) {
    if (Math.abs(x - I.x) < I.R * 1.75 && Math.abs(z - I.z) < I.R * 1.75) h = Math.max(h, isleHeight(I, x, z));
  }
  return h;
}

// roads: segments from the plaza; true on a road or the plaza
export function roadAt(x, z) {
  for (const I of ISLANDS) {
    if (!I.roads || Math.abs(x - I.plaza.x) > 70 || Math.abs(z - I.plaza.z) > 70) continue;
    if (Math.hypot(x - I.plaza.x, z - I.plaza.z) < 7.5) return 'plaza';
    for (const [ax, az, bx, bz] of I.roads) if (segDist(x, z, ax, az, bx, bz) < 1.7) return 'road';
  }
  return null;
}

export function dockAt(x, z) {
  for (const D of DOCKS) {
    const rx = x - D.sx, rz = z - D.sz;
    const along = rx * D.dx + rz * D.dz, side = rx * -D.dz + rz * D.dx;
    if (along > 0 && along < D.len && Math.abs(side) < D.w / 2) return D;
  }
  return null;
}
export const inDock = (x, z) => !!dockAt(x, z);
export function bridgeY(x, z) {
  const dx = BRIDGE.bx - BRIDGE.ax, dz = BRIDGE.bz - BRIDGE.az;
  const t = ((x - BRIDGE.ax) * dx + (z - BRIDGE.az) * dz) / (dx * dx + dz * dz);
  if (t < 0 || t > 1) return null;
  if (segDist(x, z, BRIDGE.ax, BRIDGE.az, BRIDGE.bx, BRIDGE.bz) > 1.15) return null;
  return lerp(BRIDGE.y0, BRIDGE.y1, t);
}
export const inBridge = (x, z) => bridgeY(x, z) !== null;
export function groundAt(x, z, bridge) {
  let g = heightAt(x, z);
  const D = dockAt(x, z);
  if (D) g = Math.max(g, D.y);
  if (bridge) { const b = bridgeY(x, z); if (b !== null) g = Math.max(g, b); }
  return g;
}
export function nearestIsland(x, z) {
  let best = null, bd = 1e9;
  for (const I of ISLANDS) { const d = Math.hypot(x - I.x, z - I.z); if (d < bd) { bd = d; best = I; } }
  return { island: best, dist: bd };
}

// ---------------------------------------------------------------------------
const C = (hex) => new THREE.Color(hex);
const GRASS_A = C('#7cc46a'), GRASS_B = C('#5fae5c'), GRASS_DRY = C('#a8c96a');
const SAND = C('#f2deae'), WET = C('#d9bd88'), BED = C('#b59c74'), DEEP = C('#6f8378'), ROCK = C('#9a968f');

const COBBLE = C('#bdb3a3'), DIRT = C('#cfb58a');
function groundColor(h, ny, x, z, out) {
  const n = hash2(Math.floor(x * 1.7), Math.floor(z * 1.7));
  if (h > 0.95 && Math.hypot(x, z) > 90) {
    const rd = roadAt(x, z);
    if (rd) return out.copy(rd === 'plaza' ? COBBLE : DIRT).offsetHSL(0, 0, (n - 0.5) * 0.06);
  }
  const isletD = Math.hypot(x - LH.x, z - LH.z);
  if (h > 0.98) {
    out.copy(GRASS_A).lerp(GRASS_B, fbm(x * 0.15, z * 0.15));
    out.lerp(GRASS_DRY, smooth(1.25, 0.98, h) * 0.6);
    if (ny < 0.86) out.multiplyScalar(0.85);
    out.offsetHSL(0, 0, (n - 0.5) * 0.05);
  } else if (h > 0.62) {
    out.copy(SAND).offsetHSL(0, 0, (n - 0.5) * 0.04);
  } else if (h > -0.55) {
    out.copy(WET).lerp(SAND, smooth(-0.4, 0.6, h) * 0.4).offsetHSL(0, 0, (n - 0.5) * 0.04);
  } else {
    out.copy(BED).lerp(DEEP, smooth(-0.6, -3.2, h)).offsetHSL(0, 0, (n - 0.5) * 0.04);
  }
  if (isletD < 5.5 && ny < 0.8 && h > -0.5) out.copy(ROCK).offsetHSL(0, 0, (n - 0.5) * 0.08);
  return out;
}

export function buildTerrain(cx = 0, cz = 0, S = 72, N = 176) {
  const step = (2 * S) / N, W = N + 1;
  const hs = new Float32Array(W * W);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) hs[j * W + i] = heightAt(cx - S + i * step, cz - S + j * step);
  const pos = [], col = [];
  const c = new THREE.Color(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const tri = (ax, az, ah, bx, bz, bh, cx, cz, ch) => {
    va.set(bx - ax, bh - ah, bz - az); vb.set(cx - ax, ch - ah, cz - az);
    vc.crossVectors(vb, va).normalize();
    if (vc.y < 0) vc.negate();
    groundColor((ah + bh + ch) / 3, vc.y, (ax + bx + cx) / 3, (az + bz + cz) / 3, c);
    pos.push(ax, ah, az, cx, ch, cz, bx, bh, bz);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h00 = hs[j * W + i], h10 = hs[j * W + i + 1], h01 = hs[(j + 1) * W + i], h11 = hs[(j + 1) * W + i + 1];
    if (Math.max(h00, h10, h01, h11) < -3.3) continue;
    const x0 = cx - S + i * step, z0 = cz - S + j * step, x1 = x0 + step, z1 = z0 + step;
    if ((i + j) & 1) {
      tri(x0, z0, h00, x1, z0, h10, x0, z1, h01);
      tri(x1, z0, h10, x1, z1, h11, x0, z1, h01);
    } else {
      tri(x0, z0, h00, x1, z1, h11, x0, z1, h01);
      tri(x0, z0, h00, x1, z0, h10, x1, z1, h11);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.receiveShadow = true;
  return m;
}

// Grass tufts and little flowers scattered over the grass, as instanced meshes.
export function buildFoliage(avoid, cx = 0, cz = 0, spread = 50, nTufts = 520, nFlowers = 140) {
  const group = new THREE.Group();
  const tuftGeo = new THREE.ConeGeometry(0.12, 0.42, 3);
  tuftGeo.translate(0, 0.2, 0);
  const tuftMat = new THREE.MeshLambertMaterial({ color: '#5aa652', flatShading: true });
  const flowerGeo = new THREE.IcosahedronGeometry(0.11, 0);
  flowerGeo.translate(0, 0.28, 0);
  const flowerMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, nTufts);
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, nFlowers);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const petal = ['#ffffff', '#ffd75e', '#ff9ec4', '#b9a6ff', '#ff8a6b'].map((h) => new THREE.Color(h));
  let nt = 0, nf = 0, guard = 0;
  while ((nt < nTufts || nf < nFlowers) && guard++ < 20000) {
    const x = cx + (Math.random() - 0.5) * spread, z = cz + (Math.random() - 0.5) * spread;
    const h = heightAt(x, z);
    if (h < 1.05) continue;
    if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
    if (Math.hypot(x, z) > 90 && roadAt(x, z)) continue;
    p.set(x, h - 0.02, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    if (nt < nTufts) {
      const k = 0.7 + Math.random() * 0.8;
      s.set(k, k * (0.8 + Math.random() * 0.6), k);
      m.compose(p, q, s);
      tufts.setMatrixAt(nt++, m);
    } else if (nf < nFlowers) {
      s.set(1, 1, 1);
      m.compose(p, q, s);
      flowers.setMatrixAt(nf, m);
      flowers.setColorAt(nf++, petal[nf % petal.length]);
    }
  }
  tufts.count = nt; flowers.count = nf;
  tufts.receiveShadow = true;
  group.add(tufts, flowers);
  return group;
}

// Heights baked into a texture for the water shader (depth colour + foam).
export function buildHeightTexture(N = 256, S = 90, far = false) {
  const near = (x, z) => ISLANDS.some((I) => Math.abs(x - I.x) < I.R * 1.8 && Math.abs(z - I.z) < I.R * 1.8);
  const data = new Uint8Array(N * N * 4);
  const rockAt = (x, z) => {
    let best = -9;
    for (const [rx, rz, rr, top] of BAY_ROCKS) {
      const d = Math.hypot(x - rx, z - rz);
      if (d < rr * 1.3) best = Math.max(best, lerp(top, -1.2, smooth(rr * 0.5, rr * 1.3, d)));
    }
    return best;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -S + ((i + 0.5) / N) * 2 * S, z = -S + ((j + 0.5) / N) * 2 * S;
    let hh = -4;
    if (!far || Math.hypot(x, z) < 75 || near(x, z)) hh = Math.max(heightAt(x, z), far ? -9 : rockAt(x, z));
    const v = Math.round(((hh + 6) / 8) * 255);
    data[(j * N + i) * 4] = Math.max(0, Math.min(255, v));
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, rect: new THREE.Vector3(-S, -S, 2 * S) };
}

// Lay out each island's roads and its pier now that heightAt works.
for (const I of ISLANDS) {
  let t = 0;
  while (t < 200 && heightAt(I.plaza.x + I.dir.x * t, I.plaza.z + I.dir.z * t) > 0.95) t += 0.5;
  const sx = I.plaza.x + I.dir.x * (t - 1), sz = I.plaza.z + I.dir.z * (t - 1);
  let u = t;
  while (u < 260 && heightAt(I.plaza.x + I.dir.x * u, I.plaza.z + I.dir.z * u) > -1.7) u += 0.5;
  const len = u - t + 4;
  I.pierStart = { x: sx, z: sz };
  I.roads = [[I.plaza.x, I.plaza.z, sx, sz]];
  for (const off of [1.9, -1.9, Math.PI]) {
    const a = I.th + off;
    I.roads.push([I.plaza.x, I.plaza.z, I.plaza.x + Math.cos(a) * 30, I.plaza.z + Math.sin(a) * 30]);
  }
  DOCKS.push({ id: I.id, sx, sz, dx: I.dir.x, dz: I.dir.z, len, w: 2.6, y: 1.0, side: 1 });
}
finishDocks();
