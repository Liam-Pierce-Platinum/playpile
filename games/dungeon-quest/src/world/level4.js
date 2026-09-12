// LEVEL 4 -- THE BLACK CLIFF
//
// The last road. A ledge cut along the face of a cliff that winds up and up:
// solid rock on one side, nothing at all on the other. The kingdom's houses
// are still clinging to it, empty, and everything walking on it used to be
// somebody.
//
// Half way up, the road stops at THE SHADOW, and does not open again until it
// is dead. At the top the black dragon is waiting on a shelf of rock over
// the whole kingdom.
import * as THREE from 'three';
import { World } from './world.js';
import { smooth, faceted, tube, slab, cone, blob } from '../art/shapes.js';
import * as T from '../art/textures.js';
import { ARTIFACTS } from '../game/items.js';
import {
  makeSnag, makeBoulder, makeCliffChunk, makePeak,
  makeChest, makeShopStall, makeTorch, makeCairn,
  makeShrine, makeTavern, makeMirror, makeCampfire, makeTent,
} from '../art/props.js';

const Z_START = -16;
const Z_END = 360;

const TOP_Z = 300;
const RISE_PER_M = 0.17;

/** How high the ledge is at a point along it. */
export function roadHeight(z) {
  const t = Math.max(0, Math.min(z, TOP_Z));
  const k = t / TOP_Z;
  const eased = k < 0.88 ? k : 0.88 + (k - 0.88) * 0.40;
  return eased * TOP_Z * RISE_PER_M;
}

/** The ledge winds hard around the face of the cliff. */
export function valleyCentre(z) {
  return Math.sin(z * 0.036) * 15.0
    + Math.sin(z * 0.015 + 1.4) * 8.0
    + Math.sin(z * 0.062 + 0.5) * 3.0;
}

export function valleyHalfWidth(z) {
  let w = 12 + Math.sin(z * 0.048) * 2.2 + Math.sin(z * 0.019 + 0.6) * 2.4;
  if (z > 150 && z < 196) w += 12;      // the shadow's landing needs room
  if (z > 268) w += 28;                 // and the dragon's shelf opens right out
  return w;
}

/**
 * Cliff on one side, VOID on the other. Step off the outer edge and the
 * ground falls away -- the invisible wall keeps you on, but you can see it.
 */
export function terrainAt(x, z) {
  const base = roadHeight(z);
  const road = valleyCentre(z);
  const half = valleyHalfWidth(z);
  const d = x - road;
  const out = Math.abs(d) - half;
  if (out <= 0) return base;
  if (d > 0) return base + Math.min(70, out * 1.9);      // the cliff face
  return base - Math.min(90, out * out * 0.5);           // the drop
}

export const AREAS = [
  { id: 'gate', name: 'THE BROKEN GATE', z: [-16, 34], safe: true },
  { id: 'houses', name: 'THE HANGING HOUSES', z: [34, 92] },
  { id: 'switch', name: 'THE DEAD SWITCHBACK', z: [92, 150] },
  { id: 'landing', name: "THE SHADOW'S LANDING", z: [150, 196] },
  { id: 'upper', name: 'THE UPPER STAIR', z: [196, 250] },
  { id: 'brink', name: 'THE BRINK', z: [250, 300] },
  { id: 'shelf', name: "THE DRAGON'S SHELF", z: [300, 358] },
];

/**
 * The wall line, and the ONLY definition of it.
 *
 * The collision wall is built from axis-aligned boxes, so each 1.5m step has
 * to take the TIGHTEST edge across it or it leaves a pocket. The visible rock
 * has to be seated against exactly the same number -- seating it against
 * valleyHalfWidth(z) instead let the rock sit a metre or two inside the wall,
 * which is what "I go through the visible wall" was.
 */
export const WALL_STEP = 1.5;
export function wallEdge(z, side) {
  let edge = side > 0 ? Infinity : -Infinity;
  const z0 = Math.floor((z - Z_START) / WALL_STEP) * WALL_STEP + Z_START;
  for (let t = -1; t <= 2.0001; t += 0.25) {
    const zz = z0 + t * WALL_STEP;
    const c = valleyCentre(zz), hw = valleyHalfWidth(zz);
    edge = side > 0 ? Math.min(edge, c + hw) : Math.max(edge, c - hw);
  }
  return edge;
}

