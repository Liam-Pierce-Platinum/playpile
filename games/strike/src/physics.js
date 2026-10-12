// STRIKE pin + ball physics. Pure module: no DOM, runs in the browser and in node.
// Lane runs along -z. Foul line z=0, head pin at z=-18.288 (60 ft). Units: metres, seconds.
// Pins: 2D discs on the deck plus a tilt state (inverted pendulum about the base edge).
// A tilted pin also collides through circles along its body, so falling pins take out
// their neighbours (real pin action / dominoes).

export const L = {
  laneHalf: 0.527,     // 41.5 in wide lane
  headZ: -18.288,
  deckEnd: -19.25,
  pitZ: -19.4,
  ballR: 0.108,
  gutterX: 0.655,      // ball centre while in the gutter
  wallX: 0.86,         // kickback walls beside the pin deck
  oilEnd: -11.0,       // oil pattern length: ball skids before this, hooks after
  pinR: 0.06,
  pinH: 0.381,
};

// tunables (exported so tools/tune.mjs can search them)
export const P = { BALL_M: 7.0, PIN_M: 1.55, HOOK: 0.95, KT: 3.846, TH_C: 0.13, FALL_K: 70, E_BP: 0.338, E_PP: 0.466, PIN_XFER: 0.646, E_WALL: 0.549, AIR: 0.183, DEC_DOWN: 2.111, KS: 12.77, SW_BALL: 4.62, SW_DEC: 3.52, CARRY_KT: -0.73, CARRY_E: -0.24, CARRY_W: 0.05, CARRY_X: 0.02, MAG: 2, MAG_W: 0.08, CARRY_A0: 0.9, SPARE_W: 0 };
const HALF_PI = Math.PI / 2;

// pins 1..10, index 0..9. Pin 2 is LEFT of the head pin (negative x), 10 is far right.
export const PIN_SPOTS = (() => {
  const s = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) s.push({ x: (i - r / 2) * 0.3048, z: L.headZ - r * 0.2639 });
  return s;
})();

// neighbours for split detection (adjacent in the triangle)
export function isSplit(standingNums) {
  if (standingNums.includes(1) || standingNums.length < 2) return false;
  const pts = standingNums.map((n) => PIN_SPOTS[n - 1]);
  const seen = new Array(pts.length).fill(false);
  let comps = 0;
  for (let i = 0; i < pts.length; i++) {
    if (seen[i]) continue; comps++;
    const st = [i]; seen[i] = true;
    while (st.length) {
      const a = st.pop();
      for (let j = 0; j < pts.length; j++) if (!seen[j] && Math.hypot(pts[a].x - pts[j].x, pts[a].z - pts[j].z) < 0.32) { seen[j] = true; st.push(j); }
    }
  }
  return comps > 1;
}

function makePin(n, x, z) {
  return { n, x, z, x0: x, z0: z, vx: 0, vz: 0, y: 0, vy: 0, th: 0, w: 0, dx: 0, dz: -1, down: false, gone: false, gutter: false, spinY: 0, sw: 0, hit: false };
}

export class Sim {
  constructor() { this.pins = []; this.ball = null; this.t = 0; this.events = []; this.firstHit = -1; this.ballOut = -1; this.hits = 0; this.carry = -1; }

  rack(nums) { // nums: array of pin numbers to set (default full rack)
    nums = nums || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    this.pins = nums.map((n) => makePin(n, PIN_SPOTS[n - 1].x, PIN_SPOTS[n - 1].z));
    this.ball = null; this.t = 0; this.firstHit = -1; this.ballOut = -1; this.hits = 0; this.carry = -1;
  }

  // keep only standing pins, upright, where they are now (what the pinsetter does)
  respot() {
    this.pins = this.pins.filter((p) => !this.isDown(p)).map((p) => {
      const q = makePin(p.n, p.x, p.z); q.x0 = p.x0; q.z0 = p.z0; return q;
    });
    this.ball = null; this.t = 0; this.firstHit = -1; this.ballOut = -1; this.hits = 0; this.carry = -1;
  }

