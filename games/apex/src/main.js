// =====================================================================
// APEX :: main.js - THE GAME
// =====================================================================
//
// Holds the renderer, the camera, the input, the menus and the three ways
// to play, and does nothing clever itself: car.js decides how a car
// behaves, world.js what the circuit does to it, ai.js how the others
// drive, track.js what the circuit looks like.
//
//   FREE DRIVE    a circuit to yourself, no clock that matters
//   TIME ATTACK   flying laps against the clock and against your own best
//                 lap, which drives alongside you as a ghost. Sector times,
//                 a live delta, track limits, a board of your five best.
//   RACE          a grid, five red lights, and up to fifteen other drivers
//                 on the same car and the same physics
//
// Liam: "there is no competitiveness there should be time attack race and
// free drive for tracks".
//
// THE YAW CONVENTION
// The physics has yaw 0 facing +Z, with forward = (sin yaw, cos yaw), and
// three.js `rotation.y = t` sends +Z to (sin t, cos t) - the same - so a
// mesh takes yaw straight. The rotation ORDER is YXZ: turn first, then
// lean in the car's own frame, or a car heading east dives sideways.
import * as THREE from '../vendor/three.module.js';
import { Car, TUNE, TYRES } from './car.js';
import { buildCar, wheelScreen } from './f1car.js';
import { buildTrack } from './track.js';
import { CIRCUITS, centreline } from './circuits.js';
import { Smoke, Marks, MARK, Sparks, SpeedLines } from './fx.js';
import { Damage, Debris, dent, scratch } from './damage.js';
import { Weather, FORECASTS } from './weather.js';
import { PitStop, PIT, chooseTyre, wrongTyre } from './pits.js';
import { TEAMS, field, skillOf } from './teams.js';
import * as League from './league.js';
import { Crew, boxMarking } from './crew.js';
import { WIND, envProbe } from './scenery.js';
import { setAnisotropy } from './textures.js';
import { Runner, collide } from './world.js';
import { racingLine, speedPlan, Driver } from './ai.js';

// ---------------------------------------------------------------------
// renderer, scene, light
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
// the road is seen at a glancing angle all the time, and without this its
// texture smears into grey a few car lengths ahead
setAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb6d8);
scene.fog = new THREE.Fog(0x9cc0dd, 700, 4200);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 6000);

const sun = new THREE.DirectionalLight(0xfff3e0, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
const SH = 60;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd8f0, 0x4a4436, 1.15);
scene.add(hemi);

// WHAT THE BODYWORK CAN SEE. Three lights tell a surface how bright it is;
// only an environment tells it what it looks like. This is the sky, the
// ground and the sun as a blurred probe, which every painted, chromed,
// glazed or wet material in the game reflects - see scenery.js. The
// intensity is under one because the hemisphere light is already doing
// part of this job and two ambients stacked make a washed-out car.
const env = envProbe(renderer);
scene.environment = env.update({ dir: new THREE.Vector3(0.45, 0.7, 0.3), strength: 1 });
scene.environmentIntensity = 0.62;

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
// THE FIELD is eight invented teams of two, from teams.js: the same cars,
// the same pecking order and the same team mates every race, which is what
// makes a league worth running.
// ---------------------------------------------------------------------
const ENTRIES = field();
const PLAYER = ENTRIES.find((e) => e.player);
const RIVALS = ENTRIES.filter((e) => !e.player);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------------
// storage - every key is apex.* and every read survives a broken value
// ---------------------------------------------------------------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('apex.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('apex.' + k, JSON.stringify(v)); } catch (e) { /* full or blocked: play on */ } },
};

// ---------------------------------------------------------------------
// car art, built once per livery and kept between sessions
// ---------------------------------------------------------------------
const artPool = new Map();
function artFor(livery) {
  const key = JSON.stringify(livery);
  const list = artPool.get(key) || [];
  artPool.set(key, list);
  const free = list.find((a) => !a.inUse);
  if (free) { free.inUse = true; return free; }
  const a = buildCar(TUNE, livery);
  a.inUse = true;
  list.push(a);
  return a;
}
function releaseArt(a) { a.inUse = false; a.repair(); scene.remove(a.group); }

/** a see-through copy of a car, for the ghost of your best lap */
function ghostArt() {
  const a = buildCar(TUNE, { body: 0xdfe8f5, accent: 0x9ad0ff, trim: 0xffffff, number: 0, name: 'BEST' });
  a.group.traverse((o) => {
    if (!o.material) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      c.transparent = true; c.opacity = 0.32; c.depthWrite = false;
      return c;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
    o.castShadow = false;
  });
  a.group.renderOrder = 3;
  return a;
}
let ghost = null;

const smoke = new Smoke(scene);
// the spray off wet tyres: the same particles, bigger, paler
const spray = new Smoke(scene, 1400, [0.78, 0.81, 0.84]);
const marks = new Marks(scene);
const sparks = new Sparks(scene);
const debris = new Debris(scene);
const speedLines = new SpeedLines(document.getElementById('speedlines'));
const weather = new Weather({ scene, renderer, camera, sun, hemi, env });

// ---------------------------------------------------------------------
// the session: one circuit, one mode, the cars on it
// ---------------------------------------------------------------------
const S = {
  mode: null, key: null, opts: {}, track: null, plans: new Map(),
  runners: [], player: null, clock: 0, phase: 'idle',
  lightsT: 0, lightsOutAt: 0, lit: 0,
  best: null, cur: [], lastGhostT: 0, sessionBest: 0, sessionSectors: [0, 0, 0],
  resultsShown: false, finishAt: 0,
};

