// Stage data and the chart builder. A chart is the beat grid (times of every
// beat, with the tempo ramping up through the round) plus every attack, each
// already knowing when it spawns, releases and lands. Everything is seeded, so
// a stage plays the same every time and can be learned like a song.

export const LANES = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
export const LANE_NAMES = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

// beats from release to impact (projectiles) or from leaving the edge to striking (runners)
export const LEAD = { arrow: 1.5, axe: 2, fire: 2.5, sword: 2, feint: 2, double: 1.5, boulder: 4, bomb: 2.5 };
export const ATTACKER = { arrow: 'archer', axe: 'axeman', fire: 'mage', sword: 'swords', feint: 'rogue', double: 'ninja', boulder: 'ogre', bomb: 'bomber' };
export const RANGED = { arrow: 1, axe: 1, fire: 1, double: 1, boulder: 1, bomb: 1 };

export const INFO = {
  arrow: ['Archers', 'Arrows fly fast. Block the lane the ring closes on, right on the beat.'],
  sword: ['Swordsmen', 'They run in and swing on the beat. A perfect parry cuts them down.'],
  axe: ['Axe throwers', 'Spinning axes. Same as arrows, a touch slower.'],
  fire: ['Fire mages', 'Fireballs are slow and big. Perfect them and they go home.'],
  feint: ['Feints', 'Purple rogues fake a swing (dashed ring), then strike ONE beat later. Wait for it.'],
  double: ['Ninjas', 'Two daggers half a beat apart in the same lane. Tap-tap.'],
  boulder: ['Boulders', 'Purple ring = HOLD. Block on the beat and keep holding until the bar fills.'],
  bomb: ['Bombs', 'Red ring with an X: do NOT block. Let it sail over you.'],
};

