// Everything is synthesised with WebAudio: a music-box lullaby over a dark pad
// that gains a heartbeat as the night deepens, plus all the effects.
export class Audio {
  constructor() {
    this.ctx = null; this.music = 0.6; this.sfx = 0.85; this.muted = false;
    this.intensity = 0; this.step = 0; this.nextT = 0; this.playing = false; this.mode = 'night';
    this.last = {};
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = this.ctx = new AC(); } catch (e) { return; }
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.ratio.value = 6; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    // a cheap shimmering echo for the music box and chimes
    this.verb = c.createDelay(1); this.verb.delayTime.value = 0.31;
    const fb = c.createGain(); fb.gain.value = 0.38; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const wet = c.createGain(); wet.gain.value = 0.32;
    this.verb.connect(lp).connect(fb).connect(this.verb); lp.connect(wet).connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxBus.gain.value = this.sfx;
    this.musicBus.gain.value = this.music * 0.55;
  }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, verb = false, attack = 0.005) {
    const c = this.ctx, t = Math.max(c.currentTime, when || c.currentTime);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (verb) g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noiseHit(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus) {
    const c = this.ctx, t = Math.max(c.currentTime, when || c.currentTime);
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
  }
  // rate limit noisy effects (kills, pickups) so 600 enemies never turn into a wall of noise
  ok(n, gap) { const now = this.ctx.currentTime; if ((this.last[n] || 0) + gap > now) return false; this.last[n] = now; return true; }
  play(n, p = 1) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    switch (n) {
      case 'pop': if (!this.ok(n, 0.045)) return;
        this.tone(520 * p + Math.random() * 260, 0.09, 'sine', 0.13, 0, this.sfxBus, 0.55);
        this.noiseHit(0.05, 2400, 0.08, 'highpass'); break;
      case 'ember': if (!this.ok(n, 0.035)) return;
        this.tone(1300 * p, 0.12, 'sine', 0.05, 0, this.sfxBus, 1.01, true); break;
      case 'hurt': if (!this.ok(n, 0.12)) return;
        this.tone(140, 0.22, 'triangle', 0.4, 0, this.sfxBus, 0.5); this.noiseHit(0.18, 700, 0.35, 'lowpass', 0.4); break;
      case 'level': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.13, t + i * 0.06, this.sfxBus, 0, true)); break;
      case 'flip': this.noiseHit(0.07, 3200, 0.16, 'bandpass', 0.6, 0, 2); this.tone(1568 * p, 0.35, 'sine', 0.07, t + 0.03, this.sfxBus, 0, true); break;
      case 'pick': this.tone(784, 0.5, 'triangle', 0.14, 0, this.sfxBus, 0, true); this.tone(1175, 0.6, 'sine', 0.1, t + 0.05, this.sfxBus, 0, true); this.noiseHit(0.25, 900, 0.18, 'bandpass', 4); break;
      case 'click': this.tone(880, 0.05, 'square', 0.04); break;
      case 'chest': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.12, t + i * 0.09, this.sfxBus, 0, true)); this.noiseHit(0.5, 4000, 0.1, 'highpass', 0.5); break;
      case 'evo':
        this.noiseHit(0.9, 300, 0.4, 'bandpass', 12, 0, 1.4);
        [523, 659, 784, 988, 1319].forEach((f) => this.tone(f, 1.6, 'sine', 0.09, t + 0.35, this.sfxBus, 0, true, 0.05));
        this.tone(65, 1.2, 'sine', 0.5, t + 0.3, this.sfxBus, 0.7); break;
      case 'pulse': if (!this.ok(n, 0.1)) return; this.tone(150, 0.35, 'sine', 0.3, 0, this.sfxBus, 0.45); this.noiseHit(0.3, 500, 0.12, 'bandpass', 3); break;
      case 'bolt': if (!this.ok(n, 0.06)) return; this.tone(1800 + Math.random() * 600, 0.08, 'sine', 0.04, 0, this.sfxBus, 1.6); break;
      case 'bell': [1, 2.76, 5.4, 8.93].forEach((m, i) => this.tone(220 * p * m, 2.2 / (1 + i), 'sine', 0.16 / (1 + i), 0, this.sfxBus, 0, true)); break;
      case 'thorn': if (!this.ok(n, 0.2)) return; this.noiseHit(0.25, 1800, 0.22, 'bandpass', 0.4, 0, 3); this.tone(220, 0.15, 'triangle', 0.12, 0, this.sfxBus, 0.6); break;
      case 'block': this.tone(1200, 0.25, 'sine', 0.12, 0, this.sfxBus, 0.5, true); this.noiseHit(0.1, 3000, 0.15); break;
      case 'dash': if (!this.ok(n, 0.25)) return; this.noiseHit(0.3, 400, 0.18, 'bandpass', 2.5, 0, 2); this.tone(260, 0.3, 'sawtooth', 0.04, 0, this.sfxBus, 1.6); break;
      case 'heal': this.tone(660, 0.4, 'sine', 0.1, 0, this.sfxBus, 1.5, true); break;
      case 'big': this.tone(70, 0.6, 'sine', 0.6, 0, this.sfxBus, 0.5); this.noiseHit(0.5, 900, 0.4, 'lowpass', 0.3); break;
      case 'roar': {
        this.noiseHit(1.8, 180, 0.9, 'lowpass', 0.6, 0, 2);
        this.noiseHit(1.3, 900, 0.25, 'bandpass', 0.4, 0, 3);
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(42, t + 1.8);
        lfo.frequency.value = 13; lg.gain.value = 0.18; lfo.connect(lg).connect(g.gain);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        o.connect(lp).connect(g).connect(this.sfxBus); o.start(t); lfo.start(t); o.stop(t + 2); lfo.stop(t + 2);
        break; }
      case 'slam': this.tone(55, 0.5, 'sine', 0.7, 0, this.sfxBus, 0.6); this.noiseHit(0.4, 300, 0.5, 'lowpass', 0.5); break;
      case 'warn': this.tone(330, 0.2, 'square', 0.05); this.tone(311, 0.25, 'square', 0.05, t + 0.12); break;
      case 'dawn': [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, 4, i % 2 ? 'triangle' : 'sine', 0.09, t + i * 0.12, this.sfxBus, 0, true, 0.6)); break;
      case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.13, t + i * 0.22, this.sfxBus, 0.98, true)); this.noiseHit(1.2, 600, 0.2, 'lowpass', 0.2); break;
      case 'achieve': [659, 880, 1319].forEach((f, i) => this.tone(f, 0.8, 'sine', 0.11, t + i * 0.08, this.sfxBus, 0, true)); break;
      case 'banish': this.noiseHit(0.4, 1200, 0.3, 'bandpass', 0.2, 0, 1); break;
    }
  }

  // ---- music: A minor music box, bar per chord ----
  startMusic(mode = 'night') {
    if (!this.ctx) return;
    this.mode = mode; this.playing = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
  }
  stopMusic() { this.playing = false; }
  update() {
    if (!this.ctx || !this.playing || this.muted || this.ctx.state !== 'running') return;
    const c = this.ctx;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    const beat = this.intensity >= 2 ? 0.3 : 0.34;   // eighth-note length
    const chords = [[57, 60, 64, 69, 72], [53, 57, 60, 65, 69], [48, 52, 55, 60, 64], [52, 56, 59, 64, 68]];
    const pat = [0, 2, 4, 2, 3, 4, 2, 1];
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextT < c.currentTime + 0.15) {
      const s = this.step, bar = Math.floor(s / 8) % 4, i = s % 8, ch = chords[bar], t = this.nextT;
      const bus = this.musicBus;
      // music box
      const note = ch[pat[i]] + 12;
      if (!(this.intensity === 0 && i % 2 === 1 && Math.floor(s / 32) % 2 === 1)) {
        this.tone(mf(note), 0.9, 'sine', 0.09, t, bus, 0, true);
        this.tone(mf(note) * 4.01, 0.18, 'sine', 0.014, t, bus);
      }
      if (i === 0) {
        // bass + pad
        this.tone(mf(ch[0] - 12), beat * 7, 'triangle', 0.16, t, bus, 0, false, 0.08);
        for (const dt of [-6, 7]) {
          const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = mf(ch[1]); o.detune.value = dt;
          lp.type = 'lowpass'; lp.frequency.value = 520 + this.intensity * 300;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + beat * 3); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 8.2);
          o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + beat * 8.4);
        }
      }
      if (this.intensity >= 1 && (i === 0 || i === 1 || (this.intensity >= 2 && (i === 4 || i === 5)))) {
        // heartbeat
        this.tone(i % 2 ? 52 : 60, 0.25, 'sine', i % 2 ? 0.3 : 0.4, t, bus, 0.5);
      }
      if (this.intensity >= 2 && i % 2 === 1) this.noiseHit(0.05, 6000, 0.03, 'highpass', 0, t, 1, bus);
      this.step++; this.nextT += beat;
    }
  }
}
