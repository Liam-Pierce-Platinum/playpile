// CURVEBALL physics. Pure and deterministic: the game, the keeper AI and the
// headless bot all run the same step function, so __G.simulate(shot) predicts
// exactly what the real kick will do.
//
// World axes: goal line is z = 0, goal mouth x in [-GW, GW], y in [0, GH].
// The ball starts at z > 0 and travels toward -z. Screen right = +x.

export const R = 0.11;          // ball radius
export const GW = 3.66;         // half goal width
export const GH = 2.44;         // goal height
export const POST_R = 0.06;
export const NET_D = 2.0;       // net depth
export const G = 9.81;
export const DRAG = 0.0075;     // quadratic drag coefficient
export const DT = 1 / 240;
export const WALL_DIST = 9.15;
export const KEEPER_Z = 0.45;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => 1 - (1 - u) * (1 - u) * (1 - u);

// tiny deterministic hash rng
export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
}

// ---------------------------------------------------------------- setup
// setup = { ball:[x,z], wall:n, wallMove:{amp,speed}|null, keeper:skill|null,
//           keeperMove:amp|0, targets:[{x,y,r,pts}], wind:[wx,wz] }
export function makeWorld(setup, preT = 0) {
  const [bx, bz] = setup.ball;
  const w = {
    setup,
    t: 0, preT,                 // preT = idle clock before the kick (moving walls)
    kicked: false,
    ball: { p: [bx, R, bz], v: [0, 0, 0], curl: 0, v0: 1, spin: [0, 0, 0] },
    start: [bx, R, bz],
    wind: setup.wind || [0, 0],
    wall: [], wallJump: 0, wallOff: 0,
    keeper: null,
    result: null,              // 'goal' | 'saved' | 'blocked' | 'miss' | 'short'
    crossed: null,             // [x, y] where the ball crossed the goal plane
    inGoal: false, goalT: 0,
    touchedKeeper: false, touchedWall: false, hitPost: 0, underWall: false,
    passedWall: false,
    netHit: null,              // {x,y,s} for the net bulge visual
    events: [],                // [{type, ...}] drained by the renderer for sound/fx
    done: false, doneT: 0,
    maxH: 0,
  };
  // wall: defenders stand 9.15 m from the ball, centred on the line to the near-post half
  const n = setup.wall || 0;
  if (n > 0) {
    const nearX = Math.abs(bx) < 1.5 ? 0 : Math.sign(bx) * 1.6;
    const aim = [nearX - bx, -bz];
    const L = Math.hypot(aim[0], aim[1]);
    const d = [aim[0] / L, aim[1] / L];
    const cx = bx + d[0] * WALL_DIST, cz = bz + d[1] * WALL_DIST;
    const perp = [-d[1], d[0]];
    w.wallDir = d; w.wallPerp = perp;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 0.56;
      w.wall.push({ bx: cx + perp[0] * o, bz: cz + perp[1] * o, x: 0, z: 0, y: 0 });
    }
    w.wallCenter = [cx, cz];
  }
  if (setup.keeper != null) {
    const s = setup.keeper;
    const home = n > 0 ? clamp(-Math.sign(bx || 0.001) * 0.7, -1, 1) : clamp(bx * 0.06, -0.8, 0.8);
    w.keeper = {
      skill: s,
      home, x: home, z: KEEPER_Z,
      react: 0.42 - 0.2 * s,         // seconds before he moves
      lungeMax: 0.4 + 0.6 * s,      // metres of sideways launch
      diveDur: 0.7 - 0.25 * s,
      reach: 2.0 + 0.15 * s,          // feet-to-glove length
      noise: (1 - s) * 0.9,
      adjust: 1.0 + 3.2 * s,           // how fast he corrects a mid-dive misread
      reads: 0, readT: 0,
      move: setup.keeperMove || 0,
      phase: 'set',                   // set -> dive
      theta: 0, lunge: 0, jump: 0, aimTheta: 0, aimLunge: 0, aimJump: 0, diveT: 0,
      side: 0,
    };
  }
  placeIdle(w);
  return w;
}

