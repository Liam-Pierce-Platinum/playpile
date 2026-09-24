// =====================================================================
// NASCAR :: body.js - THE CARS, BUILT OUT OF NUMBERS
// =====================================================================
//
// No model files. Every car in the field is generated from a table of
// cross sections and a canvas of paint.
//
// Liam, twice: "car models still look bad make them look better based off
// of real nascars this time". The two things wrong with the version
// before this one were a material and a silhouette:
//
//   THE PAINT WAS METAL. metalness 0.55 means 55% of the albedo is thrown
//   away into a specular reflection of the environment, and the flank of
//   a car is a VERTICAL surface - what it reflects is the asphalt. So
//   every door in the field rendered as a black slab with a stripe of sky
//   on the shoulder, and no livery on earth was going to show through
//   that. Real automotive paint is a dielectric: metalness ~0, and a
//   clear coat over the top for the gloss.
//
//   THERE WERE NO WHEEL ARCHES. The sections ran down to one rocker line
//   the whole length of the car, so the bodywork was a skirt that buried
//   the tyres, and a stock car with its wheels inside a box reads as a
//   panel van. A Cup car's shape is ARCHES: the body is widest over the
//   axles, flares over the rubber, and tucks in between them.
//
// What a Gen-7 Cup car actually is, and what is in here now:
//
//   SYMMETRICAL, WIDE, LOW. 5.2 m over a 2.79 m wheelbase, 2.08 m over
//   the arches, a roof 1.35 m off the road.
//   FLARED ARCHES over all four wheels with a real opening cut through
//   the sheet metal, a lip that stands proud of the door, and an inner
//   liner behind it so you cannot see daylight through the car.
//   A TUCKED ROCKER between the arches - the narrowest part of the car
//   at its lowest point, which is what gives the side its shape.
//   A SHOULDER LINE: a crease just below the beltline running the length
//   of the car, the single most important line on any road car.
//   A SPLITTER projecting forward at road level with two dive planes.
//   A FASCIA that reads as a face: headlight graphics, a full-width lower
//   grille, an upper slot and a marque badge, all painted onto the flat
//   front panel because that is exactly what a Cup car's nose is.
//   A TAIL PANEL with the number on it and a light signature, because the
//   back of the car is the view most of a race is watched from.
//   A SPOILER on a deck with two side plates, and a diffuser under it.
//   FIVE-SPOKE CENTRE-LOCK WHEELS with one big lug, a real dish you can
//   see into, and slicks with lettering on the sidewall.
//   THE GREENHOUSE IS OPEN. No side glass on the driver's side at all: a
//   window net, and behind it the cage, the seat and the driver.
//
// ---------------------------------------------------------------------
// THREE MARQUES - all invented, no real manufacturer appears anywhere
// ---------------------------------------------------------------------
//
//   KESTREL  the fastback. Low roof set well back, long shallow rear
//            window into a high deck, slim full-width lamps.
//   CALDERA  the brick. Upright greenhouse, flat roof, tall square tail,
//            stacked quad headlights and a big rectangular grille.
//   AXIOM    the coupe. Short roof pulled forward, steep rear window, a
//            deck that tapers away, round lamps front and back.
//
// They differ in roofline, nose, tail and light signature, which are the
// four things you can actually tell apart from a chase camera.
//
// ---------------------------------------------------------------------
// MODEL SPACE MATCHES THE PHYSICS, deliberately
// ---------------------------------------------------------------------
//   +Z is FORWARD   (physics body X)
//   +X is LEFT      (physics body Y)
//   +Y is UP, and the WHEEL CENTRES are at y = 0
// so a wheel the physics calls (forward 1.34, left -0.86) is placed at
// (x -0.86, z 1.34) and nothing is ever converted.
//
// ---------------------------------------------------------------------
// THE COST
// ---------------------------------------------------------------------
// The field is twenty-four cars, so GEOMETRY IS SHARED: one shell, one
// greenhouse, one set of wheels per marque, merged per material and built
// three times for the whole grid. Only the livery canvas differs per car.
// One car is 18 draw calls; see tools/car.mjs for the count it measures.
//
// ---------------------------------------------------------------------
// THE SKIN IS BOUND TO THE DAMAGE MODEL
// ---------------------------------------------------------------------
//
// damage.js owns a deformation FIELD: a lattice of nodes on each panel
// with a depth each. It has no idea what a car looks like. This file does
// the other half: every vertex of the painted shell is bound ONCE, at
// build time, to the one or two panels near it - with a weight and with
// where it sits inside each panel's lattice. Pushing the metal in is then
// one pass over the vertex list.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { PANELS } from './damage.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const mix = (a, b, t) => a + (b - a) * t;
const DEFAULT = {
  body: 0x1b3fa0, accent: 0xf5a623, trim: 0xf2f4f7, number: 4, name: 'CARBIDE',
  make: 'falcon', pattern: 0, wheel: 0xb4bac2, dirt: 0,
};

// =====================================================================
// THE LIVERY SHEET - one canvas per car, and where everything lives on it
// =====================================================================
//
// The shell's UVs are a SURFACE PARAMETER, fixed for every section, so
// the same number means the same place on the car at every point down its
// length. u runs from the arch lip up over the shoulder to the top
// centre; v is simply z, the car's own length in metres.
//
//   1.00           the arch lip / the bottom of the rocker
//   1.08 .. 1.66   THE FLANK - the door, the number panel, the sponsor
//   1.72           the shoulder crease
//   1.78           the beltline
//   1.90 .. 2.55   the bonnet and the deck lid, which meet at the top
//                  centre - so this band appears TWICE, mirrored
//
// and four things get their own patch of the sheet because they are not
// part of the loft at all: the roof, the sail panels, the front fascia
// and the tail panel.
//
// The first version used the REAL ARC LENGTH from the bottom centre, and
// the arc changes enormously down a car, so a band drawn across the door
// was the door in the middle and the bonnet at the front. A parameter
// that is the same at every station is the whole trick.
const U_AT = [1.00, 1.08, 1.22, 1.42, 1.60, 1.72, 1.78, 1.90, 2.26, 2.55];
const U_BELT = 1.78, U_TOP = 2.55;
const TEX = 1024;
// the region is SQUARE in metres so a pixel is square: text drawn on the
// sheet comes out the same shape wherever on the car it lands
const REG = { u0: -3.00, u1: 4.60, v0: -2.90, v1: 4.70 };
const uvOf = (s, z) => [(s - REG.u0) / (REG.u1 - REG.u0), (z - REG.v0) / (REG.v1 - REG.v0)];

const ROOF_U0 = 2.80, ROOF_U1 = 3.48;      // the roof, mapped across its width
const SAIL_U0 = 2.58, SAIL_U1 = 2.76;      // the sail panels, above the beltline
const FACE = { u: -1.70, v: 3.30 };        // the front fascia, x -> u, y -> v
const TAIL = { u: 1.70, v: 3.30 };         // the tail panel, -x -> u, y -> v
const BANNER = { u0: -2.75, u1: -0.65, v0: 3.98, v1: 4.32 };
const APOST = { u0: -0.42, u1: -0.12, v0: 3.86, v1: 4.50 };
const BLADE = { u0: 0.65, u1: 2.75, v0: 4.00, v1: 4.40 };
const PATCH = {
  body: [3.10, 3.25], accent: [3.42, 3.25], trim: [3.74, 3.25],
  dark: [4.06, 3.25], chrome: [4.38, 3.25],
};

const faceUV = (x, y) => uvOf(FACE.u + x, FACE.v + y);
const tailUV = (x, y) => uvOf(TAIL.u - x, TAIL.v + y);

// =====================================================================
// THE THREE MARQUES
// =====================================================================
//
// A table of cross sections down the length of the car. At each z:
//   hw    half width at the beltline
//   belt  the beltline, which is the top of the door
//   dome  how far the bonnet or deck lid rises above the beltline
//
// The ARCHES are not in the table - they are computed from where the
// wheels actually are, so the openings cannot drift away from the rubber.
// THE FENDERS HAVE TO COVER THE TYRES: a 1.72 m track on 0.35 m wide
// rear slicks puts the outside of the rubber at 1.035 from centre, so the
// arch lip has to reach 1.04 and no less, or the wheels stick out and it
// reads as a kit car.
const MAKES = {
  falcon: {
    name: 'KESTREL', badge: 'K',
    keys: [
      [-2.58, 0.905, 0.490, 0.008], [-2.35, 0.955, 0.500, 0.018],
      [-1.95, 0.995, 0.510, 0.035], [-1.45, 1.000, 0.530, 0.040],
      [-0.95, 0.975, 0.545, 0.028], [0.00, 0.962, 0.550, 0.028],
      [0.95, 0.975, 0.535, 0.040], [1.34, 1.000, 0.505, 0.055],
      [1.95, 1.000, 0.465, 0.055], [2.35, 0.985, 0.395, 0.050],
      [2.60, 0.930, 0.325, 0.015],
    ],
    roofY: 1.000, roofHW: 0.775, aZ: 0.92, cZ: -1.36,
    cowlZ: 1.38, deckZ: -1.88, spoilerRake: 0.15, spoilerH: 0.215,
    lamp: 'slim', grille: 'hex',
  },
  sabre: {
    name: 'CALDERA', badge: 'C',
    keys: [
      [-2.58, 0.925, 0.535, 0.006], [-2.35, 0.970, 0.540, 0.015],
      [-1.95, 1.000, 0.545, 0.030], [-1.45, 1.005, 0.555, 0.035],
      [-0.95, 0.985, 0.565, 0.024], [0.00, 0.970, 0.570, 0.024],
      [0.95, 0.985, 0.555, 0.032], [1.34, 1.005, 0.525, 0.045],
      [1.95, 1.005, 0.485, 0.040], [2.35, 0.995, 0.435, 0.035],
      [2.60, 0.945, 0.375, 0.012],
    ],
    roofY: 1.035, roofHW: 0.805, aZ: 0.99, cZ: -1.20,
    cowlZ: 1.31, deckZ: -1.70, spoilerRake: 0.09, spoilerH: 0.235,
    lamp: 'quad', grille: 'box',
  },
  lancer: {
    name: 'AXIOM', badge: 'A',
    keys: [
      [-2.58, 0.885, 0.445, 0.008], [-2.35, 0.940, 0.460, 0.018],
      [-1.95, 0.985, 0.485, 0.035], [-1.45, 0.995, 0.515, 0.042],
      [-0.95, 0.970, 0.530, 0.030], [0.00, 0.955, 0.540, 0.032],
      [0.95, 0.970, 0.525, 0.045], [1.34, 0.998, 0.495, 0.055],
      [1.95, 0.995, 0.445, 0.060], [2.35, 0.975, 0.365, 0.055],
      [2.60, 0.900, 0.300, 0.020],
    ],
    roofY: 0.975, roofHW: 0.750, aZ: 0.90, cZ: -1.14,
    cowlZ: 1.26, deckZ: -1.76, spoilerRake: 0.20, spoilerH: 0.200,
    lamp: 'round', grille: 'oval',
  },
};
export const MAKE_KEYS = Object.keys(MAKES);

// the rocker line: how low the sheet metal goes where there is no arch
const YB_KEYS = [
  [-2.60, -0.200], [-2.32, -0.235], [-0.20, -0.238],
  [1.60, -0.238], [2.34, -0.246], [2.60, -0.190],
];

const ARCH_FLARE = 0.046;   // how far the lip stands out past the beltline
const ROCKER_TUCK = 0.058;  // and how far the rocker is pulled in between them

/** linear read of a keyframe table [[z, a, b, c], ...] at z */
function keyAt(keys, z) {
  if (z <= keys[0][0]) return keys[0].slice(1);
  const last = keys[keys.length - 1];
  if (z >= last[0]) return last.slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    if (z >= keys[i][0] && z <= keys[i + 1][0]) {
      const t = (z - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
      return keys[i].slice(1).map((v, k) => mix(v, keys[i + 1][k + 1], t));
    }
  }
  return last.slice(1);
}

/** a max with a rounded corner, so an arch meets a rocker without a step */
function smax(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return mix(a, b, h) + k * h * (1 - h);
}

