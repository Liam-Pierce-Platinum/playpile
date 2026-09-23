// =====================================================================
// APEX :: circuits.js - THE TRACKS
// =====================================================================
//
// THE SHAPES ARE SURVEYED NOW, NOT DRAWN.
//
// The first version described each circuit as a chain of straights and
// arcs from the published corner sequence, and a solver bent the numbers
// until the lap closed. It closed - and Spa and Monaco each ran THROUGH
// themselves twice, and Suzuka crossed itself twice where the real one
// crosses once, on a bridge. Thirty corners each a couple of degrees out
// cannot be tuned into the right shape, because every corner moves
// everything after it.
//
// So the centre lines come from bacinger/f1-circuits (MIT), baked into
// tracks.js by tools/realtracks.mjs. What is left in this file is what a
// survey does not tell you: how wide the asphalt is, where the start line
// is, what the corners are called, where the grandstands go, and which
// road goes OVER at a crossing.
//
// ---------------------------------------------------------------------
// THE CENTRE LINE
// ---------------------------------------------------------------------
// A survey is a few hundred points, 5 m apart in a hairpin and 200 m apart
// on a straight. Joined with straight lines that is a polygon, and a car
// feels every vertex of it. So it goes through a centripetal Catmull-Rom
// spline (the variant that cannot loop or overshoot at uneven spacing),
// is resampled evenly, and is then SMOOTHED - because a spline through a
// slightly noisy survey still wiggles, and the first pass measured Monza's
// tightest corner as a 10.7 m radius, which is tighter than the Monaco
// hairpin. Curvature is what the kerbs, the robot drivers and the corner
// names are all read from, so it has to be honest.
import { PATHS } from './tracks.js';

