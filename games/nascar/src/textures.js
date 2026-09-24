// =====================================================================
// NASCAR :: textures.js - SURFACES, PAINTED IN CODE
// =====================================================================
//
// No image files anywhere in this game. Every surface is drawn on a
// canvas when the page loads, sized so that it repeats every few metres
// in the world rather than stretching over half a mile.
//
// The reason to bother is speed. At a hundred and ninety miles an hour
// the eye reads how fast it is going almost entirely off the texture
// rushing past - a flat grey road does not look fast however fast it is,
// and a speedway is two and a half miles of exactly that one surface. So
// the asphalt has aggregate in it, and sealed cracks, and a darker groove
// where the rubber has gone down; and the concrete at Bristol has real
// slab joints, because that is the thing you actually see going past.
//
// ALL OF THEM TILE. Anything drawn near an edge is drawn again on the
// opposite edge and the noise lattice wraps, or there is a visible seam
// across the racetrack every eight metres.
import * as THREE from '../vendor/three.module.js';

const cache = new Map();
let anisotropy = 8;
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
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v)
         + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noiseFill(g, w, h, octaves, seed, fn) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const ns = octaves.map((o, k) => ({ f: tileNoise(o.period, seed + k * 101), o }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const { f, o } of ns) v += (f(x / w * o.period, y / h * o.period) - 0.5) * o.amp;
      fn(d, (y * w + x) * 4, v, x, y);
    }
  }
  g.putImageData(img, 0, 0);
}

/** scatter small marks, drawn again across any edge they touch so the tile wraps */
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
export function clearTextures() { cache.clear(); }