function loadCircuit(key) {
  if (S.track && S.key === key) return S.track;
  if (S.track) { scene.remove(S.track.group); disposeTree(S.track.group); }
  S.track = buildTrack(CIRCUITS[key]);
  S.key = key;
  S.plans.clear();
  S.line = null;
  scene.add(S.track.group);
  marks.clear();
  drawMapBase();
  return S.track;
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

/** the speed plan for a skill, computed once per circuit per skill */
function planFor(skill) {
  const tr = S.track;
  if (!S.line) S.line = racingLine(tr.points, tr.halfWidth).line;
  const k = skill.toFixed(3);
  if (!S.plans.has(k)) S.plans.set(k, { line: S.line, speeds: speedPlan(S.line, skill, tr.halfWidth < 6) });
  return S.plans.get(k);
}

function clearCars() {
  for (const r of S.runners) { if (r.art) releaseArt(r.art); if (r.crew) r.crew.dispose(); }
  if (S.boxes) { scene.remove(S.boxes); S.boxes = null; }
  S.runners = [];
  S.player = null;
  if (ghost) ghost.group.visible = false;
}

function addRunner(entry, isPlayer) {
  const car = new Car();
  const r = new Runner(car, S.track);
  r.name = entry.name;
  r.entry = entry;
  r.team = entry.team;
  r.number = entry.number;
  // TWO CARS A TEAM, ONE PAINT SCHEME: the second car is marked in the
  // team's accent colour on the tower and the map, or the team mates are
  // the same dot and you cannot tell which of them you just passed.
  r.colour = hex(entry.seat ? entry.livery.accent : entry.livery.body);
  r.isPlayer = isPlayer;
  r.livery = entry.livery;
  r.crew = null;
  r.art = artFor(entry.livery);
  r.marks = [];
  r.penalty = 0;
  r.finished = false;
  r.id = S.runners.length;
  r.damage = new Damage(r);
  r.pit = new PitStop(r, r.id);
  r.out = false;
  r.retired = false;
  r.wrongFor = 0;
  scene.add(r.art.group);
  S.runners.push(r);
  if (isPlayer) S.player = r;
  return r;
}

/** start (or restart) a session */
function start(mode, key, opts = {}) {
  showScreen(null);
  loadCircuit(key);
  clearCars();
  S.mode = mode; S.opts = opts;
  S.clock = 0; S.phase = 'running'; S.resultsShown = false; S.finishAt = 0;
  S.cur = []; S.lastGhostT = 0; S.sessionBest = 0; S.sessionSectors = [0, 0, 0];
  S.sectorFlags = ['', '', ''];
  camReady = false;
  const tr = S.track;
  // every mark, spark and broken part from last session goes; the weather is set before the tyres are chosen for it
  marks.clear(); debris.clear(); sparks.clear(); speedLines.clear();
  weather.setup(opts.weather || 'dry', tr);
  const lapKm = CIRCUITS[key].real / 1000;
  const laps = mode === 'race' ? opts.laps : 8;
  const startTyre = (g) => {
    const best = chooseTyre(weather.water, laps, lapKm);
    if (best === 'inter' || best === 'wet') return best;
    // the field splits its strategies on a dry start
    const harder = { soft: 'medium', medium: 'hard', hard: 'hard' }[best];
    return [best, harder][g % 2];
  };
  S.pitChoice = null;

  if (mode === 'race') {
    const count = opts.cars - 1;
    const skill = { easy: 0.86, medium: 0.925, hard: 0.975 }[opts.skill];
    // a short grid takes whole teams off the back of the field, not drivers
    const entries = opts.entries ? opts.entries.filter((e) => !e.player) : RIVALS.slice(0, count);
    const playerSlot = typeof opts.grid === 'number' ? Math.min(count, opts.grid)
      : opts.grid === 'back' ? count : opts.grid === 'middle' ? Math.floor(count / 2) : 0;
    let slot = 0;
    for (let g = 0; g <= count; g++) {
      const isP = g === playerSlot;
      const entry = isP ? PLAYER : entries[slot++];
      const r = addRunner(entry, isP);
      const gs = tr.gridSlots[g];
      r.place(gs.x, gs.z, gs.h, tr.index(gs.dist));
      r.car.gear = 1;
      r.gridX = gs.x; r.gridZ = gs.z;
      r.car.fitTyres(isP && opts.tyre && opts.tyre !== 'auto' ? opts.tyre : isP ? chooseTyre(weather.water, laps, lapKm) : startTyre(g), 85);
      if (!isP) {
        // HOW GOOD THIS DRIVER IS is the team's pace times their own, so the
        // same teams are quick every week and a team mate is not a clone
        const s = skillOf(entry, skill);
        r.driver = new Driver(r, planFor(s), s, entry.name);
      }
    }
    S.phase = 'grid';
    S.lightsT = 0;
    S.lightsOutAt = 5.2 + 0.4 + Math.random() * 1.6;
    S.lit = 0;
    el('startlights').classList.add('on');
  } else {
    const r = addRunner(PLAYER, true);
    if (mode === 'attack') {
      // A FLYING LAP: start well back from the line, already at speed
      const back = tr.index(-520), p = tr.points[back];
      r.place(p.x, p.z, p.h, back);
      r.car.vx = Math.sin(p.h) * 62; r.car.vz = Math.cos(p.h) * 62;
      r.car.gear = 7;
      for (const w of r.car.wheels) w.spin = 62 / TUNE.wheelRadius;
      // a flying lap is on tyres already up to temperature
      const c = opts.tyre && opts.tyre !== 'auto' ? opts.tyre : chooseTyre(weather.water, 3, lapKm);
      r.car.fitTyres(c, TYRES[c].opt);
      S.best = store.get('best.' + key, null);
      if (S.best && S.best.frames) {
        if (!ghost) { ghost = ghostArt(); scene.add(ghost.group); }
      }
    } else {
      const gs = tr.gridSlots[0];
      r.place(gs.x, gs.z, gs.h, tr.index(gs.dist));
      r.car.gear = 1;
      // out of the garage on cold tyres
      r.car.fitTyres(opts.tyre && opts.tyre !== 'auto' ? opts.tyre : chooseTyre(weather.water, 5, lapKm), 55);
    }
  }

  // every car's box, painted in its colour on the pit lane floor
  S.boxes = new THREE.Group();
  for (const r of S.runners) S.boxes.add(boxMarking(r.pit.boxPose(), r.isPlayer ? 0xffd23f : r.livery.body));
  scene.add(S.boxes);

  el('circuit').textContent = CIRCUITS[key].name.toUpperCase();
  el('modeName').textContent = mode === 'race' ? 'RACE · ' + opts.laps + ' LAPS · ' + opts.skill.toUpperCase()
    : mode === 'attack' ? 'TIME ATTACK' : 'FREE DRIVE';
  el('tower').classList.toggle('on', mode === 'race');
  el('pos').style.display = mode === 'race' ? 'block' : 'none';
  el('sectors').style.display = mode === 'free' ? 'none' : 'grid';
  el('bestLabel').textContent = mode === 'attack' ? 'PERSONAL BEST' : 'BEST';
  el('hud').classList.add('on');
  el('help').style.opacity = 1;
  clearTimeout(start.helpT);
  start.helpT = setTimeout(() => { el('help').style.opacity = 0; }, 9000);
  drawMapBase();
  const wxName = weather.kind === 'dry' ? '' : '  ·  ' + FORECASTS[weather.kind].name.toLowerCase();
  if (mode === 'attack') banner('TIME ATTACK', (S.best ? 'best ' + clock(S.best.time) : 'set a time') + wxName);
  if (mode === 'free') banner('FREE DRIVE', CIRCUITS[key].name + wxName);
}

// ---------------------------------------------------------------------
// cameras
// ---------------------------------------------------------------------
const CAMS = ['chase', 'cockpit', 'tcam', 'trackside'];
let camMode = 0;
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
let camReady = false;
let freeCam = null;          // set by the photo tools: { pos, aim, fov }
let camYaw = 0, camHeight = 0;
let shake = 0;

let orbitFrom = 0;
function placeCamera(dt) {
  const p = S.player;
  if (freeCam || !p) {
    if (freeCam) {
      camera.position.set(...freeCam.pos);
      camera.lookAt(...freeCam.aim);
      camera.fov = freeCam.fov || 55;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const car = p.car;
  const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const here = new THREE.Vector3(car.x, p.y, car.z);
  const fast = Math.min(1, car.speed / 85);
  const mode = CAMS[camMode];
  p.art.helmet.visible = mode !== 'cockpit';

  // THE PIT STOP, IN THE ROUND. Liam: "a 360 animation that shows the
  // people fixing the car". From behind the car, all the way round it once
  // over the length of the stop, low enough to see the wheel guns and
  // rising over the top half way so the jacks and the wing crews show.
  if (p.pit.phase === 'service' && !freeCam) {
    const P = p.pit, pose = P.plan.pose;
    const u = Math.min(1, P.t / P.total);
    const k = u * u * (3 - 2 * u);
    const ang = orbitFrom + k * Math.PI * 2;
    const rad = 7.6 - Math.sin(u * Math.PI) * 1.4;
    // the garages are three metres away on one side: squeeze the circle in
    // there, and lift over the crew, rather than film the back of a wall
    const bp = p.pit.boxPose(), side = S.track.pit.side;
    const gx = Math.cos(bp.h) * side, gz = -Math.sin(bp.h) * side;
    let ox = Math.sin(ang) * rad, oz = Math.cos(ang) * rad;
    const toGarage = ox * gx + oz * gz, room = 2.3;
    let lift = 0;
    if (toGarage > room) { const k = room / toGarage; ox *= k; oz *= k; lift = (1 - k) * 2.2; }
    camPos.set(pose.x + ox, pose.y + 1.5 + Math.sin(u * Math.PI) * 1.6 + lift, pose.z + oz);
    camAim.set(pose.x, pose.y + 0.45, pose.z);
    camera.fov = 52;
    camera.position.copy(camPos);
    camera.lookAt(camAim);
    camera.updateProjectionMatrix();
    camReady = false;
    return;
  }

  if (mode === 'chase') {
    // SMOOTH THE ANGLE, NOT THE POSITION. Easing the camera's position
    // towards a point behind the car lags by speed over rate - at 250
    // km/h that is another twenty metres - so the car shrank into the
    // distance exactly when it should feel most alive. The camera swings
    // round behind the car smoothly but is always the same distance back.
    if (!camReady) camYaw = car.yaw;
    let dy = car.yaw - camYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    camYaw += dy * (1 - Math.exp(-dt * 6));
    const back = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    camHeight += ((p.y + 2.45 + fast * 0.45) - camHeight) * (camReady ? 1 - Math.exp(-dt * 5) : 1);
    camPos.set(car.x, 0, car.z).addScaledVector(back, -(7.4 + fast * 3.2));
    camPos.y = camHeight;
    camAim.copy(here).addScaledVector(back, 9).addScaledVector(up, 1.1);
    camera.fov = 62 + fast * 14;
  } else if (mode === 'cockpit') {
    // the driver's eye, INSIDE the halo - above it, the view was the top
    // tube of the halo with the steering wheel out of frame
    const eye = here.clone().addScaledVector(fwd, 0.22).addScaledVector(up, TUNE.wheelRadius + 0.56 + car.heave);
    camPos.copy(eye);
    camAim.copy(eye.clone().addScaledVector(fwd, 40).addScaledVector(up, -0.9));
    camera.fov = 76 + fast * 8;
  } else if (mode === 'tcam') {
    const eye = here.clone().addScaledVector(fwd, -0.15).addScaledVector(up, 1.28);
    camPos.copy(eye);
    camAim.copy(eye.clone().addScaledVector(fwd, 30).addScaledVector(up, -1.2));
    camera.fov = 68 + fast * 10;
  } else {
    const pt = S.track.points[p.i];
    const l = [Math.cos(pt.h), -Math.sin(pt.h)];
    const off = S.track.halfWidth + 16;
    camPos.set(pt.x + l[0] * off, pt.y + 6.5, pt.z + l[1] * off);
    camAim.lerp(here, 1 - Math.exp(-dt * 10));
    camera.fov = 40;
  }
  camReady = true;
  camera.position.copy(camPos);
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake *= Math.exp(-dt * 8);
  }
  camera.lookAt(camAim);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------
// the minimap
// ---------------------------------------------------------------------
const map = document.getElementById('map');
const mctx = map.getContext('2d');
let mapT = null, mapBase = null;

function drawMapBase() {
  if (!S.track) return;
  const pts = S.track.points;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const pad = 26, W = map.width;
  const s = Math.min((W - pad * 2) / (maxX - minX), (W - pad * 2) / (maxZ - minZ));
  mapT = { s, ox: W / 2 - (minX + maxX) / 2 * s, oz: W / 2 - (minZ + maxZ) / 2 * s };
  mctx.clearRect(0, 0, W, W);
  mctx.lineJoin = 'round'; mctx.lineCap = 'round';
  for (const [w, c] of [[16, 'rgba(0,0,0,0.55)'], [8, '#6b7588']]) {
    mctx.strokeStyle = c; mctx.lineWidth = w;
    mctx.beginPath();
    pts.forEach((p, i) => { const x = p.x * s + mapT.ox, z = p.z * s + mapT.oz; i ? mctx.lineTo(x, z) : mctx.moveTo(x, z); });
    mctx.closePath(); mctx.stroke();
  }
  // the bridge, drawn over the road it crosses
  mctx.strokeStyle = '#aab4c4'; mctx.lineWidth = 8;
  mctx.beginPath();
  let pen = false;
  pts.forEach((p) => {
    const x = p.x * s + mapT.ox, z = p.z * s + mapT.oz;
    if (p.y > 3) { pen ? mctx.lineTo(x, z) : mctx.moveTo(x, z); pen = true; } else pen = false;
  });
  mctx.stroke();
  const a = pts[0], b = pts[5];
  const nx = -(b.z - a.z), nz = b.x - a.x, nl = Math.hypot(nx, nz) || 1;
  mctx.strokeStyle = '#e8392e'; mctx.lineWidth = 5;
  mctx.beginPath();
  mctx.moveTo(a.x * s + mapT.ox + nx / nl * 12, a.z * s + mapT.oz + nz / nl * 12);
  mctx.lineTo(a.x * s + mapT.ox - nx / nl * 12, a.z * s + mapT.oz - nz / nl * 12);
  mctx.stroke();
  mapBase = mctx.getImageData(0, 0, W, W);
}

function drawMapCars() {
  if (!mapBase || !mapT) return;
  mctx.putImageData(mapBase, 0, 0);
  const dot = (x, z, r, fill, ring) => {
    mctx.beginPath(); mctx.arc(x * mapT.s + mapT.ox, z * mapT.s + mapT.oz, r, 0, Math.PI * 2);
    mctx.fillStyle = fill; mctx.fill();
    if (ring) { mctx.lineWidth = 3; mctx.strokeStyle = ring; mctx.stroke(); }
  };
  if (ghost && ghost.group.visible) dot(ghost.group.position.x, ghost.group.position.z, 7, 'rgba(200,225,255,0.6)');
  for (const r of S.runners) if (!r.isPlayer) dot(r.car.x, r.car.z, 7, r.colour, '#0b0e14');
  if (S.player) dot(S.player.car.x, S.player.car.z, 10, '#ffffff', '#e8392e');
}

// ---------------------------------------------------------------------
// HUD helpers
// ---------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const lightsEl = el('lights');
for (let i = 0; i < 10; i++) lightsEl.appendChild(document.createElement('i'));
const lightEls = [...lightsEl.children];
const LIGHT_COLOUR = ['#35d07f', '#35d07f', '#35d07f', '#5fd07f', '#e6c03a', '#e6c03a', '#e6c03a', '#e03a2f', '#e03a2f', '#b02fd0'];
const startCols = [];
for (let i = 0; i < 5; i++) {
  const c = document.createElement('div');
  c.className = 'col';
  c.innerHTML = '<i></i><i></i>';
  el('startlights').appendChild(c);
  startCols.push(c);
}

/** a short time or a signed difference: 1:23.456, 12.345, +0.321 */
function clock(s, plus = false) {
  if (s === null || s === undefined || Number.isNaN(s)) return '--:--.---';
  const sign = s < 0 ? '-' : plus ? '+' : '';
  s = Math.abs(s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return sign + (m ? m + ':' + (r < 10 ? '0' : '') + r.toFixed(3) : r.toFixed(3));
}
function full(s) {
  if (!s) return '--:--.---';
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(3);
}

let bannerT = 0;
function banner(text, small = '', secs = 2.4) {
  el('banner').innerHTML = text + (small ? '<small>' + small + '</small>' : '');
  el('banner').classList.add('show');
  bannerT = secs;
}

// ---------------------------------------------------------------------
// TIME ATTACK: the ghost, the delta, the board
// ---------------------------------------------------------------------
function ghostAt(t) {
  const f = S.best && S.best.frames;
  if (!f || !f.length) return null;
  // frames are [t, x, z, yaw, y, dist] flattened in sixes
  const n = f.length / 6;
  if (t > f[(n - 1) * 6]) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m * 6] <= t) lo = m; else hi = m; }
  const a = lo * 6, b = hi * 6, span = f[b] - f[a] || 1, k = Math.max(0, Math.min(1, (t - f[a]) / span));
  let dy = f[b + 3] - f[a + 3];
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return { x: f[a + 1] + (f[b + 1] - f[a + 1]) * k, z: f[a + 2] + (f[b + 2] - f[a + 2]) * k,
    yaw: f[a + 3] + dy * k, y: f[a + 4] + (f[b + 4] - f[a + 4]) * k };
}

/** how far ahead or behind your best lap you are, at this point on the lap */
function deltaAt(dist, t) {
  const f = S.best && S.best.frames;
  if (!f) return null;
  const n = f.length / 6;
  let lo = 0, hi = n - 1;
  if (dist < f[5] || dist > f[(n - 1) * 6 + 5]) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m * 6 + 5] <= dist) lo = m; else hi = m; }
  const a = lo * 6, b = hi * 6, span = f[b + 5] - f[a + 5] || 1;
  const bt = f[a] + (f[b] - f[a]) * Math.max(0, Math.min(1, (dist - f[a + 5]) / span));
  return t - bt;
}

