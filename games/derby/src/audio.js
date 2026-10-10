// All sound is synthesised: engine hum, crunches scaled by impact strength, metal clanks for
// falling panels, crowd bed with "ooh"s, air horn and a cheer for the win.
export class Audio {
  constructor() { this.ctx = null; this.vol = 0.8; this.muted = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // browsers refuse audio before the first click / key / tap; wait for it rather than warn
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine: two detuned saws and a sub through a lowpass, with a little growl
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400; this.engF.Q.value = 2;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'sawtooth'; this.o2.detune.value = 14;
    this.o3 = c.createOscillator(); this.o3.type = 'square';
    const g3 = c.createGain(); g3.gain.value = 0.5;
    this.o1.connect(this.engF); this.o2.connect(this.engF); this.o3.connect(g3).connect(this.engF);
    this.engF.connect(this.eng).connect(this.master);
    for (const o of [this.o1, this.o2, this.o3]) o.start();
    // crowd: looped noise through a vocal-ish bandpass
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 700; cf.Q.value = 0.8;
    const cf2 = c.createBiquadFilter(); cf2.type = 'peaking'; cf2.frequency.value = 1400; cf2.gain.value = 6;
    this.crowd = c.createGain(); this.crowd.gain.value = 0;
    s.connect(cf).connect(cf2).connect(this.crowd).connect(this.master); s.start();
    // tyre scrub on dirt
    const s2 = c.createBufferSource(); s2.buffer = this.noise; s2.loop = true;
    this.scF = c.createBiquadFilter(); this.scF.type = 'bandpass'; this.scF.frequency.value = 900; this.scF.Q.value = 1.4;
    this.sc = c.createGain(); this.sc.gain.value = 0;
    s2.connect(this.scF).connect(this.sc).connect(this.master); s2.start(0, 0.7);
    this.apply();
  }
  apply() { if (this.ctx) this.master.gain.value = this.muted ? 0 : this.vol; }
  tone(f, dur, type, vol, when, slide = 0, dest = this.master) {
    const c = this.ctx, t = when ?? c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, f, vol, type, when, sweep = 0, q = 1, dest = this.master, attack = 0) {
    const c = this.ctx, t = when ?? c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    const g = c.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  panned(pan) {
    const c = this.ctx;
    if (!c.createStereoPanner) return this.master;
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.master);
    return p;
  }
  // v: 0..1 strength (already scaled for distance), pan -1..1
  crunch(v, pan = 0) {
    if (!this.ctx || v < 0.02) return;
    const out = this.panned(pan), t = this.ctx.currentTime;
    this.hiss(0.18 + v * 0.35, 2400, 0.5 * v + 0.1, 'lowpass', t, 0.12, 0.7, out);
    this.hiss(0.08 + v * 0.1, 3500, 0.35 * v, 'bandpass', t, 0.5, 2, out);
    this.tone(95 + Math.random() * 20, 0.2 + v * 0.25, 'sine', 0.6 * v + 0.05, t, 0.4, out);
    if (v > 0.35) for (let k = 0; k < 3; k++) this.tone(300 + Math.random() * 900, 0.15 + Math.random() * 0.25, 'triangle', 0.06 * v, t + Math.random() * 0.06, 0.92, out);
    if (v > 0.5) this.ooh(v);
  }
  clank(v = 0.5, pan = 0) {
    if (!this.ctx) return;
    const out = this.panned(pan), t = this.ctx.currentTime + 0.03;
    const base = 260 + Math.random() * 300;
    for (const m of [1, 2.76, 5.4]) this.tone(base * m, 0.25 + Math.random() * 0.2, 'triangle', 0.09 * v / m ** 0.3, t, 0.98, out);
    this.hiss(0.05, 4000, 0.15 * v, 'highpass', t, 0, 1, out);
    // and it bounces once
    for (const m of [1, 2.76]) this.tone(base * m * 1.02, 0.15, 'triangle', 0.04 * v, t + 0.16, 0.98, out);
  }
  scrape(v) { if (this.ctx && v > 0.05) this.hiss(0.12, 3000, 0.2 * v, 'bandpass', null, 0.6, 3); }
  ooh(v) { if (!this.ctx) return; const g = this.crowd.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.05 + 0.13 * v, t + 0.15); g.linearRampToValueAtTime(0.035, t + 1.6); }
  boom() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(70, 0.9, 'sine', 0.8, t, 0.35); this.hiss(1.2, 900, 0.7, 'lowpass', t, 0.15);
    for (let k = 0; k < 4; k++) this.clank(0.6, (Math.random() - 0.5));
    this.ooh(1);
  }
  whoosh() { if (this.ctx) this.hiss(0.6, 500, 0.4, 'bandpass', null, 4, 1.2); }
  pickup() { if (this.ctx) [660, 880, 1320].forEach((f, i) => this.tone(f, 0.18, 'square', 0.07, this.ctx.currentTime + i * 0.06)); }
  beep(hi) { if (this.ctx) this.tone(hi ? 880 : 440, hi ? 0.6 : 0.22, 'square', 0.12); }
  click() { if (this.ctx) this.tone(1100, 0.04, 'square', 0.05); }
  horn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.connect(this.master);
    for (const [fr, st] of [[311, 0], [370, 0], [311, 0.75], [370, 0.75]]) this.tone(fr, 0.62, 'sawtooth', 0.16, t + st, 0, f);
    this.cheer();
  }
  cheer() { if (!this.ctx) return; this.hiss(3.2, 1100, 0.5, 'bandpass', null, 1.3, 0.6, this.master, 0.4); this.ooh(1); }
  wreckLoud() { this.boom(); }
  // per frame: player's engine, tyre scrub and the crowd bed
  update(st) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!st) { this.eng.gain.setTargetAtTime(0, now, 0.1); this.sc.gain.setTargetAtTime(0, now, 0.05); this.crowd.gain.setTargetAtTime(0.0, now, 0.4); return; }
    const sp = st.speed, low = st.heavy ? 0.7 : 1;
    const f = (40 + sp * 0.1 + st.throttle * 14 + (st.boost ? 22 : 0)) * low;
    this.o1.frequency.setTargetAtTime(f, now, 0.05);
    this.o2.frequency.setTargetAtTime(f * 1.5, now, 0.05);
    this.o3.frequency.setTargetAtTime(f * 0.5 + Math.sin(now * 40) * 2, now, 0.03);
    this.engF.frequency.setTargetAtTime(260 + sp * 1.1 + st.throttle * 450, now, 0.05);
    this.eng.gain.setTargetAtTime(st.alive ? 0.06 + st.throttle * 0.05 : 0, now, 0.1);
    this.sc.gain.setTargetAtTime(Math.min(0.12, st.slide * 0.18), now, 0.05);
    if (this.crowd.gain.value < 0.03) this.crowd.gain.setTargetAtTime(0.035, now, 0.6);
  }
}
