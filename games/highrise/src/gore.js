// =====================================================================
// HIGHRISE :: gore.js - PARTS THAT COME OFF
// =====================================================================
//
// Liam: *"add in flying off body parts that get chopped off"*.
//
// This is the one thing the whole rebuild has been quietly setting up
// for, and it is nearly free now because the men have SKELETONS. Taking
// an arm off is two things:
//
//   1. COLLAPSE THE BONE. Setting a bone's scale to almost zero pulls
//      every vertex it owns onto its own joint, so the forearm vanishes
//      into the elbow. No second mesh, no cutting geometry, no seam - the
//      skinning does it, and it is exact, because those are precisely the
//      vertices that limb was made of.
//   2. THROW A MATCHING PIECE. A box in the actor's own texture, with the
//      right island mapped onto it, given the velocity of whatever took
//      it off, plus spin. It bounces once and stays where it lands.
//
// And then the stump bleeds. That is the part that sells it: a limb that
// comes off and a body that does not react is a prop breaking. An
// arterial jet from the shoulder for two seconds, tracking the body as it
// falls, is an injury.
//
// A head is the same trick with the face island on the front of the box,
// which is worth the four lines it costs: a head that comes off and lands
// looking at you is the single most quoted image in the genre.
import * as THREE from '../vendor/three.module.js';
import ASSET from '../assets/refman.js';
import { toCell, W, D, EMPTY } from './plan.js';

// which bone chain a severed part removes, and what shape flies off
//
// The joint is where the cut IS - the bone named here is collapsed, so
// `elbowR` takes the forearm and hand and leaves the upper arm.
export const PARTS = {
  armR:  { bone: 'elbowR', at: 'elbowR', isl: 'armR', size: [0.085, 0.085, 0.34], mass: 0.9 },
  armL:  { bone: 'elbowL', at: 'elbowL', isl: 'armL', size: [0.085, 0.085, 0.34], mass: 0.9 },
  legR:  { bone: 'kneeR',  at: 'kneeR',  isl: 'legR', size: [0.105, 0.105, 0.40], mass: 1.4 },
  legL:  { bone: 'kneeL',  at: 'kneeL',  isl: 'legL', size: [0.105, 0.105, 0.40], mass: 1.4 },
  head:  { bone: 'head',   at: 'head',   isl: 'headFront', size: [0.185, 0.215, 0.195], mass: 1.0,
           back: 'headBack' },
};

/** map a box's faces into one island of the actor's texture sheet */
function skinBox(size, isl, back) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const I = ASSET.islands[isl], B = ASSET.islands[back || isl];
  if (!I) return g;
  const uv = g.attributes.uv;
  const put = (face, R) => {
    const [u0, v0, u1, v1] = R.rect;
    // BoxGeometry lays its faces out four vertices at a time in the order
    // +x, -x, +y, -y, +z, -z, so a face is a known block of the buffer.
    const o = face * 4;
    uv.setXY(o + 0, u0, v1); uv.setXY(o + 1, u1, v1);
    uv.setXY(o + 2, u0, v0); uv.setXY(o + 3, u1, v0);
  };
  // -Z is the front of a head on this model, so that is the face that
  // gets the face.
  for (let f = 0; f < 6; f++) put(f, f === 5 ? I : B);
  uv.needsUpdate = true;
  return g;
}

export class Gore {
  constructor(scene, blood) {
    this.scene = scene;
    this.blood = blood;
    this.pieces = [];
    this.stumps = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /**
   * Take `part` off `actor`, thrown along `dir`.
   * Returns false if that part is already gone.
   */
  sever(a, part, dir, force = 1) {
    const P = PARTS[part];
    if (!P) return false;
    a.gone = a.gone || {};
    if (a.gone[part]) return false;
    a.gone[part] = true;

    const bone = a.body.by[P.bone];
    const joint = a.body.by[P.at];
    if (!bone || !joint) return false;

    // where the joint is in the world, before we collapse anything
    joint.updateWorldMatrix(true, false);
    const at = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);
    const q = new THREE.Quaternion().setFromRotationMatrix(joint.matrixWorld);

    // 1. THE LIMB VANISHES INTO ITS OWN JOINT.
    //
    // Not scale 0 - a zero scale makes a degenerate matrix and three.js
    // produces NaN normals from it, which turns the whole body black.
    bone.scale.setScalar(0.0015);

    // 2. AND A MATCHING PIECE GOES FLYING
    const geo = skinBox(P.size, P.isl, P.back);
    const m = new THREE.Mesh(geo, a.mesh.material);
    m.position.copy(at);
    m.quaternion.copy(q);
    m.frustumCulled = false;
    this.group.add(m);

    const spd = (3.2 + Math.random() * 4.5) * force;
    this.pieces.push({
      m,
      v: new THREE.Vector3(
        dir.x * spd + (Math.random() - 0.5) * 2.4,
        2.4 + Math.random() * 3.4,
        dir.z * spd + (Math.random() - 0.5) * 2.4),
      spin: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22,
                              (Math.random() - 0.5) * 22),
      life: 14, rest: false, drip: 0, mass: P.mass, base: a.base || 0,
    });
    if (this.pieces.length > 40) {
      const old = this.pieces.shift();
      this.group.remove(old.m); old.m.geometry.dispose();
    }

