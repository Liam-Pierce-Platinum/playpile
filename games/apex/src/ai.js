// =====================================================================
// APEX :: ai.js - THE OTHER DRIVERS
// =====================================================================
//
// Liam: "there is no competitiveness". A time trial against yourself is
// competition of a kind, but a race needs somebody in it. These drivers
// use the SAME car.js and the same world.js as the player - same grip,
// same engine, same barriers - and nothing is faked: no rubber banding,
// no extra grip, no ghosting through other cars. What makes one faster
// than another is how close to the limit it is willing to drive.
//
// THREE PARTS
//
//   THE RACING LINE. The centre line is the slowest way round - it makes
//   every corner as tight as the track does. The fastest line uses the
//   width: wide on entry, apex on the inside, wide on exit. Smoothing the
//   path's curvature while keeping it inside the kerbs finds very nearly
//   that, and it is a few thousand averages, done once per circuit.
//
//   THE SPEED PLAN. At each point on the line, the fastest the car can
//   corner is where the grip it has (which grows with speed, because of
//   the wings) equals what the corner asks for. Then a backwards pass
//   makes sure it can BRAKE from each point to the next - v² = u² + 2as,
//   with the brakes worth more at speed for the same reason.
//
//   THE DRIVER. Aims at a point on the line a little ahead, holds the
//   speed the plan says, shifts at the top of the rev range, and moves
//   over to pass a slower car.
//
// The numbers the plan is built from are the car's own: tools/bench.mjs
// measures 2.09 g of cornering at 110 km/h and 3.36 g at 250.
const G = 9.81;
const MU0 = 1.78, MU_V = 3.27e-4;          // lateral g = MU0 + MU_V * v²
const BR0 = 2.3, BR_V = 3.0e-4;            // braking g, the same shape

/**
 * The racing line: an offset from the centre line at every sample,
 * smoothed until its curvature is as low as the track width allows.
 */
export function racingLine(points, halfWidth, margin = 1.6) {
  const n = points.length;
  const lim = halfWidth - margin;
  const off = new Float32Array(n);
  const lx = new Float32Array(n), lz = new Float32Array(n);
  for (let i = 0; i < n; i++) { lx[i] = Math.cos(points[i].h); lz[i] = -Math.sin(points[i].h); }
  const px = (i) => points[i].x + lx[i] * off[i];
  const pz = (i) => points[i].z + lz[i] * off[i];
  // THE INSIDE OF A HAIRPIN IS A LIMIT TOO. Hugging the inside kerb of the
  // Grand Hotel hairpin - a 10.5 m radius - is a 7 m circle, and this car
  // on full lock turns a 9 m one; the robots ran wide into the wall there
  // every lap. So the line may only go as far to the inside as leaves a
  // radius the car can actually drive.
  const MIN_R = 12;
  const inLim = new Float32Array(n), outLim = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = points[i].curve, R = 1 / Math.max(1e-6, Math.abs(c));
    const inside = Math.max(-lim, Math.min(lim, R - MIN_R));
    // positive offsets are to the left; the inside of a left turn is left
    if (c > 0) { inLim[i] = -lim; outLim[i] = inside; } else { inLim[i] = -inside; outLim[i] = lim; }
  }
  // coarse to fine: a long reach finds the shape of a whole corner, a
  // short one cleans up the detail without undoing it
  for (const [reach, iters] of [[28, 260], [14, 200], [6, 160], [3, 120]]) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const a = (i - reach + n) % n, b = (i + reach) % n;
        const mx = (px(a) + px(b)) / 2, mz = (pz(a) + pz(b)) / 2;
        const want = (mx - points[i].x) * lx[i] + (mz - points[i].z) * lz[i];
        let o = off[i] + (want - off[i]) * 0.5;
        off[i] = o < inLim[i] ? inLim[i] : o > outLim[i] ? outLim[i] : o;
      }
    }
  }
  // the line's own positions and curvature
  const line = [];
  for (let i = 0; i < n; i++) line.push({ x: px(i), z: pz(i), off: off[i] });
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = line[(i - 5 + n) % n], b = line[i], c = line[(i + 5) % n];
    // curvature from three points: 4 * area / product of the sides
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    b.k = Math.abs(2 * cross) / Math.max(1e-6, ab * bc * ca);
    b.seg = ab / 3;
    total += Math.hypot(line[(i + 1) % n].x - b.x, line[(i + 1) % n].z - b.z);
  }
  // Three-point curvature on a line that has just been clamped against the
  // kerbs spikes wherever the clamp bites, and one spike is a corner the
  // speed plan brakes for that is not there. So it is measured over a 20 m
  // chord and lightly averaged - but only lightly: averaging over 16 m
  // made Monaco's chicanes, which are shorter than that, look half as
  // tight as they are, and the robots arrived far too fast.
  {
    const k = line.map((q) => q.k);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let d = -2; d <= 2; d++) s += k[(i + d + n) % n];
      line[i].k = Math.max(s / 5, k[i] * 0.8);
    }
  }
  return { line, length: total };
}

