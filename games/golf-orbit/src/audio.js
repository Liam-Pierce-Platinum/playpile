// Tiny WebAudio synth: everything is generated, no sound files.
let ac = null, master = null, muted = /mute=1/.test(location.search), surf = null;
export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
  // ocean ambience: looping brown noise through a slowly breathing lowpass
  const n = noiseBuf(4, true), src = ac.createBufferSource(); src.buffer = n; src.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const g = ac.createGain(); g.gain.value = 0.12;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.08; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  src.connect(lp); lp.connect(g); g.connect(master); src.start(); surf = g;
}
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; }
function noiseBuf(sec, brown) {
  const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); let l = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
  return b;
}
let whiteB = null;
function noise(t, dur, freq, q, vol, type = 'bandpass', sweep = 0) {
  if (!whiteB) whiteB = noiseBuf(1, false);
  const s = ac.createBufferSource(); s.buffer = whiteB; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, freq, dur, vol, type = 'sine', slide = 0) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
const ok = () => ac && !muted;
export const sfx = {
  tick() { if (!ok()) return; tone(ac.currentTime, 900, 0.05, 0.08, 'square'); },
  hit(p) { if (!ok()) return; const t = ac.currentTime; noise(t, 0.08, 3000, 1, 0.6, 'highpass'); tone(t, 180, 0.18, 0.5, 'sine', 0.4); tone(t, 1200 + p * 600, 0.12, 0.15, 'triangle', 0.5); },
  bounce(kind, v) { if (!ok()) return; const t = ac.currentTime, a = Math.min(1, v / 30);
    if (kind === 0) { noise(t, 0.35, 900, 0.7, 0.35 * a + 0.05, 'bandpass', 3); noise(t + 0.03, 0.25, 2500, 1, 0.15 * a, 'highpass'); }
    else if (kind === 1) { noise(t, 0.16, 500, 0.8, 0.4 * a + 0.05, 'lowpass'); }
    else if (kind === 3) { tone(t, 140, 0.3, 0.5 * a + 0.1, 'sine', 2.2); tone(t, 280, 0.2, 0.2, 'triangle', 1.8); }
    else { tone(t, 120, 0.12, 0.4 * a + 0.05, 'sine', 0.6); noise(t, 0.08, 1200, 1, 0.15 * a, 'bandpass'); } },
  coin(i) { if (!ok()) return; const t = ac.currentTime, f = 880 * Math.pow(2, (i % 8) / 12); tone(t, f, 0.12, 0.12, 'triangle'); tone(t + 0.05, f * 1.5, 0.15, 0.1, 'triangle'); },
  boost() { if (!ok()) return; const t = ac.currentTime; noise(t, 0.6, 400, 2, 0.4, 'bandpass', 8); tone(t, 220, 0.5, 0.15, 'sawtooth', 3); },
  rocket() { if (!ok()) return; const t = ac.currentTime; noise(t, 0.5, 200, 0.8, 0.5, 'lowpass', 4); },
  zone() { if (!ok()) return; const t = ac.currentTime; [523, 659, 784, 1046].forEach((f, i) => { tone(t + i * 0.09, f, 0.35, 0.12, 'triangle'); }); },
  end() { if (!ok()) return; const t = ac.currentTime; [392, 494, 587, 784, 587, 784].forEach((f, i) => tone(t + i * 0.11, f, 0.4, 0.13, 'triangle')); },
  buy() { if (!ok()) return; const t = ac.currentTime; tone(t, 660, 0.1, 0.15, 'square'); tone(t + 0.07, 990, 0.18, 0.15, 'square'); },
};
