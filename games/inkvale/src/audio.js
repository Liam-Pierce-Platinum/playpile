// audio.js - every sound is synthesised (no files): plucks, thumps, zaps,
// plus a small generative score that plays lute-ish arpeggios and a reed
// melody. Moods: 'map', 'battle', 'dark', 'boss'.

let ctx = null, master = null, sfxBus = null, musBus = null, verb = null;
let sfxOn = true, musOn = true;
const last = new Map();

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.55 : 0; sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = musOn ? 0.32 : 0; musBus.connect(master);
  // cheap reverb: a decaying noise impulse
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = buf;
  const vg = ctx.createGain(); vg.gain.value = 0.28; verb.connect(vg); vg.connect(master);
  if (pendingMood) setMood(pendingMood);
}
export function setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? 0.55 : 0; }
export function setMusic(on) { musOn = on; if (musBus) musBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.2); }

// ------------------------------------------------------------------ building blocks
function env(g, t, a, peak, d, sus = 0, rel = 0.05) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + d);
  if (sus) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + rel);
}
function osc(type, f, t, dur, vol, o = {}) {
  const s = ctx.createOscillator(), g = ctx.createGain();
  s.type = type; s.frequency.setValueAtTime(f, t);
  if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? dur));
  if (o.det) s.detune.value = o.det;
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

