// =====================================================================
// NASCAR :: crew.js - SEVEN MEN AND TWELVE SECONDS
// =====================================================================
//
// Liam: "pit stops". race.js already runs them - a car drives onto the
// pit road, holds the speed limit, stops on its box, waits for the clock
// and drives out, and the clock is fuel plus tyres plus whatever the
// crew have to straighten. That is the part that decides races.
//
// This is the part you watch. A NASCAR stop is five men over the wall
// and it is the most choreographed twelve seconds in sport:
//
//   THE JACKMAN runs round the right side, drops the jack under the
//   rail and throws the handle - the car comes UP, which is the moment
//   the stop visibly starts.
//   TWO TYRE CHANGERS, front and rear, hit five lug nuts each with a
//   gun. On the Next Gen car it is one nut, which is why stops went from
//   thirteen seconds to nine.
//   TWO TYRE CARRIERS bring the new wheels round and roll the old ones
//   back over the wall.
//   THE FUEL MAN holds a can into the back of the car for the whole
//   stop, which is why he is the one who never moves.
//
// Then the jack drops, and the car leaving the box before the jack has
// touched the ground is what a good stop looks like.
//
// It is all one instanced mesh per crew and a handful of matrices per
// frame: seven people, a jack, a fuel can and four tyres, moved by a
// timeline keyed off the same service clock race.js is counting down.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

/** merge a pile of primitives into one attribute-clean geometry */
function weld(parts) {
  const g = mergeGeometries(parts.map((p) => {
    const o = p.index ? p.toNonIndexed() : p;
    if (!o.attributes.uv) {
      o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(o.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
    }
    return o;
  }));
  g.computeVertexNormals();
  return g;
}

/**
 * A CREW MEMBER, IN TWO COLOURS.
 *
 * Liam: "have the visual crew helping". They were there - seven of them,
 * in the right places, on a timeline - but every one of them was a single
 * instanced mesh in a single flat team colour, so what arrived beside
 * your car was six orange sticks with their arms out. A man reads as a
 * man because his head is not the same colour as his overalls, so the
 * geometry is split in two: the SUIT takes the team's colour, and the
 * KIT - helmet, visor, boots, gloves, and the gun in a changer's hands -
 * is dark and does not.
 */
function suitGeometry() {
  const parts = [];
  const legs = new THREE.CylinderGeometry(0.13, 0.15, 0.70, 6, 1, true);
  legs.translate(0, 0.47, 0);
  parts.push(legs);
  const torso = new THREE.CylinderGeometry(0.21, 0.175, 0.62, 6, 1, true);
  torso.translate(0, 1.10, 0);
  parts.push(torso);
  // the shoulders, so the silhouette is not a pipe
  const yoke = new THREE.SphereGeometry(0.215, 7, 4);
  yoke.scale(1, 0.5, 0.8);
  yoke.translate(0, 1.38, 0);
  parts.push(yoke);
  for (const s of [1, -1]) {
    const arm = new THREE.CylinderGeometry(0.062, 0.055, 0.52, 5, 1);
    arm.rotateX(Math.PI / 2.6);
    arm.translate(s * 0.215, 1.16, 0.16);
    parts.push(arm);
  }
  return weld(parts);
}

/** the dark half: boots, gloves, helmet, visor */
function kitGeometry() {
  const parts = [];
  for (const s of [1, -1]) {
    const boot = new THREE.BoxGeometry(0.13, 0.11, 0.26);
    boot.translate(s * 0.075, 0.055, 0.03);
    parts.push(boot);
    const glove = new THREE.SphereGeometry(0.075, 5, 4);
    glove.translate(s * 0.235, 1.33, 0.40);
    parts.push(glove);
  }
  const helmet = new THREE.SphereGeometry(0.155, 8, 6);
  helmet.translate(0, 1.60, 0);
  parts.push(helmet);
  // the visor: a band round the front of it, which is the one detail that
  // turns a ball on a pipe into somebody looking at your left front wheel
  const visor = new THREE.SphereGeometry(0.158, 8, 6, 0, Math.PI, 1.0, 0.75);
  visor.rotateY(Math.PI / 2);
  visor.translate(0, 1.60, 0);
  parts.push(visor);
  return weld(parts);
}

/** the wheel gun a changer carries, held out in front of him */
function gunGeometry() {
  const parts = [];
  const body = new THREE.BoxGeometry(0.11, 0.15, 0.30);
  body.translate(0, 1.26, 0.46);
  parts.push(body);
  const barrel = new THREE.CylinderGeometry(0.045, 0.045, 0.26, 6);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 1.26, 0.70);
  parts.push(barrel);
  return weld(parts);
}

