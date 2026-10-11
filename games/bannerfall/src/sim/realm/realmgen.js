// BANNERFALL :: sim/realm/realmgen.js - the realm of a Long War from a seed (DESIGN.md 19.3).
// Provinces are Poisson-disc seeds relaxed twice (Lloyd) on a 160 x 160 grid with noisy borders,
// so they read as hand-drawn shires. A heightfield (for the war-table look and the biomes), a
// main river from the northern peaks to the southern marshes, biomes from latitude, height and
// moisture, then the kingdoms: Aldmere in the south-west, Varkhal in the north, Thornwood in the
// eastern woods, Saltmere on the south-east coast, 0-3 minor kingdoms and the landless Black
// Hounds. Every province gets a seat (capital, castle, fort or none), 2-5 villages, development,
// loyalty, a garrison and a battle seed; every edge gets travel days, a crossing and a direction.
// Pure JS, deterministic, node-safe.
import { mulberry32, fbm } from '../rng.js';
import { FACTIONS } from '../../data/factions.js';
import { REALM_SIZES, REALM_M, R_ECON, R_KINGDOM, R_SIEGE } from '../../data/realm.js';
import { REALM_PERSONALITY, TRAITS } from '../../data/personalities.js';
import { PROV_A, PROV_B, RULER_FIRST, RULER_EPITHET, KINGDOM_FORMS, NEW_COLOURS, EMBLEMS } from '../../data/names.js';

export const GN = 256;          // province grid resolution (a cell is about 16 m of the war table)

const MINORS = [
  { key: 'ely', name: 'Ely', personality: 'opportunist', doctrine: 'shieldbow', main: 0x7a3f8a, trim: 0xd8c070, emblem: 'star' },
  { key: 'brennmark', name: 'Brennmark', personality: 'steadfast', doctrine: 'turtle', main: 0x8a7a2a, trim: 0x2a2420, emblem: 'tower' },
  { key: 'odran', name: 'Odran', personality: 'zealot', doctrine: 'hammer', main: 0x4a4a8a, trim: 0xd0b060, emblem: 'sword' },
];

export function provinceName(rng, used) {
  for (let k = 0; k < 40; k++) { const n = rng.pick(PROV_A) + rng.pick(PROV_B); if (!used.has(n)) { used.add(n); return n; } }
  const n = rng.pick(PROV_A) + rng.pick(PROV_B) + ' ' + (used.size + 1); used.add(n); return n;
}
export function rulerName(rng) { return rng.pick(RULER_FIRST) + ' ' + rng.pick(RULER_EPITHET); }
export function traitsFor(rng) { const t = Object.keys(TRAITS); const a = [rng.pick(t)]; if (rng() < 0.5) { const b = rng.pick(t); if (b !== a[0]) a.push(b); } return a; }

// a kingdom record (the player's included)
export function makeKingdom(R, o) {
  const k = {
    id: R.kingdoms.length, key: o.key, name: o.name, short: o.short || o.name, leader: o.leader, main: o.main, trim: o.trim, ink: o.ink || 0xf4ecd8,
    emblem: o.emblem || 'crown', personality: o.personality || null, doctrine: o.doctrine || 'shieldbow', traits: o.traits || [],
    player: !!o.player, landless: !!o.landless, minor: !!o.minor, rebel: !!o.rebel,
    alive: true, gold: o.gold || 0, capital: -1, ruler: { name: o.leader, age: o.age || 40 }, heirT: -1,
    trust: 60, exhaustion: 0, warned: {}, bornDay: R.day, fellDay: -1, peakProvinces: 0, taxPolicy: 'normal',
    queue: [], letters: 0, seasonIncome: 0, seasonUpkeep: 0, lastIncome: 0,
  };
  R.kingdoms.push(k);
  return k;
}

