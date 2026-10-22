// The AI driver. It produces exactly the same input a human does ({x, y, jump, boost, roll}),
// so it can drive either car and the headless tests can use it for player 1 too.
// Two layers:
//   TIER    (ROOKIE .. LEGEND) = skill: reaction time, aim, boost use, and which mechanics it can do
//           (aerials, aerial saves, air dribbles, flip resets, half-flips, wavedashes).
//   PERSONA (RAMPAGE, SKYE, BRICK, LOCKDOWN, FLICK, JINX) = style: what it prefers to do with that skill.
// Ball prediction runs the game's own ball physics forward (predictBall) ~3 s and the bot picks the
// earliest ground or aerial intercept it can make.
import { rand } from './rng.js';
import { W, H, GY, GT, GH, BALL_R, floorY, floorSlope, above, sdf } from './arena.js';
import { predictBall, predictGoal, makeWorld, step, STEP, L, HH, RIDE, G_CAR } from './physics.js';

// ROOKIE is the old ALL-STAR brain, unchanged in skill (ground game only, no aerials).
export const TIERS = ['rookie', 'pro', 'allstar', 'champion', 'legend'];
export const TIER_NAMES = { rookie: 'ROOKIE', pro: 'PRO', allstar: 'ALL-STAR', champion: 'CHAMPION', legend: 'LEGEND' };
export const DIFFS = {
  rookie:   { defend: 1, react: 0.06,  thr: 1, boostDist: 380, boostP: 1, reachY: 220, flipP: 0.9, aim: 14, speed: 1400, dj: 1, slack: 0.03, idle: 0, smart: 0.6, kickDelay: 0, kickFlip: 230,
              aerial: 0, aerialMax: 0, aerialErr: 0, save: 0, airDribble: 0, reset: 0, halfFlip: 0, wavedash: 0, flipShot: 0, trick: 0.25, adapt: 0.5 },
  pro:      { defend: 1, hop: 1, sim: 0.5, simRate: 0.1, react: 0.05,  thr: 1, boostDist: 360, boostP: 1, reachY: 225, flipP: 0.92, aim: 11, speed: 1420, dj: 1, slack: 0.03, idle: 0, smart: 0.65, kickDelay: 0, kickFlip: 240,
              aerial: 0.45, aerialMax: 520, aerialErr: 0.16, save: 0.3, airDribble: 0, reset: 0, halfFlip: 0.5, wavedash: 0.2, flipShot: 0.3, trick: 0.35, adapt: 0.7 },
  allstar:  { defend: 1, hop: 1, sim: 0.7, simRate: 0.08, react: 0.04,  thr: 1, boostDist: 340, boostP: 1, reachY: 230, flipP: 0.95, aim: 8, speed: 1440, dj: 1, slack: 0.02, idle: 0, smart: 0.7, kickDelay: 0, kickFlip: 250,
              aerial: 0.7, aerialMax: 700, aerialErr: 0.09, save: 0.6, airDribble: 0.2, reset: 0, halfFlip: 0.8, wavedash: 0.45, flipShot: 0.6, trick: 0.45, adapt: 0.85 },
  champion: { defend: 1, hop: 1, sim: 0.85, simRate: 0.06, react: 0.03,  thr: 1, boostDist: 320, boostP: 1, reachY: 235, flipP: 1, aim: 5, speed: 1460, dj: 1, slack: 0.015, idle: 0, smart: 0.7, kickDelay: 0, kickFlip: 260,
              aerial: 0.85, aerialMax: 860, aerialErr: 0.05, save: 0.85, airDribble: 0.5, reset: 0.25, halfFlip: 1, wavedash: 0.7, flipShot: 0.85, trick: 0.55, adapt: 1 },
  legend:   { defend: 1, hop: 1, sim: 1, simRate: 0.05, react: 0.02,  thr: 1, boostDist: 300, boostP: 1, reachY: 240, flipP: 1, aim: 3, speed: 1480, dj: 1, slack: 0.01, idle: 0, smart: 0.75, kickDelay: 0, kickFlip: 270,
              aerial: 1, aerialMax: 1000, aerialErr: 0.025, save: 1, airDribble: 0.8, reset: 0.6, halfFlip: 1, wavedash: 0.9, flipShot: 1, trick: 0.65, adapt: 1 },
};

// personalities: each one changes what the bot WANTS to do; the tier decides how well it does it
export const PERSONAS = {
  rampage: { name: 'RAMPAGE', style: 'RAMP RIDER', blurb: 'Carries the ball up the ramps and pops it off the lip', body: 'dart',
             mods: { aerial: 0.8 }, ramp: 1 },
  skye:    { name: 'SKYE', style: 'HIGH FLYER', blurb: 'Lives in the air: aerials, air dribbles, tricks', body: 'dart',
             mods: { aerial: 1.35, airDribble: 1.6, reset: 1.6, trick: 1.8, aerialMinUse: 0.3 }, fly: 1 },
  brick:   { name: 'BRICK', style: 'DEMO BRUISER', blurb: 'Hunts your car at supersonic speed', body: 'brute',
             mods: { aerial: 0.7, trick: 0.8 }, demo: 1 },
  lock:    { name: 'LOCKDOWN', style: 'KEEPER', blurb: 'Parks on the goal ledge, saves, then counter-attacks', body: 'brute',
             mods: { save: 1.4, aerial: 0.9 }, keeper: 1 },
  flick:   { name: 'FLICK', style: 'DRIBBLER', blurb: 'Balances the ball on the roof and flicks it', body: 'octo',
             mods: { aerial: 0.8, airDribble: 1.2 }, dribble: 1 },
  jinx:    { name: 'JINX', style: 'TRICKSTER', blurb: 'Fakes challenges, then steals the ball', body: 'octo',
             mods: { trick: 2, aerial: 0.9 }, fake: 1 },
};
export const PERSONA_IDS = Object.keys(PERSONAS);