// positions of moving walls / keeper sway before the kick
function placeIdle(w) {
  const s = w.setup, T = w.preT;
  let off = 0;
  if (s.wallMove) off = Math.sin(T * s.wallMove.speed) * s.wallMove.amp;
  w.wallOff = off;
  for (const d of w.wall) {
    d.x = d.bx + (w.wallPerp ? w.wallPerp[0] * off : 0);
    d.z = d.bz + (w.wallPerp ? w.wallPerp[1] * off : 0);
    d.y = 0;
  }
  const k = w.keeper;
  if (k) {
    const sway = Math.sin(T * 1.7) * 0.18 + (k.move ? Math.sin(T * 1.1 + 1) * k.move : 0);
    k.x = clamp(k.home + sway, -GW + 0.6, GW - 0.6);
  }
}

export function idle(w, dt) { w.preT += dt; placeIdle(w); }

// ---------------------------------------------------------------- the kick
// shot = { tx, ty, speed, bend }  -> launch velocity + curl, aimed so that with no
// wind and no obstacles the ball crosses z = 0 at (tx, ty) after bulging `bend`
// metres to the right of the straight line (negative = left).
export function solve(start, shot) {
  const [sx, sy, sz] = start;
  const dist = Math.hypot(shot.tx - sx, sz);
  const speed = clamp(shot.speed, 8, 40);
  const T = dist / (speed * 0.93);
  const curl = -8 * (shot.bend || 0) / (T * T);   // lateral accel, + = toward the right of travel
  let yaw = Math.atan2(shot.tx - sx, sz);
  // ballistic guess for pitch
  let pitch = Math.atan2((shot.ty - sy) + 0.5 * G * T * T, dist);
  pitch = clamp(pitch, -0.2, 0.75);
  // curl pre-bias: a ball that curls left must start right
  yaw -= curl * T * 0.5 / speed;
  for (let it = 0; it < 10; it++) {
    const v = launchVel(speed, yaw, pitch);
    const c = flight(start, v, curl, speed);
    if (!c) { pitch = clamp(pitch + 0.08, -0.2, 0.75); continue; }
    const ex = shot.tx - c[0], ey = shot.ty - c[1];
    yaw += Math.atan2(ex, dist) * 1.0;
    pitch = clamp(pitch + Math.atan2(ey, dist) * 1.1, -0.2, 0.75);
    if (Math.abs(ex) < 0.01 && Math.abs(ey) < 0.01) break;
  }
  return { v: launchVel(speed, yaw, pitch), curl, v0: speed };
}

function launchVel(s, yaw, pitch) {
  return [s * Math.sin(yaw) * Math.cos(pitch), s * Math.sin(pitch), -s * Math.cos(yaw) * Math.cos(pitch)];
}

// lean flight to the goal plane (no wind, no collisions): returns [x,y] or null
function flight(start, v0, curl, s0, plane = 0, dt = DT) {
  const p = start.slice(), v = v0.slice();
  for (let i = 0; i < 2400; i++) {
    const pz = p[2];
    accel(p, v, curl, s0, null, dt);
    if (pz > plane && p[2] <= plane) return [p[0], p[1]];
    if (p[1] < -1 || v[2] > 0) return null;
  }
  return null;
}

const _a = [0, 0, 0];
function accel(p, v, curl, s0, wind, dt) {
  const sp = Math.hypot(v[0], v[1], v[2]);
  const vh = Math.hypot(v[0], v[2]) || 1;
  // right-of-travel unit vector (horizontal)
  const rx = -v[2] / vh, rz = v[0] / vh;
  const c = curl * (sp / s0);
  _a[0] = -DRAG * sp * v[0] + c * rx;
  _a[1] = -DRAG * sp * v[1] - G;
  _a[2] = -DRAG * sp * v[2] + c * rz;
  if (wind) { _a[0] += wind[0]; _a[2] += wind[1]; }
  v[0] += _a[0] * dt; v[1] += _a[1] * dt; v[2] += _a[2] * dt;
  p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
}

export function kick(w, shot) {
  const s = solve(w.start, shot);
  w.kicked = true; w.t = 0;
  w.shot = shot;
  w.ball.v = s.v.slice(); w.ball.curl = s.curl; w.ball.v0 = s.v0;
  // visual spin: sidespin from curl, topspin from pace
  w.ball.spin = [-12 - s.v0 * 0.4, -s.curl * 2.2, 0];
  w.events.push({ type: 'kick', speed: s.v0 });
  return s;
}

