// Rules: scoring, missions and ranks, lanes, targets, lock/multiball/jackpot,
// ball save, tilt, ball lifecycle. No DOM here, so it runs headless in node too.
import * as T from './table.js';
import * as P from './physics.js';

export const RANKS = ['CADET', 'ENSIGN', 'LIEUTENANT', 'CAPTAIN', 'COMMANDER', 'COMMODORE', 'ADMIRAL', 'FLEET ADMIRAL'];
export const MISSIONS = [
  { id: 'bumper', name: 'BUMPER STORM', hint: 'HIT THE BUMPERS', goal: 10 },
  { id: 'stand', name: 'STAR SIGNAL', hint: 'HIT STAR TARGETS', goal: 3 },
  { id: 'drop', name: 'TARGET SWEEP', hint: 'DROP THE TARGETS', goal: 3 },
  { id: 'saucer', name: 'BLACK HOLE', hint: 'SINK BLACK HOLE', goal: 1 },
  { id: 'lane', name: 'LANE SWEEP', hint: 'ROLL TOP LANES', goal: 3 },
  { id: 'spin', name: 'SPIN CYCLE', hint: 'RIP THE SPINNER', goal: 16 },
  { id: 'orbit', name: 'ORBIT RUN', hint: 'SHOOT LEFT ORBIT', goal: 2 },
  { id: 'ramp', name: 'RAMP RACE', hint: 'SHOOT THE RAMP', goal: 2 },
];
const SAVE_TIME = 8, SKILL_BAND = 0.07, COMBO_TIME = 4;
export { SKILL_BAND };

export class Game {
  constructor(hooks = {}) {
    this.h = { sfx() {}, onOver() {}, ...hooks };
    this.track = T.rampTrack();
    this.ev = { hit: (o, imp, b, x, y) => this.onHit(o, imp, b, x, y), sense: (b, ox, oy) => this.onSense(b, ox, oy) };
    this.reset();
  }

  sfx(n, a) { this.h.sfx(n, a); }

  reset() {
    const t = T.buildTable();
    this.W = { segs: t.segs, circles: t.circles, flips: P.makeFlippers(), balls: [] };
    this.dropSegs = t.segs.filter((s) => s.kind === 'drop').sort((a, b) => a.idx - b.idx);
    this.score = 0; this.ballNum = 1; this.maxBalls = 3; this.extraBalls = 0;
    this.bonus = 0; this.bonusX = 1;
    this.rank = 0; this.mIdx = 0; this.mLap = 0; this.mProg = 0; this.missionsDone = 0;
    this.lanes = [0, 0, 0]; this.skillZone = 0.6; this.laneCD = [0, 0, 0];
    this.drops = [1, 1, 1]; this.dropResetT = 0; this.stands = [0, 0, 0]; this.standCD = [0, 0, 0];
    // the first multiball of a game is quick to reach: LOCK starts lit and relights after lock 1,
    // so two Black Hole shots start it. Later multiballs need a cleared target bank per lock.
    this.lockLit = true; this.locks = 0; this.multiball = false; this.jackpotLit = false; this.jackpots = 0;
    this.extraLit = false; this.extraGiven = false; this.kickLit = true; this.kickCD = 0;
    this.ballSave = 0; this.saveArmed = false;
    this.tilt = 0; this.tilted = false;
    this.combo = 0; this.comboT = 0;
    this.spinner = { phase: 0, w: 0 }; this.spinHalf = 0;
    this.phase = 'play'; this.bonusT = 0; this.bonusTotal = 0;
    this.plunger = 0; this.input = { l: false, r: false, plunge: false };
    this.autoQueue = 0; this.autoT = 0; this.acc = 0;
    this.fx = { bump: [0, 0, 0], bumpCD: [0, 0, 0], sling: [0, 0], drop: [0, 0, 0], stand: [0, 0, 0], lane: [0, 0, 0], saucer: 0, kick: 0, ramp: 0, orbit: 0, flash: 0, flashCol: '#fff', shake: 0, nudgeX: 0, nudgeY: 0, thud: 0 };
    this.parts = []; this.pops = []; this.msgs = []; this.hitstop = 0; this.t = 0;
    this.stats = { bumpers: 0, ramps: 0, orbits: 0, saucers: 0, drains: 0, launches: 0, spins: 0, jackpots: 0, saves: 0, flips: 0, lanes: 0, drops: 0, stands: 0, slings: 0, skill: 0, multiballs: 0, unstuck: 0, lost: 0, kickbacks: 0 };
    this.serve(true);
  }

