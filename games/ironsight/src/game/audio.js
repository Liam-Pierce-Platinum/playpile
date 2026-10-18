// Procedural positional audio (WebAudio). Gunshots are layered: supersonic crack, muzzle blast
// body, low thump, mechanical action; then an environment tail through a convolver whose impulse
// response is generated per map (urban slap-back echoes, desert open air, warehouse reverb,
// snowy forest damping, office interior). HRTF panning and distance filtering for every source.
import * as THREE from 'three';

export class Audio {
  constructor() {
    this.ctx = null; this.ready = false; this.volume = 0.8;
    this.listener = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1) };
    this.slide = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.15;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.dry = c.createGain(); this.dry.connect(this.master);
    this.verb = c.createConvolver(); this.verbGain = c.createGain(); this.verbGain.gain.value = 0.5;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // noise buffers
    const mk = (sec, fn) => { const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = fn(i / c.sampleRate, i); return b; };
    this.white = mk(2, () => Math.random() * 2 - 1);
    let b0 = 0; this.brown = mk(2, () => { b0 = (b0 + 0.02 * (Math.random() * 2 - 1)) / 1.02; return b0 * 3.5; });
    this.setEnvironment('urban');
    this.ready = true;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  // impulse responses: early reflections + diffuse tail
  setEnvironment(kind) {
    if (!this.ctx) { this.envKind = kind; return; }
    this.envKind = kind;
    const c = this.ctx, sr = c.sampleRate;
    const P = {
      urban: { len: 2.6, decay: 2.2, early: [[0.09, 0.5], [0.17, 0.4], [0.31, 0.35], [0.52, 0.25], [0.8, 0.18]], damp: 0.55, wet: 0.55 },
      desert: { len: 2.2, decay: 3.2, early: [[0.35, 0.18], [0.9, 0.12]], damp: 0.7, wet: 0.25 },
      warehouse: { len: 3.0, decay: 1.6, early: [[0.03, 0.6], [0.06, 0.5], [0.11, 0.45], [0.18, 0.35]], damp: 0.35, wet: 0.7 },
      forest: { len: 1.8, decay: 3.0, early: [[0.12, 0.2], [0.25, 0.15]], damp: 0.85, wet: 0.3 },
      office: { len: 1.2, decay: 3.4, early: [[0.012, 0.6], [0.025, 0.5], [0.04, 0.4]], damp: 0.5, wet: 0.45 },
      range: { len: 2.0, decay: 2.8, early: [[0.2, 0.2], [0.45, 0.12]], damp: 0.7, wet: 0.3 },
    }[kind] || { len: 2, decay: 2.5, early: [], damp: 0.6, wet: 0.4 };
    const n = Math.floor(sr * P.len), ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let v = (Math.random() * 2 - 1) * Math.exp(-t * P.decay) * 0.35;
        lp += (v - lp) * (1 - P.damp * Math.min(1, t * 2 + 0.3)); d[i] = lp;
      }
      for (const [t, a] of P.early) {
        const i0 = Math.floor((t + (ch ? 0.007 : 0) + Math.random() * 0.004) * sr);
        for (let k = 0; k < sr * 0.03 && i0 + k < n; k++) d[i0 + k] += (Math.random() * 2 - 1) * a * Math.exp(-k / (sr * 0.006));
      }
    }
    this.verb.buffer = ir;
    this.verbGain.gain.value = P.wet;
  }
  setListener(pos, fwd, up) {
    this.listener.pos.copy(pos); this.listener.fwd.copy(fwd);
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) { L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t); L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t); L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t); }
    else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }
  // a source chain: [nodes] -> (panner) -> dry + verb send
  _out(pos, { verb = 0.5, gain = 1, ref = 2, roll = 1.2 } = {}) {
    const c = this.ctx, g = c.createGain(); g.gain.value = gain;
    let head = g;
    if (pos) {
      const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 2000;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      // air absorption: distant shots lose their highs
      const d = pos.distanceTo(this.listener.pos);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 18000 / (1 + d * 0.035));
      g.connect(lp); lp.connect(p); head = p;
    }
    head.connect(this.dry);
    const send = c.createGain(); send.gain.value = verb; g.connect(send); send.connect(this.verb);
    return g;
  }
  _noise(dest, t, dur, { type = 'bandpass', f = 1000, q = 1, a = 0.002, gain = 1, buf = null, f2 = null } = {}) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = buf || this.white; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _tone(dest, t, dur, f0, f1, gain, type = 'sine') {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  // cls: pistol/smg/ar/sniper/shotgun ; own: player's own gun (close, no panner)
  gunshot(pos, cls, { suppressed = false, own = false, loud = 1 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + 0.001;
    const d = own ? 0 : pos.distanceTo(this.listener.pos);
    const delay = own ? 0 : d / 343;      // sound travels: distant shots arrive late
    const T = t + delay;
    const P = { pistol: [1.0, 900, 0.16, 110], smg: [0.85, 1100, 0.13, 120], ar: [1.15, 1300, 0.22, 85], sniper: [1.5, 1000, 0.42, 60], shotgun: [1.45, 700, 0.36, 55], dmr: [1.35, 1150, 0.3, 70] }[cls] || [1, 1000, 0.2, 90];
    const out = this._out(own ? null : pos, { verb: suppressed ? 0.25 : 0.7, gain: (own ? 0.9 : 1.2) * Math.min(1.25, loud) * (suppressed ? 1.1 : 1), ref: own ? 1 : 4, roll: 0.9 });
    const [g, f, body, thump] = P;
    if (!suppressed) {
      this._noise(out, T, 0.025, { type: 'highpass', f: 2500, a: 0.0008, gain: 0.9 * g });                 // crack
      this._noise(out, T, body, { type: 'lowpass', f: f * 2.2, f2: 300, a: 0.002, gain: 1.0 * g, buf: this.white });   // blast
      this._noise(out, T, body * 1.5, { type: 'lowpass', f: 400, a: 0.004, gain: 0.8 * g, buf: this.brown });          // body
      this._tone(out, T, body * 0.9, thump * 1.6, thump * 0.5, 0.9 * g);                                 // thump
      // muzzle brakes / compensators throw the blast sideways and back at the shooter: a harsher, brighter
      // concussive slap on top; flash hiders leave the report alone
      if (loud > 1.05) { const k = Math.min(1, (loud - 1) * 2.5); this._noise(out, T + 0.002, 0.06, { type: 'bandpass', f: 1800, q: 0.7, a: 0.0005, gain: 0.9 * k * g }); this._noise(out, T, 0.018, { type: 'highpass', f: 5000, a: 0.0003, gain: 0.8 * k }); }
    } else {
      this._noise(out, T, 0.09, { type: 'bandpass', f: 900, q: 0.8, a: 0.002, gain: 0.9 });
      this._noise(out, T, 0.05, { type: 'highpass', f: 3500, a: 0.001, gain: 0.25 });
      if (cls !== 'pistol' && cls !== 'smg') this._noise(out, T, 0.02, { type: 'highpass', f: 4000, a: 0.0006, gain: 0.5 });   // supersonic crack still there
    }
    if (own) {
      // mechanics: bolt carrier / slide
      this._noise(this._out(null, { gain: 0.25, verb: 0.05 }), t + 0.03, 0.04, { type: 'bandpass', f: 3200, q: 3, a: 0.001, gain: 1 });
    }
  }
  // bullet passing close by: supersonic snap + whizz
  flyby(pos, intensity = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(pos, { verb: 0.2, gain: 0.7 * intensity, ref: 1 });
    this._noise(out, t, 0.012, { type: 'highpass', f: 3000, a: 0.0005, gain: 1 });
    this._noise(out, t, 0.12, { type: 'bandpass', f: 2200, f2: 700, q: 2, a: 0.01, gain: 0.5 });
  }
  impact(pos, snd, power = 1) {
    if (!this.ready) return;
    const d = pos.distanceTo(this.listener.pos); if (d > 90) return;
    const t = this.ctx.currentTime + d / 343, out = this._out(pos, { verb: 0.3, gain: 0.55 * power, ref: 1.5 });
    if (snd === 'metal') { this._tone(out, t, 0.25, 2400 + Math.random() * 1500, 1800, 0.25, 'triangle'); this._noise(out, t, 0.06, { type: 'highpass', f: 3000, a: 0.001, gain: 0.6 }); }
    else if (snd === 'wood') { this._noise(out, t, 0.07, { type: 'bandpass', f: 700, q: 1.5, a: 0.001, gain: 0.9 }); }
    else if (snd === 'glass') { for (let i = 0; i < 4; i++) this._tone(out, t + i * 0.02, 0.18, 3000 + Math.random() * 4000, 2500, 0.08, 'sine'); this._noise(out, t, 0.12, { type: 'highpass', f: 4000, a: 0.001, gain: 0.5 }); }
    else if (snd === 'flesh') { this._noise(out, t, 0.06, { type: 'lowpass', f: 600, a: 0.002, gain: 1, buf: this.brown }); }
    else if (snd === 'soft') { this._noise(out, t, 0.06, { type: 'lowpass', f: 1200, a: 0.002, gain: 0.6 }); }
    else { this._noise(out, t, 0.05, { type: 'bandpass', f: 1800, q: 1, a: 0.001, gain: 0.8 }); this._noise(out, t, 0.12, { type: 'lowpass', f: 500, a: 0.004, gain: 0.3, buf: this.brown }); }
  }
  shell(pos, surf) {
    if (!this.ready) return;
    const d = pos.distanceTo(this.listener.pos); if (d > 25) return;
    const t = this.ctx.currentTime, out = this._out(pos, { verb: 0.15, gain: 0.18, ref: 1 });
    if (surf === 'snow' || surf === 'sand' || surf === 'dirt') { this._noise(out, t, 0.03, { type: 'lowpass', f: 900, gain: 0.4 }); return; }
    for (let i = 0; i < 3; i++) this._tone(out, t + i * (0.06 + Math.random() * 0.05), 0.07, 4200 + Math.random() * 2500, 3800, 0.5 / (i + 1), 'sine');
  }
  footstep(surf, loud = 1, pos = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(pos, { verb: 0.1, gain: 0.22 * loud, ref: 2 });
    const F = { snow: [600, 0.12, 'lowpass'], sand: [900, 0.09, 'lowpass'], dirt: [700, 0.08, 'lowpass'], metal: [2200, 0.07, 'bandpass'], sheet: [1800, 0.08, 'bandpass'], wood: [500, 0.07, 'bandpass'], glass: [3000, 0.05, 'highpass'] }[surf] || [1100, 0.06, 'bandpass'];
    this._noise(out, t, F[1], { type: F[2], f: F[0], q: 0.9, a: 0.004, gain: 1 });
    this._noise(out, t, 0.05, { type: 'lowpass', f: 180, a: 0.003, gain: 0.8, buf: this.brown });
    if (surf === 'snow') this._noise(out, t + 0.03, 0.1, { type: 'bandpass', f: 2500, q: 2, a: 0.01, gain: 0.3 });
  }
  land(k, surf) { this.footstep(surf, 1 + k * 1.5); this.footstep(surf, 0.6 + k); }
  jump() { this.footstep('cloth', 0.4); }
  slideLoop(k) {
    if (!this.ready) return;
    if (k > 0.05 && !this.slide) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.white; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.dry); s.start();
      this.slide = { s, g };
    }
    if (this.slide) { this.slide.g.gain.value = Math.min(0.12, k * 0.12); if (k <= 0.05) { this.slide.s.stop(); this.slide = null; } }
  }
  click(kind = 'mag') {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(null, { gain: 0.3, verb: 0.05 });
    const f = { mag: 1500, magin: 1100, bolt: 2400, empty: 3000, pump: 900, shell: 1300, switch: 2600, laser: 4000, equip: 700 }[kind] || 1500;
    this._noise(out, t, 0.035, { type: 'bandpass', f, q: 4, a: 0.001, gain: 1 });
    if (kind === 'bolt' || kind === 'pump') this._noise(out, t + 0.12, 0.05, { type: 'bandpass', f: f * 1.3, q: 3, a: 0.001, gain: 1 });
  }
  hitmarker(head) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(null, { gain: 0.16, verb: 0 });
    if (head) { this._tone(out, t, 0.12, 2900, 2500, 0.6, 'triangle'); this._tone(out, t + 0.01, 0.15, 4400, 4000, 0.3, 'sine'); }
    else this._noise(out, t, 0.03, { type: 'bandpass', f: 2600, q: 5, a: 0.001, gain: 1 });
  }
  hurt() { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(null, { gain: 0.35, verb: 0.05 }); this._noise(out, t, 0.12, { type: 'lowpass', f: 300, a: 0.003, gain: 1, buf: this.brown }); }
  // frag grenade: supersonic crack, a long low blast (chained noise segments; the buffers are 2 s with a
  // random start), a sub thump and debris patter, arriving late with distance like gunshots
  explosion(pos) {
    if (!this.ready) return;
    const c = this.ctx, d = pos.distanceTo(this.listener.pos), T = c.currentTime + 0.001 + d / 343;
    const out = this._out(pos, { verb: 0.95, gain: 2.4, ref: 8, roll: 0.7 });
    this._noise(out, T, 0.04, { type: 'highpass', f: 1800, a: 0.0006, gain: 1 });
    for (let i = 0; i < 3; i++) this._noise(out, T + i * 0.12, 0.45, { type: 'lowpass', f: 1100 - i * 300, f2: 120, a: 0.002 + i * 0.05, gain: 1.3 - i * 0.35, buf: this.brown });
    this._noise(out, T, 0.4, { type: 'lowpass', f: 3000, f2: 300, a: 0.002, gain: 0.9 });
    this._tone(out, T, 0.9, 75, 26, 1.3);
    for (let i = 0; i < 6; i++) this._noise(out, T + 0.35 + Math.random() * 0.6, 0.05, { type: 'bandpass', f: 1500 + Math.random() * 2000, q: 3, a: 0.001, gain: 0.25 });
  }
  pickup() { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(null, { gain: 0.18, verb: 0.05 }); this._noise(out, t, 0.05, { type: 'bandpass', f: 1800, q: 4, a: 0.001, gain: 1 }); this._noise(out, t + 0.08, 0.06, { type: 'bandpass', f: 1200, q: 4, a: 0.001, gain: 0.8 }); }
  // flashbang: a high whine that fades slowly while the world sound is ducked (k = 0..1 strength)
  ring(k) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, dur = 1.5 + 5 * k;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 3300 + Math.random() * 400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * k + 0.01, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.comp || c.destination); o.start(t); o.stop(t + dur + 0.1);
    const m = this.master.gain; m.cancelScheduledValues(t); m.setValueAtTime(this.volume * (1 - 0.85 * k), t + 0.02); m.linearRampToValueAtTime(this.volume, t + dur * 0.9);
  }
  radio() { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(null, { gain: 0.05, verb: 0 }); this._noise(out, t, 0.06, { type: 'bandpass', f: 2000, q: 2, gain: 1 }); this._tone(out, t + 0.06, 0.05, 1200, 1200, 0.4, 'square'); }
}
