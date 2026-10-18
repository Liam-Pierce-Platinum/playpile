// VENT KIT: straight runs, corners, T-junctions, crossings, vertical shafts and grates, built from collision boxes
// so the hero's crawl (traverse.js) collides with them like any wall. Interior: 1.1 m wide, 0.95 m high, floor at y.
// Every piece registers its interior as a crawl zone; open ends you can enter from a room are "mouths".
// Grates: 'wall' (end of a run: kick it out from inside, pry it off from outside), 'down' (in a vent floor over a
// room: drag the guard below up into the vent, or drop on him), 'up' (in a room floor over a duct: pull him down).
import * as THREE from 'three';
import { removeBox, groundBelow } from '../world.js';
import { registerScript, Script } from '../finisher.js';
import { sfx } from '../audio.js';
import { mat } from './mats.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const VW = 1.1, VH = 0.95, VT = 0.08; // interior width, interior height, sheet thickness
const A = (x, y, z, bend, k = 40) => ({ dir: V(x, y, z), bend, k });
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const SIDES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

// a grate panel mesh: frame + slats (dark steel)
function grateMesh(w, d) {
  const g = new THREE.Group(), m = mat('steel');
  for (const [x, z, sx, sz] of [[0, -d / 2, w, 0.05], [0, d / 2, w, 0.05], [-w / 2, 0, 0.05, d], [w / 2, 0, 0.05, d]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), m); b.position.set(x, 0, z); g.add(b); }
  for (let i = 1; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, d), m); b.position.set(-w / 2 + i * w / 8, 0, 0); b.rotation.z = 0.5; g.add(b); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function ventKit(L) {
  const M = () => ({ mat: 'vent', tile: 1.2, flags: { vent: true } });
  const zone = (minX, minZ, maxX, maxZ, y, h = VH) => { const z = { min: V(minX, y, minZ), max: V(maxX, y + h, maxZ) }; L.crawlZones.push(z); return z; };
  // a run's floor (or ceiling) with grate holes: segments of sheet between 1.0 m holes, each hole filled by a grate
  const sheet = (ax, a0, a1, c, y, holes, orient) => {
    const cuts = [...holes].sort((p, q) => p - q); let s = a0;
    const part = (u0, u1) => { if (u1 - u0 < 0.02) return; const mid = (u0 + u1) / 2, len = u1 - u0; ax === 'x' ? L.box(mid, y, c, len, VT, VW + 2 * VT, M()) : L.box(c, y, mid, VW + 2 * VT, VT, len, M()); };
    for (const hc of cuts) { part(s, hc - 0.5); const gx = ax === 'x' ? hc : c, gz = ax === 'x' ? c : hc; K.grate(gx, y, gz, { orient, w: ax === 'x' ? 1.0 : VW, d: ax === 'x' ? VW : 1.0 }); s = hc + 0.5; }
    part(s, a1);
  };
  const K = {
    // straight run between two points on one axis (centreline, floor height y).
    // o: { start/end: 'open' (default) | 'cap' | 'grate' | 'mouth' (open + enterable from a room),
    //      down: [distances along the run from the start] = grates in the floor (over a room),
    //      up: [distances] = grates in the ceiling (under a room floor) }
    run(x0, z0, x1, z1, y, o = {}) {
      const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z';
      const a0 = ax === 'x' ? Math.min(x0, x1) : Math.min(z0, z1), a1 = ax === 'x' ? Math.max(x0, x1) : Math.max(z0, z1), c = ax === 'x' ? z0 : x0;
      const rev = ax === 'x' ? x1 < x0 : z1 < z0; // start is at a1 when reversed
      const toAbs = d => rev ? a1 - d : a0 + d;
      sheet(ax, a0, a1, c, y - VT, (o.down || []).map(toAbs), 'down');
      sheet(ax, a0, a1, c, y + VH, (o.up || []).map(toAbs), 'up');
      for (const s of [-1, 1]) { const off = c + s * (VW / 2 + VT / 2); ax === 'x' ? L.box((a0 + a1) / 2, y - VT, off, a1 - a0, VH + 2 * VT, VT, M()) : L.box(off, y - VT, (a0 + a1) / 2, VT, VH + 2 * VT, a1 - a0, M()); }
      const ends = [[rev ? 'end' : 'start', a0, -1], [rev ? 'start' : 'end', a1, 1]];
      for (const [key, a, sg] of ends) {
        const kind = o[key] || 'open', ex = ax === 'x' ? a + sg * VT / 2 : c, ez = ax === 'x' ? c : a + sg * VT / 2;
        const out = ax === 'x' ? V(sg, 0, 0) : V(0, 0, sg);
        if (kind === 'cap') ax === 'x' ? L.box(ex, y - VT, ez, VT, VH + 2 * VT, VW + 2 * VT, M()) : L.box(ex, y - VT, ez, VW + 2 * VT, VH + 2 * VT, VT, M());
        if (kind === 'grate') K.grate(ex, y, ez, { orient: 'wall', n: out });
        if (kind === 'mouth' || kind === 'grate') K.mouth(ax === 'x' ? a : c, y, ax === 'x' ? c : a, out);
      }
      return ax === 'x' ? zone(a0, c - VW / 2, a1, c + VW / 2, y) : zone(c - VW / 2, a0, c + VW / 2, a1, y);
    },
    // a junction cell (VW square) open on the listed sides: 2 = corner, 3 = T-junction, 4 = crossing.
    // open: ['+x', '-z', ...]; o: { down: true / up: true = a grate in its floor / ceiling }
    cell(x, z, y, open = [], o = {}) {
      const S = VW / 2;
      if (o.down) K.grate(x, y - VT, z, { orient: 'down', w: VW, d: VW }); else L.box(x, y - VT, z, VW + 2 * VT, VT, VW + 2 * VT, M());
      if (o.up) K.grate(x, y + VH, z, { orient: 'up', w: VW, d: VW }); else L.box(x, y + VH, z, VW + 2 * VT, VT, VW + 2 * VT, M());
      for (const sd of ['+x', '-x', '+z', '-z']) {
        const [dx, dz] = SIDES[sd]; const wx = x + dx * (S + VT / 2), wz = z + dz * (S + VT / 2);
        if (!open.includes(sd)) dx ? L.box(wx, y - VT, wz, VT, VH + 2 * VT, VW + 2 * VT, M()) : L.box(wx, y - VT, wz, VW + 2 * VT, VH + 2 * VT, VT, M());
      }
      return zone(x - S, z - S, x + S, z + S, y);
    },
    corner(x, z, y, a, b, o) { return K.cell(x, z, y, [a, b], o); },
    tee(x, z, y, a, b, c, o) { return K.cell(x, z, y, [a, b, c], o); },
    cross(x, z, y, o) { return K.cell(x, z, y, ['+x', '-x', '+z', '-z'], o); },
    // vertical shaft (1.3 m square inside) from y0 (floor) to y1, with a ladder up one wall to an opening.
    // o: { exits: [{ y, side }] = horizontal runs joining the shaft (their floor height and side), ladder: side
    //      (default: the top exit's side), cap: true = closed top, floor: true = a floor at y0 }
    shaft(x, z, y0, y1, o = {}) {
      const S = 0.65, exits = o.exits || [];
      if (o.floor !== false) L.box(x, y0 - VT, z, 2 * S + 2 * VT, VT, 2 * S + 2 * VT, M());
      if (o.cap) L.box(x, y1, z, 2 * S + 2 * VT, VT, 2 * S + 2 * VT, M());
      for (const sd of ['+x', '-x', '+z', '-z']) {
        const [dx, dz] = SIDES[sd], wx = x + dx * (S + VT / 2), wz = z + dz * (S + VT / 2);
        const holes = exits.filter(e => e.side === sd).sort((p, q) => p.y - q.y); let ys = y0 - VT;
        const part = (u0, u1) => { if (u1 - u0 < 0.02) return; dx ? L.box(wx, u0, wz, VT, u1 - u0, 2 * S + 2 * VT, M()) : L.box(wx, u0, wz, 2 * S + 2 * VT, u1 - u0, VT, M()); };
        for (const e of holes) { part(ys, e.y); ys = e.y + VH; }
        part(ys, y1);
      }
      const top = [...exits].sort((p, q) => q.y - p.y)[0], ls = o.ladder || top?.side || '+x', [lx, lz] = SIDES[ls];
      // the ladder runs up the wall under the top exit; climbing off its top mantles you into that run
      L.ladder(x + lx * (S - 0.08), z + lz * (S - 0.08), { face: ['+x', '-x', '+z', '-z'][['-x', '+x', '-z', '+z'].indexOf(ls)], y0, y1: top ? top.y : y1, w: 0.5, tight: true });
      return zone(x - S, z - S, x + S, z + S, y0, y1 - y0);
    },
    // an entry you can walk up to from a room and crawl into (a floor-level opening in a wall).
    // (x, y, z) = the open end of the run, out = unit vector pointing out of the vent into the room
    mouth(x, y, z, out) {
      const m = { at: V(x, y, z), out: out.clone(), min: V(Math.min(x, x + out.x * 1.1) - (out.x ? 0 : VW / 2), y, Math.min(z, z + out.z * 1.1) - (out.z ? 0 : VW / 2)), max: V(Math.max(x, x + out.x * 1.1) + (out.x ? 0 : VW / 2), y + VH, Math.max(z, z + out.z * 1.1) + (out.z ? 0 : VW / 2)) };
      L.mouths.push(m); return m;
    },
    // a grate (center x,z; y = its bottom face). orient 'wall' needs n (outward normal); 'down'/'up' lie flat.
    grate(x, y, z, o = {}) {
      const orient = o.orient || 'down', n = o.n || V(0, orient === 'up' ? 1 : -1, 0);
      let b, mesh;
      if (orient === 'wall') {
        const alongX = !n.x; b = L.box(x, y, z, alongX ? VW : VT, VH, alongX ? VT : VW, { visible: false, flags: { grate: true, noClimb: true } });
        mesh = grateMesh(VW, VH); mesh.rotation.x = Math.PI / 2; if (!alongX) mesh.rotation.z = Math.PI / 2;
        const g0 = new THREE.Group(); g0.add(mesh); g0.position.set(x, y + VH / 2, z); L.deco(g0); mesh = g0;
      } else {
        const w = o.w || 1.0, d = o.d || VW;
        b = L.box(x, y, z, w, VT, d, { visible: false, flags: { grate: true } });
        mesh = grateMesh(w, d); mesh.position.set(x, y + VT / 2, z); L.deco(mesh);
      }
      const G = { b, mesh, orient, n, at: V(x, y, z), open: false };
      G.pop = (vel) => { if (G.open) return; G.open = true; removeBox(G.b); L.fling(G.mesh, vel || V(n.x * 4, 2, n.z * 4)); sfx.metal(); L.G.noise?.(G.at, orient === 'wall' ? 7 : 4, false); L.emit('grate', G); };
      L.grates.push(G); return G;
    },
  };
  return K;
}

