// WRESTLING. Same ring, same fighters, different sport: one fall, pinfall wins.
//
//   WASD          move                     SHIFT   block strikes
//   hold E        RUN. Run into the ropes and you BOUNCE OFF them and come back
//                 faster - anything you throw coming off the ropes hits harder.
//   ARROWS        strikes: LEFT chop, UP forearm, RIGHT big boot, DOWN low kick
//   running+ARROW LEFT/UP lariat, RIGHT/DOWN dropkick
//   SPACE (close) grab for a LOCK-UP. Press any arrow when the meter peaks to
//                 win it, then pick the move:
//                   LEFT suplex  UP body slam  RIGHT irish whip  DOWN DDT
//                   F (with a full star) the POWERBOMB finisher
//                 An irish whip sends him into the ropes; he bounces back at
//                 you - hit him with an arrow as he arrives.
//   SPACE (on a downed man) PIN him. Ref counts three.  DOWN near him: elbow drop
//   pinned yourself? MASH the arrows to kick out.
//   Q             sidestep a running attack
//
// Strike beats grab (it interrupts it), grab beats block, block beats strike.
//
// Pure simulation like fight.js: events out, no drawing here. The animator
// (pose()) is at the bottom and is called by the renderer.

import { RING, makeRng, makeFighter } from './fight.js';
import { POSE, clone, from, blend, easeOut, easeIn, easeIO, cl, rotatePose } from './boxer.js';

const ROPE_X = RING.x1 + 2;
const STRIKE = {
  left: { name: 'CHOP', start: 0.1, active: 0.05, rec: 0.18, dmg: 4.5, reach: 27, stun: 0.24, stam: 3 },
  up: { name: 'FOREARM', start: 0.15, active: 0.06, rec: 0.24, dmg: 7.5, reach: 25, stun: 0.3, stam: 5 },
  right: { name: 'BIG BOOT', start: 0.22, active: 0.07, rec: 0.3, dmg: 9, reach: 33, stun: 0.36, stam: 7 },
  down: { name: 'LOW KICK', start: 0.13, active: 0.05, rec: 0.2, dmg: 5, reach: 29, stun: 0.26, stam: 4 },
};
const RUNATK = {
  lariat: { name: 'LARIAT', start: 0.06, active: 0.16, rec: 0.35, dmg: 13, reach: 27 },
  dropkick: { name: 'DROPKICK', start: 0.1, active: 0.18, rec: 0.75, dmg: 15, reach: 30 },
};
const MOVES = {
  suplex: { name: 'SUPLEX', len: 1.15, at: 0.78, dmg: 14, down: 2.4 },
  slam: { name: 'BODY SLAM', len: 1.0, at: 0.7, dmg: 12, down: 2.2 },
  ddt: { name: 'DDT', len: 0.9, at: 0.6, dmg: 16, down: 2.8 },
  powerbomb: { name: 'POWERBOMB', len: 1.5, at: 1.12, dmg: 27, down: 3.6 },
  whip: { name: 'IRISH WHIP', len: 0.45, at: 0.3, dmg: 0, down: 0 },
  backdrop: { name: 'BACK BODY DROP', len: 0.8, at: 0.5, dmg: 13, down: 2.4 },
};
const ARROW_MOVE = { left: 'suplex', up: 'slam', right: 'whip', down: 'ddt' };

export function makeWrestle(a, b, opts = {}) {
  const fight = {
    kind: 'wrestle', f: [a, b], round: 1, rounds: 1, roundLen: 180, clock: 180, phase: 'intro', pt: 0, time: 0,
    events: [], rng: makeRng(opts.seed || 7), arena: opts.arena || 'wbowl', crowd: 0.3, mode: opts.mode || 'free',
    ref: { x: 0, z: 66, count: 0, mode: 'watch', raise: -1, walk: 0, face: 1 }, result: null, freeze: 0, slow: 1, slowT: 0,
    downIdx: -1, pin: null, lock: null,
  };
  for (const f of fight.f) setup(f);
  a.x = -70; b.x = 70; a.z = b.z = 38; a.face = 1; b.face = -1;
  return fight;
}
function setup(f) {
  Object.assign(f, {
    state: 'idle', t: 0, act: null, run: 0, runDir: 1, runT: 0, offRopes: 0, downT: 0, downLen: 0, lift: 0, rot: 0,
    move: null, partner: -1, layer: 0, kickouts: 0, mash: 0, mashNeed: 0, lockQ: -1, guard: 0, stars: 0, crouch: 0, flash: 0, stun: 0, hitT: 9, hitTarget: 'head', speedNow: 0, walk: 0, rope: 0, dodge: null,
  });
  f.stats = { thrown: 0, landed: 0, dmg: 0, blocked: 0, dodged: 0, power: 0, pins: 0 };
}
const ev = (fight, type, o = {}) => { o.type = type; fight.events.push(o); };

export function stepWrestle(fight, dt0) {
  if (fight.freeze > 0) { fight.freeze -= dt0; return; }
  if (fight.slowT > 0) { fight.slowT -= dt0; if (fight.slowT <= 0) fight.slow = 1; }
  const dt = dt0 * fight.slow;
  fight.time += dt; fight.pt += dt;
  fight.crowd = Math.max(0.2, fight.crowd - dt * 0.2);
  const [a, b] = fight.f;
  for (const f of fight.f) { f.flash = Math.max(0, f.flash - dt); f.hitT += dt; f.rope = Math.max(0, f.rope - dt * 2); }
  switch (fight.phase) {
    case 'intro':
      for (const f of fight.f) { f.t += dt; f.walk += dt * 3; const tx = f.side ? 34 : -34; f.x += Math.sign(tx - f.x) * Math.min(Math.abs(tx - f.x), 50 * dt); f.speedNow = Math.abs(tx - f.x) > 1 ? 40 : 0; }
      if (fight.pt > 2.2) { fight.phase = 'fight'; fight.pt = 0; ev(fight, 'bell', { start: true }); ev(fight, 'banner', { text: 'WRESTLE!', big: true }); }
      return;
    case 'fight':
      fight.clock -= dt;
      fighter(fight, a, b, dt); fighter(fight, b, a, dt);
      lockStep(fight, dt);
      separate(a, b);
      refStep(fight, dt);
      if (fight.clock <= 0 && fight.phase === 'fight') timeUp(fight);
      return;
    case 'pin': pinStep(fight, dt); refStep(fight, dt); return;
    case 'over':
      for (const f of fight.f) { f.t += dt; }
      refStep(fight, dt);
      return;
  }
}

