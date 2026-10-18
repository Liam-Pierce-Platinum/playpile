// WebAudio: engine drone, nitro hiss, one-shot fx and a small synthwave loop. All synthesized.
let ctx = null, master, eng, engF, engG, eng2, nosG, musG, muted = false, seqT = 0, step = 0;
const Q = new URLSearchParams(location.search);
if (Q.has('mute')) muted = true;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
  engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 600;
  engG = ctx.createGain(); engG.gain.value = 0.0; engF.connect(engG); engG.connect(master);
  eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 50; eng.connect(engF); eng.start();
  eng2 = ctx.createOscillator(); eng2.type = 'square'; eng2.frequency.value = 25; const g2 = ctx.createGain(); g2.gain.value = 0.4; eng2.connect(g2); g2.connect(engF); eng2.start();
  const nb = noiseBuf(1); const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.7;
  nosG = ctx.createGain(); nosG.gain.value = 0; ns.connect(nf); nf.connect(nosG); nosG.connect(master); ns.start();
  musG = ctx.createGain(); musG.gain.value = 0.16; musG.connect(master);
  seqT = ctx.currentTime + 0.1;
}
function noiseBuf(sec) { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; return muted; }
export function engine(speed01, throttle, boost, air) {
  if (!ctx) return; const t = ctx.currentTime;
  const f = 38 + speed01 * 120 + throttle * 18 + (air ? 30 : 0);
  eng.frequency.setTargetAtTime(f, t, 0.06); eng2.frequency.setTargetAtTime(f / 2, t, 0.06);
  engF.frequency.setTargetAtTime(400 + throttle * 900 + speed01 * 900, t, 0.08);
  engG.gain.setTargetAtTime(0.07 + throttle * 0.07, t, 0.1);
  nosG.gain.setTargetAtTime(boost ? 0.16 : 0, t, 0.05);
}
function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, glide = 0, dest = null) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq = 800, when = 0) {
  if (!ctx) return; const t = ctx.currentTime + when, s = ctx.createBufferSource(); s.buffer = noiseBuf(dur);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
export const sfx = {
  ring() { tone(880, 0.25, 'triangle', 0.25); tone(1320, 0.35, 'triangle', 0.2, 0.07); },
  land(h) { noise(0.25, Math.min(0.6, 0.15 + h * 0.05), 300); tone(70, 0.2, 'sine', 0.4, 0, 0.5); },
  stunt(n) { for (let i = 0; i < Math.min(4, n); i++) tone(660 * Math.pow(1.26, i), 0.18, 'square', 0.12, i * 0.07); },
  crash() { noise(0.9, 0.7, 1200); tone(120, 0.6, 'sawtooth', 0.3, 0, 0.3); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'square', 0.14, i * 0.12)); },
  fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.4, 'triangle', 0.2, i * 0.15)); },
  beep(hi) { tone(hi ? 1046 : 523, 0.18, 'square', 0.15); },
  buy() { tone(1200, 0.1, 'square', 0.12); tone(1600, 0.15, 'square', 0.12, 0.08); },
  loop() { tone(300, 0.9, 'sawtooth', 0.12, 0, 3); },
};
// synthwave loop: Am - F - C - G, 100 bpm sixteenths
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
export function music() {
  if (!ctx || muted) return;
  const sp = 60 / 100 / 4;
  while (seqT < ctx.currentTime + 0.2) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, ch = PROG[bar], w = seqT - ctx.currentTime;
    if (s % 4 === 0) tone(mf(ch[0] - 24), sp * 3.5, 'sawtooth', 0.35, w, 0, musG);
    if (s % 2 === 0) tone(mf(ch[(s / 2) % 3] + 12), sp * 1.6, 'square', 0.12, w, 0, musG);
    if (s % 8 === 4) { const t = ctx.currentTime + w, b = ctx.createBufferSource(); b.buffer = noiseBuf(0.15); const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); b.connect(g); g.connect(musG); b.start(t); }
    if (s % 4 === 0) tone(110, 0.15, 'sine', 0.6, w, 0.4, musG);
    seqT += sp; step++;
  }
}
