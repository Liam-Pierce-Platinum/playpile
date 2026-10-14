// Procedural low-poly models: five player planes, raider fighters, bombers, the airship boss and
// the little cartoon pilot (helmet, goggles, flapping scarf, head that tracks targets).
// Convention: forward = -Z, up = +Y, right = +X. Sizes in metres (cartoon proportions).
import * as THREE from '../vendor/three.module.js';

const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.5, metalness: o.metal ?? 0.08, flatShading: !!o.flat, ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}), ...(o.transparent ? { transparent: true, opacity: o.opacity, depthWrite: false } : {}) });
  matCache.set(key, m);
  return m;
}
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

/** smooth body of revolution along -Z: profile = [[radius, z], ...] from nose (negative z) to tail */
function body(profile, color, seg = 14, sy = 1) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(0.001, r), -z));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(-Math.PI / 2); // lathe Y axis -> -Z ... (y=-z input => +z)
  g.scale(1, sy, 1);
  g.computeVertexNormals();
  return new THREE.Mesh(g, color);
}

/** a wing planform extruded with soft bevels. span along X, chord along Z (leading edge at -Z) */
function wing(span, rootChord, tipChord, sweep, thick, material, dihedral = 0) {
  const s = new THREE.Shape();
  const h = span / 2;
  s.moveTo(-h, -tipChord / 2 + sweep);
  s.quadraticCurveTo(-h - tipChord * 0.35, sweep, -h, tipChord / 2 + sweep);
  s.lineTo(0, rootChord / 2);
  s.lineTo(h, tipChord / 2 + sweep);
  s.quadraticCurveTo(h + tipChord * 0.35, sweep, h, -tipChord / 2 + sweep);
  s.lineTo(0, -rootChord / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.5, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2);
  if (dihedral) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.abs(p.getX(i)) * dihedral);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}
function fin(height, chord, thick, material) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(chord, 0); s.quadraticCurveTo(chord * 0.55, height * 0.6, chord * 0.35, height); s.quadraticCurveTo(chord * 0.05, height, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2); // chord now along +Z (trailing edge toward +z)
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function propeller(blades, radius, colorHub) {
  const g = new THREE.Group();
  const hub = mesh(new THREE.ConeGeometry(0.42, 0.9, 10), mat(colorHub), 0, 0, -0.35);
  hub.rotation.x = -Math.PI / 2; g.add(hub);
  const bg = new THREE.BoxGeometry(0.28, radius, 0.08); bg.translate(0, radius / 2, 0);
  const bm = mat(0x3a2a20, { rough: 0.7 });
  for (let i = 0; i < blades; i++) { const b = new THREE.Mesh(bg, bm); b.rotation.z = (i / blades) * Math.PI * 2; b.rotation.y = 0.3; g.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  g.add(disc);
  g.userData.disc = disc;
  return g;
}

// ---------------------------------------------------------------- the pilot
const SKIN = 0xf2c29b;
export function makePilot(scarfColor = 0xe8433a) {
  const p = new THREE.Group();
  const jacket = mat(0x7a4b2a, { rough: 0.8 });
  const torso = mesh(new THREE.SphereGeometry(0.62, 12, 10), jacket, 0, 0.05, 0.05); torso.scale.set(1.05, 1.05, 0.85); p.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.95, 0); p.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(SKIN, { rough: 0.6 })));
  // leather helmet (top half) + ear flaps
  const helm = mesh(new THREE.SphereGeometry(0.585, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x6b3f22, { rough: 0.7 }), 0, 0.04, 0.02);
  head.add(helm);
  for (const sx of [-1, 1]) { const flap = mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0x6b3f22, { rough: 0.7 }), sx * 0.52, -0.12, 0.05); flap.scale.set(0.6, 1.3, 1); head.add(flap); }
  // goggles: two brass rings with glass, on the forehead strap
  const brass = mat(0xc9a14a, { metal: 0.6, rough: 0.3 });
  const glass = mat(0x9fe0ff, { metal: 0.2, rough: 0.05, emissive: 0x2a6f90, ei: 0.5 });
  for (const sx of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14), brass, sx * 0.2, 0.12, -0.5); head.add(ring);
    const lens = mesh(new THREE.CircleGeometry(0.15, 12), glass, sx * 0.2, 0.12, -0.51); lens.rotation.y = Math.PI; head.add(lens);
  }
  const strap = mesh(new THREE.TorusGeometry(0.575, 0.045, 6, 24), mat(0x2a2a2a), 0, 0.12, 0); strap.rotation.x = Math.PI / 2; head.add(strap);
  // big grin + nose
  const nose = mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xe8a882), 0, -0.05, -0.53); head.add(nose);
  const smile = mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12, Math.PI), mat(0x5a2a1a), 0, -0.2, -0.47); smile.rotation.z = Math.PI; head.add(smile);
  // scarf: a knot at the neck + a chain of segments that trail and flap
  const sm = mat(scarfColor, { rough: 0.8 });
  const collar = mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 18), mat(0xefe2c4, { rough: 0.95 }), 0, 0.48, 0.04); collar.rotation.x = Math.PI / 2; p.add(collar);
  const knot = mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 16), sm, 0, 0.55, 0); knot.rotation.x = Math.PI / 2; p.add(knot);
  const scarf = [];
  let parent = p; const segLen = 0.42;
  const sg = new THREE.BoxGeometry(0.42, 0.07, segLen); sg.translate(0, 0, segLen / 2);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(sg, sm);
    if (i === 0) { s.position.set(0.3, 0.55, 0.3); s.userData.base = 0.55; } else s.position.set(0, 0, segLen * 0.95);
    parent.add(s); scarf.push(s); parent = s;
    s.scale.set(1 - i * 0.07, 1, 1);
  }
  // arm on the stick
  const arm = mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), jacket, 0.42, -0.05, -0.3); arm.rotation.x = -1.1; p.add(arm);
  p.userData = { head, scarf };
  return p;
}

