// All sound is synthesised with WebAudio; nothing to download. wake() on first input.
let ac = null, master, engF, engG, eng, eng2, noiseBuf, musicG, timer, nextT = 0, stepN = 0;
let muted = false;
const VOL = 0.5;
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function wake() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  engF = ac.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 500;
  engG = ac.createGain(); engG.gain.value = 0;
  eng = ac.createOscillator(); eng.type = 'sawtooth'; eng2 = ac.createOscillator(); eng2.type = 'square';
  eng.connect(engF); eng2.connect(engF); engF.connect(engG); engG.connect(master); eng.start(); eng2.start();
  musicG = ac.createGain(); musicG.gain.value = 0.15; musicG.connect(master);
  nextT = ac.currentTime + 0.1; timer = setInterval(sched, 50);
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : VOL; }
export function isMuted() { return muted; }
export function musicLevel(v) { if (musicG) musicG.gain.setTargetAtTime(v, ac.currentTime, 0.3); }

export function engine(spd, boost, on) {
  if (!ac) return;
  const t = ac.currentTime, f = 48 + Math.min(spd, 700) * 0.2 + (boost ? 35 : 0);
  eng.frequency.setTargetAtTime(f, t, 0.06); eng2.frequency.setTargetAtTime(f * 0.503, t, 0.06);
  engF.frequency.setTargetAtTime(300 + spd * 2.2 + (boost ? 900 : 0), t, 0.08);
  engG.gain.setTargetAtTime(on ? 0.035 + Math.min(spd, 600) / 600 * 0.05 : 0, t, 0.1);
}

function tone(f, t0, dur, type = 'square', vol = 0.15, f2 = null, dest = master) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, vol, freq, type = 'bandpass', f2 = null, q = 1, dest = master) {
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(freq, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
}

export function sfx(name, x = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  switch (name) {
    case 'throw': noise(t, 0.16, 0.25, 2400, 'bandpass', 500, 2); break;
    case 'deliver': tone(988, t, 0.12, 'triangle', 0.22); tone(1319, t + 0.07, 0.2, 'triangle', 0.22); tone(1976, t + 0.14, 0.25, 'sine', 0.12); noise(t, 0.08, 0.2, 5000, 'highpass'); break;
    case 'bull': [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.05, 0.18, 'square', 0.1)); break;
    case 'crash': noise(t, 0.35, 0.6, 900, 'lowpass', 120, 0.7); tone(110, t, 0.2, 'square', 0.15, 50); break;
    case 'bump': noise(t, 0.12, 0.25, 600, 'lowpass', 150); break;
    case 'near': noise(t, 0.22, 0.25, 600, 'bandpass', 3500, 3); break;
    case 'pickup': [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.06, 0.15, 'triangle', 0.2)); break;
    case 'miss': tone(330, t, 0.3, 'sawtooth', 0.1, 140); noise(t, 0.12, 0.3, 400, 'lowpass'); break;
    case 'steal': tone(620, t, 0.35, 'square', 0.12, 180); noise(t, 0.3, 0.4, 700, 'lowpass', 150); break;
    case 'horn': tone(392, t, 0.28, 'square', 0.06); tone(494, t, 0.28, 'square', 0.06); break;
    case 'combo': tone(500 + Math.min(x, 20) * 45, t, 0.09, 'square', 0.07); break;
    case 'boost': noise(t, 0.4, 0.3, 300, 'bandpass', 2000, 1.5); break;
    case 'tick': tone(1400, t, 0.05, 'square', 0.08); break;
    case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.09, 0.3, 'square', 0.1)); break;
    case 'lose': [440, 370, 311, 220].forEach((f, i) => tone(f, t + i * 0.14, 0.32, 'sawtooth', 0.09)); break;
    case 'click': tone(900, t, 0.05, 'square', 0.08); break;
    case 'buy': tone(660, t, 0.08, 'square', 0.1); tone(1320, t + 0.06, 0.15, 'square', 0.1); break;
  }
}

// little 132 bpm loop: C - Am - F - G
const ROOTS = [36, 33, 29, 31], CH = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]];
function sched() {
  if (!ac || muted) { if (ac) nextT = ac.currentTime + 0.05; return; }
  const sp = 60 / 132 / 4;
  while (nextT < ac.currentTime + 0.15) {
    const s = stepN % 16, bar = Math.floor(stepN / 16) % 4, root = ROOTS[bar], t = nextT;
    if (s % 4 === 0) { tone(150, t, 0.12, 'sine', 0.5, 45, musicG); }
    if (s === 4 || s === 12) noise(t, 0.12, 0.35, 1800, 'bandpass', null, 0.8, musicG);
    if (s % 2 === 1) noise(t, 0.03, 0.18, 8000, 'highpass', null, 1, musicG);
    if ([0, 3, 6, 8, 10, 11, 14].includes(s)) tone(mf(root + (s === 10 || s === 14 ? 12 : 0)), t, sp * 1.6, 'square', 0.13, null, musicG);
    if ([2, 7, 10, 15].includes(s)) { const n = CH[bar][(s + bar) % 3]; tone(mf(root + 36 + n), t, sp * 1.2, 'triangle', 0.08, null, musicG); }
    nextT += sp; stepN++;
  }
}
