// Arena: grey concrete yard of axis-aligned boxes. Boxes double as character colliders and cannon statics.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const boxes = []; // {min:Vector3, max:Vector3, mesh}
export const solidMeshes = [];

function concreteTex(seed = 1, base = 128) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 26; d[i] = d[i + 1] = d[i + 2] = base + n; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) { // stains and patches
    const x = rnd() * 512, y = rnd() * 512, r = 10 + rnd() * 70, v = base + (rnd() - 0.6) * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 2; // panel seams
  g.strokeRect(1, 1, 510, 510); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
  g.strokeStyle = 'rgba(40,40,40,0.16)'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { // hairline cracks
    let x = rnd() * 512, y = rnd() * 512; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); } g.stroke();
  }
  for (let i = 0; i < 4; i++) { const x = 64 + (i % 2) * 384, y = 64 + (i > 1) * 384; g.fillStyle = 'rgba(50,50,50,0.6)'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } // tie holes
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function tiledBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

export { concreteTex, tiledBox };
// the four arena materials (concrete A/B/C + dark metal), shared with the campaign level kit
let MATS = null;
export function worldMats() {
  if (MATS) return MATS;
  const texA = concreteTex(3, 132), texB = concreteTex(7, 112), texC = concreteTex(11, 150);
  return (MATS = [
    new THREE.MeshStandardMaterial({ map: texA, color: 0xb4b4b4, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ map: texB, color: 0x9a9a9a, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: texC, color: 0xc2c2c2, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x5e5e5e, roughness: 0.6, metalness: 0.4 }),
  ]);
}
// One collision box (feet-based: y = bottom). It is a character collider, a ray/LOS blocker and a cannon static.
// mat: a material or an index into worldMats(); opts: { mesh: false = invisible collider, flags merged onto the
// box entry (e.g. tree, noClimb, glass, door), ray: false = see-through for sight/shot rays }. Returns the box entry {min, max, mesh, body, ...flags}.
let _scene = null, _physics = null;
export function setWorldTargets(scene, physics) { _scene = scene; _physics = physics; }
export function addBox(x, y, z, w, h, d, mat = 0, tile = 4, opts = {}) {
  const m = new THREE.Mesh(tiledBox(w, h, d, tile), typeof mat === 'number' ? worldMats()[mat] : mat);
  m.position.set(x, y + h / 2, z); m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  if (opts.mesh === false) m.visible = false;
  _scene.add(m); if (opts.ray !== false) solidMeshes.push(m); // ray: false = sight and shots pass (glass)
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) });
  body.position.set(x, y + h / 2, z); _physics.addBody(body);
  const b = { min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2), mesh: m, body, ...(opts.flags || {}) };
  boxes.push(b); gridDirty = true; return b;
}
// spatial grid (8 m cells) over the boxes: every per-frame query looks only at the cells it touches (a city has
// thousands of boxes). Rebuilt lazily after any add / remove; huge boxes (floors) sit in a list every query sees.
let gridDirty = true, stamp = 1; const GRID = new Map(), BIG = [], CELL = 8, OUT = [];
function rebuildGrid() {
  GRID.clear(); BIG.length = 0; gridDirty = false;
  for (const b of boxes) {
    if (b.max.x - b.min.x > 96 || b.max.z - b.min.z > 96) { BIG.push(b); continue; }
    for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++) for (let k = Math.floor(b.min.z / CELL); k <= Math.floor(b.max.z / CELL); k++) { const key = i * 100003 + k; let c = GRID.get(key); if (!c) GRID.set(key, c = []); c.push(b); }
  }
}
export function boxesNear(x0, z0, x1, z1) {
  if (gridDirty) rebuildGrid();
  if ((x1 - x0) * (z1 - z0) > 160 * 160) return boxes;
  const out = []; stamp++;
  for (const b of BIG) { b._s = stamp; out.push(b); }
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) { const c = GRID.get(i * 100003 + k); if (c) for (const b of c) if (b._s !== stamp) { b._s = stamp; out.push(b); } }
  return out;
}
// take one box out of the world (an opened door, a shattered window, a kicked-out grate)
export function removeBox(b) {
  const i = boxes.indexOf(b); if (i >= 0) { boxes.splice(i, 1); gridDirty = true; }
  const k = solidMeshes.indexOf(b.mesh); if (k >= 0) solidMeshes.splice(k, 1);
  if (b.mesh?.parent) b.mesh.parent.remove(b.mesh);
  if (b.body && _physics) _physics.removeBody(b.body);
}
// unload: every box, mesh and static body goes (levels call this through the campaign)
export function clearWorld() { for (const b of [...boxes]) { removeBox(b); b.mesh?.geometry?.dispose(); } boxes.length = 0; solidMeshes.length = 0; gridDirty = true; }

