// Procedural dungeon floors: rooms on a 5x5 macro grid joined by straight corridors.
// Every room contains its macro cell's centre row and column, so corridors are always straight
// and each corridor meets each room at exactly one door tile.
import * as THREE from '../vendor/three.module.js';
import { TS, mulberry32 } from './util.js';
import { BOSS_FLOORS, LAST_FLOOR } from './data.js';

export const T = { VOID: 0, FLOOR: 1, PILLAR: 3, TRAP: 4 };
const MW = 5, MH = 5, MC = 13;
export const WALL_H = 3.0;

export function generateFloor(floorNum, seed) {
  const rng = mulberry32(seed);
  const ri = (a, b) => Math.floor(a + rng() * (b - a + 1));
  const W = MW * MC + 2, H = MH * MC + 2;
  const tiles = new Uint8Array(W * H);
  const roomOf = new Int16Array(W * H).fill(-1);
  const doorAt = new Int16Array(W * H).fill(-1);
  const bossKey = BOSS_FLOORS[floorNum] || null;
  const final = floorNum === LAST_FLOOR;
  const nMain = final ? 2 : bossKey ? 4 : Math.min(5 + Math.floor(floorNum / 2), 8);

  // --- random walk path on the macro grid (retry until long enough)
  let path = null;
  for (let tries = 0; tries < 200 && !path; tries++) {
    const p = [[ri(0, MW - 1), ri(0, MH - 1)]];
    const used = new Set([p[0].join()]);
    while (p.length < nMain) {
      const [x, y] = p[p.length - 1];
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < MW && b < MH && !used.has(a + ',' + b));
      if (!nb.length) break;
      const n = nb[Math.floor(rng() * nb.length)];
      p.push(n); used.add(n.join());
    }
    if (p.length === nMain) path = p;
  }
  const cells = path.map((c) => ({ cx: c[0], cy: c[1] }));
  const links = [];
  for (let i = 1; i < cells.length; i++) links.push([i - 1, i]);
  // treasure branches
  const used = new Set(path.map((c) => c.join()));
  const nBranch = bossKey ? (final ? 0 : 1) : 1 + (rng() < 0.6 ? 1 : 0);
  for (let b = 0; b < nBranch; b++) {
    const cand = [];
    for (let i = 1; i < path.length - 1 + (bossKey ? 0 : 0); i++) {
      const { cx, cy } = cells[i];
      for (const [a, c] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]])
        if (a >= 0 && c >= 0 && a < MW && c < MH && !used.has(a + ',' + c)) cand.push([i, a, c]);
    }
    if (!cand.length) break;
    const [from, a, c] = cand[Math.floor(rng() * cand.length)];
    used.add(a + ',' + c);
    cells.push({ cx: a, cy: c, branch: true });
    links.push([from, cells.length - 1]);
  }

  // --- rooms
  const rooms = cells.map((c, i) => {
    let type = 'combat';
    if (i === 0) type = 'start';
    else if (c.branch) type = 'treasure';
    else if (i === nMain - 1) type = bossKey ? 'boss' : 'exit';
    let w, h;
    if (type === 'boss') { w = 11; h = 11; }
    else if (type === 'start') { w = 7; h = 7; }
    else if (type === 'treasure') { w = 5 + ri(0, 1); h = 5 + ri(0, 1); }
    else { w = ri(7, 11); h = ri(7, 11); }
    const x0c = 1 + c.cx * MC, y0c = 1 + c.cy * MC;
    const midX = x0c + 6, midY = y0c + 6;
    const xa = Math.max(x0c + 1, midX - w + 2), xb = Math.min(x0c + MC - 1 - w, midX - 1);
    const ya = Math.max(y0c + 1, midY - h + 2), yb = Math.min(y0c + MC - 1 - h, midY - 1);
    const x = ri(xa, Math.max(xa, xb)), y = ri(ya, Math.max(ya, yb));
    return { id: i, type, x, y, w, h, midX, midY, cx: (x + w / 2) * TS, cz: (y + h / 2) * TS,
      doors: [], state: type === 'start' || type === 'treasure' ? 'clear' : 'idle', seen: i === 0, monsters: [] };
  });
  for (const r of rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) { tiles[y * W + x] = T.FLOOR; roomOf[y * W + x] = r.id; }

  // --- corridors
  for (const [ia, ib] of links) {
    let a = rooms[ia], b = rooms[ib];
    if (cells[ia].cy === cells[ib].cy) {
      if (a.x > b.x) [a, b] = [b, a];
      const row = a.midY;
      for (let x = a.x + a.w; x < b.x; x++) if (tiles[row * W + x] === T.VOID) tiles[row * W + x] = T.FLOOR;
    } else {
      if (a.y > b.y) [a, b] = [b, a];
      const col = a.midX;
      for (let y = a.y + a.h; y < b.y; y++) if (tiles[y * W + col] === T.VOID) tiles[y * W + col] = T.FLOOR;
    }
  }
  // --- doors: corridor tiles touching a room
  const doors = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (tiles[i] !== T.FLOOR || roomOf[i] !== -1) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * W + x + dx;
        if (roomOf[j] >= 0) {
          const d = { id: doors.length, tx: x, ty: y, room: roomOf[j], horiz: dx !== 0, open: 1, target: 1 };
          doors.push(d); doorAt[i] = d.id; rooms[roomOf[j]].doors.push(d.id);
          break;
        }
      }
    }

  // --- pillars and traps
  const traps = [];
  for (const r of rooms) {
    if ((r.type === 'combat' || r.type === 'exit' || r.type === 'boss') && r.w >= 8 && r.h >= 8) {
      const spots = [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]];
      for (const [x, y] of spots) if (x !== r.midX && y !== r.midY && (r.type === 'boss' || rng() < 0.7)) tiles[y * W + x] = T.PILLAR;
    }
    if ((r.type === 'combat' || r.type === 'exit') && floorNum >= 2 && rng() < 0.55) {
      const n = ri(3, 6);
      for (let k = 0; k < n * 4 && traps.filter((t) => t.room === r.id).length < n; k++) {
        const x = ri(r.x + 1, r.x + r.w - 2), y = ri(r.y + 1, r.y + r.h - 2);
        if (x === r.midX || y === r.midY || tiles[y * W + x] !== T.FLOOR) continue;
        tiles[y * W + x] = T.TRAP;
        traps.push({ tx: x, ty: y, room: r.id, phase: rng() * 3, up: 0 });
      }
    }
  }

  // --- torches on room walls
  const torches = [];
  for (const r of rooms) {
    const ring = [];
    for (let x = r.x; x < r.x + r.w; x++) { ring.push([x, r.y - 1, 0, 1]); ring.push([x, r.y + r.h, 0, -1]); }
    for (let y = r.y; y < r.y + r.h; y++) { ring.push([r.x - 1, y, 1, 0]); ring.push([r.x + r.w, y, -1, 0]); }
    let k = 0;
    for (const [x, y, nx, ny] of ring) {
      if (tiles[y * W + x] !== T.VOID) continue;
      if ((x + y * 3) % 4 !== 0) continue;
      if (++k > 6) break;
      torches.push({ x: (x + 0.5 + nx * 0.62) * TS, z: (y + 0.5 + ny * 0.62) * TS, nx, ny, room: r.id });
    }
  }

  const start = rooms[0];
  return { floorNum, W, H, tiles, roomOf, doorAt, rooms, doors, traps, torches, bossKey, final,
    start: { x: start.cx, z: start.cz } };
}

