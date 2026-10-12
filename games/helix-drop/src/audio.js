// HELIX DROP - every sound is synthesised with WebAudio. No audio files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = true; this.nextNote = 0; this.step = 0; this.timer = null; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = 0.16; this.mus.connect(this.master);
      // noise buffer
      const len = c.sampleRate * 1.0; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  tone(f, dur, { type = 'sine', vol = 0.3, to = null, at = 0, attack = 0.004, dest = null } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, f = 1200, q = 0.8, type = 'bandpass', to = null, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  bounce(soft) {
    if (!this.ok()) return;
    const v = soft ? 0.18 : 0.32;
    this.tone(190 + Math.random() * 20, 0.16, { vol: v, to: 120 });
    this.tone(620, 0.05, { type: 'triangle', vol: v * 0.35, to: 380 });
    this.noise(0.05, { vol: v * 0.4, f: 2400, q: 1.5 });
  }

  pass(n) {
    if (!this.ok()) return;
    const semis = [0, 4, 7, 12, 16, 19, 24, 28, 31, 36];
    const f = 523.25 * Math.pow(2, semis[Math.min(n - 1, semis.length - 1)] / 12);
    this.tone(f, 0.18, { type: 'triangle', vol: 0.22 });
    this.tone(f * 2, 0.1, { type: 'sine', vol: 0.08, at: 0.02 });
    this.noise(0.18, { vol: 0.1, f: 900, to: 3000, q: 0.7 });
  }

  fire() {
    if (!this.ok()) return;
    this.noise(0.5, { vol: 0.35, f: 300, to: 2600, q: 0.6, type: 'lowpass' });
    this.tone(110, 0.45, { type: 'sawtooth', vol: 0.12, to: 330 });
  }

  smash() {
    if (!this.ok()) return;
    this.noise(0.45, { vol: 0.6, f: 3000, to: 500, q: 0.5, type: 'lowpass' });
    this.noise(0.12, { vol: 0.35, f: 6000, q: 0.6, type: 'highpass' });
    this.tone(90, 0.35, { vol: 0.5, to: 40 });
    for (let i = 0; i < 5; i++) this.tone(1800 + Math.random() * 2200, 0.08, { type: 'triangle', vol: 0.06, at: 0.02 + i * 0.03 });
  }

  death() {
    if (!this.ok()) return;
    this.noise(0.3, { vol: 0.55, f: 700, to: 150, q: 1.2 });
    this.tone(160, 0.6, { type: 'sawtooth', vol: 0.18, to: 45 });
    this.tone(70, 0.4, { vol: 0.5, to: 35 });
  }

  clear() {
    if (!this.ok()) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => { this.tone(f, 0.25, { type: 'triangle', vol: 0.2, at: i * 0.07 }); this.tone(f / 2, 0.2, { vol: 0.1, at: i * 0.07 }); });
    this.noise(0.6, { vol: 0.12, f: 5000, q: 0.5, type: 'highpass', at: 0.3 });
  }

  click() { if (this.ok()) this.tone(880, 0.06, { type: 'triangle', vol: 0.15, to: 1200 }); }

  // ---- light bouncy music loop: bass + plucked chords, 112 bpm
  startMusic() {
    const c = this.ctx; this.nextNote = c.currentTime + 0.1;
    const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
    const root = 261.63;
    const spb = 60 / 112 / 2; // eighth notes
    const sched = () => {
      if (!this.ctx) return;
      while (this.nextNote < c.currentTime + 0.25) {
        const s = this.step, t = this.nextNote - c.currentTime;
        const ch = chords[Math.floor(s / 8) % 4];
        if (!this.muted && this.musicOn) {
          if (s % 4 === 0) this.tone(root / 4 * Math.pow(2, ch[0] / 12), spb * 1.8, { type: 'triangle', vol: 0.5, at: t, dest: this.mus });
          if (s % 2 === 1 || s % 8 === 0) {
            const n = ch[(s * 5 + (s >> 3)) % 3] + (s % 4 === 3 ? 12 : 0);
            this.tone(root * Math.pow(2, n / 12), spb * 0.9, { type: 'sine', vol: 0.3, at: t, dest: this.mus });
          }
          if (s % 2 === 0) this.noise(0.03, { vol: s % 4 === 2 ? 0.12 : 0.05, f: 8000, type: 'highpass', at: t });
        }
        this.step++; this.nextNote += spb;
      }
    };
    this.timer = setInterval(sched, 60);
  }
}
