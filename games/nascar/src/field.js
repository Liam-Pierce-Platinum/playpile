// =====================================================================
// NASCAR :: field.js - WHO IS IN THE RACE
// =====================================================================
//
// Forty invented cars with numbers, drivers, sponsors and paint schemes,
// in a fixed order, because a league is only worth running if it is the
// same forty people every week. Nothing here is a real team or a real
// driver: a livery is a sponsor word and three colours, and body.js
// paints it onto a canvas at start-up.
//
// Three numbers decide how each one races, and they are the only
// difference between them - everybody uses the same stock.js, the same
// world.js and the same air:
//
//   pace    0.90 to 1.00, how close to the limit the speed plan is drawn
//   groove  0 is the bottom of the racetrack, 1 is up against the wall.
//           A field where everybody wants the same piece of road is a
//           single-file parade, and this is what stops that.
//   nerve   how close they will run to somebody, how long they will sit
//           behind a slower car, and how hard they will push a bumper
const RAW = [
  //  no  sponsor          body      accent    trim      driver         pace groove nerve
  [   4, 'CARBIDE',      0x1b3fa0, 0xf5a623, 0xf2f4f7, 'D. HOLLAND',   0.995, 0.25, 0.85],
  [  11, 'NORTHWIND',    0x0e7a54, 0xe8e2d4, 0x101418, 'R. MCKENNA',   0.993, 0.70, 0.72],
  [  22, 'DIRE WOLF',    0x23262c, 0xd93a2b, 0xb7bcc4, 'T. VANCE',     0.997, 0.15, 0.94],
  [   9, 'SUNSPAR',      0xe8a015, 0x1b1d22, 0xffffff, 'K. BOYLE',     0.990, 0.55, 0.66],
  [  19, 'ATLAS FUEL',   0xb32133, 0x1c2230, 0xf0f2f5, 'J. ORTIZ',     0.994, 0.35, 0.80],
  [   2, 'LUMEN',        0x5b2d90, 0x22d3c5, 0xffffff, 'S. PARRISH',   0.991, 0.80, 0.58],
  [  48, 'REDLINE OIL',  0xd2411e, 0x14171c, 0xf7d64a, 'A. KEEL',      0.996, 0.20, 0.88],
  [   5, 'GRANITE',      0x6e757f, 0x1f2937, 0xe3e6ea, 'M. DUFRESNE',  0.988, 0.45, 0.52],
  [  17, 'COPPERHEAD',   0x8a4b1c, 0x0f1114, 0xe0a24a, 'W. SAYLES',    0.992, 0.62, 0.74],
  [  20, 'BLUE RIDGE',   0x2f6fb5, 0xf7fafc, 0x16324f, 'C. TANAKA',    0.994, 0.30, 0.69],
  [  12, 'IRONHEAD',     0x33383f, 0xf0c419, 0xd7dbe0, 'B. RAMOS',     0.989, 0.75, 0.61],
  [  43, 'SILVERLINE',   0xc9ced6, 0x1f4fa0, 0x11151a, 'E. FOWLER',    0.987, 0.40, 0.55],
  [   6, 'HEARTLAND',    0x146b4a, 0xf3efe3, 0x0d2a1e, 'N. ARCHER',    0.991, 0.58, 0.63],
  [  14, 'PITSTOP CO',   0xe03a3a, 0xffffff, 0x15181d, 'L. CASTILE',   0.993, 0.22, 0.83],
  [  24, 'HALOGEN',      0x1d2b53, 0x3fc4ff, 0xf2f6fa, 'P. QUILL',     0.995, 0.48, 0.77],
  [   1, 'MERIDIAN',     0x7a1530, 0xe4b95b, 0xf5f0e8, 'G. STRAND',    0.990, 0.66, 0.60],
  [  31, 'DRY CREEK',    0x9a6b2f, 0x161a1f, 0xefe6d2, 'H. MOSS',      0.986, 0.85, 0.48],
  [   8, 'VOLTA',        0x0f1b2a, 0x4be0a1, 0xdfe6ee, 'F. DELACROIX', 0.992, 0.33, 0.71],
  [  38, 'BOXCAR',       0x4a3b2a, 0xe27d2a, 0xf0e8dc, 'I. WHITLOW',   0.985, 0.52, 0.50],
  [  77, 'TALLGRASS',    0x2e6f2e, 0xf5d547, 0x11200f, 'O. BRENNAN',   0.989, 0.72, 0.57],
  [  16, 'QUARRY',       0x565b63, 0xc2452d, 0xe9ecef, 'V. LINDQVIST', 0.991, 0.28, 0.76],
  [  99, 'AURORA',       0x2b1f55, 0xff7ad9, 0xe8ebf2, 'Z. OKAFOR',    0.994, 0.60, 0.81],
  [  33, 'KINGFISHER',   0x14586e, 0xef8b2c, 0xeef4f6, 'Y. MARCHAND',  0.988, 0.42, 0.64],
  [  27, 'BRIMSTONE',    0x611515, 0xf0a020, 0xe6d9c8, 'Q. HALVERSON', 0.990, 0.18, 0.86],
  [  54, 'OVERLAND',     0x3d4f2c, 0xd9c48a, 0x12160e, 'D. ABIODUN',   0.987, 0.78, 0.53],
  [   3, 'STONEBRIDGE',  0x101a2c, 0xbfc7d2, 0x5a6b82, 'R. ELLIS',     0.993, 0.36, 0.73],
  [  71, 'CASCADE',      0x0f6f8a, 0xffffff, 0x0a2d38, 'T. NAKAMURA',  0.986, 0.68, 0.51],
  [  45, 'GRIT',         0x2a2a2a, 0xe5e5e5, 0xb0332a, 'J. FONSECA',   0.992, 0.24, 0.90],
  [  10, 'FAIRWEATHER',  0x2f8fd0, 0xfff3c4, 0x12384f, 'A. SVOBODA',   0.989, 0.50, 0.59],
  [  88, 'NORTH STAR',   0x1a1f3a, 0xf5d020, 0xdfe4f0, 'M. CALLOWAY',  0.995, 0.44, 0.79],
  [  60, 'PINE HOLLOW',  0x1e4d2b, 0xd4a017, 0xeaf0e6, 'S. YEUNG',     0.988, 0.82, 0.54],
  [  41, 'RAMPART',      0x5c2020, 0xd9d2c4, 0x1a1210, 'K. ANDRADE',   0.990, 0.38, 0.67],
  [  51, 'WILDCAT',      0xb8860b, 0x1c1c1c, 0xf4efe3, 'C. MBEKI',     0.987, 0.56, 0.62],
  [  15, 'SALTFLAT',     0xdde3e8, 0x1f6fb2, 0x2a2f36, 'B. THORNE',    0.986, 0.74, 0.49],
  [  34, 'LONGLEAF',     0x25502f, 0xe8b23a, 0xf1ece0, 'P. GRANGER',   0.989, 0.32, 0.68],
  [  42, 'HALYARD',      0x123a63, 0xff9e2c, 0xe7eef5, 'N. RIVIERE',   0.991, 0.64, 0.70],
  [  23, 'BLACK ROCK',   0x18181c, 0x9b59b6, 0xd8d8de, 'E. KOWALSKI',  0.993, 0.26, 0.87],
  [   7, 'TIDEWATER',    0x0d5a70, 0xf0f4f7, 0x083744, 'L. OYELARAN',  0.988, 0.46, 0.56],
  [  47, 'FOUNDRY',      0x3a3f45, 0xe06020, 0xe8eaec, 'W. HASTINGS',  0.990, 0.70, 0.65],
  [  66, 'HIGH PLAINS',  0x8c5a2b, 0x2e3a2c, 0xf2e9d8, 'G. AMARI',     0.985, 0.88, 0.47],
];

