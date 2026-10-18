// WebAudio: driving techno loop (kick / hat / acid bass) whose tempo follows the zone, plus SFX.
export class Sound {
  constructor(muted) { this.muted = muted; this.ctx = null; this.next = 0; this.n = 0; this.beat = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
      this.out = this.ctx.createGain(); this.out.gain.value = this.muted ? 0 : 0.5; this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.next = this.ctx.currentTime + 0.1;
    } catch { this.ctx = null; }
  }
  toggle() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.5; }
  env(node, t, a, peak, dec) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); node.connect(g); g.connect(this.out); return g; }
  osc(type, f, t, dur, peak, f2) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); this.env(o, t, 0.004, peak, dur); o.start(t); o.stop(t + dur + 0.05); return o; }
  nz(t, dur, peak, type, freq, q = 1) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f); this.env(f, t, 0.003, peak, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return f; }
  tick(bpm) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.beat = Math.max(0, this.beat - 0.05);
    if (!bpm) { this.next = Math.max(this.next, now + 0.05); return; }
    const s16 = 60 / bpm / 4;
    const BASS = [0, 0, 12, 0, 0, 7, 0, 10, 0, 0, 12, 0, 3, 0, 7, 5];
    while (this.next < now + 0.12) {
      const t = this.next, i = this.n % 16;
      if (i % 4 === 0) { this.osc('sine', 150, t, 0.22, 0.9, 42); setTimeout(() => (this.beat = 1), Math.max(0, (t - now) * 1000)); }
      if (i % 4 === 2) this.nz(t, 0.05, 0.18, 'highpass', 8000);
      if (i % 8 === 4) this.nz(t, 0.12, 0.22, 'bandpass', 1800, 0.8);
      if (BASS[i] || i % 2 === 0) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55 * Math.pow(2, BASS[i] / 12);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 9;
        f.frequency.setValueAtTime(1400 + 600 * Math.sin(this.n * 0.07), t); f.frequency.exponentialRampToValueAtTime(180, t + s16 * 1.6);
        o.connect(f); this.env(f, t, 0.004, 0.16, s16 * 1.6); o.start(t); o.stop(t + s16 * 2);
      }
      this.next += s16; this.n++;
    }
  }
  pass() { if (this.ctx) this.nz(this.ctx.currentTime, 0.18, 0.12, 'bandpass', 900 + Math.random() * 400, 2); }
  close() { if (this.ctx) { const t = this.ctx.currentTime; this.osc('square', 1320, t, 0.06, 0.12); this.osc('square', 1760, t + 0.05, 0.08, 0.1); } }
  gem() { if (this.ctx) { const t = this.ctx.currentTime; [880, 1108, 1318, 1760].forEach((f, k) => this.osc('triangle', f, t + k * 0.04, 0.12, 0.18)); } }
  levelUp() { if (this.ctx) { const t = this.ctx.currentTime; this.osc('sawtooth', 220, t, 0.5, 0.15, 1760); this.nz(t, 0.6, 0.15, 'highpass', 3000); } }
  crash() { if (this.ctx) { const t = this.ctx.currentTime; this.nz(t, 0.9, 0.7, 'lowpass', 1200); this.osc('sine', 120, t, 0.7, 0.8, 30); this.osc('square', 300, t, 0.3, 0.15, 40); } }
}
