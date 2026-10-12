// Car + ball simulation. Fixed step (240 Hz). Pure data, no drawing, no sound:
// everything noteworthy is pushed onto world.events for fx/audio/stats to consume.
import { rand } from './rng.js';
import { W, H, GH, BALL_R, sdf, grad } from './arena.js';

export const L = 68, HH = 21, RIDE = 38, WHEEL_R = 17;
export const G_CAR = 1750, G_BALL = 1300;
export const MAX_DRIVE = 1150, MAX_SPEED = 2300, SUPERSONIC = 1800, BALL_MAX = 3600;
const BOOST_ACC = 2100, DRIVE_ACC = 1800, BRAKE = 3800, COAST = 600, REVERSE_MAX = 700;
const JUMP_V = 650, JUMP_HOLD_ACC = 1500, JUMP_HOLD_T = 0.18, DJUMP_V = 580, FLIP_V = 760, FLIP_T = 0.45;
const M_CAR = 1, M_BALL = 0.42, I_CAR = (L * L + HH * HH) / 3;
export const BOOST_USE = 33, STEP = 1 / 240;
const N = { x: 0, y: 0 }, N2 = { x: 0, y: 0 };

export function makeCar(team, id) {
  return {
    id, team, x: 0, y: RIDE, vx: 0, vy: 0, a: 0, av: 0, dir: team === 0 ? 1 : -1,
    grounded: true, nx: 0, ny: 1, boost: 33, boosting: false, jumpPrev: false,
    jumpCD: 0, jumpHold: 0, jnx: 0, jny: 1, flipAvail: false, flipWin: 0, flipping: 0,
    demo: 0, roofT: 0, turnT: 0, wheel: 0, hitCD: 0, airT: 0, supersonic: false, landT: 0,
  };
}
export function makeBall() { return { x: 0, y: BALL_R, vx: 0, vy: 0, rot: 0, spin: 0, touchT: 0 }; }
export function makeWorld() {
  return { t: 0, ball: makeBall(), cars: [makeCar(0, 0), makeCar(1, 1)], events: [], lastTouch: -1, touchHist: [] };
}

export function kickoff(w) {
  const b = w.ball;
  b.x = 0; b.y = BALL_R; b.vx = b.vy = 0; b.spin = 0;
  w.cars.forEach((c) => {
    const s = c.team === 0 ? -1 : 1;
    Object.assign(c, makeCar(c.team, c.id));
    c.x = s * 720; c.y = RIDE; c.boost = 40;
  });
  w.lastTouch = -1;
}

