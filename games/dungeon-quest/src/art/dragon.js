// THE GREEN DRAGON -- level 1's boss.
//
// Per the design: tail lash and a SHORT flame breath, and it does NOT fly.
// Built as a segmented body so the neck and tail can be animated as chains.
import * as THREE from 'three';
import { tube, ball, blob, cone, slab, lathe, smooth, faceted, triCount, disposeTree } from './shapes.js';
import { blobShadow } from './rig.js';
import * as T from './textures.js';

/** A flat triangle between three points -- one panel of a wing membrane. */
function membrane(a, b, c, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
  ]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.material.side = THREE.DoubleSide;
  return m;
}

/**
 * A chain of segments that can be swung like a rope.
 * `dir` is which way along Z it grows: the tail runs backward (+1), the neck
 * forward (-1). Getting these two pointing the same way is what made the neck
 * curl back over the body.
 */
function chain(count, rFrom, rTo, segLen, material, segs = 7, dir = 1) {
  const root = new THREE.Group();
  const joints = [];
  let parent = root;
  for (let i = 0; i < count; i++) {
    const k = i / (count - 1 || 1);
    const j = new THREE.Group();
    if (i > 0) j.position.z = dir * segLen;
    parent.add(j);
    const r = rFrom + (rTo - rFrom) * k;
    const rNext = rFrom + (rTo - rFrom) * Math.min(1, (i + 1) / (count - 1 || 1));
    const seg = tube(rNext, r, segLen, material, segs, [0, 0, dir * segLen / 2]);
    seg.rotation.x = Math.PI / 2;     // lay the cylinder along Z
    j.add(seg);
    j.add(ball(r * 1.02, material, segs, 5));
    joints.push(j);
    parent = j;
  }
  return { root, joints, dir };
}