// ---------------------------------------------------------------- fighter --
function fighter(fight, f, o, dt) {
  const I = f.intent;
  f.t += dt;
  f.offRopes = Math.max(0, f.offRopes - dt);
  f.stam = Math.min(f.st.stamMax, f.stam + f.st.regen * 0.8 * dt * (f.state === 'run' ? 0.2 : 1));
  if (f.state !== 'strike' && f.state !== 'runatk' && f.state !== 'thrown' && f.state !== 'hold' && f.state !== 'whipped' && f.state !== 'down' && f.state !== 'pinning') {
    if (Math.abs(o.x - f.x) > 3 && f.state !== 'run' && f.state !== 'rebound') f.face = o.x > f.x ? 1 : -1;
  }
  let mx = 0, mz = 0;
  f.guard = 0;
  switch (f.state) {
    case 'idle': {
      mx = I.mx; mz = I.mz;
      if (I.guard) { f.guard = 1; mx *= 0.4; mz *= 0.4; }
      const near = Math.abs(o.x - f.x) < 26 && Math.abs(o.z - f.z) < 11;
      if (I.slip && f.stam > 8) { f.state = 'dodge'; f.t = 0; f.dodgeDir = f.z < 38 ? 1 : -1; f.stam -= 6; break; }
      if (I.grab && o.state === 'down' && Math.abs(o.x - f.x) < 34 && Math.abs(o.z - f.z) < 14) { startPin(fight, f, o); break; }
      if (I.grab && near && canBeGrabbed(o)) { f.state = 'grab'; f.t = 0; f.stats.thrown++; ev(fight, 'swing', { side: f.side }); break; }
      const arr = I.arrows && I.arrows[0];
      if (arr === 'down' && o.state === 'down' && Math.abs(o.x - f.x) < 30 && Math.abs(o.z - f.z) < 14) { startMove(fight, f, o, 'elbow'); break; }
      if (arr) { startStrike(fight, f, arr); break; }
      if (I.run && (Math.abs(I.mx) > 0.2 || true) && f.stam > 10) {
        f.state = 'run'; f.t = 0; f.runT = 0; f.runDir = Math.abs(I.mx) > 0.2 ? Math.sign(I.mx) : f.face; f.face = f.runDir;
      }
      break;
    }
    case 'dodge': {
      mz = f.dodgeDir * 1.6; mx = 0;
      if (f.t > 0.32) { f.state = 'idle'; f.t = 0; }
      break;
    }
    case 'strike': {
      const A = f.act; const t0 = A.t; A.t += dt;
      if (t0 < A.start && A.t >= A.start) strikeHit(fight, f, o, A);
      if (A.t >= A.start + A.active + A.rec) { f.state = 'idle'; f.t = 0; f.act = null; }
      break;
    }
    case 'stun': { if (f.t > f.stun) { f.state = 'idle'; f.t = 0; } break; }
    case 'run': {
      f.runT += dt;
      const sp = f.st.foot * 2.2 * (f.offRopes > 0 ? 1.15 : 1);
      f.x += f.runDir * sp * dt;
      f.z += I.mz * 40 * dt;
      f.speedNow = sp; f.walk += dt * 14;
      f.stam = Math.max(0, f.stam - 6 * dt);
      f.face = f.runDir;
      if (f.x > ROPE_X - 6 && f.runDir > 0 || f.x < -ROPE_X + 6 && f.runDir < 0) {
        f.state = 'rebound'; f.t = 0; f.rope = 1; f.ropeSide = f.runDir;
        ev(fight, 'rebound', { side: f.side, x: f.x, z: f.z });
        break;
      }
      const arr = I.arrows && I.arrows[0];
      if (arr) { startRunAtk(fight, f, arr === 'left' || arr === 'up' ? 'lariat' : 'dropkick'); break; }
      // run straight into him with nothing thrown: a shoulder block
      if (Math.abs(o.x - f.x) < 18 && Math.abs(o.z - f.z) < 10 && Math.sign(o.x - f.x) === f.runDir && canBeHit(o)) {
        hurt(fight, f, o, 6, 'stun', 0.5, 'SHOULDER BLOCK'); f.state = 'idle'; f.t = 0; break;
      }
      if ((!I.run && f.runT > 0.35 && f.offRopes <= 0) || f.stam <= 0) { f.state = 'idle'; f.t = 0; f.speedNow = 0; }
      break;
    }
    case 'rebound': {
      // leaning back into the ropes, they stretch, then fire you back out
      f.rope = 1 - f.t / 0.28;
      if (f.t > 0.26) { f.state = 'run'; f.t = 0; f.runT = 0; f.runDir = -f.ropeSide; f.face = f.runDir; f.offRopes = 1.1; f.x = Math.sign(f.x) * (ROPE_X - 9); }
      break;
    }
    case 'runatk': {
      const A = f.act; A.t += dt;
      const sp = f.st.foot * 2.2 * (A.t < A.start + A.active ? 1 : Math.max(0, 1 - (A.t - A.start - A.active) * 3));
      f.x += f.runDir * sp * dt; f.speedNow = sp;
      if (!A.hit && A.t >= A.start && A.t <= A.start + A.active) {
        const dx = (o.x - f.x) * f.runDir;
        if (dx > -4 && dx < A.reach && Math.abs(o.z - f.z) < 12 && canBeHit(o)) {
          A.hit = true;
          const k = A.off ? 1.3 : 1;
          if (o.state === 'dodge') { ev(fight, 'dodge', { side: o.side, kind: 'slip', x: o.x, z: o.z, y: 40 }); A.hit = 'miss'; }
          else {
            hurt(fight, f, o, A.dmg * k, 'down', 2.0, (A.off ? 'OFF THE ROPES! ' : '') + A.name);
            fight.freeze = 0.12; fight.crowd = 1;
          }
        }
      }
      if (A.t >= A.start + A.active + A.rec) { f.state = A.kind === 'dropkick' ? 'getup' : 'idle'; f.t = 0; f.act = null; f.speedNow = 0; }
      break;
    }
    case 'grab': {
      // reaching for the collar. If he hits you first, it is gone.
      if (f.t > 0.16) {
        const near = Math.abs(o.x - f.x) < 28 && Math.abs(o.z - f.z) < 12;
        if (near && canBeGrabbed(o)) {
          if (o.state === 'idle' && o.guard) { winLock(fight, f, o, 'BLOCK DOESN\'T STOP A GRAB'); }
          else beginLock(fight, f, o);
        } else { f.state = 'idle'; f.t = 0; }
      }
      break;
    }
    case 'lock': break;   // handled by lockStep
    case 'hold': {
      // you won the lock-up: pick the move
      const arr = I.arrows && I.arrows[0];
      let mv = arr ? ARROW_MOVE[arr] : null;
      if (I.star && f.stars >= 1) { mv = 'powerbomb'; f.stars -= 1; }
      if (!mv && f.t > 1.1) mv = 'whip';
      if (mv) startMove(fight, f, o, mv);
      break;
    }
    case 'held': break;
    case 'move': moveStep(fight, f, o, dt); break;
    case 'thrown': break;   // driven by the thrower's move
    case 'whipped': {
      f.runT += dt;
      const sp = 150;
      f.x += f.runDir * sp * dt; f.speedNow = sp; f.walk += dt * 14; f.face = f.runDir;
      if (!f.bounced && (f.x > ROPE_X - 6 && f.runDir > 0 || f.x < -ROPE_X + 6 && f.runDir < 0)) {
        f.bounced = true; f.runDir *= -1; f.rope = 1; f.x = Math.sign(f.x) * (ROPE_X - 8);
        ev(fight, 'rebound', { side: f.side, x: f.x, z: f.z });
      }
      // coming back: the man who whipped him gets one swing as he arrives
      if (f.bounced) {
        const dx = (o.x - f.x) * f.runDir;
        if (dx < 34 && dx > -6 && Math.abs(o.z - f.z) < 12 && o.state === 'idle') {
          const arr = o.intent.arrows && o.intent.arrows[0];
          if (arr) {
            if (arr === 'down') { startMove(fight, o, f, 'backdrop'); }
            else { o.face = -f.runDir; o.state = 'runatk'; o.t = 0; o.runDir = -f.runDir; o.act = Object.assign({ kind: arr === 'right' ? 'dropkick' : 'lariat', t: RUNATK.lariat.start, hit: false, off: true }, arr === 'right' ? RUNATK.dropkick : RUNATK.lariat); }
            break;
          }
        }
        if (dx < -30 || f.runT > 2.5) { f.state = 'idle'; f.t = 0; f.speedNow = 0; f.bounced = false; }
      }
      break;
    }
    case 'down': {
      f.downT += dt;
      if (f.downT > f.downLen) { f.state = 'getup'; f.t = 0; }
      break;
    }
    case 'getup': if (f.t > 0.9) { f.state = 'idle'; f.t = 0; f.lift = 0; f.rot = 0; } break;
    case 'pinning': case 'pinned': break;
  }
  if (f.state === 'idle' || f.state === 'dodge') {
    const sp = f.st.foot * 0.95;
    f.x += mx * sp * dt; f.z += mz * sp * 0.75 * dt;
    f.speedNow = Math.hypot(mx, mz) * sp; f.walk += dt * (2 + f.speedNow * 0.16);
  }
  f.x = Math.max(-ROPE_X + 4, Math.min(ROPE_X - 4, f.x));
  f.z = Math.max(RING.z0, Math.min(RING.z1, f.z));
}