function onAttackLap(e) {
  const key = S.key;
  if (!e.valid) { banner('LAP INVALID', 'track limits · ' + full(e.time), 2.2); S.cur = []; return; }
  const board = store.get('board.' + key, []);
  board.push({ time: e.time, date: new Date().toISOString().slice(0, 10) });
  board.sort((a, b) => a.time - b.time);
  store.set('board.' + key, board.slice(0, 5));
  if (!S.sessionBest || e.time < S.sessionBest) S.sessionBest = e.time;
  const prev = S.best ? S.best.time : 0;
  if (!prev || e.time < prev) {
    // round to centimetres and hundredths of a radian: a 5 km lap at 20
    // frames a second is ~2000 frames, and this keeps it under 100 KB
    const frames = S.cur.map((v, i) => (i % 6 === 0 ? Math.round(v * 1000) / 1000 : i % 6 === 3 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100));
    S.best = { time: e.time, sectors: e.sectors, frames };
    store.set('best.' + key, S.best);
    if (!ghost) { ghost = ghostArt(); scene.add(ghost.group); }
    banner(prev ? 'NEW PERSONAL BEST' : 'LAP TIME SET', full(e.time) + (prev ? '  ·  ' + clock(e.time - prev, true) : ''), 3);
  } else {
    banner(full(e.time), clock(e.time - prev, true) + ' to your best', 2.2);
  }
  S.cur = [];
}

function sectorColour(index, time) {
  const pb = S.best && S.best.sectors ? S.best.sectors[index] : 0;
  let c = 'slow';
  if (!pb || time < pb) c = 'pb';
  else if (!S.sessionSectors[index] || time <= S.sessionSectors[index]) c = 'good';
  if (!S.sessionSectors[index] || time < S.sessionSectors[index]) S.sessionSectors[index] = time;
  return c;
}

// ---------------------------------------------------------------------
// RACE: order, gaps, DRS, finish
// ---------------------------------------------------------------------
const MARK_EVERY = 25;    // a timing loop every 25 metres: gaps are measured, not guessed

function order() {
  return S.runners.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    return b.progress - a.progress;
  });
}

/** seconds between two cars at the last timing loop both have passed */
function gap(ahead, behind) {
  const m = Math.floor(behind.progress / MARK_EVERY);
  if (m < 0 || m >= behind.marks.length || m >= ahead.marks.length) return null;
  return behind.marks[m] - ahead.marks[m];
}

let towerT = 0;
function drawTower(list) {
  const lead = list[0];
  const rows = list.map((r, i) => {
    let g = '';
    if (i === 0) g = S.phase === 'grid' ? '' : 'LAP ' + Math.max(1, Math.min(S.opts.laps, r.lap));
    else if (r.finished && lead.finished) g = '+' + (r.finishTime - lead.finishTime).toFixed(3);
    else {
      const laps = Math.floor((lead.progress - r.progress) / S.track.length);
      const t = gap(lead, r);
      g = laps >= 1 ? '+' + laps + ' LAP' + (laps > 1 ? 'S' : '') : t === null ? '' : '+' + t.toFixed(1);
    }
    if (r.retired) g = 'OUT';
    else if (r.pit.driving) g = 'PIT';
    return '<div class="row' + (r.isPlayer ? ' me' : '') + (r.retired ? ' out' : '') + '"><span class="p">' + (i + 1) + '</span><span class="c" style="background:'
      + r.colour + '"></span><span class="n">' + r.name + '</span><span class="g">' + g + '</span></div>';
  });
  el('tower').innerHTML = rows.join('');
}

function showResults() {
  S.resultsShown = true;
  const list = order();
  const lead = list[0];
  const L = S.track.length;
  const rows = list.map((r, i) => {
    let t;
    if (r.finished) t = i === 0 ? full(r.finishTime) : '+' + (r.finishTime - lead.finishTime).toFixed(3);
    else {
      const laps = Math.floor((lead.progress - r.progress) / L);
      t = r.retired ? 'DNF' : laps >= 1 ? '+' + laps + ' lap' + (laps > 1 ? 's' : '') : 'running';
    }
    return '<tr class="' + (r.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><span style="display:inline-block;width:4px;height:12px;border-radius:2px;margin-right:8px;background:'
      + r.colour + '"></span>' + r.name + '<small class="tm">' + (r.team ? r.team.name : '') + '</small></td><td class="m">' + t + '</td><td class="m">' + full(r.bestLap) + '</td><td class="m">' + r.pit.stops + '</td><td>'
      + (r.penalty ? '+' + r.penalty + 's jump start' : '') + '</td></tr>';
  });
  const pos = list.indexOf(S.player) + 1;
  el('resTitle').textContent = pos === 1 ? 'YOU WIN' : 'P' + pos + ' OF ' + list.length;
  // ---- the championship, if this was a round of one ----------------------
  let leagueTail = '';
  if (S.mode === 'race' && S.opts.league && S.league && S.league.phase === 'race' && season) {
    const out = leagueFinished(list);
    const table = League.standings(season).slice(0, 6);
    leagueTail = '<h3 class="step" style="margin-top:18px">CHAMPIONSHIP  ·  ' + (League.done(season) ? 'FINAL' : 'AFTER ROUND ' + season.round) + '</h3>'
      + '<table class="res">' + table.map((r, i) => '<tr class="' + (r.player ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>'
        + r.name + '<small class="tm">' + r.team.name + '</small></td><td class="m">' + r.points + '</td></tr>').join('') + '</table>'
      + '<p class="note">You are P' + out.position + ' on ' + out.points + ' points.'
      + (League.done(season) ? '  The season is over.' : '  Next: ' + CIRCUITS[League.nextKey(season)].name + '.') + '</p>';
  }
  el('resBody').innerHTML = '<table class="res"><tr><th>POS</th><th>DRIVER</th><th>TIME</th><th>BEST LAP</th><th>STOPS</th><th></th></tr>' + rows.join('') + '</table>' + leagueTail;
  el('resNext').hidden = !leagueTail;
  showScreen('results');
}

// ---------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------
let prev = performance.now();
let paused = false;

function playerInput(r) {
  return {
    throttle: (keys.KeyW || keys.ArrowUp) ? 1 : 0,
    brake: !!(keys.KeyS || keys.ArrowDown),
    steerLeft: !!(keys.KeyA || keys.ArrowLeft),
    steerRight: !!(keys.KeyD || keys.ArrowRight),
    clutch: !!keys.KeyC,
    drs: !!keys.Space,
    shiftUp: tap('ShiftLeft') || tap('ShiftRight') || tap('KeyE'),
    shiftDown: tap('ControlLeft') || tap('ControlRight') || tap('KeyQ'),
  };
}

/** can this car open its wing here? */
function drsAllowed(r) {
  if (S.mode !== 'race') return true;
  if (S.phase !== 'running' || r.lap < 2) return false;
  // within a second of the car ahead...
  const list = order(), i = list.indexOf(r);
  if (i <= 0) return false;
  const g = gap(list[i - 1], r);
  if (g === null || g > 1.0) return false;
  // ...and on a straight: nothing tighter than an 800 m radius for 150 m
  const tr = S.track, n = tr.points.length;
  for (let d = 0; d < 150; d += 10) {
    if (Math.abs(tr.points[(r.i + Math.round(d / tr.spacing)) % n].curve) > 1 / 800) return false;
  }
  return true;
}

function resetRunner(r, back = 15) {
  const tr = S.track;
  const idx = tr.index(r.dist - back), p = tr.points[idx];
  const keepLap = r.lap, keepStarted = r.started;
  r.place(p.x, p.z, p.h, idx);
  r.lap = keepLap; r.started = keepStarted;
  r.progress = r.lap * tr.length + r.dist;
  r.car.gear = 2;
  for (let k = 0; k < 4; k++) marks.lift(r.id + ':' + k);
  if (r.isPlayer) camReady = false;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (!S.track || !S.player) { if (S.track) { placeCamera(dt); renderer.render(scene, camera); } return; }

  if (tap('Escape') && !S.resultsShown) {
    paused = !paused;
    showScreen(paused ? 'pause' : null);
  }
  if (paused) { speedLines.clear(); renderer.render(scene, camera); return; }
  if (tap('KeyV')) { camMode = (camMode + 1) % CAMS.length; camReady = false; }

  // the test tools can run the world faster than the screen, in whole frames
  for (let k = 0; k < (S.warp || 1); k++) step(dt);

  // ---- art ---------------------------------------------------------
  for (const r of S.runners) syncArt(r, dt);
  if (ghost) {
    const g = S.mode === 'attack' && S.player.started ? ghostAt(S.clock - S.player.lapStart) : null;
    ghost.group.visible = !!g;
    if (g) {
      ghost.group.position.set(g.x, g.y + TUNE.wheelRadius, g.z);
      ghost.group.rotation.set(0, g.yaw, 0);
      // fade it out when you are sitting on top of it, or it fills the screen
      const near = Math.hypot(g.x - S.player.car.x, g.z - S.player.car.z);
      ghost.group.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.opacity = Math.min(0.32, near / 30); });
    }
  }

  crews(dt, now);
  WIND.uTime.value += dt;
  if (S.track.sky) S.track.sky.position.copy(camera.position);
  const pc = S.player.car;
  sun.target.position.set(pc.x, S.player.y, pc.z);
  sun.position.set(pc.x - 90, S.player.y + 150, pc.z + 70);
  placeCamera(dt);
  smoke.step(dt); spray.step(dt); sparks.step(dt); debris.step(dt); marks.step();
  weather.stepRain(dt, { x: pc.vx, z: pc.vz });
  // SPEED LINES stream out of the point the car is heading for
  if (CAMS[camMode] !== 'trackside' && !freeCam) {
    const ahead = new THREE.Vector3(pc.x + pc.vx * 3, S.player.y + 0.8, pc.z + pc.vz * 3).project(camera);
    const vp = ahead.z < 1 && Math.abs(ahead.x) < 1.5 ? [(ahead.x + 1) / 2, (1 - ahead.y) / 2] : [0.5, 0.45];
    speedLines.step(dt, pc.kph, vp, pc.drs ? 1 : 0);
  } else speedLines.clear();
  hud(now, dt);
  drawMapCars();
  weather.reflect(S.player.y);
  renderer.render(scene, camera);
}

