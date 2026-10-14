// sim.js - the fight. Pure and seeded: no DOM, so tools/*.mjs can run whole
// fights in node. The renderer only reads `b.units`, `b.projs`, `b.zones` and
// drains `b.events`.
//
// Arena space: 5 wide x 4 tall cells. Side 0 (you) holds rows y=2.5 (front)
// and y=3.5 (back); side 1 holds y=1.5 (front) and y=0.5 (back).

import { UNIT, MINION, TRAITS, ITEM, STAR_MULT, ABIL_MULT } from './data.js';
import { rng } from './rng.js';

export const ARENA_W = 5, ARENA_H = 4;
const DT = 1 / 30;
export const FIGHT_SOFT = 30, FIGHT_HARD = 50;

export function cellPos(side, c, r) {
  const x = c + 0.5;
  const y = side === 0 ? (r === 0 ? 2.5 : 3.5) : (r === 0 ? 1.5 : 0.5);
  return { x, y };
}

// Count unique unit types per trait. Returns { trait: { n, lvl, v } }
export function traitCounts(ids) {
  const seen = new Set(ids.filter(Boolean));
  const out = {};
  for (const id of seen) {
    const d = UNIT[id]; if (!d) continue;
    for (const t of [d.origin, d.cls]) { out[t] = out[t] || { n: 0, lvl: 0, v: 0 }; out[t].n++; }
  }
  for (const [t, o] of Object.entries(out)) {
    const tr = TRAITS[t]; let lvl = 0;
    tr.t.forEach((bp, i) => { if (o.n >= bp) lvl = i + 1; });
    o.lvl = lvl; o.v = lvl ? tr.v[lvl - 1] : 0;
  }
  return out;
}

let UID = 1;
function makeUnit(b, side, spec, traits, def = UNIT[spec.id]) {
  const star = spec.star || 1;
  const sm = STAR_MULT[star];
  const p = spec.x != null ? { x: spec.x, y: spec.y } : cellPos(side, spec.c, spec.r);
  const u = {
    uid: UID++, side, id: def.id, def, star, items: spec.items || [],
    x: p.x, y: p.y, hx: p.x, hy: p.y,
    maxHp: def.hp * sm, atk: def.atk * sm, as: def.as, range: def.range, armor: def.armor,
    mana: 0, maxMana: def.mana, shield: 0, ap: 0, crit: 0, leech: 0, thorns: 0, revive: 0,
    asPct: 0, atkMult: 1, beastGrow: 0, burnPct: 0, gloomAmp: 0, regen: 0, tideMana: 0,
    alive: true, target: null, cd: 0.3 + b.R() * 0.4, retarget: 0, stun: 0, taunt: 0, buffAs: 0, buffT: 0,
    burn: null, face: side === 0 ? 1 : -1,
    anim: { lunge: 0, hurt: 0, cast: 0, spawn: spec.summoned ? 0.35 : 0 },
    dealt: 0, taken: 0, kills: 0, summoned: !!spec.summoned, rogue: def.cls === 'rogue', leaped: false,
  };
  // items
  for (const iid of u.items) {
    const m = ITEM[iid]?.mod || {};
    if (m.atk) u.atk += m.atk * (0.7 + 0.3 * star);
    if (m.asPct) u.asPct += m.asPct;
    if (m.ap) u.ap += m.ap;
    if (m.armor) u.armor += m.armor;
    if (m.hp) u.maxHp += m.hp * (0.7 + 0.3 * star);
    if (m.mana0) u.mana += m.mana0;
    if (m.thorns) u.thorns += m.thorns;
    if (m.leech) u.leech += m.leech;
    if (m.crit) u.crit += m.crit;
    if (m.revive) u.revive = Math.max(u.revive, m.revive);
  }
  // traits
  if (!u.summoned) {
    const T = traits, cls = def.cls, org = def.origin;
    const lv = t => (T[t] && T[t].lvl) || 0, val = t => (T[t] && T[t].v) || 0;
    if (cls === 'knight' && lv('knight')) u.shield += val('knight');
    else if (lv('knight') === 3) u.shield += val('knight') / 2;
    if (cls === 'mage') u.ap += val('mage');
    if (cls === 'beast') u.beastGrow = val('beast') / 100;
    if (cls === 'undead' && lv('undead')) u.revive = Math.max(u.revive, val('undead'));
    if (cls === 'ranger') u.asPct += val('ranger');
    if (cls === 'rogue') u.crit += val('rogue');
    if (org === 'sylvan' || lv('sylvan') === 3) u.regen = val('sylvan') / 100;
    if (org === 'ember') u.burnPct = val('ember') / 100;
    if (org === 'tide' || lv('tide') === 3) u.tideMana = val('tide');
    if (org === 'gloom') u.gloomAmp = val('gloom') / 100;
  }
  u.hp = u.maxHp;
  u.mana = Math.min(u.mana, u.maxMana - 1);
  return u;
}

