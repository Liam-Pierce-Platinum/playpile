// ===================== HIGHWAY :: POLICE =====================
// There is a patrol on you from the moment you set off. They FOLLOW - they do
// not spawn ahead, they do not cheat their way in front - they come up the road
// behind you and work their way through the traffic to reach you.
//
// Once one gets alongside your back wheel it will try to PIT you: steer hard
// into your rear quarter to spin you into the traffic. That is the thing you
// are actually running from.

import { Car, clamp, carsTouching } from './physics.js';
import { buildSpec } from './catalog.js';
import { LANE_W } from './track.js';

const COP_CARS = ['crownvic', 'gnx', 'chevelle', 'hellcat', 'demon'];
const BUST_RANGE = 7.0;
const DESPAWN_BEHIND = 210;       // for wrecks and roadblock cars
const RECYCLE = 90;              // a live patrol never despawns - at this far
                                  // back it comes round again behind you
const PIT_RANGE = 9;              // how close before one will try it
const PIT_LAT = 4.6;              // and how far across it will reach
const COP_WRECK = 34;             // closing speed that takes a patrol out -
                                  // a glancing shunt is not enough, it has to
                                  // be a proper one
const CLOSE_IN = 38;              // gap at which closing becomes station-keeping
const FOLLOW_GAP = 10;             // Where station actually is. The camera only
                                  // shows ~13 m of road behind you, so a patrol
                                  // holding 40 m is off the bottom of the
                                  // screen - technically on you, invisibly. To
                                  // BE in your mirrors it has to be inside that.
const WRECK_COOL = 2.5;           // and how often the chase may lose one
const BLOCK_EVERY = 1250;         // metres between roadblocks

export class Police {
  constructor(track) {
    this.track = track;
    this.cars = [];
    this.heat = 3;                // never just one car - a chase is a pack
    this.heatFloat = 3;
    this.bust = 0;
    this.spawnT = 0;
    this.busted = false;
    this.pitT = 0;
    this.nextBlock = BLOCK_EVERY;
    this.blocks = [];
  }

  reset() {
    this.cars.length = 0;
    this.heat = 3; this.heatFloat = 3;
    this.bust = 0; this.busted = false; this.pitT = 0;
    this.spawnT = 0.8;            // and they are on you almost immediately
    this.nextBlock = BLOCK_EVERY;
    this.blocks.length = 0;
    this.hist = []; this.clock = 0;
    this.rush = 0;
    this.wreckCool = 0;
  }
  clear() { this.reset(); }

  make(s, lane, lanes, level, speed) {
    const T = this.track;
    const id = COP_CARS[Math.min(COP_CARS.length - 1, level)];
    const spec = buildSpec(id, {
      tune: { power: 3 + level, tyre: 4, brakes: 4, susp: 4 + level, weight: 2 },
      paint: '#12151b', accent: '#e8eaee', kit: 'street', wheel: 'race',
      livery: 'wide', glow: 'none',
    });
    const lat = T.laneLat(lane, lanes);
    const w = T.toWorld(s, lat);
    const c = new Car(spec, w.x, w.y, w.dir);
    c.copCar = true;
    c.headlights = true;
    c.s = s; c.lat = lat;
    c.speed = Math.max(34, (speed || 0) * 0.96);
    c.role = ['tail', 'left', 'right', 'tail', 'left'][this.cars.length % 5];
    c.pitting = 0;
    c.wrecked = 0;
    // Each patrol has its own reaction time. They do not get to re-plan every
    // frame - which is what makes a sudden weave through a gap something they
    // can actually be caught out by.
    c.reactEvery = 0.18 + Math.random() * 0.22;
    c.reactT = 0;
    c.avoidLat = 0;
    // half the pack drives your line, half backs its own read of the traffic
    c.style = Math.random() < 0.7 ? 'line' : 'own';
    return c;
  }

  // You have just hit something. Every unit in the area is on you now: heat
  // straight to the top and spawning goes to a rush until all five are out.
  alarm() {
    this.heatFloat = 5;
    if (this.heat < 5) this.heat = 5;
    this.spawnT = Math.min(this.spawnT, 0.2);
    this.rush = 10;
  }

