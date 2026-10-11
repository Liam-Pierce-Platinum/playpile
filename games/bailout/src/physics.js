// BAILOUT physics: a small sequential-impulse solver at a fixed 120 Hz.
// The bike is a rigid chassis plus two wheel bodies on sprung sliders
// (lateral hard constraint + axial spring/damper + travel limits). Wheels
// have spin; traction comes from friction impulses at the contact patch, so
// the motor really drives the bike and its reaction torque really lifts the
// front. The rider is a Verlet ragdoll (11 particles, 10 bones) once he
// bails. Boulders are rolling rigid circles using the same contact code.
import { riderPose, HEAD_R } from './bikes.js';
import { clamp, wrapAngle } from './util.js';

export const GRAV = 1400;
export const DT = 1 / 120;
const ITER = 10;
const SLOP = 0.4;
// air control: a pedal that was already held for longer than this when the
// wheels left the ground does NOT spin the bike (so "hold the go button" flies
// flat, like Moto X3M). Release and press again in the air for a full-power flip.
export const REPRESS = 0.15;
// With nothing (fresh) pressed in the air: the spin the player put in is killed
// within a few frames (a released pedal STOPS the flip, like Moto X3M / Trials:
// ~35 degrees of carry from full speed), then a near-critically-damped
// auto-level drifts the bike toward the slope it is going to land on.
const LEVEL_GAIN = 12, LEVEL_ACC = 8;      // PD toward the landing slope (zeta ~0.9, tau ~0.5 s)
const DAMP_SLOW = 6, DAMP_FAST = 24;       // angular damping at low / high spin (blend over 1..3 rad/s)

// where a ballistic body starting at (x, y, vx, vy) meets the ground: {t, x, slope}
export function predictLanding(world, x, y, vx, vy) {
  const T = world.terrain;
  const h = 0.02;
  for (let t = 0; t < 3.5; t += h) {
    const wa = world.windAt ? world.windAt(x, y) : 0;
    vy += (GRAV - wa) * h; x += vx * h; y += vy * h;
    const gy = T.surfaceY(x);
    if (isFinite(gy) && y + 30 > gy) return { t, x, slope: T.slopeAt(x) };
    if (y > T.deathY) return { t, x, slope: 0 };
  }
  return { t: 3.5, x, slope: 0 };
}

const tmpSegs = [];
const SV = [0, 0];

// ---------------------------------------------------------------- contacts
function segActive(s) {
  if (s.off) return false;
  if (s.gate && s.gate.loop.phase !== s.gate.phase) return false;
  return true;
}

// circle vs every nearby one-sided segment. Contacts with near-identical
// normals are merged (keeps the deepest) so polyline vertices don't double-hit.
export function circleContacts(world, cx, cy, r, out, max = 3, self = null) {
  out.length = 0;
  const list = world.terrain.query(cx - r - 2, cx + r + 2, tmpSegs);
  testList(list, cx, cy, r, out, max);
  const dyn = world.dynSegs;
  if (dyn && dyn.length) testList(dyn, cx, cy, r, out, max, true);
  // rolling boulders act as round moving surfaces
  const cs = world.circles;
  if (cs) for (let i = 0; i < cs.length && out.length < max; i++) {
    const b = cs[i];
    if (b === self || b.dead) continue;
    const dx = cx - b.x, dy = cy - b.y, R = r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= R * R || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.seg.owner = b.owner; b.owner.cx = b.x; b.owner.cy = b.y; b.owner.vx = b.vx; b.owner.vy = b.vy;
    out.push({ nx, ny, pen: R - d, px: b.x + nx * b.r, py: b.y + ny * b.r, seg: b.seg, jn: 0, jt: 0 });
  }
  return out;
}
function testList(list, cx, cy, r, out, max, bbox) {
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!segActive(s)) continue;
    if (bbox && (cx + r < s.x0 || cx - r > s.x1)) continue;
    if (cy + r < s.y0 - 1 || cy - r > s.y1 + 1) continue;
    const rx = cx - s.ax, ry = cy - s.ay;
    const side = rx * s.nx + ry * s.ny;
    if (side < -r * 0.3 || side >= r) continue;
    const t = rx * s.tx + ry * s.ty;
    let nx, ny, pen, qx, qy;
    if (t <= 0 || t >= s.len) {
      qx = t <= 0 ? s.ax : s.bx; qy = t <= 0 ? s.ay : s.by;
      const dx = cx - qx, dy = cy - qy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d;
      if (nx * s.nx + ny * s.ny < 0.25) continue;
      pen = r - d;
    } else {
      nx = s.nx; ny = s.ny; pen = r - side;
      qx = s.ax + s.tx * t; qy = s.ay + s.ty * t;
    }
    let merged = false;
    for (let k = 0; k < out.length; k++) {
      const c = out[k];
      if (c.nx * nx + c.ny * ny > 0.96) { merged = true; if (pen > c.pen) { c.nx = nx; c.ny = ny; c.pen = pen; c.px = qx; c.py = qy; c.seg = s; } break; }
    }
    if (!merged && out.length < max) out.push({ nx, ny, pen, px: qx, py: qy, seg: s, jn: 0, jt: 0 });
  }
}

