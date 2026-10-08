// THE FIGHT. Pure simulation: no DOM, no drawing, no sound. Everything that
// happens comes out as an event in `fight.events` for the renderer and the
// sound to pick up, so the same code runs in the browser, in the online host
// and in the headless balance tests (test/sim.mjs).
//
// Each fighter is driven by an INTENT written into `f.intent` every frame by
// whatever controls it - the keyboard, the AI, or a player across the network.
// The fight never knows which.
//
// The ring is a floor plane: x runs left/right across the screen, z runs into
// the screen (0 = front ropes). Punches only land if the fighters are lined up
// in z, which is what makes WASD footwork matter - stepping off the line is a
// defence, and cutting the ring off is an attack.

import { spec, sig, COMBOS, resolveStats } from './data.js';

export const RING = { x0: -114, x1: 114, z0: 6, z1: 70 };
export const ROUND_LEN = 60;
const LINE = 12;          // how far apart in z two fighters can be and still hit
const BODY_R = 9;         // half a torso: reach is measured glove to chest

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const emptyIntent = () => ({ mx: 0, mz: 0, guard: false, low: false, crouch: false, slip: false, duck: false, punches: [], star: false, mash: 0, taunt: false });

const KIND_GROUP = { straight: 'straight', hook: 'hook', upper: 'upper', over: 'straight', star: 'straight' };

export function makeFighter(side, cfg) {
  const st = resolveStats(cfg.lv || {});
  st.reach = cfg.reach || 0;
  const f = {
    side, name: cfg.name, nick: cfg.nick || '', look: cfg.look, profile: cfg.profile || null,
    human: !!cfg.human,
    st, dmgTaken: (cfg.profile && cfg.profile.dmgTaken) || { head: 1, body: 1, straight: 1, hook: 1, upper: 1, over: 1 },
    quirks: (cfg.profile && cfg.profile.ai && cfg.profile.ai.quirks) || [],
    x: side ? 60 : -60, z: 40, face: side ? -1 : 1, vx: 0, vz: 0, kx: 0,
    hp: st.hpMax, rec: 0, recT: 0, stam: st.stamMax, bodyDmg: 0,
    state: 'idle', t: 0, act: null, queue: [], lastHand: null,
    guard: 0, dodge: null, stun: 0,
    stars: 0, kds: 0,
    chain: [], chainOpen: 0,
    counterT: 0, open: 0, wild: false,
    flash: 0, hitKind: '', hitTarget: 'head', hitT: 9, hitBig: false,
    walk: 0, speedNow: 0, rope: 0, crouch: 0,
    takenN: 0, lastHitAt: -9,
    mash: 0, mashNeed: 0, getupAt: 0, getupHp: 0,
    stats: { thrown: 0, landed: 0, dmg: 0, blocked: 0, dodged: 0, power: 0 },
    roundDmg: [], roundKd: [],
    intent: emptyIntent(),
    pid: 0,
  };
  return f;
}

export function makeFight(a, b, opts = {}) {
  const fight = {
    f: [a, b], round: 1, rounds: opts.rounds || 3, roundLen: opts.roundLen || ROUND_LEN,
    clock: opts.roundLen || ROUND_LEN, phase: 'intro', pt: 0, time: 0,
    events: [], rng: makeRng(opts.seed || (Date.now() & 0xffffff)),
    ref: { x: 0, z: 66, count: 0, mode: 'watch', raise: -1, walk: 0, face: 1 },
    result: null, freeze: 0, slow: 1, slowT: 0, downIdx: -1, tko: false, lastCount: 0,
    arena: opts.arena || 'pit', crowd: 0.2, mode: opts.mode || 'free',
  };
  for (const f of fight.f) { f.roundDmg = new Array(fight.rounds).fill(0); f.roundKd = new Array(fight.rounds).fill(0); }
  placeCorners(fight, true);
  return fight;
}

function ev(fight, type, o = {}) { o.type = type; fight.events.push(o); }

function placeCorners(fight, far) {
  const [a, b] = fight.f;
  a.x = far ? -96 : -44; b.x = far ? 96 : 44;
  a.z = b.z = 38; a.face = 1; b.face = -1;
  for (const f of fight.f) {
    f.vx = f.vz = f.kx = 0; f.state = 'idle'; f.t = 0; f.act = null; f.queue.length = 0;
    f.dodge = null; f.guard = 0; f.chain = []; f.open = 0; f.stun = 0;
  }
}

