// GRAPPLE GOBLIN - cave themes, the piece builder, the 20 hand-built caves and
// the endless "deep dive" chunk generator.
// World units: the cave is 720 tall. Floor top is FLOOR, falling below KILL_Y kills.
export const FLOOR = 620, KILL_Y = 690, MUSH_TOP = 628;
export const GUST = 1100;   // icy gust push, px/s^2 (on 1.25 s of every 3 s, 1 s warning)

export const THEMES = [
  { key: 'moss', name: 'Mossy Cave', ink: '#15201b', bg0: '#08191c', bg1: '#11302f', bg2: '#1c4a3f', rock: '#7d7c5c', rock2: '#3a3a30', rim: '#b0ad80', top: '#8cdb4c', top2: '#4a9a2a', glow: '#c8ff8a', mush: '#ff5468', mushSpot: '#fff4e0', gem: '#3df5a8', pit: 'spikes', anchor: 'ring', pitCol: '#0b1512' },
  { key: 'crystal', name: 'Crystal Cavern', ink: '#150c27', bg0: '#0e0726', bg1: '#1c1244', bg2: '#2f1d68', rock: '#6a58a8', rock2: '#2a2052', rim: '#a896e6', top: '#8af6ff', top2: '#3aaee0', glow: '#d79cff', mush: '#4ff0ff', mushSpot: '#e8fdff', gem: '#ff5cd6', pit: 'shards', anchor: 'crystal', pitCol: '#0c0620' },
  { key: 'lava', name: 'Lava Mine', ink: '#1d0b07', bg0: '#170604', bg1: '#33100a', bg2: '#4d1b0f', rock: '#8c5843', rock2: '#3a1f17', rim: '#e09468', top: '#4a332b', top2: '#ff8a2a', glow: '#ff9a3a', mush: '#ffae2e', mushSpot: '#fff0c8', gem: '#ff3b5c', pit: 'lava', anchor: 'beam', pitCol: '#2a0703' },
  { key: 'ice', name: 'Frozen Grotto', ink: '#0b1726', bg0: '#06162a', bg1: '#0e2c4a', bg2: '#19486c', rock: '#8cb2cf', rock2: '#46698a', rim: '#dff1fc', top: '#f4fbff', top2: '#b6dcf2', glow: '#a8f2ff', mush: '#7a8cff', mushSpot: '#eef1ff', gem: '#7fe0ff', pit: 'water', anchor: 'icicle', pitCol: '#04101e' },
];

export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const has = (list, i) => list === 'all' || (Array.isArray(list) && list.includes(i));
const rad = (d) => (d * Math.PI) / 180;

