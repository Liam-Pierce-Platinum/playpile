// =====================================================================
// PLAYPILE :: games/_deck/jelly.js - A BODY MADE OF JELLY
// =====================================================================
//
// Liam: *"make the jelly guys jelly look more like jelly like it should
// spread out when hitting the ground or when the ball hits them and it
// shouldn't just be shiny but also translucent"*.
//
// SPIKE had a first version of this inside it. This is that, pulled out
// so DUNK can use it too, and with the three things he asked for:
//
//   IT SPREADS. A landing does not just squash the body vertically, it
//   PUSHES IT OUT SIDEWAYS - volume goes somewhere, and jelly's volume
//   goes wide. There are two separate things doing that here: a squash
//   spring (which rings, so it wobbles rather than snapping back), and a
//   REST FLATTENING that stays while it is sitting on the floor, because
//   a blob at rest is a dome, not a ball.
//
//   IT SPREADS WHERE IT WAS HIT. An impact carries a DIRECTION now, and
//   the vertices on that side flatten more than the ones on the far side
//   for as long as the ring lasts. A ball in the face makes a face-shaped
//   dent, not a uniform pulse.
//
//   IT IS TRANSLUCENT. MeshPhysicalMaterial with real transmission,
//   thickness and an attenuation colour, so light goes INTO it, picks up
//   the body colour on the way through, and comes out the other side -
//   which is what makes something look like jelly rather than like a
//   shiny rubber ball. There is a `simple` fallback for the case where
//   transmission is too expensive (it costs an extra render pass).
//
// WHAT THE SIMULATION IS, precisely: one damped harmonic oscillator for
// the overall squash, plus four standing waves round the body (two, three,
// four and five lobed) each with its own frequency and decay. They beat
// against each other, so the surface never repeats, which is the
// difference between a simulation and an animation.
import * as THREE from './three.module.js';