// ------------------------------------------------------------------ sfx
const SFX = {
  click: t => osc('triangle', 660, t, 0.06, 0.25, { to: 520 }),
  hover: t => osc('sine', 880, t, 0.03, 0.06),
  coin: t => { osc('triangle', 1320, t, 0.08, 0.2); osc('triangle', 1760, t + 0.06, 0.12, 0.18); },
  star: t => { [880, 1108, 1318, 1760].forEach((f, i) => osc('triangle', f, t + i * 0.08, 0.3, 0.2, { verb: true })); },
  bow: t => { noise(t, 0.06, 0.12, { type: 'bandpass', f: 2600, q: 2 }); osc('triangle', 220, t, 0.08, 0.1, { to: 140 }); },
  nib: t => noise(t, 0.05, 0.06, { type: 'bandpass', f: 3500, q: 3 }),
  musket: t => { noise(t, 0.25, 0.35, { f: 2400, to: 300 }); osc('square', 90, t, 0.1, 0.12, { to: 50, lp: 600 }); },
  deadeye: t => { noise(t, 0.4, 0.45, { f: 3000, to: 200, verb: true }); osc('sine', 60, t, 0.3, 0.3, { to: 35 }); },
  grape: t => { for (let i = 0; i < 4; i++) noise(t + i * 0.03, 0.15, 0.2, { f: 2000, to: 400 }); },
  zap: t => { osc('sine', 900, t, 0.18, 0.12, { to: 1600, verb: true }); osc('triangle', 450, t, 0.15, 0.06, { to: 900 }); },
  beam: t => osc('sawtooth', 300 + Math.random() * 40, t, 0.45, 0.025, { lp: 1400, det: 8 }),
  mortar: t => { osc('sine', 110, t, 0.18, 0.35, { to: 50 }); noise(t, 0.12, 0.15, { f: 600 }); },
  boom: t => { noise(t, 0.6, 0.45, { f: 900, to: 80, verb: true }); osc('sine', 70, t, 0.45, 0.45, { to: 30 }); },
  pop: t => { noise(t, 0.25, 0.25, { f: 1200, to: 150 }); osc('sine', 120, t, 0.15, 0.2, { to: 50 }); },
  thud: t => { osc('sine', 140, t, 0.1, 0.15, { to: 70 }); noise(t, 0.05, 0.08, { f: 800 }); },
  thunder: t => { noise(t, 0.35, 0.3, { type: 'highpass', f: 1800, to: 900, verb: true }); osc('sawtooth', 120, t, 0.2, 0.08, { to: 60, lp: 900 }); },
  rocket: t => noise(t, 0.5, 0.2, { type: 'bandpass', f: 800, to: 2400, q: 1.5 }),
  clank: t => { const f = 900 + Math.random() * 600; osc('square', f, t, 0.05, 0.05, { lp: 3000 }); osc('triangle', f * 1.5, t, 0.08, 0.05); noise(t, 0.03, 0.06, { type: 'highpass', f: 3000 }); },
  heroslash: t => { noise(t, 0.12, 0.18, { type: 'bandpass', f: 1800, to: 600, q: 1.2 }); osc('triangle', 700, t, 0.08, 0.08, { to: 300 }); },
  bash: t => { osc('sine', 120, t, 0.2, 0.4, { to: 60 }); noise(t, 0.15, 0.25, { f: 1500, to: 300 }); },
  whirl: t => noise(t, 0.4, 0.2, { type: 'bandpass', f: 400, to: 1800, q: 2 }),
  die: t => { osc('sine', 300 + Math.random() * 120, t, 0.18, 0.12, { to: 120 }); noise(t, 0.12, 0.08, { f: 700, to: 200 }); },
  bigdie: t => { osc('sine', 160, t, 0.4, 0.25, { to: 50 }); noise(t, 0.3, 0.15, { f: 600, to: 100 }); },
  bossdie: t => { osc('sawtooth', 110, t, 1.6, 0.25, { to: 30, lp: 700, verb: true }); noise(t, 1.5, 0.3, { f: 900, to: 60, verb: true }); },
  bossroar: t => { osc('sawtooth', 80, t, 1.1, 0.22, { to: 55, lp: 500, verb: true }); osc('sawtooth', 83, t, 1.1, 0.18, { to: 50, lp: 500 }); noise(t, 0.9, 0.12, { f: 400 }); },
  leak: t => { osc('triangle', 330, t, 0.25, 0.25, { to: 220 }); osc('triangle', 247, t + 0.12, 0.35, 0.22, { to: 165 }); },
  build: t => { for (let i = 0; i < 3; i++) { osc('square', 180 + i * 30, t + i * 0.07, 0.04, 0.08, { lp: 1200 }); noise(t + i * 0.07, 0.05, 0.1, { f: 1500 }); } },
  upgrade: t => { [523, 659, 784, 1046].forEach((f, i) => osc('triangle', f, t + i * 0.06, 0.25, 0.14, { verb: true })); },
  sell: t => { osc('triangle', 1046, t, 0.1, 0.15); osc('triangle', 784, t + 0.08, 0.15, 0.15); },
  rally: t => { osc('triangle', 523, t, 0.08, 0.12); osc('triangle', 784, t + 0.07, 0.12, 0.12); },
  heal: t => { [784, 988, 1175].forEach((f, i) => osc('sine', f, t + i * 0.05, 0.3, 0.07, { verb: true })); },
  holy: t => { [523, 659, 784].forEach(f => osc('sine', f * 2, t, 0.6, 0.08, { verb: true })); noise(t, 0.3, 0.1, { type: 'highpass', f: 4000 }); },
  silence: t => { osc('sine', 600, t, 0.5, 0.12, { to: 150, verb: true }); },
  summon: t => { osc('sawtooth', 200, t, 0.6, 0.08, { to: 400, lp: 900, verb: true }); },
  douse: t => noise(t, 0.6, 0.2, { type: 'bandpass', f: 600, to: 200, q: 1, verb: true }),
  stomp: t => { osc('sine', 55, t, 0.5, 0.55, { to: 30 }); noise(t, 0.4, 0.3, { f: 300, to: 60 }); },
  blink: t => { osc('sine', 1200, t, 0.3, 0.1, { to: 200, verb: true }); osc('sine', 200, t + 0.25, 0.3, 0.1, { to: 1200, verb: true }); },
  levelup: t => { [523, 659, 784, 1046, 1318].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.3, 0.15, { verb: true })); },
  herodown: t => { [392, 330, 262].forEach((f, i) => osc('triangle', f, t + i * 0.14, 0.3, 0.15)); },
  volley: t => { for (let i = 0; i < 6; i++) noise(t + i * 0.05, 0.05, 0.08, { type: 'bandpass', f: 2600, q: 2 }); },
  roots: t => { noise(t, 0.4, 0.2, { f: 400, to: 150 }); osc('triangle', 110, t, 0.3, 0.15, { to: 80 }); },
  glare: t => { osc('sine', 1400, t, 0.6, 0.1, { to: 2200, verb: true }); },
  meteorcall: t => { osc('sawtooth', 300, t, 0.8, 0.08, { to: 80, lp: 1500, verb: true }); noise(t, 0.8, 0.12, { f: 2000, to: 300 }); },
  militia: t => { [392, 523].forEach((f, i) => osc('square', f, t + i * 0.1, 0.12, 0.06, { lp: 1800 })); },
  horn: t => { osc('sawtooth', 220, t, 0.9, 0.12, { lp: 900, a: 0.08, verb: true }); osc('sawtooth', 221.5, t, 0.9, 0.1, { lp: 900, a: 0.08 }); osc('sawtooth', 330, t + 0.05, 0.85, 0.06, { lp: 900, a: 0.08 }); },
  win: t => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => osc('triangle', f, t + i * 0.12, 0.45, 0.16, { verb: true })); },
  lose: t => { [392, 370, 349, 262].forEach((f, i) => osc('triangle', f, t + i * 0.25, 0.6, 0.15, { verb: true })); },
  page: t => noise(t, 0.25, 0.12, { type: 'bandpass', f: 2500, to: 1200, q: 0.8 }),
};
export function sfx(name) {
  if (!ctx || !sfxOn) return;
  const f = SFX[name];
  if (!f) return;
  const now = ctx.currentTime;
  const gap = name === 'die' || name === 'clank' || name === 'bow' ? 0.05 : 0.03;
  if ((last.get(name) ?? -1) > now - gap) return;
  last.set(name, now);
  f(now + 0.005);
}

