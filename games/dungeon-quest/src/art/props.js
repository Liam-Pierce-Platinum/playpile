// World props: big trees, cliff walls, chests, the shop stall, torches, signs.
import * as THREE from 'three';
import { tube, ball, blob, cone, slab, lathe, shell, boulder, mountain, smooth, faceted } from './shapes.js';
import * as T from './textures.js';

/* ---------------- trees ----------------
 * These are deliberately large. A forest only feels like a forest when the
 * canopy is overhead, not at shoulder height.
 */

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Broadleaf: a leaning tapered trunk, a few boughs, and a canopy built from
 * overlapping squashed spheres.
 */
export function makeBroadleaf(height = 11, seed = 1, opts = {}) {
  const rand = rngFrom(seed);
  const trunkColor = opts.trunk || '#5a4028';
  const leafColor = opts.leaf || '#3f5a28';
  const g = new THREE.Group();
  const bark = smooth(T.barkTex(trunkColor));
  const leaf = smooth(T.leafTex(leafColor));

  const trunkH = height * 0.58;
  const rBot = height * 0.052;
  const bole = tube(rBot * 0.45, rBot, trunkH, bark, 7, [0, trunkH / 2, 0]);
  bole.rotation.z = (rand() - 0.5) * 0.09;
  g.add(bole);
  g.userData.collider = bole;

  // flared roots
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand();
    const r = cone(rBot * 0.42, rBot * 2.0, bark, 5,
      [Math.cos(a) * rBot * 0.8, rBot * 0.7, Math.sin(a) * rBot * 0.8]);
    r.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    g.add(r);
  }

  // boughs
  const boughs = 3 + ((rand() * 2) | 0);
  for (let i = 0; i < boughs; i++) {
    const a = (i / boughs) * Math.PI * 2 + rand() * 0.7;
    const len = height * (0.20 + rand() * 0.10);
    const y = trunkH * (0.72 + rand() * 0.20);
    const b = tube(rBot * 0.16, rBot * 0.38, len, bark, 5, [0, 0, 0]);
    const pivot = new THREE.Group();
    pivot.position.set(0, y, 0);
    pivot.rotation.set(0, a, 0);
    const arm = new THREE.Group();
    arm.rotation.z = -0.85 - rand() * 0.25;
    b.position.y = len / 2;
    arm.add(b);
    pivot.add(arm);
    g.add(pivot);
  }

  // canopy
  const cy = trunkH + height * 0.10;
  const spread = height * 0.30;
  const clumps = [
    [0, cy + spread * 0.30, 0, spread * 1.05],
    [spread * 0.62, cy + spread * 0.05, spread * 0.20, spread * 0.72],
    [-spread * 0.55, cy + spread * 0.12, -spread * 0.35, spread * 0.78],
    [spread * 0.15, cy + spread * 0.72, -spread * 0.28, spread * 0.66],
    [-spread * 0.22, cy + spread * 0.58, spread * 0.42, spread * 0.60],
    [0, cy - spread * 0.20, 0, spread * 0.80],
  ];
  // Faceted clumps with a flat underside. A sphere of leaves is a green ball;
  // a squat hexagonal drum with a visible top and side reads as a canopy, and
  // you can see the shape of it against the sky.
  for (const [x, y, z, r] of clumps) {
    const clump = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.74, r * 0.96, r * (1.0 + rand() * 0.3), 6, 2),
      leaf
    );
    clump.geometry.rotateY(Math.PI / 6 + rand());
    clump.position.set(x, y, z);
    clump.rotation.z = (rand() - 0.5) * 0.24;
    g.add(clump);
  }
  g.userData.height = height;
  return g;
}

