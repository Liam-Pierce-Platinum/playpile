// Eurobeat, made live: kick, hats, clap, octave bass and a saw riff. Plus a running engine note, tyre screech and impact effects.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.6; this.sfx = 0.85; this.muted = false; this.step = 0; this.next = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.echo = c.createDelay(); this.echo.delayTime.value = 0.36;
    const fb = c.createGain(); fb.gain.value = 0.32; const wet = c.createGain(); wet.gain.value = 0.22;
    this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.musicBus);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine: two detuned saws through a lowpass
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'sawtooth'; this.o2.detune.value = 12;
    this.o1.connect(this.engF); this.o2.connect(this.engF); this.engF.connect(this.eng).connect(this.sfxBus);
    this.o1.start(); this.o2.start();
    // screech: looped noise through a resonant bandpass
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    this.scF = c.createBiquadFilter(); this.scF.type = 'bandpass'; this.scF.frequency.value = 1800; this.scF.Q.value = 6;
    this.sc = c.createGain(); this.sc.gain.value = 0;
    s.connect(this.scF).connect(this.sc).connect(this.sfxBus); s.start();
    this.next = c.currentTime + 0.1;
    this.apply();
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : 1; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.55; }
  tone(f, dur, type, vol, when, bus = this.sfxBus, slide = 0, echo = false) {
    const c = this.ctx, t = when ?? c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, f, vol, type, when, bus = this.sfxBus, sweep = 0) {
    const c = this.ctx, t = when ?? c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  play(n, v = 1) {
    if (!this.ctx) return;
    switch (n) {
      case 'crash': this.hiss(0.5, 900, 0.9 * v, 'lowpass', null, this.sfxBus, 0.3); this.tone(70, 0.4, 'square', 0.25 * v, null, this.sfxBus, 0.5); break;
      case 'scrape': this.hiss(0.15, 3000, 0.25, 'bandpass'); break;
      case 'mult': this.tone(660 * v, 0.12, 'square', 0.08, null, this.sfxBus, 1.5, true); break;
      case 'bank': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'square', 0.07, this.ctx.currentTime + i * 0.05, this.sfxBus, 0, true)); break;
      case 'lost': this.tone(330, 0.35, 'sawtooth', 0.12, null, this.sfxBus, 0.5); break;
      case 'check': [784, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, this.ctx.currentTime + i * 0.07, this.sfxBus, 0, true)); break;
      case 'close': this.tone(1760, 0.08, 'sine', 0.08); break;
      case 'nitro': this.hiss(0.8, 600, 0.6, 'bandpass', null, this.sfxBus, 4); break;
      case 'go': this.tone(440, 0.25, 'square', 0.12); break;
      case 'goGo': this.tone(880, 0.6, 'square', 0.14, null, this.sfxBus, 0, true); break;
      case 'click': this.tone(990, 0.04, 'square', 0.06); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.1, this.ctx.currentTime + i * 0.15, this.sfxBus, 0, true)); break;
    }
  }
  // per frame: engine pitch, screech and the music scheduler
  update(state) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    const sp = state ? state.speed : 0;
    const f = 48 + sp * 0.11 + (state && state.nitro ? 20 : 0);
    this.o1.frequency.setTargetAtTime(f, now, 0.05);
    this.o2.frequency.setTargetAtTime(f * 1.5, now, 0.05);
    this.engF.frequency.setTargetAtTime(300 + sp * 1.4 + (state ? state.throttle * 500 : 0), now, 0.05);
    this.eng.gain.setTargetAtTime(state ? 0.05 + (state.throttle * 0.04) : 0, now, 0.08);
    this.sc.gain.setTargetAtTime(state ? Math.min(0.22, state.drift * 0.3) : 0, now, 0.05);
    this.scF.frequency.setTargetAtTime(1400 + sp * 0.8, now, 0.1);
    // eurobeat, scheduled a little ahead: four-on-the-floor kick, offbeat hats,
    // octave-jumping bass and a stabby saw riff over Am - F - G - Em
    const spb = 60 / 155 / 4;
    while (this.next < now + 0.12) {
      const t = this.next, s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const b = this.musicBus;
      if (s % 4 === 0) this.tone(130, 0.18, 'sine', 0.55, t, b, 0.35);
      if (s % 4 === 2) this.hiss(0.07, 7000, 0.12, 'highpass', t, b);
      if (s === 4 || s === 12) this.hiss(0.16, 1800, 0.3, 'bandpass', t, b);
      const roots = [55, 43.65, 49, 41.2];
      const r = roots[bar];
      if (s % 2 === 1) this.tone(r * (s % 4 === 1 ? 2 : 4), spb * 0.9, 'sawtooth', 0.07, t, b);
      // the riff: minor-key stabs on a syncopated 16th pattern
      const riff = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0];
      const melody = [[4, 0, 0, 4.76, 0, 0, 6, 0, 0, 0, 5.34, 0, 4.76, 0, 4, 0], [4, 0, 0, 4, 0, 0, 4.76, 0, 0, 0, 4, 0, 3.56, 0, 3, 0], [4, 0, 0, 4.49, 0, 0, 5.04, 0, 0, 0, 6, 0, 5.04, 0, 4.49, 0], [4, 0, 0, 4.76, 0, 0, 6, 0, 0, 0, 8, 0, 6, 0, 5.34, 0]][bar];
      if (riff[s]) { const f = r * 2 * melody[s]; this.tone(f, spb * 1.6, 'sawtooth', 0.045, t, b, 0, true); this.tone(f * 1.005, spb * 1.6, 'square', 0.025, t, b); }
      if (s === 0) for (const m of [4, 4.76, 6]) this.tone(r * m, spb * 15, 'triangle', 0.02, t, b, 0, true);
      this.next += spb;
      this.step++;
    }
  }
}
