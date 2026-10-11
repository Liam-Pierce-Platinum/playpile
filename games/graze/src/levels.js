// Worlds, hand-ordered level chunk lists, the endless RUN picker and the
// seeded DAILY course. Chunk details come from a per-level seed, so a level is
// identical every attempt (that is what makes practice, ghosts and the Daily fair).
import { Course } from './course.js';
import { genChunk, newCtx, LEN } from './chunks.js';
import { RNG, hashStr, clamp, lerp, BASE_SPEED, dayKey, dayNumber } from './util.js';

export const ACCENTS = ['#22e3ff', '#ff3df2', '#b6ff3b', '#ffb12a'];

export const WORLDS = [
  {
    name: 'SIGNAL', accent: '#22e3ff', speed: 1.0, root: 45, blurb: 'Tunnels, pipes and spikes',
    levels: [
      { name: 'First Light', seq: 'intro zigw sine zigw spikes zig sine zigw pillars zig sine finish', d: [0, 0.25] },
      { name: 'Carrier', seq: 'intro zig sine spikes zig pillars sine zig spikes zigw sine zig finish', d: [0.1, 0.35] },
      { name: 'Static Hum', seq: 'intro pillars zig spikes pillars sine zig spikes pillars zig sine spikes finish', d: [0.15, 0.45] },
      { name: 'Low Pass', seq: 'intro sine zig sine spikes sine pillars zig sine spikes zig sine pillars zig finish', d: [0.2, 0.5] },
      { name: 'Feedback', seq: 'intro zig spikes zig pillars spikes zig sine spikes pillars zig spikes sine zig finish', d: [0.25, 0.55] },
      { name: 'Broadcast', seq: 'intro zig sine spikes pillars zig spikes sine pillars zig spikes zig sine pillars spikes zig finish', d: [0.3, 0.62] },
    ],
  },
  {
    name: 'PULSE', accent: '#ff3df2', speed: 1.05, root: 43, blurb: 'Saws, speed portals, narrow tunnels',
    levels: [
      { name: 'Heartbeat', seq: 'intro zigw saws zig sine saws zig spikes saws zig sine saws finish', d: [0.15, 0.4] },
      { name: 'Overclock', seq: 'intro zig speed zig saws sine speed spikes zig saws speed zig finish', d: [0.2, 0.45] },
      { name: 'Needle', seq: 'intro zig narrow zig saws narrow sine spikes narrow zig saws narrow zig finish', d: [0.25, 0.5] },
      { name: 'Arterial', seq: 'intro sine saws speed zig narrow saws spikes speed sine saws narrow pillars zig finish', d: [0.3, 0.55] },
      { name: 'Tachycardia', seq: 'intro speed saws narrow zig speed spikes saws narrow sine speed pillars saws zig finish', d: [0.35, 0.62] },
      { name: 'Flatline', seq: 'intro saws narrow speed zig saws spikes narrow speed pillars saws zig narrow speed sine saws zig finish', d: [0.4, 0.7] },
    ],
  },
  {
    name: 'STATIC', accent: '#b6ff3b', speed: 1.1, root: 40, blurb: 'Gravity flips and mini size',
    levels: [
      { name: 'Polarity', seq: 'intro zigw grav zig sine grav spikes zig grav saws zig finish', d: [0.2, 0.45] },
      { name: 'Small Talk', seq: 'intro zig mini zig sine mini spikes saws mini zig grav sine finish', d: [0.25, 0.5] },
      { name: 'Upside', seq: 'intro grav zig mini saws grav narrow sine mini spikes grav pillars zig finish', d: [0.3, 0.55] },
      { name: 'Inversion', seq: 'intro mini grav saws narrow mini spikes grav sine zig mini grav pillars saws finish', d: [0.35, 0.62] },
      { name: 'Quantum', seq: 'intro grav mini narrow speed saws grav spikes mini sine narrow grav saws mini zig finish', d: [0.4, 0.68] },
      { name: 'Event Horizon', seq: 'intro mini grav saws speed narrow mini spikes grav pillars speed mini saws grav narrow sine zig finish', d: [0.45, 0.75] },
    ],
  },
  {
    name: 'OVERDRIVE', accent: '#ffb12a', speed: 1.15, root: 41, blurb: 'Mirror zones and everything at once',
    levels: [
      { name: 'Reflection', seq: 'intro zig mirror zig saws mirror spikes sine mirror pillars zig finish', d: [0.3, 0.55] },
      { name: 'Afterburn', seq: 'intro speed mirror saws narrow grav spikes mini zig mirror sine speed saws finish', d: [0.35, 0.62] },
      { name: 'Red Line', seq: 'intro narrow mirror grav saws speed spikes mini narrow mirror pillars grav saws zig finish', d: [0.4, 0.7] },
      { name: 'Solar Wind', seq: 'intro mirror mini speed saws grav narrow spikes mirror sine mini pillars speed saws grav zig finish', d: [0.45, 0.76] },
      { name: 'Meltdown', seq: 'intro grav mirror narrow speed saws mini spikes mirror grav pillars narrow speed saws mini mirror zig finish', d: [0.5, 0.82] },
      { name: 'Supernova', seq: 'intro mirror speed narrow saws grav mini spikes mirror pillars speed narrow grav saws mini mirror spikes speed sine zig finish', d: [0.55, 0.9] },
    ],
  },
];