let MAN = null, KIT = null, GUN = null;

// ---------------------------------------------------------------------
// WHERE EACH MAN IS, AT EACH MOMENT OF THE STOP
// ---------------------------------------------------------------------
//
// Everything is in the CAR's frame: +z forward, +x left, metres. The
// right side of a Cup car is the pit-lane side, so every position below
// is negative x, which is the side the crew work from and the reason the
// television camera always sits there.
//
// `t` is 0 at the moment the car stops and 1 when the crew are back
// behind the wall.
const WALL_X = -4.6;          // where they wait, on the pit wall side

const ROLES = [
  {
    name: 'jackman',
    at(t) {
      if (t < 0.06) return [WALL_X, 1.0, 0];
      if (t < 0.5) return [-1.45, 1.0, lerp(0.6, 0.6, t)];   // front jack point
      if (t < 0.9) return [-1.45, 1.0, -0.9];                // round to the rear
      return [WALL_X, 1.0, 0];
    },
    face: () => -Math.PI / 2,
    works: true,                 // the jackman pumps
  },
  {
    name: 'front changer',
    at(t) {
      if (t < 0.10) return [WALL_X, 0.55, 1.4];
      if (t < 0.52) return [-1.28, 0.55, 1.42];
      if (t < 0.92) return [1.28, 0.55, 1.42];               // over to the left side
      return [WALL_X, 0.55, 1.4];
    },
    face: (t) => (t < 0.52 ? -Math.PI / 2 : Math.PI / 2),
    kneel: 0.5, works: true, gun: true,
  },
  {
    name: 'rear changer',
    at(t) {
      if (t < 0.10) return [WALL_X, 0.55, -1.4];
      if (t < 0.52) return [-1.28, 0.55, -1.38];
      if (t < 0.92) return [1.28, 0.55, -1.38];
      return [WALL_X, 0.55, -1.4];
    },
    face: (t) => (t < 0.52 ? -Math.PI / 2 : Math.PI / 2),
    kneel: 0.5, works: true, gun: true,
  },
  {
    name: 'front carrier',
    at(t) {
      if (t < 0.08) return [WALL_X, 1.0, 2.2];
      if (t < 0.52) return [-2.45, 1.0, 2.05];
      if (t < 0.92) return [2.45, 1.0, 2.05];
      return [WALL_X, 1.0, 2.2];
    },
    face: (t) => (t < 0.52 ? -Math.PI / 2 : Math.PI / 2),
  },
  {
    name: 'rear carrier',
    at(t) {
      if (t < 0.08) return [WALL_X, 1.0, -2.2];
      if (t < 0.52) return [-2.45, 1.0, -2.05];
      if (t < 0.92) return [2.45, 1.0, -2.05];
      return [WALL_X, 1.0, -2.2];
    },
    face: (t) => (t < 0.52 ? -Math.PI / 2 : Math.PI / 2),
  },
  {
    // THE FUEL MAN NEVER MOVES. He holds the can in the back of the car
    // for the whole stop, and he is the reason a splash-and-go is eight
    // seconds and a full tank is fourteen.
    name: 'fuel man',
    at(t) {
      if (t < 0.05) return [WALL_X, 1.0, -2.2];
      if (t < 0.95) return [-0.9, 1.0, -2.45];
      return [WALL_X, 1.0, -2.2];
    },
    face: () => 0,
  },
  {
    name: 'utility',
    at(t) {
      if (t < 0.2) return [WALL_X, 1.0, 2.6];
      if (t < 0.85) return [-1.2, 1.0, 2.75];                // tear-off on the windscreen
      return [WALL_X, 1.0, 2.6];
    },
    face: () => -Math.PI / 2,
  },
];

