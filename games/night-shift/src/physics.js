// ===================== HIGHWAY :: THE CAR =====================
// Deliberately simple. There is no slip, no drift, nothing that slides. The
// car points down the road and steering moves it ACROSS the road - which is
// the only thing you actually do in a traffic game, so it is the only thing
// the model does.
//
//   heading = direction of the road + steerAngle
//
// steerAngle eases toward your input and its ceiling shrinks with speed, so a
// lane change is a flick at 60 and a commitment at 220. Lateral speed is just
// speed x sin(steerAngle), which means threading a gap is about picking the
// moment, never about wrestling the car.

const G = 9.81;

export const SURFACE = {
  road:   { grip: 1.00, roll: 1.00 },
  paint:  { grip: 0.98, roll: 1.00 },
  rumble: { grip: 0.90, roll: 2.20 },
  dirt:   { grip: 0.70, roll: 4.20 },
};

export class Car {
  constructor(spec, x, y, heading) {
    this.spec = spec;
    this.x = x; this.y = y;
    this.h = heading || 0;
    this.steerAngle = 0;
    this.vx = 0; this.vy = 0;
    this.speed = 0;
    this.steer = 0;                 // road-wheel angle, for drawing the wheels
    this.wheelSpin = 0;
    this.slipRatio = 0;             // how lit up the tyres look
    this.surface = 'road';
    this.gear = 1; this.rpm = 1200;
    this.crashT = 0;
    this.lastImpact = 0;
    this.wrecked = false;
    this.brakeRamp = 0;
    this.setSpec(spec);
  }

  setSpec(spec) {
    this.spec = spec;
    // Grip only decides how quickly you can change lanes, not whether you slide.
    this.agility = 1 + (spec.gripF - 1.0) * 0.6 - (spec.mass - 1200) / 6000;
    this.agility = clamp(this.agility, 0.72, 1.35);
  }

  get kph() { return this.speed * 3.6; }
  // Kept so the smoke and skid code has something to read.
  get slipAngle() { return this.steerAngle; }

  update(dt, ctrl, surfName) {
    const sp = this.spec;
    const surf = SURFACE[surfName] || SURFACE.road;
    this.surface = surfName;

    const throttle = ctrl.throttle || 0;
    const brake = ctrl.brake || 0;
    let speed = this.speed;

    // ---------------- speed ----------------
    let drive = (sp.power * 1000) / Math.max(speed, 7.5) * throttle;
    drive = Math.min(drive, sp.mass * 10.5);
    if (speed > sp.topSpeed / 3.6) drive = 0;

    // Brakes bite hard and quickly. 1.05 g was technically fine and felt like
    // nothing at 160 km/h, and the BRAKES tune slider was not wired to anything
    // at all. Peak is now ~1.35 g, scaled by the tune, and there is a short
    // ramp so a stab of the pedal does something immediately.
    this.brakeRamp = brake > 0
      ? Math.min(1, this.brakeRamp + dt * 9)
      : Math.max(0, this.brakeRamp - dt * 14);
    const brakeG = 13.2 * (sp.brakeMul || 1);
    const braking = brake > 0 ? brake * this.brakeRamp * sp.mass * brakeG * surf.grip : 0;
    const drag = 0.58 * (1 + sp.downforce * 0.55) * speed * speed;
    const roll = sp.mass * 0.014 * G * surf.roll * Math.min(1, speed / 2.5);

    speed += ((drive - braking - drag - roll) / sp.mass) * dt;
    if (speed < 0) speed = 0;

    // ---------------- steering across the road ----------------
    // The ceiling on the angle falls with speed. At 60 km/h you can throw it
    // across three lanes; at 220 you are placing the car a foot at a time.
    const maxA = clamp(0.62 - speed * 0.0072, 0.135, 0.62) * this.agility * surf.grip;
    const want = clamp(ctrl.steer || 0, -1, 1) * maxA;
    const rate = 7.5 * this.agility;
    this.steerAngle += clamp(want - this.steerAngle, -rate * dt, rate * dt);
    // settle back to straight when you let go
    if (!ctrl.steer) this.steerAngle *= Math.pow(0.02, dt);
    this.steer = this.steerAngle * 0.9;

    const roadDir = ctrl.roadDir !== undefined ? ctrl.roadDir : this.h - this.steerAngle;
    this.h = roadDir + this.steerAngle;

    // ---------------- integrate ----------------
    this.speed = speed;
    this.vx = Math.cos(this.h) * speed;
    this.vy = Math.sin(this.h) * speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ---------------- cosmetics ----------------
    const hard = Math.abs(this.steerAngle) / Math.max(0.08, maxA);
    const wantSlip = Math.min(1, hard * 0.55 + (brake > 0.6 && speed > 22 ? 0.5 : 0));
    this.slipRatio += (wantSlip - this.slipRatio) * Math.min(1, dt * 8);

    const wr = Math.max(0.29, sp.len * 0.072);
    this.wheelSpin += (speed / wr) * dt;
    this.crashT = Math.max(0, this.crashT - dt);

    const kph = speed * 3.6;
    const ratios = [0, 52, 92, 138, 186, 236, 999];
    let g = 1;
    for (let i = 1; i < ratios.length - 1; i++) if (kph > ratios[i]) g = i + 1;
    this.gear = Math.min(6, g);
    const lo = ratios[this.gear - 1], hi = ratios[this.gear];
    this.rpm = 1100 + clamp((kph - lo) / Math.max(1, hi - lo), 0, 1) * 6600;
  }