// ---------------------------------------------------------------- step
export function step(w, dt = DT) {
  if (!w.kicked) { idle(w, dt); return; }
  w.t += dt;
  const b = w.ball, p = b.p, v = b.v;
  const live = !w.inGoal && !w.result;
  const had = w.result;
  const prevZ = p[2];
  // curl only while airborne & fast; wind always acts on a flying ball
  const air = p[1] > R + 0.02;
  accel(p, v, w.inGoal ? 0 : b.curl, b.v0, air ? w.wind : null, dt);
  if (w.inGoal) { v[0] *= 0.995; v[2] *= 0.995; }
  w.maxH = Math.max(w.maxH, p[1]);
  // ground
  if (p[1] < R) {
    p[1] = R;
    if (v[1] < -1.2) { v[1] = -v[1] * 0.48; w.events.push({ type: 'bounce', s: -v[1] }); }
    else v[1] = 0;
    const f = Math.pow(0.55, dt);
    v[0] *= f; v[2] *= f;
    b.curl *= Math.pow(0.02, dt);
  }
  stepWall(w, dt);
  stepKeeper(w, dt);
  // ---- collisions
  // wall
  for (const d of w.wall) {
    if (capsule(p, v, [d.x, 0.18 + d.y, d.z], [d.x, 1.62 + d.y, d.z], 0.25, 0.3)) {
      if (!w.touchedWall) w.events.push({ type: 'wall' });
      if (v[2] < 0) v[2] = -v[2] * 0.3;
      w.touchedWall = true;
    }
  }
  // under-the-wall: ball crosses the wall line low while they're airborne
  if (w.wall.length && !w.passedWall && w.wallCenter) {
    const d = w.wallDir;
    const along = (p[0] - w.start[0]) * d[0] + (p[2] - w.start[2]) * d[1];
    if (along > WALL_DIST) {
      w.passedWall = true;
      if (p[1] < 0.45 && w.wallJump > 0.18 && !w.touchedWall) {
        const perp = (p[0] - w.wallCenter[0]) * w.wallPerp[0] + (p[2] - w.wallCenter[1]) * w.wallPerp[1] - w.wallOff;
        if (Math.abs(perp) < w.wall.length * 0.28 + 0.2) w.underWall = true;
      }
    }
  }
  // keeper
  const k = w.keeper;
  if (k) {
    const kp = keeperSeg(k);
    if (capsule(p, v, kp[0], kp[1], kp[2], 0.25)) {
      if (!w.touchedKeeper) w.events.push({ type: 'save', inGoal: w.inGoal });
      if (v[2] < 0 && !w.inGoal) { v[2] = -v[2] * 0.22 + 0.5; v[0] += (k.side || 1) * 2.5; }
      w.touchedKeeper = true;
      // a keeper touch kills the curl
      b.curl = 0;
    }
  }
  // woodwork: posts and crossbar (front frame), plus the back stanchions are ignored
  const posts = [
    [[-GW - POST_R, 0, 0], [-GW - POST_R, GH + POST_R, 0]],
    [[GW + POST_R, 0, 0], [GW + POST_R, GH + POST_R, 0]],
    [[-GW - POST_R, GH + POST_R, 0], [GW + POST_R, GH + POST_R, 0]],
  ];
  for (const s of posts) {
    if (capsule(p, v, s[0], s[1], POST_R, 0.62)) {
      w.hitPost++;
      w.events.push({ type: 'post', x: p[0], y: p[1], s: Math.hypot(v[0], v[1], v[2]) });
      b.curl = 0;
    }
  }
  // goal plane crossing
  if (live && prevZ > 0 && p[2] <= 0) {
    w.crossed = [p[0], p[1]];
    if (Math.abs(p[0]) < GW && p[1] < GH) {
      w.inGoal = true; w.goalT = w.t;
      w.events.push({ type: 'goal', x: p[0], y: p[1] });
    } else {
      w.result = w.touchedKeeper ? 'saved' : w.touchedWall ? 'blocked' : 'miss';
      w.events.push({ type: 'miss', x: p[0], y: p[1] });
    }
  }
  // net
  if (w.inGoal) {
    let hit = false;
    if (p[2] < -NET_D + R) { p[2] = -NET_D + R; if (v[2] < 0) { hit = Math.abs(v[2]); v[2] *= -0.12; v[0] *= 0.5; v[1] *= 0.5; } }
    if (p[0] < -GW + R) { p[0] = -GW + R; if (v[0] < 0) { hit = hit || Math.abs(v[0]); v[0] *= -0.15; v[2] *= 0.6; } }
    if (p[0] > GW - R) { p[0] = GW - R; if (v[0] > 0) { hit = hit || Math.abs(v[0]); v[0] *= -0.15; v[2] *= 0.6; } }
    if (p[1] > GH - R) { p[1] = GH - R; if (v[1] > 0) { hit = hit || Math.abs(v[1]); v[1] *= -0.15; } }
    if (p[2] > -R && v[2] > 0) { v[2] *= -0.3; }
    if (hit && !w.netHit) { w.netHit = { x: p[0], y: p[1], z: p[2], s: hit, t: w.t }; w.events.push({ type: 'net', s: hit }); }
  }
  // ---- outcome
  if (!w.result) {
    if (w.inGoal && w.t - w.goalT > 0.05) w.result = 'goal';
    else if (!w.inGoal) {
      const sp = Math.hypot(v[0], v[1], v[2]);
      if (v[2] > 0.5 && p[2] > 0.3 && (w.touchedKeeper || w.touchedWall || w.hitPost)) w.result = w.touchedKeeper ? 'saved' : w.touchedWall ? 'blocked' : 'miss';
      else if (sp < 0.6 && p[1] <= R + 0.01) w.result = w.touchedKeeper ? 'saved' : w.touchedWall ? 'blocked' : 'short';
      else if (w.t > 5) w.result = 'short';
      else if (p[2] < -0.5) w.result = 'miss';
    }
  }
  if (!had && w.result) { w.doneT = w.t; w.events.push({ type: 'result', result: w.result }); }
}

