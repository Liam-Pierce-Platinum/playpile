// SUMO. A round clay ring, no ropes. Force him out of the circle or put him
// on the ground. First to win two bouts takes the match.
//
// Each bout opens with the TACHIAI: both men crouch at their lines and the
// referee calls HAKKEYOI. Charge (any arrow) the instant he calls it: early is
// a false start, late gives the other man the jump.
//
//   A / D        lean in / give ground       W / S   circle along the edge
//   hold SPACE   LOW STANCE: harder to move, harder to throw, slower
//   UP           THRUST (tsuppari) - a palm strike that drives him back
//   RIGHT        GRAB THE BELT (when close)
//     with the belt:  UP drive him out (yorikiri), LEFT throw (uwatenage),
//                     DOWN lift him out (tsuridashi - needs strength)
//   DOWN         PULL DOWN (hatakikomi): step back and slap him down - deadly
//                if he is charging in, a gift if he is not
//   Q / E        sidestep (henka), best at the charge
//
// BALANCE is the hidden health bar: pushes, thrusts and failed moves drain
// it, a low stance and standing still bring it back. At zero you go down.
// WEIGHT matters everywhere: heavy men push harder and are harder to move.

import { makeRng } from './fight.js';
import { POSE, clone, from, blend, easeOut, easeIn, easeIO, cl, rotatePose } from './boxer.js';

export const DOHYO = { cx: 0, cz: 38, rx: 92, rz: 33 };
export const outside = (x, z, m = 0) => ((x - DOHYO.cx) / (DOHYO.rx + m)) ** 2 + ((z - DOHYO.cz) / (DOHYO.rz + m * 0.4)) ** 2 > 1;

export function makeSumo(a, b, opts = {}) {
  const fight = {
    kind: 'sumo', f: [a, b], round: 1, rounds: 3, roundLen: 0, clock: 0, phase: 'intro', pt: 0, time: 0,
    events: [], rng: makeRng(opts.seed || 11), arena: 'dohyo', crowd: 0.3, mode: opts.mode || 'free',
    ref: { x: 0, z: 60, count: 0, mode: 'gyoji', raise: -1, walk: 0, face: 1 }, result: null, freeze: 0, slow: 1, slowT: 0,
    wins: [0, 0], callAt: 0, called: false, falseStarts: [0, 0], downIdx: -1,
  };
  for (const f of fight.f) setup(f);
  startBout(fight, true);
  return fight;
}
function setup(f) {
  Object.assign(f, {
    state: 'shikiri', t: 0, act: null, bal: 100, grip: -1, lift: 0, flash: 0, stun: 0, hitT: 9, crouch: 0, guard: 0, stars: 0,
    speedNow: 0, walk: 0, rope: 0, charge: 0, vx: 0, vz: 0, kg: 0, push: 0, low: 0, dodge: null,
  });
  // weight from build and health: what makes a big man big
  const b = f.look.build || { w: 1, h: 1 };
  f.kg = 110 + (b.w - 1) * 160 + (f.st.hpMax - 135) * 0.5 + (f.look.belly || 0) * 40;
  f.stats = { thrown: 0, landed: 0, dmg: 0, blocked: 0, dodged: 0, power: 0 };
}
const ev = (fight, type, o = {}) => { o.type = type; fight.events.push(o); };

function startBout(fight, first) {
  const [a, b] = fight.f;
  a.x = -20; b.x = 20; a.z = b.z = DOHYO.cz; a.face = 1; b.face = -1;
  for (const f of fight.f) { f.state = 'shikiri'; f.t = 0; f.bal = 100; f.grip = -1; f.act = null; f.lift = 0; f.vx = f.vz = 0; f.charge = 0; f.stun = 0; f.stam = f.st.stamMax; f.dodge = null; }
  fight.phase = 'intro'; fight.pt = 0; fight.called = false; fight.urged = false;
  fight.callAt = 1.6 + fight.rng() * 1.8;
  ev(fight, 'banner', { text: first ? 'SUMO' : 'BOUT ' + fight.round, big: true });
}

