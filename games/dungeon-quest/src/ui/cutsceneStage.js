// CUTSCENE DIORAMAS.
//
// A cutscene used to be words over whatever the game happened to be rendering.
// This gives each beat a real staged shot instead: the dragon asleep on its
// hoard, the kingdom burning, the hero alone at the last fire. Each shot is a
// scene of its own with its own lights and a slow camera move, rendered
// through the same N64 pipeline as the game so it never looks like a menu.
import * as THREE from 'three';
import {
  buildGreenDragon, buildRedDragon, buildIceDragon,
} from '../art/dragon.js';
import { buildCharacter } from '../art/characters.js';
import {
  makeBroadleaf, makeConifer, makeSnag, makeBoulder, makeCliffChunk, makePeak,
  makeCampfire, makeTorch, makeCairn, makeChest, makeCoin,
} from '../art/props.js';
import { smooth, faceted, tube, slab, cone, blob, ball } from '../art/shapes.js';
import * as T from '../art/textures.js';

const TAU = Math.PI * 2;

/** Deterministic per-shot noise, so a shot looks the same every time you see it. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export class CutsceneStage {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 400);
    this.root = null;
    this.shot = null;
    this.t = 0;
    this.anim = null;
  }

  get active() { return !!this.shot; }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    if (this.root) {
      this.root.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          const m = o.material;
          if (Array.isArray(m)) m.forEach(x => x.dispose?.());
          else m?.dispose?.();
        }
      });
      this.scene.remove(this.root);
    }
    this.root = null;
    this.shot = null;
    this.anim = null;
  }

  /** Build a named shot. An unknown name simply clears the stage. */
  setShot(name) {
    if (name === this.shot) return;
    this.clear();
    if (!name) return;
    const build = SHOTS[name];
    if (!build) return;
    this.shot = name;
    this.t = 0;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.anim = build(this.root, this.scene, this.camera) || null;
  }

  update(dt) {
    if (!this.root) return;
    this.t += dt;
    // every fire in the shot flickers and scrolls, wherever it was placed
    this.root.traverse((o) => {
      if (!o.userData.isFire) return;
      const f = 0.82 + Math.sin(this.t * 17 + o.position.x) * 0.18;
      o.userData.light.intensity = o.userData.baseIntensity * f;
      o.children.forEach((c) => {
        if (c.userData.scroll && c.material.map) {
          c.material.map.offset.y -= c.userData.scroll * dt;
        }
        if (c.userData.spin) c.rotation.y += c.userData.spin * dt;
      });
    });
    this.anim?.(this.t, dt);
  }
}

/* ---------------- shared staging ---------------- */

/** Ground, sky and lights: the floor every shot stands on. */
export function stage(root, scene, opts = {}) {
  // Every shot is authored in a near-black key, and fog blends TOWARDS the
  // sky colour -- so a near-black sky quietly turned each diorama into a
  // silhouette at twenty metres. Lift the sky, keep the hue.
  const sky = new THREE.Color(opts.sky || '#0d1014');
  sky.lerp(new THREE.Color('#6a6270'), 0.42);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, opts.fogNear ?? 12, (opts.fogFar ?? 90) * 1.5);

  const groundTex = opts.groundTex || T.groundTex('#2c3524', '#37402a');
  groundTex.repeat.set(opts.tile ?? 20, opts.tile ?? 20);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), smooth(groundTex));
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // A cutscene is READ, not fought in, so it is lit brighter than the level it
  // depicts. The N64 pass quantises to 5 bits per channel and the bottom of
  // that range collapses to black -- moody lighting simply disappears.
  const B = 2.6;
  root.add(new THREE.HemisphereLight(opts.hemiSky || '#4a5568',
    opts.hemiGround || '#26262a', (opts.hemi ?? 0.8) * B));
  const key = new THREE.DirectionalLight(opts.keyColor || '#cbb089', (opts.key ?? 0.9) * B);
  key.position.set(...(opts.keyAt || [6, 12, 8]));
  root.add(key);
  // a cold back light so silhouettes separate from the sky
  const rim = new THREE.DirectionalLight(opts.rimColor || '#6a7fa8', (opts.rim ?? 0.5) * B);
  rim.position.set(...(opts.rimAt || [-8, 9, -14]));
  root.add(rim);
  root.add(new THREE.AmbientLight(opts.ambColor || '#3a3c48', (opts.amb ?? 0.5) * B));
}

