// WebAudio synth: everything generated, no files.
let ctx = null, master = null, muted = false, rollSrc = null, rollGain = null, rollFilt = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02); }
export function isMuted() { return muted; }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(freq, type, dur, vol, when = 0, slide = 0) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, f, q = 1, type = 'bandpass', when = 0) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.002, vol, dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

// hollow maple "tok": damped resonances + click
export function pinHit(power) {
  if (!ctx) return; const v = Math.min(1, 0.15 + power * 0.12);
  const f = 700 + Math.random() * 500;
  tone(f, 'triangle', 0.09, v * 0.5, 0, 0.7); tone(f * 2.3, 'sine', 0.05, v * 0.25, 0, 0.8);
  noise(0.05, v * 0.5, 2500 + Math.random() * 1500, 1.5);
}
export function crash(power) { // the big pin explosion on impact
  if (!ctx) return; const v = Math.min(1, 0.4 + power * 0.08);
  noise(0.35, v * 0.9, 1800, 0.7); noise(0.6, v * 0.5, 600, 0.6, 'lowpass');
  for (let i = 0; i < 7; i++) setTimeout(() => pinHit(2 + Math.random() * 4), i * 18 + Math.random() * 30);
  tone(90, 'sine', 0.25, v * 0.6, 0, 0.5);
}
export function release() { if (!ctx) return; tone(140, 'sine', 0.16, 0.5, 0, 0.6); noise(0.12, 0.25, 400, 1, 'lowpass'); }
export function thud() { if (!ctx) return; tone(70, 'sine', 0.3, 0.7, 0, 0.5); noise(0.2, 0.4, 300, 1, 'lowpass'); }
export function gutter() { if (!ctx) return; tone(220, 'sawtooth', 0.5, 0.12, 0, 0.4); noise(0.4, 0.25, 500, 2); }
export function click() { if (!ctx) return; tone(880, 'square', 0.04, 0.12); tone(1320, 'sine', 0.06, 0.1, 0.02); }
export function whoosh() { if (!ctx) return; noise(0.35, 0.3, 1200, 0.8); }
export function strike() {
  if (!ctx) return; const n = [523, 659, 784, 1047, 1319];
  n.forEach((f, i) => { tone(f, 'square', 0.18, 0.12, i * 0.07); tone(f * 2, 'sine', 0.25, 0.08, i * 0.07); });
  tone(1568, 'sawtooth', 0.6, 0.08, 0.36, 1.01); noise(0.8, 0.15, 6000, 0.5, 'highpass', 0.3);
}
export function spare() { if (!ctx) return; [587, 740, 880, 1175].forEach((f, i) => tone(f, 'triangle', 0.2, 0.18, i * 0.06)); }
export function sad() { if (!ctx) return; tone(300, 'triangle', 0.25, 0.15, 0, 0.8); tone(225, 'triangle', 0.35, 0.15, 0.18, 0.8); }
export function fanfare() { if (!ctx) return; [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 'square', 0.16, 0.1, i * 0.1)); }
export function star(i) { if (!ctx) return; tone(880 * Math.pow(1.26, i), 'triangle', 0.25, 0.2); tone(1760 * Math.pow(1.26, i), 'sine', 0.2, 0.1, 0.03); }

// continuous ball roll rumble
export function roll(speed, onLane) {
  if (!ctx) return;
  if (!rollSrc) {
    rollSrc = ctx.createBufferSource(); rollSrc.buffer = noiseBuf; rollSrc.loop = true;
    rollFilt = ctx.createBiquadFilter(); rollFilt.type = 'lowpass'; rollFilt.frequency.value = 200; rollFilt.Q.value = 3;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    rollSrc.connect(rollFilt); rollFilt.connect(rollGain); rollGain.connect(master); rollSrc.start();
  }
  const t = ctx.currentTime;
  rollGain.gain.setTargetAtTime(speed > 0.3 ? Math.min(0.9, speed * 0.09) * (onLane ? 1 : 0.6) : 0, t, 0.05);
  rollFilt.frequency.setTargetAtTime(onLane ? 140 + speed * 25 : 600, t, 0.05);
}