export function generateRealm(o = {}) {
  const seed = (o.seed >>> 0) || 1;
  const rng = mulberry32(seed * 7919 + 13);
  const N = REALM_SIZES[o.provinces] || (typeof o.provinces === 'number' ? Math.max(20, Math.min(40, o.provinces)) : REALM_SIZES.standard);
  const S = REALM_M;
  // ---------------------------------------------------------------- relief and moisture (160 x 160)
  const height = new Float32Array(GN * GN), moist = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const u = i / (GN - 1), v = j / (GN - 1);                     // v = 0 south, 1 north
    let h = fbm(u * 3.2, v * 3.2, seed + 1, 5) * 0.6 + fbm(u * 9, v * 9, seed + 2, 3) * 0.2;
    h += Math.pow(Math.max(0, v - 0.62) / 0.38, 1.6) * 0.75;      // the northern mountains
    const edge = Math.min(u, v, 1 - u, 1 - v);
    h += Math.pow(Math.max(0, 0.05 - edge) / 0.05, 2) * 0.16;     // a low rim at the edge of the war table
    height[j * GN + i] = h;
    moist[j * GN + i] = fbm(u * 4 + 9, v * 4 + 3, seed + 5, 4);
  }
  // the main river: from the high north down to the south coast, wandering
  const river = [];
  {
    let x = 0.35 + rng() * 0.3, z = 0.92;
    for (let k = 0; k < 60 && z > 0.04; k++) {
      river.push([x * S, z * S]);
      x += (fbm(x * 6, z * 6, seed + 11, 2) - 0.5) * 0.06 + (0.5 - x) * 0.02;
      z -= 0.016;
    }
    river.push([x * S, 0.02 * S]);
  }
  const riverD = (x, z) => { let d = Infinity; for (let k = 1; k < river.length; k++) d = Math.min(d, segD(x, z, river[k - 1], river[k])); return d; };
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = (i + 0.5) / GN * S, z = (j + 0.5) / GN * S, d = riverD(x, z);
    if (d < 120) height[j * GN + i] -= (1 - d / 120) * 0.12;
    moist[j * GN + i] += Math.max(0, 1 - d / 500) * 0.35;
  }
  // ---------------------------------------------------------------- provinces: Poisson disc + Lloyd
  const minD = S * 0.62 / Math.sqrt(N);
  let seeds = [];
  for (let tries = 0; tries < 6000 && seeds.length < N; tries++) {
    const p = [S * (0.08 + rng() * 0.84), S * (0.08 + rng() * 0.84)];
    if (seeds.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > minD)) seeds.push(p);
  }
  while (seeds.length < N) seeds.push([S * (0.1 + rng() * 0.8), S * (0.1 + rng() * 0.8)]);
  const grid = new Int16Array(GN * GN);
  const warp = (x, z) => [x + (fbm(x / 500, z / 500, seed + 21, 3) - 0.5) * 340, z + (fbm(x / 500 + 5, z / 500, seed + 22, 3) - 0.5) * 340];
  const assign = () => {
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const [x, z] = warp((i + 0.5) / GN * S, (j + 0.5) / GN * S);
      let b = 0, bd = Infinity;
      for (let k = 0; k < seeds.length; k++) {
        const d = (seeds[k][0] - x) ** 2 + (seeds[k][1] - z) ** 2 + (riverD(x, z) < 60 ? 0 : 0);
        if (d < bd) { bd = d; b = k; }
      }
      grid[j * GN + i] = b;
    }
  };
  for (let pass = 0; pass < 3; pass++) {
    assign();
    if (pass === 2) break;
    const sx = new Float64Array(N), sz = new Float64Array(N), sn = new Float64Array(N);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const k = grid[j * GN + i]; sx[k] += (i + 0.5) / GN * S; sz[k] += (j + 0.5) / GN * S; sn[k]++; }
    seeds = seeds.map((p, k) => (sn[k] ? [sx[k] / sn[k], sz[k] / sn[k]] : p));
  }
  // centres (the province's cell nearest its centroid), areas, adjacency
  const cells = Array.from({ length: N }, () => []);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) cells[grid[j * GN + i]].push(j * GN + i);
  const adj = Array.from({ length: N }, () => new Map());
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const a = grid[j * GN + i];
    if (i + 1 < GN) { const b = grid[j * GN + i + 1]; if (a !== b) { adj[a].set(b, (adj[a].get(b) || 0) + 1); adj[b].set(a, (adj[b].get(a) || 0) + 1); } }
    if (j + 1 < GN) { const b = grid[(j + 1) * GN + i]; if (a !== b) { adj[a].set(b, (adj[a].get(b) || 0) + 1); adj[b].set(a, (adj[b].get(a) || 0) + 1); } }
  }
  const used = new Set();
  const R = {
    v: 1, seed, size: S, N, day: 0, rngState: 0,
    grid: Array.from(grid), GN, height: Array.from(height, (h) => Math.round(h * 1000) / 1000), river,
    provinces: [], edges: [], kingdoms: [], armies: [], engagements: [], sieges: [], letters: [], log: [],
    rel: {}, memory: {}, treaties: [], wars: [], captives: [],
    seq: { army: 1, sq: 1, eng: 1, letter: 1 },
    opts: { ...o, seed },
  };
  for (let k = 0; k < N; k++) {
    let cx = 0, cz = 0;
    for (const c of cells[k]) { cx += (c % GN + 0.5) / GN * S; cz += (Math.floor(c / GN) + 0.5) / GN * S; }
    cx /= Math.max(1, cells[k].length); cz /= Math.max(1, cells[k].length);
    // the cell of this province closest to its centroid (a centroid can fall outside a crescent)
    let best = cells[k][0], bd = Infinity;
    for (const c of cells[k]) { const x = (c % GN + 0.5) / GN * S, z = (Math.floor(c / GN) + 0.5) / GN * S, d = (x - cx) ** 2 + (z - cz) ** 2; if (d < bd) { bd = d; best = c; } }
    const pos = [(best % GN + 0.5) / GN * S, (Math.floor(best / GN) + 0.5) / GN * S];
    let hh = 0, mm = 0;
    for (const c of cells[k]) { hh += height[c]; mm += moist[c]; }
    hh /= Math.max(1, cells[k].length); mm /= Math.max(1, cells[k].length);
    const lat = pos[1] / S, rd = riverD(pos[0], pos[1]);
    let biome;
    if (lat > 0.8 || hh > 0.95) biome = 'snow';
    else if (hh > 0.78) biome = 'highland';
    else if (rd < 260) biome = 'river';
    else if (lat < 0.16 && mm > 0.55) biome = 'marsh';
    else if (mm > 0.62) biome = 'forest';
    else if (lat > 0.6) biome = 'autumn';
    else if (mm < 0.45) biome = 'farmland';
    else biome = rng() < 0.3 ? 'dusk' : 'spring';
    R.provinces.push({
      id: k, name: provinceName(rng, used), pos, area: cells[k].length, biome, height: hh, battleSeed: (seed * 131 + k * 977 + 7) >>> 0,
      owner: -1, controller: -1, seat: 'none', seatHp: 1, dev: 1 + Math.floor(rng() * 3) + (biome === 'farmland' || biome === 'river' ? 1 : 0),
      loyalty: R_KINGDOM.loyaltyStart, villages: [], garrison: [], supplies: 0, yard: [], startOwner: -1, unrest: 0, rebelT: -1,
      delta: { trenches: 0, walls: 0, burnt: 0, keeps: [] }, neighbors: [], river: rd < 200, wasCapitalOf: -1,
    });
  }
  // villages
  for (const P of R.provinces) {
    const n = 2 + Math.floor(rng() * (P.biome === 'farmland' ? 4 : 3));
    for (let v = 0; v < n; v++) P.villages.push({ tier: 1 + Math.floor(rng() * (P.dev >= 3 ? 3 : 2)), state: 'free', owner: -1 });
  }
  // edges
  for (let a = 0; a < N; a++) for (const [b, len] of adj[a]) {
    if (b < a || len < 2) continue;
    const A = R.provinces[a], B = R.provinces[b];
    const dist = Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1]);
    const rough = (x) => (x.biome === 'snow' ? 2.5 : x.biome === 'highland' ? 1.5 : x.biome === 'forest' || x.biome === 'marsh' ? 1 : 0);
    // does the river run between them?
    const mid = [(A.pos[0] + B.pos[0]) / 2, (A.pos[1] + B.pos[1]) / 2];
    const crossRiver = riverD(mid[0], mid[1]) < 160 && (riverSide(river, A.pos) !== riverSide(river, B.pos));
    let crossing = 'road', days = 3 + dist / S * 9 + (rough(A) + rough(B)) / 2;
    if (A.biome === 'snow' || B.biome === 'snow') crossing = 'pass';
    else if (crossRiver) crossing = rng() < 0.45 ? 'bridge' : 'ford';
    else if (rough(A) + rough(B) >= 2) crossing = 'trail';
    if (crossing === 'ford') days += 1;
    days = Math.max(3, Math.min(8, Math.round(days)));
    const e = { id: R.edges.length, a, b, days, crossing, choke: crossing === 'pass' || crossing === 'bridge', dir: Math.atan2(B.pos[0] - A.pos[0], B.pos[1] - A.pos[1]), road: false };
    R.edges.push(e);
    A.neighbors.push(b); B.neighbors.push(a);
  }
  // make sure the graph is connected (a lonely province gets a road to its nearest neighbour)
  const seen = new Set([0]), stack = [0];
  while (stack.length) { const p = stack.pop(); for (const q of R.provinces[p].neighbors) if (!seen.has(q)) { seen.add(q); stack.push(q); } }
  for (const P of R.provinces) if (!seen.has(P.id)) {
    let b = -1, bd = Infinity; for (const q of seen) { const d = Math.hypot(R.provinces[q].pos[0] - P.pos[0], R.provinces[q].pos[1] - P.pos[1]); if (d < bd) { bd = d; b = q; } }
    R.edges.push({ id: R.edges.length, a: P.id, b, days: 6, crossing: 'trail', choke: true, dir: Math.atan2(R.provinces[b].pos[0] - P.pos[0], R.provinces[b].pos[1] - P.pos[1]), road: false });
    P.neighbors.push(b); R.provinces[b].neighbors.push(P.id); seen.add(P.id);
  }
  // ---------------------------------------------------------------- kingdoms
  const corner = (u, v) => { let b = 0, bd = Infinity; for (const P of R.provinces) { const d = Math.hypot(P.pos[0] / S - u, P.pos[1] / S - v); if (d < bd) { bd = d; b = P.id; } } return b; };
  const gold = (lo, hi) => Math.round((lo + rng() * (hi - lo)) / 1000) * 1000;
  const startGold = o.gold || R_ECON.startPlayer;
  const ald = makeKingdom(R, { ...FACTIONS.aldmere, key: 'aldmere', player: true, gold: startGold, leader: 'King ' + rng.pick(RULER_FIRST), age: 34 + Math.floor(rng() * 11) });
  ald.short = 'Aldmere';
  const majors = [
    { key: 'varkhal', at: [0.55, 0.88] }, { key: 'thornwood', at: [0.9, 0.55] }, { key: 'saltmere', at: [0.85, 0.12] },
  ];
  const caps = [{ k: ald, p: corner(0.12, 0.12) }];
  for (const m of majors) {
    const F = FACTIONS[m.key];
    const k = makeKingdom(R, { ...F, key: m.key, gold: gold(...R_ECON.startAI), traits: traitsFor(rng), age: 30 + Math.floor(rng() * 25) });
    caps.push({ k, p: corner(m.at[0], m.at[1]) });
  }
  const nMinor = o.kingdoms ? Math.max(0, Math.min(3, o.kingdoms - 5)) : (N >= 28 ? 1 + Math.floor(rng() * 2) : N >= 24 ? 1 : 0);
  const minorSpots = [[0.2, 0.62], [0.5, 0.45], [0.18, 0.88], [0.62, 0.22]];
  for (let i = 0; i < nMinor; i++) {
    const m = MINORS[i];
    const k = makeKingdom(R, { key: m.key, name: 'Kingdom of ' + m.name, short: m.name, leader: rulerName(rng), main: m.main, trim: m.trim, emblem: m.emblem, personality: m.personality, doctrine: m.doctrine, minor: true, gold: gold(25000, 45000), traits: traitsFor(rng), age: 30 + Math.floor(rng() * 25) });
    caps.push({ k, p: corner(...minorSpots[i]) });
  }
  // capitals at least 3 edges apart: nudge clashes outward
  const hops = (a) => { const d = new Array(N).fill(99); d[a] = 0; const q = [a]; while (q.length) { const x = q.shift(); for (const y of R.provinces[x].neighbors) if (d[y] > d[x] + 1) { d[y] = d[x] + 1; q.push(y); } } return d; };
  for (let i = 1; i < caps.length; i++) {
    for (let tries = 0; tries < N; tries++) {
      const clash = caps.slice(0, i).some((c) => hops(c.p)[caps[i].p] < 3);
      if (!clash) break;
      // the province farthest (in hops) from the capitals placed so far, near the wanted spot
      let b = caps[i].p, bs = -Infinity;
      for (const P of R.provinces) {
        if (caps.some((c) => c.p === P.id)) continue;
        const mh = Math.min(...caps.slice(0, i).map((c) => hops(c.p)[P.id]));
        const s = mh * 10 - Math.hypot(P.pos[0] - R.provinces[caps[i].p].pos[0], P.pos[1] - R.provinces[caps[i].p].pos[1]) / 200;
        if (mh >= 3 && s > bs) { bs = s; b = P.id; }
      }
      caps[i].p = b; break;
    }
  }
  for (const c of caps) { const P = R.provinces[c.p]; P.owner = P.controller = P.startOwner = c.k.id; P.seat = 'capital'; P.dev = Math.max(P.dev, 4); c.k.capital = P.id; P.wasCapitalOf = c.k.id; }
  // grow each kingdom to 2-6 provinces, majors first, by BFS rounds
  const want = new Map(caps.map((c) => [c.k.id, c.k.minor ? 2 + Math.floor(rng() * 2) : c.k.player ? 4 : 3 + Math.floor(rng() * 3)]));
  for (let round = 0; round < 6; round++) for (const c of caps) {
    const k = c.k, have = R.provinces.filter((P) => P.owner === k.id).length;
    if (have >= want.get(k.id)) continue;
    const front = new Set();
    for (const P of R.provinces) if (P.owner === k.id) for (const nb of P.neighbors) if (R.provinces[nb].owner === -1) front.add(nb);
    const pick = [...front].sort((a, b) => Math.hypot(R.provinces[a].pos[0] - R.provinces[c.p].pos[0], R.provinces[a].pos[1] - R.provinces[c.p].pos[1]) - Math.hypot(R.provinces[b].pos[0] - R.provinces[c.p].pos[0], R.provinces[b].pos[1] - R.provinces[c.p].pos[1]))[0];
    if (pick !== undefined) { const P = R.provinces[pick]; P.owner = P.controller = P.startOwner = k.id; }
  }
  // seats: a castle or two per kingdom (away from the capital), forts on the borders; free provinces
  // keep a timber fort half the time
  for (const k of R.kingdoms) {
    const mine = R.provinces.filter((P) => P.owner === k.id && P.seat === 'none');
    mine.sort((a, b) => hops(k.capital)[b.id] - hops(k.capital)[a.id]);
    mine.forEach((P, i) => { P.seat = i === 0 || (i === 2 && !k.minor) ? 'castle' : i % 2 ? 'stronghold' : 'none'; });
  }
  for (const P of R.provinces) if (P.owner === -1) P.seat = rng() < 0.5 ? 'stronghold' : 'none';
  // roads: capitals and castles of one kingdom are joined; roads cut travel days by 40%
  for (const e of R.edges) {
    const A = R.provinces[e.a], B = R.provinces[e.b];
    if ((A.seat !== 'none' && B.seat !== 'none') || (A.owner === B.owner && A.owner >= 0 && (A.seat === 'capital' || B.seat === 'capital'))) { e.road = true; e.days = Math.max(2, Math.round(e.days * 0.6)); if (e.crossing === 'trail') e.crossing = 'road'; }
  }
  // garrisons, supplies, villages taxed by the owner
  for (const P of R.provinces) {
    P.supplies = R_SIEGE.supplies[P.seat] || 0;
    const k = P.owner >= 0 ? R.kingdoms[P.owner] : null;
    P.garrison = startingGarrison(R, P, k, rng);
    if (k) for (const v of P.villages) { v.state = 'taxed'; v.owner = k.id; }
    if (k) P.loyalty = R_KINGDOM.loyaltyStart + (P.seat === 'capital' ? 15 : 0);
    else P.loyalty = 55;
  }
  // the Black Hounds: landless raiders who start in the wildest free province
  const wild = R.provinces.filter((P) => P.owner === -1).sort((a, b) => b.height - a.height)[0] || R.provinces[Math.floor(N / 2)];
  const hounds = makeKingdom(R, { ...FACTIONS.hounds, key: 'hounds', landless: true, gold: 30000, traits: traitsFor(rng), age: 38 });
  hounds.home = wild.id;
  for (const k of R.kingdoms) k.peakProvinces = R.provinces.filter((P) => P.owner === k.id).length;
  // relations: everyone at peace except the old feuds (Varkhal and Aldmere start at war: the main enemy)
  const ids = R.kingdoms.map((k) => k.id);
  for (const a of ids) { R.memory[a] = {}; for (const b of ids) if (a < b) R.rel[a + '|' + b] = { state: 'peace', since: 0, until: 0 }; }
  const vark = R.kingdoms.find((k) => k.key === 'varkhal');
  R.main = vark.id;
  R.rel[Math.min(ald.id, vark.id) + '|' + Math.max(ald.id, vark.id)] = { state: 'war', since: 0, until: 0, aggressor: vark.id };
  R.wars.push({ a: vark.id, b: ald.id, start: 0, score: 0 });
  for (const k of R.kingdoms) if (k.landless) for (const o2 of ids) if (o2 !== k.id) { R.rel[Math.min(k.id, o2) + '|' + Math.max(k.id, o2)] = { state: 'war', since: 0, until: 0, aggressor: k.id }; }
  R.rngState = rng.getState();
  return R;
}

