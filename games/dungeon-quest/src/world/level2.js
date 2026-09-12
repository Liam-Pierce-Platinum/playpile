// LEVEL 2 -- THE MINE SHAFT
//
// A GRID, not a corridor. Rooms on a lattice joined by tunnels, most of them
// dead ends, and the dragon's chamber is somewhere in it. You have to search.
// Boulders are scattered through every room because the Red Dragon strafes
// from the air and cover is the only answer to that.
import * as THREE from 'three';
import { World } from './world.js';
import { smooth, faceted, tube, slab, cone, blob } from '../art/shapes.js';
import * as T from '../art/textures.js';
import {
  makeBoulder, makeChest, makeShopStall, makeTorch, makeSign, makeShrine,
  makeTavern, makeMirror, makeCampfire, makeTent, makeTallGrass,
} from '../art/props.js';

/* ---------------- grid ---------------- */

const CELL = 34;            // room pitch
const COLS = 5;
const ROWS = 6;
const ROOM = 13;            // half-size of a room's open floor
const HALL = 3.6;           // half-width of a connecting tunnel
const WALL_H = 7;
const ROOF_Y = 5.6;         // tunnels and rooms -- deliberately claustrophobic
const HALL_ROOF_Y = 26;     // the great hall has to fit a dragon in the air

/** Room centre in world space. */
function cellPos(c, r) {
  return { x: (c - (COLS - 1) / 2) * CELL, z: r * CELL };
}

/**
 * The map. `1` is a room that exists; the layout is deliberately irregular so
 * it does not read as a chessboard, and it has real dead ends.
 */
const MAP = [
  [0, 1, 1, 1, 0],
  [1, 1, 0, 1, 1],
  [1, 0, 1, 1, 0],
  [1, 1, 1, 0, 1],
  [0, 1, 0, 1, 1],
  [0, 1, 1, 1, 0],
];
const has = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && MAP[r][c] === 1;

export const AREAS = [
  { id: 'entry', name: 'THE PIT HEAD', z: [-20, 20], safe: true },
  { id: 'upper', name: 'UPPER GALLERIES', z: [20, 70] },
  { id: 'mid', name: 'THE DEEP CUTTINGS', z: [70, 120] },
  { id: 'lower', name: 'THE FLOODED LEVEL', z: [120, 170] },
  { id: 'hall', name: 'THE GREAT HALL', z: [170, 230] },
];

