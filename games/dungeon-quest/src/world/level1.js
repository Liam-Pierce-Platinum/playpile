// LEVEL 1 -- THE FOREST BETWEEN THE CLIFFS
//
// Not a straight line. Two cliff walls bound the whole valley, but twice along
// its length a rock massif splits the floor into two lanes, and the player has
// to choose: walk into a guarded camp, or take the narrow route and sneak.
// Camps see as a group, tall grass hides a crouching player, and the artifacts
// are all off the direct road.
import * as THREE from 'three';
import { World } from './world.js';
import { smooth, faceted, slab } from '../art/shapes.js';
import * as T from '../art/textures.js';
import { NAMED } from '../art/palette.js';
import { ARTIFACTS } from '../game/items.js';
import {
  makeBroadleaf, makeConifer, makeSnag, makeBoulder, makeCliffChunk, makePeak,
  makeChest, makeShopStall, makeTorch, makeSign, makeBush, makeGrassTexture,
  makeCampfire, makeTent, makeBedroll, makeSpit, makeTallGrass, makeCairn,
  makeShrine, makeTavern, makeCage, makeMirror,
} from '../art/props.js';

const Z_START = -16;
const Z_END = 302;

/* ---------------- valley shape ---------------- */

/** Fork zones widen out so both lanes are playable. */
const FORKS = [
  { z0: 58, z1: 96, half: 12 },     // the bandit fork
  { z0: 128, z1: 168, half: 13 },   // the deep wood fork
];

function forkAt(z) {
  for (const f of FORKS) if (z >= f.z0 && z <= f.z1) return f;
  return null;
}

/** How far the fork's central massif has ramped in, 0..1. */
function forkBlend(z, f) {
  const ramp = 10;
  const a = Math.min(1, (z - f.z0) / ramp);
  const b = Math.min(1, (f.z1 - z) / ramp);
  return Math.max(0, Math.min(a, b));
}

export function valleyHalfWidth(z) {
  let w = 15
    + Math.sin(z * 0.045) * 2.2
    + Math.sin(z * 0.017 + 1.3) * 2.8;
  const f = forkAt(z);
  if (f) w += f.half * forkBlend(z, f);        // widen through the fork
  if (z > 246) w += 22;                        // the arena opens right out
  return w;
}

export function valleyCentre(z) {
  // Three overlapping waves so the road genuinely turns and doubles back
  // instead of drifting. The cliffs follow it, so the whole valley snakes.
  return Math.sin(z * 0.030) * 7.5
    + Math.sin(z * 0.011 + 0.7) * 5.0
    + Math.sin(z * 0.055 + 2.1) * 2.4;
}

