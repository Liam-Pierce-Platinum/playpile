// GRAZE simulation: fixed 120 Hz step, no DOM. main.js drives it, listens to
// its events for sound and effects, and owns saving. tools/sim.mjs runs it
// headless in Node with the bot to prove every course is beatable.
import { H, BASE_SPEED, STEP, clamp } from './util.js';
import { buildRun, buildDaily, buildLevel, dailyInfo, ACCENTS } from './levels.js';

export const HIT_R = 5, HIT_R_MINI = 3;     // forgiving hitbox (the arrow is ~24 units long)
export const BAND = 22, BAND_MINI = 13;     // graze band beyond the hitbox (wide enough that hugging a wall in a normal tunnel keeps grazing)
export const SURVIVE_PPS = 10;              // base score per second alive (x (1 + tier/2) in RUN): the number always climbs
export const SAME_COURSE = 3;               // RUN keeps the same course for this many attempts so patterns can be learned
export const START_TIER = 2;                // the "START AT TIER 3" option (tier index 2 = 60 s in)
export const PHASE_FILL = 0.1;              // meter per graze -> 10 grazes = 1 phase
export const COMBO_TIME = 3.2;              // combo drops after this long without a graze
export const PHASE_TIME = 0.6, PHASE_GRACE = 0.45;
export const TIER_SECS = 30, TIER_MUL = 1.08;
export const GHOST_DX = 8;
export const GLIDE = 0.9;

export class Game {
  constructor() {
    this.fns = [];
    this.mode = 'none';
    this.hold = false;
    this.bot = false;
    this.practice = false;
    this.attempts = 0;
    this.q = { d: 0, id: 0, nx: 0, ny: 0, kind: '' };
    this.ghost = null;
  }
  on(fn) { this.fns.push(fn); }
  emit(type, data = {}) { for (const f of this.fns) f(type, data, this); }

  // spec: { mode: 'run' | 'daily' | 'level' | 'attract', w, l, seed, practice }
  load(spec) {
    this.spec = spec;
    this.mode = spec.mode;
    this.practice = !!spec.practice;
    this.attempts = 0;
    this.checkX = 0;
    this.best = null;
    this.build();
    this.reset();
  }
  build() {
    const s = this.spec;
    let b;
    if (s.mode === 'daily') { this.daily = s.daily || dailyInfo(); b = buildDaily(this.daily); }
    else if (s.mode === 'level' || (s.mode === 'attract' && s.w != null)) b = buildLevel(s.w, s.l);
    else b = buildRun(s.seed != null ? s.seed : (Math.random() * 2 ** 32) >>> 0, { short: !!s.short, startTier: s.startTier || 0 });
    this.course = b.course; this.extend = b.extend;
    this.baseSpeed = b.speed; this.accent = b.accent; this.root = b.root; this.songSeed = b.seed;
  }

  // start an attempt (from a practice checkpoint if one is set)
  reset(atX = null) {
    if (this.mode === 'run' && this.attempts > 0 && this.spec.seed == null && atX == null && this.attempts % SAME_COURSE === 0) this.build(); // a fresh RUN course every SAME_COURSE attempts
    const c = this.course;
    const k = atX != null ? c.checkAt(atX) : this.practice && this.checkX > 0 ? c.checkAt(this.checkX) : c.checks[0];
    this.p = {
      x: k.x, y: k.y, up: false, mini: k.mini, grav: k.grav, spd: k.speed, mirror: k.mirror,
      alive: true, lastTurn: 0,
      glide: atX == null && k.x === 0, // fly level until the first press (max GLIDE s) so a fresh attempt never starts mid-fall
    };
    this.startX = k.x;
    this.nextPortal = c.portals.findIndex((pt) => pt.x >= k.x - 0.01); if (this.nextPortal < 0) this.nextPortal = c.portals.length;
    this.t = 0; this.score = 0; this.grazes = 0; this.phases = 0; this.combo = 0; this.mult = 1; this.maxMult = 1; this.maxCombo = 0;
    this.meter = 0; this.phasing = false; this.phaseLeft = 0; this.phaseGrace = 0; this.phasedIds = null;
    this.lastGrazeT = -9; this.lastId = 0; this.inBand = false; this.scrapeT = 0;
    this.grazeTimes = []; this.phaseTimes = []; this.portals = 0;
    this.tier = 0; this.finished = false; this.deadT = 0; this.restartQueued = false;
    this.runPts = 0; this.tierPendX = 0;
    if (this.mode === 'run' && this.spec.startTier) { this.tier = this.spec.startTier; this.t = this.tier * TIER_SECS; }
    this.rec = []; this.recX = this.startX;
    this.seg = Array.from({ length: 10 }, () => ({ g: 0, ph: 0, reached: false, died: false }));
    this.progress = this.progressAt(this.p.x);
    this.attempts++;
    this.emit('start', { attempt: this.attempts });
  }

