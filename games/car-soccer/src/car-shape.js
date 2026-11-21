// Side-view body outlines. Two entries are a line endpoint; four describe a quadratic curve.
const bodies = {
  octo: [
    [-66, -14],
    [-68, 8],
    [-66, 17, -55, 17],
    [-34, 18],
    [-22, 35],
    [-18, 40, -9, 40],
    [13, 40],
    [22, 39, 26, 33],
    [38, 18],
    [60, 14],
    [71, 10, 70, 0],
    [68, -14],
  ],
  dart: [
    [-68, -12],
    [-70, 6],
    [-68, 13, -58, 14],
    [-36, 15],
    [-16, 29],
    [-10, 32, 0, 32],
    [12, 32],
    [20, 31, 26, 26],
    [46, 13],
    [66, 8],
    [74, 4, 72, -4],
    [68, -12],
  ],
  brute: [
    [-66, -16],
    [-68, 28],
    [-68, 42, -54, 43],
    [8, 44],
    [18, 43, 24, 36],
    [38, 20],
    [62, 18],
    [70, 16, 70, 6],
    [68, -16],
  ],
};
export const wheelRadius = (kind) => (kind === 'brute' ? 20 : 17);
export const wheelHeight = (kind) => wheelRadius(kind) - 38;
export const spoilerY = (kind) => (kind === 'brute' ? 43 : 17);
export function traceBody(ctx, kind) {
  const [start, ...lines] = bodies[kind] || bodies.octo;
  ctx.beginPath();
  ctx.moveTo(...start);
  for (const line of lines) {
    if (line.length === 2) ctx.lineTo(...line);
    else ctx.quadraticCurveTo(...line);
  }
  ctx.closePath();
}

// Split the chassis at its shoulders so each section used in car-to-car tests is convex.
function clipAtX(poly, x, side) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    if ((p[0] - x) * side >= 0) result.push(p);
    if ((p[0] - x) * (q[0] - x) < 0) result.push([x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])]);
  }
  return result;
}
function build(kind) {
  const body = [];
  for (const line of bodies[kind]) {
    if (line.length === 2) {
      body.push(line);
      continue;
    }
    const [x, y] = body.at(-1),
      [cx, cy, ex, ey] = line;
    for (let i = 1; i <= 4; i++) {
      const t = i / 4,
        u = 1 - t;
      body.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]);
    }
  }
  const [rear, front] = kind === 'dart' ? [-36, 46] : [-34, 38];
  const sections = [
    clipAtX(body, rear, -1),
    clipAtX(clipAtX(body, rear, 1), front, -1),
    clipAtX(body, front, 1),
  ];
  const wheels = [-42, 42].map((x) =>
    Array.from({ length: 16 }, (_, i) => {
      const angle = (i * Math.PI) / 8;
      return [
        x + Math.cos(angle) * wheelRadius(kind),
        wheelHeight(kind) + Math.sin(angle) * wheelRadius(kind),
      ];
    }),
  );
  const y = spoilerY(kind),
    spoiler = [
      [-66, y],
      [-66, y + 5],
      [-50, y + 5],
      [-50, y],
    ];
  return { body, sections, wheels, spoiler };
}
const shapes = Object.fromEntries(Object.keys(bodies).map((kind) => [kind, build(kind)]));

