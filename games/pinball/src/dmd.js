// 128x32 dot-matrix display. Text is drawn into a brightness buffer with a 5x7 font,
// then painted as round amber dots with a soft glow.
import { RANKS } from './game.js';

const W = 128, H = 32;
const F = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100011000101010001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100',
  '!': '00100001000010000100001000000000100', '.': '00000000000000000000000000110001100', ',': '00000000000000000000011000010001000',
  ':': '00000011000110000000011000110000000', '-': '00000000000000011111000000000000000', '/': '00001000010001000100010001000010000',
  '+': '00000001000010011111001000010000000', '?': '01110100010000100010001000000000100', "'": '01100001000100000000000000000000000',
  x: '00000000001000101010001000101010001', '%': '11000110010001000100010001001100011', '*': '00000001001010101110101010010000000', '=': '00000000001111100000111110000000000',
  '>': '01000001000001000001000100010001000', '<': '00010001000100010000010000010000010', ' ': '00000000000000000000000000000000000',
};

export class DMD {
  constructor() {
    this.buf = new Float32Array(W * H);
    this.c = document.createElement('canvas'); this.c.width = W; this.c.height = H;
    this.cx = this.c.getContext('2d');
    this.img = this.cx.createImageData(W, H);
    this.mask = null; this.maskKey = '';
  }
  clear() { this.buf.fill(0); }
  px(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < H) this.buf[y * W + x] = Math.max(this.buf[y * W + x], v); }
  textW(s, sc = 1) { return s.length * 6 * sc - sc; }
  text(s, x, y, sc = 1, v = 1) {
    s = String(s);
    for (let i = 0; i < s.length; i++) {
      const g = F[s[i]] || F[s[i].toUpperCase()] || F[' '];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r * 5 + c] !== '1') continue;
        for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) this.px(x + i * 6 * sc + c * sc + a, y + r * sc + b, v);
      }
    }
  }
  center(s, y, sc = 1, v = 1) {
    const w = this.textW(String(s), sc);
    if (w > W) { // too long: ping-pong scroll
      const span = w - W + 6, off = span * (0.5 - 0.5 * Math.cos((this.t || 0) * 1.6));
      this.text(s, 3 - Math.round(off), y, sc, v); return;
    }
    this.text(s, Math.round((W - w) / 2), y, sc, v);
  }
  fit(s, y, v = 1) { // big if it fits, else small
    if (this.textW(s, 2) <= W) this.center(s, y, 2, v); else this.center(s, y + 4, 1, v);
  }
  box(x0, y0, x1, y1, v) { for (let x = x0; x <= x1; x++) { this.px(x, y0, v); this.px(x, y1, v); } for (let y = y0; y <= y1; y++) { this.px(x0, y, v); this.px(x1, y, v); } }

  compose(g, t, attract) {
    this.clear(); this.t = t;
    if (attract) return this.attract(t, attract);
    const m = g.msgs[0];
    if (g.phase === 'bonus') {
      const k = g.bonusT;
      this.center('BALL ' + g.ballNum + ' COMPLETE', 1, 1, 0.8);
      if (g.tilted) { this.center('TILTED', 11, 2); this.center('NO BONUS', 25, 1, 0.7); }
      else if (k < 0.8) { this.center('BONUS', 10, 2); this.center(g.bonus.toLocaleString('en-US'), 25, 1); }
      else if (k < 1.5) { this.center('x ' + g.bonusX, 10, 2); this.center('MULTIPLIER', 25, 1, 0.8); }
      else { const s = g.bonusTotal.toLocaleString('en-US'); this.fit(s, 10); this.center('TOTAL BONUS', 25, 1, 0.8); }
      return;
    }
    if (g.phase === 'over') { this.center('GAME OVER', 2, 2); this.center(g.score.toLocaleString('en-US'), 22, 1); return; }
    // plunger power meter while pulling
    const pl = g.laneBall();
    if (g.plunger > 0 && pl && !pl.launched) {
      this.center('PLUNGER POWER', 0, 1, 0.8);
      this.box(3, 11, 124, 21, 0.7);
      const zx0 = 4 + Math.round((g.skillZone - 0.07) * 120), zx1 = 4 + Math.round((g.skillZone + 0.07) * 120);
      for (let x = zx0; x <= zx1; x++) for (let y = 12; y <= 20; y += 2) this.px(x, y, 0.35);
      const fx = 4 + Math.round(g.plunger * 120);
      for (let x = 4; x < fx; x++) for (let y = 13; y <= 19; y++) this.px(x, y, 1);
      this.center(Math.abs(g.plunger - g.skillZone) <= 0.07 ? 'LET GO NOW!' : 'RELEASE IN THE ZONE', 25, 1, 0.85);
      return;
    }
    if (m) return this.message(m, t);
    // normal play display
    let top = 'BALL ' + g.ballNum + (g.extraBalls ? '+' : '') + '  ' + RANKS[g.rank];
    if (top.length > 17) top = 'B' + g.ballNum + ' ' + RANKS[g.rank];
    this.text(top, 1, 0, 1, 0.75);
    const bx = g.bonusX + 'x';
    this.text(bx, W - this.textW(bx) - 1, 0, 1, 0.75);
    const sc = g.score.toLocaleString('en-US');
    if (this.textW(sc, 2) <= W) this.center(sc, 9, 2); else this.center(sc, 12, 1);
    // bottom line rotates through what matters right now
    const lines = [];
    const mi = g.mission;
    lines.push(mi.name + ' ' + g.mProg + '/' + g.goal());
    lines.push(mi.hint);
    if (g.jackpotLit) lines.push('RAMP = JACKPOT');
    if (g.lockLit) lines.push('LOCK IS LIT');
    else if (g.locks) lines.push('BALL ' + g.locks + ' LOCKED');
    if (g.extraLit) lines.push('EXTRA BALL IS LIT');
    const lb = g.laneBall();
    if (lb && !lb.launched && lb.y > 1000) lines.splice(0, lines.length, 'HOLD TO PULL PLUNGER', 'GREEN ZONE = SKILL');
    const line = lines[Math.floor(t / 2.2) % lines.length];
    this.center(line, 25, 1, 0.85);
    if (g.tilt >= 1.5 && !g.tilted) this.box(0, 0, W - 1, H - 1, Math.floor(t * 8) % 2 ? 1 : 0.2);
  }

  message(m, t) {
    const k = m.t / m.dur;
    if (m.kind === 'big') {
      const flash = m.t < 0.45 ? (Math.floor(m.t * 14) % 2 ? 1 : 0.25) : 1;
      // expanding rings intro
      if (m.t < 0.35) {
        const r = m.t / 0.35 * 70;
        for (let a = 0; a < 64; a++) { const an = a / 64 * Math.PI * 2; this.px(Math.round(64 + Math.cos(an) * r), Math.round(16 + Math.sin(an) * r * 0.4), 0.6); }
      }
      if (this.textW(m.a, 2) <= W) this.center(m.a, m.b ? 2 : 9, 2, flash); else this.center(m.a, m.b ? 5 : 12, 1, flash);
      if (m.b) this.center(m.b, 23, 1, 0.9);
      // sparkle dots
      for (let i = 0; i < 18; i++) {
        const x = (i * 37 + Math.floor(t * 20) * 13) % W, y = (i * 11 + Math.floor(t * 20) * 7) % H;
        this.px(x, y, 0.35);
      }
    } else {
      // quick: slide in from the right
      const off = Math.max(0, Math.round((1 - Math.min(1, m.t / 0.18)) * W));
      const s = Math.min(1, (1 - k) * 6);
      const a = String(m.a), b = String(m.b || '');
      const sa = this.textW(a, 2) <= W ? 2 : 1;
      this.text(a, Math.round((W - this.textW(a, sa)) / 2) + off, sa === 2 ? 3 : 7, sa, s);
      if (b) this.text(b, Math.round((W - this.textW(b)) / 2) + off, 23, 1, s * 0.9);
    }
  }

  attract(t, info) {
    const pages = [
      () => { this.center('STARLANE', 1, 2); this.center('PINBALL', 19, 1); for (let x = 0; x < W; x++) this.px(x, 30, (x + Math.floor(t * 30)) % 8 < 4 ? 0.7 : 0); },
      () => { this.center('HIGH SCORE', 2, 1, 0.8); const s = info.best.toLocaleString('en-US'); this.fit(s, 13); },
      () => { this.center('BEST RANK', 2, 1, 0.8); this.fit(info.bestRank, 13); },
      () => { this.center('PRESS PLAY', 5, 2, Math.floor(t * 4) % 2 ? 1 : 0.4); this.center('3 BALLS  8 MISSIONS', 24, 1, 0.8); },
    ];
    pages[Math.floor(t / 2.5) % pages.length]();
  }

  // paint the buffer as round dots into ctx at (x,y,w,h)
  paint(ctx, x, y, w, h) {
    const d = this.img.data;
    for (let i = 0; i < W * H; i++) {
      const v = this.buf[i];
      d[i * 4] = 40 + 215 * v; d[i * 4 + 1] = 16 + 140 * v; d[i * 4 + 2] = 6 + 40 * v; d[i * 4 + 3] = 255;
    }
    this.cx.putImageData(this.img, 0, 0);
    const dw = Math.round(w), dh = Math.round(h);
    const key = dw + 'x' + dh;
    if (this.maskKey !== key) {
      this.maskKey = key;
      const mc = document.createElement('canvas'); mc.width = dw; mc.height = dh;
      const m = mc.getContext('2d');
      m.fillStyle = '#0b0603'; m.fillRect(0, 0, dw, dh);
      m.globalCompositeOperation = 'destination-out';
      const cw = dw / W, ch = dh / H, r = Math.min(cw, ch) * 0.42;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { m.beginPath(); m.arc((i + 0.5) * cw, (j + 0.5) * ch, r, 0, Math.PI * 2); m.fill(); }
      this.mask = mc;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.c, x, y, dw, dh);
    ctx.drawImage(this.mask, x, y, dw, dh);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3;
    const gx = dw / W * 1.5; ctx.drawImage(this.c, x - gx, y - gx, dw + gx * 2, dh + gx * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