  // ---------------- free driving, for the city ----------------
  // On a highway the car only ever needed to move ACROSS a known road, so
  // heading was road direction plus a steer angle. A city has right angles, U
  // turns and alleys, so the heading has to be the car's own - it integrates
  // from the steering and nothing tells it where the road went.
  //
  // Still deliberately arcade: the car goes where it points, with a little
  // slide out of the back under power so a hard corner reads as a corner. No
  // slip angles to fight.
  updateFree(dt, ctrl, grip) {
    const sp = this.spec;
    const throttle = ctrl.throttle || 0;
    const brake = ctrl.brake || 0;
    const g = grip === undefined ? 1 : grip;
    let speed = this.speed;

    let drive = (sp.power * 1000) / Math.max(speed, 7.5) * throttle;
    drive = Math.min(drive, sp.mass * 10.5);
    if (speed > sp.topSpeed / 3.6) drive = 0;

    this.brakeRamp = brake > 0
      ? Math.min(1, this.brakeRamp + dt * 9)
      : Math.max(0, this.brakeRamp - dt * 14);
    const braking = brake > 0
      ? brake * this.brakeRamp * sp.mass * 13.2 * (sp.brakeMul || 1) * g : 0;
    const drag = 0.58 * (1 + sp.downforce * 0.55) * speed * speed;
    const roll = sp.mass * 0.014 * 9.81 * (g < 0.8 ? 3.4 : 1) * Math.min(1, speed / 2.5);

    // reverse, because a city puts you nose-first into things you have to back
    // out of, and a chase sim where you cannot reverse is a chase sim you quit
    if (speed < 0.6 && brake > 0.2 && throttle < 0.1) {
      this.rev = Math.min(1, this.rev + dt * 2);
    } else if (throttle > 0.1 || speed > 2) this.rev = 0;
    if (this.rev > 0.5) {
      speed = Math.max(-9, speed - brake * 9 * dt);
    } else {
      speed += ((drive - braking - drag - roll) / sp.mass) * dt;
      if (speed < 0) speed = 0;
    }

    // steering: lock falls off with speed, and the car turns about its middle
    const lock = clamp(0.62 - Math.abs(speed) * 0.0138, 0.15, 0.62) * this.agility * g;
    const want = clamp(ctrl.steer || 0, -1, 1) * lock;
    // eases on, and eases off - the old instant centring made every
    // correction a twitch
    const rate = 3.1 * this.agility;
    this.steerAngle += clamp(want - this.steerAngle, -rate * dt, rate * dt);
    if (!ctrl.steer) this.steerAngle *= Math.pow(0.06, dt);
    this.steer = this.steerAngle * 0.9;

    const turn = (speed / Math.max(2.2, sp.wb)) * Math.sin(this.steerAngle);
    this.h += turn * dt;

    this.speed = speed;
    this.vx = Math.cos(this.h) * speed;
    this.vy = Math.sin(this.h) * speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const hard = Math.abs(this.steerAngle) / Math.max(0.08, lock);
    const wantSlip = Math.min(1, hard * 0.5 * Math.min(1, Math.abs(speed) / 14)
      + (brake > 0.6 && speed > 22 ? 0.5 : 0));
    this.slipRatio += (wantSlip - this.slipRatio) * Math.min(1, dt * 8);
    this.wheelSpin += (speed / Math.max(0.29, sp.len * 0.072)) * dt;
    this.crashT = Math.max(0, this.crashT - dt);

    const kph = Math.abs(speed) * 3.6;
    const ratios = [0, 52, 92, 138, 186, 236, 999];
    let gr = 1;
    for (let i = 1; i < ratios.length - 1; i++) if (kph > ratios[i]) gr = i + 1;
    this.gear = Math.min(6, gr);
    const lo = ratios[this.gear - 1], hi = ratios[this.gear];
    this.rpm = 1100 + clamp((kph - lo) / Math.max(1, hi - lo), 0, 1) * 6600;
  }