const canBeHit = (o) => !['down', 'thrown', 'pinned', 'pinning', 'getup', 'move', 'held', 'hold', 'lock'].includes(o.state);
const canBeGrabbed = (o) => ['idle', 'stun', 'strike', 'grab'].includes(o.state) && !(o.state === 'strike' && o.act && o.act.t >= o.act.start);

function startStrike(fight, f, dir) {
  const s = STRIKE[dir];
  if (f.stam < s.stam * 0.5) return;
  f.stam -= s.stam;
  f.state = 'strike'; f.t = 0;
  f.act = Object.assign({ kind: dir, t: 0 }, s);
  f.stats.thrown++;
  ev(fight, 'swing', { side: f.side });
}
function startRunAtk(fight, f, kind) {
  f.state = 'runatk'; f.t = 0;
  f.act = Object.assign({ kind, t: 0, hit: false, off: f.offRopes > 0 }, RUNATK[kind]);
  f.stam = Math.max(0, f.stam - 8);
  f.stats.thrown++;
  ev(fight, 'swing', { side: f.side });
}
function strikeHit(fight, f, o, A) {
  const dx = (o.x - f.x) * f.face;
  if (dx < -2 || dx > A.reach || Math.abs(o.z - f.z) > 12 || !canBeHit(o)) { ev(fight, 'whiff', { side: f.side }); return; }
  if (o.state === 'grab') { /* strike beats grab */ ev(fight, 'text', { side: f.side, text: 'STUFFED IT!', col: 'hot' }); }
  if (o.state === 'idle' && o.guard) {
    o.hp -= A.dmg * 0.2; o.stats.blocked++;
    ev(fight, 'block', { side: o.side, by: f.side, x: o.x - f.face * 4, z: o.z, y: 42 });
    return;
  }
  hurt(fight, f, o, A.dmg, 'stun', A.stun, null);
}
function hurt(fight, f, o, dmg, state, len, label) {
  dmg *= f.st.power;
  o.hp = Math.max(0, o.hp - dmg);
  o.state = state; o.t = 0; o.act = null; o.stun = len; o.flash = 0.06; o.hitT = 0; o.hitTarget = 'head';
  if (state === 'down') { o.downT = 0; o.downLen = len + (1 - o.hp / o.st.hpMax) * 1.2; }
  f.stats.landed++; f.stats.dmg += dmg; if (dmg >= 11) f.stats.power++;
  f.stars = Math.min(3, f.stars + dmg / 60);
  fight.crowd = Math.min(1, fight.crowd + dmg / 30);
  ev(fight, 'hit', { side: o.side, by: f.side, kind: 'hook', target: 'head', dmg, big: dmg >= 11, counter: false, x: o.x, z: o.z, y: state === 'down' ? 20 : 42, face: f.face });
  if (label) ev(fight, 'text', { side: f.side, text: label, col: 'hot' });
}

