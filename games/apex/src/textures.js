// =====================================================================
// APEX :: textures.js - SURFACES, PAINTED IN CODE
// =====================================================================
//
// Liam: "there is a lack of detailed texture". A flat grey road, a flat
// green field and a flat red kerb are three colours, not three surfaces,
// and at 300 km/h the eye reads speed almost entirely off the texture
// rushing past - a flat road does not look fast however fast it is.
//
// Every texture here is drawn on a canvas when the game starts: no image
// files to ship, and each is sized so that it repeats every few metres in
// the world rather than stretching over a kilometre. They are cached, so
// five circuits share one asphalt.
//
// ALL OF THEM TILE. A texture that does not wrap cleanly draws a visible
// seam every repeat, which on a road is a line across the track every
// eight metres. The noise wraps its lattice, and anything placed near an
// edge is drawn again on the opposite edge.
import * as THREE from '../vendor/three.module.js';

const cache = new Map();
let anisotropy = 8;
/** main.js tells us what the GPU can do, so road texture stays sharp at a glancing angle */
export function setAnisotropy(a) { anisotropy = a; }

function rng(seed) {
  let s = seed | 0 || 1;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** value noise on a lattice that wraps every `period` cells */
function tileNoise(period, seed) {
  const r = rng(seed), g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (a, b) => g[((b % period) + period) % period * period + ((a % period) + period) % period];
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** per-pixel shading by a few octaves of wrapping noise */
function noiseFill(g, w, h, octaves, seed, fn) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const ns = octaves.map((o, k) => ({ f: tileNoise(o.period, seed + k * 101), o }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const { f, o } of ns) v += (f(x / w * o.period, y / h * o.period) - 0.5) * o.amp;
      const i = (y * w + x) * 4;
      fn(d, i, v, x, y);
    }
  }
  g.putImageData(img, 0, 0);
}

/** scatter small dots, drawn again across any edge they touch so the tile wraps */
function speckle(g, w, h, count, seed, colour, size) {
  const r = rng(seed);
  for (let k = 0; k < count; k++) {
    const x = r() * w, y = r() * h, s = size[0] + r() * (size[1] - size[0]);
    g.fillStyle = typeof colour === 'function' ? colour(r) : colour;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox < -s || x + ox > w + s || y + oy < -s || y + oy > h + s) continue;
      g.fillRect(x + ox, y + oy, s, s);
    }
  }
}

const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// ---------------------------------------------------------------------
// ASPHALT - one tile is 8 x 8 metres
// ---------------------------------------------------------------------
export const asphalt = () => once('asphalt', () => {
  const S = 1024, [c, g] = canvas(S, S);
  g.fillStyle = '#56585c'; g.fillRect(0, 0, S, S);
  // blotches of older and newer surface, then grain
  noiseFill(g, S, S, [{ period: 4, amp: 22 }, { period: 16, amp: 14 }, { period: 128, amp: 10 }], 7, (d, i, v) => {
    d[i] += v; d[i + 1] += v; d[i + 2] += v * 1.05;
  });
  // the aggregate: pale stones and dark bitumen, a few pixels each
  speckle(g, S, S, 26000, 11, (r) => `rgba(${150 + r() * 60},${150 + r() * 55},${148 + r() * 50},${0.25 + r() * 0.35})`, [1, 2.4]);
  speckle(g, S, S, 30000, 13, (r) => `rgba(20,21,24,${0.25 + r() * 0.35})`, [1, 2.6]);
  // a couple of sealed cracks, the tar lines every real circuit has
  const r = rng(99);
  g.strokeStyle = 'rgba(18,18,20,0.55)'; g.lineWidth = 2.2;
  for (let k = 0; k < 3; k++) {
    let x = r() * S, y = r() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (r() - 0.5) * 90; y += 20 + r() * 40; g.lineTo(x, y % S); if (y > S) { y -= S; g.moveTo(x, y); } }
    g.stroke();
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// KERB - u across the kerb, v along it; one tile is one red and one white
// ---------------------------------------------------------------------
export const kerb = () => once('kerb', () => {
  const W = 64, H = 256, [c, g] = canvas(W, H);
  g.fillStyle = '#c8302a'; g.fillRect(0, 0, W, H / 2);
  g.fillStyle = '#ecebe6'; g.fillRect(0, H / 2, W, H / 2);
  // the ridges moulded into it, lit from above: a light and a dark line
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y, W, 3);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y + 10, W, 3);
  }
  // rubber off the tyres, heaviest on the side nearest the track
  noiseFill(g, W, H, [{ period: 8, amp: 30 }, { period: 32, amp: 18 }], 21, (d, i, v, x) => {
    const wear = Math.max(0, 1 - x / W) * 0.28 + Math.max(0, v) * 0.004;
    d[i] = d[i] * (1 - wear) + 30 * wear; d[i + 1] = d[i + 1] * (1 - wear) + 30 * wear; d[i + 2] = d[i + 2] * (1 - wear) + 32 * wear;
  });
  return finish(c);
});

