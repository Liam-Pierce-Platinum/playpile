// The three playable classes, built from tapered tubes and low-poly spheres
// with painted textures -- the Ocarina of Time / Mario 64 approach.
import * as THREE from 'three';
import { Rig, mat, box, HERO_PROPORTIONS } from './rig.js';
import { tube, ball, blob, cone, slab, lathe, shell, smooth, faceted } from './shapes.js';
import * as T from './textures.js';
import { NAMED, CLOTH, ACCENT, TRIM, SKIN, randOf } from './palette.js';

/* ---------------- weapons ----------------
 * Every weapon is modelled with its GRIP AT THE ORIGIN, so it can be dropped
 * into a fist without hunting for an offset. Blade / shaft runs along +Y.
 */

function makeSword(bladeColor, gripColor, trimColor) {
  const g = new THREE.Group();
  const steel = faceted(T.metalTex(bladeColor));
  const grip = smooth(T.leatherTex(gripColor));
  const gold = faceted(T.metalTex(trimColor));

  // blade: a long flattened taper, not a slab -- it catches light on the bevel
  const blade = tube(0.028, 0.052, 0.74, steel, 4, [0, 0.52, 0]);
  blade.scale.z = 0.38;
  blade.rotation.y = Math.PI / 4;
  g.add(blade);
  const tip = cone(0.052, 0.14, steel, 4, [0, 0.95, 0]);
  tip.scale.z = 0.38;
  tip.rotation.y = Math.PI / 4;
  g.add(tip);

  // fuller down the centre of the blade
  const fuller = tube(0.012, 0.016, 0.62, faceted(T.metalTex(T.shadeHex(bladeColor, -0.3))), 4, [0, 0.50, 0]);
  fuller.scale.z = 0.5;
  fuller.rotation.y = Math.PI / 4;
  g.add(fuller);

  // crossguard: tapered bar with flared tips
  const guard = tube(0.026, 0.034, 0.30, gold, 6, [0, 0.13, 0]);
  guard.rotation.z = Math.PI / 2;
  g.add(guard);
  g.add(ball(0.042, gold, 6, 4, [0.15, 0.13, 0]));
  g.add(ball(0.042, gold, 6, 4, [-0.15, 0.13, 0]));

  // grip in the fist, pommel below
  g.add(tube(0.030, 0.034, 0.20, grip, 6, [0, 0.02, 0]));
  g.add(blob(0.048, gold, [1, 0.85, 1], 6, 5, [0, -0.10, 0]));
  return g;
}

/**
 * A heater shield: curved face, riveted rim, raised boss and a painted device.
 * Built from a partial cylinder so it actually bows outward like a real shield.
 */
function makeShield(faceColor, trimColor) {
  const g = new THREE.Group();
  const faceMat = smooth(T.metalTex(faceColor));
  const rimMat = faceted(T.metalTex(trimColor));

  // Face: three curved bands narrowing toward the bottom, which is what makes a
  // heater shield read as a heater shield rather than a dinner plate.
  // The cylinder axis stays vertical and the arc is centred on +Z, so the plate
  // bows toward the enemy. Offsetting by -R puts the face at the group origin.
  const R = 0.40;
  const bands = [
    { y: 0.21, h: 0.24, t: 1.20 },
    { y: -0.01, h: 0.22, t: 1.04 },
    { y: -0.21, h: 0.20, t: 0.74 },
  ];
  for (const b of bands) {
    const s = shell(R, R, b.h, -b.t / 2, b.t, faceMat, 5);
    s.position.set(0, b.y, -R);
    g.add(s);
  }
  // pointed toe
  const toe = cone(0.115, 0.22, faceMat, 5, [0, -0.40, -0.03]);
  toe.rotation.x = Math.PI;
  toe.scale.z = 0.5;
  g.add(toe);

  // rim across the top, raised boss, and a simple cross device
  const rim = shell(R + 0.015, R + 0.015, 0.05, -0.62, 1.24, rimMat, 5);
  rim.position.set(0, 0.34, -R);
  g.add(rim);
  g.add(blob(0.080, rimMat, [1, 1, 0.5], 7, 5, [0, 0.02, 0.045]));
  g.add(slab(0.045, 0.34, 0.02, rimMat, [0, 0.04, 0.035]));
  g.add(slab(0.24, 0.045, 0.02, rimMat, [0, 0.12, 0.03]));

  // arm straps on the back
  const strap = smooth(T.leatherTex('#3d2b1c'));
  g.add(slab(0.28, 0.05, 0.03, strap, [0, 0.12, -0.14]));
  g.add(slab(0.28, 0.05, 0.03, strap, [0, -0.08, -0.14]));
  return g;
}

function makeStaff(woodColor, orbColor) {
  const g = new THREE.Group();
  const w = smooth(T.woodTex(woodColor));
  // gripped at the origin: shaft runs from below the fist to well above it
  g.add(tube(0.030, 0.040, 1.55, w, 6, [0, 0.42, 0]));
  // gnarled head cradling the orb
  g.add(ball(0.055, w, 6, 4, [0.035, 1.12, 0]));
  g.add(ball(0.048, w, 6, 4, [-0.035, 1.19, 0]));
  g.add(ball(0.040, w, 6, 4, [0.02, 1.26, 0]));

  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.10, 0),
    new THREE.MeshLambertMaterial({
      map: T.flatTex(orbColor),
      emissive: new THREE.Color(orbColor),
      emissiveIntensity: 0.9,
      fog: true,
    })
  );
  orb.position.y = 1.33;
  g.add(orb);
  g.userData.orb = orb;

  // binding where the hand sits, so the grip point is visible
  g.add(tube(0.038, 0.038, 0.10, smooth(T.leatherTex('#4a3520')), 6, [0, 0.0, 0]));
  return g;
}

