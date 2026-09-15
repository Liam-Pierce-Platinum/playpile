// ===================== NIGHT SHIFT :: COMBAT =====================
// You are only caught when you are DEAD.
//
// There is no arrest meter any more. A patrol sitting on your bumper does not
// end anything, and neither does the car falling apart - that just puts you on
// the pavement. To finish you they have to get you OUT of the car and put you
// down, which means the whole shape of a run changed: the car is armour, and
// losing it is the moment the run gets dangerous rather than the moment it ends.
//
// The car is genuine cover. Rounds that hit it come off the CAR, not off you,
// with only a little bleeding through at point-blank range. Sitting in a
// wrecked car is still safer than standing next to it.

const BULLET_SPEED = 190;
const BULLET_LIFE = 0.75;

export class Combat {
  constructor() { this.reset(); }

  // Whatever you brought. The pistol is the fallback because you always
  // have one; everything else is something you bought and chose to carry.
  setWeapon(w) {
    this.gun = w;
    this.mag = w.mag;
    this.inMag = w.mag;
    this.ammo = w.reserve;
  }

  reset(w) {
    this.bullets = [];
    this.casings = [];
    this.hp = 140;
    this.maxHp = 140;
    this.gun = w || { id: 'pistol', dmg: 34, mag: 12, rate: 0.16, spread: 0.045,
                      reload: 1.5, reserve: 48, range: 1.0, len: 0.5 };
    this.ammo = this.gun.reserve;
    this.mag = this.gun.mag;
    this.inMag = this.gun.mag;
    this.reloadT = 0;
    this.fireT = 0;
    this.hurtT = 0;
    this.dead = false;
    this.kills = 0;
    this.regenT = 0;
  }

  get reloading() { return this.reloadT > 0; }