// ------------------------------------------------------------------ step ---
export function step(fight, realDt) {
  // hit-stop: the world freezes for a couple of frames on a clean shot. It is
  // most of what makes a punch feel like it landed.
  if (fight.freeze > 0) { fight.freeze -= realDt; for (const f of fight.f) f.flash = Math.max(0, f.flash - realDt); return; }
  if (fight.slowT > 0) { fight.slowT -= realDt; if (fight.slowT <= 0) fight.slow = 1; }
  const dt = realDt * fight.slow;
  fight.time += dt;
  fight.pt += dt;
  fight.crowd = Math.max(0.15, fight.crowd - dt * 0.25);
  const [a, b] = fight.f;

  switch (fight.phase) {
    case 'intro': {
      // walk out of the corners to the middle
      for (const f of fight.f) {
        const tx = f.side ? 40 : -40;
        f.vx = Math.sign(tx - f.x) * Math.min(60, Math.abs(tx - f.x) * 4);
        f.vz = (38 - f.z) * 3;
        move(fight, f, dt, true);
        idleTimers(f, dt);
      }
      if (fight.pt > 2.4) { fight.phase = 'fight'; fight.pt = 0; ev(fight, 'bell', { start: true }); ev(fight, 'banner', { text: 'FIGHT!', big: true }); }
      break;
    }
    case 'fight': {
      fight.clock -= dt;
      stepFighter(fight, a, b, dt);
      stepFighter(fight, b, a, dt);
      separate(a, b);
      stepRef(fight, dt);
      if (fight.phase === 'fight' && fight.clock <= 0) {
        fight.clock = 0; fight.phase = 'roundEnd'; fight.pt = 0;
        ev(fight, 'bell', { end: true });
        for (const f of fight.f) { f.act = null; f.state = 'idle'; f.queue.length = 0; f.dodge = null; }
      }
      break;
    }
    case 'roundEnd': {
      for (const f of fight.f) { f.vx *= 0.8; f.vz *= 0.8; move(fight, f, dt, true); idleTimers(f, dt); f.guard = 0; }
      stepRef(fight, dt);
      if (fight.pt > 1.8) {
        if (fight.round >= fight.rounds) decide(fight);
        else { fight.phase = 'rest'; fight.pt = 0; rest(fight); }
      }
      break;
    }
    case 'rest': {
      for (const f of fight.f) idleTimers(f, dt);
      if (fight.pt > 4.2) {
        fight.round++; fight.clock = fight.roundLen; fight.phase = 'intro'; fight.pt = 0;
        placeCorners(fight, true);
        ev(fight, 'banner', { text: 'ROUND ' + fight.round, big: true });
      }
      break;
    }
    case 'kd': stepKD(fight, dt); break;
    case 'resume': {
      for (const f of fight.f) { f.vx *= 0.7; f.vz *= 0.7; move(fight, f, dt, true); idleTimers(f, dt); }
      stepRef(fight, dt);
      if (fight.pt > 1.1) { fight.phase = 'fight'; fight.pt = 0; ev(fight, 'banner', { text: 'BOX!', big: true }); }
      break;
    }
    case 'decision': {
      for (const f of fight.f) idleTimers(f, dt);
      if (fight.pt > 2.6) finish(fight);
      break;
    }
    case 'over': {
      for (const f of fight.f) {
        idleTimers(f, dt);
        f.t += dt;
        f.vx *= 0.9; f.vz *= 0.9; move(fight, f, dt, true);
      }
      stepRef(fight, dt);
      break;
    }
  }
}

function idleTimers(f, dt) {
  f.flash = Math.max(0, f.flash - dt);
  f.hitT += dt;
  f.rope = Math.max(0, f.rope - dt * 2.5);
  f.t += 0;
}

