// Every sound is synthesised: a sawtooth+noise engine that follows RPM
// through fake gear changes, thumps, crunches, booms, a formant-filtered
// "oof" voice for bailouts, and a short loop of music per world.
const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SONGS = [
  // canyon: surf rock in A minor
  { bpm: 148, chords: [[57, 'm'], [55, ''], [53, ''], [52, '']], lead: 'square', bass: 'triangle', swing: 0 },
  // junkyard: funky D dorian
  { bpm: 116, chords: [[50, 'm7'], [55, '7'], [50, 'm7'], [57, 'm7']], lead: 'square', bass: 'sawtooth', swing: 0.12 },
  // glacier: bright bells
  { bpm: 132, chords: [[60, ''], [55, ''], [57, 'm'], [53, '']], lead: 'triangle', bass: 'triangle', swing: 0 },
  // volcano: heavy E phrygian
  { bpm: 156, chords: [[52, '5'], [53, '5'], [52, '5'], [50, '5']], lead: 'sawtooth', bass: 'sawtooth', swing: 0 },
  // neon: synthwave
  { bpm: 120, chords: [[57, 'm'], [53, ''], [60, ''], [55, '']], lead: 'sawtooth', bass: 'sawtooth', swing: 0 },
];
const QUAL = { '': [0, 4, 7, 12], m: [0, 3, 7, 12], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], '5': [0, 7, 12, 7] };
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
const LEAD_ON = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];