export function buildWorld(scene, physics) {
  setWorldTargets(scene, physics);
  const add = (x, y, z, w, h, d, mi = 0, tile = 4) => addBox(x, y, z, w, h, d, mi, tile).mesh;
  const S = 26; // half-size of yard
  add(0, -1, 0, S * 2 + 20, 1, S * 2 + 20, 2, 6);               // ground slab
  add(0, 0, -S, S * 2 + 2, 9, 2, 0); add(0, 0, S, S * 2 + 2, 9, 2, 0); // perimeter walls
  add(-S, 0, 0, 2, 9, S * 2, 0); add(S, 0, 0, 2, 9, S * 2, 0);
  add(-14, 9, -S, 10, 3, 2, 1); add(10, 9, S, 14, 2, 2, 1);      // stepped wall tops
  // pillars to climb: two hold up the bridge, plus a ring of tall ones spaced for pillar-to-pillar leaps
  for (const [x, z, h] of [[-10, -8, 6], [-10, 9, 7.5]]) add(x, 0, z, 2.4, h, 2.4, 1, 3);
  const RING = 16, HS = [10, 12, 9, 11, 13, 10, 12, 9, 11, 10, 12, 9];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = Math.cos(a) * RING, z = Math.sin(a) * RING;
    if (Math.abs(x + 13.86) < 0.5 && Math.abs(Math.abs(z) - 8) < 0.5) continue; // too close to the bridge pillars
    add(+x.toFixed(2), 0, +z.toFixed(2), 2.4, HS[i], 2.4, 1, 3);
  }
  add(4, 0, -6, 2.4, 8, 2.4, 1, 3); add(9, 0, 1, 2.4, 10, 2.4, 1, 3); // stepping stones through the middle
  // a slab bridge on two pillars
  add(-10, 6, 0.5, 2.4, 0.6, 15.4, 1, 3);
  // freestanding blast walls
  add(-19, 0, -4, 1.2, 5, 9, 0); add(19, 0, 4, 1.2, 5, 9, 0); add(4, 0, 4, 8, 3.2, 1.2, 0);
  // crates and blocks for footing
  for (const [x, z, s] of [[6, -3, 1.4], [7.3, -3.3, 1], [-5, 6, 1.2], [15, -15, 1.6], [-16, 15, 1.4], [-3, -9, 1], [16, 13, 1.1]]) add(x, 0, z, s, s, s, 3, 1.2);
  add(15, 1.6, -15, 1, 1, 1, 3, 1.2);
  // stealth routes: tall walls with walkable tops, two perch towers with ledges, low cover walls
  add(-4, 0, 12, 9, 6, 1.4, 0);                 // long wall, 1.4 m wide top to stalk along
  add(12.5, 0, -2, 1.4, 6, 8, 0);
  add(-6, 0, -17, 3.2, 7.5, 3.2, 1, 3);                // perch towers
  add(5, 0, 19, 3.2, 7, 3.2, 1, 3);
  add(-12, 0, 18, 6, 2.2, 1, 0); add(14, 0, -18, 1, 2.2, 6, 0); add(-17, 0, -12, 1, 2.2, 5, 0);
  return { S };
}

const _c = new THREE.Vector3();
// Push a vertical cylinder (pos = feet) out of all boxes. Returns {grounded, groundY, ceiling}.
export function collideCylinder(pos, vel, r, h, prevY) {
  let grounded = false; const near = boxesNear(pos.x - r - 2, pos.z - r - 2, pos.x + r + 2, pos.z + r + 2);
  // vertical sweep FIRST: any top surface crossed between prevY and pos.y catches the feet, however fast the fall
  // (a slam at 30+ m/s moves more than a metre per frame; resolving sideways first used to shove the hero out of
  // the floor slab sideways and through the world)
  if (pos.y < prevY) {
    let land = -Infinity;
    for (const b of near) {
      if (pos.x + r * 0.7 < b.min.x || pos.x - r * 0.7 > b.max.x || pos.z + r * 0.7 < b.min.z || pos.z - r * 0.7 > b.max.z) continue;
      if (prevY >= b.max.y - 0.37 && pos.y < b.max.y) land = Math.max(land, b.max.y);
    }
    if (land > -Infinity) { pos.y = land; if (vel.y < 0) vel.y = 0; }
  }
  // horizontal
  for (const b of near) {
    if (pos.y + h <= b.min.y + 0.02 || pos.y >= b.max.y - 0.36) continue; // above step height = walk onto it
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x)), cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    let dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 < 1e-8) { // centre inside: push out along shallowest axis
      const o = [pos.x - b.min.x, b.max.x - pos.x, pos.z - b.min.z, b.max.z - pos.z], m = Math.min(...o), i = o.indexOf(m);
      if (i === 0) pos.x = b.min.x - r; else if (i === 1) pos.x = b.max.x + r; else if (i === 2) pos.z = b.min.z - r; else pos.z = b.max.z + r;
      continue;
    }
    const d = Math.sqrt(d2), push = r - d; dx /= d; dz /= d;
    pos.x += dx * push; pos.z += dz * push;
    const vn = vel.x * dx + vel.z * dz; if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
  }
  // vertical
  let groundY = -50;
  for (const b of near) {
    if (pos.x + r * 0.7 < b.min.x || pos.x - r * 0.7 > b.max.x || pos.z + r * 0.7 < b.min.z || pos.z - r * 0.7 > b.max.z) continue;
    if (b.max.y <= Math.max(prevY, pos.y) + 0.37) groundY = Math.max(groundY, b.max.y);
    else if (vel.y > 0 && prevY + h <= b.min.y + 0.05 && pos.y + h > b.min.y) { pos.y = b.min.y - h; vel.y = 0; }
  }
  if (pos.y <= groundY + 0.001 && vel.y <= 0.01) { pos.y = groundY; vel.y = 0; grounded = true; }
  return { grounded, groundY };
}

