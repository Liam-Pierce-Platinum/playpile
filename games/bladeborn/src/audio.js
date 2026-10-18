// Tiny WebAudio synth: every sound is generated, no files.
let ctx = null, master = null, noiseBuf = null;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55 * volume;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
function noise(dur, type, f0, f1, q, vol, t0 = 0) {
  const t = ctx.currentTime + t0, src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function tone(dur, type, f0, f1, vol, t0 = 0) {
  const t = ctx.currentTime + t0, o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const r = (a, b) => a + Math.random() * (b - a);
export function setVolume(v) { if (master) master.gain.value = 0.55 * v; volume = v; }
let volume = 1;
export const sfx = {
  snik(out) { if (!ctx) return; // metallic SNIKT: noise scrape + two ringing partials
    noise(0.09, 'highpass', 5000, 9000, 1, 0.5); noise(0.16, 'bandpass', out ? 2500 : 4200, out ? 6500 : 2200, 6, 0.45, 0.02);
    tone(0.35, 'triangle', out ? 3100 : 2600, out ? 3300 : 2400, 0.12, 0.05); tone(0.28, 'sine', 4700, 4800, 0.06, 0.06);
  },
  swoosh(p = 1) { if (!ctx) return; noise(0.2 * p, 'bandpass', r(500, 800), r(2600, 3600), 1.4, 0.32); },
  hit(heavy) { if (!ctx) return;
    tone(heavy ? 0.28 : 0.16, 'sine', heavy ? 140 : 190, 40, heavy ? 0.9 : 0.6);
    noise(0.18, 'lowpass', 2400, 300, 1, 0.6); noise(0.22, 'bandpass', 900, 400, 3, 0.4, 0.03); // wet squelch
    tone(0.05, 'square', 1800, 900, 0.05);
  },
  clang() { if (!ctx) return; tone(0.25, 'triangle', r(2200, 2600), 2000, 0.12); noise(0.12, 'highpass', 3000, 6000, 1, 0.3); },
  scrape() { if (!ctx) return; noise(0.12, 'bandpass', 3500, 1800, 4, 0.18); },
  step() { if (!ctx) return; noise(0.06, 'lowpass', 500, 150, 1, 0.22); },
  jump() { if (!ctx) return; noise(0.12, 'lowpass', 900, 300, 1, 0.25); },
  land(h) { if (!ctx) return; tone(0.14, 'sine', 120, 45, 0.3 * h); noise(0.12, 'lowpass', 700, 120, 1, 0.35 * h); },
  grunt() { if (!ctx) return; tone(0.18, 'sawtooth', r(110, 150), 80, 0.08); },
  hurt() { if (!ctx) return; tone(0.22, 'sawtooth', 170, 90, 0.14); noise(0.15, 'lowpass', 1500, 200, 1, 0.35); },
  parry() { if (!ctx) return; // big bright ring + low thump
    tone(0.6, 'triangle', 1900, 1750, 0.25); tone(0.5, 'sine', 3800, 3700, 0.12, 0.01); tone(0.3, 'sine', 160, 50, 0.6); noise(0.15, 'highpass', 4000, 8000, 1, 0.5);
  },
  block() { if (!ctx) return; tone(0.12, 'sine', 220, 90, 0.4); noise(0.1, 'lowpass', 1800, 400, 1, 0.35); },
  ready() { if (!ctx) return; tone(0.5, 'sine', 520, 530, 0.1); tone(0.5, 'sine', 780, 790, 0.06, 0.05); },
  gun() { if (!ctx) return; noise(0.25, 'lowpass', 3000, 200, 1, 0.9); tone(0.15, 'square', 180, 60, 0.3); noise(0.05, 'highpass', 5000, 8000, 1, 0.5); },
  whistle() { if (!ctx) return; tone(0.45, 'sine', 700, 1500, 0.07); },
  slice() { if (!ctx) return; noise(0.25, 'bandpass', 1200, 300, 2, 0.6); tone(0.4, 'sawtooth', 90, 40, 0.15); },
  glass() { if (!ctx) return; noise(0.5, 'highpass', 6000, 3000, 1, 0.5); for (let i = 0; i < 5; i++) tone(0.2, 'sine', r(3000, 6000), r(2500, 5000), 0.05, i * 0.04); noise(0.3, 'bandpass', 2500, 1200, 2, 0.3, 0.05); },
  alarm() { if (!ctx) return; for (let i = 0; i < 4; i++) { tone(0.22, 'square', 880, 880, 0.06, i * 0.5); tone(0.22, 'square', 660, 660, 0.06, i * 0.5 + 0.25); } },
  door() { if (!ctx) return; noise(0.6, 'lowpass', 400, 120, 1, 0.35); tone(0.5, 'sawtooth', 70, 55, 0.06); },
  metal() { if (!ctx) return; tone(0.3, 'triangle', r(300, 420), 180, 0.25); noise(0.15, 'bandpass', 1400, 600, 3, 0.4); }, // vent panels, grates
  zap() { if (!ctx) return; noise(0.3, 'highpass', 5000, 1800, 1, 0.55); tone(0.3, 'sawtooth', 95, 55, 0.3); },
  whoosh() { if (!ctx) return; noise(0.4, 'bandpass', 300, 1400, 1, 0.25); },
};
