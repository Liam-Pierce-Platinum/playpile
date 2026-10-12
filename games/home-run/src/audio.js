// All sound is synthesised with WebAudio. No files.
let ctx = null, master = null, crowdGain = null, roarGain = null, roarFilter = null, noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { ctx = null; return; }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  // 2 s of white noise, reused by everything
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // crowd bed: brown-ish noise through a low band, always running quietly
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
  crowdGain = ctx.createGain(); crowdGain.gain.value = 0.05;
  src.connect(lp); lp.connect(crowdGain); crowdGain.connect(master); src.start();
  // roar layer: brighter, swells on big hits
  const src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true; src2.loopStart = 0.37;
  roarFilter = ctx.createBiquadFilter(); roarFilter.type = 'bandpass'; roarFilter.frequency.value = 900; roarFilter.Q.value = 0.5;
  roarGain = ctx.createGain(); roarGain.gain.value = 0;
  src2.connect(roarFilter); roarFilter.connect(roarGain); roarGain.connect(master); src2.start(0, 0.37);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
}
export const isMuted = () => muted;

function noise(t, dur, type, freq, q, gain, attack = 0.002) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;   // random start offset must not run off the end
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  return f;
}
function tone(t, freq, dur, type, gain, slideTo) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// The crack of the bat: q in 0..1 (contact quality)
export function crack(q) {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.05 + q * 0.06, 'highpass', 1800 - q * 600, 0.7, 0.9 + q * 0.6, 0.001);
  tone(t, 1300 + q * 900, 0.09 + q * 0.06, 'triangle', 0.35 + q * 0.3, 700);
  tone(t, 210 + q * 60, 0.12, 'sine', 0.5 * q, 90);
  if (q > 0.85) noise(t + 0.01, 0.35, 'bandpass', 3200, 1.5, 0.25);    // ringing tail on a perfect one
}
export function whiff() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = noise(t, 0.22, 'bandpass', 500, 1.2, 0.35, 0.06);
  f.frequency.exponentialRampToValueAtTime(1800, t + 0.2);
}
export function mitt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.07, 'lowpass', 900, 0.8, 0.7, 0.001);
  tone(t, 160, 0.08, 'sine', 0.4, 80);
}
export function release() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.14, 'bandpass', 1400, 2, 0.12, 0.04);
}
export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.12, 'lowpass', 400, 0.7, 0.4, 0.002);
}
export function ui(hi = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, hi ? 880 : 660, 0.08, 'square', 0.08);
}
export function pop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.4, 'lowpass', 1800, 0.5, 0.35, 0.003);
  noise(t + 0.06, 0.9, 'highpass', 4000, 0.5, 0.06, 0.05);     // crackle
}
// Ballpark organ sting, original phrase. kind: 'hr' | 'streak' | 'end'
export function organ(kind, level = 1) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  const base = 392 * Math.pow(2, Math.min(level - 1, 5) / 12);
  const seq = kind === 'end' ? [0, 4, 7, 12, 7, 12, 16] : kind === 'streak' ? [0, 7, 12, 16, 19] : [0, 4, 7, 12];
  seq.forEach((n, i) => {
    const f = base * Math.pow(2, n / 12);
    const dur = i === seq.length - 1 ? 0.5 : 0.13;
    tone(t + i * 0.12, f, dur, 'square', 0.06);
    tone(t + i * 0.12, f * 2, dur, 'sine', 0.05);
    tone(t + i * 0.12, f / 2, dur, 'triangle', 0.06);
  });
}
// Crowd: swell to a roar, then settle. amount 0..1
export function roar(amount, hold = 1.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  roarGain.gain.cancelScheduledValues(t);
  roarGain.gain.setValueAtTime(roarGain.gain.value, t);
  roarGain.gain.linearRampToValueAtTime(0.42 * amount, t + 0.35);
  roarGain.gain.setValueAtTime(0.42 * amount, t + 0.35 + hold);
  roarGain.gain.linearRampToValueAtTime(0, t + 0.35 + hold + 1.6);
  roarFilter.frequency.setValueAtTime(700, t);
  roarFilter.frequency.linearRampToValueAtTime(1100, t + 0.5);
}
// Rising "ooooh" while a fly ball carries; v in 0..1
export function anticipate(v) {
  if (!ctx) return;
  crowdGain.gain.setTargetAtTime(0.05 + v * 0.22, ctx.currentTime, 0.15);
}
export function groan() {
  if (!ctx) return;
  const t = ctx.currentTime;
  crowdGain.gain.setTargetAtTime(0.05, t, 0.4);
  const f = noise(t, 0.9, 'bandpass', 600, 1, 0.12, 0.1);
  f.frequency.exponentialRampToValueAtTime(260, t + 0.8);
}

// stop the crowd bed while the tab is hidden
export function suspend(on) {
  if (!ctx) return;
  try { if (on) ctx.suspend(); else ctx.resume(); } catch (e) { /* ignore */ }
}
