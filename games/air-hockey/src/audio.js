// All sound is synthesised with WebAudio - no audio files.
let ac = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
let muted = false, musicOn = true, musTimer = 0, nextBeat = 0, beat = 0;

// Build the audio graph ahead of time (the context starts suspended until a tap).
// Opening the audio device can take a noticeable moment on some machines, so it is
// done while the title screen is up instead of inside the PLAY click.
export function prepareAudio() { if (!ac) build(); }
export function initAudio() {
  if (!ac) build();
  if (ac && ac.state === 'suspended') ac.resume();
}
function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  musBus = ac.createGain(); musBus.gain.value = 0.22; musBus.connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (musicOn) startMusic();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02);
}
export const isMuted = () => muted;

function tone(f, dur, { type = 'sine', vol = 0.3, to = 0, at = 0, bus = sfxBus, attack = 0.002 } = {}) {
  if (!ac || muted || ac.state !== 'running') return; // never queue sounds while the context is locked
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), gn = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(vol, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, f = 2000, q = 1, type = 'bandpass', at = 0, bus = sfxBus, to = 0 } = {}) {
  if (!ac || muted || ac.state !== 'running') return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gn = ac.createGain();
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(gn); gn.connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

const k = (v) => Math.max(0, Math.min(1, v));

export const sfx = {
  hit(speed) {
    const s = k(speed / 2200);
    tone(380 + s * 700, 0.07 + s * 0.05, { type: 'triangle', vol: 0.25 + s * 0.3, to: 160 + s * 200 });
    noise(0.04 + s * 0.04, { vol: 0.25 + s * 0.4, f: 2500 + s * 3000, q: 0.8 });
    if (s > 0.65) tone(90, 0.16, { type: 'sine', vol: 0.5, to: 45 });
  },
  wall(speed) {
    const s = k(speed / 2200);
    tone(170 + s * 90, 0.08, { type: 'sine', vol: 0.12 + s * 0.25, to: 90 });
    noise(0.05, { vol: 0.08 + s * 0.2, f: 900, q: 1.2 });
  },
  post() { tone(1320, 0.25, { type: 'sine', vol: 0.22, to: 1250 }); tone(1980, 0.18, { type: 'sine', vol: 0.1 }); },
  goal(good) {
    noise(0.6, { vol: 0.35, f: 400, to: 4000, q: 0.6 });
    tone(55, 0.5, { type: 'sine', vol: 0.6, to: 35 });
    const notes = good ? [523, 659, 784, 1047] : [440, 370, 311, 262];
    notes.forEach((n, i) => { tone(n, 0.22, { type: 'square', vol: 0.09, at: 0.05 + i * 0.075 }); tone(n * 2, 0.22, { type: 'triangle', vol: 0.06, at: 0.05 + i * 0.075 }); });
  },
  serve() { tone(660, 0.08, { type: 'triangle', vol: 0.12 }); },
  click() { tone(880, 0.05, { type: 'triangle', vol: 0.15, to: 1200 }); },
  win() { [523, 659, 784, 1047, 1319].forEach((n, i) => { tone(n, 0.35, { type: 'square', vol: 0.08, at: i * 0.1 }); tone(n / 2, 0.35, { type: 'triangle', vol: 0.1, at: i * 0.1 }); }); },
  lose() { [392, 349, 311, 233].forEach((n, i) => tone(n, 0.4, { type: 'triangle', vol: 0.14, at: i * 0.14, to: n * 0.97 })); },
  nudge() { tone(300, 0.12, { type: 'sine', vol: 0.12, to: 600 }); },
};

// ---------------------------------------------------------------- music
// A small original synthwave loop: four-on-the-floor, offbeat hats, octave bass.
const BPM = 122, SIX = 60 / BPM / 4;
const BASS = [41, 41, 41, 41, 37, 37, 37, 37, 44, 44, 44, 44, 39, 39, 39, 39]; // midi per beat (4 bars)
const LEAD = [68, 0, 72, 0, 70, 0, 68, 65, 0, 0, 63, 0, 65, 0, 0, 0];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function startMusic() {
  musicOn = true;
  if (!ac || musTimer) return;
  nextBeat = ac.currentTime + 0.1; beat = 0;
  musTimer = setInterval(schedule, 30);
}
export function stopMusic() { musicOn = false; clearInterval(musTimer); musTimer = 0; }

function schedule() {
  if (!ac) return;
  if (ac.state !== 'running') { nextBeat = ac.currentTime + 0.05; return; }
  while (nextBeat < ac.currentTime + 0.12) {
    const at = nextBeat - ac.currentTime, step = beat % 16, bar = Math.floor(beat / 16) % 4;
    if (!muted) {
      if (step % 4 === 0) { tone(110, 0.18, { type: 'sine', vol: 0.55, to: 42, at, bus: musBus }); }
      if (step % 4 === 2) noise(0.04, { vol: 0.12, f: 8000, type: 'highpass', at, bus: musBus });
      if (step === 4 || step === 12) noise(0.12, { vol: 0.12, f: 1800, q: 0.7, at, bus: musBus });
      const root = BASS[bar * 4 + Math.floor(step / 4)];
      tone(mtof(root + (step % 2 ? 12 : 0)), SIX * 0.9, { type: 'sawtooth', vol: 0.07, at, bus: musBus });
      if (bar % 2 === 1 && LEAD[step]) tone(mtof(LEAD[step] + (bar === 3 ? 3 : 0)), SIX * 1.6, { type: 'square', vol: 0.03, at, bus: musBus, attack: 0.01 });
    }
    nextBeat += SIX; beat++;
  }
}
