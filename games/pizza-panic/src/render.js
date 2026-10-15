// Drawing: top-down city with perspective-extruded buildings, vehicles, juice, HUD.
import { P, R, NB, SW, W, rc } from './city.js';
import { avail, comboMult } from './game.js';

const FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const rgb = (c, f = 1, a = 1) => `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`;
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
const heatCol = (h) => h > 70 ? '#ff6b2c' : h > 40 ? '#ffb340' : h > 15 ? '#c8d97a' : '#7fc4ff';

export function draw(ctx, G, cam, w, h, dpr, aim, touch) {
  const s = cam.s, sx = (G.r && G.shake) ? (Math.random() - 0.5) * G.shake : 0, sy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#3d4250'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - cam.x * s + sx), dpr * (h / 2 - cam.y * s + sy));
  const vx0 = cam.x - w / 2 / s - 60, vx1 = cam.x + w / 2 / s + 60, vy0 = cam.y - h / 2 / s - 60, vy1 = cam.y + h / 2 / s + 60;
  const vis = (x0, y0, x1, y1, m = 0) => x1 > vx0 - m && x0 < vx1 + m && y1 > vy0 - m && y0 < vy1 + m;

  ground(ctx, G, vis);
  // skid marks + splat decals
  ctx.lineCap = 'round'; ctx.lineWidth = 4;
  for (const k of G.skids) { const a = Math.max(0, 0.32 - (G.t - k[4]) * 0.03); if (a <= 0) continue; ctx.strokeStyle = `rgba(20,20,26,${a})`; ctx.beginPath(); ctx.moveTo(k[0], k[1]); ctx.lineTo(k[2], k[3]); ctx.stroke(); }
  for (const d of G.decals) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a); ctx.fillStyle = 'rgba(200,60,40,0.75)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(250,215,110,0.85)'; ctx.beginPath(); ctx.ellipse(3, -1, 7, 5, 0.4, 0, 7); ctx.fill(); ctx.restore(); }

  // targets on the ground
  const pz = G.city.pizza, pulse = 0.5 + 0.5 * Math.sin(G.t * 6);
  const needShop = avail(G) < G.cap;
  ctx.strokeStyle = `rgba(255,210,63,${needShop ? 0.55 + pulse * 0.4 : 0.25})`; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -G.t * 40;
  ctx.beginPath(); ctx.arc(pz.x, pz.y, 70, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  for (const o of G.orders) {
    const d = o.door, c = heatCol(o.heat);
    ctx.fillStyle = c; ctx.globalAlpha = 0.18 + pulse * 0.12; ctx.beginPath(); ctx.arc(d.x, d.y, 40, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, 26 + pulse * 6, 0, 7); ctx.stroke();
  }

  // vehicles
  for (const c of G.cars) if (vis(c.rx - 40, c.ry - 40, c.rx + 40, c.ry + 40)) car(ctx, c);
  for (const rv of G.rivals) if (vis(rv.x - 30, rv.y - 30, rv.x + 30, rv.y + 30)) {
    scooter(ctx, rv, G, true);
    if (rv.cool <= 0 && rv.rev > 0) { // wind-up tell: red ring + ! before the ram
      const k = Math.min(1, rv.rev / 0.6); ctx.save(); ctx.strokeStyle = 'rgba(255,70,60,' + (0.4 + 0.5 * k) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(rv.x, rv.y, 34 - k * 10, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ff463c'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', rv.x, rv.y - 30); ctx.restore();
    }
  }
  scooter(ctx, G.p, G, false);
  // flying pizzas
  for (const pr of G.proj) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(pr.x + 4, pr.y + 5, 10, 7, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(pr.x, pr.y - pr.z); ctx.rotate(pr.rot); const k = 1 + pr.z / 60; ctx.scale(k, k); box(ctx, 0, 0, 1); ctx.restore();
  }

  // buildings with shadows
  const blds = G.city.buildings.filter((b) => vis(b.x, b.y, b.x + b.w, b.y + b.h, 160));
  ctx.fillStyle = 'rgba(16,20,40,0.26)'; ctx.beginPath();
  for (const b of blds) { const ox = b.ht * 0.32, oy = b.ht * 0.22; ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w + ox, b.y + oy); ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy); ctx.lineTo(b.x + ox, b.y + b.h + oy); ctx.lineTo(b.x, b.y + b.h); ctx.closePath(); }
  ctx.fill();
  for (const t of G.city.trees) if (vis(t.x - 40, t.y - 40, t.x + 40, t.y + 40)) tree(ctx, t, cam);
  blds.sort((a, b) => Math.hypot(b.x + b.w / 2 - cam.x, b.y + b.h / 2 - cam.y) - Math.hypot(a.x + a.w / 2 - cam.x, a.y + a.h / 2 - cam.y));
  for (const b of blds) building(ctx, b, cam, G);

  // particles
  for (const q of G.parts) {
    const a = 1 - q.t / q.life;
    if (q.kind === 'smoke') { ctx.fillStyle = q.col; ctx.globalAlpha = a * 0.5; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1 + q.t * 2), 0, 7); ctx.fill(); }
    else if (q.kind === 'conf') { ctx.globalAlpha = a; ctx.fillStyle = q.col; ctx.save(); ctx.translate(q.x, q.y - q.t * 30); ctx.rotate(q.rot + q.t * 10); ctx.fillRect(-q.size, -q.size * 0.5, q.size * 2, q.size); ctx.restore(); }
    else { ctx.globalAlpha = a; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (q.kind === 'blob' ? 1.8 : 1), 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  // pins above order doors + pizzeria
  for (const o of G.orders) pin(ctx, o.door.x, o.door.y - 34 - pulse * 6, heatCol(o.heat), '$');
  pin(ctx, pz.x, pz.y - 50 - pulse * 5, '#ffd23f', 'P', needShop ? 1.25 : 0.9);
  // pops
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of G.pops) {
    if (q.t < 0) continue; const k = q.t < 0.12 ? q.t / 0.12 * 1.3 : 1.3 - Math.min(0.3, (q.t - 0.12) * 2);
    ctx.globalAlpha = Math.min(1, (1.3 - q.t) * 3); ctx.font = `${q.size * k}px ${FONT}`;
    ctx.lineWidth = 5; ctx.strokeStyle = '#1b1530'; ctx.strokeText(q.text, q.x, q.y - q.t * 40); ctx.fillStyle = q.col; ctx.fillText(q.text, q.x, q.y - q.t * 40);
  }
  ctx.globalAlpha = 1;
  // aim reticle (mouse)
  if (aim && !touch && G.state === 'play') {
    let ax = aim.x, ay = aim.y, snap = null, bd = G.assist;
    for (const o of G.orders) { const d = Math.hypot(o.door.x - ax, o.door.y - ay); if (d < bd) { bd = d; snap = o; } }
    const can = avail(G) > 0;
    if (snap) { ctx.strokeStyle = '#7dff8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(snap.door.x, snap.door.y, 18 + pulse * 3, 0, 7); ctx.stroke(); ax = snap.door.x; ay = snap.door.y; }
    const dx = ax - G.p.x, dy = ay - G.p.y, dl = Math.hypot(dx, dy), L = Math.min(dl, G.range);
    if (can) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(G.p.x, G.p.y); ctx.lineTo(G.p.x + dx / dl * L, G.p.y + dy / dl * L); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = can ? (dl > G.range ? '#ffb340' : '#ffffff') : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 10, 0, 7); ctx.moveTo(aim.x - 16, aim.y); ctx.lineTo(aim.x - 6, aim.y); ctx.moveTo(aim.x + 6, aim.y); ctx.lineTo(aim.x + 16, aim.y); ctx.moveTo(aim.x, aim.y - 16); ctx.lineTo(aim.x, aim.y - 6); ctx.moveTo(aim.x, aim.y + 6); ctx.lineTo(aim.x, aim.y + 16); ctx.stroke();
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.p.boosting) speedLines(ctx, w, h, G.t);
  arrows(ctx, G, cam, w, h, pulse, needShop);
  hud(ctx, G, w, h, touch);
}

