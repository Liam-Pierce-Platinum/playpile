// THE THING. About 2.8 m when it stands up, which it mostly does not.
//
// What makes it frightening is wrongness, and wrongness has to be specific:
//   - proportions: a long narrow torso with every rib showing, a waist you could close a hand
//     round, a long neck, arms that reach past its knees, fingers as long as a forearm;
//   - no eyes: smooth stretched skin over shallow sockets, and a mouth that runs back almost
//     to where ears would be. The jaw drops past ninety degrees and the whole head opens;
//   - skin: pale, wet, veined, clear-coated so it glistens under sodium light, with a red sheen
//     at grazing angles where light would pass through thin skin;
//   - motion: it skitters on all fours with its knees up and out like a spider, then rears up
//     to full height; the head snaps to new angles and holds them; when it searches it moves in
//     stop-motion (pose updates at 11 Hz) and its head turns further than a neck should.
//
// Built as ONE skinned mesh with rigid per-segment bones (1 draw per material) whose bones are
// placed every frame by a small procedural rig: FK spine + 2-bone IK limbs + a gait that plants
// feet (and hands, when crawling) in the world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './textures.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ skin texture
function skinTextures() {
  const S = 1024;
  const alb = document.createElement('canvas'); alb.width = alb.height = S;
  const hgt = document.createElement('canvas'); hgt.width = hgt.height = S;
  const ga = alb.getContext('2d'), gh = hgt.getContext('2d');
  // base: pale, slightly yellow-grey, mottled with bruise-purple and blotchy pink
  const img = ga.createImageData(S, S), himg = gh.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const n = fbm(u * 8, v * 8, 5), m = fbm(u * 3 + 7, v * 3, 4), p = fbm(u * 40, v * 40, 2);
    const bruise = Math.max(0, m - 0.55) * 2.2;
    let r = 0.66 + n * 0.12, g = 0.66 + n * 0.1, b = 0.6 + n * 0.08;
    r = lerp(r, 0.55, bruise); g = lerp(g, 0.42, bruise); b = lerp(b, 0.58, bruise);
    const blotch = Math.max(0, fbm(u * 5 + 3, v * 5 + 9, 3) - 0.6) * 1.6;
    r += blotch * 0.12; g -= blotch * 0.04; b -= blotch * 0.02;
    const pore = (p - 0.5) * 0.05;
    const i = (y * S + x) * 4;
    img.data[i] = clamp((r + pore) * 255, 0, 255); img.data[i + 1] = clamp((g + pore) * 255, 0, 255); img.data[i + 2] = clamp((b + pore) * 255, 0, 255); img.data[i + 3] = 255;
    // height: fine wrinkles across, pores
    const wr = Math.sin(v * 900 + fbm(u * 20, v * 6, 3) * 18) * 0.5 + 0.5;
    const hv = 0.45 + (p - 0.5) * 0.15 - wr * 0.06 + (n - 0.5) * 0.1;
    himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = clamp(hv * 255, 0, 255); himg.data[i + 3] = 255;
  }
  ga.putImageData(img, 0, 0); gh.putImageData(himg, 0, 0);
  // veins: branching random walks, drawn in both maps (dark blue-violet in colour, raised in height)
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const vein = (x, y, ang, w, len, depth) => {
    let px = x, py = y;
    for (let s = 0; s < len; s++) {
      ang += (rnd() - 0.5) * 0.5;
      const nx = px + Math.cos(ang) * 4, ny = py + Math.sin(ang) * 4;
      for (const [g, col] of [[ga, `rgba(${70 + rnd() * 20},${50},${95 + rnd() * 30},${0.33 * w / 3 + 0.12})`], [gh, `rgba(255,255,255,${0.35 + 0.1 * w})`]]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.moveTo(px + ox, py + oy); g.lineTo(nx + ox, ny + oy); g.stroke(); }
      }
      px = nx; py = ny;
      if (depth < 3 && rnd() < 0.05) vein(px, py, ang + (rnd() < 0.5 ? 0.7 : -0.7), w * 0.6, len * 0.5, depth + 1);
      w *= 0.995;
    }
  };
  for (let k = 0; k < 70; k++) vein(rnd() * S, rnd() * S, rnd() * TAU, 1.5 + rnd() * 2.6, 40 + rnd() * 70, 0);
  // capillary webbing
  ga.globalAlpha = 0.25;
  for (let k = 0; k < 400; k++) { ga.strokeStyle = `rgba(120,40,60,0.3)`; ga.lineWidth = 0.6; ga.beginPath(); let x = rnd() * S, y = rnd() * S; ga.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 14; y += (rnd() - 0.5) * 14; ga.lineTo(x, y); } ga.stroke(); }
  ga.globalAlpha = 1;
  // blur the height a touch so normals are smooth
  const hb = document.createElement('canvas'); hb.width = hb.height = S;
  const hbg = hb.getContext('2d'); hbg.filter = 'blur(1.4px)'; hbg.drawImage(hgt, 0, 0);
  const hd = hbg.getImageData(0, 0, S, S).data;
  const nimg = hbg.createImageData(S, S), rimg = hbg.createImageData(S, S);
  const H = (x, y) => hd[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * 5, dy = (H(x, y + 1) - H(x, y - 1)) * 5;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    nimg.data[i] = (dx / l * 0.5 + 0.5) * 255; nimg.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nimg.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    // roughness: wetter (smoother) in the low creases, drier on raised veins
    const r = 0.38 + (H(x, y) - 0.45) * 0.6 + (fbm(x / S * 6, y / S * 6, 3) - 0.5) * 0.3;
    rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp(r * 255, 30, 230); rimg.data[i + 3] = 255;
  }
  const nc = document.createElement('canvas'); nc.width = nc.height = S; nc.getContext('2d').putImageData(nimg, 0, 0);
  const rc = document.createElement('canvas'); rc.width = rc.height = S; rc.getContext('2d').putImageData(rimg, 0, 0);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: mk(alb, true), normalMap: mk(nc, false), roughnessMap: mk(rc, false) };
}