// the garrison a province starts with (squad records, see armies.js)
export function startingGarrison(R, P, k, rng) {
  const doctrine = k ? k.doctrine : 'shieldbow';
  const n = P.seat === 'capital' ? 8 : P.seat === 'castle' ? 5 : P.seat === 'stronghold' ? 3 : 1;
  const mix = {
    royal: ['spear', 'sword', 'archer', 'knight', 'xbow', 'menAtArms', 'archer', 'spear'],
    hammer: ['sword', 'archer', 'outrider', 'archer', 'spear', 'longbow', 'sword', 'javelin'],
    turtle: ['spear', 'xbow', 'xbow', 'pike', 'archer', 'spear', 'shieldbearer', 'xbow'],
    horde: ['sword', 'outrider', 'spear', 'knight', 'archer', 'sword', 'horseArcher', 'spear'],
    shieldbow: ['spear', 'archer', 'spear', 'archer', 'sword', 'healer', 'archer', 'spear'],
  }[doctrine] || ['spear', 'archer', 'spear', 'archer', 'sword'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(newSquad(R, k ? mix[i % mix.length] : (i % 2 ? 'militiaBow' : 'militia')));
  return out;
}

import { UNIT_TYPES } from '../../data/units.js';
// a persistent squad: it keeps its id, men, veterancy and ammo from battle to battle (DESIGN.md 19.5)
export function newSquad(R, type, o = {}) {
  const D = UNIT_TYPES[type];
  return { id: 'r' + (R.seq.sq++), type, men: D.men, max: D.men, xp: o.xp || 0, ammo: D.ammo || 0, morale: 0 };
}

function segD(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
// which side of the river a point is on (the sign of the cross product with the nearest segment)
function riverSide(river, p) {
  let bk = 1, bd = Infinity;
  for (let k = 1; k < river.length; k++) { const d = segD(p[0], p[1], river[k - 1], river[k]); if (d < bd) { bd = d; bk = k; } }
  const a = river[bk - 1], b = river[bk];
  return Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
}
export { NEW_COLOURS, EMBLEMS, KINGDOM_FORMS, REALM_PERSONALITY };
