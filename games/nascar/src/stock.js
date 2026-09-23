// =====================================================================
// NASCAR :: stock.js - A STOCK CAR ON SPRINGS
// =====================================================================
//
// Liam asked for "realistic nascar with realistic NPC's shifting driving
// and soft body physics". This file is the first half of that word
// realistic: everything the car does on a flat, endless plane. oval.js
// and world.js add what the banking does to it, draft.js adds what the
// other cars do to the air, damage.js adds what the wall does to the
// sheet metal. All of them only ever reach the car through numbers this
// file reads.
//
// It imports NOTHING, which is the point: `node tools/bench.mjs` drives
// it with no browser at all and prints what it does next to the figures
// a real Cup car does. A handling model that cannot be measured is a
// handling model nobody can fix.
//
// ---------------------------------------------------------------------
// WHY THIS IS NOT APEX'S CAR WITH THE NUMBERS CHANGED
// ---------------------------------------------------------------------
//
// An F1 car weighs 798 kg, sits 280 mm off the ground at its centre of
// mass, makes more downforce than it weighs and is driven with a fifth of
// a turn of lock. A Cup car weighs 1520 kg before it is fuelled, carries
// its mass nearly half a metre up, makes about three quarters of its own
// weight in downforce flat out and is driven on a wheel you can put a
// full turn into. Every consequence of that is the personality of the
// thing:
//
//   WEIGHT TRANSFER  1520 kg at 0.48 m does about twice the load transfer
//                    per g that 798 kg at 0.28 m does, through springs
//                    less than two thirds as stiff. The body MOVES. That
//                    slow roll is why a stock car has to be placed into a
//                    corner rather than pointed at it.
//
//   THROTTLE STEER   670 hp, rear wheels, no traction control, a tyre
//                    curve that goes over its peak and stays there rather
//                    than falling off a cliff. The rear axle is a steering
//                    input, and the car is meant to be driveable at eight
//                    or ten degrees of slip, not two.
//
//   LOOSE AND TIGHT  The balance is not a constant. 52 kg of fuel sits
//                    1.25 m behind the centre of mass, so a full car is
//                    1.5 points more rearward than an empty one - TIGHT
//                    early in a run, LOOSE at the end of it. And on a
//                    left-turn oval the two right-hand tyres do nearly
//                    all the work, so they go off first: the right front
//                    going away is tight, the right rear going away is
//                    loose. Both fall straight out of the wear model
//                    rather than being scripted.
//
//   FOUR SPEEDS      An H-pattern box with a clutch and a real 0.35 s of
//                    nothing while the lever is between gears. Liam asked
//                    for shifting that matters, and the way to make a
//                    shift matter is to make it cost something. Each
//                    track carries its own final drive, the way a team
//                    changes the rear gear at every race, so Bristol is
//                    second and third all night and Daytona is fourth
//                    from the moment you leave the pit road.
//
// ---------------------------------------------------------------------
// THE FRAME OF REFERENCE, because every sign error lives here
// ---------------------------------------------------------------------
//
//   yaw 0 faces +Z.  forward = (sin yaw, cos yaw).
//   BODY X is forward.  BODY Y is LEFT.  BODY Z is UP.
//   yaw rate r > 0 turns LEFT, which is +Y. The two agree, on purpose,
//   and an oval turns left all day so this sign gets a lot of use.
//   pitch > 0 is NOSE UP.  roll > 0 LEANS LEFT.
//
//   A wheel at body position (xi, yi) moves at
//        v = (u - r*yi,  v + r*xi)
//
//   A tyre's force OPPOSES its slip, so every lateral force below is the
//   NEGATIVE of the curve.
export const TUNE = {
  // ---- the car ---------------------------------------------------------
  // A Next Gen Cup car at the minimum weight with the driver in it, before
  // any fuel goes in.
  mass:        1520,    // kg, dry, driver included
  fuelMax:     52,      // kg - an 18.5 US gallon cell of racing petrol
  fuelAt:      -1.25,   // m: the cell sits this far BEHIND the dry centre of mass
  wheelbase:   2.79,    // m (110 in, and it has been 110 in for forty years)
  trackWidth:  1.72,    // m
  cgHeight:    0.48,    // m - and this one number is most of the car's character
  weightFront: 0.520,   // fraction of the DRY weight on the front axle
  inertia:     2400,    // kg m^2 about the vertical
  inertiaPitch: 2600,
  inertiaRoll:  640,

  // ---- the springs -----------------------------------------------------
  // Soft by racing standards, because the car has to work over concrete
  // seams and because a stock car generates its grip by leaning on the
  // outside tyres rather than by being flat.
  springFront: 96000,   // N/m at the wheel
  springRear:  78000,
  damperFront: 7600,    // N per m/s
  damperRear:  6400,
  arbFront:    24000,   // anti-roll bar, N/m of roll across the axle
  arbRear:     11000,
  travel:      0.085,   // m before the bump stop

  // ---- WEDGE, which is the adjustment the whole sport talks in ----------
  //
  // Round of wedge = turns of the jack bolt on the left rear, and what it
  // really changes is how much of the car's weight stands on the LEFT REAR
  // and RIGHT FRONT diagonal. More wedge puts more load on that pair, which
  // on a left-hand corner means more load on the loaded right front - and a
  // front tyre carrying more load makes proportionally less grip (see
  // loadSens below), so the car pushes. That is why wedge in is TIGHT and
  // wedge out is LOOSE, and it is why this is modelled as a preload on the
  // springs rather than as a fudge on the grip.
  //
  //   wedge  +1 = two rounds in (tight), -1 = two rounds out (loose)
  wedgePerRound: 620,   // N of diagonal preload per round of wedge
  // THE TRACK BAR does the same job at the other end: raising it raises the
  // rear roll centre, which makes the rear end transfer its load faster and
  // takes rear grip away in the middle of the corner. Loose.
  barPerTurn:  0.040,   // fraction of rear roll stiffness per turn of the bar

  // ---- the air ---------------------------------------------------------
  // N per (m/s)^2. At 89 m/s (200 mph) that is about 8,700 N - a shade
  // under 2,000 lb, which is what a Next Gen car makes in the low-drag
  // superspeedway trim it wears at Daytona. It is roughly three fifths of
  // the car's own weight, against an F1 car's two and a half times its
  // own weight, and that difference is most of why the racing is different.
  downforce:   1.10,
  aeroBalance: 0.36,    // fraction made at the front. A stock car is rear-loaded.
  drag:        0.555,   // and this number alone sets the top speed

  // ---- the tyres -------------------------------------------------------
  // A Goodyear Cup tyre is a treaded racing tyre on a 18 in wheel, 30 in
  // overall. It gives up more gently than a slick and it wants a big slip
  // angle - which is why a stock car is steered as much with the throttle
  // as with the wheel.
  // A LITTLE MORE GRIP AT BOTH ENDS. Not for lap time - the AI is held to
  // the same plan either way - but because the margin between "turning"
  // and "sliding" is what you feel, and a wider margin is a car that does
  // not step out every time you ask it a question.
  gripFront:   1.42,
  gripRear:    1.54,    // rear a shade more, same reason as APEX: run out of
                        // front first, and understeer gives you a second to think
  loadSens:    0.16,    // mu falls as you lean on the tyre. Heavier car, bigger effect.
  // HOW SHARPLY IT BUILDS TO THE PEAK, in slip angle. With this Pacejka
  // shape the peak sits at atan(tan(pi/2C))/B, so 14 puts it at about nine
  // and a half degrees - which is where a treaded stock car tyre peaks, and
  // is a long way past a slick's six. The first version used 8.5, putting
  // the peak at fifteen degrees, and the consequence was not that the car
  // felt vague, it was that it was SLOW: holding Daytona's corner needed
  // three degrees of body slip, and three degrees of slip at two and a half
  // g is more than a thousand newtons of induced drag - the car lost
  // twenty-one miles an hour in every turn and the draft could not be
  // measured through the noise.
  // AND IT IS STIFFER THAN IT WAS. Liam: "I need it so that ... it has
  // literally no skid or drifting there still is some".
  //
  // This is the number that decides how far the car has to slide sideways
  // before the tyre is giving everything it has. At 14 the peak sat at
  // about nine and a half degrees of slip, so ANY hard corner was taken
  // with the car visibly crabbing - which is authentic for a stock car and
  // is the thing he does not want to see. At 19 the peak is at about seven,
  // and the tyre is already giving four fifths of its grip at three, so the
  // car turns where it is pointed instead of arriving sideways.
  stiffFront:  24.0,
  stiffRear:   25.0,
  // PACEJKA C, the sticky-vs-lethal knob. Liam: "get rid of spin outs".
  //
  // This is the number that decides whether a car that has gone past the
  // limit COMES BACK. At 1.35 the tyre kept sin(1.35*pi/2) = 89% of its
  // grip past the peak, so the back would step out, keep stepping out
  // while you were still asking, and be gone - which is authentic and is
  // also the single thing he does not want. At 1.12 it keeps 98%: the car
  // runs wide, the back gets light, you feel all of it, and it does not
  // come round. You can still lose it - lift in the middle of a corner at
  // Bristol and it will go - but you have to earn it.
  shape:       1.06,
  // and the long slide past that costs less grip too, so a car that IS
  // sideways can be driven back straight rather than simply continuing
  falloff:     0.97,
  stiffLong:   12.0,

  // ---- the wheels ------------------------------------------------------
  wheelRadius: 0.372,   // m, 30 in overall
  wheelInertia: 4.2,    // kg m^2 each, its share of the driveline included

  // ---- the engine ------------------------------------------------------
  // 358 cubic inches, normally aspirated, pushrod, two valves. 670 hp at
  // 7500 rpm is 636 Nm; peak torque is lower down and bigger, which is what
  // a big naturally aspirated V8 feels like and is why it will pull fourth
  // gear out of a corner at Bristol if you ask it to.
  torque:      660,     // Nm at the crank at its best
  torqueAt:    6200,    // rpm where that happens
  redline:     9000,
  limiter:     9300,
  idle:        1050,    // it can stall, and it idles like a road car
  // A four-speed H-pattern box. First is for the pit road and the pace lap.
  gears:       [2.20, 1.57, 1.23, 1.00],
  reverse:     2.50,
  finalDrive:  3.90,    // the DEFAULT. Every track spec overrides it.
  driveline:   0.90,
  engineDrag:  3.60,    // a big NA V8 hauls the car down on a closed throttle
  // THE SHIFT COSTS YOU. This is not a seamless paddle box: the lever comes
  // out of one gate, crosses the H and goes into the next, and for that
  // third of a second the engine is pushing nothing at all. Shifting at the
  // wrong moment on a restart is how you lose three places.
  shiftTime:   0.35,    // s with the clutch used properly
  shiftTimeNo: 0.55,    // s if you bang it in without the clutch, and it grinds

  // ---- the differential ------------------------------------------------
  // A locker, near enough. Both rear wheels turn together, which is why the
  // car wants to run wide off the corner and why it is so happy sideways.
  // AND A LESS WELDED DIFF. 0.86 is most of a spool, which is what made it
  // "so happy sideways" two lines up - both rear tyres breaking away
  // together is a spin rather than a slide. 0.72 still drives off the
  // corner like a stock car and lets the inside wheel give up on its own.
  diffLock:    0.72,

  // ---- what little help there is ---------------------------------------
  //
  // There is no traction control in a Cup car and none here. The only aid
  // is a stability assist the menu can switch OFF, and it is honest in the
  // same way APEX's is: it only asks for a yaw moment that braking one side
  // could really produce. The threshold is TWELVE degrees of body slip, not
  // five - a stock car is meant to be driven loose, and a nanny that woke
  // up at five degrees would take the car away from the driver.
  // AND THE NANNY WAKES UP EARLIER. Twelve degrees is past the point of no
  // return for most drivers: by the time it stirred, the moment had built
  // and all it could do was watch. Six and a half is where a slide starts
  // to run away from you, and it now pushes harder when it gets there.
  // With the assist switched off in the menu the car is exactly as it was
  // in this respect - that switch is still honest.
  // AND WITH LANE CONTROL ON IT ALLOWS ALMOST NOTHING. Six and a half
  // degrees is a slide you can see from the grandstand. Two and a half is
  // the point where a real driver has already started correcting, and the
  // authority behind it is now enough to actually hold it there rather
  // than to watch. The switch is still honest - turn it off and the car
  // underneath is the tyre model above, which is tight but is not glued.
  escSlip:     1.5,     // degrees of body slip before it does anything
  escNm:       86000,   // Nm per radian past that
  escMax:      21000,

  // ---- brakes ----------------------------------------------------------
  // Enough to lock all four, which at Bristol you will.
  brakeTorque: 16500,   // Nm total
  brakeBias:   0.56,

  // ---- what the driver can do ------------------------------------------
  // A proper steering wheel with proper lock, and it stays heavy: a stock
  // car is caught with the wheel, so taking the lock away with speed the
  // way a formula car does would make a slide uncatchable.
  // THE LOCK COMES DOWN A LONG WAY WITH SPEED, and it has to. At 190 mph a
  // Cup driver moves the wheel a couple of degrees a lap; the physical lock
  // is still there but nobody is using it, and a model that hands a
  // keyboard six degrees at the front wheels at 85 m/s is asking for fifty
  // metres per second squared of lateral acceleration from tyres that have
  // twenty. Every controller in the game went unstable on the banking until
  // this number went up. At 190 mph it leaves 6.8 degrees, at Bristol's 105
  // it leaves 11, and at walking pace it leaves all of it.
  // SHARPER. Liam: "make turning sharper so wall bumping is less common".
  //
  // The lock was not the problem - it is the RATE. At 2.6 rad/s the wheel
  // took about a fifth of a second to reach full lock, and a fifth of a
  // second at 180 mph is sixteen metres, which on a mile-and-a-half oval
  // is most of the distance between the groove and the wall. By the time
  // the car answered, the correction was already too late and the next one
  // was an overcorrection. At 4.4 it answers inside five metres, which is
  // what makes a save possible; the return spring is quicker to match, so
  // it also comes back to centre rather than winding up.
  steerMax:    0.52,    // rad, about 30 degrees at the wheels
  steerSpeedDrop: 0.46,
  steerRate:   4.4,
  steerReturn: 6.0,

  // ---- the world -------------------------------------------------------
  // Nm per rad/s of yaw, see the damping in step(). A locked diff and a
  // wide rear track do this in the real thing.
  yawDamp:     8000,

  rollResist:  0.013,
  // kg of fuel per joule of crank work. A Cup car does about five miles to
  // the gallon and carries eighteen of them, so a green-flag run is a
  // hundred miles and not a metre more: forty-odd laps of Daytona, seventy
  // of Darlington, and a hundred and eighty round Martinsville. Measured
  // with tools/wear.mjs rather than guessed - at 4.1e-8 the tank was worth
  // a hundred and thirty-four miles and nobody ever had to stop, which
  // takes the strategy out of a sport that is mostly strategy.
  fuelPerJoule: 4.65e-8,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

// =====================================================================
// THE TYRES
// =====================================================================
//
// One Goodyear per race weekend, in two compounds, plus the wet for a road
// course that this game does not have yet. `life` is km of racing before
// the tread is gone; a Cup run is 40-60 laps, so these are set against that.
//
// RIGHT SIDE AND LEFT SIDE ARE DIFFERENT TYRES on a real oval car and the
// stagger between them is part of the setup. That is one level of detail
// further than this first pass goes - what it does model is that the right
// side does the work and therefore wears out first, which falls out of the
// wear model on its own and is the thing you actually feel.
export const TYRES = {
  // LIFE is how many laps of Daytona a set is worth. It was 130, which is
  // three fuel runs - so tyres never decided anything and a stop was only
  // ever about the fuel. A real Goodyear is done in about a fuel run, and
  // at somewhere abrasive like Darlington it is done before that, which is
  // the whole reason a crew chief has anything to think about.
  sticker: { name: 'STICKER', letter: 'S', color: '#f2c200', grip: 1.00, life: 86, opt: 96, win: 34 },
  scuffed: { name: 'SCUFFED', letter: 'C', color: '#8e99a9', grip: 0.985, life: 74, opt: 96, win: 34 },
};

/** the tyre curve, returning force as a multiple of the load on it */
function pacejka(slip, B, C, D, E) {
  const Bs = B * slip;
  return D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))));
}