/** Conifer: a straight bole with stacked, drooping cone tiers. */
export function makeConifer(height = 13, seed = 1, opts = {}) {
  const rand = rngFrom(seed);
  const trunkColor = opts.trunk || '#4a3520';
  const leafColor = opts.leaf || '#2c4a26';
  const g = new THREE.Group();
  const bark = smooth(T.barkTex(trunkColor));
  const leaf = smooth(T.leafTex(leafColor));

  const rBot = height * 0.040;
  const bole = tube(rBot * 0.30, rBot, height * 0.92, bark, 7, [0, height * 0.46, 0]);
  g.add(bole);
  g.userData.collider = bole;

  const tiers = 6;
  const base = height * 0.24;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1);
    const r = height * 0.20 * (1 - k * 0.78);
    const h = height * 0.20 * (1 - k * 0.35);
    const y = base + k * (height * 0.66);
    const c = cone(r, h, leaf, 8, [0, y, 0]);
    c.rotation.y = rand() * Math.PI;
    g.add(c);
  }
  g.add(cone(height * 0.035, height * 0.11, leaf, 6, [0, height * 0.95, 0]));
  g.userData.height = height;
  return g;
}

/** A dead, branchless snag -- breaks up the silhouette of a forest. */
export function makeSnag(height = 7, seed = 1) {
  const rand = rngFrom(seed);
  const g = new THREE.Group();
  const bark = smooth(T.barkTex('#4a4038'));
  const rBot = height * 0.055;
  const bole = tube(rBot * 0.30, rBot, height, bark, 6, [0, height / 2, 0]);
  bole.rotation.z = (rand() - 0.5) * 0.2;
  g.add(bole);
  g.userData.collider = bole;
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    const len = height * 0.22;
    const b = tube(rBot * 0.10, rBot * 0.30, len, bark, 4,
      [Math.cos(a) * rBot, height * (0.55 + rand() * 0.3), Math.sin(a) * rBot]);
    b.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
    g.add(b);
  }
  return g;
}

/* ---------------- rock & cliff ---------------- */

export function makeBoulder(radius, seed = 1, color = '#6a6a6e') {
  const m = boulder(radius, faceted(T.groundTex(color, '#4a4a50')), seed);
  m.position.y = radius * 0.55;
  return m;
}

/**
 * One segment of a cliff wall: a big faceted rock mass with strata, plus a
 * couple of ledges so it does not read as one flat slab.
 */
export function makeCliffChunk(width, height, depth, seed = 1, color = '#6e6a63') {
  const rand = rngFrom(seed);
  const g = new THREE.Group();
  const rock = faceted(T.cliffTex(color));

  // Core mass: a tapered 6-sided column, wider at the base.
  const core = tube(width * 0.42, width * 0.56, height, rock, 6, [0, height / 2, 0]);
  core.scale.z = depth / width;
  core.rotation.y = rand() * Math.PI;
  g.add(core);
  g.userData.collider = core;

  // buttresses and ledges
  for (let i = 0; i < 3; i++) {
    const s = i % 2 ? 1 : -1;
    const bw = width * (0.24 + rand() * 0.18);
    const bh = height * (0.35 + rand() * 0.35);
    const b = tube(bw * 0.55, bw * 0.8, bh, rock, 5,
      [s * width * (0.20 + rand() * 0.12), bh / 2, (rand() - 0.5) * depth * 0.4]);
    b.scale.z = 0.7;
    g.add(b);
  }
  const cap = boulder(width * 0.36, rock, seed + 11);
  cap.position.y = height * 0.96;
  g.add(cap);
  g.userData.isCliff = true;   // so collision checks can find real rock
  return g;
}

export function makePeak(radius, height, seed = 1, color = '#6e6a63') {
  const g = new THREE.Group();
  const rock = faceted(T.cliffTex(color));
  const m = mountain(radius, height, rock, 7, seed);
  g.add(m);
  // snow cap
  const snow = mountain(radius * 0.34, height * 0.26, faceted(T.groundTex('#cfd4dd', '#aeb6c4')), 7, seed + 3);
  snow.position.y = height * 0.86;
  g.add(snow);
  g.userData.isCliff = true;   // so collision checks can find real rock
  return g;
}

/* ---------------- interactables ---------------- */

/**
 * A loot chest. Returns the group plus a `lid` pivot so it can swing open.
 */
