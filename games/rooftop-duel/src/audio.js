// All sound is synthesised with WebAudio - no files.
export const Sfx = {
  ctx: null, out: null, muted: false, nb: null, music: null, step: 0, next: 0,
  init() {
    if (this.ctx || this.muted) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
      const comp = this.ctx.createDynamicsCompressor(); comp.connect(this.ctx.destination);
      this.out = this.ctx.createGain(); this.out.gain.value = 0.55; this.out.connect(comp);
      const n = this.ctx.sampleRate; this.nb = this.ctx.createBuffer(1, n, n);
      const d = this.nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      // city wind bed
      const w = this.ctx.createBufferSource(); w.buffer = this.nb; w.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = this.ctx.createGain(); g.gain.value = 0.05; w.connect(f).connect(g).connect(this.out); w.start();
      setInterval(() => this.tick(), 60);
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.55; if (!m) this.init(); },
  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; },
  noise(dur, freq, type = 'bandpass', gain = 0.5, q = 1, t0 = 0) {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime + t0;
    const s = c.createBufferSource(); s.buffer = this.nb; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  tone(f0, f1, dur, type = 'sine', gain = 0.3, t0 = 0) {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  },
  shot(k) {
    if (k === 'shotgun') { this.noise(0.35, 900, 'lowpass', 0.9); this.tone(140, 45, 0.25, 'sine', 0.5); }
    else if (k === 'sniper') { this.noise(0.6, 2400, 'bandpass', 0.8, 0.7); this.tone(900, 60, 0.4, 'triangle', 0.25); this.noise(0.9, 300, 'lowpass', 0.3, 1, 0.05); }
    else if (k === 'smg') { this.noise(0.07, 2600, 'bandpass', 0.45, 1.2); this.tone(260, 90, 0.05, 'square', 0.08); }
    else if (k === 'boom') { this.tone(220, 70, 0.25, 'sawtooth', 0.18); this.noise(0.25, 600, 'lowpass', 0.4); }
    else { this.noise(0.2, 1700, 'bandpass', 0.7, 0.8); this.tone(200, 55, 0.18, 'sine', 0.45); }
  },
  boom() { this.noise(0.9, 320, 'lowpass', 1); this.tone(90, 28, 0.7, 'sine', 0.7); },
  hit() { this.tone(240, 80, 0.1, 'square', 0.18); this.noise(0.08, 700, 'lowpass', 0.5); },
  ding() { this.noise(0.05, 4000, 'highpass', 0.15); this.tone(1400, 900, 0.08, 'triangle', 0.06); },
  jump() { this.tone(260, 560, 0.12, 'triangle', 0.15); },
  land() { this.noise(0.09, 450, 'lowpass', 0.35); },
  fall() { this.tone(1300, 160, 1.4, 'sine', 0.18); },
  bell() { [880, 1320].forEach((f, i) => this.tone(f, f * 0.99, 0.6, 'triangle', 0.15, i * 0.12)); },
  ko() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.25, 'square', 0.07, i * 0.09)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, f * 0.97, 0.35, 'triangle', 0.12, i * 0.16)); },
  click() { this.tone(700, 500, 0.05, 'square', 0.06); },
  // tiny bass + hat groove while a match runs
  tick() {
    if (!this.ok() || !this.music) return; const c = this.ctx;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    const BASS = [55, 0, 55, 65.4, 0, 49, 55, 0, 73.4, 0, 65.4, 0, 49, 0, 41.2, 49];
    while (this.next < c.currentTime + 0.2) {
      const t0 = this.next - c.currentTime, s = this.step % 16, f = BASS[s];
      if (f) this.tone(f * 2, f * 1.98, 0.17, 'sawtooth', 0.045, t0);
      if (s % 2 === 0) this.noise(0.03, 8000, 'highpass', s % 4 === 0 ? 0.06 : 0.03, 1, t0);
      if (s % 8 === 4) this.noise(0.12, 1500, 'bandpass', 0.12, 0.8, t0);
      if (s % 8 === 0) this.tone(120, 45, 0.15, 'sine', 0.22, t0);
      this.step++; this.next += 60 / 112 / 4;
    }
  },
};
