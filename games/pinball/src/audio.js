// All sound is synthesised with WebAudio: no audio files. Includes a quiet synth music loop.
let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = false, musicOn = false, nextBeat = 0, beat = 0, musicTimer = null;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02); }
export function isMuted() { return muted; }

function tone(f, dur, type = 'sine', vol = 0.3, f2 = null, when = 0, bus = sfxBus) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 2000, type = 'bandpass', when = 0, q = 1, f2 = null) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const arp = (notes, step, type = 'square', vol = 0.18, len = 0.12) => notes.forEach((n, i) => tone(n, len, type, vol, null, i * step));

const BUMP_F = [660, 784, 988];
export function sfx(name, a) {
  if (!ac || muted) return;
  switch (name) {
    case 'flip': noise(0.05, 0.5, 1400, 'bandpass', 0, 0.8); tone(110, 0.07, 'square', 0.18, 55); break;
    case 'flipDown': noise(0.03, 0.18, 900, 'bandpass'); break;
    case 'bumper': tone(BUMP_F[a % 3], 0.14, 'triangle', 0.35, BUMP_F[a % 3] / 2); tone(BUMP_F[a % 3] * 2, 0.06, 'sine', 0.12); noise(0.04, 0.35, 3000); break;
    case 'sling': tone(240, 0.09, 'square', 0.22, 90); noise(0.06, 0.4, 1800); break;
    case 'drop': tone(520, 0.05, 'square', 0.2); tone(260, 0.1, 'square', 0.18, 130, 0.04); noise(0.05, 0.3, 900); break;
    case 'stand': tone(880, 0.08, 'square', 0.16, 1320); noise(0.03, 0.25, 2500); break;
    case 'bank': arp([523, 659, 784, 1047], 0.06, 'square', 0.18); break;
    case 'reset': noise(0.12, 0.3, 600, 'lowpass'); tone(150, 0.1, 'square', 0.15, 300); break;
    case 'spin': noise(0.015, 0.16, 5000, 'highpass'); tone(1800, 0.015, 'square', 0.04); break;
    case 'lane': tone([1047, 1175, 1319][a] || 1047, 0.09, 'sine', 0.22); break;
    case 'skill': arp([784, 988, 1175, 1568, 1976], 0.05, 'square', 0.2, 0.1); noise(0.4, 0.2, 4000, 'highpass'); break;
    case 'orbit': tone(300, 0.35, 'sawtooth', 0.12, 1400); noise(0.3, 0.15, 800, 'bandpass', 0, 2, 4000); break;
    case 'ramp': tone(200, 0.6, 'sawtooth', 0.1, 900); noise(0.6, 0.12, 500, 'bandpass', 0, 3, 3000); break;
    case 'rampDone': arp([659, 880, 1319], 0.05, 'triangle', 0.25); break;
    case 'saucer': tone(400, 0.5, 'sine', 0.35, 50); noise(0.5, 0.2, 2000, 'lowpass', 0, 1, 100); break;
    case 'kick': noise(0.08, 0.5, 800); tone(90, 0.1, 'square', 0.25, 50); break;
    case 'launch': noise(0.25, 0.35 + (a || 0) * 0.2, 400, 'bandpass', 0, 1, 3000); tone(80, 0.12, 'square', 0.2, 40); break;
    case 'pull': tone(90, 0.6, 'sawtooth', 0.05, 60); break;
    case 'thud': noise(0.03, 0.15 * (a || 0.5) + 0.05, 700); break;
    case 'nudge': noise(0.12, 0.45, 180, 'lowpass'); tone(60, 0.12, 'sine', 0.35, 40); break;
    case 'danger': tone(440, 0.12, 'square', 0.2); tone(440, 0.12, 'square', 0.2, null, 0.2); break;
    case 'tilt': tone(70, 0.9, 'sawtooth', 0.35, 55); tone(73, 0.9, 'sawtooth', 0.3, 50); break;
    case 'combo': arp([880 * Math.pow(1.06, a || 1), 1320 * Math.pow(1.06, a || 1)], 0.05, 'square', 0.18); break;
    case 'mission': arp([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 'square', 0.2, 0.14); noise(0.6, 0.15, 5000, 'highpass'); break;
    case 'jackpot': arp([392, 523, 659, 784, 1047, 1319, 1568], 0.06, 'sawtooth', 0.16, 0.16); tone(65, 0.8, 'square', 0.3, 40); noise(0.8, 0.25, 3000, 'highpass'); break;
    case 'multiball': for (let i = 0; i < 6; i++) { tone(i % 2 ? 880 : 660, 0.14, 'square', 0.18, null, i * 0.15); } break;
    case 'lock': arp([330, 440, 554], 0.08, 'square', 0.2); break;
    case 'extra': arp([523, 784, 1047, 1568], 0.09, 'triangle', 0.3, 0.2); break;
    case 'save': arp([784, 1047, 784, 1047], 0.08, 'square', 0.15); break;
    case 'drainSoft': tone(300, 0.3, 'triangle', 0.2, 120); break;
    case 'drain': tone(392, 0.25, 'sawtooth', 0.2, 300); tone(300, 0.3, 'sawtooth', 0.2, 200, 0.22); tone(220, 0.7, 'sawtooth', 0.22, 70, 0.48); break;
    case 'over': arp([392, 330, 262, 196], 0.18, 'triangle', 0.25, 0.3); break;
    case 'start': arp([262, 392, 523, 784], 0.07, 'square', 0.2); break;
    case 'ui': tone(1200, 0.05, 'sine', 0.15); break;
  }
}

// ---- music: synthwave-ish bass + arpeggio, scheduled ahead ----
const BASS = [55, 55, 65.4, 49];                  // A1 A1 C2 G1 (one bar each)
const ARPN = [[220, 261.6, 329.6, 440], [220, 261.6, 329.6, 440], [261.6, 329.6, 392, 523.3], [196, 246.9, 293.7, 392]];
export function startMusic() {
  if (!ac || musicOn) return;
  musicOn = true; nextBeat = ac.currentTime + 0.1; beat = 0;
  musicTimer = setInterval(scheduleMusic, 50);
}
// quieter music outside gameplay (title, pause, results)
export function duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.05 : 0.16, ac.currentTime, 0.15); }
export function stopMusic() { musicOn = false; clearInterval(musicTimer); }
function scheduleMusic() {
  if (!ac || !musicOn) return;
  const step = 60 / 124 / 4;           // 16ths at 124 bpm
  if (nextBeat < ac.currentTime) nextBeat = ac.currentTime + 0.05; // timer was throttled (background tab): skip, do not burst
  while (nextBeat < ac.currentTime + 0.2) {
    const w = nextBeat - ac.currentTime, bar = Math.floor(beat / 16) % 4, s = beat % 16;
    if (s % 2 === 0) tone(BASS[bar] * (s % 4 === 2 ? 2 : 1), step * 1.8, 'sawtooth', 0.35, null, w, musicBus);
    if (s % 4 === 0) tone(50, 0.12, 'sine', 0.5, 35, w, musicBus);
    const n = ARPN[bar][s % 4] * 2;
    if (s % 2 === 1 || s % 3 === 0) tone(n, step * 0.9, 'square', 0.08, null, w, musicBus);
    nextBeat += step; beat++;
  }
}
