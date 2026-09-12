// =====================================================================
// HIGHRISE :: player.js - THE MERCENARY
// =====================================================================
//
// Liam: *"space not to jump but to slide"*, *"Q and E to lean left and
// right"*, *"make crouch animations"*, *"stop player from phasing through
// roof and being able to go on top of stuff"*, and the whole thing should
// *"feel like a jhon wick action sequence"*.
//
// Those are one idea. A Wick sequence is not fast because the man runs
// fast - it is fast because he never stops to do anything. He slides into
// cover, shoots out of the slide, leans round the corner, and moves
// again. So every verb here is something you do WHILE MOVING:
//
//   SLIDE   spends speed you already had for a low profile and a low
//           camera, and you can shoot the whole way through it. There is
//           no jump: jumping is a thing you do INSTEAD of going forward,
//           and in a corridor it looks ridiculous.
//   LEAN    puts your eye and your muzzle past a corner and nothing else.
//   CROUCH  slower, lower, steadier.
//
// None of them locks the camera or interrupts anything.
import * as THREE from '../vendor/three.module.js';

const EYE = 1.63, CROUCH_EYE = 1.06, SLIDE_EYE = 0.74, RADIUS = 0.32;
const SPEED = 5.2, SPRINT = 8.4, CROUCH_SPEED = 2.4;
// FRICTION WAS 11 AND IT ONLY RAN WHEN YOU LET GO OF EVERYTHING.
//
// Liam: *"stop the player from sliding stop so much"*. Two separate
// reasons he was:
//
//   1. At 11 a run took 0.47 s and 1.2 m to stop. That is a long way to
//      travel after deciding to stand still, and in a game about ducking
//      behind things it is the difference between reaching cover and
//      sliding out the far side of it.
//   2. Friction was gated on `!wish.lengthSq()` - no keys held - so it
//      never ran while you were CHANGING DIRECTION. Turning from a full
//      run left the old velocity to decay on its own, which is exactly
//      the skating he is describing and the half of it that is not fixed
//      by turning the number up.
//
// So it runs every frame you are on the ground and it runs harder. The
// acceleration is unchanged and still wins easily at the top speed (60
// against 26), so nothing about how fast he moves has changed - only how
// fast he stops and how sharply he turns.
// how far below his feet still counts as standing on it
const SNAP = 0.14;
const ACCEL = 60, AIR_ACCEL = 9, FRICTION = 26, GRAVITY = 22;
const STEP_UP = 0.46;          // the tallest thing you can walk straight onto

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.wish = new THREE.Vector3();     // the direction he is asking for
    this.wishSpeed = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.crouch = false;
    this.eye = EYE;
    this.hp = 100; this.maxHp = 100;
    this.alive = true;
    this.bob = 0; this.stride = 0; this.speed = 0;
    this.lastHurt = -99;

    this.slide = 0;            // seconds left of a slide
    this.slideCool = 0;

    // ---- STAMINA -------------------------------------------------------
    //
    // Liam: *"make a stamina bar so the player can't spam slide"*.
    //
    // A 0.55 s cooldown is not a cost, it is a wait - and a wait you can
    // schedule is free. The slide also carries 1.3 s of invulnerability,
    // so sliding on cooldown made you untouchable for more than half of
    // every fight and the close-range game this whole project is built
    // on stopped being a decision.
    //
    // Stamina is the cost. Three slides empty it, a dodge is a third of
    // one, and it comes back fastest when you are standing still. The
    // number that matters most is the DELAY before it starts refilling:
    // without that you can tap-drain forever and the bar is decoration.
    this.stam = 1;
    this.stamMax = 1;
    this.stamHold = 0;         // seconds before regeneration resumes
    this.stamFlash = 0;        // flashes the bar when a move was refused
    // WHERE HIS HEAD IS, refreshed at the end of every step. The AI
    // reads this rather than pos, so leaning out from cover exposes you
    // to exactly the men you can now see - see eyePoint().
    this.head = new THREE.Vector3();
    this.lean = 0;             // smoothed, -1 left .. +1 right
    this.leanWant = 0;
    this.third = false;        // Liam took third person back
    this.camDist = 3.4;
    this.mesh = null;

    // ---- THE DODGE -----------------------------------------------------
    //
    // Liam: *"if the player double clicks a movment key like D they roll
    // really fast or just jump in that direction for dodging"*, and
    // *"make the dodging and sliding ... so the player can not lose health
    // and dodge gun attacks and get up close"*.
    //
    // That second half is the important one and it is a DESIGN, not a
    // convenience: the whole problem with closing on a man with a rifle is
    // that crossing the open ground costs you health you cannot get back.
    // Give the crossing itself a window where nothing lands and the fight
    // changes shape - you stop trading shots at range and start looking for
    // the two dodges that put you inside his arms. It is the single change
    // that makes this a Wick fight rather than a shooting gallery.
    this.clock = 0;
    this.tap = {}; this.wasKey = {};
    this.dodge = 0; this.dodgeCool = 0;
    this.dodgeX = 0; this.dodgeZ = 0;      // in view space: x right, z forward
    this.dodgeRoll = 0;
    this.iframe = 0;                        // seconds of "not registering"
    this.shake = 0;
    this.fovBoost = 78;
    this.bandages = 2;
    this.healing = 0;
  }

  /** true while nothing can touch him - a dodge, a slide, or the tail of one */
  get invulnerable() { return this.iframe > 0; }

  startDodge(vx, vz) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // view space -> world: forward is (-fx, -fz), right is (cos, -sin)
    const wx = -fx * vz + Math.cos(this.yaw) * vx;
    const wz = -fz * vz - Math.sin(this.yaw) * vx;
    const l = Math.hypot(wx, wz) || 1;
    this.dodge = 0.40;
    this.dodgeCool = 0.85;
    // a third of a slide - a dodge is the cheap way out, and it should
    // stay the cheap way out
    this.stam = Math.max(0, this.stam - 0.12);
    this.stamHold = 0.55;
    // A COUPLE OF SECONDS, as asked. Long enough to cross a doorway and
    // still be untouchable when you arrive, short enough that it cannot
    // be chained into permanent immunity - the cooldown is what stops
    // that, not the window.
    this.iframe = Math.max(this.iframe, 1.15);
    const SPEED = 15.5;
    this.vel.x = (wx / l) * SPEED;
    this.vel.z = (wz / l) * SPEED;
    this.vel.y = 2.2;                       // just off the floor: a dive, not a hop
    this.dodgeX = vx; this.dodgeZ = vz;
    this.dodgeRoll = -vx * 0.55;
  }

  /** a bandage: slow, and it stops you doing anything else */
  useBandage() {
    if (this.bandages <= 0 || this.healing > 0 || this.hp >= this.maxHp) return false;
    this.bandages--;
    this.healing = 2.1;
    return true;
  }

  /**
   * WHERE HIS HEAD ACTUALLY IS - leaned, crouched, bobbing.
   *
   * Liam: *"when the player leans to the side make the guns shoot points
   * and stuff not just visualls move to so the player can lean out from
   * behind cover and shoot at the enemies"*.
   *
   * He is describing a real bug. The lean moved the CAMERA and nothing
   * else: every shot still started at `pos + eye`, the centre of his
   * body, and every line-of-sight test in the game used the same point.
   * So you could lean out, SEE a man round a corner, and put your rounds
   * into the wall you were hiding behind - and he could not see you
   * either, which is worse, because it made leaning strictly free.
   *
   * This is now the single definition of where he is looking from, and
   * the camera, the shot origin, the melee reach and the AI's sight all
   * read it. Lean is a real trade again: you can shoot, and be shot.
   */
  eyePoint(out) {
    const v = out || new THREE.Vector3();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    v.set(this.pos.x, this.pos.y + this.eye, this.pos.z)
     .addScaledVector(right, this.lean * 0.55);
    v.y += Math.sin(this.bob) * 0.030 - Math.abs(this.lean) * 0.10;
    return v;
  }

  /** the camera: eye height, lean offset and roll, bob */
  applyTo(cam, solids) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const head = this.eyePoint();

    if (this.third) {
      const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const want = head.clone().addScaledVector(back, this.camDist).addScaledVector(right, 0.5);
      cam.position.copy(head).lerp(want, this.clearTo(head, want, solids));
    } else {
      cam.position.copy(head);
    }
    // ---- THE CAMERA HAS A BODY ------------------------------------------
    //
    // Liam: *"add in cool lighting and camera movments so we can make it
    // feel super fast paced"*. Speed is not a number on the movement code,
    // it is what the lens does about it - so the camera rolls into a
    // dodge, widens when you sprint, kicks when you are hit, and dips when
    // you land. None of it takes control away; all of it is on top of
    // where the player already is.
    const shk = this.shake * this.shake;
    cam.rotation.set(0, 0, 0);
    cam.rotateY(this.yaw + Math.sin(this.clock * 43) * shk * 0.035);
    cam.rotateX(this.pitch + Math.sin(this.clock * 37) * shk * 0.030);
    // ROLL WITH THE LEAN. Seven degrees, and it is the whole difference
    // between the camera sliding sideways and a man putting his shoulder
    // out past a doorframe. The dodge rolls it far harder, because a dive
    // is a whole body going over.
    cam.rotateZ(-this.lean * 0.13 + this.dodgeRoll
                + Math.sin(this.bob * 0.5) * 0.006
                + Math.sin(this.clock * 51) * shk * 0.05);

    // FIELD OF VIEW FOLLOWS SPEED. Four degrees is nothing to look at and
    // everything to feel: it is the difference between running and the
    // room coming at you.
    //
    // THE ACCUMULATOR STARTS AT THE BASE FOV, not at zero.
    //
    // It used to start at 0 with a `|| BASE` guard on the right-hand side
    // of the lerp - which reads as a safe default and is not one, because
    // `0 || 78` is 78, so the first frame computed `0 += (78 - 78) * 0.12`
    // and left the accumulator at zero. The camera was then set to a
    // ZERO-DEGREE field of view and the entire world vanished. The HUD is
    // DOM and the arms are drawn by their own camera, so what was left on
    // screen was a floating gun over an empty background - which is
    // exactly how Liam described it. A falsy guard on a numeric default is
    // never safe when zero is a value the number can hold.
    const BASE = 78;
    const want = BASE + Math.min(9, this.speed * 0.55)
               + (this.dodge > 0 ? 7 : 0) + (this.slide > 0 ? 5 : 0);
    this.fovBoost += (want - this.fovBoost) * 0.12;
    if (Math.abs(cam.fov - this.fovBoost) > 0.05) {
      cam.fov = this.fovBoost;
      cam.updateProjectionMatrix();
    }
  }

  clearTo(from, to, solids) {
    if (!solids) return 1;
    const dir = to.clone().sub(from); const len = dir.length(); dir.normalize();
    for (let s = 0.25; s <= 1.0; s += 0.08) {
      const q = from.clone().addScaledVector(dir, len * s);
      for (const b of solids) {
        if (Math.abs(q.x - b.x) > b.w/2 + 0.22) continue;
        if (Math.abs(q.z - b.z) > b.d/2 + 0.22) continue;
        if (q.y < b.y - b.h/2 || q.y > b.y + b.h/2) continue;
        return Math.max(0.18, s - 0.10);
      }
    }
    return 1;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022));
  }

  hurt(n, now) {
    // NOTHING LANDS DURING A DODGE OR A SLIDE. See the note in the
    // constructor - this is the rule the close-range game is built on.
    if (this.iframe > 0) return false;
    this.hp -= n;
    this.healing = 0;                       // being shot interrupts a bandage
    if (now !== undefined) this.lastHurt = now;
    this.shake = Math.min(1, this.shake + Math.min(0.7, n / 40));
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  /**
   * KNOCKED BACK. A punch that only takes health off is a number going
   * down; a punch that moves you is a fight. It is a velocity rather
   * than a teleport, so you keep control the whole way through it - the
   * one thing this game never does is take the controls off you.
   */
  shove(nx, nz, force) {
    this.vel.x += nx * force;
    this.vel.z += nz * force;
    this.vel.y = Math.max(this.vel.y, force * 0.18);
  }

  get stance() { return this.slide > 0 ? 'slide' : (this.crouch ? 'crouch' : 'stand'); }

  step(dt, keys, solids) {
    if (!this.alive) return;
    this.clock += dt;
    this.dodgeCool = Math.max(0, this.dodgeCool - dt);
    this.iframe = Math.max(0, this.iframe - dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    if (this.healing > 0) {
      this.healing -= dt;
      // A bandage heals over its whole duration, so being interrupted
      // costs you the rest of it rather than all of it.
      this.hp = Math.min(this.maxHp, this.hp + 34 * dt / 2.1);
      if (this.healing <= 0) this.healing = 0;
    }
    if (keys.bandage) { keys.bandage = false; this.useBandage(); }

    // ---- DOUBLE-TAP TO DODGE -------------------------------------------
    //
    // Detected here rather than in the input handler because this is the
    // only place that knows whether a dodge is currently allowed, and a
    // double tap that silently does nothing is worse than no double tap.
    const TAPDIR = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };
    for (const k in TAPDIR) {
      const down = !!keys[k];
      if (down && !this.wasKey[k]) {
        if (this.clock - (this.tap[k] || -9) < 0.32 && this.dodgeCool <= 0 && this.onGround) {
          this.startDodge(TAPDIR[k][0], TAPDIR[k][1]);
          this.tap[k] = -9;                 // consumed, so a third tap is a new pair
        } else this.tap[k] = this.clock;
      }
      this.wasKey[k] = down;
    }
    if (this.dodge > 0) this.dodge -= dt;
    this.dodgeRoll += ((this.dodge > 0 ? -this.dodgeX * 0.55 : 0) - this.dodgeRoll)
                      * Math.min(1, dt * 9);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const wish = new THREE.Vector3();
    if (keys.w) { wish.x -= fx; wish.z -= fz; }
    if (keys.s) { wish.x += fx; wish.z += fz; }
    if (keys.a) { wish.x -= fz; wish.z += fx; }
    if (keys.d) { wish.x += fz; wish.z -= fx; }
    if (wish.lengthSq()) wish.normalize();

    // ---- LEAN, held not toggled --------------------------------------
    this.leanWant = (keys.e ? 1 : 0) - (keys.q ? 1 : 0);
    if (this.slide > 0) this.leanWant = 0;
    if (this.leanWant) {
      // ---- LEAN AS FAR AS FITS, NOT ALL OR NOTHING ------------------
      //
      // It stops at a wall, because you should not put your eye through
      // the drywall. But it used to test a point 0.78 m out - 40% further
      // than the head ever actually goes - and then zero the lean
      // entirely if anything was there. In a furnished office something
      // usually IS: a probe standing in an open room found two solids in
      // reach, and one of them was a desk 1.1 m away. So the lean did
      // nothing, almost everywhere, which is why it felt like a camera
      // effect rather than a move.
      //
      // Now it tests where the head really goes and steps DOWN until it
      // fits. Beside a desk you get most of a lean; with your shoulder
      // against a wall you get none; and the common case - a bit of
      // clutter nearby - gives you the lean you asked for.
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const ey = this.pos.y + this.eye;
      const clear = (amt) => {
        const tx = this.pos.x + rx * amt * 0.55;
        const tz = this.pos.z + rz * amt * 0.55;
        for (const b of solids) {
          if (Math.abs(tx - b.x) > b.w/2 + 0.14) continue;
          if (Math.abs(tz - b.z) > b.d/2 + 0.14) continue;
          if (ey < b.y - b.h/2 || ey > b.y + b.h/2) continue;
          return false;
        }
        return true;
      };
      const want = this.leanWant;
      this.leanWant = 0;
      for (const f of [1, 0.75, 0.5, 0.25]) {
        if (clear(want * f)) { this.leanWant = want * f; break; }
      }
    }
    this.lean += (this.leanWant - this.lean) * Math.min(1, dt * 12);

    // ---- SLIDE --------------------------------------------------------
    const sp0 = Math.hypot(this.vel.x, this.vel.z);
    this.slideCool = Math.max(0, this.slideCool - dt);
    // Regeneration: paused for a beat after spending, then quick when
    // you are standing still and slow while you are running.
    this.stamHold = Math.max(0, this.stamHold - dt);
    if (this.stamHold <= 0) {
      const rate = sp0 > 5 ? 0.24 : sp0 > 0.5 ? 0.38 : 0.55;
      this.stam = Math.min(this.stamMax, this.stam + rate * dt);
    }
    this.stamFlash = Math.max(0, this.stamFlash - dt);

    const SLIDE_COST = 0.34;
    const wantSlide = keys.space && this.onGround && this.slide <= 0
                   && this.slideCool <= 0 && sp0 > 4.0;
    if (wantSlide && this.stam < SLIDE_COST) {
      // REFUSED, AND IT SAYS SO. A move that silently does nothing reads
      // as a dropped input, which is worse than being told you are tired.
      this.stamFlash = 0.5;
      keys.space = false;
    }
    if (wantSlide && this.stam >= SLIDE_COST) {
      this.stam -= SLIDE_COST;
      this.stamHold = 0.75;
      this.slide = 0.66;
      this.slideCool = 0.55;
      // A SLIDE IS ALSO UNTOUCHABLE, and for a moment after it. Sliding
      // into a room and coming up inside somebody's guard is the other
      // half of the close-range game; charging a rifle for damage was
      // never a choice anybody would make twice.
      this.iframe = Math.max(this.iframe, 1.30);
      // a shove, not a teleport: it spends the speed you already had
      const k = Math.min(11.5, sp0 * 1.55);
      this.vel.x = (this.vel.x / sp0) * k;
      this.vel.z = (this.vel.z / sp0) * k;
    }
    if (this.slide > 0) this.slide -= dt;

    // ---- YOU CANNOT STAND UP INSIDE SOMETHING -------------------------
    //
    // Liam: *"there is still some sort of cube in front of the door that
    // the player can slide through and get stuck in but can't walk
    // through"*.
    //
    // That is one bug and it is here. The body is 1.78 m standing and
    // 1.15 m crouched, so anything whose underside sits between those two
    // is a thing you can slide beneath and not walk through. Sliding
    // under one was fine; the trouble was the line below, which stood him
    // back up the moment the slide timer ran out whether there was room
    // or not. He then had a 1.78 m body inside a solid, and the
    // horizontal pass in move() rejects EVERY direction out of a box you
    // are already inside - so he was stuck, in a place he could only have
    // reached by sliding, next to a thing he could not walk through.
    //
    // The rule every game has and this one did not: stay down while
    // something is over your head. He crouch-walks out and stands up when
    // he is clear, which needs no new state and cannot strand anybody.
    const wantsCrouch = (!!keys.ctrl && this.onGround) || this.slide > 0;
    this.crouch = wantsCrouch
      || this.blockedAt(this.pos.x, this.pos.y, this.pos.z, 1.78, solids);
    const sliding = this.slide > 0;
    const sprinting = keys.shift && !this.crouch && keys.w;
    const top = sliding ? 12 : (this.crouch ? CROUCH_SPEED : (sprinting ? SPRINT : SPEED));

    const wantEye = sliding ? SLIDE_EYE : (this.crouch ? CROUCH_EYE : EYE);
    this.eye += (wantEye - this.eye) * Math.min(1, dt * (sliding ? 22 : 12));

    // ---- move ----------------------------------------------------------
    // ---- FRICTION FIRST, THEN ACCELERATION -------------------------
    //
    // The order is not cosmetic. Accelerating first, clamping to the top
    // speed and THEN taking friction off means friction is subtracted
    // from the capped speed every single frame - so always-on friction
    // would have quietly cut the run from 5.2 to about 4.8 m/s while I
    // was only trying to stop him skating.
    //
    // Braking the OLD velocity and then accelerating leaves the top speed
    // exactly where it was: at full tilt the clamp is the last thing that
    // happens, so he still runs at 5.2.
    //
    // A SLIDE AND A DODGE ARE MEANT TO CARRY - those keep the light
    // friction they had, which is what makes them worth doing.
    const fric = sliding ? 5.0 : FRICTION;
    if (this.onGround && this.dodge <= 0) {
      const was = Math.hypot(this.vel.x, this.vel.z);
      const drop = Math.max(0, was - fric * dt) / (was || 1);
      this.vel.x *= drop; this.vel.z *= drop;
    }
    // WHERE HE IS TRYING TO GO, published.
    //
    // Not the same thing as this.vel, and the difference is the whole of
    // whether a door opens. Walk into a shut door and the collision pass
    // below zeroes the velocity into it, so by the next frame he is
    // pressing on it at 0 m/s - a door reading vel would conclude nobody
    // was there. The INTENT survives that: he is still holding W, still
    // leaning on it, and the door still gets shoved. See doors.js.
    this.wish.set(wish.x, 0, wish.z);
    this.wishSpeed = wish.lengthSq() ? top : 0;

    const a = (this.onGround ? ACCEL : AIR_ACCEL) * dt * (sliding ? 0.12 : 1);
    this.vel.x += wish.x * a; this.vel.z += wish.z * a;
    const flat = Math.hypot(this.vel.x, this.vel.z);
    if (flat > top) { const k = top / flat; this.vel.x *= k; this.vel.z *= k; }
    this.vel.y -= GRAVITY * dt;

    const h = this.crouch ? 1.15 : 1.78;
    this.move(dt, h, solids);

    this.eyePoint(this.head);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.stride += dt * this.speed * (this.onGround && !sliding ? 1.9 : 0);
    this.bob = this.stride;
  }

  // -------------------------------------------------------------------
  // COLLISION
  // -------------------------------------------------------------------
  //
  // THE OLD ONE PUT YOU ON THE ROOF, and Liam saw it: *"stop player from
  // phasing through roof and being able to go on top of stuff"*.
  //
  // It resolved a downward move by snapping to the top of the FIRST box
  // it overlapped. A wall is a box three metres tall, so brushing one
  // while falling teleported you to y=3 and left you standing on the
  // wall, looking down at the floor plan like a model.
  //
  // The missing test is the standard one: you may only land on something
  // you were ALREADY ABOVE before the move. Anything else is a wall,
  // however short, and gets pushed out of horizontally - unless it is low
  // enough to step onto and there is headroom up there, which is what
  // makes kerbs and low props feel solid rather than like glass.
  move(dt, h, solids) {
    // ---- TWO OVERLAP TESTS, AND THE DIFFERENCE IS 2 CENTIMETRES -----
    //
    // Liam: *"stop the player from sliding stop so much"*.
    //
    // `hit` shrinks every solid's top by 2 cm. That is right for the
    // HORIZONTAL pass - without it, walking along a floor you are exactly
    // standing on registers as walking into it, and you stick. It is
    // catastrophic for the VERTICAL pass, and this is the whole bug:
    //
    //   gravity puts his feet at -0.02, just inside the slab
    //   the slab's top is 0.00, but hit() pretends it is -0.02
    //   so no overlap, so no landing, so onGround stays FALSE
    //
    // He then walks the entire game two centimetres underground and
    // permanently airborne - which means AIR_ACCEL of 9 instead of 60,
    // and NO FRICTION AT ALL, because friction only runs on the ground. A
    // trace of an ordinary walk read gnd false, false, true, false, false.
    //
    // That is the skating. It was never the friction constant; turning it
    // from 11 to 26 changed the stopping distance by 6 cm because the
    // rule was hardly ever running.
    const hit = (x, y, z, b) =>
      Math.abs(x - b.x) < b.w/2 + RADIUS &&
      Math.abs(z - b.z) < b.d/2 + RADIUS &&
      y < b.y + b.h/2 - 0.02 && y + h > b.y - b.h/2;
    // the vertical one takes the solid at its real size
    const hitY = (x, y, z, b) =>
      Math.abs(x - b.x) < b.w/2 + RADIUS &&
      Math.abs(z - b.z) < b.d/2 + RADIUS &&
      y < b.y + b.h/2 && y + h > b.y - b.h/2;

    for (const ax of ['x', 'z']) {
      const before = this.pos[ax];
      this.pos[ax] += this.vel[ax] * dt;
      for (const b of solids) {
        if (!hit(this.pos.x, this.pos.y, this.pos.z, b)) continue;
        const top = b.y + b.h/2;
        const rise = top - this.pos.y;
        if (this.onGround && rise > 0 && rise <= STEP_UP
            && !this.blockedAt(this.pos.x, top, this.pos.z, h, solids, b)) {
          this.pos.y = top;                       // a step, not a wall
          continue;
        }
        this.pos[ax] = before;
        this.vel[ax] = 0;
        break;
      }
    }

    const feetWas = this.pos.y;
    this.pos.y += this.vel.y * dt;
    let landY = -1e9;
    for (const b of solids) {
      if (!hitY(this.pos.x, this.pos.y, this.pos.z, b)) continue;
      const top = b.y + b.h/2, bot = b.y - b.h/2;
      if (this.vel.y <= 0) {
        // ONLY IF YOU WERE ABOVE IT. This one test is the whole fix.
        if (feetWas >= top - 0.04) { if (top > landY) landY = top; }
        // ---- OR IF IT IS SMALL ENOUGH TO STAND ON --------------------
        //
        // A DEADLOCK, and it stranded the player at the foot of the
        // stairs. Overlap a step by two centimetres and this branch used
        // to pin your height and leave onGround false; the horizontal
        // step-up above only runs when you ARE on the ground, so you
        // could not climb out and you could not walk out either. Frozen,
        // in the open, with no message - the trace read "speed 0,
        // onGround false" for twelve seconds.
        //
        // A person standing on the lip of a step is standing ON it. If
        // the top is within step height, that is the answer.
        else if (top - feetWas > 0 && top - feetWas <= STEP_UP
                 && !this.blockedAt(this.pos.x, top, this.pos.z, h, solids, b)) {
          if (top > landY) landY = top;
        }
        else { this.pos.y = feetWas; this.vel.y = 0; }
      } else if (feetWas + h <= bot + 0.04) {
        this.pos.y = bot - h - 0.001; this.vel.y = 0;
      } else { this.pos.y = feetWas; this.vel.y = 0; }
    }
    this.onGround = false;
    if (landY > -1e8) { this.pos.y = landY; this.vel.y = 0; this.onGround = true; }

    // ---- A GROUND SNAP, AND IT IS THE REAL FIX FOR THE SLIDING -------
    //
    // Liam: *"stop the player from sliding stop so much"*. I turned the
    // friction up and it barely helped, which was the clue: friction only
    // applies when \`onGround\`, and a trace of him walking across a flat
    // floor read gnd false, false, TRUE, false, false. He was AIRBORNE on
    // most frames of an ordinary walk.
    //
    // Why: gravity pulls him a fraction below the slab, the solid test
    // catches it and puts his feet exactly on top, and the very next
    // frame he starts that fraction ABOVE it - overlapping nothing, so no
    // landing is found and he is technically falling. Every other frame
    // he therefore got AIR_ACCEL of 9 instead of 60 and no friction at
    // all. That is the floaty, skating feel, and no amount of tuning the
    // friction constant could reach it.
    //
    // So: if he is not standing on anything but there is a floor within a
    // few centimetres below, he is standing on it. This is the standard
    // fix and it is worth the eight lines - it makes the ground contact
    // continuous instead of a flicker.
    if (!this.onGround && this.vel.y <= 0.01) {
      const feet = this.pos.y;
      let best = -1e9;
      for (const b of solids) {
        if (Math.abs(this.pos.x - b.x) > b.w/2 + RADIUS) continue;
        if (Math.abs(this.pos.z - b.z) > b.d/2 + RADIUS) continue;
        const top = b.y + b.h/2;
        if (top <= feet + 0.001 && top > feet - SNAP && top > best) best = top;
      }
      if (best > -1e8) { this.pos.y = best; this.vel.y = 0; this.onGround = true; }
    }
    // NO GROUND PLANE AT ZERO, AND NO CEILING AT 2.97.
    //
    // Both used to be hard-coded here, which was fine while exactly one
    // storey existed. The building is physical now (building.js): every
    // slab is a real collision box with a real hole in it over the
    // stairwell, so standing on floor six and being stopped by the
    // underside of floor seven both fall out of the ordinary solid test
    // above. The stairwell special case is gone with them - there is
    // nothing to except, because the hole in the slab IS a hole.
    //
    // What is left is a backstop. If a slab is ever missed the fall must
    // not be silent and infinite.
    if (this.pos.y < -3) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
    // A CEILING IS NOT OPTIONAL: without one, a slide off a stack of props
    // can carry you up through the slab and onto the floor above.
    //
    // EXCEPT OVER THE STAIRWELL, where there is a hole in the slab on
    // purpose and the second flight comes up through it. Clamping there
    // put an invisible lid on the top four treads, so the stairs went all
    // the way up and you could not.
  }

  /** would standing here, at this height, be inside anything else? */
  blockedAt(x, y, z, h, solids, ignore) {
    for (const b of solids) {
      if (b === ignore) continue;
      if (Math.abs(x - b.x) > b.w/2 + RADIUS) continue;
      if (Math.abs(z - b.z) > b.d/2 + RADIUS) continue;
      if (y + h > b.y - b.h/2 && y < b.y + b.h/2 - 0.02) return true;
    }
    return false;
  }
}