// Wheel order: 0 front-right, 1 front-left, 2 rear-right, 3 rear-left.
// On a left-hand oval 0 and 2 are the loaded pair, and everything about how
// this car goes off over a run is about those two.
const FR = 0, FL = 1, RR = 2, RL = 3;
const IS_FRONT = [true, true, false, false];
const IS_LEFT = [false, true, false, true];
export const WHEEL_NAME = ['RIGHT FRONT', 'LEFT FRONT', 'RIGHT REAR', 'LEFT REAR'];
export const WHEEL_SHORT = ['RF', 'LF', 'RR', 'LR'];

export class Car {
  constructor(tune = TUNE) {
    this.T = { ...tune };
    this.home = { x: 0, z: 0, yaw: 0 };
    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      this.wheels.push({ load: 0, slip: 0, ratio: 0, spin: 0, fx: 0, fy: 0,
                         angle: 0, locked: false, scrub: 0, travel: 0,
                         temp: 80, wear: 1, tyreGrip: 1 });
    }
    // ---- THE SETUP, which the crew chief changes at a stop ----------------
    this.setup = { wedge: 0, bar: 0 };     // rounds of wedge, turns of track bar

    // ---- DAMAGE, written by damage.js and only read here -----------------
    //   aeroF/aeroR  how much of each end's downforce is still working
    //   grip[k]      what is left of tyre k: 1 whole, ~0.3 flat, 0 gone
    //   scrape[k]    a corner dragging on the road, as a friction coefficient
    //   rub[k]       sheet metal touching that tyre: wears it out, fast
    //   pull         bent steering, radians of toe the front wheels carry
    //   drag         extra air resistance, per (m/s)^2
    this.dmg = { aeroF: 1, aeroR: 1, grip: [1, 1, 1, 1], scrape: [0, 0, 0, 0],
                 rub: [0, 0, 0, 0], pull: 0, drag: 0 };

