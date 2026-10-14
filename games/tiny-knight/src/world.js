// The island: tile map, zones, static objects (trees, rocks, buildings), pre-rendered terrain.
import { P } from './sprites.js';

export const TS = 16, N = 160, CX = 80, CY = 80;
export const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, PATH: 5, HILL: 6, GRAVE: 7, ISLE: 8, FLOOR: 9, WALL: 10, BRIDGE: 11, TOWN: 12, GATE: 13 };
export const Z = { MEADOW: 0, FOREST: 1, HILLS: 2, GRAVE: 3, CASTLE: 4, TOWN: 5, LAKE: 6, OCEAN: 7, THRONE: 8 };
export const ZONE_NAMES = ['Sunny Meadow', 'Whisperwood', 'Pebble Hills', 'Hollow Graves', 'Shadow Castle', 'Oakhaven', 'Moonlake', 'The Sea', 'Throne Room'];
export const ZONE_TIER = [1, 2, 3, 4, 5, 0, 0, 0, 5];

export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.1;

export const TOWN = { x: 80, y: 131 };
export const CAMP = { x: 80, y: 111 };
export const CASTLE = { x0: 70, x1: 90, y0: 69, y1: 90, innerY: 79 };

export class World {
  constructor() {
    this.tiles = new Uint8Array(N * N);
    this.zones = new Uint8Array(N * N);
    this.objs = [];
    this.grid = new Array(N * N).fill(null); // solid object per tile
    this.bridgeRows = [];
    this.bridgeStage = 0;
    this.gateOpen = false;
    this.gen();
  }
  t(x, y) { return (x < 0 || y < 0 || x >= N || y >= N) ? T.DEEP : this.tiles[y * N + x]; }
  zoneAt(px, py) { const x = Math.floor(px / TS), y = Math.floor(py / TS); if (x < 0 || y < 0 || x >= N || y >= N) return Z.OCEAN; return this.zones[y * N + x]; }
  set(x, y, v) { if (x >= 0 && y >= 0 && x < N && y < N) this.tiles[y * N + x] = v; }
  gen() {
    const R = rng(1337);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const coast = 70 + (fbm(Math.cos(a) * 2 + 10, Math.sin(a) * 2 + 10) - 0.5) * 12;
      const lake = 26 + (vnoise(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5) - 0.5) * 3;
      let tile = T.GRASS, zone;
      let deg = (a * 180 / Math.PI + 360 + (fbm(x * 0.06, y * 0.06) - 0.5) * 50) % 360;
      if (deg < 45 || deg >= 315) zone = Z.HILLS; else if (deg < 135) zone = Z.MEADOW; else if (deg < 225) zone = Z.FOREST; else zone = Z.GRAVE;
      if (zone === Z.FOREST) tile = T.FOREST; else if (zone === Z.HILLS) tile = T.HILL; else if (zone === Z.GRAVE) tile = T.GRAVE;
      if (d > coast) { tile = T.DEEP; zone = Z.OCEAN; } else if (d > coast - 3.2) tile = T.SAND;
      if (d < lake) { tile = T.WATER; zone = Z.LAKE; }
      if (d < 15.2 || (Math.abs(dx) <= 11 && Math.abs(dy) <= 12)) { tile = T.ISLE; zone = Z.CASTLE; }
      this.tiles[y * N + x] = tile; this.zones[y * N + x] = zone;
    }
    // town plaza + safe zone
    for (let y = -10; y <= 10; y++) for (let x = -12; x <= 12; x++) {
      const d = Math.hypot(x / 1.2, y); const tx = TOWN.x + x, ty = TOWN.y + y;
      if (d < 10) { this.zones[ty * N + tx] = Z.TOWN; if (this.t(tx, ty) !== T.SAND) this.set(tx, ty, T.GRASS); }
      if (d < 4.2) this.set(tx, ty, T.TOWN);
    }
    // camp clearing
    for (let y = -4; y <= 4; y++) for (let x = -6; x <= 6; x++) { const tx = CAMP.x + x, ty = CAMP.y + y; if (this.t(tx, ty) !== T.WATER) { this.zones[ty * N + tx] = Z.TOWN; } }
    // paths
    const path = (x0, y0, x1, y1, w = 1) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps; const wob = (vnoise(i * 0.08, x0 + y0) - 0.5) * 3 * Math.sin(t * Math.PI);
        const px = x0 + (x1 - x0) * t + wob * (y1 - y0 ? 1 : 0), py = y0 + (y1 - y0) * t + wob * (x1 - x0 ? 1 : 0) * 0.5;
        for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
          if (Math.abs(ox) + Math.abs(oy) > w + 0.5) continue;
          const tx = Math.round(px + ox), ty = Math.round(py + oy), tt = this.t(tx, ty);
          if (tt === T.GRASS || tt === T.FOREST || tt === T.HILL || tt === T.GRAVE || tt === T.SAND) this.set(tx, ty, T.PATH);
        }
      }
    };
    path(80, 127, 80, 107);
    for (let i = 0; i < 64; i++) { const a0 = i / 64 * Math.PI * 2, a1 = (i + 1) / 64 * Math.PI * 2; path(CX + Math.cos(a0) * 44, CY + Math.sin(a0) * 44, CX + Math.cos(a1) * 44, CY + Math.sin(a1) * 44, 1); }
    path(80, 124, 80, 124); path(70, 131, 46, 112); path(90, 131, 114, 112);
    path(124, 80, 140, 80); path(36, 80, 18, 82); path(80, 36, 80, 18);
    // castle structure
    const C = CASTLE;
    for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) {
      const edge = x === C.x0 || x === C.x1 || y === C.y0 || y === C.y1 || y === C.y0 + 1;
      this.set(x, y, edge ? T.WALL : T.FLOOR);
      this.zones[y * N + x] = y < C.innerY ? Z.THRONE : Z.CASTLE;
    }
    for (let x = C.x0; x <= C.x1; x++) { this.set(x, C.innerY, T.WALL); this.set(x, C.innerY + 1, T.WALL); }
    for (let x = 78; x <= 82; x++) { this.set(x, C.y1, T.FLOOR); this.set(x, C.innerY, T.GATE); this.set(x, C.innerY + 1, T.GATE); }
    for (let x = 78; x <= 82; x++) for (let y = C.y1; y <= 96; y++) if (this.t(x, y) === T.ISLE) this.set(x, y, T.FLOOR);
    // bridge rows (water in columns 78..82 between the island and the south shore)
    for (let y = 92; y < 115; y++) if (this.t(80, y) === T.WATER) this.bridgeRows.push(y);
    // --- objects ---
    this.place(R);
  }
  add(o) {
    o.id = this.objs.length; this.objs.push(o);
    if (o.solid) {
      const x0 = Math.floor((o.x + o.box[0]) / TS), x1 = Math.floor((o.x + o.box[2] - 0.01) / TS);
      const y0 = Math.floor((o.y + o.box[1]) / TS), y1 = Math.floor((o.y + o.box[3] - 0.01) / TS);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (x >= 0 && y >= 0 && x < N && y < N) (this.grid[y * N + x] || (this.grid[y * N + x] = [])).push(o); }
    }
    return o;
  }
  occupied(tx, ty) { return !!this.grid[ty * N + tx] || this.objs.some((o) => !o.solid && o.tx === tx && o.ty === ty); }
  place(R) {
    const at = (tx, ty, kind, extra = {}) => this.add(Object.assign({ kind, tx, ty, x: tx * TS + 8, y: ty * TS + 14, solid: true, box: [-6, -6, 6, 2] }, extra));
    // town buildings
    at(72, 125, 'house', { roof: 'r', box: [-24, -22, 24, 0], y: 126 * TS + 0 });
    at(88, 125, 'house', { roof: 'b', box: [-24, -22, 24, 0], y: 126 * TS + 0 });
    at(69, 136, 'house', { roof: 'g', box: [-24, -22, 24, 0], y: 137 * TS + 0 });
    at(91, 136, 'house', { roof: 'p', box: [-24, -22, 24, 0], y: 137 * TS + 0 });
    at(77, 128, 'workbench', { box: [-12, -6, 12, 2], interact: 'craft' });
    at(84, 129, 'stall', { box: [-16, -8, 16, 2], interact: 'shop' });
    at(80, 134, 'well', { box: [-8, -6, 8, 2] });
    at(83, 133, 'npc', { npc: 'sage', box: [-5, -5, 5, 2], interact: 'sage' });
    at(80, 124, 'sign', { box: [-6, -4, 6, 2], interact: 'sign', text: 'North: Moonlake + Foreman Bram. West: Whisperwood. East: Pebble Hills. Far north: Hollow Graves.' });
    for (let x = 66; x <= 94; x++) { if (Math.abs(x - 80) > 3 && x % 1 === 0 && (x < 74 || x > 86)) at(x, 142, 'fence', { box: [-8, -4, 8, 2] }); }
    // camp at the lake
    at(84, 110, 'npc', { npc: 'foreman', box: [-5, -5, 5, 2], interact: 'bridge' });
    at(76, 111, 'workbench', { box: [-12, -6, 12, 2], interact: 'craft' });
    at(86, 112, 'crate', { box: [-6, -6, 6, 2] }); at(87, 112, 'crate', { box: [-6, -6, 6, 2] }); at(86, 113, 'crate', { box: [-6, -6, 6, 2] });
    at(73, 109, 'sign', { box: [-6, -4, 6, 2], interact: 'sign', text: 'Bridge to the Shadow Castle. Talk to Foreman Bram to fund each stage.' });
    // castle decor
    for (const [x, y] of [[73, 82], [87, 82], [73, 87], [87, 87], [73, 72], [87, 72], [75, 76], [85, 76]]) at(x, y, 'pillar', { box: [-6, -4, 6, 2] });
    for (const [x, y] of [[72, 85], [88, 85], [76, 88], [84, 88]]) at(x, y, 'crystal', { box: [-5, -4, 5, 2] });
    at(80, 72, 'throne', { box: [-11, -8, 11, 2] });
    for (const [x, y] of [[77, 91], [83, 91], [77, 78], [83, 78]]) at(x, y, 'torch', { solid: false });
    // nature
    const nearTown = (x, y) => Math.hypot((x - TOWN.x) / 1.2, y - TOWN.y) < 11.5;
    const nearCamp = (x, y) => Math.hypot(x - CAMP.x, y - CAMP.y) < 7;
    let chests = 0;
    const chestSpots = [[50, 128], [30, 100], [22, 72], [44, 55], [60, 30], [100, 28], [112, 50], [135, 70], [130, 105], [108, 135], [56, 146], [140, 92], [96, 18], [28, 58]];
    for (const [x, y] of chestSpots) { if (this.walkableTile(x, y) && !this.grid[y * N + x]) { at(x, y, 'chest', { chest: chests++, interact: 'chest', box: [-6, -5, 6, 2] }); } }
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const tt = this.t(x, y), z = this.zones[y * N + x];
      if (this.grid[y * N + x] || nearTown(x, y) || nearCamp(x, y)) continue;
      if (!(tt === T.GRASS || tt === T.FOREST || tt === T.HILL || tt === T.GRAVE)) continue;
      const n = fbm(x * 0.13 + 3, y * 0.13 + 7), r = R();
      let ptree = { [Z.MEADOW]: 0.035, [Z.FOREST]: 0.08 + n * 0.32, [Z.HILLS]: 0.03, [Z.GRAVE]: 0.05 }[z] || 0;
      let prock = { [Z.MEADOW]: 0.012, [Z.FOREST]: 0.01, [Z.HILLS]: 0.055, [Z.GRAVE]: 0.025 }[z] || 0;
      let pore = { [Z.HILLS]: 0.022, [Z.GRAVE]: 0.012 }[z] || 0;
      const nearPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.t(x + a, y + b) === T.PATH);
      if (nearPath) { ptree *= 0.2; prock *= 0.3; }
      if (r < ptree) {
        const kind = z === Z.FOREST ? (R() < 0.45 ? 'pine' : 'forest') : z === Z.GRAVE ? (R() < 0.6 ? 'dead' : 'pine') : z === Z.HILLS ? (R() < 0.5 ? 'pine' : 'oak') : 'oak';
        at(x, y, 'tree', { tree: kind, variant: kind === 'oak' ? Math.floor(R() * 3) : 0, hp: 4, maxHp: 4, interact: 'chop', box: [-4, -5, 4, 2] });
      } else if (r < ptree + pore) at(x, y, 'rock', { ore: 1, hp: 4, maxHp: 4, interact: 'mine', box: [-6, -6, 6, 2] });
      else if (r < ptree + pore + prock) at(x, y, 'rock', { ore: 0, hp: 3, maxHp: 3, interact: 'mine', box: [-6, -6, 6, 2] });
      else if (r < ptree + pore + prock + 0.01 && z === Z.GRAVE) at(x, y, 'grave', { variant: R() < 0.5 ? 0 : 1, box: [-5, -6, 5, 2] });
      else if (r < ptree + pore + prock + 0.02 && z !== Z.GRAVE) at(x, y, 'bush', { variant: R() < 0.3 ? 1 : 0, solid: false, berry: true });
      else if (r < ptree + pore + prock + 0.03 && (z === Z.FOREST || z === Z.GRAVE)) at(x, y, 'mushroom', { variant: z === Z.GRAVE ? 1 : 0, solid: false });
    }
    // castle island rocks and shadow crystals outside the walls
    for (let y = 60; y < 100; y++) for (let x = 60; x < 100; x++) {
      if (this.t(x, y) !== T.ISLE || this.grid[y * N + x]) continue;
      if (Math.abs(x - 80) <= 3 && y > 88) continue;
      const r = R(); if (r < 0.05) at(x, y, 'crystal', { box: [-5, -4, 5, 2] }); else if (r < 0.08) at(x, y, 'tree', { tree: 'dead', hp: 4, maxHp: 4, interact: 'chop', box: [-4, -5, 4, 2] });
    }
  }
  walkableTile(x, y) {
    const t = this.t(x, y);
    if (t === T.DEEP || t === T.WATER || t === T.WALL) return false;
    if (t === T.GATE) return this.gateOpen;
    return true;
  }
  bridgeBuiltRows() { const n = this.bridgeRows.length; const k = Math.ceil(this.bridgeStage / 5 * n); return this.bridgeRows.slice(n - k); }
  solidAt(tx, ty) {
    const t = this.t(tx, ty);
    if (t === T.WATER && tx >= 78 && tx <= 82 && this.bridgeRows.includes(ty)) {
      const built = this.bridgeBuiltRows(); return !built.includes(ty);
    }
    return !this.walkableTile(tx, ty);
  }
  // world-space AABB collision test; returns true if box overlaps something solid
  hits(x0, y0, x1, y1, flying = false) {
    const tx0 = Math.floor(x0 / TS), tx1 = Math.floor(x1 / TS), ty0 = Math.floor(y0 / TS), ty1 = Math.floor(y1 / TS);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (flying) { const t = this.t(tx, ty); if (t === T.WALL || t === T.DEEP || (t === T.GATE && !this.gateOpen)) return true; continue; }
      if (this.solidAt(tx, ty)) return true;
      const g = this.grid[ty * N + tx];
      if (g) for (const o of g) { if (o.gone) continue; if (x1 > o.x + o.box[0] && x0 < o.x + o.box[2] && y1 > o.y + o.box[1] && y0 < o.y + o.box[3]) return true; }
    }
    return false;
  }
  // ---------- terrain pre-render ----------
  render() {
    const cv = document.createElement('canvas'); cv.width = N * TS; cv.height = N * TS;
    const ctx2 = cv.getContext('2d');
    // write pixels straight into a buffer (far faster than thousands of fillRect calls)
    const W = N * TS, buf = new Uint32Array(W * W), cc = new Map();
    const col = (hex) => { let v = cc.get(hex); if (v === undefined) { if (hex[0] === 'r') v = -1; else { const n = parseInt(hex.slice(1), 16); v = (0xFF000000 | ((n & 255) << 16) | (n & 0xFF00) | (n >> 16)) >>> 0; } cc.set(hex, v); } return v; };
    let cur = 0;
    const g = {
      set fillStyle(v) { cur = col(v); },
      fillRect(x, y, w, h) {
        x = Math.floor(x); y = Math.floor(y);
        for (let j = Math.max(0, y); j < Math.min(W, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
          const k = j * W + i;
          if (cur === -1) { const p = buf[k]; buf[k] = (0xFF000000 | ((((p >> 16) & 255) * 0.75) << 16) | ((((p >> 8) & 255) * 0.75) << 8) | ((p & 255) * 0.75)) >>> 0; }
          else buf[k] = cur;
        }
      },
    };
    const R = rng(99);
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const base = {
      [T.DEEP]: '#29366f', [T.WATER]: '#3b5dc9', [T.SAND]: '#f2d39b', [T.GRASS]: '#5cc05a', [T.FOREST]: '#3a9a50', [T.PATH]: '#d4a86a',
      [T.HILL]: '#8fb35a', [T.GRAVE]: '#6f7f5a', [T.ISLE]: '#4b4660', [T.FLOOR]: '#4a4a68', [T.WALL]: '#333c57', [T.TOWN]: '#c2b8a0', [T.GATE]: '#4a4a68',
    };
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const t = this.t(tx, ty), X = tx * TS, Y = ty * TS;
      g.fillStyle = base[t]; g.fillRect(X, Y, TS, TS);
      const h = (i) => hash(tx * 31 + i, ty * 17 + i * 7);
      if (t === T.GRASS || t === T.FOREST || t === T.HILL || t === T.GRAVE || t === T.ISLE) {
        const dark = { [T.GRASS]: '#45a84e', [T.FOREST]: '#2c7d44', [T.HILL]: '#79a04c', [T.GRAVE]: '#5c6b4b', [T.ISLE]: '#3a3550' }[t];
        const lite = { [T.GRASS]: '#8fdc6a', [T.FOREST]: '#5cb85c', [T.HILL]: '#b5cc72', [T.GRAVE]: '#8a9a70', [T.ISLE]: '#5d5878' }[t];
        // big soft patches for variation
        for (let by = 0; by < 16; by += 4) for (let bx = 0; bx < 16; bx += 4) { const f = fbm((X + bx) * 0.012, (Y + by) * 0.012); if (f > 0.55) { const dens = Math.min(0.55, (f - 0.55) * 4); for (let k = 0; k < 16; k++) if (hash(X + bx + (k & 3), Y + by + (k >> 2)) < dens) px(X + bx + (k & 3), Y + by + (k >> 2), dark); } }
        for (let i = 0; i < 4; i++) { const x = X + Math.floor(h(i) * 14), y = Y + Math.floor(h(i + 9) * 14); px(x, y, dark); px(x + 1, y - 1, dark); px(x + 2, y, dark); }
        for (let i = 0; i < 2; i++) { const x = X + Math.floor(h(i + 20) * 15), y = Y + Math.floor(h(i + 30) * 15); px(x, y, lite); }
        if (t === T.GRASS && h(50) < 0.12) { const x = X + 3 + Math.floor(h(51) * 10), y = Y + 3 + Math.floor(h(52) * 10); const c = ['#f4f4f4', '#ffcd75', '#ef7d57', '#73eff7'][Math.floor(h(53) * 4)]; px(x, y, c); px(x - 1, y, c); px(x + 1, y, c); px(x, y - 1, c); px(x, y + 1, c); px(x, y, '#ffcd75'); }
        if (t === T.HILL && h(60) < 0.18) { const x = X + 2 + Math.floor(h(61) * 11), y = Y + 2 + Math.floor(h(62) * 11); g.fillStyle = '#94b0c2'; g.fillRect(x, y, 2, 2); px(x + 1, y + 1, '#566c86'); }
        if (t === T.GRAVE && h(70) < 0.2) { const x = X + 3 + Math.floor(h(71) * 9), y = Y + 3 + Math.floor(h(72) * 9); g.fillStyle = '#5c4a3a'; g.fillRect(x, y, 5, 2); g.fillRect(x + 1, y - 1, 3, 4); g.fillStyle = '#4a3a2e'; g.fillRect(x + 1, y + 1, 2, 1); }
        if (t === T.ISLE && h(80) < 0.15) { const x = X + 3 + Math.floor(h(81) * 10), y = Y + 3 + Math.floor(h(82) * 10); px(x, y, '#8a4bd6'); }
      } else if (t === T.SAND) {
        for (let i = 0; i < 5; i++) px(X + Math.floor(h(i) * 16), Y + Math.floor(h(i + 5) * 16), i % 2 ? '#e0bd80' : '#fbe6bc');
      } else if (t === T.PATH) {
        for (let i = 0; i < 4; i++) px(X + Math.floor(h(i) * 16), Y + Math.floor(h(i + 5) * 16), i % 2 ? '#b8894f' : '#e8c48a');
        if (h(40) < 0.3) { const x = X + 3 + Math.floor(h(41) * 10), y = Y + 3 + Math.floor(h(42) * 10); g.fillStyle = '#a0a0a8'; g.fillRect(x, y, 2, 1); }
      } else if (t === T.TOWN) {
        for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 8) { const o = (y / 4) % 2 ? 4 : 0; g.fillStyle = '#a89c84'; g.fillRect(X + ((x + o) % 16), Y + y, 1, 4); g.fillRect(X, Y + y, 16, 1); }
        if (h(3) < 0.4) px(X + 2 + Math.floor(h(4) * 12), Y + 2 + Math.floor(h(5) * 12), '#d8d0b8');
      } else if (t === T.FLOOR || t === T.GATE) {
        g.fillStyle = '#3d3d58'; g.fillRect(X, Y + 15, 16, 1); g.fillRect(X + 15, Y, 1, 16);
        g.fillStyle = '#56567a'; g.fillRect(X, Y, 15, 1); g.fillRect(X, Y, 1, 15);
        if (h(9) < 0.2) { g.fillStyle = '#3d3d58'; g.fillRect(X + 4 + Math.floor(h(10) * 6), Y + 5, 3, 1); }
        if (ty < CASTLE.innerY && ty > CASTLE.y0 + 2 && tx >= 79 && tx <= 81) { g.fillStyle = '#7a2335'; g.fillRect(X, Y, TS, TS); g.fillStyle = '#b13e53'; g.fillRect(X, Y + 7, TS, 1); if (tx === 79) { g.fillStyle = '#f5b83d'; g.fillRect(X + 1, Y, 1, 16); } if (tx === 81) { g.fillStyle = '#f5b83d'; g.fillRect(X + 14, Y, 1, 16); } }
      } else if (t === T.WALL) {
        const capAbove = this.t(tx, ty - 1) !== T.WALL;
        for (let y = 0; y < 16; y += 4) { const o = (y / 4) % 2 ? 4 : 0; g.fillStyle = '#262c42'; g.fillRect(X, Y + y + 3, 16, 1); for (let x = o; x < 16; x += 8) g.fillRect(X + x, Y + y, 1, 4); }
        if (capAbove) { g.fillStyle = '#566c86'; g.fillRect(X, Y, 16, 4); g.fillStyle = '#94b0c2'; g.fillRect(X, Y, 16, 1); for (let x = 0; x < 16; x += 8) { g.fillStyle = '#333c57'; g.fillRect(X + x + 5, Y, 3, 2); } }
        if (this.t(tx, ty + 1) !== T.WALL) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X, Y + 14, 16, 2); }
      } else if (t === T.WATER || t === T.DEEP) {
        if (t === T.WATER) for (let i = 0; i < 2; i++) { const x = X + Math.floor(h(i) * 12), y = Y + Math.floor(h(i + 3) * 16); g.fillStyle = '#4a6ed4'; g.fillRect(x, y, 4, 1); }
        if (t === T.DEEP) { const x = X + Math.floor(h(1) * 12), y = Y + Math.floor(h(4) * 16); g.fillStyle = '#2f4080'; g.fillRect(x, y, 5, 1); }
      }
      // shorelines: water next to land
      if (t === T.WATER || t === T.DEEP) {
        const land = (x, y) => { const q = this.t(x, y); return q !== T.WATER && q !== T.DEEP; };
        g.fillStyle = t === T.DEEP ? '#41a6f6' : '#41a6f6';
        if (land(tx, ty - 1)) { g.fillRect(X, Y, 16, 3); g.fillStyle = '#73eff7'; g.fillRect(X, Y + 3, 16, 1); g.fillStyle = '#41a6f6'; }
        if (land(tx, ty + 1)) { g.fillRect(X, Y + 14, 16, 2); g.fillStyle = '#73eff7'; g.fillRect(X, Y + 13, 16, 1); g.fillStyle = '#41a6f6'; }
        if (land(tx - 1, ty)) { g.fillRect(X, Y, 2, 16); g.fillStyle = '#73eff7'; g.fillRect(X + 2, Y, 1, 16); g.fillStyle = '#41a6f6'; }
        if (land(tx + 1, ty)) { g.fillRect(X + 14, Y, 2, 16); g.fillStyle = '#73eff7'; g.fillRect(X + 13, Y, 1, 16); }
      }
      // grass fringe onto sand / path edges
      if (t === T.PATH || t === T.SAND || t === T.TOWN) {
        for (const [ox, oy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const q = this.t(tx + ox, ty + oy);
          if (q === T.GRASS || q === T.FOREST || q === T.HILL || q === T.GRAVE) {
            g.fillStyle = base[q];
            for (let i = 0; i < 16; i += 2) {
              const len = 1 + Math.floor(hash(tx * 7 + i, ty * 13 + ox * 3 + oy) * 3);
              if (oy === -1) g.fillRect(X + i, Y, 2, len); if (oy === 1) g.fillRect(X + i, Y + 16 - len, 2, len);
              if (ox === -1) g.fillRect(X, Y + i, len, 2); if (ox === 1) g.fillRect(X + 16 - len, Y + i, len, 2);
            }
          }
        }
      }
    }
    const id = ctx2.createImageData(W, W); new Uint32Array(id.data.buffer).set(buf); ctx2.putImageData(id, 0, 0);
    this.terrain = cv;
    return cv;
  }
}
