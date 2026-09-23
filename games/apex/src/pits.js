// =====================================================================
// APEX :: pits.js - BOX, BOX
// =====================================================================
//
// Liam: "add in pit stops and stuff and choosing of the tires", then
// "make pit stops physical and a 360 animation that shows the people
// fixing the car".
//
// PHYSICAL. You drive in yourself. The pit road leaves the track before
// the line (track.js `pit` fits it to each circuit's start straight), the lane is walled off from the track
// and from the garages, a white line on either end marks the 80 km/h zone
// where a limiter cuts the power - and going over it is a five-second
// penalty in a race. You stop in YOUR box, the one painted in your colour,
// and only a car stopped in its own box gets served.
//
// A stop is a small state machine per car:
//
//   called    asked for on the radio (P, or a robot deciding). The crew
//             come out to the box. For you it is optional - driving into
//             the pit road is what counts.
//   in        on the pit road, heading for the box
//   service   stopped in the box. The crew work to a timeline (crew.js
//             draws it): jacks up, wheel guns, old tyres off, new ones on,
//             a new wing if one is broken, jacks down, lollipop up.
//   out       released; control is yours, still under the limiter, until
//             the exit road rejoins the track
//
// The robots use the same road, walls and box - they are steered down the
// middle of it by the pure-pursuit below instead of by a person.
import { TYRES } from './car.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export const PIT = {
  limit: 80 / 3.6,        // m/s
  // the jobs, in seconds. Tyres include the jacks going up and down.
  jobs: { jacks: 0.35, tyres: 2.3, fwing: 5.0, endplate: 1.6, rwing: 7.0, wheel: 1.5, drop: 0.55 },
};

export class PitStop {
  constructor(runner, slot) {
    this.r = runner;
    this.slot = slot;
    this.auto = !runner.isPlayer;
    this.phase = 'none';
    this.compound = null;
    this.stops = 0;
    this.limiter = false;
    this.speeding = false;
    this.t = 0; this.total = 0; this.plan = null;
    this.lift = 0;
  }

  get active() { return this.phase !== 'none'; }
  get driving() { return this.phase === 'in' || this.phase === 'service' || this.phase === 'out'; }

  /** ask for a stop; asking again before reaching the pit road cancels it */
  call(compound) {
    if (this.phase === 'none') { this.phase = 'called'; this.compound = compound; return true; }
    if (this.phase === 'called') { this.phase = 'none'; return false; }
    if (compound) this.compound = compound;
    return true;
  }

  /** metres from the line of this car's box: spread down the garages */
  get boxAt() { const P = this.r.track.pit; return P.boxFirst + this.slot * P.boxGap; }

  /** where the box is in the world */
  boxPose() { return this.r.track.pit.boxPose(this.boxAt); }

  /** metres from the line, negative before it */
  rel() { return this.r.track.pit.rel(this.r.dist); }

  /** metres from the box, and how far off its line sideways */
  toBox() {
    const P = this.r.track.pit;
    return { along: this.boxAt - this.rel(), across: this.r.lat * P.side - P.box };
  }

