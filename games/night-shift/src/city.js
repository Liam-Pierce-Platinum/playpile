// ===================== NIGHT SHIFT :: THE CITY =====================
// New York, generated from its actual shape.
//
// WHAT THIS IS AND IS NOT. A true replica of every street means roughly 120,000
// surveyed segments out of real map data, which is not something that can be
// written down in a source file. What IS real here is the geography: the
// outline of each borough and therefore the coastline, the rivers and the
// harbour, the big parks, bridges where the bridges are, Broadway cutting its
// diagonal across the Manhattan grid, and neighbourhood zones that change the
// density and height of what gets built as you drive across them.
//
// The grids are laid over each borough and then CLIPPED to its outline, which
// is what makes streets stop at the water and the blocks go ragged along the
// shore instead of running off into nothing.
//
// Scale is about 1:4 - roughly 13 x 15 km - so the Battery to the north Bronx
// is a few minutes at speed. Everything is built lazily per block and cached;
// only what is near you has ever existed.

import { LANDMARKS, floorsFor, stairsFor } from './landmarks.js';

export const TILE = 400;
export { LANDMARKS };

export function hash(n) {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function hash2(a, b) { return hash(a * 157.31 + b * 71.13); }
function hashStr(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 1e6;
  return n;
}

// ---------------------------------------------------------------------------
// OUTLINES. y is north-negative: the Battery sits near the origin and the Bronx
// is up the screen. Traced from the real shapes at about 1:4, widened a little
// where a faithful width would be too thin to drive in.
// ---------------------------------------------------------------------------
const MANHATTAN_POLY = [
  [140, 60], [40, -160], [-30, -520], [-90, -980], [-150, -1500],
  [-210, -2050], [-250, -2600], [-260, -3150], [-230, -3700],
  [-170, -4200], [-80, -4650], [40, -5000], [180, -5220], [330, -5280],
  [470, -5150], [540, -4800], [580, -4350], [640, -3850], [720, -3300],
  [800, -2750], [860, -2200], [900, -1700], [890, -1250], [820, -820],
  [680, -450], [500, -180], [320, -20],
];
const BRONX_POLY = [
  [380, -5320], [300, -5900], [340, -6500], [520, -6900], [900, -7050],
  [1400, -7000], [1900, -6800], [2250, -6450], [2350, -6000],
  [2200, -5600], [1800, -5350], [1300, -5250], [800, -5250],
];
const QUEENS_POLY = [
  [1080, -5100], [1500, -5150], [2100, -5000], [2700, -4600], [3200, -4000],
  [3550, -3300], [3700, -2500], [3600, -1700], [3300, -1050], [2850, -600],
  [2300, -400], [1750, -520], [1400, -900], [1220, -1500], [1080, -2200],
  [1010, -3000], [1010, -4000],
];
const BROOKLYN_POLY = [
  [1080, -1900], [1300, -1200], [1600, -600], [2000, -150], [2500, 150],
  [3000, 300], [3300, 250], [3400, -150], [3250, -600], [2850, -700],
  [2300, -520], [1750, -620], [1400, -1000], [1220, -1600],
];
const STATEN_POLY = [
  [-1900, -300], [-2400, -100], [-2700, 350], [-2600, 900], [-2200, 1300],
  [-1600, 1450], [-1000, 1300], [-650, 900], [-680, 350], [-1050, -50],
  [-1500, -250],
];

// Water. Not driveable, and the only way across is a bridge - which is what
// makes a bridge a decision instead of scenery.
export const WATER = [
  { name: 'HUDSON RIVER', poly: [[-1450, 300], [-380, -260], [-300, -3200], [-250, -5450],
      [-950, -5550], [-1500, -3000]] },
  { name: 'EAST RIVER', poly: [[905, -1450], [1075, -2400], [1020, -4200], [1120, -5150],
      [1520, -5250], [1360, -4000], [1230, -2400], [1170, -1400]] },
  { name: 'UPPER BAY', poly: [[-620, 180], [420, 180], [1420, 520], [1220, 1450], [-620, 1450]] },
];

// ---------------------------------------------------------------------------
// Neighbourhood zones. What gets built where - most of what stops the city
// being one texture from end to end.
// ---------------------------------------------------------------------------
const ZONES = [
  { id: 'fidi', name: 'FINANCIAL DISTRICT', x: 200, y: -350, r: 620,
    minH: 55, maxH: 235, density: 0.98, lots: [12, 26], glass: 0.75 },
  { id: 'soho', name: 'SOHO', x: 210, y: -1250, r: 560,
    minH: 18, maxH: 46, density: 0.97, lots: [10, 18], glass: 0.22 },
  { id: 'midtown', name: 'MIDTOWN', x: 340, y: -2450, r: 800,
    minH: 55, maxH: 265, density: 0.99, lots: [14, 30], glass: 0.70 },
  { id: 'ues', name: 'UPPER EAST SIDE', x: 630, y: -3400, r: 600,
    minH: 30, maxH: 84, density: 0.95, lots: [11, 20], glass: 0.30 },
  { id: 'uws', name: 'UPPER WEST SIDE', x: 60, y: -3400, r: 560,
    minH: 28, maxH: 78, density: 0.94, lots: [11, 20], glass: 0.26 },
  { id: 'harlem', name: 'HARLEM', x: 260, y: -4550, r: 700,
    minH: 16, maxH: 46, density: 0.90, lots: [10, 18], glass: 0.14 },
  { id: 'bronx', name: 'THE BRONX', x: 1300, y: -6100, r: 1500,
    minH: 12, maxH: 54, density: 0.86, lots: [10, 22], glass: 0.16 },
  { id: 'lic', name: 'LONG ISLAND CITY', x: 1520, y: -2600, r: 700,
    minH: 20, maxH: 118, density: 0.88, lots: [12, 26], glass: 0.55 },
  { id: 'queens', name: 'QUEENS', x: 2700, y: -2900, r: 1900,
    minH: 8, maxH: 33, density: 0.78, lots: [10, 20], glass: 0.10 },
  { id: 'dtbk', name: 'DOWNTOWN BROOKLYN', x: 1470, y: -900, r: 520,
    minH: 26, maxH: 128, density: 0.93, lots: [11, 24], glass: 0.50 },
  { id: 'brooklyn', name: 'BROOKLYN', x: 2500, y: -250, r: 1600,
    minH: 9, maxH: 38, density: 0.84, lots: [10, 20], glass: 0.13 },
  { id: 'staten', name: 'STATEN ISLAND', x: -1700, y: 600, r: 1500,
    minH: 6, maxH: 20, density: 0.52, lots: [11, 22], glass: 0.07 },
];

// Big open green. No buildings, different surface underfoot, and a genuinely
// useful place to lose a car - which is what Central Park is at 3 a.m.
export const PARKS = [
  { name: 'CENTRAL PARK', poly: [[150, -2950], [430, -2980], [560, -4060], [280, -4030]] },
  { name: 'PROSPECT PARK', poly: [[1950, -500], [2250, -560], [2320, -180], [2020, -120]] },
  { name: 'FLUSHING MEADOWS', poly: [[2800, -3400], [3120, -3450], [3180, -2900], [2860, -2860]] },
  { name: 'VAN CORTLANDT', poly: [[900, -6750], [1250, -6800], [1300, -6350], [950, -6300]] },
  { name: 'BATTERY PARK', poly: [[50, -70], [230, -50], [210, 90], [30, 70]] },
  { name: 'RIVERSIDE PARK', poly: [[-230, -3200], [-160, -3220], [-110, -4500], [-190, -4480]] },
];

// ---------------------------------------------------------------------------
export const BOROUGHS = [
  { id: 'manhattan', name: 'MANHATTAN', poly: MANHATTAN_POLY,
    ang: -0.16, avenue: 165, street: 62, irregular: 0.03 },
  { id: 'bronx', name: 'THE BRONX', poly: BRONX_POLY,
    ang: 0.08, avenue: 190, street: 96, irregular: 0.20 },
  { id: 'queens', name: 'QUEENS', poly: QUEENS_POLY,
    ang: 0.30, avenue: 215, street: 118, irregular: 0.30 },
  { id: 'brooklyn', name: 'BROOKLYN', poly: BROOKLYN_POLY,
    ang: -0.46, avenue: 185, street: 88, irregular: 0.16 },
  { id: 'statenisland', name: 'STATEN ISLAND', poly: STATEN_POLY,
    ang: 0.18, avenue: 280, street: 175, irregular: 0.44 },
];

// Named roads that ignore the grid. Broadway is the reason Manhattan has
// triangular blocks and five-way junctions, and those are the corners worth
// learning: the police route the grid, and the grid does not go that way.
export const ARTERIES = [
  { name: 'BROADWAY', w: 19, pts: [[150, -80], [190, -700], [230, -1400], [200, -2100],
      [330, -2500], [300, -3100], [230, -3800], [190, -4500], [200, -5150]] },
  { name: 'FDR DRIVE', w: 21, pts: [[520, -220], [720, -900], [830, -1700], [868, -2500],
      [815, -3300], [700, -4100], [560, -4800], [430, -5200]] },
  { name: 'WEST SIDE HWY', w: 21, pts: [[20, -180], [-60, -900], [-140, -1700],
      [-208, -2500], [-238, -3300], [-188, -4100], [-60, -4750], [130, -5150]] },
  { name: 'GRAND CONCOURSE', w: 19, pts: [[820, -5320], [900, -5800], [1000, -6300], [1080, -6850]] },
  { name: 'QUEENS BLVD', w: 21, pts: [[1280, -2900], [1750, -3050], [2350, -3200], [2950, -3300]] },
  { name: 'ATLANTIC AVE', w: 19, pts: [[1320, -1050], [1900, -800], [2600, -560], [3200, -420]] },
  { name: 'FLATBUSH AVE', w: 19, pts: [[1440, -1150], [1750, -650], [2050, -150], [2350, 320]] },
  { name: 'HYLAN BLVD', w: 17, pts: [[-2500, 200], [-2000, 600], [-1400, 950], [-800, 1050]] },
];

export const BRIDGES = [
  { name: 'BROOKLYN BRIDGE', a: [600, -540], b: [1300, -1060], w: 17 },
  { name: 'MANHATTAN BRIDGE', a: [650, -760], b: [1320, -1220], w: 16 },
  { name: 'WILLIAMSBURG BRIDGE', a: [770, -1450], b: [1330, -1700], w: 16 },
  { name: 'QUEENSBORO BRIDGE', a: [860, -2500], b: [1420, -2560], w: 17 },
  { name: 'TRIBOROUGH', a: [700, -4150], b: [1220, -4600], w: 16 },
  { name: 'WILLIS AVE BRIDGE', a: [520, -4900], b: [860, -5330], w: 15 },
  { name: 'VERRAZZANO', a: [1750, 260], b: [-700, 780], w: 18 },
  { name: 'PULASKI', a: [1200, -2050], b: [1470, -2250], w: 14 },
];

const SHOP_NAMES = ['BODEGA', 'CORNER DELI', '24 HR MARKET', 'LAUNDROMAT'];
const SHOP_KINDS = ['bodega', 'deli', 'market', 'laundromat'];

export const ROAD_W = { avenue: 16, street: 11, artery: 20, bridge: 16 };

// ---------------------------------------------------------------------------
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyBounds(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export function inWater(x, y) {
  for (const w of WATER) if (pointInPoly(x, y, w.poly)) return w;
  return null;
}
export function inPark(x, y) {
  for (const p of PARKS) if (pointInPoly(x, y, p.poly)) return p;
  return null;
}
export function zoneAt(x, y) {
  let best = ZONES[ZONES.length - 1], bd = 1e18;
  for (const z of ZONES) {
    const d = (x - z.x) ** 2 + (y - z.y) ** 2;
    if (d < z.r * z.r && d < bd) { bd = d; best = z; }
  }
  return best;
}

// ---------------------------------------------------------------------------
export class City {
  constructor(seed) {
    this.seed = seed || 1337;
    this.blocks = new Map();
    this.cells = new Map();
    this.roads = [];
    this.nodes = new Map();
    for (const b of BOROUGHS) b.bounds = polyBounds(b.poly);
    // The buildings you would recognise go in first, at their real
    // footprints and real heights, and the generated fill has to work
    // around them rather than the other way about.
    this.landmarks = LANDMARKS.map(L => {
      const bl = {
        id: L.id, name: L.name, landmark: true, shape: L.shape,
        x: L.x, y: L.y, w: L.w, d: L.d, h: L.h, ang: L.ang,
        floors: L.floors, seed: hashStr(L.id),
        zone: { glass: 0.6, name: L.name }, kind: 'landmark',
        doorSide: 'v-', island: !!L.island,
      };
      bl.door = this.doorOf(bl);
      return bl;
    });
    this.build();
  }

  build() {
    for (const b of BOROUGHS) this.gridFor(b);
    for (const a of ARTERIES) this.polyline(a.pts, 'artery', a.w, a.name);
    for (const br of BRIDGES) {
      const r = this.addRoad(br.a[0], br.a[1], br.b[0], br.b[1], 'bridge', null, br.w);
      r.name = br.name; r.bridge = true;
    }
    for (const r of this.roads) this.hashRoad(r);
    this.settleLandmarks();
  }

  settleLandmarks() {
    for (const L of this.landmarks) {
      if (L.island) continue;
      const reach = Math.hypot(L.w, L.d) / 2;
      for (let pass = 0; pass < 14; pass++) {
        let worst = null, worstOver = 0;
        for (const r of this.roadsNear(L.x, L.y)) {
          const t = Math.max(0, Math.min(1,
            ((L.x - r.x0) * r.dx + (L.y - r.y0) * r.dy) / (r.len * r.len)));
          const px = r.x0 + r.dx * t, py = r.y0 + r.dy * t;
          const d = Math.hypot(L.x - px, L.y - py);
          const need = r.w / 2 + reach * 0.62 + 1.5;
          if (need - d > worstOver) {
            worstOver = need - d;
            worst = { nx: (L.x - px) / (d || 1), ny: (L.y - py) / (d || 1) };
          }
        }
        if (!worst) break;
        L.x += worst.nx * (worstOver + 0.6);
        L.y += worst.ny * (worstOver + 0.6);
      }
      L.door = this.doorOf(L);
    }
  }

  polyline(pts, kind, w, name) {
    for (let i = 0; i < pts.length - 1; i++) {
      const r = this.addRoad(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], kind, null, w);
      r.name = name;
    }
  }

  gridFor(b) {
    const cs = Math.cos(b.ang), sn = Math.sin(b.ang);
    const B = b.bounds;
    const R = Math.hypot(B.x1 - B.x0, B.y1 - B.y0) / 2 + 60;
    b.toW = (u, v) => [B.cx + cs * u - sn * v, B.cy + sn * u + cs * v];
    b.toL = (x, y) => {
      const dx = x - B.cx, dy = y - B.cy;
      return [cs * dx + sn * dy, -sn * dx + cs * dy];
    };
    b.R = R;
    b.nx = Math.ceil((R * 2) / b.avenue);
    b.ny = Math.ceil((R * 2) / b.street);

    for (let i = 0; i <= b.nx; i++) {
      const u = -R + i * b.avenue;
      if (i > 0 && hash2(B.cx + i, 7) < b.irregular * 0.3) continue;
      this.clipLine(b, u, -R, u, R, 'avenue');
    }
    for (let j = 0; j <= b.ny; j++) {
      const v = -R + j * b.street;
      if (j > 0 && hash2(B.cy + j, 13) < b.irregular * 0.45) continue;
      this.clipLine(b, -R, v, R, v, 'street');
    }
  }

  // Walk the candidate line and keep only the stretches that are on land.
  clipLine(b, u0, v0, u1, v1, kind) {
    const N = Math.ceil(Math.hypot(u1 - u0, v1 - v0) / 14);
    let run = null;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const [x, y] = b.toW(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
      const ok = pointInPoly(x, y, b.poly) && !inWater(x, y) && !inPark(x, y);
      if (ok) { if (!run) run = [x, y, x, y]; run[2] = x; run[3] = y; }
      else if (run) {
        if (Math.hypot(run[2] - run[0], run[3] - run[1]) > 26)
          this.addRoad(run[0], run[1], run[2], run[3], kind, b);
        run = null;
      }
    }
    if (run && Math.hypot(run[2] - run[0], run[3] - run[1]) > 26)
      this.addRoad(run[0], run[1], run[2], run[3], kind, b);
  }

  addRoad(x0, y0, x1, y1, kind, b, w) {
    const r = { x0, y0, x1, y1, kind, w: w || ROAD_W[kind], b, dx: x1 - x0, dy: y1 - y0 };
    r.len = Math.hypot(r.dx, r.dy) || 1;
    r.ux = r.dx / r.len; r.uy = r.dy / r.len;
    this.roads.push(r);
    const steps = Math.max(1, Math.round(r.len / 70));
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const nx = x0 + r.dx * t, ny = y0 + r.dy * t;
      const key = (Math.round(nx / 14) * 14) + ',' + (Math.round(ny / 14) * 14);
      let n = this.nodes.get(key);
      if (!n) { n = { x: nx, y: ny, links: [] }; this.nodes.set(key, n); }
      if (prev && prev !== n) {
        if (!prev.links.includes(n)) prev.links.push(n);
        if (!n.links.includes(prev)) n.links.push(prev);
      }
      prev = n;
    }
    return r;
  }

  hashRoad(r) {
    const steps = Math.ceil(r.len / (TILE * 0.5)) + 1;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const cx = Math.floor((r.x0 + r.dx * t) / TILE);
      const cy = Math.floor((r.y0 + r.dy * t) / TILE);
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
        const key = (cx + a) + ',' + (cy + c);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, list = []);
        if (!list.includes(r)) list.push(r);
      }
    }
  }

  roadsNear(x, y) {
    return this.cells.get(Math.floor(x / TILE) + ',' + Math.floor(y / TILE)) || [];
  }

  surfaceAt(x, y) {
    let best = 1e9, road = null;
    for (const r of this.roadsNear(x, y)) {
      const t = Math.max(0, Math.min(1,
        ((x - r.x0) * r.dx + (y - r.y0) * r.dy) / (r.len * r.len)));
      const px = r.x0 + r.dx * t, py = r.y0 + r.dy * t;
      const d = Math.hypot(x - px, y - py) - r.w / 2;
      if (d < best) { best = d; road = r; }
    }
    return { dist: best, road, onRoad: best <= 0, park: inPark(x, y), water: inWater(x, y) };
  }

  boroughAt(x, y) {
    for (const b of BOROUGHS) if (pointInPoly(x, y, b.poly)) return b;
    return null;
  }

  // Where you are, by name. Being told you have crossed into Harlem is worth
  // more than being told you are still in Manhattan.
  placeName(x, y) {
    const p = inPark(x, y);
    if (p) return p.name;
    const b = this.boroughAt(x, y);
    if (!b) {
      const w = inWater(x, y);
      return w ? w.name : 'THE HARBOUR';
    }
    const z = zoneAt(x, y);
    const zb = this.boroughAt(z.x, z.y);
    return (zb && zb.id === b.id) ? z.name : b.name;
  }

  // ---- blocks and buildings ----------------------------------------------
  blockAt(b, i, j) {
    const key = b.id + ':' + i + ',' + j;
    let blk = this.blocks.get(key);
    if (blk) return blk;
    if (i < 0 || j < 0 || i > b.nx || j > b.ny) return null;

    const R = b.R;
    const u0 = -R + i * b.avenue, v0 = -R + j * b.street;
    const [ccx, ccy] = b.toW(u0 + b.avenue / 2, v0 + b.street / 2);
    if (!pointInPoly(ccx, ccy, b.poly) || inWater(ccx, ccy) || inPark(ccx, ccy)) {
      blk = { key, b, i, j, buildings: [], garage: null, empty: true };
      this.blocks.set(key, blk);
      return blk;
    }
    const Z = zoneAt(ccx, ccy);

    const pad = 4.6;
    const inU = ROAD_W.avenue / 2 + pad, inV = ROAD_W.street / 2 + pad;
    const lu = b.avenue - inU * 2, lv = b.street - inV * 2;
    blk = { key, b, i, j, zone: Z, buildings: [], garage: null };
    const rnd = (k) => hash(this.seed + i * 73.1 + j * 19.7 + k * 3.3 + b.bounds.cx);

    const [gx, gy] = b.toW(u0 + inU + lu / 2, v0 + inV + lv / 2);
    if (rnd(99) < 0.075 && lu > 38 && lv > 30 && !this.onRoad(gx, gy, lu, lv)) {
      blk.garage = this.makeGarage(b, u0 + inU, v0 + inV, lu, lv, rnd, Z);
      this.blocks.set(key, blk);
      return blk;
    }

    const sides = [
      { along: 'u', at: v0 + inV, dir: -1, len: lu, base: u0 + inU },
      { along: 'u', at: v0 + b.street - inV, dir: 1, len: lu, base: u0 + inU },
      { along: 'v', at: u0 + inU, dir: -1, len: lv, base: v0 + inV },
      { along: 'v', at: u0 + b.avenue - inU, dir: 1, len: lv, base: v0 + inV },
    ];
    let id = 0;
    for (const s of sides) {
      let p = 0, guard = 0;
      while (p < s.len - 8 && guard++ < 44) {
        const wdt = Z.lots[0] + rnd(id * 5 + 1) * (Z.lots[1] - Z.lots[0]);
        if (p + wdt > s.len) break;
        if (rnd(id * 7 + 2) > Z.density) { p += wdt; id++; continue; }
        const dep = 12 + rnd(id * 11 + 3) * 10;
        const hgt = Z.minH + Math.pow(rnd(id * 13 + 4), 2.0) * (Z.maxH - Z.minH);
        // `dir` is the OUTWARD normal - which way the door faces - so the
        // building extrudes the other way, back into the block.
        const cu = s.along === 'u' ? s.base + p + wdt / 2 : s.at - s.dir * dep / 2;
        const cv = s.along === 'u' ? s.at - s.dir * dep / 2 : s.base + p + wdt / 2;
        const [wx, wy] = b.toW(cu, cv);
        const bw = s.along === 'u' ? wdt : dep;
        const bd = s.along === 'u' ? dep : wdt;
        if (this.onRoad(wx, wy, bw, bd) || this.onLandmark(wx, wy, bw, bd)) { p += wdt; id++; continue; }
        const seed = Math.floor(rnd(id * 17 + 5) * 1e6);
        const isShop = hgt < 40 && hash(seed * 3.1) < 0.16;
        const shopIdx = Math.floor(hash(seed * 5.7) * 4);
        const bl = {
          id: key + '#' + id, x: wx, y: wy, ang: b.ang,
          w: bw, d: bd,
          h: hgt, seed, zone: Z,
          glass: hash(seed * 1.7) < Z.glass,
          doorSide: s.along === 'u' ? (s.dir < 0 ? 'v-' : 'v+') : (s.dir < 0 ? 'u-' : 'u+'),
          kind: hgt > 90 ? 'tower' : hgt > 30 ? 'block' : 'walkup',
          // A bodega on the corner. Somewhere to buy food, water and a way
          // of not looking like the description - at the cost of standing
          // still in a lit doorway while a city looks for you.
          shop: isShop,
          // null on anything that is not one, so "has a shopKind" is a reliable
          // test - these used to be set on every building in the city
          shopName: isShop ? SHOP_NAMES[shopIdx] : null,
          shopKind: isShop ? SHOP_KINDS[shopIdx] : null,
          till: isShop ? 180 + Math.floor(hash(seed * 9.3) * 520) : 0,
          // storeys from real floor-to-floor heights rather than a guess:
          // offices run ~4.0 m, flats ~3.15 m, so a 100 m office block has
          // noticeably fewer storeys than a 100 m residential one
          floors: floorsFor(hgt, hgt > 60 ? 'office' : hgt > 24 ? 'resi' : 'low'),
        };
        bl.door = this.doorOf(bl);
        blk.buildings.push(bl);
        p += wdt; id++;
      }
    }
    this.blocks.set(key, blk);
    return blk;
  }

  // Is this footprint sitting on a road?
  //
  // The blocks come out of one borough grid, and Broadway, the FDR, the
  // bridges and the neighbouring borough's grid know nothing about it. Any
  // of them can run straight through a lot, and then the first thing you do
  // driving down Broadway is hit a building that is standing in it. Every
  // footprint gets checked against the real road network before it is kept.
  // Is this lot standing where a real building already is?
  onLandmark(x, y, w, d) {
    const reach = Math.hypot(w, d) / 2;
    for (const L of this.landmarks) {
      if (Math.abs(x - L.x) < L.w / 2 + reach && Math.abs(y - L.y) < L.d / 2 + reach) return true;
    }
    return false;
  }

  onRoad(x, y, w, d) {
    const reach = Math.hypot(w, d) / 2;
    for (const r of this.roadsNear(x, y)) {
      const t = Math.max(0, Math.min(1,
        ((x - r.x0) * r.dx + (y - r.y0) * r.dy) / (r.len * r.len)));
      const px = r.x0 + r.dx * t, py = r.y0 + r.dy * t;
      if (Math.hypot(x - px, y - py) < r.w / 2 + reach * 0.72 + 1.5) return true;
    }
    return false;
  }

  doorOf(bl) {
    const cs = Math.cos(bl.ang), sn = Math.sin(bl.ang);
    const hu = bl.w / 2, hv = bl.d / 2;
    let lu = 0, lv = 0, fu = 0, fv = 0;
    if (bl.doorSide === 'v-') { lv = -hv; fv = -1; }
    else if (bl.doorSide === 'v+') { lv = hv; fv = 1; }
    else if (bl.doorSide === 'u-') { lu = -hu; fu = -1; }
    else { lu = hu; fu = 1; }
    return {
      x: bl.x + cs * lu - sn * lv, y: bl.y + sn * lu + cs * lv,
      nx: cs * fu - sn * fv, ny: sn * fu + cs * fv,
    };
  }

  makeGarage(b, u0, v0, lu, lv, rnd, Z) {
    const [wx, wy] = b.toW(u0 + lu / 2, v0 + lv / 2);
    const decks = 3 + Math.floor(rnd(21) * 3);
    const g = {
      garage: true, id: 'g' + Math.round(wx) + ',' + Math.round(wy),
      x: wx, y: wy, ang: b.ang, w: lu, d: lv, h: decks * 3.4 + 2,
      decks, seed: Math.floor(rnd(23) * 1e6), kind: 'garage',
      doorSide: 'v-', zone: Z, mouth: 8,
    };
    g.door = this.doorOf(g);
    return g;
  }

  around(x, y, radius) {
    const out = [];
    for (const L of this.landmarks) {
      if (Math.abs(L.x - x) < radius + L.w && Math.abs(L.y - y) < radius + L.d) out.push(L);
    }
    for (const b of BOROUGHS) {
      const B = b.bounds;
      if (x < B.x0 - radius - 200 || x > B.x1 + radius + 200) continue;
      if (y < B.y0 - radius - 200 || y > B.y1 + radius + 200) continue;
      const [u, v] = b.toL(x, y);
      const i0 = Math.floor((u + b.R - radius) / b.avenue);
      const i1 = Math.floor((u + b.R + radius) / b.avenue);
      const j0 = Math.floor((v + b.R - radius) / b.street);
      const j1 = Math.floor((v + b.R + radius) / b.street);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const blk = this.blockAt(b, i, j);
        if (!blk || blk.empty) continue;
        if (blk.garage) out.push(blk.garage);
        else for (const bl of blk.buildings) out.push(bl);
      }
    }
    return out;
  }

  // ---- routing -----------------------------------------------------------
  nearestNode(x, y) {
    let best = null, bd = 1e9;
    for (let ax = -160; ax <= 160; ax += 14)
      for (let ay = -160; ay <= 160; ay += 14) {
        const key = (Math.round((x + ax) / 14) * 14) + ',' + (Math.round((y + ay) / 14) * 14);
        const n = this.nodes.get(key);
        if (!n) continue;
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
    return best;
  }

  route(from, to, limit) {
    if (!from || !to) return null;
    const seen = new Set([from]);
    const cameFrom = new Map();
    const open = [from];
    const H = n => (n.x - to.x) ** 2 + (n.y - to.y) ** 2;
    for (let step = 0; step < (limit || 700) && open.length; step++) {
      open.sort((a, c) => H(a) - H(c));
      const n = open.shift();
      if (n === to) break;
      for (const m of n.links) {
        if (seen.has(m)) continue;
        seen.add(m); cameFrom.set(m, n); open.push(m);
      }
    }
    if (!cameFrom.has(to)) return null;
    const path = [to];
    let cur = to;
    while (cameFrom.has(cur)) { cur = cameFrom.get(cur); path.push(cur); }
    return path.reverse();
  }
}

