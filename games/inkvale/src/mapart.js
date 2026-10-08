// mapart.js - paints a whole battlefield once, into one canvas.
//
// Order: paper -> ground washes -> water -> road -> bridges -> flora and set
// pieces (sorted by y so nearer things overlap farther ones) -> edge vignette.

import { rng, rgb, rgba, shade, mix, ellipsePts, P, wash, dab, ink, inkPoly, deform, tracePoly, traceSmooth, makeCanvas, paperTile, noise2, vignette, splat, granulate, INK } from './paint.js';
import { painter, bake } from './sprites.js';

// ------------------------------------------------------------------ flora sprites
// Trees and bushes are painted a handful of times per theme as one piece
// (crown and trunk merged, light from the upper left, a soft edge) and then
// stamped across the map at different sizes and flips.
const floraCache = new Map();
function floraSprite(kind, th, v) {
  const key = kind + th.trees.join() + v;
  if (floraCache.has(key)) return floraCache.get(key);
  const R = rng(v * 977 + kind.length * 31);
  let spr;
  const soft = { rimA: 0.45, rimW: 0.55, rimRGB: [40, 46, 34] };
  if (kind === 'tree') {
    spr = bake(56, 66, 28, 60, g => {
      const p = painter(g, R);
      const c = rgb(th.trees[v % th.trees.length]);
      const dark = shade(c, -0.28), light = shade(c, 0.22);
      p.limb(0, 0, 1, -18, 5, th.trunk);
      p.line([[1, -12], [-6, -20]], 1.6, th.trunk); p.line([[1, -14], [7, -22]], 1.4, th.trunk);
      // crown: dark under-blobs, mid body, light top-left blobs
      const blobs = [];
      for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2, d = R() * 10; blobs.push([Math.cos(a) * d * 1.2, -30 + Math.sin(a) * d * 0.8, 7 + R() * 5]); }
      p.shape(leafClump(0, -26, 17, 15, R, 15), dark);
      for (const [bx, by, br] of blobs) p.shape(leafClump(bx, by - 1, br, br * 0.8, R, 9), c);
      for (let i = 0; i < 4; i++) p.shape(leafClump(-5 + (R() - 0.6) * 10, -36 + (R() - 0.5) * 8, 3.5 + R() * 2.5, 3 + R() * 2, R, 7), light, { shadow: false });
      if (th.flowers && R() < 0.35 && th.trees[0] === '#6f9a4a') for (let i = 0; i < 5; i++) p.dot((R() - 0.5) * 20, -24 - R() * 16, 1.3, '#d04a3a');
    }, soft);
  } else if (kind === 'pine') {
    spr = bake(40, 66, 20, 60, g => {
      const p = painter(g, R);
      const c = rgb(th.trees[v % th.trees.length]);
      p.limb(0, 0, 0, -10, 3.6, th.trunk);
      for (let k = 0; k < 4; k++) {
        const w = 15 - k * 3.2, top = -8 - k * 10;
        p.poly([[-w, top], [w, top], [w * 0.15, top - 15], [0, top - 16], [-w * 0.15, top - 15]], k % 2 ? shade(c, 0.08) : c);
        p.poly([[-w, top], [-w * 0.1, top - 13], [0, top - 2]], shade(c, 0.2), { shadow: false });
        if (th.trees[0] === '#4a6a5a') p.poly([[-w * 0.7, top - 4], [0, top - 15], [w * 0.4, top - 6], [0, top - 7]], '#f4f7fa', { shadow: false });
      }
    }, soft);
  } else if (kind === 'bush' || kind === 'bigbush') {
    const k = kind === 'bigbush' ? 1.5 : 1;
    spr = bake(40 * k, 24 * k, 20 * k, 20 * k, g => {
      const p = painter(g, R);
      const c = rgb(th.trees[v % th.trees.length]);
      p.shape(leafClump(0, -6 * k, 14 * k, 7 * k, R, 14), shade(c, -0.15));
      for (let i = 0; i < 3; i++) p.shape(leafClump((i - 1) * 5 * k, -7 * k - (i % 2) * 2 * k, 6 * k, 4.8 * k, R, 8), c);
      p.shape(leafClump(-3 * k, -10 * k, 3.5 * k, 2.4 * k, R, 6), shade(c, 0.25), { shadow: false });
      if (R() < 0.4) for (let i = 0; i < 3; i++) p.dot((R() - 0.5) * 14 * k, -6 * k - R() * 5 * k, 1.1, th.flowers[0]);
    }, soft);
  } else if (kind === 'deadtree' || kind === 'burnttree') {
    const c = kind === 'burnttree' ? '#3a322c' : '#5a4e3e';
    spr = bake(44, 50, 22, 46, g => {
      const p = painter(g, R);
      p.limb(0, 0, -1, -26, 4.4, c);
      p.limb(-1, -16, -10, -26, 2.2, c); p.limb(-10, -26, -15, -26, 1.6, c);
      p.limb(0, -20, 9, -31, 2, c);
      p.limb(-1, -26, 2, -36, 1.6, c);
    }, soft);
  }
  floraCache.set(key, spr);
  return spr;
}
// a clump of foliage: a ragged star of leaf points, never a circle
function leafClump(cx, cy, rx, ry, R, n = 13) {
  const pts = [];
  const rot = R() * 6;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 ? 0.74 + R() * 0.08 : 0.95 + R() * 0.12;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}
// While a map is being painted, every cast shadow goes into this mask instead
// of onto the paint. The battle lays the mask over the ground AND over anyone
// standing in it, once, so overlapping shadows never double up.
let SHADOW_G = null;
export const SHADOW = { dx: -0.85, dy: -0.42 };   // light from the upper left
function stamp(g, spr, x, y, s, flip) {
  if (spr.sh && SHADOW_G) {
    const sg = SHADOW_G;
    sg.save(); sg.translate(x, y); sg.transform(1, 0, SHADOW.dx, SHADOW.dy, 0, 0); sg.scale(flip ? -s : s, s);
    sg.drawImage(spr.sh, -spr.ax, -spr.ay, spr.w, spr.h);
    sg.restore();
  }
  g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
  g.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
  g.restore();
}
import { W, H, distToRoads, inWater, pointAt } from './geo.js';

