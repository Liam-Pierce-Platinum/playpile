// The AI driver. It produces exactly the same input a human does ({x, y, jump, boost}),
import { rand } from './rng.js';
// so it can drive either car and the headless tests can use it for player 1 too.
import { W, H, GH, BALL_R } from './arena.js';
import { predictBall, L, RIDE } from './physics.js';

export const DIFFS = {
  rookie:  { defend: 0.2, react: 0.4,  thr: 0.7,  boostDist: 9999, boostP: 0,   reachY: 200, flipP: 0.1, aerial: 0,   aim: 120, speed: 750,  dj: 0,   slack: 0.3,  idle: 0.25, kickDelay: 0, kickFlip: 150, kickBoost: 1 },
  pro:     { defend: 0.85, react: 0.1, thr: 1.0,  boostDist: 500,  boostP: 0.85, reachY: 210, flipP: 0.7, aerial: 0,  aim: 30,  speed: 1250, dj: 0.8, slack: 0.07, idle: 0.03, kickDelay: 0.05, kickFlip: 190 },
  allstar: { defend: 1,   react: 0.06, thr: 1.0,  boostDist: 380,  boostP: 1.0, reachY: 220, flipP: 0.9, aerial: 0,   aim: 14,  speed: 1400, dj: 1,   slack: 0.03, idle: 0, kickDelay: 0, kickFlip: 230 },
};

export function makeBot(diff, carIndex) {
  return { diff, p: DIFFS[diff] || DIFFS.pro, ci: carIndex, think: 0, tx: 0, mode: 'attack', seq: [], seqT: 0,
    noise: 0, out: { x: 0, y: 0, jump: false, boost: false }, aerial: false, boostRoll: 1, flipRoll: 0, lastSeq: -9 };
}

function queue(bot, t, steps) { bot.seq = steps.map(([dt, o]) => ({ at: t + dt, ...o })); bot.lastSeq = t; }

