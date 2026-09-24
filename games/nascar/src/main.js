// =====================================================================
// NASCAR :: main.js - THE GAME
// =====================================================================
//
// Everything else in src/ is deliberately blind: stock.js knows nothing
// about the track, race.js knows nothing about three.js, and none of them
// know there is a screen. This file is the only place that does. It
// builds the renderer, reads the keyboard, runs race.js one tick per
// frame, puts every car where race.js says it is, points a camera at the
// one you are driving, and draws the numbers.
//
// Which means the thing you drive and the thing `node tools/race.mjs`
// simulates are the same object. If the tool says you finish fourth, you
// finish fourth.
import * as THREE from '../vendor/three.module.js';
import { TUNE, TYRES, WHEEL_SHORT } from './stock.js';
import { buildOval, TRACKS } from './oval.js';
import { buildTrack, markPitStall } from './track.js';
import { buildCar } from './body.js';
import { Race, PHASE } from './race.js';
import { setAnisotropy } from './textures.js';
import { Sky } from './sky.js';
import { Post } from './post.js';
import { Weather, SKIES } from './weather.js';
import { CrewPool } from './crew.js';
import { Cockpit } from './cockpit.js';
import * as Season from './season.js';
import { field } from './field.js';
import { AIR } from './draft.js';

const MPH = 2.23694;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// renderer, scene, light
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// COUNT THE WHOLE FRAME, NOT THE LAST PASS OF IT. three resets its own
// render counters at the top of every render() call, and the last thing
// this game renders is a single full-screen quad - so tools/perf.mjs was
// cheerfully reporting that a speedway with fifty thousand people in it
// costs one draw call. Reset once a frame instead, in draw().
renderer.info.autoReset = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
document.body.appendChild(renderer.domElement);
// the racing surface is seen at a glancing angle the whole time, and
// without this its texture smears into grey a few car lengths ahead
setAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
// A SPEEDWAY IS HALF A MILE ACROSS and you can see the far side of it
// from anywhere on the lap, so the fog has to start beyond that or the
// backstretch grandstand is a grey smudge from the frontstretch.
scene.fog = new THREE.Fog(0xb4cbdc, 2200, 9000);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 12000);

// ---------------------------------------------------------------------
// THE SKY IS THE LIGHTING.
//
// Not a backdrop - the source. sky.js bakes its own dome into a
// pre-filtered environment map, and `scene.environment` hands that to
// every physical material in the game. It is the ONLY reason the paint
// looks like paint, the wheels look like metal and the glass looks like
// glass: a metal surface with nothing to reflect renders black.
// ---------------------------------------------------------------------
const sky = new Sky(renderer);
scene.add(sky.mesh);
scene.environment = sky.envMap;
scene.environmentIntensity = 1.0;

const sun = new THREE.DirectionalLight(0xfff2dd, 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 460;
const SH = 62;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
// SKY FILL. The sun sits low and off to one side, which is what makes
// the banking read - but it also means that for a third of a lap the
// field is dead backlit and twenty cars in twenty liveries all go the
// same brown. The hemisphere light is the sky filling the shadow side in,
// and it is the difference between telling the cars apart from behind and
// not, which is the whole point of giving them different paint.
const hemi = new THREE.HemisphereLight(0xbcd8f0, 0x6a6250, 0.90);
scene.add(hemi);

const post = new Post(renderer, scene, camera);
// RAIN, AND WHAT THE ROAD DOES WHEN IT IS WET. weather.js owns the rain,
// the wet materials and a planar mirror in the road; main.js only has to
// tell it what the player is doing and render it one pass early.
const weather = new Weather(renderer, scene, camera, sky);
weather.setSize(innerWidth, innerHeight);
// FOUR CREWS, handed round forty pit boxes: at most a handful of stops
// are happening anywhere near the camera at once.
const crews = new CrewPool(scene, 4);
// THE VIEW FROM INSIDE THE CAGE: gauges, hands, a shifting hand, a real
// rear-view mirror and a helmet aperture. Built once, re-parented onto
// whichever car you are driving.
const cockpit = new Cockpit(renderer, scene);
scene.add(camera);
// ONE LIGHT INSIDE THE CAR. A roll cage is a box with a hole in the front
// of it, so from the seat everything in there is in its own shadow and
// reads as a black cave. A single dim point light on the driver's
// shoulder is what a photographer would do and costs nothing, because it
// is switched off in every other camera.
const cabin = new THREE.PointLight(0xdfe6f0, 0, 3.2, 2);
scene.add(cabin);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth * Math.min(devicePixelRatio, 2), innerHeight * Math.min(devicePixelRatio, 2));
  weather.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------