export const THEMES = {
  meadow: { ground: ['#b5c983', '#a3bd72', '#c9d494', '#94b066'], road: '#dcc596', roadEdge: '#a88a5a', water: '#7fb0c8', trees: ['#6f9a4a', '#5f8a42', '#8aab55'], trunk: '#6a4e34', flowers: ['#e05a5a', '#f0d060', '#f6f0e0', '#a07ad0'], density: 1, flora: ['tree', 'tree', 'bush', 'bush', 'tuft', 'tuft', 'tuft', 'flowers', 'rock'] },
  autumn: { ground: ['#c3b070', '#b89f5e', '#cdbd82', '#a9a462'], road: '#eadcb4', roadEdge: '#9a7a4a', water: '#7aa8b8', trees: ['#d0803a', '#c25a30', '#e0a040', '#a9702c'], trunk: '#5e4430', flowers: ['#c0402a', '#e8b040'], density: 1, flora: ['tree', 'tree', 'tree', 'bush', 'tuft', 'tuft', 'leaves', 'rock', 'pumpkin'] },
  lake: { ground: ['#b0c987', '#9fbf7a', '#c4d69a', '#8fb36e'], road: '#dcc79a', roadEdge: '#a88a5a', water: '#6fa6c4', trees: ['#5f9248', '#6fa050', '#4f8040'], trunk: '#6a4e34', flowers: ['#f6f0e0', '#f0d060', '#8ab0e0'], density: 0.9, flora: ['tree', 'bush', 'tuft', 'tuft', 'reeds', 'flowers', 'rock'] },
  swamp: { ground: ['#8f9e6c', '#7e9064', '#a0a676', '#6f8460'], road: '#b8a67e', roadEdge: '#7a6a4a', water: '#6f8a78', trees: ['#5f7a48', '#6a8450', '#506a40'], trunk: '#4e4232', flowers: ['#d8d080', '#c0e0a0'], density: 1, flora: ['deadtree', 'bush', 'reeds', 'reeds', 'tuft', 'tuft', 'lily', 'stump', 'tree'] },
  snow: { ground: ['#e9eef1', '#dbe4ea', '#f2f4f2', '#cad6e0'], road: '#cfc4b6', roadEdge: '#8f8478', water: '#a8c8dc', trees: ['#4a6a5a', '#3f5f50', '#5a7a68'], trunk: '#5a4636', flowers: ['#ffffff'], density: 0.9, flora: ['pine', 'pine', 'pine', 'rock', 'rock', 'snowtuft', 'drift'] },
  darkwood: { ground: ['#6a8160', '#5a7254', '#7a8e68', '#4f6650'], road: '#a8946e', roadEdge: '#6a5a40', water: '#4f6a70', trees: ['#3f5f42', '#4a6a48', '#355038'], trunk: '#3e3228', flowers: ['#c0a0f0', '#a0f0d0'], density: 1.0, flora: ['tree', 'tree', 'tree', 'bigbush', 'mushroom', 'tuft', 'fern', 'fern', 'stump'] },
  ash: { ground: ['#b3a690', '#a19480', '#c2b6a0', '#8f8472'], road: '#c8b89a', roadEdge: '#7a6a58', water: '#7a8a8a', trees: ['#5a5048', '#4a4038'], trunk: '#3a3028', flowers: ['#e06a30', '#f0a040'], density: 0.8, flora: ['burnttree', 'stump', 'rock', 'tuft', 'ember', 'ash', 'burnttree'] },
  castle: { ground: ['#a4a88e', '#969a80', '#b4b49a', '#8a8e78'], road: '#c6bca6', roadEdge: '#7a7264', water: '#5f7a88', trees: ['#5f7a50', '#6a8458'], trunk: '#4e4232', flowers: ['#c84a3a'], density: 0.7, flora: ['rock', 'rubble', 'tuft', 'bush', 'tree', 'rubble'] },
  waste: { ground: ['#5a5264', '#4c4556', '#6a6074', '#433c4c'], road: '#8c7c90', roadEdge: '#3a3040', water: '#1e1828', trees: ['#3a3448'], trunk: '#2a2430', flowers: ['#c060a0', '#8060c0'], density: 0.8, flora: ['crystal', 'rock', 'inkpool', 'bones', 'crystal', 'drip'] },
  throne: { ground: ['#4a4252', '#3e3746', '#564c5e', '#352f3c'], road: '#8a2e36', roadEdge: '#4a1a20', water: '#16121e', trees: ['#3a3448'], trunk: '#2a2430', flowers: ['#d8b24a'], density: 0.3, flora: ['rubble', 'rubble', 'drip', 'inkpool', 'candles'] },
};

const ROAD_W = 23; // half-width

