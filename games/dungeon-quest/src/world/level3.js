// LEVEL 3 -- THE FROZEN MOUNTAIN
//
// A road cut into a mountainside that CLIMBS. It was green once: the treeline
// is still there, the villages are still there, the terraces are still there --
// all of it under ice, because a dragon sat down on the summit and never left.
//
// Mechanically this is level 1's corridor turned on its side. The valley
// centre snakes hard enough to read as switchbacks, and every ground query
// runs through terrain(), so walking forward is walking UP.
import * as THREE from 'three';
import { World } from './world.js';
import { smooth, faceted, tube, slab, cone, blob, ball } from '../art/shapes.js';
import * as T from '../art/textures.js';
import { ARTIFACTS } from '../game/items.js';
import {
  makeConifer, makeSnag, makeBoulder, makeCliffChunk, makePeak,
  makeChest, makeShopStall, makeTorch, makeSign, makeCairn,
  makeShrine, makeTavern, makeMirror, makeCampfire, makeTent,
} from '../art/props.js';

const Z_START = -16;
const Z_END = 330;

/* ---------------- the climb ---------------- */

const SUMMIT_Z = 268;          // where the road stops climbing and the top begins
const RISE_PER_M = 0.155;      // how steeply the road gains height

/** Height of the ROAD itself at a given distance along it. */
export function roadHeight(z) {
  const t = Math.max(0, Math.min(z, SUMMIT_Z));
  // ease the last stretch so the summit is a plateau, not a ramp into a wall
  const k = t / SUMMIT_Z;
  const eased = k < 0.86 ? k : 0.86 + (k - 0.86) * 0.45;
  return eased * SUMMIT_Z * RISE_PER_M;
}

/** The road snakes hard -- these are switchbacks, not a drift. */
export function valleyCentre(z) {
  return Math.sin(z * 0.042) * 13.0
    + Math.sin(z * 0.017 + 0.9) * 7.5
    + Math.sin(z * 0.070 + 2.1) * 2.6;
}

export function valleyHalfWidth(z) {
  let w = 13 + Math.sin(z * 0.05) * 2.0 + Math.sin(z * 0.021 + 1.1) * 2.6;
  if (z > 236) w += 26;                       // the summit opens right out
  return w;
}

/**
 * The mountain. Inside the road it is flat; outside it, the mountain side
 * climbs steeply and the outer lip falls away into cloud.
 */
export function terrainAt(x, z) {
  const base = roadHeight(z);
  const road = valleyCentre(z);
  const half = valleyHalfWidth(z);
  const d = x - road;
  const out = Math.abs(d) - half;
  if (out <= 0) return base;
  // uphill on one side, a parapet and then a drop on the other
  if (d > 0) return base + Math.min(46, out * 1.35);
  return base + Math.min(3.2, out * 0.9) - Math.max(0, out - 8) * 2.4;
}

