// All synthesised: a bouncy pentatonic shop tune (plucks, bass, shaker, wood
// block) that speeds up with the belts, and pops, dings, coins and grumbles.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.9; this.muted = false; this.musicOn = true; this.step = 0; this.t = 0; this.tempo = 1; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
      this.master = c.createGain(); this.master.connect(this.comp);
      this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      this.echo = c.createDelay(); this.echo.delayTime.value = 0.18;
      const fb = c.createGain(); fb.gain.value = 0.25; const wet = c.createGain(); wet.gain.value = 0.18;
      this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.master);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
    } catch (e) { this.ctx = null; }
  }
  apply() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxBus.gain.value = this.sfx;
    this.musicBus.gain.value = this.musicOn ? this.music * 0.5 : 0;
  }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, echo = false, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (echo) g.connect(this.echo);
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
      case 'grab': this.tone(520 * p, 0.09, 'triangle', 0.18, 0, this.sfxBus, 1.8); this.noiseHit(0.03, 3000, 0.12, 'highpass'); break;
      case 'drop': this.tone(300, 0.08, 'triangle', 0.14, 0, this.sfxBus, 0.6); this.tone(1900, 0.06, 'sine', 0.05); break;
      case 'whoosh': this.noiseHit(0.18, 1200, 0.3, 'bandpass', 3, 0, 1.2); break;
      case 'serve':
        [784, 988, 1319].forEach((f, i) => this.tone(f * p, 0.25, 'triangle', 0.13, i * 0.05, this.sfxBus, 0, true));
        this.tone(2637 * p, 0.3, 'sine', 0.05, 0.12, this.sfxBus, 0, true);
        break;
      case 'coin': this.tone(1568 * p, 0.07, 'square', 0.05); this.tone(2093 * p, 0.18, 'square', 0.05, 0.06); break;
      case 'wrong': this.tone(180, 0.28, 'sawtooth', 0.14, 0, this.sfxBus, 0.6); this.tone(140, 0.3, 'square', 0.08, 0.08, this.sfxBus, 0.7); this.noiseHit(0.08, 500, 0.35, 'lowpass'); break;
      case 'huff': this.noiseHit(0.35, 700, 0.4, 'bandpass', 0.4, 0, 0.8); this.tone(150, 0.35, 'sawtooth', 0.12, 0, this.sfxBus, 0.5); this.noiseHit(0.1, 200, 0.5, 'lowpass', 0, 0.25); this.noiseHit(0.1, 200, 0.5, 'lowpass', 0, 0.42); break;
      case 'arrive': this.tone(660, 0.08, 'sine', 0.1); this.tone(880, 0.12, 'sine', 0.1, 0.07); break;
      case 'chop': for (let i = 0; i < 4; i++) { this.noiseHit(0.03, 2500, 0.25, 'highpass', 0, i * 0.07); this.tone(240, 0.04, 'triangle', 0.12, i * 0.07); } break;
      case 'place': this.tone(1200, 0.05, 'sine', 0.12); this.tone(1800, 0.12, 'sine', 0.07, 0.03, this.sfxBus, 0, true); break;
      case 'gold': [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.09, i * 0.045, this.sfxBus, 0, true)); break;
      case 'meow': this.tone(700, 0.35, 'triangle', 0.12, 0, this.sfxBus, 1.5, false, 0.05); this.tone(1050, 0.25, 'sine', 0.06, 0.12, this.sfxBus, 0.7); break;
      case 'hiss': this.noiseHit(0.4, 4000, 0.35, 'highpass'); this.tone(900, 0.2, 'sawtooth', 0.05, 0, this.sfxBus, 1.6); break;
      case 'steal': this.noiseHit(0.15, 1500, 0.3, 'bandpass', 2); this.tone(500, 0.3, 'square', 0.06, 0.05, this.sfxBus, 0.5); break;
      case 'sumo': this.tone(65, 0.5, 'sine', 0.6, 0, this.sfxBus, 0.6); this.tone(65, 0.5, 'sine', 0.6, 0.22, this.sfxBus, 0.6); this.noiseHit(0.1, 600, 0.3, 'lowpass', 0, 0.22); break;
      case 'critic': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'square', 0.06, i * 0.09)); this.noiseHit(0.3, 6000, 0.12, 'highpass', 0, 0.3); break;
      case 'banner': this.tone(880, 0.12, 'square', 0.06); this.tone(1320, 0.18, 'square', 0.06, 0.08); break;
      case 'tick': this.tone(1800, 0.04, 'square', 0.05); break;
      case 'brake': this.noiseHit(0.5, 2000, 0.3, 'bandpass', 0.25, 0, 0.7); this.tone(400, 0.5, 'sawtooth', 0.06, 0, this.sfxBus, 0.4); break;
      case 'combo': this.tone(660 * p, 0.12, 'triangle', 0.1, 0, this.sfxBus, 1.5); break;
      case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      case 'buy': [659, 880, 1319].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.12, i * 0.06, this.sfxBus, 0, true)); this.play('coin'); break;
      case 'end': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.13, i * 0.1, this.sfxBus, 0, true)); break;
      case 'fail': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.13, i * 0.16)); break;
      case 'star': this.tone(1568, 0.4, 'triangle', 0.14, 0, this.sfxBus, 0, true); this.tone(2093, 0.4, 'triangle', 0.08, 0.05, this.sfxBus, 0, true); break;
      case 'select': this.tone(990, 0.07, 'sine', 0.12, 0, this.sfxBus, 1.3); break;
    }
  }
  // pentatonic loop: 2 bars of 16th notes. tempo 1 = 118 bpm.
  update(dt, intensity) {
    if (!this.ctx || !this.musicOn) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t += 60 / (118 * this.tempo) / 4;
    if (this.t < -0.2) this.t = 0;
    const s = this.step++ % 32, bar = Math.floor(this.step / 32) % 4;
    const b = this.musicBus;
    const roots = [261.6, 220, 174.6, 196][bar];
    if (s % 8 === 0) this.tone(roots / 2, 0.28, 'triangle', 0.32, 0, b, 0, false, 0.01);
    if (s % 8 === 6 && intensity > 0.3) this.tone(roots / 2 * 1.5, 0.12, 'triangle', 0.2, 0, b);
    if (s % 4 === 2) this.noiseHit(0.05, 7000, 0.07 + intensity * 0.05, 'highpass', 0, 0, 1, b);
    if (s % 8 === 4) { this.noiseHit(0.07, 1800, 0.18, 'bandpass', 0, 0, 3, b); this.tone(820, 0.05, 'sine', 0.08, 0, b); }
    const mel = [0, -1, 2, -1, 4, 3, 2, -1, 0, -1, 4, -1, 5, 4, 2, -1, 3, -1, 2, 0, 1, -1, 2, -1, 4, -1, 3, 2, 1, -1, 0, -1];
    const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5];
    const n = mel[s];
    if (n >= 0) this.tone(scale[n] * (bar === 2 ? 0.89 : 1), 0.16, 'square', 0.035, 0, b, 0, true);
    if (n >= 0 && intensity > 0.6 && s % 2 === 0) this.tone(scale[n] * 2, 0.08, 'sine', 0.03, 0.01, b);
  }
}
