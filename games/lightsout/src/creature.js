/* =====================================================================
   creature.js — the thing in the house
   =====================================================================
   Liam: *"make the monster super scary"*.

   The old one was a man made of six boxes with two pale marks for a face.
   It was fine at 320x240 and it is not frightening at all once you can
   see it properly, because the thing that makes a shape frightening is
   not detail — it is WRONGNESS, and wrongness has to be specific:

     TOO TALL, AND FOLDED. It stands about nine feet but it is bent
     forward at the waist, so the head arrives before the body does. A
     thing that is taller than the doorway it is coming through reads as
     dangerous before you have worked out why.

     ARMS THAT REACH THE FLOOR. Real proportions put the fingertips at
     mid-thigh. These go past the knee and end in long splayed fingers,
     so when it is still it looks like it is about to put a hand down.

     A HEAD WITH NO FACE, tilted. Smooth, slightly too small, angled a
     few degrees off the direction of travel — which the eye reads as
     "it is not looking where it is going, it is looking at ME".

     KNEES THE WRONG WAY. The lower leg hinges backwards. Nothing about
     it is exaggerated enough to be funny; it is just not a person.

     AND IT IS ONLY EVER HALF SEEN. It is nearly black, it reflects
     almost nothing, and the only thing on it with any shine at all is
     the wet line where a mouth would be. In a torch beam you get an
     outline and two hands.

   THE MOTION IS THE OTHER HALF.
     In the dark it moves in LURCHES — a fast three-step, then a pause,
     rather than a constant walk, because something that closes distance
     in bursts is far harder to place than something that walks.
     Caught in the beam it FREEZES, and while frozen it TREMBLES: the
     hands shake and the head rolls very slightly. It is not safe, it is
     waiting.
     Close up it leans in. The head comes forward before the feet do.
   ===================================================================== */
import * as THREE from '../vendor/three.module.js';

export function makeCreature(scene, x, z, mats) {
  const g = new THREE.Group();

  const skin = mats.skin;
  const wet = mats.wet;

  /* ---- the spine: hips, a long torso, a folded neck ---------------- */
  const hips = new THREE.Group();
  hips.position.y = 4.6;
  g.add(hips);

  const pelvis = mesh(new THREE.BoxGeometry(1.25, 0.9, 0.8), skin);
  hips.add(pelvis);

  const spine = new THREE.Group();          // bends forward
  spine.position.y = 0.45;
  hips.add(spine);
  const torso = mesh(new THREE.CylinderGeometry(0.52, 0.78, 2.7, 7), skin);
  torso.position.y = 1.35;
  spine.add(torso);
  const ribs = mesh(new THREE.BoxGeometry(1.5, 1.1, 0.62), skin);
  ribs.position.y = 2.1;
  spine.add(ribs);

  const neck = new THREE.Group();
  neck.position.y = 2.7;
  spine.add(neck);
  const neckM = mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 6), skin);
  neckM.position.y = 0.45;
  neck.add(neckM);

  const head = new THREE.Group();
  head.position.y = 0.95;
  neck.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.46, 14, 12), skin);
  skull.scale.set(0.86, 1.15, 1.0);
  head.add(skull);
  const jaw = mesh(new THREE.BoxGeometry(0.5, 0.24, 0.42), skin);
  jaw.position.set(0, -0.42, 0.06);
  head.add(jaw);
  /* the one shiny thing on it */
  const mouth = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.06), wet);
  mouth.position.set(0, -0.26, -0.38);
  head.add(mouth);

  /* ---- arms: long, ending in fingers ------------------------------- */
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.72, 2.25, 0);
    spine.add(shoulder);
    const upper = mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.7, 6), skin);
    upper.position.y = -0.85;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -1.7;
    shoulder.add(elbow);
    const fore = mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.9, 6), skin);
    fore.position.y = -0.95;
    elbow.add(fore);

    const wrist = new THREE.Group();
    wrist.position.y = -1.9;
    elbow.add(wrist);
    const palm = mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), skin);
    wrist.add(palm);
    for (let f = 0; f < 4; f++) {          // fingers, splayed and too long
      const fg = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 5), skin);
      fg.position.set((f - 1.5) * 0.085, -0.45, 0);
      fg.rotation.z = (f - 1.5) * 0.13;
      wrist.add(fg);
    }
    arms.push({ shoulder, elbow, wrist });
  }

  /* ---- legs: knees the wrong way ----------------------------------- */
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.42, -0.4, 0);
    hips.add(hip);
    const thigh = mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.1, 6), skin);
    thigh.position.y = -1.05;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -2.1;
    hip.add(knee);
    const shin = mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 6), skin);
    shin.position.y = -1.1;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -2.2;
    knee.add(ankle);
    const foot = mesh(new THREE.BoxGeometry(0.34, 0.16, 0.9), skin);
    foot.position.set(0, -0.08, -0.18);
    ankle.add(foot);

    legs.push({ hip, knee, ankle });
  }

  g.position.set(x, 0, z);
  g.userData = {
    hips, spine, neck, head, arms, legs,
    step: Math.random() * 6.283,
    lurch: 0, lurchT: Math.random() * 2,
    stun: 0, cloth: null, tremble: 0,
  };
  scene.add(g);
  return g;

  function mesh(geo, m) {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true; o.receiveShadow = true;
    return o;
  }
}