export function stepSumo(fight, dt0) {
  if (fight.freeze > 0) { fight.freeze -= dt0; return; }
  if (fight.slowT > 0) { fight.slowT -= dt0; if (fight.slowT <= 0) fight.slow = 1; }
  const dt = dt0 * fight.slow;
  fight.time += dt; fight.pt += dt;
  fight.crowd = Math.max(0.2, fight.crowd - dt * 0.25);
  const [a, b] = fight.f;
  for (const f of fight.f) { f.flash = Math.max(0, f.flash - dt); f.hitT += dt; f.t += dt; }
  switch (fight.phase) {
    case 'intro': {
      // the crouch at the lines. Charge before the call: false start.
      for (const f of fight.f) {
        f.crouch = Math.min(1, f.crouch + dt * 2);
        const go = f.intent.arrows && f.intent.arrows.length;
        if (go && fight.pt > 0.6) {
          if (!fight.called) {
            fight.falseStarts[f.side]++;
            ev(fight, 'banner', { text: 'MATTA! FALSE START', col: 'bad' });
            if (fight.falseStarts[f.side] >= 3) { boutOver(fight, 1 - f.side, 'FALSE STARTS'); return; }
            fight.pt = 0.6; fight.callAt = 1.4 + fight.rng() * 1.6; return;
          }
        }
      }
      if (!fight.called && fight.pt >= fight.callAt) { fight.called = true; fight.calledAt = fight.time; ev(fight, 'banner', { text: 'HAKKEYOI!', big: true, col: 'hot' }); ev(fight, 'bell', { start: true }); }
      if (fight.called) {
        for (const f of fight.f) {
          if (f.state === 'shikiri' && f.intent.arrows && f.intent.arrows.length) {
            const late = fight.time - fight.calledAt;
            f.charge = Math.max(0.35, 1.25 - late * 1.6);
            f.state = 'charge'; f.t = 0;
            if (f.intent.slip || f.intent.duck) { f.state = 'henka'; f.t = 0; f.dodgeDir = f.intent.slip ? -1 : 1; }
            if (late < 0.2) ev(fight, 'text', { side: f.side, text: 'GREAT TACHIAI!', col: 'hot' });
          }
          // waited too long: you charge anyway, flat-footed
          if (f.state === 'shikiri' && fight.time - fight.calledAt > 0.9) { f.state = 'charge'; f.t = 0; f.charge = 0.3; }
        }
        if (a.state !== 'shikiri' && b.state !== 'shikiri') { fight.phase = 'bout'; fight.pt = 0; }
      }
      return;
    }
    case 'bout':
      // a stalled bout: the gyoji urges them on and both come forward
      if (fight.pt > 25) for (const f of fight.f) { const o = fight.f[1 - f.side]; f.intent.mx = Math.sign(o.x - f.x) || f.face; f.intent.mz = Math.sign(o.z - f.z); }
      if (fight.pt > 25 && !fight.urged) { fight.urged = true; ev(fight, 'banner', { text: 'NOKOTTA!', col: 'hot' }); }
      man(fight, a, b, dt); man(fight, b, a, dt);
      contact(fight, a, b, dt);
      for (const f of fight.f) {
        if (f.state !== 'down' && f.state !== 'thrown' && outside(f.x, f.z)) { f.state = 'out'; f.t = 0; boutOver(fight, 1 - f.side, f.lastHow || 'OSHIDASHI'); return; }
        if (f.bal <= 0 && f.state !== 'down' && f.state !== 'thrown') { f.state = 'down'; f.t = 0; boutOver(fight, 1 - f.side, f.lastHow || 'TSUKIOTOSHI'); return; }
      }
      return;
    case 'boutEnd':
      for (const f of fight.f) {
        if (f.state === 'out' || f.state === 'down') { f.x += f.vx * dt; f.vx *= 0.9; }
      }
      if (fight.pt > 2.4) {
        if (fight.wins[0] >= 2 || fight.wins[1] >= 2) finish(fight);
        else { fight.round++; startBout(fight, false); }
      }
      return;
    case 'over': return;
  }
}

