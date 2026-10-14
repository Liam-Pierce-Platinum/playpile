// The simulation: ships sinking/tilting, flooding air pockets, the diver, survivors, hazards, mission flow.
import { TS, rng, clamp, lerp, dist } from './util.js';
import { TYPES, TYPE_ORDER, upVal } from './data.js';
import { T, SOLID, genShip, setPose, toLocal, toWorld, tileAt, tileIdx, roomAt, moveLocal, nearShip, updateWaterlines, solidBox } from './ship.js';
import { sfx } from './audio.js';
import { plan } from './bot.js';

const NAMES = ['ANNA', 'JOE', 'MEI', 'RAUL', 'SAM', 'IVY', 'OMAR', 'LENA', 'TOM', 'KAI', 'NINA', 'BEN', 'ZOE', 'LUIS', 'ADA', 'FINN', 'ROSA', 'DEV', 'MAYA', 'OTTO'];

export class World {
  // cfg: { mission, mayday, attract }
  constructor(cfg, save) {
    this.cfg = cfg; this.save = save; this.mayday = !!cfg.mayday; this.attract = !!cfg.attract;
    this.r = rng(cfg.mission ? cfg.mission.seed : (cfg.seed || (Math.random() * 1e9) | 0));
    this.up = {}; for (const id of ['tank', 'fins', 'light', 'cutter', 'sonar', 'sled']) this.up[id] = upVal(save, id);
    this.t = 0; this.time = 0; this.state = 'play'; this.endT = 0;
    this.ships = []; this.survivors = []; this.fires = []; this.crates = []; this.eels = []; this.jellies = []; this.sharks = []; this.currents = [];
    this.fish = []; this.kelp = []; this.rocks = []; this.particles = []; this.msgs = []; this.warns = [];
    this.shake = 0; this.hitStop = 0; this.flash = 0; this.damaged = false; this.rescued = 0; this.lost = 0; this.total = 0; this.coins = 0; this.wave = 0;
    this.sonarT = 0; this.sonarRing = -1; this.collapseT = 16; this.banner = 3.2; this.lowWarn = false; this.heartT = 0;
    this.cam = { x: 0, y: 0 }; this.vw = 320; this.vh = 180;
    this.boat = { x: 0, tx: 0 }; this.bell = { x: 0, y: 0, ty: 0 };
    this.inp = { mx: 0, my: 0, act: false, boost: false, ping: false, boostPressed: false };
    this.diver = { wx: 0, wy: 0, vx: 0, vy: 0, lx: 0, ly: 0, ship: null, face: 1, aim: 0, tilt: 0, o2: this.up.tank, o2max: this.up.tank, inv: 0, stun: 0, holdT: 0, target: null, kickCd: 0, anim: 0, bubT: 0.5, trail: [], towed: [], inside: false, room: null, headAir: false, atSurface: true, sonarCd: 0, inBell: false };
    const m = cfg.mission;
    this.tut = !this.mayday && !this.attract && m && m.i < 2 ? {} : null;
    if (this.mayday) this.nextWave(true);
    else this.spawnShip({ type: m.type, seed: m.seed, diff: m.diff, survivors: m.survivors, haz: TYPES[m.type].haz(m.k), tier: TYPE_ORDER.indexOf(m.type) }, true);
    this.snapCam();
  }
  get active() { return this.ships[this.ships.length - 1]; }
  sfx(name) { if (!this.attract && sfx[name]) sfx[name](); }
  floorY(x) { return this.floorBase + Math.round(5 * Math.sin(x * 0.013) + 3 * Math.sin(x * 0.051 + 1)); }

  nextWave(first) {
    this.wave++;
    const r = this.r;
    const type = this.wave <= 2 ? ['fishing', 'ferry'][this.wave - 1] : TYPE_ORDER[Math.floor(r() * TYPE_ORDER.length)];
    const diff = Math.min(1, 0.12 + this.wave * 0.1);
    const k = Math.min(3, this.wave >> 1);
    const surv = Math.min(5, 2 + (this.wave >> 1) + (r() < 0.4 ? 1 : 0));
    this.spawnShip({ type, seed: (r() * 1e9) | 0, diff, survivors: surv, haz: TYPES[type].haz(k), tier: TYPE_ORDER.indexOf(type) }, first);
    if (!first) { this.banner = 3.2; this.msg('MAYDAY! ' + TYPES[type].label + ' GOING DOWN', '#ff6a5a', 3); this.sfx('alarm'); }
  }

