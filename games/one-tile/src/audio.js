// ONE TILE - all sound is synthesised here. Chiptune blips plus a quiet stealth loop.
let ctx = null, master, sfxBus, musicBus, noiseBuf;
let musicOn = true, sfxOn = true, musicTimer = null, nextBeat = 0, beat = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.5 : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.16 : 0; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
  } catch (e) { ctx = null; }
}

export function setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.05); }
export function setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.02); }
export const audioState = () => ({ musicOn, sfxOn });

function tone(freq, dur, { type = 'square', vol = 0.3, at = 0, slide = 0, bus = sfxBus, attack = 0.004 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at; const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, at = 0, freq = 3000, q = 1, bus = sfxBus, type = 'bandpass' } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at; const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  step(i = 0) { tone(i % 2 ? 196 : 174, 0.05, { vol: 0.12, type: 'triangle' }); noise(0.03, { vol: 0.05, freq: 1800 }); },
  wait() { tone(130, 0.06, { vol: 0.06, type: 'triangle' }); },
  plan() { tone(660, 0.035, { vol: 0.08 }); },
  planWait() { tone(440, 0.05, { vol: 0.08 }); tone(330, 0.05, { vol: 0.06, at: 0.05 }); },
  undo() { tone(330, 0.05, { vol: 0.07, slide: 0.7 }); },
  scrub() { tone(1200, 0.015, { vol: 0.03 }); },
  click() { tone(880, 0.03, { vol: 0.1 }); tone(1320, 0.03, { vol: 0.06, at: 0.03 }); },
  buzz() { tone(110, 0.14, { vol: 0.12, type: 'sawtooth' }); },
  go() { [523, 659, 784].forEach((f, i) => tone(f, 0.08, { vol: 0.1, at: i * 0.06 })); },
  crack() { noise(0.03, { vol: 0.25, freq: 5000, q: 6 }); tone(2400, 0.02, { vol: 0.08, at: 0.01 }); },
  open() { noise(0.06, { vol: 0.3, freq: 3000, q: 3 }); [392, 523, 659, 1046].forEach((f, i) => tone(f, 0.12, { vol: 0.12, at: 0.05 + i * 0.05 })); },
  loot() { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.07, { vol: 0.09, at: i * 0.045 })); },
  coin() { tone(1568, 0.05, { vol: 0.05 }); tone(2093, 0.08, { vol: 0.05, at: 0.04 }); },
  key() { tone(784, 0.06, { vol: 0.1 }); tone(1175, 0.1, { vol: 0.1, at: 0.06 }); },
  door() { noise(0.18, { vol: 0.15, freq: 600, q: 0.7 }); tone(220, 0.12, { vol: 0.06, slide: 1.5 }); },
  alarm() {
    for (let i = 0; i < 6; i++) { tone(880, 0.16, { vol: 0.16, at: i * 0.32, slide: 0.62, type: 'square' }); tone(587, 0.16, { vol: 0.12, at: i * 0.32 + 0.16, slide: 1.5, type: 'square' }); }
    noise(0.3, { vol: 0.2, freq: 800, q: 0.5 });
  },
  spotted() { tone(1760, 0.08, { vol: 0.14 }); tone(1760, 0.08, { vol: 0.14, at: 0.1 }); },
  win() {
    const n = [523, 659, 784, 1046, 784, 1046, 1318];
    n.forEach((f, i) => { tone(f, 0.14, { vol: 0.12, at: i * 0.09 }); tone(f / 2, 0.14, { vol: 0.08, at: i * 0.09, type: 'triangle' }); });
  },
  star(i) { tone(880 * Math.pow(1.26, i), 0.16, { vol: 0.12 }); tone(1760 * Math.pow(1.26, i), 0.1, { vol: 0.05, at: 0.05 }); },
};

// Stealth loop: 96 bpm, A minor, walking bass + soft hats + a sparse plucky motif.
const BASS = [45, 0, 45, 48, 0, 50, 0, 47, 45, 0, 45, 52, 0, 50, 48, 47];
const LEAD = [0, 0, 69, 0, 0, 0, 72, 0, 0, 71, 0, 0, 0, 0, 64, 0, 0, 0, 69, 0, 0, 0, 76, 0, 0, 74, 72, 0, 71, 0, 0, 0];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  if (musicTimer) return;
  nextBeat = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    const spb = 60 / 96 / 2; // eighth notes
    while (nextBeat < ctx.currentTime + 0.25) {
      const at = nextBeat - ctx.currentTime;
      const b = BASS[beat % 16]; if (b) tone(mtof(b), spb * 0.9, { type: 'triangle', vol: 0.5, at, bus: musicBus, attack: 0.01 });
      if (beat % 2 === 1) noise(0.04, { vol: 0.06, freq: 8000, q: 1, at, bus: musicBus, type: 'highpass' });
      if (beat % 8 === 4) noise(0.08, { vol: 0.09, freq: 1200, q: 0.8, at, bus: musicBus });
      const l = LEAD[beat % 32]; if (l) { tone(mtof(l), 0.22, { type: 'square', vol: 0.09, at, bus: musicBus }); tone(mtof(l + 12), 0.12, { type: 'triangle', vol: 0.04, at: at + 0.11, bus: musicBus }); }
      nextBeat += spb; beat++;
    }
  }, 60);
}
