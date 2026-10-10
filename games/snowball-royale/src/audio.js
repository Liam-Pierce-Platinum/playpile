// All synthesised: crunchy snow noise, whooshes, splats, a sleigh-bell
// music loop with a plucky bass and a glockenspiel tune.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.9; this.muted = false; this.step = 0; this.t = 0; this.intensity = 0; this.rollT = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.verb = c.createDelay(); this.verb.delayTime.value = 0.19;
    const fb = c.createGain(); fb.gain.value = 0.3; const wet = c.createGain(); wet.gain.value = 0.22;
    this.verb.connect(fb).connect(this.verb); this.verb.connect(wet).connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : 1; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.5; }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, verb = false) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
  bell(f, vol, when = 0, bus = this.musicBus) {
    this.tone(f, 0.9, 'sine', vol, when, bus, 0, true);
    this.tone(f * 2.76, 0.35, 'sine', vol * 0.35, when, bus);
    this.tone(f * 5.4, 0.15, 'sine', vol * 0.15, when, bus);
  }
  crunch(vol = 0.3, when = 0) { this.noiseHit(0.07, 1800 + Math.random() * 1200, vol, 'bandpass', 0.6, when, 1.5); this.noiseHit(0.05, 600, vol * 0.6, 'lowpass', 0, when + 0.02); }
  play(n, p = 1, vol = 1) {
    if (!this.ctx) return;
    const v = vol;
    switch (n) {
      case 'throw': this.noiseHit(0.13, 1400 * p, 0.35 * v, 'bandpass', 2.5, 0, 1.2); break;
      case 'lob': this.noiseHit(0.32, 700, 0.3 * v, 'bandpass', 3, 0, 1); this.tone(300, 0.3, 'sine', 0.05 * v, 0, this.sfxBus, 2); break;
      case 'splat': this.noiseHit(0.16, 900 * p, 0.7 * v, 'lowpass', 0.4); this.crunch(0.35 * v); this.tone(160 * p, 0.12, 'sine', 0.35 * v, 0, this.sfxBus, 0.5); break;
      case 'poof': this.noiseHit(0.12, 1200, 0.25 * v, 'bandpass', 0.5); break;
      case 'bigsplat': this.noiseHit(0.6, 500, 1.0 * v, 'lowpass', 0.25); this.crunch(0.6 * v); this.crunch(0.5 * v, 0.06); this.tone(80, 0.5, 'sine', 0.8 * v, 0, this.sfxBus, 0.4); break;
      case 'wallhit': this.crunch(0.45 * v); this.noiseHit(0.1, 400, 0.4 * v, 'lowpass'); break;
      case 'wallbreak': this.noiseHit(0.5, 700, 0.8 * v, 'lowpass', 0.3); for (let i = 0; i < 4; i++) this.crunch(0.4 * v, i * 0.05); break;
      case 'build': for (let i = 0; i < 3; i++) this.crunch(0.35 * v, i * 0.08); this.tone(220, 0.25, 'triangle', 0.08 * v, 0.1, this.sfxBus, 1.5); break;
      case 'scoop': this.crunch(0.4 * v); this.crunch(0.25 * v, 0.07); break;
      case 'step': this.noiseHit(0.04, 2400 + Math.random() * 800, 0.06 * v, 'bandpass', 0.7, 0, 2); break;
      case 'roll': this.noiseHit(0.12, 300 + p * 300, 0.18 * v, 'lowpass'); this.crunch(0.08 * v); break;
      case 'dive': this.noiseHit(0.38, 2200, 0.35 * v, 'bandpass', 0.3, 0, 0.8); this.tone(520, 0.2, 'triangle', 0.06 * v, 0, this.sfxBus, 0.6); break;
      case 'tree': this.noiseHit(0.7, 900, 0.6 * v, 'lowpass', 0.3); this.noiseHit(0.5, 4000, 0.15 * v, 'highpass', 0, 0.05); [1568, 1976, 2349].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.05 * v, 0.1 + i * 0.05, this.sfxBus, 0, true)); break;
      case 'bark': this.tone(520, 0.08, 'sawtooth', 0.22 * v, 0, this.sfxBus, 0.55); this.tone(460, 0.1, 'sawtooth', 0.2 * v, 0.14, this.sfxBus, 0.5); this.noiseHit(0.08, 900, 0.2 * v, 'bandpass', 0.5); break;
      case 'yelp': this.tone(900, 0.25, 'sawtooth', 0.18 * v, 0, this.sfxBus, 1.6); break;
      case 'hurt': this.tone(330, 0.18, 'square', 0.12 * v, 0, this.sfxBus, 0.6); break;
      case 'ko': this.tone(600, 0.6, 'triangle', 0.22 * v, 0, this.sfxBus, 0.25, true); this.tone(300, 0.5, 'sine', 0.2 * v, 0.1, this.sfxBus, 0.5); break;
      case 'koyou': [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16 * v, i * 0.12, this.sfxBus, 0.98, true)); break;
      case 'whistle': this.tone(2300, 0.5, 'sine', 0.2 * v, 0, this.sfxBus, 1.02); this.tone(2380, 0.5, 'sine', 0.12 * v, 0, this.sfxBus, 0.99); break;
      case 'beep': this.tone(880, 0.12, 'square', 0.08 * v); break;
      case 'go': this.tone(1320, 0.4, 'square', 0.1 * v, 0, this.sfxBus, 1.001, true); this.bell(1046, 0.2, 0, this.sfxBus); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.bell(f, 0.2 * v, i * 0.1, this.sfxBus)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.14 * v, i * 0.16, this.sfxBus, 0.98, true)); break;
      case 'coin': this.bell(1568, 0.14 * v, 0, this.sfxBus); this.bell(2093, 0.12 * v, 0.07, this.sfxBus); break;
      case 'click': this.tone(700, 0.05, 'triangle', 0.1 * v); this.crunch(0.08); break;
      case 'empty': this.tone(180, 0.08, 'square', 0.06 * v); break;
      case 'tick': this.tone(1500, 0.04, 'square', 0.05 * v); break;
      case 'tackle': this.noiseHit(0.2, 500, 0.5 * v, 'lowpass', 0.5); this.tone(200, 0.15, 'sine', 0.3 * v, 0, this.sfxBus, 0.6); break;
    }
  }
  // music: sleigh bells on the 8ths, bass + glockenspiel tune; busier with intensity
  update(dt, playing) {
    if (!this.ctx) return;
    this.t -= dt;
    if (this.t > 0) return;
    const I = playing ? this.intensity : 0.25;
    this.t = I > 0.8 ? 0.13 : 0.145;
    const s = this.step++ % 16, bar = Math.floor(this.step / 16) % 8;
    const b = this.musicBus;
    // sleigh bells
    if (s % 2 === 0 || I > 0.55) this.noiseHit(0.05, 7500, (s % 4 === 0 ? 0.16 : 0.08) * (0.6 + I * 0.4), 'highpass', 0, 0, 1, b);
    // kick + snare-ish crunch
    if (s === 0 || s === 8 || (I > 0.5 && s === 11)) { this.tone(110, 0.18, 'sine', 0.35, 0, b, 0.4); }
    if (s === 4 || s === 12) this.noiseHit(0.09, 1800, 0.18, 'bandpass', 0.5, 0, 1, b);
    // bass (I vi IV V in C)
    const roots = [130.8, 110, 87.3, 98, 130.8, 110, 87.3, 98][bar];
    if (s % 4 === 0) this.tone(roots, 0.22, 'triangle', 0.18, 0, b, 0.99);
    if (s % 4 === 2 && I > 0.3) this.tone(roots * 2, 0.12, 'triangle', 0.09, 0, b);
    // tune
    const tune = [
      [0, 2, 4, 2, 5, 4, 2, 0], [1, 3, 5, 3, 1, -1, 0, 1], [3, 2, 1, 0, 1, 2, 3, 5], [4, 3, 2, 4, 7, 6, 5, 4],
      [0, 2, 4, 2, 5, 4, 2, 0], [1, 3, 5, 6, 7, 5, 3, 1], [3, 5, 7, 5, 3, 2, 1, 0], [4, 6, 8, 6, 4, 2, 4, 7],
    ][bar];
    const scale = [523.3, 587.3, 659.3, 698.5, 784, 880, 987.8, 1046.5, 1174.7];
    if (s % 2 === 0) {
      const n = tune[s / 2];
      if (n >= 0 && (s % 4 === 0 || Math.random() < 0.7)) this.bell(scale[n] * (playing ? 1 : 0.5), 0.07);
    }
  }
}
