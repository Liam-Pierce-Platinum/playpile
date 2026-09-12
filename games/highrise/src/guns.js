// =====================================================================
// HIGHRISE :: guns.js - EIGHT WAYS TO CLEAR A ROOM
// =====================================================================
//
// Liam: *"have a knife, bat, shotgun, ak 47, glock, fire axe, and fire
// extenguisher as weapons"*, *"pull models from sketchfab and retexture
// them"*, and *"add in hand to hand combat"*.
//
// THE MODELS ARE DOWNLOADED NOW. The previous version built each weapon
// out of a dozen boxes on the reasoning that a 2004 gun model WAS a
// dozen boxes with the detail in its texture - which is true, and still
// produced things nobody could name across a room. A 196-triangle PSX AK
// has the one thing boxes cannot fake: a profile you recognise. So the
// geometry comes from Sketchfab (CC-BY, credited in assets/raw) via
// tools/bake_guns.mjs, and the SURFACE is still ours - the same
// hand-written metal, wood and polymer in tex.js that the walls use,
// which is what stops them looking imported.
//
// STATS ARE THE DESIGN. Liam asked for a fight needing "quick thinking
// and quickness of looting bodies", which means no weapon may simply be
// best. Each is the answer to a different question:
//
//   fists    always there, always enough if you are behind him
//   glock    weak, seventeen rounds - the gun you are down to
//   ak       the workhorse; loud, wants range, punishes spray
//   shotgun  wins any doorway, loses any corridor, five shells
//   knife    silent, instant, has to touch
//   bat      wide arc, staggers, no reload ever
//   axe      slow and lethal; a swing you commit to
//   ext      not a weapon: a smokescreen you can also swing
import * as THREE from '../vendor/three.module.js';
import { packGun } from './fparms.js';
import GEO from '../assets/guns.js';
import { T, surf } from './tex.js';
import { refProp, refReady } from './refprops.js';

export const GUNS = {
  // ---- hand to hand -------------------------------------------------
  //
  // Unarmed is a real weapon here, not a placeholder. It is fast, it has
  // almost no reach, and it staggers - so it wins when you are already
  // inside someone's guard and loses every other time. That is the
  // trade that makes closing the distance a decision.
  fists: { name: 'Fists', slot: 1, melee: true, unarmed: true, dmg: 17, rate: 0.24,
           reach: 1.35, arc: 0.75, stagger: 0.55, combo: true, sound: 'thump' },
  knife: { name: 'Machete', slot: 2, melee: true, dmg: 62, rate: 0.34, reach: 1.9,
           arc: 0.55, stagger: 0.2, exec: true, sound: 'stab' },
  bat:   { name: 'Louisville', slot: 3, melee: true, dmg: 40, rate: 0.54, reach: 2.4,
           arc: 1.10, stagger: 1.0, sound: 'thud' },
  axe:   { name: 'Fire Axe', slot: 4, melee: true, dmg: 98, rate: 0.88, reach: 2.2,
           arc: 0.80, stagger: 1.4, exec: true, sound: 'chop' },
  glock: { name: 'Glock 17', slot: 5, dmg: 22, rate: 0.11, mag: 17, spread: 0.014,
           recoil: 0.9, reload: 1.25, range: 40, pellets: 1, sound: 'pop',
           flash: 0.55 },
  ak:    { name: 'AK-47', slot: 6, dmg: 31, rate: 0.098, mag: 30, spread: 0.020,
           recoil: 1.8, reload: 2.1, range: 60, pellets: 1, auto: true, sound: 'crack',
           flash: 1.0 },
  shotgun: { name: 'Remington', slot: 7, dmg: 15, rate: 0.72, mag: 5, spread: 0.075,
           recoil: 4.2, reload: 0.55, shellByShell: true, range: 18, pellets: 9,
           sound: 'boom', flash: 1.7 },
  ext:   { name: 'Extinguisher', slot: 8, melee: true, dmg: 28, rate: 0.72, reach: 2.0,
           arc: 0.9, stagger: 1.2, spray: true, mag: 100, sound: 'clang' },
  // ---- the flare gun -------------------------------------------------
  //
  // Liam: *"add in a flare gun being able to be taken off of walls by
  // smashing open cases"*.
  //
  // One round, a very long reload, and it kills almost anything it hits -
  // so it is never the gun you fight with, it is the gun you save for the
  // door you know is going to open. It also LIGHTS the room it lands in
  // for the next quarter of a minute, which is the other half of why it
  // is worth carrying: in a building lit like this one, a flare is
  // information as much as it is damage.
  flare: { name: 'Flare Gun', slot: 9, dmg: 115, rate: 1.1, mag: 1, spread: 0.03,
           recoil: 3.0, reload: 2.4, range: 45, pellets: 1, sound: 'thunk',
           flash: 2.6, burns: true },
};
export const ORDER = ['fists', 'knife', 'bat', 'axe', 'glock', 'ak', 'shotgun', 'ext', 'flare'];