// --------------------------------------------------------------- fighter ---
function stepFighter(fight, f, o, dt) {
  const I = f.intent;
  f.t += dt;
  f.hitT += dt;
  f.flash = Math.max(0, f.flash - dt);
  f.counterT = Math.max(0, f.counterT - dt);
  f.open = Math.max(0, f.open - dt);
  f.chainOpen = Math.max(0, f.chainOpen - dt);
  f.rope = Math.max(0, f.rope - dt * 2.5);
  f.recT += dt;

  // recoverable damage drains back in once you have not been hit for a moment
  if (f.rec > 0 && f.recT > 1.6 && f.state !== 'down') {
    const g = Math.min(f.rec, 3.2 * dt);
    f.rec -= g; f.hp = Math.min(f.st.hpMax, f.hp + g);
  }

  // stamina: idle regen, slowed by moving, guarding and body damage
  const bodyDrag = 1 - Math.min(0.55, f.bodyDmg / 180);
  const gas = f.quirks.includes('gasses') && fight.round >= 2 ? 0.55 : 1;
  let regen = f.st.regen * bodyDrag * gas;
  if (f.state === 'punch') regen = 0;
  else if (f.guard) regen *= 0.65;
  if (f.speedNow > 30) regen *= 0.75;
  f.stam = Math.min(f.st.stamMax, f.stam + regen * dt);

  f.wild = f.quirks.includes('wildWhenHurt') && f.hp < f.st.hpMax * 0.3;

  // face your man, unless you are mid-punch (you commit to the direction)
  if (f.state !== 'punch' && f.state !== 'hit' && f.state !== 'stagger') {
    const dx = o.x - f.x;
    if (Math.abs(dx) > 3) f.face = dx > 0 ? 1 : -1;
  }

  let moveScale = 0;
  switch (f.state) {
    case 'idle': {
      moveScale = 1;
      f.guard = f.open > 0 ? 0 : I.guard ? (I.low ? 2 : 1) : 0;
      if (f.guard) moveScale = 0.55;
      if (I.taunt && !f.guard) { f.state = 'taunt'; f.t = 0; ev(fight, 'taunt', { side: f.side }); break; }
      if (I.slip || I.duck) {
        f.state = 'dodge'; f.t = 0; f.dodge = I.slip ? 'slip' : 'duck'; f.guard = 0;
        f.queue.length = 0;
        ev(fight, 'dodgeStart', { side: f.side, kind: f.dodge });
        break;
      }
      if (I.star && f.stars >= 1) {
        f.stars -= 1;
        startPunch(fight, f, { kind: 'star', hand: 'rear', target: 'head' }, false);
        break;
      }
      for (const p of I.punches) if (f.queue.length < 2) f.queue.push(p);
      if (f.queue.length) startPunch(fight, f, f.queue.shift(), false);
      break;
    }
    case 'punch': {
      const A = f.act;
      moveScale = 0.2;
      f.guard = 0;
      for (const p of I.punches) if (f.queue.length < 2) f.queue.push(p);
      const t0 = A.t;
      A.t += dt;
      if (t0 < A.start && A.t >= A.start) resolve(fight, f, o, A);
      if (!f.act) break;              // a resolve can knock the round over
      const done = A.start + A.active;
      // CHAIN: a punch that connected can be cancelled into the next one the
      // moment it is back from the target. A whiff has to come all the way home.
      if (A.t >= done && f.queue.length && (A.hit === 'hit' || A.hit === 'block')) {
        startPunch(fight, f, f.queue.shift(), true);
        break;
      }
      if (A.t >= done + A.rec) {
        if (A.special && f.quirks.includes('breathes')) { f.open = 0.9; ev(fight, 'text', { side: f.side, text: 'BREATHING!', col: 'good' }); }
        f.act = null; f.state = 'idle'; f.t = 0;
        if (f.queue.length && f.stam > 0) startPunch(fight, f, f.queue.shift(), false);
        else f.chainOpen = 0.35;
      }
      break;
    }
    case 'dodge': {
      moveScale = 0.15;
      if (f.t >= f.st.dodgeLen) { f.state = 'idle'; f.t = 0; f.dodge = null; }
      break;
    }
    case 'hit': {
      moveScale = 0;
      if (f.t >= f.stun || (f.takenN >= 3 && I.guard && f.t > 0.05)) { f.state = 'idle'; f.t = 0; f.queue.length = 0; }
      break;
    }
    case 'stagger': {
      moveScale = 0.25;
      f.guard = 0;
      if (f.t >= f.stun) { f.state = 'idle'; f.t = 0; f.queue.length = 0; }
      break;
    }
    case 'taunt': {
      f.guard = 0;
      if (f.t >= 1.15) { f.state = 'idle'; f.t = 0; }
      break;
    }
  }

  const mx = I.mx * moveScale, mz = I.mz * moveScale;
  // CROUCH: hold the body-shot key and you drop into a low stance you can see.
  // It eases in and out, and it costs a little foot speed.
  const wantLow = (I.crouch || f.guard === 2) && (f.state === 'idle' || f.state === 'punch' || f.state === 'dodge') ? 1 : 0;
  f.crouch += (wantLow - f.crouch) * Math.min(1, dt * 16);
  const sp = f.st.foot * (f.stam < 15 ? 0.8 : 1) * (1 - f.crouch * 0.25);
  const tvx = mx * sp, tvz = mz * sp * 0.75;
  const k = Math.min(1, dt * 14);
  f.vx += (tvx - f.vx) * k;
  f.vz += (tvz - f.vz) * k;
  move(fight, f, dt, false);
}

