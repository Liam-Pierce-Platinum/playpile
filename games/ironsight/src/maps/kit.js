// Reusable set pieces built from batched PBR boxes: buildings with window grids and ledges, parked
// cars (sheet metal, bullets go through doors), dumpsters, newspaper boxes, sandbag walls, HESCO
// barriers, shipping containers, chain-link fences, cubicles, desks, stairs and catwalks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { safeMerge as mergeGeometries } from '../core/geom.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
export function ensure(B, key, make) { if (!B.mats.has(key)) B.mat(key, make(), { tile: 1 }); return key; }
export function M(B) {
  return {
    glassDark: ensure(B, 'glassDark', () => phys({ color: 0x0b0f14, metalness: 0.0, roughness: 0.04, envMapIntensity: 1.6, clearcoat: 1 })),
    glassLit: ensure(B, 'glassLit', () => std({ color: 0x1a140c, emissive: 0xffc58a, emissiveIntensity: 1.2, roughness: 0.2 })),
    glassBlue: ensure(B, 'glassBlue', () => std({ color: 0x0d1418, emissive: 0x9fc4ff, emissiveIntensity: 0.55, roughness: 0.2 })),
    paintGreen: ensure(B, 'paintGreen', () => std({ color: 0x1e3a26, roughness: 0.55, metalness: 0.4 })),
    paintBlue: ensure(B, 'paintBlue', () => std({ color: 0x173a6b, roughness: 0.45, metalness: 0.4 })),
    paintRed: ensure(B, 'paintRed', () => std({ color: 0x8a1712, roughness: 0.45, metalness: 0.4 })),
    paintYellow: ensure(B, 'paintYellow', () => std({ color: 0xb8901a, roughness: 0.5, metalness: 0.3 })),
    darkMetal: ensure(B, 'darkMetal', () => std({ color: 0x222426, roughness: 0.5, metalness: 0.8 })),
    steel: ensure(B, 'steel', () => std({ color: 0x777b80, roughness: 0.35, metalness: 0.9 })),
    rubber: ensure(B, 'rubber', () => std({ color: 0x111111, roughness: 0.85 })),
    chrome: ensure(B, 'chrome', () => phys({ color: 0xaaaaaa, roughness: 0.12, metalness: 1 })),
    lightRed: ensure(B, 'lightRed', () => std({ color: 0x300000, emissive: 0xff1a10, emissiveIntensity: 0.8 })),
    lightWhite: ensure(B, 'lightWhite', () => std({ color: 0x222222, emissive: 0xfff2d8, emissiveIntensity: 2 })),
    plasticBlack: ensure(B, 'plasticBlack', () => std({ color: 0x151515, roughness: 0.6 })),
    fabric: ensure(B, 'fabric', () => std({ color: 0x4a4f57, roughness: 0.95 })),
    sandbag: ensure(B, 'sandbag', () => std({ color: 0x9b8a66, roughness: 0.95 })),
    hesco: ensure(B, 'hesco', () => std({ color: 0xa48f68, roughness: 0.95 })),
    paper: ensure(B, 'paper', () => std({ color: 0xd8d2c4, roughness: 0.9 })),
  };
}
function addGeo(B, geo, key) { B.geo(geo, key); }
const rbox = (w, h, d, r, x, y, z, ry = 0) => { const g = new RoundedBoxGeometry(w, h, d, 2, r); g.rotateY(ry); g.translate(x, y, z); return g; };
const rot2 = (x, z, ry) => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];

// collision helper for rotated objects: only 0 / 90 deg collision boxes (visual can be jittered)
function collide(B, cx, y, cz, w, h, d, ry, surf, opts) {
  const sw = Math.abs(Math.cos(ry)) > 0.7 ? [w, d] : [d, w];
  return B.world.add(cx - sw[0] / 2, y, cz - sw[1] / 2, cx + sw[0] / 2, y + h, cz + sw[1] / 2, surf, opts);
}