// --- vent takedowns: the Script machinery (finisher.js) with these campaign-only scripts ---
const limp = { armL: A(0.1, -1, 0.2, 0.2, 8), armR: A(-0.1, -1, 0.2, 0.2, 8) };
const crawlLegs = { tl: -0.75, tr: -0.6, kl: 1.5, kr: 1.4 };
// from a floor grate in the vent: both arms shoot down, grab him by the head, haul him up through the hole, claws in
registerScript('ventdrag', { silent: true, dur: 1.7, f: (t, F) => {
  const grab = ease(seg(t, 0, 0.22)), up = ease(seg(t, 0.25, 0.7)), lay = ease(seg(t, 0.7, 0.95));
  const gp = F.grate.at, top = V(gp.x, F.y0 - 1.75, gp.z);
  const p = F.ePos0.clone().lerp(top, up); p.y += lay * 1.75 + lay * 0.1;
  p.addScaledVector(F.fwd, -lay * 0.6);
  return { heroPos: F.base, grounded: true, hero: { crawl: true, legs: crawlLegs, torsoX: 0.1 + grab * 0.3, armL: A(0.15, -1, 0.3 - up * 0.4, lerp(0.1, 1.4, up), 40), armR: A(-0.15, -1, 0.3 - up * 0.4, lerp(0.1, 1.4, up), 40), headX: 0.3 },
    enAbs: p, eyaw: F.yaw + Math.PI, px: -lay * Math.PI / 2, air: true, pose: { ...limp, scramble: up * (1 - lay), armL: A(0.4, 1, 0.3, 0.4, 12), armR: A(-0.4, 1, 0.3, 0.4, 12) },
    cam: { yaw: 1.5, pitch: 0.55, dist: 2.2, fov: 64 } };
}, ev: [[0.24, s => { s.G.fx.sparksAt(s.grate.at, V(0, -1, 0), 6, 0.6); sfx.metal(); }], [0.95, s => { s.slow(0.4, 0.4); s.stab(['R'], 'torso', 0.8, V(0, -1, 0)); }], [1.2, s => s.stab(['L'], 'torso', 0.6, V(0, -1, 0))], [1.7, s => s.kill([], 0)]] });
// from a duct under a room: arms up through the grate, pull him down by the ankles, claws into the chest
registerScript('ventpull', { silent: true, dur: 1.6, f: (t, F) => {
  const reach = ease(seg(t, 0, 0.2)), down = Math.pow(seg(t, 0.22, 0.55), 1.5), lay = ease(seg(t, 0.55, 0.8));
  const gp = F.grate.at, bottom = V(gp.x, F.y0 + 0.05, gp.z);
  const p = F.ePos0.clone().lerp(bottom, down); p.addScaledVector(F.fwd, lay * 0.4);
  return { heroPos: F.base, grounded: true, hero: { crawl: true, legs: crawlLegs, torsoX: -0.3 * reach, armL: A(0.15, 1, 0.3, lerp(0.2, 1.2, down), 40), armR: A(-0.15, 1, 0.3, lerp(0.2, 1.2, down), 40), headX: -0.6 },
    enAbs: p, eyaw: F.yaw, px: lay * Math.PI / 2, air: true, pose: { ...limp, scramble: down * (1 - lay), armL: A(0.6, 0.8, 0.2, 0.4, 12), armR: A(-0.6, 0.8, 0.2, 0.4, 12) },
    cam: { yaw: 1.2, pitch: -0.2, dist: 2.2, fov: 64 } };
}, ev: [[0.22, s => { s.G.fx.sparksAt(s.grate.at, V(0, 1, 0), 6, 0.6); sfx.metal(); }], [0.85, s => { s.slow(0.4, 0.4); s.stab(['L', 'R'], 'torso', 0.9); }], [1.6, s => s.kill([], 0)]] });

