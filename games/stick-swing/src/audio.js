// WebAudio synth: paper snaps, rustles, chimes. All generated, no files.
let ctx = null, master = null, wind = null, windGain = null, noiseBuf = null;
export const A = { muted: /mute=1/.test(location.search) };
export function unlock() {
  if (ctx || A.muted) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0; wind.connect(f).connect(windGain).connect(master); wind.start();
    A.windF = f;
  } catch (e) { ctx = null; }
}
function noise(dur, freq, q, vol, type = 'bandpass') {
  if (!ctx) return; const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(freq, dur, vol, type = 'triangle', when = 0, slide = 0) {
  if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
export const sfx = {
  hook(i = 0) { noise(0.06, 3200, 1.5, 0.6); tone(440 * Math.pow(2, PENTA[i % 8] / 12), 0.25, 0.12, 'sine'); },
  release() { noise(0.12, 1500, 0.8, 0.25, 'highpass'); },
  bounce() { tone(160, 0.3, 0.3, 'sine', 0, 2.5); noise(0.08, 900, 1, 0.4); },
  bonk() { noise(0.15, 300, 1, 0.6, 'lowpass'); tone(90, 0.15, 0.2, 'square', 0, 0.5); },
  flip() { tone(880, 0.12, 0.08, 'sine'); tone(1320, 0.15, 0.06, 'sine', 0.05); },
  land() { noise(0.1, 600, 1, 0.35, 'lowpass'); },
  dead() { noise(0.6, 500, 0.5, 0.5, 'lowpass'); tone(300, 0.5, 0.15, 'sine', 0, 0.4); },
  win() { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.5, 0.12, 'triangle', i * 0.08)); noise(0.4, 4000, 0.5, 0.2); },
  click() { noise(0.04, 2500, 2, 0.3); },
};
export function setWind(speed) { if (!windGain) return; const t = ctx.currentTime; windGain.gain.setTargetAtTime(Math.min(0.18, Math.max(0, speed - 8) * 0.006), t, 0.1); A.windF.frequency.setTargetAtTime(400 + speed * 30, t, 0.1); }
export function toggleMute() { A.muted = !A.muted; if (master) master.gain.value = A.muted ? 0 : 0.5; return A.muted; }