export function buildGreenDragon() {
  const scaleHide = T.scaleTex('#3f6b2e');       // scaly green hide
  const bellyTex = T.clothTex('#b8a468');
  const hornTex = T.boneTex('#cfc0a0');

  // Everything on the dragon is FLAT-SHADED. Smooth shading over big rounded
  // masses read as soft and inflatable; hard facets read as a reptile.
  const hide = faceted(scaleHide);
  const hideDark = faceted(T.scaleTex('#2e5222'));
  const belly = faceted(bellyTex);
  const horn = faceted(hornTex);

  const root = new THREE.Group();
  const body = new THREE.Group();
  // The body is modelled nose-toward -Z; this flip makes the finished dragon
  // face +Z, which is the direction every other entity's yaw points.
  body.rotation.y = Math.PI;
  root.add(body);

  /* ---- torso: a heavy barrel, hips higher than shoulders ---- */
  const torso = new THREE.Group();
  torso.position.y = 1.55;
  body.add(torso);

  const chest = blob(1.05, hide, [1.0, 0.92, 1.45], 9, 7, [0, 0, -0.2]);
  torso.add(chest);
  const hips = blob(0.95, hide, [1.0, 0.95, 1.15], 9, 7, [0, 0.05, 1.35]);
  torso.add(hips);
  torso.add(blob(0.72, belly, [0.85, 0.55, 1.5], 8, 6, [0, -0.55, 0.4]));

  // back ridge
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const spike = cone(0.10 - k * 0.03, 0.34 - k * 0.10, horn, 5,
      [0, 0.90 - k * 0.10, -0.9 + i * 0.34]);
    spike.rotation.x = -0.30;
    torso.add(spike);
  }

  /* ---- neck + head ---- */
  // Grows FORWARD (-Z) out of the chest, rearing up then curving back down so
  // the head ends up level and looking ahead.
  const neck = chain(5, 0.52, 0.34, 0.62, hide, 8, -1);
  neck.root.position.set(0, 0.45, -1.0);
  neck.root.rotation.x = 0.78;                  // rears up
  torso.add(neck.root);
  neck.joints.forEach((j, i) => { j.userData.baseX = i === 0 ? -0.06 : -0.20; });

  const head = new THREE.Group();
  head.position.z = -0.62;
  head.rotation.y = Math.PI;                    // face the way the neck travels
  neck.joints[neck.joints.length - 1].add(head);

  const skull = blob(0.42, hide, [1.0, 0.85, 1.35], 8, 6, [0, 0.02, 0.30]);
  head.add(skull);
  const snout = lathe([
    [0.001, 0], [0.26, 0.02], [0.30, 0.22], [0.24, 0.48], [0.16, 0.66], [0.001, 0.70],
  ], hide, 8);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.02, 0.55);
  head.add(snout);

  // Hinged lower jaw. It gapes open through the breath wind-up, which is the
  // clearest possible tell that fire is coming.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.14);
  head.add(jaw);
  jaw.add(blob(0.24, belly, [0.9, 0.45, 1.25], 7, 5, [0, -0.12, 0.46]));
  jaw.add(blob(0.15, hide, [1.0, 0.6, 1.0], 6, 4, [0, -0.10, 0.10]));

  // horns, brow ridge, nostrils
  for (const s of [1, -1]) {
    const h = cone(0.075, 0.52, horn, 6, [s * 0.22, 0.30, 0.10]);
    h.rotation.set(-0.6, 0, -s * 0.42);
    head.add(h);
    const brow = cone(0.05, 0.22, horn, 5, [s * 0.20, 0.20, 0.44]);
    brow.rotation.set(-1.1, 0, -s * 0.30);
    head.add(brow);
    head.add(ball(0.035, hideDark, 5, 4, [s * 0.10, 0.02, 0.92]));
  }
  // eyes -- emissive so they read through fog
  const eyeMat = new THREE.MeshLambertMaterial({
    map: T.goldTex('#ffd23c'), emissive: new THREE.Color('#e0a010'),
    emissiveIntensity: 0.9, fog: true,
  });
  for (const s of [1, -1]) {
    head.add(blob(0.085, eyeMat, [1, 1.25, 0.8], 6, 5, [s * 0.24, 0.16, 0.46]));
    head.add(blob(0.035, faceted(T.flatTex('#141414')), [0.6, 1.4, 0.8], 5, 4,
      [s * 0.27, 0.16, 0.52]));
  }
  // teeth -- upper row on the skull, lower row on the hinged jaw
  for (let i = 0; i < 5; i++) {
    for (const s of [1, -1]) {
      const t = cone(0.026, 0.11, horn, 4, [s * (0.10 + i * 0.03), -0.12, 0.55 + i * 0.09]);
      t.rotation.x = Math.PI;
      head.add(t);
      const b = cone(0.024, 0.09, horn, 4,
        [s * (0.09 + i * 0.03), -0.10, 0.42 + i * 0.09]);
      jaw.add(b);
    }
  }

  /* ---- tail ---- */
  const tail = chain(8, 0.46, 0.07, 0.62, hide, 7);
  tail.root.position.set(0, 0.10, 2.05);
  torso.add(tail.root);
  const tailTip = tail.joints[tail.joints.length - 1];
  const fin = cone(0.22, 0.55, horn, 5, [0, 0, 0.34]);
  fin.rotation.x = Math.PI / 2;
  tailTip.add(fin);
  for (let i = 2; i < tail.joints.length - 1; i++) {
    const k = i / tail.joints.length;
    const spike = cone(0.06 * (1 - k) + 0.02, 0.20, horn, 4, [0, 0.30 * (1 - k) + 0.06, 0.2]);
    spike.rotation.x = -0.2;
    tail.joints[i].add(spike);
  }

  /* ---- legs ---- */
  const legs = {};
  const legDefs = [
    { id: 'FL', x: 0.70, z: -0.75, front: true },
    { id: 'FR', x: -0.70, z: -0.75, front: true },
    { id: 'BL', x: 0.78, z: 1.30, front: false },
    { id: 'BR', x: -0.78, z: 1.30, front: false },
  ];
  for (const d of legDefs) {
    const hipJ = new THREE.Group();
    hipJ.position.set(d.x, -0.30, d.z);
    torso.add(hipJ);

    const upperLen = d.front ? 0.72 : 0.88;
    const upper = tube(0.22, 0.30, upperLen, hide, 7, [0, -upperLen / 2, 0]);
    hipJ.add(upper);
    // haunch on the back legs
    if (!d.front) hipJ.add(blob(0.42, hide, [1, 1.1, 0.9], 7, 5, [0, -0.05, 0.08]));

    const kneeJ = new THREE.Group();
    kneeJ.position.y = -upperLen;
    hipJ.add(kneeJ);
    const lowerLen = d.front ? 0.62 : 0.70;
    kneeJ.add(tube(0.16, 0.22, lowerLen, hide, 7, [0, -lowerLen / 2, 0]));

    const footJ = new THREE.Group();
    footJ.position.y = -lowerLen;
    kneeJ.add(footJ);
    footJ.add(blob(0.26, hideDark, [1, 0.55, 1.5], 7, 5, [0, -0.10, 0.14]));
    for (let i = -1; i <= 1; i++) {
      const claw = cone(0.045, 0.20, horn, 4, [i * 0.14, -0.12, 0.36]);
      claw.rotation.x = Math.PI * 0.62;
      footJ.add(claw);
    }
    legs[d.id] = { hip: hipJ, knee: kneeJ, foot: footJ, front: d.front, side: Math.sign(d.x) };
  }

  /* ---- wings ----
   * Real bat-wings: humerus, forearm, three splayed fingers and membrane
   * panels stretched between them. It still does NOT fly at this tier -- they
   * are carried half-furled and flare when it attacks -- but the silhouette
   * has to read as a dragon from across the arena.
   */
  const wings = {};
  const memMat = faceted(T.scaleTex('#35502a'));
  memMat.side = THREE.DoubleSide;

  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.60, 0.62, -0.25);
    torso.add(w);

    // build the wing in +X space, then mirror for the right side
    const inner = new THREE.Group();
    inner.scale.x = s;
    w.add(inner);

    const S = [0, 0, 0];
    const E = [1.15, 0.30, 0.30];
    const W = [2.45, 0.18, 0.10];
    const F1 = [3.25, -0.15, 0.95];
    const F2 = [2.85, -0.30, 2.00];
    const F3 = [1.95, -0.38, 2.75];
    const B = [-0.10, -0.45, 1.70];        // where the trailing edge meets the flank

    const bone = (from, to, r0, r1) => {
      const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
      const len = Math.hypot(dx, dy, dz);
      const m = tube(r1, r0, len, hide, 5, [0, 0, 0]);
      m.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
      m.lookAt(to[0], to[1], to[2]);
      m.rotateX(Math.PI / 2);
      return m;
    };

    inner.add(bone(S, E, 0.13, 0.10));
    inner.add(bone(E, W, 0.10, 0.075));
    inner.add(bone(W, F1, 0.06, 0.025));
    inner.add(bone(W, F2, 0.06, 0.025));
    inner.add(bone(W, F3, 0.055, 0.025));
    inner.add(ball(0.11, hide, 6, 4, E));
    inner.add(ball(0.09, hide, 6, 4, W));

    inner.add(membrane(W, F1, F2, memMat));
    inner.add(membrane(W, F2, F3, memMat));
    inner.add(membrane(W, F3, B, memMat));
    inner.add(membrane(S, W, B, memMat));
    inner.add(membrane(S, E, W, memMat));

    // claw at the wrist
    const claw = cone(0.05, 0.26, horn, 4, [F1[0] + 0.12, F1[1] + 0.06, F1[2] - 0.10]);
    claw.rotation.z = -1.2;
    inner.add(claw);

    // half-furled resting pose: swept back and raised
    w.rotation.set(0.10, s * -0.60, s * -0.55);
    w.userData.rest = { x: 0.10, y: s * -0.60, z: s * -0.55 };
    w.userData.side = s;
    wings[s > 0 ? 'L' : 'R'] = w;
  }

  const shadow = blobShadow(2.2);
  root.add(shadow);

  // Built at roughly horse size, then scaled up: a boss has to loom over the
  // player, and scaling once is cheaper than re-tuning forty offsets.
  root.scale.setScalar(1.75);

  return {
    kind: 'greenDragon',
    root, body, torso, neck, head, jaw, tail, legs, wings, shadow,
    attackStyle: 'dragon',
    stats: {
      hp: 900, speed: 2.0, tier: 3, coin: [220, 320],
      damage: 30,                       // tail lash
      breathDamage: 16,                 // per flame tick
      attackRange: 7.0, attackCooldown: 2.2,
      windup: 0.65, strike: 0.30, recover: 0.75,
      breathRange: 12.0, breathAngle: 0.30,
      // Its fire is its own colour. The red dragon overrides all three.
      breathColor: '#7fc44a', breathHot: '#e8ffb0', breathCool: '#2f6a24',
      sightRange: 40, sightAngle: 2.4, hearRange: 40,
      lookHeight: 4.2, hitRadius: 3.0,
      arrows: [4, 8],
      boss: true,
    },
    resetPose() {},
    triCount() { return triCount(root); },
    dispose() { disposeTree(root); },
  };
}