function ground(ctx, G, vis) {
  // lane lines on road strips
  ctx.fillStyle = '#e9e3d6';
  for (let i = 0; i <= NB; i++) {
    const c = rc(i);
    for (let k = 0; k < NB; k++) {
      const a = k * P + R, b = a + P - R;
      if (vis(a, c - 4, b, c + 4)) for (let x = a + 14; x < b - 20; x += 34) ctx.fillRect(x, c - 2, 18, 4);
      if (vis(c - 4, a, c + 4, b)) for (let y = a + 14; y < b - 20; y += 34) ctx.fillRect(c - 2, y, 4, 18);
    }
  }
  // crosswalks
  ctx.fillStyle = 'rgba(240,236,226,0.75)';
  for (let j = 0; j <= NB; j++) for (let i = 0; i <= NB; i++) {
    const x = rc(i), y = rc(j); if (!vis(x - 80, y - 80, x + 80, y + 80)) continue;
    for (let k = -50; k < 50; k += 14) { ctx.fillRect(x + k, y - R / 2 - 14, 8, 12); ctx.fillRect(x + k, y + R / 2 + 2, 8, 12); ctx.fillRect(x - R / 2 - 14, y + k, 12, 8); ctx.fillRect(x + R / 2 + 2, y + k, 12, 8); }
  }
  // blocks: sidewalks, parks, lots
  for (const c of G.city.grid) {
    const bx = c.i * P + R, by = c.j * P + R, bs = P - R;
    if (!vis(bx, by, bx + bs, by + bs)) continue;
    ctx.fillStyle = '#8a8f99'; rr(ctx, bx - 3, by - 3, bs + 6, bs + 6, 14);
    ctx.fillStyle = '#c9c3b8'; rr(ctx, bx, by, bs, bs, 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 20; k < bs; k += 20) { ctx.moveTo(bx + k, by); ctx.lineTo(bx + k, by + SW); ctx.moveTo(bx + k, by + bs - SW); ctx.lineTo(bx + k, by + bs); ctx.moveTo(bx, by + k); ctx.lineTo(bx + SW, by + k); ctx.moveTo(bx + bs - SW, by + k); ctx.lineTo(bx + bs, by + k); }
    ctx.stroke();
    if (c.park) {
      ctx.fillStyle = '#6fb35a'; rr(ctx, bx + SW, by + SW, bs - 2 * SW, bs - 2 * SW, 10);
      ctx.fillStyle = '#7cc266'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(bx + 40 + (k * 53) % 160, by + 50 + (k * 71) % 140, 30, 18, k, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#d8c9a3'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(bx + SW, by + SW); ctx.quadraticCurveTo(bx + bs * 0.7, by + bs * 0.3, bx + bs - SW, by + bs - SW); ctx.stroke();
    } else { ctx.fillStyle = '#a9a39a'; ctx.fillRect(bx + SW, by + SW, bs - 2 * SW, bs - 2 * SW); }
  }
  // doors (awning + mat)
  for (const d of G.city.doors) {
    if (!vis(d.x - 20, d.y - 20, d.x + 20, d.y + 20)) continue;
    const happy = d.happy && G.t - d.happy < 1.5;
    ctx.fillStyle = happy ? '#7dff8a' : d.col;
    if (d.nx) ctx.fillRect(d.x - (d.nx > 0 ? 7 : 2), d.y - 11, 9, 22); else ctx.fillRect(d.x - 11, d.y - (d.ny > 0 ? 7 : 2), 22, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    if (d.nx) ctx.fillRect(d.x - (d.nx > 0 ? 7 : 2), d.y - 11, 9, 3); else ctx.fillRect(d.x - 11, d.y - (d.ny > 0 ? 7 : 2), 3, 9);
  }
}

function building(ctx, b, cam, G) {
  const k = b.ht / 640;
  const up = (x, y) => [x + (x - cam.x) * k, y + (y - cam.y) * k];
  const c = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], t = c.map((p) => up(p[0], p[1]));
  const N = [[0, -1, 0.78], [1, 0, 0.66], [0, 1, 0.9], [-1, 0, 0.72]];
  const floors = Math.max(1, Math.round(b.ht / 26));
  for (let e = 0; e < 4; e++) {
    const a = c[e], bb = c[(e + 1) % 4], n = N[e];
    const mx = (a[0] + bb[0]) / 2, my = (a[1] + bb[1]) / 2;
    if ((cam.x - mx) * n[0] + (cam.y - my) * n[1] <= 0) continue; // only walls that face the camera show
    const ta = t[e], tb = t[(e + 1) % 4];
    ctx.fillStyle = rgb(b.col, n[2]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]); ctx.lineTo(tb[0], tb[1]); ctx.lineTo(ta[0], ta[1]); ctx.closePath(); ctx.fill();
    // window bands
    if (b.kind !== 'pizza') {
      ctx.fillStyle = 'rgba(40,58,92,0.38)';
      for (let f = 0; f < floors; f++) {
        const u0 = (f + 0.3) / floors, u1 = (f + 0.75) / floors, L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
        const p0 = L(a, ta, u0), p1 = L(bb, tb, u0), p2 = L(bb, tb, u1), p3 = L(a, ta, u1);
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#fff3e0'; const L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
      for (let s = 0; s < 10; s += 2) { const p0 = L(a, bb, s / 10), p1 = L(a, bb, (s + 1) / 10), q0 = L(ta, tb, s / 10), q1 = L(ta, tb, (s + 1) / 10), m0 = L(p0, q0, 0.55), m1 = L(p1, q1, 0.55); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q0[0], q0[1]); ctx.fill(); }
    }
  }
  // roof
  ctx.fillStyle = rgb(b.col, 1.04); ctx.beginPath(); t.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
  const rx = t[0][0], ry = t[0][1], rw = t[2][0] - t[0][0], rh = t[2][1] - t[0][1];
  ctx.strokeStyle = rgb(b.col, 0.82); ctx.lineWidth = 4; ctx.strokeRect(rx + 4, ry + 4, rw - 8, rh - 8);
  if (b.kind === 'pizza') {
    ctx.save(); ctx.translate(rx + rw / 2, ry + rh / 2);
    ctx.fillStyle = '#f6c453'; ctx.beginPath(); ctx.arc(0, 0, Math.min(rw, rh) * 0.34, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8833a'; ctx.beginPath(); ctx.arc(0, 0, Math.min(rw, rh) * 0.29, 0, 7); ctx.fill();
    ctx.fillStyle = '#b8322a'; for (let i = 0; i < 7; i++) { const a = i * 0.9 + G.t * 0.4, r = (i % 3 + 1) * 13; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 7, 0, 7); ctx.fill(); }
    ctx.font = `30px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a1410'; ctx.strokeText('PIZZA', 0, rh * 0.36); ctx.fillStyle = '#fff'; ctx.fillText('PIZZA', 0, rh * 0.36);
    ctx.restore(); return;
  }
  // rooftop clutter
  const s = b.seed;
  ctx.fillStyle = rgb(b.col, 0.86);
  if (rw > 50 && rh > 50) { rr(ctx, rx + rw * (0.15 + s * 0.3), ry + rh * (0.2 + (s * 7 % 1) * 0.3), 22, 16, 3); ctx.fillStyle = rgb(b.col, 1.15); rr(ctx, rx + rw * (0.15 + s * 0.3) + 3, ry + rh * (0.2 + (s * 7 % 1) * 0.3) + 3, 16, 5, 2); }
  if (s > 0.45 && rw > 70) { ctx.fillStyle = '#7d8790'; ctx.beginPath(); ctx.arc(rx + rw * 0.7, ry + rh * 0.68, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#9aa4ad'; ctx.beginPath(); ctx.arc(rx + rw * 0.7 - 2, ry + rh * 0.68 - 2, 5, 0, 7); ctx.fill(); }
}

function tree(ctx, t, cam) {
  const k = 30 / 640, x = t.x + (t.x - cam.x) * k, y = t.y + (t.y - cam.y) * k;
  ctx.fillStyle = 'rgba(16,30,20,0.3)'; ctx.beginPath(); ctx.arc(t.x + 8, t.y + 6, t.r, 0, 7); ctx.fill();
  ctx.fillStyle = '#3f8a46'; ctx.beginPath(); ctx.arc(x, y, t.r, 0, 7); ctx.fill();
  ctx.fillStyle = '#56a85a'; ctx.beginPath(); ctx.arc(x - t.r * 0.25, y - t.r * 0.25, t.r * 0.65, 0, 7); ctx.fill();
  ctx.fillStyle = '#74c46c'; ctx.beginPath(); ctx.arc(x - t.r * 0.4, y - t.r * 0.4, t.r * 0.3, 0, 7); ctx.fill();
}

function car(ctx, c) {
  ctx.save(); ctx.translate(c.rx, c.ry); ctx.rotate(c.ra);
  ctx.fillStyle = 'rgba(10,12,24,0.3)'; rr(ctx, -24, -11, 52, 28, 9);
  ctx.fillStyle = '#1c1c22'; for (const [x, y] of [[-17, -14], [11, -14], [-17, 10], [11, 10]]) rr(ctx, x, y, 10, 4, 2);
  ctx.fillStyle = c.col; rr(ctx, -26, -13, 52, 26, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(ctx, -22, -11, 44, 6, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(ctx, -10, -11, 20, 22, 5);
  ctx.fillStyle = '#9fd0ee'; rr(ctx, 6, -10, 8, 20, 3); ctx.fillStyle = '#7fb0d0'; rr(ctx, -16, -9, 5, 18, 2);
  ctx.fillStyle = c.col; rr(ctx, -9, -9, 14, 18, 4);
  ctx.fillStyle = '#fff6c8'; rr(ctx, 22, -11, 4, 5, 2); rr(ctx, 22, 6, 4, 5, 2);
  ctx.fillStyle = c.stun > 0 ? '#ff4040' : '#b02a2a'; rr(ctx, -26, -11, 3, 5, 1); rr(ctx, -26, 6, 3, 5, 1);
  if (c.taxi) { ctx.fillStyle = '#222'; for (let i = 0; i < 4; i++) ctx.fillRect(-6 + i * 3, -2 + (i % 2) * 2, 3, 2); ctx.fillStyle = '#fff'; rr(ctx, -4, -3, 7, 6, 2); }
  ctx.restore();
}

function box(ctx, x, y, layers) {
  for (let i = 0; i < layers; i++) { const o = -i * 2; ctx.fillStyle = i === layers - 1 ? '#f7ead0' : '#dccaa6'; rr(ctx, x - 8 + o, y - 8 + o, 16, 16, 2); }
  const o = -(layers - 1) * 2; ctx.fillStyle = '#d8452f'; ctx.beginPath(); ctx.arc(x + o, y + o, 4, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,40,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x - 8 + o, y - 8 + o, 16, 16);
}

function scooter(ctx, e, G, rival) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a); ctx.scale(1.3, 1.3);
  ctx.fillStyle = 'rgba(10,12,24,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, 21, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#1c1c22'; rr(ctx, -19, -3.5, 9, 7, 3); rr(ctx, 12, -3, 9, 6, 3);
  const body = rival ? '#2b2b33' : '#2fb8a8', trim = rival ? '#e0342c' : '#f4f1e8';
  ctx.fillStyle = body; rr(ctx, -15, -8, 30, 16, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, -12, -7, 24, 4, 2);
  ctx.fillStyle = trim; rr(ctx, 10, -8, 8, 16, 5);
  ctx.fillStyle = '#fff8c8'; ctx.beginPath(); ctx.arc(18, 0, 2.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2a30'; ctx.fillRect(7, -12, 3, 24); ctx.fillStyle = '#111'; ctx.fillRect(6.5, -13, 4, 3); ctx.fillRect(6.5, 10, 4, 3);
  if (!rival) { const n = Math.min(3, avail(G)); if (n > 0) { ctx.save(); ctx.translate(-20, 0); box(ctx, 0, 0, n); ctx.restore(); } }
  else { ctx.fillStyle = '#e0342c'; rr(ctx, -27, -8, 14, 16, 3); ctx.fillStyle = '#fff'; ctx.font = `9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('RAT', -20, 0.5); }
  // rider
  ctx.fillStyle = rival ? '#1a1a1a' : '#e0342c'; ctx.beginPath(); ctx.ellipse(-3, 0, 7, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = rival ? '#3a3a40' : '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill();
  ctx.fillStyle = rival ? '#e0342c' : '#e0342c'; ctx.fillRect(-6, -1.5, 9, 3);
  ctx.fillStyle = '#20263a'; ctx.beginPath(); ctx.arc(1.5, 0, 5, -0.9, 0.9); ctx.fill();
  ctx.restore();
  if (!rival && avail(G) > 0 && G.orders[0] && G.orders[0].heat > 55 && Math.random() < 0.3) G.parts.push({ x: e.x - Math.cos(e.a) * 22, y: e.y - Math.sin(e.a) * 22, vx: (Math.random() - 0.5) * 10, vy: -20, life: 0.8, t: 0, col: 'rgba(255,255,255,0.7)', kind: 'smoke', size: 3 });
}

function pin(ctx, x, y, col, label, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(2, 34, 8, 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 15, Math.PI * 0.8, Math.PI * 0.2); ctx.lineTo(0, 24); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#1b1530'; ctx.stroke();
  ctx.fillStyle = '#1b1530'; ctx.font = `17px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 1);
  ctx.restore();
}

function arrows(ctx, G, cam, w, h, pulse, needShop) {
  const tg = G.orders.map((o) => ({ x: o.door.x, y: o.door.y, col: heatCol(o.heat), l: '$' }));
  if (needShop && (avail(G) === 0)) tg.push({ x: G.city.pizza.x, y: G.city.pizza.y, col: '#ffd23f', l: 'P' });
  const m = 46, top = 74;
  for (const t of tg) {
    const sx = (t.x - cam.x) * cam.s + w / 2, sy = (t.y - cam.y) * cam.s + h / 2;
    if (sx > m && sx < w - m && sy > top && sy < h - m) continue;
    const dx = sx - w / 2, dy = sy - h / 2, kx = (w / 2 - m) / Math.abs(dx || 1e-3), ky = (h / 2 - m) / Math.abs(dy || 1e-3), k = Math.min(kx, ky);
    let ex = w / 2 + dx * k, ey = h / 2 + dy * k; ey = Math.max(top, ey);
    const a = Math.atan2(dy, dx), dist = Math.round(Math.hypot(t.x - G.p.x, t.y - G.p.y) / 10);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = t.col; ctx.strokeStyle = '#1b1530'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20 + pulse * 4, 0); ctx.lineTo(-6, -14); ctx.lineTo(-6, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.font = `14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#1b1530';
    const tx = ex - Math.cos(a) * 26, ty = ey - Math.sin(a) * 26; ctx.strokeText(t.l + ' ' + dist + 'm', tx, ty); ctx.fillStyle = '#fff'; ctx.fillText(t.l + ' ' + dist + 'm', tx, ty);
  }
}