// ---------------------------------------------------------------- buildings
// solid building block with window grid on chosen faces. faces: {n,s,e,w} -> true
export function building(B, x0, z0, x1, z1, h, wallKey, { faces = { n: 1, s: 1, e: 1, w: 1 }, floorH = 3.4, groundH = 4.2, winW = 1.3, winH = 1.8, spacing = 3.0, lit = 0.3, ledgeKey = null, R = Math.random, parapet = true, groundFloor = null, surf = 'brick', solid = true, base = 0, collide = true, minY = -Infinity, simple = false, kind = 0 } = {}) {
  const kindOf = kind;
  const K = M(B);
  if (solid) B.box(x0, base, z0, x1, h, z1, wallKey, { surf, collide });
  const lk = ledgeKey || wallKey;
  // cornice / parapet
  if (parapet) { B.box(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.35, z1 + 0.25, lk, { surf: 'concrete', collide }); B.box(x0 - 0.15, h - 0.6, z0 - 0.15, x1 + 0.15, h - 0.4, z1 + 0.15, lk, { surf: 'concrete', collide: false }); }
  // window grid
  const doFace = (axis, fixed, a0, a1, outSign) => {
    const len = a1 - a0, n = Math.floor((len - 1) / spacing);
    if (n < 1) return;
    const off = (len - (n - 1) * spacing) / 2;
    for (let f = 0; ; f++) {
      const y = base + groundH + f * floorH + 0.9; if (y + winH > h - 0.6) break; if (y < minY) continue;
      for (let i = 0; i < n; i++) {
        const c = a0 + off + i * spacing;
        const lit_ = R() < lit, key = lit_ ? (R() < 0.15 ? K.glassBlue : K.glassLit) : K.glassDark;
        const o = 0.02 * outSign;
        if (axis === 'x') { // face normal along x
          if (B.useInteriors) B.window(new THREE.Vector3(fixed + outSign * 0.02, y, c + outSign * winW / 2), new THREE.Vector3(0, 0, -outSign), new THREE.Vector3(outSign, 0, 0), winW, winH, kindOf, 4 + R() * 2);
          else B.box(fixed + (outSign > 0 ? 0 : -0.03), y, c - winW / 2, fixed + (outSign > 0 ? 0.03 : 0), y + winH, c + winW / 2, key, { collide: false });
          if (!simple) B.box(fixed + (outSign > 0 ? 0 : -0.14), y - 0.12, c - winW / 2 - 0.12, fixed + (outSign > 0 ? 0.14 : 0), y - 0.02, c + winW / 2 + 0.12, lk, { collide: false });   // sill
          if (!simple) B.box(fixed + (outSign > 0 ? 0 : -0.08), y + winH, c - winW / 2 - 0.08, fixed + (outSign > 0 ? 0.08 : 0), y + winH + 0.16, c + winW / 2 + 0.08, lk, { collide: false }); // lintel
          if (lit_ && !simple) B.lightSources.push({ pos: new THREE.Vector3(fixed + outSign * 0.5, y + 1, c), color: new THREE.Color(0xffc58a), strength: 0.12 });
        } else {
          if (B.useInteriors) B.window(new THREE.Vector3(c - outSign * winW / 2, y, fixed + outSign * 0.02), new THREE.Vector3(outSign, 0, 0), new THREE.Vector3(0, 0, outSign), winW, winH, kindOf, 4 + R() * 2);
          else B.box(c - winW / 2, y, fixed + (outSign > 0 ? 0 : -0.03), c + winW / 2, y + winH, fixed + (outSign > 0 ? 0.03 : 0), key, { collide: false });
          if (!simple) B.box(c - winW / 2 - 0.12, y - 0.12, fixed + (outSign > 0 ? 0 : -0.14), c + winW / 2 + 0.12, y - 0.02, fixed + (outSign > 0 ? 0.14 : 0), lk, { collide: false });
          if (!simple) B.box(c - winW / 2 - 0.08, y + winH, fixed + (outSign > 0 ? 0 : -0.08), c + winW / 2 + 0.08, y + winH + 0.16, fixed + (outSign > 0 ? 0.08 : 0), lk, { collide: false });
          if (lit_ && !simple) B.lightSources.push({ pos: new THREE.Vector3(c, y + 1, fixed + outSign * 0.5), color: new THREE.Color(0xffc58a), strength: 0.12 });
        }
        void o;
      }
    }
  };
  if (faces.e) doFace('x', x1, z0, z1, 1);
  if (faces.w) doFace('x', x0, z0, z1, -1);
  if (faces.s) doFace('z', z1, x0, x1, 1);
  if (faces.n) doFace('z', z0, x0, x1, -1);
  // rooftop clutter
  if (!simple && h < 30 && R() < 0.7) { const cx = x0 + (x1 - x0) * (0.3 + R() * 0.4), cz = z0 + (z1 - z0) * (0.3 + R() * 0.4); B.box(cx - 1, h + 0.35, cz - 0.6, cx + 1, h + 1.5, cz + 0.6, K.steel, { collide: false }); }
}

