// =====================================================================
// NASCAR :: world.js - WHAT HAPPENS TO A CAR BECAUSE OF WHERE IT IS
// =====================================================================
//
// stock.js knows how a car behaves on a flat, endless plane. This is
// everything the speedway does to it on top of that, and it is the SAME
// for the player and for every one of the thirty-nine other cars - which
// is the only way a race against them is a race:
//
//   THE BANKING  the big one. The road is tilted, so only part of the
//                car's weight presses into it and the rest pulls the car
//                down the slope toward the infield; and the harder it
//                corners the harder the banking presses back. Both are
//                resolved here and handed to stock.js as an angle and a
//                direction.
//   SURFACE      each wheel asks the track what it is on. The apron is
//                nearly as quick as the racing surface, which is why
//                cars run the bottom. The infield grass is not.
//   THE WALL     is solid, it is concrete, and it is the outside of every
//                corner. There is no runoff at a speedway; that is the
//                whole reason the racing looks the way it does.
//   PROGRESS     how far round the race a car is - laps plus metres -
//                which is what the running order and the lap times read.
//
// And car against car, which is its own function because it is the only
// thing here that involves two of them - and because on a superspeedway
// cars touch on purpose.
const G = 9.81;
const HALF_WIDTH = 0.98;         // centre to the outside of a wheel
const HALF_LENGTH = 2.55;        // a Cup car is about 5.1 m long

export class Runner {
  /** a car on a speedway: the physics object plus everything the track knows about it */
  constructor(car, track, entry = null) {
    this.car = car;
    this.track = track;
    this.entry = entry;               // number, name, livery - for the HUD
    this.hint = -1;
    this.lap = 0;
    this.dist = 0;
    this.prevDist = 0;
    this.progress = 0;                // lap * length + dist, never wraps
    this.lapStart = 0;
    this.sectors = [0, 0];
    this.lastLap = 0;
    this.fuelPerLap = 0;          // measured, not assumed - see the lap counter
    this.fuelMark = 0;            // fuel in the cell when this lap began
    this.bestLap = 0;
    this.started = false;
    this.out = false;                 // wrecked, parked, or done
    this.outWhy = '';
    this.surface = 'asphalt';
    this.offTrack = false;
    this.hitWall = 0;                 // speed into the last wall, for the camera and the crew
    this.y = 0; this.lat = 0; this.i = 0; this.bank = 0;
    this.events = [];
    this.impacts = [];
    this.wheelSurf = ['asphalt', 'asphalt', 'asphalt', 'asphalt'];
    this.inPit = false;               // anywhere on the pit road
    this.inLane = false;              // specifically behind the pit wall
    this.speeding = false;
    this.tow = 0;                     // how much slipstream it is getting (draft.js)
    this.pushedBy = 0;                // and how much it is getting from behind
  }

  /** put it somewhere and forget where it was */
  place(x, z, yaw) {
    this.car.reset(x, z, yaw);
    this.hint = -1;
    const loc = this.track.locate(x, z);
    this.hint = this.i = loc.i;
    this.lat = loc.off;
    this.dist = this.prevDist = loc.dist;
    this.progress = this.lap * this.track.length + loc.dist;
    this.y = loc.y;
    this.bank = loc.bank;
  }