/**
 * WHO IS IN WHOSE WAKE.
 *
 * For each car, the nearest car ahead of it on the road: how far up the
 * road, and how far across. The tow only works if you are BEHIND
 * somebody, so the test is in the car's own frame - ahead and roughly in
 * line - and it fades out sideways, because a car alongside is not towing
 * you, it is racing you.
 *
 * This is its own function because the frame loop is not the only thing
 * that has to run it: __apex.drive() steps the player's car on its own
 * for the test tools, and a tow the tools cannot see is a tow nobody can
 * measure. tools/draft.mjs is the measurement.
 */
function wake() {
  for (const r of S.runners) {
    if (r.out) continue;
    const car = r.car;
    let tow = 0;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    for (const o of S.runners) {
      if (o === r || o.out) continue;
      const dx = o.car.x - car.x, dz = o.car.z - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 2 || ahead > 55) continue;
      const across = Math.abs(dx * lx + dz * lz);
      if (across > 4.5) continue;
      if (Math.abs(o.y - r.y) > 3) continue;                 // one is on the bridge
      const near = 1 - (ahead - 2) / 53;                     // 1 on his gearbox, 0 at 55 m
      const inLine = 1 - across / 4.5;
      tow = Math.max(tow, near * inLine);
    }
    car.tow = tow;
    // dirty air arrives sooner than the tow does and hurts most right behind
    car.dirty = Math.min(1, tow * 1.15);
  }
}

function step(dt) {
  const tr = S.track;
  const racing = S.mode === 'race';

  // ---- the start ------------------------------------------------------
  if (S.phase === 'grid') {
    S.lightsT += dt;
    const lit = Math.min(5, Math.floor(S.lightsT - 0.2));
    if (lit !== S.lit) { S.lit = lit; startCols.forEach((c, i) => c.classList.toggle('lit', i < lit)); }
    tr.startLights.forEach((l, i) => l.material.emissive.setHex(i < lit ? 0xff1a0a : 0x000000));
    if (S.lightsT >= S.lightsOutAt) {
      S.phase = 'running';
      startCols.forEach((c) => c.classList.remove('lit'));
      tr.startLights.forEach((l) => l.material.emissive.setHex(0x000000));
      setTimeout(() => el('startlights').classList.remove('on'), 700);
      banner('LIGHTS OUT', '', 1.2);
      S.clock = 0;
      // A JUMP START is moving before the lights go out
      const p = S.player;
      if (Math.hypot(p.car.x - p.gridX, p.car.z - p.gridZ) > 1.5) {
        p.penalty = 5;
        banner('JUMP START', '5 second penalty', 2.6);
      }
    }
  }
  const go = S.phase === 'running' || S.phase === 'done';

  wake();

  // ---- the weather, before anything reads it ---------------------------
  weather.step(dt);
  const lapKm = tr.length / 1000;

  // ---- every car --------------------------------------------------------
  for (const r of S.runners) {
    if (r.out) continue;
    const car = r.car;
    car.water = weather.water;
    car.trackTemp = weather.track;
    let inp = null;

    // THE ROBOTS' PIT WALL: come in for a broken car, worn-out tyres or the
    // wrong tyres for the weather - but not on the last lap for tyres alone
    if (racing && !r.isPlayer && !r.pit.active && !r.finished && S.phase === 'running') {
      const lapsLeft = S.opts.laps - Math.max(1, r.lap) + 1;
      const worn = Math.min(...car.wheels.map((w) => w.wear));
      r.wrongFor = wrongTyre(car.compound, weather.water) ? r.wrongFor + dt : 0;
      const why = (r.damage.needsPit && !r.damage.terminal) || (worn < 0.28 && lapsLeft > 1) || worn < 0.1 || r.wrongFor > 8;
      if (why && lapsLeft >= 1) r.pit.call(chooseTyre(weather.water, Math.max(1, lapsLeft - 1), lapKm));
    }

    r.pit.others = S.runners;
    const pitInp = r.pit.step(dt, (ev) => onPit(r, ev));
    if (r.isPlayer) {
      if (tap('KeyP')) {
        const was = r.pit.phase;
        const want = S.pitChoice || chooseTyre(weather.water, racing ? Math.max(1, S.opts.laps - r.lap) : 5, lapKm);
        r.pit.call(want);
        if (was === 'none') banner('BOX, BOX', TYRES[want].name.toLowerCase() + ' tyres · 1-5 to change', 1.8);
        else if (was === 'called') banner('STAY OUT', '', 1.2);
      }
      for (const [n, c] of [['Digit1', 'soft'], ['Digit2', 'medium'], ['Digit3', 'hard'], ['Digit4', 'inter'], ['Digit5', 'wet']]) {
        if (tap(n)) { S.pitChoice = c; S.pitChoiceAt = performance.now(); if (r.pit.active) r.pit.compound = c; }
      }
    }
    if (pitInp) {
      inp = pitInp;
      if (r.isPlayer) tap('KeyR');
    } else if (r.isPlayer) {
      inp = S.autopilot ? S.autopilot.think(dt, S.runners, go) : playerInput(r);
      if (tap('KeyR')) {
        resetRunner(r);
        if (S.mode === 'attack') { r.lapValid = false; }
        continue;
      }
    } else {
      inp = r.driver.think(dt, S.runners, go && !r.retired);
      if (inp.reset) { resetRunner(r, 20); continue; }
      if (r.finished && S.phase !== 'done') inp.throttle = Math.min(inp.throttle, 0.5);
    }
    // THE PIT LIMITER: past the white line the power is cut above 80 km/h
    if (r.pit.limiter && car.forwardSpeed > PIT.limit - 0.2) inp.throttle = 0;
    r.drsOK = !r.inPit && !r.pit.driving && drsAllowed(r);
    // the robots open the wing when they may and the road is straight ahead
    if (!r.isPlayer) inp.drs = r.drsOK && inp.throttle > 0.95 && Math.abs(inp.steer || 0) < 0.12;
    else inp.drs = inp.drs && r.drsOK;
    r.step(dt, inp, S.clock);
    if (r.isPlayer && r.hitWall > 4) shake = Math.min(0.6, r.hitWall * 0.03);
    // A DOWNSHIFT TOO MANY throws the car forward and the back sideways.
    // The physics already does that (car.js), but without a jolt through
    // the camera you read it as the car misbehaving rather than as
    // something you did, which is the difference between a bug and a
    // mistake you will not make twice.
    if (r.isPlayer && r.car.overRevFlash > 0.15) shake = Math.max(shake, Math.min(0.28, r.car.overRevFlash * 0.22));

    // timing loops
    const m = Math.floor(r.progress / MARK_EVERY);
    while (r.marks.length <= m && r.marks.length < 100000) r.marks.push(S.clock);

    for (const e of r.events) {
      if (e.type === 'lap') {
        if (racing && r.lap > S.opts.laps && !r.finished) {
          r.finished = true;
          r.finishTime = S.clock + r.penalty;
          if (r.isPlayer) {
            const pos = order().indexOf(r) + 1;
            banner(pos === 1 ? 'CHEQUERED FLAG' : 'FINISHED P' + pos, full(r.finishTime), 3.5);
            S.phase = 'done';
            S.finishAt = S.clock;
          }
        } else if (r.isPlayer && S.mode === 'attack' && S.opts.league && S.league && S.league.phase === 'qualify') {
          // THE QUALIFYING LAP. One lap is all you get; an invalid one
          // counts as no time, which is what going off the road costs.
          // NOT S.phase = 'done'. That is the RACE's word for "the flag has
          // fallen", and the frame loop puts the results table up four
          // seconds after it - which in a one-car qualifying session scored
          // the championship for a race that had not been run yet: you
          // "won" it, took 25 points, and the real race then started with
          // no league attached to it at all.
          const t = e.valid ? e.time : null;
          S.phase = 'idle';
          leagueQualified(t);
        } else if (r.isPlayer && S.mode === 'attack') {
          // the last sector's colour, judged against the OLD best before
          // this lap can replace it - then all three stay up for a moment
          S.sectorFlags[2] = sectorColour(2, e.sectors[2]);
          S.flagHold = S.clock + 3;
          onAttackLap(e);
        }
        else if (r.isPlayer && racing && r.lap === S.opts.laps) banner('FINAL LAP', '', 1.8);
      }
      if (e.type === 'sector' && r.isPlayer && S.mode === 'attack') {
        if (e.index === 0) { S.sectorFlags = ['', '', '']; S.flagHold = 0; }
        S.sectorFlags[e.index] = sectorColour(e.index, e.time);
      }
      if (e.type === 'invalid' && r.isPlayer && S.mode === 'attack') banner('TRACK LIMITS', 'lap invalid', 1.6);
    }
    if (r.isPlayer && S.flagHold && S.clock > S.flagHold) { S.sectorFlags = ['', '', '']; S.flagHold = 0; }

    // a flat tyre run far enough comes off the rim
    const shred = r.damage.step(dt);
    if (shred >= 0) {
      const [wx, wz] = wheelWorld(r, shred);
      debris.shards(wx, r.y + 0.3, wz, car.vx, car.vz, 8, r.y);
      if (r.isPlayer) banner('TYRE DELAMINATED', 'running on the rim', 1.8);
    }
    layMarks(r, dt);
  }
  collide(S.runners);

  // ---- DAMAGE: every contact this frame, barrier or car ---------------------
  for (const r of S.runners) {
    if (r.out) continue;
    for (const imp of r.impacts) crash(r, imp);
    r.impacts.length = 0;
    const msgs = r.damage.messages;
    if (msgs.length) { if (r.isPlayer) banner(msgs[msgs.length - 1], '', 2.2); msgs.length = 0; }
    // a robot with a wheel off is out of the race, and off the track a few seconds later
    if (!r.isPlayer && racing && r.damage.terminal && !r.retired) { r.retired = true; r.retireAt = S.clock + 4; }
    if (r.retired && !r.out && S.clock > r.retireAt) { r.out = true; r.art.group.visible = false; }
  }

  // ghost recording, twenty frames a second of the current lap
  const p = S.player;
  if (S.mode === 'attack' && p.started) {
    const t = S.clock - p.lapStart;
    if (!S.cur.length || t - S.lastGhostT >= 0.05) {
      S.cur.push(t, p.car.x, p.car.z, p.car.yaw, p.y, p.dist);
      S.lastGhostT = t;
    }
  }

  if (go) S.clock += dt;
  if (S.phase === 'done' && !S.resultsShown && S.clock - S.finishAt > 4) showResults();
}