function makeBow(woodColor, stringColor) {
  const g = new THREE.Group();
  const w = smooth(T.woodTex(woodColor));
  // Limbs run along Y and curve away in Z, so the bow faces forward when held.
  const limbs = [
    { y: 0.20, len: 0.34, rot: 0.16 },
    { y: 0.50, len: 0.30, rot: 0.46 },
    { y: -0.20, len: 0.34, rot: -0.16 },
    { y: -0.50, len: 0.30, rot: -0.46 },
  ];
  for (const l of limbs) {
    const seg = tube(0.020, 0.026, l.len, w, 5, [0, l.y, 0]);
    seg.rotation.x = l.rot;
    seg.position.z = -Math.abs(l.y) * 0.16;
    g.add(seg);
  }
  g.add(tube(0.030, 0.030, 0.16, smooth(T.leatherTex('#4a3520')), 6, [0, 0, 0]));
  // nocks + string
  g.add(ball(0.026, w, 5, 4, [0, 0.66, -0.14]));
  g.add(ball(0.026, w, 5, 4, [0, -0.66, -0.14]));
  const str = tube(0.006, 0.006, 1.33, smooth(T.flatTex(stringColor)), 3, [0, 0, -0.14]);
  g.add(str);
  g.userData.string = str;
  return g;
}

function makeQuiver(leatherColor, trimColor) {
  const g = new THREE.Group();
  const lm = smooth(T.leatherTex(leatherColor));
  g.add(tube(0.085, 0.070, 0.46, lm, 7, [0, 0, 0]));
  g.add(tube(0.095, 0.095, 0.05, smooth(T.leatherTex(trimColor)), 7, [0, 0.21, 0]));
  const feather = smooth(T.flatTex('#d8d3c4'));
  const shaft = smooth(T.woodTex('#8b6a3a'));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const x = Math.cos(a) * 0.042, z = Math.sin(a) * 0.042;
    g.add(tube(0.010, 0.010, 0.20, shaft, 3, [x, 0.32, z]));
    g.add(slab(0.045, 0.09, 0.012, feather, [x, 0.42, z]));
  }
  return g;
}

/* ---------------- garments ---------------- */

/** A robe / tunic skirt: a tapered open cone hanging from the waist. */
function addRobe(rig, material, len, rTop, rBot) {
  const r = shell(rTop, rBot, len, 0, Math.PI * 2, material, 9);
  r.position.y = -len / 2 + 0.04;
  rig.torso.add(r);
  return r;
}

/** A cape: a half-shell that can sway from the shoulders. */
/**
 * A cape: a half-shell that sways from the shoulders.
 *
 * @param clears  the widest radius of whatever it is worn OVER. A cape whose
 *   hem is narrower than the robe under it spends the whole walk cycle
 *   swinging through it -- one frame inside, the next outside. The hem is
 *   pushed out past this, and the shell is nudged backwards so it hangs behind
 *   the body rather than wrapping around it.
 */
function addCape(rig, material, len = 0.95, radius = 0.30, clears = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(0, rig.P.shoulderY + 0.08, 0);
  rig.torso.add(pivot);
  const rTop = Math.max(radius * 0.85, clears * 0.62 + 0.03);
  const rBot = Math.max(radius * 1.35, clears + 0.09);
  const c = shell(rTop, rBot, len, Math.PI * 0.42, Math.PI * 1.16, material, 7);
  c.position.set(0, -len / 2, -0.04);
  pivot.add(c);
  rig.cape = pivot;
  return pivot;
}

/* ---------------- the mirror ----------------
 * Every worn piece arrives on the look object as a VARIANT name plus, in
 * `o.col[slot]`, that piece's own colours. Kept per slot on purpose: flattened
 * together, buying a helmet would repaint the whole suit.
 */

/**
 * A piece's own colour if it has one, otherwise the fallback, otherwise the
 * character's base colour from the title screen.
 *
 * The FALLBACK beats the base colour on purpose: a hat with no colour of its
 * own should match the robe it is worn with, and the robe may itself have been
 * repainted by its piece. Consulting the base colour first put a default-blue
 * hat on top of a rust-red robe.
 */
function slotColour(o, slot, key, fallback) {
  return o.col?.[slot]?.[key] ?? fallback ?? o[key];
}

/**
 * Boots. Every class wears the same three shapes over different leather, so
 * they are built once here and handed the rig's shin and foot joints.
 *
 * The shin/foot MESHES are the leg itself and stay put -- these are pulled on
 * over the top, which is why nothing here has to line up with a bone length.
 */
function addBoots(rig, variant, leather, trimMat) {
  const P = rig.P;
  const boot = smooth(T.leatherTex(leather));
  for (const side of ['L', 'R']) {
    const shin = rig.legs[side].knee;
    const foot = rig.legs[side].ankle;
    switch (variant) {
      case 'greave':      // plate to the knee with a rolled lip
        shin.add(tube(P.legRTop * 1.30, P.legRBot * 1.34, P.shinH * 0.92, boot, 7,
          [0, -P.shinH * 0.46, 0]));
        shin.add(tube(P.legRTop * 1.42, P.legRTop * 1.42, 0.045, trimMat, 7,
          [0, -0.02, 0]));
        foot.add(slab(P.footW * 1.08, 0.075, P.footL * 1.05, boot, [0, -0.01, 0.03]));
        break;
      case 'riding':      // turned-down cuff at the calf
      case 'travel':
      case 'tallboot':
        shin.add(tube(P.legRTop * 1.22, P.legRBot * 1.28, P.shinH * 0.78, boot, 7,
          [0, -P.shinH * 0.52, 0]));
        shin.add(cone(P.legRTop * 1.52, 0.13, boot, 7, [0, -P.shinH * 0.14, 0]));
        foot.add(slab(P.footW * 1.06, 0.07, P.footL * 1.02, boot, [0, -0.012, 0.02]));
        break;
      case 'wrap':        // bound cloth, no sole to speak of
        for (let i = 0; i < 4; i++) {
          shin.add(tube(P.legRTop * 1.16, P.legRTop * 1.16, 0.055, boot, 6,
            [0, -P.shinH * (0.22 + i * 0.20), 0]));
        }
        break;
      case 'slipper':     // barely shoes
        foot.add(blob(P.footW * 0.62, boot, [1.0, 0.7, 1.5], 6, 4, [0, -0.012, 0.03]));
        break;
      case 'dragon': {    // clawed at the toe, scaled up the shin
        shin.add(tube(P.legRTop * 1.26, P.legRBot * 1.30, P.shinH * 0.86, boot, 7,
          [0, -P.shinH * 0.48, 0]));
        for (let i = 0; i < 3; i++) {
          shin.add(tube(P.legRTop * 1.36 - i * 0.012, P.legRTop * 1.36 - i * 0.012,
            0.035, trimMat, 6, [0, -P.shinH * (0.20 + i * 0.24), 0]));
        }
        foot.add(slab(P.footW * 1.04, 0.07, P.footL, boot, [0, -0.012, 0.02]));
        // three claws off the toe
        for (const dx of [-0.055, 0, 0.055]) {
          const claw = cone(0.026, 0.11, trimMat, 5, [dx, -0.028, P.footL * 0.62]);
          claw.rotation.x = Math.PI * 0.52;
          foot.add(claw);
        }
        break;
      }
      default:            // sabatons / soft boots: plated to the ankle
        shin.add(tube(P.legRTop * 1.18, P.legRBot * 1.22, P.shinH * 0.55, boot, 7,
          [0, -P.shinH * 0.64, 0]));
        foot.add(slab(P.footW * 1.04, 0.065, P.footL, boot, [0, -0.012, 0.02]));
        break;
    }
  }
}

