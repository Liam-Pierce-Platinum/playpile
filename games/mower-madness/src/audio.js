// All synthesised with WebAudio: a putt-putt engine and blade whirr that follow the
// mower, effects, and a bouncy summer music loop (F major, I-V-vi-IV).
export class Audio {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.9; this.muted = false; this.musicOn = true; this.step = 0; this.t = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = this.ctx = new AC(); } catch (e) { return; }
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.echo = c.createDelay(); this.echo.delayTime.value = 0.18;
    const fb = c.createGain(); fb.gain.value = 0.22; const wet = c.createGain(); wet.gain.value = 0.18;
    this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine: two detuned oscillators through a lowpass, plus a blade-noise whirr
    this.eGain = c.createGain(); this.eGain.gain.value = 0; this.eGain.connect(this.sfxBus);
    this.eFilt = c.createBiquadFilter(); this.eFilt.type = 'lowpass'; this.eFilt.frequency.value = 500; this.eFilt.Q.value = 3;
    const am = c.createGain(); am.gain.value = 0.7; this.eFilt.connect(am).connect(this.eGain);
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 50;
    this.o2 = c.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = 25;
    const g2 = c.createGain(); g2.gain.value = 0.6;
    this.o1.connect(this.eFilt); this.o2.connect(g2).connect(this.eFilt);
    // putt-putt amplitude wobble
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 14; const lg = c.createGain(); lg.gain.value = 0.3;
    this.lfo.connect(lg).connect(am.gain);
    this.o1.start(); this.o2.start(); this.lfo.start();
    this.bGain = c.createGain(); this.bGain.gain.value = 0; this.bGain.connect(this.sfxBus);
    const bs = c.createBufferSource(); bs.buffer = this.noise; bs.loop = true;
    this.bFilt = c.createBiquadFilter(); this.bFilt.type = 'bandpass'; this.bFilt.frequency.value = 2200; this.bFilt.Q.value = 1.4;
    bs.connect(this.bFilt).connect(this.bGain); bs.start();
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxBus.gain.value = this.sfx;
    this.musicBus.gain.value = this.musicOn ? this.music * 0.5 : 0;
  }
  // speed 0..1.4, cutting 0..1, on false = silence
  engine(on, speed, cutting, boost, clog) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 42 + speed * 38 + boost * 22 + (clog ? Math.sin(t * 40) * 8 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.05); this.o2.frequency.setTargetAtTime(f * 0.5 + 0.7, t, 0.05);
    this.lfo.frequency.setTargetAtTime(9 + speed * 14, t, 0.1);
    this.eFilt.frequency.setTargetAtTime(380 + speed * 700 + boost * 500, t, 0.05);
    this.eGain.gain.setTargetAtTime(on ? 0.07 + speed * 0.05 + boost * 0.04 : 0, t, 0.08);
    this.bGain.gain.setTargetAtTime(on && !clog ? 0.015 + cutting * 0.07 : 0, t, 0.06);
    this.bFilt.frequency.setTargetAtTime(1800 + cutting * 1600, t, 0.08);
  }
  tone(f, dur, type, vol, when = 0, slide = 0, echo = false, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(n, p = 1) {
    if (!this.ctx) return;
    switch (n) {
      case 'click': this.tone(700, 0.06, 'triangle', 0.12); break;
      case 'bonk': this.tone(120 * p, 0.18, 'sine', 0.5, 0, 0.5); this.hiss(0.1, 600, 0.35, 'lowpass'); break;
      case 'smash': // ceramic gnome
        this.hiss(0.25, 4200, 0.5, 'highpass'); this.tone(1900, 0.2, 'triangle', 0.14, 0, 0.6); this.tone(2600, 0.15, 'triangle', 0.1, 0.03, 0.7);
        for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 2500, 0.06, 'square', 0.04, 0.05 + i * 0.04);
        break;
      case 'thwack': this.tone(90, 0.25, 'sine', 0.7, 0, 0.4); this.hiss(0.15, 1200, 0.5, 'bandpass', 0.4); break;
      case 'clog': this.tone(70, 0.6, 'sawtooth', 0.22, 0, 0.6); this.hiss(0.6, 300, 0.4, 'lowpass'); this.tone(160, 0.5, 'square', 0.08, 0.05, 0.5); break;
      case 'unclog': this.hiss(0.2, 2000, 0.25, 'bandpass', 2); this.tone(300, 0.15, 'triangle', 0.1, 0, 2); break;
      case 'bark': this.tone(420 * p, 0.09, 'sawtooth', 0.16, 0, 0.55); this.hiss(0.08, 900, 0.25); this.tone(380 * p, 0.08, 'sawtooth', 0.12, 0.13, 0.55); break;
      case 'meow': this.tone(700, 0.45, 'sawtooth', 0.1, 0, 1.6, true); this.tone(1100, 0.4, 'triangle', 0.06, 0.05, 0.7); this.hiss(0.3, 3000, 0.15, 'highpass'); break;
      case 'splash': this.hiss(0.4, 1500, 0.4, 'bandpass', 0.4); break;
      case 'squelch': this.hiss(0.15, 500, 0.25, 'lowpass', 0.5); break;
      case 'spray': this.hiss(0.3, 5000, 0.08, 'highpass'); break;
      case 'pop': this.tone(500, 0.08, 'sine', 0.2, 0, 2.4); break;
      case 'fuel': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, i * 0.05)); this.hiss(0.2, 600, 0.2, 'lowpass'); break;
      case 'stripe': this.tone(520 * p, 0.18, 'triangle', 0.13, 0, 1.5, true); this.tone(780 * p, 0.22, 'sine', 0.09, 0.06, 1.2, true); break;
      case 'combo': this.tone(990 * p, 0.12, 'square', 0.05, 0, 1.3); break;
      case 'donut': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, i * 0.045, 0, true)); break;
      case 'shave': this.hiss(0.18, 3000, 0.2, 'bandpass', 0.3); this.tone(1400, 0.1, 'sine', 0.08, 0, 1.4); break;
      case 'flower': this.tone(300, 0.3, 'triangle', 0.16, 0, 0.5); this.hiss(0.15, 2500, 0.2, 'bandpass'); break;
      case 'boost': this.hiss(0.5, 700, 0.3, 'bandpass', 3); break;
      case 'empty': this.tone(160, 0.2, 'square', 0.1, 0); this.tone(110, 0.3, 'square', 0.1, 0.15); break;
      case 'tick': this.tone(1500, 0.05, 'square', 0.06); break;
      case 'count': this.tone(p > 1 ? 1046 : 523, p > 1 ? 0.5 : 0.18, 'triangle', 0.22, 0, 0, true); break;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, i * 0.09, 0, true)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.16, i * 0.16)); break;
      case 'star': this.tone(1318, 0.4, 'triangle', 0.16, 0, 0, true); this.tone(1976, 0.3, 'sine', 0.08, 0.05, 0, true); break;
    }
  }
  // music: 8th-note step sequencer, ~124 bpm
  update(dt, on) {
    if (!this.ctx) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t += 0.242;
    if (this.t < -0.3) this.t = 0.242;
    if (!this.musicOn || this.music <= 0) return;
    const s = this.step++ % 32, bar = (s / 8) | 0, b = this.musicBus, st = s % 8;
    const roots = [174.6, 130.8, 146.8, 116.5];            // F C Dm Bb
    const chords = [[349.2, 440, 523.3], [329.6, 392, 523.3], [293.7, 349.2, 440], [293.7, 349.2, 466.2]];
    const r = roots[bar];
    if (st === 0 || st === 3 || st === 4 || (st === 6 && on)) this.tone(st === 3 ? r * 1.5 : r, 0.22, 'triangle', 0.22, 0, 0, false, b);
    if (st === 2 || st === 6) chords[bar].forEach((f) => this.tone(f, 0.12, 'square', 0.025, 0, 0, false, b));
    if (st % 2 === 1) this.hiss(0.04, 8000, 0.05, 'highpass', 0, 0, 1, b);
    if (st === 4) this.hiss(0.1, 1800, 0.12, 'bandpass', 0, 0, 1, b);
    if (st === 0) { this.tone(80, 0.18, 'sine', 0.35, 0, 0.5, false, b); }
    // whistled lead on the F pentatonic, a 4-bar phrase
    const mel = [[0, 2, 4, -1, 4, 3, 2, -1], [1, -1, 1, 2, 1, -1, 0, -1], [2, 3, 4, -1, 5, 4, 2, -1], [3, 2, 1, -1, 0, -1, -1, -1]];
    const scale = [698.5, 784, 880, 1046.5, 1174.7, 1396.9];
    const m = mel[bar][st];
    if (m >= 0 && (on || this.step % 64 < 32)) this.tone(scale[m], 0.2, 'sine', 0.06, 0, 0, true, b);
  }
}
