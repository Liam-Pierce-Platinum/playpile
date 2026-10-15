// The four kid's-room battlefields. Every prop is real geometry with a matching
// axis-aligned collision box list; the play area is HX x HZ, mirrored so both
// halves are fair (team 0 lives at -z, team 1 at +z).
import * as THREE from '../vendor/three.module.js';
import { roundedBox, canvasTex, normalFromHeight, rng } from './util.js';

export const HX = 18, HZ = 26;
export const BUILD = { zMin: 3, zMax: 20.5, x: 17 }; // |z| range of each side's build zone

const M = {};
function mat(key, make) { return M[key] || (M[key] = make()); }
export const plastic = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.35 });

// ---------- textures
function noiseCanvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
export function woodTex(base = '#d9a865', dark = '#b07b3e', rep = 1, seed = 3) {
  const draw = (g, w, h, b0, d0) => {
    const r = rng(seed);
    g.fillStyle = b0; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y0 = r() * h, amp = 2 + r() * 6, ph = r() * 6;
      g.strokeStyle = d0; g.globalAlpha = 0.12 + r() * 0.25; g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x / 40 + ph) * amp + Math.sin(x / 9 + ph * 2) * 0.8);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const t = canvasTex(256, 256, (g, w, h) => draw(g, w, h, base, dark), rep);
  const hc = noiseCanvas(256, 256, (g, w, h) => draw(g, w, h, '#999', '#000'));
  return { map: t, normal: normalFromHeight(hc, 1.5, rep) };
}
function carpetTex() {
  const draw = (g, w, h, height) => {
    g.fillStyle = height ? '#777' : '#7a3b46'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, l = 2 + r() * 3, a = r() * 6.28;
      const v = r();
      g.strokeStyle = height ? `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.35)` : (v > 0.5 ? 'rgba(255,190,190,0.12)' : 'rgba(40,0,10,0.18)');
      g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  };
  const map = canvasTex(256, 256, (g, w, h) => draw(g, w, h, false), 10);
  const hc = noiseCanvas(256, 256, (g, w, h) => draw(g, w, h, true));
  return { map, normal: normalFromHeight(hc, 3, 10) };
}
function rugTex() {
  // a play-rug: roads, a pond, patterned border
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4f7a4a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5d8a55'; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if ((i + j) % 2) g.fillRect(i * w / 12, j * h / 12, w / 12, h / 12);
    g.strokeStyle = '#3b3f46'; g.lineWidth = 46; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.15, 0); g.bezierCurveTo(w * 0.1, h * 0.4, w * 0.9, h * 0.6, w * 0.85, h); g.stroke();
    g.beginPath(); g.moveTo(0, h * 0.25); g.lineTo(w, h * 0.25); g.moveTo(0, h * 0.75); g.lineTo(w, h * 0.75); g.stroke();
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 4; g.setLineDash([18, 16]);
    g.beginPath(); g.moveTo(0, h * 0.25); g.lineTo(w, h * 0.25); g.moveTo(0, h * 0.75); g.lineTo(w, h * 0.75); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#3f7fb5'; g.beginPath(); g.ellipse(w * 0.72, h * 0.42, 70, 46, 0.3, 0, 7); g.fill();
    g.fillStyle = '#3f7fb5'; g.beginPath(); g.ellipse(w * 0.28, h * 0.58, 70, 46, 0.3, 0, 7); g.fill();
    g.lineWidth = 34; g.strokeStyle = '#c94a3a'; g.strokeRect(17, 17, w - 34, h - 34);
    g.lineWidth = 8; g.strokeStyle = '#f0c75a'; g.strokeRect(40, 40, w - 80, h - 80);
  }, 1);
}
function quiltTex() {
  const cols = ['#e9c46a', '#f4a261', '#8ab17d', '#7aa6c2', '#e07a5f', '#f2e8cf'];
  const r = rng(4);
  const draw = (g, w, h, height) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = height ? '#aaa' : cols[Math.floor(r() * cols.length)]; g.fillRect(i * s, j * s, s, s);
      if (!height && r() > 0.5) { g.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(i * s + r() * s, j * s + r() * s, 6, 0, 7); g.fill(); } }
      const grd = g.createRadialGradient(i * s + s / 2, j * s + s / 2, 2, i * s + s / 2, j * s + s / 2, s * 0.75);
      grd.addColorStop(0, height ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)'); grd.addColorStop(1, height ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)');
      g.fillStyle = grd; g.fillRect(i * s, j * s, s, s);
    }
    g.strokeStyle = height ? '#000' : 'rgba(255,255,255,0.7)'; g.lineWidth = height ? 4 : 2; g.setLineDash([7, 6]);
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  };
  const map = canvasTex(512, 512, (g, w, h) => draw(g, w, h, false), 3);
  const hc = noiseCanvas(512, 512, (g, w, h) => draw(g, w, h, true));
  return { map, normal: normalFromHeight(hc, 4, 3) };
}
function tileTex() {
  const draw = (g, w, h, height) => {
    g.fillStyle = height ? '#ddd' : '#eef4f6'; g.fillRect(0, 0, w, h);
    const s = w / 4; g.fillStyle = height ? '#222' : '#b8c8cc';
    for (let i = 0; i <= 4; i++) { g.fillRect(i * s - 2, 0, 4, h); g.fillRect(0, i * s - 2, w, 4); }
  };
  const map = canvasTex(256, 256, (g, w, h) => draw(g, w, h, false), 12);
  const hc = noiseCanvas(256, 256, (g, w, h) => draw(g, w, h, true));
  return { map, normal: normalFromHeight(hc, 2.5, 12) };
}
function wallpaperTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9ec3d8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b6d4e4'; for (let i = 0; i < 8; i++) g.fillRect(i * 32, 0, 14, h);
    g.fillStyle = '#f6f0d8'; g.font = 'bold 40px sans-serif';
    g.fillText('★', 40, 80); g.fillText('★', 170, 200);
  }, 6);
}
export function letterTex(ch, color) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(ch.charCodeAt(0));
    g.fillStyle = '#e8c48a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(150,100,40,0.18)'; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w / 3, y + 6, w * 2 / 3, y - 6, w, y + 2); g.stroke(); }
    g.strokeStyle = color; g.lineWidth = 16; g.strokeRect(22, 22, w - 44, h - 44);
    g.fillStyle = color; g.font = 'bold 150px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, w / 2, h / 2 + 8);
  }, 1);
}
export function softDot() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, 1);
}

