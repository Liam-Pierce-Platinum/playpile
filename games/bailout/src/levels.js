// Worlds, the level DSL, the 40 campaign levels, the Daily Gauntlet and the
// endless Freefall Mountain generator.
//
// A level is a string of tokens "name:arg,arg". The builder walks a cursor
// left to right, appending ground points and hazards:
//   f:L            flat               up:L,H / dn:L,H   smooth climb / descent
//   hills:N,A,WL   N rolling bumps    rollers:N          small rhythm bumps
//   jump:S,dy      kicker + gap + landing ramp (S = size 1..5, dy = landing drop)
//   table:S        tabletop (no gap)  drop:H             cliff drop onto a down-slope
//   loop:R         loop-the-loop (adds its own booster run-in)
//   seesaw:L       see-saw plank      bridge:W           collapsing plank bridge over a gap
//   draw:W         drawbridge (timed) crates:N           crates that drop from the sky
//   tnt:N          TNT barrels after a bump              chase / rockfall   boulders
//   fan:W          gap with an updraft fan               conv:L,S           conveyor booster
//   ice:L,H        icy downhill       lava:S,W           jump over a lava pit
//   cp             checkpoint flag    arrow:gas|release|flip|brake|land   painted tutorial pictogram
//   hint:release|flip   one-time in-world text hint (shown until the player has done the thing)
import { Terrain } from './terrain.js';
import { rng } from './util.js';
import { MEDAL_TABLE } from './medals.js';

export const THEMES = {
  canyon: { name: 'Canyon', sky: ['#5cc4f5', '#7fd3ff', '#d6f3ff'], ground: '#e2734a', ground2: '#c95c37', top: '#f6c47a', top2: '#ffe0a3', dots: '#c45a36', far: '#f3b18c', mid: '#e48a62', near: '#b9543a', haze: '#ffe8cf', sun: '#fff4c2', accent: '#ffd23f', music: 0 },
  junk: { name: 'Junkyard', sky: ['#2f8f8c', '#5fbcb3', '#f6cf96'], ground: '#9c5a36', ground2: '#7d4529', top: '#3fb3a4', top2: '#7fe0cf', dots: '#6e3a20', far: '#78aea6', mid: '#4f8582', near: '#5a3424', haze: '#f6d9aa', sun: '#ffe3a3', accent: '#ff8a3d', music: 1 },
  glacier: { name: 'Glacier', sky: ['#5fb4ef', '#9be7ff', '#effcff'], ground: '#5fa9dc', ground2: '#4a8fc4', top: '#ffffff', top2: '#ffffff', dots: '#8fd0f2', far: '#d7f2ff', mid: '#aee3f7', near: '#6db8e0', haze: '#f3fdff', sun: '#ffffff', accent: '#2d7fe0', music: 2 },
  volcano: { name: 'Volcano', sky: ['#1c1420', '#3d1f26', '#8a3324'], ground: '#3a3342', ground2: '#2a2431', top: '#5b5262', top2: '#7a7084', dots: '#4b4354', far: '#4a2b30', mid: '#33232b', near: '#1f1820', haze: '#ff7a3d', sun: '#ff9a5a', accent: '#ff5a1f', lava: '#ff5a1f', music: 3 },
  neon: { name: 'Neon City', sky: ['#0d0826', '#24124f', '#5a1f7a'], ground: '#1e1a3c', ground2: '#151230', top: '#ff3dbb', top2: '#ffa3e3', dots: '#2c2758', far: '#2b2160', mid: '#1f1748', near: '#140f30', haze: '#ff3dbb', sun: '#ffe0f4', accent: '#2ef2ff', music: 4 },
};
export const WORLDS = ['canyon', 'junk', 'glacier', 'volcano', 'neon'];

