// Pixel-art sprites, drawn from primitives at load time and auto-outlined.
// Everything is original art generated in code (no image assets).
export const P = {
  k: '#1a1c2c', p: '#5d275d', r: '#b13e53', o: '#ef7d57', y: '#ffcd75', l: '#a7f070', g: '#38b764', t: '#257179',
  n: '#29366f', b: '#3b5dc9', c: '#41a6f6', a: '#73eff7', w: '#f4f4f4', s: '#94b0c2', d: '#566c86', m: '#333c57',
  f: '#f6c89f', F: '#d99a74', h: '#9a6232', j: '#5c3a21', i: '#c98a4b', e: '#8bb052', E: '#5e7d34', z: '#eee6c8', Z: '#b9ab86',
  v: '#8a4bd6', u: '#e6b8ff', X: '#2b1740', V: '#4a2470', G: '#23774a', Y: '#f5b83d', R: '#7a2335', B: '#1f2f6b',
};

export class PC {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  px(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; return this; }
  get(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.d[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); return this; }
  ell(cx, cy, rx, ry, c, shade, light) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        let col = c;
        if (shade && dx * 0.5 + dy * 0.85 > 0.45) col = shade;
        if (light && dx * 0.6 + dy * 0.8 < -0.55) col = light;
        this.px(x, y, col);
      }
    }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return this;
  }
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minx = Math.min(x0, x1, x2), maxx = Math.max(x0, x1, x2), miny = Math.min(y0, y1, y2), maxy = Math.max(y0, y1, y2);
    const s = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    for (let y = Math.floor(miny); y <= maxy; y++) for (let x = Math.floor(minx); x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d1 = s(px, py, x0, y0, x1, y1), d2 = s(px, py, x1, y1, x2, y2), d3 = s(px, py, x2, y2, x0, y0);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.px(x, y, c);
    }
    return this;
  }
  outline(c = 'k') {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.px(x, y, c);
    return this;
  }
  recolor(map) { const n = new PC(this.w, this.h); n.d = this.d.map((c) => (c && map[c]) ? map[c] : c); return n; }
  mirror() { const n = new PC(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) n.d[y * this.w + x] = this.d[y * this.w + (this.w - 1 - x)]; return n; }
  canvas(tint) {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext('2d'); const img = cx.createImageData(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i]; if (!c) continue;
      const hex = tint || P[c] || c; const v = parseInt(hex.slice(1), 16);
      img.data[i * 4] = v >> 16; img.data[i * 4 + 1] = (v >> 8) & 255; img.data[i * 4 + 2] = v & 255; img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0); return cv;
  }
}