// ---------------------------------------------------------------------
// DAMAGE, MARKS AND PITS: the world's side of them
// ---------------------------------------------------------------------
/** where wheel k of a runner is in the world */
function wheelWorld(r, k) {
  const car = r.car, [xi, yi] = car.wheelPos(k);
  const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
  return [car.x + xi * s + yi * c, car.z + xi * c - yi * s];
}

const nearCamera = (x, z, d) => Math.abs(x - camera.position.x) < d && Math.abs(z - camera.position.z) < d;

/** one contact: sparks, scratches, dents, and whatever comes off */
function crash(r, imp) {
  const car = r.car, art = r.art;
  const res = r.damage.impact(imp);
  if (S.log && imp.vn > 3) S.log.push({ t: Math.round(S.clock), who: r.name, lap: r.lap, with: imp.other ? imp.other.name : 'wall', vn: +imp.vn.toFixed(1), fwd: +imp.fwd.toFixed(1), left: +imp.left.toFixed(1), kph: Math.round(r.car.kph), wear: +Math.min(...r.car.wheels.map((w) => w.wear)).toFixed(2), grip: +r.car.gripNow.toFixed(2), dist: Math.round(r.dist), tyres: r.damage.tyre.join('') });
  const seen = nearCamera(imp.x, imp.z, 300);
  if (seen && res.sparks) sparks.emit(imp.x, imp.y, imp.z, car.vx, car.vz, res.sparks * 0.5, 2.5 + imp.vn * 0.4, imp.nx, imp.nz);
  if (res.scratch && seen) scratch(art, imp.fwd, imp.left, Math.min(1, (imp.vn + imp.vt * 0.08) / 8));
  if (res.dent) dent(art, imp.fwd, imp.left, res.dent);
  if (res.shards && seen) debris.shards(imp.x, imp.y, imp.z, car.vx, car.vz, res.shards, r.y, imp.nx, imp.nz);
  for (const name of res.off) {
    const piece = art.pieces[name];
    if (!piece || !piece.visible) continue;
    debris.throw(piece, car.vx * 0.85, car.vz * 0.85, 3 + imp.vn * 0.35, r.y, name === 'fwing' || name === 'rwing' ? 0.18 : 0.08);
    piece.visible = false;
  }
  if (res.wheelOff >= 0) {
    const w = art.wheels[res.wheelOff];
    debris.throw(w, car.vx, car.vz, 4 + imp.vn * 0.4, r.y, TUNE.wheelRadius);
    w.visible = false;
    if (seen) sparks.emit(imp.x, r.y + 0.1, imp.z, car.vx, car.vz, 60, 6, imp.nx, imp.nz);
  }
  if (res.flat >= 0 && seen) {
    const [wx, wz] = wheelWorld(r, res.flat);
    debris.shards(wx, r.y + 0.3, wz, car.vx, car.vz, 4, r.y);
  }
  if (r.isPlayer && imp.vn > 2.5) shake = Math.min(0.9, Math.max(shake, imp.vn * 0.05));
}

/**
 * Lay tyre marks for every wheel of a car: rubber where a tyre is sliding
 * or locked, ruts on grass and gravel, and a bright score where a bare rim
 * or a missing wheel is on the road. Every car, wherever the camera is -
 * they are kept for the whole race.
 */
function layMarks(r, dt) {
  const car = r.car;
  for (let k = 0; k < 4; k++) {
    const key = r.id + ':' + k;
    if (car.speed < 1.5) { marks.lift(key); continue; }
    const w = car.wheels[k], t = r.damage.tyre[k], surf = r.wheelSurf[k];
    let rgb = null, alpha = 0, width = k < 2 ? 0.16 : 0.2;
    if (t === 'rim' || t === 'off') {
      rgb = MARK.rim; alpha = 0.6; width = 0.035;
      if (car.speed > 5 && nearCamera(car.x, car.z, 250) && Math.random() < 0.7) {
        const [wx, wz] = wheelWorld(r, k);
        sparks.emit(wx, r.y + 0.05, wz, car.vx, car.vz, 2 + car.speed * 0.12, 2.5);
      }
    } else if (surf === 'grass' || surf === 'gravel') {
      rgb = MARK[surf]; alpha = 0.55;
    } else if (weather.water < 0.3) {
      const slide = w.scrub;
      if (slide > 1.03 || (w.locked && car.speed > 4)) {
        rgb = MARK.rubber;
        alpha = Math.min(0.75, (slide - 1) * 1.6 + 0.2) * (1 - weather.water * 2);
        if (w.locked) alpha = Math.max(alpha, 0.55);
      }
    }
    if (!rgb) { marks.lift(key); continue; }
    const [wx, wz] = wheelWorld(r, k);
    marks.mark(key, wx, r.y + (surf === 'grass' || surf === 'gravel' ? 0.05 : 0.016), wz, width, rgb, alpha);
  }
  // THE PLANK. Flat out, the floor is pressed onto its bump stops and the
  // titanium skids under it strike the road.
  if (car.speed > 62 && car.heave < -TUNE.travel * 0.98 && Math.random() < 0.35 && nearCamera(car.x, car.z, 150)) {
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw), f = -0.4 - Math.random() * 1.4;
    sparks.emit(car.x + s * f, r.y + 0.03, car.z + c * f, car.vx, car.vz, 3, 1.5);
  }
}

/** a pit stop moved on */
function onPit(r, ev) {
  if (ev === 'released') {
    // the crew have put new parts on: show them on the car
    for (const p of Object.values(r.art.pieces)) p.visible = true;
    for (const w of r.art.wheels) w.visible = true;
  }
  if (ev === 'speeding' && S.mode === 'race') r.penalty += 5;
  if (!r.isPlayer) return;
  if (ev === 'entered') banner('PIT LANE', 'stop in your box, the yellow one', 1.6);
  if (ev === 'speeding') banner('PIT LANE SPEEDING', S.mode === 'race' ? '5 second penalty' : 'over 80 km/h', 2.2);
  if (ev === 'stopped') { orbitFrom = S.player.car.yaw + Math.PI; }
  if (ev === 'released') { camReady = false; banner(r.pit.serviceTime.toFixed(1) + 's', 'go go go', 1.4); }
}

// ---------------------------------------------------------------------
// THE CREWS: out in the box when a car is coming, working through the
// stop, then stepping back and gone a couple of seconds after it leaves.
// Only built for a car near enough to be seen.
// ---------------------------------------------------------------------
function crews(dt, now) {
  for (const r of S.runners) {
    const ph = r.pit.phase;
    const pose = r.pit.boxPose();
    const near = nearCamera(pose.x, pose.z, 450);
    if (!r.crew && near && (ph === 'in' || ph === 'service' || (ph === 'called' && r.pit.rel() > -900 && r.pit.rel() < r.pit.boxAt))) {
      r.crew = new Crew(scene, r.livery);
      r.crew.armed = false; r.crew.since = 0;
    }
    if (!r.crew) continue;
    if (ph === 'service') {
      if (!r.crew.armed) { r.crew.arm(r.art); r.crew.armed = true; }
      r.crew.service(r.pit, r.art);
    } else if (ph === 'called' || ph === 'in') {
      r.crew.ready(pose, now / 1000);
    } else {
      r.crew.since += dt;
      r.crew.after(dt, r.crew.since);
      if (r.crew.since > 2.5 || !near) { r.crew.dispose(); r.crew = null; }
    }
  }
}

