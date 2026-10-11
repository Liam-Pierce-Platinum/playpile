// All sound is synthesised: wind (filtered noise that opens up with size and
// speed), lift pops, tier-up stingers, fling whooshes, thunder booms, and a
// short bouncy music loop. Nothing is loaded.
export class Sound {
  constructor() { this.ctx = null; this.musicOn = true; this.sfxOn = true; this.lastLift = 0; this.step = 0; this.nextT = 0; this.timer = null; }
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = this.musicOn ? 0.5 : 0; this.mus.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // wind bed
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.windF = c.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 300; this.windF.Q.value = 1.6;
    this.windB = c.createBiquadFilter(); this.windB.type = 'bandpass'; this.windB.frequency.value = 500; this.windB.Q.value = 0.8;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    this.windB2 = c.createGain(); this.windB2.gain.value = 0.0;
    src.connect(this.windF); this.windF.connect(this.windG); src.connect(this.windB); this.windB.connect(this.windB2); this.windB2.connect(this.windG);
    this.windG.connect(this.sfx);
    src.start();
    this.timer = setInterval(() => this.schedule(), 60);
  }
  setMusic(on) { this.musicOn = on; if (this.mus) this.mus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05); }
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); }
  // danger: a bigger storm is on us, so the wind band pitches up and howls
  wind(size, speed, on, danger = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cut = 220 + size * 70 + speed * 22;
    this.windF.frequency.setTargetAtTime(Math.min(2600, cut), t, 0.15);
    this.windB.frequency.setTargetAtTime(Math.min(3600, 380 + size * 60 + speed * 30 + Math.sin(t * 1.7) * 120 + (danger ? 400 + Math.sin(t * 9) * 120 : 0)), t, 0.2);
    this.windB2.gain.setTargetAtTime(0.4 + Math.sin(t * 0.9) * 0.2, t, 0.3);
    this.windG.gain.setTargetAtTime(on ? Math.min(0.42, 0.12 + size * 0.022 + speed * 0.006) : 0, t, 0.25);
  }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  osc(type, f0, f1, dur, vol, dest = this.sfx, t = this.ctx.currentTime) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(type, f0, f1, dur, vol, q = 1, dest = this.sfx, t = this.ctx.currentTime) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.01, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  lift(tier) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastLift < 0.045 && tier < 3) return;
    this.lastLift = now;
    const p = [880, 700, 520, 400, 300, 220, 150][tier] * (0.9 + Math.random() * 0.2);
    this.burst('bandpass', 600, 2600, 0.14, 0.12, 2);
    this.osc('triangle', p, p * 1.6, 0.12, 0.08 + tier * 0.012);
    if (tier >= 3) { this.burst('lowpass', 900, 120, 0.35 + tier * 0.05, 0.2, 1); this.osc('sine', 110, 55, 0.3, 0.14); }
  }
  rip() { if (this.ctx) this.burst('bandpass', 300, 900, 0.25, 0.08, 3); }
  tierUp(n) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = [262, 294, 330, 349, 392, 440, 494][Math.min(6, n)];
    [1, 1.25, 1.5, 2].forEach((m, i) => this.osc('square', base * m, base * m, 0.22, 0.05, this.sfx, t + i * 0.07));
    [1, 1.25, 1.5, 2].forEach((m, i) => this.osc('triangle', base * m * 2, base * m * 2, 0.3, 0.05, this.sfx, t + i * 0.07));
    this.burst('bandpass', 400, 3000, 0.6, 0.18, 1.2);
  }
  fling() { if (this.ctx) { this.burst('bandpass', 2400, 500, 0.25, 0.22, 1.5); this.osc('sawtooth', 500, 180, 0.15, 0.03); } }
  hit() { if (this.ctx) { this.osc('sine', 160, 45, 0.25, 0.4); this.burst('lowpass', 2500, 200, 0.2, 0.3, 0.7); } }
  dash() { if (this.ctx) this.burst('highpass', 600, 2400, 0.3, 0.12, 0.8); }
  boom(near = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst('lowpass', 1200, 60, 1.8, 0.55 * near, 0.7);
    this.burst('lowpass', 300, 40, 2.4, 0.4 * near, 0.5, this.sfx, t + 0.08);
    this.osc('sine', 75, 28, 1.3, 0.55 * near);
    this.burst('highpass', 3000, 1500, 0.08, 0.25 * near, 0.5);
  }
  zap() { if (this.ctx) { this.burst('highpass', 4000, 1500, 0.12, 0.12, 0.5); this.burst('lowpass', 500, 60, 0.9, 0.15, 0.6); } }
  alarm() { if (this.ctx) { const t = this.ctx.currentTime; this.osc('square', 620, 620, 0.09, 0.07, this.sfx, t); this.osc('square', 520, 520, 0.12, 0.07, this.sfx, t + 0.11); } }
  click() { if (this.ctx) this.osc('triangle', 660, 990, 0.07, 0.09); }
  tick(hi) { if (this.ctx) this.osc('square', hi ? 1320 : 880, hi ? 1320 : 880, 0.08, 0.06); }
  jingle(win) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [523, 494, 440, 392];
    notes.forEach((f, i) => { this.osc('square', f, f, 0.2, 0.06, this.sfx, t + i * 0.11); this.osc('triangle', f / 2, f / 2, 0.25, 0.08, this.sfx, t + i * 0.11); });
  }
  // ---- music: 4 bars C - Am - F - G at 120 bpm, scheduled ahead ----
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const spb = 60 / 120 / 4;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.25) {
      this.note(this.step, this.nextT);
      this.step = (this.step + 1) % 64;
      this.nextT += spb;
    }
  }
  note(st, t) {
    const bar = (st / 16) | 0, s = st % 16;
    const roots = [130.8, 110, 87.3, 98];
    const chords = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]];
    const r = roots[bar];
    const M = this.mus;
    if (s % 4 === 0) { this.osc('sine', 150, 45, 0.18, 0.5, M, t); }
    if (s % 8 === 4) this.burst('bandpass', 1800, 900, 0.12, 0.18, 1, M, t);
    if (s % 2 === 1) this.burst('highpass', 7000, 6000, 0.04, 0.08, 1, M, t);
    if ([0, 3, 6, 8, 11, 14].includes(s)) this.osc('triangle', r, r, 0.2, 0.28, M, t);
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    if (s % 2 === 0) {
      const iv = chords[bar][arp[(s / 2) % 8]];
      const f = r * 4 * Math.pow(2, iv / 12) * (s % 8 === 6 ? 2 : 1);
      this.osc('square', f, f, 0.1, 0.035, M, t);
    }
    if (s === 0 && bar % 2 === 0) this.osc('triangle', r * 8, r * 8, 0.5, 0.03, M, t);
  }
}
