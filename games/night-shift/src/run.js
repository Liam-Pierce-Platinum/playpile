// ===================== HIGHWAY :: THE RUN =====================
// One run, one score. Distance is the floor; everything above it comes from
// how close you were willing to pass. The combo is the whole risk/reward loop:
// it only climbs while you keep threading gaps, and it is worth far more than
// the distance, so playing safe scores almost nothing.

const NEAR = 4.4;              // metres - just over one lane width
const COMBO_HOLD = 2.6;        // seconds before the combo starts falling
const MAX_COMBO = 20;

export class Run {
  constructor() { this.reset(); }

  reset() {
    this.live = false;
    this.over = false;
    this.reason = '';
    this.t = 0;
    this.dist = 0;
    this.score = 0;
    this.combo = 1;
    this.comboT = 0;
    this.nearMisses = 0;
    this.bestCombo = 1;
    this.topKph = 0;
    this.lastEvent = null;
    this.eventT = 0;
    this.wrongWayT = 0;
    this.damage = 0;
    this.hits = 0;
  }

  start() { this.reset(); this.live = true; }

  flag(text, kind) { this.lastEvent = { text, kind }; this.eventT = 1.1; }

  update(dt, player, playerS, playerLat, traffic, track) {
    if (!this.live) return;
    this.t += dt;
    this.eventT = Math.max(0, this.eventT - dt);
    this.topKph = Math.max(this.topKph, player.kph);

    // ---------------- distance ----------------
    const moved = player.speed * dt;
    this.dist += moved;
    // going quickly is worth more per metre; crawling is worth almost nothing
    const speedMul = Math.max(0.15, Math.min(2.4, (player.kph - 40) / 90));
    this.score += moved * 1.4 * speedMul;

    // ---------------- near misses ----------------
    for (const c of traffic) {
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < NEAR && !c.passed) {
        c.passed = true;
        // only counts if you were actually going past it
        if (Math.abs(player.speed - c.speed) < 5) continue;
        this.nearMisses++;
        // the faster you go past, the more it is worth
        const rel = Math.abs(player.speed - c.speed);
        this.combo = Math.min(MAX_COMBO, this.combo + 0.5);
        this.comboT = COMBO_HOLD;
        this.score += 150 * this.combo * speedMul * (0.6 + rel / 30);
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        if (this.combo > 3) this.flag('x' + this.combo.toFixed(1), 'good');
      } else if (d > NEAR * 2.4) c.passed = false;
    }

    // combo decay
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 1) {
      this.combo = Math.max(1, this.combo - dt * 2.2);
    }


  }

  // Losing a patrol into the traffic is the best thing that can happen to you.
  copDown() {
    if (!this.live) return;
    this.copsDown = (this.copsDown || 0) + 1;
    this.score += 2500 * this.combo;
    this.flag('PATROL DOWN', 'good');
  }

  // Damage with no combo reset and no CONTACT flag - the slow grind of running
  // off the tarmac, rather than hitting something.
  attrite(d) {
    if (!this.live) return;
    this.damage = Math.min(1, this.damage + d);
  }

  // Clipping someone costs you the combo you were building, and a slice of
  // the car. Damage never repairs inside a run.
  hit(dmg) {
    if (!this.live) return;
    this.combo = 1;
    this.comboT = 0;
    this.hits++;
    this.damage = Math.min(1, this.damage + (dmg || 0.12));
    this.flag('CONTACT', 'hot');
  }

  crash(force) {
    if (!this.live) return;
    this.live = false;
    this.over = true;
    this.reason = 'WRECKED';
  }

  bustedOut() {
    if (!this.live) return;
    this.live = false;
    this.over = true;
    this.reason = 'BUSTED';
  }

  get cash() { return Math.round(this.score * 0.12); }
}
