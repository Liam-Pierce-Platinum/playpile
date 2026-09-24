// =====================================================================
// APEX :: world.js - WHAT HAPPENS TO A CAR BECAUSE OF WHERE IT IS
// =====================================================================
//
// car.js knows how a car behaves on a flat, endless, perfectly grippy
// plane. This is everything the circuit does to it on top of that, and it
// is the SAME for the player and for every robot on the grid - which is
// the only way a race against them is a race:
//
//   SURFACE   each wheel asks the track what it is on; grass and gravel
//             take grip away and drag the car down
//   BARRIERS  are solid. Before, a car drove straight through the armco
//             and out into the fields, and the fastest line round Monza
//             was across the infield
//   GRADIENT  the bridge at Suzuka is uphill one way and downhill the other
//   PROGRESS  how far round the race a car is - laps plus metres - which is
//             what lap timing, sector times and the running order all read
//
// And car against car, which is its own function because it is the one
// thing here that involves two of them.
const G = 9.81;
const HALF_WIDTH = 1.0;          // centre to the outside of a wheel
const HALF_LENGTH = 2.6;

export class Runner {
  /** a car on a circuit: the physics object plus everything the world knows about it */
  constructor(car, track) {
    this.car = car;
    this.track = track;
    this.hint = -1;
    this.lap = 0;                 // completed laps
    this.dist = 0;                // metres round the current lap
    this.prevDist = 0;
    this.progress = 0;            // lap * length + dist, never wraps
    this.lapStart = 0;            // race clock when this lap began
    this.lapValid = true;
    this.sector = 0;
    this.sectorStart = 0;
    this.sectors = [0, 0, 0];     // this lap's splits so far
    this.lastLap = 0;
    this.bestLap = 0;
    this.offTrack = false;
    this.allOut = false;          // all four wheels over the white line
    this.surface = 'asphalt';
    this.hitWall = 0;             // speed into the last barrier, for the camera shake and the robots
    /* HOW THIS ONE OVERTAKES, as the rest of the grid has learnt it.
       A running average of the side he comes down: -1 always the right,
       +1 always the left, 0 unpredictable. ai.js writes it while being
       passed and reads it while defending, so going down the inside four
       times means the fifth driver is already covering the inside. It
       lives on the runner rather than in the driver because the whole
       field shares one memory of you - which is the difference between
       "they adapt" and twenty drivers each learning it separately. */
    this.style = { side: 0 };
    this.y = 0; this.grade = 0; this.lat = 0; this.i = 0;
    this.started = false;         // has crossed the line for the first time (a flying lap)
    this.events = [];             // 'lap' | 'sector' | 'invalid' - read and cleared by the game
    this.impacts = [];            // every contact this frame, barrier or car, for damage.js
    this.wheelSurf = ['asphalt', 'asphalt', 'asphalt', 'asphalt'];
    this.inPit = false;           // on the pit road: the entry, the lane or the exit
  }

  /** put it somewhere and forget where it was */
  place(x, z, yaw, atIndex = -1) {
    this.car.reset(x, z, yaw);
    this.hint = -1;
    // placed BY INDEX where the caller knows it - a car put back on the
    // bridge must not be located onto the road beneath it
    const loc = atIndex >= 0 ? this.track.locate(x, z, atIndex, this.track.points[atIndex].y) : this.track.locate(x, z);
    this.hint = loc.i;
    this.i = loc.i; this.lat = loc.off; this.grade = loc.grade;
    this.dist = this.prevDist = loc.dist;
    this.progress = this.lap * this.track.length + loc.dist;
    this.y = loc.y;
  }