export function animatePilot(pilot, t, speed01, lookYaw, lookPitch, roll) {
  const u = pilot.userData;
  u.head.rotation.y += (lookYaw - u.head.rotation.y) * 0.12;
  u.head.rotation.x += (lookPitch - u.head.rotation.x) * 0.12;
  u.head.rotation.z = -roll * 0.15;
  const amp = 0.18 + speed01 * 0.35;
  for (let i = 0; i < u.scarf.length; i++) {
    const s = u.scarf[i];
    s.rotation.y = (s.userData.base || 0) + Math.sin(t * 17 - i * 0.9) * amp * (0.5 + i * 0.16);
    s.rotation.x = (i === 0 ? -0.15 : 0) + Math.sin(t * 13 - i * 1.3) * amp * 0.5 - speed01 * 0.02;
  }
}

// ---------------------------------------------------------------- planes
function finish(g, o) {
  g.userData = Object.assign({ props: [], pilot: null, engine: new THREE.Vector3(0, 0, -2.5), size: 1 }, o);
  g.traverse((m) => { if (m.isMesh) m.frustumCulled = true; });
  return g;
}
function gunLayout(n, wingX, wingY, wingZ, noseGuns = 2, noseZ = -2.8, noseY = 0.6) {
  const out = [];
  const nn = Math.min(n, noseGuns);
  for (let i = 0; i < nn; i++) out.push(new THREE.Vector3(nn === 1 ? 0 : (i ? 0.35 : -0.35), noseY, noseZ));
  for (let k = 0; out.length < n; k++) {
    const x = wingX + k * 0.75;
    out.push(new THREE.Vector3(-x, wingY, wingZ)); if (out.length < n) out.push(new THREE.Vector3(x, wingY, wingZ));
  }
  return out;
}