  /** one frame of driving */
  step(dt, input, clock) {
    const car = this.car, tr = this.track;
    this.impacts.length = 0;
    if (this.out) return;

    // ---- where each wheel is, and what it is standing on -----------------
    const loc0 = tr.locate(car.x, car.z, this.hint);
    const l = [Math.cos(loc0.point.h), -Math.sin(loc0.point.h)];
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    const grip = [1, 1, 1, 1];
    let drag = 0, worst = 'asphalt', worstGrip = 2;
    for (let k = 0; k < 4; k++) {
      const [xi, yi] = car.wheelPos(k);
      const wx = car.x + xi * s + yi * c, wz = car.z + xi * c - yi * s;
      const lat = (wx - loc0.point.x) * l[0] + (wz - loc0.point.z) * l[1];
      const sf = tr.surface(loc0.i, lat);
      grip[k] = sf.grip;
      drag += sf.drag / 4;
      this.wheelSurf[k] = sf.kind;
      if (sf.grip < worstGrip) { worstGrip = sf.grip; worst = sf.kind; }
    }
    this.offTrack = worst === 'grass';
    this.surface = worst;

    // ---- THE BANKING, resolved -------------------------------------------
    //
    // The road under the car is tilted by `bank`, rising toward the OUTSIDE
    // of the corner, which on a left-hand oval is to the car's right. So the
    // down-slope direction, in plan, is the track's own LEFT vector - and it
    // is handed to the car already rotated into the car's frame, because a
    // car that is sideways or spinning still gets pulled toward the infield
    // and not toward its own left door.
    const bank = loc0.bank;
    const fwd = [s, c], lf = [c, -s];
    car.bank.sin = Math.sin(bank);
    car.bank.cos = Math.cos(bank);
    car.bank.dirF = l[0] * fwd[0] + l[1] * fwd[1];
    car.bank.dirL = l[0] * lf[0] + l[1] * lf[1];

    // ---- ON PIT ROAD? ----------------------------------------------------
    // Behind the pit wall, or on the entry or exit road clear of the apron.
    // Being there is not an offence; being there at more than the pit road
    // speed is.
    const P = tr.pit;
    const d0 = P.rel(loc0.dist);
    const cen = P.centre(d0);
    this.inLane = P.wallAt(loc0.i) && loc0.off > P.wall;
    this.inPit = this.inLane || (cen !== null && loc0.off > tr.innerEdge - 1
                 && Math.abs(loc0.off - cen) < P.halfRoad + 2.0);
    this.speeding = this.inPit && car.speed > P.limit + 0.3;

    car.step(dt, { ...input, grip, drag });

    // ---- THE WALL --------------------------------------------------------
    //
    // Solid concrete, on the outside of every corner, with nothing between
    // it and the racing surface but a metre of shoulder. The car is a box
    // HALF_WIDTH either side of its centre; where it has gone past the wall
    // it is put back, the part of its velocity going INTO the wall is
    // reflected with most of it lost, and sliding along costs speed too.
    //
    // A stock car does not bounce off a wall the way a formula car does -
    // it crushes, it sticks, and it comes back down the track in front of
    // everybody. So the restitution is low and the tangential loss is high.
    const loc = tr.locate(car.x, car.z, loc0.i);
    this.hint = loc.i;
    const pl = [Math.cos(loc.point.h), -Math.sin(loc.point.h)];
    const pf = [Math.sin(loc.point.h), Math.cos(loc.point.h)];
    const rel = car.yaw - loc.point.h;
    const across = Math.abs(Math.sin(rel)) * HALF_LENGTH + Math.abs(Math.cos(rel)) * HALF_WIDTH;
    this.hitWall = 0;
    // each constraint is [side, line]: the car must keep side * offset under
    // the line. The pit wall is solid from BOTH faces, which is what makes
    // the lane a lane.
    const cons = [[1, loc.barL], [-1, loc.barR]];
    if (P.wallAt(loc.i) && loc.off > P.wall + 0.15) {
      cons[0][1] = P.garage;
      cons.push([-1, -(P.wall + 0.35)]);
    }
    for (const [side, bar] of cons) {
      const limit = bar - across;
      const over = side * loc.off - limit;
      if (over <= 0) continue;
      car.x -= pl[0] * side * over;
      car.z -= pl[1] * side * over;
      const vn = (car.vx * pl[0] + car.vz * pl[1]) * side;
      if (vn > 0) {
        const e = 0.16;
        car.vx -= pl[0] * side * vn * (1 + e);
        car.vz -= pl[1] * side * vn * (1 + e);
        const vt = car.vx * pf[0] + car.vz * pf[1];
        const loss = Math.min(Math.abs(vt), vn * 0.70 + Math.abs(vt) * 0.020);
        car.vx -= pf[0] * Math.sign(vt) * loss;
        car.vz -= pf[1] * Math.sign(vt) * loss;
        car.yawRate *= 0.30;
        let dh = loc.point.h - car.yaw;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        if (Math.abs(dh) < Math.PI / 2) car.yaw += dh * Math.min(0.5, vn * 0.02);
        this.hitWall = vn;
      }
      // WHERE ON THE CAR IT TOUCHED, for damage.js: the corner of the car
      // furthest into the wall, or the middle of a side lying flat along it
      const fw = [Math.sin(car.yaw), Math.cos(car.yaw)], lfw = [Math.cos(car.yaw), -Math.sin(car.yaw)];
      let best = -1e9, second = -1e9, bi = 0, si = 0;
      const cs = [[HALF_LENGTH, HALF_WIDTH], [HALF_LENGTH, -HALF_WIDTH], [-HALF_LENGTH, HALF_WIDTH], [-HALF_LENGTH, -HALF_WIDTH]];
      cs.forEach(([f, ll], j) => {
        const o = side * ((fw[0] * f + lfw[0] * ll) * pl[0] + (fw[1] * f + lfw[1] * ll) * pl[1]);
        if (o > best) { second = best; si = bi; best = o; bi = j; } else if (o > second) { second = o; si = j; }
      });
      let [cf, cl] = cs[bi];
      if (best - second < 0.35) { cf = (cf + cs[si][0]) / 2; cl = (cl + cs[si][1]) / 2; }
      const vt = car.vx * pf[0] + car.vz * pf[1];
      this.impacts.push({ fwd: cf, left: cl, vn: Math.max(0, vn), vt: Math.abs(vt), other: null,
        x: car.x + fw[0] * cf + lfw[0] * cl, y: loc.y + 0.5, z: car.z + fw[1] * cf + lfw[1] * cl,
        nx: -pl[0] * side, nz: -pl[1] * side });
    }

    this.y = loc.y; this.lat = loc.off; this.i = loc.i; this.bank = loc.bank;

    // ---- LAPS ------------------------------------------------------------
    // Counted on the wrap from the end of the lap to the start going
    // forwards - watched as a jump in distance, not as "near the line",
    // because at 200 mph a car covers a metre and a half between frames.
    const L = tr.length;
    const d = loc.dist;
    this.events.length = 0;
    if (this.prevDist > L * 0.75 && d < L * 0.25) {
      if (!this.started) this.started = true;
      else {
        const t = clock - this.lapStart;
        this.lastLap = t;
        if (!this.bestLap || t < this.bestLap) this.bestLap = t;
        this.events.push({ type: 'lap', time: t });
      }
      // WHAT THAT LAP ACTUALLY COST IN FUEL. A crew chief works off the
      // gauge and the last few laps, not off a number somebody wrote down
      // before the race - and the difference is not small: a constant said
      // seventy laps to a tank at Darlington while twenty cars racing each
      // other really got forty-six, so everybody ran the tank dry on the
      // track. Refuelling shows up as a negative and is thrown away.
      const burn = this.fuelMark - this.car.fuel;
      if (burn > 0 && burn < 5) this.fuelPerLap = this.fuelPerLap ? this.fuelPerLap * 0.6 + burn * 0.4 : burn;
      this.fuelMark = this.car.fuel;
      this.lap++;
      this.lapStart = clock;
    } else if (this.prevDist < L * 0.25 && d > L * 0.75) {
      this.lap--;
    }
    this.prevDist = d;
    this.dist = d;
    this.progress = this.lap * L + d;
  }
}

