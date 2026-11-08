// Procedural low-poly models: five player planes, raider fighters, bombers, the airship boss and
// animated pilots and interwar racing seaplanes.
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
const up = new THREE.Vector3(0, 1, 0);

function oval(material, x, y, z, sx, sy, sz) {
  const part = mesh(new THREE.SphereGeometry(1, 12, 8), material, x, y, z);
  part.scale.set(sx, sy, sz);
  return part;
}

function brace(from, to, radius, material) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const part = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
  part.position.copy(a).lerp(b, 0.5);
  part.quaternion.setFromUnitVectors(up, direction.normalize());
  return part;
}

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

// The hull narrows below the waterline and climbs sharply at the float step.
// Each section is [z, half-width, deck height, keel height].
function boatHull(sections, paint, underside) {
  const sides = 16, vertices = [], upper = [], lower = [];
  for (const [z, width, deck, keel] of sections) {
    for (let i = 0; i < sides; i++) {
      const angle = i * Math.PI * 2 / sides, top = Math.cos(angle);
      vertices.push(width * Math.sin(angle) * (top < 0 ? 0.83 : 1), keel + (deck - keel) * (top + 1) / 2, z);
    }
  }
  for (let row = 0; row < sections.length - 1; row++) {
    for (let i = 0; i < sides; i++) {
      const a = row * sides + i, b = row * sides + (i + 1) % sides;
      const faces = Math.cos((i + 0.5) * Math.PI * 2 / sides) < -0.25 ? lower : upper;
      faces.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([...upper, ...lower]);
  geometry.addGroup(0, upper.length, 0);
  geometry.addGroup(upper.length, lower.length, 1);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, [paint, underside]);
}

function outrigger(x, y, z, length, width, paint, strut, mountY) {
  const g = new THREE.Group(), low = mat(0x453e37, { rough: 0.8 });
  const hull = boatHull([
    [-0.52, 0.01, 0.10, 0.07], [-0.40, 0.76, 0.12, -0.15], [-0.15, 1, 0.12, -0.20],
    [0.08, 0.98, 0.10, -0.20], [0.12, 0.94, 0.10, -0.07], [0.43, 0.48, 0.07, -0.07], [0.51, 0.01, 0.03, 0.01],
  ], paint, low);
  hull.scale.set(width, Math.sqrt(width) * 1.35, length);
  g.add(hull);
  for (const direction of [-1, 1]) {
    g.add(brace([0, 0.10, direction * length * 0.25], [-Math.sign(x) * 0.36, mountY - y, direction * length * 0.08], 0.055, strut));
  }
  g.position.set(x, y, z);
  return g;
}

function cockpit(g, x, y, z, width = 0.75) {
  const rim = mesh(new THREE.TorusGeometry(width, 0.10, 7, 18), mat(0x463024, { rough: 0.85 }), x, y, z);
  rim.rotation.x = Math.PI / 2;
  rim.scale.y = 1.12;
  const seat = oval(mat(0x302523), x, y - 0.10, z, width * 0.91, 0.18, width);
  const glass = mat(0xb5d6d3, { transparent: true, opacity: 0.34, rough: 0.15 });
  const screen = mesh(new THREE.CylinderGeometry(width * 0.85, width * 0.93, 0.43, 10, 1, true, Math.PI * 0.70, Math.PI * 0.60), glass, x, y + 0.18, z);
  screen.rotation.x = 0.17;
  g.add(seat, rim, screen);
}

function wingBands(g, x, y, z, chord, colors, slope = 0) {
  for (const side of [-1, 1]) {
    colors.forEach((color, i) => {
      const band = mesh(new THREE.BoxGeometry(0.21, 0.026, chord), mat(color, { rough: 0.76 }), side * (x + i * 0.22), y + i * 0.22 * slope, z);
      band.rotation.z = side * Math.atan(slope);
      g.add(band);
    });
  }
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
function addHumanFace(head) {
  head.add(mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(0xf2c29b, { rough: 0.6 })));
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
}

function addPigFace(head) {
  const skin = mat(0xe7a28f, { rough: 0.74 });
  const muzzle = mat(0xf1b5a1, { rough: 0.8 });
  const rose = mat(0xd88179, { rough: 0.84 });
  const helmet = mat(0x706440, { rough: 0.92 });
  const leather = mat(0x42362a, { rough: 0.87 });
  const dark = mat(0x342726, { rough: 0.9 });
  const rim = mat(0xa67a49, { rough: 0.48, metal: 0.28 });
  const lens = mat(0x29434a, { rough: 0.28, metal: 0.19 });
  const reflection = mat(0x82a6aa, { rough: 0.41 });
  head.add(
    oval(skin, 0, -0.02, 0.02, 0.57, 0.56, 0.51),
    oval(skin, 0, -0.26, -0.22, 0.42, 0.30, 0.34),
    oval(muzzle, 0, -0.07, -0.49, 0.36, 0.23, 0.32),
    oval(rose, 0, -0.065, -0.78, 0.27, 0.165, 0.065),
    oval(leather, 0, 0.12, -0.57, 0.20, 0.045, 0.045),
  );
  const cap = mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), helmet, 0, 0.055, 0.035);
  cap.scale.set(0.59, 0.59, 0.54);
  const strap = mesh(new THREE.TorusGeometry(0.54, 0.043, 6, 20), leather, 0, 0.12, 0.015);
  strap.rotation.x = Math.PI / 2;
  strap.scale.y = 0.91;
  head.add(cap, strap);
  for (const side of [-1, 1]) {
    const ear = oval(skin, side * 0.52, 0.31, 0.03, 0.15, 0.24, 0.12);
    ear.rotation.z = -side * 0.39;
    const inner = oval(rose, side * 0.55, 0.34, -0.057, 0.085, 0.15, 0.043);
    inner.rotation.z = ear.rotation.z;
    const goggle = mesh(new THREE.TorusGeometry(0.145, 0.044, 7, 16), rim, side * 0.225, 0.14, -0.55);
    goggle.scale.x = 1.16;
    goggle.rotation.y = -side * 0.18;
    const shine = oval(reflection, side * 0.225 - 0.048, 0.19, -0.599, 0.064, 0.023, 0.017);
    shine.rotation.z = 0.27;
    const moustache = oval(dark, side * 0.158, -0.237, -0.626, 0.178, 0.063, 0.069);
    moustache.rotation.z = -side * 0.16;
    head.add(
      ear, inner, oval(helmet, side * 0.49, -0.083, 0.10, 0.12, 0.29, 0.17),
      oval(dark, side * 0.10, -0.055, -0.832, 0.049, 0.065, 0.017),
      goggle, oval(lens, side * 0.225, 0.14, -0.557, 0.147, 0.125, 0.041), shine, moustache,
    );
  }
}