function man(fight, f, o, dt) {
  const I = f.intent;
  const dx = o.x - f.x, adx = Math.abs(dx);
  f.face = dx >= 0 ? 1 : -1;
  f.low = I.crouch ? 1 : 0;
  f.crouch += ((f.low ? 1 : 0.35) - f.crouch) * Math.min(1, dt * 10);
  f.stam = Math.min(f.st.stamMax, f.stam + f.st.regen * dt * 0.7);
  // balance comes back when nobody is shoving you, faster in a low stance
  const pressed = adx < 24 && (o.push > 0 || o.state === 'drive');
  if (!pressed) f.bal = Math.min(100, f.bal + dt * (8 + f.low * 10));
  f.push = 0;
  const arr = I.arrows && I.arrows[0];
  switch (f.state) {
    case 'charge': {
      // the charge: a burst of speed straight at him
      const sp = 150 * f.charge * (f.st.foot / 66);
      f.vx = f.face * sp; f.x += f.vx * dt;
      if (f.t > 0.5 || adx < 20) { f.state = 'stand'; f.t = 0; }
      break;
    }
    case 'henka': {
      f.z += f.dodgeDir * 70 * dt; f.x -= f.face * 10 * dt;
      if (f.t > 0.35) { f.state = 'stand'; f.t = 0; }
      break;
    }
    case 'stand': {
      // shuffle: lean in or give ground; circling along the edge
      const sp = 40 * (f.st.foot / 66) * (f.low ? 0.6 : 1);
      f.x += I.mx * sp * dt; f.z += I.mz * sp * 0.7 * dt;
      f.speedNow = Math.abs(I.mx) * sp; f.walk += dt * 6;
      if (I.mx * f.face > 0.3) f.push = 0.6;
      if ((I.slip || I.duck) && f.stam > 10) { f.state = 'henka'; f.t = 0; f.dodgeDir = I.slip ? -1 : 1; f.stam -= 10; break; }
      if (arr === 'up' && f.stam > 6) { f.state = 'thrust'; f.t = 0; f.hand = f.hand === 'lead' ? 'rear' : 'lead'; f.hit = false; f.stam -= 6; f.stats.thrown++; ev(fight, 'swing', { side: f.side }); }
      else if (arr === 'right' && adx < 24) { f.state = 'reach'; f.t = 0; f.stats.thrown++; }
      else if (arr === 'down') { f.state = 'pull'; f.t = 0; f.hit = false; f.stats.thrown++; }
      break;
    }
    case 'thrust': {
      if (!f.hit && f.t > 0.1) {
        f.hit = true;
        if (adx < 30 && Math.abs(o.z - f.z) < 14 && o.state !== 'henka') {
          const k = force(f) / force(o);
          const shove = 11 * k * (o.low ? 0.6 : 1);
          o.x += f.face * shove; o.bal -= 9 * k * (o.low ? 0.5 : 1); o.vx = f.face * 40 * k;
          o.flash = 0.04; o.hitT = 0; o.lastHow = 'TSUKIDASHI';
          if (o.state === 'grip' || o.state === 'drive') { o.state = 'stand'; o.grip = -1; f.grip = -1; }
          f.stats.landed++; f.stats.dmg += 9 * k;
          ev(fight, 'hit', { side: o.side, by: f.side, kind: 'straight', target: 'body', dmg: 5 * k, big: false, x: o.x, z: o.z, y: 30, face: f.face });
          fight.crowd = Math.min(1, fight.crowd + 0.15);
        }
      }
      if (f.t > 0.26) { f.state = 'stand'; f.t = 0; }
      break;
    }
    case 'reach': {
      if (f.t > 0.18) {
        if (adx < 26 && Math.abs(o.z - f.z) < 12 && o.state !== 'thrust' && o.state !== 'henka' && o.state !== 'down') {
          f.state = 'grip'; o.state = o.state === 'grip' ? 'grip' : 'gripped'; f.grip = o.side; f.t = 0;
          if (o.state === 'gripped') o.t = 0;
          ev(fight, 'text', { side: f.side, text: 'BELT GRIP', col: 'cool' });
        } else { f.state = 'stand'; f.t = 0; f.bal -= 6; }
      }
      break;
    }
    case 'gripped': {
      // he has your belt: get a grip back (RIGHT) or thrust him off (UP)
      if (arr === 'right') { f.state = 'grip'; f.grip = o.side; f.t = 0; }
      else if (arr === 'up' && f.stam > 8) { f.state = 'thrust'; f.t = 0; f.hit = false; f.stam -= 8; }
      f.push = I.mx * f.face > 0.3 ? 0.5 : 0;
      break;
    }
    case 'grip': {
      // on the belt: drive, throw or lift
      if (o.state !== 'grip' && o.state !== 'gripped' && o.state !== 'drive') { f.state = 'stand'; f.grip = -1; break; }
      f.push = I.mx * f.face > 0.3 ? 0.7 : 0.25;
      if (arr === 'up') { f.state = 'drive'; f.t = 0; }
      else if (arr === 'left') tryThrow(fight, f, o);
      else if (arr === 'down') tryLift(fight, f, o);
      break;
    }
    case 'drive': {
      f.push = 1.25;
      f.stam = Math.max(0, f.stam - 14 * dt);
      if (f.t > 0.7 || f.stam <= 0) { f.state = o.state === 'grip' || o.state === 'gripped' || o.state === 'drive' ? 'grip' : 'stand'; f.t = 0; }
      break;
    }
    case 'pull': {
      // step back and slap him down. Works if he is coming in hard.
      f.x -= f.face * 30 * dt;
      if (!f.hit && f.t > 0.12) {
        f.hit = true;
        const coming = o.state === 'charge' || o.state === 'drive' || o.push >= 0.6 || o.state === 'thrust';
        if (adx < 32 && coming && fight.rng() < 0.55 + (100 - o.bal) / 200 + (o.low ? -0.3 : 0)) {
          o.state = 'thrown'; o.t = 0; o.vx = f.face * -0; o.lastHow = 'HATAKIKOMI';
          o.bal = 0; o.fallDir = -f.face;
          ev(fight, 'text', { side: f.side, text: 'HATAKIKOMI!', col: 'hot' });
          setTimeout0(fight, () => boutOver(fight, f.side, 'HATAKIKOMI'));
        } else { f.bal -= 22; ev(fight, 'text', { side: f.side, text: 'MISSED THE PULL', col: 'bad' }); }
      }
      if (f.t > 0.4) { f.state = 'stand'; f.t = 0; }
      break;
    }
    case 'throwing': {
      if (f.t > 0.7) { f.state = 'stand'; f.t = 0; }
      break;
    }
    case 'lifting': {
      // carrying him toward the edge, his feet off the clay
      o.x = f.x + f.face * 18; o.z = f.z; o.lift = Math.min(10, o.lift + dt * 30);
      f.x += f.face * 32 * dt;
      f.stam = Math.max(0, f.stam - 20 * dt);
      if (outside(o.x, o.z, -2)) { o.lift = 0; o.state = 'out'; o.lastHow = 'TSURIDASHI'; boutOver(fight, f.side, 'TSURIDASHI'); }
      else if (f.stam <= 0 || f.t > 1.6) { o.lift = 0; o.state = 'stand'; f.state = 'stand'; f.t = 0; f.bal -= 25; ev(fight, 'text', { side: f.side, text: 'DROPPED HIM', col: 'bad' }); }
      break;
    }
    case 'carried': break;
    case 'thrown': case 'down': case 'out': break;
  }
  f.z = Math.max(DOHYO.cz - DOHYO.rz - 8, Math.min(DOHYO.cz + DOHYO.rz + 8, f.z));
}
function setTimeout0(fight, fn) { fight.pendingFn = fn; }

