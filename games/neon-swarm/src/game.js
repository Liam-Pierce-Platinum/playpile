// The whole simulation: player, weapons, enemies, director, geoms, scoring.
// Pure logic, no drawing, no DOM. Runs on a fixed 1/60 s step. Anything the
// outside world should react to (sound, banners) goes into this.events.
import { Grid } from './grid.js';
import { FX } from './fx.js';

export const W = 1600, H = 1100;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// type table: radius, palette colour index, points, geoms dropped
export const DEF = {
  wander: { r: 17, col: 1, pts: 25, geoms: 1 },
  grunt: { r: 16, col: 2, pts: 50, geoms: 1 },
  dodger: { r: 17, col: 3, pts: 100, geoms: 2 },
  split: { r: 19, col: 4, pts: 100, geoms: 1 },
  mini: { r: 10, col: 4, pts: 50, geoms: 1 },
  snake: { r: 15, col: 5, pts: 150, geoms: 3 },
  hole: { r: 24, col: 6, pts: 150, geoms: 8 },
  spark: { r: 8, col: 7, pts: 20, geoms: 0 },
};

// weapon tiers by wave reached
const WEAPONS = [
  { at: 0, period: 0.1, shots: [[0, -7], [0, 7]] },
  { at: 3, period: 0.09, shots: [[0, 0], [-0.07, 0], [0.07, 0]] },
  { at: 6, period: 0.08, shots: [[0, -6], [0, 6], [-0.11, 0], [0.11, 0]] },
  { at: 10, period: 0.072, shots: [[0, 0], [-0.08, 0], [0.08, 0], [-0.17, 0], [0.17, 0]] },
];
// SURGE milestones: each gives +1 life and +1 bomb
const BONUS = [500000, 10000000, 100000000, 1000000000];

const MULT_MARKS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const PATTERNS = ['flood', 'corners', 'line', 'ring', 'splits', 'snakes', 'holes'];

export class Game {
  constructor(mode = 'surge') {
    this.mode = mode; // 'surge' | 'blitz'
    this.grid = new Grid(W, H, 40);
    this.fx = new FX(3200);
    this.events = [];
    this.inp = { mx: 0, my: 0, ax: 1, ay: 0, aim: false, bomb: false };
    this.reset();
  }
  reset() {
    this.t = 0; this.score = 0; this.mult = 1; this.maxMult = 1;
    this.lives = this.mode === 'blitz' ? Infinity : 3;
    this.bombs = this.mode === 'blitz' ? 0 : 3;
    this.timeLeft = this.mode === 'blitz' ? 180 : Infinity;
    this.wave = 0; this.waveT = 6; this.trickleT = 1.2;
    this.kills = 0; this.geomsGot = 0; this.deaths = 0; this.bonusIdx = 0;
    this.weapon = 0; this.fireCD = 0; this.frame = 0;
    this.p = { x: W / 2, y: H / 2, vx: 0, vy: 0, ang: -Math.PI / 2, alive: true, inv: 2, respawn: 0 };
    this.bullets = []; this.enemies = []; this.geoms = [];
    this.fx.clear();
    this.shake = 0; this.hitstop = 0; this.slow = 1; this.flash = 0; this.multPulse = 0;
    this.over = false; this.overT = 0; this.bombFx = 0;
    this.holesActive = 0; this.killChain = 0; this.chainT = 0;
    this.bot = false;
    // spatial hash
    this.cs = 80; this.hc = Math.ceil(W / this.cs) + 1; this.hr = Math.ceil(H / this.cs) + 1;
    this.cells = Array.from({ length: this.hc * this.hr }, () => []);
  }
  ev(type, data) { if (this.events.length < 300) this.events.push(Object.assign({ type }, data)); }

  // ------------------------------------------------------------ main step
  step(dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; this.fx.update(dt * 0.15, W, H, []); return; }
    this.slow += (1 - this.slow) * Math.min(1, dt * 2.2);
    dt *= this.slow;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.multPulse = Math.max(0, this.multPulse - dt * 4);
    this.bombFx = Math.max(0, this.bombFx - dt);
    this.chainT -= dt; if (this.chainT <= 0) this.killChain = 0;