/* ---------------- classes ---------------- */

function buildKnight(o) {
  const P = { ...HERO_PROPORTIONS, chestRTop: 0.27, chestRBot: 0.22, armRTop: 0.105 };
  // Armour colours come from the ARMOUR piece; a helmet recolours only itself.
  const aPrim = slotColour(o, 'armor', 'primary');
  const aSec = slotColour(o, 'armor', 'secondary');
  const aTrim = slotColour(o, 'armor', 'trim');
  const armorV = o.armor || 'plate';
  const helmV = o.helm || 'barbute';

  const plate = T.metalTex(aPrim);
  const darkPlate = T.metalTex(T.shadeHex(aPrim, -0.30));
  const mail = T.mailTex(T.shadeHex(aPrim, -0.48));
  const surcoat = T.clothTex(aSec);
  const gold = faceted(T.metalTex(aTrim));
  // Brigandine is cloth over iron, so its body reads as fabric, not steel.
  const bodyTex = armorV === 'brigandine' ? T.clothTex(aPrim) : plate;

  const rig = new Rig({
    head: smooth(T.flatTex('#1a1720')),      // hidden under the helm
    torso: faceted(bodyTex),
    upperArm: smooth(mail),
    foreArm: faceted(plate),
    hand: smooth(T.leatherTex('#3d2b1c')),
    thigh: smooth(mail),
    shin: faceted(darkPlate),
    foot: faceted(darkPlate),
  }, P);

  /* ---------------- helmet ----------------
   * Each of these is a different SILHOUETTE, not a repaint: a dome, a bucket,
   * a horned sallet, an open face and a skull crest read apart at 384x240,
   * which is the only resolution that matters here.
   */
  const helm = new THREE.Group();
  helm.position.y = P.headR * 0.92;
  rig.neck.add(helm);
  const hPlate = faceted(T.metalTex(slotColour(o, 'helm', 'primary', aPrim)));
  const hTrim = faceted(T.metalTex(slotColour(o, 'helm', 'trim', aTrim)));
  const dark = smooth(T.flatTex('#08080c'));

  if (helmV === 'great') {
    // a flat-topped bucket with a cross slit
    helm.add(tube(0.255, 0.265, 0.46, hPlate, 8, [0, -0.005, 0]));
    helm.add(lathe([[0.001, 0], [0.20, 0.005], [0.255, 0.03]], hPlate, 8, [0, 0.222, 0]));
    helm.add(slab(0.30, 0.042, 0.08, dark, [0, 0.045, 0.225]));          // eye slit
    helm.add(slab(0.05, 0.20, 0.08, dark, [0, -0.045, 0.228]));          // breath slot
    const band = tube(0.028, 0.028, 0.40, hTrim, 5, [0, 0.10, 0.16]);
    band.rotation.z = Math.PI / 2; band.scale.z = 0.55;
    helm.add(band);
  } else if (helmV === 'open') {
    // face bare above the cheek plates
    helm.add(lathe([
      [0.001, -0.06], [0.20, -0.07], [0.250, 0.01],
      [0.225, 0.13], [0.15, 0.21], [0.001, 0.235],
    ], hPlate, 9));
    for (const sx of [-1, 1]) {
      const cheek = slab(0.075, 0.20, 0.13, hPlate, [sx * 0.185, -0.10, 0.075]);
      cheek.rotation.y = sx * 0.30;
      helm.add(cheek);
    }
    const brow = tube(0.024, 0.024, 0.34, hTrim, 5, [0, 0.045, 0.175]);
    brow.rotation.z = Math.PI / 2; brow.scale.z = 0.6;
    helm.add(brow);
  } else if (helmV === 'horned') {
    helm.add(lathe([
      [0.001, -0.20], [0.19, -0.19], [0.245, -0.08],
      [0.252, 0.04], [0.20, 0.16], [0.001, 0.225],
    ], hPlate, 9));
    helm.add(slab(0.30, 0.045, 0.10, dark, [0, 0.005, 0.20]));
    // two horns curving up and back off the temples, four segments each
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const k = i / 3;
        const seg = cone(0.045 - k * 0.030, 0.11, hTrim, 6,
          [sx * (0.22 + k * 0.10), 0.03 + k * 0.20, -0.02 - k * 0.09]);
        seg.rotation.set(-0.45 - k * 0.35, 0, sx * (0.55 + k * 0.25));
        helm.add(seg);
      }
    }
  } else if (helmV === 'dragon') {
    // a drake skull worn as a crown: low dome, jaw over the brow, swept horns
    helm.add(lathe([
      [0.001, -0.20], [0.19, -0.19], [0.245, -0.08],
      [0.250, 0.05], [0.19, 0.17], [0.001, 0.215],
    ], hPlate, 9));
    helm.add(slab(0.30, 0.045, 0.10, dark, [0, 0.005, 0.20]));
    // the snout, projecting forward over the face
    const snout = lathe([
      [0.001, 0.24], [0.085, 0.15], [0.105, 0.02], [0.075, -0.10], [0.001, -0.16],
    ], hTrim, 6, [0, 0.055, 0.185]);
    snout.rotation.x = Math.PI * 0.52;
    snout.scale.set(1.25, 1, 0.75);
    helm.add(snout);
    // teeth
    for (const dx of [-0.055, 0, 0.055]) {
      const t = cone(0.018, 0.055, hTrim, 5, [dx, -0.015, 0.29]);
      t.rotation.x = Math.PI;
      helm.add(t);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const k = i / 3;
        const seg = cone(0.050 - k * 0.034, 0.12, hTrim, 6,
          [sx * (0.20 + k * 0.06), 0.06 + k * 0.14, -0.05 - k * 0.15]);
        seg.rotation.set(-0.95 - k * 0.30, 0, sx * (0.30 + k * 0.14));
        helm.add(seg);
      }
    }
  } else {
    // BARBUTE -- the original: lathed dome, brow ridge, visor slit, nose guard
    helm.add(lathe([
      [0.001, -0.22], [0.19, -0.21], [0.245, -0.10],
      [0.255, 0.02], [0.22, 0.14], [0.14, 0.21], [0.001, 0.235],
    ], hPlate, 9));
    helm.add(slab(0.30, 0.045, 0.10, dark, [0, 0.008, 0.20]));
    helm.add(slab(0.045, 0.20, 0.06, hPlate, [0, -0.06, 0.215]));   // nose guard
    const brow = tube(0.026, 0.026, 0.36, hTrim, 5, [0, 0.055, 0.175]);
    brow.rotation.z = Math.PI / 2;
    brow.scale.z = 0.6;
    helm.add(brow);
    // crest running front-to-back
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      helm.add(slab(0.05, 0.10 - k * 0.035, 0.07, smooth(surcoat),
        [0, 0.22 - k * 0.03, 0.10 - i * 0.075]));
    }
  }

  /* ---------------- the suit ---------------- */
  if (armorV === 'scale') {
    // overlapping bands down the chest instead of one smooth surcoat
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const band = shell(P.chestRTop * (1.06 - k * 0.02), P.chestRBot * (1.14 - k * 0.02),
        0.105, 0, Math.PI * 2, faceted(plate), 9);
      band.position.y = P.torsoH * 0.66 - i * 0.10;
      band.scale.z = P.torsoSquashZ;
      rig.torso.add(band);
    }
    addRobe(rig, faceted(darkPlate), 0.30, P.chestRBot * 1.08, P.chestRBot * 1.30);
  } else if (armorV === 'brigandine') {
    // quilted cloth with rivet rows -- softer shape, studded
    const coat = shell(P.chestRTop * 1.06, P.chestRBot * 1.16, P.torsoH * 0.86,
      0, Math.PI * 2, smooth(T.clothTex(aPrim)), 9);
    coat.position.y = P.torsoH * 0.40;
    coat.scale.z = P.torsoSquashZ;
    rig.torso.add(coat);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + row * 0.28;
        const r = P.chestRBot * 1.12;
        rig.torso.add(blob(0.020, gold, [1, 1, 0.6], 5, 4,
          [Math.sin(a) * r, P.torsoH * (0.24 + row * 0.18), Math.cos(a) * r * P.torsoSquashZ]));
      }
    }
    addRobe(rig, smooth(T.clothTex(aSec)), 0.36, P.chestRBot * 1.10, P.chestRBot * 1.40);
  } else if (armorV === 'gilt') {
    // parade armour: fluted breastplate under a short cape
    const sc = shell(P.chestRTop * 1.05, P.chestRBot * 1.12, P.torsoH * 0.82,
      0, Math.PI * 2, faceted(plate), 9);
    sc.position.y = P.torsoH * 0.42;
    sc.scale.z = P.torsoSquashZ;
    rig.torso.add(sc);
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.36;
      const flute = tube(0.014, 0.014, P.torsoH * 0.62, gold, 5,
        [Math.sin(a) * P.chestRBot * 1.10, P.torsoH * 0.42,
          Math.cos(a) * P.chestRBot * 1.10 * P.torsoSquashZ]);
      rig.torso.add(flute);
    }
    addRobe(rig, smooth(mail), 0.32, P.chestRBot * 1.06, P.chestRBot * 1.28);
    addCape(rig, smooth(T.clothTex(aSec)), 0.62, 0.30, P.chestRBot * 1.28);
  } else if (armorV === 'dragon') {
    // plated in hide: a scaled shell with a ridge of spines down the spine
    const sc = shell(P.chestRTop * 1.06, P.chestRBot * 1.14, P.torsoH * 0.84,
      0, Math.PI * 2, faceted(T.metalTex(aPrim)), 9);
    sc.position.y = P.torsoH * 0.42;
    sc.scale.z = P.torsoSquashZ;
    rig.torso.add(sc);
    for (let i = 0; i < 4; i++) {
      const k = i / 3;
      const spine = cone(0.048 - k * 0.016, 0.13 - k * 0.03, gold, 5,
        [0, P.torsoH * (0.70 - k * 0.19), -P.chestRBot * 1.02 * P.torsoSquashZ]);
      spine.rotation.x = -0.55;
      rig.torso.add(spine);
    }
    addRobe(rig, faceted(T.metalTex(T.shadeHex(aPrim, -0.35))), 0.34,
      P.chestRBot * 1.08, P.chestRBot * 1.34);
  } else {
    // PLATE -- the original surcoat over the breastplate
    const sc = shell(P.chestRTop * 1.04, P.chestRBot * 1.10, P.torsoH * 0.80,
      0, Math.PI * 2, smooth(surcoat), 9);
    sc.position.y = P.torsoH * 0.42;
    sc.scale.z = P.torsoSquashZ;
    rig.torso.add(sc);
    addRobe(rig, smooth(mail), 0.34, P.chestRBot * 1.06, P.chestRBot * 1.32);
  }

  // ---- pauldrons: rounded caps, gold-rimmed ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const sh = rig.arms[side].shoulder;
    sh.add(blob(P.armRTop * 1.75, faceted(plate), [1.15, 0.95, 1.15], 7, 5, [s * 0.012, 0.01, 0]));
    const rim = tube(0.016, 0.016, P.armRTop * 3.3, gold, 5, [s * 0.012, -0.075, 0]);
    rim.rotation.z = Math.PI / 2;
    sh.add(rim);
    // the dragon suit grows a spike off each pauldron
    if (armorV === 'dragon') {
      const spike = cone(0.042, 0.16, gold, 5, [s * 0.055, 0.06, -0.02]);
      spike.rotation.set(-0.5, 0, s * 0.7);
      sh.add(spike);
    }
  }

  // ---- belt ----
  const belt = tube(P.chestRBot * 1.12, P.chestRBot * 1.12, 0.09, smooth(T.leatherTex('#3d2b1c')), 9, [0, 0.06, 0]);
  belt.scale.z = P.torsoSquashZ;
  rig.torso.add(belt);
  rig.torso.add(blob(0.055, gold, [1, 1, 0.5], 6, 4, [0, 0.06, P.chestRBot * 0.98]));

  addBoots(rig, o.boots || 'sabaton',
    slotColour(o, 'boots', 'boot', T.shadeHex(aPrim, -0.30)), gold);

  // ---- gear: gripped in the fist, angled up into a ready stance ----
  const sword = makeSword(NAMED.steel, '#3d2b1c', aTrim);
  sword.rotation.set(Math.PI * 0.40, 0, -0.10);
  sword.position.set(0, -0.10, 0.01);
  rig.arms.R.hand.add(sword);

  // Strapped to the forearm. Its PITCH is driven by the animator every frame so
  // the face keeps pointing at the threat instead of tipping skyward whenever
  // the elbow bends -- a shield that faces the sky is just a hat.
  const shield = makeShield(aSec, aTrim);
  shield.rotation.set(0, -0.26, 0.04);
  shield.position.set(0.15, -0.15, 0.05);
  rig.arms.L.elbow.add(shield);

  rig.gear = { sword, shield };
  rig.rest = { shoulderX: -0.20, shoulderZ: 0.13, elbowXR: -0.62, elbowXL: -0.78 };
  return rig;
}

