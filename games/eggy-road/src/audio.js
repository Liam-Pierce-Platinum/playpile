// WebAudio: soft engine hum, coin chimes, wobble taps, crack, milestone chord. All synthesized.
let ctx = null, master = null, eng = null, engGain = null, engF = null, muted = false;
export const audio = {
  get muted() { return muted; },
  init() {
    if (ctx || new URLSearchParams(location.search).has('mute')) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
      eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 50;
      const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = 25;
      engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 300; engF.Q.value = 3;
      engGain = ctx.createGain(); engGain.gain.value = 0;
      eng.connect(engF); sub.connect(engF); engF.connect(engGain); engGain.connect(master);
      eng.start(); sub.start(); this._sub = sub;
    } catch (e) { ctx = null; }
  },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
  engine(rpm, on) {
    if (!ctx) return; const t = ctx.currentTime;
    eng.frequency.setTargetAtTime(45 + rpm * 70, t, 0.08); this._sub.frequency.setTargetAtTime(22 + rpm * 35, t, 0.08);
    engF.frequency.setTargetAtTime(250 + rpm * 700, t, 0.1);
    engGain.gain.setTargetAtTime(on ? 0.07 + rpm * 0.05 : 0, t, 0.15);
  },
  tone(f, d, type = 'sine', v = 0.2, slide = 0, delay = 0) {
    if (!ctx) return; const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
  },
  noise(d, v = 0.3, f = 2000, q = 1) {
    if (!ctx) return; const t = ctx.currentTime;
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * d), ctx.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length) ** 2;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = v;
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t);
  },
  coin(n) { const f = 880 * Math.pow(2, (n % 5) / 12); this.tone(f, 0.18, 'sine', 0.15); this.tone(f * 1.5, 0.25, 'sine', 0.08, 0, 0.06); },
  tap(v) { this.tone(500 + Math.random() * 200, 0.07, 'triangle', Math.min(0.15, v * 0.05)); },
  thud(v) { this.noise(0.18, Math.min(0.35, v * 0.05), 180, 0.8); },
  crack() { this.noise(0.08, 0.5, 3500, 2); this.noise(0.3, 0.3, 900, 1); this.tone(300, 0.4, 'triangle', 0.15, 0.4, 0.05); },
  milestone() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.1, 0, i * 0.09)); },
  buy() { this.tone(660, 0.12, 'square', 0.06); this.tone(990, 0.2, 'sine', 0.1, 0, 0.08); },
};