// input
// ---------------------------------------------------------------------
const keys = Object.create(null);
const tapped = Object.create(null);
addEventListener('keydown', (e) => {
  if (!keys[e.code]) tapped[e.code] = true;
  keys[e.code] = true;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const tap = (code) => { const t = tapped[code]; tapped[code] = false; return !!t; };

// ---------------------------------------------------------------------
// the session
// ---------------------------------------------------------------------
const S = {
  key: null, oval: null, art: null, race: null, cars: [], mode: 'race',
  running: false, paused: false, assist: 1, warp: 1, autopilot: false, post: 1,
  clock: 0, radio: [],
};
let camMode = 0, camReady = false, freeCam = null;
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
let camYaw = 0, camPitch = 0;

// =====================================================================
// SPARKS AND SMOKE
// =====================================================================
//
// Two point clouds with a pool each, because at a speedway you see both
// constantly: sparks whenever anything touches the concrete, and tyre
// smoke whenever anything is sideways. Neither is expensive and between
// them they are most of what makes contact FEEL like contact.
function dot(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.45, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Puffs {
  constructor(n, size, tex, opts = {}) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;
    this.mat = new THREE.PointsMaterial({
      size, map: tex, transparent: true, depthWrite: false, sizeAttenuation: true,
      blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.grow = opts.grow || 0;
    this.gravity = opts.gravity === undefined ? -9.8 : opts.gravity;
    this.drag = opts.drag === undefined ? 0.2 : opts.drag;
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life;
  }
  step(dt) {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3 + 1] += this.gravity * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] *= k; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  get alive() { let n = 0; for (let i = 0; i < this.n; i++) if (this.life[i] > 0) n++; return n; }
}

const sparks = new Puffs(600, 0.22, dot('rgba(255,250,210,1)', 'rgba(255,150,40,0.85)'),
  { add: true, gravity: -14, drag: 1.2 });
const smoke = new Puffs(400, 2.6, dot('rgba(235,235,235,0.55)', 'rgba(190,190,190,0.20)'),
  { gravity: 0.7, drag: 0.9, opacity: 0.55 });
// THE SPRAY. Smaller and lighter than tyre smoke, thrown up rather than
// out, and it hangs: drag 1.6 so it stops almost at once and then sits
// in the air where the car left it, which is what makes a pack in the
// wet unraceable.
const spray = new Puffs(620, 2.0, dot('rgba(244,248,255,0.50)', 'rgba(208,220,236,0.10)'),
  { gravity: -1.6, drag: 1.7, opacity: 0.50 });
scene.add(sparks.points, smoke.points, spray.points);

// =====================================================================
// BUILDING A SESSION
// =====================================================================
function teardown() {
  if (S.art) { scene.remove(S.art.group); }
  for (const c of S.cars) scene.remove(c.art.group);
  S.cars = [];
  S.art = null; S.race = null; S.oval = null;
  S.radio = [];
}

function start(mode, key, opts = {}) {
  teardown();
  S.mode = mode;
  S.key = key;
  S.assist = opts.assist === undefined ? 1 : opts.assist;
  S.oval = buildOval(key);
  S.art = buildTrack(S.oval);
  scene.add(S.art.group);
  S.flagMat = S.art.group.getObjectByName('flags') ? S.art.group.getObjectByName('flags').userData.mat : null;
  weather.attach(S.art);
  weather.set(opts.weather || 'dry');

  const cars = mode === 'practice' ? (opts.cars === undefined ? 1 : opts.cars) : (opts.cars || 20);
  const laps = mode === 'practice' ? 9999 : (opts.laps || 20);
  S.race = new Race(S.oval, {
    laps,
    // ENDURANCE runs in stages with a caution at the end of each; a sprint
    // race is one stage and gets none
    stages: mode === 'practice' ? [] : Season.stagesFor(laps),
    cars: Math.max(1, cars),
    skill: opts.skill === undefined ? 0.97 : opts.skill,
    hasPlayer: true,
    startAt: mode === 'practice' ? 0 : (opts.grid === undefined ? Math.floor(cars / 2) : opts.grid),
    paceLaps: mode === 'practice' ? 0 : 1,
    cautions: mode !== 'practice',
  });
  // THE CLOCK CAN BE WOUND ON with [ and ]. Four hundred laps of Bristol is
  // two and a half hours; the physics still runs every step, but the world
  // can be stepped up to eight times a frame, so a long race can be driven
  // in an evening. It is the one concession endurance needs to be playable.
  S.warp = 1;

  // YOUR BOX, PAINTED AND SIGNPOSTED. It has to happen here rather than
  // in buildTrack because which stall is yours is your grid slot, and the
  // grid does not exist until the race does.
  if (S.race.playerDriver) {
    markPitStall(S.art.group, S.oval, S.race.playerDriver.stall, S.race.player.entry.number);
  }

  for (const r of S.race.runners) {
    const art = buildCar(r.car.T, r.entry.livery);
    scene.add(art.group);
    S.cars.push({ r, art });
    r.art = art;
  }
  // practice starts rolling at the start line rather than on the grid
  if (mode === 'practice') {
    S.race.setPhase(PHASE.GREEN);
    S.race.runners.forEach((r, k) => {
      const p = S.oval.pos(-k * 26, S.oval.halfWidth - 2.4);
      r.place(p.x, p.z, p.h);
      r.car.setHome(p.x, p.z, p.h);
      r.car.gear = 3;
      const v = 40;
      r.car.vx = Math.sin(p.h) * v; r.car.vz = Math.cos(p.h) * v;
      for (const w of r.car.wheels) w.spin = v / r.car.T.wheelRadius;
    });
  }

  S.running = true;
  S.paused = false;
  S.clock = 0;
  camReady = false;
  freeCam = null;
  S.autopilot = false;
  showScreen(null);
  $('hud').classList.add('on');
  $('tower').classList.toggle('on', mode === 'race');
  $('pos').style.display = mode === 'race' ? 'block' : 'none';
  $('trackName').textContent = S.oval.spec.short;
  // A LEAGUE ROUND WITHOUT A SEASON IS STILL A RACE. Anything that starts
  // a race directly - a test tool, a saved link, a season the browser has
  // since forgotten - passes league: true with nothing behind it, and
  // reading season.round off null took the whole screen down before a
  // wheel turned. The banner just loses its round number.
  $('modeName').textContent = mode === 'practice' ? 'PRACTICE'
    : (opts.league && season ? 'ROUND ' + (season.round + 1) + '/' + season.calendar.length + ' · ' : '')
      + laps + ' LAPS · ' + cars + ' CARS'
      + (S.race.stages.length ? ' · ' + (S.race.stages.length + 1) + ' STAGES' : '');
  buildLights();
  drawMapBase();
}

function buildLights() {
  const el = $('lights');
  el.innerHTML = '';
  for (let i = 0; i < 14; i++) el.appendChild(document.createElement('i'));
}

// =====================================================================
// THE PLAYER'S PEDALS
// =====================================================================
function playerInput() {
  const p = S.race.player;
  const car = p.car;
  let throttle = keys.KeyW || keys.ArrowUp2 ? 1 : 0;
  const brake = keys.KeyS ? 1 : 0;
  const clutch = !!keys.KeyC;
  // the gearbox is an H-pattern and it is yours: a tap is a gear, and
  // whether the clutch was in when you took it decides how long it costs
  const shiftUp = tap('KeyE') || tap('ShiftLeft') || tap('ShiftRight');
  const shiftDown = tap('KeyQ') || tap('ControlLeft') || tap('ControlRight');
  // how long the hand stays off the wheel, for the cockpit view
  if (shiftUp || shiftDown) S.shiftingFor = 0.42;
  return {
    throttle, brake, clutch, shiftUp, shiftDown,
    steerLeft: !!keys.KeyA, steerRight: !!keys.KeyD,
    assist: S.assist,
  };
}

// =====================================================================
// ONE FRAME
// =====================================================================
let last = performance.now();
let acc = 0;
const HZ = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!S.running) { sky.step(dt); draw(dt); return; }

  if (tap('Escape')) {
    S.paused = !S.paused;
    showScreen(S.paused ? 'pause' : null);
  }
  if (!S.paused) {
    if (tap('KeyV')) { camMode = (camMode + 1) % 5; camReady = false; }
    // P IS THE RADIO. Liam: "P for pit stop with tire wear to of course".
    // It does not drive you in - this is a driving game and pit entry is
    // part of the driving. What it does is tell the crew, put the board
    // out, and show you the tyres and the fuel you are deciding with.
    if (tap('KeyP') && S.race) {
      const r = S.race;
      r.playerCall = !r.playerCall;
      const w = r.player.car.wheels;
      const worn = Math.round(Math.min(...w.map((x) => x.wear)) * 100);
      radio(r.playerCall
        ? 'BOX THIS LAP - ' + (worn < 80 ? 'FOUR TYRES AND FUEL' : 'FUEL ONLY') + ', TYRES ' + worn + '%'
        : 'STAY OUT');
    }
    // and the clock, for a race that is hundreds of laps long
    // and the clock, for a race that is hundreds of laps long. This is the
    // warp the test tools already use - the physics still runs every step,
    // there are simply more of them per frame.
    if (tap('BracketRight')) { S.warp = Math.min(8, S.warp * 2); radio('RACE SPEED x' + S.warp); }
    if (tap('BracketLeft')) { S.warp = Math.max(1, S.warp / 2); radio('RACE SPEED x' + S.warp); }
    if (tap('KeyR')) recoverPlayer();
    // a tear-off off the windscreen, which is the stock-car answer to a wiper
    if (tap('KeyT')) { const left = cockpit.tearOff(); radio(left ? 'TEAR-OFF - ' + left + ' LEFT' : 'THAT WAS THE LAST TEAR-OFF'); }
    // the crew chief's adjustments, taken at the next stop
    const su = S.race.player.car.setup;
    if (tap('ArrowUp')) su.wedge = clamp(su.wedge + 0.5, -3, 3);
    if (tap('ArrowDown')) su.wedge = clamp(su.wedge - 0.5, -3, 3);
    if (tap('ArrowRight')) su.bar = clamp(su.bar + 0.5, -3, 3);
    if (tap('ArrowLeft')) su.bar = clamp(su.bar - 0.5, -3, 3);

    S.shiftingFor = Math.max(0, (S.shiftingFor || 0) - dt);
    acc += dt;
    let steps = 0;
    while (acc >= HZ && steps < 6 * S.warp) {
      for (let w = 0; w < S.warp; w++) {
        S.race.step(HZ, S.autopilot ? null : playerInput());
        S.clock += HZ;
      }
      acc -= HZ;
      steps++;
    }
    for (const m of S.race.messages) radio(m.msg);
    effects(dt);
    sparks.step(dt);
    smoke.step(dt);
    spray.step(dt);
    if (S.race.phase === PHASE.FINISHED) finish();
  }

  placeCars();
  if (S.race) {
    const pa = S.race.player.art;
    if (camMode === 1 && pa) {
      cockpit.attachTo(pa);
      cockpit.rain = weather.rain;
      cockpit.step(S.race.player.car, dt, !!S.shiftingFor);
    } else cockpit.detach();
    cabin.intensity = camMode === 1 ? 5.4 : 0;
    if (camMode === 1) {
      const c2 = S.race.player.car;
      cabin.position.set(c2.x, S.race.player.y + 1.3, c2.z);
    }
  }
  updateCamera(dt);
  updateHUD();
  draw(dt);
}
requestAnimationFrame(frame);

/**
 * THE PICTURE.
 *
 * The blur is turned up with SPEED and with how hard the camera is
 * working, because a still camera should be sharp and a camera being
 * dragged round a thirty-one degree banking at a hundred and ninety miles
 * an hour should not be. Turning it up with speed alone gave a perfectly
 * sharp picture in the middle of a corner, which is the one place it
 * matters.
 */
function applyWeather() {
  const c = sky.fogColour;
  scene.fog.color.copy(c);
  sun.position.copy(sky.sunDir).multiplyScalar(300);
  sun.color.setHSL(0.09, 0.35 * (1 - sky.uniforms.uDark.value), 0.62);
}

/**
 * HOW WORKED UP THE CROWD IS.
 *
 * Not a constant: they are on their feet when the field is in front of
 * them, they are sitting down when it is at the other end of the
 * backstretch, and they are all the way up for several seconds after
 * somebody hits the wall. It is one number, it costs nothing, and it is
 * the difference between a crowd and wallpaper.
 */
function crowdExcitement(dt) {
  if (!S.race) return 0.1;
  let e = 0.10;
  const race = S.race;
  if (race.phase === PHASE.GREEN) e = 0.30;
  if (race.phase === PHASE.CAUTION) e = 0.75;
  // the pack coming past the start/finish, where most of them are sitting
  const lead = race.leader;
  if (lead) {
    const d = Math.min(lead.dist, S.oval.length - lead.dist);
    e = Math.max(e, 0.95 - d / 420);
  }
  // and a big hit anywhere brings the whole place up
  for (const r of race.runners) {
    if (r.hitWall > 6) { S.cheerUntil = S.clock + 6; break; }
  }
  if (S.clock < (S.cheerUntil || 0)) e = 1;
  // a side-by-side fight for the lead is worth standing up for too
  if (race.order && race.order[1] && race.gapAhead(race.order[1]) < 0.25) e = Math.max(e, 0.85);
  return e;
}

function draw(dt) {
  renderer.info.reset();
  sky.step(dt);
  // THE MIRROR PASS GOES FIRST, because the road samples what it produced.
  // THE CABIN IS NOT RAINED IN. Two and a quarter metres clears the
  // dash, the wheel, the hands and the back of the seat; outside the car
  // there is nothing within a metre of the camera worth drawing.
  weather.rainUniforms.uHole.value = camMode === 1 ? 2.25 : 0.9;
  weather.step(dt, S.race ? S.race.player : null, S.oval);
  weather.render();
  if (S.race) crews.update(S.race.stopsInProgress(camera.position));
  // THE GRASS. Two uniforms a frame: the clock, and where the nearest
  // car is, which is what flattens it as the field goes past.
  if (S.art && S.art.group.userData.grass) {
    const c0 = S.race ? S.race.player : null;
    for (const gr of S.art.group.userData.grass) {
      const u = gr.userData.uniforms;
      u.uTime.value += dt;
      if (c0) u.uCar.value.set(c0.car.x, c0.y, c0.car.z);
      u.uWind.value = 0.11 + weather.rain * 0.30;
    }
  }
  if (S.art && S.art.crowd) S.art.crowd.step(dt, crowdExcitement(dt));
  if (S.flagMat) S.flagMat.userData.uniforms.uTime.value += dt;
  const car = S.race ? S.race.player.car : null;
  const v = car ? car.speed : 0;
  post.setBlur(S.post === 0 ? 0 : clamp(0.28 + v / 95 * 0.85, 0, 1.25));
  post.render(dt);
}

/** put every car where race.js says it is, on the banking it is on */
function placeCars() {
  for (const { r, art } of S.cars) {
    const car = r.car;
    const g = art.group;
    // THE CAR SITS ON THE BANKING. The height comes from the same
    // heightAt() the physics uses, so a car on the top groove really is
    // several metres above a car on the bottom - and it is rolled by the
    // banking angle, or it would look like it was driving up a wall.
    // ...plus however high the jack has it, during a stop
    g.position.set(car.x, r.y + art.R + car.heave + (r.jackLift || 0), car.z);
    g.rotation.order = 'YXZ';
    g.rotation.y = car.yaw;
    g.rotation.x = -car.pitch;
    g.rotation.z = -(r.bank + car.roll);
    // suspension, steering and the wheels turning
    for (let k = 0; k < 4; k++) {
      art.hubs[k].position.y = clamp(car.wheels[k].travel, -0.12, 0.12);
      art.wheels[k].rotation.x = -car.wheels[k].angle;
      // THE STROBE. A five-spoke wheel at 190 mph turns nearly four
      // times between frames; past about 40 rad/s the eye can no longer
      // follow a spoke and what it sees instead is a wheel crawling
      // backwards. Above that the disc swaps to the smeared texture.
      if (art.discs) {
        const fast = Math.abs(car.wheels[k].spin) > 42;
        const want = fast ? art.wheelBlurMat : art.wheelMat;
        const d0 = k * (art.discs.length / 4) | 0, d1 = (k + 1) * (art.discs.length / 4) | 0;
        for (let q = d0; q < d1; q++) if (art.discs[q].material !== want) art.discs[q].material = want;
      }
      if (k < 2) art.steers[k].rotation.y = car.steer;
    }
    art.steerWheel.rotation.z = -car.steer * 4.0;
    // the sheet metal, when it has moved
    if (r.damage && r.damage.dirty) { art.deform(r.damage); r.damage.dirty = false; }
    // ...and the driver's own head goes out of the way in cockpit view, or
    // you are looking at the back of your own helmet
    if (r === S.race.player) art.driver.visible = camMode !== 1;
    art.group.visible = !(r.out && r.outWhy === 'crash' && S.clock - (r.outAt || 0) > 8);
  }
}

// =====================================================================
// EFFECTS
// =====================================================================
function effects(dt) {
  for (const { r, art } of S.cars) {
    if (r.out) continue;
    const car = r.car;
    // sparks from anything touching anything
    for (const imp of r.impacts) {
      const n = Math.min(18, Math.floor(imp.vn * 2.5 + imp.vt * 0.5));
      for (let k = 0; k < n; k++) {
        sparks.emit(imp.x, imp.y, imp.z,
          -car.vx * 0.22 + (Math.random() - 0.5) * 9,
          1 + Math.random() * 5,
          -car.vz * 0.22 + (Math.random() - 0.5) * 9,
          0.22 + Math.random() * 0.4);
      }
    }
    // SPRAY, off the back tyres, whenever there is water on the road.
    // Rate goes with speed and with how much water there is; the plume
    // is thrown UP and BACKWARDS relative to the car, and then the drag
    // stops it dead and it hangs.
    if (weather.water > 0.10 && car.speed > 12) {
      const want = weather.water * (car.speed / 30) * dt * 26;
      const nn = Math.min(4, Math.floor(want) + (Math.random() < want % 1 ? 1 : 0));
      for (let q = 0; q < nn; q++) {
        const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
        const side = (Math.random() - 0.5) * 1.7;
        const bx = -1.35, by = 0.16;
        spray.emit(
          car.x + (bx * sy + side * cy), r.y + by, car.z + (bx * cy - side * sy),
          -car.vx * 0.22 + (Math.random() - 0.5) * 3.2,
          1.3 + Math.random() * 2.6 + car.speed * 0.022,
          -car.vz * 0.22 + (Math.random() - 0.5) * 3.2,
          0.55 + Math.random() * 0.75,
        );
      }
    }

    // tyre smoke: a tyre that is sliding is a tyre that is smoking, and on
    // a stock car that is most of the time you are having fun
    for (let k = 0; k < 4; k++) {
      const w = car.wheels[k];
      if (w.scrub < 0.96 || car.speed < 6) continue;
      if (Math.random() > (w.scrub - 0.9) * 5 * dt * 60 / 8) continue;
      const [xi, yi] = car.wheelPos(k);
      const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
      smoke.emit(car.x + xi * s + yi * c, r.y + 0.25, car.z + xi * c - yi * s,
        (Math.random() - 0.5) * 3 - car.vx * 0.06, 0.6 + Math.random() * 1.2,
        (Math.random() - 0.5) * 3 - car.vz * 0.06, 0.8 + Math.random() * 0.9);
    }
    if (r.out && !r.outAt) r.outAt = S.clock;
  }
}

function recoverPlayer() {
  const r = S.race.player, tr = S.oval;
  const p = tr.pos(r.dist + 15, tr.halfWidth - 3);
  r.place(p.x, p.z, p.h);
  const v = S.race.phase === PHASE.GREEN ? 30 : 16;
  r.car.vx = Math.sin(p.h) * v; r.car.vz = Math.cos(p.h) * v;
  r.car.gear = 3;
  for (const w of r.car.wheels) w.spin = v / r.car.T.wheelRadius;
  camReady = false;
}

// =====================================================================
// THE CAMERAS
// =====================================================================
//
// Five of them, and the chase camera smooths its ANGLE rather than its
// position - easing the position lags by speed over rate, which at 190 mph
// is twenty metres, so the car shrinks into the distance exactly when it
// should feel fastest.
const CAM_NAMES = ['CHASE', 'COCKPIT', 'BUMPER', 'TRACKSIDE', 'BLIMP'];
let tvPick = 0, tvUntil = 0;

const FLIP = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
const UP = new THREE.Vector3(0, 1, 0);
const camQ = new THREE.Quaternion(), headQ = new THREE.Quaternion();
const carEuler = new THREE.Euler();

function updateCamera(dt) {
  const p = S.race.player, car = p.car, art = p.art;
  if (freeCam) {
    camera.position.set(...freeCam.pos);
    camera.lookAt(...freeCam.aim);
    if (freeCam.fov) { camera.fov = freeCam.fov; camera.updateProjectionMatrix(); }
    sun.position.set(camera.position.x + 120, 260, camera.position.z - 90);
    sun.target.position.set(camera.position.x, 0, camera.position.z);
    return;
  }
  const base = new THREE.Vector3(car.x, p.y + art.R, car.z);
  const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const left = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw));

  if (camMode === 0) {
    // CHASE. The angle is eased, not the position, so the car stays the
    // same size on the screen however fast it is going.
    const want = Math.atan2(-fwd.x, -fwd.z);
    if (!camReady) { camYaw = want; camReady = true; }
    let d = want - camYaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    camYaw += d * Math.min(1, dt * 5.5);
    const dist = 8.6 + car.speed * 0.035;
    camPos.set(base.x + Math.sin(camYaw) * dist, base.y + 2.9 + car.speed * 0.008, base.z + Math.cos(camYaw) * dist);
    camAim.copy(base).addScaledVector(fwd, 9).setY(base.y + 1.1);
  } else if (camMode === 1) {
    // COCKPIT. The eye comes from cockpit.js, which moves it under load,
    // shakes it with the engine and keeps it behind the windscreen.
    const e = cockpit.eye(new THREE.Vector3()).applyEuler(
      new THREE.Euler(-car.pitch, car.yaw, -(p.bank + car.roll), 'YXZ'));
    camPos.copy(base).add(e);
    // you look where the car is going, not where it is pointing, which on
    // a banking is several degrees apart
    camAim.copy(camPos).addScaledVector(fwd, 30).addScaledVector(left, -car.steer * 5).setY(camPos.y + 0.35);
  } else if (camMode === 2) {
    camPos.copy(base).addScaledVector(fwd, 2.3).setY(base.y + 0.30);
    camAim.copy(camPos).addScaledVector(fwd, 30).setY(camPos.y + 0.9);
  } else if (camMode === 3) {
    // TRACKSIDE: a camera on the outside wall, swapped for a new one when
    // the car gets past it - which is how the broadcast does it
    if (S.clock > tvUntil) {
      tvPick = (p.dist + 260) % S.oval.length;
      tvUntil = S.clock + 4.5;
    }
    const q = S.oval.pos(tvPick, -S.oval.halfWidth - 6);
    camPos.set(q.x, q.y + 9, q.z);
    camAim.copy(base).setY(base.y + 0.8);
  } else {
    // BLIMP
    camPos.set(base.x - fwd.x * 70, base.y + 95, base.z - fwd.z * 70);
    camAim.copy(base);
  }
  // IN THE COCKPIT THE EYE DOES NOT LAG. Smoothing the camera position
  // is right behind the car and wrong inside it: your head is bolted to
  // the same seat the car is.
  camera.position.lerp(camPos, camMode === 1 ? 1 : camMode === 3 ? 1 : Math.min(1, dt * 14));
  if (camMode === 1) {
    // THE HEAD IS BOLTED TO THE CAR. lookAt() keeps the camera's up
    // vector pinned to world Y, which is right for every camera outside
    // the car and catastrophically wrong for the one inside it: on
    // thirty-one degrees of banking the whole interior rolls out of
    // frame and you end up looking at the passenger door with the wheel
    // in the bottom corner. So the cockpit takes the car's own
    // orientation, turned a hundred and eighty degrees because a
    // three.js camera looks down its own -Z while the car model faces
    // +Z.
    camQ.setFromEuler(carEuler.set(-car.pitch, car.yaw, -(p.bank + car.roll), 'YXZ'));
    camQ.multiply(FLIP);
    // and then the driver looks a little way into the corner, the way
    // anyone does - the eyes lead the car
    headQ.setFromAxisAngle(UP, car.steer * 0.22 + cockpit.headYaw);
    camQ.multiply(headQ);
    camera.quaternion.copy(camQ);
  } else camera.lookAt(camAim);
  camera.fov = camMode === 1 ? 74 : 62 + Math.min(14, car.speed * 0.16);
  camera.updateProjectionMatrix();

  sun.position.set(base.x + 150, 380, base.z - 100);
  sun.target.position.copy(base);

  // the helmet aperture is geometry in front of the eye, so it is placed
  // here rather than drawn over the top of the finished picture
  if (camMode === 1) cockpit.placeHelmet(camera);
  else cockpit.hideHelmet();
}