function surfVel(s, px, py, out) {
  let vx = s.conv * s.tx, vy = s.conv * s.ty;
  const o = s.owner;
  if (o) { vx += o.vx - o.w * (py - o.cy); vy += o.vy + o.w * (px - o.cx); }
  out[0] = vx; out[1] = vy;
}
function hitOwner(o, jx, jy, px, py) {
  if (!o) return;
  o.touched = true;
  if (o.im) { o.vx += jx * o.im; o.vy += jy * o.im; }
  if (o.iI) o.w += ((px - o.cx) * jy - (py - o.cy) * jx) * o.iI;
  if (o.onImpulse) o.onImpulse(jx, jy);
}

// spinning circle (wheel / boulder) vs contact
function solveWheel(B, ct) {
  const s = ct.seg, o = s.owner;
  surfVel(s, ct.px, ct.py, SV);
  const nx = ct.nx, ny = ct.ny;
  let kn = B.im, rox = 0, roy = 0;
  if (o) { rox = ct.px - o.cx; roy = ct.py - o.cy; const c = rox * ny - roy * nx; kn += (o.im || 0) + c * c * (o.iI || 0); }
  const vn = (B.vx - SV[0]) * nx + (B.vy - SV[1]) * ny;
  let jn = -vn / kn;
  const old = ct.jn; ct.jn = Math.max(0, old + jn); jn = ct.jn - old;
  B.vx += jn * nx * B.im; B.vy += jn * ny * B.im;
  hitOwner(o, -jn * nx, -jn * ny, ct.px, ct.py);
  // friction / traction
  const tx = -ny, ty = nx;
  const rcx = -nx * B.r, rcy = -ny * B.r;
  const vt = (B.vx - B.spin * rcy - SV[0]) * tx + (B.vy + B.spin * rcx - SV[1]) * ty;
  const rct = rcx * ty - rcy * tx;
  let kt = B.im + rct * rct * B.iIw;
  if (o) { const c = rox * ty - roy * tx; kt += (o.im || 0) + c * c * (o.iI || 0); }
  let jt = -vt / kt;
  const mu = B.grip * s.mu;
  const oldt = ct.jt; ct.jt = clamp(oldt + jt, -mu * ct.jn, mu * ct.jn); jt = ct.jt - oldt;
  B.vx += jt * tx * B.im; B.vy += jt * ty * B.im;
  B.spin += rct * jt * B.iIw;
  hitOwner(o, -jt * tx, -jt * ty, ct.px, ct.py);
}

// point on a rigid body (chassis hull) vs contact
function solvePoint(C, ct, mu) {
  const s = ct.seg, o = s.owner;
  surfVel(s, ct.px, ct.py, SV);
  const nx = ct.nx, ny = ct.ny;
  const rx = ct.px - C.x, ry = ct.py - C.y;
  const vx = C.vx - C.w * ry - SV[0], vy = C.vy + C.w * rx - SV[1];
  const rn = rx * ny - ry * nx;
  const kn = C.im + rn * rn * C.iI;
  let jn = -(vx * nx + vy * ny) * 1.1 / kn;
  const old = ct.jn; ct.jn = Math.max(0, old + jn); jn = ct.jn - old;
  C.vx += jn * nx * C.im; C.vy += jn * ny * C.im; C.w += rn * jn * C.iI;
  hitOwner(o, -jn * nx, -jn * ny, ct.px, ct.py);
  const tx = -ny, ty = nx;
  const vx2 = C.vx - C.w * ry - SV[0], vy2 = C.vy + C.w * rx - SV[1];
  const rt = rx * ty - ry * tx;
  const kt = C.im + rt * rt * C.iI;
  let jt = -(vx2 * tx + vy2 * ty) / kt;
  const oldt = ct.jt; ct.jt = clamp(oldt + jt, -mu * ct.jn, mu * ct.jn); jt = ct.jt - oldt;
  C.vx += jt * tx * C.im; C.vy += jt * ty * C.im; C.w += rt * jt * C.iI;
  ct.slide = Math.abs(vx2 * tx + vy2 * ty);
}