// fire escape on a facade (x-facing or z-facing)
export function fireEscape(B, axis, fixed, a, y0, floors, floorH, outSign) {
  const K = M(B), w = 3.2, d = 1.2;
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * floorH;
    if (axis === 'x') { const xa = fixed, xb = fixed + outSign * d; B.box(Math.min(xa, xb), y, a - w / 2, Math.max(xa, xb), y + 0.06, a + w / 2, K.darkMetal, { collide: false }); B.box(Math.min(xa, xb), y + 0.9, a - w / 2, Math.max(xa, xb), y + 0.95, a + w / 2, K.darkMetal, { collide: false }); }
    else { const za = fixed, zb = fixed + outSign * d; B.box(a - w / 2, y, Math.min(za, zb), a + w / 2, y + 0.06, Math.max(za, zb), K.darkMetal, { collide: false }); B.box(a - w / 2, y + 0.9, Math.min(za, zb), a + w / 2, y + 0.95, Math.max(za, zb), K.darkMetal, { collide: false }); }
  }
}

// ---------------------------------------------------------------- vehicles & street furniture
export function car(B, x, z, ry = 0, color = 0x1a2a40, { wrecked = false } = {}) {
  const K = M(B);
  const key = 'car_' + color.toString(16) + (wrecked ? 'w' : '');
  ensure(B, key, () => phys({ color: wrecked ? 0x2a2622 : color, roughness: wrecked ? 0.9 : 0.35, metalness: wrecked ? 0.2 : 0.6, clearcoat: wrecked ? 0 : 1, clearcoatRoughness: 0.15 }));
  const parts = [], glass = [], tyres = [], lights = [], chrome = [];
  const L = 4.7, W = 1.82;
  parts.push(rbox(L, 0.62, W, 0.12, 0, 0.62, 0));                         // lower body
  parts.push(rbox(L * 0.98, 0.18, W * 0.96, 0.08, 0, 0.98, 0));
  parts.push(rbox(2.5, 0.55, W * 0.86, 0.14, -0.15, 1.3, 0));             // cabin
  glass.push(rbox(2.3, 0.45, W * 0.88, 0.1, -0.15, 1.31, 0));
  for (const sx of [-1.45, 1.45]) for (const sz of [-0.82, 0.82]) { const t = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20).rotateX(Math.PI / 2).translate(sx, 0.34, sz); tyres.push(t); chrome.push(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12).rotateX(Math.PI / 2).translate(sx, 0.34, sz)); }
  lights.push(rbox(0.05, 0.12, 0.35, 0.02, L / 2, 0.82, 0.6), rbox(0.05, 0.12, 0.35, 0.02, L / 2, 0.82, -0.6));
  const tail = [rbox(0.05, 0.12, 0.3, 0.02, -L / 2, 0.85, 0.62), rbox(0.05, 0.12, 0.3, 0.02, -L / 2, 0.85, -0.62)];
  const xf = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const fin = (arr) => { const g = mergeGeometries(arr); g.applyMatrix4(xf); return g; };
  if (wrecked) parts.forEach(p => { const pos = p.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.04); p.computeVertexNormals(); });
  addGeo(B, fin(parts), key); addGeo(B, fin(glass), wrecked ? K.darkMetal : K.glassDark); addGeo(B, fin(tyres), K.rubber); addGeo(B, fin(chrome), K.steel);
  if (!wrecked) { addGeo(B, fin(lights), K.lightWhite); addGeo(B, fin(tail), K.lightRed); }
  collide(B, x, 0.15, z, L, 0.95, W, ry, 'sheet');
  collide(B, x - 0.15 * Math.cos(ry), 1.0, z + 0.15 * Math.sin(ry), 2.5, 0.6, W * 0.86, ry, 'sheet');
  B.contactList.push([x, 0, z, L * 1.25, W * 1.6, ry]);
}
export function dumpster(B, x, z, ry = 0, colorKey) {
  const K = M(B); const key = colorKey || K.paintGreen;
  const g = [rbox(1.9, 1.1, 1.15, 0.04, 0, 0.62, 0), rbox(2.0, 0.08, 1.25, 0.03, 0, 1.2, 0.0)];
  const wheels = [];
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.45]) wheels.push(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2).translate(sx, 0.06, sz));
  const ribs = []; for (const sx of [-0.65, 0, 0.65]) ribs.push(rbox(0.08, 1.0, 1.2, 0.02, sx, 0.65, 0));
  const xf = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const f = a => { const m = mergeGeometries(a); m.applyMatrix4(xf); return m; };
  addGeo(B, f([...g, ...ribs]), key); addGeo(B, f(wheels), K.rubber);
  collide(B, x, 0, z, 2.0, 1.25, 1.25, ry, 'sheet');
  B.contactList.push([x, 0, z, 2.6, 1.8, ry]);
  B.stain(x + (Math.random() - 0.5) * 1.5, 0.002, z + (Math.random() - 0.5) * 1.5, 2.2, Math.random() * 6, 0, 0.7);
}
export function newsBox(B, x, z, ry = 0, colorKey) {
  const K = M(B); const key = colorKey || K.paintBlue;
  const xf = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const body = mergeGeometries([rbox(0.5, 0.62, 0.42, 0.03, 0, 0.62, 0), rbox(0.52, 0.06, 0.44, 0.02, 0, 0.96, 0), rbox(0.06, 0.32, 0.06, 0.01, -0.18, 0.16, 0), rbox(0.06, 0.32, 0.06, 0.01, 0.18, 0.16, 0)]);
  body.applyMatrix4(xf); addGeo(B, body, key);
  const win = new THREE.BoxGeometry(0.36, 0.22, 0.01).translate(0, 0.72, 0.215); win.applyMatrix4(xf); addGeo(B, win, K.glassDark);
  const paper = new THREE.BoxGeometry(0.32, 0.18, 0.005).translate(0, 0.72, 0.205); paper.applyMatrix4(xf); addGeo(B, paper, K.paper);
  collide(B, x, 0, z, 0.52, 1.0, 0.44, ry, 'sheet');
}
export function trashCan(B, x, z) { B.prop('metal_trash_can', x, 0, z, Math.random() * 6, 1, { surf: 'sheet' }); }
export function trashBags(B, x, z, n = 3) { for (let i = 0; i < n; i++) B.prop('trashbag', x + (Math.random() - 0.5) * 1.2, 0, z + (Math.random() - 0.5) * 1.0, Math.random() * 6, 0.9 + Math.random() * 0.3, { surf: 'plastic', collider: null }); }

