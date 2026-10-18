// WebAudio synth: engine hum, sfx, tiny bouncy music loop. No samples.
export const muted = new URLSearchParams(location.search).has('mute');
let ctx = null, master = null, eng, engF, engG, noiseBuf, nextT = 0, step = 0, musicG;

export function unlock() {
  if (muted) return;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  eng = ctx.createOscillator(); eng.type = 'sawtooth';
  engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 420;
  engG = ctx.createGain(); engG.gain.value = 0;
  eng.connect(engF).connect(engG).connect(master); eng.start();
  musicG = ctx.createGain(); musicG.gain.value = 0.11; musicG.connect(master);
  nextT = ctx.currentTime + 0.1;
}

export function engine(speed, on) {
  if (!ctx) return;
  const t = ctx.currentTime, s = Math.abs(speed);
  eng.frequency.setTargetAtTime(48 + s * 5.5, t, 0.06);
  engG.gain.setTargetAtTime(on ? 0.035 + s * 0.0035 : 0, t, 0.1);
}

function tone(f0, f1, dur, type = 'square', vol = 0.2, delay = 0, out = master) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, f0, f1, vol) {
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 30), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.03);
}
const W = (fn) => (...a) => { if (ctx) fn(...a); };
export const sfx = {
  pickup: W(() => { tone(620, 1240, 0.1, 'triangle', 0.22); tone(930, 1860, 0.14, 'triangle', 0.16, 0.07); }),
  rocket: W(() => { noise(0.45, 3200, 300, 0.22); tone(320, 90, 0.3, 'sawtooth', 0.07); }),
  pellet: W(() => tone(1100, 380, 0.05, 'square', 0.05)),
  mine: W(() => { tone(240, 180, 0.09, 'square', 0.1); tone(240, 180, 0.09, 'square', 0.08, 0.12); }),
  shock: W(() => { tone(70, 420, 0.3, 'sine', 0.45); noise(0.4, 1600, 120, 0.28); }),
  boom: W((v = 1) => { noise(0.75, 2400, 50, 0.55 * v); tone(140, 30, 0.55, 'sine', 0.5 * v); }),
  hit: W(() => tone(330, 140, 0.1, 'square', 0.12)),
  bump: W(() => noise(0.12, 900, 200, 0.14)),
  ko: W(() => { tone(523, 523, 0.09, 'square', 0.13); tone(659, 659, 0.09, 'square', 0.13, 0.09); tone(784, 1568, 0.25, 'square', 0.13, 0.18); }),
  wreck: W(() => { tone(400, 60, 0.6, 'sawtooth', 0.15); }),
  beep: W((hi) => tone(hi ? 988 : 494, hi ? 988 : 494, hi ? 0.35 : 0.14, 'square', 0.14)),
  level: W(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.2, i * 0.1))),
  click: W(() => tone(700, 500, 0.05, 'triangle', 0.15)),
};

// 16-step bouncy loop: bass + arp
const BASS = [36, 0, 36, 0, 43, 0, 41, 0, 34, 0, 34, 0, 41, 0, 43, 0];
const ARP = [60, 64, 67, 72, 67, 64, 60, 64, 58, 62, 65, 70, 65, 62, 58, 62];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function music(on) {
  if (!ctx) return;
  musicG.gain.setTargetAtTime(on ? 0.11 : 0, ctx.currentTime, 0.3);
  while (nextT < ctx.currentTime + 0.25) {
    const d = nextT - ctx.currentTime, i = step % 16, bar = (step >> 4) % 4;
    if (BASS[i]) tone(hz(BASS[i] + (bar === 3 ? 2 : 0)), hz(BASS[i]) * 0.98, 0.22, 'square', 0.5, Math.max(0, d), musicG);
    if (step % 2 === 0 || bar >= 2) tone(hz(ARP[i] + 12), hz(ARP[i] + 12), 0.1, 'triangle', 0.25, Math.max(0, d), musicG);
    nextT += 0.14; step++;
  }
}
