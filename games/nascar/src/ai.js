// =====================================================================
// NASCAR :: ai.js - THE OTHER THIRTY-NINE
// =====================================================================
//
// Liam asked for "realistic NPC's shifting driving". These drivers use the
// SAME stock.js and the same world.js as the player - same grip, same
// engine, same wall, same four-speed gearbox, same air. Nothing is faked:
// no rubber banding, no extra grip, no ghosting through each other. What
// makes one faster than another is how close to the limit it is willing to
// drive and how well it reads the air.
//
// ---------------------------------------------------------------------
// AN OVAL HAS LANES, NOT A RACING LINE
// ---------------------------------------------------------------------
//
// APEX's robots follow one line - the curvature-smoothed ideal - because a
// road course has one. A speedway does not. It has a bottom groove, a
// middle and a top, they are all within a second of each other, and WHICH
// ONE YOU ARE IN is the entire tactical content of the race:
//
//   - the bottom is the shortest way round and it is where the pack goes
//   - the top has more banking under it, which on a short track is grip
//   - and neither matters half as much as whether there is a car in front
//     of you punching a hole in the air
//
// So instead of one line there are seven lanes across the track, each with
// its own speed plan worked out from its own radius and its own banking
// angle. A driver picks one and holds it, and changes lanes when the air
// or the traffic tells it to.
//
// ---------------------------------------------------------------------
// THE SPEED PLAN ON A BANKED CORNER
// ---------------------------------------------------------------------
//
// The usual v^2 = mu*g*R does not survive a thirty-one degree banking. On
// a slope, only part of the car's weight presses into the road and the
// rest of it helps the car turn, and the cornering force itself presses
// the car harder into the road. Balancing both:
//
//     m v^2 / R  =  (mg + D)  *  (sin@ + mu cos@) / (cos@ - mu sin@)
//
// and the thing to notice is the DENOMINATOR. When mu is bigger than
// tan(@) it goes negative, which means there is no speed at which the car
// slides out of the corner - the banking has taken the tyres out of the
// argument entirely. That is the case at Daytona (tan 31 = 0.60, the tyre
// has 1.3), and it is why every plan below comes back with "flat out" and
// why tools/race.mjs shows a pack that never lifts.
const G = 9.81;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * The lanes and what each one is worth.
 *
 * @param track  a buildOval()
 * @param tune   the car's TUNE, for grip, mass, downforce and drag
 * @param skill  0.85 .. 1, how close to the limit the plan is drawn
 */