// stacked sandbag wall from (ax,az) to (bx,bz), axis aligned
export function sandbags(B, ax, az, bx, bz, h = 1.1) {
  const K = M(B), horiz = Math.abs(bz - az) < 0.01;
  const len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az), rows = Math.round(h / 0.16), per = Math.max(1, Math.round(len / 0.6));
  const geos = [];
  for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
    const t = (i + (r % 2 ? 0.5 : 0.25)) / per; if (t > 1) continue;
    const g = new THREE.SphereGeometry(0.33, 10, 6); g.scale(1, 0.26, 0.6);
    const pos = g.attributes.position; for (let k = 0; k < pos.count; k++) pos.setY(k, pos.getY(k) * (1 + (Math.random() - 0.5) * 0.15));
    g.computeVertexNormals();
    if (!horiz) g.rotateY(Math.PI / 2);
    const x = horiz ? Math.min(ax, bx) + t * len : ax, z = horiz ? az : Math.min(az, bz) + t * len;
    g.translate(x + (Math.random() - 0.5) * 0.04, 0.09 + r * 0.155, z + (Math.random() - 0.5) * 0.04);
    geos.push(g);
  }
  addGeo(B, mergeGeometries(geos), K.sandbag);
  if (horiz) B.world.add(Math.min(ax, bx) - 0.1, 0, az - 0.35, Math.max(ax, bx) + 0.1, rows * 0.155 + 0.05, az + 0.35, 'dirt');
  else B.world.add(ax - 0.35, 0, Math.min(az, bz) - 0.1, ax + 0.35, rows * 0.155 + 0.05, Math.max(az, bz) + 0.1, 'dirt');
}
export function hesco(B, x, z, n = 3, horiz = true, h = 1.35) {
  const K = M(B), geos = [], mesh = [];
  for (let i = 0; i < n; i++) {
    const cx = horiz ? x + i * 1.06 : x, cz = horiz ? z : z + i * 1.06;
    geos.push(new THREE.BoxGeometry(1.0, h, 1.0).translate(cx, h / 2, cz));
    for (let k = 0; k < 4; k++) mesh.push(new THREE.BoxGeometry(1.02, 0.03, 1.02).translate(cx, 0.15 + k * (h - 0.2) / 3, cz));
  }
  addGeo(B, mergeGeometries(geos), K.hesco); addGeo(B, mergeGeometries(mesh), K.darkMetal);
  if (horiz) B.world.add(x - 0.5, 0, z - 0.5, x + (n - 1) * 1.06 + 0.5, h, z + 0.5, 'dirt'); else B.world.add(x - 0.5, 0, z - 0.5, x + 0.5, h, z + (n - 1) * 1.06 + 0.5, 'dirt');
}
const CONTAINER_TINT = [0x8a2b1f, 0x1f4d7a, 0x2f6b3a, 0xa36a1a, 0x5b5f63, 0x6d2a4a, 0x1d6a6a];
export function container(B, x, y, z, alongX = true, long = true, tint = null) {
  const L = long ? 12.19 : 6.06, W = 2.44, H = 2.59;
  const c = tint ?? CONTAINER_TINT[Math.floor(Math.random() * CONTAINER_TINT.length)];
  const key = 'cont_' + c.toString(16);
  if (!B.mats.has(key)) B.mat(key, 'container_side', { tile: 2.6, color: new THREE.Color(c).multiplyScalar(1.8), metalness: 0.5, roughness: 0.7 });
  const K = M(B);
  if (alongX) { B.box(x - L / 2, y, z - W / 2, x + L / 2, y + H, z + W / 2, key, { surf: 'sheet', uvRot: true }); B.box(x + L / 2, y + 0.05, z - W / 2 + 0.05, x + L / 2 + 0.05, y + H - 0.05, z + W / 2 - 0.05, K.darkMetal, { collide: false }); }
  else { B.box(x - W / 2, y, z - L / 2, x + W / 2, y + H, z + L / 2, key, { surf: 'sheet', uvRot: true }); B.box(x - W / 2 + 0.05, y + 0.05, z + L / 2, x + W / 2 - 0.05, y + H - 0.05, z + L / 2 + 0.05, K.darkMetal, { collide: false }); }
  if (y < 0.1) B.contactList.push([x, 0, z, alongX ? L * 1.1 : W * 1.6, alongX ? W * 1.6 : L * 1.1, 0]);
}
// chain-link fence: posts + see-through mesh; blocks movement, not bullets or sight
let chainTex = null;
function chainTexture() {
  if (chainTex) return chainTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(200,200,200,1)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
  chainTex = new THREE.CanvasTexture(c); chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping; return chainTex;
}
export function fence(B, ax, az, bx, bz, h = 2.2) {
  const K = M(B);
  ensure(B, 'chain', () => std({ color: 0x9aa0a4, metalness: 0.8, roughness: 0.4, alphaMap: chainTexture(), alphaTest: 0.5, side: THREE.DoubleSide, transparent: false }));
  const horiz = Math.abs(bz - az) < 0.01, len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az);
  const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.12, uv.getY(i) * h / 0.12);
  if (!horiz) g.rotateY(Math.PI / 2);
  g.translate((ax + bx) / 2, h / 2, (az + bz) / 2);
  addGeo(B, g, 'chain');
  const posts = []; const n = Math.ceil(len / 3);
  for (let i = 0; i <= n; i++) { const t = i / n; posts.push(new THREE.CylinderGeometry(0.03, 0.03, h + 0.1, 8).translate(ax + (bx - ax) * t, (h + 0.1) / 2, az + (bz - az) * t)); }
  posts.push(new THREE.CylinderGeometry(0.02, 0.02, len, 6).rotateZ(Math.PI / 2).rotateY(horiz ? 0 : Math.PI / 2).translate((ax + bx) / 2, h, (az + bz) / 2));
  addGeo(B, mergeGeometries(posts), K.steel);
  if (horiz) B.world.add(Math.min(ax, bx), 0, az - 0.04, Math.max(ax, bx), h, az + 0.04, 'metal', { shoot: false, see: false });
  else B.world.add(ax - 0.04, 0, Math.min(az, bz), ax + 0.04, h, Math.max(az, bz), 'metal', { shoot: false, see: false });
}
// straight stair run along +x / -x / +z / -z rising from y0 to y1
export function stairs(B, x, z, dir, width, y0, y1, key, surf = 'concrete') {
  const steps = Math.ceil((y1 - y0) / 0.18), rise = (y1 - y0) / steps, run = 0.28;
  for (let i = 0; i < steps; i++) {
    const a = i * run, b = (i + 1) * run, top = y0 + (i + 1) * rise;
    if (dir === '+x') B.box(x + a, y0, z - width / 2, x + b, top, z + width / 2, key, { surf });
    if (dir === '-x') B.box(x - b, y0, z - width / 2, x - a, top, z + width / 2, key, { surf });
    if (dir === '+z') B.box(x - width / 2, y0, z + a, x + width / 2, top, z + b, key, { surf });
    if (dir === '-z') B.box(x - width / 2, y0, z - b, x + width / 2, top, z - a, key, { surf });
  }
  return steps * run;
}
// office cubicle cluster: 2 x n desks with 1.35 m fabric partitions (drywall-weak: bullets go through)
export function cubicles(B, x, z, n, alongX = true) {
  const K = M(B);
  ensure(B, 'partition', () => std({ color: 0x5d6066, roughness: 0.95 }));
  ensure(B, 'desktop', () => std({ color: 0xb9ab95, roughness: 0.55 }));
  const cw = 1.8, cd = 1.6;
  for (let i = 0; i < n; i++) for (let s = 0; s < 2; s++) {
    const cx = alongX ? x + i * cw : x + (s ? cd / 2 : -cd / 2), cz = alongX ? z + (s ? cd / 2 : -cd / 2) : z + i * cw;
    if (alongX) {
      B.box(cx - cw / 2, 0, z - 0.03, cx + cw / 2, 1.35, z + 0.03, 'partition', { surf: 'drywall' });
      B.box(cx - cw / 2 - 0.03, 0, cz - cd / 2, cx - cw / 2 + 0.03, 1.35, cz + cd / 2, 'partition', { surf: 'drywall' });
      B.box(cx - cw / 2 + 0.05, 0.72, cz - (s ? -0.05 : 0.75), cx + cw / 2 - 0.05, 0.75, cz + (s ? 0.75 : -0.05), 'desktop', { surf: 'wood', nav: false });
      B.box(cx - 0.25, 0.75, cz - 0.1 + (s ? 0.2 : -0.2) * 0, cx + 0.25, 1.05, cz + 0.0, K.plasticBlack, { collide: false });
    } else {
      B.box(x - 0.03, 0, cz - cw / 2, x + 0.03, 1.35, cz + cw / 2, 'partition', { surf: 'drywall' });
      B.box(cx - cd / 2, 0, cz - cw / 2 - 0.03, cx + cd / 2, 1.35, cz - cw / 2 + 0.03, 'partition', { surf: 'drywall' });
      B.box(cx - (s ? -0.05 : 0.75), 0.72, cz - cw / 2 + 0.05, cx + (s ? 0.75 : -0.05), 0.75, cz + cw / 2 - 0.05, 'desktop', { surf: 'wood', nav: false });
    }
  }
  if (alongX) B.box(x + n * cw - cw / 2 - 0.03, 0, z - cd, x + n * cw - cw / 2 + 0.03, 1.35, z + cd, 'partition', { surf: 'drywall' });
  else B.box(x - cd, 0, z + n * cw - cw / 2 - 0.03, x + cd, 1.35, z + n * cw - cw / 2 + 0.03, 'partition', { surf: 'drywall' });
}
export function pallets(B, x, z, n = 1, crates = true) {
  ensure(B, 'pallet', () => std({ color: 0x8a6a45, roughness: 0.85 }));
  for (let i = 0; i < n; i++) B.box(x - 0.6, i * 0.15, z - 0.5, x + 0.6, i * 0.15 + 0.14, z + 0.5, 'pallet', { surf: 'wood' });
  if (crates) B.prop('cardboard_box_01', x, n * 0.15, z, Math.random() * 0.4, 2.2, { surf: 'plastic' });
}

