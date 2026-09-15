// The skater. Four states, and the interesting one is 'ride'.
//
// Riding is done in ARC LENGTH along the park's polyline with a signed speed,
// not in x/y. Gravity is applied along the surface tangent, which is what makes
// a transition work for free: roll into a quarter pipe and gravity accelerates
// you down it, roll up the far side and the same term slows you down. Pumping
// (weight on the board through the curve) is the only way to add energy without
// pushing, exactly like the real thing.
//
// You leave the floor at a CONVEX corner when the speed needed to stay stuck to
// it exceeds what gravity can supply -- that is the lip of a quarter and the top
// of a kicker, and it is one test, not a special case per feature.

import { nameAir, nameGrind, nameManual } from './tricks.js';
import { WORLD, SPEED } from '../world/park.js';
import { POSE_MIN, poseValue } from './poses.js';

const G = 430;              // px/s^2
const PUSH = 200;      // asin(PUSH/G) is the steepest bank you can climb
const BRAKE = 300;
// The ceiling on rolling speed. It is high enough to BOMB A HILL on -- a long
// steep street should keep accelerating well past what you can push to, and
// 235 capped that out almost immediately.
const MAXV = 190 * SPEED;
const FRIC = 0.30;
const PUMP = 210;
const AIRCTL = 55;
const BODY_TORQUE = 15;
const BODY_MAX = 9.5;
const GRIND_FRIC = 0.55;
const BAIL_TIME = 1.05;
// WHAT A POP COSTS. A bare ollie is 16 of your 100; a fully charged one is
// nearer 30. Six or so back to back and you are out, which is roughly what a
// person gets before their legs stop answering.
const POP_COST = 16;
const POP_CHARGE_COST = 15;
// You cannot pop at all below this, so it fails clearly rather than giving you
// a limp one you did not ask for.
const POP_FLOOR = 12;
// HOW SHARP AN UPWARD CORNER YOU CAN RIDE INTO.
//
// Riding is done in arc length along the ground polyline, which means the
// skater follows whatever the ground does -- including turning through ninety
// degrees and riding straight up the riser of a stair. That is faithful to the
// geometry and completely wrong as behaviour: you do not ride up a step, you
// hit it.
//
// The test is the TURN ANGLE, not the steepness, because a quarter pipe is
// vertical at the top and you are supposed to ride that. A transition is built
// from ten segments over eighty-odd degrees, so each corner turns about eight;
// a stair riser or the wall of a pit turns ninety in one. Anything past about
// thirty-five degrees in a single corner is a thing you run into.
const SLAM_TURN = 0.62;
// and below this you are rolling slowly enough to just stop against it
const SLAM_SPEED = 62;
// Walking pace, and it is deliberately slow. Carrying the board is how you get
// somewhere you cannot ride to -- up the stairs, out of a pit, back up the hill
// -- not a faster way of covering ground.
const WALK = 62 * SPEED;