export class Builder {
  constructor(seed, theme) {
    this.r = rng(seed);
    this.x = 0;
    this.cx = -1400;     // ceiling filled up to here
    this.theme = theme;
    this.nid = 0;
    this.L = { solids: [], anchors: [], coins: [], gems: [], big: null, spikes: [], bats: [], winds: [], carts: [], flags: [], pits: [], fg: [], hints: [], chest: null, ceil: [], zones: [{ x: -1e9, theme }], spawn: { x: 110, y: FLOOR - 15 }, end: 0 };
    this.L.solids.push({ x: -2400, y: -900, w: 2000, h: 2600, kind: 'wall' });
  }
  setTheme(t) { if (t !== this.theme) { this.theme = t; this.L.zones.push({ x: this.x, theme: t }); } }
  get T() { return THEMES[this.theme]; }
  floor(x, w, kind) { this.L.solids.push({ x, y: FLOOR, w, h: 900, kind: kind || (this.theme === 3 ? 'ice' : 'rock') }); }
  pit(x0, x1) { this.L.pits.push({ x0, x1, theme: this.theme }); }
  anchor(x, y, o = {}) {
    const a = { id: this.nid++, x, y, bx: x, by: y, type: o.type || this.T.anchor, crumble: !!o.crumble, move: o.move || null, long: !!o.long, state: 'ok', crack: 0, breakT: 0, theme: this.theme };
    this.L.anchors.push(a);
    return a;
  }
  coin(x, y) { this.L.coins.push({ x, y, got: false, ph: this.r() * 6 }); }
  coinArc(ax, ay, R, d0, d1, n) { for (let i = 0; i < n; i++) { const a = rad(d0 + ((d1 - d0) * i) / Math.max(1, n - 1)); this.coin(ax + R * Math.sin(a), ay + R * Math.cos(a)); } }
  coinRow(x, y, n, dx) { for (let i = 0; i < n; i++) this.coin(x + i * dx, y); }
  apex(mx, y) { this.coin(mx - 58, y + 26); this.coin(mx, y); this.coin(mx + 58, y + 26); }
  gem(x, y) { this.L.gems.push({ x, y, got: false, theme: this.theme }); }
  bigGem(x, y, low) {
    this.L.big = { x, y, got: false };
    this.L.fg.push({ x, y, low, theme: this.theme, seed: Math.floor(this.r() * 1000) });
  }
  spike(x, y, w, dir) { this.L.spikes.push({ x, y, w, h: 24, dir, theme: this.theme }); }
  bat(x0, x1, y, period, phase) { this.L.bats.push({ x0, x1, y0: y, x: x0, y, period, phase, dir: 1 }); }
  wind(x, y, w, h, fx, fy, period = 0, on = 1, phase = 0) { this.L.winds.push({ x, y, w, h, fx, fy, period, on, phase, theme: this.theme }); }
  cart(x0, x1) { this.L.carts.push({ x0, x1, x: x0 + 90, v: 0, state: 'idle', theme: this.theme }); }
  flag(x) { this.L.flags.push({ x, on: false, t: 0 }); }
  hint(x, y, text) { this.L.hints.push({ x, y, text }); }
  // ceiling heightfield: points every ~110 units, y = bottom of the rock
  ceilTo(x1, y) {
    while (this.cx < x1) {
      const yy = y != null ? y : 48 + this.r() * 44;
      this.L.ceil.push({ x: this.cx, y: yy, theme: this.theme, s: this.r() });
      this.cx += y != null ? 70 : 90 + this.r() * 60;
    }
  }
  ceilY(x) {
    const c = this.L.ceil;
    for (let i = c.length - 1; i >= 0; i--) if (c[i].x <= x) return c[i].y;
    return 60;
  }
}

// ---------------------------------------------------------------- pieces
// Every piece starts at b.x and moves b.x on by its width.
function ysFor(o, n) {
  const y0 = o.y || 250;
  if (o.ys) return o.ys;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (o.pat === 'wave') out.push(y0 + (i % 2 ? 60 : -30));
    else if (o.pat === 'up') out.push(y0 + 60 - i * 40);
    else if (o.pat === 'down') out.push(y0 - 40 + i * 40);
    else out.push(y0);
  }
  return out;
}
function bigInGap(b, o, gx, gy) {
  if (o.big === 'low') b.bigGem(gx, 590, true);
  else if (o.big === 'high') { b.ceilTo(gx - 80); b.ceilTo(gx + 80, 22); b.bigGem(gx, 112, false); }
}

