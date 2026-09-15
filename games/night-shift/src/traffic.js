// ===================== HIGHWAY :: TRAFFIC =====================
// The road is full of ordinary cars going about their business. They live in
// TRACK SPACE - a distance along the road and a lane - which makes spawning,
// overtaking and cleanup trivial and keeps them in their lanes however the road
// curves.
//
// They are kinematic, not simulated. A traffic car that can be shoved around by
// physics is one that wanders into your lane unpredictably, and this whole game
// is about reading gaps. Clip one and it is knocked loose for a couple of
// seconds, which is enough drama.

import { Car } from './physics.js';
import { buildSpec, CARS, CIVILIAN } from './catalog.js';
import { LANE_W } from './track.js';

const AHEAD_MIN = 80, AHEAD_MAX = 330;
const BEHIND_CULL = 140;
const DULL = ['#c8ccd2', '#8f96a0', '#2b3038', '#4a5260', '#d8d4cc',
              '#5c6b7a', '#7a6a5c', '#38424e', '#a8aeb6', '#1f242c',
              '#9aa4b0', '#6a5f55'];

export class Traffic {
  constructor(track) {
    this.track = track;
    this.cars = [];
    // Mostly civilian vehicles - vans, pickups and boxes are what make a road
    // read as a road rather than a row of identical coupes.
    this.pool = [...CIVILIAN.map(c => c.id), ...CIVILIAN.map(c => c.id),
                 ...CARS.filter(c => c.tier <= 1).map(c => c.id)];
  }

  clear() { this.cars.length = 0; }

  spawn(playerS) {
    const T = this.track;
    const s = playerS + AHEAD_MIN + Math.random() * (AHEAD_MAX - AHEAD_MIN);
    const p = T.at(s);
    const lane = (Math.random() * p.lanes) | 0;
    const oncoming = false;
    for (const o of this.cars) {
      if (o.lane === lane && Math.abs(o.s - s) < 34) return;
    }
    const id = this.pool[(Math.random() * this.pool.length) | 0];
    const spec = buildSpec(id, {
      paint: DULL[(Math.random() * DULL.length) | 0],
      accent: '#20242c', kit: 'stock', wheel: 'stockw',
    });
    const lat = T.laneLat(lane, p.lanes);
    const w = T.toWorld(s, lat);
    const car = new Car(spec, w.x, w.y, w.dir + (oncoming ? Math.PI : 0));
    car.traffic = true;
    car.headlights = true;
    car.s = s;
    car.lane = lane;
    car.lat = lat;
    car.oncoming = oncoming;
    // Oncoming traffic is the dangerous half of the road, so it comes at you.
    car.cruise = 13 + Math.random() * 16;
    car.speed = car.cruise;
    car.loose = 0;
    car.passed = false;
    car.laneChangeT = 4 + Math.random() * 12;
    car.targetLane = lane;
    car.blink = 0;          // -1 left, +1 right, 0 none
    car.blinkT = 0;         // indicating, before the car actually moves
    car.merging = false;
    this.cars.push(car);
  }

