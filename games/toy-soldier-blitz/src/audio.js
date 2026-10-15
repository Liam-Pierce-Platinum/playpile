// All sound is synthesised with WebAudio - no files. Wakes on first input.
let ctx = null, master = null, sfx = null, music = null, NB = null, muted = false, beatT = 0, beatOn = false, step = 0;

export const Audio = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5; comp.connect(master);
    sfx = ctx.createGain(); sfx.connect(comp);
    music = ctx.createGain(); music.gain.value = 0.22; music.connect(comp);
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    NB = b;
  },
  get muted() { return muted; },
  setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); },

  noise(dur, { f = 1000, q = 1, type = 'bandpass', g = 0.5, a = 0.002, f2 = null, when = 0, dest = null } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = NB; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(gn).connect(dest || sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, { type = 'sine', g = 0.3, a = 0.004, f2 = null, when = 0, dest = null } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gn).connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  // vol: 0..1 distance falloff for other soldiers' shots
  shot(vol = 1) {
    if (!ctx || vol < 0.03) return;
    this.noise(0.05, { f: 2600, q: 0.6, type: 'highpass', g: 0.55 * vol });
    this.noise(0.16, { f: 1400, q: 0.8, type: 'lowpass', g: 0.6 * vol, f2: 300 });
    this.tone(160, 0.12, { type: 'triangle', g: 0.4 * vol, f2: 60 });
  },
  hit() { this.tone(1500, 0.05, { type: 'square', g: 0.08 }); this.tone(2100, 0.04, { type: 'square', g: 0.05, when: 0.02 }); },
  head() { this.tone(2400, 0.08, { type: 'triangle', g: 0.2 }); this.tone(3200, 0.1, { type: 'triangle', g: 0.14, when: 0.04 }); },
  hurt() { this.noise(0.12, { f: 500, q: 1, g: 0.4 }); this.tone(220, 0.15, { type: 'sawtooth', g: 0.08, f2: 120 }); },
  kill() { [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', g: 0.16, when: i * 0.05 })); this.noise(0.25, { f: 3000, q: 2, g: 0.12, when: 0.05 }); },
  died() { this.tone(300, 0.6, { type: 'sawtooth', g: 0.12, f2: 70 }); this.noise(0.3, { f: 700, g: 0.3 }); },
  wood(h = 1) { this.tone(420 * h, 0.09, { type: 'triangle', g: 0.35 }); this.noise(0.06, { f: 1800 * h, q: 3, g: 0.3 }); this.tone(210 * h, 0.14, { g: 0.25 }); },
  chip() { this.noise(0.05, { f: 2400 + Math.random() * 800, q: 4, g: 0.15 }); },
  crack() { this.noise(0.35, { f: 900, q: 0.8, g: 0.6, f2: 200 }); this.tone(120, 0.25, { type: 'triangle', g: 0.4, f2: 50 }); for (let i = 0; i < 4; i++) this.tone(500 + Math.random() * 500, 0.06, { type: 'triangle', g: 0.15, when: 0.05 + i * 0.07 }); },
  boom(vol = 1) {
    if (!ctx) return;
    this.noise(1.1, { f: 900, type: 'lowpass', g: 1.0 * vol, f2: 60, a: 0.002 });
    this.tone(70, 0.9, { g: 0.9 * vol, f2: 28 });
    this.noise(0.08, { f: 3000, type: 'highpass', g: 0.5 * vol });
  },
  fizz() { this.noise(0.5, { f: 5000, q: 1, type: 'highpass', g: 0.08 }); },
  throwIt() { this.noise(0.15, { f: 600, q: 1, g: 0.2, f2: 1600 }); },
  jump() { this.tone(260, 0.1, { type: 'triangle', g: 0.07, f2: 420 }); },
  land() { this.noise(0.08, { f: 300, type: 'lowpass', g: 0.25 }); },
  reload() { this.noise(0.05, { f: 2000, q: 4, g: 0.25 }); this.noise(0.05, { f: 1500, q: 4, g: 0.3, when: 0.5 }); this.tone(400, 0.05, { type: 'square', g: 0.05, when: 0.9 }); },
  empty() { this.tone(1200, 0.03, { type: 'square', g: 0.06 }); },
  click() { this.tone(800, 0.04, { type: 'triangle', g: 0.12 }); },
  deny() { this.tone(160, 0.12, { type: 'square', g: 0.08 }); },
  bugle(win) {
    const n = win ? [392, 523, 659, 784, 659, 784] : [392, 370, 349, 262];
    n.forEach((f, i) => { this.tone(f, 0.32, { type: 'sawtooth', g: 0.07, when: i * 0.16 }); this.tone(f * 2, 0.3, { type: 'triangle', g: 0.05, when: i * 0.16 }); });
  },
  horn() { this.tone(220, 0.7, { type: 'sawtooth', g: 0.1 }); this.tone(330, 0.7, { type: 'sawtooth', g: 0.07 }); this.tone(110, 0.8, { g: 0.2 }); },
  tick() { this.tone(1000, 0.03, { type: 'square', g: 0.05 }); },
  // marching snare + bass: a tiny loop, scheduled from the game loop
  music(on) { beatOn = on; if (ctx && on) beatT = Math.max(beatT, ctx.currentTime + 0.05); },
  update() {
    if (!ctx || !beatOn || muted) return;
    while (beatT < ctx.currentTime + 0.25) {
      const s = step++ % 16, w = beatT - ctx.currentTime;
      const snare = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1][s];
      if (snare) this.noise(0.09, { f: 2200, q: 0.7, g: s % 4 === 0 ? 0.5 : 0.25, when: w, dest: music });
      if (s % 4 === 0) this.tone(55, 0.25, { g: 0.6, f2: 40, when: w, dest: music });
      const bass = [110, 0, 110, 0, 131, 0, 98, 0][s >> 1];
      if (bass && s % 2 === 0) this.tone(bass, 0.16, { type: 'triangle', g: 0.25, when: w, dest: music });
      beatT += 0.125;
    }
  },
};