/**
 * Procedural dragon animation. Same idea as the humanoid animator: every pose
 * is computed, nothing is keyframed.
 */
export class DragonAnimator {
  constructor(d) {
    this.d = d;
    this.t = 0;
    this.phase = 0;
    this.wLash = 0;
    this.wBreath = 0;
    this.wRear = 0;
  }

  update(dt, state = {}) {
    const d = this.d;
    this.t += dt;
    const moving = (state.speed ?? 0) > 0.2;
    if (moving) this.phase += dt * (2.0 + (state.speed ?? 0) * 0.5);

    const atk = state.attack;
    const lashing = atk && atk.style === 'lash';
    const breathing = atk && atk.style === 'breath';
    const k = atk ? Math.min(1, atk.k) : 0;

    this.wLash += ((lashing ? 1 : 0) - this.wLash) * Math.min(1, dt * 14);
    this.wBreath += ((breathing ? 1 : 0) - this.wBreath) * Math.min(1, dt * 10);

    /* body sway + breathing */
    const bob = Math.sin(this.phase * 2) * 0.10 * (moving ? 1 : 0.25);
    d.torso.position.y = 1.55 + bob + Math.sin(this.t * 1.1) * 0.04;
    d.torso.rotation.z = Math.sin(this.phase) * 0.06 * (moving ? 1 : 0.3);
    d.torso.rotation.x = -0.04 + this.wBreath * 0.10;

    /* legs walk */
    for (const id of ['FL', 'FR', 'BL', 'BR']) {
      const l = d.legs[id];
      const off = (id === 'FL' || id === 'BR') ? 0 : Math.PI;
      const sw = Math.sin(this.phase + off);
      const amp = moving ? 0.42 : 0.05;
      l.hip.rotation.x = -sw * amp;
      l.knee.rotation.x = Math.max(0, -Math.sin(this.phase + off - 0.7)) * amp * 1.5 + 0.25;
      l.foot.rotation.x = -l.hip.rotation.x * 0.4;
    }

    /* neck: rears back on a breath windup, lunges down on the strike */
    const neckJoints = d.neck.joints;
    let neckCurve = Math.sin(this.t * 0.9) * 0.03;
    if (breathing) {
      neckCurve += atk.phase === 'windup' ? 0.20 * k
        : atk.phase === 'strike' ? -0.14 : -0.04;
    }
    neckJoints.forEach((j, i) => {
      const w = 1 - i / neckJoints.length;
      j.rotation.x = (j.userData.baseX || 0) + neckCurve * w
        + Math.sin(this.t * 1.3 + i * 0.5) * 0.02;
      j.rotation.y = Math.sin(this.t * 0.7 + i * 0.4) * 0.03
        - (state.aimYaw ?? 0) * 0.20 * w;
    });

    /* head tracks the target a little (its base yaw keeps it facing forward) */
    d.head.rotation.x = -(state.aimPitch ?? 0) * 0.4 - this.wBreath * 0.18;
    d.head.rotation.y = Math.PI - (state.aimYaw ?? 0) * 0.35;

    /* jaw: gapes wide through the breath wind-up -- the tell for fire */
    let jawOpen = 0.05 + Math.sin(this.t * 0.8) * 0.02;
    if (breathing) {
      jawOpen = atk.phase === 'windup' ? 0.08 + 0.66 * k
        : atk.phase === 'strike' ? 0.74
          : 0.74 * (1 - k);
    } else if (lashing) {
      jawOpen = 0.28;                      // a roar as it winds up
    }
    if (d.jaw) d.jaw.rotation.x = jawOpen;

    /* tail: idle drift, then a LOW horizontal sweep on the lash.
       It coils to one side, then whips flat across -- low enough to jump. */
    const tj = d.tail.joints;
    let coil = 0;
    if (lashing) {
      coil = atk.phase === 'windup' ? -0.60 * k
        : atk.phase === 'strike' ? -0.60 + 1.55 * k
          : 0.95 * (1 - k);
    }
    tj.forEach((j, i) => {
      const w = i / tj.length;
      let y = Math.sin(this.t * 1.6 - i * 0.55) * 0.10 * (0.4 + w);
      let x = Math.sin(this.t * 1.1 - i * 0.4) * 0.05;
      if (lashing) {
        y += coil * (0.30 + w * 1.25) * this.wLash;
        x -= 0.12 * (0.3 + w) * this.wLash;   // keep it low to the ground
      }
      j.rotation.y = y;
      j.rotation.x = x;
    });
    // the whole body winds with the tail
    d.torso.rotation.y = coil * 0.22 * this.wLash;

    /* wings: half-furled at rest, flared when it attacks. Still earthbound. */
    for (const key of ['L', 'R']) {
      const w = d.wings[key];
      const rest = w.userData.rest;
      const sgn = w.userData.side;
      const flare = Math.max(this.wLash, this.wBreath);
      const flap = Math.sin(this.t * 1.5) * 0.06;
      w.rotation.x = rest.x + flap * 0.5;
      w.rotation.y = rest.y * (1 - flare * 0.62);
      w.rotation.z = rest.z * (1 - flare * 0.52) + flap * sgn * 0.35;
    }

    if (state.hurt) {
      d.torso.position.x = (Math.random() - 0.5) * 0.10;
    } else {
      d.torso.position.x = 0;
    }

    if (d.shadow) d.shadow.material.opacity = 0.8;
  }
}