export function makePilot(scarfColor = 0xe8433a, hero = false) {
  const p = new THREE.Group();
  const jacket = mat(0x7a4b2a, { rough: 0.8 });
  p.add(oval(jacket, 0, 0.05, 0.05, 0.65, 0.65, 0.53));
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  p.add(head);
  if (hero) addPigFace(head);
  else addHumanFace(head);
  // scarf: a knot at the neck + a chain of segments that trail and flap
  const sm = mat(hero && scarfColor === 0xe8433a ? 0xf0e4cd : scarfColor, { rough: 0.8 });
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
  if (hero) p.add(oval(mat(0xeee2c8, { rough: 0.86 }), 0.42, 0.08, -0.61, 0.16, 0.15, 0.19));
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
  const B = mat(c.body, { rough: 0.44 }), W = mat(c.wing, { rough: 0.69 }), T = mat(c.trim);
  const strut = mat(0x473a34, { rough: 0.72 }), metal = mat(0x675b52, { metal: 0.43 });
  g.add(boatHull([
    [-3.65, 0.05, 0.29, 0.18], [-3.2, 0.70, 0.66, -0.38], [-2.38, 1.05, 0.76, -0.94],
    [-0.44, 0.97, 0.79, -1.15], [0.42, 0.87, 0.76, -1.10], [0.60, 0.83, 0.72, -0.62],
    [1.85, 0.60, 0.48, -0.42], [3.05, 0.26, 0.35, 0.01], [4.02, 0.025, 0.25, 0.19],
  ], B, mat(new THREE.Color(c.body).multiplyScalar(0.63).getHex())));
  const upper = wing(10.2, 2.16, 1.48, 0.16, 0.19, W, 0.015);
  upper.position.set(0, 1.42, -1.42);
  g.add(upper);
  wingBands(g, 3.68, 1.65, -1.32, 1.42, [0x315d4a, 0xf1dfb4, 0xa92e28], 0.015);
  for (const side of [-1, 1]) {
    g.add(
      brace([side * 0.56, 0.43, -2.1], [side * 1.02, 1.42, -1.84], 0.068, strut),
      brace([side * 0.54, 0.48, -0.94], [side * 1.01, 1.42, -0.90], 0.060, strut),
      outrigger(side * 3.67, -0.49, -1.30, 2.8, 0.37, B, strut, 1.49),
    );
  }
  const engine = body([[0.03, -1.43], [0.48, -1.28], [0.59, -1.0], [0.57, 0.32], [0.39, 0.93], [0.04, 1.12]], B, 14, 0.89);
  engine.position.set(0, 1.98, -1.54);
  const radiator = mesh(new THREE.TorusGeometry(0.40, 0.09, 6, 16), metal, 0, 1.98, -2.84);
  const prop = propeller(2, 1.48, c.trim);
  prop.position.set(0, 1.98, -3.03);
  g.add(engine, radiator, prop);
  const tail = fin(1.47, 1.62, 0.11, B);
  tail.position.set(0, 0.28, 2.65);
  const stabilizer = wing(3.54, 1.02, 0.77, 0.12, 0.11, W);
  stabilizer.position.set(0, 0.36, 3.22);
  const tailStripe = fin(1.12, 1.06, 0.116, T);
  tailStripe.position.set(0, 0.31, 2.85);
  g.add(tail, stabilizer, tailStripe);
  cockpit(g, 0, 0.78, 0.27, 0.68);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.37, 0.29), guns: (n) => gunLayout(n, 2.2, -0.5, -1.7, 2, -2.9, 0.75), engine: new THREE.Vector3(0, 1.98, -2.4), jet: false });
}
function kestrel(c) {
  const g = new THREE.Group();
  const B = mat(c.body, { rough: 0.52 }), W = mat(c.wing, { rough: 0.73 }), T = mat(c.trim, { metal: 0.25 });
  const strut = mat(0x544332, { rough: 0.82 });
  g.add(body([[0.01, -3.9], [0.57, -3.8], [0.82, -3.24], [0.85, -1.5], [0.78, 0.8], [0.38, 3.2], [0.05, 4.3]], B, 16));
  const upper = wing(10.5, 2.05, 1.46, 0.15, 0.19, W, 0.014);
  upper.position.set(0, 1.56, -1.05);
  const lower = wing(9.0, 1.79, 1.31, 0.20, 0.17, W, 0.027);
  lower.position.set(0, -0.46, -0.76);
  g.add(upper, lower);
  wingBands(g, 3.74, 1.80, -0.93, 1.37, [c.trim, 0xecd9a9, c.trim], 0.014);
  for (const side of [-1, 1]) {
    const x = side * 3.28;
    g.add(
      brace([x, -0.37, -1.44], [x, 1.61, -1.73], 0.058, strut),
      brace([x, -0.37, -0.12], [x, 1.61, -0.54], 0.058, strut),
      brace([x, -0.37, -1.44], [x, 1.61, -0.54], 0.021, strut),
      brace([side * 0.67, 0.44, -1.45], [side * 1.09, 1.59, -1.52], 0.055, strut),
      outrigger(side * 1.67, -1.83, -0.88, 5.13, 0.44, B, strut, -0.38),
    );
  }
  const stripe = mesh(new THREE.CylinderGeometry(0.83, 0.78, 0.33, 16, 1, true), T, 0, 0, -3.48); stripe.rotation.x = Math.PI / 2; g.add(stripe);
  const tf = fin(1.8, 1.6, 0.12, B); tf.position.set(0, 0.2, 2.6); g.add(tf);
  const ts = wing(3.8, 1.3, 0.7, 0.25, 0.1, W); ts.position.set(0, 0.15, 3.4); g.add(ts);
  const prop = propeller(2, 1.75, c.trim); prop.position.set(0, 0, -3.95); g.add(prop);
  cockpit(g, 0, 0.76, 0.19, 0.64);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.33, 0.23), guns: (n) => gunLayout(n, 2.0, -0.4, -1.6, 2, -3.3, 0.55), engine: new THREE.Vector3(0, 0.3, -2.8), jet: false });
}
function bulldog(c) {
  const g = new THREE.Group();
  const B = mat(c.body, { rough: 0.64 }), W = mat(c.wing, { rough: 0.78 }), T = mat(c.trim);
  const strut = mat(0x544337, { rough: 0.84 });
  g.add(boatHull([
    [-4.14, 0.07, 0.30, 0.19], [-3.62, 0.95, 0.72, -0.41], [-2.68, 1.32, 1.04, -1.13],
    [-0.66, 1.35, 1.00, -1.62], [0.62, 1.21, 0.96, -1.56], [0.85, 1.16, 0.92, -1.00],
    [2.05, 0.79, 0.68, -0.58], [3.63, 0.37, 0.41, -0.12], [4.75, 0.04, 0.31, 0.18],
  ], B, mat(0x484237)));
  const w = wing(12.1, 3.0, 1.82, 0.16, 0.29, W, 0.025);
  w.position.set(0, 1.43, -1.46);
  g.add(w);
  wingBands(g, 4.37, 1.82, -1.35, 1.78, [c.trim, 0xebd9b2], 0.025);
  const props = [];
  for (const side of [-1, 1]) {
    const x = side * 2.58;
    const engine = body([[0.04, -1.36], [0.63, -1.17], [0.72, -0.56], [0.68, 0.42], [0.37, 0.90], [0.02, 1.14]], T, 13);
    engine.position.set(x, 1.82, -1.58);
    const ring = mesh(new THREE.TorusGeometry(0.48, 0.08, 7, 14), strut, x, 1.82, -2.83);
    const prop = propeller(3, 1.41, c.trim);
    prop.position.set(x, 1.82, -3.06);
    props.push(prop);
    g.add(engine, ring, prop,
      brace([side * 0.77, 0.5, -1.65], [x, 1.42, -1.6], 0.10, strut),
      brace([side * 0.75, 0.42, -0.32], [x, 1.43, -0.52], 0.08, strut),
      outrigger(side * 3.96, -0.84, -1.22, 3.43, 0.53, B, strut, 1.48),
    );
  }
  const tf = fin(2.1, 2, 0.15, B); tf.position.set(0, 0.35, 2.8); g.add(tf);
  const ts = wing(4.6, 1.5, 0.9, 0.2, 0.12, W); ts.position.set(0, 0.25, 3.8); g.add(ts);
  cockpit(g, 0, 1.0, 0.26, 0.73);
  return finish(g, { props, seat: new THREE.Vector3(0, 0.56, 0.31), guns: (n) => gunLayout(n, 2.1, -0.6, -1.8, 2, -3.6, 0.9), engine: new THREE.Vector3(2.58, 1.82, -2.6), engine2: new THREE.Vector3(-2.58, 1.82, -2.6), jet: false, size: 1.15 });
}
function hornet(c) {
  const g = new THREE.Group();
  const B = mat(c.body, { rough: 0.43 }), W = mat(c.wing, { rough: 0.70 }), T = mat(c.trim);
  const strut = mat(0x534237, { rough: 0.80 });
  g.add(body([[0.02, -3.4], [0.54, -3.27], [0.86, -2.5], [0.95, 0.13], [0.69, 1.63], [0.11, 2.48]], B, 16, 0.89));
  const w = wing(11.1, 2.48, 1.49, 0.27, 0.22, W, 0.03);
  w.position.set(0, -0.21, -0.40);
  g.add(w);
  wingBands(g, 4.02, 0.133, -0.17, 1.31, [c.trim, 0xe9d9b5], 0.03);
  for (const side of [-1, 1]) {
    const x = side * 2.0;
    const boom = body([[0.03, -2.6], [0.46, -2.31], [0.51, -1.35], [0.34, 2.35], [0.15, 4.83], [0.03, 5.28]], B, 12, 0.82);
    boom.position.set(x, -0.14, 0.43);
    const tail = fin(1.48, 1.27, 0.11, T);
    tail.position.set(x, 0.04, 4.23);
    g.add(boom, tail, outrigger(side * 1.84, -1.67, -0.77, 4.51, 0.43, B, strut, -0.26));
  }
  const tailplane = wing(4.55, 1.00, 0.72, 0.08, 0.10, W);
  tailplane.position.set(0, 0.09, 5.05);
  const noseBand = mesh(new THREE.TorusGeometry(0.53, 0.08, 7, 18), T, 0, 0, -3.25);
  const prop = propeller(3, 1.61, c.trim);
  prop.position.set(0, 0, -3.46);
  g.add(tailplane, noseBand, prop);
  cockpit(g, 0, 0.76, -0.06, 0.66);
  return finish(g, { props: [prop], seat: new THREE.Vector3(0, 0.30, -0.02), guns: (n) => gunLayout(n, 2.0, -0.2, -2.4, 4, -3.0, 0.45), engine: new THREE.Vector3(0, 0, -2.6), jet: false });
}
function comet(c) {
  const g = new THREE.Group();
  const B = mat(c.body, { metal: 0.35, rough: 0.39 }), W = mat(c.wing, { metal: 0.18, rough: 0.57 }), T = mat(c.trim);
  const bronze = mat(0x956641, { metal: 0.53, rough: 0.38 });
  const strut = mat(0x50493e, { rough: 0.78 });
  g.add(body([[0.45, -5], [0.58, -4.84], [0.75, -4.18], [0.94, -1.54], [0.96, 0.65], [0.81, 2.50], [0.63, 4.42]], B, 17, 0.92));
  const intake = mesh(new THREE.TorusGeometry(0.44, 0.11, 8, 17), bronze, 0, 0, -4.98);
  const throat = mesh(new THREE.CircleGeometry(0.42, 17), mat(0x312722), 0, 0, -4.86);
  throat.rotation.y = Math.PI;
  g.add(intake, throat);
  const w = wing(10.1, 3.06, 1.24, 0.41, 0.20, W, 0.016);
  w.position.set(0, -0.37, -0.56);
  g.add(w);
  wingBands(g, 3.58, -0.109, -0.30, 1.19, [c.trim, 0xe8c990], 0.016);
  for (const side of [-1, 1]) {
    g.add(outrigger(side * 1.78, -1.68, -1.35, 5.40, 0.43, T, strut, -0.35));
    for (let i = 0; i < 4; i++) {
      g.add(oval(bronze, side * (0.64 + i * 0.045), 0.29 - i * 0.13, -2.84, 0.075, 0.038, 0.65));
    }
  }
  const tf = fin(2.00, 2.12, 0.12, T); tf.position.set(0, 0.46, 2.53); g.add(tf);
  const ts = wing(4.32, 1.41, 0.76, 0.31, 0.11, W); ts.position.set(0, 0.40, 3.65); g.add(ts);
  const noz = mesh(new THREE.CylinderGeometry(0.63, 0.57, 0.62, 16, 1, true), bronze, 0, 0, 4.62); noz.rotation.x = Math.PI / 2; g.add(noz);
  const flame = mesh(new THREE.ConeGeometry(0.58, 3.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0, 6.4);
  flame.rotation.x = -Math.PI / 2; g.add(flame);
  cockpit(g, 0, 0.82, -1.48, 0.66);
  return finish(g, { props: [], flame, seat: new THREE.Vector3(0, 0.38, -1.45), guns: (n) => gunLayout(n, 1.8, -0.3, -0.6, 4, -4.2, 0.25), engine: new THREE.Vector3(0, 0, 4.4), jet: true });
}
const BUILDERS = { sparrow, kestrel, bulldog, hornet, comet };

export const RAIDER = { body: 0x3b3f4a, wing: 0x8c2f2f, trim: 0xe0c341 };
export const ACE = { body: 0xb5121b, wing: 0xb5121b, trim: 0x111111 };
export const TEAM_COLORS = [{ body: 0x2f7fd8, wing: 0xe8eef5, trim: 0xf5c33b }, { body: 0xd8402f, wing: 0x2f2f38, trim: 0xf1e6c8 }];

/** plane model with pilot. kind = plane id; colors {body, wing, trim}; scarf colour */
export function makePlane(kind, colors, scarf, barrels = 0, hero = true) {
  const g = (BUILDERS[kind] || kestrel)(colors);
  // visible gun barrels (the Barrels upgrade adds them on the wings)
  if (barrels > 0) {
    const bg = new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6); bg.rotateX(Math.PI / 2);
    const bm = mat(0x26262b, { metal: 0.6, rough: 0.35 });
    for (const v of g.userData.guns(barrels)) { const b = new THREE.Mesh(bg, bm); b.position.copy(v); b.position.z -= 0.3; g.add(b); }
  }
  const pilot = makePilot(scarf ?? 0xe8433a, hero);
  pilot.position.copy(g.userData.seat);
  pilot.scale.setScalar(1.45); // big cartoon head that reads from the chase cam
  g.add(pilot);
  g.userData.pilot = pilot;
  // arcade readability: fighters are drawn (and hit) 1.5x real size
  const ud = g.userData;
  g.scale.setScalar(PLANE_SCALE);
  ud.engine = ud.engine.clone().multiplyScalar(PLANE_SCALE);
  ud.engine2?.multiplyScalar(PLANE_SCALE);
  const gf = ud.guns; ud.guns = (n) => gf(n).map((v) => v.multiplyScalar(PLANE_SCALE));
  ud.size *= PLANE_SCALE;
  return g;
}
export const PLANE_SCALE = 1.5;