// ---------- queries ----------
export function tileAt(F, wx, wz) {
  const tx = Math.floor(wx / TS), ty = Math.floor(wz / TS);
  if (tx < 0 || ty < 0 || tx >= F.W || ty >= F.H) return { tx, ty, t: T.VOID, i: -1 };
  const i = ty * F.W + tx;
  return { tx, ty, t: F.tiles[i], i };
}
export function solidTile(F, tx, ty, flying = false) {
  if (tx < 0 || ty < 0 || tx >= F.W || ty >= F.H) return true;
  const i = ty * F.W + tx, t = F.tiles[i];
  if (t === T.VOID) return true;
  if (t === T.PILLAR) return !flying || true;
  const d = F.doorAt[i];
  if (d >= 0 && F.doors[d].open < 0.5) return true;
  return false;
}
export function solidAt(F, wx, wz) { return solidTile(F, Math.floor(wx / TS), Math.floor(wz / TS)); }

// Push a circle out of solid tiles. Returns true if it touched a wall.
export function collide(F, o, r) {
  let hit = false;
  const tx0 = Math.floor((o.x - r) / TS), tx1 = Math.floor((o.x + r) / TS);
  const ty0 = Math.floor((o.z - r) / TS), ty1 = Math.floor((o.z + r) / TS);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!solidTile(F, tx, ty)) continue;
      const pillar = F.tiles[ty * F.W + tx] === T.PILLAR;
      if (pillar) {
        const cx = (tx + 0.5) * TS, cz = (ty + 0.5) * TS, pr = 0.62;
        const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz);
        if (d < pr + r && d > 1e-4) { o.x = cx + (dx / d) * (pr + r); o.z = cz + (dz / d) * (pr + r); hit = true; }
        continue;
      }
      const nx = Math.max(tx * TS, Math.min(o.x, (tx + 1) * TS));
      const nz = Math.max(ty * TS, Math.min(o.z, (ty + 1) * TS));
      const dx = o.x - nx, dz = o.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x = nx + (dx / d) * r; o.z = nz + (dz / d) * r; }
        else { // centre inside the tile: push out along the shortest axis
          const cx = (tx + 0.5) * TS, cz = (ty + 0.5) * TS;
          if (Math.abs(o.x - cx) > Math.abs(o.z - cz)) o.x = cx + Math.sign(o.x - cx || 1) * (TS / 2 + r);
          else o.z = cz + Math.sign(o.z - cz || 1) * (TS / 2 + r);
        }
      }
    }
  return hit;
}