export function paintMap(level, paths, slots, scale = 2, onProgress) {
  const th = THEMES[level.theme] || THEMES.meadow;
  const c = makeCanvas(W * scale, H * scale);
  const g = c.getContext('2d');
  const R = rng(level.seed * 101 + 7);
  g.save();
  g.scale(scale, scale);
  const shadowC = makeCanvas(W * scale, H * scale);
  SHADOW_G = shadowC.getContext('2d');
  SHADOW_G.scale(scale, scale);

  // 1. paper
  const paper = paperTile(512, level.seed);
  g.save();
  g.scale(1 / scale * 1.4, 1 / scale * 1.4);
  g.fillStyle = g.createPattern(paper, 'repeat');
  g.fillRect(0, 0, W * scale / 1.4 * 1.0 + 512, H * scale / 1.4 + 512);
  g.restore();

  // 2. ground: a base wash, then many overlapping blooms, then darker patches
  g.fillStyle = rgba(th.ground[0], 0.55);
  g.fillRect(0, 0, W, H);
  const nz = noise2(level.seed);
  for (let i = 0; i < 46; i++) {
    const x = R() * W, y = R() * H;
    const col = th.ground[(i % (th.ground.length - 1)) + 1];
    const r = 80 + R() * 160;
    wash(g, ellipsePts(x, y, r, r * (0.5 + R() * 0.3), 12, R() * 3), col, R, { layers: 9, alpha: 0.07, amt: 0.32, edge: 0.3, depth: 4, layerDepth: 2 });
  }
  const warm = { snow: '#c8d4e4', waste: '#6a3a6a', throne: '#5a2a3a', darkwood: '#3a5040', ash: '#8a6a50' }[level.theme] || '#d8c070';
  for (let i = 0; i < 8; i++) {
    const x = R() * W, y = R() * H, r = 90 + R() * 120;
    wash(g, ellipsePts(x, y, r, r * 0.55, 12, R() * 3), warm, R, { layers: 7, alpha: 0.05, amt: 0.35, edge: 0.2, depth: 4, layerDepth: 2 });
  }
  // soft light blooms (paper showing through)
  for (let i = 0; i < 10; i++) {
    const x = R() * W, y = R() * H, r = 60 + R() * 90;
    wash(g, ellipsePts(x, y, r, r * 0.6, 12), '#fbf6e6', R, { layers: 6, alpha: 0.06, amt: 0.35, edge: 0, depth: 4 });
  }
  if (level.theme === 'throne') paintFloor(g, R, th);
  if (level.theme === 'castle') { for (let i = 0; i < 14; i++) paving(g, R, R() * W, R() * H, 30 + R() * 50, th); }
  if (level.theme === 'waste') for (let i = 0; i < 20; i++) { const x = R() * W, y = R() * H; wash(g, ellipsePts(x, y, 40 + R() * 70, 20 + R() * 30, 9), '#2a2236', R, { layers: 6, alpha: 0.08, amt: 0.6, edge: 0.4 }); }
  onProgress?.(0.25);

  // 3. water
  for (const w of level.water || []) paintWater(g, R, w, th);
  onProgress?.(0.4);

  // 4. roads: paint all road bodies, then the edge inks, so junctions merge
  const roads = paths.filter(p => !p.air);
  for (const p of roads) roadBody(g, R, p, th, level);
  for (const p of roads) roadDetail(g, R, p, th, level, roads);
  // bridges where a road is over water
  for (const p of roads) bridges(g, R, p, level, th);
  // ink pools where the enemy comes in
  for (const p of roads) entryStain(g, R, p);
  for (const p of paths.filter(q => q.air)) airMarks(g, R, p);
  onProgress?.(0.6);

  // 5. flora + set pieces
  level._roads = roads;
  const items = [];
  for (const d of level.decor || []) items.push({ ...d, set: true });
  const tries = Math.round(900 * th.density);
  for (let i = 0; i < tries; i++) {
    const x = R() * (W + 40) - 20, y = 20 + R() * (H - 10);
    const kind = th.flora[Math.floor(R() * th.flora.length)];
    const big = ['tree', 'pine', 'deadtree', 'burnttree', 'bigbush', 'crystal'].includes(kind);
    // woods gather in clumps (noise) and thicken toward the page edges
    const clump = nz.fbm(x / 210 + 3, y / 210 + 7, 3);
    const edge = Math.min(x, W - x, y * 1.4, (H - y) * 1.4);
    const want = clump + (edge < 120 ? 0.18 : 0);
    // GROVES, NOT CONFETTI (2026-10-07): big things only where the noise
    // says wood, so the open ground reads as open ground; small stuff thins
    // out in the meadows instead of being sprinkled evenly over everything
    if (big && want < 0.57) continue;
    if (!big && want < 0.36 && R() < 0.75) continue;
    const keep = big ? 64 : 34;
    if (distToRoads(paths, x, y) < keep) continue;
    if (slots.some(s => Math.hypot(s.x - x, (s.y - y) * 1.3) < (big ? 58 : 34))) continue;
    if (inWater(level, x, y, big ? 14 : 4) && kind !== 'lily' && kind !== 'reeds') continue;
    if (kind === 'lily' && !inWater(level, x, y, -10)) continue;
    if ((level.decor || []).some(d => d.w ? (Math.abs(d.x - x) < d.w / 2 + 14 && Math.abs(d.y - y) < d.h / 2 + 14) : Math.hypot(d.x - x, d.y - y) < 46)) continue;
    // keep the HUD corners readable: fewer big things there
    if (big && ((x < 330 && y < 80) || (x < 360 && y > 630))) continue;
    items.push({ t: kind, x, y, s: big ? 0.85 + R() * 0.6 : 0.75 + R() * 0.5 });
  }
  items.sort((a, b) => a.y - b.y);
  const p = painter(g, R, { noInk: true });
  // set pieces (houses, mills, ruins, mountains...) are painted on a scratch
  // sheet first so their exact silhouette can be thrown as a shadow
  const FLAT = new Set(['field', 'orchard', 'reeds', 'bones', 'inkpool', 'drift', 'ash', 'lily', 'leaves', 'flowers', 'tuft', 'snowtuft', 'ember', 'drip', 'fern']);
  const scratch = makeCanvas(W * scale, H * scale);
  const scg = scratch.getContext('2d');
  for (const it of items) {
    if (!it.set || FLAT.has(it.t)) { drawItem(p, it, th, R, level); continue; }
    scg.setTransform(1, 0, 0, 1, 0, 0); scg.clearRect(0, 0, scratch.width, scratch.height);
    scg.setTransform(scale, 0, 0, scale, 0, 0);
    drawItem(painter(scg, R, { noInk: true }), it, th, R, level);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(scratch, 0, 0); g.restore();
    const yb = it.y * scale;
    SHADOW_G.save();
    SHADOW_G.setTransform(1, 0, SHADOW.dx, SHADOW.dy, -SHADOW.dx * yb, yb - SHADOW.dy * yb);
    SHADOW_G.filter = `blur(${(2.2 * scale).toFixed(1)}px)`;
    SHADOW_G.drawImage(scratch, 0, 0);
    SHADOW_G.restore();
  }
  onProgress?.(0.85);

  // 6. one light for the whole picture: warm glaze top-left, cool shade bottom-right
  const dark = ['throne', 'waste', 'darkwood'].includes(level.theme);
  g.save();
  g.globalCompositeOperation = 'soft-light';
  const lg = g.createLinearGradient(0, 0, W, H);
  lg.addColorStop(0, dark ? 'rgba(255,220,170,0.35)' : 'rgba(255,236,190,0.55)');
  lg.addColorStop(0.5, 'rgba(128,128,128,0)');
  lg.addColorStop(1, dark ? 'rgba(30,30,80,0.55)' : 'rgba(50,60,120,0.45)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply';
  const sg = g.createRadialGradient(W * 0.3, H * 0.25, 100, W * 0.5, H * 0.5, W * 0.85);
  sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(1, 'rgba(200,190,210,1)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  g.restore();

  // 7. vignette + deckled light at the edges
  vignette(g, W, H, level.theme === 'throne' || level.theme === 'waste' ? 0.5 : 0.28, level.theme === 'snow' ? [80, 90, 110] : [90, 60, 40]);
  g.restore();
  onProgress?.(1);
  c.shadow = shadowC;
  SHADOW_G = null;
  return c;
}

// ------------------------------------------------------------------ water
function paintWater(g, R, w, th) {
  const kind = w.lake?.[4];
  const col = kind === 'ice' ? '#bcd8e8' : kind === 'ink' ? '#1e1828' : th.water;
  if (w.lake) {
    const [cx, cy, rx, ry] = w.lake;
    const shape = ellipsePts(cx, cy, rx, ry, 18);
    // muddy bank
    wash(g, ellipsePts(cx, cy + 3, rx + 10, ry + 8, 18), kind === 'ink' ? '#3a3046' : '#8a7a5a', R, { layers: 8, alpha: 0.08, amt: 0.25, edge: 0.3 });
    const base = wash(g, shape, col, R, { layers: 16, alpha: 0.1, amt: 0.15, edge: 0.9, edgeW: 1.4 });
    // deeper middle
    wash(g, ellipsePts(cx + rx * 0.05, cy + ry * 0.1, rx * 0.6, ry * 0.55, 14), shade(rgb(col), -0.25), R, { layers: 8, alpha: 0.08, amt: 0.3, edge: 0 });
    // highlights / ripples
    g.save(); tracePoly(g, base); g.clip();
    for (let i = 0; i < Math.round(rx * ry / 900); i++) {
      const x = cx + (R() - 0.5) * rx * 1.6, y = cy + (R() - 0.5) * ry * 1.6;
      const l = 6 + R() * 18;
      ink(g, [{ x, y }, { x: x + l, y: y + (R() - 0.5) * 1.5 }], R, { w: 0.8, color: kind === 'ink' ? 'rgba(160,120,200,0.5)' : 'rgba(255,255,250,0.75)', jitter: 0.2 });
    }
    if (kind === 'ink') for (let i = 0; i < 6; i++) { const x = cx + (R() - 0.5) * rx, y = cy + (R() - 0.5) * ry; g.fillStyle = 'rgba(200,120,220,0.25)'; g.beginPath(); g.arc(x, y, 1.5 + R() * 2, 0, 7); g.fill(); }
    if (kind === 'ice') for (let i = 0; i < 5; i++) { const x = cx + (R() - 0.5) * rx, y = cy + (R() - 0.5) * ry; ink(g, [{ x, y }, { x: x + 10 * (R() - 0.5), y: y + 8 * (R() - 0.5) }, { x: x + 16 * (R() - 0.5), y: y + 10 * (R() - 0.5) }], R, { w: 0.5, color: 'rgba(90,120,150,0.6)' }); }
    g.restore();
    inkPoly(g, deform(base, 1, 0.05, R), R, { w: 1.1, jitter: 0.3, alpha: 0.55 });
  } else if (w.river) {
    const pts = w.river.map(q => ({ x: q[0], y: q[1] }));
    const half = w.w / 2;
    const dense = densify(pts, 10);
    const left = [], right = [];
    for (let i = 0; i < dense.length; i++) {
      const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const wob = half * (0.9 + Math.sin(i * 0.7) * 0.08);
      left.push({ x: dense[i].x - Math.sin(ang) * wob, y: dense[i].y + Math.cos(ang) * wob });
      right.push({ x: dense[i].x + Math.sin(ang) * wob, y: dense[i].y - Math.cos(ang) * wob });
    }
    const poly = [...left, ...right.reverse()];
    wash(g, poly.map(q => ({ x: q.x, y: q.y + 3 })), w.moat ? '#6a6458' : '#8a7a5a', R, { layers: 6, alpha: 0.08, amt: 0.04, edge: 0.3, depth: 1, layerDepth: 1 });
    const base = wash(g, poly, w.moat ? '#5f7a88' : th.water, R, { layers: 14, alpha: 0.11, amt: 0.03, edge: 0.9, edgeW: 1.3, depth: 1, layerDepth: 1 });
    g.save(); tracePoly(g, base); g.clip();
    // current lines
    for (let i = 2; i < dense.length - 2; i += 2) {
      const q = dense[i], n = dense[i + 1];
      const off = (R() - 0.5) * half * 1.2;
      const ang = Math.atan2(n.y - q.y, n.x - q.x);
      const ox = -Math.sin(ang) * off, oy = Math.cos(ang) * off;
      ink(g, [{ x: q.x + ox, y: q.y + oy }, { x: n.x + ox + (n.x - q.x), y: n.y + oy + (n.y - q.y) }], R, { w: 0.7, color: 'rgba(255,255,250,0.6)', jitter: 0.2 });
    }
    g.restore();
    ink(g, left, R, { w: 1, alpha: 0.5, jitter: 0.3 });
    ink(g, right, R, { w: 1, alpha: 0.5, jitter: 0.3 });
  }
}
function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------------ road
function roadOutline(p, half, R, wob = 0.12) {
  const left = [], right = [];
  for (let i = 0; i < p.pts.length; i += 3) {
    const q = p.pts[i];
    const w = half * (1 + Math.sin(i * 0.05) * wob + (R() - 0.5) * wob * 0.6);
    left.push({ x: q.x + q.nx * w, y: q.y + q.ny * w });
    right.push({ x: q.x - q.nx * w, y: q.y - q.ny * w });
  }
  return { left, right };
}
function roadBody(g, R, p, th, level) {
  // a soft dark halo, the trampled edge, then the dirt itself
  const outer = roadOutline(p, ROAD_W + 7, R, 0.2);
  wash(g, [...outer.left, ...outer.right.reverse()], shade(rgb(th.roadEdge), 0.1), R, { layers: 5, alpha: 0.09, amt: 0.015, edge: 0, depth: 1, layerDepth: 1 });
  const o = roadOutline(p, ROAD_W, R);
  const poly = [...o.left, ...o.right.slice().reverse()];
  wash(g, poly, th.road, R, { layers: 10, alpha: 0.16, amt: 0.01, edge: 0, depth: 1, layerDepth: 1 });
  // lighter centre
  const inner = roadOutline(p, ROAD_W * 0.55, R, 0.3);
  wash(g, [...inner.left, ...inner.right.reverse()], shade(rgb(th.road), 0.35), R, { layers: 5, alpha: 0.1, amt: 0.02, edge: 0, depth: 1, layerDepth: 1 });
  p._edges = o;
}
function roadDetail(g, R, p, th, level, roads) {
  const o = p._edges;
  // broken ink edges: draw in short runs, skipping bits, and skip where another road overlaps
  for (const side of [o.left, o.right]) {
    let run = [];
    const flush = () => { if (run.length > 2) ink(g, run, R, { w: 1.1, alpha: 0.32, jitter: 0.35, color: rgba(shade(rgb(th.roadEdge), -0.35), 1) }); run = []; };
    for (let i = 0; i < side.length; i++) {
      const q = side[i];
      const inside = roads.some(r => r !== p && nearDist(r, q.x, q.y) < ROAD_W - 2);
      const water = inWater(level, q.x, q.y, -2);
      if (inside || water || R() < 0.07) { flush(); continue; }
      run.push(q);
      if (run.length > 6 + R() * 10) flush();
    }
    flush();
  }
  // ruts and pebbles
  for (let i = 0; i < p.pts.length; i += 7) {
    const q = p.pts[i];
    if (inWater(level, q.x, q.y, 2)) continue;
    if (R() < 0.5) {
      const off = (R() - 0.5) * ROAD_W * 1.2;
      const x = q.x + q.nx * off, y = q.y + q.ny * off;
      const l = 4 + R() * 7;
      ink(g, [{ x, y }, { x: x + Math.cos(q.ang) * l, y: y + Math.sin(q.ang) * l }], R, { w: 0.6, alpha: 0.28, color: shade(rgb(th.roadEdge), -0.3).map(v => v | 0) && rgba(shade(rgb(th.roadEdge), -0.2), 1) });
    }
    if (R() < 0.35) {
      const off = (R() - 0.5) * ROAD_W * 1.7;
      g.fillStyle = rgba(shade(rgb(th.roadEdge), -0.1), 0.5);
      g.beginPath(); g.ellipse(q.x + q.nx * off, q.y + q.ny * off, 1 + R() * 1.6, 0.8 + R(), 0, 0, 7); g.fill();
    }
  }
  granulate(g, [...o.left, ...o.right.slice().reverse()], rgb(th.roadEdge), R, 0.5);
}
function nearDist(path, x, y) {
  let m = 1e9;
  for (let i = 0; i < path.pts.length; i += 3) { const q = path.pts[i]; const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < m) m = d; }
  return Math.sqrt(m);
}
function bridges(g, R, p, level, th) {
  // find runs of the road that sit over water
  let start = -1;
  const runs = [];
  for (let i = 0; i < p.pts.length; i += 2) {
    const q = p.pts[i];
    const wet = inWater(level, q.x, q.y, 2);
    if (wet && start < 0) start = i;
    if (!wet && start >= 0) { runs.push([start, i]); start = -1; }
  }
  if (start >= 0) runs.push([start, p.pts.length - 1]);
  const pp = painter(g, R);
  for (const [a, b] of runs) {
    const i0 = Math.max(0, a - 6), i1 = Math.min(p.pts.length - 1, b + 6);
    // planks
    for (let i = i0; i <= i1; i += 4) {
      const q = p.pts[i];
      const hw = ROAD_W + 3;
      const pts = [
        { x: q.x + q.nx * hw - Math.cos(q.ang) * 5.2, y: q.y + q.ny * hw - Math.sin(q.ang) * 5.2 },
        { x: q.x + q.nx * hw + Math.cos(q.ang) * 5.2, y: q.y + q.ny * hw + Math.sin(q.ang) * 5.2 },
        { x: q.x - q.nx * hw + Math.cos(q.ang) * 5.2, y: q.y - q.ny * hw + Math.sin(q.ang) * 5.2 },
        { x: q.x - q.nx * hw - Math.cos(q.ang) * 5.2, y: q.y - q.ny * hw - Math.sin(q.ang) * 5.2 },
      ];
      pp.shape(pts, i % 8 ? '#a07a52' : '#8e6a46', { hi: false, w: 0.4, shadow: false });
    }
    // rails
    for (const s of [1, -1]) {
      const rail = [];
      for (let i = i0; i <= i1; i += 3) { const q = p.pts[i]; rail.push({ x: q.x + q.nx * (ROAD_W + 4) * s, y: q.y + q.ny * (ROAD_W + 4) * s - 4 }); }
      ink(g, rail, R, { w: 2.2, color: '#5a4030', alpha: 0.9 });
      for (let i = i0; i <= i1; i += 12) { const q = p.pts[i]; const x = q.x + q.nx * (ROAD_W + 4) * s, y = q.y + q.ny * (ROAD_W + 4) * s; ink(g, [{ x, y: y - 4 }, { x, y: y + 4 }], R, { w: 1.6, color: '#4a3424' }); }
    }
  }
}
function entryStain(g, R, p) {
  // creeping ink where the road leaves the page
  for (let d = 0; d < Math.min(220, p.length); d += 24) {
    const q = pointAt(p, d);
    if (q.x < -20 || q.x > W + 20 || q.y < -20 || q.y > H + 20) continue;
    const k = 1 - d / 220;
    splat(g, q.x + (R() - 0.5) * 16, q.y + (R() - 0.5) * 10, 10 + k * 18, '#2a2236', R, { layers: 6, alpha: 0.06 + k * 0.06, drops: Math.round(k * 4), squash: 0.6 });
  }
}
function airMarks(g, R, p) {
  // faint dotted flight line, like a cartographer's note
  for (let d = 0; d < p.length; d += 18) {
    const q = pointAt(p, d);
    if (q.x < 10 || q.x > W - 10 || q.y < 10 || q.y > H - 10) continue;
    g.fillStyle = 'rgba(60,50,80,0.22)';
    g.beginPath(); g.arc(q.x, q.y, 1.4, 0, 7); g.fill();
  }
}

// ------------------------------------------------------------------ floors
function paintFloor(g, R, th) {
  // great hall flagstones
  for (let y = 0; y < H; y += 80) for (let x = (y / 80) % 2 ? -50 : 0; x < W; x += 100) {
    const pts = [{ x: x + 3, y: y + 3 }, { x: x + 97, y: y + 3 }, { x: x + 97, y: y + 77 }, { x: x + 3, y: y + 77 }];
    wash(g, pts, R() < 0.5 ? '#625870' : '#544a60', R, { layers: 3, alpha: 0.09, amt: 0.02, edge: 0.25, depth: 1, layerDepth: 1 });
  }
}
function paving(g, R, cx, cy, r, th) {
  for (let i = 0; i < 6; i++) {
    const x = cx + (R() - 0.5) * r * 2, y = cy + (R() - 0.5) * r;
    const w = 10 + R() * 12, h = 7 + R() * 6;
    wash(g, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], '#bab4a4', R, { layers: 3, alpha: 0.18, amt: 0.05, edge: 0.6, depth: 1, layerDepth: 1 });
  }
}