export const STAGES = [
  { name: 'Forest Road', sub: 'Bandits on the old road', bg: 'forest', bpm: [100, 112], dens: [0.42, 0.7], half: 0, chord: 0,
    w: { arrow: 3, sword: 2 }, intro: ['arrow', 'sword'],
    boss: { name: 'Bandit Brute', look: 'brute', throw: 'axe', song: [
      's0 - - - s1 - - -', 's2 - - - s3 - - -', 's0 - s0 - s0 - - -', 't1 - - - - - t1 -',
      's3 - - - s1 - - -', 's2 - s2 - s0 - - -'] } },
  { name: 'Castle Gate', sub: 'The gate guard wakes at dusk', bg: 'castle', bpm: [104, 118], dens: [0.4, 0.68], half: 0.12, chord: 0,
    w: { arrow: 3, sword: 2, axe: 2 }, intro: ['axe'],
    boss: { name: 'Iron Knight', look: 'knight', throw: 'axe', song: [
      's3 - - - s1 - - -', 's0 - s0 - - - s2 -', 't1 - - - t1 - - -', 's2 - s2 - s0 - s0 -',
      't3 - - - s3 - - -', 's1 - s1 s1 - - s0 -'] } },
  { name: 'Desert Road', sub: 'Sand, sun and sorcerers', bg: 'desert', bpm: [108, 122], dens: [0.42, 0.72], half: 0.18, chord: 0,
    w: { arrow: 2, sword: 2, axe: 1, fire: 3, feint: 1.4 }, intro: ['fire', 'feint'],
    boss: { name: 'Dune Ogre', look: 'ogreboss', throw: 'fire', song: [
      't0 - - - - - - -', 's2 - - - f1 - - -', 't3 - - - t3 - - -', 's1 - s1 - f2 - - -',
      't0 - - - s2 - s2 -', 'f3 - - - s1 - - -'] } },
  { name: 'Night Dojo', sub: 'Silent feet on the tatami', bg: 'dojo', bpm: [112, 126], dens: [0.46, 0.76], half: 0.3, chord: 0,
    w: { arrow: 1.5, sword: 2, feint: 2.2, double: 1.4, axe: 1 }, intro: ['double'],
    boss: { name: 'Shadow Sensei', look: 'sensei', throw: 'double', song: [
      's1 - s1 - f3 - - -', 's0 s0 - - s2 s2 - -', 't3 - - - f0 - - -', 's1 - s3 - s1 - - -',
      'f2 - - - s2 s2 - -', 't0 - - - s0 - s0 -'] } },
  { name: 'Frozen Pass', sub: 'Giants roll the mountain at you', bg: 'frozen', bpm: [112, 128], dens: [0.46, 0.76], half: 0.28, chord: 0,
    w: { arrow: 2, sword: 2, axe: 2, fire: 1, double: 1, feint: 1, boulder: 1.3 }, intro: ['boulder'],
    boss: { name: 'Frost Giant', look: 'giant', throw: 'boulder', song: [
      't0 - - - - - - -', 's2 - - - s2 - - -', 'h1 - - - - - - -', 's3 - s3 - s0 - - -',
      't2 - - - - - - -', 'h0 - - - - - s1 -'] } },
  { name: 'Pirate Docks', sub: 'Powder kegs and cutlasses', bg: 'docks', bpm: [116, 132], dens: [0.48, 0.8], half: 0.32, chord: 0,
    w: { arrow: 1, sword: 2, axe: 2, fire: 1, double: 1.5, feint: 1, boulder: 0.6, bomb: 1.6 }, intro: ['bomb'],
    boss: { name: 'Captain Powder', look: 'captain', throw: 'bomb', song: [
      's0 - - - b1 - - -', 's2 - s2 - b3 - - -', 's1 - - - s3 - - -', 'b0 - - - s0 - s0 -',
      's2 - b1 - s3 - - -', 'b2 - - - s1 - s1 -'] } },
  { name: 'Volcano', sub: 'The mountain is awake', bg: 'volcano', bpm: [120, 138], dens: [0.52, 0.86], half: 0.38, chord: 0.06,
    w: { arrow: 2, sword: 2, axe: 1.5, fire: 2.5, double: 1.5, feint: 1.2, boulder: 0.8, bomb: 1.2 }, intro: [],
    boss: { name: 'Magma Ogre', look: 'magma', throw: 'fire', song: [
      't0 - t0 - - - s2 -', 'h1 - - - - - - -', 's3 - s3 - t1 - - -', 'f0 - - - s2 s2 - -',
      't3 - - - b1 - - -', 'h2 - - - - - s0 -'] } },
  { name: 'Storm Citadel', sub: 'The Black King waits', bg: 'citadel', bpm: [124, 142], dens: [0.56, 0.92], half: 0.42, chord: 0.1,
    w: { arrow: 2, sword: 2, axe: 1.5, fire: 2, double: 1.5, feint: 1.4, boulder: 0.8, bomb: 1.3 }, intro: [],
    boss: { name: 'The Black King', look: 'king', throw: 'fire', song: [
      's0 - s1 - s2 - s3 -', 'f0 - - - t2 - - -', 'b1 - - - s3 s3 - -', 'h0 - - - - - - -',
      's2 - s1 - f0 - - -', 't3 - t3 - b1 - - -', 's1 s1 - - s3 s3 - -', 'h2 - - - - - - -'] } },
];

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

export function beatT(ch, b) {
  const B = ch.beats, i = Math.floor(b);
  if (i < 0) return B[0] + b * (B[1] - B[0]);
  if (i >= B.length - 1) { const n = B.length - 1, d = B[n] - B[n - 1]; return B[n] + (b - n) * d; }
  return B[i] + (b - i) * (B[i + 1] - B[i]);
}
export function beatAt(ch, t) { // inverse of beatT
  const B = ch.beats; let lo = 0, hi = B.length - 1;
  if (t <= B[0]) return (t - B[0]) / (B[1] - B[0]);
  if (t >= B[hi]) return hi + (t - B[hi]) / (B[hi] - B[hi - 1]);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m] <= t) lo = m; else hi = m; }
  return lo + (t - B[lo]) / (B[lo + 1] - B[lo]);
}

function pick(rng, w) {
  let s = 0; for (const k in w) s += w[k];
  let r = rng() * s;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}