function force(f) {
  return (f.kg / 150) * f.st.power * (0.55 + 0.45 * f.stam / f.st.stamMax) * (f.low ? 1.18 : 1) * (0.6 + 0.4 * f.bal / 100);
}

// the two bodies in contact: pushes are a contest of force
function contact(fight, a, b, dt) {
  if (fight.pendingFn) { const fn = fight.pendingFn; fight.pendingFn = null; fn(); return; }
  const dx = b.x - a.x;
  // the clash at the charge
  if (Math.abs(dx) < 20 && (a.state === 'charge' || b.state === 'charge')) {
    const ca = a.state === 'charge' ? a.charge : 0.2, cb = b.state === 'charge' ? b.charge : 0.2;
    // charging at a man who sidestepped: you stumble through
    for (const [f, o] of [[a, b], [b, a]]) {
      if (f.state === 'charge' && o.state === 'henka' && Math.abs(o.z - f.z) > 8) {
        f.bal -= 55; f.state = 'stand'; f.x += f.face * 16; f.lastHow = 'HENKA';
        ev(fight, 'text', { side: o.side, text: 'HENKA!', col: 'hot' });
      }
    }
    const pa = ca * force(a), pb = cb * force(b);
    const k = (pa - pb) / Math.max(0.2, pa + pb);
    a.x -= Math.max(0, -k) * 14; b.x += Math.max(0, k) * 14;
    (k > 0 ? b : a).bal -= Math.abs(k) * 30;
    if (a.state === 'charge') a.state = 'stand';
    if (b.state === 'charge') b.state = 'stand';
    fight.freeze = 0.1; fight.crowd = 1;
    ev(fight, 'clash', { x: (a.x + b.x) / 2, z: a.z, k });
    ev(fight, 'hit', { side: k > 0 ? 1 : 0, by: k > 0 ? 0 : 1, kind: 'straight', target: 'body', dmg: 8, big: true, x: (a.x + b.x) / 2, z: a.z, y: 34, face: k > 0 ? 1 : -1 });
  }
  // keep them from walking through each other; the stronger push wins ground
  if (Math.abs(dx) < 20 && Math.abs(b.z - a.z) < 14) {
    const sep = (20 - Math.abs(dx)) / 2 * Math.sign(dx || 1);
    a.x -= sep; b.x += sep;
    const fa = a.push * force(a), fb = b.push * force(b);
    if (fa > 0 || fb > 0) {
      const net = (fa - fb) / Math.max(0.3, fa + fb);
      const sp = 34 * net * dt;
      a.x += sp * Math.sign(dx || 1); b.x += sp * Math.sign(dx || 1);
      if (net > 0) { b.bal -= net * 10 * dt * (b.low ? 0.5 : 1); b.lastHow = a.state === 'drive' ? 'YORIKIRI' : 'OSHIDASHI'; }
      else if (net < 0) { a.bal += net * 10 * dt * (a.low ? 0.5 : 1); a.lastHow = b.state === 'drive' ? 'YORIKIRI' : 'OSHIDASHI'; }
    }
    // the z axis: both at the same line, they turn each other along the edge
    const mz = (a.z + b.z) / 2; a.z += (mz - a.z) * dt * 2; b.z += (mz - b.z) * dt * 2;
  }
}