  // ---------- helpers ----------
  get mission() { return MISSIONS[this.mIdx]; }
  goal() { return Math.ceil(this.mission.goal * (1 + 0.5 * this.mLap)); }
  say(a, b = '', dur = 1.6, kind = 'flash') { this.msgs.push({ a, b, t: 0, dur, kind }); if (this.msgs.length > 4) this.msgs.splice(0, this.msgs.length - 4); }
  add(pts, x, y, col) {
    this.score += pts;
    if (x !== undefined) this.pops.push({ x, y, text: pts.toLocaleString('en-US'), t: 0, col: col || '#fff' });
  }
  sparks(x, y, n, col, sp = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.35, max: 0.7, col });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }
  laneBall() { return this.W.balls.find((b) => b.x > 540 && b.y > 330 && !b.ramp); }
  liveCount() { return this.W.balls.length + this.autoQueue; }

  serve(first) {
    this.W.balls.push(P.makeBall(T.LANE_X, T.LANE_REST_Y));
    this.saveArmed = true;
    this.kickLit = true;
    this.skillZone = 0.3 + Math.random() * 0.55;   // plunger sweet spot for the skill shot
    if (!first) this.say('BALL ' + this.ballNum, 'PULL THE PLUNGER', 1.8, 'big');
  }

  launch(power) {
    const b = this.laneBall();
    if (!b || b.y < 1000) return false;
    b.vy = -(1900 + 1250 * power); b.vx = 0;
    b.skill = this.saveArmed && Math.abs(power - this.skillZone) <= SKILL_BAND;
    this.stats.launches++;
    this.sfx('launch', power);
    this.fx.shake = Math.max(this.fx.shake, 3 + power * 4);
    return true;
  }

  majorShot(x, y) {
    if (this.comboT > 0) {
      this.combo++;
      const pts = this.combo * 5000;
      this.add(pts, x, y - 20, '#ffe14a');
      this.say('COMBO x' + this.combo, pts.toLocaleString('en-US'), 1.0, 'quick');
      this.sfx('combo', this.combo);
    } else this.combo = 1;
    this.comboT = COMBO_TIME;
  }

  progress(id, n = 1) {
    if (this.phase !== 'play' || this.tilted) return;
    if (this.mission.id !== id) return;
    this.mProg += n;
    if (this.mProg >= this.goal()) this.completeMission();
  }
  completeMission() {
    const award = 25000 * (this.rank + 1) * (this.mLap + 1);
    const name = this.mission.name;
    this.add(award, 280, 560, '#7dfcff');
    this.missionsDone++;
    const promoted = this.rank < RANKS.length - 1;
    if (promoted) this.rank++;
    this.mIdx++; if (this.mIdx >= MISSIONS.length) { this.mIdx = 0; this.mLap++; }
    this.mProg = 0;
    this.say('MISSION COMPLETE', name + ' +' + award.toLocaleString('en-US'), 2.0, 'big');
    if (promoted) this.say('PROMOTED', RANKS[this.rank], 1.8, 'big');
    this.say('NEW MISSION', this.mission.name, 1.6, 'quick');
    if (!this.kickLit) { this.kickLit = true; this.say('KICKBACK LIT', 'LEFT OUTLANE IS SAFE', 1.2, 'quick'); }
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.fx.flash = 1; this.fx.flashCol = '#7dfcff';
    this.fx.shake = Math.max(this.fx.shake, 10);
    this.sfx('mission');
  }

  startMultiball() {
    this.multiball = true; this.locks = 0; this.lockLit = false; this.jackpotLit = true;
    this.autoQueue += 2; this.autoT = 0.6;
    this.ballSave = Math.max(this.ballSave, 10);
    this.stats.multiballs++;
    this.say('MULTIBALL', 'RAMP = JACKPOT', 2.2, 'big');
    this.hitstop = 0.1; this.fx.flash = 1; this.fx.flashCol = '#ff5ad2'; this.fx.shake = 14;
    this.sfx('multiball');
  }

  nudge(dir) {
    if (this.phase !== 'play' || this.tilted) return;
    const kx = dir === 'l' ? 1 : dir === 'r' ? -1 : 0, ky = dir === 'u' ? -1 : -0.35;
    for (const b of this.W.balls) {
      if (b.ramp || b.held > 0 || b.x > 540) continue;
      b.vx += kx * 170; b.vy += ky * 190;
    }
    this.fx.nudgeX = -kx * 9; this.fx.nudgeY = -ky * 7;
    this.fx.shake = Math.max(this.fx.shake, 5);
    this.sfx('nudge');
    this.tilt += 1;
    if (this.tilt > 2.6) {
      this.tilted = true; this.ballSave = 0; this.autoQueue = 0;
      for (const f of this.W.flips) f.held = false;
      this.say('TILT', 'FLIPPERS DEAD', 2.5, 'big');
      this.sfx('tilt'); this.fx.flash = 1; this.fx.flashCol = '#ff3030'; this.fx.shake = 16;
    } else if (this.tilt > 1.6) {
      this.say('DANGER', 'EASY ON THE NUDGE', 1.2, 'quick'); this.sfx('danger');
    }
  }

  // ---------- collisions and sensors ----------
  onHit(o, imp, b, x, y) {
    const fx = this.fx;
    switch (o.kind) {
      case 'bumper': {
        const i = o.idx;
        if (fx.bumpCD[i] > 0) return;
        fx.bumpCD[i] = 0.05; fx.bump[i] = 1;
        this.add(1000, o.x, o.y - 34, '#ffd34a'); this.bonus += 100; this.stats.bumpers++;
        this.sparks(x, y, 10, '#ffe27a', 380);
        fx.shake = Math.max(fx.shake, 3.5);
        this.sfx('bumper', i);
        this.progress('bumper');
        break;
      }
      case 'sling':
        if (imp < 90) return;
        fx.sling[o.idx] = 1; this.add(100); this.stats.slings++;
        this.sparks(x, y, 7, '#ff6fc0', 300);
        fx.shake = Math.max(fx.shake, 2.5);
        this.sfx('sling');
        break;
      case 'drop': {
        const i = o.idx;
        if (!this.drops[i] || imp < 70) return;
        this.drops[i] = 0; o.on = false; fx.drop[i] = 1;
        this.add(2500, o.ax + 30, (o.ay + o.by) / 2, '#ff9b3d'); this.bonus += 500; this.stats.drops++;
        this.sparks(x, y, 8, '#ffb15e', 250);
        this.sfx('drop');
        this.progress('drop');
        if (!this.drops[0] && !this.drops[1] && !this.drops[2]) {
          this.add(25000, 130, 470, '#ff9b3d'); this.dropResetT = 1.6;
          if (!this.multiball) { this.lockLit = true; this.say('TARGETS CLEARED', 'LOCK IS LIT', 1.6, 'quick'); }
          else this.say('TARGETS CLEARED', '25,000', 1.2, 'quick');
          this.hitstop = Math.max(this.hitstop, 0.06); fx.shake = Math.max(fx.shake, 6);
          this.sfx('bank');
        }
        break;
      }
      case 'standup': {
        const i = o.idx;
        if (imp < 70 || this.standCD[i] > 0) return;
        this.standCD[i] = 0.25; fx.stand[i] = 1; this.stats.stands++;
        this.add(2000, o.ax - 30, (o.ay + o.by) / 2, '#9dff6a'); this.bonus += 300;
        this.sparks(x, y, 6, '#b6ff8c', 220);
        this.sfx('stand');
        if (!this.stands[i]) { this.stands[i] = 1; this.progress('stand'); }
        if (this.stands.every((s) => s)) {
          this.stands = [0, 0, 0];
          this.add(20000, 470, 680, '#9dff6a');
          if (!this.extraGiven && !this.extraLit) { this.extraLit = true; this.say('STARS COMPLETE', 'EXTRA BALL IS LIT', 1.6, 'quick'); }
          else this.say('STARS COMPLETE', '20,000', 1.2, 'quick');
          this.sfx('bank');
        }
        break;
      }
      case 'flipper':
        if (imp > 900) this.sparks(x, y, 3, '#ffffff', 160);
        break;
      default:
        if (imp > 260 && fx.thud <= 0) { fx.thud = 0.06; this.sfx('thud', Math.min(1, imp / 1500)); }
        if (o.kind === 'post' && imp > 400) this.sparks(x, y, 3, '#9ff3ff', 160);
    }
  }

  onSense(b, ox, oy) {
    // left the shooter lane through the gate
    if (!b.launched && b.x > 535 && b.y < 330 && b.vy < 0) {
      b.launched = true;
      if (this.saveArmed) { this.saveArmed = false; this.ballSave = SAVE_TIME; }
      if (b.skill) {
        b.skill = false; this.stats.skill++;
        this.add(50000, 470, 250, '#ffe14a');
        this.say('SKILL SHOT', '50,000', 1.6, 'big'); this.sfx('skill');
        this.fx.flash = 0.7; this.fx.flashCol = '#ffe14a'; this.hitstop = 0.06; this.fx.shake = Math.max(this.fx.shake, 8);
      }
    }
    // top rollover lanes
    for (let i = 0; i < 3; i++) {
      const L = T.LANES[i];
      if (this.laneCD[i] <= 0 && Math.abs(b.x - L.x) < 16 && Math.abs(b.y - L.y) < 22) {
        this.laneCD[i] = 0.6; this.stats.lanes++;
        this.add(1000, L.x, L.y + 30, '#7dfcff'); this.bonus += 200;
        this.fx.lane[i] = 1; this.sfx('lane', i);
        if (!this.lanes[i]) { this.lanes[i] = 1; this.progress('lane'); }
        if (this.lanes.every((l) => l)) {
          this.lanes = [0, 0, 0];
          this.bonusX = Math.min(6, this.bonusX + 1);
          this.add(15000, 260, 190, '#7dfcff');
          this.say('BONUS ' + this.bonusX + 'X', 'LANES COMPLETE', 1.3, 'quick'); this.sfx('bank');
        }
      }
    }
    // left orbit (counted going up)
    if (b.x < T.ORBIT.x1 && oy >= T.ORBIT.sensorY && b.y < T.ORBIT.sensorY && b.vy < -300) {
      this.stats.orbits++; this.fx.orbit = 1;
      this.add(10000, 60, T.ORBIT.sensorY - 30, '#7dfcff'); this.bonus += 1000;
      this.sfx('orbit');
      this.majorShot(110, T.ORBIT.sensorY);
      this.progress('orbit');
    }
    // spinner
    const sy = T.ORBIT.spinnerY;
    if (b.x < T.ORBIT.x1 && (oy - sy) * (b.y - sy) <= 0 && oy !== b.y) {
      this.spinner.w = Math.max(this.spinner.w, Math.min(40, Math.abs(b.vy) / 40));
    }
    // ramp mouth: enough upward speed and the ball climbs onto the ramp
    const M = T.RAMP_MOUTH;
    if (b.x > M.x0 && b.x < M.x1 && b.y > M.top && b.y < M.top + 34 && b.vy < -280) {
      const sp = Math.hypot(b.vx, b.vy);
      const p0 = T.rampAt(this.track, 0);
      b.ramp = { d: 0, v: Math.max(1050, Math.min(1600, sp * 0.9)), ox: b.x - p0.x, oy: b.y - p0.y };
      this.fx.ramp = 1; this.sfx('ramp');
    }
    // left outlane kickback
    const K = T.KICKBACK;
    if (this.kickLit && this.kickCD <= 0 && !this.tilted && b.x > K.x0 && b.x < K.x1 && oy < K.y && b.y >= K.y && b.vy > 0) {
      this.kickLit = false; this.kickCD = 0.5; this.stats.kickbacks++;
      b.x = (K.x0 + K.x1) / 2; b.vx = 0; b.vy = -2350;
      this.fx.kick = 1; this.fx.shake = Math.max(this.fx.shake, 9); this.hitstop = Math.max(this.hitstop, 0.05);
      this.sparks(b.x, K.y + 10, 16, '#ff9b3d', 420);
      this.add(5000, 90, K.y - 40, '#ff9b3d');
      this.say('KICKBACK', 'SAVED BY THE BELL', 1.1, 'quick'); this.sfx('kick');
    }
    // saucer (Black Hole)
    const S = T.SAUCER;
    if (b.saucerCD <= 0 && !b.held) {
      const dx = b.x - S.x, dy = b.y - S.y;
      if (dx * dx + dy * dy < 13 * 13 && b.vx * b.vx + b.vy * b.vy < 1500 * 1500) this.captureSaucer(b);
    }
  }

  captureSaucer(b) {
    b.held = 1.05; b.x = T.SAUCER.x; b.y = T.SAUCER.y; b.vx = b.vy = 0;
    this.fx.saucer = 1; this.stats.saucers++;
    this.add(15000, T.SAUCER.x, T.SAUCER.y - 40, '#c58bff'); this.bonus += 1500;
    this.sfx('saucer');
    this.majorShot(T.SAUCER.x, T.SAUCER.y);
    this.progress('saucer');
    if (this.extraLit) {
      this.extraLit = false; this.extraGiven = true; this.extraBalls++;
      this.say('EXTRA BALL', 'SHOOT AGAIN', 2.0, 'big'); this.sfx('extra');
      this.fx.flash = 0.8; this.fx.flashCol = '#9dff6a';
    }
    if (this.lockLit && !this.multiball) {
      this.lockLit = false; this.locks++;
      if (this.locks >= 2) this.startMultiball();
      else if (!this.stats.multiballs) { this.lockLit = true; this.say('BALL 1 LOCKED', 'ONE MORE = MULTIBALL', 1.8, 'quick'); this.sfx('lock'); }
      else { this.say('BALL ' + this.locks + ' LOCKED', 'CLEAR TARGETS AGAIN', 1.6, 'quick'); this.sfx('lock'); }
    }
  }

  releaseSaucer(b) {
    const tx = 175 + Math.random() * 40, ty = 880;
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    const sp = 640 + Math.random() * 80;
    b.vx = (dx / d) * sp; b.vy = (dy / d) * sp - 120; b.saucerCD = 0.6;
    this.sfx('kick'); this.fx.shake = Math.max(this.fx.shake, 5);
    this.sparks(b.x, b.y, 12, '#c58bff', 300);
  }

  exitRamp(b) {
    const end = T.rampAt(this.track, this.track.len);
    b.x = end.x; b.y = end.y; b.vx = end.tx * 480; b.vy = end.ty * 480; b.ramp = null;
    this.stats.ramps++;
    this.add(20000, 150, 760, '#7dfcff'); this.bonus += 2000;
    this.majorShot(150, 740);
    this.progress('ramp');
    if (this.multiball && this.jackpotLit) {
      const jp = 250000 + 50000 * this.rank;
      this.jackpots++; this.stats.jackpots++;
      this.add(jp, 280, 500, '#ff5ad2');
      this.say('JACKPOT', jp.toLocaleString('en-US'), 2.0, 'big');
      this.hitstop = 0.12; this.fx.flash = 1; this.fx.flashCol = '#ff5ad2'; this.fx.shake = 16;
      this.sfx('jackpot');
    } else this.sfx('rampDone');
  }

  drain(b) {
    b.alive = false;
    this.stats.drains++;
    if (this.phase !== 'play') return;
    if (this.ballSave > 0 && !this.tilted) {
      this.autoQueue++; this.autoT = Math.max(this.autoT, 0.5); this.stats.saves++;
      this.say('BALL SAVED', 'HERE IT COMES', 1.4, 'big'); this.sfx('save');
      return;
    }
    const left = this.W.balls.filter((x) => x.alive).length + this.autoQueue;
    if (this.multiball && left <= 1) { this.multiball = false; this.jackpotLit = false; this.say('MULTIBALL OVER', '', 1.2, 'quick'); }
    if (left === 0) this.endBall();
    else this.sfx('drainSoft');
  }

  endBall() {
    this.phase = 'bonus'; this.bonusT = 0;
    this.bonusTotal = this.tilted ? 0 : this.bonus * this.bonusX;
    for (const f of this.W.flips) f.held = false;
    this.plunger = 0;
    this.sfx('drain');
  }

  nextBall() {
    this.score += this.bonusTotal;
    this.bonus = 0; this.bonusX = 1; this.tilted = false; this.tilt = 0; this.combo = 0; this.comboT = 0;
    this.multiball = false; this.jackpotLit = false;
    if (this.extraBalls > 0) { this.extraBalls--; this.say('SHOOT AGAIN', 'SAME PLAYER', 1.6, 'big'); }
    else this.ballNum++;
    if (this.ballNum > this.maxBalls) {
      this.ballNum = this.maxBalls; this.phase = 'over';
      this.sfx('over');
      this.h.onOver(this.summary());
      return;
    }
    this.phase = 'play';
    this.serve(false);
  }

  summary() {
    return { score: this.score, rank: this.rank, rankName: RANKS[this.rank], missions: this.missionsDone, jackpots: this.jackpots, stats: { ...this.stats } };
  }

  // ---------- main tick ----------
  setFlipper(i, want) {
    const f = this.W.flips[i];
    if (want && !f.held) {
      this.stats.flips++;
      this.sfx('flip', i);
      // flipper buttons rotate the lit top lanes
      const l = this.lanes;
      this.lanes = i === 0 ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
    } else if (!want && f.held) this.sfx('flipDown', i);
    f.held = want;
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const fx = this.fx;
    // effects decay even during hit-stop
    fx.shake = Math.max(0, fx.shake - dt * 40);
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
    fx.nudgeX *= Math.pow(0.0005, dt); fx.nudgeY *= Math.pow(0.0005, dt);
    for (const m of this.msgs.slice(0, 1)) m.t += dt;
    if (this.msgs.length && this.msgs[0].t >= this.msgs[0].dur) this.msgs.shift();
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.9);

    if (this.botS) this.botS.dt = dt;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }

    for (const k of ['bump', 'sling', 'drop', 'stand', 'lane']) { const a = fx[k]; for (let i = 0; i < a.length; i++) a[i] = Math.max(0, a[i] - dt * 3); }
    for (let i = 0; i < 3; i++) { fx.bumpCD[i] -= dt; this.laneCD[i] -= dt; this.standCD[i] -= dt; }
    fx.saucer = Math.max(0, fx.saucer - dt * 1.2); fx.kick = Math.max(0, fx.kick - dt * 2); this.kickCD -= dt; fx.ramp = Math.max(0, fx.ramp - dt * 1.5); fx.orbit = Math.max(0, fx.orbit - dt * 1.5); fx.thud -= dt;
    this.tilt = Math.max(0, this.tilt - dt * 0.45);
    if (this.ballSave > 0) this.ballSave -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.dropResetT > 0) {
      this.dropResetT -= dt;
      if (this.dropResetT <= 0) { this.drops = [1, 1, 1]; this.dropSegs.forEach((s) => (s.on = true)); this.sfx('reset'); }
    }
    // spinner
    const sp = this.spinner;
    if (sp.w > 0) {
      sp.phase += sp.w * dt;
      const half = Math.floor(sp.phase * 2);
      while (this.spinHalf < half) {
        this.spinHalf++;
        if (this.spinHalf % 2 === 0) { this.add(200); this.bonus += 50; this.stats.spins++; this.progress('spin'); }
        this.sfx('spin');
      }
      sp.w = Math.max(0, sp.w - dt * (2 + sp.w * 0.9));
    }

    if (this.phase === 'bonus') {
      this.bonusT += dt;
      if (this.bonusT > 2.4) this.nextBall();
      return;
    }
    if (this.phase !== 'play') return;

    // inputs
    const live = !this.tilted;
    this.setFlipper(0, live && this.input.l);
    this.setFlipper(1, live && this.input.r);
    const lb = this.laneBall();
    const resting = lb && lb.y > 1040 && Math.abs(lb.vy) < 60 && !lb.auto;
    if (this.input.plunge && resting) {
      this.plunger = Math.min(1, this.plunger + dt / 1.0);
      if (!this.pullSnd) { this.pullSnd = true; this.sfx('pull'); }
    } else {
      if (this.plunger > 0 && !this.input.plunge && resting) this.launch(this.plunger);
      if (this.plunger > 0) this.plunger = 0;
      this.pullSnd = false;
    }
    // auto-launcher (ball saves and multiball)
    if (this.autoQueue > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0 && !lb) {
        const b = P.makeBall(T.LANE_X, T.LANE_REST_Y); b.auto = 0.45;
        this.W.balls.push(b); this.autoQueue--; this.autoT = 0.8;
      }
    }
    for (const b of this.W.balls) {
      if (b.auto > 0) { b.auto -= dt; if (b.auto <= 0) { b.auto = 0; b.vy = -(1900 + 1250 * 0.7); this.sfx('launch', 0.7); } }
    }

    // physics substeps
    this.acc += dt;
    while (this.acc >= P.DT) {
      this.acc -= P.DT;
      this.stepSim(P.DT);
    }

    // unstick + lost-ball safety
    for (const b of this.W.balls) {
      if (b.saucerCD > 0) b.saucerCD -= dt;
      if (b.ramp || b.held > 0) { b.still = 0; continue; }
      const speed = Math.hypot(b.vx, b.vy);
      // resting in the shooter lane or cradled on a raised flipper is fine; dead still anywhere else is not
      const parked = (b.x > 540 && b.y > 1000) || (b.y > 930 && this.W.flips.some((f) => f.held));
      if (speed < 10 && !parked) b.still += dt; else b.still = 0;
      if (b.still > 2.5) { b.still = 0; b.vy = -650; b.vx = (Math.random() - 0.5) * 500; this.stats.unstuck++; }
      if (b.x < -20 || b.x > 620 || b.y < -60 || Number.isNaN(b.x)) { b.alive = false; this.autoQueue++; this.stats.lost++; }
    }
    this.W.balls = this.W.balls.filter((b) => b.alive);
    for (const b of this.W.balls) {
      b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2);
    }
  }

  stepSim(dt) {
    P.stepFlippers(this.W.flips, dt);
    for (const b of this.W.balls) {
      if (!b.alive) continue;
      if (b.held > 0) { b.held -= dt; if (b.held <= 0) { b.held = 0; this.releaseSaucer(b); } continue; }
      if (b.ramp) {
        b.ramp.d += b.ramp.v * dt;
        if (b.ramp.d >= this.track.len) this.exitRamp(b);
        else { const p = T.rampAt(this.track, b.ramp.d), k = Math.exp(-dt * 22); b.ramp.ox *= k; b.ramp.oy *= k; b.x = p.x + b.ramp.ox; b.y = p.y + b.ramp.oy; b.vx = p.tx * b.ramp.v; b.vy = p.ty * b.ramp.v; }
        continue;
      }
      P.stepBall(b, this.W, dt, this.ev);
      if (b.y > 1150) this.drain(b);
    }
    P.collideBalls(this.W.balls);
  }

  // ---------- bot (used by tests through __G) ----------
  botIntent(state) {
    const s = state || (this.botS = this.botS || { hold: [0, 0], pull: 0, pullFor: 0.6 });
    const want = [false, false];
    for (const b of this.W.balls) {
      if (b.ramp || b.held > 0 || b.x > 535) continue;
      for (let i = 0; i < 2; i++) {
        const f = this.W.flips[i];
        // where is the ball along the flipper, and how far above it
        const ax = f.sgn * Math.cos(f.aRest), ay = Math.sin(f.aRest);
        const rx = b.x - f.px, ry = b.y - f.py;
        const along = rx * ax + ry * ay;
        let nx = ay, ny = -ax; if (ny > 0) { nx = -nx; ny = -ny; }
        const perp = rx * nx + ry * ny; // >0 means above the flipper
        const lead = Math.max(0, b.vy) * 0.03;
        if (along > -5 && along < f.len + 14 && perp > -10 && perp < 30 + lead && b.vy > -250) want[i] = true;
      }
    }
    for (let i = 0; i < 2; i++) {
      if (want[i]) s.hold[i] = 0.14;
      else s.hold[i] = Math.max(0, s.hold[i] - (s.dt || 1 / 60));
    }
    const lb = this.laneBall();
    let plunge = false;
    if (lb && lb.y > 1040 && !lb.auto && this.phase === 'play') {
      s.pull += s.dt || 1 / 60;
      plunge = s.pull < s.pullFor;
      if (!plunge) { s.pull = 0; s.pullFor = 0.25 + Math.random() * 0.8; }
    } else s.pull = 0;
    return { l: s.hold[0] > 0, r: s.hold[1] > 0, plunge };
  }
}
