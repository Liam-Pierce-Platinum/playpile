// All sound is synthesised with WebAudio, no files. SFX are tiny one-shot
// graphs (rate-limited so a 5-way gun does not turn into noise); the music is
// a 132 bpm minor synth loop whose layers open up as the run heats up.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 3, 5, 7, 10];

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.last = {};
    this.playing = false; this.step = 0; this.nextT = 0; this.bpm = 132; this.intensity = 0;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5;
    this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(this.comp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    this.musF = c.createBiquadFilter(); this.musF.type = 'lowpass'; this.musF.frequency.value = 1200; this.musF.connect(this.mus);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // black-hole hum, always running, gain driven by active holes
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 46;
    this.humF = c.createBiquadFilter(); this.humF.type = 'lowpass'; this.humF.frequency.value = 180;
    this.humG = c.createGain(); this.humG.gain.value = 0;
    this.hum.connect(this.humF).connect(this.humG).connect(this.sfx); this.hum.start();
    this.timer = setInterval(() => this.tick(), 25);
  }
  setMuted(m) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02); }
  limit(key, ms) { const now = performance.now(); if (this.last[key] && now - this.last[key] < ms) return false; this.last[key] = now; return true; }

  osc(type, f0, f1, dur, gain, when = 0, dest = this.sfx) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  nz(dur, gain, f0, f1, q = 0.7, when = 0, type = 'lowpass', dest = this.sfx) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  play(ev) {
    if (!this.ctx || this.muted) return;
    switch (ev.type) {
      case 'shoot': if (this.limit('shoot', 70)) { this.osc('square', 1500, 500, 0.05, 0.022); this.nz(0.04, 0.03, 6000, 2000, 0.7, 0, 'highpass'); } break;
      case 'kill': {
        if (!this.limit('kill', 28)) break;
        const big = ev.kind === 'hole' || ev.kind === 'snake';
        this.nz(big ? 0.7 : 0.28, big ? 0.5 : 0.22, big ? 2600 : 4200, 120, 1);
        this.osc('sine', big ? 160 : 220 + Math.random() * 60, 40, big ? 0.5 : 0.18, big ? 0.45 : 0.16);
        if (ev.chain > 4 && this.limit('chain', 90)) this.osc('triangle', mtof(72 + PENTA[ev.chain % 5] + 12 * Math.min(2, Math.floor(ev.chain / 10))), 0, 0.08, 0.04);
        break;
      }
      case 'geom': if (this.limit('geom', 22)) { const m = Math.min(ev.mult, 60); this.osc('sine', mtof(79 + PENTA[m % 5] + 12 * Math.floor((m % 15) / 5)), 0, 0.07, 0.05); } break;
      case 'spawn': if (this.limit('spawn', 120)) this.osc('sine', 180, 700, 0.25, 0.03); break;
      case 'bomb':
        this.nz(1.6, 0.9, 5000, 60, 1); this.osc('sine', 110, 28, 1.2, 0.8); this.osc('sawtooth', 220, 40, 0.8, 0.15);
        break;
      case 'death':
        this.nz(1.4, 0.8, 3000, 50, 1); this.osc('sawtooth', 600, 30, 1.3, 0.25); this.osc('sine', 90, 25, 1.0, 0.7);
        break;
      case 'respawn': this.osc('triangle', 300, 1200, 0.35, 0.12); break;
      case 'wave': [0, 7, 12].forEach((n, i) => this.osc('square', mtof(64 + n), 0, 0.12, 0.05, i * 0.07)); break;
      case 'extra': [0, 4, 7, 12, 16].forEach((n, i) => this.osc('triangle', mtof(72 + n), 0, 0.16, 0.12, i * 0.06)); break;
      case 'powerup': [0, 5, 10, 15].forEach((n, i) => this.osc('square', mtof(67 + n), 0, 0.1, 0.06, i * 0.05)); break;
      case 'holeOn': this.osc('sawtooth', 70, 140, 0.4, 0.18); break;
      case 'holeHit': if (this.limit('holeHit', 60)) this.osc('square', 140 + Math.random() * 30, 90, 0.05, 0.05); break;
      case 'feed': if (this.limit('feed', 50)) this.osc('sine', 300, 60, 0.2, 0.15); break;
      case 'overload': this.nz(1.0, 0.7, 6000, 200, 2); this.osc('sawtooth', 50, 800, 0.4, 0.2); break;
      case 'over': [12, 7, 3, 0].forEach((n, i) => this.osc('triangle', mtof(60 + n), 0, 0.3, 0.12, i * 0.14)); break;
      case 'ui': this.osc('triangle', 900, 1300, 0.06, 0.06); break;
    }
  }
  setHum(n) { if (this.ctx) this.humG.gain.setTargetAtTime(Math.min(0.12, n * 0.05), this.ctx.currentTime, 0.1); }

  // ------------------------------------------------------------ music
  startMusic() { if (!this.ctx) return; if (!this.playing) { this.playing = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.05; } }
  stopMusic() { this.playing = false; }
  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, x));
    if (this.ctx) this.musF.frequency.setTargetAtTime(900 + this.intensity * 6000, this.ctx.currentTime, 0.4);
  }
  tick() {
    const c = this.ctx;
    if (!c || !this.playing) return;
    const dur = 60 / this.bpm / 4;
    if (this.nextT < c.currentTime - 0.2) this.nextT = c.currentTime + 0.02;
    while (this.nextT < c.currentTime + 0.12) { this.note(this.step, this.nextT - c.currentTime, dur); this.step++; this.nextT += dur; }
  }
  note(s, when, dur) {
    if (this.muted) return;
    const bar = Math.floor(s / 16) % 4, i = s % 16, I = this.intensity, M = this.musF;
    const roots = [33, 33, 29, 31]; // A A F G
    const root = roots[bar];
    // kick
    if (i % 4 === 0) this.osc('sine', 150, 40, 0.22, 0.9, when, M);
    // offbeat bass
    if (i % 2 === 1 || (i % 4 === 2 && I > 0.3)) this.osc('sawtooth', mtof(root + (i % 8 === 7 ? 12 : 0)), mtof(root), dur * 0.9, 0.22, when, M);
    // hats
    if (I > 0.15 && i % 2 === 0) this.nz(0.04, i % 4 === 2 ? 0.12 : 0.05, 9000, 7000, 1, when, 'highpass', M);
    // snare
    if (I > 0.35 && (i === 4 || i === 12)) this.nz(0.16, 0.3, 3000, 900, 0.8, when, 'bandpass', M);
    // arp
    if (I > 0.5) {
      const arp = [0, 7, 12, 15, 12, 7, 3, 7];
      this.osc('square', mtof(root + 36 + arp[i % 8]), mtof(root + 36 + arp[i % 8]), dur * 0.8, 0.045, when, M);
    }
  }
}