// ---------------------------------------------------------------- bike
export class Bike {
  constructor(spec) {
    this.spec = spec;
    const m = spec.mass, I = spec.inertia;
    this.c = { x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, m, im: 1 / m, I, iI: 1 / I };
    this.wh = spec.wheels.map((wd) => {
      const mw = spec.wheelMass, Iw = mw * wd.r * wd.r * 0.6;
      const al = Math.hypot(wd.axis[0], wd.axis[1]);
      return { lx: wd.x, ly: wd.y, dxl: wd.axis[0] / al, dyl: wd.axis[1] / al, r: wd.r, drive: wd.drive,
        m: mw, im: 1 / mw, Iw, iIw: 1 / Iw, grip: spec.grip,
        x: 0, y: 0, vx: 0, vy: 0, spin: 0, rot: 0, s: 0, air: 1, cts: [], limJ: 0,
        dx: 0, dy: 1, nx: 1, ny: 0, Px: 0, Py: 0, lat: 0, impact: 0, surfN: [0, -1], lastSeg: null };
    });
    this.hullCts = spec.hull.map(() => []);
    this.pose = {};
    this.lean = 0;
    this.air = 0;          // seconds with no wheel contact
    this.crash = null;     // set to a cause string when the rider is unseated
    this.events = [];
    this.boost = 0;
    this.riderOn = true;
    this.throttle = 0;
    this.airMul = 1;       // per-level air-spin multiplier (world 1 tutorial levels use 0.6)
    this.gasT = 0; this.brakeT = 0;         // how long each pedal has been held continuously
    this.gasStale = false; this.brakeStale = false; // held since before take-off: no spin from it
    this.wasAir = false;
    this.pred = null; this.predT = 0;       // cached landing prediction while airborne
    this.spinning = 0;     // -1 / +1 while a fresh pedal is actively spinning the bike in the air
  }
  get airMax() { return this.spec.airMax * this.airMul; }
  get airAcc() { return this.spec.airAcc * this.airMul; }

  place(x, groundY, ang) {
    const c = this.c, ca = Math.cos(ang), sa = Math.sin(ang);
    // put the chassis so the wheels just touch the ground line
    const lowest = Math.max(...this.wh.map((w) => w.ly + w.r));
    c.x = x - sa * -(lowest - 2); c.y = groundY - ca * (lowest - 2);
    c.vx = c.vy = 0; c.a = ang; c.w = 0;
    const s0 = this.spec.sRest - (this.spec.mass * GRAV * 0.5) / this.spec.k;
    for (const w of this.wh) {
      const ox = w.lx + w.dxl * s0, oy = w.ly + w.dyl * s0;
      w.x = c.x + ca * ox - sa * oy; w.y = c.y + sa * ox + ca * oy;
      w.vx = w.vy = 0; w.spin = 0; w.air = 0; w.cts.length = 0;
    }
    this.air = 0; this.crash = null; this.boost = 0; this.riderOn = true; this.lean = 0;
    this.gasT = this.brakeT = 0; this.gasStale = this.brakeStale = false; this.wasAir = false; this.pred = null; this.spinning = 0;
  }

  // world-space position of a chassis-local point
  toWorld(lx, ly, out) {
    const c = this.c, ca = Math.cos(c.a), sa = Math.sin(c.a);
    out[0] = c.x + ca * lx - sa * ly; out[1] = c.y + sa * lx + ca * ly;
    return out;
  }
  get speed() { return Math.hypot(this.c.vx, this.c.vy); }
  get grounded() { return this.air < 0.06; }