// ---------------------------------------------------------------- bomber
export function makeBomber() {
  const g = new THREE.Group();
  const B = mat(0x5f6650), W = mat(0x4c523f), T = mat(0x9e2b25), G = mat(0xbfe8ff, { transparent: true, opacity: 0.55, rough: 0.05 });
  const strut = mat(0x524839, { rough: 0.85 });
  g.add(boatHull([
    [-8.1, 0.05, 0.18, 0.03], [-7.4, 1.28, 1.31, -0.81], [-5.90, 1.83, 1.65, -1.6],
    [-1.63, 2.10, 1.85, -2.44], [1.55, 1.84, 1.46, -2.32], [1.85, 1.75, 1.35, -1.46],
    [5.03, 1.30, 0.85, -0.88], [9.12, 0.49, 0.48, -0.28], [11.08, 0.045, 0.29, 0.18],
  ], B, mat(0x39352c)));
  const nose = mesh(new THREE.SphereGeometry(1.35, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), G, 0, 0, -7.5); nose.rotation.x = -Math.PI / 2; g.add(nose);
  const w = wing(30, 5, 2.4, 0.6, 0.5, W, 0.03); w.position.set(0, 0.2, -1.5); g.add(w);
  const props = [];
  for (const sx of [-6, 6]) {
    const nac = body([[0.01, -2.6], [0.9, -2.4], [1.05, -1.2], [0.9, 2.5], [0.3, 4]], T, 12); nac.position.set(sx, 0, -2.2); g.add(nac);
    const pr = propeller(3, 2.0, 0x222222); pr.position.set(sx, 0, -4.9); g.add(pr); props.push(pr);
  }
  for (const side of [-1, 1]) g.add(outrigger(side * 10.2, -1.74, -1.12, 5.25, 0.88, B, strut, 0.37));
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