// ------------------------------------------------------------------ levels
// opts.airMul scales air spin speed/accel (the first three levels are gentler so a
// new player cannot over-rotate while learning)
const D = (name, src, flips = 0, opts = {}) => ({ name, src, flips, ...opts });
export const LEVELS = [
  // ---------------- Canyon: learn gas, then air rotation, then landing
  D('First Gear', 'arrow:gas f:300 hills:2,35,560 f:200 up:420,90 dn:420,90 f:200 rollers:3 f:200 arrow:release hint:release table:1 f:250 cp hills:3,45,500 f:200 dn:600,150 f:100 table:2 f:300 rollers:4 f:250 up:300,60 f:200', 0, { airMul: 0.6 }),
  D('Flip Switch', 'f:300 table:1 f:200 arrow:flip hint:flip drop:520 f:300 hills:2,40,520 cp f:200 arrow:flip drop:600 f:300 table:2 f:250 arrow:flip jump:3,220 f:300 rollers:3 f:200', 3, { airMul: 0.85 }),
  D('Stick It', 'f:200 jump:2,40 f:250 arrow:land jump:2,140 f:300 cp hills:2,60,600 f:100 drop:480 f:300 jump:3,80 f:300 cp table:2 rollers:4 f:100 jump:3,180 f:350', 3, { airMul: 0.85 }),
  D('Mesa Hop', 'f:200 up:500,140 f:100 jump:3,0 f:200 jump:2,-40 f:300 cp dn:500,160 table:3 f:250 hills:3,60,520 cp drop:560 f:250 jump:3,120 f:300 rollers:5 f:200', 3),
  D('Boulder Run', 'f:250 table:2 f:200 cp chase f:300 jump:2,60 f:300 cp hills:2,55,560 f:100 chase f:250 jump:3,100 f:300 drop:400 f:350', 3),
  D('Rope Bridge', 'f:250 bridge:420 f:200 jump:2,60 f:250 cp hills:2,50,520 bridge:560 f:150 table:2 f:250 cp dn:400,120 bridge:700 f:200 jump:3,140 f:350', 2),
  D('Canyon Leap', 'f:250 jump:3,120 f:250 drop:620 f:300 cp jump:4,160 f:300 hills:2,60,560 cp chase f:200 jump:3,60 f:250 drop:700 f:350', 5),
  D('Grand Canyon', 'f:200 up:500,160 jump:3,40 f:250 bridge:520 f:200 cp chase f:250 drop:560 f:300 cp table:3 jump:4,180 f:250 cp hills:3,60,520 bridge:620 f:150 jump:4,220 f:350', 6),
  // ---------------- Junkyard: crates, TNT, see-saws, conveyors
  D('Scrap Heap', 'f:300 crates:1 f:300 hills:2,40,520 seesaw:200 f:250 cp conv:500,320 jump:2,60 f:250 crates:2 f:300 jump:3,100 f:350', 2),
  D('Boom Town', 'f:300 tnt:1 f:300 jump:2,60 f:250 cp tnt:2 f:250 seesaw:220 f:300 cp conv:600,360 jump:3,80 f:250 tnt:2 f:350', 2),
  D('Tilt-a-Whirl', 'f:250 seesaw:200 f:200 seesaw:240 f:250 cp drop:420 f:250 seesaw:260 f:200 jump:3,120 f:250 cp crates:2 f:200 seesaw:240 f:350', 3),
  D('Conveyor Hell', 'f:200 conv:600,380 jump:3,40 f:250 conv:400,-260 f:300 cp tnt:1 f:250 conv:700,420 jump:4,120 f:250 cp crates:3 f:250 jump:3,80 f:350', 3),
  D('Crusher Lane', 'f:250 crates:2 f:200 tnt:1 f:250 crates:3 f:250 cp hills:3,50,520 seesaw:240 f:200 cp jump:3,100 f:200 tnt:2 f:250 crates:2 f:350', 3),
  D('Scrapper Jump', 'f:200 conv:500,380 jump:4,100 f:300 drop:560 f:250 cp seesaw:240 f:250 tnt:2 f:250 cp conv:600,420 jump:4,160 f:300 crates:2 f:350', 5),
  D('Magnet Mile', 'f:250 hills:3,60,520 tnt:1 f:250 seesaw:260 f:200 cp conv:500,400 jump:3,80 f:200 crates:3 f:250 cp drop:600 f:250 tnt:2 f:200 jump:4,140 f:350', 5),
  D('King of Scrap', 'f:200 crates:2 f:200 seesaw:240 f:200 tnt:2 f:200 cp conv:600,420 jump:4,120 f:250 seesaw:260 f:250 cp drop:640 f:250 crates:3 f:200 cp tnt:2 f:200 conv:500,420 jump:5,200 f:350', 7),
  // ---------------- Glacier: ice, loops, updraft fans, ice bridges
  D('Cold Start', 'f:300 ice:700,160 f:300 jump:2,60 f:250 cp loop:150 f:300 hills:2,50,560 cp ice:800,220 f:200 jump:3,100 f:350', 2),
  D('Updraft', 'f:300 fan:420 f:250 jump:2,80 f:250 cp fan:520 f:250 ice:600,140 f:250 cp jump:3,120 f:200 fan:600 f:350', 2),
  D('Loop Lake', 'f:250 loop:150 f:300 jump:3,60 f:250 cp loop:170 f:250 ice:700,180 f:200 cp bridge:500 f:250 loop:160 f:350', 2),
  D('Snow Blind', 'f:200 ice:600,160 jump:3,120 f:250 cp drop:600 f:300 fan:520 f:250 cp loop:160 f:250 jump:4,160 f:350', 4),
  D('Glass Bridge', 'f:250 bridge:520 f:200 ice:500,120 bridge:620 f:250 cp fan:560 f:250 bridge:700 f:250 cp jump:3,100 f:200 loop:170 f:350', 3),
  D('Avalanche', 'f:200 up:500,160 f:100 cp chase ice:600,140 f:200 jump:3,80 f:250 cp chase f:200 drop:600 f:300 fan:520 f:350', 4),
  D('Frostbite Flips', 'f:250 jump:4,160 f:250 drop:700 f:300 cp loop:170 f:250 jump:4,200 f:250 cp fan:640 f:200 ice:700,200 jump:5,220 f:350', 7),
  D('Ice Palace', 'f:200 loop:160 f:250 bridge:560 f:200 cp fan:560 f:250 ice:700,180 jump:4,140 f:250 cp loop:180 f:200 chase f:200 drop:640 f:300 cp jump:4,200 f:350', 7),
  // ---------------- Volcano: lava pits, rockfall, drawbridges, TNT
  D('Hot Feet', 'f:300 lava:2,300 f:300 hills:2,50,540 cp lava:2,380 f:250 jump:3,80 f:250 cp lava:3,460 f:350', 2),
  D('Rockfall', 'f:250 rockfall f:300 jump:2,60 f:250 cp rockfall f:250 lava:3,420 f:250 cp rockfall f:250 jump:3,100 f:350', 2),
  D('Drawbridge', 'f:300 draw:340 f:300 lava:2,360 f:250 cp draw:420 f:250 jump:3,80 f:250 cp tnt:2 f:200 draw:460 f:350', 2),
  D('Magma Chamber', 'f:200 drop:560 f:250 lava:3,460 f:250 cp chase f:250 jump:3,100 f:250 cp tnt:2 f:200 lava:3,500 f:350', 4),
  D('Ash Cloud', 'f:600 rockfall f:200 draw:420 f:250 cp lava:3,480 f:250 rockfall f:250 cp drop:640 f:300 tnt:2 f:200 jump:4,140 f:350', 5),
  D('Eruption', 'f:200 chase f:200 lava:3,460 f:250 cp draw:440 f:250 tnt:2 f:250 cp rockfall f:200 jump:4,160 f:250 cp drop:680 f:300 lava:4,560 f:350', 6),
  D('Cinder Cones', 'f:250 hills:3,70,520 lava:3,480 f:200 cp jump:4,180 f:250 draw:460 f:250 cp drop:700 f:250 rockfall f:250 cp lava:4,580 f:200 jump:5,240 f:350', 8),
  D('Heart of Fire', 'f:500 lava:3,460 f:200 draw:440 f:250 cp chase f:200 tnt:2 f:200 lava:4,540 f:250 cp drop:720 f:300 rockfall f:200 cp draw:480 f:200 jump:5,240 f:250 lava:4,600 f:350', 9),
  // ---------------- Neon City: everything, at night, faster
  D('Night Shift', 'f:300 conv:600,420 loop:160 f:300 jump:3,80 f:250 cp fan:520 f:250 seesaw:240 f:300 cp jump:4,140 f:350', 4),
  D('Billboard', 'f:250 drop:640 f:300 conv:500,420 jump:4,160 f:250 cp draw:440 f:250 loop:170 f:250 cp tnt:2 f:200 jump:4,180 f:350', 6),
  D('Rooftop Rush', 'f:200 jump:3,0 f:200 jump:3,-40 f:200 jump:3,40 f:250 cp fan:600 f:200 crates:3 f:250 cp conv:600,440 jump:5,200 f:350', 6),
  D('Sky Rail', 'f:250 loop:170 f:200 loop:170 f:250 cp seesaw:260 f:200 draw:460 f:250 cp drop:700 f:300 fan:600 f:350', 5),
  D('Short Circuit', 'f:200 tnt:2 f:200 conv:600,440 jump:4,140 f:250 cp crates:3 f:250 seesaw:260 f:250 cp loop:180 f:200 drop:720 f:300 cp lava:4,560 f:350', 7),
  D('Afterglow', 'f:250 jump:5,220 f:250 drop:760 f:300 cp fan:640 f:200 draw:480 f:250 cp jump:5,240 f:250 loop:180 f:250 cp tnt:2 f:200 jump:5,260 f:350', 10),
  D('Overdrive', 'f:200 conv:700,460 loop:180 f:200 conv:500,460 jump:5,220 f:250 cp seesaw:260 f:200 crates:3 f:250 cp drop:760 f:300 draw:480 f:250 cp fan:640 f:200 jump:5,260 f:350', 10),
  D('BAILOUT', 'f:200 up:400,120 jump:4,100 f:200 lava:4,560 f:250 cp loop:180 f:200 tnt:2 f:200 draw:480 f:250 cp chase f:200 drop:760 f:300 cp fan:660 f:200 seesaw:260 f:200 cp conv:700,460 jump:5,300 f:250 crates:3 f:400', 12),
];
LEVELS.forEach((l, i) => { l.id = i; l.world = WORLDS[Math.floor(i / 8)]; l.num = (i % 8) + 1; });

