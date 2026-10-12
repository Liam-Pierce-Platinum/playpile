// Board generation, dictionary lookup, solver and scoring. Pure logic, no DOM.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Points per tile. Common letters are cheap, rare ones pay.
export const VALUES = {
  a: 1, b: 4, c: 3, d: 2, e: 1, f: 4, g: 3, h: 4, i: 1, j: 9, k: 5, l: 2, m: 3,
  n: 1, o: 1, p: 3, qu: 8, r: 1, s: 1, t: 1, u: 2, v: 5, w: 4, x: 8, y: 4, z: 9,
};

// Letter weights for random tiles (roughly English letter frequency, a touch flattened).
const CONS = { b: 2, c: 3, d: 4, f: 2, g: 3, h: 4, j: 0.25, k: 1, l: 5, m: 3, n: 6, p: 3, qu: 0.35, r: 6, s: 6.5, t: 7, v: 1, w: 1.6, x: 0.3, y: 1.8, z: 0.25 };
const VOWS = { a: 8, e: 11, i: 7, o: 7, u: 3 };
const RARE = new Set(['j', 'qu', 'x', 'z', 'k', 'v']);

function pick(rng, table) {
  let tot = 0; for (const k in table) tot += table[k];
  let r = rng() * tot;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

export function lenMult(n) {
  return n <= 3 ? 1 : n === 4 ? 1.5 : n === 5 ? 2 : n === 6 ? 2.5 : n === 7 ? 3 : 4;
}

export const NEIGH = [];
for (let i = 0; i < 16; i++) {
  const r = i >> 2, c = i & 3, n = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 4 && cc >= 0 && cc < 4) n.push(rr * 4 + cc);
  }
  NEIGH.push(n);
}
export const adjacent = (a, b) => NEIGH[a].includes(b);

// ---------- dictionary (sorted array + binary search, light on phone memory) ----------
export class Dict {
  constructor(text) {
    const words = [], common = new Set();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      if (line[0] === '-') words.push(line.slice(1));
      else { words.push(line); common.add(line); }
    }
    this.words = words; // already sorted by the build script
    this.common = common;
    this.set = new Set(words);
  }
  has(w) { return this.set.has(w); }
  isCommon(w) { return this.common.has(w); }
  hasPrefix(p) {
    const a = this.words; let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < p) lo = m + 1; else hi = m; }
    return lo < a.length && a[lo].startsWith(p);
  }
}

// ---------- scoring ----------
export function scorePath(tiles, path) {
  let sum = 0, wordMul = 1, len = 0;
  for (const i of path) {
    const t = tiles[i];
    sum += t.val * (t.mult === 'DL' ? 2 : 1);
    if (t.mult === 'TW') wordMul *= 3;
    len += t.ch.length;
  }
  return Math.round(sum * wordMul * lenMult(len));
}
export const pathWord = (tiles, path) => path.map(i => tiles[i].ch).join('');

// ---------- solver: every dictionary word on the board, with its best-scoring path ----------
export function solve(tiles, dict) {
  const out = new Map();
  const used = new Array(16).fill(false);
  const path = [];
  function dfs(i, pre) {
    const w = pre + tiles[i].ch;
    if (!dict.hasPrefix(w)) return;
    used[i] = true; path.push(i);
    if (w.length >= 3 && dict.has(w)) {
      const s = scorePath(tiles, path);
      const prev = out.get(w);
      if (!prev || s > prev.score) out.set(w, { word: w, score: s, path: path.slice(), common: dict.isCommon(w) });
    }
    for (const n of NEIGH[i]) if (!used[n]) dfs(n, w);
    used[i] = false; path.pop();
  }
  for (let i = 0; i < 16; i++) dfs(i, '');
  return out;
}

// ---------- type-to-play: find a path that spells str (partial "q" may match a "qu" tile at the end) ----------
export function findPath(tiles, str) {
  if (!str) return [];
  const used = new Array(16).fill(false);
  const path = [];
  function dfs(i, rest) {
    const ch = tiles[i].ch;
    if (rest.startsWith(ch)) {
      used[i] = true; path.push(i);
      const r = rest.slice(ch.length);
      if (!r) return true;
      for (const n of NEIGH[i]) if (!used[n] && dfs(n, r)) return true;
      used[i] = false; path.pop();
      return false;
    }
    if (ch.startsWith(rest)) { path.push(i); return true; } // "q" typed, tile is "qu"
    return false;
  }
  for (let i = 0; i < 16; i++) if (dfs(i, str)) return path.slice();
  return null;
}

// ---------- board generation ----------
function randomTiles(rng) {
  for (;;) {
    const letters = [];
    const nv = 5 + Math.floor(rng() * 3); // 5..7 vowels
    for (let i = 0; i < 16; i++) letters.push(i < nv ? pick(rng, VOWS) : pick(rng, CONS));
    const counts = {};
    let rare = 0, bad = false;
    for (const l of letters) {
      counts[l] = (counts[l] || 0) + 1;
      if (counts[l] > (l === 'e' || l === 's' ? 3 : 2)) bad = true;
      if (RARE.has(l)) rare++;
    }
    if (bad || rare > 2) continue;
    // shuffle
    for (let i = 15; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    return letters;
  }
}

export function makeBoard(seed, dict, opts = {}) {
  const rng = mulberry32(seed);
  const minCommon = opts.minCommon ?? 70;
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const letters = randomTiles(rng);
    const tiles = letters.map(ch => ({ ch, val: VALUES[ch], mult: null }));
    // specials: two DL and one TW, on different tiles
    const idx = [...Array(16).keys()];
    for (let i = 15; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    tiles[idx[0]].mult = 'TW'; tiles[idx[1]].mult = 'DL'; tiles[idx[2]].mult = 'DL';
    const sol = solve(tiles, dict);
    let common = 0; for (const s of sol.values()) if (s.common) common++;
    if (!best || common > best.common) best = { tiles, sol, common };
    if (common >= minCommon) break;
  }
  return { seed, tiles: best.tiles, solutions: best.sol, commonCount: best.common };
}

// Par = summed best scores of the common words. Stars are fractions of it.
export function boardPar(board) {
  let p = 0; for (const s of board.solutions.values()) if (s.common) p += s.score;
  return p;
}
export const STAR_FRAC = [0.07, 0.15, 0.26];
export function starTargets(board) {
  const par = boardPar(board);
  return STAR_FRAC.map(f => Math.max(20, Math.round(par * f / 5) * 5));
}

// Rotate tile array 90 degrees clockwise.
export function rotateTiles(tiles) {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + (3 - r)] = tiles[r * 4 + c];
  return out;
}