function respawn(c) {
  const s = c.team === 0 ? -1 : 1;
  Object.assign(c, makeCar(c.team, c.id));
  c.x = s * (W / 2 - 260); c.y = RIDE + 10; c.boost = 40;
}

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function updateCar(c, inp, dt, w) {
  if (c.demo > 0) {
    c.demo -= dt;
    if (c.demo <= 0) { respawn(c); w.events.push({ type: 'respawn', car: c }); }
    return;
  }
  const sx = inp.x || 0, sy = inp.y || 0, mag = Math.hypot(sx, sy);
  const jumpPressed = inp.jump && !c.jumpPrev;
  c.jumpPrev = !!inp.jump;
  c.jumpCD -= dt; c.hitCD -= dt; c.turnT -= dt; c.landT -= dt;
  let ca = Math.cos(c.a), sa = Math.sin(c.a);
  const d = sdf(c.x, c.y);
  grad(c.x, c.y, N);
  const align = -sa * N.x + ca * N.y;
  const wasGrounded = c.grounded;
  c.grounded = c.jumpCD <= 0 && d < RIDE + 9 && align > 0.5;
  if (c.grounded) {
    const vnIn = c.vx * N.x + c.vy * N.y;
    if (!wasGrounded) { w.events.push({ type: 'land', car: c, power: -vnIn }); c.landT = 0.15; }
    c.nx = N.x; c.ny = N.y; c.flipAvail = false; c.flipping = 0; c.airT = 0; c.roofT = 0;
    const target = Math.atan2(N.y, N.x) - Math.PI / 2;
    c.a = c.a + wrap(target - c.a) * Math.min(1, 40 * dt);
    c.av = 0;
    ca = Math.cos(c.a); sa = Math.sin(c.a);
    c.x += N.x * (RIDE - d); c.y += N.y * (RIDE - d);
    const nosex = c.dir * ca, nosey = c.dir * sa;
    // throttle: horizontal input means "keep driving the way you face"; else project the stick
    let thr = Math.abs(sx) > 0.3 ? sx * c.dir : (mag > 0.3 ? (sx * nosex + sy * nosey) / mag : 0);
    let vt = c.vx * nosex + c.vy * nosey;
    const floor = N.y > 0.7;
    if (floor && thr < -0.3 && vt < 260 && c.turnT <= 0) {
      // quick turn-around on the floor
      c.dir = -c.dir; c.turnT = 0.22; thr = -thr;
      const keep = -vt * 0.3; c.vx = c.dir * ca * keep; c.vy = c.dir * sa * keep;
      w.events.push({ type: 'turn', car: c });
      vt = keep;
    }
    const fx = c.dir * ca, fy = c.dir * sa;
    let acc = 0;
    if (thr > 0.05) acc = vt < -10 ? BRAKE : vt < MAX_DRIVE ? DRIVE_ACC * thr * (1 - 0.55 * Math.max(0, vt) / MAX_DRIVE) : 0;
    else if (thr < -0.05) acc = vt > 10 ? -BRAKE : vt > -REVERSE_MAX ? -DRIVE_ACC * 0.7 * -thr : 0;
    else if (floor) acc = vt > 0 ? -Math.min(COAST, vt / dt) : Math.min(COAST, -vt / dt);
    c.vx += fx * acc * dt; c.vy += fy * acc * dt;
    c.vy -= G_CAR * dt * (floor ? 1 : 0.35);   // sticky wheels: walls and ceiling are drivable
    const tang = Math.abs(c.vx * N.y - c.vy * N.x);
    const fallOff = (N.y < -0.3 && tang < 320) || (N.y < 0.6 && tang < 140 && Math.abs(thr) < 0.1);
    if (!fallOff) {
      const vn = c.vx * N.x + c.vy * N.y;
      c.vx -= vn * N.x; c.vy -= vn * N.y;
    } else { c.grounded = false; c.jumpCD = 0.15; }
    c.wheel += (c.vx * fx + c.vy * fy) * dt / WHEEL_R;
    if (jumpPressed && c.grounded) {
      c.vx += N.x * JUMP_V; c.vy += N.y * JUMP_V;
      c.jnx = N.x; c.jny = N.y; c.jumpHold = JUMP_HOLD_T;
      c.grounded = false; c.jumpCD = 0.12; c.flipAvail = true; c.flipWin = 1.5;
      w.events.push({ type: 'jump', car: c });
    }
  } else {
    c.airT += dt;
    c.vy -= G_CAR * dt;
    if (c.jumpHold > 0 && inp.jump) { c.vx += c.jnx * JUMP_HOLD_ACC * dt; c.vy += c.jny * JUMP_HOLD_ACC * dt; c.jumpHold -= dt; }
    else c.jumpHold = 0;
    c.flipWin -= dt;
    if (c.flipWin <= 0) c.flipAvail = false;
    if (jumpPressed) {
      if (c.roofT > 0.05) {
        c.vy += 520; c.av = wrap(c.a) > 0 ? -11 : 11; c.roofT = 0; c.flipAvail = false;
        w.events.push({ type: 'jump', car: c });
      } else if (c.flipAvail) {
        c.flipAvail = false; c.jumpHold = 0;
        if (Math.abs(sx) > 0.35) {
          const fd = Math.sign(sx);
          c.vx += fd * FLIP_V;
          if (Math.sign(c.vx) !== fd) c.vx = fd * FLIP_V * 0.6;
          c.vy = c.vy * 0.25 + 120;
          c.flipping = FLIP_T; c.av = -fd * (2 * Math.PI / FLIP_T);
          w.events.push({ type: 'flip', car: c, dir: fd });
        } else {
          c.vx += -sa * DJUMP_V; c.vy += ca * DJUMP_V;
          w.events.push({ type: 'djump', car: c });
        }
      }
    }
    if (c.flipping > 0) {
      c.flipping -= dt;
      if (c.flipping <= 0) c.av *= 0.12;
    } else if (mag > 0.25) {
      const at = Math.atan2(c.dir * sy, c.dir * sx);
      const diff = wrap(at - c.a);
      const want = Math.max(-7.5, Math.min(7.5, diff * 10));
      c.av += (want - c.av) * Math.min(1, 14 * dt);
    } else {
      c.av *= 1 - Math.min(1, 3 * dt);
      // gentle landing assist when no stick input and falling near the floor
      if (c.vy < 0 && c.y < 360 && c.y > 60) c.av += wrap(-c.a) * 6 * dt;
    }
    c.a = wrap(c.a + c.av * dt);
    c.wheel += 2 * dt;
  }
  // boost
  ca = Math.cos(c.a); sa = Math.sin(c.a);
  const was = c.boosting;
  c.boosting = !!inp.boost && c.boost > 0;
  if (c.boosting) {
    c.vx += c.dir * ca * BOOST_ACC * dt; c.vy += c.dir * sa * BOOST_ACC * dt;
    c.boost = Math.max(0, c.boost - BOOST_USE * dt);
  } else c.boost = Math.min(100, c.boost + (c.grounded ? 9 : 4) * dt);
  if (c.boosting && !was) w.events.push({ type: 'boost', car: c });
  let sp = Math.hypot(c.vx, c.vy);
  if (sp > MAX_SPEED) { c.vx *= MAX_SPEED / sp; c.vy *= MAX_SPEED / sp; sp = MAX_SPEED; }
  const sup = c.supersonic ? sp > SUPERSONIC - 100 : sp > SUPERSONIC;
  if (sup && !c.supersonic) w.events.push({ type: 'super', car: c });
  c.supersonic = sup;
  c.x += c.vx * dt; c.y += c.vy * dt;
  carWalls(c, dt, w);
}

