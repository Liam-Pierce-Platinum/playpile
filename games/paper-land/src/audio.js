// WebAudio paper sounds: rustle, snip, crumple, tick, fanfare. All synthesized.
let ctx = null, master = null, noiseBuf = null;
export const audio = { muted: /mute=1/.test(location.search) };
function init() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
  return !!ctx;
}
export function unlock() { if (init() && ctx.state === 'suspended') ctx.resume(); }
function noise(t, dur, type, f0, f1, vol, q = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, freq, dur, vol, type = 'triangle') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export function sfx(name, amt = 1) {
  if (audio.muted || !ctx) return;
  const t = ctx.currentTime;
  if (name === 'capture') { for (let i = 0; i < 3 + Math.min(5, amt | 0); i++) noise(t + i * 0.045, 0.12, 'bandpass', 2500 + Math.random() * 2500, 1200, 0.5, 0.8); tone(t, 523 + Math.min(amt, 10) * 30, 0.25, 0.18); tone(t + 0.08, 784 + Math.min(amt, 10) * 30, 0.3, 0.14); }
  else if (name === 'snip') { noise(t, 0.05, 'highpass', 5000, 7000, 0.6, 2); noise(t + 0.07, 0.06, 'highpass', 5000, 8000, 0.7, 2); tone(t + 0.05, 1200, 0.08, 0.1, 'square'); }
  else if (name === 'crumple') { for (let i = 0; i < 8; i++) noise(t + i * 0.05 + Math.random() * 0.03, 0.1, 'bandpass', 1800, 500, 0.6, 1.5); tone(t, 330, 0.5, 0.15, 'sawtooth'); tone(t + 0.15, 220, 0.6, 0.15, 'sawtooth'); }
  else if (name === 'leave') noise(t, 0.06, 'bandpass', 3000, 2000, 0.15, 3);
  else if (name === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, f, 0.35, 0.2));
  else if (name === 'click') tone(t, 880, 0.06, 0.12);
}
