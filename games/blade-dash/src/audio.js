// All synthesised: taiko drums and a plucked koto line for music; whooshes,
// steel "shing"s, thuds and booms for effects.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.6; this.sfx = 0.9; this.muted = false; this.step = 0; this.t = 0; this.intensity = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.verb = c.createDelay(); this.verb.delayTime.value = 0.23;
    const fb = c.createGain(); fb.gain.value = 0.28; const wet = c.createGain(); wet.gain.value = 0.25;
    this.verb.connect(fb).connect(this.verb); this.verb.connect(wet).connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : 1; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.6; }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, verb = false) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
  play(n, pitch = 1) {
    if (!this.ctx) return;
    switch (n) {
      case 'dash': this.noiseHit(0.16, 900 * pitch, 0.5, 'bandpass', 3.5, 0, 0.8); break;
      case 'slash':
        this.noiseHit(0.08, 5000, 0.5, 'highpass');
        this.tone(2400 * pitch, 0.35, 'sine', 0.12, 0, this.sfxBus, 0.85, true);
        this.tone(3600 * pitch, 0.25, 'sine', 0.06, 0.01, this.sfxBus, 0.9, true);
        this.tone(90, 0.18, 'sine', 0.5, 0, this.sfxBus, 0.5);
        break;
      case 'clang': this.tone(1800, 0.5, 'square', 0.08, 0, this.sfxBus, 0.97, true); this.tone(2650, 0.4, 'square', 0.06, 0, this.sfxBus, 0.97, true); this.noiseHit(0.1, 3000, 0.4); break;
      case 'parry': this.tone(3100, 0.3, 'sine', 0.12, 0, this.sfxBus, 0.9, true); this.noiseHit(0.06, 6000, 0.3, 'highpass'); break;
      case 'boom': this.noiseHit(0.9, 400, 1.0, 'lowpass', 0.2); this.tone(55, 0.7, 'sine', 0.7, 0, this.sfxBus, 0.5); break;
      case 'land': this.noiseHit(0.08, 500, 0.25, 'lowpass'); break;
      case 'arrow': this.noiseHit(0.2, 2500, 0.25, 'bandpass', 0.5); break;
      case 'twang': this.tone(220, 0.3, 'triangle', 0.15, 0, this.sfxBus, 0.98); break;
      case 'die': this.tone(180, 1.2, 'sawtooth', 0.2, 0, this.sfxBus, 0.3, true); this.noiseHit(0.5, 300, 0.6, 'lowpass'); break;
      case 'clear': [392, 523, 587, 784].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.16, i * 0.08, this.sfxBus, 0, true)); this.taiko(0, 1.0); this.taiko(0.32, 1.0); break;
      case 'star': this.tone(1568, 0.5, 'triangle', 0.14, 0, this.sfxBus, 0, true); this.taiko(0, 0.7); break;
      case 'warn': this.tone(1300, 0.07, 'square', 0.05); this.noiseHit(0.16, 2200, 0.22, 'bandpass', 1.6); break;
      case 'focusIn': this.noiseHit(0.5, 1800, 0.35, 'bandpass', 0.2); this.tone(220, 0.6, 'sine', 0.18, 0, this.sfxBus, 0.5); break;
      case 'focusOut': this.noiseHit(0.3, 300, 0.25, 'bandpass', 4); this.tone(110, 0.3, 'sine', 0.12, 0, this.sfxBus, 2); break;
      case 'click': this.tone(660, 0.05, 'triangle', 0.1); break;
      case 'combo': this.tone(880 * pitch, 0.12, 'triangle', 0.1, 0, this.sfxBus, 1.5); break;
    }
  }
  taiko(when, vol = 0.6, bus = this.sfxBus) {
    this.tone(70, 0.5, 'sine', vol, when, bus, 0.6);
    this.noiseHit(0.08, 900, vol * 0.4, 'lowpass', 0, when, 1, bus);
  }
  // music: taiko pattern that gets busier with intensity (0..1), and a koto line on the miyako-bushi scale
  update(dt, playing) {
    if (!this.ctx) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.19;
    const s = this.step++ % 16, bar = Math.floor(this.step / 16);
    const I = playing ? this.intensity : 0.15;
    const b = this.musicBus;
    if (s === 0 || s === 8 || (I > 0.4 && (s === 10 || s === 14)) || (I > 0.75 && s % 2 === 0 && s !== 4 && s !== 12)) this.taiko(0, 0.35 + I * 0.25, b);
    if ((s === 4 || s === 12)) this.noiseHit(0.06, 3500, 0.15 + I * 0.1, 'bandpass', 0, 0, 2, b);
    const scale = [329.6, 349.2, 440, 493.9, 523.3, 659.3, 698.5, 880];
    const phrase = [[0, 2, 3, 4], [4, 3, 2, 1], [0, 2, 4, 5], [5, 4, 3, 2]][bar % 4];
    if (s % 4 === 0 && Math.random() < 0.85) {
      const f = scale[phrase[s / 4]] * (I > 0.6 ? 1 : 0.5);
      this.tone(f, 0.5, 'triangle', 0.07, 0, b, 0.995);
      this.tone(f * 2, 0.15, 'sine', 0.03, 0, b);
    }
  }
}
