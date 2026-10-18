// All sound is synthesised with WebAudio: sfx + a boom-bap loop.
let ctx = null, master = null, nb = null, muted = false, musicOn = false, nextT = 0, stepI = 0;
const BPM = 94, SIX = 60 / BPM / 4;
const BASS = [36, 0, 0, 36, 0, 0, 39, 0, 41, 0, 0, 39, 0, 36, 0, 0];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(sched, 40); if (musicOn) nextT = ctx.currentTime + 0.05;
  } catch (e) { ctx = null; }
}
export function setMute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export const isMuted = () => muted;
export function setMusic(on) { if (on && !musicOn && ctx) nextT = ctx.currentTime + 0.05; musicOn = on; }

function tone(f, dur, type, vol, slide, t0) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, vol, freq, t0, q = 1, type = 'bandpass') {
  const s = ctx.createBufferSource(); s.buffer = nb; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(g).connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur);
}
export function sfx(k, p = 0) {
  if (!ctx) return; const t = ctx.currentTime;
  switch (k) {
    case 'coin': { const m = Math.pow(1.02, Math.min(p, 24)); tone(988 * m, 0.07, 'square', 0.06, 0, t); tone(1480 * m, 0.11, 'square', 0.05, 0, t + 0.045); break; }
    case 'jump': tone(280, 0.18, 'triangle', 0.22, 2.2, t); noise(0.12, 0.12, 1500, t); break;
    case 'boing': tone(180, 0.35, 'sine', 0.3, 4, t); noise(0.3, 0.12, 5000, t, 0.5, 'highpass'); break;
    case 'roll': noise(0.25, 0.25, 600, t, 0.7); break;
    case 'swish': noise(0.1, 0.12, 3000, t, 0.8); break;
    case 'land': noise(0.1, 0.25, 300, t, 1, 'lowpass'); break;
    case 'stumble': tone(160, 0.25, 'sawtooth', 0.2, 0.5, t); noise(0.15, 0.3, 500, t, 1, 'lowpass'); break;
    case 'crash': noise(0.7, 0.7, 400, t, 0.5, 'lowpass'); tone(110, 0.5, 'sawtooth', 0.3, 0.3, t); break;
    case 'power': [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.12, 'square', 0.09, 0, t + i * 0.06)); noise(0.4, 0.15, 6000, t, 0.5, 'highpass'); break;
    case 'mission': [0, 7, 12, 16, 19].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.16, 'square', 0.08, 0, t + i * 0.07)); break;
    case 'horn': tone(220, 0.7, 'sawtooth', 0.09, 0, t); tone(277, 0.7, 'sawtooth', 0.07, 0, t); break;
    case 'buy': tone(660, 0.08, 'square', 0.1, 0, t); tone(990, 0.15, 'square', 0.1, 0, t + 0.07); break;
  }
}
function kick(t) { tone(120, 0.22, 'sine', 0.5, 0.33, t); }
function sched() {
  if (!ctx || !musicOn) return;
  while (nextT < ctx.currentTime + 0.15) {
    const i = stepI % 16, bar = (stepI >> 4) % 4;
    if (i === 0 || i === 10 || (i === 7 && bar % 2)) kick(nextT);
    if (i === 4 || i === 12) noise(0.18, 0.2, 1800, nextT, 0.6);
    if (i % 2 === 0) noise(0.035, i % 4 ? 0.04 : 0.07, 8000, nextT, 1, 'highpass');
    const n = BASS[i]; if (n) tone(midi(n + (bar === 3 ? -2 : 0)), SIX * 1.6, 'triangle', 0.15, 0, nextT);
    if (i === 0) [60, 63, 67].forEach((m) => tone(midi(m + (bar === 3 ? -2 : 0)), SIX * 6, 'sine', 0.025, 0, nextT));
    nextT += SIX; stepI++;
  }
}
