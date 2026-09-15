// =====================================================================
// APEX :: main.js - THE GAME
// =====================================================================
//
// Holds the renderer, the camera, the input and the lap timing, and does
// nothing clever: car.js decides how the car behaves, track.js decides
// what the circuit looks like, and this puts one on the other and draws
// it sixty times a second.
//
// THE YAW CONVENTION, which I got wrong first time round
// The physics has yaw 0 facing +Z, with forward = (sin yaw, cos yaw).
// three.js `rotation.y = t` sends +Z to (sin t, cos t) - THE SAME
// CONVENTION. So the mesh takes yaw straight, with no minus sign. I put
// one in anyway, out of habit from engines that measure it the other
// way, and the car drove down the track facing forty degrees away from
// where it was actually going. From behind that reads as a camera fault
// rather than a car one, which is what made it worth a note.
//
// The rotation ORDER matters as much as the sign. With the default XYZ,
// pitch and roll are applied about world axes BEFORE the yaw, so a car
// heading east would dive sideways. YXZ turns it first and then leans it
// in its own frame, which is what a car does.
import * as THREE from '../vendor/three.module.js';
import { Car, TUNE } from './car.js';
import { buildCar } from './f1car.js';
import { buildTrack } from './track.js';
import { CIRCUITS } from './circuits.js';
import { Smoke, Skids } from './fx.js';
import { WIND } from './scenery.js';

// ---------------------------------------------------------------------
// renderer, scene, sky
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// The flat background colour is only a backstop now - every circuit adds
// a gradient sky dome that follows the camera. Fog reaches much further
// than it used to because there is finally something out there to fade:
// hills, a treeline and a ring of mountains, all of which were being
// erased by a wall of grey at 2.1 km.
scene.background = new THREE.Color(0x8fb6d8);
scene.fog = new THREE.Fog(0x9cc0dd, 700, 4200);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);

// a big soft key light with a shadow that follows the car, plus sky bounce
const sun = new THREE.DirectionalLight(0xfff3e0, 2.5);
sun.position.set(-120, 180, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
const SH = 42;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0012;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbcd8f0, 0x4a4436, 1.15));