export function makeChest(woodColor = '#6b4a2c', ironColor = '#5a6068') {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex(woodColor));
  const iron = faceted(T.metalTex(ironColor));
  const gold = faceted(T.goldTex('#d4af37'));

  const W = 0.72, H = 0.40, D = 0.48;
  g.add(slab(W, H, D, wood, [0, H / 2, 0]));
  // iron bands around the body
  for (const x of [-W * 0.32, W * 0.32]) {
    g.add(slab(0.07, H + 0.01, D + 0.02, iron, [x, H / 2, 0]));
  }
  g.add(slab(W + 0.02, 0.05, D + 0.02, iron, [0, 0.04, 0]));

  // curved lid on a pivot at the back edge
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  g.add(lid);
  const dome = shell(D / 2, D / 2, W, 0, Math.PI, wood, 7);
  dome.rotation.set(0, 0, Math.PI / 2);
  dome.position.z = D / 2;
  lid.add(dome);
  // cap the ends of the lid
  for (const s of [-1, 1]) {
    const end = lathe([[0.001, 0], [D / 2 * 0.98, 0.001]], wood, 7);
    end.rotation.z = s * Math.PI / 2;
    end.position.set(s * W / 2, 0, D / 2);
    lid.add(end);
  }
  for (const x of [-W * 0.32, W * 0.32]) {
    const band = shell(D / 2 + 0.012, D / 2 + 0.012, 0.07, 0, Math.PI, iron, 7);
    band.rotation.set(0, 0, Math.PI / 2);
    band.position.set(x, 0, D / 2);
    lid.add(band);
  }
  lid.add(slab(0.14, 0.10, 0.06, gold, [0, -0.04, D - 0.02]));   // clasp

  g.userData.lid = lid;
  return g;
}

/** The shop stall: posts, a striped awning, a counter and stock. */
export function makeShopStall(clothA = '#8c2f2f', clothB = '#e0d8bc') {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#6b4a2c'));
  const dark = smooth(T.woodTex('#4a3520'));

  const W = 3.0, D = 1.5, H = 2.3;
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    g.add(tube(0.07, 0.09, H, wood, 6, [x, H / 2, z]));
  }
  // counter
  g.add(slab(W + 0.3, 0.12, D * 0.5, wood, [0, 1.05, D / 2 - 0.1]));
  g.add(slab(W, 0.9, 0.08, dark, [0, 0.55, D / 2 - 0.3]));

  // striped awning: alternating angled panels
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const w = (W + 0.6) / stripes;
    const x = -(W + 0.6) / 2 + w * (i + 0.5);
    const m = smooth(T.clothTex(i % 2 ? clothA : clothB));
    const p = slab(w, 0.06, D + 0.9, m, [x, H + 0.10, 0]);
    p.rotation.x = -0.26;
    g.add(p);
    // scalloped valance along the front
    g.add(slab(w * 0.9, 0.22, 0.05, m, [x, H - 0.10, D / 2 + 0.42]));
  }
  g.add(tube(0.05, 0.05, W + 0.6, dark, 5, [0, H + 0.24, -0.1]).rotateZ(Math.PI / 2));

  // stock on the counter
  const potionColors = ['#c8342f', '#3f8fd0', '#5fbf5a'];
  potionColors.forEach((c, i) => {
    const p = makePotion(c, 0.6);
    p.position.set(-0.75 + i * 0.45, 1.11, D / 2 - 0.05);
    g.add(p);
  });
  g.add(slab(0.34, 0.34, 0.34, dark, [1.05, 1.28, D / 2 - 0.12]));

  return g;
}

/** A potion bottle -- lathed glass with a cork. */
export function makePotion(color = '#c8342f', scale = 1) {
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({
    map: T.flatTex(color), transparent: true, opacity: 0.85,
    emissive: new THREE.Color(color), emissiveIntensity: 0.28, fog: true,
  });
  g.add(lathe([
    [0.001, 0], [0.075, 0.005], [0.095, 0.06], [0.085, 0.13],
    [0.040, 0.17], [0.035, 0.23], [0.001, 0.235],
  ], glass, 8));
  g.add(tube(0.030, 0.034, 0.05, smooth(T.woodTex('#8b6a3a')), 6, [0, 0.25, 0]));
  g.scale.setScalar(scale);
  g.userData.color = color;
  return g;
}

