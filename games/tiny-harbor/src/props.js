// Every hand-built low-poly model: trees, rocks, the dock, the lighthouse,
// the campfire, the bridge, pickups, gulls, crabs and the harbour keeper.
import * as THREE from 'three';
import { heightAt, LH, LH_TOP, DOCK, BOLLARD, CAUSE, BAY_ROCKS, BRIDGE_SIGN, FIRE, BRIDGE } from './terrain.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return mats.get(key);
}
export function mesh(geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c) => mesh(new THREE.BoxGeometry(w, h, d), mat(c));
const cyl = (rt, rb, h, c, seg = 7) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));

function jitter(geo, amt) {
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [(Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt]);
    const j = seen.get(k);
    p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- trees -------------------------------------------------------------
export function makeTree(kind, scale) {
  const g = new THREE.Group();
  const top = new THREE.Group();
  if (kind === 'palm') {
    // a leaning trunk of stacked rings, a crown of drooping fronds and a few coconuts
    let x = 0, y = 0;
    for (let k = 0; k < 7; k++) {
      const seg = cyl(0.16 - k * 0.012, 0.19 - k * 0.012, 0.62, '#a8845a');
      x += 0.07 + k * 0.012; y += 0.58;
      seg.position.set(x, y - 0.29, 0); seg.rotation.z = -0.12 - k * 0.02;
      top.add(seg);
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const fr = mesh(new THREE.ConeGeometry(0.32, 2.2, 4), mat(k % 2 ? '#4fae5a' : '#3f9a4e'));
      fr.scale.set(1, 1, 0.25);
      fr.position.set(x + Math.cos(a) * 0.9, y - 0.15, Math.sin(a) * 0.9);
      fr.rotation.order = 'YXZ'; fr.rotation.y = -a; fr.rotation.z = -1.45;
      top.add(fr);
    }
    for (let k = 0; k < 3; k++) { const c = mesh(new THREE.IcosahedronGeometry(0.13, 0), mat('#6a4a2a'), false); c.position.set(x + Math.cos(k * 2) * 0.22, y - 0.25, Math.sin(k * 2) * 0.22); top.add(c); }
  } else if (kind === 'pine') {
    const trunk = cyl(0.16, 0.24, 1.1, '#8a5a3b');
    trunk.position.y = 0.55;
    top.add(trunk);
    const greens = ['#3f8f5a', '#4b9e62', '#5aae6a'];
    [[1.35, 1.5, 1.4], [1.05, 1.3, 2.2], [0.72, 1.1, 2.95]].forEach(([r, h, y], i) => {
      const c = mesh(jitter(new THREE.ConeGeometry(r, h, 7), 0.12), mat(greens[i]));
      c.position.y = y; c.rotation.y = Math.random() * 3;
      top.add(c);
    });
  } else {
    const trunk = cyl(0.17, 0.26, 1.4, '#8f6040');
    trunk.position.y = 0.7;
    top.add(trunk);
    const greens = ['#6cbf5f', '#7ccc63', '#5aae55'];
    const blobs = [[0, 2.2, 0, 1.25], [0.6, 1.9, 0.3, 0.85], [-0.55, 2.0, -0.2, 0.9], [0.1, 2.75, -0.1, 0.8]];
    blobs.forEach(([x, y, z, r], i) => {
      const b = mesh(jitter(new THREE.IcosahedronGeometry(r, 0), 0.15), mat(greens[i % 3]));
      b.position.set(x, y, z);
      top.add(b);
    });
    if (Math.random() < 0.45) { // apples
      for (let k = 0; k < 4; k++) {
        const a = mesh(new THREE.IcosahedronGeometry(0.11, 0), mat('#ff5a4f'), false);
        const th = Math.random() * 6.28;
        a.position.set(Math.cos(th) * 1.05, 1.8 + Math.random() * 0.8, Math.sin(th) * 1.05);
        top.add(a);
      }
    }
  }
  const stump = cyl(0.24, 0.28, 0.32, '#8a5a3b');
  stump.position.y = 0.16;
  const ring = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 7), mat('#e8c38c'), false);
  ring.position.y = 0.33;
  stump.add(ring);
  ring.position.y = 0.17;
  g.add(top, stump);
  stump.visible = false;
  g.scale.setScalar(scale);
  return { group: g, top, stump };
}