function move(fight, f, dt, free) {
  f.kx *= Math.pow(0.0025, dt);
  f.x += (f.vx + f.kx) * dt;
  f.z += f.vz * dt;
  f.speedNow = Math.hypot(f.vx, f.vz);
  f.walk += dt * (2 + f.speedNow * 0.16);
  if (f.x < RING.x0) { if (f.kx < -40) f.rope = Math.min(1, -f.kx / 160); f.x = RING.x0; f.kx = Math.abs(f.kx) * 0.15; }
  if (f.x > RING.x1) { if (f.kx > 40) f.rope = Math.min(1, f.kx / 160); f.x = RING.x1; f.kx = -Math.abs(f.kx) * 0.15; }
  if (f.z < RING.z0) f.z = RING.z0;
  if (f.z > RING.z1) f.z = RING.z1;
}

function separate(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.abs(dz) < 10 && Math.abs(dx) < 17) {
    const push = (17 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
    a.x -= push; b.x += push;
    a.x = Math.max(RING.x0, Math.min(RING.x1, a.x));
    b.x = Math.max(RING.x0, Math.min(RING.x1, b.x));
  }
}

// ----------------------------------------------------------------- punch ---
function startPunch(fight, f, p, chained) {
  const s = spec(p.kind, p.hand);
  if (!s) return;
  let sm = f.st.speed;
  if (f.stam < 20) sm *= 1.3;
  if (f.stam < 8) sm *= 1.25;           // running on empty: everything is slow
  if (f.lastHand === p.hand && p.kind !== 'straight' && chained) sm *= 1.15;
  const startMul = chained ? 0.72 : 1;
  const gassed = f.stam < s.stam * 0.5;
  f.stam = Math.max(0, f.stam - s.stam);
  f.pid++;
  f.act = {
    id: f.side * 100000 + f.pid, kind: p.kind, hand: p.hand, target: p.target || 'head', name: s.name,
    t: 0, start: s.start * sm * startMul + (p.tell || 0), active: s.active, rec: s.rec * sm,
    dmg: s.dmg, reach: s.reach + f.st.reach, knock: s.knock,
    power: p.power || 1, precise: !!p.precise, tell: p.tell || 0, special: p.special || null,
    hit: null, gassed,
  };
  if (p.special) ev(fight, 'special', { side: f.side, name: p.special });
  f.lastHand = p.hand;
  f.state = 'punch'; f.t = 0; f.guard = 0;
  f.stats.thrown++;
  const sg = sig(f.act);
  if (chained || f.chainOpen > 0) f.chain.push(sg); else f.chain = [sg];
  if (f.chain.length > 5) f.chain.shift();
  ev(fight, 'swing', { side: f.side, kind: p.kind, hand: p.hand, target: f.act.target });
}