export function drawingScale(c) {
  const landing = c.landT > 0 ? 1 - c.landT * 0.6 : 1;
  const turn = c.turnT > 0 ? Math.max(0.2, Math.abs(Math.cos((c.turnT * Math.PI) / 0.22))) : 1;
  let roll = 1;
  if (c.rollT > 0 && c.rollDur > 0) {
    const k = Math.cos((1 - c.rollT / c.rollDur) * c.rollAng);
    roll = Math.abs(k) < 0.12 ? (k < 0 ? -0.12 : 0.12) : k;
  }
  return [turn * (1 + (1 - landing) * 0.4), roll * landing];
}
// Wheels, chassis and spoiler remain separate so the empty space between them stays playable.
export function carPolygons(c, sections = false) {
  const shape = shapes[c.body] || shapes.octo,
    ca = Math.cos(c.a),
    sa = Math.sin(c.a);
  const [sx, sy] = drawingScale(c);
  const world = (poly, dy = 0) =>
    poly.map(([x, y]) => {
      x *= c.dir * sx;
      y = (y + dy) * sy;
      return [c.x + ca * x - sa * y, c.y + sa * x + ca * y];
    });
  return [
    ...(sections ? shape.sections : [shape.body]).map((p) => world(p)),
    ...shape.wheels.map((w) => world(w, c.landT > 0 ? 3 : 0)),
    world(shape.spoiler),
  ];
}

// Nearest point on a closed outline, including an unambiguous exit when the ball centre is inside.
export function ballContact(car, ball, radius) {
  if (Math.hypot(ball.x - car.x, ball.y - car.y) > radius + 84) return null;
  let best = null;
  for (const points of carPolygons(car)) {
    let inside = false,
      distance2 = Infinity,
      qx = 0,
      qy = 0,
      edgeX = 0,
      edgeY = 1;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i],
        [bx, by] = points[(i + 1) % points.length];
      const dx = bx - ax,
        dy = by - ay;
      if (ay > ball.y !== by > ball.y && ball.x < ax + (dx * (ball.y - ay)) / dy) inside = !inside;
      const t = Math.max(
        0,
        Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      const x = ax + t * dx,
        y = ay + t * dy,
        d2 = (ball.x - x) ** 2 + (ball.y - y) ** 2;
      if (d2 < distance2) {
        distance2 = d2;
        qx = x;
        qy = y;
        edgeX = -dy;
        edgeY = dx;
      }
    }
    const distance = Math.sqrt(distance2),
      depth = inside ? radius + distance : radius - distance;
    if (depth <= 0 || (best && depth <= best.depth)) continue;
    const sign = inside ? -1 : 1;
    let nx = (ball.x - qx) * sign,
      ny = (ball.y - qy) * sign;
    if (distance < 1e-8) {
      const inward = edgeX * (car.x - qx) + edgeY * (car.y - qy) > 0 ? -1 : 1;
      nx = edgeX * inward;
      ny = edgeY * inward;
    }
    const len = Math.hypot(nx, ny) || 1;
    best = { nx: nx / len, ny: ny / len, depth, x: qx, y: qy };
  }
  return best;
}

function projection(poly, nx, ny) {
  let min = Infinity,
    max = -Infinity;
  for (const [x, y] of poly) {
    const p = x * nx + y * ny;
    min = Math.min(min, p);
    max = Math.max(max, p);
  }
  return { min, max };
}
function polygonContact(a, b) {
  let depth = Infinity,
    nx = 0,
    ny = 0;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        x = p[1] - q[1],
        y = q[0] - p[0],
        len = Math.hypot(x, y);
      if (!len) continue;
      const ux = x / len,
        uy = y / len,
        pa = projection(a, ux, uy),
        pb = projection(b, ux, uy);
      const positive = pa.max - pb.min,
        negative = pb.max - pa.min,
        overlap = Math.min(positive, negative);
      if (overlap <= 0) return null;
      if (overlap < depth) {
        depth = overlap;
        const sign = positive <= negative ? 1 : -1;
        nx = sign * ux;
        ny = sign * uy;
      }
    }
  }
  return { depth, nx, ny };
}
export function carsContact(a, b) {
  if (Math.hypot(a.x - b.x, a.y - b.y) > 168) return null;
  const aa = carPolygons(a, true),
    bb = carPolygons(b, true);
  let best = null;
  for (const pa of aa)
    for (const pb of bb) {
      const hit = polygonContact(pa, pb);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
  return best;
}
