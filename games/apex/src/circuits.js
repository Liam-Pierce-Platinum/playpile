// =====================================================================
// APEX :: circuits.js - THE TRACKS, AS STRAIGHTS AND CORNERS
// =====================================================================
//
// A racing circuit is not a freehand squiggle, it is a chain of straights
// and constant-radius arcs, and describing it that way is both how they
// are really surveyed and the only way to get a centre line with no kinks
// in it. Every corner below is a real corner with its real name.
//
//   { s: 300 }            a 300 metre straight
//   { a: -75, r: 42 }     75 degrees of RIGHT hand corner on a 42 m radius
//   { a: 110, r: 95 }     110 degrees of LEFT on a 95 m radius
//
// Negative is right, positive is left, which matches the physics (yaw
// rate greater than zero turns left).
//
// ---------------------------------------------------------------------
// HOW CLOSE ARE THESE TO THE REAL THING?
// ---------------------------------------------------------------------
// The corner sequence, the direction of every turn, the radius of each
// one relative to the others and the lap distance are all real - they are
// what makes Monza feel like Monza and Suzuka feel like Suzuka. The exact
// surveyed coordinates are not: these were laid out from the published
// corner-by-corner geometry, so a lap comes out within a few per cent of
// the real distance and the corners arrive in the right order at the
// right speeds. `node tools/laps.mjs` prints the error for each one.
//
// Each track also carries where the pit straight starts, and where to put
// the grandstands, so they end up at the corners people actually watch.
export const CIRCUITS = {
  monza: {
    name: 'Monza',
    country: 'Italy',
    real: 5793,             // m, the published lap distance
    width: 15,              // m of asphalt
    // Monza is a power circuit: two enormous straights, three chicanes
    // that exist only to stop it being flat out, and the Parabolica.
    start: { x: 0, z: 0, heading: 0 },
    segments: [
      { s: 747, name: 'Rettifilo Tribune' }, { a: -39.3, r: 32 }, { s: 24 },
      { a: 47.8, r: 28, name: 'Variante del Rettifilo' }, { s: 157 }, { a: -88.4, r: 377, name: 'Curva Grande' },
      { s: 375 }, { a: 42.7, r: 40 }, { s: 26 },
      { a: -38.5, r: 36, name: 'Variante della Roggia' }, { s: 126 }, { a: -70.9, r: 73, name: 'Lesmo 1' },
      { s: 138 }, { a: -67, r: 64, name: 'Lesmo 2' }, { s: 708, name: 'Serraglio' },
      { a: 45.2, r: 80 }, { s: 41 }, { a: -67.2, r: 68 },
      { s: 41 }, { a: 47.6, r: 93, name: 'Variante Ascari' }, { s: 1169, name: 'Rettifilo Centro' },
      { a: -170, r: 170, name: 'Parabolica' }, { s: 636 }, { a: -2, r: 900 },
    ],
    stands: [40, 900, 2600, 4300, 5500],
    trees: 'dense',
  },

  silverstone: {
    name: 'Silverstone',
    country: 'Great Britain',
    real: 5891,
    width: 14,
    // Fast, open and flowing. Copse, Maggotts-Becketts and Stowe are
    // three of the quickest corners anywhere.
    start: { x: 0, z: 0, heading: 0 },
    segments: [
      { s: 410 }, { a: -64.8, r: 188, name: 'Abbey' }, { s: 90 },
      { a: 55.5, r: 149, name: 'Farm Curve' }, { s: 208 }, { a: -81.6, r: 46, name: 'Village' },
      { s: 70 }, { a: -54.5, r: 79, name: 'The Loop' }, { s: 118 },
      { a: 105.6, r: 57, name: 'Aintree' }, { s: 621, name: 'Wellington Straight' }, { a: -80.1, r: 44, name: 'Brooklands' },
      { s: 89 }, { a: -68.3, r: 108, name: 'Luffield' }, { s: 108 },
      { a: 46.2, r: 166, name: 'Woodcote' }, { s: 314, name: 'National Straight' }, { a: -59.6, r: 202, name: 'Copse' },
      { s: 238 }, { a: 50.2, r: 161 }, { a: -63.3, r: 145 },
      { a: 55.4, r: 127 }, { a: -70.3, r: 117, name: 'Maggotts and Becketts' }, { s: 620, name: 'Hangar Straight' },
      { a: -76.5, r: 140, name: 'Stowe' }, { s: 289 }, { a: 71.1, r: 59, name: 'Vale' },
      { s: 59 }, { a: -96.4, r: 77, name: 'Club' }, { s: 368 },
      { a: -28.6, r: 394 },
    ],
    stands: [200, 1500, 2400, 3600, 5200],
    trees: 'light',
  },

  suzuka: {
    name: 'Suzuka',
    country: 'Japan',
    real: 5807,
    width: 14,
    // The only figure-of-eight on the calendar, and the best sequence of
    // corners in the sport in the first sector.
    start: { x: 0, z: 0, heading: 0 },
    segments: [
      { s: 520 }, { a: -66.6, r: 139, name: 'First Curve' }, { a: -43.1, r: 92, name: 'Turn 2' },
      { s: 124 }, { a: 41.3, r: 182 }, { a: -58.8, r: 168 },
      { a: 45.2, r: 155 }, { a: -66.2, r: 145, name: 'The Esses' }, { s: 91 },
      { a: -92.3, r: 104, name: 'Dunlop Curve' }, { s: 169 }, { a: 55.5, r: 85, name: 'Degner 1' },
      { s: 70 }, { a: 85.4, r: 40, name: 'Degner 2' }, { s: 343 },
      { a: 120.6, r: 35, name: 'Hairpin' }, { s: 365 }, { a: -85.2, r: 336, name: 'Spoon entry' },
      { a: -132, r: 74, name: 'Spoon' }, { s: 766, name: 'Back Straight' }, { a: -45.6, r: 426, name: '130R' },
      { s: 290 }, { a: 39.3, r: 40 }, { s: 40 },
      { a: -113.4, r: 55, name: 'Casio Triangle' }, { s: 412 }, { a: -44.1, r: 338 },
    ],
    stands: [120, 1300, 2800, 4200, 5400],
    trees: 'dense',
  },

  spa: {
    name: 'Spa-Francorchamps',
    country: 'Belgium',
    real: 7004,
    width: 14,
    // The longest lap of the year, and Eau Rouge is still the corner
    // everybody talks about.
    start: { x: 0, z: 0, heading: 0 },
    segments: [
      { s: 288 }, { a: -107.8, r: 27, name: 'La Source' }, { s: 382 },
      { a: 30.1, r: 93 }, { a: -50.2, r: 116 }, { a: 33.4, r: 202, name: 'Eau Rouge / Raidillon' },
      { s: 1842, name: 'Kemmel Straight' }, { a: -74.7, r: 130, name: 'Les Combes' }, { a: -59.1, r: 81, name: 'Malmedy' },
      { s: 234 }, { a: -65.3, r: 144, name: 'Rivage' }, { a: -72.8, r: 44 },
      { s: 185 }, { a: 44, r: 299, name: 'Pouhon entry' }, { a: 115.6, r: 124, name: 'Pouhon' },
      { s: 263 }, { a: -52.5, r: 94 }, { a: 63.2, r: 104, name: 'Fagnes' },
      { s: 311 }, { a: -104, r: 107, name: 'Stavelot' }, { s: 455 },
      { a: 36.9, r: 391, name: 'Blanchimont' }, { s: 527 }, { a: -118, r: 34 },
      { s: 34 }, { a: 72.7, r: 30, name: 'Bus Stop' }, { s: 228 },
      { a: -51.6, r: 256 },
    ],
    stands: [60, 1400, 3200, 5000, 6600],
    trees: 'forest',
  },

  monaco: {
    name: 'Monaco',
    country: 'Monaco',
    real: 3337,
    width: 10,             // barely wider than the cars, which is the point
    // Walls everywhere and no runoff at all. The track generator reads
    // `walls` and puts armco hard against the edge instead of leaving
    // room to make a mistake in.
    walls: true,
    start: { x: 0, z: 0, heading: 0 },
    segments: [
      { s: 269 }, { a: -70.7, r: 31, name: 'Sainte Devote' }, { s: 465, name: 'Beau Rivage' },
      { a: 51.3, r: 120, name: 'Massenet' }, { a: -105, r: 47, name: 'Casino' }, { s: 141 },
      { a: -92.4, r: 26, name: 'Mirabeau' }, { s: 59 }, { a: 115.8, r: 12, name: 'Grand Hotel Hairpin' },
      { s: 93 }, { a: -81.8, r: 32, name: 'Portier' }, { a: -88.6, r: 39 },
      { s: 452, name: 'The Tunnel' }, { a: 33, r: 198 }, { s: 116 },
      { a: -77.5, r: 22 }, { s: 31 }, { a: 99.4, r: 24, name: 'Nouvelle Chicane' },
      { s: 175 }, { a: 81.1, r: 68, name: 'Tabac' }, { s: 90 },
      { a: -58.9, r: 41 }, { a: 62.3, r: 38, name: 'Swimming Pool' }, { s: 80 },
      { a: 56.9, r: 34 }, { a: -66.7, r: 30, name: 'Piscine exit' }, { s: 70 },
      { a: -113.3, r: 20, name: 'La Rascasse' }, { s: 60 }, { a: -87.8, r: 35, name: 'Anthony Noghes' },
      { s: 209 }, { a: -17.1, r: 326 },
    ],
    stands: [100, 700, 1600, 2400, 3100],
    trees: 'none',
    city: true,
  },
};

