// Pure maths for pitches, contact and ball flight. No three.js, no DOM, so the
// headless tests (tools/sim.mjs) can run it in plain node.
//
// World: metres. Home plate at the origin. -z points to centre field, +z toward
// the catcher / camera, +x is the first-base side (right on screen), y is up.
// The batter is right-handed and stands on the third-base side (x < 0), so a
// PULLED ball goes to left field (negative spray angle).

export const RELEASE = { x: -0.35, y: 2.05, z: -17.6 };
export const ZONE = { x0: -0.24, x1: 0.24, y0: 0.5, y1: 1.12 };   // strike zone at z = 0
export const SWING_LAG = 0.13;      // s from the click to bat-on-ball
export const WINDOW = 0.115;        // s either side of perfect where contact is still possible
export const G = 9.81;

export const PITCHES = {
  fastball: { name: 'FASTBALL', speed: 1.0,  brk: { x: 0.0,   y: -0.12 }, col: '#ffffff' },
  changeup: { name: 'CHANGEUP', speed: 0.8,  brk: { x: -0.18, y: -0.34 }, col: '#9fe3ff' },
  curve:    { name: 'CURVEBALL', speed: 0.76, brk: { x: 0.16,  y: -0.78 }, col: '#ffd36b' },
  slider:   { name: 'SLIDER',   speed: 0.87, brk: { x: 0.5,   y: -0.2  }, col: '#ff9ad8' },
};

// mulberry32: small seeded RNG so a round can be replayed in tests
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a pitch: where it crosses the plate and how it gets there.
// stage: { speed (m/s for a fastball), types: [...], brk (break scale), ballPct }
export function makePitch(stage, rand) {
  const type = stage.types[Math.floor(rand() * stage.types.length)];
  const P = PITCHES[type];
  const speed = stage.speed * P.speed * (0.97 + rand() * 0.06);
  const isBall = rand() < (stage.ballPct || 0);
  let tx, ty;
  if (isBall) {
    // clearly outside: off the plate or in the dirt / at the letters
    const side = Math.floor(rand() * 4);
    tx = side === 0 ? ZONE.x0 - 0.22 - rand() * 0.15 : side === 1 ? ZONE.x1 + 0.22 + rand() * 0.15 : (rand() - 0.5) * 0.4;
    ty = side === 2 ? ZONE.y0 - 0.25 - rand() * 0.1 : side === 3 ? ZONE.y1 + 0.25 + rand() * 0.1 : 0.55 + rand() * 0.5;
  } else {
    const edge = stage.edge || 0;     // 0 = middle-middle bias, 1 = spread across the zone
    const sp = 0.35 + 0.65 * edge;
    tx = ((rand() - 0.5) * (ZONE.x1 - ZONE.x0)) * sp;
    ty = (ZONE.y0 + ZONE.y1) / 2 + (rand() - 0.5) * (ZONE.y1 - ZONE.y0) * sp;
  }
  const dist = Math.hypot(RELEASE.z, RELEASE.y - ty);
  const T = dist / speed;
  const s = stage.brk || 1;
  return {
    type, name: P.name, col: P.col, speed, T, isBall,
    p0: { ...RELEASE },
    p1: { x: tx, y: ty, z: 0 },
    brk: { x: P.brk.x * s, y: P.brk.y * s },
    golden: false,
  };
}

// Ball position along the pitch at time t after release. s = t / T (1 at the plate).
// The ball starts heading for (target - break) and the break grows with s^2, so
// it looks straight early and bends late, which is how a real breaking ball reads.
export function pitchPos(p, t, out = {}) {
  const s = t / p.T;
  const k = s * s;
  out.x = p.p0.x + (p.p1.x - p.brk.x - p.p0.x) * s + p.brk.x * k;
  out.y = p.p0.y + (p.p1.y - p.brk.y - p.p0.y) * s + p.brk.y * k;
  out.z = p.p0.z + (p.p1.z - p.p0.z) * s;
  return out;
}

export function inZone(p) {
  return p.p1.x >= ZONE.x0 - 0.04 && p.p1.x <= ZONE.x1 + 0.04 && p.p1.y >= ZONE.y0 - 0.04 && p.p1.y <= ZONE.y1 + 0.04;
}

