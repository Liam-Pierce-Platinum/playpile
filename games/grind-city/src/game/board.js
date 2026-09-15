// THE BOARD. This is the whole game.
//
// The mouse is not a pointer, it is your weight on the deck. A cursor sits on
// a little 2D pad -- x is tail to nose, y is press to lift -- and it is STICKY:
// it stays roughly where you put it, so bringing it back to the middle is a
// decision you make, not something that happens to you.
//
// Set your foot, then flick. Where your weight sits decides what a flick does:
//
//   flick sideways over a TIP     ->  the deck FLIPS, and which way depends on
//                                     which end you are over  (torque = r x F)
//   press down in the MIDDLE      ->  the deck SPINS  (shove-it, 360 shove)
//   press down over a TIP         ->  end over end    (impossible)
//   a hard press over a rail      ->  STOMP onto it and grind
//   press down on the floor, then back up  ->  POP (ollie)
//   stop, or come back to the CENTRE       ->  SETTLE, and you land
//
// The centre is the safety net. Bring the cursor home and whatever the deck is
// doing gets damped and pulled onto a clean angle, and you land. Settling early
// costs you points, not the run.
//
// One rule is load-bearing: a SLIDE is not a FLICK. Below flickLo the cursor is
// only being moved and imparts nothing; above flickHi it is a snap. Without
// that split you could not reposition without spinning the deck.

import { SPEED } from '../world/park.js';

export const TAU = Math.PI * 2;

const K = {
  sens: 0.0075,       // pad units per pixel of mouse travel
  clampR: 1.45,
  clampP: 1.40,
  returnR: 1.1,       // sticky. the cursor drifts home slowly, it is not yanked
  returnP: 2.0,

  centre: 0.36,       // inside this radius you are settled
  centreOut: 0.85,    // ...and outside this you are not settling at all

  flickLo: 7,         // pad units/sec: pure repositioning
  flickHi: 19,        // ...a real snap

  flip: 9.5,          // rad/s of roll per (unit of flick x unit of offset)
  spin: 7.0,          // rad/s of yaw per unit of downward press in the middle
  pitch: 3.2,         // ...and end over end when that press is over a tip
  middle: 0.42,       // |offset| under this counts as "the middle"
  offLag: 16,         // how fast the deck feels a change of foot position

  settleDamp: 9.5,    // how fast a centred or idle cursor kills rotation
  settleMag: 15,      // ...and pulls it onto a clean angle
  lead: 0.10,         // aim the magnet slightly ahead of the spin
  commit: 0.17,       // past this fraction of a turn, letting go COMPLETES it
  oppose: 0.18,       // how much of a flick that FIGHTS the current spin counts
  pressPure: 0.75,    // a press must out-weigh the sideways drift to be a press

  chargeRate: 3.2,    // pop loaded per second of pressing down
  chargeDecay: 1.3,
  // The pop is a VELOCITY, so it grows with the world -- see SPEED in park.js.
  // Left alone, the same ollie would clear a proportionally smaller gap once
  // the parks got bigger, and every set of stairs would become unjumpable.
  popBase: 64 * SPEED,
  popCharge: 120 * SPEED,
  popRelease: 58 * SPEED,
  releaseSpeed: 0.7,  // pad units/sec upward that counts as letting the pop go

  tolRoll: 0.78,      // radians of slop allowed on landing -- deliberately loose
  tolYaw: 0.70,
};

// Where the tips are on the pad, for the hud to draw.
const B = { tip: 0.55 };