function syncArt(r, dt) {
  const car = r.car, art = r.art;
  const far = Math.hypot(car.x - camera.position.x, car.z - camera.position.z);
  art.group.visible = far < 900 && !r.out;
  if (!art.group.visible) return;
  const pt = S.track.points[r.i];
  art.group.position.set(car.x, r.y + TUNE.wheelRadius + car.heave + r.pit.lift, car.z);
  art.group.rotation.order = 'YXZ';
  art.group.rotation.y = car.yaw;
  art.group.rotation.x = -car.pitch - Math.atan(r.grade) * Math.cos(car.yaw - pt.h);
  art.group.rotation.z = -car.roll;
  // a corner with no tyre on it sits on the road
  const tyre = r.damage.tyre;
  let drop = 0;
  for (let k = 0; k < 4; k++) {
    const t = tyre[k];
    if (t === 'ok') continue;
    const d = t === 'flat' ? 0.03 : t === 'rim' ? 0.06 : 0.12;
    art.group.rotation.z += (k % 2 ? -1 : 1) * d * 0.5;
    art.group.rotation.x += (k < 2 ? 1 : -1) * d * 0.25;
    drop = Math.max(drop, d);
  }
  art.group.position.y -= drop * 0.6;
  for (let k = 0; k < 4; k++) {
    const w = car.wheels[k];
    art.hubs[k].position.y = w.travel - (tyre[k] === 'flat' ? 0.09 : tyre[k] === 'rim' ? 0.13 : 0);
    // a shredded tyre is just the rim
    art.wheels[k].children[0].visible = tyre[k] !== 'rim';
    art.steers[k].rotation.y = k < 2 ? car.steer : 0;
    art.wheels[k].rotation.x = w.angle;
  }
  if (far < 120) art.updateArms();
  // NEGATIVE. Model +X is the car's LEFT, so a positive turn about +Z
  // lifts the left grip - which is the wheel turning RIGHT. Liam: "the
  // steering wheel turns the wrong way". tools/car.mjs measures it.
  art.steerWheel.rotation.z = -car.steer * 2.6;
  art.driver.rotation.z = THREE.MathUtils.clamp(-car.latG * 0.05, -0.2, 0.2);
  art.driver.position.z = 0.50 - THREE.MathUtils.clamp(car.lonG * 0.02, -0.05, 0.05);
  art.drsFlap.rotation.x = car.drs ? -0.55 : 0.0;
  art.rainLight.material.emissive.setHex(car.speed > 2 && car.lonG < -1.5 ? 0xff1010 : 0x220000);

  if (far < 160) {
    const c = Math.cos(car.yaw), sn = Math.sin(car.yaw);
    for (let k = 0; k < 4; k++) {
      const s = car.wheelSlip(k);
      if (s > 1.02 || r.offTrack) {
        const [xi, yi] = car.wheelPos(k);
        const wx = car.x + xi * sn + yi * c, wz = car.z + xi * c - yi * sn;
        if (s > 1.02 && weather.water < 0.3) smoke.puff(wx, r.y + 0.12, wz, (s - 1) * 1.6);
      }
    }
    // SPRAY. In the wet the car behind drives into a cloud.
    if (weather.water > 0.12 && car.speed > 12) {
      const amt = Math.min(1, (weather.water - 0.08) * 1.6) * Math.min(1, car.speed / 70);
      for (const k of [2, 3]) {
        if (Math.random() > amt) continue;
        const [xi, yi] = car.wheelPos(k);
        const wx = car.x + (xi - 0.6) * sn + yi * c, wz = car.z + (xi - 0.6) * c - yi * sn;
        spray.puff(wx, r.y + 0.25, wz, 0.25 + amt * 0.4, 2.2 + car.speed * 0.045, car.vx * 0.35, car.vz * 0.35);
      }
    }
  }
}

function hud(now, dt) {
  const p = S.player, car = p.car;
  el('speed').innerHTML = Math.round(car.kph) + '<span>KM/H</span>';
  el('gear').textContent = car.gear === 0 ? 'N' : car.gear < 0 ? 'R' : car.gear;
  const rev = Math.min(1, car.rpm / TUNE.redline);
  el('revfill').style.width = (rev * 100).toFixed(1) + '%';
  const lit = Math.floor(Math.max(0, (rev - 0.55) / 0.45) * 10);
  for (let i = 0; i < 10; i++) {
    lightEls[i].style.background = car.onLimiter ? (Math.floor(now / 60) % 2 ? '#b02fd0' : '#1b2029') : (i < lit ? LIGHT_COLOUR[i] : '#1b2029');
  }

  // corner name
  let name = '';
  for (const c of S.track.corners) if (p.dist >= c.at - 110 && p.dist <= c.at + 40) { name = c.name; break; }
  el('corner').textContent = name;

  const lapT = p.started ? S.clock - p.lapStart : 0;
  el('laptime').textContent = S.mode === 'race' && S.phase === 'grid' ? '0.000' : full(S.mode === 'race' ? S.clock : lapT);
  el('last').textContent = full(p.lastLap);
  if (S.mode === 'attack') {
    el('best').textContent = S.best ? full(S.best.time) : '--:--.---';
    const d = p.started && p.lapValid ? deltaAt(p.dist, lapT) : null;
    el('delta').textContent = d === null ? (p.started && !p.lapValid ? 'INVALID' : '') : clock(d, true);
    el('delta').className = d === null ? '' : d > 0 ? 'up' : 'down';
    el('lapcount').textContent = p.started ? 'LAP ' + p.lap : 'OUT LAP';
  } else if (S.mode === 'race') {
    el('best').textContent = full(p.bestLap);
    const list = order(), pos = list.indexOf(p) + 1;
    el('pos').innerHTML = 'P' + pos + '<small>/' + list.length + '</small>';
    const shown = Math.max(1, Math.min(S.opts.laps, p.lap));
    el('lapcount').textContent = p.finished ? 'FINISHED' : 'LAP ' + shown + ' / ' + S.opts.laps;
    const ahead = list[pos - 2], behind = list[pos];
    const ga = ahead ? gap(ahead, p) : null, gb = behind ? gap(p, behind) : null;
    el('delta').textContent = (ga !== null ? '▲ ' + Math.max(0, ga).toFixed(1) : '') + (gb !== null ? '   ▼ ' + Math.max(0, gb).toFixed(1) : '');
    el('delta').className = '';
    towerT -= dt;
    if (towerT <= 0) { drawTower(list); towerT = 0.25; }
  } else {
    el('best').textContent = full(p.bestLap);
    el('delta').textContent = '';
    el('lapcount').textContent = p.started ? 'LAP ' + p.lap : '';
  }
  const sec = el('sectors').children;
  for (let i = 0; i < 3; i++) {
    const f = S.sectorFlags[i];
    sec[i].className = f || '';
    if (!f && p.started && i === p.sector) sec[i].style.background = '#4a5568'; else sec[i].style.background = '';
  }
  carHud(p, now);
  wheelHud(p);
  el('drs').classList.toggle('on', car.drs);
  el('drsAvail').classList.toggle('on', !car.drs && S.mode === 'race' && p.drsOK);
  el('off').classList.toggle('on', p.offTrack);
  el('invalid').classList.toggle('on', S.mode === 'attack' && p.started && !p.lapValid);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el('banner').classList.remove('show'); }
}

// the car panel: compound, four tyres (temperature as colour, wear as a
// number), what is broken, and the weather; and the pit wall's messages
const tyreEls = [...el('tyres').children];
// screen order is FL FR / RL RR; car.js order is FR FL RR RL
const SCREEN_WHEEL = [1, 0, 3, 2];
let carHudT = 0;
function tempColour(t, opt, win) {
  const x = (t - opt) / win;
  if (x < -0.6) return '#2f7de0';            // cold
  if (x < -0.25) return '#35b0d0';
  if (x <= 0.6) return '#35d07f';            // working
  if (x <= 1.0) return '#e6c03a';
  return '#e8392e';                          // cooking
}
function carHud(p, now) {
  carHudT -= 1;
  if (carHudT > 0) return;
  carHudT = 6;
  const car = p.car, TY = TYRES[car.compound];
  const cmp = el('compound');
  cmp.textContent = TY.letter; cmp.style.borderColor = TY.color; cmp.style.color = TY.color;
  el('wx').innerHTML = '<b>' + weather.label + '</b><br>AIR ' + Math.round(weather.air) + '° · TRACK ' + Math.round(weather.track) + '°'
    + (weather.water > 0.03 ? '<br>WATER ' + Math.round(weather.water * 100) + '%' : '');
  tyreEls.forEach((e, i) => {
    const k = SCREEN_WHEEL[i], w = car.wheels[k], t = p.damage.tyre[k];
    e.className = 't' + (t === 'flat' || t === 'rim' ? ' flat' : t === 'off' ? ' gone' : '');
    e.style.borderColor = t === 'ok' ? tempColour(w.temp, TY.opt, TY.win) : '';
    e.innerHTML = t === 'off' ? '<b>--</b>' : t === 'rim' ? '<b>RIM</b>' : t === 'flat' ? '<b>FLAT</b>'
      : '<b>' + Math.round(w.temp) + '°</b><span>' + Math.round(w.wear * 100) + '%</span>';
  });
  el('dmg').textContent = p.damage.summary.filter((x) => !x.includes('flat') && !x.includes('rim')).join(' · ');

  // the pit panel: shown while a stop is on, and for a moment after choosing tyres
  const box = el('pitbox'), ps = p.pit;
  const choice = ps.active ? ps.compound : S.pitChoice;
  const showChoice = S.pitChoiceAt && now - S.pitChoiceAt < 2500;
  if (ps.active || showChoice) {
    const P = S.track.pit, d = ps.rel();
    const toEntry = P.from - d, toBox = Math.round(ps.boxAt - d);
    const head = ps.phase === 'called' ? (toEntry > 0 && toEntry < 800 ? 'PIT ENTRY ' + Math.round(toEntry) + ' M' : 'BOX THIS LAP')
      : ps.phase === 'service' ? 'SERVICE ' + Math.max(0, ps.total - ps.t).toFixed(1)
      : ps.phase === 'in' ? (ps.limiter ? 'LIMITER 80 · ' : '') + (toBox > 0 ? 'BOX ' + toBox + ' M' : 'STOP')
      : ps.limiter ? 'PIT LIMITER 80' : ps.active ? 'PIT EXIT' : 'NEXT STOP';
    box.innerHTML = '<span class="k">' + head + '</span>' + ['soft', 'medium', 'hard', 'inter', 'wet'].map((c, i) =>
      '<span class="c' + (c === choice ? ' sel' : '') + '" style="' + (c === choice ? '' : 'color:' + TYRES[c].color) + '"><i>' + (i + 1) + '</i>' + TYRES[c].name + '</span>').join('');
    box.classList.add('on');
  } else box.classList.remove('on');
}