// =====================================================================
// THE HUD
// =====================================================================
let hudTick = 0;
function updateHUD() {
  const race = S.race, p = race.player, car = p.car;
  // the dash, every frame, because it is what you look at
  $('speed').innerHTML = Math.round(car.mph) + '<span>MPH</span>';
  $('gear').textContent = car.gear === 0 ? 'N' : car.gear < 0 ? 'R' : car.gear;
  const rev = clamp(car.rpm / TUNE.redline, 0, 1.05);
  $('revfill').style.width = (rev * 100).toFixed(0) + '%';
  const lit = Math.floor(Math.max(0, (rev - 0.55) / 0.45) * 14);
  const lamps = $('lights').children;
  for (let i = 0; i < lamps.length; i++) {
    const on = car.onLimiter ? (Math.floor(performance.now() / 90) % 2 === 0) : i < lit;
    lamps[i].style.background = !on ? '#1b2029'
      : car.onLimiter ? '#b02fd0' : i < 5 ? '#35d07f' : i < 10 ? '#e6c03a' : '#d93a2b';
  }
  $('clutchLamp').textContent = car.stalled ? 'STALLED - C + W' : keys.KeyC ? 'CLUTCH' : '';

  if (++hudTick % 4) return;

  // ---- timing -----------------------------------------------------------
  const lapT = S.clock - p.lapStart;
  $('laptime').textContent = fmtTime(lapT);
  $('last').textContent = p.lastLap ? fmtTime(p.lastLap) : '--:--.---';
  $('best').textContent = p.bestLap ? fmtTime(p.bestLap) : '--:--.---';
  if (S.mode === 'race') {
    $('pos').innerHTML = p.pos + '<small>/' + race.cars + '</small>';
    $('lapcount').textContent = 'LAP ' + clamp(p.lap, 0, race.laps) + ' / ' + race.laps;
    const g = race.gapAhead(p);
    $('gap').textContent = p.pos === 1 ? 'LEADER' : (g < 90 ? '+' + g.toFixed(2) + 's' : '--');
  } else {
    $('lapcount').textContent = 'LAP ' + p.lap;
    $('gap').textContent = '--';
  }

  // ---- the car ----------------------------------------------------------
  const fuelPct = car.fuel / TUNE.fuelMax;
  $('fuelfill').style.width = (fuelPct * 100).toFixed(0) + '%';
  const perLap = S.oval.length * 0.00029;
  $('fuelTxt').textContent = car.fuel.toFixed(1) + ' kg · ' + (car.fuel / perLap).toFixed(0) + ' LAPS';
  const tEls = $('tyres').children;
  // shown in the order they sit on the car: LF RF / LR RR
  const showOrder = [1, 0, 3, 2];
  for (let i = 0; i < 4; i++) {
    const k = showOrder[i], w = car.wheels[k], el = tEls[i];
    const st = p.damage ? p.damage.tyre[k] : 'ok';
    el.className = 't' + (st === 'ok' ? (w.temp > TYRES[car.compound].opt + TYRES[car.compound].win ? ' hot' : '')
      : st === 'flat' ? ' flat' : ' gone');
    el.innerHTML = '<b>' + WHEEL_SHORT[k] + '</b><span>' + (st === 'ok' ? Math.round(w.wear * 100) + '%'
      : st.toUpperCase()) + '</span>';
  }
  const bal = clamp(car.balance, -0.6, 0.6);
  $('balbar').firstElementChild.style.left = (50 + bal * 80) + '%';
  $('wedgeTxt').textContent = car.setup.wedge.toFixed(1);
  $('barTxt').textContent = car.setup.bar.toFixed(1);
  $('dmg').textContent = p.damage ? p.damage.summary.slice(0, 3).join(' · ') : '';

  // ---- flags -------------------------------------------------------------
  $('modeName').textContent = ($('modeName').dataset.base || $('modeName').textContent).split(' · ')[0]
    + (weather.rain > 0.02 ? ' · ' + weather.label : '');
  $('fCaution').classList.toggle('on', race.phase === PHASE.CAUTION);
  $('fDraft').classList.toggle('on', p.tow > 0.25);
  $('fSpeed').classList.toggle('on', p.speeding);

  // ---- THE PIT BOARD ------------------------------------------------------
  // "PIT ROAD" told you the one thing you already knew. What a driver
  // needs down a pit lane is how far to his own box and when to stop, and
  // without it the stop is unfindable - which is why it looked as though
  // there was no crew and no way to get the car mended.
  {
    const fp = $('fPit');
    if (!p.inPit) {
      fp.classList.remove('on', 'near', 'stop');
      fp.textContent = 'PIT ROAD';
    } else {
      fp.classList.add('on');
      const P = S.oval.pit, d = S.race.playerDriver;
      const to = d ? P.rel(p.dist) - P.stallPose(d.stall).at : 0;
      if (p.onBox && p.stopT) {
        fp.classList.remove('near');
        fp.classList.add('stop');
        const left = Math.max(0, (p.pitNeed || 0) * (1 - p.stopT));
        fp.textContent = 'SERVICE  ' + left.toFixed(1) + 's';
      } else if (to > 6) {
        fp.classList.remove('near', 'stop');
        fp.textContent = 'BOX BEHIND YOU  ← ' + Math.round(to) + 'm';
      } else if (to > -8) {
        fp.classList.remove('stop');
        fp.classList.add('near');
        fp.textContent = Math.abs(to) < 4 ? 'YOUR BOX · STOP' : 'YOUR BOX  ' + Math.round(-to) + 'm';
      } else {
        fp.classList.remove('near', 'stop');
        fp.textContent = 'YOUR BOX  ' + Math.round(-to) + 'm';
      }
    }
  }

  if (S.mode === 'race') drawTower();
  drawMap();
}

