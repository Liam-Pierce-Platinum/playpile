// Every sound is synthesised with WebAudio. Each level gets its own track
// generated from its tempo, key, chord progression and arpeggio shape, and the
// track is started at the exact moment the run starts, so the beat you hear
// is the beat the course was built on (4 blocks per beat).
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROGS = [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 6], [0, 6, 5, 4], [0, 5, 3, 6], [0, 2, 5, 4]];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.song = null; this.timer = 0;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // shared echo for the lead
    this.delay = c.createDelay(1); this.fb = c.createGain(); this.fb.gain.value = 0.3;
    this.wet = c.createGain(); this.wet.gain.value = 0.25;
    this.delay.connect(this.fb).connect(this.delay); this.delay.connect(this.wet).connect(this.master);
    this.timer = setInterval(() => this.tick(), 25);
  }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  // ---- music ---------------------------------------------------------------
  // offset: seconds into the track to start from (practice checkpoints)
  play(def, offset = 0, opts = {}) {
    if (!this.ctx) return;
    this.stop(0.01);
    const c = this.ctx;
    const bus = c.createGain(); bus.gain.value = opts.vol ?? 0.62; bus.connect(this.master);
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = opts.muffle ? 900 : 16000;
    filt.connect(bus);
    const sd = 60 / def.bpm / 4;
    let step = Math.max(0, Math.floor(offset / sd + 1e-6));
    const t0 = c.currentTime + 0.03 - offset; // audio time of song position 0
    this.delay.delayTime.value = sd * 3;
    this.song = { def, sd, step, t0, bus, filt, menu: !!opts.menu, prog: PROGS[def.prog % PROGS.length] };
    this.tick();
  }
  stop(fade = 0.08) {
    if (!this.song || !this.ctx) { this.song = null; return; }
    const { bus } = this.song;
    const t = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => bus.disconnect(), fade * 1000 + 400);
    this.song = null;
  }
  muffle(on) { if (this.song && this.ctx) this.song.filt.frequency.setTargetAtTime(on ? 700 : 16000, this.ctx.currentTime, 0.05); }
  // where the music is, in seconds of song time (for the visual pulse)
  songTime() { return this.song && this.ctx ? this.ctx.currentTime - this.song.t0 : -1; }

  tick() {
    const S = this.song, c = this.ctx;
    if (!S || !c) return;
    while (S.t0 + S.step * S.sd < c.currentTime + 0.12) {
      const t = S.t0 + S.step * S.sd;
      if (t >= 0 && t >= c.currentTime - 0.02) this.note(S, S.step, t);
      S.step++;
    }
  }
  chord(S, bar) {
    const deg = S.prog[bar % 4];
    return [0, 2, 4].map((k) => { const i = deg + k; return S.def.root + MINOR[i % 7] + 12 * Math.floor(i / 7); });
  }
  note(S, step, t) {
    const i = step % 16, bar = Math.floor(step / 16), sd = S.sd, out = S.filt;
    const ch = this.chord(S, bar);
    const menu = S.menu;
    const phase = menu ? 9 : bar; // menu loop is always "full"
    const brk = !menu && bar >= 12 && bar % 16 === 14; // a one-bar breather every 16 bars
    // drums
    if (i % 4 === 0 && !brk) this.kick(t, out);
    if (phase >= 2 && (i === 4 || i === 12)) this.snare(t, out, brk ? 0.5 : 1);
    if (phase >= 2 && i % 2 === 0 && !brk) this.hat(t, out, i % 4 === 2 ? 0.5 : 0.25);
    if (phase >= 4 && i % 2 === 1) this.hat(t, out, 0.12);
    if (!menu && bar % 8 === 0 && i === 0 && bar > 0) this.crash(t, out);
    if (!brk && bar % 16 === 15 && i >= 12) this.snare(t, out, 0.5 + (i - 12) * 0.15); // fill
    // bass: rolling offbeat 8ths
    if (phase >= 2 && !brk && i % 2 === 1) this.bass(t, mtof(ch[0] - 12), sd * 1.6, out);
    if (phase >= 2 && !brk && i === 0) this.bass(t, mtof(ch[0] - 12), sd * 1.2, out);
    // arpeggio
    if (phase >= 4) {
      const kind = S.def.arp;
      let n;
      if (kind === 0) n = ch[[0, 1, 2, 1][i % 4]] + 12 * (i >= 8 ? 1 : 0);
      else if (kind === 1) n = ch[[0, 2, 1, 2, 0, 1, 2, 1][i % 8]] + 12;
      else n = ch[[2, 1, 0, 1][i % 4]] + 12 * ((i >> 2) % 2);
      if (!(kind === 2 && i % 4 === 3)) this.lead(t, mtof(n + 12), sd * 0.9, out, phase >= 8 ? 0.11 : 0.08);
    }
    // pad on every bar
    if (i === 0) for (const n of ch) this.pad(t, mtof(n), sd * 16, out);
  }
  osc(type, f, t, dur, vol, out, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    o.env = g;
    return o;
  }
  kick(t, out) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
  }
  noiseHit(t, out, vol, dur, type, freq, q = 1) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  snare(t, out, v = 1) { this.noiseHit(t, out, 0.45 * v, 0.16, 'bandpass', 1800, 0.8); this.osc('triangle', 190, t, 0.08, 0.25 * v, out); }
  hat(t, out, v) { this.noiseHit(t, out, v * 0.5, 0.04, 'highpass', 8000); }
  crash(t, out) { this.noiseHit(t, out, 0.3, 1.2, 'highpass', 5000); }
  bass(t, f, dur, out) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + dur); fl.Q.value = 6;
    g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  lead(t, f, dur, out, vol) {
    const o = this.osc('square', f, t, dur, vol, out);
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.5;
    o.env.connect(g).connect(this.delay);
  }
  pad(t, f, dur, out) {
    for (const det of [-7, 7]) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      fl.type = 'lowpass'; fl.frequency.value = 1200;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // ---- effects -------------------------------------------------------------
  fx(name) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime, out = this.sfxBus;
    if (name === 'die') {
      this.noiseHit(t, out, 0.9, 0.5, 'lowpass', 1400);
      const o = this.osc('sawtooth', 300, t, 0.4, 0.3, out); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    } else if (name === 'orb') {
      this.osc('sine', 880, t, 0.25, 0.25, out); this.osc('sine', 1320, t + 0.03, 0.25, 0.15, out);
    } else if (name === 'flip') {
      const o = this.osc('triangle', 300, t, 0.3, 0.3, out); o.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    } else if (name === 'pad') {
      const o = this.osc('square', 220, t, 0.25, 0.14, out); o.frequency.exponentialRampToValueAtTime(880, t + 0.2);
    } else if (name === 'portal') {
      const o = this.osc('sine', 1400, t, 0.35, 0.22, out); o.frequency.exponentialRampToValueAtTime(300, t + 0.3);
      this.noiseHit(t, out, 0.15, 0.3, 'bandpass', 3000, 2);
    } else if (name === 'check') {
      this.osc('sine', 1046, t, 0.15, 0.2, out); this.osc('sine', 1568, t + 0.07, 0.25, 0.2, out);
    } else if (name === 'uncheck') {
      this.osc('sine', 700, t, 0.12, 0.18, out); this.osc('sine', 450, t + 0.06, 0.15, 0.18, out);
    } else if (name === 'click') {
      this.osc('square', 660, t, 0.06, 0.12, out);
    } else if (name === 'win') {
      [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.osc('square', mtof(72 + n), t + i * 0.07, 0.4, 0.12, out));
      this.noiseHit(t, out, 0.3, 1.5, 'highpass', 4000);
    } else if (name === 'best') {
      [0, 7, 12].forEach((n, i) => this.osc('triangle', mtof(79 + n), t + i * 0.06, 0.3, 0.16, out));
    }
  }
}
