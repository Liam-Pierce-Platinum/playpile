// All sound is synthesized: boings, pops, slide whistles and a little oom-pah ragtime loop.
const MUTE = /[?&]mute=1/.test(location.search);
let ctx = null, master = null, nbuf = null, musicTimer = 0, nextT = 0, step = 0;

export function ac() {
  if (MUTE) return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(g, t, a, d, v) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function osc(type, f0, f1, dur, vol, delay = 0, at = null) {
  const c = ctx; if (!c) return;
  const t = at ?? c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.006, dur, vol); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, delay = 0) {
  const c = ctx; if (!c) return;
  if (!nbuf) { nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = nbuf; f.type = 'lowpass'; f.frequency.value = freq; env(g, t, 0.004, dur, vol);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

export const sfx = {
  hop(p = 1) { osc('sine', 230 * p, 690 * p, 0.14, 0.22); },
  land() { noise(0.07, 0.18, 380); },
  pop() { noise(0.1, 0.4, 2000); osc('square', 220, 60, 0.09, 0.12); },
  boom() { noise(0.35, 0.6, 800); osc('sawtooth', 130, 38, 0.3, 0.2); },
  toss() { osc('triangle', 500, 900, 0.12, 0.12); },
  splat() { noise(0.22, 0.4, 900); osc('sine', 420, 90, 0.2, 0.2); },
  bonk() { osc('triangle', 950, 280, 0.12, 0.28); osc('sine', 1500, 520, 0.1, 0.12); },
  whistle() { osc('sine', 1700, 240, 0.85, 0.16); },
  ding() { osc('sine', 1320, 1320, 0.22, 0.18); osc('sine', 1760, 1760, 0.3, 0.14, 0.08); },
  honk() { for (const d of [0, 0.24]) { osc('square', 310, 300, 0.18, 0.12, d); osc('square', 392, 380, 0.18, 0.1, d); } },
  tick() { osc('square', 880, 880, 0.06, 0.08); },
  go() { osc('square', 1046, 1046, 0.25, 0.1); osc('square', 1318, 1318, 0.25, 0.08); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => osc('square', f, f, i > 4 ? 0.5 : 0.14, 0.1, i * 0.12)); },
  lose() { [392, 370, 349, 311].forEach((f, i) => osc('sawtooth', f, f * 0.94, i === 3 ? 0.9 : 0.28, 0.12, i * 0.33)); },
};

// ---- music: ragtime oom-pah, I - VI7 - II7 - V7 ----
const CH = [[48, 52, 55], [45, 49, 52], [50, 54, 57], [43, 47, 50]];
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
function schedule() {
  if (!ctx || document.hidden) return;
  const e = 60 / 150 / 2; // eighth
  while (nextT < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8) % 4, s = step % 8, ch = CH[bar];
    if (s % 4 === 0) osc('triangle', mtof(ch[0] - 12 + (s ? 7 : 0)), mtof(ch[0] - 12 + (s ? 7 : 0)), 0.22, 0.16, 0, nextT);
    if (s % 4 === 2) for (const n of ch) osc('square', mtof(n + 12), mtof(n + 12), 0.08, 0.025, 0, nextT);
    if (Math.random() < 0.55) { const n = ch[(Math.random() * 3) | 0] + 24 + (Math.random() < 0.3 ? 2 : 0); osc('triangle', mtof(n), mtof(n), e * 0.9, 0.05, 0, nextT); }
    nextT += e; step++;
  }
}
export function music(on) {
  if (!on) { clearInterval(musicTimer); musicTimer = 0; return; }
  if (musicTimer || !ac()) return;
  nextT = ctx.currentTime + 0.1; musicTimer = setInterval(schedule, 90);
}