// ---------- map definitions
export const MAPS = [
  { id: 'rug', name: 'RUG RUMBLE', sub: 'Bedroom floor', sky: 0x2b2238, fog: 0x3a2d40 },
  { id: 'bed', name: 'PILLOW FORT', sub: 'On the bed', sky: 0x1e2a44, fog: 0x2a3550 },
  { id: 'bath', name: 'BATHTUB BEACH', sub: 'Mind the water', sky: 0x9fc3cf, fog: 0xbcd6dd },
  { id: 'desk', name: 'DESK DEFENSE', sub: 'Homework warzone', sky: 0x231c18, fog: 0x2e241e },
];

export class World {
  constructor(scene) { this.scene = scene; this.group = null; this.boxes = []; this.water = null; }

  build(mapIndex) {
    if (this.group) { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose?.(); }); }
    const G = this.group = new THREE.Group();
    this.scene.add(G);
    this.boxes = []; this.water = null;
    const map = this.map = MAPS[mapIndex % MAPS.length];
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.Fog(map.fog, 45, 120);
    this.lights(map);
    this.room(map);
    const add = (fn) => { fn(1); fn(-1); }; // s=1: team0 half (z<0); s=-1 mirrored
    const B = (x0, y0, z0, x1, y1, z1, extra) => this.boxes.push(Object.assign({ x0: Math.min(x0, x1), y0, z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1, z1: Math.max(z0, z1), prop: true }, extra || {}));
    const P = (s, x, z) => [x * s, -z * s]; // define props on -z side as positive z distance: P(s, x, d) -> (x*s, -d*s)
    this.B = B; this.P = P;
    this['map_' + map.id](add, B, P);
    // invisible arena walls
    const T = 40;
    B(-HX - 2, -1, -HZ - 2, -HX, T, HZ + 2, { wall: true }); B(HX, -1, -HZ - 2, HX + 2, T, HZ + 2, { wall: true });
    B(-HX, -1, -HZ - 2, HX, T, -HZ, { wall: true }); B(-HX, -1, HZ, HX, T, HZ + 2, { wall: true });
    // floor
    B(-HX, -2, -HZ, HX, 0, HZ, { floor: true });
    // centre line: masking tape
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, 0.7), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.8 }));
    tape.rotation.x = -Math.PI / 2; tape.position.y = 0.012; tape.receiveShadow = true; G.add(tape);
    return this;
  }

  lights(map) {
    const G = this.group;
    const warm = map.id === 'bath' ? 0xffffff : 0xffe2b8;
    const hemi = new THREE.HemisphereLight(map.id === 'bath' ? 0xdff2ff : 0xbfd4ff, map.id === 'bath' ? 0xc8d8d8 : 0x6a4a3a, map.id === 'bath' ? 0.85 : 1.05);
    G.add(hemi);
    const sun = new THREE.DirectionalLight(warm, map.id === 'bath' ? 1.9 : 2.9);
    sun.position.set(22, 38, 14); sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 5; sc.far = 110;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    G.add(sun); G.add(sun.target);
    const fill = new THREE.DirectionalLight(map.id === 'bath' ? 0xbfe6ff : 0x9db8ff, 0.55); fill.position.set(-20, 12, -18); G.add(fill);
  }

  room(map) {
    const G = this.group;
    let floor;
    if (map.id === 'rug') {
      const wood = woodTex('#a8784a', '#6e4826', 6, 11);
      const boards = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, roughness: 0.55 }));
      boards.rotation.x = -Math.PI / 2; boards.position.y = -0.06; boards.receiveShadow = true; G.add(boards);
      const c = carpetTex();
      const rug = new THREE.Mesh(roundedBox(HX * 2 + 3, 0.12, HZ * 2 + 3, 0.05, 2), new THREE.MeshStandardMaterial({ map: rugTex(), normalMap: c.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 }));
      rug.position.y = -0.06; rug.receiveShadow = true; G.add(rug);
      this.walls(0x9ec3d8, wallpaperTex());
    } else if (map.id === 'bed') {
      const q = quiltTex();
      floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 14, HZ * 2 + 14, 40, 60), new THREE.MeshStandardMaterial({ map: q.map, normalMap: q.normal, roughness: 0.9 }));
      // blanket draping down past the arena edges
      const p = floor.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const ex = Math.max(0, Math.abs(x) - HX - 1), ey = Math.max(0, Math.abs(y) - HZ - 1); p.setZ(i, -(ex * ex + ey * ey) * 0.5 + Math.sin(x * 0.4) * 0.05 * (ex > 0 ? 3 : 0)); }
      floor.geometry.computeVertexNormals();
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; G.add(floor);
      const wood = woodTex('#6b4a33', '#3b2516', 2, 5);
      const head = new THREE.Mesh(roundedBox(HX * 2 + 10, 16, 2, 0.6), new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, roughness: 0.5 }));
      head.position.set(0, 6, HZ + 8); head.castShadow = true; head.receiveShadow = true; G.add(head);
      this.walls(0x6a7fa8, null);
    } else if (map.id === 'bath') {
      const t = tileTex();
      floor = new THREE.Mesh(roundedBox(HX * 2 + 2, 0.4, HZ * 2 + 2, 0.15, 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.1 }));
      floor.position.y = -0.2; floor.receiveShadow = true; G.add(floor);
      // the tub walls are the arena wall
      const porc = new THREE.MeshPhysicalMaterial({ color: 0xf7fbfc, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
      const rim = [[0, HZ + 1.6, HX * 2 + 7, 3.2], [0, -HZ - 1.6, HX * 2 + 7, 3.2]];
      for (const [x, z, w, d] of rim) { const m = new THREE.Mesh(roundedBox(w, 9, d, 1.2), porc); m.position.set(x, 4.3, z); m.castShadow = m.receiveShadow = true; G.add(m); }
      for (const s of [1, -1]) { const m = new THREE.Mesh(roundedBox(3.2, 9, HZ * 2, 1.2), porc); m.position.set(s * (HX + 1.6), 4.3, 0); m.castShadow = m.receiveShadow = true; G.add(m); }
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughness: 0.3 }));
      wall.position.set(0, 20, HZ + 14); wall.rotation.y = Math.PI; G.add(wall);
      const wall2 = wall.clone(); wall2.position.set(-HX - 14, 20, 0); wall2.rotation.y = Math.PI / 2; G.add(wall2);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughness: 0.4 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -10; G.add(ground);
    } else {
      const wood = woodTex('#7a5232', '#45291a', 4, 8);
      floor = new THREE.Mesh(roundedBox(HX * 2 + 6, 1.2, HZ * 2 + 6, 0.3, 2), new THREE.MeshPhysicalMaterial({ map: wood.map, normalMap: wood.normal, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
      floor.position.y = -0.6; floor.receiveShadow = true; G.add(floor);
      // a sheet of paper and the desk lamp glow
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(14, 19), new THREE.MeshStandardMaterial({ map: canvasTex(256, 340, (g, w, h) => { g.fillStyle = '#f7f4ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9cb8d8'; g.lineWidth = 2; for (let y = 30; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.strokeStyle = '#e08080'; g.beginPath(); g.moveTo(34, 0); g.lineTo(34, h); g.stroke(); g.fillStyle = '#334'; g.font = 'italic 20px cursive'; g.fillText('Math hw: 2+2=', 44, 52); }), roughness: 0.9 }));
      paper.rotation.x = -Math.PI / 2; paper.rotation.z = 0.15; paper.position.set(5, 0.01, -9); paper.receiveShadow = true; G.add(paper);
      const p2 = paper.clone(); p2.position.set(-5, 0.01, 9); p2.rotation.z = Math.PI + 0.15; G.add(p2);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -30; G.add(ground);
      const lamp = new THREE.PointLight(0xffc27a, 160, 70, 1.6); lamp.position.set(-14, 22, 14); G.add(lamp);
    }
  }

  walls(color, tex) {
    const m = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : color, map: tex || null, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(200, 70), m); back.position.set(0, 30, 62); back.rotation.y = Math.PI; this.group.add(back);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(200, 70), m); side.position.set(-58, 30, 0); side.rotation.y = Math.PI / 2; this.group.add(side);
    const side2 = side.clone(); side2.position.set(58, 30, 0); side2.rotation.y = -Math.PI / 2; this.group.add(side2);
    const front = back.clone(); front.position.set(0, 30, -62); front.rotation.y = 0; this.group.add(front);
  }

  mesh(geo, material, x, y, z, ry = 0) {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m;
  }

  // ---------- props
  book(x, z, w, d, h, y, color, ry = 0) {
    const cover = mat('book' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    const pages = mat('pages', () => new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(120,100,80,.35)'; for (let i = 0; i < 64; i += 3) { g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } }), roughness: 0.9 }));
    this.mesh(roundedBox(w, h, d, 0.12, 2), cover, x, y + h / 2, z, ry);
    const sw = ry ? d : w, sd = ry ? w : d;
    this.mesh(new THREE.BoxGeometry(w - 0.3, h - 0.16, d - 0.2), pages, x + (ry ? 0 : 0.12), y + h / 2, z, ry);
    this.B(x - sw / 2, y, z - sd / 2, x + sw / 2, y + h, z + sd / 2);
  }
  bookStack(x, z, s) {
    const cols = [0xc0392b, 0x2e6da4, 0x2f8f5b, 0xd4a017, 0x7d3c98];
    let y = 0; const r = rng(Math.abs(x * 13 + z * 7) | 0);
    for (let i = 0; i < 3; i++) { const h = 0.7 + r() * 0.35; this.book(x + (r() - 0.5) * 0.4, z + (r() - 0.5) * 0.3, 4.2 - i * 0.4, 3, h, y, cols[(i + (s > 0 ? 0 : 2)) % 5]); y += h; }
  }
  ball(x, z, r, color) {
    const tex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = '#f4d03f'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(i * w / 4 + 32, h * 0.22, 14, 0, 7); g.fill(); } });
    this.mesh(new THREE.SphereGeometry(r, 40, 24), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.8 }), x, r, z, x);
    const k = r * 0.8; this.B(x - k, 0, z - k, x + k, r * 1.7, z + k);
  }
  crayon(x, z, len, color, alongX = true) {
    const m = mat('cray' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    const paper = mat('crayp' + color, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25), roughness: 0.8 }));
    const g = new THREE.Group(); g.position.set(x, 0.38, z); if (alongX) g.rotation.y = Math.PI / 2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, len, 20), m); body.rotation.x = Math.PI / 2; g.add(body);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, len * 0.6, 20), paper); wrap.rotation.x = Math.PI / 2; g.add(wrap);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.8, 20), m); tip.rotation.x = Math.PI / 2; tip.position.z = len / 2 + 0.4; g.add(tip);
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; }); this.group.add(g);
    const hx = alongX ? len / 2 + 0.6 : 0.38, hz = alongX ? 0.38 : len / 2 + 0.6;
    this.B(x - hx, 0, z - hz, x + hx, 0.76, z + hz);
  }
  toyCar(x, z, color, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const body = plastic(color);
    const b = new THREE.Mesh(roundedBox(2.6, 1.0, 5, 0.4), body); b.position.y = 1.0; g.add(b);
    const cab = new THREE.Mesh(roundedBox(2.2, 0.9, 2.4, 0.4), new THREE.MeshPhysicalMaterial({ color: 0x9fd3f0, roughness: 0.05, transmission: 0, clearcoat: 1, metalness: 0.2 })); cab.position.set(0, 1.85, -0.3); g.add(cab);
    const tyre = mat('tyre', () => new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.7 })), hub = mat('hub', () => new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.25 }));
    for (const sx of [-1.25, 1.25]) for (const sz of [-1.6, 1.6]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 24), tyre); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.6, sz); g.add(w);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.52, 16), hub); h.rotation.z = Math.PI / 2; h.position.copy(w.position); g.add(h);
    }
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; }); this.group.add(g);
    const swap = Math.abs(Math.sin(ry)) > 0.5, hw = swap ? 2.6 : 1.4, hd = swap ? 1.4 : 2.6;
    this.B(x - hw, 0, z - hd, x + hw, 2.3, z + hd);
  }
  pillow(x, z, w, d, h, color) {
    const m = mat('pil' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    const p = this.mesh(roundedBox(w, h, d, Math.min(h * 0.48, 1.4), 4), m, x, h / 2, z);
    p.scale.set(1, 1, 1);
    this.B(x - w / 2, 0, z - d / 2, x + w / 2, h * 0.92, z + d / 2);
  }
  teddy(x, z, s) {
    const fur = mat('fur', () => new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 1 }));
    const pale = mat('furp', () => new THREE.MeshStandardMaterial({ color: 0xe7c08a, roughness: 1 }));
    const dark = mat('eye', () => new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.1, clearcoat: 1 }));
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = s > 0 ? 0 : Math.PI;
    const add = (geo, m, px, py, pz, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const S = new THREE.SphereGeometry(1, 32, 20);
    add(S, fur, 0, 2.2, 0, 2.1, 2.3, 1.9); add(S, pale, 0, 2.0, 1.2, 1.3, 1.5, 0.9);
    add(S, fur, 0, 5.0, 0.2, 1.6, 1.5, 1.5); add(S, pale, 0, 4.75, 1.45, 0.7, 0.5, 0.45);
    add(S, dark, 0, 4.95, 1.9, 0.18, 0.14, 0.12); add(S, dark, -0.55, 5.35, 1.4, 0.16, 0.16, 0.12); add(S, dark, 0.55, 5.35, 1.4, 0.16, 0.16, 0.12);
    add(S, fur, -1.1, 6.3, 0, 0.6, 0.6, 0.4); add(S, fur, 1.1, 6.3, 0, 0.6, 0.6, 0.4);
    add(S, fur, -1.4, 0.8, 1.0, 0.8, 0.75, 1.3); add(S, fur, 1.4, 0.8, 1.0, 0.8, 0.75, 1.3);
    add(S, fur, -2.1, 2.9, 0.4, 0.7, 1.3, 0.7); add(S, fur, 2.1, 2.9, 0.4, 0.7, 1.3, 0.7);
    this.group.add(g);
    this.B(x - 2.3, 0, z - 1.9, x + 2.3, 4.2, z + 1.9);
  }
  duck(x, z, s, size = 1) {
    const y = mat('duck', () => plastic(0xffd21f)), o = mat('beak', () => plastic(0xff7a1a)), e = mat('eye', () => new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.1, clearcoat: 1 }));
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = s > 0 ? 0.4 : Math.PI + 0.4; g.scale.setScalar(size);
    const S = new THREE.SphereGeometry(1, 32, 20);
    const add = (m, px, py, pz, sx, sy, sz) => { const k = new THREE.Mesh(S, m); k.position.set(px, py, pz); k.scale.set(sx, sy, sz); k.castShadow = k.receiveShadow = true; g.add(k); };
    add(y, 0, 1.3, 0, 2.0, 1.4, 2.4); add(y, 0, 1.9, -2.2, 0.8, 1.0, 0.6);
    add(y, 0, 3.4, 1.2, 1.2, 1.15, 1.15); add(o, 0, 3.1, 2.45, 0.6, 0.25, 0.6);
    add(e, -0.65, 3.75, 2.05, 0.18, 0.2, 0.15); add(e, 0.65, 3.75, 2.05, 0.18, 0.2, 0.15);
    this.group.add(g);
    this.B(x - 2 * size, 0, z - 2.2 * size, x + 2 * size, 2.6 * size, z + 2.2 * size);
  }
  soap(x, z) {
    const m = mat('soap', () => new THREE.MeshPhysicalMaterial({ color: 0xf5a8c8, roughness: 0.25, transmission: 0, clearcoat: 0.6 }));
    this.mesh(roundedBox(3, 1.1, 2, 0.5, 4), m, x, 0.55, z);
    this.B(x - 1.5, 0, z - 1, x + 1.5, 1.1, z + 1);
  }
  bottle(x, z, color) {
    const m = plastic(color);
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; const r = t < 0.75 ? 1.3 : t < 0.85 ? 1.3 - (t - 0.75) * 8 : 0.5; pts.push(new THREE.Vector2(r * (1 - Math.pow(Math.abs(t - 0.4) * 0.2, 2)), t * 5.5)); }
    this.mesh(new THREE.LatheGeometry(pts, 32), m, x, 0, z);
    this.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 24), mat('cap', () => plastic(0xffffff)), x, 5.8, z);
    this.B(x - 1.1, 0, z - 1.1, x + 1.1, 6, z + 1.1);
  }
  pencil(x, z, len, color, alongX) {
    const g = new THREE.Group(); g.position.set(x, 0.42, z); g.rotation.y = alongX ? Math.PI / 2 : 0;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, len, 6), mat('pen' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6 }))); body.rotation.x = Math.PI / 2; g.add(body);
    const wood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 6), mat('penw', () => new THREE.MeshStandardMaterial({ color: 0xe8c08a, roughness: 0.8 }))); wood.rotation.x = Math.PI / 2; wood.position.z = len / 2 + 0.7; g.add(wood);
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 8), mat('lead', () => new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.5 }))); lead.rotation.x = Math.PI / 2; lead.position.z = len / 2 + 1.25; g.add(lead);
    const ferr = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.5, 16), mat('ferr', () => new THREE.MeshStandardMaterial({ color: 0xc8c8c0, metalness: 0.9, roughness: 0.3 }))); ferr.rotation.x = Math.PI / 2; ferr.position.z = -len / 2 - 0.25; g.add(ferr);
    const er = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 16), mat('eras', () => new THREE.MeshStandardMaterial({ color: 0xf08aa0, roughness: 0.8 }))); er.rotation.x = Math.PI / 2; er.position.z = -len / 2 - 0.8; g.add(er);
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; }); this.group.add(g);
    const hx = alongX ? len / 2 + 1.2 : 0.42, hz = alongX ? 0.42 : len / 2 + 1.2;
    this.B(x - hx, 0, z - hz, x + hx, 0.84, z + hz);
  }
  mug(x, z) {
    const m = mat('mug', () => new THREE.MeshPhysicalMaterial({ color: 0xd94f3d, roughness: 0.2, clearcoat: 1 }));
    this.mesh(new THREE.CylinderGeometry(1.8, 1.7, 4.4, 40, 1, true), m, x, 2.2, z).material.side = THREE.DoubleSide;
    this.mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.2, 40), m, x, 0.1, z);
    this.mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.1, 40), mat('coffee', () => new THREE.MeshPhysicalMaterial({ color: 0x3b2314, roughness: 0.1, clearcoat: 1 })), x, 3.4, z);
    const h = this.mesh(new THREE.TorusGeometry(0.9, 0.25, 12, 24), m, x + 1.9, 2.3, z); h.rotation.y = 0;
    this.B(x - 1.8, 0, z - 1.8, x + 1.8, 4.4, z + 1.8);
  }
  eraser(x, z) {
    this.mesh(roundedBox(3.4, 1.4, 1.8, 0.35, 3), mat('erz', () => new THREE.MeshStandardMaterial({ color: 0xf2a0b8, roughness: 0.85 })), x, 0.7, z);
    this.mesh(roundedBox(1.6, 1.46, 1.86, 0.2, 2), mat('erzs', () => new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.6 })), x - 0.8, 0.7, z);
    this.B(x - 1.7, 0, z - 0.9, x + 1.7, 1.4, z + 0.9);
  }

  // ---------- layouts (defined on team 0's half, mirrored through the centre)
  map_rug(add) {
    add((s) => {
      this.bookStack(-9 * s, -8 * s, s);
      this.ball(10 * s, -12 * s, 1.6, s > 0 ? '#2e86de' : '#e84a5f');
      this.crayon(3 * s, -6 * s, 5, s > 0 ? 0x2e86de : 0xe84a5f, true);
      this.crayon(-13 * s, -15 * s, 4, 0x27ae60, false);
      this.toyCar(4 * s, -15 * s, s > 0 ? 0xf39c12 : 0x8e44ad, 0.3);
    });
  }
  map_bed(add) {
    add((s) => {
      this.pillow(-8 * s, -9 * s, 7, 3.5, 2.4, s > 0 ? 0xf2efe6 : 0xe6eef2);
      this.pillow(10 * s, -5 * s, 4, 4, 1.6, 0xd98a8a);
      this.teddy(8 * s, -15 * s, s);
      this.crayon(-2 * s, -13 * s, 5, 0x7d3c98, true);
    });
    this.pillow(0, 0, 4, 3, 1.2, 0xf6d06b);
  }
  map_bath(add) {
    add((s) => {
      this.duck(-8 * s, -9 * s, s, 0.9);
      this.soap(8 * s, -7 * s);
      this.bottle(12 * s, -16 * s, s > 0 ? 0x2e9cca : 0x9b59b6);
      this.soap(-13 * s, -15 * s);
    });
    // shallow water channel across the middle: slows you down, no cover
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, 7, 1, 1), new THREE.MeshPhysicalMaterial({ color: 0x7fc8e8, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1 }));
    w.rotation.x = -Math.PI / 2; w.position.y = 0.35; w.receiveShadow = true; this.group.add(w);
    this.water = { z0: -3.5, z1: 3.5, mesh: w };
    this.duck(0, 0, 1, 0.55);
  }
  map_desk(add) {
    add((s) => {
      this.pencil(-6 * s, -6 * s, 9, s > 0 ? 0xf2c230 : 0x3fa34d, true);
      this.mug(10 * s, -10 * s);
      this.eraser(-11 * s, -13 * s);
      this.book(0, -16 * s, 5, 3.6, 1.2, 0, s > 0 ? 0x2e6da4 : 0xc0392b, 0);
      this.pencil(13 * s, -3 * s, 6, 0xe74c3c, false);
    });
  }

  // ---------- collision queries
  supportAt(x0, z0, x1, z1, ignore) {
    let top = 0;
    for (const b of this.allBoxes()) {
      if (b === ignore || b.wall) continue;
      if (b.x1 > x0 + 0.01 && b.x0 < x1 - 0.01 && b.z1 > z0 + 0.01 && b.z0 < z1 - 0.01 && b.y1 > top) top = b.y1;
    }
    return top;
  }
  allBoxes() {
    if (!this.extra) return this.boxes;
    const ex = this.extra();
    if (ex !== this._exRef || this.boxes !== this._bRef) { this._all = this.boxes.concat(ex); this._exRef = ex; this._bRef = this.boxes; }
    return this._all;
  }
}