// what the hero can do with the vents right now: { k, label, grate, e } or null (used for E, Space and the hint)
export function ventAction(L, h) {
  if (h.fin || h.dead) return null;
  const G = L.G, p = h.pos;
  let best = null, bd = 1e9;
  for (const g of L.grates) {
    if (g.open) continue;
    const flat = Math.hypot(g.at.x - p.x, g.at.z - p.z);
    if (g.orient === 'down' && h.crawling && flat < 1.6 && Math.abs(g.at.y + VT - p.y) < 0.3) {
      for (const e of G.enemies) {
        if (!e.alive || e.held || e.spawnT > 0) continue;
        const ef = Math.hypot(e.pos.x - g.at.x, e.pos.z - g.at.z), dy = p.y - e.pos.y;
        if (dy < 1.5 || dy > 7) continue;
        const sees = e.mode === 'alert' && e.canSeePoint(h.center);
        if (ef < 1.3 && !sees && h.clawsOut && flat + ef < bd) { bd = flat + ef; best = { k: 'drag', grate: g, e, label: 'E  DRAG HIM IN  ·  SPACE  DROP ON HIM' }; }
        else if (ef < 4.5 && !sees && h.clawsOut && !best && flat + ef < bd) { bd = flat + ef; best = { k: 'drop', grate: g, e, label: 'SPACE  DROP ON HIM' }; }
      }
      if (!best && flat < 1.0) best = { k: 'open', grate: g, label: 'SPACE  DROP THROUGH THE GRATE' };
    }
    if (g.orient === 'up' && h.crawling && flat < 1.6 && p.y < g.at.y - 0.5) {
      for (const e of G.enemies) {
        if (!e.alive || e.held || e.spawnT > 0) continue;
        const ef = Math.hypot(e.pos.x - g.at.x, e.pos.z - g.at.z), dy = e.pos.y - p.y;
        if (ef < 1.2 && dy > 0.6 && dy < 2.5 && h.clawsOut && flat + ef < bd) { bd = flat + ef; best = { k: 'pull', grate: g, e, label: 'E  PULL HIM DOWN' }; }
      }
    }
    if (g.orient === 'wall' && flat < 1.5 && Math.abs(g.at.y - p.y) < 0.4 && !best) best = h.crawling ? { k: 'kick', grate: g, label: 'E  KICK OUT THE GRATE' } : { k: 'pry', grate: g, label: 'E  PRY THE GRATE OFF' };
  }
  if (!best && h.clawsOut === false && h.crawling && L.grates.some(g => !g.open && g.orient !== 'wall' && Math.hypot(g.at.x - p.x, g.at.z - p.z) < 1.6)) return { k: 'claws', label: 'Unsheathe (LMB + RMB) to take him through the grate' };
  return best;
}
// run it. key: 'E' | 'Space'. Returns true when the input was used.
export function ventDo(L, h, key) {
  const a = ventAction(L, h); if (!a) return false;
  const G = L.G;
  if (a.k === 'drag' && key === 'E') { a.grate.pop(V(0, -2, 0)); h.fin = new Script(G, h, a.e, 'ventdrag'); h.fin.grate = a.grate; return true; }
  if (a.k === 'pull' && key === 'E') { a.grate.pop(V(0, 3, 0)); h.fin = new Script(G, h, a.e, 'ventpull'); h.fin.grate = a.grate; return true; }
  if ((a.k === 'drag' || a.k === 'drop') && key === 'Space') {
    a.grate.pop(V(0, -3, 0)); h.crawling = false; h.tight = false;
    h.pos.x = a.grate.at.x; h.pos.z = a.grate.at.z; // out through the hole, onto him
    h.fin = new Script(G, h, a.e, 'pounce'); return true;
  }
  if (a.k === 'open' && key === 'Space') { a.grate.pop(V(0, -3, 0)); h.pos.x = a.grate.at.x; h.pos.z = a.grate.at.z; h.crawling = false; h.tight = false; h.vel.set(0, 0, 0); return true; }
  if (a.k === 'kick' && key === 'E') { h.crawlKick = { t: 0, grate: a.grate }; return true; }
  if (a.k === 'pry' && key === 'E') { a.grate.pop(a.grate.n.clone().multiplyScalar(2).setY(1.5)); return true; }
  return a.k === 'claws';
}
export { groundBelow };