export function levelInfo(w, l) {
  const L = WORLDS[w].levels[l];
  const toks = L.seq.split(' ');
  const units = toks.reduce((s, t) => s + (t === 'intro' ? LEN / 2 : t === 'finish' ? LEN / 2 : LEN), 0);
  // difficulty face from the level's peak chunk difficulty (Space Waves style: green / orange / red)
  const diff = L.d[1] < 0.4 ? ['EASY', '#5dff9b'] : L.d[1] < 0.6 ? ['MEDIUM', '#ffb12a'] : L.d[1] < 0.8 ? ['HARD', '#ff5a5a'] : ['INSANE', '#ff3df2'];
  return { ...L, secs: Math.round(units / (BASE_SPEED * WORLDS[w].speed)), diff: diff[0], diffCol: diff[1] };
}

// ---------------------------------------------------------------- builders
export function buildLevel(w, l) {
  const L = WORLDS[w].levels[l];
  const course = new Course();
  const rng = new RNG(hashStr(`graze-level-${w}-${l}`));
  const ctx = newCtx(course, rng);
  const toks = L.seq.split(' ');
  const n = toks.length;
  toks.forEach((t, i) => genChunk(ctx, t, lerp(L.d[0], L.d[1], i / (n - 1)) + rng.range(-0.04, 0.04)));
  return { course, ctx, speed: WORLDS[w].speed, accent: WORLDS[w].accent, root: WORLDS[w].root, seed: hashStr(`song-${w}-${l}`), extend: null };
}

export function dailyInfo(d = new Date()) {
  const key = dayKey(d);
  return { key, num: dayNumber(d), seed: hashStr('graze-daily-' + key), accent: ACCENTS[dayNumber(d) % 4] };
}
export const DAILY_SPEED = 1.08;
export function buildDaily(info = dailyInfo()) {
  const course = new Course();
  const rng = new RNG(info.seed);
  const ctx = newCtx(course, rng);
  genChunk(ctx, 'intro', 0);
  // 90 s at 1.08x = ~32k units = 24 standard chunks + intro + half the finish
  let last = 'intro', since = 3;
  for (let i = 0; i < 24; i++) {
    const d = lerp(0.15, 0.78, i / 23);
    const t = pickType(rng, d, last, since);
    since = isPortal(t) ? 0 : since + 1;
    genChunk(ctx, t, d); last = t;
  }
  genChunk(ctx, 'finish', 0);
  return { course, ctx, speed: DAILY_SPEED, accent: info.accent, root: [45, 43, 40, 41][info.num % 4], seed: info.seed, extend: null };
}

const isPortal = (t) => t === 'mini' || t === 'grav' || t === 'speed' || t === 'mirror';
function pickType(rng, d, last, since) {
  const pool = [['zig', 3], ['sine', 2], ['spikes', 2.2], ['pillars', 1.6]];
  if (d > 0.12) pool.push(['saws', 2.2]);
  if (d > 0.3) pool.push(['narrow', 1.2]);
  if (since >= 2) {
    if (d > 0.25) pool.push(['speed', 0.8]);
    if (d > 0.3) pool.push(['mini', 0.8]);
    if (d > 0.38) pool.push(['grav', 0.8]);
    if (d > 0.5) pool.push(['mirror', 0.6]);
  }
  const f = pool.filter(([t]) => t !== last);
  let tot = f.reduce((s, p) => s + p[1], 0), r = rng.f() * tot;
  for (const [t, w] of f) { if ((r -= w) <= 0) return t; }
  return 'zig';
}

// Endless RUN. The first 3 runs ever get the 15 s teaching tunnel; after that
// a 2 s intro (short). Two easy 'zigw' bridge chunks follow, then chunk
// difficulty ramps with distance: d = 0.08 -> 0.4 by ~13k units (40 s), 0.95
// by ~35k. A tier-3 start (startTier) skips ahead by RUN_SKIP units of ramp.
export const RUN_RAMP = 40000;
export const RUN_SKIP = 20000;
export const BRIDGES = [[120, 150], [95, 125]]; // wall gap (each side of the line) of the two easy chunks after the tunnel
export function buildRun(seed, o = {}) {
  const course = new Course();
  const rng = new RNG(seed);
  const ctx = newCtx(course, rng);
  ctx.teachLen = 9 * BASE_SPEED;
  const skip = o.startTier ? RUN_SKIP : 0;
  ctx.nextGap = skip ? 95 : BRIDGES[0][0] + 10; // the tunnel funnels down to the first bridge's width
  genChunk(ctx, o.short || skip ? 'intro' : 'teach', 0);
  const teachEnd = ctx.x;
  let last = 'intro', since = 3, n = 0;
  const extend = (toX) => {
    while (ctx.x < toX) {
      const dist = ctx.x - teachEnd + skip;
      let d = clamp(0.08 + dist / RUN_RAMP, 0, 0.95) + rng.range(-0.05, 0.05);
      let t;
      if (n < BRIDGES.length && !skip) { t = 'zigw'; d = 0; ctx.bridge = BRIDGES[n]; }
      else { t = pickType(rng, d, last, since); since = isPortal(t) ? 0 : since + 1; ctx.bridge = null; }
      genChunk(ctx, t, clamp(d, 0, 1)); last = t; n++;
    }
  };
  extend(4000);
  return { course, ctx, speed: 1, accent: ACCENTS[0], root: 45, seed, extend };
}