  /** one frame of driving */
  step(dt, input, clock) {
    const car = this.car, tr = this.track;

    // ---- what each wheel is on, from where the car was last frame
    this.impacts.length = 0;
    const loc0 = tr.locate(car.x, car.z, this.hint, this.hint >= 0 ? this.y : null);
    const l = [Math.cos(loc0.point.h), -Math.sin(loc0.point.h)];
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    // ON THE PIT ROAD? Behind the pit wall, or on the entry or exit road
    // clear of the track edge. It is not a track-limits offence to be there.
    const P = tr.pit;
    if (P) {
      const latS = loc0.off * P.side, cen = P.centre(P.rel(loc0.dist));
      this.inPit = cen !== null && (P.wallAt(loc0.i) ? latS > P.wall : latS > tr.halfWidth + 0.8 && Math.abs(latS - cen) < P.halfRoad + 1.5);
    }
    const grip = [1, 1, 1, 1];
    let drag = 0, out = 0, worst = 'asphalt';
    for (let k = 0; k < 4; k++) {
      const [xi, yi] = car.wheelPos(k);
      const wx = car.x + xi * s + yi * c, wz = car.z + xi * c - yi * s;
      const lat = (wx - loc0.point.x) * l[0] + (wz - loc0.point.z) * l[1];
      const sf = tr.surface(loc0.i, lat);
      grip[k] = sf.grip;
      drag += sf.drag / 4;
      this.wheelSurf[k] = sf.kind;
      if (Math.abs(lat) > tr.limit && !this.inPit) out++;
      if (sf.grip < 0.9) worst = sf.kind;
    }
    this.allOut = out === 4;
    this.offTrack = worst === 'grass' || worst === 'gravel';
    this.surface = worst;

    car.step(dt, { ...input, grip, drag });

    // ---- the gradient: gravity along the road
    if (loc0.grade) {
      const a = G * loc0.grade * dt;
      car.vx -= a * Math.sin(loc0.point.h);
      car.vz -= a * Math.cos(loc0.point.h);
    }

    // ---- BARRIERS ---------------------------------------------------
    // The car is a box, HALF_WIDTH either side of its centre. Where it
    // has gone past the barrier line it is put back on the right side of
    // it, the part of its velocity going INTO the barrier is reflected
    // with most of it lost, and scraping along costs speed too. Rotated
    // corners of the car are allowed for by using the wider of its width
    // and its length projected across the track.
    const loc = tr.locate(car.x, car.z, loc0.i, loc0.y);
    this.hint = loc.i;
    const pl = [Math.cos(loc.point.h), -Math.sin(loc.point.h)];
    const pf = [Math.sin(loc.point.h), Math.cos(loc.point.h)];
    const rel = car.yaw - loc.point.h;
    const across = Math.abs(Math.sin(rel)) * HALF_LENGTH + Math.abs(Math.cos(rel)) * HALF_WIDTH;
    this.hitWall = 0;
    // Each constraint is [side, line]: the car must keep side * offset under
    // the line. A car IN the pit lane has the garages as its barrier on the
    // pit side and the pit wall on the other - the wall is solid from both
    // faces, which is what makes the lane a lane.
    const cons = [[1, loc.barL], [-1, loc.barR]];
    if (P && P.wallAt(loc.i) && loc.off * P.side > P.wall + 0.15) {
      cons[P.side > 0 ? 0 : 1][1] = P.outer(loc.i);
      cons.push([-P.side, -(P.wall + 0.35)]);
    }
    for (const [side, bar] of cons) {
      const limit = bar - across;
      const over = side * loc.off - limit;
      if (over <= 0) continue;
      car.x -= pl[0] * side * over;
      car.z -= pl[1] * side * over;
      const vn = (car.vx * pl[0] + car.vz * pl[1]) * side;      // speed into the wall
      if (vn > 0) {
        const e = 0.22;
        car.vx -= pl[0] * side * vn * (1 + e);
        car.vz -= pl[1] * side * vn * (1 + e);
        // scraping: tangential speed lost in proportion to how hard it hit
        const vt = car.vx * pf[0] + car.vz * pf[1];
        const loss = Math.min(Math.abs(vt), vn * 0.55 + Math.abs(vt) * 0.015);
        car.vx -= pf[0] * Math.sign(vt) * loss;
        car.vz -= pf[1] * Math.sign(vt) * loss;
        // and the nose is turned back along the wall rather than into it
        car.yawRate *= 0.35;
        let d = loc.point.h - car.yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) < Math.PI / 2) car.yaw += d * Math.min(0.5, vn * 0.02);
        this.hitWall = vn;
      }
      // WHERE ON THE CAR IT TOUCHED, for the damage: the corner of the car
      // furthest into the wall, or the middle of a side lying flat along it
      const fw = [Math.sin(car.yaw), Math.cos(car.yaw)], lf = [Math.cos(car.yaw), -Math.sin(car.yaw)];
      let best = -1e9, second = -1e9, bi = 0, si = 0;
      const cs = [[HALF_LENGTH, HALF_WIDTH], [HALF_LENGTH, -HALF_WIDTH], [-HALF_LENGTH, HALF_WIDTH], [-HALF_LENGTH, -HALF_WIDTH]];
      cs.forEach(([f, l], j) => {
        const o = side * ((fw[0] * f + lf[0] * l) * pl[0] + (fw[1] * f + lf[1] * l) * pl[1]);
        if (o > best) { second = best; si = bi; best = o; bi = j; } else if (o > second) { second = o; si = j; }
      });
      let [cf, cl] = cs[bi];
      if (best - second < 0.35) { cf = (cf + cs[si][0]) / 2; cl = (cl + cs[si][1]) / 2; }
      const vt = car.vx * pf[0] + car.vz * pf[1];
      this.impacts.push({ fwd: cf, left: cl, vn: Math.max(0, vn), vt: Math.abs(vt), other: null,
        x: car.x + fw[0] * cf + lf[0] * cl, y: loc.y + 0.35, z: car.z + fw[1] * cf + lf[1] * cl,
        nx: -pl[0] * side, nz: -pl[1] * side });
    }

    this.y = loc.y; this.grade = loc.grade; this.lat = loc.off; this.i = loc.i;

    // ---- PROGRESS, LAPS AND SECTORS -----------------------------------
    // A lap counts on the wrap from the end of the lap to the start going
    // forwards - watched as a jump in distance, not as "near the line",
    // because at 300 km/h a car covers 1.4 m between frames.
    const L = tr.length;
    const d = loc.dist;
    this.events.length = 0;
    if (this.prevDist > L * 0.75 && d < L * 0.25) {
      if (!this.started) {
        this.started = true;
      } else {
        const t = clock - this.lapStart;
        this.sectors[2] = clock - this.sectorStart;
        this.lastLap = t;
        const valid = this.lapValid;
        if (valid && (!this.bestLap || t < this.bestLap)) this.bestLap = t;
        this.events.push({ type: 'lap', time: t, valid, sectors: this.sectors.slice() });
      }
      this.lap++;
      this.lapStart = clock;
      this.sectorStart = clock;
      this.sector = 0;
      this.sectors = [0, 0, 0];
      this.lapValid = true;
    } else if (this.prevDist < L * 0.25 && d > L * 0.75) {
      this.lap--;                                   // backwards over the line
    }
    const sec = Math.min(2, Math.floor(d / (L / 3)));
    if (this.started && sec === this.sector + 1) {
      this.sectors[this.sector] = clock - this.sectorStart;
      this.events.push({ type: 'sector', index: this.sector, time: this.sectors[this.sector] });
      this.sector = sec;
      this.sectorStart = clock;
    }
    // TRACK LIMITS: all four wheels over the white line and the lap is gone
    if (this.started && this.allOut && this.lapValid && car.speed > 5) {
      this.lapValid = false;
      this.events.push({ type: 'invalid' });
    }
    this.prevDist = d;
    this.dist = d;
    this.progress = this.lap * L + d;
  }
}