// ---------------------------------------------------------------------
// THE SURFACES
// ---------------------------------------------------------------------
//
// The baker cut each model into zones - barrel, handguard, receiver,
// stock - and box-projected UVs onto each, so these repeat correctly
// along a weapon instead of stretching. The tints are darker and dirtier
// than the walls use: a weapon that has been carried up sixty floors of
// this building is not showroom black.
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    steel: surf(T.metal('#3a3f46'), [1, 1]),
    poly:  surf(T.metal('#212429'), [1, 1]),
    wood:  surf(T.wood('#5a3a1e'), [1, 1]),
    red:   surf(T.metal('#8e2018'), [1, 1]),
    orange: surf(T.metal('#c8571a'), [1, 1]),
  };
  // The UVs are already in metres times a density, so the map must not
  // repeat-scale again on top of that.
  for (const k in MATS) { MATS[k].map.repeat.set(1, 1); MATS[k].map.wrapS = MATS[k].map.wrapT = THREE.RepeatWrapping; }
  return MATS;
}

// THE FLARE GUN IS THE PISTOL, FATTER AND ORANGE.
//
// There is no PSX flare pistol on Sketchfab worth the download, and a
// flare gun IS a stubby wide-bore pistol - so it is the same 224-triangle
// MK23 with the barrel bored out, in signal orange. That is not a
// compromise; that is how the era built weapon variants, and at a glance
// down a corridor the silhouette reads correctly.
const ALIAS = { flare: { from: 'glock', scale: [1.5, 1.15, 0.9], mat: 'orange' } };

// =====================================================================
// THE TWO LIAM SENT HIMSELF
// =====================================================================
//
// The reference pack includes a fire axe and a fire extinguisher, and
// they are better than either the Sketchfab versions or anything this
// project would build: the axe has a proper wedge head with a painted
// steel bit and a grain-textured haft, the extinguisher has a valve
// assembly, a hose and a printed label. Both are 128-pixel textures with
// nearest filtering, which is the whole look.
//
// So those two come from him. Each declares how to get from the way it
// was modelled to the way this game holds a weapon: -Z is the business
// end, +Y is up, and the origin is the grip.
const FROM_REF = {
  axe: { name: 'axe', rot: [-Math.PI / 2, 0, 0], grip: [0, 0, 0.30] },
  ext: { name: 'ext', rot: [0, 0, 0], grip: [0, -0.16, 0] },
};

