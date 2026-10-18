// KAGE, the rival ninja on the roof. He dashes like you do.
// The pattern: a TELL (he flashes, a red line shows where he is going), the
// DASH, then a RECOVERY window where he staggers. Dash through him or out of
// the line to dodge; dash AT him while he recovers to land a hit. Hit him at
// any other time and he parries and counters straight away.
// Nine hits in three phases; each phase has shorter tells and recoveries and
// adds double/triple dashes and feints.
import { W, FLOOR } from './levels.js';
import { drawFigure, pose, lerpPose, splat, BRUSH, DISPLAY } from './draw.js';

export const KAGE_LOOK = { hat: 'hood', mask: 'cloth', robe: '#4a0c12', pattern: 'waves', sash: '#ff3a2a', scarf: '#16120f' };
const HP = 9, R_BOSS = 30, SPEED = 2300, OVERSHOOT = 220;
//            tell   follow-up tell  recovery  idle   extra dashes  feint chance
// warn = the least time you ever get from the line LOCKING to his blade reaching you (a person needs ~0.25s to react)
const PH = [null,
  { tell: 0.85, tell2: 0.42, rec: 1.15, idle: 0.75, extra: [1, 0, 0], feint: 0, warn: 0.5 },
  { tell: 0.66, tell2: 0.36, rec: 0.95, idle: 0.55, extra: [0.5, 0.5, 0], feint: 0.3, warn: 0.42 },
  { tell: 0.52, tell2: 0.32, rec: 0.8, idle: 0.4, extra: [0.25, 0.45, 0.3], feint: 0.4, warn: 0.36 },
];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