// The three manufacturers, in the order the teams are aligned to them.
// Liam: "car models are the same". They are not any more - body.js builds
// a different shell for each of these, and from a chase camera the
// rooflines and tails are visibly different objects.
const MAKES = ['falcon', 'sabre', 'lancer'];

/**
 * The entry list. The player takes one of them - by default the first -
 * and drives exactly the same CAR as the other thirty-nine: same physics,
 * same engine, same tyres. What differs is only what it looks like.
 *
 * Make, livery pattern, wheel colour and how filthy it is are all derived
 * from the entry index, deterministically, so the number 22 car is the
 * same black Sabre with the silver wheels every single week. A field that
 * reshuffles its own appearance between sessions is not a field, it is a
 * screensaver.
 */
export function field(playerAt = 0) {
  return RAW.map(([number, sponsor, body, accent, trim, driver, pace, groove, nerve], i) => {
    const make = MAKES[i % MAKES.length];
    // the pattern walks a different cycle length from the make, so no two
    // cars nearby share both
    const pattern = (i * 3 + Math.floor(i / 3)) % 8;
    const wheel = [0xb4bac2, 0x2a2d33, 0xd8c47a, 0x8f969e, 0xe6e9ee][i % 5];
    // a fixed dirt level per car: a few are out of the hauler clean, most
    // have a race on them already
    const dirt = ((i * 37) % 11) / 11 * 0.55;
    return {
      i, number, sponsor, driver, pace, groove, nerve, make,
      livery: { body, accent, trim, number, name: sponsor, make, pattern, wheel, dirt },
      player: i === playerAt,
    };
  });
}

export const FIELD_SIZE = RAW.length;