// ------------------------------------------------------------- lock-up ---
// A timing game, not a mashing one: the meter swings, you press once, and
// the closer to the top of the swing you press the stronger your grip.
function beginLock(fight, f, o) {
  f.state = 'lock'; o.state = 'lock'; f.t = o.t = 0; f.act = o.act = null; f.lockQ = o.lockQ = -1;
  o.face = -f.face; o.x = f.x + f.face * 17; o.z = f.z;
  fight.lock = { a: f.side, b: o.side, t: 0 };
  ev(fight, 'lock', {});
}
export const lockMeter = (t) => Math.abs(Math.sin(t * 4.2));
function lockStep(fight, dt) {
  const L = fight.lock;
  if (!L) return;
  L.t += dt;
  for (const s of [L.a, L.b]) {
    const f = fight.f[s];
    const pressed = (f.intent.arrows && f.intent.arrows.length) || f.intent.grab;
    if (f.lockQ < 0 && pressed) f.lockQ = 1 - Math.abs(1 - lockMeter(L.t));
  }
  const A = fight.f[L.a], B = fight.f[L.b];
  if (L.t > 1.3 || (A.lockQ >= 0 && B.lockQ >= 0 && L.t > 0.35)) {
    const pa = Math.max(0, A.lockQ) * 1.4 + A.st.power * 0.6 + A.stam / A.st.stamMax * 0.3 + fight.rng() * 0.25 + 0.08;
    const pb = Math.max(0, B.lockQ) * 1.4 + B.st.power * 0.6 + B.stam / B.st.stamMax * 0.3 + fight.rng() * 0.25;
    fight.lock = null;
    if (pa >= pb) winLock(fight, A, B, A.lockQ > 0.85 ? 'PERFECT GRIP!' : null);
    else winLock(fight, B, A, B.lockQ > 0.85 ? 'PERFECT GRIP!' : 'REVERSED!');
  }
}
function winLock(fight, w, l, label) {
  fight.lock = null;
  w.state = 'hold'; w.t = 0; l.state = 'held'; l.t = 0;
  l.face = -w.face; l.x = w.x + w.face * 16; l.z = w.z;
  w.partner = l.side; l.partner = w.side;
  if (label) ev(fight, 'text', { side: w.side, text: label, col: 'hot' });
  ev(fight, 'holdWon', { side: w.side });
}

// --------------------------------------------------------------- moves ---
function startMove(fight, f, o, kind) {
  if (kind === 'elbow') {
    f.state = 'move'; f.t = 0; f.move = { kind: 'elbow', len: 0.75, at: 0.5, dmg: 8, done: false, name: 'ELBOW DROP' };
    f.partner = o.side; f.stats.thrown++;
    return;
  }
  const M = MOVES[kind];
  f.state = 'move'; f.t = 0; f.move = Object.assign({ kind, done: false }, M);
  o.state = 'thrown'; o.t = 0; o.act = null; o.partner = f.side;
  f.partner = o.side;
  f.stats.thrown++;
  o.face = -f.face;
  o.ox = o.x - f.x;    // where he started, relative to you
  ev(fight, 'text', { side: f.side, text: M.name + (kind === 'powerbomb' ? '!!' : '!'), col: kind === 'powerbomb' ? 'bad' : 'hot' });
  if (kind === 'powerbomb') { fight.slow = 0.6; fight.slowT = 1.0; }
}
function moveStep(fight, f, o, dt) {
  const M = f.move;
  if (M.kind !== 'elbow') {
    // the thrown man rides along with the thrower; the animator does the arc
    o.t = f.t; o.z = f.z;
    const k = cl(f.t / M.len);
    let off;
    switch (M.kind) {
      case 'suplex': off = 17 - 40 * easeIO(cl((f.t - 0.2) / 0.6)); break;   // up and over, lands BEHIND you
      case 'slam': off = 18; break;
      case 'ddt': off = 12; break;
      case 'powerbomb': off = 14 + 6 * k; break;
      case 'whip': off = 17; break;
      case 'backdrop': off = 14 - 34 * easeIO(cl((f.t - 0.1) / 0.5)); break;
      default: off = 16;
    }
    o.x = f.x + f.face * off;
  }
  if (!M.done && f.t >= M.at) {
    M.done = true;
    if (M.kind === 'whip') {
      o.state = 'whipped'; o.t = 0; o.runT = 0; o.runDir = f.face; o.bounced = false; o.face = f.face;
      f.state = 'idle'; f.t = 0; f.move = null;
      ev(fight, 'whip', { side: o.side });
      return;
    }
    hurt(fight, f, o, M.dmg, 'down', M.down, null);
    o.flash = 0.1; fight.freeze = 0.14; fight.crowd = 1;
    ev(fight, 'slam', { x: o.x, z: o.z, big: M.dmg >= 14 });
  }
  if (f.t >= M.len) {
    f.state = M.kind === 'suplex' || M.kind === 'ddt' ? 'getup' : 'idle'; f.t = 0; f.move = null; f.partner = -1;
    if (o.state === 'thrown') { o.state = 'down'; o.downT = 0; o.downLen = 2; }
  }
}

// ----------------------------------------------------------------- pins --
function startPin(fight, f, o) {
  f.state = 'pinning'; o.state = 'pinned'; f.t = o.t = 0;
  f.x = o.x; f.z = o.z;
  f.partner = o.side;
  fight.phase = 'pin'; fight.pt = 0; fight.pin = { by: f.side, on: o.side, count: 0, kickAt: 99 };
  o.mash = 0;
  const frac = o.hp / o.st.hpMax;
  o.mashNeed = 5 + Math.round((1 - frac) * 26) + o.kickouts * 3;
  if (!o.human) {
    const heart = (o.profile && o.profile.ai && o.profile.ai.heart) || 0.5;
    const p = Math.min(0.97, frac * 1.7 + heart * 0.25 - o.kickouts * 0.08);
    fight.pin.kickAt = fight.rng() < p ? 0.6 + fight.rng() * (frac < 0.35 ? 2.3 : 1.6) : 99;
  }
  f.stats.pins++;
  ev(fight, 'pin', { side: f.side });
}
const PIN_BEAT = 0.85;
function pinStep(fight, dt) {
  fight.pt += 0;
  const P = fight.pin, A = fight.f[P.by], B = fight.f[P.on];
  A.t += dt; B.t += dt;
  const n = Math.floor(fight.pt / PIN_BEAT);
  if (n !== P.count && n <= 3) { P.count = n; if (n > 0) ev(fight, 'count', { n, pin: true }); fight.ref.count = n; fight.ref.countT = 0; }
  fight.ref.countT = (fight.ref.countT || 0) + dt;
  fight.ref.mode = 'pin';
  B.mash += B.intent.mash || 0;
  const out = B.human ? B.mash >= B.mashNeed : fight.pt / PIN_BEAT >= P.kickAt;
  if (out && fight.pt / PIN_BEAT < 3) {
    const late = fight.pt / PIN_BEAT > 2.3;
    B.kickouts++;
    A.state = 'getup'; A.t = 0; B.state = 'getup'; B.t = 0; B.hp = Math.min(B.st.hpMax, B.hp + 4);
    fight.phase = 'fight'; fight.pin = null; fight.ref.mode = 'watch'; fight.ref.count = 0;
    ev(fight, 'banner', { text: late ? 'KICKED OUT AT 2.9!' : 'KICK OUT!', col: 'good' });
    fight.crowd = 1;
    return;
  }
  if (fight.pt >= PIN_BEAT * 3 + 0.25) {
    fight.phase = 'over'; fight.pt = 0;
    fight.result = { winner: A.side, method: 'PINFALL', round: 1 };
    A.state = 'win'; A.t = 0; B.state = 'pinned';
    fight.ref.mode = 'watch'; fight.ref.raise = A.side;
    fight.crowd = 1;
    ev(fight, 'over', { result: fight.result });
    ev(fight, 'banner', { text: '1, 2, 3!', big: true, col: 'hot' });
  }
}
function timeUp(fight) {
  const [a, b] = fight.f;
  const da = a.stats.dmg, db = b.stats.dmg;
  const w = Math.abs(da - db) < 8 ? -1 : da > db ? 0 : 1;
  fight.phase = 'over'; fight.pt = 0;
  fight.result = { winner: w, method: w < 0 ? 'TIME LIMIT DRAW' : 'DECISION', round: 1 };
  if (w >= 0) { fight.f[w].state = 'win'; fight.f[w].t = 0; fight.ref.raise = w; }
  ev(fight, 'bell', { end: true });
  ev(fight, 'over', { result: fight.result });
  ev(fight, 'banner', { text: w < 0 ? 'TIME LIMIT DRAW' : fight.f[w].name + ' WINS', big: w < 0 });
}