// medal times, calibrated by the autopilot (tools/medals.mjs): [gold, silver, bronze, platinum]
export const MEDALS = Object.fromEntries(MEDAL_TABLE.map((m, i) => [i, m]));
export const MEDAL_NAMES = ['No medal', 'Bronze', 'Silver', 'Gold', 'Platinum'];
export const MEDAL_COLS = ['#5b5f73', '#e0915a', '#d6dde8', '#ffd23f', '#9fe8ff'];
// medal index (0-4) for a final time against a [gold, silver, bronze, platinum] table
export function medalFor(t, M) {
  if (!M || !M[0]) return 0;
  return M[3] && t <= M[3] ? 4 : t <= M[0] ? 3 : t <= M[1] ? 2 : t <= M[2] ? 1 : 0;
}

// ------------------------------------------------------------------ builder
export class Builder {
  constructor(seed = 1) {
    this.T = new Terrain();
    this.rng = rng(seed);
    this.objs = [];
    this.cps = [];
    this.pits = [];
    this.fans = [];
    this.x = 0; this.y = 0;
    this.pts = []; this.sp = [];
    this.mode = null;
    this.flipSpots = 0;
    this.hints = [];
    this.world = null;
    this.start(-400, 0);
  }
  start(x, y) { this.x = x; this.y = y; this.pts = [x, y]; this.sp = []; }
  pt(x, y, props) { this.pts.push(x, y); this.sp.push(props || this.mode); this.x = x; this.y = y; }
  end() {
    if (this.pts.length >= 4) { const sp = this.sp; this.T.addPiece(this.pts, {}, (i) => sp[i]); }
    this.pts = []; this.sp = [];
  }
  gap(w, dy, floorExtra = 380) {
    const x0 = this.x, y0 = this.y;
    this.end();
    this.start(x0 + w, y0 + dy);
    this.pits.push({ x0, x1: x0 + w, y: Math.max(y0, y0 + dy) + floorExtra });
  }
  // eased curve to (x+L, y+dy) using f(t) in 0..1
  curve(L, dy, f = (t) => (1 - Math.cos(Math.PI * t)) / 2, n = 0) {
    n = n || Math.max(2, Math.ceil(L / 22));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) { const t = i / n; this.pt(x0 + L * t, y0 + dy * f(t)); }
  }
  flat(L) { this.curve(L, 0, (t) => t, Math.max(1, Math.ceil(L / 120))); }

  token(tok) {
    (this.marks || (this.marks = [])).push([Math.round(this.x), tok]);
    const [name, a = ''] = tok.split(':');
    // numbers become numbers, words (arrow:gas, hint:flip) stay strings
    const v = a ? a.split(',').map((s) => (s === '' || isNaN(+s) ? s : +s)) : [];
    const fn = this['t_' + name];
    if (!fn) throw new Error('unknown token ' + tok);
    fn.apply(this, v);
  }
  // flow: a bag of connector pieces inserted after each authored feature so
  // levels breathe (and run 25-45 s) without hand-writing every metre
  build(src, flow = null, level = 0) {
    this.t_f(750);
    this.startX = -150;
    // the first level of each world gets no gap jumps from the flow bag: its first
    // jumps are the authored rolling hills and tables
    if (flow && level === 0) flow = flow.filter((f) => !/jump|drop/.test(f));
    const toks = src.trim().split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      this.token(t);
      const name = t.split(':')[0];
      if (flow && !['f', 'cp', 'arrow', 'hint', 'up', 'dn'].includes(name) && i < toks.length - 1) {
        const n = level >= 4 ? 2 : 1;
        for (let k = 0; k < n; k++) { this.flat(260); for (const ft of this.rng.pick(flow).split(' ')) this.token(ft); }
        this.flat(240);
      }
    }
    this.t_fin();
    this.end();
    return this.result();
  }
  result() {
    return { marks: this.marks, terrain: this.T, objs: this.objs, cps: this.cps, pits: this.pits, fans: this.fans, finish: this.finishX, startX: this.startX, flipSpots: this.flipSpots, hints: this.hints, props: this.world ? this.props() : [] };
  }
  // cheap trackside dressing (rocks, cacti, tyre stacks, cones, signs) every ~400 px
  // on flat-ish ground, kept clear of hazards, checkpoints, pits and the finish
  props() {
    const out = [], r = this.rng, T = this.T;
    const objX = this.objs.map((o) => o.x ?? o.cx ?? o.hx ?? o.x0 ?? -1e9);
    let x = this.startX + 260, last = -1;
    const end = (this.finishX || this.x) + 300;
    while (x < end) {
      x += 300 + r() * 260;
      const y = T.surfaceY(x);
      if (!isFinite(y) || Math.abs(T.slopeAt(x)) > 0.28) continue;
      if (this.pits.some((p) => x > p.x0 - 90 && x < p.x1 + 90)) continue;
      if (T.lava.some((l) => x > l.x0 - 90 && x < l.x1 + 90)) continue;
      if (T.loops.some((l) => x > l.x0 - 60 && x < l.x1 + 60)) continue;
      if (T.overlays.some((o) => x > o.x0 - 50 && x < o.x1 + 50)) continue;
      if (T.decals.some((d) => Math.abs(d.x - x) < 160)) continue;
      if (this.cps.some((c) => Math.abs(c.x - x) < 150)) continue;
      if (Math.abs(x - this.finishX) < 220 || Math.abs(x - this.startX) < 200) continue;
      if (objX.some((ox) => Math.abs(ox - x) < 170)) continue;
      // never the same prop twice in a row; signs (kind 2) are never mirrored
      const kind = (last + 1 + r.int(0, 1)) % 3; last = kind;
      out.push({ x, y, kind, v: r(), flip: kind !== 2 && r() < 0.5 });
    }
    return out;
  }

  // -------- tokens
  t_f(L) { this.flat(+L); }
  t_up(L, H) { this.curve(L, -H); }
  t_dn(L, H) { this.curve(L, H); }
  t_rollers(n) { for (let i = 0; i < n; i++) this.bump(300, 26); this.flat(60); }
  bump(L, A) { const x0 = this.x, y0 = this.y, n = Math.ceil(L / 18); for (let i = 1; i <= n; i++) { const t = i / n; this.pt(x0 + L * t, y0 - A * Math.sin(Math.PI * t) ** 2); } }
  kicker(S) {
    // parabola into a straight lip section, so the suspension settles before take-off
    const kh = 32 + S * 17, kl = 140 + S * 22, x0 = this.x, y0 = this.y, n = Math.ceil(kl / 12);
    const xc = 0.6 * kl, a = kh / (2 * xc * kl - xc * xc), m = 2 * a * xc;
    for (let i = 1; i <= n; i++) { const x = (i / n) * kl; const y = x < xc ? a * x * x : a * xc * xc + m * (x - xc); this.pt(x0 + x, y0 - y); }
    return kh;
  }
  landing(S, dy, baseY, kh) {
    const top = baseY - kh + 50 + S * 10 + Math.max(0, dy) * 0.3, bot = Math.max(top + 20, baseY + dy);
    const LL = 380 + S * 80 + Math.max(0, dy) * 1.2;
    this.start(this.x, top);
    this.curve(LL, bot - top, (t) => 1 - (1 - t) * (1 - t));
  }
  t_jump(S = 2, dy = S * 40) {
    S = +S; dy = +dy;
    const baseY = this.y;
    const kh = this.kicker(S);
    const gw = 130 + S * 60;
    const x0 = this.x, y0 = this.y;
    this.end();
    this.pits.push({ x0, x1: x0 + gw, y: Math.max(y0, baseY + dy) + 420 });
    this.x = x0 + gw;
    this.landing(S, dy, baseY, kh);
    if (S >= 2) this.flipSpots += S >= 4 ? 2 : 1;
  }
  t_table(S = 2) {
    const kh = 40 + S * 22;
    const x0 = this.x, y0 = this.y, kl = 160 + S * 30, n = Math.ceil(kl / 14);
    for (let i = 1; i <= n; i++) { const t = i / n; this.pt(x0 + kl * t, y0 - kh * t * t); }
    this.pt(this.x + 6, this.y);
    this.flat(220 + S * 70);
    this.curve(300 + S * 40, kh, (t) => (1 - Math.cos(Math.PI * t)) / 2);
  }
  t_drop(H = 500) {
    H = +H;
    // tiny lip, then a cliff, then a long steep-to-flat landing slope
    this.curve(80, -10, (t) => t * t);
    const x0 = this.x, y0 = this.y;
    this.pt(x0 + 2, y0 + H * 0.3);
    this.curve(H * 1.7 + 200, H * 0.7, (t) => 1 - (1 - t) ** 2.2);
    this.flipSpots += H >= 600 ? 2 : 1;
  }
  t_loop(R = 160) {
    R = +R;
    this.curve(420, 160);
    this.t_conv(420, 520);
    this.flat(60);
    const cx = this.x + R + 40, cy = this.y - R;
    const loop = { cx, cy, R, phase: 0, x0: cx - R - 120, x1: cx + R + 120 };
    this.T.loops.push(loop);
    const N = 64;
    let px = cx + Math.cos(Math.PI / 2) * R, py = cy + Math.sin(Math.PI / 2) * R;
    for (let i = 1; i <= N; i++) {
      const th = Math.PI / 2 - (i / N) * Math.PI * 2;
      const x = cx + Math.cos(th) * R, y = cy + Math.sin(th) * R;
      const deg = 90 - (i - 0.5) / N * 360; // angle of this segment's midpoint
      const gate = deg > -60 ? { loop, phase: 0 } : deg < -120 ? { loop, phase: 1 } : null;
      this.T.addSeg(px, py, x, y, { kind: 'loop', gate, mu: 1 });
      px = x; py = y;
    }
    this.flat(2 * R + 200);
  }
  t_seesaw(L = 220) {
    L = +L;
    const th = 0.27;
    const x0 = this.x;
    this.flat(2 * L + 260);
    const cx = x0 + 130 + L, cy = this.y - Math.sin(th) * L - 4;
    this.objs.push({ type: 'seesaw', cx, cy, L, th0: -th, thMax: th, gy: this.y });
  }
  t_bridge(W = 500) {
    W = +W;
    const x0 = this.x, y0 = this.y;
    this.gap(W, 0, 520);
    const n = Math.max(3, Math.round(W / 52)), pw = W / n;
    for (let i = 0; i < n; i++) this.objs.push({ type: 'plank', x: x0 + i * pw, y: y0, pw, idx: i, n });
    this.objs.push({ type: 'ropes', x0, x1: x0 + W, y: y0 });
  }
  t_draw(W = 420) {
    W = Math.min(440, +W);
    this.flat(720);
    const x0 = this.x, y0 = this.y;
    this.gap(W, 0, 520);
    this.objs.push({ type: 'drawbridge', hx: x0 + W, hy: y0 + 7, L: W, period: 4.8, phase: this.rng() * 3.4 });
  }
  t_crates(n = 2) {
    n = +n;
    const x0 = this.x;
    this.flat(380 + n * 230);
    for (let i = 0; i < n; i++) this.objs.push({ type: 'crate', x: x0 + 300 + i * 230, gy: this.y, s: 54 });
  }
  t_tnt(n = 1) {
    n = +n;
    const baseY = this.y;
    this.kicker(1);
    this.curve(90, baseY - this.y, (t) => t);
    const x0 = this.x;
    this.flat(260 + n * 50);
    for (let i = 0; i < n; i++) this.objs.push({ type: 'tnt', x: x0 + 20 + i * 42, y: this.y });
  }
  t_chase() {
    const x0 = this.x, y0 = this.y;
    this.curve(1500, 420, (t) => t);
    this.curve(300, 40, (t) => 1 - (1 - t) ** 2);
    this.objs.push({ type: 'spawner', trig: x0 + 40, kind: 'chase', x: x0 - 520, y: y0 - 360, r: 58 });
  }
  t_rockfall() {
    const x0 = this.x;
    this.flat(1200);
    for (let i = 0; i < 3; i++) this.objs.push({ type: 'spawner', trig: x0 - 260 + i * 380, kind: 'drop', x: x0 + 450 + i * 380, y: this.y - 760, r: 34 + (i % 2) * 8 });
  }
  t_fan(W = 500) {
    W = +W;
    const x0 = this.x, y0 = this.y;
    this.flat(40);
    this.gap(W, 0, 600);
    const fan = { x0: x0 + 40, x1: x0 + 40 + W, top: y0 - 520, bot: y0 + 520, a: 2400 };
    this.fans.push(fan);
    this.objs.push({ type: 'fan', x: x0 + 40 + W / 2, y: y0 + 420, w: W, fan });
  }
  t_conv(L = 500, S = 400) {
    L = +L; S = +S;
    const prev = this.mode;
    this.mode = { kind: 'conv', conv: S };
    const x0 = this.x;
    this.flat(L);
    this.mode = prev;
    this.T.overlays.push({ kind: 'conv', x0, x1: x0 + L, y: this.y, speed: S });
  }
  t_ice(L = 600, H = 150) {
    L = +L; H = +H;
    const prev = this.mode;
    this.mode = { kind: 'ice', mu: 0.12 };
    const x0 = this.x, y0 = this.y;
    this.curve(L, H);
    this.mode = prev;
    this.T.overlays.push({ kind: 'ice', x0, x1: x0 + L, y0, y1: this.y });
  }
  t_lava(S = 2, W = 400) {
    S = +S; W = Math.min(+W, 120 + S * 65);
    const baseY = this.y;
    const kh = this.kicker(S);
    const x0 = this.x, y0 = this.y;
    this.end();
    // basin walls go down to the lava
    const lavaY = baseY + 90;
    this.T.lava.push({ x0: x0 - 4, x1: x0 + W + 4, y: lavaY });
    this.pits.push({ x0, x1: x0 + W, y: lavaY + 40 });
    this.x = x0 + W;
    this.landing(S, 30, baseY, kh);
    this.flipSpots += S >= 3 ? 1 : 0;
  }
  t_cp() { this.flat(140); this.cps.push({ x: this.x - 70, y: this.y }); this.flat(620); }
  t_arrow(kind) { this.T.decals.push({ x: this.x + 60, kind }); }
  t_hint(kind) { this.hints.push({ x: this.x, kind }); }
  t_fin() {
    this.flat(260);
    this.finishX = this.x;
    this.objs.push({ type: 'finish', x: this.x, y: this.y });
    this.flat(1400);
  }
}
Builder.prototype.t_hills = function (n, A, WL = 520) {
  n = +n; A = +A; WL = +WL;
  for (let i = 0; i < n; i++) {
    const x0 = this.x, y0 = this.y, k = Math.ceil(WL / 18);
    for (let j = 1; j <= k; j++) { const t = j / k; this.pt(x0 + WL * t, y0 - A * Math.sin(Math.PI * t) ** 2); }
  }
};