export const AREAS = [
  { id: 'foot', name: 'THE FROZEN FOOT', z: [-16, 30], safe: true },
  { id: 'terraces', name: 'THE DEAD TERRACES', z: [30, 78] },
  { id: 'village', name: 'THE BURIED VILLAGE', z: [78, 130] },
  { id: 'treeline', name: 'ABOVE THE TREELINE', z: [130, 182] },
  { id: 'shoulder', name: 'THE WIND SHOULDER', z: [182, 236] },
  { id: 'summit', name: 'THE SUMMIT', z: [236, 328] },
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

export function buildLevel3(scene) {
  const world = new World(scene);
  world.terrain = terrainAt;

  let seed = 31337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /* ---------------- light ---------------- */
  // Thin, bright, cold. High altitude, not night.
  const SKY = new THREE.Color('#8fa8c0');
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 26, 130);

  const hemi = new THREE.HemisphereLight('#cfe4f4', '#6a7a8a', 1.15);
  world.root.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 1.45);
  sun.position.set(-8, 16, 6);
  world.root.add(sun);
  const bounce = new THREE.DirectionalLight('#9fc4e0', 0.5);
  bounce.position.set(7, 5, -7);
  world.root.add(bounce);
  const ambient = new THREE.AmbientLight('#8fa4b8', 0.5);
  world.root.add(ambient);
  world.lights = { hemi, sun, bounce, ambient, skyColor: SKY.clone() };
  world.lights.base = {
    hemi: 1.15, sun: 1.45, bounce: 0.5, ambient: 0.5,
    sunColor: '#fff4e0', sky: SKY.clone(), fogNear: 26, fogFar: 130,
  };

  /* ---------------- the mountain surface ----------------
   * One displaced plane. Flat-shaded, so it reads as faceted rock and snow
   * rather than a smooth hill, which is the whole house style.
   */
  // Wide enough that the edge of the world is always past the fog: at 190
  // you could stand on the road and see the ground simply stop.
  const COLS = 120, ROWS = 156;
  const WIDE = 320, LONG = Z_END - Z_START + 120;
  const geo = new THREE.PlaneGeometry(WIDE, LONG, COLS, ROWS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const midZ = (Z_START - 20) + LONG / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + midZ;
    // a little noise so the snowfield is not a mathematical surface
    const n = Math.sin(x * 0.21 + z * 0.13) * 0.5 + Math.sin(x * 0.07 - z * 0.11) * 0.7;
    pos.setY(i, terrainAt(x, z) + n * 0.5);
    pos.setZ(i, z - midZ);
  }
  geo.computeVertexNormals();
  const snowTex = T.snowTex('#c8d8e4');
  snowTex.repeat.set(30, 52);
  const ground = new THREE.Mesh(geo, faceted(snowTex));
  ground.position.z = midZ;
  world.root.add(ground);
  world.colliders.push(ground);

  /* ---------------- the walls that keep you on the road ---------------- */
  const rockMat = faceted(T.cliffTex('#6a707a'));
  const iceMat = faceted(T.iceTex('#bfe8ff'));
  iceMat.transparent = true;
  iceMat.opacity = 0.88;

  // Sampled finely, and always the TIGHTEST edge across a step: an
  // axis-aligned box wall following a curve is a staircase, and a step that
  // sits outside the true line leaves a notch you can walk into and stick in.
  for (let z = Z_START; z <= Z_END; z += WALL_STEP) {
    const inR = wallEdge(z, 1), inL = wallEdge(z, -1);
    world.addWall(inR, z - 0.05, inR + 40, z + WALL_STEP + 0.05, 90, { x: -1, z: 0 });
    world.addWall(inL - 40, z - 0.05, inL, z + WALL_STEP + 0.05, 90, { x: 1, z: 0 });
  }
  world.addWall(-120, Z_END, 120, Z_END + 20, 90, { x: 0, z: -1 });
  world.addWall(-120, Z_START - 20, 120, Z_START, 90, { x: 0, z: 1 });

  /* ---------------- cliff and ice dressing ---------------- */
  const torches = [];
  const hideSpots = [];
  const boulders = [];

  for (let z = Z_START; z < Z_END; z += 9) {
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    // the mountain wall on the uphill side
    for (let k = 0; k < 2; k++) {
      const w = 7 + rand() * 5, d = 7 + rand() * 4;
      const h = 9 + rand() * 16 + k * 6;
      const ch = makeCliffChunk(w, h, d, (z + k) | 0, k ? '#5e646e' : '#727884');
      ch.position.set(c, terrainAt(c + half, z) - 1, z + rand() * 5);
      // measured, not guessed, then stepped further back for the outer tiers
      world.seatAgainst(ch, wallEdge(z, 1) + k * 7 + rand() * 3, 1);
      world.placeMeasured(ch);
    }
    // the parapet on the drop side, broken and snowed over
    if (rand() < 0.75) {
      const x = c - half - 1.2;
      const p = makeCliffChunk(3 + rand() * 2.5, 2 + rand() * 2, 3, (z * 3) | 0, '#8894a0');
      p.position.set(c, terrainAt(x, z) - 0.4, z + rand() * 6);
      world.seatAgainst(p, wallEdge(z, -1), -1);
      world.decorate(p);
    }
    // icicles hanging off the uphill wall
    if (rand() < 0.6) {
      const x = c + half + 1.4;
      const ic = cone(0.35 + rand() * 0.3, 2.4 + rand() * 2.4, iceMat, 5,
        [x, terrainAt(x, z) + 5.5, z + rand() * 6]);
      ic.rotation.x = Math.PI;
      world.decorate(ic);
    }
  }

  /* frozen conifers, thinning out as you climb past the treeline */
  for (let i = 0; i < 150; i++) {
    const z = Z_START + rand() * (200 - Z_START);
    const density = 1 - Math.max(0, (z - 60) / 150);
    if (rand() > density) continue;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const side = rand() < 0.5 ? -1 : 1;
    const x = c + side * (3 + rand() * (half - 4));
    // frosted needles and grey bark: the same tree as the valley, dead
    const tr = makeConifer(9 + rand() * 7, (i * 7) | 0,
      { leaf: '#7f9e9c', trunk: '#4a4a4e' });
    tr.position.set(x, terrainAt(x, z), z);
    tr.rotation.y = rand() * 6.28;
    world.placeRound(tr, 0.5, 4, { walkable: false });
    hideSpots.push({ x, z, radius: 2.0 });
  }

  /* dead snags above the treeline */
  for (let i = 0; i < 40; i++) {
    const z = 150 + rand() * 110;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (rand() - 0.5) * 2 * (half - 3);
    const sn = makeSnag(4 + rand() * 4, (i * 11) | 0);
    sn.position.set(x, terrainAt(x, z), z);
    world.placeRound(sn, 0.4, 4, { walkable: false });
  }

  /* boulders: cover, and the only thing that saves you from the dragon */
  for (let i = 0; i < 70; i++) {
    const z = 20 + rand() * (Z_END - 40);
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (rand() - 0.5) * 2 * (half - 3.5);
    const size = 1.4 + rand() * 1.7;
    const b = makeBoulder(size, (i * 13) | 0, '#8fa0ac');
    b.position.set(x, terrainAt(x, z), z);
    world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
    boulders.push({ x, z, r: size });
    hideSpots.push({ x, z, radius: size + 2.0 });
  }

  /* ---------------- the buried village ----------------
   * Cottages under the snow. This is the level's one held image: the mountain
   * was lived on, and the ice took it.
   */
  const wallMat = faceted(T.cliffTex('#7e8794'));
  const roofMat = faceted(T.woodTex('#5a5f68'));
  const villagers = [];
  for (let i = 0; i < 9; i++) {
    const z = 84 + i * 5.2 + rand() * 2;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const side = i % 2 ? 1 : -1;
    const x = c + side * (5 + rand() * (half - 7));
    const y = terrainAt(x, z);
    const h = 2.6 + rand() * 1.0;
    const hut = new THREE.Group();
    hut.add(slab(4.4, h, 4.0, wallMat, [0, h / 2, 0]));
    const roof = cone(3.6, 2.2, roofMat, 4, [0, h + 1.1, 0]);
    roof.rotation.y = Math.PI / 4;
    hut.add(roof);
    // snow load on the roof
    const cap = cone(3.3, 1.5, faceted(T.snowTex('#e8f2f8')), 4, [0, h + 1.5, 0]);
    cap.rotation.y = Math.PI / 4;
    hut.add(cap);
    hut.position.set(x, y, z);
    hut.rotation.y = rand() * 0.8 - 0.4;
    world.place(hut, { walkable: false, shrink: 0.3 });
    villagers.push({ x, z, y });
  }
  world.villageSpots = villagers;

  /* ---------------- the summit ---------------- */
  const arenaZ = 292;
  const arenaX = valleyCentre(arenaZ);
  const arenaY = roadHeight(arenaZ);
  const ARENA_R = 30;

  // a ring of ice pillars around the top
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const h = 12 + (i % 3) * 6;
    const px = arenaX + Math.cos(a) * (ARENA_R + 4);
    const pz = arenaZ + Math.sin(a) * (ARENA_R + 4);
    const col = tube(2.2, 3.0, h, i % 2 ? rockMat : iceMat, 6, [px, arenaY + h / 2, pz]);
    world.decorate(col);
  }
  // cover inside the arena -- the roost pass is unsurvivable without it
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3;
    const rr = 9 + (i % 3) * 6;
    const bx = arenaX + Math.cos(a) * rr, bz = arenaZ + Math.sin(a) * rr;
    const size = 2.0 + (i % 3) * 0.5;
    const b = makeBoulder(size, i * 29 + 3, '#a8b8c4');
    b.position.set(bx, arenaY, bz);
    world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
    boulders.push({ x: bx, z: bz, r: size });
    hideSpots.push({ x: bx, z: bz, radius: size + 2.0 });
  }
  // the bones of everything that tried this before
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2, rr = 6 + rand() * 18;
    const cr = makeCairn((i * 17) | 0);
    cr.position.set(arenaX + Math.cos(a) * rr, arenaY, arenaZ + Math.sin(a) * rr);
    world.decorate(cr);
  }

  // peaks beyond, so the summit reads as the top of something
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 120 + rand() * 50;
    const pk = makePeak(22 + rand() * 18, 34 + rand() * 40, (i * 5) | 0, '#7d8b98');
    pk.position.set(Math.cos(a) * r, arenaY - 40 + rand() * 10, arenaZ + Math.sin(a) * r);
    world.decorate(pk);
  }

  /* ---------------- shops, taverns, shrines ---------------- */
  const shops = [];
  function addShop(z, xOff) {
    const x = valleyCentre(z) + xOff;
    const st = makeShopStall('#39627e', '#e0ecf4');
    st.position.set(x, terrainAt(x, z), z);
    st.rotation.y = xOff > 0 ? -0.6 : 0.6;
    world.place(st, { walkable: false, shrink: 0.3 });
    shops.push({ x, z: z + 1.4 });
  }
  addShop(6, -5.0);
  addShop(112, 7.0);
  addShop(214, -7.5);

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
  addTavern('halfway', 'THE HALF-WAY HOUSE', 124, -9.5);
  addTavern('shoulder', 'THE LAST HEARTH', 226, 9.0);

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
  addCheckpoint('village', 'THE BURIED VILLAGE', 104, 5.5);
  addCheckpoint('shoulder', 'THE WIND SHOULDER', 206, -5.6);
  // The last shrine sits at the MOUTH of the hollow -- arenaTrigger is 272 and
  // the gate holds you at 266, so this is the last thing you touch before the
  // dragon. Clear the mountain, light it, and those kills are banked for good.
  addCheckpoint('summit', 'THE SUMMIT STAIR', 264, 5.0);

  /* torches up the road, because it is a road people used to keep */
  for (let z = 20; z < 250; z += 26) {
    const x = valleyCentre(z) - valleyHalfWidth(z) + 2.2;
    const tor = makeTorch();
    tor.position.set(x, terrainAt(x, z), z);
    world.decorate(tor);
    torches.push(tor);
  }

  /* ---------------- chests, pickups ---------------- */
  const chests = [];
  for (const [z, xOff] of [[42, 8], [96, -9], [150, 8.5], [196, -8], [244, 9], [276, -12]]) {
    const x = valleyCentre(z) + xOff;
    const ch = makeChest('#5c6570', '#8fa4b0');
    ch.position.set(x, terrainAt(x, z), z);
    ch.rotation.y = rand() * 1.5;
    world.place(ch, { walkable: false, shrink: 0.2 });
    chests.push({ mesh: ch, lid: ch.userData.lid, opened: false, position: ch.position });
  }

  const artifactSpots = [];
  const ids = Object.keys(ARTIFACTS);
  for (let i = 0; i < 5; i++) {
    const z = 40 + i * 46 + rand() * 12;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (i % 2 ? 1 : -1) * (half - 2.5);
    artifactSpots.push({ x, z, id: ids[i % ids.length] });
  }

  const arrowSpots = [];
  for (let i = 0; i < 9; i++) {
    const z = 26 + i * 28 + rand() * 8;
    const x = valleyCentre(z) + (rand() - 0.5) * 10;
    arrowSpots.push({ x, z, n: 2 + ((rand() * 3) | 0) });
  }
  const foodSpots = [];
  for (let i = 0; i < 8; i++) {
    const z = 34 + i * 30 + rand() * 8;
    const x = valleyCentre(z) + (rand() - 0.5) * 10;
    foodSpots.push({ x, z, kind: ['bread', 'cheese', 'meat', 'mushroom'][i % 4] });
  }

  /* ---------------- enemies ---------------- */
  const spawns = [];
  const campDefs = [];
  const campfires = [];
  const T1 = ['frostSkeleton', 'albinoGoblin', 'rimeSlime', 'crossbowSkeleton'];
  const T2 = ['iceWitch', 'iceGolem', 'albinoGoblinKing'];

  // roaming patrols up the road
  for (let i = 0; i < 26; i++) {
    const z = 26 + rand() * 226;
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const x = c + (rand() - 0.5) * 2 * (half - 4);
    spawns.push({ kind: T1[(rand() * T1.length) | 0], x, z, spawned: false });
  }
  // five camps, each with one tier-2 leader, spaced up the climb
  const campZ = [58, 106, 158, 204, 246];
  campZ.forEach((z, i) => {
    const c = valleyCentre(z), half = valleyHalfWidth(z);
    const side = i % 2 ? 1 : -1;
    const cx = c + side * (half * 0.45);
    campDefs.push({ id: 'camp' + i, x: cx, z });
    spawns.push({ kind: T2[i % T2.length], x: cx, z, camp: 'camp' + i, spawned: false });
    const n = 3 + (i > 1 ? 1 : 0);
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
      const tent = makeTent('#4a5a66');
      const tx = cx + (k ? 4 : -4), tz = z + 3;
      tent.position.set(tx, terrainAt(tx, tz), tz);
      tent.rotation.y = k ? -0.6 : 0.6;
      world.place(tent, { walkable: false, shrink: 0.25 });
    }
  });

  /* ---------------- exports ---------------- */
  world.mapData = {
    kind: 'valley',
    zStart: Z_START, zEnd: Z_END,
    halfWidth: 26,
    centre: valleyCentre,
    arena: { x: arenaX, z: arenaZ, r: ARENA_R },
  };

  // The terraces get farmed again, and the buried village gets dug out.
  world.peaceSpots = [
    ...villagers.map(v => ({ x: v.x, z: v.z, roam: 4 })),
    { x: valleyCentre(40) + 5, z: 40, roam: 6 },
    { x: valleyCentre(62) - 6, z: 62, roam: 6 },
    { x: valleyCentre(140) + 6, z: 140, roam: 6 },
    { x: valleyCentre(200) - 6, z: 200, roam: 5 },
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
  world.arenaTrigger = 272;
  world.weather = { kind: 'snow', count: 950, box: 42, fall: 3.2, drift: 1.2 };

  world.inCover = (x, z) => {
    for (const h of hideSpots) {
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < h.radius * h.radius) return true;
    }
    return false;
  };

  return world;
}
