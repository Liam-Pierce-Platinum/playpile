// All sound is synthesised. Nothing loads until the first tap.
export const Audio = {
  ctx: null, master: null, muted: false, musicOn: true, noise: null, _musicT: 0, _step: 0, timer: 0,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.16; this.mus.connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    this._musicT = c.currentTime + 0.2;
    this.timer = setInterval(() => this.tick(), 60);
  },
  // Called from every tap/key. Creating an AudioContext can block for a long time on some
  // machines (seconds headless, 100+ ms with some Bluetooth outputs), so it is never done inside
  // the tap that starts play: the first frame of the hole paints first, sound comes up just after.
  // A context created outside a gesture starts suspended on iOS; the next tap resumes it.
  warm() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    if (this._warm) return;
    this._warm = requestAnimationFrame(() => setTimeout(() => this.init(), 0));
  },
  apply() { if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; },
  setMuted(m) { this.muted = m; this.apply(); },
  pause(on) { const c = this.ctx; if (!c) return; try { on ? c.suspend() : c.resume(); } catch (e) { /* fine */ } },

  tone(f, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.004, bus } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  hiss(dur, { vol = 0.3, at = 0, f = 2000, q = 1, type = 'bandpass', f2 = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },

  putt(p) { this.tone(1100 + p * 300, 0.06, { type: 'triangle', vol: 0.35 + p * 0.3 }); this.tone(220, 0.09, { vol: 0.3 + p * 0.3, slide: 0.6 }); this.hiss(0.08, { vol: 0.2 + p * 0.25, f: 3000, q: 0.8 }); },
  wall(p) { const v = Math.min(1, p / 900); this.tone(520 + v * 380, 0.07, { type: 'square', vol: 0.06 + v * 0.14, slide: 0.7 }); this.hiss(0.04, { vol: 0.1 + v * 0.2, f: 1800, q: 2 }); },
  blade(p) { this.tone(300, 0.1, { type: 'sawtooth', vol: 0.12, slide: 0.5 }); this.hiss(0.06, { vol: 0.25, f: 900 }); },
  bumper() { this.tone(330, 0.18, { type: 'sine', vol: 0.4, slide: 2.2 }); this.tone(660, 0.12, { type: 'triangle', vol: 0.15, slide: 1.6, at: 0.02 }); },
  sand() { this.hiss(0.25, { vol: 0.3, f: 1200, q: 0.6, f2: 500 }); },
  splash() { this.hiss(0.5, { vol: 0.5, f: 1400, q: 0.7, f2: 300, type: 'lowpass' }); this.tone(500, 0.25, { vol: 0.2, slide: 0.4 }); for (let i = 0; i < 4; i++) this.tone(900 + Math.random() * 900, 0.06, { vol: 0.08, at: 0.08 + i * 0.07 }); },
  portal() { this.tone(300, 0.35, { type: 'sine', vol: 0.3, slide: 4 }); this.tone(450, 0.35, { type: 'triangle', vol: 0.12, slide: 3, at: 0.05 }); },
  lip() { for (let i = 0; i < 3; i++) this.tone(1500 - i * 200, 0.05, { type: 'square', vol: 0.08, at: i * 0.05 }); },
  sink(big) {
    this.tone(180, 0.25, { vol: 0.5, slide: 0.5 });
    this.hiss(0.1, { vol: 0.3, f: 700, at: 0.02 });
    [0, 4, 7, 12].forEach((n, i) => this.tone(523 * 2 ** (n / 12), 0.3, { type: 'triangle', vol: 0.18, at: 0.12 + i * 0.07 }));
    if (big) [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(659 * 2 ** (n / 12), 0.35, { type: 'square', vol: 0.06, at: 0.45 + i * 0.06 }));
    if (big) this.hiss(1.2, { vol: 0.15, f: 3000, q: 0.4, at: 0.3 });
  },
  star(i) { this.tone(880 * 2 ** ((i * 4) / 12), 0.25, { type: 'triangle', vol: 0.25 }); this.tone(1760 * 2 ** ((i * 4) / 12), 0.15, { type: 'sine', vol: 0.1, at: 0.03 }); },
  click() { this.tone(900, 0.04, { type: 'triangle', vol: 0.15 }); },
  fail() { this.tone(330, 0.25, { type: 'triangle', vol: 0.2, slide: 0.7 }); this.tone(247, 0.35, { type: 'triangle', vol: 0.2, slide: 0.7, at: 0.18 }); },
  tick2() { this.tone(1400, 0.02, { type: 'square', vol: 0.03 }); },

  // light, bouncy loop: I - vi - IV - V in C, plucks + soft bass, 104 bpm
  tick() {
    const c = this.ctx; if (!c || !this.musicOn) return;
    const spb = 60 / 104 / 2;
    // after a throttled background tab, skip the missed beats instead of firing them all at once
    if (this._musicT < c.currentTime) this._musicT = c.currentTime + 0.05;
    const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
    const mel = [76, 72, 74, 76, 79, 76, 74, 72, 72, 69, 72, 74, 76, 74, 72, 69, 69, 72, 74, 72, 77, 76, 74, 72, 71, 74, 76, 79, 77, 74, 71, 74];
    while (this._musicT < c.currentTime + 0.3) {
      const s = this._step, bar = Math.floor(s / 8) % 4, ch = chords[bar];
      const at = this._musicT - c.currentTime;
      const hz = (m) => 440 * 2 ** ((m - 69) / 12);
      if (s % 8 === 0) this.tone(hz(ch[0] - 24), spb * 3.5, { type: 'triangle', vol: 0.5, at, bus: this.mus, attack: 0.01 });
      if (s % 8 === 4) this.tone(hz(ch[0] - 17), spb * 1.8, { type: 'triangle', vol: 0.35, at, bus: this.mus });
      if (s % 2 === 1) this.tone(hz(ch[(s >> 1) % 3]), spb * 0.9, { type: 'sine', vol: 0.18, at, bus: this.mus });
      if (s % 2 === 0 && (s % 16) !== 14) this.tone(hz(mel[(s >> 1) % 32]), spb * 1.6, { type: 'triangle', vol: 0.22, at, bus: this.mus });
      this._musicT += spb; this._step++;
    }
  },
};