function buildWizard(o) {
  const P = {
    ...HERO_PROPORTIONS,
    chestRTop: 0.225, chestRBot: 0.20, armRTop: 0.082, armRBot: 0.068,
  };
  // Cloth colours come from the ROBE piece; a hat recolours only the hat.
  const rPrim = slotColour(o, 'robe', 'primary');
  const rSec = slotColour(o, 'robe', 'secondary');
  const rTrim = slotColour(o, 'robe', 'trim');
  const robeV = o.robe || 'arcane';
  const hatV = o.hat || 'slouch';

  const robe = T.clothTex(rPrim);
  const under = T.clothTex(rSec);
  const skin = o.skin;

  const rig = new Rig({
    // Pale, deep-set eyes under a heavy brow -- the default face reads as a
    // young man with wide eyes, which is not what is under that hat.
    // Only the brow is overridden. Setting eye/white here painted a solid
    // band straight across the face -- faceTex draws those as blocks, and at
    // 32px a "pale eye" is a stripe.
    head: smooth(T.faceTex(skin, { brow: '#cfc6ad', key: 'wiz' })),
    torso: smooth(robe),
    upperArm: smooth(robe),
    foreArm: smooth(under),
    hand: smooth(T.skinTex(skin)),
    thigh: smooth(under),
    shin: smooth(under),
    foot: smooth(T.leatherTex('#4a3520')),
  }, P);

  /* ---------------- hat ----------------
   * Brim and crown are always ONE lathed silhouette each, never a stack of
   * cones -- a staircase of tilted pieces is what this looked like before and
   * every join showed. What changes between hats is the profile and the lean.
   */
  const hat = new THREE.Group();
  hat.position.y = P.headR * 1.55;
  rig.neck.add(hat);
  const hatCloth = smooth(T.clothTex(slotColour(o, 'hat', 'primary', rPrim)));
  const hatTrim = smooth(T.clothTex(slotColour(o, 'hat', 'trim', rTrim)));

  if (hatV === 'tall') {
    // straight up, narrow brim: a scholar rather than a hedge wizard
    hat.add(lathe([
      [0.001, 0], [0.22, 0.005], [0.285, 0.028], [0.27, 0.050],
      [0.19, 0.070], [0.178, 0.095],
    ], hatCloth, 6));
    const crown = lathe([
      [0.178, 0], [0.163, 0.14], [0.140, 0.34], [0.108, 0.56],
      [0.068, 0.78], [0.032, 0.96], [0.001, 1.06],
    ], hatCloth, 6);
    crown.position.y = 0.088;
    crown.rotation.set(-0.05, 0, 0.02);
    hat.add(crown);
    hat.add(tube(0.185, 0.185, 0.05, hatTrim, 6, [0, 0.100, 0]));
  } else if (hatV === 'hood') {
    // no hat: a deep cowl leaving the beard and nothing else
    hat.position.y = P.headR * 0.86;
    const cowl = shell(0.255, 0.290, 0.44, 1.05, Math.PI * 2 - 2.10, hatCloth, 9);
    cowl.position.y = -0.06;
    hat.add(cowl);
    hat.add(blob(0.258, hatCloth, [1, 0.80, 1.05], 9, 5, [0, 0.12, -0.01]));
    const peak = cone(0.150, 0.24, hatCloth, 7, [0, 0.215, 0.095]);
    peak.rotation.x = Math.PI * 0.56;
    peak.scale.set(1.05, 1, 0.55);
    hat.add(peak);
  } else if (hatV === 'circlet') {
    // bare-headed but for a band: he has stopped hiding
    hat.position.y = P.headR * 0.92;
    const ring = tube(0.235, 0.235, 0.038, smooth(T.metalTex(
      slotColour(o, 'hat', 'trim', rTrim))), 9, [0, 0.055, 0]);
    hat.add(ring);
    const stone = blob(0.045, smooth(T.flatTex(rSec)), [1, 1.25, 0.6], 6, 4,
      [0, 0.075, 0.215]);
    hat.add(stone);
  } else if (hatV === 'dragon') {
    // a low mitre with two horns swept back off the temples
    hat.position.y = P.headR * 1.30;
    hat.add(lathe([
      [0.001, 0], [0.21, 0.005], [0.255, 0.030], [0.240, 0.055],
      [0.190, 0.075], [0.180, 0.10],
    ], hatCloth, 6));
    const crown = lathe([
      [0.180, 0], [0.170, 0.10], [0.145, 0.22], [0.100, 0.34], [0.001, 0.42],
    ], hatCloth, 6);
    crown.position.y = 0.092;
    crown.rotation.set(-0.12, 0, 0.04);
    hat.add(crown);
    hat.add(tube(0.186, 0.186, 0.05, hatTrim, 6, [0, 0.102, 0]));
    const horn = smooth(T.metalTex(slotColour(o, 'hat', 'trim', rTrim)));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const k = i / 3;
        const seg = cone(0.046 - k * 0.031, 0.13, horn, 6,
          [sx * (0.17 + k * 0.09), 0.10 + k * 0.17, -0.03 - k * 0.13]);
        seg.rotation.set(-0.70 - k * 0.30, 0, sx * (0.42 + k * 0.20));
        hat.add(seg);
      }
    }
  } else {
    // SLOUCH -- the original: wide brim, leaning crown, an old hat that has
    // given up. The slump is a rotation on the whole cone, not a staircase.
    hat.add(lathe([
      [0.001, 0], [0.26, 0.005], [0.36, 0.03], [0.34, 0.055],
      [0.22, 0.075], [0.205, 0.10],
    ], hatCloth, 6));
    const crown = lathe([
      [0.205, 0], [0.185, 0.10], [0.150, 0.24], [0.110, 0.40],
      [0.070, 0.56], [0.036, 0.70], [0.001, 0.80],
    ], hatCloth, 6);
    crown.position.y = 0.09;
    crown.rotation.set(-0.30, 0, 0.10);
    hat.add(crown);
    hat.add(tube(0.212, 0.212, 0.05, hatTrim, 6, [0, 0.105, 0]));
  }

  // ---- beard: stacked tapering spheres, wide at the cheeks, pointed below ----
  // Positioned in NECK space against the front of the head sphere -- anchoring
  // it to the head centre buries it inside the skull.
  const hairMat = smooth(T.clothTex(o.hair || '#d8d3c4'));
  const beard = new THREE.Group();
  rig.neck.add(beard);
  // A lathed WEDGE: wide at the cheeks, tapering to a point, one surface all
  // the way down. Four stacked spheres read as four spheres, which is exactly
  // what it looked like.
  const mane = lathe([
    [0.001, 0.10], [0.125, 0.055], [0.135, -0.02], [0.115, -0.10],
    [0.075, -0.18], [0.035, -0.25], [0.001, -0.30],
  ], hairMat, 6);
  mane.position.set(0, 0.055, 0.128);
  mane.scale.set(1.06, 1.0, 0.78);
  mane.rotation.x = 0.16;
  beard.add(mane);
  // the moustache, one piece across the lip
  const tash = blob(0.075, hairMat, [1.7, 0.44, 0.62], 6, 4, [0, 0.156, 0.176]);
  beard.add(tash);
  // and the eyebrows, which is most of a wizard's face
  for (const sx of [-1, 1]) {
    const brow = blob(0.040, hairMat, [1.5, 0.55, 0.7], 5, 4,
      [sx * 0.072, 0.222, 0.168]);
    brow.rotation.z = sx * 0.22;
    beard.add(brow);
  }

  /* ---------------- robe ----------------
   * The hem length is the whole silhouette of a wizard, so that is what the
   * pieces move. Every one of them keeps the cape clearing the hem -- a cape
   * narrower than the robe under it saws through it for the whole walk cycle.
   */
  const hemR = P.chestRBot * (robeV === 'ember' ? 1.85
    : robeV === 'verdant' ? 2.45 : 2.25);
  const hemLen = robeV === 'ember' ? 0.66 : robeV === 'verdant' ? 0.92 : 0.86;
  addRobe(rig, smooth(robe), hemLen, P.chestRBot * 1.05, hemR);
  addCape(rig, smooth(T.clothTex(rSec)), hemLen + 0.06, 0.28, hemR);
  const sash = tube(P.chestRBot * 1.06, P.chestRBot * 1.06, 0.10, smooth(T.clothTex(rTrim)), 9, [0, 0.12, 0]);
  sash.scale.z = P.torsoSquashZ;
  rig.torso.add(sash);

  if (robeV === 'star') {
    // a broad pale band at the hem, which is what makes it read as starfall
    const band = shell(hemR * 0.96, hemR, 0.16, 0, Math.PI * 2,
      smooth(T.clothTex(rTrim)), 9);
    band.position.y = -hemLen + 0.12;
    rig.torso.add(band);
  } else if (robeV === 'verdant') {
    // layered: a second, shorter shell over the first
    const layer = shell(P.chestRBot * 1.10, hemR * 0.80, hemLen * 0.55,
      0, Math.PI * 2, smooth(T.clothTex(rSec)), 9);
    layer.position.y = -hemLen * 0.28;
    rig.torso.add(layer);
  } else if (robeV === 'dragon') {
    // scaled shoulders and a smouldering hem
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      rig.arms[side].shoulder.add(blob(P.armRTop * 1.65,
        faceted(T.metalTex(rSec)), [1.2, 0.85, 1.2], 7, 5, [s * 0.010, 0.02, 0]));
    }
    const ember = shell(hemR * 0.97, hemR * 1.02, 0.12, 0, Math.PI * 2,
      smooth(T.flatTex(rTrim)), 9);
    ember.position.y = -hemLen + 0.09;
    rig.torso.add(ember);
  }

  // wide sleeves flaring at the elbow
  for (const side of ['L', 'R']) {
    const sl = shell(P.armRTop * 1.3, P.armRTop * 2.4, 0.30, 0, Math.PI * 2, smooth(robe), 7);
    sl.position.y = -0.15;
    rig.arms[side].shoulder.add(sl);
  }

  addBoots(rig, o.boots || 'slipper',
    slotColour(o, 'boots', 'boot', '#4a3520'), smooth(T.metalTex(rTrim)));

  const staff = makeStaff(NAMED.wood, rTrim);
  // Solved rather than guessed. At the old 0.10 the shaft leaned BACK over his
  // shoulder and the orb sat half a metre behind his head -- upright, but
  // facing the wrong way. 0.55 stands it up with the orb high and just in
  // front of him, where a wizard holds a staff.
  staff.rotation.set(0.55, 0, 0.06);
  staff.position.set(0.01, -0.10, 0.02);
  rig.arms.R.hand.add(staff);

  rig.gear = { staff, orb: staff.userData.orb };
  rig.rest = { shoulderX: -0.14, shoulderZ: 0.10, elbowXR: -0.55, elbowXL: -0.40 };
  return rig;
}

