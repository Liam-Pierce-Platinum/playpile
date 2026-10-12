// WebAudio synth: every sound is generated, no files.
let ac = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
export const audio = { muted: false, music: true };
let musTimer = null, musStep = 0, musNext = 0;

export function unlock() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.connect(ac.destination);
      const comp = ac.createDynamicsCompressor(); comp.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
      musBus = ac.createGain(); musBus.gain.value = 0.16; musBus.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyMute();
    }
    if (ac.state === 'suspended') ac.resume();
    if (!musTimer) startMusic();
  } catch (e) { /* audio is optional */ }
}

export function applyMute() {
  if (!ac) return;
  master.gain.setTargetAtTime(audio.muted ? 0 : 1, ac.currentTime, 0.02);
  musBus.gain.setTargetAtTime(audio.music ? 0.16 : 0, ac.currentTime, 0.05);
}

function tone(type, f0, f1, dur, vol, when = 0, bus = sfxBus) {
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), gn = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, f, when = 0) {
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f, t);
  flt.frequency.exponentialRampToValueAtTime(80, t + dur);
  const gn = ac.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(flt); flt.connect(gn); gn.connect(sfxBus); s.start(t); s.stop(t + dur);
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const hz = (semi) => 523.25 * Math.pow(2, semi / 12);

export function sfx(name, arg = 0) {
  if (!ac || audio.muted) return;
  try {
    switch (name) {
      case 'jump': tone('sine', 420, 760, 0.09, 0.22); tone('triangle', 840, 1200, 0.05, 0.05); break;
      case 'star': {
        const s = SCALE[Math.min(arg - 1, SCALE.length - 1)] || 0;
        tone('triangle', hz(s), hz(s), 0.16, 0.25); tone('sine', hz(s + 12), hz(s + 12), 0.22, 0.1, 0.03);
        break;
      }
      case 'switch': [0, 4, 7, 12].forEach((s, i) => tone('square', hz(s + 7) / 2, hz(s + 7) / 2, 0.09, 0.06, i * 0.035)); tone('sine', 300, 1400, 0.25, 0.12); break;
      case 'milestone': [0, 4, 7, 12, 16].forEach((s, i) => tone('triangle', hz(s), hz(s), 0.2, 0.18, i * 0.06)); break;
      case 'die': noise(0.5, 0.6, 3000); tone('sawtooth', 220, 40, 0.45, 0.3); tone('sine', 110, 30, 0.6, 0.45); break;
      case 'click': tone('sine', 880, 660, 0.06, 0.15); break;
      case 'best': [0, 7, 12, 16, 19, 24].forEach((s, i) => tone('triangle', hz(s), hz(s), 0.28, 0.16, i * 0.08)); break;
      case 'buy': [12, 19, 24].forEach((s, i) => tone('square', hz(s), hz(s), 0.12, 0.07, i * 0.05)); break;
    }
  } catch (e) { /* ignore */ }
}

// ---- tiny music loop: minor arpeggio + bass, scheduled ahead
const PROG = [[-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5], [-8, -5, -1, 2]];   // Am F G E-ish
function startMusic() {
  musNext = ac.currentTime + 0.1;
  musTimer = setInterval(() => {
    if (!ac) return;
    while (musNext < ac.currentTime + 0.25) {
      const bar = (musStep >> 4) % 4, chord = PROG[bar], i = musStep % 16;
      const when = musNext - ac.currentTime;
      if (audio.music && !audio.muted) {
        const n = chord[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]] + (i >= 8 ? 12 : 0);
        tone('triangle', hz(n - 12), hz(n - 12), 0.13, 0.22, when, musBus);
        if (i % 4 === 0) tone('sine', hz(chord[0] - 24), hz(chord[0] - 24), 0.4, 0.5, when, musBus);
        if (i % 8 === 4) { /* soft hat */
          const t = ac.currentTime + when, s = ac.createBufferSource(); s.buffer = noiseBuf;
          const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
          const gn = ac.createGain(); gn.gain.setValueAtTime(0.25, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
          s.connect(f); f.connect(gn); gn.connect(musBus); s.start(t); s.stop(t + 0.06);
        }
      }
      musNext += 60 / 128 / 4;
      musStep++;
    }
  }, 60);
}