export function makeBot(diff, carIndex, persona = null) {
  const base = DIFFS[diff] || DIFFS.pro;
  const per = PERSONAS[persona] ? persona : null;
  const p = { ...base };
  if (per) for (const [k, v] of Object.entries(PERSONAS[per].mods)) {
    if (k === 'aerialMinUse') continue;
    p[k] = Math.min(k === 'trick' ? 1 : 1, (p[k] || 0) * v);
  }
  // a high flyer always flies a bit, even as a rookie (clumsy aerials: big aim error, low ceiling)
  if (per && PERSONAS[per].mods.aerialMinUse && p.aerial < PERSONAS[per].mods.aerialMinUse) {
    p.aerial = PERSONAS[per].mods.aerialMinUse; p.aerialMax = Math.max(p.aerialMax, 420); p.aerialErr = Math.max(p.aerialErr, 0.22);
  }
  return {
    diff, persona: per, P: per ? PERSONAS[per] : {}, p, ci: carIndex, think: 0, tx: 0, mode: 'attack', seq: [], seqT: 0,
    noise: 0, out: { x: 0, y: 0, jump: false, boost: false, roll: 0 }, boostRoll: 1, flipRoll: 0, lastSeq: -9,
    air: null, drib: null, wd: false, trickT: 0, duty: 0, huntT: 0, fakeT: 0,
    adapt: { aerial: 0, ground: 0, kickoff: 0, ramp: 0, total: 0, said: '' },
    stats: { aerials: 0, aerialTouches: 0, dribbleTouches: 0, saves: 0, tricks: 0, halfflips: 0, wavedashes: 0, resets: 0, demos: 0 },
  };
}

// called when this bot concedes a goal: learn how it was scored and cover it next time.
// kind: 'kickoff' | 'aerial' | 'ramp' | 'ground'. Returns a short text when the bot changes its plan.
export function noteGoal(bot, kind) {
  const a = bot.adapt;
  a[kind] = (a[kind] || 0) + 1; a.total++;
  if (rand() > bot.p.adapt) return '';
  const msg = { kickoff: 'COVERS THE KICKOFF', aerial: 'COVERS AERIALS', ramp: 'COVERS THE RAMP', ground: 'GUARDS THE LEDGE' }[kind];
  if (a[kind] >= 2 && a.said !== kind) { a.said = kind; return msg; }
  if (kind === 'kickoff' && a.kickoff >= 1 && a.said !== kind) { a.said = kind; return msg; }
  return '';
}

function queue(bot, t, steps) { bot.seq = steps.map(([dt, o]) => ({ at: t + dt, ...o })); bot.lastSeq = t; }
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// stick that points the car's nose along (dx, dy)
function aimNose(out, dx, dy) { const l = Math.hypot(dx, dy) || 1; out.x = dx / l; out.y = dy / l; }

// ---------- aerial planning ----------
// earliest predicted ball position the car can reach in the air, or null
function findAerial(bot, c, pr, n, dtp, s, defend) {
  const p = bot.p;
  if (c.boost < 18) return null;
  const spd = 950 + 450 * p.aerial;
  for (let i = 8; i < n; i++) {
    const x = pr[i * 4], y = pr[i * 4 + 1], tt = (i + 1) * dtp;
    const h = above(x, y);
    if (h < 250 || h > p.aerialMax + 80) continue;
    // direction to push: at their goal (attack), up-and-out (save)
    const gx = s * (W / 2 + 60) - x, gy = GY + GH * 0.45 - y;
    let ux, uy;
    if (defend) { ux = s * 0.8; uy = 0.6; } else { const l = Math.hypot(gx, gy) || 1; ux = gx / l; uy = gy / l; }
    const ax = x - ux * (BALL_R + L * 0.55), ay = y - uy * (BALL_R + L * 0.55);
    if (!defend && (x - c.x) * s < 60) continue;          // never aerial from the wrong side of the ball
    if (defend && (c.x - x) * s > 40) continue;           // saves come from goal-side
    if (sdf(ax, ay) < 50) continue;
    const D = Math.hypot(ax - c.x, ay - c.y);
    const need = (c.grounded ? 0.22 : 0.05) + D / spd + p.slack;
    if (need > tt) continue;
    if (c.boost < 12 + 30 * tt) continue;
    return { i, x, y, ax, ay, ux, uy, tt };
  }
  return null;
}

function startAerial(bot, w, c, hit, kind) {
  bot.air = { T: w.t + hit.tt, x: hit.x, y: hit.y, ux: hit.ux, uy: hit.uy, t0: w.t, ground: c.grounded, dj: false, kind, touched: false,
    err: (rand() - 0.5) * 2 * bot.p.aerialErr, lastPlan: w.t };
  bot.seq = []; bot.cur = null;
  bot.stats.aerials++;
}