// ---------------------------------------------------------------- Blender-built vehicles (from Rain City)
// kinds: sedan / taxi / van / plumber. Separate wheel models (outer face +x) on the axle anchors.
const VEH = {
  sedan: { body: 'crownvic_sedan', wheel: 'crownvic_wheel_sedan', wheels: [[0.805, 1.4565], [-0.805, 1.4565], [0.837, -1.4565], [-0.837, -1.4565]], r: 0.338 },
  taxi: { body: 'crownvic_taxi', wheel: 'crownvic_wheel_taxi', wheels: [[0.805, 1.4565], [-0.805, 1.4565], [0.837, -1.4565], [-0.837, -1.4565]], r: 0.338, color: 0xf2b705 },
  van: { body: 'savana_plain', wheel: 'savana_wheel', wheels: [[0.86, 1.915], [-0.86, 1.915], [0.86, -1.515], [-0.86, -1.515]], r: 0.383 },
  plumber: { body: 'savana_plumbing', wheel: 'savana_wheel', wheels: [[0.86, 1.915], [-0.86, 1.915], [0.86, -1.515], [-0.86, -1.515]], r: 0.383, color: 0xf4f4f1 },
};
import { gltf } from '../core/assets.js';
import { mergeGeometries as mergeRaw } from 'three/addons/utils/BufferGeometryUtils.js';
export function vehicle(B, kind, x, z, ry = 0, color = null, { wrecked = false, y = 0 } = {}) {
  const V = VEH[kind] || VEH.sedan;
  // instanced: every vehicle of one body+wheel kind (and wreck state) shares one draw per material
  if (!B._veh) { B._veh = new Map(); B.finishHooks.push(() => flushVehicles(B)); }
  // grouped per 32 m cell too, so lamp shadow cameras and the reflection pass can cull whole groups
  const key = kind + (wrecked ? ':w' : '') + '@' + Math.floor(x / 32) + ',' + Math.floor(z / 32);
  if (!B._veh.has(key)) B._veh.set(key, { kind, V, wrecked, list: [] });
  B._veh.get(key).list.push({ x, y: y + (wrecked ? -0.06 : 0), z, ry, color: new THREE.Color(wrecked ? 0x241e1a : (V.color ?? color ?? 0x15181c)) });
  const job = Promise.resolve();
  B.propJobs.push(job);
  // collision: lower body + cabin (sheet metal, bullets go through doors)
  const L = kind === 'van' || kind === 'plumber' ? 5.8 : 5.45, W = kind === 'van' || kind === 'plumber' ? 2.05 : 1.98, H1 = kind === 'van' || kind === 'plumber' ? 2.05 : 1.05;
  const off = 0.16;   // body is a little longer at the back (z+) in model space
  const cx = x + Math.sin(ry) * off, cz = z + Math.cos(ry) * off;
  collide(B, cx, y + 0.2, cz, L, H1 - 0.2, W, ry + Math.PI / 2, 'sheet');
  if (H1 < 1.5) collide(B, cx - Math.sin(ry) * 0.2, y + H1, cz - Math.cos(ry) * 0.2, 2.6, 0.45, W * 0.86, ry + Math.PI / 2, 'sheet');
  B.contactList.push([x, y, z, W * 1.3, L * 1.15, ry]);
}