/**
 * THE RED DRAGON -- level 2's boss.
 *
 * Same skeleton as the green one, but red, bigger-winged, and it FLIES. The
 * flight ability is data on the stats block; the behaviour lives in enemyAI.
 */
/** Same recolour trick, for every dragon after the first. */
function recolourDragon(d, hide, belly, membrane) {
  const GREEN = { '#3f6b2e': hide, '#2e5222': belly, '#35502a': membrane };
  d.root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const src = o.material.map && o.material.map.sourceColor;
    if (src && GREEN[src]) {
      o.material.map = T.scaleTex(GREEN[src]);
      o.material.needsUpdate = true;
    }
  });
}

/**
 * THE ICE DRAGON, level three's boss.
 *
 * It flies, and the thing it does in the air is not fire -- it FREEZES. That
 * matters because the knight's shield is useless against it: there is no blow
 * arriving to block, the air just sets around you, and you break out by
 * struggling while it costs you a point a second.
 */
export function buildIceDragon() {
  const d = buildGreenDragon();
  recolourDragon(d, '#7fb4d8', '#cfe8f4', '#9fd0ea');

  d.root.scale.setScalar(2.0);
  d.kind = 'iceDragon';
  d.stats = {
    ...d.stats,
    hp: 1500, speed: 2.3, coin: [520, 700],
    damage: 36, breathDamage: 15,
    attackRange: 8.0, breathRange: 14.0,
    lookHeight: 4.8, hitRadius: 3.4,
    breathColor: '#9fe4ff', breathHot: '#ffffff', breathCool: '#2f6f9a',
    // its breath does not burn, it encases
    breathType: 'ice', freezeTime: 3.0,
    canFly: true, flyCooldown: 15,
    roostCharge: 4.0,
    roostBreath: 2.1,
    roostDamage: 22,
    roostType: 'ice',
    roostPasses: 2,
    // and from the air it HURLS ice rather than raining fire
    hurlCount: 5, hurlDamage: 20, hurlInterval: 0.55,
    projectile: { kind: 'ice', color: '#bfe8ff', speed: 18, homing: false },
  };
  return d;
}

