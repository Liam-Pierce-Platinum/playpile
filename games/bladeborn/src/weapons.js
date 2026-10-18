// Low-poly, clean, readable weapons, modelled in their own frame: blades and barrels run along -Y from the grip at
// the origin; a gun's top is -Z (grip and magazine toward +Z); a blade's edge is +Z, its spine -Z. How each one sits
// in the hand (grip offset and orientation) is src/pose.js GRIP; claws use the canonical claw frame (src/hero.js).
import * as THREE from 'three';

const G2 = x => new THREE.Color().setRGB(x, x, x, THREE.SRGBColorSpace);
export const WMAT = {
  steel: new THREE.MeshStandardMaterial({ color: G2(0.82), metalness: 1, roughness: 0.22, flatShading: true }),
  edge: new THREE.MeshStandardMaterial({ color: G2(0.95), metalness: 1, roughness: 0.12, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: G2(0.1), metalness: 0.6, roughness: 0.45, flatShading: true }),
  grip: new THREE.MeshStandardMaterial({ color: G2(0.06), roughness: 0.85, flatShading: true }),
  wrap: new THREE.MeshStandardMaterial({ color: G2(0.3), roughness: 0.9, flatShading: true }),
  pipe: new THREE.MeshStandardMaterial({ color: G2(0.45), metalness: 0.7, roughness: 0.5, flatShading: true }),
};
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const cyl = (r0, r1, h, mat, x = 0, y = 0, z = 0, seg = 6) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
// a flat blade along -Y: profile (half-widths along the length, 0 = base), thickness, optional curve (z offset by t)
function blade(len, w0, w1, tipLen, thick, mat, curve = 0) {
  const s = new THREE.Shape(); s.moveTo(-w0, 0); s.lineTo(-w1, -(len - tipLen)); s.lineTo(w1 * 0.2, -len); s.lineTo(w1, -(len - tipLen * 0.4)); s.lineTo(w0, 0); s.lineTo(-w0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.5, bevelSize: Math.min(w1, w0) * 0.5, bevelSegments: 1 });
  g.translate(0, 0, -thick / 2);
  if (curve) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = -p.getY(i) / len; p.setX(i, p.getX(i) + curve * t * t); } g.computeVertexNormals(); }
  // blades in the XY plane: rotate so the flat faces X (edge leads in a sweep)
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

// the hero's three blades: tapered, chisel-tipped, out of a knuckle housing
export function clawBlade() {
  const g = new THREE.Group();
  const b = blade(1, 0.0075, 0.0055, 0.14, 0.0028, WMAT.edge); b.rotation.y = Math.PI; g.add(b); // long cutting edge on the palm side (-Z)
  return g;
}
export function clawHousing() {
  const g = new THREE.Group();
  g.add(box(0.066, 0.05, 0.012, WMAT.dark, 0, 0.0, 0.03));               // plate along the back of the hand
  for (let i = -1; i <= 1; i++) g.add(box(0.012, 0.026, 0.016, WMAT.steel, i * 0.022, -0.028, 0.02)); // sheaths over the knuckles
  return g;
}

