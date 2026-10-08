// Every sound is synthesised: no files to load. Punches are a low thump plus a
// short burst of filtered noise (the leather), blocks are the same thump
// muffled, the bell is a stack of inharmonic partials with a long ring, and
// the crowd is filtered noise whose volume follows how loud the fight is.

let ctx = null, master = null, crowdGain = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('sp_mute') === '1'; } catch {}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // the crowd bed
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
  src.connect(bp); bp.connect(lp); lp.connect(crowdGain); crowdGain.connect(master); src.start();
}
export function setMuted(m) {
  muted = m; try { localStorage.setItem('sp_mute', m ? '1' : '0'); } catch {}
  if (master) master.gain.value = m ? 0 : 0.7;
}
export const isMuted = () => muted;

export function setCrowd(level) {
  if (!crowdGain) return;
  crowdGain.gain.setTargetAtTime(0.03 + level * 0.22, ctx.currentTime, 0.15);
}

function noise(t0, dur, freq, q, gain, type = 'bandpass') {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 1;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.02);
  return f;
}
function tone(t0, dur, f0, f1, gain, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}

export function play(name, o = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'hit': {
      const k = Math.min(1, (o.dmg || 6) / 16);
      tone(t, 0.12 + k * 0.1, 120 + k * 30, 38, 0.5 + k * 0.4);
      noise(t, 0.05 + k * 0.05, o.body ? 500 : 1300, 0.9, 0.5 + k * 0.4);
      if (o.big) { tone(t, 0.3, 70, 30, 0.6); noise(t, 0.18, 300, 0.5, 0.35, 'lowpass'); }
      break;
    }
    case 'block': tone(t, 0.08, 150, 70, 0.3); noise(t, 0.05, 700, 1.2, 0.28, 'lowpass'); break;
    case 'whiff': { const f = noise(t, 0.16, 2400, 1.5, 0.18); f.frequency.exponentialRampToValueAtTime(700, t + 0.15); break; }
    case 'swing': { const f = noise(t, 0.08, 3000, 2, 0.05); f.frequency.exponentialRampToValueAtTime(1200, t + 0.08); break; }
    case 'dodge': { const f = noise(t, 0.2, 1800, 3, 0.16); f.frequency.exponentialRampToValueAtTime(500, t + 0.2); break; }
    case 'bell': {
      const ring = (t0) => { for (const [f, g] of [[830, 0.25], [1662, 0.12], [2210, 0.08], [3020, 0.05]]) tone(t0, 1.6, f, f, g); };
      const n = o.n || 1;
      for (let i = 0; i < n; i++) ring(t + i * 0.32);
      break;
    }
    case 'count': tone(t, 0.18, 220, 200, 0.25, 'square'); tone(t, 0.18, 110, 100, 0.2, 'triangle'); break;
    case 'combo': {
      const n = Math.min(5, o.n || 2);
      for (let i = 0; i < n; i++) tone(t + i * 0.05, 0.09, 523 * Math.pow(1.26, i), 523 * Math.pow(1.26, i), 0.12, 'square');
      break;
    }
    case 'kd': tone(t, 0.6, 90, 28, 0.8); noise(t, 0.5, 200, 0.4, 0.5, 'lowpass'); roar(t, 1); break;
    case 'roar': roar(t, o.k || 0.6); break;
    case 'star': { tone(t, 0.4, 200, 900, 0.18, 'sawtooth'); break; }
    case 'tell': tone(t, 0.12, 1200, 1200, 0.07, 'square'); break;
    case 'ui': tone(t, 0.06, 660, 880, 0.12, 'square'); break;
    case 'buy': for (let i = 0; i < 3; i++) tone(t + i * 0.06, 0.1, 660 * Math.pow(1.335, i), 660 * Math.pow(1.335, i), 0.12, 'square'); break;
    case 'deny': tone(t, 0.15, 200, 140, 0.15, 'square'); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 0.3, f, f, 0.14, 'square')); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(t + i * 0.18, 0.35, f, f * 0.98, 0.13, 'triangle')); break;
  }
}
function roar(t, k) {
  const f = noise(t, 2.2, 650, 0.5, 0.25 * k);
  f.frequency.linearRampToValueAtTime(900, t + 0.5);
}
