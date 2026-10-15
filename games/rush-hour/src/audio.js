// WebAudio: engine with gear shifts, wind, rain, near-miss whoosh, crash, scrape, horn, beeps, and a
// small driving-beat sequencer. Wakes on first input (browsers block audio until then).
export class Sound {
  constructor() { this.ctx = null; this.muted = /[?&]mute=1/.test(location.search); this.gear = 1; this.musicOn = true; }
  wake() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(this.master); this.out = comp;
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // engine
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eFilt = ctx.createBiquadFilter(); this.eFilt.type = 'lowpass'; this.eFilt.frequency.value = 900; this.eFilt.Q.value = 3;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    const g2 = ctx.createGain(); g2.gain.value = 0.35; const g3 = ctx.createGain(); g3.gain.value = 0.5;
    this.o1.connect(this.eFilt); this.o2.connect(g2).connect(this.eFilt); this.o3.connect(g3).connect(this.eFilt);
    this.eFilt.connect(this.eGain).connect(this.out);
    [this.o1, this.o2, this.o3].forEach((o) => o.start());
    // wind
    this.wind = this.loopNoise('bandpass', 700, 0.6); this.rain = this.loopNoise('highpass', 3000, 0.1);
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.out);
    this.nextBeat = ctx.currentTime + 0.1; this.step = 0;
    this.seq = setInterval(() => this.schedule(), 40);
  }
  loopNoise(type, f, q) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(fl).connect(g).connect(this.out); src.start();
    return { g, fl };
  }
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }
  // per-frame: v m/s, vmax, nitro bool, throttle 0..1, active bool, rain bool
  engine(v, vmax, nitro, active, rain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = [0, 14, 26, 38, 50, 62, 200];
    let g = 1; while (g < 6 && v > gears[g]) g++;
    if (g !== this.gear) { if (g > this.gear && active) this.pop(); this.gear = g; }
    const lo = gears[g - 1], hi = Math.min(gears[g], vmax * 1.15);
    const rpm = 0.3 + 0.7 * Math.min(1, (v - lo) / Math.max(1, hi - lo));
    const f = 55 + rpm * 120 + g * 6 + (nitro ? 18 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.04); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04); this.o3.frequency.setTargetAtTime(f * 1.505, t, 0.04);
    this.eFilt.frequency.setTargetAtTime(500 + rpm * 1600 + (nitro ? 900 : 0), t, 0.05);
    this.eGain.gain.setTargetAtTime(active ? 0.13 + rpm * 0.06 : 0.04, t, 0.08);
    const w = Math.min(1, v / vmax);
    this.wind.g.gain.setTargetAtTime(active ? w * w * 0.32 : 0, t, 0.1);
    this.wind.fl.frequency.setTargetAtTime(400 + w * 1400, t, 0.1);
    this.rain.g.gain.setTargetAtTime(rain ? 0.12 : 0, t, 0.3);
  }
  env(node, t, a, peak, d) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  burst(type, f0, f1, dur, vol, pan = 0, q = 1) {
    if (!this.ctx || this.quiet) return; const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.02, vol, dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; s.connect(fl).connect(g).connect(p).connect(this.out); } else s.connect(fl).connect(g).connect(this.out);
    s.start(t); s.stop(t + dur + 0.1);
  }
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx || this.quiet) return; const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.01, vol, dur); o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  whoosh(pan, big) { this.burst('bandpass', big ? 2400 : 1800, 300, big ? 0.45 : 0.32, big ? 0.9 : 0.6, pan, 1.4); }
  crash() { this.burst('lowpass', 2500, 120, 0.7, 1.2); this.tone('square', 90, 30, 0.4, 0.5); this.burst('highpass', 4000, 2000, 0.35, 0.4); }
  scrape() { this.burst('bandpass', 3200, 2400, 0.18, 0.25, 0, 4); }
  cone() { this.tone('square', 520, 260, 0.08, 0.15); }
  pop() { this.burst('bandpass', 900, 200, 0.07, 0.25, 0, 2); }
  horn(pan) { this.tone('square', 392, 380, 0.35, 0.09); this.tone('square', 494, 480, 0.35, 0.07); }
  beep(hi) { this.tone('square', hi ? 1320 : 660, hi ? 1320 : 660, hi ? 0.35 : 0.14, 0.18); }
  nitro() { this.burst('lowpass', 600, 2400, 0.5, 0.5); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.18, 0.15, i * 0.1)); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.3, 0.15, i * 0.18)); }
  star(i) { this.tone('triangle', 880 + i * 220, 880 + i * 220, 0.25, 0.2); }
  schedule() {
    const ctx = this.ctx; if (!ctx || !this.musicOn) return;
    const spb = 60 / 128 / 2; // eighth notes
    const bass = [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 43, 43, 55, 47];
    while (this.nextBeat < ctx.currentTime + 0.15) {
      const t = this.nextBeat, i = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      if (i % 4 === 0) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); const g = ctx.createGain(); this.env(g, t, 0.003, 0.9, 0.16); o.connect(g).connect(this.musicGain); o.start(t); o.stop(t + 0.2); }
      if (i % 2 === 1) { const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); this.env(g, t, 0.002, 0.25, 0.04); s.connect(f).connect(g).connect(this.musicGain); s.start(t); s.stop(t + 0.06); }
      if (i === 4 || i === 12) { const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = ctx.createGain(); this.env(g, t, 0.002, 0.5, 0.12); s.connect(f).connect(g).connect(this.musicGain); s.start(t); s.stop(t + 0.15); }
      const n = bass[(i + bar * 0) % 16] + (bar === 3 ? 2 : 0); const fr = 440 * Math.pow(2, (n - 69) / 12);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(200, t + 0.18);
      const g = ctx.createGain(); this.env(g, t, 0.005, 0.35, 0.2); o.connect(fl).connect(g).connect(this.musicGain); o.start(t); o.stop(t + 0.25);
      this.nextBeat += spb; this.step++;
    }
  }
}