/**
 * THE CROSS SECTION AT z.
 *
 * Three half widths, because a car is not a box: the arch LIP is the
 * widest thing on the car, the shoulder is just inside it, and the
 * beltline is narrower again. Between the arches the lip is pulled in
 * (the tuck) and the widest point moves up to the shoulder, which is what
 * makes a flank look like sheet metal rather than a fence panel.
 */
function sectionAt(M, arches, z) {
  const [hw, belt, dome] = keyAt(M.keys, z);
  let yb = keyAt(YB_KEYS, z)[0];
  let flare = 0, open = 0;
  for (const [zc, ra] of arches) {
    const dz = z - zc;
    if (Math.abs(dz) < ra) {
      const lip = Math.sqrt(ra * ra - dz * dz) * 0.95 - 0.015;
      yb = smax(yb, lip, 0.075);
      open = Math.max(open, 1 - (dz / ra) ** 2);
    }
    const f = 1 - (dz / (ra * 1.22)) ** 2;
    if (f > 0) flare = Math.max(flare, ARCH_FLARE * Math.pow(f, 0.55));
  }
  const tuck = ROCKER_TUCK * (1 - clamp(open * 2.2, 0, 1));
  // THE RAKE. A flat vertical panel at each end of the car is a wall, and
  // a wall is what made the first nose look like the front of a van. The
  // section is SHEARED in z by how far up it you are: the top of the nose
  // sits a third of a metre behind the bottom of it, which is the bonnet
  // line, and the tail leans the other way by a little.
  let lean = 0;
  if (z > 1.90) lean = Math.pow(clamp((z - 1.90) / 0.70, 0, 1), 1.3) * 0.62;
  else if (z < -2.10) lean = -clamp((-2.10 - z) / 0.50, 0, 1) * 0.17;
  return {
    z, lean,
    hwLip: hw - tuck + flare,
    hwMax: hw + flare * 0.78,
    hwBelt: hw * 0.962 + flare * 0.20,
    yb, belt, dome,
  };
}

/**
 * Where to cut the sections. Dense around each arch, because the opening
 * is a 0.9 m arc and eight stations across it is the difference between
 * a wheel arch and a dent.
 */
function stationsFor(arches) {
  const zs = [-2.60, -2.48, -2.32, -2.14, -1.98, -0.62, -0.18, 0.22, 0.58,
    2.06, 2.22, 2.38, 2.50, 2.60];
  for (const [zc, ra] of arches) {
    for (const k of [-1.0, -0.88, -0.66, -0.36, 0, 0.36, 0.66, 0.88, 1.0]) {
      zs.push(zc + ra * k);
    }
  }
  zs.sort((a, b) => a - b);
  const out = [];
  for (const z of zs) if (!out.length || z - out[out.length - 1] > 0.045) out.push(z);
  return out;
}

/**
 * The ring at one station, as an OPEN strip of [x, y, u]: up the right
 * flank, over the top, down the left flank. Open, because the underside
 * of the car is a flat plate and not part of the painted shell - lofting
 * a closed tube meant the sheet had to carry a metre of black nobody ever
 * sees, and it made the arch openings impossible.
 */
function ring(S) {
  const h = Math.max(0.04, S.belt - S.yb);
  const half = [
    [S.hwLip, S.yb],                             // 1.00  the lip
    [S.hwLip + 0.004, S.yb + h * 0.11],          // 1.08  its return
    [S.hwMax * 0.996, S.yb + h * 0.31],          // 1.22
    [S.hwMax, S.yb + h * 0.56],                  // 1.42  widest
    [S.hwMax * 0.988, S.yb + h * 0.80],          // 1.60
    [S.hwBelt * 1.004, S.belt - h * 0.07],       // 1.72  the shoulder crease
    [S.hwBelt * 0.962, S.belt],                  // 1.78  the beltline
    [S.hwBelt * 0.815, S.belt + S.dome * 0.66],  // 1.90
    [S.hwBelt * 0.450, S.belt + S.dome * 0.95],  // 2.26
    [0, S.belt + S.dome],                        // 2.55  the top centre
  ];
  const pts = [];
  const dz = (y) => S.z - S.lean * (y - S.yb);
  for (let i = 0; i < half.length; i++) pts.push([-half[i][0], half[i][1], -U_AT[i], dz(half[i][1])]);
  for (let i = half.length - 1; i >= 0; i--) pts.push([half[i][0], half[i][1], U_AT[i], dz(half[i][1])]);
  return { z: S.z, pts };
}

/** loft the shell through the sections, and cap the nose and the tail */
function shellGeometry(sections) {
  const rings = sections.map(ring);
  const cols = rings[0].pts.length;
  const pos = [], uv = [], idx = [];
  rings.forEach((r) => {
    for (const [x, y, s, z] of r.pts) { pos.push(x, y, z); uv.push(...uvOf(s, r.z)); }
  });
  // WOUND SO THE OUTSIDE FACES OUT. Sections run tail to nose, the ring
  // runs up the right flank first: (a, c, b) then gives z cross ring,
  // which on the right side is -x. Get this backwards and the car is a
  // hollow shell you can see the inside of from the wall.
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = k * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // ---- THE CAPS ---------------------------------------------------------
  // The nose and the tail of a Cup car are flat panels, and that is where
  // the face and the number live, so each cap gets its own patch of the
  // livery sheet mapped from (x, y) rather than a flat colour.
  const cap = (k, front) => {
    const r = rings[k], base = pos.length / 3, n = r.pts.length;
    const map = front ? faceUV : tailUV;
    let mx = 0, my = 0, mz = 0;
    for (const p of r.pts) { mx += p[0] / n; my += p[1] / n; mz += p[3] / n; }
    pos.push(mx, my, mz); uv.push(...map(mx, my));
    for (const [x, y, , z] of r.pts) { pos.push(x, y, z); uv.push(...map(x, y)); }
    for (let i = 0; i < n; i++) {
      const p = base + 1 + i, q = base + 1 + ((i + 1) % n);
      if (front) idx.push(base, q, p); else idx.push(base, p, q);
    }
  };
  cap(0, false);
  cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// =====================================================================
// DRAWING ON THE SHEET
// =====================================================================

/**
 * Draw inside the sheet, in the car's own metres.
 *
 * A texture's v = 0 is the BOTTOM of the image and a canvas's y = 0 is
 * the top, so the transform flips and has to land (u0, v0) on the
 * bottom-left pixel. Getting the translation wrong put the whole livery a
 * thousand pixels off the top of the canvas: every car came out plain
 * body colour with no number and no sponsor, and it looked deliberate.
 */
function inSheet(g, fn) {
  g.save();
  const sx = TEX / (REG.u1 - REG.u0);
  const sy = -TEX / (REG.v1 - REG.v0);
  g.setTransform(sx, 0, 0, sy, -REG.u0 * sx, TEX - REG.v0 * sy);
  fn(g);
  g.restore();
}

/**
 * Text on the car. `r` is the direction it READS in and `up` the
 * direction its letters stand up in, both in the sheet's metres - the
 * only sane way to put words on a surface that different parts of the car
 * see from opposite sides. `edge` is an outline, in metres, because a
 * racing number without one disappears the moment it crosses a stripe.
 */
function label(g, text, x, y, h, r, up, colour, maxW = 6, edge = null, ew = 0.022) {
  g.save();
  g.translate(x, y);
  g.font = '900 100px "Arial Black", "Segoe UI", Arial, sans-serif';
  const k = Math.min(h / 72, maxW / Math.max(1, g.measureText(text).width));
  g.transform(r[0] * k, r[1] * k, -up[0] * k, -up[1] * k, 0, 0);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (edge) {
    g.lineJoin = 'round'; g.miterLimit = 2;
    g.lineWidth = (ew / k) * 2;
    g.strokeStyle = edge;
    g.strokeText(text, 0, 4);
  }
  g.fillStyle = colour;
  g.fillText(text, 0, 4);
  g.restore();
}

function poly(g, pts, colour) {
  g.fillStyle = colour;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath(); g.fill();
}

function rrect(g, x, y, w, h, r, fill, stroke, sw) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = sw || 0.012; g.stroke(); }
}

/** a grille: a dark opening with slats and a divider, not a black rectangle */
function grilleFill(g, x, y, w, h, rows) {
  rrect(g, x, y, w, h, Math.min(0.035, h / 2), '#0a0b0e');
  g.save();
  rrect(g, x, y, w, h, Math.min(0.035, h / 2), null);
  g.clip();
  g.strokeStyle = 'rgba(126,134,146,0.55)';
  g.lineWidth = h / (rows * 6);
  for (let k = 1; k < rows; k++) {
    const yy = y + (h * k) / rows;
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
  }
  g.strokeStyle = 'rgba(90,97,108,0.40)';
  g.lineWidth = w / 220;
  for (let k = 1; k < 26; k++) {
    const xx = x + (w * k) / 26;
    g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke();
  }
  g.restore();
  rrect(g, x, y, w, h, Math.min(0.035, h / 2), null, 'rgba(226,232,240,0.30)', 0.010);
}

/** a lamp lens: a dark housing, a bright element in it, and a chrome rim */
function lamp(g, x, y, w, h, tint, shape) {
  const r = shape === 'round' ? h / 2 : Math.min(0.035, h / 2.2);
  rrect(g, x, y, w, h, r, '#13161b');
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, tint[1]);
  grad.addColorStop(0.45, tint[0]);
  grad.addColorStop(1, tint[2]);
  rrect(g, x + w * 0.055, y + h * 0.13, w * 0.89, h * 0.74, r * 0.8, grad);
  // the hot line across the middle, which is what says "lens" and not "paint"
  g.save();
  rrect(g, x + w * 0.055, y + h * 0.13, w * 0.89, h * 0.74, r * 0.8, null);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.42)';
  g.fillRect(x + w * 0.09, y + h * 0.56, w * 0.82, h * 0.10);
  g.restore();
  rrect(g, x, y, w, h, r, null, 'rgba(206,214,226,0.55)', 0.011);
}

// =====================================================================
// THE FACE AND THE TAIL, PER MARQUE
// =====================================================================
//
// These are drawn in the car's own metres with (0, 0) at the centre of
// the front or rear panel on the wheel-centre plane, and the loft maps
// the flat nose and tail rings straight onto them. From behind you get a
// number, a light signature and a colour block; those three together are
// the whole of telling one car from another at 190 mph.
const WHITE = ['#fff6e2', '#ffffff', '#e2c98c'];
const RED = ['#e02a20', '#ff8a70', '#8c1008'];
const AMBER = ['#f4a01a', '#ffd88a', '#a05a06'];

/**
 * THE FRONT.  y = 0 is the wheel centre plane; the panel runs from about
 * -0.20 at the bumper to +0.33 where the bonnet turns over. The livery
 * has to CONTINUE onto it - the top band matches the accent band across
 * the front of the bonnet, or the nose reads as a painted wall with some
 * stickers on it, which is what the first attempt looked like.
 */