    // ---- THE AIR AROUND IT, written by draft.js each frame ---------------
    //   dragScale   1 alone in clean air, less in somebody's tow
    //   pushF/pushR how much front / rear downforce the dirty air leaves
    this.air = { dragScale: 1, pushF: 1, pushR: 1 };

    // ---- WHAT THE BANKING DOES, written by world.js each frame -----------
    //   sin/cos    the local banking angle, resolved
    //   dirF/dirL  the DOWN-SLOPE direction, as a unit vector in the car's
    //              own frame. A car pointing down the road on a left-hand
    //              oval has it at (0, 1) - straight to its left, toward the
    //              infield - but a car that has spun is facing some other
    //              way and gravity does not spin with it, so world.js
    //              resolves the direction and hands it over already rotated.
    this.bank = { sin: 0, cos: 1, dirF: 0, dirL: 1 };

    this.compound = 'sticker';
    this.trackTemp = 38;
    this.fuel = TUNE.fuelMax;
    this.reset(0, 0, 0);
  }

  /** fresh rubber, warmed on the tyre heaters */
  fitTyres(compound = 'sticker', temp = 82) {
    this.compound = compound;
    for (const w of this.wheels) { w.temp = temp; w.wear = 1; }
  }

  /** how much grip the tyres have right now, against a new sticker - the robots read this */
  get gripNow() {
    let s = 0;
    for (let k = 0; k < 4; k++) s += this.wheels[k].tyreGrip * this.dmg.grip[k];
    return s / 4;
  }

  /**
   * LOOSE OR TIGHT, as one number, for the HUD and for the crew chief.
   * Negative is loose (the rear gives up first), positive is tight. It is
   * measured, not declared: the ratio of how hard each axle is working
   * against what it has. A car at -0.1 is on the edge of stepping out.
   */
  get balance() {
    const f = (this.wheels[FR].scrub + this.wheels[FL].scrub) / 2;
    const r = (this.wheels[RR].scrub + this.wheels[RL].scrub) / 2;
    return clamp(f - r, -1, 1);
  }

  setHome(x, z, yaw) { this.home = { x, z, yaw }; }

  reset(x, z, yaw) {
    if (x === undefined) { x = this.home.x; z = this.home.z; yaw = this.home.yaw; }
    this.x = x; this.z = z; this.yaw = yaw || 0;
    this.vx = 0; this.vz = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.gear = 1;
    this.rpm = this.T.idle;
    this.lonG = 0; this.latG = 0;
    this.heave = 0; this.heaveRate = 0;
    this.pitch = 0; this.pitchRate = 0;
    this.roll = 0;  this.rollRate = 0;
    this.stopped = true;
    this.stalled = false;
    this.onLimiter = false;
    this.shiftFor = 0;
    this.grinding = 0;         // how long the box has been complaining
    this.downforce = 0;
    this.fuelBurn = 0;         // kg/s, this instant
    for (const w of this.wheels) {
      w.load = 0; w.slip = 0; w.ratio = 0; w.spin = 0; w.fx = 0; w.fy = 0;
      w.angle = 0; w.locked = false; w.scrub = 0; w.travel = 0;
    }
  }

  get forwardSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get lateralSpeed() { return this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get kph() { return this.speed * 3.6; }
  get mph() { return this.speed * 2.23694; }
  /** total mass, fuel included - it changes by three per cent over a run */
  get mass() { return this.T.mass + this.fuel; }

  get slipAngle() {
    if (this.speed < 1.2) return 0;
    return Math.atan2(this.lateralSpeed, this.forwardSpeed) * 180 / Math.PI;
  }

  /**
   * The body position of a wheel, in metres: [forward, left].
   *
   * THIS MOVES WITH THE FUEL LOAD. 52 kg sitting 1.25 m behind the centre
   * of mass drags the whole centre of mass 41 mm back, which turns a 52.0%
   * front car into a 50.5% one. Nothing else in this file needs to know
   * about fuel: the wheels simply find themselves in different places.
   */
  wheelPos(k) {
    const T = this.T;
    const shift = this.fuel * -T.fuelAt / (T.mass + this.fuel);   // CG moves back by this
    const b = T.wheelbase * T.weightFront - shift;                // CG to rear axle
    const a = T.wheelbase - b;                                    // CG to front axle
    return [IS_FRONT[k] ? a : -b, (IS_LEFT[k] ? 1 : -1) * T.trackWidth / 2];
  }

  /** the static weight on each corner, wedge included - the crew's scale pad reading */
  cornerWeights() {
    const T = this.T, W = this.mass * 9.81;
    const shift = this.fuel * -T.fuelAt / (T.mass + this.fuel);
    const wF = (T.wheelbase * T.weightFront - shift) / T.wheelbase;
    const wedge = this.setup.wedge * T.wedgePerRound;
    // wedge loads the LEFT REAR / RIGHT FRONT diagonal and unloads the other
    return [
      W * wF / 2 + wedge, W * wF / 2 - wedge,
      W * (1 - wF) / 2 - wedge, W * (1 - wF) / 2 + wedge,
    ];
  }

  /** how hard this tyre is being asked to work, 0..1+, for smoke and squeal */
  wheelSlip(k) { return this.wheels[k].scrub; }

  /**
   * One frame.
   *
   * The same reason as APEX: a 96 kN/m spring and a wheel with 4.2 kg m^2
   * of inertia both have dynamics far faster than 60 Hz, and integrating
   * them at frame rate puts negative loads on tyres and makes the car brake
   * itself in the middle of accelerating. Four passes per frame, 240 Hz.
   */
  step(dt, i) {
    const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 240))));
    const h = dt / n;
    for (let k = 0; k < n; k++) this.substep(h, i, k === 0);
    // fuel is burned ONCE PER FRAME, on the frame's own dt. Doing it inside
    // the substep loop made the consumption depend on how many substeps the
    // frame happened to be cut into, which is exactly the kind of thing that
    // makes a fuel window move when the frame rate does.
    this.fuel = Math.max(0, this.fuel - this.fuelBurn * dt);
  }

  substep(dt, i, first) {
    const T = this.T;
    const g = 9.81;
    const u = this.forwardSpeed;
    const v = this.lateralSpeed;
    const r = this.yawRate;
    const M = this.mass;

    // ---- STEERING --------------------------------------------------------
    // The lock comes down with speed, but far less than a formula car's:
    // this car is CAUGHT with the wheel, and a slide at 250 km/h needs real
    // angle to catch. Big hands, slow hands.
    const spd = this.speed;
    const maxLock = T.steerMax / (1 + Math.max(0, spd - 12) * T.steerSpeedDrop / 10);
    let want = 0;
    if (i.steerLeft) want += 1;
    if (i.steerRight) want -= 1;
    if (typeof i.steer === 'number') want = clamp(i.steer, -1, 1);
    const target = clamp(want, -1, 1) * maxLock;
    const rate = (want === 0 ? T.steerReturn : T.steerRate) * (typeof i.steer === 'number' ? 1.8 : 1) * dt;
    this.steer = clamp(this.steer + clamp(target - this.steer, -rate, rate), -maxLock, maxLock);

    // ---- THE AIR ---------------------------------------------------------
    // Downforce first, because the springs have to carry it. draft.js has
    // already written into this.air what the cars around this one are doing
    // to its drag and to each end of its downforce - that is the whole of
    // the slipstream, and it arrives here as three multipliers.
    const A = this.air, D = this.dmg;
    const dragC = T.drag * A.dragScale + D.drag;
    const df = T.downforce * u * u;
    this.downforce = df;
    const dfF = df * T.aeroBalance / 2 * D.aeroF * A.pushF;
    const dfR = df * (1 - T.aeroBalance) / 2 * D.aeroR * A.pushR;
    const dfAt = [dfF, dfF, dfR, dfR];

    // ---- THE SUSPENSION --------------------------------------------------
    //
    // Three degrees of freedom on four springs, exactly as APEX does it -
    // the body heaves, pitches and rolls, and the load on a tyre is what its
    // spring is pushing with at that instant. On this car it matters more,
    // because there is twice as much mass half again as high on springs two
    // thirds as stiff: this body really does lean, and it takes its time.
    //
    // THE BANKING ENTERS HERE, and this is the single most important thing
    // in the file after the tyre model. On a 31 degree banking:
    //
    //   - gravity no longer presses straight into the road. Only g*cos(31)
    //     of it does, and the other g*sin(31) pulls the car sideways, DOWN
    //     the slope, toward the infield. That sideways pull is help: the
    //     car is being pushed the way it wants to turn.
    //   - and the harder the car corners, the harder the banking pushes
    //     back. The horizontal centripetal acceleration has a component
    //     straight into the road surface, which is REAL LOAD on the tyres,
    //     on top of the weight and the wings.
    //
    // Both are written as one load factor and one lateral acceleration, and
    // together they are why a Cup car goes round Daytona flat out and would
    // be off the road at half the speed if the same corner were flat.
    const bs = this.bank.sin, bc = this.bank.cos;
    const aLeft = spd * r;                                  // horizontal accel toward the infield
    const bankLoad = clamp(bc + clamp(aLeft / g, -1, 4) * bs, 0.35, 4.5);

    const W = M * g;
    const staticLoad = this.cornerWeights();
    const kS = [T.springFront, T.springFront, T.springRear, T.springRear];
    const cS = [T.damperFront, T.damperFront, T.damperRear, T.damperRear];

    let Fz = 0, Mpitch = 0, Mroll = 0;
    const loads = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const [xi, yi] = this.wheelPos(k);
      const dz = this.heave + xi * this.pitch - yi * this.roll;
      const dzdot = this.heaveRate + xi * this.pitchRate - yi * this.rollRate;
      let f = staticLoad[k] * bankLoad + dfAt[k] - kS[k] * dz - cS[k] * dzdot;
      if (dz < -T.travel) f += (-T.travel - dz) * kS[k] * 10;
      loads[k] = Math.max(0, f);
      Fz += f;
      Mpitch += xi * f;
      Mroll += -yi * f;
    }
    // the bars, fighting the difference across each axle and nothing else.
    // The track bar is a rear-only stiffness change, which is why turning it
    // moves the balance without changing how the car rides a bump.
    const barK = 1 + this.setup.bar * T.barPerTurn;
    Mroll -= (this.roll * T.arbFront + this.roll * T.arbRear * barK) * T.trackWidth / 2;

    // the body's own weight (only the part pressing INTO the road) and the
    // moments the tyres put into it from a cgHeight below the centre of mass
    Fz -= W * bankLoad + (dfF + dfR) * 2;
    Mpitch += this.lonG * g * M * T.cgHeight;
    Mroll -= this.latG * g * M * T.cgHeight;

    this.heaveRate += (Fz / M) * dt;
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

    // ---- THE GEARBOX -----------------------------------------------------
    //
    // An H-pattern four-speed with a clutch pedal, and it is deliberately
    // not forgiving: the drive is gone for a third of a second on every
    // change, and a change made without the clutch takes longer and grinds.
    const throttleNow = clamp(i.throttle || 0, 0, 1);
    const clutchIn = !!i.clutch;
    if (first) {
      let moved = 0;
      if (i.shiftUp && this.gear < T.gears.length) { this.gear++; moved = 1; }
      if (i.shiftDown && this.gear > -1) { this.gear--; moved = 1; }
      if (moved) {
        this.shiftFor = clutchIn ? T.shiftTime : T.shiftTimeNo;
        if (!clutchIn) this.grinding = 0.25;
      }
    }
    this.shiftFor = Math.max(0, this.shiftFor - dt);
    this.grinding = Math.max(0, this.grinding - dt);
    const shifting = this.shiftFor > 0;

    const ratio = this.gear > 0 ? T.gears[this.gear - 1]
                : this.gear < 0 ? -T.reverse : 0;
    const drive = ratio * T.finalDrive;

    const rearSpin = (this.wheels[RR].spin + this.wheels[RL].spin) / 2;
    const wheelRpm = drive === 0 ? 0 : Math.abs(rearSpin * drive) * 60 / (2 * Math.PI);
    let engage = shifting ? 0 : 1;
    if (clutchIn || this.gear === 0) {
      engage = 0;
      const free = T.idle + (T.redline - T.idle) * throttleNow;
      this.rpm += (free - this.rpm) * Math.min(1, dt * 7);
    } else {
      // A SLIPPING CLUTCH STILL TRANSMITS ITS TORQUE. Slip decides what the
      // revs read, not how much gets through - which is what lets the car
      // pull away from a standstill in first without any special case.
      const slipping = T.idle + (T.redline * 0.55 - T.idle) * Math.max(throttleNow, 0.08);
      if (wheelRpm < slipping) {
        this.rpm += (slipping - this.rpm) * Math.min(1, dt * 8);
      } else {
        this.rpm += (clamp(wheelRpm, T.idle * 0.6, T.limiter) - this.rpm) * Math.min(1, dt * 13);
      }
      // AND IT CAN STALL. Sitting in gear, no clutch, no throttle, not
      // moving: the engine is dragged below idle and dies. The pit road
      // cares about this and nothing else does.
      if (wheelRpm < T.idle * 0.45 && throttleNow < 0.05 && Math.abs(u) < 1.5) this.stalled = true;
    }
    if (this.stalled && (clutchIn || this.gear === 0) && throttleNow > 0.1) this.stalled = false;
    this.rpm = clamp(this.rpm, this.stalled ? 0 : T.idle * 0.85, T.limiter);

    // A big naturally aspirated V8: a broad hill of torque with its top
    // around 6200 rpm, still pulling hard at the redline because the
    // camshaft was chosen for the top end.
    const rr = this.rpm / T.torqueAt;
    let curve = clamp(1 - 0.30 * (rr - 1) * (rr - 1) - 0.06 * Math.max(0, rr - 1), 0.34, 1);
    if (this.rpm < T.idle * 1.2) curve *= 0.55;          // it is not making 660 Nm at idle
    this.onLimiter = this.rpm >= T.redline;
    if (this.onLimiter) curve *= 0.22;                   // the rev limiter, banging
    if (this.stalled) curve = 0;
    // OUT OF FUEL. The last half kilo is a stutter, not a switch - the
    // engine picks up and dies and picks up again as the pickup uncovers,
    // which is what running the tank dry on the last lap actually looks like.
    if (this.fuel <= 0) curve = 0;
    else if (this.fuel < 0.5) curve *= (Math.sin(this.rpm * 0.02) > 0 ? 1 : 0.15);

    const engineNm = throttleNow * T.torque * curve;
    // Engine braking, opposing whichever way the driveline is turning. A big
    // V8 on a closed throttle is a rear-axle brake and it is a big one -
    // lifting in the middle of a corner in a stock car is how you get loose,
    // and that is not a bug, it is the point.
    const dragNm = (1 - throttleNow) * T.engineDrag * (this.rpm / 1000) * 20
                 * Math.tanh(rearSpin * drive * 0.4);
    const axleNm = (engineNm - dragNm) * engage * drive * T.driveline;
    this.fuelBurn = Math.max(0, engineNm * this.rpm * (2 * Math.PI / 60) * T.fuelPerJoule);

    // ---- THE DIFFERENTIAL ------------------------------------------------
    // Very nearly a spool. Both rear wheels want to turn at the same speed,
    // so the inside rear is always being dragged faster than the road is
    // going past it, which is a large part of why this car will not turn on
    // the throttle and will slide the back out when you insist.
    const spinDiff = this.wheels[RR].spin - this.wheels[RL].spin;
    const lockNm = -spinDiff * T.diffLock * 480;
    const driveNm = [0, 0, axleNm / 2 + lockNm, axleNm / 2 - lockNm];

    // ---- BRAKES ----------------------------------------------------------
    const bt = (typeof i.brake === 'number' ? clamp(i.brake, 0, 1) : i.brake ? 1 : 0) * T.brakeTorque;
    const brakeNm = [
      bt * T.brakeBias / 2, bt * T.brakeBias / 2,
      bt * (1 - T.brakeBias) / 2, bt * (1 - T.brakeBias) / 2,
    ];

    // ---- EVERY WHEEL, ONE AT A TIME --------------------------------------
    let Fx = 0, Fy = 0, Mz = 0;
    const baseMu = [T.gripFront, T.gripFront, T.gripRear, T.gripRear];
    const stiff = [T.stiffFront, T.stiffFront, T.stiffRear, T.stiffRear];
    const TY = TYRES[this.compound] || TYRES.sticker;

    for (let k = 0; k < 4; k++) {
      const w = this.wheels[k];
      const [xi, yi] = this.wheelPos(k);
      const d = IS_FRONT[k] ? this.steer + D.pull : 0;

      const wu = u - r * yi;
      const wv = v + r * xi;
      const cs = Math.cos(d), sn = Math.sin(d);
      const vlon = wu * cs + wv * sn;
      const vlat = -wu * sn + wv * cs;

      // TYRE LOAD SENSITIVITY, and on this car it is doing two jobs. It keeps
      // the downforce honest the way it does in APEX - but it is ALSO the
      // whole mechanism of wedge and of weight transfer. A tyre carrying
      // 1.4 times its design load does not make 1.4 times the grip, so
      // moving load from the inside of the car to the outside LOSES grip
      // overall, and moving it diagonally moves the balance. None of that
      // works without this line.
      const ref = staticLoad[k];
      const surf = i.grip === undefined ? 1 : Array.isArray(i.grip) ? i.grip[k] : i.grip;
      const mu = baseMu[k] * clamp(1 - T.loadSens * (w.load / ref - 1), 0.50, 1.30) * surf * w.tyreGrip * D.grip[k];

      const refSpd = Math.max(Math.abs(vlon), 3.0);
      const ratioK = clamp((w.spin * T.wheelRadius - vlon) / refSpd, -2.5, 2.5);
      w.ratio = ratioK;
      const alpha = Math.atan2(vlat, Math.max(Math.abs(vlon), 0.8));
      w.slip = alpha;

      const cap = mu * w.load;
      let fLon = pacejka(ratioK, T.stiffLong, T.shape, mu, T.falloff) * w.load;
      let fLat = -pacejka(alpha, stiff[k], T.shape, mu, T.falloff) * w.load;

      // one contact patch, one budget: the friction ellipse
      const demand = Math.hypot(fLon, fLat);
      if (demand > cap && cap > 1) {
        const sc = cap / demand;
        fLon *= sc; fLat *= sc;
      }
      w.fx = fLon; w.fy = fLat;
      w.scrub = cap > 1 ? clamp(demand / cap, 0, 2) : 0;

      // ---- TEMPERATURE AND WEAR ------------------------------------------
      // Heat from sliding work and from flexing under load; wear from the
      // same sliding work, and faster when the rubber is too hot. On a
      // left-hand oval the right-hand tyres carry the load for every second
      // of every lap, so they cook and they go off first - which is the
      // whole shape of a green-flag run and is not scripted anywhere.
      //
      // `rub` is damage.js talking: sheet metal pushed into a tyre by a
      // crash grinds it away many times faster than the road does.
      const lonV = Math.min(Math.abs(w.spin * T.wheelRadius - vlon), 0.8);
      const work = Math.abs(fLat) * Math.abs(vlat) + Math.abs(fLon) * lonV;
      const heat = Math.min(work, 90000) * 0.000075 + w.load * Math.abs(vlon) * 0.0000085;
      const cool = (w.temp - this.trackTemp) * (0.035 + Math.abs(vlon) * 0.0013);
      w.temp += (heat - cool) * dt;
      const hot = Math.max(0, w.temp - TY.opt - TY.win) / 22;
      const rub = D.rub[k] || 0;
      w.wear = Math.max(0, w.wear - (
          (Math.min(work, 60000) * 4.5e-9 + w.load * Math.abs(vlon) * 1.0e-10) * (1 + hot * 2.5)
          + rub * Math.abs(vlon) * 4.0e-4
        ) * (130 / TY.life) * dt);
      // what the rubber gives: a parabola round its working temperature, a
      // long slow fade as it wears and a cliff when the cords show
      const tOff = (w.temp - TY.opt) / TY.win;
      const tempF = 1 - 0.13 * Math.min(1.6, tOff * tOff);
      const wearF = 0.82 + 0.18 * Math.sqrt(w.wear) - (w.wear < 0.10 ? (0.10 - w.wear) * 2.2 : 0);
      w.tyreGrip = TY.grip * tempF * wearF;

      // ---- A CORNER ON THE GROUND ----------------------------------------
      if (D.scrape[k] > 0) {
        const wspd = Math.hypot(wu, wv);
        if (wspd > 0.05) {
          const f = D.scrape[k] * Math.max(w.load, staticLoad[k] * 0.6) / Math.max(wspd, 1.5);
          Fx -= wu * f; Fy -= wv * f;
          Mz += xi * (-wv * f) - yi * (-wu * f);
        }
      }

      // ---- the wheel's own spin -------------------------------------------
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
      if (this.gear !== 0 && !clutchIn && !shifting && drive !== 0) {
        const maxSpin = (T.limiter * 2 * Math.PI / 60) / Math.abs(drive);
        w.spin = clamp(w.spin, -maxSpin, maxSpin);
      }
      w.angle += w.spin * dt;

      const bfx = fLon * cs - fLat * sn;
      const bfy = fLon * sn + fLat * cs;
      Fx += bfx; Fy += bfy;
      Mz += xi * bfy - yi * bfx;
    }

    // ---- GRAVITY DOWN THE BANKING ----------------------------------------
    // The other half of what the bank does. The road rises to the car's
    // right, so the component of its own weight that is not pressing into
    // the road is pulling it DOWN THE SLOPE - toward the infield, the way it
    // is already trying to go. At Daytona that is 5.05 m/s^2 of free
    // cornering before the tyres are asked for anything at all.
    //
    // The direction comes from world.js already resolved into this car's
    // frame, because gravity does not turn with a car that has spun: a car
    // sitting sideways on the banking should be dragged toward the infield,
    // not toward its own left door.
    Fx += M * g * bs * this.bank.dirF;
    Fy += M * g * bs * this.bank.dirL;

    // ---- STABILITY ASSIST (which the menu can switch off) -----------------
    // Twelve degrees before it stirs. A stock car spends its life at six or
    // eight and the driver is supposed to be holding it there.
    const assist = i.assist === undefined ? 1 : i.assist;
    const beta = Math.atan2(v, Math.max(Math.abs(u), 1));
    const excess = Math.abs(beta) * 180 / Math.PI - T.escSlip;
    if (assist > 0 && excess > 0 && this.speed > 5) {
      const fade = clamp((this.speed - 5) / 4, 0, 1);
      Mz += sign(beta) * Math.min(excess * (Math.PI / 180) * T.escNm, T.escMax) * fade * assist;
    }

    // ---- air and ground drag ---------------------------------------------
    Fx -= dragC * u * Math.abs(u);
    Fy -= dragC * 0.8 * v * Math.abs(v);
    if (i.drag) { Fx -= i.drag * M * u; Fy -= i.drag * M * v * 0.5; }

    const accLon = Fx / M;
    const accLat = Fy / M;
    this.lonG = accLon / g;
    this.latG = accLat / g;

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.vx += (accLon * s + accLat * c) * dt;
    this.vz += (accLon * c - accLat * s) * dt;
    // AND THE CAR'S OWN RESISTANCE TO BEING TURNED.
    //
    // Liam: "if lane control is on or off ... it has literally no skid or
    // drifting". With the assist ON he now sees three to five degrees,
    // which is a car that goes where it is pointed. With it OFF the tyre
    // model on its own still gave ten to fourteen, because that is what a
    // stock car does, and the switch is meant to be honest rather than to
    // be the only thing holding the car together.
    //
    // So this is not the nanny. It is damping that is always there, and it
    // is a real thing: a fifteen-hundred kilo car with a wide rear track
    // and a near-locked differential does not change direction quickly,
    // and both rear tyres being tied together fights yaw directly. Sized
    // against tools/spin.mjs - enough to take the assist-off slide to
    // about half what it was, not enough to stop the car rotating when it
    // is asked to.
    Mz -= this.yawRate * T.yawDamp;
    this.yawRate += (Mz / T.inertia) * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yaw += this.yawRate * dt;

    // ---- a car that is stopped is stopped ---------------------------------
    const crawling = this.speed < 0.8 && Math.abs(this.yawRate) < 0.4;
    if (crawling && !throttleNow) {
      const kk = Math.exp(-dt * 7);
      this.vx *= kk; this.vz *= kk; this.yawRate *= kk;
      if (this.speed < 0.14 && Math.abs(this.yawRate) < 0.07) {
        this.vx = 0; this.vz = 0; this.yawRate = 0;
        for (const w of this.wheels) w.spin = 0;
        this.stopped = true;
      }
    } else this.stopped = false;
  }
}