function sparrow(c) {
  const g = new THREE.Group();
  const B = mat(c.body), W = mat(c.wing, { rough: 0.7 }), T = mat(c.trim);
  g.add(body([[0.01, -3.3], [0.95, -3.1], [1.05, -2.4], [0.95, -0.6], [0.7, 1.6], [0.25, 3.6], [0.05, 3.9]], B));
  const cowl = mesh(new THREE.CylinderGeometry(1.08, 1.0, 1.0, 14, 1, true), T, 0, 0, -2.85); cowl.rotation.x = Math.PI / 2; g.add(cowl);
  const lower = wing(9, 1.8, 1.5, 0, 0.18, W, 0.04); lower.position.set(0, -0.6, -0.9); g.add(lower);
  const upper = wing(9.6, 1.8, 1.5, 0.1, 0.18, W); upper.position.set(0, 1.55, -1.3); g.add(upper);
  const strutM = mat(0x5a4636, { rough: 0.9 });
  for (const sx of [-3.4, -0.9, 0.9, 3.4]) { const s = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.15, 5), strutM, sx, 0.47, -1.1); s.rotation.x = 0.12; g.add(s); }
  const tf = fin(1.5, 1.4, 0.12, B); tf.position.set(0, 0.25, 2.7); g.add(tf);
  const ts = wing(3.4, 1.1, 0.8, 0.1, 0.1, W); ts.position.set(0, 0.2, 3.3); g.add(ts);
  for (const sx of [-1, 1]) {
    const st = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5), strutM, sx * 0.7, -1.1, -1.5); st.rotation.z = sx * 0.4; g.add(st);
    const wh = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 12), mat(0x222222), sx * 1.0, -1.7, -1.5); wh.rotation.z = Math.PI / 2; g.add(wh);
  }
  const prop = propeller(2, 1.6, c.trim); prop.position.set(0, 0, -3.35); g.add(prop);
  const ring = mesh(new THREE.TorusGeometry(0.72, 0.12, 8, 18), mat(0x4a3424, { rough: 0.8 }), 0, 0.72, 0.05); ring.rotation.x = Math.PI / 2; g.add(ring);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.3, 0.1), guns: (n) => gunLayout(n, 2.2, -0.5, -1.7, 2, -2.9, 0.75), engine: new THREE.Vector3(0, 0.3, -2.4), jet: false });
}
function kestrel(c) {
  const g = new THREE.Group();
  const B = mat(c.body), W = mat(c.wing), T = mat(c.trim);
  g.add(body([[0.01, -3.9], [0.55, -3.8], [0.85, -3.2], [0.95, -1.5], [0.8, 0.8], [0.4, 3.2], [0.1, 4.3]], B));
  const w = wing(10.5, 2.6, 1.2, 0.35, 0.22, W, 0.06); w.position.set(0, -0.45, -0.6); g.add(w);
  const stripe = mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.4, 14, 1, true), T, 0, 0, -2.6); stripe.rotation.x = Math.PI / 2; g.add(stripe);
  const tf = fin(1.8, 1.6, 0.12, B); tf.position.set(0, 0.2, 2.6); g.add(tf);
  const ts = wing(3.8, 1.3, 0.7, 0.25, 0.1, W); ts.position.set(0, 0.15, 3.4); g.add(ts);
  const prop = propeller(3, 1.75, c.trim); prop.position.set(0, 0, -3.95); g.add(prop);
  const ws = mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.5, 10, 1, true, -Math.PI / 2.4, Math.PI / 1.2), mat(0xbfe8ff, { transparent: true, opacity: 0.45, rough: 0.05 }), 0, 0.9, -0.95); ws.rotation.x = -0.5; g.add(ws);
  const ring = mesh(new THREE.TorusGeometry(0.66, 0.11, 8, 18), mat(0x333344), 0, 0.72, -0.1); ring.rotation.x = Math.PI / 2; g.add(ring);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.3, -0.05), guns: (n) => gunLayout(n, 2.0, -0.4, -1.6, 2, -3.3, 0.55), engine: new THREE.Vector3(0, 0.3, -2.8), jet: false });
}
function bulldog(c) {
  const g = new THREE.Group();
  const B = mat(c.body), W = mat(c.wing), T = mat(c.trim);
  g.add(body([[0.01, -4], [1.15, -3.9], [1.35, -3.2], [1.35, -1.2], [1.1, 1.0], [0.5, 3.6], [0.12, 4.7]], B, 16));
  const cowl = mesh(new THREE.CylinderGeometry(1.42, 1.35, 1.2, 16, 1, true), T, 0, 0, -3.4); cowl.rotation.x = Math.PI / 2; g.add(cowl);
  const w = wing(12, 3.0, 1.6, 0.25, 0.32, W, 0.05); w.position.set(0, -0.7, -0.5); g.add(w);
  const tf = fin(2.1, 2, 0.15, B); tf.position.set(0, 0.35, 2.8); g.add(tf);
  const ts = wing(4.6, 1.5, 0.9, 0.2, 0.12, W); ts.position.set(0, 0.25, 3.8); g.add(ts);
  const prop = propeller(4, 1.95, c.trim); prop.position.set(0, 0, -4.05); g.add(prop);
  // armour plates + bomb-shaped drop tank
  const tank = mesh(new THREE.CapsuleGeometry(0.35, 1.8, 4, 10), T, 0, -1.55, -0.6); tank.rotation.x = Math.PI / 2; g.add(tank);
  const ring = mesh(new THREE.TorusGeometry(0.72, 0.13, 8, 18), mat(0x3a3a2a), 0, 1.0, 0.05); ring.rotation.x = Math.PI / 2; g.add(ring);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.55, 0.1), guns: (n) => gunLayout(n, 2.1, -0.6, -1.8, 2, -3.6, 0.9), engine: new THREE.Vector3(0, 0.3, -3.2), jet: false, size: 1.15 });
}
function hornet(c) {
  const g = new THREE.Group();
  const B = mat(c.body), W = mat(c.wing), T = mat(c.trim);
  g.add(body([[0.01, -3.4], [0.7, -3.25], [0.95, -2.4], [0.95, 0.2], [0.65, 1.6], [0.3, 2.2]], B));
  const w = wing(11, 2.4, 1.3, 0.2, 0.22, W, 0.03); w.position.set(0, -0.2, -0.3); g.add(w);
  for (const sx of [-1, 1]) {
    const boom = body([[0.01, -2.6], [0.4, -2.4], [0.45, -1.4], [0.32, 2.5], [0.18, 5.2]], B, 10); boom.position.set(sx * 2.0, -0.1, 0.5); g.add(boom);
    const nac = mesh(new THREE.SphereGeometry(0.55, 10, 8), T, sx * 2.0, -0.1, -2.1); nac.scale.set(1, 1, 1.4); g.add(nac);
    const tf = fin(1.5, 1.2, 0.1, B); tf.position.set(sx * 2.0, 0.15, 4.4); g.add(tf);
  }
  const ts = mesh(new THREE.BoxGeometry(4.3, 0.12, 0.9), W, 0, 0.05, 5.4); g.add(ts);
  const prop = propeller(3, 1.6, c.trim); prop.position.set(0, 0, -3.45); g.add(prop);
  const ring = mesh(new THREE.TorusGeometry(0.66, 0.11, 8, 18), mat(0x222222), 0, 0.72, -0.4); ring.rotation.x = Math.PI / 2; g.add(ring);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.3, -0.35), guns: (n) => gunLayout(n, 2.0, -0.2, -2.4, 4, -3.0, 0.45), engine: new THREE.Vector3(0, 0, -2.6), jet: false });
}
function comet(c) {
  const g = new THREE.Group();
  const B = mat(c.body, { metal: 0.35, rough: 0.35 }), W = mat(c.wing, { metal: 0.3, rough: 0.4 }), T = mat(c.trim);
  g.add(body([[0.01, -5], [0.45, -4.6], [0.8, -3.6], [1.0, -1.5], [1.0, 2.0], [0.85, 4.0], [0.75, 4.4]], B, 14));
  const intake = mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 16), T, 0, 0, -4.75); g.add(intake);
  const w = wing(9.5, 3.6, 1.0, 2.0, 0.2, W, 0.02); w.position.set(0, -0.3, 0.6); g.add(w);
  const tf = fin(2.3, 2.3, 0.12, B); tf.position.set(0, 0.5, 2.2); tf.rotation.x = -0.25; g.add(tf);
  const ts = wing(4.2, 1.6, 0.6, 1.0, 0.1, W); ts.position.set(0, 0.55, 3.6); g.add(ts);
  const noz = mesh(new THREE.CylinderGeometry(0.72, 0.62, 0.6, 14, 1, true), mat(0x333333, { metal: 0.6, rough: 0.3 }), 0, 0, 4.6); noz.rotation.x = Math.PI / 2; g.add(noz);
  const flame = mesh(new THREE.ConeGeometry(0.58, 3.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0, 6.4);
  flame.rotation.x = -Math.PI / 2; g.add(flame);
  const stripe = mesh(new THREE.CylinderGeometry(1.01, 1.01, 0.5, 14, 1, true), T, 0, 0, -1.2); stripe.rotation.x = Math.PI / 2; g.add(stripe);
  const ring = mesh(new THREE.TorusGeometry(0.66, 0.11, 8, 18), mat(0x222233), 0, 0.82, -1.5); ring.rotation.x = Math.PI / 2; g.add(ring);
  return finish(g, { props: [], flame, seat: new THREE.Vector3(0, 0.38, -1.45), guns: (n) => gunLayout(n, 1.8, -0.3, -0.6, 4, -4.2, 0.25), engine: new THREE.Vector3(0, 0, 4.4), jet: true });
}
const BUILDERS = { sparrow, kestrel, bulldog, hornet, comet };

