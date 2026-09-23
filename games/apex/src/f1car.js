// =====================================================================
// APEX :: f1car.js - THE CAR, BUILT OUT OF NUMBERS
// =====================================================================
//
// No model file. A modern Formula 1 car is a handful of long, smooth
// surfaces - a needle nose, a survival cell, two sidepods that fall away
// into a coke-bottle waist, an engine cover - plus a great many thin
// plates: wing elements, endplates, floor edges, wishbones. So it is built
// the way it is drawn: the smooth surfaces are LOFTED through cross
// sections, and the plates are aerofoils swept along a span.
//
// The first version of this car was boxes on a flat-shaded loft of ten
// sections, and it read as a toy. What changed, and why each one mattered:
//
//   SMOOTH LOFTS     twenty points to a ring and sixteen rings nose to
//                    gearbox, indexed so the normals are shared and the
//                    paint catches the light as one surface instead of a
//                    faceted gem.
//   REAL AEROFOILS   every wing element has a thickness and a camber and
//                    SWEEPS UP toward the endplates, which is the single
//                    most recognisable thing about a 2022-rules front wing.
//   A LIVERY         painted onto one canvas and mapped by metres of
//                    surface, so a number is the same size on the nose as
//                    it would be on the real car and a stripe runs straight.
//   FEW DRAW CALLS   a race grid is twelve of these. Everything that does
//                    not move is merged by material, geometry is built once
//                    and shared by every car, and only the livery texture
//                    is made per car. One car is about two dozen calls.
//
// ---------------------------------------------------------------------
// MODEL SPACE MATCHES THE PHYSICS, deliberately
// ---------------------------------------------------------------------
//   +Z is FORWARD     (physics body X)
//   +X is LEFT        (physics body Y)
//   +Y is UP, and the WHEEL CENTRES are at y = 0
// so a wheel the physics calls (forward 1.96, left -1.0) is placed at
// (x -1.0, z 1.96) and nothing ever has to be converted. The road is at
// y = -wheelRadius, and every height below is written as metres above the
// road, because that is how a car's dimensions are published.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

const DEFAULT_LIVERY = { body: 0x16254a, accent: 0xe03a2f, trim: 0xf1f3f6, number: 7, name: 'APEX' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

// =====================================================================
// THE LIVERY SHEET
// =====================================================================
//
// Every painted part of the car samples ONE texture, so the whole of the
// paintwork is one material and one draw call. The sheet is divided into
// regions, and each part's UVs are written into its region in METRES:
//
//   A      the survival cell. Across is arc length round the section from
//          the top centre line, along is z.
//   COVER  the engine cover, the same way. It needs its own region: it
//          sits ON the chassis, and sharing A put every word on it twice -
//          once on the cover and once on the chassis showing beside it.
//   POD    both sidepods, mirrored so each one's OUTER face is +s. No
//          words here, only shapes, which is what lets one region serve
//          both sides - text would read backwards on one of them.
//   FINL/R the two faces of the shark fin, which do carry the number, so
//          each face gets its own copy.
//   PATCH  three flat blocks of body, accent and trim colour. A wing
//          element or an endplate is "painted" by pointing all of its UVs
//          at one of them.
const TEX = 1024;
const REG = {
  A:     { u0: 0.00, u1: 0.70, v0: 0.00, v1: 1.00, x0: -0.95, x1: 0.95, y0: -2.75, y1: 3.15 },
  FINL:  { u0: 0.72, u1: 1.00, v0: 0.09, v1: 0.21, x0: -2.10, x1: -0.25, y0: 0.40, y1: 1.05 },
  FINR:  { u0: 0.72, u1: 1.00, v0: 0.22, v1: 0.34, x0: -2.10, x1: -0.25, y0: 0.40, y1: 1.05 },
  COVER: { u0: 0.72, u1: 1.00, v0: 0.35, v1: 0.60, x0: -0.45, x1: 0.45, y0: -2.25, y1: 0.25 },
  POD:   { u0: 0.72, u1: 1.00, v0: 0.61, v1: 1.00, x0: -0.62, x1: 0.62, y0: -1.80, y1: 1.25 },
};
const PATCH = { body: [0.755, 0.04], accent: [0.845, 0.04], trim: [0.935, 0.04] };

function uvIn(R, x, y) {
  return [
    R.u0 + (clamp(x, R.x0, R.x1) - R.x0) / (R.x1 - R.x0) * (R.u1 - R.u0),
    R.v0 + (clamp(y, R.y0, R.y1) - R.y0) / (R.y1 - R.y0) * (R.v1 - R.v0),
  ];
}

/** draw inside a region, in the region's own metres */
function inRegion(g, R, fn) {
  g.save();
  const sx = (R.u1 - R.u0) * TEX / (R.x1 - R.x0);
  const sy = -(R.v1 - R.v0) * TEX / (R.y1 - R.y0);
  g.setTransform(sx, 0, 0, sy, R.u0 * TEX - R.x0 * sx, (1 - R.v0) * TEX - R.y0 * sy);
  g.beginPath(); g.rect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0); g.clip();
  fn(g);
  g.restore();
}

/**
 * Text on the car. `r` is the direction it READS in and `u` is the
 * direction its letters stand UP in, both in the region's metres - which
 * is the only sane way to put words on a surface that different parts of
 * the car see from different sides.
 */
function label(g, text, x, y, h, r, u, color, maxW = 9) {
  g.save();
  g.translate(x, y);
  g.font = '800 100px "Segoe UI", "Arial Black", Arial, sans-serif';
  const k = Math.min(h / 72, maxW / Math.max(1, g.measureText(text).width));
  g.transform(r[0] * k, r[1] * k, -u[0] * k, -u[1] * k, 0, 0);
  g.transform(1, 0, -0.18, 1, 0, 0);          // a racing italic
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 0, 4);
  g.restore();
}

function poly(g, pts, color) {
  g.fillStyle = color;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath(); g.fill();
}