// --- rocks -------------------------------------------------------------
export function makeRock(r, color = '#9a968f') {
  const geo = jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.35);
  return mesh(geo, mat(color));
}

export function buildBayRocks(scene) {
  for (const [x, z, r, top] of BAY_ROCKS) {
    const g = new THREE.Group();
    const big = makeRock(r, '#8f8b84');
    big.scale.y = (top + 2.2) / (r * 1.9);
    big.position.y = (top - 2.2) / 2;
    g.add(big);
    for (let k = 0; k < 3; k++) {
      const s = makeRock(r * (0.3 + Math.random() * 0.25), '#a6a29a');
      const th = Math.random() * 6.28;
      s.position.set(Math.cos(th) * r * 0.8, top - 0.6 - Math.random() * 0.5, Math.sin(th) * r * 0.8);
      g.add(s);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
}

export function buildShoreRocks(scene) {
  const spots = [[16, -14, 1.3], [19, -8, 0.9], [-19, -12, 1.4], [-22, -4, 1.0], [12, 20, 0.8], [-6, 22, 1.1], [22, 6, 1.2], [-2, -24, 1.3], [-27, 33, 1.0], [-34, 28, 1.2], [-31, 35.5, 0.8]];
  for (const [x, z, r] of spots) {
    const m = makeRock(r);
    m.position.set(x, heightAt(x, z) + r * 0.2, z);
    scene.add(m);
  }
  return spots.map(([x, z, r]) => ({ x, z, r: r * 0.9 }));
}

// --- dock --------------------------------------------------------------
export function buildDock(scene) {
  const g = new THREE.Group();
  const woods = ['#b98458', '#a8764c', '#c4925f'];
  for (let z = DOCK.z0; z < DOCK.z1; z += 0.62) {
    const p = box(DOCK.x1 - DOCK.x0, 0.14, 0.55, woods[Math.floor(Math.random() * 3)]);
    p.position.set((DOCK.x0 + DOCK.x1) / 2, DOCK.y - 0.07, z + 0.3);
    p.rotation.y = (Math.random() - 0.5) * 0.03;
    g.add(p);
  }
  for (let z = DOCK.z0 + 1.5; z < DOCK.z1; z += 3) {
    for (const x of [DOCK.x0 + 0.1, DOCK.x1 - 0.1]) {
      const bed = heightAt(x, z);
      const h = DOCK.y + 0.5 - bed;
      const pile = cyl(0.14, 0.16, h, '#7a5236');
      pile.position.set(x, bed + h / 2, z);
      g.add(pile);
    }
  }
  // tide gauge post with painted rings, so the tide can be read by eye
  const gx = DOCK.x0 - 0.35, gz = DOCK.z1 - 6;
  const gbed = heightAt(gx, gz);
  const gh = DOCK.y + 1.1 - gbed;
  const post = cyl(0.12, 0.12, gh, '#f4efe6');
  post.position.set(gx, gbed + gh / 2, gz);
  g.add(post);
  for (let y = -0.4; y <= 0.6; y += 0.25) {
    const band = cyl(0.13, 0.13, 0.08, '#e0523f', 7);
    band.castShadow = false;
    band.position.set(gx, y, gz);
    g.add(band);
  }
  // bollard
  const bol = cyl(0.17, 0.22, 0.5, '#4a4a52');
  bol.position.set(BOLLARD.x, DOCK.y + 0.25, BOLLARD.z);
  const cap = cyl(0.25, 0.25, 0.08, '#4a4a52');
  cap.position.y = 0.27; bol.add(cap);
  g.add(bol);
  // crates, a barrel and lamp posts
  const crate = box(0.7, 0.7, 0.7, '#c08a52'); crate.position.set(DOCK.x0 + 0.45, DOCK.y + 0.35, DOCK.z0 + 4); crate.rotation.y = 0.3; g.add(crate);
  const crate2 = box(0.5, 0.5, 0.5, '#b07a45'); crate2.position.set(DOCK.x0 + 0.45, DOCK.y + 0.95, DOCK.z0 + 4); crate2.rotation.y = -0.2; g.add(crate2);
  const barrel = cyl(0.3, 0.3, 0.75, '#8a5a3b', 9); barrel.position.set(DOCK.x1 - 0.4, DOCK.y + 0.37, DOCK.z0 + 8); g.add(barrel);
  const lamps = [];
  for (const z of [DOCK.z0 + 2, DOCK.z0 + 10, DOCK.z1 - 1.2]) {
    const pole = cyl(0.06, 0.07, 1.8, '#3e3a3a');
    pole.position.set(DOCK.x1 - 0.12, DOCK.y + 0.9, z);
    const lamp = mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), new THREE.MeshLambertMaterial({ color: '#ffe9a8', emissive: '#ffcf6a', emissiveIntensity: 0 }), false);
    lamp.position.y = 0.95;
    pole.add(lamp);
    g.add(pole);
    lamps.push(lamp);
  }
  scene.add(g);
  return { lamps, crates: [{ x: DOCK.x0 + 0.45, z: DOCK.z0 + 4, r: 0.55 }, { x: DOCK.x1 - 0.4, z: DOCK.z0 + 8, r: 0.35 }, { x: BOLLARD.x, z: BOLLARD.z, r: 0.25 }] };
}