export class Jelly {
  /**
   * @param {object} o
   * @param {number} o.r            radius
   * @param {THREE.Color|string} o.col
   * @param {number} [o.squashY]    resting scale on Y (0.82 = a dome)
   * @param {boolean} [o.simple]    skip transmission (cheaper)
   * @param {number} [o.seg]        sphere segments (30 is plenty)
   */
  constructor(o) {
    this.r = o.r;
    this.restY = o.squashY === undefined ? 0.84 : o.squashY;
    const col = new THREE.Color(o.col);

    this.group = new THREE.Group();
    const geo = new THREE.SphereGeometry(this.r, o.seg || 30, (o.seg || 30) * 0.7);

    // ---- the material ------------------------------------------------
    // Transmission is the expensive-but-correct one: three renders a
    // transmission pass and the body refracts what is behind it.
    // `attenuationColor` is what makes thick parts read as MORE coloured
    // than thin ones, which is the whole look of a gummy sweet.
    this.mat = o.simple
      ? new THREE.MeshPhongMaterial({
          color: col, transparent: true, opacity: 0.82,
          shininess: 90, specular: new THREE.Color(0xffffff),
        })
      : new THREE.MeshPhysicalMaterial({
          // TRANSMISSION WITHOUT AN ENVIRONMENT TO TRANSMIT is a trap.
          // At 0.55 with a tight attenuation distance the body refracts
          // the dark arena behind it and a bright orange jelly comes out
          // BROWN. So: less transmission, a longer attenuation distance,
          // a lighter attenuation colour, and a little emissive of its
          // own - which is what keeps the colour alive while light still
          // visibly passes through the thin parts.
          color: col,
          roughness: 0.15,
          metalness: 0.0,
          transmission: 0.34,
          thickness: this.r * 1.4,
          ior: 1.34,
          attenuationColor: col.clone().lerp(new THREE.Color(0xffffff), 0.35),
          attenuationDistance: this.r * 3.2,
          emissive: col.clone().multiplyScalar(0.14),
          clearcoat: 0.85,
          clearcoatRoughness: 0.1,
          transparent: true,
          opacity: 0.9,
          specularIntensity: 1.0,
        });

    this.body = new THREE.Mesh(geo, this.mat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.scale.set(1, this.restY, 1);
    this.group.add(this.body);

    // the rest pose. Every frame's deformation is computed FROM this, not
    // from the previous frame, or the arithmetic drifts and the body
    // slowly inflates.
    this.rest = geo.attributes.position.array.slice();

    // a brighter inner core, which is what sells depth in something
    // light passes through
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(this.r * 0.55, 16, 12),
      new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.35),
                                    transparent: true, opacity: 0.22 }));
    core.scale.set(1, 0.8, 1);
    this.group.add(core);
    this.core = core;

    // the highlight that says "wet"
    const gloss = new THREE.Mesh(
      new THREE.SphereGeometry(this.r * 0.42, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    gloss.position.set(-this.r * 0.3, this.r * 0.42, this.r * 0.34);
    gloss.scale.set(1, 0.5, 0.42);
    this.group.add(gloss);

    // ---- state -------------------------------------------------------
    this.squash = 0; this.squashV = 0;
    this.spread = 0;                      // resting flatten, 0..1
    this.hitDir = new THREE.Vector3(0, -1, 0);
    this.hitAmp = 0; this.hitVel = 0;
    this.modes = [
      { k: 2, amp: 0, vel: 0, w: 16, damp: 2.4, phase: 0 },
      { k: 3, amp: 0, vel: 0, w: 22, damp: 3.0, phase: 1.1 },
      { k: 4, amp: 0, vel: 0, w: 30, damp: 3.8, phase: 2.3 },
      { k: 5, amp: 0, vel: 0, w: 38, damp: 4.8, phase: 0.6 },
    ];
    this.dirty = false;
  }

  /** how high the centre must sit for the body to touch the ground */
  get lift() { return this.r * (this.restY * (1 - this.spread * 0.55) - this.squash * 0.5); }

  /**
   * Hit it.
   *
   * @param {number} hard   0..1 - how big the impact was
   * @param {THREE.Vector3} [dir]  which way the blow came FROM, in world
   *                               space. A landing is (0,-1,0).
   */
  hit(hard, dir) {
    this.squashV -= hard * 9;
    this.hitVel += hard * 7;
    if (dir) this.hitDir.copy(dir).normalize();
    for (const m of this.modes) m.vel += hard * (0.5 + Math.random() * 0.5) * (6 / m.k);
  }

  /**
   * One step.
   *
   * @param {number} dt
   * @param {boolean} grounded  is it sitting on something right now
   */
  step(dt, grounded) {
    const K = 115, C = 8.5;
    this.squashV += (-K * this.squash - C * this.squashV) * dt;
    this.squash += this.squashV * dt;
    this.squash = Math.max(-0.6, Math.min(0.6, this.squash));

    // the resting spread: it settles into a dome over about a fifth of a
    // second on the ground, and pulls back into a ball in the air
    const want = grounded ? 1 : 0;
    this.spread += (want - this.spread) * Math.min(1, dt * (grounded ? 7 : 11));

    this.hitVel += (-140 * this.hitAmp - 11 * this.hitVel) * dt;
    this.hitAmp += this.hitVel * dt;

    for (const m of this.modes) {
      m.vel += (-m.w * m.w * m.amp - 2 * m.damp * m.vel) * dt;
      m.amp += m.vel * dt;
    }

    // ---- the overall shape ------------------------------------------
    // VOLUME GOES SIDEWAYS. Squashing Y by s widens X and Z by about
    // half of it, which is why a landing looks like it spreads rather
    // than like it was scaled down.
    const sq = this.squash + this.spread * 0.16;
    const wide = 1 + sq * 0.55;
    this.body.scale.set(wide, this.restY * (1 - sq * 0.85), wide);

    // ---- and the surface --------------------------------------------
    let ringing = Math.abs(this.hitAmp) > 0.0008;
    for (const m of this.modes) if (Math.abs(m.amp) > 0.0006) ringing = true;
    const pos = this.body.geometry.attributes.position;
    if (!ringing) {
      if (this.dirty) {
        pos.array.set(this.rest);
        pos.needsUpdate = true;
        this.body.geometry.computeVertexNormals();
        this.dirty = false;
      }
      return;
    }

    // the impact direction, brought into the body's own space
    const d = this.hitDir;
    const t = performance.now() * 0.001;
    for (let i = 0; i < pos.count; i++) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1], z = this.rest[i * 3 + 2];
      const a = Math.atan2(z, x);
      const up = y / this.r;

      // the standing waves
      let w = 0;
      for (const m of this.modes) w += m.amp * Math.cos(m.k * a + m.phase + t * 0.6) * (1 - up * up * 0.4);

      // AND THE DENT. How much a vertex flattens depends on how much it
      // faces the blow: dot(normal, hitDir). Only the struck side moves,
      // which is what makes a ball in the face look like a ball in the face.
      const nx = x / this.r, ny = y / this.r, nz = z / this.r;
      const facing = Math.max(0, nx * -d.x + ny * -d.y + nz * -d.z);
      const dent = this.hitAmp * facing * facing * 0.55;

      const s = 1 + w * 0.22 - dent;
      pos.array[i * 3] = x * s;
      pos.array[i * 3 + 1] = y * (1 - w * 0.10 - dent * 0.4);
      pos.array[i * 3 + 2] = z * s;
    }
    pos.needsUpdate = true;
    this.body.geometry.computeVertexNormals();
    this.dirty = true;
  }
}

/**
 * A face for a jelly: two eyes and a mouth, as separate solids so they
 * ride on the surface rather than being painted on it.
 *
 * Kept here because both games want the same one, and because a jelly
 * with a face is a character while a jelly without one is a prop.
 */
export function jellyFace(j, look = 1) {
  const g = new THREE.Group();
  const r = j.r;
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dark = new THREE.MeshBasicMaterial({ color: 0x1d2430 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 10, 8), white);
    e.position.set(s * r * 0.32, r * 0.2, r * 0.8);
    g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 8, 6), dark);
    p.position.set(s * r * 0.32, r * 0.2, r * 0.92);
    g.add(p);
  }
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.17, r * 0.042, 6, 12, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x2a1a14 }));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -r * 0.1, r * 0.84);
  g.add(mouth);
  g.scale.x = look;
  j.group.add(g);
  j.face = g;
  return g;
}
