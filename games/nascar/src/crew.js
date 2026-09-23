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

/** a crew member: standing, about sixty triangles, facing +Z */
function manGeometry() {
  const parts = [];
  const legs = new THREE.CylinderGeometry(0.13, 0.15, 0.82, 6, 1, true);
  legs.translate(0, 0.41, 0);
  parts.push(legs);
  const torso = new THREE.CylinderGeometry(0.20, 0.17, 0.62, 6, 1, true);
  torso.translate(0, 1.10, 0);
  parts.push(torso);
  const head = new THREE.SphereGeometry(0.135, 7, 5);
  head.translate(0, 1.54, 0);
  parts.push(head);
  // arms, held forward - a pit crewman is always carrying something
  for (const s of [1, -1]) {
    const arm = new THREE.CylinderGeometry(0.058, 0.055, 0.56, 5, 1);
    arm.rotateX(Math.PI / 2.4);
    arm.translate(s * 0.22, 1.12, 0.18);
    parts.push(arm);
  }
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

let MAN = null;

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
    kneel: 0.5,
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
    kneel: 0.5,
  },
  {
    name: 'front carrier',
    at(t) {
      if (t < 0.08) return [WALL_X, 1.0, 1.9];
      if (t < 0.52) return [-1.85, 1.0, 1.8];
      if (t < 0.92) return [1.85, 1.0, 1.8];
      return [WALL_X, 1.0, 1.9];
    },
    face: (t) => (t < 0.52 ? -Math.PI / 2 : Math.PI / 2),
  },
  {
    name: 'rear carrier',
    at(t) {
      if (t < 0.08) return [WALL_X, 1.0, -1.9];
      if (t < 0.52) return [-1.85, 1.0, -1.8];
      if (t < 0.92) return [1.85, 1.0, -1.8];
      return [WALL_X, 1.0, -1.9];
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
    if (!MAN) MAN = manGeometry();
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
    ROLES.forEach((role, i) => {
      const [x, y, z] = role.at(t);
      const kneel = role.kneel && t > 0.12 && t < 0.9 ? role.kneel : 0;
      const w = toWorld(x, 0, z);
      this.dummy.position.set(w[0], w[1], w[2]);
      this.dummy.rotation.set(0, yaw + role.face(t), 0);
      const sc = 1 - kneel * 0.42;
      this.dummy.scale.set(1, sc, 1);
      this.dummy.updateMatrix();
      this.men.setMatrixAt(i, this.dummy.matrix);
    });
    this.men.instanceMatrix.needsUpdate = true;

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