const cache = new Map();
function baseGroup(id) {
  if (cache.has(id)) return cache.get(id);
  const ref = FROM_REF[id];
  if (ref && refReady()) {
    const inner = refProp(ref.name);
    if (inner) {
      inner.rotation.set(...ref.rot);
      const g = new THREE.Group();
      g.add(inner);
      // sit the grip on the origin, measured rather than guessed - the
      // two models are on completely different scales and neither
      // author put the origin anywhere useful
      const b = new THREE.Box3().setFromObject(g);
      const c = b.getCenter(new THREE.Vector3());
      inner.position.set(-c.x + ref.grip[0], -c.y + ref.grip[1], -c.z + ref.grip[2]);
      const b2 = new THREE.Box3().setFromObject(g);
      g.userData.muzzle = [0, 0, b2.min.z + 0.03];
      cache.set(id, g);
      return g;
    }
  }
  const alias = ALIAS[id];
  if (alias) {
    const g = baseGroup(alias.from).clone(true);
    g.scale.set(...alias.scale);
    const m = mats()[alias.mat];
    g.traverse((o) => { if (o.isMesh) o.material = m; });
    const src0 = GEO[alias.from];
    g.userData.muzzle = src0
      ? [src0.muzzle[0] * alias.scale[0], src0.muzzle[1] * alias.scale[1],
         src0.muzzle[2] * alias.scale[2]]
      : [0, 0, -0.2];
    cache.set(id, g);
    return g;
  }
  const src = GEO[id];
  const g = new THREE.Group();
  if (src) {
    const M = mats();
    for (const p of src.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.uv), 2));
      geo.setIndex(p.idx);
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, M[p.mat] || M.steel));
    }
  }
  g.userData.muzzle = src ? src.muzzle : [0, 0, -0.2];
  cache.set(id, g);
  return g;
}

/**
 * A weapon, ready to parent to a hand. The origin IS the grip and -Z IS
 * the way it points, both baked in - so it never needs an offset here.
 */
//
// AND WHICH GUNS COME FROM THE PACK.
//
// Liam: *"the old gun graphics is still there"* - because the arms rig
// draws the RetroWeaponPack's weapon and everything else in the building
// drew this file's. The pack covers the three firearms; the melee
// weapons, the extinguisher and the flare gun have no counterpart in it
// and keep the models here (the flare gun in particular is deliberately
// ours - it is the pistol bored out and painted signal orange, and a
// black pack pistol would not read as it at a glance).
const FROM_PACK = { glock: 'pistol', ak: 'rifle', shotgun: 'shotgun' };

export function weaponMesh(id) {
  const pack = FROM_PACK[id];
  if (pack) {
    // The GLB is loaded asynchronously and this call is synchronous and
    // on the hot path - a body drops a gun mid-fight. So hand back an
    // empty Group NOW and fill it when the pack arrives; the caller has
    // already parented it to a hand or a floor by then, and it fills in
    // place. If the pack never loads, this file's model goes in instead,
    // so a failed download is a downgrade rather than an invisible gun.
    const g = new THREE.Group();
    g.userData.muzzle = muzzleOfBuilt(id);
    packGun(pack).then((m) => {
      if (m) {
        const c = m.clone(true);
        g.add(c);
        g.userData.muzzle = m.userData.muzzle;
      } else {
        g.add(builtMesh(id));
      }
    });
    return g;
  }
  return builtMesh(id);
}

/** this file's own model, which is what everything used to get */
function builtMesh(id) {
  const base = baseGroup(id);
  if (!base.children.length) return new THREE.Group();
  // Clone rather than share: the same AK is in four men's hands and each
  // of them holds it at a different angle.
  const g = base.clone(true);
  g.userData.muzzle = base.userData.muzzle;
  return g;
}

function muzzleOfBuilt(id) {
  return baseGroup(id).userData.muzzle || [0, 0, -0.2];
}

/** where the flash comes out, in the weapon's own space */
export function muzzleOf(id) {
  // through baseGroup, so an aliased weapon reports its SCALED muzzle -
  // reading GEO directly gave the flare gun the pistol's barrel length
  // and put its flash inside the slide.
  const m = baseGroup(id).userData.muzzle || [0, 0, -0.2];
  return new THREE.Vector3(m[0], m[1], m[2]);
}

/** the pickup that sits on a body - the same model, lying on its side */
export function pickupModel(id) {
  const g = new THREE.Group();
  const w = weaponMesh(id);
  w.rotation.set(0, 0, Math.PI / 2);
  g.add(w);
  return g;
}