  clone() {
    const s = new Sim();
    s.pins = this.pins.map((p) => ({ ...p }));
    s.ball = this.ball ? { ...this.ball } : null;
    s.t = this.t; s.firstHit = this.firstHit; s.ballOut = this.ballOut; s.hits = this.hits; s.carry = this.carry;
    return s;
  }

  // x: start position, angle: radians (+ = right), speed m/s, spin -1..1 (+ = hooks right)
  throwBall({ x = 0, angle = 0, speed = 8, spin = 0, z = -0.3 }) {
    this.ball = { x, z, y: L.ballR, vx: speed * Math.sin(angle), vz: -speed * Math.cos(angle), spin, gutter: false, active: true, roll: 0, inPit: false, speed };
    this.t = 0; this.firstHit = -1; this.ballOut = -1; this.hits = 0; this.carry = -1;
    this.pins.forEach((p) => { p.hit = false; });
  }

  headUp() { const h = this.pins.find((p) => p.n === 1); return !!h && !this.isDown(h) && Math.abs(h.x - h.x0) < 0.01; }

  isDown(p) { return p.gone || p.down || p.gutter || p.th > 0.55; }

  emit(type, d) { this.events.push({ type, ...d }); }

  step(dt) {
    this.t += dt;
    const b = this.ball;
    if (b && b.active) {
      const sp = Math.hypot(b.vx, b.vz);
      if (!b.gutter) {
        const f = b.z > L.oilEnd ? 0.12 : 1;
        b.vx += b.spin * P.HOOK * f * dt;
        if (b.z < L.oilEnd) b.spin *= 1 - 0.25 * dt;
        const dec = 0.12 * dt; if (sp > dec) { b.vx -= b.vx / sp * dec; b.vz -= b.vz / sp * dec; }
        if (Math.abs(b.x) > L.laneHalf + 0.03 && b.z > L.headZ + 0.5) { b.gutter = true; this.emit('gutter', { x: b.x, z: b.z }); }
        else if (Math.abs(b.x) > L.laneHalf + 0.03 && b.z > L.deckEnd) { b.gutter = true; this.emit('gutter', { x: b.x, z: b.z }); }
      } else {
        const tx = Math.sign(b.x) * L.gutterX;
        b.x += (tx - b.x) * Math.min(1, dt * 12); b.vx = 0;
        b.y += (L.ballR - 0.075 - b.y) * Math.min(1, dt * 10);
        if (b.vz > -3) b.vz = -3;
      }
      // arcade pocket assist: over the last few metres a ball that is heading NEAR the pocket is
      // gently steered into it (only with the head pin standing). Makes strikes reachable by thumb.
      if (P.MAG > 0 && !b.gutter && b.z < L.headZ + 4 && b.z > L.headZ + 0.35 && this.headUp()) {
        const tth = (b.z - L.headZ) / -b.vz, xh = b.x + b.vx * tth;
        const ideal = b.vx < -0.02 ? 0.065 : b.vx > 0.02 ? -0.065 : (xh >= 0 ? 0.065 : -0.065), err = ideal - xh;
        if (Math.abs(err) < P.MAG_W) b.vx += err / Math.max(0.05, tth) * Math.min(1, dt * 4) * P.MAG * (1 - Math.abs(err) / P.MAG_W * 0.5);
      }
      // arcade spare assist (game mode sets SPARE_W on spare balls): a ball that will just miss the nearest standing
      // pin is nudged so it clips that pin on the same side. Off in split puzzles and on full racks.
      if (P.SPARE_W > 0 && !b.gutter && !this.headUp()) {
        let best = null, be = 1e9;
        for (const p of this.pins) { if (this.isDown(p) || b.z < p.z + 0.4 || b.z > p.z + 5) continue; const xh = b.x + b.vx * (b.z - p.z) / -b.vz, e = p.x - xh; if (Math.abs(e) < Math.abs(be)) { be = e; best = p; } }
        if (best && Math.abs(be) < P.SPARE_W && Math.abs(be) > 0.1) { const want = be - Math.sign(be) * 0.1, tt = (b.z - best.z) / -b.vz; b.vx += want / Math.max(0.08, tt) * Math.min(1, dt * 3); }
      }
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.roll += sp * dt / L.ballR;
      // pocket quality, measured just before the ball reaches the head pin. A ball that enters the
      // pocket (1-3 for a ball moving left, 1-2 moving right) with some angle gets livelier pin action
      // ("carry"), which is what real hook bowling rewards.
      if (this.carry < 0 && b.z < L.headZ + 0.45) {
        const xh = b.x + b.vx / b.vz * (L.headZ - b.z), ang = Math.atan2(Math.abs(b.vx), -b.vz) * 180 / Math.PI;
        const ideal = b.vx < 0 ? 0.065 : -0.065;
        const q = Math.max(0, 1 - Math.abs(xh - ideal) / P.CARRY_W) * (P.CARRY_A0 + (1 - P.CARRY_A0) * Math.min(1, ang / 4));
        this.carry = b.gutter ? 0 : q; this.pocket = { xh, ang, q };
      }
      if (b.z < L.pitZ) { b.active = false; b.inPit = true; this.ballOut = this.t; this.emit('pit', {}); }
      if (Math.abs(b.vz) < 0.2 && Math.abs(b.vx) < 0.2) { b.active = false; this.ballOut = this.t; }
    }

    // pins: integrate
    for (const p of this.pins) {
      if (p.gone) continue;
      const v = Math.hypot(p.vx, p.vz);
      if (v > 0) {
        const dec = (p.down ? P.DEC_DOWN : p.th > 0.3 ? 1.6 : 2.6) * dt * (p.y > 0.01 ? 0.1 : 1);
        if (v <= dec) { p.vx = 0; p.vz = 0; } else { p.vx -= p.vx / v * dec; p.vz -= p.vz / v * dec; }
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.th > 1 && p.sw) { // lying pins spin like propellers about their middle
        const cx = p.x + p.dx * 0.15, cz = p.z + p.dz * 0.15, c = Math.cos(p.sw * dt), sn = Math.sin(p.sw * dt);
        const nx = p.dx * c - p.dz * sn, nz = p.dx * sn + p.dz * c; p.dx = nx; p.dz = nz;
        p.x = cx - nx * 0.15; p.z = cz - nz * 0.15;
        const d = P.SW_DEC * dt * (1 + Math.abs(p.sw) * 0.1); p.sw = Math.abs(p.sw) <= d ? 0 : p.sw - Math.sign(p.sw) * d;
      }
      if (p.y > 0 || p.vy > 0) { p.vy -= 9.8 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = p.vy < -0.6 ? -p.vy * 0.3 : 0; } }
      if (!p.down) {
        let a = P.FALL_K * (Math.sin(p.th) - Math.tan(P.TH_C) * Math.cos(p.th));
        p.w += a * dt; p.w *= 1 - 1.2 * dt;
        p.th += p.w * dt;
        if (p.th <= 0) { p.th = 0; p.w = Math.abs(p.w) > 0.4 ? -p.w * 0.25 : 0; }
        if (p.th >= HALF_PI) { p.th = HALF_PI; p.down = true; p.w = 0; this.emit('fall', { x: p.x, z: p.z, n: p.n }); }
      }
      // kickbacks
      if (p.z < -17.4 && Math.abs(p.x) > L.wallX) { p.x = Math.sign(p.x) * L.wallX; if (p.vx * Math.sign(p.x) > 0) { p.vx = -p.vx * P.E_WALL; if (Math.abs(p.vx) > 0.5) this.emit('wall', { x: p.x, z: p.z, power: Math.abs(p.vx) }); } }
      // gutter / pit
      if (!p.gutter && Math.abs(p.x) > L.laneHalf + 0.035) { p.gutter = true; if (!p.down) { p.th = Math.max(p.th, 1.2); p.w = 6; } }
      if (p.z < L.pitZ) { p.gone = true; }
      if (p.z > L.headZ + 1.5 && p.down) { p.vz = Math.min(p.vz, 0); }
    }