// ---- attack factory -------------------------------------------------------
function addAttack(ch, type, lane, b, opt = {}) {
  const bl = (x) => beatT(ch, x);
  const beat = bl(b + 1) - bl(b);
  const a = { id: ch.nextId++, type, lane, hitB: b, hitT: bl(b), res: null, boss: !!opt.boss, final: !!opt.final };
  a.proj = RANGED[type] ? (type === 'double' ? 'dagger' : type) : null;
  const lead = opt.lead ?? LEAD[type];
  if (type === 'feint') { a.fakeB = b - 1; a.fakeT = bl(b - 1); }
  if (type === 'boulder' || opt.hold) { a.hold = true; a.holdEndT = bl(b + 1); }
  if (a.proj) { a.relT = bl(b - lead); }
  else { a.arriveT = bl((a.fakeB ?? b) - 0.5); a.runT = bl((a.fakeB ?? b) - lead); }
  a.ringT = bl(b - 2); // when the timing ring appears
  if (opt.att) { a.att = opt.att; }
  else {
    const kind = ATTACKER[type];
    const spawnT = a.proj ? a.relT - beat * 0.9 : a.runT;
    const goneT = a.hitT + beat * (a.hold ? 2.2 : 1.4);
    // pick a free slot sideways along the lane so attackers don't stack on each other
    const busy = ch.slots[lane].filter((s) => s.goneT > spawnT).map((s) => s.slot);
    const order = [0, -1, 1, -2, 2, -3, 3];
    const slot = order.find((s) => !busy.includes(s)) ?? 0;
    ch.slots[lane].push({ goneT, slot });
    a.att = { kind, lane, slot, spawnT, goneT, dead: false, ranged: !!a.proj, attacks: [] };
    ch.atts.push(a.att);
  }
  a.att.attacks.push(a);
  ch.attacks.push(a);
  return a;
}

// ---- wave bar generator (shared by stages and endless) ---------------------
function genWaveBar(ch, bar, P, rng) {
  const st = ch.gen;
  for (let h = 0; h < 8; h++) {
    const off = h / 2, b = bar * 4 + off, on = h % 2 === 0;
    let p = on ? P.dens * (h === 0 ? 1.25 : h === 4 ? 1.1 : 0.85) : P.dens * P.half * 1.2;
    if (rng() >= p) continue;
    const gap = b - st.lastB;
    if (gap < (P.half > 0 ? 0.5 : 1) || b < st.freeB) continue;
    // type, with the constraints each one needs to stay fair
    const w = { ...P.w };
    if (gap < 1.5) { delete w.boulder; delete w.feint; }
    if (gap < 1) delete w.bomb;
    if (!(P.half > 0) || h === 7) delete w.double;
    if (st.lastType === 'bomb') delete w.bomb;
    if (!Object.keys(w).length) continue;
    const type = pick(rng, w);
    // lane: usually a new one; never the same lane twice inside a beat
    let lane = st.lastLane;
    if (lane < 0 || gap < 1 || rng() < 0.7) {
      const opts = [0, 1, 2, 3].filter((l) => l !== st.lastLane && b - st.laneB[l] >= 1);
      lane = opts.length ? opts[Math.floor(rng() * opts.length)] : (st.lastLane + 1) % 4;
    }
    if (type === 'feint' && b - st.laneB[lane] < 2) continue;
    const a = addAttack(ch, type, lane, b);
    st.lastB = b; st.lastLane = lane; st.lastType = type; st.laneB[lane] = b;
    if (type === 'double') { addAttack(ch, 'double', lane, b + 0.5, { att: a.att }); st.lastB = b + 0.5; st.laneB[lane] = b + 0.5; h++; }
    if (type === 'boulder') st.freeB = b + 2;
    if (type === 'feint') st.freeB = Math.max(st.freeB, b + 0.5);
    // chords: a second, simple attack on the opposite lane on the same beat
    if (P.chord && on && rng() < P.chord && (type === 'arrow' || type === 'axe' || type === 'sword')) {
      const l2 = (lane + 2) % 4;
      if (b - st.laneB[l2] >= 1) { addAttack(ch, 'arrow', l2, b); st.laneB[l2] = b; }
    }
  }
}

function newChart(seed) {
  return { beats: [], attacks: [], atts: [], slots: [[], [], [], []], nextId: 1, phase: [], inten: [], rng: mulberry(seed),
    gen: { lastB: -10, lastLane: -1, lastType: '', freeB: 0, laneB: [-10, -10, -10, -10] } };
}