export function lanePlan(track, tune, skill = 1) {
  const pts = track.points, n = pts.length;
  const HW = track.halfWidth;
  const margin = 1.15;                     // no lane's wheels hang over the edge
  const LANES = 7;
  const Cl = tune.downforce, m = tune.mass + tune.fuelMax * 0.5;
  // ---- HOW FAST CAN IT GO AT ALL --------------------------------------
  // Two ceilings, and a plan that only knows about one of them is wrong at
  // half the tracks on the calendar. DRAG sets the top speed at Daytona,
  // where the gearing is tall. THE REV LIMITER sets it at Bristol, where
  // the rear gear is 5.40 and fourth runs out at a hundred and forty. The
  // first version knew only about drag, decided a Bristol car could do two
  // hundred and fifty-nine miles an hour, and planned the whole race
  // around it.
  const dragTop = Math.sqrt(tune.torque * 0.92 * tune.finalDrive * tune.driveline
                            / tune.wheelRadius / tune.drag) * 0.97;
  const gearTop = (tune.redline * 0.98) * (2 * Math.PI / 60) * tune.wheelRadius
                  / (tune.gears[tune.gears.length - 1] * tune.finalDrive);
  const VMAX = Math.min(dragTop, gearTop);
  // THE FIELD RUNS CLOSER TO THE LIMIT THAN IT DID. Liam: "I need the
  // other people to go faster and keep pace". The plan was drawn at 93% of
  // what the tyre has, which is a comfortable club driver; 96.5% is a Cup
  // field, and it is the right lever because it speeds them up everywhere
  // at once - corner entry, mid-corner and exit - rather than handing them
  // a straight-line bonus they did not earn.
  const mu0 = (tune.gripFront + tune.gripRear) / 2 * 0.965 * skill;
  // TWICE THE TYRE'S OWN LOAD SENSITIVITY, and that is not a fudge factor.
  // stock.js applies loadSens per wheel, and in a 2.3 g corner on a high
  // centre of mass the two outside wheels are carrying nearly all of it -
  // so THEIR load factor is about twice the car's average, and it is their
  // grip that runs out. A plan that spreads the load evenly over four tyres
  // believes the car has far more than it has: it decided Bristol's corner
  // was worth 108 mph when the car can hold 95, and every robot in the
  // field arrived at 108 and went straight to the wall with the front tyres
  // at fourteen degrees of slip and full lock on.
  //
  // The two numbers here are calibrated against tools/bench.mjs, which
  // measures the real thing: 97 mph round Bristol's 76 m at 28 degrees, and
  // 151 mph round a FLAT 305 m. One derate cannot fit both; this pair does.
  const LOADSENS = 0.31;

  /**
   * The fastest this lane can be taken, solved rather than computed.
   *
   * The closed form  v^2/R = (g + D/m) (sin@ + mu cos@)/(cos@ - mu sin@)
   * needs mu, and mu is not a constant: a tyre carrying three times its
   * design load does not make three times the force, and on a
   * twenty-eight degree banking at a hundred and thirty miles an hour it
   * IS carrying three times its design load. With mu taken as a constant
   * the plan decided Bristol's corners were worth a hundred and
   * thirty-three, sent every robot in at that speed, and put the entire
   * field into the outside wall on lap one.
   *
   * So it is iterated: guess the speed, work out how hard the tyres are
   * being leant on at that speed, take the grip that leaves, and solve
   * again. Three passes and it has converged to within a mile an hour.
   */
  const solve = (R, theta) => {
    const st = Math.sin(theta), ct = Math.cos(theta);
    let v = Math.min(VMAX, 40);
    for (let it = 0; it < 4; it++) {
      // the load on the tyres, as a multiple of what they carry standing still
      const nOverW = (1 + Cl * v * v / (m * G)) * ct + (v * v / R / G) * st;
      const mu = mu0 * clamp(1 - LOADSENS * (nOverW - 1), 0.32, 1.30);
      const den = ct - mu * st;
      if (den <= 0.02) { v = VMAX; break; }                // the banking has won
      const K = (st + mu * ct) / den;
      const d2 = 1 / R - Cl * K / m;
      const next = d2 <= 0 ? VMAX : Math.min(VMAX, Math.sqrt(G * K / d2));
      v = v + (next - v) * 0.7;                            // under-relaxed, or it rings
    }
    return v;
  };

  const lanes = [];
  for (let k = 0; k < LANES; k++) {
    // lane 0 is the bottom (inside, +lat), lane LANES-1 is against the wall
    const lat = (HW - margin) * (1 - 2 * k / (LANES - 1));
    const speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const kc = pts[i].curve;
      const theta = track.bankAt(i, lat);
      // the radius THIS lane drives: the inside of a left turn is the left,
      // so a lane further left is a tighter circle
      const R = Math.abs(kc) < 1e-6 ? 1e7 : Math.max(20, 1 / Math.abs(kc) - lat);
      speeds[i] = solve(R, theta);
    }
    // backwards pass: it has to be able to BRAKE from each point to the next
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        const ds = track.spacing;
        const theta = track.bankAt(j, lat);
        // braking on a banking is helped by the same normal load
        const brake = mu0 * (G * Math.cos(theta) + Cl * speeds[j] * speeds[j] / m) * 0.80;
        speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[j] * speeds[j] + 2 * brake * ds));
      }
    }
    // what a perfect driver of this lane would do, given how hard the car
    // can actually accelerate - this is the lap the lane is worth
    let lap = 0;
    const fwd = Float32Array.from(speeds);
    for (let pass = 0; pass < 2; pass++) {
      lap = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ds = track.spacing;
        const acc = Math.max(0.8, 7.5 - 0.075 * fwd[i]);
        fwd[j] = Math.min(speeds[j], Math.sqrt(fwd[i] * fwd[i] + 2 * acc * ds));
        lap += ds / Math.max(1, (fwd[i] + fwd[j]) / 2);
      }
    }
    lanes.push({ lat, speeds, lapTime: lap, k });
    // no lane change is attempted where the road bends hardest: a pass is
    // set up on the straight and completed in the corner, not started in it
  }
  let maxCurve = 0;
  for (const p of pts) maxCurve = Math.max(maxCurve, Math.abs(p.curve));
  return { lanes, VMAX, mu: mu0, maxCurve };
}

// =====================================================================
// HOLDING A LANE AT 190 MPH
// =====================================================================
//
// This is its own object because getting it wrong put every car in the
// game on the infield grass at the exit of turn two, and because the
// player's autopilot, the robots and tools/draft.mjs all need exactly the
// same one.
//
// THE FIRST VERSION WAS PURE PURSUIT, copied from APEX, and it oscillated
// itself off the road every single lap. Pure pursuit aims at a point on
// the line a fixed distance ahead and steers onto the arc through it,
// which is an undamped second-order loop with a natural frequency of
// sqrt(2)/T where T is the look-ahead time. At 85 m/s with APEX's 34 m of
// look-ahead T is 0.4 s, so the loop wanted to wobble at about half a
// hertz - and the gearbox, the steering rate limit and the tyres between
// them add more than enough lag to turn "wants to wobble" into "does".
//
// So it is built the other way round, as two loops that are each simple:
//
//   OUTER, in metres.  How far off the lane am I (eLat) and how fast is
//   that growing (vLat)? Ask for the lateral ACCELERATION that would fix
//   it: a = -(KP*eLat + KD*vLat). KP and KD are in 1/s^2 and 1/s, so the
//   loop behaves the same at 40 mph as at 190 - which the pure-pursuit
//   version emphatically did not.
//
//   INNER, in radians per second.  A lateral acceleration is a yaw rate:
//   r = a/v. Add the yaw rate the corner itself needs (v times the
//   curvature of THIS lane, which is not the curvature of the centre line
//   - a lane two metres lower is a tighter circle), and steer to hit it.
//
// The inner loop carries an INTEGRATOR, and that is not a detail. The
// steering angle a stock car needs to hold a given radius depends on how
// much slip angle its front tyres are carrying, which depends on the
// load, which depends on the banking, the fuel and how worn the tyres
// are. No feed-forward is going to know that. The integrator finds it,
// every corner, for free - and on a banking where gravity is doing some
// of the turning for you, it is what lets the car hold the lane with the
// wheel almost straight.
const KEEP = { kp: 5.0, kd: 4.4, ki: 2.5, kr: 1.2, preview: 0.35 };

