// All sound is synthesised: waves, gulls, chops, splashes, coins and a soft
// music-box tune. Nothing to download.
export class Audio {
  constructor() {
    this.ctx = null;
    this.music = 0.5;
    this.sfx = 0.8;
    this.muted = false;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.applyVolumes();
    // noise buffer reused by waves/chops/splashes
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // waves: looping noise through a lowpass that breathes
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    this.waveGain = c.createGain(); this.waveGain.gain.value = 0.08;
    src.connect(lp).connect(this.waveGain).connect(this.sfxBus);
    src.start();
    this.waveLp = lp;
    const loop = (type, freq, q) => {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random();
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(this.sfxBus); s.start();
      return { f, g };
    };
    this.rainLoop = loop('highpass', 1400, 0.4);
    this.windLoop = loop('bandpass', 380, 0.8);
    // music: a delay for the music box
    this.delay = c.createDelay(); this.delay.delayTime.value = 0.36;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const dl = c.createGain(); dl.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dl).connect(this.musicBus);
    this.noteT = 0; this.step = 0;
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxBus.gain.value = this.sfx;
    this.musicBus.gain.value = this.music * 0.5;
  }
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, bus = this.sfxBus, slide = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    if (bus === this.musicBus) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, freq, q = 1, vol = 0.3, type = 'bandpass', when = 0, sweep = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'chop': this.burst(0.12, 900, 2, 0.5); this.tone(140, 0.12, 'triangle', 0.3, 0, this.sfxBus, 0.6); break;
      case 'fall': this.burst(0.6, 300, 0.8, 0.4, 'lowpass', 0, 0.3); this.tone(70, 0.5, 'sine', 0.35, 0.25, this.sfxBus, 0.7); break;
      case 'pop': this.tone(660, 0.08, 'sine', 0.2, 0, this.sfxBus, 1.6); break;
      case 'wood': [523, 659].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.15, i * 0.06)); break;
      case 'splash': this.burst(0.35, 1400, 0.7, 0.35, 'bandpass', 0, 0.4); break;
      case 'nibble': this.tone(880, 0.05, 'sine', 0.08); break;
      case 'bite': this.burst(0.25, 1800, 0.8, 0.4); this.tone(988, 0.12, 'square', 0.12); this.tone(1319, 0.14, 'square', 0.1, 0.08); break;
      case 'reel': this.tone(1500 + Math.random() * 300, 0.03, 'square', 0.04); break;
      case 'catch': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, i * 0.08)); break;
      case 'escape': [392, 330, 262].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.14, i * 0.1)); break;
      case 'coin': this.tone(1319, 0.08, 'square', 0.08); this.tone(1760, 0.2, 'square', 0.08, 0.07); break;
      case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      case 'build': this.burst(0.5, 500, 0.6, 0.3, 'lowpass'); [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15, 0.2 + i * 0.09)); break;
      case 'bell': [1046, 1318].forEach((f, i) => this.tone(f, 1.4, 'sine', 0.16, i * 0.25)); break;
      case 'horn': this.tone(110, 1.3, 'sawtooth', 0.09); this.tone(111.5, 1.3, 'sawtooth', 0.07); break;
      case 'bump': this.burst(0.4, 200, 0.7, 0.6, 'lowpass'); this.tone(60, 0.35, 'sine', 0.4); break;
      case 'eat': [0, 0.12, 0.24].forEach((w) => this.burst(0.07, 2500, 3, 0.18, 'bandpass', w)); break;
      case 'sizzle': this.burst(1.2, 4000, 0.5, 0.12, 'highpass'); break;
      case 'goal': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, i * 0.1)); break;
      case 'gull': this.tone(1700, 0.18, 'sine', 0.06, 0, this.sfxBus, 0.6); this.tone(1600, 0.2, 'sine', 0.05, 0.22, this.sfxBus, 0.55); break;
      case 'lamp': this.tone(220, 0.6, 'triangle', 0.12, 0, this.sfxBus, 2); this.burst(0.4, 3000, 1, 0.1); break;
      case 'tie': this.burst(0.18, 600, 1.5, 0.3); this.tone(330, 0.15, 'triangle', 0.15, 0.1); break;
      case 'step': this.burst(0.05, 1200, 1, 0.04); break;
      case 'wade': this.burst(0.12, 900, 0.8, 0.07); break;
      case 'door': this.burst(0.35, 420, 3, 0.18, 'bandpass', 0, 1.8); this.tone(180, 0.2, 'triangle', 0.1, 0.25); break;
      case 'sleep': [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.12, i * 0.25, this.musicBus)); break;
    }
  }
  setWeather(rain, wind, indoors) {
    if (!this.ctx) return;
    const k = indoors ? 0.35 : 1;
    this.rainLoop.g.gain.value = rain * 0.22 * k;
    this.windLoop.g.gain.value = Math.max(0, wind - 0.3) * 0.28 * k;
    this.windLoop.f.frequency.value = 300 + Math.sin(this.ctx.currentTime * 0.7) * 120 + Math.sin(this.ctx.currentTime * 2.3) * 60;
  }
  thunder(delay) {
    if (!this.ctx) return;
    this.burst(2.6, 160, 0.6, 0.9, 'lowpass', delay, 0.5);
    this.burst(1.2, 400, 0.8, 0.35, 'lowpass', delay, 0.4);
    this.tone(48, 2.2, 'sine', 0.35, delay + 0.05, this.sfxBus, 0.7);
  }
  // called every frame: ambience + the music box
  update(dt, night, tideLevel) {
    if (!this.ctx) return;
    this.waveGain.gain.value = 0.06 + (tideLevel + 0.5) * 0.04;
    this.waveLp.frequency.value = 420 + Math.sin(this.ctx.currentTime * 0.5) * 160;
    this.noteT -= dt;
    if (this.noteT <= 0) {
      this.noteT = 0.48;
      const chords = night ? [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]] : [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 349.2], [196, 246.9, 392]];
      const chord = chords[Math.floor(this.step / 8) % 4];
      const s = this.step % 8;
      const pattern = [0, 1, 2, 1, 2, 1, 0, 2];
      if (Math.random() < 0.82) this.tone(chord[pattern[s]] * 2, 0.9, 'sine', 0.07, 0, this.musicBus);
      if (s === 0) this.tone(chord[0] / 2, 1.8, 'triangle', 0.05, 0, this.musicBus);
      this.step++;
    }
    this.gullT = (this.gullT ?? 6) - dt;
    if (this.gullT <= 0) { this.gullT = 8 + Math.random() * 14; if (!night) this.play('gull'); }
  }
}