  step(dt, input, world) {
    const sp = this.spec, c = this.c, wh = this.wh;
    const gas = this.riderOn && input.gas, brake = this.riderOn && input.brake;
    this.events.length = 0;
    // --- gravity + wind
    const g = GRAV * dt;
    c.vy += g;
    for (const w of wh) w.vy += g;
    if (world.windAt) {
      const wa = world.windAt(c.x, c.y);
      if (wa) { c.vy -= wa * dt; for (const w of wh) w.vy -= wa * dt; }
    }
    const air = this.air > 0.06;
    // --- pedal hold timers: a pedal held since before take-off is "stale" and
    // does not spin the bike; releasing it (or pressing within REPRESS of take-off) arms it
    this.gasT = gas ? this.gasT + dt : 0;
    this.brakeT = brake ? this.brakeT + dt : 0;
    if (!gas) this.gasStale = false;
    if (!brake) this.brakeStale = false;
    if (air && !this.wasAir) {
      if (this.gasT > REPRESS) this.gasStale = true;
      if (this.brakeT > REPRESS) this.brakeStale = true;
      this.pred = null; this.predT = 0;
    }
    this.wasAir = air;
    const gasDir = gas && !this.gasStale, brakeDir = brake && !this.brakeStale;
    // --- lean (visual + rider head position)
    const leanT = !this.riderOn ? 0 : air ? (gasDir ? -1 : brakeDir ? 1 : 0) : (gas ? 0.35 : brake ? -0.5 : 0);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 9);
    // --- motor
    this.throttle = gas ? 1 : 0;
    const boostMul = this.boost > 0 ? 1.25 : 1;
    for (const w of wh) {
      if (!w.drive) {
        // front brake: strong, only slows the wheel (never reverses it)
        if (brake && w.spin > 0.5) { const tq = Math.min(sp.brake * 0.9, w.spin * w.Iw / dt); w.spin -= tq * w.iIw * dt; }
        else w.spin *= 1 - 0.15 * dt;
        continue;
      }
      let tq = 0;
      // traction control: a grounded wheel may only slip ~260 px/s ahead of the bike
      const fwd = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
      const wmax = Math.min(sp.vmax * boostMul, w.air > 0.05 ? 1e9 : Math.max(0, fwd) + 260) / w.r;
      if (gas) {
        if (w.spin < wmax) tq = sp.torque * (sp.pedal && w.spin > wmax * 0.6 ? 0.5 : 1) * (this.boost > 0 ? 1.5 : 1);
        if (w.spin + tq * w.iIw * dt > wmax) tq = Math.max(0, (wmax - w.spin) * w.Iw / dt);
      } else if (brake) {
        if (w.spin > 0.5) tq = -Math.min(sp.brake, w.spin * w.Iw / dt);
        else if (w.spin > -sp.rev / w.r) tq = -sp.torque * 0.6;
      } else {
        w.spin *= 1 - (sp.pedal ? 0.05 : 0.35) * dt;
      }
      if (tq) {
        w.spin += tq * w.iIw * dt;
        if (!air) c.w -= tq * sp.react * c.iI * dt;
      }
    }
    // rocket thrust
    if (sp.thrust && gas) {
      const ca = Math.cos(c.a), sa = Math.sin(c.a), a = sp.thrust * dt;
      c.vx += ca * a; c.vy += sa * a; for (const w of wh) { w.vx += ca * a; w.vy += sa * a; }
    }
    // boost push
    if (this.boost > 0) {
      this.boost -= dt;
      if (brake) this.boost = 0;
      else if (!air && gas) { const ca = Math.cos(c.a), sa = Math.sin(c.a), a = 500 * dt; c.vx += ca * a; c.vy += sa * a; for (const w of wh) { w.vx += ca * a; w.vy += sa * a; } }
    }
    // --- rotation control: in the air a FRESH gas press spins backward, a fresh
    // brake press spins forward; with nothing (fresh) pressed the bike levels
    // itself gently toward the slope it is going to land on
    const dir = gasDir ? -1 : brakeDir ? 1 : 0;
    this.spinning = air ? dir : 0;
    if (air) {
      let alpha;
      if (dir) alpha = clamp((dir * this.airMax - c.w) / dt, -this.airAcc, this.airAcc);
      else {
        this.predT -= dt;
        if (!this.pred || this.predT <= 0) { this.pred = predictLanding(world, c.x, c.y, c.vx, c.vy); this.predT = 0.05; }
        // aim a touch nose-up of the landing slope: rear wheel first is the safe landing
        const err = this.riderOn ? wrapAngle(this.pred.slope - 0.12 - c.a) : 0;
        const aw = Math.abs(c.w), kd = DAMP_SLOW + (DAMP_FAST - DAMP_SLOW) * clamp((aw - 1) / 2, 0, 1) + sp.airDamp;
        alpha = clamp(err * LEVEL_GAIN, -LEVEL_ACC, LEVEL_ACC) - c.w * kd;
      }
      this.spinSystem(alpha * dt);
    } else if ((gas || brake) && this.riderOn) {
      c.w += (gas ? -1 : 1) * sp.groundLean * dt;
    }
    // --- suspension springs (explicit) + geometry for the joint solve
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    for (const w of wh) {
      w.dx = ca * w.dxl - sa * w.dyl; w.dy = sa * w.dxl + ca * w.dyl;
      w.nx = -w.dy; w.ny = w.dx;
      const Ax = c.x + ca * w.lx - sa * w.ly, Ay = c.y + sa * w.lx + ca * w.ly;
      const rx = w.x - Ax, ry = w.y - Ay;
      w.s = rx * w.dx + ry * w.dy;
      w.lat = rx * w.nx + ry * w.ny;
      w.Px = Ax + w.dx * w.s; w.Py = Ay + w.dy * w.s;
      const prx = w.Px - c.x, pry = w.Py - c.y;
      const vPx = c.vx - c.w * pry, vPy = c.vy + c.w * prx;
      const sdot = (w.vx - vPx) * w.dx + (w.vy - vPy) * w.dy;
      const F = -sp.k * (w.s - sp.sRest) - sp.damp * sdot * (sdot > 0 ? 2.2 : 1); // stiffer rebound
      const J = F * dt;
      w.vx += J * w.dx * w.im; w.vy += J * w.dy * w.im;
      c.vx -= J * w.dx * c.im; c.vy -= J * w.dy * c.im;
      c.w -= (prx * w.dy - pry * w.dx) * J * c.iI;
      w.limJ = 0; w.bottomed = false;
      circleContacts(world, w.x, w.y, w.r, w.cts, 2);
    }
    // hull points
    const P = [0, 0];
    for (let i = 0; i < sp.hull.length; i++) {
      const h = sp.hull[i];
      this.toWorld(h.x, h.y, P);
      circleContacts(world, P[0], P[1], h.r, this.hullCts[i], 2);
    }
    // loop assist: track adhesion, a push along the track so a held throttle
    // always makes it round, and the chassis is steered onto the loop tangent
    // (a flat-to-circle junction at 1200 px/s otherwise kicks the nose up so
    // hard that the rear wheel lifts and the bike flies off the wall)
    let lnx = 0, lny = 0, ln = 0;
    for (const w of wh) for (const ct of w.cts) if (ct.seg.kind === 'loop') { lnx += ct.nx; lny += ct.ny; ln++; }
    if (ln) {
      lnx /= ln; lny /= ln;
      const stick = 2000 * dt, push = gas ? 800 * dt : 0;
      const ca2 = Math.cos(c.a), sa2 = Math.sin(c.a);
      const ax = -lnx * stick + ca2 * push, ay = -lny * stick + sa2 * push;
      c.vx += ax; c.vy += ay; for (const w of wh) { w.vx += ax; w.vy += ay; }
      const loop = world.terrain.loops.find((l) => c.x > l.x0 && c.x < l.x1);
      if (loop) {
        const dx = c.x - loop.cx, dy = c.y - loop.cy;
        const want = Math.atan2(-dx, dy);                 // tangent for the entry-right, exit-left direction
        const vt = (c.vx * dy - c.vy * dx) / loop.R;      // speed along that tangent
        const wT = -vt / loop.R;                          // matching angular velocity
        const alpha = clamp(wrapAngle(want - c.a) * 70 + (wT - c.w) * 9, -90, 90);
        this.spinSystem(alpha * dt);
      }
    }
    // landing impacts (pre-solve normal speed)
    for (const w of wh) {
      if (w.cts.length && w.air > 0.12) {
        const ct = w.cts[0];
        w.impact = -((w.vx) * ct.nx + (w.vy) * ct.ny);
        this.events.push({ t: 'touch', w, impact: w.impact, x: ct.px, y: ct.py, nx: ct.nx, ny: ct.ny, seg: ct.seg });
        // arcade clutch: a wheel that spun down in the air matches ground speed on
        // touchdown, so landing with the gas off never pitches you over the bars
        const tx = -ct.ny, ty = ct.nx;
        const vt = (w.vx * tx + w.vy * ty) / w.r;
        if (this.riderOn && w.spin < vt) w.spin = vt;
      }
    }
    // --- iterate constraints
    for (let it = 0; it < ITER; it++) {
      for (const w of wh) this.solveJoint(w, dt);
      for (const w of wh) for (const ct of w.cts) solveWheel(w, ct);
      for (let i = 0; i < this.hullCts.length; i++) for (const ct of this.hullCts[i]) solvePoint(c, ct, 0.35);
    }
    // --- integrate
    c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.w * dt;
    let anyGround = false;
    for (const w of wh) {
      w.x += w.vx * dt; w.y += w.vy * dt; w.rot += w.spin * dt;
      if (w.cts.length) {
        anyGround = true; w.air = 0;
        let best = w.cts[0];
        for (const ct of w.cts) { if (ct.pen > SLOP) { const p = (ct.pen - SLOP) * 0.8; w.x += ct.nx * p; w.y += ct.ny * p; } if (ct.pen > best.pen) best = ct; }
        w.surfN[0] = best.nx; w.surfN[1] = best.ny; w.lastSeg = best.seg;
        if (best.seg.owner && best.seg.owner.onTouch) best.seg.owner.onTouch(this);
      } else w.air += dt;
    }
    for (let i = 0; i < this.hullCts.length; i++) {
      for (const ct of this.hullCts[i]) {
        if (ct.pen > SLOP) { const p = (ct.pen - SLOP) * 0.6; c.x += ct.nx * p; c.y += ct.ny * p; }
        if (ct.slide > 120) this.events.push({ t: 'scrape', x: ct.px, y: ct.py, v: ct.slide, nx: ct.nx, ny: ct.ny });
        if (ct.seg.owner && ct.seg.owner.onTouch) ct.seg.owner.onTouch(this);
      }
    }
    // arcade take-off: the lip never flings the bike into a wild spin
    if (!anyGround && this.air === 0 && this.riderOn) { const lim = 2.4; if (c.w > lim || c.w < -lim) { const nw = Math.max(-lim, Math.min(lim, c.w)); this.spinSystem(nw - c.w); } }
    this.air = anyGround ? 0 : this.air + dt;
    // safety net: the ground is a heightfield, so a wheel that ends up under it is popped back on top
    for (const w of wh) {
      const sy = world.terrain.surfaceY(w.x);
      if (!isFinite(sy) || w.y < sy - w.r * 0.35 || w.y > sy + 70) continue;
      if (world.terrain.loops.some((l) => w.x > l.x0 && w.x < l.x1)) continue;
      w.y = sy - w.r * 0.95; if (w.vy > 0) w.vy = 0;
    }
    // --- rider: head / chest touching anything = bail
    if (this.riderOn) {
      riderPose(sp, this.lean, this.pose);
      const hp = this.toWorld(this.pose.head[0], this.pose.head[1], [0, 0]);
      const cts = [];
      if (circleContacts(world, hp[0], hp[1], HEAD_R - 2, cts, 1).length) this.crash = 'head';
      else {
        const n = this.pose.neck, p = this.pose.pel;
        const cp = this.toWorld((n[0] + p[0]) / 2, (n[1] + p[1]) / 2, [0, 0]);
        if (circleContacts(world, cp[0], cp[1], 8, cts, 1).length) this.crash = 'body';
      }
    }
  }

  // rigid angular kick of the whole bike about its combined centre of mass
  spinSystem(dw) {
    const c = this.c, wh = this.wh;
    let M = c.m, X = c.x * c.m, Y = c.y * c.m;
    for (const w of wh) { M += w.m; X += w.x * w.m; Y += w.y * w.m; }
    X /= M; Y /= M;
    c.w += dw; c.vx += -dw * (c.y - Y); c.vy += dw * (c.x - X);
    for (const w of wh) { w.vx += -dw * (w.y - Y); w.vy += dw * (w.x - X); }
  }

  solveJoint(w, dt) {
    const c = this.c, sp = this.spec;
    const prx = w.Px - c.x, pry = w.Py - c.y;
    // lateral: wheel stays on its slider line
    let vPx = c.vx - c.w * pry, vPy = c.vy + c.w * prx;
    const cd = (w.vx - vPx) * w.nx + (w.vy - vPy) * w.ny;
    const rn = prx * w.ny - pry * w.nx;
    const K = w.im + c.im + rn * rn * c.iI;
    const lam = -(cd + 0.25 * w.lat / dt) / K;
    w.vx += lam * w.nx * w.im; w.vy += lam * w.ny * w.im;
    c.vx -= lam * w.nx * c.im; c.vy -= lam * w.ny * c.im; c.w -= rn * lam * c.iI;
    // travel limits
    let err = 0, sign = 0;
    if (w.s < sp.sMin) { err = w.s - sp.sMin; sign = 1; } else if (w.s > sp.sMax) { err = w.s - sp.sMax; sign = -1; }
    if (!sign) return;
    vPx = c.vx - c.w * pry; vPy = c.vy + c.w * prx;
    const sd = (w.vx - vPx) * w.dx + (w.vy - vPy) * w.dy;
    const rd = prx * w.dy - pry * w.dx;
    const Kd = w.im + c.im + rd * rd * c.iI;
    let j = -(sd + 0.3 * err / dt) / Kd;
    const old = w.limJ;
    w.limJ = sign > 0 ? Math.max(0, old + j) : Math.min(0, old + j);
    j = w.limJ - old;
    if (sign > 0 && j > 0 && !w.bottomed) { w.bottomed = true; this.events.push({ t: 'bottom', w }); }
    w.vx += j * w.dx * w.im; w.vy += j * w.dy * w.im;
    c.vx -= j * w.dx * c.im; c.vy -= j * w.dy * c.im; c.w -= rd * j * c.iI;
  }

  // world-space rider joints (for drawing and for spawning the ragdoll)
  riderWorld() {
    riderPose(this.spec, this.lean, this.pose);
    const o = {};
    for (const k in this.pose) o[k] = this.toWorld(this.pose[k][0], this.pose[k][1], [0, 0]);
    return o;
  }
  velAt(x, y) { const c = this.c; return [c.vx - c.w * (y - c.y), c.vy + c.w * (x - c.x)]; }
}

