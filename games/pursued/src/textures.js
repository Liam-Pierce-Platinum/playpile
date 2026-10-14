// Procedural canvas textures for the things Poly Haven did not give us: fence planks, chain-link,
// painted sheet metal (dumpsters, bins, doors), linoleum. All painted once at load.
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

function toTex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// height field (Float32 0..1) -> tangent-space normal map
function normalFrom(hf, W, H, k = 2) {
  const [c, g] = canvas(W, H); const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = hf[y * W + ((x - 1 + W) % W)], r = hf[y * W + ((x + 1) % W)];
    const u = hf[((y - 1 + H) % H) * W + x], d = hf[((y + 1) % H) * W + x];
    let nx = (l - r) * k, ny = (d - u) * k, nz = 1; const n = Math.hypot(nx, ny, nz);
    const i = (y * W + x) * 4;
    img.data[i] = (nx / n * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / n * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / n * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, false);
}

// weathered vertical fence planks, 1 tile = 2 m wide x 2 m tall
export function woodPlanks() {
  const W = 512, H = 512; const [c, g] = canvas(W, H); const img = g.createImageData(W, H); const hf = new Float32Array(W * H);
  const planks = 14;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = Math.floor(x / W * planks), fx = (x / W * planks) % 1;
    const seed = hash(p, 3);
    const grain = fbm(x * 0.02 + seed * 50, y * 0.004 + seed * 9, 3) * 0.6 + fbm(x * 0.15, y * 0.012 + p, 2) * 0.4;
    const gap = fx < 0.05 || fx > 0.97 ? 1 : 0;
    const base = 0.32 + seed * 0.12;
    const rot = fbm(x * 0.01 + 7, y * 0.01, 3);           // water stains / rot
    const wet = Math.max(0, 1 - y / H * 2.5) * 0.5 + (rot > 0.6 ? 0.35 : 0);
    let v = base * (0.65 + grain * 0.55) * (1 - wet * 0.5);
    if (gap) v *= 0.15;
    const nail = (Math.abs((y % 230) - 40) < 3 && Math.abs(fx - 0.5) < 0.06) ? 1 : 0;
    const i = (y * W + x) * 4;
    img.data[i] = Math.min(255, v * 255 * 0.95 + nail * 20); img.data[i + 1] = v * 255 * 0.82; img.data[i + 2] = v * 255 * 0.66; img.data[i + 3] = 255;
    hf[y * W + x] = gap ? 0 : 0.6 + grain * 0.3 - rot * 0.1;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, W, H, 3) };
}

// chain-link diamonds (alpha), 1 tile = 0.6 m
export function chainLink() {
  const S = 256; const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#c8ccd0'; g.lineWidth = 7; g.lineCap = 'round';
  const n = 4, step = S / n;
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * step, S); g.lineTo(i * step + S, 0); g.stroke();
  }
  const t = toTex(c, true);
  return t;
}

// painted sheet metal with dents, scratches and rust bleeding from the bottom
export function paintedMetal(hex, { rust = 0.5, ribs = 0, seed = 1 } = {}) {
  const W = 512, H = 512; const [c, g] = canvas(W, H); const img = g.createImageData(W, H); const hf = new Float32Array(W * H);
  const base = new THREE.Color(hex);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.012 + seed * 13, y * 0.012, 4);
    const fine = fbm(x * 0.09, y * 0.09 + seed, 2);
    const rr = fbm(x * 0.03 + 3, y * 0.006 + seed, 3);
    const r = Math.max(0, Math.min(1, (y / H) * 1.3 - 0.55 + (rr - 0.5) * 1.1)) * rust + (n > 0.68 ? (n - 0.68) * 2.5 * rust : 0);
    const rib = ribs ? 0.5 + 0.5 * Math.cos(x / W * Math.PI * 2 * ribs) : 0.5;
    const shade = 0.75 + 0.3 * n + (rib - 0.5) * 0.25;
    let cr = base.r * shade, cg = base.g * shade, cb = base.b * shade;
    const rc = [0.32 * (0.6 + fine), 0.16 * (0.6 + fine), 0.07];
    cr = cr * (1 - r) + rc[0] * r; cg = cg * (1 - r) + rc[1] * r; cb = cb * (1 - r) + rc[2] * r;
    const scratch = hash(Math.floor(x / 3), Math.floor(y / 40)) > 0.995 ? 0.25 : 0;
    const i = (y * W + x) * 4;
    img.data[i] = Math.min(255, (Math.sqrt(cr) + scratch) * 255 * 0.85);
    img.data[i + 1] = Math.min(255, (Math.sqrt(cg) + scratch) * 255 * 0.85);
    img.data[i + 2] = Math.min(255, (Math.sqrt(cb) + scratch) * 255 * 0.85);
    img.data[i + 3] = 255;
    hf[y * W + x] = rib * 0.6 + n * 0.25 + fine * 0.05 - r * 0.1;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, W, H, ribs ? 6 : 2) };
}