/** A flickering fire: a few stacked cones plus the light they throw. */
export function fire(root, x, y, z, scale = 1, color = '#ff9a3c') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  // Layered ragged tongues, additively blended and scrolling -- a plain cone
  // reads as a traffic cone, which is exactly what the first version looked
  // like. Three of these stacked is the cheapest thing that reads as flame.
  const tints = [['#ffe8a0', color], [color, '#ffb43c'], ['#fff4c8', '#ffd07a']];
  for (let i = 0; i < 3; i++) {
    const tex = T.fireTex(tints[i][0], tints[i][1], color).clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1.5);
    const m = new THREE.MeshBasicMaterial({
      map: tex, fog: false, transparent: true, opacity: 0.42 + i * 0.16,
      depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const c = cone(0.46 * scale * (1 - i * 0.24), 1.5 * scale * (1 - i * 0.16),
      m, 6, [0, 0.75 * scale, 0]);
    c.userData.scroll = 2.2 + i * 1.4;
    c.userData.spin = (i % 2 ? 1 : -1) * (1.1 + i * 0.5);
    g.add(c);
  }
  const light = new THREE.PointLight(color, 4.2 * scale, 34 * scale, 1.5);
  light.position.y = 1.0 * scale;
  g.add(light);
  g.userData.light = light;
  g.userData.baseIntensity = light.intensity;
  g.userData.isFire = true;
  root.add(g);
  return g;
}

/** A ring of dark peaks, so the horizon is never just fog. */
export function horizon(root, seed, color = '#2a2f38', r = 96) {
  const rand = rng(seed);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + rand() * 0.2;
    const h = 26 + rand() * 34;
    const p = makePeak(15 + rand() * 12, h, (seed + i) | 0, color);
    p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    root.add(p);
  }
}

/** Flat on its belly, coiled, head down: asleep. */
export function poseSleeping(d) {
  d.torso.position.y -= 0.42;
  d.torso.rotation.x = 0.10;
  d.neck.joints.forEach((j, i) => {
    j.rotation.x = 0.30 + i * 0.16;
    j.rotation.y = -0.24;
  });
  d.head.rotation.x = 0.55;
  d.jaw.rotation.x = 0.04;
  d.tail.joints.forEach((j, i) => { j.rotation.y = 0.26 + i * 0.05; });
  for (const s of ['L', 'R']) {
    const w = d.wings[s];
    w.rotation.set(0.32, w.userData.rest.y * 1.25, w.userData.rest.z * 1.3);
  }
}

/** Reared up, wings out, jaw open. */
export function poseRoaring(d) {
  d.torso.rotation.x = -0.30;
  d.torso.position.y += 0.55;
  d.neck.joints.forEach((j, i) => { j.rotation.x = -0.30 + i * 0.05; });
  d.head.rotation.x = -0.35;
  d.jaw.rotation.x = 0.62;
  d.tail.joints.forEach((j, i) => { j.rotation.y = Math.sin(i * 0.9) * 0.28; });
  for (const s of ['L', 'R']) {
    const w = d.wings[s];
    w.rotation.set(-0.25, w.userData.side * -0.10, w.userData.side * -1.35);
  }
}

/** Swap a built dragon's hide colours. Horns, teeth and eyes are left alone. */
const HIDE_KEYS = ['#3f6b2e', '#2e5222', '#35502a'];
function recolour(root, hide, belly, membrane) {
  const map = { '#3f6b2e': hide, '#2e5222': belly, '#35502a': membrane || hide };
  root.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.map) return;
    const src = o.material.map.sourceColor;
    if (!src || !HIDE_KEYS.includes(src)) return;
    o.material = o.material.clone();
    o.material.map = T.leafTex(map[src]);
    o.material.needsUpdate = true;
  });
}

/* ---------------- the shots ---------------- */