export function buildLevel4(scene) {
  const world = new World(scene);
  world.terrain = terrainAt;

  let seed = 66613;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /* ---------------- light ---------------- */
  // Not night: a sky with something wrong with it. Violet overhead, and the
  // only warm light in the level is fire you are standing next to.
  const SKY = new THREE.Color('#2a2036');
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 22, 120);

  const hemi = new THREE.HemisphereLight('#6a5488', '#1a1622', 0.95);
  world.root.add(hemi);
  const sun = new THREE.DirectionalLight('#b48fd0', 0.95);
  sun.position.set(-6, 15, -8);
  world.root.add(sun);
  const bounce = new THREE.DirectionalLight('#8a3fd0', 0.42);
  bounce.position.set(6, 4, 8);
  world.root.add(bounce);
  const ambient = new THREE.AmbientLight('#4a3a5e', 0.52);
  world.root.add(ambient);
  world.lights = { hemi, sun, bounce, ambient, skyColor: SKY.clone() };
  world.lights.base = {
    hemi: 0.95, sun: 0.95, bounce: 0.42, ambient: 0.52,
    sunColor: '#b48fd0', sky: SKY.clone(), fogNear: 22, fogFar: 120,
  };

  /* ---------------- the cliff face ---------------- */
  const COLS = 88, ROWS = 160;
  const WIDE = 190, LONG = Z_END - Z_START + 40;
  const geo = new THREE.PlaneGeometry(WIDE, LONG, COLS, ROWS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const midZ = (Z_START - 20) + LONG / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + midZ;
    const n = Math.sin(x * 0.19 + z * 0.15) * 0.6 + Math.sin(x * 0.06 - z * 0.09) * 0.8;
    pos.setY(i, terrainAt(x, z) + n * 0.5);
    pos.setZ(i, z - midZ);
  }
  geo.computeVertexNormals();
  const stoneTex = T.groundTex('#3a3344', '#4a4258');
  stoneTex.repeat.set(28, 56);
  const ground = new THREE.Mesh(geo, faceted(stoneTex));
  ground.position.z = midZ;
  world.root.add(ground);
  world.colliders.push(ground);

  const rockMat = faceted(T.cliffTex('#372f42'));
  const darkMat = faceted(T.cliffTex('#241e2e'));

  // Sampled finely, and always the TIGHTEST edge across a step: an
  // axis-aligned box wall following a curve is a staircase, and a step that
  // sits outside the true line leaves a notch you can walk into and stick in.
  for (let z = Z_START; z <= Z_END; z += WALL_STEP) {
    const inR = wallEdge(z, 1), inL = wallEdge(z, -1);
    world.addWall(inR, z - 0.05, inR + 40, z + WALL_STEP + 0.05, 120, { x: -1, z: 0 });
    world.addWall(inL - 40, z - 0.05, inL, z + WALL_STEP + 0.05, 120, { x: 1, z: 0 });
  }
  world.addWall(-120, Z_END, 120, Z_END + 20, 120, { x: 0, z: -1 });
  world.addWall(-120, Z_START - 20, 120, Z_START, 120, { x: 0, z: 1 });

  const torches = [];
  const hideSpots = [];
  const boulders = [];

  for (let z = Z_START; z < Z_END; z += 9) {
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    for (let k = 0; k < 2; k++) {
      const w = 8 + rand() * 6, d = 8 + rand() * 4;
      const h = 14 + rand() * 22 + k * 10;
      const ch = makeCliffChunk(w, h, d, (z + k) | 0, k ? '#241e2e' : '#372f42');
      ch.position.set(c, terrainAt(c + half, z) - 1, z + rand() * 5);
      world.seatAgainst(ch, wallEdge(z, 1) + k * 8 + rand() * 3, 1);
      world.placeMeasured(ch);
    }
    // broken railing along the drop, so the edge reads before you reach it
    if (rand() < 0.8) {
      const x = c - half + 0.5;
      const postA = tube(0.10, 0.13, 1.5, smooth(T.woodTex('#2e2434')), 5,
        [x, terrainAt(x, z) + 0.75, z + rand() * 5]);
      world.decorate(postA);
    }
  }

  /* dead snags and the last of the trees */
  for (let i = 0; i < 46; i++) {
    const z = 10 + rand() * (Z_END - 60);
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (rand() - 0.5) * 2 * (half - 3);
    const sn = makeSnag(4 + rand() * 5, (i * 11) | 0);
    sn.position.set(x, terrainAt(x, z), z);
    world.placeRound(sn, 0.4, 4, { walkable: false });
  }

  /* boulders: cover, and the only answer to the dragon's sheet */
  for (let i = 0; i < 82; i++) {
    const z = 16 + rand() * (Z_END - 40);
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (rand() - 0.5) * 2 * (half - 3.5);
    const size = 1.4 + rand() * 1.8;
    const b = makeBoulder(size, (i * 19) | 0, '#453c52');
    b.position.set(x, terrainAt(x, z), z);
    world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
    boulders.push({ x, z, r: size });
    hideSpots.push({ x, z, radius: size + 2.0 });
  }

  /* ---------------- the hanging houses ----------------
   * Cottages built out over the drop on timber props. Nobody is in them.
   */
  const wallMat = faceted(T.cliffTex('#4a4258'));
  const roofMat = faceted(T.woodTex('#2e2434'));
  const cottages = [];
  for (let i = 0; i < 11; i++) {
    const z = 38 + i * 5.4 + rand() * 2;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    // out on the drop side, propped up from below
    const x = c - (half - 2.5) - rand() * 1.5;
    const y = terrainAt(c - half + 0.5, z);
    const h = 2.6 + rand() * 0.9;
    const hut = new THREE.Group();
    hut.add(slab(4.2, h, 3.8, wallMat, [0, h / 2, 0]));
    const roof = cone(3.4, 2.1, roofMat, 4, [0, h + 1.05, 0]);
    roof.rotation.y = Math.PI / 4;
    hut.add(roof);
    for (const dx of [-1.4, 1.4]) {
      const prop = tube(0.14, 0.18, 9, roofMat, 5, [dx, -4.4, -1.2]);
      prop.rotation.x = 0.16;
      hut.add(prop);
    }
    hut.position.set(x, y, z);
    hut.rotation.y = rand() * 0.6 - 0.3;
    world.place(hut, { walkable: false, shrink: 0.3 });
    cottages.push({ x, z, y });
  }
  world.cottageSpots = cottages;

  /* ---------------- the shadow's landing ---------------- */
  // A wide shelf halfway up. The mini-boss stands in the middle of it, and
  // the road past it is sealed until it goes down.
  const shadowZ = 172;
  const shadowX = valleyCentre(shadowZ);
  const shadowY = roadHeight(shadowZ);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cr = makeCairn((i * 23) | 0);
    cr.position.set(shadowX + Math.cos(a) * 14, shadowY, shadowZ + Math.sin(a) * 12);
    world.decorate(cr);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const size = 2.0 + (i % 2) * 0.6;
    const b = makeBoulder(size, i * 41 + 7, '#3a3246');
    const bx = shadowX + Math.cos(a) * 9, bz = shadowZ + Math.sin(a) * 8;
    b.position.set(bx, shadowY, bz);
    world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
    boulders.push({ x: bx, z: bz, r: size });
    hideSpots.push({ x: bx, z: bz, radius: size + 2.0 });
  }

  /* ---------------- the dragon's shelf ---------------- */
  const arenaZ = 328;
  const arenaX = valleyCentre(arenaZ);
  const arenaY = roadHeight(arenaZ);
  const ARENA_R = 32;

  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = 16 + (i % 3) * 8;
    const px = arenaX + Math.cos(a) * (ARENA_R + 4);
    const pz = arenaZ + Math.sin(a) * (ARENA_R + 4);
    world.decorate(tube(2.4, 3.2, h, i % 2 ? rockMat : darkMat, 6,
      [px, arenaY + h / 2, pz]));
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.3;
    const rr = 9 + (i % 3) * 7;
    const bx = arenaX + Math.cos(a) * rr, bz = arenaZ + Math.sin(a) * rr;
    const size = 2.1 + (i % 3) * 0.5;
    const b = makeBoulder(size, i * 31 + 11, '#4a4258');
    b.position.set(bx, arenaY, bz);
    world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
    boulders.push({ x: bx, z: bz, r: size });
    hideSpots.push({ x: bx, z: bz, radius: size + 2.0 });
  }
  // THE SUMMONING ROCK: the spire it goes and sits on
  const spire = tube(4.5, 7.0, 30, darkMat, 6,
    [arenaX, arenaY + 15, arenaZ + ARENA_R * 0.7]);
  world.decorate(spire);

  // the kingdom, far below and behind
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 130 + rand() * 60;
    const pk = makePeak(24 + rand() * 20, 30 + rand() * 46, (i * 7) | 0, '#2c2438');
    pk.position.set(Math.cos(a) * r, arenaY - 66 + rand() * 14, arenaZ + Math.sin(a) * r);
    world.decorate(pk);
  }

  /* ---------------- shops, taverns, shrines ---------------- */
  const shops = [];
  function addShop(z, xOff) {
    const x = valleyCentre(z) + xOff;
    const st = makeShopStall('#4a2f6a', '#d8cce8');
    st.position.set(x, terrainAt(x, z), z);
    st.rotation.y = xOff > 0 ? -0.6 : 0.6;
    world.place(st, { walkable: false, shrink: 0.3 });
    shops.push({ x, z: z + 1.4 });
  }
  addShop(8, -5.0);
  addShop(140, 6.5);
  addShop(244, -7.0);

  const taverns = [];
  const mirrors = [];
  function addTavern(id, name, z, xOff) {
    const x = valleyCentre(z) + xOff;
    const t = makeTavern();
    t.position.set(x, terrainAt(x, z), z);
    t.rotation.y = xOff > 0 ? -0.5 : 0.5;
    world.place(t, { walkable: false, shrink: 0.3 });
    for (const dx of [-3.4, 3.4]) {
      const tor = makeTorch();
      tor.position.set(x + dx, terrainAt(x + dx, z + 3), z + 3.0);
      world.decorate(tor);
      torches.push(tor);
    }
    const mx = x + (xOff > 0 ? -3.9 : 3.9), mz = z + 3.4;
    const mir = makeMirror();
    mir.position.set(mx, terrainAt(mx, mz), mz);
    mir.rotation.y = xOff > 0 ? 0.5 : -0.5;
    world.placeRound(mir, 0.55, 2.0, { walkable: false });
    mirrors.push({ id, x: mx, z: mz + 1.0 });
    taverns.push({ id, name, x, z: z + 3.6 });
  }
  addTavern('houses', 'THE LAST DOOR', 76, -9.0);
  addTavern('brink', 'THE BRINK', 258, 9.0);

  const checkpoints = [];
  function addCheckpoint(id, name, z, xOff) {
    const x = valleyCentre(z) + xOff;
    const shrine = makeShrine();
    shrine.position.set(x, terrainAt(x, z), z);
    world.placeRound(shrine, 0.7, 1.6, { walkable: false });
    checkpoints.push({
      id, name, x, z, mesh: shrine,
      flame: shrine.userData.flame, light: shrine.userData.light, claimed: false,
    });
  }
  // No shrine at the mouth: you start there, so banking it means nothing,
  // and dying before the first real one should send you back to the start.
  addCheckpoint('houses', 'THE HANGING HOUSES', 66, 5.5);
  addCheckpoint('landing', "THE SHADOW'S LANDING", 156, -6.0);
  addCheckpoint('brink', 'THE BRINK', 264, 5.0);
  // Four here, not three. The last stretch is the longest in the game and the
  // black dragon is the hardest fight, so there is a shrine at the mouth of
  // the shelf -- arenaTrigger is 308 and the gate holds you at 302.
  addCheckpoint('shelf', "THE DRAGON'S SHELF", 300, -6.5);

  for (let z = 20; z < 300; z += 30) {
    const x = valleyCentre(z) + valleyHalfWidth(z) - 2.0;
    const tor = makeTorch();
    tor.position.set(x, terrainAt(x, z), z);
    world.decorate(tor);
    torches.push(tor);
  }

  /* ---------------- chests, pickups ---------------- */
  const chests = [];
  for (const [z, xOff] of [[46, 7], [104, -8], [162, 9], [214, -8], [270, 9], [316, -13]]) {
    const x = valleyCentre(z) + xOff;
    const ch = makeChest('#3a2f44', '#6a5f78');
    ch.position.set(x, terrainAt(x, z), z);
    ch.rotation.y = rand() * 1.5;
    world.place(ch, { walkable: false, shrink: 0.2 });
    chests.push({ mesh: ch, lid: ch.userData.lid, opened: false, position: ch.position });
  }

  const artifactSpots = [];
  const ids = Object.keys(ARTIFACTS);
  for (let i = 0; i < 6; i++) {
    const z = 36 + i * 46 + rand() * 12;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (i % 2 ? 1 : -1) * (half - 2.5);
    artifactSpots.push({ x, z, id: ids[i % ids.length] });
  }
  const arrowSpots = [];
  for (let i = 0; i < 10; i++) {
    const z = 24 + i * 30 + rand() * 8;
    const x = valleyCentre(z) + (rand() - 0.5) * 10;
    arrowSpots.push({ x, z, n: 2 + ((rand() * 3) | 0) });
  }
  const foodSpots = [];
  for (let i = 0; i < 9; i++) {
    const z = 32 + i * 32 + rand() * 8;
    const x = valleyCentre(z) + (rand() - 0.5) * 10;
    foodSpots.push({ x, z, kind: ['bread', 'cheese', 'meat', 'mushroom'][i % 4] });
  }

  /* ---------------- enemies ---------------- */
  const spawns = [];
  const campDefs = [];
  const campfires = [];
  const T1 = ['darkSkeleton', 'darkZombie', 'darkGoblin', 'darkSlime', 'demon'];
  const T2 = ['darkWitch', 'corruptedDarkKnight', 'darkGoblinKing', 'shadowGolem'];

  for (let i = 0; i < 30; i++) {
    const z = 22 + rand() * 268;
    if (z > 152 && z < 194) continue;             // the landing stays clear
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (rand() - 0.5) * 2 * (half - 4);
    spawns.push({ kind: T1[(rand() * T1.length) | 0], x, z, spawned: false });
  }
  const campZ = [52, 104, 136, 214, 252, 282];
  campZ.forEach((z, i) => {
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const side = i % 2 ? 1 : -1;
    const cx = c + side * (half * 0.42);
    campDefs.push({ id: 'camp' + i, x: cx, z });
    spawns.push({ kind: T2[i % T2.length], x: cx, z, camp: 'camp' + i, spawned: false });
    const n = 3 + (i > 2 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      spawns.push({
        kind: T1[(rand() * T1.length) | 0],
        x: cx + Math.cos(a) * 4.5, z: z + Math.sin(a) * 4.5,
        camp: 'camp' + i, spawned: false,
      });
    }
    const fire = makeCampfire();
    fire.position.set(cx, terrainAt(cx, z), z);
    world.place(fire, { walkable: false, shrink: 0.2 });
    campfires.push(fire);
    for (let k = 0; k < 2; k++) {
      const tent = makeTent('#33283f');
      const tx = cx + (k ? 4 : -4), tz = z + 3;
      tent.position.set(tx, terrainAt(tx, tz), tz);
      tent.rotation.y = k ? -0.6 : 0.6;
      world.place(tent, { walkable: false, shrink: 0.25 });
    }
  });

  // THE SHADOW. It is a spawn like any other, but the gate below reads it.
  spawns.push({ kind: 'shadowMonster', x: shadowX, z: shadowZ, spawned: false });

  /* ---------------- exports ---------------- */
  world.mapData = {
    kind: 'valley',
    zStart: Z_START, zEnd: Z_END,
    halfWidth: 26,
    centre: valleyCentre,
    arena: { x: arenaX, z: arenaZ, r: ARENA_R },
  };

  // The hanging houses get their doors opened again.
  world.peaceSpots = [
    ...cottages.map(c => ({ x: c.x + 3, z: c.z, roam: 3.5 })),
    { x: valleyCentre(120) + 5, z: 120, roam: 5 },
    { x: valleyCentre(230) - 5, z: 230, roam: 5 },
  ];
  world.checkpoints = checkpoints;
  world.taverns = taverns;
  world.mirrors = mirrors;
  world.shops = shops;
  world.spawn = new THREE.Vector3(valleyCentre(0), 0, 0);
  world.shopPosition = new THREE.Vector3(shops[0].x, 0, shops[0].z);
  world.chests = chests;
  world.enemySpawns = spawns;
  world.campDefs = campDefs;
  world.campfires = campfires;
  world.torches = torches;
  world.hideSpots = hideSpots;
  world.boulders = boulders;
  world.artifactSpots = artifactSpots;
  world.arrowSpots = arrowSpots;
  world.foodSpots = foodSpots;
  world.areas = AREAS;
  world.valleyCentre = valleyCentre;
  world.valleyHalfWidth = valleyHalfWidth;
  world.zEnd = Z_END;
  world.arena = new THREE.Vector3(arenaX, arenaY, arenaZ);
  world.dragonSpawn = new THREE.Vector3(arenaX, arenaY, arenaZ + 8);
  world.arenaTrigger = 308;

  // A SECOND gate, halfway up: the road past the landing does not open until
  // the shadow is down. This is the level's midpoint, and it is meant to stop
  // you dead until you deal with it.
  world.midGate = { z: 190, holdAt: 184, kind: 'shadowMonster',
    name: 'THE SHADOW BARS THE ROAD' };

  world.inCover = (x, z) => {
    for (const h of hideSpots) {
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < h.radius * h.radius) return true;
    }
    return false;
  };

  return world;
}
