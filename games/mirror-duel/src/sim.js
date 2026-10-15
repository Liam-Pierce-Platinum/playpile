// MIRROR DUEL simulation. Pure + deterministic: step(state, stage, input) at a fixed 60 Hz.
// The player's input drives fighter 0; fighter 1 (the MIRROR) gets the same input with
// left/right swapped (and optionally delayed). Asymmetric arenas are what break the tie.
export const W = 960, H = 540, FLOOR = 440, DT = 1 / 60;
const GRAV = 2300, JUMPV = 860, SPEED = 300, BW = 18, BH = 84;
export const BODY = { w: BW, h: BH };
export const ROUND_FRAMES = 45 * 60;
export const INTRO_FRAMES = 70, KO_FRAMES = 100;

// frames; reach measured from the body edge
export const ATK = {
  p: { start: 4, active: 5, rec: 9, dmg: 7, kb: 330, up: 0, stun: 16, reach: 62, y0: 14, y1: 46, launch: 0 },
  h: { start: 13, active: 6, rec: 18, dmg: 14, kb: 780, up: -380, stun: 30, reach: 80, y0: 20, y1: 72, launch: 50 },
};

export const MODS = {
  slow: { name: 'SLOW', desc: 'mirror moves at 80% speed', speed: 0.8 },
  fast: { name: 'TURBO', desc: 'mirror moves 20% faster', speed: 1.2 },
  delay: { name: 'LAG', desc: 'mirror copies you 1/6 s late', delay: 10 },
  heavy: { name: 'HEAVY', desc: 'mirror hits 30% harder, gets knocked back less', dmgOut: 1.3, kbIn: 0.75 },
  light: { name: 'FEATHER', desc: 'mirror flies 40% further when hit', kbIn: 1.4 },
  armor: { name: 'ARMOR', desc: 'mirror takes 20% less damage', dmgIn: 0.8 },
};

export function compileStage(def) {
  const solids = [];
  const floor = def.floor || [[0, W]];
  for (const [a, b] of floor) solids.push({ x0: a, x1: b, y0: FLOOR, y1: H + 400, floor: true });
  const elec = def.elec || '';
  solids.push({ x0: -300, x1: 0, y0: -2000, y1: H + 400, elec: elec.includes('L'), edge: true });
  solids.push({ x0: W, x1: W + 300, y0: -2000, y1: H + 400, elec: elec.includes('R'), edge: true });
  for (const b of def.blocks || []) solids.push({ x0: b[0], x1: b[0] + b[2], y0: b[1], y1: b[1] + b[3], elec: !!b[4] });
  const pits = [];
  let last = 0;
  for (const [a, b] of floor) { if (a > last) pits.push([last, a]); last = b; }
  if (last < W) pits.push([last, W]);
  const m = { speed: 1, delay: 0, dmgOut: 1, dmgIn: 1, kbIn: 1 };
  for (const k of def.mods || []) Object.assign(m, Object.fromEntries(Object.entries(MODS[k]).filter(([kk]) => !['name', 'desc'].includes(kk))));
  const st = {
    def, solids, pits, mod: m,
    spikes: (def.spikes || []).map((s) => ({ x0: s[0], x1: s[1], y: s[2] ?? FLOOR, dir: s[3] || 'up' })),
    conv: (def.conv || []).map((c) => ({ x0: c[0], x1: c[1], v: c[2] })),
    ice: def.ice || [], pads: def.pads || [],
    lasers: (def.lasers || []).map((l) => ({ x: l[0], period: l[1], on: l[2], phase: l[3] || 0 })),
    hp: def.hp || 100, sx: def.sx || 360,
  };
  // hazard x positions (for the bot's heuristic + the hint arrows)
  st.hazX = [
    ...st.spikes.map((s) => (s.x0 + s.x1) / 2), ...st.lasers.map((l) => l.x), ...pits.map((p) => (p[0] + p[1]) / 2),
    ...solids.filter((s) => s.elec).map((s) => (s.edge ? (s.x0 < 0 ? 0 : W) : (s.x0 + s.x1) / 2)),
  ];
  return st;
}