export class PitCrew {
  constructor(colour = 0xd93a2b) {
    if (!MAN) { MAN = suitGeometry(); KIT = kitGeometry(); GUN = gunGeometry(); }
    this.group = new THREE.Group();
    this.group.name = 'pitcrew';
    this.group.visible = false;
    this.mat = new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.9,
    });
    this.men = new THREE.InstancedMesh(MAN, this.mat, ROLES.length);
    this.men.castShadow = true;
    this.men.frustumCulled = false;
    this.group.add(this.men);
    // the dark half, on the same matrices: helmets, visors, boots, gloves
    this.kit = new THREE.InstancedMesh(KIT, new THREE.MeshStandardMaterial({
      color: 0x15171c, roughness: 0.38, metalness: 0.25, envMapIntensity: 1.2,
    }), ROLES.length);
    this.kit.castShadow = true;
    this.kit.frustumCulled = false;
    this.group.add(this.kit);
    // and two wheel guns, for the two changers
    this.guns = new THREE.InstancedMesh(GUN, new THREE.MeshStandardMaterial({
      color: 0xb8bcc4, roughness: 0.3, metalness: 0.8,
    }), 2);
    this.guns.castShadow = true;
    this.guns.frustumCulled = false;
    this.group.add(this.guns);

    // the jack, the fuel can and a spare tyre - small props, big signal
    this.jack = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.16, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.7 }),
    );
    this.jack.castShadow = true;
    this.group.add(this.jack);

    this.can = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.46, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.3 }),
    );
    this.can.castShadow = true;
    this.group.add(this.can);

    const tyre = new THREE.CylinderGeometry(0.37, 0.37, 0.30, 12, 1);
    tyre.rotateZ(Math.PI / 2);
    this.tyres = new THREE.InstancedMesh(tyre,
      new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.92 }), 4);
    this.tyres.castShadow = true;
    this.group.add(this.tyres);

    this.dummy = new THREE.Object3D();
    this.active = false;
  }

  /** the crew of the car being serviced: colour it in that team's accent */
  setColour(c) { this.mat.color.set(c); }

  /**
   * Put the crew round a car.
   *
   * @param pos   the car's world position
   * @param yaw   its heading
   * @param t     0..1 through the stop
   * @param lift  how high the jack has the car, for main.js to apply
   */
  serve(pos, yaw, t) {
    this.group.visible = true;
    this.active = true;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    // car frame -> world: forward is (sin, cos), left is (cos, -sin)
    const toWorld = (x, y, z) => [
      pos.x + z * s + x * c,
      pos.y + y,
      pos.z + z * c - x * s,
    ];
    /* WORKING, NOT STANDING. Every man was a static pose slid from one
       spot to the next, so five of the twelve seconds looked like a group
       of people who had come to watch. A crewman at his wheel is never
       still: this bobs him on the gun, leans him into the car and lets
       the jackman pump. It is one number per man per frame and it is the
       difference between a crew and a row of traffic cones. */
    const work = (i) => Math.sin(t * 46 + i * 1.7);
    let gi = 0;
    ROLES.forEach((role, i) => {
      const [x, y, z] = role.at(t);
      const busy = t > 0.12 && t < 0.9;
      const kneel = role.kneel && busy ? role.kneel : 0;
      const bob = busy && role.works ? work(i) * 0.035 : 0;
      const w = toWorld(x, 0, z);
      this.dummy.position.set(w[0], w[1] + Math.max(0, bob), w[2]);
      this.dummy.rotation.set(
        busy && role.works ? bob * 1.6 : 0,
        yaw + role.face(t),
        0,
      );
      const sc = 1 - kneel * 0.42;
      this.dummy.scale.set(1, sc, 1);
      this.dummy.updateMatrix();
      this.men.setMatrixAt(i, this.dummy.matrix);
      this.kit.setMatrixAt(i, this.dummy.matrix);
      // the two changers carry the guns, on the same matrix
      if (role.gun && gi < 2) { this.guns.setMatrixAt(gi++, this.dummy.matrix); }
    });
    // any gun with no changer goes under the floor rather than hanging in
    // the air at the origin of the world
    for (; gi < 2; gi++) {
      this.dummy.position.set(0, -50, 0);
      this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.guns.setMatrixAt(gi, this.dummy.matrix);
    }
    this.men.instanceMatrix.needsUpdate = true;
    this.kit.instanceMatrix.needsUpdate = true;
    this.guns.instanceMatrix.needsUpdate = true;

    // the jack: under the right rail, and it LIFTS
    const up = this.lift(t);
    const jw = toWorld(-1.15, 0.10 + up * 0.5, 0.1);
    this.jack.position.set(jw[0], jw[1], jw[2]);
    this.jack.rotation.set(0, yaw, -up * 0.25);
    const cw = toWorld(-0.85, 0.95, -2.35);
    this.can.position.set(cw[0], cw[1], cw[2]);
    this.can.rotation.set(0.5, yaw, 0);

    // four tyres lying about: the ones coming off, then the ones going on
    const spots = t < 0.55
      ? [[-2.2, 1.6], [-2.2, -1.6], [-2.6, 0.4], [-2.6, -0.4]]
      : [[2.2, 1.6], [2.2, -1.6], [-2.6, 0.4], [-2.6, -0.4]];
    spots.forEach(([x, z], i) => {
      const w = toWorld(x, 0.37, z);
      this.dummy.position.set(w[0], w[1], w[2]);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.tyres.setMatrixAt(i, this.dummy.matrix);
    });
    this.tyres.instanceMatrix.needsUpdate = true;
  }

  /**
   * How far off the ground the jack has the car, 0..1.
   *
   * Up fast at the start, down fast at the end, and DOWN BEFORE THE CREW
   * ARE CLEAR - a car leaving its box as the jack drops is what a good
   * stop looks like and a car sitting still waiting for its crew to walk
   * away is what a video game looks like.
   */
  lift(t) {
    if (t < 0.08) return t / 0.08 * 0.6;
    if (t < 0.5) return 0.6;
    if (t < 0.56) return 0.6;
    if (t < 0.9) return 0.6;
    if (t < 0.96) return (0.96 - t) / 0.06 * 0.6;
    return 0;
  }

  hide() {
    this.group.visible = false;
    this.active = false;
  }
}

/**
 * A pool of crews. There are forty pit boxes and at most a handful of
 * stops happening at once anywhere near the camera, so three crews get
 * handed round rather than four hundred and eighty people standing in the
 * pit lane all afternoon.
 */
export class CrewPool {
  constructor(scene, n = 4) {
    this.crews = [];
    for (let i = 0; i < n; i++) {
      const c = new PitCrew();
      scene.add(c.group);
      this.crews.push(c);
    }
  }

  /**
   * @param stops  [{ pos, yaw, t, colour, runner }] the stops in progress,
   *               nearest to the camera first
   */
  update(stops) {
    for (let i = 0; i < this.crews.length; i++) {
      const s = stops[i];
      if (!s) { this.crews[i].hide(); continue; }
      this.crews[i].setColour(s.colour);
      this.crews[i].serve(s.pos, s.yaw, s.t);
      if (s.runner) s.runner.jackLift = this.crews[i].lift(s.t) * 0.22;
    }
  }
}