function separate(a, b) {
  const busy = (f) => ['move', 'thrown', 'lock', 'hold', 'held', 'pinning', 'pinned', 'whipped', 'run', 'runatk', 'down', 'getup'].includes(f.state);
  if (busy(a) || busy(b)) return;
  const dx = b.x - a.x;
  if (Math.abs(b.z - a.z) < 10 && Math.abs(dx) < 16) { const p = (16 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1); a.x -= p; b.x += p; }
}
function refStep(fight, dt) {
  const R = fight.ref, [a, b] = fight.f;
  if (fight.phase === 'pin') {
    const B = fight.f[fight.pin.on];
    const tx = B.x - 16 * (B.x > 0 ? 1 : -1), tz = Math.min(RING.z1, B.z + 6);
    R.x += (tx - R.x) * Math.min(1, dt * 8); R.z += (tz - R.z) * Math.min(1, dt * 8);
    R.face = B.x > R.x ? 1 : -1;
    return;
  }
  if (fight.phase === 'over' && fight.result && fight.result.winner >= 0) {
    const W = fight.f[fight.result.winner];
    R.x += (W.x - 14 * Math.sign(W.x || 1) - R.x) * Math.min(1, dt * 3); R.z += (W.z + 2 - R.z) * Math.min(1, dt * 3);
    R.face = W.x > R.x ? 1 : -1;
    return;
  }
  const mx = (a.x + b.x) / 2, tz = Math.min(RING.z1 + 2, Math.max(a.z, b.z) + 20);
  const ox = R.x, oz = R.z;
  R.x += (mx + 12 - R.x) * Math.min(1, dt * 1.5); R.z += (tz - R.z) * Math.min(1, dt * 1.5);
  R.walk += Math.hypot(R.x - ox, R.z - oz) * 0.25;
  R.face = mx > R.x ? 1 : -1; R.mode = 'watch';
}

// ================================================================== AI ===
export function makeWrestleAI(profile, rng) {
  const P = (profile && profile.ai) || { react: 0.25, strike: 0.5, grab: 0.4, run: 0.25, block: 0.4, timing: 0.6, pinAt: 0.6, moves: { suplex: 2, slam: 2, whip: 2, ddt: 1 }, heart: 0.6 };
  const m = { think: 0, plan: null, react: null, seen: -1, timingT: -1, blockT: 0, seenRun: -1, pressT: 0, oppGuardT: 0 };
  const pick = () => { let tot = 0; for (const k in P.moves) tot += P.moves[k]; let r = rng() * tot; for (const k in P.moves) { r -= P.moves[k]; if (r <= 0) return k; } return 'slam'; };
  const ARROW = { suplex: 'left', slam: 'up', whip: 'right', ddt: 'down' };
  return {
    update(fight, me, o, dt) {
      const I = { mx: 0, mz: 0, guard: false, arrows: [], grab: false, run: false, slip: false, star: false, mash: 0 };
      m.think -= dt; m.blockT = Math.max(0, m.blockT - dt);
      m.oppGuardT = o.guard ? m.oppGuardT + dt : 0;
      const dx = o.x - me.x, adx = Math.abs(dx), dz = o.z - me.z;
      if (fight.phase === 'pin') {
        if (fight.pin && fight.pin.on === me.side) I.mash = rng() < 0.3 ? 1 : 0;
        return I;
      }
      if (fight.phase !== 'fight') return I;
      if (fight.lock && (me.state === 'lock')) {
        // press near the top of the meter, with a skill-sized error
        if (me.lockQ < 0) {
          const target = 1 - (1 - P.timing) * 0.6 * rng();
          if (lockMeter(fight.lock.t) >= target && fight.lock.t > 0.15) I.arrows.push('up');
          if (fight.lock.t > 1.0) I.arrows.push('up');
        }
        return I;
      }
      if (me.state === 'hold') {
        if (me.t > P.react * 0.8) {
          if (me.stars >= 1 && rng() < 0.6) I.star = true;
          else I.arrows.push(ARROW[pick()]);
        }
        return I;
      }
      // you whipped him: meet him as he comes back off the ropes
      if (o.state === 'whipped' && o.bounced) {
        const ddx = (me.x - o.x) * o.runDir;
        if (ddx < 30 + P.react * 60 && ddx > 0) I.arrows.push(rng() < 0.35 ? 'down' : rng() < 0.5 ? 'right' : 'left');
        I.mz = Math.sign(o.z - me.z) * (Math.abs(o.z - me.z) > 3 ? 1 : 0);
        return I;
      }
      // he is running at you: sidestep or brace
      if ((o.state === 'run' || o.state === 'runatk') && Math.sign(me.x - o.x) === o.runDir && adx < 90 && Math.abs(dz) < 14) {
        if (m.seenRun !== o.runT && rng() < 0.04 + P.block * 0.08) { I.slip = true; m.seenRun = o.runT; }
      }
      // read strikes: block them
      if (o.state === 'strike' && o.act && adx < 40 && rng() < P.block * 0.12) m.blockT = 0.35;
      if (m.blockT > 0) { I.guard = true; return I; }
      // he is down: pin him if he is hurt enough, otherwise drop an elbow or let him up
      if (o.state === 'down') {
        I.mx = Math.abs(dx) > 18 ? Math.sign(dx) : 0; I.mz = Math.abs(dz) > 4 ? Math.sign(dz) : 0;
        if (adx < 30 && Math.abs(dz) < 12) {
          if (o.hp / o.st.hpMax < P.pinAt || rng() < 0.01) I.grab = true;
          else if (rng() < 0.03) I.arrows.push('down');
        }
        return I;
      }
      if (me.state !== 'idle' && me.state !== 'run') return I;
      if (me.state === 'run') {
        I.run = true; I.mx = me.runDir;
        const ahead = (o.x - me.x) * me.runDir;
        if (ahead > 0 && ahead < 34 && Math.abs(dz) < 10) I.arrows.push(rng() < 0.6 ? 'left' : 'right');
        I.mz = Math.sign(dz) * (Math.abs(dz) > 3 ? 1 : 0);
        if (me.offRopes <= 0 && me.runT > 1.2 && ahead < 0) I.run = false;
        return I;
      }
      // close in and choose
      if (m.think <= 0) {
        m.think = 0.25 + rng() * 0.3;
        m.plan = null;
        const r = rng();
        // you have been sitting behind a block: grab you (grab beats block)
        if (m.oppGuardT > 0.4 && adx < 40) m.plan = 'grab';
        else if (r < P.run * 0.35 && adx > 60) m.plan = 'run';
        else if (r < P.run * 0.35 + P.grab * 0.5) m.plan = 'grab';
        else if (r < P.run * 0.35 + P.grab * 0.5 + P.strike * 0.6) m.plan = 'strike';
      }
      if (m.plan === 'run') {
        I.run = true; I.mx = -Math.sign(dx) || 1; // run AWAY to the ropes, come back off them
        m.plan = null;
        return I;
      }
      const want = m.plan === 'grab' ? 18 : m.plan === 'strike' ? 22 : 30;
      if (adx > want + 3) I.mx = Math.sign(dx); else if (adx < want - 4) I.mx = -Math.sign(dx) * 0.6;
      I.mz = Math.abs(dz) > 3 ? Math.sign(dz) : 0;
      if (adx < want + 6 && Math.abs(dz) < 8) {
        if (m.plan === 'grab') { I.grab = true; m.plan = null; }
        else if (m.plan === 'strike') { I.arrows.push(['left', 'up', 'right', 'down'][Math.floor(rng() * 4)]); m.plan = null; }
      }
      return I;
    },
  };
}