export const RAIDER = { body: 0x3b3f4a, wing: 0x8c2f2f, trim: 0xe0c341 };
export const ACE = { body: 0xb5121b, wing: 0xb5121b, trim: 0x111111 };
export const TEAM_COLORS = [{ body: 0x2f7fd8, wing: 0xe8eef5, trim: 0xf5c33b }, { body: 0xd8402f, wing: 0x2f2f38, trim: 0xf1e6c8 }];

/** plane model with pilot. kind = plane id; colors {body, wing, trim}; scarf colour */
export function makePlane(kind, colors, scarf, barrels = 0) {
  const g = (BUILDERS[kind] || kestrel)(colors);
  // visible gun barrels (the Barrels upgrade adds them on the wings)
  if (barrels > 0) {
    const bg = new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6); bg.rotateX(Math.PI / 2);
    const bm = mat(0x26262b, { metal: 0.6, rough: 0.35 });
    for (const v of g.userData.guns(barrels)) { const b = new THREE.Mesh(bg, bm); b.position.copy(v); b.position.z -= 0.3; g.add(b); }
  }
  const pilot = makePilot(scarf ?? 0xe8433a);
  pilot.position.copy(g.userData.seat);
  pilot.scale.setScalar(1.45); // big cartoon head that reads from the chase cam
  g.add(pilot);
  g.userData.pilot = pilot;
  // arcade readability: fighters are drawn (and hit) 1.5x real size
  const ud = g.userData;
  g.scale.setScalar(PLANE_SCALE);
  ud.engine = ud.engine.clone().multiplyScalar(PLANE_SCALE);
  const gf = ud.guns; ud.guns = (n) => gf(n).map((v) => v.multiplyScalar(PLANE_SCALE));
  ud.size *= PLANE_SCALE;
  return g;
}
export const PLANE_SCALE = 1.5;