/**
 * Walk the segment list and produce the centre line.
 *
 * Returns evenly spaced points with their heading and how far round the
 * lap they are, which is what everything else - the asphalt, the kerbs,
 * the barriers, the timing - is built from.
 */
export function centreline(spec, spacing = 4) {
  const raw = [];
  let x = spec.start.x, z = spec.start.z, h = spec.start.heading;
  let dist = 0;
  const corners = [];

  const put = (name) => { if (name) corners.push({ name, at: dist }); };

  for (const seg of spec.segments) {
    if (seg.s !== undefined) {
      const steps = Math.max(1, Math.round(seg.s / spacing));
      const d = seg.s / steps;
      for (let i = 0; i < steps; i++) {
        x += Math.sin(h) * d; z += Math.cos(h) * d; dist += d;
        raw.push({ x, z, h, dist, curve: 0 });
      }
      put(seg.name);
    } else {
      const rad = seg.a * Math.PI / 180;
      const arcLen = Math.abs(rad) * seg.r;
      const steps = Math.max(2, Math.round(arcLen / spacing));
      const dh = rad / steps, d = arcLen / steps;
      for (let i = 0; i < steps; i++) {
        // step along the arc: move, then turn, which keeps the radius honest
        x += Math.sin(h + dh / 2) * d; z += Math.cos(h + dh / 2) * d;
        h += dh; dist += d;
        raw.push({ x, z, h, dist, curve: 1 / seg.r * Math.sign(seg.a) });
      }
      put(seg.name);
    }
  }
  return { points: raw, length: dist, corners };
}