export class Boss {
  constructor(g, hp = HP) {
    this.g = g;
    this.hp = hp; this.max = HP;
    this.x = 960; this.y = FLOOR; this.vx = 0; this.vy = 0; this.face = -1;
    this.state = 'intro'; this.st = 1.4; this.t = 0;
    this.queue = 0; this.line = null; this.flash = 0; this.ghosts = []; this.dodged = false;
    this.scarf = Array.from({ length: 10 }, () => ({ x: this.x, y: this.y - 66, px: this.x, py: this.y - 66 }));
    this.stats = { hits: 0, parries: 0, dodges: 0, dashes: 0 };
  }
  get phase() { return this.hp > 6 ? 1 : this.hp > 3 ? 2 : 3; }
  get P() { return PH[this.phase]; }
  get cy() { return this.y - 40; }
  get open() { return this.state === 'recover'; }
  set(state, st) { this.state = state; this.st = st; this.age = 0; }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.g, p = g.player;
    this.t += dt; this.age = (this.age || 0) + dt;
    this.flash = Math.max(0, this.flash - dt);
    this.st -= dt;
    for (const q of this.ghosts) q.life -= dt;
    this.ghosts = this.ghosts.filter((q) => q.life > 0);
    const pcx = p.x, pcy = p.y - 36;
    if (this.state !== 'dash' && this.state !== 'hurt' && this.state !== 'leap') this.face = pcx > this.x ? 1 : -1;
    switch (this.state) {
      case 'intro': if (this.st <= 0) this.set('idle', 0.4); break;
      case 'idle': this.fall(dt); if (this.st <= 0 && p.alive) this.beginTell(this.P.tell, true); break;
      case 'tell': {
        this.fall(dt);
        // track you until the last 30% of the tell, then the line locks
        if (this.st > this.lead) this.aim(pcx, pcy);
        else if (!this.locked) { this.locked = true; g.audio.play('warn'); }
        if (this.st <= 0) {
          if (this.feint) { this.feint = false; this.blink(); this.beginTell(this.P.tell * 0.85, false); }
          else this.beginDash();
        }
        break;
      }
      case 'dash': {
        const L = this.line, step = SPEED * dt;
        const x0 = this.x, y0 = this.cy;
        const left = L.left;
        const k = Math.min(step, left);
        this.x += L.dx * k; this.y += L.dy * k; L.left -= k;
        this.ghostT = (this.ghostT || 0) - dt;
        if (this.ghostT <= 0) { this.ghostT = 0.014; this.ghosts.push({ x: this.x, y: this.y, face: this.face, rot: Math.atan2(L.dy, Math.abs(L.dx)) * this.face, life: 0.25 }); }
        this.contact(x0, y0, this.x, this.cy);
        if (k >= left - 0.5) {
          this.vx = L.dx * 300; this.vy = L.dy * 300;
          // you lived through it: always keep at least one dash for the next dodge or the counter
          if (p.alive) p.charges = Math.max(p.charges, 1);
          if (this.queue > 0) { this.queue--; this.beginTell(this.P.tell2, false); }
          else { this.set('recover', this.P.rec); g.audio.play('thud'); }
        }
        break;
      }
      case 'recover': this.fall(dt); this.vx *= Math.pow(0.02, dt); if (this.st <= 0) this.leapAway(); break;
      case 'hurt': this.fall(dt); this.vx *= Math.pow(0.1, dt); if (this.st <= 0) { if (this.phaseUp) { this.phaseUp = false; this.set('phase', 1.5); g.phaseBanner(this.phase); } else this.leapAway(); } break;
      case 'phase': this.vy = 0; this.y += (300 - this.y) * Math.min(1, dt * 3); this.x += (640 - this.x) * Math.min(1, dt * 3); if (this.st <= 0) { this.set('leap', 0.45); this.leapTo(this.pickSpot()); } break;
      case 'leap': {
        const k = clamp(1 - this.st / 0.45, 0, 1), L = this.leapL;
        this.x = L.x0 + (L.x1 - L.x0) * k; this.y = L.y0 + (L.y1 - L.y0) * k - Math.sin(k * Math.PI) * 160;
        if (this.st <= 0) { this.x = L.x1; this.y = L.y1; this.vy = 0; this.set('idle', this.P.idle); }
        break;
      }
      case 'dead': this.fall(dt); break;
    }
    this.updateScarf();
  }
  fall(dt) {
    // gravity onto the roof or an eave; perched spots in mid-air (wall clings) hold
    if (this.perch && this.state !== 'recover' && this.state !== 'hurt' && this.state !== 'dead') return;
    this.perch = false;
    const prev = this.y;
    this.vy = Math.min(1500, this.vy + 2500 * dt);
    this.x = clamp(this.x + this.vx * dt, 60, W - 60);
    this.y += this.vy * dt;
    for (const pl of this.g.stage.plats) if (this.vy > 0 && this.x > pl.x && this.x < pl.x + pl.w && prev <= pl.y + 1 && this.y >= pl.y) { this.y = pl.y; this.vy = 0; this.vx *= 0.5; }
    if (this.y >= FLOOR) { this.y = FLOOR; this.vy = 0; }
  }
  aim(tx, ty) {
    let dx = tx - this.x, dy = ty - this.cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    // run the line through you and on, clipped to the arena
    let len = d + OVERSHOOT;
    const lim = (v, a, b, s) => (s > 0 ? (b - v) / s : s < 0 ? (a - v) / s : 1e9);
    len = Math.min(len, lim(this.x, 70, W - 70, dx), lim(this.cy, 70, FLOOR - 20, dy));
    this.line = { x0: this.x, y0: this.cy, x1: this.x + dx * len, y1: this.cy + dy * len, dx, dy };
  }
  beginTell(t, fresh) {
    this.set('tell', t); this.tellMax = t; this.locked = false; this.vx = 0;
    if (fresh) {
      const P = this.P, r = Math.random();
      this.queue = r < P.extra[0] ? 0 : r < P.extra[0] + P.extra[1] ? 1 : 2;
      this.feint = Math.random() < P.feint;
    }
    this.aim(this.g.player.x, this.g.player.y - 36);
    // fairness: lock early enough that lock -> impact is never under P.warn, however close he starts
    const L = this.line, travel = Math.hypot(this.g.player.x - L.x0, this.g.player.y - 36 - L.y0) / SPEED;
    this.lead = Math.max(t * 0.3, this.P.warn - travel);
    if (this.lead > t * 0.8) { t = this.lead / 0.8; this.set('tell', t); this.tellMax = t; }
    this.flash = t;
    this.g.audio.play('tell');
  }
  beginDash() {
    this.set('dash', 2); this.dodged = false; this.perch = false; this.stats.dashes++;
    // re-anchor the locked line where he actually stands now
    const L = this.line, len = Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
    L.x0 = this.x; L.y0 = this.cy; L.x1 = clamp(L.x0 + L.dx * len, 70, W - 70); L.y1 = clamp(L.y0 + L.dy * len, 70, FLOOR - 20);
    L.left = Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
    if (L.left > 1) { L.dx = (L.x1 - L.x0) / L.left; L.dy = (L.y1 - L.y0) / L.left; }
    this.face = this.line.dx >= 0 ? 1 : -1;
    this.g.audio.play('bossDash');
    this.g.shake = Math.max(this.g.shake, 6);
  }
  blink() {
    // the feint: the line vanishes and he steps through the smoke to somewhere else
    this.g.puffSmoke(this.x, this.cy);
    const s = this.pickSpot();
    this.x = s.x; this.y = s.y; this.perch = !!s.perch; this.vy = 0;
    this.g.puffSmoke(this.x, this.cy);
    this.g.text(this.x, this.cy - 70, 'FEINT', 22, this.g.pal.accent);
    this.g.audio.play('dash', 0.5);
  }
  pickSpot() {
    const p = this.g.player, spots = [];
    for (let x = 120; x < W - 120; x += 70) spots.push({ x, y: FLOOR });
    for (const pl of this.g.stage.plats) spots.push({ x: pl.x + pl.w / 2, y: pl.y });
    spots.push({ x: 90, y: 300, perch: true }, { x: W - 90, y: 300, perch: true });
    const ok = spots.filter((s) => { const d = Math.hypot(s.x - p.x, s.y - p.y); return d > 380 && d < 820; });
    return (ok.length ? ok : spots)[Math.floor(Math.random() * (ok.length || spots.length))];
  }
  leapTo(s) { this.leapL = { x0: this.x, y0: this.y, x1: s.x, y1: s.y }; this.perch = !!s.perch; }
  leapAway() { this.set('leap', 0.45); this.leapTo(this.pickSpot()); }

  // his dash against you: a hit unless you are dashing (or still in your dash's afterglow)
  contact(x0, y0, x1, y1) {
    const g = this.g, p = g.player;
    if (!p.alive) return;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, cx = p.x, cy = p.y - 36;
    const t = clamp(((cx - x0) * dx + (cy - y0) * dy) / L2, 0, 1);
    const d = Math.hypot(cx - (x0 + dx * t), cy - (y0 + dy * t));
    const safe = p.dash || p.inv > 0;
    if (safe && d < 90 && !this.dodged) {
      this.dodged = true; this.stats.dodges++;
      g.perfectDodge(cx, cy);
    } else if (!safe && d < R_BOSS + 12) {
      g.die('boss');
    }
  }
  // your dash against him
  struck(d) {
    const g = this.g, p = g.player;
    if (this.state === 'dead' || this.state === 'hurt' || this.state === 'phase' || this.state === 'intro') return 'pass';
    if (this.state === 'dash') return 'pass';   // you pass through each other
    if (this.state === 'recover') {
      this.hp--; this.stats.hits++;
      this.flash = 0.25;
      this.vx = d.dx * 520; this.vy = -380 + d.dy * 200;
      if (this.hp <= 0) { this.set('dead', 99); return 'kill'; }
      this.phaseUp = this.hp === 6 || this.hp === 3;
      this.set('hurt', 0.55);
      return 'hit';
    }
    // anything else: parried, and he counters at once
    this.stats.parries++;
    this.perch = false;
    this.beginTell(0.45, false); this.queue = 0; this.feint = false;
    void p;
    return 'parry';
  }
  updateScarf() {
    const sc = this.scarf, nx = this.x - this.face * 3, ny = this.y - 70;
    sc[0].x = nx; sc[0].y = ny;
    for (let i = 1; i < sc.length; i++) { const q = sc[i]; const vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9; q.px = q.x; q.py = q.y; q.x += vx - this.face * 1.2; q.y += vy + 0.4 + Math.sin(this.t * 6 + i) * 0.3; }
    for (let it = 0; it < 3; it++) for (let i = 1; i < sc.length; i++) { const a = sc[i - 1], b = sc[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - 8) / d; b.x -= dx * k; b.y -= dy * k; }
  }

  // ------------------------------------------------------------ drawing
  figureOpts(P, extra = {}) {
    const pal = this.g.pal;
    const tellFlash = this.state === 'tell' && Math.floor(this.t * (this.locked ? 24 : 12)) % 2 === 0;
    return { pose: P, face: this.face, scale: 1.18, ink: this.flash > 0 && (tellFlash || this.state === 'hurt') ? pal.accent : pal.ink, paper: pal.paper, accent: pal.accent, kind: 'ninja', t: this.t, look: KAGE_LOOK, eyes: '#ff3a2a', hood: '#120a10', ...extra };
  }
  pose() {
    switch (this.state) {
      case 'tell': return lerpPose(pose('idle'), pose('raise'), Math.min(1, (1 - this.st / this.tellMax) * 1.5));
      case 'dash': return pose('dash');
      case 'recover': case 'hurt': case 'dead': return pose('stagger');
      case 'leap': case 'phase': return pose('air');
      default: return this.perch ? pose('crouch') : pose('idle');
    }
  }
  draw(x) {
    const g = this.g, pal = g.pal;
    if (this.state === 'dead' && g.bossCut) return;
    // the red line
    if (this.state === 'tell' && this.line) {
      const k = 1 - this.st / this.tellMax, L = this.line;
      x.save();
      x.strokeStyle = pal.accent; x.lineCap = 'round';
      if (this.feint && k > 0.75 && Math.floor(this.t * 30) % 2) x.globalAlpha = 0.15;
      else x.globalAlpha = this.locked ? 0.95 : 0.35 + k * 0.4;
      x.lineWidth = this.locked ? 7 : 2 + k * 3;
      if (!this.locked) x.setLineDash([16, 12]);
      x.beginPath(); x.moveTo(L.x0, L.y0); x.lineTo(L.x1, L.y1); x.stroke();
      x.setLineDash([]);
      x.globalAlpha *= 0.5; x.fillStyle = pal.accent; x.beginPath(); x.arc(L.x1, L.y1, 10 + k * 8, 0, 7); x.fill();
      x.restore();
    }
    // afterimages
    for (const q of this.ghosts) { x.globalAlpha = q.life / 0.25 * 0.45; drawFigure(x, q.x, q.y, this.figureOpts(pose('dash'), { rot: q.rot, face: q.face, ink: pal.accent })); }
    x.globalAlpha = 1;
    // scarf
    x.strokeStyle = '#120a10'; x.lineCap = 'round';
    const sc = this.scarf;
    for (let i = 1; i < sc.length; i++) { x.lineWidth = 7 - i * 0.55; x.beginPath(); x.moveTo(sc[i - 1].x, sc[i - 1].y); x.lineTo(sc[i].x, sc[i].y); x.stroke(); }
    x.strokeStyle = pal.accent; x.lineWidth = 1.5; x.beginPath(); x.moveTo(sc[0].x, sc[0].y); for (const q of sc) x.lineTo(q.x, q.y); x.stroke();
    // the opening: a pale ring and 隙 while he recovers
    if (this.open) {
      const k = this.st / this.P.rec;
      x.save(); x.globalAlpha = 0.35 + Math.sin(this.t * 20) * 0.15; x.strokeStyle = '#fff4d0'; x.lineWidth = 4;
      x.beginPath(); x.arc(this.x, this.cy, 46 + (1 - k) * 10, 0, 7); x.stroke();
      x.globalAlpha = 1; x.font = `34px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 5; x.strokeStyle = pal.paper; x.strokeText('隙', this.x, this.y - 128); x.fillStyle = '#fff4d0'; x.fillText('隙', this.x, this.y - 128);
      // a shrinking bar = how long the window stays open
      x.fillStyle = '#fff4d0'; x.fillRect(this.x - 26, this.y - 104, 52 * k, 4);
      x.restore();
    }
    const rot = this.state === 'dash' && this.line ? Math.atan2(this.line.dy, Math.abs(this.line.dx)) * this.face : this.state === 'hurt' ? -0.4 * this.face : 0;
    drawFigure(x, this.x, this.y, this.figureOpts(this.pose(), { rot }));
    if (this.state === 'tell') {
      const s = 1 + Math.sin(this.t * 30) * 0.12;
      x.save(); x.translate(this.x, this.y - 140); x.scale(s, s);
      x.font = `44px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = pal.paper; x.strokeText('!', 0, 0); x.fillStyle = pal.accent; x.fillText('!', 0, 0);
      x.restore();
    }
  }
  // the big finish: split him along the cut
  cutImage() {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    drawFigure(c.getContext('2d'), 100, 150, this.figureOpts(pose('stagger'), { face: this.face }));
    return c;
  }
}
export { splat, rand };
