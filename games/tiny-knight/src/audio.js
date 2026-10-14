// Synthesized WebAudio sound + a tiny chiptune music loop. No assets.
let ctx = null, master = null, musicGain = null, sfxGain = null;
export const audio = { muted: false, track: null };

try { audio.muted = localStorage.getItem('pd.tiny-knight.mute') === '1'; } catch (e) {}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = audio.muted ? 0 : 0.6; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  audio.muted = m;
  try { localStorage.setItem('pd.tiny-knight.mute', m ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.02);
}

function tone(f, dur, type = 'square', vol = 0.2, slide = 0, delay = 0, dest = sfxGain) {
  if (!ctx || audio.muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol = 0.2, freq = 1200, q = 1, delay = 0, type = 'bandpass') {
  if (!ctx || audio.muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.02);
}

const S = {
  swing: () => { noise(0.09, 0.18, 2500, 0.8); tone(520, 0.06, 'triangle', 0.05, 260); },
  hit: () => { noise(0.08, 0.3, 900, 1); tone(180, 0.1, 'square', 0.15, 70); },
  crit: () => { noise(0.12, 0.35, 700, 1); tone(240, 0.15, 'square', 0.18, 60); tone(900, 0.08, 'triangle', 0.08, 1400, 0.02); },
  chop: () => { noise(0.07, 0.35, 500, 2); tone(150, 0.06, 'triangle', 0.15, 90); },
  treeFall: () => { noise(0.4, 0.25, 300, 1, 0, 'lowpass'); tone(110, 0.3, 'triangle', 0.18, 50); },
  mine: () => { tone(1300, 0.06, 'square', 0.08, 900); noise(0.06, 0.25, 3000, 3); },
  rockBreak: () => { noise(0.3, 0.3, 800, 0.7); tone(200, 0.2, 'square', 0.1, 60); },
  pickup: () => { tone(880, 0.05, 'square', 0.07); tone(1320, 0.07, 'square', 0.07, 0, 0.04); },
  coin: () => { tone(1568, 0.05, 'square', 0.06); tone(2093, 0.12, 'square', 0.06, 0, 0.05); },
  hurt: () => { tone(300, 0.2, 'sawtooth', 0.18, 90); noise(0.12, 0.2, 600); },
  die: () => { tone(400, 0.6, 'sawtooth', 0.2, 50); noise(0.5, 0.2, 400, 1, 0.1); },
  enemyDie: () => { tone(500, 0.15, 'square', 0.1, 120); noise(0.15, 0.18, 1500, 1); },
  slime: () => { tone(220, 0.12, 'sine', 0.15, 440); },
  roll: () => { noise(0.15, 0.12, 900, 0.6); },
  bow: () => { tone(700, 0.08, 'triangle', 0.12, 300); noise(0.06, 0.1, 4000, 2); },
  throw: () => { tone(400, 0.1, 'triangle', 0.08, 700); },
  levelup: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.09, 0, i * 0.07)); },
  craft: () => { tone(600, 0.06, 'square', 0.08); noise(0.05, 0.2, 2000, 2, 0.06); tone(900, 0.1, 'square', 0.08, 0, 0.12); },
  build: () => { for (let i = 0; i < 4; i++) { noise(0.06, 0.3, 500, 2, i * 0.11); tone(160, 0.05, 'triangle', 0.15, 100, i * 0.11); } tone(784, 0.3, 'square', 0.08, 0, 0.5); tone(1047, 0.4, 'square', 0.08, 0, 0.62); },
  deny: () => { tone(160, 0.12, 'square', 0.1); tone(120, 0.15, 'square', 0.1, 0, 0.1); },
  ui: () => { tone(980, 0.03, 'square', 0.05); },
  potion: () => { tone(400, 0.25, 'sine', 0.15, 900); tone(600, 0.3, 'sine', 0.08, 1200, 0.08); },
  block: () => { tone(1400, 0.08, 'square', 0.1, 1000); noise(0.06, 0.2, 5000, 3); },
  telegraph: () => { tone(330, 0.25, 'sawtooth', 0.06, 660); },
  boom: () => { noise(0.5, 0.45, 200, 0.7, 0, 'lowpass'); tone(90, 0.4, 'sine', 0.3, 30); },
  roar: () => { tone(110, 0.9, 'sawtooth', 0.18, 55); tone(116, 0.9, 'sawtooth', 0.12, 50); noise(0.9, 0.18, 300, 0.5); },
  shadow: () => { tone(200, 0.3, 'sine', 0.1, 600); tone(205, 0.3, 'triangle', 0.06, 620); },
  chest: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.06)); },
  victory: () => { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.25, 'square', 0.08, 0, i * 0.13)); },
  step: () => { noise(0.03, 0.04, 700, 1); },
};
export function sfx(name) { try { S[name] && S[name](); } catch (e) {} }

