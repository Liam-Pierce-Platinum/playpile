import { contact, orientedBody, projectedRadius } from '../../_shared/vehicle-contact.js';
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
function bodyOf(car) {
  return orientedBody(car.x, car.y, car.h, car.spec.len / 2, car.spec.wid / 2);
}

function carContact(a, b) {
  const reach = (a.spec.len + a.spec.wid + b.spec.len + b.spec.wid) / 2;
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) return null;
  return contact(bodyOf(a), bodyOf(b));
}

export function carCollide(a, b) {
  const hit = carContact(a, b);
  if (!hit) return 0;
  const nx = -hit.nx, ny = -hit.ny, minOv = hit.depth;

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
  a.vx += nx * into * share * bounce; a.vy += ny * into * share * bounce;
  b.vx -= nx * into * (1 - share) * bounce; b.vy -= ny * into * (1 - share) * bounce;
  if (force > 2 && !soft) { a.crashT = Math.min(1, force / 20); b.crashT = a.crashT; }
  return force;
}

// Same separating-axis test, without the response - so the game can ask
// "are these two actually touching?" using the real body, not a bubble.
export function carsTouching(a, b) {
  return Boolean(carContact(a, b));
}

export function resolveCarCollisions(cars, onImpact) {
  let worst = 0;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const force = carCollide(cars[i], cars[j]);
      if (force > 0 && onImpact) onImpact(cars[i], cars[j], force);
      worst = Math.max(worst, force);
    }
  }
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
  const dx = p.x - b.x, dy = p.y - b.y;
  const reach = (b.w + b.d + p.spec.len + p.spec.wid) / 2;
  if (Math.abs(dx) > reach || Math.abs(dy) > reach) return 0;
  const wall = orientedBody(b.x, b.y, b.ang, b.w / 2, b.d / 2);
  const car = bodyOf(p);
  const hit = contact(car, wall);
  if (!hit) return 0;
  if (mouthOk && b.garage) {
    const u = dx * wall.forward.x + dy * wall.forward.y;
    const v = dx * wall.side.x + dy * wall.side.y;
    const onFace = b.doorSide === 'v-' ? v < 0 : v > 0;
    if (onFace && Math.abs(u) + projectedRadius(car, wall.forward) <= b.mouth / 2) return 0;
  }
  p.x += hit.nx * hit.depth; p.y += hit.ny * hit.depth;
  const closing = -(p.vx * hit.nx + p.vy * hit.ny);
  if (closing <= 0) return 0;
  p.vx += closing * hit.nx; p.vy += closing * hit.ny;
  p.speed = p.vx * car.forward.x + p.vy * car.forward.y;
  return closing > 4 ? closing : 0;
}
