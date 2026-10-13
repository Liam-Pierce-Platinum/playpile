// Tiny WebAudio synth: every sound is generated, nothing is loaded.
let ac = null, master = null, muted = false;
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
  } catch (e) { ac = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

function tone(f, dur, type = 'square', vol = 0.2, f2 = null, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol = 0.2, freq = 1200, delay = 0, q = 1) {
  if (!ac || muted) return;
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}
const TYPE_SHOT = {
  ember: () => { noise(0.18, 0.25, 900, 0, 0.7); tone(300, 0.12, 'sawtooth', 0.08, 120); },
  leaf: () => { noise(0.1, 0.18, 3000, 0, 2); tone(900, 0.06, 'triangle', 0.08, 1300); },
  splash: () => { tone(500, 0.12, 'sine', 0.2, 900); tone(700, 0.08, 'sine', 0.1, 1200, 0.04); },
  spark: () => { tone(1400, 0.08, 'square', 0.08, 300); noise(0.06, 0.15, 5000, 0, 3); },
  stone: () => { tone(160, 0.14, 'square', 0.14, 70); noise(0.1, 0.2, 400); },
  frost: () => { tone(1800, 0.1, 'triangle', 0.08, 2400); noise(0.08, 0.12, 6000, 0, 2); },
  shade: () => { tone(220, 0.16, 'sawtooth', 0.08, 110); noise(0.12, 0.12, 500, 0, 1); },
  gale: () => { noise(0.2, 0.2, 1500, 0, 0.4); tone(600, 0.1, 'sine', 0.06, 900); },
  bug: () => { tone(260, 0.1, 'square', 0.06, 300); tone(280, 0.1, 'square', 0.05, 250, 0.03); },
  fae: () => { tone(1320, 0.08, 'triangle', 0.08); tone(1760, 0.1, 'triangle', 0.07, null, 0.05); },
  normal: () => { noise(0.08, 0.2, 1800); tone(400, 0.06, 'square', 0.08, 200); },
};
export const sfx = {
  shot: (type) => (TYPE_SHOT[type] || TYPE_SHOT.normal)(),
  hit: (big) => { noise(big ? 0.16 : 0.08, big ? 0.4 : 0.28, big ? 700 : 1400); tone(big ? 140 : 220, 0.09, 'square', 0.15, 60); },
  super: () => { tone(880, 0.07, 'square', 0.1); tone(1320, 0.1, 'square', 0.1, null, 0.05); },
  dash: () => { noise(0.2, 0.2, 2200, 0, 0.5); tone(200, 0.15, 'triangle', 0.1, 500); },
  dodge: () => { noise(0.12, 0.15, 3500, 0, 0.6); },
  nova: () => { tone(120, 0.35, 'sawtooth', 0.15, 50); noise(0.3, 0.25, 600); },
  boom: () => { noise(0.45, 0.45, 300, 0, 0.6); tone(90, 0.35, 'square', 0.18, 40); },
  warn: () => { tone(660, 0.05, 'square', 0.06); },
  heal: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, null, i * 0.07)); },
  buff: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.07, null, i * 0.05)); },
  ko: () => { tone(500, 0.5, 'square', 0.15, 60); noise(0.4, 0.25, 500); },
  coin: () => { tone(988, 0.06, 'square', 0.1); tone(1319, 0.14, 'square', 0.1, null, 0.06); },
  click: () => { tone(700, 0.04, 'square', 0.07, 900); },
  bad: () => { tone(200, 0.15, 'square', 0.1, 120); },
  crack: () => { noise(0.08, 0.3, 2500, 0, 2); tone(300, 0.05, 'square', 0.08, 200); },
  reveal: (tier) => {
    const base = [523, 587, 659, 784][tier];
    [0, 4, 7, 12, 16].slice(0, 3 + tier).forEach((s, i) => tone(base * Math.pow(2, s / 12), 0.25, 'square', 0.1, null, i * 0.08));
    noise(0.5, 0.2, 4000, 0, 0.5);
  },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.1, null, i * 0.1)); },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, null, i * 0.16)); },
  level: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'square', 0.09, null, i * 0.06)); },
  evolve: () => { for (let i = 0; i < 12; i++) tone(300 + i * 60, 0.1, 'triangle', 0.08, null, i * 0.12); },
  evolved: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, 'square', 0.09, null, i * 0.07)); noise(0.8, 0.2, 5000, 0, 0.4); },
};
