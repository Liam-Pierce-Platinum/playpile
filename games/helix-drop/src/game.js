// HELIX DROP - pure game logic. No three.js here so a headless bot can drive it.
// Angles: the tower spins by `theta` around Y. A point at tower-local angle a sits
// at world angle a + theta, world position (sin, ., cos) * radius. The ball always
// sits at world angle 0 (straight toward the camera).

export const TAU = Math.PI * 2;
export const SEGS = 12, SEG = TAU / SEGS;
export const R_POLE = 0.82, R_IN = 0.98, R_OUT = 3.05, R_BALL = 2.0, BALL_R = 0.36;
export const SPACING = 3.1, THICK = 0.42;
export const GRAV = 32, BOUNCE = 11.2, VMAX = 18;
export const STEP = 1 / 120;
export const FIRE_AT = 3;

export const GAP = 0, SAFE = 1, RED = 2;

export const norm = (a) => ((a % TAU) + TAU) % TAU;
export const angDiff = (a, b) => { let d = norm(a - b); if (d > Math.PI) d -= TAU; return d; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Difficulty 0..1 for a level number / an endless depth.
export const levelDiff = (level) => clamp((level - 1) / 36, 0, 1);
export const depthDiff = (i) => clamp(i / 140, 0, 1);
export const levelRings = (level) => Math.min(40, 10 + Math.floor(level * 1.3));

// Build one ring. `aim` = tower-local angle where the previous gap was (gaps drift
// from there, so chains of falls are possible). Returns {segs, gapCenter}.
function makeRing(R, d, aim, opts = {}) {
  const segs = new Int8Array(SEGS).fill(SAFE);
  // gap length: 3 easy .. 1 hard
  const r = R();
  let gapLen = r < (1 - d) * 0.45 ? 3 : r < 0.92 - d * 0.35 ? 2 : 1;
  if (opts.first) gapLen = 3;
  // place the gap (index 0..gapLen-1 for now, rotated into position below)
  for (let k = 0; k < gapLen; k++) segs[k] = GAP;
  // a second gap on easier rings
  if (!opts.first && R() < 0.3 * (1 - d) + 0.05) {
    const k2 = gapLen + 2 + Math.floor(R() * (SEGS - gapLen - 4));
    segs[k2] = GAP; if (R() < 0.5 && k2 + 1 < SEGS - 1) segs[k2 + 1] = GAP;
  }
  // red runs
  if (!opts.first) {
    let reds = 0;
    if (R() < 0.25 + d * 0.75) reds = 1 + Math.floor(R() * (1.5 + d * 4.5));
    reds = Math.min(reds, 6);
    let tries = 0;
    while (reds > 0 && tries++ < 40) {
      // devious: on harder rings, red likes to sit right beside the gap
      let k = R() < d * 0.6 ? (R() < 0.5 ? gapLen : SEGS - 1) : Math.floor(R() * SEGS);
      if (segs[k] !== SAFE) continue;
      segs[k] = RED; reds--;
      if (reds > 0 && R() < 0.55) { const k2 = (k + 1) % SEGS; if (segs[k2] === SAFE) { segs[k2] = RED; reds--; } }
    }
    // always keep at least 3 safe segments
    let safe = 0; for (let k = 0; k < SEGS; k++) if (segs[k] === SAFE) safe++;
    for (let k = SEGS - 1; safe < 3 && k >= 0; k--) if (segs[k] === RED) { segs[k] = SAFE; safe++; }
  }
  // rotate so the main gap's centre lands near `aim` + drift
  const spread = opts.first ? 0 : Math.PI * (0.35 + d * 1.1);
  const want = norm(aim + (R() - 0.5) * 2 * spread);
  const center = (gapLen / 2) * SEG;
  const shift = Math.round(norm(want - center) / SEG) % SEGS;
  const out = new Int8Array(SEGS);
  for (let k = 0; k < SEGS; k++) out[(k + shift) % SEGS] = segs[k];
  return { segs: out, gapCenter: norm(center + shift * SEG) };
}

export class Game {
  constructor() {
    this.events = [];
    this.mode = 'levels'; this.level = 1;
    this.rings = []; this.score = 0; this.startScore = 0;
    this.reset('levels', 1, 0);
  }

  reset(mode, level, score = 0) {
    this.mode = mode; this.level = level;
    this.score = score; this.startScore = score;
    this.R = rng(mode === 'endless' ? (Date.now() & 0xffffff) : level * 7919 + 1013);
    this.rings = [];
    this.theta = 0;
    this.ball = { y: 0, vy: 0, fire: false };
    this.streak = 0;      // rings fallen through since last touch
    this.bestStreak = 0;
    this.next = 0;        // index of the ring the ball is above
    this.alive = true; this.done = false;
    this.hitstop = 0; this.t = 0;
    this.passed = 0; this.smashed = 0; this.bounces = 0;
    this.aim = 0;
    this.total = mode === 'endless' ? Infinity : levelRings(level);
    this.addRing(true);
    this.fill();
    // ball starts at the top of its bounce over ring 0 (which is safe under angle 0)
    this.ball.y = this.rings[0].y + BALL_R + (BOUNCE * BOUNCE) / (2 * GRAV);
    this.events.push({ type: 'reset' });
  }

  diff(i) { return this.mode === 'endless' ? depthDiff(i) : levelDiff(this.level) * 0.85 + clamp(i / 40, 0, 1) * 0.15; }

  addRing(first = false) {
    const i = this.rings.length;
    const y = -i * SPACING;
    if (i >= this.total) {
      const segs = new Int8Array(SEGS).fill(SAFE);
      this.rings.push({ i, y, segs, off: 0, spin: 0, goal: true, state: 'live' });
      return;
    }
    const d = this.diff(i);
    let ring;
    if (first) {
      // safe under the ball (angle 0), gap a quarter-turn away so the player must spin
      const side = this.R() < 0.5 ? 1 : -1;
      ring = makeRing(this.R, 0, side * Math.PI * 0.5, { first: true });
      const k0 = 0; if (ring.segs[k0] !== SAFE) ring.segs[k0] = SAFE;
      ring.segs[SEGS - 1] = ring.segs[SEGS - 1] === GAP ? SAFE : ring.segs[SEGS - 1];
    } else {
      ring = makeRing(this.R, d, this.aim);
      // teach "red = bad" from the first level: the intro levels always show a little red,
      // a single piece placed opposite the gap so it is visible but easy to avoid
      if (this.mode === 'levels' && this.level <= 2 && i >= 2 && i % 3 === (this.level === 1 ? 2 : 0) && !ring.segs.includes(RED)) {
        const k = Math.floor(norm(ring.gapCenter + Math.PI) / SEG) % SEGS;
        for (const o of [0, 1, -1, 2, -2, 3, -3]) { const kk = (k + o + SEGS) % SEGS; if (ring.segs[kk] === SAFE && ring.segs[(kk + 1) % SEGS] !== GAP && ring.segs[(kk + SEGS - 1) % SEGS] !== GAP) { ring.segs[kk] = RED; break; } }
      }
      // fairness: dropping straight through the gap above never lands on red
      const prev = this.rings[i - 1];
      if (prev && !prev.spin) for (let k = 0; k < SEGS; k++) if (prev.segs[k] === GAP && ring.segs[k] === RED) ring.segs[k] = SAFE;
    }
    this.aim = ring.gapCenter;
    let spin = 0;
    const lvl = this.mode === 'endless' ? 1 + i / 6 : this.level;
    if (!first && lvl >= 5 && this.R() < 0.08 + d * 0.32) spin = (0.45 + this.R() * (0.5 + d * 0.7)) * (this.R() < 0.5 ? -1 : 1);
    this.rings.push({ i, y, segs: ring.segs, off: 0, spin, goal: false, state: 'live' });
  }

  fill() {
    if (this.mode === 'endless') while (this.rings.length < this.next + 40) this.addRing();
    else while (this.rings.length <= this.total) this.addRing();
  }

  mult() { return this.mode === 'endless' ? 1 + Math.floor(this.passed / 30) : 1 + Math.floor((this.level - 1) / 4); }
  progress() { return this.mode === 'endless' ? 0 : clamp(this.next / this.total, 0, 1); }

  // tower-local angle under the ball for ring r
  localAngle(r) { return norm(-this.theta - r.off); }
  segAt(r) { return r.goal ? SAFE : r.segs[Math.floor(this.localAngle(r) / SEG) % SEGS]; }

  rotate(d) { if (this.alive && !this.done) this.theta += d; }

  update(dt) {
    this.t += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    for (let k = Math.max(0, this.next - 2); k < Math.min(this.rings.length, this.next + 12); k++) {
      const r = this.rings[k]; if (r.spin) r.off = norm(r.off + r.spin * dt);
    }
    if (!this.alive) return;
    const b = this.ball;
    b.vy = Math.max(-VMAX, b.vy - GRAV * dt);
    const prevBottom = b.y - BALL_R;
    b.y += b.vy * dt;
    const bottom = b.y - BALL_R;
    const r = this.rings[this.next];
    if (!r || b.vy >= 0 || !(prevBottom >= r.y && bottom < r.y)) return;

    const seg = this.segAt(r);
    const la = this.localAngle(r);
    if (r.goal) {
      b.y = r.y + BALL_R; b.vy = BOUNCE;
      if (!this.done) {
        this.done = true;
        const bonus = 10 * this.mult() + (this.streak >= 2 ? 5 * this.streak : 0);
        this.score += bonus;
        this.events.push({ type: 'clear', ring: r, angle: la, bonus });
      } else this.events.push({ type: 'bounce', ring: r, angle: la, soft: true });
      this.streak = 0; b.fire = false;
      return;
    }
    if (b.fire && seg !== GAP) {
      // fireball smashes this ring whatever colour it is
      r.state = 'smashed'; this.next++; this.smashed++; this.passed++;
      const pts = 2 * Math.max(1, this.streak) * this.mult();
      this.score += pts;
      b.fire = false; this.streak = 0;
      b.vy *= 0.35;
      this.hitstop = 0.07;
      this.events.push({ type: 'smash', ring: r, angle: la, pts });
      this.fill();
      return;
    }
    if (seg === GAP) {
      r.state = 'passed'; this.next++; this.passed++;
      this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      const pts = Math.min(this.streak, 10) * this.mult();
      this.score += pts;
      this.events.push({ type: 'pass', ring: r, streak: this.streak, pts });
      if (this.streak >= FIRE_AT && !b.fire) { b.fire = true; this.events.push({ type: 'fire' }); }
      this.fill();
      return;
    }
    if (seg === SAFE) {
      b.y = r.y + BALL_R; b.vy = BOUNCE; this.bounces++;
      const had = this.streak; this.streak = 0;
      this.events.push({ type: 'bounce', ring: r, angle: la, after: had });
      return;
    }
    // red
    b.y = r.y + BALL_R; b.vy = 0;
    this.alive = false; this.hitstop = 0.12;
    this.events.push({ type: 'death', ring: r, angle: la });
  }

  // ---- bot: the tower angle a perfect player would aim for right now
  botTarget(rate = 14) {
    const r = this.rings[this.next];
    if (!r || r.goal) return this.theta;
    const la = this.localAngle(r);
    // time until the ball reaches this ring's top (spinning rings: lead the target)
    const b = this.ball, h = b.y - BALL_R - r.y;
    const tHit = (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * GRAV * h))) / GRAV;
    const reach = rate * tHit;
    const pick = (want) => {
      let bestD = null;
      for (let k = 0; k < SEGS; k++) {
        if (!want(r.segs[k])) continue;
        const c = norm((k + 0.5) * SEG - r.spin * tHit);
        const d = angDiff(c, la);
        if (bestD === null || Math.abs(d) < Math.abs(bestD)) bestD = d;
      }
      return bestD;
    };
    let d = pick((s) => s === GAP);
    if (d === null || Math.abs(d) > reach * 0.9) {
      const ds = this.ball.fire ? d : pick((s) => s === SAFE);
      if (ds !== null && (d === null || Math.abs(ds) < Math.abs(d))) d = ds;
    }
    if (d === null) return this.theta;
    return this.theta - d;
  }
}