function liveryTexture(lv) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d');
  const B = hex(lv.body), A = hex(lv.accent), W = hex(lv.trim);
  const num = String(lv.number), name = String(lv.name).toUpperCase();
  g.fillStyle = B; g.fillRect(0, 0, TEX, TEX);

  // the three flat patches
  for (const [k, col] of [['body', B], ['accent', A], ['trim', W]]) {
    const [u, v] = PATCH[k];
    g.fillStyle = col;
    g.fillRect((u - 0.04) * TEX, (1 - v - 0.04) * TEX, 0.08 * TEX, 0.08 * TEX);
  }

  // ---- the survival cell and engine cover ------------------------------
  inRegion(g, REG.A, (g) => {
    // the nose tip in the accent colour, cut at an angle
    poly(g, [[-1, 2.70], [1, 2.70], [1, 3.2], [-1, 3.2]], A);
    // two trim lines running back from the tip and opening out over the
    // top of the chassis, which is what gives a nose its direction
    for (const s of [-1, 1]) {
      poly(g, [[s * 0.045, 2.70], [s * 0.075, 2.70], [s * 0.20, 1.25], [s * 0.165, 1.25]], W);
    }
    // the race number, readable from in front of the car
    label(g, num, 0, 2.30, 0.17, [1, 0], [0, -1], W, 0.20);
    // a name down each side of the nose
    label(g, name, 0.215, 1.72, 0.055, [0, -1], [-1, 0], W, 0.55);
    label(g, name, -0.215, 1.72, 0.055, [0, 1], [1, 0], W, 0.55);
    // the inside of the cockpit well: floor and walls, in the dark of the
    // seat and padding. Arc length runs down the wall, so this reaches
    // from the floor up to just under the rim.
    g.fillStyle = '#0c0d10';
    g.fillRect(-0.44, -0.02, 0.88, 1.0);
    // a trim line along each side of the cockpit, above the pods
    for (const s of [-1, 1]) poly(g, [[s * 0.30, 1.30], [s * 0.33, 1.30], [s * 0.37, -0.40], [s * 0.34, -0.40]], W);
    // the gearbox and crash structure in the accent colour
    poly(g, [[-1, -2.05], [1, -2.05], [1, -3], [-1, -3]], A);
    poly(g, [[-1, -1.98], [1, -1.98], [1, -2.05], [-1, -2.05]], W);
  });

  // ---- the engine cover ----------------------------------------------------
  // The name down each flank, reading toward the back on the left and
  // toward the front on the right - left to right from whichever side you
  // are standing on - with an accent sweep falling back from the airbox.
  inRegion(g, REG.COVER, (g) => {
    for (const s of [-1, 1]) {
      poly(g, [[s * 0.05, 0.3], [s * 0.13, 0.3], [s * 0.34, -1.75], [s * 0.24, -1.75]], A);
    }
    label(g, name, 0.215, -0.95, 0.07, [0, -1], [-1, 0], W, 0.62);
    label(g, name, -0.215, -0.95, 0.07, [0, 1], [1, 0], W, 0.62);
    poly(g, [[-1, -1.75], [1, -1.75], [1, -3], [-1, -3]], A);
  });

  // ---- sidepods: shapes only -------------------------------------------------
  inRegion(g, REG.POD, (g) => {
    // a trim pinstripe and an accent sweep rising along the undercut
    poly(g, [[0.30, 1.3], [0.345, 1.3], [0.53, -1.0], [0.49, -1.0]], W);
    poly(g, [[0.36, 1.3], [0.70, 1.3], [0.70, -1.0], [0.55, -1.0]], A);
    // and a trim flash along the top of the downwash ramp
    poly(g, [[-0.05, -0.10], [0.05, -0.10], [0.14, -1.9], [0.06, -1.9]], W);
  });

  // ---- the fin: the number again, big, on both faces ---------------------
  for (const [R, rd] of [[REG.FINL, [-1, 0]], [REG.FINR, [1, 0]]]) {
    inRegion(g, R, (g) => {
      poly(g, [[-0.25, 0.99], [-2.2, 0.80], [-2.2, 1.2], [-0.25, 1.2]], A);
      label(g, num, -1.05, 0.815, 0.11, rd, [0, 1], W, 0.3);
    });
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// =====================================================================
// THE WHEEL'S SCREEN
// =====================================================================
//
// A real dash on a canvas: the shift lights across the top, the gear, the
// speed, and the lap time or delta under it. ONE canvas serves every car
// on the grid - it is the player's numbers, and the only camera that can
// read a wheel is the one in the player's cockpit. main.js calls
// wheelScreen().draw() a few times a second, not every frame; the texture
// only uploads when something on it has changed.
let SCREEN = null;
export function wheelScreen() {
  if (SCREEN) return SCREEN;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  SCREEN = {
    canvas: c, texture: tex, last: '',
    /** @param d { gear, kph, rev (0..1), limiter, line1, line2, colour } */
    draw(d) {
      const key = [d.gear, d.kph, Math.round(d.rev * 22), d.limiter, d.line1, d.line2, d.colour].join('|');
      if (key === SCREEN.last) return;
      SCREEN.last = key;
      g.fillStyle = '#05070b'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#0d1219'; g.fillRect(4, 26, 248, 98);
      // the shift lights: green, amber, red, and purple on the limiter
      const lit = Math.floor(Math.max(0, (d.rev - 0.55) / 0.45) * 12);
      for (let i = 0; i < 12; i++) {
        const on = d.limiter ? (Math.floor(Date.now() / 90) % 2 === 0) : i < lit;
        g.fillStyle = !on ? '#141a24' : d.limiter ? '#b02fd0' : i < 4 ? '#35d07f' : i < 8 ? '#e6c03a' : '#e8392e';
        g.fillRect(8 + i * 20.5, 5, 17, 15);
      }
      // the gear, big on the left
      g.fillStyle = '#eef2f7';
      g.font = '700 74px ui-monospace, Consolas, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(d.gear, 52, 70);
      // speed on the right
      g.font = '700 40px ui-monospace, Consolas, monospace';
      g.textAlign = 'right';
      g.fillText(String(d.kph), 238, 58);
      g.font = '600 13px system-ui, sans-serif';
      g.fillStyle = '#6d7a8c';
      g.fillText('KM/H', 238, 82);
      // two lines of whatever matters: lap time, delta, a pit call
      g.textAlign = 'left';
      g.font = '600 15px ui-monospace, Consolas, monospace';
      g.fillStyle = d.colour || '#9fb0c4';
      g.fillText(d.line1 || '', 12, 108);
      g.textAlign = 'right';
      g.fillStyle = '#6d7a8c';
      g.fillText(d.line2 || '', 244, 108);
      tex.needsUpdate = true;
    },
  };
  SCREEN.draw({ gear: 'N', kph: 0, rev: 0, limiter: false, line1: '', line2: '' });
  return SCREEN;
}

/** the helmet: a painted sphere, equirectangular */
function helmetTexture(lv) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = hex(lv.trim); g.fillRect(0, 0, 256, 128);
  g.fillStyle = hex(lv.body); g.fillRect(0, 0, 256, 34);
  g.fillStyle = hex(lv.accent); g.fillRect(0, 34, 256, 9);
  // a stripe over the crown, front to back
  g.fillRect(56, 0, 16, 40); g.fillRect(184, 0, 16, 40);
  g.fillStyle = hex(lv.body); g.fillRect(0, 84, 256, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// =====================================================================
// TEXTURES THAT DO NOT DEPEND ON THE LIVERY
// =====================================================================

/** twill carbon weave - subtle, but it stops black parts reading as holes */
function carbonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#121417'; g.fillRect(0, 0, 128, 128);
  const n = 8, s = 128 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const along = (i + j) % 2 === 0;
      const gr = along ? g.createLinearGradient(i * s, 0, (i + 1) * s, 0)
                       : g.createLinearGradient(0, j * s, 0, (j + 1) * s);
      gr.addColorStop(0, '#16191d'); gr.addColorStop(0.5, '#262a30'); gr.addColorStop(1, '#16191d');
      g.fillStyle = gr;
      g.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The wheel atlas: the tyre's sidewall on the left half, the wheel cover
 * on the right. Both are drawn as discs, because both are mapped onto
 * flat discs that face out of the side of the car.
 *
 * THE COVER HAS TO SHOW THE WHEEL TURNING. 2022 wheels wear flat covers,
 * and a plain disc rotating looks identical at every angle - the car
 * slides down the road instead of rolling. So it carries five bright
 * swept blades, and the sidewall text goes round with it too.
 */
function wheelTexture(rimFrac) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0f1012'; g.fillRect(0, 0, 1024, 512);

  // ---- sidewall ----------------------------------------------------------
  const cx = 256, cy = 256, R = 255;
  g.fillStyle = '#1c1d20';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  // the moulded rings, and the compound band
  g.strokeStyle = '#26282c'; g.lineWidth = 3;
  for (const f of [0.975, 0.73]) { g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#d8342a'; g.lineWidth = R * 0.05;
  g.beginPath(); g.arc(cx, cy, R * 0.80, 0, Math.PI * 2); g.stroke();
  // lettering round the sidewall - fictional, and twice, like the real ones
  g.fillStyle = '#c9ccd1';
  g.font = '700 30px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = ['APEX', 'SLICK', '18', 'APEX', 'SLICK', '18'];
  words.forEach((w, i) => {
    const a = (i / words.length) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * R * 0.905, cy + Math.sin(a) * R * 0.905);
    g.rotate(a + Math.PI / 2);
    g.fillText(w, 0, 0);
    g.restore();
  });
  // inside the rim radius is never seen (the cover sits there) - fill dark
  g.fillStyle = '#0d0e10';
  g.beginPath(); g.arc(cx, cy, R * rimFrac, 0, Math.PI * 2); g.fill();

  // ---- the cover -----------------------------------------------------------
  const kx = 768;
  const lip = g.createRadialGradient(kx, cy, R * 0.86, kx, cy, R);
  lip.addColorStop(0, '#2b2e33'); lip.addColorStop(0.55, '#8c939c'); lip.addColorStop(1, '#3a3e44');
  g.fillStyle = lip;
  g.beginPath(); g.arc(kx, cy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#17191c';
  g.beginPath(); g.arc(kx, cy, R * 0.88, 0, Math.PI * 2); g.fill();
  // five swept blades
  g.fillStyle = '#c3c9d1';
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(kx, cy);
    g.rotate((i / 5) * Math.PI * 2);
    g.beginPath();
    g.moveTo(R * 0.20, -R * 0.05);
    g.quadraticCurveTo(R * 0.55, -R * 0.02, R * 0.84, R * 0.14);
    g.lineTo(R * 0.84, R * 0.24);
    g.quadraticCurveTo(R * 0.52, R * 0.10, R * 0.20, R * 0.06);
    g.closePath(); g.fill();
    g.restore();
  }
  // the centre lock nut
  g.fillStyle = '#25282d';
  g.beginPath(); g.arc(kx, cy, R * 0.22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8342a';
  g.beginPath(); g.arc(kx, cy, R * 0.12, 0, Math.PI * 2); g.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// =====================================================================
// GEOMETRY HELPERS
// =====================================================================

/**
 * One cross section: a superellipse w wide from height yb to yt, centred
 * on cx. `top` and `bot` are the exponents of its upper and lower halves
 * (2 is an ellipse, 4 a rounded box) and `under` pulls the lower half in,
 * which is what a sidepod undercut is.
 *
 * The ring STARTS AND ENDS AT THE BOTTOM CENTRE, where nobody looks,
 * because that is where the texture seam has to go.
 */
function ring(sec, N) {
  const { cx = 0, w, yb, yt, top = 4, bot = 4, under = 0, well = null } = sec;
  const hw = w / 2, ym = (yb + yt) / 2, hh = (yt - yb) / 2;
  const pts = [];
  for (let k = 0; k <= N; k++) {
    const a = -Math.PI / 2 + (k / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const e = sa >= 0 ? top : bot;
    let x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * hw;
    let y = ym + Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * hh;
    if (sa < 0 && under) x *= 1 - under * Math.pow(-sa, 1.4);
    // THE COCKPIT IS A HOLE. A closed section has a lid on it, and the
    // first version painted a dark oval on that lid - so the steering
    // wheel, the driver's arms and his shoulders were all sealed inside
    // the chassis. `well` pulls the middle of the top surface down to the
    // cockpit floor, which turns the section into a U with the rim at the
    // top of each wall.
    if (well && sa > 0) {
      const f = 1 - smooth(well.w * 0.80, well.w, Math.abs(x));
      y += (well.y - y) * f * well.k;
    }
    pts.push([cx + x, y]);
  }
  return pts;
}

/**
 * Loft a smooth skin through cross sections.
 *
 * INDEXED, which is the whole difference from the first version: shared
 * vertices mean shared normals, and shared normals mean a curved surface
 * looks curved. `uv(s, z, x, y)` is given the arc length round the ring
 * from the top centre line (positive toward +X), in metres.
 */
function loft(sections, { N = 20, uv, capFront = true, capBack = true } = {}) {
  const rings = sections.map((s) => ring(s, N));
  const pos = [], uvs = [], idx = [];
  const cols = N + 1;
  rings.forEach((r, si) => {
    const z = sections[si].z;
    const L = [0];
    for (let k = 1; k <= N; k++) L.push(L[k - 1] + Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]));
    const top = L[N / 2];
    for (let k = 0; k <= N; k++) {
      pos.push(r[k][0], r[k][1], z);
      uvs.push(...uv(top - L[k], z, r[k][0], r[k][1]));
    }
  });
  for (let s = 0; s < rings.length - 1; s++) {
    for (let k = 0; k < N; k++) {
      const a = s * cols + k, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Caps get their OWN copy of the edge vertices, so the end of a pod is
  // a crisp edge rather than a smear where its normals average with the
  // sides.
  const cap = (si, front) => {
    const r = rings[si], z = sections[si].z;
    const base = pos.length / 3;
    let mx = 0, my = 0;
    for (let k = 0; k < N; k++) { mx += r[k][0] / N; my += r[k][1] / N; }
    pos.push(mx, my, z); uvs.push(...uv(0, z, mx, my));
    for (let k = 0; k <= N; k++) { pos.push(r[k][0], r[k][1], z); uvs.push(...uv(0, z, r[k][0], r[k][1])); }
    for (let k = 0; k < N; k++) {
      if (front) idx.push(base, base + 1 + k, base + 2 + k);
      else idx.push(base, base + 2 + k, base + 1 + k);
    }
  };
  if (capFront) cap(0, sections[0].z > sections[sections.length - 1].z);
  if (capBack) cap(rings.length - 1, sections[0].z < sections[sections.length - 1].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  fixWinding(g, rings.length, cols);
  g.computeVertexNormals();
  return g;
}

/**
 * Make the side triangles face outward. Which way a stitched ring winds
 * depends on whether the sections run forward or back, and getting it
 * wrong culls the whole skin - so rather than reason about it every time,
 * measure one triangle on the top of the middle section and flip the lot
 * if it faces down.
 */
function fixWinding(g, nRings, cols) {
  const p = g.attributes.position, idx = g.index.array;
  const N = cols - 1;
  const s = Math.floor((nRings - 1) / 2);
  const tri = (s * N + (N / 2 - 1)) * 6;          // a quad just before the top point
  const v = (i) => new THREE.Vector3(p.getX(idx[i]), p.getY(idx[i]), p.getZ(idx[i]));
  const n = new THREE.Vector3().crossVectors(v(tri + 1).sub(v(tri)), v(tri + 2).sub(v(tri)));
  const sides = (nRings - 1) * N * 6;
  if (n.y < 0) {
    for (let i = 0; i < sides; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
}

/** point every UV of a geometry at one flat colour patch on the livery sheet */
function patch(g, which) {
  const [u, v] = PATCH[which];
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}

/**
 * World-scaled UVs by picking, per triangle, the axis its face points
 * along. Carbon weave and rubber look the same scale on a wishbone and on
 * the floor this way, which box and extrude UVs never manage.
 */
function triUV(geo, tile) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      const [U, V] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
      uv[(i + j) * 2] = U / tile; uv[(i + j) * 2 + 1] = V / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** strip a geometry to position/normal/uv, non-indexed, so any two can merge */
function prep(g) {
  let o = g.index ? g.toNonIndexed() : g;
  if (!o.attributes.normal) o.computeVertexNormals();
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k);
  return o;
}

function merge(list) {
  const prepared = list.map(prep);
  const withColor = prepared.some((g) => g.attributes.color);
  if (!withColor) prepared.forEach((g) => g.deleteAttribute('color'));
  return mergeGeometries(prepared);
}

/**
 * An aerofoil swept along a span.
 *
 * Everything is a function of x across the car: where the leading edge
 * is, how long the chord is, how high it sits and how steeply it is set.
 * That is what lets a front wing flap run low beside the nose and climb
 * toward the endplate in one piece.
 *
 * The chord points BACK and the angle lifts the trailing edge, which is
 * how a wing that pushes down is set. Thickness is a real NACA profile,
 * with a little camber bulging toward the road.
 */
function wingGeo({ x0, x1, M = 22, P = 14, zLE, chord, y, aoa, thick = 0.09, camber = 0.03 }) {
  const half = P / 2;
  const prof = [];
  const T = (t) => 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
  const at = (i) => (1 - Math.cos(Math.PI * i / half)) / 2;
  for (let i = half; i >= 0; i--) { const t = at(i); prof.push([t, -camber * 4 * t * (1 - t) + T(t)]); }
  for (let i = 1; i < half; i++) { const t = at(i); prof.push([t, -camber * 4 * t * (1 - t) - T(t)]); }
  const R = prof.length;
  const pos = [], idx = [];
  for (let j = 0; j <= M; j++) {
    const x = x0 + (x1 - x0) * (j / M);
    const c = chord(x), a = aoa(x), zl = zLE(x), yl = y(x);
    const dz = -Math.cos(a), dy = Math.sin(a);       // along the chord
    const nz = Math.sin(a), ny = Math.cos(a);        // square to it
    for (const [t, n] of prof) {
      pos.push(x, yl + dy * t * c + ny * n * c, zl + dz * t * c + nz * n * c);
    }
  }
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < R; k++) {
      const a = j * R + k, b = j * R + (k + 1) % R, c = a + R, d = b + R;
      idx.push(a, b, c, b, d, c);
    }
  }
  // end caps, with their own vertices
  for (const [j, flip] of [[0, false], [M, true]]) {
    const base = pos.length / 3;
    for (let k = 0; k < R; k++) pos.push(pos[(j * R + k) * 3], pos[(j * R + k) * 3 + 1], pos[(j * R + k) * 3 + 2]);
    for (let k = 1; k < R - 1; k++) idx.push(...(flip ? [base, base + k, base + k + 1] : [base, base + k + 1, base + k]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // same trick as the lofts: measure a top-surface triangle mid-span
  const p = g.attributes.position, ia = g.index.array;
  const q = (Math.floor(M / 2) * R + 2) * 6;
  const v = (i) => new THREE.Vector3(p.getX(ia[i]), p.getY(ia[i]), p.getZ(ia[i]));
  const nrm = new THREE.Vector3().crossVectors(v(q + 1).sub(v(q)), v(q + 2).sub(v(q)));
  if (nrm.y < 0) for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

/** a flat plate cut to an outline in the (z, y) plane, `thick` wide in x */
function plateZY(pts, thick, x) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  // the shape is drawn in (x, y) and extruded along z; turn it so its
  // drawing x becomes the car's z and its thickness runs across the car
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0,  0, 1, 0, 0,  1, 0, 0, 0,  0, 0, 0, 1));
  g.translate(x - thick / 2, 0, 0);
  // that matrix is a mirror, so the triangles have to be turned back round
  const ia = g.index ? g.index.array : null;
  if (ia) for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
  else {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  }
  g.computeVertexNormals();
  return g;
}

/** a flat plate cut to an outline in the (x, z) plane, lying at height y */
function plateXZ(pts, thick, y) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  g.computeVertexNormals();
  return g;
}

/** a round rod from a to b */
function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

/** a tube through points */
function tube(points, r, closed = false, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, seg, r, 8, closed);
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

function paintVerts(g, color) {
  g = prep(g);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// =====================================================================
// THE PARTS, BUILT ONCE PER SET OF DIMENSIONS AND SHARED BY EVERY CAR
// =====================================================================
const SHARED = new Map();

function parts(T) {
  const key = [T.wheelRadius, T.wheelbase, T.weightFront, T.trackWidth].join(':');
  if (SHARED.has(key)) return SHARED.get(key);

  const R = T.wheelRadius;
  const G = -R;                                   // the road
  const H = (h) => G + h;                         // metres above the road
  const HT = T.trackWidth / 2;
  const xf = T.wheelbase * (1 - T.weightFront);   // front axle, ahead of the CG
  const xr = -T.wheelbase * T.weightFront;        // rear axle, behind it

  // THE PARTS THAT CAN COME OFF are built into bins of their own - front
  // wing, each front endplate, rear wing, each mirror - so a crash can
  // take one away without the rest of the car. Everything else is 'body'.
  // `into` says which bin the pushes below are going to.
  const bins = {};
  let into = 'body';
  const bin = (m) => { bins[into] = bins[into] || { paint: [], carbon: [], dark: [] }; return bins[into][m]; };
  const paint = { push: (...g) => bin('paint').push(...g) };
  const carbon = { push: (...g) => bin('carbon').push(...g) };
  const dark = { push: (...g) => bin('dark').push(...g) };
  const bodyUV = (s, z) => uvIn(REG.A, s, z);

  // ---- THE SURVIVAL CELL ------------------------------------------------
  // A side view, row by row: where along the car, how wide, and the
  // heights of its underside and its top. The nose is a needle that
  // drops onto the front wing; the chassis is highest at the cockpit rim
  // and tapers into the gearbox and the crash structure behind it.
  const S = (z, w, hb, ht, top = 4, bot = 3, well = null) => ({ z, w, yb: H(hb), yt: H(ht), top, bot, well });
  // the cockpit well: half as wide as the opening, down to the seat line,
  // with `k` fading it in and out at the dash and behind the headrest
  const W = (hwid, k) => ({ w: hwid, y: H(0.36), k });
  paint.push(loft([
    S(xf + 1.03, 0.075, 0.140, 0.195, 2.2, 2.2),
    S(xf + 0.88, 0.150, 0.125, 0.245, 2.5, 2.4),
    S(xf + 0.62, 0.225, 0.112, 0.320, 2.8, 2.6),
    S(xf + 0.30, 0.290, 0.100, 0.410, 3.0, 2.8),
    S(xf + 0.00, 0.350, 0.090, 0.500, 3.2, 3.0),
    S(1.55,      0.450, 0.075, 0.585, 3.5, 3.0),
    S(1.15,      0.550, 0.065, 0.640, 3.8, 3.2),
    S(1.03,      0.580, 0.062, 0.655, 4.0, 3.3),
    S(0.97,      0.595, 0.061, 0.660, 4.0, 3.3, W(0.17, 1)),
    S(0.80,      0.620, 0.060, 0.665, 4.0, 3.4, W(0.19, 1)),
    S(0.30,      0.700, 0.060, 0.665, 4.0, 3.4, W(0.215, 1)),
    S(0.06,      0.725, 0.060, 0.662, 4.0, 3.4, W(0.21, 1)),
    S(-0.02,     0.735, 0.060, 0.661, 4.0, 3.4),
    S(-0.15,     0.740, 0.060, 0.660, 4.0, 3.4),
    S(-0.60,     0.640, 0.060, 0.620, 3.6, 3.2),
    S(-1.10,     0.500, 0.070, 0.560, 3.2, 3.0),
    S(xr,        0.360, 0.090, 0.470, 3.0, 2.8),
    S(xr - 0.40, 0.260, 0.120, 0.400, 2.8, 2.6),
    S(xr - 0.72, 0.160, 0.160, 0.340, 2.5, 2.4),
    S(xr - 0.86, 0.100, 0.190, 0.310, 2.2, 2.2),
  ], { N: 40, uv: bodyUV }));

  // ---- ENGINE COVER AND AIRBOX -------------------------------------------
  // It rises straight up behind the driver's head to the roll hoop intake
  // and falls away to a knife edge over the gearbox.
  paint.push(loft([
    S(0.13,  0.150, 0.620, 0.860, 2.2, 2.0),
    S(0.02,  0.250, 0.600, 0.945, 2.6, 2.4),
    S(-0.25, 0.320, 0.580, 0.960, 2.8, 2.6),
    S(-0.60, 0.340, 0.550, 0.880, 3.0, 2.6),
    S(-1.00, 0.290, 0.500, 0.745, 3.0, 2.6),
    S(-1.40, 0.210, 0.440, 0.610, 3.0, 2.6),
    S(-1.80, 0.120, 0.390, 0.490, 2.6, 2.4),
    S(-2.12, 0.050, 0.350, 0.405, 2.2, 2.2),
  ], { N: 20, uv: (s, z) => uvIn(REG.COVER, s, z) }));
  // the roll hoop intake, a dark mouth above the driver's head, split by
  // the pillar every car has in it
  {
    const mouth = ring({ w: 0.12, yb: H(0.70), yt: H(0.87), top: 2.6, bot: 2.2 }, 16);
    const s = new THREE.Shape(mouth.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(s); g.translate(0, 0, 0.12);
    dark.push(g);
    carbon.push(box(0.018, 0.17, 0.05, 0, H(0.785), 0.12));
  }

  // ---- SIDEPODS ---------------------------------------------------------
  // The inlet is a slot high on the pod, the underside is cut away
  // beneath it (the undercut), and the top falls toward the back of the
  // car as a ramp - the downwash shape every 2022 car has in some form.
  // Built for the left side and mirrored.
  const podSecs = (side) => [
    { z: 1.13,  cx: 0.50, w: 0.24, yb: H(0.32), yt: H(0.50), top: 2.6, bot: 2.2 },
    { z: 0.98,  cx: 0.54, w: 0.40, yb: H(0.24), yt: H(0.545), top: 3.0, bot: 2.4, under: 0.22 },
    { z: 0.62,  cx: 0.56, w: 0.49, yb: H(0.17), yt: H(0.555), top: 3.2, bot: 2.6, under: 0.40 },
    { z: 0.10,  cx: 0.55, w: 0.50, yb: H(0.12), yt: H(0.530), top: 3.2, bot: 2.8, under: 0.45 },
    { z: -0.40, cx: 0.50, w: 0.44, yb: H(0.10), yt: H(0.470), top: 3.0, bot: 2.8, under: 0.40 },
    { z: -0.90, cx: 0.42, w: 0.34, yb: H(0.08), yt: H(0.380), top: 2.8, bot: 2.8, under: 0.30 },
    { z: -1.30, cx: 0.33, w: 0.22, yb: H(0.07), yt: H(0.280), top: 2.6, bot: 2.6, under: 0.18 },
    { z: -1.62, cx: 0.26, w: 0.10, yb: H(0.07), yt: H(0.200), top: 2.4, bot: 2.4 },
  ].map((s) => ({ ...s, cx: s.cx * side }));
  for (const side of [1, -1]) {
    const secs = podSecs(side);
    paint.push(loft(secs, { N: 20, capFront: false, uv: (s, z) => uvIn(REG.POD, s * side, z) }));
    // The inlet: a dark cap set a couple of centimetres INSIDE the lip, so
    // the pod reads as a mouth with a wall round it rather than a lid.
    const r = ring({ ...secs[0], w: secs[0].w * 0.86, yb: secs[0].yb + 0.012, yt: secs[0].yt - 0.012 }, 20);
    const sh = new THREE.Shape(r.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(sh); g.translate(0, 0, secs[0].z - 0.02);
    dark.push(g);
  }

  // ---- THE SHARK FIN ----------------------------------------------------
  // Two painted faces a few millimetres apart rather than one solid plate,
  // because each face carries its own copy of the number.
  {
    const outline = [[-0.30, H(0.90)], [-0.34, H(0.985)], [-1.95, H(0.80)], [-2.02, H(0.62)], [-1.60, H(0.54)], [-0.80, H(0.78)]];
    for (const side of [1, -1]) {
      const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ShapeGeometry(sh);
      // drawing x -> car z, thickness offset in car x
      const p = g.attributes.position, uv = new Float32Array(p.count * 2);
      const R2 = side > 0 ? REG.FINL : REG.FINR;
      for (let i = 0; i < p.count; i++) {
        const z = p.getX(i), y = p.getY(i);
        p.setXYZ(i, side * 0.006, y, z);
        const [u, v] = uvIn(R2, z, y - G);
        uv[i * 2] = u; uv[i * 2 + 1] = v;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      // face +X on the left copy and -X on the right one
      const ia = g.index.array;
      const n0 = new THREE.Vector3().crossVectors(
        new THREE.Vector3().fromBufferAttribute(p, ia[1]).sub(new THREE.Vector3().fromBufferAttribute(p, ia[0])),
        new THREE.Vector3().fromBufferAttribute(p, ia[2]).sub(new THREE.Vector3().fromBufferAttribute(p, ia[0])));
      if (Math.sign(n0.x) !== side) for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
      g.computeVertexNormals();
      paint.push(g);
    }
  }

  // ---- COCKPIT ------------------------------------------------------------
  // The well itself is cut into the chassis loft above; this is the padded
  // rim round its edge, sitting a touch proud so the join never shows.
  {
    const outline = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const z = 0.50 + Math.sign(ca) * Math.pow(Math.abs(ca), 2 / 2.6) * 0.49;
      // wider behind the steering wheel than at the front
      const hwid = 0.215 * (0.78 + 0.22 * smooth(1.0, 0.3, z));
      outline.push([Math.sign(sa) * Math.pow(Math.abs(sa), 2 / 2.6) * hwid, z]);
    }
    dark.push(tube(outline.map(([x, z]) => [x, H(0.674), z]), 0.019, true, 60));
    // headrest pads either side of the helmet
    for (const s of [-1, 1]) dark.push(box(0.07, 0.07, 0.34, s * 0.175, H(0.69), 0.14));
  }

  // ---- THE HALO ----------------------------------------------------------
  // A hoop round the driver's head at eye level, on a single pillar up the
  // centre line in front of the cockpit and two feet behind it.
  {
    const hoop = [
      [0.345, H(0.645), -0.10], [0.365, H(0.725), 0.10], [0.315, H(0.775), 0.42],
      [0.16, H(0.79), 0.68], [0, H(0.795), 0.765],
      [-0.16, H(0.79), 0.68], [-0.315, H(0.775), 0.42], [-0.365, H(0.725), 0.10], [-0.345, H(0.645), -0.10],
    ];
    carbon.push(tube(hoop, 0.030, false, 60));
    carbon.push(tube([[0, H(0.635), 1.03], [0, H(0.72), 0.93], [0, H(0.785), 0.80]], 0.028, false, 12));
  }

  // ---- MIRRORS ------------------------------------------------------------
  for (const s of [-1, 1]) {
    into = s > 0 ? 'mirL' : 'mirR';
    carbon.push(rod([s * 0.34, H(0.64), 0.86], [s * 0.54, H(0.715), 0.83], 0.011, 6));
    carbon.push(rod([s * 0.36, H(0.60), 0.70], [s * 0.54, H(0.70), 0.80], 0.009, 6));
    paint.push(patch(box(0.17, 0.068, 0.075, s * 0.60, H(0.72), 0.83), 'body'));
    dark.push(box(0.15, 0.05, 0.004, s * 0.60, H(0.72), 0.791));
  }
  into = 'body';
  // the T-camera on top of the airbox
  carbon.push(box(0.05, 0.035, 0.13, 0, H(0.975), -0.02));

  // ---- THE FLOOR -----------------------------------------------------------
  // Most of the downforce, so it gets proper shape: it starts behind the
  // front wheels, runs out nearly to the full width, is cut in ahead of
  // the rear tyres, and has a raised edge along the side.
  {
    const hx = [[1.45, 0.24], [1.22, 0.60], [0.98, 0.86], [-0.95, 0.90], [-1.18, 0.80],
                [-1.42, 0.70], [-2.10, 0.62], [-2.24, 0.52]];
    const outline = [...hx.map(([z, x]) => [x, z]), ...hx.slice().reverse().map(([z, x]) => [-x, z])];
    carbon.push(plateXZ(outline, 0.024, H(0.030)));
    for (const s of [-1, 1]) {
      // the edge wing, with its scroll kicking up at the front
      carbon.push(box(0.012, 0.07, 1.86, s * 0.895, H(0.088), 0.02));
      carbon.push(box(0.012, 0.13, 0.20, s * 0.875, H(0.105), 0.98, 0, s * 0.12, 0));
      // the floor fences under the inlet, seen through the undercut
      for (const [x, z] of [[0.46, 1.05], [0.58, 1.00], [0.70, 0.96]]) {
        carbon.push(box(0.010, 0.10, 0.40, s * x, H(0.105), z - 0.18, 0, s * 0.10, 0));
      }
    }
    // THE DIFFUSER: the floor kicking up behind the rear axle, with its
    // walls and strakes. It is the one part of the underside a chase camera
    // actually shows.
    carbon.push(plateZY([[xr + 0.25, H(0.030)], [xr - 0.62, H(0.30)], [xr - 0.62, H(0.33)], [xr + 0.25, H(0.06)]], 0.86, 0));
    for (const x of [-0.43, -0.2, 0, 0.2, 0.43]) {
      carbon.push(plateZY([[xr + 0.10, H(0.03)], [xr - 0.62, H(0.03)], [xr - 0.62, H(0.30)]], 0.012, x));
    }
  }

  // ---- THE FRONT WING ------------------------------------------------------
  // A mainplane and three flaps that sit LOW beside the nose and CLIMB as
  // they run out toward the endplates - the 2022 shape, and the thing a
  // viewer recognises before anything else on the car.
  {
    into = 'fwing';
    const zW = xf + 1.06;
    // how far "outboard" a point on the span is: 0 beside the nose, 1 at
    // the endplate. The flaps are flat and low across the middle third,
    // which is the neutral section the rules demand, then climb.
    const out = (x) => smooth(0.20, 0.97, Math.abs(x));
    carbon.push(wingGeo({
      x0: -0.99, x1: 0.99,
      zLE: (x) => zW - 0.06 * out(x), chord: (x) => 0.30 - 0.05 * out(x),
      y: (x) => H(0.080 + 0.025 * out(x)), aoa: (x) => 0.05 + 0.12 * out(x), thick: 0.075, camber: 0.03,
    }));
    // THIN, with daylight between them. Thick flaps read as one fat
    // painted band; it is the slots that make it read as a wing.
    const flapCol = ['body', 'body', 'accent'];
    for (let k = 0; k < 3; k++) {
      paint.push(patch(wingGeo({
        x0: -0.978, x1: 0.978,
        zLE: (x) => zW - 0.205 - k * 0.075 - 0.07 * out(x),
        chord: (x) => 0.125 - k * 0.018 + 0.01 * out(x),
        y: (x) => H(0.122 + k * 0.033 + (0.045 + k * 0.060) * out(x) ** 1.4),
        aoa: (x) => 0.32 + k * 0.22 + 0.30 * out(x), thick: 0.06, camber: 0.035,
      }), flapCol[k]));
    }
    // the endplates, low and rounded into the flaps
    for (const s of [-1, 1]) {
      into = s > 0 ? 'epL' : 'epR';
      paint.push(patch(plateZY([[zW + 0.01, H(0.05)], [zW - 0.60, H(0.05)], [zW - 0.64, H(0.16)],
        [zW - 0.56, H(0.33)], [zW - 0.40, H(0.345)], [zW - 0.16, H(0.21)], [zW + 0.02, H(0.11)]], 0.012, s * 0.99), 'body'));
      // the footplate under it
      carbon.push(box(0.05, 0.012, 0.62, s * 0.975, H(0.052), zW - 0.30));
    }
    into = 'fwing';
    // the nose meets the mainplane on two short pillars
    for (const s of [-1, 1]) carbon.push(box(0.02, 0.07, 0.12, s * 0.035, H(0.125), zW - 0.10));
    into = 'body';
  }

  // ---- THE REAR WING -------------------------------------------------------
  // A spoon-shaped mainplane whose tips roll down into the endplates, the
  // DRS flap above it (built separately, because it moves), a beam wing
  // underneath and a single swan-neck pylon holding it up from behind.
  const zR = xr - 0.53;               // mainplane leading edge
  {
    into = 'rwing';
    const tip = (x) => smooth(0.34, 0.50, Math.abs(x));
    carbon.push(wingGeo({
      x0: -0.50, x1: 0.50,
      zLE: () => zR, chord: () => 0.30,
      y: (x) => H(0.80 - 0.10 * tip(x) + 0.025 * (1 - Math.abs(x) / 0.5)), aoa: (x) => 0.12 + 0.14 * tip(x), thick: 0.09,
    }));
    // Endplates cut away low at the back, the way the 2022 ones are, so
    // the wing reads as a wing and not as a box on the back of the car.
    for (const s of [-1, 1]) {
      paint.push(patch(plateZY([[zR + 0.05, H(0.58)], [zR + 0.05, H(0.87)], [zR - 0.03, H(0.975)],
        [zR - 0.42, H(1.00)], [zR - 0.49, H(0.93)], [zR - 0.44, H(0.72)], [zR - 0.18, H(0.56)]], 0.014, s * 0.51), 'body'));
    }
    // the beam wing, two small elements low over the diffuser
    into = 'body';
    for (let k = 0; k < 2; k++) {
      carbon.push(wingGeo({ x0: -0.36, x1: 0.36, M: 8, zLE: () => xr - 0.60 - k * 0.10, chord: () => 0.12,
        y: () => H(0.36 + k * 0.05), aoa: () => 0.25 + k * 0.35, thick: 0.12 }));
    }
    // the swan neck: up behind the mainplane and hooked over its top
    into = 'rwing';
    for (const s of [-1, 1]) {
      carbon.push(plateZY([[zR - 0.48, H(0.30)], [zR - 0.40, H(0.30)], [zR - 0.30, H(0.86)], [zR - 0.20, H(0.90)],
        [zR - 0.12, H(0.865)], [zR - 0.14, H(0.845)], [zR - 0.26, H(0.82)], [zR - 0.37, H(0.62)]], 0.024, s * 0.05));
    }
    // crash structure tip and the exhaust above it
    into = 'body';
    carbon.push(box(0.10, 0.10, 0.16, 0, H(0.25), xr - 0.90));
    const ex = new THREE.CylinderGeometry(0.048, 0.052, 0.20, 16, 1, true);
    ex.rotateX(Math.PI / 2); ex.translate(0, H(0.38), xr - 0.68);
    carbon.push(ex);
    const exIn = new THREE.CircleGeometry(0.046, 16); exIn.rotateY(Math.PI); exIn.translate(0, H(0.38), xr - 0.77);
    dark.push(exIn);
  }

  // the DRS flap, in its own local space: the PIVOT IS ITS TRAILING EDGE,
  // so rotation.x = -0.55 lifts the leading edge and opens the slot, the
  // way the real one flattens out
  const FLAP_A = 0.78, FLAP_C = 0.21;
  const flapGeo = prep(patch(wingGeo({
    x0: -0.49, x1: 0.49,
    zLE: () => FLAP_C * Math.cos(FLAP_A), chord: () => FLAP_C,
    y: (x) => -FLAP_C * Math.sin(FLAP_A) - 0.08 * smooth(0.36, 0.49, Math.abs(x)),
    aoa: () => FLAP_A, thick: 0.12, camber: 0.05,
  }), 'accent'));
  const flapPivot = [0, H(0.985), zR - 0.43];

  // ---- WHEELS --------------------------------------------------------------
  const rimR = R * 0.64;              // an 18 inch rim in a 720 mm tyre
  const tyreGeo = (w) => {
    const hw = w / 2;
    const pts = [[rimR, -hw], [R * 0.955, -hw], [R * 0.992, -hw * 0.86], [R, -hw * 0.55],
                 [R, hw * 0.55], [R * 0.992, hw * 0.86], [R * 0.955, hw], [rimR, hw]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 40);
    g.rotateZ(Math.PI / 2);
    return prep(g);
  };
  const decalGeo = (w) => {
    const hw = w / 2, list = [];
    for (const s of [-1, 1]) {
      const side = new THREE.RingGeometry(rimR * 1.005, R * 0.955, 48, 1);
      const cover = new THREE.CircleGeometry(rimR * 1.01, 40);
      // remap each disc into its half of the wheel atlas
      for (const [g, u0] of [[side, 0], [cover, 0.5]]) {
        const uv = g.attributes.uv;
        const outer = g === side ? R * 0.955 : rimR * 1.01;
        const p = g.attributes.position;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + (p.getX(i) / outer * 0.5 + 0.5) * 0.5, p.getY(i) / outer * 0.5 + 0.5);
        }
        g.rotateY(s * Math.PI / 2);
        g.translate(s * (g === side ? hw + 0.002 : hw - 0.008), 0, 0);
        list.push(g);
      }
    }
    return merge(list);
  };

  // ---- the corner hardware: brake duct, and the front wheel deflector ------
  const cornerGeo = (front, side, w) => {
    const hw = w / 2, inb = -side;
    const list = [];
    const drum = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20);
    drum.rotateZ(Math.PI / 2); drum.translate(inb * (hw + 0.07), 0, 0);
    list.push(drum);
    list.push(box(0.05, 0.30, 0.10, inb * (hw + 0.15), 0, 0));
    if (front) {
      // the little winglet arched over the top of the front tyre
      const arc = new THREE.CylinderGeometry(R + 0.035, R + 0.035, 0.09, 12, 1, true, 0.30, 1.05);
      arc.rotateZ(Math.PI / 2); arc.translate(inb * (hw * 0.45), 0, 0);
      list.push(arc);
      const arc2 = arc.clone();
      list.push(box(0.012, 0.16, 0.06, inb * (hw * 0.45 + 0.05), R * 0.62, R * 0.62, 0.8, 0, 0));
      arc2.dispose();
    }
    return triUV(merge(list), 0.06);
  };

  // ---- THE DRIVER ------------------------------------------------------------
  // Positioned in the driver group's own space; the group sits at z 0.50,
  // height 0.60 above the road, which is where main.js leans it from.
  const DZ = 0.50, DY = H(0.60);
  const d = (x, h, z) => [x, H(h) - DY, z - DZ];
  const helmetC = d(0, 0.785, 0.30);
  const suit = [];
  suit.push(rod(d(-0.13, 0.64, 0.17), d(0.13, 0.64, 0.17), 0.075, 10));     // shoulders
  suit.push(rod(d(0, 0.62, 0.20), d(0, 0.70, 0.26), 0.065, 10));            // HANS and neck
  for (const s of [-1, 1]) {
    // the elbows tuck inside the cockpit walls, as they have to
    const sh = d(s * 0.155, 0.645, 0.20), el = d(s * 0.175, 0.57, 0.46), hand = d(s * 0.125, 0.645, 0.71);
    suit.push(rod(sh, el, 0.042));
    suit.push(rod(el, hand, 0.036));
  }
  const gloves = [-1, 1].map((s) => {
    const g = new THREE.SphereGeometry(0.038, 10, 8); g.scale(1, 1.3, 1);
    g.translate(...d(s * 0.125, 0.645, 0.72));
    return g;
  });

  // ---- THE STEERING WHEEL ------------------------------------------------------
  // In the wheel's own space: it faces -Z, toward the driver, and spins
  // about its own Z. The column tilt lives on a parent group, so spinning
  // this one never tips it.
  // A REAL ONE, not three boxes. A modern Formula 1 wheel is not round: it
  // is a flat carbon plate with a screen in the middle of it, a grip either
  // side that your hands never leave, buttons and rotaries across the face,
  // and paddles behind. The old one was a slab, a pair of blocks and a lit
  // stripe, which read as a toy in the one camera that looks straight at it.
  //
  //   FACE      a rounded plate, bevelled, with a cut-out along the top so
  //             the screen sits in a recess rather than on a shelf
  //   GRIPS     capsules, angled out and swept back towards the hands, with
  //             a thumb pad on the inside of each
  //   SCREEN    a live display: the gear, the speed and the shift lights,
  //             painted onto a canvas that main.js updates - see
  //             wheelScreen() below. One canvas, shared by every car.
  //   PADDLES   two long shift paddles and two short clutch paddles behind
  //             it, which main.js pulls when a gear is taken
  const WW = 0.145, WH = 0.072;                        // half width, half height of the plate
  const plate = (() => {
    const sh = new THREE.Shape();
    const r = 0.022, w = WW, h = WH;
    sh.moveTo(-w + r, -h);
    sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r);
    sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h);
    // the top edge dips in the middle, the way the rules make them
    sh.lineTo(0.052, h); sh.quadraticCurveTo(0, h - 0.016, -0.052, h);
    sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r);
    sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -0.012);
    return g;
  })();
  const wheelBody = [plate];
  // the recess the screen sits in, and the boss the column bolts to
  wheelBody.push(box(0.118, 0.062, 0.006, 0, 0.004, -0.014));
  wheelBody.push(new THREE.CylinderGeometry(0.028, 0.034, 0.05, 12).rotateX(Math.PI / 2).translate(0, 0, 0.03));
  // THE GRIPS: a capsule leaning out at the top and swept back towards the
  // driver, which is what makes the wheel look held rather than mounted
  const grips = [];
  for (const s of [-1, 1]) {
    const g = new THREE.CapsuleGeometry(0.023, 0.10, 6, 12);
    g.scale(1, 1, 1.5);                                // flattened front to back, as they are
    const m = new THREE.Matrix4().makeRotationZ(-s * 0.14).multiply(new THREE.Matrix4().makeRotationX(0.25));
    g.applyMatrix4(m);
    g.translate(s * (WW - 0.012), -0.012, -0.014);
    grips.push(g);
    // the thumb pad on the inside of each grip
    grips.push(box(0.03, 0.036, 0.012, s * (WW - 0.042), 0.026, -0.021, 0, 0, -s * 0.14));
  }
  // BUTTONS AND ROTARIES on the face, in the team's accent colour: six
  // round buttons in two rows and a dial in each bottom corner
  const knob = (x, y, r = 0.009, d = 0.008) => new THREE.CylinderGeometry(r, r * 0.92, d, 12).rotateX(Math.PI / 2).translate(x, y, -0.02);
  const wheelLeds = merge([
    knob(-0.088, 0.03), knob(-0.088, 0.002), knob(0.088, 0.03), knob(0.088, 0.002),
    knob(-0.088, -0.026, 0.007), knob(0.088, -0.026, 0.007),
    knob(-0.118, -0.036, 0.016, 0.012), knob(0.118, -0.036, 0.016, 0.012),
  ]);
  // the dark plastic the buttons sit in, and the paddles behind
  const wheelDark = merge([
    box(0.034, 0.10, 0.01, -0.088, 0.004, -0.017), box(0.034, 0.10, 0.01, 0.088, 0.004, -0.017),
  ]);
  const paddleGeo = (long) => {
    const sh = new THREE.Shape();
    const h = long ? 0.052 : 0.030, w = long ? 0.056 : 0.032;
    sh.moveTo(0, -h); sh.lineTo(w, -h * 0.55); sh.lineTo(w, h * 0.7); sh.lineTo(0, h); sh.lineTo(0, -h);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false });
    g.rotateY(-0.25);
    return g;
  };
  // ROTATE, THEN MOVE. A plane faces +Z; the driver is on the wheel's -Z
  // side. Turning it after moving it swung it round to the far side of the
  // plate, where it was hidden inside the carbon.
  const wheelScreenGeo = new THREE.PlaneGeometry(0.104, 0.052);
  wheelScreenGeo.rotateY(Math.PI);
  wheelScreenGeo.translate(0, 0.004, -0.0175);

  // The breakable pieces are re-centred on their own middle, so a wing that
  // comes off tumbles about itself and not about the car's centre of mass.
  const pieces = {};
  for (const [name, b] of Object.entries(bins)) {
    if (name === 'body') continue;
    const geo = {
      paint: b.paint.length ? merge(b.paint) : null,
      carbon: b.carbon.length ? triUV(merge(b.carbon), 0.06) : null,
      dark: b.dark.length ? merge(b.dark) : null,
    };
    const bb = new THREE.Box3();
    for (const g of Object.values(geo)) if (g) { g.computeBoundingBox(); bb.union(g.boundingBox); }
    const c = bb.getCenter(new THREE.Vector3());
    for (const g of Object.values(geo)) if (g) { g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere(); }
    pieces[name] = { ...geo, center: [c.x, c.y, c.z] };
  }

  const set = {
    R, G, H, xf, xr, HT, rimR,
    paint: merge(bins.body.paint),
    carbon: triUV(merge(bins.body.carbon), 0.06),
    dark: merge(bins.body.dark),
    pieces,
    flap: flapGeo, flapPivot,
    tyre: { front: tyreGeo(0.34), rear: tyreGeo(0.42) },
    decal: { front: decalGeo(0.34), rear: decalGeo(0.42) },
    corner: {
      front: [cornerGeo(true, -1, 0.34), cornerGeo(true, 1, 0.34)],
      rear:  [cornerGeo(false, -1, 0.42), cornerGeo(false, 1, 0.42)],
    },
    driverPos: [0, DY, DZ],
    suit: merge(suit), gloves: merge(gloves),
    helmet: (() => { const g = new THREE.SphereGeometry(0.135, 28, 18); g.scale(1, 1.03, 1.12); g.translate(...helmetC); return g; })(),
    visor: (() => {
      const g = new THREE.SphereGeometry(0.1375, 24, 6, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.40, Math.PI * 0.14);
      g.scale(1, 1.03, 1.12); g.translate(...helmetC); return g;
    })(),
    wheelBody: triUV(merge(wheelBody), 0.05), wheelGrips: triUV(merge(grips), 0.05), wheelLeds, wheelDark,
    wheelScreen: wheelScreenGeo, paddleLong: paddleGeo(true), paddleShort: paddleGeo(false),
    steerPos: [0, H(0.645), 0.73],
    arm: new THREE.BoxGeometry(1, 1, 1),
  };
  SHARED.set(key, set);
  return set;
}