export function createBattle(teamA, teamB, seed = 1) {
  const b = { t: 0, R: rng(seed), units: [], projs: [], zones: [], events: [], over: false, winner: -1, hitstop: 0 };
  b.traits = [traitCounts(teamA.map(s => s.id)), traitCounts(teamB.map(s => s.id))];
  teamA.forEach(s => b.units.push(makeUnit(b, 0, s, b.traits[0])));
  teamB.forEach(s => b.units.push(makeUnit(b, 1, s, b.traits[1])));
  if (!teamA.length || !teamB.length) { b.over = true; b.winner = teamA.length ? 0 : teamB.length ? 1 : -1; }
  return b;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const reach = u => u.range * 0.92 + 0.2;
const foes = (b, u) => b.units.filter(o => o.alive && o.side !== u.side);
const pals = (b, u) => b.units.filter(o => o.alive && o.side === u.side);
const ev = (b, e) => { b.events.push(e); if (b.events.length > 400) b.events.splice(0, 100); };

function heal(b, u, amt) {
  if (!u.alive || amt <= 0) return;
  const h = Math.min(amt, u.maxHp - u.hp);
  u.hp += h;
  if (h > 25) ev(b, { t: 'heal', x: u.x, y: u.y, amt: h | 0 });
}

function damage(b, src, tgt, amt, type) {
  if (!tgt.alive || amt <= 0) return 0;
  let crit = false;
  if (type === 'atk') {
    if (src && src.crit > 0 && b.R() * 100 < src.crit) { amt *= 2; crit = true; }
    amt *= 100 / (100 + tgt.armor);
  } else if (type === 'abil') {
    amt *= 100 / (100 + tgt.armor * 0.4);
  }
  if (src && src.gloomAmp && tgt.hp < tgt.maxHp / 2) amt *= 1 + src.gloomAmp;
  let rest = amt;
  if (tgt.shield > 0) { const s = Math.min(tgt.shield, rest); tgt.shield -= s; rest -= s; }
  tgt.hp -= rest;
  tgt.taken += amt;
  tgt.anim.hurt = 0.18;
  if (src) src.dealt += amt;
  if (type !== 'burn' && type !== 'storm') ev(b, { t: 'dmg', x: tgt.x, y: tgt.y, amt: amt | 0, crit, side: tgt.side, type });
  if (type !== 'burn' && type !== 'storm') tgt.mana = Math.min(tgt.maxMana, tgt.mana + Math.min(10, 3 + amt * 0.02));
  if (src && type === 'atk') {
    if (src.leech) heal(b, src, amt * src.leech / 100);
    if (tgt.thorns && src.range <= 1 && src.alive) damage(b, tgt, src, amt * tgt.thorns / 100, 'thorn');
    if (src.burnPct) tgt.burn = { dps: tgt.maxHp * src.burnPct / 3, t: 3, src };
    if (src.beastGrow) src.atkMult += src.beastGrow;
  }
  if (tgt.hp <= 0) {
    if (tgt.revive > 0) {
      tgt.hp = tgt.maxHp * tgt.revive / 100; tgt.revive = 0; tgt.burn = null; tgt.stun = 0;
      ev(b, { t: 'rise', x: tgt.x, y: tgt.y, u: tgt });
    } else {
      tgt.alive = false; tgt.hp = 0;
      if (src) src.kills++;
      ev(b, { t: 'die', x: tgt.x, y: tgt.y, u: tgt, big: tgt.def.cost >= 3 || tgt.star >= 2 });
      if (tgt.def.cost >= 4 || tgt.star >= 3) b.hitstop = Math.max(b.hitstop, 0.12);
    }
  }
  return amt;
}

function pickTarget(b, u) {
  const fs = foes(b, u);
  if (!fs.length) return null;
  const taunter = fs.filter(f => f.taunt > 0 && dist(f, u) < 3.2).sort((a, c) => dist(a, u) - dist(c, u))[0];
  if (taunter) return taunter;
  let best = null, bd = 1e9;
  for (const f of fs) { const d = dist(f, u) + (f.uid % 7) * 0.001; if (d < bd) { bd = d; best = f; } }
  return best;
}

function shoot(b, u, tgt, dmg, o = {}) {
  b.projs.push({ x: u.x, y: u.y - 0.15, tgt, src: u, dmg, type: o.type || 'atk', spd: o.spd || 9, kind: o.kind || (u.def.cls === 'mage' ? 'orb' : 'arrow'), col: o.col || u.def.acc, stun: o.stun || 0, splash: o.splash || 0 });
}

function cast(b, u) {
  const a = u.def.ab, m = ABIL_MULT[u.star] * (1 + u.ap / 100);
  u.mana = 0; u.anim.cast = 0.4;
  ev(b, { t: 'cast', x: u.x, y: u.y, k: a.k, u, side: u.side });
  const fs = foes(b, u), tgt = u.target && u.target.alive ? u.target : pickTarget(b, u);
  switch (a.k) {
    case 'shield': u.shield += a.v * m; ev(b, { t: 'shield', x: u.x, y: u.y }); break;
    case 'bolt': if (tgt) shoot(b, u, tgt, a.v * m, { type: 'abil', kind: 'bolt', spd: 10, col: '#f08030' }); break;
    case 'maul': if (tgt) { const d = damage(b, u, tgt, a.v * m, 'abil'); heal(b, u, d / 2); ev(b, { t: 'slash', x: tgt.x, y: tgt.y }); } break;
    case 'stun': if (tgt) { damage(b, u, tgt, a.v * m, 'abil'); tgt.stun = Math.max(tgt.stun, a.dur); ev(b, { t: 'stun', x: tgt.x, y: tgt.y }); } break;
    case 'volley': for (let i = 0; i < a.n; i++) { const f = fs[Math.floor(b.R() * fs.length)]; if (f) shoot(b, u, f, a.v * m, { type: 'abil', kind: 'arrow', spd: 8 + i }); } break;
    case 'backstab': {
      const w = fs.slice().sort((p, q) => p.hp - q.hp)[0];
      if (w) {
        ev(b, { t: 'poof', x: u.x, y: u.y });
        u.x = Math.max(0.3, Math.min(ARENA_W - 0.3, w.x + (b.R() - 0.5) * 0.4));
        u.y = Math.max(0.25, Math.min(ARENA_H - 0.25, w.y + (u.side === 0 ? -0.6 : 0.6)));
        ev(b, { t: 'poof', x: u.x, y: u.y });
        damage(b, u, w, a.v * m, 'abil'); u.target = w; ev(b, { t: 'slash', x: w.x, y: w.y });
      }
      break;
    }
    case 'taunt': u.shield += a.v * m; u.taunt = 4; for (const f of fs) if (dist(f, u) < 3.2) f.target = u; ev(b, { t: 'shield', x: u.x, y: u.y }); ev(b, { t: 'ring', x: u.x, y: u.y, r: 3.2, col: '#c8402e' }); break;
    case 'frenzy': u.buffAs = Math.max(u.buffAs, a.v * (1 + (u.star - 1) * 0.5)); u.buffT = 4; ev(b, { t: 'ring', x: u.x, y: u.y, r: 0.8, col: '#f08030' }); break;
    case 'drain': if (tgt) { const d = damage(b, u, tgt, a.v * m, 'abil'); heal(b, u, d); ev(b, { t: 'beam', x: u.x, y: u.y, x2: tgt.x, y2: tgt.y, col: '#a03a5a' }); } break;
    case 'heal': { const p = pals(b, u).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]; if (p) { heal(b, p, a.v * m); ev(b, { t: 'leaf', x: p.x, y: p.y }); } break; }
    case 'roar': for (const f of fs) if (dist(f, u) < a.r) { damage(b, u, f, a.v * m, 'abil'); f.stun = Math.max(f.stun, a.dur); ev(b, { t: 'stun', x: f.x, y: f.y }); } ev(b, { t: 'ring', x: u.x, y: u.y, r: a.r, col: '#c8a050' }); b.shake = 0.3; break;
    case 'splash': if (tgt) { for (const f of fs) if (dist(f, tgt) < a.r) damage(b, u, f, a.v * m, 'abil'); ev(b, { t: 'splash', x: tgt.x, y: tgt.y, r: a.r, col: '#3d7fb8' }); } break;
    case 'chain': {
      let cur = tgt, from = u; const hit = new Set();
      for (let i = 0; i < a.n && cur; i++) {
        hit.add(cur); ev(b, { t: 'beam', x: from.x, y: from.y, x2: cur.x, y2: cur.y, col: '#8fd0ff', zig: true });
        damage(b, u, cur, a.v * m, 'abil'); from = cur;
        cur = fs.filter(f => f.alive && !hit.has(f)).sort((p, q) => dist(p, from) - dist(q, from))[0];
      }
      break;
    }
    case 'snipe': { const far = fs.slice().sort((p, q) => dist(q, u) - dist(p, u))[0]; if (far) shoot(b, u, far, a.v * m, { type: 'abil', kind: 'snipe', spd: 22 }); break; }
    case 'summon': {
      for (let i = 0; i < a.n; i++) {
        const mdef = { ...MINION, hp: a.hp, atk: a.atk };
        const s = { x: Math.max(0.3, Math.min(ARENA_W - 0.3, u.x + (i - (a.n - 1) / 2) * 0.7 + 0.1)), y: u.y + (u.side === 0 ? -0.35 : 0.35), star: u.star, summoned: true };
        const mu = makeUnit(b, u.side, s, {}, mdef);
        mu.maxHp = a.hp * STAR_MULT[u.star] * (1 + u.ap / 200); mu.hp = mu.maxHp; mu.atk = a.atk * STAR_MULT[u.star];
        b.units.push(mu); ev(b, { t: 'rise', x: mu.x, y: mu.y, u: mu });
      }
      break;
    }
    case 'meteor': {
      let best = tgt, bn = -1;
      for (const f of fs) { const n = fs.filter(g => dist(g, f) < a.r).length; if (n > bn) { bn = n; best = f; } }
      if (best) b.zones.push({ x: best.x, y: best.y, r: a.r, t: 0.55, dmg: a.v * m, src: u, k: u.def.id === 'tidecaller' ? 'wave' : 'fire' });
      break;
    }
    case 'grow': u.maxHp += a.v * m; u.atk += a.atk * ABIL_MULT[u.star]; u.hp = u.maxHp; ev(b, { t: 'leaf', x: u.x, y: u.y }); ev(b, { t: 'ring', x: u.x, y: u.y, r: 0.9, col: '#5a9a48' }); break;
    case 'healall': for (const p of pals(b, u)) { heal(b, p, a.v * m); ev(b, { t: 'leaf', x: p.x, y: p.y }); } break;
    case 'freeze': for (const f of fs) { damage(b, u, f, a.v * m, 'abil'); f.stun = Math.max(f.stun, a.dur); ev(b, { t: 'ice', x: f.x, y: f.y }); } b.shake = 0.45; b.hitstop = 0.15; break;
    case 'rally': for (const p of pals(b, u)) { p.buffAs = Math.max(p.buffAs, a.v); p.buffT = 5; p.shield += a.sh * ABIL_MULT[u.star]; ev(b, { t: 'shield', x: p.x, y: p.y }); } ev(b, { t: 'ring', x: u.x, y: u.y, r: 2.5, col: '#e8c060' }); b.shake = 0.3; break;
  }
}