function tryThrow(fight, f, o) {
  // a throw uses HIS momentum: easier if he is driving into you or off balance
  const coming = o.state === 'drive' || o.push >= 0.6;
  const chance = 0.25 + (coming ? 0.3 : 0) + (100 - o.bal) / 160 - (o.low ? 0.25 : 0) + (force(f) - force(o)) * 0.2;
  f.state = 'throwing'; f.t = 0; f.stats.thrown++;
  if (fight.rng() < chance) {
    o.state = 'thrown'; o.t = 0; o.fallDir = f.face; o.lastHow = 'UWATENAGE'; o.grip = -1; f.grip = -1;
    ev(fight, 'text', { side: f.side, text: 'UWATENAGE!', col: 'hot' });
    fight.freeze = 0.12; fight.crowd = 1;
    setTimeout0(fight, () => boutOver(fight, f.side, 'UWATENAGE'));
  } else {
    f.bal -= 28; ev(fight, 'text', { side: o.side, text: 'HELD ON', col: 'cool' });
  }
}
function tryLift(fight, f, o) {
  const ok = force(f) * 1.1 > force(o) * (o.low ? 1.5 : 1.05) && f.stam > 30;
  if (ok) { f.state = 'lifting'; f.t = 0; o.state = 'carried'; o.t = 0; ev(fight, 'text', { side: f.side, text: 'LIFTED!', col: 'hot' }); }
  else { f.bal -= 18; f.stam -= 15; ev(fight, 'text', { side: o.side, text: 'TOO HEAVY', col: 'cool' }); }
}

