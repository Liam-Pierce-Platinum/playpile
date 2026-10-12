// Every sound is synthesised with WebAudio: no audio files.
// A filtered-noise crowd bed runs the whole time and swells on goals.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.out = c.createGain(); this.out.gain.value = this.muted ? 0 : 1;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 5;
    this.out.connect(comp).connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // crowd bed: two band-passed noise layers with slow swells
    this.crowd = c.createGain(); this.crowd.gain.value = 0.11; this.crowd.connect(this.out);
    for (const [f, q, g] of [[420, 0.7, 1], [1150, 1.2, 0.5]]) {
      const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = c.createGain(); gg.gain.value = g;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13 + Math.random() * 0.1;
      const lg = c.createGain(); lg.gain.value = 0.25 * g; lfo.connect(lg).connect(gg.gain); lfo.start();
      n.connect(bp).connect(gg).connect(this.crowd); n.start(0, Math.random());
    }
  }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02); }
  _noise(t, dur, type, f, q, gain, f2) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(fl).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  _tone(t, dur, type, f, gain, f2, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, x = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'kick': // leather thump: pitched body + click
        this._tone(t, 0.16, 'sine', 150 + x * 60, 0.9, 45);
        this._noise(t, 0.05, 'bandpass', 2400, 0.8, 0.55);
        this._noise(t, 0.12, 'lowpass', 600, 0.7, 0.35);
        break;
      case 'bounce': this._tone(t, 0.08, 'sine', 120, 0.25 * x, 60); this._noise(t, 0.04, 'lowpass', 500, 1, 0.12 * x); break;
      case 'post': // metallic clang: inharmonic partials
        for (const [r, g] of [[1, 0.35], [2.76, 0.22], [5.4, 0.14], [8.93, 0.08]]) this._tone(t, 1.1 / Math.sqrt(r), 'sine', 610 * r, g);
        this._noise(t, 0.03, 'highpass', 3000, 0.7, 0.4);
        this.crowdSwell(0.35, 0.8);
        break;
      case 'net': this._noise(t, 0.45, 'bandpass', 1800, 0.6, 0.6, 600); this._noise(t, 0.2, 'lowpass', 300, 0.7, 0.4); break;
      case 'save': this._tone(t, 0.12, 'sine', 180, 0.6, 70); this._noise(t, 0.09, 'bandpass', 1300, 1.2, 0.7); break;
      case 'wall': this._tone(t, 0.1, 'sine', 110, 0.6, 60); this._noise(t, 0.07, 'bandpass', 800, 1, 0.5); break;
      case 'goal': this.crowdSwell(1.0, 3.2); this.play('horn'); break;
      case 'horn': {
        const c = this.ctx;
        for (const f of [220, 277.2, 329.6]) {
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + 0.05); g.gain.exponentialRampToValueAtTime(0.07, t + 0.12); g.gain.setValueAtTime(0.07, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
          o.connect(lp).connect(g).connect(this.out); o.start(t + 0.05); o.stop(t + 1.2);
        }
        break;
      }
      case 'ooh': // crowd groan: formant sweep down
        this._noise(t, 1.2, 'bandpass', 700, 3, 0.35, 380);
        this._noise(t + 0.05, 1.1, 'bandpass', 1100, 4, 0.18, 650);
        break;
      case 'whistle': {
        const c = this.ctx, o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2900;
        const lfo = c.createOscillator(); lfo.frequency.value = 38; const lg = c.createGain(); lg.gain.value = 140; lfo.connect(lg).connect(o.frequency);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.setValueAtTime(0.14, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        o.connect(g).connect(this.out); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
        break;
      }
      case 'target': [0, 4, 7, 12].forEach((s, i) => this._tone(t + i * 0.06, 0.3, 'triangle', 880 * Math.pow(2, s / 12), 0.22)); break;
      case 'bonus': this._tone(t, 0.18, 'square', 660 * x, 0.08); this._tone(t + 0.07, 0.22, 'square', 990 * x, 0.07); break;
      case 'star': this._tone(t, 0.5, 'triangle', 523.3 * Math.pow(2, x * 4 / 12), 0.3); this._tone(t, 0.5, 'sine', 1046.5 * Math.pow(2, x * 4 / 12), 0.12); break;
      case 'click': this._tone(t, 0.06, 'triangle', 900, 0.15, 1300); break;
      case 'swoosh': this._noise(t, 0.18, 'bandpass', 900, 0.8, 0.12, 3000); break;
      case 'fail': this._tone(t, 0.35, 'triangle', 330, 0.2, 160); this._tone(t + 0.15, 0.5, 'triangle', 220, 0.2, 110); break;
    }
  }
  crowdSwell(peak, dur) {
    if (!this.ctx) return;
    const g = this.crowd.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.11 + peak * 0.55, t + 0.15);
    g.exponentialRampToValueAtTime(0.11, t + dur);
  }
}
