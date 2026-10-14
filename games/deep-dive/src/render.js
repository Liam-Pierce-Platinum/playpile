// Low-res pixel renderer: ocean, ships, air pockets, creatures, darkness + lights, HUD.
import { TS, clamp, lerp, hash, mix, fmtTime, dist } from './util.js';
import { T, toWorld, tileAt } from './ship.js';
import { S, buildTiles } from './sprites.js';
import { text, textW } from './font.js';
import { TYPES } from './data.js';

const tileSets = {};
function tilesFor(s) { return tileSets[s.type] || (tileSets[s.type] = buildTiles(s.pal, s.type)); }

function drawTile(s, i) {
  const ts = tilesFor(s), c = s.cx2, m = s.mx2;
  const t = s.tiles[i], x = i % s.W, y = (i / s.W) | 0, px = x * TS, py = y * TS;
  c.clearRect(px, py, TS, TS); m.clearRect(px, py, TS, TS);
  const h = hash(x, y, 7), v = (arr) => arr[Math.floor(hash(x, y, 3) * arr.length)];
  let img = null;
  const deck = { fishing: 5, ferry: 7, cargo: 4, cruise: 13, sub: 3, rig: 0 }[s.type];
  if (t === T.HULL) img = s.mask[i] === 2 ? v(ts.bottom) : (y === deck || y === deck + 1) && s.type !== 'rig' ? v(ts.stripe) : y > s.H * 0.74 && s.type !== 'rig' ? v(ts.bottom) : v(ts.hull);
  else if (t === T.WALL) img = v(ts.wall);
  else if (t === T.IN) img = ts.back[h < 0.72 ? 6 + Math.floor(h * 40) % 4 : h < 0.8 ? 1 : h < 0.85 ? 2 : h < 0.89 ? 3 : h < 0.92 ? 4 : h < 0.96 ? 5 : 0];
  else if (t === T.HATCH) img = ts.hatch[0];
  else if (t === T.HOPEN) img = ts.hopen[0];
  else if (t === T.DEBRIS) img = v(ts.debris);
  else if (t === T.WIN) img = ts.win[0];
  else if (t === T.BREACH) img = v(ts.breach);
  if (img) c.drawImage(img, px, py);
  if (t === T.IN || t === T.HOPEN || t === T.WALL || t === T.HATCH || t === T.DEBRIS) { m.fillStyle = '#000'; m.fillRect(px, py, TS, TS); }
}
function ensureShip(s) {
  if (!s.built) {
    s.cv = document.createElement('canvas'); s.cv.width = s.W * TS; s.cv.height = s.H * TS; s.cx2 = s.cv.getContext('2d');
    s.mcv = document.createElement('canvas'); s.mcv.width = s.W * TS; s.mcv.height = s.H * TS; s.mx2 = s.mcv.getContext('2d');
    for (let i = 0; i < s.W * s.H; i++) drawTile(s, i);
    s.built = true; s.dirtyTiles.clear();
  }
  if (s.dirtyTiles.size) { for (const i of s.dirtyTiles) drawTile(s, i); s.dirtyTiles.clear(); }
}

