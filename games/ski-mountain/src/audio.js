// Ski sounds and a repeating downhill score, synthesized with Web Audio.
import { createMusicSequencer } from '../../_shared/music-sequencer.js';

let ctx = null, master = null, sfx = null, NB = null, muted = false;
let music = null, riding = false;
const loops = {};
const melody = [
  [77, null, 74, 69, 72, null, 74, null],
  [76, null, 72, null, 69, 72, 76, null],
  [77, 81, null, 77, 74, null, 72, null],
  [79, null, 76, 72, null, 74, 76, null],
  [81, null, 77, 74, 72, 74, null, 77],
  [76, 79, null, 76, 72, null, 69, null],
  [77, null, 74, null, 72, 69, 72, null],
  [79, null, 76, 74, 72, null, 69, null],
];
const bass = [50, 45, 46, 48, 50, 45, 46, 48];
function score(step) {
  const bar = step >> 3, beat = step & 7;
  const pitch = melody[bar][beat];
  const notes = pitch === null ? [] : [[pitch, 'sine', 0.12, 1.7]];
  if (pitch !== null && beat % 2 === 0) notes.push([pitch + 12, 'triangle', 0.035, 0.55]);
  if (beat === 0 || beat === 3 || beat === 6) notes.push([bass[bar] + (beat === 6 ? 7 : 0), 'triangle', 0.075, 2.4]);
  return notes;
}

const ready = () => ctx?.state === 'running' && !document.hidden;
const audible = () => ready() && !muted;
function audioStateChanged() {
  if (!audible()) music?.stop();
  window.dispatchEvent(new Event('ski-audio-state'));
}
function setOutput() {
  if (master) master.gain.setTargetAtTime(muted || document.hidden ? 0 : 0.85, ctx.currentTime, 0.025);
  audioStateChanged();
}
document.addEventListener('visibilitychange', setOutput);

export const Audio = {
  init() {
    if (document.hidden || muted) return;
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; comp.connect(master);
      sfx = ctx.createGain(); sfx.connect(comp);
      music = createMusicSequencer(ctx, comp, { bpm: 108, steps: 64, notesAt: score });
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NB = b;
      const loop = (name, type, f, q) => { const s = ctx.createBufferSource(); s.buffer = NB; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl).connect(g).connect(sfx); s.start(); loops[name] = { fl, g }; };
      loop('wind', 'lowpass', 500, 0.7); loop('carve', 'bandpass', 2600, 0.9); loop('grind', 'bandpass', 3800, 6); loop('aval', 'lowpass', 140, 1); loop('whistle', 'bandpass', 1600, 7);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 190; const og = ctx.createGain(); og.gain.value = 0; const of = ctx.createBiquadFilter(); of.type = 'bandpass'; of.frequency.value = 1400; of.Q.value = 3; o.connect(of).connect(og).connect(sfx); o.start(); loops.ring = { g: og, o };
      ctx.addEventListener('statechange', audioStateChanged);
      audioStateChanged();
    }
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      try { ctx.resume().catch(() => {}); } catch { /* Retry on the next gesture. */ }
    }
  },
  get muted() { return muted; },
  get ready() { return ready(); },
  setMuted(m) { muted = !!m; setOutput(); },
  updateRun(on) {
    if (riding && !on) for (const name of Object.keys(loops)) this.set(name, 0);
    riding = on;
    music?.update(on && audible() ? 0.78 : 0);
  },
  set(name, gain, freq) { const l = loops[name]; if (!l) return; l.g.gain.setTargetAtTime(gain, ctx.currentTime, 0.06); if (freq && l.fl) l.fl.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1); },
  noise(dur, { f = 1000, q = 1, type = 'bandpass', g = 0.5, a = 0.002, f2 = null, when = 0 } = {}) {
    if (!audible()) return; const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = NB; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(gn).connect(sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, { type = 'sine', g = 0.3, a = 0.005, f2 = null, when = 0 } = {}) {
    if (!audible()) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gn).connect(sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  jump() { this.noise(0.25, { f: 900, q: 0.8, g: 0.35, f2: 2400 }); this.tone(180, 0.12, { g: 0.12, f2: 320 }); },
  land(k) { this.noise(0.35, { f: 600, type: 'lowpass', g: 0.35 + 0.4 * k, f2: 150 }); this.tone(70, 0.25, { g: 0.3 * k + 0.1, f2: 40 }); this.noise(0.4, { f: 3000, q: 0.6, g: 0.18, when: 0.03 }); },
  trick(n) { const base = [523, 587, 659, 784, 880, 1046, 1175, 1318]; const f = base[Math.min(n, base.length - 1)]; this.tone(f, 0.18, { type: 'triangle', g: 0.2 }); this.tone(f * 1.5, 0.22, { type: 'triangle', g: 0.12, when: 0.06 }); },
  perfect() { [1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', g: 0.14, when: i * 0.05 })); },
  bank(big) { [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.3, { type: 'square', g: 0.06 + (big ? 0.03 : 0), when: i * 0.06 })); },
  crash() { this.noise(0.6, { f: 500, type: 'lowpass', g: 0.9, f2: 90 }); this.tone(90, 0.4, { g: 0.5, f2: 35 }); this.noise(0.8, { f: 2500, q: 0.5, g: 0.3, when: 0.05 }); },
  railOn() { this.tone(1900, 0.12, { type: 'square', g: 0.07 }); this.noise(0.1, { f: 4000, q: 3, g: 0.3 }); },
  ding() { this.tone(1568, 0.5, { type: 'sine', g: 0.2 }); this.tone(2093, 0.6, { type: 'sine', g: 0.14, when: 0.1 }); },
  swap(ski) { this.noise(0.28, { f: 700, q: 0.7, g: 0.4, f2: 3200 }); const f = ski ? 880 : 587; this.tone(f, 0.12, { type: 'square', g: 0.08 }); this.tone(f * 1.5, 0.16, { type: 'triangle', g: 0.12, when: 0.07 }); },
  click() { this.tone(900, 0.04, { type: 'triangle', g: 0.12 }); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', g: 0.18, when: 0.11 * i })); this.tone(130, 1.4, { type: 'sawtooth', g: 0.07, when: 0.1 }); },
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.55, { type: 'sawtooth', g: 0.08, when: 0.17 * i })); },
  rumble() { this.noise(2.5, { f: 120, type: 'lowpass', g: 0.9, a: 0.6 }); this.tone(45, 2.5, { g: 0.4, a: 0.5 }); },
};