// materials that no car owns
let MATS = null;
// HOW MUCH OF THE WORLD EACH SURFACE SHOWS. scene.environment (main.js)
// is deliberately gentle, because it lights the grass and the grandstands
// too and an over-lit landscape looks like fog. The car is the thing you
// look at, so its materials are told to take MORE of it than the scene
// default: polished paint and a visor are nearly mirrors, carbon is a
// half-mirror, rubber is not a mirror at all.
function mats() {
  if (MATS) return MATS;
  const carbonTex = carbonTexture();
  MATS = {
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTex, roughness: 0.42, metalness: 0.25,
      clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.93, metalness: 0.0, envMapIntensity: 0.6 }),
    wheel: new THREE.MeshStandardMaterial({ map: wheelTexture(0.64 / 0.955), roughness: 0.38, metalness: 0.85, envMapIntensity: 2.0 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x10131a, roughness: 0.06, metalness: 0.7, clearcoat: 1,
      iridescence: 0.7, iridescenceIOR: 1.6, envMapIntensity: 2.4 }),
    suit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    display: new THREE.MeshBasicMaterial({ map: wheelScreen().texture, toneMapped: false }),
    grip: new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.85 }),
  };
  return MATS;
}

const LIVERY_MATS = new Map();
function liveryMats(lv) {
  const key = [lv.body, lv.accent, lv.trim, lv.number, lv.name].join('|');
  if (LIVERY_MATS.has(key)) return LIVERY_MATS.get(key);
  const m = {
    paint: new THREE.MeshPhysicalMaterial({ map: liveryTexture(lv), roughness: 0.34, metalness: 0.2,
      clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ map: helmetTexture(lv), roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.7 }),
    suit: new THREE.MeshStandardMaterial({ color: lv.body, roughness: 0.82 }),
    leds: new THREE.MeshBasicMaterial({ color: lv.accent }),
  };
  LIVERY_MATS.set(key, m);
  return m;
}