// ------------------------------------------------------------------ geometry
// A tube along +Y from 0 to len. prof(t) -> [rx, rz]; disp(t, a) adds radius (a = 0 at +x, pi/2 at +z = front)
let LUMP = 0.0045, LSEED = 0;
function tube(len, prof, { seg = 18, rad = 16, disp = null, ofs = null, lump = LUMP } = {}) {
  const ls = (LSEED += 3.7);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, [rx, rz] = prof(t), [ox, oz] = ofs ? ofs(t) : [0, 0];
    const circ = Math.PI * (rx + rz);
    const ur = Math.max(1, Math.round(circ * 3));
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const d = (disp ? disp(t, a) : 0) + (lump ? (fbm(Math.cos(a) * 1.3 + ls, t * len * 9 + Math.sin(a) * 1.3, 3) - 0.5) * lump * 2 * Math.min(1, Math.sin(t * Math.PI) * 4) : 0);
      pos.push(ox + ca * (rx + d), t * len, oz + sa * (rz + d));
      uv.push(j / rad * ur, t * len * 3);
    }
  }
  const row = rad + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // caps
  const capA = pos.length / 3; { const [ox, oz] = ofs ? ofs(0) : [0, 0]; pos.push(ox, -0.004, oz); uv.push(0.5, 0); }
  const capB = pos.length / 3; { const [ox, oz] = ofs ? ofs(1) : [0, 0]; pos.push(ox, len + 0.004, oz); uv.push(0.5, len * 3); }
  for (let j = 0; j < rad; j++) { idx.push(capA, j, j + 1); idx.push(capB, seg * row + j + 1, seg * row + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld normals across the u seam
  const n = g.attributes.normal;
  for (let i = 0; i <= seg; i++) {
    const a = i * row, b = i * row + rad;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}
// deformed sphere (for skull, jaw, joints). f(p: unit vector) -> Vector3
function blob(f, ws = 36, hs = 28) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const o = f(v.clone()); p.setXYZ(i, o.x, o.y, o.z); }
  g.computeVertexNormals();
  return g;
}
function cone(r, len, bend = 0, seg = 10) {   // a tooth / claw along +Y, curving toward +z
  const g = new THREE.ConeGeometry(r, len, seg, 4);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / len; p.setZ(i, p.getZ(i) + bend * y * y * len); }
  g.computeVertexNormals();
  return g;
}
const knob = (t, at, w, h) => h * Math.exp(-((t - at) * (t - at)) / (w * w));

// ------------------------------------------------------------------ the body plan
const LEN = {
  pelvis: 0.22, abd: 0.4, chest: 0.5, neck: 0.34,
  thigh: 0.7, shin: 0.74, foot: 0.25,
  upper: 0.7, fore: 0.74, hand: 0.13,
  fing: [[0.1, 0.08, 0.065], [0.11, 0.085, 0.07], [0.105, 0.08, 0.068], [0.09, 0.07, 0.06]], thumb: [0.07, 0.06],
};
const HS = 1.42;   // head scale
const MOUTH = 0.035;
const MAT = { skin: 0, gum: 1, tooth: 2, mouth: 3, claw: 4 };
// skin weights blend across every joint (parent at the start of a segment, the one child at its end)
const PARENT = { abd: 'pelvis', chest: 'abd', neck: 'chest', jawRef: 'head', jaw: 'jawRef' };
const CHILD = { pelvis: 'abd', abd: 'chest', neck: 'head' };
for (const s of ['L', 'R']) {
  Object.assign(PARENT, { ['thigh' + s]: 'pelvis', ['shin' + s]: 'thigh' + s, ['foot' + s]: 'shin' + s, ['upper' + s]: 'chest', ['fore' + s]: 'upper' + s, ['hand' + s]: 'fore' + s, [`t${s}_0`]: 'hand' + s, [`t${s}_1`]: `t${s}_0` });
  Object.assign(CHILD, { ['thigh' + s]: 'shin' + s, ['shin' + s]: 'foot' + s, ['upper' + s]: 'fore' + s, ['fore' + s]: 'hand' + s, [`t${s}_0`]: `t${s}_1` });
  for (let f = 0; f < 4; f++) for (let k = 0; k < 3; k++) { PARENT[`f${s}${f}_${k}`] = k ? `f${s}${f}_${k - 1}` : 'hand' + s; if (k < 2) CHILD[`f${s}${f}_${k}`] = `f${s}${f}_${k + 1}`; }
}
const START_W = { thigh: 0.35, upper: 0.3, neck: 0.5 };

// sockets where eyes should be: deep, skin-covered, dark
const socket = (o, s) => { const dx = o.x - s * 0.042, dy = o.y - 0.125, dz = o.z - 0.185; return Math.exp(-(dx * dx * 1.2 + dy * dy * 2.2 + dz * dz) / 0.0007); };