function drawFace(M, g, C, bot, top, W) {
  const E = W + 0.14;                       // past the edge, so the fills clip
  // the bumper below the lights, dark, sitting on the splitter
  const bumpTop = bot + 0.125;
  poly(g, [[-E, bot - 0.08], [E, bot - 0.08], [E, bumpTop], [-E, bumpTop]], '#191c22');
  // the accent band across the top, meeting the bonnet
  const acc = top - 0.10;
  poly(g, [[-E, acc], [E, acc], [E, top + 0.07], [-E, top + 0.07]], C.A);
  poly(g, [[-E, acc - 0.020], [E, acc - 0.020], [E, acc], [-E, acc]], C.W);

  const y0 = bot + 0.165, y1 = acc - 0.045, h = y1 - y0;
  if (M.grille === 'hex') {
    // KESTREL: one wide hexagonal mouth with slim lamps wrapped round it
    poly(g, [[-0.42 * W, y0], [0.42 * W, y0], [0.57 * W, y0 + h / 2], [0.42 * W, y1],
             [-0.42 * W, y1], [-0.57 * W, y0 + h / 2]], '#0a0b0e');
    grilleFill(g, -0.41 * W, y0 + 0.014, 0.82 * W, h - 0.028, 4);
    for (const s of [1, -1]) {
      lamp(g, s > 0 ? 0.60 * W : -0.98 * W, y0 + h * 0.40, 0.38 * W, h * 0.42, WHITE, 'slim');
    }
  } else if (M.grille === 'box') {
    // CALDERA: a big square grille and stacked quad headlights
    rrect(g, -0.46 * W, y0, 0.92 * W, h, 0.022, '#0a0b0e');
    grilleFill(g, -0.442 * W, y0 + 0.016, 0.884 * W, h - 0.032, 5);
    for (const s of [1, -1]) {
      const x = s > 0 ? 0.55 * W : -0.97 * W;
      lamp(g, x, y0 + h * 0.52, 0.42 * W, h * 0.40, WHITE, 'slim');
      lamp(g, x, y0 + h * 0.08, 0.42 * W, h * 0.36, AMBER, 'slim');
    }
  } else {
    // AXIOM: an oval mouth and round lamps
    g.fillStyle = '#0a0b0e';
    g.beginPath(); g.ellipse(0, y0 + h / 2, 0.54 * W, h / 2, 0, 0, 7); g.fill();
    g.save();
    g.beginPath(); g.ellipse(0, y0 + h / 2, 0.515 * W, h / 2 - 0.016, 0, 0, 7); g.clip();
    grilleFill(g, -0.54 * W, y0, 1.08 * W, h, 4);
    g.restore();
    for (const s of [1, -1]) {
      const d = Math.min(0.235, h);
      lamp(g, s > 0 ? 0.96 * W - d : -0.96 * W, y0 + (h - d) / 2, d, d, WHITE, 'round');
      lamp(g, s > 0 ? 0.68 * W - d * 0.66 : -0.68 * W, y0 + (h - d * 0.66) / 2,
        d * 0.66, d * 0.66, AMBER, 'round');
    }
  }
  // the lower intake, full width, in the bumper
  grilleFill(g, -0.86 * W, bot - 0.045, 1.72 * W, 0.135, 2);
  // the marque badge, sitting on the accent band, and the tow eye every
  // one of them has
  rrect(g, -0.10, acc - 0.005, 0.20, 0.085, 0.024, C.W, 'rgba(16,18,22,0.75)', 0.009);
  label(g, M.badge, 0, acc + 0.040, 0.062, [1, 0], [0, 1], C.B, 0.14);
  rrect(g, 0.74 * W, bot - 0.022, 0.105, 0.070, 0.018, '#c9cfd8', 'rgba(0,0,0,0.5)', 0.008);
}

/**
 * THE BACK, which is the view most of a race is watched from. It gets a
 * big number, a light signature you can name at a hundred metres, and a
 * colour block that is not the same as the car beside it.
 */
function drawTail(M, g, C, bot, top, W) {
  const tn = String(C.num);
  const E = W + 0.14;
  // the bumper, dark, with the diffuser mouth in it
  const bumpTop = bot + 0.145;
  poly(g, [[-E, bot - 0.08], [E, bot - 0.08], [E, bumpTop], [-E, bumpTop]], '#15181d');
  grilleFill(g, -0.50 * W, bot - 0.035, 1.00 * W, 0.120, 3);
  for (const s of [1, -1]) {
    // the jack points, one each side, right where the crew put the jack
    rrect(g, s > 0 ? 0.72 * W : -0.90 * W, bot - 0.010, 0.18 * W, 0.105, 0.02, '#0a0b0e');
  }
  // the accent block across the top, meeting the deck lid
  const acc = top - 0.075;
  poly(g, [[-E, acc], [E, acc], [E, top + 0.07], [-E, top + 0.07]], C.A);
  poly(g, [[-E, acc - 0.018], [E, acc - 0.018], [E, acc], [-E, acc]], C.W);

  // THE LIGHT SIGNATURE, just under the deck edge
  const ly1 = acc - 0.022;
  const lh = M.lamp === 'quad' ? 0.215 : M.lamp === 'round' ? 0.165 : 0.135;
  if (M.lamp === 'slim') {
    rrect(g, -0.98 * W, ly1 - lh, 1.96 * W, lh, 0.026, '#0b0c0f');
    lamp(g, -0.955 * W, ly1 - lh + 0.012, 1.91 * W, lh - 0.024, RED, 'slim');
  } else if (M.lamp === 'quad') {
    for (const s of [1, -1]) {
      const x = s > 0 ? 0.62 * W : -0.98 * W;
      rrect(g, x, ly1 - lh, 0.36 * W, lh, 0.026, '#0b0c0f');
      lamp(g, x + 0.016, ly1 - lh + 0.014, 0.36 * W - 0.032, lh - 0.028, RED, 'slim');
    }
  } else {
    for (const s of [1, -1]) {
      for (let k = 0; k < 2; k++) {
        lamp(g, s > 0 ? 0.96 * W - lh - k * (lh + 0.018) : -0.96 * W + k * (lh + 0.018),
          ly1 - lh, lh, lh, RED, 'round');
      }
    }
  }

  // THE NUMBER, with an outline. This is the panel that decides whether a
  // race read from a chase camera makes any sense at all, so it gets
  // everything left between the bumper and the lights.
  const ny0 = bumpTop + 0.025, ny1 = ly1 - lh - 0.022;
  const nh = Math.max(0.17, ny1 - ny0);
  const nw = tn.length > 1 ? 0.60 : 0.33;
  rrect(g, -nw / 2 - 0.045, ny0, nw + 0.09, nh, 0.022, C.W, C.D, 0.013);
  label(g, tn, 0, ny0 + nh / 2, nh * 0.80, [1, 0], [0, 1], C.B, nw, C.D, 0.012);
  // the sponsor each side of it, and the marque name down on the bumper
  for (const s of [1, -1]) {
    label(g, C.name, s * 0.66 * W, ny0 + nh / 2, 0.075, [1, 0], [0, 1], C.W, 0.60 * W);
  }
  label(g, M.name, 0, ny0 - 0.052, 0.046, [1, 0], [0, 1], C.W, 0.50);
}

// =====================================================================
// EIGHT WAYS TO PAINT A SIDE
// =====================================================================
//
// Every pattern is drawn in the same band - the flank, u from 1.00 to
// 1.78 - and every one leaves the door clear for the number panel. They
// are what stops two blue cars from being the same blue car, and they are
// shaped like real stock-car wraps: a dominant colour with one contrast
// shape driven forward or back out of it, not stripes on a bus.
const F0 = 1.00, F1 = 1.78;
const PATTERNS = [
  // 0 - WEDGE: the accent out of the tail, driving forward to the door
  (g, s, A, B, W) => {
    poly(g, [[s * F0, -2.70], [s * F1, -2.70], [s * F1, -0.30], [s * F0, -1.20]], A);
    poly(g, [[s * F0, -1.20], [s * F1, -0.30], [s * F1, -0.10], [s * F0, -0.96]], W);
  },
  // 1 - SPLIT: accent below the shoulder line, body above it
  (g, s, A, B, W) => {
    poly(g, [[s * F0, -2.70], [s * 1.44, -2.70], [s * 1.44, 2.70], [s * F0, 2.70]], A);
    poly(g, [[s * 1.44, -2.70], [s * 1.50, -2.70], [s * 1.50, 2.70], [s * 1.44, 2.70]], W);
  },
  // 2 - NOSE AND TAIL: a hard colour block at each end
  (g, s, A, B, W) => {
    poly(g, [[s * F0, 1.42], [s * F1, 1.12], [s * F1, 2.70], [s * F0, 2.70]], A);
    poly(g, [[s * F0, -2.70], [s * F1, -2.70], [s * F1, -1.28], [s * F0, -1.62]], A);
    poly(g, [[s * F0, 1.28], [s * F1, 0.98], [s * F1, 1.12], [s * F0, 1.42]], W);
  },
  // 3 - SWOOSH: a curve lifting off the rocker into the rear quarter
  (g, s, A, B, W) => {
    g.fillStyle = A;
    g.beginPath();
    g.moveTo(s * F0, -2.70);
    g.lineTo(s * F0, 0.90);
    g.bezierCurveTo(s * 1.30, 0.20, s * 1.42, -0.90, s * F1, -1.70);
    g.lineTo(s * F1, -2.70);
    g.closePath(); g.fill();
    g.strokeStyle = W; g.lineWidth = 0.055;
    g.beginPath();
    g.moveTo(s * F0, 0.90);
    g.bezierCurveTo(s * 1.30, 0.20, s * 1.42, -0.90, s * F1, -1.70);
    g.stroke();
  },
  // 4 - ARROW: chevrons at each end pointing the way it is going
  (g, s, A, B, W) => {
    poly(g, [[s * F0, 2.70], [s * F1, 2.70], [s * F1, 0.92], [s * F0, 1.46]], A);
    poly(g, [[s * F0, -2.70], [s * F1, -2.70], [s * F1, -1.24], [s * F0, -1.74]], A);
    poly(g, [[s * F0, 1.46], [s * F1, 0.92], [s * F1, 0.76], [s * F0, 1.30]], W);
  },
  // 5 - FADE: the accent stepped out of the tail in bars
  (g, s, A, B, W) => {
    poly(g, [[s * F0, -2.70], [s * F1, -2.70], [s * F1, -1.50], [s * F0, -1.50]], A);
    for (let k = 0; k < 5; k++) {
      const z = -1.40 + k * 0.28, h = 0.185 - k * 0.030;
      poly(g, [[s * F0, z], [s * F1, z], [s * F1, z + h], [s * F0, z + h]], A);
    }
  },
  // 6 - QUARTERS: body over the front, accent over the back, hard edge
  (g, s, A, B, W) => {
    poly(g, [[s * F0, -2.70], [s * F1, -2.70], [s * F1, 0.34], [s * F0, -0.18]], A);
    poly(g, [[s * F0, -0.18], [s * F1, 0.34], [s * F1, 0.48], [s * F0, -0.04]], W);
  },
  // 7 - ROCKER: the whole flank in the accent with the body along the sill
  (g, s, A, B, W) => {
    poly(g, [[s * F0, -2.70], [s * F1, -2.70], [s * F1, 2.70], [s * F0, 2.70]], A);
    poly(g, [[s * F0, -2.70], [s * 1.26, -2.70], [s * 1.26, 2.70], [s * F0, 2.70]], B);
    poly(g, [[s * 1.26, -2.70], [s * 1.31, -2.70], [s * 1.31, 2.70], [s * 1.26, 2.70]], W);
  },
];

// the row of small stickers along the back of every real stock car
const CONTINGENCY = [
  ['#e8322a', '#ffffff'], ['#f5c518', '#101317'], ['#1f6fd0', '#ffffff'],
  ['#14a06a', '#ffffff'], ['#f07a1a', '#101317'], ['#8c46c8', '#ffffff'],
  ['#e8e8ea', '#101317'], ['#20232a', '#f0f2f5'],
];

