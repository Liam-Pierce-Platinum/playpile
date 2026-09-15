// ===================== NIGHT SHIFT :: ON FOOT =====================
// You are not the car. The car is a thing you are currently using, and most of
// the ways out of this do not involve one.
//
// On foot you are slow and quiet and you fit where a car cannot. The building
// systems live here: going in, going UP, and shutting a door behind you.
//
// Going up is the decision the whole interior exists for. Every floor you climb
// is another floor they have to clear to reach you - and another floor between
// you and the street when you finally have to leave. A tower is the safest
// place in the city and the worst place to be trapped, and those are the same
// fact.

import { interiorOf } from './city.js';

const WALK = 3.1;
const RUN = 8.4;                  // a genuine sprint - the old 6.1 was a jog
const STAM_MAX = 6.2;
const RADIUS = 0.42;
const REACH = 3.4;

export class Pedestrian {
  constructor(city) {
    this.city = city;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.h = 0;
    this.vx = 0; this.vy = 0;
    this.speed = 0;
    this.stam = STAM_MAX;
    this.blown = false;
    this.inside = null;
    this.floor = 0;
    this.room = null;             // the room you are standing in, if any
    this.step = 0;
    this.enterCool = 0;
    this.busy = 0;                // barricading, changing, anything that takes time
    this.busyWhat = null;
  }

  get kph() { return this.speed * 3.6; }
  get plan() {
    return this.inside ? interiorOf(this.inside).plan[this.floor] : null;
  }

  update(dt, ctrl, buildings, tired) {
    this.enterCool = Math.max(0, this.enterCool - dt);

    // an action you are part way through: you cannot run while doing it, and
    // that commitment is the cost of barricading a door with someone coming
    if (this.busy > 0) {
      this.busy -= dt;
      this.vx = this.vy = 0; this.speed = 0;
      if (this.busy <= 0) { const w = this.busyWhat; this.busyWhat = null; return w; }
      return null;
    }

    const wantRun = !!ctrl.run && !this.blown && !tired;
    if (wantRun && (Math.abs(ctrl.mx) + Math.abs(ctrl.my)) > 0.1) {
      this.stam -= dt;
      if (this.stam <= 0) { this.stam = 0; this.blown = true; }
    } else {
      this.stam = Math.min(STAM_MAX, this.stam + dt * 0.80);
      if (this.stam > STAM_MAX * 0.4) this.blown = false;
    }
    const top = (wantRun && this.stam > 0 ? RUN : WALK) * (tired ? 0.7 : 1);

    let mx = ctrl.mx || 0, my = ctrl.my || 0;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const k = Math.min(1, dt * 16);
    this.vx += (mx * top - this.vx) * k;
    this.vy += (my * top - this.vy) * k;

    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    if (this.inside) {
      const hit = this.slideWalls(nx, ny);
      nx = hit.x; ny = hit.y;
    } else {
      for (const b of buildings) {
        const p = this.pushOut(b, nx, ny);
        nx = p.x; ny = p.y;
      }
    }
    this.x = nx; this.y = ny;
    this.speed = Math.hypot(this.vx, this.vy);
    if (this.speed > 0.15) this.h = Math.atan2(this.vy, this.vx);
    this.step += this.speed * dt * 2.6;

    if (this.inside) this.room = this.roomAt(this.x, this.y);
    return null;
  }

  // ---- outdoors: buildings are solid, doorways are not ----
  pushOut(b, x, y) {
    const cs = Math.cos(-b.ang), sn = Math.sin(-b.ang);
    const dx = x - b.x, dy = y - b.y;
    const u = cs * dx - sn * dy, v = sn * dx + cs * dy;
    const hu = b.w / 2 + RADIUS, hv = b.d / 2 + RADIUS;
    if (Math.abs(u) > hu || Math.abs(v) > hv) return { x, y };
    const gap = b.garage ? b.mouth : 2.6;
    const onDoorFace =
      (b.doorSide === 'v-' && v < 0) || (b.doorSide === 'v+' && v > 0) ||
      (b.doorSide === 'u-' && u < 0) || (b.doorSide === 'u+' && u > 0);
    const acrossDoor = (b.doorSide === 'v-' || b.doorSide === 'v+')
      ? Math.abs(u) < gap / 2 : Math.abs(v) < gap / 2;
    if (onDoorFace && acrossDoor) return { x, y };
    const ou = hu - Math.abs(u), ov = hv - Math.abs(v);
    let nu = u, nv = v;
    if (ou < ov) nu = Math.sign(u) * hu; else nv = Math.sign(v) * hv;
    const c2 = Math.cos(b.ang), s2 = Math.sin(b.ang);
    return { x: b.x + c2 * nu - s2 * nv, y: b.y + s2 * nu + c2 * nv };
  }

