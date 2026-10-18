// Tiny WebAudio synth: every sound is generated, nothing loaded.
let ctx = null, master = null; export let muted = /mute=1/.test(location.search);
export function unlock() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination); } catch (e) { return; } } if (ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
function tone(f0, f1, dur, type = 'sine', vol = .3, delay = 0) {
  if (!ctx || muted) return; const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, freq, vol = .3, q = 1) {
  if (!ctx || muted) return; const t = ctx.currentTime;
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
export const sfx = {
  jump: () => tone(260, 420, .12, 'triangle', .18),
  land: () => noise(.08, 500, .25),
  step: () => noise(.04, 900 + Math.random() * 300, .06, 2),
  bounce: () => { tone(200, 900, .35, 'sine', .3); tone(300, 1200, .25, 'triangle', .1, .03); },
  gem: () => { tone(880, 1320, .12, 'sine', .22); tone(1320, 1760, .18, 'sine', .15, .07); },
  place: () => { noise(.06, 300, .35, 1.5); tone(160, 90, .08, 'square', .06); },
  break: () => { noise(.15, 700, .4, .8); },
  check: () => [523, 659, 784].forEach((f, i) => tone(f, f, .25, 'triangle', .18, i * .08)),
  die: () => { tone(400, 60, .5, 'sawtooth', .15); noise(.3, 200, .2); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f * 1.01, .3, 'triangle', .2, i * .11)),
  click: () => tone(600, 500, .05, 'square', .06),
  no: () => tone(200, 150, .12, 'square', .08),
};