const SHOTS = {
  /** The black dragon on the ridge, the lesser dragons bowed in around it. */
  gathering(root, scene, cam) {
    stage(root, scene, {
      sky: '#160d10', hemi: 0.5, key: 0.55, amb: 0.4,
      keyColor: '#a05a3c', keyAt: [-8, 14, -10],
      hemiSky: '#4a2a2a', ambColor: '#301c22',
      groundTex: T.groundTex('#2a2420', '#332b25'), fogNear: 16, fogFar: 130,
    });
    horizon(root, 7, '#20161a', 104);

    const rise = makeCliffChunk(30, 6, 22, 3, '#241c22');
    rise.position.set(0, 0, -20);
    root.add(rise);

    const black = buildGreenDragon();
    recolour(black.root, '#211b28', '#2e2636', '#191420');
    black.root.scale.multiplyScalar(1.55);
    black.root.position.set(0, 6, -20);
    poseRoaring(black);
    root.add(black.root);

    const lessers = [];
    const spec = [[-15, 0.55, '#3f6b2e'], [15, -0.55, '#8a2f22'], [-2, 0.12, '#2a4a72']];
    spec.forEach(([x, ry, col], i) => {
      const d = buildGreenDragon();
      recolour(d.root, col, col, col);
      d.root.scale.multiplyScalar(0.85);
      d.root.position.set(x, 0, 2 + i * 4);
      d.root.rotation.y = Math.PI + ry;
      poseSleeping(d);
      d.neck.joints.forEach((j, k) => { j.rotation.x = 0.55 + k * 0.12; });
      root.add(d.root);
      lessers.push(d);
    });

    for (const [x, z] of [[-26, 14], [24, 18], [-8, 26], [32, 4]]) {
      fire(root, x, 0, z, 1.7, '#ff6a2c');
    }

    return (t) => {
      cam.position.set(Math.sin(t * 0.09) * 7, 9.5, 34 - t * 1.0);
      cam.lookAt(0, 8.5, -18);
      black.jaw.rotation.x = 0.5 + Math.sin(t * 1.6) * 0.16;
      for (const s of ['L', 'R']) {
        black.wings[s].rotation.z =
          black.wings[s].userData.side * (-1.35 + Math.sin(t * 0.9) * 0.16);
      }
      lessers.forEach((d, i) => {
        d.neck.joints[0].rotation.x = 0.55 + Math.sin(t * 0.7 + i) * 0.05;
      });
    };
  },

  /** The kingdom burning, a dragon crossing low over the rooftops. */
  burning(root, scene, cam) {
    stage(root, scene, {
      sky: '#1d0f0a', hemi: 0.55, key: 0.5, amb: 0.45,
      keyColor: '#c2542a', keyAt: [4, 10, 12], hemiSky: '#6a2f1e',
      ambColor: '#3a1c14', groundTex: T.groundTex('#33291f', '#3d3125'),
      fogNear: 10, fogFar: 80,
    });
    horizon(root, 21, '#241713', 88);

    const rand = rng(1234);
    const wallMat = faceted(T.cliffTex('#4a3a2c'));
    const roofMat = faceted(T.woodTex('#3a2418'));
    for (let i = 0; i < 7; i++) {
      const x = -24 + i * 8 + rand() * 2;
      const z = -8 - rand() * 18;
      const h = 3.4 + rand() * 1.4;
      root.add(slab(5.2, h, 4.6, wallMat, [x, h / 2, z]));
      const roof = cone(4.2, 2.6, roofMat, 4, [x, h + 1.3, z]);
      roof.rotation.y = Math.PI / 4;
      root.add(roof);
      if (i % 2 === 0) fire(root, x, h + 0.6, z, 2.0, '#ff8a2c');
    }
    for (const [x, z] of [[-11, 8], [7, 11], [17, 4]]) fire(root, x, 0, z, 1.4);

    const d = buildRedDragon();
    d.root.position.set(-14, 13, -4);
    d.root.rotation.set(0.12, 1.15, 0.08);
    poseRoaring(d);
    root.add(d.root);

    return (t) => {
      cam.position.set(-13 + t * 1.5, 4.6, 28 - t * 0.8);
      cam.lookAt(0, 6.5, -8);
      d.root.position.x = -14 + t * 4.0;
      d.root.position.y = 13 + Math.sin(t * 0.8) * 0.7;
      for (const s of ['L', 'R']) {
        d.wings[s].rotation.z =
          d.wings[s].userData.side * (-1.2 + Math.sin(t * 2.6) * 0.48);
      }
    };
  },

  /** After: ash, cairns, a fallen banner. */
  ashes(root, scene, cam) {
    stage(root, scene, {
      sky: '#171418', hemi: 0.6, key: 0.5, amb: 0.5,
      keyColor: '#8a8496', keyAt: [-6, 12, 6], hemiSky: '#3a3644',
      ambColor: '#2a2630', groundTex: T.groundTex('#33302c', '#3b3733'),
      fogNear: 8, fogFar: 68,
    });
    horizon(root, 55, '#232028', 76);

    const rand = rng(88);
    for (let i = 0; i < 9; i++) {
      const c = makeCairn((i * 13) | 0);
      c.position.set(-18 + i * 4.6 + rand() * 1.6, 0, -6 - rand() * 12);
      root.add(c);
    }
    for (let i = 0; i < 12; i++) {
      const s = makeSnag(4 + rand() * 4, (i * 7) | 0);
      s.position.set(-32 + rand() * 64, 0, -20 - rand() * 26);
      root.add(s);
    }

    const banner = new THREE.Group();
    banner.position.set(2.4, 0.3, 4);
    banner.rotation.z = 1.25;
    banner.add(tube(0.09, 0.11, 7, smooth(T.woodTex('#4a3520')), 5, [0, 0, 0]));
    banner.add(slab(0.12, 2.6, 1.9, smooth(T.flatTex('#8c2f2f')), [0.16, 2.0, 0]));
    root.add(banner);
    fire(root, -8, 0, 6, 0.9, '#c2662c');

    return (t) => {
      cam.position.set(7 - t * 0.55, 2.6 + t * 0.07, 17 - t * 0.6);
      cam.lookAt(1.4, 1.6, 0);
    };
  },

  /** The hero alone at the last fire, with the road ahead. */
  hero(root, scene, cam) {
    stage(root, scene, {
      sky: '#0b0f16', hemi: 0.45, key: 0.35, amb: 0.4,
      keyColor: '#6a7fc0', keyAt: [-8, 14, -6], hemiSky: '#2a3550',
      ambColor: '#1e2430', groundTex: T.groundTex('#243020', '#2c3826'),
      fogNear: 10, fogFar: 62,
    });
    horizon(root, 300, '#171c26', 70);

    const rand = rng(4242);
    for (let i = 0; i < 14; i++) {
      const tr = i % 3 === 0
        ? makeConifer(13 + rand() * 5, i)
        : makeBroadleaf(12 + rand() * 5, i);
      tr.position.set(-32 + rand() * 64, 0, -16 - rand() * 28);
      root.add(tr);
    }
    root.add(makeCampfire());
    fire(root, 0, 0.3, 0, 1.2);

    const hero = buildCharacter(CUTSCENE_CLASS.id, CUTSCENE_CLASS.look || {});
    hero.root.position.set(2.1, 0, 1.7);
    hero.root.rotation.y = -2.3;
    root.add(hero.root);

    return (t) => {
      cam.position.set(4.6 + Math.sin(t * 0.2) * 0.5, 2.1, 6.6 - t * 0.2);
      cam.lookAt(0.6, 1.3, 0);
      hero.root.position.y = Math.sin(t * 1.4) * 0.02;
    };
  },

  /** The green dragon asleep across the hollow, breathing. */
  sleepingGreen(root, scene, cam) {
    stage(root, scene, {
      sky: '#0f1610', hemi: 0.65, key: 0.55, amb: 0.5,
      keyColor: '#8fb06a', keyAt: [8, 14, 6], hemiSky: '#38502e',
      ambColor: '#1e2a1c', groundTex: T.groundTex('#2f4024', '#37492a'),
      fogNear: 12, fogFar: 72,
    });
    horizon(root, 12, '#1c2a1a', 78);

    const rand = rng(777);
    for (let i = 0; i < 16; i++) {
      const tr = makeBroadleaf(13 + rand() * 6, i);
      tr.position.set(-36 + rand() * 72, 0, -24 - rand() * 22);
      root.add(tr);
    }
    for (let i = 0; i < 9; i++) {
      const s = 1.4 + rand() * 1.8;
      const b = makeBoulder(s, i * 5, '#59604f');
      b.position.set(-17 + rand() * 34, 0, -2 - rand() * 14);
      root.add(b);
    }
    for (let i = 0; i < 5; i++) {
      const st = makeCliffChunk(1.6, 5.5 + rand() * 2, 1.4, i, '#5c6156');
      st.position.set(-12 + i * 6, 0, 7);
      st.rotation.y = rand() * 0.4;
      root.add(st);
    }

    const d = buildGreenDragon();
    d.root.position.set(0, 0, -7);
    d.root.rotation.y = 0.6;
    poseSleeping(d);
    root.add(d.root);

    return (t) => {
      cam.position.set(-7 + t * 0.6, 3.6 - t * 0.06, 18 - t * 1.1);
      cam.lookAt(0, 2.2, -7);
      const breath = Math.sin(t * 0.85);
      d.torso.scale.set(1 + breath * 0.035, 1 + breath * 0.03, 1);
      d.neck.joints[0].rotation.x = 0.30 + breath * 0.04;
      d.jaw.rotation.x = 0.04 + Math.max(0, breath) * 0.05;
      for (const s of ['L', 'R']) d.wings[s].rotation.x = 0.32 + breath * 0.03;
    };
  },

  /** It wakes: reared up, jaw open, fire building in the throat. */
  wakingGreen(root, scene, cam) {
    stage(root, scene, {
      sky: '#0d1310', hemi: 0.6, key: 0.6, amb: 0.5,
      keyColor: '#9ad06a', keyAt: [-6, 12, 8], hemiSky: '#33502c',
      ambColor: '#1c2a1c', groundTex: T.groundTex('#2b3a22', '#334228'),
      fogNear: 10, fogFar: 66,
    });
    horizon(root, 90, '#1a2618', 72);

    const rand = rng(31);
    for (let i = 0; i < 8; i++) {
      const st = makeCliffChunk(1.8, 6 + rand() * 2.5, 1.6, i, '#5c6156');
      const a = (i / 8) * TAU;
      st.position.set(Math.cos(a) * 14, 0, -7 + Math.sin(a) * 14);
      root.add(st);
    }

    const d = buildGreenDragon();
    d.root.position.set(0, 0, -8);
    poseRoaring(d);
    root.add(d.root);
    const throat = fire(root, 0, 4.2, -4.2, 0.75, '#a8ff5a');

    return (t) => {
      cam.position.set(Math.sin(t * 0.5) * 3.5, 3.0 + t * 0.12, 14 - t * 0.4);
      cam.lookAt(0, 4.0, -8);
      d.jaw.rotation.x = 0.5 + Math.abs(Math.sin(t * 2.2)) * 0.28;
      for (const s of ['L', 'R']) {
        d.wings[s].rotation.z =
          d.wings[s].userData.side * (-1.35 + Math.sin(t * 3.0) * 0.30);
      }
      throat.scale.setScalar(0.8 + Math.abs(Math.sin(t * 2.2)) * 0.6);
    };
  },

  /** The pit head: a black shaft going down, and something looking back up. */
  mineMouth(root, scene, cam) {
    stage(root, scene, {
      sky: '#100c10', hemi: 0.5, key: 0.4, amb: 0.45,
      keyColor: '#9a7a5a', keyAt: [4, 12, 10], hemiSky: '#3a3040',
      ambColor: '#241e26', groundTex: T.groundTex('#3f372e', '#4a4038'),
      fogNear: 8, fogFar: 58,
    });
    horizon(root, 5, '#1c1820', 62);

    const rand = rng(606);
    const wood = smooth(T.woodTex('#4a3520'));
    for (const sx of [-1, 1]) {
      root.add(tube(0.3, 0.36, 8, wood, 5, [sx * 3.4, 4, -7]));
      const brace = tube(0.22, 0.26, 7, wood, 5, [sx * 5.0, 3.2, -7]);
      brace.rotation.z = sx * 0.5;
      root.add(brace);
    }
    root.add(slab(8, 0.44, 0.5, wood, [0, 8.1, -7]));

    const hole = new THREE.Mesh(new THREE.CircleGeometry(3.4, 8),
      new THREE.MeshBasicMaterial({ color: '#050406', fog: false }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(0, 0.06, -7);
    root.add(hole);

    for (const sx of [-1, 1]) {
      const tr = makeTorch();
      tr.position.set(sx * 5.4, 0, -2.6);
      root.add(tr);
      const l = new THREE.PointLight('#ff9a3c', 2.2, 22, 1.6);
      l.position.set(sx * 5.4, 2.2, -2.6);
      root.add(l);
    }
    for (let i = 0; i < 10; i++) {
      const b = makeBoulder(1 + rand() * 1.4, i * 3, '#5a5460');
      b.position.set(-22 + rand() * 44, 0, 2 + rand() * 14);
      root.add(b);
    }

    const eyes = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff3a18', fog: false });
    for (const sx of [-0.55, 0.55]) eyes.add(ball(0.18, eyeMat, 6, 4, [sx, 0, 0]));
    eyes.position.set(0, -1.4, -7.4);
    root.add(eyes);

    return (t) => {
      cam.position.set(0, 4.4 - t * 0.12, 12 - t * 0.8);
      cam.lookAt(0, 1.4, -7);
      const pulse = 0.5 + Math.abs(Math.sin(t * 1.1)) * 0.5;
      eyes.children.forEach(e => e.scale.setScalar(0.7 + pulse * 0.5));
      eyes.position.y = -1.4 + Math.min(1.3, t * 0.26);
    };
  },

  /** The red dragon asleep on its hoard, deep under the hill. */
  sleepingRed(root, scene, cam) {
    stage(root, scene, {
      sky: '#140d0c', hemi: 0.55, key: 0.5, amb: 0.5,
      keyColor: '#c08050', keyAt: [-6, 14, 8], hemiSky: '#4a3428',
      ambColor: '#2e2018', groundTex: T.groundTex('#443830', '#4e4038'),
      fogNear: 10, fogFar: 70,
    });

    const rand = rng(9001);
    const rockMat = faceted(T.cliffTex('#3f3a44'));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const h = 22 + rand() * 8;
      root.add(tube(3.2, 4.4, h, rockMat, 6,
        [Math.cos(a) * 31, h / 2, -7 + Math.sin(a) * 31]));
    }

    root.add(blob(7.5, smooth(T.flatTex('#d4af37')), [1, 0.28, 1], 7, 4, [0, 0.4, -7]));
    for (let i = 0; i < 26; i++) {
      const c = makeCoin();
      const a = rand() * TAU, r = rand() * 9;
      c.position.set(Math.cos(a) * r, 0.2 + rand() * 1.4, -7 + Math.sin(a) * r);
      c.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      root.add(c);
    }
    for (let i = 0; i < 3; i++) {
      const ch = makeChest();
      ch.position.set(-9 + i * 9, 0, 2 + rand() * 3);
      ch.rotation.y = rand();
      root.add(ch);
    }

    const d = buildRedDragon();
    d.root.position.set(0, 1.6, -7);
    d.root.rotation.y = 0.5;
    poseSleeping(d);
    root.add(d.root);

    for (const [x, z] of [[-17, 4], [17, 2], [0, -24]]) fire(root, x, 0, z, 1.5, '#ff7a2c');

    return (t) => {
      cam.position.set(-11 + t * 0.75, 5.4 - t * 0.09, 21 - t * 1.15);
      cam.lookAt(0, 3.2, -7);
      const breath = Math.sin(t * 0.8);
      d.torso.scale.set(1 + breath * 0.04, 1 + breath * 0.035, 1);
      d.neck.joints[0].rotation.x = 0.30 + breath * 0.05;
      for (const s of ['L', 'R']) d.wings[s].rotation.x = 0.32 + breath * 0.035;
    };
  },

  /** It wakes on the hoard, wings up, fire already in its throat. */
  wakingRed(root, scene, cam) {
    stage(root, scene, {
      sky: '#170c08', hemi: 0.55, key: 0.6, amb: 0.5,
      keyColor: '#ff8a4a', keyAt: [0, 12, 12], hemiSky: '#6a2f1e',
      ambColor: '#3a1c14', groundTex: T.groundTex('#443830', '#4e4038'),
      fogNear: 9, fogFar: 66,
    });

    const rand = rng(4404);
    const rockMat = faceted(T.cliffTex('#3f3a44'));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const h = 24 + rand() * 8;
      root.add(tube(3.2, 4.4, h, rockMat, 6,
        [Math.cos(a) * 29, h / 2, -7 + Math.sin(a) * 29]));
    }
    root.add(blob(7.0, smooth(T.flatTex('#d4af37')), [1, 0.26, 1], 7, 4, [0, 0.4, -7]));

    const d = buildRedDragon();
    d.root.position.set(0, 1.9, -7);
    poseRoaring(d);
    root.add(d.root);
    const throat = fire(root, 0, 5.2, -2.4, 0.95, '#ff5a1e');

    return (t) => {
      cam.position.set(Math.sin(t * 0.4) * 4, 4.0 + t * 0.1, 17 - t * 0.45);
      cam.lookAt(0, 5.0, -7);
      d.jaw.rotation.x = 0.5 + Math.abs(Math.sin(t * 2.0)) * 0.3;
      for (const s of ['L', 'R']) {
        d.wings[s].rotation.z =
          d.wings[s].userData.side * (-1.35 + Math.sin(t * 2.6) * 0.34);
      }
      throat.scale.setScalar(0.7 + Math.abs(Math.sin(t * 2.0)) * 0.8);
    };
  },

  /** The mountain from below: green terraces, all of it under ice. */
  frozenPeak(root, scene, cam) {
    stage(root, scene, {
      sky: '#8fa8c0', hemi: 1.0, key: 1.1, amb: 0.6,
      keyColor: '#fff4e0', keyAt: [-8, 16, 6], hemiSky: '#cfe4f4',
      ambColor: '#8fa4b8', groundTex: T.groundTex('#c8d8e4', '#e8f2f8'),
      fogNear: 26, fogFar: 150,
    });
    const rand = rng(1701);
    // the mountain itself, a stack of peaks going up and back
    for (let i = 0; i < 7; i++) {
      const pk = makePeak(26 - i * 2.4, 24 + i * 9, (i * 9) | 0, i < 3 ? '#8fa0ac' : '#b8ccd8');
      pk.position.set((rand() - 0.5) * 10, i * 3.5, -40 - i * 13);
      root.add(pk);
    }
    // the dead terraces, stepped and empty
    const wallMat = faceted(T.cliffTex('#7e8794'));
    for (let i = 0; i < 5; i++) {
      root.add(slab(60 - i * 8, 1.6, 7, wallMat, [0, 1.0 + i * 2.4, -14 - i * 9]));
    }
    // frozen conifers on the lower slope
    for (let i = 0; i < 22; i++) {
      const tr = makeConifer(8 + rand() * 5, i, { leaf: '#7f9e9c', trunk: '#4a4a4e' });
      tr.position.set(-40 + rand() * 80, 0, 2 - rand() * 22);
      root.add(tr);
    }
    // and one buried cottage, so you know people lived here
    const hut = new THREE.Group();
    hut.add(slab(5, 3, 4.4, wallMat, [0, 1.5, 0]));
    const roof = cone(4.0, 2.4, faceted(T.flatTex('#e8f2f8')), 4, [0, 4.0, 0]);
    roof.rotation.y = Math.PI / 4;
    hut.add(roof);
    hut.position.set(-11, 0, 4);
    hut.rotation.y = 0.4;
    root.add(hut);

    return (t) => {
      // a slow tilt UP the mountain -- the shot is the climb
      cam.position.set(2 + Math.sin(t * 0.15) * 2, 3.0 + t * 0.55, 24 - t * 0.5);
      cam.lookAt(0, 6 + t * 1.6, -34);
    };
  },

  /** The ice dragon asleep across the summit, everything rimed to it. */
  sleepingIce(root, scene, cam) {
    stage(root, scene, {
      sky: '#9fb8cc', hemi: 1.0, key: 1.15, amb: 0.6,
      keyColor: '#ffffff', keyAt: [6, 16, 8], hemiSky: '#dcecf8',
      ambColor: '#9fb4c8', groundTex: T.groundTex('#d4e4ee', '#f0f8fc'),
      fogNear: 20, fogFar: 120,
    });
    const rand = rng(2024);
    for (let i = 0; i < 14; i++) {
      const a2 = (i / 14) * TAU;
      const h = 12 + rand() * 10;
      root.add(tube(2.0, 2.8, h, faceted(T.flatTex('#bfe8ff')), 6,
        [Math.cos(a2) * 26, h / 2, -8 + Math.sin(a2) * 26]));
    }
    for (let i = 0; i < 16; i++) {
      const pk = makePeak(20 + rand() * 14, 26 + rand() * 26, (i * 3) | 0, '#7d8b98');
      const a2 = (i / 16) * TAU;
      pk.position.set(Math.cos(a2) * 96, -34, -8 + Math.sin(a2) * 96);
      root.add(pk);
    }
    const d = buildIceDragon();
    d.root.position.set(0, 0, -8);
    d.root.rotation.y = 0.55;
    poseSleeping(d);
    root.add(d.root);

    return (t) => {
      cam.position.set(-9 + t * 0.7, 4.4 - t * 0.06, 20 - t * 1.15);
      cam.lookAt(0, 2.6, -8);
      const breath = Math.sin(t * 0.7);
      d.torso.scale.set(1 + breath * 0.035, 1 + breath * 0.03, 1);
      d.neck.joints[0].rotation.x = 0.30 + breath * 0.045;
      for (const s2 of ['L', 'R']) d.wings[s2].rotation.x = 0.32 + breath * 0.03;
    };
  },

  /** It wakes, and the air goes white. */
  wakingIce(root, scene, cam) {
    stage(root, scene, {
      sky: '#b0c8dc', hemi: 1.05, key: 1.2, amb: 0.65,
      keyColor: '#ffffff', keyAt: [0, 14, 12], hemiSky: '#e4f0fa',
      ambColor: '#a8bccc', groundTex: T.groundTex('#d4e4ee', '#f0f8fc'),
      fogNear: 18, fogFar: 110,
    });
    const rand = rng(5150);
    for (let i = 0; i < 12; i++) {
      const a2 = (i / 12) * TAU;
      const h = 14 + rand() * 10;
      root.add(tube(2.2, 3.0, h, faceted(T.flatTex('#bfe8ff')), 6,
        [Math.cos(a2) * 24, h / 2, -8 + Math.sin(a2) * 24]));
    }
    const d = buildIceDragon();
    d.root.position.set(0, 0, -9);
    poseRoaring(d);
    root.add(d.root);
    const throat = fire(root, 0, 4.6, -4.6, 0.8, '#9fe4ff');

    return (t) => {
      cam.position.set(Math.sin(t * 0.45) * 4, 3.4 + t * 0.12, 15 - t * 0.4);
      cam.lookAt(0, 4.4, -9);
      d.jaw.rotation.x = 0.5 + Math.abs(Math.sin(t * 2.1)) * 0.3;
      for (const s2 of ['L', 'R']) {
        d.wings[s2].rotation.z =
          d.wings[s2].userData.side * (-1.35 + Math.sin(t * 2.8) * 0.32);
      }
      throat.scale.setScalar(0.8 + Math.abs(Math.sin(t * 2.1)) * 0.7);
    };
  },

  /** A dragon dead on the field, the fires burning down. */
  fallenGreen(root, scene, cam) {
    return fallenShot(root, scene, cam, buildGreenDragon(), '#39402e', '#424a36');
  },

  /** The same, in the ash of the mine mouth. */
  fallenRed(root, scene, cam) {
    return fallenShot(root, scene, cam, buildRedDragon(), '#3f372e', '#4a4038');
  },

  /** And on the snow of the summit. */
  fallenIce(root, scene, cam) {
    return fallenShot(root, scene, cam, buildIceDragon(), '#d4e4ee', '#f0f8fc');
  },
};