// ============================================================== ANIMATOR ===
// Poses for every wrestling state, including both bodies in a throw: the
// thrower's pose is keyframed, the thrown man's whole body is ROTATED and
// LIFTED along an arc so he goes up and over in one piece.
const LOCKUP = from(POSE.guard, { neck: [5, 35], head: [8, 41], hip: [0, 20], eF: [13, 39], gF: [19, 42], eB: [10, 33], gB: [17, 33], kL: [9, 10], kR: [-5, 10], fL: [10, 0], fR: [-9, 0] });
const RUN = from(POSE.guard, { neck: [7, 35], head: [10, 41], hip: [1, 21], eF: [10, 28], gF: [16, 34], eB: [-4, 29], gB: [-2, 22], kL: [9, 12], kR: [-6, 9], fL: [10, 0], fR: [-10, 3] });
const REBOUND = from(POSE.guard, { neck: [-5, 34], head: [-8, 39], hip: [-1, 20], eF: [-6, 34], gF: [-12, 36], eB: [-8, 32], gB: [-14, 33], kL: [9, 11], kR: [-3, 11], fL: [12, 0], fR: [-2, 0] });
const LARIAT = from(POSE.guard, { neck: [6, 36], head: [9, 42], hip: [1, 21], eF: [12, 40], gF: [24, 41], eB: [-5, 30], gB: [-7, 24], kL: [9, 11], kR: [-6, 10], fL: [10, 0], fR: [-10, 2] });
const DROPKICK = from(POSE.guard, { hip: [0, 26], neck: [-12, 30], head: [-17, 32], kL: [10, 30], fL: [21, 32], kR: [9, 25], fR: [20, 27], eF: [-8, 36], gF: [-14, 40], eB: [-9, 26], gB: [-15, 22] });
const CHOP = from(POSE.guard, { neck: [5, 36], head: [7, 42], eF: [14, 42], gF: [22, 37], eB: [2, 30], gB: [6, 36], tw: 0.6 });
const FOREARM = from(POSE.guard, { neck: [6, 35], head: [8, 41], eF: [17, 41], gF: [14, 46], eB: [2, 30], gB: [6, 36], tw: 0.8, fL: [10, 0] });
const BOOT = from(POSE.guard, { hip: [-2, 21], neck: [-4, 37], head: [-3, 43], kL: [13, 21], fL: [27, 28], eF: [4, 30], gF: [8, 36], eB: [-4, 30], gB: [-8, 27] });
const LOWKICK = from(POSE.guard, { hip: [-1, 21], neck: [0, 37], head: [2, 43], kL: [12, 11], fL: [24, 6], eF: [8, 30], gF: [12, 36] });
const HOLD = from(LOCKUP, { gF: [17, 38], gB: [16, 31] });
const LIFT = from(POSE.guard, { hip: [0, 18], neck: [3, 33], head: [6, 39], eF: [10, 40], gF: [13, 48], eB: [6, 38], gB: [9, 47], kL: [9, 9], kR: [-6, 9] });
const OVERHEAD = from(POSE.guard, { neck: [1, 38], head: [2, 44], eF: [6, 50], gF: [8, 58], eB: [0, 50], gB: [2, 58] });
const ARCH = from(POSE.guard, { hip: [-2, 18], neck: [-12, 30], head: [-16, 33], eF: [-14, 38], gF: [-18, 42], eB: [-16, 36], gB: [-20, 40], kL: [7, 10], kR: [-2, 10] });
const KNEEL = POSE.kneel;
const PINP = from(POSE.guard, { fL: [-16, 3], fR: [-14, 2], kL: [-9, 5], kR: [-8, 4], hip: [-2, 7], neck: [12, 9], head: [16, 11], eF: [12, 4], gF: [6, 3], eB: [8, 6], gB: [2, 6], tw: 0 });
const LIMP = from(POSE.guard, { eF: [6, 26], gF: [8, 20], eB: [2, 26], gB: [3, 20], head: [5, 41], neck: [2, 36] });
const WHIPSWING = from(POSE.guard, { neck: [4, 36], head: [7, 42], eF: [14, 34], gF: [24, 33], eB: [2, 30], gB: [6, 36], tw: 0.6 });

