// All sound is synthesized with WebAudio - no files. The context wakes on the first input.
let ac = null, master = null, musicGain = null, noiseBuf = null, muted = false, musicOn = false, nextBeat = 0, beat = 0;
export const audio = {
  get muted() { return muted; },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
  wake() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.16;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; musicGain.connect(lp); lp.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  },
  get ready() { return !!ac && ac.state === 'running'; },
};

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function osc(type, f0, f1, dur, vol, dest = master, t = ac.currentTime) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.004, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, q = 1, type = 'bandpass', t = ac.currentTime, dest = master) {
  const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, 0.003, vol, dur); n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + dur + 0.05);
}

export function sfx(name, x = 0.5) {
  if (!ac || muted || ac.state !== 'running') return;
  const r = 0.92 + Math.random() * 0.16;
  switch (name) {
    case 'punch': osc('sine', 180 * r, 60, 0.09, 0.7); noise(0.06, 0.5, 2400 * r, 1.2); break;
    case 'heavy': osc('sine', 120 * r, 38, 0.22, 0.95); osc('square', 90, 40, 0.12, 0.18); noise(0.16, 0.7, 900 * r, 0.8); break;
    case 'trade': osc('triangle', 520 * r, 260, 0.12, 0.25); break;
    case 'swing': noise(0.07, 0.12, 3200 * r, 2, 'highpass'); break;
    case 'jump': osc('square', 260, 520, 0.08, 0.06); break;
    case 'pad': osc('square', 200, 900, 0.18, 0.12); break;
    case 'spike': osc('sawtooth', 900 * r, 120, 0.25, 0.32); noise(0.2, 0.5, 4200, 1.5); osc('sine', 90, 40, 0.2, 0.8); break;
    case 'zap': for (let i = 0; i < 4; i++) osc('square', 1400 - i * 260, 300, 0.05, 0.12, master, ac.currentTime + i * 0.035); noise(0.22, 0.4, 6000, 3); osc('sine', 80, 40, 0.2, 0.6); break;
    case 'slam': noise(0.25, 0.8, 300, 0.7, 'lowpass'); osc('sine', 70, 30, 0.3, 0.9); break;
    case 'fall': osc('sine', 600, 60, 0.6, 0.3); break;
    case 'ko': osc('sawtooth', 220, 40, 1.1, 0.35); osc('sine', 60, 25, 1.0, 1.0); noise(0.8, 0.5, 500, 0.6, 'lowpass'); break;
    case 'bell': [0, 0.12].forEach((d) => { osc('sine', 1320, 1300, 0.6, 0.25, master, ac.currentTime + d); osc('sine', 1980, 1970, 0.4, 0.12, master, ac.currentTime + d); }); break;
    case 'fight': osc('sawtooth', 110, 220, 0.3, 0.25); osc('square', 220, 440, 0.3, 0.12); noise(0.3, 0.3, 1200, 0.7); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => osc('square', f, f, 0.18, 0.12, master, ac.currentTime + i * 0.09)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => osc('triangle', f, f * 0.98, 0.25, 0.2, master, ac.currentTime + i * 0.13)); break;
    case 'click': osc('square', 880, 880, 0.04, 0.08); break;
  }
}

// tiny synthwave loop: kick + offbeat bass arpeggio, scheduled ahead
const BASS = [41, 41, 53, 41, 44, 44, 56, 44, 39, 39, 51, 39, 36, 36, 48, 43];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export function music(on) { musicOn = on; }
export function tickMusic() {
  if (!ac || muted || !musicOn || ac.state !== 'running') return;
  const spb = 60 / 128 / 2;
  if (nextBeat < ac.currentTime) nextBeat = ac.currentTime + 0.05;
  while (nextBeat < ac.currentTime + 0.2) {
    const t = nextBeat, i = beat % 16;
    if (i % 2 === 0) { osc('sine', 150, 42, 0.18, 0.9, musicGain, t); }
    else noise(0.04, 0.035, 8000, 1, 'highpass', t, master);
    osc('sawtooth', mtof(BASS[Math.floor(beat / 2) % 16]), mtof(BASS[Math.floor(beat / 2) % 16]) * 0.99, 0.14, 0.35, musicGain, t + 0.002);
    nextBeat += spb; beat++;
  }
}
