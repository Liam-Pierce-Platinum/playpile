// WebAudio synth: dreamy pad, wind that rises with speed, jump/land/shard/bell.
export class Sfx {
  constructor(muted) { this.muted = muted; this.c = null; }
  init() {
    if (this.c || this.muted) { if (this.c && this.c.state === 'suspended') this.c.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.c = new AC(); this.out = c.createGain(); this.out.gain.value = .75;
    const comp = c.createDynamicsCompressor(); this.out.connect(comp); comp.connect(c.destination);
    // echo send
    this.send = c.createGain(); this.send.gain.value = 1; const dl = c.createDelay(1); dl.delayTime.value = .31; const fb = c.createGain(); fb.gain.value = .42; const lp = c.createBiquadFilter(); lp.frequency.value = 1800;
    this.send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); const wet = c.createGain(); wet.gain.value = .35; lp.connect(wet); wet.connect(this.out);
    const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), ch = nb.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1; this.nb = nb;
    const ws = c.createBufferSource(); ws.buffer = nb; ws.loop = true; this.wf = c.createBiquadFilter(); this.wf.type = 'bandpass'; this.wf.frequency.value = 400; this.wf.Q.value = .7;
    this.wg = c.createGain(); this.wg.gain.value = .02; ws.connect(this.wf); this.wf.connect(this.wg); this.wg.connect(this.out); ws.start();
    // pad
    const pf = c.createBiquadFilter(); pf.frequency.value = 900; const pg = c.createGain(); pg.gain.value = .028; pf.connect(pg); pg.connect(this.out); pg.connect(this.send);
    this.pad = [0, 1, 2, 3].map(() => { const o = c.createOscillator(); o.type = 'triangle'; o.connect(pf); o.start(); return o; });
    const CH = [[146.8, 220, 277.2, 370], [130.8, 196, 246.9, 329.6], [164.8, 246.9, 311.1, 415.3], [123.5, 185, 293.7, 370]];
    let k = 0; const step = () => { const t = c.currentTime; CH[k % 4].forEach((f, i) => this.pad[i].frequency.setTargetAtTime(f * (1 + i * .002), t, 1.2)); k++; };
    step(); setInterval(step, 8000);
  }
  env(node, t, a, d, v) { const g = this.c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); node.connect(g); return g; }
  tone(f, dur, type = 'sine', v = .2, f2 = 0, wet = .3, delay = 0) {
    if (!this.c) return; const t = this.c.currentTime + delay, o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.env(o, t, .005, dur, v); g.connect(this.out); if (wet) { const w = this.c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.send); } o.start(t); o.stop(t + dur + .05);
  }
  noise(dur, v, freq, q = 1, type = 'lowpass') {
    if (!this.c) return; const t = this.c.currentTime, s = this.c.createBufferSource(); s.buffer = this.nb; const f = this.c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); this.env(f, t, .004, dur, v).connect(this.out); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  jump() { this.tone(330, .14, 'sine', .12, 560, .1); this.noise(.08, .05, 2500, 1, 'highpass'); }
  land(k) { this.noise(.12 + k * .25, .08 + k * .35, 300 + 200 * (1 - k)); if (k > .3) this.tone(95, .3, 'sine', .3 * k, 45, 0); }
  step() { this.noise(.04, .03, 900, 2, 'bandpass'); }
  shard(n) { const s = [0, 2, 4, 7, 9]; const b = 523.25; [0, 1].forEach(i => this.tone(b * Math.pow(2, s[(n + i * 2) % 5] / 12), .5, 'triangle', .1, 0, .6, i * .07)); }
  bell(big = 1) { [1, 2.01, 2.76, 4.07, 5.43].forEach((p, i) => this.tone(330 * p * (big > 1 ? .5 : 1), 2.5 * big / (1 + i * .4), 'sine', .14 / (1 + i * .6), 0, .7)); }
  whoosh() { this.noise(.6, .12, 700, .8, 'bandpass'); }
  wind(speed) { if (!this.c) return; const k = Math.min(1, speed / 35); this.wg.gain.setTargetAtTime(.015 + k * k * .35, this.c.currentTime, .15); this.wf.frequency.setTargetAtTime(300 + k * 1400, this.c.currentTime, .2); }
  toggle() { if (!this.c) { this.muted = false; this.init(); return; } this.out.gain.value = this.out.gain.value > 0 ? 0 : .75; }
}