function boutOver(fight, w, how) {
  if (fight.phase === 'boutEnd' || fight.phase === 'over') return;
  fight.wins[w]++;
  const W = fight.f[w], L = fight.f[1 - w];
  if (L.state !== 'out') { L.state = L.state === 'thrown' ? 'thrown' : 'down'; L.t = 0; }
  W.state = 'stand'; W.t = 0;
  W.stats.landed++;
  fight.phase = 'boutEnd'; fight.pt = 0; fight.crowd = 1;
  fight.lastWin = { w, how };
  fight.slow = 0.4; fight.slowT = 0.6;
  ev(fight, 'banner', { text: how + '!', big: true, col: 'hot' });
  ev(fight, 'text', { side: w, text: W.name + ' WINS THE BOUT', col: 'good' });
  ev(fight, 'kd', { side: L.side, by: w, x: L.x, z: L.z });
}
function finish(fight) {
  const w = fight.wins[0] >= 2 ? 0 : 1;
  fight.phase = 'over'; fight.pt = 0;
  fight.result = { winner: w, method: fight.lastWin.how + '  ' + fight.wins[w] + '-' + fight.wins[1 - w], round: fight.round };
  fight.f[w].state = 'win'; fight.f[w].t = 0;
  fight.ref.raise = w;
  ev(fight, 'over', { result: fight.result });
}

// ================================================================== AI ===
export function makeSumoAI(profile, rng) {
  const P = (profile && profile.ai) || { react: 0.2, style: 'oshi', pull: 0.15, henka: 0.05, low: 0.5, grip: 0.5, throwP: 0.3 };
  const m = { charged: false, plan: 0, think: 0, wait: 0 };
  return {
    update(fight, me, o, dt) {
      const I = { mx: 0, mz: 0, arrows: [], crouch: false, slip: false, duck: false, guard: false, mash: 0 };
      if (fight.phase === 'intro') {
        if (fight.called) {
          m.wait += dt;
          if (me.state === 'shikiri' && m.wait > P.react * (0.7 + rng() * 0.6)) { I.arrows.push('up'); if (rng() < P.henka) I.slip = true; }
        } else m.wait = 0;
        return I;
      }
      if (fight.phase !== 'bout') return I;
      const dx = o.x - me.x, adx = Math.abs(dx);
      // near the edge with him pushing: get low and circle along the straw
      const edge = outside(me.x - me.face * 14, me.z, 0);
      I.crouch = edge || o.state === 'drive' || rng() < P.low * 0.02 || (m.low = (m.low || 0) - dt) > 0;
      if (o.state === 'drive' || o.push > 0.6) m.low = 0.5;
      m.think -= dt;
      if (me.state === 'stand' || me.state === 'gripped' || me.state === 'grip') {
        I.mx = Math.sign(dx) * (adx > 18 ? 1 : 0.6);
        const dz = o.z - me.z;
        if (Math.abs(dz) > 3) I.mz = Math.sign(dz);
        if (edge) { I.mz = me.z < DOHYO.cz ? 1 : -1; I.mx = 0.4 * Math.sign(dx); }
        if (m.think <= 0) {
          m.think = 0.22 + rng() * 0.25;
          const r = rng();
          if (me.state === 'grip') {
            if (o.state === 'drive' && rng() < P.throwP) I.arrows.push('left');
            else if (outside(o.x + me.face * 22, o.z) && r < 0.6) I.arrows.push('up');
            else if (r < 0.5) I.arrows.push('up');
            else if (r < 0.5 + P.throwP * 0.3) I.arrows.push('left');
            else if (me.kg > o.kg * 1.2 && r < 0.9) I.arrows.push('down');
          } else if (me.state === 'gripped') {
            I.arrows.push(P.style === 'yotsu' ? 'right' : 'up');
          } else {
            // he is coming in hard and I am at the edge: the pull-down
            if ((o.push > 0.6 || o.state === 'drive') && (edge || rng() < P.pull)) I.arrows.push('down');
            else if (P.style === 'yotsu' && adx < 24 && r < P.grip) I.arrows.push('right');
            else if (adx < 30) I.arrows.push('up');
          }
        }
      }
      return I;
    },
  };
}