  get speedMul() { return this.baseSpeed * (this.mode === 'run' ? Math.pow(TIER_MUL, this.tier) : 1); }
  get vx() { return BASE_SPEED * this.speedMul * this.p.spd; }
  get hitR() { return this.p.mini ? HIT_R_MINI : HIT_R; }
  get band() { return this.p.mini ? BAND_MINI : BAND; }
  get accentNow() { return this.mode === 'run' ? ACCENTS[this.tier % 4] : this.accent; }
  progressAt(x) { return this.course.length < Infinity ? clamp(x / this.course.length, 0, 1) : 0; }

  // autopilot: steer at the safe line. botLook (s) is anticipation: a human
  // turns for a corner they can see coming, a pure delay controller cannot.
  botUp() {
    const p = this.p, c = this.course;
    const look = this.vx * (STEP * 2 + (this.botLook || 0));
    let ty = c.pathY(p.x + look);
    if (this.botLean) ty += this.botLean * (Math.sin(this.t * 1.7) > 0 ? 1 : -1);
    const hyst = 2.5;
    if (p.y > ty + hyst) return true;
    if (p.y < ty - hyst) return false;
    return p.up;
  }

  step(dt = STEP) {
    const p = this.p, c = this.course;
    if (!p.alive || this.finished) return;
    p.ox = p.x; p.oy = p.y;
    const wantUp = this.bot ? this.botUp() : (p.grav > 0 ? this.hold : !this.hold);
    if (wantUp !== p.up) {
      p.up = wantUp;
      if (this.t - p.lastTurn > 0.045) this.emit('turn', { up: wantUp });
      p.lastTurn = this.t;
    }
    if (p.glide && (this.bot || this.hold || this.t >= GLIDE)) p.glide = false;
    const vx = this.vx, m = p.mini ? 2 : 1;
    p.x += vx * dt;
    if (!p.glide) p.y += (p.up ? -1 : 1) * m * vx * dt;
    this.t += dt;

    // endless course
    if (this.extend && c.genX < p.x + 3000) this.extend(p.x + 4500);

    // survival score: SURVIVE_PPS per second, scaled by the speed tier in RUN
    {
      const inc = dt * SURVIVE_PPS * (this.mode === 'run' ? 1 + this.tier * 0.5 : 1);
      const add = Math.floor(this.runPts + inc) - Math.floor(this.runPts);
      this.runPts += inc; this.score += add;
    }

    // speed tiers (RUN): the timer arms a tier-up, which fires at the next chunk boundary
    if (this.mode === 'run') {
      const tier = Math.floor(this.t / TIER_SECS);
      if (tier !== this.tier) {
        if (!this.tierPendX) { const nx = c.chunks.find((ch) => ch.x0 > p.x); this.tierPendX = nx ? nx.x0 : p.x; }
        if (p.x >= this.tierPendX) { this.tier = tier; this.tierPendX = 0; this.emit('tier', { tier }); }
      }
    }

    // portals
    while (this.nextPortal < c.portals.length && p.x >= c.portals[this.nextPortal].x) {
      const pt = c.portals[this.nextPortal++];
      if (pt.kind === 'mini') p.mini = pt.on;
      if (pt.kind === 'grav') p.grav = pt.on ? -1 : 1;
      if (pt.kind === 'speed') p.spd = pt.on ? 1.3 : 1;
      if (pt.kind === 'mirror') p.mirror = pt.on;
      if (pt.on) this.portals++;
      this.emit('portal', pt);
    }

    // practice checkpoints
    if (this.practice) {
      const k = c.checkAt(p.x);
      if (k && k.x > this.checkX && p.x - k.x > 30) { this.checkX = k.x; this.emit('checkpoint', k); }
    }

    // progress + per-tenth stats (Daily share strip)
    this.progress = this.progressAt(p.x);
    const si = Math.min(9, Math.floor(this.progress * 10));
    this.seg[si].reached = true;

    // ghost recording
    while (p.x >= this.recX) { this.rec.push(Math.round(p.y)); this.recX += GHOST_DX; }

    // collisions
    const R = this.hitR, band = this.band;
    const q = c.query(p.x, p.y, R + band + 8, this.q);
    const out = p.y < -12 || p.y > H + 12;
    if (this.phasing) {
      p.y = clamp(p.y, -10, H + 10);
      if (q.d < R && !this.phasedIds.has(q.id)) {
        this.phasedIds.add(q.id); this.phaseTimes.push(this.t);
        const bonus = 100 * this.mult; this.score += bonus;
        this.emit('phaseThrough', { x: p.x, y: p.y, bonus });
      }
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) {
        if (q.d < R || out) {
          this.phaseGrace -= dt;
          if (this.phaseGrace <= 0) { this.die(q); return; }
        } else { this.phasing = false; this.emit('phaseEnd', {}); }
      }
    } else if (q.d < R || out) {
      if (this.meter >= 1 && !out) this.startPhase(q);
      else { this.die(q); return; }
    } else if (q.d < R + band) {
      if (!this.inBand) {
        if (this.t - this.lastGrazeT > 0.1 || q.id !== this.lastId) this.graze(q, si);
        this.scrapeT = 0;
      } else {
        this.scrapeT += dt;
        if (q.id !== this.lastId && this.t - this.lastGrazeT > 0.1) { this.graze(q, si); this.scrapeT = 0; }
        else if (this.scrapeT >= 0.28) { this.graze(q, si); this.scrapeT = 0; }
      }
      this.inBand = true;
      this.emit('scrape', { x: q.nx, y: q.ny, d: q.d - R });
    } else this.inBand = false;

