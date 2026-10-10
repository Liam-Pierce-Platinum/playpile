// The arena: snow depth grid + painted ground/snow canvases, and every solid
// thing (walls, trees, snowmen, sheds, posts, rolled balls) with the
// collision and line-of-sight queries the kids and snowballs use.
export const W = 1600, H = 1000, CELL = 16, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL), EDGE = 46;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function segPoint(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / L, 0, 1);
  const cx = x1 + dx * t, cy = y1 + dy * t;
  return { cx, cy, d: Math.hypot(px - cx, py - cy), t };
}
// how tall each thing is, for snowballs flying past (flat throws fly at z 18)
export const H3 = { shed: 64, greenhouse: 52, hedge: 36, bench: 12, bed: 12, frame: 0, compost: 30 };
export const POST_H = { lamp: 120, bath: 30, bin: 26, bandstand: 120, scarecrow: 70, hoop: 120 };
export const WALL_MAX = 5, WALL_R = 12;
export const wallHeight = (wl) => wl.build * (9 + 17 * wl.hp / wl.max);
const SNOW_LIP = '#a2b2da';

export class World {
  constructor(map, mode) {
    this.map = map;
    this.mode = mode;
    const R = this.R = rng(map.seed || 7);
    this.walls = []; this.trees = []; this.snowmen = []; this.rects = []; this.posts = []; this.balls = [];
    this.decor = map.decor || [];
    this.ice = map.ice || [];
    this.hill = map.hill || null;
    this.fort = map.fort || { x: W / 2, y: H / 2, r: 125 };
    for (const wl of map.walls || []) this.addWall(wl.x1, wl.y1, wl.x2, wl.y2, null, true);
    if (mode === 'king') this.buildFort();
    for (const [x, y, s] of map.trees || []) this.trees.push({ x, y, s, snow: 1, shake: 0 });
    for (const [x, y] of map.snowmen || []) this.snowmen.push({ x, y, r: 22, hp: 8, max: 8, shake: 0, seed: R() * 9 });
    for (const r of map.rects || []) this.rects.push({ ...r, h3: H3[r.kind] ?? 30 });
    for (const p of map.posts || []) this.posts.push({ ...p, h: POST_H[p.kind] ?? 40 });
    this.lamps = this.posts.filter((p) => p.kind === 'lamp');
    this.depth = new Float32Array(GW * GH);
    this.paint();
  }

  // ------------------------------------------------------------ walls
  addWall(x1, y1, x2, y2, owner, instant) {
    const wl = { x1, y1, x2, y2, r: WALL_R, hp: WALL_MAX, max: WALL_MAX, build: instant ? 1 : 0, owner, seed: Math.random() * 100, shake: 0, dead: false };
    this.walls.push(wl);
    return wl;
  }
  buildFort() {
    const f = this.fort, rr = f.r + 14;
    for (let i = 0; i < 6; i++) {
      const a0 = (i * 60 + 14) * Math.PI / 180, a1 = a0 + 32 * Math.PI / 180;
      this.addWall(f.x + Math.cos(a0) * rr, f.y + Math.sin(a0) * rr * 0.86, f.x + Math.cos(a1) * rr, f.y + Math.sin(a1) * rr * 0.86, null, true);
    }
  }

  // ------------------------------------------------------------ terrain queries
  onIce(x, y) {
    for (const e of this.ice) { const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry; if (dx * dx + dy * dy < 0.94) return true; }
    return false;
  }
  hillH(x, y) {
    const h = this.hill; if (!h) return 0;
    const dx = (x - h.x) / h.rx, dy = (y - h.y) / h.ry, q = dx * dx + dy * dy;
    return q < 1 ? (1 - q) * (1 - q) : 0;
  }
  // downhill push (px/s^2 per unit strength)
  hillForce(x, y) {
    const h = this.hill; if (!h) return null;
    const dx = (x - h.x) / h.rx, dy = (y - h.y) / h.ry, q = dx * dx + dy * dy;
    if (q >= 1 || q < 0.0004) return null;
    const k = 4 * (1 - q);
    return { x: k * dx / h.rx * 420, y: k * dy / h.ry * 420 };
  }
  cell(x, y) { const cx = (x / CELL) | 0, cy = (y / CELL) | 0; if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return -1; return cy * GW + cx; }
  snowAt(x, y) { const i = this.cell(x, y); return i < 0 ? 0 : this.depth[i]; }
  // best snow within r (for scooping where you stand)
  snowNear(x, y, r = 20) {
    let best = 0;
    for (let oy = -r; oy <= r; oy += CELL) for (let ox = -r; ox <= r; ox += CELL) best = Math.max(best, this.snowAt(x + ox, y + oy));
    return best;
  }