// ---- a full stage ---------------------------------------------------------
export function buildStage(si) {
  const S = STAGES[si];
  const ch = newChart(si * 7919 + 1013);
  ch.stage = si; ch.endless = false;
  const rng = ch.rng;
  // beat grid: 2 bars of count-in at the base tempo, then ramp across ~55 s
  let t = 0.6; const B = ch.beats;
  for (let i = 0; i < 400; i++) {
    B.push(t);
    const t0 = B[8] ?? Infinity;
    const prog = i < 8 ? 0 : clamp((t - t0) / 55);
    t += 60 / lerp(S.bpm[0], S.bpm[1], prog);
    if (i > 12 && i % 4 === 3 && t > (B[8] + 68)) { B.push(t); break; }
  }
  const t0 = ch.t0 = B[8];
  const nb = Math.floor(B.length / 4);
  let bossBar = 3; while (bossBar < nb && B[bossBar * 4] < t0 + 42) bossBar++;
  let songBars = 0; while (B[(bossBar + 2 + songBars) * 4] <= t0 + 57.6) songBars++;
  const finalBar = bossBar + 1 + songBars;
  for (let bar = 0; bar <= finalBar + 1; bar++) {
    ch.phase[bar] = bar < 2 ? 'count' : bar < bossBar ? 'wave' : bar === bossBar ? 'bossIntro' : bar < finalBar ? 'boss' : bar === finalBar ? 'final' : 'out';
    const prog = (bar - 2) / (bossBar - 2);
    ch.inten[bar] = bar < 2 ? 0 : bar < bossBar ? (prog < 0.2 ? 1 : prog < 0.55 ? 2 : 3) : 4;
  }
  // waves
  for (let bar = 2; bar < bossBar; bar++) {
    const prog = (bar - 2) / Math.max(1, bossBar - 3);
    let dens = lerp(S.dens[0], S.dens[1], prog);
    if (bar < 4) dens *= 0.65;
    // newly introduced types get a solo spotlight in the first bars
    const w = { ...S.w };
    if (bar < 6 && S.intro.length) for (const k of S.intro) w[k] = (w[k] || 1) * 2.5;
    genWaveBar(ch, bar, { dens, half: bar < 4 ? 0 : S.half, chord: S.chord, w }, rng);
  }
  // boss
  const boss = ch.boss = { name: S.boss.name, look: S.boss.look, throw: S.boss.throw, enterT: B[bossBar * 4], stations: [], hp: 0, maxHp: 0,
    kind: 'boss', ranged: false, attacks: [], dead: false, spawnT: B[bossBar * 4], goneT: Infinity, lane: 0, slot: 0, isBoss: true };
  let prevLane = 0;
  for (let k = 0; k < songBars; k++) {
    const toks = S.boss.song[k % S.boss.song.length].split(/\s+/);
    const bar = bossBar + 1 + k;
    toks.forEach((tok, h) => {
      if (tok === '-' || !tok) return;
      const kind = tok[0]; let lane = tok[1] === 'r' ? Math.floor(rng() * 4) : +tok[1];
      if (k >= S.boss.song.length) lane = (lane + 1) % 4; // second pass mirrors to keep it fresh
      const b = bar * 4 + h / 2;
      let a;
      if (kind === 's') a = addAttack(ch, 'sword', lane, b, { boss: true, att: boss, lead: 1.5 });
      else if (kind === 'f') a = addAttack(ch, 'feint', lane, b, { boss: true, att: boss, lead: 1.5 });
      else if (kind === 'h') a = addAttack(ch, 'sword', lane, b, { boss: true, att: boss, lead: 1.5, hold: true });
      else if (kind === 'b') a = addAttack(ch, 'bomb', lane, b, { boss: true, att: boss });
      else if (kind === 't') {
        a = addAttack(ch, boss.throw, lane, b, { boss: true, att: boss });
        if (boss.throw === 'double') addAttack(ch, 'double', lane, b + 0.5, { boss: true, att: boss });
      }
      prevLane = lane;
    });
  }
  // the finisher: one big slow strike
  const fl = (prevLane + 2) % 4;
  addAttack(ch, 'sword', fl, finalBar * 4, { boss: true, att: boss, lead: 2, final: true });
  // where the boss must stand, and when
  for (const a of ch.attacks) if (a.boss) {
    const melee = !a.proj;
    const need = melee ? beatT(ch, (a.fakeB ?? a.hitB) - 1) : a.relT - 0.05;
    boss.stations.push({ t: need, lane: a.lane, a });
    const dmg = a.type === 'bomb' ? 0 : 2; boss.maxHp += dmg;
  }
  boss.stations.sort((x, y) => x.t - y.t);
  boss.hp = boss.maxHp;
  ch.atts.push(boss);
  ch.endT = beatT(ch, finalBar * 4 + 4);
  ch.finalT = beatT(ch, finalBar * 4);
  ch.bossBar = bossBar;
  ch.attacks.sort((x, y) => x.hitT - y.hitT);
  ch.maxScore = scoreCeiling(ch);
  ch.target = Math.round(simScore(ch, 0.8) / 100) * 100;
  return ch;
}