// ---------- characters ----------
const ARMOR = [
  { t: 'b', T: 'n', belt: 'y' }, // tunic
  { t: 'h', T: 'j', belt: 'y' }, // leather (zombie cloth)
  { t: 'z', T: 'Z', belt: 'h' }, // bone
  { t: 's', T: 'd', belt: 'c' }, // iron
];
const SHIELD = [null, ['h', 'j', 'y'], ['s', 'd', 'c']];
function knightPC(dir, frame, armor = 0, shield = 0, pal = null) {
  const A = ARMOR[armor] || ARMOR[0];
  const helm = pal ? pal.helm : ['s', 'd', 'w'], eye = pal ? pal.eye : 'w', plume = pal ? pal.plume : 'r', tun = pal ? pal.tun : [A.t, A.T], belt = pal ? pal.belt : A.belt;
  const p = new PC(16, 16);
  const side = dir === 'right' || dir === 'left';
  // legs
  if (side) { if (frame === 0) { p.rect(5, 12, 2, 3, 'm'); p.rect(9, 12, 2, 3, 'm'); } else p.rect(7, 12, 2, 3, 'm'); }
  else { if (frame === 0) { p.rect(5, 12, 2, 3, 'm'); p.rect(9, 12, 2, 2, 'm'); } else { p.rect(5, 12, 2, 2, 'm'); p.rect(9, 12, 2, 3, 'm'); } }
  // body
  if (side) { p.rect(5, 8, 6, 4, tun[0]); p.rect(10, 8, 1, 4, tun[1]); p.rect(5, 11, 6, 1, belt); }
  else { p.rect(4, 8, 8, 4, tun[0]); p.rect(11, 8, 1, 4, tun[1]); if (dir === 'down') p.rect(4, 11, 8, 1, belt); p.rect(3, 8, 1, 3, helm[0]); p.rect(12, 8, 1, 3, helm[1]); }
  // helmet
  p.ell(8, 4.6, 4.6, 4.2, helm[0], helm[1], helm[2]);
  if (dir === 'down') { p.rect(5, 5, 6, 2, 'k'); p.px(6, 5, eye); p.px(9, 5, eye); }
  if (dir === 'right') { p.rect(9, 5, 4, 2, 'k'); p.px(11, 5, eye); p.rect(7, 8, 2, 3, helm[0]); }
  if (dir === 'up') { p.rect(7, 2, 2, 5, helm[1]); }
  // plume
  p.rect(7, 0, 2, 1, plume); p.px(dir === 'right' ? 6 : 9, 0, plume); p.px(dir === 'right' ? 5 : 10, 1, plume);
  // shield
  const S = SHIELD[shield];
  if (S) {
    if (dir === 'down') { p.rect(1, 8, 3, 4, S[0]); p.px(2, 9, S[2]); p.rect(1, 11, 3, 1, S[1]); }
    if (dir === 'up') { p.rect(12, 8, 3, 4, S[1]); }
    if (dir === 'right') { p.rect(3, 8, 3, 4, S[1]); }
  }
  p.outline();
  return dir === 'left' ? knightPC('right', frame, armor, shield, pal).mirror() : p;
}
const cache = new Map();
function cached(key, fn) { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; }
export function knight(dir, frame, armor, shield) { return cached(`kn${dir}${frame}${armor}${shield}`, () => knightPC(dir, frame, armor, shield).canvas()); }
const SHADOWPAL = { helm: ['V', 'X', 'v'], eye: 'u', plume: 'u', tun: ['X', 'p'], belt: 'v' };
export function shadowKnight(dir, frame) { return cached(`sk${dir}${frame}`, () => { const p = knightPC(dir, frame, 0, 0, SHADOWPAL); p.px(3, 1, 'v'); p.px(12, 1, 'v'); p.px(3, 0, 'u'); p.px(12, 0, 'u'); return p.canvas(); }); }
export function whiteOf(cv) {
  return cached(cv, () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); return c; });
}
export function tintOf(cv, col) {
  return cached(cv.toString() + col + cv.width + 'x' + (cv._id || (cv._id = Math.random())), () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; });
}