export function createSkater(park, board, score) {
  const sk = {
    park, board, score,
    state: 'ride',
    s: park.spawnS, v: 40,
    x: 0, y: 0, ang: 0, dir: 1, switchy: false,
    vx: 0, vy: 0,
    airTime: 0, popEnd: 0, apex: 0, launchY: 0,
    bodySpin: 0, bodySpinV: 0,
    grind: null, grindT: 0,
    manualT: 0, manualName: '',
    bailT: 0, bailSpin: 0, bailLean: 0, bailSlide: 0,
    carrying: false, walkPhase: 0,
    // Stamina, and what your legs are currently good for. Upgraded with money.
    stam: 100, stamMax: 100, stamRegen: 15, stamCost: 1, stamFlash: 0,
    // the grab you are holding, how long you have held it, and the best hold
    // of this jump -- the best one counts, so letting go to land does not
    // throw away the grab you just did
    pose: null, poseT: 0, bestPose: null, bestPoseT: 0,
    // S, held in the air: the rider turns the board belly-out so you can see
    // what is painted on it. `showT` is the ease, so it turns rather than snaps.
    showing: false, showT: 0,
    // `mount` is the VISUAL blend between riding and being on foot. The state
    // flips the instant you press the button, but the rider takes a moment to
    // pick the board up or step onto it, and this is that moment.
    mount: 0, hopT: 0, walkCrouch: 0,
    crouch: 0, lean: 0,
    justLanded: 0, sparks: [], popped: false,
    input: 0,          // -1 / 0 / +1 from A and D
    lastPop: 0,
  };

  const p = park;

  // Fitted from the shop. Called when a run starts and whenever you buy a tier.
  sk.setLegs = function (l) {
    if (!l) return;
    const full = sk.stam >= sk.stamMax - 0.01;
    sk.stamMax = l.max; sk.stamRegen = l.regen; sk.stamCost = l.cost;
    if (full) sk.stam = l.max;
    sk.stam = Math.min(sk.stam, sk.stamMax);
  };

  sk.respawn = function () {
    sk.state = 'ride';
    sk.s = p.spawnS; sk.v = 40; sk.dir = 1; sk.switchy = false;
    sk.vx = sk.vy = 0; sk.bodySpin = sk.bodySpinV = 0;
    sk.grind = null; sk.manualT = 0; sk.bailT = 0; sk.sparks.length = 0;
    sk.bailSpin = 0; sk.bailLean = 0; sk.bailSlide = 0;
    sk.carrying = false; sk.walkPhase = 0;
    sk.pose = null; sk.poseT = 0; sk.bestPose = null; sk.bestPoseT = 0;
    sk.showing = false; sk.showT = 0;
    sk.mount = 0; sk.hopT = 0; sk.walkCrouch = 0;
    sk.stam = sk.stamMax; sk.stamFlash = 0;
    board.reset();
    place();
  };

  function place() {
    const q = p.posAt(sk.s);
    sk.x = q.x; sk.y = q.y; sk.ang = Math.atan2(q.seg.ty, q.seg.tx);
    sk.seg = q.seg;
    // You face the way the board is going. Rolling away backwards is still
    // FAKIE for the purposes of naming a trick -- that is what sk.switchy is
    // for -- but the rider turns to look where they are travelling.
    if (Math.abs(sk.v) > 10) sk.dir = Math.sign(sk.v);
  }

  // ------------------------------------------------------------------ frame
  sk.update = function (dt) {
    if (sk.justLanded > 0) sk.justLanded -= dt;
    for (let i = sk.sparks.length - 1; i >= 0; i--) {
      const q = sk.sparks[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; q.life -= dt;
      if (q.life <= 0) sk.sparks.splice(i, 1);
    }

    const mode = sk.state === 'air' ? 'air' : sk.state === 'grind' ? 'grind' : 'ground';
    board.update(dt, mode);

    if (sk.state === 'ride') ride(dt);
    else if (sk.state === 'air') air(dt);
    else if (sk.state === 'grind') grinding(dt);
    else if (sk.state === 'walk') walk(dt);
    else bail(dt);

    // ease the pick-up / step-on animation toward wherever we actually are
    const want = sk.state === 'walk' ? 1 : 0;
    sk.mount += (want - sk.mount) * Math.min(1, dt * 7.5);
    if (Math.abs(sk.mount - want) < 0.004) sk.mount = want;
    if (sk.hopT > 0) sk.hopT = Math.max(0, sk.hopT - dt * 3.4);

    // Showing the board off eases in and out, and while it is held the deck is
    // in your HAND -- so it stops turning, the same way catching it does.
    if (sk.state !== 'air') sk.showing = false;
    sk.showT += ((sk.showing ? 1 : 0) - sk.showT) * Math.min(1, dt * 9);
    if (sk.showT < 0.004) sk.showT = 0;
    if (sk.showing) board.catching = 1;

    // Stamina comes back while you are ON THE FLOOR and rolling. It does not
    // come back in the air, which is what stops you chaining pops forever off
    // one long drop, and it comes back faster the faster you are going -- so
    // the way to recover is to skate, not to stand still.
    if (sk.state === 'ride' || sk.state === 'grind') {
      const rolling = 0.5 + Math.min(1, Math.abs(sk.v) / 160) * 0.9;
      sk.stam = Math.min(sk.stamMax, sk.stam + sk.stamRegen * rolling * dt);
    } else if (sk.state === 'walk') {
      sk.stam = Math.min(sk.stamMax, sk.stam + sk.stamRegen * 0.7 * dt);
    }
    if (sk.stamFlash > 0) sk.stamFlash = Math.max(0, sk.stamFlash - dt * 2.2);

    score.update(dt, Math.abs(sk.v) > 12 || sk.state !== 'ride');
    sk.crouch += ((sk.state === 'air' ? Math.max(0, board.p) * 0.5
                 : Math.max(0, board.p)) - sk.crouch) * Math.min(1, dt * 12);
  };

  // ----------------------------------------------------------------- carrying
  // Pick the board up, or put it down. Only from the floor -- you cannot pick
  // your board up in mid air, and prising it out from under a grind would be a
  // strange thing to allow.
  sk.toggleCarry = function () {
    if (sk.state === 'walk') {
      sk.state = 'ride';
      sk.carrying = false;
      sk.v = 12 * sk.dir;              // you step onto it, you do not launch
      board.reset();
      place();
      return true;
    }
    if (sk.state !== 'ride') return false;
    sk.state = 'walk';
    sk.carrying = true;
    sk.v = 0;
    sk.walkPhase = 0;
    board.reset();
    place();
    return true;
  };

  // On foot you are not on a board, so none of the riding rules apply: no
  // launching off lips, no gravity down the transition, no speed to keep. You
  // just walk, and you can walk up anything.
  // A hop on foot. It is not a jump into the air state -- there is no board to
  // land on -- it is a step up and back down, which is what you can actually do
  // carrying a board under your arm.
  sk.walkHop = function () {
    if (sk.state !== 'walk' || sk.hopT > 0) return false;
    sk.hopT = 1;
    return true;
  };

  sk.walkDuck = function (on) {
    if (sk.state === 'walk') sk.duck = !!on;
  };

  function walk(dt) {
    const seg = p.segAt(sk.s);
    sk.seg = seg;

    // crouching slows you to a shuffle, which is the only reason to do it
    sk.walkCrouch += ((sk.duck ? 1 : 0) - sk.walkCrouch) * Math.min(1, dt * 9);

    if (sk.input) {
      sk.dir = sk.input;
      // a slope still costs you something, but it can never stop you
      const uphill = Math.max(0, seg.ty * sk.input * -1);
      const pace = WALK * (1 - uphill * 0.35) * (1 - sk.walkCrouch * 0.55);
      let ns = sk.s + pace * sk.input * dt;
      if (ns < 0) ns = 0;
      if (ns > p.total - 0.01) ns = p.total - 0.01;
      sk.s = ns;
      sk.walkPhase += dt * 9.5 * (1 - sk.walkCrouch * 0.4);
    } else {
      // settle the stride back to standing rather than freezing mid-step
      sk.walkPhase += (0 - Math.sin(sk.walkPhase)) * Math.min(1, dt * 8);
    }
    sk.v = 0;
    const q = p.posAt(sk.s);
    sk.x = q.x; sk.y = q.y;
    sk.ang = Math.atan2(q.seg.ty, q.seg.tx);
  }

  // ------------------------------------------------------------------ riding
  function ride(dt) {
    const seg = p.segAt(sk.s);
    sk.seg = seg;

    // push / brake
    if (sk.input) {
      if (Math.abs(sk.v) < 14 || Math.sign(sk.v) === sk.input) sk.v += PUSH * sk.input * dt;
      else sk.v += BRAKE * sk.input * dt;
    }

    // gravity along the surface
    sk.v += G * seg.ty * dt;

    // pumping: weight through a curve is energy in
    const pump = board.pump();
    if (pump > 0.15 && Math.abs(seg.ty) > 0.12 && Math.abs(sk.v) > 15) {
      sk.v += Math.sign(sk.v) * PUMP * pump * Math.abs(seg.ty) * dt;
    }

    // rolling resistance
    sk.v -= sk.v * FRIC * dt;
    if (!sk.input && Math.abs(sk.v) < 5) sk.v *= 0.9;
    sk.v = Math.max(-MAXV, Math.min(MAXV, sk.v));

    // manual scoring
    const man = board.manual();
    if (man && Math.abs(sk.v) > 22) {
      const nm = nameManual(man);
      if (sk.manualT === 0) { score.add(nm.name, 35); sk.manualName = nm.name; }
      sk.manualT += dt;
      score.tick(nm.rate * dt);
    } else if (sk.manualT > 0) {
      sk.manualT = 0;
    }

    // pop off the floor
    const pop = board.popRequest(dt);
    if (pop > 0 && sk.lastPop <= 0) {
      // A POP COSTS YOU SOMETHING. A charged one costs more than a flick of a
      // one, because it is a harder thing to do.
      const cost = (POP_COST + POP_CHARGE_COST * board.charge) * sk.stamCost;
      if (sk.stam < Math.max(POP_FLOOR, cost * 0.7)) {
        // out of legs. The board still uncompresses, you just do not go
        // anywhere -- and the meter flashes so it is obvious why.
        sk.stamFlash = 1;
        sk.lastPop = 0.18;
        board.charge = 0;
        return;
      }
      sk.stam = Math.max(0, sk.stam - cost);
      launch(seg, pop, board.chargeEnd);
      sk.lastPop = 0.12;
      return;
    }
    sk.lastPop -= dt;

    // travel, watching for a lip on the way
    const fromI = seg.i;
    let ns = sk.s + sk.v * dt;
    if (ns <= 0) { ns = 0; sk.v = Math.max(0, sk.v); }
    if (ns >= p.total) { ns = p.total - 0.01; sk.v = Math.min(0, sk.v); }
    const toSeg = p.segAt(ns);
    if (toSeg.i !== fromI && Math.abs(sk.v) > 6) {
      const step = toSeg.i > fromI ? 1 : -1;
      for (let i = fromI; i !== toSeg.i; i += step) {
        const a = p.segs[i], bseg = p.segs[i + step];
        if (!bseg) break;
        const fwd = step > 0;
        const t1x = fwd ? bseg.tx : -bseg.tx, t1y = fwd ? bseg.ty : -bseg.ty;
        const t0x = fwd ? a.tx : -a.tx, t0y = fwd ? a.ty : -a.ty;
        const dot = t1x * a.nx + t1y * a.ny;

        // CONCAVE: the floor bends UP into you. Gently, that is a transition
        // and you ride it. Sharply, it is a stair riser or a wall, and you go
        // into it -- board stops, you do not.
        if (dot > 0.004) {
          const turn = Math.acos(Math.max(-1, Math.min(1, t0x * t1x + t0y * t1y)));
          // and it has to be asking you to CLIMB. The bottom of a riser turns
          // just as sharply as the riser itself, but that corner flattens out
          // underneath you -- it is a landing, not a wall.
          const climbing = -t1y;
          if (turn > SLAM_TURN && climbing > 0.5) {
            // park yourself at the foot of it so the bail starts where you hit
            sk.s = a.s0 + (fwd ? a.len - 0.01 : 0.01);
            place();
            if (Math.abs(sk.v) > SLAM_SPEED) {
              // you were carrying enough to go over the bars
              sk.vx = sk.v * a.tx * 0.5;
              sk.vy = sk.v * a.ty * 0.5;
              startBail();
            } else {
              // walking pace into a step: you just stop dead against it
              sk.v = 0;
            }
            return;
          }
        }

        if (dot < -0.004) {                    // convex: the floor bends away
          const turn = Math.acos(Math.max(-1, Math.min(1, t0x * t1x + t0y * t1y)));
          const hold = G * Math.max(0.02, Math.abs(a.ny)) * a.len;   // what gravity can supply
          const need = sk.v * sk.v * turn;
          const forced = (fwd ? a.lipEnd : bseg.lipEnd) && Math.abs(sk.v) > 26;
          if (need > hold * 0.95 || forced) {
            sk.s = a.s0 + (fwd ? a.len - 0.01 : 0.01);
            launch(a, 0, 0, true);
            return;
          }
        }
      }
    }
    sk.s = ns;
    place();
  }

  // ------------------------------------------------------------------ leaving
  function launch(seg, pop, popEnd, offLip) {
    const q = p.posAt(sk.s);
    sk.x = q.x; sk.y = q.y;
    sk.vx = seg.tx * sk.v + seg.nx * pop;
    sk.vy = seg.ty * sk.v + seg.ny * pop;
    // nudge clear so the very first sweep does not re-hit the floor we left
    sk.x += seg.nx * 1.2 * WORLD; sk.y += seg.ny * 1.2 * WORLD;
    sk.state = 'air';
    sk.airTime = 0;
    sk.launchY = sk.y;
    sk.apex = sk.y;
    sk.popEnd = popEnd || 0;
    sk.bodySpin = 0; sk.bodySpinV = 0;
    sk.offLip = !!offLip;
    sk.popped = true;
    board.strokes = 0; board.lastStroke = 0;
    // Leaving the floor wipes any lingering catch. Your hand is still moving up
    // from the pop itself, and without this that reads as 'settle' and quietly
    // damps the flick you make a tenth of a second later.
    board.catching = 0;
    if (pop > 0) puff(sk.x, sk.y, 5);
  }

  // ------------------------------------------------------------------ the air
  // A grab is held, not tapped. You can only reach the board while you are off
  // the ground, and the moment you land the hand comes off it.
  // HOLD IT OUT AND LOOK AT IT. Not a trick and it does not pay -- it is a way
  // to actually SEE the graphic you paid for, which otherwise only ever flashes
  // past mid-flip. Only in the air, because on the ground the board is under
  // your feet.
  sk.show = function (on) {
    sk.showing = !!on && sk.state === 'air';
    return sk.showing;
  };

  sk.grab = function (pose) {
    if (sk.state !== 'air') return false;
    if (sk.pose && pose && sk.pose.id === pose.id) return true;
    sk.pose = pose;
    sk.poseT = 0;
    return !!pose;
  };
  sk.release = function (pose) {
    if (!sk.pose) return;
    if (pose && sk.pose.id !== pose.id) return;
    sk.pose = null;
    sk.poseT = 0;
  };

  function air(dt) {
    sk.airTime += dt;
    if (sk.pose) {
      sk.poseT += dt;
      // the best hold of the jump is the one that gets paid
      if (sk.poseT > sk.bestPoseT) { sk.bestPoseT = sk.poseT; sk.bestPose = sk.pose; }
    }
    sk.vy += G * dt;

    // A and D in the air spin your BODY. Holding winds the spin up; LETTING GO
    // squares you back up to the nearest half turn on its own. Deliberately
    // forgiving -- all the difficulty in this game is meant to live in the
    // mouse, and a rider who just held D through an ollie should not be
    // punished for it.
    if (sk.input) {
      sk.vx += AIRCTL * sk.input * dt;
      sk.bodySpinV += BODY_TORQUE * sk.input * dt * sk.dir;
      sk.bodySpinV = Math.max(-BODY_MAX, Math.min(BODY_MAX, sk.bodySpinV));
    } else {
      sk.bodySpinV *= 1 - Math.min(1, dt * 6);
      const near = Math.round(sk.bodySpin / Math.PI) * Math.PI;
      sk.bodySpin += (near - sk.bodySpin) * Math.min(1, dt * 7);
    }
    // pulling the board up also catches your own rotation
    if (board.dp < 0) sk.bodySpinV *= 1 - Math.min(0.9, -board.dp * 0.8);
    sk.bodySpin += sk.bodySpinV * dt;

    const nx = sk.x + sk.vx * dt, ny = sk.y + sk.vy * dt;
    if (sk.y < sk.apex) sk.apex = sk.y;

    // Stomping down while you are over a bar puts you on it. This is the only
    // way to start a grind you were going to sail straight over, and it is the
    // same downward flick that spins the deck -- so a spin into a stomp lands
    // you sideways on the bar, which is a slide.
    if (board.stomp && sk.airTime > 0.06) {
      const bar = p.hitRail(sk.x, sk.y - 2, sk.x + sk.vx * 0.05, sk.y + 52 * WORLD);
      if (bar) { sk.x = bar.x; sk.y = bar.y; onRail(bar, true); return; }
    }

    // rails first: they always sit clear above the floor
    if (sk.vy > 8 && sk.airTime > 0.09) {
      const r = p.hitRail(sk.x, sk.y, nx, ny);
      if (r) { onRail(r); return; }
    }
    const hit = p.hitGround(sk.x, sk.y, nx, ny);
    if (hit) { onGround(hit); return; }

    sk.x = nx; sk.y = ny;
    // The deck tips into your flight path -- nose down as you fall, up as you
    // rise. It is measured against |vx|, NOT vx: atan2 wraps through +/-pi the
    // moment vx goes negative, and that wrap snapped the deck through about
    // 126 degrees at the apex of every jump taken to the left, which read as
    // the board flipping which way it leaned for no reason. Which way the
    // rider faces is applied later, as a screen-space mirror.
    //
    // And the tilt FADES OUT with your horizontal speed. Pop straight up and
    // there is no flight path to lean into, so the deck stays flat instead of
    // sweeping nose-up to nose-down through the apex.
    const along = Math.max(40, Math.abs(sk.vx));
    const travelling = Math.min(1, Math.abs(sk.vx) / 120);
    sk.ang = Math.atan2(sk.vy, along) * 0.35 * travelling;

    // ran off the end of the world
    if (sk.x < p.minX - 60 || sk.x > p.maxX + 60 || sk.y > p.maxY + 260) sk.respawn();
  }

  function onGround(hit) {
    const seg = hit.seg;
    const along = sk.vx * seg.tx + sk.vy * seg.ty;
    const into = sk.vx * seg.nx + sk.vy * seg.ny;      // negative = coming down onto it

    // A hard landing is NOT a bail -- dropping ten feet onto a flat board is
    // fine, that is skating, and an ollie on the spot comes down almost purely
    // into the floor. What IS a bail is hitting a near-vertical FACE head-on
    // with nothing along it: casing a gap, or slamming the far wall of a bowl.
    const wall = Math.abs(seg.nx) > 0.55;
    const slam = wall && Math.abs(into) > 200 && Math.abs(along) < Math.abs(into) * 0.7
      && board.settled < 0.5;
    const clean = board.canLand() && !slam;

    sk.s = hit.s;
    sk.x = hit.x; sk.y = hit.y;

    if (!clean) { startBail(); return; }

    sk.v = along;
    // a hard flat landing costs a little speed, a smooth transition landing does not
    sk.v *= Math.max(0.55, 1 - Math.abs(into) / 900);
    sk.state = 'ride';
    place();

    const half = Math.round(sk.bodySpin / Math.PI);
    if (half % 2 !== 0) sk.switchy = !sk.switchy;

    const a = board.settle();

    // WHAT THE GRAB ADDED. None of the four rotation counters can see a grab --
    // it is a thing you HOLD, not a thing the deck does -- so it is read off the
    // skater and folded in here. The best hold of the jump is the one that
    // counts, so letting go in order to land does not throw away the grab you
    // just did.
    const grabbed = sk.bestPose;
    const grabFrac = grabbed ? poseValue(sk.bestPoseT) : 0;
    sk.pose = null; sk.poseT = 0; sk.bestPose = null; sk.bestPoseT = 0;
    sk.showing = false; sk.showT = 0;

    // A GRAB COUNTS ON ITS OWN. Without it in this test, a straight ollie with a
    // method held all the way through it lands as nothing at all, which is the
    // opposite of the point.
    const did = a.flips || a.shoves || a.pitches || half
      || grabFrac > 0 || (sk.popped && sk.airTime > 0.22);
    if (did) {
      const t = nameAir(a, half, sk.popEnd, sk.airTime);
      // HOW CLEANLY DID YOU DO IT. A trick needs about one deliberate movement
      // per rotation plus one to set up. Anything past that was flailing, and
      // since the deck settles onto a clean angle whatever you do, the input is
      // the only thing left that can tell a trick from a mash. Without this you
      // can spam the mouse after any ollie and get paid for a tre flip.
      const spent = board.strokes;
      const need = 1 + Math.abs(a.flips) + Math.abs(a.shoves)
        + Math.abs(a.pitches) + Math.abs(half);
      const clean = Math.max(0.12, Math.min(1, 1 - Math.max(0, spent - need) * 0.16));

      let name = clean < 0.65 ? t.name + ' (SCRAPPY)' : t.name;
      let pts = t.points;
      if (grabFrac > 0) {
        // the grab goes in FRONT of the name, the way it is said out loud
        name = grabbed.name + ' ' + name;
        pts += grabbed.points * grabFrac;
        // and it pays CASH as well as points. It is the only thing you can do
        // for money outside a competition, and it is deliberately small.
        sk.grabPaid = Math.round(grabbed.pay * grabFrac * clean);
      } else sk.grabPaid = 0;
      score.add(name, Math.round(pts * clean));
    } else sk.grabPaid = 0;
    sk.bodySpin = 0; sk.bodySpinV = 0;
    sk.justLanded = 0.22;
    puff(sk.x, sk.y, 4);
  }

  // ------------------------------------------------------------------ grinds
  function onRail(r, forced) {
    const rail = r.rail;
    let along = sk.vx * rail.tx + sk.vy * rail.ty;
    // stomping onto a bar from almost standing still should still give you a
    // grind to ride out, not an instant stall
    if (forced && Math.abs(along) < 40) along = 60 * (sk.dir || 1);
    // the deck may be sideways (that IS a boardslide) but it must not be upside
    // down and it must not still be whipping round
    const att = board.attitude();
    // Settled cursor = you get the grind, same deal as landing.
    const ok = forced || board.settled > 0.5 || board.idle > 0.2
      || (att.rollErr < 0.85 && att.spinning < 9);

    sk.x = r.x; sk.y = r.y;
    if (!ok) { startBail(); return; }

    const g = nameGrind(board.yaw, board.r, rail.kind);
    sk.state = 'grind';
    // The angle it locked on at IS the grind, but it is kept on the grind, not
    // on the board: the deck's own rotation counters go back to zero. Otherwise
    // the flip you rode in with gets counted a SECOND time when you leave the
    // bar and land, and one kickflip scores twice.
    sk.grind = { rail, v: along, name: g.name, rate: g.rate, x: r.x, y: r.y, yaw: board.yaw };
    sk.grindT = 0;
    board.roll = 0; board.yaw = 0; board.pitch = 0;
    sk.bodySpin = 0; sk.bodySpinV = 0;
    sk.ang = Math.atan2(rail.ty, rail.tx);
    score.add(g.name, 60);
    sparkBurst(r.x, r.y, 7);
  }

  function grinding(dt) {
    const gr = sk.grind, rail = gr.rail;
    gr.v += G * rail.ty * dt;
    if (sk.input) gr.v += PUSH * 0.4 * sk.input * dt;
    gr.v -= gr.v * GRIND_FRIC * dt;
    sk.grindT += dt;
    score.tick(gr.rate * dt);
    if (Math.random() < dt * 26) sparkBurst(sk.x, sk.y + 3, 1);

    const t = (sk.x - rail.x0) / (rail.dx || 1e-6);
    const nx = sk.x + rail.tx * gr.v * dt, ny = sk.y + rail.ty * gr.v * dt;
    const nt = (nx - rail.x0) / (rail.dx || 1e-6);

    // pop out of it
    const pop = board.popRequest(dt);
    if (pop > 0) {
      sk.vx = rail.tx * gr.v; sk.vy = rail.ty * gr.v - pop;
      sk.x -= 1; sk.y -= 2;
      sk.state = 'air'; sk.airTime = 0; sk.apex = sk.y; sk.launchY = sk.y;
      sk.popEnd = board.chargeEnd; sk.bodySpin = 0; sk.bodySpinV = 0;
      sk.popped = true;
    board.strokes = 0; board.lastStroke = 0;
      sk.grind = null;
      puff(sk.x, sk.y, 4);
      return;
    }

    if (nt < 0 || nt > 1 || Math.abs(gr.v) < 5) {
      // off the end -- drop into the air with whatever you had left
      sk.vx = rail.tx * gr.v; sk.vy = rail.ty * gr.v + 6;
      sk.x = nx; sk.y = ny + 1;
      sk.state = 'air'; sk.airTime = 0; sk.apex = sk.y; sk.launchY = sk.y;
      sk.bodySpin = 0; sk.bodySpinV = 0;
      // simply running out of bar is not an air -- do not pay for it
      sk.popped = false;
      sk.grind = null;
      return;
    }
    sk.x = nx; sk.y = ny;
    sk.ang = Math.atan2(rail.ty, rail.tx);
    if (Math.abs(gr.v) > 10) sk.dir = Math.sign(gr.v);
  }

  // ------------------------------------------------------------------ bails
  // Coming off is not a cartwheel. You lose the board, you hit the floor and
  // you SLIDE, carrying most of the speed you had until friction takes it. The
  // rider goes down flat; only the loose board tumbles.
  function startBail() {
    sk.state = 'bail';
    sk.bailT = BAIL_TIME;
    sk.bailSpin = 0;
    sk.bailLean = 0;
    sk.bailSlide = 0;
    // you keep going. A bail that stops you dead reads as hitting a wall.
    sk.vx = (sk.vx || 20) * 0.85;
    sk.vy = Math.max(20, Math.abs(sk.vy) * 0.15);   // down onto the floor, never up
    score.bail();
    board.reset();
    puff(sk.x, sk.y, 9);
  }

  function bail(dt) {
    sk.bailT -= dt;
    sk.vy += G * dt;
    const gy = p.groundY(sk.x);
    const down = sk.y >= gy - 0.5;

    // In the air you are still falling; on the floor you are sliding, and the
    // only thing slowing you is the ground.
    sk.vx *= 1 - Math.min(1, dt * (down ? 1.9 : 0.4));
    // the RIDER eases down flat and stays there -- the tumbling is the board's
    sk.bailLean += (Math.PI * 0.5 * (sk.dir || 1) - sk.bailLean) * Math.min(1, dt * 7);
    sk.bailSlide = Math.min(1, sk.bailSlide + dt * (down ? 5 : 0));
    // the loose board keeps turning over, which is what a dropped board does
    sk.bailSpin += dt * 7 * Math.sign(sk.vx || 1);

    sk.x += sk.vx * dt; sk.y += sk.vy * dt;
    if (sk.y > gy) {
      sk.y = gy; sk.vy = 0;
      // grit kicked up while you are actually scraping along
      if (Math.abs(sk.vx) > 60 && Math.random() < 0.5) puff(sk.x, sk.y, 2);
    }
    if (sk.bailT <= 0) {
      // stand back up where you fell
      let bestS = 0, bestD = 1e9;
      for (const seg of p.segs) {
        const mx = (seg.x0 + seg.x1) / 2, my = (seg.y0 + seg.y1) / 2;
        const d = (mx - sk.x) * (mx - sk.x) + (my - sk.y) * (my - sk.y) * 0.5;
        if (d < bestD) { bestD = d; bestS = seg.s0 + seg.len / 2; }
      }
      sk.s = bestS; sk.v = 22 * sk.dir;
      sk.state = 'ride';
      sk.bodySpin = 0; sk.bodySpinV = 0;
      board.reset();
      place();
    }
  }

  // ------------------------------------------------------------------ fluff
  function puff(x, y, n) {
    for (let i = 0; i < n; i++) {
      sk.sparks.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30 - 8,
        life: 0.25 + Math.random() * 0.2, kind: 'dust' });
    }
  }
  function sparkBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      sk.sparks.push({ x, y, vx: -Math.sign(sk.grind ? sk.grind.v : 1) * (40 + Math.random() * 90),
        vy: -Math.random() * 55, life: 0.16 + Math.random() * 0.18, kind: 'spark' });
    }
  }

  place();
  return sk;
}