// ---------------------------------------------------------------- bomber
export function makeBomber() {
  const g = new THREE.Group();
  const B = mat(0x5f6650), W = mat(0x4c523f), T = mat(0x9e2b25), G = mat(0xbfe8ff, { transparent: true, opacity: 0.55, rough: 0.05 });
  g.add(body([[0.01, -8], [1.3, -7.6], [1.8, -6], [2.0, -2], [1.7, 4], [0.8, 9], [0.25, 11]], B, 16));
  const nose = mesh(new THREE.SphereGeometry(1.35, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), G, 0, 0, -7.5); nose.rotation.x = -Math.PI / 2; g.add(nose);
  const w = wing(30, 5, 2.4, 0.6, 0.5, W, 0.03); w.position.set(0, 0.2, -1.5); g.add(w);
  const props = [];
  for (const sx of [-6, 6]) {
    const nac = body([[0.01, -2.6], [0.9, -2.4], [1.05, -1.2], [0.9, 2.5], [0.3, 4]], T, 12); nac.position.set(sx, 0, -2.2); g.add(nac);
    const pr = propeller(3, 2.0, 0x222222); pr.position.set(sx, 0, -4.9); g.add(pr); props.push(pr);
  }
  const tf = fin(4, 3.5, 0.25, B); tf.position.set(0, 0.6, 7.5); g.add(tf);
  const ts = wing(11, 3, 1.6, 0.4, 0.2, W); ts.position.set(0, 0.5, 9.2); g.add(ts);
  const tg = mesh(new THREE.SphereGeometry(0.9, 10, 8), G, 0, 1.6, 3.5); g.add(tg);
  const pilot = makePilot(0x222222); pilot.scale.setScalar(0.9); pilot.position.set(0, 1.25, -5.6); g.add(pilot);
  return finish(g, { props, pilot, size: 2.4, engine: new THREE.Vector3(6, 0, -2), engine2: new THREE.Vector3(-6, 0, -2), guns: () => [new THREE.Vector3(0, 1.8, 3.5)], jet: false });
}