// ---------------------------------------------------------------------------
// INTERIORS
//
// A building is not one room, it is a stack of floors. That matters because
// going UP is a real decision: every floor you climb is another floor they have
// to clear to reach you, and it is also a floor you have to come back down
// before you can leave. A tower is the safest place in the city and the worst
// place to be trapped, and those are the same fact.
//
// Each floor: a stair core in one corner, a corridor, and rooms off it. Every
// room has one door, and a door is a thing you can put a desk against.
//
// Generated from the building's own seed, so the same building is the same
// inside every time you go back to it.
// ---------------------------------------------------------------------------
export function interiorOf(bl) {
  if (bl._interior) return bl._interior;
  const rnd = (k) => hash(bl.seed + k * 7.77);
  const W = Math.max(15, bl.w), D = Math.max(15, bl.d);
  const hw = W / 2, hd = D / 2;
  const frontOnV = bl.doorSide === 'v-' || bl.doorSide === 'v+';
  const frontSign = (bl.doorSide === 'v-' || bl.doorSide === 'u-') ? -1 : 1;

  // The real number. Empire State is 102 because Empire State is 102, and
  // the generated blocks use real floor-to-floor heights. Plans are built
  // per floor on demand - generating 104 of them up front to walk into a
  // lobby would be absurd.
  const floors = bl.floors || floorsFor(bl.h, bl.h > 60 ? 'office' : 'resi');

  // the stair core sits in the same corner on every floor, which is what makes
  // it findable when you are running
  // EGRESS. One stair is only acceptable on a small plate; anything bigger
  // needs two, remote from each other. That is why every real tower has a
  // stair at each end - and why being on a floor with someone coming up one
  // of them is survivable.
  const nStairs = stairsFor(W * D, floors);
  const stairs = [{ x: -hw + 3.2, y: -hd + 3.2, r: 2.4 }];
  if (nStairs > 1) stairs.push({ x: hw - 3.2, y: hd - 3.2, r: 2.4 });
  const stair = stairs[0];

  const buildFloor = (f) => {
    const walls = [];
    const rooms = [];
    const wall = (x0, y0, x1, y1) => walls.push({ x0, y0, x1, y1 });

    // ---- shell ----
    // Only the ground floor has doors to the street. Upstairs the shell is
    // solid, which is exactly why upstairs is safe and also why it is a trap.
    const gap = 2.6;
    const shell = (ax, ay, bx, by, holed) => {
      if (!holed) { wall(ax, ay, bx, by); return; }
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      const t0 = (L / 2 - gap / 2) / L, t1 = (L / 2 + gap / 2) / L;
      wall(ax, ay, ax + dx * t0, ay + dy * t0);
      wall(ax + dx * t1, ay + dy * t1, bx, by);
    };
    const ground = f === 0;
    if (frontOnV) {
      shell(-hw, -hd, hw, -hd, ground); shell(-hw, hd, hw, hd, ground);
      wall(-hw, -hd, -hw, hd); wall(hw, -hd, hw, hd);
    } else {
      shell(-hw, -hd, -hw, hd, ground); shell(hw, -hd, hw, hd, ground);
      wall(-hw, -hd, hw, -hd); wall(-hw, hd, hw, hd);
    }

    // ---- stair cores, walled off with their own doorways ----
    const s = stairs[0];
    for (const st of stairs) {
      const sx = Math.sign(st.x) || 1, sy = Math.sign(st.y) || 1;
      wall(st.x - sx * st.r, st.y - sy * st.r, st.x - sx * st.r, st.y + sy * st.r * 0.35);
      wall(st.x - sx * st.r, st.y + sy * st.r, st.x + sx * st.r * 0.35, st.y + sy * st.r);
    }

    // ---- rooms down both sides of a corridor ----
    const corr = 3.2;
    const along = frontOnV ? D : W;
    const across = frontOnV ? W : D;
    const roomDepth = (across - corr * 2) / 2;
    let idx = 0;
    for (let side = -1; side <= 1; side += 2) {
      let q = -along / 2 + (ground ? 6 : 2);
      let guard = 0;
      while (q < along / 2 - 5 && guard++ < 12) {
        const len = 4.6 + rnd(f * 31 + idx * 5) * 4.4;
        if (q + len > along / 2 - 2) break;
        // room box in floor-local axes
        const a0 = q, a1 = q + len;
        const b0 = side < 0 ? -across / 2 : corr;
        const b1 = side < 0 ? -corr : across / 2;
        const box = frontOnV
          ? { x0: b0, y0: a0, x1: b1, y1: a1 }
          : { x0: a0, y0: b0, x1: a1, y1: b1 };
        // skip the stair core
        const mx = (box.x0 + box.x1) / 2, my = (box.y0 + box.y1) / 2;
        const inStair = stairs.some(st =>
          Math.abs(mx - st.x) < st.r + 2.6 && Math.abs(my - st.y) < st.r + 2.6);
        if (!inStair && roomDepth > 3) {
          // the doorway is the middle of the corridor-facing wall
          const door = frontOnV
            ? { x: side < 0 ? -corr : corr, y: (a0 + a1) / 2, ax: 'x' }
            : { x: (a0 + a1) / 2, y: side < 0 ? -corr : corr, ax: 'y' };
          const room = {
            id: f + ':' + idx, f,
            x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1,
            cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2,
            door, barricade: 0, breach: 0,
          };
          rooms.push(room);
          // the three solid walls, plus the fourth with a hole in it
          if (frontOnV) {
            wall(box.x0, box.y0, box.x1, box.y0);
            wall(box.x0, box.y1, box.x1, box.y1);
            wall(side < 0 ? box.x0 : box.x1, box.y0, side < 0 ? box.x0 : box.x1, box.y1);
            const dx = side < 0 ? box.x1 : box.x0;
            wall(dx, box.y0, dx, door.y - 1.3);
            wall(dx, door.y + 1.3, dx, box.y1);
            room.doorWalls = [walls.length - 2, walls.length - 1];
          } else {
            wall(box.x0, box.y0, box.x0, box.y1);
            wall(box.x1, box.y0, box.x1, box.y1);
            wall(box.x0, side < 0 ? box.y0 : box.y1, box.x1, side < 0 ? box.y0 : box.y1);
            const dy = side < 0 ? box.y1 : box.y0;
            wall(box.x0, dy, door.x - 1.3, dy);
            wall(door.x + 1.3, dy, box.x1, dy);
            room.doorWalls = [walls.length - 2, walls.length - 1];
          }
          idx++;
        }
        q += len + 0.6;
      }
    }

    // ---- fittings ----
    // Only the ground floor of a shop; upstairs is storage and offices like
    // anywhere else.
    const props = [];
    if (bl.shop && f === 0) {
      const K = bl.shopKind;
      if (K === 'laundromat') {
        // two banks of machines down the long walls, which is exactly what a
        // laundromat is and exactly what makes it a bad place to be cornered
        for (let side = -1; side <= 1; side += 2) {
          for (let q = -hd + 4; q < hd - 4; q += 2.2) {
            props.push({ t: 'washer', x: side * (hw - 1.3), y: q, w: 1.5, d: 1.8 });
          }
        }
        props.push({ t: 'bench', x: 0, y: 1.5, w: 1.0, d: 6.0 });
      } else {
        // aisles of shelving with a gap you can actually walk down
        const n = Math.max(1, Math.floor((W - 6) / 4.2));
        for (let i = 0; i < n; i++) {
          const x = -W / 2 + 4 + i * 4.2;
          props.push({ t: 'shelf', x, y: 1.0, w: 1.1, d: Math.max(3, D * 0.42) });
        }
        props.push({ t: 'chiller', x: hw - 1.4, y: 0, w: 1.6, d: Math.max(4, D * 0.5) });
      }
      props.push({ t: 'counter', x: 0, y: -hd + 3.2, w: 6.0, d: 1.2, till: true });
    }
    // fittings are furniture: you walk round them, not through them
    for (const pr of props) {
      wall(pr.x - pr.w / 2, pr.y - pr.d / 2, pr.x + pr.w / 2, pr.y - pr.d / 2);
      wall(pr.x + pr.w / 2, pr.y - pr.d / 2, pr.x + pr.w / 2, pr.y + pr.d / 2);
      wall(pr.x + pr.w / 2, pr.y + pr.d / 2, pr.x - pr.w / 2, pr.y + pr.d / 2);
      wall(pr.x - pr.w / 2, pr.y + pr.d / 2, pr.x - pr.w / 2, pr.y - pr.d / 2);
    }
    return { walls, rooms, stairs, stair: s, floor: f, props };
  };

  const cache = [];
  bl._interior = {
    W, D, floors, stairs, stair,
    // built the first time somebody actually walks onto that floor
    plan: new Proxy({}, {
      get(_, k) {
        const f = +k;
        if (Number.isNaN(f)) return undefined;
        return cache[f] || (cache[f] = buildFloor(f));
      },
    }),
    entry: frontOnV ? { x: 0, y: frontSign * (hd - 1.6) } : { x: frontSign * (hw - 1.6), y: 0 },
    back: frontOnV ? { x: 0, y: -frontSign * (hd - 1.6) } : { x: -frontSign * (hw - 1.6), y: 0 },
  };
  return bl._interior;
}
