// All sound is synthesised with WebAudio: no files.
let ctx = null, master = null, sfx = null, bedGain = null, muted = false, bedNodes = [], sirenNodes = null;
const noiseBuf = () => {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
};
let NB = null;

export const Audio = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(comp);
    bedGain = ctx.createGain(); bedGain.gain.value = 0; bedGain.connect(comp);
    NB = noiseBuf();
  },
  get muted() { return muted; },
  setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); },
  now() { return ctx ? ctx.currentTime : 0; },

  noise(dur, { f = 1000, q = 1, type = 'bandpass', g = 0.5, a = 0.002, f2 = null, dest = null, when = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = NB; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(gn).connect(dest || sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, { type = 'sine', g = 0.3, a = 0.005, f2 = null, when = 0, dest = null } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gn).connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
  },

  shot() {
    if (!ctx) return;
    this.noise(0.09, { f: 3000, q: 0.5, type: 'highpass', g: 1.0, a: 0.001 });
    this.noise(0.5, { f: 900, q: 0.7, type: 'lowpass', g: 1.0, a: 0.001, f2: 120 });
    this.tone(90, 0.45, { type: 'sine', g: 0.9, f2: 38 });
    // rooftop echo off the buildings
    for (let i = 1; i <= 3; i++) this.noise(0.5, { f: 700 - i * 120, q: 0.6, type: 'lowpass', g: 0.25 / i, a: 0.01, when: 0.22 * i + 0.05 });
  },
  bolt() { this.noise(0.05, { f: 2500, q: 3, g: 0.3, when: 0.35 }); this.noise(0.06, { f: 1800, q: 3, g: 0.35, when: 0.55 }); this.tone(320, 0.04, { type: 'square', g: 0.08, when: 0.56 }); },
  dry() { this.noise(0.04, { f: 3000, q: 4, g: 0.3 }); },
  impactHit() { this.tone(70, 0.6, { g: 0.7, f2: 30 }); this.noise(0.3, { f: 400, type: 'lowpass', g: 0.6, f2: 80 }); },
  dust() { this.noise(0.25, { f: 1500, q: 0.8, g: 0.25, when: 0.15 }); },
  whoosh() { this.noise(1.4, { f: 200, q: 2, g: 0.35, f2: 1800, a: 0.6 }); this.tone(55, 1.6, { g: 0.35, f2: 40, a: 0.3 }); },
  radio() {
    if (!ctx) return;
    this.tone(1400, 0.07, { type: 'square', g: 0.08 }); this.tone(1900, 0.08, { type: 'square', g: 0.08, when: 0.09 });
    this.noise(0.35, { f: 2200, q: 1.5, g: 0.1, when: 0.18 });
  },
  click() { this.tone(900, 0.04, { type: 'triangle', g: 0.12 }); },
  tag() { this.tone(660, 0.06, { type: 'triangle', g: 0.15 }); this.tone(990, 0.08, { type: 'triangle', g: 0.12, when: 0.06 }); },
  untag() { this.tone(500, 0.07, { type: 'triangle', g: 0.12 }); },
  zoom() { this.noise(0.06, { f: 4000, q: 6, g: 0.12 }); this.tone(2200, 0.03, { type: 'square', g: 0.03 }); },
  scopeIn() { this.noise(0.12, { f: 1200, q: 1, g: 0.12, f2: 2400 }); },
  breathIn() { this.noise(0.5, { f: 900, q: 0.7, g: 0.12, a: 0.25 }); },
  breathOut() { this.noise(0.8, { f: 700, q: 0.7, g: 0.16, a: 0.05 }); },
  heartbeat() { this.tone(55, 0.14, { g: 0.5, f2: 40 }); this.tone(50, 0.12, { g: 0.35, f2: 38, when: 0.18 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', g: 0.18, when: 0.12 * i })); this.tone(130, 1.2, { type: 'sawtooth', g: 0.08, when: 0.1 }); },
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.55, { type: 'sawtooth', g: 0.09, when: 0.18 * i })); },
  alarm() { for (let i = 0; i < 3; i++) this.tone(880, 0.12, { type: 'square', g: 0.07, when: i * 0.22 }); },
  scream() {
    if (!ctx) return;
    for (let i = 0; i < 6; i++) { const f = 500 + Math.random() * 600; this.tone(f, 0.6 + Math.random() * 0.5, { type: 'sawtooth', g: 0.02, f2: f * 0.7, when: Math.random() * 0.6, a: 0.05 }); }
    this.noise(2.0, { f: 900, q: 0.8, g: 0.18, a: 0.1, when: 0.05 });
  },
  siren(on) {
    if (!ctx) return;
    if (on && !sirenNodes) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg).connect(o.frequency); o.frequency.value = 760;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.5);
      o.connect(f).connect(g).connect(sfx); o.start(); lfo.start(); sirenNodes = { o, lfo, g };
    } else if (!on && sirenNodes) {
      const n = sirenNodes; sirenNodes = null; n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => { try { n.o.stop(); n.lfo.stop(); } catch (e) {} }, 3000);
    }
  },
  // crowd murmur + low tension drone
  bed(on, panic = 0) {
    if (!ctx) return;
    if (on && !bedNodes.length) {
      const s = ctx.createBufferSource(); s.buffer = NB; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.7;
      const am = ctx.createGain(); am.gain.value = 0.10;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1; const lg = ctx.createGain(); lg.gain.value = 0.035; lfo.connect(lg).connect(am.gain);
      s.connect(f).connect(am).connect(bedGain); s.start(); lfo.start();
      const d1 = ctx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 55; const d2 = ctx.createOscillator(); d2.type = 'sine'; d2.frequency.value = 82.6;
      const dg = ctx.createGain(); dg.gain.value = 0.05; d1.connect(dg); d2.connect(dg); dg.connect(bedGain); d1.start(); d2.start();
      bedNodes = [s, lfo, d1, d2]; this._bedF = f; this._bedAm = am;
    }
    if (bedGain) bedGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.4);
    if (this._bedF) { this._bedF.frequency.setTargetAtTime(520 + panic * 500, ctx.currentTime, 0.3); this._bedAm.gain.setTargetAtTime(0.1 + panic * 0.12, ctx.currentTime, 0.3); }
  },
};