    // combo timeout
    if (this.combo > 0 && this.t - this.lastGrazeT > COMBO_TIME) {
      this.combo = 0; this.mult = 1; this.emit('comboLost', {});
    }

    if (p.x >= c.finishX) {
      this.finished = true;
      this.progress = 1;
      this.emit('finish', this.summary());
    }
  }

  graze(q, si) {
    this.grazes++; this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const m = Math.min(10, 1 + Math.floor(this.combo / 6));
    const up = m > this.mult;
    this.mult = m; this.maxMult = Math.max(this.maxMult, m);
    const pts = 10 * this.mult;
    this.score += pts;
    const wasFull = this.meter >= 1;
    this.meter = Math.min(1, this.meter + PHASE_FILL);
    this.lastGrazeT = this.t; this.lastId = q.id;
    this.grazeTimes.push(this.t);
    this.seg[si].g++;
    this.emit('graze', { x: q.nx, y: q.ny, kind: q.kind, combo: this.combo, mult: this.mult, pts });
    if (up) this.emit('mult', { mult: this.mult });
    if (!wasFull && this.meter >= 1) this.emit('phaseReady', {});
  }

  startPhase(q) {
    this.phasing = true; this.phaseLeft = PHASE_TIME; this.phaseGrace = PHASE_GRACE;
    this.meter = 0; this.phases++;
    this.phasedIds = new Set([q.id]);
    this.phaseTimes.push(this.t);
    this.combo += 3;
    this.mult = Math.min(10, 1 + Math.floor(this.combo / 6)); this.maxMult = Math.max(this.maxMult, this.mult);
    this.lastGrazeT = this.t;
    const bonus = 250 * this.mult;
    this.score += bonus;
    this.seg[Math.min(9, Math.floor(this.progress * 10))].ph++;
    this.emit('phase', { x: this.p.x, y: this.p.y, bonus, nx: q.nx, ny: q.ny });
  }

  die(q) {
    const p = this.p;
    p.alive = false; this.deadT = 0;
    this.seg[Math.min(9, Math.floor(this.progress * 10))].died = true;
    this.emit('death', { x: p.x, y: p.y, nx: q ? q.nx : p.x, ny: q ? q.ny : p.y, summary: this.summary() });
  }

  // windowed maxima for missions
  static maxIn(times, win) {
    let best = 0, j = 0;
    for (let i = 0; i < times.length; i++) { while (times[i] - times[j] > win) j++; best = Math.max(best, i - j + 1); }
    return best;
  }
  summary() {
    return {
      mode: this.mode, practice: this.practice, score: this.score, grazes: this.grazes, phases: this.phases,
      t: this.t, tier: this.tier, maxMult: this.maxMult, maxCombo: this.maxCombo, portals: this.portals,
      finished: this.finished, progress: this.progress, dist: Math.max(0, this.p.x - this.startX),
      phase10: Game.maxIn(this.phaseTimes, 10), burst5: Game.maxIn(this.grazeTimes, 5),
      attempts: this.attempts, seg: this.seg.map((s) => ({ ...s })), startX: this.startX, startTier: this.spec.startTier || 0,
    };
  }

  ghostY(x) {
    const g = this.ghost;
    if (!g || !g.length) return null;
    const f = x / GHOST_DX, i = Math.floor(f);
    if (i < 0 || i >= g.length - 1) return null;
    return g[i] + (g[i + 1] - g[i]) * (f - i);
  }
}