export class LaneKeeper {
  constructor() { this.i = 0; }
  reset() { this.i = 0; }
  /**
   * @param r    the Runner
   * @param lat  metres left of the centre line to hold
   * @returns the steering input, -1 full right to +1 full left
   */
  steer(r, lat, dt) {
    const car = r.car, tr = r.track, n = tr.points.length;
    const v = Math.max(6, car.speed);
    // the curvature of the lane, previewed a third of a second ahead so
    // the wheel is already moving when the corner arrives
    const j = (r.i + Math.round(v * KEEP.preview / tr.spacing)) % n;
    const kc = tr.points[j].curve;
    const kappa = kc / (1 - kc * lat);
    const here = tr.points[r.i], lh = [Math.cos(here.h), -Math.sin(here.h)];
    const eLat = r.lat - lat;
    const vLat = car.vx * lh[0] + car.vz * lh[1];
    const want = v * kappa + (-(KEEP.kp * eLat + KEEP.kd * vLat)) / v;
    const err = want - car.yawRate;

    // ---- THE BANKING, FED FORWARD ---------------------------------------
    //
    // How much steering a corner needs is not just geometry. Resolving the
    // forces on a slope, the TYRES have to supply
    //
    //     a = v^2 * k / cos(@)  -  g * sin(@)
    //
    // and on a banked straight - Bristol's backstretch is ten degrees, the
    // Daytona tri-oval eighteen - the first term is zero and the second is
    // not, so that number is NEGATIVE: the car has to be steered UP the
    // slope just to go in a straight line, or gravity walks it down onto
    // the apron.
    //
    // Without this the integrator had to discover it, and the way an
    // integrator discovers something is by getting it wrong first. Coming
    // off Bristol's turn two the wheel was wound on to the left for the
    // corner and needed to be to the right within half a second; the
    // integrator took longer than that, the car slid down to the infield,
    // dropped two wheels on the apron and spun. Every lap. Now the wheel is
    // already moving before the banking has finished going away, and the
    // integrator is left doing what an integrator is for - trimming.
    const theta = r.bank;
    const aTyre = v * v * kappa / Math.max(0.55, Math.cos(theta)) - 9.81 * Math.sin(theta);
    const maxLock = car.T.steerMax / (1 + Math.max(0, car.speed - 12) * car.T.steerSpeedDrop / 10);
    // wheelbase over radius is the kinematic part; the second term is the
    // slip angle the front tyres need to make that force, measured off this
    // car at about 3 degrees for 2.4 g
    const ff = (car.T.wheelbase * kappa + 0.0022 * aTyre) / maxLock;
    // ANTI-WINDUP, and on this car it is what stops a slide becoming a spin.
    // A car that is already sideways is not going to follow the lane for a
    // second or two, and an integrator that keeps piling on lock while it is
    // waiting adds exactly the wrong input - more steering into a corner the
    // front tyres have already given up on. So past eight degrees of body
    // slip - which is where a stock car stops being merely loose - the
    // integral is bled away instead of built up, and the proportional term,
    // which reads the yaw rate directly, is left to catch it.
    const sliding = Math.max(0, Math.abs(car.slipAngle) - 8) / 10;
    if (sliding > 0) this.i *= Math.max(0, 1 - sliding * 6 * dt);
    else this.i = clamp(this.i + err * KEEP.ki * dt, -0.6, 0.6);
    return clamp(ff + this.i + err * KEEP.kr, -1, 1);
  }
}

// =====================================================================
// THE DRIVER
// =====================================================================

export class Driver {
  /**
   * @param runner  the world.js Runner this driver is driving
   * @param plan    a lanePlan(), shared by every driver of the same skill
   * @param skill   0.85 .. 1
   * @param style   { lane: 0..1 preferred groove, patience, aggression }
   */
  constructor(runner, plan, skill, style = {}) {
    this.r = runner;
    this.plan = plan;
    this.skill = skill;
    const rnd = style.rnd || Math.random;
    // WHERE THIS ONE LIKES TO RUN. Some cars are bottom-groove cars and
    // some are top-groove cars, and a field where everybody wants the same
    // piece of road is a single-file parade.
    this.groove = style.groove !== undefined ? style.groove : rnd();
    this.aggression = style.aggression !== undefined ? style.aggression : 0.35 + rnd() * 0.5;
    this.patience = 1.4 + rnd() * 2.6;        // seconds stuck before trying a lane
    this.lane = 0;                            // metres left of centre, the current target
    // how fast this driver moves across the road, and how much of a run it
    // wants before it will pull out of line. Both are here rather than as
    // constants so tools can sweep them.
    this.laneRate = 0.95;
    this.runNeed = 0.016;
    this.laneSet = false;
    this.keeper = new LaneKeeper();
    this.stuckFor = 0;
    this.blockedFor = 0;
    this.pitting = false;
    this.stall = 0;
    this.pitPhase = '';                       // '', 'in', 'stopped', 'out'
    this.stopUntil = 0;
    this.wantPit = false;
  }