    // 3. AND THE STUMP OPENS UP
    //
    // Tracked against the JOINT rather than against a fixed point, so it
    // keeps coming out of the right place while the body falls over.
    this.stumps.push({ joint, t: 0, dur: 1.8 + Math.random() * 0.8, dir });
    this.blood.spray(at.x, at.y, at.z, dir.x, 0.55, dir.z, 70, 1.7);
    return true;
  }

  /**
   * What a hit takes off, if anything. Only edges and point-blank
   * shotguns - a pistol round does not remove an arm, and having it do so
   * makes every weapon feel the same.
   */
  static severs(weaponId, part, range, lethal) {
    if (!PARTS[part]) return false;
    if (weaponId === 'axe') return lethal ? 0.85 : 0.30;
    if (weaponId === 'knife') return lethal ? 0.45 : 0.10;
    if (weaponId === 'shotgun' && range < 3.5) return lethal ? 0.55 : 0.12;
    if (weaponId === 'bat' && part === 'head') return 0;      // blunt: no
    return 0;
  }

  step(dt, P) {
    // ---- the pieces ---------------------------------------------------
    for (const p of this.pieces) {
      if (p.rest) continue;
      p.life -= dt;
      p.v.y -= 21 * dt;
      const ox = p.m.position.x, oz = p.m.position.z;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      p.m.rotation.z += p.spin.z * dt;

      // ---- WALLS ARE WALLS, even for an arm ---------------------------
      //
      // Liam: *"make flying body parts not ignore wall collider and fly
      // out of the building"*. They did: the only thing a piece collided
      // with was the floor, so a shotgun blast at the window wall posted
      // somebody's forearm out over Manhattan.
      //
      // Tested against the plan GRID rather than against the solid list,
      // for the same reason the blood is (see blood.js): a floor is a
      // thousand boxes and this runs on forty pieces every frame, but the
      // grid answers in constant time AND says which face was crossed, so
      // the bounce comes off the right wall.
      if (P) {
        const [cx, cz] = toCell(p.m.position.x, p.m.position.z);
        const solid = cx < 0 || cz < 0 || cx >= W || cz >= D || P.at(cx, cz) !== EMPTY;
        if (solid) {
          const [px, pz] = toCell(ox, oz);
          if (cx !== px) { p.m.position.x = ox; p.v.x *= -0.34; }
          if (cz !== pz) { p.m.position.z = oz; p.v.z *= -0.34; }
          if (cx === px && cz === pz) { p.m.position.set(ox, p.m.position.y, oz); p.v.multiplyScalar(-0.3); }
          p.v.multiplyScalar(0.75);
          p.spin.multiplyScalar(0.6);
          // and it leaves a mark where it hit, which is the whole point
          this.blood.spray(p.m.position.x, p.m.position.y, p.m.position.z,
                           -p.v.x * 0.08, 0.1, -p.v.z * 0.08, 6, 0.7);
        }
      }
      // AND THE CEILING IS HIS CEILING. With the building stacked these
      // were absolute heights, so an arm taken off on floor five bounced
      // off a plane down in the lobby.
      if (p.m.position.y >= p.base + 2.94) { p.m.position.y = p.base + 2.94; p.v.y = -Math.abs(p.v.y) * 0.3; }
      // A LIMB IN THE AIR IS STILL BLEEDING, and the arc it leaves on the
      // floor and the walls is most of what reads as violence rather than
      // as an object being thrown.
      p.drip -= dt;
      if (p.drip <= 0) {
        p.drip = 0.03;
        this.blood.spray(p.m.position.x, p.m.position.y, p.m.position.z,
                         p.v.x * 0.1, -0.2, p.v.z * 0.1, 2, 0.35);
      }
      if (p.m.position.y <= p.base + 0.07) {
        p.m.position.y = p.base + 0.07;
        if (p.v.y < -2.2) {
          p.v.y *= -0.30; p.v.multiplyScalar(0.5); p.spin.multiplyScalar(0.45);
          this.blood.floor(p.m.position.x, p.m.position.z, 0.7 + Math.random() * 0.5, p.base);
        } else {
          p.rest = true;
          this.blood.pool(p.m.position.x, p.m.position.z, 0.8, p.base);
        }
      }
    }
    // ---- the stumps ---------------------------------------------------
    for (let i = this.stumps.length - 1; i >= 0; i--) {
      const s = this.stumps[i];
      s.t += dt;
      if (s.t >= s.dur) { this.stumps.splice(i, 1); continue; }
      s.joint.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(s.joint.matrixWorld);
      // ARTERIAL, so it pulses. A steady stream is a hosepipe; a pulse is
      // a heart that has not caught up yet.
      const beat = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(s.t * 9.5)), 3);
      const fade = 1 - s.t / s.dur;
      this.blood.spray(p.x, p.y, p.z, s.dir.x * 0.4, 0.9, s.dir.z * 0.4,
                       Math.round(3 * beat * fade) + 1, 1.15 * beat * fade);
    }
  }

  clear() {
    for (const p of this.pieces) { this.group.remove(p.m); p.m.geometry.dispose(); }
    this.pieces = []; this.stumps = [];
  }
}