// THE SCREEN ON THE STEERING WHEEL, which is a real dash: the gear, the
// speed and the shift lights, plus whatever matters in this mode - your
// delta in a time attack, the gap in a race, the box in a pit stop. One
// canvas serves every car on the grid, because the only camera that can
// read one is in your own cockpit.
function wheelHud(p) {
  const car = p.car;
  let line1 = '', line2 = '', colour = '#9fb0c4';
  if (p.pit.active) { line1 = p.pit.phase === 'service' ? 'BOX ' + Math.max(0, p.pit.total - p.pit.t).toFixed(1) : 'PIT LANE'; line2 = TYRES[p.pit.compound || car.compound].name; colour = '#f0c040'; }
  else if (S.mode === 'attack') {
    const d = p.started && p.lapValid ? deltaAt(p.dist, S.clock - p.lapStart) : null;
    line1 = d === null ? (p.started ? 'LAP ' + p.lap : 'OUT LAP') : clock(d, true);
    line2 = S.best ? full(S.best.time) : '--';
    colour = d === null ? '#9fb0c4' : d > 0 ? '#e8392e' : '#35d07f';
  } else if (S.mode === 'race') {
    const list = order(), pos = list.indexOf(p) + 1;
    line1 = 'P' + pos + '/' + list.length;
    line2 = 'L' + Math.max(1, Math.min(S.opts.laps, p.lap)) + '/' + S.opts.laps;
  } else {
    line1 = full(p.lastLap);
    line2 = 'LAP ' + Math.max(1, p.lap);
  }
  wheelScreen().draw({
    gear: car.gear === 0 ? 'N' : car.gear < 0 ? 'R' : String(car.gear),
    kph: Math.round(car.kph),
    rev: Math.min(1, car.rpm / TUNE.redline),
    limiter: car.onLimiter,
    line1, line2, colour,
  });
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
requestAnimationFrame(frame);

// ---------------------------------------------------------------------
// MENUS
// ---------------------------------------------------------------------
const menuState = { mode: null, key: null, race: store.get('raceOpts', { laps: 3, cars: 24, skill: 'medium', grid: 'back' }),
  season: { length: 10, skill: 'medium', laps: 5, weather: 'changing' } };

// =====================================================================
// THE LEAGUE. Liam: "make a league mode where you go match by match".
//
// A season is a calendar, a table and a round number (league.js). This is
// the part of it that is a game: turn up, qualify over one flying lap,
// race from wherever that put you, take the points, and the standings are
// waiting when you come back - saved, so a season survives closing the
// tab.
//
// QUALIFYING IS DRIVEN, NOT SIMULATED, for you. Everybody else's lap is a
// number out of their pace, because watching fifteen robots do their own
// flying laps is not a thing anybody wants to sit through. Your lap is
// the real thing, on the real circuit, through the same time attack the
// rest of the game uses.
// =====================================================================
let season = League.load();

/**
 * THE LAP A DRIVER OF THIS SKILL TAKES ROUND HERE.
 *
 * Time is distance over speed, summed along the racing line's own speed
 * plan - the same plan the robots drive to, so the number means the same
 * thing they do.
 *
 * IT COMES OUT A QUARTER OPTIMISTIC, and that is not a rounding error: the
 * plan is the speed the car MAY carry at each point, and a real lap also
 * spends time getting up to those speeds out of every corner. Measured at
 * Monza: the sum says 79.0 s and the same robot drives 97.7 s. So it is
 * multiplied by 1.235, which is that measurement and nothing cleverer.
 * Before it, every rival out-qualified the player by twenty seconds and a
 * season was sixteen races from the back of the grid.
 */
function lapTimeFor(key, skill) {
  const tr = S.track && S.key === key ? S.track : loadCircuit(key);
  const plan = planFor(Math.min(0.998, Math.max(0.5, skill)));
  let t = 0;
  for (let i = 0; i < plan.speeds.length; i++) t += tr.spacing / Math.max(8, plan.speeds[i]);
  return t * 1.235;
}

function showScreen(id) {
  for (const s of ['menu', 'pause', 'results']) el(s).classList.toggle('on', s === id);
  if (id !== 'pause') paused = false;
}
function menuStep(step) {
  for (const s of ['Mode', 'Track', 'Race', 'Board', 'Free', 'League']) el('menu' + s).hidden = s.toLowerCase() !== step;
}

const MODES = [
  ['free', 'FREE DRIVE', 'The circuit to yourself. Learn it, no clock that matters.'],
  ['attack', 'TIME ATTACK', 'Flying laps against your best, which races you as a ghost. Track limits count.'],
  ['race', 'RACE', 'Five red lights and up to fifteen other drivers on the same car.'],
  ['league', 'LEAGUE', 'A season, race by race: qualify, score points, and carry the table to the next round.'],
];
for (const [id, t, d] of MODES) {
  const b = document.createElement('button');
  b.className = 'card';
  b.innerHTML = '<div class="t">' + t + '</div><div class="d">' + d + '</div>';
  b.onclick = () => {
    menuState.mode = id;
    if (id === 'league') { buildLeague(); menuStep('league'); return; }
    buildTrackCards();
    menuStep('track');
  };
  el('modes').appendChild(b);
}

function thumb(canvas, key) {
  const { points } = centreline(CIRCUITS[key], 8);
  const W = canvas.width = 380, H = canvas.height = 220, g = canvas.getContext('2d');
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const s = Math.min((W - 30) / (x1 - x0), (H - 30) / (z1 - z0));
  g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = '#c9d2de';
  g.beginPath();
  points.forEach((p, i) => { const x = W / 2 + (p.x - (x0 + x1) / 2) * s, z = H / 2 + (p.z - (z0 + z1) / 2) * s; i ? g.lineTo(x, z) : g.moveTo(x, z); });
  g.closePath(); g.stroke();
  const p = points[0];
  g.fillStyle = '#e8392e'; g.beginPath(); g.arc(W / 2 + (p.x - (x0 + x1) / 2) * s, H / 2 + (p.z - (z0 + z1) / 2) * s, 7, 0, 7); g.fill();
}

function buildTrackCards() {
  const box = el('tracks');
  box.innerHTML = '';
  el('trackTitle').textContent = MODES.find((m) => m[0] === menuState.mode)[1] + '  ·  CHOOSE A CIRCUIT';
  for (const key of Object.keys(CIRCUITS)) {
    const c = CIRCUITS[key];
    const b = document.createElement('button');
    b.className = 'card';
    const best = store.get('best.' + key, null);
    b.innerHTML = '<canvas></canvas><div class="t">' + c.name + '</div><div class="d">' + c.country + ' · ' + (c.real / 1000).toFixed(3) + ' km</div>'
      + (menuState.mode === 'attack' ? '<div class="best">' + (best ? 'PB ' + full(best.time) : 'no time set') + '</div>' : '');
    thumb(b.querySelector('canvas'), key);
    b.onclick = () => {
      menuState.key = key;
      if (menuState.mode === 'free') { buildRaceOpts(); menuStep('free'); }
      else if (menuState.mode === 'race') { buildRaceOpts(); menuStep('race'); }
      else { buildBoard(); buildRaceOpts(); menuStep('board'); }
    };
    box.appendChild(b);
  }
}

function buildRaceOpts() {
  el('raceTitle').textContent = 'RACE  ·  ' + CIRCUITS[menuState.key].name.toUpperCase();
  el('freeTitle').textContent = 'FREE DRIVE  ·  ' + CIRCUITS[menuState.key].name.toUpperCase();
  const choices = { laps: [2, 3, 5, 10], cars: [10, 16, 20, 24], skill: ['easy', 'medium', 'hard'], grid: ['front', 'middle', 'back'],
    weather: Object.keys(FORECASTS), tyre: ['auto', 'soft', 'medium', 'hard', 'inter', 'wet'] };
  const words = { ...Object.fromEntries(Object.entries(FORECASTS).map(([k, v]) => [k, v.name])), ...Object.fromEntries(Object.entries(TYRES).map(([k, v]) => [k, v.name])) };
  if (!menuState.race.weather) menuState.race.weather = 'dry';
  if (!menuState.race.tyre) menuState.race.tyre = 'auto';
  for (const seg of document.querySelectorAll('[data-opt]')) {
    const k = seg.dataset.opt;
    seg.innerHTML = '';
    for (const v of choices[k]) {
      const b = document.createElement('button');
      b.textContent = words[v] || String(v).toUpperCase();
      b.classList.toggle('sel', menuState.race[k] === v);
      b.onclick = () => { menuState.race[k] = v; store.set('raceOpts', menuState.race); buildRaceOpts(); };
      seg.appendChild(b);
    }
  }
}

/** the season screen: where you are, what is next, and the two tables */
function buildLeague() {
  const box = el('leagueBody');
  if (!season) {
    el('leagueTitle').textContent = 'LEAGUE  ·  A NEW SEASON';
    const rows = [
      ['ROUNDS', 'length', [5, 10, 16, 22]],
      ['LAPS A RACE', 'laps', [3, 5, 10]],
      ['DIFFICULTY', 'skill', ['easy', 'medium', 'hard']],
      ['WEATHER', 'weather', ['dry', 'changing', 'light', 'heavy']],
    ];
    box.innerHTML = '<div class="opts">' + rows.map(([label, k, vals]) =>
      '<label>' + label + '</label><div class="seg" data-season="' + k + '">' + vals.map((v) =>
        '<button data-v="' + v + '"' + (menuState.season[k] === v ? ' class="sel"' : '') + '>' + String(v).toUpperCase() + '</button>').join('') + '</div>').join('') + '</div>'
      + '<p class="note">Eight teams, sixteen cars, the same faces every round. Points are 25-18-15-12-10-8-6-4-2-1, and one for the fastest lap inside the top ten.</p>';
    for (const seg of box.querySelectorAll('[data-season]')) {
      for (const b of seg.querySelectorAll('button')) {
        b.onclick = () => {
          const k = seg.dataset.season, v = b.dataset.v;
          menuState.season[k] = k === 'length' || k === 'laps' ? Number(v) : v;
          buildLeague();
        };
      }
    }
    el('leagueGo').textContent = 'START THE SEASON';
    el('leagueGo').onclick = () => {
      season = League.makeSeason(menuState.season);
      League.save(season);
      buildLeague();
    };
    el('leagueDrop').hidden = true;
    return;
  }

  const roundsLeft = !League.done(season);
  const key = League.nextKey(season);
  const table = League.standings(season).slice(0, 10);
  const teams = League.teamStandings(season);
  el('leagueTitle').textContent = roundsLeft
    ? 'LEAGUE  ·  ROUND ' + (season.round + 1) + ' OF ' + season.calendar.length + '  ·  ' + CIRCUITS[key].name.toUpperCase()
    : 'LEAGUE  ·  SEASON OVER';
  const cal = season.calendar.map((k, i) => {
    const res = season.results[i];
    const mark = res ? 'P' + res.you : i === season.round ? 'NEXT' : '';
    return '<span class="round' + (i === season.round && roundsLeft ? ' now' : '') + (res ? ' done' : '') + '">'
      + CIRCUITS[k].name + (mark ? '<b>' + mark + '</b>' : '') + '</span>';
  }).join('');
  const driverRows = table.map((r, i) =>
    '<tr class="' + (r.player ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><span style="display:inline-block;width:4px;height:12px;border-radius:2px;margin-right:8px;background:'
    + hex(r.entry.livery.body) + '"></span>' + r.name + '<small class="tm">' + r.team.name + '</small></td><td class="m">' + r.points + '</td></tr>').join('');
  const teamRows = teams.map((t, i) =>
    '<tr><td>' + (i + 1) + '</td><td><span style="display:inline-block;width:4px;height:12px;border-radius:2px;margin-right:8px;background:'
    + hex(t.team.livery.body) + '"></span>' + t.team.name + '</td><td class="m">' + t.points + '</td></tr>').join('');
  box.innerHTML = '<div class="calendar">' + cal + '</div>'
    + '<div class="tables"><table class="res"><tr><th>POS</th><th>DRIVER</th><th>PTS</th></tr>' + driverRows + '</table>'
    + '<table class="res"><tr><th>POS</th><th>TEAM</th><th>PTS</th></tr>' + teamRows + '</table></div>';
  el('leagueGo').textContent = roundsLeft ? 'QUALIFY AT ' + CIRCUITS[key].name.toUpperCase() : 'NEW SEASON';
  el('leagueGo').onclick = () => {
    if (!roundsLeft) { League.clear(); season = null; buildLeague(); return; }
    startQualifying();
  };
  el('leagueDrop').hidden = false;
  el('leagueDrop').onclick = () => {
    if (!confirm('Abandon this season? The table goes with it.')) return;
    League.clear(); season = null; buildLeague();
  };
}

/** one flying lap, yours, to decide where you start */
function startQualifying() {
  const key = League.nextKey(season);
  S.league = { phase: 'qualify', key };
  launch('attack', key, { weather: season.weather, tyre: 'auto', league: true });
}

/** your lap is in: work out the grid and go racing */
function leagueQualified(time) {
  const key = S.league.key;
  const rows = League.qualifying(season, time, (skill) => lapTimeFor(key, skill));
  const slot = rows.findIndex((r) => r.you);
  S.league = { phase: 'race', key, grid: rows };
  banner('QUALIFIED P' + (slot + 1), time ? full(time) : 'no time set', 2.6);
  setTimeout(() => {
    launch('race', key, { laps: season.laps, cars: 16, skill: season.skill, grid: slot,
      weather: season.weather, tyre: 'auto', league: true,
      entries: rows.map((r) => r.entry) });
  }, 2600);
}

/** the race is over: points, table, and on to the next one */
function leagueFinished(list) {
  const order = list.map((r) => ({ id: League.idOf(r.entry), r }));
  let fastest = null, best = 0;
  for (const r of list) if (r.bestLap && (!best || r.bestLap < best)) { best = r.bestLap; fastest = League.idOf(r.entry); }
  League.award(season, order, fastest);
  const you = list.findIndex((r) => r.isPlayer) + 1;
  season.results.push({ key: S.league.key, you, fastest });
  season.round++;
  League.save(season);
  S.league = null;
  return { you, fastest, position: League.playerPosition(season), points: season.points[League.idOf(PLAYER)] || 0 };
}

function buildBoard() {
  const key = menuState.key;
  el('boardTitle').textContent = 'TIME ATTACK  ·  ' + CIRCUITS[key].name.toUpperCase();
  const board = store.get('board.' + key, []);
  el('board').innerHTML = board.length
    ? board.map((b, i) => '<div class="r"><span>' + (i + 1) + '.  ' + b.date + '</span><b' + (i === 0 ? ' class="best"' : '') + '>' + full(b.time) + '</b></div>').join('')
    : '<div class="r"><span>No laps yet</span><b>--:--.---</b></div>';
}

function launch(mode, key, opts) {
  el('loading').classList.add('on');
  // let the loading screen paint before the circuit build blocks the thread
  setTimeout(() => {
    start(mode, key, opts);
    el('loading').classList.remove('on');
  }, 30);
}

el('goRace').onclick = () => launch('race', menuState.key, { ...menuState.race });
el('goAttack').onclick = () => launch('attack', menuState.key, { weather: menuState.race.weather, tyre: menuState.race.tyre });
el('goFree').onclick = () => launch('free', menuState.key, { weather: menuState.race.weather, tyre: menuState.race.tyre });
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => menuStep(b.dataset.back);
for (const b of document.querySelectorAll('[data-act]')) {
  b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'resume') { paused = false; showScreen(null); }
    if (act === 'restart') launch(S.mode, S.key, S.opts);
    if (act === 'league') {
      clearCars();
      el('hud').classList.remove('on');
      el('startlights').classList.remove('on');
      S.phase = 'idle';
      speedLines.clear();
      menuState.mode = 'league';
      buildLeague();
      showScreen('menu');
      menuStep('league');
    }
    if (act === 'menu') {
      clearCars();
      el('hud').classList.remove('on');
      el('startlights').classList.remove('on');
      speedLines.clear();
      S.phase = 'idle';
      if (menuState.mode === 'attack' && menuState.key) buildBoard();
      if (menuState.mode) buildTrackCards();
      showScreen('menu');
      menuStep('mode');
    }
  };
}
menuStep('mode');