  update(dt, playerS, want) {
    const T = this.track;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.s < playerS - BEHIND_CULL || c.s > playerS + AHEAD_MAX + 400) {
        this.cars.splice(i, 1);
      }
    }
    let guard = 0;
    while (this.cars.length < want && guard++ < 6) this.spawn(playerS);

    for (const c of this.cars) {
      if (c.loose > 0) {
        // knocked out of its lane: coast, then rejoin whatever lane it ends in
        // A loose car integrates its own velocity, so that velocity has to be
        // damped and kept in step with its speed. Leaving it holding whatever the
        // impulse resolver gave it meant a knocked car carried a 40 m/s vector
        // around and killed you the next time you touched it.
        c.loose -= dt;
        const damp = 1 - Math.min(0.9, dt * 1.2);
        c.vx *= damp; c.vy *= damp;
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.speed = Math.hypot(c.vx, c.vy);
        c.h = Math.atan2(c.vy, c.vx);
        const pr = T.project(c.x, c.y, c.s);
        c.s = pr.s; c.lat = pr.lat;
        if (c.loose <= 0) {
          c.lane = Math.max(0, Math.min(pr.lanes - 1,
            Math.round(pr.lat / LANE_W + (pr.lanes - 1) / 2)));
          c.speed = c.cruise * 0.7;
        }
        c.wheelSpin += c.speed * dt;
        continue;
      }

      const p = T.at(c.s);
      const lo = 0, hi = Math.max(0, p.lanes - 1);

      // INDICATE, THEN MERGE. Traffic used to teleport between lanes in about
      // four tenths of a second with no warning, which is unreadable at speed.
      // Now it signals for the best part of a second first and then takes a
      // couple of seconds to come across, so you can see it coming and plan.
      c.laneChangeT -= dt;
      if (!c.merging && c.blinkT <= 0 && c.laneChangeT <= 0) {
        c.laneChangeT = 7 + Math.random() * 14;
        const dirn = Math.random() < 0.5 ? -1 : 1;
        const next = c.lane + dirn;
        if (next >= lo && next <= hi && !this.laneBusy(c, next)) {
          c.targetLane = next;
          c.blink = dirn;
          c.blinkT = 0.7 + Math.random() * 0.5;
        }
      }
      if (c.blinkT > 0) {
        c.blinkT -= dt;
        if (c.blinkT <= 0) { c.lane = c.targetLane; c.merging = true; }
      }
      c.lane = Math.max(lo, Math.min(hi, c.lane));

      // hold a gap to whatever is in front in the same lane
      let ahead = 999;
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane || o.oncoming !== c.oncoming) continue;
        const gap = (o.s - c.s) * (c.oncoming ? -1 : 1);
        if (gap > 0) ahead = Math.min(ahead, gap);
      }
      const target = ahead < 30 ? Math.max(4, c.cruise * (ahead / 30)) : c.cruise;
      c.braking = target < c.speed - 1.2;
      c.speed += (target - c.speed) * Math.min(1, dt * 1.6);

      c.s += c.speed * dt * (c.oncoming ? -1 : 1);
      const wantLat = T.laneLat(c.lane, p.lanes);
      const easeRate = c.merging ? 1.1 : 2.4;       // ~2.4 s to change lane
      c.lat += (wantLat - c.lat) * Math.min(1, dt * easeRate);
      if (c.merging && Math.abs(wantLat - c.lat) < 0.25) { c.merging = false; c.blink = 0; }
      const w = T.toWorld(c.s, c.lat);
      c.x = w.x; c.y = w.y;
      c.h = w.dir + (c.oncoming ? Math.PI : 0);
      // Velocity ANALYTICALLY, not by differencing positions. A lane change or
      // a lane-count change moves the car sideways in one frame, and the finite
      // difference read that as 50 m/s - which the collision code then treated
      // as a 180 km/h impact and ended the run on an ordinary nudge.
      c.vx = Math.cos(c.h) * c.speed;
      c.vy = Math.sin(c.h) * c.speed;
      c.wheelSpin += c.speed * dt;
      c.crashT = Math.max(0, c.crashT - dt);
    }
  }

  laneBusy(c, lane) {
    for (const o of this.cars) {
      if (o === c) continue;
      // a car heading INTO that lane already counts as occupying it
      const claims = o.lane === lane || (o.blinkT > 0 && o.targetLane === lane);
      if (!claims) continue;
      if (Math.abs(o.s - c.s) < 40) return true;
    }
    return false;
  }

  // Knock one out of its lane - called when the player clips it.
  shunt(c, force) {
    c.loose = Math.min(2.5, 0.7 + force / 18);
    c.speed = Math.max(2, c.speed - force * 0.3);
    // cap what it carries away, so a shunt never becomes a projectile
    const v = Math.hypot(c.vx, c.vy);
    const cap = Math.min(v, c.cruise * 1.4);
    if (v > 0.01) { c.vx = c.vx / v * cap; c.vy = c.vy / v * cap; }
  }
}
