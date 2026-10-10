// All synthesised. Music: a bouncy diner boogie (walking bass, piano stabs,
// brushed snare) that gets busier as the shift heats up. Effects: plops,
// squishes, dings, the cash register, gull squawks and a big crash.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.9; this.mutedMusic = false; this.mutedSfx = false; this.step = 0; this.t = 0; this.intensity = 0; this.on = true; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.verb = c.createDelay(); this.verb.delayTime.value = 0.17;
    const fb = c.createGain(); fb.gain.value = 0.22; const wet = c.createGain(); wet.gain.value = 0.18;
    this.verb.connect(fb).connect(this.verb); this.verb.connect(wet).connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.mutedSfx ? 0 : this.sfx;
    this.musicBus.gain.value = this.mutedMusic ? 0 : this.music * 0.5;
  }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, verb = false, attack = 0.005) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (verb) g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  play(n, p = 1) {
    if (!this.ctx) return;
    switch (n) {
      case 'catch': // juicy plop, pitch climbs as the order fills
        this.tone(320 * p, 0.12, 'sine', 0.35, 0, this.sfxBus, 1.9);
        this.tone(640 * p, 0.09, 'triangle', 0.12, 0.02, this.sfxBus, 1.4);
        this.noiseHit(0.06, 900, 0.25, 'lowpass');
        break;
      case 'squish': this.tone(140, 0.16, 'sine', 0.3, 0, this.sfxBus, 0.6); this.noiseHit(0.1, 600, 0.3, 'bandpass', 0.5, 0, 2); break;
      case 'wrong': this.tone(180, 0.22, 'square', 0.08, 0, this.sfxBus, 0.9); this.tone(150, 0.26, 'square', 0.08, 0.1, this.sfxBus, 0.9); break;
      case 'yuck':
        this.tone(420, 0.5, 'sawtooth', 0.09, 0, this.sfxBus, 0.35); this.tone(300, 0.6, 'square', 0.05, 0.08, this.sfxBus, 0.4);
        this.noiseHit(0.3, 500, 0.3, 'lowpass', 0.4);
        break;
      case 'bonk': this.tone(520, 0.12, 'square', 0.07, 0, this.sfxBus, 0.5); this.tone(90, 0.12, 'sine', 0.3, 0, this.sfxBus, 0.7); break;
      case 'splat': this.noiseHit(0.14, 700, 0.35, 'lowpass', 0.4); this.tone(110, 0.1, 'sine', 0.2, 0, this.sfxBus, 0.6); break;
      case 'serve':
        [1046, 1318].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.2, i * 0.12, this.sfxBus, 0, true));
        this.tone(2093, 0.4, 'sine', 0.05, 0.12, this.sfxBus, 0, true);
        this.noiseHit(0.25, 3000, 0.25, 'bandpass', 1.5, 0, 0.7);
        break;
      case 'cash': // ka-ching
        this.noiseHit(0.05, 2500, 0.35, 'highpass');
        this.tone(1760, 0.35, 'triangle', 0.12, 0.06, this.sfxBus, 0, true); this.tone(2637, 0.45, 'triangle', 0.1, 0.09, this.sfxBus, 0, true);
        break;
      case 'perfect': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.13, i * 0.07, this.sfxBus, 0, true)); break;
      case 'creak': this.tone(70 + Math.random() * 30, 0.3, 'sawtooth', 0.05, 0, this.sfxBus, 1.3); break;
      case 'topple':
        this.tone(200, 0.4, 'sawtooth', 0.08, 0, this.sfxBus, 0.4);
        for (let i = 0; i < 6; i++) { this.noiseHit(0.12, 300 + Math.random() * 600, 0.4, 'lowpass', 0.5, 0.15 + i * 0.09 + Math.random() * 0.04); this.tone(90 + Math.random() * 60, 0.1, 'sine', 0.3, 0.15 + i * 0.09, this.sfxBus, 0.6); }
        this.tone(330, 0.25, 'triangle', 0.1, 0.05, this.sfxBus, 0.5); // "wah"
        this.tone(250, 0.5, 'triangle', 0.1, 0.3, this.sfxBus, 0.5);
        break;
      case 'thud': this.noiseHit(0.08, 400, 0.25 * p, 'lowpass'); this.tone(80, 0.08, 'sine', 0.2 * p, 0, this.sfxBus, 0.7); break;
      case 'gull':
        for (let i = 0; i < 2; i++) { this.tone(1400, 0.16, 'sawtooth', 0.06, i * 0.2, this.sfxBus, 0.55); this.tone(1900, 0.12, 'square', 0.03, i * 0.2, this.sfxBus, 0.6); }
        break;
      case 'warn': this.tone(1100, 0.08, 'square', 0.06); this.tone(1100, 0.08, 'square', 0.06, 0.13); break;
      case 'steal': this.tone(900, 0.3, 'sawtooth', 0.07, 0, this.sfxBus, 1.8); this.noiseHit(0.2, 2000, 0.25, 'bandpass', 2); break;
      case 'sauce': this.noiseHit(0.2, 400, 0.4, 'lowpass', 2.5, 0, 3); this.tone(200, 0.2, 'sine', 0.2, 0, this.sfxBus, 2.2); break;
      case 'whoosh': this.noiseHit(0.5, 600, 0.25, 'bandpass', 3, 0, 0.6); break;
      case 'pop': this.tone(500 * p, 0.08, 'sine', 0.2, 0, this.sfxBus, 2); break;
      case 'tick': this.tone(1500, 0.04, 'square', 0.05); break;
      case 'bell': [0, 0.18, 0.36].forEach((w) => { this.tone(1568, 0.8, 'sine', 0.18, w, this.sfxBus, 0, true); this.tone(3136, 0.5, 'sine', 0.05, w, this.sfxBus, 0, true); }); break;
      case 'star': this.tone(1318 * p, 0.45, 'triangle', 0.15, 0, this.sfxBus, 0, true); this.tone(1976 * p, 0.3, 'sine', 0.06, 0.03, this.sfxBus, 0, true); break;
      case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      case 'go': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'square', 0.06, i * 0.06)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.14, i * 0.18, this.sfxBus, 0.97)); break;
    }
  }
  // boogie: 12-bar blues in C, swung eighths
  update(dt, playing) {
    if (!this.ctx || !this.on) return;
    this.t -= dt;
    if (this.t > 0) return;
    const bpm = 150 + this.intensity * 20;
    const beat = 60 / bpm;
    const swing = this.step % 2 === 0 ? 0.62 : 0.38;
    this.t += beat * swing;
    if (this.t < -0.2) this.t = 0;
    const s = this.step++ % 8, bar = Math.floor(this.step / 8) % 12;
    const roots = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
    const r = roots[bar];
    const I = playing ? this.intensity : 0.2;
    const b = this.musicBus;
    const C = 65.41;
    const walk = [0, 4, 7, 9, 10, 9, 7, 4];
    const bf = C * Math.pow(2, (r + walk[s]) / 12);
    this.tone(bf, beat * 0.5, 'triangle', 0.32, 0, b, 0, false, 0.004);
    this.tone(bf * 2, beat * 0.3, 'sawtooth', 0.025, 0, b);
    // hats + snare
    this.noiseHit(0.03, 8000, 0.05 + I * 0.06, 'highpass', 0, 0, 1, b);
    if (s === 2 || s === 6) this.noiseHit(0.12, 1800, 0.18 + I * 0.08, 'bandpass', 0.6, 0, 0.8, b);
    if (s === 0 || s === 4) this.tone(55, 0.12, 'sine', 0.35, 0, b, 0.6);
    // piano stabs on the off-beats
    if (s % 2 === 1 && (I > 0.25 || s === 3 || s === 7)) {
      const chord = [r + 16, r + 19, r + 22].map((n) => C * 2 * Math.pow(2, n / 12));
      chord.forEach((f) => this.tone(f, 0.12, 'square', 0.022, 0, b));
    }
    // a little melody riff in busy moments
    if (I > 0.55 && s === 0 && bar % 2 === 0) {
      const mel = [24, 27, 28, 31].map((n) => C * 2 * Math.pow(2, (n + r) / 12));
      mel.forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.05, i * beat * 0.5, b, 0, true));
    }
  }
}
