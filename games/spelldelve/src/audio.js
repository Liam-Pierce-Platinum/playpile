// Synthesised WebAudio sound effects. No files.
let ctx = null, master = null, muted = false, noiseBuf = null;
const last = {};

export const Audio = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; },
  get muted() { return muted; },
};

function tone({ type = 'sine', f = 440, f2 = null, dur = 0.15, vol = 0.25, attack = 0.004, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise({ dur = 0.2, vol = 0.25, type = 'lowpass', f = 1200, f2 = null, q = 1, delay = 0, attack = 0.004 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

function gate(name, gap = 0.035) {
  if (!ctx || muted) return false;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < gap) return false;
  last[name] = now; return true;
}

const S = {
  bolt() { tone({ type: 'triangle', f: 880, f2: 420, dur: 0.12, vol: 0.12 }); },
  scatter() { noise({ type: 'bandpass', f: 4000, f2: 1500, dur: 0.12, vol: 0.18, q: 2 }); tone({ type: 'square', f: 1300, f2: 600, dur: 0.06, vol: 0.05 }); },
  shard() { tone({ type: 'sine', f: 1800, f2: 900, dur: 0.1, vol: 0.12 }); noise({ type: 'highpass', f: 5000, dur: 0.06, vol: 0.06 }); },
  fireball() { noise({ type: 'lowpass', f: 600, f2: 2400, dur: 0.3, vol: 0.3 }); tone({ type: 'sawtooth', f: 120, f2: 260, dur: 0.25, vol: 0.06 }); },
  explode() { noise({ type: 'lowpass', f: 1800, f2: 80, dur: 0.6, vol: 0.5 }); tone({ type: 'sine', f: 110, f2: 35, dur: 0.45, vol: 0.4 }); },
  nova() { noise({ type: 'highpass', f: 2500, f2: 7000, dur: 0.5, vol: 0.25 }); tone({ type: 'sine', f: 1500, f2: 3000, dur: 0.4, vol: 0.08 }); },
  zap() { for (let i = 0; i < 3; i++) tone({ type: 'sawtooth', f: 1400 - i * 300, f2: 200, dur: 0.08, vol: 0.09, delay: i * 0.03 }); noise({ type: 'bandpass', f: 3000, dur: 0.15, vol: 0.2, q: 3 }); },
  missile() { tone({ type: 'sine', f: 600, f2: 1400, dur: 0.12, vol: 0.08 }); },
  meteorCall() { tone({ type: 'sawtooth', f: 300, f2: 60, dur: 0.9, vol: 0.08 }); noise({ type: 'bandpass', f: 400, f2: 1600, dur: 0.9, vol: 0.12, q: 1 }); },
  meteor() { noise({ type: 'lowpass', f: 2200, f2: 50, dur: 1.0, vol: 0.7 }); tone({ type: 'sine', f: 70, f2: 25, dur: 0.8, vol: 0.6 }); },
  poison() { noise({ type: 'lowpass', f: 300, f2: 900, dur: 0.6, vol: 0.2 }); tone({ type: 'sine', f: 200, f2: 140, dur: 0.4, vol: 0.08 }); },
  lance() { tone({ type: 'triangle', f: 2400, f2: 700, dur: 0.18, vol: 0.14 }); noise({ type: 'highpass', f: 6000, dur: 0.15, vol: 0.12 }); },
  blink() { tone({ type: 'sine', f: 300, f2: 1800, dur: 0.18, vol: 0.14 }); noise({ type: 'bandpass', f: 2000, dur: 0.15, vol: 0.12, q: 4 }); },
  summon() { [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.25, vol: 0.08, delay: i * 0.06 })); },
  shield() { tone({ type: 'sine', f: 220, f2: 440, dur: 0.4, vol: 0.14 }); tone({ type: 'sine', f: 330, f2: 660, dur: 0.4, vol: 0.08 }); },
  gravity() { tone({ type: 'sawtooth', f: 90, f2: 40, dur: 0.8, vol: 0.12 }); noise({ type: 'lowpass', f: 300, f2: 100, dur: 0.8, vol: 0.18 }); },
  orbit() { tone({ type: 'triangle', f: 700, f2: 1400, dur: 0.2, vol: 0.08 }); noise({ type: 'bandpass', f: 5000, dur: 0.2, vol: 0.06, q: 6 }); },
  hit() { noise({ type: 'bandpass', f: 900, dur: 0.07, vol: 0.18, q: 1.5 }); tone({ type: 'square', f: 220, f2: 110, dur: 0.05, vol: 0.05 }); },
  crit() { noise({ type: 'bandpass', f: 1800, dur: 0.1, vol: 0.25, q: 1.5 }); tone({ type: 'square', f: 900, f2: 300, dur: 0.08, vol: 0.08 }); },
  kill() { noise({ type: 'lowpass', f: 1500, f2: 200, dur: 0.25, vol: 0.25 }); tone({ type: 'triangle', f: 300, f2: 90, dur: 0.2, vol: 0.12 }); },
  hurt() { noise({ type: 'lowpass', f: 900, f2: 200, dur: 0.25, vol: 0.4 }); tone({ type: 'sawtooth', f: 180, f2: 70, dur: 0.25, vol: 0.18 }); },
  coin() { tone({ type: 'square', f: 1320, dur: 0.05, vol: 0.06 }); tone({ type: 'square', f: 1760, dur: 0.08, vol: 0.06, delay: 0.05 }); },
  xp() { tone({ type: 'sine', f: 900 + Math.random() * 500, dur: 0.06, vol: 0.06 }); },
  levelup() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.3, vol: 0.12, delay: i * 0.07 })); },
  door() { noise({ type: 'lowpass', f: 400, f2: 150, dur: 0.5, vol: 0.3 }); tone({ type: 'square', f: 70, f2: 50, dur: 0.4, vol: 0.08 }); },
  chest() { tone({ type: 'triangle', f: 392, dur: 0.15, vol: 0.12 }); tone({ type: 'triangle', f: 587, dur: 0.2, vol: 0.12, delay: 0.1 }); tone({ type: 'triangle', f: 784, dur: 0.35, vol: 0.12, delay: 0.2 }); },
  book() { [392, 494, 587, 784, 988].forEach((f, i) => tone({ type: 'sine', f, dur: 0.5, vol: 0.1, delay: i * 0.09 })); noise({ type: 'highpass', f: 6000, dur: 0.8, vol: 0.05 }); },
  dash() { noise({ type: 'bandpass', f: 1200, f2: 3500, dur: 0.15, vol: 0.18, q: 1 }); },
  arrow() { noise({ type: 'highpass', f: 3000, f2: 1200, dur: 0.12, vol: 0.12 }); },
  charge() { tone({ type: 'sawtooth', f: 160, f2: 320, dur: 0.4, vol: 0.08 }); },
  roar() { tone({ type: 'sawtooth', f: 90, f2: 55, dur: 1.1, vol: 0.25 }); noise({ type: 'lowpass', f: 500, f2: 120, dur: 1.1, vol: 0.3 }); },
  slam() { noise({ type: 'lowpass', f: 800, f2: 60, dur: 0.5, vol: 0.55 }); tone({ type: 'sine', f: 80, f2: 30, dur: 0.4, vol: 0.5 }); },
  shoot() { tone({ type: 'square', f: 500, f2: 250, dur: 0.08, vol: 0.05 }); },
  click() { tone({ type: 'triangle', f: 660, dur: 0.05, vol: 0.08 }); },
  buy() { tone({ type: 'square', f: 880, dur: 0.06, vol: 0.06 }); tone({ type: 'square', f: 1320, dur: 0.12, vol: 0.06, delay: 0.06 }); },
  deny() { tone({ type: 'square', f: 140, dur: 0.15, vol: 0.08 }); },
  death() { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.4, vol: 0.14, delay: i * 0.18 })); },
  victory() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.35, vol: 0.12, delay: i * 0.11 })); },
  stairs() { [784, 659, 523, 392].forEach((f, i) => tone({ type: 'sine', f, dur: 0.3, vol: 0.1, delay: i * 0.08 })); },
  trap() { noise({ type: 'highpass', f: 2500, dur: 0.12, vol: 0.2 }); tone({ type: 'square', f: 300, f2: 900, dur: 0.06, vol: 0.05 }); },
  relic() { [659, 831, 988, 1318].forEach((f, i) => tone({ type: 'sine', f, dur: 0.5, vol: 0.1, delay: i * 0.1 })); },
};

export function sfx(name) {
  if (!S[name] || !gate(name)) return;
  try { S[name](); } catch (e) { /* ignore */ }
}
