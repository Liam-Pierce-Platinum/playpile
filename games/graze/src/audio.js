// All sound is synthesised. The music is a four-on-the-floor synthwave loop
// (kick, clap, hats, rolling bass, arpeggio, pad) generated from the course
// seed, so every Daily and every level has its own tune. Graze blips climb a
// minor pentatonic as the combo grows; a phase is a sub-bass drop.
const PROGS = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [5, 6, 0, 0], [0, 2, 5, 6], [0, 5, 3, 4]];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA = [0, 3, 5, 7, 10];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null; this.music = 0.7; this.sfx = 0.85;
    this.bpm = 124; this.playing = false; this.step = 0; this.nextT = 0;
    this.intensity = 0; this.song = null;
    this.freq = null;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 4;
    this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicFilt = c.createBiquadFilter(); this.musicFilt.type = 'lowpass'; this.musicFilt.frequency.value = 18000; this.musicFilt.Q.value = 0.9;
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 128; this.analyser.smoothingTimeConstant = 0.75;
    this.musicBus.connect(this.musicFilt).connect(this.analyser).connect(this.master);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    // shared delay for space
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.36;
    const fb = c.createGain(); fb.gain.value = 0.32; const wet = c.createGain(); wet.gain.value = 0.22;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.musicFilt);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    this.timer = setInterval(() => this.tick(), 25);
  }
  apply() { if (!this.ctx) return; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.55; }
  setVolumes(m, s) { this.music = m; this.sfx = s; this.apply(); }

  setSong(seed, root = 45, bpm = 124) {
    let a = seed >>> 0;
    const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    const prog = PROGS[Math.floor(r() * PROGS.length)];
    const arpKind = Math.floor(r() * 3);
    const arp = [];
    for (let i = 0; i < 16; i++) {
      if (arpKind === 0) arp.push([i % 4 === 3 ? 1 : i % 3, Math.floor(i / 8)]);
      else if (arpKind === 1) arp.push([[0, 1, 2, 1][i % 4], i % 8 >= 4 ? 1 : 0]);
      else arp.push([Math.floor(r() * 3), r() < 0.35 ? 1 : 0]);
    }
    const bassPat = [0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1].map((v, i) => (i % 4 === 0 ? 0 : v || (r() < 0.25 ? 1 : 0)));
    this.song = { root, prog, arp, bassPat, lead: r() < 0.5 ? 'square' : 'sawtooth' };
    this.bpm = bpm;
  }
  setBpm(b) { this.bpm = b; }
  start() { if (!this.ctx) return; if (!this.playing) { this.playing = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.06; } }
  stop() { this.playing = false; }
  // current position in beats on the music grid (for visual pulses)
  beatPos() {
    if (!this.ctx || !this.playing) return -1;
    const dur = 60 / this.bpm / 4;
    return (this.step - (this.nextT - this.ctx.currentTime) / dur) / 4;
  }
  setIntensity(x) { this.intensity = Math.max(0, Math.min(1, x)); }

  chordTones(bar) {
    const s = this.song; const deg = s.prog[bar % 4];
    return [0, 2, 4].map((k) => { const i = deg + k; return s.root + MINOR[i % 7] + 12 * Math.floor(i / 7); });
  }
  tick() {
    const c = this.ctx;
    if (!c || !this.playing || !this.song) return;
    const dur = 60 / this.bpm / 4;
    if (this.nextT < c.currentTime - 0.2) this.nextT = c.currentTime + 0.02;
    while (this.nextT < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextT, dur);
      this.nextT += dur; this.step++;
    }
  }
  playStep(step, t, dur) {
    const s16 = step % 16, bar = Math.floor(step / 16);
    const ch = this.chordTones(bar);
    const I = this.intensity;
    const bus = this.musicBus;
    if (s16 % 4 === 0) this.kick(t, bus);
    if (s16 === 4 || s16 === 12) this.clap(t, bus, 0.32);
    if (s16 % 2 === 1 || (I > 0.5 && s16 % 4 === 2)) this.hat(t, bus, s16 % 4 === 2 ? 0.05 : 0.08, s16 % 4 === 2 ? 0.05 : 0.11);
    if (this.song.bassPat[s16]) this.bass(mtof(ch[0] - 12), t, dur * 0.9, bus);
    const [ti, oct] = this.song.arp[s16];
    const n = ch[ti] + 12 + 12 * oct;
    this.pluck(mtof(n), t, dur * 1.6, 0.045 + I * 0.03, 900 + I * 4200, bus, this.song.lead, true);
    if (s16 === 0) this.pad(ch, t, dur * 16, bus);
  }

  // ---- voices
  osc(type, f, t, dur, vol, bus, slideTo = 0, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  noiseHit(t, dur, f, vol, type, bus, sweep = 0, q = 1) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  kick(t, bus) { this.osc('sine', 150, t, 0.32, 0.9, bus, 42, 0.002); this.noiseHit(t, 0.02, 3000, 0.12, 'highpass', bus); }
  clap(t, bus, v) { for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 0.09 + i * 0.03, 1600, v, 'bandpass', bus, 0, 1.4); }
  hat(t, bus, dur, v) { this.noiseHit(t, dur, 8000, v, 'highpass', bus); }
  bass(f, t, dur, bus) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.Q.value = 6; fl.frequency.setValueAtTime(260 + this.intensity * 500, t); fl.frequency.exponentialRampToValueAtTime(120, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  pluck(f, t, dur, vol, cut, bus, type = 'square', echo = false) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    fl.type = 'lowpass'; fl.Q.value = 3; fl.frequency.setValueAtTime(cut, t); fl.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.25), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(bus); if (echo) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }
  pad(ch, t, dur, bus) {
    const c = this.ctx;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 700 + this.intensity * 900;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.4); g.gain.setValueAtTime(0.035, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    fl.connect(g).connect(bus);
    for (const n of ch) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(fl); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // ---- music shaping
  muffle(to = 500, back = 0.6) {
    if (!this.ctx) return; const f = this.musicFilt.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(to, t + 0.04); f.exponentialRampToValueAtTime(18000, t + back);
  }
  bands(n) {
    const out = new Array(n).fill(0);
    if (!this.ctx || !this.analyser) return out;
    this.analyser.getByteFrequencyData(this.freq);
    const L = this.freq.length;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.pow(i / n, 1.6) * (L - 2)), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.6) * (L - 2)));
      let s = 0; for (let k = a; k < b; k++) s += this.freq[k];
      out[i] = s / (b - a) / 255;
    }
    return out;
  }

  // ---- effects
  play(name, arg = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, bus = this.sfxBus;
    switch (name) {
      case 'graze': {
        const k = Math.min(arg, 14);
        const n = (this.song ? this.song.root : 45) + 24 + PENTA[k % 5] + 12 * Math.floor(k / 5);
        this.osc('triangle', mtof(n), t, 0.11, 0.16, bus, mtof(n) * 1.02);
        this.osc('sine', mtof(n + 12), t, 0.07, 0.05, bus);
        this.noiseHit(t, 0.04, 7000, 0.06, 'highpass', bus);
        break;
      }
      case 'scrape': this.noiseHit(t, 0.05, 5200, 0.025, 'bandpass', bus, 0, 4); break;
      case 'mult': [0, 4, 7].forEach((s, i) => this.osc('square', mtof(72 + s + Math.min(arg, 10)), t + i * 0.05, 0.12, 0.05, bus)); break;
      case 'ready':
        this.osc('sine', 880, t, 0.25, 0.12, bus, 1760); this.osc('triangle', 1320, t + 0.06, 0.3, 0.08, bus, 2640);
        break;
      case 'phase':
        this.osc('sine', 110, t, 0.9, 0.95, bus, 30, 0.003);
        this.osc('square', 220, t, 0.25, 0.12, bus, 55);
        this.noiseHit(t, 0.7, 6000, 0.35, 'lowpass', bus, 180);
        this.noiseHit(t, 0.25, 1200, 0.25, 'bandpass', bus, 4000, 2);
        this.muffle(700, 0.7);
        break;
      case 'phaseThrough': this.osc('sine', 70, t, 0.3, 0.5, bus, 35); this.noiseHit(t, 0.15, 2500, 0.15, 'bandpass', bus, 600); break;
      case 'death':
        this.noiseHit(t, 0.45, 3000, 0.5, 'bandpass', bus, 150, 0.8);
        this.osc('sawtooth', 300, t, 0.35, 0.2, bus, 45);
        this.osc('sine', 90, t, 0.4, 0.6, bus, 30);
        this.muffle(350, 0.65);
        break;
      case 'portal': this.osc('sine', 300, t, 0.3, 0.16, bus, 1100); this.noiseHit(t, 0.3, 800, 0.12, 'bandpass', bus, 5000, 2); break;
      case 'tier':
        this.noiseHit(t, 0.6, 400, 0.18, 'bandpass', bus, 9000, 2);
        [0, 7, 12, 19].forEach((s, i) => this.osc('sawtooth', mtof(57 + s), t + 0.45 + i * 0.03, 0.4, 0.06, bus));
        break;
      case 'finish': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.osc('square', mtof(64 + s), t + i * 0.07, 0.3, 0.07, bus)); break;
      case 'best': [0, 7, 12].forEach((s, i) => this.osc('triangle', mtof(76 + s), t + i * 0.09, 0.3, 0.1, bus)); break;
      case 'click': this.osc('triangle', 660, t, 0.06, 0.1, bus, 990); break;
      case 'buy': [0, 5, 9, 12].forEach((s, i) => this.osc('triangle', mtof(79 + s), t + i * 0.05, 0.18, 0.1, bus)); break;
      case 'mission': [0, 4, 7, 11, 14].forEach((s, i) => this.osc('triangle', mtof(74 + s), t + i * 0.06, 0.25, 0.09, bus)); break;
      case 'check': this.osc('sine', 1046, t, 0.15, 0.1, bus); this.osc('sine', 1568, t + 0.05, 0.2, 0.08, bus); break;
      case 'combolost': this.osc('triangle', 330, t, 0.18, 0.06, bus, 160); break;
    }
  }
}