function stepWall(w, dt) {
  if (!w.wall.length) return;
  const u = clamp((w.t - 0.06) / 0.62, 0, 1);
  w.wallJump = Math.sin(Math.PI * u) * 0.42;
  for (const d of w.wall) d.y = w.wallJump;
}

function keeperSeg(k) {
  const px = k.x + k.lunge, py = 0.12 + k.jump;
  const hx = px + Math.sin(k.theta) * k.reach, hy = py + Math.cos(k.theta) * k.reach;
  // when set, the body is a fat column; when stretched, arms make it thinner
  const rad = 0.34 - 0.08 * Math.min(1, Math.abs(k.theta));
  return [[px, py, k.z], [hx, hy, k.z], rad];
}
export { keeperSeg };

// where the keeper thinks the ball will cross his line: true pace and drop,
// but he can't read the curl or the wind (that's what beats him)
function keeperRead(w, k) {
  const b = w.ball;
  const c = flight(b.p, b.v, 0, b.v0, k.z, DT * 4);
  if (!c) return null;
  const r = rng(Math.round(b.v[0] * 997 + b.v[1] * 131 + w.setup.ball[0] * 17) + k.reads * 7)();
  return [c[0] + (r - 0.5) * 2 * k.noise, clamp(c[1], 0.1, 3.2)];
}

function keeperPose(k, px, py) {
  const dx = px - k.x;
  const Re = k.reach * 0.82;         // aim the forearms, not the fingertips
  const h = clamp(py - 0.12, 0.05, 3);
  let lunge = 0;
  if (Math.hypot(dx, h) > Re) {
    // launch sideways, keeping at least part of the reach for the arms
    const keep = Math.min(Math.abs(dx), Re * 0.8);
    lunge = clamp(dx - Math.sign(dx) * keep, -k.lungeMax, k.lungeMax);
  } else lunge = dx * 0.25;
  const rx = dx - lunge;
  // always point the body at the ball, even when it is out of reach
  const theta = Math.atan2(rx, Math.max(h, 0.15));
  const short = Math.hypot(rx, h) - Re;
  const jump = clamp(short * Math.cos(theta), 0, 0.35);
  return [theta, lunge, jump];
}

