// Tiny WebAudio kit: engine hum, tyre skid noise, gem chime, corner tick, fall whoosh.
export class Sfx {
  constructor(muted) { this.muted = muted; this.ctx = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.out = c.createGain(); this.out.gain.value = this.muted ? 0 : 0.5; this.out.connect(c.destination);
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engG = c.createGain(); this.engG.gain.value = 0; this.eng.connect(lp).connect(this.engG).connect(this.out); this.eng.start();
    const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = c.createBufferSource(); n.buffer = buf; n.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 1.4;
    this.skG = c.createGain(); this.skG.gain.value = 0; n.connect(bp).connect(this.skG).connect(this.out); n.start();
  }
  setMute(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.5; }
  engine(speed, drift) { if (!this.ctx) return; const t = this.ctx.currentTime; this.eng.frequency.setTargetAtTime(speed ? 55 + speed * 9 + drift * 40 : 40, t, 0.08); this.engG.gain.setTargetAtTime(speed ? 0.07 : 0, t, 0.1); }
  skid(a) { if (!this.ctx) return; this.skG.gain.setTargetAtTime(a * 0.16, this.ctx.currentTime, 0.05); }
  blip(f, dur, type = 'sine', vol = 0.25, f2) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  tick(n) { this.blip(520 + (n % 8) * 40, 0.08, 'triangle', 0.12); }
  gem() { this.blip(988, 0.12, 'sine', 0.22); setTimeout(() => this.blip(1480, 0.18, 'sine', 0.2), 70); }
  fall() { this.blip(500, 0.9, 'sine', 0.3, 60); }
  zone() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.18), i * 90)); }
  nope() { this.blip(180, 0.15, 'square', 0.1); }
}
