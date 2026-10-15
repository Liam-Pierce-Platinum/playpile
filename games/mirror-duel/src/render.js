// Canvas 2D neon renderer. Logical space is 960x540; everything glows via additive strokes
// (no shadowBlur), and the glossy floor reflects the fighters - it is a mirror duel after all.
import { W, H, FLOOR, BODY, ATK, ROUND_FRAMES, MODS } from './sim.js';

export const COL = { p: '#2ef2ff', m: '#ff2bd6', haz: '#ff3b4e', elec: '#ffe23b', ice: '#9fe8ff', conv: '#8b6cff', pad: '#4dff9a', white: '#ffffff' };
const FONT = (sz, w = 900) => `italic ${w} ${sz}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { k: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };
  let bg = null, bgKey = '';

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const touch = document.body.classList.contains('touch');
    const touchPad = touch && ch > cw ? 200 : 0;
    // phone landscape: keep the floor line above the button row (the reflection can sit under the buttons)
    const band = touch && ch <= cw ? 80 : 0;
    const k = Math.min(cw / W, (ch - touchPad) / H, band ? (ch - band) / FLOOR : 1e9);
    let oy = Math.max(0, (ch - touchPad - H * k) / 2);
    if (band) oy = Math.max(0, Math.min(oy, ch - band - FLOOR * k));
    Object.assign(view, { dpr, cw, ch, k, ox: (cw - W * k) / 2, oy });
    bgKey = '';
  }

  function buildBg(st) {
    const c = document.createElement('canvas'), s = view.k * view.dpr;
    c.width = Math.ceil(W * s); c.height = Math.ceil(H * s);
    const g = c.getContext('2d'); g.scale(s, s);
    const sky = g.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#04010d'); sky.addColorStop(0.55, '#140431'); sky.addColorStop(1, '#3a0848');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // stars (seeded)
    let r = 9; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`; g.fillRect(rnd() * W, rnd() * 300, 1.5, 1.5); }
    // sun on the mirror axis
    const sy = FLOOR - 70, sr = 120;
    const sun = g.createLinearGradient(0, sy - sr, 0, sy);
    sun.addColorStop(0, '#ffd23f'); sun.addColorStop(0.5, '#ff6a3d'); sun.addColorStop(1, '#ff2b8a');
    g.save(); g.beginPath(); g.arc(W / 2, sy, sr, Math.PI, 0); g.closePath(); g.clip();
    g.fillStyle = sun; g.fillRect(W / 2 - sr, sy - sr, sr * 2, sr);
    g.fillStyle = '#1b0538';
    for (let i = 0; i < 7; i++) { const y = sy - 50 + i * 9; g.fillRect(W / 2 - sr, y, sr * 2, 1.5 + i * 0.8); }
    g.restore();
    const halo = g.createRadialGradient(W / 2, sy, sr * 0.6, W / 2, sy, sr * 2.4);
    halo.addColorStop(0, 'rgba(255,60,160,0.22)'); halo.addColorStop(1, 'rgba(255,60,160,0)');
    g.fillStyle = halo; g.fillRect(0, 0, W, FLOOR);
    // mirrored skyline
    r = 31;
    const sky2 = [];
    for (let x = 0; x < W / 2 - 60;) { const w = 22 + rnd() * 40, h = 40 + rnd() * 120; sky2.push([x, w, h]); x += w + 2; }
    for (const [x, w, h] of sky2) for (const xx of [x, W - x - w]) {
      g.fillStyle = '#0d0322'; g.fillRect(xx, FLOOR - h, w, h);
      g.fillStyle = 'rgba(140,90,255,0.35)'; g.fillRect(xx, FLOOR - h, w, 1.5);
      g.fillStyle = 'rgba(255,200,120,0.5)';
      for (let wy = FLOOR - h + 10; wy < FLOOR - 8; wy += 11) for (let wx = xx + 5; wx < xx + w - 5; wx += 8) if (rnd() < 0.18) g.fillRect(wx, wy, 3, 4);
    }
    // floor slab + perspective grid
    const fl = g.createLinearGradient(0, FLOOR, 0, H);
    fl.addColorStop(0, '#1c0838'); fl.addColorStop(1, '#06010f');
    g.fillStyle = fl; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.strokeStyle = 'rgba(160,80,255,0.28)'; g.lineWidth = 1;
    for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(W / 2 + i * 22, FLOOR); g.lineTo(W / 2 + i * 120, H); g.stroke(); }
    for (let i = 1; i < 8; i++) { const y = FLOOR + (H - FLOOR) * (i / 8) ** 1.7; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // pits: cut the floor out
    for (const [a, b] of st.pits) {
      const pg = g.createLinearGradient(0, FLOOR, 0, H);
      pg.addColorStop(0, '#000'); pg.addColorStop(1, '#2a0010');
      g.fillStyle = pg; g.fillRect(a, FLOOR - 1, b - a, H - FLOOR + 1);
    }
    // static solids
    for (const b of st.solids) {
      if (b.floor || b.edge) continue;
      g.fillStyle = '#0e0620'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      const sh = g.createLinearGradient(b.x0, 0, b.x1, 0);
      sh.addColorStop(0, 'rgba(139,108,255,0.18)'); sh.addColorStop(1, 'rgba(139,108,255,0.02)');
      g.fillStyle = sh; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    return c;
  }

  function glow(color, w, path, core = true) {
    const base = ctx.globalAlpha;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [m, a] of [[5, 0.06], [2.6, 0.16], [1, 0.95]]) { ctx.lineWidth = w * m; ctx.globalAlpha = a * base; ctx.beginPath(); path(); ctx.stroke(); }
    if (core) { ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.55 * base; ctx.lineWidth = w * 0.35; ctx.beginPath(); path(); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- fighter pose ----------
  function pose(f, s) {
    const t = f.anim, A = f.act && ATK[f.act.k];
    let lean = 0, bob = 0;
    const moving = f.ground && Math.abs(f.vx) > 40;
    const ph = t * 0.32;
    let fl, bl; // feet
    if (!f.ground) { fl = [10, -16]; bl = [-12, -8]; }
    else if (moving) { const sw = Math.sin(ph) * 15, lift = Math.max(0, Math.cos(ph)) * 7; fl = [sw, -lift]; bl = [-sw, -Math.max(0, -Math.cos(ph)) * 7]; bob = Math.abs(Math.sin(ph)) * 2; }
    else { fl = [12, 0]; bl = [-11, 0]; bob = Math.sin(t * 0.09) * 1.5; }
    let fh = [17, -63], bh = [10, -58];
    const sgn = Math.sign(f.vx) * f.face;
    if (moving) lean = sgn * 4;
    if (A) {
      const at = f.act.t, p1 = Math.min(1, at / A.start), act = at >= A.start && at < A.start + A.active;
      const rec = at >= A.start + A.active ? 1 - (at - A.start - A.active) / A.rec : 1;
      if (f.act.k === 'p') {
        const e = at < A.start ? p1 * 0.3 : act ? 1 : rec;
        fh = [17 + e * (BODY.w + A.reach * 0.62 - 17), -63 + e * 3]; lean = 5 * e; bh = [6, -60];
      } else {
        if (at < A.start) { lean = -7 * p1; fl = [10 + 6 * p1, -26 * p1]; }
        else { const e = act ? 1 : rec; fl = [10 + e * (BODY.w + A.reach * 0.7 - 10), -10 - e * 34]; lean = -9 * e; bl = [-12, 0]; }
        fh = [8, -66]; bh = [-12, -60];
      }
    }
    if (f.stun > 0 && !A) { lean = -9; fh = [-8, -74 + Math.sin(t) * 4]; bh = [-18, -66]; }
    const hip = [lean * 0.3, -42 - bob], neck = [lean, -70 - bob], head = [lean * 1.25, -81 - bob];
    const knee = (foot, fwd) => [(hip[0] + foot[0]) / 2 + fwd, (hip[1] + foot[1]) / 2 - 2];
    const elbow = (hand, out) => [(neck[0] + hand[0]) / 2 - out, (neck[1] + 3 + hand[1]) / 2 + 7];
    return { hip, neck, head, fl, bl, fk: knee(fl, 7), bk: knee(bl, 5), fh, bh, fe: elbow(fh, 2), be: elbow(bh, 5) };
  }

  function drawFighter(f, s, color, alpha = 1, ox = 0, oy = 0, flipY = false) {
    const P = pose(f, s), dir = f.face;
    const ko = f.hp <= 0 && (s.phase === 'ko' || s.phase === 'done');
    ctx.save();
    ctx.translate(f.x + ox, (flipY ? 2 * FLOOR - f.y : f.y) + oy);
    if (flipY) ctx.scale(1, -1);
    if (ko) { const k = Math.min(1, s.pt / 18); ctx.rotate(-dir * k * Math.PI / 2 * 0.92); }
    ctx.scale(dir, 1);
    ctx.globalAlpha = alpha * (f.inv > 0 && f.inv % 6 < 3 ? 0.45 : 1);
    const c = f.flash > 0 ? '#ffffff' : color;
    const seg = (pts) => () => { ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); };
    // back limbs dimmer for depth
    ctx.save(); ctx.globalAlpha *= 0.55;
    glow(c, 6.5, seg([P.hip, P.bk, P.bl]), false); glow(c, 6, seg([P.neck, P.be, P.bh]), false);
    ctx.restore();
    // torso as a tapered filled shape
    ctx.save(); ctx.globalAlpha *= 0.9; ctx.fillStyle = '#0b0418';
    ctx.beginPath(); ctx.moveTo(P.neck[0] - 12, P.neck[1]); ctx.lineTo(P.neck[0] + 12, P.neck[1]); ctx.lineTo(P.hip[0] + 8, P.hip[1]); ctx.lineTo(P.hip[0] - 8, P.hip[1]); ctx.closePath(); ctx.fill();
    ctx.restore();
    glow(c, 6, () => { ctx.moveTo(P.neck[0] - 12, P.neck[1]); ctx.lineTo(P.neck[0] + 12, P.neck[1]); ctx.lineTo(P.hip[0] + 8, P.hip[1]); ctx.lineTo(P.hip[0] - 8, P.hip[1]); ctx.closePath(); });
    glow(c, 7.5, seg([P.hip, P.fk, P.fl]));
    glow(c, 7, seg([P.neck, P.fe, P.fh]));
    // fist / boot highlight during active frames
    if (f.act) { const A = ATK[f.act.k]; if (f.act.t >= A.start && f.act.t < A.start + A.active) { const p = f.act.k === 'p' ? P.fh : P.fl; glow('#fff', 4, () => ctx.arc(p[0], p[1], 8, 0, 7)); } }
    // head: dark visor + ring
    ctx.fillStyle = '#0b0418'; ctx.beginPath(); ctx.arc(P.head[0], P.head[1], 12, 0, 7); ctx.fill();
    glow(c, 4.5, () => ctx.arc(P.head[0], P.head[1], 12, 0, 7));
    glow(c, 2.5, () => { ctx.moveTo(P.head[0] + 2, P.head[1] - 2); ctx.lineTo(P.head[0] + 11, P.head[1] - 1); });
    ctx.restore();
  }

  // ---------- stage dynamic layers ----------
  function drawStage(s, st) {
    const t = s.t;
    // floor edge lines per segment
    for (const b of st.solids) if (b.floor) {
      glow('#b07cff', 2.5, () => { ctx.moveTo(b.x0, FLOOR); ctx.lineTo(b.x1, FLOOR); });
      if (b.x0 > 0) glow(COL.haz, 2, () => { ctx.moveTo(b.x0, FLOOR); ctx.lineTo(b.x0, H); }, false);
      if (b.x1 < W) glow(COL.haz, 2, () => { ctx.moveTo(b.x1, FLOOR); ctx.lineTo(b.x1, H); }, false);
    }
    for (const [a, b] of st.pits) {
      ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 0.1);
      const g = ctx.createLinearGradient(0, FLOOR, 0, H); g.addColorStop(0, 'rgba(255,40,80,0)'); g.addColorStop(1, 'rgba(255,40,80,0.35)');
      ctx.fillStyle = g; ctx.fillRect(a, FLOOR, b - a, H - FLOOR); ctx.restore();
    }
    for (const b of st.solids) if (!b.floor && !b.edge) {
      glow(b.elec ? COL.elec : COL.conv, 2, () => ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0), false);
    }
    // electric edge walls
    for (const b of st.solids) if (b.elec && b.edge) {
      const x = b.x0 < 0 ? 3 : W - 3, sgn = b.x0 < 0 ? 1 : -1;
      glow(COL.elec, 2.2, () => { ctx.moveTo(x, 70); for (let y = 70; y <= FLOOR; y += 14) ctx.lineTo(x + sgn * (((y / 14 + (t >> 2)) % 2) * 7 + Math.random() * 3), y); });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(x, 0, x + sgn * 60, 0);
      g.addColorStop(0, 'rgba(255,226,59,0.22)'); g.addColorStop(1, 'rgba(255,226,59,0)'); ctx.fillStyle = g; ctx.fillRect(Math.min(x, x + sgn * 60), 70, 60, FLOOR - 70); ctx.restore();
    }
    for (const c of st.conv) {
      ctx.save(); ctx.beginPath(); ctx.rect(c.x0, FLOOR - 1, c.x1 - c.x0, 14); ctx.clip();
      ctx.fillStyle = 'rgba(139,108,255,0.18)'; ctx.fillRect(c.x0, FLOOR, c.x1 - c.x0, 12);
      const off = ((t * c.v / 60) % 28 + 28) % 28, d = Math.sign(c.v);
      for (let x = c.x0 - 28 + off; x < c.x1 + 28; x += 28) glow(COL.conv, 2, () => { ctx.moveTo(x - d * 5, FLOOR + 2); ctx.lineTo(x + d * 3, FLOOR + 6); ctx.lineTo(x - d * 5, FLOOR + 10); }, false);
      ctx.restore();
    }
    for (const [a, b] of st.ice) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, FLOOR - 8, 0, FLOOR + 30); g.addColorStop(0, 'rgba(159,232,255,0)'); g.addColorStop(0.3, 'rgba(159,232,255,0.35)'); g.addColorStop(1, 'rgba(159,232,255,0)');
      ctx.fillStyle = g; ctx.fillRect(a, FLOOR - 8, b - a, 38);
      for (let i = 0; i < 6; i++) { const x = a + ((i * 97 + t * 0.6) % (b - a)); ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(x, FLOOR + 3, 18, 1.5); }
      ctx.restore();
      glow(COL.ice, 2, () => { ctx.moveTo(a, FLOOR); ctx.lineTo(b, FLOOR); });
    }
    for (const [a, b] of st.pads) {
      glow(COL.pad, 3, () => { ctx.moveTo(a, FLOOR - 3); ctx.lineTo(b, FLOOR - 3); });
      for (let i = 0; i < 2; i++) { const y = FLOOR - 14 - i * 10 - (t % 20) * 0.4; glow(COL.pad, 2, () => { ctx.moveTo((a + b) / 2 - 10, y + 6); ctx.lineTo((a + b) / 2, y); ctx.lineTo((a + b) / 2 + 10, y + 6); }, false); }
    }
    for (const sp of st.spikes) {
      const up = sp.dir === 'up', y = sp.y, n = Math.max(1, Math.round((sp.x1 - sp.x0) / 16)), w = (sp.x1 - sp.x0) / n;
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.12);
      ctx.save(); ctx.globalAlpha = pulse;
      glow(COL.haz, 2, () => { ctx.moveTo(sp.x0, y); for (let i = 0; i < n; i++) { ctx.lineTo(sp.x0 + w * (i + 0.5), up ? y - 17 : y + 17); ctx.lineTo(sp.x0 + w * (i + 1), y); } });
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, y, 0, up ? y - 60 : y + 60); g.addColorStop(0, 'rgba(255,59,78,0.25)'); g.addColorStop(1, 'rgba(255,59,78,0)');
      ctx.fillStyle = g; ctx.fillRect(sp.x0, up ? y - 60 : y, sp.x1 - sp.x0, 60);
      ctx.restore();
    }
    for (const L of st.lasers) {
      const ph = (s.t + L.phase) % L.period, on = ph < L.on, warn = !on && L.period - ph < 36;
      ctx.fillStyle = '#1a0a2e'; ctx.fillRect(L.x - 10, 60, 20, 10);
      glow(COL.haz, 1.5, () => ctx.rect(L.x - 10, 60, 20, 10), false);
      if (on) {
        glow(COL.haz, 5, () => { ctx.moveTo(L.x, 70); ctx.lineTo(L.x, FLOOR); });
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,48,79,0.12)'; ctx.fillRect(L.x - 26, 70, 52, FLOOR - 70); ctx.restore();
      } else if (warn && (t >> 2) % 2) {
        ctx.save(); ctx.globalAlpha = 0.6; ctx.setLineDash([6, 8]); ctx.strokeStyle = COL.haz; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(L.x, 70); ctx.lineTo(L.x, FLOOR); ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawHud(g) {
    const s = g.s, st = g.st, [a, b] = s.f;
    const bar = (x, w, frac, chip, color, rtl) => {
      const y = 22, h = 20, sk = rtl ? -8 : 8;
      const para = () => { ctx.moveTo(x + Math.max(0, sk), y); ctx.lineTo(x + w + Math.max(0, sk), y); ctx.lineTo(x + w + Math.min(0, sk) + (rtl ? 8 : -8) * 0 , y + h); ctx.lineTo(x + Math.min(0, sk), y + h); ctx.closePath(); };
      const fw = (v) => Math.max(0, Math.min(1, v)) * (w + 8);
      ctx.save(); ctx.beginPath(); para(); ctx.fillStyle = 'rgba(10,4,24,0.85)'; ctx.fill(); ctx.clip();
      const x0 = x - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(rtl ? x0 + w + 16 - fw(chip) : x0, y, fw(chip), h);
      const grd = ctx.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, '#fff'); grd.addColorStop(0.3, color); grd.addColorStop(1, color);
      ctx.fillStyle = frac < 0.3 && (s.t >> 3) % 2 ? '#ff3b4e' : grd; ctx.fillRect(rtl ? x0 + w + 16 - fw(frac) : x0, y, fw(frac), h);
      ctx.restore();
      glow(color, 1.5, para, false);
    };
    bar(40, 370, a.hp / a.hpMax, g.chip[0], COL.p, true);
    bar(550, 370, b.hp / b.hpMax, g.chip[1], COL.m, false);
    ctx.font = FONT(16); ctx.textBaseline = 'top';
    ctx.fillStyle = COL.p; ctx.textAlign = 'left'; ctx.fillText('YOU', 40, 50);
    ctx.fillStyle = COL.m; ctx.textAlign = 'right'; ctx.fillText('MIRROR', 920, 50);
    let mx = 840;
    ctx.font = FONT(12, 800);
    for (const k of st.def.mods || []) {
      const label = MODS[k].name, w = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(255,43,214,0.18)'; ctx.fillRect(mx - w, 52, w, 17);
      ctx.strokeStyle = COL.m; ctx.lineWidth = 1; ctx.strokeRect(mx - w + 0.5, 52.5, w - 1, 16);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, mx - w / 2, 55); mx -= w + 6;
    }
    // timer + pips
    const secs = Math.max(0, Math.ceil((ROUND_FRAMES - s.ft) / 60));
    ctx.textAlign = 'center'; ctx.font = FONT(34); ctx.fillStyle = secs <= 10 && s.phase === 'fight' ? '#ff3b4e' : '#fff';
    ctx.fillText(String(secs), 480, 14);
    for (let i = 0; i < 2; i++) {
      for (const [side, col, n] of [[-1, COL.p, g.wins[0]], [1, COL.m, g.wins[1]]]) {
        const x = 480 + side * (40 + i * 16), y = 60;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = i < n ? col : 'rgba(255,255,255,0.12)'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      }
    }
    ctx.font = FONT(13, 800); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'left';
    ctx.fillText(`STAGE ${g.stageIdx + 1}/${g.stageCount}  ${st.def.name}`, 14, H - 22);
    ctx.textAlign = 'right'; ctx.fillText(`ROUND ${s.round}`, W - 14, H - 22);
  }

  function drawFx(fx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      const k = p.life / p.max;
      if (p.type === 'spark') { ctx.globalAlpha = k; ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); }
      else if (p.type === 'ring') { ctx.globalAlpha = k * 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 3 * k + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k) + 6, 0, 7); ctx.stroke(); }
      else if (p.type === 'dot') { ctx.globalAlpha = k; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    ctx.restore();
    for (const p of fx.texts) {
      const k = p.life / p.max, sc = 1 + Math.max(0, (k - 0.8) * 2.5);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = FONT(p.size); ctx.textAlign = 'center';
      const hw = ctx.measureText(p.text).width / 2 * sc + 10; ctx.translate((Math.max(hw, Math.min(W - hw, p.x)) - p.x) / sc, 0); ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,2,20,0.9)'; ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0); ctx.restore();
    }
  }

  function drawBanner(fx) {
    const b = fx.banner; if (!b) return;
    const k = b.t / b.max, appear = Math.min(1, (1 - k) * 6), sc = 1.6 - 0.6 * Math.min(1, (1 - k) * 5);
    ctx.save(); ctx.translate(W / 2, H / 2 - 30); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(appear, k * 4);
    ctx.font = FONT(b.size || 86); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(8,2,20,0.85)'; ctx.strokeText(b.text, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = COL.p; ctx.fillText(b.text, -3, 0); ctx.fillStyle = COL.m; ctx.fillText(b.text, 3, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.9; ctx.fillText(b.text, 0, 0);
    if (b.sub) { ctx.font = FONT(20, 800); ctx.globalAlpha = Math.min(appear, k * 4); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 62); }
    ctx.restore();
  }

  function draw(g) {
    const { s, st, fx } = g;
    if (!st) return;
    const key = st.def.name + view.k + view.dpr;
    if (bgKey !== key) { bg = buildBg(st); bgKey = key; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04010d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = view.k * view.dpr;
    const sx = (Math.random() - 0.5) * fx.shake * 2, sy = (Math.random() - 0.5) * fx.shake * 2;
    ctx.setTransform(k, 0, 0, k, (view.ox + sx * view.k) * view.dpr, (view.oy + sy * view.k) * view.dpr);
    ctx.drawImage(bg, 0, 0, W, H);
    // mirror axis + ghost of the perfect reflection
    ctx.save(); ctx.setLineDash([3, 9]); ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W / 2, 80); ctx.lineTo(W / 2, FLOOR); ctx.stroke(); ctx.restore();
    const gx = W - s.f[0].x;
    ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = COL.m; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gx - 7, FLOOR + 6); ctx.lineTo(gx, FLOOR + 1); ctx.lineTo(gx + 7, FLOOR + 6); ctx.stroke(); ctx.restore();
    drawStage(s, st);
    const cols = [COL.p, COL.m];
    // reflections in the glossy floor
    ctx.save(); ctx.beginPath(); ctx.rect(0, FLOOR + 1, W, H - FLOOR); ctx.clip();
    for (const f of s.f) drawFighter(f, s, cols[f.id], 0.22, 0, 0, true);
    ctx.restore();
    // shadows + afterimages
    for (const f of s.f) {
      const d = Math.max(0, FLOOR - f.y);
      ctx.fillStyle = `rgba(0,0,0,${0.45 * Math.max(0.2, 1 - d / 250)})`;
      ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 2, 22 * Math.max(0.4, 1 - d / 300), 4, 0, 0, 7); ctx.fill();
      const tr = g.trails[f.id];
      tr.forEach((p, i) => { ctx.save(); ctx.globalAlpha = 1; drawFighter({ ...f, x: p.x, y: p.y, flash: 0, inv: 0 }, s, cols[f.id], 0.12 + i * 0.05); ctx.restore(); });
    }
    // draw the one being hit last so the hit reads
    const order = s.f[0].flash > s.f[1].flash ? [1, 0] : [0, 1];
    for (const i of order) drawFighter(s.f[i], s, cols[i]);
    drawFx(fx);
    if (g.screen === 'title') { ctx.fillStyle = 'rgba(4,1,13,0.35)'; ctx.fillRect(0, 0, W, H); return; }
    drawHud(g);
    if (g.hint && g.hintA > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, g.hintA);
      ctx.font = FONT(17, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = Math.min(900, ctx.measureText(g.hint).width + 34);
      ctx.fillStyle = 'rgba(8,2,20,0.78)'; ctx.fillRect(W / 2 - w / 2, 94, w, 32);
      ctx.strokeStyle = 'rgba(46,242,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - w / 2 + 0.5, 94.5, w - 1, 31);
      ctx.fillStyle = '#e8fcff'; ctx.fillText(g.hint, W / 2, 110, 880); ctx.restore();
    }
    drawBanner(fx);
    // vignette + flash
    ctx.setTransform(k, 0, 0, k, view.ox * view.dpr, view.oy * view.dpr);
    if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  }

  resize();
  return { resize, draw, view };
}