// Contact. dt = (time of bat-on-ball) - (time ball reaches the plate); negative = early.
// dx, dy = aim circle minus ball at the plate. rc = contact radius.
// Returns null for a whiff, otherwise the batted ball.
export function contact(dt, dx, dy, rc, rand = Math.random, W = WINDOW) {
  const ad = Math.hypot(dx, dy);
  if (Math.abs(dt) > W || ad > rc) return null;
  const qt = 1 - Math.pow(Math.abs(dt) / W, 1.25);
  const qa = 1 - Math.pow(ad / rc, 1.4);
  const perfect = Math.abs(dt) < 0.024 * W / WINDOW && ad < rc * 0.38;
  let power = 0.58 * qt + 0.42 * qa;
  let ev = 23 + 29 * power + (perfect ? 3 : 0);
  // launch: circle centred = ~28 deg; circle above the ball (dy > 0) = topped into
  // the ground; circle under it = popped up.
  let la = 28 - (dy / rc) * 38 + (rand() - 0.5) * 5;
  if (perfect) la = 26 + (rand() - 0.5) * 6;
  // spray: early pulls to left field (negative), late goes the other way
  let spray = (dt / W) * 46 + (dx / rc) * 7 + (rand() - 0.5) * 4;
  if (perfect) spray *= 0.6;
  // weak contact off the end of the bat loses more
  if (la < 5 || la > 55) ev *= 0.8;
  const foul = Math.abs(spray) > 45;
  let label = perfect ? 'PERFECT' : qt > 0.72 && qa > 0.55 ? 'GREAT' : qt > 0.4 ? 'GOOD' : dt < 0 ? 'EARLY' : 'LATE';
  if (!perfect && qt > 0.4 && qa < 0.3) label = dy > 0 ? 'TOPPED' : 'UNDER';
  return { ev, la, spray, foul, perfect, label, qt, qa, power };
}

// Outfield wall distance (m) for a spray angle in degrees. 98 m down the lines, 122 m to centre.
export function fenceDist(sprayDeg) {
  const a = Math.min(Math.abs(sprayDeg), 45) * Math.PI / 180;
  return 98 + 24 * Math.cos(a * 2);
}
export const WALL_H = 3.2;
// Stand seating rises behind the wall: height of the seats at radius r for that angle
export function standHeight(sprayDeg, r) {
  const R = fenceDist(sprayDeg) + 3;
  if (r < R) return -1;
  return Math.min(1.2 + (r - R) * 0.55, 26);
}

const DRAG = 0.0036;       // per metre: a = -DRAG |v| v
const LIFT = 0.0007;       // backspin carry: a_y += LIFT |v|^2 (fades as the ball slows)

export function launchVel(ev, laDeg, sprayDeg) {
  const la = laDeg * Math.PI / 180, sp = sprayDeg * Math.PI / 180;
  const h = ev * Math.cos(la);
  return { x: h * Math.sin(sp), y: ev * Math.sin(la), z: -h * Math.cos(sp) };
}

export function stepBall(b, dt) {
  const v = Math.hypot(b.vx, b.vy, b.vz);
  b.vx += (-DRAG * v * b.vx) * dt;
  b.vz += (-DRAG * v * b.vz) * dt;
  b.vy += (-G - DRAG * v * b.vy + LIFT * v * v * Math.max(0, Math.cos(Math.atan2(b.vy, Math.hypot(b.vx, b.vz))))) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
}

// Simulate a batted ball to its end. Returns { result, dist, land, apex, hang, path }.
// result: 'hr' | 'wall' | 'out' | 'foul' | 'grounder'
export function simulate(hit, start = { x: 0, y: 0.9, z: 0 }, keepPath = false) {
  const v = launchVel(hit.ev, hit.la, hit.spray);
  const b = { x: start.x, y: start.y, z: start.z, vx: v.x, vy: v.y, vz: v.z };
  const dt = 1 / 120;
  let t = 0, apex = b.y, result = null, land = null, path = keepPath ? [] : null;
  let crossed = false, projDist = 0;
  for (let i = 0; i < 120 * 12; i++) {
    const px = b.x, pz = b.z;
    stepBall(b, dt); t += dt;
    if (path && i % 2 === 0) path.push({ x: b.x, y: b.y, z: b.z, t });
    apex = Math.max(apex, b.y);
    const r = Math.hypot(b.x, b.z);
    const ang = Math.atan2(b.x, -b.z) * 180 / Math.PI;
    const R = fenceDist(ang);
    if (!crossed && r >= R) {
      crossed = true;
      if (Math.abs(ang) > 45) { result = 'foul'; }
      else if (b.y > WALL_H) { result = 'hr'; }
      else { result = 'wall'; land = { x: b.x, y: b.y, z: b.z }; projDist = r; break; }
    }
    if (crossed && result === 'hr') {
      const h = standHeight(ang, r);
      if (b.y <= h) { land = { x: b.x, y: h, z: b.z }; break; }
    }
    if (b.y <= 0) { land = { x: b.x, y: 0, z: b.z }; break; }
  }
  // projected distance = where it would come down at ground level (what the meter shows)
  if (result === 'hr') {
    const c = { ...b };
    for (let i = 0; i < 120 * 8 && c.y > 0; i++) stepBall(c, dt);
    projDist = Math.hypot(c.x, c.z);
  } else if (result !== 'wall') {
    projDist = Math.hypot(b.x, b.z);
  }
  if (!result) {
    const ang = Math.atan2(b.x, -b.z) * 180 / Math.PI;
    result = Math.abs(ang) > 45 || hit.foul ? 'foul' : hit.la < 8 ? 'grounder' : 'out';
  }
  return { result, dist: projDist, land: land || { x: b.x, y: 0, z: b.z }, apex, hang: t, path };
}