function resolve(fight, f, o, A) {
  const dx = (o.x - f.x) * f.face;
  const dz = Math.abs(o.z - f.z);
  const hx = o.x - f.face * 4;
  const hy = A.target === 'head' ? 44 : 28;
  if (o.state === 'down' || o.state === 'getup' || dx < 2 || dx > A.reach + BODY_R || dz > LINE) {
    A.hit = 'miss'; A.rec *= 1.25;
    ev(fight, 'whiff', { side: f.side, kind: A.kind });
    if (o.profile) o.counterT = Math.max(o.counterT, 0.35);
    return;
  }

  const group = KIND_GROUP[A.kind];
  let mul = 1;

  // --- dodges. A slip is a lean BACK: it beats straights and uppercuts, but a
  // hook wraps round it. A duck goes UNDER: it beats straights and hooks, and
  // walks you face-first into an uppercut or an overhand.
  if (o.state === 'dodge' && o.t <= o.st.dodgeWin + 0.05 && A.target === 'head') {
    const beats = o.dodge === 'slip'
      ? (A.kind === 'straight' || A.kind === 'upper' || A.kind === 'star' || A.kind === 'over')
      : (A.kind === 'straight' || A.kind === 'hook' || A.kind === 'star');
    if (beats) {
      A.hit = 'dodge'; A.rec *= 1.35;
      o.counterT = 0.65; o.stats.dodged++;
      ev(fight, 'dodge', { side: o.side, by: f.side, kind: o.dodge, x: hx, z: o.z, y: hy });
      return;
    }
    if (o.dodge === 'duck' && A.kind === 'upper') mul *= 1.5;
    if (o.dodge === 'duck' && A.kind === 'over') mul *= 1.3;
  }

  // --- blocks. High guard covers the head, low guard the body. An uppercut
  // comes up between the gloves, so the high guard only takes part of it.
  const canBlock = o.state === 'idle' && o.guard;
  if (canBlock && ((o.guard === 1 && A.target === 'head') || (o.guard === 2 && A.target === 'body'))) {
    let bf = A.target === 'body' ? o.st.blk.body : o.st.blk[group];
    if (A.kind === 'star') bf *= 0.5;
    const raw = A.dmg * f.st.power * A.power;
    const chip = raw * (1 - bf) * 0.45;
    o.hp -= chip; o.rec += chip * 0.5;
    o.stam -= raw * 0.55 * (1 - bf * 0.5);
    o.kx = f.face * A.knock * 0.45;
    // punching a guard is tiring and it bounces you off: mashing a shell costs YOU
    f.stam = Math.max(0, f.stam - spec(A.kind, A.hand).stam * 0.6);
    f.kx = -f.face * 25;
    o.stats.blocked++;
    A.hit = 'block';
    f.stats.dmg += chip;
    f.roundDmg[fight.round - 1] += chip * 0.3;
    ev(fight, 'block', { side: o.side, by: f.side, kind: A.kind, x: hx, z: o.z, y: hy, heavy: raw > 11 });
    if (o.stam <= 0) {
      o.stam = 0; o.state = 'stagger'; o.t = 0; o.stun = 0.85; o.guard = 0;
      ev(fight, 'text', { side: o.side, text: 'GUARD BROKEN!', col: 'bad' });
      ev(fight, 'guardBreak', { side: o.side });
    }
    if (o.hp <= 0) knockdown(fight, o, f, A);
    else comboCheck(fight, f, A);
    return;
  }

  // --- it lands
  // HIT STRINGS. Every hit inside 0.7s of the last one is part of a string.
  // The stun gets shorter each time (so mashing cannot pin a man forever -
  // by the third hit he can get his gloves up) and past the third the damage
  // starts to fall off too. Varied, timed shots beat a held-down button.
  o.takenN = fight.time - o.lastHitAt < 0.7 ? o.takenN + 1 : 1;
  o.lastHitAt = fight.time;
  const string = o.takenN;
  const counter = (o.state === 'punch' && o.act && o.act.t < o.act.start) || f.counterT > 0 || o.state === 'taunt';
  const stamF = A.gassed ? 0.5 : 0.65 + 0.35 * Math.min(1, f.stam / 40);
  const chainMul = 1 + 0.08 * Math.min(4, f.chain.length - 1);
  const jam = A.kind === 'straight' && dx < 14 ? 0.7 : 1;
  const wild = f.wild ? 1.1 : 1;
  let dmg = A.dmg * f.st.power * A.power * stamF * chainMul * jam * wild * mul;
  if (counter) dmg *= 1.35;
  if (A.precise) dmg *= 1.12;
  if (o.state === 'taunt') dmg *= 1.25;
  dmg *= o.dmgTaken[A.target] || 1;
  dmg *= o.dmgTaken[A.kind === 'star' ? 'straight' : A.kind] || 1;
  if (A.target === 'head') dmg *= o.st.chin;
  if (string > 2) dmg *= Math.max(0.45, 1 - 0.12 * (string - 2));

  if (A.target === 'body') {
    o.hp -= dmg * 0.75; o.rec += dmg * 0.75 * 0.3;
    o.stam = Math.max(0, o.stam - dmg * 1.4);
    o.bodyDmg += dmg;
  } else {
    o.hp -= dmg; o.rec += dmg * 0.35;
  }
  o.rec = Math.min(o.rec, Math.max(0, o.hp));
  o.recT = 0;
  f.counterT = 0;

  const big = dmg >= 13 || (counter && dmg >= 9) || A.kind === 'star';
  o.act = null; o.queue.length = 0; o.dodge = null; o.guard = 0;
  o.hitKind = A.kind; o.hitTarget = A.target; o.hitT = 0; o.hitBig = big; o.hitHand = A.hand;
  if (big && A.target === 'head') { o.state = 'stagger'; o.stun = 0.45 + dmg * 0.012; }
  else if (big && A.target === 'body' && o.stam < 25) { o.state = 'stagger'; o.stun = 0.7; }
  else { o.state = 'hit'; o.stun = 0.13 + dmg * 0.011; }
  o.stun *= Math.max(0.35, 1 - 0.2 * (string - 1));
  if (string === 3 && !o.human) ev(fight, 'text', { side: o.side, text: 'COVERING UP', col: 'cool' });
  o.t = 0;
  o.flash = big ? 0.09 : 0.05;
  o.kx = f.face * A.knock * (0.8 + dmg / 18);

  f.stars = Math.min(3, f.stars + dmg / 85 + (counter ? 0.12 : 0));
  f.stats.landed++; f.stats.dmg += dmg; if (dmg >= 11) f.stats.power++;
  f.roundDmg[fight.round - 1] += dmg;
  A.hit = 'hit';
  fight.freeze = big ? 0.1 : 0.045;
  fight.crowd = Math.min(1, fight.crowd + dmg / 40);

  ev(fight, 'hit', { side: o.side, by: f.side, kind: A.kind, hand: A.hand, target: A.target, dmg, counter, big, x: hx, z: o.z, y: hy, face: f.face, precise: A.precise });
  if (counter) ev(fight, 'text', { side: f.side, text: 'COUNTER!', col: 'hot' });
  else if (A.target === 'body' && dmg >= 10) ev(fight, 'text', { side: f.side, text: 'BODY SHOT!', col: 'hot' });

  if (o.hp <= 0) knockdown(fight, o, f, A);
  else comboCheck(fight, f, A);
}