    if (this.over) { this.overT += dt; this.updateEnemies(dt); this.fx.update(dt, W, H, []); this.grid.update(); return; }
    this.t += dt;
    if (this.mode === 'blitz') {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (before > 10 && this.timeLeft <= 10) this.ev('banner', { text: '10 SECONDS', sub: '' });
      if (this.timeLeft <= 0) { this.endRun(); return; }
    }
    if (this.bot) this.botInput();
    this.updatePlayer(dt);
    if (this.p.alive) this.director(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.collide();
    this.updateGeoms(dt);
    const holes = this.enemies.filter((e) => e.type === 'hole' && e.active && !e.dead);
    this.holesActive = holes.length;
    for (const h of holes) this.grid.implode(h.x, h.y, 0.35 + h.fed * 0.04, 260 + h.fed * 12);
    this.fx.update(dt, W, H, holes);
    this.grid.update();
    if (this.enemies.length > 400) this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // ------------------------------------------------------------ player
  updatePlayer(dt) {
    const p = this.p, inp = this.inp;
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        if (this.lives <= 0) { this.endRun(); return; }
        p.alive = true; p.inv = 2.2; p.x = W / 2; p.y = H / 2; p.vx = p.vy = 0;
        this.fx.ring(p.x, p.y, 0, 160, 0.5, 3);
        this.grid.explode(p.x, p.y, 8, 200);
        this.ev('respawn');
      }
      return;
    }
    p.inv = Math.max(0, p.inv - dt);
    let mx = inp.mx, my = inp.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const SPD = 440;
    const k = 1 - Math.exp(-dt * 16);
    p.vx += (mx * SPD - p.vx) * k; p.vy += (my * SPD - p.vy) * k;
    // black holes tug the ship
    for (const e of this.enemies) {
      if (e.type !== 'hole' || !e.active || e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy), R = 300 + e.fed * 10;
      if (d < R && d > 1) { const f = 420 * (1 - d / R) * dt; p.vx += dx / d * f; p.vy += dy / d * f; }
    }
    p.x = clamp(p.x + p.vx * dt, 14, W - 14); p.y = clamp(p.y + p.vy * dt, 14, H - 14);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 40) {
      p.ang = Math.atan2(p.vy, p.vx);
      // exhaust
      if (Math.random() < 0.9) {
        const bx = p.x - Math.cos(p.ang) * 12, by = p.y - Math.sin(p.ang) * 12;
        this.fx.add(bx, by, -p.vx * 0.6 + rnd(-40, 40), -p.vy * 0.6 + rnd(-40, 40), 0.25, Math.random() < 0.5 ? 8 : 5, 2.2);
      }
    }
    // weapon tier
    while (this.weapon < WEAPONS.length - 1 && this.wave >= WEAPONS[this.weapon + 1].at) {
      this.weapon++; this.ev('banner', { text: 'WEAPON UP', sub: ['', 'TRIPLE SHOT', 'QUAD STREAM', 'FIVE-WAY FAN'][this.weapon] }); this.ev('powerup');
    }
    // firing
    this.fireCD -= dt;
    if (inp.aim) {
      const a = Math.atan2(inp.ay, inp.ax);
      p.aim = a;
      const wpn = WEAPONS[this.weapon];
      let n = 0;
      while (this.fireCD <= 0 && n++ < 3) {
        this.fireCD += wpn.period;
        for (const [da, off] of wpn.shots) {
          const aa = a + da + rnd(-0.012, 0.012);
          const ox = -Math.sin(a) * off, oy = Math.cos(a) * off;
          const sx = p.x + Math.cos(a) * 16 + ox, sy = p.y + Math.sin(a) * 16 + oy;
          this.bullets.push({ x: sx, y: sy, vx: Math.cos(aa) * 1180 + p.vx * 0.2, vy: Math.sin(aa) * 1180 + p.vy * 0.2, life: 1.4 });
        }
        this.ev('shoot');
      }
      if (this.fireCD < 0) this.fireCD = 0;
    } else if (this.fireCD < 0) this.fireCD = 0;
    if (inp.bomb) { inp.bomb = false; this.useBomb(); }
    // milestones
    if (this.mode === 'surge' && this.bonusIdx < BONUS.length && this.score >= BONUS[this.bonusIdx]) {
      this.bonusIdx++; this.lives++; this.bombs = Math.min(9, this.bombs + 1);
      this.ev('banner', { text: 'EXTRA LIFE', sub: '+1 BOMB' }); this.ev('extra');
    }
  }

  useBomb() {
    if (!this.p.alive || this.bombs <= 0 || this.over) return false;
    this.bombs--;
    const p = this.p;
    for (const e of this.enemies) if (!e.dead) this.kill(e, false, true);
    this.fx.ring(p.x, p.y, 0, 1400, 0.9, 10);
    this.fx.ring(p.x, p.y, 2, 1000, 0.7, 6);
    this.fx.burst(p.x, p.y, 0, 260, 1500, 1.3, 2.5, 2);
    this.grid.explode(p.x, p.y, 34, 900);
    this.shake = Math.min(1, this.shake + 0.9);
    this.hitstop = 0.07; this.flash = 1; this.bombFx = 0.9;
    this.p.inv = Math.max(this.p.inv, 0.8);
    this.ev('bomb');
    return true;
  }

  die() {
    const p = this.p;
    p.alive = false; this.deaths++;
    p.respawn = this.mode === 'blitz' ? 1.4 : 1.7;
    if (this.mode === 'surge') this.lives--;
    this.fx.burst(p.x, p.y, 0, 420, 1300, 1.8, 2.5, 8);
    this.fx.burst(p.x, p.y, 5, 160, 700, 2.2, 2);
    this.fx.ring(p.x, p.y, 0, 600, 0.8, 8);
    this.grid.explode(p.x, p.y, 40, 600);
    this.shake = 1; this.hitstop = 0.32; this.slow = 0.25; this.flash = 0.8;
    // clear the board (no points) the way the genre does it
    for (const e of this.enemies) if (!e.dead) this.kill(e, true, false);
    this.geoms.length = 0; this.bullets.length = 0;
    this.mult = 1; this.multPulse = 1;
    this.ev('death', { last: this.lives <= 0 });
  }
  endRun() {
    if (this.over) return;
    this.over = true; this.overT = 0;
    this.ev('over');
  }

  // ------------------------------------------------------------ bullets
  updateBullets(dt) {
    const B = this.bullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      // active black holes bend shots around them
      for (const e of this.enemies) {
        if (e.type !== 'hole' || !e.active || e.dead) continue;
        const dx = e.x - b.x, dy = e.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 52000 && d2 > e.r * e.r) { const d = Math.sqrt(d2), f = 900000 / (d2 + 4000) * dt; b.vx += dx / d * f; b.vy += dy / d * f; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || b.life <= 0) {
        if (b.life > 0) {
          const nx = b.x < 0 ? 1 : b.x > W ? -1 : 0, ny = b.y < 0 ? 1 : b.y > H ? -1 : 0;
          this.fx.cone(clamp(b.x, 0, W), clamp(b.y, 0, H), Math.atan2(ny || -b.vy * 0.2, nx || -b.vx * 0.2), 2.2, 9, 5, 260, 0.35);
        }
        B.splice(i, 1); continue;
      }
      if ((i & 1) === (this.frame & 1)) this.grid.push(b.x, b.y, b.vx / 1180, b.vy / 1180, 0.9, 50);
    }
    this.frame = (this.frame || 0) + 1;
  }

  // ------------------------------------------------------------ enemies
  spawn(type, x, y, spawnT = 0.6, extra) {
    const d = DEF[type];
    const e = { type, x: clamp(x, 30, W - 30), y: clamp(y, 30, H - 30), vx: 0, vy: 0, r: d.r, col: d.col, hp: 1, spawn: spawnT, spawnFull: spawnT, ang: rnd(0, TAU), t: rnd(0, 10), dead: false };
    if (type === 'wander') { e.dir = rnd(0, TAU); }
    if (type === 'snake') {
      e.hdg = Math.atan2(this.p.y - e.y, this.p.x - e.x);
      e.segs = [];
      for (let i = 0; i < 18; i++) e.segs.push({ x: e.x, y: e.y });
    }
    if (type === 'hole') { e.hp = 18; e.active = false; e.fed = 0; e.vx = rnd(-20, 20); e.vy = rnd(-20, 20); }
    if (extra) Object.assign(e, extra);
    this.enemies.push(e);
    if (spawnT > 0) this.ev('spawn', { kind: type });
    return e;
  }
  awayPoint(minD = 340) {
    const p = this.p;
    for (let k = 0; k < 20; k++) {
      const x = rnd(40, W - 40), y = rnd(40, H - 40);
      if (Math.hypot(x - p.x, y - p.y) > minD) return [x, y];
    }
    return [p.x < W / 2 ? W - 60 : 60, p.y < H / 2 ? H - 60 : 60];
  }
  director(dt) {
    const t = this.t;
    const alive = this.enemies.length;
    this.trickleT -= dt;
    if (this.trickleT <= 0 && alive < 300) {
      this.trickleT = Math.max(0.15, 0.9 - t * 0.0075);
      const pool = [['wander', 3], ['grunt', 5]];
      if (t > 20) pool.push(['dodger', 3]);
      if (t > 35) pool.push(['split', 2]);
      if (t > 50) pool.push(['snake', 1]);
      const holes = this.enemies.filter((e) => e.type === 'hole' && !e.dead).length;
      if (t > 70 && holes < 3) pool.push(['hole', 0.5]);
      let sum = 0; for (const [, w] of pool) sum += w;
      let r = Math.random() * sum, type = 'grunt';
      for (const [k, w] of pool) { r -= w; if (r <= 0) { type = k; break; } }
      const n = type === 'hole' || type === 'snake' ? 1 : 1 + Math.floor(Math.random() * (1.5 + t / 20));
      const [x, y] = this.awayPoint(t > 60 ? 270 : 340);
      for (let i = 0; i < n; i++) this.spawn(type, x + rnd(-40, 40), y + rnd(-40, 40));
      // later on, squeeze from a second side too
      if (t > 35 && Math.random() < Math.min(0.75, t / 200) && type !== 'hole') {
        const [x2, y2] = this.awayPoint(400);
        for (let i = 0; i < Math.ceil(n * 0.7); i++) this.spawn(type === 'snake' ? 'grunt' : type, x2 + rnd(-40, 40), y2 + rnd(-40, 40));
      }
    }
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.wave++;
      this.waveT = Math.max(9, 15 - this.wave * 0.5);
      const name = this.wave <= PATTERNS.length ? PATTERNS[this.wave - 1] : PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
      this.runPattern(name, 1 + (this.wave - 1) * 0.2);
      if (this.wave > 5 && Math.random() < 0.6) this.runPattern(PATTERNS[Math.floor(Math.random() * 3)], 0.6);
    }
  }
  runPattern(name, s) {
    const p = this.p;
    const labels = { corners: 'CORNER RUSH', flood: 'PINWHEEL FLOOD', line: 'DODGER WALL', ring: 'SURROUNDED', splits: 'SPLITTERS', snakes: 'SNAKE PIT', holes: 'GRAVITY WELLS' };
    this.ev('banner', { text: 'WAVE ' + this.wave, sub: labels[name] });
    this.ev('wave');
    if (name === 'corners') {
      for (const [cx, cy] of [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]]) {
        if (Math.hypot(cx - p.x, cy - p.y) < 300) continue;
        const n = Math.round(4 * s);
        for (let i = 0; i < n; i++) this.spawn('grunt', cx + rnd(-50, 50), cy + rnd(-50, 50), 0.8);
      }
    } else if (name === 'flood') {
      const n = Math.round(16 * s);
      for (let i = 0; i < n; i++) { const [x, y] = this.awayPoint(300); this.spawn('wander', x, y, 0.7); }
    } else if (name === 'line') {
      const n = Math.round(9 * s);
      const left = p.x > W / 2;
      for (let i = 0; i < n; i++) this.spawn('dodger', left ? 50 : W - 50, 80 + (H - 160) * (i + 0.5) / n, 0.9);
    } else if (name === 'ring') {
      const n = Math.round(12 * s), R = 330;
      for (let i = 0; i < n; i++) { const a = i / n * TAU; this.spawn('grunt', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 1.0); }
    } else if (name === 'splits') {
      const n = Math.round(5 * s);
      for (let i = 0; i < n; i++) { const [x, y] = this.awayPoint(); this.spawn('split', x, y, 0.8); }
    } else if (name === 'snakes') {
      const n = Math.min(6, Math.round(2 * s + 0.4));
      const corners = [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]].sort((a, b) => Math.hypot(b[0] - p.x, b[1] - p.y) - Math.hypot(a[0] - p.x, a[1] - p.y));
      for (let i = 0; i < n; i++) { const c = corners[i % 4]; this.spawn('snake', c[0], c[1], 0.9); }
    } else if (name === 'holes') {
      const n = Math.min(4, 2 + Math.floor(this.wave / 8));
      const spots = [[W * 0.25, H * 0.27], [W * 0.75, H * 0.27], [W * 0.25, H * 0.73], [W * 0.75, H * 0.73]].sort((a, b) => Math.hypot(b[0] - p.x, b[1] - p.y) - Math.hypot(a[0] - p.x, a[1] - p.y));
      for (let i = 0; i < n; i++) this.spawn('hole', spots[i][0], spots[i][1], 0.9);
      for (let i = 0; i < Math.round(8 * s); i++) { const [x, y] = this.awayPoint(); this.spawn('wander', x, y, 0.8); }
    }
  }

  updateEnemies(dt) {
    const p = this.p, E = this.enemies;
    const diff = Math.min(1, this.t / 110), spd = 1 + diff * 0.7;
    const tx = p.alive ? p.x : W / 2, ty = p.alive ? p.y : H / 2;
    for (const e of E) {
      if (e.dead) continue;
      e.t += dt;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      switch (e.type) {
        case 'wander': {
          e.dir += rnd(-3, 3) * dt; e.ang += dt * 4;
          e.vx += (Math.cos(e.dir) * 95 * spd - e.vx) * dt * 3; e.vy += (Math.sin(e.dir) * 95 * spd - e.vy) * dt * 3;
          break;
        }
        case 'grunt': {
          const a = 820 * spd;
          e.vx += dx / d * a * dt; e.vy += dy / d * a * dt;
          const v = Math.hypot(e.vx, e.vy), max = 230 * spd;
          if (v > max) { e.vx *= max / v; e.vy *= max / v; }
          e.ang = Math.atan2(e.vy, e.vx);
          break;
        }
        case 'dodger': {
          const a = 900 * spd;
          e.vx += dx / d * a * dt; e.vy += dy / d * a * dt;
          // sidestep incoming bullets
          for (const b of this.bullets) {
            const bx = e.x - b.x, by = e.y - b.y, bd2 = bx * bx + by * by;
            if (bd2 > 150 * 150) continue;
            const bv = Math.hypot(b.vx, b.vy) || 1;
            if ((bx * b.vx + by * b.vy) / bv < 0) continue; // moving away
            // perpendicular escape, pick the side we are already on
            let px = -b.vy / bv, py = b.vx / bv;
            if (px * bx + py * by < 0) { px = -px; py = -py; }
            e.vx += px * 4200 * dt; e.vy += py * 4200 * dt;
            break;
          }
          const v = Math.hypot(e.vx, e.vy), max = 330 * spd;
          if (v > max) { e.vx *= max / v; e.vy *= max / v; }
          e.vx *= Math.pow(0.6, dt); e.vy *= Math.pow(0.6, dt);
          e.ang += dt * 1.5;
          break;
        }
        case 'split': {
          const a = 420 * spd;
          e.vx += dx / d * a * dt; e.vy += dy / d * a * dt;
          const v = Math.hypot(e.vx, e.vy), max = 120 * spd;
          if (v > max) { e.vx *= max / v; e.vy *= max / v; }
          e.ang += dt * 2.2;
          break;
        }
        case 'mini': case 'spark': {
          const fast = e.type === 'mini' ? 270 : 300;
          const w = Math.sin(e.t * 7 + e.phase) * (e.type === 'mini' ? 1.1 : 0.5);
          const ca = Math.cos(w), sa = Math.sin(w);
          const ux = dx / d, uy = dy / d;
          const gx = ux * ca - uy * sa, gy = ux * sa + uy * ca;
          e.vx += (gx * fast * spd - e.vx) * dt * 3.5; e.vy += (gy * fast * spd - e.vy) * dt * 3.5;
          e.ang += dt * 12;
          break;
        }
        case 'snake': {
          const want = Math.atan2(dy, dx) + Math.sin(e.t * 3.2) * 0.9;
          e.hdg += clamp(angDiff(e.hdg, want), -2.6 * dt, 2.6 * dt);
          // steer off walls
          if (e.x < 80) e.hdg += angDiff(e.hdg, 0) * dt * 4; if (e.x > W - 80) e.hdg += angDiff(e.hdg, Math.PI) * dt * 4;
          if (e.y < 80) e.hdg += angDiff(e.hdg, Math.PI / 2) * dt * 4; if (e.y > H - 80) e.hdg += angDiff(e.hdg, -Math.PI / 2) * dt * 4;
          e.vx = Math.cos(e.hdg) * 185 * spd; e.vy = Math.sin(e.hdg) * 185 * spd;
          e.ang = e.hdg;
          break;
        }
        case 'hole': {
          if (!e.active) { e.ang += dt * 0.5; break; }
          e.vx *= Math.pow(0.3, dt); e.vy *= Math.pow(0.3, dt);
          e.ang += dt * (2 + e.fed * 0.3);
          const R = 300 + e.fed * 10;
          for (const o of E) {
            if (o === e || o.dead || o.type === 'hole' || o.spawn > 0) continue;
            const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy);
            if (od < e.r * 0.9) { this.feedHole(e, o); continue; }
            if (od < R) { const f = 700 * (1 - od / R) * dt; o.vx += ox / od * f; o.vy += oy / od * f; }
          }
          if (e.fed >= 10) this.overloadHole(e);
          break;
        }
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      // wall bounce
      if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); if (e.type === 'wander') e.dir = Math.PI - e.dir; }
      else if (e.x > W - e.r) { e.x = W - e.r; e.vx = -Math.abs(e.vx); if (e.type === 'wander') e.dir = Math.PI - e.dir; }
      if (e.y < e.r) { e.y = e.r; e.vy = Math.abs(e.vy); if (e.type === 'wander') e.dir = -e.dir; }
      else if (e.y > H - e.r) { e.y = H - e.r; e.vy = -Math.abs(e.vy); if (e.type === 'wander') e.dir = -e.dir; }
      if (e.segs) {
        let px = e.x, py = e.y;
        for (const s of e.segs) {
          const sx = s.x - px, sy = s.y - py, sd = Math.hypot(sx, sy);
          if (sd > 11) { s.x = px + sx / sd * 11; s.y = py + sy / sd * 11; }
          px = s.x; py = s.y;
        }
      }
    }
    // hash + light separation so swarms do not collapse into one blob
    for (const c of this.cells) c.length = 0;
    for (const e of E) {
      if (e.dead) continue;
      const ci = clamp(Math.floor(e.x / this.cs), 0, this.hc - 1) + clamp(Math.floor(e.y / this.cs), 0, this.hr - 1) * this.hc;
      this.cells[ci].push(e);
    }
    for (const c of this.cells) {
      for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
        const a = c[i], b = c[j];
        if (a.type === 'hole' || b.type === 'hole') continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, R = (a.r + b.r) * 0.9;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (R - d) * 0.5 / d;
          a.x -= dx * push * 0.5; a.y -= dy * push * 0.5; b.x += dx * push * 0.5; b.y += dy * push * 0.5;
        }
      }
    }
    if (this.frame % 30 === 0) this.enemies = E.filter((e) => !e.dead);
  }

  feedHole(h, o) {
    o.dead = true;
    h.fed++; h.hp += 3; h.r = DEF.hole.r + h.fed * 2.2;
    this.fx.burst(h.x, h.y, o.col, 14, 300, 0.4);
    this.ev('feed');
  }
  overloadHole(h) {
    h.dead = true;
    this.fx.burst(h.x, h.y, 6, 200, 1100, 1.4, 2.5, 8);
    this.fx.ring(h.x, h.y, 6, 420, 0.6, 7);
    this.grid.explode(h.x, h.y, 26, 420);
    this.shake = Math.min(1, this.shake + 0.5);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU;
      this.spawn('spark', h.x + Math.cos(a) * 20, h.y + Math.sin(a) * 20, 0, { vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, phase: rnd(0, TAU) });
    }
    this.ev('overload');
  }

  kill(e, silent = false, scoreIt = true) {
    if (e.dead) return;
    e.dead = true;
    const d = DEF[e.type];
    const big = e.type === 'hole' ? 3 : e.type === 'snake' ? 1.6 : 1;
    this.fx.burst(e.x, e.y, e.col, Math.round((silent ? 18 : 46) * big), 650 * Math.sqrt(big), 1.0, 2, 0);
    if (e.segs) for (let i = 0; i < e.segs.length; i += 2) this.fx.burst(e.segs[i].x, e.segs[i].y, 5, 6, 300, 0.7);
    this.grid.explode(e.x, e.y, silent ? 4 : 8 * big, 110 * big);
    if (silent) return;
    if (scoreIt) {
      const pts = d.pts * (e.type === 'hole' ? 1 + e.fed : 1) * this.mult;
      this.score += pts; this.kills++;
      this.killChain++; this.chainT = 0.6;
      if ((e.type === 'hole' || e.type === 'snake') && this.fx.texts.length < 10) this.fx.text(e.x, e.y - 20, String(pts), '#' + ['fff', '8f6bff', '3cc8ff', '5dff6a', 'ff52d9', 'ffd23c', 'ff4040', '9fe8ff'][e.col], e.type === 'hole' ? 30 : 22);
      const ng = d.geoms + (e.type === 'hole' ? e.fed : 0);
      for (let i = 0; i < ng && this.geoms.length < 260; i++) {
        const a = rnd(0, TAU), s = rnd(60, 220);
        this.geoms.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 4.5, ang: rnd(0, TAU) });
      }
    }
    if (e.type === 'split') {
      for (let i = 0; i < 3; i++) {
        const a = e.ang + i / 3 * TAU;
        this.spawn('mini', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, 0, { vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, phase: i * 2.1 });
      }
    }
    if (e.type === 'hole') {
      this.fx.ring(e.x, e.y, 6, 320, 0.5, 6);
      this.shake = Math.min(1, this.shake + 0.4); this.hitstop = Math.max(this.hitstop, 0.05);
      this.grid.explode(e.x, e.y, 22, 360);
    } else this.shake = Math.min(1, this.shake + 0.05);
    this.ev('kill', { kind: e.type, chain: this.killChain });
  }

  collide() {
    const B = this.bullets, p = this.p;
    const snakes = this.enemies.filter((e) => e.type === 'snake' && !e.dead && e.spawn <= 0);
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      let hit = null;
      const cx = Math.floor(b.x / this.cs), cy = Math.floor(b.y / this.cs);
      outer: for (let yy = cy - 1; yy <= cy + 1; yy++) {
        if (yy < 0 || yy >= this.hr) continue;
        for (let xx = cx - 1; xx <= cx + 1; xx++) {
          if (xx < 0 || xx >= this.hc) continue;
          for (const e of this.cells[xx + yy * this.hc]) {
            if (e.dead || e.spawn > 0) continue;
            const dx = e.x - b.x, dy = e.y - b.y, R = e.r + 4;
            if (dx * dx + dy * dy < R * R) { hit = e; break outer; }
          }
        }
      }
      // big holes can be wider than the hash neighbourhood
      if (!hit) for (const e of this.enemies) {
        if (e.type !== 'hole' || e.dead || e.spawn > 0 || e.r < 40) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) { hit = e; break; }
      }
      if (!hit) { // snake tails eat bullets
        for (const s of snakes) {
          for (let k = 1; k < s.segs.length; k += 1) {
            const g = s.segs[k];
            if (Math.abs(g.x - b.x) < 9 && Math.abs(g.y - b.y) < 9) { hit = s; hit.__tail = true; break; }
          }
          if (hit) break;
        }
      }
      if (!hit) continue;
      B.splice(i, 1);
      if (hit.__tail) { hit.__tail = false; this.fx.cone(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.6, 5, 4, 240, 0.3); continue; }
      if (hit.type === 'hole') {
        if (!hit.active) { hit.active = true; this.ev('holeOn'); this.fx.ring(hit.x, hit.y, 6, 120, 0.4, 3); }
        hit.hp--;
        hit.vx += b.vx * 0.012; hit.vy += b.vy * 0.012;
        this.fx.cone(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.4, 6, 3, 300, 0.3);
        if (hit.hp <= 0) this.kill(hit);
        else this.ev('holeHit');
      } else this.kill(hit);
    }
    // player
    if (!p.alive || p.inv > 0) return;
    for (const e of this.enemies) {
      if (e.dead || e.spawn > 0) continue;
      const R = e.r * 0.75 + 9;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < R * R) { this.die(); return; }
      if (e.segs) for (let k = 1; k < e.segs.length; k++) {
        const g = e.segs[k], sx = g.x - p.x, sy = g.y - p.y;
        if (sx * sx + sy * sy < 15 * 15) { this.die(); return; }
      }
    }
  }

  // ------------------------------------------------------------ geoms
  updateGeoms(dt) {
    const p = this.p, G = this.geoms;
    for (let i = G.length - 1; i >= 0; i--) {
      const g = G[i];
      g.life -= dt; g.ang += dt * 3;
      if (g.life <= 0) { G.splice(i, 1); continue; }
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
      if (p.alive && d < 170) {
        const f = 3200 * (1.2 - d / 170);
        g.vx += dx / d * f * dt; g.vy += dy / d * f * dt;
        if (d < 22) {
          G.splice(i, 1);
          this.mult++; this.geomsGot++; this.maxMult = Math.max(this.maxMult, this.mult);
          this.score += 10 * this.mult;
          this.multPulse = 1;
          this.fx.burst(g.x, g.y, 3, 4, 200, 0.3, 1.5);
          this.ev('geom', { mult: this.mult });
          if (MULT_MARKS.includes(this.mult)) { this.ev('banner', { text: 'x' + this.mult, sub: 'MULTIPLIER' }); this.ev('powerup'); this.fx.ring(p.x, p.y, 3, 260, 0.45, 4); }
          continue;
        }
      }
      // holes eat geoms too
      for (const e of this.enemies) {
        if (e.type !== 'hole' || !e.active || e.dead) continue;
        const hx = e.x - g.x, hy = e.y - g.y, hd = Math.hypot(hx, hy);
        if (hd < 280) { g.vx += hx / hd * 900 * dt; g.vy += hy / hd * 900 * dt; }
        if (hd < e.r) g.life = 0;
      }
      g.vx *= Math.pow(0.12, dt); g.vy *= Math.pow(0.12, dt);
      g.x = clamp(g.x + g.vx * dt, 4, W - 4); g.y = clamp(g.y + g.vy * dt, 4, H - 4);
    }
  }

  // ------------------------------------------------------------ autopilot
  // Used by the title-screen demo and the headless tests. Flees nearby
  // threats and walls, drifts toward shards, aims at the nearest enemy.
  botInput() {
    const p = this.p, inp = this.inp;
    // reaction time: only re-think movement every few frames
    this.botThink = (this.botThink || 0) - 1;
    const think = this.botThink <= 0;
    if (think) this.botThink = this.botReact || 7;
    let fx = 0, fy = 0, best = null, bd = 1e9, near = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.spawn <= 0) {
        if (d < near) near = d;
        const R = e.type === 'hole' && e.active ? 380 : 230;
        if (d < R) { const w = Math.pow((R - d) / R, 2) * (e.type === 'hole' ? 3 : 1.4); fx += dx / d * w; fy += dy / d * w; }
        if (e.segs) for (let k = 2; k < e.segs.length; k += 3) {
          const g = e.segs[k], sx = p.x - g.x, sy = p.y - g.y, sd = Math.hypot(sx, sy) || 1;
          if (sd < 130) { const w = Math.pow((130 - sd) / 130, 2) * 1.6; fx += sx / sd * w; fy += sy / sd * w; }
        }
      } else if (d < 90) { fx += dx / d * 0.6; fy += dy / d * 0.6; }
      const score = d + (e.spawn > 0 ? 400 : 0) + (e.type === 'hole' && !e.active ? 350 : 0);
      if (score < bd) { bd = score; best = e; }
    }
    // walls and corners are death traps
    const m = 160;
    if (p.x < m) fx += Math.pow((m - p.x) / m, 2) * 2.4; if (p.x > W - m) fx -= Math.pow((p.x - (W - m)) / m, 2) * 2.4;
    if (p.y < m) fy += Math.pow((m - p.y) / m, 2) * 2.4; if (p.y > H - m) fy -= Math.pow((p.y - (H - m)) / m, 2) * 2.4;
    // shards
    if (Math.hypot(fx, fy) < 0.5) {
      let gb = null, gd = 300;
      for (const g of this.geoms) { const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < gd) { gd = d; gb = g; } }
      if (gb) { fx += (gb.x - p.x) / gd * 0.8; fy += (gb.y - p.y) / gd * 0.8; }
      else { fx += (W / 2 - p.x) / W * 0.6 + Math.cos(this.t * 0.7) * 0.3; fy += (H / 2 - p.y) / H * 0.6 + Math.sin(this.t * 0.9) * 0.3; }
    }
    const fl = Math.hypot(fx, fy);
    if (think) { inp.mx = fl > 0.05 ? fx / Math.max(fl, 0.6) : 0; inp.my = fl > 0.05 ? fy / Math.max(fl, 0.6) : 0; }
    // human-ish aim: re-target every ~0.15 s, a bit of wobble, no leading
    this.botAimT = (this.botAimT || 0) - 1;
    if (this.botAimT <= 0 && best) { this.botTarget = best; this.botAimT = 9; this.botJit = rnd(-0.12, 0.12); }
    const tg = this.botTarget && !this.botTarget.dead ? this.botTarget : best;
    if (tg) {
      const a = Math.atan2(tg.y - p.y, tg.x - p.x) + (this.botJit || 0);
      inp.ax = Math.cos(a); inp.ay = Math.sin(a); inp.aim = true;
    } else inp.aim = true;
    if (this.bombs > 0 && near < 46 && p.inv <= 0 && (this.botBombs !== false)) inp.bomb = true;
  }
}