  // ---- indoors ----
  local(x, y) {
    const bl = this.inside;
    const cs = Math.cos(-bl.ang), sn = Math.sin(-bl.ang);
    return [cs * (x - bl.x) - sn * (y - bl.y), sn * (x - bl.x) + cs * (y - bl.y)];
  }
  world(u, v) {
    const bl = this.inside;
    const cs = Math.cos(bl.ang), sn = Math.sin(bl.ang);
    return [bl.x + cs * u - sn * v, bl.y + sn * u + cs * v];
  }

  slideWalls(x, y) {
    const plan = this.plan;
    if (!plan) return { x, y };
    let [u, v] = this.local(x, y);
    for (const w of plan.walls) {
      const p = segPush(u, v, w, RADIUS);
      u = p.u; v = p.v;
    }
    // a barricaded door is a wall until somebody takes it apart
    for (const r of plan.rooms) {
      if (r.barricade <= 0) continue;
      const d = r.door;
      const inR = u > r.x0 && u < r.x1 && v > r.y0 && v < r.y1;
      const nearDoor = Math.abs(u - d.x) < 1.5 && Math.abs(v - d.y) < 1.5;
      if (nearDoor && !inR) {
        // pushed back out of the doorway from the corridor side
        const w = d.ax === 'x'
          ? { x0: d.x, y0: d.y - 1.4, x1: d.x, y1: d.y + 1.4 }
          : { x0: d.x - 1.4, y0: d.y, x1: d.x + 1.4, y1: d.y };
        const p = segPush(u, v, w, RADIUS);
        u = p.u; v = p.v;
      }
    }
    const [wx, wy] = this.world(u, v);
    return { x: wx, y: wy };
  }

  roomAt(x, y) {
    const plan = this.plan;
    if (!plan) return null;
    const [u, v] = this.local(x, y);
    for (const r of plan.rooms) {
      if (u > r.x0 && u < r.x1 && v > r.y0 && v < r.y1) return r;
    }
    return null;
  }

  // ---- what would USE do right now? ----
  target(buildings, cars, kit) {
    if (this.enterCool > 0 || this.busy > 0) return null;
    if (this.inside) {
      const it = interiorOf(this.inside);
      const [u, v] = this.local(this.x, this.y);
      const plan = it.plan[this.floor];

      // the counter of a shop, which is the only reason to be in one
      if (this.inside.shop && this.floor === 0) {
        const ct = { x: 0, y: -it.D / 2 + 3.2 };
        if (Math.hypot(u - ct.x, v - ct.y) < 3.0) {
          return { kind: 'counter', label: 'BUY — ' + (this.inside.shopName || 'SHOP'),
                   b: this.inside };
        }
      }

      // stairs first - they are the thing you are usually running for
      const s = plan.stair;
      for (const st of (plan.stairs || [s])) {
        if (Math.hypot(u - st.x, v - st.y) > st.r + 1.4) continue;
        const canUp = this.floor < it.floors - 1, canDown = this.floor > 0;
        // At the top there is only one way to go, so F goes down without
        // needing a second key. Anywhere else F is up and Q is down, and the
        // prompt says so - the old version hid DOWN behind SHIFT, which is
        // also sprint, so it read as broken.
        let label;
        if (canUp && canDown) label = 'F UP  ·  Q DOWN   (FLOOR ' + (this.floor + 1) + '/' + it.floors + ')';
        else if (canUp) label = 'F — UP TO FLOOR 2';
        else label = 'F — DOWN TO FLOOR ' + this.floor + ' OF ' + it.floors;
        return { kind: 'stairs', label, up: canUp, down: canDown, at: st };
      }
      // barricading, but only from inside the room and only at its door
      if (this.room) {
        const d = this.room.door;
        if (Math.hypot(u - d.x, v - d.y) < 2.2) {
          return this.room.barricade > 0
            ? { kind: 'unbarricade', label: 'CLEAR THE DOOR', room: this.room }
            : { kind: 'barricade', label: 'BARRICADE THE DOOR', room: this.room };
        }
      }
      if (this.floor === 0) {
        for (const [p, name] of [[it.entry, 'FRONT'], [it.back, 'BACK']]) {
          if (Math.hypot(u - p.x, v - p.y) < REACH) {
            return { kind: 'exit', label: 'LEAVE — ' + name, at: p };
          }
        }
      }
      if (kit && kit.change) return { kind: 'change', label: 'CHANGE CLOTHES' };
      return null;
    }
    // Doors first. Cars used to win this and it made every shop front
    // unusable, because a parked car is always closer than the doorway you are
    // standing in front of.
    let door = null, dd = REACH;
    for (const b of buildings) {
      const d = Math.hypot(b.door.x - this.x, b.door.y - this.y);
      if (d < dd) { dd = d; door = b; }
    }
    let best = null, bd = REACH + 1.6;
    for (const c of cars) {
      const d = Math.hypot(c.x - this.x, c.y - this.y);
      if (d < bd) { bd = d; best = c; }
    }
    // right at a door: that is what you meant
    if (door && dd < 2.4) return this.doorTarget(door);
    if (best) {
      return { kind: 'car', car: best,
               label: best.parked ? 'TAKE THIS CAR' : 'TAKE THE CAR' };
    }
    if (door) return this.doorTarget(door);
    return null;
  }

