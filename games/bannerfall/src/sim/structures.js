// BANNERFALL :: sim/structures.js - palisades, stone walls, gates, gatehouses, towers, stakes,
// caltrops; fire and burning, boiling oil, repair, and where garrisoned shooters stand.
// Segment structures are thick line pieces a -> b; towers are squares; caltrops are patches.
import { BUILD_TYPES } from '../data/builds.js';

let NEXT = 1;
export function resetStructureIds() { NEXT = 1; }
export const structIdState = { get: () => NEXT, set: (n) => { NEXT = n; } };

const hpMult = (world, team, type) => {
  const tech = world.techs && world.techs[team];
  if (tech && tech.has('bastions') && (type === 'stoneWall' || type === 'stoneGate' || type === 'stoneTower')) return 1.4;
  return 1;
};

export function makeSegment(world, team, type, a, b, opts = {}) {
  const B = BUILD_TYPES[type];
  const hf = world.terrain;
  const base = Math.min(hf.height(a[0], a[1]), hf.height(b[0], b[1]), hf.height((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
  const hp = Math.round(B.hp * hpMult(world, team, type));
  const s = {
    id: 's' + NEXT++, team, type, kind: B.kind, a: [a[0], a[1]], b: [b[0], b[1]],
    hp, maxHp: hp, height: B.height, thick: B.thick || 0.6, base, wood: !!B.wood,
    burning: 0, burnT: 0, fireHits: 0, alive: true, hitT: 0, tag: opts.tag || null, garrison: null, oilT: 0,
  };
  if (world.war) s.inward = inwardOf(world, team, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [b[0] - a[0], b[1] - a[1]]);
  world.structures.set(s.id, s);
  world.structVersion++;
  return s;
}

export function makeTower(world, team, pos, type = 'tower') {
  const B = BUILD_TYPES[type];
  const hf = world.terrain, half = B.size / 2;
  let base = Infinity;
  for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half], [0, 0]]) base = Math.min(base, hf.height(pos[0] + dx, pos[1] + dz));
  const hp = Math.round(B.hp * hpMult(world, team, type));
  const s = {
    id: 's' + NEXT++, team, type, kind: 'tower', pos: [pos[0], pos[1]], size: B.size,
    hp, maxHp: hp, height: B.height, base, alive: true, garrison: null, hitT: 0, burning: 0, burnT: 0, fireHits: 0, wood: !!B.wood,
  };
  // a tower blocks like a fat square: stored as one thick segment for collision
  s.a = [pos[0] - half, pos[1]]; s.b = [pos[0] + half, pos[1]]; s.thick = B.size;
  if (world.war) s.inward = inwardOf(world, team, pos, null);
  world.structures.set(s.id, s);
  world.structVersion++;
  return s;
}

export function makeCaltrops(world, team, pos) {
  const B = BUILD_TYPES.caltrops;
  const s = {
    id: 's' + NEXT++, team, type: 'caltrops', kind: 'caltrops', pos: [pos[0], pos[1]], size: B.size,
    a: [pos[0] - B.size / 2, pos[1]], b: [pos[0] + B.size / 2, pos[1]], thick: B.size,
    hp: B.hp, maxHp: B.hp, height: 0.2, base: world.terrain.height(pos[0], pos[1]), alive: true, hitT: 0, burning: 0,
  };
  world.structures.set(s.id, s);
  world.structVersion++;
  return s;
}

// wall stairs: a ramp of steps against the inner face of a wall (v3.1). It never blocks anyone;
// a foot squad that reaches it can man the wall-walk of the wall it stands against
export function makeStairs(world, team, pos, rot, wallId) {
  const B = BUILD_TYPES.stairs;
  const w = world.structures.get(wallId);
  const s = {
    id: 's' + NEXT++, team, type: 'stairs', kind: 'stairs', pos: [pos[0], pos[1]], size: B.size, rot, wallId,
    a: [pos[0] - 0.5, pos[1]], b: [pos[0] + 0.5, pos[1]], thick: 1, hp: B.hp, maxHp: B.hp, height: w ? w.height : B.height,
    base: world.terrain.height(pos[0], pos[1]), alive: true, hitT: 0, burning: 0, burnT: 0, fireHits: 0, wood: !w || !!w.wood, garrison: null,
  };
  world.structures.set(s.id, s);
  world.structVersion++;
  return s;
}

