// BANNERFALL :: sim/projectiles.js - real ballistic arrows, bolts and boulders (DESIGN.md 4.4).
import { C } from '../data/constants.js';
import { applyDamage, forNear } from './combat.js';
import { structList, segCross, damageStructure, segClosest, structsNear } from './structures.js';
import { hostile } from './factions.js';

const G = C.GRAVITY;

// launch angle for speed v to hit (d horizontal, dy vertical). high=true picks the lob.
export function solveAngle(v, d, dy, high) {
  const v2 = v * v;
  const disc = v2 * v2 - G * (G * d * d + 2 * dy * v2);
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  return Math.atan2(high ? v2 + s : v2 - s, G * d);
}

// does a flat-ish arc from p to q pass through a wall or a hill? samples the parabola
function arcBlocked(world, p, vx, vy, vz, tFlight, team, ignoreId) {
  const hf = world.terrain, ss = structList(world);
  const n = Math.max(4, Math.ceil(tFlight / 0.12));
  let px = p[0], py = p[1], pz = p[2];
  for (let i = 1; i <= n; i++) {
    const t = (tFlight * i) / n;
    const x = p[0] + vx * t, y = p[1] + vy * t - 0.5 * G * t * t, z = p[2] + vz * t;
    if (i < n - 1 && hf.height(x, z) > y + 0.2) return true;
    for (const s of ss) {
      if (s.kind === 'obstacle' || s.kind === 'caltrops' || s.id === ignoreId) continue;
      const u = segCross(px, pz, x, z, s);
      if (u < 0) continue;
      const yy = py + (y - py) * u;
      if (yy < s.base + s.height + 0.3 && yy > s.base - 1) {
        // shooting out of your own tower or off your own wall is fine
        if (s.garrison && s.team === team) continue;
        return true;
      }
    }
    px = x; py = y; pz = z;
  }
  return false;
}

/**
 * Fire from shooter soldier at a target soldier, or at a point {x, y, z, pt: true, structId}.
 * Returns the projectile or null if there is no shot.
 */
export function fire(world, shooter, target) {
  const sq = shooter.sq, R = sq.def.ranged;
  if (R.kind === 'stone') return lob(world, shooter, target);
  const isBolt = R.kind === 'bolt';
  const from = [shooter.x + Math.sin(shooter.facing) * 0.4, shooter.y + 1.55, shooter.z + Math.cos(shooter.facing) * 0.4];
  const pt = !!target.pt;
  let tx = target.x, tz = target.z;
  const ty = pt ? target.y : target.y + (target.sq.def.tags.includes('cavalry') ? 1.6 : target.sq.def.engine ? 1.4 : 1.0);
  let d = Math.hypot(tx - from[0], tz - from[2]);
  if (!pt) for (let it = 0; it < 2; it++) {
    const tf = d / (R.muzzle * 0.92);
    tx = target.x + target.vx * tf; tz = target.z + target.vz * tf;
    d = Math.hypot(tx - from[0], tz - from[2]);
  }
  // spread: gaussian, sigma grows with distance, tighter with veterancy
  const sigma = (0.35 + 0.016 * d) * Math.pow(0.85, sq.vet) * (pt ? 0.6 : 1);
  const rng = world.rng;
  tx += rng.gauss() * sigma; tz += rng.gauss() * sigma * 0.9;
  d = Math.hypot(tx - from[0], tz - from[2]);
  const dy = ty - from[1];
  let high = false;
  let ang = solveAngle(R.muzzle, d, dy, false);
  if (ang === null) return null;
  const dirx = (tx - from[0]) / d, dirz = (tz - from[2]) / d;
  let vh = R.muzzle * Math.cos(ang), vy = R.muzzle * Math.sin(ang);
  let tFlight = d / vh;
  if (arcBlocked(world, from, dirx * vh, vy, dirz * vh, tFlight, sq.team, target.structId)) {
    if (isBolt) return null;                       // crossbows need a clear shot
    const hi = solveAngle(R.muzzle, d, dy, true);
    if (hi === null) return null;
    high = true; ang = hi;
    vh = R.muzzle * Math.cos(ang); vy = R.muzzle * Math.sin(ang); tFlight = d / vh;
  }
  const fireA = sq.fireArrows && R.kind === 'arrow';
  const p = {
    kind: fireA ? 'fire' : R.kind, team: sq.team,
    x: from[0], y: from[1], z: from[2], vx: dirx * vh, vy, vz: dirz * vh,
    dmg: R.dmg, pierce: R.pierce || 0, owner: shooter, fromY: from[1], age: 0, alive: true, high,
    id: world.projSeq++,
  };
  world.projectiles.push(p);
  world.events.push({ type: 'shoot', kind: p.kind, x: from[0], y: from[1], z: from[2], team: p.team, bolt: isBolt, high });
  return p;
}