function stepUnit(b, u) {
  const a = u.anim;
  for (const k in a) if (a[k] > 0) a[k] = Math.max(0, a[k] - DT);
  if (u.burn) {
    const bn = u.burn; bn.t -= DT; if (bn.t <= 0) u.burn = null;
    damage(b, bn.src, u, bn.dps * DT, 'burn');
    if (!u.alive) return;
  }
  if (u.regen) heal(b, u, u.maxHp * u.regen * DT);
  if (b.t > FIGHT_SOFT) { damage(b, null, u, u.maxHp * 0.05 * (b.t - FIGHT_SOFT) / 4 * DT, 'storm'); if (!u.alive) return; }
  if (u.taunt > 0) u.taunt -= DT;
  if (u.buffT > 0) { u.buffT -= DT; if (u.buffT <= 0) u.buffAs = 0; }
  if (u.stun > 0) { u.stun -= DT; return; }
  // rogues open the fight by leaping behind the enemy line
  if (u.rogue && !u.leaped && b.t > 0.35) {
    u.leaped = true;
    const fs = foes(b, u);
    if (fs.length) {
      const back = fs.slice().sort((p, q) => u.side === 0 ? p.y - q.y : q.y - p.y)[0];
      ev(b, { t: 'poof', x: u.x, y: u.y });
      u.x = back.x; u.y = Math.max(0.2, Math.min(ARENA_H - 0.2, back.y + (u.side === 0 ? -0.55 : 0.55)));
      u.target = back; ev(b, { t: 'poof', x: u.x, y: u.y });
      return;
    }
  }
  if (u.def.ab.k !== 'none' && u.mana >= u.maxMana) {
    if (!u.target || !u.target.alive) u.target = pickTarget(b, u);
    if (u.target) { cast(b, u); return; }
  }
  u.retarget -= DT;
  if (!u.target || !u.target.alive || u.retarget <= 0) {
    // keep the current target if it is in reach, otherwise look again
    if (!(u.target && u.target.alive && dist(u, u.target) <= reach(u) && !(u.target.taunt <= 0 && foes(b, u).some(f => f.taunt > 0 && dist(f, u) < 3.2)))) u.target = pickTarget(b, u);
    u.retarget = 0.6;
  }
  const t = u.target;
  if (!t) return;
  const d = dist(u, t);
  if (Math.abs(t.x - u.x) > 0.05) u.face = t.x > u.x ? 1 : -1;
  if (d > reach(u)) {
    const spd = 1.45 * DT;
    const dx0 = (t.x - u.x) / d, dy0 = (t.y - u.y) / d;
    let mx = dx0, my = dy0;
    // walk around a friend who is in the way instead of queueing up behind it
    for (const o of b.units) {
      if (o === u || !o.alive || o.side !== u.side) continue;
      const ox = o.x - u.x, oy = o.y - u.y, od = Math.hypot(ox, oy);
      if (od > 0.85 || od < 1e-4 || (ox * dx0 + oy * dy0) / od < 0.5) continue;
      const away = (dx0 * oy - dy0 * ox) > 0 ? -1 : 1, w = (0.85 - od) / 0.85 * 1.3;
      mx += -dy0 * away * w; my += dx0 * away * w;
    }
    const ml = Math.hypot(mx, my) || 1;
    u.x += mx / ml * spd; u.y += my / ml * spd;
  } else {
    u.cd -= DT;
    if (u.cd <= 0) {
      const as = u.as * (1 + (u.asPct + u.buffAs) / 100);
      u.cd = 1 / Math.min(as, 3.5);
      const dmg = u.atk * u.atkMult;
      a.lunge = 0.16;
      if (u.range <= 1) {
        damage(b, u, t, dmg, 'atk');
        ev(b, { t: 'swing', x: t.x, y: t.y, side: u.side, big: u.def.cost >= 4 });
      } else shoot(b, u, t, dmg);
      u.mana = Math.min(u.maxMana, u.mana + 10 + u.tideMana);
    }
  }
}