// ---------------------------------------------------------------------
// GRASS - mown turf, one tile is 6 x 6 metres; tinted by the material
// ---------------------------------------------------------------------
export const grass = () => once('grass', () => {
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, [{ period: 4, amp: 40 }, { period: 16, amp: 30 }, { period: 64, amp: 26 }], 31, (d, i, v) => {
    d[i] += v; d[i + 1] += v * 1.1; d[i + 2] += v * 0.8;
  });
  // MOWN STRIPES. Everything above is detail you can only see from a metre
  // away; from a car it averages into one flat green, which is why the
  // infield of a circuit used to read as a painted sheet. A mower leaves
  // the grass lying one way and then the other, and those bands are the
  // only thing on a lawn that survives being looked at from four hundred
  // metres - they are low-frequency, so the mipmaps keep them long after
  // every blade has blurred away. Two bands per tile, so about three and a
  // half metres each, which is roughly a real gang mower.
  const band = g.createLinearGradient(0, 0, S, 0);
  for (let i = 0; i <= 8; i++) {
    const up = i % 2 === 0;
    band.addColorStop(i / 8, up ? 'rgba(255,255,240,0.10)' : 'rgba(0,26,6,0.10)');
  }
  g.fillStyle = band;
  g.fillRect(0, 0, S, S);

  // blades: short strokes in lighter and darker
  const r = rng(33);
  for (let k = 0; k < 9000; k++) {
    const x = r() * S, y = r() * S, l = 3 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,230,${0.08 + r() * 0.12})` : `rgba(0,20,0,${0.08 + r() * 0.14})`;
    g.lineWidth = 1;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -10 || x + ox > S + 10 || y + oy < -10 || y + oy > S + 10) continue;
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
    }
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// GRAVEL - a trap, one tile is 4 x 4 metres
// ---------------------------------------------------------------------
export const gravel = () => once('gravel', () => {
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#b09a78'; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, [{ period: 8, amp: 26 }, { period: 32, amp: 14 }], 41, (d, i, v) => { d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9; });
  speckle(g, S, S, 22000, 43, (r) => { const k = 90 + r() * 110; return `rgba(${k + 20},${k + 8},${k - 12},0.9)`; }, [1.5, 4]);
  speckle(g, S, S, 9000, 45, 'rgba(50,40,30,0.45)', [1, 2.5]);
  return finish(c);
});

// ---------------------------------------------------------------------
// CONCRETE - wall panels, one tile is 6 m long and 1.2 m tall
// ---------------------------------------------------------------------
export const concrete = () => once('concrete', () => {
  const W = 512, H = 128, [c, g] = canvas(W, H);
  g.fillStyle = '#a9aaa6'; g.fillRect(0, 0, W, H);
  noiseFill(g, W, H, [{ period: 8, amp: 16 }, { period: 32, amp: 10 }], 51, (d, i, v, x, y) => {
    // rain streaks run down from the top
    const streak = Math.max(0, v) * (1 - y / H) * 0.6;
    d[i] += v - streak; d[i + 1] += v - streak; d[i + 2] += v - streak;
  });
  speckle(g, W, H, 2500, 53, 'rgba(60,60,60,0.25)', [1, 2]);
  // the joint between two panels, and a painted top edge
  g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(0, 0, 3, H);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(3, 0, 2, H);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, H - 6, W, 6);
  return finish(c);
});

// ---------------------------------------------------------------------
// ARMCO - one tile is 4 m of rail; v across the rail's height
// ---------------------------------------------------------------------
export const armco = () => once('armco', () => {
  const W = 256, H = 64, [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  // the W-beam profile: two bright crowns and a dark trough between
  [[0, '#6e757c'], [0.18, '#d6dbe0'], [0.36, '#8d949b'], [0.5, '#4f555c'], [0.64, '#8d949b'], [0.82, '#d6dbe0'], [1, '#6e757c']]
    .forEach(([s, col]) => grad.addColorStop(s, col));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  noiseFill(g, W, H, [{ period: 16, amp: 18 }], 61, (d, i, v) => { d[i] += v; d[i + 1] += v; d[i + 2] += v; });
  // bolts where two lengths overlap
  g.fillStyle = '#3a3f45';
  for (const y of [H * 0.3, H * 0.7]) for (const x of [6, 18]) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
  return finish(c);
});

// ---------------------------------------------------------------------
// ADVERTISING - a strip of hoardings, one tile is 24 m; all names invented
// ---------------------------------------------------------------------
const BRANDS = [
  { t: 'NORTHLINE', bg: '#0e2a4a', fg: '#ffffff', acc: '#39b3ff' },
  { t: 'APEX', bg: '#e03a2f', fg: '#ffffff', acc: '#1b1b1b' },
  { t: 'KESTREL OIL', bg: '#f2c230', fg: '#1a1a1a', acc: '#c0392b' },
  { t: 'VOLTA', bg: '#1b1b1b', fg: '#7dff6a', acc: '#7dff6a' },
  { t: 'HALCYON AIR', bg: '#ffffff', fg: '#113a7a', acc: '#e03a2f' },
  { t: 'PLAYPILE', bg: '#07090d', fg: '#ff9f43', acc: '#ff9f43' },
  { t: 'MERIDIAN', bg: '#5a1d7a', fg: '#ffffff', acc: '#ffcc33' },
  { t: 'TORQUE', bg: '#d8dde3', fg: '#20242a', acc: '#e03a2f' },
];
export const adverts = () => once('adverts', () => {
  const W = 2048, H = 128, [c, g] = canvas(W, H);
  const each = W / BRANDS.length;
  BRANDS.forEach((b, k) => {
    const x = k * each;
    g.fillStyle = b.bg; g.fillRect(x, 0, each, H);
    g.fillStyle = b.acc; g.fillRect(x, H - 14, each, 14);
    g.fillStyle = b.fg;
    g.font = '900 ' + (b.t.length > 8 ? 56 : 70) + 'px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.t, x + each / 2, H / 2 - 5);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + each - 3, 0, 3, H);
  });
  return finish(c);
});

// ---------------------------------------------------------------------
// TYRE WALL - belted stacks: one tile is 2 m along, v up the stack
// ---------------------------------------------------------------------
export const tyreWall = () => once('tyrewall', () => {
  const W = 128, H = 128, [c, g] = canvas(W, H);
  g.fillStyle = '#16171a'; g.fillRect(0, 0, W, H);
  // the tyres, row on row, each a dark disc with a sidewall ring
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = (x + 0.5) * W / 4, cy = (y + 0.5) * H / 4;
    g.fillStyle = '#23252a'; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill();
    g.fillStyle = '#0c0d0f'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
  }
  // the conveyor belt strapped over the front, red and white
  for (let x = 0; x < W; x += 32) {
    g.fillStyle = x % 64 ? '#e8e6e0' : '#c8302a';
    g.fillRect(x, H * 0.35, 32, H * 0.3);
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// CROWD - a grandstand full of people, one tile is 12 m along, 6 rows up
// ---------------------------------------------------------------------
export const crowd = () => once('crowd', () => {
  const W = 512, H = 256, [c, g] = canvas(W, H);
  g.fillStyle = '#2a2f37'; g.fillRect(0, 0, W, H);
  const r = rng(71);
  const rows = 6, rowH = H / rows;
  for (let row = 0; row < rows; row++) {
    // the seat back, in the stand's colour
    g.fillStyle = '#2b5c9a'; g.fillRect(0, row * rowH + rowH * 0.62, W, rowH * 0.38);
    // MUTED. Every shirt at full saturation turned a stand seen from above
    // into rainbow static; a real crowd is mostly dark, white and navy with
    // the odd team colour, and reads as people precisely because of it.
    const shirts = ['#1d2230', '#e8e8e4', '#2a3a5c', '#3d3d3d', '#8a1f1f', '#c9a227', '#556070', '#f0f0ec', '#1f4a7a'];
    for (let x = 2; x < W; x += 11 + r() * 5) {
      if (r() < 0.14) continue;             // an empty seat
      const top = row * rowH + rowH * (0.08 + r() * 0.1);
      g.fillStyle = shirts[Math.floor(r() * shirts.length)]; g.fillRect(x, top + 10, 9, rowH * 0.6 - 9);
      g.fillStyle = `hsl(${22 + r() * 14},${25 + r() * 25}%,${30 + r() * 38}%)`;
      g.beginPath(); g.arc(x + 4.5, top + 5.5, 4.5, 0, 7); g.fill();
    }
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// FACADE - a block of flats: one tile is 4 m wide and 3.2 m tall (a floor)
// Greyscale, so the building's own colour comes through the material.
// ---------------------------------------------------------------------
export const facade = () => once('facade', () => {
  const W = 256, H = 204, [c, g] = canvas(W, H);
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, W, H);
  noiseFill(g, W, H, [{ period: 8, amp: 10 }], 81, (d, i, v) => { d[i] += v; d[i + 1] += v; d[i + 2] += v; });
  // a floor line, then the window with its shutters and balcony
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, W, 8);
  const wx = W * 0.3, ww = W * 0.4, wy = H * 0.24, wh = H * 0.56;
  g.fillStyle = '#39424d'; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(160,190,220,0.35)'; g.fillRect(wx + 4, wy + 4, ww - 8, wh * 0.45);
  g.fillStyle = '#6f8a7a';
  g.fillRect(wx - ww * 0.36, wy, ww * 0.32, wh); g.fillRect(wx + ww + ww * 0.04, wy, ww * 0.32, wh);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = wy + 6; y < wy + wh; y += 8) { g.fillRect(wx - ww * 0.36, y, ww * 0.32, 2); g.fillRect(wx + ww + ww * 0.04, y, ww * 0.32, 2); }
  g.fillStyle = '#e9e6de'; g.fillRect(wx - 12, wy + wh, ww + 24, 10);
  g.fillStyle = '#20242a';
  for (let x = wx - 10; x <= wx + ww + 10; x += 10) g.fillRect(x, wy + wh - 22, 2, 22);
  g.fillRect(wx - 12, wy + wh - 22, ww + 24, 2);
  return finish(c);
});

// ---------------------------------------------------------------------
// GARAGES - the pit building front: one tile is one 8 m garage bay
// ---------------------------------------------------------------------
export const garages = () => once('garages', () => {
  const W = 512, H = 512, [c, g] = canvas(W, H);
  g.fillStyle = '#e4e7ea'; g.fillRect(0, 0, W, H);
  // upper floor: hospitality glazing
  const glass = g.createLinearGradient(0, 0, 0, H * 0.42);
  glass.addColorStop(0, '#20344a'); glass.addColorStop(1, '#4d6f8f');
  g.fillStyle = glass; g.fillRect(0, H * 0.06, W, H * 0.34);
  g.fillStyle = '#c9ced4';
  for (let x = 0; x < W; x += W / 4) g.fillRect(x, H * 0.06, 6, H * 0.34);
  // the team board over the door
  g.fillStyle = '#1b2230'; g.fillRect(W * 0.08, H * 0.46, W * 0.84, H * 0.08);
  // the garage door, open, with the lit interior behind
  g.fillStyle = '#2a2e35'; g.fillRect(W * 0.08, H * 0.56, W * 0.84, H * 0.44);
  const inside = g.createLinearGradient(0, H * 0.6, 0, H);
  inside.addColorStop(0, '#9aa3ad'); inside.addColorStop(1, '#5d646c');
  g.fillStyle = inside; g.fillRect(W * 0.12, H * 0.62, W * 0.76, H * 0.38);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  for (let x = W * 0.16; x < W * 0.84; x += W * 0.12) g.fillRect(x, H * 0.63, W * 0.07, 5);
  g.fillStyle = '#b8bec5'; g.fillRect(0, H * 0.40, W, H * 0.06);
  return finish(c);
});
