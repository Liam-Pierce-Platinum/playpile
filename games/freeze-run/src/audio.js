// WebAudio synth: playground chime song, buzzer, pops. No samples.
let ac = null, master = null, muted = false;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const TUNE = [4, 4, 5, 4, 3, 2, 3, 1, 2, 0, 1, 0];
function ctx() { return ac && !muted ? ac : null; }
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f, dur, peak, f2) {
  const c = ctx(); if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, 0.005, peak, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, peak, fc, q = 1, type = 'bandpass', fc2) {
  const c = ctx(); if (!c) return; const t = c.currentTime, n = c.sampleRate * dur | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = type; f.frequency.setValueAtTime(fc, t); if (fc2) f.frequency.exponentialRampToValueAtTime(fc2, t + dur); f.Q.value = q;
  env(g, t, 0.005, peak, dur); s.connect(f).connect(g).connect(master); s.start(t);
}
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
export const sfx = {
  unlock() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } catch { return; } } if (ac.state === 'suspended') ac.resume(); },
  mute(m) { muted = m; },
  note(i, n) { // song resolves to the tonic as it ends: the cue she is about to turn
    const deg = i >= n - 1 ? 0 : TUNE[i % TUNE.length], f = midi(72 + SCALE[deg]);
    tone('triangle', f, 0.32, 0.22); tone('sine', f * 2, 0.18, 0.06);
    if (i >= n - 2) tone('sine', f / 2, 0.4, 0.12);
  },
  tick() { tone('square', 880, 0.08, 0.08); },
  whoosh() { noise(0.4, 0.25, 400, 0.8, 'bandpass', 2400); },
  buzz() { tone('sawtooth', 110, 0.45, 0.16, 104); tone('square', 55, 0.45, 0.08); },
  fake() { noise(0.25, 0.15, 600, 1, 'bandpass', 1500); tone('triangle', 300, 0.15, 0.08, 500); },
  pop(v = 1) { tone('sine', 900, 0.18, 0.3 * v, 140); noise(0.12, 0.25 * v, 1800, 0.7); },
  bonk() { tone('sine', 220, 0.2, 0.25, 120); },
  step() { noise(0.05, 0.05, 900, 1.5); },
  cheer() { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tone('triangle', midi(72 + s), 0.3, 0.2), i * 80)); },
  win() { [0, 4, 7, 12, 16].forEach((s, i) => setTimeout(() => { tone('triangle', midi(76 + s), 0.35, 0.18); tone('sine', midi(64 + s), 0.35, 0.1); }, i * 110)); },
  lose() { [7, 4, 1, -2].forEach((s, i) => setTimeout(() => tone('triangle', midi(64 + s), 0.4, 0.18), i * 160)); },
};