// a keep (an outpost's timber keep or a castle's stone keep): a big square that blocks like a tower
export function makeKeep(world, team, pos, type, rot = 0) {
  const B = BUILD_TYPES[type];
  const hf = world.terrain, half = B.size / 2;
  let base = Infinity;
  for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half], [0, 0]]) base = Math.min(base, hf.height(pos[0] + dx, pos[1] + dz));
  const s = {
    id: 's' + NEXT++, team, type, kind: 'keep', pos: [pos[0], pos[1]], size: B.size, rot,
    hp: B.hp, maxHp: B.hp, height: B.height, base, alive: true, garrison: null, hitT: 0, burning: 0, burnT: 0, fireHits: 0, wood: !!B.wood,
  };
  s.a = [pos[0] - half, pos[1]]; s.b = [pos[0] + half, pos[1]]; s.thick = B.size;
  world.structures.set(s.id, s);
  world.structVersion++;
  return s;
}

// which way is "inside" for a piece: toward the owner's nearest keep (war maps)
function inwardOf(world, team, m, along) {
  let best = null, bd = Infinity;
  for (const s of world.war.settlements || []) {
    if (s.owner !== team || s.kind === 'village') continue;
    const d = Math.hypot(s.pos[0] - m[0], s.pos[1] - m[1]);
    if (d < bd) { bd = d; best = s.pos; }
  }
  const h = best || world.homeFlag[team] || [m[0], m[1] - 1];
  let dx = h[0] - m[0], dz = h[1] - m[1];
  if (along) { const L = Math.hypot(along[0], along[1]) || 1; let nx = -along[1] / L, nz = along[0] / L; if (nx * dx + nz * dz < 0) { nx = -nx; nz = -nz; } return [nx, nz]; }
  const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}

// closest point on segment and distance
export function segClosest(s, x, z) {
  const ax = s.a[0], az = s.a[1], dx = s.b[0] - ax, dz = s.b[1] - az;
  const L2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - ax) * dx + (z - az) * dz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, pz = az + dz * t;
  return { px, pz, t, d: Math.hypot(x - px, z - pz) };
}

// segment-segment intersection in xz; returns t along p (0..1) or -1
export function segCross(p0x, p0z, p1x, p1z, s) {
  const rx = p1x - p0x, rz = p1z - p0z;
  const sx = s.b[0] - s.a[0], sz = s.b[1] - s.a[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const qx = s.a[0] - p0x, qz = s.a[1] - p0z;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < -0.05 || u > 1.05) return -1;
  return t;
}

// does a structure block movement for this team / unit?
export function blocks(s, team, cav) {
  if (!s.alive) return false;
  if (s.dock && s.dock.team === team) return false;        // a docked siege tower: over the wall
  if (s.kind === 'stairs') return false;
  if (s.kind === 'caltrops') return false;
  if (s.kind === 'gate') return s.team !== team;
  if (s.kind === 'obstacle') return cav;      // stakes stop horses; infantry wade through slowly
  return true;                                 // walls and towers block everyone
}

// structures as a list for fast loops (rebuilt when structVersion changes), plus an 8 m grid
export function structList(world) {
  if (world._structListV !== world.structVersion) {
    world._structList = [...world.structures.values()].filter((s) => s.alive);
    world._structListV = world.structVersion;
    buildStructGrid(world);
  }
  return world._structList;
}
const SG = 8;
function buildStructGrid(world) {
  const W = Math.ceil(world.terrain.size / SG) + 2;
  // only the cells that hold something get a list (a 4 km map has 260 k cells)
  const map = new Map();
  const cells = { get: (k) => map.get(k) };
  const pushCell = (k, s) => { let l = map.get(k); if (!l) { l = []; map.set(k, l); } l.push(s); };
  for (const s of world._structList) {
    const r = (s.kind === 'tower' ? s.size / 2 : (s.thick || 0.6) / 2) + 2.5;
    const x0 = Math.min(s.a[0], s.b[0]) - r, x1 = Math.max(s.a[0], s.b[0]) + r;
    const z0 = Math.min(s.a[1], s.b[1]) - r - (s.kind === 'caltrops' ? s.size / 2 : 0), z1 = Math.max(s.a[1], s.b[1]) + r + (s.kind === 'caltrops' ? s.size / 2 : 0);
    for (let j = Math.max(0, Math.floor(z0 / SG)); j <= Math.min(W - 1, Math.floor(z1 / SG)); j++)
      for (let i = Math.max(0, Math.floor(x0 / SG)); i <= Math.min(W - 1, Math.floor(x1 / SG)); i++) pushCell(j * W + i, s);
  }
  world._sgrid = { W, cells };
}
const EMPTY = [];
export function structsNear(world, x, z) {
  structList(world);
  const G = world._sgrid;
  const i = Math.floor(x / SG), j = Math.floor(z / SG);
  if (i < 0 || j < 0 || i >= G.W || j >= G.W) return EMPTY;
  return G.cells.get(j * G.W + i) || EMPTY;
}