// what a strong player (80% perfects, the rest goods, no misses) scores: the star target
export function simScore(ch, pPerfect) {
  const r = mulberry(ch.stage * 31 + 7); let s = 0, streak = 0;
  for (const a of ch.attacks) {
    if (a.type === 'bomb') { s += 50; continue; }
    if (r() < pPerfect) { streak++; s += 300 * Math.min(8, 1 + Math.floor(streak / 5)); } else { streak = 0; s += 100; }
  }
  return s + 2000; // + boss KO
}
export function scoreCeiling(ch) {
  let s = 0, streak = 0;
  for (const a of ch.attacks) {
    if (a.type === 'bomb') { s += 50; continue; }
    streak++; s += 300 * Math.min(8, 1 + Math.floor(streak / 5));
  }
  return s;
}

// ---- endless --------------------------------------------------------------
export function buildEndless(seed) {
  const ch = newChart(seed);
  ch.stage = -1; ch.endless = true; ch.genBar = 0;
  ch.beats.push(0.6);
  extendEndless(ch, 0);
  ch.t0 = ch.beats[8];
  ch.endT = Infinity; ch.finalT = Infinity; ch.target = 0;
  return ch;
}
export function endlessParams(bar) {
  const k = Math.max(0, bar - 2);
  const w = { arrow: 3, sword: 2 };
  if (k >= 4) w.axe = 2; if (k >= 8) w.fire = 2; if (k >= 12) w.feint = 1.2; if (k >= 16) w.double = 1.5;
  if (k >= 20) w.boulder = 0.8; if (k >= 24) w.bomb = 1.2;
  return { bpm: Math.min(168, 108 + k * 0.8), dens: Math.min(0.92, 0.4 + k * 0.009), half: k < 6 ? 0 : Math.min(0.42, 0.08 + k * 0.006), chord: k >= 32 ? 0.08 : 0, w };
}
// generate beats + attacks so the chart covers at least time `untilT` plus 3 bars
export function extendEndless(ch, untilT) {
  const B = ch.beats;
  while (B[B.length - 1] < untilT + 12 || B.length < 24) {
    const bar = Math.floor((B.length - 1) / 4);
    const P = endlessParams(bar);
    const bpm = bar < 2 ? 110 : P.bpm;
    for (let i = 0; i < 4; i++) B.push(B[B.length - 1] + 60 / bpm);
    ch.phase[bar] = bar < 2 ? 'count' : 'wave';
    ch.inten[bar] = bar < 2 ? 0 : Math.min(3, 1 + Math.floor((bar - 2) / 8));
  }
  // attacks for bars whose whole lead fits inside the known beats
  const lastBar = Math.floor((B.length - 1) / 4) - 1;
  while (ch.genBar < lastBar) {
    const bar = ch.genBar++;
    if (bar < 2) continue;
    const P = endlessParams(bar);
    if (bar < 4) { P.dens *= 0.65; }
    genWaveBar(ch, bar, P, ch.rng);
  }
  ch.attacks.sort((x, y) => x.hitT - y.hitT);
}