export class Audio {
  constructor() { this.ctx = null; this.music = 0.55; this.sfx = 0.9; this.muted = false; this.song = 0; this.step = 0; this.next = 0; this.musicOn = false; this.eng = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 6; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.engBus = c.createGain(); this.engBus.connect(this.sfxBus);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    this.next = c.currentTime + 0.1;
  }
  apply() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : 0.9; this.sfxBus.gain.value = this.sfx; this.musicBus.gain.value = this.music * 0.42; }

  tone(f, dur, type, vol, when = 0, opts = {}) {
    const c = this.ctx, t = (opts.abs ? when : c.currentTime + when);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * opts.slide), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (opts.att || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (opts.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opts.lp; f2.Q.value = opts.q || 1; g.connect(f2); out = f2; }
    o.connect(g); out.connect(opts.bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur, f, vol, type = 'bandpass', sweep = 0, when = 0, q = 1, bus = this.sfxBus, abs = false) {
    const c = this.ctx, t = abs ? when : c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // formant-filtered voice blip: "oof", "ow", "whoa"
  voice(kind = 'oof', pitch = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const V = { oof: [[330, 300], [870, 700], 0.34, 0.75], ow: [[700, 380], [1150, 800], 0.4, 0.8], whoa: [[420, 650], [800, 1050], 0.5, 1.15], ugh: [[520, 480], [1250, 1100], 0.28, 0.9] }[kind];
    const dur = V[2];
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = (150 + Math.random() * 40) * pitch;
    o.frequency.setValueAtTime(f0 * 1.15, t); o.frequency.exponentialRampToValueAtTime(f0 * V[3], t + dur);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 7; vg.gain.value = f0 * 0.03; vib.connect(vg).connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.03); g.gain.setValueAtTime(0.5, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mixG = c.createGain(); mixG.gain.value = 0.9;
    for (let i = 0; i < 2; i++) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
      bp.frequency.setValueAtTime(V[i][0], t); bp.frequency.linearRampToValueAtTime(V[i][1], t + dur);
      const bg = c.createGain(); bg.gain.value = i ? 0.6 : 1.3;
      o.connect(bp).connect(bg).connect(g);
    }
    g.connect(mixG).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
  }

  play(n, v = 1) {
    if (!this.ctx) return;
    switch (n) {
      case 'land': this.noiseHit(0.12, 260, 0.5 * v, 'lowpass'); this.tone(70, 0.14, 'sine', 0.5 * v, 0, { slide: 0.6 }); break;
      case 'thud': this.noiseHit(0.18, 200, 0.55 * v, 'lowpass'); this.tone(55, 0.2, 'sine', 0.6 * v, 0, { slide: 0.5 }); break;
      case 'scrape': this.noiseHit(0.09, 3200, 0.16 * v, 'bandpass', 0.7, 0, 3); break;
      case 'flip': this.tone(520 * v, 0.12, 'square', 0.1, 0, { slide: 2, lp: 3000 }); this.tone(780 * v, 0.14, 'triangle', 0.12, 0.05, { slide: 1.5 }); break;
      case 'bank': [0, 4, 7, 12].forEach((s, i) => this.tone(MIDI(72 + s), 0.18, 'square', 0.07, i * 0.05, { lp: 4000 })); break;
      case 'perfect': this.noiseHit(0.4, 800, 0.35, 'bandpass', 5, 0, 1.2); this.tone(392, 0.3, 'sawtooth', 0.08, 0, { slide: 2, lp: 2500 }); this.tone(784, 0.35, 'triangle', 0.12, 0.08); break;
      case 'crash':
        this.noiseHit(0.35, 900, 0.8, 'bandpass', 0.3, 0, 0.8); this.noiseHit(0.25, 4000, 0.35, 'highpass');
        this.tone(1300, 0.4, 'square', 0.06, 0.02, { slide: 0.97, lp: 5000 }); this.tone(1950, 0.3, 'square', 0.04, 0.03, { slide: 0.97, lp: 5000 });
        this.tone(60, 0.3, 'sine', 0.7, 0, { slide: 0.5 }); break;
      case 'bonk': this.tone(240 * v, 0.14, 'triangle', 0.25, 0, { slide: 0.6 }); this.noiseHit(0.05, 1500, 0.2); break;
      case 'boom': this.noiseHit(1.1, 500, 1.0, 'lowpass', 0.15); this.tone(48, 0.9, 'sine', 0.9, 0, { slide: 0.4 }); this.noiseHit(0.3, 2500, 0.4, 'bandpass', 0.3); break;
      case 'smash': this.noiseHit(0.25, 1400, 0.6, 'bandpass', 0.4, 0, 1.5); for (let i = 0; i < 5; i++) this.noiseHit(0.05, 2200 + Math.random() * 1500, 0.3, 'bandpass', 0, 0.03 + i * 0.04, 6); break;
      case 'creak': this.tone(170, 0.3, 'sawtooth', 0.07, 0, { slide: 0.7, lp: 900, q: 6 }); break;
      case 'crack': this.noiseHit(0.08, 2400, 0.5, 'bandpass', 0, 0, 3); this.tone(140, 0.12, 'square', 0.1, 0, { slide: 0.5, lp: 800 }); break;
      case 'whistle': this.tone(1800, 0.7, 'sine', 0.06, 0, { slide: 0.45 }); break;
      case 'rumble': this.noiseHit(1.4, 140, 0.8, 'lowpass', 0.6); this.tone(40, 1.2, 'sine', 0.5, 0, { slide: 0.8 }); break;
      case 'chain': for (let i = 0; i < 6; i++) this.noiseHit(0.04, 3000, 0.12, 'bandpass', 0, i * 0.06, 8); break;
      case 'sizzle': this.noiseHit(0.9, 5000, 0.4, 'highpass', 0.5); this.tone(90, 0.4, 'sawtooth', 0.15, 0, { slide: 0.5, lp: 600 }); break;
      case 'checkpoint': [0, 7, 12].forEach((s, i) => this.tone(MIDI(76 + s), 0.25, 'triangle', 0.15, i * 0.07)); break;
      case 'respawn': this.tone(300, 0.2, 'sine', 0.15, 0, { slide: 3 }); this.noiseHit(0.2, 2000, 0.15, 'bandpass', 2); break;
      case 'finish': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(MIDI(67 + s), 0.35, 'square', 0.07, i * 0.07, { lp: 3500 })); this.noiseHit(0.8, 6000, 0.25, 'highpass', 0.5, 0.45); break;
      case 'medal': this.tone(MIDI(84), 0.6, 'triangle', 0.18, 0); this.tone(MIDI(91), 0.7, 'sine', 0.12, 0.08); this.noiseHit(0.1, 3000, 0.2); break;
      case 'coin': this.tone(MIDI(88), 0.08, 'square', 0.07, 0, { lp: 5000 }); this.tone(MIDI(95), 0.16, 'square', 0.07, 0.06, { lp: 5000 }); break;
      case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      case 'deny': this.tone(200, 0.15, 'square', 0.08, 0, { lp: 1200 }); this.tone(150, 0.2, 'square', 0.08, 0.1, { lp: 1200 }); break;
      case 'go': this.tone(MIDI(79), 0.3, 'square', 0.1, 0, { lp: 4000 }); break;
      case 'tick': this.tone(MIDI(72), 0.1, 'square', 0.08, 0, { lp: 3000 }); break;
      case 'wind': this.noiseHit(0.6, 900, 0.2, 'bandpass', 1.8, 0, 0.7); break;
      case 'boost': this.noiseHit(0.5, 600, 0.4, 'bandpass', 6, 0, 1); this.tone(200, 0.5, 'sawtooth', 0.08, 0, { slide: 3, lp: 2000 }); break;
    }
  }

  // engine: call every frame. state {rpm 0..1.3, load 0..1, on, kind}
  engine(st) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (!this.eng) {
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.4; nf.frequency.value = 600;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
      const g1 = c.createGain(); g1.gain.value = 0.18; const g2 = c.createGain(); g2.gain.value = 0.1; const gn = c.createGain(); gn.gain.value = 0.05;
      const out = c.createGain(); out.gain.value = 0;
      o1.connect(g1).connect(lp); o2.connect(g2).connect(lp); n.connect(nf).connect(gn).connect(lp); lp.connect(out).connect(this.engBus);
      o1.start(); o2.start(); n.start();
      this.eng = { o1, o2, nf, lp, out, gn };
    }
    const e = this.eng;
    const pedal = st.kind === 'bmx';
    const f = pedal ? 30 : 46 + st.rpm * 120 + st.load * 10;
    e.o1.frequency.setTargetAtTime(f, t, 0.03); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    e.lp.frequency.setTargetAtTime(500 + st.load * 1500 + st.rpm * 900, t, 0.05);
    e.nf.frequency.setTargetAtTime(pedal ? 300 + st.rpm * 900 : 400 + st.rpm * 1400, t, 0.05);
    e.gn.gain.setTargetAtTime(pedal ? 0.25 * st.rpm : st.kind === 'rocket' && st.load ? 0.35 : 0.05, t, 0.05);
    const vol = !st.on ? 0 : pedal ? 0.12 : (0.09 + st.load * 0.1 + st.rpm * 0.05);
    e.out.gain.setTargetAtTime(vol, t, 0.06);
  }

  // music scheduler: call every frame
  update(playing) {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx;
    const S = SONGS[this.song % SONGS.length];
    const stepDur = 60 / S.bpm / 4;
    if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.15) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const tt = this.next + (s % 2 ? S.swing * stepDur : 0);
      const [root, q] = S.chords[bar];
      const ch = QUAL[q];
      const b = this.musicBus;
      // drums
      if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.kick(tt);
      if (s === 4 || s === 12) this.noiseHit(0.14, 1800, 0.35, 'bandpass', 0.5, tt, 0.9, b, true);
      if (s % 2 === 0) this.noiseHit(0.04, 8000, s % 4 === 2 ? 0.16 : 0.09, 'highpass', 0, tt, 1, b, true);
      // bass
      if ([0, 3, 6, 8, 11, 14].includes(s)) {
        const n = root - 12 + (s === 6 || s === 14 ? ch[2] : s === 11 ? 12 : 0);
        this.tone(MIDI(n), stepDur * 1.6, S.bass, 0.32, tt, { abs: true, bus: b, lp: 900 });
      }
      // lead arpeggio (sparser on even bars)
      if (LEAD_ON[s] && (bar % 2 || s % 4 !== 3)) {
        const n = root + 12 + ch[ARP[(s + bar * 3) % 16]];
        this.tone(MIDI(n), stepDur * 0.9, S.lead, 0.07, tt, { abs: true, bus: b, lp: S.lead === 'sawtooth' ? 2400 : 4000 });
      }
      this.step++;
      this.next += stepDur;
    }
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.25);
  }
  setSong(i) { if (this.song !== i) { this.song = i; this.step = 0; } this.musicOn = true; }
}