function stepKeeper(w, dt) {
  const k = w.keeper; if (!k) return;
  const b = w.ball;
  if (k.phase === 'set') {
    if (w.t >= k.react && b.v[2] < -1 && b.p[2] > k.z + 0.3) {
      k.reads = 0;
      const c = keeperRead(w, k) || [b.p[0], 1];
      [k.aimTheta, k.aimLunge, k.aimJump] = keeperPose(k, c[0], c[1]);
      k.phase = 'dive'; k.diveT = 0; k.readT = 0; k.side = Math.sign(c[0] - k.x) || 1;
      w.events.push({ type: 'dive', side: k.side });
    }
  } else if (k.phase === 'dive') {
    k.diveT += dt; k.readT += dt;
    // keep re-reading the flight while not yet fully committed, at a limited rate
    if (k.readT > 0.04 && b.p[2] > k.z + 4 + (1 - k.skill) * 5 && !w.touchedKeeper) {
      k.readT = 0; k.reads++;
      const c = keeperRead(w, k);
      if (c) {
        const [th, lu, ju] = keeperPose(k, c[0], c[1]);
        const m = 0.04 * k.adjust;
        k.aimTheta += clamp(th - k.aimTheta, -m * 2.2, m * 2.2);
        k.aimLunge += clamp(lu - k.aimLunge, -m * 1.6, m * 1.6);
        k.aimJump += clamp(ju - k.aimJump, -m, m);
      }
    }
    const u = ease(clamp(k.diveT / k.diveDur, 0, 1));
    k.theta = k.aimTheta * u;
    k.lunge = k.aimLunge * u;
    const ju = clamp(k.diveT / (k.diveDur * 1.6), 0, 1);
    k.jump = k.aimJump * Math.sin(Math.PI * Math.min(1, ju * 1.4));
    if (Math.abs(k.aimTheta) > 0.5 && (b.p[2] < k.z - 0.3 || w.touchedKeeper || w.result)) {
      k.fallT = (k.fallT || 0) + dt;
      const f = clamp(k.fallT / 0.35, 0, 1);
      k.theta = k.aimTheta + (Math.sign(k.aimTheta) * 1.5 - k.aimTheta) * f;
      k.jump = 0;
    }
  }
}

// sphere (p, R) vs capsule segment a-b radius rad. Resolves and reflects v.
function capsule(p, v, a, b, rad, e) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const L2 = abx * abx + aby * aby + abz * abz || 1;
  const t = clamp((apx * abx + apy * aby + apz * abz) / L2, 0, 1);
  const cx = a[0] + abx * t, cy = a[1] + aby * t, cz = a[2] + abz * t;
  let nx = p[0] - cx, ny = p[1] - cy, nz = p[2] - cz;
  const d = Math.hypot(nx, ny, nz);
  const min = rad + R;
  if (d >= min || d === 0) return false;
  nx /= d; ny /= d; nz /= d;
  p[0] = cx + nx * min; p[1] = cy + ny * min; p[2] = cz + nz * min;
  const vn = v[0] * nx + v[1] * ny + v[2] * nz;
  if (vn < 0) {
    v[0] -= (1 + e) * vn * nx; v[1] -= (1 + e) * vn * ny; v[2] -= (1 + e) * vn * nz;
    v[0] *= 0.85; v[1] *= 0.85; v[2] *= 0.85;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- scoring
export const BONUS = { goal: 100, topBins: 50, curler: 50, rocket: 25, postIn: 50, underWall: 100 };
export function score(w) {
  const out = { result: w.result, pts: 0, tags: [], target: -1 };
  if (w.result !== 'goal') return out;
  out.pts += BONUS.goal; out.tags.push(['GOAL', BONUS.goal]);
  const [x, y] = w.crossed;
  const tg = w.setup.targets || [];
  for (let i = 0; i < tg.length; i++) {
    const t = tg[i];
    if (Math.hypot(x - t.x, y - t.y) <= t.r) { out.pts += t.pts; out.tags.push(['TARGET', t.pts]); out.target = i; break; }
  }
  if (y > 1.85 && Math.abs(x) > 2.8) { out.pts += BONUS.topBins; out.tags.push(['TOP BINS', BONUS.topBins]); }
  if (Math.abs(w.shot.bend) >= 1.8) { out.pts += BONUS.curler; out.tags.push(['CURLER', BONUS.curler]); }
  if (w.shot.speed >= 30) { out.pts += BONUS.rocket; out.tags.push(['ROCKET', BONUS.rocket]); }
  if (w.hitPost) { out.pts += BONUS.postIn; out.tags.push(['OFF THE POST', BONUS.postIn]); }
  if (w.underWall) { out.pts += BONUS.underWall; out.tags.push(['UNDER THE WALL', BONUS.underWall]); }
  return out;
}

// run a whole shot headlessly from a setup + idle time; used by the bot
export function simulate(setup, preT, shot) {
  const w = makeWorld(setup, preT);
  kick(w, shot);
  for (let i = 0; i < 240 * 6 && !w.result; i++) step(w);
  // let a goal settle? not needed for scoring
  return { w, s: score(w) };
}