// --- lighthouse ----------------------------------------------------------
export function buildLighthouse(scene) {
  const g = new THREE.Group();
  g.position.set(LH.x, LH_TOP - 0.05, LH.z);
  const segs = [['#f7f3ea', 1.75, 1.6], ['#e0523f', 1.6, 1.45], ['#f7f3ea', 1.45, 1.3], ['#e0523f', 1.3, 1.15]];
  let y = 0;
  for (const [c, rb, rt] of segs) {
    const s = cyl(rt, rb, 2.2, c, 12);
    s.position.y = y + 1.1;
    g.add(s);
    y += 2.2;
  }
  const gallery = cyl(1.6, 1.6, 0.18, '#3e3a3a', 14); gallery.position.y = y + 0.09; g.add(gallery);
  const rail = mesh(new THREE.TorusGeometry(1.55, 0.05, 4, 16), mat('#3e3a3a')); rail.rotation.x = Math.PI / 2; rail.position.y = y + 0.6; g.add(rail);
  const glassMat = new THREE.MeshLambertMaterial({ color: '#fff4c4', emissive: '#ffd36a', emissiveIntensity: 0.15, transparent: true, opacity: 0.85 });
  const glass = mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.3, 10), glassMat, false);
  glass.position.y = y + 0.85; g.add(glass);
  const roof = mesh(new THREE.ConeGeometry(1.25, 1.1, 10), mat('#c4463a')); roof.position.y = y + 2.05; g.add(roof);
  const ball = mesh(new THREE.IcosahedronGeometry(0.16, 0), mat('#3e3a3a')); ball.position.y = y + 2.7; g.add(ball);
  // door faces the causeway
  const toA = Math.atan2(CAUSE.ax - LH.x, CAUSE.az - LH.z);
  const door = box(0.75, 1.3, 0.2, '#5b3a2a');
  door.position.set(Math.sin(toA) * 1.7, 0.65, Math.cos(toA) * 1.7); door.rotation.y = toA;
  g.add(door);
  const win = box(0.4, 0.5, 0.1, '#ffd98a');
  win.position.set(Math.sin(toA) * 1.4, 4.6, Math.cos(toA) * 1.4); win.rotation.y = toA;
  g.add(win);
  scene.add(g);
  const lampPos = new THREE.Vector3(LH.x, LH_TOP + y + 0.85, LH.z);
  const doorPos = { x: LH.x + Math.sin(toA) * 2.4, z: LH.z + Math.cos(toA) * 2.4 };
  // beam: a soft additive cone pointed each frame
  const beamGeo = new THREE.CylinderGeometry(0.04, 1, 1, 18, 1, true);
  beamGeo.translate(0, -0.5, 0);
  beamGeo.rotateX(-Math.PI / 2);   // now points down +z, length 1
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff0b8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.copy(lampPos);
  beam.visible = false;
  scene.add(beam);
  return { group: g, glassMat, lampPos, doorPos, beam };
}