function fmtTime(t) {
  if (!t || t < 0) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
}

function drawTower() {
  const race = S.race;
  const rows = race.order.slice(0, 14);
  const html = rows.map((r) => {
    const me = r === race.player;
    const g = r === race.order[0] ? 'LEADER'
      : r.out ? (r.outWhy || 'OUT').toUpperCase()
      : r.ai && (r.ai.pitting || r.ai.pitPhase) ? 'PIT'
      : '+' + race.gapAhead(r).toFixed(2);
    return '<div class="row' + (me ? ' me' : '') + (r.out ? ' out' : '')
      + ((r.ai && (r.ai.pitting || r.ai.pitPhase)) || r.inPit ? ' pit' : '') + '">'
      + '<span class="p">' + r.pos + '</span>'
      + '<span class="c" style="background:' + hex(r.entry.livery.accent) + '"></span>'
      + '<span class="no">' + r.entry.number + '</span>'
      + '<span class="n">' + r.entry.driver + '</span>'
      + '<span class="g">' + g + '</span></div>';
  }).join('');
  $('tower').innerHTML = html;
}

// ---- the minimap --------------------------------------------------------
let mapBase = null;
function drawMapBase() {
  const c = $('map'), g = c.getContext('2d');
  const P = S.oval.points;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of P) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 22;
  const s = Math.min((c.width - pad * 2) / (maxX - minX), (c.height - pad * 2) / (maxZ - minZ));
  // X is east and Z is SOUTH, so z grows DOWN the map - draw it the other
  // way and you get a perfect mirror image that runs clockwise
  mapBase = {
    s, ox: pad - minX * s, oz: pad - minZ * s,
    to: (x, z) => [pad + (x - minX) * s, pad + (z - minZ) * s],
  };
  const off = document.createElement('canvas');
  off.width = c.width; off.height = c.height;
  const o = off.getContext('2d');
  o.strokeStyle = 'rgba(200,210,225,0.28)';
  o.lineWidth = Math.max(4, S.oval.halfWidth * 2 * s);
  o.lineCap = 'round';
  o.beginPath();
  P.forEach((p, i) => { const [x, y] = mapBase.to(p.x, p.z); i ? o.lineTo(x, y) : o.moveTo(x, y); });
  o.closePath(); o.stroke();
  // the start/finish line
  const a = S.oval.pos(0, -S.oval.halfWidth), b = S.oval.pos(0, S.oval.halfWidth);
  o.strokeStyle = '#f2f4f7'; o.lineWidth = 3;
  o.beginPath();
  o.moveTo(...mapBase.to(a.x, a.z)); o.lineTo(...mapBase.to(b.x, b.z));
  o.stroke();
  mapBase.img = off;
}