/**
 * Build the car.
 *
 * Returns the group plus handles for everything that has to move: the
 * four wheels, the two front uprights that steer, the wishbones that
 * follow the suspension, the driver, the steering wheel and the DRS flap.
 */
export function buildCar(T, livery = {}) {
  const lv = { ...DEFAULT_LIVERY, ...livery };
  const P = parts(T);
  const M = mats();
  const L = liveryMats(lv);
  const car = new THREE.Group();

  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = shadow;
    car.add(m);
    return m;
  };
  add(P.paint, L.paint);
  add(P.carbon, M.carbon);
  add(P.dark, M.dark, false);

  const bodyPaint = car.children[0];

  // ---- THE PIECES THAT CAN BREAK OFF -------------------------------------
  // Each is a group at its own centre. damage.js hides it on the car and
  // throws a copy of it down the road.
  const pieces = {};
  for (const [name, pc] of Object.entries(P.pieces)) {
    const grp = new THREE.Group();
    grp.position.set(...pc.center);
    grp.name = name;
    for (const [k, mat] of [['paint', L.paint], ['carbon', M.carbon], ['dark', M.dark]]) {
      if (!pc[k]) continue;
      const m = new THREE.Mesh(pc[k], mat);
      m.castShadow = k !== 'dark';
      grp.add(m);
    }
    car.add(grp);
    pieces[name] = grp;
  }

  // the DRS flap lives in the rear wing, so it goes when the wing goes
  const flap = new THREE.Mesh(P.flap, L.paint);
  const rc = P.pieces.rwing.center;
  flap.position.set(P.flapPivot[0] - rc[0], P.flapPivot[1] - rc[1], P.flapPivot[2] - rc[2]);
  flap.castShadow = true;
  pieces.rwing.add(flap);

  // the rain light: its own material, because main.js switches it
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x33060a, emissive: 0x000000, roughness: 0.4 }));
  rainLight.position.set(0, P.H(0.27), P.xr - 0.985);
  car.add(rainLight);

  // ---- the driver -----------------------------------------------------------
  const driver = new THREE.Group();
  driver.position.set(...P.driverPos);
  driver.add(new THREE.Mesh(P.suit, L.suit));
  driver.add(new THREE.Mesh(P.gloves, M.dark));
  const helmet = new THREE.Group();
  const shell = new THREE.Mesh(P.helmet, L.helmet); shell.castShadow = true;
  helmet.add(shell);
  helmet.add(new THREE.Mesh(P.visor, M.visor));
  driver.add(helmet);
  car.add(driver);

  // ---- the steering wheel ------------------------------------------------------
  // THE COLUMN tilts the wheel so its face looks up and back at the
  // driver; THE WHEEL inside it spins about its own axis. With +X on the
  // left, a NEGATIVE rotation.z moves the top of the wheel to the left,
  // so main.js drives it with -steer.
  const column = new THREE.Group();
  column.position.set(...P.steerPos);
  column.rotation.x = 0.42;
  const steerWheel = new THREE.Group();
  steerWheel.add(new THREE.Mesh(P.wheelBody, M.carbon));
  steerWheel.add(new THREE.Mesh(P.wheelGrips, M.grip));
  steerWheel.add(new THREE.Mesh(P.wheelDark, M.dark));
  steerWheel.add(new THREE.Mesh(P.wheelLeds, L.leds));
  steerWheel.add(new THREE.Mesh(P.wheelScreen, M.display));
  // THE PADDLES, behind the wheel: the long pair change gear, the short
  // pair are the clutch. main.js pulls one when a gear is taken.
  const paddles = [];
  for (const s of [-1, 1]) {
    for (const [geo, y, len] of [[P.paddleLong, 0.0, true], [P.paddleShort, -0.055, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.035, y, 0.012);
      const m = new THREE.Mesh(geo, M.dark);
      m.scale.x = s;
      pivot.add(m);
      steerWheel.add(pivot);
      if (len) paddles.push(pivot);
    }
  }
  column.add(steerWheel);
  car.add(column);

  // ---- WHEELS, UPRIGHTS AND WISHBONES -------------------------------------------
  //
  // Each corner is: a hub group that MOVES UP AND DOWN with the
  // suspension, a steer group inside it that yaws for the front wheels,
  // and the wheel itself inside that which spins. Nesting them that way
  // means the three motions cannot fight each other.
  const wheels = [], hubs = [], steers = [], arms = [];
  const corner = [
    { x: -P.HT, z: P.xf, front: true },   // 0 front right
    { x:  P.HT, z: P.xf, front: true },   // 1 front left
    { x: -P.HT, z: P.xr, front: false },  // 2 rear right
    { x:  P.HT, z: P.xr, front: false },  // 3 rear left
  ];

  // THE WISHBONES ARE ONE INSTANCED MESH. Twenty-two separate arms would
  // be twenty-two draw calls on every car on the grid; as instances they
  // are one, and updateArms() rewrites their matrices each frame.
  const armSpecs = [];
  for (let k = 0; k < 4; k++) {
    const c = corner[k];
    const hub = new THREE.Group();
    hub.position.set(c.x, 0, c.z);
    car.add(hub);
    hubs.push(hub);

    const steer = new THREE.Group();
    hub.add(steer);
    steers.push(steer);

    const w = c.front ? 0.34 : 0.42;
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(c.front ? P.tyre.front : P.tyre.rear, M.rubber);
    tyre.castShadow = true; tyre.receiveShadow = true;
    wheel.add(tyre);
    wheel.add(new THREE.Mesh(c.front ? P.decal.front : P.decal.rear, M.wheel));
    steer.add(wheel);
    wheels.push(wheel);

    const side = Math.sign(c.x);
    const hw = w / 2;
    steer.add(new THREE.Mesh((c.front ? P.corner.front : P.corner.rear)[side > 0 ? 1 : 0], M.carbon));

    // `from` is a point on the chassis, `to` is a point on the upright in
    // the HUB's space (and, for the track rod, in the STEER's space, so it
    // swings with the steering). Upper and lower wishbones, each a pair of
    // legs, plus the push rod.
    const inb = -side;
    const bones = [
      { from: [side * 0.24, P.H(0.50), c.z + 0.30], to: [inb * (hw + 0.12), 0.13, 0], t: [0.06, 0.018] },
      { from: [side * 0.24, P.H(0.50), c.z - 0.28], to: [inb * (hw + 0.12), 0.13, 0], t: [0.06, 0.018] },
      { from: [side * 0.26, P.H(0.16), c.z + 0.34], to: [inb * (hw + 0.12), -0.14, 0], t: [0.07, 0.020] },
      { from: [side * 0.26, P.H(0.16), c.z - 0.32], to: [inb * (hw + 0.12), -0.14, 0], t: [0.07, 0.020] },
      { from: [side * 0.22, P.H(c.front ? 0.56 : 0.30), c.z - 0.05], to: [inb * (hw + 0.14), c.front ? -0.12 : 0.10, 0.02], t: [0.03, 0.03] },
    ];
    if (c.front) bones.push({ from: [side * 0.22, P.H(0.40), c.z + 0.12], to: [inb * (hw + 0.13), 0.02, 0.13], t: [0.035, 0.02], steered: true });
    for (const b of bones) armSpecs.push({ k, from: new THREE.Vector3(...b.from), to: new THREE.Vector3(...b.to), t: b.t, steered: !!b.steered });
    arms.push(bones);
  }
  const armMesh = new THREE.InstancedMesh(P.arm, M.carbon, armSpecs.length);
  armMesh.castShadow = true;
  armMesh.frustumCulled = false;
  car.add(armMesh);

  const dummy = new THREE.Object3D();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  function updateArms() {
    armSpecs.forEach((s, i) => {
      const hub = hubs[s.k];
      b.copy(s.to);
      if (s.steered) b.applyAxisAngle(new THREE.Vector3(0, 1, 0), steers[s.k].rotation.y);
      b.add(hub.position);
      a.copy(s.from);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.scale.set(s.t[0], s.t[1], Math.max(0.02, a.distanceTo(b)));
      dummy.lookAt(b);
      dummy.updateMatrix();
      armMesh.setMatrixAt(i, dummy.matrix);
    });
    armMesh.instanceMatrix.needsUpdate = true;
  }
  updateArms();

  const art = {
    group: car, wheels, hubs, steers, arms, driver, helmet, steerWheel, paddles,
    drsFlap: flap, rainLight, floorY: P.H(0.03),
    updateArms,
    // for damage.js: the painted body it dents and scratches, the shared
    // originals to put back, and the pieces it can knock off
    bodyPaint, pieces, sharedPaint: P.paint, liveryMat: L.paint, R: P.R,
    /** undo every scratch, dent and missing part - for a car reused next session */
    repair() {
      if (bodyPaint.geometry !== P.paint) { bodyPaint.geometry.dispose(); bodyPaint.geometry = P.paint; }
      if (art.ownPaint) {
        art.ownPaint.map.dispose(); art.ownPaint.dispose(); art.ownPaint = null;
        car.traverse((o) => { if (o.material && o.userData.paint) o.material = L.paint; });
      }
      art.canvas = null;
      for (const p of Object.values(pieces)) p.visible = true;
      for (const w of wheels) { w.visible = true; w.children[0].visible = true; }
      art.dents = 0;
    },
  };
  car.traverse((o) => { if (o.material === L.paint) o.userData.paint = true; });
  return art;
}
