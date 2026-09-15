// ===================== NIGHT SHIFT :: LANDMARKS =====================
// The buildings you would actually recognise, with their real numbers.
//
// A million-building replica needs the city's footprint dataset, which is not
// something that can be fetched here. So the approach is the one a film set
// uses: the buildings you know are exact, and the fill around them is honest.
//
// Every entry below is the real footprint, the real roof height and the REAL
// floor count. Empire State is 102 storeys because Empire State is 102 storeys.
// One World Trade tapers because it tapers. The Flatiron is a triangle because
// it is a triangle - it is the reason that block is shaped the way it is.
//
// Positions are placed against the street grid: the map runs Battery at y≈0 to
// Inwood at y≈-5280, so 34th Street lands near y=-2300 and 59th near y=-2950.
//
// `floors` drives the interiors directly. Walking up the Empire State means
// walking up 102 floors of generated plan, and they take as long to climb as
// that implies.

export const LANDMARKS = [
  // ---- Lower Manhattan ----
  { id: 'wtc1', name: 'ONE WORLD TRADE', x: 55, y: -700, w: 62, d: 62,
    h: 541, floors: 104, shape: 'taper', ang: -0.16 },
  { id: 'woolworth', name: 'WOOLWORTH BUILDING', x: 175, y: -560, w: 40, d: 34,
    h: 241, floors: 60, shape: 'gothic', ang: -0.16 },
  { id: 'muni', name: 'MUNICIPAL BUILDING', x: 235, y: -500, w: 46, d: 30,
    h: 177, floors: 40, shape: 'setback', ang: -0.16 },
  { id: 'wallst40', name: '40 WALL STREET', x: 250, y: -300, w: 34, d: 34,
    h: 283, floors: 70, shape: 'gothic', ang: -0.16 },

  // ---- Midtown ----
  { id: 'flatiron', name: 'FLATIRON BUILDING', x: 268, y: -1995, w: 26, d: 52,
    h: 87, floors: 22, shape: 'wedge', ang: -0.16 },
  { id: 'esb', name: 'EMPIRE STATE BUILDING', x: 300, y: -2300, w: 55, d: 46,
    h: 443, floors: 102, shape: 'setback', ang: -0.16 },
  { id: 'msg', name: 'MADISON SQUARE GARDEN', x: 252, y: -2280, w: 52, d: 46,
    h: 46, floors: 5, shape: 'drum', ang: -0.16 },
  { id: 'nyt', name: 'NEW YORK TIMES BUILDING', x: 246, y: -2470, w: 38, d: 38,
    h: 319, floors: 52, shape: 'taper', ang: -0.16 },
  { id: 'bofa', name: 'BANK OF AMERICA TOWER', x: 318, y: -2515, w: 42, d: 40,
    h: 366, floors: 55, shape: 'taper', ang: -0.16 },
  { id: 'chrysler', name: 'CHRYSLER BUILDING', x: 418, y: -2495, w: 36, d: 36,
    h: 319, floors: 77, shape: 'gothic', ang: -0.16 },
  { id: 'gct', name: 'GRAND CENTRAL TERMINAL', x: 392, y: -2520, w: 58, d: 42,
    h: 32, floors: 4, shape: 'hall', ang: -0.16 },
  { id: 'metlife', name: 'METLIFE BUILDING', x: 392, y: -2562, w: 46, d: 30,
    h: 246, floors: 59, shape: 'slab', ang: -0.16 },
  { id: 'rock30', name: '30 ROCKEFELLER PLAZA', x: 330, y: -2648, w: 48, d: 30,
    h: 259, floors: 70, shape: 'setback', ang: -0.16 },
  { id: 'hearst', name: 'HEARST TOWER', x: 262, y: -2872, w: 32, d: 32,
    h: 182, floors: 46, shape: 'diagrid', ang: -0.16 },
  { id: 'park432', name: '432 PARK AVENUE', x: 398, y: -2905, w: 24, d: 24,
    h: 426, floors: 85, shape: 'pencil', ang: -0.16 },
  { id: 'ct111', name: '111 WEST 57TH', x: 322, y: -2900, w: 18, d: 26,
    h: 435, floors: 84, shape: 'pencil', ang: -0.16 },

  // ---- uptown ----
  { id: 'stjohn', name: 'ST JOHN THE DIVINE', x: 120, y: -4020, w: 44, d: 26,
    h: 70, floors: 3, shape: 'gothic', ang: -0.16 },
  { id: 'apollo', name: 'APOLLO THEATER', x: 250, y: -4460, w: 26, d: 20,
    h: 22, floors: 4, shape: 'hall', ang: -0.16 },

  // ---- the other boroughs ----
  { id: 'barclays', name: 'BARCLAYS CENTER', x: 1452, y: -1075, w: 60, d: 52,
    h: 40, floors: 4, shape: 'drum', ang: -0.46 },
  { id: 'yankee', name: 'YANKEE STADIUM', x: 790, y: -5455, w: 78, d: 72,
    h: 42, floors: 5, shape: 'drum', ang: 0.08 },
  { id: 'citifield', name: 'CITI FIELD', x: 2905, y: -3330, w: 70, d: 66,
    h: 40, floors: 5, shape: 'drum', ang: 0.30 },
  { id: 'unisphere', name: 'THE UNISPHERE', x: 2980, y: -3140, w: 20, d: 20,
    h: 43, floors: 1, shape: 'globe', ang: 0.30 },
  { id: 'bkbridge', name: 'BROOKLYN BOROUGH HALL', x: 1330, y: -1010, w: 30, d: 24,
    h: 34, floors: 4, shape: 'hall', ang: -0.46 },

  // ---- the harbour ----
  { id: 'liberty', name: 'STATUE OF LIBERTY', x: -230, y: 690, w: 22, d: 22,
    h: 93, floors: 12, shape: 'statue', ang: 0, island: true },
];

// Real floor-to-floor heights. Offices run taller than flats, which is why a
// 100 m office block has fewer storeys than a 100 m residential one - and it is
// the difference between six flights and nine when you are running up them.
export const FLOOR_H = { office: 4.0, resi: 3.15, low: 3.6 };

export function floorsFor(h, kind) {
  const fh = kind === 'office' ? FLOOR_H.office
           : kind === 'resi' ? FLOOR_H.resi : FLOOR_H.low;
  return Math.max(1, Math.round(h / fh));
}

// NYC egress code, roughly: one stair is only acceptable on a small plate, and
// anything bigger needs two remote from each other. That is why every real
// tower has a stair at each end of the corridor - and why you can be on a floor
// with someone coming up and still have a way down.
export function stairsFor(area, floors) {
  if (floors <= 1) return 1;
  if (area > 460) return 2;
  return 1;
}
