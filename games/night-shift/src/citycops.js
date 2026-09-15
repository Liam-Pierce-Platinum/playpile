// ===================== NIGHT SHIFT :: THE POLICE =====================
// They have to kill you. That is the only way this ends.
//
// There is no arrest meter. Pulling alongside does nothing, and neither does
// wrecking your car - that only puts you on the pavement. What they are
// actually trying to do is a sequence:
//
//   1. find you, and keep you in sight
//   2. stop the car - PIT it, ram it, or shoot it to pieces
//   3. get you out of it
//   4. get out THEMSELVES and put you down
//
// Every one of those is a step you can interfere with, which is what makes a
// run a run instead of a countdown.
//
// They also stay ON THE ROAD. A patrol that cut across a block would beat you
// to every corner, and then there would be no point knowing the city.

import { Car, clamp, carsTouching, boxOut } from './physics.js';
import { buildSpec } from './catalog.js';

const COP_CARS = ['crownvic', 'gnx', 'chevelle', 'hellcat', 'demon'];
const SIGHT = 105;
const SEARCH_HOLD = 70;           // how long they work an area before giving up
const PIT_RANGE = 8.5;
const RECYCLE = 300;
const BAIL_RANGE = 42;            // how close before they get out and come on foot
const FIRE_RANGE = 26;            // they close before they shoot; a running
                                  // gunfight across a whole block is just an
                                  // unavoidable death from off screen

export class CityPolice {
  constructor(city) {
    this.city = city;
    this.cars = [];
    this.foot = [];
    this.reset();
  }

  reset() {
    this.cars.length = 0;
    this.foot.length = 0;
    this.heat = 2;
    this.heatFloat = 2;
    this.busted = false;
    this.spawnT = 1.0;
    this.pitT = 0;
    this.seen = 1;
    this.lastSeen = { x: 0, y: 0 };
    this.searchT = 14;
    this.lastWreck = 0;
    this.shots = [];
    // Where the first units are going. Before anyone has seen you, the only
    // thing they have is an address, so that is where they go - which is why
    // the first thirty seconds of a run are quiet in every direction except
    // the one you came from.
    this.scene = null;
    this.cordons = [];
    this.house = null;
    this.raidT = 0;
    // the building they are currently working, and who is inside it
    this.siege = null;
    // how many units are physically at the crime scene right now
    this.sceneUnits = 0;
    // FIRE DISCIPLINE. Seven officers all shooting the instant they see you
    // is 35 damage a second and nothing a human can react to - you were dead
    // about two seconds after leaving the car. Only a couple of them engage
    // at a time; the rest are moving, taking cover, or closing.
    this.firing = 0;
    this.fireSlots = 2;
  }

  make(x, y, h, level, speed) {
    const spec = buildSpec(COP_CARS[Math.min(COP_CARS.length - 1, level)], {
      tune: { power: 3 + level, tyre: 4, brakes: 4, susp: 4 + level, weight: 2, armour: 3 },
      paint: '#12151b', accent: '#e8eaee', kit: 'street', wheel: 'race',
      livery: 'wide', glow: 'none',
    });
    const c = new Car(spec, x, y, h);
    c.copCar = true;
    c.headlights = true;
    c.speed = Math.max(12, (speed || 0) * 0.9);
    c.path = null; c.pathI = 0;
    c.pitting = 0;
    c.gentle = true;
    c.repathT = 0;
    c.wrecked = 0;
    c.hp = 130;
    c.baseTop = spec.topSpeed;
    c.basePow = spec.power;
    c.crew = Math.random() < 0.62 ? 1 : 2;         // usually one, sometimes two
    return c;
  }

