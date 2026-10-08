// scenes.js - painted illustrations: story panels, the title vista and the
// world map. Each is painted once into a canvas and cached.

import { rng, rgb, rgba, shade, mix, ellipsePts, P, wash, ink, inkPoly, splat, makeCanvas, paperTile, vignette, noise2, granulate } from './paint.js';
import { painter, unitSheet, towerSprite, SS } from './sprites.js';

const cache = new Map();

function canvasFor(w, h, scale) {
  const c = makeCanvas(w * scale, h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  return { c, g };
}

function paperBg(g, w, h, seed, tint) {
  g.fillStyle = g.createPattern(paperTile(512, seed), 'repeat');
  g.fillRect(0, 0, w, h);
  if (tint) { g.fillStyle = rgba(tint, 0.12); g.fillRect(0, 0, w, h); }
}
function sky(g, R, w, h, top, bottom, horizon) {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const y0 = (horizon / steps) * i;
    const col = mix(rgb(top), rgb(bottom), i / steps);
    wash(g, [{ x: -20, y: y0 - 10 }, { x: w + 20, y: y0 - 10 }, { x: w + 20, y: y0 + horizon / steps + 20 }, { x: -20, y: y0 + horizon / steps + 20 }], col, R, { layers: 6, alpha: 0.09, amt: 0.08, edge: 0, depth: 3 });
  }
}
function hills(g, R, w, y, amp, col, seed = 1) {
  const pts = [{ x: -20, y: y + 300 }];
  for (let x = -20; x <= w + 20; x += 40) pts.push({ x, y: y - Math.sin(x / 140 + seed) * amp - Math.sin(x / 61 + seed * 2) * amp * 0.3 });
  pts.push({ x: w + 20, y: y + 300 });
  wash(g, pts, col, R, { layers: 10, alpha: 0.11, amt: 0.04, edge: 0.6, depth: 2 });
}
function castle(p, x, y, s, col = '#c8beac', roof = '#3e64a8', dark = false) {
  const g = p.g;
  g.save(); g.translate(x, y); g.scale(s, s);
  const C = dark ? '#3a3246' : col, Rf = dark ? '#1e1828' : roof;
  p.poly([[-50, 0], [50, 0], [50, -40], [-50, -40]], C);
  for (const tx of [-50, 50]) { p.poly([[tx - 12, 0], [tx + 12, 0], [tx + 12, -70], [tx - 12, -70]], C); p.poly([[tx - 15, -70], [tx + 15, -70], [tx, -98]], Rf); }
  p.poly([[-14, -40], [14, -40], [14, -96], [-14, -96]], C);
  p.poly([[-18, -96], [18, -96], [0, -135]], Rf);
  p.line([[0, -135], [0, -150]], 1, '#4a3a2a');
  p.poly([[0, -150], [14, -146], [0, -142]], dark ? '#d8b24a' : '#c8443a', { shadow: false });
  p.poly([[-9, 0], [9, 0], [9, -20], [0, -27], [-9, -20]], dark ? '#d8b24a' : '#4a3424', { hi: false });
  for (const wx of [-30, 30]) p.poly([[wx - 3, -24], [wx + 3, -24], [wx + 3, -32], [wx - 3, -32]], dark ? '#d8b24a' : '#3a2e24', { hi: false, shadow: false });
  g.restore();
}
function figure(g, look, x, y, s, flip = false, frame = 0) {
  const sh = unitSheet(look);
  const fr = sh.walk[frame % sh.walk.length];
  g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
  g.drawImage(fr.c, -fr.ax, -fr.ay, fr.w, fr.h);
  g.restore();
}
function treeClump(p, R, x, y, n, cols, s = 1) {
  for (let i = 0; i < n; i++) {
    const tx = x + (R() - 0.5) * 60 * s, ty = y + (R() - 0.5) * 20 * s;
    p.limb(tx, ty, tx, ty - 10 * s, 3 * s, '#5a4430');
    p.ell(tx, ty - 18 * s, 11 * s, 10 * s, cols[i % cols.length], { w: 0.5, inkA: 0.6 });
  }
}

