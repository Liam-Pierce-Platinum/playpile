// Real-time field battle: your monster (WASD + abilities) vs wild/rival monsters with AI.
import { MOVES, SPECIES_BY_ID, ZONES, TYPES, typeMult, ENDLESS_BOSSES } from './data.js';
import { HITBOX, SIZES } from './creature.js';
// bosses are drawn about 90px tall whatever their size class
const bossScale = (size) => Math.max(1.5, Math.min(2.2, 88 / (SIZES[size] || 40)));
import { statsFor } from './mons.js';
import { sprite } from './sprites.js';
import { makeArena, drawObstacle, BOUNDS } from './arena.js';
import { input, moveVec, mouseRecent, GW, GH } from './input.js';
import { text } from './font.js';
import { sfx } from './audio.js';
import { moveIcon } from './sprites.js';

const DASH_SPEED = 360;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const SLOT_KEYS = [['KeyJ', 'Digit1', 'Numpad1'], ['KeyK', 'Digit2', 'Numpad2'], ['KeyL', 'Digit3', 'Numpad3']];

// crisp pixel shapes (no anti-aliasing)
function pixDisc(ctx, cx, cy, rx, ry, col) {
  ctx.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) { const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)))); ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
}
function pixRing(ctx, cx, cy, r, col, ry = r, dash = 0) {
  ctx.fillStyle = col; const n = Math.max(12, Math.floor(r * 4));
  for (let i = 0; i < n; i++) { if (dash && (i >> 1) % 2) continue; const a = (i / n) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * ry), 1, 1); }
}

// Endless arena: wave w (0-based). Every 5th wave is a legendary/epic boss; packs grow and level up.
export const isEndlessBossWave = (w) => (w + 1) % 5 === 0;
function endlessEncounter(Z, w) {
  if (isEndlessBossWave(w)) {
    const sp = ENDLESS_BOSSES[((w + 1) / 5 - 1) % ENDLESS_BOSSES.length];
    return [{ sp, stage: 1, lvl: Z.lvl + Math.floor(w / 2), boss: true, title: SPECIES_BY_ID[sp].forms[1].name + ' - WAVE ' + (w + 1) }];
  }
  const n = 1 + (w % 3), out = [];
  for (let i = 0; i < n; i++) {
    const sp = Z.pool[Math.floor(Math.random() * Z.pool.length)];
    out.push({ sp, stage: w >= 9 || (w >= 3 && i === 0) ? 1 : 0, lvl: Z.lvl + Math.floor(w / 2) - (n > 1 ? 1 : 0) });
  }
  return out;
}

export function encounter(zi, stage) {
  const Z = ZONES[zi], lvl = Z.lvl + stage;
  if (Z.endless) return endlessEncounter(Z, stage);
  const pick = (i) => Z.pool[(i * 3 + stage * 5 + zi) % Z.pool.length];
  if (stage === 3) {
    return [
      { sp: Z.boss.sp, stage: 1, lvl: Z.lvl + (SPECIES_BY_ID[Z.boss.sp].rarity === 'legendary' ? 0 : 2), boss: true, title: Z.boss.title },
    ];
  }
  const out = [];
  const n = stage === 0 ? 1 : stage === 1 ? 2 : 3;
  const r0 = Math.floor(Math.random() * Z.pool.length);
  for (let i = 0; i < n; i++) {
    const sp = Z.pool[(r0 + i * 2) % Z.pool.length];
    out.push({ sp, stage: zi >= 1 && i === 0 && stage === 2 ? 1 : (zi >= 2 && i === 0 ? 1 : 0), lvl: lvl - (n > 1 ? 1 : 0) });
  }
  void pick;
  return out;
}

export class Battle {
  constructor({ zi, stage, mon, onEnd, onSeen, seed }) {
    this.zi = zi; this.stage = stage; this.onEnd = onEnd;
    this.arena = makeArena(zi, seed || Math.floor(Math.random() * 1e6));
    this.t = 0; this.intro = 1.0; this.over = null; this.overT = 0; this.ended = false;
    this.hitstop = 0; this.shake = 0; this.flashRed = 0;
    this.parts = []; this.floaters = []; this.projs = []; this.zones = []; this.fx = [];
    const Z = ZONES[zi]; this.endless = !!Z.endless;
    // tier drives AI sharpness; the endless arena ramps from zone-3 to zone-5 sharpness over the waves
    this.tier = this.endless ? Math.min(3.6, 2 + stage * 0.12) : Math.min(zi, 3.5); // zone 5 is only a little sharper than zone 4
    const st3 = this.endless ? stage % 3 : stage;
    this.enemyDmg = 0.8 + this.tier * 0.06 + st3 * 0.03;
    this.aiPace = 1 - this.tier * 0.12;
    const lvl = mon.lvl;
    this.p = this.fighter(mon.sp, mon.stage, lvl, 0, { moves: mon.eq.slice(), x: 70, y: 150 });
    this.p.uid = mon.uid;
    this.foes = [];
    const enc = encounter(zi, stage);
    // packs: each foe is a bit weaker so a 3-foe fight is not 3 full duels back to back
    const pack = enc.length >= 3 ? 0.72 : enc.length === 2 ? 0.86 : 1;
    if (enc.length > 1) this.enemyDmg *= enc.length >= 3 ? 0.82 : 0.92;
    this.onSeen = onSeen || null;
    enc.forEach((e, i) => {
      const sp = SPECIES_BY_ID[e.sp];
      const extra = zi >= 1 ? sp.pool[3 + ((i + stage) % 3)] : null;
      const moves = sp.pool.slice(0, 3); if (extra) moves[2] = extra;
      const f = this.fighter(e.sp, e.stage, e.lvl, 1, {
        moves, x: 400 - (i % 2) * 30, y: 150 + (i - (enc.length - 1) / 2) * 60,
        boss: e.boss, title: e.title, scale: e.boss ? bossScale(sp.forms[e.stage].size) : 1, hpMul: e.boss ? (this.endless ? 1.6 : sp.rarity === 'legendary' ? 1.7 : 2.3) : pack, // legendaries already carry x1.38 stats
      });
      this.foes.push(f);
    });
    this.total = this.foes.length;
    this.all = [this.p, ...this.foes];
    this.summoned = false;
  }