function slimePC(frame, body = 'l', shade = 'g', eye = 'k') {
  const p = new PC(16, 16);
  if (frame === 0) p.ell(8, 10.5, 6.2, 4.6, body, shade); else p.ell(8, 11.5, 7.2, 3.6, body, shade);
  const ey = frame === 0 ? 10 : 11;
  p.px(5, ey - 2, 'w'); p.px(6, ey - 3, 'w'); p.px(4, ey - 1, 'w');
  p.rect(6, ey, 1, 2, eye); p.rect(10, ey, 1, 2, eye); p.px(8, ey + 2, 'r');
  return p.outline();
}
export function slime(frame, kind = 'green') {
  const cols = { green: ['l', 'g', 'k'], blue: ['a', 'c', 'k'], red: ['o', 'r', 'k'], shadow: ['v', 'V', 'u'] }[kind];
  return cached('sl' + frame + kind, () => slimePC(frame, ...cols).canvas());
}
function zombiePC(dir, frame) {
  const p = new PC(16, 16), side = dir !== 'down' && dir !== 'up';
  if (frame === 0) { p.rect(5, 12, 2, 3, 'j'); p.rect(9, 12, 2, 2, 'j'); } else { p.rect(5, 12, 2, 2, 'j'); p.rect(9, 12, 2, 3, 'j'); }
  p.rect(4, 8, 8, 4, 't'); p.px(6, 10, 'n'); p.px(9, 9, 'n'); p.px(5, 11, 'g'); p.rect(11, 8, 1, 4, 'n');
  if (side) { p.rect(8, 8, 6, 2, 'e'); p.rect(8, 9, 6, 1, 'E'); } else { p.rect(2, 7, 2, 4, 'e'); p.rect(12, 7, 2, 4, 'E'); }
  p.ell(8, 4.8, 4.2, 4, 'e', 'E');
  if (dir === 'down') { p.px(6, 4, 'k'); p.px(9, 4, 'k'); p.px(6, 5, 'r'); p.px(9, 5, 'r'); p.rect(6, 7, 4, 1, 'E'); p.px(7, 7, 'k'); }
  if (side) { p.px(10, 4, 'k'); p.px(10, 5, 'r'); p.px(11, 7, 'k'); }
  p.px(5, 1, 'E'); p.px(7, 1, 'j'); p.px(9, 1, 'j');
  p.outline();
  return dir === 'left' ? zombiePC('right', frame).mirror() : p;
}
export function zombie(dir, frame) { return cached('zo' + dir + frame, () => zombiePC(dir, frame).canvas()); }
function skeletonPC(dir, frame) {
  const p = new PC(16, 16), side = dir === 'right' || dir === 'left';
  if (frame === 0) { p.rect(6, 12, 1, 3, 'z'); p.rect(9, 12, 1, 2, 'z'); } else { p.rect(6, 12, 1, 2, 'z'); p.rect(9, 12, 1, 3, 'z'); }
  p.rect(6, 8, 4, 4, 'z'); p.rect(6, 9, 4, 1, 'Z'); p.rect(6, 11, 4, 1, 'Z'); p.rect(7, 8, 1, 4, 'Z');
  if (side) { p.rect(8, 9, 5, 1, 'z'); } else { p.rect(4, 8, 1, 4, 'z'); p.rect(11, 8, 1, 4, 'z'); }
  p.ell(8, 4.6, 4.2, 3.9, 'z', 'Z');
  if (dir === 'down') { p.rect(5, 4, 2, 2, 'k'); p.rect(9, 4, 2, 2, 'k'); p.px(6, 4, 'r'); p.px(9, 4, 'r'); p.rect(6, 7, 4, 1, 'Z'); p.px(7, 7, 'k'); p.px(9, 7, 'k'); }
  if (side) { p.rect(9, 4, 2, 2, 'k'); p.px(10, 4, 'r'); p.px(11, 7, 'k'); }
  p.outline();
  return dir === 'left' ? skeletonPC('right', frame).mirror() : p;
}
export function skeleton(dir, frame) { return cached('sk2' + dir + frame, () => skeletonPC(dir, frame).canvas()); }
export function bat(frame) {
  return cached('bat' + frame, () => {
    const p = new PC(16, 12);
    if (frame === 0) { p.tri(1, 2, 7, 5, 6, 8, 'p'); p.tri(15, 2, 9, 5, 10, 8, 'p'); } else { p.tri(1, 9, 7, 5, 6, 8, 'p'); p.tri(15, 9, 9, 5, 10, 8, 'p'); }
    p.ell(8, 6.5, 3, 3, 'V'); p.px(7, 6, 'r'); p.px(9, 6, 'r'); p.px(6, 3, 'V'); p.px(10, 3, 'V');
    return p.outline().canvas();
  });
}
export function rockling(awake, frame) {
  return cached('rl' + awake + frame, () => {
    const p = new PC(18, 16);
    if (awake) { const o = frame ? 1 : 0; p.rect(3 + o, 12, 2, 2, 'm'); p.rect(13 - o, 12, 2, 2, 'm'); p.rect(7 - o, 13, 2, 2, 'm'); p.rect(10 + o, 13, 2, 2, 'm'); }
    p.ell(9, 9, 7, 5, 's', 'd', 'w'); p.px(5, 8, 'd'); p.px(12, 7, 'd'); p.px(10, 11, 'o'); p.px(6, 10, 'o');
    if (awake) { p.rect(6, 8, 2, 1, 'y'); p.rect(11, 8, 2, 1, 'y'); } else { p.rect(6, 8, 2, 1, 'd'); p.rect(11, 8, 2, 1, 'd'); }
    return p.outline().canvas();
  });
}
export function hound(frame) {
  return cached('hd' + frame, () => {
    const p = new PC(22, 14), o = frame ? 1 : 0;
    p.rect(5 + o, 9, 2, 4, 'X'); p.rect(14 - o, 9, 2, 4, 'X'); p.rect(8 - o, 9, 2, 3, 'V'); p.rect(12 + o, 9, 2, 3, 'V');
    p.ell(10, 7.5, 7, 3.5, 'V', 'X'); p.ell(17, 5.5, 3.5, 3, 'V', 'X'); p.rect(19, 6, 3, 2, 'X');
    p.px(17, 4, 'u'); p.px(18, 4, 'u'); p.tri(15, 3, 16, 0, 17, 3, 'X'); p.px(2, 4, 'v'); p.px(3, 5, 'v'); p.px(1, 3, 'u');
    p.px(8, 5, 'v'); p.px(11, 5, 'v'); p.px(20, 8, 'w');
    return p.outline('k');
  });
}
export function houndCv(frame, left) { return cached('hdc' + frame + left, () => (left ? hound(frame).mirror() : hound(frame)).canvas()); }
export function wisp(frame) {
  return cached('wp' + frame, () => {
    const p = new PC(14, 18);
    p.ell(7, 10, 5, 5.5, 'v', 'V'); p.tri(2, 10, 7, 0 + frame, 12, 10, 'v'); p.tri(4, 9, 7, 3 + frame, 10, 9, 'u');
    p.ell(7, 10, 3, 3, 'u'); p.rect(5, 10, 1, 2, 'X'); p.rect(8, 10, 1, 2, 'X');
    p.px(3 + frame, 16, 'V'); p.px(10 - frame, 16, 'V'); p.px(7, 17, 'V');
    return p.outline('X').canvas();
  });
}
export function boss(frame, dir = 0) {
  return cached('boss' + frame + dir, () => {
    const p = new PC(36, 38);
    // cloak
    p.tri(3, 34, 18, 10, 33, 34, 'X'); p.ell(18, 33, 15, 4, 'X');
    for (let i = 0; i < 5; i++) p.px(5 + i * 6 + frame, 37, 'X');
    p.tri(8, 33, 18, 14, 28, 33, 'V'); p.rect(16, 16, 4, 18, 'p');
    // pauldrons + arms
    p.ell(9, 17, 5, 4, 'm', 'X', 'd'); p.ell(27, 17, 5, 4, 'm', 'X', 'd');
    p.rect(4, 19, 3, 9 + frame, 'X'); p.rect(29, 19, 3, 9 - frame, 'X'); p.rect(4, 27 + frame, 3, 2, 'v'); p.rect(29, 27 - frame, 3, 2, 'v');
    // head
    p.ell(18, 10, 6, 6, 'm', 'X', 'd');
    p.rect(14, 9, 8, 3, 'k'); p.rect(15, 10, 2, 1, 'u'); p.rect(19, 10, 2, 1, 'u');
    // horns + crown
    p.tri(10, 4, 13, 8, 14, 5, 'z'); p.tri(26, 4, 23, 8, 22, 5, 'z');
    p.rect(13, 3, 10, 2, 'v'); p.px(13, 2, 'u'); p.px(18, 1, 'u'); p.px(18, 2, 'v'); p.px(22, 2, 'u'); p.px(15, 2, 'v'); p.px(20, 2, 'v');
    // gem
    p.px(18, 22, 'u'); p.px(17, 22, 'v'); p.px(19, 22, 'v'); p.px(18, 21, 'v'); p.px(18, 23, 'v');
    p.outline('k');
    return p.canvas();
  });
}
export function npc(kind, frame = 0) {
  return cached('npc' + kind + frame, () => {
    const p = new PC(16, 18);
    if (kind === 'merchant') {
      p.ell(8, 12, 5.5, 4.5 - frame * 0.3, 'g', 'G'); p.rect(4, 14, 8, 2, 'G');
      p.ell(8, 6, 4, 3.6, 'f', 'F'); p.px(6, 6, 'k'); p.px(10, 6, 'k'); p.rect(7, 8, 3, 1, 'F');
      p.tri(2, 5, 8, -1, 14, 5, 'g'); p.rect(3, 4, 10, 2, 'G'); p.px(8, 0, 'y'); p.rect(12, 10, 3, 5, 'h'); p.px(13, 11, 'y');
    } else if (kind === 'foreman') {
      p.rect(5, 14, 2, 3, 'j'); p.rect(9, 14, 2, 3, 'j');
      p.rect(4, 9, 8, 5, 'o'); p.rect(7, 9, 2, 5, 'y'); p.rect(2, 9, 2, 4, 'f'); p.rect(12, 9 - frame, 2, 4, 'f');
      p.ell(8, 6, 4, 3.6, 'f', 'F'); p.px(6, 5, 'k'); p.px(10, 5, 'k'); p.rect(5, 7, 6, 3, 'h'); p.px(8, 7, 'F');
      p.ell(8, 3, 5, 2.5, 'Y', 'h'); p.rect(3, 4, 10, 1, 'Y'); p.rect(13, 5 - frame, 1, 4, 'd'); p.rect(12, 4 - frame, 3, 2, 's');
    } else if (kind === 'sage') {
      p.tri(3, 17, 8, 6, 13, 17, 'b'); p.rect(4, 15, 8, 2, 'n');
      p.ell(8, 6, 3.8, 3.5, 'f', 'F'); p.px(6, 6, 'k'); p.px(10, 6, 'k'); p.tri(5, 7, 8, 13, 11, 7, 'w');
      p.tri(3, 4, 8, -2, 13, 4, 'b'); p.px(8, 0, 'y'); p.rect(13, 3, 1, 14, 'h'); p.px(13, 2, 'a');
    }
    return p.outline().canvas();
  });
}