// ---------------------------------------------------------------------
// the hook the test tools drive it through - the SAME objects the game
// uses, so anything they prove is true of the game and not of a copy
// ---------------------------------------------------------------------
window.__apex = {
  TUNE,
  get car() { return S.player ? S.player.car : null; },
  get track() { return S.track; },
  get session() { return S; },
  start: (mode, key, opts) => start(mode, key, opts),
  /** load a circuit into free drive, without the menu */
  load: (k) => { start('free', k); },
  state: () => {
    const p = S.player, car = p.car;
    return {
      kph: Math.round(car.kph), gear: car.gear, rpm: Math.round(car.rpm),
      slip: +car.slipAngle.toFixed(1), x: +car.x.toFixed(2), z: +car.z.toFixed(2), y: +p.y.toFixed(2),
      latG: +car.latG.toFixed(2), lonG: +car.lonG.toFixed(2),
      heave: +car.heave.toFixed(4), pitch: +car.pitch.toFixed(4), roll: +car.roll.toFixed(4),
      downforce: Math.round(car.downforce), drs: car.drs, stopped: car.stopped,
      off: +Math.abs(p.lat).toFixed(1), dist: Math.round(p.dist), surface: p.surface,
      wheels: car.wheels.map((w) => ({ load: Math.round(w.load), travel: +w.travel.toFixed(4), spin: +w.spin.toFixed(1), scrub: +w.scrub.toFixed(2) })),
      lap: { count: p.lap, last: p.lastLap, best: p.bestLap, valid: p.lapValid },
      tyres: { compound: car.compound, temp: car.wheels.map((w) => Math.round(w.temp)), wear: car.wheels.map((w) => +w.wear.toFixed(3)), grip: car.wheels.map((w) => +w.tyreGrip.toFixed(3)) },
      damage: p.damage.summary, pit: p.pit.phase,
      circuit: S.key, trackLength: S.track ? Math.round(S.track.length) : 0, mode: S.mode, phase: S.phase,
    };
  },
  /** drive the player through the SAME world step the game uses */
  drive: (ms, i) => {
    const steps = Math.round(ms / 16.67), p = S.player;
    for (let k = 0; k < steps; k++) {
      wake();                                  // the same tow the game gives you
      // a shift is a TAP: only the first step of a call gets it
      p.step(1 / 60, { throttle: 0, brake: false, steerLeft: false, steerRight: false, clutch: false, drs: false, ...i,
        ...(k > 0 ? { shiftUp: false, shiftDown: false } : {}) }, S.clock);
      S.clock += 1 / 60;
    }
    return window.__apex.state();
  },
  setGear: (g) => { S.player.car.gear = g; },
  /** TEST ONLY: a contact on the player's car, as world.js would report it */
  hit: (fwd, left, vn, vt = 0) => {
    const p = S.player, c = p.car, s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    crash(p, { fwd, left, vn, vt, other: null, x: c.x + s * fwd + co * left, y: p.y + 0.35, z: c.z + co * fwd - s * left, nx: -co * Math.sign(left || 1), nz: s * Math.sign(left || 1) });
    p.damage.messages.length = 0;
    return { parts: { ...p.damage.parts }, tyre: p.damage.tyre.slice(), dmg: JSON.parse(JSON.stringify(c.dmg)) };
  },
  weather: (kind, water) => { weather.setup(kind, S.track); if (water !== undefined) weather.water = water; },
  get weatherState() { return { kind: weather.kind, rain: weather.rain, water: weather.water, air: weather.air, track: weather.track }; },
  /** ask for a stop; auto = drive the player's car down the pit road for them (tools only) */
  pit: (c, auto = false) => { S.player.pit.auto = !!auto; return S.player.pit.call(c); },
  get fx() { return { quads: marks.quads, sparks: sparks.alive, debris: debris.list.length }; },
  place: (dist) => { const i = S.track.index(dist), pt = S.track.points[i]; S.player.place(pt.x, pt.z, pt.h, i); camReady = false; },
  freeCam: (c) => { freeCam = c; },
  setCam: (m) => { camMode = m; camReady = false; },
  /** TEST ONLY: a robot drives the player's car through the real frame loop */
  autopilot: async (skill = 0.95) => {
    if (!skill) { S.autopilot = null; return; }
    const tr = S.track, line = racingLine(tr.points, tr.halfWidth).line;
    S.autopilot = new Driver(S.player, { line, speeds: speedPlan(line, skill, tr.halfWidth < 6) }, skill, 'autopilot');
  },
  /** TEST ONLY: run this many world steps per drawn frame */
  warp: (n) => { S.warp = Math.max(1, n | 0); },
  /** the sky/ground probe the cars reflect, so tools/car.mjs can light its turntable the same way */
  get environment() { return scene.environment; },
  info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
};