function comboCheck(fight, f, A) {
  const s = f.chain.join(' ');
  for (const c of COMBOS) {
    if (s === c.seq) {
      f.stars = Math.min(3, f.stars + c.star);
      ev(fight, 'combo', { side: f.side, name: c.name, n: f.chain.length });
      break;
    }
  }
  // AI quirk: drops the hands after finishing a combination
  if (f.quirks.includes('dropsGuard') && A.hit && !f.queue.length) f.open = 0.75;
}

// ----------------------------------------------------------- knockdowns ---
function knockdown(fight, o, f, A) {
  o.hp = 0; o.rec = 0;
  o.state = 'down'; o.t = 0; o.act = null; o.queue.length = 0; o.guard = 0; o.dodge = null;
  o.kds++; o.roundKd[fight.round - 1]++;
  o.kx = f.face * 120;
  f.state = 'idle'; f.act = null; f.queue.length = 0;
  fight.phase = 'kd'; fight.pt = 0; fight.downIdx = o.side; fight.lastCount = 0;
  fight.slow = 0.28; fight.slowT = 0.9; fight.freeze = 0.14;
  fight.crowd = 1;
  fight.ref.count = 0;
  fight.tko = o.kds >= 3;
  o.mash = 0;
  o.mashNeed = 12 + 7 * (o.kds - 1) - o.st.chinLv * 0.5;
  o.getupHp = o.st.hpMax * Math.max(0.22, 0.55 - 0.12 * (o.kds - 1)) * (1 + 0.03 * o.st.chinLv);
  if (!o.human) {
    const heart = (o.profile && o.profile.ai.heart) || 0.5;
    const pStay = Math.max(0, Math.min(0.95, 0.04 + 0.3 * (o.kds - 1) - 0.25 * heart + Math.min(0.2, o.bodyDmg / 400)));
    o.getupAt = fight.rng() < pStay ? 99 : Math.min(9, 3 + Math.floor(fight.rng() * 4) + (o.kds - 1) * 2);
  }
  ev(fight, 'kd', { side: o.side, by: f.side, x: o.x, z: o.z, kind: A.kind });
  ev(fight, 'banner', { text: 'DOWN!', big: true, col: 'hot' });
}

