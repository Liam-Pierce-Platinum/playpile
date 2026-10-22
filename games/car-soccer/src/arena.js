// Arena geometry. World units, y points UP, centre line at x = 0.
// The SKATE BOWL: the goals are raised mouths set half-way up the side walls. In front of each goal
// is a ledge (where that team kicks off); from the ledge a smooth curved ramp sweeps DOWN into a
// lower central basin (floor y = 0), like a half-pipe. Above the goals: straight side walls and
// rounded ceiling corners.
// The floor (basin + ramps + ledges) is one smooth function floorY(x); the free space is one closed
// polygon sampled finely from it. A signed-distance grid is baked once at load:
// sdf > 0 in free space, < 0 inside walls.
export const W = 2800, H = 1300, GH = 420, GD = 230, CR = 380, BALL_R = 80;
export const BASIN = 330;          // half-width of the flat basin floor
export const RAMP_END = 1030;      // ramps run from |x| = BASIN to |x| = RAMP_END
export const LEDGE_Y = 380;        // height of the top of the ramp
export const GY = 400;             // goal mouth floor (the ledge tilts up 20 toward the goal, so a dead ball rolls back out)
export const GT = GY + GH;         // goal crossbar height
const RAMP_K = 1.0;               // ramp profile exponent (1 = symmetric cosine bowl: lip and bowl curve equally, so drive speed sticks and boost launches)

// floor height under x (only meaningful for |x| <= W/2 + GD)
export function floorY(x) {
  const a = Math.abs(x);
  if (a <= BASIN) return 0;
  if (a < RAMP_END) {
    const u = Math.pow((a - BASIN) / (RAMP_END - BASIN), RAMP_K);
    return LEDGE_Y * 0.5 * (1 - Math.cos(Math.PI * u));
  }
  if (a < W / 2) { const v = (a - RAMP_END) / (W / 2 - RAMP_END); return LEDGE_Y + (GY - LEDGE_Y) * v * v * (3 - 2 * v); }
  return GY;
}
// slope dy/dx and signed curvature (> 0 concave / bowl, < 0 convex / lip) of the floor at x
export function floorSlope(x) { const e = 2; return (floorY(x + e) - floorY(x - e)) / (2 * e); }
export function floorCurv(x) {
  const e = 4, y0 = floorY(x - e), y1 = floorY(x), y2 = floorY(x + e);
  const d1 = (y2 - y0) / (2 * e), d2 = (y2 - 2 * y1 + y0) / (e * e);
  return d2 / Math.pow(1 + d1 * d1, 1.5);
}
// height of a point above the floor directly under it
export function above(x, y) { return y - floorY(Math.max(-W / 2 - GD, Math.min(W / 2 + GD, x))); }

export const FLOOR = [];
for (let x = -W / 2 - GD; x <= W / 2 + GD + 0.5; x += 10) FLOOR.push([x, floorY(x)]);

export const POLY = (() => {
  const p = [];
  p.push(...FLOOR.map((q) => [q[0], q[1]]), [W / 2 + GD, GT], [W / 2, GT], [W / 2, H - CR]);
  const seg = 32;
  for (let i = 1; i <= seg; i++) {
    const t = (i / seg) * Math.PI / 2;
    p.push([W / 2 - CR + CR * Math.cos(t), H - CR + CR * Math.sin(t)]);
  }
  p.push([-W / 2 + CR, H]);
  for (let i = 1; i <= seg; i++) {
    const t = Math.PI / 2 + (i / seg) * Math.PI / 2;
    p.push([-W / 2 + CR + CR * Math.cos(t), H - CR + CR * Math.sin(t)]);
  }
  p.push([-W / 2, GT], [-W / 2 - GD, GT]);
  return p;
})();

const RES = 5;
const X0 = -W / 2 - GD - 150, Y0 = -250;
const NX = Math.ceil((W + 2 * GD + 300) / RES) + 1;
const NY = Math.ceil((H + 400) / RES) + 1;
const grid = new Float32Array(NX * NY);

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}
function inside(px, py) {
  let c = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, yi] = POLY[i], [xj, yj] = POLY[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
(function bake() {
  const n = POLY.length;
  const ax = new Float64Array(n), ay = new Float64Array(n), bx = new Float64Array(n), by = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = POLY[k], b = POLY[(k + 1) % n]; ax[k] = a[0]; ay[k] = a[1]; bx[k] = b[0]; by[k] = b[1]; }
  for (let j = 0; j < NY; j++) {
    const y = Y0 + j * RES;
    for (let i = 0; i < NX; i++) {
      const x = X0 + i * RES;
      let best = 1e12;
      for (let k = 0; k < n; k++) {
        // cheap reject: a segment whose bounding box is further than the best distance so far
        const mx = x < Math.min(ax[k], bx[k]) ? Math.min(ax[k], bx[k]) - x : x > Math.max(ax[k], bx[k]) ? x - Math.max(ax[k], bx[k]) : 0;
        if (mx * mx >= best) continue;
        const my = y < Math.min(ay[k], by[k]) ? Math.min(ay[k], by[k]) - y : y > Math.max(ay[k], by[k]) ? y - Math.max(ay[k], by[k]) : 0;
        if (mx * mx + my * my >= best) continue;
        const d = segDist(x, y, ax[k], ay[k], bx[k], by[k]);
        if (d < best) best = d;
      }
      const d = Math.sqrt(best);
      grid[j * NX + i] = inside(x, y) ? d : -d;
    }
  }
})();

export function sdf(x, y) {
  let fx = (x - X0) / RES, fy = (y - Y0) / RES;
  if (fx < 0 || fy < 0 || fx >= NX - 1 || fy >= NY - 1) return -200;
  const i = fx | 0, j = fy | 0;
  fx -= i; fy -= j;
  const k = j * NX + i;
  const a = grid[k], b = grid[k + 1], c = grid[k + NX], d = grid[k + NX + 1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// unit normal pointing into free space, written into out {x,y}
export function grad(x, y, out) {
  const e = 3;
  const gx = sdf(x + e, y) - sdf(x - e, y);
  const gy = sdf(x, y + e) - sdf(x, y - e);
  const l = Math.hypot(gx, gy) || 1;
  out.x = gx / l; out.y = gy / l;
  return out;
}

export function inGoal(x) { return x > W / 2 ? 1 : x < -W / 2 ? 0 : -1; }
// the point the attacking team aims at: centre of the goal mouth on side s (+1 right, -1 left)
export function goalCentre(s) { return { x: s * (W / 2 + 40), y: GY + GH * 0.5 }; }