export const AREAS = [
  { id: 'shop', name: 'VALLEY MOUTH', z: [-12, 26], safe: true },
  { id: 'glade', name: 'MOSSY GLADE', z: [26, 58] },
  { id: 'fork1', name: 'THE SPLIT ROCK', z: [58, 96] },
  { id: 'pass', name: 'STONE PASS', z: [96, 128] },
  { id: 'fork2', name: 'THE DEEP WOOD', z: [128, 168] },
  { id: 'burned', name: 'THE BURNED MILE', z: [168, 212] },
  { id: 'approach', name: 'THE LONG APPROACH', z: [212, 248] },
  { id: 'arena', name: 'DRAGON HOLLOW', z: [248, 300] },
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

export function buildLevel1(scene) {
  const world = new World(scene);
  let seed = 20260822;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /* ---------------- sky, fog, light ---------------- */
  const SKY = new THREE.Color('#5f6f56');
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 20, 74);

  const hemi = new THREE.HemisphereLight('#d2dab6', '#37372c', 1.05);
  world.root.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d0', 1.5);
  sun.position.set(8, 16, -6);
  world.root.add(sun);
  const bounce = new THREE.DirectionalLight('#8ea7c4', 0.42);
  bounce.position.set(-8, 6, 8);
  world.root.add(bounce);
  const ambient = new THREE.AmbientLight('#707663', 0.42);
  world.root.add(ambient);
  world.lights = { hemi, sun, bounce, ambient, skyColor: SKY.clone() };
  // Each level authors its own "day". The night preset is for the title camp
  // only, and must not permanently overwrite this.
  world.lights.base = {
    hemi: 1.05, sun: 1.5, bounce: 0.42, ambient: 0.42,
    sunColor: '#fff2d0', sky: SKY.clone(), fogNear: 20, fogFar: 74,
  };

  /* ---------------- floor ---------------- */
  const gTex = T.groundTex(NAMED.forestGround, NAMED.forestAccent);
  gTex.repeat.set(28, 96);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 300), smooth(gTex));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = (Z_START + Z_END) / 2;
  world.root.add(ground);
  world.colliders.push(ground);

  // trodden path down the valley centre
  const pTex = T.groundTex('#6b5a3c', '#7d6b48');
  pTex.repeat.set(2, 74);
  const pathGeo = new THREE.PlaneGeometry(5.0, Z_END - Z_START, 1, 80);
  {
    const pos = pathGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const zWorld = pos.getY(i) + (Z_START + Z_END) / 2;
      pos.setX(i, pos.getX(i) + valleyCentre(zWorld));
    }
    pathGeo.computeVertexNormals();
  }
  const path = new THREE.Mesh(pathGeo, smooth(pTex));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.015, (Z_START + Z_END) / 2);
  world.root.add(path);

  /* ---------------- outer cliff walls ---------------- */
  for (let z = Z_START - 6; z <= Z_END + 6; z += 7) {
    const hw = valleyHalfWidth(z);
    const cx = valleyCentre(z);
    for (const side of [-1, 1]) {
      const h = 16 + rand() * 12;
      const w = 11 + rand() * 4;
      const chunk = makeCliffChunk(w, h, 11, (seed & 0xffff) + z, '#6e6a63');
      // Sit it so its INNER FACE lands on the collision line. Centring it a
      // fixed distance out let the near half of a wide chunk hang back over
      // the walkable floor, and you walked into visible rock before anything
      // stopped you. A turned chunk is wider still, hence the diagonal.
      chunk.position.set(cx, 0, z + (rand() - 0.5) * 2);
      chunk.rotation.y = rand() * Math.PI;
      // measured, not guessed: its inner face lands on the collision line
      world.seatAgainst(chunk, wallEdge(z, side), side);
      world.placeMeasured(chunk);
      if (rand() < 0.4) {
        // The background peaks are 40m across and were placed by their CENTRE,
        // which put their near flank well inside the valley. Seat them too.
        const peak = makePeak(13 + rand() * 8, 26 + rand() * 22, (seed & 0xffff) + z * 3);
        peak.position.set(cx, -2, z + (rand() - 0.5) * 12);
        world.seatAgainst(peak, wallEdge(z, side) + side * (6 + rand() * 10), side);
        world.decorate(peak);
      }
    }
  }

  /* ---------------- containment ----------------
   * A curved wall built out of axis-aligned boxes is a staircase, and where
   * the valley narrows across a step the box sits OUTSIDE the true edge and
   * leaves a notch you can walk into and stick in. Sampling finely and taking
   * the TIGHTEST edge across each step means the wall is always at or inside
   * the real line -- it can never leave a pocket.
   */
  for (let z = Z_START; z <= Z_END; z += WALL_STEP) {
    const inR = wallEdge(z, 1), inL = wallEdge(z, -1);
    world.addWall(inR, z - 0.05, inR + 40, z + WALL_STEP + 0.05, 20, { x: -1, z: 0 });
    world.addWall(inL - 40, z - 0.05, inL, z + WALL_STEP + 0.05, 20, { x: 1, z: 0 });
  }
  // The back wall, with a GAP straight down the middle of the brown path.
  // That gap is where the false wall stands: it looks like the rest of the
  // cliff and it stops nothing.
  const GAP_X = valleyCentre(Z_START);
  const GAP_HALF = 4.5;
  world.addWall(-60, Z_START - 6, GAP_X - GAP_HALF, Z_START);
  world.addWall(GAP_X + GAP_HALF, Z_START - 6, 60, Z_START);
  world.addWall(-60, Z_END, 60, Z_END + 6, 20, { x: 0, z: -1 });

  // the cliff face behind the spawn -- decoration only, so the gap in it is
  // invisible until you walk into it
  for (let x = -22; x <= 22; x += 7) {
    const chunk = makeCliffChunk(11, 18 + rand() * 6, 10, x * 7 + 5);
    chunk.position.set(GAP_X + x, 0, Z_START - 4);
    world.decorate(chunk);
  }

  /* ---------------- the central massifs that create the forks ---------------- */
  // These are the whole point of the level: you cannot see both lanes at once,
  // and you have to commit to one.
  const massifs = [];
  for (const f of FORKS) {
    const inner = 4.0;                       // half-width of the blocking rock
    for (let z = f.z0 + 6; z <= f.z1 - 6; z += 6) {
      const cx = valleyCentre(z);
      const chunk = makeCliffChunk(9 + rand() * 3, 13 + rand() * 7, 9,
        (seed & 0xffff) + z * 11, '#6a675f');
      chunk.position.set(cx + (rand() - 0.5) * 1.5, 0, z);
      chunk.rotation.y = rand() * Math.PI;
      // Measured, not a hand-guessed band. The blocking wall was cx +/- 4 while
      // these chunks are nearly four metres wider than that on each side, so
      // the split rock you can SEE was much bigger than the one you hit.
      world.placeMeasured(chunk, { inset: 0.9 });
      // trees clinging to the massif
      if (rand() < 0.5) {
        const h = 9 + rand() * 5;
        const t = makeConifer(h, (z * 31) | 0);
        t.position.set(cx + (rand() - 0.5) * 6, 0, z + (rand() - 0.5) * 4);
        world.placeRound(t, h * 0.040 * 0.85, h, { walkable: false });
      }
    }
    for (let z = f.z0 + 3; z <= f.z1 - 3; z += 3) {
      const cx = valleyCentre(z);
      world.addWall(cx - inner, z - 0.1, cx + inner, z + 3.1, 14);
    }
    massifs.push(f);
  }

  /** Which lane is a point in, for a given fork? -1 left, +1 right, 0 none. */
  world.laneAt = (x, z) => {
    const f = forkAt(z);
    if (!f) return 0;
    return x < valleyCentre(z) ? -1 : 1;
  };

  /* ---------------- clearings ----------------
   * Camps and the shop need OPEN GROUND. Scatter props first and you end up
   * fighting a leader inside a thicket, which is unreadable and unfair.
   * These are declared before anything is scattered, and every scatter loop
   * below respects them.
   */
  const CLEARINGS = [
    { x: valleyCentre(46) - 8.5, z: 46, r: 10 },     // glade camp
    { x: valleyCentre(228) - 9, z: 228, r: 12 },     // gate camp
    { x: valleyCentre(118) + 9.5, z: 118, r: 9 },    // tavern
    { x: valleyCentre(220) - 10, z: 220, r: 9 },     // tavern
    { x: valleyCentre(104) - 9, z: 104, r: 7 },      // merchant
    { x: valleyCentre(206) + 8.5, z: 206, r: 7 },    // merchant
    { x: valleyCentre(76) - 12.5, z: 76, r: 13 },    // bandit camp
    { x: valleyCentre(148) - 13, z: 148, r: 13 },    // deep camp
    { x: valleyCentre(182) + 8, z: 182, r: 10 },     // approach camp
    { x: valleyCentre(8) + 5.2, z: 8, r: 11 },       // the shop
    { x: valleyCentre(-6) - 6.5, z: -6, r: 8 },      // the night camp
  ];

  /** Is this spot inside a clearing (or its soft margin)? */
  function inClearing(x, z, margin = 0) {
    for (const c of CLEARINGS) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return true;
    }
    return false;
  }

  /* ---------------- trees ---------------- */
  const treeCount = 300;
  for (let i = 0; i < treeCount; i++) {
    const z = Z_START + rand() * (Z_END - Z_START);
    const hw = valleyHalfWidth(z);
    const cx = valleyCentre(z);
    const side = rand() < 0.5 ? -1 : 1;
    const t = 0.28 + rand() * 0.70;
    const x = cx + side * hw * t;

    if (Math.abs(x - cx) < 4.0) continue;                 // keep the road open
    if (z > 246 && Math.abs(x - cx) < 26) continue;        // arena floor
    if (inClearing(x, z)) continue;                        // camps stay open
    // do not bury the fork lanes
    const f = forkAt(z);
    if (f && Math.abs(x - cx) < 9) continue;

    let tree, trunkR, height;
    const roll = rand();
    if (roll < 0.44) {
      height = 12 + rand() * 8;
      tree = makeConifer(height, (i * 977) | 0);
      trunkR = height * 0.040;
    } else if (roll < 0.9) {
      height = 9 + rand() * 6;
      tree = makeBroadleaf(height, (i * 613) | 0);
      trunkR = height * 0.052;
    } else {
      height = 6 + rand() * 4;
      tree = makeSnag(height, (i * 331) | 0);
      trunkR = height * 0.055;
    }

    tree.position.set(x, 0, z);
    tree.rotation.y = rand() * Math.PI * 2;
    // A round trunk gets a round collider, sized a little UNDER the bark so
    // you brush past rather than snagging on nothing.
    world.placeRound(tree, trunkR * 0.85, height, { walkable: false });
  }

  /* ---------------- rocks, bushes, grass ---------------- */
  // Far fewer rocks than before, and most of them are scenery you walk over
  // rather than obstacles you catch on. Only genuinely big ones block.
  for (let i = 0; i < 34; i++) {
    const z = Z_START + rand() * (Z_END - Z_START);
    const hw = valleyHalfWidth(z);
    const cx = valleyCentre(z);
    const x = cx + (rand() - 0.5) * 2 * hw * 0.92;
    if (Math.abs(x - cx) < 4.5) continue;                  // off the road
    if (inClearing(x, z, 2)) continue;

    const size = 0.5 + rand() * 1.9;
    const b = makeBoulder(size, (i * 71) | 0);
    b.position.set(x, 0, z);
    b.rotation.y = rand() * Math.PI;

    if (size > 1.25) {
      // a real boulder: round collider, and you can stand on it
      world.placeRound(b, size * 0.78, size * 1.1, { walkable: true });
    } else {
      world.decorate(b);                                   // pure scenery
    }
  }

  for (let i = 0; i < 170; i++) {
    const z = Z_START + rand() * (Z_END - Z_START);
    const hw = valleyHalfWidth(z);
    const cx = valleyCentre(z);
    const x = cx + (rand() - 0.5) * 2 * hw;
    if (inClearing(x, z, 1)) continue;
    const bush = makeBush((i * 53) | 0, rand() < 0.5 ? '#3f5a28' : '#354d22');
    bush.position.set(x, 0, z);
    world.decorate(bush);
  }

  const grassMat = new THREE.MeshLambertMaterial({
    map: makeGrassTexture(), transparent: true, alphaTest: 0.5,
    side: THREE.DoubleSide, fog: true,
  });
  const COUNT = 1800;
  const tufts = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.5), grassMat, COUNT);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < COUNT; i++) {
    const z = Z_START + rand() * (Z_END - Z_START);
    const hw = valleyHalfWidth(z);
    const cx = valleyCentre(z);
    dummy.position.set(cx + (rand() - 0.5) * 2 * hw, 0.24, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + rand() * 0.8);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  world.root.add(tufts);

  /* ---------------- hiding places ---------------- */
  // Crouch inside one of these and mobs almost cannot see you.
  const hideSpots = [];
  function addHide(x, z, radius = 1.8) {
    const patch = makeTallGrass((x * 91 + z * 7) | 0, radius);
    patch.position.set(x, 0, z);
    world.decorate(patch);
    hideSpots.push({ x, z, radius: radius + 0.4 });
  }

  // along the glade, and thick along the stealth lanes
  const hideSpec = [
    [valleyCentre(34) - 7, 34], [valleyCentre(42) + 8, 42], [valleyCentre(50) - 6, 50],
    // fork 1, right lane (the sneak route)
    [valleyCentre(64) + 9, 64, 2.2], [valleyCentre(72) + 11, 72, 2.4],
    [valleyCentre(80) + 8, 80, 2.2], [valleyCentre(88) + 10, 88, 2.0],
    // fork 1, left lane (creeping up on the camp)
    [valleyCentre(66) - 13, 66, 1.9], [valleyCentre(86) - 12, 86, 1.9],
    [valleyCentre(104) + 7, 104], [valleyCentre(116) - 8, 116],
    // fork 2, right lane
    [valleyCentre(134) + 11, 134, 2.3], [valleyCentre(146) + 13, 146, 2.4],
    [valleyCentre(158) + 10, 158, 2.2],
    // fork 2, left lane
    [valleyCentre(136) - 12, 136, 2.0], [valleyCentre(156) - 14, 156, 2.0],
    [valleyCentre(176) - 8, 176], [valleyCentre(188) + 9, 188],
  ];
  for (const [x, z, r] of hideSpec) addHide(x, z, r ?? 1.8);

  /* ---------------- the shop ---------------- */
  const shopX = valleyCentre(8) + 5.2;
  const stall = makeShopStall();
  stall.position.set(shopX, 0, 8);
  stall.rotation.y = -0.55;
  world.place(stall, { walkable: false, shrink: 0.3 });

  const torches = [];
  for (const [tx, tz] of [[shopX - 2.8, 5.0], [shopX + 2.4, 11.2]]) {
    const t = makeTorch();
    t.position.set(tx, 0, tz);
    world.decorate(t);
    torches.push(t);
  }

  const sign = makeSign();
  sign.position.set(valleyCentre(18) - 3.6, 0, 18);
  sign.rotation.y = 0.5;
  world.decorate(sign);

  // cairns marking the forks
  for (const z of [56, 126]) {
    const c = makeCairn(z | 0);
    c.position.set(valleyCentre(z) - 3.0, 0, z);
    world.decorate(c);
  }

  /* ---------------- camps ---------------- */
  const campDefs = [];
  const campfires = [];

  function buildCamp(id, x, z, opts = {}) {
    const fire = makeCampfire();
    fire.position.set(x, 0, z);
    world.place(fire, { walkable: false, shrink: 0.2 });
    campfires.push(fire);

    const n = opts.tents ?? 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand();
      const tent = makeTent(i % 2 ? '#5a4a32' : '#4a3f30');
      tent.position.set(x + Math.cos(a) * 3.6, 0, z + Math.sin(a) * 3.6);
      tent.rotation.y = -a + Math.PI;
      world.place(tent, { walkable: false, shrink: 0.25 });
    }
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2;
      const b = makeBedroll();
      b.position.set(x + Math.cos(a) * 2.2, 0, z + Math.sin(a) * 2.2);
      b.rotation.y = rand() * Math.PI;
      world.decorate(b);
    }
    if (opts.spit) {
      const s = makeSpit();
      s.position.set(x + 1.6, 0, z - 1.4);
      world.decorate(s);
    }

    const def = { id, x, z, radius: opts.radius ?? 9 };
    campDefs.push(def);
    return def;
  }

  buildCamp('gladeCamp', valleyCentre(46) - 8.5, 46, { tents: 1 });
  buildCamp('banditCamp', valleyCentre(76) - 12.5, 76, { tents: 3, spit: true, radius: 11 });
  buildCamp('deepCamp', valleyCentre(148) - 13, 148, { tents: 3, spit: true, radius: 11 });
  buildCamp('approachCamp', valleyCentre(182) + 8, 182, { tents: 2 });
  buildCamp('gateCamp', valleyCentre(228) - 9, 228, { tents: 3, spit: true, radius: 11 });

  /* ---------------- chests ---------------- */
  const chestSpots = [
    { x: valleyCentre(40) + 9, z: 40 },
    { x: valleyCentre(76) - 15, z: 76 },       // inside the bandit camp
    { x: valleyCentre(90) + 12, z: 90 },       // reward for the sneak lane
    { x: valleyCentre(112) - 9, z: 112 },
    { x: valleyCentre(148) - 16, z: 148 },     // inside the deep camp
    { x: valleyCentre(152) + 14, z: 152 },
    { x: valleyCentre(186) + 10, z: 186 },
  ];
  const chests = chestSpots.map(s => {
    const c = makeChest();
    c.position.set(s.x, 0, s.z);
    c.rotation.y = rand() * Math.PI * 2;
    world.place(c, { walkable: false, shrink: 0.1 });
    return { mesh: c, lid: c.userData.lid, opened: false, position: c.position };
  });

  /* ---------------- artifacts: all off the main road ---------------- */
  const artifactSpots = [
    { id: 'emberShard', x: valleyCentre(72) + 13, z: 72 },     // sneak lane
    { id: 'mossCharm', x: valleyCentre(88) - 15, z: 88 },      // behind the camp
    { id: 'thiefsCoin', x: valleyCentre(120) + 11, z: 120 },
    { id: 'owlFeather', x: valleyCentre(150) + 15, z: 150 },   // deep sneak lane
    { id: 'ironBand', x: valleyCentre(160) - 16, z: 160 },
    { id: 'hollowIdol', x: valleyCentre(192) - 12, z: 192 },
  ];

  /* ---------------- the arena ---------------- */
  const arenaZ = 272;
  const arenaX = valleyCentre(arenaZ);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 27;
    const stone = makeCliffChunk(3.0, 5.5 + (i % 3) * 1.4, 3.0, i * 31 + 7, '#7a7468');
    stone.position.set(arenaX + Math.cos(a) * r, 0, arenaZ + Math.sin(a) * r);
    world.place(stone, { walkable: false, shrink: 0.25 });
  }
  // bones of earlier heroes, as a warning
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4 + rand() * 20;
    const b = makeBoulder(0.35 + rand() * 0.4, (i * 13) | 0, '#cfc0a0');
    b.position.set(arenaX + Math.cos(a) * r, 0, arenaZ + Math.sin(a) * r);
    world.decorate(b);
  }
  const arenaSign = makeSign();
  arenaSign.position.set(arenaX - 2.2, 0, 250);
  world.decorate(arenaSign);

  /* ---------------- enemy spawns ---------------- */
  // camp: which camp the mob belongs to (shared awareness). Leaders are one
  // per camp, exactly as the design says.
  const spawns = [
    // --- mossy glade ---
    { kind: 'slime', x: valleyCentre(32) - 4, z: 32 },
    { kind: 'slime', x: valleyCentre(38) + 5, z: 38 },
    { kind: 'skeleton', x: valleyCentre(46) - 6.5, z: 46, camp: 'gladeCamp' },
    { kind: 'skeleton', x: valleyCentre(46) - 10.5, z: 48, camp: 'gladeCamp' },
    { kind: 'zombie', x: valleyCentre(52) + 4, z: 52 },

    // --- fork 1, LEFT lane: the bandit camp, led by the WITCH ---
    { kind: 'witch', x: valleyCentre(76) - 12.5, z: 76, camp: 'banditCamp' },
    { kind: 'skeleton', x: valleyCentre(72) - 10, z: 72, camp: 'banditCamp' },
    { kind: 'crossbowSkeleton', x: valleyCentre(80) - 15, z: 80, camp: 'banditCamp' },
    { kind: 'zombie', x: valleyCentre(76) - 17, z: 76, camp: 'banditCamp' },
    { kind: 'zombie', x: valleyCentre(84) - 11, z: 84, camp: 'banditCamp' },
    { kind: 'slime', x: valleyCentre(68) - 13, z: 68, camp: 'banditCamp' },

    // --- fork 1, RIGHT lane: thin patrols, meant to be slipped past ---
    { kind: 'crossbowSkeleton', x: valleyCentre(70) + 12, z: 70 },
    { kind: 'slime', x: valleyCentre(82) + 10, z: 82 },
    { kind: 'skeleton', x: valleyCentre(92) + 9, z: 92 },

    // --- stone pass ---
    { kind: 'zombie', x: valleyCentre(102) - 5, z: 102 },
    { kind: 'crossbowSkeleton', x: valleyCentre(108) + 6, z: 108 },
    { kind: 'slime', x: valleyCentre(114) - 7, z: 114 },
    { kind: 'zombie', x: valleyCentre(122) + 5, z: 122 },

    // --- fork 2, LEFT lane: the CORRUPTED KNIGHT's camp ---
    { kind: 'corruptedKnight', x: valleyCentre(148) - 13, z: 148, camp: 'deepCamp' },
    { kind: 'skeleton', x: valleyCentre(142) - 11, z: 142, camp: 'deepCamp' },
    { kind: 'crossbowSkeleton', x: valleyCentre(154) - 16, z: 154, camp: 'deepCamp' },
    { kind: 'zombie', x: valleyCentre(148) - 18, z: 148, camp: 'deepCamp' },
    { kind: 'zombie', x: valleyCentre(158) - 12, z: 158, camp: 'deepCamp' },
    { kind: 'slime', x: valleyCentre(138) - 14, z: 138, camp: 'deepCamp' },

    // --- fork 2, RIGHT lane ---
    { kind: 'skeleton', x: valleyCentre(136) + 11, z: 136 },
    { kind: 'zombie', x: valleyCentre(150) + 13, z: 150 },
    { kind: 'slime', x: valleyCentre(162) + 10, z: 162 },

    // --- the long approach ---
    { kind: 'skeleton', x: valleyCentre(174) - 6, z: 174 },
    { kind: 'zombie', x: valleyCentre(182) + 6.5, z: 182, camp: 'approachCamp' },
    { kind: 'skeleton', x: valleyCentre(182) + 10, z: 184, camp: 'approachCamp' },
    { kind: 'crossbowSkeleton', x: valleyCentre(190) - 7, z: 190 },

    // --- the burned mile: open ground, so they come at you in the open ---
    { kind: 'zombie', x: valleyCentre(178) + 7, z: 178 },
    { kind: 'skeleton', x: valleyCentre(186) - 8, z: 186 },
    { kind: 'slime', x: valleyCentre(196) + 6, z: 196 },
    { kind: 'crossbowSkeleton', x: valleyCentre(202) - 9, z: 202 },
    { kind: 'zombie', x: valleyCentre(208) + 8, z: 208 },

    // --- the long approach: the last picket before the hollow ---
    { kind: 'witch', x: valleyCentre(228) - 9, z: 228, camp: 'gateCamp' },
    { kind: 'skeleton', x: valleyCentre(224) - 6, z: 224, camp: 'gateCamp' },
    { kind: 'skeleton', x: valleyCentre(232) - 12, z: 232, camp: 'gateCamp' },
    { kind: 'zombie', x: valleyCentre(230) - 4, z: 230, camp: 'gateCamp' },
    { kind: 'crossbowSkeleton', x: valleyCentre(238) + 8, z: 238 },
    { kind: 'skeleton', x: valleyCentre(242) - 7, z: 242 },
  ];

  /* ---------------- scattered pickups ---------------- */
  const arrowSpots = [
    { x: valleyCentre(36) + 6, z: 36, n: 4 },
    { x: valleyCentre(66) + 10, z: 66, n: 5 },
    { x: valleyCentre(86) + 12, z: 86, n: 5 },
    { x: valleyCentre(110) - 6, z: 110, n: 4 },
    { x: valleyCentre(140) + 12, z: 140, n: 6 },
    { x: valleyCentre(166) + 8, z: 166, n: 5 },
    { x: valleyCentre(188) - 9, z: 188, n: 6 },
  ];
  const foodSpots = [
    { kind: 'bread', x: valleyCentre(44) - 7, z: 44 },
    { kind: 'meat', x: valleyCentre(76) - 14, z: 74 },      // roasting at the camp
    { kind: 'berries', x: valleyCentre(84) + 11, z: 84 },
    { kind: 'cheese', x: valleyCentre(106) + 7, z: 106 },
    { kind: 'meat', x: valleyCentre(148) - 15, z: 146 },
    { kind: 'mushroom', x: valleyCentre(156) + 12, z: 156 },
    { kind: 'bread', x: valleyCentre(182) + 7, z: 180 },
    { kind: 'berries', x: valleyCentre(194) - 8, z: 194 },
  ];

  /* ---------------- the title camp ----------------
   * Where the hero rests before setting out: a big tree to lean against, a
   * fire, a bedroll. The title screen lights the valley as night and frames
   * this. It sits off the road so it never interferes with play.
   */
  const campZ = -6;
  const campX = valleyCentre(campZ) - 6.5;
  const titleTree = makeBroadleaf(13, 4242);
  titleTree.position.set(campX, 0, campZ);
  world.place(titleTree, { walkable: false, shrink: 0.05 });

  const titleFire = makeCampfire();
  titleFire.position.set(campX + 2.6, 0, campZ + 1.5);
  world.decorate(titleFire);
  campfires.push(titleFire);

  const roll = makeBedroll('#6a5a44');
  roll.position.set(campX + 1.2, 0, campZ + 3.0);
  roll.rotation.y = 0.6;
  world.decorate(roll);

  const camptSpit = makeSpit();
  camptSpit.position.set(campX + 4.0, 0, campZ + 0.6);
  world.decorate(camptSpit);

  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const b = makeBoulder(0.4 + rand() * 0.5, (i * 29) | 0);
    b.position.set(campX + 2.6 + Math.cos(a) * 3.2, 0, campZ + 1.5 + Math.sin(a) * 3.2);
    world.decorate(b);
  }

  world.titleCamp = {
    // the hero sits at the foot of the trunk, facing the fire
    seat: new THREE.Vector3(campX + 0.72, 0, campZ + 0.62),
    lookAt: new THREE.Vector3(campX + 2.6, 0.5, campZ + 1.5),
    fire: titleFire,
    tree: titleTree,
  };

  /* ---------------- checkpoints, taverns, roadside merchants ----------------
   * These live in the long open stretches between fights: somewhere to bank
   * progress, top up, and spend coin without walking the whole valley back.
   */
  const checkpoints = [];
  function addCheckpoint(id, name, z, xOff) {
    const x = valleyCentre(z) + xOff;
    const shrine = makeShrine();
    shrine.position.set(x, 0, z);
    world.placeRound(shrine, 0.7, 1.6, { walkable: false });
    checkpoints.push({
      id, name, x, z, mesh: shrine,
      flame: shrine.userData.flame, light: shrine.userData.light, claimed: false,
    });
  }
  // Four, not six. A shrine every other area made dying cost nothing.
  // No shrine at the mouth: you start there, so banking it means nothing,
  // and dying before the first real one should send you back to the start.
  addCheckpoint('pass', 'STONE PASS', 112, -6.0);
  addCheckpoint('burned', 'THE BURNED MILE', 214, -5.6);
  addCheckpoint('gate', 'DRAGON HOLLOW GATE', 246, 5.0);

  const taverns = [];
  const mirrors = [];
  function addTavern(id, name, z, xOff) {
    const x = valleyCentre(z) + xOff;
    const t = makeTavern();
    t.position.set(x, 0, z);
    t.rotation.y = xOff > 0 ? -0.5 : 0.5;
    world.place(t, { walkable: false, shrink: 0.3 });
    // a couple of torches to make it read as a stop from a distance
    for (const dx of [-3.4, 3.4]) {
      const tor = makeTorch();
      tor.position.set(x + dx, 0, z + 3.0);
      world.decorate(tor);
      torches.push(tor);
    }
    // the mirror, off to the side of the door. A rest stop is exactly where
    // a person changes their clothes.
    const mx = x + (xOff > 0 ? -3.9 : 3.9), mz = z + 3.4;
    const mir = makeMirror();
    mir.position.set(mx, 0, mz);
    mir.rotation.y = xOff > 0 ? 0.5 : -0.5;
    world.placeRound(mir, 0.55, 2.0, { walkable: false });
    mirrors.push({ id, x: mx, z: mz + 1.0 });
    taverns.push({ id, name, x, z: z + 3.6 });
  }
  addTavern('crossroads', 'THE CROSSED AXES', 118, 9.5);
  addTavern('burned', 'THE LAST LANTERN', 220, -10.0);

  // roadside merchants beyond the one at the mouth
  const shops = [{ x: shopX, z: 8 + 1.4 }];
  for (const [z, xOff] of [[104, -9.0], [206, 8.5]]) {
    const x = valleyCentre(z) + xOff;
    const st = makeShopStall('#2f5d78', '#e0d8bc');
    st.position.set(x, 0, z);
    st.rotation.y = xOff > 0 ? -0.6 : 0.6;
    world.place(st, { walkable: false, shrink: 0.3 });
    shops.push({ x, z: z + 1.4 });
  }

  /* ---------------- exports ---------------- */
  // What the bought map draws. A corridor is described by its centre line.
  world.mapData = {
    kind: 'valley',
    zStart: -16, zEnd: Z_END,
    halfWidth: 26,
    centre: valleyCentre,
    arena: { x: valleyCentre(272), z: 272, r: 27 },
  };

  // Where the people come back to once the valley is clear. The shops and the
  // taverns already have somewhere for them to be; these are the rest.
  /* ---------------- the false wall ----------------
   * Straight back behind where you spawn, at the very start of the brown path.
   * It looks exactly like the cliff either side of it and it has NO COLLIDER:
   * you walk through it. Nothing tells you that. You find it by walking into
   * a wall that does not stop you.
   */
  const wallZ = Z_START - 3;
  const wallX = valleyCentre(Z_START);
  const falseWall = new THREE.Group();
  const fwMat = faceted(T.cliffTex('#6e6a63'));
  for (let i = 0; i < 4; i++) {
    const w = 10 - i * 0.9;
    falseWall.add(slab(w, 3.8, 3.0, fwMat, [0, 1.9 + i * 3.6, (i % 2) * 0.4 - 0.2]));
  }
  falseWall.position.set(wallX, 0, wallZ);
  world.decorate(falseWall);          // decorate, NOT place: no collision at all

  /* ---------------- the passage, and the opening at the end ---------------- */
  const denX = wallX, denZ = wallZ - 34;

  const passFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 32),
    smooth(T.groundTex('#5a4a30', '#6b5738'))     // the brown path, continued
  );
  passFloor.rotation.x = -Math.PI / 2;
  passFloor.position.set(wallX, 0.02, wallZ - 15);
  world.decorate(passFloor);
  world.colliders.push(passFloor);

  for (let i = 0; i < 6; i++) {
    const pz = wallZ - 3 - i * 5.5;
    for (const sx of [-1, 1]) {
      const ch = makeCliffChunk(5, 15 + rand() * 5, 5, i * 13 + 21, '#6e6a63');
      ch.position.set(wallX + sx * 10, 0, pz);
      world.place(ch, { walkable: false, shrink: 0.4 });
    }
    if (i % 2 === 0) {
      const tor = makeTorch();
      tor.position.set(wallX - 6.4, 0, pz);
      world.decorate(tor);
      torches.push(tor);
    }
  }

  const denFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 38),
    smooth(T.groundTex('#3f4a2a', '#4a5733'))
  );
  denFloor.rotation.x = -Math.PI / 2;
  denFloor.position.set(denX, 0.02, denZ);
  world.decorate(denFloor);
  world.colliders.push(denFloor);
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    // leave the +z side open: that is the way in, back up the passage
    const rel = Math.atan2(Math.sin(ang - Math.PI / 2), Math.cos(ang - Math.PI / 2));
    if (Math.abs(rel) < 0.62) continue;
    const cx2 = denX + Math.cos(ang) * 17, cz2 = denZ + Math.sin(ang) * 18;
    const ch = makeCliffChunk(8, 18 + rand() * 8, 8, i * 9 + 3, '#6e6a63');
    ch.position.set(cx2, 0, cz2);
    // placed, not decorated: the walls have to stop the CAMERA as well as the
    // player, or a shoulder cam ends up inside the rock
    world.place(ch, { walkable: false, shrink: 0.4 });
  }
  for (const [dx, dz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
    const tor = makeTorch();
    tor.position.set(denX + dx, 0, denZ + dz);
    world.decorate(tor);
    torches.push(tor);
  }

  // THE CAGE. Its door faces back up the passage, so the lock is the first
  // thing you see when you step through the rock.
  const CAGE_R = 5.4;
  const cage = makeCage(CAGE_R, 7.0);
  cage.position.set(denX, 0, denZ);
  world.decorate(cage);                 // doorway already faces +z
  const barBoxes = [];
  const seg = (minX, minZ, maxX, maxZ) => {
    world.addWall(minX, minZ, maxX, maxZ, 7.4);
    const box = world.boxes[world.boxes.length - 1];
    barBoxes.push(box);
    return box;
  };
  seg(denX - CAGE_R - 0.6, denZ - CAGE_R - 0.6, denX - CAGE_R + 0.4, denZ + CAGE_R + 0.6);
  seg(denX + CAGE_R - 0.4, denZ - CAGE_R - 0.6, denX + CAGE_R + 0.6, denZ + CAGE_R + 0.6);
  seg(denX - CAGE_R - 0.6, denZ - CAGE_R - 0.6, denX + CAGE_R + 0.6, denZ - CAGE_R + 0.4);
  // the door side, which is the one that goes away when it is unlocked
  const doorBox = seg(denX - CAGE_R - 0.6, denZ + CAGE_R - 0.4,
    denX + CAGE_R + 0.6, denZ + CAGE_R + 0.6);

  world.dragonCage = {
    mesh: cage, door: cage.userData.door, lock: cage.userData.lock,
    doorBox, barBoxes,
    x: denX, z: denZ, r: CAGE_R,
    // where you stand to use the key: outside the door, facing the lock
    standX: denX, standZ: denZ + CAGE_R + 2.4,
    denX, denZ,
  };

  world.peaceSpots = [
    { x: shopX, z: 10, roam: 5 },
    { x: valleyCentre(30) + 5, z: 30, roam: 6 },
    { x: valleyCentre(54) - 6, z: 54, roam: 6 },
    { x: valleyCentre(84) + 7, z: 84, roam: 7 },
    { x: valleyCentre(112) - 7, z: 112, roam: 6 },
    { x: valleyCentre(140) + 6, z: 140, roam: 7 },
    { x: valleyCentre(172) - 6, z: 172, roam: 6 },
    { x: valleyCentre(196) + 7, z: 196, roam: 7 },
    { x: valleyCentre(220) - 8, z: 220, roam: 6 },
    { x: valleyCentre(244) + 6, z: 244, roam: 6 },
  ];
  world.checkpoints = checkpoints;
  world.taverns = taverns;
  world.mirrors = mirrors;
  world.shops = shops;
  world.spawn = new THREE.Vector3(valleyCentre(0), 0, 0);
  world.shopPosition = new THREE.Vector3(shopX, 0, 8 + 1.4);
  world.chests = chests;
  world.enemySpawns = spawns;
  world.campDefs = campDefs;
  world.campfires = campfires;
  world.torches = torches;
  world.hideSpots = hideSpots;
  world.artifactSpots = artifactSpots;
  world.arrowSpots = arrowSpots;
  world.foodSpots = foodSpots;
  world.areas = AREAS;
  world.valleyCentre = valleyCentre;
  world.valleyHalfWidth = valleyHalfWidth;
  world.zEnd = Z_END;
  world.arena = new THREE.Vector3(arenaX, 0, arenaZ);
  world.dragonSpawn = new THREE.Vector3(arenaX, 0, arenaZ + 6);
  world.arenaTrigger = 252;

  /** Is a point inside a patch of cover? */
  world.inCover = (x, z) => {
    for (const h of hideSpots) {
      if (Math.hypot(x - h.x, z - h.z) <= h.radius) return true;
    }
    return false;
  };

  return world;
}
