/** A vehicle or obstacle with its length along the heading, in the game's own units. */
export function orientedBody(x, y, angle, halfLength, halfWidth) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  return { x, y, halfLength, halfWidth, forward: { x: dx, y: dy }, side: { x: -dy, y: dx } };
}
const dot = (a, b) => a.x * b.x + a.y * b.y;
export function projectedRadius(body, axis) {
  return body.halfLength * Math.abs(dot(body.forward, axis)) +
    body.halfWidth * Math.abs(dot(body.side, axis));
}
// Return the smallest displacement that separates a from b, or null for a clear pass.
export function contact(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  let depth = Infinity, nx = 0, ny = 0;
  for (const axis of [a.forward, a.side, b.forward, b.side]) {
    const separation = dx * axis.x + dy * axis.y;
    const overlap = projectedRadius(a, axis) + projectedRadius(b, axis) - Math.abs(separation);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      const sign = separation < 0 ? -1 : 1;
      depth = overlap;
      nx = sign * axis.x;
      ny = sign * axis.y;
    }
  }
  return { nx, ny, depth };
}

// Closest points on the centre lines of two rounded racing cars.
export function capsuleContact(a, b) {
  const la = a.halfLength - a.halfWidth, lb = b.halfLength - b.halfWidth;
  const u = a.forward, v = b.forward;
  const dx = b.x - a.x, dy = b.y - a.y, uv = dot(u, v);
  const du = dx * u.x + dy * u.y, dv = dx * v.x + dy * v.y;
  const clampTo = (value, half) => Math.max(-half, Math.min(half, value));
  const denominator = 1 - uv * uv;
  // For parallel cars choose the midpoint of the shared longitudinal span.
  let s = denominator > 1e-8 ? clampTo((du - dv * uv) / denominator, la)
    : clampTo((Math.max(-la, du - lb) + Math.min(la, du + lb)) / 2, la);
  const t = clampTo(s * uv - dv, lb);
  s = clampTo(du + t * uv, la);
  const ax = a.x + s * u.x, ay = a.y + s * u.y;
  const bx = b.x + t * v.x, by = b.y + t * v.y;
  const distance = Math.hypot(ax - bx, ay - by);
  const depth = a.halfWidth + b.halfWidth - distance;
  if (depth <= 0) return null;
  const normal = distance > 1e-7
    ? {nx: (ax - bx) / distance, ny: (ay - by) / distance, depth}
    : contact(a, b);
  return normal && { ...normal, x: (ax + bx) / 2, y: (ay + by) / 2 };
}