// CORNERS AND STANDS ARE IN SURVEY METRES - how far round the survey's own
// lap they are, BEFORE any startShift - because that is what
// tools/corners.mjs prints, and it does not move when a start line does.
// Guessing corners as fractions of the lap put Portier next to the
// Swimming Pool. A corner name snaps to the tightest point within 40 m;
// a straight's name stays exactly where it is put.
export const CIRCUITS = {
  // ---- the calendar, in the order it is raced ----
  albertpark: {
    name: 'Albert Park', country: 'Australia', real: 5278, width: 13,
    path: PATHS.albertpark,
    corners: [['Turn 1', 334], ['Turn 2', 378], ['Turn 3', 1070], ['Turn 6', 1864], ['Lakeside', 2300, 'straight'],
              ['Turn 9', 3306], ['Turn 10', 3412], ['Turn 14', 4764]],
    stands: [5200, 334, 1070, 3306, 4764],
    trees: 'light',
  },
  shanghai: {
    name: 'Shanghai', country: 'China', real: 5451, width: 15,
    path: PATHS.shanghai,
    corners: [['Turn 1', 412], ['Turn 3', 478], ['Turn 6', 1194], ['Turn 11', 2753], ['Turn 13', 2839],
              ['Back Straight', 3700, 'straight'], ['Turn 14', 4411], ['Turn 16', 4777]],
    stands: [5380, 412, 1194, 4411, 4777],
    trees: 'light',
  },
  suzuka: {
    name: 'Suzuka', country: 'Japan', real: 5807, width: 14,
    path: PATHS.suzuka,
    corners: [['First Curve', 574], ['The Esses', 1126], ['Dunlop Curve', 1556], ['Degner 1', 2064], ['Degner 2', 2228],
              ['Hairpin', 2678], ['Spoon', 3577], ['Back Straight', 4200, 'straight'], ['130R', 4741],
              ['Casio Triangle', 5190], ['Last Curve', 5431]],
    stands: [5740, 574, 2678, 3577, 5190],
    trees: 'dense',
    // THE FIGURE OF EIGHT. The back straight on its way to 130R goes over
    // the stretch between Degner and the hairpin.
    over: 'later',
  },
  bahrain: {
    name: 'Bahrain', country: 'Bahrain', real: 5412, width: 15,
    path: PATHS.bahrain,
    corners: [['Turn 1', 570], ['Turn 4', 1364], ['Turn 8', 2114], ['Turn 10', 2580], ['Turn 11', 3302],
              ['Turn 13', 3972], ['Turn 14', 4770]],
    stands: [5340, 570, 1364, 2580, 4770],
    trees: 'none',
  },
  jeddah: {
    name: 'Jeddah', country: 'Saudi Arabia', real: 6174, width: 11.5,
    path: PATHS.jeddah,
    // a street circuit along the Corniche: walls both sides, no runoff
    walls: true,
    corners: [['Turn 1', 444], ['Turn 2', 500], ['Turn 4', 958], ['Turn 13', 2440], ['Corniche', 5900, 'straight'],
              ['Turn 27', 5502]],
    stands: [6100, 444, 2440, 5502],
    trees: 'none',
    city: true,
  },
  miami: {
    name: 'Miami', country: 'United States', real: 5412, width: 14,
    path: PATHS.miami,
    corners: [['Turn 1', 250], ['Turn 11', 2998], ['Turn 14', 3356], ['Back Straight', 4100, 'straight'], ['Turn 17', 4764],
              ['Turn 19', 5182]],
    stands: [5340, 250, 2998, 4764],
    trees: 'light',
  },
  montreal: {
    name: 'Circuit Gilles Villeneuve', country: 'Canada', real: 4361, width: 12,
    path: PATHS.montreal,
    corners: [['Virage Senna', 454], ['Turn 3', 928], ['Turn 6', 1446], ['Turn 8', 2209], ["L'Epingle", 2891],
              ['Casino Straight', 3700, 'straight'], ['Wall of Champions', 4135]],
    stands: [4290, 454, 2891, 4107],
    trees: 'dense',
  },
  monaco: {
    name: 'Monaco', country: 'Monaco', real: 3337, width: 10,
    path: PATHS.monaco,
    // the survey starts at Casino Square; the grid is on the straight
    // before Sainte Devote
    startShift: 2419,
    // Walls everywhere and no runoff at all. The track generator reads
    // `walls` and puts the barrier hard against the kerb.
    walls: true,
    corners: [['Sainte Devote', 2649], ['Beau Rivage', 2950, 'straight'], ['Massenet', 3277], ['Casino', 8],
              ['Mirabeau', 234], ['Grand Hotel Hairpin', 370], ['Portier', 542], ['The Tunnel', 830, 'straight'],
              ['Nouvelle Chicane', 1226], ['Tabac', 1486], ['Swimming Pool', 1660], ['La Rascasse', 2033],
              ['Anthony Noghes', 2149]],
    stands: [2540, 2649, 370, 1486, 2033],
    trees: 'none',
    city: true,
  },
  barcelona: {
    name: 'Barcelona-Catalunya', country: 'Spain', real: 4657, width: 14,
    path: PATHS.barcelona,
    corners: [['Elf', 712], ['Renault', 980], ['Repsol', 1604], ['Seat', 2036], ['Campsa', 2783],
              ['La Caixa', 3369], ['Banc Sabadell', 3739], ['Turn 14', 4275]],
    stands: [4580, 712, 1604, 3369, 4275],
    trees: 'light',
  },
  redbullring: {
    name: 'Red Bull Ring', country: 'Austria', real: 4318, width: 14,
    path: PATHS.redbullring,
    corners: [['Niki Lauda', 328], ['Remus', 1270], ['Schlossgold', 2074], ['Rauch', 2606], ['Wurth', 2894],
              ['Rindt', 3632], ['Red Bull Mobile', 3868]],
    stands: [4250, 328, 1270, 2074, 3868],
    trees: 'light',
  },
  silverstone: {
    name: 'Silverstone', country: 'Great Britain', real: 5891, width: 14,
    path: PATHS.silverstone,
    // the survey starts on the old National straight; the line has been on
    // the Hamilton Straight, between Club and Abbey, since 2011
    startShift: 3180,
    corners: [['Copse', 258], ['Maggotts', 780], ['Becketts', 1010], ['Chapel', 1360], ['Hangar Straight', 1800, 'straight'],
              ['Stowe', 2214], ['Vale', 2692], ['Club', 2942], ['Abbey', 3471], ['Farm', 3709], ['Village', 3951],
              ['The Loop', 4095], ['Aintree', 4301], ['Wellington Straight', 4700, 'straight'], ['Brooklands', 5063],
              ['Luffield', 5305], ['Woodcote', 5560]],
    stands: [3120, 3471, 3951, 5305, 1010],
    trees: 'light',
  },
  spa: {
    name: 'Spa-Francorchamps', country: 'Belgium', real: 7004, width: 14,
    path: PATHS.spa,
    corners: [['La Source', 244], ['Eau Rouge', 994], ['Raidillon', 1134], ['Kemmel Straight', 1700, 'straight'],
              ['Les Combes', 2310], ['Malmedy', 2516], ['Rivage', 2954], ['Pouhon', 3800], ['Fagnes', 4450],
              ['Stavelot', 4900], ['Blanchimont', 6076], ['Bus Stop', 6640]],
    stands: [6930, 244, 994, 2954, 6640],
    trees: 'forest',
  },
  hungaroring: {
    name: 'Hungaroring', country: 'Hungary', real: 4381, width: 13,
    path: PATHS.hungaroring,
    corners: [['Turn 1', 364], ['Turn 2', 836], ['Turn 4', 1542], ['Turn 5', 1770], ['Turn 6', 2116],
              ['Turn 11', 2867], ['Turn 12', 3263], ['Turn 13', 3513], ['Turn 14', 3745]],
    stands: [4310, 364, 836, 2116, 3745],
    trees: 'light',
  },
  zandvoort: {
    name: 'Zandvoort', country: 'Netherlands', real: 4259, width: 12,
    path: PATHS.zandvoort,
    corners: [['Tarzan', 442], ['Hugenholtz', 884], ['Hunserug', 1330, 'straight'], ['Scheivlak', 1776],
              ['Turn 11', 3171], ['Arie Luyendyk', 3817]],
    stands: [4190, 442, 884, 3817],
    trees: 'light',
  },
  monza: {
    name: 'Monza', country: 'Italy', real: 5793, width: 15,
    path: PATHS.monza,
    corners: [['Variante del Rettifilo', 640], ['Curva Grande', 1094], ['Variante della Roggia', 1855],
              ['Lesmo 1', 2288], ['Lesmo 2', 2574], ['Serraglio', 3100, 'straight'], ['Variante Ascari', 3719],
              ['Rettifilo Centro', 4300, 'straight'], ['Parabolica', 4835]],
    stands: [5690, 640, 2288, 3719, 4835],
    trees: 'dense',
  },
  madring: {
    name: 'Madring', country: 'Spain', real: 5474, width: 13,
    path: PATHS.madring,
    corners: [['Turn 1', 204], ['La Monumental', 2406]],
    stands: [5400, 204, 1304, 2406],
    trees: 'light',
  },
  baku: {
    name: 'Baku', country: 'Azerbaijan', real: 6003, width: 11,
    path: PATHS.baku,
    walls: true,
    corners: [['Turn 1', 182], ['Turn 2', 524], ['Turn 3', 1398], ['Turn 4', 1622], ['Castle', 2612],
              ['Turn 16', 3983], ['Neftchilar Avenue', 5000, 'straight']],
    stands: [5930, 182, 1398, 2612, 3983],
    trees: 'none',
    city: true,
  },
  singapore: {
    name: 'Marina Bay', country: 'Singapore', real: 4940, width: 11,
    path: PATHS.singapore,
    walls: true,
    corners: [['Sheares', 300], ['Turn 3', 448], ['Republic Boulevard', 1100, 'straight'], ['Memorial', 1674],
              ['Turn 10', 2514]],
    stands: [4870, 300, 448, 1674, 2514],
    trees: 'none',
    city: true,
  },
  cota: {
    name: 'Circuit of the Americas', country: 'United States', real: 5513, width: 15,
    path: PATHS.cota,
    corners: [['Turn 1', 336], ['The Esses', 952], ['Turn 11', 2266], ['Back Straight', 2900, 'straight'], ['Turn 12', 3467],
              ['Turn 15', 3981], ['Turn 17', 4291], ['Turn 19', 4731], ['Turn 20', 5041]],
    stands: [5440, 336, 3467, 3981],
    trees: 'light',
  },
  mexico: {
    name: 'Hermanos Rodriguez', country: 'Mexico', real: 4304, width: 14,
    path: PATHS.mexico,
    corners: [['Turn 1', 1156], ['Turn 4', 2000], ['Turn 6', 2234], ['The Esses', 2668], ['Foro Sol', 3788],
              ['Peraltada', 3968]],
    stands: [4230, 1156, 2070, 3788, 3846],
    trees: 'light',
  },
  interlagos: {
    name: 'Interlagos', country: 'Brazil', real: 4309, width: 13,
    path: PATHS.interlagos,
    corners: [['S do Senna', 316], ['Curva do Sol', 548], ['Reta Oposta', 1000, 'straight'], ['Descida do Lago', 1392],
              ['Ferradura', 1990], ['Laranjinha', 2305], ['Pinheirinho', 2419], ['Bico de Pato', 2731],
              ['Mergulho', 2891], ['Juncao', 3223], ['Subida dos Boxes', 4000, 'straight']],
    stands: [4240, 316, 1392, 2731, 3223],
    trees: 'light',
  },
  lasvegas: {
    name: 'Las Vegas', country: 'United States', real: 6201, width: 12,
    path: PATHS.lasvegas,
    walls: true,
    corners: [['Turn 1', 134], ['Turn 5', 1422], ['The Strip', 4000, 'straight'], ['Turn 14', 5029]],
    stands: [6130, 134, 1422, 5029],
    trees: 'none',
    city: true,
  },
  losail: {
    name: 'Lusail', country: 'Qatar', real: 5419, width: 15,
    path: PATHS.losail,
    corners: [['Turn 1', 508], ['Turn 6', 1936], ['Turn 10', 2891], ['Turn 16', 4697]],
    stands: [5350, 508, 1936, 4697],
    trees: 'none',
  },
  yasmarina: {
    name: 'Yas Marina', country: 'Abu Dhabi', real: 5281, width: 15,
    path: PATHS.yasmarina,
    corners: [['Turn 1', 256], ['Turn 5', 1342], ['Back Straight', 1900, 'straight'], ['Turn 6', 2528], ['Turn 9', 3517],
              ['Turn 16', 4993]],
    stands: [5210, 256, 1342, 2528, 4993],
    trees: 'none',
  },
  // ---- recent circuits, no longer on the calendar ----
  imola: {
    name: 'Imola', country: 'Italy', real: 4909, width: 12,
    path: PATHS.imola,
    corners: [['Tamburello', 700], ['Villeneuve', 1370], ['Tosa', 1734], ['Piratella', 2310], ['Acque Minerali', 2800],
              ['Variante Alta', 3374], ['Rivazza', 4137]],
    stands: [4840, 700, 1734, 3374, 4137],
    trees: 'dense',
  },
  portimao: {
    name: 'Portimao', country: 'Portugal', real: 4653, width: 14,
    path: PATHS.portimao,
    corners: [['Turn 1', 404], ['Turn 3', 738], ['Turn 5', 1452], ['Turn 10', 2763], ['Turn 15', 3923]],
    stands: [4580, 404, 1452, 3923],
    trees: 'light',
  },
  istanbul: {
    name: 'Istanbul Park', country: 'Turkey', real: 5338, width: 15,
    path: PATHS.istanbul,
    corners: [['Turn 1', 264], ['Turn 8', 2406], ['Turn 9', 3292], ['Turn 12', 4652], ['Turn 14', 4892]],
    stands: [5270, 264, 2406, 4652],
    trees: 'light',
  },
  nurburgring: {
    name: 'Nurburgring', country: 'Germany', real: 5148, width: 14,
    path: PATHS.nurburgring,
    corners: [['Castrol-S', 642], ['Mercedes Arena', 1104], ['Dunlop-Kehre', 2430], ['Schumacher-S', 2826],
              ['Veedol-Schikane', 4526], ['Coca-Cola Kurve', 4824]],
    stands: [5080, 642, 1104, 4526],
    trees: 'dense',
  },
  mugello: {
    name: 'Mugello', country: 'Italy', real: 5245, width: 14,
    path: PATHS.mugello,
    corners: [['San Donato', 708], ['Luco', 964], ['Poggio Secco', 1080], ['Materassi', 1506], ['Borgo San Lorenzo', 1602],
              ['Casanova', 1974], ['Savelli', 2142], ['Arrabbiata 1', 2428], ['Arrabbiata 2', 2699], ['Scarperia', 3043],
              ['Palagio', 3165], ['Correntaio', 3681], ['Biondetti', 3891], ['Bucine', 4551]],
    stands: [5170, 708, 1974, 4551],
    trees: 'dense',
  },
  sochi: {
    name: 'Sochi', country: 'Russia', real: 5848, width: 14,
    path: PATHS.sochi,
    corners: [['Turn 2', 980], ['Turn 3', 1552], ['Turn 18', 5528]],
    stands: [5780, 980, 1552, 5528],
    trees: 'light',
  },
  paulricard: {
    name: 'Paul Ricard', country: 'France', real: 5842, width: 15,
    path: PATHS.paulricard,
    corners: [['Mistral Straight', 2200, 'straight'], ['Mistral Chicane', 2900], ['Signes', 3808],
              ['Beausset', 4376], ['Bendor', 4712]],
    stands: [5770, 518, 3808, 4376],
    trees: 'light',
  },
  hockenheim: {
    name: 'Hockenheim', country: 'Germany', real: 4574, width: 14,
    path: PATHS.hockenheim,
    corners: [['Nordkurve', 264], ['Turn 2', 842], ['Parabolika', 1500, 'straight'], ['Spitzkehre', 2104],
              ['Sachs', 2826], ['Sudkurve', 4298]],
    stands: [4500, 264, 2104, 2826, 4298],
    trees: 'forest',
  },
  sepang: {
    name: 'Sepang', country: 'Malaysia', real: 5543, width: 15,
    path: PATHS.sepang,
    corners: [['Turn 1', 384], ['Turn 4', 1302], ['Turn 9', 2885], ['Back Straight', 4400, 'straight'], ['Turn 14', 3935],
              ['Turn 15', 4865]],
    stands: [5470, 384, 1302, 2885, 4865],
    trees: 'dense',
  },
};