// mangonel / trebuchet: a big lob at ~50 degrees with a speed chosen to land on the point
function lob(world, shooter, target) {
  const sq = shooter.sq, R = sq.def.ranged;
  const from = [shooter.x + Math.sin(shooter.facing) * 1.2, shooter.y + (sq.type === 'trebuchet' ? 7 : 3.2), shooter.z + Math.cos(shooter.facing) * 1.2];
  let tx = target.x, tz = target.z;
  const ty = target.pt ? target.y : target.y;
  const rng = world.rng;
  let d = Math.hypot(tx - from[0], tz - from[2]);
  const sigma = (target.pt ? 1.0 : 1.8) + d * 0.012;
  tx += rng.gauss() * sigma; tz += rng.gauss() * sigma;
  d = Math.hypot(tx - from[0], tz - from[2]);
  const th = 0.88, dy = ty - from[1];
  const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy);
  if (den <= 0) return null;
  const v = Math.sqrt((G * d * d) / den);
  const dirx = (tx - from[0]) / (d || 1), dirz = (tz - from[2]) / (d || 1);
  const p = {
    kind: 'stone', team: sq.team, x: from[0], y: from[1], z: from[2],
    vx: dirx * v * Math.cos(th), vy: v * Math.sin(th), vz: dirz * v * Math.cos(th),
    dmg: R.dmg, structDmg: R.structDmg, splash: R.splash, pierce: R.pierce || 0, owner: shooter, fromY: from[1], age: 0, alive: true, high: true,
    id: world.projSeq++, big: sq.type === 'trebuchet', aim: [tx, tz],
  };
  world.projectiles.push(p);
  world.events.push({ type: 'shoot', kind: 'stone', x: from[0], y: from[1], z: from[2], team: p.team, engine: sq.type, sq: sq.id });
  return p;
}

function stoneImpact(world, p, x, y, z, hitStruct) {
  const R = p.splash;
  const owner = p.owner && p.owner.alive !== undefined ? p.owner : null;
  // structures in the splash: the one struck takes it all, the rest a share
  for (const st of structList(world)) {
    if (!st.alive || !hostile(world, p.team, st.team)) continue;
    const c = st.kind === 'tower' || st.kind === 'caltrops' ? { d: Math.hypot(x - st.pos[0], z - st.pos[1]) - st.size / 2 } : segClosest(st, x, z);
    const reach = R + (st.thick || 0.6) / 2;
    if (c.d > reach) continue;
    const share = st === hitStruct ? 1 : Math.max(0.25, 1 - c.d / reach) * 0.6;
    damageStructure(world, st, p.structDmg * share, [x, y, z], { kind: 'stone' });
  }
  forNear(world, x, z, R + 1, (o) => {
    if (!o.alive || !hostile(world, p.team, o.sq.team)) return;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d > R) return;
    if (o.sq.garrison && Math.abs(o.y - y) > 4) return;
    applyDamage(world, owner, o, p.dmg * (1 - (d / R) * 0.6), { ranged: true, splash: true, kind: 'stone', pierce: p.pierce, fromX: x, fromZ: z, quiet: true });
    if (o.alive && !o.sq.def.engine && !o.sq.def.tags.includes('cavalry') && d < R * 0.6) o.knockUntil = world.t + 0.9;
  });
  world.events.push({ type: 'boom', x, y, z, r: R, big: !!p.big, team: p.team });
}