  addHeat(a) {
    this.heatFloat = Math.min(5, Math.max(3, this.heatFloat + a));
    const lvl = Math.floor(this.heatFloat);
    if (lvl > this.heat) { this.heat = lvl; return true; }
    return false;
  }

  update(dt, player, playerS, playerLat, traffic) {
    const T = this.track;

    // heat: more of them the longer you keep this up
    let gain = dt * 0.045;
    if (player.kph > 150) gain += dt * 0.055;
    if (player.crashT > 0.4) gain += dt * 0.35;
    const roseTo = this.addHeat(gain) ? this.heat : 0;

    // ---- spawning: always BEHIND, never in front ----
    this.spawnT -= dt;
    this.rush = Math.max(0, (this.rush || 0) - dt);
    const chasers = this.cars.filter(x => !x.blocker && x.wrecked <= 0).length;
    if (chasers < this.heat && this.spawnT <= 0) {
      const back = playerS - (55 + Math.random() * 45);
      const p = T.at(back);
      const c = this.make(back, (Math.random() * p.lanes) | 0, p.lanes, this.heat - 1, player.speed);
      // spread the pack across the road so they arrive on different lines
      c.role = ['tail', 'left', 'right', 'left', 'right'][chasers % 5];
      this.cars.push(c);
      // at high heat replacements keep coming quickly - the pack thinning out
      // to two cars mid-chase is the pressure quietly switching itself off
      this.spawnT = this.rush > 0 ? 0.7 : (this.heat >= 4 ? 1.2 : 1.8);
    }

    // ---- ROADBLOCKS ----
    // Once they are properly on you, dispatch puts a line of cars across the
    // road ahead with one gap in it. Unlike the chase you cannot outrun this -
    // you have to pick the hole and commit.
    if (this.heat >= 2 && playerS > this.nextBlock) {
      this.nextBlock = playerS + BLOCK_EVERY + Math.random() * 500;
      const at = playerS + 420;
      const p = T.at(at);
      // A block is two cars parked BROADSIDE across two adjacent lanes - the
      // way it is actually done - not a clump of cars nose-first in every lane.
      // Turned sideways a 5.3 m car spans about a lane and a half, so two of
      // them shut two lanes properly and the rest of the road stays open. It
      // narrows the road and forces a line; it is not a wall with a hole in it.
      const first = (Math.random() * Math.max(1, p.lanes - 1)) | 0;
      const block = { s: at, from: first, to: first + 1, cars: [] };
      for (let k = 0; k < 2; k++) {
        const l = first + k;
        const lat = T.laneLat(l, p.lanes);
        const w = T.toWorld(at + k * 1.2, lat);
        const car = this.make(at + k * 1.2, l, p.lanes, this.heat - 1);
        car.x = w.x; car.y = w.y;
        car.s = at + k * 1.2; car.lat = lat;
        car.speed = 0;
        car.blocker = true;
        // broadside: square across the carriageway, with a few degrees of angle
        car.h = w.dir + Math.PI / 2 + (Math.random() - 0.5) * 0.16;
        block.cars.push(car);
        this.cars.push(car);
      }
      this.blocks.push(block);
      this.blockWarn = 1;
    }
    this.blockWarn = Math.max(0, (this.blockWarn || 0) - dt);
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      if (this.blocks[i].s < playerS - 120) this.blocks.splice(i, 1);
    }

    // a short history of where you have been, for the patrols to chase
    this.hist = this.hist || [];
    this.hist.push({ t: (this.clock = (this.clock || 0) + dt), s: playerS, lat: playerLat });
    while (this.hist.length > 2 && this.clock - this.hist[0].t > 6) this.hist.shift();

