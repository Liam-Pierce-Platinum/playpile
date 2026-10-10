// All synthesised with WebAudio. Impacts per material, explosions, glass,
// car alarms, a crane motor hum and ball whoosh that follow the action,
// and a short funky construction-site music loop that gets busier with the chain.
export class Audio {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.9; this.muted = false; this.step = 0; this.next = 0; this.intensity = 0; this.last = {}; this.playing = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.ratio.value = 6; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // looping beds: motor hum and ball whoosh
    this.motor = c.createOscillator(); this.motor.type = 'sawtooth'; this.motor.frequency.value = 55;
    const mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 380;
    this.motorG = c.createGain(); this.motorG.gain.value = 0;
    this.motor.connect(mf).connect(this.motorG).connect(this.sfxBus); this.motor.start();
    const ws = c.createBufferSource(); ws.buffer = this.noise; ws.loop = true;
    this.whooshF = c.createBiquadFilter(); this.whooshF.type = 'bandpass'; this.whooshF.Q.value = 1.2; this.whooshF.frequency.value = 400;
    this.whooshG = c.createGain(); this.whooshG.gain.value = 0;
    ws.connect(this.whooshF).connect(this.whooshG).connect(this.sfxBus); ws.start();
    this.next = c.currentTime + 0.1;
    this.apply();
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : 1; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.55; }
  tone(f, dur, type, vol, when = 0, bus = this.sfxBus, slide = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  hit(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // rate-limited: the same sound at most every `gap` seconds
  ok(n, gap) { const t = this.ctx.currentTime; if ((this.last[n] || 0) + gap > t) return false; this.last[n] = t; return true; }
  play(n, amt = 1) {
    if (!this.ctx) return;
    const v = Math.min(1, amt);
    switch (n) {
      case 'brick': if (!this.ok(n, 0.05)) return; this.hit(0.35, 700, 0.5 * v, 'lowpass', 0.4); this.hit(0.12, 2400, 0.18 * v, 'bandpass', 0.6, 0.02); this.tone(90, 0.18, 'sine', 0.35 * v, 0, this.sfxBus, 0.6); break;
      case 'concrete': if (!this.ok(n, 0.05)) return; this.hit(0.45, 500, 0.6 * v, 'lowpass', 0.3); this.tone(70, 0.25, 'sine', 0.45 * v, 0, this.sfxBus, 0.5); break;
      case 'wood': if (!this.ok(n, 0.05)) return; this.hit(0.18, 1500, 0.4 * v, 'bandpass', 0.5, 0, 3); this.tone(220 + Math.random() * 80, 0.12, 'triangle', 0.15 * v, 0, this.sfxBus, 0.6); break;
      case 'glass': if (!this.ok(n, 0.04)) return; this.hit(0.4, 6000, 0.35 * v, 'highpass'); for (let i = 0; i < 4; i++) this.tone(2500 + Math.random() * 3500, 0.15 + Math.random() * 0.2, 'sine', 0.05 * v, 0.02 + Math.random() * 0.15); break;
      case 'metal': if (!this.ok(n, 0.06)) return; { const f = 300 + Math.random() * 300; this.tone(f, 0.6, 'square', 0.05 * v, 0, this.sfxBus, 0.97); this.tone(f * 2.76, 0.4, 'square', 0.03 * v, 0, this.sfxBus, 0.98); this.hit(0.1, 3000, 0.3 * v); } break;
      case 'car': if (!this.ok(n, 0.08)) return; this.hit(0.3, 900, 0.45 * v, 'bandpass', 0.5, 0, 2); this.tone(160, 0.25, 'square', 0.06 * v, 0, this.sfxBus, 0.7); break;
      case 'alarm': for (let i = 0; i < 6; i++) this.tone(i % 2 ? 760 : 980, 0.16, 'square', 0.045, i * 0.17); break;
      case 'ball': if (!this.ok(n, 0.06)) return; this.tone(55, 0.4, 'sine', 0.7 * v, 0, this.sfxBus, 0.5); this.hit(0.3, 300, 0.6 * v, 'lowpass', 0.4); break;
      case 'boom': this.hit(1.3, 600, 1.0, 'lowpass', 0.12); this.tone(48, 0.9, 'sine', 0.8, 0, this.sfxBus, 0.45); this.hit(0.25, 2500, 0.4, 'bandpass', 0.3); break;
      case 'splash': this.hit(0.9, 1200, 0.6, 'bandpass', 0.3, 0, 0.7); this.hit(0.5, 400, 0.5, 'lowpass', 0.5, 0.05); break;
      case 'snap': if (!this.ok(n, 0.07)) return; this.hit(0.08, 2000 + Math.random() * 1500, 0.3 * v, 'bandpass', 0.5, 0, 4); break;
      case 'rumble': if (!this.ok(n, 0.5)) return; this.hit(1.6, 160, 0.9 * v, 'lowpass', 0.5); this.tone(38, 1.3, 'sine', 0.5 * v, 0, this.sfxBus, 0.8); break;
      case 'demolish': this.tone(392, 0.14, 'square', 0.08); this.tone(523, 0.14, 'square', 0.08, 0.1); this.tone(784, 0.4, 'square', 0.08, 0.2); this.hit(0.6, 300, 0.5, 'lowpass', 0.4); break;
      case 'chain': if (!this.ok(n, 0.07)) return; this.tone(600 + Math.min(40, amt) * 25, 0.09, 'triangle', 0.07); break;
      case 'go': this.tone(523, 0.12, 'square', 0.09); this.tone(784, 0.3, 'square', 0.09, 0.12); this.tone(1046, 0.4, 'triangle', 0.07, 0.12); break;
      case 'tick': this.tone(1200, 0.05, 'square', 0.05); break;
      case 'buzzer': this.tone(160, 0.7, 'sawtooth', 0.18, 0, this.sfxBus, 0.9); this.tone(164, 0.7, 'square', 0.08); break;
      case 'star': this.tone(1047, 0.25, 'triangle', 0.12); this.tone(1568, 0.4, 'triangle', 0.1, 0.06); break;
      case 'cash': [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, i * 0.06)); break;
      case 'click': this.tone(700, 0.05, 'triangle', 0.1); break;
      case 'slow': this.tone(300, 0.9, 'sine', 0.2, 0, this.sfxBus, 0.3); this.hit(0.9, 1200, 0.3, 'bandpass', 0.2); break;
      case 'deny': this.tone(200, 0.2, 'square', 0.07, 0, this.sfxBus, 0.8); break;
    }
  }
  // per-frame: motor and whoosh follow the crane, music is scheduled ahead
  update(trolleySpeed, ballSpeed, playing, slow) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const ms = Math.min(1, Math.abs(trolleySpeed) / 12);
    this.motorG.gain.setTargetAtTime(playing ? 0.05 + ms * 0.12 : 0, t, 0.08);
    this.motor.frequency.setTargetAtTime(45 + ms * 70, t, 0.1);
    const bs = Math.min(1, Math.max(0, ballSpeed - 4) / 18);
    this.whooshG.gain.setTargetAtTime(playing ? bs * bs * 0.5 : 0, t, 0.05);
    this.whooshF.frequency.setTargetAtTime(250 + bs * 900, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.music * 0.55 * (slow ? 0.35 : 1), t, 0.1);
    // music: 112 bpm 16ths
    const spb = 60 / 112 / 4;
    if (this.next < t) this.next = t + 0.05;
    while (this.next < t + 0.12) { this.beat(this.step++, this.next - t); this.next += spb; }
  }
  beat(n, when) {
    const s = n % 16, bar = Math.floor(n / 16) % 4, I = this.intensity, b = this.musicBus;
    // kick / snare / hats
    if (s === 0 || s === 10 || (I > 0.3 && s === 7)) { this.tone(110, 0.22, 'sine', 0.5, when, b, 0.35); }
    if (s === 4 || s === 12) { this.hit(0.16, 1800, 0.28, 'bandpass', 0.6, when, 0.8, b); this.tone(190, 0.08, 'triangle', 0.12, when, b, 0.6); }
    if (s % 2 === 0 || I > 0.6) this.hit(0.03, 8000, s % 4 === 2 ? 0.1 : 0.05, 'highpass', 0, when, 1, b);
    // bass: E minor riff
    const roots = [82.4, 82.4, 98, 73.4][bar];
    const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];
    const off = [0, 0, 0, 12, 0, 0, 7, 0, 0, 0, 10, 0, 0, 7, 0, 12];
    if (pat[s]) this.tone(roots * Math.pow(2, off[s] / 12), 0.16, 'square', 0.07, when, b, 0.98);
    // brass-ish stab on the offbeat when the chain is hot
    if (I > 0.25 && (s === 6 || s === 14)) { const f = roots * 4; this.tone(f, 0.12, 'sawtooth', 0.025 + I * 0.025, when, b); this.tone(f * 1.19, 0.12, 'sawtooth', 0.02 + I * 0.02, when, b); }
  }
}