// --- music: small chiptune patterns, scheduled ahead ---
const TRACKS = {
  field: { bpm: 112, lead: [72, 0, 76, 79, 77, 76, 74, 0, 72, 74, 76, 72, 74, 0, 67, 0, 69, 0, 72, 76, 74, 72, 71, 0, 72, 0, 0, 0, 67, 69, 71, 0], bass: [48, 48, 55, 55, 53, 53, 50, 50, 45, 45, 52, 52, 43, 43, 48, 48] },
  night: { bpm: 84, lead: [69, 0, 72, 0, 71, 69, 67, 0, 69, 0, 64, 0, 65, 64, 62, 0, 64, 0, 0, 0, 69, 71, 72, 0, 71, 0, 67, 0, 69, 0, 0, 0], bass: [45, 45, 41, 41, 43, 43, 40, 40, 45, 45, 41, 41, 38, 38, 40, 40] },
  castle: { bpm: 96, lead: [62, 0, 65, 0, 68, 0, 67, 65, 63, 0, 62, 0, 0, 60, 62, 0, 62, 0, 65, 68, 71, 0, 70, 68, 67, 0, 65, 0, 63, 0, 62, 0], bass: [38, 38, 38, 38, 44, 44, 43, 43, 39, 39, 39, 39, 37, 37, 38, 38] },
  boss: { bpm: 150, lead: [74, 74, 0, 77, 0, 74, 80, 0, 79, 0, 77, 76, 74, 0, 73, 0, 74, 74, 0, 77, 0, 81, 80, 0, 79, 77, 76, 74, 73, 74, 76, 77], bass: [38, 50, 38, 50, 41, 53, 41, 53, 44, 56, 44, 56, 37, 49, 37, 49] },
  win: { bpm: 104, lead: [72, 76, 79, 84, 0, 79, 81, 0, 77, 81, 84, 0, 83, 0, 79, 0, 72, 76, 79, 84, 0, 84, 86, 88, 0, 0, 84, 0, 0, 0, 0, 0], bass: [48, 48, 55, 55, 53, 53, 55, 55, 48, 48, 52, 52, 53, 55, 48, 48] },
};
let step = 0, nextT = 0, timer = null;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function playMusic(name) {
  if (audio.track === name) return;
  audio.track = name; step = 0; if (ctx) nextT = ctx.currentTime + 0.05;
  if (!timer) timer = setInterval(schedule, 50);
}
function schedule() {
  if (!ctx || !audio.track) return;
  const tr = TRACKS[audio.track]; if (!tr) return;
  const st = 60 / tr.bpm / 2;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.02;
  while (nextT < ctx.currentTime + 0.25) {
    if (!audio.muted) {
      const n = tr.lead[step % tr.lead.length];
      if (n) note(mtof(n), st * 0.9, 'square', 0.05, nextT);
      if (step % 2 === 0) { const b = tr.bass[(step / 2) % tr.bass.length]; note(mtof(b), st * 1.8, 'triangle', 0.13, nextT); }
      if (audio.track === 'boss' && step % 4 === 0) note(70, 0.08, 'sine', 0.3, nextT, 35);
    }
    nextT += st; step++;
  }
}
function note(f, dur, type, vol, t, slide) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.02);
}
