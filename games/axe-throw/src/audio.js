// All sound is synthesised with WebAudio. No files.
let ac = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
let muted = false, musicTimer = null, nextNote = 0, step = 0;

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ac.currentTime, 0.02);
}
export function isMuted() { return muted; }

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
    musBus = ac.createGain(); musBus.gain.value = 0.13; musBus.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend(); else ac.resume();
    });
  } catch (e) { ac = null; }
}

function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function tone(type, f0, f1, dur, vol, t0 = 0, bus = sfxBus) {
  if (!ac) return;
  const t = ac.currentTime + t0;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.004, vol, dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(ftype, f0, f1, q, dur, vol, t0 = 0, bus = sfxBus) {
  if (!ac) return;
  const t = ac.currentTime + t0;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ac.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, 0.003, vol, dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

export const sfx = {
  throw() { noise('bandpass', 900, 3200, 1.2, 0.09, 0.28); },
  hit(combo = 1) {
    const p = 1 + Math.min(combo - 1, 6) * 0.05;
    tone('sine', 170 * p, 55, 0.13, 0.9);
    noise('bandpass', 1400, 500, 2, 0.06, 0.7);
    noise('lowpass', 600, 200, 0.7, 0.12, 0.5);
    if (combo >= 3) tone('triangle', 660 * p, 660 * p, 0.08, 0.12, 0.02);
  },
  apple() {
    noise('highpass', 2500, 1800, 0.8, 0.12, 0.45);
    tone('sine', 520, 300, 0.12, 0.3);
    tone('square', 1320, 1320, 0.06, 0.08, 0.06);
    tone('square', 1760, 1760, 0.12, 0.08, 0.12);
  },
  clang() {
    [523, 1230, 1871, 2650, 3420].forEach((f, i) => tone('sine', f, f * 0.985, 0.7 - i * 0.08, 0.32 - i * 0.04));
    noise('highpass', 3000, 3000, 0.7, 0.1, 0.6);
    tone('sawtooth', 110, 60, 0.35, 0.18, 0.05);
  },
  crack(boss) {
    noise('lowpass', 2400, 200, 0.8, boss ? 1.0 : 0.6, 0.9);
    tone('sine', 120, 40, 0.4, 0.9);
    for (let i = 0; i < (boss ? 6 : 3); i++) noise('bandpass', 900 + Math.random() * 900, 400, 3, 0.07, 0.5, 0.03 + i * 0.06);
    if (boss) [392, 494, 587, 784].forEach((f, i) => tone('triangle', f, f, 0.35, 0.16, 0.25 + i * 0.09));
    else [523, 784].forEach((f, i) => tone('triangle', f, f, 0.18, 0.12, 0.12 + i * 0.07));
  },
  boss() {
    [98, 147, 196].forEach((f) => tone('sawtooth', f, f * 0.98, 0.9, 0.12));
    noise('lowpass', 300, 120, 1, 0.8, 0.5);
    tone('sine', 60, 40, 0.8, 0.6);
  },
  close() { tone('sine', 900, 2400, 0.12, 0.16, 0.03); tone('triangle', 1800, 1800, 0.06, 0.07, 0.12); },
  click() { tone('triangle', 880, 660, 0.05, 0.18); },
  buy() { [659, 880, 1319].forEach((f, i) => tone('square', f, f, 0.1, 0.07, i * 0.07)); },
  deny() { tone('square', 200, 150, 0.15, 0.1); },
  unlock() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.18, i * 0.08)); },
};

// A light stomp-and-pluck loop, G major pentatonic, 112 bpm.
const MEL = [67, 0, 71, 74, 0, 74, 71, 0, 69, 0, 67, 64, 0, 67, 69, 0,
  67, 0, 71, 74, 0, 76, 74, 0, 71, 0, 69, 67, 0, 64, 67, 0];
const BASS = [43, 43, 50, 50, 40, 40, 47, 47];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  nextNote = ac.currentTime + 0.1;
  const spb = 60 / 112 / 4;
  musicTimer = setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    while (nextNote < ac.currentTime + 0.25) {
      const dt = nextNote - ac.currentTime;
      const m = MEL[step % MEL.length];
      if (m) { tone('triangle', mtof(m), mtof(m), 0.22, 0.5, dt, musBus); tone('square', mtof(m + 12), mtof(m + 12), 0.05, 0.06, dt, musBus); }
      if (step % 4 === 0) {
        const b = BASS[Math.floor(step / 4) % BASS.length];
        tone('sine', mtof(b), mtof(b), 0.3, 0.7, dt, musBus);
      }
      if (step % 8 === 0) tone('sine', 110, 45, 0.12, 0.9, dt, musBus);
      if (step % 8 === 4) noise('bandpass', 1500, 1200, 1, 0.08, 0.5, dt, musBus);
      nextNote += spb; step++;
    }
  }, 60);
}