  doorTarget(b) {
    if (b.garage) return { kind: 'enter', label: 'ENTER GARAGE', b };
    if (b.shop) return { kind: 'enter', label: 'GO INTO THE ' + (b.shopName || 'SHOP'), b };
    return { kind: 'enter', label: 'GO INSIDE', b };
  }

  enter(bl) {
    const it = interiorOf(bl);
    this.inside = bl;
    this.floor = 0;
    const [wx, wy] = (() => {
      const cs = Math.cos(bl.ang), sn = Math.sin(bl.ang);
      return [bl.x + cs * it.entry.x - sn * it.entry.y,
              bl.y + sn * it.entry.x + cs * it.entry.y];
    })();
    this.x = wx; this.y = wy;
    this.vx = this.vy = 0;
    this.enterCool = 0.4;
    this.room = null;
  }

  // Stairs take a moment, because a stairwell is where you get caught.
  useStairs(dir, at) {
    const it = interiorOf(this.inside);
    const nf = this.floor + dir;
    if (nf < 0 || nf >= it.floors) return false;
    this.floor = nf;
    // you come out of the same stairwell you went into
    const stairs = it.plan[nf].stairs || [it.plan[nf].stair];
    let s = stairs[0];
    if (at) {
      let bd = 1e9;
      for (const st of stairs) {
        const d = (st.x - at.x) ** 2 + (st.y - at.y) ** 2;
        if (d < bd) { bd = d; s = st; }
      }
    }
    const [wx, wy] = this.world(s.x + 1.2, s.y + 1.2);
    this.x = wx; this.y = wy;
    this.vx = this.vy = 0;
    this.enterCool = 0.35;
    this.room = null;
    return true;
  }

  leave(at) {
    const bl = this.inside;
    if (!bl) return;
    const cs = Math.cos(bl.ang), sn = Math.sin(bl.ang);
    const outU = at.x * 1.22, outV = at.y * 1.22;
    this.x = bl.x + cs * outU - sn * outV;
    this.y = bl.y + sn * outU + cs * outV;
    this.inside = null;
    this.floor = 0;
    this.room = null;
    this.vx = this.vy = 0;
    this.enterCool = 0.4;
  }

  begin(what, secs) { this.busy = secs; this.busyWhat = what; }
}

function segPush(u, v, w, r) {
  const dx = w.x1 - w.x0, dy = w.y1 - w.y0;
  const L2 = dx * dx + dy * dy;
  const t = L2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((u - w.x0) * dx + (v - w.y0) * dy) / L2));
  const px = w.x0 + dx * t, py = w.y0 + dy * t;
  const ox = u - px, oy = v - py;
  const d = Math.hypot(ox, oy);
  if (d >= r || d < 1e-6) return { u, v };
  return { u: px + (ox / d) * r, v: py + (oy / d) * r };
}
