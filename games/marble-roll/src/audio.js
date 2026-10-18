// WebAudio sound: glassy tones + a filtered-noise rolling bed. No samples.
export class Sfx {
  constructor(muted) { this.muted = muted; this.ctx = null; }
  init() {
    if (this.ctx || this.muted) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.6; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let l = 0; for (let i = 0; i < len; i++) { l = l * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = l * 5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.rollF = c.createBiquadFilter(); this.rollF.type = 'bandpass'; this.rollF.Q.value = 0.9;
    this.rollG = c.createGain(); this.rollG.gain.value = 0;
    src.connect(this.rollF).connect(this.rollG).connect(this.master); src.start();
    this.fx = c.createDelay(); this.fx.delayTime.value = 0.21;
    const fb = c.createGain(); fb.gain.value = 0.32; const wet = c.createGain(); wet.gain.value = 0.3;
    this.fx.connect(fb).connect(this.fx); this.fx.connect(wet).connect(this.master);
  }
  setMuted(m) { this.muted = m; if (!m) this.init(); if (this.master) this.master.gain.value = m ? 0 : 0.6; }
  roll(speed, grounded) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.rollG.gain.setTargetAtTime(grounded ? Math.min(0.45, speed / 24) : 0, t, 0.05);
    this.rollF.frequency.setTargetAtTime(160 + speed * 38, t, 0.05);
  }
  tone(f, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); g.connect(this.fx); o.start(t); o.stop(t + dur + 0.05);
  }
  gem(i) { const f = 1320 * Math.pow(2, [0, 2, 4, 7, 9][i % 5] / 12); this.tone(f, 0.4, 'sine', 0.22); this.tone(f * 2.76, 0.25, 'sine', 0.06, 0.01); }
  clink(v) { this.tone(1900 + Math.random() * 700, 0.22, 'triangle', Math.min(0.3, v * 0.04)); this.tone(3100, 0.12, 'sine', 0.07); }
  thud(v) { this.tone(95, 0.18, 'sine', Math.min(0.35, v * 0.05), 0, 0.5); }
  fall() { this.tone(700, 1.0, 'sine', 0.22, 0, 0.12); }
  check() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.45, 'sine', 0.18, i * 0.07)); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => { this.tone(f, 0.7, 'triangle', 0.18, i * 0.09); this.tone(f * 2, 0.5, 'sine', 0.07, i * 0.09); }); }
  click() { this.tone(980, 0.07, 'sine', 0.12); }
}
