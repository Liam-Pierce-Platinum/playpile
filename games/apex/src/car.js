// =====================================================================
// APEX :: car.js - AN F1 CAR ON SPRINGS
// =====================================================================
//
// This grew out of the drift sandbox's four-wheel model, which was the
// part worth keeping: every wheel has its own load, its own slip angle,
// its own rotational speed, and one contact patch with a single grip
// budget shared between turning and driving. The gearbox stayed too -
// revs come from how fast the driven wheels are really turning through
// the gear you are really in, so a short gear really does mean more revs
// and bogging it in eighth is possible.
//
// Three things are new, and they are what makes this a racing car rather
// than a road car with the numbers turned up:
//
//   SUSPENSION   The body now has three degrees of freedom of its own -
//                it heaves, pitches and rolls on four springs, and the
//                load on each tyre is what its spring is pushing with at
//                that instant. Before, load transfer was algebra: a
//                formula that gave the right steady-state answer
//                immediately and had no dynamics at all. Springs give you
//                the delay, the overshoot and the settle for free, which
//                is most of what "feeling the car" actually is. It is
//                also the only way the wishbones outside can move.
//
//   DOWNFORCE    The single biggest difference between this and a road
//                car. Grip is mu times LOAD, and an F1 car makes its own
//                load out of speed - about its own weight again by 200
//                km/h, well over twice by 300. That is why it corners
//                harder the faster it goes, why it is so stable, and why
//                lifting in a fast corner is the frightening thing rather
//                than the safe one.
//
//   LOAD SENS.   A tyre does not make twice the force under twice the
//                load - mu falls as you lean on it. Without this, the
//                downforce above runs away: at 360 km/h the model happily
//                pulled 8.6 g, which no car and no neck has ever done.
//                With it, the numbers land where real ones do.
//
// ---------------------------------------------------------------------
// THE FRAME OF REFERENCE, because every sign error lives here
// ---------------------------------------------------------------------
//
//   yaw 0 faces +Z.  forward = (sin yaw, cos yaw).
//   BODY X is forward.  BODY Y is LEFT.  BODY Z is UP.
//   yaw rate r > 0 turns LEFT, which is +Y. The two agree, on purpose.
//   pitch > 0 is NOSE UP.  roll > 0 LEANS LEFT.
//
//   A wheel at body position (xi, yi) moves at
//        v = (u - r*yi,  v + r*xi)
//   which is omega cross r written out, and is the only reason the rear
//   tyres know the car is rotating at all.
//
//   A tyre's force OPPOSES its slip, so every lateral force below is the
//   NEGATIVE of the curve.
export const TUNE = {
  // ---- the car -------------------------------------------------------
  // A 2024-spec car at the minimum weight, driver included.
  mass:        798,     // kg
  wheelbase:   3.60,    // m, front axle to rear axle
  trackWidth:  2.00,    // m, left wheel to right wheel
  cgHeight:    0.28,    // m - low, which is half of why it corners
  weightFront: 0.455,   // fraction of the car's weight on the front axle
  inertia:     1000,    // kg m^2 about the vertical
  inertiaPitch: 1100,   // kg m^2 about the lateral
  inertiaRoll:  260,    // kg m^2 about the longitudinal

  // ---- the springs ---------------------------------------------------
  // Stiff, because the floor only works at a fixed ride height, and
  // because aerodynamic load would eat all the travel otherwise. The
  // damping is high too: a racing car is not allowed to float.
  springFront: 160000,  // N/m at the wheel
  springRear:  145000,
  damperFront: 11000,   // N per m/s
  damperRear:  10000,
  arbFront:    38000,   // anti-roll bar, N/m of roll across the axle
  arbRear:     22000,   // softer at the back = the car rotates
  travel:      0.055,   // m of suspension movement before it runs out

  // ---- the wings -----------------------------------------------------
  // N per (m/s)^2, so downforce = coefficient * speed^2. At 55 m/s (200
  // km/h) the total is about 7100 N, which is a whisker under the car's
  // own weight, and that is the number these are set by.
  downforce:   2.32,
  aeroBalance: 0.44,    // fraction of the downforce made at the front
  drag:        0.78,    // air resistance, per (m/s)^2
  drsDrag:     0.62,    // ...with the rear wing open
  drsDownforce: 0.72,   // and the downforce you give up for it

  // ---- the tyres -----------------------------------------------------
  gripFront:   2.06,    // peak, in g, at the load it was designed for
  // THE REAR HAS MORE GRIP THAN THE FRONT, ON PURPOSE. A car set up this
  // way runs out of front first, which is understeer - it washes wide and
  // gives you a second to do something about it. The other way round is
  // oversteer, which is a spin, and no amount of skill makes that feel
  // sticky.
  gripRear:    2.34,
  loadSens:    0.11,    // how much mu falls as you lean on the tyre
  stiffFront:  11.5,    // how sharply it builds to the peak - slicks are sharp
  stiffRear:   12.5,    // and the rear gets there first, same reason
  // PACEJKA C IS THE SHAPE OF THE CLIFF, and it is the single number that
  // decides whether this car feels sticky or lethal. Past the limit a
  // tyre keeps sin(C*pi/2) of its peak: at 1.68 that is 48%, so the
  // instant you ask for a fraction too much, HALF the grip vanishes and
  // the car is gone before a human could react. Flat out into a corner it
  // spun every single time. At 1.45 it keeps 76% - catchable, but a slide
  // that has started still runs away from you. At 1.15 it keeps 96%: the
  // curve goes over the top and FLATTENS instead of falling off, so
  // asking for a little too much costs you a little, not the car. The
  // peak is unchanged, so it is no faster - it just stops punishing.
  // 1.08 keeps 99% of the peak past the limit: the car washes wide instead
  // of leaving. The spinning was the interesting part when the car was
  // being built and is the annoying part now that there are twenty-three
  // others to race - Liam: "spinning out in apex was good but now its not
  // good". You can still lose it; you have to be crude about it.
  shape:       1.08,
  falloff:     0.90,
  stiffLong:   17.0,    // longitudinal stiffness, in slip RATIO not angle

  // ---- the wheels themselves -----------------------------------------
  wheelRadius: 0.36,    // 18 inch rims, 720 mm overall
  wheelInertia: 2.6,    // kg m^2 each, including its share of the driveline

  // ---- the engine ----------------------------------------------------
  torque:      520,     // Nm at the crank at its best, hybrid included
  redline:     15000,
  limiter:     15200,
  idle:        4000,    // it will not idle below this and never has
  gears:       [2.60, 2.05, 1.72, 1.48, 1.30, 1.16, 1.06, 0.98],
  reverse:     3.00,
  finalDrive:  6.00,
  driveline:   0.93,
  engineDrag:  2.60,    // closed throttle drags hard, and harvests
  shiftTime:   0.045,   // s - a seamless box, but you still feel it land
  // what a downshift into a gear the car is going far too fast for costs:
  // enough to step the back out, not enough to spin it on its own
  overRevNm:   2600,

  // ---- the differential ----------------------------------------------
  diffLock:    0.55,

  // ---- THE ELECTRONICS, which is what stops it drifting ----------------
  //
  // Everything above is a tyre model, and a tyre model that is any good
  // WILL spin the car: 520 Nm through a 15.6:1 first gear is several
  // times what two rear tyres can hold, so booting it out of a slow
  // corner lit them up and the car went round backwards. Real cars solve
  // that with electronics, not by pretending the tyres are made of glue,
  // so that is what these are. They are honest: they only ever take
  // torque away or ask for a moment the brakes could really produce.
  //
  // TRACTION CONTROL watches how much faster the rear tyres are turning
  // than the road is going past, and shuts the engine when that gets
  // silly. tcSlip is the slip ratio it allows - a little is wanted, it is
  // where the longitudinal peak is.
  tcSlip:      0.10,    // allowed slip ratio once the rear is working sideways
  tcFree:      1.20,    // ...and when it is not, which is high enough to never fire
  tcAngle:     0.09,    // rad of rear slip angle (5 deg) to close fully from one to the other
  tcLaunch:    0.55,    // extra slip allowed from a standstill, fading with speed
  tcBite:      10.0,    // how hard it lifts per unit of slip over the line
  tcOn:        70,      // it arrives fast...
  tcOff:       11,      // ...and lets go slowly, so it does not surge

  // OVERRUN. Lifting mid-corner used to spin it: closed-throttle engine
  // braking is a rear-only brake, and a rear tyre already at its limit
  // sideways has nothing left to give. So the engine-braking map backs
  // off exactly when the rears are busy, which is what a real overrun
  // map is for.
  overrunCut:  0.8,

  // STABILITY. The last resort, and it works like the real thing: brake
  // one side to make a yaw moment that points the nose back at where the
  // car is actually travelling. It does nothing at all until the car is
  // further sideways than it ever gets in clean cornering, and the most
  // it can ask for is about what one pair of tyres could really produce
  // across a 2 m track, so it is never inventing grip.
  escSlip:     4.2,     // degrees of slip angle before it wakes up
  escNm:       31000,   // Nm per radian past that
  escMax:      4200,    // Nm, and never more than this

  // ---- brakes --------------------------------------------------------
  // Carbon brakes stop an F1 car at around 5 g. They need to be able to
  // lock a tyre that is being pushed into the road by a tonne of wing.
  brakeTorque: 24000,   // Nm total
  brakeBias:   0.58,    // to the front

  // ---- what the driver can do ----------------------------------------
  // Barely a fifth of a turn. A racing car does not need lock, it needs
  // precision, and a big wheel angle would be unusable at this grip.
  //
  // TIGHT AND DIRECT. Liam: "I want this to feel more tight and direct".
  // The wheel now moves nearly twice as fast as it did (3.4 -> 6.2 rad/s),
  // which is the difference between asking the car to turn and it
  // turning; the lock comes off a little less with speed, so the front
  // still bites at 300 km/h; and it centres faster, which is what makes a
  // chicane feel like two inputs rather than one long one.
  steerMax:    0.38,    // rad, about 22 degrees
  steerSpeedDrop: 0.24, // and less of it the faster you go
  steerRate:   6.2,
  steerReturn: 7.5,

  // ---- THE AIR BEHIND ANOTHER CAR -------------------------------------
  // How much of the drag the tow takes away at its best, and how much of
  // the downforce dirty air costs at its worst. A third of the drag is
  // roughly what a real slipstream is worth; a fifth of the downforce is
  // enough that following through a corner is a real cost without making
  // it impossible.
  towDrag:     0.34,
  dirtyAir:    0.20,

  // ---- the world -----------------------------------------------------
  rollResist:  0.014,   // fraction of the load on each wheel
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

// =====================================================================
// THE TYRES YOU CAN CHOOSE
// =====================================================================
//
//   grip    peak grip on a dry road at the right temperature, against the
//           medium
//   life    km of racing before the tread is gone. The races are 2 to 10
//           laps, so these are short on purpose: a soft will not do a
//           ten-lap race without a stop, a hard will.
//   opt     the temperature it works at, in C, and `win` how far either
//           side of it before it has lost most of what temperature can
//           take away. Wets and inters work cool, because water cools them.
//   wet     grip against how much water is on the road, 0 (dry) to 1
//           (standing water), as points to interpolate. A slick on a wet
//           road is a skate; a full wet on a dry one is slow and melts.
//   aqua    the speed in m/s above which it starts to float on standing water
export const TYRES = {
  soft:   { name: 'SOFT',   letter: 'S', color: '#e8392e', grip: 1.035, life: 34, opt: 85,  win: 26, wet: [1, 0.72, 0.52, 0.42], aqua: 55 },
  medium: { name: 'MEDIUM', letter: 'M', color: '#f2c200', grip: 1.0,   life: 46, opt: 92,  win: 30, wet: [1, 0.72, 0.52, 0.42], aqua: 55 },
  hard:   { name: 'HARD',   letter: 'H', color: '#eef0f2', grip: 0.97,  life: 66, opt: 100, win: 32, wet: [1, 0.70, 0.50, 0.40], aqua: 55 },
  inter:  { name: 'INTER',  letter: 'I', color: '#35c96b', grip: 0.90,  life: 44, opt: 75,  win: 30, wet: [1, 0.97, 0.91, 0.70], aqua: 70 },
  wet:    { name: 'WET',    letter: 'W', color: '#2f8cff', grip: 0.82,  life: 44, opt: 62,  win: 30, wet: [1, 0.99, 0.97, 0.92], aqua: 85 },
};
const wetCurve = (pts, w) => {
  const x = clamp(w, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x));
  return pts[i] + (pts[i + 1] - pts[i]) * (x - i);
};

