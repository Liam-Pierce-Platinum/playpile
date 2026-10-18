// WebAudio synthwave: sequenced kick/hat/bass/arp + synthesized sfx + speed-tied roll hiss.
export class Sfx {
  constructor(muted) { this.ctx = null; this.muted = muted; this.music = false; this.intensity = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
    this.mus = c.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    this.fx = c.createGain(); this.fx.gain.value = 0.8; this.fx.connect(this.master);
    const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    this.rollF = c.createBiquadFilter(); this.rollF.type = 'bandpass'; this.rollF.frequency.value = 400; this.rollF.Q.value = 0.8;
    this.roll = c.createGain(); this.roll.gain.value = 0; n.connect(this.rollF); this.rollF.connect(this.roll); this.roll.connect(this.fx); n.start();
    this.next = c.currentTime + 0.1; this.step = 0;
  }
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
  tone(f, t, dur, type, g, dest, f2, cut) {
    const c = this.ctx, o = c.createOscillator(), a = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.005); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o; if (cut) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; o.connect(fl); node = fl; }
    node.connect(a); a.connect(dest || this.fx); o.start(t); o.stop(t + dur + 0.05);
  }
  hit(t, dur, g, freq, type = 'highpass', dest) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), a = c.createGain(); s.buffer = this.noise;
    f.type = type; f.frequency.value = freq; a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(a); a.connect(dest || this.fx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  update(speed, onGround) {
    if (!this.ctx) return; const c = this.ctx;
    this.roll.gain.setTargetAtTime(this.music && onGround ? Math.min(0.25, speed * 0.005) : 0, c.currentTime, 0.05);
    this.rollF.frequency.setTargetAtTime(200 + speed * 20, c.currentTime, 0.1);
    if (!this.music) { this.next = c.currentTime + 0.05; return; }
    const bpm = 112 + Math.min(40, speed * 0.8), st = 60 / bpm / 4;
    const roots = [55, 43.65, 65.41, 49], chord = [0, 3, 7, 10, 12, 7, 3, 0];
    while (this.next < c.currentTime + 0.15) {
      const t = this.next, s = this.step % 16, bar = Math.floor(this.step / 16) % 4, root = roots[bar];
      if (s % 4 === 0) this.tone(150, t, 0.18, 'sine', 0.9, this.mus, 40);
      if (s % 4 === 2) this.hit(t, 0.05, 0.25, 7000, 'highpass', this.mus);
      if (s % 8 === 4) this.hit(t, 0.14, 0.35, 1800, 'bandpass', this.mus);
      if (s % 2 === 0) this.tone(root * (s % 4 === 2 ? 2 : 1), t, st * 1.8, 'sawtooth', 0.3, this.mus, 0, 500 + this.intensity * 900);
      if (this.intensity > 0.15) this.tone(root * 4 * Math.pow(2, chord[s % 8] / 12), t, st * 0.9, 'square', 0.07, this.mus, 0, 2600);
      this.next += st; this.step++;
    }
  }
  pickup() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(880, t, 0.08, 'square', 0.15, 0, 0, 4000); this.tone(1320, t + 0.06, 0.12, 'square', 0.15, 0, 0, 4000); }
  land(v) { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(120, t, 0.15, 'sine', Math.min(0.8, 0.2 + v * 0.05), 0, 45); this.hit(t, 0.08, 0.2, 900, 'lowpass'); }
  near() { if (!this.ctx) return; this.hit(this.ctx.currentTime, 0.25, 0.4, 2500, 'bandpass'); }
  sector() { if (!this.ctx) return; const t = this.ctx.currentTime; [0, 4, 7, 12].forEach((n, i) => this.tone(440 * Math.pow(2, n / 12), t + i * 0.07, 0.5, 'sawtooth', 0.12, 0, 0, 3000)); }
  die() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(300, t, 0.9, 'sawtooth', 0.4, 0, 30, 1200); this.hit(t, 0.6, 0.7, 600, 'lowpass'); }
  fall() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(700, t, 1.2, 'triangle', 0.3, 0, 60); }
}