export const P = {
  start(b, o) {
    const w = o.w || 560;
    b.floor(-400, b.x + w + 400);
    b.L.spawn = { x: b.x + 110, y: FLOOR - 15 };
    b.coinRow(b.x + 260, FLOOR - 46, 4, 60);
    b.x += w;
  },
  ledge(b, o) {
    const w = o.w || 380;
    b.floor(b.x, w);
    if (o.coins !== false) b.coinRow(b.x + 70, FLOOR - 46, Math.max(2, Math.floor((w - 110) / 60)), 60);
    b.x += w;
  },
  cp(b, o) {
    const w = o.w || 440;
    b.floor(b.x, w);
    b.flag(b.x + 130);
    b.coinRow(b.x + 220, FLOOR - 46, 3, 60);
    b.x += w;
  },
  end(b) {
    const w = 760;
    b.floor(b.x, w);
    b.L.chest = { x: b.x + 420, y: FLOOR, open: false, t: 0 };
    b.coinRow(b.x + 120, FLOOR - 46, 4, 55);
    b.L.solids.push({ x: b.x + w, y: -900, w: 2000, h: 2600, kind: 'wall' });
    b.x += w;
    b.L.end = b.x;
  },
  // a pit with a line of anchors
  rings(b, o) {
    const n = o.n || 3, sp = o.sp || 330, lead = o.lead || 190, tail = o.tail || 210;
    const ys = ysFor(o, n), x0 = b.x, w = lead + (n - 1) * sp + tail;
    if (o.floorSpikes) { b.floor(x0, w); b.spike(x0 + 40, FLOOR - 24, w - 80, 'up'); } else b.pit(x0, x0 + w);
    if (o.low) { b.ceilTo(x0 + 40); b.ceilTo(x0 + w - 40, 172); b.spike(x0 + 60, 172, w - 120, 'down'); }
    for (let i = 0; i < n; i++) {
      const ax = x0 + lead + i * sp, ay = ys[i];
      let move = null;
      if (has(o.move, i)) move = o.vert ? { dx: 0, dy: 62, period: 2.6 + (i % 2) * 0.5, phase: i * 2.1 } : { dx: 105, dy: 0, period: 3.1 + (i % 2) * 0.4, phase: i * 1.7 };
      b.anchor(ax, ay, { crumble: has(o.crumble, i), move });
      if (i % 2 === 0 || o.arcs) b.coinArc(ax, ay, o.low ? 215 : 255, -36, 36, 5);
      else b.apex(ax - sp / 2, Math.min(ay, ys[i - 1]) + 95);
      if (i < n - 1) {
        const mx = ax + sp / 2;
        if (has(o.bats, i)) b.bat(ax + 70, ax + sp - 70, b.L.bats.length === 0 ? 548 : Math.min(ay, ys[i + 1]) + 112, 2.6 + (i % 3) * 0.4, i * 1.3);
        if (o.gem === i) { if (o.low) b.gem(mx, 560); else if (i % 2) b.gem(mx, Math.max(b.ceilY(mx) + 52, 150)); else b.gem(mx, 575); }
        if (o.bigAt === i || (o.big && o.bigAt == null && i === Math.floor((n - 1) / 2))) bigInGap(b, o, mx, ay);
      }
    }
    if (o.gusts) b.wind(x0 + lead - 60, 90, w - lead - tail + 120, 620, -GUST, -80, 3.0, 1.25, x0 * 0.001);
    if (o.hint) { b.hint(x0 - 110, 380, 'HOLD to hook'); b.hint(x0 + lead + 150, 150, 'LET GO to fling!'); }
    b.x += w;
  },
  floorSpikes(b, o) { P.rings(b, { ...o, floorSpikes: true }); },
  ceilSpikes(b, o) { P.rings(b, { sp: 300, ...o, low: true, y: 252 }); },
  rail(b, o) { P.rings(b, { sp: 360, ...o, move: 'all', arcs: false }); },
  gust(b, o) { P.rings(b, { sp: 320, ...o, gusts: true }); },
  // one high anchor over a wide gap: needs a big swing
  big(b, o) {
    const x0 = b.x, w = 940;
    b.pit(x0, x0 + w);
    b.anchor(x0 + 180, 250);
    b.coinArc(x0 + 180, 250, 255, -36, 36, 5);
    b.ceilTo(x0 + 400); b.ceilTo(x0 + 680, 30); b.ceilTo(x0 + w);
    b.anchor(x0 + 540, 128, { long: true });
    b.coinArc(x0 + 540, 128, 360, -52, 52, 9);
    if (o.gem) b.gem(x0 + 540, 548);
    if (o.big) b.bigGem(x0 + 860, 140, false);
    b.x += w;
  },
  // a rock pillar in the pit: fling over it
  pillar(b, o) {
    const x0 = b.x, w = 820;
    b.pit(x0, x0 + w);
    b.anchor(x0 + 190, 240);
    b.anchor(x0 + 690, 240);
    b.L.solids.push({ x: x0 + 405, y: 430, w: 90, h: 900, kind: b.theme === 3 ? 'ice' : 'rock' });
    if (o.spiky) b.spike(x0 + 407, 406, 86, 'up');
    b.coinArc(x0 + 450, 640, 300, 150, 210, 5);
    if (o.gem) b.gem(x0 + 450, o.spiky ? 330 : 360);
    b.x += w;
  },
  // bouncy mushrooms rising out of the pit; they hop you along
  mush(b, o) {
    const n = o.n || 3, sp = 274, x0 = b.x, lead = 75, w = lead + (n - 1) * sp + 200;
    b.pit(x0, x0 + w);
    for (let i = 0; i < n; i++) {
      const mx = x0 + lead + i * sp;
      b.L.solids.push({ x: mx - 58, y: MUSH_TOP, w: 116, h: 900, kind: 'mush', sq: 0, theme: b.theme });
      if (i < n - 1) b.apex(mx + sp / 2, 344);
      if (i % 2 === 1) b.anchor(mx, 230);
    }
    b.anchor(x0 + w - 70, 250);
    if (o.gem != null) b.gem(x0 + lead + o.gem * sp - sp / 2, 190);
    if (o.big) bigInGap(b, { big: 'high' }, x0 + lead + sp * 1.5, 230);
    b.x += w;
  },
  // an updraft column lifts you over a long gap
  wind(b, o) {
    const x0 = b.x, w = 840;
    b.pit(x0, x0 + w);
    b.anchor(x0 + 180, 250);
    b.wind(x0 + 330, 128, 210, 620, 0, -3700);
    b.anchor(x0 + 690, 250);
    for (let i = 0; i < 5; i++) b.coin(x0 + 435, 520 - i * 70);
    if (o.spiky) { b.ceilTo(x0 + 300); b.ceilTo(x0 + 560, 62); b.spike(x0 + 330, 62, 210, 'down'); }
    if (o.gem) b.gem(x0 + 435, 116);
    if (o.big) b.bigGem(x0 + 560, 600, true);
    b.x += w;
  },
  // a mine-cart track: land on it, the cart scoops you up and launches you off the bumper
  cart(b, o) {
    const x0 = b.x, len = o.len || 1100;
    b.floor(x0, len, 'track');
    b.cart(x0, x0 + len);
    b.coinRow(x0 + 300, FLOOR - 92, Math.floor((len - 420) / 70), 70);
    for (let i = 1; i <= 5; i++) { const t = i * 0.11; b.coin(x0 + len + 960 * t, FLOOR - 46 - 900 * t + 950 * t * t); }
    b.x += len;
    P.rings(b, { n: 3, lead: 340, ...(o.after || {}) });
  },
};