function fighter(id, x, hp) {
  return { id, x, y: FLOOR, sx: x, vx: 0, kvx: 0, vy: 0, face: id ? -1 : 1, hp, hpMax: hp, ground: true, act: null,
    stun: 0, inv: 0, launch: 0, flash: 0, anim: 0, pj: false, pp: false, ph: false, dmgTaken: 0, hazDealt: 0 };
}

export function newRound(st, round = 1) {
  return { t: 0, ft: 0, freeze: 0, phase: 'intro', pt: 0, round, winner: -1, why: '',
    f: [fighter(0, st.sx, st.hp), fighter(1, W - st.sx, st.hp)], buf: [], ev: [] };
}

export function cloneState(s) {
  const f = s.f.map((x) => ({ ...x, act: x.act && { ...x.act } }));
  return { ...s, f, buf: s.buf.slice(-12), ev: [] };
}

const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const inRanges = (x, list) => list.some((r) => x >= r[0] && x <= r[1]);

function overlaps(f, s) { return f.x - BW < s.x1 && f.x + BW > s.x0 && f.y - BH < s.y1 && f.y > s.y0 + 0.01; }

function hurt(s, st, f, dmg, label, x, y) {
  if (f.inv > 0 || s.phase !== 'fight') return false;
  dmg *= f.id === 1 ? st.mod.dmgIn : 1;
  f.hp -= dmg; f.dmgTaken += dmg; f.inv = 45; f.flash = 8; f.act = null; f.stun = Math.max(f.stun, 20);
  s.f[1 - f.id].hazDealt += dmg;
  s.freeze = Math.max(s.freeze, 6);
  s.ev.push({ k: 'haz', who: f.id, label, dmg, x: x ?? f.x, y: y ?? f.y - BH / 2 });
  return true;
}

function collideX(s, st, f, dir) {
  for (const b of st.solids) {
    if (!overlaps(f, b)) continue;
    const d = dir || (f.x < (b.x0 + b.x1) / 2 ? 1 : -1);
    f.x = d > 0 ? b.x0 - BW : b.x1 + BW;
    const sp = f.vx + f.kvx;
    if (f.launch > 0 && Math.abs(sp) > 300) {
      f.launch = 0;
      if (b.elec) hurt(s, st, f, 18, 'ZAPPED!', d > 0 ? b.x0 : b.x1, f.y - BH / 2);
      else if (s.phase === 'fight') { f.hp -= 5; f.dmgTaken += 5; s.f[1 - f.id].hazDealt += 5; f.flash = 6; s.freeze = Math.max(s.freeze, 4);
        s.ev.push({ k: 'haz', who: f.id, label: 'WALL SLAM', dmg: 5, x: d > 0 ? b.x0 : b.x1, y: f.y - BH / 2, soft: true }); }
      f.kvx = -f.kvx * 0.35;
    } else f.kvx = 0;
    f.vx = 0;
  }
}

function collideY(f, st) {
  for (const b of st.solids) {
    if (!overlaps(f, b)) continue;
    if (f.vy >= 0) { f.y = b.y0; f.vy = 0; f.ground = true; } else { f.y = b.y1 + BH; f.vy = 0; }
  }
}

function surface(st, f) {
  let conv = 0, ice = false, pad = false;
  if (f.ground) {
    for (const c of st.conv) if (f.x >= c.x0 && f.x <= c.x1) conv = c.v;
    ice = inRanges(f.x, st.ice); pad = inRanges(f.x, st.pads);
  }
  return { conv, ice, pad };
}