function buildParts() {
  const parts = [];
  const add = (bone, geo, mat = MAT.skin, opt = {}) => parts.push({ bone, geo, mat, ...opt });
  // pelvis: hip bones jut out at the sides, the front is hollow
  add('pelvis', tube(LEN.pelvis, t => [0.095 + 0.045 * Math.sin(t * Math.PI), 0.07 + 0.02 * Math.sin(t * Math.PI)], {
    disp: (t, a) => knob(t, 0.62, 0.14, 0.03) * Math.max(0, Math.abs(Math.cos(a)) - 0.25) - knob(t, 0.45, 0.3, 0.014) * Math.max(0, Math.sin(a)) + 0.012 * Math.max(0, -Math.sin(a)) ** 8 * knob(t, 0.7, 0.2, 1),
  }).translate(0, -LEN.pelvis + 0.03, 0));
  // abdomen: a waist you could close a hand round, the belly sucked in, every vertebra showing
  add('abd', tube(LEN.abd, t => [0.085 + 0.03 * t * t, 0.064 + 0.012 * t], {
    seg: 22,
    ofs: t => [0, -0.022 * Math.sin(t * Math.PI)],
    disp: (t, a) => {
      const back = Math.max(0, -Math.sin(a)) ** 6;
      const vert = back * 0.017 * Math.max(0, Math.sin(t * LEN.abd / 0.045 * TAU));
      const sink = -0.014 * Math.max(0, Math.sin(a)) * Math.sin(t * Math.PI);
      const side = 0.006 * Math.sin(a * 6) * Math.max(0, Math.sin(a));
      return vert + sink + side;
    },
  }));
  // ribcage: every rib ridged round the front and sides, sternum, collarbones, shoulder blades;
  // rounded over the top into the neck so there is no shelf
  add('chest', tube(LEN.chest, t => {
    let w = 0.12 + 0.065 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.55);
    let d = 0.085 + 0.04 * Math.sin(t * Math.PI * 0.9);
    if (t > 0.86) { const k = (t - 0.86) / 0.14; w = lerp(w, 0.055, k * k); d = lerp(d, 0.045, k); }
    return [w, d];
  }, {
    seg: 32, rad: 26,
    disp: (t, a) => {
      const front = Math.max(0, Math.sin(a) + 0.35);
      const ribPhase = (t * LEN.chest + Math.abs(Math.cos(a)) * 0.05) / 0.042;
      const inR = t < 0.8 && t > 0.06;
      const ribs = inR ? 0.014 * Math.max(0, Math.sin(ribPhase * TAU)) ** 2 * front : 0;
      const gaps = inR ? -0.008 * front * Math.max(0, -Math.sin(ribPhase * TAU)) : 0;
      const sternum = 0.012 * Math.exp(-((a - Math.PI / 2) ** 2) / 0.02) * (t > 0.3 && t < 0.85 ? 1 : 0);
      const back = Math.max(0, -Math.sin(a)) ** 8 * 0.02 * Math.max(0, Math.sin(t * LEN.chest / 0.045 * TAU));
      const blades = knob(t, 0.66, 0.13, 0.034) * (Math.exp(-((a + Math.PI / 2 - 0.65) ** 2) / 0.08) + Math.exp(-((a + Math.PI / 2 + 0.65) ** 2) / 0.08));
      const clav = knob(t, 0.88, 0.04, 0.012) * Math.max(0, Math.sin(a));
      const traps = knob(t, 0.93, 0.06, 0.02) * Math.abs(Math.cos(a));
      return ribs + gaps + sternum + back + blades + clav + traps;
    },
  }));
  // neck: long, thin, the cords standing out, a curve in it
  add('neck', tube(LEN.neck, t => [0.048 - 0.008 * t, 0.046 - 0.006 * t], {
    ofs: t => [0, 0.012 * Math.sin(t * Math.PI)],
    disp: (t, a) => 0.01 * (Math.exp(-((a - 1.1) ** 2) / 0.05) + Math.exp(-((a - 2.04) ** 2) / 0.05)) + 0.006 * Math.exp(-((a - Math.PI / 2) ** 2) / 0.03) * knob(t, 0.45, 0.15, 1) + 0.012 * Math.max(0, -Math.sin(a)) ** 10 * Math.max(0, Math.sin(t * LEN.neck / 0.05 * TAU)),
  }).translate(0, -0.04, 0));
  // skull: long, tall, swept back; no eyes, just deep sockets of skin; cut flat at the mouth line
  const skull = blob(v => {
    const o = V(v.x * 0.09, v.y * 0.13 + 0.112, v.z * 0.15 + 0.05);
    if (o.z < 0) { o.y += -o.z * 0.35; o.z *= 1.15; }
    for (const s of [-1, 1]) {
      o.z -= socket(o, s) * 0.03;
      const cb = Math.exp(-((o.x - s * 0.072) ** 2 + (o.y - 0.075) ** 2 + (o.z - 0.12) ** 2) / 0.001);
      o.x += s * cb * 0.014;
    }
    if (o.z > 0.12 && o.y > 0.15 && o.y < 0.175) o.z += 0.012 * Math.exp(-(o.x * o.x) / 0.004);
    if (o.y < 0.095) { const k = (0.095 - o.y) / 0.06; o.z += k * 0.04 * Math.max(0, v.z); o.x *= 1 + k * 0.18; }
    if (Math.abs(o.x) < 0.012 && o.y > 0.075 && o.y < 0.115 && o.z > 0.17) o.z -= 0.014;
    o.x += Math.sin(o.y * 120 + o.z * 40) * 0.0015;
    if (o.y < MOUTH) o.y = MOUTH;
    return o;
  }, 44, 36);
  const sk = skull.toNonIndexed(), sp = sk.attributes.position;
  const skinT = [], palT = [];
  for (let i = 0; i < sp.count; i += 3) {
    const flat = sp.getY(i) <= MOUTH + 1e-4 && sp.getY(i + 1) <= MOUTH + 1e-4 && sp.getY(i + 2) <= MOUTH + 1e-4;
    (flat ? palT : skinT).push(i);
  }
  const subset = (g, tris) => {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    const P = [], N = [], U = [];
    for (const i of tris) for (let k = 0; k < 3; k++) { P.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); N.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k)); U.push(u.getX(i + k) * 2, u.getY(i + k) * 2); }
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return o;
  };
  add('head', subset(sk, skinT), MAT.skin, { blend: false, shade: (p) => 1 - 0.75 * Math.min(1, socket(p, 1) + socket(p, -1)) - (p.y < MOUTH + 0.012 ? 0.35 : 0) });
  const pal = subset(sk, palT); pal.computeVertexNormals();
  add('head', pal, MAT.mouth, { blend: false });
  // upper teeth: needles along the rim of the palate, longest at the front, crooked
  const rim = []; for (let i = 0; i <= 30; i++) { const a = -Math.PI * 0.84 + i / 30 * Math.PI * 1.68; rim.push(V(Math.sin(a) * 0.08, MOUTH, 0.065 + Math.cos(a) * 0.125)); }
  const teethU = [];
  rim.forEach((p) => {
    const front = Math.max(0, p.z - 0.04) / 0.15;
    const L = 0.016 + 0.034 * front + Math.random() * 0.014;
    const g = cone(0.0042 + Math.random() * 0.002, L, -0.25 + Math.random() * 0.1);
    g.rotateX(Math.PI).rotateZ((Math.random() - 0.5) * 0.5).rotateX((Math.random() - 0.5) * 0.5);
    teethU.push(g.translate(p.x * 0.97, p.y + 0.002, p.z * 0.98));
  });
  add('head', mergeGeometries(teethU), MAT.tooth, { blend: false });
  add('head', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim.map(p => p.clone().add(V(0, 0.004, 0)))), 64, 0.008, 6, false), MAT.gum, { blend: false });
  // lower jaw (jaw-bone space: the hinge is the origin): a long U-shaped trough, as long as the head
  const jaw = blob(v => {
    const o = V(v.x * 0.074, v.y * 0.05 - 0.02, v.z * 0.125 + 0.085);
    if (o.z < 0.02) o.x *= 1 + (o.z - 0.02) * 3;
    o.x *= 1 + (o.z - 0.08) * 0.5;
    if (o.y > -0.002) o.y = -0.002;
    return o;
  }, 34, 22);
  const jk = jaw.toNonIndexed(), jp = jk.attributes.position;
  const jSkin = [], jIn = [];
  for (let i = 0; i < jp.count; i += 3) { const flat = jp.getY(i) >= -0.0025 && jp.getY(i + 1) >= -0.0025 && jp.getY(i + 2) >= -0.0025; (flat ? jIn : jSkin).push(i); }
  add('jaw', subset(jk, jSkin), MAT.skin, { blend: false, shade: (p) => p.y > -0.012 ? 0.6 : 1 });
  const jin = subset(jk, jIn); jin.computeVertexNormals(); add('jaw', jin, MAT.mouth, { blend: false });
  const lower = []; for (let i = 0; i <= 26; i++) { const a = -Math.PI * 0.8 + i / 26 * Math.PI * 1.6; lower.push(V(Math.sin(a) * 0.066, -0.004, 0.09 + Math.cos(a) * 0.112)); }
  const teethL = [];
  lower.forEach((p) => {
    const front = Math.max(0, p.z - 0.06) / 0.14;
    const L = 0.012 + 0.028 * front + Math.random() * 0.012;
    teethL.push(cone(0.004 + Math.random() * 0.002, L, 0.2).rotateZ((Math.random() - 0.5) * 0.5).rotateX((Math.random() - 0.5) * 0.4).translate(p.x, p.y, p.z));
  });
  add('jaw', mergeGeometries(teethL), MAT.tooth, { blend: false });
  add('jaw', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lower.map(p => p.clone().add(V(0, -0.004, 0)))), 50, 0.007, 6, false), MAT.gum, { blend: false });
  add('jaw', blob(v => V(v.x * 0.03, v.y * 0.012 - 0.008, v.z * 0.075 + 0.09), 12, 8), MAT.gum, { blend: false });
  // the cheeks: a wet web of skin from the upper jaw to the lower one that stretches as the head
  // opens (hinge space; the top row follows the skull, the bottom row follows the jaw)
  for (const s of [-1, 1]) {
    const R = 6, along = [];
    for (let i = 0; i <= 10; i++) { const a = s * (Math.PI * 0.84 - i / 10 * Math.PI * 0.42); along.push(V(Math.sin(a) * 0.076, 0, 0.065 + Math.cos(a) * 0.12 + 0.02)); }
    const P = [], N = [], U = [], I = [];
    for (let i = 0; i < along.length; i++) for (let r = 0; r <= R; r++) {
      const p = along[i]; P.push(p.x * HS * 0.96, -r / R * 0.003, p.z * HS); N.push(s, 0, 0); U.push(i / 10 * 2, r / R);
    }
    for (let i = 0; i < along.length - 1; i++) for (let r = 0; r < R; r++) {
      const a = i * (R + 1) + r, b = a + 1, c = a + R + 1, d = c + 1;
      if (s > 0) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    add('jawRef', g, MAT.gum, { membrane: true, noScale: true });
  }

  // limbs
  const limb = (len, r0, r1, kn0, kn1, ridges = 0) => tube(len, t => { const r = lerp(r0, r1, t) + r0 * 0.22 * Math.sin(Math.min(1, t * 1.4) * Math.PI); return [r, r * 0.88]; }, {
    disp: (t, a) => knob(t, 0.02, 0.06, kn0) + knob(t, 0.97, 0.05, kn1) + (ridges ? ridges * Math.sin(a * 3 + t * 2) * Math.sin(t * Math.PI) : 0) + 0.003 * Math.max(0, Math.sin(a)) ** 20,
  });
  for (const s of ['L', 'R']) {
    add('thigh' + s, limb(LEN.thigh, 0.078, 0.05, 0.012, 0.026, 0.006));
    add('shin' + s, tube(LEN.shin, t => [lerp(0.05, 0.028, t) + 0.014 * Math.sin(Math.min(1, t * 2.2) * Math.PI) * (1 - t), lerp(0.047, 0.026, t) + 0.016 * Math.sin(Math.min(1, t * 2.2) * Math.PI) * (1 - t)], { disp: (t, a) => knob(t, 0.03, 0.06, 0.016) + knob(t, 0.97, 0.05, 0.012) + 0.008 * Math.exp(-((a - Math.PI / 2) ** 2) / 0.05) }));
    add('foot' + s, tube(LEN.foot, t => [lerp(0.04, 0.03, t), lerp(0.03, 0.012, t)], { disp: (t, a) => knob(t, 0.05, 0.08, 0.012) + 0.004 * Math.max(0, Math.sin(a * 4)) * t }));
    const toeClaw = []; for (let i = 0; i < 4; i++) toeClaw.push(cone(0.008, 0.05, -0.6, 5).translate((i - 1.5) * 0.017, LEN.foot - 0.01, 0.0));
    add('foot' + s, mergeGeometries(toeClaw), MAT.claw, { blend: false });
    add('upper' + s, limb(LEN.upper, 0.05, 0.033, 0.02, 0.024, 0.006));
    add('fore' + s, tube(LEN.fore, t => [lerp(0.04, 0.024, t) + 0.01 * Math.sin(Math.min(1, t * 2) * Math.PI) * (1 - t), lerp(0.032, 0.018, t) + 0.008 * Math.sin(Math.min(1, t * 2) * Math.PI) * (1 - t)], { disp: (t, a) => knob(t, 0.03, 0.05, 0.016) + knob(t, 0.98, 0.04, 0.008) + 0.005 * Math.exp(-((a) ** 2) / 0.1) * Math.sin(t * Math.PI) }));
    add('hand' + s, tube(LEN.hand, t => [lerp(0.03, 0.045, t), 0.014], { disp: (t, a) => 0.005 * Math.max(0, Math.cos(a * 4)) * t }));
    LEN.fing.forEach((ph, f) => ph.forEach((l, k) => {
      add(`f${s}${f}_${k}`, tube(l, t => { const r = lerp(0.011, 0.008, (k + t) / 3); return [r, r * 0.9]; }, { seg: 6, rad: 8, disp: (t) => knob(t, 0.02, 0.1, 0.004) }));
      if (k === 2) add(`f${s}${f}_${k}`, cone(0.0075, 0.045, 0.5, 6).rotateX(0.35).translate(0, l, 0.002), MAT.claw, { blend: false });
    }));
    LEN.thumb.forEach((l, k) => {
      add(`t${s}_${k}`, tube(l, t => [0.011, 0.01], { seg: 6, rad: 8 }));
      if (k === 1) add(`t${s}_${k}`, cone(0.007, 0.035, 0.5, 6).translate(0, l, 0), MAT.claw, { blend: false });
    });
    // knuckled knees and elbows that stick out
    add('shin' + s, new THREE.SphereGeometry(0.048, 14, 10).scale(1, 0.9, 1.1).translate(0, 0.0, 0.014), MAT.skin, { blend: false });
    add('fore' + s, new THREE.SphereGeometry(0.036, 12, 10).translate(0, 0, -0.012), MAT.skin, { blend: false });
    add('upper' + s, new THREE.SphereGeometry(0.052, 14, 10), MAT.skin, { blend: false });
    add('thigh' + s, new THREE.SphereGeometry(0.07, 14, 10), MAT.skin, { blend: false });
    add('foot' + s, new THREE.SphereGeometry(0.033, 10, 8), MAT.skin, { blend: false });
  }
  for (const p of parts) if ((p.bone === 'head' || p.bone === 'jaw') && !p.noScale) p.geo.scale(HS, HS, HS);
  return parts;
}