export const FLOW = {
  canyon: ['hills:2,45,520', 'rollers:3', 'table:2', 'dn:500,140', 'up:400,90 dn:500,150', 'jump:1,40', 'jump:2,60', 'hills:1,70,700'],
  junk: ['hills:2,45,520', 'rollers:4', 'table:2', 'conv:400,320', 'jump:2,60', 'dn:500,160', 'crates:1', 'seesaw:200'],
  glacier: ['ice:500,140', 'hills:2,50,540', 'table:2', 'jump:2,80', 'dn:600,180', 'rollers:3', 'ice:400,100 jump:2,60'],
  volcano: ['hills:2,55,520', 'table:3', 'jump:2,70', 'dn:500,160', 'rollers:4', 'up:400,100 dn:500,160', 'jump:3,100'],
  neon: ['conv:500,380 jump:3,80', 'rollers:4', 'table:3', 'hills:2,55,520', 'jump:3,100', 'dn:500,160', 'conv:400,400'],
};
export function buildLevel(i) { const L = LEVELS[i]; const b = new Builder(1000 + i); b.world = L.world; return b.build(L.src, FLOW[L.world], i % 8); }

// ------------------------------------------------------------------ daily
export const DAILY_EPOCH = Date.UTC(2026, 9, 1); // Daily #1 = 1 Oct 2026
export function dailyInfo(now = Date.now()) {
  const day = Math.floor((now - DAILY_EPOCH) / 86400000) + 1;
  return { day, key: new Date(DAILY_EPOCH + (day - 1) * 86400000).toISOString().slice(0, 10) };
}
const BAG = {
  canyon: ['jump:2,60', 'jump:3,100', 'drop:520', 'table:2', 'hills:2,50,540', 'bridge:520', 'chase', 'rollers:4'],
  junk: ['crates:2', 'tnt:2', 'seesaw:240', 'conv:500,400 jump:3,80', 'jump:3,80', 'drop:520'],
  glacier: ['ice:600,160', 'loop:160', 'fan:520', 'bridge:560', 'jump:3,120', 'drop:600'],
  volcano: ['lava:3,440', 'rockfall', 'draw:420', 'tnt:2', 'drop:600', 'jump:3,100'],
  neon: ['loop:170', 'conv:600,440 jump:4,140', 'fan:600', 'draw:460', 'seesaw:260', 'drop:700', 'jump:4,160'],
};
export function dailySource(day) {
  const r = rng(day * 7919 + 13);
  const world = WORLDS[day % 5];
  const bag = BAG[world].concat(r.pick(WORLDS.map((w) => BAG[w])));
  const toks = [];
  let n = 0;
  while (n < 15) {
    toks.push(r.pick(bag)); toks.push('f:' + (200 + Math.floor(r() * 3) * 50));
    n++;
    if (n % 4 === 0) toks.push('cp');
  }
  return { world, src: toks.join(' ') };
}
export function buildDaily(day) { const d = dailySource(day); const b = new Builder(day); b.world = d.world; const res = b.build(d.src); res.world = d.world; return res; }