function stepFighter(s, st, f, o, c) {
  const mod = f.id === 1 ? st.mod : { speed: 1 };
  f.anim++;
  if (f.inv > 0) f.inv--; if (f.stun > 0) f.stun--; if (f.launch > 0) f.launch--; if (f.flash > 0) f.flash--;
  const fight = s.phase === 'fight';
  const jp = c.j && !f.pj, pp = c.p && !f.pp, hp = c.h && !f.ph;
  f.pj = !!c.j; f.pp = !!c.p; f.ph = !!c.h;
  if (!f.act && f.stun <= 0 && o.x !== f.x) f.face = o.x > f.x ? 1 : -1;
  const can = fight && f.stun <= 0 && f.hp > 0;
  if (can && jp && f.ground && !f.act) { f.vy = -JUMPV; f.ground = false; s.ev.push({ k: 'jump', who: f.id, x: f.x, y: f.y }); }
  if (can && !f.act && (pp || hp)) { f.act = { k: hp ? 'h' : 'p', t: 0, hit: false }; s.ev.push({ k: 'swing', who: f.id, heavy: hp }); }
  const sf = surface(st, f);
  let want = can ? ((c.r ? 1 : 0) - (c.l ? 1 : 0)) * SPEED * mod.speed : 0;
  if (f.act && f.ground) want *= 0.25;
  const acc = f.ground ? (sf.ice ? 650 : 4200) : 1800;
  f.vx = approach(f.vx, want + sf.conv, acc * DT);
  f.kvx = approach(f.kvx, 0, (f.ground ? (sf.ice ? 320 : 2600) : 480) * DT);
  if (sf.pad && f.vy >= 0) { f.vy = -1250; f.ground = false; s.ev.push({ k: 'pad', who: f.id, x: f.x, y: f.y }); }
  f.vy += GRAV * DT;
  const dx = (f.vx + f.kvx) * DT;
  f.x += dx; collideX(s, st, f, Math.sign(dx));
  f.ground = false; f.y += f.vy * DT; collideY(f, st);
  if (f.act) { f.act.t++; const A = ATK[f.act.k]; if (f.act.t >= A.start + A.active + A.rec) f.act = null; }
  // hazards
  for (const sp of st.spikes) {
    if (f.x + BW * 0.6 < sp.x0 || f.x - BW * 0.6 > sp.x1) continue;
    const touch = sp.dir === 'up' ? f.y >= sp.y - 10 && f.y - BH < sp.y : f.y - BH <= sp.y + 10 && f.y > sp.y;
    if (touch && hurt(s, st, f, 16, 'SPIKED!', f.x, sp.y)) {
      f.vy = sp.dir === 'up' ? -720 : 260; f.ground = false;
      const cx = (sp.x0 + sp.x1) / 2;
      f.kvx = (Math.sign(f.x - cx) || -f.face) * 380; f.launch = 0;
    }
  }
  for (const L of st.lasers) {
    if ((s.t + L.phase) % L.period >= L.on) continue;
    if (Math.abs(f.x - L.x) < BW + 4 && hurt(s, st, f, 12, 'ZAPPED!', L.x, f.y - BH / 2)) {
      f.kvx = (Math.sign(f.x - L.x) || -f.face) * 430; f.vy = -320; f.ground = false; f.launch = 0;
    }
  }
  if (f.y > H + 150) {
    f.inv = 0; hurt(s, st, f, 28, 'FELL!', f.x, H - 20);
    f.x = f.sx; f.y = FLOOR - 160; f.vx = f.kvx = f.vy = 0; f.inv = 70; f.ground = false;
  }
}

function hitbox(f) {
  const A = ATK[f.act.k], top = f.y - BH;
  const x0 = f.face > 0 ? f.x + BW - 6 : f.x - BW - A.reach, x1 = f.face > 0 ? f.x + BW + A.reach : f.x - BW + 6;
  return { x0, x1, y0: top + A.y0, y1: top + A.y1 };
}

