// =====================================================================
// APEX :: f1car.js - THE CAR, BUILT OUT OF NUMBERS
// =====================================================================
//
// No model file. An F1 car is a shape made of straight lines and hard
// creases, which is exactly what low-poly is good at, and building it
// from code means every part of it is in the right place relative to the
// physics rather than roughly scaled to fit.
//
// THE BODY IS LOFTED. A series of cross-sections down the length of the
// car, each one a ring of the same number of points, stitched together
// into a skin. That is how you get the tub narrowing into the nose and
// swelling over the sidepods without modelling anything, and it is why
// the silhouette reads as an F1 car from any angle instead of only from
// the side.
//
// ---------------------------------------------------------------------
// MODEL SPACE MATCHES THE PHYSICS, deliberately
// ---------------------------------------------------------------------
//   +Z is FORWARD     (physics body X)
//   +X is LEFT        (physics body Y)
//   +Y is UP
// so a wheel the physics calls (forward 1.96, left -1.0) is placed at
// (x -1.0, z 1.96) and nothing ever has to be converted.
import * as THREE from '../vendor/three.module.js';

// ---- the livery -------------------------------------------------------
const PAINT   = 0x1b2a4a;   // deep navy
const DARK    = 0x11161f;   // carbon
const ACCENT  = 0xe03a2f;   // the red
const TRIM    = 0xd8dee9;   // off white
const RUBBER  = 0x14161a;
const WALL    = 0xb8352c;   // the coloured band on the tyre
const RIM     = 0x8f98a5;   // a PALE alloy - see buildWheel
const SUIT    = 0x202736;
const SKIN    = 0xb98a63;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, flatShading: true, roughness: 0.45, metalness: 0.15, ...opts });

const M = {
  paint:  mat(PAINT, { roughness: 0.30, metalness: 0.25 }),
  dark:   mat(DARK,  { roughness: 0.55 }),
  accent: mat(ACCENT,{ roughness: 0.35 }),
  trim:   mat(TRIM,  { roughness: 0.40 }),
  rubber: mat(RUBBER,{ roughness: 0.92, metalness: 0.0 }),
  side:   mat(0x24272c, { roughness: 0.88, side: THREE.DoubleSide }),
  wall:   mat(WALL,  { roughness: 0.70, side: THREE.DoubleSide }),
  rim:    mat(RIM,   { roughness: 0.28, metalness: 0.85, side: THREE.DoubleSide }),
  nut:    mat(0xd8b24a, { roughness: 0.25, metalness: 0.9 }),
  spoke:  mat(0xb9c2cd, { roughness: 0.30, metalness: 0.80, side: THREE.DoubleSide }),
  suit:   mat(SUIT,  { roughness: 0.70 }),
  skin:   mat(SKIN,  { roughness: 0.80 }),
  glass:  mat(0x0a0d14, { roughness: 0.12, metalness: 0.50 }),
};

/**
 * Loft a skin through a list of cross-sections.
 *
 * Each section is { z, pts } where pts is a ring of [x, y] in the same
 * order and the same length every time. Consecutive rings are stitched
 * with two triangles per edge, and the two ends are capped with a fan.
 */
