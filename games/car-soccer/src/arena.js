// Arena geometry. World units, y points UP, floor at y = 0, centre line at x = 0.
// The free space (where cars and ball live) is one closed polygon: flat floor that runs
// into both goals, straight side walls above the goals, rounded ceiling corners.
// A signed-distance grid is baked once at load: sdf > 0 in free space, < 0 inside walls.
export const W = 2400, H = 1100, GH = 310, GD = 230, CR = 360, BALL_R = 80;
// two dips in the floor between the kickoff spots and midfield's flanks: the ball rolls into them,
// cars lose speed climbing out, and you can use the lip as a ramp (centre, spawns and goal mouths stay flat)
export const DIP_X = 420, DIP_HW = 300, DIP_D = 80;
export function floorY(x) {
  const u = (Math.abs(x) - DIP_X) / DIP_HW;
  return Math.abs(u) < 1 ? -DIP_D * 0.5 * (1 + Math.cos(Math.PI * u)) : 0;
}
export const FLOOR = [];
for (let x = -W / 2 - GD; x <= W / 2 + GD + 1; x += 25) FLOOR.push([x, floorY(x)]);

export const POLY = (() => {
  const p = [];
  p.push(...FLOOR.map((q) => [q[0], q[1]]), [W / 2 + GD, GH], [W / 2, GH], [W / 2, H - CR]);
  const seg = 24;
  for (let i = 1; i <= seg; i++) {
    const t = (i / seg) * Math.PI / 2;
    p.push([W / 2 - CR + CR * Math.cos(t), H - CR + CR * Math.sin(t)]);
  }
  p.push([-W / 2 + CR, H]);
  for (let i = 1; i <= seg; i++) {
    const t = Math.PI / 2 + (i / seg) * Math.PI / 2;
    p.push([-W / 2 + CR + CR * Math.cos(t), H - CR + CR * Math.sin(t)]);
  }
  p.push([-W / 2, GH], [-W / 2 - GD, GH]);
  return p;
})();

const RES = 5;
const X0 = -W / 2 - GD - 150, Y0 = -300;
const NX = Math.ceil((W + 2 * GD + 300) / RES) + 1;
const NY = Math.ceil((H + 450) / RES) + 1;
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
  for (let j = 0; j < NY; j++) {
    const y = Y0 + j * RES;
    for (let i = 0; i < NX; i++) {
      const x = X0 + i * RES;
      let best = 1e12;
      for (let k = 0; k < n; k++) {
        const a = POLY[k], b = POLY[(k + 1) % n];
        const d = segDist(x, y, a[0], a[1], b[0], b[1]);
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