/**
 * Car against car. Each is a capsule down its own centre line; where two
 * overlap they are pushed apart along the line between the nearest points
 * of the two capsules, and trade momentum along it.
 *
 * THE RESTITUTION IS NEARLY ZERO NOSE TO TAIL, and that is deliberate.
 * Bump drafting is a real technique - you put your nose on the car in
 * front and push, for lap after lap - and a bouncy contact model turns
 * that into a pogo stick. Two cars hitting each other at an ANGLE keep a
 * proper bounce, because that is a crash and it should feel like one.
 */
export function collide(runners) {
  const R = 1.05;
  for (let a = 0; a < runners.length; a++) {
    if (runners[a].out) continue;
    for (let b = a + 1; b < runners.length; b++) {
      if (runners[b].out) continue;
      const A = runners[a].car, B = runners[b].car;
      if (Math.abs(A.x - B.x) > 8 || Math.abs(A.z - B.z) > 8) continue;
      const segA = seg(A), segB = seg(B);
      const [pa, pb] = closest(segA, segB);
      let nx = pb[0] - pa[0], nz = pb[1] - pa[1];
      const d = Math.hypot(nx, nz);
      if (d >= R * 2 || d < 1e-6) continue;
      nx /= d; nz /= d;
      const push = (R * 2 - d) / 2;
      A.x -= nx * push; A.z -= nz * push;
      B.x += nx * push; B.z += nz * push;
      const vrel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (vrel < 0) {
        // aligned = nose to tail, which is a push; crossed up = a crash
        const aligned = Math.max(0, Math.cos(A.yaw - B.yaw));
        const e = 0.04 + 0.26 * (1 - aligned * aligned);
        // heavier cars shove lighter ones: a full fuel load is worth
        // something in the pushing match
        const mA = A.mass, mB = B.mass, mt = mA + mB;
        const j = -(1 + e) * vrel;
        A.vx -= nx * j * mB / mt; A.vz -= nz * j * mB / mt;
        B.vx += nx * j * mA / mt; B.vz += nz * j * mA / mt;
        A.yawRate *= 0.88; B.yawRate *= 0.88;
      }
      const vn = Math.max(0, -vrel);
      const tx = (B.vx - A.vx) - nx * vrel, tz = (B.vz - A.vz) - nz * vrel;
      const vt = Math.hypot(tx, tz);
      const cx = (pa[0] + pb[0]) / 2, cz = (pa[1] + pb[1]) / 2;
      const y = (runners[a].y + runners[b].y) / 2 + 0.5;
      for (const [r, C, sgn] of [[runners[a], A, 1], [runners[b], B, -1]]) {
        const dx = cx - C.x, dz = cz - C.z;
        r.impacts.push({
          fwd: dx * Math.sin(C.yaw) + dz * Math.cos(C.yaw),
          left: Math.max(-1.1, Math.min(1.1, (dx * Math.cos(C.yaw) - dz * Math.sin(C.yaw)) * 1.6)),
          vn, vt, other: sgn > 0 ? runners[b] : runners[a], x: cx, y, z: cz,
          nx: -nx * sgn, nz: -nz * sgn,
        });
      }
    }
  }
}

