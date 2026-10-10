// All synthesised with WebAudio: the clock tick and beep, snips, clacks, buzzers,
// chimes, the defuse exhale and the big boom, plus a tense little music loop.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.5; this.sfx = 0.9; this.muted = false; this.step = 0; this.t = 0; this.intensity = 0; this.mode = 'menu'; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 2400; this.musicLP.connect(this.musicBus);
    this.verb = c.createDelay(); this.verb.delayTime.value = 0.17;
    const fb = c.createGain(); fb.gain.value = 0.3; const wet = c.createGain(); wet.gain.value = 0.2;
    this.verb.connect(fb).connect(this.verb); this.verb.connect(wet).connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : 1; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.5; }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, verb = false, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (verb) g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus, attack = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(n, p = 1) {
    if (!this.ctx) return;
    switch (n) {
      case 'tick': this.noiseHit(0.035, 3200, 0.55, 'bandpass', 0, 0, 4); this.tone(1900, 0.03, 'square', 0.04); break;
      case 'tock': this.noiseHit(0.04, 2200, 0.5, 'bandpass', 0, 0, 4); this.tone(1300, 0.03, 'square', 0.035); break;
      case 'beep': this.tone(2100 * p, 0.09, 'square', 0.07); this.tone(4200 * p, 0.06, 'sine', 0.03); break;
      case 'snip': this.noiseHit(0.06, 6000, 0.6, 'highpass'); this.tone(3200, 0.08, 'triangle', 0.12, 0, this.sfxBus, 0.6); this.noiseHit(0.12, 900, 0.25, 'bandpass', 0.5, 0.02); break;
      case 'clack': this.noiseHit(0.03, 2600, 0.6, 'bandpass', 0, 0, 3); this.tone(420, 0.05, 'square', 0.06, 0, this.sfxBus, 0.6); break;
      case 'press': this.tone(140, 0.12, 'sine', 0.45, 0, this.sfxBus, 0.6); this.noiseHit(0.05, 1200, 0.35, 'lowpass'); break;
      case 'release': this.tone(220, 0.06, 'sine', 0.25, 0, this.sfxBus, 1.4); this.noiseHit(0.03, 2400, 0.25, 'bandpass', 0, 0, 3); break;
      case 'key': this.noiseHit(0.03, 1800, 0.5, 'bandpass', 0, 0, 2); this.tone(700, 0.04, 'triangle', 0.08); break;
      case 'simon': this.tone(p, 0.36, 'triangle', 0.16, 0, this.sfxBus, 0, true, 0.01); this.tone(p * 2, 0.2, 'sine', 0.05); break;
      case 'blip': this.tone(880, 0.05, 'square', 0.05, 0, this.sfxBus, 1.3); break;
      case 'ratchet': for (let i = 0; i < 3; i++) this.noiseHit(0.018, 3000, 0.35, 'bandpass', 0, i * 0.025, 5); break;
      case 'valve': this.noiseHit(0.5, 5000, 0.4, 'highpass', 0.4, 0, 1, this.sfxBus, 0.02); this.tone(300, 0.15, 'sawtooth', 0.04, 0, this.sfxBus, 0.7); break;
      case 'hiss': this.noiseHit(0.8, 7000, 0.18, 'highpass', 0.7, 0, 1, this.sfxBus, 0.1); this.tone(1500, 0.12, 'square', 0.05); this.tone(1500, 0.12, 'square', 0.05, 0.18); break;
      case 'strike':
        this.tone(110, 0.45, 'sawtooth', 0.22, 0, this.sfxBus, 0.9); this.tone(116, 0.45, 'sawtooth', 0.22, 0, this.sfxBus, 0.9);
        this.tone(55, 0.3, 'square', 0.18); this.noiseHit(0.2, 600, 0.4, 'lowpass');
        break;
      case 'solved': this.noiseHit(0.03, 2000, 0.4, 'bandpass', 0, 0, 3); [784, 1175].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.16, 0.04 + i * 0.07, this.sfxBus, 0, true)); break;
      case 'defuse':
        this.tone(90, 0.25, 'sine', 0.6, 0, this.sfxBus, 0.5); this.noiseHit(0.08, 900, 0.6, 'lowpass');
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.1, 'triangle', 0.13, 0.12 + i * 0.09, this.sfxBus, 0, true, 0.02));
        // the exhale: soft noise that sighs downward
        this.noiseHit(1.6, 1400, 0.35, 'bandpass', 0.35, 0.35, 0.7, this.sfxBus, 0.25);
        break;
      case 'star': this.tone(1320 * p, 0.4, 'triangle', 0.14, 0, this.sfxBus, 0, true); this.tone(1980 * p, 0.25, 'sine', 0.06, 0.03); break;
      case 'boom':
        this.noiseHit(2.2, 900, 1.2, 'lowpass', 0.08); this.noiseHit(0.5, 3000, 0.6, 'bandpass', 0.2);
        this.tone(60, 1.4, 'sine', 0.9, 0, this.sfxBus, 0.35); this.tone(38, 1.8, 'sine', 0.7, 0.05, this.sfxBus, 0.5);
        for (let i = 0; i < 6; i++) this.noiseHit(0.15, 1500 + i * 400, 0.25, 'bandpass', 0.4, 0.3 + i * 0.12 + Math.random() * 0.1, 2);
        break;
      case 'cough': this.noiseHit(0.12, 700, 0.3, 'bandpass', 0.7, 0, 2); this.noiseHit(0.1, 650, 0.22, 'bandpass', 0.7, 0.2, 2); break;
      case 'ui': this.tone(660, 0.05, 'triangle', 0.08); break;
      case 'thunk': this.tone(80, 0.25, 'sine', 0.5, 0, this.sfxBus, 0.6); this.noiseHit(0.1, 500, 0.35, 'lowpass'); break;
    }
  }
  // music: a tense bass pulse with hats; 'play' mode gets faster hats as intensity rises.
  update(dt) {
    if (!this.ctx) return;
    this.t -= dt;
    if (this.t > 0) return;
    const play = this.mode === 'play', I = play ? this.intensity : 0;
    this.t = play ? 0.125 : 0.2;
    const s = this.step++ % 32, b = this.musicLP;
    const root = [110, 110, 103.8, 98][Math.floor(this.step / 32) % 4];
    if (this.mode === 'off') return;
    if (play) {
      if (s % 4 === 0) this.tone(root, 0.22, 'triangle', 0.32, 0, b, 0.97);
      if (s % 8 === 6) this.tone(root * 1.5, 0.12, 'triangle', 0.18, 0, b);
      if (s % 2 === 1 || I > 0.6) this.noiseHit(0.03, 8000, 0.05 + I * 0.07, 'highpass', 0, 0, 1, b);
      if (s === 0 || s === 16) this.tone(root * 2, 0.6, 'sine', 0.05, 0, b, 1, true);
      if (I > 0.35 && s % 16 === 12) this.tone(root * 3, 0.18, 'square', 0.03, 0, b);
    } else {
      // menu: slow, warm, a little sneaky
      const mel = [0, 3, 7, 10, 7, 3, 5, 2];
      if (s % 4 === 0) this.tone(root, 0.5, 'triangle', 0.22, 0, b, 0.98);
      if (s % 4 === 2) this.tone(root * Math.pow(2, (12 + mel[(this.step >> 2) % 8]) / 12), 0.3, 'triangle', 0.06, 0, b, 1, true);
      if (s % 8 === 4) this.noiseHit(0.05, 6000, 0.05, 'highpass', 0, 0, 1, b);
    }
  }
}
