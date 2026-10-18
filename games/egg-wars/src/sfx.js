// WebAudio synth sounds, no files.
let ac = null, out = null, nb = null;
export const muted = /[?&]mute=1/.test(location.search);
export function unlock() {
  if (muted) return;
  if (!ac) { try {
    ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.gain.value = 0.5;
    const comp = ac.createDynamicsCompressor(); out.connect(comp); comp.connect(ac.destination);
    nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
}
function env(g, t, a, p, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(t, dur, type, f, q, vol, dest) { const s = ac.createBufferSource(); s.buffer = nb; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); env(g, t, 0.004, vol, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); }
function tone(t, type, f0, f1, dur, vol, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); const g = ac.createGain(); env(g, t, 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05); }
export function play(name, vol = 1, pan = 0) {
  if (!ac || vol < 0.02) return;
  const t = ac.currentTime; let d = out;
  if (pan) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(out); d = p; }
  switch (name) {
    case 'shoot0': noise(t, 0.08, 'bandpass', 1500, 0.8, 0.45 * vol, d); tone(t, 'square', 330, 90, 0.06, 0.12 * vol, d); break;
    case 'shoot1': noise(t, 0.25, 'lowpass', 900, 0.7, 0.8 * vol, d); tone(t, 'sawtooth', 150, 40, 0.2, 0.25 * vol, d); break;
    case 'shoot2': noise(t, 0.3, 'bandpass', 2600, 1.5, 0.55 * vol, d); tone(t, 'triangle', 950, 110, 0.28, 0.25 * vol, d); break;
    case 'hit': tone(t, 'sine', 1400, 1150, 0.05, 0.22 * vol, d); break;
    case 'head': tone(t, 'sine', 2000, 1500, 0.08, 0.28 * vol, d); noise(t, 0.05, 'highpass', 4500, 1, 0.25 * vol, d); break;
    case 'crack': noise(t, 0.06, 'highpass', 2600, 2, 0.45 * vol, d); noise(t + 0.03, 0.05, 'bandpass', 3600, 3, 0.35 * vol, d); break;
    case 'splat': noise(t, 0.4, 'lowpass', 450, 1, 0.9 * vol, d); tone(t, 'sine', 150, 40, 0.3, 0.4 * vol, d); break;
    case 'jump': tone(t, 'sine', 260, 540, 0.12, 0.12 * vol, d); break;
    case 'land': tone(t, 'sine', 120, 55, 0.1, 0.18 * vol, d); break;
    case 'reload': tone(t, 'square', 600, 600, 0.03, 0.07 * vol, d); tone(t + 0.3, 'square', 820, 820, 0.03, 0.07 * vol, d); break;
    case 'hurt': tone(t, 'sawtooth', 210, 90, 0.18, 0.16 * vol, d); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, 'triangle', f, f, 0.22, 0.2 * vol, d)); break;
    case 'start': [392, 523, 659].forEach((f, i) => tone(t + i * 0.11, 'triangle', f, f, 0.18, 0.18 * vol, d)); break;
    case 'end': [784, 659, 523, 392].forEach((f, i) => tone(t + i * 0.13, 'triangle', f, f, 0.25, 0.18 * vol, d)); break;
    case 'click': tone(t, 'sine', 900, 700, 0.04, 0.1 * vol, d); break;
  }
}