function drawMap() {
  if (!mapBase) return;
  const c = $('map'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(mapBase.img, 0, 0);
  for (const r of S.race.runners) {
    if (r.out) continue;
    const [x, y] = mapBase.to(r.car.x, r.car.z);
    const me = r === S.race.player;
    g.fillStyle = me ? '#ffffff' : hex(r.entry.livery.accent);
    g.beginPath();
    g.arc(x, y, me ? 6 : 4.2, 0, Math.PI * 2);
    g.fill();
    if (me) { g.strokeStyle = '#d93a2b'; g.lineWidth = 2.5; g.stroke(); }
  }
}

// ---- the crew chief on the radio ---------------------------------------
function radio(msg) {
  S.radio.push({ msg, until: S.clock + 4 });
  while (S.radio.length > 3) S.radio.shift();
  const el = $('radio');
  el.innerHTML = S.radio.map((m) => '<div>' + m.msg + '</div>').join('');
  clearTimeout(radio.t);
  radio.t = setTimeout(() => { S.radio = []; el.innerHTML = ''; }, 4200);
  if (/GREEN|CAUTION|CHEQUERED|WHITE/.test(msg)) banner(msg);
}

let bannerT = 0;
function banner(text, sub = '') {
  const el = $('banner');
  el.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
  el.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('show'), 2400);
}

