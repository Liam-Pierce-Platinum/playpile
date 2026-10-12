// All sound is synthesised with WebAudio: thumps, whooshes, a charge whine,
// slide-whistle falls, crowd roars and a taiko + pluck music loop. No files.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = false; this.lastHit = 0; this.step = 0; this.nextT = 0; this.charges = new Map(); }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    const n = c.sampleRate * 1.5;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    setInterval(() => this.schedule(), 50);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }

  get t() { return this.ctx.currentTime; }

  tone(type, f0, f1, dur, vol, at = 0, dest) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noiseHit(type, f0, f1, q, dur, vol, at = 0, dest) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t + at;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 1;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }

  hit(power, dash) {
    if (!this.ctx) return;
    const now = this.t;
    if (!dash && now - this.lastHit < 0.07) return;
    this.lastHit = now;
    const p = Math.min(1, power);
    // fleshy thump: pitched-down sine + a slap of noise
    this.tone('sine', 180 + 60 * p, 45, 0.18 + 0.15 * p, 0.5 + 0.5 * p);
    this.tone('triangle', 320, 90, 0.08, 0.25 * p);
    this.noiseHit('lowpass', 2400, 300, 0.7, 0.09 + 0.08 * p, 0.35 + 0.4 * p);
    if (dash) this.tone('square', 900 + 300 * p, 420, 0.07, 0.06);
  }
  clash() {
    this.hit(1, true);
    this.tone('sawtooth', 220, 110, 0.35, 0.18);
    this.noiseHit('bandpass', 3000, 900, 2, 0.3, 0.3);
  }
  dash(p) {
    this.noiseHit('bandpass', 500, 2200 + 1500 * p, 1.4, 0.22 + 0.1 * p, 0.35 + 0.25 * p);
    this.tone('sine', 140, 260, 0.12, 0.15);
  }
  chargeStart(id) {
    if (!this.ctx) return;
    this.chargeStop(id);
    const c = this.ctx, t = this.t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(660, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.05);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 28; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(this.sfx); o.start(t); lfo.start(t);
    this.charges.set(id, { o, g, lfo });
  }
  chargeStop(id) {
    const ch = this.charges.get(id);
    if (!ch || !this.ctx) return;
    const t = this.t;
    ch.g.gain.cancelScheduledValues(t); ch.g.gain.setTargetAtTime(0.0001, t, 0.02);
    ch.o.stop(t + 0.1); ch.lfo.stop(t + 0.1);
    this.charges.delete(id);
  }
  fall() {
    // slide whistle down
    if (!this.ctx) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.9);
    const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 7; vg.gain.value = 25; v.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    o.connect(g); g.connect(this.sfx); o.start(t); v.start(t); o.stop(t + 1.05); v.stop(t + 1.05);
  }
  crowd(big) {
    // crowd roar: wide band noise swell
    this.noiseHit('bandpass', 700, 1100, 0.5, big ? 1.8 : 1.0, big ? 0.4 : 0.22);
    this.noiseHit('bandpass', 1800, 2400, 0.8, big ? 1.4 : 0.8, big ? 0.22 : 0.12, 0.05);
  }
  splash() { this.noiseHit('lowpass', 1200, 200, 0.5, 0.6, 0.3, 0.35); this.tone('sine', 90, 40, 0.5, 0.35, 0.35); }
  pickup() { [0, 0.06, 0.12, 0.18].forEach((d, i) => this.tone('triangle', [660, 880, 1100, 1320][i], [660, 880, 1100, 1320][i] * 1.01, 0.12, 0.18, d)); }
  powerEnd() { this.tone('triangle', 660, 330, 0.2, 0.12); }
  leap() { this.tone('square', 200, 900, 0.25, 0.12); this.tone('sine', 300, 1200, 0.25, 0.15); }
  shock() { this.tone('sine', 120, 30, 0.5, 0.8); this.noiseHit('lowpass', 1500, 100, 0.5, 0.5, 0.6); }
  land() { this.tone('sine', 120, 50, 0.12, 0.3); }
  count(n) { this.tone('square', n ? 520 : 1040, n ? 520 : 1040, n ? 0.12 : 0.35, 0.12); if (!n) this.taiko(0, 1); }
  click() { this.tone('triangle', 900, 1200, 0.06, 0.12); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.2, i * 0.09)); this.crowd(true); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.3, 0.16, i * 0.16)); }
  roundWin() { [659, 988].forEach((f, i) => this.tone('triangle', f, f, 0.2, 0.2, i * 0.1)); }

  taiko(at, vol = 0.6, dest) {
    this.tone('sine', 110, 48, 0.32, vol, at, dest);
    this.noiseHit('lowpass', 600, 120, 0.6, 0.12, vol * 0.5, at, dest);
  }

  // music: a bouncy pentatonic loop over taiko, 132 bpm
  setMusic(on) { this.musicOn = on; if (on && this.ctx) this.nextT = Math.max(this.nextT, this.t + 0.05); }
  schedule() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const spb = 60 / 132 / 2; // eighth notes
    const scale = [293.7, 329.6, 392, 440, 493.9, 587.3, 659.3, 784];
    const mel = [0, 2, 3, 4, 3, 2, 4, 5, 7, 5, 4, 3, 2, 3, 1, 0, 0, 2, 3, 5, 4, 3, 2, 4, 5, 6, 7, 5, 4, 2, 3, -1];
    const bassN = [146.8, 146.8, 196, 220];
    if (this.nextT < this.t) this.nextT = this.t + 0.05;
    while (this.nextT < this.t + 0.2) {
      const at = this.nextT - this.t;
      const s = this.step;
      if (s % 4 === 0 || s % 16 === 6 || s % 16 === 14) this.taiko(at, s % 16 === 0 ? 0.5 : 0.32, this.mus);
      if (s % 2 === 1) this.noiseHit('highpass', 7000, 6000, 0.7, 0.04, 0.08, at, this.mus);
      const n = mel[s % mel.length];
      if (n >= 0 && s % 2 === 0) {
        const f = scale[n];
        this.tone('triangle', f, f, 0.18, 0.13, at, this.mus);
        this.tone('sine', f * 2, f * 2, 0.08, 0.04, at, this.mus);
      }
      if (s % 8 === 0) { const b = bassN[(s / 8) % 4]; this.tone('sine', b, b, 0.4, 0.22, at, this.mus); }
      this.step++;
      this.nextT += spb;
    }
  }
}