/** A spinning coin pickup. */
export function makeCoin() {
  const g = new THREE.Group();
  const gold = faceted(T.goldTex('#d4af37'), {
    emissive: new THREE.Color('#6b5510'), emissiveIntensity: 0.35,
  });
  const c = tube(0.11, 0.11, 0.025, gold, 9, [0, 0, 0]);
  c.rotation.x = Math.PI / 2;
  g.add(c);
  return g;
}

/** A wooden torch with an emissive flame. */
export function makeTorch() {
  const g = new THREE.Group();
  g.add(tube(0.05, 0.07, 1.8, smooth(T.woodTex('#4a3520')), 6, [0, 0.9, 0]));
  const flame = cone(0.15, 0.42, new THREE.MeshBasicMaterial({
    map: T.flatTex('#ffb43c'), fog: false, transparent: true, opacity: 0.92,
  }), 7, [0, 1.98, 0]);
  g.add(flame);
  g.add(cone(0.08, 0.22, new THREE.MeshBasicMaterial({
    map: T.flatTex('#fff0b0'), fog: false,
  }), 6, [0, 1.94, 0]));
  g.userData.flame = flame;
  const light = new THREE.PointLight('#ff9a3c', 1.4, 9, 2);
  light.position.y = 2.0;
  g.add(light);
  g.userData.light = light;
  return g;
}

/** A signpost, so the level can tell the player where to go. */
export function makeSign() {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#6b4a2c'));
  g.add(tube(0.045, 0.055, 1.5, wood, 5, [0, 0.75, 0]));
  const board = slab(0.9, 0.44, 0.07, wood, [0, 1.35, 0]);
  board.rotation.z = 0.04;
  g.add(board);
  return g;
}

/* ---------------- ground cover ---------------- */