// =====================================================================
// THE END OF THE RACE
// =====================================================================
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  const res = S.race.results();
  const me = res.find((r) => r.player);
  const tail = leagueTail();
  $('resSeason').hidden = !tail;
  $('resTitle').textContent = me ? 'FINISHED ' + ordinal(me.pos) : 'RESULT';
  $('resBody').innerHTML = '<table class="res"><tr><th>POS</th><th>CAR</th><th>DRIVER</th>'
    + '<th>SPONSOR</th><th>LAPS</th><th>BEST</th><th>STOPS</th></tr>'
    + res.slice(0, 20).map((r) => '<tr class="' + (r.player ? 'me' : '') + '">'
      + '<td>' + r.pos + '</td><td class="m">' + r.number + '</td><td>' + r.driver + '</td>'
      + '<td>' + r.sponsor + '</td><td class="m">' + r.laps + '</td>'
      + '<td class="m">' + (r.best ? r.best.toFixed(3) : '-') + '</td>'
      + '<td class="m">' + r.stops + '</td></tr>').join('')
    + '</table>' + tail;
  showScreen('results');
  S.paused = true;
}

/**
 * IF THAT WAS A ROUND OF A SEASON, score it and show the table.
 *
 * The points are scored HERE and nowhere else, off the same results the
 * table above is drawn from, so what the screen says and what the
 * championship banks can never disagree. A point for leading a lap and
 * another for leading the most come out of the race's own count of laps
 * led - see Race#countLaps, which counts a lap when it is completed
 * rather than counting whoever happens to be in front at some instant.
 */
function leagueTail() {
  if (S.mode !== 'league' || !season || !S.lastOpts || !S.lastOpts.league) return '';
  if (season.results.length > season.round) return '';       // already scored
  const res = S.race.results();
  const me = res.find((r) => r.player);
  const led = S.race.ledSummary();
  Season.score(season, res.map((r) => ({ number: r.number, name: r.driver, pos: r.pos })), led);
  season.results.push({ track: S.key, you: me ? me.pos : res.length, led: led.ledMost });
  season.round++;
  Season.save(season);
  const entries = field(0);
  const table = Season.standings(season, entries).slice(0, 10);
  const mine = Season.standings(season, entries).findIndex((r) => r.number === entries[0].number) + 1;
  const rows = table.map((r, i) => '<tr class="' + (r.number === entries[0].number ? 'me' : '') + '"><td>' + (i + 1)
    + '</td><td>#' + r.number + ' ' + r.name + '</td><td class="m">' + r.wins + '</td><td class="m">' + r.points + '</td></tr>').join('');
  const over = Season.done(season);
  return '<h3 class="step" style="margin-top:18px">CHAMPIONSHIP · '
    + (over ? 'FINAL' : 'AFTER ROUND ' + season.round) + '</h3>'
    + '<table class="res"><tr><th>POS</th><th>DRIVER</th><th>WINS</th><th>PTS</th></tr>' + rows + '</table>'
    + '<p class="note">You are ' + ordinal(mine) + ' on ' + (season.points[entries[0].number] || 0) + ' points.'
    + (over ? ' The season is over.' : ' Next: ' + TRACKS[Season.nextTrack(season)].short + '.') + '</p>';
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 !== 10) * (n % 10) < 4 ? n % 10 : 0] || 'th');

// =====================================================================
// THE MENU
// =====================================================================
const MODES = [
  { key: 'race', title: 'RACE', desc: 'A rolling start, a full field, pit stops, cautions and a chequered flag.' },
  { key: 'endurance', title: 'ENDURANCE', desc: 'Hundreds of laps, run in stages. Fuel, tyres and a dozen stops decide it. [ and ] wind the clock on.' },
  { key: 'league', title: 'SEASON', desc: 'A championship, race by race: 40 for a win, a point for leading, and a table that carries.' },
  { key: 'practice', title: 'PRACTICE', desc: 'The speedway to yourself, or with a few cars to draft with.' },
];
const OPTS = {
  laps: [10, 20, 40, 80], cars: [8, 16, 24, 32, 40], pcars: [1, 4, 8, 16],
  elaps: [100, 200, 400, 500],
  races: [5, 10, 18],
  skill: [{ v: 0.92, t: 'EASY' }, { v: 0.95, t: 'MEDIUM' }, { v: 0.97, t: 'HARD' }, { v: 1.0, t: 'CUP' }],
  grid: [{ v: 0, t: 'POLE' }, { v: -1, t: 'MIDFIELD' }, { v: -2, t: 'THE BACK' }],
  assist: [{ v: 1, t: 'ON' }, { v: 0, t: 'OFF' }],
};
const choice = { laps: 20, cars: 24, pcars: 1, skill: 0.97, grid: -1, assist: 1, elaps: 200, races: 10 };
let season = Season.load();
let pickedMode = 'race', pickedTrack = 'daytona';

function showScreen(which) {
  for (const id of ['menu', 'pause', 'results']) $(id).classList.toggle('on', id === which);
  if (which) $('hud').classList.remove('on');
  else if (S.running) $('hud').classList.add('on');
}
function menuStep(step) {
  for (const id of ['menuMode', 'menuTrack', 'menuRace', 'menuPractice', 'menuEndurance', 'menuSeason']) {
    $(id).hidden = id !== 'menu' + step[0].toUpperCase() + step.slice(1);
  }
}

