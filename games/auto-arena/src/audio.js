// audio.js - every sound is synthesised with WebAudio (no files).
// sfx(name) plays a one-shot; music(on) runs a soft plucked loop in the shop and
// a drum-led loop in fights. Mute toggles everything.

let ctx = null, master = null, sfxBus = null, musBus = null, verb = null;
let muted = false, mood = null, musTimer = null, step = 0;
const last = new Map();

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = 0.22; musBus.connect(master);
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 1.8, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
  verb.buffer = buf;
  const vg = ctx.createGain(); vg.gain.value = 0.25; verb.connect(vg); vg.connect(master);
  if (mood) startMusic(mood);
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
export const isMuted = () => muted;

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function osc(type, f, t, dur, vol, o = {}) {
  const s = ctx.createOscillator(), g = ctx.createGain();
  s.type = type; s.frequency.setValueAtTime(f, t);
  if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? dur));
  env(g, t, o.a ?? 0.005, vol, dur);
  s.connect(g);
  let out = g;
  if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; g.connect(f2); out = f2; }
  out.connect(o.bus ?? sfxBus);
  if (o.verb) out.connect(verb);
  s.start(t); s.stop(t + dur + 0.1);
}
let noiseBuf = null;
function noise(t, dur, vol, o = {}) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.type ?? 'lowpass'; f.frequency.setValueAtTime(o.f ?? 1200, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 0.7;
  const g = ctx.createGain(); env(g, t, o.a ?? 0.003, vol, dur);
  s.connect(f); f.connect(g); g.connect(o.bus ?? sfxBus);
  if (o.verb) g.connect(verb);
  s.start(t, Math.random()); s.stop(t + dur + 0.1);
}

const SFX = {
  click: t => osc('triangle', 700, t, 0.05, 0.22, { to: 520 }),
  tick: t => osc('sine', 1200, t, 0.03, 0.06),
  pick: t => { osc('triangle', 520, t, 0.07, 0.18, { to: 780 }); noise(t, 0.04, 0.05, { type: 'highpass', f: 3000 }); },
  drop: t => { osc('sine', 260, t, 0.09, 0.3, { to: 140 }); noise(t, 0.05, 0.08, { f: 900 }); },
  buy: t => { osc('triangle', 1320, t, 0.07, 0.18); osc('triangle', 1760, t + 0.05, 0.12, 0.16); },
  sell: t => { osc('triangle', 1760, t, 0.06, 0.16); osc('triangle', 1175, t + 0.05, 0.1, 0.16); noise(t, 0.08, 0.06, { type: 'highpass', f: 4000 }); },
  reroll: t => { noise(t, 0.22, 0.16, { type: 'bandpass', f: 600, to: 3200, q: 1.4 }); [0, 1, 2].forEach(i => osc('sine', 600 + i * 220, t + i * 0.035, 0.05, 0.06)); },
  level: t => { [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, t + i * 0.06, 0.22, 0.16, { verb: true })); },
  merge: t => { [784, 988, 1175, 1568, 1976].forEach((f, i) => osc('triangle', f, t + i * 0.055, 0.35, 0.16, { verb: true })); noise(t, 0.4, 0.06, { type: 'highpass', f: 5000, verb: true }); },
  merge3: t => { [523, 784, 1047, 1319, 1568, 2093].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.5, 0.18, { verb: true })); osc('sine', 130, t, 0.6, 0.25, { to: 65 }); },
  deny: t => { osc('square', 160, t, 0.12, 0.08, { lp: 900 }); osc('square', 120, t + 0.08, 0.14, 0.08, { lp: 900 }); },
  item: t => { [988, 1319, 1760].forEach((f, i) => osc('sine', f, t + i * 0.07, 0.3, 0.14, { verb: true })); },
  // fight
  swing: t => { noise(t, 0.08, 0.12, { type: 'bandpass', f: 1600, to: 500, q: 1.2 }); osc('sine', 150, t, 0.07, 0.14, { to: 80 }); },
  bigswing: t => { noise(t, 0.12, 0.2, { type: 'bandpass', f: 1200, to: 300, q: 1 }); osc('sine', 110, t, 0.14, 0.3, { to: 50 }); },
  arrow: t => { noise(t, 0.05, 0.08, { type: 'bandpass', f: 3200, q: 3 }); },
  hit: t => { osc('sine', 180, t, 0.06, 0.12, { to: 90 }); noise(t, 0.03, 0.06, { f: 1500 }); },
  crit: t => { noise(t, 0.1, 0.22, { f: 3000, to: 400 }); osc('square', 220, t, 0.08, 0.08, { to: 110, lp: 1200 }); },
  orb: t => osc('sine', 700, t, 0.15, 0.08, { to: 1100 }),
  cast: t => { osc('sine', 500, t, 0.25, 0.1, { to: 1400, verb: true }); osc('triangle', 750, t + 0.04, 0.2, 0.06, { to: 1800 }); },
  zap: t => { noise(t, 0.2, 0.18, { type: 'highpass', f: 2200, to: 800, verb: true }); osc('sawtooth', 160, t, 0.15, 0.06, { to: 80, lp: 1200 }); },
  boom: t => { noise(t, 0.5, 0.4, { f: 1000, to: 80, verb: true }); osc('sine', 75, t, 0.4, 0.4, { to: 30 }); },
  splash: t => { noise(t, 0.35, 0.25, { type: 'bandpass', f: 900, to: 300, q: 0.8, verb: true }); },
  shield: t => { osc('triangle', 880, t, 0.18, 0.1, { verb: true }); osc('triangle', 1320, t + 0.03, 0.16, 0.06); },
  heal: t => { [660, 880, 1100].forEach((f, i) => osc('sine', f, t + i * 0.05, 0.25, 0.07, { verb: true })); },
  stun: t => { [1400, 1700, 1400].forEach((f, i) => osc('sine', f, t + i * 0.05, 0.06, 0.06)); },
  roar: t => { noise(t, 0.4, 0.3, { type: 'bandpass', f: 400, to: 150, q: 0.8 }); osc('sawtooth', 90, t, 0.35, 0.12, { to: 60, lp: 500 }); },
  poof: t => noise(t, 0.15, 0.12, { type: 'bandpass', f: 1800, to: 600, q: 1 }),
  rise: t => { osc('sine', 200, t, 0.4, 0.14, { to: 500, verb: true }); noise(t, 0.3, 0.06, { type: 'bandpass', f: 600, to: 1600 }); },
  die: t => { noise(t, 0.22, 0.25, { f: 1400, to: 160 }); osc('sine', 140, t, 0.16, 0.22, { to: 50 }); },
  freeze: t => { noise(t, 0.6, 0.2, { type: 'highpass', f: 5000, to: 2000, verb: true }); [2093, 2637, 3136].forEach((f, i) => osc('sine', f, t + i * 0.04, 0.4, 0.05, { verb: true })); },
  // round flow
  bell: t => { [392, 523].forEach((f, i) => osc('triangle', f, t + i * 0.12, 0.6, 0.18, { verb: true })); osc('sine', 98, t, 0.5, 0.2); },
  win: t => { [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, t + i * 0.09, 0.45, 0.17, { verb: true })); },
  lose: t => { [392, 330, 262, 196].forEach((f, i) => osc('triangle', f, t + i * 0.14, 0.45, 0.16, { verb: true, lp: 1600 })); },
  heart: t => { osc('sine', 110, t, 0.3, 0.4, { to: 55 }); noise(t, 0.25, 0.15, { f: 500 }); },
  fanfare: t => { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => osc('triangle', f, t + i * 0.12, 0.5, 0.17, { verb: true })); osc('sine', 65, t, 1.2, 0.2); },
  coin: t => { osc('triangle', 1568, t, 0.06, 0.14); osc('triangle', 2093, t + 0.05, 0.09, 0.12); },
};