// in-air (or take-off) control toward the planned contact point
function aerialCtl(bot, w, c, b, out, s) {
  const A = bot.air, p = bot.p, t = w.t;
  // re-plan the contact point from the live ball every 0.1 s (the ball may have been touched)
  if (t - A.lastPlan > 0.1 && !A.touched) {
    A.lastPlan = t;
    const rem = A.T - t;
    if (rem > 0.05) {
      const pr = predictBall(b, Math.max(2, Math.round(rem * 60) + 1), 1 / 60);
      const k = Math.max(0, Math.round(rem * 60) - 1);
      A.x = pr[k * 4]; A.y = pr[k * 4 + 1];
    }
  }
  const T = Math.max(0.06, A.T - t);
  const R = BALL_R + L * 0.55;
  const ax = A.x - A.ux * R, ay = A.y - A.uy * R;
  // required boost acceleration to be at the contact point at time T
  let rx = 2 * (ax - c.x - c.vx * T) / (T * T), ry = 2 * (ay - c.y - c.vy * T) / (T * T) + G_CAR;
  // skill: a small aim error rotates the plan
  const e = A.err, cr = Math.cos(e), sr = Math.sin(e);
  [rx, ry] = [rx * cr - ry * sr, rx * sr + ry * cr];
  const need = Math.hypot(rx, ry);
  const dist = Math.hypot(A.x - c.x, A.y - c.y);
  const el = t - A.t0;
  out.boost = false;
  if (c.grounded) {
    if (el > 0.4) { bot.air = null; return false; }           // never left the ground: give up
    // take off: face the right way first (instant turn on the floor), then jump
    const want = Math.sign(ax - c.x) || c.dir;
    if (want !== c.dir && c.ny > 0.7) { out.x = want; out.jump = false; return true; }
    out.jump = true; out.x = 0; out.y = 0;
    return true;
  }
  // first jump: keep holding for full height, then (if the target is high) double jump
  if (A.ground && el < 0.2) { out.jump = true; aimNose(out, rx, ry); out.x *= 0.3; return true; }
  if (A.ground && !A.dj && el >= 0.2) {
    if (el < 0.23) { out.jump = false; aimNose(out, rx, ry); out.x = clamp(out.x, -0.3, 0.3); if (out.y < -0.4) out.y = -0.4; return true; }
    A.dj = true;
    if (ay - c.y > 220 && c.flipAvail) { out.jump = true; out.x = 0; out.y = 1; return true; }
  }
  out.jump = false;
  // nose along the required acceleration; boost (pulse-width) when lined up
  aimNose(out, rx, ry);
  const nx = Math.cos(c.a) * c.dir, ny = Math.sin(c.a) * c.dir;
  const dot = (nx * rx + ny * ry) / (need || 1);
  if (need > 300 && dot > 0.72 && c.boost > 0) {
    bot.duty += Math.min(1.2, need / 2500);
    if (bot.duty >= 1) { bot.duty -= 1; out.boost = true; }
  }
  // final instant: point the nose through the ball, and flip into it for power if we still can
  if (T < 0.14 && dist < R + 90) {
    aimNose(out, A.ux, A.uy);
    if (c.flipAvail && rand() < p.flipShot * 0.25) { out.jump = true; out.x = Math.sign(A.x - c.x) || s; out.y = 0; }
  }
  // flew past the ball (it is now behind us relative to their goal): abort before we knock it home
  if (!A.touched && (c.x - A.x) * s > -10 && A.kind !== 'save' && Math.abs(c.y - A.y) < 200) { bot.air = null; out.boost = false; aimNose(out, 0, -1); return true; }
  // touch / miss bookkeeping
  const last = w.touchHist[w.touchHist.length - 1];
  if (last && last.id === c.id && last.t > A.t0) {
    if (!A.touched) { A.touched = true; bot.stats.aerialTouches++; if (A.kind === 'save') bot.stats.saves++; }
    // air dribble: the ball is still riding on the nose -> keep carrying it in the air
    if (rand() < p.airDribble && c.boost > 12 && dist < R + 120 && (b.vx * s > -200) && (A.kind !== 'save')) {
      bot.drib = { t0: t, touches: 0, lastTouch: last.t, resetTried: false };
    }
    bot.air = null; return true;
  }
  if (t > A.T + 0.35 || c.boost <= 0 && need > 2600 || dist > 1800) { bot.air = null; }
  return true;
}

// air dribble: stay just under / behind the ball, nudge it toward their goal with soft touches
function dribbleCtl(bot, w, c, b, out, s) {
  const D = bot.drib, p = bot.p, t = w.t;
  const T = 0.2;
  const bx = b.x + b.vx * T, by = b.y + b.vy * T - 0.5 * 1300 * T * T;
  const gx = s * (W / 2 + 60) - bx, gy = GY + GH * 0.55 - by, gl = Math.hypot(gx, gy) || 1;
  // push mostly upward with a bit of goalward lean: the ball floats along on the nose
  let ux = (gx / gl) * 0.55, uy = 0.85 + (gy / gl) * 0.2; const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
  const dist = Math.hypot(b.x - c.x, b.y - c.y);
  const last = w.touchHist[w.touchHist.length - 1];
  if (last && last.id === c.id && last.t > D.lastTouch) { D.lastTouch = last.t; D.touches++; bot.stats.dribbleTouches++; }
  const closeToGoal = Math.abs(b.x - s * W / 2) < 700;
  // flip reset: roll the wheels onto the ball, then use the free flip for the finish
  if (p.reset > 0 && !D.resetTried && !c.flipAvail && b.y > c.y + 40 && dist < 220 && rand() < p.reset * 0.08) D.resetTried = t;
  if (D.resetTried && !c.flipAvail && t - D.resetTried < 0.6) {
    const vx = b.x - c.x, vy = b.y - c.y, l = Math.hypot(vx, vy) || 1;
    // wheels face the ball: car "up" = away from the ball -> the nose is perpendicular to that
    const nxv = -vy / l * s, nyv = vx / l * s;
    aimNose(out, nxv * c.dir * s, nyv * c.dir * s);
    out.boost = dist > 150 && b.vy < c.vy;
    return true;
  }
  if (c.flipAvail && D.resetTried && closeToGoal && dist < 200) {
    // the reset finish: flip through the ball at the goal
    out.jump = !c.jumpPrev; out.x = s; out.y = 0; bot.drib = null; bot.stats.resets++;
    return true;
  }
  const ax = bx - ux * (BALL_R + L * 0.5), ay = by - uy * (BALL_R + L * 0.5);
  let rx = 2 * (ax - c.x - c.vx * T) / (T * T), ry = 2 * (ay - c.y - c.vy * T) / (T * T) + G_CAR;
  const need = Math.hypot(rx, ry);
  aimNose(out, rx, ry);
  const nx = Math.cos(c.a) * c.dir, ny = Math.sin(c.a) * c.dir;
  if (need > 300 && (nx * rx + ny * ry) / (need || 1) > 0.65 && c.boost > 0) {
    bot.duty += Math.min(1.2, need / 2500);
    if (bot.duty >= 1) { bot.duty -= 1; out.boost = true; }
  }
  if (closeToGoal && dist < 190 && c.flipAvail) { out.jump = !c.jumpPrev; out.x = s; out.y = 0; }
  if (dist > 420 || c.boost <= 0 || t - D.t0 > 4 || c.grounded || b.y < c.y - 60 || Math.abs(b.x) > W / 2 - 40) bot.drib = null;
  return true;
}