/**
 * PUT EVERYBODY BACK INSIDE THE WALLS, after the cars have shoved each
 * other about.
 *
 * The order of a frame is: each car drives (and is pushed off the wall if
 * it is in it), then collide() pushes overlapping cars apart. That second
 * step can put a car straight back THROUGH the wall - and next frame the
 * wall pushes it out again, into the car that pushed it in, which pushes
 * it back... Two cars and a wall is a constraint fight with no solution,
 * and it ran away: a car pinned against the concrete by another registered
 * a violent impact every single frame, a hundred and fifty thousand of
 * them in one race, and the whole field piled into the back of it.
 *
 * So the walls get the last word. This pass is POSITION ONLY - no bounce,
 * no impact reported, no damage - because whatever hit there already
 * happened and was already paid for. It just refuses to let a car be
 * outside the fence at the end of a frame.
 */
export function enforceWalls(runners) {
  for (const r of runners) {
    if (r.out) continue;
    const car = r.car, tr = r.track;
    const loc = tr.locate(car.x, car.z, r.hint);
    const pl = [Math.cos(loc.point.h), -Math.sin(loc.point.h)];
    const rel = car.yaw - loc.point.h;
    const across = Math.abs(Math.sin(rel)) * HALF_LENGTH + Math.abs(Math.cos(rel)) * HALF_WIDTH;
    const P = tr.pit;
    const cons = [[1, loc.barL], [-1, loc.barR]];
    if (P.wallAt(loc.i) && loc.off > P.wall + 0.15) {
      cons[0][1] = P.garage;
      cons.push([-1, -(P.wall + 0.35)]);
    }
    for (const [side, bar] of cons) {
      const over = side * loc.off - (bar - across);
      if (over <= 0) continue;
      car.x -= pl[0] * side * over;
      car.z -= pl[1] * side * over;
      // and kill the velocity that is still going into it, so the next
      // frame does not simply do the same thing again
      const vn = (car.vx * pl[0] + car.vz * pl[1]) * side;
      if (vn > 0) { car.vx -= pl[0] * side * vn; car.vz -= pl[1] * side * vn; }
    }
    r.lat = loc.off - (loc.off - r.lat) * 0;      // keep the cached offset honest
  }
}

function seg(car) {
  const f = [Math.sin(car.yaw), Math.cos(car.yaw)], h = 1.55;
  return [[car.x - f[0] * h, car.z - f[1] * h], [car.x + f[0] * h, car.z + f[1] * h]];
}

/** closest points between two segments, sampled - plenty at car scale */
function closest(s1, s2) {
  let best = Infinity, out = null;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const p = [s1[0][0] + (s1[1][0] - s1[0][0]) * t, s1[0][1] + (s1[1][1] - s1[0][1]) * t];
    for (let j = 0; j <= 4; j++) {
      const u = j / 4;
      const q = [s2[0][0] + (s2[1][0] - s2[0][0]) * u, s2[0][1] + (s2[1][1] - s2[0][1]) * u];
      const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (dd < best) { best = dd; out = [p, q]; }
    }
  }
  return out;
}