export function sfx(name, minGap = 0.03) {
  if (!ctx || muted) return;
  const now = ctx.currentTime, l = last.get(name) || 0;
  if (now - l < minGap) return;
  last.set(name, now);
  try { SFX[name] && SFX[name](now + 0.005); } catch { /* audio is best-effort */ }
}

// ---------------------------------------------------------------- music
// shop: gentle plucked arpeggio in D dorian. fight: same chords, drums + bass.
const CHORDS = [[62, 65, 69, 72], [60, 64, 67, 71], [58, 62, 65, 69], [60, 64, 67, 72]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function tickMusic() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05, spb = mood === 'fight' ? 0.16 : 0.24;
  const ch = CHORDS[Math.floor(step / 16) % 4], s = step % 16;
  if (muted || document.hidden) { /* keep time, play nothing */ }
  else if (mood === 'shop') {
    if (s % 2 === 0) osc('triangle', mtof(ch[(s / 2) % 4] + 12), t, 0.5, 0.05, { bus: musBus, lp: 2400, verb: true });
    if (s === 0) osc('sine', mtof(ch[0] - 12), t, 2.5, 0.08, { bus: musBus });
  } else if (mood === 'fight') {
    if (s % 4 === 0) { osc('sine', 120, t, 0.12, 0.3, { to: 50, bus: musBus }); }
    if (s % 8 === 4) noise(t, 0.1, 0.16, { f: 2400, bus: musBus });
    if (s % 2 === 1) noise(t, 0.03, 0.04, { type: 'highpass', f: 6000, bus: musBus });
    if (s % 4 === 2 || s === 0) osc('sawtooth', mtof(ch[0] - 24), t, 0.2, 0.07, { bus: musBus, lp: 500 });
    if (s % 3 === 0) osc('triangle', mtof(ch[(s / 3) % 4] + 12), t, 0.18, 0.035, { bus: musBus, lp: 2200 });
  } else if (mood === 'title') {
    if (s % 4 === 0) osc('triangle', mtof(ch[(s / 4) % 4] + 12), t, 1.0, 0.05, { bus: musBus, lp: 1800, verb: true });
    if (s === 0) osc('sine', mtof(ch[0] - 12), t, 3.5, 0.07, { bus: musBus });
  }
  step++;
  clearTimeout(musTimer);
  musTimer = setTimeout(tickMusic, spb * 1000);
}
function startMusic(m) { mood = m; clearTimeout(musTimer); if (ctx) tickMusic(); }
export function music(m) { if (m === mood) return; startMusic(m); }