/** the fastest the car may be going at every point on the line, for a given skill (1 = the limit) */
export function speedPlan(line, skill, narrow = false) {
  const n = line.length;
  // between walls nobody drives at the limit: there is no runoff to be wrong in
  if (narrow) skill *= 0.94;
  const v = new Float32Array(n);
  const VMAX = 97;
  for (let i = 0; i < n; i++) {
    const k = Math.max(1e-5, line[i].k);
    const mu0 = MU0 * skill, muv = MU_V * skill;
    // v²·k = g(mu0 + muv·v²)  ->  v² = g·mu0 / (k - g·muv)
    const den = k - G * muv;
    v[i] = den <= 0 ? VMAX : Math.min(VMAX, Math.sqrt(G * mu0 / den));
  }
  // backwards, twice round so the wrap at the start line is covered
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      const ds = Math.max(0.5, Math.hypot(line[j].x - line[i].x, line[j].z - line[i].z));
      const brake = G * (BR0 + BR_V * v[j] * v[j]) * skill * 0.92;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * ds));
    }
  }
  // what a perfect driver of this plan would do: forwards, limited by how
  // hard the car can actually accelerate - the lap time the plan is worth
  const fwd = Float32Array.from(v);
  let lap = 0;
  for (let pass = 0; pass < 2; pass++) {
    lap = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ds = Math.max(0.5, Math.hypot(line[j].x - line[i].x, line[j].z - line[i].z));
      const acc = Math.max(1.5, 13.5 - 0.115 * fwd[i]);
      fwd[j] = Math.min(v[j], Math.sqrt(fwd[i] * fwd[i] + 2 * acc * ds));
      lap += ds / Math.max(1, (fwd[i] + fwd[j]) / 2);
    }
  }
  v.lapTime = lap;
  return v;
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Driver {
  /**
   * @param runner  the world.js Runner this driver is driving
   * @param plan    { line, speeds } shared by every driver of the same skill
   * @param skill   0.8 .. 1, how close to the limit
   */
  constructor(runner, plan, skill, name) {
    this.r = runner;
    this.plan = plan;
    this.skill = skill;
    this.name = name;
    this.passOff = 0;             // metres of extra lateral offset to go round somebody
    this.defOff = 0;              // ...and to cover somebody coming past
    this.stuckFor = 0;
    this.mistake = 0;
    this.pace = 1;                // how hard he is trying, right now
    this.covering = 0;            // which side he has moved to, -1/0/+1
    this.moveT = 0;               // one move is a defence; four is weaving
  }

  /** decide this frame's inputs */
  think(dt, others, go) {
    const car = this.r.car, tr = this.r.track, { line, speeds } = this.plan;
    const n = line.length;
    const i = this.r.i;
    if (!go) return { throttle: 0, brake: 1, steer: 0 };

    // ---- traffic: anyone just ahead and slower? go round them
    let blocked = false, sideWant = 0, follow = Infinity;
    const fwd = [Math.sin(car.yaw), Math.cos(car.yaw)], left = [Math.cos(car.yaw), -Math.sin(car.yaw)];
    /* ---- WHO IS COMING, AND DOWN WHICH SIDE ------------------------------
       Liam: "strategic combat with cars that adapt to you speed and style
       so the play has one option and that is dodging weaving and juking
       past cars fighting and playing defense".

       Until now these drivers only ever OVERTOOK. Nobody ever looked in a
       mirror, so a faster car went past on whichever side it fancied,
       every time, and the whole of racing-through-a-field was pointing at
       a gap that was always there. Half of racing is the other half. */
    let threat = null, threatLat = 0, threatGap = 99;
    for (const o of others) {
      if (o === this.r || o.out) continue;
      const dx = o.car.x - car.x, dz = o.car.z - car.z;
      const back = -(dx * fwd[0] + dz * fwd[1]);
      const lat = dx * left[0] + dz * left[1];
      if (back < 0.5 || back > 34 || Math.abs(lat) > 7 || Math.abs(o.y - this.r.y) > 2) continue;
      if (o.car.speed < car.speed + 0.4) continue;      // not actually catching
      if (back < threatGap) { threat = o; threatLat = lat; threatGap = back; }
    }
    for (const o of others) {
      if (o === this.r || o.out) continue;
      const dx = o.car.x - car.x, dz = o.car.z - car.z;
      const ahead = dx * fwd[0] + dz * fwd[1], lat = dx * left[0] + dz * left[1];
      // DON'T DRIVE INTO THE BACK OF IT. A car in this car's path is followed:
      // no faster than it is going plus what the gap allows. Before damage
      // existed a nudge up the gearbox cost nothing, and the robots never
      // braked for anyone - the first lap was a pile-up of broken wings.
      // the speed this car could still brake from and stop short of it, if
      // it stopped dead - which a car diving into the pit entry nearly does
      if (ahead > 0.5 && ahead < 150 && Math.abs(lat) < 2.4 && Math.abs(o.y - this.r.y) < 2) {
        const gap = Math.max(0, ahead - 9);
        follow = Math.min(follow, Math.max(0, o.car.forwardSpeed) + Math.min(gap * 0.8, Math.sqrt(2 * 22 * gap)));
      }
      if (ahead < 1 || ahead > 26 || Math.abs(lat) > 3.4 || Math.abs(o.y - this.r.y) > 2) continue;
      if (o.car.speed > car.speed + 1.5) continue;
      blocked = true;
      // pass on whichever side has more room from the racing line
      sideWant = line[i].off > 0 ? -1 : 1;
      if (Math.abs(lat) > 1.5) sideWant = lat > 0 ? -1 : 1;
    }
    const room = tr.halfWidth - 1.4;
    const targetPass = blocked ? sideWant * 3.2 : 0;
    this.passOff += clamp(targetPass - this.passOff, -2.2 * dt, 2.2 * dt);

    /* ---- AND COVERING IT ---------------------------------------------------
       ONE MOVE. A defending driver may move once to cover a line and then
       has to hold it - a car that slides across every time you feint is
       not defending, it is a windscreen wiper, and it makes overtaking
       either impossible or meaningless depending on how fast it is. So
       the side is chosen when the attack starts, held while he is there,
       and only re-chosen once he has gone away and come back.

       HE ALSO LEARNS. style.side is a running average of which side this
       particular attacker keeps coming down, shared across the grid,
       because twenty drivers who each have to be taught the same lesson
       separately is not "they adapt to you", it is twenty goldfish. Go
       down the inside four times and the fifth one is already there. */
    this.moveT = Math.max(0, this.moveT - dt);
    let targetDef = 0;
    if (threat && threatGap < 26) {
      if (!this.covering) {
        const style = threat.style;
        const learned = style && Math.abs(style.side) > 0.35 ? Math.sign(style.side) : 0;
        this.covering = Math.abs(threatLat) > 1.0 ? Math.sign(threatLat) : (learned || (line[i].off > 0 ? -1 : 1));
        this.moveT = 0.9;
      }
      // never cover so hard he leaves the road, and never off the racing
      // line in a corner - defending into a 250 km/h fifth-gear left is
      // how you arrive in the barrier, not how you keep a place
      const corner = Math.min(1, Math.abs(tr.points[i].curve) * 340);
      targetDef = this.covering * 2.7 * (1 - corner * 0.75) * this.skill;
      // and remember what he did, for the next time and for everybody else
      if (threat.style && threatGap < 16) {
        threat.style.side += (Math.sign(threatLat) - threat.style.side) * dt * 0.55;
      }
    } else if (!threat) {
      this.covering = 0;
    }
    this.defOff += clamp(targetDef - this.defOff, -1.5 * dt, 1.5 * dt);

    // ---- where to aim. Closer on a narrow track: at Monaco a far aim
    // point sits round the NEXT corner and the car cuts into the wall of
    // this one to get to it.
    const narrow = tr.halfWidth < 6;
    const look = narrow ? clamp(4 + car.speed * 0.26, 6, 30) : clamp(8 + car.speed * 0.36, 9, 40);
    const j = (i + Math.round(look / tr.spacing)) % n;
    const p = tr.points[j], lj = [Math.cos(p.h), -Math.sin(p.h)];
    const off = clamp(line[j].off + this.passOff + this.defOff, -room, room);
    const ax = p.x + lj[0] * off, az = p.z + lj[1] * off;
    const dx = ax - car.x, dz = az - car.z;
    const aLeft = dx * left[0] + dz * left[1], aFwd = dx * fwd[0] + dz * fwd[1];
    // pure pursuit: the steering angle that puts the car on an arc through the aim point
    const Ld = Math.max(4, Math.hypot(aLeft, aFwd));
    const delta = Math.atan2(2 * car.T.wheelbase * aLeft / (Ld * Ld), 1);
    /* WHAT ONE UNIT OF STEER IS WORTH, and it is no longer the lock.
       car.js now takes `steer` as a fraction of the CORNER the car can
       hold at this speed rather than of the wheel angle, so the pure
       pursuit angle has to be divided by the same thing the car will
       multiply it back by - otherwise every robot on the grid is asking
       for a different amount of steering than it thinks it is, which at
       Monaco is a wall. */
    const maxLock = car.T.steerMax / (1 + Math.max(0, car.speed - 10) * car.T.steerSpeedDrop / 10);
    const vRef = Math.max(car.speed, 11);
    const latCap = car.T.gripRefA + car.T.gripRefB * car.speed * car.speed;
    const ack = ((latCap * 9.81) / vRef) * (car.T.wheelbase / vRef) * car.T.steerGain;
    const usable = Math.max(1e-4, Math.min(maxLock, ack));
    // CROSS-TRACK ERROR. Pure pursuit fixes the heading but not a car that
    // is already five metres wide of where it should be; in Monaco's
    // chicanes it drifted seven metres off the line and into the barrier
    // while pointing exactly where it meant to. So: how far off the line
    // it is now, and how fast that is growing.
    const here = tr.points[i], lh = [Math.cos(here.h), -Math.sin(here.h)];
    const want = clamp(line[i].off + this.passOff + this.defOff, -room, room);
    const eLat = this.r.lat - want;
    const vLat = car.vx * lh[0] + car.vz * lh[1];
    const kc = narrow ? 1.6 : 1;
    let steer = clamp(delta / usable - car.yawRate * 0.04 - (eLat * 0.05 + vLat * 0.025) * kc, -1, 1);

    // ---- how fast: the plan a few metres ahead, less a little if passing
    const k = (i + Math.round(Math.max(4, car.speed * 0.25) / tr.spacing)) % n;
    // THE PLAN IS FOR A NEW TYRE ON A DRY ROAD AND A WHOLE CAR. Grip in the
    // wet, on worn or cold rubber or with a wing missing is less, and the
    // speed a corner can be taken at goes with the square root of grip - so
    // does the speed it can be braked from, so scaling the whole plan keeps
    // it consistent.
    const aero = (car.dmg.aeroF + car.dmg.aeroR) / 2;
    const gripK = Math.sqrt(clamp(car.gripNow, 0.3, 1.06) * (0.62 + 0.38 * aero));

    /* ---- HOW HARD HE IS TRYING ---------------------------------------------
       Liam: "cars that adapt to you speed and style".

       This file used to open by promising no rubber banding, and it meant
       it: the field ran at its own pace and a quick player drove away from
       it in four laps, after which there was nothing left to race. The
       thing being asked for here is not a faster car when you are winning,
       it is a RACE - somebody to fight, for the whole of it.

       So it is bounded, and it is honest about what it does. A driver may
       try between 92% and 100% of what his skill would give him, and that
       is all: he is never given grip, or power, or a shorter track, and he
       can never go faster than the plan says the car can. A long way
       ahead of you and he settles; a long way behind and he stops
       settling. Nobody is dragged up the road on a piece of elastic. */
    const you = others.find((o) => o.isPlayer && !o.out);
    if (you && you !== this.r) {
      const ahead = this.r.progress - you.progress;           // + is in front
      const want = ahead > 0 ? clamp(1 - ahead / 900, 0.92, 1) : clamp(1 + (-ahead) / 1400, 1, 1.0);
      this.pace += clamp(want - this.pace, -0.14 * dt, 0.14 * dt);
    } else if (this.pace !== 1) {
      this.pace += clamp(1 - this.pace, -0.2 * dt, 0.2 * dt);
    }
    let target = Math.min(speeds[i], speeds[k], follow) * (blocked ? 0.985 : 1) * gripK * this.pace;
    if (this.r.offTrack) target = Math.min(target, 30);
    const err = target - car.speed;
    let throttle = clamp(err * 0.45 + 0.2, 0, 1);
    let brake = err < -0.8 ? clamp(-err * 0.18, 0.15, 1) : 0;
    if (brake > 0) throttle = 0;
    // ONE TYRE, ONE BUDGET. The speed plan asks for the most the tyres can
    // give sideways, and full throttle on top of that asks for more than
    // they have - so out of Mirabeau it slid wide into the wall at full
    // lock with its foot flat to the floor. A real driver feeds the power
    // in as the wheel comes back straight, and so does this.
    const busy = Math.max(Math.abs(steer) - 0.8, Math.abs(eLat) * 0.16 - 0.4);
    if (busy > 0 && car.speed > 12) throttle *= clamp(1 - busy * 1.5, 0.4, 1);
    // straight-line wheelspin off the line is the traction control's job,
    // but a robot that floors it at 5 km/h with full lock still spins
    if (car.speed < 12 && Math.abs(steer) > 0.6) throttle = Math.min(throttle, 0.6);

    // ---- gears
    let shiftUp = false, shiftDown = false;
    if (car.gear < 1) shiftUp = true;
    else if (car.rpm > 13900 && car.gear < 8 && !car.shiftFor) shiftUp = true;
    else if (car.rpm < 9200 && car.gear > 1 && !car.shiftFor) shiftDown = true;

    // ---- stuck? (spun into a barrier facing the wrong way) put it back
    if (car.speed < 2.5) this.stuckFor += dt; else this.stuckFor = 0;
    let reset = false;
    const facing = Math.abs(wrap(car.yaw - tr.points[i].h));
    if (this.stuckFor > 3 || (facing > 2.2 && car.speed < 8 && this.stuckFor > 1)) { reset = true; this.stuckFor = 0; }

    return { throttle, brake, steer, shiftUp, shiftDown, reset, drs: false, clutch: false };
  }
}
