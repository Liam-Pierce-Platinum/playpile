// LEVEL FOUR'S DIORAMAS, and the end of the game.
//
// Kept separate from cutsceneStage.js because this is where the story lands:
// the cliff, the black dragon, the collapse, the rock opening, the key, and
// what the kingdom looks like afterwards.
import * as THREE from 'three';
import { buildBlackDragon } from '../art/dragon.js';
import {
  makeConifer, makeBroadleaf, makePeak,
} from '../art/props.js';
import { faceted, smooth, tube, slab, cone, blob } from '../art/shapes.js';
import * as T from '../art/textures.js';
import {
  registerShots, stage, fire, horizon, poseSleeping, poseRoaring, rng,
} from './cutsceneStage.js';

const TAU = Math.PI * 2;

/**
 * THE GOLDEN KEY. Enormous, and shaped so it reads at a glance even at 240p:
 * a fat shaft, a ring you could stand inside, and three square teeth.
 */
export function buildGoldenKey(scale = 1) {
  const g = new THREE.Group();
  const gold = faceted(T.metalTex('#e8c14a'));
  const deep = faceted(T.metalTex('#a8842a'));

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const seg = slab(0.30, 0.66, 0.30, gold,
      [Math.cos(a) * 0.78, 1.55 + Math.sin(a) * 0.78, 0]);
    seg.rotation.z = a + Math.PI / 2;
    g.add(seg);
  }
  g.add(tube(0.20, 0.24, 2.1, gold, 6, [0, 0.45, 0]));
  g.add(blob(0.30, deep, [1, 0.5, 1], 6, 4, [0, 0.78, 0]));
  for (let i = 0; i < 3; i++) {
    g.add(slab(0.44 - i * 0.06, 0.26, 0.20, gold, [0.28, -0.35 - i * 0.34, 0]));
  }
  g.add(slab(0.24, 0.34, 0.22, gold, [0.20, -0.74, 0]));
  g.scale.setScalar(scale);
  return g;
}

const darkRock = () => faceted(T.cliffTex('#241e2e'));

/** A ring of black columns -- the dragon's shelf, in every shot that uses it. */
function shelfRing(root, n, seed, r = 28) {
  const rand = rng(seed);
  const mat = darkRock();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const h = 18 + rand() * 12;
    root.add(tube(2.6, 3.4, h, mat, 6,
      [Math.cos(a) * r, h / 2, -9 + Math.sin(a) * r]));
  }
}