  // ---- sight -------------------------------------------------------------
  // Can anyone physically see you right now?
  checkSight(px, py, hidden, buildings) {
    // Hidden means out of sight from the street. It does not mean anything
    // to somebody standing on the same floor as you.
    for (const f of this.foot) {
      if (f.down || !f.inside) continue;
      if (f.onPlayerFloor && Math.hypot(f.x - px, f.y - py) < 22) return 1;
    }
    if (hidden) return 0;
    for (const c of this.cars) {
      if (c.wrecked > 0) continue;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d > SIGHT) continue;
      if (d < 30) return 1;
      if (!this.blocked(c.x, c.y, px, py, buildings)) return 1;
    }
    for (const f of this.foot) {
      if (f.down) continue;
      if (Math.hypot(f.x - px, f.y - py) < SIGHT * 0.7
          && !this.blocked(f.x, f.y, px, py, buildings)) return 1;
    }
    return 0;
  }

  blocked(ax, ay, bx, by, buildings) {
    const dx = bx - ax, dy = by - ay;
    const steps = Math.min(14, Math.max(3, Math.hypot(dx, dy) / 9));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, y = ay + dy * t;
      for (const b of buildings) {
        const cs = Math.cos(-b.ang), sn = Math.sin(-b.ang);
        const u = cs * (x - b.x) - sn * (y - b.y);
        const v = sn * (x - b.x) + cs * (y - b.y);
        if (Math.abs(u) < b.w / 2 && Math.abs(v) < b.d / 2) return true;
      }
    }
    return false;
  }

  // Does anything they have match what they are looking at?
  //
  // In the car it is the vehicle description, and only while you are still
  // in the car they know about. On foot it is the clothes or the face. And
  // regardless of any of that, driving like a lunatic gets you looked at by
  // anybody - which is the pressure that stops "have no description" being
  // a licence to do whatever you want in front of them.
  recognises(world) {
    const H = world.hunt;
    if (!H) return 1;
    // Somebody who has followed you into a building and up two flights during
    // a sweep does not need a description. Being the only person on a floor
    // they are clearing IS the identification.
    if (world.cornered) return 1;
    if (world.loud) return 1;               // shooting, ramming, a wrecked car
    // Driving badly is a reason to be STOPPED, not a reason to be chased.
    // It builds suspicion, and suspicion produces a question. Treating it as
    // recognition meant a patrol would run you down for speeding while they
    // had no idea who you were.
    if (world.reckless && world.hunt && world.hunt.descriptionStrength > 0.25) return 1;
    if (world.onFoot) {
      if (H.known.face && !H.wearingMask) return 1;
      if (H.known.clothing) return 1;
      // build alone is thin - it takes a long look, and only up close
      if (H.known.build && world.close) return 1;
      return 0;
    }
    if (H.known.vehicle && !world.carSwapped) return 1;
    if (H.known.face && !H.wearingMask && world.close) return 1;
    return 0;
  }

  addHeat(a) {
    this.heatFloat = clamp(this.heatFloat + a, 2, 5);
    const lvl = Math.floor(this.heatFloat);
    if (lvl > this.heat) { this.heat = lvl; return true; }
    this.heat = Math.max(2, Math.min(this.heat, lvl));
    return false;
  }

  update(dt, world) {
    const C = this.city;
    const { px, py, hidden, buildings, onFoot, playerSpeed, combat } = world;
    this.shots.length = 0;
    this.firing = 0;

    // SPOTTED is physical. RECOGNISED is what actually starts a chase.
    const spotted = this.checkSight(px, py, hidden, buildings);
    const see = spotted && this.recognises(world);
    this.spotted = spotted;
    this.seen = see;

    // Out in the open they always have something to go on - a call, a
    // description, a unit two streets over. Hiding is the only thing that
    // actually stops the clock on them.
    if (!hidden) this.searchT = Math.max(this.searchT, 7);

    // Heat is a manhunt mobilising, not a line of sight.
    if (!hidden) {
      this.addHeat(dt * (0.045 + (playerSpeed > 26 ? 0.045 : 0) + (see ? 0.07 : 0)));
    }
    if (see) {
      this.everSeen = true;
      this.lastSeen.x = px; this.lastSeen.y = py;
      this.searchT = SEARCH_HOLD;
      this.lostFor = 0;
    }
    else {
      this.searchT = Math.max(0, this.searchT - dt);
      this.lostFor = (this.lostFor || 0) + dt;
      if (hidden) this.addHeat(-dt * (this.searchT > 0 ? 0.020 : 0.055));
      else this.addHeat(-dt * 0.004);
    }
    const lost = !see;

    // ---- dispatch ----
    this.spawnT -= dt;
    const live = this.cars.filter(c => c.wrecked <= 0 && !c.blocker).length;
    if (live < this.heat && this.spawnT <= 0 && this.searchT > 0) {
      const from = (this.scene && !this.everSeen) ? this.scene : { x: px, y: py };
      const spot = this.spawnSpot(from.x, from.y);
      if (spot) {
        this.cars.push(this.make(spot.x, spot.y, spot.h, this.heat - 1, playerSpeed));
        this.spawnT = this.heat >= 4 ? 1.6 : 2.6;
      } else this.spawnT = 0.6;
    }

    // ---- who is at the scene? ----
    // First responders stay put and work it. They only abandon it if you
    // turn up in front of them, because a person running past is worth more
    // than a statement that will still be there in five minutes.
    this.sceneUnits = 0;
    if (this.scene) {
      let held = 0;
      for (const c2 of this.cars) {
        if (c2.wrecked > 0 || c2.blocker) continue;
        const ds = Math.hypot(c2.x - this.scene.x, c2.y - this.scene.y);
        if (c2.atScene) {
          // called off it if you are close enough to chase
          if (see && Math.hypot(c2.x - px, c2.y - py) < 70) { c2.atScene = false; continue; }
          held++;
          if (ds < 26) this.sceneUnits++;
          continue;
        }
        // assign up to two, preferring whoever is already nearest to it
        if (held < 2 && !see) {
          const dp = Math.hypot(c2.x - px, c2.y - py);
          if (ds < dp || ds < 140) { c2.atScene = true; held++; }
        }
      }
      for (const f of this.foot) {
        if (f.down || f.inside) continue;
        if (Math.hypot(f.x - this.scene.x, f.y - this.scene.y) < 26) this.sceneUnits++;
      }
    }

    // ---- the cars ----
    this.pitT = Math.max(0, this.pitT - dt);
    let nearest = 1e9;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.wrecked > 0) {
        c.wrecked -= dt;
        c.speed = Math.max(0, c.speed - dt * 16);
        c.h += c.spinRate * dt; c.spinRate *= 1 - dt * 0.9;
        c.x += Math.cos(c.h) * c.speed * dt;
        c.y += Math.sin(c.h) * c.speed * dt;
        c.vx = Math.cos(c.h) * c.speed; c.vy = Math.sin(c.h) * c.speed;
        // the crew get out of a car that is finished
        if (!c.bailed && c.crew > 0) this.bailOut(c);
        if (c.wrecked <= 0) this.cars.splice(i, 1);
        continue;
      }
      if (c.blocker) {
        c.speed = 0; c.vx = 0; c.vy = 0; c.braking = true;
        // the crew stand by the cars, and they can see you go past
        if (!c.bailed && c.crew > 0 && Math.hypot(c.x - px, c.y - py) < 60) this.bailOut(c);
        continue;
      }
      const dist = Math.hypot(c.x - px, c.y - py);
      if (dist > RECYCLE) {
        const spot = this.spawnSpot(px, py);
        if (spot) { c.place(spot.x, spot.y, spot.h); c.speed = Math.max(14, playerSpeed * 0.9); c.path = null; }
        continue;
      }
      nearest = Math.min(nearest, dist);

      // ---- get out and take it on foot ----
      // Once you are out of your car, or they have you stopped, sitting in a
      // cruiser achieves nothing. They dismount and come for you.
      if (!c.bailed && c.crew > 0 && this.searchT > 0) {
        const shouldBail = (onFoot && dist < BAIL_RANGE && c.speed < 14)
                        || (!onFoot && dist < 16 && playerSpeed < 5 && c.speed < 6);
        if (shouldBail) { this.bailOut(c); c.speed *= 0.3; }
      }

      // Nobody has seen you yet: they are going to the scene, not to you.
      const toScene = this.scene && !this.everSeen;
      let goalX, goalY;
      if (c.atScene && this.scene) {
        // it works the scene: park on it and stay
        goalX = this.scene.x; goalY = this.scene.y;
        if (Math.hypot(c.x - goalX, c.y - goalY) < 20) {
          c.braking = true;
          c.updateFree(dt, { steer: 0, throttle: 0, brake: 1 }, 1);
          if (!c.bailed && c.crew > 0 && c.speed < 3) this.bailOut(c);
          continue;
        }
      }
      else if (toScene) { goalX = this.scene.x; goalY = this.scene.y; }
      else if (lost) {
        // Fan out. Each unit takes a different bearing off the last sighting,
        // and the ring widens as the trail ages because you have not been
        // standing still. Sitting on the exact spot they lost you is how a
        // search fails.
        if (c.searchAng === undefined) c.searchAng = Math.random() * Math.PI * 2;
        const ring = Math.min(230, 30 + (this.lostFor || 0) * 16);
        goalX = this.lastSeen.x + Math.cos(c.searchAng) * ring;
        goalY = this.lastSeen.y + Math.sin(c.searchAng) * ring;
        // arrived at its patch with nothing to show: take a new bearing
        if (Math.hypot(c.x - goalX, c.y - goalY) < 34) {
          c.searchAng += 1.1 + Math.random() * 1.6;
          // and the search creeps toward wherever you actually are, slowly.
          // Not cheating - a cordon genuinely closes, and a search that
          // never narrows is one you can sit out forever.
          this.lastSeen.x += (px - this.lastSeen.x) * 0.12;
          this.lastSeen.y += (py - this.lastSeen.y) * 0.12;
        }
      } else { goalX = px; goalY = py; c.searchAng = undefined; }

      c.repathT -= dt;
      if (!c.path || c.repathT <= 0) {
        c.repathT = 1.1 + Math.random() * 0.8;
        c.path = C.route(C.nearestNode(c.x, c.y), C.nearestNode(goalX, goalY), 420);
        c.pathI = 0;
      }

      // THEY STAY ON THE ROAD. Even close in, the aiming point is pulled back
      // onto the street unless the straight line is already tarmac - so they
      // come round the block instead of straight through it.
      let ax = goalX, ay = goalY;
      if (c.path && c.path.length && (dist > 26 || !this.onRoadBetween(c, px, py))) {
        while (c.pathI < c.path.length - 1 &&
               Math.hypot(c.path[c.pathI].x - c.x, c.path[c.pathI].y - c.y) < 22) c.pathI++;
        const wp = c.path[Math.min(c.pathI, c.path.length - 1)];
        ax = wp.x; ay = wp.y;
      }

      let ang = Math.atan2(ay - c.y, ax - c.x);
      c.pitting = Math.max(0, c.pitting - dt);
      if (!onFoot && dist < PIT_RANGE && this.pitT <= 0 && see) {   // never a random car
        c.pitting = 0.8; this.pitT = 2.6;
      }
      if (c.pitting > 0) ang = Math.atan2(py - c.y, px - c.x);
      c.gentle = c.pitting <= 0;

      let d = ang - c.h;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const steer = clamp(d * 1.7, -1, 1);

      const surf = C.surfaceAt(c.x, c.y);
      const grip = surf.onRoad ? 1 : 0.6;
      c.spec.topSpeed = c.baseTop * (1 + clamp(dist / 160, 0, 1) * 0.5);
      c.spec.power = c.basePow * (1 + clamp(dist / 160, 0, 1) * 0.8);
      const wantSpeed = dist > 26 ? c.spec.topSpeed / 3.6
                                  : Math.max(6, playerSpeed + (dist - 9) * 0.5);
      const corner = Math.min(1, Math.abs(d) * 1.5);
      const cap = Math.min(wantSpeed, (34 - corner * 22) + (dist < 20 ? 8 : 0));
      c.braking = c.speed > cap + 4;
      c.updateFree(dt, { steer, throttle: c.speed < cap ? 1 : 0,
                         brake: c.braking ? 0.75 : 0 }, grip);
      // A patrol that can clip a corner is not on the road, whatever its
      // routing says. The walls apply to them exactly as they do to you.
      for (const b of buildings) {
        const into = boxOut(b, c, true);
        if (into > 22) { c.wrecked = 2.4; c.spinRate = (Math.random() - 0.5) * 5; }
      }

      // ---- shooting from the car ----
      // Only at a stopped or slow target. A rolling gun battle at 90 mph would
      // be nonsense, and it would kill you before you learned anything.
      c.fireT = Math.max(0, (c.fireT || 0) - dt);
      if (see && combat && dist < FIRE_RANGE && c.fireT <= 0
          && playerSpeed < 9 && c.speed < 9 && this.firing < this.fireSlots) {
        this.firing++;
        c.fireT = 1.1 + Math.random() * 0.8;
        const a = Math.atan2(py - c.y, px - c.x);
        combat.copFire(c.x + Math.cos(a) * 1.6, c.y + Math.sin(a) * 1.6, a, 0.55);
        this.shots.push({ x: c.x, y: c.y, a });
      }
    }

    // ---- officers on foot ----
    for (let i = this.foot.length - 1; i >= 0; i--) {
      const f = this.foot[i];
      if (f.down) {
        f.downT = (f.downT || 0) + dt;
        if (f.downT > 14) this.foot.splice(i, 1);
        continue;
      }
      if (f.inside || f.covering) {
        // the siege moves them, but they still shoot
        if (f.inside && f.onPlayerFloor && combat && see) {
          f.fireT = Math.max(0, (f.fireT || 0) - dt);
          const dd = Math.hypot(px - f.x, py - f.y);
          if (dd < 20 && f.fireT <= 0 && this.firing < this.fireSlots) {
            this.firing++;
            f.fireT = 0.95 + Math.random() * 0.9;
            const aa = Math.atan2(py - f.y, px - f.x);
            combat.copFire(f.x + Math.cos(aa) * 1.1, f.y + Math.sin(aa) * 1.1, aa, 0.7);
            this.shots.push({ x: f.x, y: f.y, a: aa });
          }
          nearest = Math.min(nearest, dd);
        }
        continue;
      }
      const gx = lost ? this.lastSeen.x : px;
      const gy = lost ? this.lastSeen.y : py;
      const d = Math.hypot(gx - f.x, gy - f.y);
      const a = Math.atan2(gy - f.y, gx - f.x);
      f.h = a;

      // close to a working distance, then stand and shoot - rather than running
      // into your muzzle
      const want = see ? 13 : 0;
      const move = d > want ? 1 : (d < want * 0.6 ? -0.5 : 0);
      const sp = 6.4;
      const nx = f.x + Math.cos(a) * sp * move * dt;
      const ny = f.y + Math.sin(a) * sp * move * dt;
      let ok = true;
      for (const b of buildings) {
        const cs = Math.cos(-b.ang), sn = Math.sin(-b.ang);
        const u = cs * (nx - b.x) - sn * (ny - b.y);
        const v = sn * (nx - b.x) + cs * (ny - b.y);
        if (Math.abs(u) < b.w / 2 + 0.4 && Math.abs(v) < b.d / 2 + 0.4) { ok = false; break; }
      }
      if (ok) { f.x = nx; f.y = ny; }
      f.speed = Math.abs(sp * move);
      f.step = (f.step || 0) + f.speed * dt * 2.6;
      nearest = Math.min(nearest, d);

      f.fireT = Math.max(0, (f.fireT || 0) - dt);
      // `hidden` means hidden from the STREET. An officer on the same floor
      // as you is not on the street, and was being told to hold fire.
      if (see && combat && d < FIRE_RANGE && f.fireT <= 0 && (!hidden || f.onPlayerFloor)
          && this.firing < this.fireSlots) {
        this.firing++;
        f.fireT = 0.95 + Math.random() * 0.9;
        combat.copFire(f.x + Math.cos(a) * 1.1, f.y + Math.sin(a) * 1.1, a, 0.68);
        this.shots.push({ x: f.x, y: f.y, a });
      }
    }
    // they give up on foot once the trail is properly cold
    if (this.searchT <= 0 || (hidden && this.searchT < 9)) {
      for (let i = this.foot.length - 1; i >= 0; i--) {
        if (!this.foot[i].down) this.foot.splice(i, 1);
      }
    }

    return { nearest, seen: see, searching: this.searchT > 0 && !see,
             onFootCount: this.foot.filter(f => !f.down).length };
  }

  // CORDONS. They shut the crossings first and then the arteries, because
  // that is how you actually contain somebody on an island. A checkpoint is
  // two cars parked broadside with the lights on - you can still get past
  // one, but not at speed and not unseen.
  updateCordons(dt, level, px, py) {
    const C = this.city;
    const want = Math.floor(level * 7);
    if (this.cordons.length < want && (this.cordonT = (this.cordonT || 0) - dt) <= 0) {
      this.cordonT = 3.5;
      // bridges first, then arteries, and never right on top of the player
      const pool = C.roads.filter(r =>
        (r.kind === 'bridge' || r.kind === 'artery') &&
        !this.cordons.some(k => k.road === r));
      pool.sort((a, b) => {
        const pa = a.kind === 'bridge' ? 0 : 1, pb = b.kind === 'bridge' ? 0 : 1;
        return pa - pb;
      });
      for (const r of pool) {
        const mx = (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2;
        if (Math.hypot(mx - px, my - py) < 130) continue;
        const ang = Math.atan2(r.uy, r.ux) + Math.PI / 2;
        const cars = [];
        for (let k = -1; k <= 1; k += 2) {
          const car = this.make(mx + Math.cos(ang) * k * 3.2,
                                my + Math.sin(ang) * k * 3.2, ang, this.heat - 1, 0);
          car.speed = 0; car.blocker = true; car.crew = 1;
          cars.push(car); this.cars.push(car);
        }
        this.cordons.push({ road: r, x: mx, y: my, cars, name: r.name || r.kind });
        this.newCordon = r.name || null;
        break;
      }
    }
    // lifted again as the response winds down
    while (this.cordons.length > want) {
      const k = this.cordons.pop();
      for (const car of k.cars) {
        const i = this.cars.indexOf(car);
        if (i >= 0) this.cars.splice(i, 1);
      }
    }
  }

  // THE RAID. Once they have your name they have your address, and units go
  // there whether you are in it or not. Being home when they arrive is the
  // worst thing that can happen to you in this game.
  raid(dt, home, px, py) {
    if (!home) return false;
    this.raidT += dt;
    if (this.raidT < 6) return false;
    if (Math.hypot(px - home.x, py - home.y) < 90) {
      this.lastSeen.x = px; this.lastSeen.y = py;
      this.searchT = 16;
      this.everSeen = true;
      return true;
    }
    return false;
  }

  // ---- going in after you ----
  // Officers who reach the building go inside and start climbing. One heads
  // for the back door and stays there, because the first thing you do when
  // you surround a building is stop it having two exits.
  updateSiege(dt, world) {
    const { inBuilding, playerFloor, px, py, buildings } = world;
    if (!inBuilding || this.searchT <= 0) {
      if (this.siege) {
        for (const o of this.foot) { o.inside = null; o.floor = 0; o.covering = false; }
        this.siege = null;
      }
      return null;
    }
    if (!this.siege || this.siege.bl !== inBuilding) {
      this.siege = { bl: inBuilding, t: 0, entered: 0 };
    }
    const S = this.siege;
    S.t += dt;
    const bl = S.bl;

    // pull officers to the doors
    // `covered` has to account for whoever is ALREADY on the back door. Reset
    // to false every frame it promoted one more officer to cover per frame,
    // until the entire squad was standing at the back and nobody went in.
    let covered = this.foot.some(o => !o.down && o.covering);
    for (const o of this.foot) {
      if (o.down) continue;
      if (o.inside === bl) continue;
      // the first one available takes the back and holds it
      if (!covered && !o.covering) { o.covering = true; covered = true; }
      else if (!covered) covered = !!o.covering;
      const goal = o.covering ? this.backDoorOf(bl) : bl.door;
      const d = Math.hypot(goal.x - o.x, goal.y - o.y);
      const a = Math.atan2(goal.y - o.y, goal.x - o.x);
      o.h = a;
      const sp = 6.8;
      if (d > 1.6) {
        const nx = o.x + Math.cos(a) * sp * dt, ny = o.y + Math.sin(a) * sp * dt;
        let ok = true;
        for (const b of buildings) {
          if (b === bl) continue;
          const cs = Math.cos(-b.ang), sn = Math.sin(-b.ang);
          const u = cs * (nx - b.x) - sn * (ny - b.y);
          const v = sn * (nx - b.x) + cs * (ny - b.y);
          if (Math.abs(u) < b.w / 2 + 0.4 && Math.abs(v) < b.d / 2 + 0.4) { ok = false; break; }
        }
        if (ok) { o.x = nx; o.y = ny; }
        o.speed = sp;
        o.step = (o.step || 0) + sp * dt * 2.6;
      } else if (!o.covering) {
        // through the door and up
        o.inside = bl; o.floor = 0; o.climbT = 0;
        S.entered++;
      }
    }

    // the ones inside climb. More of them is faster, because they split up.
    let onYourFloor = 0;
    const inside = this.foot.filter(o => !o.down && o.inside === bl);
    for (const o of inside) {
      if (o.floor === playerFloor) {
        onYourFloor++;
        // on your floor they hunt you across it
        const a = Math.atan2(py - o.y, px - o.x);
        o.h = a;
        const d = Math.hypot(px - o.x, py - o.y);
        if (d > 3) {
          o.x += Math.cos(a) * 5.6 * dt;
          o.y += Math.sin(a) * 5.6 * dt;
          o.speed = 5.6;
          o.step = (o.step || 0) + 5.6 * dt * 2.6;
        } else o.speed = 0;
        continue;
      }
      // a flight of stairs takes time, and a barricade on the way costs more
      o.climbT = (o.climbT || 0) + dt * (1 + inside.length * 0.35);
      const need = 3.4 + (world.barricaded && o.floor + 1 === playerFloor ? 9 : 0);
      if (o.climbT >= need) {
        o.climbT = 0;
        o.floor += (o.floor < playerFloor ? 1 : -1);
        // put them at the stair head of the new floor
        const it = world.interiorOf(bl);
        const st = (it.plan[o.floor].stairs || [it.plan[o.floor].stair])[0];
        const cs = Math.cos(bl.ang), sn = Math.sin(bl.ang);
        o.x = bl.x + cs * st.x - sn * st.y;
        o.y = bl.y + sn * st.x + cs * st.y;
      }
    }
    return { entered: S.entered, inside: inside.length, onYourFloor };
  }

  backDoorOf(bl) {
    // straight through and out the other side
    return { x: bl.x - (bl.door.x - bl.x), y: bl.y - (bl.door.y - bl.y) };
  }

  // An officer steps out of the car door, not out of thin air.
  bailOut(c) {
    c.bailed = true;
    const side = Math.random() < 0.5 ? 1 : -1;
    for (let k = 0; k < c.crew; k++) {
      this.foot.push({
        x: c.x - Math.sin(c.h) * side * (2.0 + k * 1.2),
        y: c.y + Math.cos(c.h) * side * (2.0 + k * 1.2),
        h: c.h, speed: 0, step: 0, hp: 100, down: false, r: 0.72, from: c,
        fireT: 0.9 + Math.random() * 0.6,
      });
    }
    c.crew = 0;
  }

  // Is the straight line to you already tarmac? If it is they can cut across a
  // junction; if not, they follow the street.
  onRoadBetween(c, px, py) {
    for (let t = 0.25; t <= 1; t += 0.25) {
      if (!this.city.surfaceAt(c.x + (px - c.x) * t, c.y + (py - c.y) * t).onRoad) return false;
    }
    return true;
  }

  spawnSpot(px, py) {
    const C = this.city;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 95 + Math.random() * 130;
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      const s = C.surfaceAt(x, y);
      if (!s.onRoad || !s.road) continue;
      return { x, y, h: Math.atan2(py - y, px - x) };
    }
    return null;
  }

  checkWrecks(traffic) {
    for (const c of this.cars) {
      if (c.wrecked > 0) continue;
      for (const t of traffic) {
        if (!carsTouching(c, t)) continue;
        if (Math.hypot(c.vx - t.vx, c.vy - t.vy) > 26) {
          c.wrecked = 2.6;
          c.spinRate = (Math.random() - 0.5) * 6;
          this.lastWreck = 1;
        }
        break;
      }
    }
  }
}