// ---------- world objects ----------
export function tree(kind = 'oak', variant = 0) {
  return cached('tr' + kind + variant, () => {
    if (kind === 'pine') {
      const p = new PC(20, 30);
      p.rect(9, 24, 3, 5, 'j');
      p.tri(1, 25, 10, 8, 19, 25, 'G'); p.tri(3, 18, 10, 3, 17, 18, 'g'); p.tri(5, 11, 10, 0, 15, 11, 'g');
      p.tri(10, 8, 17, 18, 10, 18, 'G'); p.px(6, 16, 'l'); p.px(8, 9, 'l'); p.px(5, 22, 'g'); p.px(7, 23, 'g');
      return p.outline().canvas();
    }
    if (kind === 'dead') {
      const p = new PC(20, 28);
      p.rect(8, 10, 4, 17, 'j'); p.rect(11, 10, 1, 17, 'k');
      p.line(9, 14, 3, 7, 'j'); p.line(3, 7, 2, 3, 'j'); p.line(11, 12, 17, 5, 'j'); p.line(17, 5, 18, 2, 'j'); p.line(10, 10, 9, 2, 'j'); p.line(5, 9, 7, 6, 'j');
      return p.outline().canvas();
    }
    const p = new PC(24, 30);
    const L = kind === 'forest' ? ['G', 'g', 'l'] : (variant ? ['g', 'G', 'l'] : ['g', 'G', 'l']);
    p.rect(10, 18, 4, 10, 'h'); p.rect(13, 18, 1, 10, 'j'); p.px(9, 27, 'h'); p.px(14, 27, 'h');
    p.ell(12, 11, 10.5, 8.5, L[0], L[1], L[2]);
    p.ell(7, 13, 5, 4.5, L[0], L[1]); p.ell(17, 13, 5, 4.5, L[0], L[1]); p.ell(11, 7, 6, 5, L[0], null, L[2]);
    p.px(7, 6, 'l'); p.px(8, 5, 'l'); p.px(13, 4, 'l');
    if (variant === 1) { p.px(6, 11, 'r'); p.px(15, 9, 'r'); p.px(17, 14, 'r'); p.px(10, 14, 'r'); }
    if (variant === 2) { p.px(6, 11, 'y'); p.px(15, 9, 'w'); p.px(17, 14, 'y'); }
    return p.outline().canvas();
  });
}
export function stump() { return cached('stump', () => { const p = new PC(14, 9); p.ell(7, 5, 5, 3.5, 'h', 'j'); p.ell(7, 3.5, 4, 2, 'i'); p.px(7, 3, 'h'); return p.outline().canvas(); }); }
export function rock(ore = 0, hp = 1) {
  return cached('rk' + ore, () => {
    const p = new PC(16, 14);
    p.ell(8, 8, 7, 5.2, 's', 'd', 'w'); p.ell(5, 9, 3, 2.5, 's', 'd');
    if (ore === 1) { p.px(5, 7, 'o'); p.px(6, 7, 'Y'); p.px(10, 9, 'o'); p.px(11, 6, 'Y'); p.px(9, 10, 'Y'); p.px(4, 10, 'o'); }
    if (ore === 2) { p.px(5, 7, 'v'); p.px(6, 7, 'u'); p.px(10, 9, 'v'); p.px(11, 6, 'u'); }
    return p.outline().canvas();
  });
}
export function bush(v = 0) { return cached('bu' + v, () => { const p = new PC(14, 10); p.ell(7, 6, 6, 4, 'g', 'G', 'l'); if (v) { p.px(4, 4, 'r'); p.px(9, 5, 'r'); p.px(7, 7, 'r'); } return p.outline().canvas(); }); }
export function chest(open) {
  return cached('ch' + open, () => {
    const p = new PC(14, 12);
    p.rect(1, 5, 12, 6, 'h'); p.rect(1, 10, 12, 1, 'j'); p.rect(1, 5, 1, 6, 'Y'); p.rect(12, 5, 1, 6, 'Y');
    if (open) { p.rect(1, 1, 12, 3, 'j'); p.rect(2, 4, 10, 1, 'k'); p.px(5, 4, 'y'); p.px(8, 4, 'y'); }
    else { p.rect(1, 2, 12, 3, 'i'); p.rect(1, 4, 12, 1, 'Y'); p.rect(6, 4, 2, 3, 'Y'); p.px(6, 5, 'k'); }
    return p.outline().canvas();
  });
}
export function workbench() {
  return cached('wb', () => {
    const p = new PC(26, 18);
    p.rect(2, 10, 2, 7, 'j'); p.rect(22, 10, 2, 7, 'j'); p.rect(1, 7, 24, 4, 'i'); p.rect(1, 10, 24, 1, 'h');
    p.rect(4, 4, 6, 3, 'd'); p.rect(5, 3, 4, 1, 's'); p.rect(13, 5, 7, 1, 's'); p.rect(19, 4, 2, 3, 'j'); p.px(15, 6, 'd'); p.px(17, 6, 'd');
    p.rect(11, 2, 1, 5, 'h'); p.rect(10, 1, 3, 2, 'd');
    return p.outline().canvas();
  });
}
export function stall() {
  return cached('stall', () => {
    const p = new PC(34, 30);
    p.rect(3, 8, 2, 20, 'j'); p.rect(29, 8, 2, 20, 'j');
    for (let i = 0; i < 8; i++) p.rect(1 + i * 4, 3, 4, 6, i % 2 ? 'w' : 'r');
    p.tri(1, 3, 17, 0, 33, 3, 'r'); for (let i = 0; i < 8; i++) p.rect(2 + i * 4, 9, 2, 1, i % 2 ? 'w' : 'r');
    p.rect(2, 19, 30, 9, 'h'); p.rect(2, 19, 30, 2, 'i'); p.rect(2, 27, 30, 1, 'j');
    p.ell(8, 18, 2.5, 2, 'r'); p.ell(13, 18, 2.5, 2, 'Y'); p.rect(20, 15, 3, 4, 'c'); p.rect(25, 16, 3, 3, 'l');
    return p.outline().canvas();
  });
}
export function house(roof = 'r') {
  return cached('house' + roof, () => {
    const p = new PC(50, 50);
    const shade = { r: 'R', b: 'B', g: 'G', p: 'X' }[roof] || 'R';
    p.rect(4, 24, 42, 24, 'y'); p.rect(4, 44, 42, 4, 'i'); p.rect(42, 24, 4, 24, 'i');
    p.tri(0, 26, 25, 2, 50, 26, 'k'); p.tri(2, 25, 25, 4, 48, 25, roof);
    for (let y = 8; y < 25; y += 4) p.rect(25 - (y - 3), y, (y - 3) * 2, 1, shade);
    p.rect(20, 34, 10, 14, 'j'); p.rect(21, 35, 8, 13, 'h'); p.px(27, 41, 'Y');
    p.rect(8, 30, 8, 7, 'j'); p.rect(9, 31, 6, 5, 'a'); p.rect(9, 33, 6, 1, 'j'); p.rect(11, 31, 1, 5, 'j');
    p.rect(34, 30, 8, 7, 'j'); p.rect(35, 31, 6, 5, 'a'); p.rect(35, 33, 6, 1, 'j'); p.rect(37, 31, 1, 5, 'j');
    p.rect(35, 6, 5, 10, 'd'); p.rect(34, 5, 7, 2, 'm');
    p.rect(7, 37, 10, 3, 'h'); p.px(9, 36, 'r'); p.px(12, 36, 'y'); p.px(15, 36, 'r');
    return p.outline().canvas();
  });
}
export function well() { return cached('well', () => { const p = new PC(18, 22); p.rect(2, 4, 2, 10, 'j'); p.rect(14, 4, 2, 10, 'j'); p.tri(0, 5, 9, 0, 18, 5, 'r'); p.ell(9, 15, 7.5, 5, 'd', 'm', 's'); p.ell(9, 14, 5, 2.5, 'n'); p.rect(8, 5, 1, 7, 'h'); p.rect(7, 11, 3, 2, 'h'); return p.outline().canvas(); }); }
export function grave(v = 0) {
  return cached('gr' + v, () => {
    const p = new PC(12, 14);
    if (v === 0) { p.ell(6, 5, 4.5, 4.5, 's', 'd'); p.rect(2, 5, 9, 8, 's'); p.rect(9, 5, 2, 8, 'd'); p.rect(4, 5, 4, 1, 'd'); p.rect(5, 7, 2, 1, 'd'); }
    else { p.rect(5, 1, 3, 12, 's'); p.rect(2, 4, 9, 3, 's'); p.rect(7, 1, 1, 12, 'd'); }
    p.rect(1, 12, 11, 2, 'j');
    return p.outline().canvas();
  });
}
export function fence(vert) { return cached('fe' + vert, () => { const p = new PC(16, 14); if (vert) { p.rect(7, 0, 3, 14, 'h'); p.rect(9, 0, 1, 14, 'j'); } else { p.rect(1, 3, 3, 10, 'h'); p.rect(12, 3, 3, 10, 'h'); p.rect(0, 5, 16, 2, 'i'); p.rect(0, 9, 16, 2, 'i'); } return p.outline().canvas(); }); }
export function sign() { return cached('sign', () => { const p = new PC(14, 14); p.rect(6, 6, 2, 8, 'j'); p.rect(1, 1, 12, 7, 'i'); p.rect(3, 3, 8, 1, 'j'); p.rect(3, 5, 6, 1, 'j'); return p.outline().canvas(); }); }
export function torch(lit = 1) { return cached('to' + lit, () => { const p = new PC(8, 16); p.rect(3, 6, 2, 10, 'j'); p.rect(2, 5, 4, 2, 'm'); return p.outline().canvas(); }); }
export function crystal() { return cached('cry', () => { const p = new PC(12, 16); p.tri(6, 0, 1, 10, 11, 10, 'v'); p.tri(1, 10, 6, 15, 11, 10, 'V'); p.line(6, 1, 6, 13, 'u'); return p.outline('X').canvas(); }); }
export function mushroom(v) { return cached('mu' + v, () => { const p = new PC(10, 10); p.rect(4, 5, 2, 4, 'z'); p.ell(5, 4, 4, 3, v ? 'v' : 'r', v ? 'V' : 'R'); p.px(3, 3, 'w'); p.px(6, 2, 'w'); return p.outline().canvas(); }); }
export function crate() { return cached('crate', () => { const p = new PC(14, 14); p.rect(1, 1, 12, 12, 'i'); p.rect(1, 1, 12, 1, 'h'); p.rect(1, 12, 12, 1, 'j'); p.line(2, 2, 11, 11, 'h'); p.line(11, 2, 2, 11, 'h'); return p.outline().canvas(); }); }
export function throne() { return cached('throne', () => { const p = new PC(24, 30); p.rect(3, 2, 18, 22, 'X'); p.rect(5, 4, 14, 16, 'p'); p.rect(1, 16, 22, 4, 'V'); p.rect(3, 20, 18, 9, 'X'); p.px(12, 6, 'u'); p.px(4, 1, 'u'); p.px(19, 1, 'u'); return p.outline().canvas(); }); }