function stepKD(fight, dt) {
  const d = fight.f[fight.downIdx], s = fight.f[1 - fight.downIdx];
  d.t += dt; s.t += dt;
  idleTimers(d, dt); idleTimers(s, dt);
  d.vx = 0; d.vz = 0; move(fight, d, dt, true);

  // the man standing goes to a neutral corner
  const cx = d.x > 0 ? RING.x0 + 16 : RING.x1 - 16, cz = RING.z1 - 6;
  s.state = 'idle'; s.guard = 0;
  const dx = cx - s.x, dz = cz - s.z;
  s.vx = Math.abs(dx) > 3 ? Math.sign(dx) * 70 : 0;
  s.vz = Math.abs(dz) > 3 ? Math.sign(dz) * 50 : 0;
  move(fight, s, dt, true);
  if (Math.abs(dx) > 3) s.face = dx > 0 ? 1 : -1;

  // the ref comes over and counts
  const R = fight.ref;
  R.mode = 'count';
  const rx = d.x - d.face * -6 + (d.x > 0 ? -22 : 22), rz = Math.min(RING.z1, d.z + 14);
  R.x += (rx - R.x) * Math.min(1, dt * 4); R.z += (rz - R.z) * Math.min(1, dt * 4);
  R.face = d.x > R.x ? 1 : -1;

  if (fight.tko && fight.pt > 1.8) {
    endFight(fight, s, d, 'TKO');
    return;
  }

  const count = fight.pt < 1.3 ? 0 : Math.floor((fight.pt - 1.3) / 0.92) + 1;
  if (count !== fight.lastCount && count <= 10) {
    fight.lastCount = count; R.count = count; R.countT = 0;
    if (count > 0) ev(fight, 'count', { n: count });
  }
  R.countT = (R.countT || 0) + dt;

  if (d.state === 'down') {
    d.mash += d.intent.mash || 0;
    const ready = d.human ? d.mash >= d.mashNeed : count >= d.getupAt;
    if (ready && count >= 1 && count < 10 && !fight.tko) {
      d.state = 'getup'; d.t = 0;
      ev(fight, 'getup', { side: d.side });
    } else if (count >= 10 && R.countT > 0.5) {
      endFight(fight, s, d, 'KO');
    }
  } else if (d.state === 'getup' && d.t > 1.0) {
    d.state = 'idle'; d.t = 0;
    d.hp = d.getupHp; d.stam = Math.max(d.stam, d.st.stamMax * 0.5);
    s.state = 'idle';
    fight.phase = 'resume'; fight.pt = 0; R.mode = 'watch'; R.count = 0;
    ev(fight, 'banner', { text: 'HE IS UP!', col: 'good' });
  }
}

function stepRef(fight, dt) {
  const R = fight.ref, [a, b] = fight.f;
  if (fight.phase === 'over') {
    const w = fight.result && fight.result.winner;
    if (w != null && fight.result.method !== 'DRAW') {
      const W = fight.f[w];
      const tx = W.x - 14 * (W.x > 0 ? 1 : -1), tz = W.z + 2;
      R.x += (tx - R.x) * Math.min(1, dt * 3); R.z += (tz - R.z) * Math.min(1, dt * 3);
      R.face = W.x > R.x ? 1 : -1;
      if (fight.pt > 1.2) R.raise = w;
    }
    R.walk += dt * 4;
    return;
  }
  // stays behind the action, a bit off to the side, never between them
  const mx = (a.x + b.x) / 2;
  const back = Math.max(a.z, b.z) + 20;
  const tz = back <= RING.z1 + 2 ? Math.min(RING.z1 + 2, back) : Math.min(a.z, b.z) - 18;
  const tx = mx + 10;
  const ox = R.x, oz = R.z;
  R.x += (tx - R.x) * Math.min(1, dt * 1.6);
  R.z += (tz - R.z) * Math.min(1, dt * 1.6);
  R.walk += Math.hypot(R.x - ox, R.z - oz) * 0.25 + dt * 0.5;
  R.face = mx > R.x ? 1 : -1;
  R.mode = 'watch';
}

// --------------------------------------------------------- rounds & end ---
function rest(fight) {
  for (const f of fight.f) {
    const heal = f.st.hpMax * 0.16;
    f.hp = Math.min(f.st.hpMax, f.hp + heal + f.rec * 0.5); f.rec = 0;
    f.stam = f.st.stamMax;
    f.bodyDmg *= 0.55;
  }
  ev(fight, 'rest', {});
}