export function updateProjectiles(world, dt) {
  const hf = world.terrain;
  const ss = structList(world);
  const list = world.projectiles;
  const SUB = 2, h = dt / SUB;
  for (const p of list) {
    if (!p.alive) continue;
    for (let s = 0; s < SUB && p.alive; s++) {
      const ox = p.x, oy = p.y, oz = p.z;
      p.vy -= G * h;
      p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      p.age += h;
      // structures
      for (const st of structsNear(world, p.x, p.z)) {
        if (!st.alive || st.kind === 'obstacle' || st.kind === 'caltrops') continue;
        if (st.garrison && st.team === p.team) continue;
        if (p.kind === 'stone' && st.team === p.team) continue;
        const u = segCross(ox, oz, p.x, p.z, st);
        if (u < 0) continue;
        const yy = oy + (p.y - oy) * u;
        if (yy < st.base + st.height && yy > st.base - 0.5) {
          p.alive = false;
          const hx = ox + (p.x - ox) * u, hz = oz + (p.z - oz) * u;
          if (p.kind === 'stone') { stoneImpact(world, p, hx, yy, hz, st); break; }
          world.events.push({ type: 'stick', x: hx, y: yy, z: hz, vx: p.vx, vy: p.vy, vz: p.vz, kind: p.kind, wood: st.wood, stone: !st.wood });
          if (hostile(world, p.team, st.team)) {
            const fire = p.kind === 'fire';
            damageStructure(world, st, fire && st.wood ? 30 : p.kind === 'bolt' ? 2 : 0.5, [hx, yy, hz], { fire, kind: 'arrow' });
          }
          break;
        }
      }
      if (!p.alive) break;
      // soldiers (boulders fly over heads and only land)
      if (p.age > 0.08 && p.kind !== 'stone') {
        let hit = null;
        forNear(world, p.x, p.z, 2.0, (o) => {
          if (hit || !o.alive || !hostile(world, p.team, o.sq.team)) return;
          const cav = o.sq.def.tags.includes('cavalry'), eng = o.sq.def.engine;
          const r = eng ? 1.5 : cav ? 0.85 : 0.42;
          const top = o.y + (eng ? 3 : cav ? 2.5 : 1.85);
          if (p.y < o.y || p.y > top) return;
          const sx = p.x - ox, sz = p.z - oz, L2 = sx * sx + sz * sz || 1e-6;
          let t = ((o.x - ox) * sx + (o.z - oz) * sz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = ox + sx * t - o.x, dz = oz + sz * t - o.z;
          if (dx * dx + dz * dz < r * r) hit = o;
        });
        if (hit) {
          p.alive = false;
          const sh = p.owner;
          const dmg = applyDamage(world, sh && sh.alive !== undefined ? sh : null, hit, p.dmg,
            { ranged: true, kind: p.kind, pierce: p.pierce, fromX: hit.x - p.vx, fromZ: hit.z - p.vz, fromY: p.fromY });
          if (p.kind === 'fire') hit.burnT = world.t + 3;
          world.events.push({ type: 'arrowHit', x: p.x, y: p.y, z: p.z, dmg, team: hit.sq.team, fire: p.kind === 'fire' });
          break;
        }
      }
      // ground / water
      const gy = hf.height(p.x, p.z);
      if (p.y <= gy) {
        p.alive = false;
        if (p.kind === 'stone') { stoneImpact(world, p, p.x, gy, p.z, null); break; }
        const water = gy < hf.waterLevel - 0.05;
        world.events.push({ type: water ? 'splash' : 'stick', x: p.x, y: water ? hf.waterLevel : gy, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, kind: p.kind });
        break;
      }
      if (p.age > 14 || !hf.inside(p.x, p.z, -20)) p.alive = false;
    }
  }
  // compact
  if (list.length > 64 && world.tick % 20 === 0) world.projectiles = list.filter((p) => p.alive);
}