// ---------------------------------------------------------------- airship
export function makeAirship(big) {
  const g = new THREE.Group();
  const s = big ? 1.35 : 1;
  const env = mat(0xd8cdb2, { rough: 0.7 });
  const band = mat(0x9e2b25, { rough: 0.6 });
  const hull = body([[0.01, -48], [7, -44], [13, -32], [15.5, -12], [15.5, 10], [12.5, 30], [6, 44], [0.5, 50]], env, 24);
  hull.scale.setScalar(s); g.add(hull);
  for (const z of [-20, 0, 20]) { const b = mesh(new THREE.CylinderGeometry(15.7 * s, 15.7 * s, 2.2, 24, 1, true), band, 0, 0, z * s); b.rotation.x = Math.PI / 2; g.add(b); }
  const gond = mesh(new THREE.BoxGeometry(7 * s, 5 * s, 26 * s), mat(0x4a3b2c, { flat: true }), 0, -17 * s, -2 * s); g.add(gond);
  const winM = mat(0xffe08a, { emissive: 0xffc04a, ei: 0.6 });
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, 1.2 * s, 1.8 * s), winM, sx * 3.55 * s, -16.5 * s, (-12 + i * 4) * s));
  for (const [x, y, rz] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2]]) {
    const f = fin(12 * s, 14 * s, 0.6, band); f.rotation.z = rz; f.position.set(x * 8 * s, y * 8 * s, 34 * s); g.add(f);
  }
  const props = [], pods = [];
  for (const sx of [-1, 1]) {
    const pod = body([[0.01, -3], [1.6, -2.6], [1.8, 0], [1.2, 3], [0.2, 4]], mat(0x3a3f48), 12);
    pod.position.set(sx * 19 * s, -6 * s, 14 * s); g.add(pod); pods.push(pod);
    const strut = mesh(new THREE.BoxGeometry(5 * s, 0.6, 1.4), mat(0x3a3f48), sx * 16.5 * s, -5 * s, 14 * s); g.add(strut);
    const pr = propeller(4, 2.6, 0x222222); pr.position.set(sx * 19 * s, -6 * s, 18.5 * s); pr.rotation.y = Math.PI; g.add(pr); props.push(pr);
  }
  // turrets: local positions (returned so the game can make them separate destructible parts)
  const turretSpots = [[0, 15.8, -18], [0, 15.8, 8], [0, -19.6, -10], [0, -19.6, 6], [-15, 2, -6], [15, 2, -6]];
  if (big) turretSpots.push([0, 15.8, 26], [-14, -4, 18], [14, -4, 18]);
  const turrets = turretSpots.map(([x, y, z]) => {
    const t = new THREE.Group();
    const base = mesh(new THREE.CylinderGeometry(1.6, 2, 1.4, 10), mat(0x2b2e35, { metal: 0.4 }), 0, 0, 0); t.add(base);
    const head = new THREE.Group(); head.position.y = 1;
    head.add(mesh(new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9e2b25)));
    for (const bx of [-0.45, 0.45]) { const br = mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 6), mat(0x111111), bx, 0.5, -1.6); br.rotation.x = Math.PI / 2; head.add(br); }
    t.add(head); t.userData.head = head;
    t.position.set(x * s, y * s, z * s);
    if (y < -10) t.rotation.z = Math.PI; else if (x > 10) t.rotation.z = -Math.PI / 2; else if (x < -10) t.rotation.z = Math.PI / 2;
    g.add(t);
    return t;
  });
  return finish(g, { props, turrets, pods, size: 16 * s, engine: new THREE.Vector3(19 * s, -6 * s, 14 * s), engine2: new THREE.Vector3(-19 * s, -6 * s, 14 * s), jet: false });
}

// ---------------------------------------------------------------- missiles
export function makeMissile() {
  const g = new THREE.Group();
  const b = body([[0.01, -1.2], [0.18, -0.9], [0.2, 0.9], [0.15, 1.1]], mat(0xeeeeee), 8); g.add(b);
  const tip = mesh(new THREE.SphereGeometry(0.19, 8, 6), mat(0xd9433a), 0, 0, -0.95); g.add(tip);
  for (let i = 0; i < 4; i++) { const f = mesh(new THREE.BoxGeometry(0.05, 0.55, 0.4), mat(0xd9433a), 0, 0, 0.85); f.rotation.z = i * Math.PI / 2; f.position.x = Math.cos(i * Math.PI / 2) * 0.0; g.add(f); f.geometry.translate(0, 0.25, 0); }
  return g;
}