/** the tyre curve, returning force as a multiple of the load on it */
function pacejka(slip, B, C, D, E) {
  const Bs = B * slip;
  return D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))));
}

// Wheel order: 0 front-right, 1 front-left, 2 rear-right, 3 rear-left.
const FR = 0, FL = 1, RR = 2, RL = 3;
const IS_FRONT = [true, true, false, false];
const IS_LEFT = [false, true, false, true];

export class Car {
  constructor(tune = TUNE) {
    this.T = tune;
    this.home = { x: 0, z: 0, yaw: 0 };
    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      this.wheels.push({ load: 0, slip: 0, ratio: 0, spin: 0, fx: 0, fy: 0,
                         angle: 0, locked: false, scrub: 0, travel: 0,
                         temp: 92, wear: 1, tyreGrip: 1 });
    }
    // THE AIR AROUND THE CAR IN FRONT. Liam: "really fight being able to
    // focus on shifting, and drafting and strategy rather then steering".
    //
    // Two things happen behind another car and they pull in opposite
    // directions, which is exactly what makes following one a decision
    // rather than a formality:
    //
    //   THE TOW      the hole punched in the air is worth a chunk of your
    //                drag, so you gain speed on a straight - more the
    //                closer you are, and it reaches about fifty metres
    //   DIRTY AIR    the wings are working in that mess, so you lose
    //                downforce - which costs you in the corners, and only
    //                in the corners
    //
    // So you tow up to somebody down the straight and then have to decide
    // whether to sit in their wake through the corner, where you are the
    // one with less grip. main.js measures the gap and writes these two.
    this.tow = 0;              // 0..1, how much of the drag is gone
    this.dirty = 0;            // 0..1, how much of the downforce is gone
    // DAMAGE, written by damage.js and only read here. A reset (R) does not
    // mend a car - only a pit stop or a new session does.
    //   aeroF/aeroR  how much of each end's downforce is still attached
    //   grip[k]      what is left of tyre k: 1 whole, ~0.35 flat, 0 gone
    //   scrape[k]    a corner dragging on the road, as a friction coefficient
    //   pull         bent steering, radians of toe the front wheels carry
    //   drag         extra air resistance, per (m/s)^2 (negative when a wing has gone)
    this.dmg = { aeroF: 1, aeroR: 1, grip: [1, 1, 1, 1], scrape: [0, 0, 0, 0], pull: 0, drag: 0 };
    // what is on the wheels, and the weather they are in
    this.compound = 'medium';
    this.water = 0;           // 0 dry .. 1 standing water, set by the world each frame
    this.trackTemp = 35;
    this.reset(0, 0, 0);
  }

  /** fresh tyres of a compound, warmed (blankets) to `temp` */
  fitTyres(compound, temp = 85) {
    this.compound = compound;
    for (const w of this.wheels) { w.temp = temp; w.wear = 1; }
  }

  /** how much grip the tyres have right now, against a new medium on a dry road - the robots read this */
  get gripNow() {
    let s = 0;
    for (let k = 0; k < 4; k++) s += this.wheels[k].tyreGrip * this.dmg.grip[k];
    return s / 4;
  }

  /** where R puts you back to */
  setHome(x, z, yaw) { this.home = { x, z, yaw }; }

  /** called with no arguments, this is a FULL reset to the start line */
  reset(x, z, yaw) {
    if (x === undefined) { x = this.home.x; z = this.home.z; yaw = this.home.yaw; }
    this.x = x; this.z = z; this.yaw = yaw || 0;
    this.vx = 0; this.vz = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.gear = 1;
    this.rpm = this.T.idle;
    this.lonG = 0; this.latG = 0;
    // the three suspension degrees of freedom, and their rates
    this.heave = 0; this.heaveRate = 0;
    this.pitch = 0; this.pitchRate = 0;
    this.roll = 0;  this.rollRate = 0;
    this.stopped = true;
    this.onLimiter = false;
    this.overRev = 0;          // how far past the limiter a bad downshift has put it
    this.overRevFlash = 0;     // the same, with a third of a second of tail on it
    this.drs = false;
    this.tc = 0;
    this.shiftFor = 0;
    this.downforce = 0;
    for (const w of this.wheels) {
      w.load = 0; w.slip = 0; w.ratio = 0; w.spin = 0; w.fx = 0; w.fy = 0;
      w.angle = 0; w.locked = false; w.scrub = 0; w.travel = 0;
    }
  }

  get forwardSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get lateralSpeed() { return this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get kph() { return this.speed * 3.6; }

  /**
   * How far sideways the car is: the angle between where it points and
   * where it is actually going. The forward speed is used SIGNED, so a
   * car rolling backwards reads as 180 and not as 0.
   */
  get slipAngle() {
    if (this.speed < 1.2) return 0;
    return Math.atan2(this.lateralSpeed, this.forwardSpeed) * 180 / Math.PI;
  }

  /** the body position of a wheel, in metres: [forward, left] */
  wheelPos(k) {
    const T = this.T;
    const a = T.wheelbase * (1 - T.weightFront);   // CG to front axle
    const b = T.wheelbase * T.weightFront;         // CG to rear axle
    return [IS_FRONT[k] ? a : -b, (IS_LEFT[k] ? 1 : -1) * T.trackWidth / 2];
  }

  /** how hard this tyre is being asked to work, 0..1+, for smoke and squeal */
  wheelSlip(k) { return this.wheels[k].scrub; }

  /**
   * One frame.
   *
   * WHEEL AND SPRING DYNAMICS ARE BOTH STIFF and neither can be
   * integrated at 60 Hz. A tyre pushing 8000 N through a wheel changes
   * its speed by more than the frame can represent, so the wheel
   * overshoots and the force snaps back past zero - the car starts
   * braking itself in the middle of accelerating. A 160 kN/m spring is
   * worse: its natural frequency is about 2.3 Hz, but it is the damping
   * term that explodes, and an undamped overshoot puts a NEGATIVE load on
   * a tyre, which is nonsense the tyre model will happily act on.
   *
   * So the whole model runs at 240 Hz, four passes for every frame drawn.
   */
  step(dt, i) {
    const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 240))));
    const h = dt / n;
    for (let k = 0; k < n; k++) this.substep(h, i, k === 0);
  }

  substep(dt, i, first) {
    const T = this.T;
    const g = 9.81;
    const u = this.forwardSpeed;
    const v = this.lateralSpeed;
    const r = this.yawRate;

    // ---- STEERING -------------------------------------------------------
    // The lock comes down with speed. On a car with this much aerodynamic
    // grip that is not a driver aid, it is the difference between a
    // steering wheel and a switch: at 300 km/h a fifth of a turn would ask
    // for more lateral g than the tyres have.
    const spd = this.speed;
    // ...but not below 36 km/h. Full lock is exactly what the Grand Hotel
    // hairpin needs, and taking a fifth of it away at walking pace made a
    // 10 m radius corner physically impossible to get round.
    const maxLock = T.steerMax / (1 + Math.max(0, spd - 10) * T.steerSpeedDrop / 10);
    let want = 0;
    if (i.steerLeft) want += 1;
    if (i.steerRight) want -= 1;
    // an analogue wheel, for the robot drivers: -1 full right to +1 full left
    if (typeof i.steer === 'number') want = clamp(i.steer, -1, 1);
    const target = clamp(want, -1, 1) * maxLock;
    const rate = (want === 0 ? T.steerReturn : T.steerRate) * (typeof i.steer === 'number' ? 1.6 : 1) * dt;
    this.steer = clamp(this.steer + clamp(target - this.steer, -rate, rate), -maxLock, maxLock);

    // ---- DRS ------------------------------------------------------------
    // Open the rear wing: less drag, and less downforce with it. Held
    // open only while the button is, and it slams shut under braking the
    // way the real one does.
    this.drs = !!i.drs && !i.brake && u > 12;
    const dragC = (this.drs ? T.drag * T.drsDrag : T.drag) * (1 - this.tow * T.towDrag);
    const dfC = (this.drs ? T.downforce * T.drsDownforce : T.downforce) * (1 - this.dirty * T.dirtyAir);

    // ---- THE WINGS ------------------------------------------------------
    // Downforce goes on before the springs see anything, because it is a
    // load the springs then have to carry - which is why a fast car sits
    // lower, and why these cars have to be stiff enough not to bottom out.
    const df = dfC * u * u;
    this.downforce = df;
    const D = this.dmg;
    const dfF = df * T.aeroBalance / 2 * D.aeroF, dfR = df * (1 - T.aeroBalance) / 2 * D.aeroR;
    const dfAt = [dfF, dfF, dfR, dfR];

    // ---- THE SUSPENSION -------------------------------------------------
    //
    // Three degrees of freedom on four springs. The body's vertical
    // position at each corner is
    //     dz = heave + xi*pitch - yi*roll
    // for small angles, which is all these ever are, and the spring at
    // that corner pushes back against however far it has moved from where
    // it sits at rest.
    //
    // THIS is where the load on a tyre now comes from. Not from a formula
    // that says how much weight a corner ought to have - from what its
    // spring is actually pushing with, this instant, including the fact
    // that it has not finished moving yet.
    const W = T.mass * g;
    const staticLoad = [
      W * T.weightFront / 2, W * T.weightFront / 2,
      W * (1 - T.weightFront) / 2, W * (1 - T.weightFront) / 2,
    ];
    const kS = [T.springFront, T.springFront, T.springRear, T.springRear];
    const cS = [T.damperFront, T.damperFront, T.damperRear, T.damperRear];

    let Fz = 0, Mpitch = 0, Mroll = 0;
    const loads = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const [xi, yi] = this.wheelPos(k);
      const dz = this.heave + xi * this.pitch - yi * this.roll;
      const dzdot = this.heaveRate + xi * this.pitchRate - yi * this.rollRate;
      // the spring pushing up on the body, plus what the wings add
      let f = staticLoad[k] + dfAt[k] - kS[k] * dz - cS[k] * dzdot;

      // the bump stop: a suspension has a finite amount of travel in it,
      // and when it is gone it is gone. Without this the car sinks
      // through its own floor at 300 km/h.
      if (dz < -T.travel) f += (-T.travel - dz) * kS[k] * 12;

      // A TYRE CANNOT PULL THE ROAD UP. Load is clamped at zero, which is
      // what lifting an inside wheel is, and the tyre below then makes no
      // force at all rather than a negative one.
      loads[k] = Math.max(0, f);
      Fz += f;
      Mpitch += xi * f;
      Mroll += -yi * f;
    }

    // the anti-roll bars: they fight the DIFFERENCE across an axle, and
    // nothing else, which is why they change the balance without changing
    // how the car rides over a bump that hits both wheels at once.
    Mroll -= (this.roll * T.arbFront + this.roll * T.arbRear) * T.trackWidth / 2;

    // the body's own weight and the moments the tyres put into it. The
    // tyre forces act at the ground, a cgHeight below the centre of mass,
    // so accelerating pitches the nose up and cornering leans it over -
    // and those are the same moments that transfer the load.
    Fz -= W + (dfF + dfR) * 2;
    Mpitch += this.lonG * g * T.mass * T.cgHeight;
    Mroll -= this.latG * g * T.mass * T.cgHeight;

    this.heaveRate += (Fz / T.mass) * dt;
    this.pitchRate += (Mpitch / T.inertiaPitch) * dt;
    this.rollRate  += (Mroll / T.inertiaRoll) * dt;
    this.heave += this.heaveRate * dt;
    this.pitch += this.pitchRate * dt;
    this.roll  += this.rollRate * dt;

    for (let k = 0; k < 4; k++) {
      const [xi, yi] = this.wheelPos(k);
      this.wheels[k].load = loads[k];
      this.wheels[k].travel = -(this.heave + xi * this.pitch - yi * this.roll);
    }

    // ---- THE GEARBOX ----------------------------------------------------
    const throttleNow = i.throttle || 0;
    // ONLY ON THE FIRST SUB-STEP. A tap of the paddle must move the
    // gearbox one gear, not four because the frame was divided into four.
    if (first) {
      if (i.shiftUp && this.gear < T.gears.length) { this.gear++; this.shiftFor = T.shiftTime; }
      if (i.shiftDown && this.gear > -1) { this.gear--; this.shiftFor = T.shiftTime; }
    }
    this.shiftFor = Math.max(0, this.shiftFor - dt);
    // a seamless box still cuts the drive for a few hundredths, and that
    // cut is the bang you feel and hear
    const shifting = this.shiftFor > 0;

    const ratio = this.gear > 0 ? T.gears[this.gear - 1]
                : this.gear < 0 ? -T.reverse : 0;
    const drive = ratio * T.finalDrive;

    const rearSpin = (this.wheels[RR].spin + this.wheels[RL].spin) / 2;
    const wheelRpm = drive === 0 ? 0 : Math.abs(rearSpin * drive) * 60 / (2 * Math.PI);
    let engage = shifting ? 0 : 1;
    if (i.clutch || this.gear === 0) {
      engage = 0;
      const free = T.idle + (T.redline - T.idle) * throttleNow;
      this.rpm += (free - this.rpm) * Math.min(1, dt * 8);
    } else {
      // A SLIPPING CLUTCH STILL TRANSMITS ITS FULL TORQUE - that is what a
      // clutch is for, and it is why a car launches hard rather than
      // creeping. Slip decides what the REVS are, not how much gets
      // through.
      const slipping = T.idle + (T.redline * 0.70 - T.idle) * Math.max(throttleNow, 0.10);
      if (wheelRpm < slipping) {
        this.rpm += (slipping - this.rpm) * Math.min(1, dt * 9);
      } else {
        this.rpm += (clamp(wheelRpm, T.idle, T.limiter) - this.rpm) * Math.min(1, dt * 14);
      }
    }
    this.rpm = clamp(this.rpm, T.idle * 0.9, T.limiter);

    // A DOWNSHIFT TOO MANY. Ask for third at 300 km/h and the wheels are
    // trying to spin the engine past its limiter; the engine refuses, and
    // what gives instead is the grip at the back. Until now the rpm was
    // simply clamped and a bad downshift cost nothing at all, which made
    // the gearbox a formality - and Liam wants the driving to be about
    // "shifting, and drafting and strategy". So the amount the engine is
    // being over-revved by becomes a rear-only braking torque: the back
    // steps out, the car sits down, and you learn to wait a beat.
    this.overRev = engage > 0 && wheelRpm > T.limiter
      ? clamp((wheelRpm - T.limiter) / T.limiter, 0, 1.4) : 0;
    // ...and it puts itself out. The rear wheels lock within a couple of
    // hundredths, and locked wheels are not over-revving anything, so the
    // instant value is gone before a frame has finished - too quick for
    // the HUD, the sound or a test to ever see it. This is the same thing
    // with a tail on it: it holds for about a third of a second, which is
    // how long the noise and the shove in the back actually last.
    this.overRevFlash = Math.max(this.overRevFlash - dt * 3, this.overRev);

    // A turbo hybrid V6: torque almost everywhere, because the electric
    // side fills in exactly where the engine is weak. It signs off at the
    // top because the limiter is there, not because it runs out.
    const rr = this.rpm / T.redline;
    let curve = clamp(0.52 + 1.15 * rr - 0.70 * rr * rr, 0.30, 1);
    this.onLimiter = this.rpm >= T.redline;
    if (this.onLimiter) curve *= 0.30;

    // ---- TRACTION CONTROL ------------------------------------------------
    // The rear slip ratio is how much faster the tyres are turning than the
    // road is going past underneath them, and it is read from the previous
    // substep, which is what a real ECU does too - it only ever knows what
    // just happened. Only slip in the DRIVING direction counts, so this
    // never confuses a locked wheel under braking for wheelspin.
    const dsign = drive >= 0 ? 1 : -1;
    const rearSlip = Math.max(this.wheels[RR].ratio * dsign, this.wheels[RL].ratio * dsign);
    // AND IT ONLY INTERVENES WHEN THE REAR TYRES ARE NEEDED SIDEWAYS.
    // This matters more than it sounds. With the softened tyre curve there
    // is no longitudinal peak to fall off - more wheelspin keeps making
    // slightly more forward force all the way up - so cutting the engine in
    // a straight line is pure lost acceleration and buys nothing. What
    // wheelspin actually costs you is the OTHER half of the friction
    // budget: a rear tyre spending everything going forwards has nothing
    // left to hold the back end in, and that is the power oversteer. So the
    // limit is wide open when the car is pointing where it is going and
    // closes right down as the rear starts working sideways, which is when
    // the budget is worth protecting.
    const rearAlpha = Math.max(Math.abs(this.wheels[RR].slip), Math.abs(this.wheels[RL].slip));
    const sideways = clamp(rearAlpha / T.tcAngle, 0, 1);
    //
    // Plus a launch allowance. Slip ratio is (tyre speed - road speed) over
    // road speed, so at a standstill the denominator is zero and the number
    // means nothing - it is floored at 3 m/s, which makes a perfectly good
    // start read as enormous wheelspin. A launch also genuinely wants more
    // slip than a corner exit does, which is what every launch map on the
    // grid is for.
    const allow = T.tcFree + (T.tcSlip - T.tcFree) * sideways
                + T.tcLaunch / (1 + this.speed * 0.30);
    const wantCut = clamp((rearSlip - allow) * T.tcBite, 0, 0.92);
    this.tc += (wantCut - this.tc) * Math.min(1, dt * (wantCut > this.tc ? T.tcOn : T.tcOff));

    const engineNm = throttleNow * T.torque * curve * (1 - this.tc);
    // Engine braking is a real torque down the driveline, and IT MUST
    // OPPOSE WHICHEVER WAY THE DRIVELINE IS TURNING. As a plain negative
    // number it brakes a wheel turning forwards and DRIVES one turning
    // backwards, so a car that had spun and was rolling backwards
    // accelerated on a closed throttle. tanh is the sign function with
    // the cliff taken off, so there is no chatter through zero.
    //
    // ...and it is TAPERED OFF when the rear tyres are already at their
    // limit. Engine braking is a rear-only brake, so lifting mid-corner
    // asked a tyre that had nothing spare to find some anyway; it took the
    // grip out of the lateral half of the budget and the car came round.
    // Real overrun maps back off for exactly this reason.
    const rearBusy = Math.max(this.wheels[RR].scrub, this.wheels[RL].scrub);
    const overrun = clamp(1 - (rearBusy - T.overrunCut) / (1 - T.overrunCut), 0.15, 1);
    const dragNm = ((1 - throttleNow) * T.engineDrag * (this.rpm / 1000) * 22
                 // the money shift: a hard, unmapped drag the overrun map
                 // cannot soften, because nothing about it is mapped
                 + this.overRev * T.overRevNm)
                 * Math.tanh(rearSpin * drive * 0.4) * overrun;
    const axleNm = (engineNm - dragNm) * engage * drive * T.driveline;

    // ---- THE DIFFERENTIAL ------------------------------------------------
    const spinDiff = this.wheels[RR].spin - this.wheels[RL].spin;
    const lockNm = -spinDiff * T.diffLock * 220;
    const driveNm = [0, 0, axleNm / 2 + lockNm, axleNm / 2 - lockNm];

    // ---- BRAKES ----------------------------------------------------------
    // true is the pedal on the floor; a number is how hard, for the robots
    const bt = (typeof i.brake === 'number' ? clamp(i.brake, 0, 1) : i.brake ? 1 : 0) * T.brakeTorque;
    const brakeNm = [
      bt * T.brakeBias / 2, bt * T.brakeBias / 2,
      bt * (1 - T.brakeBias) / 2, bt * (1 - T.brakeBias) / 2,
    ];

    // ---- EVERY WHEEL, ONE AT A TIME --------------------------------------
    let Fx = 0, Fy = 0, Mz = 0;
    const baseMu = [T.gripFront, T.gripFront, T.gripRear, T.gripRear];
    const stiff = [T.stiffFront, T.stiffFront, T.stiffRear, T.stiffRear];

    for (let k = 0; k < 4; k++) {
      const w = this.wheels[k];
      const [xi, yi] = this.wheelPos(k);
      const d = IS_FRONT[k] ? this.steer + D.pull : 0;

      // the velocity of THIS wheel - where the yaw rate enters the model
      const wu = u - r * yi;
      const wv = v + r * xi;
      const cs = Math.cos(d), sn = Math.sin(d);
      const vlon = wu * cs + wv * sn;
      const vlat = -wu * sn + wv * cs;

      // TYRE LOAD SENSITIVITY. A tyre does not make twice the force under
      // twice the load: the contact patch is already doing its best. mu
      // falls off roughly linearly with how far past its design load you
      // push it, and on a car that makes two and a half tonnes of
      // downforce that is not a detail - without it the model pulled 8.6 g
      // at 360 km/h, which is roughly twice what any real car has managed.
      const ref = staticLoad[k];
      // WHAT THE TYRE IS STANDING ON. The world tells the car, per wheel:
      // asphalt is 1, a kerb a shade less, grass and gravel far less. With
      // no surface model at all, cutting across the infield was simply the
      // fastest way round, which makes a lap time meaningless.
      const surf = i.grip === undefined ? 1 : Array.isArray(i.grip) ? i.grip[k] : i.grip;
      // THE RUBBER: compound, temperature, wear and water, worked out below
      // from last substep's numbers and kept on the wheel
      const mu = baseMu[k] * clamp(1 - T.loadSens * (w.load / ref - 1), 0.55, 1.25) * surf * w.tyreGrip * D.grip[k];

      const refSpd = Math.max(Math.abs(vlon), 3.0);
      const ratioK = clamp((w.spin * T.wheelRadius - vlon) / refSpd, -2.5, 2.5);
      w.ratio = ratioK;
      const alpha = Math.atan2(vlat, Math.max(Math.abs(vlon), 0.8));
      w.slip = alpha;

      const cap = mu * w.load;
      let fLon = pacejka(ratioK, T.stiffLong, T.shape, mu, T.falloff) * w.load;
      let fLat = -pacejka(alpha, stiff[k], T.shape, mu, T.falloff) * w.load;

      // ONE CONTACT PATCH, ONE BUDGET. A tyre asked for more than it has
      // gives up on both at once, in proportion - the friction ellipse.
      const demand = Math.hypot(fLon, fLat);
      if (demand > cap && cap > 1) {
        const sc = cap / demand;
        fLon *= sc; fLat *= sc;
      }
      w.fx = fLon; w.fy = fLat;
      w.scrub = cap > 1 ? clamp(demand / cap, 0, 2) : 0;

      // ---- TYRE TEMPERATURE AND WEAR --------------------------------------
      // Heat comes from the work the tyre does sliding (force times the
      // speed it is sliding at) and from flexing as it rolls under load;
      // it goes into the air faster the faster the car goes, and much faster
      // into water. Wear is that same sliding work, and more of it when the
      // rubber is too hot.
      const TY = TYRES[this.compound];
      // Longitudinal slip is capped: this tyre curve has no longitudinal peak
      // and traction control lets a straight-line rear run a big slip ratio,
      // which is the car's way of putting power down, not a burnout - it
      // cooked and wore out the rears in a lap before this.
      const lonV = Math.min(Math.abs(w.spin * T.wheelRadius - vlon), 0.6);
      const work = Math.abs(fLat) * Math.abs(vlat) + Math.abs(fLon) * lonV;   // watts, near enough
      const heat = Math.min(work, 60000) * 0.00012 + w.load * Math.abs(vlon) * 0.000019;
      const cool = (w.temp - this.trackTemp) * (0.03 + Math.abs(vlon) * 0.0011) * (1 + this.water * 5);
      w.temp += (heat - cool) * dt;
      const hot = Math.max(0, w.temp - TY.opt - TY.win) / 20;
      w.wear = Math.max(0, w.wear - (Math.min(work, 40000) * 2.2e-7 + w.load * Math.abs(vlon) * 1.7e-9) * (1 + hot * 2) * (46 / TY.life) * (1 - 0.6 * this.water) * dt);
      // what the rubber can give: a parabola round its working temperature,
      // a slow fade as it wears and a cliff at the end, the water curve for
      // this compound, and floating on standing water above its speed
      const tOff = (w.temp - TY.opt) / TY.win;
      const tempF = 1 - 0.10 * Math.min(1, tOff * tOff);
      const wearF = 0.80 + 0.20 * Math.sqrt(w.wear) - (w.wear < 0.12 ? (0.12 - w.wear) * 1.5 : 0);
      let waterF = wetCurve(TY.wet, this.water);
      if (this.water > 0.35) waterF *= 1 - clamp((Math.abs(vlon) - TY.aqua) / 30, 0, 1) * (this.water - 0.35) * 0.9;
      w.tyreGrip = TY.grip * tempF * wearF * waterF;

      // ---- A CORNER ON THE GROUND ------------------------------------------
      // A flat tyre, a bare rim, or no wheel at all: that corner drags on
      // the road, which slows the car and pulls it round towards that side.
      if (D.scrape[k] > 0) {
        const wspd = Math.hypot(wu, wv);
        if (wspd > 0.05) {
          const f = D.scrape[k] * Math.max(w.load, staticLoad[k] * 0.6) / Math.max(wspd, 1.5);
          Fx -= wu * f; Fy -= wv * f;
          Mz += xi * (-wv * f) - yi * (-wu * f);
        }
      }

      // ---- the wheel's own spin ----------------------------------------
      const roadNm = fLon * T.wheelRadius;
      const resist = brakeNm[k] + w.load * T.rollResist * T.wheelRadius;
      let net = driveNm[k] - roadNm;
      if (Math.abs(w.spin) < 0.6 && Math.abs(net) < resist) {
        w.spin = 0;
        w.locked = resist > 1 && Math.abs(vlon) > 0.5;
      } else {
        net -= sign(w.spin) * resist;
        w.spin += net / T.wheelInertia * dt;
        w.locked = resist > 1 && Math.abs(w.spin * T.wheelRadius) < Math.abs(vlon) * 0.3;
      }
      if (this.gear !== 0 && !i.clutch && !shifting && drive !== 0) {
        const maxSpin = (T.limiter * 2 * Math.PI / 60) / Math.abs(drive);
        w.spin = clamp(w.spin, -maxSpin, maxSpin);
      }
      w.angle += w.spin * dt;

      // ---- back into the body frame ------------------------------------
      const bfx = fLon * cs - fLat * sn;
      const bfy = fLon * sn + fLat * cs;
      Fx += bfx; Fy += bfy;
      Mz += xi * bfy - yi * bfx;
    }

    // ---- STABILITY CONTROL -------------------------------------------------
    // Body slip is the angle between where the car POINTS and where it is
    // actually GOING. Clean, fast cornering runs about five degrees of it;
    // a car that is leaving runs thirty and climbing. Past the threshold
    // this adds a yaw moment that points the nose back down the direction
    // of travel, which is precisely what braking the inside wheel does on
    // a road car - and it is capped near what a pair of tyres could really
    // produce across a two-metre track, so it is never inventing grip.
    //
    // The sign matters and is easy to get backwards: v > 0 means the car is
    // sliding to its LEFT, so the nose is pointing RIGHT of where it is
    // travelling, so the nose has to come left - and positive yaw is left.
    const beta = Math.atan2(v, Math.max(Math.abs(u), 1));
    const excess = Math.abs(beta) * 180 / Math.PI - T.escSlip;
    if (excess > 0 && this.speed > 4) {
      const fade = clamp((this.speed - 4) / 3, 0, 1);
      Mz += sign(beta) * Math.min(excess * (Math.PI / 180) * T.escNm, T.escMax) * fade;
    }

    // ---- air --------------------------------------------------------------
    Fx -= (dragC + D.drag) * u * Math.abs(u);
    Fy -= dragC * 0.7 * v * Math.abs(v);
    // grass and gravel drag at the car as well as taking grip away: a
    // gravel trap is there to STOP a car, and does
    if (i.drag) { Fx -= i.drag * T.mass * u; Fy -= i.drag * T.mass * v * 0.5; }

    const accLon = Fx / T.mass;
    const accLat = Fy / T.mass;
    this.lonG = accLon / g;
    this.latG = accLat / g;

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.vx += (accLon * s + accLat * c) * dt;
    this.vz += (accLon * c - accLat * s) * dt;
    this.yawRate += (Mz / T.inertia) * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yaw += this.yawRate * dt;

    // ---- AND A CAR THAT IS STOPPED IS STOPPED ------------------------------
    // A model whose only brake is multiplying by slightly less than one
    // approaches zero and never arrives. Below walking pace with nothing
    // asked of it, the car is brought to a genuine halt and says so.
    const crawling = this.speed < 0.8 && Math.abs(this.yawRate) < 0.4;
    if (crawling && !i.throttle) {
      const k = Math.exp(-dt * 7);
      this.vx *= k; this.vz *= k; this.yawRate *= k;
      if (this.speed < 0.14 && Math.abs(this.yawRate) < 0.07) {
        this.vx = 0; this.vz = 0; this.yawRate = 0;
        for (const w of this.wheels) w.spin = 0;
        this.stopped = true;
      }
    } else this.stopped = false;
  }
}
