// WebAudio: synthesized pops, gulps, ticks, fanfares and a little marimba loop. Nothing loaded from disk.
export const Sfx = {
  ctx: null, out: null, muted: false, last: 0, step: 0, nextT: 0, tempo: 112, music: false, timer: 0,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    this.out = this.ctx.createGain(); this.out.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor(); this.out.connect(comp); comp.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.sched(), 60);
  },
  setMute(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.8; },
  tone(f, f2, dur, vol, type = 'sine', when = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  },
  thud(vol, freq = 300, dur = 0.25) {
    const c = this.ctx; if (!c) return; const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur);
  },
  pop(size, combo) {
    if (!this.ctx) return; const now = this.ctx.currentTime; if (now - this.last < 0.035) return; this.last = now;
    const base = 720 / (1 + size * 0.7) * Math.pow(1.03, Math.min(combo, 24));
    this.tone(base * 1.6, base * 0.5, 0.13 + size * 0.05, 0.14, 'triangle');
    if (size > 1.3) this.thud(Math.min(0.5, 0.12 * size), 500, 0.3 + size * 0.05);
  },
  gulp() { this.tone(260, 50, 0.6, 0.3, 'sawtooth'); this.thud(0.6, 900, 0.5); this.tone(520, 900, 0.25, 0.12, 'square', 0.12); },
  hurt() { this.tone(400, 70, 0.8, 0.25, 'sawtooth'); this.thud(0.5, 300, 0.6); },
  grow() { [523, 659, 784].forEach((f, i) => this.tone(f, f * 1.01, 0.18, 0.1, 'triangle', i * 0.06)); },
  tick(hi) { this.tone(hi ? 1320 : 880, hi ? 1300 : 860, 0.08, 0.12, 'square'); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, f, 0.3, 0.13, 'triangle', i * 0.11)); },
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.35, 0.12, 'triangle', i * 0.16)); },
  sched() {
    const c = this.ctx; if (!c || !this.music) return;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    const N = [0, 2, 4, 7, 9, 12, 14, 16], pat = [0, 4, 2, 5, 3, 6, 4, 7, 1, 4, 2, 6, 5, 3, 4, 0], bass = [0, 0, 5, 3];
    while (this.nextT < c.currentTime + 0.2) {
      const sp = 60 / this.tempo / 2, s = this.step++, t = this.nextT - c.currentTime;
      const f = 392 * Math.pow(2, N[pat[s % 16]] / 12); this.tone(f, f, 0.22, 0.035, 'sine', t); this.tone(f * 4, f * 4, 0.05, 0.008, 'sine', t);
      if (s % 4 === 0) { const b = 98 * Math.pow(2, N[bass[(s >> 4) % 4]] / 12); this.tone(b, b, 0.35, 0.06, 'triangle', t); }
      if (s % 2 === 1) this.tone(5000, 3000, 0.02, 0.006, 'square', t);
      this.nextT += sp;
    }
  },
};