function buildMenu() {
  $('modes').innerHTML = MODES.map((m) => '<button class="card" data-mode="' + m.key + '">'
    + '<div class="t">' + m.title + '</div><div class="d">' + m.desc + '</div></button>').join('');
  $('modes').onclick = (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    pickedMode = b.dataset.mode;
    // a season picks its own calendar, so it does not ask for a track
    if (pickedMode === 'league') { buildSeason(); menuStep('season'); return; }
    buildTracks();
    menuStep('track');
  };
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.onclick = () => menuStep(b.dataset.back);
  });
  for (const [name, list] of Object.entries(OPTS)) {
    document.querySelectorAll('[data-opt="' + name + '"]').forEach((seg) => {
      seg.innerHTML = list.map((o) => {
        const v = typeof o === 'object' ? o.v : o;
        const t = typeof o === 'object' ? o.t : o;
        return '<button data-v="' + v + '"' + (choice[name] === v ? ' class="sel"' : '') + '>' + t + '</button>';
      }).join('');
      seg.onclick = (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        choice[name] = Number(e.target.dataset.v);
        for (const el of seg.children) el.classList.toggle('sel', el === e.target);
      };
    });
  }
  $('goEndurance').onclick = () => {
    const cars = choice.cars;
    const grid = choice.grid === 0 ? 0 : choice.grid === -1 ? Math.floor(cars / 2) : cars - 1;
    go('endurance', pickedTrack, { laps: choice.elaps, cars, skill: choice.skill, grid, assist: choice.assist });
  };
  $('goRace').onclick = () => {
    const cars = choice.cars;
    const grid = choice.grid === 0 ? 0 : choice.grid === -1 ? Math.floor(cars / 2) : cars - 1;
    go('race', pickedTrack, { laps: choice.laps, cars, skill: choice.skill, grid, assist: choice.assist });
  };
  $('goPractice').onclick = () => go('practice', pickedTrack, { cars: choice.pcars, assist: choice.assist });
  document.querySelectorAll('#pause [data-act], #results [data-act]').forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'resume') { S.paused = false; showScreen(null); }
      if (a === 'restart') { finished = false; go(S.mode, S.key, S.lastOpts); }
      if (a === 'menu') { S.running = false; finished = false; teardown(); showScreen('menu'); menuStep('mode'); }
      if (a === 'season') {
        S.running = false; finished = false; teardown();
        buildSeason(); showScreen('menu'); menuStep('season');
      }
    };
  });
}

/**
 * THE SEASON SCREEN. Liam: "a league mode". A championship is a calendar,
 * a table and a round number (season.js): you turn up at each track in
 * order, race it, take the points, and the table carries. It is saved, so
 * closing the tab in the middle of a season loses nothing.
 */
function buildSeason() {
  const body = $('seasonBody');
  if (!season) {
    $('seasonTitle').textContent = 'SEASON · A NEW ONE';
    body.innerHTML = '<div class="opts">'
      + '<label>RACES</label><div class="seg" data-opt="races"></div>'
      + '<label>LAPS A RACE</label><div class="seg" data-opt="laps"></div>'
      + '<label>CARS</label><div class="seg" data-opt="cars"></div>'
      + '<label>DIFFICULTY</label><div class="seg" data-opt="skill"></div>'
      + '</div><p class="note">Forty for a win, thirty-five for second and one less each place after it, '
      + 'plus a point for leading a lap and another for leading the most. Every race is at a different track.</p>';
    wireOpts(body);
    $('seasonGo').textContent = 'START THE SEASON';
    $('seasonGo').onclick = () => {
      season = Season.makeSeason(Object.keys(TRACKS), {
        races: choice.races, laps: choice.laps, cars: choice.cars, skill: choice.skill });
      Season.save(season);
      buildSeason();
    };
    $('seasonDrop').hidden = true;
    return;
  }
  const left = !Season.done(season);
  const key = Season.nextTrack(season);
  const entries = field(0);
  const table = Season.standings(season, entries).slice(0, 12);
  $('seasonTitle').textContent = left
    ? 'SEASON · ROUND ' + (season.round + 1) + ' OF ' + season.calendar.length + ' · ' + TRACKS[key].short
    : 'SEASON · OVER';
  const cal = season.calendar.map((k, i) => {
    const res = season.results[i];
    return '<span class="round' + (i === season.round && left ? ' now' : '') + (res ? ' done' : '') + '">'
      + TRACKS[k].short + (res ? '<b>P' + res.you + '</b>' : '') + '</span>';
  }).join('');
  const rows = table.map((r, i) => '<tr class="' + (r.number === entries[0].number ? 'me' : '') + '"><td>' + (i + 1)
    + '</td><td>#' + r.number + ' ' + r.name + '</td><td class="m">' + r.wins + '</td><td class="m">' + r.points + '</td></tr>').join('');
  body.innerHTML = '<div class="calendar">' + cal + '</div>'
    + '<table class="res"><tr><th>POS</th><th>DRIVER</th><th>WINS</th><th>PTS</th></tr>' + rows + '</table>';
  $('seasonGo').textContent = left ? 'RACE AT ' + TRACKS[key].short : 'NEW SEASON';
  $('seasonGo').onclick = () => {
    if (!left) { Season.clear(); season = null; buildSeason(); return; }
    const cars = season.cars;
    go('league', key, { laps: season.laps, cars, skill: season.skill,
      grid: Math.floor(cars / 2), assist: choice.assist, league: true });
  };
  $('seasonDrop').hidden = false;
  $('seasonDrop').onclick = () => { Season.clear(); season = null; buildSeason(); };
}

/** the option segments, wired wherever they are drawn */
function wireOpts(root) {
  for (const [name, list] of Object.entries(OPTS)) {
    root.querySelectorAll('[data-opt="' + name + '"]').forEach((seg) => {
      seg.innerHTML = list.map((o) => {
        const v = typeof o === 'object' ? o.v : o;
        const t = typeof o === 'object' ? o.t : o;
        return '<button data-v="' + v + '"' + (choice[name] === v ? ' class="sel"' : '') + '>' + t + '</button>';
      }).join('');
      seg.onclick = (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        choice[name] = Number(e.target.dataset.v);
        for (const el of seg.children) el.classList.toggle('sel', el === e.target);
      };
    });
  }
}

function buildTracks() {
  const el = $('tracks');
  el.innerHTML = Object.values(TRACKS).map((t) => '<button class="card" data-track="' + t.key + '">'
    + '<canvas width="360" height="200" data-plan="' + t.key + '"></canvas>'
    + '<div class="t">' + t.short + '</div>'
    + '<div class="d">' + t.blurb + '<br>' + (t.length / 1609.34).toFixed(3) + ' miles · '
    + Math.max(...t.shape.map((s) => s.bank)) + '&deg; banking</div></button>').join('');
  // a little plan of each track, drawn from the same description the
  // speedway is built from
  for (const cv of el.querySelectorAll('[data-plan]')) {
    const oval = buildOval(cv.dataset.plan);
    const g = cv.getContext('2d');
    const P = oval.points;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of P) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 20;
    const s = Math.min((cv.width - pad * 2) / (maxX - minX), (cv.height - pad * 2) / (maxZ - minZ));
    const to = (x, z) => [pad + (x - minX) * s + (cv.width - pad * 2 - (maxX - minX) * s) / 2,
                          pad + (z - minZ) * s];
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(210,220,235,0.85)';
    g.lineWidth = Math.max(5, oval.halfWidth * 2 * s);
    g.beginPath();
    P.forEach((p, i) => { const q = to(p.x, p.z); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
    g.closePath(); g.stroke();
    // the banking, as a thicker line where it is steeper
    for (let i = 0; i < P.length; i += 4) {
      if (P[i].bank < 0.3) continue;
      const a = to(P[i].x, P[i].z), b = to(P[(i + 4) % P.length].x, P[(i + 4) % P.length].z);
      g.strokeStyle = 'rgba(217,58,43,0.85)';
      g.lineWidth = Math.max(3, oval.halfWidth * 2 * s * 0.45);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    const q = to(oval.at(0).x, oval.at(0).z);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(q[0], q[1], 4.5, 0, Math.PI * 2); g.fill();
  }
  el.onclick = (e) => {
    const b = e.target.closest('[data-track]');
    if (!b) return;
    pickedTrack = b.dataset.track;
    $('raceTitle').textContent = 'RACE AT ' + TRACKS[pickedTrack].short;
    $('practiceTitle').textContent = 'PRACTICE AT ' + TRACKS[pickedTrack].short;
    $('enduranceTitle').textContent = 'ENDURANCE AT ' + TRACKS[pickedTrack].short;
    menuStep(pickedMode);
  };
}

function go(mode, key, opts) {
  S.lastOpts = opts;
  finished = false;
  $('loading').classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    start(mode, key, opts);
    $('loading').classList.remove('on');
  }));
}