// corner probes against the arena
const PROBES = [[L, -HH], [-L, -HH], [L, HH], [-L, HH], [0, HH + 4], [L * 0.5, HH + 2], [-L * 0.5, HH + 2]];
function carWalls(c, dt, w) {
  let roof = false, hard = 0;
  for (let it = 0; it < 2; it++) {
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    for (let k = 0; k < PROBES.length; k++) {
      const lx = PROBES[k][0] * c.dir, ly = PROBES[k][1];
      const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
      const px = c.x + rx, py = c.y + ry;
      const d = sdf(px, py);
      if (d >= 0) continue;
      grad(px, py, N2);
      c.x -= N2.x * d; c.y -= N2.y * d;
      const vpx = c.vx - c.av * ry, vpy = c.vy + c.av * rx;
      const vn = vpx * N2.x + vpy * N2.y;
      if (k >= 2) roof = roof || (ly > 0 && (-sa * N2.x + ca * N2.y) < -0.3);
      if (vn < 0) {
        const rn = rx * N2.y - ry * N2.x;
        const j = -(1.15) * vn / (1 / M_CAR + rn * rn / I_CAR);
        c.vx += N2.x * j / M_CAR; c.vy += N2.y * j / M_CAR;
        c.av += rn * j / I_CAR;
        // friction along the surface
        const tx = -N2.y, ty = N2.x, vt = c.vx * tx + c.vy * ty;
        const fr = Math.sign(vt) * Math.min(Math.abs(vt), 0.25 * j);
        c.vx -= tx * fr; c.vy -= ty * fr;
        if (-vn > hard) hard = -vn;
      }
    }
  }
  if (hard > 500 && !c.grounded) w.events.push({ type: 'scrape', car: c, power: hard });
  c.av = Math.max(-14, Math.min(14, c.av));
  if (roof && !c.grounded) {
    c.roofT += dt;
    if (c.roofT > 0.75) { c.vy += 480; c.av = wrap(c.a) > 0 ? -10 : 10; c.roofT = 0; w.events.push({ type: 'jump', car: c }); }
  } else if (!roof) c.roofT = 0;
}