// Line of sight between two world points (tile march).
export function los(F, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (TS * 0.35));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const tl = tileAt(F, x, z);
    if (tl.t === T.VOID || tl.t === T.PILLAR) return false;
  }
  return true;
}

// BFS distance field toward a target tile (used by monsters and the autopilot).
export function flowField(F, tx, ty) {
  const dist = new Int16Array(F.W * F.H).fill(-1);
  const q = new Int32Array(F.W * F.H); let h = 0, t = 0;
  const s = ty * F.W + tx; dist[s] = 0; q[t++] = s;
  while (h < t) {
    const i = q[h++], x = i % F.W, y = (i / F.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solidTile(F, nx, ny)) continue;
      const j = ny * F.W + nx;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i] + 1; q[t++] = j;
    }
  }
  return dist;
}

// ---------- meshes ----------
export function buildFloorMeshes(F, tex) {
  const group = new THREE.Group();
  const W = F.W, H = F.H;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  const base = new THREE.Mesh(new THREE.PlaneGeometry(W * TS + 40, H * TS + 40), new THREE.MeshStandardMaterial({ color: 0x0d0a09, roughness: 1 }));
  base.rotation.x = -Math.PI / 2; base.position.set(W * TS / 2, -0.32, H * TS / 2); base.receiveShadow = true;
  group.add(base);

  // floor tiles
  const floorIdx = [];
  for (let i = 0; i < W * H; i++) if (F.tiles[i] !== T.VOID) floorIdx.push(i);
  const fGeo = new THREE.BoxGeometry(TS * 0.975, 0.3, TS * 0.975);
  const fMat = new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.55, metalness: 0.0, bumpMap: tex.floor, bumpScale: 1.2 });
  const floors = new THREE.InstancedMesh(fGeo, fMat, floorIdx.length);
  floorIdx.forEach((i, k) => {
    const x = i % W, y = (i / W) | 0;
    dummy.position.set((x + 0.5) * TS, -0.15 - Math.random() * 0.03, (y + 0.5) * TS);
    dummy.rotation.set(0, (Math.floor(Math.random() * 4) * Math.PI) / 2, 0);
    dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    floors.setMatrixAt(k, dummy.matrix);
    const corridor = F.roomOf[i] < 0;
    const l = (corridor ? 0.62 : 0.82) + Math.random() * 0.18;
    col.setRGB(l, l * 0.96, l * 0.92);
    floors.setColorAt(k, col);
  });
  floors.receiveShadow = true;
  group.add(floors);

  // walls (void tiles touching floor)
  const wallTiles = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (F.tiles[y * W + x] !== T.VOID) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && F.tiles[ny * W + nx] !== T.VOID) { near = true; break; }
        }
      if (near) wallTiles.push([x, y]);
    }
  const wGeo = new THREE.BoxGeometry(TS, WALL_H, TS);
  wGeo.translate(0, WALL_H / 2, 0);
  const wSide = new THREE.MeshStandardMaterial({ map: tex.wall, bumpMap: tex.wall, bumpScale: 2, roughness: 0.7 });
  const wTop = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9 });
  const walls = new THREE.InstancedMesh(wGeo, [wSide, wSide, wTop, wTop, wSide, wSide], wallTiles.length);
  const wallData = wallTiles.map(([x, y], k) => {
    dummy.position.set((x + 0.5) * TS, 0, (y + 0.5) * TS); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    walls.setMatrixAt(k, dummy.matrix);
    const l = 0.8 + Math.random() * 0.25; col.setRGB(l, l * 0.97, l * 0.93); walls.setColorAt(k, col);
    return { x: (x + 0.5) * TS, z: (y + 0.5) * TS, s: 1 };
  });
  walls.castShadow = true; walls.receiveShadow = true;
  group.add(walls);

  // pillars
  const pil = [];
  for (let i = 0; i < W * H; i++) if (F.tiles[i] === T.PILLAR) pil.push(i);
  if (pil.length) {
    const shaft = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.56, WALL_H, 24), new THREE.MeshStandardMaterial({ map: tex.wall, color: 0xc9b9a6, roughness: 0.5 }), pil.length);
    const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.72, 0.72, 0.35, 24), new THREE.MeshStandardMaterial({ color: 0x8a7c6c, roughness: 0.45 }), pil.length * 2);
    pil.forEach((i, k) => {
      const x = ((i % W) + 0.5) * TS, z = (((i / W) | 0) + 0.5) * TS;
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set(x, WALL_H / 2, z); dummy.updateMatrix(); shaft.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, 0.17, z); dummy.updateMatrix(); cap.setMatrixAt(k * 2, dummy.matrix);
      dummy.position.set(x, WALL_H - 0.17, z); dummy.updateMatrix(); cap.setMatrixAt(k * 2 + 1, dummy.matrix);
    });
    shaft.castShadow = true; shaft.receiveShadow = true; cap.castShadow = true;
    group.add(shaft, cap);
  }

  // traps: plate + instanced spikes
  let spikes = null;
  if (F.traps.length) {
    const plate = new THREE.InstancedMesh(new THREE.BoxGeometry(TS * 0.8, 0.06, TS * 0.8), new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.4, metalness: 0.6 }), F.traps.length);
    spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xc8c2bb, roughness: 0.25, metalness: 0.85 }), F.traps.length * 5);
    F.traps.forEach((t, k) => {
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set((t.tx + 0.5) * TS, 0.02, (t.ty + 0.5) * TS); dummy.updateMatrix(); plate.setMatrixAt(k, dummy.matrix);
    });
    group.add(plate, spikes);
  }

  // doors: portcullis bars
  const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, WALL_H, 8), new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.3, metalness: 0.9 }), Math.max(1, F.doors.length * 6));
  bars.castShadow = true;
  group.add(bars);

  // torches
  const torchMeshes = [];
  const bracketGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.5, 8);
  const bracketMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 0.6 });
  const cupGeo = new THREE.CylinderGeometry(0.16, 0.08, 0.18, 12);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.8, roughness: 0.35 });
  const flameMat = new THREE.SpriteMaterial({ map: tex.glow, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const coreMat = new THREE.SpriteMaterial({ map: tex.glow, color: 0xfff0b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (const t of F.torches) {
    const g = new THREE.Group();
    g.position.set(t.x, 2.1, t.z);
    const br = new THREE.Mesh(bracketGeo, bracketMat); br.position.y = -0.25; g.add(br);
    const cup = new THREE.Mesh(cupGeo, cupMat); g.add(cup);
    const fl = new THREE.Sprite(flameMat); fl.scale.set(1.3, 1.7, 1); fl.position.y = 0.35; g.add(fl);
    const core = new THREE.Sprite(coreMat); core.scale.set(0.5, 0.7, 1); core.position.y = 0.25; g.add(core);
    group.add(g);
    torchMeshes.push({ fl, core, t, ph: Math.random() * 10 });
  }

  return { group, walls, wallData, spikes, bars, torchMeshes, floors };
}

// Update portcullis bar positions for all doors.
export function updateDoorMeshes(F, M) {
  const dummy = new THREE.Object3D();
  let k = 0;
  for (const d of F.doors) {
    const cx = (d.tx + 0.5) * TS, cz = (d.ty + 0.5) * TS;
    const y = -WALL_H / 2 - 0.1 + (1 - d.open) * WALL_H; // centre height
    for (let b = 0; b < 6; b++) {
      const off = (b - 2.5) * (TS / 6);
      if (d.horiz) dummy.position.set(cx, y, cz + off); else dummy.position.set(cx + off, y, cz);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      M.bars.setMatrixAt(k++, dummy.matrix);
    }
  }
  M.bars.instanceMatrix.needsUpdate = true;
}