buildMenu();
menuStep('mode');

// =====================================================================
// THE HOOK THE TEST TOOLS DRIVE IT THROUGH
// =====================================================================
//
// The SAME objects the game uses, so anything a tool proves is true of
// the game and not of a copy of it.
window.__nascar = {
  TUNE, TRACKS, AIR,
  get oval() { return S.oval; },
  get race() { return S.race; },
  get car() { return S.race ? S.race.player.car : null; },
  get session() { return S; },
  start: (mode, key, opts) => go(mode, key, opts || {}),
  /** straight into practice on a track, with no menu */
  load: (key, cars = 1) => go('practice', key, { cars, assist: 1 }),
  state() {
    const p = S.race.player, car = p.car;
    return {
      mph: Math.round(car.mph), kph: Math.round(car.kph), gear: car.gear, rpm: Math.round(car.rpm),
      x: +car.x.toFixed(2), z: +car.z.toFixed(2), y: +p.y.toFixed(2),
      lat: +p.lat.toFixed(2), dist: Math.round(p.dist), bank: +(p.bank * 57.2958).toFixed(1),
      slip: +car.slipAngle.toFixed(1), latG: +car.latG.toFixed(2), lonG: +car.lonG.toFixed(2),
      balance: +car.balance.toFixed(3), surface: p.surface, inPit: p.inPit, speeding: p.speeding,
      fuel: +car.fuel.toFixed(1), stopped: car.stopped, stalled: car.stalled,
      wheels: car.wheels.map((w) => ({ load: Math.round(w.load), wear: +w.wear.toFixed(3),
        temp: Math.round(w.temp), scrub: +w.scrub.toFixed(2) })),
      air: { drag: +car.air.dragScale.toFixed(3), pushF: +car.air.pushF.toFixed(3), pushR: +car.air.pushR.toFixed(3) },
      tow: +p.tow.toFixed(2), pushedBy: +p.pushedBy.toFixed(2),
      damage: p.damage ? { severity: +p.damage.severity.toFixed(3), summary: p.damage.summary,
        tyre: p.damage.tyre.slice(),
        panels: p.damage.panels.map((q) => ({ id: q.spec.id, worst: +q.worst.toFixed(3), gone: q.gone })) } : null,
      lap: { count: p.lap, last: p.lastLap, best: p.bestLap }, pos: p.pos,
      race: { phase: S.race.phase, laps: S.race.laps, cars: S.race.cars, cautions: S.race.cautionCount,
        spread: Math.round(S.race.spread) },
      track: S.key, mode: S.mode, cam: CAM_NAMES[camMode],
    };
  },
  /** run the REAL race loop for a while with these pedals held down */
  drive(ms, input = {}) {
    const steps = Math.round(ms / (1000 / 60));
    for (let k = 0; k < steps; k++) {
      // WITH AUTOPILOT ON, THE ROBOT DRIVES. drive() used to force its own
      // pedals down the player's throat whatever else was set, so a tool
      // that turned the autopilot on and then asked for eighteen seconds
      // of full throttle got eighteen seconds of full throttle and no
      // steering, which at a Daytona is a trip across the infield.
      if (S.autopilot) { S.race.step(HZ, null); S.clock += HZ; continue; }
      S.race.step(HZ, {
        throttle: 0, brake: 0, steerLeft: false, steerRight: false, clutch: false,
        shiftUp: false, shiftDown: false, assist: S.assist, ...input,
        ...(k > 0 ? { shiftUp: false, shiftDown: false } : {}),
      });
      S.clock += HZ;
    }
    placeCars();
    return window.__nascar.state();
  },
  /** let the whole field race itself, the player included */
  autopilot(on = true) { S.autopilot = !!on; },
  warp(n) { S.warp = Math.max(1, n | 0); },
  setGear(g) { S.race.player.car.gear = g; },
  /** TEST ONLY: a contact on the player's car, as world.js would report it */
  hit(fwd, left, vn, vt = 0, up = 0.3) {
    const p = S.race.player, c = p.car, s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const out = p.damage.impact({ fwd, left, up, vn, vt, other: null,
      x: c.x + s * fwd + co * left, y: p.y + 0.5, z: c.z + co * fwd - s * left, nx: 0, nz: 0 });
    p.damage.messages.length = 0;
    p.damage.dirty = true;
    placeCars();
    return out;
  },
  /** put the player somewhere, at a speed */
  place(dist, lat = 0, speed = 0) {
    const p = S.race.player, q = S.oval.pos(dist, lat);
    p.place(q.x, q.z, q.h);
    p.car.vx = Math.sin(q.h) * speed; p.car.vz = Math.cos(q.h) * speed;
    p.car.gear = speed > 60 ? 4 : speed > 30 ? 3 : 2;
    for (const w of p.car.wheels) w.spin = speed / p.car.T.wheelRadius;
    camReady = false;
    post.resetHistory();
    placeCars();
  },
  /** put a robot somewhere, for photographs */
  placeCar(i, dist, lat = 0, speed = 0) {
    const r = S.race.runners[i];
    if (!r) return;
    const q = S.oval.pos(dist, lat);
    r.place(q.x, q.z, q.h);
    r.car.vx = Math.sin(q.h) * speed; r.car.vz = Math.cos(q.h) * speed;
    for (const w of r.car.wheels) w.spin = speed / r.car.T.wheelRadius;
    placeCars();
  },
  freeCam(c) { freeCam = c; post.resetHistory(); },
  setCam(m) { camMode = m; camReady = false; post.resetHistory(); },
  get cockpit() { return cockpit; },
  helmet(on) { cockpit.helmetOn = !!on; },
  get cams() { return CAM_NAMES; },
  pause(on = true) { S.paused = !!on; },
  /** 0 straight to the screen, 0.5 blur only, 1 the whole chain */
  setPost(q) { S.post = q; post.setQuality(q); },
  get post() { return post; },
  get sky() { return sky; },
  /** dry | cloudy | light | heavy */
  weather(kind) {
    weather.set(kind);
    scene.environment = sky.envMap;
    applyWeather();
    return weather.label;
  },
  get rain() { return { kind: weather.kind, rain: +weather.rain.toFixed(3), water: +weather.water.toFixed(3) }; },
  /** TEST ONLY: skip the slow soak so a screenshot can be taken wet */
  soak(w = 1) { weather.rain = w; weather.water = w; weather.targetRain = w; },
  info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    sparks: sparks.alive, smoke: smoke.alive,
    people: S.art && S.art.crowd ? S.art.crowd.count : 0 }),
};