  // ------------------------------------------------------------ painting
  paint() {
    const m = this.map;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    this.ground = mk(); this.snow = mk(); this.lip = mk(); this.props = mk(); this.front = mk(); this.light = mk();
    const R = this.R;
    // ground: dark wintry grass + paths / tarmac / ice
    const g = this.ground.getContext('2d');
    g.fillStyle = '#6f8a62'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? 'rgba(40,70,45,.35)' : 'rgba(150,170,110,.25)'; g.fillRect(R() * W, R() * H, 2, 4 + R() * 4); }
    for (const s of m.noSnow || []) this.paintFloor(g, s);
    for (const e of this.ice) this.paintIce(g, e);
    for (const d of this.decor) if (d.kind === 'court') this.paintCourt(g, d);
    for (const d of this.decor) if (d.kind === 'hopscotch') this.paintHop(g, d.x, d.y);

    // snow: per-pixel crunchy grain on a soft drift field
    const sc = this.snow.getContext('2d');
    const img = sc.createImageData(W, H), px = img.data;
    const NS = 56, nw = Math.ceil(W / NS) + 2, nh = Math.ceil(H / NS) + 2, nz = new Float32Array(nw * nh);
    for (let i = 0; i < nz.length; i++) nz[i] = R();
    const NS2 = 17, nw2 = Math.ceil(W / NS2) + 2, nh2 = Math.ceil(H / NS2) + 2, nz2 = new Float32Array(nw2 * nh2);
    for (let i = 0; i < nz2.length; i++) nz2[i] = R();
    const sm = (t) => t * t * (3 - 2 * t);
    const noise = (arr, w2, s, x, y) => {
      const fx = x / s, fy = y / s, ix = fx | 0, iy = fy | 0, tx = sm(fx - ix), ty = sm(fy - iy);
      const a = arr[iy * w2 + ix], b = arr[iy * w2 + ix + 1], c = arr[(iy + 1) * w2 + ix], d = arr[(iy + 1) * w2 + ix + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    let seed = (m.seed * 7919) >>> 0;
    const fast = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = noise(nz, nw, NS, x, y) * 0.7 + noise(nz2, nw2, NS2, x, y) * 0.3;
        const s = (n - 0.5) * 26;
        const gr = (fast() - 0.5) * 9;
        let r = 244 - s * 1.1 + gr, gg = 247 - s * 0.85 + gr, b = 253 - s * 0.3 + gr * 0.6;
        const k = fast();
        if (k < 0.0016) { r = gg = b = 255; } else if (k < 0.006) { r -= 26; gg -= 20; b -= 8; }
        const o = (y * W + x) * 4;
        px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    sc.putImageData(img, 0, 0);
    // wind ripples
    sc.strokeStyle = 'rgba(150,165,210,.16)'; sc.lineWidth = 2;
    for (let i = 0; i < 120; i++) {
      const x = R() * W, y = R() * H, L = 20 + R() * 50;
      sc.beginPath(); sc.moveTo(x, y); sc.quadraticCurveTo(x + L / 2, y - 4 - R() * 4, x + L, y); sc.stroke();
    }
    if (this.hill) this.paintHill(sc);
    // cut out the clear ground
    for (const s of m.noSnow || []) this.carve(sc, s);
    for (const d of m.drifts || []) this.drift(sc, d[0], d[1], d[2], d[3]);
    for (const r of this.rects) if (r.kind !== 'frame') { sc.save(); sc.globalCompositeOperation = 'destination-out'; sc.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8); sc.restore(); }
    // lip = the snow's front face, seen through every hole
    const lc = this.lip.getContext('2d');
    lc.drawImage(this.snow, 0, 0); lc.globalCompositeOperation = 'source-in'; lc.fillStyle = SNOW_LIP; lc.fillRect(0, 0, W, H); lc.globalCompositeOperation = 'source-over';
    // depth grid from the snow alpha
    const a = sc.getImageData(0, 0, W, H).data;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const x = Math.min(W - 1, cx * CELL + 8), y = Math.min(H - 1, cy * CELL + 8);
      this.depth[cy * GW + cx] = a[(y * W + x) * 4 + 3] / 255;
    }
    this.paintProps();
    this.paintLight();
  }
  paintFloor(g, s) {
    const R = this.R;
    g.save();
    if (s.t === 'ell') { g.restore(); return; }
    if (s.kind === 'tarmac') {
      g.fillStyle = '#6a6e7d'; g.fillRect(s.x, s.y, s.w, s.h);
      for (let i = 0; i < s.w * s.h / 90; i++) { g.fillStyle = R() < 0.5 ? 'rgba(30,30,45,.25)' : 'rgba(200,200,215,.18)'; g.fillRect(s.x + R() * s.w, s.y + R() * s.h, 2, 2); }
      g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(s.x + R() * s.w, s.y + R() * s.h, 30 + R() * 60, 12 + R() * 20, 0, 0, 7); g.fill(); }
    } else if (s.kind === 'patio') {
      g.fillStyle = '#8f8479'; g.fillRect(s.x, s.y, s.w, s.h);
      g.strokeStyle = '#6f645b'; g.lineWidth = 3;
      for (let y = s.y; y < s.y + s.h; y += 36) for (let x = s.x + ((y / 36) % 2 ? 18 : 0); x < s.x + s.w; x += 52) { g.fillStyle = R() < 0.5 ? '#9a8f84' : '#877c71'; g.fillRect(x + 2, y + 2, 48, 32); g.strokeRect(x + 2, y + 2, 48, 32); }
    } else if (s.kind === 'stones') {
      g.fillStyle = '#6f8a62'; g.fillRect(s.x, s.y, s.w, s.h);
      for (let y = s.y + 10; y < s.y + s.h; y += 44) { g.fillStyle = '#968b80'; g.strokeStyle = '#6f645b'; g.lineWidth = 3; g.beginPath(); g.ellipse(s.x + s.w / 2 + (R() - 0.5) * 8, y + 12, 20, 14, 0, 0, 7); g.fill(); g.stroke(); }
    } else {
      g.fillStyle = '#8a7c6c'; g.fillRect(s.x, s.y, s.w, s.h);
      for (let i = 0; i < s.w * s.h / 50; i++) { g.fillStyle = R() < 0.5 ? 'rgba(60,45,35,.35)' : 'rgba(190,175,160,.35)'; g.fillRect(s.x + R() * s.w, s.y + R() * s.h, 3, 3); }
    }
    g.restore();
  }
  paintIce(g, e) {
    const R = this.R;
    g.save();
    g.beginPath(); g.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, 7);
    const gr = g.createLinearGradient(e.x - e.rx, e.y - e.ry, e.x + e.rx, e.y + e.ry);
    gr.addColorStop(0, '#c9ecf7'); gr.addColorStop(0.5, '#9fd0e8'); gr.addColorStop(1, '#7fb2d8');
    g.fillStyle = gr; g.fill(); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
    for (let i = 0; i < 9; i++) { const x = e.x - e.rx + R() * e.rx * 2, y = e.y - e.ry + R() * e.ry * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 50 + R() * 90, y - 16 - R() * 20); g.stroke(); }
    g.strokeStyle = 'rgba(70,120,170,.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      let x = e.x + (R() - 0.5) * e.rx * 1.4, y = e.y + (R() - 0.5) * e.ry * 1.4;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 70; y += (R() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,220,200,.22)'; g.beginPath(); g.ellipse(e.x - e.rx * 0.35, e.y - e.ry * 0.3, e.rx * 0.35, e.ry * 0.18, -0.3, 0, 7); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(60,90,140,.4)'; g.lineWidth = 6; g.beginPath(); g.ellipse(e.x, e.y + 3, e.rx, e.ry, 0, 0, 7); g.stroke();
  }
  paintCourt(g, d) {
    g.save(); g.strokeStyle = 'rgba(245,235,180,.55)'; g.lineWidth = 4;
    g.strokeRect(d.x + 40, d.y + 40, d.w - 80, d.h - 80);
    g.beginPath(); g.moveTo(d.x + d.w / 2, d.y + 40); g.lineTo(d.x + d.w / 2, d.y + d.h - 40); g.stroke();
    g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, 80, 0, 7); g.stroke();
    g.restore();
  }
  paintHop(g, x, y) {
    g.save(); g.strokeStyle = 'rgba(255,240,160,.7)'; g.lineWidth = 3; g.fillStyle = 'rgba(255,240,160,.7)'; g.font = '700 18px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cells = [[0, 0], [0, -1], [-0.5, -2], [0.5, -2], [0, -3], [-0.5, -4], [0.5, -4], [0, -5]];
    cells.forEach(([cx, cy], i) => { g.strokeRect(x + cx * 40 - 20, y + cy * 34 - 17, 40, 34); g.fillText(String(i + 1), x + cx * 40, y + cy * 34); });
    g.restore();
  }
  paintHill(sc) {
    const h = this.hill;
    sc.save(); sc.globalCompositeOperation = 'source-atop';
    let gr = sc.createRadialGradient(h.x - h.rx * 0.28, h.y - h.ry * 0.32, 10, h.x - h.rx * 0.2, h.y - h.ry * 0.2, h.rx * 0.9);
    gr.addColorStop(0, 'rgba(255,250,240,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    sc.fillStyle = gr; sc.fillRect(0, 0, W, H);
    gr = sc.createRadialGradient(h.x + h.rx * 0.45, h.y + h.ry * 0.5, 10, h.x + h.rx * 0.3, h.y + h.ry * 0.35, h.rx * 0.95);
    gr.addColorStop(0, 'rgba(105,118,190,.55)'); gr.addColorStop(1, 'rgba(110,125,190,0)');
    sc.fillStyle = gr; sc.fillRect(0, 0, W, H);
    sc.strokeStyle = 'rgba(120,135,195,.09)'; sc.lineWidth = 2;
    for (let k = 1; k <= 4; k++) { const f = Math.sqrt(1 - Math.sqrt(k / 5)); sc.beginPath(); sc.ellipse(h.x, h.y, h.rx * (1 - f * 0.9) + 0, h.ry * (1 - f * 0.9), 0, 0, 7); sc.stroke(); }
    sc.restore();
  }
  carve(sc, s) {
    const R = this.R;
    sc.save(); sc.globalCompositeOperation = 'destination-out';
    sc.beginPath();
    if (s.t === 'ell') sc.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, 7); else sc.rect(s.x, s.y, s.w, s.h);
    sc.fill(); sc.restore();
    // ragged banked edge
    sc.save(); sc.fillStyle = '#eef2fb';
    const per = s.t === 'ell' ? Math.PI * (s.rx + s.ry) : (s.w + s.h) * 2;
    const n = Math.floor(per / 9);
    for (let i = 0; i < n; i++) {
      let x, y;
      if (s.t === 'ell') { const a = (i / n) * 6.283; x = s.x + Math.cos(a) * s.rx; y = s.y + Math.sin(a) * s.ry; } else {
        let d = (i / n) * per;
        if (d < s.w) { x = s.x + d; y = s.y; } else if ((d -= s.w) < s.h) { x = s.x + s.w; y = s.y + d; } else if ((d -= s.h) < s.w) { x = s.x + s.w - d; y = s.y + s.h; } else { d -= s.w; x = s.x; y = s.y + s.h - d; }
      }
      if (x < 2 || y < 2 || x > W - 2 || y > H - 2) continue;
      sc.beginPath(); sc.arc(x + (R() - 0.5) * 6, y + (R() - 0.5) * 6, 3 + R() * 6, 0, 7); sc.fill();
    }
    if (s.kind === 'ice') { sc.fillStyle = 'rgba(240,245,252,.7)'; for (let i = 0; i < 26; i++) { const a = R() * 6.28, f = 0.86 + R() * 0.12; sc.beginPath(); sc.ellipse(s.x + Math.cos(a) * s.rx * f, s.y + Math.sin(a) * s.ry * f, 6 + R() * 14, 2 + R() * 4, a + 1.57, 0, 7); sc.fill(); } }
    sc.restore();
  }
  drift(sc, x, y, rx, ry) {
    const R = this.R;
    sc.save(); sc.fillStyle = '#f0f4fc';
    sc.beginPath(); sc.ellipse(x, y, rx, ry, 0, 0, 7); sc.fill();
    for (let i = 0; i < 16; i++) { const a = R() * 6.28; sc.beginPath(); sc.arc(x + Math.cos(a) * rx * 0.9, y + Math.sin(a) * ry * 0.9, 6 + R() * 10, 0, 7); sc.fill(); }
    sc.fillStyle = 'rgba(160,175,215,.25)'; for (let i = 0; i < 30; i++) sc.fillRect(x + (R() - 0.5) * rx * 1.5, y + (R() - 0.5) * ry * 1.5, 2, 2);
    sc.restore();
  }
  paintProps() {
    // low, static stuff baked once: shadows of fixed things, bushes, reeds, sledges, fences
    const p = this.props.getContext('2d'), R = this.R;
    p.fillStyle = 'rgba(52,60,128,.22)';
    for (const t of this.trees) { p.beginPath(); p.ellipse(t.x + 44 * t.s, t.y + 4, 62 * t.s, 16 * t.s, -0.08, 0, 7); p.fill(); }
    for (const r of this.rects) if (r.kind !== 'frame') { p.save(); p.transform(1, 0, -0.9, 0.35, 0, 0); p.restore(); p.beginPath(); p.moveTo(r.x + r.w, r.y + r.h); p.lineTo(r.x + r.w + r.h3 * 0.9, r.y + r.h - 4); p.lineTo(r.x + r.w + r.h3 * 0.9, r.y + 4); p.lineTo(r.x + r.w, r.y); p.fill(); p.fillRect(r.x + 6, r.y + r.h, r.w + r.h3 * 0.5, 8); }
    for (const q of this.posts) { const L = q.kind === 'bandstand' ? 120 : q.h * 0.6; p.beginPath(); p.ellipse(q.x + L * 0.5, q.y + 3, Math.max(q.r, 6) + L * 0.5, Math.max(q.r * 0.4, 5), 0, 0, 7); p.fill(); }
    for (const d of this.decor) {
      if (d.kind === 'bush') drawBush(p, d.x, d.y, R);
      else if (d.kind === 'reeds') drawReeds(p, d.x, d.y, R);
      else if (d.kind === 'sledge') drawSledge(p, d.x, d.y, d.a);
    }
    drawFence(p, false);
    drawFence(this.front.getContext('2d'), true);
  }
  paintLight() {
    const l = this.light.getContext('2d');
    const warm = mix(this.map.light[0], '#ffffff', 0.08), cool = this.map.light[1];
    const gr = l.createLinearGradient(0, 0, W * 0.9, H);
    gr.addColorStop(0, warm); gr.addColorStop(0.45, mix(warm, '#f2b6cf', 0.6)); gr.addColorStop(1, cool);
    l.fillStyle = gr; l.fillRect(0, 0, W, H);
    // low sun glow from the top-left, added with 'screen'
    this.glow = document.createElement('canvas'); this.glow.width = W / 4; this.glow.height = H / 4;
    const gl = this.glow.getContext('2d');
    const sg = gl.createRadialGradient(-20, -30, 10, 0, 0, 330);
    sg.addColorStop(0, 'rgba(255,170,100,.55)'); sg.addColorStop(0.5, 'rgba(255,130,120,.18)'); sg.addColorStop(1, 'rgba(255,130,120,0)');
    gl.fillStyle = sg; gl.fillRect(0, 0, W / 4, H / 4);
    // pools of lamp light lift the multiply back up
    for (const q of this.lamps) {
      const rg = l.createRadialGradient(q.x, q.y - 10, 4, q.x, q.y - 10, 190);
      rg.addColorStop(0, 'rgba(255,236,200,.95)'); rg.addColorStop(1, 'rgba(255,236,200,0)');
      l.fillStyle = rg; l.fillRect(q.x - 200, q.y - 210, 400, 400);
    }
  }

  // ------------------------------------------------------------ snow editing
  dig(x, y, r, amt) {
    let got = 0;
    const r2 = r + CELL * 0.5;
    for (let oy = -r2; oy <= r2; oy += CELL) for (let ox = -r2; ox <= r2; ox += CELL) {
      const d = Math.hypot(ox, oy); if (d > r2) continue;
      const i = this.cell(x + ox, y + oy); if (i < 0) continue;
      const take = Math.min(this.depth[i], amt * (1 - d / (r2 + 1)) * 1.2);
      this.depth[i] -= take; got += take;
    }
    if (got <= 0.001) return 0;
    for (const c of [this.snow.getContext('2d'), this.lip.getContext('2d')]) {
      c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = `rgba(0,0,0,${clamp(amt, 0.05, 1)})`;
      c.beginPath(); c.arc(x, y, r * 0.8, 0, 7); c.fill();
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.28; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.4, r * (0.35 + Math.random() * 0.25), 0, 7); c.fill(); }
      c.restore();
    }
    return got;
  }
  // a scooped patch: dug hole with a thrown-up rim
  scoop(x, y) {
    const got = this.dig(x, y, 13, 0.55);
    const c = this.snow.getContext('2d');
    c.save(); c.fillStyle = '#fbfdff';
    for (let k = 0; k < 7; k++) { const a = Math.random() * 6.28; c.beginPath(); c.arc(x + Math.cos(a) * 15, y + Math.sin(a) * 12, 2 + Math.random() * 3, 0, 7); c.fill(); }
    c.restore();
    return got;
  }
  addSnow(x, y, r, bright) {
    const R = Math.random;
    for (const [c, col] of [[this.lip.getContext('2d'), SNOW_LIP], [this.snow.getContext('2d'), bright ? '#ffffff' : '#eef2fb']]) {
      c.save(); c.fillStyle = col;
      c.beginPath(); c.arc(x, y, r * 0.7, 0, 7); c.fill();
      for (let k = 0; k < 6; k++) { const a = R() * 6.28, d = r * (0.4 + R() * 0.5); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.2 + R() * 0.25), 0, 7); c.fill(); }
      c.restore();
    }
    for (let oy = -r; oy <= r; oy += CELL) for (let ox = -r; ox <= r; ox += CELL) { if (Math.hypot(ox, oy) > r) continue; const i = this.cell(x + ox, y + oy); if (i >= 0 && !this.onIce(x + ox, y + oy)) this.depth[i] = Math.min(1, this.depth[i] + 0.5); }
  }
  // a little star-shaped splat where a snowball lands
  splat(x, y, s = 1) {
    if (x < 0 || y < 0 || x > W || y > H) return;
    for (const [c, col] of [[this.lip.getContext('2d'), SNOW_LIP], [this.snow.getContext('2d'), '#ffffff']]) {
      c.save(); c.fillStyle = col; c.translate(x, y);
      c.beginPath(); c.ellipse(0, 0, 7 * s, 5 * s, 0, 0, 7); c.fill();
      for (let k = 0; k < 6; k++) { const a = Math.random() * 6.28, d = (7 + Math.random() * 7) * s; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d * 0.75, (1.2 + Math.random() * 2) * s, 0, 7); c.fill(); }
      c.restore();
    }
  }
  footprint(x, y, ang, side) {
    if (this.snowAt(x, y) < 0.25) return;
    const c = this.snow.getContext('2d');
    c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(105,125,185,.3)';
    c.translate(x + Math.cos(ang + 1.57) * side * 5, y + Math.sin(ang + 1.57) * side * 5); c.rotate(ang);
    c.beginPath(); c.ellipse(0, 0, 5, 3.2, 0, 0, 7); c.fill(); c.restore();
  }

  // ------------------------------------------------------------ collision
  // push a circle (kid or big ball) out of everything solid. skip = an object to ignore
  push(e, r, skip) {
    let hit = null;
    const lo = EDGE + r * 0.4, hiX = W - EDGE - r * 0.4, hiY = H - EDGE - r * 0.2, loY = EDGE + 6 + r * 0.3;
    if (e.x < lo) { e.x = lo; e.vx = Math.max(0, e.vx); hit = 'edge'; }
    if (e.x > hiX) { e.x = hiX; e.vx = Math.min(0, e.vx); hit = 'edge'; }
    if (e.y < loY) { e.y = loY; e.vy = Math.max(0, e.vy); hit = 'edge'; }
    if (e.y > hiY) { e.y = hiY; e.vy = Math.min(0, e.vy); hit = 'edge'; }
    for (const wl of this.walls) {
      if (wl.dead || wl.build < 0.3 || wl === skip) continue;
      const s = segPoint(e.x, e.y, wl.x1, wl.y1, wl.x2, wl.y2), m = wl.r + r;
      if (s.d < m) { const nx = s.d > 0.01 ? (e.x - s.cx) / s.d : 0, ny = s.d > 0.01 ? (e.y - s.cy) / s.d : 1; e.x = s.cx + nx * m; e.y = s.cy + ny * m; const vn = e.vx * nx + e.vy * ny; if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; } hit = wl; }
    }
    const circ = (cx, cy, cr, obj) => {
      const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy), m = cr + r;
      if (d < m && obj !== skip) { const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : 1; e.x = cx + nx * m; e.y = cy + ny * m; const vn = e.vx * nx + e.vy * ny; if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; } hit = obj; }
    };
    for (const t of this.trees) circ(t.x, t.y, 12 * t.s, t);
    for (const p of this.posts) circ(p.x, p.y, p.r, p);
    for (const s of this.snowmen) if (s.hp > 0) circ(s.x, s.y, s.r, s);
    for (const b of this.balls) if (b !== e && !b.dead) circ(b.x, b.y, b.r * 0.9, b);
    for (const q of this.rects) {
      const cx = clamp(e.x, q.x, q.x + q.w), cy = clamp(e.y, q.y, q.y + q.h), dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
      if (d < r) {
        if (d > 0.01) { e.x = cx + dx / d * r; e.y = cy + dy / d * r; const nx = dx / d, ny = dy / d, vn = e.vx * nx + e.vy * ny; if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; } } else {
          // centre inside: shove out the short way
          const l = e.x - q.x, rr = q.x + q.w - e.x, t = e.y - q.y, b = q.y + q.h - e.y, m = Math.min(l, rr, t, b);
          if (m === l) e.x = q.x - r; else if (m === rr) e.x = q.x + q.w + r; else if (m === t) e.y = q.y - r; else e.y = q.y + q.h + r;
        }
        hit = q;
      }
    }
    return hit;
  }
  // is a point inside anything tall enough to stop a snowball at height z?
  blockAt(x, y, z, skipBall) {
    if (x < EDGE - 10 || x > W - EDGE + 10 || y < EDGE - 10 || y > H - EDGE + 14) return z < 30 ? { kind: 'edge' } : null;
    for (const wl of this.walls) {
      if (wl.dead || wl.build < 0.3) continue;
      if (z > wallHeight(wl) + 2) continue;
      if (segPoint(x, y, wl.x1, wl.y1, wl.x2, wl.y2).d < wl.r + 3) return { kind: 'wall', o: wl };
    }
    for (const t of this.trees) if (Math.hypot(x - t.x, y - t.y) < 15 * t.s + 3 && z < 110) return { kind: 'tree', o: t };
    for (const p of this.posts) if (z < p.h && Math.hypot(x - p.x, y - p.y) < p.r + 3) return { kind: 'post', o: p };
    for (const s of this.snowmen) if (s.hp > 0 && z < 60 && Math.hypot(x - s.x, y - s.y) < s.r + 4) return { kind: 'snowman', o: s };
    for (const b of this.balls) if (!b.dead && b !== skipBall && z < b.r * 1.7 && Math.hypot(x - b.x, y - b.y) < b.r + 3) return { kind: 'ball', o: b };
    for (const q of this.rects) if (z < q.h3 && x > q.x - 3 && x < q.x + q.w + 3 && y > q.y - 3 && y < q.y + q.h + 3) return { kind: 'rect', o: q };
    return null;
  }
  losClear(x1, y1, x2, y2, z = 18) {
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 14);
    for (let i = 2; i < n - 1; i++) { const t = i / n; if (this.blockAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z)) return false; }
    return true;
  }
  // free spot for a kid of radius r?
  freeAt(x, y, r) {
    if (x < EDGE + r || x > W - EDGE - r || y < EDGE + r || y > H - EDGE - r) return false;
    for (const wl of this.walls) if (!wl.dead && wl.build > 0.3 && segPoint(x, y, wl.x1, wl.y1, wl.x2, wl.y2).d < wl.r + r) return false;
    for (const t of this.trees) if (Math.hypot(x - t.x, y - t.y) < 12 * t.s + r) return false;
    for (const p of this.posts) if (Math.hypot(x - p.x, y - p.y) < p.r + r) return false;
    for (const s of this.snowmen) if (s.hp > 0 && Math.hypot(x - s.x, y - s.y) < s.r + r) return false;
    for (const b of this.balls) if (!b.dead && Math.hypot(x - b.x, y - b.y) < b.r + r) return false;
    for (const q of this.rects) if (x > q.x - r && x < q.x + q.w + r && y > q.y - r && y < q.y + q.h + r) return false;
    return true;
  }
  // things a kid can hide behind: [{x, y, r}]
  coverList() {
    const out = [];
    for (const wl of this.walls) if (!wl.dead && wl.build > 0.5 && wallHeight(wl) > 18) out.push({ x: (wl.x1 + wl.x2) / 2, y: (wl.y1 + wl.y2) / 2, r: Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) / 2 * 0.6 + wl.r, o: wl });
    for (const s of this.snowmen) if (s.hp > 2) out.push({ x: s.x, y: s.y, r: s.r, o: s });
    for (const b of this.balls) if (!b.dead && b.r > 20 && !b.pusher && Math.hypot(b.vx, b.vy) < 20) out.push({ x: b.x, y: b.y, r: b.r, o: b });
    for (const t of this.trees) out.push({ x: t.x, y: t.y, r: 12 * t.s, o: t });
    for (const q of this.rects) if (q.h3 > 25) out.push({ x: q.x + q.w / 2, y: q.y + q.h / 2, r: Math.min(q.w, q.h) / 2, o: q, rect: q });
    for (const p of this.posts) if (p.r > 14 && p.h > 25) out.push({ x: p.x, y: p.y, r: p.r, o: p });
    return out;
  }
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, t)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t)), bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}
function drawBush(c, x, y, R) {
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(52,60,128,.22)'; c.beginPath(); c.ellipse(16, 4, 34, 10, 0, 0, 7); c.fill();
  const blobs = [[-14, -8, 14], [0, -14, 17], [14, -8, 14], [0, -4, 15]];
  c.fillStyle = '#2f5a45'; c.strokeStyle = '#1d3a30'; c.lineWidth = 2;
  for (const [bx, by, br] of blobs) { c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = '#2f5a45'; for (const [bx, by, br] of blobs) { c.beginPath(); c.arc(bx, by, br - 1.5, 0, 7); c.fill(); }
  c.fillStyle = '#f5f8ff';
  for (const [bx, by, br] of blobs) { c.beginPath(); c.ellipse(bx - 2, by - br * 0.45, br * 0.8, br * 0.45, 0, 0, 7); c.fill(); }
  c.fillStyle = '#d23a3a'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc((R() - 0.5) * 34, -6 + (R() - 0.5) * 12, 2.2, 0, 7); c.fill(); }
  c.restore();
}
function drawReeds(c, x, y, R) {
  c.save(); c.translate(x, y); c.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const ox = (R() - 0.5) * 40, h = 22 + R() * 22, lean = (R() - 0.5) * 10;
    c.strokeStyle = '#8a7a4a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ox, 0); c.quadraticCurveTo(ox + lean * 0.5, -h * 0.6, ox + lean, -h); c.stroke();
    if (R() < 0.6) { c.fillStyle = '#5a3d26'; c.beginPath(); c.ellipse(ox + lean, -h, 2.6, 6, lean * 0.03, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(ox + lean, -h - 6, 2.2, 0, 7); c.fill(); }
  }
  c.restore();
}
function drawSledge(c, x, y, a) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.fillStyle = 'rgba(52,60,128,.25)'; c.fillRect(-26, -9, 58, 24);
  c.strokeStyle = '#3a2a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-30, -11); c.lineTo(26, -11); c.quadraticCurveTo(34, -11, 34, -3); c.moveTo(-30, 11); c.lineTo(26, 11); c.quadraticCurveTo(34, 11, 34, 3); c.stroke();
  c.fillStyle = '#d8423a'; c.strokeStyle = '#7a1e1a'; c.lineWidth = 2;
  c.beginPath(); c.roundRect(-26, -9, 50, 18, 4); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(-20, -4); c.lineTo(18, -4); c.stroke();
  c.fillStyle = '#f5f8ff'; c.beginPath(); c.ellipse(-8, 0, 12, 5, 0, 0, 7); c.fill();
  c.restore();
}
function drawFence(c, front) {
  c.save();
  const post = (x, y, h) => {
    c.fillStyle = '#6e4a32'; c.strokeStyle = '#3e2818'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x - 5, y - h, 10, h, 2); c.fill(); c.stroke();
    c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(x, y - h, 7, 4, 0, 0, 7); c.fill();
  };
  const rail = (x1, y1, x2, y2) => { c.strokeStyle = '#3e2818'; c.lineWidth = 7; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = '#835a3e'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#f6f9ff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x1, y1 - 3); c.lineTo(x2, y2 - 3); c.stroke(); };
  if (!front) {
    const y = EDGE - 2;
    rail(EDGE - 10, y - 26, W - EDGE + 10, y - 26); rail(EDGE - 10, y - 12, W - EDGE + 10, y - 12);
    for (let x = EDGE - 10; x <= W - EDGE + 12; x += 56) post(x, y, 34);
    for (const x of [EDGE - 14, W - EDGE + 14]) {
      for (let yy = EDGE; yy < H - EDGE; yy += 50) post(x, yy, 30);
      c.strokeStyle = '#4e3322'; c.lineWidth = 6; c.beginPath(); c.moveTo(x, EDGE - 20); c.lineTo(x, H - EDGE - 18); c.stroke(); c.strokeStyle = '#f6f9ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, EDGE - 22); c.lineTo(x, H - EDGE - 20); c.stroke();
    }
  } else {
    const y = H - EDGE + 26;
    for (let x = EDGE - 10; x <= W - EDGE + 12; x += 56) post(x, y, 30);
    rail(EDGE - 10, y - 22, W - EDGE + 10, y - 22); rail(EDGE - 10, y - 9, W - EDGE + 10, y - 9);
  }
  c.restore();
}