export function createBoard() {
  const b = {
    r: 0, p: 0,
    dr: 0, dp: 0,
    roll: 0, rollV: 0,
    yaw: 0, yawV: 0,
    pitch: 0, pitchV: 0,   // kept for the renderer and the namer; not driven
    charge: 0, chargeEnd: 0,
    lastSide: -1,
    settled: 1,            // 0..1, how centred the cursor is
    idle: 0,               // seconds since the last real flick
    catching: 0,
    gesture: '', gestureT: 0,   // what the last snap was read as, for the hud
    stomp: false,          // true for one frame after a downward flick
    offLag: 0,             // lagged foot offset -- what the deck actually feels
    strokes: 0,            // separate deliberate movements this air
    lastStroke: 0,
    airborne: false,
    sens: 1,
    invert: false,
  };

  // mx/my are raw mouse pixels; padR/padP are pad units straight from the
  // arrow keys, so the keyboard feel does not move when you change mouse
  // sensitivity. Both land in the same two numbers -- nothing downstream knows
  // or cares which device a flick came from.
  b.feed = function (mx, my, padR, padP) {
    const s = b.sens;
    b.dr = mx * K.sens * s + (padR || 0);
    b.dp = (b.invert ? -my : my) * K.sens * s + (padP || 0);
  };

  b.reset = function () {
    b.r = b.p = b.dr = b.dp = 0;
    b.roll = b.rollV = b.yaw = b.yawV = b.pitch = b.pitchV = 0;
    b.charge = 0; b.chargeEnd = 0; b.catching = 0; b.settled = 1; b.idle = 1;
    b.offLag = 0;
    b.strokes = 0; b.lastStroke = 0;
    b.gesture = ''; b.gestureT = 0;
  };

  // mode is 'air' | 'ground' | 'grind'
  b.update = function (dt, mode) {
    const airborne = mode === 'air';
    b.airborne = airborne;

    const rBefore = b.r;
    b.r = clamp(b.r + b.dr, -K.clampR, K.clampR);
    b.p = clamp(b.p + b.dp, -K.clampP, K.clampP);
    b.r += (0 - b.r) * Math.min(1, K.returnR * dt);
    b.p += (0 - b.p) * Math.min(1, K.returnP * dt);
    if (Math.abs(rBefore) > 0.08) b.lastSide = Math.sign(rBefore);

    // how centred we are: 1 in the middle, 0 well outside it
    const dist = Math.hypot(b.r, b.p);
    b.settled = 1 - smoothstep(K.centre, K.centreOut, dist);
    b.catching = Math.max(0, b.catching - dt * 4.5);
    b.stomp = false;
    if (b.gestureT > 0) b.gestureT -= dt;

    // --- is this frame a flick? -----------------------------------------
    const move = Math.hypot(b.dr, b.dp);
    const snap = smoothstep(K.flickLo, K.flickHi, move / Math.max(dt, 1e-4));
    if (snap > 0.15) b.idle = 0; else b.idle += dt;

    // A STROKE is one deliberate movement: a snap in a direction you were not
    // already going. Real tricks take two or three. Mashing the mouse takes
    // fifteen, and that is the whole difference between a trick and a mash --
    // the deck ends up somewhere either way, so the input is what has to be
    // judged. See how it is spent in skater.js.
    if (snap > 0.45) {
      const s2 = Math.abs(b.dr) > Math.abs(b.dp)
        ? Math.sign(b.dr) : Math.sign(b.dp) * 2;
      if (s2 !== b.lastStroke) { b.strokes++; b.lastStroke = s2; }
    } else if (snap < 0.15) {
      b.lastStroke = 0;
    }

    // Where the deck FEELS your weight -- the foot position lagged by about a
    // twentieth of a second. Torque is taken from this, not from the live
    // cursor, so a hard flick imparts spin from where your weight WAS when the
    // flick started rather than from where the flick has already carried it.
    const off = clamp(rBefore, -1, 1);

    if (airborne) {
      // --- SIDEWAYS FLICK OVER A TIP -> the deck rolls ---------------------
      // Torque is (movement) x (offset), which is just r x F. That is why the
      // direction depends on which end you are over, and why nothing happens
      // while your weight is centred. You set your foot FIRST and then flick,
      // and that setup step is the point: it is a decision you get to make.
      let torque = b.dr * K.flip * b.offLag * snap;
      // TAKING YOUR HAND BACK MUST NOT UNDO THE TRICK. Bringing the cursor
      // home is a leftward move over a foot that is still out on the nose,
      // which is arithmetically a heelflip and would cancel the kickflip you
      // just threw. So torque that fights a rotation already under way is
      // mostly ignored; you have to stop and start again to reverse a flip.
      if (b.rollV * torque < 0 && Math.abs(b.rollV) > 2) torque *= K.oppose;
      b.rollV += torque;
      if (snap > 0.4 && Math.abs(torque) > 0.4) {
        mark(b, torque > 0 ? 'KICKFLIP' : 'HEELFLIP');
      }

      // A press only spins the deck if it is actually a PRESS. A mostly
      // sideways move with a bit of downward drift in it -- which is what
      // coming back to the middle looks like -- used to start a shove-it and
      // interrupt the flip.
      if (b.dp > Math.abs(b.dr) * K.pressPure && snap > 0.02) {
        if (Math.abs(b.offLag) < K.middle) {
          // pressing down in the MIDDLE spins it flat
          const dir = Math.abs(b.offLag) > 0.05 ? Math.sign(b.offLag) : b.lastSide;
          b.yawV += b.dp * K.spin * dir;
          mark(b, 'SPIN');
        } else {
          // ...and over a TIP it goes end over end
          b.pitchV += b.dp * K.pitch * Math.sign(b.offLag);
          mark(b, 'IMPOSSIBLE');
        }
        // either way, a hard press STOMPS -- that is what puts you down onto a
        // bar you would otherwise sail over
        b.stomp = snap > 0.5;
      } else if (-b.dp > Math.abs(b.dr) * K.pressPure && snap > 0.02) {
        b.catching = Math.min(1, b.catching + snap);
        mark(b, 'CATCH');
      }

      // --- stopping brings it home ---------------------------------------
      // Letting go IS the settle. A tenth of a second with no flick and the
      // deck comes back under your feet wherever the cursor happens to be --
      // you should never wipe out because you simply stopped doing anything.
      const idleGrab = smoothstep(0.05, 0.13, b.idle);
      const grab = Math.max(b.settled, b.catching, idleGrab);
      if (grab > 0.02) {
        const d = Math.min(0.92, K.settleDamp * grab * dt);
        b.rollV *= 1 - d;
        b.yawV *= 1 - d;
        b.pitchV *= 1 - d;
        const k = Math.min(1, K.settleMag * grab * dt);
        b.roll = magnet(b.roll, b.rollV, TAU, k);
        b.yaw = magnet(b.yaw, b.yawV, Math.PI, k);
        b.pitch = magnet(b.pitch, b.pitchV, TAU, k);
      }

      b.roll += b.rollV * dt;
      b.yaw += b.yawV * dt;
      b.pitch += b.pitchV * dt;

      const drag = Math.min(1, 0.35 * dt);
      b.rollV *= 1 - drag;
      b.yawV *= 1 - drag;
      b.pitchV *= 1 - drag;

      b.charge = 0; b.chargeEnd = 0;
    } else {
      // --- on the floor ---------------------------------------------------
      // Pressing down in the MIDDLE compresses for a pop. Right out at a tip
      // it is a manual instead.
      if (b.p > 0.2 && Math.abs(b.r) < 0.62) {
        b.charge = Math.min(1, b.charge + dt * K.chargeRate * b.p);
        b.chargeEnd = b.r > 0.12 ? 1 : -1;
      } else {
        b.charge = Math.max(0, b.charge - dt * K.chargeDecay);
      }
      if (mode !== 'grind') {
        b.roll = decayAngle(b.roll, dt * 9);
        b.yaw = decayAngle(b.yaw, dt * 9);
      }
      b.rollV = b.yawV = b.pitchV = 0;
    }

    b.offLag += (off - b.offLag) * Math.min(1, K.offLag * dt);
    b.snap = snap;
    return b;
  };

  // Coming back UP off a compressed deck lets the pop go. Returns px/s, or 0.
  b.popRequest = function (dt) {
    const up = -b.dp / Math.max(dt, 1e-4);
    if (up < K.releaseSpeed) return 0;
    if (b.charge < 0.06) return 0;
    const release = clamp((up - K.releaseSpeed) / 5, 0, 1);
    return K.popBase + K.popCharge * b.charge + K.popRelease * release;
  };

  // Manual: weight held right out over a tip while rolling.
  b.manual = function () {
    if (b.airborne) return 0;
    if (b.p < 0.3 || Math.abs(b.r) < 0.7) return 0;
    return Math.sign(b.r);
  };

  b.pump = function () { return b.airborne ? 0 : Math.max(0, b.p); };

  b.attitude = function () {
    const flips = Math.round(b.roll / TAU);
    const shoves = Math.round(b.yaw / Math.PI);
    const pitches = Math.round(b.pitch / TAU);
    return {
      flips, shoves, pitches,
      rollErr: Math.abs(b.roll - flips * TAU),
      yawErr: Math.abs(b.yaw - shoves * Math.PI),
      pitchErr: Math.abs(b.pitch - pitches * TAU),
      spinning: Math.abs(b.rollV) + Math.abs(b.yawV) + Math.abs(b.pitchV),
    };
  };

  // Deliberately generous. A centred cursor always lands -- that is the deal.
  b.canLand = function () {
    if (b.settled > 0.5 || b.idle > 0.2) return true;
    const a = b.attitude();
    const penalty = Math.min(0.22, a.spinning * 0.012);
    return a.rollErr < K.tolRoll - penalty && a.yawErr < K.tolYaw - penalty
      && a.pitchErr < K.tolRoll - penalty;
  };

  b.settle = function () {
    const a = b.attitude();
    b.roll = 0; b.yaw = 0; b.pitch = 0;
    b.rollV = b.yawV = b.pitchV = 0;
    b.charge = 0;
    return a;
  };

  b.K = K;
  b.B = B;
  return b;
}

function mark(b, name) { b.gesture = name; b.gestureT = 0.45; }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Pulls an angle onto a clean multiple -- but onto the NEXT one in the direction
// it is already turning, not the nearest.
//
// That is the difference between "letting go abandons your trick" and "letting
// go finishes it". Once the deck is more than about a sixth of the way into a
// rotation the flick is treated as committed and the settle completes it; below
// that it snaps back flat, which is what you want when you have changed your
// mind. Damping alone would freeze a kickflip at ninety degrees.
function magnet(a, v, period, amount) {
  const n = (a + v * K.lead) / period;
  const dir = v > 0.4 ? 1 : v < -0.4 ? -1 : 0;
  let target;
  if (dir > 0) target = Math.ceil(n - K.commit) * period;
  else if (dir < 0) target = Math.floor(n + K.commit) * period;
  else target = Math.round(n) * period;
  return a + (target - a) * Math.min(1, amount);
}

function decayAngle(a, k) {
  const target = Math.round(a / TAU) * TAU;
  const n = a + (target - a) * Math.min(1, k);
  return Math.abs(n - target) < 0.002 ? 0 : n - target;
}

function smoothstep(lo, hi, x) {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}