// ------------------------------------------------------------------ flora & set pieces
function drawItem(p, it, th, R, level) {
  const g = p.g;
  const { x, y } = it;
  const s = it.s ?? 1;
  const tree = th.trees;
  const sh = (rx, ry = rx * 0.35, a = 0.16) => p.wash(x + 3, y + 1, rx, ry, '#2a2a20', a);
  g.save();
  switch (it.t) {
    case 'tree': case 'pine': case 'bush': case 'bigbush': case 'deadtree': case 'burnttree': {
      const big = it.t === 'bigbush' ? 1.5 : 1;
      sh((it.t === 'tree' ? 20 : it.t === 'pine' ? 14 : 11 * big) * s, (it.t === 'tree' || it.t === 'pine' ? 6 : 3.5) * s, 0.2);
      stamp(g, floraSprite(it.t, th, Math.floor(R() * 6)), x, y, s * (it.t === 'tree' ? 0.95 : 1), R() < 0.5);
      if (it.t === 'burnttree' && R() < 0.4) p.glow(x, y - 4, 6, '#ff8040', 0.3);
      break;
    }
    case 'tuft': case 'snowtuft': {
      const c = it.t === 'snowtuft' ? '#7a8a80' : shade(rgb(tree[0]), -0.25);
      for (let k = -2; k <= 2; k++) p.line([[x + k * 1.5, y], [x + k * 2.6 + (R() - 0.5) * 2, y - (4 + R() * 4) * s]], 0.55, rgba(c, 0.85));
      break;
    }
    case 'flowers': {
      for (let k = 0; k < 6; k++) {
        const fx = x + (R() - 0.5) * 18, fy = y + (R() - 0.5) * 8;
        p.line([[fx, fy + 3], [fx, fy]], 0.4, '#4a6a3a');
        p.dot(fx, fy, 1.4, th.flowers[Math.floor(R() * th.flowers.length)], 0.9);
      }
      break;
    }
    case 'leaves': for (let k = 0; k < 5; k++) p.ell(x + (R() - 0.5) * 16, y + (R() - 0.5) * 6, 1.8, 1, th.trees[Math.floor(R() * 4)], { shadow: false, w: 0.3, rot: R() * 3 }); break;
    case 'pumpkin': sh(6, 2); p.ell(x, y - 3.5, 5.5, 4, '#e07a2a'); p.line([[x, y - 7.5], [x + 1, y - 10]], 0.9, '#4a6a3a'); break;
    case 'rock': case 'rubble': {
      sh(9 * s, 3);
      const c = level.theme === 'snow' ? '#9aa4ae' : level.theme === 'waste' ? '#3a3444' : '#a39c90';
      p.poly([[x - 8 * s, y], [x - 6 * s, y - 6 * s], [x + 1, y - 8 * s], [x + 7 * s, y - 4 * s], [x + 8 * s, y]], c, { w: 0.6 });
      if (it.t === 'rubble') p.poly([[x + 8 * s, y + 1], [x + 10 * s, y - 3 * s], [x + 14 * s, y - 2 * s], [x + 13 * s, y + 1]], c, { w: 0.5 });
      if (level.theme === 'snow') p.poly([[x - 6 * s, y - 6 * s], [x + 1, y - 8 * s], [x + 6 * s, y - 4.5 * s], [x, y - 5 * s]], '#f6f8fa', { shadow: false, w: 0.3 });
      break;
    }
    case 'drift': p.wash(x, y, 16 * s, 5 * s, '#ffffff', 0.35); break;
    case 'reeds': {
      for (let k = 0; k < 7; k++) {
        const rx = x + (R() - 0.5) * 14, h = 10 + R() * 10;
        p.line([[rx, y], [rx + (R() - 0.5) * 4, y - h]], 0.7, '#6a7a42');
        if (R() < 0.4) p.ell(rx + (R() - 0.5) * 2, y - h + 2, 1.2, 3, '#7a5432', { shadow: false, w: 0.3 });
      }
      break;
    }
    case 'lily': p.ell(x, y, 4.5, 2.4, '#6a9a4a', { shadow: false, w: 0.4 }); if (R() < 0.4) p.dot(x + 1, y - 1, 1.3, '#f0c0d0'); break;
    case 'stump': sh(6, 2); p.poly([[x - 5, y], [x - 4.5, y - 6], [x + 4.5, y - 6], [x + 5, y]], th.trunk); p.ell(x, y - 6, 4.5, 1.8, '#c8a878', { shadow: false, w: 0.4 }); break;
    case 'mushroom': {
      const c = R() < 0.5 ? '#c4473a' : '#b08ae0';
      p.line([[x, y], [x, y - 4]], 1.2, '#efe6d2');
      p.ell(x, y - 5, 4, 2.5, c);
      if (level.theme === 'darkwood') p.glow(x, y - 5, 10, c === '#c4473a' ? '#ff9a7a' : '#d0b0ff', 0.25);
      break;
    }
    case 'fern': for (let k = -3; k <= 3; k++) p.line([[x, y], [x + k * 3.5, y - 6 + Math.abs(k)]], 0.7, '#4f7a46'); break;
    case 'ember': p.glow(x, y, 5, '#ff7030', 0.35); p.dot(x, y, 1, '#ffb060'); break;
    case 'ash': p.wash(x, y, 10, 4, '#5a524a', 0.18); break;
    case 'crystal': {
      sh(8, 2.5);
      const c = R() < 0.5 ? '#8a6ab8' : '#b05a9a';
      p.poly([[x - 4, y], [x - 5, y - 12], [x - 1, y - 20], [x + 3, y - 11], [x + 4, y]], c, { w: 0.6 });
      p.poly([[x + 3, y], [x + 6, y - 9], [x + 9, y - 1]], shade(rgb(c), 0.2), { w: 0.5 });
      p.glow(x - 1, y - 10, 10, c, 0.25);
      break;
    }
    case 'inkpool': p.wash(x, y, 12 * s, 5 * s, '#1a1424', 0.4); p.line([[x - 3, y - 1], [x + 4, y - 1.5]], 0.5, 'rgba(200,160,240,0.5)'); break;
    case 'drip': p.wash(x, y, 4, 9, '#1a1424', 0.3); break;
    case 'bones': p.line([[x - 6, y], [x + 6, y - 2]], 1.6, '#e6dcc4'); p.dot(x - 6, y, 1.6, '#e6dcc4').dot(x + 6, y - 2, 1.6, '#e6dcc4'); p.ell(x + 10, y - 3, 3.5, 3, '#e6dcc4', { w: 0.4 }); break;
    case 'candles': for (let k = 0; k < 3; k++) { const cx = x + k * 5 - 5, h = 5 + k * 2; p.poly([[cx - 1.2, y], [cx + 1.2, y], [cx + 1.2, y - h], [cx - 1.2, y - h]], '#e8e0cc', { shadow: false, w: 0.3 }); p.glow(cx, y - h - 2, 6, '#ffd070', 0.5); p.dot(cx, y - h - 1.5, 0.8, '#ffe8a0'); } break;
    // ----- set pieces
    case 'house': case 'cabin': {
      sh(30, 8, 0.2);
      const wall = it.t === 'cabin' ? '#8a6a48' : '#e6dcc4', roof = it.t === 'cabin' ? '#e8eef2' : (R() < 0.5 ? '#a8523a' : '#c9a55a');
      p.poly([[x - 22, y], [x + 22, y], [x + 22, y - 20], [x - 22, y - 20]], wall);
      if (it.t !== 'cabin') { p.line([[x - 22, y - 10], [x + 22, y - 10]], 0.5, '#8a6a48'); p.line([[x - 8, y], [x - 8, y - 20]], 0.6, '#8a6a48'); }
      p.poly([[x - 27, y - 18], [x, y - 38], [x + 27, y - 18]], roof);
      p.poly([[x + 6, y], [x + 14, y], [x + 14, y - 12], [x + 6, y - 12]], '#5a4030', { hi: false });
      p.poly([[x - 16, y - 8], [x - 10, y - 8], [x - 10, y - 14], [x - 16, y - 14]], '#f0d878', { hi: false, shadow: false });
      p.limb(x + 12, y - 30, x + 12, y - 40, 4, '#8a7a6a');
      p.wash(x + 15, y - 48, 6, 4, '#d8d0c8', 0.3);
      break;
    }
    case 'stilthut': {
      sh(26, 6, 0.15);
      for (const k of [-14, -5, 5, 14]) p.limb(x + k, y, x + k, y - 14, 2, '#5a4636');
      p.poly([[x - 18, y - 14], [x + 18, y - 14], [x + 18, y - 28], [x - 18, y - 28]], '#8a7a5a');
      p.poly([[x - 22, y - 26], [x, y - 44], [x + 22, y - 26]], '#b8a060');
      p.poly([[x - 4, y - 14], [x + 4, y - 14], [x + 4, y - 24], [x - 4, y - 24]], '#3a2e24', { hi: false });
      p.glow(x - 12, y - 21, 6, '#ffd070', 0.4);
      break;
    }
    case 'windmill': {
      sh(26, 8, 0.2);
      p.poly([[x - 16, y], [x + 16, y], [x + 10, y - 50], [x - 10, y - 50]], '#e6dcc4');
      p.poly([[x - 13, y - 48], [x + 13, y - 48], [x, y - 64]], '#a8523a');
      p.poly([[x - 4, y], [x + 4, y], [x + 4, y - 12], [x - 4, y - 12]], '#5a4030', { hi: false });
      const hx = x, hy = y - 50;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        const ex = hx + Math.cos(a) * 36, ey = hy + Math.sin(a) * 36;
        p.line([[hx, hy], [ex, ey]], 1.2, '#6a4e34');
        const nx = -Math.sin(a) * 6, ny = Math.cos(a) * 6;
        p.poly([[hx + Math.cos(a) * 10, hy + Math.sin(a) * 10], [ex, ey], [ex + nx, ey + ny], [hx + Math.cos(a) * 10 + nx, hy + Math.sin(a) * 10 + ny]], '#efe6d0', { hi: false, w: 0.5 });
      }
      p.dot(hx, hy, 2.4, '#4a3424');
      break;
    }
    case 'field': {
      const w = it.w, h = it.h;
      const pts = [{ x: x - w / 2, y: y - h / 2 }, { x: x + w / 2, y: y - h / 2 }, { x: x + w / 2, y: y + h / 2 }, { x: x - w / 2, y: y + h / 2 }];
      wash(g, pts, R() < 0.5 ? '#d8c070' : '#b8a060', R, { layers: 6, alpha: 0.14, amt: 0.06, edge: 0.5, depth: 1, layerDepth: 1 });
      for (let k = 0; k < h; k += 7) ink(g, [{ x: x - w / 2 + 4, y: y - h / 2 + k + 3 }, { x: x + w / 2 - 4, y: y - h / 2 + k + 2 }], R, { w: 0.6, alpha: 0.4, color: '#8a6a3a' });
      break;
    }
    case 'orchard': {
      const w = it.w, h = it.h;
      for (let yy = y - h / 2; yy <= y + h / 2; yy += 34) for (let xx = x - w / 2; xx <= x + w / 2; xx += 36) {
        const tx = xx + (R() - 0.5) * 5, ty = yy + (R() - 0.5) * 5;
        p.wash(tx + 3, ty + 1, 13, 4, '#2a2a20', 0.15);
        p.limb(tx, ty, tx, ty - 10, 3.2, th.trunk);
        p.ell(tx, ty - 17, 11, 9, tree[Math.floor(R() * tree.length)], { w: 0.5, inkA: 0.6 });
        for (let k = 0; k < 3; k++) p.dot(tx + (R() - 0.5) * 14, ty - 13 - R() * 10, 1.4, level.theme === 'autumn' ? '#c8402a' : '#d04a3a');
      }
      break;
    }
    case 'willow': {
      sh(22);
      p.limb(x, y, x - 1, y - 20, 5, th.trunk);
      p.ell(x, y - 30, 18, 12, '#8aa85a', { w: 0.5 });
      for (let k = -16; k <= 16; k += 4) p.line([[x + k, y - 30], [x + k * 1.15, y - 8 + Math.abs(k) * 0.4]], 0.7, '#6a8a42');
      break;
    }
    case 'cart': sh(16, 4); p.poly([[x - 14, y - 6], [x + 12, y - 6], [x + 14, y - 16], [x - 14, y - 16]], '#8a6a48'); p.ell(x - 8, y - 4, 4.5, 4.5, '#6a4e34'); p.ell(x + 8, y - 4, 4.5, 4.5, '#6a4e34'); for (let k = 0; k < 4; k++) p.dot(x - 8 + k * 5, y - 18, 3, '#d04a3a'); break;
    case 'heron': p.line([[x, y], [x, y - 10]], 0.6, '#d8a050').line([[x + 2, y], [x + 1, y - 10]], 0.6, '#d8a050'); p.ell(x, y - 14, 5, 3.5, '#e8e8ec'); p.line([[x + 3, y - 16], [x + 5, y - 24], [x + 6, y - 25]], 1.2, '#e8e8ec'); p.line([[x + 6, y - 25], [x + 12, y - 24]], 0.8, '#d8a050'); break;
    case 'boat': p.poly([[x - 16, y - 4], [x + 16, y - 4], [x + 10, y + 3], [x - 10, y + 3]], '#8a6a48'); p.line([[x - 8, y - 4], [x + 6, y - 14]], 0.8, '#6a4e34'); break;
    case 'mountain': {
      p.wash(x + 10, y + 4, 90, 18, '#3a3a40', 0.12);
      p.poly([[x - 90, y], [x - 30, y - 80], [x - 10, y - 66], [x + 20, y - 100], [x + 90, y]], level.theme === 'snow' ? '#9aa6b4' : '#8a8478', { w: 0.9 });
      p.poly([[x - 44, y - 58], [x - 30, y - 80], [x - 16, y - 62], [x - 26, y - 58]], '#f6f8fa', { shadow: false, w: 0.5 });
      p.poly([[x + 2, y - 72], [x + 20, y - 100], [x + 40, y - 68], [x + 22, y - 74]], '#f6f8fa', { shadow: false, w: 0.5 });
      p.line([[x + 20, y - 100], [x + 10, y - 50], [x + 16, y - 20]], 0.5, '#6a7080');
      break;
    }
    case 'pines': for (let k = 0; k < 7; k++) drawItem(p, { t: 'pine', x: x + (k % 4) * 22 - 33 + (R() - 0.5) * 6, y: y + Math.floor(k / 4) * 22 - 10, s: 0.9 }, th, R, level); break;
    case 'bigtree': {
      p.wash(x + 6, y + 2, 46, 12, '#1a2018', 0.25);
      p.poly([[x - 12, y], [x + 12, y], [x + 8, y - 40], [x - 8, y - 40]], '#4a3a2c');
      for (const [bx, by, br, c] of [[0, -62, 34, '#2f4a33'], [-28, -48, 24, '#3a5a3c'], [28, -50, 26, '#2a4430'], [-10, -80, 22, '#3f6040'], [16, -76, 20, '#355238']]) p.ell(x + bx, y + by, br, br * 0.8, c, { w: 0.7, inkA: 0.6 });
      break;
    }
    case 'mushrooms': for (let k = 0; k < 6; k++) drawItem(p, { t: 'mushroom', x: x + (R() - 0.5) * 30, y: y + (R() - 0.5) * 14 }, th, R, level); break;
    case 'lanterns': for (let k = 0; k < 3; k++) { const lx = x + k * 14 - 14; p.line([[lx, y], [lx, y - 16]], 0.8, '#3a3028'); p.ell(lx, y - 18, 2.4, 3, '#e8c060'); p.glow(lx, y - 18, 12, '#ffd070', 0.35); } break;
    case 'ruin': {
      sh(30, 8);
      p.poly([[x - 26, y], [x - 26, y - 34], [x - 20, y - 38], [x - 16, y - 28], [x - 10, y - 30], [x - 10, y]], '#a8a090');
      p.poly([[x + 2, y], [x + 2, y - 22], [x + 10, y - 26], [x + 14, y - 18], [x + 26, y - 20], [x + 26, y]], '#9a9282');
      stoneLines(p, x - 26, y - 30, x - 10, y);
      p.poly([[x - 8, y], [x - 4, y - 6], [x + 2, y - 3], [x + 4, y]], '#8a8274');
      p.wash(x - 18, y - 30, 6, 3, '#4a6a3a', 0.35);
      break;
    }
    case 'burnt': sh(28, 8); p.poly([[x - 22, y], [x + 22, y], [x + 18, y - 14], [x + 6, y - 22], [x - 4, y - 12], [x - 16, y - 18]], '#4a3e36'); p.line([[x - 18, y - 6], [x + 16, y - 10]], 0.8, '#2a2220'); p.glow(x, y - 8, 14, '#ff7030', 0.2); p.wash(x + 4, y - 34, 10, 6, '#8a8480', 0.2); break;
    case 'scarecrow': p.line([[x, y], [x, y - 26]], 1.2, '#6a4e34').line([[x - 10, y - 18], [x + 10, y - 18]], 1, '#6a4e34'); p.ell(x, y - 28, 4.5, 4.5, '#d8b860'); p.poly([[x - 7, y - 30], [x + 7, y - 30], [x, y - 37]], '#5a4a3a'); p.poly([[x - 8, y - 19], [x + 8, y - 19], [x + 6, y - 8], [x - 6, y - 8]], '#8a5a4a'); break;
    case 'castlewall': {
      p.wash(x - 10, y + 10, 60, 30, '#2a2a30', 0.2);
      p.poly([[x - 40, y - 330], [x + 60, y - 330], [x + 60, y + 330], [x - 40, y + 330]], '#8a8478', { w: 1 });
      for (let yy = y - 320; yy < y + 330; yy += 40) p.poly([[x - 50, yy], [x - 34, yy], [x - 34, yy + 22], [x - 50, yy + 22]], '#7a7468', { hi: false });
      stoneLines(p, x - 40, y - 330, x + 60, y + 330, 26);
      p.poly([[x - 40, y - 34], [x - 40, y + 30], [x - 16, y + 30], [x - 16, y - 34]], '#2a2228', { hi: false });
      break;
    }
    case 'banner': p.line([[x, y], [x, y - 40]], 1.2, '#3a3028'); p.poly([[x, y - 40], [x + 16, y - 38], [x + 14, y - 22], [x + 16, y - 10], [x, y - 14]], '#5a1e22'); p.dot(x + 8, y - 26, 2.4, '#d8b24a'); break;
    case 'spire': p.wash(x + 4, y + 2, 20, 6, '#000000', 0.2); p.poly([[x - 12, y], [x - 4, y - 70], [x + 2, y - 90], [x + 6, y - 66], [x + 12, y]], '#2a2434', { w: 0.9 }); p.glow(x, y - 60, 12, '#c060a0', 0.3); p.line([[x - 6, y - 30], [x + 4, y - 50]], 0.7, '#c060a0'); break;
    case 'throne': {
      p.wash(x, y + 10, 70, 30, '#000000', 0.3);
      p.poly([[x - 50, y + 40], [x + 60, y + 40], [x + 60, y - 40], [x - 50, y - 40]], '#3a2e44');
      p.poly([[x - 20, y + 10], [x + 30, y + 10], [x + 30, y - 90], [x + 5, y - 120], [x - 20, y - 90]], '#2a2232', { w: 1 });
      p.poly([[x - 14, y + 10], [x + 24, y + 10], [x + 24, y - 20], [x - 14, y - 20]], '#5a1e22');
      for (const k of [-20, 30]) p.dot(x + k, y - 90, 4, '#d8b24a');
      p.glow(x + 5, y - 60, 40, '#d8b24a', 0.12);
      for (let k = 0; k < 5; k++) p.wash(x - 10 + k * 8, y - 100 + k * 18, 4, 12, '#0e0a14', 0.4);
      break;
    }
    case 'pillar': {
      p.wash(x + 4, y + 2, 18, 6, '#000000', 0.3);
      p.poly([[x - 12, y], [x + 12, y], [x + 12, y - 6], [x - 12, y - 6]], '#6a6070');
      p.poly([[x - 8, y - 6], [x + 8, y - 6], [x + 8, y - 70], [x - 8, y - 70]], '#7a7080');
      for (const k of [-4, 0, 4]) p.line([[x + k, y - 8], [x + k, y - 68]], 0.4, '#4a4250');
      p.poly([[x - 13, y - 70], [x + 13, y - 70], [x + 11, y - 78], [x - 11, y - 78]], '#6a6070');
      p.wash(x - 2, y - 74, 8, 16, '#120e18', 0.35);
      break;
    }
    case 'gate': {
      // the kingdom's own gate: two turrets either side of the road
      let best = null;
      for (const path of level._roads || []) for (const q of path.pts) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (!best || d < best.d) best = { d, q }; }
      const q = best ? best.q : { x, y, nx: 0, ny: 1 };
      for (const side of [-1, 1]) {
        const tx = q.x + q.nx * (ROAD_W + 15) * side, ty = q.y + q.ny * (ROAD_W + 15) * side;
        p.wash(tx + 4, ty + 2, 16, 5, '#2a2a20', 0.2);
        p.poly([[tx - 11, ty], [tx + 11, ty], [tx + 10, ty - 34], [tx - 10, ty - 34]], '#c8beac');
        stoneLines(p, tx - 10, ty - 34, tx + 10, ty, 4);
        crenelsAt(p, tx - 13, tx + 13, ty - 34, '#b0a692', 3);
        p.poly([[tx - 2.5, ty - 18], [tx + 2.5, ty - 18], [tx + 2.5, ty - 26], [tx - 2.5, ty - 26]], '#3a2e24', { hi: false, shadow: false });
        p.line([[tx, ty - 40], [tx, ty - 56]], 0.9, '#4a3a2a');
        p.poly([[tx, ty - 56], [tx + 12, ty - 53], [tx, ty - 49]], '#3e64a8', { shadow: false });
      }
      break;
    }
  }
  g.restore();
}
function stoneLines(p, x0, y0, x1, y1, rows = 5) {
  const h = (y1 - y0) / rows;
  for (let r = 1; r < rows; r++) p.line([[x0 + 1, y0 + r * h], [x1 - 1, y0 + r * h]], 0.35, 'rgba(80,70,60,0.5)');
}
function crenelsAt(p, x0, x1, y, col, n = 5) {
  const w = (x1 - x0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) p.poly([[x0 + i * 2 * w, y], [x0 + i * 2 * w + w, y], [x0 + i * 2 * w + w, y - 6], [x0 + i * 2 * w, y - 6]], col, { hi: false });
}