  /**
   * One frame. Returns inputs that override the driver's (the crew holding
   * the car, or a robot being steered down the lane), or null.
   */
  step(dt, done) {
    const r = this.r, car = r.car, tr = r.track, P = tr.pit;
    const d = this.rel();
    this.limiter = r.inPit && d >= P.wallFrom && d <= P.wallTo;

    // ---- the pit lane speed limit ---------------------------------------------
    if (this.limiter && car.forwardSpeed > PIT.limit + 2.2 && !this.speeding && this.phase !== 'service') {
      this.speeding = true;
      done && done('speeding');
    }
    if (!r.inPit) this.speeding = false;

    // ---- entering ----------------------------------------------------------------
    if (this.phase === 'none' || this.phase === 'called') {
      if (this.auto && this.phase !== 'called') return null;
      if (r.inPit && d > P.from && d < this.boxAt - 4 && car.forwardSpeed > 0.5) {
        this.phase = 'in';
        if (!this.compound) this.compound = car.compound;
        done && done('entered');
      } else if (!this.auto) {
        return null;
      } else if (d > P.from - 60 && d < P.wallFrom) {
        // a robot that has called: pull onto the pit road
        this.phase = 'in';
        done && done('entered');
      } else return null;
    }

    if (this.phase === 'in') {
      const b = this.toBox();
      // left the pit road again without stopping (drove back out onto the track)
      if (!r.inPit && d > P.wallFrom + 5) { this.phase = 'none'; return null; }
      // drove past the box: a drive-through, no service
      if (b.along < -8) { this.phase = 'out'; return this.auto ? this.drive(dt, d) : null; }
      if (Math.abs(b.along) < 2.2 && Math.abs(b.across) < 1.6 && car.speed < 0.9) {
        this.begin();
        done && done('stopped');
        return this.hold();
      }
      return this.auto ? this.drive(dt, d) : null;
    }

    if (this.phase === 'service') {
      this.t += dt;
      const J = PIT.jobs;
      // the jacks lift the car, and put it down again at the end
      this.lift = 0.075 * smooth(this.t / J.jacks) * (1 - smooth((this.t - (this.total - J.drop)) / 0.3));
      if (!this.tyresOn && this.t >= this.plan.tyres[1] * 0.72) {
        // the new rubber is on the car from the moment it is bolted on
        car.fitTyres(this.compound || car.compound, 85);
        const dm = r.damage;
        dm.tyre = ['ok', 'ok', 'ok', 'ok']; dm.hp = [1, 1, 1, 1]; dm.flatRun = [0, 0, 0, 0]; dm.apply();
        this.tyresOn = true;
      }
      if (this.t >= this.total) {
        r.damage.mend();
        this.stops++;
        this.phase = 'out';
        this.lift = 0;
        done && done('released');
      }
      return this.hold();
    }

    if (this.phase === 'out') {
      if (d > P.to || (!r.inPit && d > P.wallTo)) {
        this.phase = 'none';
        this.compound = null;
        done && done('rejoined');
        return null;
      }
      return this.auto ? this.drive(dt, d) : null;
    }
    return null;
  }

  /** the crew have the car: brakes on, nothing else */
  hold() {
    const car = this.r.car;
    car.vx *= 0.5; car.vz *= 0.5; car.yawRate *= 0.5;
    return { throttle: 0, brake: true, steer: 0, clutch: false, drs: false, shiftUp: false, shiftDown: false };
  }

  /** stopped in the box: work out the jobs and how long each takes */
  begin() {
    const r = this.r, car = r.car, dm = r.damage, J = PIT.jobs;
    car.vx = 0; car.vz = 0; car.yawRate = 0;
    const tyresEnd = J.jacks + J.tyres + dm.tyre.filter((t) => t === 'off').length * J.wheel;
    const plan = {
      tyres: [J.jacks, tyresEnd],
      fwing: !dm.parts.fwing ? [J.jacks, J.jacks + J.fwing] : (!dm.parts.epL || !dm.parts.epR) ? [J.jacks, J.jacks + J.endplate] : null,
      rwing: !dm.parts.rwing ? [J.jacks, J.jacks + J.rwing] : null,
      wheelsOff: dm.tyre.map((t) => t === 'off'),
      pose: { x: car.x, z: car.z, yaw: car.yaw, y: r.y },
    };
    const work = Math.max(tyresEnd, plan.fwing ? plan.fwing[1] : 0, plan.rwing ? plan.rwing[1] : 0);
    this.plan = plan;
    this.t = 0;
    this.total = work + J.drop + Math.random() * 0.25;
    this.serviceTime = this.total;
    this.tyresOn = false;
    this.phase = 'service';
  }

