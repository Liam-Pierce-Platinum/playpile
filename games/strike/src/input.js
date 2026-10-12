// Swipe analysis. Pure function on screen-space points {x, y, t} (px, ms).
// Returns null if the gesture is not a throw.
export function analyseSwipe(pts, H) {
  if (pts.length < 3) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = a.y - b.y; // dy > 0 = upward
  if (dy < H * 0.08) return null;
  const chord = Math.hypot(dx, dy);
  // speed: blend of the flick (last 40% of the swipe) and the average, in screen-heights per second
  const k = Math.max(0, Math.floor(pts.length * 0.6) - 1), p = pts[k];
  const dt = Math.max(16, b.t - p.t);
  const flick = Math.hypot(b.x - p.x, b.y - p.y) / H / (dt / 1000);
  const avg = chord / H / (Math.max(30, b.t - a.t) / 1000);
  const v = Math.max(flick, avg) * 0.6 + Math.min(flick, avg) * 0.4;
  const speed = Math.max(5.2, Math.min(10.8, 4.6 + v * 1.25));
  // direction: mostly the chord, partly the launch (first 40% of the path)
  const e = pts[Math.max(1, Math.floor(pts.length * 0.4))];
  const ldx = e.x - a.x, ldy = Math.max(1, a.y - e.y);
  const ang = Math.atan2(dx, dy) * 0.55 + Math.atan2(ldx, ldy) * 0.45;
  const angle = Math.max(-0.05, Math.min(0.05, ang * 0.06));
  // bend: max signed sideways distance from the chord, as a fraction of its length (+ = bows right)
  const nx = dy / chord, ny = dx / chord;
  let bend = 0;
  for (const q of pts) { const px = q.x - a.x, py = a.y - q.y; const s = px * nx - py * ny; if (Math.abs(s) > Math.abs(bend)) bend = s; }
  bend /= chord;
  // a ")" swipe bows right -> ball goes out right and hooks LEFT (negative spin)
  let spin = Math.max(-1, Math.min(1, -bend * 4.2));
  if (Math.abs(spin) < 0.06) spin = 0;
  return { angle, speed, spin, bend, flick: v };
}