export function makeWeapon(kind) {
  const g = new THREE.Group(); g.name = kind; let muzzle = null;
  if (kind === 'baton') { g.add(cyl(0.017, 0.017, 0.14, WMAT.grip, 0, 0.0)); g.add(cyl(0.022, 0.022, 0.012, WMAT.dark, 0, -0.075)); g.add(cyl(0.014, 0.017, 0.5, WMAT.dark, 0, -0.33)); g.add(cyl(0.017, 0.014, 0.03, WMAT.dark, 0, -0.6)); }
  if (kind === 'pipe') { g.add(cyl(0.02, 0.02, 0.62, WMAT.pipe, 0, -0.25)); g.add(cyl(0.028, 0.028, 0.05, WMAT.pipe, 0, -0.56)); const tape = cyl(0.023, 0.023, 0.13, WMAT.wrap, 0, 0.0); g.add(tape); }
  if (kind === 'machete') { g.add(box(0.026, 0.13, 0.036, WMAT.grip, 0, 0.01)); g.add(box(0.03, 0.012, 0.05, WMAT.dark, 0, -0.06)); const b = blade(0.48, 0.022, 0.035, 0.1, 0.004, WMAT.steel); b.position.y = -0.06; g.add(b); }
  if (kind === 'katana') {
    g.add(box(0.026, 0.24, 0.03, WMAT.wrap, 0, 0.06)); for (let i = 0; i < 5; i++) g.add(box(0.03, 0.006, 0.034, WMAT.grip, 0, 0.15 - i * 0.05));
    g.add(cyl(0.04, 0.04, 0.008, WMAT.dark, 0, -0.065, 0, 8));            // tsuba
    const b = blade(0.78, 0.014, 0.013, 0.06, 0.004, WMAT.edge, 0.05); b.position.y = -0.07; g.add(b);
  }
  if (kind === 'pistol') { // barrel along -Y, grip down into the fist (+Z is the back of the hand, so the grip is at the origin)
    g.add(box(0.03, 0.2, 0.045, WMAT.dark, 0, -0.07, -0.035)); g.add(box(0.026, 0.05, 0.11, WMAT.grip, 0, 0.0, 0.01)); g.add(box(0.012, 0.03, 0.02, WMAT.dark, 0, -0.035, 0.03));
    muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.175, -0.035);
  }
  if (kind === 'smg') {
    g.add(box(0.035, 0.3, 0.055, WMAT.dark, 0, -0.09, -0.04)); g.add(box(0.026, 0.05, 0.1, WMAT.grip, 0, 0.0, 0.01)); g.add(box(0.02, 0.04, 0.16, WMAT.dark, 0, -0.07, 0.06));  // body, grip, magazine
    g.add(cyl(0.01, 0.01, 0.08, WMAT.dark, 0, -0.27, -0.04)); for (const x of [-0.012, 0.012]) g.add(box(0.008, 0.16, 0.01, WMAT.dark, x, 0.13, -0.03)); g.add(box(0.034, 0.016, 0.07, WMAT.grip, 0, 0.21, -0.02)); // barrel, wire stock + butt plate
    muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.31, -0.04);
  }
  if (kind === 'shotgun') {
    g.add(cyl(0.016, 0.016, 0.62, WMAT.dark, 0, -0.28, -0.05)); g.add(cyl(0.014, 0.014, 0.5, WMAT.dark, 0, -0.24, -0.02)); g.add(box(0.04, 0.12, 0.05, WMAT.grip, 0, -0.3, -0.01)); // barrel, tube, pump
    g.add(box(0.034, 0.16, 0.05, WMAT.dark, 0, -0.02, -0.04)); g.add(box(0.028, 0.06, 0.09, WMAT.grip, 0, 0.0, 0.015)); g.add(box(0.03, 0.22, 0.06, WMAT.wrap, 0, 0.18, -0.02)); // receiver, grip, stock
    muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.6, -0.05);
  }
  if (kind === 'rifle' || kind === 'sniper') { // assault rifle / bolt sniper: long receiver, barrel, stock; the sniper adds a scope
    const L = kind === 'sniper' ? 0.62 : 0.42;
    g.add(box(0.036, 0.36, 0.06, WMAT.dark, 0, -0.12, -0.04)); g.add(box(0.026, 0.05, 0.1, WMAT.grip, 0, 0.0, 0.01)); // receiver, grip
    if (kind === 'rifle') g.add(box(0.022, 0.06, 0.15, WMAT.dark, 0, -0.1, 0.06)); // magazine
    g.add(cyl(0.011, 0.011, L, WMAT.dark, 0, -0.3 - L / 2 + 0.06, -0.045)); g.add(box(0.03, 0.24, 0.07, WMAT.grip, 0, 0.17, -0.03)); // barrel, stock
    if (kind === 'sniper') g.add(cyl(0.02, 0.02, 0.2, WMAT.steel, 0, -0.12, -0.1, 8));
    muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.24 - L, -0.045);
  }
  if (muzzle) { g.add(muzzle); g.userData.muzzle = muzzle; const fl = muzzleFlash(); muzzle.add(fl); g.userData.flash = fl; }
  return g;
}
// a white star flash at the muzzle, shown for a blink on every shot
function muzzleFlash() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.18), m); p.position.y = -0.08; p.rotation.y = i * Math.PI / 3; g.add(p); }
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), m); g.add(c);
  g.visible = false; return g;
}
export const MELEE_SET = { baton: 'baton', pipe: 'baton', machete: 'sword', katana: 'sword', fists: 'fists' };
// where it rides when not drawn: [bone, position (m, bone frame), euler]
export const HOLSTER = {
  pistol: ['Hips', [-0.17, 0.02, 0.02], [0, 0, Math.PI]], smg: ['Spine2', [0.05, 0.05, 0.16], [0, 0, 2.6]], rifle: ['Spine2', [0.05, 0.05, 0.17], [0, 0, 2.6]], sniper: ['Spine2', [0.0, 0.05, 0.17], [0, 0, 2.5]], shotgun: ['Spine2', [0, 0.02, 0.17], [0, 0, 2.5]],
  baton: ['Hips', [0.17, 0.0, 0.0], [0.2, 0, Math.PI]], pipe: ['Spine2', [0.05, 0.05, 0.16], [0, 0, 2.7]], machete: ['Hips', [0.17, 0.0, 0.03], [0.1, 0, Math.PI]], katana: ['Spine2', [0.0, 0.05, 0.17], [0, 0, 2.5]],
};