function separate(b) {
  const al = b.units.filter(u => u.alive);
  for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
    const p = al[i], q = al[j];
    // sprites are taller than wide: measure in an ellipse (front-to-back counts 1.5x)
    // so units spread sideways instead of stacking into one column
    let dx = q.x - p.x, dy = (q.y - p.y) * 1.5; const d = Math.hypot(dx, dy);
    const min = p.side === q.side ? 0.7 : 0.62;
    if (d < min) {
      if (d < 1e-4) { dx = (p.uid % 2 ? 1 : -1); dy = 0; }
      const k = (min - d) / 2 / (d || 1) * 0.7;
      p.x -= dx * k; p.y -= dy * k / 1.5; q.x += dx * k; q.y += dy * k / 1.5;
    }
  }
  for (const u of al) { u.x = Math.max(0.25, Math.min(ARENA_W - 0.25, u.x)); u.y = Math.max(0.2, Math.min(ARENA_H - 0.2, u.y)); }
}

export function step(b) {
  if (b.over) return;
  b.t += DT;
  if (b.shake) b.shake = Math.max(0, b.shake - DT);
  const order = b.units.filter(u => u.alive);
  for (const u of order) if (u.alive) stepUnit(b, u);
  // projectiles
  for (const p of b.projs) {
    if (!p.tgt.alive) { p.dead = true; continue; }
    const dx = p.tgt.x - p.x, dy = p.tgt.y - 0.15 - p.y, d = Math.hypot(dx, dy), s = p.spd * DT;
    if (d <= s) {
      p.dead = true;
      damage(b, p.src, p.tgt, p.dmg, p.type);
      ev(b, { t: 'phit', x: p.tgt.x, y: p.tgt.y, kind: p.kind, col: p.col });
    } else { p.x += dx / d * s; p.y += dy / d * s; p.ang = Math.atan2(dy, dx); }
  }
  b.projs = b.projs.filter(p => !p.dead);
  // delayed area hits (meteors, waves)
  for (const z of b.zones) {
    z.t -= DT;
    if (z.t <= 0 && !z.done) {
      z.done = true;
      for (const f of b.units) if (f.alive && f.side !== z.src.side && Math.hypot(f.x - z.x, f.y - z.y) < z.r) damage(b, z.src, f, z.dmg, 'abil');
      ev(b, { t: 'boom', x: z.x, y: z.y, r: z.r, k: z.k });
      b.shake = Math.max(b.shake || 0, 0.35); b.hitstop = Math.max(b.hitstop, 0.08);
    }
  }
  b.zones = b.zones.filter(z => !z.done);
  separate(b);
  const alive0 = b.units.some(u => u.alive && u.side === 0), alive1 = b.units.some(u => u.alive && u.side === 1);
  if (!alive0 || !alive1 || b.t >= FIGHT_HARD) {
    b.over = true;
    b.winner = alive0 && !alive1 ? 0 : alive1 && !alive0 ? 1 : -1;
    ev(b, { t: 'end', winner: b.winner });
  }
}

// Run a whole fight instantly (for AI scouting, tests and the balance tool).
export function resolve(teamA, teamB, seed) {
  const b = createBattle(teamA, teamB, seed);
  let n = 0;
  while (!b.over && n++ < FIGHT_HARD * 30 + 10) { step(b); b.events.length = 0; }
  return b;
}
export const SIM_DT = DT;