/**
 * THE BLACK DRAGON. The last one, and the only one with five answers.
 *
 *   1. the tail sweep          -- jump it, as ever
 *   2. purple flame            -- dart aside
 *   3. the SHEET               -- perch, four seconds, get behind a boulder
 *   4. the ORB VOLLEY          -- it hangs in the air and throws; walk out
 *   5. THE SUMMONING           -- it climbs to a high rock, cannot be locked
 *                                 on to, does not attack, and raises the dead
 *                                 and makes demons while you deal with them
 */
export function buildBlackDragon() {
  const d = buildGreenDragon();
  recolourDragon(d, '#2a2336', '#3d3450', '#221b2e');

  // coals in the eye sockets and a light in the throat
  d.root.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.map) return;
    if (o.material.map.sourceColor === '#ffd23c') {
      o.material = o.material.clone();
      o.material.map = T.flatTex('#c79bff');
    }
  });
  const throat = new THREE.PointLight('#8a3fd0', 2.2, 16, 2);
  throat.position.set(0, 0, 0.4);
  d.head.add(throat);
  d.gear = { ...(d.gear || {}), throat };

  d.root.scale.setScalar(2.25);
  d.kind = 'blackDragon';
  d.stats = {
    ...d.stats,
    hp: 2200, speed: 2.6, coin: [900, 1200],
    damage: 40, breathDamage: 22,
    attackRange: 9.0, breathRange: 16.0,
    lookHeight: 5.4, hitRadius: 3.8,
    windup: 0.60, strike: 0.30, recover: 0.70,
    breathColor: '#b070ff', breathHot: '#f0d8ff', breathCool: '#3a1a5a',
    canFly: true, flyCooldown: 13,
    roostCharge: 4.0,
    roostBreath: 2.2,
    roostDamage: 30,
    roostPasses: 2,
    // the orb volley
    hurlCount: 6, hurlDamage: 24, hurlInterval: 0.5,
    projectile: { kind: 'bolt', color: '#c79bff', speed: 17, homing: false },
    // THE SUMMONING: it stops fighting and starts making more of them
    summon: {
      cooldown: 26,          // seconds between summonings
      duration: 9.0,         // how long it sits up there watching
      waves: 3,              // batches raised over that time
      each: 3,               // how many per batch
      kinds: ['darkSkeleton', 'darkZombie', 'demon', 'darkGoblin'],
      perch: 22,             // how high the rock is
    },
  };
  return d;
}