function buildArcher(o) {
  const P = { ...HERO_PROPORTIONS, chestRTop: 0.24, chestRBot: 0.195, armRTop: 0.088 };
  // Cloth and leather come from the GARMENT piece; a hood recolours the hood.
  const gPrim = slotColour(o, 'garb', 'primary');
  const gSec = slotColour(o, 'garb', 'secondary');
  const gTrim = slotColour(o, 'garb', 'trim');
  const garbV = o.garb || 'ranger';
  const hoodV = o.hood || 'cowl';

  const tunic = T.clothTex(gPrim);
  const leather = T.leatherTex(gSec);
  const hoodCloth = T.clothTex(slotColour(o, 'hood', 'trim', gTrim));

  const rig = new Rig({
    head: smooth(T.faceTex(o.skin, { brow: '#6b4f2e', key: 'arc' })),
    torso: smooth(tunic),
    upperArm: smooth(tunic),
    foreArm: smooth(leather),
    hand: smooth(T.leatherTex('#3d2b1c')),
    thigh: smooth(tunic),
    shin: smooth(leather),
    foot: smooth(T.leatherTex('#4a3520')),
  }, P);

  /* ---------------- hood ----------------
   * Never a closed dome: that hides the face entirely. Every variant leaves
   * the front open and shades the brow with a peak instead, because the peak
   * hung any lower reads as a blindfold rather than a hood.
   */
  const hood = new THREE.Group();
  hood.position.y = P.headR * 0.92;
  rig.neck.add(hood);
  const hm = smooth(hoodCloth);

  if (hoodV === 'capped') {
    // a stiff peak and a squared mantle: this one holds its shape
    const cowl = shell(0.250, 0.290, 0.36, 1.10, Math.PI * 2 - 2.20, hm, 9);
    cowl.position.y = -0.01;
    hood.add(cowl);
    hood.add(lathe([
      [0.001, 0.20], [0.16, 0.15], [0.255, 0.05], [0.268, -0.03],
    ], hm, 9, [0, 0.06, 0]));
    const peak = cone(0.165, 0.26, hm, 7, [0, 0.215, 0.130]);
    peak.rotation.x = Math.PI * 0.60;
    peak.scale.set(1.10, 1, 0.50);
    hood.add(peak);
  } else if (hoodV === 'band') {
    // hood down: hair and a strip of cloth
    const hair = smooth(T.clothTex(T.shadeHex(gSec, -0.20)));
    hood.add(blob(0.245, hair, [1, 0.80, 1.02], 9, 5, [0, 0.075, -0.012]));
    hood.add(tube(0.243, 0.243, 0.055, hm, 9, [0, 0.050, 0]));
    // a tail of cloth hanging off the back of the band
    const tail = slab(0.075, 0.26, 0.030, hm, [0.10, -0.075, -0.215]);
    tail.rotation.set(0.25, 0, 0.18);
    hood.add(tail);
  } else if (hoodV === 'dragon') {
    const cowl = shell(0.262, 0.290, 0.40, 0.95, Math.PI * 2 - 1.90, hm, 9);
    cowl.position.y = -0.02;
    hood.add(cowl);
    hood.add(blob(0.262, hm, [1, 0.74, 1], 9, 5, [0, 0.13, 0]));
    const peak = cone(0.148, 0.21, hm, 7, [0, 0.250, 0.108]);
    peak.rotation.x = Math.PI * 0.55;
    peak.scale.set(1.05, 1, 0.55);
    hood.add(peak);
    // horns off the temples, small: a hood is not a helmet
    const horn = smooth(T.metalTex(slotColour(o, 'hood', 'trim', gTrim)));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const k = i / 2;
        const seg = cone(0.036 - k * 0.022, 0.10, horn, 5,
          [sx * (0.19 + k * 0.07), 0.09 + k * 0.13, -0.04 - k * 0.11]);
        seg.rotation.set(-0.80 - k * 0.30, 0, sx * (0.40 + k * 0.18));
        hood.add(seg);
      }
    }
  } else {
    // COWL -- the original: wraps the back and sides, face left clear
    const cowl = shell(0.265, 0.285, 0.40, 0.95, Math.PI * 2 - 1.90, hm, 9);
    cowl.position.y = -0.02;
    hood.add(cowl);
    hood.add(blob(0.265, hm, [1, 0.72, 1], 9, 5, [0, 0.13, 0]));      // crown
    const peak = cone(0.145, 0.20, hm, 7, [0, 0.255, 0.105]);
    peak.rotation.x = Math.PI * 0.55;
    peak.scale.set(1.05, 1, 0.55);
    hood.add(peak);
    // The peak alone does the shading. An explicit shadow blob here lands
    // straight across the painted eyes and turns the face into a blindfold.
  }

  // the shoulder mantle belongs to the hood, and goes away with it
  if (hoodV !== 'band') {
    const mantle = shell(0.24, hoodV === 'capped' ? 0.39 : 0.36,
      hoodV === 'capped' ? 0.26 : 0.22, 0, Math.PI * 2, smooth(hoodCloth), 9);
    mantle.position.y = P.shoulderY + 0.02;
    rig.torso.add(mantle);
  }

  // ---- leather harness + belt ----
  const strap = tube(0.045, 0.045, 0.62, smooth(leather), 5, [0.10, P.torsoH * 0.50, 0]);
  strap.rotation.set(0, 0, 0.32);
  strap.scale.z = 0.5;
  rig.torso.add(strap);
  const belt = tube(P.chestRBot * 1.10, P.chestRBot * 1.10, 0.08, smooth(leather), 9, [0, 0.07, 0]);
  belt.scale.z = P.torsoSquashZ;
  rig.torso.add(belt);

  /* ---------------- garment ----------------
   * The tunic length and what is layered over it. This is the archer's
   * silhouette: short and strapped, or long and split like a coat.
   */
  if (garbV === 'scout') {
    // cut short and strapped down, nothing to snag
    addRobe(rig, smooth(tunic), 0.20, P.chestRBot * 1.04, P.chestRBot * 1.28);
    const cross = tube(0.042, 0.042, 0.60, smooth(leather), 5, [-0.10, P.torsoH * 0.50, 0]);
    cross.rotation.set(0, 0, -0.32);
    cross.scale.z = 0.5;
    rig.torso.add(cross);
  } else if (garbV === 'warden') {
    // a long split coat over the tunic: two panels, front and back
    addRobe(rig, smooth(tunic), 0.30, P.chestRBot * 1.04, P.chestRBot * 1.45);
    const coatMat = smooth(T.clothTex(gTrim));
    for (const [start, len] of [[Math.PI * 0.18, Math.PI * 0.64],
      [Math.PI * 1.18, Math.PI * 0.64]]) {
      const panel = shell(P.chestRBot * 1.16, P.chestRBot * 1.55, 0.72,
        start, len, coatMat, 9);
      panel.position.y = -0.28;
      rig.torso.add(panel);
    }
  } else if (garbV === 'ash') {
    addRobe(rig, smooth(tunic), 0.34, P.chestRBot * 1.04, P.chestRBot * 1.50);
  } else if (garbV === 'dragon') {
    addRobe(rig, smooth(tunic), 0.30, P.chestRBot * 1.04, P.chestRBot * 1.45);
    // scaled plates at the shoulder
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      rig.arms[side].shoulder.add(blob(P.armRTop * 1.60,
        faceted(T.metalTex(gSec)), [1.18, 0.82, 1.18], 7, 5, [s * 0.010, 0.02, 0]));
    }
  } else {
    // RANGER -- the original tunic skirt
    addRobe(rig, smooth(tunic), 0.30, P.chestRBot * 1.04, P.chestRBot * 1.45);
  }

  // bracers
  for (const side of ['L', 'R']) {
    rig.arms[side].elbow.add(
      tube(P.armRTop * 1.15, P.armRTop * 1.25, 0.17, smooth(T.leatherTex(gTrim)), 7,
        [0, -0.17, 0]));
  }

  addBoots(rig, o.boots || 'soft',
    slotColour(o, 'boots', 'boot', '#4a3520'), smooth(T.metalTex(gTrim)));

  const quiver = makeQuiver(gSec, gTrim);
  quiver.position.set(-0.16, P.torsoH * 0.62, -0.16);
  quiver.rotation.set(0.14, 0, -0.44);
  rig.torso.add(quiver);

  // Scaled down and carried high: at full size a bow held in a hanging hand
  // drags its lower limb through the ground.
  // Carried high and turned toward the camera. Held edge-on it reads as a
  // plain stick, and at full length its lower limb drags through the ground.
  const bow = makeBow(NAMED.wood, '#e6e0cf');
  bow.rotation.set(0.42, 1.30, 0.18);
  bow.position.set(0.03, 0.18, 0.04);
  bow.scale.setScalar(0.80);
  rig.arms.L.hand.add(bow);

  rig.gear = { bow, quiver };
  rig.rest = { shoulderX: -0.16, shoulderZ: 0.11, elbowXR: -0.52, elbowXL: -0.66 };
  return rig;
}

