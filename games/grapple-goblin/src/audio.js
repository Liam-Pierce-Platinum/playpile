// All synthesised. Plucky marimba-and-bass music loop (a key per cave theme),
// and springy cartoon effects: hook zip, clink, rope twang, coin dings, boings.
const SCALES = [
  { root: 261.6, steps: [0, 2, 4, 7, 9, 12, 14, 16] },   // moss: C major pentatonic, bouncy
  { root: 329.6, steps: [0, 3, 5, 7, 10, 12, 15, 17] },  // crystal: E minor pentatonic, bells
  { root: 293.7, steps: [0, 2, 3, 7, 9, 12, 14, 15] },   // lava: D dorian-ish, lower
  { root: 349.2, steps: [0, 2, 4, 6, 7, 11, 12, 14] },   // ice: F lydian, sparkly
];
const MEL = [[0, 2, 4, 2, 5, 4, 2, 1], [0, 2, 4, 5, 7, 5, 4, 2], [5, 4, 2, 0, 2, 4, 2, 0], [0, 4, 2, 5, 4, 7, 6, 4]];
const BASS = [0, 0, 3, 3, 4, 4, 3, 2];

export class Audio {
  constructor() { this.ctx = null; this.musicOn = true; this.sfxOn = true; this.theme = 0; this.step = 0; this.next = 0; this.intensity = 0.5; this.coinStreak = 0; this.coinT = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.echo = c.createDelay(); this.echo.delayTime.value = 0.21;
    const fb = c.createGain(); fb.gain.value = 0.3; const wet = c.createGain(); wet.gain.value = 0.22;
    this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.next = c.currentTime + 0.1;
    this.apply();
  }
  apply() { if (!this.ctx) return; this.sfxBus.gain.value = this.sfxOn ? 0.85 : 0; this.musicBus.gain.value = this.musicOn ? 0.32 : 0; }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0, echo = false, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  play(n, p = 1) {
    if (!this.ctx || !this.sfxOn) return;
    switch (n) {
      case 'fire': this.hiss(0.12, 1500, 0.35, 'bandpass', 3, 0, 1.2); this.tone(500, 0.1, 'square', 0.04, 0, this.sfxBus, 2.2); break;
      case 'whiff': this.hiss(0.18, 1200, 0.2, 'bandpass', 2.5); this.tone(300, 0.2, 'triangle', 0.06, 0.08, this.sfxBus, 0.5); break;
      case 'attach': this.tone(1700, 0.12, 'square', 0.05); this.tone(2500, 0.18, 'sine', 0.1, 0, this.sfxBus, 0.95, true); this.hiss(0.04, 5000, 0.2, 'highpass'); break;
      case 'taut': this.tone(110 * p, 0.32, 'sawtooth', 0.09, 0, this.sfxBus, 1.25); this.tone(220 * p, 0.25, 'triangle', 0.1, 0, this.sfxBus, 1.1); break;
      case 'release': this.hiss(0.25, 700, 0.3 * p, 'bandpass', 3.5, 0, 0.8); break;
      case 'whoosh': this.hiss(0.4, 500, 0.35, 'bandpass', 4, 0, 0.7); break;
      case 'coin': {
        const now = this.ctx.currentTime;
        this.coinStreak = now - this.coinT < 0.5 ? Math.min(this.coinStreak + 1, 12) : 0; this.coinT = now;
        const f = 988 * Math.pow(2, (this.coinStreak % 13) / 12);
        this.tone(f, 0.09, 'square', 0.05); this.tone(f * 1.5, 0.25, 'sine', 0.09, 0.05, this.sfxBus, 0, true);
        break;
      }
      case 'gem': [1318, 1661, 1976, 2637].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.1, i * 0.05, this.sfxBus, 0, true)); break;
      case 'big': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => { this.tone(f, 0.5, 'triangle', 0.12, i * 0.07, this.sfxBus, 0, true); this.tone(f * 2, 0.3, 'sine', 0.05, i * 0.07 + 0.02); }); break;
      case 'boing': this.tone(180, 0.35, 'sine', 0.3, 0, this.sfxBus, 3.2); this.tone(360, 0.25, 'triangle', 0.08, 0, this.sfxBus, 2.5); break;
      case 'land': this.hiss(0.1, 400, 0.3 * p, 'lowpass'); this.tone(90, 0.1, 'sine', 0.2 * p, 0, this.sfxBus, 0.6); break;
      case 'bonk': this.tone(160, 0.15, 'square', 0.08, 0, this.sfxBus, 0.5); this.hiss(0.08, 900, 0.3, 'lowpass'); break;
      case 'crack': this.hiss(0.05, 3000, 0.2, 'highpass'); break;
      case 'crumble': this.hiss(0.45, 600, 0.6, 'lowpass', 0.3); this.tone(70, 0.3, 'sine', 0.3, 0, this.sfxBus, 0.5); break;
      case 'die': this.tone(620, 0.08, 'square', 0.08); this.tone(520, 0.45, 'triangle', 0.18, 0.06, this.sfxBus, 0.35); this.hiss(0.25, 1600, 0.4, 'bandpass', 0.2); break;
      case 'respawn': this.hiss(0.22, 2500, 0.25, 'bandpass', 0.4); this.tone(440, 0.15, 'sine', 0.1, 0.05, this.sfxBus, 1.8); break;
      case 'flag': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, i * 0.07, this.sfxBus, 0, true)); break;
      case 'cart': this.hiss(0.5, 250, 0.35, 'lowpass', 1.5); for (let i = 0; i < 4; i++) this.tone(140, 0.05, 'square', 0.05, i * 0.12); break;
      case 'board': this.tone(220, 0.1, 'square', 0.08); this.tone(330, 0.12, 'square', 0.06, 0.05); this.hiss(0.15, 600, 0.3, 'lowpass'); break;
      case 'crash': this.hiss(0.5, 1400, 0.6, 'bandpass', 0.3); this.tone(80, 0.3, 'sine', 0.4, 0, this.sfxBus, 0.5); this.tone(1200, 0.2, 'square', 0.05, 0, this.sfxBus, 0.6); break;
      case 'finish': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.45, 'square', 0.06, i * 0.1, this.sfxBus, 0, true)); [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.1, 0.4 + i * 0.06, this.sfxBus, 0, true)); break;
      case 'star': this.tone(1568 * p, 0.4, 'triangle', 0.15, 0, this.sfxBus, 0, true); this.tone(2093 * p, 0.3, 'sine', 0.08, 0.05); break;
      case 'click': this.tone(880, 0.05, 'triangle', 0.1); break;
      case 'wind': this.hiss(1.2, 600, 0.32, 'bandpass', 1.6, 0, 0.6); this.hiss(0.9, 2400, 0.12, 'highpass'); break;
      case 'gustwarn': { // a whoosh that builds for a second before an icy gust
        const c = this.ctx, t = c.currentTime, src = c.createBufferSource(); src.buffer = this.noise;
        const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 0.9; fl.frequency.setValueAtTime(260, t); fl.frequency.exponentialRampToValueAtTime(1500, t + 1);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        src.connect(fl).connect(g).connect(this.sfxBus); src.start(t); src.stop(t + 1.2);
        break;
      }
      case 'flap': this.hiss(0.05, 420, 0.16 * p, 'lowpass'); this.hiss(0.05, 520, 0.12 * p, 'lowpass', 0, 0.09); break;
      case 'perfect': [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.11, i * 0.035, this.sfxBus, 0, true)); this.hiss(0.15, 6000, 0.18, 'highpass'); break;
    }
  }
  // music: scheduled ahead on the audio clock so it never drifts
  update(theme) {
    if (!this.ctx) return;
    this.theme = theme;
    const c = this.ctx, spb = 60 / 116 / 2;   // eighth notes at 116 bpm
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.15) {
      this.beat(this.step++, this.next - c.currentTime);
      this.next += spb;
    }
  }
  beat(s, when) {
    if (!this.musicOn) return;
    const S = SCALES[this.theme], b = this.musicBus, st = s % 16, bar = Math.floor(s / 16) % 4;
    const note = (deg, oct = 1) => S.root * Math.pow(2, (S.steps[((deg % 8) + 8) % 8] + (deg >= 8 ? 12 : 0)) / 12) * oct;
    // kick + shaker + snap
    if (st % 4 === 0) this.tone(120, 0.16, 'sine', 0.5, when, b, 0.4);
    if (st % 2 === 1) this.hiss(0.04, 7000, 0.12, 'highpass', 0, when, 1, b);
    if (st === 4 || st === 12) { this.hiss(0.09, 1800, 0.3, 'bandpass', 0, when, 1.5, b); this.tone(230, 0.06, 'triangle', 0.1, when, b, 0.6); }
    // bass on the beat, bouncing octaves
    if (st % 2 === 0) { const f = note(BASS[(bar * 2 + Math.floor(st / 8)) % 8]) / 4; this.tone(st % 4 === 2 ? f * 2 : f, 0.22, 'triangle', 0.32, when, b); }
    // marimba melody
    const mel = MEL[bar];
    if (st % 2 === 0 && (st % 8 !== 6 || bar % 2)) {
      const f = note(mel[st / 2 % 8]);
      const typ = this.theme === 1 || this.theme === 3 ? 'sine' : 'triangle';
      this.tone(f, 0.28, typ, 0.13, when, b, 0, true);
      this.tone(f * (this.theme === 3 ? 4 : 2), 0.08, 'sine', 0.05, when, b);
    }
    // little counter-chirps on the off beats in the second half
    if (bar >= 2 && st % 4 === 3) this.tone(note(mel[(st + 3) % 8] + 4) , 0.1, 'sine', 0.05, when, b);
  }
}