// --- causeway bridge (built later) ------------------------------------------
export function buildBridge(scene) {
  const g = new THREE.Group();
  const ax = BRIDGE.ax, az = BRIDGE.az, bx = BRIDGE.bx, bz = BRIDGE.bz;
  const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
  const n = Math.floor(len / 0.6);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const p = box(2.1, 0.12, 0.5, i % 2 ? '#b98458' : '#a8764c');
    p.position.set(x, BRIDGE.y0 + (BRIDGE.y1 - BRIDGE.y0) * t - 0.05, z); p.rotation.y = ang;
    g.add(p);
    if (i % 5 === 0) {
      for (const s of [-1, 1]) {
        const ox = Math.cos(ang) * 1.0 * s, oz = -Math.sin(ang) * 1.0 * s;
        const bed = heightAt(x + ox, z + oz);
        const h = BRIDGE.y0 + (BRIDGE.y1 - BRIDGE.y0) * t + 0.6 - bed;
        const post = cyl(0.08, 0.1, h, '#7a5236');
        post.position.set(x + ox, bed + h / 2, z + oz);
        g.add(post);
      }
    }
  }
  for (const s of [-1, 1]) {
    const rail = box(0.07, 0.07, len, '#8a5a3b');
    rail.position.set((ax + bx) / 2 + Math.cos(ang) * 1.0 * s, (BRIDGE.y0 + BRIDGE.y1) / 2 + 0.55, (az + bz) / 2 - Math.sin(ang) * 1.0 * s);
    rail.rotation.order = 'YXZ';
    rail.rotation.y = ang;
    rail.rotation.x = -Math.atan2(BRIDGE.y1 - BRIDGE.y0, len);
    g.add(rail);
  }
  g.visible = false;
  scene.add(g);
  return g;
}

export function buildSign(scene, x, z, text) {
  const g = new THREE.Group();
  const post = cyl(0.07, 0.08, 1.2, '#7a5236'); post.position.y = 0.6; g.add(post);
  const board = box(1.0, 0.5, 0.08, '#c4925f'); board.position.y = 1.1; g.add(board);
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = Math.atan2(-x, -z) + 0.6;
  scene.add(g);
  return g;
}

// --- campfire ------------------------------------------------------------
export function buildCampfire(scene) {
  const g = new THREE.Group();
  g.position.set(FIRE.x, heightAt(FIRE.x, FIRE.z), FIRE.z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = makeRock(0.22, '#8f8b84');
    s.position.set(Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75);
    g.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const l = cyl(0.08, 0.08, 1.0, '#7a4a2e');
    l.rotation.z = Math.PI / 2; l.rotation.y = (i / 3) * Math.PI;
    l.position.y = 0.1;
    g.add(l);
  }
  const flames = [];
  [['#ff7a2f', 0.32, 0.8], ['#ffb03b', 0.22, 0.62], ['#fff1a0', 0.12, 0.42]].forEach(([c, r, h]) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshBasicMaterial({ color: c }));
    f.position.y = 0.15 + h / 2;
    g.add(f);
    flames.push(f);
  });
  // a stick with a fish on it, shown while cooking
  const spit = new THREE.Group();
  const stick = cyl(0.025, 0.025, 1.3, '#7a4a2e'); stick.rotation.z = 1.1; spit.add(stick);
  const fish = mesh(new THREE.IcosahedronGeometry(0.16, 0), mat('#c98a52')); fish.scale.set(2, 0.8, 0.6); fish.position.set(-0.25, 0.45, 0); spit.add(fish);
  spit.position.set(0.5, 0.35, 0);
  spit.visible = false;
  g.add(spit);
  const light = new THREE.PointLight('#ff9a4a', 4, 12, 1.6);
  light.position.y = 1;
  g.add(light);
  // logs to sit on
  for (const [x, z, r] of [[1.7, 0.6, 0.4], [-1.3, 1.3, -0.7]]) {
    const seat = cyl(0.22, 0.22, 1.2, '#8a5a3b');
    seat.rotation.z = Math.PI / 2; seat.rotation.y = r;
    seat.position.set(x, 0.2, z);
    g.add(seat);
  }
  scene.add(g);
  return { group: g, flames, light, spit };
}

