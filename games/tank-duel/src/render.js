// Drawing: sky, parallax hills, clouds, terrain, tanks, shots, fx, aim guides.
import { W, H } from './terrain.js';
import { WEAPON_BY_ID } from './weapons.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.clouds = []; this.streaks = []; this.hills = null; this.hillsFor = null;
    for (let i = 0; i < 9; i++) this.clouds.push({ x: Math.random() * W * 1.4 - W * 0.2, y: 40 + Math.random() * 260, s: 0.6 + Math.random() * 0.9, sp: 4 + Math.random() * 8 });
    for (let i = 0; i < 40; i++) this.streaks.push({ x: Math.random() * W, y: Math.random() * 650, l: 20 + Math.random() * 50, a: Math.random() });
    this.time = 0;
  }
  buildHills(seed) {
    let a = seed;
    const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    const mk = (base, amp, n) => { const p = []; const ph = [r() * 6, r() * 6, r() * 6]; for (let i = 0; i <= n; i++) { const x = (i / n) * (W + 400) - 200; p.push(x, base + Math.sin(x * 0.004 + ph[0]) * amp + Math.sin(x * 0.011 + ph[1]) * amp * 0.45 + Math.sin(x * 0.023 + ph[2]) * amp * 0.2); } return p; };
    this.hills = [mk(430, 70, 80), mk(500, 55, 80)];
  }
  update(dt, wind) {
    this.time += dt;
    for (const c of this.clouds) { c.x += (wind * 5 * c.s + c.sp * Math.sign(wind || 1) * 0.3) * dt; if (c.x > W + 300) c.x = -300; if (c.x < -300) c.x = W + 300; }
    for (const s of this.streaks) { s.x += wind * 60 * dt; if (s.x > W + 60) { s.x = -60; s.y = Math.random() * 650; } if (s.x < -60) { s.x = W + 60; s.y = Math.random() * 650; } }
  }
  // view = { s, ox, oy, vw, vh, dpr }
  draw(game, view, aim) {
    const c = this.ctx, T = game.terrain, th = T.theme, { s, ox, oy, vw, vh, dpr } = view;
    if (this.hillsFor !== T.version0) { this.hillsFor = T.version0; this.buildHills((game.round * 7919 + 13) >>> 0); }
    const shake = game.fx.shakeAmt;
    const sx = shake ? (Math.random() * 2 - 1) * shake : 0, sy = shake ? (Math.random() * 2 - 1) * shake : 0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky (screen space)
    const g = c.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[2]);
    c.fillStyle = g; c.fillRect(0, 0, vw, vh);
    // world transform
    const wx = ox + sx * s, wy = oy + sy * s;
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * wx, dpr * wy);
    // sun
    c.save();
    const sunX = W * 0.72, sunY = 150;
    const sg = c.createRadialGradient(sunX, sunY, 10, sunX, sunY, 160);
    sg.addColorStop(0, th.sun); sg.addColorStop(0.3, th.sun + 'aa'); sg.addColorStop(1, th.sun + '00');
    c.fillStyle = sg; c.beginPath(); c.arc(sunX, sunY, 160, 0, TAU); c.fill();
    c.fillStyle = th.sun; c.beginPath(); c.arc(sunX, sunY, 44, 0, TAU); c.fill();
    c.restore();
    // clouds
    for (const cl of this.clouds) this.cloud(c, cl.x, cl.y, cl.s, th.cloud);
    // parallax hills
    const par = (ox - (vw - W * s) / 2) / s; // camera offset in world px
    [[this.hills[0], th.far, 0.25], [this.hills[1], th.mid, 0.12]].forEach(([pts, col, k]) => {
      c.save(); c.translate(-par * k, 0);
      c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], H + 200);
      for (let i = 0; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      c.lineTo(pts[pts.length - 2], H + 200); c.closePath(); c.fill(); c.restore();
    });
    // wind streaks
    if (Math.abs(game.wind) > 0) {
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.lineCap = 'round';
      const k = Math.min(1, Math.abs(game.wind) / 10);
      c.beginPath();
      for (let i = 0; i < this.streaks.length * k; i++) { const st = this.streaks[i]; c.moveTo(st.x, st.y); c.lineTo(st.x - Math.sign(game.wind) * st.l * (0.4 + k), st.y); }
      c.stroke();
    }
    // terrain, plus stretched edge columns to fill any side gaps
    c.imageSmoothingEnabled = true;
    const leftGap = wx / s, rightGap = (vw - (wx + W * s)) / s;
    if (leftGap > 0) c.drawImage(T.canvas, 0, 0, 1, H, -leftGap - 2, 0, leftGap + 3, H);
    if (rightGap > 0) c.drawImage(T.canvas, W - 1, 0, 1, H, W - 1, 0, rightGap + 3, H);
    c.drawImage(T.canvas, 0, 0);
    // fires (napalm): cartoon flame tongues, drawn back-to-front in three colour layers
    const flame = (x, y, hw, hh, col, ph) => {
      const sway = Math.sin(this.time * 9 + ph) * hw * 0.35;
      c.fillStyle = col; c.beginPath();
      c.moveTo(x - hw, y);
      c.quadraticCurveTo(x - hw * 1.05, y - hh * 0.55, x + sway, y - hh);
      c.quadraticCurveTo(x + hw * 1.05, y - hh * 0.55, x + hw, y);
      c.closePath(); c.fill();
    };
    for (const layer of [['#e8341c', 1], ['#ff8a1a', 0.7], ['#ffe066', 0.4]]) {
      for (const f of game.fires) {
        const life = 1 - f.age / f.life, fl = 0.75 + 0.25 * Math.sin(this.time * 22 + f.x * 0.7);
        const k = Math.min(1, life * 3) * layer[1];
        flame(f.x, f.y + 2, 7 * k + 2, (22 + 10 * fl) * k, layer[0], f.x);
      }
    }
    // tanks
    const tsc = view.portrait ? Math.max(1, Math.min(1.9, 0.62 / s)) : s < 0.45 ? Math.min(1.8, 0.45 / s) : 1; this.tsc = tsc;
    for (const tk of game.tanks) { c.save(); c.translate(tk.x, tk.y); c.scale(tsc, tsc); c.translate(-tk.x, -tk.y); this.tank(c, game, tk); c.restore(); }
    // aim guides
    if (game.phase === 'aim' && aim && aim.show) this.aimGuide(c, game, aim);
    // projectiles
    for (const p of game.proj) this.proj(c, p);
    // particles
    this.particles(c, game.fx);
    // floating text
    for (const t of game.fx.texts) {
      const u = t.age / t.life, tz = this.tsc || 1, pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.55 : u < 0.2 ? 1.15 - (u - 0.12) / 0.08 * 0.15 : 1;
      const alpha = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
      c.save(); c.globalAlpha = alpha; c.translate(t.x, t.ay == null ? t.y : t.ay + (t.y - t.ay) * tz); c.scale(pop * tz, pop * tz);
      c.font = `700 ${t.size}px Fredoka, 'Trebuchet MS', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = Math.max(4, t.size * 0.2); c.strokeStyle = 'rgba(20,16,40,0.9)'; c.strokeText(t.str, 0, 0);
      c.fillStyle = t.col; c.fillText(t.str, 0, 0); c.restore();
    }
    // off-screen projectile markers (above the visible top)
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of game.proj) {
      const px = wx + p.x * s, py = wy + p.y * s;
      if (py < 4 || px < 4 || px > vw - 4) {
        const mx = Math.max(16, Math.min(vw - 16, px)), my = Math.max(84, py);
        c.fillStyle = 'rgba(255,255,255,0.9)'; c.strokeStyle = 'rgba(20,16,40,0.8)'; c.lineWidth = 2;
        c.beginPath();
        if (py < 4) { c.moveTo(mx, my - 12); c.lineTo(mx - 8, my + 2); c.lineTo(mx + 8, my + 2); }
        else { const d = px < 4 ? -1 : 1; c.moveTo(mx + d * 10, my); c.lineTo(mx - d * 4, my - 8); c.lineTo(mx - d * 4, my + 8); }
        c.closePath(); c.fill(); c.stroke();
      }
    }
    // screen flash
    if (game.fx.flash > 0.02) { c.fillStyle = `rgba(255,248,220,${Math.min(0.32, game.fx.flash * 0.28)})`; c.fillRect(0, 0, vw, vh); }
  }
  cloud(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = col; c.globalAlpha = 0.85;
    c.beginPath();
    c.arc(0, 0, 34, 0, TAU); c.arc(38, -14, 42, 0, TAU); c.arc(82, 0, 32, 0, TAU); c.arc(44, 12, 34, 0, TAU);
    c.fill();
    c.globalAlpha = 0.18; c.fillStyle = '#7890b0';
    c.beginPath(); c.ellipse(42, 30, 70, 8, 0, 0, TAU); c.fill();
    c.restore();
  }
  tank(c, game, tk) {
    const active = game.cur === tk && (game.phase === 'aim');
    const dead = tk.dead;
    const body = dead ? '#3a3a44' : tk.hurt > 0 && Math.floor(tk.hurt * 30) % 2 ? '#ffffff' : tk.col;
    const body2 = dead ? '#2a2a30' : tk.col2;
    const ink = '#1d1b2e';
    // barrel (world angle, not tilted)
    const pv = game.pivot(tk), a = tk.angle * Math.PI / 180;
    const rec = tk.recoil * 7;
    c.lineCap = 'round';
    if (!dead) {
      const bx = pv.x + Math.cos(a) * (26 - rec), by = pv.y - Math.sin(a) * (26 - rec);
      c.strokeStyle = ink; c.lineWidth = 9; c.beginPath(); c.moveTo(pv.x, pv.y); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = '#55596a'; c.lineWidth = 5; c.beginPath(); c.moveTo(pv.x, pv.y); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = '#8a8fa3'; c.lineWidth = 2; c.beginPath(); c.moveTo(pv.x + Math.cos(a) * 4, pv.y - Math.sin(a) * 4 - 1); c.lineTo(bx, by - 1); c.stroke();
    }
    c.save(); c.translate(tk.x, tk.y); c.rotate(tk.tilt);
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(0, 1, 22, 4, 0, 0, TAU); c.fill();
    // tracks
    c.fillStyle = ink; this.rr(c, -21, -11, 42, 12, 6); c.fill();
    c.fillStyle = '#4a4d5c'; this.rr(c, -19, -9.5, 38, 9, 4.5); c.fill();
    c.fillStyle = '#9aa0b5';
    for (let i = -3; i <= 3; i += 2) { c.beginPath(); c.arc(i * 5.4, -5, 2.6, 0, TAU); c.fill(); }
    // hull
    c.fillStyle = ink;
    c.beginPath(); c.moveTo(-20, -9); c.lineTo(20, -9); c.lineTo(15, -19); c.lineTo(-15, -19); c.closePath(); c.fill();
    c.fillStyle = body;
    c.beginPath(); c.moveTo(-18, -10.5); c.lineTo(18, -10.5); c.lineTo(13.5, -17.5); c.lineTo(-13.5, -17.5); c.closePath(); c.fill();
    c.fillStyle = body2; c.fillRect(-17, -12.5, 34, 2);
    // dome turret
    c.fillStyle = ink; c.beginPath(); c.arc(0, -17, 11, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = body; c.beginPath(); c.arc(0, -17.5, 9, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-3.5, -22, 3.2, 1.8, -0.4, 0, TAU); c.fill();
    c.restore();
    if (dead) {
      if (Math.random() < 0.25) game.fx.p.push({ t: 'smoke', x: tk.x + (Math.random() - 0.5) * 16, y: tk.y - 18, vx: 0, vy: -30, life: 1.4, age: 0, s: 8 + Math.random() * 6 });
      return;
    }
    // little hp bar
    const hpw = 40, hy = tk.y - 44;
    c.fillStyle = 'rgba(20,16,40,0.65)'; this.rr(c, tk.x - hpw / 2 - 2, hy - 2, hpw + 4, 8, 4); c.fill();
    c.fillStyle = '#ffd23f'; this.rr(c, tk.x - hpw / 2, hy, hpw * Math.max(0, tk.shownHp) / 100, 4, 2); c.fill();
    c.fillStyle = tk.hp > 50 ? '#5be06b' : tk.hp > 25 ? '#ffb02e' : '#ff4d4d'; this.rr(c, tk.x - hpw / 2, hy, hpw * tk.hp / 100, 4, 2); c.fill();
    if (active) {
      const bob = Math.sin(this.time * 6) * 4;
      c.fillStyle = tk.col; c.strokeStyle = ink; c.lineWidth = 3; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(tk.x, hy - 8 + bob); c.lineTo(tk.x - 9, hy - 20 + bob); c.lineTo(tk.x + 9, hy - 20 + bob); c.closePath(); c.stroke(); c.fill();
    }
  }
  aimGuide(c, game, aim) {
    const tk = game.cur, pv = game.pivot(tk), z = this.tsc || 1;
    // angle arc + power ring
    const a = tk.angle * Math.PI / 180;
    c.save();
    c.translate(pv.x, pv.y); c.scale(z, z); c.translate(-pv.x, -pv.y);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.setLineDash([4, 6]);
    c.beginPath(); c.arc(pv.x, pv.y, 58, Math.PI, TAU); c.stroke();
    c.setLineDash([]);
    const len = 34 + tk.power * 0.9;
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(pv.x + Math.cos(a) * 30, pv.y - Math.sin(a) * 30); c.lineTo(pv.x + Math.cos(a) * len, pv.y - Math.sin(a) * len); c.stroke();
    // arrow head
    const hx = pv.x + Math.cos(a) * len, hy = pv.y - Math.sin(a) * len;
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath();
    c.moveTo(hx + Math.cos(a) * 10, hy - Math.sin(a) * 10);
    c.lineTo(hx + Math.cos(a + 2.5) * 9, hy - Math.sin(a + 2.5) * 9);
    c.lineTo(hx + Math.cos(a - 2.5) * 9, hy - Math.sin(a - 2.5) * 9); c.closePath(); c.fill();
    c.restore(); c.save();
    // preview dots
    if (!tk.isBot || aim.botPreview) {
      const pts = game.preview(tk);
      for (let i = 0; i < pts.length; i += 2) {
        const k = i / pts.length;
        if ((i / 2) % 3) continue;
        c.fillStyle = `rgba(255,255,255,${0.95 - k * 0.8})`;
        c.beginPath(); c.arc(pts[i], pts[i + 1], (3.6 - k * 1.8) * Math.min(1.5, z), 0, TAU); c.fill();
      }
    }
    c.restore();
  }
  proj(c, p) {
    const w = p.w, col = w.col;
    c.save(); c.translate(p.x, p.y);
    const r = p.size * (this.tsc || 1);
    if (w.id === 'napalm' || w.id === 'volcano') {
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(0, 0, 1, 0, 0, r * 3);
      g.addColorStop(0, 'rgba(255,230,150,1)'); g.addColorStop(0.4, 'rgba(255,120,30,0.8)'); g.addColorStop(1, 'rgba(255,50,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 3, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    if (w.id === 'nuke') {
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 22);
      g.addColorStop(0, 'rgba(255,240,120,0.7)'); g.addColorStop(1, 'rgba(255,240,120,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill();
    }
    if (p.mode === 'roll') c.rotate(p.spin || 0);
    else c.rotate(Math.atan2(p.vy, p.vx));
    c.fillStyle = '#1d1b2e';
    if (p.mode === 'fly' && w.id !== 'roller' && w.id !== 'bouncer') {
      // bullet shape
      c.beginPath(); c.ellipse(0, 0, r * 1.6 + 2, r + 2, 0, 0, TAU); c.fill();
      c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, r * 1.6, r, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(r * 0.3, -r * 0.4, r * 0.7, r * 0.3, 0, 0, TAU); c.fill();
    } else {
      c.beginPath(); c.arc(0, 0, r + 2, 0, TAU); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-r * 0.7, 0); c.lineTo(r * 0.7, 0); c.stroke();
    }
    if (p.mode === 'dig') {
      c.fillStyle = '#e7e9f0'; c.beginPath(); c.moveTo(r * 1.6 + 8, 0); c.lineTo(r * 1.2, -r); c.lineTo(r * 1.2, r); c.closePath(); c.fill();
    }
    c.restore();
  }
  particles(c, fx) {
    // smoke + trail (normal blend)
    for (const q of fx.p) {
      if (q.age < 0) continue;
      const u = q.age / q.life;
      if (q.t === 'smoke') {
        const rr = q.s * (0.5 + u * 1.1);
        c.fillStyle = q.dust ? `rgba(190,165,130,${0.5 * (1 - u)})` : `rgba(${90 + u * 90},${88 + u * 90},${100 + u * 90},${0.55 * (1 - u)})`;
        c.beginPath(); c.arc(q.x, q.y, rr, 0, TAU); c.fill();
      } else if (q.t === 'trail') {
        c.fillStyle = q.col ? `rgba(255,170,80,${0.6 * (1 - u)})` : `rgba(255,255,255,${0.7 * (1 - u)})`;
        c.beginPath(); c.arc(q.x, q.y, q.s * (1 + u * 1.5), 0, TAU); c.fill();
      } else if (q.t === 'chunk') {
        c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
        c.fillStyle = '#1d1b2e'; c.fillRect(-q.s / 2 - 1, -q.s / 2 - 1, q.s + 2, q.s + 2);
        c.fillStyle = q.col; c.fillRect(-q.s / 2, -q.s / 2, q.s, q.s);
        c.restore();
      }
    }
    // fire blobs: dark-red rim pass, then colour pass (white-hot -> yellow -> orange -> red -> soot)
    const fireR = (q, u) => q.s * (0.55 + u * 0.75) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 * 0.6 : 1);
    c.fillStyle = '#7a1f1a';
    c.beginPath();
    for (const q of fx.p) { if (q.t !== 'fire' || q.age < 0) continue; const u = q.age / q.life, rr = fireR(q, u) + 2.5; c.moveTo(q.x + rr, q.y); c.arc(q.x, q.y, rr, 0, TAU); }
    c.fill();
    for (const q of fx.p) {
      if (q.t !== 'fire' || q.age < 0) continue;
      const u = q.age / q.life, rr = fireR(q, u);
      c.fillStyle = u < 0.07 ? '#fff6c8' : u < 0.3 ? '#ffd23f' : u < 0.5 ? '#ff9a1f' : u < 0.72 ? '#f0532a' : '#5b4652';
      c.beginPath(); c.arc(q.x, q.y, rr, 0, TAU); c.fill();
      if (u < 0.5) { c.fillStyle = 'rgba(255,255,230,0.55)'; c.beginPath(); c.arc(q.x - rr * 0.25, q.y - rr * 0.25, rr * 0.45, 0, TAU); c.fill(); }
    }
    // the blast core: layered solid discs that pop out then shrink
    for (const r of fx.rings) {
      if (!r.fill) continue;
      const u = r.t / r.life, k = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7 * 0.5, rad = r.max * (0.35 + 0.75 * Math.sqrt(Math.min(1, u / 0.3))) * k;
      c.globalAlpha = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
      c.fillStyle = '#7a1f1a'; c.beginPath(); c.arc(r.x, r.y, rad + 3, 0, TAU); c.fill();
      c.fillStyle = '#ff8a1a'; c.beginPath(); c.arc(r.x, r.y, rad, 0, TAU); c.fill();
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(r.x, r.y - rad * 0.08, rad * 0.72, 0, TAU); c.fill();
      c.fillStyle = '#fffbe6'; c.beginPath(); c.arc(r.x, r.y - rad * 0.12, rad * 0.42 * (1 - u * 0.6), 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const q of fx.p) {
      if (q.age < 0) continue;
      const u = q.age / q.life;
      if (q.t === 'spark') {
        c.strokeStyle = `rgba(255,220,120,${1 - u})`; c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); c.stroke();
      }
    }
    for (const r of fx.rings) {
      const u = r.t / r.life, rad = r.r + (r.max - r.r) * (1 - Math.pow(1 - u, 3));
      if (r.fill) continue;
      {
        c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - u)})`; c.lineWidth = 6 * (1 - u) + 1;
        c.beginPath(); c.arc(r.x, r.y, rad, 0, TAU); c.stroke();
      }
    }
    c.restore();
  }
  rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
}