function pushApart(s, st) {
  const [a, b] = s.f;
  if (a.y - BH >= b.y || b.y - BH >= a.y) return;
  const dx = b.x - a.x, ov = 2 * BW - Math.abs(dx);
  if (ov <= 0) return;
  const d = Math.sign(dx) || 1;
  const ax = a.x; a.x -= d * ov / 2; collideX(s, st, a, -d);
  const moved = Math.abs(a.x - ax);
  b.x += d * (ov - moved); collideX(s, st, b, d);
}

export function mirrorInput(c) { return { l: c.r, r: c.l, j: c.j, p: c.p, h: c.h }; }

export function step(s, st, input) {
  s.ev.length = 0;
  if (s.freeze > 0) { s.freeze--; return s; }
  s.t++; s.pt++;
  const raw = input || {};
  s.buf.push(raw); if (s.buf.length > 20) s.buf.shift();
  const mi = mirrorInput(s.buf[Math.max(0, s.buf.length - 1 - st.mod.delay)] || {});
  const live = s.phase === 'fight';
  stepFighter(s, st, s.f[0], s.f[1], live ? raw : {});
  stepFighter(s, st, s.f[1], s.f[0], live ? mi : {});
  pushApart(s, st);
  // attacks resolve simultaneously: trades are the default when you are perfectly mirrored
  const hits = [];
  for (const f of s.f) {
    if (!f.act || f.act.hit) continue;
    const A = ATK[f.act.k];
    if (f.act.t < A.start || f.act.t >= A.start + A.active) continue;
    const o = s.f[1 - f.id], hb = hitbox(f);
    if (hb.x0 < o.x + BW && hb.x1 > o.x - BW && hb.y0 < o.y && hb.y1 > o.y - BH) hits.push([f, o, A, f.act.k, f.act]);
  }
  for (const [f, o, A, k, act] of hits) {
    act.hit = true;
    let dmg = A.dmg * (f.id === 1 ? st.mod.dmgOut : 1) * (o.id === 1 ? st.mod.dmgIn : 1);
    if (s.phase === 'fight') { o.hp -= dmg; o.dmgTaken += dmg; }
    o.kvx = f.face * A.kb * (o.id === 1 ? st.mod.kbIn : 1);
    if (A.up) { o.vy = A.up; o.ground = false; }
    o.stun = A.stun; o.launch = A.launch; o.act = null; o.flash = 6;
    s.freeze = Math.max(s.freeze, k === 'h' ? 9 : 5);
    s.ev.push({ k: 'hit', who: o.id, heavy: k === 'h', dmg, x: o.x - f.face * 6, y: o.y - BH + (A.y0 + A.y1) / 2, face: f.face, trade: hits.length > 1 });
  }
  for (const f of s.f) f.hp = Math.max(0, f.hp);
  // phases
  if (s.phase === 'intro' && s.pt >= INTRO_FRAMES) { s.phase = 'fight'; s.pt = 0; s.ev.push({ k: 'fight' }); }
  else if (s.phase === 'fight') {
    s.ft++;
    const [a, b] = s.f;
    if (a.hp <= 0 || b.hp <= 0) {
      s.winner = a.hp <= 0 && b.hp <= 0 ? 2 : a.hp <= 0 ? 1 : 0; s.why = 'ko';
      s.phase = 'ko'; s.pt = 0; s.ev.push({ k: 'ko', winner: s.winner });
    } else if (s.ft >= ROUND_FRAMES) {
      const ra = a.hp / a.hpMax, rb = b.hp / b.hpMax;
      s.winner = Math.abs(ra - rb) < 1e-6 ? 2 : ra > rb ? 0 : 1; s.why = 'time';
      s.phase = 'ko'; s.pt = 0; s.ev.push({ k: 'time', winner: s.winner });
    }
  } else if (s.phase === 'ko' && s.pt >= KO_FRAMES) { s.phase = 'done'; s.pt = 0; }
  return s;
}
