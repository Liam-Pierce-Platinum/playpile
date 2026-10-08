// coop.js - turning a running battle into a message, and back.
//
// The host's Game is the real one. The guest builds an identical Game for
// the same level - so it has the same roads, plots and flags, and every
// helper the screen calls (costOf, towerRange, canCallWave...) works - but
// never steps it. Twelve times a second the host sends what is on the field
// and the guest copies it in.
//
// IDENTITY IS KEPT BY ID. The screen keeps a little state of its own on
// every unit (how far round it has turned, an arrow's trail), so a unit
// that is still there must stay the same object; only new ones are made
// and gone ones dropped. Positions are eased towards the host's rather
// than snapped, which hides the gaps between packets.
import { TOWERS } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

export function pack(G, fx, sfx) {
  return {
    t: r2(G.time), st: G.state, lv: G.lives, wv: G.wave, ni: r1(G.nextIn), sp: G.spawning.length,
    pu: G.purse.slice(), sc: [r1(G.spells.wash.cd), r1(G.spells.wall.cd)],
    mx: G.stats.mixes,
    e: G.enemies.filter(e => e.alive).map(e => [e.id, e.kind, r1(e.x), r1(e.y), Math.ceil(e.hp), e.maxHp, e.face,
      r2(e.walk), (e.stun > 0 ? 1 : 0) | (e.slowT > 0 ? 2 : 0) | (e.poisonT > 0 ? 4 : 0) | (e.shredT > 0 ? 8 : 0) |
      (e.frozen > 0 ? 16 : 0) | (e.stone > 0 ? 32 : 0) | (e.hurtT > 0 ? 64 : 0) | (e.engaged ? 128 : 0) | (e.hexT > 0 ? 256 : 0),
      r2(e.swing || 0), r2(e.atkT), e.stain || '', r1(e.stainT)]),
    b: G.blockers.map(b => [b.id, b.kind, b.look, r1(b.x), r1(b.y), Math.ceil(b.hp), Math.round(b.maxHp), b.face, r2(b.walk),
      (b.alive ? 1 : 0) | (b.engaged ? 2 : 0) | (b.moving ? 4 : 0) | (b.target ? 8 : 0) | (b.fly ? 16 : 0) | (b.hurtT > 0 ? 32 : 0),
      r2(b.swing || 0), r2(b.atkT), b.owner ? b.owner.id : 0, r1(b.respawnT || 0), b.H ? b.H.idx : -1,
      [Math.round(b.dmg[0]), Math.round(b.dmg[1])], r2(b.armor), r1(b.abT.skill ?? 0)]),
    w: G.towers.map(t => [t.id, t.slot.i, t.type, t.ranks, t.spent, t.rally ? [r1(t.rally.x), r1(t.rally.y)] : 0, r2(t.aim),
      t.shooter, r1(t.silenced), r1(t.doused), r2(t.buildT), t.beam && t.beam.tgt ? [t.beam.tgt.id, r2(t.beam.heat), (t.beam.extra || []).map(o => o.id)] : 0,
      t.owner, r2(t.cd), r2(t.recoil || 0)]),
    p: G.proj.map(p => [p.k, r1(p.x), r1(p.y), r2(p.ang || 0), r1(p.gx ?? 0), r1(p.gy ?? 0), r2(p.t), r2(p.dur), p.small ? 1 : 0, p.big ? 1 : 0, p.color || '', p.poison ? 1 : 0, r1(p.sx ?? 0)]),
    l: G.walls.map(w => [w.id, r1(w.x1), r1(w.y1), r1(w.x2), r1(w.y2), Math.ceil(w.hp), Math.round(w.maxHp), r1(w.t), r1(w.life), w.hitT > 0 ? 1 : 0]),
    h: G.heroes.map(H => H ? [H.id, H.level, Math.round(H.xp), H.b.id] : 0),
    fx, sfx,
  };
}

