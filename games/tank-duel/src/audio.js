// All sound is synthesised with WebAudio: no files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.whistleNode = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5;
    this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.comp);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown noise for deep rumbles
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  ok() { return this.ctx && !this.muted; }

  tone(type, f0, f1, dur, vol, when = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit(dur, vol, fStart, fEnd, buf = 'noise', when = 0, q = 0.7) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this[buf];
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fStart, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, fEnd), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  fire(big = 1) {
    this.noiseHit(0.35 * big, 0.9, 2400, 120);
    this.tone('triangle', 150, 45, 0.3 * big, 0.7);
  }
  boom(size) { // size ~ blast radius
    const k = Math.min(2.2, size / 40);
    this.noiseHit(0.5 + 0.5 * k, Math.min(1, 0.55 + 0.25 * k), 1800 + 600 * k, 60, 'noise');
    this.noiseHit(0.9 + 0.7 * k, 0.9, 400, 30, 'brown');
    this.tone('sine', 110 / Math.sqrt(k), 28, 0.5 + 0.4 * k, 0.9);
    if (k > 1.5) this.noiseHit(2.2, 0.7, 260, 25, 'brown', 0.08);
  }
  pop() { this.noiseHit(0.12, 0.5, 3000, 300); this.tone('square', 600, 200, 0.06, 0.12); }
  thud() { this.tone('sine', 90, 40, 0.18, 0.6); this.noiseHit(0.12, 0.4, 600, 80); }
  hit() { this.tone('square', 220, 70, 0.22, 0.25); this.tone('sawtooth', 120, 50, 0.3, 0.2); }
  click() { this.tone('triangle', 900, 700, 0.05, 0.18); }
  tick() { this.tone('square', 1300, 1300, 0.025, 0.06); }
  sizzle(dur = 1.4) { this.noiseHit(dur, 0.25, 5000, 1500, 'noise', 0, 0.3); }
  drill() { this.noiseHit(0.9, 0.35, 900, 300, 'noise', 0, 6); this.tone('sawtooth', 70, 55, 0.9, 0.12); }
  engine() { this.tone('sawtooth', 55, 70, 0.5, 0.15); this.noiseHit(0.5, 0.15, 400, 200, 'brown'); }
  whistleStart() {
    if (!this.ok() || this.whistleNode) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 1400; g.gain.value = 0;
    o.connect(g).connect(this.master); o.start();
    this.whistleNode = { o, g };
  }
  whistle(vy, h) { // falling pitch while descending
    const w = this.whistleNode; if (!w || !this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = vy > 80 ? Math.min(0.07, vy / 9000) : 0;
    w.g.gain.setTargetAtTime(vol, t, 0.05);
    w.o.frequency.setTargetAtTime(500 + Math.max(0, h) * 1.4, t, 0.05);
  }
  whistleStop() {
    const w = this.whistleNode; if (!w) return; this.whistleNode = null;
    try { w.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); w.o.stop(this.ctx.currentTime + 0.1); } catch (e) { /* ignore */ }
  }
  jingle(win) {
    const notes = win ? [523, 659, 784, 1046, 784, 1046] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone(win ? 'square' : 'triangle', f, f, 0.16, 0.13, i * 0.12));
  }
  roundBell() { [880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.15, i * 0.1)); }
}