  spawnShip(p, first) {
    const TY = TYPES[p.type], r = this.r;
    const s = genShip(p.type, p.seed, p.diff, p.haz, p.survivors);
    s.tier = p.tier; s.label = TY.label; s.haz = p.haz; s.diff = p.diff;
    let startTop = TY.startTop, floor = TY.floor;
    if (this.mayday) { floor = 600; if (p.type === 'sub') startTop = 300; }
    if (first) this.floorBase = floor;
    s.x = first ? 0 : this.active.x + this.active.W * TS / 2 + s.W * TS / 2 + 420;
    s.y = startTop + s.H * TS / 2;
    s.ang = (r() - 0.5) * 0.05; s.angTarget = (r() < 0.5 ? -1 : 1) * TY.tilt * (0.65 + 0.35 * p.diff + r() * 0.15);
    const sinkTime = lerp(180, 125, p.diff);
    s.sinkV = Math.max(0, (this.floorBase - 6 - (s.y + s.H * TS / 2)) / sinkTime);
    s.lurchT = 14 + r() * 10;
    setPose(s); updateWaterlines(s);
    for (const d of s.doors) if (d.open) { s.rooms[d.a].openN = (s.rooms[d.a].openN || 0) + 1; s.rooms[d.b].openN = (s.rooms[d.b].openN || 0) + 1; }
    this.ships.push(s);
    if (this.ships.length > 2) this.ships.shift();
    // survivors
    const names = NAMES.slice().sort(() => r() - 0.5);
    s.survivors.forEach((sv, k) => {
      const o = { ship: s, room: sv.room, lx: sv.lx, ly: sv.ly, wx: 0, wy: 0, state: 'trapped', breath: 10, look: (k + this.total) % 5, name: names[k % names.length], t: r() * 5, helpT: 1 + r() * 3, found: false, face: r() < 0.5 ? 1 : -1 };
      [o.wx, o.wy] = toWorld(s, o.lx, o.ly);
      this.survivors.push(o);
    });
    this.total += s.survivors.length;
    for (const f of s.fires) this.fires.push(Object.assign(f, { ship: s, t: 0 }));
    for (const c of s.crates) this.crates.push(Object.assign(c, { ship: s }));
    for (const e of s.eels) this.eels.push({ ship: s, lx: (e.x + 0.5) * TS - s.W * TS / 2 + e.dx * 4, ly: (e.y + 0.5) * TS - s.H * TS / 2 + e.dy * 4, dx: e.dx, dy: e.dy, ext: 0, state: 'hide', timer: 1 + r() * 3, ph: r() * 6 });
    for (const j of s.ljelly) this.jellies.push({ ship: s, local: true, lx: j.lx, ly: j.ly, vx: (r() < 0.5 ? -1 : 1) * (4 + r() * 4), ph: r() * 6, by: j.ly });
    const hw = s.W * TS / 2;
    const outJ = (p.haz.jelly || 0) - Math.floor((p.haz.jelly || 0) / 2);
    for (let k = 0; k < outJ; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = s.x + (r() - 0.5) * (hw * 2 + 220), y = 50 + r() * (this.floorBase - 90);
        if (nearShip(s, x, y, 24) || Math.abs(x - (s.x - hw - 100)) < 30) continue;
        this.jellies.push({ ship: null, local: false, x, y, by: y, vx: (r() < 0.5 ? -1 : 1) * (5 + r() * 5), ph: r() * 6, minX: s.x - hw - 140, maxX: s.x + hw + 140 });
        break;
      }
    }
    for (let k = 0; k < (p.haz.shark || 0); k++) {
      const y = 50 + r() * (this.floorBase - 110);
      this.sharks.push({ x: s.x + (r() - 0.5) * hw * 2, y, py: y, vx: 0, vy: 0, dir: r() < 0.5 ? -1 : 1, state: 'patrol', t: 0, cd: 4 + r() * 3, minX: s.x - hw - 170, maxX: s.x + hw + 170, mouth: 0 });
    }
    for (let k = 0; k < (p.haz.current || 0); k++) {
      const y = 60 + r() * (this.floorBase - 160);
      this.currents.push({ x: s.x + (r() - 0.5) * hw * 2.4 - 70, y, w: 150 + r() * 80, h: 44 + r() * 20, fx: (r() < 0.5 ? -1 : 1) * (26 + 18 * p.diff), fy: (r() - 0.5) * 12 });
    }
    // boat + bell on the stern side of the ship
    const bx = s.x - hw - 110;
    this.boat.tx = bx; if (first) this.boat.x = bx;
    const by = clamp(s.y - 6, 60, this.floorBase - 40);
    this.bell.ty = by; if (first) { this.bell.y = by; }
    this.bell.x = this.boat.x + 44;
    // scenery
    for (let x = s.x - hw - 700; x < s.x + hw + 700; x += 10 + r() * 26) this.kelp.push({ x, h: 14 + r() * 60, ph: r() * 6, far: r() < 0.45 });
    for (let x = s.x - hw - 700; x < s.x + hw + 700; x += 30 + r() * 70) this.rocks.push({ x, w: 8 + r() * 26, h: 4 + r() * 14, c: r() });
    for (let k = 0; k < 5; k++) {
      const n = 6 + Math.floor(r() * 10), cx = s.x + (r() - 0.5) * 900, cy = 30 + r() * (this.floorBase - 80);
      this.fish.push({ x: cx, y: cy, vx: (r() < 0.5 ? -1 : 1) * (10 + r() * 12), col: ['#ffd24a', '#7ad8ff', '#ff8a5a', '#c0f070', '#e0e0ff'][k % 5], f: Array.from({ length: n }, () => ({ ox: (r() - 0.5) * 30, oy: (r() - 0.5) * 16, ph: r() * 6, px: 0, py: 0 })) });
    }
    if (first) {
      const d = this.diver;
      if (startTop > 150) { d.wx = this.bell.x; d.wy = this.bell.y + 14; d.atSurface = false; }
      else { d.wx = this.boat.x + 64; d.wy = 6; }
    }
  }

  msg(text, col = '#fff', dur = 2.2) { this.msgs.push({ text, col, t: dur, max: dur }); if (this.msgs.length > 4) this.msgs.shift(); }
  part(o) { if (this.particles.length < 700) this.particles.push(o); }
  bubbles(x, y, n, spread = 3, col) { for (let k = 0; k < n; k++) this.part({ k: 'bub', x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 12, vy: -10 - Math.random() * 20, life: 2 + Math.random() * 2, s: Math.random() < 0.3 ? 2 : 1, col, ph: Math.random() * 6 }); }
  floatText(x, y, text, col) { this.part({ k: 'text', x, y, vx: 0, vy: -14, life: 1.3, text, col }); }

  snapCam() { const d = this.diver; this.cam.x = d.wx - this.vw / 2; this.cam.y = d.wy - this.vh / 2; this.clampCam(); }
  clampCam() { this.cam.y = clamp(this.cam.y, -Math.min(this.vh * 0.42, 100), this.floorBase + 26 - this.vh); }

  // ---------------- main update
  update(dt) {
    this.t += dt;
    for (const m of this.msgs) m.t -= dt; this.msgs = this.msgs.filter(m => m.t > 0);
    this.updateParticles(dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.state === 'done') return;
    this.time += dt; this.banner -= dt;
    this.updateShips(dt);
    this.updateDiver(dt);
    if (this.tut) this.tutorial();
    this.updateSurvivors(dt);
    this.updateFires(dt);
    this.updateCrates(dt);
    this.updateEels(dt);
    this.updateJellies(dt);
    this.updateSharks(dt);
    this.updateCollapses(dt);
    this.updateAmbient(dt);
    this.updateCamera(dt);
    this.checkEnd(dt);
  }

  updateShips(dt) {
    // boat/bell follow (Mayday moves them to the next wreck)
    this.boat.x += clamp(this.boat.tx - this.boat.x, -70 * dt, 70 * dt);
    this.bell.x = this.boat.x + 44;
    this.bell.y += clamp(this.bell.ty - this.bell.y, -40 * dt, 40 * dt);
    for (const s of this.ships) {
      if (!s.settled) {
        s.y += s.sinkV * dt;
        s.lurchT -= dt;
        if (s.lurchT <= 0 && s === this.active) {
          s.lurchT = 15 + this.r() * 16;
          const TY = TYPES[s.type];
          s.angTarget = clamp(s.angTarget + (this.r() - 0.4) * 0.14 * Math.sign(s.angTarget || 1), -TY.tilt * 1.25, TY.tilt * 1.25);
          s.ang += 0.025 * Math.sign(s.angTarget); s.y += 3;
          if (this.diver.ship === s || dist(this.diver.wx, this.diver.wy, s.x, s.y) < 260) { this.shake = Math.max(this.shake, 4); this.sfx('creak'); this.msg('THE HULL LURCHES', '#ffb46a', 1.6); }
        }
      }
      const da = s.angTarget - s.ang;
      if (!s.settled) s.ang += clamp(da, -0.012 * dt, 0.012 * dt);
      setPose(s);
      // settle on the floor
      let pen = -1e9;
      for (const [lx, ly] of s.bottom) { const wx = s.x + lx * s.cos - ly * s.sin, wy = s.y + lx * s.sin + ly * s.cos; pen = Math.max(pen, wy - this.floorY(wx)); }
      if (pen > 0) {
        s.y -= pen;
        if (!s.settled) {
          s.settled = true;
          if (s === this.active) { this.shake = 7; this.sfx('boom'); this.msg('SHE HIT THE BOTTOM!', '#ff8a5a', 2); for (let k = 0; k < 40; k++) this.part({ k: 'dust', x: s.x + (Math.random() - 0.5) * s.W * TS, y: this.floorY(s.x) - 2, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 30, life: 1.5 + Math.random(), col: '#8a8060' }); }
        }
      }
      setPose(s);
      // flooding
      for (const rm of s.rooms) {
        if (rm.air <= 0) continue;
        let fires = 0; for (const f of this.fires) if (f.ship === s && f.room === rm.id && !f.out) fires++;
        rm.air -= rm.rate * (1 + 0.3 * (rm.openN || 0) + 0.45 * fires) * (s.settled ? 1.15 : 1) * dt;
        if (rm.air <= 0) { rm.air = 0; if (this.survivors.some(v => v.ship === s && v.room === rm.id && v.state === 'trapped')) { /* survivor update reports */ } }
      }
      updateWaterlines(s);
      // escaping air from breaches
      if (Math.random() < dt * 3) { const e = s.entries[Math.floor(Math.random() * s.entries.length)]; if (e) { const [wx, wy] = toWorld(s, (e.x + 0.5) * TS - s.W * TS / 2, (e.y + 0.5) * TS - s.H * TS / 2); this.bubbles(wx, wy, 2, 4); } }
    }
  }

  // ---------------- diver
  updateDiver(dt) {
    const d = this.diver, inp = this.inp;
    d.inv = Math.max(0, d.inv - dt); d.stun = Math.max(0, d.stun - dt); d.kickCd = Math.max(0, d.kickCd - dt); d.sonarCd = Math.max(0, d.sonarCd - dt);
    if (this.state === 'blackout') {
      this.blackT -= dt; d.vy = lerp(d.vy, 6, dt); d.vx *= 0.95;
      if (d.ship) { moveLocal(d.ship, d, 0, d.vy * dt, 3.5, 3); [d.wx, d.wy] = toWorld(d.ship, d.lx, d.ly); } else d.wy += d.vy * dt;
      if (this.blackT <= 0) this.finish();
      return;
    }
    // reference ship (carried with it while near)
    let ref = null; for (let k = this.ships.length - 1; k >= 0; k--) if (nearShip(this.ships[k], d.wx, d.wy, 18)) { ref = this.ships[k]; break; }
    if (ref !== d.ship) { if (ref) [d.lx, d.ly] = toLocal(ref, d.wx, d.wy); d.ship = ref; }
    if (d.ship) [d.wx, d.wy] = toWorld(d.ship, d.lx, d.ly);
    const here = d.ship ? tileAt(d.ship, d.lx, d.ly) : T.OUT;
    d.inside = here !== T.OUT && here !== T.BREACH;
    d.room = d.ship ? roomAt(d.ship, d.lx, d.ly) : null;
    const wl = d.room && d.room.air > 0 ? d.room.waterY : -1e9;
    d.headAir = d.wy - 3 < wl; const bodyAir = d.wy < wl;
    d.atSurface = d.wy <= 5;
    d.inBell = dist(d.wx, d.wy, this.bell.x, this.bell.y + 4) < 13;
    // controls
    let ax = inp.mx, ay = inp.my; if (d.stun > 0) { ax *= 0.15; ay *= 0.15; }
    const tow = d.towed.length;
    let spd = 50 * this.up.fins * (tow ? (this.up.sled > 1 ? 0.86 : 0.74) : 1);
    const sprint = inp.boost && d.o2 > 4 && (ax || ay);
    if (sprint) spd *= 1.45;
    if (inp.boostPressed && d.kickCd <= 0 && (ax || ay) && d.stun <= 0) {
      const l = Math.hypot(ax, ay) || 1; d.vx += ax / l * 85; d.vy += ay / l * 85; d.kickCd = 0.7; d.o2 -= 0.8;
      this.sfx('kick'); this.bubbles(d.wx - d.face * 6, d.wy, 6, 4); this.shake = Math.max(this.shake, 1);
    }
    const k = Math.min(1, dt * (bodyAir ? 7 : 3.4));
    if (bodyAir) {
      // in an air pocket: gravity, but you can climb (pipes/handholds) and you hang on while working a hatch
      if (inp.act && d.target) { d.vx *= 0.8; d.vy *= 0.8; }
      else { d.vx += (ax * spd * 0.6 - d.vx) * k; if (ay < 0) d.vy += (ay * spd * 0.6 - d.vy) * k; else d.vy += 300 * dt; }
    }
    else { d.vx += (ax * spd - d.vx) * k; d.vy += (ay * spd - d.vy) * k; if (!ax && !ay) d.vy += 3 * dt; }
    if (Math.abs(ax) > 0.1) d.face = ax > 0 ? 1 : -1;
    if (Math.abs(ax) + Math.abs(ay) > 0.1) { const ta = Math.atan2(ay, ax); let da = ta - d.aim; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; d.aim += da * Math.min(1, dt * 8); }
    const sp = Math.hypot(d.vx, d.vy);
    d.standT = d.headAir && d.inside ? 1 : (!d.inside || d.wy - 3 > wl + 6) ? 0 : (d.standT || 0);
    d.stand = lerp(d.stand || 0, d.standT, Math.min(1, dt * 9));
    d.tilt = lerp(d.tilt, clamp(Math.atan2(d.vy, Math.abs(d.vx) + 8) * 0.8, -0.9, 0.9), Math.min(1, dt * 6));
    // currents (open water only)
    let cx = 0, cy = 0;
    if (!d.inside) for (const c of this.currents) if (d.wx > c.x && d.wx < c.x + c.w && d.wy > c.y && d.wy < c.y + c.h) { cx += c.fx; cy += c.fy; }
    const mvx = (d.vx + cx) * dt, mvy = (d.vy + cy) * dt;
    if (d.ship) {
      const s = d.ship;
      const lx = mvx * s.cos + mvy * s.sin, ly = -mvx * s.sin + mvy * s.cos;
      const h = moveLocal(s, d, lx, ly, 3.5, 3);
      if (h.hx || h.hy) {
        let vlx = d.vx * s.cos + d.vy * s.sin, vly = -d.vx * s.sin + d.vy * s.cos;
        if (h.hx) vlx = 0; if (h.hy) vly = 0;
        d.vx = vlx * s.cos - vly * s.sin; d.vy = vlx * s.sin + vly * s.cos;
      }
      [d.wx, d.wy] = toWorld(s, d.lx, d.ly);
    } else { d.wx += mvx; d.wy += mvy; }
    const fy = this.floorY(d.wx) - 4;
    let clampY = null;
    if (d.wy > fy) { clampY = fy; d.vy = Math.min(0, d.vy); }
    if (d.wy < 3) { clampY = 3; d.vy = Math.max(0, d.vy); }
    if (clampY !== null) { d.wy = clampY; if (d.ship) { const b = { lx: d.lx, ly: d.ly }; const [nlx, nly] = toLocal(d.ship, d.wx, d.wy); if (!solidBox(d.ship, nlx, nly, 3.5, 3)) { d.lx = nlx; d.ly = nly; } else [d.wx, d.wy] = toWorld(d.ship, b.lx, b.ly); } }
    // trail for towed survivors
    const last = d.trail[d.trail.length - 1];
    const lp = last ? this.trailPos(last) : null;
    if (!lp || dist(lp[0], lp[1], d.wx, d.wy) >= 2) { d.trail.push(d.ship ? { s: d.ship, x: d.lx, y: d.ly } : { s: null, x: d.wx, y: d.wy }); if (d.trail.length > 240) d.trail.shift(); }
    // oxygen
    const max = d.o2max;
    if (d.atSurface) { if (d.o2 < max - 1 && Math.random() < dt * 2) this.sfx('breathe'); d.o2 = Math.min(max, d.o2 + 45 * dt); }
    else if (d.inBell) d.o2 = Math.min(max, d.o2 + 32 * dt);
    else if (d.headAir) { d.o2 = Math.min(max, d.o2 + 7 * dt); d.room.air = Math.max(0, d.room.air - 0.0012 * dt); }
    else d.o2 -= (1 + (sprint ? 1.2 : 0) + 0.35 * tow) * dt;
    if (!d.headAir && !d.atSurface && !d.inBell) {
      d.bubT -= dt; if (d.bubT <= 0) { d.bubT = 1.1 + Math.random() * 0.4; this.bubbles(d.wx + d.face * 6, d.wy - 3, 3 + Math.floor(Math.random() * 3), 2); if (Math.random() < 0.6) this.sfx('bubble'); }
    }
    if (d.o2 / max < 0.25) {
      if (!this.lowWarn) { this.lowWarn = true; this.msg('LOW OXYGEN! GET TO AIR', '#ff5a5a', 2.4); this.sfx('alarm'); }
      this.heartT -= dt; if (this.heartT <= 0) { this.heartT = 0.55 + d.o2 / max * 2; this.sfx('heart'); }
    } else if (d.o2 / max > 0.4) this.lowWarn = false;
    if (d.o2 <= 0) { d.o2 = 0; this.blackout(); return; }
    // interaction
    const tg = this.findTarget();
    const same = tg && d.target && tg.key === d.target.key;
    if (!same) {
      // a half-cut door keeps its progress if you drift off it and come back
      if (d.target && d.target.door) d.target.door.prog = Math.max(d.target.door.prog || 0, d.holdT);
      d.holdT = tg && tg.door ? (tg.door.prog || 0) : 0; d.target = tg;
    }
    if (tg && inp.act && d.stun <= 0) {
      d.holdT += dt;
      if (tg.kind === 'debris' && Math.random() < dt * 14) { this.sfx('cut'); const [wx, wy] = toWorld(tg.ship, tg.lx, tg.ly); this.part({ k: 'spark', x: wx + (Math.random() - 0.5) * 6, y: wy + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.3, col: '#ffe08a' }); }
      if (tg.kind === 'hatch' && Math.random() < dt * 6) this.sfx('crank');
      if (d.holdT >= tg.need) { this.complete(tg); d.holdT = 0; d.target = null; }
    } else if (tg && tg.kind === 'surv') d.holdT = Math.max(0, d.holdT - dt * 2);
    // way-out guide: while towing inside a wreck, point along the real path to the bell, not straight up
    this.guideT = (this.guideT || 0) - dt;
    if (d.towed.length && d.inside && d.ship) {
      if (this.guideT <= 0) {
        this.guideT = 0.35; const s = d.ship;
        const [gx, gy] = toLocal(s, this.bell.x, this.bell.y + 4);
        const p = plan(this, s, d.lx, d.ly, gx, gy); this.guide = null;
        if (p && p.cells.length) { const c = p.cells[Math.min(p.cells.length - 1, 5)]; this.guide = { s, lx: c.lx, ly: c.ly }; }
      }
    } else this.guide = null;
    // sonar
    if (this.up.sonar > 0 && ((this.inp.ping && d.sonarCd <= 0) || (this.up.sonar >= 3 && d.sonarCd <= 0 && this.sonarT <= 0))) this.ping();
    this.sonarT = Math.max(0, this.sonarT - dt); if (this.sonarRing >= 0) { this.sonarRing += dt * 260; if (this.sonarRing > 400) this.sonarRing = -1; }
    // deliveries
    if (d.towed.length && (d.atSurface || d.inBell)) for (const sv of d.towed.slice()) this.rescue(sv);
  }

  // first two missions: one-time coaching lines tied to what the player is doing
  tutorial() {
    const d = this.diver, f = this.tut;
    const say = (k, text) => { if (!f[k]) { f[k] = true; this.msg(text, '#9ad8ff', 3.2); } };
    if (this.time > 3.3 && !d.inside) say('go', 'SWIM INTO THE WRECK - FOLLOW WAY IN');
    if (d.inside) { f.go = true; say('in', 'FIND THE TRAPPED - LISTEN FOR HELP!'); }
    if (d.inside && d.headAir) say('air', 'AIR POCKET: YOU CAN BREATHE HERE');
    if (d.o2 / d.o2max < 0.5) say('o2', 'O2 HALF GONE - BELL OR SURFACE REFILLS');
  }

  trailPos(p) { return p.s ? toWorld(p.s, p.x, p.y) : [p.x, p.y]; }

  findTarget() {
    const d = this.diver;
    if (d.towed.length < this.up.sled) {
      let best = null, bd = 17;
      for (const sv of this.survivors) if ((sv.state === 'trapped' || sv.state === 'holding')) { const dd = dist(d.wx, d.wy, sv.wx, sv.wy); if (dd < bd) { bd = dd; best = { kind: 'surv', sv, need: 0.35, key: 's' + this.survivors.indexOf(sv) }; } }
      if (best) return best;
    }
    if (!d.ship) return null;
    const s = d.ship, ox = s.W * TS / 2, oy = s.H * TS / 2;
    const tx = Math.floor((d.lx + ox) / TS), ty = Math.floor((d.ly + oy) / TS);
    let bt = null, bd = 13;
    for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
      if (x < 0 || y < 0 || x >= s.W || y >= s.H) continue;
      const i = y * s.W + x, t = s.tiles[i];
      if (t !== T.HATCH && t !== T.DEBRIS) continue;
      const cx = (x + 0.5) * TS - ox, cy = (y + 0.5) * TS - oy;
      const dd = Math.max(0, Math.abs(cx - d.lx) - 4) + Math.max(0, Math.abs(cy - d.ly) - 4) + Math.hypot(cx - d.lx, cy - d.ly) * 0.2;
      if (dd < bd) { bd = dd; bt = { kind: t === T.HATCH ? 'hatch' : 'debris', ship: s, door: s.doors[s.door[i]], i, lx: cx, ly: cy, need: t === T.HATCH ? 1.0 : 2.4 / this.up.cutter, key: 'd' + (s.door[i] >= 0 ? s.door[i] : 't' + i) + '_' + s.x }; }
    }
    return bt;
  }

  complete(tg) {
    if (tg.kind === 'surv') {
      const sv = tg.sv; sv.state = 'towed'; this.diver.towed.push(sv); sv.found = true;
      this.sfx('hook'); this.msg('AIR LINE ON ' + sv.name + ' - GET TO THE BELL', '#7dff9a', 2.4);
      this.bubbles(sv.wx, sv.wy, 8, 6); this.hitStop = 0.04;
      return;
    }
    const s = tg.ship, door = tg.door;
    const tiles = door ? door.tiles : [tg.i];
    for (const t of tiles) { s.tiles[t] = T.HOPEN; s.dirtyTiles.add(t); }
    if (door) { door.open = true; for (const id of [door.a, door.b]) { const rm = s.rooms[id]; rm.openN = (rm.openN || 0) + 1; } }
    const [wx, wy] = toWorld(s, tg.lx, tg.ly);
    if (tg.kind === 'hatch') { this.sfx('hatch'); this.shake = Math.max(this.shake, 2); this.bubbles(wx, wy, 10, 8); }
    else { this.sfx('smash'); this.shake = Math.max(this.shake, 3); this.hitStop = 0.05; for (let k = 0; k < 14; k++) this.part({ k: 'chip', x: wx + (Math.random() - 0.5) * 8, y: wy + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, life: 0.8 + Math.random() * 0.5, col: Math.random() < 0.5 ? '#7a5636' : '#a07850' }); }
    if (door && [door.a, door.b].some(id => s.rooms[id].air > 0.05)) this.msg('AIR IS VENTING - BE QUICK', '#ffd24a', 1.6);
  }

  ping() {
    const d = this.diver;
    d.sonarCd = this.up.sonar >= 3 ? 5 : 6;
    this.sonarT = [0, 3.5, 6, 6][this.up.sonar]; this.sonarRing = 0; this.sfx('ping');
    for (const sv of this.survivors) if (sv.state === 'trapped' || sv.state === 'holding') sv.found = true;
  }

  hurt(amount, fx, fy, kind) {
    const d = this.diver; if (d.inv > 0 || this.state !== 'play') return;
    d.o2 -= amount; d.inv = 1.1; d.stun = 0.35;
    const a = Math.atan2(d.wy - fy, d.wx - fx); d.vx += Math.cos(a) * 110; d.vy += Math.sin(a) * 110;
    this.shake = Math.max(this.shake, 5); this.hitStop = 0.07; this.flash = 0.35; this.damaged = true;
    this.bubbles(d.wx, d.wy, 12, 6); this.floatText(d.wx, d.wy - 10, '-' + amount + ' O2', '#ff6a6a');
    this.sfx(kind || 'hit');
  }

  rescue(sv) {
    const d = this.diver; d.towed = d.towed.filter(x => x !== sv);
    sv.state = 'rescued'; this.rescued++;
    const c = this.mayday ? 15 + 3 * this.wave : 30 + 8 * (this.active.tier || 0);
    this.coins += c;
    this.sfx('rescue'); setTimeout(() => this.sfx('coin'), 260);
    this.msg(sv.name + ' IS SAFE!  +' + c, '#7dff9a', 2.2);
    this.floatText(d.wx, d.wy - 12, '+' + c, '#ffd84a');
    this.part({ k: 'text', x: d.wx, y: d.wy - 26, vx: 0, vy: -10, life: 1.4, text: 'SAVED!', col: '#7dff9a', big: true });
    this.part({ k: 'ring', x: d.wx, y: d.wy, vx: 0, vy: 0, life: 0.6, col: '#7dff9a' }); this.shake = Math.max(this.shake, 2.5);
    for (let k = 0; k < 18; k++) this.part({ k: 'spark', x: d.wx, y: d.wy, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.7) * 120, life: 0.8, col: ['#ffd84a', '#7dff9a', '#7ad8ff'][k % 3] });
    this.hitStop = 0.06;
  }

  loseSurvivor(sv, why) {
    sv.state = 'lost'; this.lost++; this.diver.towed = this.diver.towed.filter(x => x !== sv);
    this.sfx('lost'); this.msg(sv.name + ' ' + (why || 'DIDN\'T MAKE IT'), '#ff5a5a', 2.6);
    this.bubbles(sv.wx, sv.wy, 16, 6);
  }

  blackout() {
    if (this.state !== 'play') return;
    this.state = 'blackout'; this.blackT = 2.4; this.sfx('blackout'); this.msg('YOU BLACKED OUT', '#ff5a5a', 3);
    for (const sv of this.diver.towed.slice()) this.loseSurvivor(sv, 'WAS LOST WITH YOU');
  }

  // ---------------- survivors
  updateSurvivors(dt) {
    const d = this.diver;
    for (const sv of this.survivors) {
      sv.t += dt;
      if (sv.state === 'rescued' || sv.state === 'lost') continue;
      const s = sv.ship;
      if (sv.state === 'towed') {
        const k = d.towed.indexOf(sv); const idx = Math.max(0, d.trail.length - 1 - (k + 1) * 6);
        const p = d.trail[idx]; if (p) { const [x, y] = this.trailPos(p); sv.wx = lerp(sv.wx, x, Math.min(1, dt * 10)); sv.wy = lerp(sv.wy, y, Math.min(1, dt * 10)); }
        sv.face = d.face;
        continue;
      }
      [sv.wx, sv.wy] = toWorld(s, sv.lx, sv.ly);
      const rm = s.rooms[sv.room];
      const dd = dist(sv.wx, sv.wy, d.wx, d.wy);
      if (dd < 70) sv.found = true;
      if (sv.state === 'trapped') {
        if (rm.air <= 0) {
          sv.state = 'holding'; sv.breath = 9;
          this.msg(sv.name + "'S POCKET FLOODED! 9 SEC", '#ff5a5a', 2.5); this.sfx('alarm'); this.sfx('gasp');
          continue;
        }
        const target = rm.waterY + 1;
        const ny = sv.wy + clamp(target - sv.wy, -22 * dt, 22 * dt);
        const nx = sv.wx + Math.sin(sv.t * 0.7) * 3 * dt;
        const [lx, ly] = toLocal(s, nx, ny);
        moveLocal(s, sv, lx - sv.lx, ly - sv.ly, 3, 5);
        sv.helpT -= dt;
        if (sv.helpT <= 0 && dd < 130) { sv.helpT = 3.5 + Math.random() * 2; this.part({ k: 'text', x: sv.wx, y: sv.wy - 22, vx: 0, vy: -8, life: 1.4, text: 'HELP!', col: '#fff' }); if (dd < 100) this.sfx('help'); }
        if (rm.air / Math.max(0.01, rm.air0) < 0.3 && Math.random() < dt * 0.5) this.part({ k: 'text', x: sv.wx, y: sv.wy - 22, vx: 0, vy: -8, life: 1.2, text: 'HURRY!', col: '#ff8a7a' });
      } else if (sv.state === 'holding') {
        sv.breath -= dt;
        moveLocal(s, sv, (Math.random() - 0.5) * 6 * dt, 5 * dt, 3, 5);
        if (Math.random() < dt * 3) this.bubbles(sv.wx, sv.wy - 4, 2, 2);
        if (sv.breath <= 0) this.loseSurvivor(sv);
      }
    }
  }

  // ---------------- hazards
  updateFires(dt) {
    const d = this.diver;
    for (const f of this.fires) {
      if (f.out) continue;
      const s = f.ship, rm = s.rooms[f.room];
      [f.wx, f.wy] = toWorld(s, f.lx, f.ly);
      if (rm.air <= 0 || f.wy > rm.waterY - 3) {
        f.out = true;
        if (dist(f.wx, f.wy, d.wx, d.wy) < 200) this.sfx('hiss');
        for (let k = 0; k < 14; k++) this.part({ k: 'steam', x: f.wx + (Math.random() - 0.5) * 8, y: f.wy - 2, vx: (Math.random() - 0.5) * 16, vy: -10 - Math.random() * 20, life: 1 + Math.random(), col: '#d8e4ea' });
        continue;
      }
      f.t += dt;
      if (Math.random() < dt * 6) this.part({ k: 'ember', x: f.wx + (Math.random() - 0.5) * 6, y: f.wy - 2, vx: (Math.random() - 0.5) * 10, vy: -16 - Math.random() * 16, life: 0.6 + Math.random() * 0.5, col: Math.random() < 0.5 ? '#ffb43a' : '#ff6a2a' });
      if (Math.random() < dt * 1.5) this.part({ k: 'smoke', x: f.wx, y: f.wy - 6, vx: (Math.random() - 0.5) * 6, vy: -8, life: 1.6, col: '#3a3a3e' });
      const fd = dist(f.wx, f.wy, d.wx, d.wy);
      if (fd < 8) this.hurt(8, f.wx, f.wy + 4, 'hit');
      if (fd < 80 && Math.random() < dt * 4) this.sfx('flame');
    }
  }

  updateCrates(dt) {
    const d = this.diver;
    for (const c of this.crates) {
      const s = c.ship; const g = c.kind === 'beam' ? 120 : 50;
      c.vx += g * s.sin * dt; c.vy += g * s.cos * dt;
      c.vx *= 1 - Math.min(1, 1.1 * dt); c.vy *= 1 - Math.min(1, 1.1 * dt);
      const h = moveLocal(s, c, c.vx * dt, c.vy * dt, c.w, c.h);
      if (h.hx) c.vx *= -0.15;
      if (h.hy) {
        if (Math.abs(c.vy) > 35) { const [wx, wy] = toWorld(s, c.lx, c.ly + c.h); for (let k = 0; k < 6; k++) this.part({ k: 'dust', x: wx + (Math.random() - 0.5) * c.w * 2, y: wy, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 14, life: 0.8, col: '#8a8a7a' }); if (d.ship === s && dist(wx, wy, d.wx, d.wy) < 120) { this.sfx('hit'); this.shake = Math.max(this.shake, c.kind === 'beam' ? 3 : 1.5); } }
        c.vy *= -0.15;
      }
      [c.wx, c.wy] = toWorld(s, c.lx, c.ly);
      if (d.ship === s && this.state === 'play') {
        const dx = d.lx - c.lx, dy = d.ly - c.ly, px = c.w + 3.5 - Math.abs(dx), py = c.h + 3 - Math.abs(dy);
        if (px > 0 && py > 0) {
          const sp = Math.hypot(c.vx, c.vy);
          if (sp > 32) this.hurt(14, c.wx, c.wy, 'hit');
          if (px < py) { moveLocal(s, d, Math.sign(dx || 1) * px * 0.6, 0, 3.5, 3); moveLocal(s, c, -Math.sign(dx || 1) * px * 0.4, 0, c.w, c.h); c.vx -= Math.sign(dx || 1) * 8; }
          else { moveLocal(s, d, 0, Math.sign(dy || 1) * py * 0.6, 3.5, 3); moveLocal(s, c, 0, -Math.sign(dy || 1) * py * 0.4, c.w, c.h); }
          [d.wx, d.wy] = toWorld(s, d.lx, d.ly);
        }
      }
    }
    // crate vs crate
    for (let a = 0; a < this.crates.length; a++) for (let b = a + 1; b < this.crates.length; b++) {
      const A = this.crates[a], B = this.crates[b]; if (A.ship !== B.ship) continue;
      const dx = A.lx - B.lx, dy = A.ly - B.ly, px = A.w + B.w - Math.abs(dx), py = A.h + B.h - Math.abs(dy);
      if (px > 0 && py > 0) {
        if (px < py) { moveLocal(A.ship, A, Math.sign(dx || 1) * px / 2, 0, A.w, A.h); moveLocal(B.ship, B, -Math.sign(dx || 1) * px / 2, 0, B.w, B.h); }
        else { moveLocal(A.ship, A, 0, Math.sign(dy || 1) * py / 2, A.w, A.h); moveLocal(B.ship, B, 0, -Math.sign(dy || 1) * py / 2, B.w, B.h); const m = (A.vy + B.vy) / 2; A.vy = B.vy = m; }
      }
    }
  }

  updateEels(dt) {
    const d = this.diver;
    for (const e of this.eels) {
      e.ph += dt * 6; e.timer -= dt;
      const s = e.ship; const near = d.ship === s && dist(d.lx, d.ly, e.lx, e.ly) < 56;
      if (e.state === 'hide') { e.ext = Math.max(0, e.ext - dt * 40); if (e.timer <= 0) { if (near) { e.state = 'lunge'; e.timer = 0.25; this.sfx('zap'); } else e.timer = 0.4 + Math.random(); } }
      else if (e.state === 'lunge') { e.ext = Math.min(26, e.ext + dt * 110); if (e.timer <= 0) { e.state = 'hold'; e.timer = 1.0; } }
      else if (e.state === 'hold') { if (Math.random() < dt * 8) { const [wx, wy] = toWorld(s, e.lx + e.dx * e.ext, e.ly + e.dy * e.ext); this.part({ k: 'spark', x: wx + (Math.random() - 0.5) * 10, y: wy + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.25, col: '#bff6ff' }); } if (e.timer <= 0) { e.state = 'hide'; e.timer = 2.4 + Math.random() * 2; } }
      if ((e.state === 'hold' || (e.state === 'lunge' && e.ext > 10)) && d.ship === s) {
        // distance from diver to the eel body segment
        const ex = e.lx + e.dx * e.ext, ey = e.ly + e.dy * e.ext;
        const t = clamp(((d.lx - e.lx) * e.dx + (d.ly - e.ly) * e.dy) / Math.max(1, e.ext), 0, 1);
        const qx = e.lx + e.dx * e.ext * t, qy = e.ly + e.dy * e.ext * t;
        if (Math.hypot(d.lx - qx, d.ly - qy) < 7.5) { const [wx, wy] = toWorld(s, ex, ey); this.hurt(15, wx, wy, 'zap'); }
      }
    }
  }

  updateJellies(dt) {
    const d = this.diver;
    for (const j of this.jellies) {
      j.ph += dt;
      if (j.local) {
        const s = j.ship;
        const h = moveLocal(s, j, j.vx * dt, (j.by + Math.sin(j.ph * 0.9) * 6 - j.ly) * Math.min(1, dt * 2), 3, 4);
        if (h.hx) j.vx = -j.vx; if (h.hy) j.by = j.ly;
        [j.x, j.y] = toWorld(s, j.lx, j.ly);
      } else {
        j.x += j.vx * dt; j.y = j.by + Math.sin(j.ph * 0.8) * 10;
        if (j.x < j.minX || j.x > j.maxX) j.vx = -j.vx;
        for (const s of this.ships) if (nearShip(s, j.x + Math.sign(j.vx) * 8, j.y, 2)) { const [lx, ly] = toLocal(s, j.x + Math.sign(j.vx) * 8, j.y); if (tileAt(s, lx, ly) !== T.OUT) { j.vx = -j.vx; break; } }
      }
      if (this.state === 'play' && dist(j.x, j.y + 2, d.wx, d.wy) < 7) this.hurt(10, j.x, j.y, 'sting');
    }
  }

  updateSharks(dt) {
    const d = this.diver;
    const inside = d.inside;
    for (const k of this.sharks) {
      k.t += dt; k.cd -= dt; k.mouth = Math.max(0, k.mouth - dt);
      const dd = dist(k.x, k.y, d.wx, d.wy);
      if (k.state === 'patrol') {
        k.vx = lerp(k.vx, k.dir * 20, dt); k.vy = lerp(k.vy, (k.py + Math.sin(k.t * 0.5) * 12 - k.y) * 0.5, dt * 2);
        if (k.x < k.minX) k.dir = 1; if (k.x > k.maxX) k.dir = -1;
        if (!inside && dd < 82 && k.cd <= 0 && this.state === 'play') { k.state = 'charge'; k.t = 0; k.mouth = 2; }
      } else if (k.state === 'charge') {
        const a = Math.atan2(d.wy - k.y, d.wx - k.x);
        k.vx = lerp(k.vx, Math.cos(a) * 88, dt * 2.2); k.vy = lerp(k.vy, Math.sin(a) * 88, dt * 2.2);
        k.dir = k.vx >= 0 ? 1 : -1; k.mouth = 1;
        if (dd < 10) { this.hurt(22, k.x, k.y, 'bite'); k.state = 'retreat'; k.t = 0; }
        if (k.t > 2.2 || inside) { k.state = 'patrol'; k.cd = 3 + Math.random() * 2; }
      } else {
        const a = Math.atan2(k.y - d.wy, k.x - d.wx);
        k.vx = lerp(k.vx, Math.cos(a) * 50, dt * 2); k.vy = lerp(k.vy, Math.sin(a) * 30, dt * 2); k.dir = k.vx >= 0 ? 1 : -1;
        if (k.t > 2.5) { k.state = 'patrol'; k.cd = 4; k.py = clamp(k.y, 40, this.floorBase - 40); }
      }
      let nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
      let blocked = false;
      for (const s of this.ships) if (nearShip(s, nx + k.dir * 14, ny, 4)) { const [lx, ly] = toLocal(s, nx + k.dir * 14, ny); if (tileAt(s, lx, ly) !== T.OUT) blocked = true; const [lx2, ly2] = toLocal(s, nx, ny); if (tileAt(s, lx2, ly2) !== T.OUT) blocked = true; }
      if (blocked) { k.vx = -k.vx * 0.5; k.dir = -k.dir; if (k.state === 'charge') { k.state = 'patrol'; k.cd = 2; } nx = k.x; ny = k.y - 6 * dt; }
      k.x = nx; k.y = clamp(ny, 16, this.floorY(nx) - 10);
    }
  }

  updateCollapses(dt) {
    const d = this.diver;
    for (const w of this.warns) {
      w.t -= dt;
      const [wx, wy] = toWorld(w.ship, w.lx, w.ly);
      if (Math.random() < dt * 20) this.part({ k: 'dust', x: wx + (Math.random() - 0.5) * 12, y: wy - 3, vx: (Math.random() - 0.5) * 6, vy: 10 + Math.random() * 12, life: 0.8, col: '#a09a80' });
      if (w.t <= 0) { this.crates.push({ ship: w.ship, lx: w.lx, ly: w.ly + 2, vx: 0, vy: 30, w: 8, h: 2, kind: 'beam', c: 0 }); this.sfx('smash'); this.shake = Math.max(this.shake, 3); }
    }
    this.warns = this.warns.filter(w => w.t > 0);
    const s = this.active; const rate = (s.haz.collapse || 0.5);
    this.collapseT -= dt * rate;
    if (this.collapseT <= 0) {
      this.collapseT = 12 + Math.random() * 12;
      if (d.ship !== s || !d.inside) { this.collapseT = 4; return; }
      // a tile under a ceiling near the diver
      const ox = s.W * TS / 2, oy = s.H * TS / 2;
      const cands = [];
      const tx0 = Math.floor((d.lx + ox) / TS), ty0 = Math.floor((d.ly + oy) / TS);
      for (let y = ty0 - 6; y <= ty0 + 2; y++) for (let x = tx0 - 7; x <= tx0 + 7; x++) {
        if (x < 1 || y < 1 || x >= s.W - 1 || y >= s.H - 1) continue;
        const i = y * s.W + x; if (s.tiles[i] !== T.IN || s.room[i] < 0) continue;
        const up = s.tiles[i - s.W]; if (up !== T.WALL && up !== T.HULL) continue;
        if (SOLID[s.tiles[i - 1]] || SOLID[s.tiles[i + 1]]) continue;
        if (Math.abs(x - tx0) < 2) continue;
        cands.push([(x + 0.5) * TS - ox, (y + 0.5) * TS - oy]);
      }
      if (cands.length) { const c = cands[Math.floor(Math.random() * cands.length)]; this.warns.push({ ship: s, lx: c[0], ly: c[1], t: 1.3 }); this.sfx('creak'); this.shake = Math.max(this.shake, 1.5); }
    }
  }

  updateAmbient(dt) {
    const d = this.diver;
    for (const sc of this.fish) {
      sc.x += sc.vx * dt;
      if (Math.abs(sc.x - d.wx) > 700) sc.x = d.wx - Math.sign(sc.vx) * 650;
      for (const f of sc.f) {
        f.ph += dt * 3;
        let fx = sc.x + f.ox + Math.sin(f.ph) * 3, fy = sc.y + f.oy + Math.cos(f.ph * 0.7) * 2;
        const dd = dist(fx, fy, d.wx, d.wy);
        if (dd < 34) { const a = Math.atan2(fy - d.wy, fx - d.wx); f.px = lerp(f.px, Math.cos(a) * (34 - dd), dt * 6); f.py = lerp(f.py, Math.sin(a) * (34 - dd), dt * 6); }
        else { f.px = lerp(f.px, 0, dt); f.py = lerp(f.py, 0, dt); }
        f.x = fx + f.px; f.y = fy + f.py;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 10);
  }

  updateCamera(dt) {
    const d = this.diver;
    const tx = d.wx - this.vw / 2 + d.vx * 0.35, ty = d.wy - this.vh / 2 + d.vy * 0.25;
    this.cam.x = lerp(this.cam.x, tx, Math.min(1, dt * 4)); this.cam.y = lerp(this.cam.y, ty, Math.min(1, dt * 4));
    this.clampCam();
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.k === 'bub') {
        p.ph += dt * 5; p.vy = Math.max(-34, p.vy - 30 * dt); p.x += (p.vx + Math.sin(p.ph) * 6) * dt; p.y += p.vy * dt; p.vx *= 0.96;
        if (p.y < 1) p.life = 0;
        else if (Math.random() < 0.25) { for (const s of this.ships) if (nearShip(s, p.x, p.y, 0)) { const [lx, ly] = toLocal(s, p.x, p.y); const t = tileAt(s, lx, ly); if (SOLID[t]) { p.life = 0; break; } const rm = roomAt(s, lx, ly); if (rm && rm.air > 0 && p.y < rm.waterY) p.life = 0; } }
      } else if (p.k === 'text') { p.y += p.vy * dt; }
      else if (p.k === 'ember' || p.k === 'steam' || p.k === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - Math.min(1, dt * 3); p.vy *= 1 - Math.min(1, dt * 3); if (p.k === 'chip' || p.k === 'dust') p.vy += 14 * dt; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  checkEnd(dt) {
    if (this.state !== 'play') return;
    const open = this.survivors.filter(v => v.state !== 'rescued' && v.state !== 'lost');
    if (this.mayday) {
      if (this.lost >= 3) { this.endT += dt; if (this.endT > 1.4) this.finish(); return; }
      const act = this.survivors.filter(v => v.ship === this.active && v.state !== 'rescued' && v.state !== 'lost');
      if (act.length === 0) { this.endT += dt; if (this.endT > 1.5) { this.endT = 0; this.diver.o2 = Math.min(this.diver.o2max, this.diver.o2 + 25); this.nextWave(false); } }
      return;
    }
    if (open.length === 0) { this.endT += dt; if (this.endT > 1.4) this.finish(); }
  }

  finish() {
    if (this.state === 'done') return;
    const m = this.cfg.mission;
    const survived = this.diver.o2 > 0;
    let stars = [false, false, false], passed = false;
    if (!this.mayday) {
      stars = [this.rescued === this.total, this.rescued === this.total && this.time <= m.par, this.rescued > 0 && !this.damaged];
      passed = survived && this.rescued >= Math.ceil(this.total / 2);
      if (passed) this.coins += 20 * stars.filter(Boolean).length;
    } else { this.coins += 10 * (this.wave - 1); }
    this.result = { mission: m, mayday: this.mayday, rescued: this.rescued, total: this.total, lost: this.lost, time: this.time, stars, passed, survived, coins: this.coins, wave: this.wave, damaged: this.damaged };
    this.state = 'done';
  }
}