// small canvas icons for the weapon picker
export function weaponIcon(id, size = 40) {
  const cv = document.createElement('canvas'); const d = 2;
  cv.width = cv.height = size * d; const c = cv.getContext('2d', { willReadFrequently: true }); c.scale(d, d); // CPU canvas: read back once as a data URL
  const w = WEAPON_BY_ID[id], m = size / 2;
  c.translate(m, m);
  const ink = '#1d1b2e';
  const ball = (x, y, r, col) => { c.fillStyle = ink; c.beginPath(); c.arc(x, y, r + 1.5, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); c.fill(); };
  const bullet = (x, y, r, col, rot = -0.6) => { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = ink; c.beginPath(); c.ellipse(0, 0, r * 1.7 + 1.5, r + 1.5, 0, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, r * 1.7, r, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(r * 0.3, -r * 0.4, r * 0.8, r * 0.3, 0, 0, TAU); c.fill(); c.restore(); };
  switch (id) {
    case 'shell': bullet(0, 0, 6, w.col); break;
    case 'big': bullet(0, 0, 9, '#4a4f5e'); break;
    case 'cluster': ball(0, -6, 6, w.col); ball(-9, 7, 4, w.col); ball(0, 9, 4, w.col); ball(9, 7, 4, w.col); break;
    case 'mirv': for (let k = -2; k <= 2; k++) bullet(k * 6, 4 - Math.abs(k) * 3, 3.2, w.col, -Math.PI / 2 + k * 0.3); break;
    case 'roller': ball(0, 2, 9, w.col); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 2, 5, 0.5, 2.6); c.stroke(); break;
    case 'digger': bullet(-2, 0, 6, w.col, 0.5); c.fillStyle = '#e7e9f0'; c.save(); c.rotate(0.5); c.beginPath(); c.moveTo(18, 0); c.lineTo(9, -6); c.lineTo(9, 6); c.closePath(); c.fill(); c.restore(); break;
    case 'napalm': { const g = c.createRadialGradient(0, 2, 1, 0, 2, 14); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ff8a1a'); g.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 10, 15, 0, 0, TAU); c.fill(); break; }
    case 'bouncer': ball(4, 4, 7, w.col); c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(-14, -10); c.quadraticCurveTo(-6, -16, -2, 0); c.stroke(); c.setLineDash([]); break;
    case 'volcano': c.fillStyle = '#6b4a3a'; c.beginPath(); c.moveTo(-15, 14); c.lineTo(-5, -4); c.lineTo(5, -4); c.lineTo(15, 14); c.closePath(); c.fill(); ball(-6, -10, 3, '#ff7a1a'); ball(4, -14, 3.5, '#d1281f'); ball(9, -6, 2.5, '#ffb01a'); break;
    case 'skipper': ball(-10, 6, 3, w.col); ball(0, -2, 4, w.col); ball(10, 4, 5, w.col); break;
    case 'sniper': bullet(0, 0, 3.5, '#d9b44a', 0); c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.moveTo(-17, 0); c.lineTo(-9, 0); c.moveTo(17, 0); c.lineTo(9, 0); c.stroke(); break;
    case 'nuke': ball(0, 0, 11, w.col); c.fillStyle = ink; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 8, k * 2.094 - 0.5, k * 2.094 + 0.5); c.closePath(); c.fill(); } c.fillStyle = w.col; c.beginPath(); c.arc(0, 0, 2.5, 0, TAU); c.fill(); break;
  }
  return cv;
}
