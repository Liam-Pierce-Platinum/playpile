// All sound is synthesised with WebAudio - no files.
// Bed: rain (muffled indoors), a low city rumble, wind. Music: a drone and a dissonant string
// cluster that both swell with how close it is, a heartbeat that races, and stingers.
// You: footsteps (wet street, hard floor, metal fire escape), breathing that follows exertion and
// fear, grunts. It (positional, HRTF): ragged distorted breathing with a throat rattle, clicking,
// heavy wet footsteps or knuckle-skitter, the screech. World: doors, bins, fences, thunder.
const AC = window.AudioContext || window.webkitAudioContext;

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.t = 0; this.fear = 0; this.breathPh = 0; this.nextBeat = 0; this.mbPh = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0.9; this.mus.connect(this.master);
    // reverb
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.4, 2.2);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.35; this.verbIn.connect(this.verb); this.verb.connect(this.master);
    // noise
    this.white = this.noiseBuf('white'); this.pink = this.noiseBuf('pink'); this.brown = this.noiseBuf('brown');
    this.startBeds();
    this.startMonster();
    this.startPlayer();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  noiseBuf(kind) {
    const ctx = this.ctx, n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  src(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; if (loop) s.loopStart = Math.random(); return s; }
  filt(type, f, q = 0.7) { const x = this.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  shaper(k = 20) { const s = this.ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } s.curve = c; return s; }
  chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  panner(x = 0, y = 0, z = 0, ref = 2.5) {
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = 120;
    this.setPos(p, x, y, z); return p;
  }
  setPos(p, x, y, z) { const t = this.ctx.currentTime; if (p.positionX) { p.positionX.setTargetAtTime(x, t, 0.02); p.positionY.setTargetAtTime(y, t, 0.02); p.positionZ.setTargetAtTime(z, t, 0.02); } else p.setPosition(x, y, z); }
  env(g, t, a, peak, d, end = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }

  // ---------------- beds and music ----------------
  startBeds() {
    const ctx = this.ctx;
    // rain
    const r = this.src(this.pink); this.rainLP = this.filt('lowpass', 6000); const rh = this.filt('highpass', 350);
    this.rainG = this.gain(0.32); this.chain(r, rh, this.rainLP, this.rainG, this.amb); r.start();
    const r2 = this.src(this.white); const rb = this.filt('bandpass', 4200, 0.6); this.rainHi = this.gain(0.045); this.chain(r2, rb, this.rainHi, this.amb); r2.start();
    // city rumble + wind
    const c = this.src(this.brown); const cl = this.filt('lowpass', 140); this.cityG = this.gain(0.2); this.chain(c, cl, this.cityG, this.amb); c.start();
    const w = this.src(this.white); this.windF = this.filt('bandpass', 500, 0.8); this.windG = this.gain(0.025); this.chain(w, this.windF, this.windG, this.amb); w.start();
    // fluorescent hum indoors
    const h = ctx.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 120; const hf = this.filt('bandpass', 240, 4); this.humG = this.gain(0); this.chain(h, hf, this.humG, this.amb); h.start();
    // drone
    this.droneF = this.filt('lowpass', 180, 2); this.droneG = this.gain(0.015); this.chain(this.droneF, this.droneG, this.mus);
    for (const f of [41.2, 41.6, 61.7, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12; o.connect(this.droneF); o.start(); }
    // strings: a tight, high, dissonant cluster that tremolos
    this.strG = this.gain(0); const sf = this.filt('lowpass', 3000); this.chain(sf, this.strG, this.mus); this.strG.connect(this.verbIn);
    for (const f of [740, 784, 831, 1108]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const vib = ctx.createOscillator(); vib.frequency.value = 5 + Math.random() * 2; const vg = this.gain(f * 0.006); vib.connect(vg); vg.connect(o.frequency); vib.start();
      const og = this.gain(0.25); o.connect(og); og.connect(sf); o.start();
    }
  }
  // ---------------- the monster (positional) ----------------
  startMonster() {
    const ctx = this.ctx;
    this.mPan = this.panner(0, -100, 0, 2.2);
    this.mBus = this.gain(1.0); this.mBus.connect(this.mPan); this.mPan.connect(this.sfx);
    const send = this.gain(0.6); this.mPan.connect(send); send.connect(this.verbIn);
    // breathing: noise through a moving formant, distorted, rhythmically gated
    const n = this.src(this.pink); this.mBreathF = this.filt('bandpass', 600, 3); const sh = this.shaper(30);
    this.mBreathG = this.gain(0); this.chain(n, this.mBreathF, sh, this.gain(0.5), this.mBreathG, this.mBus); n.start();
    // throat rattle: a low saw, amplitude-chopped
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62; this.mGrowlO = o;
    const lp = this.filt('lowpass', 420, 4); const chop = this.gain(0); const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 31; this.mRattle = lfo;
    const lg = this.gain(0.5); lfo.connect(lg); lg.connect(chop.gain); const dc = ctx.createConstantSource ? ctx.createConstantSource() : null; if (dc) { dc.offset.value = 0.5; dc.connect(chop.gain); dc.start(); }
    this.mGrowlG = this.gain(0); this.chain(o, lp, chop, this.shaper(8), this.mGrowlG, this.mBus); o.start(); lfo.start();
  }
  startPlayer() {
    // breathing (yours): noise through a formant, gated per breath
    const n = this.src(this.white); this.pBreathF = this.filt('bandpass', 1200, 1.2); this.pBreathG = this.gain(0);
    this.chain(n, this.filt('highpass', 300), this.pBreathF, this.pBreathG, this.sfx); n.start();
    // a voiced whimper under the breath when it is close
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 150; this.pVoiceO = o;
    this.pVoiceG = this.gain(0); this.chain(o, this.filt('bandpass', 750, 6), this.pVoiceG, this.sfx); o.start();
  }

  // s: {fear 0..1, exert, indoor, mPos, mMode, mSpeed, mDist, alive, cam}
  update(dt, s) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.t += dt;
    const L = ctx.listener, cam = s.cam;
    if (cam) {
      const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
      if (L.positionX) { L.positionX.setTargetAtTime(cam.position.x, now, 0.02); L.positionY.setTargetAtTime(cam.position.y, now, 0.02); L.positionZ.setTargetAtTime(cam.position.z, now, 0.02); L.forwardX.setTargetAtTime(f.x, now, 0.02); L.forwardY.setTargetAtTime(f.y, now, 0.02); L.forwardZ.setTargetAtTime(f.z, now, 0.02); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    }
    const fear = this.fear = s.fear;
    // beds
    this.rainLP.frequency.setTargetAtTime(s.indoor ? 520 : 6000, now, 0.25);
    this.rainG.gain.setTargetAtTime(s.indoor ? 0.18 : 0.32, now, 0.3);
    this.rainHi.gain.setTargetAtTime(s.indoor ? 0.0 : 0.045, now, 0.3);
    this.humG.gain.setTargetAtTime(s.indoor ? 0.012 : 0, now, 0.3);
    this.windF.frequency.setTargetAtTime(400 + 250 * Math.sin(this.t * 0.23) + 120 * Math.sin(this.t * 0.61), now, 0.5);
    // music
    this.droneF.frequency.setTargetAtTime(160 + fear * 1600, now, 0.2);
    this.droneG.gain.setTargetAtTime((0.018 + fear * 0.09) * (s.alive ? 1 : 0.4), now, 0.2);
    this.strG.gain.setTargetAtTime(Math.pow(Math.max(0, fear - 0.25), 2) * 0.05, now, 0.25);
    // heartbeat
    if (s.alive) {
      const bpm = 72 + fear * 105 + s.exert * 25;
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      while (this.nextBeat < now + 0.12) { this.heart(this.nextBeat, 0.12 + fear * 0.5 + s.exert * 0.08); this.nextBeat += 60 / bpm; }
    }
    // chase music: a driving pulse that speeds up and gets louder the closer it is
    if (s.alive && fear > 0.18) {
      const bpm = 96 + fear * 120 + (s.close || 0) * 30;
      if (!this.nextPulse || this.nextPulse < now) { this.nextPulse = now + 0.05; this.pulseN = 0; }
      while (this.nextPulse < now + 0.12) {
        const t0 = this.nextPulse, n = this.pulseN++, k = Math.min(1, (fear - 0.18) * 1.6);
        if (n % 2 === 0) this.tone(this.mus, t0, 62, { peak: 0.16 * k, d: 0.14, f2: 38 });
        this.noiseHit(this.mus, t0, { type: 'highpass', f: 5200, peak: (n % 2 ? 0.05 : 0.025) * k, d: 0.04 });
        if (fear > 0.6 && n % 4 === 3) this.tone(this.mus, t0, 220 + fear * 80, { type: 'sawtooth', peak: 0.02 * k, d: 0.1, f2: 180 });
        this.nextPulse += 30 / bpm;
      }
    }
    // your breathing
    const rate = 0.32 + s.exert * 0.9 + fear * 0.5;
    const prev = this.breathPh; this.breathPh += dt * rate;
    const vol = (0.012 + s.exert * 0.11 + fear * 0.05) * (s.alive ? 1 : 0);
    if (Math.floor(prev * 2) !== Math.floor(this.breathPh * 2)) {
      const exh = Math.floor(this.breathPh * 2) % 2 === 1;
      const dur = 0.5 / rate;
      this.pBreathF.frequency.setTargetAtTime(exh ? 950 + Math.random() * 200 : 1700 + Math.random() * 300, now, 0.02);
      this.pBreathG.gain.cancelScheduledValues(now);
      this.pBreathG.gain.setTargetAtTime(vol * (exh ? 1 : 0.7), now, 0.05);
      this.pBreathG.gain.setTargetAtTime(0.0001, now + dur * 0.7, dur * 0.18);
      if (exh && fear > 0.55) { this.pVoiceO.frequency.setValueAtTime(140 + Math.random() * 40, now); this.pVoiceG.gain.setTargetAtTime((fear - 0.55) * 0.05, now, 0.03); this.pVoiceG.gain.setTargetAtTime(0, now + dur * 0.5, 0.05); }
    }
    // the monster
    if (s.mPos) {
      this.setPos(this.mPan, s.mPos.x, s.mPos.y + 1.8, s.mPos.z);
      const mode = s.mMode, chase = mode === 'chase' || mode === 'vault' || mode === 'smash';
      const mRate = chase ? 2.1 + Math.random() * 0.4 : mode === 'scream' ? 0 : 0.55;
      const mprev = this.mbPh; this.mbPh += dt * mRate;
      if (Math.floor(mprev * 2) !== Math.floor(this.mbPh * 2)) {
        const exh = Math.floor(this.mbPh * 2) % 2;
        const loud = (chase ? 0.55 : 0.32) * (s.mVol ?? 1);
        this.mBreathF.frequency.setTargetAtTime(exh ? 380 + Math.random() * 200 : 900 + Math.random() * 500, now, 0.03);
        this.mBreathG.gain.cancelScheduledValues(now);
        this.mBreathG.gain.setTargetAtTime(loud * (exh ? 1 : 0.6), now, 0.04);
        this.mBreathG.gain.setTargetAtTime(0.0001, now + 0.45 / Math.max(0.5, mRate), 0.06);
      }
      this.mGrowlO.frequency.setTargetAtTime(chase ? 70 + Math.random() * 20 : 52, now, 0.1);
      this.mRattle.frequency.setTargetAtTime(chase ? 38 : 24, now, 0.2);
      this.mGrowlG.gain.setTargetAtTime((chase ? 0.18 : 0.07) * (s.mVol ?? 1), now, 0.15);
      if (mode === 'search' || mode === 'hunt' || mode === 'intro') { this.clickT = (this.clickT ?? 1) - dt; if (this.clickT <= 0) { this.clicks(3 + Math.floor(Math.random() * 7)); this.clickT = 0.8 + Math.random() * 2.2; } }
      else if (chase && Math.random() < dt * 0.4) this.clicks(4);
    }
  }

  // ---------------- one-shots ----------------
  heart(t, v) {
    const ctx = this.ctx;
    for (const [dt, k] of [[0, 1], [0.14, 0.7]]) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(34, t + dt + 0.12);
      const g = this.gain(0); this.env(g, t + dt, 0.008, v * k, 0.16);
      this.chain(o, this.filt('lowpass', 160), g, this.mus); o.start(t + dt); o.stop(t + dt + 0.25);
    }
  }
  noiseHit(dest, t, { buf = this.white, type = 'bandpass', f = 1000, q = 1, a = 0.002, peak = 0.3, d = 0.1, rate = 1 } = {}) {
    const s = this.src(buf, false); s.playbackRate.value = rate; const fl = this.filt(type, f, q); const g = this.gain(0);
    this.env(g, t, a, peak, d); this.chain(s, fl, g, dest); s.start(t, Math.random() * 2); s.stop(t + a + d + 0.05);
  }
  tone(dest, t, f, { type = 'sine', a = 0.002, peak = 0.2, d = 0.3, f2 = null } = {}) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = this.gain(0); this.env(g, t, a, peak, d); this.chain(o, g, dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  at(pos, ref = 2.5) { const p = this.panner(pos.x, pos.y, pos.z, ref); p.connect(this.sfx); const s = this.gain(0.5); p.connect(s); s.connect(this.verbIn); setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 4000); return p; }

  step(surface, speed) {
    if (!this.ctx) return; const t = this.ctx.currentTime, v = 0.08 + Math.min(1, speed / 7) * 0.14;
    if (surface === 'metal') { for (const f of [310, 720, 1190]) this.tone(this.sfx, t, f * (0.97 + Math.random() * 0.06), { peak: v * 0.35, d: 0.18 }); this.noiseHit(this.sfx, t, { f: 2500, q: 2, peak: v * 0.5, d: 0.05 }); return; }
    if (surface === 'indoor') { this.noiseHit(this.sfx, t, { f: 600, q: 1.4, peak: v * 1.2, d: 0.07 }); this.tone(this.sfx, t, 110, { peak: v * 0.6, d: 0.06, f2: 60 }); return; }
    // wet street: a slap and a splash
    this.noiseHit(this.sfx, t, { f: 900 + Math.random() * 400, q: 0.9, peak: v * 1.1, d: 0.06 });
    this.noiseHit(this.sfx, t + 0.012, { type: 'highpass', f: 3000, peak: v * 0.7, d: 0.12 });
    this.tone(this.sfx, t, 90, { peak: v * 0.5, d: 0.05, f2: 50 });
  }
  land(h) { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(this.sfx, t, 80, { peak: 0.3 + Math.min(0.5, h * 0.1), d: 0.18, f2: 40 }); this.noiseHit(this.sfx, t, { f: 700, peak: 0.25, d: 0.15 }); }
  grunt(k = 1) { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseHit(this.sfx, t, { f: 650 + Math.random() * 200, q: 4, a: 0.02, peak: 0.14 * k, d: 0.18 }); const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.2); const g = this.gain(0); this.env(g, t, 0.02, 0.05 * k, 0.2); this.chain(o, this.filt('bandpass', 700, 5), g, this.sfx); o.start(t); o.stop(t + 0.3); }
  rattle(kind, pos) {
    if (!this.ctx) return; const t = this.ctx.currentTime, d = this.at(pos, 3);
    if (kind === 'chain') { for (let i = 0; i < 12; i++) { const tt = t + i * 0.03 + Math.random() * 0.02; this.noiseHit(d, tt, { f: 3000 + Math.random() * 3000, q: 6, peak: 0.25 * (1 - i / 14), d: 0.04 }); } this.tone(d, t, 180, { peak: 0.12, d: 0.4, f2: 120 }); }
    else if (kind === 'car') { this.tone(d, t, 140, { peak: 0.3, d: 0.25, f2: 90 }); this.noiseHit(d, t, { f: 400, peak: 0.25, d: 0.2 }); for (const f of [520, 1310]) this.tone(d, t, f, { peak: 0.06, d: 0.5 }); }
    else if (kind === 'dumpster') { for (const f of [95, 233, 410, 690]) this.tone(d, t, f, { peak: 0.15, d: 0.9 }); this.noiseHit(d, t, { f: 300, peak: 0.3, d: 0.25 }); }
    else { this.noiseHit(d, t, { f: 300, q: 1, peak: 0.35, d: 0.12 }); this.tone(d, t, 120, { peak: 0.2, d: 0.1, f2: 70 }); this.noiseHit(d, t + 0.05, { f: 1500, q: 3, peak: 0.1, d: 0.25 }); }
  }
  prop(kind, pos, strength = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime, d = this.at(pos, 3), v = Math.min(1, 0.3 + strength * 0.2);
    if (kind === 'metal' || kind === 'metalBig') { const f0 = kind === 'metalBig' ? 150 : 230 + Math.random() * 60; for (const k of [1, 2.76, 5.4, 8.93]) this.tone(d, t, f0 * k, { peak: 0.22 * v / Math.sqrt(k), d: (kind === 'metalBig' ? 1.2 : 0.7) / Math.sqrt(k) }); this.noiseHit(d, t, { f: 2000, q: 1, peak: 0.35 * v, d: 0.06 }); }
    else if (kind === 'plastic') { this.noiseHit(d, t, { f: 500, q: 2, peak: 0.45 * v, d: 0.12 }); this.tone(d, t, 160, { peak: 0.2 * v, d: 0.12, f2: 90 }); }
    else if (kind === 'card') this.noiseHit(d, t, { f: 400, q: 0.8, peak: 0.3 * v, d: 0.1 });
    else { this.noiseHit(d, t, { f: 800, q: 3, peak: 0.4 * v, d: 0.08 }); this.tone(d, t, 210, { peak: 0.2 * v, d: 0.15, f2: 140 }); }
  }
  door(kind, pos) {
    if (!this.ctx) return; const t = this.ctx.currentTime, d = this.at(pos, 3);
    if (kind === 'open') { this.noiseHit(d, t, { f: 500, q: 2, peak: 0.25, d: 0.1 }); this.tone(d, t, 380, { type: 'triangle', peak: 0.03, d: 0.4, f2: 300 }); }
    else if (kind === 'slam') { this.tone(d, t, 75, { peak: 0.7, d: 0.35, f2: 45 }); this.noiseHit(d, t, { f: 900, q: 0.8, peak: 0.6, d: 0.12 }); for (const f of [210, 330]) this.tone(d, t, f, { peak: 0.1, d: 0.3 }); }
    else if (kind === 'pound') { this.tone(d, t, 60, { peak: 0.8, d: 0.3, f2: 38 }); this.noiseHit(d, t, { f: 600, q: 0.8, peak: 0.6, d: 0.14 }); this.noiseHit(d, t + 0.01, { buf: this.brown, type: 'lowpass', f: 300, peak: 0.6, d: 0.3 }); }
    else if (kind === 'break') { for (let i = 0; i < 10; i++) this.noiseHit(d, t + i * 0.025 + Math.random() * 0.02, { f: 400 + Math.random() * 2500, q: 1.5, peak: 0.5, d: 0.08 }); this.tone(d, t, 55, { peak: 0.9, d: 0.5, f2: 30 }); }
  }
  // the thing: positional sounds go through its own panner
  mStep(pos, crawl, speed, isArm) {
    if (!this.ctx) return; const t = this.ctx.currentTime, d = this.at(pos, 2.5), v = 0.25 + Math.min(1, speed / 7) * 0.45;
    if (crawl && isArm) { this.noiseHit(d, t, { f: 2600, q: 3, peak: v * 0.5, d: 0.03 }); this.noiseHit(d, t + 0.015, { f: 1800, q: 4, peak: v * 0.35, d: 0.03 }); return; }
    this.tone(d, t, 64, { peak: v * (crawl ? 0.7 : 1.0), d: 0.14, f2: 36 });
    this.noiseHit(d, t, { f: 1100, q: 0.9, peak: v * 0.55, d: 0.07 });
    this.noiseHit(d, t + 0.01, { type: 'highpass', f: 2500, peak: v * 0.3, d: 0.1 });
  }
  clicks(n) {
    if (!this.ctx) return; let t = this.ctx.currentTime;
    for (let i = 0; i < n; i++) { t += 0.035 + Math.random() * 0.05; this.noiseHit(this.mBus, t, { f: 2200 + Math.random() * 2400, q: 9, a: 0.0008, peak: 0.6, d: 0.012 }); this.tone(this.mBus, t, 900 + Math.random() * 400, { peak: 0.05, d: 0.02 }); }
  }
  screech(loud = 1, dur = 1.3) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const out = this.gain(0); const bp = this.filt('bandpass', 1500, 0.7); const sh = this.shaper(60);
    this.chain(bp, sh, out); out.connect(this.mBus);
    const direct = this.gain(0.35 * loud); out.connect(direct); direct.connect(this.sfx);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.6 * loud, t + 0.05); out.gain.setValueAtTime(0.6 * loud, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const f of [380, 507, 760, 1013]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      for (let k = 0; k < 12; k++) o.frequency.setValueAtTime(f * (0.85 + Math.random() * 0.5) * (1 + k / 30), t + k * dur / 12);
      const fm = ctx.createOscillator(); fm.frequency.value = 37 + Math.random() * 20; const fg = this.gain(f * 0.25); fm.connect(fg); fg.connect(o.frequency); fm.start(t); fm.stop(t + dur);
      o.connect(bp); o.start(t); o.stop(t + dur + 0.05);
    }
    this.noiseHit(out, t, { f: 3000, q: 0.6, a: 0.02, peak: 0.6, d: dur });
  }
  stinger(k = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const lp = this.filt('lowpass', 5000, 1); lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
    const g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    this.chain(lp, g, this.mus); g.connect(this.verbIn);
    for (const f of [55, 58.3, 82.4, 116.5, 174.6, 233.1, 349.2, 466.2]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01); o.connect(lp); o.start(t); o.stop(t + 2.7); }
    this.tone(this.mus, t, 48, { peak: 0.6 * k, d: 1.4, f2: 28 });
    this.noiseHit(this.mus, t, { buf: this.brown, type: 'lowpass', f: 200, peak: 0.6 * k, d: 0.8 });
  }
  thunder(delay = 0.6, k = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    this.noiseHit(this.amb, t, { buf: this.brown, type: 'lowpass', f: 140, a: 0.08, peak: 0.9 * k, d: 3.5 });
    for (let i = 0; i < 6; i++) this.noiseHit(this.amb, t + Math.random() * 0.8, { buf: this.brown, type: 'lowpass', f: 400, a: 0.01, peak: 0.4 * k, d: 0.3 });
  }
  jumpscare() {
    if (!this.ctx) return; this.screech(1.6, 1.8); this.stinger(1.4);
    const t = this.ctx.currentTime; this.tone(this.sfx, t, 40, { peak: 1, d: 1.2, f2: 25 });
    this.noiseHit(this.sfx, t, { f: 1200, q: 0.4, peak: 0.6, d: 0.8 });
  }
  ui() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(this.sfx, t, 520, { peak: 0.05, d: 0.08 }); }
  whoosh() { if (!this.ctx) return; const t = this.ctx.currentTime; const s = this.src(this.white, false); const f = this.filt('bandpass', 400, 1); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.25); const g = this.gain(0); this.env(g, t, 0.06, 0.25, 0.25); this.chain(s, f, g, this.sfx); s.start(t); s.stop(t + 0.4); }
}
