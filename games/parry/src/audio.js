// All synthesised with WebAudio. The music is a drum + bass loop scheduled on
// the chart's own beat grid (so it speeds up with the round), and the effects
// are clangs, shings, whooshes and booms. Game time maps to audio time through
// a single sync point, re-taken on every start / resume.

const ROOTS = [45, 43, 41, 40, 38, 42, 40, 39]; // per stage, MIDI (A2, G2, F2, E2, D2, F#2, E2, D#2)
const PROG = [[0, 0, -4, -2], [0, 3, -4, -2], [0, -2, -4, -5], [0, 0, 3, -2]];
// bass lines, 16 steps a bar: semitones above the bar's root, null = rest
const BASS = [
  [0, null, 12, null, 0, null, 10, null, 0, null, 12, null, 7, null, 10, null],
  [0, null, null, 0, null, null, 12, null, 0, null, 0, null, 10, null, 7, null],
  [0, 0, null, 12, 0, null, 10, 0, null, 0, 12, null, 7, null, 3, null],
  [0, null, 7, null, 12, null, 7, null, 0, null, 7, null, 10, null, 12, 10],
];
const BOSSBASS = [0, 0, 12, 0, 0, 12, 0, 11, 0, 0, 12, 0, 13, 12, 10, 7];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null; this.musicVol = 0.7; this.sfxVol = 0.8; this.musicOn = true; this.sfxOn = true;
    this.offset = 0; this.quiet = false; this.a0 = 0; this.g0 = 0;
  }
  get ok() { return !!this.ctx && this.ctx.state === 'running'; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c; try { c = this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 6; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.Q.value = 0.8;
    this.lp.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.lp);
    this.verb = c.createDelay(); this.verb.delayTime.value = 0.19;
    const fb = c.createGain(); fb.gain.value = 0.3; const wet = c.createGain(); wet.gain.value = 0.22;
    this.verb.connect(fb).connect(this.verb); this.verb.connect(wet).connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.dist = c.createWaveShaper(); const cur = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cur[i] = Math.tanh(x * 3); }
    this.dist.curve = cur; this.dist.connect(this.musicBus);
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.sfxOn && !this.quiet ? this.sfxVol : 0;
    this.musicBus.gain.value = this.musicOn && !this.quiet ? this.musicVol * 0.55 : 0;
  }
  latency() { return this.ctx ? (this.ctx.outputLatency || this.ctx.baseLatency || 0) : 0; }
  sync(gameNow) { if (!this.ctx) return; this.a0 = this.ctx.currentTime; this.g0 = gameNow; this.synced = this.ctx.state === 'running'; }
  at(gameT) { return this.a0 + (gameT - this.g0) - this.latency() + this.offset; }
  pause() { this.paused = true; if (this.ctx && this.ctx.state === 'running') return this.ctx.suspend(); return Promise.resolve(); }
  resume() { this.paused = false; this.synced = false; if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume().catch(() => {}); return Promise.resolve(); }
  duck(on) { // low-pass sweep for slow-mo moments
    if (!this.ctx) return; const t = this.ctx.currentTime, f = this.lp.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t);
    if (on) { f.exponentialRampToValueAtTime(700, t + 0.04); f.exponentialRampToValueAtTime(18000, t + 0.5); }
  }
  silenceMusic() { if (!this.ctx) return; this.cut = this.ctx.currentTime; }

  // ---- primitives ----
  tone(f, t, dur, type, vol, bus, slide = 0, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  hiss(t, dur, f, vol, bus, type = 'bandpass', q = 1, sweep = 0) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- music: one 16th step ----
  step(gameT, info) {
    if (!this.ok || !this.musicOn || this.quiet) return;
    const t = Math.max(this.ctx.currentTime, this.at(gameT));
    const M = this.musicBus, s = info.step, I = info.inten, ph = info.phase, st = Math.max(0, info.stage);
    const root = ROOTS[st % ROOTS.length] + PROG[st % PROG.length][info.bar % 4];
    const kick = (v = 1) => { this.tone(155, t, 0.32, 'sine', 0.9 * v, M, 0.27, 0.002); this.tone(60, t, 0.12, 'triangle', 0.4 * v, M); };
    const snare = (v = 1) => { this.hiss(t, 0.16, 2200, 0.55 * v, M, 'bandpass', 0.7); this.tone(200, t, 0.09, 'triangle', 0.32 * v, M, 0.6); };
    const hat = (v = 1, open = false) => this.hiss(t, open ? 0.14 : 0.035, 8000, 0.22 * v, M, 'highpass', 1);
    const bass = (semi, v = 1, dur = 0.16) => {
      const f = mtof(root + semi);
      const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f / 2;
      fl.type = 'lowpass'; fl.Q.value = 6; fl.frequency.setValueAtTime(240 + 900 * v, t); fl.frequency.exponentialRampToValueAtTime(180, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); o2.connect(fl); fl.connect(g).connect(M);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    };
    const pluck = (semi, v = 1) => { this.tone(mtof(root + 24 + semi), t, 0.22, 'triangle', 0.13 * v, M); this.tone(mtof(root + 36 + semi), t, 0.08, 'square', 0.025 * v, M); };
    const stab = (v = 1) => { for (const k of [0, 7, 12]) this.tone(mtof(root + 12 + k), t, 0.5, 'sawtooth', 0.07 * v, this.dist, 0, 0.01); };

    if (ph === 'count') {
      if (info.bar === 0) { if (s % 4 === 0) hat(0.7); if (s === 0) kick(0.8); if (s === 8) kick(0.6); }
      else if (s % 4 === 0) { this.tone(1800, t, 0.05, 'square', 0.12, M); this.hiss(t, 0.04, 4000, 0.3, M, 'bandpass', 3); if (s === 12) hat(0.8, true); }
      return;
    }
    if (ph === 'out') { if (s === 0 && info.bar === info.outBar) { for (const k of [0, 4, 7, 12]) this.tone(mtof(root + 24 + k), t + k * 0.012, 1.4, 'triangle', 0.1, M); } return; }
    if (ph === 'bossIntro') {
      if (s === 0) { kick(1.3); this.tone(mtof(root - 12), t, 2.4, 'sawtooth', 0.25, this.dist); this.hiss(t, 1.4, 600, 0.4, M, 'lowpass', 1, 0.2); }
      if (s >= 12) { this.tone(120 + s * 12, t, 0.12, 'triangle', 0.3, M, 0.7); }
      return;
    }
    if (ph === 'final') { if (s === 0) { kick(1.4); stab(1.4); this.hiss(t, 1.2, 5000, 0.3, M, 'highpass'); } return; }
    if (ph === 'boss') {
      if (s % 4 === 0) kick(1.1); if (s === 6 || s === 14) kick(0.6);
      if (s === 4 || s === 12) snare(1.1);
      if (s % 2 === 1) hat(0.8); if (s === 14) hat(0.8, true);
      if (s === 0) stab(1);
      if (BOSSBASS[s] != null) bass(BOSSBASS[s] - 12, 1, 0.12);
      if (info.bar % 4 === 3 && s >= 12) this.tone(160 - (s - 12) * 20, t, 0.14, 'sine', 0.45, M, 0.5);
      return;
    }
    // waves
    const bl = BASS[(st + Math.floor(info.bar / 8)) % BASS.length];
    if (s === 0 || s === 8 || (I >= 2 && s === 10) || (I >= 3 && s === 6)) kick();
    if (I >= 1 && (s === 4 || s === 12)) snare();
    if (I >= 2 && s === 15) snare(0.25);
    if (s % 2 === 0) hat(s % 4 === 2 ? 0.9 : 0.5);
    if (I >= 3 && s % 2 === 1) hat(0.3);
    if (bl[s] != null && (I >= 1 || s % 4 === 0)) bass(bl[s] - 12, I >= 2 ? 1 : 0.7);
    if (I >= 2 && s % 4 === 2) { const arp = [0, 7, 12, 15, 12, 7, 10, 3]; pluck(arp[(s / 2 + info.bar * 2) % 8 | 0], I >= 3 ? 1.1 : 0.8); }
    if (I >= 3 && s === 0 && info.bar % 2 === 0) this.hiss(t, 0.5, 6000, 0.12, M, 'highpass');
  }

  // ---- effects ----
  play(name, v = 1, p = 1) {
    if (!this.ok || !this.sfxOn || this.quiet) return;
    const t = this.ctx.currentTime, S = this.sfxBus;
    switch (name) {
      case 'good': // shield clang
        for (const f of [520, 787, 1210]) this.tone(f * p, t, 0.28, 'square', 0.06 * v, S);
        this.tone(330 * p, t, 0.22, 'triangle', 0.25 * v, S, 0.8);
        this.hiss(t, 0.09, 3200, 0.5 * v, S, 'bandpass', 1.5); break;
      case 'perfect':
        for (const f of [880, 1320, 1975, 2637]) this.tone(f * p, t, 0.55, 'triangle', 0.09 * v, S);
        this.tone(1760 * p, t, 0.7, 'sine', 0.12 * v, this.verb);
        this.tone(140, t, 0.4, 'sine', 0.7 * v, S, 0.4);
        this.hiss(t, 0.3, 6000, 0.4 * v, S, 'highpass', 1, 0.4); break;
      case 'miss':
        this.tone(110, t, 0.35, 'sawtooth', 0.35 * v, S, 0.5); this.tone(70, t, 0.4, 'sine', 0.7 * v, S, 0.6);
        this.hiss(t, 0.25, 900, 0.7 * v, S, 'lowpass', 1); break;
      case 'whiff': this.hiss(t, 0.12, 1400, 0.25 * v, S, 'bandpass', 2, 2.5); break;
      case 'feint': this.tone(1400, t, 0.12, 'square', 0.06, S, 0.6); this.hiss(t, 0.14, 2000, 0.2, S, 'bandpass', 2, 0.5); break;
      case 'boom': this.tone(90, t, 0.7, 'sine', 0.9 * v, S, 0.3); this.hiss(t, 0.8, 1200, 0.9 * v, S, 'lowpass', 0.8, 0.15); break;
      case 'pop': this.hiss(t, 0.3, 900, 0.5 * v, S, 'lowpass', 1, 0.3); this.tone(240, t, 0.15, 'square', 0.12 * v, S, 0.4); break;
      case 'grind': this.hiss(t, 0.18, 1800 * p, 0.25 * v, S, 'bandpass', 4); break;
      case 'twang': this.tone(420 * p, t, 0.12, 'triangle', 0.12 * v, S, 0.7); this.hiss(t, 0.1, 3000, 0.12 * v, S, 'bandpass', 2, 0.5); break;
      case 'whoosh': this.hiss(t, 0.3, 500 * p, 0.25 * v, S, 'bandpass', 1.2, 4); break;
      case 'fire': this.hiss(t, 0.5, 400, 0.3 * v, S, 'lowpass', 2, 3); this.tone(80, t, 0.4, 'sawtooth', 0.08 * v, S, 1.6); break;
      case 'roar': this.tone(90, t, 1.1, 'sawtooth', 0.3 * v, this.dist, 0.6, 0.08); this.hiss(t, 1, 500, 0.5 * v, S, 'bandpass', 1, 0.4); break;
      case 'ko':
        this.tone(55, t, 1.6, 'sine', 1, S, 0.5); this.hiss(t, 1.5, 2500, 0.8, S, 'lowpass', 0.7, 0.1);
        for (let i = 0; i < 5; i++) this.tone(523 * Math.pow(1.26, i), t + 0.35 + i * 0.07, 0.4, 'triangle', 0.12, S); break;
      case 'heart': this.tone(392, t, 0.3, 'square', 0.08, S, 0.5); this.tone(196, t + 0.1, 0.4, 'square', 0.08, S, 0.5); break;
      case 'heal': for (let i = 0; i < 3; i++) this.tone(660 * Math.pow(1.335, i), t + i * 0.08, 0.3, 'triangle', 0.13, S); break;
      case 'lose': for (let i = 0; i < 4; i++) this.tone(330 / Math.pow(1.19, i), t + i * 0.16, 0.5, 'triangle', 0.14, S); break;
      case 'win': for (let i = 0; i < 6; i++) this.tone([523, 659, 784, 1047, 784, 1047][i], t + i * 0.09, 0.4, 'triangle', 0.14, S); break;
      case 'star': this.tone(1046 * p, t, 0.4, 'triangle', 0.16, S); this.tone(1568 * p, t + 0.05, 0.4, 'sine', 0.1, S); break;
      case 'click': this.tone(900, t, 0.05, 'square', 0.05, S); break;
      case 'mult': this.tone(660 * p, t, 0.12, 'square', 0.07, S); this.tone(990 * p, t + 0.06, 0.18, 'square', 0.07, S); break;
    }
  }
}