export function wrestlePose(f, fight, now) {
  const t = f.t || 0;
  const st = f.state;
  switch (st) {
    case 'run': case 'whipped': {
      const p = clone(RUN), ph = Math.sin((f.walk || t * 14) * 1.1);
      p.fL[0] += ph * 7; p.fR[0] -= ph * 7; p.fL[1] += Math.max(0, -ph) * 4; p.fR[1] += Math.max(0, ph) * 4;
      p.kL[0] += ph * 4; p.kR[0] -= ph * 4;
      p.gF[0] -= ph * 5; p.gB[0] += ph * 5; p.eF[0] -= ph * 3; p.eB[0] += ph * 3;
      return p;
    }
    case 'rebound': return blend(RUN, REBOUND, easeOut(cl(t / 0.12)));
    case 'runatk': {
      const A = f.act || {};
      const K = A.kind === 'dropkick' ? DROPKICK : LARIAT;
      const p = A.t < A.start ? blend(RUN, K, easeOut(cl(A.t / A.start))) : A.t < A.start + A.active ? clone(K) : blend(K, A.kind === 'dropkick' ? POSE.down : POSE.guard, easeIO(cl((A.t - A.start - A.active) / Math.max(0.1, A.rec * 0.6))));
      if (A.kind === 'dropkick') p.lift = Math.sin(cl(A.t / (A.start + A.active + 0.1)) * Math.PI) * 14;
      return p;
    }
    case 'strike': {
      const A = f.act || {};
      const K = { left: CHOP, up: FOREARM, right: BOOT, down: LOWKICK }[A.kind] || CHOP;
      if (A.t < A.start) return blend(POSE.guard, K, easeIn(cl(A.t / A.start)));
      if (A.t < A.start + A.active) return clone(K);
      return blend(K, POSE.guard, easeIO(cl((A.t - A.start - A.active) / A.rec)));
    }
    case 'grab': return blend(POSE.guard, LOCKUP, easeOut(cl(t / 0.16)));
    case 'lock': { const p = clone(LOCKUP); const s = Math.sin(now * 9 + f.side * 2) * 1.2; p.hip[0] += s; p.neck[0] += s; p.head[0] += s; return p; }
    case 'hold': return clone(HOLD);
    case 'held': return clone(LOCKUP);
    case 'move': return moverPose(f, t);
    case 'thrown': return thrownPose(f, fight);
    case 'stun': return blend(POSE.hitHead, POSE.guard, easeIO(cl(t / Math.max(0.1, f.stun))));
    case 'dodge': { const p = clone(POSE.slip); p.fL[0] += 2; return p; }
    case 'down': { const p = clone(POSE.down); p.gF[1] += Math.max(0, Math.sin(t * 2)) * 2; return p; }
    case 'getup': return t < 0.45 ? blend(POSE.down, KNEEL, easeIO(t / 0.45)) : blend(KNEEL, POSE.guard, easeIO(cl((t - 0.45) / 0.45)));
    case 'pinning': { const p = clone(PINP); p.lift = 6; return p; }
    case 'pinned': return clone(POSE.down);
    case 'win': {
      const p = clone(POSE.win); const hop = Math.abs(Math.sin(t * 6)) * 2;
      for (const k of ['hip', 'neck', 'head', 'eF', 'gF', 'eB', 'gB']) p[k][1] += hop;
      return p;
    }
    default: {
      const p = clone(f.guard ? POSE.blockHi : POSE.guard);
      // wrestlers stand taller and wider than boxers, hands open and low
      p.gF = [12, 33]; p.eF = [8, 27]; p.gB = [7, 32]; p.eB = [3, 26];
      if (f.guard) { p.gF = [10, 42]; p.eF = [9, 33]; p.gB = [8, 41]; p.eB = [5, 32]; }
      const sp = f.speedNow || 0;
      if (sp > 6) { const ph = Math.sin((f.walk || 0) * 2.2), a = Math.min(1, sp / 50); p.fL[0] += ph * 3 * a; p.fR[0] -= ph * 3 * a; p.fL[1] += Math.max(0, Math.cos((f.walk || 0) * 2.2)) * 1.5 * a; }
      const b = (Math.sin(now * 4 + f.side) * 0.5 + 0.5) * 0.8;
      for (const k of ['hip', 'neck', 'head', 'eF', 'gF', 'eB', 'gB']) p[k][1] += b;
      return p;
    }
  }
}
function moverPose(f, t) {
  const M = f.move; if (!M) return clone(POSE.guard);
  const k = cl(t / M.len);
  switch (M.kind) {
    case 'suplex': {
      if (t < 0.2) return blend(HOLD, LIFT, easeOut(t / 0.2));
      if (t < M.at) return blend(LIFT, ARCH, easeIO(cl((t - 0.2) / (M.at - 0.2))));
      const p = rotatePose(ARCH, -0.9 * easeIn(cl((t - M.at) / 0.15)), 0, 0); return p;
    }
    case 'slam': case 'powerbomb': {
      const up = M.kind === 'powerbomb' ? 0.55 : 0.4;
      if (t < up) return blend(HOLD, OVERHEAD, easeOut(t / up));
      if (t < M.at) return clone(OVERHEAD);
      return blend(OVERHEAD, M.kind === 'powerbomb' ? KNEEL : LIFT, easeIn(cl((t - M.at) / 0.12)));
    }
    case 'ddt': {
      if (t < 0.3) return blend(HOLD, from(HOLD, { gF: [10, 38], gB: [8, 37] }), t / 0.3);
      const p = rotatePose(from(HOLD, { gF: [10, 38], gB: [8, 37] }), -1.45 * easeIn(cl((t - 0.3) / 0.3)), 0, 0); return p;
    }
    case 'whip': return t < 0.25 ? blend(HOLD, WHIPSWING, easeOut(t / 0.25)) : clone(WHIPSWING);
    case 'backdrop': return t < 0.25 ? blend(POSE.guard, LIFT, easeOut(t / 0.25)) : blend(LIFT, OVERHEAD, easeOut(cl((t - 0.25) / 0.3)));
    case 'elbow': {
      if (t < 0.3) return blend(POSE.guard, from(POSE.guard, { eF: [6, 46], gF: [2, 40], hip: [0, 24] }), t / 0.3);
      const p = rotatePose(from(POSE.guard, { eF: [10, 30], gF: [4, 30] }), 1.4 * easeIn(cl((t - 0.3) / 0.2)), 0, 0); p.lift = (1 - cl((t - 0.3) / 0.2)) * 10; return p;
    }
  }
  return clone(POSE.guard);
}
// the thrown man's pose: limp body, rotated along the move's arc
function thrownPose(o, fight) {
  const f = fight.f[o.partner];
  const M = f && f.move;
  if (!M) return clone(POSE.down);
  const t = f.t;
  let ang = 0, lift = 0, base = LIMP;
  switch (M.kind) {
    case 'suplex': {
      const k = easeIO(cl((t - 0.2) / (M.at - 0.2)));
      ang = -Math.PI * k; lift = t < 0.2 ? easeOut(t / 0.2) * 10 : Math.sin(k * Math.PI) * 26 + (1 - k) * 10;
      if (t >= M.at) return clone(POSE.down);
      break;
    }
    case 'slam': {
      const up = 0.4;
      if (t < up) { ang = -Math.PI / 2 * easeOut(t / up); lift = easeOut(t / up) * 34; }
      else if (t < M.at) { ang = -Math.PI / 2; lift = 34; }
      else return clone(POSE.down);
      break;
    }
    case 'powerbomb': {
      if (t < 0.55) { ang = -Math.PI * easeOut(t / 0.55) * 0.95; lift = easeOut(t / 0.55) * 44; }
      else if (t < M.at) { ang = -Math.PI * 0.95; lift = 44 + Math.sin(t * 20) * 1; }
      else return clone(POSE.down);
      break;
    }
    case 'ddt': {
      if (t < 0.3) { ang = 0.4 * (t / 0.3); lift = 0; }
      else if (t < M.at) { ang = 0.4 + 1.6 * easeIn(cl((t - 0.3) / 0.3)); lift = 0; }
      else return clone(POSE.down);
      break;
    }
    case 'whip': return blend(LOCKUP, RUN, cl(t / 0.3));
    case 'backdrop': {
      const k = easeIO(cl((t - 0.1) / 0.4));
      ang = Math.PI * k; lift = Math.sin(k * Math.PI) * 30;
      if (t >= M.at) return clone(POSE.down);
      base = RUN;
      break;
    }
    default: return clone(POSE.down);
  }
  const p = rotatePose(base, ang, 0, 26);
  p.lift = lift;
  return p;
}

