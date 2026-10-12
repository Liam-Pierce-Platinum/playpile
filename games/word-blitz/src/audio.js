// All sound is synthesised with WebAudio. No files.
let ctx = null, master = null, muted = false;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
  } catch (e) { ctx = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }
export const isMuted = () => muted;

function tone(freq, t0, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0, filter = 0 } = {}) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
  node.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, vol = 0.2, freq = 2000) {
  if (!ctx || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t0);
}
const now = () => (ctx ? ctx.currentTime : 0);
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

export const sfx = {
  tile(n) { // n = path length so far
    const t = now(), m = 67 + PENTA[Math.min(n - 1, PENTA.length - 1)];
    tone(midi(m), t, 0.14, { type: 'triangle', vol: 0.22 });
    tone(midi(m + 12), t, 0.06, { type: 'sine', vol: 0.06 });
  },
  untile() { tone(midi(60), now(), 0.06, { type: 'triangle', vol: 0.1 }); },
  good(len) {
    const t = now(), base = 72;
    const notes = len >= 7 ? [0, 4, 7, 12, 16, 19, 24] : len >= 5 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
    notes.forEach((n, i) => tone(midi(base + n), t + i * 0.045, 0.22, { type: 'square', vol: 0.07, filter: 3500 }));
    notes.forEach((n, i) => tone(midi(base + n), t + i * 0.045, 0.3, { type: 'triangle', vol: 0.14 }));
    noise(t, 0.08, 0.08, 6000);
    if (len >= 6) { tone(midi(48), t, 0.5, { type: 'sine', vol: 0.35, slide: 0.5 }); noise(t, 0.35, 0.15, 900); }
  },
  dup() { const t = now(); tone(midi(76), t, 0.1, { type: 'triangle', vol: 0.15 }); tone(midi(76), t + 0.09, 0.12, { type: 'triangle', vol: 0.12 }); },
  bad() { const t = now(); tone(140, t, 0.18, { type: 'sawtooth', vol: 0.1, slide: 0.6, filter: 900 }); },
  tick(hi) { tone(hi ? 1600 : 1100, now(), 0.04, { type: 'square', vol: 0.05, filter: 4000 }); },
  count(n) { tone(midi(n === 0 ? 84 : 72), now(), 0.25, { type: 'square', vol: 0.08, filter: 3000 }); },
  end() {
    const t = now();
    [60, 64, 67, 72].forEach((n, i) => tone(midi(n), t + i * 0.02, 0.9, { type: 'sawtooth', vol: 0.06, filter: 2200 }));
    tone(midi(36), t, 0.8, { type: 'sine', vol: 0.4, slide: 0.7 });
    noise(t, 0.5, 0.2, 1200);
  },
  star(i) { const t = now(); tone(midi(79 + i * 4), t, 0.4, { type: 'triangle', vol: 0.2 }); tone(midi(91 + i * 4), t, 0.25, { type: 'sine', vol: 0.08 }); },
  combo(n) { tone(midi(84 + Math.min(n, 10)), now(), 0.12, { type: 'sine', vol: 0.12 }); },
  rotate() { const t = now(); noise(t, 0.15, 0.12, 2500); tone(500, t, 0.12, { type: 'sine', vol: 0.08, slide: 1.6 }); },
  click() { tone(midi(79), now(), 0.06, { type: 'triangle', vol: 0.15 }); },
  level() { const t = now(); [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(midi(72 + n), t + i * 0.06, 0.3, { type: 'triangle', vol: 0.16 })); },
};