// ------------------------------------------------------------------ the creature
const BONES = ['pelvis', 'abd', 'chest', 'neck', 'head', 'jawRef', 'jaw'];
for (const s of ['L', 'R']) {
  BONES.push('thigh' + s, 'shin' + s, 'foot' + s, 'upper' + s, 'fore' + s, 'hand' + s);
  for (let f = 0; f < 4; f++) for (let k = 0; k < 3; k++) BONES.push(`f${s}${f}_${k}`);
  BONES.push(`t${s}_0`, `t${s}_1`);
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = V(), _b = V(), _c = V(), _d = V(), _x = V(), _y = V(), _z = V();

export class Monster {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'monster';
    scene.add(this.root);
    // ---- animation state ----
    this.st = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, crawl: 0, rear: 0, jaw: 0, reach: 0, smash: 0, vault: 0, stumble: 0, grab: 0, scream: 0, loom: 0, stop: false, ceiling: 9, look: null, twitch: 1 };
    this.w = { crawl: 0, rear: 0, reach: 0, smash: 0, vault: 0, stumble: 0, grab: 0, scream: 0, loom: 0, jaw: 0 };
    this.phase = 0; this.t = 0; this.stepT = 0;
    this.limbs = ['L', 'R'].flatMap((s, i) => [
      { name: 'leg' + s, side: i ? -1 : 1, arm: false, planted: V(), from: V(), swing: false, cur: V(), init: false },
      { name: 'arm' + s, side: i ? -1 : 1, arm: true, planted: V(), from: V(), swing: false, cur: V(), init: false },
    ]);
    this.headSnap = { yaw: 0, pitch: 0, roll: 0, t: 0, hold: 9 };
    this.tw = { yaw: 0, pitch: 0, roll: 0 };
    this.events = [];
    this.headWorld = V(); this.mouthWorld = V(); this.handWorld = [V(), V()]; this.chestWorld = V();
    this.lookYaw = 0; this.lookPitch = 0;

    const tex = skinTextures();
    this.mats = [
      new THREE.MeshPhysicalMaterial({ color: 0xb4b8b0, map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(1.0, 1.0), roughnessMap: tex.roughnessMap, roughness: 0.7, vertexColors: true, clearcoat: 1.0, clearcoatRoughness: 0.14, sheen: 0.45, sheenColor: new THREE.Color(0.55, 0.16, 0.16), sheenRoughness: 0.45, envMapIntensity: 1.2, emissive: new THREE.Color(0.03, 0.033, 0.038) }),
      new THREE.MeshPhysicalMaterial({ color: 0x5a0d10, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: new THREE.Color(0.8, 0.1, 0.1), side: THREE.DoubleSide }),
      new THREE.MeshPhysicalMaterial({ color: 0xcfc4a0, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: new THREE.Color(0.05, 0.047, 0.04) }),
      new THREE.MeshPhysicalMaterial({ color: 0x0e0102, roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.4, envMapIntensity: 0.05, side: THREE.DoubleSide }),
      new THREE.MeshPhysicalMaterial({ color: 0x3a3226, roughness: 0.35, clearcoat: 0.6 }),
    ];
    // bones: flat under the skinned mesh, placed directly in root space each frame
    this.bones = BONES.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    this.B = Object.fromEntries(this.bones.map(b => [b.name, b]));
    // bind pose: the rig standing up straight, mouth shut
    this.st.rear = 1;
    for (const k in this.w) this.w[k] = 0;
    this.w.rear = 1;
    this.update(1 / 60, 0, () => 0, true);
    const bind = this.bones.map(b => new THREE.Matrix4().compose(b.position, b.quaternion, new THREE.Vector3(1, 1, 1)));
    this.st.rear = 0; this.w.rear = 0;
    for (const L of this.limbs) L.init = false;

    const parts = buildParts();
    const byMat = [[], [], [], [], []];
    const vtx = V();
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const bi = BONES.indexOf(p.bone);
      const n = g.attributes.position.count, pa = g.attributes.position;
      // colour: extremities bruised darker, sockets and lips nearly black
      const tint = /^(f|t)[LR]/.test(p.bone) || /^(hand|foot)/.test(p.bone) ? [0.58, 0.52, 0.56] : /^(shin|fore)/.test(p.bone) ? [0.84, 0.8, 0.79] : /^(head|jaw)/.test(p.bone) ? [0.98, 0.96, 0.93] : /^(neck|chest)/.test(p.bone) ? [0.94, 0.92, 0.9] : [0.9, 0.88, 0.86];
      const col = new Float32Array(n * 3);
      let y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < n; i++) { const y = pa.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      const par = PARENT[p.bone], chi = CHILD[p.bone];
      const blend = p.mat === MAT.skin && p.blend !== false;
      const sW = START_W[p.bone.replace(/[LR]$/, '')] ?? 0.5;
      for (let i = 0; i < n; i++) {
        vtx.fromBufferAttribute(pa, i);
        let k = 1;
        if (p.shade) k = Math.max(0.12, p.shade(vtx.clone().divideScalar(p.bone === 'head' || p.bone === 'jaw' ? HS : 1)));
        if (/^(shin|fore)/.test(p.bone)) k *= 1 - Math.min(1, Math.max(0, vtx.y / 0.7)) * 0.25;
        col[i * 3] = tint[0] * k; col[i * 3 + 1] = tint[1] * k; col[i * 3 + 2] = tint[2] * k;
        si[i * 4] = bi; sw[i * 4] = 1;
        if (p.membrane) {
          const r = g.attributes.uv.getY(i);
          si[i * 4 + 1] = BONES.indexOf('jaw'); sw[i * 4] = 1 - r; sw[i * 4 + 1] = r;
        } else if (blend && y1 > y0) {
          const t = (vtx.y - y0) / (y1 - y0);
          let wp = 0, wc = 0;
          if (par && t < 0.2) wp = sW * Math.pow(1 - t / 0.2, 1.5);
          if (chi && t > 0.8) wc = 0.5 * Math.pow((t - 0.8) / 0.2, 1.5);
          if (wp) { si[i * 4 + 1] = BONES.indexOf(par); sw[i * 4 + 1] = wp; }
          if (wc) { si[i * 4 + 2] = BONES.indexOf(chi); sw[i * 4 + 2] = wc; }
          sw[i * 4] = 1 - wp - wc;
        }
      }
      // bone space -> bind (model) space
      g.applyMatrix4(bind[bi]);
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      byMat[p.mat].push(g);
    }
    const merged = mergeGeometries(byMat.map(l => mergeGeometries(l)), true);
    this.mesh = new THREE.SkinnedMesh(merged, this.mats);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (const b of this.bones) this.mesh.add(b);
    this.root.add(this.mesh);
    const skel = new THREE.Skeleton(this.bones, bind.map(m => m.clone().invert()));
    this.mesh.bind(skel, new THREE.Matrix4());
  }


  // ground(x, z, yHint) -> floor height
  update(dt, t, ground, bindPose = false) {
    const st = this.st, w = this.w;
    this.t = t;
    // stop-motion when stalking / searching: the pose only advances in 1/11 s steps
    if (st.stop) { this.stepT += dt; if (this.stepT < 1 / 11) { this.root.position.set(this._rx ?? st.x, this._ry ?? st.y, this._rz ?? st.z); return; } dt = this.stepT; this.stepT = 0; }
    this._rx = st.x; this._ry = st.y; this._rz = st.z;
    const k = 1 - Math.exp(-dt * 6);
    if (!bindPose) for (const key of ['crawl', 'rear', 'reach', 'smash', 'vault', 'stumble', 'grab', 'scream', 'loom']) w[key] += (st[key] - w[key]) * (key === 'grab' || key === 'stumble' ? 1 - Math.exp(-dt * 10) : k);
    w.jaw += (st.jaw - w.jaw) * (1 - Math.exp(-dt * 14));
    const crawl = clamp(w.crawl - w.rear - w.grab - w.smash, 0, 1);
    // ceiling: duck under it
    const tallH = 2.85, need = Math.max(0, tallH - st.ceiling + 0.15);
    const duck = clamp(need / 1.2, 0, 1);

    this.root.position.set(st.x, st.y, st.z);
    this.root.rotation.set(0, st.yaw, 0);
    if (bindPose) { this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); }
    this.root.updateMatrixWorld(true);
    const inv = _inv.copy(this.root.matrixWorld).invert();

    // gait
    const speed = st.speed;
    const stride = lerp(2.3, 1.45, crawl) * (speed > 6 ? 1.15 : 1);
    const freq = speed > 0.15 ? clamp(speed / stride, 0.6, 4.2) : 0;
    this.phase += dt * freq;
    const duty = lerp(speed > 3 ? 0.36 : 0.6, 0.48, crawl);

    // ---- posture (biped hunch -> crawl -> reared up) ----
    const lean = clamp(speed * 0.045, 0, 0.35);
    const bob = speed > 0.2 ? Math.abs(Math.sin(this.phase * TAU)) * lerp(0.07, 0.05, crawl) : Math.sin(t * 1.3) * 0.01;
    let hipH = lerp(1.14, 1.0, crawl);
    let pelP = lerp(0.3 + lean, 1.2, crawl), abdP = lerp(0.22, 0.12, crawl), chP = lerp(0.62 + lean, 0.1, crawl), nkP = lerp(-0.35, -0.5, crawl), hdP = lerp(-0.55, -0.85, crawl);
    // reared up: full height, arms out
    const R = clamp(w.rear + w.grab * 0.9 + w.smash * 0.7 + w.scream * 0.8, 0, 1);
    hipH = lerp(hipH, 1.38, R); pelP = lerp(pelP, -0.05, R); abdP = lerp(abdP, -0.08, R); chP = lerp(chP, -0.02 + w.scream * -0.25, R); nkP = lerp(nkP, 0.05, R); hdP = lerp(hdP, -0.1 - w.scream * 0.5, R);
    // loom: folds down over its prey so the open head is right in your face
    hipH -= w.loom * 0.32; pelP += w.loom * 0.25; chP += w.loom * 0.95; nkP += w.loom * 0.45; hdP -= w.loom * 1.15;
    // duck under low ceilings (hunches further)
    hipH -= duck * 0.15; chP += duck * 0.7; nkP -= duck * 0.4;
    // stumble: pitches forward, drops
    hipH -= w.stumble * 0.45; pelP += w.stumble * 0.8; chP += w.stumble * 0.4;
    // vault: tuck
    hipH -= w.vault * 0.1; chP += w.vault * 0.3;
    hipH += bob * (1 - w.stumble);
    // smash: pound with the whole body
    const pound = w.smash > 0.1 ? Math.max(0, Math.sin(t * 9)) : 0;
    chP += pound * w.smash * 0.6;

    // twitches: the head snaps to a new angle and holds it; shoulders jerk
    const hs = this.headSnap;
    hs.hold -= dt;
    if (hs.hold <= 0) {
      const busy = st.twitch;
      if (Math.random() < 0.55) { hs.yaw = (Math.random() - 0.5) * 1.2 * busy; hs.pitch = (Math.random() - 0.5) * 0.6 * busy; hs.roll = (Math.random() - 0.5) * 1.4 * busy; }
      else { hs.yaw = hs.pitch = 0; hs.roll = (Math.random() - 0.5) * 0.5; }
      hs.hold = 0.12 + Math.random() * (st.stop ? 0.9 : 0.45);
    }
    const snapK = 1 - Math.exp(-dt * 40);       // snap, do not ease
    this.tw.yaw += (hs.yaw - this.tw.yaw) * snapK; this.tw.pitch += (hs.pitch - this.tw.pitch) * snapK; this.tw.roll += (hs.roll - this.tw.roll) * snapK;

    // look target -> neck/head yaw & pitch (it can turn its head much further than it should)
    let lookYaw = 0, lookPitch = 0;
    if (st.look) {
      _a.set(st.look.x, st.look.y, st.look.z).applyMatrix4(inv);
      _a.y -= 2.2;
      lookYaw = Math.atan2(_a.x, _a.z); lookPitch = -Math.atan2(_a.y, Math.hypot(_a.x, _a.z));
      lookYaw = clamp(lookYaw, -2.4, 2.4);
    }
    this.lookYaw += (lookYaw - this.lookYaw) * (1 - Math.exp(-dt * 12));
    this.lookPitch += (lookPitch - this.lookPitch) * (1 - Math.exp(-dt * 10));

    // ---- spine FK ----
    const sway = Math.sin(this.phase * TAU) * 0.06 * (speed > 0.2 ? 1 : 0);
    const P0 = V(0, hipH, 0);
    const qPel = new THREE.Quaternion().setFromEuler(_e.set(pelP, sway * 0.5, sway * 0.6 * (1 - crawl), 'YXZ'));
    const qAbd = qPel.clone().multiply(_q.setFromEuler(_e.set(abdP, -sway * 0.6, -sway * 0.4, 'YXZ')));
    const qCh = qAbd.clone().multiply(_q.setFromEuler(_e.set(chP, -sway + this.lookYaw * 0.15, -sway * 0.5 + this.tw.roll * 0.08, 'YXZ')));
    const P1 = P0.clone().add(V(0, LEN.abd * 0, 0));
    const P2 = P1.clone().add(V(0, LEN.abd, 0).applyQuaternion(qAbd));
    const P3 = P2.clone().add(V(0, LEN.chest, 0).applyQuaternion(qCh));
    const qNk = qCh.clone().multiply(_q.setFromEuler(_e.set(nkP + this.lookPitch * 0.4 + this.tw.pitch * 0.4, this.lookYaw * 0.4 + this.tw.yaw * 0.4, this.tw.roll * 0.3, 'YXZ')));
    const P4 = P3.clone().add(V(0, LEN.neck - 0.03, -0.01).applyQuaternion(qNk));
    const qHd = qNk.clone().multiply(_q.setFromEuler(_e.set(hdP + this.lookPitch * 0.6 + this.tw.pitch * 0.6, this.lookYaw * 0.6 + this.tw.yaw * 0.6, this.tw.roll * 0.7 + w.scream * Math.sin(t * 40) * 0.1, 'YXZ')));
    this.setBone('pelvis', P0, qPel);
    this.setBone('abd', P1, qAbd);
    this.setBone('chest', P2, qCh);
    this.setBone('neck', P3, qNk);
    this.setBone('head', P4, qHd);
    // jaw: hinged at the back of the mouth; opens past 90 degrees
    const jawOpen = bindPose ? 0 : w.jaw * 1.12 + (w.jaw > 0.3 ? Math.sin(t * 31) * 0.05 * w.jaw : 0);
    const hinge = V(0, 0.035 * HS, -0.02 * HS).applyQuaternion(qHd).add(P4);
    const qJaw = qHd.clone().multiply(_q.setFromEuler(_e.set(jawOpen, 0, 0, 'YXZ')));
    this.setBone('jawRef', hinge, qHd);
    this.setBone('jaw', hinge, qJaw);
    // offset: jaw geometry hinge is at local (0,0,0) placed at hinge; geometry spans +z forward

    // ---- limbs ----
    const fwdW = V(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    const velW = V(st.vx, 0, st.vz);
    const rootW = V(st.x, st.y, st.z);
    const restLocal = (L) => {
      if (!L.arm) return crawl > 0.5 ? V(L.side * 0.34, 0, -0.38) : V(L.side * 0.16, 0, 0.02);
      return V(L.side * 0.44, 0, 1.02);
    };
    const offs = { legL: 0, legR: 0.5, armL: 0.62, armR: 0.12 };
    const hips = { L: V(0.12, -0.04, 0).applyQuaternion(qPel).add(P0), R: V(-0.12, -0.04, 0).applyQuaternion(qPel).add(P0) };
    const shoulders = { L: V(0.2, LEN.chest - 0.07, -0.02).applyQuaternion(qCh).add(P2), R: V(-0.2, LEN.chest - 0.07, -0.02).applyQuaternion(qCh).add(P2) };
    for (const L of this.limbs) {
      const sideK = L.side > 0 ? 'L' : 'R';
      const onGround = !L.arm || crawl > 0.45;
      let tgtLocal;
      if (!L.arm && w.vault >= 0.5) {
        // legs over an obstacle: tucked up under the hips
        L.init = false; L.swing = false;
        tgtLocal = hips[sideK].clone().add(V(L.side * 0.12, -0.72, 0.3));
      } else if (onGround && (!L.arm || (w.vault < 0.5 && w.grab < 0.3))) {
        const restW = restLocal(L).applyAxisAngle(_y.set(0, 1, 0), st.yaw).add(rootW);
        const off = offs[L.name];
        const p = this.phase + off + (L.arm ? 0.03 * Math.sin(t * 7 + L.side) : 0);
        const ph = p - Math.floor(p);
        if (!L.init) { L.planted.copy(restW); L.planted.y = ground(restW.x, restW.z, st.y + 0.5); L.init = true; }
        if (freq === 0) {
          // standing: step only if the foot is far from where it should be
          if (!L.swing && L.planted.distanceTo(restW) > 0.45) { L.swing = true; L.from.copy(L.planted); L.sw = 0; }
          if (L.swing) {
            L.sw += dt * 4;
            const tgt = restW.clone(); tgt.y = ground(tgt.x, tgt.z, st.y + 0.5);
            L.cur.lerpVectors(L.from, tgt, smooth(Math.min(1, L.sw))); L.cur.y += Math.sin(Math.min(1, L.sw) * Math.PI) * 0.15;
            if (L.sw >= 1) { L.swing = false; L.planted.copy(tgt); this.events.push({ type: 'step', pos: tgt.clone(), arm: L.arm, soft: true }); }
          } else L.cur.copy(L.planted);
        } else if (ph < duty) {
          if (L.swing) { L.swing = false; L.planted.copy(L.cur); L.planted.y = ground(L.cur.x, L.cur.z, st.y + 0.6); this.events.push({ type: 'step', pos: L.planted.clone(), arm: L.arm }); }
          L.cur.copy(L.planted);
        } else {
          if (!L.swing) { L.swing = true; L.from.copy(L.planted); }
          const s = (ph - duty) / (1 - duty);
          const lead = (duty / freq) * 0.5 + ((1 - duty) / freq) * (1 - s);
          const tgt = restW.clone().addScaledVector(velW, lead);
          tgt.y = ground(tgt.x, tgt.z, st.y + 0.6);
          L.cur.lerpVectors(L.from, tgt, smooth(s));
          L.cur.y += Math.sin(s * Math.PI) * (L.arm ? 0.28 : lerp(0.32, 0.25, crawl)) * clamp(speed / 4, 0.4, 1.3);
        }
        tgtLocal = L.cur.clone().applyMatrix4(inv);
      } else {
        // arms not walking: biped run (long arms trailing and flailing), reaching, smashing, grabbing
        L.init = false; L.swing = false;
        const sh = shoulders[sideK];
        const swing = Math.sin((this.phase + (L.side > 0 ? 0.5 : 0)) * TAU);
        tgtLocal = sh.clone().add(V(L.side * (0.16 + 0.05 * Math.sin(t * 3.1 + L.side)), -1.05 + 0.12 * Math.abs(swing) * clamp(speed / 5, 0, 1), -0.15 + 0.55 * swing * clamp(speed / 5, 0, 1)));
        // idle: arms hang, fingers twitch, an arm drifts
        if (speed < 0.3) tgtLocal.add(V(0, 0.05 * Math.sin(t * 0.7 + L.side), 0.18 + 0.06 * Math.sin(t * 1.1 + L.side * 2)));
        // reach forward at head height
        const reach = clamp(w.reach + w.grab, 0, 1);
        if (reach > 0.01) {
          const rt = sh.clone().add(V(L.side * (0.35 - 0.25 * w.grab), 0.25 + 0.15 * Math.sin(t * 13 + L.side), 1.05 - 0.35 * w.grab));
          tgtLocal.lerp(rt, reach);
        }
        if (w.smash > 0.01) {
          const up = sh.clone().add(V(L.side * 0.15, 0.55, 0.35)), down = sh.clone().add(V(L.side * 0.12, -0.35, 0.85));
          const k2 = Math.max(0, Math.sin(t * 9 + (L.side > 0 ? 0 : 0.6)));
          tgtLocal.lerp(up.lerp(down, k2), w.smash);
        }
        if (w.scream > 0.01) tgtLocal.lerp(sh.clone().add(V(L.side * 0.85, -0.25 + 0.05 * Math.sin(t * 30 + L.side), 0.35)), w.scream);
        if (w.vault > 0.01) tgtLocal.lerp(sh.clone().add(V(L.side * 0.3, -0.75, 0.5)), w.vault);
        if (w.stumble > 0.01) tgtLocal.lerp(sh.clone().add(V(L.side * 0.4, -0.95, 0.75)), w.stumble);
      }
      // IK
      const A = L.arm ? shoulders[sideK] : hips[sideK];
      const l1 = L.arm ? LEN.upper : LEN.thigh, l2 = L.arm ? LEN.fore : LEN.shin;
      // ankle/wrist target: the foot/hand bone extends from it
      const T = tgtLocal.clone();
      if (!L.arm) T.y += 0.07; else if (onGround) T.y += 0.06;
      let pole;
      if (!L.arm) pole = crawl > 0.3 ? V(L.side * 1.0, 0.9, 0.25) : V(L.side * 0.15, 0, 1);
      else pole = onGround ? V(L.side * 1.0, 0.8, -0.3) : V(L.side * 0.6, 0.1, -1);
      const K = ik(A, T, l1, l2, pole);
      this.setSeg((L.arm ? 'upper' : 'thigh') + sideK, A, K, pole);
      this.setSeg((L.arm ? 'fore' : 'shin') + sideK, K, T, pole);
      if (!L.arm) {
        // foot: from ankle forward and down onto the ground
        const toe = T.clone().add(V(0, -0.07, 0.22));
        if (L.swing) toe.add(V(0, -0.08, -0.06));
        this.setSeg('foot' + sideK, T, toe, V(0, 1, 0));
      } else {
        // hand and fingers
        const fdir = T.clone().sub(K).normalize();
        let hdir;
        if (onGround) hdir = fdir.clone().multiplyScalar(0.3).add(V(0, -0.2, 1)).normalize();
        else hdir = fdir.clone().add(V(0, 0, 0.25 * w.reach)).normalize();
        const tip = T.clone().addScaledVector(hdir, LEN.hand);
        const palmN = onGround ? V(0, -1, 0) : V(-L.side, 0, 0.3);
        this.setSeg('hand' + sideK, T, tip, palmN);
        const hb = this.B['hand' + sideK];
        const curl = onGround ? 0.25 : lerp(0.15 + 0.15 * Math.sin(t * 2 + L.side), 0.9, clamp(w.grab, 0, 1)) + (w.reach > 0.5 ? -0.1 : 0);
        this.fingers(sideK, hb, curl, t, L.side, onGround);
        const hw = this.handWorld[L.side > 0 ? 0 : 1];
        hw.copy(tip).applyMatrix4(this.root.matrixWorld);
      }
    }
    // world-space markers for the camera / audio / grab
    this.headWorld.copy(V(0, 0.12 * HS, 0.08 * HS).applyQuaternion(qHd).add(P4)).applyMatrix4(this.root.matrixWorld);
    this.mouthWorld.copy(V(0, 0.03 * HS, 0.17 * HS).applyQuaternion(qHd).add(P4)).applyMatrix4(this.root.matrixWorld);
    this.chestWorld.copy(P2.clone().add(V(0, 0.25, 0).applyQuaternion(qCh))).applyMatrix4(this.root.matrixWorld);
  }

  fingers(s, hand, curl, t, side, ground) {
    const spread = ground ? [0.35, 0.12, -0.12, -0.35] : [0.28, 0.09, -0.09, -0.28];
    const hq = hand.quaternion, hp = hand.position;
    for (let f = 0; f < 4; f++) {
      const tw = 0.15 * Math.sin(t * (5 + f * 1.7) + f + side) * (Math.random() < 0.02 ? 4 : 1);
      let q = hq.clone().multiply(_q.setFromEuler(_e.set(0, 0, spread[f] * side, 'YXZ')));
      let p = hp.clone().add(V((f - 1.5) * 0.022 * side * -1, LEN.hand, 0).applyQuaternion(hq));
      for (let k = 0; k < 3; k++) {
        const bend = (ground ? [0.5, -0.6, 0.6][k] : [0.4, 0.55, 0.5][k]) * curl + (k === 0 ? tw : tw * 0.5);
        q = q.clone().multiply(_q.setFromEuler(_e.set(bend, 0, 0, 'YXZ')));
        const b = this.B[`f${s}${f}_${k}`];
        b.position.copy(p); b.quaternion.copy(q);
        p = p.clone().add(V(0, LEN.fing[f][k], 0).applyQuaternion(q));
      }
    }
    let q = hq.clone().multiply(_q.setFromEuler(_e.set(0.4, 0, 0.9 * side, 'YXZ')));
    let p = hp.clone().add(V(0.035 * side, LEN.hand * 0.3, 0.01).applyQuaternion(hq));
    for (let k = 0; k < 2; k++) {
      q = q.clone().multiply(_q.setFromEuler(_e.set(0.3 * curl, 0, 0, 'YXZ')));
      const b = this.B[`t${s}_${k}`]; b.position.copy(p); b.quaternion.copy(q);
      p = p.clone().add(V(0, LEN.thumb[k], 0).applyQuaternion(q));
    }
  }

  setBone(name, p, q) { const b = this.B[name]; b.position.copy(p); b.quaternion.copy(q); }
  // place a segment bone at A, its +Y toward B, its +Z toward ref
  setSeg(name, A, Bp, ref) {
    const y = _y.subVectors(Bp, A).normalize();
    const z = _z.copy(ref).addScaledVector(y, -ref.dot(y));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
    z.normalize();
    const x = _x.crossVectors(y, z);
    _m.makeBasis(x, y, z);
    const b = this.B[name];
    b.position.copy(A); b.quaternion.setFromRotationMatrix(_m);
  }
}

// two-bone IK: returns the middle joint; clamps T in place if unreachable
function ik(A, T, l1, l2, pole) {
  const d = _a.subVectors(T, A); let len = d.length();
  const max = (l1 + l2) * 0.999, min = Math.abs(l1 - l2) + 0.01;
  if (len > max) { d.multiplyScalar(max / len); T.copy(A).add(d); len = max; }
  if (len < min) { d.multiplyScalar(min / Math.max(len, 1e-4)); T.copy(A).add(d); len = min; }
  const dir = d.clone().normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  return A.clone().addScaledVector(dir, a).addScaledVector(perp, h);
}
