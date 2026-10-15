// WebAudio, all synthesized. Wakes on the first key/tap (browsers block audio before that).
let ac = null, master, noise, thrG, thrF, whG, whO;
export const A = { muted: /[?&]mute=1/.test(location.search) };

export function wake() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  ac = new C();
  master = ac.createGain(); master.gain.value = A.muted ? 0 : 0.55;
  const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // thrust: looping filtered noise, gain driven every frame
  const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
  thrF = ac.createBiquadFilter(); thrF.type = 'bandpass'; thrF.frequency.value = 700; thrF.Q.value = 0.8;
  thrG = ac.createGain(); thrG.gain.value = 0;
  src.connect(thrF); thrF.connect(thrG); thrG.connect(master); src.start();
  // the firework whistle: pitch rises with speed
  whO = ac.createOscillator(); whO.type = 'sine'; whO.frequency.value = 900;
  whG = ac.createGain(); whG.gain.value = 0; whO.connect(whG); whG.connect(master); whO.start();
}

export function setMuted(m) { A.muted = m; if (master) master.gain.value = m ? 0 : 0.55; }

export function engine(thrusting, speed, alive) {
  if (!ac) return;
  const t = ac.currentTime;
  thrG.gain.setTargetAtTime(alive && thrusting ? 0.32 : 0, t, 0.03);
  thrF.frequency.setTargetAtTime(500 + speed * 4, t, 0.05);
  const w = alive && speed > 90 ? Math.min(0.05, (speed - 90) / 3000) : 0;
  whG.gain.setTargetAtTime(w, t, 0.08);
  whO.frequency.setTargetAtTime(900 + speed * 7 + Math.sin(t * 30) * 30, t, 0.05);
}

function burst(dur, f0, f1, vol, type = 'lowpass', q = 0.7, delay = 0) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(f0, f1, dur, vol, type = 'square', delay = 0) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

export function sfx(k, n = 1) {
  if (!ac || A.muted) return;
  switch (k) {
    case 'kick': burst(0.18, 2400, 300, 0.35, 'bandpass', 1.2); tone(160, 60, 0.12, 0.2, 'triangle'); break;
    case 'launch': burst(0.5, 3000, 500, 0.3, 'bandpass', 0.9); break;
    case 'pop': {
      const p = Math.min(n, 8);
      burst(0.5 + p * 0.03, 1800, 120, 0.5, 'lowpass', 0.8); tone(110, 40, 0.3, 0.35, 'sine');
      for (let i = 0; i < 5; i++) burst(0.03, 6000, 3000, 0.12, 'highpass', 1, 0.12 + Math.random() * 0.35); // crackle
      if (n > 1) tone(330 * Math.pow(1.122, p), 660 * Math.pow(1.122, p), 0.09, 0.07, 'square');
      break;
    }
    case 'lit': burst(0.08, 5000, 2500, 0.08, 'highpass'); break;
    case 'ring': [784, 988, 1319].forEach((f, i) => tone(f * Math.pow(1.06, Math.min(n, 9) - 1), f, 0.12, 0.08, 'square', i * 0.045)); break;
    case 'shape': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f * 1.01, 0.18, 0.08, 'square', i * 0.07)); break;
    case 'crash': burst(0.9, 1200, 60, 0.7, 'lowpass', 0.6); tone(90, 30, 0.6, 0.45, 'sine'); tone(400, 60, 0.4, 0.1, 'sawtooth'); break;
    case 'nofuel': tone(300, 120, 0.35, 0.12, 'square'); break;
    case 'clear': [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 0.09, 'square', i * 0.09)); break;
    case 'star': tone(1047 * n, 1568 * n, 0.15, 0.08, 'square'); break;
    case 'ui': tone(660, 880, 0.05, 0.06, 'square'); break;
    case 'land': burst(0.12, 900, 120, 0.25, 'lowpass', 0.8); tone(120, 70, 0.1, 0.15, 'triangle'); break;
    case 'boom': burst(0.7, 1500, 100, 0.35, 'lowpass', 0.8); for (let i = 0; i < 4; i++) burst(0.03, 6000, 3000, 0.08, 'highpass', 1, 0.15 + Math.random() * 0.4); break;
  }
}
