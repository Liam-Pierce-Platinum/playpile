// Every sound is synthesised here with WebAudio. No files.
let ac = null, master, sfx, musicBus, noiseBuf;
let muted = false, musicOn = true;
const engines = [];
let crowd = null, musicTimer = null, musicStep = 0, musicMode = 'menu';

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ac.destination);
  sfx = ac.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (let i = 0; i < 2; i++) engines.push(makeEngine());
  crowd = makeCrowd();
  startMusic();
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02); }
export function setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ac.currentTime, 0.05); }
export function isMuted() { return muted; }

function noise(dur, { f = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, f2 = null, when = 0, pan = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  s.connect(fl); fl.connect(g);
  if (p) { p.pan.value = pan; g.connect(p); p.connect(sfx); } else g.connect(sfx);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(f, dur, { type = 'sine', gain = 0.3, f2 = null, when = 0, attack = 0.005, pan = 0, bus = null } = {}) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (p) { p.pan.value = pan; g.connect(p); p.connect(bus || sfx); } else g.connect(bus || sfx);
  o.start(t); o.stop(t + dur + 0.05);
}

function makeEngine() {
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
  const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 25;
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 400; fl.Q.value = 3;
  const g = ac.createGain(); g.gain.value = 0;
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  // boost hiss
  const bs = ac.createBufferSource(); bs.buffer = noiseBuf; bs.loop = true;
  const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 0.8;
  const bg = ac.createGain(); bg.gain.value = 0;
  o1.connect(fl); o2.connect(fl); fl.connect(g);
  bs.connect(bf); bf.connect(bg);
  if (p) { g.connect(p); bg.connect(p); p.connect(sfx); } else { g.connect(sfx); bg.connect(sfx); }
  o1.start(); o2.start(); bs.start();
  return { o1, o2, fl, g, p, bg, bf };
}
// called every frame: speed 0..2300, boosting, x -1..1 pan, on = car exists & match running
export function engine(i, speed, boosting, pan, on, grounded) {
  const e = engines[i];
  if (!e) return;
  const t = ac.currentTime, k = Math.min(1, speed / 2300);
  const f = 42 + k * 120 + (grounded ? 0 : 18);
  e.o1.frequency.setTargetAtTime(f, t, 0.06); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
  e.fl.frequency.setTargetAtTime(260 + k * 1400 + (boosting ? 500 : 0), t, 0.08);
  e.g.gain.setTargetAtTime(on ? 0.05 + k * 0.07 : 0, t, 0.08);
  e.bg.gain.setTargetAtTime(on && boosting ? 0.22 : 0, t, boosting ? 0.02 : 0.08);
  e.bf.frequency.setTargetAtTime(1000 + k * 1600, t, 0.1);
  if (e.p) e.p.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, pan)), t, 0.1);
}
function makeCrowd() {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
  const g = ac.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(sfx); s.start();
  return { g, f, level: 0 };
}
// crowd excitement 0..1
export function crowdLevel(v, on) {
  if (!crowd) return;
  crowd.g.gain.setTargetAtTime(on ? 0.025 + v * 0.16 : 0, ac.currentTime, v > crowd.level ? 0.1 : 0.6);
  crowd.f.frequency.setTargetAtTime(600 + v * 500, ac.currentTime, 0.3);
  crowd.level = v;
}