function loft(sections, material) {
  const n = sections[0].pts.length;
  const verts = [];
  const push = (a, b, c) => { verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
  const at = (s, i) => [s.pts[i][0], s.pts[i][1], s.z];

  for (let s = 0; s < sections.length - 1; s++) {
    const A = sections[s], B = sections[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(at(A, i), at(B, i), at(B, j));
      push(at(A, i), at(B, j), at(A, j));
    }
  }
  // caps, wound so they face outward at each end
  const first = sections[0], last = sections[sections.length - 1];
  for (let i = 1; i < n - 1; i++) {
    push(at(first, 0), at(first, i + 1), at(first, i));
    push(at(last, 0), at(last, i), at(last, i + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** a ring: a rounded box, w wide and h tall, sitting with its base at y0 */
function ring(w, h, y0, round = 0.30, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a superellipse - round enough to look moulded, square enough to crease
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = 2 / (1 + round * 3);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / p);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / p);
    pts.push([sx * w / 2, y0 + h / 2 + sy * h / 2]);
  }
  return pts;
}

/** a flat aerofoil element: chord long, span wide, with a little camber */
function wing(span, chord, thick, material) {
  const g = new THREE.BufferGeometry();
  const v = [];
  const seg = 5;
  const prof = (t) => -Math.sin(t * Math.PI) * chord * 0.18;   // camber
  const add = (a, b, c) => v.push(...a, ...b, ...c);
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const z0 = (t0 - 0.5) * chord, z1 = (t1 - 0.5) * chord;
    const y0 = prof(t0), y1 = prof(t1);
    const h = thick / 2;
    // top, bottom, and the two edges
    add([-span / 2, y0 + h, z0], [span / 2, y0 + h, z0], [span / 2, y1 + h, z1]);
    add([-span / 2, y0 + h, z0], [span / 2, y1 + h, z1], [-span / 2, y1 + h, z1]);
    add([-span / 2, y0 - h, z0], [span / 2, y1 - h, z1], [span / 2, y0 - h, z0]);
    add([-span / 2, y0 - h, z0], [-span / 2, y1 - h, z1], [span / 2, y1 - h, z1]);
    for (const s of [-1, 1]) {
      const x = s * span / 2;
      add([x, y0 - h, z0], [x, y0 + h, z0], [x, y1 + h, z1]);
      add([x, y0 - h, z0], [x, y1 + h, z1], [x, y1 - h, z1]);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/**
 * One wheel: a fat slick on a bright alloy rim.
 *
 * THE RIM HAS TO BE LIGHT. The first version used a dark grey for it,
 * which against black rubber made each wheel a featureless disc - and on
 * a car whose four wheels are its most visible feature, and are usually
 * the only part of it a chase camera sees clearly, that read as four
 * holes. A pale alloy against the tyre also gives the eye something to
 * track, so the wheels are visibly SPINNING rather than just present.
 */
function buildWheel(radius, width) {
  const g = new THREE.Group();

  // the tread
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18, 1, true), M.rubber);
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  g.add(tyre);

  // THE SIDEWALL IS A RING, NOT A DISC, and that is the whole fix. As a
  // solid disc it sat outside the rim and covered it completely, so all
  // the work below - alloy, spokes, nut - was hidden inside a black
  // cylinder and every wheel rendered as a featureless hole. A ring
  // leaves the middle open for the rim to show through.
  const rimR = radius * 0.60;
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.RingGeometry(rimR, radius * 0.995, 20), M.side);
    side.rotation.y = s * Math.PI / 2;
    side.position.x = s * (width / 2 - 0.004);
    g.add(side);

    // the compound stripe, the way a slick is marked
    const band = new THREE.Mesh(new THREE.RingGeometry(radius * 0.80, radius * 0.87, 20), M.wall);
    band.rotation.y = s * Math.PI / 2;
    band.position.x = s * (width / 2 - 0.002);
    g.add(band);

    // the rim face, set just inside the sidewall so the ring frames it
    const face = new THREE.Mesh(new THREE.CircleGeometry(rimR, 14), M.rim);
    face.rotation.y = s * Math.PI / 2;
    face.position.x = s * (width / 2 - 0.02);
    g.add(face);

    // the wheel nut, proud of everything
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 6), M.nut);
    nut.rotation.z = Math.PI / 2;
    nut.position.x = s * (width / 2 + 0.012);
    g.add(nut);
  }

  // SPOKES, and they are the only reason you can see the wheel SPINNING.
  // A plain disc rotating looks identical at every angle, so at speed the
  // car reads as sliding rather than driving. They sit a shade proud of
  // the rim face so they catch the light separately.
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, rimR * 1.85, 0.055), M.spoke);
    sp.rotation.x = (i / 5) * Math.PI;
    g.add(sp);
  }
  return g;
}