  // A hit. Returns the closing speed so the caller can decide how bad it was.
  impact(nx, ny, hardness) {
    const into = this.vx * nx + this.vy * ny;
    if (into >= 0) return 0;
    const force = -into;
    // scrub speed and knock the car off line
    this.speed = Math.max(0, this.speed - force * (0.35 + hardness * 0.45));
    this.steerAngle += (Math.random() - 0.5) * Math.min(0.6, force / 16);
    this.vx -= nx * into * 1.1;
    this.vy -= ny * into * 1.1;
    if (force > 2) {
      this.crashT = Math.min(1, force / 20);
      this.lastImpact = force;
    }
    return force;
  }

  place(x, y, heading) {
    this.x = x; this.y = y;
    this.h = heading;
    this.steerAngle = 0; this.steer = 0;
    this.speed = 0; this.vx = 0; this.vy = 0;
    this.wrecked = false;
  }
}

// ------------------------------------------------------------------
// CAR vs CAR, as ORIENTED BOXES.
//
// This used to be a circle of radius (lenA + lenB) * 0.3. On a 7.6 m box truck
// that is a 3.6 m bubble - far too wide for a 2.35 m vehicle and far too short
// for its length - so you clipped things you had visually missed and drove
// through things you had visually hit. Cars are long and thin; only a box
// works. Separating axis theorem, four axes, two per box.
// ------------------------------------------------------------------
export function carCollide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ahx = a.spec.len * 0.5, ahy = a.spec.wid * 0.5;
  const bhx = b.spec.len * 0.5, bhy = b.spec.wid * 0.5;
  // cheap reject on bounding circles first
  const reach = Math.hypot(ahx, ahy) + Math.hypot(bhx, bhy);
  if (dx * dx + dy * dy > reach * reach) return 0;

  const ca = Math.cos(a.h), sa = Math.sin(a.h);
  const cb = Math.cos(b.h), sb = Math.sin(b.h);
  const aX = [ca, sa], aY = [-sa, ca];
  const bX = [cb, sb], bY = [-sb, cb];

  let minOv = Infinity, nx = 0, ny = 0;
  for (const ax of [aX, aY, bX, bY]) {
    const ra = Math.abs(ahx * (aX[0] * ax[0] + aX[1] * ax[1]))
             + Math.abs(ahy * (aY[0] * ax[0] + aY[1] * ax[1]));
    const rb = Math.abs(bhx * (bX[0] * ax[0] + bX[1] * ax[1]))
             + Math.abs(bhy * (bY[0] * ax[0] + bY[1] * ax[1]));
    const dist = dx * ax[0] + dy * ax[1];
    const ov = ra + rb - Math.abs(dist);
    if (ov <= 0) return 0;                       // a gap on this axis: no hit
    if (ov < minOv) {
      minOv = ov;
      const sgn = dist < 0 ? -1 : 1;
      nx = ax[0] * sgn; ny = ax[1] * sgn;        // points from a toward b
    }
  }

  // A patrol sitting on your bumper touches you constantly. If every one of
  // those taps scrubbed speed the way a real impact does, the pack simply
  // brakes you to walking pace and there is no chase left - measured at 116
  // km/h alone versus 41 with the police on, purely from being nudged.
  // A car marked `gentle` (a following patrol) separates without taking your
  // speed. A PIT clears the flag, so THAT still hurts.
  const soft = a.gentle || b.gentle;
  const scrub = soft ? 0.05 : 0.30;
  const bounce = soft ? 0.15 : 0.6;

  const ma = a.spec.mass, mb = b.spec.mass;
  const share = mb / (ma + mb);
  a.x -= nx * minOv * share; a.y -= ny * minOv * share;
  b.x += nx * minOv * (1 - share); b.y += ny * minOv * (1 - share);

  const into = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (into >= 0) return 0;
  const force = -into;
  a.speed = Math.max(0, a.speed - force * (1 - share) * scrub);
  b.speed = Math.max(0, b.speed - force * share * scrub);
  a.steerAngle += (Math.random() - 0.5) * Math.min(0.5, force / 22);
  b.steerAngle += (Math.random() - 0.5) * Math.min(0.5, force / 22);
  a.vx -= nx * into * (1 - share) * bounce; a.vy -= ny * into * (1 - share) * bounce;
  b.vx += nx * into * share * bounce;       b.vy += ny * into * share * bounce;
  if (force > 2 && !soft) { a.crashT = Math.min(1, force / 20); b.crashT = a.crashT; }
  return force;
}