// ---------------------------------------------------------------- ragdoll
// particles: 0 head, 1 neck, 2 pelvis, 3 elbowF, 4 handF, 5 elbowB, 6 handB, 7 kneeF, 8 footF, 9 kneeB, 10 footB
const BONES = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10]];
const RAD = [HEAD_R - 1, 7, 9, 5, 5, 5, 5, 6, 6, 6, 6];
export class Ragdoll {
  constructor(bike) {
    const J = bike.riderWorld();
    const src = [J.head, J.neck, J.pel, J.elbow, J.hand, J.elbow, J.hand, J.knee, J.foot, J.knee, J.foot];
    const off = [0, 0, 0, 2, 2, -2, -2, 2, 2, -2, -2];
    this.p = src.map((q, i) => {
      const v = bike.velAt(q[0], q[1]);
      const x = q[0] + off[i] * 0.5, y = q[1];
      return { x, y, px: x - v[0] * DT, py: y - v[1] * DT, r: RAD[i], ground: false };
    });
    this.b = BONES.map(([i, j]) => [i, j, Math.max(4, Math.hypot(this.p[i].x - this.p[j].x, this.p[i].y - this.p[j].y))]);
    // soft limits so he doesn't fold into a noodle
    this.minD = [[0, 2, 0.8], [2, 8, 0.55], [2, 10, 0.55], [1, 4, 0.4], [1, 6, 0.4], [0, 4, 0.5], [0, 6, 0.5]].map(([i, j, f]) => {
      const L = Math.hypot(this.p[i].x - this.p[j].x, this.p[i].y - this.p[j].y);
      return [i, j, L * f];
    });
    this.cts = [];
    this.airTime = 0; this.bestAir = 0; this.slide = 0; this.bounces = 0; this.maxSpeed = 0;
    this.t = 0;
    this.impacts = [];
  }
  kick(vx, vy, spin = 0) {
    const c = this.center();
    for (const q of this.p) {
      const rx = q.x - c[0], ry = q.y - c[1];
      q.px -= (vx - spin * ry) * DT; q.py -= (vy + spin * rx) * DT;
    }
  }
  center() { const p = this.p[2]; return [p.x, p.y]; }
  step(dt, world) {
    this.t += dt;
    this.impacts.length = 0;
    const g = GRAV * dt * dt;
    let anyGround = false;
    for (const q of this.p) {
      let vx = (q.x - q.px) * 0.999, vy = (q.y - q.py) * 0.999;
      const wa = world.windAt ? world.windAt(q.x, q.y) : 0;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy + g - wa * dt * dt;
    }
    for (let it = 0; it < 6; it++) {
      // spine is stiff, the neck and the limbs are soft so arms and legs flail
      for (let bi = 0; bi < this.b.length; bi++) { const [i, j, L] = this.b[bi]; dist(this.p[i], this.p[j], L, bi === 1 ? 1 : 0.6); }
      for (const [i, j, L] of this.minD) { const a = this.p[i], b = this.p[j]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < L) dist(a, b, L, 0.5); }
    }
    for (let k = 0; k < this.p.length; k++) {
      const q = this.p[k];
      q.ground = false;
      circleContacts(world, q.x, q.y, q.r, this.cts, 2);
      for (const ct of this.cts) {
        q.ground = true; anyGround = true;
        let vx = q.x - q.px, vy = q.y - q.py;
        const vn = vx * ct.nx + vy * ct.ny;
        q.x += ct.nx * ct.pen; q.y += ct.ny * ct.pen;
        if (vn < 0) {
          const tx = -ct.ny, ty = ct.nx;
          let vt = vx * tx + vy * ty;
          // helmet and pelvis skid (low friction, bouncy) so a fast crash slides and tumbles; limbs drag
          const e = k === 0 ? 0.45 : k === 2 ? 0.35 : 0.25;
          const fr = (k <= 2 ? 0.035 : 0.09) * ct.seg.mu;
          vt *= 1 - Math.min(1, fr);
          const nvn = -vn * e;
          if (-vn > 6) this.impacts.push({ k, v: -vn / dt, x: ct.px, y: ct.py });
          vx = tx * vt + ct.nx * nvn; vy = ty * vt + ct.ny * nvn;
          q.px = q.x - vx; q.py = q.y - vy;
        }
      }
    }
    const p = this.p[2];
    const sp = Math.hypot(p.x - p.px, p.y - p.py) / dt;
    this.maxSpeed = Math.max(this.maxSpeed, sp);
    if (anyGround) { this.airTime = 0; if (this.p[2].ground || this.p[1].ground) this.slide += sp * dt * (sp > 60 ? 1 : 0); }
    else { this.airTime += dt; this.bestAir = Math.max(this.bestAir, this.airTime); }
  }
}
function dist(a, b, L, stiff) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
  const k = ((d - L) / d) * 0.5 * stiff;
  a.x += dx * k; a.y += dy * k; b.x -= dx * k; b.y -= dy * k;
}