export function updateBall(b, dt, w) {
  b.vy -= G_BALL * dt;
  const dr = 1 - 0.2 * dt;
  b.vx *= dr; b.vy *= dr;
  b.x += b.vx * dt; b.y += b.vy * dt;
  const d = sdf(b.x, b.y);
  if (d < BALL_R) {
    grad(b.x, b.y, N);
    b.x += N.x * (BALL_R - d); b.y += N.y * (BALL_R - d);
    const vn = b.vx * N.x + b.vy * N.y;
    if (vn < 0) {
      const e = vn < -260 ? 0.56 : 0.15;
      b.vx -= (1 + e) * vn * N.x; b.vy -= (1 + e) * vn * N.y;
      const tx = N.y, ty = -N.x;
      const vt = b.vx * tx + b.vy * ty;
      const f = vn < -260 ? 0.85 : 1 - 0.6 * dt;
      b.vx -= tx * vt * (1 - f); b.vy -= ty * vt * (1 - f);
      b.spin = -(vt * f) / BALL_R;
      if (w && vn < -300) w.events.push({ type: 'bounce', x: b.x - N.x * BALL_R, y: b.y - N.y * BALL_R, nx: N.x, ny: N.y, power: -vn });
    }
  } else b.spin *= 1 - 0.2 * dt;
  b.rot += b.spin * dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > BALL_MAX) { b.vx *= BALL_MAX / sp; b.vy *= BALL_MAX / sp; }
}

function carBall(c, b, w) {
  if (c.demo > 0) return;
  const ca = Math.cos(c.a), sa = Math.sin(c.a);
  const dx = b.x - c.x, dy = b.y - c.y;
  const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
  const hx = L + 2, hy = HH + 6;
  const cx = Math.max(-hx, Math.min(hx, lx)), cy = Math.max(-hy, Math.min(hy, ly));
  let ox = lx - cx, oy = ly - cy;
  let dist = Math.hypot(ox, oy);
  if (dist >= BALL_R) return;
  if (dist < 1e-3) { ox = lx; oy = ly; dist = Math.hypot(ox, oy) || 1; }
  let nlx = ox / dist, nly = oy / dist;
  if (lx === cx && ly === cy) { nlx = lx / dist; nly = ly / dist; }
  const nx = nlx * ca - nly * sa, ny = nlx * sa + nly * ca;
  const pen = BALL_R - dist;
  const tm = M_CAR + M_BALL;
  b.x += nx * pen * (M_CAR / tm); b.y += ny * pen * (M_CAR / tm);
  c.x -= nx * pen * (M_BALL / tm); c.y -= ny * pen * (M_BALL / tm);
  const px = cx * ca - cy * sa, py = cx * sa + cy * ca; // contact rel. to car centre
  const cvx = c.vx - c.av * py, cvy = c.vy + c.av * px;
  const vn = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
  if (vn >= 0) return;
  const e = 0.55;
  const j = -(1 + e) * vn / (1 / M_BALL + 1 / M_CAR);
  b.vx += nx * j / M_BALL; b.vy += ny * j / M_BALL;
  c.vx -= nx * j / M_CAR * 0.6; c.vy -= ny * j / M_CAR * 0.6;
  // the arcade "power hit" on top of the physics: a touch always sends the ball
  const push = Math.max(0, cvx * nx + cvy * ny);           // how hard the CAR drives into the ball
  const extra = Math.min(push, 2400) * 0.5 + Math.min(-vn, 4000) * 0.08 + 90;
  const ey = ny * 0.6 + 0.06;
  const el = Math.hypot(nx, ey) || 1;
  b.vx += (nx / el) * extra; b.vy += (ey / el) * extra;
  b.spin += (c.av * 0.3) - (nx * c.vy - ny * c.vx) / BALL_R * 0.2;
  const power = -vn;
  if (c.hitCD <= 0 || power > 400) {
    w.events.push({ type: 'hit', car: c, power, x: b.x - nx * BALL_R, y: b.y - ny * BALL_R, nx, ny, flip: c.flipping > 0, air: !c.grounded && c.y > 260 });
  }
  c.hitCD = 0.12;
  w.lastTouch = c.team;
  w.touchHist.push({ t: w.t, team: c.team, id: c.id, air: !c.grounded && c.y > 240 });
  if (w.touchHist.length > 8) w.touchHist.shift();
}

