// Tiny WebAudio synth: every sound is generated, nothing to load.
// The context wakes on the first user input (browsers block it before that).
let ac = null, master = null, musicGain = null, noiseBuf = null;
let muted = /[?&]mute/.test(location.search);
let musicOn = true, nextBeat = 0, beat = 0, musicTimer = 0;

export function wake() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
  musicGain = ac.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextBeat = ac.currentTime + 0.1;
  musicTimer = setInterval(schedule, 50);
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }
export function isMuted() { return muted; }
export function setMusic(on) { musicOn = on; }

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, at = 0, out = master, attack = 0.005 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.3, f = 2000, q = 1, type = 'bandpass', at = 0, fEnd = 0, out = master } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

export const sfx = {
  jump() { tone(320, 0.16, { type: 'square', vol: 0.12, slide: 2.2 }); noise(0.08, { vol: 0.08, f: 3000 }); },
  djump() { tone(520, 0.18, { type: 'triangle', vol: 0.18, slide: 2 }); tone(780, 0.14, { type: 'sine', vol: 0.1, slide: 1.6, at: 0.03 }); },
  land(h) { noise(0.09, { vol: 0.12 + h * 0.15, f: 400, type: 'lowpass' }); tone(110, 0.08, { type: 'sine', vol: 0.15, slide: 0.6 }); },
  slide() { noise(0.35, { vol: 0.12, f: 1800, fEnd: 500, q: 0.8 }); },
  coin(n) { const f = 880 * Math.pow(1.0595, Math.min(n, 14)); tone(f, 0.09, { type: 'square', vol: 0.07 }); tone(f * 1.5, 0.14, { type: 'square', vol: 0.06, at: 0.05 }); },
  glass() {
    noise(0.5, { vol: 0.45, f: 5000, q: 0.6, type: 'highpass' });
    noise(0.15, { vol: 0.3, f: 300, type: 'lowpass' });
    for (let i = 0; i < 7; i++) tone(2400 + Math.random() * 3000, 0.12 + Math.random() * 0.2, { type: 'sine', vol: 0.05, at: Math.random() * 0.25 });
  },
  crash() { noise(0.5, { vol: 0.5, f: 600, type: 'lowpass', fEnd: 120 }); tone(140, 0.4, { type: 'sawtooth', vol: 0.2, slide: 0.3 }); },
  fall() { tone(600, 0.9, { type: 'triangle', vol: 0.15, slide: 0.15 }); noise(0.9, { vol: 0.1, f: 1500, fEnd: 200 }); },
  combo(n) { [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(1.0595, s + n), 0.1, { type: 'square', vol: 0.06, at: i * 0.04 })); },
  milestone() { [0, 4, 7, 12, 16].forEach((s, i) => tone(392 * Math.pow(1.0595, s), 0.2, { type: 'triangle', vol: 0.12, at: i * 0.07 })); },
  click() { tone(660, 0.05, { type: 'square', vol: 0.08 }); },
  buy() { [0, 7, 12, 19].forEach((s, i) => tone(523 * Math.pow(1.0595, s), 0.16, { type: 'square', vol: 0.08, at: i * 0.06 })); },
};

// Driving synthwave loop: bass on 8ths, kick/snare/hat, minor progression.
const PROG = [45, 45, 41, 43]; // A, A, F, G (MIDI-ish bass roots)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let intensity = 0;
export function setIntensity(v) { intensity = v; }
function schedule() {
  if (!ac || !musicOn || muted) { if (ac) nextBeat = ac.currentTime + 0.1; return; }
  const spb = 60 / (124 + intensity * 24) / 2; // eighth notes
  while (nextBeat < ac.currentTime + 0.15) {
    const at = nextBeat - ac.currentTime, step = beat % 8, bar = Math.floor(beat / 8) % 4;
    const root = PROG[bar];
    tone(mtof(root + (step % 2 ? 12 : 0)), spb * 0.9, { type: 'sawtooth', vol: 0.09, at, out: musicGain, attack: 0.004 });
    if (step % 4 === 0) { tone(120, 0.18, { type: 'sine', vol: 0.5, slide: 0.35, at, out: musicGain }); }
    if (step === 4) noise(0.14, { vol: 0.22, f: 1800, at, out: musicGain });
    noise(0.03, { vol: step % 2 ? 0.06 : 0.1, f: 8000, type: 'highpass', at, out: musicGain });
    if (intensity > 0.3 && (step === 0 || step === 3 || step === 6)) tone(mtof(root + 24 + [0, 3, 7][step % 3]), spb * 1.4, { type: 'square', vol: 0.035, at, out: musicGain });
    nextBeat += spb; beat++;
  }
}