// ---------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------
const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** a closed centripetal Catmull-Rom through the survey points, sampled densely */
function spline(P) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const t01 = Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])) || 1e-3;
    const t12 = Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) || 1e-3;
    const t23 = Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1])) || 1e-3;
    const m1 = [0, 1].map((k) => p2[k] - p1[k] + t12 * ((p1[k] - p0[k]) / t01 - (p2[k] - p0[k]) / (t01 + t12)));
    const m2 = [0, 1].map((k) => p2[k] - p1[k] + t12 * ((p3[k] - p2[k]) / t23 - (p3[k] - p1[k]) / (t12 + t23)));
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, d = t3 - t2;
      out.push([a * p1[0] + b * m1[0] + c * p2[0] + d * m2[0], a * p1[1] + b * m1[1] + c * p2[1] + d * m2[1]]);
    }
  }
  return out;
}

/** evenly spaced samples round a closed polyline */
function resample(line, spacing) {
  const cum = [0];
  for (let i = 1; i <= line.length; i++) {
    const a = line[i - 1], b = line[i % line.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[cum.length - 1], N = Math.round(L / spacing), out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = k * L / N;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = line[j], b = line[(j + 1) % line.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** a closed moving average, `passes` times - three box passes is nearly a gaussian */
function smoothClosed(arr, half, passes, get = (v) => v, set = (v) => v) {
  let cur = arr.map(get);
  const n = cur.length, dim = Array.isArray(cur[0]) ? cur[0].length : 0;
  for (let p = 0; p < passes; p++) {
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      if (dim) {
        const s = new Array(dim).fill(0);
        for (let k = -half; k <= half; k++) { const v = cur[(i + k + n) % n]; for (let d = 0; d < dim; d++) s[d] += v[d]; }
        next[i] = s.map((v) => v / (half * 2 + 1));
      } else {
        let s = 0;
        for (let k = -half; k <= half; k++) s += cur[(i + k + n) % n];
        next[i] = s / (half * 2 + 1);
      }
    }
    cur = next;
  }
  return cur.map(set);
}

function segCross(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den;
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? t : null;
}

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// A bridge: how high the upper road goes, how long it stays up either side
// of the crossing, and how long the ramps are. 7.5 m clears a lorry, and
// a 180 m ramp is a 4% grade - the car barely notices it, the eye does.
const BRIDGE = { height: 7.5, plateau: 55, ramp: 180 };

/**
 * Build the centre line: evenly spaced points round the lap, each with
 * where it is (x, y, z), which way it faces (h), how far round the lap it
 * is (dist), how sharply it is turning (curve, 1/radius, + is left) and
 * how steep it is (grade).
 */
export function centreline(spec, spacing = 2) {
  // 1 m samples to smooth on, then scaled to the published length
  let line = resample(spline(spec.path), 1);
  line = smoothClosed(line, 4, 3);
  let L = 0;
  for (let i = 0; i < line.length; i++) {
    const a = line[i], b = line[(i + 1) % line.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const k = spec.real / L;
  line = line.map(([x, z]) => [x * k, z * k]);
  // the start line, where a survey does not begin at it
  const shift = Math.round((spec.startShift || 0) / (spec.real / line.length));
  if (shift) line = line.slice(shift).concat(line.slice(0, shift));

  const raw = resample(line, spacing);
  const n = raw.length;
  const ds = spec.real / n;

  const points = raw.map(([x, z], i) => ({ x, z, y: 0, h: 0, dist: i * ds, curve: 0, grade: 0 }));
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
    points[i].h = Math.atan2(b.x - a.x, b.z - a.z);
  }
  // curvature from the heading change over ±6 m, then smoothed again: the
  // raw number flickers sample to sample, and kerbs laid from a flickering
  // number come out as a dotted line
  const span = Math.max(1, Math.round(6 / ds));
  const curv = points.map((p, i) => wrapAngle(points[(i + span) % n].h - points[(i - span + n) % n].h) / (2 * span * ds));
  smoothClosed(curv, span, 2).forEach((c, i) => { points[i].curve = c; });

  // ---- corner names, snapped to the tightest point near where they are said to be
  const lapOf = (m) => (((m - (spec.startShift || 0)) % spec.real) + spec.real) % spec.real;
  const corners = [];
  for (const [name, metres, kind] of spec.corners || []) {
    let at = lapOf(metres);
    if (kind !== 'straight') {
      let best = -1, bestC = 0;
      const c0 = Math.round(at / ds), w = Math.round(40 / ds);
      for (let j = c0 - w; j <= c0 + w; j++) {
        const c = Math.abs(points[((j % n) + n) % n].curve);
        if (c > bestC) { bestC = c; best = ((j % n) + n) % n; }
      }
      if (best >= 0) at = points[best].dist;
    }
    corners.push({ name, at });
  }
  corners.sort((a, b) => a.at - b.at);

  // ---- crossings, and the bridges over them ----------------------------
  const crossings = [];
  const gap = (i, j) => { const d = Math.abs(i - j) * ds; return Math.min(d, spec.real - d); };
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (gap(i, j) < 60) continue;
      const t = segCross(a, b, points[j], points[(j + 1) % n]);
      if (t === null) continue;
      const angle = Math.abs(wrapAngle(a.h - points[j].h));
      // which road goes over: the later one unless the circuit says otherwise
      const upper = spec.over === 'earlier' ? i : j, lower = upper === i ? j : i;
      crossings.push({ upper, lower, upperDist: points[upper].dist, lowerDist: points[lower].dist,
        x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle });
    }
  }
  for (const c of crossings) {
    for (let i = 0; i < n; i++) {
      let d = Math.abs(points[i].dist - c.upperDist);
      d = Math.min(d, spec.real - d);
      const y = BRIDGE.height * (1 - smooth01((d - BRIDGE.plateau) / BRIDGE.ramp));
      points[i].y = Math.max(points[i].y, y);
    }
  }
  for (let i = 0; i < n; i++) {
    points[i].grade = (points[(i + 1) % n].y - points[(i - 1 + n) % n].y) / (2 * ds);
  }

  const stands = (spec.stands || []).map(lapOf);
  return { points, length: spec.real, corners, crossings, stands, spacing: ds, bridge: BRIDGE };
}