    // collisions
    const circles = [];
    for (const p of this.pins) {
      if (p.gone) continue;
      const s = Math.sin(p.th);
      circles.push({ p, x: p.x, z: p.z, r: L.pinR, s: 0 });
      if (p.th > 0.15) {
        circles.push({ p, x: p.x + p.dx * 0.15 * s, z: p.z + p.dz * 0.15 * s, r: 0.058, s: 0.15 });
        circles.push({ p, x: p.x + p.dx * 0.29 * s, z: p.z + p.dz * 0.29 * s, r: 0.034, s: 0.29 });
      }
    }
    if (b && b.active && !b.gutter) {
      for (const c of circles) {
        const dx = c.x - b.x, dz = c.z - b.z, rr = L.ballR + c.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-10) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        const vrel = (c.p.vx - b.vx) * nx + (c.p.vz - b.vz) * nz;
        const pen = rr - d;
        // positional fix: mostly move the pin
        const wb = P.PIN_M / (P.BALL_M + P.PIN_M), wp = P.BALL_M / (P.BALL_M + P.PIN_M);
        b.x -= nx * pen * wb; b.z -= nz * pen * wb; c.p.x += nx * pen * wp; c.p.z += nz * pen * wp;
        if (vrel >= 0) continue;
        const j = -(1 + P.E_BP) * vrel / (1 / P.BALL_M + 1 / P.PIN_M);
        b.vx -= j / P.BALL_M * nx; b.vz -= j / P.BALL_M * nz;
        const xf = P.PIN_XFER * (1 + P.CARRY_X * Math.max(0, this.carry)), dvx = j / P.PIN_M * nx * xf, dvz = j / P.PIN_M * nz * xf;
        c.p.vx += dvx; c.p.vz += dvz;
        this.kick(c.p, dvx, dvz, true);
        this.torque(c.p, c.s, dvx, dvz);
        if (c.s === 0 && j / P.PIN_M > 2) c.p.sw += (j / P.PIN_M) * P.SW_BALL * Math.sign(nx * b.vz - nz * b.vx || 1);
        if (this.firstHit < 0) { this.firstHit = this.t; this.emit('first', { x: c.p.x, z: c.p.z, n: c.p.n, bx: b.x }); }
        this.hits++;
        this.emit('hit', { kind: 'ball', x: c.x, z: c.z, power: j / P.PIN_M });
      }
    }
    for (let i = 0; i < circles.length; i++) {
      const A = circles[i];
      for (let k = i + 1; k < circles.length; k++) {
        const B = circles[k];
        if (A.p === B.p) continue;
        const dx = B.x - A.x, dz = B.z - A.z, rr = A.r + B.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-10) continue;
        // a lying pin's body under a flying pin: skip if heights clearly differ
        if (A.p.y > P.AIR || B.p.y > P.AIR) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
        A.p.x -= nx * pen * 0.5; A.p.z -= nz * pen * 0.5; B.p.x += nx * pen * 0.5; B.p.z += nz * pen * 0.5;
        const vrel = (B.p.vx - A.p.vx) * nx + (B.p.vz - A.p.vz) * nz;
        // a falling pin's top is moving faster than its base: add the tilt speed of the contact point
        const tA = A.p.th > 0.15 ? A.p.w * 0.2 * ((A.p.dx * nx + A.p.dz * nz)) : 0;
        const tB = B.p.th > 0.15 ? B.p.w * 0.2 * ((B.p.dx * nx + B.p.dz * nz)) : 0;
        const rel = vrel + tB - tA;
        if (rel >= 0) continue;
        const j = -(1 + P.E_PP + P.CARRY_E * Math.max(0, this.carry)) * rel / 2 * P.PIN_M;
        const dv = j / P.PIN_M;
        A.p.vx -= dv * nx; A.p.vz -= dv * nz; B.p.vx += dv * nx; B.p.vz += dv * nz;
        this.kick(A.p, -dv * nx, -dv * nz); this.kick(B.p, dv * nx, dv * nz);
        this.torque(A.p, A.s, -dv * nx, -dv * nz); this.torque(B.p, B.s, dv * nx, dv * nz);
        if (dv > 0.25) this.emit('hit', { kind: 'pin', x: (A.x + B.x) / 2, z: (A.z + B.z) / 2, power: dv });
      }
    }
    // standing pins pushed far off their spot get unstable (they can't slide forever upright)
  }

  torque(p, s, dvx, dvz) {
    if (p.th < 0.6) return;
    const r = (s - 0.15) * Math.sin(p.th), rx = p.dx * r, rz = p.dz * r;
    p.sw += (rz * dvx - rx * dvz) * P.KS;
  }

  kick(p, dvx, dvz, fromBall) {
    if (p.down) return;
    const m = Math.hypot(dvx, dvz); if (m < 1e-6) return;
    p.hit = true;
    if (fromBall && m > 1.2) p.vy += Math.min(2.2, m * 0.22);
    const kt = P.KT * (1 + P.CARRY_KT * Math.max(0, this.carry)), wx = dvx * kt, wz = dvz * kt;
    if (p.th < 0.05) {
      const cx = p.dx * p.w + wx, cz = p.dz * p.w + wz, mag = Math.hypot(cx, cz);
      if (mag > 1e-6) { p.dx = cx / mag; p.dz = cz / mag; p.w = mag; }
    } else {
      const along = wx * p.dx + wz * p.dz;
      p.w += along;
      const px = wx - along * p.dx, pz = wz - along * p.dz;
      const nx = p.dx + px * 0.15, nz = p.dz + pz * 0.15, mag = Math.hypot(nx, nz);
      p.dx = nx / mag; p.dz = nz / mag;
    }
  }

  settled() {
    const b = this.ball;
    if (b && b.active) return false;
    if (this.ballOut >= 0 && this.t - this.ballOut > 2.6) return true;
    for (const p of this.pins) {
      if (p.gone) continue;
      if (Math.hypot(p.vx, p.vz) > 0.04 || p.y > 0.005 || Math.abs(p.sw) > 0.3) return false;
      if (!p.down && (p.th > 0.01 || Math.abs(p.w) > 0.05)) return false;
    }
    return true;
  }

  // run to the end (headless). returns standing pin numbers after.
  run(maxT = 9, dt = 1 / 240) {
    let n = 0;
    while (n++ < maxT / dt) { this.step(dt); if (this.t > 1 && this.settled()) break; }
    this.events.length = 0;
    return this.standing();
  }

  standing() { return this.pins.filter((p) => !this.isDown(p)).map((p) => p.n); }
}

// predicted ball line with no pins (for the aim preview). Same equations as Sim.step.
export function ballPath({ x = 0, angle = 0, speed = 8, spin = 0 }, every = 0.35) {
  const s = new Sim(); s.pins = []; s.throwBall({ x, angle, speed, spin });
  const out = []; let lastZ = 1, n = 0;
  while (s.ball.active && s.ball.z > L.headZ - 0.3 && n++ < 3000) {
    s.step(1 / 120);
    if (lastZ - s.ball.z >= every) { lastZ = s.ball.z; out.push({ x: s.ball.x, z: s.ball.z, gutter: s.ball.gutter }); }
    if (s.ball.gutter) break;
  }
  s.events.length = 0;
  return out;
}