// ---------------------------------------------------------------- the 20 caves
// Each cave is a line of pieces separated by '|'. Piece options:
//   n4 = anchors, wave/up/down = heights, gem2 = small gem in gap 2 (gem = yes for single pieces),
//   low/high = the hidden big gem (bigAt2 picks the gap), crumble1,3 / crumbleall, bats0,2, vert, spiky,
//   lead320, w300, hint. In a cart piece, options after '>' are for the anchors that follow the bumper.
function parse(spec) {
  return spec.split('|').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [head, tail] = s.split('>');
    const toks = head.trim().split(/\s+/), name = toks.shift();
    const opts = (list) => {
      const o = {};
      for (const k of list) {
        let m;
        if (k === 'wave' || k === 'up' || k === 'down') o.pat = k;
        else if (k === 'low' || k === 'high') o.big = k;
        else if (k === 'gem') o.gem = true;
        else if (k === 'vert' || k === 'spiky' || k === 'hint' || k === 'gusts') o[k] = true;
        else if ((m = k.match(/^(crumble|bats|move)(all|[\d,]+)$/))) o[m[1]] = m[2] === 'all' ? 'all' : m[2].split(',').map(Number);
        else if ((m = k.match(/^([a-zA-Z]+)(\d+)$/))) o[m[1]] = +m[2];
      }
      return o;
    };
    const o = opts(toks);
    if (tail) o.after = opts(tail.trim().split(/\s+/));
    return [name, o];
  });
}
const L = (name, theme, spec) => ({ name, theme, pieces: parse(spec) });
export const LEVELS = [
  // Mossy Cave: swing, fling, crumbling anchors, spikes, bats, mushrooms
  L('First Swing', 0, 'start | rings n2 y262 hint | ledge w320 | rings n3 | ledge w300 | rings n3 wave gem1 | cp | rings n4 | ledge | rings n3 up | rings n4 wave low bigAt1 gem2 | ledge w300 | rings n5 | end'),
  L('Moss Steps', 0, 'start | rings n3 up | floorSpikes n3 gem1 | ledge w300 | rings n4 wave | cp | floorSpikes n4 | rings n3 down | big | cp | rings n4 wave gem2 | floorSpikes n3 | rings n3 down high | ledge w300 | rings n5 wave | end'),
  L('Crumble Hollow', 0, 'start | rings n3 | rings n3 crumble1 lead230 | ledge w300 | rings n4 crumbleall gem2 | cp | floorSpikes n3 | rings n4 crumble0,2 wave | big gem | cp | rings n3 crumble1 | floorSpikes n4 crumble2 | cp | rings n5 crumble1,3 wave low | end'),
  L('Bat Burrow', 0, 'start | rings n3 | rings n4 bats1 lead230 | ledge w300 | rings n3 crumble1 | cp | pillar gem | rings n4 bats0,2 gem1 | floorSpikes n3 bats1 | cp | rings n3 crumble1 up | pillar | cp | rings n5 bats1,3 wave high bigAt2 y230 | end'),
  L('Mushroom Grove', 0, 'start | mush n3 | ledge w300 | rings n3 | mush n4 gem2 | cp | rings n3 bats1 | mush n3 | ledge w260 | pillar | cp | rings n4 wave | mush n4 | ledge w260 | rings n4 crumble2 low | end'),
  // Crystal Cavern: moving anchors on rails, ceiling spikes, updrafts
  L('Shimmer Rails', 1, 'start | rings n3 | rail n2 | ledge w300 | rings n3 wave | rail n3 gem1 | cp | rings n4 up | rail n3 vert | cp | big gem | rail n4 | ledge w300 | rail n3 vert high | end'),
  L('Spiky Ceiling', 1, 'start | ceilSpikes n3 | rings n3 | ledge w300 | ceilSpikes n4 gem2 | cp | rail n2 | ceilSpikes n3 crumble1 | rings n4 wave | cp | ceilSpikes n4 crumble1,3 low sp370 | rail n3 | end'),
  L('Updraft', 1, 'start | rings n2 | wind | rings n3 | cp | rings n3 crumble1 | wind spiky gem | rail n2 | cp | mush n3 | ledge w260 | wind low | rings n3 wave | cp | ceilSpikes n3 | wind spiky | rings n4 | end'),
  L('Prism Maze', 1, 'start | rail n3 | ceilSpikes n3 gem1 | cp | rings n4 bats1,2 | pillar spiky gem | cp | rail n3 vert | wind | cp | ceilSpikes n4 bats1 | rail n3 | cp | rings n5 crumbleall high y230 | end'),
  L('Crystal Heart', 1, 'start | rings n4 wave | rail n3 gem1 | cp | ceilSpikes n4 | wind spiky | cp | pillar | rail n4 crumble1 | cp | big | mush n3 | ledge w260 | rail n3 vert bats0 | cp | rings n5 bats0,2,3 low bigAt1 | end'),
  // Lava Mine: lava pits, mine beams, carts
  L('Hot Feet', 2, 'start | rings n3 | rings n4 wave gem1 lead230 | ledge w300 | rings n4 up | cp | big gem | rings n4 crumble1,2 | floorSpikes n3 | cp | rings n4 bats1 | rings n3 down | cp | rings n5 up high bigAt3 | end'),
  L('Mine Cart', 2, 'start | rings n2 | cart | cp | cart > crumble1 gem1 | ledge w300 | rings n3 wave | cp | cart > bats1 | rings n3 | cp | rings n3 wave | cart len1300 > high y230 | end'),
  L('Ember Bats', 2, 'start | rings n4 bats1 | cp | cart > n4 bats0,2 gem1 | cp | pillar spiky | rings n4 bats1 crumble2 | cp | floorSpikes n4 bats0,2 | ceilSpikes n3 | cp | rings n5 bats1,3 crumble2 low bigAt0 | end'),
  L('Rail Furnace', 2, 'start | rail n3 | cart > moveall | cp | ceilSpikes n4 gem2 | mush n3 | ledge w260 | cp | rail n4 vert crumble1 | big | cp | rail n3 bats1 high y230 | wind | rings n4 | end'),
  L('Magma Core', 2, 'start | rings n4 crumble1,3 | cart > bats1 | cp | ceilSpikes n4 crumble2 | pillar spiky gem | cp | rail n4 | wind | cp | mush n3 | ledge w260 | rail n3 vert crumble1 | cp | rings n5 bats0,2 crumble1,3 high bigAt3 | end'),
  // Frozen Grotto: gusts, ice, everything at once
  L('Chilly Swing', 3, 'start | rings n3 | ledge | rings n4 crumble1 gem2 | cp | gust n3 | ledge | rings n4 up | cp | gust n4 crumble2 | mush n3 | ledge w260 | rings n4 wave low | end'),
  L('Gusty Gap', 3, 'start | gust n3 | cp | wind | gust n4 gem2 | cp | big gem | gust n3 bats1 | cp | rail n3 | gust n4 crumble2 high bigAt1 y230 | end'),
  L('Icicle Run', 3, 'start | rings n4 crumbleall | cp | ceilSpikes n4 crumble1,3 gem0 | mush n3 | ledge w260 | cp | rail n3 | rings n4 crumbleall wave | cp | ceilSpikes n3 bats1 | rings n5 crumbleall low | end'),
  L('Blizzard', 3, 'start | gust n4 bats1 | cp | cart > gusts gem1 | cp | pillar spiky | wind spiky | cp | rail n4 vert | gust n3 crumble1 | cp | ceilSpikes n4 bats2 | gust n4 crumble1,3 high bigAt2 | end'),
  L("Goblin King's Hoard", 3, 'start | rings n4 wave | rail n3 | cp | ceilSpikes n4 crumble2 | cart > bats1 | cp | mush n3 | ledge w260 | wind spiky gem | pillar spiky | cp | gust n4 crumble1 | big | cp | rail n4 vert bats1 | floorSpikes n4 crumble1,3 | cp | rings n6 bats1,3 crumble2,4 low bigAt2 | end'),
];