/** the driver: shoulders, arms on the wheel, and a helmet */
function buildDriver() {
  const g = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), M.trim);
  helmet.scale.set(1, 1.05, 1.12);
  helmet.position.set(0, 0.30, -0.02);
  g.add(helmet);
  // the visor - a band round the front of the helmet
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.148, 10, 6,
      0, Math.PI * 2, Math.PI * 0.30, Math.PI * 0.22), M.glass);
  visor.scale.set(1, 1.05, 1.12);
  visor.position.copy(helmet.position);
  visor.rotation.x = -0.35;
  g.add(visor);
  // a stripe over the top, because every helmet has one
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.30, 0.30), M.accent);
  stripe.position.copy(helmet.position);
  g.add(stripe);
  // the HANS collar and shoulders, which is all you see of the body
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.26), M.suit);
  sh.position.set(0, 0.13, -0.04);
  g.add(sh);
  // arms forward to the wheel
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.40), M.suit);
    arm.position.set(s * 0.15, 0.10, 0.20);
    arm.rotation.x = -0.20;
    g.add(arm);
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 0.09), M.trim);
    glove.position.set(s * 0.15, 0.15, 0.40);
    g.add(glove);
  }
  return g;
}

/**
 * Build the car.
 *
 * Returns the group plus handles for everything that has to move: the
 * four wheels, the two front uprights that steer, the wishbones that
 * follow the suspension, the steering wheel, and the DRS flap.
 */