// src: [x, y, z] for the hit effect; opts: { fire, kind: 'melee'|'ram'|'stone'|'arrow', mult }
export function damageStructure(world, s, dmg, src, opts = {}) {
  if (!s.alive) return;
  s.hp -= dmg;
  s.hitT = world.t;
  if (opts.fire && s.wood) {
    s.fireHits = (s.fireHits || 0) + 1;
    if (!s.burning && (s.fireHits >= 3 || world.rng() < 0.18)) ignite(world, s);
  }
  if (s.hp <= 0) {
    s.hp = 0; s.alive = false;
    s.burning = 0;
    world.structVersion++;
    if (!world.firstBreachT && (s.kind === 'gate' || s.kind === 'wall' || s.kind === 'tower') && s.team === 1) world.firstBreachT = world.t;
    world.events.push({ type: 'destroyed', id: s.id, kind: s.kind, stype: s.type, a: s.a, b: s.b, pos: s.pos, team: s.team, base: s.base, height: s.height, tag: s.tag });
    if (s.kind === 'gate' || s.kind === 'wall' || s.kind === 'tower') {
      const own = s.team === 0;
      const text = s.kind === 'gate' ? (own ? 'Our gate is broken!' : 'Their gate is down!') : s.kind === 'tower' ? (own ? 'A tower falls!' : 'An enemy tower falls!') : (own ? 'Our wall is breached!' : 'A breach in their wall!');
      if (world.t - (world._breachToast?.[s.team] ?? -99) > 4) { (world._breachToast = world._breachToast || {})[s.team] = world.t; world.events.push({ type: 'toast', team: own ? 0 : 1, text }); }
      world.breaches = world.breaches || { 0: [], 1: [] };
      if (s.kind !== 'tower') (world.breaches[s.team] = world.breaches[s.team] || []).push({ x: s.pos ? s.pos[0] : (s.a[0] + s.b[0]) / 2, z: s.pos ? s.pos[1] : (s.a[1] + s.b[1]) / 2, t: world.t });
    }
    if (s.garrison) {
      const sq = world.squads.get(s.garrison);
      if (sq) { sq.garrison = null; for (const so of sq.soldiers) if (so.alive) { so.fallT = 0.01; } }
      s.garrison = null;
    }
  } else if (src) {
    world.events.push({ type: 'structHit', id: s.id, x: src[0], y: src[1], z: src[2], stone: !s.wood, kind: opts.kind });
  }
}

export function ignite(world, s) {
  if (!s.wood || !s.alive || s.burning > 0) return;
  s.burning = 20; s.burnT = 0; s.spreadDone = false;
  world.events.push({ type: 'ignite', id: s.id, team: s.team });
  if (world.t - (world._fireToast ?? -99) > 8) { world._fireToast = world.t; world.events.push({ type: 'toast', team: s.team, text: s.team === 0 ? 'Our timber is burning!' : 'Their palisade is alight!' }); }
}

function centre(s) { return s.pos ? s.pos : [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]; }

// burning, boiling oil and repair, once per sim step
export function updateStructures(world, dt) {
  const list = structList(world);
  for (const s of list) {
    if (s.dock && world.tick % 10 === 0) { const t = world.squads.get(s.dock.sq); if (!t || t.alive <= 0 || t.state === 'routing' || t.state === 'gone') { s.dock = null; world.structVersion++; } }
    if (s.burning > 0 && s.alive) {
      s.burning -= dt; s.burnT += dt;
      damageStructure(world, s, 15 * dt);
      if (!s.spreadDone && s.burnT > 7) {
        s.spreadDone = true;
        const [cx, cz] = centre(s);
        for (const o of list) if (o !== s && o.wood && !o.burning && o.alive) {
          const [ox, oz] = centre(o);
          if (Math.hypot(ox - cx, oz - cz) < 5.2 && world.rng() < 0.3) ignite(world, o);
        }
      }
      // men standing in the flames
      if (world.tick % 5 === 0) {
        const [cx, cz] = centre(s);
        for (const so of world.soldiers) if (so.alive && !so.sq.garrison && (so.x - cx) ** 2 + (so.z - cz) ** 2 < 6) so.burnT = Math.max(so.burnT, world.t + 1.5);
      }
    }
    // boiling oil from gatehouses (Murder Holes)
    if (s.type === 'stoneGate' && s.alive && world.techs[s.team].has('murderHoles') && world.phase === 'battle') {
      s.oilT -= dt;
      if (s.oilT <= 0) {
        const [cx, cz] = centre(s);
        let foes = 0;
        for (const so of world.soldiers) if (so.alive && so.sq.team !== s.team && world.hostM && world.hostM[s.team * 9 + so.sq.team] && (so.x - cx) ** 2 + (so.z - cz) ** 2 < 36) foes++;
        if (foes) {
          s.oilT = 20;
          world.events.push({ type: 'oil', x: cx, z: cz, y: s.base + s.height });
          world._oil = world._oil || [];
          world._oil.push({ x: cx, z: cz, team: s.team });
        } else s.oilT = 1;
      }
    }
  }
}