    let nearest = 999;
    this.pitT = Math.max(0, this.pitT - dt);
    this.wreckCool = Math.max(0, (this.wreckCool || 0) - dt);

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const pr = T.project(c.x, c.y, c.s);
      c.s = pr.s; c.lat = pr.lat;
      if (c.blocker || c.wrecked > 0) {
        if (c.s < playerS - DESPAWN_BEHIND) { this.cars.splice(i, 1); continue; }
      } else if (c.s < playerS - RECYCLE) {
        // It has lost you. Bring it straight back in from behind instead of
        // deleting it and waiting on a spawn timer - that gap in the pack is
        // the pressure quietly switching off. At 135 m it is well off the
        // bottom of the screen, so this is never something you can watch
        // happen; a patrol simply reappears in your mirrors.
        const back = playerS - (45 + Math.random() * 35);
        const bp = T.at(back);
        const w = T.toWorld(back, T.laneLat((Math.random() * bp.lanes) | 0, bp.lanes));
        c.place(w.x, w.y, w.dir);
        c.speed = Math.max(34, player.speed * 0.98);
        c.s = back; c.lat = w.lat;
        c.targetLat = undefined; c.reactT = 0; c.lastTtc = undefined;
        continue;
      }

      // ---- a wrecked patrol is out of the chase ----
      if (c.wrecked > 0) {
        c.wrecked -= dt;
        c.speed = Math.max(0, c.speed - dt * 14);
        c.h += c.spinRate * dt;
        c.spinRate *= 1 - dt * 0.8;
        c.x += Math.cos(c.h) * c.speed * dt;
        c.y += Math.sin(c.h) * c.speed * dt;
        c.vx = Math.cos(c.h) * c.speed; c.vy = Math.sin(c.h) * c.speed;
        c.braking = true;
        if (c.wrecked <= 0) this.cars.splice(i, 1);
        continue;
      }

      // ---- did it fail to get out of the way? ----
      // Patrols are solid to the traffic too. Follow the player through a gap
      // that has already closed and you go into the back of a box truck.
      for (const t of traffic) {
        if (!carsTouching(c, t)) continue;
        const rel = Math.hypot(c.vx - t.vx, c.vy - t.vy);
        if (rel > COP_WRECK && this.wreckCool <= 0) {
          c.wrecked = 2.6;
          c.spinRate = (Math.random() - 0.5) * 6;
          this.wreckCool = WRECK_COOL;
          this.lastWreck = 1;
        }
        break;
      }
      if (c.wrecked > 0) continue;

      if (c.blocker) {
        // parked across the road: hold position, lights on
        c.speed = 0; c.vx = 0; c.vy = 0;
        c.braking = true;
        continue;
      }

      const gap = playerS - c.s;                 // + means the player is ahead
      const latDiff = playerLat - c.lat;
      const dist = Math.hypot(c.x - player.x, c.y - player.y);
      nearest = Math.min(nearest, dist);

      // ---- THE PIT ----
      // Alongside your back wheel and close enough across: aim at the rear
      // quarter and commit. This is what actually ends runs.
      c.pitting = Math.max(0, c.pitting - dt);
      if (gap > -1 && gap < PIT_RANGE && Math.abs(latDiff) < PIT_LAT && this.pitT <= 0) {
        c.pitting = 0.9;
        this.pitT = 2.2;
      }

      // Other patrols are obstacles too. They were not in this list, so five
      // cars all converging on your line piled into each other, scrubbed speed
      // on every contact and fell out of the chase without ever touching a
      // civilian. A pack has to be able to see itself.
      const obstacles = this.obstacles(c, traffic);

      // ---- two phases ----
      // CLOSING: it is not on you yet, so nothing matters except getting there.
      // Flat out, and it picks its lane purely on which one it can carry speed
      // through - it will cross the whole road for a gap.
      //
      // ON STATION: it is on you. Now it either drives YOUR LINE - the exact
      // path you took through these cars a second ago, which by definition
      // threads them - or backs its own read of the traffic and takes its own
      // lane. Which one it does is fixed per patrol, so a pack contains both.
      const closing = gap > CLOSE_IN;