export function buildCar(T) {
  const car = new THREE.Group();
  const R = T.wheelRadius;
  const halfTrack = T.trackWidth / 2;
  const xf = T.wheelbase * (1 - T.weightFront);    // front axle, forward of CG
  const xr = -T.wheelbase * T.weightFront;         // rear axle, behind it

  // ---- the tub, lofted from nose to gearbox ---------------------------
  // Read these as a side view: each row is how wide and how tall the car
  // is at that point down its length.
  const floor = -R + 0.06;                         // the plank, just off the road
  const body = loft([
    { z: xf + 0.95, pts: ring(0.10, 0.10, floor + 0.10) },   // the nose tip
    { z: xf + 0.55, pts: ring(0.26, 0.20, floor + 0.12) },
    { z: xf + 0.10, pts: ring(0.40, 0.34, floor + 0.10) },   // where it meets the tub
    { z: xf - 0.35, pts: ring(0.52, 0.46, floor + 0.06) },
    { z: 0.55,      pts: ring(0.62, 0.56, floor + 0.04) },   // the cockpit
    { z: 0.10,      pts: ring(0.72, 0.52, floor + 0.04) },
    { z: -0.55,     pts: ring(0.70, 0.46, floor + 0.04) },
    { z: xr + 0.55, pts: ring(0.52, 0.40, floor + 0.05) },
    { z: xr - 0.10, pts: ring(0.38, 0.34, floor + 0.06) },   // the gearbox
    { z: xr - 0.62, pts: ring(0.22, 0.24, floor + 0.08) },
  ], M.paint);
  body.castShadow = true;
  car.add(body);

  // ---- the floor, which is most of what makes the downforce -----------
  const plank = loft([
    { z: xf + 0.20, pts: ring(0.50, 0.035, floor - 0.01) },
    { z: 0.30,      pts: ring(1.30, 0.035, floor - 0.01) },
    { z: xr + 0.30, pts: ring(1.30, 0.035, floor - 0.01) },
    { z: xr - 0.45, pts: ring(1.05, 0.10, floor - 0.01) },   // the diffuser kicking up
  ], M.dark);
  car.add(plank);

  // ---- sidepods -------------------------------------------------------
  for (const s of [-1, 1]) {
    const pod = loft([
      { z: 0.92,      pts: ring(0.30, 0.34, floor + 0.06) },
      { z: 0.45,      pts: ring(0.56, 0.42, floor + 0.04) },
      { z: -0.35,     pts: ring(0.52, 0.36, floor + 0.04) },
      { z: xr + 0.35, pts: ring(0.26, 0.22, floor + 0.05) },
    ], M.paint);
    pod.position.x = s * 0.50;
    pod.castShadow = true;
    car.add(pod);
    // the radiator inlet, a dark mouth at the front of the pod
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.26, 0.05), M.dark);
    inlet.position.set(s * 0.50, floor + 0.23, 0.94);
    car.add(inlet);
    // and the accent flash along it
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 1.00), M.accent);
    flash.position.set(s * 0.79, floor + 0.24, 0.25);
    car.add(flash);
  }

  // ---- the cockpit opening, the halo, and the driver -------------------
  const hole = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.72), M.dark);
  hole.position.set(0, floor + 0.54, 0.62);
  car.add(hole);

  const driver = buildDriver();
  driver.position.set(0, floor + 0.44, 0.50);
  car.add(driver);

  // the steering wheel, which turns with the front wheels
  const steerWheel = new THREE.Group();
  const rimBar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.03), M.dark);
  steerWheel.add(rimBar);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.05), M.dark);
    grip.position.x = s * 0.13;
    steerWheel.add(grip);
  }
  steerWheel.position.set(0, floor + 0.60, 0.93);
  steerWheel.rotation.x = -0.55;
  car.add(steerWheel);

  // THE HALO. The most recognisable thing on a modern car - a hoop over
  // the driver on a single strut up the centre line.
  const halo = new THREE.Group();
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.20, 0.09), M.dark);
  strut.position.set(0, floor + 0.62, 1.00);
  halo.add(strut);
  const hoopPts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, a = Math.PI * t;
    hoopPts.push(new THREE.Vector3(Math.cos(a) * 0.40, floor + 0.70 + Math.sin(a) * 0.02,
                                   0.98 - Math.sin(a) * 0.86));
  }
  const hoop = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hoopPts), 16, 0.032, 5, false), M.dark);
  halo.add(hoop);
  car.add(halo);

  // ---- the airbox and engine cover ------------------------------------
  const airbox = loft([
    { z: 0.16,  pts: ring(0.30, 0.26, floor + 0.56) },
    { z: 0.02,  pts: ring(0.34, 0.30, floor + 0.54) },
    { z: -0.70, pts: ring(0.30, 0.26, floor + 0.50) },
    { z: xr + 0.10, pts: ring(0.20, 0.16, floor + 0.44) },
    { z: xr - 0.55, pts: ring(0.10, 0.08, floor + 0.40) },
  ], M.paint);
  car.add(airbox);
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), M.dark);
  scoop.position.set(0, floor + 0.70, 0.18);
  car.add(scoop);
  // the shark fin, and the number on it
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 1.10), M.trim);
  fin.position.set(0, floor + 0.60, xr + 0.50);
  car.add(fin);

  // ---- FRONT WING ------------------------------------------------------
  // Four elements stacked, on two big endplates, hung off the nose.
  const fw = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const e = wing(1.80 - i * 0.02, 0.18, 0.022, i === 3 ? M.accent : M.trim);
    e.position.set(0, floor - 0.02 + i * 0.055, xf + 1.30 - i * 0.10);
    e.rotation.x = -0.10 - i * 0.06;
    fw.add(e);
  }
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.30, 0.52), M.accent);
    ep.position.set(s * 0.90, floor + 0.08, xf + 1.22);
    ep.rotation.x = -0.08;
    fw.add(ep);
    // the little turning vane behind it
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.34), M.dark);
    vane.position.set(s * 0.62, floor + 0.12, xf + 0.62);
    fw.add(vane);
  }
  car.add(fw);
  // the nose pillars the wing hangs from
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), M.paint);
    pil.position.set(s * 0.11, floor + 0.06, xf + 0.94);
    car.add(pil);
  }

  // ---- REAR WING -------------------------------------------------------
  const rw = new THREE.Group();
  const rwZ = xr - 0.78, rwY = floor + 0.84;
  const mainplane = wing(1.05, 0.30, 0.03, M.trim);
  mainplane.position.set(0, rwY, rwZ);
  mainplane.rotation.x = 0.30;
  rw.add(mainplane);
  // THE DRS FLAP. Its own object, because it opens.
  const flap = wing(1.03, 0.22, 0.028, M.accent);
  flap.position.set(0, rwY + 0.17, rwZ - 0.14);
  rw.add(flap);
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.52, 0.62), M.accent);
    ep.position.set(s * 0.53, rwY + 0.10, rwZ - 0.06);
    rw.add(ep);
  }
  // the swan-neck supports
  for (const s of [-1, 1]) {
    const sup = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.07), M.dark);
    sup.position.set(s * 0.13, rwY - 0.22, rwZ + 0.02);
    rw.add(sup);
  }
  // the rain light, dead centre under the wing
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), mat(0x33060a, { emissive: 0x330000 }));
  light.position.set(0, rwY - 0.30, rwZ - 0.10);
  rw.add(light);
  car.add(rw);

  // the crash structure and diffuser vanes
  const crash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.5), M.dark);
  crash.position.set(0, floor + 0.20, xr - 0.70);
  car.add(crash);
  for (const s of [-1, 1]) {
    for (const o of [0.18, 0.42]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.34), M.dark);
      v.position.set(s * o, floor + 0.06, xr - 0.55);
      car.add(v);
    }
  }

  // ---- WHEELS, UPRIGHTS AND WISHBONES ----------------------------------
  //
  // Each corner is: a hub group that MOVES UP AND DOWN with the
  // suspension, a steer group inside it that yaws for the front wheels,
  // and the wheel itself inside that which spins. Nesting them that way
  // means the three motions cannot fight each other.
  const wheels = [], hubs = [], steers = [], arms = [];
  const corner = [
    { x: -halfTrack, z: xf, front: true },   // 0 front right
    { x:  halfTrack, z: xf, front: true },   // 1 front left
    { x: -halfTrack, z: xr, front: false },  // 2 rear right
    { x:  halfTrack, z: xr, front: false },  // 3 rear left
  ];

  for (let k = 0; k < 4; k++) {
    const c = corner[k];
    const hub = new THREE.Group();
    hub.position.set(c.x, 0, c.z);
    car.add(hub);
    hubs.push(hub);

    const steer = new THREE.Group();
    hub.add(steer);
    steers.push(steer);

    const w = buildWheel(R, c.front ? 0.38 : 0.44);
    steer.add(w);
    wheels.push(w);

    // the upright, the bit of the car the wheel is actually bolted to
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.12), M.dark);
    up.position.x = -Math.sign(c.x) * 0.14;
    steer.add(up);
    // brake duct
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.30, 0.30), M.dark);
    duct.position.x = -Math.sign(c.x) * 0.19;
    steer.add(duct);

    // THE WISHBONES. Two per corner, plus a pushrod. They are drawn each
    // frame between a fixed point on the tub and a point on the upright,
    // so when the suspension moves they move with it - which is the whole
    // reason the suspension has travel in the model at all.
    const side = Math.sign(c.x);
    const bones = [];
    // `to` IS RELATIVE TO THE HUB, not an absolute position. Written as
    // absolutes they got the hub's own offset added on top, so every
    // wishbone reached to nearly twice the track width and the car wore
    // four sets of black spikes sticking out past its wheels. The hub is
    // already at the wheel centre, so these are small inboard offsets:
    // the outer end of a wishbone lands just inside the rim, where the
    // upright is.
    const spec = [
      { from: [side * 0.26, floor + 0.36, c.z + 0.28], to: [-side * 0.14, 0.15, 0.00], t: 0.035 },
      { from: [side * 0.26, floor + 0.36, c.z - 0.28], to: [-side * 0.14, 0.15, 0.00], t: 0.035 },
      { from: [side * 0.30, floor + 0.10, c.z + 0.30], to: [-side * 0.10, -0.12, 0.00], t: 0.042 },
      { from: [side * 0.30, floor + 0.10, c.z - 0.30], to: [-side * 0.10, -0.12, 0.00], t: 0.042 },
      { from: [side * 0.24, floor + 0.40, c.z - 0.06], to: [-side * 0.12, -0.10, 0.00], t: 0.030 },
    ];
    for (const s of spec) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.t, s.t, 1), M.dark);
      car.add(m);
      bones.push({ mesh: m, from: new THREE.Vector3(...s.from), local: new THREE.Vector3(...s.to) });
    }
    // the track rod, for the front, so you can see the steering working
    arms.push(bones);
  }

  return {
    group: car, wheels, hubs, steers, arms, driver, steerWheel,
    drsFlap: flap, rainLight: light, floorY: floor,
    /** re-aim every wishbone at where its upright has ended up */
    updateArms() {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      for (let k = 0; k < 4; k++) {
        const hub = hubs[k];
        for (const bone of arms[k]) {
          a.copy(bone.from);
          b.copy(bone.local).add(hub.position);
          bone.mesh.position.copy(a).add(b).multiplyScalar(0.5);
          bone.mesh.scale.z = Math.max(0.05, a.distanceTo(b));
          bone.mesh.lookAt(b);
        }
      }
    },
  };
}