// ============================================================== ANIMATOR ===
const SHIKIRI = from(POSE.guard, { hip: [-2, 11], neck: [6, 22], head: [10, 26], kL: [9, 9], kR: [-9, 8], fL: [11, 0], fR: [-12, 0], eF: [12, 12], gF: [15, 2], eB: [8, 12], gB: [12, 2] });
const STANCE = from(POSE.guard, { hip: [0, 16], neck: [5, 31], head: [8, 36], kL: [10, 9], kR: [-8, 9], fL: [12, 0], fR: [-11, 0], eF: [12, 25], gF: [18, 29], eB: [6, 24], gB: [12, 27] });
const CHARGE = from(STANCE, { hip: [2, 16], neck: [12, 29], head: [16, 33], eF: [18, 30], gF: [24, 32], eB: [12, 28], gB: [20, 30], fR: [-14, 2] });
const THRUST = from(STANCE, { neck: [8, 31], head: [11, 36], eF: [17, 33], gF: [26, 35], tw: 0.5 });
const GRIP = from(STANCE, { neck: [12, 29], head: [16, 31], eF: [16, 24], gF: [21, 20], eB: [14, 22], gB: [19, 18] });
const DRIVE = from(GRIP, { hip: [-1, 15], kR: [-10, 7], fR: [-15, 1], neck: [14, 28], head: [18, 30] });
const PULL = from(STANCE, { hip: [-3, 17], neck: [-1, 33], head: [1, 38], eF: [14, 30], gF: [16, 20], fL: [6, 0] });
const THROWP = from(GRIP, { tw: -1, neck: [2, 31], head: [3, 36], gF: [8, 30], gB: [-6, 26] });
const LIFTP = from(STANCE, { hip: [-1, 17], neck: [2, 34], head: [4, 39], eF: [12, 30], gF: [17, 32], eB: [8, 30], gB: [14, 31] });
const STUMBLE = from(POSE.hitBody, { hip: [3, 18], neck: [12, 27], head: [16, 30], fR: [-12, 3], gF: [18, 22], gB: [14, 18] });
const PUSHED = from(STANCE, { hip: [-3, 17], neck: [-4, 32], head: [-5, 37], fL: [8, 2], kL: [7, 11] });
const BOW = from(POSE.guard, { neck: [5, 34], head: [8, 38], gF: [6, 22], eF: [4, 27], gB: [2, 22], eB: [0, 27] });

export function sumoPose(f, fight, now) {
  const t = f.t || 0;
  switch (f.state) {
    case 'shikiri': { const p = clone(SHIKIRI); const b = Math.sin(now * 2 + f.side) * 0.5; p.head[1] += b; p.neck[1] += b; return p; }
    case 'charge': return blend(SHIKIRI, CHARGE, easeOut(cl(t / 0.15)));
    case 'henka': return blend(STANCE, from(STANCE, { hip: [-2, 18], neck: [-2, 34], head: [-1, 39] }), easeOut(cl(t / 0.1)));
    case 'thrust': {
      const k = t < 0.1 ? easeOut(t / 0.1) : 1 - easeIO(cl((t - 0.12) / 0.14));
      const p = blend(STANCE, THRUST, k);
      if (f.hand === 'rear') { const g = p.gF, e = p.eF; p.gF = p.gB; p.eF = p.eB; p.gB = g; p.eB = e; }
      return p;
    }
    case 'reach': return blend(STANCE, GRIP, easeOut(cl(t / 0.18)));
    case 'grip': case 'gripped': { const p = clone(GRIP); const s = Math.sin(now * 7 + f.side) * 0.8; p.hip[0] += s; p.neck[0] += s; return p; }
    case 'drive': { const p = clone(DRIVE); const s = Math.sin(now * 14) * 1; p.fL[0] += s; p.fR[0] -= s; return p; }
    case 'pull': return blend(STANCE, PULL, easeOut(cl(t / 0.12)));
    case 'throwing': return blend(GRIP, THROWP, easeOut(cl(t / 0.25)));
    case 'lifting': return clone(LIFTP);
    case 'carried': { const p = clone(GRIP); p.fL[1] += 4; p.fR[1] += 4; p.lift = f.lift; return p; }
    case 'thrown': case 'down': {
      if (t < 0.4) { const p = rotatePose(STUMBLE, -0.6 * easeIn(t / 0.4) * (f.fallDir === f.face ? 1 : -1), 0, 0); return p; }
      return clone(POSE.down);
    }
    case 'out': return t < 0.3 ? blend(PUSHED, STUMBLE, t / 0.3) : clone(STUMBLE);
    case 'win': return t < 0.6 ? blend(STANCE, BOW, t / 0.6) : clone(BOW);
    default: {
      const p = f.low ? clone(STANCE) : blend(STANCE, from(STANCE, { hip: [0, 18], neck: [4, 33], head: [7, 39] }), 0.6);
      if (f.push > 0.5) { p.neck[0] += 4; p.head[0] += 4; p.gF = [21, 30]; p.gB = [16, 28]; }
      if (f.hitT < 0.15) { p.neck[0] -= 3; p.head[0] -= 3; }
      const sp = f.speedNow || 0;
      if (sp > 4) { const ph = Math.sin((f.walk || 0) * 2); p.fL[0] += ph * 2; p.fR[0] -= ph * 2; }
      return p;
    }
  }
}