      // A patrol that re-plans every frame is unbeatable and reads as a magnet
      // stuck to your bumper. One that only re-plans on its own reaction clock
      // has to COMMIT for a fifth of a second, so it weaves like a driver:
      // decisive, and occasionally wrong.
      c.reactT -= dt;
      if (c.reactT <= 0 || c.targetLat === undefined) {
        c.reactT = c.reactEvery;
        let aim = null;                       // null = "anywhere I can get through"
        if (!closing) {
          if (c.style === 'line') {
            // your line, sampled a little ahead of where it is now
            const line = this.latAtS(c.s + 10);
            aim = line === null ? this.pastLat(c.reactEvery) : line;
          } else {
            const lagged = this.pastLat(c.reactEvery);
            aim = c.role === 'left' ? lagged - LANE_W * 0.9
                : c.role === 'right' ? lagged + LANE_W * 0.9 : lagged;
          }
        }
        c.targetLat = this.pickLane(c, obstacles, aim, pr, closing);
        // it judges its speed off the lane it is committing to, not the one it
        // is leaving, so diving for a gap is a reason to stay on the throttle
        c.lastTtc = Math.min(this.ttc(c, obstacles, c.targetLat),
                             this.ttc(c, obstacles, c.lat) + 0.5);
        if (!closing && c.style === 'line') {
          const lt = this.lineTtc(c, obstacles, 90);
          if (lt !== null) c.lastTtc = lt;
        }
      }
      let wantLat = c.pitting > 0
        ? playerLat + Math.sign(latDiff || 1) * -0.6
        : c.targetLat;
      const half = T.halfWidth(c.s) - 1.5;
      wantLat = clamp(wantLat, -half, half);

      // decisive - a patrol that eases across lanes gets left behind
      const steerGain = c.pitting > 0 ? 1.0 : (closing ? 0.9 : 0.7);
      const steer = clamp((wantLat - c.lat) * steerGain, -1, 1);

      // ---- keep up ----
      // Falling out of your mirrors is the failure state for a chase, so the
      // further back a patrol is the harder it is allowed to run. This buys it
      // pace, not a shortcut - it still has to find its own way through.
      // ---- pace ----
      // CLOSING it runs flat out. ON STATION it matches your speed with a small
      // margin, and lifts once level - a patrol that overtakes you is an
      // obstacle, not a chase. Station is just behind your rear quarter, which
      // is also exactly where a PIT comes from.
      // The further back it is, the harder it is allowed to run - and that has
      // to be POWER, not just a higher top speed. Top speed was never the
      // limit; getting back up to speed out of every gap was.
      const push = clamp(gap / 110, 0, 1);
      // Station is staggered by role. All of them sitting at 8 m turned the
      // pack into a rolling cage - three cars boxing you at once, and every
      // test run ended in an arrest. One is on your bumper; the flankers
      // hang back and to the sides where you can see them without being
      // hemmed in by them.
      const stationGap = c.role === 'tail' ? FOLLOW_GAP : FOLLOW_GAP + 13;
      // following = harmless contact; PIT = the real thing
      c.gentle = c.pitting <= 0;
      const baseTop = c.baseTop || (c.baseTop = c.spec.topSpeed);
      const basePow = c.basePow || (c.basePow = c.spec.power);
      c.spec.topSpeed = baseTop * (1 + push * 0.85);
      c.spec.power = basePow * (1 + push * 1.25);
      const wantSpeed = closing
        ? c.spec.topSpeed / 3.6
        : (gap < 5 && c.pitting <= 0
            ? player.speed - 10                 // far too close, ease off
            : player.speed + clamp((gap - stationGap) * 0.55, -8, 25));
      let throttle = c.speed < wantSpeed ? 1 : 0;
      let copBrake = c.speed > wantSpeed + 4 ? 0.45 : 0;