// --- pickups ---------------------------------------------------------------
export function makePickup(kind) {
  const g = new THREE.Group();
  if (kind === 'clam') {
    for (const s of [1, -1]) {
      const h = mesh(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e8a7a0'), false);
      h.scale.set(1, 0.45 * s, 0.85);
      h.position.y = 0.06;
      g.add(h);
    }
  } else if (kind === 'shell') {
    const c = mesh(new THREE.ConeGeometry(0.12, 0.34, 6), mat('#fbe3c6'), false);
    c.rotation.z = Math.PI / 2; c.position.y = 0.08;
    const lip = mesh(new THREE.IcosahedronGeometry(0.1, 0), mat('#ffb2a2'), false);
    lip.position.set(-0.14, 0.08, 0);
    g.add(c, lip);
  } else {
    const d = cyl(0.09, 0.11, 1.1, '#c9b79c');
    d.rotation.z = Math.PI / 2; d.position.y = 0.1;
    const br = cyl(0.04, 0.05, 0.4, '#c9b79c'); br.position.set(0.2, 0.18, 0.12); br.rotation.x = 0.9;
    g.add(d, br);
  }
  g.rotation.y = Math.random() * 6.28;
  return g;
}

export function makeLog() {
  const g = new THREE.Group();
  const l = cyl(0.11, 0.11, 0.55, '#a8693c');
  l.rotation.z = Math.PI / 2;
  g.add(l);
  return g;
}

// --- critters -------------------------------------------------------------
export function makeGull() {
  const g = new THREE.Group();
  const body = mesh(new THREE.IcosahedronGeometry(0.22, 0), mat('#ffffff'), false);
  body.scale.set(0.7, 0.6, 1.6);
  const head = mesh(new THREE.IcosahedronGeometry(0.13, 0), mat('#ffffff'), false); head.position.set(0, 0.08, 0.35);
  const beak = mesh(new THREE.ConeGeometry(0.04, 0.14, 4), mat('#ffb03b'), false); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.06, 0.5);
  g.add(body, head, beak);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.2, 0.85, 0, -0.05], 3));
  wingGeo.computeVertexNormals();
  const wm = new THREE.MeshLambertMaterial({ color: '#eef2f5', side: THREE.DoubleSide });
  const wl = new THREE.Mesh(wingGeo, wm), wr = new THREE.Mesh(wingGeo, wm);
  wr.scale.x = -1;
  const tips = mesh(new THREE.BoxGeometry(0.2, 0.02, 0.1), mat('#3e3a3a'), false); tips.position.set(0.75, 0, -0.04); wl.add(tips);
  const tips2 = tips.clone(); wr.add(tips2);
  g.add(wl, wr);
  g.userData.wings = [wl, wr];
  return g;
}

export function makeCrab() {
  const g = new THREE.Group();
  const red = '#e8553f';
  const body = mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(red), false); body.scale.set(1.3, 0.55, 1); body.position.y = 0.14; g.add(body);
  for (const s of [-1, 1]) {
    const claw = mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(red), false); claw.position.set(s * 0.26, 0.14, 0.2); g.add(claw);
    const eye = mesh(new THREE.SphereGeometry(0.045, 6, 4), mat('#222222'), false); eye.position.set(s * 0.07, 0.3, 0.12); g.add(eye);
    for (let k = 0; k < 3; k++) {
      const leg = mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), mat(red), false);
      leg.position.set(s * 0.27, 0.07, -0.08 + k * 0.08); leg.rotation.z = s * 0.5;
      g.add(leg);
    }
  }
  return g;
}