function speedLines(ctx, w, h, t) {
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 26; i++) { const a = i * 2.4 + Math.floor(t * 20) * 0.7, r0 = Math.max(w, h) * (0.42 + (i * 0.13 % 0.15)); ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0); ctx.lineTo(w / 2 + Math.cos(a) * r0 * 1.3, h / 2 + Math.sin(a) * r0 * 1.3); }
  ctx.stroke();
}

function txt(ctx, s, x, y, size, col, align = 'left', stroke = 6) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = stroke; ctx.strokeStyle = '#1b1530'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
}

function hud(ctx, G, w, h, touch) {
  const sm = w < 700;
  // cash vs target
  const bw = sm ? 150 : 230, f = Math.min(1, G.cash / G.target);
  ctx.fillStyle = 'rgba(27,21,48,0.8)'; rr(ctx, 14, 14, bw + 20, 54, 12);
  txt(ctx, '$' + G.cash, 26, 33, sm ? 22 : 26, G.hitTarget ? '#7dff8a' : '#ffd23f', 'left', 5);
  txt(ctx, '/ $' + G.target, 26 + (sm ? 62 : 76) + String(G.cash).length * (sm ? 4 : 6), 34, sm ? 13 : 15, '#d8d2ea', 'left', 4);
  ctx.fillStyle = '#3a3156'; rr(ctx, 24, 52, bw, 8, 4); ctx.fillStyle = G.hitTarget ? '#7dff8a' : '#ffd23f'; rr(ctx, 24, 52, Math.max(8, bw * f), 8, 4);
  // timer
  const tl = Math.max(0, G.time), low = tl < 10;
  const k = low ? 1 + 0.12 * Math.max(0, Math.sin(G.t * 12)) : 1;
  txt(ctx, Math.ceil(tl) + '', w / 2, 40, (sm ? 38 : 48) * k, low ? '#ff5c5c' : '#ffffff', 'center', 8);
  txt(ctx, 'SHIFT ' + G.shift, w / 2, sm ? 70 : 78, 13, '#d8d2ea', 'center', 4);
  // combo
  if (G.combo > 1) { const pz = 1 + Math.max(0, G.comboT - 4.6) * 0.6; txt(ctx, 'x' + comboMult(G).toFixed(1), w - 20, 36, (sm ? 26 : 34) * pz, '#ff5ca8', 'right', 6); txt(ctx, G.combo + ' COMBO', w - 20, 64, 13, '#ffd0ea', 'right', 4); ctx.fillStyle = '#ff5ca8'; rr(ctx, w - 110, 76, 90 * Math.max(0, G.comboT / 5), 4, 2); }
  // bag + boost (bottom-left)
  const by = h - 104;
  const y0 = touch ? 80 : by;
  ctx.fillStyle = 'rgba(27,21,48,0.8)'; rr(ctx, 14, y0, 40 + G.cap * 30, 58, 12);
  const show = G.orders.slice(0, avail(G));
  for (let i = 0; i < G.cap; i++) {
    const x = 28 + i * 30, o = show[i];
    ctx.fillStyle = o ? '#f7ead0' : 'rgba(255,255,255,0.12)'; rr(ctx, x, y0 + 10, 24, 24, 4);
    if (o) { ctx.fillStyle = '#d8452f'; ctx.beginPath(); ctx.arc(x + 12, y0 + 22, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#3a3156'; rr(ctx, x, y0 + 40, 24, 6, 3); ctx.fillStyle = heatCol(o.heat); rr(ctx, x, y0 + 40, Math.max(3, 24 * o.heat / 100), 6, 3); }
  }
  const bx = 14, bwid = sm ? 130 : 170, byy = y0 + 66;
  ctx.fillStyle = 'rgba(27,21,48,0.8)'; rr(ctx, bx, byy, bwid, 20, 10);
  ctx.fillStyle = G.p.boosting ? '#ffffff' : '#5cd6ff'; rr(ctx, bx + 4, byy + 4, Math.max(6, (bwid - 8) * G.p.boost / G.p.tank), 12, 6);
  txt(ctx, 'BOOST', bx + bwid / 2, byy + 10, 11, '#ffffff', 'center', 3);
  // first-seconds hint
  if (G.t < 9 && !touch && !G.bot) { ctx.globalAlpha = Math.min(1, (9 - G.t) / 1.5); txt(ctx, 'WASD drive  -  SPACE drift  -  SHIFT boost  -  CLICK throw pizza at the glowing doors', w / 2, h - 30, sm ? 12 : 16, '#ffffff', 'center', 5); ctx.globalAlpha = 1; }
  if (G.t < 9 && touch) { ctx.globalAlpha = Math.min(1, (9 - G.t) / 1.5); txt(ctx, 'Left thumb: steer  -  tap right side: throw', w / 2, h - 150, 14, '#ffffff', 'center', 5); ctx.globalAlpha = 1; }
  // banner
  if (G.banner) {
    const b = G.banner, a = Math.min(1, b.t * 3), sc = 1 + Math.max(0, b.t - (b.t > 1 ? b.t - 0.15 : 0)) * 0;
    const age = (b.age = (b.age || 0) + 1 / 60), pop = age < 0.15 ? 0.6 + age / 0.15 * 0.6 : 1.2 - Math.min(0.2, (age - 0.15) * 1.2);
    ctx.globalAlpha = a; txt(ctx, b.text, w / 2, h * 0.3, (sm ? 40 : 64) * pop * sc, b.col, 'center', 10);
    if (b.sub) txt(ctx, b.sub, w / 2, h * 0.3 + (sm ? 36 : 50), sm ? 14 : 18, '#ffffff', 'center', 5);
    ctx.globalAlpha = 1;
  }
}