export function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 16, 16);
  for (let i = 0; i < 5; i++) {
    const bx = 1 + i * 3;
    const bh = 8 + ((i * 5) % 7);
    x.fillStyle = i % 2 ? '#4a6b2e' : '#3f5c26';
    x.fillRect(bx, 16 - bh, 2, bh);
    x.fillStyle = '#5d8038';
    x.fillRect(bx, 16 - bh, 1, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A fern / bush cluster of drooping fronds. */
export function makeBush(seed = 1, color = '#3f5a28') {
  const rand = rngFrom(seed);
  const g = new THREE.Group();
  const leaf = smooth(T.leafTex(color));
  const n = 5 + ((rand() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.5;
    const r = 0.18 + rand() * 0.14;
    g.add(blob(r, leaf, [1, 0.7, 1], 6, 4,
      [Math.cos(a) * 0.22, r * 0.7 + rand() * 0.1, Math.sin(a) * 0.22]));
  }
  return g;
}

/* ---------------- camps ---------------- */

/** A campfire: stacked logs, stones, and an emissive flame with a light. */
export function makeCampfire() {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#4a3520'));
  const stone = faceted(T.cliffTex('#6a6a6e'));

  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = boulder(0.16 + (i % 3) * 0.04, stone, i * 17 + 3);
    r.position.set(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
    g.add(r);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.4;
    const log = tube(0.055, 0.075, 0.85, wood, 5, [0, 0.18, 0]);
    log.rotation.set(Math.PI / 2 - 0.5, a, 0);
    g.add(log);
  }

  const flame = cone(0.26, 0.70, new THREE.MeshBasicMaterial({
    map: T.flatTex('#ff9a2c'), fog: false, transparent: true, opacity: 0.9,
  }), 7, [0, 0.48, 0]);
  g.add(flame);
  const inner = cone(0.13, 0.42, new THREE.MeshBasicMaterial({
    map: T.flatTex('#fff0b0'), fog: false,
  }), 6, [0, 0.40, 0]);
  g.add(inner);

  const light = new THREE.PointLight('#ff9a3c', 2.2, 14, 2);
  light.position.y = 0.9;
  g.add(light);

  g.userData.flame = flame;
  g.userData.inner = inner;
  g.userData.light = light;
  g.userData.collider = g.children[0];
  return g;
}

/** A ragged camp tent. */
export function makeTent(clothColor = '#5a4a32') {
  const g = new THREE.Group();
  const cloth = smooth(T.clothTex(clothColor));
  const wood = smooth(T.woodTex('#4a3520'));

  const body = cone(1.15, 1.7, cloth, 5, [0, 0.85, 0]);
  body.rotation.y = Math.PI / 5;
  g.add(body);
  g.userData.collider = body;

  // ridge pole poking out the top, and a dark doorway
  g.add(tube(0.04, 0.05, 2.1, wood, 4, [0, 1.05, 0]));
  const door = cone(0.42, 1.0, smooth(T.flatTex('#14121a')), 4, [0, 0.5, 0.72]);
  door.scale.z = 0.35;
  g.add(door);
  return g;
}

/** A bedroll on the ground. */
export function makeBedroll(color = '#6a5a44') {
  const g = new THREE.Group();
  const cloth = smooth(T.clothTex(color));
  const roll = tube(0.26, 0.26, 1.5, cloth, 6, [0, 0.18, 0]);
  roll.rotation.z = Math.PI / 2;
  roll.scale.y = 0.55;
  g.add(roll);
  g.add(blob(0.20, smooth(T.clothTex('#8a7a5e')), [1, 0.6, 1], 6, 4, [0.72, 0.22, 0]));
  return g;
}

/** A cooking spit over a fire -- also where camp food comes from. */
export function makeSpit() {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#4a3520'));
  for (const s of [1, -1]) {
    const post = tube(0.04, 0.05, 1.1, wood, 4, [s * 0.6, 0.55, 0]);
    post.rotation.z = -s * 0.18;
    g.add(post);
  }
  const bar = tube(0.03, 0.03, 1.5, wood, 4, [0, 1.02, 0]);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  g.add(blob(0.20, smooth(T.rotTex('#8a5436')), [1.4, 1, 1], 7, 5, [0, 0.82, 0]));
  return g;
}

/* ---------------- cover ---------------- */

/**
 * A patch of tall grass. Crouch inside one and mobs almost cannot see you.
 * Returns the group; `userData.hideRadius` is what the world reads.
 */
export function makeTallGrass(seed = 1, radius = 1.5, color = '#4a6b2e') {
  const rand = rngFrom(seed);
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    map: makeGrassTexture(), transparent: true, alphaTest: 0.5,
    side: THREE.DoubleSide, fog: true,
  });
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * radius;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.5), mat);
    blade.position.set(Math.cos(a) * r, 0.72, Math.sin(a) * r);
    blade.rotation.y = rand() * Math.PI;
    blade.scale.setScalar(0.8 + rand() * 0.6);
    g.add(blade);
  }
  // a low leafy base so it reads as a thicket from outside
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(blob(radius * 0.42, smooth(T.leafTex(color)), [1, 0.5, 1], 6, 4,
      [Math.cos(a) * radius * 0.55, 0.24, Math.sin(a) * radius * 0.55]));
  }
  g.userData.hideRadius = radius;
  return g;
}

/* ---------------- pickups ---------------- */

/** A bundle of arrows lying on the ground. */
export function makeArrowBundle() {
  const g = new THREE.Group();
  const shaft = smooth(T.woodTex('#8b6a3a'));
  const feather = smooth(T.flatTex('#d8d3c4'));
  const head = faceted(T.metalTex('#9aa3ad'));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const x = Math.cos(a) * 0.05, z = Math.sin(a) * 0.05;
    const s = tube(0.012, 0.012, 0.55, shaft, 4, [x, 0.16, z]);
    s.rotation.x = 0.30;
    g.add(s);
    g.add(cone(0.028, 0.10, head, 4, [x, 0.44, z - 0.08]));
    g.add(slab(0.06, 0.09, 0.01, feather, [x, 0.0, z + 0.08]));
  }
  return g;
}

/** A piece of food. */
export function makeFoodMesh(color = '#c9a15c') {
  const g = new THREE.Group();
  const m = smooth(T.clothTex(color));
  g.add(blob(0.16, m, [1.35, 0.75, 0.9], 7, 5, [0, 0.14, 0]));
  g.add(blob(0.07, smooth(T.woodTex('#6b4a2c')), [1, 0.6, 1], 5, 4, [0, 0.26, 0]));
  return g;
}