export const sfxs = {
  hit(power, pan) {
    const k = Math.min(1, power / 2500);
    tone(140 + k * 60, 0.18 + k * 0.1, { type: 'sine', gain: 0.35 + k * 0.4, f2: 45, pan });
    noise(0.08 + k * 0.1, { f: 1800 + k * 1500, q: 0.7, gain: 0.25 + k * 0.4, pan });
    if (k > 0.55) tone(70, 0.35, { type: 'triangle', gain: 0.4, f2: 30, pan });
  },
  bounce(power, pan) {
    const k = Math.min(1, power / 2500);
    tone(90, 0.15, { gain: 0.15 + k * 0.3, f2: 40, pan });
    noise(0.06, { f: 600, q: 0.8, gain: 0.08 + k * 0.18, pan });
  },
  jump(pan) { noise(0.12, { f: 900, f2: 2600, q: 1.2, gain: 0.18, pan }); tone(220, 0.1, { type: 'triangle', gain: 0.08, f2: 420, pan }); },
  flip(pan) { noise(0.25, { f: 700, f2: 3000, q: 2, gain: 0.25, pan }); },
  land(power, pan) { if (power > 250) noise(0.08, { f: 300, q: 1, gain: Math.min(0.25, power / 3000), pan }); },
  boostStart(pan) { noise(0.18, { f: 500, f2: 2200, q: 1, gain: 0.18, type: 'bandpass', pan }); },
  supersonic(pan) { tone(880, 0.3, { type: 'sine', gain: 0.06, f2: 1760, pan }); noise(0.3, { f: 4000, q: 2, gain: 0.08, pan }); },
  bump(power, pan) { tone(70, 0.2, { type: 'square', gain: Math.min(0.3, power / 3000), f2: 40, pan }); noise(0.1, { f: 400, q: 1, gain: 0.2, pan }); },
  demo(pan) {
    noise(0.9, { f: 2000, f2: 120, q: 0.6, gain: 0.8, type: 'lowpass', pan });
    tone(60, 0.8, { type: 'sawtooth', gain: 0.35, f2: 25, pan });
  },
  turn(pan) { noise(0.12, { f: 2500, q: 3, gain: 0.06, pan }); },
  beep(hi) { tone(hi ? 1320 : 660, hi ? 0.5 : 0.18, { type: 'square', gain: 0.12 }); },
  click() { tone(900, 0.05, { type: 'square', gain: 0.07, f2: 1300 }); },
  goal(team) {
    noise(1.6, { f: 3000, f2: 80, q: 0.5, gain: 0.9, type: 'lowpass' });
    tone(55, 1.4, { type: 'sawtooth', gain: 0.4, f2: 30 });
    const base = team === 0 ? 392 : 349;
    [0, 4, 7, 12].forEach((s, i) => tone(base * 2 ** (s / 12), 1.4, { type: 'sawtooth', gain: 0.07, when: 0.15 + i * 0.03, attack: 0.04 }));
    tone(base / 2, 1.6, { type: 'square', gain: 0.1, when: 0.15, attack: 0.05 });
    noise(2.5, { f: 900, q: 0.4, gain: 0.35, when: 0.1, attack: 0.3 });
  },
  whistle() { tone(2400, 0.5, { type: 'sine', gain: 0.12 }); tone(2480, 0.5, { type: 'sine', gain: 0.1 }); },
  horn() { [0, 0.1].forEach((w) => tone(196, 1.2, { type: 'sawtooth', gain: 0.18, when: w })); tone(247, 1.3, { type: 'sawtooth', gain: 0.12 }); },
  levelUp() { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * 2 ** (s / 12), 0.25, { type: 'triangle', gain: 0.14, when: i * 0.07 })); },
  save() { tone(660, 0.12, { type: 'square', gain: 0.08 }); tone(990, 0.2, { type: 'square', gain: 0.08, when: 0.08 }); },
};

// ---- music: a small synth loop. menu = chill, match = driving ----
const BPM = 124;
const BASS = [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 7, 7, 10, 12];
const LEAD = [12, -1, 15, -1, 19, -1, 17, 15, 12, -1, 10, -1, 12, -1, -1, -1];
function startMusic() {
  if (musicTimer) return;
  const stepDur = 60 / BPM / 4;
  let next = ac.currentTime + 0.1;
  musicTimer = setInterval(() => {
    while (next < ac.currentTime + 0.25) {
      playStep(musicStep, next, stepDur);
      musicStep = (musicStep + 1) % 64;
      next += stepDur;
    }
  }, 60);
}
function playStep(i, t, d) {
  if (!musicOn || muted) return;
  const when = t - ac.currentTime;
  const bar = Math.floor(i / 16) % 4, s = i % 16;
  const root = [0, -4, -2, -5][bar];
  const match = musicMode === 'match';
  // kick + hats
  if (s % 4 === 0) tone(110, 0.16, { type: 'sine', gain: match ? 0.5 : 0.3, f2: 40, when, bus: musicBus });
  if (match && s % 4 === 2) noise(0.04, { f: 8000, q: 1, gain: 0.08, when, type: 'highpass' });
  if (s === 4 || s === 12) noise(0.12, { f: 1800, q: 0.8, gain: match ? 0.14 : 0.06, when });
  const b = BASS[s];
  tone(55 * 2 ** ((b + root) / 12), d * 1.6, { type: 'sawtooth', gain: 0.1, when, attack: 0.01, bus: musicBus });
  if (!match) { const l = LEAD[s]; if (l >= 0 && bar % 2 === 1) tone(220 * 2 ** ((l + root) / 12), d * 2.5, { type: 'triangle', gain: 0.07, when, attack: 0.02, bus: musicBus }); }
  else if (s % 8 === 6) tone(440 * 2 ** ((7 + root) / 12), d * 1.5, { type: 'square', gain: 0.03, when, bus: musicBus });
}
export function setMusicMode(m) { musicMode = m; }