// default rosters for the mode
export const WRESTLERS = [
  { id: 'relampago', name: 'EL RELAMPAGO', nick: 'THE LIGHTNING', style: 'HIGH FLYER', record: '88-21',
    look: { skin: 2, hair: 'long', hairC: '#120c0a', beard: 'none', outfit: 'wrestler', trunks: ['#3ad0ff', '#1a8ac0', '#0a4a78'], stripe: '#ffd84a', shoes: '#ffffff', build: { w: 0.9, h: 1.0 }, mask: '#3ad0ff', maskTrim: '#ffd84a', hands: 'wraps', pads: '#ffd84a' },
    lv: { power: 3, speed: 6, foot: 8, health: 4, stamina: 6, chin: 2 },
    ai: { react: 0.2, strike: 0.5, grab: 0.3, run: 0.8, block: 0.3, timing: 0.6, pinAt: 0.5, moves: { whip: 3, ddt: 2, suplex: 1, slam: 1 }, heart: 0.6 },
    strengths: ['RUNS THE ROPES - flies off them with lariats and dropkicks', 'fast hands in a lock-up'], weaknesses: ['LIGHT - easy to slam once you win the lock-up', 'gets tired from all the running'] },
  { id: 'bulldozer', name: 'THE BULLDOZER', nick: 'TANK', style: 'POWERHOUSE', record: '64-12',
    look: { skin: 0, hair: 'bald', hairC: '#000', beard: 'full', beardC: '#7a3f22', outfit: 'wrestler', trunks: ['#2a2a33', '#1a1a22', '#0a0a10'], stripe: '#ff7a2e', shoes: '#2a2a33', build: { w: 1.32, h: 1.06 }, hands: 'wraps', pads: '#ff7a2e', belly: 0.4 },
    lv: { power: 8, speed: 1, foot: 1, health: 8, stamina: 3, chin: 6 },
    ai: { react: 0.32, strike: 0.6, grab: 0.6, run: 0.15, block: 0.25, timing: 0.75, pinAt: 0.55, moves: { slam: 3, suplex: 2, ddt: 1, whip: 1 }, heart: 0.8 },
    strengths: ['WINS LOCK-UPS - strongest grip in the business', 'SLAMS hurt'], weaknesses: ['SLOW - run the ropes and take him off his feet', 'barely blocks'] },
  { id: 'dana', name: 'DIAMOND DANA', nick: 'THE TECHNICIAN', style: 'TECHNICIAN', record: '102-9',
    look: { skin: 1, hair: 'braids', hairC: '#c9a050', beard: 'none', outfit: 'wrestler', trunks: ['#ff3d7f', '#b81a52', '#6a0a2a'], stripe: '#ffffff', shoes: '#ff3d7f', build: { w: 0.94, h: 1.0 }, top: '#ff3d7f', hands: 'wraps', pads: '#ffffff' },
    lv: { power: 5, speed: 6, foot: 6, health: 6, stamina: 7, chin: 4 },
    ai: { react: 0.18, strike: 0.45, grab: 0.55, run: 0.3, block: 0.6, timing: 0.9, pinAt: 0.65, moves: { suplex: 3, ddt: 3, whip: 2, slam: 1 }, heart: 0.75 },
    strengths: ['PERFECT TIMING in the lock-up', 'blocks strikes and pins early'], weaknesses: ['average power - strikes and running attacks get through'] },
  { id: 'kingpin', name: 'KINGPIN', nick: 'THE CHAMP', style: 'CHAMPION', record: '140-3',
    look: { skin: 4, hair: 'mohawk', hairC: '#ffd84a', beard: 'goatee', beardC: '#120c0a', outfit: 'wrestler', trunks: ['#ffd84a', '#c9961c', '#7a5a0a'], stripe: '#1a1a22', shoes: '#ffd84a', build: { w: 1.14, h: 1.06 }, belt: true, hands: 'wraps', pads: '#1a1a22' },
    lv: { power: 8, speed: 6, foot: 6, health: 9, stamina: 8, chin: 7 },
    ai: { react: 0.16, strike: 0.55, grab: 0.55, run: 0.45, block: 0.55, timing: 0.85, pinAt: 0.5, moves: { slam: 2, suplex: 2, whip: 3, ddt: 2 }, heart: 0.9 },
    strengths: ['does everything', 'goes for the POWERBOMB the moment he has a star'], weaknesses: ['cocky - lets you up to show off, so pin him when HE is down'] },
];