/**
 * Animate one creature.
 *
 * @param c        the group from makeCreature
 * @param dt       seconds
 * @param moving   is it actually walking this frame
 * @param frozen   is the torch on it
 * @param near     0..1, how close the player is
 */
export function poseCreature(c, dt, moving, frozen, near) {
  const u = c.userData;

  if (frozen) {
    /* CAUGHT. Dead still, except that it is not quite still: the hands
       shake and the head rolls, which is worse than motionless. */
    u.tremble = Math.min(1, u.tremble + dt * 3);
    const t = u.tremble;
    const sh = Math.sin(performance.now() * 0.045) * 0.02 * t;
    u.spine.rotation.x = 0.55 + sh;
    u.neck.rotation.x = -0.35 + sh * 2;
    u.head.rotation.z = Math.sin(performance.now() * 0.011) * 0.16 * t;
    u.head.rotation.y = Math.sin(performance.now() * 0.007) * 0.10 * t;
    for (const a of u.arms) {
      a.shoulder.rotation.x = 0.25 + sh * 3;
      a.elbow.rotation.x = -0.5;
      a.wrist.rotation.z = Math.sin(performance.now() * 0.05 + a.shoulder.position.x) * 0.25 * t;
    }
    for (const l of u.legs) { l.hip.rotation.x = 0; l.knee.rotation.x = -0.15; }
    return;
  }

  u.tremble = Math.max(0, u.tremble - dt * 2);

  /* LURCHES, not a walk. Three fast steps, then a beat of nothing. */
  u.lurchT -= dt;
  if (u.lurchT <= 0) {
    u.lurch = u.lurch > 0.5 ? 0 : 1;
    u.lurchT = u.lurch ? 0.75 + Math.random() * 0.5 : 0.25 + Math.random() * 0.45;
  }
  const gait = moving ? (u.lurch ? 1 : 0.12) : 0;
  u.step += dt * (7.5 * gait + 0.6);

  const sw = Math.sin(u.step), sw2 = Math.cos(u.step);
  /* folded forward, and further forward the closer it is */
  u.spine.rotation.x = 0.5 + near * 0.35 + Math.abs(sw) * 0.06 * gait;
  u.neck.rotation.x = -0.3 - near * 0.25;
  u.head.rotation.y = Math.sin(u.step * 0.31) * 0.22;
  u.head.rotation.z = Math.sin(u.step * 0.17) * 0.12;
  u.hips.position.y = 4.6 - Math.abs(sw) * 0.18 * gait;

  for (let i = 0; i < u.arms.length; i++) {
    const s = i ? 1 : -1;
    const a = u.arms[i];
    a.shoulder.rotation.x = 0.2 + s * sw * 0.5 * gait;
    a.shoulder.rotation.z = s * (0.12 + Math.abs(sw2) * 0.1 * gait);
    a.elbow.rotation.x = -0.45 - Math.abs(sw2) * 0.35 * gait;
    a.wrist.rotation.x = 0.2 * sw2;
  }
  for (let i = 0; i < u.legs.length; i++) {
    const s = i ? 1 : -1;
    const l = u.legs[i];
    l.hip.rotation.x = s * sw * 0.7 * gait;
    /* the knee bends the WRONG WAY - positive, where a person's is
       negative - which is the whole trick of the legs */
    l.knee.rotation.x = Math.max(0, s * sw2 * 0.8) * gait;
    l.ankle.rotation.x = -s * sw * 0.3 * gait;
  }
}