// ------------------------------------------------------------------ music
const MOODS = {
  map: { tempo: 76, root: 50, scale: [0, 2, 4, 7, 9], prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], drum: false },
  battle: { tempo: 96, root: 50, scale: [0, 2, 4, 7, 9], prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], drum: true },
  dark: { tempo: 92, root: 45, scale: [0, 3, 5, 7, 10], prog: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], drum: true },
  boss: { tempo: 112, root: 40, scale: [0, 1, 3, 7, 8], prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [8, 12, 15]], drum: true },
};
let mood = null, pendingMood = null, timer = null, step = 0, nextT = 0, melodyNote = 0;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function setMood(m) {
  if (!ctx) { pendingMood = m; return; }
  if (mood === m) return;
  mood = m;
  step = 0;
  nextT = ctx.currentTime + 0.1;
  if (!timer) timer = setInterval(schedule, 60);
}
function schedule() {
  if (!ctx || !mood) return;
  const M = MOODS[mood];
  const spb = 60 / M.tempo / 2; // eighth notes
  while (nextT < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8), beat = step % 8;
    const chord = M.prog[bar % M.prog.length];
    const root = M.root + 12;
    // plucked arpeggio
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    const n = root + chord[arp[beat]] + (beat >= 4 ? 12 : 0);
    pluck(mtof(n), nextT, 0.09);
    // bass on 1 and 5
    if (beat === 0 || beat === 4) pluck(mtof(M.root + chord[0] - (beat === 4 ? 0 : 0)), nextT, 0.14, 0.9);
    // pad, once a bar
    if (beat === 0) for (const c of chord) padNote(mtof(root + c), nextT, spb * 8);
    // a wandering reed melody, sparse
    if ((beat === 0 || beat === 3 || beat === 6) && Math.random() < (mood === 'map' ? 0.45 : 0.35)) {
      melodyNote = Math.max(-2, Math.min(7, melodyNote + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]));
      const deg = ((melodyNote % 5) + 5) % 5, oct = Math.floor(melodyNote / 5);
      reed(mtof(root + 12 + M.scale[deg] + oct * 12), nextT, spb * (beat === 6 ? 2 : 3));
    }
    if (M.drum) {
      if (beat === 0 || beat === 4) kick(nextT, mood === 'boss' ? 0.35 : 0.22);
      if (beat === 2 || beat === 6) hat(nextT, 0.05);
      if (mood === 'boss' && beat % 2 === 1) hat(nextT, 0.03);
    }
    nextT += spb;
    step++;
  }
}
function pluck(f, t, vol, decay = 0.6) {
  const s = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  s.type = 'triangle'; s.frequency.value = f;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(500, t + decay);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  s.connect(lp); lp.connect(g); g.connect(musBus); g.connect(verb);
  s.start(t); s.stop(t + decay + 0.05);
}
function padNote(f, t, dur) {
  const s = ctx.createOscillator(), s2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  s.type = 'sawtooth'; s2.type = 'sawtooth'; s.frequency.value = f; s2.frequency.value = f; s2.detune.value = 9;
  lp.type = 'lowpass'; lp.frequency.value = 700;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(lp); s2.connect(lp); lp.connect(g); g.connect(musBus); g.connect(verb);
  s.start(t); s2.start(t); s.stop(t + dur + 0.05); s2.stop(t + dur + 0.05);
}
function reed(f, t, dur) {
  const s = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain(), lp = ctx.createBiquadFilter();
  s.type = 'square'; s.frequency.value = f;
  vib.frequency.value = 5; vg.gain.value = f * 0.008; vib.connect(vg); vg.connect(s.frequency);
  lp.type = 'lowpass'; lp.frequency.value = 1600;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.06); g.gain.setValueAtTime(0.03, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(lp); lp.connect(g); g.connect(musBus); g.connect(verb);
  s.start(t); vib.start(t); s.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
}
function kick(t, vol) {
  const s = ctx.createOscillator(), g = ctx.createGain();
  s.frequency.setValueAtTime(110, t); s.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  s.connect(g); g.connect(musBus); s.start(t); s.stop(t + 0.3);
}
function hat(t, vol) { noise(t, 0.04, vol, { type: 'highpass', f: 6000, bus: musBus }); }