// ---------------------------------------------------------------- boulder
export class Roller {
  constructor(x, y, r, density = 1) {
    const m = (r * r) / 400 * 1.6 * density;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = r; this.m = m; this.im = 1 / m;
    this.Iw = m * r * r * 0.5; this.iIw = 1 / this.Iw; this.spin = 0; this.rot = 0; this.grip = 1;
    this.cts = []; this.air = 0; this.impact = 0;
    this.owner = { cx: x, cy: y, vx: 0, vy: 0, w: 0, im: this.im, iI: 0, boulder: this };
    this.seg = { off: false, gate: null, mu: 0.9, conv: 0, tx: 1, ty: 0, owner: this.owner, kind: 'boulder' };
  }
  step(dt, world) {
    // pick up impulses the bike/ragdoll gave us through our owner proxy
    if (this.owner.touched) { this.vx = this.owner.vx; this.vy = this.owner.vy; this.owner.touched = false; }
    this.vy += GRAV * dt;
    circleContacts(world, this.x, this.y, this.r, this.cts, 2, this);
    this.impact = 0;
    if (this.cts.length && this.air > 0.15) this.impact = -(this.vx * this.cts[0].nx + this.vy * this.cts[0].ny);
    for (let it = 0; it < 6; it++) for (const ct of this.cts) solveWheel(this, ct);
    this.x += this.vx * dt; this.y += this.vy * dt; this.rot += this.spin * dt;
    if (this.cts.length) { this.air = 0; for (const ct of this.cts) if (ct.pen > SLOP) { this.x += ct.nx * (ct.pen - SLOP) * 0.8; this.y += ct.ny * (ct.pen - SLOP) * 0.8; } }
    else this.air += dt;
  }
}