export const RIKISHI = [
  { id: 'kazan', name: 'KAZAN', nick: 'VOLCANO', style: 'THRUSTER (OSHI)', record: '8-7',
    look: { skin: 1, hair: 'chonmage', hairC: '#120c0a', beard: 'none', outfit: 'sumo', trunks: ['#7a2a8a', '#5a1a6a', '#3a0a4a'], build: { w: 1.38, h: 1.0 }, belly: 0.8 },
    lv: { power: 4, speed: 4, foot: 3, health: 4, stamina: 4 },
    ai: { react: 0.26, style: 'oshi', pull: 0.1, henka: 0.03, low: 0.4, grip: 0.2, throwP: 0.2 },
    strengths: ['THRUSTS - a storm of palms that drives you back'], weaknesses: ['never grips - get on his belt and drive'] },
  { id: 'takanoyama', name: 'TAKANOYAMA', nick: 'HAWK MOUNTAIN', style: 'BELT FIGHTER (YOTSU)', record: '10-5',
    look: { skin: 1, hair: 'chonmage', hairC: '#120c0a', beard: 'none', outfit: 'sumo', trunks: ['#1a4a8a', '#0a2a6a', '#05153a'], build: { w: 1.5, h: 1.03 }, belly: 1.0 },
    lv: { power: 6, speed: 2, foot: 2, health: 6, stamina: 5 },
    ai: { react: 0.28, style: 'yotsu', pull: 0.05, henka: 0.0, low: 0.6, grip: 0.9, throwP: 0.45 },
    strengths: ['BELT MASTER - once he has the mawashi he throws'], weaknesses: ['slow off the line: beat him at the charge', 'thrusts keep him off the belt'] },
  { id: 'hayate', name: 'HAYATE', nick: 'GALE', style: 'TRICKSTER', record: '9-6',
    look: { skin: 2, hair: 'chonmage', hairC: '#1a1414', beard: 'none', outfit: 'sumo', trunks: ['#2fbf5a', '#1d8a3c', '#0d5422'], build: { w: 1.18, h: 0.98 }, belly: 0.45 },
    lv: { power: 3, speed: 7, foot: 7, health: 3, stamina: 6 },
    ai: { react: 0.17, style: 'oshi', pull: 0.45, henka: 0.3, low: 0.3, grip: 0.3, throwP: 0.3 },
    strengths: ['HENKA - sidesteps the charge', 'PULL-DOWNS when you lean in'], weaknesses: ['light: a patient drive with a low stance walks him out'] },
  { id: 'fujikaze', name: 'FUJIKAZE', nick: 'YOKOZUNA', style: 'GRAND CHAMPION', record: '14-1',
    look: { skin: 0, hair: 'chonmage', hairC: '#0e0a0a', beard: 'none', outfit: 'sumo', trunks: ['#e8e0d0', '#b8b0a0', '#7a7060'], build: { w: 1.55, h: 1.06 }, belly: 1.0, belt: false },
    lv: { power: 8, speed: 6, foot: 5, health: 8, stamina: 8 },
    ai: { react: 0.15, style: 'yotsu', pull: 0.2, henka: 0.02, low: 0.7, grip: 0.7, throwP: 0.5 },
    strengths: ['the yokozuna: heavy, low, perfect at the charge'], weaknesses: ['proud: he never sidesteps - a henka can catch him once'] },
];