/** copy a snapshot into the guest's Game. Returns the fx and sfx it carried. */
export function unpack(G, s) {
  G.time = s.t; G.state = s.st; G.lives = s.lv; G.wave = s.wv; G.nextIn = s.ni;
  G.spawning = Array.from({ length: s.sp }, () => ({ left: 1 }));
  G.purse = s.pu.slice();
  G.spells.wash.cd = s.sc[0]; G.spells.wall.cd = s.sc[1];
  G.stats.mixes = s.mx;

  const sync = (list, rows, make, fill) => {
    const by = new Map(list.map(o => [o.id, o]));
    const out = [];
    for (const row of rows) {
      let o = by.get(row[0]);
      if (!o) o = make(row);
      fill(o, row);
      out.push(o);
    }
    return out;
  };
  const ease = (o, x, y) => {
    if (o._new) { o.x = x; o.y = y; o._new = false; }
    o.tx = x; o.ty = y;
  };

  G.enemies = sync(G.enemies, s.e, row => ({ id: row[0], kind: row[1], def: ENEMIES[row[1]], size: ENEMIES[row[1]].size, fly: !!ENEMIES[row[1]].fly, alive: true, blockers: [], abT: {}, _new: true }), (e, r) => {
    ease(e, r[2], r[3]);
    e.hp = r[4]; e.maxHp = r[5]; e.face = r[6]; e.walk = r[7];
    const f = r[8];
    e.stun = f & 1 ? 1 : 0; e.slowT = f & 2 ? 1 : 0; e.poisonT = f & 4 ? 1 : 0; e.shredT = f & 8 ? 1 : 0;
    e.frozen = f & 16 ? 1 : 0; e.stone = f & 32 ? 1 : 0; e.hurtT = f & 64 ? 0.1 : 0; e.engaged = !!(f & 128); e.hexT = f & 256 ? 1 : 0;
    e.swing = r[9]; e.atkT = r[10]; e.stain = r[11] || null; e.stainT = r[12];
  });
  const towersById = new Map();
  G.towers = sync(G.towers, s.w, row => {
    const slot = G.slots[row[1]];
    return { id: row[0], slot, x: slot.x, y: slot.y, soldiers: [], abT: {} };
  }, (t, r) => {
    t.type = r[2]; t.def = TOWERS[r[2]]; t.ranks = r[3]; t.spent = r[4]; t.rally = r[5] ? { x: r[5][0], y: r[5][1] } : null;
    t.aim = r[6]; if (t.shooter !== r[7]) t.fireT = 0.18; t.shooter = r[7]; t.silenced = r[8]; t.doused = r[9]; t.buildT = r[10];
    t._beam = r[11]; t.owner = r[12]; t.cd = r[13]; t.recoil = r[14];
    towersById.set(t.id, t);
  });
  for (const sl of G.slots) sl.tower = null;
  for (const t of G.towers) t.slot.tower = t;

  G.blockers = sync(G.blockers, s.b, row => ({ id: row[0], kind: row[1], look: row[2], abT: {}, _new: true }), (b, r) => {
    ease(b, r[3], r[4]);
    b.hp = r[5]; b.maxHp = r[6]; b.face = r[7]; b.walk = r[8];
    const f = r[9];
    b.alive = !!(f & 1); b.engaged = !!(f & 2); b.moving = !!(f & 4); b.target = f & 8 ? true : null; b.fly = !!(f & 16); b.hurtT = f & 32 ? 0.1 : 0;
    b.swing = r[10]; b.atkT = r[11]; b.owner = towersById.get(r[12]) || null; b.respawnT = r[13];
    b.dmg = r[15]; b.armor = r[16]; b.abT.skill = r[17];
    b._hidx = r[14];
  });
  // heroes: point the records at their blockers
  const bById = new Map(G.blockers.map(b => [b.id, b]));
  G.heroes = s.h.map((h, i) => {
    if (!h) return null;
    const rec = G.heroes[i] && G.heroes[i].id === h[0] ? G.heroes[i] : { id: h[0], idx: i, xpStart: h[2] };
    rec.level = h[1]; rec.xp = h[2]; rec.b = bById.get(h[3]) || rec.b; rec.idx = i;
    if (rec.b) rec.b.H = rec;
    return rec;
  });
  G.hero = G.heroes[0] || null;

  // beams point at enemies by id
  const eById = new Map(G.enemies.map(e => [e.id, e]));
  for (const t of G.towers) {
    const bm = t._beam;
    t.beam = bm ? { tgt: eById.get(bm[0]) || null, heat: bm[1], extra: bm[2].map(id => eById.get(id)).filter(Boolean) } : null;
  }
  // projectiles are short-lived: rebuilt every packet, trails and all
  G.proj = s.p.map(r => ({ k: r[0], x: r[1], y: r[2], ang: r[3], gx: r[4], gy: r[5], t: r[6], dur: r[7], small: !!r[8], big: !!r[9], color: r[10] || undefined, poison: !!r[11], sx: r[12] }));
  G.walls = s.l.map(r => ({ id: r[0], x1: r[1], y1: r[2], x2: r[3], y2: r[4], hp: r[5], maxHp: r[6], t: r[7], life: r[8], hitT: r[9] ? 0.1 : 0 }));
  return { fx: s.fx || [], sfx: s.sfx || [] };
}

/** between packets: ease every unit towards where the host last put it */
export function easeUnits(G, dt) {
  const k = Math.min(1, dt * 14);
  for (const list of [G.enemies, G.blockers]) for (const o of list) {
    if (o.tx === undefined) continue;
    o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
  }
}