// ---------- item icons (12x12) ----------
const ICONS = {
  wood: (p) => { p.rect(1, 4, 10, 5, 'h'); p.rect(1, 4, 10, 1, 'i'); p.ell(10.5, 6.5, 1.6, 2.5, 'i'); p.px(10, 6, 'h'); },
  stone: (p) => { p.ell(6, 6.5, 5, 4, 's', 'd', 'w'); },
  iron: (p) => { p.tri(1, 9, 3, 4, 11, 9, 's'); p.rect(3, 4, 7, 5, 's'); p.rect(3, 4, 7, 1, 'w'); p.rect(3, 8, 8, 1, 'd'); },
  gel: (p) => { p.ell(6, 7, 4.5, 3.5, 'l', 'g'); p.px(4, 5, 'w'); },
  bone: (p) => { p.line(3, 9, 9, 3, 'z'); p.line(3, 8, 8, 3, 'z'); p.ell(2.5, 9.5, 1.5, 1.5, 'z'); p.ell(9.5, 2.5, 1.5, 1.5, 'z'); },
  cloth: (p) => { p.rect(2, 3, 8, 7, 't'); p.px(4, 5, 'n'); p.px(7, 7, 'n'); p.rect(2, 9, 2, 1, null); p.px(9, 3, 'a'); },
  shard: (p) => { p.tri(6, 0, 2, 7, 10, 7, 'v'); p.tri(2, 7, 6, 11, 10, 7, 'V'); p.px(6, 3, 'u'); p.px(5, 5, 'u'); },
  coin: (p) => { p.ell(6, 6, 4.5, 4.5, 'Y', 'h', 'y'); p.rect(5, 4, 2, 4, 'h'); },
  potion: (p) => { p.ell(6, 7.5, 4, 3.5, 'r', 'R'); p.rect(5, 1, 2, 3, 'a'); p.rect(4, 1, 4, 1, 'h'); p.px(4, 6, 'w'); },
  arrow: (p) => { p.line(2, 9, 9, 2, 'h'); p.tri(7, 2, 10, 1, 9, 4, 's'); p.px(2, 8, 'w'); p.px(3, 10, 'w'); },
  fist: (p) => { p.rect(3, 4, 6, 5, 'f'); p.rect(3, 4, 6, 1, 'F'); p.px(5, 5, 'F'); p.px(7, 5, 'F'); },
  sword_wood: (p) => sword(p, 'i', 'h'), sword_stone: (p) => sword(p, 's', 'd'), sword_iron: (p) => sword(p, 'w', 'c'), sword_shadow: (p) => sword(p, 'u', 'v'),
  bow: (p) => { p.line(3, 1, 9, 3, 'h'); p.line(9, 3, 10, 7, 'h'); p.line(3, 1, 2, 2, 'h'); p.line(10, 7, 8, 10, 'h'); p.line(2, 2, 8, 10, 'w'); },
  shield_wood: (p) => { p.ell(6, 5, 4.5, 4.5, 'h', 'j'); p.tri(2, 6, 6, 11, 10, 6, 'h'); p.rect(5, 2, 2, 7, 'Y'); },
  shield_iron: (p) => { p.ell(6, 5, 4.5, 4.5, 's', 'd'); p.tri(2, 6, 6, 11, 10, 6, 's'); p.rect(5, 2, 2, 7, 'c'); },
  axe_0: (p) => axe(p, 'd'), axe_1: (p) => axe(p, 's'), axe_2: (p) => axe(p, 'w'),
  pick_1: (p) => pick(p, 'i'), pick_2: (p) => pick(p, 's'),
  armor_1: (p) => armor(p, 'h', 'j'), armor_2: (p) => armor(p, 'z', 'Z'), armor_3: (p) => armor(p, 's', 'd'),
  heart: (p) => { p.ell(4, 4.5, 2.6, 2.6, 'r'); p.ell(8, 4.5, 2.6, 2.6, 'r'); p.tri(1.5, 5, 6, 10.5, 10.5, 5, 'r'); p.px(3, 3, 'w'); },
  bridge: (p) => { p.rect(0, 5, 12, 3, 'h'); p.rect(1, 3, 1, 6, 'j'); p.rect(5, 3, 1, 6, 'j'); p.rect(10, 3, 1, 6, 'j'); p.rect(0, 3, 12, 1, 'i'); },
  xp: (p) => { p.tri(6, 0, 2, 6, 10, 6, 'l'); p.tri(2, 6, 6, 11, 10, 6, 'g'); },
};
function sword(p, b, s) { p.line(3, 8, 10, 1, b); p.line(3, 7, 9, 1, s); p.line(1, 6, 5, 10, 'Y'); p.line(1, 10, 3, 8, 'j'); }
function axe(p, c) { p.line(2, 10, 8, 2, 'h'); p.tri(6, 1, 11, 2, 9, 7, c); p.px(10, 3, 'w'); }
function pick(p, c) { p.line(2, 10, 7, 4, 'h'); p.line(2, 3, 6, 1, c); p.line(6, 1, 10, 4, c); p.line(10, 4, 11, 8, c); p.line(2, 3, 1, 6, c); }
function armor(p, c, s) { p.rect(3, 2, 6, 8, c); p.rect(1, 2, 2, 3, c); p.rect(9, 2, 2, 3, c); p.rect(8, 2, 1, 8, s); p.rect(5, 2, 2, 1, 'k'); }
export function icon(name) {
  return cached('ic' + name, () => { const p = new PC(12, 12); (ICONS[name] || ICONS.stone)(p); p.d = p.d.map((c) => c || null); return p.outline().canvas(); });
}
const urlCache = new Map();
export function iconURL(name) {
  if (!urlCache.has(name)) { let u = ''; try { u = icon(name).toDataURL(); } catch (e) {} urlCache.set(name, u); }
  return urlCache.get(name);
}

// ---------- tiny pixel digit font for damage numbers ----------
const DIG = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  '+': '000010111010000', '-': '000000111000000', '!': '010010010000010',
};
export function digits(str, col) {
  return cached('dg' + str + col, () => {
    const p = new PC(str.length * 4 + 1, 7);
    [...str].forEach((ch, i) => { const g = DIG[ch]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === '1') p.px(1 + i * 4 + (k % 3), 1 + Math.floor(k / 3), col); });
    return p.outline().canvas();
  });
}