// ------------------------------------------------------------------ endless (Freefall Mountain)
const ENDLESS_BAG = ['dn:500,160', 'jump:2,120', 'jump:3,180', 'drop:520', 'drop:700', 'hills:2,50,540', 'rollers:3', 'table:2', 'chase', 'ice:600,200', 'bridge:460', 'rockfall', 'tnt:1', 'crates:2', 'jump:4,240', 'dn:700,260'];
export class EndlessGen {
  constructor(seed) {
    this.b = new Builder(seed);
    this.r = rng(seed * 31 + 7);
    this.b.t_f(450);
    this.b.startX = -150;
    this.b.flat(200);
    this.b.t_dn(600, 200);
    this.n = 0;
  }
  // keep generating until the ground reaches x
  extend(x) {
    const b = this.b, r = this.r;
    let added = false;
    while (b.x < x) {
      const diff = Math.min(1, this.n / 30);
      const pool = ENDLESS_BAG.slice(0, 8 + Math.floor(diff * (ENDLESS_BAG.length - 8)));
      b.token(r.pick(pool));
      b.flat(150 + r() * 150);
      if (r.chance(0.5)) b.t_dn(400 + r() * 300, 100 + r() * 160);
      this.n++;
      added = true;
    }
    if (added) {
      // close the open piece so it collides, then reopen from its end
      const x1 = b.x, y1 = b.y;
      b.end();
      b.start(x1, y1);
    }
    return added;
  }
}
