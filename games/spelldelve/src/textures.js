// Procedural painted textures (canvas). No image files.
import * as THREE from '../vendor/three.module.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function speckle(g, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export function floorTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#2a2420'; g.fillRect(0, 0, S, S);
  const stones = [[4, 4, 120, 120], [132, 4, 120, 56], [132, 68, 120, 56], [4, 132, 56, 120], [68, 132, 56, 120], [132, 132, 120, 120]];
  for (const [x, y, w, h] of stones) {
    const l = 38 + Math.random() * 14;
    const grd = g.createRadialGradient(x + w * 0.4, y + h * 0.35, 4, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, `hsl(28, 14%, ${l + 10}%)`); grd.addColorStop(1, `hsl(24, 16%, ${l - 8}%)`);
    g.fillStyle = grd; rrect(g, x, y, w, h, 12); g.fill();
    g.strokeStyle = 'rgba(255,230,200,0.10)'; g.lineWidth = 3; rrect(g, x + 2, y + 2, w - 4, h - 4, 10); g.stroke();
  }
  speckle(g, S, S, 1600, 0.12);
  // a few cracks
  g.strokeStyle = 'rgba(20,14,10,0.5)'; g.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) { g.beginPath(); let x = Math.random() * S, y = Math.random() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  return finish(c);
}

export function wallTexture() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#1d1815'; g.fillRect(0, 0, W, H);
  const rows = 6, bh = H / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 42; let x = -off;
    while (x < W) {
      const bw = 70 + Math.random() * 30;
      const l = 30 + Math.random() * 12;
      const grd = g.createLinearGradient(0, r * bh, 0, r * bh + bh);
      grd.addColorStop(0, `hsl(26, 12%, ${l + 8}%)`); grd.addColorStop(1, `hsl(22, 14%, ${l - 6}%)`);
      g.fillStyle = grd; rrect(g, x + 3, r * bh + 3, bw - 6, bh - 6, 8); g.fill();
      if (x + bw > W) { rrect(g, x + 3 - W, r * bh + 3, bw - 6, bh - 6, 8); g.fill(); }
      x += bw;
    }
  }
  speckle(g, W, H, 1400, 0.12);
  // moss / grime at the base
  const grime = g.createLinearGradient(0, H * 0.6, 0, H);
  grime.addColorStop(0, 'rgba(30,40,20,0)'); grime.addColorStop(1, 'rgba(30,45,20,0.45)');
  g.fillStyle = grime; g.fillRect(0, 0, W, H);
  return finish(c);
}

export function glowTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return finish(c, false);
}

export function ringTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return finish(c, false);
}

export function smokeTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * 50, y = S / 2 + (Math.random() - 0.5) * 50, r = 20 + Math.random() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  return finish(c, false);
}

export function bookCoverTexture(hexColor, glyph) {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const col = '#' + hexColor.toString(16).padStart(6, '0');
  g.fillStyle = '#3a1f14'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#d9a94a'; g.lineWidth = 6; g.strokeRect(10, 10, S - 20, S - 20);
  g.fillStyle = col; g.font = 'bold 70px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 16; g.fillText(glyph + '︎', S / 2, S / 2 + 4);
  return finish(c, false);
}

// ---------------------------------------------------------------- character detail normal maps
// Tileable height fields turned into tangent-space normal maps, so the smooth character models get
// cloth weave, skin pores, hammered metal, bone pits, wood grain, fur and chitin up close.
function tileNoise(S, cells, seed) {
  // value noise on a wrapping grid
  const g = new Float32Array(cells * cells);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x / S) * cells, fy = (y / S) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[(iy % cells) * cells + (ix % cells)], b = g[(iy % cells) * cells + ((ix + 1) % cells)];
    const c = g[((iy + 1) % cells) * cells + (ix % cells)], d = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
    out[y * S + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}
function heightToNormal(h, S, strength) {
  const c = canvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace;
  return t;
}
export function detailNormalTexture(kind) {
  const S = 256, h = new Float32Array(S * S);
  const n1 = tileNoise(S, 8, 3), n2 = tileNoise(S, 32, 7), n3 = tileNoise(S, 64, 11);
  let strength = 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S;
    let v0 = 0;
    switch (kind) {
      case 'cloth': { // over-under weave + slubs
        const a = Math.sin(u * Math.PI * 2 * 48), b = Math.sin(v * Math.PI * 2 * 48);
        const over = (Math.floor(u * 48) + Math.floor(v * 48)) % 2 ? a * a : b * b;
        v0 = over * 0.5 + n2[i] * 0.4 + n1[i] * 0.3; strength = 5; break;
      }
      case 'skin': v0 = n1[i] * 0.6 + n2[i] * 0.25 + (n3[i] > 0.8 ? -0.3 : 0); strength = 4; break;
      case 'metal': v0 = n1[i] * 0.35 + n3[i] * 0.05; strength = 7; break;
      case 'bone': v0 = n1[i] * 0.5 + n2[i] * 0.3 + (n3[i] > 0.82 ? -0.5 : 0); strength = 6; break;
      case 'wood': { const w = u * 10 + n1[i] * 2.2 + n2[i] * 0.3; v0 = Math.abs(Math.sin(w * Math.PI)) * 0.6 + n3[i] * 0.15; strength = 7; break; }
      case 'leather': v0 = n2[i] * 0.6 + n3[i] * 0.4 - (Math.abs(n1[i] - 0.5) < 0.02 ? 0.4 : 0); strength = 6; break;
      case 'fur': { const s = Math.sin((u * 90 + n2[i] * 6) * Math.PI) * Math.sin((v * 20 + n1[i] * 3) * Math.PI); v0 = s * 0.4 + n3[i] * 0.5; strength = 6; break; }
      case 'chitin': { // soft hex-ish cells
        const cx = u * 16, cy = v * 16 + (Math.floor(u * 16) % 2) * 0.5;
        const fx = cx - Math.floor(cx) - 0.5, fy = cy - Math.floor(cy) - 0.5;
        v0 = 1 - Math.min(1, Math.hypot(fx, fy) * 1.9) + n2[i] * 0.2; strength = 5; break;
      }
      default: v0 = n2[i];
    }
    h[i] = v0;
  }
  // hammered dents for metal
  if (kind === 'metal') {
    let s = 17; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let k = 0; k < 70; k++) {
      const cx = rnd() * S, cy = rnd() * S, r = 6 + rnd() * 14;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r; if (d > 1) continue;
        const xx = ((Math.round(cx + x) % S) + S) % S, yy = ((Math.round(cy + y) % S) + S) % S;
        h[yy * S + xx] -= (1 - d * d) * 0.18;
      }
    }
    for (let k = 0; k < 30; k++) { // scratches
      let x = rnd() * S, y = rnd() * S; const a = rnd() * 6.28, L = 20 + rnd() * 60;
      for (let j = 0; j < L; j++) { x += Math.cos(a); y += Math.sin(a); const xx = ((Math.round(x) % S) + S) % S, yy = ((Math.round(y) % S) + S) % S; h[yy * S + xx] -= 0.12; }
    }
  }
  return heightToNormal(h, S, strength);
}