// ---------------------------------------------------------------------
// input
// ---------------------------------------------------------------------
const keys = Object.create(null);
const tapped = Object.create(null);
addEventListener('keydown', (e) => {
  if (!keys[e.code]) tapped[e.code] = true;
  keys[e.code] = true;
  if ([ 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight' ].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const tap = (code) => { const t = tapped[code]; tapped[code] = false; return !!t; };

// ---------------------------------------------------------------------
// the car
// ---------------------------------------------------------------------
const car = new Car();
const art = buildCar(TUNE);
scene.add(art.group);

const smoke = new Smoke(scene);
const skids = new Skids(scene);

// ---------------------------------------------------------------------
// the circuit
// ---------------------------------------------------------------------
let track = null;
let trackKey = null;

function loadCircuit(key) {
  if (track) { scene.remove(track.group); disposeTree(track.group); }
  const spec = CIRCUITS[key];
  track = buildTrack(spec);
  trackKey = key;
  scene.add(track.group);

  // put the car on the grid: a little back from the line, facing down it
  const p = track.at(-60);
  car.setHome(p.x, p.z, p.h);
  car.reset();
  skids.clear();
  lap.reset();
  drawMapBase();

  document.getElementById('circuit').textContent = spec.name.toUpperCase();
  document.getElementById('country').textContent = spec.country + '  ·  ' + (spec.real / 1000).toFixed(3) + ' km';
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

// ---------------------------------------------------------------------
// LAP TIMING
//
// A lap counts when the car crosses the start line going forwards, which
// is detected by watching the distance-round-the-lap wrap from nearly the
// whole length back to nearly nothing. Watching for the car to be "near
// the line" instead would miss it completely at 300 km/h, because at that
// speed it covers 1.4 metres between frames.
// ---------------------------------------------------------------------
const lap = {
  t: 0, last: 0, best: 0, count: 0, prevDist: 0, armed: false,
  reset() { this.t = 0; this.last = 0; this.best = 0; this.count = 0; this.prevDist = 0; this.armed = false; },
  update(dt, dist, len) {
    this.t += dt;
    if (this.armed && this.prevDist > len * 0.75 && dist < len * 0.25) {
      this.last = this.t;
      if (!this.best || this.t < this.best) this.best = this.t;
      this.count++;
      this.t = 0;
    }
    // only arm once the car has actually gone somewhere, so sitting on the
    // line at the start does not trip it
    if (dist > len * 0.4) this.armed = true;
    this.prevDist = dist;
  },
};

const clock = (s) => {
  if (!s) return '--:--.---';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(3);
};

// ---------------------------------------------------------------------
// cameras
// ---------------------------------------------------------------------
const CAMS = ['chase', 'cockpit', 'bonnet', 'trackside'];
let camMode = 0;
const camPos = new THREE.Vector3();
const camAim = new THREE.Vector3();
let camReady = false;

function placeCamera(dt) {
  const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const here = new THREE.Vector3(car.x, 0, car.z);
  const mode = CAMS[camMode];

  // the faster it goes the further back and the wider the camera gets,
  // which is most of the sensation of speed in any racing game
  const fast = Math.min(1, car.speed / 85);

  if (mode === 'chase') {
    const want = here.clone().addScaledVector(fwd, -(7.4 + fast * 3.4)).addScaledVector(up, 2.5 + fast * 0.5);
    const k = camReady ? 1 - Math.exp(-dt * 7) : 1;
    camPos.lerp(want, k);
    camAim.lerp(here.clone().addScaledVector(fwd, 9).addScaledVector(up, 1.1), camReady ? 1 - Math.exp(-dt * 9) : 1);
    camera.fov = 62 + fast * 14;
  } else if (mode === 'cockpit') {
    // from the driver's helmet, which is why there is a driver in there
    const eye = here.clone().addScaledVector(fwd, 0.42).addScaledVector(up, 0.92);
    camPos.copy(eye);
    camAim.copy(eye.clone().addScaledVector(fwd, 30).addScaledVector(up, 0.4));
    camera.fov = 66 + fast * 10;
  } else if (mode === 'bonnet') {
    const eye = here.clone().addScaledVector(fwd, 2.1).addScaledVector(up, 0.75);
    camPos.copy(eye);
    camAim.copy(eye.clone().addScaledVector(fwd, 30));
    camera.fov = 68 + fast * 10;
  } else {
    // trackside: sit on the barrier and watch it go past
    const near = track && track.nearest(car.x, car.z);
    const p = near ? near.point : { x: car.x, z: car.z, h: car.yaw };
    const l = [Math.cos(p.h), -Math.sin(p.h)];
    const off = (track ? track.halfWidth : 8) + 16;
    camPos.set(p.x + l[0] * off, 6.5, p.z + l[1] * off);
    camAim.lerp(here, 1 - Math.exp(-dt * 10));
    camera.fov = 40;
  }
  camReady = true;
  camera.position.copy(camPos);
  camera.lookAt(camAim);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------
// the minimap
// ---------------------------------------------------------------------
const map = document.getElementById('map');
const mctx = map.getContext('2d');
let mapT = null;

function drawMapBase() {
  const pts = track.points;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 26, W = map.width;
  const s = Math.min((W - pad * 2) / (maxX - minX), (W - pad * 2) / (maxZ - minZ));
  mapT = { s, ox: W / 2 - (minX + maxX) / 2 * s, oz: W / 2 - (minZ + maxZ) / 2 * s };
  mctx.clearRect(0, 0, W, W);
  mctx.strokeStyle = '#59647a';
  mctx.lineWidth = 8; mctx.lineJoin = 'round'; mctx.lineCap = 'round';
  mctx.beginPath();
  pts.forEach((p, i) => {
    const x = p.x * s + mapT.ox, z = p.z * s + mapT.oz;
    i ? mctx.lineTo(x, z) : mctx.moveTo(x, z);
  });
  mctx.closePath(); mctx.stroke();
  mctx.strokeStyle = '#e03a2f'; mctx.lineWidth = 4;
  const a = pts[0], b = pts[4];
  mctx.beginPath();
  mctx.moveTo(a.x * s + mapT.ox, a.z * s + mapT.oz);
  mctx.lineTo(b.x * s + mapT.ox, b.z * s + mapT.oz);
  mctx.stroke();
  mapBase = mctx.getImageData(0, 0, W, W);
}
let mapBase = null;

function drawMapCar() {
  if (!mapBase || !mapT) return;
  mctx.putImageData(mapBase, 0, 0);
  const x = car.x * mapT.s + mapT.ox, z = car.z * mapT.s + mapT.oz;
  mctx.fillStyle = '#ffffff';
  mctx.beginPath(); mctx.arc(x, z, 7, 0, Math.PI * 2); mctx.fill();
}

// ---------------------------------------------------------------------
// the shift lights
// ---------------------------------------------------------------------
const lightsEl = document.getElementById('lights');
for (let i = 0; i < 10; i++) lightsEl.appendChild(document.createElement('i'));
const lightEls = [...lightsEl.children];
const LIGHT_COLOUR = ['#35d07f', '#35d07f', '#35d07f', '#5fd07f', '#e6c03a',
                      '#e6c03a', '#e6c03a', '#e03a2f', '#e03a2f', '#b02fd0'];

// ---------------------------------------------------------------------
// the menu
// ---------------------------------------------------------------------
const menu = document.getElementById('menu');
const picks = document.getElementById('picks');
for (const key of Object.keys(CIRCUITS)) {
  const c = CIRCUITS[key];
  const el = document.createElement('div');
  el.className = 'pick';
  el.innerHTML = '<div class="n">' + c.name + '</div><div class="c">' + c.country
    + '</div><div class="d">' + (c.real / 1000).toFixed(3) + ' km</div>';
  el.onclick = () => { menu.style.display = 'none'; loadCircuit(key); };
  picks.appendChild(el);
}

// ---------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------
let prev = performance.now();
const el = (id) => document.getElementById(id);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (!track) { renderer.render(scene, camera); return; }

  // ---- drive ----------------------------------------------------------
  const input = {
    throttle: (keys.KeyW || keys.ArrowUp) ? 1 : 0,
    brake: !!(keys.KeyS || keys.ArrowDown),
    steerLeft: !!(keys.KeyA || keys.ArrowLeft),
    steerRight: !!(keys.KeyD || keys.ArrowRight),
    clutch: !!keys.KeyC,
    drs: !!keys.Space,
    shiftUp: tap('ShiftLeft') || tap('ShiftRight'),
    shiftDown: tap('ControlLeft') || tap('ControlRight'),
  };
  car.step(dt, input);

  if (tap('KeyV')) { camMode = (camMode + 1) % CAMS.length; camReady = false; }
  if (tap('KeyR')) {
    // back on the track, facing the right way, where you went off
    const near = track.nearest(car.x, car.z);
    const p = near ? track.at(near.dist - 12) : track.at(0);
    car.reset(p.x, p.z, p.h);
    camReady = false;
  }
  if (tap('Escape')) menu.style.display = 'flex';

  // ---- put the art where the physics says ------------------------------
  art.group.position.set(car.x, 0, car.z);
  art.group.rotation.order = 'YXZ';           // turn first, then lean
  art.group.rotation.y = car.yaw;

  // THE CAR SITS ON ITS WHEELS, not in the road. f1car.js is built with
  // the wheel CENTRES at y=0, because that is the natural origin for a
  // suspension - so the whole thing has to be lifted by one wheel radius
  // or the car is buried to its axles and looks like a flattened toy with
  // its wheels lying beside it.
  //
  // On top of that it rides on its springs: heave, pitch and roll come
  // straight out of the suspension model, so the car visibly squats,
  // dives and leans rather than being animated to look as though it does.
  art.group.position.y = TUNE.wheelRadius + car.heave;
  art.group.rotation.x = -car.pitch;
  art.group.rotation.z = -car.roll;

  for (let k = 0; k < 4; k++) {
    const w = car.wheels[k];
    // the wheel stays on the road while the body moves, which is the
    // whole point of having travel
    art.hubs[k].position.y = w.travel;
    art.steers[k].rotation.y = k < 2 ? car.steer : 0;
    art.wheels[k].rotation.x = w.angle;
  }
  art.updateArms();
  art.steerWheel.rotation.z = car.steer * 2.6;
  // the driver's head leans into the corner and against the braking
  art.driver.rotation.z = THREE.MathUtils.clamp(-car.latG * 0.05, -0.2, 0.2);
  art.driver.position.z = 0.50 - THREE.MathUtils.clamp(car.lonG * 0.02, -0.05, 0.05);
  // DRS: the flap lies down when it is open
  art.drsFlap.rotation.x = car.drs ? -0.55 : 0.0;
  art.rainLight.material.emissive.setHex(car.speed < 3 ? 0x000000 : 0x000000);

  // ---- tyre smoke and marks --------------------------------------------
  for (let k = 0; k < 4; k++) {
    const s = car.wheelSlip(k);
    const [xi, yi] = car.wheelPos(k);
    const c = Math.cos(car.yaw), sn = Math.sin(car.yaw);
    const wx = car.x + xi * sn + yi * c;
    const wz = car.z + xi * c - yi * sn;
    if (s > 1.02) {
      smoke.puff(wx, 0.12, wz, (s - 1) * 1.6);
      skids.mark(k, wx, wz, car.yaw, Math.min(1, (s - 1) * 2.2));
    } else skids.lift(k);
  }
  smoke.step(dt);
  skids.step();

  // ---- where on the lap are we -----------------------------------------
  const near = track.nearest(car.x, car.z);
  const offTrack = near ? near.off > track.halfWidth + 1.6 : false;
  if (near) lap.update(dt, near.dist, track.length);

  // the corner you are in, named
  if (near) {
    let name = '';
    for (const c of track.corners) {
      if (near.dist >= c.at - 90 && near.dist <= c.at + 30) { name = c.name; break; }
    }
    el('corner').textContent = name;
  }

  // ---- the sun follows so the shadow map stays tight --------------------
  // one clock for every blade of grass and every tree crown on the circuit
  WIND.uTime.value += dt;
  // and the sky dome rides with the camera, so its horizon is always at eye
  // level and you can never drive to the edge of it
  if (track.sky) track.sky.position.copy(camera.position);

  sun.target.position.set(car.x, 0, car.z);
  sun.position.set(car.x - 90, 150, car.z + 70);

  placeCamera(dt);

  // ---- HUD --------------------------------------------------------------
  el('speed').innerHTML = Math.round(car.kph) + '<span>KM/H</span>';
  el('gear').textContent = car.gear === 0 ? 'N' : car.gear < 0 ? 'R' : car.gear;
  const rev = Math.min(1, car.rpm / TUNE.redline);
  el('revfill').style.width = (rev * 100).toFixed(1) + '%';
  const lit = Math.floor(Math.max(0, (rev - 0.55) / 0.45) * 10);
  for (let i = 0; i < 10; i++) {
    const on = i < lit;
    lightEls[i].style.background = car.onLimiter
      ? (Math.floor(now / 60) % 2 ? '#b02fd0' : '#1d222b')
      : (on ? LIGHT_COLOUR[i] : '#1d222b');
  }
  el('lap').textContent = clock(lap.t);
  el('last').textContent = clock(lap.last);
  el('best').textContent = clock(lap.best);
  el('best').className = lap.best ? 'best' : '';
  el('laps').textContent = lap.count;
  el('drs').classList.toggle('on', car.drs);
  el('off').classList.toggle('on', offTrack);
  drawMapCar();

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

requestAnimationFrame(frame);

// ---------------------------------------------------------------------
// the hook the test tools drive it through - the SAME step() the game
// uses, so anything they prove is true of the game and not of a copy
// ---------------------------------------------------------------------
window.__apex = {
  car, TUNE,
  get track() { return track; },
  load: (k) => loadCircuit(k),
  state: () => {
    const near = track && track.nearest(car.x, car.z);
    return {
      kph: Math.round(car.kph), gear: car.gear, rpm: Math.round(car.rpm),
      slip: +car.slipAngle.toFixed(1), x: +car.x.toFixed(2), z: +car.z.toFixed(2),
      latG: +car.latG.toFixed(2), lonG: +car.lonG.toFixed(2),
      heave: +car.heave.toFixed(4), pitch: +car.pitch.toFixed(4), roll: +car.roll.toFixed(4),
      downforce: Math.round(car.downforce), drs: car.drs, stopped: car.stopped,
      off: near ? +near.off.toFixed(1) : -1, dist: near ? Math.round(near.dist) : -1,
      wheels: car.wheels.map((w) => ({
        load: Math.round(w.load), travel: +w.travel.toFixed(4),
        spin: +w.spin.toFixed(1), scrub: +w.scrub.toFixed(2) })),
      lap: { t: lap.t, last: lap.last, best: lap.best, count: lap.count },
      circuit: trackKey, trackLength: track ? Math.round(track.length) : 0,
    };
  },
  drive: (ms, i) => {
    const steps = Math.round(ms / 16.67);
    for (let k = 0; k < steps; k++) {
      // A SHIFT IS A TAP, NOT A HELD KEY. The real input comes from tap(),
      // which is a latch that clears the moment it is read, so pressing
      // SHIFT gives you exactly one upshift no matter how long you hold
      // it. A test fixture that passes shiftUp:true for all nineteen
      // frames of a 320 ms call shifts nineteen times: the "flat out off
      // the line" test was putting the car in EIGHTH GEAR at 20 km/h and
      // then measuring how badly it accelerated. Only the first step of a
      // call gets the shift.
      car.step(1 / 60, { throttle: 0, brake: false, steerLeft: false, steerRight: false,
                         clutch: false, shiftUp: false, shiftDown: false, drs: false, ...i,
                         ...(k > 0 ? { shiftUp: false, shiftDown: false } : {}) });
    }
    return window.__apex.state();
  },
  setGear: (g) => { car.gear = g; },
  place: (dist) => { const p = track.at(dist); car.reset(p.x, p.z, p.h); },
};
