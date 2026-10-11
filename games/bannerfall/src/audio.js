// BANNERFALL :: audio.js - everything synthesised in WebAudio: bowstrings, arrow thuds,
// sword clangs, shield tinks, war horns, shovels, drums, and a low modal drone with a
// frame-drum pattern for music. Sounds are positional by distance to the camera target.
let ctx = null, master, sfxBus, musBus, noiseBuf = null;
const S = { sfx: true, music: true, vol: 0.8 };
let musicTimer = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
  master = ctx.createGain(); master.gain.value = S.vol; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx ? 1 : 0; sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = S.music ? 0.32 : 0; musBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}
export function setAudio(o) {
  Object.assign(S, o);
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(S.sfx ? 1 : 0, ctx.currentTime, 0.05);
  musBus.gain.setTargetAtTime(S.music ? 0.32 : 0, ctx.currentTime, 0.2);
}
export function audioState() { return { ...S }; }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(t, dur, freq, q, peak, type = 'bandpass', bus = sfxBus) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  return f;
}
function tone(t, f0, f1, dur, peak, type = 'sine', bus = sfxBus, a = 0.004) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + a + dur + 0.05);
}

const lastPlay = {};
function limit(key, gap) { const now = ctx.currentTime; if (lastPlay[key] && now - lastPlay[key] < gap) return false; lastPlay[key] = now; return true; }

export const sfx = {
  bow(v = 1) { if (!ctx || !limit('bow', 0.035)) return; const t = ctx.currentTime; tone(t, 210 + Math.random() * 40, 120, 0.12, 0.14 * v, 'triangle'); noise(t, 0.09, 2400, 1.2, 0.08 * v); },
  bolt(v = 1) { if (!ctx || !limit('bolt', 0.05)) return; const t = ctx.currentTime; noise(t, 0.05, 1800, 2, 0.2 * v); tone(t, 140, 70, 0.08, 0.16 * v, 'square'); },
  thud(v = 1) { if (!ctx || !limit('thud', 0.03)) return; const t = ctx.currentTime; noise(t, 0.07, 500, 1.5, 0.12 * v, 'lowpass'); },
  hit(v = 1) { if (!ctx || !limit('hit', 0.04)) return; const t = ctx.currentTime; noise(t, 0.1, 900, 1, 0.2 * v); tone(t, 120, 60, 0.1, 0.12 * v); },
  clang(v = 1) {
    if (!ctx || !limit('clang', 0.05)) return;
    const t = ctx.currentTime; const b = 900 + Math.random() * 500;
    for (const m of [1, 2.76, 5.4]) tone(t, b * m, b * m * 0.98, 0.18 / m + 0.05, 0.05 * v / m, 'sine');
    noise(t, 0.03, 4000, 1, 0.08 * v);
  },
  tink(v = 1) { if (!ctx || !limit('tink', 0.05)) return; const t = ctx.currentTime; tone(t, 2600 + Math.random() * 600, 2400, 0.08, 0.05 * v); },
  dig() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 7; i++) noise(t + i * 0.24 + Math.random() * 0.08, 0.12, 300 + Math.random() * 300, 0.8, 0.18, 'lowpass'); },
  build() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 4; i++) { noise(t + i * 0.16, 0.06, 700, 2, 0.25); tone(t + i * 0.16, 180, 90, 0.08, 0.15, 'triangle'); } },
  coin() { if (!ctx) return; const t = ctx.currentTime; tone(t, 1300, 1300, 0.1, 0.07, 'triangle'); tone(t + 0.06, 1750, 1750, 0.16, 0.07, 'triangle'); },
  click() { if (!ctx) return; const t = ctx.currentTime; tone(t, 600, 400, 0.04, 0.06, 'triangle'); },
  error() { if (!ctx) return; const t = ctx.currentTime; tone(t, 200, 150, 0.15, 0.1, 'square'); },
  order() { if (!ctx || !limit('order', 0.1)) return; const t = ctx.currentTime; tone(t, 330, 330, 0.06, 0.05, 'triangle'); tone(t + 0.07, 440, 440, 0.08, 0.05, 'triangle'); },
  horn(low = false) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = low ? [[98, 0.9], [87, 1.4]] : [[147, 0.5], [196, 1.3]];
    let tt = t;
    for (const [f, d] of notes) {
      for (const det of [0, 3]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f + det;
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(400, tt); fl.frequency.linearRampToValueAtTime(1300, tt + 0.25); fl.Q.value = 2;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.09, tt + 0.12); g.gain.setValueAtTime(0.09, tt + d - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
        o.connect(fl); fl.connect(g); g.connect(sfxBus); o.start(tt); o.stop(tt + d + 0.05);
      }
      tt += d * 0.92;
    }
  },
  charge() { if (!ctx || !limit('charge', 0.5)) return; const t = ctx.currentTime; for (let i = 0; i < 8; i++) noise(t + i * 0.09, 0.08, 160, 1, 0.22, 'lowpass'); noise(t, 0.6, 700, 0.6, 0.12); },
  shout() { if (!ctx || !limit('shout', 0.8)) return; const t = ctx.currentTime; for (const f of [600, 950, 1400]) noise(t, 0.5, f, 6, 0.06); },
  death() { if (!ctx || !limit('death', 0.08)) return; const t = ctx.currentTime; noise(t, 0.18, 300, 1, 0.12, 'lowpass'); },
  rally() { if (!ctx) return; const t = ctx.currentTime; tone(t, 262, 262, 0.25, 0.12, 'triangle'); tone(t + 0.15, 330, 330, 0.25, 0.12, 'triangle'); tone(t + 0.3, 392, 392, 0.5, 0.14, 'triangle'); },
  heal() { if (!ctx || !limit('heal', 0.6)) return; const t = ctx.currentTime; for (const [f, d] of [[784, 0], [988, 0.08], [1175, 0.16]]) tone(t + d, f, f, 0.5, 0.025, 'sine', sfxBus, 0.05); },
  crash() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.9, 400, 0.6, 0.35, 'lowpass'); for (let i = 0; i < 5; i++) noise(t + 0.05 + i * 0.07, 0.1, 1200, 2, 0.15); },
  win() { if (!ctx) return; const t = ctx.currentTime; [392, 494, 587, 784].forEach((f, i) => tone(t + i * 0.18, f, f, 0.6, 0.1, 'triangle')); },
  lose() { if (!ctx) return; const t = ctx.currentTime; [392, 349, 311, 262].forEach((f, i) => tone(t + i * 0.25, f, f * 0.98, 0.7, 0.1, 'triangle')); },
};