function fallenShot(root, scene, cam, d, g1, g2) {
  stage(root, scene, {
    sky: '#141a1c', hemi: 0.7, key: 0.7, amb: 0.55,
    keyColor: '#d8c49a', keyAt: [6, 14, 10], hemiSky: '#54606a',
    ambColor: '#2c3238', groundTex: T.groundTex(g1, g2),
    fogNear: 14, fogFar: 88,
  });
  horizon(root, 404, '#242c30', 82);

  d.root.position.set(0, 0, -9);
  d.root.rotation.set(0, 0.9, 0.42);
  poseSleeping(d);
  d.neck.joints.forEach((j, i) => { j.rotation.x = 0.5 + i * 0.2; j.rotation.y = -0.5; });
  d.jaw.rotation.x = 0.35;
  root.add(d.root);
  for (const [x, z] of [[-12, 2], [11, -1]]) fire(root, x, 0, z, 0.7, '#c26a2c');

  return (t) => {
    cam.position.set(-9 + t * 0.9, 4.0 + t * 0.13, 16 - t * 0.32);
    cam.lookAt(0, 1.6, -9);
  };
}

/** Which class the `hero` shot builds. Set from the run before a scene plays. */
// id is who the diorama builds; look is what they have on, filled in by
// main.js from the wardrobe so the hero in a cutscene is the hero you dressed.
export const CUTSCENE_CLASS = { id: 'knight', look: {} };

/**
 * Shots live in more than one file -- level four brings its own. Registering
 * keeps this module from growing without bound and keeps each chapter's
 * staging next to nothing but itself.
 */
export function registerShots(more) { Object.assign(SHOTS, more); }

export const SHOT_NAMES = () => Object.keys(SHOTS);