// where a garrisoned squad's men stand: tower platforms or a run of stone wall-walk
export function towerSlots(s, n) {
  const out = [];
  const half = s.size / 2 - 0.6;
  const per = Math.ceil(n / 4);
  for (let i = 0; i < n; i++) {
    const side = i % 4, k = Math.floor(i / 4);
    const u = per > 1 ? -half + (2 * half * (k + 0.5)) / per : 0;
    const p = [[u, half], [half, -u], [-u, -half], [-half, u]][side];
    out.push([s.pos[0] + p[0], s.pos[1] + p[1]]);
  }
  return out;
}
// a chain of joined stone wall pieces around s, long enough for n men at 1.3 m
export function wallChain(world, s, n) {
  const need = n * 1.35;
  const chain = [s];
  let len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
  const walls = structList(world).filter((o) => o.alive && o.team === s.team && o.type === s.type);
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.2;
  let ends = [s.a, s.b];
  for (let guard = 0; guard < 12 && len < need; guard++) {
    let grew = false;
    for (let e = 0; e < 2 && len < need; e++) {
      const p = ends[e];
      const nx = walls.find((o) => !chain.includes(o) && (near(o.a, p) || near(o.b, p)));
      if (!nx) continue;
      chain.push(nx);
      len += Math.hypot(nx.b[0] - nx.a[0], nx.b[1] - nx.a[1]);
      ends[e] = near(nx.a, p) ? nx.b : nx.a;
      grew = true;
    }
    if (!grew) break;
  }
  return chain;
}
export function wallSlots(world, s, n, team) {
  // the chain is a cache of the walls around s: rebuilt whenever any structure changed, so a
  // restored save and a straight run see the same chain
  const chain = s._chain && s._chainN >= n && s._chainV === world.structVersion ? s._chain : wallChain(world, s, n);
  s._chain = chain; s._chainN = n; s._chainV = world.structVersion;
  const pts = [];
  const home = team === 0 ? -1 : 1;   // the walkway sits toward the defenders' side
  for (const w of chain) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz) || 1;
    let nx = -dz / L, nz = dx / L;
    if (w.inward ? nx * w.inward[0] + nz * w.inward[1] < 0 : nz * home < 0) { nx = -nx; nz = -nz; }
    const cnt = Math.max(1, Math.floor(L / 1.35));
    for (let k = 0; k < cnt; k++) {
      const t = (k + 0.5) / cnt;
      // a palisade's men stand on a fire-step behind the stakes, heads and shoulders above them
      pts.push([w.a[0] + dx * t + nx * (w.type === 'stoneWall' ? 0.35 : 0.9), w.a[1] + dz * t + nz * (w.type === 'stoneWall' ? 0.35 : 0.9), w.base + (w.type === 'stoneWall' ? w.height : w.height * 0.62)]);
    }
  }
  // the clicked piece first, then outward
  const c = centre(s);
  pts.sort((p, q) => Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q[0] - c[0], q[1] - c[1]));
  return pts.slice(0, n);
}
export function garrisonSlots(world, st, n, team) {
  if (st.kind === 'tower') { const y = st.base + st.height; return towerSlots(st, n).map((p) => [p[0], p[1], y]); }
  return wallSlots(world, st, n, team);
}
// towers and stone wall-walks always; a palisade once stairs stand against it or a piece joined to
// it (v3.1: "stairs that can go onto walls")
export function stairsFor(world, st) {
  if (!st || st.kind !== 'wall') return null;
  let best = null;
  for (const o of structList(world)) {
    if (!o.alive || o.kind !== 'stairs' || o.team !== st.team) continue;
    const w = world.structures.get(o.wallId);
    if (!w || !w.alive) continue;
    if (w === st || (w.type === st.type && (Math.hypot(w.a[0] - st.a[0], w.a[1] - st.a[1]) < 30 || Math.hypot(w.b[0] - st.b[0], w.b[1] - st.b[1]) < 30))) { best = o; if (w === st) break; }
  }
  return best;
}
export const canGarrison = (st, world) => !!(st && st.alive && (st.kind === 'tower' || st.type === 'stoneWall' || (st.type === 'palisade' && world && stairsFor(world, st))));