// stained institutional linoleum tiles, 1 tile = 2 m
export function linoleum() {
  const W = 512, H = 512; const [c, g] = canvas(W, H); const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / 64), ty = Math.floor(y / 64);
    const chk = (tx + ty) % 2;
    const n = fbm(x * 0.02, y * 0.02, 4), st = fbm(x * 0.006 + 4, y * 0.006, 3);
    const seam = (x % 64 < 1 || y % 64 < 1) ? 0.6 : 1;
    let v = (chk ? 0.42 : 0.3) * (0.8 + n * 0.35) * seam * (st > 0.58 ? 0.7 : 1);
    const i = (y * W + x) * 4;
    img.data[i] = v * 255 * 0.98; img.data[i + 1] = v * 255 * 0.95; img.data[i + 2] = v * 255 * 0.82; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c);
}

// a painted panel door with a number plate and kick marks (1 x 2.2 m)
export function doorTexture(hex, label = '') {
  const W = 256, H = 512; const [c, g] = canvas(W, H);
  const col = new THREE.Color(hex);
  g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, W, H);
  // panels
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6;
  g.strokeRect(30, 40, W - 60, 190); g.strokeRect(30, 270, W - 60, 200);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3;
  g.strokeRect(36, 46, W - 72, 178); g.strokeRect(36, 276, W - 72, 188);
  // grime
  for (let i = 0; i < 2500; i++) {
    const y = Math.random() * H, x = Math.random() * W;
    g.fillStyle = `rgba(20,14,8,${Math.random() * 0.08 * (0.4 + y / H)})`;
    g.fillRect(x, y, 2 + Math.random() * 8, 1 + Math.random() * 4);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(40 + Math.random() * (W - 80), H - 60 + Math.random() * 40, 10 + Math.random() * 20, 3); }
  // handle + plate
  g.fillStyle = '#b8a678'; g.beginPath(); g.arc(W - 36, 270, 10, 0, 7); g.fill();
  if (label) {
    g.fillStyle = '#c9b98a'; g.fillRect(W / 2 - 30, 120, 60, 36);
    g.fillStyle = '#2a2418'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, W / 2, 139);
  }
  return toTex(c, true, false);
}

// grime / graffiti decal sheet for walls (transparent)
export function graffiti(seed = 1) {
  const W = 512, H = 256; const [c, g] = canvas(W, H);
  const tags = ['KR8', 'NOX', 'SL!M', 'DEAD END', 'RUN', 'GHOST', 'R.I.P. T', 'XO', 'BLKS', 'NO EXIT'];
  const cols = ['#d23b2a', '#e8e1d0', '#2a6bd2', '#16a35a', '#e0b11c', '#111'];
  g.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const t = tags[Math.floor(hash(seed, i) * tags.length)];
    g.font = `${hash(seed, i + 7) > 0.5 ? 'italic ' : ''}900 ${60 + hash(i, seed) * 50}px Impact, Arial Black, sans-serif`;
    const x = 40 + hash(seed + 3, i) * 300, y = 80 + hash(seed, i + 2) * 140;
    g.save(); g.translate(x, y); g.rotate((hash(i, seed + 1) - 0.5) * 0.3);
    g.strokeStyle = cols[Math.floor(hash(seed, i + 4) * cols.length)]; g.lineWidth = 8; g.globalAlpha = 0.85;
    g.strokeText(t, 0, 0);
    g.fillStyle = cols[Math.floor(hash(seed + 9, i) * cols.length)]; g.globalAlpha = 0.7; g.fillText(t, 0, 0);
    g.restore();
  }
  // drips
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(30,20,15,0.25)'; g.fillRect(hash(i, seed) * W, hash(seed, i) * H * 0.6, 2, 20 + hash(i, i) * 60); }
  return toTex(c, true, false);
}
