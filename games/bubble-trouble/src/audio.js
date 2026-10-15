// All sound is synthesized with WebAudio. Wakes on first input.
let ac = null, master, sfx, mus, noiseBuf, muted = new URLSearchParams(location.search).has('mute');
let musicMode = 0, nextNote = 0, stepI = 0, timer = 0;

export function wake() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
  sfx = ac.createGain(); sfx.connect(master);
  mus = ac.createGain(); mus.gain.value = 0.22; mus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextNote = ac.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; }
export function isMuted() { return muted; }
export function music(mode) { musicMode = mode; }

function tone(type, f0, f1, dur, vol = 0.25, delay = 0, out = sfx) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, freq, q = 1, delay = 0, type = 'bandpass', out = sfx, f1) {
  if (!ac) return;
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

let lastCandy = 0, candyN = 0;
export const S = {
  jump() { tone('sine', 330, 720, 0.13, 0.22); tone('triangle', 165, 360, 0.1, 0.1); },
  wjump() { tone('sine', 420, 880, 0.12, 0.22); noise(0.06, 0.15, 2400, 2); },
  land(v = 1) { noise(0.08, 0.12 * v, 500, 1, 0, 'lowpass'); },
  blow() { tone('sine', 200, 520, 0.4, 0.13); noise(0.35, 0.05, 1200, 3, 0, 'bandpass', sfx, 3000); },
  deflate() { tone('sine', 500, 260, 0.12, 0.08); },
  pop() { noise(0.05, 0.5, 3000, 0.8); tone('square', 900, 120, 0.06, 0.12); },
  stick() { noise(0.12, 0.25, 700, 4, 0, 'bandpass', sfx, 300); tone('sine', 180, 120, 0.1, 0.12); },
  slamStart() { tone('sine', 700, 300, 0.12, 0.12); noise(0.15, 0.08, 2000, 1, 0, 'highpass'); },
  slam() { tone('sine', 140, 40, 0.3, 0.55); noise(0.25, 0.4, 600, 0.7, 0, 'lowpass', sfx, 120); },
  crate() { noise(0.15, 0.35, 1400, 1.5); tone('square', 260, 90, 0.1, 0.07); },
  boing() { tone('sine', 260, 640, 0.18, 0.25); tone('sine', 520, 1280, 0.14, 0.08, 0.02); },
  gum() { noise(0.1, 0.3, 900, 3); tone('sine', 300, 600, 0.12, 0.2); tone('sine', 600, 900, 0.1, 0.1, 0.05); },
  kill() { noise(0.12, 0.5, 2500, 0.8); tone('triangle', 800, 200, 0.16, 0.2); tone('sine', 1200, 2400, 0.08, 0.1, 0.04); },
  candy() {
    if (!ac) return; const now = ac.currentTime; candyN = now - lastCandy < 0.45 ? Math.min(candyN + 1, 10) : 0; lastCandy = now;
    const f = 880 * Math.pow(2, (candyN * 2) / 12); tone('sine', f, f, 0.09, 0.14); tone('sine', f * 1.5, f * 1.5, 0.12, 0.09, 0.05);
  },
  gumball() { [0, 4, 7, 12, 16].forEach((n, i) => tone('triangle', 523 * Math.pow(2, n / 12), 523 * Math.pow(2, n / 12), 0.18, 0.16, i * 0.06)); },
  heart() { [0, 7, 12].forEach((n, i) => tone('sine', 660 * Math.pow(2, n / 12), 660 * Math.pow(2, n / 12), 0.2, 0.15, i * 0.07)); },
  hurt() { tone('square', 420, 110, 0.28, 0.13); noise(0.15, 0.3, 800, 1); },
  check() { [0, 4, 7, 12].forEach((n, i) => tone('sine', 587 * Math.pow(2, n / 12), 587 * Math.pow(2, n / 12), 0.16, 0.14, i * 0.05)); },
  spring() { tone('sine', 200, 900, 0.28, 0.25); tone('triangle', 100, 450, 0.25, 0.12); },
  win() { [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => tone('triangle', 523 * Math.pow(2, n / 12), 523 * Math.pow(2, n / 12), 0.22, 0.15, i * 0.09)); },
  fail() { [7, 4, 0, -5].forEach((n, i) => tone('triangle', 392 * Math.pow(2, n / 12), 392 * Math.pow(2, n / 12), 0.3, 0.15, i * 0.14)); },
  bossHit() { tone('square', 300, 60, 0.3, 0.2); noise(0.25, 0.5, 1200, 0.6); },
  bossJump() { tone('sine', 120, 260, 0.3, 0.25); },
  bossRoar() { tone('sawtooth', 110, 70, 0.6, 0.12); noise(0.6, 0.15, 400, 2, 0, 'bandpass', sfx, 200); },
  click() { tone('sine', 660, 990, 0.06, 0.12); },
};

// --- music: tiny step sequencer. mode 0-4 = bright major, 5 = boss minor.
const PROG = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
const BOSS = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]];
const LEAD = [0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2, 3, 2, 1, 0];
function schedule() {
  if (!ac || muted) { if (ac) nextNote = Math.max(nextNote, ac.currentTime + 0.05); return; }
  const boss = musicMode === 5, bpm = boss ? 150 : 128 + musicMode * 3, sixteenth = 60 / bpm / 4;
  const root = boss ? 45 : [48, 50, 53, 47, 51][musicMode] || 48;
  while (nextNote < ac.currentTime + 0.2) {
    const bar = Math.floor(stepI / 16) % 4, s = stepI % 16, chord = (boss ? BOSS : PROG)[bar];
    const dly = nextNote - ac.currentTime, hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (s % 4 === 0) tone('triangle', hz(root - 12 + chord[0]), hz(root - 12 + chord[0]), sixteenth * 3.2, 0.5, dly, mus);
    if (s % 4 === 2) tone('triangle', hz(root + chord[0]), hz(root + chord[0]), sixteenth * 1.5, 0.25, dly, mus);
    if (s % 2 === 0 || boss) { const n = chord[LEAD[s] % 3] + (LEAD[s] === 3 ? 12 : 0) + 12; tone(boss ? 'square' : 'sine', hz(root + n), hz(root + n), sixteenth * 1.4, boss ? 0.09 : 0.18, dly, mus); }
    if (s % 4 === 2) noise(0.04, 0.12, 8000, 1, dly, 'highpass', mus);
    if (s === 0 || s === 8) noise(0.12, 0.35, 150, 1, dly, 'lowpass', mus);
    if (s === 4 || s === 12) noise(0.1, 0.18, 1800, 0.8, dly, 'bandpass', mus);
    nextNote += sixteenth; stepI++;
  }
}