      // Traffic overrides pace, and it reads the road off its LAST look, not
      // this frame's - so a car that closes in front of it inside the reaction
      // window is a crash rather than a free save. That window is the whole
      // difficulty knob: too long and they wreck constantly, too short and
      // they are psychic.
      // A patrol trying to catch you takes more risk than one already on you:
      // it stays on the throttle into gaps it has less margin for. That is
      // exactly the trade that gets one of them wrecked now and then.
      const ttc = c.lastTtc === undefined ? 99 : c.lastTtc;
      const liftAt = (closing || gap > 15) ? 1.3 : 1.8;
      if (ttc < liftAt) throttle = 0;
      if (ttc < liftAt * 0.6) copBrake = 0.9;

      c.braking = copBrake > 0;
      c.update(dt, { steer, throttle, brake: copBrake, roadDir: pr.dir }, 'road');
    }

    // ---- when do they actually take you? ----
    // Not merely because one is sitting on your bumper - now that they hold
    // station there, that would end every run in ten seconds. They take you
    // when they have you STOPPED, or BOXED with two cars on you at once.
    // Otherwise a patrol on your quarter is a PIT threat, which is the thing
    // you are supposed to be dealing with.
    const boxed = this.cars.filter(c => !c.blocker && c.wrecked <= 0
      && Math.hypot(c.x - player.x, c.y - player.y) < 7.5).length >= 2
      && player.kph < 95;
    // And if you are crawling anywhere near them you are done. Without this a
    // run could jam solid in heavy traffic with four patrols around it and
    // simply never end - stuck at 13 km/h, uncatchable, forever.
    const crawling = player.kph < 22 && nearest < 16;
    const pinned = (nearest < BUST_RANGE && player.kph < 45) || boxed || crawling;
    // Slower than it was. Now that a patrol lives on your bumper, a 2.5 s
    // arrest made being caught the ONLY way a run could end - every single
    // test run finished BUSTED. Being hunted has to be survivable or the
    // traffic stops mattering.
    this.bust = clamp(this.bust + (pinned ? dt * 0.24 : -dt * 0.75), 0, 1);
    if (this.bust >= 1) this.busted = true;

    return { roseTo, nearest, pitting: this.cars.some(c => c.pitting > 0) };
  }

  // Where the player was `lag` seconds ago.
  pastLat(lag) {
    const h = this.hist;
    if (!h || !h.length) return 0;
    const want = this.clock - lag;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= want) return h[i].lat;
    return h[0].lat;
  }

  // Time to contact in a given lane: how many seconds until this car reaches
  // whatever is in front of it there, at the speed difference between them.
  //
  // Distance alone is the wrong measure and it is why the patrols used to pace
  // the traffic instead of chasing. In heavy traffic there is nearly always
  // something within 50 m, so a distance rule has them off the throttle
  // permanently. Following a car doing 90 at 100 is not an emergency; closing
  // on a stationary one at 40 m is.
  // Where the player was when THEY were at this point on the road. A patrol
  // behind you can look this up and drive the exact line you took - which, by
  // definition, fits through the cars that are there. It is not a cheat: it is
  // the oldest trick in pursuit driving, and it still leaves the patrol a
  // reaction-time behind the traffic that has moved since.
  // Traffic plus every other live patrol and parked blocker - everything this
  // car has to physically get around.
  obstacles(self, traffic) {
    const out = traffic.slice();
    for (const o of this.cars) {
      if (o === self || o.wrecked > 0) continue;
      out.push(o);
    }
    return out;
  }

  latAtS(s) {
    const h = this.hist;
    if (!h || h.length < 2) return null;
    if (s > h[h.length - 1].s || s < h[0].s) return null;
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].s <= s && s <= h[i].s) {
        const span = h[i].s - h[i - 1].s;
        const k = span < 1e-4 ? 0 : (s - h[i - 1].s) / span;
        return h[i - 1].lat + (h[i].lat - h[i - 1].lat) * k;
      }
    }
    return null;
  }

  // Walk the line the player took, forward from this car, and find the first
  // thing standing in the way of it.
  //
  // This is what lets a patrol sit on your bumper. Judging the road by LANE,
  // a follower lifts every time YOU close on a car - but you are about to go
  // round it and the patrol is copying you, so lifting just hands you the
  // gap. It only backs off when your line genuinely will not fit any more,
  // which is when the traffic has shifted since you came through.
  lineTtc(c, obstacles, look) {
    const step = 6;
    for (let d = 4; d < look; d += step) {
      const lat = this.latAtS(c.s + d);
      if (lat === null) return null;          // no line recorded out here
      for (const t of obstacles) {
        if (Math.abs(t.s - (c.s + d)) > step * 0.75) continue;
        if (Math.abs(t.lat - lat) > 2.2) continue;
        const close = c.speed - (t.speed || 0);
        return close < 1 ? 99 : Math.max(0, d - 6) / close;
      }
    }
    return 99;
  }

  ttc(c, traffic, lat) {
    let best = 99;
    for (const t of traffic) {
      if (Math.abs(t.lat - lat) > 2.3) continue;
      const d = t.s - c.s;
      if (d <= 0 || d > 220) continue;
      const close = c.speed - (t.speed || 0);
      const time = close < 1 ? 99 : (d - 6) / close;
      if (time < best) best = time;
    }
    return best;
  }

  // THE WEAVE.
  //
  // Every lane is scored on whether the patrol can survive in it, whether it
  // can physically GET there, and how close it gets to where it wants to be.
  //
  // The crossing check is what separates this from lane-picking: a clear lane
  // three across is worthless if the two in between are full, because the car
  // has to drive through them to reach it. Without that, patrols would commit
  // to a far lane and T-bone whatever was on the way.
  //
  // aim === null means "anywhere I can carry speed through" - the closing
  // phase, where the patrol will cross the entire road for a gap. Otherwise
  // aim is your line (or your quarter) and it weighs heavily.
  pickLane(c, traffic, aim, pr, closing) {
    const T = this.track;
    // one pass for the whole road, so the crossing check is nearly free
    const lanes = [];
    for (let l = 0; l < pr.lanes; l++) {
      const lat = T.laneLat(l, pr.lanes);
      // Is anything level with the patrol in this lane right now? ttc only
      // looks at what is AHEAD, and a lane change also sweeps through whatever
      // is beside you. Without this the patrols dived into occupied space and
      // ground down the side of trucks - not wrecking, since a graze is not
      // enough for that, just bleeding speed on every contact until they were
      // 10 m/s slower than the player and 150 m back.
      let side = false;
      for (const t of traffic) {
        if (Math.abs(t.lat - lat) > 2.4) continue;
        const d = t.s - c.s;
        if (d > -9 && d < 13) { side = true; break; }
      }
      lanes.push({ lat, t: this.ttc(c, traffic, lat), side });
    }
    // which lane is it in now?
    let myL = 0, myD = 1e9;
    for (let l = 0; l < lanes.length; l++) {
      const d = Math.abs(lanes[l].lat - c.lat);
      if (d < myD) { myD = d; myL = l; }
    }

    let best = c.lat, bestScore = -1e9;
    for (let l = 0; l < lanes.length; l++) {
      const { lat, t, side } = lanes[l];
      // survivable lanes score on their headroom; unsurvivable ones are out
      let score = Math.min(t, 8) * 26;
      if (t < 1.5) score -= (1.5 - t) * 240;
      // and you cannot move into a space that is already occupied
      if (l !== myL && side) score -= 400;

      // every lane it has to cross has to be passable too
      const lo = Math.min(myL, l), hi = Math.max(myL, l);
      for (let m = lo; m <= hi; m++) {
        if (m === l || m === myL) continue;
        if (lanes[m].side) score -= 300;
        if (lanes[m].t < 1.0) score -= 150;
        else if (lanes[m].t < 1.8) score -= 45;
      }
      // and a move of more than two lanes at once is optimistic at 200 km/h
      if (hi - lo > 2) score -= (hi - lo - 2) * 45;

      if (aim !== null) score -= Math.abs(lat - aim) * 14;
      score -= Math.abs(lat - c.lat) * (closing ? 0.15 : 0.8);
      if (score > bestScore) { bestScore = score; best = lat; }
    }
    return best;
  }
}