export function botInput(bot, w, dt) {
  const c = w.cars[bot.ci], b = w.ball, p = bot.p, out = bot.out, t = w.t;
  out.x = 0; out.y = 0; out.boost = false;
  if (c.demo > 0) { out.jump = false; return out; }
  const s = c.team === 0 ? 1 : -1; // attack direction
  // ---- plan (refreshed every reaction period) ----
  bot.think -= dt;
  if (bot.think <= 0) {
    bot.think = p.react * (0.7 + rand() * 0.6);
    const n = 150, pr = predictBall(b, n, 1 / 50);
    let ix = b.x, iy = b.y, it = 0, danger = false;
    for (let i = 0; i < n; i++) {
      const x = pr[i * 4], y = pr[i * 4 + 1], tt = (i + 1) / 50;
      if (!danger && (x * s) < -W / 2 + 40 && y < GH + 60) danger = true;
      const dist = Math.max(0, Math.abs(x - s * (BALL_R + L * 0.7) - c.x) - 40);
      const need = dist / p.speed + (y > 180 ? (y - 100) / 900 : 0) + p.slack;
      if (it === 0 && need <= tt && y < p.reachY + BALL_R) { ix = x; iy = y; it = tt; }
    }
    if (it === 0) { ix = pr[(n - 1) * 4]; iy = pr[(n - 1) * 4 + 1]; it = 3; }
    bot.ix = ix; bot.iy = iy; bot.it = it; bot.danger = danger;
    bot.noise = (rand() - 0.5) * 2 * p.aim;
    const side = (c.x - b.x) * s;                 // < 0: we are goal-side of the ball (good)
    if (bot.mode === 'attack' && side > 50) bot.mode = 'rotate';
    else if (bot.mode === 'rotate' && side < -30) bot.mode = 'attack';
    // defend: the opponent gets there first and has a shot at our goal -> get back in goal
    const opp = w.cars.find((o) => o !== c);
    const oppT = opp.demo > 0 ? 9 : Math.abs(b.x - opp.x) / 1300 + Math.max(0, b.y - 220) / 900;
    const myT = Math.abs(b.x - c.x) / p.speed + Math.max(0, b.y - 220) / 900;
    const oppShoots = opp.demo <= 0 && (opp.x - b.x) * s > 0 && opp.vx * -s > 250 && oppT < 1;
    const near = Math.abs(b.x - c.x) < 520;
    if (oppShoots && oppT < myT - 0.12 && !near && rand() < p.defend * 1.6) bot.mode = 'defend';
    else if (bot.mode === 'defend' && (near || !oppShoots || oppT > myT + 0.1)) bot.mode = side < 0 ? 'attack' : 'rotate';
    if (bot.mode === 'defend') bot.tx = -s * (W / 2 - 110);
    else if (bot.mode === 'attack') bot.tx = ix - s * (BALL_R + L * 0.55) + bot.noise;
    else {
      bot.tx = Math.max(-W / 2 + 140, Math.min(W / 2 - 140, b.x - s * 650));
      if (danger) bot.tx = -s * (W / 2 - 120);
    }
    bot.flipRoll = rand();
    bot.idleT = rand() < p.idle * p.react * 4 ? 0.5 + rand() * 0.6 : (bot.idleT || 0);
    if (rand() < 0.25) bot.boostRoll = rand();
  }
  // ---- scripted jump sequences (jumps, double jumps, flips) ----
  while (bot.seq.length && t >= bot.seq[0].at) bot.cur = bot.seq.shift();
  if (bot.cur && !bot.seq.length && t - bot.cur.at > 0.3) bot.cur = null;
  out.jump = bot.cur ? !!bot.cur.jump : false;
  const forceX = bot.cur && bot.cur.x !== undefined ? bot.cur.x : null;
  const fin = () => { if (forceX !== null) out.x = forceX; return out; };

  const kick0 = Math.abs(b.x) < 4 && Math.abs(b.vx) < 5 && b.y < BALL_R + 6;
  if (kick0) bot.idleT = 0; // never daydream through a kickoff
  if (bot.idleT > 0) { bot.idleT -= dt; if (c.grounded && !bot.seq.length) { out.x = 0; return fin(); } }
  const dx = bot.tx - c.x;
  const rx = (b.x - c.x) * s, ry = b.y - c.y;
  // ---- kickoff: ball resting on the centre spot -> race for it ----
  const kick = Math.abs(b.x) < 4 && Math.abs(b.vx) < 5 && b.y < BALL_R + 6 && Math.abs(b.vy) < 30;
  if (kick && c.grounded && c.ny > 0.7) {
    bot.mode = 'attack'; bot.kickT = (bot.kickT || 0) + dt;
    const kd = p.kickDelay || 0;
    if (bot.kickT < kd) { out.x = 0; return fin(); }
    out.x = Math.sign(b.x - c.x);
    out.boost = (p.boostP > 0 || p.kickBoost) && c.boost > 0;
    const rx0 = Math.abs(b.x - c.x) - BALL_R - L * 0.5;
    if (rx0 < p.kickFlip && !bot.seq.length && t - bot.lastSeq > 0.5)
      queue(bot, t, [[0, { jump: true }], [0.05, { jump: false }], [0.08, { jump: true, x: s }], [0.13, { jump: false, x: s }]]);
    return fin();
  }
  bot.kickT = 0;
  if (c.grounded) {
    bot.aerial = false;
    if (c.ny < 0.7) {                            // on a wall or ceiling: hop back down
      if (!bot.seq.length && t - bot.lastSeq > 0.4) queue(bot, t, [[0, { jump: true }], [0.1, { jump: false }]]);
      out.x = c.dir;
      return fin();
    }
    out.x = Math.abs(dx) > 25 ? Math.sign(dx) * p.thr : 0;
    // ball sitting on our roof: carry it toward their goal, then flick it
    if (Math.abs(b.x - c.x) < 100 && ry > 50 && ry < 170 && Math.abs(b.vy) < 400) {
      bot.carry = (bot.carry || 0) + dt;
      out.x = s * 0.75;
      if (!bot.seq.length && (b.x * s > W / 2 - 950 || bot.carry > 1.6)) {
        bot.carry = 0;
        queue(bot, t, [[0, { jump: true }], [0.08, { jump: false }], [0.14, { jump: true, x: s }], [0.2, { jump: false, x: s }]]);
      }
      return fin();
    }
    bot.carry = 0;
    // keep pushing through the ball when attacking up close
    if (bot.mode === 'attack' && rx > 0 && rx < 300 && Math.abs(ry) < 260) out.x = s * p.thr;
    const facing = Math.sign(out.x) === c.dir;
    const sp = Math.hypot(c.vx, c.vy);
    if (facing && c.boost > 5 && bot.boostRoll < p.boostP && Math.abs(dx) > p.boostDist && sp < 2250) out.boost = true;
    if (bot.mode === 'rotate' && bot.danger && facing && c.boost > 5 && p.boostP > 0.5) out.boost = true;
    if (bot.seq.length || t - bot.lastSeq < 0.45) return fin();
    if (bot.mode === 'defend') {
      bot.runup = false;
      if (Math.abs(dx) < 90) out.x = c.dir !== s ? s * 0.5 : 0;   // sit in goal facing the play
    }
    if (bot.mode === 'attack' || bot.mode === 'defend') {
      bot.runup = false;
      const closing = (c.vx - b.vx) * s;
      const tc = (rx - (BALL_R + L)) / Math.max(150, closing);
      if (c.dir === s && (c.vx * s > 120 || b.vx * s < -300) && rx > 0) {
        // All-Star only: go up for a ball hanging in front of their goal
        if (p.aerial && c.boost > 30 && b.y > 330 && b.y < 850 && b.x * s > W / 2 - 1100 && rx > 150 && rx < 700 && Math.abs(b.vy) < 900 && bot.flipRoll < 0.7) {
          bot.aerial = true;
          queue(bot, t, [[0, { jump: true }], [0.18, { jump: false }], [0.24, { jump: true, x: 0 }], [0.3, { jump: false }]]);
          return fin();
        }
        if (ry > 140 && ry < p.reachY + 60 && rx < 1000) {
          // high ball: leave the ground so we arrive at the right height
          const tr = Math.min(0.95, ry / 700 + 0.08);
          if (tc < tr && tc > -0.05) {
            if (p.aerial && ry > 430 && c.boost > 25 && bot.flipRoll < p.aerial) {
              bot.aerial = true;
              queue(bot, t, [[0, { jump: true }], [0.2, { jump: false }], [0.26, { jump: true, x: 0 }], [0.32, { jump: false }]]);
            } else if (ry > 290 && bot.flipRoll < p.dj) queue(bot, t, [[0, { jump: true }], [0.18, { jump: false }], [0.24, { jump: true, x: 0 }], [0.3, { jump: false }]]);
            else queue(bot, t, [[0, { jump: true }], [0.2, { jump: false }]]);
          }
        } else if (ry < 140 && tc < 0.14 && tc > 0 && bot.flipRoll < p.flipP && b.x * s > W / 2 - 1300) {
          // ball on the ground right in front: flip into it for a power shot
          queue(bot, t, [[0, { jump: true }], [0.06, { jump: false }], [0.09, { jump: true, x: s }], [0.14, { jump: false, x: s }]]);
        }
      }
    } else {
      // the ball is between us and our own goal: never shove it in. Get a run-up, then hop over it.
      const sd = Math.sign(dx) || -s;
      const ahead = (b.x - c.x) * sd;
      const closing = (c.vx - b.vx) * sd;
      const ballLow = b.y < 125 && Math.abs(b.vy) < 380, ballHigh = b.y > 360;
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
    // ---- in the air ----
    if (bot.aerial) {
      const tx = b.x + b.vx * 0.15 - c.x, ty = b.y + b.vy * 0.15 - c.y, l = Math.hypot(tx, ty) || 1;
      out.x = tx / l; out.y = ty / l;
      const ca = Math.cos(c.a) * c.dir, sa = Math.sin(c.a) * c.dir;
      if ((ca * out.x + sa * out.y) > 0.75 && c.boost > 0) out.boost = true;
      if (b.y < c.y - 100 || Math.abs(b.x - c.x) > 900) bot.aerial = false;
    } else if (forceX === null) {
      out.x = c.dir * 0.9; out.y = c.vy < 0 ? -0.25 : 0;
      if (c.y > 300 && ry > 0 && Math.abs(rx) < 300) { out.x = (b.x - c.x) / 300; out.y = 0.6; }
    }
  }
  return fin();
}