// Same separating-axis test, without the response - so the game can ask
// "are these two actually touching?" using the real body, not a bubble.
export function carsTouching(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ahx = a.spec.len * 0.5, ahy = a.spec.wid * 0.5;
  const bhx = b.spec.len * 0.5, bhy = b.spec.wid * 0.5;
  const reach = Math.hypot(ahx, ahy) + Math.hypot(bhx, bhy);
  if (dx * dx + dy * dy > reach * reach) return false;
  const ca = Math.cos(a.h), sa = Math.sin(a.h);
  const cb = Math.cos(b.h), sb = Math.sin(b.h);
  const aX = [ca, sa], aY = [-sa, ca], bX = [cb, sb], bY = [-sb, cb];
  for (const ax of [aX, aY, bX, bY]) {
    const ra = Math.abs(ahx * (aX[0] * ax[0] + aX[1] * ax[1]))
             + Math.abs(ahy * (aY[0] * ax[0] + aY[1] * ax[1]));
    const rb = Math.abs(bhx * (bX[0] * ax[0] + bX[1] * ax[1]))
             + Math.abs(bhy * (bY[0] * ax[0] + bY[1] * ax[1]));
    if (ra + rb - Math.abs(dx * ax[0] + dy * ax[1]) <= 0) return false;
  }
  return true;
}

export function resolveCarCollisions(cars) {
  let worst = 0;
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++)
      worst = Math.max(worst, carCollide(cars[i], cars[j]));
  return worst;
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Push a car out of a solid box, returning the speed it was carrying into
// the wall. Shared by the player, the traffic and the police - anything
// that is not allowed to be inside a building.
export function boxOut(b, p, mouthOk) {
  const cs = Math.cos(-b.ang), sn = Math.sin(-b.ang);
  const dx = p.x - b.x, dy = p.y - b.y;
  const u = cs * dx - sn * dy, v = sn * dx + cs * dy;
  const rad = p.spec.len * 0.40;
  const hu = b.w / 2 + rad, hv = b.d / 2 + rad;
  if (Math.abs(u) > hu || Math.abs(v) > hv) return 0;
  if (mouthOk && b.garage) {
    const onFace = (b.doorSide === 'v-' && v < 0) || (b.doorSide === 'v+' && v > 0);
    if (onFace && Math.abs(u) < b.mouth / 2) return 0;
  }
  const ou = hu - Math.abs(u), ov = hv - Math.abs(v);
  let nu = u, nv = v, nx = 0, ny = 0;
  if (ou < ov) { nu = Math.sign(u) * hu; nx = Math.sign(u); }
  else { nv = Math.sign(v) * hv; ny = Math.sign(v); }
  const c2 = Math.cos(b.ang), s2 = Math.sin(b.ang);
  p.x = b.x + c2 * nu - s2 * nv;
  p.y = b.y + s2 * nu + c2 * nv;
  const wx = c2 * nx - s2 * ny, wy = s2 * nx + c2 * ny;
  const into = -(p.vx * wx + p.vy * wy);
  p.speed *= 0.30; p.vx = 0; p.vy = 0;
  return into > 4 ? into : 0;
}