// ---------- celebrations and tricks ----------
function celebrate(bot, w, c, out) {
  out.x = 0; out.y = 0; out.boost = false; out.roll = 0; out.jump = false;
  const won = w.lastGoal === c.team;
  if (!won) { out.x = c.dir * 0.3; return out; }
  const t = w.t;
  if (c.grounded) {
    if (t - bot.lastSeq > 0.6) queue(bot, t, [[0, { jump: true }], [0.18, { jump: false }], [0.3, { jump: true, x: 0 }], [0.34, { jump: false }]]);
  } else if (c.airT > 0.35 && bot.trickT <= 0) {
    // barrel roll or a full spin, alternating
    bot.trickT = 0.7;
    if ((bot.trickN = (bot.trickN || 0) + 1) % 2) { out.roll = 2; bot.stats.tricks++; }
    else { bot.spin = { t0: t, dir: rand() < 0.5 ? 1 : -1 }; w.events.push({ type: 'trick', car: c, kind: 'spin' }); bot.stats.tricks++; }
  }
  return null;
}
function spinCtl(bot, w, c, out) {
  const S = bot.spin, k = (w.t - S.t0) / 0.6;
  if (k > 1 || c.grounded) { bot.spin = null; return false; }
  const ang = c.a + S.dir * 2.2;   // stick always ahead of the nose -> the car spins round
  const nx = Math.cos(ang) * c.dir, ny = Math.sin(ang) * c.dir;
  out.x = nx; out.y = ny;
  return true;
}

// ---------- hopping over a ball that sits between us and our own goal ----------
// simulate drive-on / single jump / double jump against the predicted ball path.
// returns 0 drive on (clear), 3 drive on but no boost (contact far off), 1 jump now, 2 double jump now, -1 brake and wait
function hopPlan(bot, c, w, sd) {
  const pr = bot.pr, t0 = bot.prT, dtp = 1 / 50;
  const vx0 = c.vx * sd > 300 ? c.vx : sd * 900;
  const sim = (kind) => {
    let x = c.x, y = c.y, vy = 0, air = kind > 0, hold = 0.2, dj = kind === 2;
    if (kind > 0) vy = 650;
    for (let i = 1; i <= 75; i++) {
      const h = 1 / 60, tau = i * h;
      if (air) {
        if (hold > 0) { vy += 1500 * h; hold -= h; }
        if (dj && tau >= 0.25) { vy = Math.max(vy, 0) + 580; dj = false; }
        vy -= G_CAR * h; y += vy * h; x += vx0 * h;
        const fl = floorY(x) + RIDE;
        if (y < fl) { y = fl; air = false; vy = 0; }
      } else { x += vx0 * h; y = floorY(x) + RIDE; }
      const k = clamp(Math.round((w.t - t0 + tau) / dtp) - 1, 0, 149);
      const bx = pr[k * 4], by = pr[k * 4 + 1];
      if (Math.abs(x - bx) < L + BALL_R - 4 && Math.abs(y - by) < HH + BALL_R + 4) return tau;
      if ((x - bx) * sd > L + BALL_R + 30 && !air) return -1;
    }
    return -1;
  };
  const c0 = sim(0);
  if (c0 < 0) return 0;
  if (c0 > 0.75) return 3;
  if (sim(1) < 0) return 1;
  if (c.boost >= 0 && sim(2) < 0) return 2;
  return -1;
}

// ---------- touch lookahead ----------
// PRO and up: when the ball is close, try a handful of inputs (drive on, flip, jump, double jump, wait, back off)
// in a scratch copy of the world using the real physics, look where the ball ends up, keep the best.
const SIM = makeWorld();
function cloneWorld(src) {
  SIM.t = src.t; Object.assign(SIM.ball, src.ball);
  for (let i = 0; i < src.cars.length; i++) Object.assign(SIM.cars[i], src.cars[i]);
  SIM.events.length = 0; SIM.touchHist.length = 0; SIM.lastTouch = src.lastTouch; SIM.kick = false;
  return SIM;
}
function candidates(c, s, air, wantBoost) {
  if (air) return [
    { name: 'none', base: { x: s * 0.4 } },
    { name: 'flip', base: { x: s }, seq: [[0, { jump: 1, x: s }], [0.05, { jump: 0, x: s }]] },
    { name: 'flipback', base: { x: -s }, seq: [[0, { jump: 1, x: -s }], [0.05, { jump: 0, x: -s }]] },
    { name: 'djump', base: { x: 0, y: 1 }, seq: [[0, { jump: 1, x: 0, y: 1 }], [0.05, { jump: 0 }]] },
  ];
  return [
    { name: 'drive', base: { x: s, boost: wantBoost } },
    { name: 'flip', base: { x: s }, seq: [[0, { jump: 1 }], [0.05, { jump: 0 }], [0.08, { jump: 1, x: s }], [0.13, { jump: 0, x: s }]] },
    { name: 'jump', base: { x: s }, seq: [[0, { jump: 1 }], [0.2, { jump: 0 }]] },
    { name: 'djump', base: { x: s }, seq: [[0, { jump: 1 }], [0.18, { jump: 0 }], [0.24, { jump: 1, x: 0 }], [0.3, { jump: 0 }]] },
    { name: 'wait', base: { x: 0 } },
    { name: 'back', base: { x: -s } },
  ];
}
function lookahead(bot, w, c, s) {
  const air = !c.grounded, horizon = bot.p.simT || 0.45;
  const cands = candidates(c, s, air, c.boost > 10);
  let best = null, bestScore = -1e9;
  for (const cd of cands) {
    const sw = cloneWorld(w), me = sw.cars[bot.ci], op = sw.cars[1 - bot.ci], sb = sw.ball;
    let score = 0, done = false, k = 0;
    const seq = cd.seq || [];
    for (let i = 0, tau = 0; i < horizon / STEP; i++, tau += STEP) {
      while (k < seq.length && seq[k][0] <= tau + 1e-9) k++;
      const cur = k > 0 ? seq[k - 1][1] : {};
      const inp = { x: cur.x !== undefined ? cur.x : cd.base.x, y: cur.y !== undefined ? cur.y : cd.base.y || 0, jump: !!cur.jump, boost: !!cd.base.boost && cur.jump === undefined };
      const oin = { x: Math.sign(sb.x - op.x), y: 0, jump: false, boost: false };
      const ins = bot.ci === 0 ? [inp, oin] : [oin, inp];
      const g = step(sw, ins);
      sw.events.length = 0;
      if (g >= 0) { score = g === me.team ? 200 - tau * 20 : -400; done = true; break; }
    }
    if (!done) {
      const pg = predictGoal(sb, 2.5);
      if (pg) score = pg.side === 1 - me.team ? 120 - pg.t * 15 : -260 + pg.t * 30;
      else {
        score = 0.02 * sb.x * s + 0.006 * sb.vx * s;
        if (sb.x * s < -W / 2 + 800 && sb.vx * s < 0) score -= 25;     // left it rolling at our goal
      }
      if (sw.lastTouch === me.team) score += 4;                        // we got there first
    }
    if (cd.name === 'drive') score += 3;                                // prefer the plain plan on ties
    if (score > bestScore) { bestScore = score; best = cd; }
  }
  return best;
}