// --- the harbour keeper ---------------------------------------------------
export function makeKeeper(look = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const coat = look.coat || '#ffcf3f', pants = look.pants || '#34507a', skin = look.skin || '#f6c9a2';
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.13, 0.42, 0);
    const leg = cyl(0.1, 0.1, 0.34, pants); leg.position.y = -0.17; hip.add(leg);
    const boot = box(0.18, 0.12, 0.26, '#3e3a3a'); boot.position.set(0, -0.36, 0.04); hip.add(boot);
    body.add(hip); legs.push(hip);
  }
  const torso = cyl(0.3, 0.38, 0.62, coat, 10); torso.position.y = 0.72; body.add(torso);
  const toggles = box(0.04, 0.4, 0.04, '#e09a2a'); toggles.position.set(0, 0.75, 0.33); body.add(toggles);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.36, 0.95, 0);
    const arm = cyl(0.085, 0.09, 0.45, coat); arm.position.y = -0.2; sh.add(arm);
    const hand = mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(skin)); hand.position.y = -0.45; sh.add(hand);
    body.add(sh); arms.push(sh);
  }
  const head = new THREE.Group(); head.position.y = 1.36; body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.34, 12, 9), mat(skin)); head.add(skull);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.045, 6, 5), mat('#2b2422'), false); eye.position.set(s * 0.12, 0.03, 0.31); eye.scale.z = 0.5; head.add(eye);
    const cheek = mesh(new THREE.SphereGeometry(0.06, 6, 5), mat('#ff9a8a'), false); cheek.position.set(s * 0.2, -0.07, 0.27); cheek.scale.set(1, 0.6, 0.4); head.add(cheek);
  }
  const hat = mesh(new THREE.SphereGeometry(0.36, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.hat || '#e0523f')); hat.position.y = 0.08; head.add(hat);
  const brim = cyl(0.37, 0.37, 0.1, look.brim || '#c4463a', 12); brim.position.y = 0.1; head.add(brim);
  const pom = mesh(new THREE.IcosahedronGeometry(0.1, 1), mat('#ffffff')); pom.position.y = 0.46; head.add(pom);

  // tools, held in the right hand
  const axe = new THREE.Group();
  const handle = cyl(0.03, 0.03, 0.7, '#8a5a3b'); handle.position.y = -0.1; axe.add(handle);
  const blade = box(0.05, 0.16, 0.24, '#b8c0c8'); blade.position.set(0, 0.17, 0.1); axe.add(blade);
  axe.position.set(0, -0.45, 0.05); axe.rotation.x = Math.PI / 2;
  arms[1].add(axe);
  const rod = new THREE.Group();
  const pole = cyl(0.018, 0.028, 1.7, '#7a4a2e'); pole.position.y = 0.75; rod.add(pole);
  const reel = cyl(0.06, 0.06, 0.06, '#3e3a3a'); reel.rotation.z = Math.PI / 2; reel.position.set(0.05, 0.1, 0); rod.add(reel);
  rod.position.set(0, -0.45, 0.05); rod.rotation.x = Math.PI / 2 - 0.4;
  arms[1].add(rod);
  const tip = new THREE.Object3D(); tip.position.y = 1.6; rod.add(tip);
  rod.visible = false; axe.visible = false;
  const held = mesh(new THREE.IcosahedronGeometry(0.15, 0), mat('#7fa6c4'), false);
  held.scale.set(1.8, 0.8, 0.6); held.position.set(0, -0.55, 0.12); held.visible = false;
  arms[1].add(held);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData = { body, legs, arms, head, axe, rod, tip, held };
  return root;
}

// --- particles -----------------------------------------------------------------
export class Particles {
  constructor(scene) {
    this.pool = [];
    this.geo = new THREE.IcosahedronGeometry(0.08, 0);
    this.mats = {};
    for (const [k, c] of Object.entries({ chip: '#c08a52', leaf: '#5aae55', splash: '#ffffff', dust: '#e8d6b0', smoke: '#9a9aa0', spark: '#ffd75e', foam: '#ffffff' })) {
      this.mats[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true });
    }
    this.scene = scene;
  }
  spawn(kind, pos, n, spread = 1, up = 2) {
    for (let i = 0; i < n; i++) {
      let p = this.pool.find((q) => !q.alive);
      if (!p) {
        if (this.pool.length > 260) return;
        const m = new THREE.Mesh(this.geo, this.mats[kind].clone());
        this.scene.add(m);
        p = { m };
        this.pool.push(p);
      }
      p.alive = true;
      p.kind = kind;
      p.m.visible = true;
      p.m.material.color.copy(this.mats[kind].color);
      p.m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3 * spread, Math.random() * 0.2, (Math.random() - 0.5) * 0.3 * spread));
      p.v = new THREE.Vector3((Math.random() - 0.5) * 2.4 * spread, up * (0.5 + Math.random()), (Math.random() - 0.5) * 2.4 * spread);
      p.life = p.max = kind === 'smoke' ? 2.4 : kind === 'foam' ? 0.9 : 0.6 + Math.random() * 0.5;
      p.s = kind === 'smoke' ? 1.6 : kind === 'leaf' ? 1.2 : 1;
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.m.visible = false; continue; }
      const k = p.life / p.max;
      if (p.kind === 'smoke') { p.v.y = 0.9; p.v.x *= 0.98; p.m.scale.setScalar(p.s * (2.8 - k * 2)); p.m.material.opacity = k * 0.45; }
      else if (p.kind === 'foam') { p.v.y = 0; p.v.multiplyScalar(0.94); p.m.scale.setScalar(1.5 * (1.4 - k * 0.6)); p.m.material.opacity = k * 0.7; }
      else { p.v.y -= 9 * dt; p.m.scale.setScalar(p.s * Math.min(1, k * 2)); p.m.material.opacity = 1; }
      p.m.position.addScaledVector(p.v, dt);
    }
  }
}
