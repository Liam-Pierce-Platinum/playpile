// Grey material library for levels. Every surface is a shade of grey; blood is the only colour in the game.
// L.mat(name) returns one of these (shared, never dispose them). Canvas textures are made once, lazily.
import * as THREE from 'three';
import { worldMats } from '../world.js';

function canvasTex(draw, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const rng = seed => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
const grain = (g, n, base, amp, r) => { const img = g.getImageData(0, 0, n, n), d = img.data; for (let i = 0; i < d.length; i += 4) { const v = base + (r() - 0.5) * amp; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(img, 0, 0); };

const MAKERS = {
  // lab wall/floor tiles: pale squares with dark grout and a few stains
  tile: () => new THREE.MeshStandardMaterial({ roughness: 0.55, color: 0xd6d6d6, map: canvasTex((g, n) => {
    const r = rng(5); grain(g, n, 205, 14, r);
    g.strokeStyle = 'rgba(70,70,70,0.7)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * n / 4, 0); g.lineTo(i * n / 4, n); g.stroke(); g.beginPath(); g.moveTo(0, i * n / 4); g.lineTo(n, i * n / 4); g.stroke(); }
    for (let i = 0; i < 12; i++) { const x = r() * n, y = r() * n, s = 8 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(90,90,90,0.25)'); gr.addColorStop(1, 'rgba(90,90,90,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  }) }),
  // vent sheet metal: brushed light grey, panel seams and rivets
  vent: () => new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.6, color: 0xb8b8b8, map: canvasTex((g, n) => {
    const r = rng(9); grain(g, n, 170, 10, r);
    for (let y = 0; y < n; y += 2) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`; g.fillRect(0, y, n, 1); }
    g.strokeStyle = 'rgba(40,40,40,0.8)'; g.lineWidth = 2; g.strokeRect(1, 1, n - 2, n - 2);
    g.fillStyle = 'rgba(60,60,60,0.9)'; for (let i = 8; i < n; i += 24) { for (const y of [6, n - 6]) { g.beginPath(); g.arc(i, y, 2.2, 0, 7); g.fill(); } }
  }) }),
  // bark: vertical streaks and knots
  bark: () => new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0x7a6048, map: canvasTex((g, n) => {
    const r = rng(3); grain(g, n, 90, 20, r);
    for (let i = 0; i < 70; i++) { const x = r() * n, w = 1 + r() * 4, v = 40 + r() * 60; g.fillStyle = `rgba(${v},${v},${v},0.6)`; g.fillRect(x, 0, w, n); }
    for (let i = 0; i < 6; i++) { const x = r() * n, y = r() * n; g.strokeStyle = 'rgba(30,30,30,0.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 5, 9, 0, 0, 7); g.stroke(); }
  }) }),
  leaf: () => new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0x45633a, flatShading: true }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0xcfe4ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  // dark steel: doors, rails, ladders, grates
  steel: () => new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.7, flatShading: true }),
  // painted walls, plain and cheap
  paint: () => new THREE.MeshStandardMaterial({ color: 0x8f9c8c, roughness: 0.85 }),
  paintDark: () => new THREE.MeshStandardMaterial({ color: 0x4b4f45, roughness: 0.85 }),
  dirt: () => new THREE.MeshStandardMaterial({ roughness: 1, color: 0x7d6a52, map: canvasTex((g, n) => { const r = rng(17); grain(g, n, 110, 40, r); for (let i = 0; i < 300; i++) { const v = 60 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * n, r() * n, 2 + r() * 4, 2 + r() * 4); } }) }),
  // a warm-white emissive panel for light fixtures (still grey: it is just bright)
  lamp: () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe8c8, emissiveIntensity: 1.4 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 }),
};
const CACHE = {};
// names: concrete, concreteDark, concreteLight, metal (the arena four) + tile, vent, bark, leaf, glass, steel, paint,
// paintDark, dirt, lamp, black
export function mat(name = 'concrete') {
  const W = worldMats();
  const base = { concrete: W[0], concreteDark: W[1], concreteLight: W[2], metal: W[3] };
  if (base[name]) return base[name];
  if (!MAKERS[name]) { console.warn('[campaign] unknown material ' + name); return W[0]; }
  return CACHE[name] || (CACHE[name] = MAKERS[name]());
}
export const MAT_NAMES = ['concrete', 'concreteDark', 'concreteLight', 'metal', ...Object.keys(MAKERS)];
