// WebAudio synth: baa (formant-filtered vibrato saw), bonk, whoosh, rip, fall, coin, win/lose jingles.
let ac = null, master = null;
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } catch (e) { ac = null; }
}
function noise(d) { const b = ac.createBuffer(1, ac.sampleRate * d | 0, ac.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; return s; }
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, d, vol, t = ac.currentTime) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d); env(g, t, 0.005, vol, d); o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05); }
export function sfx(name, vol = 1) {
  if (!ac || vol <= 0) return;
  const t = ac.currentTime;
  if (name === 'baa') {
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    const f = 180 + Math.random() * 120; o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.85, t + 0.6);
    lfo.frequency.value = 22; lg.gain.value = f * 0.06; lfo.connect(lg).connect(o.frequency);
    const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(); f1.type = f2.type = 'bandpass'; f1.frequency.value = 700; f2.frequency.value = 1300; f1.Q.value = f2.Q.value = 6;
    env(g, t, 0.05, 0.6 * vol, 0.6); o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
  } else if (name === 'bonk') {
    tone('sine', 220, 60, 0.25, 0.8 * vol); tone('triangle', 520, 140, 0.12, 0.3 * vol);
    const n = noise(0.15), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'lowpass'; f.frequency.value = 900; env(g, t, 0.002, 0.5 * vol, 0.12); n.connect(f).connect(g).connect(master); n.start(t);
  } else if (name === 'bump') tone('sine', 160, 90, 0.1, 0.3 * vol);
  else if (name === 'whoosh' || name === 'rip') {
    const rip = name === 'rip', n = noise(0.4), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'bandpass'; f.Q.value = rip ? 3 : 1.2;
    f.frequency.setValueAtTime(rip ? 3000 : 400, t); f.frequency.exponentialRampToValueAtTime(rip ? 900 : 2200, t + 0.3);
    env(g, t, 0.03, 0.4 * vol, 0.3); n.connect(f).connect(g).connect(master); n.start(t);
  } else if (name === 'fall') tone('sine', 900, 120, 0.9, 0.3 * vol);
  else if (name === 'coin') { tone('square', 880, 880, 0.08, 0.12 * vol); tone('square', 1320, 1320, 0.15, 0.12 * vol, t + 0.08); }
  else if (name === 'win') [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.3 * vol, t + i * 0.12));
  else if (name === 'lose') [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.97, 0.3, 0.3 * vol, t + i * 0.18));
}
