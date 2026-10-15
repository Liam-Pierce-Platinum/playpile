// Synth sound: no files. Wakes on first input (browsers block audio before a gesture).
let ctx = null, master = null, noiseBuf = null, muted = false;
const VOL = 0.55;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ctx.destination);
    const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : VOL; }
export function isMuted() { return muted; }

function tone(f, dur, type = 'sine', vol = 0.3, f2 = 0, delay = 0, attack = 0.004) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', f2 = 0, delay = 0, attack = 0.004) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.03);
}

export const sfx = {
  throw(p) { noise(0.16 + p * 0.1, 0.18 + p * 0.25, 500, 0.9, 'bandpass', 2600 + p * 2000); tone(200, 0.07, 'triangle', 0.08, 110); },
  hit() { tone(150, 0.2, 'sine', 0.7, 45); noise(0.14, 0.55, 2200, 0.7, 'lowpass', 250); tone(1100, 0.04, 'square', 0.05, 500); },
  thud(v = 1) { tone(120, 0.09, 'sine', 0.22 * v, 60); noise(0.05, 0.12 * v, 900, 1, 'lowpass'); },
  wall() { tone(90, 0.12, 'sine', 0.3, 50); noise(0.1, 0.25, 600, 0.8, 'lowpass'); },
  catch(perfect) {
    noise(0.07, 0.35, 2600, 1); tone(140, 0.12, 'sine', 0.4, 70);
    const n = perfect ? [523, 784, 1046, 1568] : [523, 784, 1046];
    n.forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, 0, 0.05 + i * 0.06));
  },
  block() { tone(320, 0.09, 'square', 0.12, 160); noise(0.09, 0.35, 2000, 2); },
  pick() { tone(620, 0.06, 'triangle', 0.14, 980); },
  charge() { tone(1300, 0.06, 'square', 0.06, 1800); },
  dash() { noise(0.16, 0.2, 700, 1, 'bandpass', 2600); },
  tick() { tone(880, 0.07, 'square', 0.08); },
  whistle(len = 0.45) {
    if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2900; l.frequency.value = 34; lg.gain.value = 140;
    l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + len - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + len + 0.05); l.stop(t + len + 0.05);
  },
  cheer(v = 1) { noise(1.3, 0.16 * v, 1100, 0.5, 'bandpass', 900, 0, 0.18); noise(0.9, 0.08 * v, 2600, 0.8, 'bandpass', 2000, 0.05, 0.12); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, 0, i * 0.09)); this.cheer(1.6); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.18, 0, i * 0.13)); },
};