function decide(fight) {
  // three judges, ten-point must. Each round goes to whoever did more damage;
  // a knockdown costs a point. A close round is a coin a judge can flip.
  const [a, b] = fight.f;
  const cards = [[0, 0], [0, 0], [0, 0]];
  for (let r = 0; r < fight.rounds; r++) {
    for (let j = 0; j < 3; j++) {
      const da = a.roundDmg[r] * (0.9 + fight.rng() * 0.2), db = b.roundDmg[r] * (0.9 + fight.rng() * 0.2);
      let sa = 10, sb = 10;
      if (Math.abs(da - db) > 1.5) { if (da > db) sb = 9; else sa = 9; }
      sa -= a.roundKd[r]; sb -= b.roundKd[r];
      // you knock him down, you take the round
      if (b.roundKd[r] > a.roundKd[r]) sa = 10;
      if (a.roundKd[r] > b.roundKd[r]) sb = 10;
      cards[j][0] += sa; cards[j][1] += sb;
    }
  }
  let wa = 0, wb = 0;
  for (const c of cards) { if (c[0] > c[1]) wa++; else if (c[1] > c[0]) wb++; }
  fight.cards = cards;
  fight.phase = 'decision'; fight.pt = 0;
  let winner = -1, method = 'DRAW';
  if (wa > wb) { winner = 0; method = wb === 0 && wa === 3 ? 'UNANIMOUS DECISION' : 'SPLIT DECISION'; }
  else if (wb > wa) { winner = 1; method = wa === 0 && wb === 3 ? 'UNANIMOUS DECISION' : 'SPLIT DECISION'; }
  if (winner >= 0 && wa + wb < 3 && Math.min(wa, wb) === 0) method = 'MAJORITY DECISION';
  fight.pending = { winner, method };
  ev(fight, 'banner', { text: 'THE JUDGES...', big: false });
}

function finish(fight) {
  const p = fight.pending;
  if (p.winner < 0) {
    fight.phase = 'over'; fight.pt = 0;
    fight.result = { winner: -1, method: 'DRAW', round: fight.round };
    for (const f of fight.f) { f.state = 'idle'; f.t = 0; }
    ev(fight, 'over', { result: fight.result });
    ev(fight, 'banner', { text: 'DRAW', big: true });
    return;
  }
  endFight(fight, fight.f[p.winner], fight.f[1 - p.winner], p.method);
}

function endFight(fight, w, l, method) {
  fight.phase = 'over'; fight.pt = 0;
  fight.result = { winner: w.side, method, round: fight.round, time: fight.roundLen - fight.clock };
  w.state = 'win'; w.t = 0; w.act = null; w.guard = 0;
  if (method === 'KO' || method === 'TKO') { l.state = 'ko'; }
  else { l.state = 'lose'; }
  l.t = 0; l.act = null; l.guard = 0;
  fight.crowd = 1;
  ev(fight, 'over', { result: fight.result });
  ev(fight, 'banner', { text: method === 'KO' ? 'K.O.!' : method === 'TKO' ? 'T.K.O.!' : w.name + ' WINS', big: true, col: 'hot' });
}

// The two fighters as plain data, for the online host to send. Everything the
// renderer reads and nothing it does not.
const DYN = ['crouch', 'x', 'z', 'face', 'vx', 'vz', 'hp', 'rec', 'stam', 'state', 't', 'guard', 'dodge', 'stars', 'kds', 'flash',
  'hitKind', 'hitTarget', 'hitT', 'hitBig', 'hitHand', 'walk', 'speedNow', 'rope', 'open', 'mash', 'mashNeed', 'stun', 'bodyDmg'];
export function snapshot(fight) {
  const fs = fight.f.map((f) => {
    const o = {};
    for (const k of DYN) o[k] = f[k];
    o.act = f.act ? { kind: f.act.kind, hand: f.act.hand, target: f.act.target, t: f.act.t, start: f.act.start, active: f.act.active, rec: f.act.rec, tell: f.act.tell, hit: f.act.hit } : null;
    o.stats = f.stats;
    return o;
  });
  return { f: fs, round: fight.round, clock: fight.clock, phase: fight.phase, pt: fight.pt, ref: fight.ref, result: fight.result, downIdx: fight.downIdx, crowd: fight.crowd, slow: fight.slow, cards: fight.cards, time: fight.time };
}
export function applySnapshot(fight, s) {
  s.f.forEach((o, i) => Object.assign(fight.f[i], o));
  Object.assign(fight, { round: s.round, clock: s.clock, phase: s.phase, pt: s.pt, result: s.result, downIdx: s.downIdx, crowd: s.crowd, slow: s.slow, cards: s.cards, time: s.time });
  Object.assign(fight.ref, s.ref);
}
