// Bakes downtown Toronto (King St W x Bay St, the Financial District) from OpenStreetMap into city.js (an ES module, so the level can build synchronously).
// node assets/levels/toronto/bake.mjs <overpass raw.json>
// Fetch raw.json with Overpass (bbox 43.6455,-79.3850,43.6512,-79.3768):
//   (way["building"]; way["building:part"]; way["highway"~"primary|secondary|tertiary|residential|unclassified|service|pedestrian"];); out body; >; out skel qt;
// Output, in level metres (x = east along the street grid, z = south, the grid is rotated onto the axes):
//   boxes: [x0, z0, x1, z1, h]  footprint rasterised on a 2 m grid (heights from height / building:levels),
//   merged into the fewest axis-aligned boxes; roads: [[x, z]...] centrelines with a width; names: street labels.
import fs from 'fs';
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'raw.json'));
const O = { lat: 43.64875, lon: -79.3807 }; // King & Bay
const KX = 111320 * Math.cos(O.lat * Math.PI / 180), KZ = 110574;
const nodes = new Map(), ways = [];
for (const e of raw.elements) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.push(e); }
const proj = n => [(n.lon - O.lon) * KX, -(n.lat - O.lat) * KZ];
// grid angle: King St W bearing in the projected frame
let ax = 0, az = 0;
for (const w of ways) if (w.tags?.name === 'King Street West') { const p = w.nodes.map(i => nodes.get(i)).filter(Boolean).map(proj); for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1], s = dx < 0 ? -1 : 1; ax += dx * s; az += dz * s; } }
const ROT = Math.atan2(az, ax); // rotate by -ROT so King St runs along +x
const c = Math.cos(-ROT), s = Math.sin(-ROT);
const P = n => { const [x, z] = proj(n); return [x * c - z * s, x * s + z * c]; };
const OVR = { 'Scotia Plaza': 275, 'Brookfield Place': 0, 'The St. Regis': 0, 'EY Tower': 0 };
function height(t) {
  if (OVR[t.name] > 0) return OVR[t.name];
  let h = parseFloat(t.height);
  if (!(h > 3)) h = NaN;
  if (isNaN(h) && t['building:levels']) h = parseFloat(t['building:levels']) * 3.7;
  if (isNaN(h)) h = t['building:part'] ? 0 : 14;
  if ((t.building === 'roof' || t['building:part'] === 'roof') && !t.height) h = 0;
  return h;
}
const CELL = 2, X0 = -330, X1 = 330, Z0 = -330, Z1 = 330, NX = (X1 - X0) / CELL, NZ = (Z1 - Z0) / CELL;
const H = new Float32Array(NX * NZ);
function inPoly(x, z, p) { let k = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) k = !k; } return k; }
let nB = 0;
for (const w of ways) {
  const t = w.tags || {}; if (!(t.building || t['building:part'])) continue;
  if (t.building === 'roof' || t['building:part'] === 'roof' || +t.min_height > 6 || +t['building:min_level'] > 2) continue; // canopies, bridges
  const h = height(t); if (h < 3) continue;
  const p = w.nodes.map(i => nodes.get(i)).filter(Boolean).map(P); if (p.length < 3) continue;
  let mx = 1e9, Mx = -1e9, mz = 1e9, Mz = -1e9; for (const [x, z] of p) { mx = Math.min(mx, x); Mx = Math.max(Mx, x); mz = Math.min(mz, z); Mz = Math.max(Mz, z); }
  for (let i = Math.max(0, Math.floor((mx - X0) / CELL)); i <= Math.min(NX - 1, Math.floor((Mx - X0) / CELL)); i++)
    for (let j = Math.max(0, Math.floor((mz - Z0) / CELL)); j <= Math.min(NZ - 1, Math.floor((Mz - Z0) / CELL)); j++)
      if (inPoly(X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL, p)) H[j * NX + i] = Math.max(H[j * NX + i], h);
  nB++;
}
// quantise: below 30 m to 1 m, above to 4 m (fewer, cleaner tiers)
for (let k = 0; k < H.length; k++) { const h = H[k]; H[k] = h <= 0 ? 0 : h < 30 ? Math.round(h) : Math.round(h / 4) * 4; }
// drop single-cell specks
for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; if (H[k] && !H[k - 1] && !H[k + 1] && !H[k - NX] && !H[k + NX]) H[k] = 0; }
// greedy rectangles of equal height
const used = new Uint8Array(NX * NZ), boxes = [];
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const k = j * NX + i, h = H[k]; if (!h || used[k]) continue;
  let w = 1; while (i + w < NX && H[k + w] === h && !used[k + w]) w++;
  let d = 1; grow: while (j + d < NZ) { for (let q = 0; q < w; q++) { const kk = (j + d) * NX + i + q; if (H[kk] !== h || used[kk]) break grow; } d++; }
  for (let dd = 0; dd < d; dd++) for (let q = 0; q < w; q++) used[(j + dd) * NX + i + q] = 1;
  boxes.push([X0 + i * CELL, Z0 + j * CELL, X0 + (i + w) * CELL, Z0 + (j + d) * CELL, h]);
}
// roads
const RW = { primary: 16, secondary: 14, secondary_link: 8, tertiary: 12, residential: 9, unclassified: 8, service: 5, pedestrian: 6 };
const roads = [], names = {};
for (const w of ways) {
  const t = w.tags || {}; if (!t.highway || !RW[t.highway]) continue;
  const p = w.nodes.map(i => nodes.get(i)).filter(Boolean).map(P).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  roads.push({ w: RW[t.highway], k: t.highway, p, n: t.name || '' });
  if (t.name && RW[t.highway] >= 12) (names[t.name] ||= []).push(...p);
}
// landmarks (rotated into the level frame)
const L = (lat, lon) => P({ lat, lon }).map(v => Math.round(v));
const out = { src: 'OpenStreetMap contributors (ODbL), Overpass ' + (raw.osm3s?.timestamp_osm_base || ''), origin: O, rot: ROT, cell: CELL,
  boxes, roads, cnTower: L(43.6426, -79.3871), lakeZ: L(43.6405, -79.3807)[1], union: L(43.6453, -79.3806),
  streets: Object.fromEntries(Object.entries(names).map(([n, p]) => { const xs = p.map(q => q[0]), zs = p.map(q => q[1]); return [n, [Math.round(xs.reduce((a, b) => a + b) / xs.length), Math.round(zs.reduce((a, b) => a + b) / zs.length), Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...zs) - Math.min(...zs))]]; })) };
fs.writeFileSync(new URL('./city.js', import.meta.url), '// GENERATED by bake.mjs from OpenStreetMap (ODbL). Do not edit by hand.\nexport default ' + JSON.stringify(out) + ';\n');
console.log({ buildings: nB, boxes: boxes.length, roads: roads.length, rotDeg: +(ROT * 180 / Math.PI).toFixed(2), maxH: Math.max(...boxes.map(b => b[4])), cn: out.cnTower, lakeZ: out.lakeZ, bytes: JSON.stringify(out).length });
