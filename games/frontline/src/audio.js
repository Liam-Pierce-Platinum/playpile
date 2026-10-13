// All sound is synthesised with WebAudio: per-weapon gunshots (with distance muffling,
// stereo panning and a tail), reloads, footsteps by surface, hits, explosions, UI.
const PROFILES = {
  pistol: { crack: 0.9, body: 160, bodyDec: 0.08, noiseDec: 0.09, lp: 5200, tail: 0.25, gain: 0.7 },
  smg: { crack: 0.7, body: 190, bodyDec: 0.05, noiseDec: 0.06, lp: 4800, tail: 0.2, gain: 0.55 },
  ar: { crack: 0.9, body: 120, bodyDec: 0.09, noiseDec: 0.1, lp: 4200, tail: 0.4, gain: 0.75 },
  burst: { crack: 0.95, body: 130, bodyDec: 0.08, noiseDec: 0.09, lp: 4600, tail: 0.35, gain: 0.72 },
  shotgun: { crack: 0.8, body: 70, bodyDec: 0.18, noiseDec: 0.22, lp: 2600, tail: 0.6, gain: 1.0 },
  lmg: { crack: 0.85, body: 95, bodyDec: 0.1, noiseDec: 0.11, lp: 3600, tail: 0.45, gain: 0.8 },
  dmr: { crack: 1.0, body: 90, bodyDec: 0.14, noiseDec: 0.15, lp: 5200, tail: 0.7, gain: 0.95 },
  sniper: { crack: 1.2, body: 60, bodyDec: 0.22, noiseDec: 0.2, lp: 6000, tail: 1.3, gain: 1.15 },
  rocket: { crack: 0.3, body: 50, bodyDec: 0.3, noiseDec: 0.5, lp: 1400, tail: 0.6, gain: 0.9 },
  knife: { crack: 0.2, body: 600, bodyDec: 0.04, noiseDec: 0.12, lp: 7000, tail: 0, gain: 0.35 },
};

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.vol = 0.8;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.recent = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    // noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // simple echo send for distant/outdoor tails
    this.echo = c.createDelay(1.0); this.echo.delayTime.value = 0.21;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 1600;
    this.echo.connect(ef); ef.connect(fb); fb.connect(this.echo); ef.connect(this.master);
    this.echoIn = c.createGain(); this.echoIn.gain.value = 0.25; this.echoIn.connect(this.echo);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }
  // spatial chain: returns input node routed through lowpass + pan + gain based on distance
  spatial(x, y, z, baseGain = 1, range = 120) {
    const c = this.ctx;
    const L = this.listener;
    const dx = x - L.x, dz = z - L.z, dy = y - L.y;
    const d = Math.hypot(dx, dy, dz);
    const att = 1 / (1 + d * d / (range * range) * 6 + d * 0.02);
    const g = c.createGain(); g.gain.value = baseGain * att;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(500, 16000 / (1 + d * 0.06));
    let out = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      // listener right vector: (cos yaw, -sin yaw)
      const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
      const pan = d > 0.5 ? (dx * rx + dz * rz) / d : 0;
      p.pan.value = Math.max(-0.9, Math.min(0.9, pan * 0.85));
      lp.connect(p); p.connect(g);
    } else lp.connect(g);
    out.connect(this.master);
    return { input: lp, gain: g, dist: d };
  }
  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }
  env(param, t, peak, att, dec) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + att);
    param.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  gun(kind, x, y, z, opts = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    // limit simultaneous distant shots
    const P = PROFILES[kind] || PROFILES.ar;
    const own = !!opts.own;
    const sp = own ? { input: c.createGain(), dist: 0 } : this.spatial(x, y, z, 1, kind === 'sniper' ? 200 : 110);
    if (own) sp.input.connect(this.master);
    if (sp.dist > 150) return;
    const sup = opts.suppressed;
    const g = (own ? 0.55 : 0.85) * P.gain * (sup ? 0.3 : 1);
    // crack: bandpassed noise
    const n = this.noiseSrc(t, P.noiseDec * 2);
    const bp = c.createBiquadFilter(); bp.type = sup ? 'lowpass' : 'highpass'; bp.frequency.value = sup ? 1800 : 900;
    const ng = c.createGain(); this.env(ng.gain, t, g * P.crack, 0.002, sup ? 0.05 : P.noiseDec);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sup ? 2200 : P.lp;
    n.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(sp.input);
    // body thump: pitched-down sine
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(P.body * 2.2, t); o.frequency.exponentialRampToValueAtTime(P.body * 0.5, t + P.bodyDec);
    const og = c.createGain(); this.env(og.gain, t, g * (sup ? 0.5 : 1.0), 0.002, P.bodyDec * 1.5);
    o.connect(og); og.connect(sp.input);
    o.start(t); o.stop(t + P.bodyDec * 2 + 0.05);
    // tail (outdoor rumble) and echo
    if (!sup && P.tail > 0) {
      const n2 = this.noiseSrc(t, P.tail);
      const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 700;
      const g2 = c.createGain(); this.env(g2.gain, t + 0.01, g * 0.35, 0.02, P.tail);
      n2.connect(lp2); lp2.connect(g2); g2.connect(sp.input);
      if (sp.dist > 25 || own) g2.connect(this.echoIn);
    }
    if (kind === 'rocket') this.whoosh(x, y, z, own);
    if (kind === 'sniper' || kind === 'dmr') { if (own) setTimeout(() => this.bolt(), kind === 'sniper' ? 380 : 0); }
    if (kind === 'shotgun' && own) setTimeout(() => this.pump(), 330);
  }
  whoosh(x, y, z, own) {
    const c = this.ctx, t = c.currentTime;
    const sp = own ? { input: this.master } : this.spatial(x, y, z, 1, 80);
    const n = this.noiseSrc(t, 0.9);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.8);
    const g = c.createGain(); this.env(g.gain, t, 0.5, 0.05, 0.8);
    n.connect(bp); bp.connect(g); g.connect(sp.input);
  }
  click(freq = 2000, dur = 0.03, gain = 0.25, when = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + when;
    const n = this.noiseSrc(t, dur);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    const g = c.createGain(); this.env(g.gain, t, gain, 0.001, dur);
    n.connect(bp); bp.connect(g); g.connect(this.master);
  }
  reload(kind, dur) {
    // mag out, mag in, charge
    this.click(1400, 0.05, 0.3, 0.05);
    this.click(900, 0.06, 0.25, dur * 0.55);
    this.click(2400, 0.04, 0.35, dur * 0.6);
    this.click(1800, 0.05, 0.35, dur * 0.9);
  }
  shell() { this.click(1100, 0.05, 0.3, 0.0); this.click(2600, 0.02, 0.2, 0.08); }
  pump() { this.click(700, 0.06, 0.35, 0); this.click(1300, 0.05, 0.35, 0.12); }
  bolt() { this.click(1500, 0.04, 0.3, 0); this.click(900, 0.05, 0.3, 0.15); this.click(2000, 0.03, 0.3, 0.3); }
  empty() { this.click(3000, 0.02, 0.25); }
  swap() { this.click(1200, 0.04, 0.2, 0); this.click(1800, 0.03, 0.2, 0.1); }
  step(x, y, z, surface, own, loud = 1) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const sp = own ? { input: this.master, dist: 0 } : this.spatial(x, y, z, 1, 22);
    if (sp.dist > 30) return;
    const f = surface === 'water' ? 600 : surface === 'wood' ? 700 : surface === 'stone' || surface === 'metal' ? 1600 : surface === 'sand' ? 2400 : 1100;
    const n = this.noiseSrc(t, 0.12);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (0.85 + Math.random() * 0.3); bp.Q.value = surface === 'water' ? 0.8 : 1.4;
    const g = c.createGain(); this.env(g.gain, t, (own ? 0.09 : 0.18) * loud, 0.004, surface === 'water' ? 0.2 : 0.07);
    n.connect(bp); bp.connect(g); g.connect(sp.input);
  }
  hit(head) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = head ? 1900 : 1200;
    const g = c.createGain(); this.env(g.gain, t, head ? 0.28 : 0.18, 0.001, head ? 0.12 : 0.06);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
    if (head) { const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 2850; const g2 = c.createGain(); this.env(g2.gain, t + 0.03, 0.15, 0.001, 0.15); o2.connect(g2); g2.connect(this.master); o2.start(t); o2.stop(t + 0.3); }
  }
  kill() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    for (const [f, dt] of [[880, 0], [1320, 0.07]]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = c.createGain(); this.env(g.gain, t + dt, 0.08, 0.002, 0.1); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.2); }
  }
  hurt() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    const g = c.createGain(); this.env(g.gain, t, 0.5, 0.003, 0.18);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
    const n = this.noiseSrc(t, 0.1); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g2 = c.createGain(); this.env(g2.gain, t, 0.25, 0.002, 0.08); n.connect(lp); lp.connect(g2); g2.connect(this.master);
  }
  whiz(x, y, z) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.recent < 0.06) return;
    this.recent = now;
    const c = this.ctx, t = now;
    const sp = this.spatial(x, y, z, 1, 5);
    const n = this.noiseSrc(t, 0.12);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.1);
    const g = c.createGain(); this.env(g.gain, t, 0.4, 0.005, 0.1);
    n.connect(bp); bp.connect(g); g.connect(sp.input);
  }
  impact(x, y, z, mat) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const sp = this.spatial(x, y, z, 1, 18);
    if (sp.dist > 28) return;
    const f = mat === 'metal' ? 3200 : mat === 'wood' ? 900 : mat === 'flesh' ? 500 : mat === 'foliage' ? 2500 : 1700;
    const n = this.noiseSrc(t, 0.08);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = mat === 'metal' ? 8 : 2;
    const g = c.createGain(); this.env(g.gain, t, 0.22, 0.001, mat === 'metal' ? 0.12 : 0.05);
    n.connect(bp); bp.connect(g); g.connect(sp.input);
  }
  explosion(x, y, z) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const sp = this.spatial(x, y, z, 1.6, 160);
    const n = this.noiseSrc(t, 1.8);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(180, t + 1.4);
    const g = c.createGain(); this.env(g.gain, t, 1.0, 0.005, 1.6);
    n.connect(lp); lp.connect(g); g.connect(sp.input); g.connect(this.echoIn);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = c.createGain(); this.env(og.gain, t, 1.0, 0.004, 0.7);
    o.connect(og); og.connect(sp.input); o.start(t); o.stop(t + 0.9);
  }
  bounce(x, y, z) { if (!this.ctx || this.muted) return; const sp = this.spatial(x, y, z, 1, 15); const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 900 + Math.random() * 300; const g = c.createGain(); this.env(g.gain, t, 0.15, 0.001, 0.08); o.connect(g); g.connect(sp.input); o.start(t); o.stop(t + 0.12); }
  hiss(x, y, z) { if (!this.ctx || this.muted) return; const c = this.ctx, t = c.currentTime; const sp = this.spatial(x, y, z, 1, 25); const n = this.noiseSrc(t, 1.4); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const g = c.createGain(); this.env(g.gain, t, 0.25, 0.05, 1.3); n.connect(hp); hp.connect(g); g.connect(sp.input); }
  tone(f, dur = 0.12, type = 'sine', gain = 0.15, when = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = c.createGain(); this.env(g.gain, t, gain, 0.005, dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  capture(ours) { const s = ours ? [523, 659, 784] : [392, 311, 262]; s.forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, i * 0.1)); }
  radio() { this.tone(1800, 0.04, 'square', 0.04); this.click(3000, 0.08, 0.06, 0.04); }
  ui() { this.tone(900, 0.05, 'triangle', 0.1); }
  buy() { this.tone(660, 0.08, 'triangle', 0.12); this.tone(990, 0.12, 'triangle', 0.12, 0.08); }
  // ambient wind/river bed
  ambient(kind) {
    if (!this.ctx) return;
    if (this.amb) { try { this.amb.stop(); } catch (e) { /* stopped */ } this.amb = null; }
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'greenwater' ? 900 : 400;
    const g = c.createGain(); g.gain.value = kind === 'greenwater' ? 0.05 : 0.035;
    s.connect(lp); lp.connect(g); g.connect(this.master); s.start();
    this.amb = s;
  }
  stopAmbient() { if (this.amb) { try { this.amb.stop(); } catch (e) { /* stopped */ } this.amb = null; } }
}