export function buildLevel2(scene) {
  const world = new World(scene);
  let seed = 90210;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /* ---------------- underground light ---------------- */
  const SKY = new THREE.Color('#140f0c');
  scene.background = SKY;
  // fogFar has to clear the great hall's 60m span, or the far wall of the
  // chamber is pure fog and the room reads as a void instead of as a room.
  scene.fog = new THREE.Fog(SKY, 16, 88);

  // Warm lamp-lit rock, not moonlight. The mine has to stay legible enough to
  // fight in, so it reads dim through colour and fog rather than exposure.
  const hemi = new THREE.HemisphereLight('#7a6448', '#241c18', 0.95);
  world.root.add(hemi);
  const sun = new THREE.DirectionalLight('#c09a68', 0.62);
  sun.position.set(4, 14, -4);
  world.root.add(sun);
  const bounce = new THREE.DirectionalLight('#4a5a78', 0.28);
  bounce.position.set(-6, 5, 6);
  world.root.add(bounce);
  const ambient = new THREE.AmbientLight('#4a3e34', 0.62);
  world.root.add(ambient);
  world.lights = { hemi, sun, bounce, ambient, skyColor: SKY.clone() };
  // Underground "day": what setNight(false) restores, so the mine is never
  // repainted with the outdoor moonlight preset.
  world.lights.base = {
    hemi: 0.95, sun: 0.62, bounce: 0.28, ambient: 0.62,
    sunColor: '#c09a68', sky: SKY.clone(), fogNear: 16, fogFar: 88,
  };

  /* ---------------- floor ---------------- */
  const floorTex = T.groundTex('#4a4038', '#5a4e42');
  floorTex.repeat.set(40, 56);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS * CELL + 60, ROWS * CELL + 90),
    smooth(floorTex)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (ROWS - 1) * CELL / 2 - 10);
  world.root.add(floor);
  world.colliders.push(floor);

  /* ---------------- roof ----------------
   * A mine has a ceiling, and a low one. It stops just short of the great
   * hall so the chamber opens up over your head when you finally reach it --
   * which is also the only way the Red Dragon has anywhere to fly.
   */
  const roofTex = T.cliffTex('#332e34');
  roofTex.repeat.set(18, 26);
  const roofSplit = (ROWS - 1) * CELL + 26 - 30 - 4;   // hallZ - HALL_R - 4
  const roofDepth = roofSplit + 30;
  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS * CELL + 60, roofDepth),
    smooth(roofTex)
  );
  roof.rotation.x = Math.PI / 2;                        // facing down
  roof.position.set(0, ROOF_Y, roofSplit - roofDepth / 2 + 4);
  world.root.add(roof);

  const hallRoofTex = T.cliffTex('#4a4048');
  hallRoofTex.repeat.set(10, 10);
  const hallRoof = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), faceted(hallRoofTex));
  hallRoof.rotation.x = Math.PI / 2;
  hallRoof.position.set(0, HALL_ROOF_Y, (ROWS - 1) * CELL + 26);
  world.root.add(hallRoof);

  // A ceiling faces DOWN, so the sun overhead lands on its back and it renders
  // as pure black -- which makes a tall vault look like no vault at all. This
  // uplight is the only thing that makes the height readable.
  const uplight = new THREE.DirectionalLight('#6a5a4c', 0.55);
  uplight.position.set(0, -1, 0.2);
  uplight.target.position.set(0, 1, 0);
  world.root.add(uplight);
  world.root.add(uplight.target);

  const rockMat = faceted(T.cliffTex('#3f3a44'));
  const propMat = faceted(T.cliffTex('#4a444e'));
  const torches = [];
  const boulders = [];
  const hideSpots = [];

  /** Is a point inside any room or hall? Everything else is solid rock. */
  const open = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!has(c, r)) continue;
      const p = cellPos(c, r);
      open.push({ minX: p.x - ROOM, maxX: p.x + ROOM, minZ: p.z - ROOM, maxZ: p.z + ROOM });
      if (has(c + 1, r)) {
        const q = cellPos(c + 1, r);
        open.push({ minX: p.x, maxX: q.x, minZ: p.z - HALL, maxZ: p.z + HALL });
      }
      if (has(c, r + 1)) {
        const q = cellPos(c, r + 1);
        open.push({ minX: p.x - HALL, maxX: p.x + HALL, minZ: p.z, maxZ: q.z });
      }
    }
  }
  // the entry passage from the pit head into the first room
  const first = cellPos(1, 0);
  open.push({ minX: first.x - HALL, maxX: first.x + HALL, minZ: -22, maxZ: first.z });
  open.push({ minX: first.x - 9, maxX: first.x + 9, minZ: -22, maxZ: -8 });

  // The great hall and its approach must be declared BEFORE the walls are
  // generated, or the wall pass fills the boss chamber with solid rock.
  const hallZ = (ROWS - 1) * CELL + 26;
  const hallX = 0;
  const HALL_R = 30;
  const lastCell = (() => {
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) if (has(c, r)) return { c, r, ...cellPos(c, r) };
    }
    return { c: 1, r: 0, ...cellPos(1, 0) };
  })();
  open.push({
    minX: hallX - HALL_R, maxX: hallX + HALL_R,
    minZ: hallZ - HALL_R, maxZ: hallZ + HALL_R,
  });
  open.push({
    minX: Math.min(lastCell.x, hallX) - HALL, maxX: Math.max(lastCell.x, hallX) + HALL,
    minZ: lastCell.z, maxZ: hallZ - HALL_R + 4,
  });

  function isOpen(x, z, pad = 0) {
    for (const o of open) {
      if (x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad) {
        return true;
      }
    }
    return false;
  }
  world.isOpen = isOpen;

  /* ---------------- rock walls ----------------
   * Built by walking a fine grid and filling every square that is NOT open.
   * That gives real tunnels with real dead ends for free.
   */
  const STEP = 4.2;
  const minX = -(COLS * CELL) / 2 - 24, maxX = (COLS * CELL) / 2 + 24;
  const minZ = -26, maxZ = (ROWS - 1) * CELL + 40;
  for (let x = minX; x <= maxX; x += STEP) {
    for (let z = minZ; z <= maxZ; z += STEP) {
      if (isOpen(x, z, 1.2)) continue;
      // only draw rock that actually borders open space -- the rest is unseen
      const nearOpen = isOpen(x, z, STEP * 1.9);
      const h = WALL_H + rand() * 4;
      if (nearOpen) {
        const m = blob(STEP * 0.85, rockMat, [1, h / (STEP * 1.7), 1], 6, 4,
          [x + (rand() - 0.5), h * 0.34, z + (rand() - 0.5)]);
        world.root.add(m);
        world.colliders.push(m);
      }
      world.addWall(x - STEP / 2, z - STEP / 2, x + STEP / 2, z + STEP / 2, WALL_H + 6);
    }
  }

  /* ---------------- room dressing ---------------- */
  const rooms = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!has(c, r)) continue;
      const p = cellPos(c, r);
      rooms.push({ c, r, x: p.x, z: p.z });

      // pit props: support timbers at the corners
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = p.x + sx * (ROOM - 2.2), pz = p.z + sz * (ROOM - 2.2);
        const post = tube(0.24, 0.30, 5.4, smooth(T.woodTex('#4a3520')), 5, [px, 2.7, pz]);
        world.placeRound(post, 0.28, 5.4, { walkable: false });
        const beam = slab(1.6, 0.34, 0.34, smooth(T.woodTex('#3f2c1c')), [px, 5.3, pz]);
        world.decorate(beam);
      }

      // BOULDERS -- the cover the dragon fight is built around
      const n = 3 + ((rand() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const rr = 4 + rand() * (ROOM - 6);
        const bx = p.x + Math.cos(a) * rr, bz = p.z + Math.sin(a) * rr;
        const size = 1.5 + rand() * 1.2;
        const b = makeBoulder(size, (c * 71 + r * 13 + i) | 0, '#5a5460');
        b.position.set(bx, 0, bz);
        world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
        boulders.push({ x: bx, z: bz, r: size });
        // standing next to a rock counts as cover from above
        hideSpots.push({ x: bx, z: bz, radius: size + 1.6 });
      }

      // a torch or two so rooms read at a distance
      if (rand() < 0.85) {
        const t = makeTorch();
        t.position.set(p.x + (rand() - 0.5) * 14, 0, p.z - ROOM + 1.6);
        world.decorate(t);
        torches.push(t);
      }
    }
  }

  /* ---------------- landmarks ---------------- */
  const entry = { x: first.x, z: -14 };

  const stall = makeShopStall('#3a3350', '#c8bda0');
  stall.position.set(entry.x + 6.5, 0, -13);
  stall.rotation.y = -0.6;
  world.place(stall, { walkable: false, shrink: 0.3 });
  const shops = [{ x: entry.x + 6.5, z: -11.6 }];

  for (const [tx, tz] of [[entry.x - 5, -16], [entry.x + 5, -6]]) {
    const t = makeTorch();
    t.position.set(tx, 0, tz);
    world.decorate(t);
    torches.push(t);
  }
  const sign = makeSign();
  sign.position.set(entry.x - 3.4, 0, -6);
  world.decorate(sign);

  // a tavern dug into one of the mid galleries
  const tavRoom = rooms.find(rm => rm.r === 2) || rooms[0];
  const tav = makeTavern();
  tav.position.set(tavRoom.x - 5, 0, tavRoom.z + 5);
  tav.rotation.y = 0.4;
  world.place(tav, { walkable: false, shrink: 0.3 });
  const taverns = [{ id: 'deeps', name: 'THE DRIFT', x: tavRoom.x - 5, z: tavRoom.z + 8.6 }];
  // and its mirror, propped against the gallery wall beside the door
  const mir = makeMirror();
  mir.position.set(tavRoom.x - 9, 0, tavRoom.z + 7.4);
  mir.rotation.y = -0.5;
  world.placeRound(mir, 0.55, 2.0, { walkable: false });
  const mirrors = [{ id: 'deeps', x: tavRoom.x - 9, z: tavRoom.z + 8.4 }];

  // checkpoints in a handful of rooms
  const checkpoints = [];
  function addCheckpoint(id, name, rm, dx = 0, dz = 0) {
    const shrine = makeShrine();
    shrine.position.set(rm.x + dx, 0, rm.z + dz);
    world.placeRound(shrine, 0.7, 1.6, { walkable: false });
    checkpoints.push({
      id, name, x: rm.x + dx, z: rm.z + dz, mesh: shrine,
      flame: shrine.userData.flame, light: shrine.userData.light, claimed: false,
    });
  }
  // Three in total: the pit head, one in the middle of the grid, and the one
  // at the mouth of the great hall added further down.
  // No shrine at the mouth: you start there, so banking it means nothing,
  // and dying before the first real one should send you back to the start.
  const midRoom = rooms[Math.floor(rooms.length / 2)];
  if (midRoom) addCheckpoint('deep', AREAS[2].name, midRoom, 5, -5);

  /* ---------------- the great hall ---------------- */
  // A single huge chamber past the grid: room to fly, and rocks to hide behind.
  // Its open footprint was declared with the grid, above.
  const lastRoom = rooms[rooms.length - 1];

  // The rim columns run the FULL height of the vault. Without something
  // climbing all the way to it, a 26m ceiling reads exactly like a 6m one --
  // you need a vertical to measure it against.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const h = HALL_ROOF_Y + 2;
    const col = tube(2.6, 3.4, h, rockMat, 6,
      [hallX + Math.cos(a) * (HALL_R + 3), h / 2, hallZ + Math.sin(a) * (HALL_R + 3)]);
    world.decorate(col);
  }
  // and a second, taller ring set back behind them, so the wall reads as rock
  // going up rather than as a row of posts standing in the dark
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 0.16;
    const h = HALL_ROOF_Y + 6;
    const col = tube(4.2, 5.4, h, rockMat, 6,
      [hallX + Math.cos(a) * (HALL_R + 9), h / 2, hallZ + Math.sin(a) * (HALL_R + 9)]);
    world.decorate(col);
  }
  // cover inside the arena -- this is what makes the strafing run survivable
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.4;
    const rr = 10 + (i % 3) * 6;
    const bx = hallX + Math.cos(a) * rr, bz = hallZ + Math.sin(a) * rr;
    const size = 2.0 + (i % 3) * 0.5;
    const b = makeBoulder(size, i * 37 + 5, '#5a5460');
    b.position.set(bx, 0, bz);
    world.placeRound(b, size * 0.78, size * 1.2, { walkable: true });
    boulders.push({ x: bx, z: bz, r: size });
    hideSpots.push({ x: bx, z: bz, radius: size + 2.0 });
  }
  // Twelve torches, and they throw much further than the ones in the tunnels.
  // A 9m pool of light in a 60m chamber lights nothing at all.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = makeTorch();
    t.position.set(hallX + Math.cos(a) * (HALL_R - 3), 0, hallZ + Math.sin(a) * (HALL_R - 3));
    if (t.userData.light) {
      t.userData.light.distance = 34;
      t.userData.light.intensity = 2.4;
    }
    world.decorate(t);
    torches.push(t);
  }

  // One lamp hung high in the vault. This is what actually shows you the roof
  // is 26m up rather than 6 -- the columns catch it all the way to the top.
  const vault = new THREE.PointLight('#b08050', 2.2, 130, 1.3);
  vault.position.set(hallX, HALL_ROOF_Y - 3, hallZ);
  world.root.add(vault);
  const vaultFloor = new THREE.PointLight('#8a6a48', 1.5, 90, 1.5);
  vaultFloor.position.set(hallX, 6, hallZ);
  world.root.add(vaultFloor);
  addCheckpoint('hallgate', 'THE GREAT HALL', { x: hallX, z: hallZ - HALL_R - 4 }, 4);

  /* ---------------- chests, pickups, spawns ---------------- */
  const chests = [];
  rooms.forEach((rm, i) => {
    if (i % 2) return;
    const c = makeChest();
    c.position.set(rm.x + (rand() - 0.5) * 12, 0, rm.z + (rand() - 0.5) * 12);
    c.rotation.y = rand() * Math.PI * 2;
    world.place(c, { walkable: false, shrink: 0.1 });
    chests.push({ mesh: c, lid: c.userData.lid, opened: false, position: c.position });
  });

  const spawns = [];
  const MOBS = ['goblin', 'goblin', 'skeleton', 'zombie', 'goblin', 'crossbowSkeleton'];
  rooms.forEach((rm, i) => {
    if (rm.r === 0 && rm.c === 1) return;             // leave the entry room clear
    const n = 2 + ((rand() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const rr = 3 + rand() * (ROOM - 5);
      spawns.push({
        kind: MOBS[(rand() * MOBS.length) | 0],
        x: rm.x + Math.cos(a) * rr, z: rm.z + Math.sin(a) * rr,
        camp: 'room' + i,
      });
    }
    // one leader per few rooms
    if (i % 3 === 1) {
      spawns.push({
        kind: i % 2 ? 'rockGolem' : 'goblinGeneral',
        x: rm.x, z: rm.z, camp: 'room' + i,
      });
    }
  });
  spawns.push({ kind: 'corruptedKnight', x: lastRoom.x, z: lastRoom.z - 6, camp: 'lastRoom' });

  const campDefs = rooms.map((rm, i) => ({ id: 'room' + i, x: rm.x, z: rm.z, radius: ROOM }));
  campDefs.push({ id: 'lastRoom', x: lastRoom.x, z: lastRoom.z, radius: ROOM });

  const artifactSpots = [];
  const deadEnds = rooms.filter(rm => {
    let n = 0;
    if (has(rm.c + 1, rm.r)) n++;
    if (has(rm.c - 1, rm.r)) n++;
    if (has(rm.c, rm.r + 1)) n++;
    if (has(rm.c, rm.r - 1)) n++;
    return n <= 1;
  });
  const RELICS = ['emberShard', 'mossCharm', 'thiefsCoin', 'owlFeather', 'ironBand', 'hollowIdol'];
  deadEnds.forEach((rm, i) => {
    if (i >= RELICS.length) return;
    artifactSpots.push({ id: RELICS[i], x: rm.x + 6, z: rm.z + 6 });
  });

  const arrowSpots = rooms.filter((_, i) => i % 2 === 1)
    .map(rm => ({ x: rm.x - 5, z: rm.z + 4, n: 5 }));
  const foodSpots = rooms.filter((_, i) => i % 3 === 0)
    .map((rm, i) => ({ kind: i % 2 ? 'meat' : 'bread', x: rm.x + 4, z: rm.z - 5 }));

  /* ---------------- exports ---------------- */
  world.spawn = new THREE.Vector3(entry.x, 0, -16);
  world.shops = shops;
  world.shopPosition = new THREE.Vector3(shops[0].x, 0, shops[0].z);
  world.taverns = taverns;
  world.mirrors = mirrors;
  // What the bought map draws. Worth 300 coin precisely because the grid is
  // a maze of dead ends and nothing marks the dragon's chamber.
  world.mapData = {
    kind: 'grid',
    cell: CELL, cols: COLS, rows: ROWS, room: ROOM, grid: MAP,
    cellPos,
    entry: { x: entry.x, z: -16 },
    arena: { x: hallX, z: hallZ, r: HALL_R },
  };

  // Miners, back at the face. One crew per room that had a camp in it.
  world.peaceSpots = rooms.map((rm, i) => ({
    x: rm.x + ((i % 3) - 1) * 4, z: rm.z + ((i % 2) ? 4 : -4), roam: 4.5,
  }));
  world.checkpoints = checkpoints;
  world.chests = chests;
  world.enemySpawns = spawns;
  world.campDefs = campDefs;
  world.campfires = [];
  world.torches = torches;
  world.hideSpots = hideSpots;
  world.artifactSpots = artifactSpots;
  world.arrowSpots = arrowSpots;
  world.foodSpots = foodSpots;
  world.areas = AREAS;
  world.rooms = rooms;
  world.boulders = boulders;
  world.zEnd = hallZ + HALL_R;
  world.arena = new THREE.Vector3(hallX, 0, hallZ);
  world.dragonSpawn = new THREE.Vector3(hallX, 0, hallZ + 8);
  world.arenaTrigger = hallZ - HALL_R + 6;
  // the grid has no single centre line; keep these so shared code still works
  world.valleyCentre = () => 0;
  world.valleyHalfWidth = () => COLS * CELL;

  world.inCover = (x, z) => {
    for (const h of hideSpots) {
      if (Math.hypot(x - h.x, z - h.z) <= h.radius) return true;
    }
    return false;
  };

  return world;
}
