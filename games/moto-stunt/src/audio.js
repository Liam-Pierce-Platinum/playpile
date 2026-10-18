// WebAudio: engine drone + synthesized one-shots. Silent with ?mute=1.
const mute = /[?&]mute=1/.test(location.search);
let ctx = null, eng = null, master = null;
export function unlock() {
  if (mute || ctx) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
  eng = { o1, o2, f, g };
}
export function engine(on, speed, gas) {
  if (!eng) return;
  const t = ctx.currentTime, hz = 45 + speed * 5 + gas * 30;
  eng.o1.frequency.setTargetAtTime(hz, t, 0.05); eng.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.05);
  eng.f.frequency.setTargetAtTime(400 + gas * 900 + speed * 30, t, 0.05);
  eng.g.gain.setTargetAtTime(on ? 0.05 + gas * 0.04 : 0, t, 0.08);
}
function tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, cutoff) {
  if (!ctx) return;
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = b; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start();
}
export const sfx = {
  flip(n) { for (let i = 0; i <= n; i++) tone(520 + i * 180, 0.14, 'square', 0.12, 1.5, i * 0.07); },
  boom() { noise(0.9, 0.9, 900); tone(90, 0.6, 'sine', 0.5, 0.3); },
  crash() { noise(0.4, 0.6, 2400); tone(200, 0.3, 'sawtooth', 0.15, 0.4); },
  land() { noise(0.12, 0.25, 500); },
  check() { tone(660, 0.12, 'triangle', 0.2); tone(990, 0.2, 'triangle', 0.2, 0, 0.1); },
  finish() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'square', 0.13, 0, i * 0.12)); },
  star(i) { tone(800 + i * 250, 0.25, 'triangle', 0.2, 1.2); },
  click() { tone(440, 0.06, 'square', 0.1); },
};