// ---------- main ----------
export function botInput(bot, w, dt) {
  const c = w.cars[bot.ci], b = w.ball, p = bot.p, out = bot.out, t = w.t, P = bot.P;
  out.x = 0; out.y = 0; out.boost = false; out.roll = 0;
  if (c.demo > 0) { out.jump = false; bot.air = bot.drib = null; return out; }
  const s = c.team === 0 ? 1 : -1; // attack direction
  const opp = w.cars.find((o) => o !== c);
  bot.trickT -= dt;
  // ---- goal scored: celebrate (or sulk) until the kickoff ----
  if (b.hidden) {
    bot.air = bot.drib = null;
    while (bot.seq.length && t >= bot.seq[0].at) bot.cur = bot.seq.shift();
    const r = celebrate(bot, w, c, out);
    if (r) return r;
    if (bot.spin) spinCtl(bot, w, c, out);
    else if (bot.cur && !c.grounded) { out.jump = !!bot.cur.jump; }
    if (bot.cur && c.grounded) out.jump = !!bot.cur.jump;
    if (bot.cur && !bot.seq.length && t - bot.cur.at > 0.3) bot.cur = null;
    return out;
  }
  // ---- plan (refreshed every reaction period) ----
  bot.think -= dt;
  if (bot.think <= 0) {
    bot.think = p.react * (0.7 + rand() * 0.6);
    const n = 150, dtp = 1 / 50, pr = predictBall(b, n, dtp);
    bot.pr = pr; bot.prT = t;
    let ix = b.x, iy = b.y, it = 0, danger = false, dangerT = 9;
    for (let i = 0; i < n; i++) {
      const x = pr[i * 4], y = pr[i * 4 + 1], tt = (i + 1) * dtp;
      if (!danger && (x * s) < -W / 2 + 40) { danger = true; dangerT = tt; }
      const h = above(x, y);
      const dist = Math.max(0, Math.abs(x - s * (BALL_R + L * 0.7) - c.x) - 40);
      const need = dist / p.speed + (h > 180 ? (h - 100) / 900 : 0) + p.slack;
      if (it === 0 && need <= tt && h < p.reachY + BALL_R) { ix = x; iy = y; it = tt; }
    }
    if (it === 0) { ix = pr[(n - 1) * 4]; iy = pr[(n - 1) * 4 + 1]; it = 3; }
    bot.ix = ix; bot.iy = iy; bot.it = it; bot.danger = danger; bot.dangerT = dangerT;
    bot.noise = (rand() - 0.5) * 2 * p.aim;
    const side = (c.x - b.x) * s;                 // < 0: we are goal-side of the ball (good)
    if (bot.mode === 'attack' && side > 50) bot.mode = 'rotate';
    else if (bot.mode === 'rotate' && side < -30) bot.mode = 'attack';
    // defend: the opponent gets there first and has a shot at our goal -> get back in goal
    const oppT = opp.demo > 0 ? 9 : Math.abs(b.x - opp.x) / 1300 + Math.max(0, above(b.x, b.y) - 220) / 900;
    const myT = Math.abs(b.x - c.x) / p.speed + Math.max(0, above(b.x, b.y) - 220) / 900;
    const oppShoots = opp.demo <= 0 && (opp.x - b.x) * s > 0 && opp.vx * -s > 250 && oppT < 1;
    const near = Math.abs(b.x - c.x) < 520;
    // adaptation: after conceding the same way, it gets back earlier / stays deeper
    const cover = bot.adapt.said;
    const defBias = (cover === 'ground' || cover === 'ramp' ? 0.25 : 0) + (cover === 'aerial' ? 0.15 : 0);
    if (oppShoots && oppT < myT - 0.12 + defBias && !near && rand() < p.defend * 1.6) bot.mode = 'defend';
    else if (bot.mode === 'defend' && (near || !oppShoots || oppT > myT + 0.1 + defBias)) bot.mode = side < 0 ? 'attack' : 'rotate';
    const loses = oppT < myT - 0.3 && opp.demo <= 0 && side < 0 && !near;
    if (bot.mode === 'attack' && loses && rand() < p.smart) bot.mode = 'shadow';
    else if (bot.mode === 'shadow' && (!loses || near || danger)) bot.mode = side < 0 ? 'attack' : 'rotate';
    // KEEPER: when the ball is deep in their half and not coming back, wait on the goal ledge
    if (P.keeper && !danger && b.x * s > 250 && !(near && side < 0) && bot.mode !== 'defend') bot.mode = 'keep';
    else if (bot.mode === 'keep' && (b.x * s < 150 || danger)) bot.mode = side < 0 ? 'attack' : 'rotate';
    // DEMO BRUISER: go hunting when the ball is not a threat and the opponent is in range
    if (P.demo && bot.mode !== 'hunt' && !danger && opp.demo <= 0 && c.boost > 35 && Math.abs(opp.x - c.x) < 1500 && !near && t > (bot.huntCD || 0) && rand() < 0.08) {
      bot.mode = 'hunt'; bot.huntT = 2.6;
    }
    if (bot.mode === 'hunt' && (danger || opp.demo > 0 || bot.huntT <= 0 || (near && side < 0))) { bot.mode = side < 0 ? 'attack' : 'rotate'; bot.huntCD = t + 3; }
    // TRICKSTER: both cars about to meet at the ball -> fake the challenge, then pounce
    if (P.fake && bot.mode === 'attack' && Math.abs(oppT - myT) < 0.3 && Math.abs(b.x - opp.x) < 700 && Math.abs(b.x - c.x) < 700 && t > (bot.fakeCD || 0) && rand() < 0.35) {
      bot.fakeT = 0.4 + rand() * 0.25; bot.fakeCD = t + 3; w.events.push({ type: 'fake', car: c });
    }
    if (bot.mode === 'shadow') bot.tx = clamp(b.x - s * (420 + 300 * Math.max(0, 1 - oppT)), -W / 2 + 140, W / 2 - 140);
    else if (bot.mode === 'defend' || bot.mode === 'keep') bot.tx = -s * (W / 2 - (bot.mode === 'keep' ? 150 : 110));
    else if (bot.mode === 'hunt') bot.tx = opp.x + opp.vx * 0.35;
    else if (bot.mode === 'attack') bot.tx = ix - s * (BALL_R + L * 0.55) + bot.noise;
    else {
      const back = 650 - p.smart * (oppT < myT ? -120 : 220);
      bot.tx = clamp(b.x - s * back, -W / 2 + 140, W / 2 - 140);
      if (danger) bot.tx = -s * (W / 2 - 120);
    }
    bot.flipRoll = rand();
    if (rand() < 0.25) bot.boostRoll = rand();
    // ---- aerial decision ----
    if (!bot.air && !bot.drib && p.aerial > 0 && !w.kick && (c.grounded ? c.ny > 0.6 : c.airT < 0.5)) {
      const defend = danger && dangerT < 2.2;
      const use = defend ? Math.max(p.aerial, p.save) : p.aerial * (cover === 'aerial' ? 1.1 : 1);
      const hit = (defend ? p.save > 0 : true) && rand() < use ? findAerial(bot, c, pr, n, dtp, s, defend) : null;
      // only go up when the ground plan cannot get there first
      if (hit && (it === 0 || it > hit.tt - 0.05 || above(ix, iy) > p.reachY - 20)) {
        if (!defend || (c.x - hit.x) * s < 0) startAerial(bot, w, c, hit, defend ? 'save' : 'shot');
      }
    }
  }
  if (bot.mode === 'hunt') bot.huntT -= dt;
  // ---- aerial / air dribble / spin in progress ----
  if (bot.air && aerialCtl(bot, w, c, b, out, s)) { if (!bot.drib) return out; }
  if (bot.drib && !c.grounded) { dribbleCtl(bot, w, c, b, out, s); return out; }
  if (bot.drib && c.grounded) bot.drib = null;
  if (bot.spin && spinCtl(bot, w, c, out)) return out;
  // ---- scripted jump sequences (jumps, double jumps, flips, half-flips) ----
  while (bot.seq.length && t >= bot.seq[0].at) bot.cur = bot.seq.shift();
  if (bot.cur && !bot.seq.length && t - bot.cur.at > 0.3) bot.cur = null;
  out.jump = bot.cur ? !!bot.cur.jump : false;
  const forceX = bot.cur && bot.cur.x !== undefined ? bot.cur.x : null;
  const forceY = bot.cur && bot.cur.y !== undefined ? bot.cur.y : null;
  if (bot.cur && bot.cur.roll) out.roll = bot.cur.roll;
  const fin = () => { if (forceX !== null) out.x = forceX; if (forceY !== null) out.y = forceY; return out; };

  const dx = bot.tx - c.x;
  const rx = (b.x - c.x) * s, ry = b.y - c.y;
  // ---- kickoff: ball dropped in the basin -> race for it ----
  if (w.kick && Math.abs(b.x) < 40 && c.grounded && c.ny > 0.6) {
    bot.mode = 'attack'; bot.kickT = (bot.kickT || 0) + dt;
    if (bot.kickT === dt) bot.fake = (P.fake || P.keeper) && !bot.adapt.kickoff && rand() < 0.3;
    if (bot.fake && bot.kickT < 0.9) { out.x = 0; return fin(); }
    out.x = Math.sign(b.x - c.x);
    out.boost = c.boost > 0;
    const rx0 = Math.abs(b.x - c.x) - BALL_R - L * 0.5;
    if (rx0 < p.kickFlip && rx > 0 && !bot.seq.length && t - bot.lastSeq > 0.5)
      queue(bot, t, [[0, { jump: true }], [0.05, { jump: false }], [0.08, { jump: true, x: s }], [0.13, { jump: false, x: s }]]);
    return fin();
  }
  bot.kickT = 0; bot.fake = false;
  // ---- touch lookahead (PRO and up) ----
  if (bot.hold && t < bot.hold.until) { out.x = bot.hold.x; out.boost = false; out.jump = false; return out; }
  if (p.sim > 0 && !bot.seq.length && t - bot.lastSeq > 0.25 && t >= (bot.simNext || 0) && !bot.wd) {
    const dyb = b.y - c.y;
    const near = Math.abs(b.x - c.x) < (c.grounded ? 480 : 300) && dyb < 420 && dyb > -140;
    if (near && (c.grounded ? c.ny > 0.6 : c.flipAvail)) {
      bot.simNext = t + p.simRate * (0.8 + rand() * 0.4);
      const best = rand() < p.sim ? lookahead(bot, w, c, s) : null;
      if (best) {
        bot.noAuto = t + p.simRate * 1.5;
        if (best.seq) { queue(bot, t, best.seq.map(([d, o]) => [d, { ...o, jump: !!o.jump }])); bot.stats.sims = (bot.stats.sims || 0) + 1; }
        else if (best.name === 'wait' || best.name === 'back') bot.hold = { x: best.base.x, until: t + p.simRate };
      }
    }
  }
  if (c.grounded) {
    bot.wd = false; bot.trickDone = false;
    if (c.ny < 0.5) {                            // on a wall or the ceiling: hop back down
      if (!bot.seq.length && t - bot.lastSeq > 0.4) queue(bot, t, [[0, { jump: true }], [0.1, { jump: false }]]);
      out.x = c.dir;
      return fin();
    }
    out.x = Math.abs(dx) > 25 ? Math.sign(dx) * p.thr : 0;
    const nosex = Math.cos(c.a) * c.dir, nosey = Math.sin(c.a) * c.dir;
    const vt = c.vx * nosex + c.vy * nosey;
    // TRICKSTER fake: brake hard right before the challenge, let them commit, then go
    if (bot.fakeT > 0) { bot.fakeT -= dt; out.x = vt > 150 ? -c.dir : 0; return fin(); }
    // ball sitting on our roof: carry it toward their goal, then flick it
    if (Math.abs(b.x - c.x) < 100 && ry > 50 && ry < 170 && Math.abs(b.vy) < 400) {
      bot.carry = (bot.carry || 0) + dt;
      out.x = s * (P.dribble ? 0.85 : 0.75);
      const flickAt = P.dribble ? W / 2 - 1150 : W / 2 - 950;
      if (!bot.seq.length && (b.x * s > flickAt || bot.carry > (P.dribble ? 2.6 : 1.6))) {
        bot.carry = 0;
        queue(bot, t, [[0, { jump: true }], [0.08, { jump: false }], [0.14, { jump: true, x: s }], [0.2, { jump: false, x: s }]]);
        w.events.push({ type: 'flick', car: c });
      }
      return fin();
    }
    bot.carry = 0;
    // DRIBBLER: a falling ball in front -> get under it and catch it on the roof
    if (P.dribble && bot.mode === 'attack' && b.vy < 0 && above(b.x, b.y) > 200 && above(b.x, b.y) < 650 && rx > -40 && rx < 600) {
      const tl = (b.vy + Math.sqrt(b.vy * b.vy + 2 * 1300 * Math.max(0, b.y - c.y - 120))) / 1300;
      const lx = b.x + b.vx * tl;
      const ddx = lx - c.x;
      out.x = Math.abs(ddx) > 20 ? Math.sign(ddx) * Math.min(1, Math.abs(ddx) / 150) : 0;
      if (Math.abs(ddx) > 300 && Math.sign(ddx) === c.dir && c.boost > 10) out.boost = true;
      return fin();
    }
    // DRIBBLER: a slow ball on the floor in front -> push-dribble it with the bumper, flick near their ramp
    if (P.dribble && bot.mode === 'attack' && rx > 0 && rx < 260 && Math.abs(ry) < 70 && Math.abs(b.vx - c.vx) < 450 && b.x * s < W / 2 - 900) {
      out.x = s * ((b.vx * s) < 500 ? 1 : 0.5);
      return fin();
    }
    // keep pushing through the ball when attacking up close
    if (bot.mode === 'attack' && rx > 0 && rx < 300 && Math.abs(ry) < 260) out.x = s * p.thr;
    const facing = Math.sign(out.x) === c.dir;
    const sp = Math.hypot(c.vx, c.vy);
    const reserve = p.smart && bot.mode !== 'attack' && bot.mode !== 'hunt' && !bot.danger ? 30 * p.smart : 5;
    if (facing && c.boost > reserve && bot.boostRoll < p.boostP && Math.abs(dx) > p.boostDist && sp < 2250) out.boost = true;
    if (bot.mode === 'rotate' && bot.danger && facing && c.boost > 5 && p.boostP > 0.5) out.boost = true;
    if (bot.mode === 'hunt') { out.x = Math.sign(dx) || c.dir; out.boost = facing && c.boost > 0; }
    // RAMP RIDER: ball on their ramp side -> floor it up the ramp and launch off the lip after it
    if (P.ramp && bot.mode === 'attack' && rx > 0 && b.x * s > 350 && facing && c.boost > 15) out.boost = true;
    if (bot.seq.length || t - bot.lastSeq < 0.45) return fin();
    // HALF-FLIP: driving fast the wrong way and the target is far behind -> backflip + roll
    const behind = (b.x - c.x) * -c.dir;
    if (p.halfFlip > 0 && Math.sign(dx) === -c.dir && Math.abs(dx) > 650 && vt > 450 && c.ny > 0.8 && bot.flipRoll < p.halfFlip && !(behind > -100 && behind < 950 && ry < 330)) {
      const back = -c.dir;
      queue(bot, t, [[0, { jump: true }], [0.07, { jump: false, x: 0 }], [0.1, { jump: true, x: back }], [0.14, { jump: false, x: back }],
        [0.31, { jump: false, x: back, roll: 1 }], [0.36, { jump: false, x: back, roll: 0 }], [0.5, { x: back }]]);
      bot.stats.halfflips++;
      return fin();
    }
    // WAVEDASH / speed flip: long way to go, no boost to spare -> hop and flip just before landing
    if (p.wavedash > 0 && facing && Math.abs(dx) > 900 && c.boost < 25 && vt > 200 && vt < 1000 && c.ny > 0.85 && bot.flipRoll < p.wavedash && bot.mode !== 'defend') {
      queue(bot, t, [[0, { jump: true }], [0.04, { jump: false }]]);
      bot.wd = true; bot.wdDir = Math.sign(dx);
      return fin();
    }
    if (bot.mode === 'shadow') { bot.runup = false; if (Math.abs(dx) < 60) out.x = c.dir !== s ? s * 0.5 : 0; return fin(); }
    if (bot.mode === 'defend' || bot.mode === 'keep') {
      bot.runup = false;
      if (Math.abs(dx) < 90) out.x = c.dir !== s ? s * 0.5 : 0;   // sit in goal facing the play
    }
    if (bot.mode === 'attack' || bot.mode === 'defend' || bot.mode === 'keep') {
      bot.runup = false;
      const closing = (c.vx - b.vx) * s;
      const tc = (rx - (BALL_R + L)) / Math.max(150, closing);
      if (c.dir === s && (c.vx * s > 120 || b.vx * s < -300) && rx > 0 && !(t < (bot.noAuto || 0))) {
        if (ry > 140 && ry < p.reachY + 60 && rx < 1000) {
          // high ball: leave the ground so we arrive at the right height
          const tr = Math.min(0.95, ry / 700 + 0.08);
          if (tc < tr && tc > -0.05) {
            if (ry > 290 && bot.flipRoll < p.dj) queue(bot, t, [[0, { jump: true }], [0.18, { jump: false }], [0.24, { jump: true, x: 0 }], [0.3, { jump: false }]]);
            else queue(bot, t, [[0, { jump: true }], [0.2, { jump: false }]]);
          }
        } else if (ry < 140 && tc < 0.14 && tc > 0 && bot.flipRoll < p.flipP && b.x * s > W / 2 - 1500) {
          // ball on the ground right in front: flip into it for a power shot
          queue(bot, t, [[0, { jump: true }], [0.06, { jump: false }], [0.09, { jump: true, x: s }], [0.14, { jump: false, x: s }]]);
        }
      }
    } else if (bot.mode !== 'hunt') {
      // the ball is between us and our own goal: never shove it in. Get a run-up, then hop over it.
      const sd = Math.sign(dx) || -s;
      const ahead = (b.x - c.x) * sd;
      const closing = (c.vx - b.vx) * sd;
      const ballLow = ry < 125 && Math.abs(b.vy) < 380, ballHigh = ry > 360;
      if (p.hop && ahead > -60 && ahead < 1000 && bot.pr) {
        // PRO and up: simulate the hop against the predicted ball and only jump when it clears
        const plan = hopPlan(bot, c, w, sd);
        if (plan === 1) queue(bot, t, [[0, { jump: true }], [0.2, { jump: false }]]);
        else if (plan === 2) queue(bot, t, [[0, { jump: true }], [0.2, { jump: false }], [0.25, { jump: true, x: 0 }], [0.29, { jump: false }]]);
        else if (plan < 0) { out.x = closing > 120 ? -sd : 0; out.boost = false; }
        else if (plan === 3) out.boost = false;
        return fin();
      }
      if (ahead > 0 && ahead < 900 && !ballHigh) {
        if (!ballLow) {
          // bouncing ball in the way: hang back and wait for a clean hop
          bot.runup = false;
          if (ahead < 520) { out.x = closing > 200 ? -sd : 0; out.boost = false; }
          return fin();
        }
        if (!bot.runup && closing < 550 && ahead < 560 && t > (bot.noRunup || 0)) { bot.runup = true; bot.runupT = t; }
        if (bot.runup) {
          if (ahead > 680 || Math.abs(c.x) > W / 2 - 170 || t - bot.runupT > 1.0) { bot.runup = false; bot.noRunup = t + 1.5; }
          else { out.x = -sd * p.thr; out.boost = false; return fin(); }
        }
        // single full-height jump: over the ball between 0.25 s and 0.8 s after take-off
        if ((closing >= 550 && (ahead - 150) / closing < 0.27) || (closing < 550 && ahead < 300))
          queue(bot, t, [[0, { jump: true }], [0.22, { jump: false }]]);
      } else bot.runup = false;
    }
  } else {
    // ---- in the air (not an aerial) ----
    const h = above(c.x, c.y);
    if (bot.wd) {
      // wavedash: flip toward the target the instant before the wheels touch
      out.x = 0; out.y = 0;
      if (c.vy < 0 && h < RIDE + 40) { out.jump = true; out.x = bot.wdDir; bot.wd = false; bot.stats.wavedashes++; return out; }
      return out;
    }
    if (forceX === null) {
      out.x = c.dir * 0.9; out.y = c.vy < 0 ? -0.25 : 0;
      if (h > 260 && ry > 0 && Math.abs(rx) < 300) { out.x = (b.x - c.x) / 300; out.y = 0.6; }
      // facing the wrong way while falling (e.g. after a lip launch): roll round to land facing the play
      const want = Math.sign(bot.tx - c.x);
      if (want && want !== c.dir && c.vy < 0 && h > 140 && c.rollT <= 0 && !bot.rolled && p.halfFlip > 0) { out.roll = 1; bot.rolled = true; }
      // STYLE: lots of airtime and nothing to do -> a barrel roll or a spin
      const ballFar = Math.hypot(b.x - c.x, b.y - c.y) > 750;
      if (!bot.trickDone && ballFar && h > 230 && c.vy > -150 && c.rollT <= 0 && bot.trickT <= 0 && !bot.danger) {
        bot.trickDone = true;
        if (rand() < p.trick) {
          bot.trickT = 1.2; bot.stats.tricks++;
          if (rand() < 0.55) out.roll = 2;
          else { bot.spin = { t0: t, dir: rand() < 0.5 ? 1 : -1 }; w.events.push({ type: 'trick', car: c, kind: 'spin' }); }
        }
      }
    }
  }
  if (c.grounded) bot.rolled = false;
  return fin();
}