  fighter(spId, stage, lvl, team, o) {
    const sp = SPECIES_BY_ID[spId], st = statsFor(spId, stage, lvl), form = sp.forms[stage];
    if (team === 1 && this.onSeen) this.onSeen(spId);
    const scale = o.scale || 1;
    const hp = Math.round(st.hp * (team === 0 ? 3 : 2.7) * (o.hpMul || 1));
    const moves = o.moves.map((id) => ({ id, cd: 0.3 }));
    const ranged = moves.some((m) => ['proj', 'zone'].includes(MOVES[m.id].kind));
    return {
      sp: spId, stage, lvl, team, type: sp.type, name: form.name, float: !!form.float,
      x: o.x, y: o.y, vx: 0, vy: 0, kx: 0, ky: 0, r: (HITBOX[form.size] || 6.5) * scale, scale,
      maxHp: hp, hp, atk: st.atk, def: st.def, spd: st.spd, moves,
      face: team ? Math.PI : 0, flip: !!team, animT: Math.random() * 3, atkT: 0, hurtT: 0, flashT: 0,
      burnT: 0, burnDps: 0, slowT: 0, slowAmt: 0, stunT: 0, shield: 0, shieldT: 0, atkBuffT: 0, spdBuffT: 0,
      dodgeT: 0, dodgeCd: 0, dvx: 0, dvy: 0, inv: 0, dash: null, dead: false, deadT: 0,
      boss: !!o.boss, title: o.title || null, moving: false,
      ai: { cool: rand(0.6, 1.2), strafe: Math.random() < 0.5 ? -1 : 1, think: 0, wind: null, dodgeCd: 1.5, pref: ranged ? rand(80, 115) : 22 },
    };
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.paused) return;
    this.updateFx(dt);
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.over) dt *= 0.4;
    this.t += dt;
    if (this.intro > 0) { this.intro -= dt; if (this.intro <= 0) sfx.buff(); return; }
    const p = this.p;
    if (!p.dead && !this.over) this.control(p, dt);
    for (const f of this.foes) if (!f.dead && !this.over) this.think(f, dt);
    for (const f of this.all) this.physics(f, dt);
    this.updateProjs(dt);
    this.updateZones(dt);
    // win / lose
    if (!this.over) {
      if (p.dead) { this.over = 'lose'; this.overT = 0; sfx.lose(); }
      else if (this.foes.every((f) => f.dead)) { this.over = 'win'; this.overT = 0; sfx.win(); }
    } else {
      this.overT += dt / 0.4;
      if (this.overT > 1.8 && !this.ended) { this.ended = true; this.onEnd && this.onEnd({ win: this.over === 'win', time: this.t }); }
    }
  }

  aimAngle(p) {
    if (mouseRecent()) return Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);
    // soft auto-aim: nearest foe roughly in front (touch: nearest foe anywhere)
    let best = null, bd = 1e9;
    for (const f of this.foes) {
      if (f.dead) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y), a = Math.atan2(f.y - p.y, f.x - p.x);
      if (d > 280) continue;
      if (d < bd) { bd = d; best = a; }
    }
    return best ?? p.face;
  }

  control(p, dt) {
    const mv = moveVec();
    p.moving = Math.hypot(mv.x, mv.y) > 0.1;
    if (p.moving) p.face = Math.atan2(mv.y, mv.x);
    this.aim = this.aimAngle(p);
    if (p.stunT > 0) { p.vx = p.vy = 0; return; }
    const k = input.keys;
    if ((input.pressed.has('Space') || input.pressed.has('ShiftLeft') || input.pressed.has('dodge')) && p.dodgeCd <= 0 && !p.dash) {
      const a = p.moving ? p.face : this.aim;
      p.dodgeT = 0.2; p.inv = 0.28; p.dodgeCd = 0.85; p.dvx = Math.cos(a) * 310; p.dvy = Math.sin(a) * 310;
      sfx.dodge(); for (let i = 0; i < 8; i++) this.part(p.x, p.y + 4, rand(-40, 40), rand(-30, 0), '#ffffff', 0.3, 2);
    }
    const spd = p.spd * (p.slowT > 0 ? 1 - p.slowAmt : 1) * (p.spdBuffT > 0 ? 1.4 : 1);
    if (!p.dash && p.dodgeT <= 0) {
      p.vx += (mv.x * spd - p.vx) * Math.min(1, dt * 16);
      p.vy += (mv.y * spd - p.vy) * Math.min(1, dt * 16);
    }
    p.flip = Math.cos(mouseRecent() ? this.aim : p.face) < 0;
    for (let i = 0; i < 3; i++) {
      const want = SLOT_KEYS[i].some((c) => k.has(c)) || input.held.has('ab' + i) || input.pressed.has('ab' + i) || (i === 0 && input.mouse.down);
      if (want) this.tryMove(p, i, this.aim);
    }
  }

  tryMove(f, slot, ang, tx, ty) {
    const m = f.moves[slot]; if (!m || m.cd > 0 || f.dash || f.dodgeT > 0 || f.stunT > 0 || f.dead) return false;
    const M = MOVES[m.id];
    m.cd = M.cd;
    if (tx == null) { const d = Math.min(150, this.nearestFoeDist(f, ang) ?? 110); tx = f.x + Math.cos(ang) * d; ty = f.y + Math.sin(ang) * d; }
    this.useMove(f, M, ang, tx, ty);
    return true;
  }
  nearestFoeDist(f, ang) {
    let bd = null;
    for (const o of this.all) { if (o.team === f.team || o.dead) continue; const a = Math.atan2(o.y - f.y, o.x - f.x); if (Math.abs(angDiff(a, ang)) < 0.5) { const d = Math.hypot(o.x - f.x, o.y - f.y); if (bd == null || d < bd) bd = d; } }
    return bd;
  }

  useMove(f, M, ang, tx, ty) {
    f.atkT = 0.22; f.face = ang; if (f.team === 1 || !mouseRecent()) f.flip = Math.cos(ang) < 0; else f.flip = Math.cos(ang) < 0;
    const T = TYPES[M.type];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    switch (M.kind) {
      case 'melee': {
        sfx.shot('normal');
        f.kx += ca * 70; f.ky += sa * 70;
        this.fx.push({ k: 'slash', x: f.x, y: f.y, ang, range: M.range * f.scale, arc: M.arc, t: 0, life: 0.14, col: T.light, col2: T.col });
        for (const o of this.all) {
          if (o.team === f.team || o.dead) continue;
          const d = Math.hypot(o.x - f.x, o.y - f.y), a = Math.atan2(o.y - f.y, o.x - f.x);
          if (d < M.range * f.scale + o.r && Math.abs(angDiff(a, ang)) < M.arc / 2 + 0.35) this.hit(f, o, M, 1, a);
        }
        break;
      }
      case 'proj': {
        sfx.shot(M.type);
        const n = M.count || 1;
        for (let i = 0; i < n; i++) {
          const a = M.spread >= 6 ? ang + (i / n) * Math.PI * 2 : ang + (n > 1 ? (i / (n - 1) - 0.5) * M.spread * 2 : 0);
          this.projs.push({ x: f.x + Math.cos(a) * f.r, y: f.y - 3 * f.scale + Math.sin(a) * f.r, vx: Math.cos(a) * M.speed, vy: Math.sin(a) * M.speed, M, owner: f, team: f.team, r: M.size * (f.boss ? 1.5 : 1), life: 1.6, hit: new Set(), spin: Math.random() * 6 });
        }
        break;
      }
      case 'dash': {
        sfx.dash();
        const sp = M.stun ? 480 : DASH_SPEED;
        f.dash = { t: (M.dist * (f.boss ? 1.3 : 1)) / sp, vx: ca * sp, vy: sa * sp, M, hit: new Set(), trailT: 0 };
        if (f.team === 0) f.inv = Math.max(f.inv, 0.15);
        break;
      }
      case 'nova': {
        sfx.nova(); this.shake = Math.max(this.shake, 3);
        const R = M.radius * (f.boss ? 1.4 : 1);
        this.fx.push({ k: 'ring', x: f.x, y: f.y, r: R, t: 0, life: 0.3, col: T.col, col2: T.light });
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; this.part(f.x, f.y, Math.cos(a) * R * 3, Math.sin(a) * R * 3, i % 2 ? T.col : T.light, 0.3, 2); }
        for (const o of this.all) {
          if (o.team === f.team || o.dead) continue;
          const d = Math.hypot(o.x - f.x, o.y - f.y);
          if (d < R + o.r) { const a = Math.atan2(o.y - f.y, o.x - f.x); this.hit(f, o, M, 1, M.pull ? a + Math.PI : a); }
        }
        break;
      }
      case 'zone': {
        const d = Math.hypot(tx - f.x, ty - f.y), maxD = 210;
        if (d > maxD) { tx = f.x + ((tx - f.x) / d) * maxD; ty = f.y + ((ty - f.y) / d) * maxD; }
        tx = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, tx)); ty = Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, ty));
        this.zones.push({ x: tx, y: ty, r: M.radius * (f.boss ? 1.3 : 1), delay: M.delay, d0: M.delay, M, owner: f, team: f.team, ticks: M.ticks || 1, tickT: 0, life: 0 });
        if (M.delay > 0.3) sfx.warn();
        break;
      }
      case 'heal': {
        sfx.heal();
        const amt = Math.round(f.maxHp * M.heal * (f.team === 1 ? (f.boss ? 0.35 : 0.6) : 1)); f.hp = Math.min(f.maxHp, f.hp + amt);
        this.float(f.x, f.y - 16 * f.scale, '+' + amt, '#7aff7a');
        for (let i = 0; i < 16; i++) this.part(f.x + rand(-10, 10), f.y + rand(-6, 6), rand(-10, 10), rand(-60, -20), i % 2 ? '#7aff7a' : '#ffffff', 0.7, 2);
        break;
      }
      case 'buff': {
        sfx.buff();
        if (M.buff === 'atk') f.atkBuffT = M.dur;
        if (M.buff === 'spd') f.spdBuffT = M.dur;
        if (M.buff === 'shield') { f.shield = f.maxHp * M.amt; f.shieldT = M.dur; }
        this.float(f.x, f.y - 16 * f.scale, M.buff === 'atk' ? 'ATK UP' : M.buff === 'spd' ? 'SPEED UP' : 'SHIELD', T.light);
        this.fx.push({ k: 'ring', x: f.x, y: f.y, r: 22, t: 0, life: 0.35, col: T.light, col2: '#ffffff' });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- AI
  think(f, dt) {
    const p = this.p, ai = f.ai;
    if (f.stunT > 0) { f.vx = f.vy = 0; ai.wind = null; return; }
    const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1, toP = Math.atan2(dy, dx);
    const phase2 = f.boss && f.hp < f.maxHp * 0.5;
    if (phase2 && !this.summoned) {
      this.summoned = true;
      const Z = ZONES[this.zi], sp = Z.pool[Math.floor(Math.random() * Z.pool.length)], S = SPECIES_BY_ID[sp];
      const m = this.fighter(sp, 0, Z.lvl + 1, 1, { moves: S.pool.slice(0, 3), x: f.x, y: f.y < 150 ? f.y + 50 : f.y - 50 });
      this.foes.push(m); this.all.push(m); this.total++;
      this.float(f.x, f.y - 40, 'ENRAGED!', '#ff5a5a');
      for (let i = 0; i < 20; i++) this.part(m.x, m.y, rand(-80, 80), rand(-80, 80), '#ffffff', 0.4, 2);
      sfx.nova(); this.shake = 6;
    }
    // wind-up then strike
    if (ai.wind) {
      ai.wind.t -= dt; f.face = toP; f.flip = Math.cos(toP) < 0; f.vx *= 0.8; f.vy *= 0.8;
      if (ai.wind.t <= 0) {
        const lead = this.tier * 0.08;
        const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
        const a = Math.atan2(ty - f.y, tx - f.x);
        const m = f.moves[ai.wind.slot]; m.cd = MOVES[m.id].cd * (f.boss ? 0.8 : 1.15);
        this.useMove(f, MOVES[m.id], a, tx, ty);
        ai.wind = null;
        ai.cool = rand(1.0, 1.7) * this.aiPace * (phase2 ? 0.7 : 1) * (f.boss ? 0.75 : 1) + (this.foes.length > 1 ? 0.4 : 0);
      }
      return;
    }
    ai.cool -= dt; ai.think -= dt; ai.dodgeCd -= dt;
    if (ai.think <= 0) { ai.think = rand(0.6, 1.4); if (Math.random() < 0.4) ai.strafe *= -1; }
    // dodge incoming projectiles
    if (ai.dodgeCd <= 0 && f.dodgeT <= 0) {
      for (const pr of this.projs) {
        if (pr.team === f.team) continue;
        const rx = f.x - pr.x, ry = f.y - pr.y, rd = Math.hypot(rx, ry);
        if (rd < 46 && (rx * pr.vx + ry * pr.vy) > 0) {
          ai.dodgeCd = rand(1.2, 2.2);
          if (Math.random() < 0.18 + this.tier * 0.08) {
            const a = Math.atan2(pr.vy, pr.vx) + (Math.random() < 0.5 ? 1.57 : -1.57);
            f.dodgeT = 0.18; f.inv = 0.22; f.dvx = Math.cos(a) * 280; f.dvy = Math.sin(a) * 280;
          }
          break;
        }
      }
    }
    // choose an attack
    if (ai.cool <= 0 && !p.dead) {
      const opts = [];
      f.moves.forEach((m, i) => {
        if (m.cd > 0) return;
        const M = MOVES[m.id];
        let ok = false;
        if (M.kind === 'melee') ok = d < M.range * f.scale + p.r + 8;
        else if (M.kind === 'proj') ok = d < 220 && this.los(f, p);
        else if (M.kind === 'dash') ok = d > 24 && d < M.dist + 30 && this.los(f, p);
        else if (M.kind === 'nova') ok = d < M.radius * (f.boss ? 1.4 : 1) + 6;
        else if (M.kind === 'zone') ok = d < 210;
        else if (M.kind === 'heal') ok = f.hp < f.maxHp * 0.5;
        else if (M.kind === 'buff') ok = M.buff === 'shield' ? f.hp < f.maxHp * 0.8 : d < 160;
        if (ok) opts.push(i);
      });
      if (opts.length) {
        const slot = opts[Math.floor(Math.random() * opts.length)], M = MOVES[f.moves[slot].id];
        const big = (M.power || 0) >= 22;
        ai.wind = { slot, t: (big ? 0.5 : 0.3) * (f.boss ? 0.9 : 1), big };
        f.atkT = ai.wind.t;
        if (big) sfx.warn();
        return;
      }
    }
    // movement: keep preferred range, strafe around the player
    const spd = f.spd * 0.82 * (f.slowT > 0 ? 1 - f.slowAmt : 1) * (f.spdBuffT > 0 ? 1.4 : 1) * (phase2 ? 1.2 : 1) * (0.9 + this.tier * 0.05);
    let mx = 0, my = 0;
    const pref = ai.pref * (f.boss ? 1.3 : 1);
    if (d > pref + 14) { mx = dx / d; my = dy / d; }
    else if (d < pref - 14 && ai.pref > 40) { mx = -dx / d; my = -dy / d; }
    mx += (-dy / d) * ai.strafe * 0.7; my += (dx / d) * ai.strafe * 0.7;
    for (const o of this.foes) { if (o === f || o.dead) continue; const ox = f.x - o.x, oy = f.y - o.y, od = Math.hypot(ox, oy); if (od < 40) { mx += (ox / (od || 1)) * 0.8; my += (oy / (od || 1)) * 0.8; } }
    for (const o of this.arena.obs) { const ox = f.x - o.x, oy = f.y - o.y, od = Math.hypot(ox, oy); if (od < o.r + f.r + 14) { mx += (ox / od) * 1.2 + (-oy / od) * ai.strafe; my += (oy / od) * 1.2 + (ox / od) * ai.strafe; } }
    const ml = Math.hypot(mx, my) || 1;
    if (f.dodgeT <= 0 && !f.dash) {
      f.vx += ((mx / ml) * spd - f.vx) * Math.min(1, dt * 8);
      f.vy += ((my / ml) * spd - f.vy) * Math.min(1, dt * 8);
    }
    f.moving = true; f.face = toP; f.flip = Math.cos(toP) < 0;
  }
  los(a, b) {
    for (const o of this.arena.obs) {
      const ex = b.x - a.x, ey = b.y - a.y, L = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((o.x - a.x) * ex + (o.y - a.y) * ey) / L));
      if (Math.hypot(a.x + ex * t - o.x, a.y + ey * t - o.y) < o.r) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- physics
  physics(f, dt) {
    f.animT += dt;
    for (const k of ['atkT', 'hurtT', 'flashT', 'burnT', 'slowT', 'stunT', 'shieldT', 'atkBuffT', 'spdBuffT', 'dodgeT', 'dodgeCd', 'inv']) if (f[k] > 0) f[k] -= dt;
    if (f.shieldT <= 0) f.shield = 0;
    const cdr = f.spdBuffT > 0 ? 1.5 : 1;
    for (const m of f.moves) if (m.cd > 0) m.cd -= dt * cdr;
    if (f.dead) { f.deadT += dt; return; }
    if (f.burnT > 0) {
      f.burnTick = (f.burnTick || 0) + dt;
      if (f.burnTick > 0.5) { f.burnTick = 0; const dmg = Math.max(1, Math.round(f.burnDps * 0.5)); this.applyDamage(f, dmg, '#ff9a3a', null); }
      if (Math.random() < dt * 12) this.part(f.x + rand(-5, 5), f.y - rand(0, 10), 0, -30, Math.random() < 0.5 ? '#ff7a2e' : '#ffd36b', 0.4, 1);
    }
    let vx = f.vx, vy = f.vy;
    if (f.dash) {
      vx = f.dash.vx; vy = f.dash.vy; f.dash.t -= dt;
      const T = TYPES[f.dash.M.type];
      if (Math.random() < 0.8) this.part(f.x, f.y, -vx * 0.1 + rand(-20, 20), -vy * 0.1 + rand(-20, 20), T.light, 0.25, 2);
      if (f.dash.M.trail) { f.dash.trailT -= dt; if (f.dash.trailT <= 0) { f.dash.trailT = 0.04; this.zones.push({ x: f.x, y: f.y + 3, r: 9, delay: 0, d0: 0, M: { ...f.dash.M, power: 3, kind: 'zone', burn: 0.3 }, owner: f, team: f.team, ticks: 3, tickT: 0.25, life: 0, trail: true }); } }
      for (const o of this.all) {
        if (o.team === f.team || o.dead || f.dash.hit.has(o)) continue;
        if (Math.hypot(o.x - f.x, o.y - f.y) < o.r + f.r + 4) { f.dash.hit.add(o); this.hit(f, o, f.dash.M, 1, Math.atan2(f.dash.vy, f.dash.vx)); }
      }
      if (f.dash.t <= 0) { f.dash = null; f.vx *= 0.3; f.vy *= 0.3; }
    } else if (f.dodgeT > 0) { vx = f.dvx; vy = f.dvy; if (Math.random() < 0.5) this.part(f.x, f.y + 4, 0, 0, 'rgba(255,255,255,0.8)', 0.2, 2); }
    f.x += (vx + f.kx) * dt; f.y += (vy + f.ky) * dt;
    const kd = Math.pow(0.0015, dt); f.kx *= kd; f.ky *= kd;
    // obstacles
    for (const o of this.arena.obs) {
      const ox = f.x - o.x, oy = f.y - o.y, od = Math.hypot(ox, oy), min = o.r + f.r * 0.8;
      if (od < min && od > 0) { f.x = o.x + (ox / od) * min; f.y = o.y + (oy / od) * min; if (f.dash) f.dash.t = Math.min(f.dash.t, 0.02); }
    }
    // other fighters (soft)
    for (const o of this.all) {
      if (o === f || o.dead || f.dash || o.dash) continue;
      const ox = f.x - o.x, oy = f.y - o.y, od = Math.hypot(ox, oy), min = (o.r + f.r) * 0.85;
      if (od < min && od > 0) { const push = (min - od) * 0.5; f.x += (ox / od) * push; f.y += (oy / od) * push; }
    }
    f.x = Math.max(BOUNDS.x0 + f.r, Math.min(BOUNDS.x1 - f.r, f.x));
    f.y = Math.max(BOUNDS.y0 + f.r * 0.5, Math.min(BOUNDS.y1 - 2, f.y));
    if (f.team === 0 || !f.ai.wind) f.moving = Math.hypot(vx, vy) > 12;
  }

  updateProjs(dt) {
    for (const pr of this.projs) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt; pr.spin += dt * 14;
      const T = TYPES[pr.M.type];
      if (Math.random() < 0.6) this.part(pr.x, pr.y, rand(-8, 8), rand(-8, 8), Math.random() < 0.5 ? T.col : T.light, 0.18, 1);
      if (pr.x < BOUNDS.x0 - 6 || pr.x > BOUNDS.x1 + 6 || pr.y < BOUNDS.y0 - 14 || pr.y > BOUNDS.y1 + 6) { this.popProj(pr); continue; }
      for (const o of this.arena.obs) if (Math.hypot(pr.x - o.x, pr.y + 4 - o.y) < o.r + pr.r * 0.5) { this.popProj(pr); break; }
      if (pr.life <= 0) { this.popProj(pr); continue; }
      for (const f of this.all) {
        if (f.team === pr.team || f.dead || pr.hit.has(f) || pr.dead) continue;
        if (Math.hypot(f.x - pr.x, f.y - 3 * f.scale - pr.y) < f.r + pr.r) {
          if (f.inv > 0) { if (!pr.dodged) { pr.dodged = true; this.float(f.x, f.y - 14, 'DODGE', '#ffffff'); } continue; }
          pr.hit.add(f);
          if (pr.M.explode) { this.popProj(pr); break; }
          this.hit(pr.owner, f, pr.M, 1, Math.atan2(pr.vy, pr.vx));
          if (!pr.M.pierce) { pr.dead = true; break; }
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }
  popProj(pr) {
    pr.dead = true;
    const T = TYPES[pr.M.type];
    if (pr.M.explode) {
      const R = pr.M.explode;
      sfx.boom(); this.shake = Math.max(this.shake, 4);
      this.fx.push({ k: 'ring', x: pr.x, y: pr.y, r: R, t: 0, life: 0.3, col: T.col, col2: T.light });
      for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, s = rand(30, 120); this.part(pr.x, pr.y, Math.cos(a) * s, Math.sin(a) * s, [T.col, T.light, '#ffffff'][i % 3], 0.45, 2); }
      for (const f of this.all) if (f.team !== pr.team && !f.dead && Math.hypot(f.x - pr.x, f.y - pr.y) < R + f.r) this.hit(pr.owner, f, pr.M, 1, Math.atan2(f.y - pr.y, f.x - pr.x));
    } else for (let i = 0; i < 5; i++) this.part(pr.x, pr.y, rand(-50, 50), rand(-50, 50), T.light, 0.25, 1);
  }

  updateZones(dt) {
    for (const z of this.zones) {
      z.life += dt;
      if (z.delay > 0) { z.delay -= dt; continue; }
      z.tickT -= dt;
      if (z.tickT <= 0 && z.ticks > 0) {
        z.ticks--; z.tickT = z.M.ticks || z.trail ? 0.5 : 0;
        const T = TYPES[z.M.type];
        if (!z.trail && !z.M.ticks) {
          sfx.boom(); this.shake = Math.max(this.shake, 5);
          for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, s = rand(20, 110); this.part(z.x, z.y, Math.cos(a) * s, Math.sin(a) * s - 40, [T.col, T.light, '#ffffff'][i % 3], 0.5, 2, 160); }
          this.fx.push({ k: 'ring', x: z.x, y: z.y, r: z.r, t: 0, life: 0.25, col: T.light, col2: '#ffffff' });
          if (z.M.type === 'spark') this.fx.push({ k: 'bolt', x: z.x, y: z.y, t: 0, life: 0.18 });
        }
        for (const f of this.all) if (f.team !== z.team && !f.dead && Math.hypot(f.x - z.x, (f.y - z.y) * 1.3) < z.r + f.r) this.hit(z.owner, f, z.M, 1, Math.atan2(f.y - z.y, f.x - z.x), !!(z.trail || z.M.ticks));
      }
      if (z.ticks <= 0 && z.tickT <= 0) z.dead = true;
    }
    this.zones = this.zones.filter((z) => !z.dead);
  }

  // ---------------------------------------------------------------- damage
  hit(att, tgt, M, mult = 1, ang = 0, quiet = false) {
    if (tgt.dead) return;
    if (tgt.inv > 0 && !quiet) { this.float(tgt.x, tgt.y - 14, 'DODGE', '#ffffff'); return; }
    if (tgt.inv > 0) return;
    const atk = att.atk * (att.atkBuffT > 0 ? 1 + 0.35 : 1);
    const tm = typeMult(M.type, tgt.type);
    let dmg = (M.power || 0) * mult * (atk / (atk + tgt.def)) * 2 * tm * (M.type === att.type ? 1.15 : 1) * rand(0.9, 1.1);
    if (att.team === 1) dmg *= this.enemyDmg;
    const crit = Math.random() < 0.08 && !quiet;
    if (crit) dmg *= 1.5;
    dmg = Math.max(1, Math.round(dmg));
    const T = TYPES[M.type];
    let col = tgt.team === 0 ? '#ff6a6a' : '#ffffff';
    if (tm > 1) col = '#ffe04a'; if (tm < 1) col = '#a0a0b8';
    this.applyDamage(tgt, dmg, col, crit ? 'CRIT' : null);
    if (tm > 1 && !quiet) { this.float(tgt.x, tgt.y - 26 * tgt.scale, 'SUPER!', '#ffe04a', 0.9); sfx.super(); }
    if (tm < 1 && !quiet && Math.random() < 0.5) this.float(tgt.x, tgt.y - 26 * tgt.scale, 'resist', '#a0a0b8', 0.7);
    if (M.burn && Math.random() < M.burn) { tgt.burnT = 2.5; tgt.burnDps = tgt.maxHp * 0.025; }
    if (M.slow) { tgt.slowT = 1.6; tgt.slowAmt = M.slow; }
    if (M.stun) { tgt.stunT = M.stun * (tgt.boss ? 0.5 : 1); tgt.ai.wind = null; }
    if (quiet) return;
    const kb = (M.knock || (M.kind === 'proj' ? 50 : 110)) * (tgt.boss ? 0.3 : 1);
    tgt.kx += Math.cos(ang) * kb; tgt.ky += Math.sin(ang) * kb;
    tgt.hurtT = 0.22;
    for (let i = 0; i < 8 + (M.power || 0) / 3; i++) { const a = ang + rand(-1.2, 1.2), s = rand(40, 140); this.part(tgt.x, tgt.y - 4, Math.cos(a) * s, Math.sin(a) * s, i % 3 ? T.col : '#ffffff', 0.35, i % 4 ? 1 : 2); }
    const big = (M.power || 0) >= 20 || crit;
    this.hitstop = Math.max(this.hitstop, big ? 0.075 : 0.035);
    this.shake = Math.max(this.shake, tgt.team === 0 ? 4 : big ? 3.5 : 1.8);
    sfx.hit(big);
    if (tgt.team === 0) this.flashRed = 0.25;
  }
  applyDamage(tgt, dmg, col, tag) {
    if (tgt.shield > 0) { const a = Math.min(tgt.shield, dmg); tgt.shield -= a; dmg -= a; if (dmg <= 0) { this.float(tgt.x, tgt.y - 16, 'BLOCK', '#a8e4ff'); return; } }
    tgt.hp -= dmg; tgt.flashT = 0.1;
    this.float(tgt.x + rand(-4, 4), tgt.y - 16 * tgt.scale, (tag ? tag + ' ' : '') + dmg, col);
    if (tgt.hp <= 0 && !tgt.dead) this.kill(tgt);
  }
  kill(f) {
    f.hp = 0; f.dead = true; f.deadT = 0; f.dash = null; f.ai.wind = null;
    sfx.ko(); this.hitstop = 0.14; this.shake = 7;
    const T = TYPES[f.type];
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, s = rand(40, 180); this.part(f.x, f.y - 6, Math.cos(a) * s, Math.sin(a) * s - 40, [T.col, T.light, '#ffffff', '#ffe04a'][i % 4], rand(0.4, 0.9), 2, 200); }
    if (f.team === 1) this.float(f.x, f.y - 30 * f.scale, 'K.O.!', '#ffe04a', 1.2);
  }

  part(x, y, vx, vy, col, life, size = 1, grav = 0) { if (this.parts.length < 700) this.parts.push({ x, y, vx, vy, col, life, max: life, size, grav }); }
  float(x, y, txt, col, life = 0.8) { this.floaters.push({ x, y, txt, col, life, max: life }); }
  updateFx(dt) {
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.vx *= 0.92; p.vy *= p.grav ? 1 : 0.92; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= dt * 22 * (f.life / f.max); }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flashRed = Math.max(0, this.flashRed - dt);
  }

  // ---------------------------------------------------------------- render
  render(ctx) {
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round(rand(-1, 1) * this.shake), Math.round(rand(-1, 1) * this.shake));
    ctx.drawImage(this.arena.bg, 0, 0);
    // ground telegraphs
    for (const z of this.zones) {
      const T = TYPES[z.M.type];
      if (z.delay > 0) {
        const k = 1 - z.delay / Math.max(0.01, z.d0);
        pixDisc(ctx, z.x, z.y, z.r * k, z.r * k * 0.75, 'rgba(255,60,60,0.22)');
        pixRing(ctx, z.x, z.y, z.r, Math.floor(this.t * 12) % 2 ? '#ff4a4a' : '#ffffff', z.r * 0.75, 1);
        if (z.M.type === 'ember' && z.d0 > 0.5) { // meteor / thunder falling from the sky
          const h = z.delay * 220; pixDisc(ctx, z.x, z.y - h, 4, 4, T.col); pixDisc(ctx, z.x - 1, z.y - h - 1, 2, 2, T.light);
        }
      } else if (z.M.ticks || z.trail) {
        const a = Math.min(1, z.ticks / 2 + 0.3);
        pixDisc(ctx, z.x, z.y, z.r, z.r * 0.7, z.trail ? `rgba(255,120,40,${0.35 * a})` : `rgba(140,220,90,${0.35 * a})`);
        if (Math.random() < 0.3) this.part(z.x + rand(-z.r, z.r) * 0.7, z.y + rand(-z.r, z.r) * 0.4, 0, -20, z.trail ? '#ffb02e' : '#c4f27a', 0.4, 1);
      }
    }
    // aim guide
    const p = this.p;
    if (!p.dead && !this.over && this.aim != null) {
      for (let i = 1; i <= 3; i++) { ctx.fillStyle = i === 3 ? '#ffffff' : 'rgba(255,255,255,0.55)'; ctx.fillRect(Math.round(p.x + Math.cos(this.aim) * (14 + i * 7)), Math.round(p.y - 3 + Math.sin(this.aim) * (14 + i * 7)), 2, 2); }
    }
    // shadows
    for (const f of this.all) { if (f.dead && f.deadT > 0.5) continue; pixDisc(ctx, f.x, f.y + 1, f.r + 1, 2.5 * f.scale, 'rgba(20,10,30,0.3)'); }
    // y-sorted world
    const list = [...this.arena.obs.map((o) => ({ y: o.y, o })), ...this.all.map((f) => ({ y: f.y, f }))].sort((a, b) => a.y - b.y);
    for (const it of list) { if (it.o) drawObstacle(ctx, it.o); else this.drawFighter(ctx, it.f); }
    // projectiles
    for (const pr of this.projs) this.drawProj(ctx, pr);
    // fx
    for (const e of this.fx) {
      const k = e.t / e.life;
      if (e.k === 'ring') { pixRing(ctx, e.x, e.y, e.r * (0.3 + 0.7 * k), k < 0.5 ? e.col2 : e.col, e.r * (0.3 + 0.7 * k) * 0.75); pixRing(ctx, e.x, e.y, e.r * (0.3 + 0.7 * k) - 1, e.col, e.r * (0.3 + 0.7 * k) * 0.75 - 1); }
      if (e.k === 'slash') {
        for (let i = 0; i <= 10; i++) {
          const a = e.ang - e.arc / 2 + (i / 10) * e.arc, rr = e.range * (0.6 + 0.4 * k);
          ctx.fillStyle = i % 2 ? e.col : e.col2; ctx.fillRect(Math.round(e.x + Math.cos(a) * rr), Math.round(e.y - 4 + Math.sin(a) * rr), 2, 2);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(e.x + Math.cos(a) * (rr - 3)), Math.round(e.y - 4 + Math.sin(a) * (rr - 3)), 1, 1);
        }
      }
      if (e.k === 'bolt') { ctx.fillStyle = '#fff6b0'; let x = e.x, y = 0; while (y < e.y) { const nx = x + rand(-6, 6); ctx.fillRect(Math.round(Math.min(x, nx)), y, Math.abs(nx - x) + 2, 8); x = nx; y += 8; } }
    }
    for (const q of this.parts) { ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5); ctx.fillStyle = q.col; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size); }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) { if (f.life / f.max < 0.25 && Math.floor(f.life * 30) % 2) continue; text(ctx, f.txt, f.x, f.y, f.col, 'c'); }
    ctx.restore();
    if (this.flashRed > 0) { ctx.fillStyle = `rgba(255,40,60,${this.flashRed * 0.5})`; ctx.fillRect(0, 0, GW, 3); ctx.fillRect(0, GH - 3, GW, 3); ctx.fillRect(0, 0, 3, GH); ctx.fillRect(GW - 3, 0, 3, GH); }
    this.drawHud(ctx);
  }

  drawFighter(ctx, f) {
    if (f.dead && f.deadT > 0.6) return;
    if (f.dead && Math.floor(f.deadT * 20) % 2) return;
    let frame = 'idle0';
    if (f.dead || f.hurtT > 0 || f.stunT > 0) frame = 'hurt';
    else if (f.atkT > 0 || f.dash) frame = 'atk';
    else if (f.moving) frame = 'walk' + (Math.floor(f.animT * 9) % 4);
    else frame = (f.animT % 3.2) > 3.05 ? 'blink' : (Math.floor(f.animT * 2.4) % 2 ? 'idle1' : 'idle0');
    const s = sprite(f.sp, f.stage, frame);
    const img = f.flashT > 0 || (f.ai.wind && Math.floor(this.t * 16) % 2 && f.ai.wind.big) ? s.flash : s.cv;
    const sc = f.scale, w = s.w * sc, h = s.h * sc;
    const hover = f.float ? Math.round(Math.sin(f.animT * 3) * 1.5) : 0;
    // anchor the body centre (ax) on f.x and the ground row (footY) on f.y
    const dx = Math.round(f.flip ? f.x - w + s.ax * sc : f.x - s.ax * sc), dy = Math.round(f.y - s.footY * sc + hover);
    if (f.inv > 0 && f.team === 0 && Math.floor(this.t * 30) % 2) ctx.globalAlpha = 0.5;
    if (f.flip) { ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); }
    else ctx.drawImage(img, dx, dy, w, h);
    ctx.globalAlpha = 1;
    const top = dy + 2 * sc;
    if (f.shield > 0) pixRing(ctx, f.x, f.y - h * 0.35, f.r + 6, Math.floor(this.t * 8) % 2 ? '#a8e4ff' : '#ffffff', f.r + 4);
    if (f.stunT > 0) for (let i = 0; i < 3; i++) { const a = this.t * 6 + i * 2.1; ctx.fillStyle = '#ffe04a'; ctx.fillRect(Math.round(f.x + Math.cos(a) * 8), Math.round(top + 4 + Math.sin(a) * 2), 2, 2); }
    if (f.slowT > 0 && Math.floor(this.t * 6) % 2) { ctx.fillStyle = '#7ac8ff'; ctx.fillRect(Math.round(f.x - 6), Math.round(f.y - 2), 1, 2); ctx.fillRect(Math.round(f.x + 5), Math.round(f.y - 4), 1, 2); }
    if (f.ai.wind && f.team === 1) { text(ctx, '!', f.x, top - 12, f.ai.wind.big ? '#ff4a4a' : '#ffe04a', 'c'); }
    if (f.team === 1 && !f.boss && !f.dead) {
      const bw = 22, bx = Math.round(f.x - bw / 2), by = Math.round(top - 4);
      ctx.fillStyle = '#1e1426'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#5a2a3a'; ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = f.hp / f.maxHp > 0.3 ? '#ff5a6a' : '#ffb02e'; ctx.fillRect(bx, by, Math.ceil(bw * f.hp / f.maxHp), 2);
      ctx.fillStyle = TYPES[f.type].col; ctx.fillRect(bx - 4, by - 1, 3, 4);
    }
  }

  drawProj(ctx, pr) {
    const T = TYPES[pr.M.type], x = Math.round(pr.x), y = Math.round(pr.y), r = pr.r;
    switch (pr.M.type) {
      case 'ember': pixDisc(ctx, x, y, r + 1, r + 1, T.dark); pixDisc(ctx, x, y, r, r, T.col); pixDisc(ctx, x - 1, y - 1, Math.max(1, r - 1.5), Math.max(1, r - 1.5), T.light); break;
      case 'leaf': { const a = pr.spin, c = Math.cos(a) * 3, s = Math.sin(a) * 3; ctx.fillStyle = T.dark; ctx.fillRect(x - Math.round(c) - 1, y - Math.round(s) - 1, 3, 3); ctx.fillStyle = T.col; ctx.fillRect(x - 1, y - 1, 3, 3); ctx.fillStyle = T.light; ctx.fillRect(x + Math.round(c), y + Math.round(s), 2, 2); break; }
      case 'splash':
        if (pr.M.pierce) { const a = Math.atan2(pr.vy, pr.vx); for (let i = -r; i <= r; i++) { const px = x + Math.round(-Math.sin(a) * i - Math.cos(a) * Math.abs(i) * 0.3), py = y + Math.round(Math.cos(a) * i - Math.sin(a) * Math.abs(i) * 0.3); ctx.fillStyle = Math.abs(i) > r - 2 ? T.light : T.col; ctx.fillRect(px - 1, py - 1, 3, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(px + Math.round(Math.cos(a) * 2), py + Math.round(Math.sin(a) * 2), 1, 1); } }
        else { pixDisc(ctx, x, y, r, r, 'rgba(120,200,255,0.5)'); pixRing(ctx, x, y, r, T.light); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 2, 1); }
        break;
      case 'spark': { const a = Math.atan2(pr.vy, pr.vx); ctx.fillStyle = T.col; for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(x - Math.cos(a) * i * 1.5 + (i % 2 ? 1 : -1) * Math.sin(a)), Math.round(y - Math.sin(a) * i * 1.5), 2, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 2, 2); break; }
      case 'stone': ctx.fillStyle = '#3a2a26'; ctx.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2); ctx.fillStyle = T.col; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = T.light; ctx.fillRect(x - r, y - r, r, 1); break;
      default: pixDisc(ctx, x, y, r, r, T.col);
    }
  }

  drawHud(ctx) {
    const p = this.p, Z = ZONES[this.zi];
    ctx.fillStyle = 'rgba(30,20,38,0.78)'; ctx.fillRect(0, 0, GW, 24);
    ctx.fillStyle = '#1e1426'; ctx.fillRect(0, 24, GW, 1);
    // player
    ctx.fillStyle = TYPES[p.type].col; ctx.fillRect(4, 4, 4, 16);
    text(ctx, `${p.name.toUpperCase()} Lv${p.lvl}`, 12, 3, '#ffffff');
    const bw = 120;
    ctx.fillStyle = '#1e1426'; ctx.fillRect(11, 13, bw + 2, 8);
    ctx.fillStyle = '#4a2a3a'; ctx.fillRect(12, 14, bw, 6);
    const hpk = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = hpk > 0.5 ? '#5fe05a' : hpk > 0.25 ? '#ffd23a' : '#ff4a4a'; ctx.fillRect(12, 14, Math.ceil(bw * hpk), 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(12, 14, Math.ceil(bw * hpk), 1);
    if (p.shield > 0) { ctx.fillStyle = '#a8e4ff'; ctx.fillRect(12, 19, Math.ceil(bw * Math.min(1, p.shield / p.maxHp)), 1); }
    text(ctx, `${Math.ceil(Math.max(0, p.hp))}`, 136, 13, '#ffffff');
    let sx = 170;
    if (p.burnT > 0) { text(ctx, 'BURN', sx, 13, '#ff9a3a'); sx += 36; }
    if (p.slowT > 0) { text(ctx, 'SLOW', sx, 13, '#7ac8ff'); sx += 36; }
    if (p.atkBuffT > 0) { text(ctx, 'ATK+', sx, 13, '#ff7a2e'); sx += 36; }
    if (p.spdBuffT > 0) { text(ctx, 'SPD+', sx, 13, '#ffe04a'); sx += 36; }
    // right side: zone / foes / timer
    const boss = this.foes.find((f) => f.boss);
    if (boss) {
      text(ctx, boss.title.toUpperCase(), GW - 6, 3, '#ffcc33', 'r');
      const w = 150, x0 = GW - 6 - w;
      ctx.fillStyle = '#1e1426'; ctx.fillRect(x0 - 1, 13, w + 2, 8); ctx.fillStyle = '#4a2a3a'; ctx.fillRect(x0, 14, w, 6);
      ctx.fillStyle = boss.hp < boss.maxHp * 0.5 ? '#ff4a4a' : '#c25cff'; ctx.fillRect(x0, 14, Math.ceil(w * Math.max(0, boss.hp) / boss.maxHp), 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x0, 14, Math.ceil(w * Math.max(0, boss.hp) / boss.maxHp), 1);
    } else {
      text(ctx, this.endless ? `ENDLESS WAVE ${this.stage + 1}` : `${Z.name.toUpperCase()} ${this.stage + 1}/4`, GW - 6, 3, '#ffcc33', 'r');
      const left = this.foes.filter((f) => !f.dead).length;
      text(ctx, `FOES ${left}`, GW - 6, 13, '#ffffff', 'r');
      const s = Math.floor(this.t); text(ctx, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, GW - 90, 13, '#c8c0d8', 'r');
    }
    // ability bar
    const icons = [...p.moves.map((m) => ({ M: MOVES[m.id], cd: m.cd, max: MOVES[m.id].cd })), { M: { name: 'Dodge', kind: 'dash', type: 'normal' }, cd: p.dodgeCd, max: 0.85, dodge: true }];
    input.buttons = [];
    if (input.touch) {
      const pos = [[392, 236], [404, 198], [442, 180], [446, 228]];
      icons.forEach((ic, i) => {
        const [bx, by] = pos[i], r = i === 3 ? 18 : 15;
        pixDisc(ctx, bx, by, r, r, 'rgba(30,20,38,0.6)'); pixRing(ctx, bx, by, r, '#ffffff');
        ctx.drawImage(moveIcon(ic.M), bx - 14, by - 14, 28, 28);
        if (ic.cd > 0) { ctx.fillStyle = 'rgba(20,10,30,0.65)'; const h = Math.ceil(28 * Math.min(1, ic.cd / ic.max)); ctx.fillRect(bx - 14, by - 14, 28, h); }
        input.buttons.push({ id: i === 3 ? 'dodge' : 'ab' + i, x: bx, y: by, r });
      });
      if (input.stick) { pixRing(ctx, input.stick.ox, input.stick.oy, 26, 'rgba(255,255,255,0.6)'); pixDisc(ctx, input.stick.ox + input.stickVec.x * 26, input.stick.oy + input.stickVec.y * 26, 9, 9, 'rgba(255,255,255,0.5)'); }
      else { pixRing(ctx, 70, 225, 26, 'rgba(255,255,255,0.35)', 26, 1); text(ctx, 'MOVE', 70, 221, 'rgba(255,255,255,0.6)', 'c'); }
    } else {
      const keys = ['J', 'K', 'L', 'SPC'];
      const x0 = Math.round(GW / 2 - (icons.length * 34) / 2);
      icons.forEach((ic, i) => {
        const x = x0 + i * 34 + (i === 3 ? 6 : 0), y = GH - 36;
        ctx.fillStyle = 'rgba(30,20,38,0.7)'; ctx.fillRect(x - 2, y - 2, 32, 32);
        ctx.drawImage(moveIcon(ic.M), x, y, 28, 28);
        if (ic.cd > 0) {
          ctx.fillStyle = 'rgba(20,10,30,0.7)'; ctx.fillRect(x, y, 28, Math.ceil(28 * Math.min(1, ic.cd / ic.max)));
          if (ic.cd > 0.6) text(ctx, ic.cd.toFixed(0), x + 14, y + 10, '#ffffff', 'c');
        }
        text(ctx, keys[i], x + 14, y - 11, '#ffe04a', 'c');
      });
    }
    // intro / outro banners
    if (this.intro > 0) {
      const t = this.intro;
      text(ctx, t > 0.45 ? 'READY...' : 'FIGHT!', GW / 2, GH / 2 - 20, t > 0.45 ? '#ffffff' : '#ffe04a', 'c', 16);
      if (this.foes.some((f) => f.boss) && t > 0.45) text(ctx, 'BOSS BATTLE', GW / 2, GH / 2 + 4, '#ff6a6a', 'c');
    }
    if (this.over) {
      const k = Math.min(1, this.overT * 3);
      ctx.fillStyle = `rgba(20,10,30,${0.4 * k})`; ctx.fillRect(0, GH / 2 - 26, GW, 44);
      text(ctx, this.over === 'win' ? 'VICTORY!' : 'KNOCKED OUT', GW / 2, GH / 2 - 14 - Math.round((1 - k) * 20), this.over === 'win' ? '#ffe04a' : '#ff6a6a', 'c', 16);
    }
  }
}