export function buildLevel(n) {
  const def = LEVELS[n - 1];
  const b = new Builder(n * 977 + 13, def.theme);
  for (const [name, o] of def.pieces) { P[name](b, o || {}); b.ceilTo(b.x); }
  b.ceilTo(b.x + 2400);
  const L2 = b.L;
  L2.name = def.name; L2.n = n; L2.theme = def.theme;
  finish(L2);
  return L2;
}
function finish(L2) {
  for (const s of L2.solids) if (s.theme == null) { let th = 0; for (const z of L2.zones) if (z.x <= s.x + 1) th = z.theme; s.theme = th; }
  L2.coins.sort((a, b) => a.x - b.x);
  L2.totalCoins = L2.coins.length;
}

// ---------------------------------------------------------------- deep dive
export function buildEndless(seed) {
  const b = new Builder(seed, 0);
  b.chunks = 0;
  P.start(b, { w: 600 });
  b.ceilTo(b.x);
  b.L.name = 'Deep Dive'; b.L.n = 0; b.L.theme = 0; b.L.end = 1e9;
  extendEndless(b); extendEndless(b); extendEndless(b);
  return b;
}
export function extendEndless(b) {
  const k = b.chunks++, r = b.r, d = Math.min(1, k / 28);
  if (k > 0 && k % 7 === 0) { b.setTheme((b.theme + 1) % 4); }
  const pick = (opts) => opts[Math.floor(r() * opts.length)];
  const coinFlip = (p) => r() < p;
  const ring = () => {
    const n = 3 + Math.floor(r() * (2 + d * 2));
    const o = { n, pat: pick(['flat', 'wave', 'up', 'down', 'wave']), sp: 310 + Math.floor(r() * (40 + d * 50)) };
    if (coinFlip(0.15 + d * 0.5)) o.crumble = [1 + Math.floor(r() * (n - 1))];
    if (coinFlip(d * 0.6)) o.bats = [Math.floor(r() * (n - 1))];
    if (coinFlip(0.3)) o.gem = Math.floor(r() * (n - 1));
    return o;
  };
  let kind;
  if (k % 5 === 4) kind = 'ledge';
  else {
    const pool = ['rings', 'rings', 'floorSpikes'];
    if (d > 0.05) pool.push('big', 'mush');
    if (d > 0.12) pool.push('rail', 'cart');
    if (d > 0.2) pool.push('ceilSpikes', 'wind');
    if (d > 0.3) pool.push('pillar', 'gust');
    if (d > 0.5) pool.push('rail', 'ceilSpikes', 'gust');
    kind = pick(pool);
  }
  const o = kind === 'ledge' ? { w: 300 } : kind === 'mush' ? { n: 3, anchors: coinFlip(0.6) } : kind === 'big' || kind === 'pillar' || kind === 'wind' ? { spiky: coinFlip(d), gem: coinFlip(0.4) } : kind === 'cart' ? { after: ring() } : ring();
  if (kind === 'rail' && coinFlip(0.4)) o.vert = true;
  if (kind === 'mush') { P.mush(b, o); b.ceilTo(b.x); P.ledge(b, { w: 260 }); }
  else P[kind](b, o);
  b.ceilTo(b.x + 200);
  finish(b.L);
}