// merge one vehicle (body + 4 wheels) per material in vehicle space (once per body kind), then one
// InstancedMesh per material per 32 m cell
async function flushVehicles(B) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  const tpl = new Map();
  const template = async (V, wrecked) => {
    const key = V.body + (wrecked ? ':w' : '');
    if (tpl.has(key)) return tpl.get(key);
    const [bg, wg] = await Promise.all([gltf(`lo/${V.body}.glb`), gltf(`lo/dec/${V.wheel}.glb`)]);
    const parts = new Map();   // material name -> { mat, geos[], paint }
    const add = (root, mtx) => {
      root.updateMatrixWorld(true);
      root.traverse(o => {
        if (!o.isMesh) return;
        const n = o.material.name || 'm';
        if (wrecked && /glass/.test(n)) return;
        // the Rain City cars are untextured: fold the ~20 colour-only materials into a few shared
        // ones (vertex colours), keeping paint (per-instance colour), glass and each light lens apart
        const m0 = o.material, lit = /head|tail|amber|reverse/.test(n) || (m0.emissive && m0.emissive.getHex() && m0.emissiveIntensity > 0);
        const key = n === 'paint' ? 'paint' : (/glass/.test(n) || m0.transparent) ? 'glass' : lit ? n : (m0.metalness >= 0.5 || /chrome/.test(n)) ? 'metal' : m0.roughness > 0.6 ? 'matteR' : 'matteS';
        let P = parts.get(key);
        if (!P) {
          let mat = m0.clone();
          if (key === 'paint') { mat.color.set(0xffffff); if (wrecked) { mat.roughness = 0.95; mat.clearcoat = 0; mat.metalness = 0.3; } }
          else if (!lit) { mat.vertexColors = true; mat.color.set(0xffffff); }
          if (wrecked && (lit || key === 'metal')) { mat.color.multiplyScalar(0.25); mat.roughness = 0.8; if (mat.emissive) mat.emissiveIntensity = 0; }
          parts.set(key, P = { mat, geos: [], paint: key === 'paint', vc: key !== 'paint' && !lit });
        }
        let g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(mtx, o.matrixWorld));
        if (g.index) g = g.toNonIndexed();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (P.vc) { const c = m0.color, N = g.attributes.position.count, a = new Float32Array(N * 3); for (let i = 0; i < N; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
        g.morphAttributes = {};
        P.geos.push(g);
      });
    };
    add(bg.scene, new THREE.Matrix4());
    for (const [wx, wy] of V.wheels) add(wg.scene, new THREE.Matrix4().compose(p.set(wx, V.r - (wrecked && wx < 0 ? 0.12 : 0), -wy), q.setFromEuler(e.set(0, wx < 0 ? Math.PI : 0, 0)), one));
    const out = [...parts.values()].map(P => ({ mat: P.mat, paint: P.paint, geo: mergeRaw(P.geos) }));
    tpl.set(key, out);
    return out;
  };
  for (const { V, wrecked, list } of B._veh.values()) {
    let parts;
    try { parts = await template(V, wrecked); } catch (err) { console.warn('[map] vehicle', V.body, err.message); continue; }
    for (const P of parts) {
      const im = new THREE.InstancedMesh(P.geo, P.mat, list.length);
      list.forEach((v, i) => {
        im.setMatrixAt(i, m4.compose(p.set(v.x, v.y, v.z), q.setFromEuler(e.set(0, v.ry, wrecked ? 0.04 : 0, 'YXZ')), one));
        if (P.paint) im.setColorAt(i, v.color);
      });
      im.castShadow = true; im.receiveShadow = true; im.name = 'vehicles:' + V.body;
      im.computeBoundingSphere();
      B.group.add(im);
    }
  }
}