registerShots({
  /** The last road: a ledge on a cliff face, climbing into a bad sky. */
  blackCliff(root, scene, cam) {
    stage(root, scene, {
      sky: '#2a2036', hemi: 0.85, key: 0.85, amb: 0.55,
      keyColor: '#b48fd0', keyAt: [-6, 15, -8], hemiSky: '#6a5488',
      ambColor: '#4a3a5e', groundTex: T.groundTex('#3a3344', '#4a4258'),
      fogNear: 20, fogFar: 150,
    });
    const rand = rng(4001);
    const rockMat = faceted(T.cliffTex('#372f42'));
    const ledgeMat = faceted(T.cliffTex('#4a4258'));

    // the cliff face going up and away
    for (let i = 0; i < 14; i++) {
      const h = 22 + i * 6;
      root.add(slab(18, h, 14, rockMat, [17 + i * 3.5, h / 2 - 6 + i * 2.6, -8 - i * 9]));
    }
    // the ledge itself, stepping up along it
    for (let i = 0; i < 11; i++) {
      root.add(slab(13, 1.4, 11, ledgeMat, [4 - i * 0.6, i * 2.6, 2 - i * 9]));
    }
    // the hanging houses, propped out over nothing
    const wallMat = faceted(T.cliffTex('#4a4258'));
    const roofMat = faceted(T.woodTex('#2e2434'));
    for (let i = 0; i < 4; i++) {
      const hut = new THREE.Group();
      hut.add(slab(4.4, 3, 4, wallMat, [0, 1.5, 0]));
      const rf = cone(3.6, 2.2, roofMat, 4, [0, 4.0, 0]);
      rf.rotation.y = Math.PI / 4;
      hut.add(rf);
      for (const dx of [-1.4, 1.4]) {
        const prop = tube(0.16, 0.20, 10, roofMat, 5, [dx, -4.8, -1.2]);
        prop.rotation.x = 0.16;
        hut.add(prop);
      }
      hut.position.set(-5 - rand() * 2, 1.4 + i * 2.6, -2 - i * 9);
      root.add(hut);
    }
    for (let i = 0; i < 5; i++) {
      fire(root, 2 - i * 0.6, i * 2.6 + 1.4, -1 - i * 9, 0.7, '#8a3fd0');
    }
    // and it is a very long way down
    for (let i = 0; i < 14; i++) {
      const pk = makePeak(22 + rand() * 16, 26 + rand() * 30, i, '#2c2438');
      pk.position.set(-74 + rand() * 60, -58, -40 - rand() * 70);
      root.add(pk);
    }

    return (t) => {
      cam.position.set(-15 + Math.sin(t * 0.16) * 2, 6 + t * 0.5, 23 - t * 0.7);
      cam.lookAt(6, 10 + t * 1.1, -34);
    };
  },

  /** It is on its shelf, and it has been awake the whole time. */
  sleepingBlack(root, scene, cam) {
    stage(root, scene, {
      sky: '#241b30', hemi: 0.8, key: 0.85, amb: 0.55,
      keyColor: '#a880c8', keyAt: [4, 14, 10], hemiSky: '#5e4a7a',
      ambColor: '#40324e', groundTex: T.groundTex('#3a3344', '#4a4258'),
      fogNear: 18, fogFar: 120,
    });
    shelfRing(root, 16, 777001, 30);
    root.add(tube(4.0, 6.2, 28, darkRock(), 6, [12, 14, -21]));

    const d = buildBlackDragon();
    d.root.position.set(0, 0, -9);
    d.root.rotation.y = 0.5;
    poseSleeping(d);
    root.add(d.root);
    for (const [x, z] of [[-17, 2], [17, 0], [0, -27]]) fire(root, x, 0, z, 1.3, '#8a3fd0');

    return (t) => {
      cam.position.set(-11 + t * 0.7, 5.6 - t * 0.08, 22 - t * 1.2);
      cam.lookAt(0, 3.4, -9);
      const breath = Math.sin(t * 0.6);
      d.torso.scale.set(1 + breath * 0.03, 1 + breath * 0.028, 1);
      d.neck.joints[0].rotation.x = 0.30 + breath * 0.04;
      // its head tracks you. it is not asleep, it is only waiting.
      d.head.rotation.y = Math.sin(t * 0.35) * 0.20;
    };
  },

  /** It stands up. */
  wakingBlack(root, scene, cam) {
    stage(root, scene, {
      sky: '#2a1c3a', hemi: 0.85, key: 0.95, amb: 0.6,
      keyColor: '#c79bff', keyAt: [0, 13, 12], hemiSky: '#6a4a90',
      ambColor: '#4a3560', groundTex: T.groundTex('#3a3344', '#4a4258'),
      fogNear: 16, fogFar: 110,
    });
    shelfRing(root, 14, 90210, 27);

    const d = buildBlackDragon();
    d.root.position.set(0, 0, -10);
    poseRoaring(d);
    root.add(d.root);
    const throat = fire(root, 0, 5.4, -4.8, 1.0, '#b070ff');

    return (t) => {
      cam.position.set(Math.sin(t * 0.42) * 4, 4.2 + t * 0.1, 18 - t * 0.45);
      cam.lookAt(0, 5.4, -10);
      d.jaw.rotation.x = 0.5 + Math.abs(Math.sin(t * 1.9)) * 0.32;
      for (const s of ['L', 'R']) {
        d.wings[s].rotation.z =
          d.wings[s].userData.side * (-1.35 + Math.sin(t * 2.4) * 0.36);
      }
      throat.scale.setScalar(0.8 + Math.abs(Math.sin(t * 1.9)) * 0.9);
    };
  },

  /** The collapse. It folds forward and stops. */
  blackFalls(root, scene, cam) {
    stage(root, scene, {
      sky: '#2a2036', hemi: 0.9, key: 1.0, amb: 0.6,
      keyColor: '#c9b0e0', keyAt: [6, 14, 10], hemiSky: '#6a5488',
      ambColor: '#4a3a5e', groundTex: T.groundTex('#3a3344', '#4a4258'),
      fogNear: 18, fogFar: 120,
    });
    shelfRing(root, 14, 31415, 28);

    const d = buildBlackDragon();
    d.root.position.set(0, 0, -10);
    poseRoaring(d);
    root.add(d.root);

    return (t) => {
      const k = Math.min(1, t / 4.0);
      const e = k * k * (3 - 2 * k);
      d.torso.rotation.x = -0.30 + e * 1.25;
      d.torso.position.y = 0.55 - e * 1.9;
      d.neck.joints.forEach((j, i) => { j.rotation.x = -0.30 + e * (0.55 + i * 0.24); });
      d.head.rotation.x = -0.35 + e * 0.95;
      d.jaw.rotation.x = 0.62 * (1 - e * 0.5);
      for (const s of ['L', 'R']) {
        const w = d.wings[s];
        w.rotation.z = w.userData.side * (-1.35 + e * 0.85);
        w.rotation.x = -0.25 + e * 0.7;
      }
      cam.position.set(-6 + t * 0.6, 5.5 - t * 0.25, 19 - t * 0.5);
      cam.lookAt(0, 3.6 - e * 2.0, -10);
    };
  },

  /** The rock opens and takes it. */
  blackSinks(root, scene, cam) {
    stage(root, scene, {
      sky: '#1e1428', hemi: 0.75, key: 0.8, amb: 0.55,
      keyColor: '#b070ff', keyAt: [0, 12, 8], hemiSky: '#5a3a80',
      ambColor: '#3e2c54', groundTex: T.groundTex('#3a3344', '#4a4258'),
      fogNear: 14, fogFar: 100,
    });
    shelfRing(root, 12, 2718, 26);

    const pit = new THREE.Mesh(new THREE.CircleGeometry(9, 8),
      new THREE.MeshBasicMaterial({ color: '#1a0820', fog: false }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(0, 0.06, -10);
    root.add(pit);
    const glow = new THREE.PointLight('#ff5a1e', 4.0, 44, 1.6);
    glow.position.set(0, 0.6, -10);
    root.add(glow);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      fire(root, Math.cos(a) * 7, 0, -10 + Math.sin(a) * 7, 1.1, '#ff6a2c');
    }

    const d = buildBlackDragon();
    d.root.position.set(0, 0, -10);
    d.root.rotation.set(0, 0.7, 0.3);
    poseSleeping(d);
    d.neck.joints.forEach((j, i) => { j.rotation.x = 0.55 + i * 0.22; j.rotation.y = -0.5; });
    root.add(d.root);

    return (t) => {
      d.root.position.y = -Math.min(9, t * 1.5);
      d.root.rotation.y = 0.7 + t * 0.10;
      glow.intensity = 4.0 * Math.max(0, 1 - t / 7);
      cam.position.set(-3 + t * 0.35, 8.0 + t * 0.3, 17 - t * 0.3);
      cam.lookAt(0, 1.0 - t * 0.2, -10);
    };
  },

  /** What it leaves lying on the shelf. */
  theKey(root, scene, cam) {
    stage(root, scene, {
      sky: '#2a2438', hemi: 0.9, key: 1.05, amb: 0.6,
      keyColor: '#ffe8a0', keyAt: [4, 12, 10], hemiSky: '#6a5c88',
      ambColor: '#4a4058', groundTex: T.groundTex('#3a3344', '#4a4258'),
      fogNear: 16, fogFar: 100,
    });
    shelfRing(root, 10, 1123, 22);

    const key = buildGoldenKey(1.4);
    key.position.set(0, 1.5, -6);
    key.rotation.set(0.1, 0.4, 0.08);
    root.add(key);
    const shine = new THREE.PointLight('#ffd76a', 3.4, 34, 1.8);
    shine.position.set(0, 2.6, -6);
    root.add(shine);

    return (t) => {
      key.rotation.y = 0.4 + t * 0.35;
      key.position.y = 1.5 + Math.sin(t * 1.1) * 0.18;
      shine.intensity = 3.0 + Math.sin(t * 2.4) * 0.6;
      cam.position.set(Math.sin(t * 0.3) * 3.5, 3.0, 10 - t * 0.35);
      cam.lookAt(0, 1.8, -6);
    };
  },

  /* ---------------- the land coming back ---------------- */

  /** The mine, open and worked again: lamps moving in the dark. */
  mineWorking(root, scene, cam) {
    stage(root, scene, {
      sky: '#241c16', hemi: 0.9, key: 0.75, amb: 0.6,
      keyColor: '#e0b070', keyAt: [4, 12, 10], hemiSky: '#8a6a48',
      ambColor: '#5a4634', groundTex: T.groundTex('#4a4038', '#5a4e42'),
      fogNear: 12, fogFar: 70,
    });
    const rand = rng(8080);
    const rock = faceted(T.cliffTex('#3f3a44'));
    const wood = smooth(T.woodTex('#4a3520'));
    // the pit head, propped and lit, with ore carts on the rails
    for (const sx of [-1, 1]) {
      root.add(tube(0.3, 0.36, 8, wood, 5, [sx * 3.6, 4, -8]));
      for (let i = 0; i < 5; i++) {
        root.add(tube(0.24, 0.30, 5.4, wood, 5, [sx * 7 - sx * i * 0.4, 2.7, 2 - i * 6]));
      }
    }
    root.add(slab(8.4, 0.5, 0.5, wood, [0, 8.2, -8]));
    for (let i = 0; i < 8; i++) {
      root.add(slab(5.2, 0.16, 0.4, wood, [0, 0.1, 3 - i * 3.2]));
    }
    for (let i = 0; i < 3; i++) {
      const cart = new THREE.Group();
      cart.add(slab(1.9, 1.0, 1.4, faceted(T.metalTex('#6a6068')), [0, 0.7, 0]));
      cart.add(blob(0.6, faceted(T.flatTex('#8a7a4a')), [1, 0.5, 1], 6, 4, [0, 1.25, 0]));
      cart.position.set(0, 0, -1 - i * 7);
      root.add(cart);
    }
    // and the lamps of a shift walking out
    const lamps = [];
    for (let i = 0; i < 7; i++) {
      const g = fire(root, -8 + rand() * 16, 1.3, -14 - rand() * 26, 0.35, '#ffc45a');
      lamps.push(g);
    }
    for (const [x, z] of [[-9, 2], [9, 1]]) fire(root, x, 0, z, 1.1, '#ff9a3c');

    return (t) => {
      cam.position.set(-4 + t * 0.5, 3.6, 15 - t * 0.6);
      cam.lookAt(0, 2.4, -10);
      // the shift coming up the drift toward you
      lamps.forEach((l, i) => { l.position.z += (0.9 + i * 0.12) * 0.016; });
    };
  },

  /** The mountain thawing: green under the ice again. */
  mountainThaws(root, scene, cam) {
    stage(root, scene, {
      sky: '#9fb8cc', hemi: 1.05, key: 1.3, amb: 0.55,
      keyColor: '#fff4e0', keyAt: [-8, 16, 6], hemiSky: '#dcecf8',
      ambColor: '#8fa4b8', groundTex: T.groundTex('#4a6b33', '#c8d8e4'),
      fogNear: 26, fogFar: 160,
    });
    const rand = rng(1212);
    // the peaks still white, the slopes coming back
    for (let i = 0; i < 7; i++) {
      const pk = makePeak(24 - i * 2.2, 22 + i * 9, (i * 9) | 0, i < 3 ? '#8fa0ac' : '#dce8f0');
      pk.position.set((rand() - 0.5) * 12, i * 3.4, -44 - i * 13);
      root.add(pk);
    }
    // the terraces, planted
    const wallMat = faceted(T.cliffTex('#7e8794'));
    for (let i = 0; i < 5; i++) {
      root.add(slab(62 - i * 8, 1.6, 7, wallMat, [0, 1.0 + i * 2.4, -14 - i * 9]));
      for (let k = 0; k < 9; k++) {
        const b = blob(0.5 + rand() * 0.3, smooth(T.leafTex('#5d8038')), [1, 0.8, 1], 6, 4,
          [-26 + i * 4 + k * 6 + rand() * 2, 2.2 + i * 2.4, -14 - i * 9]);
        root.add(b);
      }
    }
    // conifers with their colour back
    for (let i = 0; i < 20; i++) {
      const tr = makeConifer(9 + rand() * 5, i, { leaf: '#2c4a26' });
      tr.position.set(-42 + rand() * 84, 0, 2 - rand() * 24);
      root.add(tr);
    }
    return (t) => {
      cam.position.set(2 + Math.sin(t * 0.14) * 2, 3.2 + t * 0.5, 24 - t * 0.5);
      cam.lookAt(0, 6 + t * 1.5, -34);
    };
  },

  /** The cliff road, with its doors open and its lamps lit. */
  cliffLivedIn(root, scene, cam) {
    stage(root, scene, {
      sky: '#7a8ea8', hemi: 1.0, key: 1.2, amb: 0.55,
      keyColor: '#ffe8c0', keyAt: [-6, 15, -8], hemiSky: '#9fb4cc',
      ambColor: '#6a7488', groundTex: T.groundTex('#5a5548', '#6b6454'),
      fogNear: 24, fogFar: 150,
    });
    const rand = rng(3131);
    const rock2 = faceted(T.cliffTex('#6a6058'));
    const ledgeMat = faceted(T.cliffTex('#7a7264'));
    for (let i = 0; i < 14; i++) {
      const h = 22 + i * 6;
      root.add(slab(18, h, 14, rock2, [17 + i * 3.5, h / 2 - 6 + i * 2.6, -8 - i * 9]));
    }
    for (let i = 0; i < 11; i++) {
      root.add(slab(13, 1.4, 11, ledgeMat, [4 - i * 0.6, i * 2.6, 2 - i * 9]));
    }
    const wallMat = faceted(T.cliffTex('#8a7a5c'));
    const roofMat = faceted(T.woodTex('#6a4a2c'));
    for (let i = 0; i < 5; i++) {
      const hut = new THREE.Group();
      hut.add(slab(4.4, 3, 4, wallMat, [0, 1.5, 0]));
      const rf = cone(3.6, 2.2, roofMat, 4, [0, 4.0, 0]);
      rf.rotation.y = Math.PI / 4;
      hut.add(rf);
      for (const dx of [-1.4, 1.4]) {
        const prop = tube(0.16, 0.20, 10, roofMat, 5, [dx, -4.8, -1.2]);
        prop.rotation.x = 0.16;
        hut.add(prop);
      }
      hut.position.set(-5 - rand() * 2, 1.4 + i * 2.6, -2 - i * 9);
      root.add(hut);
      fire(root, -5 - rand() * 2 + 1.2, 5.6 + i * 2.6, -2 - i * 9, 0.4, '#cfc6ad');
    }
    for (let i = 0; i < 6; i++) {
      fire(root, 2 - i * 0.6, i * 2.6 + 1.4, -1 - i * 9, 0.55, '#ffb43c');
    }
    return (t) => {
      cam.position.set(-15 + Math.sin(t * 0.16) * 2, 6 + t * 0.45, 23 - t * 0.6);
      cam.lookAt(6, 10 + t * 1.0, -34);
    };
  },

  /** And afterwards: the kingdom, with people back in it. */
  kingdomReturns(root, scene, cam) {
    stage(root, scene, {
      sky: '#5f6f56', hemi: 1.05, key: 1.35, amb: 0.5,
      keyColor: '#fff2d0', keyAt: [6, 14, 8], hemiSky: '#8fae72',
      ambColor: '#4a5a44', groundTex: T.groundTex('#3d5a2a', '#4a6b33'),
      fogNear: 24, fogFar: 160,
    });
    horizon(root, 606, '#3a4a38', 100);
    const rand = rng(555);

    for (let i = 0; i < 22; i++) {
      const tr = i % 3 === 0
        ? makeConifer(12 + rand() * 5, i)
        : makeBroadleaf(12 + rand() * 6, i);
      tr.position.set(-42 + rand() * 84, 0, -20 - rand() * 34);
      root.add(tr);
    }
    const wallMat = faceted(T.cliffTex('#8a7a5c'));
    const roofMat = faceted(T.woodTex('#6a4a2c'));
    for (let i = 0; i < 5; i++) {
      const x = -17 + i * 8.5 + rand() * 2, z = -9 - rand() * 10;
      const hut = new THREE.Group();
      hut.add(slab(4.6, 3, 4.2, wallMat, [0, 1.5, 0]));
      const rf = cone(3.8, 2.2, roofMat, 4, [0, 4.0, 0]);
      rf.rotation.y = Math.PI / 4;
      hut.add(rf);
      hut.position.set(x, 0, z);
      root.add(hut);
      // smoke, which is the whole point of the shot
      fire(root, x + 1.2, 4.3, z, 0.45, '#cfc6ad');
    }
    for (const [x, z] of [[-6, 4], [8, 6]]) fire(root, x, 0, z, 1.0);

    return (t) => {
      cam.position.set(-6 + t * 0.5, 3.4 + t * 0.12, 17 - t * 0.5);
      cam.lookAt(0, 2.6, -11);
    };
  },
});