// ---------------------------------------------------------------------
// ASPHALT - one tile is 8 x 8 metres. `u` runs ACROSS the track and `v`
// along it, so the rubbered groove is a band at a fixed u.
// ---------------------------------------------------------------------
export const asphalt = () => once('asphalt', () => {
  const S = 1024, [c, g] = canvas(S, S);
  g.fillStyle = '#4e5054'; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, [{ period: 4, amp: 20 }, { period: 16, amp: 13 }, { period: 128, amp: 9 }], 7, (d, i, v) => {
    d[i] += v; d[i + 1] += v; d[i + 2] += v * 1.05;
  });
  speckle(g, S, S, 24000, 11, (r) => `rgba(${146 + r() * 60},${146 + r() * 55},${144 + r() * 50},${0.22 + r() * 0.32})`, [1, 2.4]);
  speckle(g, S, S, 28000, 13, (r) => `rgba(20,21,24,${0.22 + r() * 0.34})`, [1, 2.6]);
  // ---- PATCHES -----------------------------------------------------------
  // A speedway is laid in strips and patched where it breaks up, and the
  // joins between the ages of asphalt are what your eye actually tracks
  // going past at a hundred and ninety miles an hour. One uniform grey
  // reads as a road in a diagram, however much grain is on it.
  const r = rng(99);
  for (let k = 0; k < 7; k++) {
    const x = r() * S, y = r() * S, w = 90 + r() * 260, h = 60 + r() * 200;
    g.globalAlpha = 0.10 + r() * 0.13;
    g.fillStyle = r() < 0.5 ? '#6a6d72' : '#3c3e42';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y + (r() - 0.5) * 40);
    g.lineTo(x + w + (r() - 0.5) * 30, y + h);
    g.lineTo(x - (r() - 0.5) * 30, y + h + (r() - 0.5) * 30);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  // ---- SEALED CRACKS, the tar lines every old racetrack is covered in ----
  g.strokeStyle = 'rgba(16,16,18,0.55)';
  for (let k = 0; k < 6; k++) {
    let x = r() * S, y = 0;
    g.lineWidth = 1.6 + r() * 2.4;
    g.beginPath(); g.moveTo(x, y);
    while (y < S) { x += (r() - 0.5) * 70; y += 30 + r() * 55; g.lineTo(x, y); }
    g.stroke();
  }
  // and a couple ACROSS the track, which is how the seam between two
  // paving passes reads when you are looking down the straight at it
  for (let k = 0; k < 2; k++) {
    let y = r() * S, x = 0;
    g.lineWidth = 2.0 + r() * 2.0;
    g.beginPath(); g.moveTo(x, y);
    while (x < S) { y += (r() - 0.5) * 22; x += 50 + r() * 70; g.lineTo(x, y); }
    g.stroke();
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// CONCRETE - Bristol. The slab joints are the thing: a line every twelve
// feet across the track, and they are what you see coming at you.
// ---------------------------------------------------------------------
export const concrete = () => once('concrete', () => {
  const S = 1024, [c, g] = canvas(S, S);
  g.fillStyle = '#8b8d8c'; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, [{ period: 6, amp: 16 }, { period: 40, amp: 10 }, { period: 160, amp: 7 }], 23, (d, i, v) => {
    d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.96;
  });
  speckle(g, S, S, 16000, 31, (r) => `rgba(${180 + r() * 50},${180 + r() * 50},${176 + r() * 46},${0.16 + r() * 0.22})`, [1, 2]);
  // the joints: four across the tile, so one every two metres
  g.strokeStyle = 'rgba(52,54,56,0.85)'; g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const y = (k + 0.5) * S / 4;
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
  }
  // and the hairline grinding marks the grooving machine leaves
  g.strokeStyle = 'rgba(120,122,124,0.30)'; g.lineWidth = 1;
  for (let x = 0; x < S; x += 7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  return finish(c);
});

// ---------------------------------------------------------------------
// THE GROOVE - a separate, transparent layer laid over the racing
// surface where the rubber goes down. It is drawn as its own strip in
// track.js rather than baked into the asphalt, because the groove moves
// across the track and the asphalt does not.
// ---------------------------------------------------------------------
export const groove = () => once('groove', () => {
  const S = 256, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, 'rgba(24,24,26,0)');
  grad.addColorStop(0.25, 'rgba(24,24,26,0.55)');
  grad.addColorStop(0.5, 'rgba(18,18,20,0.72)');
  grad.addColorStop(0.75, 'rgba(24,24,26,0.55)');
  grad.addColorStop(1, 'rgba(24,24,26,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, [{ period: 8, amp: 26 }], 5, (d, i, v) => { d[i + 3] = Math.max(0, d[i + 3] + v); });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
});

// ---------------------------------------------------------------------
// GRASS - the infield
// ---------------------------------------------------------------------
export const grass = () => once('grass', () => {
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#3f6134'; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, [{ period: 3, amp: 26 }, { period: 12, amp: 18 }, { period: 64, amp: 14 }], 41, (d, i, v) => {
    d[i] += v * 0.7; d[i + 1] += v; d[i + 2] += v * 0.5;
  });
  // mown stripes, which is what an infield actually looks like
  g.globalAlpha = 0.10;
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? '#c8ffb0' : '#0d2a08';
    g.fillRect(0, k * S / 8, S, S / 8);
  }
  g.globalAlpha = 1;
  speckle(g, S, S, 9000, 43, (r) => `rgba(${60 + r() * 60},${110 + r() * 70},${40 + r() * 40},0.35)`, [1, 2.5]);
  return finish(c);
});

// ---------------------------------------------------------------------
// THE WALL - concrete with a SAFER barrier bolted to it, and hoardings.
// One tile is 12 m of wall by its full height.
// ---------------------------------------------------------------------
const ADS = ['REDLINE OIL', 'CARBIDE', 'ATLAS FUEL', 'NORTHWIND', 'SUNSPAR',
             'LUMEN', 'GRANITE', 'COPPERHEAD', 'HALOGEN', 'MERIDIAN'];

