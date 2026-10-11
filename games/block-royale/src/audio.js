// All synthesised. A lo-fi electric-piano groove (82 BPM, swung 16ths, lowpassed, a bit
// of vinyl hiss) and jewel-box sound effects. Streak clears walk up a pentatonic scale.
const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [
  [146.8, 174.6, 220.0, 261.6, 329.6], // Dm9
  [98.0, 174.6, 246.9, 329.6, 440.0],  // G13
  [130.8, 164.8, 196.0, 246.9, 293.7], // Cmaj9
  [110.0, 196.0, 261.6, 329.6, 493.9], // Am9
];
const MELODY = [ // 32 steps per chord pair; 0 = rest, else scale degree index
  [7, 0, 0, 5, 0, 0, 4, 0, 0, 0, 5, 0, 2, 0, 0, 0],
  [0, 0, 4, 0, 5, 0, 0, 7, 0, 0, 9, 0, 7, 0, 0, 0],
];

export class Sound {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.85; this.muted = false; this.musicOn = true; this.step = 0; this.next = 0; this.intensity = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.ratio.value = 4; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.lofi = c.createBiquadFilter(); this.lofi.type = 'lowpass'; this.lofi.frequency.value = 2200; this.lofi.Q.value = 0.4;
    this.musicBus.connect(this.lofi).connect(this.master);
    this.delay = c.createDelay(); this.delay.delayTime.value = 0.27;
    const fb = c.createGain(); fb.gain.value = 0.32; const wet = c.createGain(); wet.gain.value = 0.22;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 3000;
    this.delay.connect(dl).connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.next = c.currentTime + 0.1;
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxBus.gain.value = this.sfx;
    this.musicBus.gain.value = this.musicOn ? this.music * 0.55 : 0;
  }
  tone(f, dur, type, vol, t, bus = this.sfxBus, slide = 0, echo = false, attack = 0.004) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (echo) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, f, vol, t, type = 'bandpass', q = 1, sweep = 0, bus = this.sfxBus) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  bell(f, vol, t, dur = 0.9) {
    this.tone(f, dur, 'sine', vol, t, this.sfxBus, 0, true);
    this.tone(f * 2.01, dur * 0.5, 'sine', vol * 0.35, t, this.sfxBus, 0, true);
    this.tone(f * 3.99, dur * 0.2, 'sine', vol * 0.12, t);
  }
  penta(k) { const o = Math.floor(k / 5); return 523.25 * Math.pow(2, (o * 12 + PENTA[k % 5]) / 12); }
  play(n, a = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (n) {
      case 'pick': this.tone(1100 + a * 220, 0.04, 'triangle', 0.07, t); break; // a = tray slot
      case 'place': { // a = board column: placements walk the pentatonic scale, so play is a melody
        const f = this.penta(((a % 8) + 8) % 8) / 2;
        this.tone(f, 0.09, 'sine', 0.22, t, this.sfxBus, 0.85);
        this.tone(f * 2, 0.05, 'triangle', 0.05, t + 0.004);
        this.tone(160, 0.06, 'sine', 0.22, t, this.sfxBus, 0.6);
        this.hiss(0.04, 2400, 0.16, t, 'bandpass', 2);
        break;
      }
      case 'thud': this.tone(90, 0.16, 'sine', 0.3, t, this.sfxBus, 0.6); this.hiss(0.1, 300, 0.2, t, 'lowpass', 0.7); break;
      case 'wind': this.hiss(0.5, 1200, 0.25, t, 'bandpass', 1.5, 4); [392, 494, 587, 784].forEach((f, i) => this.bell(f, 0.1, t + 0.1 + i * 0.07, 0.6)); break;
      case 'bad': this.tone(140, 0.12, 'square', 0.06, t, this.sfxBus, 0.8); break;
      case 'note': this.bell(this.penta(a), 0.2, t); break;
      case 'clear': {
        const k = Math.min(4, a);
        this.hiss(0.35 + k * 0.08, 5000, 0.28 + k * 0.05, t, 'highpass', 0.7);
        for (let i = 0; i < 3 + k; i++) this.tone(2400 + Math.random() * 2600, 0.12, 'sine', 0.035, t + i * 0.025 + Math.random() * 0.02);
        this.tone(180, 0.25, 'sine', 0.3, t, this.sfxBus, 0.45);
        break;
      }
      case 'chips': this.tone(880 + a * 55, 0.07, 'square', 0.035, t); this.tone(1760 + a * 110, 0.05, 'sine', 0.05, t); break;
      case 'mult': this.tone(330 + a * 30, 0.1, 'sawtooth', 0.05, t, this.sfxBus, 1.4); this.tone(660 + a * 60, 0.08, 'triangle', 0.06, t); break;
      case 'xmult':
        this.tone(220, 0.35, 'sawtooth', 0.09, t, this.sfxBus, 3); this.tone(440, 0.3, 'square', 0.05, t + 0.02, this.sfxBus, 2.5);
        this.hiss(0.2, 1500, 0.2, t, 'bandpass', 1, 4);
        break;
      case 'money': this.tone(1568, 0.08, 'square', 0.05, t); this.tone(2093, 0.25, 'square', 0.05, t + 0.07, this.sfxBus, 0, true); break;
      case 'slam': {
        const s = Math.min(1, a);
        this.tone(110, 0.4 + s * 0.4, 'sine', 0.5 + s * 0.3, t, this.sfxBus, 0.35);
        this.hiss(0.25 + s * 0.4, 600, 0.35 + s * 0.3, t, 'lowpass', 0.8, 0.3);
        if (s > 0.5) this.tone(55, 0.9, 'sine', 0.4, t, this.sfxBus, 0.6);
        break;
      }
      case 'stone': this.hiss(0.15, 900, 0.4, t, 'bandpass', 3); this.tone(200, 0.1, 'square', 0.04, t, this.sfxBus, 0.5); break;
      case 'coin': this.tone(1318, 0.06, 'square', 0.04, t); this.tone(1760, 0.18, 'square', 0.04, t + 0.06); break;
      case 'buy': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.09, t + i * 0.045, this.sfxBus, 0, true)); break;
      case 'sell': [1175, 880, 659].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.08, t + i * 0.05)); break;
      case 'reroll': this.hiss(0.22, 1200, 0.25, t, 'bandpass', 2, 3); this.tone(600, 0.15, 'triangle', 0.06, t, this.sfxBus, 2); break;
      case 'click': this.tone(900, 0.04, 'triangle', 0.08, t); break;
      case 'glyph': this.hiss(0.4, 3000, 0.2, t, 'bandpass', 4, 0.3); [523, 784, 1046].forEach((f, i) => this.bell(f, 0.08, t + i * 0.06, 0.5)); break;
      case 'bomb': this.tone(70, 0.8, 'sine', 0.7, t, this.sfxBus, 0.4); this.hiss(0.7, 800, 0.8, t, 'lowpass', 0.7, 0.2); break;
      case 'round': this.hiss(0.6, 400, 0.18, t, 'bandpass', 1, 6); [392, 523, 659].forEach((f, i) => this.bell(f, 0.09, t + 0.15 + i * 0.07, 0.7)); break;
      case 'boss':
        this.tone(73, 1.6, 'sawtooth', 0.12, t, this.sfxBus, 0.98, false, 0.2); this.tone(110, 1.6, 'sawtooth', 0.08, t, this.sfxBus, 0.97, false, 0.2);
        this.hiss(1.2, 300, 0.25, t, 'lowpass', 1, 0.5);
        break;
      case 'target': // rising fanfare + thump when the round target falls
        this.hiss(0.3, 3000, 0.25, t, 'highpass', 0.7);
        [659, 784, 1046, 1318].forEach((f, i) => this.bell(f, 0.14, t + i * 0.06, 0.8));
        this.tone(98, 0.5, 'sine', 0.45, t + 0.18, this.sfxBus, 0.5);
        break;
      case 'win': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.bell(f, 0.13, t + i * 0.07, 1.0)); this.tone(130, 0.6, 'sine', 0.3, t, this.sfxBus, 0.5); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, t + i * 0.16, this.sfxBus, 0.98, true)); break;
      case 'tick': this.tone(2200, 0.02, 'square', 0.025, t); break;
    }
  }
  // haptics on phones, behind the SFX volume / mute like every other sound
  buzz(pattern) {
    if (this.muted || this.sfx <= 0) return;
    try { navigator.vibrate?.(pattern); } catch (e) { /* not allowed */ }
  }
  // music scheduler, called every frame
  update() {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx, spb = 60 / 82 / 4;
    if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.18) {
      const s = this.step % 16, bar = Math.floor(this.step / 16), chord = CHORDS[bar % 4];
      const swing = s % 2 ? spb * 0.18 : 0, t = this.next + swing, b = this.musicBus, I = this.intensity;
      if (s === 0) chord.forEach((f, i) => this.ep(f, t + i * 0.012, 0.045, spb * 14));
      if (s === 10 && bar % 2) chord.slice(2).forEach((f, i) => this.ep(f, t + i * 0.01, 0.03, spb * 5));
      if (s === 0 || s === 10) this.tone(chord[0] / 2, spb * (s === 0 ? 7 : 5), 'triangle', 0.16, t, b, 0, false, 0.01);
      if (s === 0 || s === 7 || (s === 10 && bar % 2 === 0)) { this.tone(120, 0.28, 'sine', 0.42, t, b, 0.35); }
      if (s === 4 || s === 12) { this.hiss(0.16, 1800, 0.16, t, 'bandpass', 0.9, 0, b); this.tone(190, 0.08, 'triangle', 0.07, t, b, 0.7); }
      if (s % 2 === 0) this.hiss(0.04, 8000, s % 4 === 2 ? 0.05 : 0.03, t, 'highpass', 1, 0, b);
      // the melody comes in quietly from the first clear (streak 1) and grows with the streak
      if (I > 0.1) { const m = MELODY[bar % 2][s]; if (m) this.ep(this.penta(m) / 2, t, 0.012 + 0.03 * I, spb * 3); }
      if (Math.random() < 0.12) this.hiss(0.01, 3000 + Math.random() * 3000, 0.04, t, 'highpass', 1, 0, b);
      this.step++; this.next += spb;
    }
  }
  ep(f, t, vol, dur) { // soft electric piano: sine + a bell-ish overtone, slow-ish attack
    const b = this.musicBus;
    this.tone(f, dur, 'sine', vol, t, b, 0, false, 0.015);
    this.tone(f * 2, dur * 0.4, 'sine', vol * 0.25, t, b, 0, false, 0.01);
    this.tone(f * 4.02, dur * 0.12, 'sine', vol * 0.08, t, b);
  }
}