/** An artifact: a floating trinket over a small plinth of light. */
export function makeArtifactMesh(color = '#d4af37') {
  const g = new THREE.Group();
  const glow = new THREE.MeshLambertMaterial({
    map: T.flatTex(color), emissive: new THREE.Color(color),
    emissiveIntensity: 1.0, fog: true,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), glow);
  core.position.y = 0.62;
  g.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.30, 0.035, 4, 10),
    faceted(T.metalTex('#c0c4cc'))
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.62;
  g.add(ring);
  g.add(lathe([[0.001, 0], [0.28, 0.02], [0.20, 0.10], [0.14, 0.22], [0.001, 0.24]],
    faceted(T.cliffTex('#7a7468')), 8));
  const light = new THREE.PointLight(color, 1.4, 6, 2);
  light.position.y = 0.7;
  g.add(light);
  g.userData.core = core;
  g.userData.ring = ring;
  return g;
}

/** A stone marker for a branch in the path. */
export function makeCairn(seed = 1) {
  const g = new THREE.Group();
  const rand = rngFrom(seed);
  const stone = faceted(T.cliffTex('#7a7468'));
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const r = 0.34 - i * 0.05;
    const b = boulder(r, stone, seed + i * 7);
    b.position.set((rand() - 0.5) * 0.08, y + r * 0.5, (rand() - 0.5) * 0.08);
    b.scale.y = 0.6;
    g.add(b);
    y += r * 0.85;
  }
  return g;
}

/* ---------------- waypoints and rest ---------------- */

/**
 * A checkpoint shrine: a stone plinth with a brazier. Lit once claimed.
 * `userData.flame` and `userData.light` are toggled by the game.
 */
/**
 * A flame that is not full of holes.
 *
 * One cone with a ragged fire texture on it has ragged ALPHA -- you look
 * straight through the gaps and see the world behind, which reads as a broken
 * model rather than as fire. This is a solid opaque core with two ragged
 * layers over it: the gaps are still there, they just never go all the way
 * through.
 */
export function makeFlame(r = 0.22, h = 0.60, hot = '#fff4c0', mid = '#ffb03c',
  cool = '#e0682c') {
  const g = new THREE.Group();

  // the core: OPAQUE, so there is always something behind the ragged layers
  const core = cone(r * 0.62, h * 0.82, new THREE.MeshBasicMaterial({
    map: T.flatTex(hot), fog: false,
  }), 6, [0, 0, 0]);
  g.add(core);

  for (let i = 0; i < 2; i++) {
    const tex = T.fireTex(hot, mid, cool).clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1.4);
    const c = cone(r * (1 - i * 0.22), h * (1 + i * 0.12), new THREE.MeshBasicMaterial({
      map: tex, fog: false, transparent: true, opacity: 0.85 - i * 0.2,
      depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }), 6, [0, h * 0.06, 0]);
    c.userData.scroll = 2.4 + i * 1.6;
    c.userData.spin = i ? 1.4 : -1.9;
    g.add(c);
  }
  g.userData.core = core;
  return g;
}

export function makeShrine() {
  const g = new THREE.Group();
  const stone = faceted(T.stoneTex('#7a7468'));
  const gold = faceted(T.goldTex('#d4af37'));

  g.add(lathe([
    [0.001, 0], [0.62, 0.05], [0.52, 0.18], [0.40, 0.30],
    [0.34, 0.85], [0.44, 0.98], [0.001, 1.02],
  ], stone, 6));
  // a ring of small standing stones
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(tube(0.09, 0.12, 0.55, stone, 5,
      [Math.cos(a) * 1.05, 0.27, Math.sin(a) * 1.05]));
  }
  // brazier bowl
  g.add(lathe([[0.001, 0], [0.30, 0.02], [0.34, 0.20], [0.22, 0.22]], gold, 6,
    [0, 1.02, 0]));

  const flame = makeFlame(0.24, 0.66);
  flame.position.set(0, 1.48, 0);
  flame.visible = false;
  g.add(flame);

  const light = new THREE.PointLight('#ffb03c', 0, 12, 2);
  light.position.y = 1.6;
  g.add(light);

  g.userData.flame = flame;
  g.userData.light = light;
  g.userData.collider = g.children[0];
  return g;
}