// ------------------------------------------------------------------ story panels
export function storyPanel(scene, scale = 2) {
  const key = scene + scale;
  if (cache.has(key)) return cache.get(key);
  const W = 760, H = 400;
  const { c, g } = canvasFor(W, H, scale);
  const R = rng(scene.length * 97 + scene.charCodeAt(0));
  const p = painter(g, R);
  paperBg(g, W, H, scene.length);
  switch (scene) {
    case 'vale': case 'repaint': case 'act1': {
      sky(g, R, W, H, '#a8c8e0', '#f2e6c8', 230);
      if (scene === 'repaint') for (let i = 0; i < 5; i++) wash(g, ellipsePts(120 + i * 130, 60 + (i % 2) * 30, 70, 26, 10), ['#f0a0a0', '#f0d080', '#a0d0a0', '#a0c0f0', '#d0a0f0'][i], R, { layers: 6, alpha: 0.06, amt: 0.4, edge: 0 });
      hills(g, R, W, 220, 30, '#9ab070', 1);
      hills(g, R, W, 270, 24, '#a8c27a', 3);
      castle(p, 560, 250, 0.8);
      hills(g, R, W, 330, 18, '#b5c983', 5);
      // river
      wash(g, [{ x: 0, y: 350 }, { x: 200, y: 320 }, { x: 420, y: 345 }, { x: 760, y: 310 }, { x: 760, y: 330 }, { x: 420, y: 365 }, { x: 200, y: 340 }, { x: 0, y: 372 }], '#7fb0c8', R, { layers: 8, alpha: 0.13, amt: 0.03, edge: 0.7 });
      treeClump(p, R, 120, 300, 6, ['#6f9a4a', '#5f8a42']);
      treeClump(p, R, 330, 290, 4, ['#8aab55', '#6f9a4a']);
      if (scene === 'vale') {
        // a giant brush resting across the sky
        g.save(); g.translate(150, 120); g.rotate(-0.35);
        p.poly([[0, -4], [220, -3], [220, 3], [0, 4]], '#a8723a');
        p.poly([[220, -6], [250, -7], [250, 7], [220, 6]], '#c8c0b0');
        p.poly([[250, -7], [300, -4], [315, 0], [300, 4], [250, 7]], '#6aa0d0');
        g.restore();
      }
      if (scene === 'act1') { figure(g, 'militia', 260, 380, 2.2); figure(g, 'inkling', 640, 380, 2.4, true); figure(g, 'inkling', 700, 372, 2, true, 2); }
      break;
    }
    case 'inkwell': {
      wash(g, P([[0, 0], [760, 0], [760, 400], [0, 400]]), '#5a4a3a', R, { layers: 6, alpha: 0.08, amt: 0.02, edge: 0 });
      // shelves
      for (const y of [110, 220]) { p.poly([[40, y], [720, y], [720, y + 10], [40, y + 10]], '#7a5a3c'); for (let i = 0; i < 9; i++) { const x = 70 + i * 72; const col = ['#c8443a', '#3e64a8', '#e8b33c', '#6aa84f', '#9a5ab8', '#d9844a'][i % 6]; p.poly([[x - 10, y], [x + 10, y], [x + 8, y - 30], [x - 8, y - 30]], col); p.poly([[x - 4, y - 30], [x + 4, y - 30], [x + 4, y - 38], [x - 4, y - 38]], '#8a6a48'); } }
      // the black inkwell on a pedestal
      p.poly([[330, 400], [430, 400], [415, 330], [345, 330]], '#a89e8c');
      p.ell(380, 300, 46, 34, '#1e1828');
      p.poly([[360, 270], [400, 270], [404, 252], [356, 252]], '#2a2236');
      p.poly([[352, 252], [408, 252], [404, 244], [356, 244]], '#d8b24a');
      p.glow(380, 300, 90, '#6a4a9a', 0.25);
      ink(g, P([[340, 290], [420, 290]]), R, { w: 0.6, color: 'rgba(200,160,240,0.5)' });
      break;
    }
    case 'gall': {
      wash(g, P([[0, 0], [760, 0], [760, 400], [0, 400]]), '#2a2238', R, { layers: 8, alpha: 0.12, amt: 0.02, edge: 0 });
      p.ell(600, 90, 46, 46, '#c8c4d8', { hi: false });
      p.glow(600, 90, 120, '#d8d4f0', 0.25);
      p.poly([[0, 300], [760, 300], [760, 400], [0, 400]], '#3a3246');
      p.ell(380, 300, 40, 30, '#1e1828');
      figure(g, 'shade', 300, 330, 3.2);
      p.glow(380, 290, 60, '#8a5ac8', 0.3);
      // crack of light from the seal
      ink(g, P([[372, 282], [386, 268], [380, 255], [394, 240]]), R, { w: 2, color: '#e0c0ff' });
      break;
    }
    case 'spill': {
      sky(g, R, W, H, '#7a7088', '#d8c8b0', 230);
      hills(g, R, W, 230, 26, '#9ab070', 2);
      hills(g, R, W, 300, 20, '#a8c27a', 4);
      castle(p, 140, 250, 0.6);
      // a river of ink pouring across the page
      for (let i = 0; i < 9; i++) splat(g, 420 + i * 40, 280 + Math.sin(i) * 30 + i * 6, 30 + i * 5, '#1e1828', R, { layers: 8, alpha: 0.1, drops: 5, squash: 0.5 });
      figure(g, 'inkling', 470, 360, 2.2, true); figure(g, 'brute', 560, 370, 1.7, true); figure(g, 'crow', 620, 200, 2, true); figure(g, 'scuttler', 420, 380, 2.4, true); figure(g, 'inkling', 680, 380, 2.2, true, 3);
      break;
    }
    case 'queen': {
      wash(g, P([[0, 0], [760, 0], [760, 400], [0, 400]]), '#8a3a3a', R, { layers: 6, alpha: 0.07, amt: 0.02, edge: 0 });
      for (const x of [120, 640]) { p.poly([[x - 26, 400], [x + 26, 400], [x + 22, 40], [x - 22, 40]], '#c8beac'); }
      p.poly([[260, 60], [500, 60], [500, 400], [260, 400]], '#a8352e', { hi: false });
      // throne
      p.poly([[330, 360], [430, 360], [430, 170], [380, 130], [330, 170]], '#d8b24a');
      // the queen (paladin colours, a crown)
      g.save(); g.translate(380, 360); g.scale(3.4, 3.4);
      const fr = unitSheet('paladin').walk[0];
      g.drawImage(fr.c, -fr.ax, -fr.ay, fr.w, fr.h);
      g.restore();
      p.poly([[372, 220], [370, 205], [377, 213], [382, 200], [387, 213], [394, 205], [392, 220]], '#f0c040');
      break;
    }
    case 'troll': {
      sky(g, R, W, H, '#a8c0d0', '#e8dcc0', 200);
      hills(g, R, W, 200, 20, '#9ab070', 2);
      wash(g, [{ x: 0, y: 260 }, { x: 760, y: 240 }, { x: 760, y: 400 }, { x: 0, y: 400 }], '#6f9ab8', R, { layers: 10, alpha: 0.12, amt: 0.03, edge: 0.6 });
      for (let i = 0; i < 8; i++) ink(g, P([[60 + i * 90, 300 + (i % 3) * 25], [100 + i * 90, 300 + (i % 3) * 25]]), R, { w: 0.8, color: 'rgba(255,255,255,0.7)' });
      splat(g, 380, 300, 60, '#e8f0f8', R, { layers: 6, alpha: 0.12, drops: 12, squash: 0.5 });
      g.save(); g.translate(380, 330); g.rotate(0.5); figure(g, 'troll', 0, 0, 1.2); g.restore();
      break;
    }
    case 'act2': {
      sky(g, R, W, H, '#9aa8a0', '#d8d8c0', 220);
      for (let i = 0; i < 4; i++) wash(g, ellipsePts(100 + i * 200, 200 + (i % 2) * 20, 160, 30, 12), '#e8e8e0', R, { layers: 6, alpha: 0.08, amt: 0.4, edge: 0 });
      hills(g, R, W, 250, 10, '#8a9a6a', 2);
      wash(g, ellipsePts(400, 320, 260, 50, 16), '#6f8a78', R, { layers: 10, alpha: 0.11, amt: 0.2, edge: 0.6 });
      for (let i = 0; i < 6; i++) { const x = 80 + i * 120; p.line([[x, 300], [x - 4, 250]], 1.2, '#5a4e3e'); p.line([[x - 2, 270], [x - 16, 256]], 1, '#5a4e3e'); }
      figure(g, 'ysolde', 220, 380, 3);
      figure(g, 'wraith', 560, 360, 2.6, true);
      break;
    }
    case 'matron': {
      wash(g, P([[0, 0], [760, 0], [760, 400], [0, 400]]), '#2a2a38', R, { layers: 8, alpha: 0.1, amt: 0.02, edge: 0 });
      p.glow(380, 140, 220, '#f0d8a0', 0.25);
      for (let i = 0; i < 40; i++) figure(g, 'moth', 120 + R() * 520, 60 + R() * 240, 0.8 + R() * 0.8, R() < 0.5, (R() * 6) | 0);
      break;
    }
    case 'act3': {
      sky(g, R, W, H, '#2a2236', '#8a6a6a', 230);
      hills(g, R, W, 260, 20, '#5a5264', 2);
      castle(p, 560, 270, 1.0, null, null, true);
      for (let i = 0; i < 5; i++) wash(g, ellipsePts(560 + (R() - 0.5) * 200, 60 + i * 20, 80, 20, 10), '#120e18', R, { layers: 6, alpha: 0.1, amt: 0.4, edge: 0 });
      hills(g, R, W, 330, 12, '#6a6074', 4);
      figure(g, 'moss', 160, 390, 3);
      figure(g, 'wren', 260, 390, 2.8);
      break;
    }
    case 'kingfall': {
      wash(g, P([[0, 0], [760, 0], [760, 400], [0, 400]]), '#3a3246', R, { layers: 8, alpha: 0.1, amt: 0.02, edge: 0 });
      p.glow(380, 220, 260, '#f0e0b0', 0.3);
      for (let i = 0; i < 12; i++) splat(g, 380 + (R() - 0.5) * 300, 300 + (R() - 0.5) * 60, 20 + R() * 30, '#1e1828', R, { layers: 6, alpha: 0.1, drops: 6 });
      p.poly([[350, 300], [362, 270], [376, 290], [388, 262], [402, 290], [414, 272], [420, 300]], '#d8b24a');
      break;
    }
    case 'bottle': {
      wash(g, P([[0, 0], [760, 0], [760, 400], [0, 400]]), '#6a5a48', R, { layers: 6, alpha: 0.08, amt: 0.02, edge: 0 });
      p.poly([[60, 150], [700, 150], [700, 162], [60, 162]], '#7a5a3c');
      p.poly([[330, 150], [430, 150], [436, 60], [324, 60]], '#d8e8f0', { inkA: 0.6 });
      p.poly([[330, 150], [430, 150], [432, 100], [328, 100]], '#1e1828');
      p.poly([[330, 60], [430, 60], [430, 44], [330, 44]], '#b08a5a');
      p.poly([[345, 120], [415, 120], [415, 140], [345, 140]], '#f3e9d2', { shadow: false });
      g.save(); g.font = '16px Fell, Georgia'; g.fillStyle = '#5a1e22'; g.textAlign = 'center'; g.fillText('DO NOT', 380, 135); g.restore();
      figure(g, 'moss', 180, 390, 3.2);
      break;
    }
  }
  vignette(g, W, H, 0.3);
  // deckled frame
  ink(g, P([[6, 6], [W - 6, 6], [W - 6, H - 6], [6, H - 6]]), R, { closed: true, w: 2, jitter: 0.6 });
  const out = { c, w: W, h: H };
  cache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ title vista
export function titleArt(scale = 2) {
  const key = 'title' + scale;
  if (cache.has(key)) return cache.get(key);
  const W = 1280, H = 720;
  const { c, g } = canvasFor(W, H, scale);
  const R = rng(4242);
  const p = painter(g, R);
  paperBg(g, W, H, 9);
  sky(g, R, W, H, '#9cc0dc', '#f4e6c4', 420);
  for (let i = 0; i < 6; i++) wash(g, ellipsePts(R() * W, 60 + R() * 200, 120 + R() * 80, 26, 12), '#fbf6ea', R, { layers: 6, alpha: 0.1, amt: 0.4, edge: 0.2 });
  hills(g, R, W, 400, 40, '#8aa86a', 1);
  castle(p, 220, 420, 1.15);
  hills(g, R, W, 470, 30, '#a3bd72', 3);
  treeClump(p, R, 420, 480, 8, ['#6f9a4a', '#5f8a42', '#8aab55'], 1.3);
  treeClump(p, R, 760, 480, 6, ['#6f9a4a', '#8aab55'], 1.2);
  hills(g, R, W, 560, 26, '#b5c983', 5);
  // the ink creeping in from the right
  for (let i = 0; i < 16; i++) splat(g, 1000 + R() * 320, 300 + R() * 420, 30 + R() * 60, '#1e1828', R, { layers: 6, alpha: 0.08 + R() * 0.05, drops: 6, squash: 0.6 });
  for (let i = 0; i < 7; i++) wash(g, ellipsePts(1180 + R() * 120, 100 + i * 100, 110, 80, 14), '#2a2236', R, { layers: 8, alpha: 0.06, amt: 0.35, edge: 0.4, depth: 3 });
  figure(g, 'wren', 300, 650, 4);
  figure(g, 'militia', 210, 660, 3.2, false, 2);
  figure(g, 'footman', 380, 668, 3.2, false, 4);
  figure(g, 'brute', 1000, 640, 3.4, true);
  figure(g, 'inkling', 900, 660, 3.6, true, 1);
  figure(g, 'inkling', 1100, 680, 3.2, true, 3);
  figure(g, 'crow', 950, 330, 3, true, 2);
  vignette(g, W, H, 0.35);
  const out = { c, w: W, h: H };
  cache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ world map
export function worldMapArt(levels, scale = 2) {
  const key = 'world' + scale;
  if (cache.has(key)) return cache.get(key);
  const W = 1280, H = 720;
  const { c, g } = canvasFor(W, H, scale);
  const R = rng(777);
  const p = painter(g, R);
  paperBg(g, W, H, 13, '#c8a86a');
  // sea around the edges
  wash(g, P([[0, 0], [1280, 0], [1280, 720], [0, 720]]), '#8ab4c8', R, { layers: 6, alpha: 0.08, amt: 0.02, edge: 0 });
  // land mass
  const land = [];
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; land.push({ x: 640 + Math.cos(a) * (560 + Math.sin(a * 3) * 30), y: 370 + Math.sin(a) * (310 + Math.cos(a * 4) * 20) }); }
  wash(g, land, '#e8d8b0', R, { layers: 14, alpha: 0.12, amt: 0.08, edge: 0.8, depth: 3 });
  // regions
  const region = (pts, col, a = 0.09) => wash(g, P(pts), col, R, { layers: 12, alpha: a, amt: 0.2, edge: 0.4, depth: 3 });
  region([[110, 330], [600, 230], [660, 420], [520, 620], [120, 620]], '#a8c27a');              // the Painted Vale
  region([[620, 300], [1180, 260], [1200, 600], [700, 640], [610, 460]], '#8a9a6a');            // the Drowned Marches
  region([[880, 90], [1150, 80], [1180, 260], [900, 260]], '#b8c4d0');                          // frost ridge
  region([[180, 60], [880, 40], [1000, 160], [820, 230], [520, 240], [200, 260]], '#6a5a6a', 0.1); // the north, inked
  // rivers
  for (const r of [[[300, 640], [320, 480], [380, 380], [560, 260], [700, 90]], [[700, 640], [760, 520], [880, 420], [1180, 380]]]) {
    ink(g, P(r), R, { w: 3.2, color: 'rgba(110,160,190,0.75)', jitter: 0.8 });
  }
  // mountains
  for (let i = 0; i < 14; i++) {
    const x = 1000 + R() * 180, y = 170 + R() * 110;
    p.poly([[x - 22, y], [x, y - 30 - R() * 10], [x + 22, y]], '#a8b0bc', { w: 0.6 });
    p.poly([[x - 7, y - 20], [x, y - 30], [x + 7, y - 20]], '#f6f8fa', { shadow: false, w: 0.3 });
  }
  // forests
  for (const [x, y, n, cols] of [[260, 520, 10, ['#6f9a4a', '#5f8a42']], [480, 420, 6, ['#d0803a', '#c25a30', '#e0a040']], [1080, 380, 12, ['#3f5f42', '#4a6a48']], [760, 560, 6, ['#5f7a48', '#6a8450']]]) treeClump(p, R, x, y, n, cols, 0.8);
  // ink lands in the north
  for (let i = 0; i < 18; i++) splat(g, 250 + R() * 750, 60 + R() * 150, 14 + R() * 26, '#1e1828', R, { layers: 5, alpha: 0.08, drops: 4, squash: 0.6 });
  // castles
  castle(p, 110, 600, 0.55);
  castle(p, 880, 110, 0.5, null, null, true);
  // compass
  const cx = 1170, cy = 640;
  ink(g, ellipsePts(cx, cy, 34, 34, 24), R, { closed: true, w: 1.2 });
  p.poly([[cx, cy - 44], [cx + 7, cy], [cx, cy + 44], [cx - 7, cy]], '#c8443a');
  p.poly([[cx - 44, cy], [cx, cy - 7], [cx + 44, cy], [cx, cy + 7]], '#e8dcc0');
  g.save(); g.font = '18px Fell, Georgia'; g.fillStyle = '#4a3a2a'; g.textAlign = 'center'; g.fillText('N', cx, cy - 50); g.restore();
  // region labels
  g.save(); g.fillStyle = 'rgba(74,58,42,0.75)'; g.textAlign = 'center';
  g.font = 'italic 26px Fell, Georgia';
  g.fillText('The Painted Vale', 330, 600);
  g.fillText('The Drowned Marches', 900, 610);
  g.fillText('The Hollow Crown', 560, 34);
  g.font = 'italic 18px Fell, Georgia';
  g.fillText('Castle Vellum', 110, 640);
  g.fillText('Ashgrave', 880, 140);
  g.restore();
  vignette(g, W, H, 0.4, [110, 80, 50]);
  const out = { c, w: W, h: H };
  cache.set(key, out);
  return out;
}