/**
 * Car against car. Each is a capsule down its own centre line; where two
 * overlap they are pushed apart along the line between the nearest points
 * of the two capsules, and trade momentum along it with a little bounce.
 * Only cars within a few metres of each other are ever compared.
 */
export function collide(runners) {
  const R = 1.0;
  for (let a = 0; a < runners.length; a++) {
    if (runners[a].out) continue;
    for (let b = a + 1; b < runners.length; b++) {
      if (runners[b].out) continue;
      const A = runners[a].car, B = runners[b].car;
      if (Math.abs(A.x - B.x) > 7 || Math.abs(A.z - B.z) > 7) continue;
      if (Math.abs(runners[a].y - runners[b].y) > 2.5) continue;     // one is on the bridge
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
        const j = -(1 + 0.2) * vrel / 2;
        A.vx -= nx * j; A.vz -= nz * j;
        B.vx += nx * j; B.vz += nz * j;
        A.yawRate *= 0.8; B.yawRate *= 0.8;
      }
      // both cars are told where they were touched, and how hard
      const vn = Math.max(0, -vrel);
      const tx = (B.vx - A.vx) - nx * vrel, tz = (B.vz - A.vz) - nz * vrel;
      const vt = Math.hypot(tx, tz);
      const cx = (pa[0] + pb[0]) / 2, cz = (pa[1] + pb[1]) / 2, y = (runners[a].y + runners[b].y) / 2 + 0.35;
      for (const [r, C, sgn] of [[runners[a], A, 1], [runners[b], B, -1]]) {
        const dx = cx - C.x, dz = cz - C.z;
        r.impacts.push({ fwd: dx * Math.sin(C.yaw) + dz * Math.cos(C.yaw), left: Math.max(-1, Math.min(1, (dx * Math.cos(C.yaw) - dz * Math.sin(C.yaw)) * 2)),
          vn, vt, other: sgn > 0 ? runners[b] : runners[a], x: cx, y, z: cz, nx: -nx * sgn, nz: -nz * sgn });
      }
    }
  }
}

function seg(car) {
  const f = [Math.sin(car.yaw), Math.cos(car.yaw)], h = 1.7;
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
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d < best) { best = d; out = [p, q]; }
    }
  }
  return out;
}
