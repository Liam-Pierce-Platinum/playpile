// Synthesised WebAudio: underwater ambience + all effects. No samples.
let ac = null, master = null, amb = null, lp = null, muted = false, noiseBuf = null;
export const audio = { enabled: true };

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5 + w * 0.15; }
    startAmbience();
  } catch (e) { ac = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.05); }
export function isMuted() { return muted; }

function startAmbience() {
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
  amb = ac.createGain(); amb.gain.value = 0;
  src.connect(lp); lp.connect(amb); amb.connect(master); src.start();
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 46;
  const og = ac.createGain(); og.gain.value = 0.05; o.connect(og); og.connect(amb); o.start();
}
// depth 0..1, under = underwater
export function ambience(level, depth01) {
  if (!ac || !amb) return;
  amb.gain.setTargetAtTime(level * 0.55, ac.currentTime, 0.4);
  lp.frequency.setTargetAtTime(520 - depth01 * 340, ac.currentTime, 0.5);
}

function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, dur, vol = 0.2, delay = 0, filt = 0) {
  if (!ac || !audio.enabled) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.006, dur, vol);
  if (filt) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; o.connect(f); f.connect(g); } else o.connect(g);
  g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, type = 'bandpass', freq = 1000, q = 1, delay = 0, f1 = 0) {
  if (!ac || !audio.enabled) return;
  const t = ac.currentTime + delay, s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1 + Math.random() * 0.3;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  const g = ac.createGain(); env(g, t, 0.005, dur, vol);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

export const sfx = {
  bubble() { const f = 500 + Math.random() * 500; tone('sine', f, f * 2.2, 0.07, 0.05); tone('sine', f * 1.3, f * 2.6, 0.06, 0.035, 0.05 + Math.random() * 0.05); },
  kick() { noise(0.18, 0.12, 'lowpass', 600, 1, 0, 200); tone('sine', 180, 90, 0.15, 0.08); },
  hit() { noise(0.25, 0.5, 'lowpass', 900, 1, 0, 150); tone('square', 110, 45, 0.25, 0.15, 0, 600); },
  bite() { noise(0.12, 0.5, 'bandpass', 1400, 2); tone('sawtooth', 160, 60, 0.2, 0.2, 0, 900); noise(0.2, 0.4, 'lowpass', 500, 1, 0.05, 120); },
  sting() { tone('square', 1200, 600, 0.12, 0.08, 0, 3000); tone('square', 900, 1500, 0.1, 0.06, 0.06, 3000); },
  zap() { for (let k = 0; k < 5; k++) tone('sawtooth', 70 + Math.random() * 60, 50, 0.06, 0.16, k * 0.04, 2400); noise(0.3, 0.2, 'highpass', 2500, 0.7); },
  cut() { noise(0.05, 0.12, 'bandpass', 2600 + Math.random() * 800, 4); },
  crank() { tone('square', 140 + Math.random() * 30, 120, 0.05, 0.05, 0, 900); },
  hatch() { tone('square', 90, 60, 0.3, 0.2, 0, 700); noise(0.4, 0.3, 'lowpass', 400, 1, 0.02, 100); tone('triangle', 520, 500, 0.4, 0.06, 0.05); },
  smash() { noise(0.4, 0.45, 'lowpass', 1800, 1, 0, 150); for (let k = 0; k < 4; k++) tone('square', 300 + Math.random() * 400, 100, 0.06, 0.06, k * 0.05, 1500); },
  hook() { tone('triangle', 660, 660, 0.08, 0.12); tone('triangle', 880, 880, 0.12, 0.12, 0.08); noise(0.25, 0.08, 'highpass', 3000, 0.5, 0.05); },
  rescue() { [523, 659, 784, 1047].forEach((f, k) => tone('square', f, f, 0.14, 0.09, k * 0.08, 3200)); tone('triangle', 1047, 1047, 0.5, 0.08, 0.32); },
  coin() { tone('square', 988, 988, 0.06, 0.07, 0, 4000); tone('square', 1319, 1319, 0.16, 0.07, 0.06, 4000); },
  lost() { tone('triangle', 392, 196, 0.9, 0.16); tone('triangle', 330, 165, 0.9, 0.12, 0.15); },
  ping() { tone('sine', 1500, 1480, 0.5, 0.18); tone('sine', 1500, 1480, 0.5, 0.06, 0.45); tone('sine', 1500, 1480, 0.4, 0.025, 0.9); },
  creak() { const f = 55 + Math.random() * 30; tone('sawtooth', f, f * 0.7, 1.2, 0.12, 0, 380); tone('sawtooth', f * 1.5, f, 0.9, 0.07, 0.2, 420); },
  boom() { noise(1.4, 0.7, 'lowpass', 300, 1, 0, 40); tone('sine', 60, 25, 1.2, 0.4); },
  hiss() { noise(0.8, 0.2, 'highpass', 3000, 0.5, 0, 6000); },
  flame() { noise(0.15, 0.05, 'bandpass', 900 + Math.random() * 500, 1.5); },
  alarm() { tone('square', 880, 880, 0.12, 0.06, 0, 2000); tone('square', 660, 660, 0.12, 0.06, 0.14, 2000); },
  heart() { tone('sine', 70, 45, 0.12, 0.35); tone('sine', 65, 40, 0.12, 0.28, 0.18); },
  breathe() { noise(0.6, 0.06, 'bandpass', 700, 1.2, 0, 400); },
  gasp() { noise(0.35, 0.18, 'bandpass', 1100, 1, 0, 600); },
  splash() { noise(0.5, 0.3, 'lowpass', 2500, 1, 0, 300); },
  click() { tone('square', 700, 700, 0.03, 0.06, 0, 3000); },
  buy() { [659, 784, 988, 1319].forEach((f, k) => tone('square', f, f, 0.08, 0.07, k * 0.05, 4000)); },
  blackout() { tone('sine', 300, 40, 2.2, 0.25); noise(2, 0.2, 'lowpass', 600, 1, 0, 60); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, k) => tone('square', f, f, 0.16, 0.08, k * 0.11, 3000)); },
  help() { tone('triangle', 700, 900, 0.1, 0.04); tone('triangle', 700, 900, 0.1, 0.04, 0.16); },
};
