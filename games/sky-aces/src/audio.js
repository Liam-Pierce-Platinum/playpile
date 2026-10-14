// Every sound is synthesized with WebAudio: no files. One engine drone (two detuned saws through
// a lowpass, plus filtered noise for wind), and short one-shots built from noise + oscillators.
let ctx = null, master = null, noiseBuf = null, muted = false;
let eng = null;
const last = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const audioReady = () => !!ctx;

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
}
export const isMuted = () => muted;

function noise(dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9;
  return s;
}
function env(g, t, a, peak, dcy) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}
function throttle(name, ms) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now; return true;
}

// ---------------------------------------------------------------- engine
export function engineStart() {
  if (!ctx || eng) return;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2;
  lp.connect(out);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 61.5;
  const o3 = ctx.createOscillator(); o3.type = 'square'; o3.frequency.value = 30;
  const g3 = ctx.createGain(); g3.gain.value = 0.35;
  // propeller "chop": an LFO on the amplitude
  const chop = ctx.createOscillator(); chop.frequency.value = 18;
  const chopG = ctx.createGain(); chopG.gain.value = 0.25;
  const amp = ctx.createGain(); amp.gain.value = 0.7;
  chop.connect(chopG); chopG.connect(amp.gain);
  o1.connect(amp); o2.connect(amp); o3.connect(g3); g3.connect(amp); amp.connect(lp);
  const w = noise(); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 800; wf.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0;
  w.connect(wf); wf.connect(wg); wg.connect(master);
  for (const n of [o1, o2, o3, chop, w]) n.start();
  eng = { out, lp, o1, o2, o3, chop, wg, wf, nodes: [o1, o2, o3, chop, w] };
}
export function engineSet(on, speed01, boost, jet) {
  if (!eng) return;
  const t = ctx.currentTime;
  const f = (jet ? 90 : 55) + speed01 * (jet ? 120 : 70) + (boost ? 35 : 0);
  eng.o1.frequency.setTargetAtTime(f, t, 0.1);
  eng.o2.frequency.setTargetAtTime(f * 1.013, t, 0.1);
  eng.o3.frequency.setTargetAtTime(f / 2, t, 0.1);
  eng.chop.frequency.setTargetAtTime(jet ? 60 : 12 + speed01 * 16, t, 0.1);
  eng.lp.frequency.setTargetAtTime(400 + speed01 * 900 + (boost ? 700 : 0), t, 0.1);
  eng.out.gain.setTargetAtTime(on ? 0.16 + (boost ? 0.06 : 0) : 0, t, 0.15);
  eng.wg.gain.setTargetAtTime(on ? 0.03 + speed01 * 0.09 : 0, t, 0.2);
  eng.wf.frequency.setTargetAtTime(500 + speed01 * 1400, t, 0.2);
}
export function engineStop() {
  if (!eng) return;
  const e = eng; eng = null;
  e.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); e.wg.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  setTimeout(() => { for (const n of e.nodes) { try { n.stop(); } catch (x) { /* */ } } }, 300);
}

// ---------------------------------------------------------------- one-shots
export function sGun(vol = 1) {
  if (!ctx || !throttle('gun' + (vol < 1 ? 'f' : ''), 55)) return;
  const t = ctx.currentTime;
  const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 500; f.Q.value = 1.2;
  const g = ctx.createGain(); env(g, t, 0.002, 0.35 * vol, 0.06);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 0.1);
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.05);
  const og = ctx.createGain(); env(og, t, 0.002, 0.18 * vol, 0.05);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.08);
}
export function sHit() {
  if (!ctx || !throttle('hit', 45)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  const g = ctx.createGain(); env(g, t, 0.001, 0.22, 0.06);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.1);
}
export function sHurt() {
  if (!ctx || !throttle('hurt', 70)) return;
  const t = ctx.currentTime;
  const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = ctx.createGain(); env(g, t, 0.002, 0.5, 0.12);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 0.2);
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 320;
  const og = ctx.createGain(); env(og, t, 0.002, 0.12, 0.05);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.08);
}
export function sBoom(size = 1, dist = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const vol = Math.max(0.05, 1 - dist / 1800) * Math.min(1.4, size);
  const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(90, t + 0.9 * size);
  const g = ctx.createGain(); env(g, t, 0.005, 0.9 * vol, 0.9 * size + 0.3);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 1.6 * size + 0.4);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
  const og = ctx.createGain(); env(og, t, 0.005, 0.8 * vol, 0.6);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.8);
}
export function sMissile() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
  const g = ctx.createGain(); env(g, t, 0.02, 0.5, 0.8);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 1);
}
let lockOsc = null;
export function sLockTone(state) { // 0 none, 1 locking, 2 locked
  if (!ctx) return;
  if (!lockOsc) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 6;
    const lg = ctx.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(master); o.start(); lfo.start();
    lockOsc = { o, g, lg, lfo };
  }
  const t = ctx.currentTime;
  if (state === 0) { lockOsc.g.gain.setTargetAtTime(0, t, 0.02); lockOsc.lg.gain.setTargetAtTime(0, t, 0.02); }
  else if (state === 1) { lockOsc.o.frequency.setTargetAtTime(800, t, 0.01); lockOsc.g.gain.setTargetAtTime(0.025, t, 0.02); lockOsc.lg.gain.setTargetAtTime(0.025, t, 0.02); }
  else { lockOsc.o.frequency.setTargetAtTime(1250, t, 0.01); lockOsc.g.gain.setTargetAtTime(0.045, t, 0.02); lockOsc.lg.gain.setTargetAtTime(0, t, 0.02); }
}
let warnT = 0;
export function sWarn() { // incoming missile beeps
  if (!ctx || !throttle('warn', 260)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 520 + (warnT++ % 2) * 180;
  const g = ctx.createGain(); env(g, t, 0.005, 0.12, 0.12);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15);
}
export function sWhoosh() {
  if (!ctx || !throttle('whoosh', 300)) return;
  const t = ctx.currentTime;
  const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1;
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.25); f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
  const g = ctx.createGain(); env(g, t, 0.05, 0.35, 0.5);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 0.7);
}
export function sJingle(kind) { // 'kill' | 'streak' | 'win' | 'lose' | 'buy' | 'click' | 'wave'
  if (!ctx) return;
  const seqs = {
    kill: [[784, 0], [1046, 0.07]], streak: [[659, 0], [880, 0.08], [1175, 0.16], [1568, 0.24]],
    win: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36], [1318, 0.52]], lose: [[392, 0], [330, 0.18], [262, 0.36], [196, 0.6]],
    buy: [[880, 0], [1320, 0.06], [1760, 0.12]], click: [[660, 0]], wave: [[440, 0], [587, 0.1], [880, 0.2]],
    deny: [[200, 0], [160, 0.08]],
  };
  const t = ctx.currentTime;
  for (const [f, d] of seqs[kind] || []) {
    const o = ctx.createOscillator(); o.type = kind === 'lose' || kind === 'deny' ? 'sawtooth' : 'square'; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2600;
    const g = ctx.createGain(); env(g, t + d, 0.005, kind === 'click' ? 0.06 : 0.12, kind === 'win' || kind === 'lose' ? 0.35 : 0.14);
    o.connect(fl); fl.connect(g); g.connect(master); o.start(t + d); o.stop(t + d + 0.6);
  }
}