/** A roadside tavern: timber walls, a shingled roof, warm windows, a sign. */
export function makeTavern() {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#5a4028'));
  const dark = smooth(T.woodTex('#3f2c1c'));
  const plaster = smooth(T.clothTex('#b8a884'));
  const roofMat = smooth(T.clothTex('#6a3a2c'));

  const W = 5.4, D = 4.4, H = 2.9;
  g.add(slab(W, H, D, plaster, [0, H / 2, 0]));
  // corner posts and beams
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    g.add(slab(0.28, H, 0.28, dark, [x, H / 2, z]));
  }
  g.add(slab(W + 0.1, 0.26, D + 0.1, dark, [0, H - 0.2, 0]));

  // roof: two pitched slabs
  for (const s of [1, -1]) {
    const r = slab(W + 1.0, 0.24, D * 0.78, roofMat, [0, H + 0.62, s * D * 0.30]);
    r.rotation.x = s * 0.62;
    g.add(r);
  }
  g.add(slab(W + 1.1, 0.22, 0.3, dark, [0, H + 1.02, 0]));

  // doorway and warm windows
  g.add(slab(1.1, 1.9, 0.14, dark, [0, 0.95, D / 2 + 0.02]));
  const glow = new THREE.MeshBasicMaterial({ map: T.flatTex('#ffc86a'), fog: true });
  for (const x of [-1.6, 1.6]) {
    g.add(slab(0.8, 0.7, 0.12, glow, [x, 1.7, D / 2 + 0.03]));
    g.add(slab(0.9, 0.12, 0.16, dark, [x, 2.1, D / 2 + 0.04]));
  }
  const lamp = new THREE.PointLight('#ffb45a', 1.6, 11, 2);
  lamp.position.set(0, 1.9, D / 2 + 1.2);
  g.add(lamp);

  // hanging sign
  g.add(tube(0.07, 0.07, 1.5, dark, 5, [W / 2 + 0.5, 2.5, D / 2 + 0.2]).rotateZ(Math.PI / 2));
  const board = slab(0.9, 0.6, 0.08, wood, [W / 2 + 1.1, 2.1, D / 2 + 0.2]);
  g.add(board);
  g.add(tube(0.03, 0.03, 0.42, dark, 4, [W / 2 + 1.1, 2.4, D / 2 + 0.2]));

  // a barrel and a bench outside
  g.add(tube(0.36, 0.32, 0.8, wood, 6, [-W / 2 - 0.9, 0.4, D / 2 + 0.6]));
  g.add(slab(1.8, 0.14, 0.42, wood, [W / 2 - 0.6, 0.5, D / 2 + 1.1]));

  g.userData.collider = g.children[0];
  g.userData.lamp = lamp;
  return g;
}


/**
 * THE CAGE. Iron bars in a ring, a hinged door on one side, and a lock the
 * size of a shield. Whoever put the last dragon in here did not want it out.
 *
 * The door is a separate group so it can swing; `userData.lock` is the plate
 * the key goes into, and it is deliberately huge so it reads from a distance.
 */