const WATER = ['#2fa6cc', '#1a73a0', '#0f4d78', '#0a3254', '#061d36', '#030d1c'];
function waterAt(y) {
  const t = clamp(y / 820, 0, 0.999) * (WATER.length - 1);
  const i = Math.floor(t), f = Math.round((t - i) * 6) / 6;
  return mix(WATER[i], WATER[i + 1], f);
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.dark = document.createElement('canvas'); this.dctx = this.dark.getContext('2d');
    this.touch = false;
  }
  resize(vw, vh) {
    this.c.width = vw; this.c.height = vh; this.dark.width = vw; this.dark.height = vh;
    this.ctx.imageSmoothingEnabled = false; this.dctx.imageSmoothingEnabled = false;
    this.vw = vw; this.vh = vh;
  }

  draw(w, opt = {}) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh, t = w.t;
    const sh = w.shake > 0.1 ? w.shake : 0;
    const cx = Math.round(w.cam.x + (Math.random() - 0.5) * sh), cy = Math.round(w.cam.y + (Math.random() - 0.5) * sh);
    const X = x => Math.round(x - cx), Y = y => Math.round(y - cy);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // ---- sky + water background (banded)
    for (let sy = 0; sy < vh; sy += 3) {
      const wy = cy + sy;
      ctx.fillStyle = wy < 0 ? mix('#5fb4e8', '#cdeaf6', clamp(Math.round((1 + wy / 120) * 6) / 6, 0, 1)) : waterAt(wy);
      ctx.fillRect(0, sy, vw, 3);
    }
    // sun + clouds above the surface
    if (cy < 0) {
      ctx.fillStyle = '#fff6c8'; ctx.fillRect(Math.round(vw * 0.7), Y(-52), 12, 12);
      for (let k = 0; k < 6; k++) { const bx = ((k * 157 - cx * 0.3 + t * 2) % (vw + 160) + vw + 160) % (vw + 160) - 80, by = Y(-64 + (k % 3) * 15); ctx.fillStyle = '#f4fbff'; ctx.fillRect(Math.round(bx), by, 34, 5); ctx.fillRect(Math.round(bx) + 6, by - 3, 18, 3); ctx.fillStyle = '#d6ebf6'; ctx.fillRect(Math.round(bx), by + 5, 34, 1); }
    }
    // far ridge silhouette (parallax)
    for (let sx = 0; sx < vw; sx += 2) {
      const px = (cx * 0.5 + sx);
      const ry = w.floorBase - 26 - 34 * (0.5 + 0.5 * Math.sin(px * 0.011)) - 14 * Math.sin(px * 0.037 + 2);
      const sy = Math.round(ry - cy * 0.85 - (w.floorBase * 0.15) + 20);
      if (sy < vh) { ctx.fillStyle = mix(waterAt(ry), '#02060e', 0.35); ctx.fillRect(sx, sy, 2, vh - sy); }
    }
    // light shafts
    if (cy < 520) {
      const fade = 1 - clamp(cy, 0, 520) / 520, top = Y(0);
      for (let k = 0; k < 7; k++) {
        const bx = ((k * 83 - cx * 0.6 + Math.sin(t * 0.3 + k) * 14) % (vw + 160) + vw + 160) % (vw + 160) - 40;
        const pulse = 0.75 + 0.25 * Math.sin(t * 0.9 + k * 1.7), wd = 10 + (k % 3) * 5;
        // soft outer shaft + brighter core, both fading with depth
        ctx.fillStyle = `rgba(200,240,255,${0.06 * fade * pulse})`;
        ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx + wd, top); ctx.lineTo(bx - 110 + wd, top + 420); ctx.lineTo(bx - 140, top + 420); ctx.fill();
        ctx.fillStyle = `rgba(230,250,255,${0.07 * fade * pulse})`;
        ctx.beginPath(); ctx.moveTo(bx + 3, top); ctx.lineTo(bx + wd - 3, top); ctx.lineTo(bx - 60 + wd, top + 200); ctx.lineTo(bx - 72, top + 200); ctx.fill();
      }
      // caustic dapple just under the surface
      if (cy < 80) for (let ry = 3; ry < 54; ry += 5) {
        const sy = Y(ry); if (sy < 0 || sy >= vh) continue;
        const a = 0.22 * (1 - ry / 54);
        for (let sx = 0; sx < vw; sx += 3) {
          const wx = cx + sx, v = Math.sin(wx * 0.09 + t * 1.6 + ry * 0.7) + Math.sin(wx * 0.047 - t * 1.1 + ry * 0.3);
          if (v > 1.15) { ctx.fillStyle = `rgba(220,250,255,${a})`; ctx.fillRect(sx, sy, 3, 1); }
        }
      }
    }
    // far kelp
    this.kelp(w, cx, cy, true);
    // ---- ships
    for (const s of w.ships) {
      ensureShip(s);
      ctx.save(); ctx.translate(s.x - cx, s.y - cy); ctx.rotate(s.ang);
      ctx.drawImage(s.cv, -s.W * TS / 2, -s.H * TS / 2);
      ctx.restore();
      this.rooms(w, s, cx, cy);
      // local-space objects
      ctx.save(); ctx.translate(s.x - cx, s.y - cy); ctx.rotate(s.ang);
      for (const e of w.eels) if (e.ship === s) this.eel(e, t);
      for (const c of w.crates) if (c.ship === s) {
        if (c.kind === 'beam') ctx.drawImage(S.beam, Math.round(c.lx - 9), Math.round(c.ly - 3));
        else ctx.drawImage((S[c.kind] || S.crate)[c.c % 4], Math.round(c.lx - 5), Math.round(c.ly - 5));
      }
      for (const wr of w.warns) if (wr.ship === s) { ctx.fillStyle = (t * 8 | 0) % 2 ? '#ff5a3a' : '#ffd24a'; ctx.fillRect(Math.round(wr.lx - 4), Math.round(wr.ly - 5), 8, 1); }
      ctx.restore();
    }
    // fires (upright)
    for (const f of w.fires) if (!f.out && f.wx !== undefined) this.fire(f.wx - cx, f.wy - cy, t, f.ph);
    // ---- seafloor
    for (let sx = 0; sx < vw; sx += 2) {
      const wx = cx + sx, fy = w.floorY(wx), sy = Math.round(fy - cy);
      if (sy >= vh) continue;
      ctx.fillStyle = mix('#8a7650', '#2a2418', clamp(fy / 900, 0, 0.8)); ctx.fillRect(sx, sy, 2, vh - sy);
      ctx.fillStyle = mix('#b8a274', '#3a3424', clamp(fy / 900, 0, 0.8)); ctx.fillRect(sx, sy, 2, 1);
      // moving caustic light on the sand, weaker the deeper the floor
      const ca = 0.3 * (1 - clamp(fy / 700, 0, 1));
      if (ca > 0.02) { const v = Math.sin(wx * 0.08 + t * 1.3) + Math.sin(wx * 0.031 - t * 0.9); if (v > 1.0) { ctx.fillStyle = `rgba(255,250,210,${ca})`; ctx.fillRect(sx, sy, 2, 1 + (v > 1.5 ? 1 : 0)); } }
      for (let k = 0; k < 3; k++) if (hash(Math.floor(wx / 2), k, 4) < 0.3) { ctx.fillStyle = mix('#6a5a3a', '#1a160e', clamp(fy / 900, 0, 0.8)); ctx.fillRect(sx + (k & 1), sy + 2 + k * 3, 1, 1); }
    }
    for (const r of w.rocks) {
      const sx = X(r.x), sy = Y(w.floorY(r.x)); if (sx < -40 || sx > vw + 40 || sy > vh + 20) continue;
      const col = mix('#4a4e58', '#14161c', clamp(w.floorY(r.x) / 900, 0, 0.8));
      ctx.fillStyle = col; ctx.fillRect(sx - (r.w >> 1), sy - r.h + 2, r.w, r.h); ctx.fillRect(sx - (r.w >> 1) + 2, sy - r.h, r.w - 4, 2);
      ctx.fillStyle = mix(col, '#ffffff', 0.15); ctx.fillRect(sx - (r.w >> 1) + 2, sy - r.h, r.w - 6, 1);
    }
    this.kelp(w, cx, cy, false);
    // ---- rescue bell + boat
    const bx = X(w.bell.x), by = Y(w.bell.y), tipx = X(w.boat.x + 25), tipy = Y(-14);
    ctx.fillStyle = '#20262c';
    for (let yy = Math.min(tipy, by); yy < by - 8; yy++) ctx.fillRect(Math.round(lerp(tipx, bx, (yy - tipy) / Math.max(1, by - 8 - tipy))), yy, 1, 1);
    ctx.drawImage(S.bell, bx - 9, by - 9);
    if ((t * 2 | 0) % 2 === 0) { ctx.fillStyle = '#7dff9a'; ctx.fillRect(bx - 1, by - 11, 2, 2); }
    const bob = Math.round(Math.sin(t * 1.6) * 1.2);
    ctx.drawImage(S.boat, X(w.boat.x) - 28, Y(-17) + bob);
    // ---- creatures & people
    for (const sc of w.fish) { for (const f of sc.f) { if (f.x === undefined) continue; const sx = X(f.x), sy = Y(f.y); if (sx < -4 || sx > vw + 4 || sy < -4 || sy > vh + 4) continue; ctx.fillStyle = sc.col; ctx.fillRect(sx, sy, 2, 1); ctx.fillStyle = mix(sc.col, '#000000', 0.5); ctx.fillRect(sx + (sc.vx > 0 ? -1 : 2), sy, 1, 1); } }
    for (const j of w.jellies) { if (j.x === undefined) continue; const sx = X(j.x), sy = Y(j.y); if (sx < -12 || sx > vw + 12 || sy < -16 || sy > vh + 16) continue; ctx.drawImage(S.jelly[Math.floor(j.ph * 3) % 3], sx - 5, sy - 6); }
    for (const k of w.sharks) {
      const sx = X(k.x), sy = Y(k.y); if (sx < -40 || sx > vw + 40 || sy < -20 || sy > vh + 20) continue;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(clamp(k.vy / 120, -0.4, 0.4) * k.dir);
      ctx.drawImage(S.shark[k.mouth > 0 && (t * 6 | 0) % 2 ? 1 : 0][k.dir > 0 ? 0 : 1], -17, -8); ctx.restore();
    }
    const d = w.diver;
    // air lines to towed survivors
    for (const sv of d.towed) this.rope(d.wx - cx + d.face * 2, d.wy - cy - 2, sv.wx - cx, sv.wy - cy, t);
    for (const sv of w.survivors) {
      if (sv.state === 'rescued' || sv.state === 'lost') continue;
      const sx = X(sv.wx), sy = Y(sv.wy); if (sx < -12 || sx > vw + 12 || sy < -16 || sy > vh + 16) continue;
      const fr = sv.state === 'holding' ? 2 : sv.state === 'towed' ? 0 : ((sv.t * 2.5) | 0) % 2;
      const jit = sv.state === 'holding' ? Math.round(Math.sin(t * 30)) : 0;
      ctx.drawImage((sv.face > 0 ? S.surv : S.survFlip)[sv.look][fr], sx - 5 + jit, sy - 7);
    }
    if (w.state !== 'done' && !opt.hideDiver) {
      const blink = d.inv > 0 && (t * 14 | 0) % 2 === 0;
      if (!blink) {
        const st = d.stand || 0;
        ctx.save(); ctx.translate(X(d.wx), Y(d.wy) - Math.round(st * (4 + Math.sin(t * 3) * 0.8))); ctx.rotate((d.tilt * d.face) * (1 - st) - Math.PI / 2 * d.face * st + (w.state === 'blackout' ? 1.2 : 0));
        ctx.drawImage(S.diver[Math.floor(d.anim) % 4][d.face > 0 ? 0 : 1], -12, -6); ctx.restore();
      }
    }
    // particles
    for (const p of w.particles) {
      const sx = X(p.x), sy = Y(p.y); if (sx < -20 || sx > vw + 20 || sy < -20 || sy > vh + 20) continue;
      if (p.k === 'bub') { ctx.fillStyle = p.col || 'rgba(210,245,255,0.85)'; if (p.s > 1) { ctx.fillRect(sx, sy, 2, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy, 1, 1); } else ctx.fillRect(sx, sy, 1, 1); }
      else if (p.k === 'text') { if (p.big) ctx.globalAlpha = clamp(p.life / 0.4, 0, 1); text(ctx, p.text, sx, sy, p.col, p.big ? 2 : 1, 'center'); ctx.globalAlpha = 1; }
      else if (p.k === 'ring') { const rr = Math.round((0.6 - p.life) * 70); ctx.strokeStyle = p.col; ctx.globalAlpha = clamp(p.life / 0.6, 0, 1); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (p.k === 'steam' || p.k === 'smoke') { ctx.globalAlpha = clamp(p.life / 1.5, 0, 0.6); ctx.fillStyle = p.col; ctx.fillRect(sx - 1, sy - 1, p.k === 'smoke' ? 3 : 2, p.k === 'smoke' ? 3 : 2); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = p.col; ctx.fillRect(sx, sy, 1, 1); }
    }
    // marine snow
    ctx.fillStyle = 'rgba(220,240,255,0.35)';
    for (let k = 0; k < 46; k++) {
      const px = ((hash(k, 1) * 600 - cx * 1.1 + t * (2 + hash(k, 3) * 3)) % 600 + 600) % 600, py = ((hash(k, 2) * 400 - cy * 1.1 + t * 4) % 400 + 400) % 400;
      if (cy + py * vh / 400 > 4) ctx.fillRect(Math.round(px * vw / 600), Math.round(py * vh / 400), 1, 1);
    }
    // surface line + current streaks
    if (cy < 6) {
      for (let sx = 0; sx < vw; sx++) { const wx = cx + sx; const wv = Math.round(Math.sin(wx * 0.07 + t * 2.2) * 1.2 + Math.sin(wx * 0.13 - t * 1.3) * 0.7); ctx.fillStyle = 'rgba(40,150,200,0.5)'; ctx.fillRect(sx, Y(0) + wv, 1, 4); ctx.fillStyle = '#d8f6ff'; ctx.fillRect(sx, Y(0) + wv, 1, 1); }
    }
    for (const c of w.currents) {
      for (let k = 0; k < 10; k++) {
        const ph = (t * Math.abs(c.fx) * 0.9 + hash(k, 9, c.x | 0) * c.w) % c.w;
        const x = c.fx > 0 ? c.x + ph : c.x + c.w - ph, y = c.y + hash(k, 7, c.y | 0) * c.h;
        const sx = X(x), sy = Y(y); if (sx < -10 || sx > vw + 10 || sy < 0 || sy > vh) continue;
        ctx.fillStyle = 'rgba(200,240,255,0.35)'; ctx.fillRect(sx, sy, 6, 1);
      }
    }
    // ---- darkness + lights
    this.lights(w, cx, cy);
    // sonar ring
    if (w.sonarRing >= 0) { ctx.strokeStyle = `rgba(120,255,210,${clamp(1 - w.sonarRing / 400, 0, 1)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(d.wx), Y(d.wy), w.sonarRing, 0, Math.PI * 2); ctx.stroke(); }
    if (w.flash > 0) { ctx.fillStyle = `rgba(255,40,40,${w.flash * 0.35})`; ctx.fillRect(0, 0, vw, vh); }
    if (!opt.noHud) this.hud(w, cx, cy);
  }

  rooms(w, s, cx, cy) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh, t = w.t;
    for (const rm of s.rooms) {
      const [rx, ry] = toWorld(s, rm.cx, rm.cy);
      if (rx - cx < -160 || rx - cx > vw + 160 || ry - cy < -160 || ry - cy > vh + 160) continue;
      ctx.save();
      ctx.translate(s.x - cx, s.y - cy); ctx.rotate(s.ang);
      ctx.beginPath(); for (const [x0, x1, y] of rm.runs) ctx.rect(x0 * TS - s.W * TS / 2, y * TS - s.H * TS / 2, (x1 - x0 + 1) * TS, TS);
      ctx.clip(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rm.air > 0) {
        const wy = Math.round(rm.waterY - cy);
        ctx.fillStyle = 'rgba(255,200,140,0.16)'; ctx.fillRect(0, 0, vw, wy);
        ctx.fillStyle = 'rgba(20,90,150,0.3)'; ctx.fillRect(0, wy, vw, vh - wy);
        const o = (t * 6) | 0;
        for (let x = 0; x < vw; x += 2) { ctx.fillStyle = ((x >> 1) + o) % 4 === 0 ? '#ffffff' : 'rgba(150,225,255,0.8)'; ctx.fillRect(x, wy + (((x >> 3) + o) % 5 === 0 ? -1 : 0), 2, 1); }
        if (rm.air / Math.max(0.01, rm.air0) < 0.3 && (t * 4 | 0) % 2) { ctx.fillStyle = 'rgba(255,60,40,0.08)'; ctx.fillRect(0, 0, vw, wy); }
      } else { ctx.fillStyle = 'rgba(20,90,150,0.3)'; ctx.fillRect(0, 0, vw, vh); }
      ctx.restore();
    }
  }

  eel(e, t) {
    const ctx = this.ctx;
    const px = -e.dy, py = e.dx;
    ctx.fillStyle = '#05070a'; ctx.fillRect(Math.round(e.lx - 2), Math.round(e.ly - 2), 4, 4);
    if (e.ext < 1) { if ((t * 2 + e.ph | 0) % 5) { ctx.fillStyle = '#ffe14a'; ctx.fillRect(Math.round(e.lx - 1 + px), Math.round(e.ly - 1 + py), 1, 1); ctx.fillRect(Math.round(e.lx + px * -1), Math.round(e.ly - py), 1, 1); } return; }
    for (let i = 0; i <= e.ext; i += 1) {
      const wv = Math.sin(i * 0.45 - e.ph) * 1.6 * (i / (e.ext + 1));
      const x = Math.round(e.lx + e.dx * i + px * wv), y = Math.round(e.ly + e.dy * i + py * wv);
      ctx.fillStyle = '#2a3a14'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = i % 4 < 2 ? '#8aa83a' : '#6a8a2a'; ctx.fillRect(x, y - 1, 1, 2);
    }
    const hx = Math.round(e.lx + e.dx * e.ext), hy = Math.round(e.ly + e.dy * e.ext);
    ctx.fillStyle = '#9ab84a'; ctx.fillRect(hx - 2, hy - 2, 4, 4); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(hx + (e.dx >= 0 ? 1 : -2), hy - 1, 1, 1);
    if (e.state === 'hold') { ctx.fillStyle = (t * 20 | 0) % 2 ? '#bff6ff' : '#ffffff'; for (let k = 0; k < 6; k++) ctx.fillRect(hx + Math.round((Math.random() - 0.5) * 14), hy + Math.round((Math.random() - 0.5) * 14), 1, 1); }
  }

  fire(x, y, t, ph) {
    const ctx = this.ctx; x = Math.round(x); y = Math.round(y);
    const f = (t * 12 + ph) | 0;
    const cols = ['#ff3a1a', '#ff7a1a', '#ffb43a', '#fff0a0'];
    for (let k = 0; k < 4; k++) {
      const w = 7 - k * 2, h = 9 - k * 2 + (hash(f, k) < 0.5 ? 1 : 0);
      ctx.fillStyle = cols[k];
      for (let yy = 0; yy < h; yy++) { const ww = Math.max(1, Math.round(w * (1 - yy / h))); const off = Math.round((hash(f, yy, k) - 0.5) * 2); ctx.fillRect(x - (ww >> 1) + off, y + 3 - yy, ww, 1); }
    }
  }

  rope(x0, y0, x1, y1, t) {
    const ctx = this.ctx, n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    ctx.fillStyle = '#ffd84a';
    for (let i = 0; i <= n; i++) { const u = i / n; const sag = Math.sin(u * Math.PI) * 4 + Math.sin(u * 8 + t * 4) * 0.6; ctx.fillRect(Math.round(lerp(x0, x1, u)), Math.round(lerp(y0, y1, u) + sag), 1, 1); }
  }

  kelp(w, cx, cy, far) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh, t = w.t;
    for (const k of w.kelp) {
      if (k.far !== far) continue;
      const px = far ? k.x - cx * 0.25 + cx * 0 : k.x;
      const sx = Math.round((far ? k.x * 1 - cx * 0.75 : k.x - cx));
      const base = w.floorY(k.x) - cy + (far ? -12 : 2);
      if (sx < -30 || sx > vw + 30 || base - k.h > vh || base < -10) continue;
      const col = far ? mix('#1f5a3a', waterAt(w.floorY(k.x)), 0.6) : '#2f7a3a', col2 = far ? col : '#4aa04a';
      for (let i = 0; i < k.h; i += 2) {
        const sway = Math.sin(t * 1.3 + k.ph + i * 0.08) * (i / 14);
        const x = Math.round(sx + sway), y = Math.round(base - i);
        ctx.fillStyle = col; ctx.fillRect(x, y - 2, 2, 2);
        if (!far && i % 8 === 4) { ctx.fillStyle = col2; ctx.fillRect(x + (i % 16 === 4 ? 2 : -2), y - 2, 2, 1); }
      }
    }
  }

  lights(w, cx, cy) {
    const d2 = this.dctx, vw = this.vw, vh = this.vh, t = w.t, d = w.diver;
    d2.globalCompositeOperation = 'source-over'; d2.clearRect(0, 0, vw, vh);
    for (let sy = 0; sy < vh; sy += 4) {
      const wy = cy + sy; const a = clamp(Math.round((0.02 + Math.max(0, wy) / 900) * 16) / 16, 0, 0.92);
      if (a > 0) { d2.fillStyle = `rgba(2,6,18,${a})`; d2.fillRect(0, sy, vw, 4); }
    }
    for (const s of w.ships) { d2.save(); d2.translate(s.x - cx, s.y - cy); d2.rotate(s.ang); d2.globalAlpha = 0.5; d2.drawImage(s.mcv, -s.W * TS / 2, -s.H * TS / 2); d2.restore(); }
    d2.globalCompositeOperation = 'destination-out';
    const lamp = (x, y, r, k = 1) => { x = Math.round(x - cx); y = Math.round(y - cy); if (x < -r || x > vw + r || y < -r || y > vh + r) return; for (const [f, a] of [[1, 0.3], [0.68, 0.32], [0.38, 0.38]]) { d2.fillStyle = `rgba(0,0,0,${a * k})`; d2.beginPath(); d2.arc(x, y, r * f, 0, Math.PI * 2); d2.fill(); } };
    if (w.state !== 'done') {
      lamp(d.wx, d.wy, 18, 0.9);
      const L = w.up.light, ang = d.face > 0 ? clamp(d.aim, -1.3, 1.3) : (d.aim > 0 ? clamp(d.aim, Math.PI - 1.3, Math.PI) : clamp(d.aim, -Math.PI, -Math.PI + 1.3));
      const ox = Math.round(d.wx - cx), oy = Math.round(d.wy - cy);
      const aim = Math.abs(Math.cos(d.aim)) < 0.2 || Math.sign(Math.cos(d.aim)) === d.face ? d.aim : (d.face > 0 ? 0 : Math.PI);
      for (const [f, a] of [[1, 0.3], [0.72, 0.3], [0.45, 0.32]]) { d2.fillStyle = `rgba(0,0,0,${a})`; d2.beginPath(); d2.moveTo(ox, oy); d2.arc(ox, oy, L * f, aim - 0.42, aim + 0.42); d2.closePath(); d2.fill(); }
    }
    lamp(w.bell.x, w.bell.y, 40, 0.9);
    for (const s of w.ships) for (const rm of s.rooms) if (rm.air > 0) { const [x, y] = toWorld(s, rm.cx, rm.top + 4); lamp(x, y, 22, 0.55); }
    for (const f of w.fires) if (!f.out && f.wx !== undefined) lamp(f.wx, f.wy - 2, 30 + Math.sin(t * 17 + f.ph) * 3, 1);
    for (const j of w.jellies) if (j.x !== undefined) lamp(j.x, j.y, 11, 0.6);
    for (const sv of w.survivors) if (sv.state === 'trapped' || sv.state === 'holding' || sv.state === 'towed') lamp(sv.wx, sv.wy, 13, 0.55);
    for (const e of w.eels) if (e.state === 'hold') { const [x, y] = toWorld(e.ship, e.lx + e.dx * e.ext, e.ly + e.dy * e.ext); lamp(x, y, 22, 0.8); }
    for (const p of w.particles) if (p.k === 'spark' || p.k === 'ember') lamp(p.x, p.y, 5, 0.6);
    d2.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.dark, 0, 0);
  }

  arrow(w, cx, cy, tx, ty, col, label, always) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh;
    let sx = tx - cx, sy = ty - cy;
    const m = 12;
    if (sx > m && sx < vw - m && sy > m + 10 && sy < vh - m) {
      if (!always) return;
      const b = Math.round(Math.sin(w.t * 6) * 2);
      ctx.fillStyle = col; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 16 + b, 5, 1); ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 15 + b, 3, 1); ctx.fillRect(Math.round(sx), Math.round(sy) - 14 + b, 1, 1);
      if (label) text(ctx, label, Math.round(sx), Math.round(sy) - 23 + b, col, 1, 'center');
      return;
    }
    const ccx = vw / 2, ccy = vh / 2; const a = Math.atan2(sy - ccy, sx - ccx);
    const k = Math.min((vw / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (vh / 2 - m - 6) / Math.abs(Math.sin(a) || 1e-6));
    const ax = Math.round(ccx + Math.cos(a) * k), ay = Math.max(30, Math.round(ccy + Math.sin(a) * k + 3));
    const tri = (o, c, g) => { const ca = Math.cos(a), sa = Math.sin(a); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(ax + o + ca * (5 + g), ay + o + sa * (5 + g)); ctx.lineTo(ax + o - ca * (3 + g) - sa * (4 + g), ay + o - sa * (3 + g) + ca * (4 + g)); ctx.lineTo(ax + o - ca * (3 + g) + sa * (4 + g), ay + o - sa * (3 + g) - ca * (4 + g)); ctx.closePath(); ctx.fill(); };
    tri(0, '#000', 1.5); tri(0, col, 0);
    if (label) text(ctx, label, clamp(ax - Math.round(Math.cos(a) * 12), 14, vw - 14), clamp(ay - Math.round(Math.sin(a) * 10) - 2, 14, vh - 10), col, 1, 'center');
  }

  hud(w, cx, cy) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh, d = w.diver, t = w.t;
    // arrows
    if (d.towed.length && w.guide) {
      // inside the wreck: a pointer orbiting the diver, aimed along the real way out
      const [gx, gy] = toWorld(w.guide.s, w.guide.lx, w.guide.ly);
      const a = Math.atan2(gy - d.wy, gx - d.wx), r = 15 + Math.sin(t * 7) * 1.5;
      const ax = Math.round(d.wx - cx + Math.cos(a) * r), ay = Math.round(d.wy - cy + Math.sin(a) * r);
      const ca = Math.cos(a), sa = Math.sin(a);
      const tri = (c, g) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(ax + ca * (5 + g), ay + sa * (5 + g)); ctx.lineTo(ax - ca * (3 + g) - sa * (4 + g), ay - sa * (3 + g) + ca * (4 + g)); ctx.lineTo(ax - ca * (3 + g) + sa * (4 + g), ay - sa * (3 + g) - ca * (4 + g)); ctx.closePath(); ctx.fill(); };
      tri('#000', 1.5); tri('#7dff9a', 0);
      text(ctx, 'EXIT', Math.round(ax + ca * 12), Math.round(ay + sa * 10) - 2, '#7dff9a', 1, 'center');
    } else if (d.towed.length) {
      const toBell = dist(d.wx, d.wy, w.bell.x, w.bell.y), toSurf = d.wy;
      if (toBell < toSurf * 1.15) this.arrow(w, cx, cy, w.bell.x, w.bell.y - 6, '#7dff9a', 'BELL', false);
      else this.arrow(w, cx, cy, d.wx, -10, '#7dff9a', 'UP', false);
    }
    for (const sv of w.survivors) {
      if (sv.state !== 'trapped' && sv.state !== 'holding') continue;
      const dd = Math.round(dist(d.wx, d.wy, sv.wx, sv.wy) / TS);
      if (w.sonarT > 0) this.arrow(w, cx, cy, sv.wx, sv.wy, sv.state === 'holding' ? '#ff6a5a' : '#7affd0', w.up.sonar >= 2 ? dd + 'M' : '', true);
      else if (sv.found) this.arrow(w, cx, cy, sv.wx, sv.wy, sv.state === 'holding' ? '#ff6a5a' : 'rgba(255,255,255,0.7)', '', false);
    }
    if (!d.inside && !d.towed.length && w.time < 40 && w.active && w.banner <= 0) {
      const s = w.active; let best = null, bd = 1e9;
      for (const e of s.entries) { const [x, y] = toWorld(s, (e.x + 0.5) * TS - s.W * TS / 2, (e.y + 0.5) * TS - s.H * TS / 2); const dd = dist(x, y, d.wx, d.wy); if (dd < bd) { bd = dd; best = [x, y]; } }
      if (best && bd > 20) this.arrow(w, cx, cy, best[0], best[1], '#ffd24a', 'WAY IN', true);
    }
    // survivor air bars
    for (const sv of w.survivors) {
      if (sv.state !== 'trapped' && sv.state !== 'holding') continue;
      const sx = Math.round(sv.wx - cx), sy = Math.round(sv.wy - cy) - 13;
      if (sx < -10 || sx > vw + 10 || sy < -10 || sy > vh + 10) continue;
      const rm = sv.ship.rooms[sv.room];
      const f = sv.state === 'holding' ? sv.breath / 9 : rm.air / Math.max(0.01, rm.air0);
      const col = sv.state === 'holding' ? ((t * 8 | 0) % 2 ? '#ff3a3a' : '#ffffff') : f > 0.5 ? '#7dff9a' : f > 0.25 ? '#ffd24a' : '#ff5a3a';
      ctx.fillStyle = '#000'; ctx.fillRect(sx - 7, sy - 1, 14, 4);
      ctx.fillStyle = col; ctx.fillRect(sx - 6, sy, Math.max(0, Math.round(12 * clamp(f, 0, 1))), 2);
      if (sv.state === 'holding') text(ctx, Math.ceil(sv.breath) + '', sx, sy - 7, '#ff6a5a', 1, 'center');
    }
    // top-left oxygen
    const f = clamp(d.o2 / d.o2max, 0, 1), low = f < 0.25;
    text(ctx, 'O2', 4, 4, low && (t * 4 | 0) % 2 ? '#ff5a5a' : '#bff6ff');
    ctx.fillStyle = '#000'; ctx.fillRect(15, 3, 66, 7);
    ctx.fillStyle = '#123'; ctx.fillRect(16, 4, 64, 5);
    ctx.fillStyle = f > 0.5 ? '#46e0ff' : f > 0.25 ? '#ffd24a' : '#ff4a3a'; ctx.fillRect(16, 4, Math.round(64 * f), 5);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(16, 4, Math.round(64 * f), 1);
    text(ctx, Math.ceil(d.o2) + '', 84, 4, '#fff');
    text(ctx, Math.max(0, Math.round(d.wy / TS)) + 'M', 4, 13, '#9ad8ff');
    const st = d.atSurface ? 'SURFACE' : d.inBell ? 'BELL: REFILLING' : d.headAir ? 'AIR POCKET' : '';
    if (st) text(ctx, st, 22, 13, '#7dff9a');
    // top-center
    const narrow = vw < 270, tx = narrow ? 4 : vw / 2, ty = narrow ? 22 : 4, al = narrow ? 'left' : 'center';
    if (w.mayday) { text(ctx, 'MAYDAY  WAVE ' + w.wave, tx, ty, '#ff8a7a', 1, al); text(ctx, 'SAVED ' + w.rescued + '   LOST ' + w.lost + '/3', tx, ty + 7, '#fff', 1, al); }
    else { text(ctx, fmtTime(w.time), tx, ty, w.time > w.cfg.mission.par ? '#ffb46a' : '#fff', 1, al); text(ctx, 'PAR ' + fmtTime(w.cfg.mission.par), tx + (narrow ? 22 : 0), ty + (narrow ? 0 : 7), '#6a8aa8', 1, al); }
    // top-right survivors + coins
    const list = w.mayday ? w.survivors.filter(v => v.ship === w.active) : w.survivors;
    let x = vw - 4 - list.length * 7;
    for (const sv of list) {
      const c = { trapped: '#9aa8b8', holding: (t * 6 | 0) % 2 ? '#ff4a4a' : '#ffffff', towed: '#ffd84a', rescued: '#7dff9a', lost: '#6a2a2a' }[sv.state];
      ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(x - 1, 3, 7, 9);
            ctx.fillStyle = c; ctx.fillRect(x + 1, 4, 3, 2); ctx.fillRect(x, 6, 5, 3); ctx.fillRect(x + 1, 9, 1, 2); ctx.fillRect(x + 3, 9, 1, 2);
      if (sv.state === 'lost') { ctx.fillStyle = '#ff3a3a'; for (let k = 0; k < 6; k++) { ctx.fillRect(x + k * 0.8 | 0, 4 + k, 1, 1); ctx.fillRect(x + 4 - (k * 0.8 | 0), 4 + k, 1, 1); } }
      x += 7;
    }
    ctx.drawImage(S.coin, vw - 4 - textW('+' + w.coins) - 10, 14);
    text(ctx, '+' + w.coins, vw - 4, 15, '#ffd84a', 1, 'right');
    // interaction prompt
    const tg = d.target, key = this.touch ? 'HOLD ACT' : 'HOLD E';
    if (w.state === 'play') {
      let label = null;
      if (tg) label = tg.kind === 'surv' ? key + ': GIVE AIR LINE' : tg.kind === 'hatch' ? key + ': OPEN HATCH' : key + ': CUT DEBRIS' + (w.up.cutter < 1.5 ? ' (SLOW)' : '');
      else if (d.towed.length >= w.up.sled && w.survivors.some(sv => (sv.state === 'trapped' || sv.state === 'holding') && dist(sv.wx, sv.wy, d.wx, d.wy) < 17)) label = 'LINE FULL - DELIVER FIRST';
      if (label) {
        const y = vh - 22, tw = textW(label);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(vw / 2 - tw / 2) - 4, y - 3, tw + 8, 15);
        text(ctx, label, vw / 2, y, '#fff', 1, 'center');
        if (tg) { ctx.fillStyle = '#334'; ctx.fillRect(Math.round(vw / 2 - tw / 2), y + 7, tw, 2); ctx.fillStyle = '#7dff9a'; ctx.fillRect(Math.round(vw / 2 - tw / 2), y + 7, Math.round(tw * clamp(d.holdT / tg.need, 0, 1)), 2); }
      }
    }
    // messages
    let my = vw < 270 ? 38 : Math.round(vh * 0.26);
    for (const m of w.msgs) { ctx.globalAlpha = clamp(m.t / 0.4, 0, 1); const mw = textW(m.text); ctx.fillStyle = 'rgba(2,10,22,0.5)'; ctx.fillRect(Math.round(vw / 2 - mw / 2) - 3, my - 2, mw + 6, 9); text(ctx, m.text, vw / 2, my, m.col, 1, 'center'); my += 10; }
    ctx.globalAlpha = 1;
    // banner
    if (w.banner > 0) {
      const a = clamp(w.banner / 0.5, 0, 1); ctx.globalAlpha = a;
      const s = w.active; const name = w.mayday ? 'MAYDAY - WAVE ' + w.wave : w.cfg.mission.name;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, Math.round(vh * 0.6), vw, 34);
      text(ctx, s.label, vw / 2, Math.round(vh * 0.6) + 4, '#9ad8ff', 1, 'center');
      text(ctx, name, vw / 2, Math.round(vh * 0.6) + 12, '#fff', 2, 'center');
      text(ctx, s.survivors.length + ' TRAPPED - GET THEM OUT', vw / 2, Math.round(vh * 0.6) + 25, '#ffd24a', 1, 'center');
      ctx.globalAlpha = 1;
    }
    if (w.time < 9 && !w.mayday && w.cfg.mission.i < 2 && !this.touch) text(ctx, 'WASD SWIM  SHIFT KICK  E ACT  Q SONAR  P PAUSE', vw / 2, vh - 8, 'rgba(255,255,255,0.8)', 1, 'center');
    // low oxygen vignette
    if (f < 0.25 && w.state === 'play') { const a = (0.25 - f) * 1.6 * (0.6 + 0.4 * Math.sin(t * 8)); ctx.fillStyle = `rgba(200,0,0,${a * 0.5})`; ctx.fillRect(0, 0, vw, 6); ctx.fillRect(0, vh - 6, vw, 6); ctx.fillRect(0, 0, 6, vh); ctx.fillRect(vw - 6, 0, 6, vh); }
    if (w.state === 'blackout') { ctx.fillStyle = `rgba(0,0,0,${clamp(1 - w.blackT / 2.4, 0, 1)})`; ctx.fillRect(0, 0, vw, vh); }
  }
}