export function buildRedDragon() {
  const d = buildGreenDragon();

  // Recolour rather than rebuild. The green dragon's hide, membranes and belly
  // are the only surfaces that should change; horns, teeth and eyes stay.
  const GREEN = new Set(['#3f6b2e', '#2e5222', '#35502a']);
  const RED = { '#3f6b2e': '#8a2f22', '#2e5222': '#5a1d16', '#35502a': '#6a241a' };
  d.root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const src = o.material.map && o.material.map.sourceColor;
    if (src && GREEN.has(src)) {
      o.material.map = T.scaleTex(RED[src]);
      o.material.needsUpdate = true;
    }
  });

  d.root.scale.setScalar(1.9);
  d.kind = 'redDragon';
  d.stats = {
    ...d.stats,
    hp: 1250, speed: 2.4, coin: [380, 520],
    damage: 34, breathDamage: 19,
    attackRange: 7.5, breathRange: 13.0,
    lookHeight: 4.6, hitRadius: 3.2,
    breathColor: '#ff5a1e', breathHot: '#ffe8a0', breathCool: '#8c1d0c',
    canFly: true, flyCooldown: 16,
    // The aerial move: it perches at one end of the chamber and charges.
    roostCharge: 4.0,        // seconds you get to reach a boulder
    roostBreath: 2.1,        // how long the sheet of fire pours
    roostDamage: 26,         // per tick, and only if you are in the open
    roostPasses: 2,
  };
  return d;
}