export function makeCage(radius = 5.0, height = 7.0) {
  const g = new THREE.Group();
  const iron = faceted(T.metalTex('#4a4a52'));
  const dark = faceted(T.metalTex('#2e2e36'));
  const brass = faceted(T.metalTex('#a8842a'));

  // the floor ring the bars are set into
  g.add(tube(radius + 0.35, radius + 0.5, 0.4, dark, 12, [0, 0.2, 0]));
  // and the hoop across the top
  g.add(tube(radius + 0.2, radius + 0.35, 0.34, dark, 12, [0, height, 0]));

  const DOOR_HALF = 0.42;            // radians of arc the doorway takes up
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // leave a gap at +Z for the doorway
    let rel = a - Math.PI / 2;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(rel) < DOOR_HALF) continue;
    const bar = tube(0.075, 0.085, height, iron, 5,
      [Math.cos(a) * radius, height / 2, Math.sin(a) * radius]);
    g.add(bar);
  }

  // the door: its own group, hinged at one edge so it can swing open
  const door = new THREE.Group();
  const hingeA = Math.PI / 2 - DOOR_HALF;
  door.position.set(Math.cos(hingeA) * radius, 0, Math.sin(hingeA) * radius);
  const span = DOOR_HALF * 2 * radius;
  for (let i = 0; i <= 4; i++) {
    const t = (i / 4) * span;
    door.add(tube(0.075, 0.085, height, iron, 5, [-t, height / 2, 0]));
  }
  door.add(slab(span + 0.2, 0.16, 0.16, dark, [-span / 2, 0.5, 0]));
  door.add(slab(span + 0.2, 0.16, 0.16, dark, [-span / 2, height - 0.5, 0]));

  // the lock: a great brass plate with a keyhole cut through it
  const lock = new THREE.Group();
  lock.position.set(-span * 0.5, height * 0.45, 0.18);
  lock.add(slab(1.5, 1.9, 0.28, brass, [0, 0, 0]));
  lock.add(slab(0.42, 0.62, 0.34, faceted(T.flatTex('#181018')), [0, 0.28, 0.04]));
  lock.add(slab(0.22, 0.5, 0.34, faceted(T.flatTex('#181018')), [0, -0.28, 0.04]));
  // the shackle over the top
  lock.add(tube(0.10, 0.10, 0.7, brass, 6, [-0.34, 1.05, 0]));
  lock.add(tube(0.10, 0.10, 0.7, brass, 6, [0.34, 1.05, 0]));
  lock.add(slab(0.78, 0.16, 0.16, brass, [0, 1.38, 0]));
  door.add(lock);

  g.add(door);
  g.userData.door = door;
  g.userData.lock = lock;
  g.userData.radius = radius;
  g.userData.height = height;
  g.userData.doorAngle = hingeA;
  return g;
}

/**
 * A standing mirror, for the wardrobe. It lives outside every tavern, because
 * a rest stop is exactly where a person changes their clothes.
 *
 * The glass is a flat emissive panel rather than a real reflection: this is a
 * 384x240 renderer with a 5-bit palette, and a render-to-texture mirror would
 * cost a second scene pass to show four visible pixels of the player's back.
 * A pale sheen reads as glass at this resolution and costs nothing.
 */
export function makeMirror() {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#5a4028'));
  const gilt = faceted(T.metalTex('#c9a227'));
  const glass = new THREE.MeshBasicMaterial({ map: T.flatTex('#9fb6c8'), fog: true });

  // two feet and a cross-brace, so it stands up on its own
  for (const sx of [-1, 1]) {
    const foot = slab(0.22, 0.10, 0.62, wood, [sx * 0.42, 0.05, 0]);
    g.add(foot);
    g.add(tube(0.055, 0.065, 1.90, wood, 6, [sx * 0.42, 0.95, 0]));
  }
  g.add(tube(0.045, 0.045, 0.84, wood, 5, [0, 0.30, 0]).rotateZ(Math.PI / 2));

  // the frame: a gilded oval, flattened to a plate
  const frame = lathe([
    [0.001, 0.72], [0.30, 0.62], [0.40, 0.30], [0.42, 0],
    [0.40, -0.30], [0.30, -0.62], [0.001, -0.72],
  ], gilt, 9, [0, 1.12, 0]);
  frame.scale.z = 0.16;
  g.add(frame);

  const pane = lathe([
    [0.001, 0.64], [0.26, 0.55], [0.345, 0.27], [0.36, 0],
    [0.345, -0.27], [0.26, -0.55], [0.001, -0.64],
  ], glass, 9, [0, 1.12, 0.035]);
  pane.scale.z = 0.10;
  g.add(pane);

  // a small lamp so it is findable at night
  const lamp = new THREE.PointLight('#cfe4ff', 0.9, 7, 2);
  lamp.position.set(0, 1.5, 0.5);
  g.add(lamp);

  g.userData.lamp = lamp;
  return g;
}