export const wall = () => once('wall', () => {
  const W = 1024, H = 256, [c, g] = canvas(W, H);
  // the SAFER barrier: steel tubes on the top two thirds, concrete below
  g.fillStyle = '#b9bcc0'; g.fillRect(0, 0, W, H);
  noiseFill(g, W, H, [{ period: 8, amp: 14 }, { period: 48, amp: 9 }], 61, (d, i, v) => {
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  });
  // the horizontal seam between the SAFER panels and the concrete
  g.fillStyle = '#8f9399'; g.fillRect(0, H * 0.62, W, 5);
  // vertical panel joints every 6 m (half a tile)
  g.strokeStyle = 'rgba(110,114,120,0.8)'; g.lineWidth = 3;
  for (let k = 0; k <= 2; k++) { const x = k * W / 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  // a hoarding across the top half
  for (let k = 0; k < 2; k++) {
    const x0 = k * W / 2 + 10, w = W / 2 - 20;
    g.fillStyle = ['#0f2a55', '#7a1024'][k % 2];
    g.fillRect(x0, 12, w, H * 0.44);
    g.fillStyle = '#eef2f7';
    g.font = '800 62px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save();
    g.translate(x0 + w / 2, 12 + H * 0.22);
    const txt = ADS[k * 3 % ADS.length];
    const sc = Math.min(1, (w - 30) / g.measureText(txt).width);
    g.scale(sc, 1);
    g.fillText(txt, 0, 0);
    g.restore();
  }
  // scuffs and rubber, because every speedway wall is covered in it
  const r = rng(77);
  for (let k = 0; k < 40; k++) {
    const x = r() * W, y = H * (0.66 + r() * 0.3), w = 30 + r() * 220;
    g.strokeStyle = `rgba(30,28,30,${0.10 + r() * 0.35})`;
    g.lineWidth = 2 + r() * 9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (r() - 0.5) * 10); g.stroke();
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// THE CATCHFENCE - a transparent mesh with cables, in front of the crowd
// ---------------------------------------------------------------------
export const catchfence = () => once('catchfence', () => {
  const S = 128, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  // THIN AND PALE. A catch fence at fifty metres is a haze you look
  // through, not a net you look at; heavy dark wires turned the whole
  // outside of the racetrack into a grey curtain.
  g.strokeStyle = 'rgba(176,182,192,0.55)';
  g.lineWidth = 1.1;
  for (let k = 0; k <= 8; k++) {
    const p = k * S / 8;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
});

// ---------------------------------------------------------------------
// THE CROWD - muted, because full-saturation shirts turn a grandstand
// into rainbow static. One tile is about eight rows by twelve seats.
// ---------------------------------------------------------------------
export const crowd = () => once('crowd', () => {
  // 512 and not 256: this tile is what fills the rows BETWEEN the rows of
  // real instanced spectators, so at the front of the main grandstand it
  // is thirty metres from the camera and a 256 tile was showing its
  // pixels there as flat coloured squares.
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#2a2d33'; g.fillRect(0, 0, S, S);
  const r = rng(101);
  const rows = 11, cols = 16;
  const w = S / cols, hh = S / rows;
  for (let y = 0; y < rows; y++) {
    // The seat backs behind them, in shadow. This is what shows through
    // the gaps, so it decides what the whole stand reads as where the
    // crowd thins. Nearly black (#14161a) put a void between every pair of
    // shoulders and the bank came out as bright specks floating on
    // nothing; a shaded moulded seat is dark grey, not a hole.
    g.fillStyle = '#212429';
    g.fillRect(0, y * hh, S, hh * 0.84);
    for (let x = 0; x < cols; x++) {
      if (r() < 0.12) continue;                       // an empty seat
      // THE SAME PALETTE AS THE REAL SPECTATORS NEXT TO THEM: mostly navy,
      // charcoal and denim, a sixth of them in a light shirt and one in
      // twelve in something bright. When this tile was drawn from a
      // different set of numbers than crowd.js, the rows alternated between
      // a dark band of geometry and a pale band of paint all the way up.
      const k = r();
      const hue = k < 0.32 ? 212 + r() * 18 : k < 0.58 ? (r() * 360) | 0
                : k < 0.78 ? 28 + r() * 22 : k < 0.94 ? 36 : (r() * 360) | 0;
      const sat = k < 0.32 ? 14 + r() * 20 : k < 0.58 ? 4 + r() * 8
                : k < 0.78 ? 6 + r() * 12 : k < 0.94 ? 4 : 26 + r() * 24;
      const lit = k < 0.32 ? 21 + r() * 14 : k < 0.58 ? 17 + r() * 14
                : k < 0.78 ? 34 + r() * 18 : k < 0.94 ? 54 + r() * 18 : 29 + r() * 16;
      // shoulders: wider than the head and narrower than the seat, which
      // is the one proportion that stops a row of these reading as bricks
      const cx = x * w + w * 0.5, top = y * hh + hh * 0.30;
      g.fillStyle = `hsl(${hue | 0}, ${sat | 0}%, ${lit | 0}%)`;
      g.fillRect(cx - w * 0.34, top, w * 0.68, hh * 0.54);
      // and a shade down the body, because these sit in the same seat-back
      // shadow the instanced spectators have baked into them
      g.fillStyle = 'rgba(0,0,0,0.34)';
      g.fillRect(cx - w * 0.34, top + hh * 0.30, w * 0.68, hh * 0.24);
      // the head, on top, skin or a cap
      const bare = r() < 0.55;
      g.fillStyle = bare
        ? `hsl(${24 + r() * 8 | 0}, ${26 + r() * 16 | 0}%, ${22 + r() * 34 | 0}%)`
        : `hsl(${hue | 0}, ${sat | 0}%, ${(lit * 0.5) | 0}%)`;
      g.beginPath();
      g.arc(cx + (r() - 0.5) * w * 0.2, top - hh * 0.02, w * 0.20, 0, Math.PI * 2);
      g.fill();
    }
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// PIT BOX - a painted box on the pit road with a number in it
// ---------------------------------------------------------------------
export function pitBox(number, colour) {
  return once('box' + number + colour, () => {
    const W = 128, H = 256, [c, g] = canvas(W, H);
    g.fillStyle = '#44464a'; g.fillRect(0, 0, W, H);
    noiseFill(g, W, H, [{ period: 6, amp: 14 }], 17, (d, i, v) => { d[i] += v; d[i + 1] += v; d[i + 2] += v; });
    g.strokeStyle = colour; g.lineWidth = 7;
    g.strokeRect(9, 16, W - 18, H - 32);
    g.fillStyle = colour;
    g.globalAlpha = 0.18; g.fillRect(9, 16, W - 18, H - 32); g.globalAlpha = 1;
    g.fillStyle = '#f2f4f7';
    g.font = '800 92px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(number), W / 2, H / 2);
    return finish(c, { repeat: false });
  });
}

// ---------------------------------------------------------------------
// THE SKY - a gradient dome with a little haze at the horizon
// ---------------------------------------------------------------------
export function skyTexture() {
  return once('sky', () => {
    const W = 16, H = 256, [c, g] = canvas(W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#1f4f8f');
    grad.addColorStop(0.35, '#4d86c4');
    grad.addColorStop(0.68, '#9dc0dd');
    grad.addColorStop(0.86, '#cfdce6');
    grad.addColorStop(1.00, '#e6e2d8');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

// ---------------------------------------------------------------------
// GARAGE BLOCK - the wall of buildings behind the pit road
// ---------------------------------------------------------------------
export const garages = () => once('garages', () => {
  const W = 1024, H = 256, [c, g] = canvas(W, H);
  g.fillStyle = '#d5d7d9'; g.fillRect(0, 0, W, H);
  noiseFill(g, W, H, [{ period: 10, amp: 10 }], 5, (d, i, v) => { d[i] += v; d[i + 1] += v; d[i + 2] += v; });
  const bays = 8;
  for (let k = 0; k < bays; k++) {
    const x = k * W / bays;
    // a roller door
    g.fillStyle = '#4a5058';
    g.fillRect(x + 14, H * 0.20, W / bays - 28, H * 0.72);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 2;
    for (let y = H * 0.22; y < H * 0.92; y += 11) {
      g.beginPath(); g.moveTo(x + 14, y); g.lineTo(x + W / bays - 14, y); g.stroke();
    }
    // the bay number
    g.fillStyle = '#20242a';
    g.font = '700 30px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(k + 1), x + W / bays / 2, H * 0.12);
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// THE START/FINISH LINE - a chequered band, drawn across the track
// ---------------------------------------------------------------------
export const startLine = () => once('startline', () => {
  const S = 256, [c, g] = canvas(S, S);
  const n = 8;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#f2f3f5' : '#17191c';
      g.fillRect(x * S / n, y * S / n, S / n, S / n);
    }
  }
  return finish(c);
});

// ---------------------------------------------------------------------
// THE SCORING PYLON - the running order, in lights, in the infield.
// Two columns of amber seven-segment numbers on a black panel, which is
// what every oval in America has had in the middle of it since 1959.
// ---------------------------------------------------------------------
export const pylon = () => once('pylon', () => {
  const W = 128, H = 900, [c, g] = canvas(W, H);
  g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, W, H);
  g.font = '700 46px ui-monospace, Consolas, monospace';
  g.textBaseline = 'middle';
  const order = [4, 22, 48, 19, 11, 24, 2, 9, 20, 17, 14, 5, 12, 1, 43, 6, 8, 38, 77, 31];
  for (let k = 0; k < 20; k++) {
    const y = 28 + k * 43;
    g.fillStyle = '#1a1c20';
    g.fillRect(6, y - 18, W - 12, 36);
    g.fillStyle = '#e8a318';
    g.textAlign = 'left';
    g.fillText(String(k + 1).padStart(2, ' '), 10, y);
    g.fillStyle = '#f2c94c';
    g.textAlign = 'right';
    g.fillText(String(order[k]), W - 12, y);
  }
  return finish(c, { repeat: false });
});

// ---------------------------------------------------------------------
// THE INSIDE OF THE CAR
// ---------------------------------------------------------------------
//
// The cockpit is the one view a first-person driver looks at for two
// hours, and until now it was grey slabs. Everything below is drawn at
// the scale a driver sees it from - half a metre, not fifty - so the
// grain has to be FINE. A sheet of alloy an arm's length away shows the
// direction of the brushing, the rivet line, and where somebody's glove
// has been rubbing it all season; at that distance a noise field with a
// four-metre period reads as mud.
// ---------------------------------------------------------------------

/** brushed aluminium sheet: the tub, the door cards, the firewall */
export const alloy = () => once('alloy', () => {
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#7b7f86'; g.fillRect(0, 0, S, S);
  // the brushing: long horizontal scratches, thousands of them
  const r = rng(91);
  for (let k = 0; k < 5200; k++) {
    const y = r() * S, x = r() * S, w = 12 + r() * 150;
    const v = r();
    g.strokeStyle = v > 0.5 ? `rgba(255,255,255,${0.018 + r() * 0.05})`
                            : `rgba(30,34,40,${0.018 + r() * 0.06})`;
    g.lineWidth = r() > 0.85 ? 1.6 : 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (r() - 0.5) * 1.2); g.stroke();
    if (x + w > S) { g.beginPath(); g.moveTo(x - S, y); g.lineTo(x + w - S, y); g.stroke(); }
  }
  // a broad mottle, so it is not uniform across a big panel
  noiseFill(g, S, S, [{ period: 6, amp: 11 }, { period: 24, amp: 6 }], 37, (d, i, v) => {
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  });
  // rivets down two seams
  for (const sx of [S * 0.11, S * 0.89]) {
    for (let y = 8; y < S; y += 26) {
      g.fillStyle = '#585c63';
      g.beginPath(); g.arc(sx, y, 3.4, 0, 7); g.fill();
      g.fillStyle = 'rgba(214,222,232,0.55)';
      g.beginPath(); g.arc(sx - 0.9, y - 0.9, 2.1, 0, 7); g.fill();
    }
  }
  // and the dirt: a season of brake dust and rubber, worst low down
  const img = g.getImageData(0, 0, S, S), d = img.data;
  const n = tileNoise(5, 71);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const grime = Math.max(0, n(x / S * 5, y / S * 5) - 0.42) * 1.5 * (0.35 + y / S * 0.9);
      d[i] *= 1 - grime * 0.42; d[i + 1] *= 1 - grime * 0.46; d[i + 2] *= 1 - grime * 0.52;
    }
  }
  g.putImageData(img, 0, 0);
  speckle(g, S, S, 900, 53, (q) => `rgba(28,24,20,${0.10 + q() * 0.25})`, [1, 4]);
  return finish(c);
});

/** the suede on the wheel rim, and the padding on the bars */
export const suede = () => once('suede', () => {
  const S = 256, [c, g] = canvas(S, S);
  g.fillStyle = '#26292e'; g.fillRect(0, 0, S, S);
  // suede is fibres, not a surface: thousands of very short marks in
  // every direction, which is what stops it reading as moulded plastic
  const r = rng(17);
  for (let k = 0; k < 26000; k++) {
    const x = r() * S, y = r() * S, a = r() * 6.283, l = 1 + r() * 3.2;
    const v = r();
    g.strokeStyle = v > 0.55 ? `rgba(150,156,166,${0.05 + r() * 0.13})`
                             : `rgba(8,9,11,${0.05 + r() * 0.16})`;
    g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // the stitching seam, and the shine worn into it at ten to two
  g.strokeStyle = 'rgba(190,60,44,0.75)'; g.lineWidth = 2;
  g.setLineDash([7, 6]);
  g.beginPath(); g.moveTo(0, S * 0.5); g.lineTo(S, S * 0.5); g.stroke();
  g.setLineDash([]);
  const grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.28, 'rgba(160,168,178,0.13)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(0.76, 'rgba(160,168,178,0.11)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return finish(c);
});

/** the window net: real webbing with a weave and a frame */
export const net = () => once('net', () => {
  const S = 256, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  const band = 26, gap = S / 4;
  g.fillStyle = '#16181c';
  for (let k = 0; k < 4; k++) {
    g.fillRect(k * gap + 6, 0, band, S);
    g.fillRect(0, k * gap + 6, S, band);
  }
  // the weave: the horizontal straps go OVER at every other crossing
  g.fillStyle = '#1d2024';
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if ((a + b) % 2) g.fillRect(a * gap + 6, b * gap + 6, band, band);
    }
  }
  // the edge stitching down each strap, which is what says webbing
  g.strokeStyle = 'rgba(120,126,136,0.35)'; g.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    for (const o of [9, band + 3]) {
      g.beginPath(); g.moveTo(k * gap + o, 0); g.lineTo(k * gap + o, S); g.stroke();
      g.beginPath(); g.moveTo(0, k * gap + o); g.lineTo(S, k * gap + o); g.stroke();
    }
  }
  return finish(c, { srgb: true });
});

/**
 * THE TREAD OF A SLICK - which is to say, no tread at all.
 *
 * A stock car runs a bald tyre, so the thing that stops it reading as a
 * black cylinder is everything EXCEPT a pattern: the fine circumferential
 * lines the mould leaves, the wear ribs at each shoulder, the grain of
 * the compound, and the marbles - the little curls of picked-up rubber
 * that cover a used tyre by lap twenty. `u` runs AROUND the tyre and `v`
 * across its width, which is how CylinderGeometry lays its UVs out, so
 * the shoulders are at v = 0 and v = 1 and everything drawn as a
 * horizontal band is a band round the circumference.
 */
export const slick = () => once('slick', () => {
  const W = 256, H = 128, [c, g] = canvas(W, H);
  g.fillStyle = '#212328'; g.fillRect(0, 0, W, H);
  noiseFill(g, W, H, [{ period: 8, amp: 16 }, { period: 32, amp: 10 }], 67, (d, i, v) => {
    d[i] += v; d[i + 1] += v; d[i + 2] += v * 1.04;
  });
  // the shoulders, darker and harder-worn than the middle of the tread
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0.00, 'rgba(8,8,10,0.85)');
  sh.addColorStop(0.10, 'rgba(8,8,10,0.10)');
  sh.addColorStop(0.50, 'rgba(120,124,132,0.07)');
  sh.addColorStop(0.90, 'rgba(8,8,10,0.10)');
  sh.addColorStop(1.00, 'rgba(8,8,10,0.85)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  // the mould lines, running round the tyre
  g.strokeStyle = 'rgba(150,154,162,0.10)'; g.lineWidth = 1;
  for (let y = 6; y < H - 6; y += 5) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  // and the marbles
  speckle(g, W, H, 1800, 71, (r) => `rgba(${34 + r() * 26},${30 + r() * 22},${28 + r() * 20},${0.20 + r() * 0.40})`, [1, 3.4]);
  speckle(g, W, H, 400, 73, (r) => `rgba(${132 + r() * 50},${132 + r() * 50},${136 + r() * 46},${0.06 + r() * 0.13})`, [1, 2]);
  return finish(c);
});

/** water on glass: beads, and the rivulets they run into */
export const beads = () => once('beads', () => {
  const S = 512, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  const r = rng(29);
  // the rivulets first, so the beads sit on top of them
  for (let k = 0; k < 26; k++) {
    let x = r() * S;
    const w = 1.5 + r() * 3.5;
    g.strokeStyle = `rgba(236,244,255,${0.10 + r() * 0.16})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y < S; y += 16) { x += (r() - 0.5) * 9; g.lineTo(x, y); }
    g.stroke();
  }
  // and the beads: a bright rim and a dark centre, which is what a lens
  // of water sitting on glass actually looks like against a bright sky
  for (let k = 0; k < 1500; k++) {
    const x = r() * S, y = r() * S, s = 1.2 + r() * r() * 7;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy;
      if (px < -s || px > S + s || py < -s || py > S + s) continue;
      const gr = g.createRadialGradient(px - s * 0.25, py - s * 0.3, s * 0.1, px, py, s);
      gr.addColorStop(0, `rgba(255,255,255,${0.30 + r() * 0.30})`);
      gr.addColorStop(0.55, 'rgba(190,206,226,0.10)');
      gr.addColorStop(1, 'rgba(120,140,170,0.00)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(px, py, s, 0, 7); g.fill();
    }
  }
  return finish(c);
});