// a dorian drone and a frame-drum loop, tempo rising in battle
let musicMode = 'calm';
export function setMusicMode(m) { musicMode = m; }
function startMusic() {
  if (musicTimer || !ctx) return;
  // drone
  const drone = ctx.createGain(); drone.gain.value = 0.18; drone.connect(musBus);
  for (const [f, type] of [[73.4, 'sawtooth'], [110, 'triangle'], [146.8, 'sine']]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 420;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(fl.frequency); lfo.start();
    o.connect(fl); fl.connect(drone); o.start();
  }
  const scale = [293.7, 329.6, 349.2, 392, 440, 493.9, 523.3, 587.3];
  let step = 0;
  const tick = () => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const fast = musicMode === 'battle';
    const beat = fast ? 0.32 : 0.5;
    // frame drum: boom on 1, taps between
    if (step % 4 === 0) tone(t, 110, 48, 0.35, 0.35, 'sine', musBus);
    else if (fast || step % 2 === 0) noise(t, 0.06, 1800, 0.8, fast ? 0.07 : 0.04, 'bandpass', musBus);
    if (step % 8 === 6 && fast) tone(t, 90, 45, 0.3, 0.25, 'sine', musBus);
    // a sparse modal melody
    if (step % (fast ? 4 : 8) === 2 && Math.random() < 0.6) {
      const f = scale[Math.floor(Math.random() * scale.length)] / (Math.random() < 0.5 ? 2 : 1);
      tone(t, f, f, beat * 2.5, 0.05, 'triangle', musBus, 0.03);
    }
    step++;
    musicTimer = setTimeout(tick, beat * 1000);
  };
  tick();
}