  // ---- the player's weapon ----
  // Deliberately unfriendly to use while driving: you cannot aim and steer at
  // once, so shooting is something you do after you have stopped or bailed.
  tryFire(dt, wantFire, wantReload, x, y, aim, fromCar) {
    this.fireT = Math.max(0, this.fireT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(this.mag - this.inMag, this.ammo);
        this.inMag += take; this.ammo -= take;
      }
      return null;
    }
    if (wantReload && this.inMag < this.mag && this.ammo > 0) {
      this.reloadT = this.gun.reload; return null;
    }
    if (!wantFire || this.fireT > 0) return null;
    if (this.inMag <= 0) {
      if (this.ammo > 0) this.reloadT = this.gun.reload;
      return null;
    }
    this.inMag--;
    const G = this.gun;
    this.fireT = G.rate;
    // spread is wider from a moving car - one hand on the wheel
    const spread = G.spread + (fromCar ? 0.09 : 0);
    // a shotgun throws a handful of pellets, everything else throws one
    const n = G.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = aim + (Math.random() - 0.5) * spread * 2;
      this.bullets.push({
        x: x + Math.cos(a) * 1.4, y: y + Math.sin(a) * 1.4,
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED,
        life: BULLET_LIFE * (G.range || 1), mine: true, dmg: G.dmg,
      });
    }
    const a = aim;
    this.casings.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
                        life: 1.2, life0: 1.2 });
    return { x, y, a };
  }

  copFire(x, y, aim, accuracy) {
    const a = aim + (Math.random() - 0.5) * (1 - accuracy) * 0.6;
    this.bullets.push({
      x: x + Math.cos(a) * 1.2, y: y + Math.sin(a) * 1.2,
      vx: Math.cos(a) * BULLET_SPEED * 0.92, vy: Math.sin(a) * BULLET_SPEED * 0.92,
      life: BULLET_LIFE, mine: false, dmg: 7,
    });
  }

  hurt(n) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - n);
    this.hurtT = 0.55;
    this.regenT = 4;
    if (this.hp <= 0) this.dead = true;
  }

  // ---- flight ----
  // Everything a bullet can hit is passed in; whoever it reaches first stops it.
  update(dt, world) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    // a shallow top-up so a single stray round is not a death sentence, but it
    // never brings you back from a real firefight
    this.regenT = Math.max(0, this.regenT - dt);
    if (!this.dead && this.regenT <= 0 && this.hp < this.maxHp * 0.7) {
      this.hp = Math.min(this.maxHp * 0.7, this.hp + dt * 4.5);
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= 1 - dt * 5; c.vy *= 1 - dt * 5;
      if (c.life <= 0) this.casings.splice(i, 1);
    }

    const hits = [];
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const px = b.x, py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      let done = b.life <= 0;

      if (!done) {
        if (world.interior) {
          // Indoors: the partition walls of this floor, in building-local
          // space. Testing the outer footprint here would kill every round at
          // the muzzle, because you are standing inside that footprint.
          const bl = world.interior.bl;
          const cs = Math.cos(-bl.ang), sn = Math.sin(-bl.ang);
          const toL = (x, y) => [cs * (x - bl.x) - sn * (y - bl.y),
                                 sn * (x - bl.x) + cs * (y - bl.y)];
          const a0 = toL(px, py), a1 = toL(b.x, b.y);
          for (const w of world.interior.walls) {
            if (segHit(a0[0], a0[1], a1[0], a1[1], w.x0, w.y0, w.x1, w.y1)) {
              hits.push({ x: b.x, y: b.y, kind: 'wall' }); done = true; break;
            }
          }
        } else {
          // outdoors: the building itself stops everything
          for (const w of world.buildings) {
            const cs = Math.cos(-w.ang), sn = Math.sin(-w.ang);
            const u = cs * (b.x - w.x) - sn * (b.y - w.y);
            const v = sn * (b.x - w.x) + cs * (b.y - w.y);
            if (Math.abs(u) < w.w / 2 && Math.abs(v) < w.d / 2) {
              hits.push({ x: b.x, y: b.y, kind: 'wall' }); done = true; break;
            }
          }
        }
      }
      if (!done && b.mine) {
        for (const t of world.targets) {
          if (t.down) continue;
          const r = t.r || 0.75;
          if (near(px, py, b.x, b.y, t.x, t.y, r)) {
            t.hp = (t.hp === undefined ? 100 : t.hp) - b.dmg;
            hits.push({ x: b.x, y: b.y, kind: 'flesh', t });
            if (t.hp <= 0) { t.down = true; this.kills++; }
            done = true; break;
          }
        }
        if (!done) {
          for (const c of world.copCars) {
            if (c.wrecked > 0) continue;
            if (near(px, py, b.x, b.y, c.x, c.y, 1.5)) {
              c.hp = (c.hp === undefined ? 120 : c.hp) - b.dmg;
              hits.push({ x: b.x, y: b.y, kind: 'metal' });
              if (c.hp <= 0) { c.wrecked = 2.6; c.spinRate = (Math.random() - 0.5) * 5; }
              done = true; break;
            }
          }
        }
      }
      if (!done && !b.mine) {
        // THE CAR IS COVER. Inside it, most of what is aimed at you hits sheet
        // metal instead - which is the entire reason to stay in it.
        if (world.playerCar && near(px, py, b.x, b.y, world.playerCar.x, world.playerCar.y, 1.7)) {
          hits.push({ x: b.x, y: b.y, kind: 'metal' });
          world.onCarHit(b.dmg);
          if (world.inCar && Math.random() < 0.16) this.hurt(b.dmg * 0.45);
          done = true;
        } else if (!world.inCar && near(px, py, b.x, b.y, world.px, world.py, 0.72)) {
          hits.push({ x: b.x, y: b.y, kind: 'flesh' });
          this.hurt(b.dmg);
          done = true;
        }
      }
      if (done) this.bullets.splice(i, 1);
    }
    return hits;
  }
}

// Do these two segments cross? Used for rounds against interior walls, where
// a wall is a line rather than a box.
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Swept check, because a bullet moves further in one frame than anything it is
// trying to hit is wide.
function near(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const L2 = dx * dx + dy * dy;
  const t = L2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2));
  const px = x0 + dx * t, py = y0 + dy * t;
  return (px - cx) ** 2 + (py - cy) ** 2 < r * r;
}