  /** the lane whose lat is nearest `lat` */
  nearestLane(lat) {
    const L = this.plan.lanes;
    let best = 0, bd = Infinity;
    for (let k = 0; k < L.length; k++) {
      const d = Math.abs(L[k].lat - lat);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /** the groove this driver would sit in with the road to itself */
  homeLat() {
    const L = this.plan.lanes;
    return L[0].lat + (L[L.length - 1].lat - L[0].lat) * this.groove;
  }

  /**
   * Decide this frame's inputs.
   *
   * @param others  every other Runner
   * @param opts    { go, clock, pitOpen }
   */
  think(dt, others, opts = {}) {
    const car = this.r.car, tr = this.r.track;
    const i = this.r.i;
    const go = opts.go !== false;
    if (!this.laneSet) { this.lane = this.homeLat(); this.laneSet = true; }

    if (this.pitting || this.pitPhase) return this.pitLap(dt, others, opts);
    if (!go) return this.pace(dt, others, opts);

    const fwd = [Math.sin(car.yaw), Math.cos(car.yaw)], left = [Math.cos(car.yaw), -Math.sin(car.yaw)];

    // ---- WHO IS AROUND ME -------------------------------------------------
    //
    // On a speedway this is most of the driving. Three questions: is there
    // somebody right in front of me (a tow, and something I must not drive
    // into), is there somebody ALONGSIDE me (a lane I may not move into,
    // and the thing that makes side-by-side racing possible), and is there
    // a gap I could put my nose in.
    let ahead = null, aheadGap = Infinity;
    let anyAhead = null, anyGap = Infinity;        // in front, any lane
    let sideL = false, sideR = false, behindClose = false, attacker = null;
    const near = [];
    for (const o of others) {
      if (o === this.r || o.out) continue;
      const dx = o.car.x - car.x, dz = o.car.z - car.z;
      if (Math.abs(dx) > 90 || Math.abs(dz) > 90) continue;
      const f = dx * fwd[0] + dz * fwd[1], lt = dx * left[0] + dz * left[1];
      near.push({ o, f, lt });
      if (f > 1.0 && f < 90 && Math.abs(lt) < 2.3 && f < aheadGap) { aheadGap = f; ahead = o; }
      if (f > 1.0 && f < 50 && Math.abs(lt) < 5.5 && f < anyGap) { anyGap = f; anyAhead = o; }
      if (Math.abs(f) < 4.6 && Math.abs(lt) > 1.4 && Math.abs(lt) < 4.6) {
        if (lt > 0) sideL = true; else sideR = true;
      }
      if (f < -0.5 && f > -7 && Math.abs(lt) < 2.0) behindClose = true;
      // WHO IS COMING, AND WHICH SIDE HE HAS PICKED. A car within three
      // lengths, out of line, and closing is a man making a move - and
      // that is the one thing a driver in front actually reacts to.
      if (f < -0.5 && f > -13 && Math.abs(lt) < 6.0) {
        const closingOn = o.car.forwardSpeed - car.forwardSpeed;
        if (closingOn > -0.5 && (!attacker || f > attacker.f)) attacker = { o, f, lt, closingOn };
      }
    }

    // ---- WHICH LANE ------------------------------------------------------
    //
    // On a road course this would be "am I close enough to try a move". On a
    // superspeedway it is a different question, and the whole art of the
    // place is in it: DO I HAVE A RUN? A car in somebody's tow is running at
    // less drag than they are, so it has speed in hand that it is not using,
    // because it is sitting behind them. Pull out and it spends that speed
    // going past - and loses the tow the moment it does, so if the run was
    // not big enough it hangs out there in clean air and the whole queue
    // drives past it. That is a slingshot, and it is the only way anybody
    // has ever passed anybody at Daytona.
    //
    // THE MOVE IS COMMITTED, for two or three seconds. The first version
    // re-decided every frame: the car pulled out, instantly lost the tow,
    // instantly saw it no longer had a run, and tucked straight back in -
    // forty cars twitching a foot sideways for three hundred laps and not
    // one pass all race. A driver commits.
    const room = tr.halfWidth - 1.3;

    // ---- DEFENDING THE POSITION -------------------------------------------
    //
    // Liam: "I need to realy want to have to work to pass them needing
    // strategy".
    //
    // Until now nobody in front ever reacted to the man behind. Every pass
    // in the game was decided entirely by the attacker: pick a lane, have
    // more speed, done. That is not a pass, it is an overtake button with
    // extra steps, and it is why the racing felt like traffic rather than
    // like a fight.
    //
    // So a driver who has somebody out of line behind him and closing will
    // MOVE ACROSS TO COVER THE LANE THE ATTACKER PICKED. Three things keep
    // it from being a wrecking ball:
    //
    //   ONLY ON THE STRAIGHT. Weaving across a banked corner at 190 is how
    //   both cars end up in the fence, and no driver does it.
    //   ONLY SOME OF THEM, AND ONLY SOMETIMES. It is rolled against his
    //   aggression, so the field has blockers and gentlemen in it, and it
    //   is re-rolled rather than held, which is where "he might cover it,
    //   he might not" - the thing that makes you commit - comes from.
    //   ONE MOVE, NOT TWO. Having covered a lane he stays there for a
    //   second and a half rather than chasing the attacker back and forth,
    //   because chasing is blocking and blocking is what gets you turned
    //   round.
    //
    // The attacker already knows what to do about it: his own commit logic
    // above keeps a move alive while there is a car alongside, so a cover
    // that comes late gets passed anyway. That is the strategy - go early
    // and he covers you, go late and you have the run but less road.
    this.blockUntil = Math.max(0, (this.blockUntil || 0) - dt);
    if (attacker && !ahead && this.blockUntil <= 0
        && Math.abs(tr.points[i].curve) < this.plan.maxCurve * 0.55
        && Math.abs(attacker.lt) > 1.6
        // ...AND NOT WHEN HE IS ALREADY THERE. Moving across a car that
        // has its nose alongside is not defending, it is turning him
        // round, and it is how a blocker ends up in the fence with him.
        && attacker.f < -3.0
        && Math.random() < dt * 0.5 * this.aggression) {
      // HALF A COVER. The first version took eight tenths of the way to
      // the attacker's lane and held it for a second and a half, and it
      // worked far too well: measured, ZERO lead changes in forty laps of
      // Daytona and the Charlotte leader half a minute clear, because
      // nobody could get by anybody. Liam asked to have to work for a
      // pass, not to be locked out of one. Half the distance for a second
      // leaves the door open to somebody who commits early.
      const cover = clamp(attacker.lt * 0.45, -room + 1.2, room - 1.2);
      if (Math.abs(cover - this.lane) > 0.8) {
        this.blockLat = cover;
        this.blockUntil = 1.0;
      }
    }

    let wantLat = this.homeLat();
    this.commit = Math.max(0, (this.commit || 0) - dt);
    const closing = ahead ? car.forwardSpeed - ahead.car.forwardSpeed : 0;
    // the run: how much less drag I have than the car I am stuck behind
    const run = ahead ? ahead.car.air.dragScale - car.air.dragScale : 0;
    if (ahead && aheadGap < 30) this.blockedFor += dt;
    else this.blockedFor = Math.max(0, this.blockedFor - dt * 2);

    // GO WITH HIM. A lane only exists if somebody joins it: a driver who
    // pulls out alone at Daytona loses his tow and the whole queue drives
    // past him, so the pass only works if the car behind comes too. When
    // the car in front commits to a move, a driver with the nerve for it
    // commits to the same one - and that is where the second lane comes
    // from, and with it every pass for the lead in the sport.
    if (this.commit <= 0 && anyAhead && anyAhead.ai && anyAhead.ai.commit > 0.6
        && anyGap < 40 && this.aggression > 0.45) {
      this.commit = anyAhead.ai.commit;
      this.commitLat = anyAhead.ai.commitLat;
    }
    // ...and a move stays alive while there is a car ALONGSIDE. A pass at
    // Daytona takes half a lap and a fixed five-second commitment gave up in
    // the middle of it; and in any case a driver with a car on his door
    // cannot change his mind, because there is nowhere to go.
    if ((sideL || sideR) && this.commit > 0) this.commit = Math.max(this.commit, 1.6);
    if (this.commit > 0) {
      // COMMITTED, whether or not there is still anybody in front. The first
      // version required a car ahead to hold the move, and since pulling out
      // of line is precisely what stops there being a car ahead, the
      // condition was false one frame after the decision and the car tucked
      // straight back in. Nobody passed anybody all race.
      wantLat = this.commitLat;
    } else if (ahead && aheadGap < 26 && Math.abs(tr.points[i].curve) < this.plan.maxCurve * 0.75
               && this.blockedFor > this.patience * (1.4 - this.aggression)
               && (run > this.runNeed || closing > 1.2 || this.blockedFor > 9)) {
      const theirLat = ahead.lat;
      const outside = theirLat - 3.3, inside = theirLat + 3.3;
      const canOut = outside > -room && !sideR;
      const canIn = inside < room && !sideL;
      if (canOut && (!canIn || this.groove > 0.5)) wantLat = outside;
      else if (canIn) wantLat = inside;
      else wantLat = theirLat;
      if (wantLat !== theirLat) {
        this.commit = 4.0 + this.aggression * 3.0;
        this.commitLat = wantLat;
        this.blockedFor = 0;
      }
    } else if (attacker && !ahead && this.blockUntil > 0) {
      // STILL COVERING HIM. Once a driver has moved to defend he stays
      // there for a moment - a block that is re-decided every frame is a
      // twitch, and a car that twitches reads as broken rather than as
      // defending.
      wantLat = this.blockLat;
    } else if (ahead && aheadGap < 45) {
      // NOT trying to pass: get in the hole in the air. The tow is worth
      // more than the groove, and lining up behind somebody is what a pack
      // IS - so a car catching another gets in line behind it.
      //
      // ...and if the car in front has pulled out to pass somebody, GO WITH
      // HIM. A second lane only exists if somebody joins it, and a driver
      // who pulls out alone at Daytona is a driver who finishes twentieth.
      wantLat = wantLat * 0.25 + ahead.lat * 0.75;
    }
    // THE LEADER BLOCKS, a little. A car alongside and gaining gets the door
    // shut on it - not violently, because that is how you end a race, but
    // enough that a run has to be a real one.
    if (!ahead && this.aggression > 0.55) {
      for (const { o, f, lt } of near) {
        if (f > -14 && f < 4 && Math.abs(lt) > 1.6 && Math.abs(lt) < 7 && o.car.speed > car.speed - 1) {
          wantLat += clamp(lt, -1, 1) * 1.6;
          break;
        }
      }
    }
    // a car alongside pins you: you may not move into it, whatever you want
    const room2 = room;
    wantLat = clamp(wantLat, -room2, room2);
    if (sideL) wantLat = Math.min(wantLat, this.r.lat + 0.2);
    if (sideR) wantLat = Math.max(wantLat, this.r.lat - 0.2);
    // move over at a believable rate: a Cup car changes lanes in a second
    // or so, and anything faster reads as a twitch
    const rate = (sideL || sideR ? this.laneRate * 0.45 : this.laneRate) * dt;
    this.lane += clamp(wantLat - this.lane, -rate, rate);

    // ---- STEERING ---------------------------------------------------------
    const eLat = this.r.lat - this.lane;
    let steer = this.keeper.steer(this.r, this.lane, dt);

    // ---- HOW FAST --------------------------------------------------------
    const lane = this.plan.lanes[this.nearestLane(this.lane)];
    const k = (i + Math.round(Math.max(6, car.speed * 0.30) / tr.spacing)) % tr.points.length;
    // the plan is for a whole car on new tyres; grip goes with the square
    // root of what is actually left, and so does the speed a corner can be
    // taken at, so scaling the plan keeps everything consistent
    const aero = (car.dmg.aeroF + car.dmg.aeroR) / 2;
    const gripK = Math.sqrt(clamp(car.gripNow, 0.3, 1.05) * (0.7 + 0.3 * aero));
    let target = Math.min(lane.speeds[i], lane.speeds[k]) * gripK;

    // DON'T DRIVE INTO THE BACK OF IT - but on a superspeedway you are
    // ALLOWED to touch, gently, because that is bump drafting and it is how
    // the sport works. So the gap this driver will accept shrinks to nearly
    // nothing when the closing speed is small, and opens right out when it
    // is not.
    if (ahead) {
      const theirs = Math.max(0, ahead.car.forwardSpeed);
      const gap = Math.max(0, aheadGap - 5.2);
      // THE SPEED I COULD STILL SCRUB OFF IN THE GAP I HAVE.
      //
      // v^2 = u^2 + 2as, with a taken as a gentle 7 m/s^2 - about half what
      // the brakes can really do, because this is the margin, not the
      // emergency. The first version was `theirs + min(gap*0.9, ...)`, which
      // at a ten-metre gap let a driver run NINE metres a second faster than
      // the car in front. At Daytona that is survivable because nobody ever
      // brakes; at Bristol, where the field goes from 142 mph to 95 twice
      // every fifteen seconds, it was a pile-up at the end of every
      // straight.
      //
      // The cushion is the interesting part. A driver with some nerve is
      // allowed HALF A METRE A SECOND of closing speed at zero gap, which is
      // not an oversight - it is bump drafting, and without it the pack at
      // Daytona comes apart. A timid one leaves a length and a half.
      const gentle = closing < 2.2 && this.aggression > 0.3;
      const follow = Math.sqrt(theirs * theirs + 2 * 7 * gap) + (gentle ? 0.5 : -1.8);
      target = Math.min(target, Math.max(0, follow));
    }
    if (this.r.offTrack) target = Math.min(target, 34);

    const err = target - car.speed;
    let throttle = clamp(err * 0.55 + 0.25, 0, 1);
    let brake = err < -1.2 ? clamp(-err * 0.16, 0.12, 1) : 0;
    if (brake > 0) throttle = 0;
    // ONE TYRE, ONE BUDGET. Full throttle on top of everything the tyres
    // are already giving sideways asks for more than they have, and in a
    // stock car that is not understeer, it is the back end.
    const busy = Math.max(Math.abs(steer) - 0.55, Math.abs(eLat) * 0.18 - 0.45);
    if (busy > 0 && car.speed > 14) throttle *= clamp(1 - busy * 1.4, 0.35, 1);
    // ...and ASK THE REAR TYRES, which is what a stock car driver's right
    // foot is actually connected to. A rear tyre already spending four
    // fifths of what it has on holding the car in the corner has nothing
    // left to put the power down with, and the one place that matters most
    // is the exit of a short-track corner, where the banking - which was
    // doing a lot of the turning - runs out while the throttle is still
    // open. Every first-lap wreck at Bristol started exactly there.
    const rearBusy = Math.max(car.wheels[2].scrub, car.wheels[3].scrub);
    if (rearBusy > 0.78 && car.speed > 14) throttle *= clamp(1 - (rearBusy - 0.78) * 2.6, 0.25, 1);
    // and if it IS loose, lift and catch it - which is what a driver does
    const slip = car.slipAngle;
    if (Math.abs(slip) > 7 && car.speed > 15) {
      throttle *= clamp(1 - (Math.abs(slip) - 7) * 0.09, 0.15, 1);
      steer = clamp(steer - slip * 0.035, -1, 1);
    }

    // ---- GEARS -----------------------------------------------------------
    // A four-speed with a clutch: lift, clutch, lever, clutch, back on it.
    // The robots do it properly, which is why they lose the same tenth the
    // player does.
    const g = this.gears(dt, car, throttle);

    // stuck? (spun, or facing the wrong way against the wall)
    if (car.speed < 3) this.stuckFor += dt; else this.stuckFor = 0;
    const facing = Math.abs(wrap(car.yaw - tr.points[i].h));
    const reset = this.stuckFor > 5 || (facing > 2.3 && car.speed < 9 && this.stuckFor > 2);

    return { throttle: g.cut ? Math.min(throttle, 0.1) : throttle, brake, steer,
             clutch: g.clutch, shiftUp: g.up, shiftDown: g.down, reset, assist: 0.55 };
  }

  /**
   * The gearbox, as a small state machine, because an H-pattern change is
   * not an instant: off the throttle, clutch in, lever, clutch out. It
   * takes about a third of a second and that third of a second is real.
   */
  gears(dt, car, throttle) {
    const T = car.T;
    this.shiftT = Math.max(0, (this.shiftT || 0) - dt);
    if (this.shiftT > 0) return { clutch: true, cut: true, up: false, down: false };
    if (car.stalled) return { clutch: true, cut: false, up: false, down: false };
    if (car.gear < 1) return { clutch: true, cut: false, up: true, down: false };
    // DECIDED FROM ROAD SPEED, NOT FROM THE REV COUNTER.
    //
    // The first version read car.rpm, and it deadlocked the entire field at
    // a hundred miles an hour in first gear. The reason is that the driver
    // holds the clutch in during a change, and with the clutch in the engine
    // is free - it drops to idle plus a bit of throttle, about 1,800 rpm -
    // so the moment the change finished the rev counter said "far too low,
    // change down", and it changed down, and the clutch went in again,
    // forever. A driver does not look at the tachometer to decide whether
    // the gear is right; they know how fast the car is going. So this works
    // out what the engine WOULD be doing in each gear at this road speed.
    const per = (g) => (car.speed / T.wheelRadius) * T.gears[g - 1] * T.finalDrive * 60 / (2 * Math.PI);
    const up = car.gear < T.gears.length && per(car.gear) > T.redline * 0.965;
    // ...and a change down only if the gear below would not be over-revved
    // by it, which is what stops the money shift
    const down = car.gear > 1 && per(car.gear) < T.redline * 0.35 && per(car.gear - 1) < T.redline * 0.92;
    if (up || down) { this.shiftT = T.shiftTime + 0.06; return { clutch: true, cut: true, up, down }; }
    return { clutch: false, cut: false, up: false, down: false };
  }

  /**
   * Behind the pace car. NASCAR starts and restarts under caution in two
   * lines at about fifty miles an hour, and the field is nose to tail -
   * which means everybody is already in the draft when the green drops.
   */
  pace(dt, others, opts) {
    const car = this.r.car, tr = this.r.track;
    const i = this.r.i;
    const want = opts.paceSpeed || 24;
    this.lane += clamp((this.paceLat === undefined ? this.homeLat() : this.paceLat) - this.lane, -2 * dt, 2 * dt);
    const left = [Math.cos(car.yaw), -Math.sin(car.yaw)], fwd = [Math.sin(car.yaw), Math.cos(car.yaw)];
    const steer = this.keeper.steer(this.r, this.lane, dt);
    // hold station behind whoever is in front
    let target = want;
    for (const o of others) {
      if (o === this.r || o.out) continue;
      const dxx = o.car.x - car.x, dzz = o.car.z - car.z;
      const f = dxx * fwd[0] + dzz * fwd[1], lt = dxx * left[0] + dzz * left[1];
      if (f > 0.5 && f < 40 && Math.abs(lt) < 2.2) target = Math.min(target, o.car.forwardSpeed + (f - 11) * 0.7);
    }
    const err = target - car.speed;
    const g = this.gears(dt, car, 0.5);
    return { throttle: g.cut ? 0 : clamp(err * 0.5 + 0.1, 0, 0.85), brake: err < -1 ? clamp(-err * 0.2, 0.1, 0.8) : 0,
             steer, clutch: g.clutch, shiftUp: g.up, shiftDown: g.down, assist: 0.6 };
  }

  /**
   * A pit stop, driven. The robots use the same road, the same wall and
   * the same speed limit as the player: in off the apron, down the lane at
   * the limit, stop on the stall, wait for the crew, back out.
   */
  pitLap(dt, others, opts) {
    const car = this.r.car, tr = this.r.track, P = tr.pit;
    const i = this.r.i;
    const d = P.rel(this.r.dist);
    const stall = P.stallPose(this.stall);
    if (!this.pitPhase) this.pitPhase = 'in';

    // where the lane is here, and how fast we may go
    let lat = P.centre(d);
    let limit = P.limit;
    if (lat === null) {
      // not on the pit road yet: drive the bottom lane until the entry
      lat = tr.halfWidth - 1.4;
      limit = this.plan.VMAX;
      // ...BUT START BRAKING BEFORE THE COMMITMENT LINE. A car arriving at
      // the pit entry at a hundred and sixty miles an hour cannot be doing
      // the pit road limit fifty metres later; it sails past its own stall,
      // out the other end, and has to come round and try again. That is
      // what "in 505.0s" in tools/_pittrace meant - fifteen laps of a car
      // trying to pit and missing. So the driver looks ahead to the entry
      // and brakes for it like any other corner: v = sqrt(limit^2 + 2 a s),
      // at about a g of retardation.
      const toEntry = P.from - d;
      if (toEntry > 0 && toEntry < 400) {
        limit = Math.min(limit, Math.sqrt(P.limit * P.limit + 2 * 9.0 * toEntry));
      }
      // ...unless we have gone past it, which means we missed the stop
      if (d > P.to) { this.pitPhase = ''; this.pitting = false; }
    } else if (this.pitPhase === 'in' && d > stall.at - 24) {
      lat = P.box;                              // peel off into the stall
      limit = Math.min(limit, 7 + Math.max(0, stall.at - d) * 0.55);
      if (d > stall.at - 1.2) limit = 0;
      if (car.speed < 0.6 && d > stall.at - 4) {
        this.pitPhase = 'stopped';
        this.stopUntil = (opts.clock || 0) + (opts.service || 13);
      }
    } else if (this.pitPhase === 'stopped') {
      // HOW FAR THROUGH THE STOP, so main.js can put a crew round the car.
      // The driver already knows; nothing else did.
      const need = opts.service || 13;
      this.r.stopT = clamp(1 - (this.stopUntil - (opts.clock || 0)) / need, 0.001, 1);
      if ((opts.clock || 0) >= this.stopUntil) {
        this.pitPhase = 'out';
        this.r.stopT = 0;
        if (opts.onService) opts.onService(this.r);
      }
      return { throttle: 0, brake: 1, steer: 0, clutch: true, assist: 0 };
    } else if (this.pitPhase === 'out') {
      lat = P.fast;
      if (d > P.to - 5 || d < P.from) { this.pitPhase = ''; this.pitting = false; }
    }

    const left = [Math.cos(car.yaw), -Math.sin(car.yaw)], fwd = [Math.sin(car.yaw), Math.cos(car.yaw)];
    const steer = this.keeper.steer(this.r, lat, dt);
    // queue: never drive into the back of the car in front on pit road...
    //
    // ...but a car sitting in ITS OWN BOX is not the back of a queue, it is
    // furniture, and it is parked half a lane over. Treating it as traffic
    // deadlocks the whole pit road: everybody behind it holds station at
    // zero waiting for a car that is not going anywhere until its crew is
    // done, and on a long run that was cars sitting for twenty minutes.
    // stopT is set by the stop itself, so it is exactly the right test.
    for (const o of others) {
      if (o === this.r || o.out || o.stopT > 0) continue;
      const dxx = o.car.x - car.x, dzz = o.car.z - car.z;
      const f = dxx * fwd[0] + dzz * fwd[1], lt = dxx * left[0] + dzz * left[1];
      if (f > 0.5 && f < 30 && Math.abs(lt) < 2.6) limit = Math.min(limit, Math.max(0, (f - 7) * 0.8));
    }
    // STUCK ON PIT ROAD. Leaving the box the car has to cross seven metres
    // of lane to get back on the fast line, and if it drifts the other way
    // instead it is in the garage area on grass, where a stock car with no
    // aero and cold tyres does about a tenth of a metre a second. Two cars
    // a race spent forty minutes there, fifty laps down, without ever being
    // retired. Being stopped in the box is not stuck - that is the crew.
    if (this.pitPhase !== 'stopped' && car.speed < 1.2) this.pitStuck = (this.pitStuck || 0) + dt;
    else this.pitStuck = 0;
    const unstick = this.pitStuck > 8;
    if (unstick) this.pitStuck = 0;

    const err = limit * 0.96 - car.speed;
    const g = this.gears(dt, car, 0.4);
    const thr = g.cut ? 0 : clamp(err * 0.6, 0, 0.8);
    // THE CLUTCH COMES OUT WHEN HE WANTS TO GO.
    //
    // This used to read `clutch: g.clutch || car.speed < 3`, which is a
    // trap with no way out of it: with the clutch in there is no drive, so
    // a car leaving its box could never reach 3 m/s, so the clutch never
    // came out. It sat in the stall at seven thousand rpm and nought miles
    // an hour for the rest of the race. It took a long race on a track
    // where somebody actually pits to notice - a short one never gets
    // there, which is why it survived this long.
    //
    // What it was for is real, though: creeping up the lane at walking
    // pace in a gear that would otherwise stall the engine. So the clutch
    // is in only when he is stopped and NOT asking for anything.
    return { throttle: thr, brake: err < -0.4 ? clamp(-err * 0.35, 0.15, 1) : 0,
             steer, clutch: g.clutch || (car.speed < 2 && thr < 0.05),
             shiftUp: g.up, shiftDown: g.down, reset: unstick, assist: 0.6 };
  }
}