/* ---------------- public API ---------------- */

export const CLASSES = ['knight', 'wizard', 'archer'];

export const CLASS_INFO = {
  knight: {
    name: 'KNIGHT',
    blurb: 'Loots any close-quarters weapon and any armour off the dead.',
    special: 'JAB - a fast forward thrust',
  },
  wizard: {
    name: 'WIZARD',
    blurb: 'Finds new spells, and orbs that change his magic type.',
    special: 'FIRE BEAM - a stream of flame from the hand',
  },
  archer: {
    name: 'ARCHER',
    blurb: 'Loots bows and arrows. Dips 5 arrows per potion.',
    special: 'TWIN SHOT - two arrows at once',
  },
};

export const DEFAULT_LOOK = {
  knight: { primary: '#8a93a0', secondary: '#7a2b2b', trim: '#d4af37', skin: '#e0ac7e' },
  wizard: { primary: '#3c3a75', secondary: '#2f5d78', trim: '#d4af37', skin: '#e0ac7e', hair: '#d8d3c4' },
  archer: { primary: '#4a7a3f', secondary: '#8c6a3f', trim: '#5a5f4a', skin: '#c68642' },
};

const BUILDERS = { knight: buildKnight, wizard: buildWizard, archer: buildArcher };

export function buildCharacter(classId, look = {}) {
  const o = { ...DEFAULT_LOOK[classId], ...look };
  const rig = BUILDERS[classId](o);
  rig.classId = classId;
  rig.look = o;
  return rig;
}

export function randomLook(classId) {
  return {
    primary: randOf(CLOTH),
    secondary: randOf(ACCENT),
    trim: randOf(TRIM),
    skin: randOf(SKIN),
    hair: DEFAULT_LOOK[classId].hair,
  };
}
