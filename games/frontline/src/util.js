// Small shared helpers: seeded RNG, math, angles.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// mulberry32
export function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

export const R = rng(Date.now() & 0xffffffff);

// shortest signed angle difference a->b
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function approachAng(a, b, maxStep) {
  const d = angDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
// yaw convention: forward = (-sin(yaw), -cos(yaw)) in XZ (three.js camera looks down -Z at yaw 0)
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
export const fwdX = (yaw) => -Math.sin(yaw);
export const fwdZ = (yaw) => -Math.cos(yaw);
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// value noise (2D), smooth, deterministic
export function noise2(seed) {
  const h = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

// distance from point to segment in XZ
export function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const L = vx * vx + vz * vz;
  let t = L > 0 ? ((px - ax) * vx + (pz - az) * vz) / L : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t - px, cz = az + vz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

// closest distance between a 3D point and a segment
export function segDist3(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const L = vx * vx + vy * vy + vz * vz;
  let t = L > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy + (p.z - a.z) * vz) / L : 0;
  t = clamp(t, 0, 1);
  const cx = a.x + vx * t - p.x, cy = a.y + vy * t - p.y, cz = a.z + vz * t - p.z;
  return { d: Math.sqrt(cx * cx + cy * cy + cz * cz), t };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