  /** a robot on the pit road: down the middle of it, into its box, and out */
  drive(dt, d) {
    const r = this.r, car = r.car, tr = r.track, P = tr.pit;
    let target;
    const b = this.boxAt - d;
    if (this.phase === 'in') {
      // brake so as to be at the limit by the white line, then to stop at the box
      target = d < P.wallFrom ? Math.sqrt(PIT.limit ** 2 + 2 * 26 * Math.max(0, P.wallFrom - 15 - d)) : PIT.limit - 0.5;
      target = Math.min(target, Math.sqrt(2 * 6 * Math.max(0, b)) + 0.25);
    } else {
      target = d < P.wallTo ? PIT.limit - 0.5 : 75;
    }
    // QUEUE, don't ram. When the weather turns, half the field comes in on
    // the same lap: follow whoever is ahead on the pit road, braking for
    // them the way a car brakes, and wait behind a car pulling into its box.
    const fw = [Math.sin(car.yaw), Math.cos(car.yaw)], lf = [Math.cos(car.yaw), -Math.sin(car.yaw)];
    for (const o of this.others || []) {
      if (o === r || o.out) continue;
      const ox = o.car.x - car.x, oz = o.car.z - car.z;
      const ahead = ox * fw[0] + oz * fw[1], side = ox * lf[0] + oz * lf[1];
      if (ahead < 0.5 || ahead > 60 || Math.abs(side) > 2.3 || Math.abs(o.y - r.y) > 2) continue;
      target = Math.min(target, Math.max(0, o.car.forwardSpeed) + Math.sqrt(2 * 7 * Math.max(0, ahead - 7.5)));
    }
    // the line to follow: the pit road's middle, stepping across into the
    // working lane for the box and back out of it
    const offAt = (x) => {
      let o = P.centre(x);
      if (o === null) o = tr.halfWidth - 3;
      const bx = this.boxAt;
      const into = this.phase === 'in' ? smooth(1 - (bx - x) / 30) * (x < bx + 6 ? 1 : 0) : (x < bx + 30 ? 1 - smooth((x - bx) / 30) : 0);
      if (this.phase === 'in' && x >= bx - 0.5) return P.box;
      return o + (P.box - P.fast) * into;
    };
    const look = clamp(5 + car.speed * 0.45, 6, 30);
    const j = tr.index(r.dist + look), p = tr.points[j];
    const lj = [Math.cos(p.h), -Math.sin(p.h)];
    const off = offAt(d + look) * P.side;
    const ax = p.x + lj[0] * off, az = p.z + lj[1] * off;
    const fwd = [Math.sin(car.yaw), Math.cos(car.yaw)], left = [Math.cos(car.yaw), -Math.sin(car.yaw)];
    const dx = ax - car.x, dz = az - car.z;
    const aLeft = dx * left[0] + dz * left[1], aFwd = dx * fwd[0] + dz * fwd[1];
    const Ld = Math.max(4, Math.hypot(aLeft, aFwd));
    const delta = Math.atan2(2 * car.T.wheelbase * aLeft / (Ld * Ld), 1);
    const maxLock = car.T.steerMax / (1 + Math.max(0, car.speed - 10) * car.T.steerSpeedDrop / 10);
    const steer = clamp(delta / maxLock - car.yawRate * 0.05, -1, 1);
    const err = target - car.speed;
    let throttle = clamp(err * 0.5 + 0.15, 0, 1);
    const brake = err < -0.6 ? clamp(-err * 0.22, 0.15, 1) : 0;
    if (brake) throttle = 0;
    let shiftUp = false, shiftDown = false;
    if (car.gear < 1) shiftUp = true;
    else if (car.rpm > 13500 && car.gear < 8 && !car.shiftFor) shiftUp = true;
    else if (car.rpm < 8000 && car.gear > 1 && !car.shiftFor) shiftDown = true;
    return { throttle, brake, steer, shiftUp, shiftDown, clutch: false, drs: false };
  }
}

/** the tyre a sensible team would fit for this much water and this many laps to go */
export function chooseTyre(water, lapsLeft, lapKm) {
  if (water > 0.55) return 'wet';
  if (water > 0.18) return 'inter';
  const km = lapsLeft * lapKm;
  // racing in traffic wears a tyre faster than its rated life
  if (km < TYRES.soft.life * 0.55) return 'soft';
  if (km < TYRES.medium.life * 0.55) return 'medium';
  return 'hard';
}

/** is this tyre wrong for the conditions? */
export function wrongTyre(compound, water) {
  if (compound === 'wet') return water < 0.35;
  if (compound === 'inter') return water < 0.06 || water > 0.72;
  return water > 0.3;
}