function liveryCanvas(lv, M) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d');
  const B = hex(lv.body), A = hex(lv.accent), W = hex(lv.trim);
  // a dark version of the body colour, for outlines and shadow lines
  const bc = new THREE.Color(lv.body);
  const D = '#' + bc.clone().multiplyScalar(0.28).getHexString();
  const num = String(lv.number), name = String(lv.name).toUpperCase();
  const C = { B, A, W, D, num: lv.number, name, wheel: lv.wheel };
  g.fillStyle = B; g.fillRect(0, 0, TEX, TEX);
  const paint = PATTERNS[((lv.pattern % PATTERNS.length) + PATTERNS.length) % PATTERNS.length];

  inSheet(g, (g) => {
    for (const side of [1, -1]) {
      // ---- THE FLANK ---------------------------------------------------
      paint(g, side, A, B, W);
      // the rocker below the shoulder, dark, so the car sits on the road
      poly(g, [[side * F0, -2.70], [side * 1.075, -2.70],
               [side * 1.075, 2.70], [side * F0, 2.70]], '#14171c');
      // the shoulder crease: a bright line and a shadow under it. This is
      // the line that makes a flat lofted side read as pressed steel.
      poly(g, [[side * 1.700, -2.70], [side * 1.724, -2.70],
               [side * 1.724, 2.70], [side * 1.700, 2.70]], 'rgba(255,255,255,0.30)');
      poly(g, [[side * 1.664, -2.70], [side * 1.700, -2.70],
               [side * 1.700, 2.70], [side * 1.664, 2.70]], 'rgba(0,0,0,0.26)');
      // the beltline trim: a WINDOW SURROUND, not a racing stripe. At
      // four centimetres of white it read as a stripe down the car and
      // fought the number for the eye.
      poly(g, [[side * 1.762, -2.70], [side * 1.782, -2.70],
               [side * 1.782, 2.70], [side * 1.762, 2.70]], W);
      // and a shadow in the arch openings, top and bottom, so the lip has
      // some depth to it from three metres away
      poly(g, [[side * F0, -2.70], [side * 1.045, -2.70],
               [side * 1.045, 2.70], [side * F0, 2.70]], 'rgba(0,0,0,0.35)');

      // THE SHUT LINES. Two cuts across the flank where the fender meets
      // the door and the door meets the quarter. They are two pixels of
      // shadow and they are most of what stops a lofted side reading as
      // one continuous extrusion of plastic.
      for (const z of [1.02, -1.02]) {
        poly(g, [[side * 1.045, z], [side * 1.762, z],
                 [side * 1.762, z + 0.016], [side * 1.045, z + 0.016]], 'rgba(0,0,0,0.42)');
        poly(g, [[side * 1.045, z + 0.016], [side * 1.762, z + 0.016],
                 [side * 1.762, z + 0.026], [side * 1.045, z + 0.026]], 'rgba(255,255,255,0.13)');
      }

      // ---- THE DOOR: THE NUMBER PANEL ----------------------------------
      // Standing on the car's LEFT the nose is to your left; standing on
      // its right the nose is to your right, so the two numbers are mirror
      // images of each other.
      const rd = [0, -side], up = [side, 0];
      g.save();
      g.beginPath();
      g.rect(Math.min(side * 1.06, side * 1.70), -0.92,
        Math.abs(1.70 - 1.06), 1.84);
      g.clip();
      poly(g, [[side * 1.06, -0.92], [side * 1.70, -0.92],
               [side * 1.70, 0.92], [side * 1.06, 0.92]], W);
      poly(g, [[side * 1.06, -0.92], [side * 1.70, -0.92],
               [side * 1.70, -0.78], [side * 1.06, -0.78]], A);
      poly(g, [[side * 1.06, 0.78], [side * 1.70, 0.78],
               [side * 1.70, 0.92], [side * 1.06, 0.92]], A);
      g.restore();
      label(g, num, side * 1.375, 0.02, 0.62, rd, up, B, 1.32, D, 0.026);
      // the sponsor, forward of the number where the door shuts
      label(g, name, side * 1.40, 1.30, 0.235, rd, up, W, 1.05, 'rgba(0,0,0,0.45)', 0.010);
      // the driver's name under the window, small, as it really is
      label(g, name, side * 1.745, -1.10, 0.095, rd, up, B, 0.62);

      // ---- CONTINGENCY DECALS along the rear quarter --------------------
      for (let k = 0; k < 7; k++) {
        const z = -1.16 - k * 0.205;
        const [bg, fg] = CONTINGENCY[(k + lv.number) % CONTINGENCY.length];
        poly(g, [[side * 1.085, z], [side * 1.085, z + 0.175],
                 [side * 1.255, z + 0.175], [side * 1.255, z]], bg);
        label(g, String.fromCharCode(65 + ((k * 5 + lv.number) % 26)),
          side * 1.170, z + 0.088, 0.085, rd, up, fg, 0.13);
      }
      // the fuel filler on the LEFT quarter only, as the rules have it
      if (side === 1) {
        g.fillStyle = '#b9bec7';
        g.beginPath(); g.arc(side * 1.52, -1.66, 0.075, 0, 7); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.012; g.stroke();
      }

      // ---- THE BONNET AND THE DECK -------------------------------------
      // 1.78 to 2.55 is the top surface, and it appears on BOTH sides of
      // the section, so anything here is drawn twice, mirrored.
      poly(g, [[side * U_BELT, 1.94], [side * U_TOP, 1.94],
               [side * U_TOP, 2.70], [side * U_BELT, 2.70]], A);
      poly(g, [[side * U_BELT, 1.86], [side * U_TOP, 1.86],
               [side * U_TOP, 1.94], [side * U_BELT, 1.94]], W);
      poly(g, [[side * U_BELT, -2.70], [side * U_TOP, -2.70],
               [side * U_TOP, -2.16], [side * U_BELT, -2.16]], A);
      poly(g, [[side * U_BELT, -2.16], [side * U_TOP, -2.16],
               [side * U_TOP, -2.08], [side * U_BELT, -2.08]], W);
      // the shut lines round the bonnet and the deck lid
      for (const z of [1.20, -1.42]) {
        poly(g, [[side * U_BELT, z], [side * U_TOP, z],
                 [side * U_TOP, z + 0.016], [side * U_BELT, z + 0.016]], 'rgba(0,0,0,0.40)');
      }
      label(g, name, side * 2.16, 1.56, 0.30, [0, -side], [side, 0], W, 0.92);
      label(g, num, side * 2.20, -1.86, 0.26, [0, -side], [side, 0], W, 0.46);

      // ---- THE SAIL PANEL, its own strip of the sheet -------------------
      // u runs from the beltline (SAIL_U0) to the roof (SAIL_U1), so the
      // flank's accent carries up onto the C-post and stops, which is what
      // a wrap does and what stops the panel reading as a separate object.
      const sm = mix(SAIL_U0, SAIL_U1, 0.42);
      poly(g, [[side * SAIL_U0, -2.70], [side * SAIL_U1, -2.70],
               [side * SAIL_U1, 2.70], [side * SAIL_U0, 2.70]], B);
      poly(g, [[side * SAIL_U0, -2.70], [side * sm, -2.70],
               [side * sm, 2.70], [side * SAIL_U0, 2.70]], A);
      poly(g, [[side * sm, -2.70], [side * (sm + 0.018), -2.70],
               [side * (sm + 0.018), 2.70], [side * sm, 2.70]], W);
    }

    // ---- THE ROOF, in its own patch of the sheet -------------------------
    const ru = (ROOF_U0 + ROOF_U1) / 2;
    poly(g, [[ROOF_U0, -2.70], [ROOF_U1, -2.70], [ROOF_U1, 2.70], [ROOF_U0, 2.70]], B);
    poly(g, [[ROOF_U0, 0.52], [ROOF_U1, 0.52], [ROOF_U1, 0.88], [ROOF_U0, 0.88]], A);
    poly(g, [[ROOF_U0, -1.28], [ROOF_U1, -1.28], [ROOF_U1, -0.92], [ROOF_U0, -0.92]], A);
    // THE ROOF NUMBER, reading from the driver's side, the way the spotter
    // stand and the blimp both see it
    label(g, num, ru, -0.16, 0.60, [0, -1], [1, 0], W, 0.62, D, 0.026);
    // the roof flap, outlined where the raised panel actually is, and the
    // shadow under the two rails
    rrect(g, ru - 0.24, M.cZ + 0.28, 0.48, 0.48, 0.02, null, 'rgba(0,0,0,0.55)', 0.016);
    for (const o of [0.10, ROOF_U1 - ROOF_U0 - 0.14]) {
      poly(g, [[ROOF_U0 + o, -2.70], [ROOF_U0 + o + 0.04, -2.70],
               [ROOF_U0 + o + 0.04, 2.70], [ROOF_U0 + o, 2.70]], 'rgba(0,0,0,0.35)');
    }

    // ---- THE FRONT FASCIA AND THE TAIL PANEL ----------------------------
    // Laid out against the REAL extent of each panel, which is different
    // for each marque: CALDERA's tail is 8 cm taller than AXIOM's, and a
    // layout in fixed metres puts the number through the bumper on one of
    // them and leaves a hand's width of empty paint on the other.
    // ...and against its real HALF WIDTH too: art laid out to a nominal
    // metre ran the headlights off the side of a 0.93 m nose, so a lamp
    // that should have been a lens was a torn parallelogram.
    const nk = M.keys[M.keys.length - 1], tk = M.keys[0];
    const fBot = keyAt(YB_KEYS, nk[0])[0], fTop = nk[2] + nk[3];
    const tBot = keyAt(YB_KEYS, tk[0])[0], tTop = tk[2] + tk[3];
    g.save(); g.translate(FACE.u, FACE.v); drawFace(M, g, C, fBot, fTop, nk[1] * 0.94); g.restore();
    g.save(); g.translate(TAIL.u, TAIL.v); drawTail(M, g, C, tBot, tTop, tk[1] * 0.94); g.restore();

    // ---- THE WINDSCREEN BANNER ------------------------------------------
    poly(g, [[BANNER.u0, BANNER.v0], [BANNER.u1, BANNER.v0],
             [BANNER.u1, BANNER.v1], [BANNER.u0, BANNER.v1]], A);
    poly(g, [[BANNER.u0, BANNER.v0], [BANNER.u1, BANNER.v0],
             [BANNER.u1, BANNER.v0 + 0.035], [BANNER.u0, BANNER.v0 + 0.035]], W);
    label(g, name, (BANNER.u0 + BANNER.u1) / 2, (BANNER.v0 + BANNER.v1) / 2 + 0.02,
      0.22, [1, 0], [0, 1], W, 1.90, 'rgba(0,0,0,0.5)', 0.010);

    // ---- THE A-POST, with the number on it ------------------------------
    poly(g, [[APOST.u0, APOST.v0], [APOST.u1, APOST.v0],
             [APOST.u1, APOST.v1], [APOST.u0, APOST.v1]], B);
    label(g, num, (APOST.u0 + APOST.u1) / 2, APOST.v0 + 0.16, 0.22, [0, 1], [-1, 0], W, 0.26);

    // ---- THE SPOILER BLADE ----------------------------------------------
    poly(g, [[BLADE.u0, BLADE.v0], [BLADE.u1, BLADE.v0],
             [BLADE.u1, BLADE.v1], [BLADE.u0, BLADE.v1]], A);
    label(g, name, (BLADE.u0 + BLADE.u1) / 2, (BLADE.v0 + BLADE.v1) / 2,
      0.24, [1, 0], [0, 1], W, 1.80);

    // ---- HARDWARE ON THE BONNET AND THE DECK -----------------------------
    //
    // THE BONNET IS THE COCKPIT VIEW. From the driver's seat it fills the
    // bottom half of the screen for the whole race, and until now it was a
    // single flat field of body colour a metre and a half across with
    // nothing on it at all - which is most of why the view from inside
    // read as a coloured plane rather than a car.
    //
    // Everything below is real Cup hardware and all of it lives on the
    // sheet, so it costs no geometry and no draw call:
    //   THE SHUT LINES round the bonnet and the deck lid. The single
    //   cheapest thing that turns one moulded lump into panels.
    //   FOUR HOOD PINS with their lanyards, which is how a Cup bonnet is
    //   held down and the thing the eye goes to first from the seat.
    //   THE COWL PLENUM, the black box across the back of the bonnet that
    //   feeds the air box.
    //
    // The bonnet band appears TWICE on the sheet, mirrored about the top
    // centre at u = 2.55, so everything here is drawn once and comes out
    // on both sides of the car: one pin per side becomes two, and a line
    // near u = 2.55 becomes one seam down the middle.
    {
      const NOSE_V = 2.42, TAIL_V = -1.62;         // where the panels end
      const COWL_V = M.cowlZ, DECK_V = M.deckZ;
      const seam = (u0, u1, v0, v1) => {
        g.strokeStyle = 'rgba(0,0,0,0.42)';
        g.lineWidth = 0.014;
        g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke();
      };
      // the seam where the bonnet meets the wing, both ends, and the two
      // cross seams at the cowl and over the nose
      seam(1.905, 1.905, COWL_V, NOSE_V);
      seam(1.905, 2.54, COWL_V + 0.015, COWL_V + 0.015);
      seam(1.905, 2.54, NOSE_V, NOSE_V);
      seam(2.548, 2.548, COWL_V, NOSE_V);          // down the centre line
      // and the same round the deck lid
      seam(1.905, 1.905, DECK_V, -0.28);
      seam(1.905, 2.54, -0.28, -0.28);
      seam(2.548, 2.548, DECK_V, -0.28);
      // THE COWL PLENUM
      poly(g, [[1.98, COWL_V + 0.03], [2.52, COWL_V + 0.03],
               [2.52, COWL_V + 0.20], [1.98, COWL_V + 0.20]], '#14161a');
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 0.012;
      g.beginPath(); g.moveTo(1.98, COWL_V + 0.20); g.lineTo(2.52, COWL_V + 0.20); g.stroke();
      // HOOD PINS: a scuffed washer plate, the pin through it and the
      // lanyard trailing back. Two on the sheet, four on the car.
      for (const [pu, pv] of [[2.07, COWL_V + 0.30], [2.24, NOSE_V - 0.22]]) {
        g.fillStyle = 'rgba(0,0,0,0.30)';
        g.beginPath(); g.arc(pu, pv, 0.062, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#9fa6ae';
        g.beginPath(); g.arc(pu, pv, 0.046, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2b2f36';
        g.beginPath(); g.arc(pu, pv, 0.020, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(30,33,38,0.72)'; g.lineWidth = 0.011;
        g.beginPath(); g.moveTo(pu, pv); g.lineTo(pu + 0.09, pv - 0.13); g.stroke();
      }
      // and two DECK PINS at the back
      for (const [pu, pv] of [[2.10, -0.42], [2.34, DECK_V + 0.20]]) {
        g.fillStyle = 'rgba(0,0,0,0.26)';
        g.beginPath(); g.arc(pu, pv, 0.056, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#9fa6ae';
        g.beginPath(); g.arc(pu, pv, 0.040, 0, Math.PI * 2); g.fill();
      }
    }

    // ---- the flat patches, LAST so nothing paints over them --------------
    for (const [k, col] of [['body', B], ['accent', A], ['trim', W],
      ['dark', '#171a1f'], ['chrome', '#c3c9d2']]) {
      const [u, v] = PATCH[k];
      poly(g, [[u - 0.13, v - 0.22], [u + 0.13, v - 0.22],
               [u + 0.13, v + 0.22], [u - 0.13, v + 0.22]], col);
    }
  });

  // ---- DIRT ---------------------------------------------------------------
  // Rubber pick-up, bug strike and track grime, sprayed straight onto the
  // canvas in texture space. By half distance nobody is clean, and a field
  // of showroom paint is half of why the first version looked like a
  // diagram.
  if (lv.dirt > 0) {
    let seed = (lv.number * 7919 + 13) | 0;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
    g.globalAlpha = 0.07 + lv.dirt * 0.16;
    for (let k = 0; k < 340 * lv.dirt; k++) {
      const x = rnd() * TEX, y = rnd() * TEX, r = 6 + rnd() * 40;
      g.fillStyle = rnd() < 0.6 ? '#3a352c' : '#22242a';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  return c;
}

// =====================================================================
// THE WHEEL
// =====================================================================
//
// Five spokes, a single centre-lock lug, and a DISH you can see into -
// the face of the wheel is set 8 cm inboard of the sidewall, which is why
// a real wheel reads as a wheel and a textured disc reads as a sticker.
// The texture is drawn in normalised radius, 1.0 at the tread, so both
// the recessed face and the outer sidewall ring can sample the same one.

/** the same canvas, rotated through a small arc and averaged */
function smear(src, turns = 44, span = 1.25) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2;
  g.globalAlpha = 2.4 / turns;
  for (let k = 0; k < turns; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((k / turns - 0.5) * span);
    g.translate(-cx, -cy);
    g.drawImage(src, 0, 0);
    g.restore();
  }
  g.globalAlpha = 1;
  return c;
}

function wheelTexture(rimColour, blur = false) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const cx = 256, cy = 256, R = 256;
  const base = new THREE.Color(rimColour);
  const lift = (k) => '#' + base.clone().multiplyScalar(k).getHexString();

  // ---- THE SIDEWALL, r 0.74 .. 1.00 -------------------------------------
  g.fillStyle = '#191a1e';
  g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  const side = g.createRadialGradient(cx, cy, R * 0.74, cx, cy, R);
  side.addColorStop(0, '#26282c');
  side.addColorStop(0.55, '#1b1c20');
  side.addColorStop(1, '#101114');
  g.fillStyle = side;
  g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  // the moulding rings a slick has round its sidewall
  g.strokeStyle = 'rgba(96,100,108,0.35)'; g.lineWidth = 2;
  for (const f of [0.995, 0.955, 0.795]) {
    g.beginPath(); g.arc(cx, cy, R * f, 0, 7); g.stroke();
  }
  // SIDEWALL LETTERING, which is most of what says "tyre"
  g.fillStyle = 'rgba(214,220,230,0.80)';
  g.font = '700 24px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * R * 0.875, cy + Math.sin(a) * R * 0.875);
    g.rotate(a + Math.PI / 2);
    g.fillText(i % 2 ? 'GOODRIDE' : 'R-28 SLICK', 0, 0);
    g.restore();
  }
  g.fillStyle = 'rgba(180,188,200,0.45)';
  g.font = '600 15px "Segoe UI", Arial, sans-serif';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8 + 0.06) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * R * 0.775, cy + Math.sin(a) * R * 0.775);
    g.rotate(a + Math.PI / 2);
    g.fillText('28.0 / 12.0 - 18', 0, 0);
    g.restore();
  }
  // the bead seat: a hard bright ring where the rubber meets the alloy
  g.strokeStyle = lift(0.55); g.lineWidth = R * 0.035;
  g.beginPath(); g.arc(cx, cy, R * 0.735, 0, 7); g.stroke();

  // ---- THE RIM, r 0 .. 0.72 ---------------------------------------------
  const rim = g.createRadialGradient(cx - R * 0.18, cy - R * 0.22, R * 0.04, cx, cy, R * 0.72);
  rim.addColorStop(0, lift(0.98)); rim.addColorStop(0.55, lift(0.74));
  rim.addColorStop(1, lift(0.40));
  g.fillStyle = rim;
  g.beginPath(); g.arc(cx, cy, R * 0.72, 0, 7); g.fill();
  // the barrel lip, darker, so the dish has an edge
  g.strokeStyle = lift(0.30); g.lineWidth = R * 0.03;
  g.beginPath(); g.arc(cx, cy, R * 0.705, 0, 7); g.stroke();
  // THE DISH, in shadow, and the brake inside it. The gaps between the
  // spokes go all the way through to the disc, which is what makes a
  // wheel visibly TURN rather than shimmer.
  g.fillStyle = '#0b0d10';
  g.beginPath(); g.arc(cx, cy, R * 0.685, 0, 7); g.fill();
  g.strokeStyle = 'rgba(104,110,120,0.45)'; g.lineWidth = R * 0.010;
  for (const f of [0.60, 0.47, 0.34]) { g.beginPath(); g.arc(cx, cy, R * f, 0, 7); g.stroke(); }
  g.fillStyle = 'rgba(150,40,30,0.75)';
  g.beginPath();
  g.arc(cx, cy, R * 0.62, Math.PI * 1.18, Math.PI * 1.52);
  g.arc(cx, cy, R * 0.40, Math.PI * 1.52, Math.PI * 1.18, true);
  g.closePath(); g.fill();
  // FIVE SPOKES, each with a light edge and a dark edge so it has a shape
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    const sp = g.createLinearGradient(0, -R * 0.15, 0, R * 0.15);
    sp.addColorStop(0.00, lift(0.42));
    sp.addColorStop(0.22, lift(1.00));
    sp.addColorStop(0.62, lift(0.70));
    sp.addColorStop(1.00, lift(0.34));
    g.fillStyle = sp;
    g.beginPath();
    g.moveTo(R * 0.175, -R * 0.150);
    g.quadraticCurveTo(R * 0.44, -R * 0.128, R * 0.680, -R * 0.093);
    g.lineTo(R * 0.680, R * 0.093);
    g.quadraticCurveTo(R * 0.44, R * 0.128, R * 0.175, R * 0.150);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(8,9,11,0.7)'; g.lineWidth = R * 0.008; g.stroke();
    g.restore();
  }
  // the hub and the ONE BIG LUG
  g.fillStyle = lift(0.58);
  g.beginPath(); g.arc(cx, cy, R * 0.200, 0, 7); g.fill();
  g.strokeStyle = 'rgba(8,9,11,0.75)'; g.lineWidth = R * 0.012;
  g.beginPath(); g.arc(cx, cy, R * 0.200, 0, 7); g.stroke();
  g.fillStyle = '#a82c22';
  g.beginPath(); g.arc(cx, cy, R * 0.140, 0, 7); g.fill();
  g.fillStyle = '#cdd4dd';
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(a) * R * 0.108, y = cy + Math.sin(a) * R * 0.108;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(20,22,26,0.8)'; g.lineWidth = R * 0.010; g.stroke();
  g.fillStyle = 'rgba(30,33,38,0.85)';
  g.beginPath(); g.arc(cx, cy, R * 0.038, 0, 7); g.fill();

  const t = new THREE.CanvasTexture(blur ? smear(c) : c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// =====================================================================
// GEOMETRY HELPERS
// =====================================================================
const SHARED = new Map();

function rod(a, b, r = 0.026, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = Math.max(0.01, A.distanceTo(B));
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

/**
 * A panel with thickness: four corners and an outward direction. The
 * corner order is fixed up automatically against `outward`, because
 * getting one pillar wound backwards is invisible in the code and
 * unmissable in the render.
 */
function slab(q, t, outward) {
  let p = q.map((v) => new THREE.Vector3(...v));
  const o = new THREE.Vector3(...outward).normalize();
  const nq = new THREE.Vector3().subVectors(p[1], p[0])
    .cross(new THREE.Vector3().subVectors(p[2], p[0]));
  if (nq.dot(o) < 0) p = [p[3], p[2], p[1], p[0]];
  const inner = p.map((v) => v.clone().addScaledVector(o, -t));
  const pos = [];
  for (const v of [...p, ...inner]) pos.push(v.x, v.y, v.z);
  const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6];
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
    idx.push(a, b + 4, b, a, a + 4, b + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a flat quad, for glass and nets, with UVs in the order given */
function quad(q, uvs) {
  const pos = [];
  for (const v of q) pos.push(...v);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function prep(g) {
  const o = g.index ? g.toNonIndexed() : g;
  if (!o.attributes.normal) o.computeVertexNormals();
  if (!o.attributes.uv) {
    o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
  }
  for (const k of Object.keys(o.attributes)) {
    if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
  }
  return o;
}
const merge = (list) => mergeGeometries(list.map(prep));

/** point every vertex of a part at one flat colour on the livery sheet */
function flatUV(g, u, v) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  const [uu, vv] = uvOf(u, v);
  for (let i = 0; i < n; i++) { a[i * 2] = uu; a[i * 2 + 1] = vv; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}
const flatPatch = (g, k) => flatUV(g, PATCH[k][0], PATCH[k][1]);

/** every vertex at one point of the WHEEL texture, in its 0..1 space */
function wheelFlatUV(g, u, v) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}

/** shrink a radial UV set about its centre, so a recessed disc samples the
 * middle of the wheel texture rather than stretching the whole of it */
function shrinkUV(g, k) {
  const a = g.attributes.uv.array;
  for (let i = 0; i < a.length; i += 2) {
    a[i] = 0.5 + (a[i] - 0.5) * k;
    a[i + 1] = 0.5 + (a[i + 1] - 0.5) * k;
  }
  return g;
}

/** map a slab's or grid's vertices into a rectangle of the sheet by (s, t) */
function boxUV(g, fn) {
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const [u, v] = fn(p.getX(i), p.getY(i), p.getZ(i));
    a[i * 2] = u; a[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}

// =====================================================================
// BUILD THE SHARED GEOMETRY - once per marque, used by every car of it
// =====================================================================
function buildShared(T, makeKey) {
  const R = T.wheelRadius;
  const ZF = T.wheelbase * (1 - T.weightFront);
  const ZR = -T.wheelbase * T.weightFront;
  const key = makeKey + ':' + R.toFixed(3) + ':' + ZF.toFixed(3);
  if (SHARED.has(key)) return SHARED.get(key);
  const M = MAKES[makeKey] || MAKES.falcon;
  const G = -R;                    // the road
  const H = (h) => G + h;          // h metres off the road

  // THE ARCHES ARE TIGHT. Eight centimetres of daylight over the top of a
  // 0.372 m tyre is a rally car; a stock car runs the lip two fingers off
  // the rubber, and the gap is most of what the eye reads as ride height.
  const arches = [[ZF, 0.428], [ZR, 0.442]];
  const sections = stationsFor(arches).map((z) => sectionAt(M, arches, z));
  const shell = shellGeometry(sections);

  const at = (z) => sectionAt(M, arches, z);
  const beltAt = (z) => at(z).belt;
  const bwAt = (z) => at(z).hwBelt * 0.962;

  // ---- THE GREENHOUSE ----------------------------------------------------
  const ROOF_Y = M.roofY, RW = M.roofHW, A_Z = M.aZ, C_Z = M.cZ;
  const COWL_Z = M.cowlZ, DECK_Z = M.deckZ;
  const COWL_Y = beltAt(COWL_Z) + 0.008, DECK_Y = beltAt(DECK_Z) + 0.008;
  const COWL_HW = bwAt(COWL_Z) * 0.86, DECK_HW = bwAt(DECK_Z) * 0.90;

  const upper = [];

  // the roof: a shallow dome, mapped across its own strip of the sheet
  upper.push((() => {
    const NZ = 8, NX = 6;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= NZ; i++) {
      const z = C_Z + (A_Z - C_Z) * (i / NZ);
      for (let j = 0; j <= NX; j++) {
        const x = -RW + 2 * RW * (j / NX);
        const dome = 0.030 * (1 - (x / RW) ** 2)
          * (1 - ((z - (A_Z + C_Z) / 2) / ((A_Z - C_Z) / 2)) ** 4);
        pos.push(x, ROOF_Y + dome, z);
        uv.push(...uvOf(ROOF_U0 + (x + RW) / (2 * RW) * (ROOF_U1 - ROOF_U0), z));
      }
    }
    // WOUND SO THE ROOF FACES UP. (a, b, c) with b along +x and c along +z
    // gives x cross z, which is DOWN - the roof was there all along, it was
    // just inside out, and from the blimp you could see the driver through it.
    for (let i = 0; i < NZ; i++) {
      for (let j = 0; j < NX; j++) {
        const a = i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })());

  // TWO ROOF RAILS and a CENTRE ROOF FLAP, which every Cup car has had
  // since they started taking off at Talladega
  for (const s of [1, -1]) {
    const rx = s * RW * 0.80;
    upper.push(flatPatch(slab([
      [rx - 0.022, ROOF_Y + 0.030, C_Z + 0.02], [rx + 0.022, ROOF_Y + 0.030, C_Z + 0.02],
      [rx + 0.022, ROOF_Y + 0.030, A_Z - 0.02], [rx - 0.022, ROOF_Y + 0.030, A_Z - 0.02],
    ], 0.034, [0, 1, 0]), 'body'));
  }
  upper.push(flatPatch(slab([
    [-0.22, ROOF_Y + 0.036, C_Z + 0.30], [0.22, ROOF_Y + 0.036, C_Z + 0.30],
    [0.22, ROOF_Y + 0.036, C_Z + 0.74], [-0.22, ROOF_Y + 0.036, C_Z + 0.74],
  ], 0.008, [0, 1, 0]), 'body'));

  for (const s of [1, -1]) {
    // THE A-POST, solid sheet and not a rod. It carries the car number,
    // which is what a spotter reads when the car is nose-on to him.
    const ax0 = s * COWL_HW, ax1 = s * RW;
    upper.push(boxUV(slab([
      [ax0, COWL_Y - 0.01, COWL_Z], [ax0 + s * 0.055, COWL_Y - 0.01, COWL_Z - 0.09],
      [ax1 + s * 0.012, ROOF_Y + 0.004, A_Z - 0.10], [ax1 + s * 0.012, ROOF_Y + 0.004, A_Z + 0.03],
    ], 0.055, [s, 0.10, 0.25]), (x, y, z) => {
      const t = clamp((y - COWL_Y) / Math.max(0.05, ROOF_Y - COWL_Y), 0, 1);
      return uvOf(mix(APOST.u0, APOST.u1, 0.5), mix(APOST.v0, APOST.v1, t));
    }));

    // THE SAIL PANEL - the sheet metal between the roof and the deck, and
    // the rear wall of the window opening. This is the single biggest
    // difference between the three marques from a chase camera.
    //
    // It is NOT a fin. The first version ran a 10 cm strip of roof down to
    // the whole width of the deck, which is a triangle standing on edge,
    // and three cars in a row looked like they had shark fins on them. A
    // real C-post meets the roof over a third of a metre and leans in.
    const SB_Z = C_Z + 0.68;
    upper.push(boxUV(slab([
      [s * RW, ROOF_Y - 0.005, C_Z + 0.38],
      [s * RW, ROOF_Y - 0.005, C_Z - 0.02],
      [s * DECK_HW, DECK_Y + 0.004, DECK_Z],
      [s * bwAt(SB_Z), beltAt(SB_Z), SB_Z],
    ], 0.11, [s, 0.30, -0.06]), (x, y, z) => {
      const t = clamp((y - DECK_Y) / Math.max(0.05, ROOF_Y - DECK_Y), 0, 1);
      return uvOf(s * mix(SAIL_U0, SAIL_U1, t), clamp(z, -2.6, 2.6));
    }));
  }

  // THE WINDSCREEN BANNER, standing just proud of the glass
  upper.push(boxUV(slab([
    [-0.60, mix(COWL_Y, ROOF_Y, 0.74) + 0.005, mix(COWL_Z, A_Z, 0.74)],
    [0.60, mix(COWL_Y, ROOF_Y, 0.74) + 0.005, mix(COWL_Z, A_Z, 0.74)],
    [0.60, ROOF_Y - 0.006, A_Z + 0.006],
    [-0.60, ROOF_Y - 0.006, A_Z + 0.006],
  ], 0.012, [0, 0.72, 0.70]), (x, y, z) => {
    const t = clamp((y - mix(COWL_Y, ROOF_Y, 0.74)) / Math.max(0.03, ROOF_Y - mix(COWL_Y, ROOF_Y, 0.74)), 0, 1);
    return uvOf(mix(BANNER.u0, BANNER.u1, (x + 0.60) / 1.20), mix(BANNER.v0, BANNER.v1, t));
  }));

  // the fuel filler cap on the left quarter
  upper.push((() => {
    const g = new THREE.CylinderGeometry(0.072, 0.072, 0.026, 12);
    g.rotateZ(Math.PI / 2);
    g.translate(bwAt(-1.66) + 0.012, beltAt(-1.66) - 0.20, -1.66);
    return flatPatch(g, 'chrome');
  })());

  const paint = merge([shell, ...upper]);

  // ---- THE ROLL CAGE, which you see through the windows -------------------
  // THE CAGE FOLLOWS THE GREENHOUSE. It used to be a fixed set of
  // numbers, which put the windscreen hoop twenty centimetres above the
  // driver's eye and straight across the middle of the first-person view,
  // like driving under a bridge. A real hoop is bolted to the top of the
  // windscreen, so it is built from the same roof height and A-post
  // position the glass is.
  const RY = ROOF_Y - 0.035, HX = 0.64;
  const cage = [];
  for (const s of [1, -1]) {
    cage.push(rod([s * HX, 0.30, COWL_Z - 0.05], [s * HX, RY, A_Z]));   // A-post
    cage.push(rod([s * HX, RY, A_Z], [s * HX, RY, C_Z]));               // roof rail
    cage.push(rod([s * HX, RY, C_Z], [s * 0.68, 0.24, DECK_Z + 0.1]));  // rear down bar
    cage.push(rod([s * HX, RY, -0.10], [s * 0.68, 0.16, -0.10]));       // B-post
    cage.push(rod([s * HX, 0.35, 0.30], [s * HX, 0.35, -0.60]));        // door bars
    cage.push(rod([s * HX, 0.20, 0.30], [s * HX, 0.20, -0.60]));
    cage.push(rod([s * HX, 0.52, 0.30], [s * HX, 0.52, -0.60]));
  }
  cage.push(rod([HX, RY, A_Z], [-HX, RY, A_Z]));                        // windscreen hoop
  cage.push(rod([HX, RY, C_Z], [-HX, RY, C_Z]));                        // main hoop
  cage.push(rod([HX, RY, A_Z], [-HX, RY, C_Z]));                        // the X in the roof
  cage.push(rod([-HX, RY, A_Z], [HX, RY, C_Z]));
  // THE EXHAUST, ahead of the right rear wheel, which is where the rules
  // put it and where you can see it from the car behind
  for (const dz of [-0.04, 0.10]) {
    const p = new THREE.CylinderGeometry(0.043, 0.048, 0.34, 10, 1, true);
    p.rotateZ(Math.PI / 2);
    p.translate(-bwAt(-0.95) - 0.02, -0.115, ZR + 0.52 + dz);
    cage.push(p);
  }
  const cageGeo = merge(cage);

  // ---- WHAT IS DARK: the floor, the arch liners, the diffuser, the tub ---
  const dark = [];
  {
    const seat = new THREE.BoxGeometry(0.52, 0.10, 0.62);
    seat.translate(0.30, 0.10, -0.42);
    const back = new THREE.BoxGeometry(0.52, 0.72, 0.10);
    back.rotateX(-0.16); back.translate(0.30, 0.44, -0.74);
    const dash = new THREE.BoxGeometry(1.15, 0.22, 0.30);
    dash.rotateX(0.25); dash.translate(0, 0.50, 0.58);
    dark.push(seat, back, dash);
    // THE UNDERBODY. The painted shell is open at the bottom now, so
    // without this you can see straight up into the car from the apron.
    const pan = new THREE.BoxGeometry(1.90, 0.030, 4.72);
    pan.translate(0, H(0.115), -0.06);
    dark.push(pan);
    // the inner tub floor, higher, where the driver's feet are
    const floor = new THREE.BoxGeometry(1.40, 0.04, 2.10);
    floor.translate(0, -0.05, -0.20);
    dark.push(floor);
    // THE REAR BULKHEAD. Without it you look in the driver's window and
    // straight out of the one on the far side of the car, which is the
    // thing that makes an open greenhouse read as a hole rather than a
    // cockpit.
    const bulk = new THREE.BoxGeometry(1.60, 0.90, 0.04);
    bulk.translate(0, 0.30, -1.02);
    dark.push(bulk);
    // ARCH LINERS. A half tube inside each opening: without one you look
    // through the arch and out the other side of the car.
    for (const [zc, ra] of arches) {
      for (const s of [1, -1]) {
        const l = new THREE.CylinderGeometry(ra * 0.94, ra * 0.94, 0.30, 14, 1, true,
          -Math.PI * 0.52, Math.PI * 1.04);
        l.rotateZ(Math.PI / 2);
        l.rotateX(-Math.PI / 2);
        l.translate(s * 0.88, 0, zc);
        dark.push(l);
      }
    }
    // THE DIFFUSER under the tail, with strakes
    const diff = slab([
      [-0.86, H(0.10), -2.06], [0.86, H(0.10), -2.06],
      [0.86, H(0.26), -2.60], [-0.86, H(0.26), -2.60],
    ], 0.02, [0, -0.9, -0.3]);
    dark.push(diff);
    for (const x of [-0.58, -0.20, 0.20, 0.58]) {
      const st = new THREE.BoxGeometry(0.022, 0.10, 0.54);
      st.rotateX(0.28);
      st.translate(x, H(0.15), -2.33);
      dark.push(st);
    }
  }
  const darkGeo = merge(dark);

  // ---- GLASS: a raked one-piece windscreen and a rear window -------------
  const glass = [];
  {
    glass.push(quad([
      [-COWL_HW, COWL_Y, COWL_Z], [COWL_HW, COWL_Y, COWL_Z],
      [RW * 0.95, ROOF_Y - 0.012, A_Z], [-RW * 0.95, ROOF_Y - 0.012, A_Z],
    ]));
    glass.push(quad([
      [DECK_HW, DECK_Y, DECK_Z], [-DECK_HW, DECK_Y, DECK_Z],
      [-RW * 0.95, ROOF_Y - 0.012, C_Z], [RW * 0.95, ROOF_Y - 0.012, C_Z],
    ]));
    // and a window in the PASSENGER side only. The driver's side of a Cup
    // car is a hole with a net in it, and closing it in is the single
    // fastest way to make the thing read as a saloon car.
    const WZ0 = C_Z + 0.46, WZ1 = A_Z + 0.26;
    glass.push(quad([
      [-bwAt(WZ1) - 0.004, beltAt(WZ1), WZ1], [-bwAt(WZ0) - 0.004, beltAt(WZ0), WZ0],
      [-RW * 0.99, ROOF_Y - 0.03, C_Z + 0.20], [-RW * 0.99, ROOF_Y - 0.03, A_Z - 0.02],
    ]));
  }
  const glassGeo = merge(glass);

  // THE WINDOW NET, on the driver's side, at the FRONT of the opening
  // where the driver's shoulder is. It is a square of webbing about half a
  // metre across, not a curtain over the whole side of the car - covering
  // the lot turned every car in the field into a chain-link fence.
  const netGeo = (() => {
    const z0 = A_Z - 0.44, z1 = A_Z + 0.20;
    const y0 = beltAt((z0 + z1) / 2) + 0.03, y1 = ROOF_Y - 0.075;
    const x = bwAt((z0 + z1) / 2) - 0.012;
    return quad([
      [x + 0.006, y0, z1], [x, y0, z0],
      [RW * 0.995, y1, z0], [RW * 0.995, y1, z1],
    ], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  })();

  // ---- THE SPOILER AND THE SPLITTER --------------------------------------
  // A Cup spoiler is eight inches of blade standing on the back of the deck
  // lid, not a wing on stilts, and it is the most recognisable thing about
  // the car from behind.
  const TAIL_Z = -2.58, deckTop = beltAt(-2.34) + at(-2.34).dome;
  const spoiler = (() => {
    const hwS = bwAt(-2.40);
    const blade = boxUV(slab([
      [-hwS, deckTop - 0.01, -2.34], [hwS, deckTop - 0.01, -2.34],
      [hwS, deckTop + M.spoilerH, -2.34 - M.spoilerH * Math.tan(M.spoilerRake)],
      [-hwS, deckTop + M.spoilerH, -2.34 - M.spoilerH * Math.tan(M.spoilerRake)],
    ], 0.026, [0, 0.25, -0.97]), (x, y, z) => {
      const t = clamp((y - deckTop) / M.spoilerH, 0, 1);
      return uvOf(mix(BLADE.u0, BLADE.u1, (x + hwS) / (2 * hwS)), mix(BLADE.v0, BLADE.v1, t));
    });
    const ends = [];
    for (const s of [1, -1]) {
      ends.push(flatPatch(slab([
        [s * (hwS + 0.014), deckTop - 0.01, -2.10],
        [s * (hwS + 0.014), deckTop - 0.01, -2.40],
        [s * (hwS + 0.014), deckTop + M.spoilerH * 0.92, -2.40],
        [s * (hwS + 0.014), deckTop + M.spoilerH * 0.62, -2.10],
      ], 0.014, [s, 0, 0]), 'trim'));
    }
    return merge([blade, ...ends]);
  })();

  const splitter = (() => {
    const parts = [];
    const g = new THREE.BoxGeometry(2.04, 0.026, 0.56);
    g.translate(0, H(0.048), 2.46);
    parts.push(g);
    // the leading edge, thinner, so it reads as a blade and not a shelf.
    // It stands 14 cm proud of the bumper, which is what a Cup splitter
    // does; the first one ran 40 cm out and the car looked like a plough.
    const lip = new THREE.BoxGeometry(2.04, 0.013, 0.12);
    lip.translate(0, H(0.048), 2.79);
    parts.push(lip);
    // TWO DIVE PLANES, one each side, canted up
    for (const s of [1, -1]) {
      const d = slab([
        [s * 0.92, H(0.062), 2.52], [s * 1.07, H(0.148), 2.50],
        [s * 1.07, H(0.148), 2.28], [s * 0.92, H(0.062), 2.24],
      ], 0.016, [0, 1, 0.2]);
      parts.push(d);
      // and the vertical fence at the outer end of the splitter
      const f = new THREE.BoxGeometry(0.018, 0.095, 0.36);
      f.translate(s * 1.01, H(0.098), 2.58);
      parts.push(f);
    }
    return merge(parts.map((x) => flatPatch(x, 'dark')));
  })();

  // ---- the driver ------------------------------------------------------------
  const driverGeo = (() => {
    const torso = new THREE.CapsuleGeometry(0.21, 0.24, 3, 8);
    torso.scale(1, 1, 0.8);
    const armL = rod([0.16, 0.10, 0.02], [0.30, 0.02, 0.44], 0.055, 6);
    const armR = rod([-0.16, 0.10, 0.02], [-0.30, 0.02, 0.44], 0.055, 6);
    return merge([torso, armL, armR]);
  })();
  const helmetGeo = (() => {
    const s = new THREE.SphereGeometry(0.155, 14, 12);
    s.scale(1, 1.06, 1.1);
    return s;
  })();
  const visorGeo = (() => {
    const v = new THREE.SphereGeometry(0.158, 14, 10,
      Math.PI * 0.30, Math.PI * 0.40, Math.PI * 0.34, Math.PI * 0.30);
    v.scale(1, 1.06, 1.1);
    v.rotateY(Math.PI / 2);
    return v;
  })();
  // ---- THE STEERING WHEEL ----------------------------------------------
  // The nearest object to the camera in the whole game, and it was a
  // six-sided torus with three rods poking out of the middle - a hexagon
  // on a stick, forty centimetres from the eye, for the entire race.
  //
  // A Cup wheel is three things and the first two are what was missing:
  //   A ROUND RIM. Sixteen segments round the ring instead of six, so the
  //   silhouette is a circle and not a nut.
  //   A HUB. Real wheels are quick-release: a fat boss in the middle with
  //   a collar behind it. The middle of the old one was empty, which is
  //   why the spokes read as three loose rods.
  //   FLAT SPOKES, wider than they are thick, because that is what a
  //   stamped spoke looks like and a cylinder never will.
  // Two hundred and seventy triangles more per marque, three marques, and
  // the geometry is shared by the whole field: about eight hundred
  // triangles for the thing the driver looks at all day.
  const steerGeo = (() => {
    const parts = [];
    const t = new THREE.TorusGeometry(0.152, 0.021, 7, 16);
    parts.push(t);
    // three flat spokes at the Cup positions - two up at nine and three,
    // one straight down - so the top of the wheel is clear and the driver
    // can see the dash through it
    for (const a of [Math.PI * 0.12, Math.PI * 0.88, Math.PI * 1.5]) {
      const s = new THREE.BoxGeometry(0.115, 0.030, 0.011);
      s.translate(0.077, 0, 0);
      s.rotateZ(a);
      parts.push(s);
    }
    // the hub: a boss standing proud of the spokes with a collar behind it
    const boss = new THREE.CylinderGeometry(0.046, 0.042, 0.032, 12);
    boss.rotateX(Math.PI / 2);
    boss.translate(0, 0, 0.014);
    parts.push(boss);
    const collar = new THREE.CylinderGeometry(0.030, 0.030, 0.055, 10);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0, -0.030);
    parts.push(collar);
    // and the two grips moulded into the rim at nine and three, which are
    // the bumps your thumbs sit against and the only thing on a wheel that
    // tells you it is not perfectly round
    for (const s of [1, -1]) {
      const grip = new THREE.SphereGeometry(0.030, 8, 6);
      grip.scale(0.55, 1.5, 0.75);
      grip.translate(s * 0.150, 0, 0);
      parts.push(grip);
    }
    return merge(parts);
  })();

  // ---- WHEELS -----------------------------------------------------------------
  // The dish is real: the face of the wheel sits DISH metres inboard of
  // the sidewall, with a barrel between them, so the light goes down into
  // it and the spokes have somewhere to be.
  const DISH = 0.082, FR = 0.615;
  const tyre = (w) => {
    const g = new THREE.CylinderGeometry(R, R, w, 26, 1, true);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  const wheelFace = (w) => {
    const parts = [];
    for (const side of [1, -1]) {
      const x = side * w / 2;
      // the sidewall of the tyre and the outer lip of the rim
      const ring = new THREE.RingGeometry(R * FR, R * 0.998, 26, 1);
      ring.rotateY(side * Math.PI / 2);
      if (side < 0) ring.rotateX(Math.PI);
      ring.translate(x, 0, 0);
      parts.push(ring);
      // the barrel, going in
      const barrel = new THREE.CylinderGeometry(R * FR * 0.985, R * FR * 0.985, DISH, 24, 1, true);
      barrel.rotateZ(Math.PI / 2);
      barrel.translate(x - side * DISH / 2, 0, 0);
      parts.push(wheelFlatUV(barrel, 0.5, 0.045));
      // and the face at the bottom of the dish
      const face = new THREE.CircleGeometry(R * FR * 0.985, 26);
      face.rotateY(side * Math.PI / 2);
      shrinkUV(face, FR * 0.985);
      face.translate(x - side * DISH, 0, 0);
      parts.push(face);
      // the one big centre lug, standing proud of the face
      const lug = new THREE.CylinderGeometry(R * 0.088, R * 0.078, 0.042, 10);
      lug.rotateZ(Math.PI / 2);
      lug.translate(x - side * (DISH - 0.021), 0, 0);
      parts.push(wheelFlatUV(lug, 0.5, 0.5));
    }
    return merge(parts);
  };

  const out = {
    R, H, make: makeKey, M, sections,
    paint, cage: cageGeo, dark: darkGeo, glass: glassGeo, net: netGeo,
    spoiler, splitter,
    driver: driverGeo, helmet: helmetGeo, visor: visorGeo, steer: steerGeo,
    tyreF: tyre(0.31), tyreR: tyre(0.35),
    faceF: wheelFace(0.31), faceR: wheelFace(0.35),
    binding: null,
  };
  SHARED.set(key, out);
  return out;
}

// =====================================================================
// BINDING THE SKIN TO THE PANELS
// =====================================================================
//
// For every vertex of the painted shell, find the one or two damage
// panels near enough to move it, and remember WHERE inside each panel's
// lattice it sits. Done once per marque, for a geometry every car of that
// marque shares - so the cost is paid three times for the whole grid.
function bindPanels(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const count = pos.count;
  const K = 2;
  const pIdx = new Int16Array(count * K).fill(-1);
  const pW = new Float32Array(count * K);
  const pU = new Float32Array(count * K);
  const pV = new Float32Array(count * K);
  const REACH = 0.55;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const found = [];
    for (let k = 0; k < PANELS.length; k++) {
      const S = PANELS[k];
      // the panel's normal is [x, y, z] = [left, up, forward] in model space
      const face = S.n[0] * nx + S.n[1] * ny + S.n[2] * nz;
      if (face < 0.30) continue;
      const dx = x - S.origin[0], dy = y - S.origin[1], dz = z - S.origin[2];
      const a = (dx * S.u[0] + dy * S.u[1] + dz * S.u[2]) / S.su;
      const b = (dx * S.v[0] + dy * S.v[1] + dz * S.v[2]) / S.sv;
      const oa = Math.max(0, Math.abs(a) - 1) * S.su;
      const ob = Math.max(0, Math.abs(b) - 1) * S.sv;
      const off = Math.abs(dx * S.n[0] + dy * S.n[1] + dz * S.n[2]);
      const dist = Math.hypot(oa, ob, off * 0.6);
      if (dist > REACH) continue;
      found.push({ k, w: (1 - dist / REACH) ** 2 * face, a: clamp(a, -1, 1), b: clamp(b, -1, 1) });
    }
    found.sort((p, q) => q.w - p.w);
    let tot = 0;
    for (let s = 0; s < Math.min(K, found.length); s++) tot += found[s].w;
    if (tot <= 0) continue;
    for (let s = 0; s < Math.min(K, found.length); s++) {
      pIdx[i * K + s] = found[s].k;
      pW[i * K + s] = found[s].w / tot;
      pU[i * K + s] = (found[s].a + 1) / 2;
      pV[i * K + s] = (found[s].b + 1) / 2;
    }
  }
  return { K, pIdx, pW, pU, pV, count };
}

/** bilinear read of a panel's depth field at (u, v) in 0..1 */
function depthAt(panel, u, v) {
  const S = panel.spec;
  const fu = u * (S.nu - 1), fv = v * (S.nv - 1);
  const i0 = Math.min(S.nu - 1, Math.floor(fu)), j0 = Math.min(S.nv - 1, Math.floor(fv));
  const i1 = Math.min(S.nu - 1, i0 + 1), j1 = Math.min(S.nv - 1, j0 + 1);
  const tu = fu - i0, tv = fv - j0;
  const d = panel.d;
  const a = d[j0 * S.nu + i0], b = d[j0 * S.nu + i1];
  const c = d[j1 * S.nu + i0], e = d[j1 * S.nu + i1];
  return (a * (1 - tu) + b * tu) * (1 - tv) + (c * (1 - tu) + e * tu) * tv;
}

// =====================================================================
// BUILD ONE CAR
// =====================================================================
export function buildCar(T, livery = {}) {
  const lv = { ...DEFAULT, ...livery };
  const S = buildShared(T, lv.make);
  if (!S.binding) S.binding = bindPanels(S.paint);
  const B = S.binding;
  const car = new THREE.Group();
  car.name = 'car' + lv.number;

  const canvas = liveryCanvas(lv, S.M);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // PAINT IS NOT METAL. Automotive paint is a pigmented dielectric with a
  // clear lacquer over it: the colour comes from diffuse light and the
  // shine from a thin specular layer on top. Turning metalness up sends
  // the albedo into the environment reflection instead, and since the
  // side of a car faces the ASPHALT, every door in the field came out
  // black with a stripe of sky on the shoulder. This is the single line
  // that decides whether a livery is visible at all.
  const paintMat = new THREE.MeshPhysicalMaterial({
    map: tex, roughness: 0.34 + lv.dirt * 0.34, metalness: 0.04,
    clearcoat: 1.0 - lv.dirt * 0.55, clearcoatRoughness: 0.035 + lv.dirt * 0.30,
    // 1.25, NOT 0.85. The clear coat is the whole reason a car reads as
    // painted metal instead of coloured plastic, and what a clear coat
    // does is REFLECT THE PLACE IT IS STANDING IN: sky along the top of
    // the shoulder, the grey of the grandstand across the doors, the
    // asphalt down the rocker. sky.js already bakes exactly that - a dome,
    // a ground disc and a band of stand grey - into the environment probe,
    // and at 0.85 the paint was only taking two thirds of it, so the flank
    // of every car came out as one flat value from the beltline to the
    // sill. This is the number that makes the gradient appear.
    envMapIntensity: 1.25, side: THREE.FrontSide,
  });
  // ---- THE SHADOW UNDER THE CAR'S OWN BODYWORK --------------------------
  // The one thing missing from a shape that is otherwise right: real
  // bodywork gets darker the closer it gets to the road, because the
  // bottom half of the hemisphere it can see is asphalt a foot away
  // instead of sky. Nothing in an image-based light knows that - the probe
  // is a sphere at infinity - so without it the rocker panel is exactly as
  // bright as the roof and the car looks pasted onto the track.
  //
  // Done in the shader off the vertex's own height rather than as a vertex
  // colour attribute, because paintMat is also worn by the spoiler and the
  // splitter, and a missing colour attribute in WebGL reads as zero: the
  // version of this that used vertexColors painted both of them black.
  // Wheel centres are y = 0 and the sill is at about -0.14, so the ramp
  // runs over the bottom 35 cm of the car and is gone by the door handle.
  paintMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBodyY = transformed.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyY;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.46, 1.0, clamp((vBodyY + 0.26) / 0.40, 0.0, 1.0));`);
  };
  const rimTex = TX.suede();
  rimTex.repeat.set(10, 2);
  const M = {
    paint: paintMat,
    cage: new THREE.MeshStandardMaterial({
      // THE CAGE LIVES INDOORS. At 1.2 it took the full image-based
      // light of whatever is in the sky, which under a storm dome is a
      // uniform bright grey - so the bars, and everything else inside the
      // car, went white in the rain while the outside of the car went
      // correctly dark and wet. It is steel in a shadowed box; it should
      // see about half of the sky a wing mirror does.
      color: 0xb2b7bf, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.55,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x1a1d22, roughness: 0.90, side: THREE.DoubleSide, envMapIntensity: 0.95,
    }),
    // THE WINDSCREEN WAS A SHEET OF WHITE. At envMapIntensity 2.2 on
    // roughness 0.04 the glass was reflecting the sky dome at more than
    // twice its real brightness through a mirror finish, so from anywhere
    // in front of the car the screen was a blown-out white panel with the
    // sun's disc smeared across it and you could not see the driver, the
    // cage or the banner through it. A Cup windscreen is 3 mm of Lexan:
    // you see straight through it into a dark cabin, with a WEAK sky
    // reflection laid over the top. Darker tint, a hair more roughness so
    // the sun spreads instead of burning a hole, and a probe reading a
    // little under one.
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x6f8496, roughness: 0.075, metalness: 0.0, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, envMapIntensity: 0.95, clearcoat: 1, clearcoatRoughness: 0.06,
    }),
    net: new THREE.MeshStandardMaterial({
      map: TX.net(), color: 0x2c3138, roughness: 0.92, metalness: 0.0,
      transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.3,
    }),
    rubber: new THREE.MeshStandardMaterial({
      map: TX.slick(), color: 0x1d1e21, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.45,
    }),
    wheel: new THREE.MeshStandardMaterial({
      map: wheelTexture(lv.wheel), roughness: 0.42, metalness: 0.62, envMapIntensity: 0.75,
    }),
    // ...and the same wheel with the spokes smeared, for when it is going
    // too fast for the eye to follow one
    wheelBlur: new THREE.MeshStandardMaterial({
      map: wheelTexture(lv.wheel, true), roughness: 0.44, metalness: 0.65, envMapIntensity: 1.0,
    }),
    suit: new THREE.MeshStandardMaterial({ color: lv.accent, roughness: 0.85 }),
    // the wheel rim: suede, not chrome
    // SUEDE, NOT MOULDED PLASTIC. A flat dark colour on a wheel rim
    // fifty centimetres from the eye is the most obvious plastic surface
    // in the game; suede is fibres going every direction, a stitched
    // seam, and a shine worn into it at ten and two.
    rim: new THREE.MeshStandardMaterial({ map: rimTex, color: 0x9aa0a8, roughness: 0.93, metalness: 0.05, envMapIntensity: 0.18 }),
    helmet: new THREE.MeshPhysicalMaterial({
      color: lv.trim, roughness: 0.18, clearcoat: 1, metalness: 0.1, envMapIntensity: 1.2,
    }),
    visor: new THREE.MeshPhysicalMaterial({
      color: 0x14181f, roughness: 0.04, metalness: 0.9,
      iridescence: 0.6, iridescenceIOR: 1.7, envMapIntensity: 1.6,
    }),
  };

  // the shell gets its OWN copy of the geometry: it is going to be bent,
  // and no two cars bend the same way
  const shellGeo = S.paint.clone();
  const shell = new THREE.Mesh(shellGeo, paintMat);
  shell.castShadow = true; shell.receiveShadow = true;
  car.add(shell);

  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = shadow;
    car.add(m);
    return m;
  };
  add(S.cage, M.cage);
  add(S.dark, M.dark, false);
  add(S.net, M.net, false);
  const glass = add(S.glass, M.glass, false);
  const parts = {
    spoiler: add(S.spoiler, paintMat),
    splitter: add(S.splitter, M.dark),
  };

  // ---- the driver ----------------------------------------------------------
  const driver = new THREE.Group();
  driver.position.set(0.30, 0.42, -0.42);
  driver.add(new THREE.Mesh(S.driver, M.suit));
  const helmet = new THREE.Group();
  helmet.position.set(0, 0.36, 0.02);
  const hm = new THREE.Mesh(S.helmet, M.helmet);
  hm.castShadow = true;
  helmet.add(hm);
  helmet.add(new THREE.Mesh(S.visor, M.visor));
  driver.add(helmet);
  car.add(driver);

  const column = new THREE.Group();
  column.position.set(0.30, 0.54, 0.34);
  column.rotation.x = 0.55;
  const steerWheel = new THREE.Mesh(S.steer, M.rim);
  column.add(steerWheel);
  car.add(column);

  // ---- WHEELS ----------------------------------------------------------------
  // Each corner is a hub that moves with the suspension, a steer group
  // inside it that yaws, and the wheel inside that which spins. Nesting
  // them that way means the three motions cannot fight each other.
  // The face of the wheel is ONE merged mesh per corner, so swapping it
  // for the motion-blurred version is one material assignment and the
  // whole car is eight draw calls of wheel rather than twenty-four.
  const HT = T.trackWidth / 2;
  const xf = T.wheelbase * (1 - T.weightFront), xr = -T.wheelbase * T.weightFront;
  const corners = [
    { x: -HT, z: xf, front: true }, { x: HT, z: xf, front: true },
    { x: -HT, z: xr, front: false }, { x: HT, z: xr, front: false },
  ];
  const wheels = [], hubs = [], steers = [], discs = [];
  corners.forEach((c) => {
    const hub = new THREE.Group();
    hub.position.set(c.x, 0, c.z);
    car.add(hub); hubs.push(hub);
    const st = new THREE.Group();
    hub.add(st); steers.push(st);
    const w = new THREE.Group();
    const t = new THREE.Mesh(c.front ? S.tyreF : S.tyreR, M.rubber);
    t.castShadow = true;
    w.add(t);
    const dm = new THREE.Mesh(c.front ? S.faceF : S.faceR, M.wheel);
    discs.push(dm); w.add(dm);
    st.add(w); wheels.push(w);
  });

  // =====================================================================
  // THE SKIN, FOLLOWING THE DAMAGE
  // =====================================================================
  const base = S.paint.attributes.position.array;
  const baseN = S.paint.attributes.normal.array;
  const live = shellGeo.attributes.position;

  const art = {
    group: car, shell, wheels, hubs, steers, driver, helmet, steerWheel, glass, discs,
    wheelMat: M.wheel, wheelBlurMat: M.wheelBlur,
    parts, paintMat, canvas, texture: tex, R: S.R, floorY: S.H(0.06),
    liveryNumber: lv.number, make: lv.make, marque: S.M.name,

    /**
     * Push the metal in to match damage.js's node field: one pass over the
     * vertex list, reading the two panels each vertex is bound to,
     * interpolating their depth and moving it along its own normal. A
     * panel that has left the car is treated as fully crushed, which is
     * what a missing nose looks like from the outside anyway.
     */
    deform(damage) {
      const panels = damage.panels;
      const a = live.array;
      for (let i = 0; i < B.count; i++) {
        let d = 0;
        for (let s = 0; s < B.K; s++) {
          const k = B.pIdx[i * B.K + s];
          if (k < 0) continue;
          const p = panels[k];
          const depth = p.gone ? p.spec.crush : depthAt(p, B.pU[i * B.K + s], B.pV[i * B.K + s]);
          d += depth * B.pW[i * B.K + s];
        }
        a[i * 3] = base[i * 3] - baseN[i * 3] * d;
        a[i * 3 + 1] = base[i * 3 + 1] - baseN[i * 3 + 1] * d;
        a[i * 3 + 2] = base[i * 3 + 2] - baseN[i * 3 + 2] * d;
      }
      live.needsUpdate = true;
      shellGeo.computeVertexNormals();
      const sp = damage.byId.spoiler, sl = damage.byId.splitter;
      parts.spoiler.visible = !sp.gone;
      parts.spoiler.rotation.x = -sp.worst * 2.2;
      parts.spoiler.position.y = -sp.worst * 0.5;
      parts.splitter.visible = !sl.gone;
      parts.splitter.rotation.x = sl.worst * 1.4;
    },

    /** put the car back the way it came out of the hauler */
    repair() {
      live.array.set(base);
      live.needsUpdate = true;
      shellGeo.computeVertexNormals();
      parts.spoiler.visible = true;
      parts.spoiler.rotation.x = 0;
      parts.spoiler.position.y = 0;
      parts.splitter.visible = true;
      parts.splitter.rotation.x = 0;
    },
  };
  return art;
}

/** for the tools: how much geometry the grid actually costs */
export function sharedInfo() {
  const out = [];
  for (const [k, v] of SHARED) out.push({ key: k, vertices: v.paint.attributes.position.count });
  return out;
}