function carCar(a, b, w) {
  if (a.demo > 0 || b.demo > 0) return;
  const ca1 = Math.cos(a.a), sa1 = Math.sin(a.a), ca2 = Math.cos(b.a), sa2 = Math.sin(b.a);
  const R = 25, offs = [-L * 0.6, 0, L * 0.6];
  let best = null;
  for (const o1 of offs) {
    const x1 = a.x + ca1 * o1, y1 = a.y + sa1 * o1;
    for (const o2 of offs) {
      const x2 = b.x + ca2 * o2, y2 = b.y + sa2 * o2;
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      if (d < 2 * R && (!best || d < best.d)) best = { d, dx, dy };
    }
  }
  if (!best) return;
  const d = best.d || 1, nx = best.dx / d, ny = best.dy / d, pen = 2 * R - d;
  a.x -= nx * pen / 2; a.y -= ny * pen / 2; b.x += nx * pen / 2; b.y += ny * pen / 2;
  const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
  const rel = va - vb;
  if (rel <= 0) return;
  // demolition: a supersonic car driving into the other
  if (a.team !== b.team) {
    if (a.supersonic && va > 900 && va > vb + 600) { demolish(b, a, w); return; }
    if (b.supersonic && -vb > 900 && -vb > -va + 600) { demolish(a, b, w); return; }
  }
  const j = rel * 0.5 * 1.35 + 120;
  a.vx -= nx * j; a.vy -= ny * j; b.vx += nx * j; b.vy += ny * j;
  if (!a.grounded) a.av += (rand() - 0.5) * 6;
  if (!b.grounded) b.av += (rand() - 0.5) * 6;
  if (rel > 250) w.events.push({ type: 'bump', a, b, power: rel, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}

function demolish(victim, by, w) {
  w.events.push({ type: 'demo', car: victim, by, x: victim.x, y: victim.y, vx: victim.vx, vy: victim.vy });
  victim.demo = 2.2; victim.boosting = false;
  victim.x = -9999; victim.y = 500; victim.vx = victim.vy = 0;
}

// one fixed step. inputs: array of {x,y,jump,boost} per car
export function step(w, inputs, dt = STEP) {
  w.t += dt;
  for (let i = 0; i < w.cars.length; i++) updateCar(w.cars[i], inputs[i] || {}, dt, w);
  if (!w.ball.hidden) {
    updateBall(w.ball, dt, w);
    for (const c of w.cars) carBall(c, w.ball, w);
  }
  { const b = w.ball, sp = Math.hypot(b.vx, b.vy); if (sp > BALL_MAX) { b.vx *= BALL_MAX / sp; b.vy *= BALL_MAX / sp; } }
  for (let i = 0; i < w.cars.length; i++) for (let k = i + 1; k < w.cars.length; k++) carCar(w.cars[i], w.cars[k], w);
  const b = w.ball;
  if (b.hidden) return -1;
  if (b.x - BALL_R * 0.98 > W / 2) return 0;        // blue (team 0) scores in the right goal
  if (b.x + BALL_R * 0.98 < -W / 2) return 1;       // orange scores in the left goal
  return -1;
}

// ball-only prediction: Float32Array of [x,y,vx,vy] every dtp seconds
export function predictBall(b, steps, dtp = 1 / 60) {
  const out = new Float32Array(steps * 4);
  const p = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, rot: 0, spin: 0 };
  const sub = 2, h = dtp / sub;
  for (let i = 0; i < steps; i++) {
    for (let s = 0; s < sub; s++) updateBall(p, h, null);
    out[i * 4] = p.x; out[i * 4 + 1] = p.y; out[i * 4 + 2] = p.vx; out[i * 4 + 3] = p.vy;
  }
  return out;
}

// which goal (0 = left/blue's, 1 = right/orange's) the ball reaches within the horizon, or -1
export function predictGoal(b, seconds = 2.5) {
  const n = Math.round(seconds * 60), pr = predictBall(b, n);
  for (let i = 0; i < n; i++) {
    const x = pr[i * 4];
    if (x - BALL_R > W / 2) return { side: 1, t: i / 60 };
    if (x + BALL_R < -W / 2) return { side: 0, t: i / 60 };
  }
  return null;
}

export { GH, H, W };