export function groundBelow(x, z, y) {
  let g = -50;
  for (const b of boxesNear(x, z, x, z)) if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= y + 0.4) g = Math.max(g, b.max.y);
  return g;
}

// Nearest wall face to a cylinder. Returns {box, normal, point, dist} or null.
export function nearestWall(pos, r, h, maxDist) {
  let best = null;
  for (const b of boxesNear(pos.x - maxDist - r - 1, pos.z - maxDist - r - 1, pos.x + maxDist + r + 1, pos.z + maxDist + r + 1)) {
    if (b.max.y < pos.y + 0.9 || b.min.y > pos.y + h * 0.6) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x)), cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz) - r;
    if (d > maxDist || (dx === 0 && dz === 0)) continue;
    if (!best || d < best.dist) {
      // snap normal to a face axis
      const n = Math.abs(dx) > Math.abs(dz) ? new THREE.Vector3(Math.sign(dx), 0, 0) : new THREE.Vector3(0, 0, Math.sign(dz));
      best = { box: b, normal: n, point: new THREE.Vector3(cx, pos.y, cz), dist: d };
    }
  }
  return best;
}

export function pointInBox(p) {
  for (const b of boxesNear(p.x, p.z, p.x, p.z)) if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return b;
  return null;
}

// Face normal of the box face that point p crossed coming from prev.
export function hitNormal(b, p, prev) {
  const n = new THREE.Vector3();
  if (prev.y >= b.max.y) return n.set(0, 1, 0);
  if (prev.y <= b.min.y) return n.set(0, -1, 0);
  if (prev.x <= b.min.x) return n.set(-1, 0, 0);
  if (prev.x >= b.max.x) return n.set(1, 0, 0);
  if (prev.z <= b.min.z) return n.set(0, 0, -1);
  if (prev.z >= b.max.z) return n.set(0, 0, 1);
  const o = [p.x - b.min.x, b.max.x - p.x, p.y - b.min.y, b.max.y - p.y, p.z - b.min.z, b.max.z - p.z], i = o.indexOf(Math.min(...o));
  return n.set([-1, 1, 0, 0, 0, 0][i], [0, 0, -1, 1, 0, 0][i], [0, 0, 0, 0, -1, 1][i]);
}

// Ray vs the collision boxes (slab test): {box, normal, dist} or null. Works without meshes (offline tests).
export function rayBox(from, dir, far) {
  let best = null; const ex = from.x + dir.x * far, ez = from.z + dir.z * far;
  for (const b of boxesNear(Math.min(from.x, ex) - 0.5, Math.min(from.z, ez) - 0.5, Math.max(from.x, ex) + 0.5, Math.max(from.z, ez) + 0.5)) {
    let t0 = 0, t1 = far, axis = -1, sgn = 0;
    for (const [k, i] of [['x', 0], ['y', 1], ['z', 2]]) {
      const o = from[k], d = dir[k], lo = b.min[k], hi = b.max[k];
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 1e9; break; } continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d, s = -1; if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
      if (ta > t0) { t0 = ta; axis = i; sgn = s; } t1 = Math.min(t1, tb); if (t0 > t1) { t0 = 1e9; break; }
    }
    if (t0 < 1e8 && axis >= 0 && t0 <= far && (!best || t0 < best.dist)) best = { box: b, dist: t0, normal: new THREE.Vector3(axis === 0 ? sgn : 0, axis === 1 ? sgn : 0, axis === 2 ? sgn : 0) };
  }
  return best;
}

const ray = new THREE.Raycaster();
export function boxOf(mesh) { return boxes.find(b => b.mesh === mesh); }
// Ray against the world: {point, normal, box, distance} or null
export function rayHit(from, dir, far) {
  ray.set(from, dir); ray.far = far;
  const h = ray.intersectObjects(solidMeshes, false)[0];
  if (!h) return null;
  return { point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld).round(), box: boxOf(h.object), distance: h.distance };
}
export function rayWorld(from, dir, far) {
  ray.set(from, dir); ray.far = far;
  const h = ray.intersectObjects(solidMeshes, false)[0];
  return h ? h.distance : far;
}
