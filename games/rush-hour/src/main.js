// RUSH HOUR - blocky high-speed traffic weaver on one connected road. Game loop, player handling
// (arcade grip + brake-tap drift), collisions, checkpoints, camera, HUD, flow.
import * as THREE from '../vendor/three.module.js';
import { STAGES, starsFor } from './stages.js';
import { makeRoad, buildWorld, buildWorks, makeZones } from './world.js';
import { makePlayer, MAT } from './cars.js';
import { Traffic } from './traffic.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const VMAX = 72, VNITRO = 94, PHW = 0.96, PHL = 2.15;
// handling (Liam: steering is never the problem, speed is): the car carries FF of the road's own curvature
// by itself, full steer adds A_STEER m/s^2 of turning on top at any speed (no grip ceiling), K_AL = how hard
// the car straightens itself along the road when you let go
const A_STEER = 62, FF = 0.85, K_AL = 5, DRIFT_AUTH = 1.3, K_AL_DRIFT = 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(64, 1, 0.1, 1200);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const snd = new Sound();
const fx = new FX(scene);
const player = makePlayer(); scene.add(player.grp);
const headL = new THREE.SpotLight('#fff1d0', 0, 90, 0.55, 0.5, 1.2); headL.position.set(0, 0.8, -1.8);
const fill = new THREE.PointLight('#9fb4ff', 0, 7, 1.6); fill.position.set(0, 2.3, 0.7);
const headT = new THREE.Object3D(); headT.position.set(0, -0.6, -30); player.grp.add(headL, headT, fill); headL.target = headT;

// ---------------------------------------------------------------- the road (built once), world streams around the player
const T = makeRoad();
const W = buildWorld(scene, T);
const works = buildWorks(W.root, T, makeZones(T));
let rand = mulberry(1);
const traffic = new Traffic(W.root, T, works, rand);

// ---------------------------------------------------------------- save
const SAVE_KEY = 'rushhour.v1';
let save = { unlocked: 1, stars: [], best: [], last: 0 };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.unlocked) save = Object.assign(save, s); } catch (e) { /* storage blocked */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- game state
const G = window.__G = { STAGES, T, state: 'boot', spikes: [], bot: Q.has('bot'), stageIdx: 0, time: 0, log: [] };
let P, input = { steer: 0, brake: false, nitro: false, hand: false };
let resultAt = 0, shake = 0, slowmo = 0, fovKick = 0, flash = 0, attract = false, resultT = 0;
let env = W.env;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a run starts at stage i's checkpoint and carries on through every later stage with no break
function startRun(i, opts = {}) {
  attract = !!opts.attract; snd.quiet = attract;
  traffic.clear(); works.reset();
  rand = mulberry(opts.seed ?? ((Math.random() * 1e9) | 0)); traffic.R = rand;
  const st = STAGES[i];
  P = { stage: i, runStart: i, s: T.B[i] + 4, lat: T.laneLat(Math.floor(st.lanes / 2)), prevLat: 0, v: 40, h: 0, slip: 0, omega: 0, latV: 0,
    roll: 0, pitch: 0, nitro: 0.4, boosting: false, drift: 0, driftT: 0, driftCharge: 0, driftIdle: 0, camTh: 0,
    invuln: 0, timeLeft: st.time, stageLeft: st.time, score: 0, stageScore0: 0, combo: 0, comboT: 0, nm: 0, crashes: 0, top: 0,
    wheel: 0, scrapeT: 0, wobble: 0, cornerI: 0, apexI: -1, cleared: [], stageNm0: 0 };
  G.stageIdx = i; G.log = []; G.stats = { drifts: 0, boosts: 0, apex: 0, cornerNm: 0 }; G.result = null; botLane = -1;
  W.stream(P.s); traffic.fill(P.s);
  for (const c of fx.dd) c.life = 0;
  shake = slowmo = fovKick = flash = 0;
  applyEnv();
  snapCam();
  G.state = attract ? 'attract' : 'play';
  if (!attract) {
    save.last = i; persist();
    showOnly(null); $('hud').classList.remove('hidden');
    stageLabel();
    banner(`<small>STAGE ${i + 1} &middot; ${st.tag.toUpperCase()}</small>${st.name.toUpperCase()}`);
    setTimeout(() => { if (G.state === 'play' && P.s - T.B[P.runStart] < 200) banner('GO!'); }, 1300);
    snd.beep(true);
    if (isTouch) $('touch').classList.remove('hidden');
  }
}
function stageLabel() { $('stageNum').textContent = 'STAGE ' + (P.stage + 1); $('stageName').textContent = STAGES[P.stage].name; }

function applyEnv() {
  env = W.setEnv(P.s);
  headL.intensity = 60 * Math.min(1, env.night * 2);
  fill.intensity = 14 * env.night * (1 - env.wet);
  player.bodyMat.emissive.setRGB(env.wet * (0.12 + 0.1 * env.night), env.wet * (0.05 + 0.03 * env.night), env.wet * (0.04 + 0.02 * env.night));
}

// ---------------------------------------------------------------- input
const keys = {};
const isTouch = 'ontouchstart' in window || Q.has('touch');
if (isTouch) document.body.classList.add('touch');
addEventListener('keydown', (e) => {
  snd.wake();
  if (e.repeat && keys[e.code]) return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  onKey(e.code);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', () => snd.wake());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pause(true); });
const touch = { l: false, r: false, b: false, n: false };
function bindTouch(id, k) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[k] = true; el.classList.add('on'); snd.wake(); });
  const up = () => { touch[k] = false; el.classList.remove('on'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
}
bindTouch('tL', 'l'); bindTouch('tR', 'r'); bindTouch('tBrake', 'b'); bindTouch('tNitro', 'n');
$('tPause').addEventListener('pointerdown', (e) => { e.preventDefault(); pause(true); });

function onKey(code) {
  if (code === 'KeyM') { snd.setMute(!snd.muted); $('pMute').textContent = 'SOUND: ' + (snd.muted ? 'OFF' : 'ON'); }
  if (G.state === 'play') {
    if (code === 'Escape' || code === 'KeyP') pause(true);
    else if (code === 'KeyR') startRun(P.stage);
  } else if (G.state === 'pause') {
    if (code === 'Escape' || code === 'KeyP' || code === 'Enter') pause(false);
    else if (code === 'KeyR') startRun(P.stage);
  } else if (G.state === 'result') {
    if (performance.now() - resultAt < 600) return;
    if (code === 'Enter' || code === 'Space' || code === 'KeyR') $('resRetry').click();
    else if (code === 'Escape') openSelect();
  } else if (G.state === 'select') {
    if (code === 'Escape') openTitle();
    const n = save.unlocked;
    if (code === 'ArrowRight' || code === 'KeyD') selIdx = Math.min(n - 1, selIdx + 1);
    if (code === 'ArrowLeft' || code === 'KeyA') selIdx = Math.max(0, selIdx - 1);
    if (code === 'ArrowDown' || code === 'KeyS') selIdx = Math.min(n - 1, selIdx + 5);
    if (code === 'ArrowUp' || code === 'KeyW') selIdx = Math.max(0, selIdx - 5);
    if (code === 'Enter' || code === 'Space') startRun(selIdx);
    renderGrid();
  } else if (G.state === 'title' || G.state === 'attract') {
    if (code === 'Enter' || code === 'Space') $('playBtn').click();
  }
}

function readInput(dt) {
  if (G.manual) { Object.assign(input, G.manual); return; } // test hook: scripted input
  if (G.bot || attract) { Object.assign(input, botInput()); return; }
  const l = keys.KeyA || keys.ArrowLeft || touch.l, r = keys.KeyD || keys.ArrowRight || touch.r;
  const target = (r ? 1 : 0) - (l ? 1 : 0);
  const rate = target === 0 ? 12 : (Math.sign(target) !== Math.sign(input.steer) ? 16 : 10);
  input.steer += Math.sign(target - input.steer) * Math.min(Math.abs(target - input.steer), rate * dt);
  input.brake = !!(keys.KeyS || keys.ArrowDown || touch.b);
  input.hand = !!(keys.KeyX || keys.KeyC);
  input.nitro = !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || touch.n);
}

// ---------------------------------------------------------------- bot (autopilot for tests + attract mode)
let botLane = -1;
function botLanes() {
  const out = [], s = P.s, wl = T.wall(s) || T.wall(s + 60) || T.wall(s + 140);
  for (let j = -2; j <= 3; j++) {
    if (!T.laneOpen(j, s) || !T.laneOpen(j, s + 40) || !T.laneOpen(j, s + 90)) continue;
    if (j < 0 && wl) continue;
    if (j >= 0 && works.closed(j, s, 70)) continue;
    out.push(j);
  }
  return out;
}
function laneClearTime(j) {
  let t = 6;
  const ll = T.laneLat(j);
  for (const c of traffic.cars) {
    const occ = c.lane === j || c.toLane === j || Math.abs(c.lat - ll) < c.wid / 2 + PHW + 0.2;
    if (!occ) continue;
    const ds = c.s - P.s, reach = c.len / 2 + PHL + 0.6;
    if (ds < -reach) continue;
    if (ds < reach) return 0;
    const closing = P.v - c.v * c.dir;
    if (closing > 0.1) t = Math.min(t, (ds - reach) / closing);
  }
  for (const z of works.zones) if (z.lane === j) {
    if (P.s > z.s0 - 55 && P.s < z.s1 + 3) return 0;
    if (z.s0 - 55 > P.s) t = Math.min(t, (z.s0 - 55 - P.s) / Math.max(10, P.v));
  }
  for (let d = 30; d <= 150; d += 30) if (!T.laneOpen(j, P.s + d)) { t = Math.min(t, (d - 30) / Math.max(10, P.v)); break; }
  return t;
}
// deceleration needed to not hit anything in the footprint at 'lat' (m/s^2)
function needDecel(lat) {
  let need = 0;
  for (const c of traffic.cars) {
    if (Math.abs(c.lat - lat) > c.wid / 2 + PHW + 0.15) continue;
    const gap = c.s - P.s - c.len / 2 - PHL - 3, closing = P.v - c.v * c.dir;
    if (gap < -2 || closing <= 0 || gap > 250) continue;
    need = Math.max(need, closing * closing / (2 * Math.max(1, gap)));
  }
  return need;
}
function ttcAt(lat) {
  let t = 6;
  for (const c of traffic.cars) {
    if (Math.abs(c.lat - lat) > c.wid / 2 + PHW + 0.15) continue;
    const ds = c.s - P.s, reach = c.len / 2 + PHL + 0.4;
    if (ds < -reach) continue;
    if (ds < reach) return 0;
    const closing = P.v - c.v * c.dir;
    if (closing > 0.1) t = Math.min(t, (ds - reach) / closing);
  }
  for (const bk of works.blocks) if (bk.s > P.s && bk.s < P.s + 200 && Math.abs(bk.lat - lat) < PHW + 0.5) t = Math.min(t, (bk.s - P.s - 4) / Math.max(5, P.v));
  return t;
}
function botInput() {
  const lanes = botLanes();
  const cur = T.laneOf(P.lat);
  if (!lanes.includes(botLane)) botLane = lanes.reduce((b, j) => (Math.abs(j - cur) < Math.abs(b - cur) ? j : b), lanes[0] ?? 0);
  // lane value = time until blocked + how fast that lane's traffic is moving
  const laneSpeed = (j) => { let v = VMAX; for (const c of traffic.cars) if (c.dir > 0 && (c.lane === j || c.toLane === j) && c.s > P.s - 3 && c.s < P.s + 130) v = Math.min(v, c.v); return v; };
  const score = (j) => laneClearTime(j) + (j < 0 ? -0.8 : 0.06 * laneSpeed(j)) - Math.abs(j - cur) * 0.15;
  let best = botLane, bs = score(botLane) + 0.3;
  for (const j of lanes) if (j !== botLane) { const sc = score(j); if (sc > bs) { bs = sc; best = j; } }
  let dropBack = false;
  if (Math.abs(best - cur) > 1) { // two lanes over: step through the middle lane, or drop back if it is blocked alongside
    const mid = cur + Math.sign(best - cur);
    if (lanes.includes(mid) && laneClearTime(mid) > 0.35) best = mid; else { best = cur; dropBack = bs > score(cur) + 0.8; }
  }
  botLane = best;
  // speed: flat out; it only brakes for traffic. It drifts the hairpins for style + the boost
  const grip = gripAt(), vv = Math.max(P.v, 12);
  let brake = false, wantDrift = false;
  for (let d = 0; d <= 40; d += 5) if (Math.abs(T.curv(P.s + d)) > 1 / 70) wantDrift = true;
  // steering: hold the road's curvature plus a heading correction towards the target lane
  const k0 = T.curv(P.s + P.v * 0.12), e = T.laneLat(botLane) - P.lat;
  const hDes = clamp(e * 0.09, -0.22, 0.22);
  const omDes = k0 * P.v * (1 - FF) + (hDes - P.h) * 5;
  let steer;
  if (P.drift) {
    steer = clamp((omDes + K_AL_DRIFT * P.h) / (DRIFT_AUTH * A_STEER * grip / vv), -1, 1);
    if (Math.abs(k0) < 1 / 140) steer = -P.drift; // counter-steer out when the bend opens
  } else steer = clamp((omDes + K_AL * P.h) / (A_STEER * grip / vv), -1, 1);
  const ahead = ttcAt(P.lat);
  if (ahead < 0.55 || (ahead < 1.1 && laneClearTime(botLane) < 1.2)) brake = true;
  // brake early enough at big closing speeds, unless the lane change it is making clears the car first
  if (needDecel(P.lat) > 20 && (Math.abs(T.laneLat(botLane) - P.lat) < 1.5 || needDecel(T.laneLat(botLane)) > 20)) brake = true;
  // boxed in behind a car with another alongside: drop back so a gap opens
  P.boxT = ahead < 1.6 && P.v < VMAX * 0.6 ? (P.boxT || 0) + G.dt : Math.max(0, (P.boxT || 0) - G.dt * 2);
  if (P.boxT > 1.2) { brake = true; if (P.boxT > 1.8) P.boxT = 0.6; }
  if (dropBack && P.v > 18) brake = true;
  if (P.v < 10) brake = false; // never park: at a standstill steering cannot get it out
  const hand = wantDrift && !P.drift && Math.abs(k0) > 1 / 90;
  if (hand) steer = Math.sign(T.curv(P.s + 20)) || steer;
  return { steer, brake: brake && !P.drift, hand, nitro: laneClearTime(botLane) > 3.5 && ahead > 3 && !brake };
}

// ---------------------------------------------------------------- simulation
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function gripAt() {
  const k = T.curv(P.s), b = T.bank(P.s), cam = b * Math.sign(k); // cam > 0 = off-camber
  return T.param(P.s, 'grip', 1) * (cam > 0 ? 1 - cam * 4 : 1 + Math.min(0.08, -cam * 2));
}
function startDrift(d) {
  G.stats.drifts++; P.drift = d; P.driftT = 0; P.driftCharge = 0; P.driftIdle = 0;
  if (!attract) snd.burst('bandpass', 2400, 1600, 0.45, 0.22, 0, 5);
}
function endDrift(reward) {
  const ch = P.driftCharge, t = P.driftT;
  P.drift = 0;
  if (!reward || t < 0.6 || ch < 0.2) return;
  const lvl = Math.min(1, ch / 0.8), mult = Math.max(1, Math.min(10, P.combo));
  P.v = Math.min(VNITRO, P.v + 5 + 9 * lvl); P.nitro = Math.min(1, P.nitro + 0.08 + 0.17 * lvl);
  const pts = Math.round(300 + 1200 * lvl); P.score += pts * mult; G.stats.boosts++; P.combo++; P.comboT = 3;
  fovKick += 3 + lvl * 3; snd.nitro();
  pop(`DRIFT BOOST<small>+${pts}${mult > 1 ? ' &times;' + mult : ''} &middot; ${t.toFixed(1)}s</small>`, 'drift');
}
function railHit(sd, lim) {
  const ang = Math.abs(P.h);
  P.lat = lim; P.h = -sd * 0.02;
  P.v *= 1 - (0.7 * G.dt + 0.6 * Math.min(0.35, ang)); shake = Math.max(shake, 0.25 + ang);
  if (P.scrapeT <= 0) { snd.scrape(); P.scrapeT = 0.12; }
  T.pos(P.s + 1, P.lat + sd * PHW, 0.5, tmpV); fx.burstSparks(tmpV, 3 + ((ang * 30) | 0), tmpV2.set(0, 0, 1), P.v * 0.3);
  if (P.drift && ang > 0.12) endDrift(false);
  if (G.state !== 'result') P.combo = 0;
}
function step(dt) {
  G.time += dt; G.dt = dt;
  const playing = G.state !== 'result';
  if (G.state === 'result') { Object.assign(input, botInput()); input.brake = P.v > 18; input.nitro = false; input.hand = false; } else readInput(dt);
  const k = T.curv(P.s), grip = gripAt();
  // speed
  P.boosting = input.nitro && P.nitro > 0.02 && playing && !input.brake;
  if (P.boosting && !P._wasBoost) { snd.nitro(); fovKick += 6; }
  P._wasBoost = P.boosting;
  if (P.boosting) P.nitro = Math.max(0, P.nitro - dt * 0.3);
  const vcap = P.boosting ? VNITRO : VMAX;
  if (input.brake) P.v = Math.max(0, P.v - (P.drift ? 20 : 34) * dt);
  else if (P.v < vcap) P.v += (P.boosting ? 26 : 13) * Math.pow(Math.max(0.05, 1 - P.v / vcap), 0.55) * dt + (P.v < 20 ? 6 * dt : 0);
  else P.v = Math.max(vcap, P.v - 9 * dt);
  // drift: tap the brake (or X) while steering
  const brakeEdge = input.brake && !P._brk, handEdge = input.hand && !P._hand;
  P._brk = input.brake; P._hand = input.hand;
  const tapOk = !(G.bot || attract); // the autopilot only drifts on purpose (handbrake)
  if (!P.drift && playing && P.v > 30 && Math.abs(input.steer) > 0.4 && ((brakeEdge && tapOk) || handEdge)) startDrift(Math.sign(input.steer));
  P.brakeHeld = input.brake ? (P.brakeHeld || 0) + dt : 0;
  // turning: the car follows FF of the bend by itself, steering adds a yaw rate on top (no grip ceiling,
  // so any corner or gap is always makeable); it straightens itself along the road when you let go, and
  // on a bend it drifts wide slowly unless you steer into it
  const vv = Math.max(P.v, 12), ff = FF * k * P.v * Math.cos(P.h) / Math.max(0.3, 1 - k * P.lat);
  let om;
  if (P.drift) {
    const d = P.drift, into = input.steer * d;
    const slipT = d * (0.36 + 0.3 * Math.max(0, into) - 0.3 * Math.max(0, -into));
    P.slip += (slipT - P.slip) * Math.min(1, 5 * dt);
    om = ff + input.steer * (DRIFT_AUTH * A_STEER * grip / vv) - K_AL_DRIFT * P.h;
    P.v -= (1 + 4 * Math.abs(P.slip)) * dt; // sliding scrubs less than braking: a fast way round
    P.driftT += dt; P.driftCharge += Math.abs(P.slip) * dt;
    P.driftIdle = Math.abs(input.steer) < 0.15 ? P.driftIdle + dt : 0;
    if ((into < -0.25 && P.driftT > 0.35) || P.driftIdle > 0.35 || P.v < 24 || !playing) endDrift(playing);
    else if (P.brakeHeld > 0.4) endDrift(false); // a held brake is braking, not a drift tap
  } else {
    om = ff + input.steer * (A_STEER * grip / vv) - K_AL * P.h;
    P.slip += (input.steer * 0.07 * Math.min(1, P.v / VMAX) - P.slip) * Math.min(1, 6 * dt); // a hint of tail-out when steering hard
  }
  P.omega = om;
  P.prevLat = P.lat;
  const sDot = P.v * Math.cos(P.h) / Math.max(0.3, 1 - k * P.lat);
  P.h = clamp(P.h + (om - k * sDot) * dt, -1.1, 1.1);
  P.s += sDot * dt; P.latV = P.v * Math.sin(P.h); P.lat += P.latV * dt;
  P.top = Math.max(P.top, P.v);
  // walls: outer rails, and the median wall on divided stretches (you can be on either side of it)
  const side = P.prevLat >= 0 ? 1 : -1, wl = 0.3 + PHW + 0.05;
  if (T.wall(P.s) && side * P.lat < wl) {
    if (!T.wall(P.s - PHL - 0.8) && Math.abs(P.prevLat) < wl - 0.4 && playing && P.invuln <= 0) { // nosed into the crash cushion
      crashFx(T.pos(P.s + 2, 0, 0.6), '#e9b41c', P.v); P.lat = side * (wl + 0.15); P.h = side * 0.05; penalize(3, 'BARRIER', 0.3);
    } else railHit(-side, side * wl);
  }
  const limR = (T.wall(P.s) && side < 0) ? -wl : T.edgeR(P.s) + 1.2 - PHW - 0.06;
  const limL = (T.wall(P.s) && side > 0) ? wl : T.edgeL(P.s) - 1.2 + PHW + 0.06;
  if (P.lat > limR && limR > 0) railHit(1, limR);
  else if (P.lat < limL && limL < 0) railHit(-1, limL);
  P.scrapeT -= dt; P.invuln -= dt; P.wobble *= 1 - 4 * dt;

  W.stream(P.s, 1);
  traffic.update(dt, P);
  if (playing) { collide(); apex(); }
  updateCones(dt);

  if (G.state === 'play') {
    if (!G.noClock) P.timeLeft -= dt; P.stageLeft -= dt;
    P.comboT -= dt; if (P.comboT <= 0 && P.combo > 0) P.combo = 0;
    const ns = T.stageAt(P.s);
    if (P.s >= T.END) { closeStage(); finish(true); }
    else if (ns > P.stage) checkpoint(ns);
    else if (P.timeLeft <= 0) { P.timeLeft = 0; finish(false); }
  } else if (attract && P.s > T.END - 60) { const keep = G.state; startRun(0, { attract: true }); G.state = keep; }
  if (G.state === 'result') resultT += dt;
}

// stage i is done: its stars come from its own clock (at least 1 star for getting through)
function closeStage() {
  const i = P.stage, st = STAGES[i];
  const stars = Math.max(1, starsFor(st, P.stageLeft)), pts = P.score - P.stageScore0;
  const rec = { stage: i + 1, used: +(st.time - P.stageLeft).toFixed(1), stars, left: +P.stageLeft.toFixed(1), score: pts, nm: P.nm - P.stageNm0, clock: +P.timeLeft.toFixed(1) };
  P.cleared.push(rec); G.log.push(rec);
  if (!attract) {
    if (!save.stars[i] || stars > save.stars[i]) save.stars[i] = stars;
    if (!save.best[i] || pts > save.best[i]) save.best[i] = pts;
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length, i + 2));
    persist();
  }
  return rec;
}
function checkpoint(ns) {
  const rec = closeStage();
  const st = STAGES[ns], bonus = st.time;
  P.stage = ns; G.stageIdx = ns; P.stageLeft = st.time; P.timeLeft += bonus; P.stageScore0 = P.score; P.stageNm0 = P.nm;
  if (attract) return;
  stageLabel();
  banner(`<small>CHECKPOINT &middot; ${'&#9733;'.repeat(rec.stars)} &middot; +${bonus}s</small>STAGE ${ns + 1}: ${st.name.toUpperCase()}`);
  pop(`+${bonus}s<small>TIME BONUS</small>`, 'close');
  snd.beep(true); setTimeout(() => snd.star(rec.stars - 1), 200);
  fovKick += 4;
}

function collide() {
  for (const c of traffic.cars) {
    const ds = c.s - P.s, dl = c.lat - P.lat;
    const hl = c.len / 2 + PHL, hw = c.wid / 2 + PHW;
    const oz = hl - Math.abs(ds), ox = hw - Math.abs(dl);
    const sd = ds > 0 ? 1 : -1;
    if (c.passed === null) c.passed = sd;
    if (c.passed === 1 && sd === -1) {
      const gap = Math.abs(dl) - hw, walled = T.wall(c.s) && Math.sign(c.lat) !== Math.sign(P.lat);
      if (!c.touched && !walled && gap < 2.0 && gap > -0.05 && P.v > 26 && G.state !== 'result') nearMiss(c, gap, dl);
    }
    c.passed = sd;
    if (oz > 0 && ox > 0 && P.invuln <= 0 && c.hitT <= 0.2) {
      c.touched = true;
      if (c.dir > 0 && ox < 0.55 && oz > ox * 1.2) sideswipe(c, dl, ox);
      else crash(c, ds, dl);
    } else if (oz > 0 && ox > 0 && c.dir > 0) { c.lat += Math.sign(dl || 1) * ox * 0.5; c.touched = true; }
  }
  if (P.invuln <= 0) {
    for (const b of works.blocks) {
      if (Math.abs(b.s - P.s) > PHL + 1.9) continue;
      if (Math.abs(b.lat - P.lat) < PHW + 0.36) {
        const z = works.zones.find((zz) => b.s >= zz.s0 - 1 && b.s <= zz.s1 + 1), o = z ? z.open : 1;
        crashFx(T.pos(P.s + 2, P.lat, 0.6), '#c9c6bf', P.v);
        P.lat = b.lat + o * (0.36 + PHW + 0.15); P.h = o * 0.08;
        penalize(3, 'BARRIER', 0.28);
        break;
      }
    }
  }
}
// APEX: clip the inside of a real bend at its middle
function apex() {
  const cs = T.corners;
  while (P.cornerI < cs.length && cs[P.cornerI].s1 < P.s) P.cornerI++;
  const c = cs[P.cornerI];
  if (!c || c.R > 170 || P.apexI === P.cornerI || P.s < (c.s0 + c.s1) / 2 || P.s > c.s1) return;
  P.apexI = P.cornerI;
  const lim = c.d > 0 ? T.edgeR(P.s) + 1.2 - PHW - 0.06 : T.edgeL(P.s) - 1.2 + PHW + 0.06;
  const gap = Math.abs(lim - P.lat), insideLane = c.d > 0 ? P.lat > T.edgeR(P.s) - 3.7 : P.lat < T.edgeL(P.s) + 3.7;
  if (gap < 1.4 && insideLane && P.v > 28) {
    const mult = Math.max(1, Math.min(10, P.combo + 1)), pts = (P.drift ? 500 : 250);
    P.combo++; P.comboT = 3; P.score += pts * mult; P.nitro = Math.min(1, P.nitro + 0.08); G.stats.apex++;
    fovKick += 2; pop(`APEX!<small>+${pts}${mult > 1 ? ' &times;' + mult : ''}</small>`, 'apex');
  }
}

function nearMiss(c, gap, dl) {
  const onc = c.dir < 0, big = c.type === 'truck' || c.type === 'bus';
  let tier = 0, label = 'NEAR MISS', cls = 'nm', pts = 100;
  if (gap < 1.0) { tier = 1; label = 'CLOSE!'; cls = 'close'; pts = 200; }
  if (gap < 0.45) { tier = 2; label = 'INSANE!'; cls = 'insane'; pts = 350; }
  if (onc) { pts *= 2; label = 'ONCOMING ' + label; }
  if (big) pts = Math.round(pts * 1.5);
  if (P.drift) { pts *= 2; label = 'DRIFT ' + label; }
  else if (Math.abs(T.curv(P.s)) > 1 / 260) { pts = Math.round(pts * 1.5); label = 'CORNER ' + label; G.stats.cornerNm++; }
  P.combo++; P.comboT = 3; P.nm++;
  const mult = Math.min(10, P.combo);
  P.score += pts * mult;
  P.nitro = Math.min(1, P.nitro + 0.1 + tier * 0.05 + (onc ? 0.06 : 0));
  fovKick += 2.5 + tier * 1.5; shake = Math.max(shake, 0.12 + tier * 0.08);
  snd.whoosh(Math.sign(dl) * 0.8, tier > 0 || big);
  if (tier === 2 && rand() < 0.5) snd.horn();
  pop(`${label}<small>+${pts}${mult > 1 ? ' &times;' + mult : ''}${big ? ' BIG RIG' : ''}</small>`, cls);
}
function sideswipe(c, dl, ox) {
  const sd = Math.sign(dl) || 1;
  P.lat -= sd * (ox + 0.05); P.h = -sd * 0.07; P.v *= 0.9;
  c.hitT = 0.5; c.latV = sd * 3; c.spinV = sd * 1.2;
  shake = Math.max(shake, 0.5); P.wobble = sd;
  if (P.drift) endDrift(false);
  snd.scrape(); snd.scrape();
  T.pos(P.s, P.lat + sd * PHW, 0.55, tmpV); fx.burstSparks(tmpV, 26, tmpV2.set(0, 0, -1), P.v * 0.6);
  P.combo = 0;
  pop('SCRAPE', 'bad');
}
function crash(c, ds, dl) {
  const v0 = P.v;
  if (c.dir > 0) c.v = Math.max(c.v, v0 * 0.72); else c.v = 4;
  c.hitT = 1.7; c.spinV = (Math.sign(dl) || 1) * (5 + rand() * 4); c.latV = (Math.sign(dl) || 1) * 4;
  crashFx(T.pos((c.s + P.s) / 2, (c.lat + P.lat) / 2, 0.7), pickColor(c), v0);
  penalize(3, c.dir < 0 ? 'HEAD-ON' : 'CRASH', 0.3);
  P.lat -= (Math.sign(dl) || 1) * 0.4;
}
function pickColor(c) { const col = c.m.grp.children[0].geometry.attributes.color; return '#' + new THREE.Color(col.getX(0) * 1.6, col.getY(0) * 1.6, col.getZ(0) * 1.6).getHexString(); }
function crashFx(p, color, v0) {
  fx.debris(p, color, 18, tmpV2.set(0, 0, -v0 * 0.25)); fx.debris(p, '#ff4a1c', 8, tmpV2.set(0, 0, -v0 * 0.2));
  fx.burstSparks(p, 60, tmpV2.set(0, 0, -1), v0);
  for (let i = 0; i < 14; i++) fx.smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.5, 0.52, 1.6);
  snd.crash();
}
function penalize(sec, label, vk) {
  P.v *= vk; if (G.state === 'play') { P.timeLeft -= sec; P.stageLeft -= sec; }
  P.crashes++; (G.stats.hits = G.stats.hits || []).push(label + '@' + Math.round(P.s) + ' k' + Math.round(1 / Math.max(1e-4, Math.abs(T.curv(P.s)))) + ' lat' + P.lat.toFixed(1) + ' v' + Math.round(P.v * 3.6)); P.combo = 0; P.invuln = 1.5; P.wobble = 1; P.h *= 0.3;
  if (P.drift) endDrift(false);
  shake = 1.3; slowmo = 0.55; flash = 0.55;
  pop(`${label}<small>-${sec.toFixed(1)}s</small>`, 'bad');
}
function updateCones(dt) {
  let moved = false;
  for (const c of works.cones) {
    if (Math.abs(c.s - P.s) > 60) continue;
    if (!c.hit && Math.abs(c.s - P.s) < PHL + 0.3 && Math.abs(c.lat - P.lat) < PHW + 0.3 && G.state !== 'result') {
      c.hit = true; c.vs = P.v * (0.7 + Math.random() * 0.3); c.vy = 5 + Math.random() * 4; c.vl = (Math.sign(c.lat - P.lat) || 1) * (3 + Math.random() * 5);
      P.v *= 0.96; snd.cone(); P.score += 10; shake = Math.max(shake, 0.15); pop('CONE +10', 'cone');
    }
    if (c.hit && (c.vs > 0.1 || c.h > 0)) {
      c.s += c.vs * dt; c.lat += c.vl * dt; c.h += c.vy * dt; c.vy -= 22 * dt; c.rot += 9 * dt;
      if (c.h < 0) { c.h = 0; c.vy *= -0.3; c.vs *= 0.55; c.vl *= 0.6; if (Math.abs(c.vy) < 1) c.vy = 0; }
      moved = true;
    }
  }
  if (moved) works.syncCones();
}

function finish(win) {
  G.state = 'result'; resultT = 0; resultAt = performance.now();
  if (P.drift) P.drift = 0;
  const total = win ? Math.round(P.score + P.timeLeft * 100) : P.score;
  const runStars = P.cleared.reduce((a, r) => a + r.stars, 0);
  G.result = { win, stage: P.stage + 1, from: P.runStart + 1, cleared: P.cleared.length, runStars, left: P.timeLeft, score: total, nm: P.nm, crashes: P.crashes, top: P.top,
    dist: Math.round(P.s - T.B[P.runStart]), distLeft: Math.max(0, T.B[P.stage + 1] - P.s), log: P.cleared.slice() };
  if (win) snd.win(); else snd.lose();
  if (!G.headless) setTimeout(showResult, 900);
}

// ---------------------------------------------------------------- UI
function showOnly(id) { for (const s of ['title', 'select', 'result', 'pause']) $(s).classList.toggle('hidden', s !== id); }
function banner(html) { if (G.headless) return; const b = $('banner'); b.innerHTML = html; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
let popCount = 0;
function pop(html, cls) {
  if (G.headless || attract) return;
  const box = $('pops'); if (box.children.length > 4) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'pop ' + cls; d.innerHTML = html;
  d.style.top = (popCount++ % 2) * 8 + 'px'; box.appendChild(d); setTimeout(() => d.remove(), 1000);
}
function showResult() {
  if (G.state !== 'result') return;
  const r = G.result; showOnly('result'); $('touch').classList.add('hidden');
  $('resHead').textContent = r.win ? 'GAUNTLET CLEARED!' : 'OUT OF TIME';
  $('resHead').className = r.win ? '' : 'fail';
  const last = r.log[r.log.length - 1], show = r.win ? Math.round(r.runStars / Math.max(1, r.cleared)) : (last ? last.stars : 0);
  const stars = [...$('resStars').children];
  stars.forEach((s) => s.classList.remove('on'));
  stars.forEach((s, i) => { if (i < show) setTimeout(() => { s.classList.add('on'); snd.star(i); }, 300 + i * 260); });
  const row = (k, v, c = '') => `<div>${k}</div><div class="v ${c}">${v}</div>`;
  const per = r.log.map((x) => `${x.stage}:${'&#9733;'.repeat(x.stars)}`).join(' &nbsp;');
  $('resStats').innerHTML = row('Stages cleared', `${r.cleared} (from stage ${r.from})`)
    + (r.win ? row('Time left', r.left.toFixed(2) + 's') : row(`Stage ${r.stage} to go`, Math.round(r.distLeft) + ' m'))
    + (per ? row('Stars', per) : '')
    + row('Near misses', r.nm) + row('Crashes', r.crashes) + row('Top speed', Math.round(r.top * 3.6) + ' km/h')
    + row('Score', r.score.toLocaleString());
  const retryFrom = r.win ? r.from - 1 : r.stage - 1;
  $('resRetry').textContent = r.win ? 'AGAIN' : `RETRY STAGE ${r.stage}`;
  $('resRetry').onclick = () => startRun(retryFrom);
  $('resNext').classList.toggle('hidden', r.win || r.from >= r.stage);
  $('resNext').textContent = `FROM STAGE ${r.from}`;
  $('resNext').onclick = () => startRun(r.from - 1);
  $('resRetry').classList.add('big');
}
$('resMenu').onclick = () => openSelect();
function pause(on) {
  if (on && G.state === 'play') { G.state = 'pause'; showOnly('pause'); }
  else if (!on && G.state === 'pause') { G.state = 'play'; showOnly(null); }
}
$('pResume').onclick = () => pause(false);
$('pRetry').onclick = () => startRun(P.stage);
$('pMenu').onclick = () => openSelect();
$('pMute').onclick = () => { snd.setMute(!snd.muted); $('pMute').textContent = 'SOUND: ' + (snd.muted ? 'OFF' : 'ON'); };
$('playBtn').onclick = () => { snd.wake(); const f = STAGES.findIndex((_, i) => !save.stars[i]); const n = Math.min(save.unlocked - 1, f === -1 ? save.last : f); startRun(Math.max(0, n)); };
$('stagesBtn').onclick = () => { snd.wake(); openSelect(); };
$('selBack').onclick = () => openTitle();

let selIdx = 0;
const TODC = { day: '#7fc3ff', sunset: '#ff9a4d', night: '#3b4b8a', storm: '#9aa4ae' };
function renderGrid() {
  const g = $('grid'); g.innerHTML = '';
  STAGES.forEach((s, i) => {
    const locked = i >= save.unlocked, n = save.stars[i] || 0;
    const d = document.createElement('div');
    d.className = 'card' + (locked ? ' locked' : '') + (i === selIdx ? ' sel' : '');
    d.innerHTML = `<div class="tod" style="background:${TODC[s.tod]}"></div><div class="n">${i + 1}</div><div class="nm">${s.name}</div><div class="tg">${s.tag}${s.rain ? ' &middot; rain' : ''}</div>`
      + `<div class="st">${'&#9733;'.repeat(n)}<i>${'&#9733;'.repeat(3 - n)}</i></div>`;
    if (!locked) d.onclick = () => startRun(i);
    g.appendChild(d);
  });
  const tot = save.stars.reduce((a, b) => a + (b || 0), 0);
  $('totStars').innerHTML = `&#9733; ${tot} / 30 &nbsp;<small>start from any checkpoint you have reached</small>`;
}
function openSelect() {
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const i = P ? P.stage : 0;
  if (!P || G.state === 'play' || G.state === 'pause' || G.state === 'result') startRun(i, { attract: true });
  selIdx = Math.min(save.unlocked - 1, i); G.state = 'select'; attract = true; showOnly('select'); renderGrid();
}
function openTitle() {
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  if (!P || G.state === 'play' || G.state === 'pause' || G.state === 'result') startRun(P ? P.stage : 0, { attract: true });
  G.state = 'title'; attract = true; showOnly('title');
}

// ---------------------------------------------------------------- render
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _cl2 = new THREE.Vector3(), _car = new THREE.Vector3();
function snapCam() { camTargets(0); camPos.copy(_cp); camLook.copy(_cl); }
// chase camera: sits behind the car along a lagged heading (so it swings out and round in a bend) and
// looks partly down the road ahead, into the turn
function camTargets(dt) {
  const sv = Math.min(1, P.v / VMAX), th = T.frame(P.s).th, thCar = th + P.h + P.slip * 0.45;
  P.camTh = dt ? P.camTh + wrapA(thCar - P.camTh) * Math.min(1, 5.5 * dt) : thCar;
  // elevated Driven-Wild-style chase: high above and behind, pitched ~25-32 deg down onto the roof, so the car
  // sits lower-middle and the road and traffic well ahead stay in view. Look point = a little ahead of the car,
  // pulled towards the road ahead so the view still swings into bends.
  const back = 7.0 + sv * 0.6, up = 5.8 + sv * 0.4, dx = Math.sin(P.camTh), dz = -Math.cos(P.camTh);
  T.pos(P.s, P.lat, 0, _car);
  _cp.set(_car.x - dx * back, _car.y + up, _car.z - dz * back);
  T.pos(P.s + 12 + sv * 4, P.lat * 0.85, 0.3, _cl2);
  _cl.set(_car.x + dx * 5, _car.y + 0.3, _car.z + dz * 5).lerp(_cl2, 0.25);
}
function render(dt) {
  const f = T.frame(P.s);
  T.pos(P.s, P.lat, 0, player.grp.position);
  const yawVis = P.h + P.slip + Math.sin(G.time * 22) * P.wobble * 0.12;
  player.grp.rotation.set(0, f.yaw - yawVis, Math.atan(f.b), 'YXZ');
  P.roll += (clamp(-P.omega * P.v * 0.0016, -0.08, 0.08) - P.roll) * Math.min(1, 8 * dt);
  const pitchT = input.brake ? 0.035 : P.boosting ? -0.025 : 0;
  P.pitch += (pitchT - P.pitch) * Math.min(1, 6 * dt);
  player.chassis.rotation.set(P.pitch, 0, P.roll);
  player.chassis.position.y = Math.sin(G.time * 31) * 0.008 * (P.v / VMAX);
  P.wheel -= P.v * dt / 0.32;
  const wheelSteer = P.drift ? -P.slip * 0.9 : input.steer * 0.32;
  player.wheels.forEach((w, i) => { const left = w.position.x < 0; w.rotation.set(left ? -P.wheel : P.wheel, (left ? Math.PI : 0) + (i < 2 ? -wheelSteer : 0), 0, 'YXZ'); });
  player.tail.material = input.brake ? MAT.tailOn : MAT.tailOff;
  player.grp.visible = !(P.invuln > 0 && G.state === 'play' && Math.sin(G.time * 40) > 0.3);

  traffic.sync(G.time);
  works.flash(G.time);
  applyEnv();

  // camera
  camTargets(dt);
  if (camPos.distanceToSquared(_cp) > 3600) { P.camTh = T.frame(P.s).th + P.h; camTargets(0); camPos.copy(_cp); camLook.copy(_cl); } // after a jump: snap, don't fly
  camPos.lerp(_cp, 1 - Math.exp(-20 * dt)); camLook.lerp(_cl, 1 - Math.exp(-18 * dt));
  cam.position.copy(camPos); cam.lookAt(camLook);
  const sv = P.v / VMAX;
  shake *= Math.exp(-3.2 * dt); fovKick *= Math.exp(-3 * dt);
  const amp = sv * sv * 0.004 + shake * shake * 0.05 + (P.boosting ? 0.003 : 0) + (P.drift ? 0.002 : 0);
  const t = G.time;
  const lean = clamp(P.omega * Math.min(1, sv * 1.3) * 0.075, -0.11, 0.11);
  cam.rotateZ((Math.sin(t * 37) + Math.sin(t * 23.3)) * amp * 0.6 - lean + Math.atan(f.b) * 0.5);
  cam.rotateX((Math.sin(t * 41.7) + Math.sin(t * 29.1)) * amp * 0.5);
  cam.rotateY(Math.sin(t * 33.1) * amp * 0.4);
  cam.fov = 60 + Math.pow(Math.min(1.3, sv), 1.6) * 20 + (P.boosting ? 7 : 0) + fovKick;
  cam.updateProjectionMatrix();

  // fx
  if (P.boosting) for (const sx of [-0.45, 0.45]) {
    player.grp.localToWorld(tmpV.set(sx, 0.36, 2.35));
    fx.flame.emit(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 2, Math.random(), 0, 0.35, 0.75, 1, 0.12);
    fx.flame.emit(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 3, Math.random() * 2, 0, 1, 0.5, 0.15, 0.2);
  }
  const wet = env.wet > 0.4;
  if ((P.drift && Math.abs(P.slip) > 0.15) || (wet && P.v > 20 && Math.random() < 0.45)) {
    player.grp.localToWorld(tmpV2.set(0, 0, -1)).sub(player.grp.position);
    for (const sx of P.drift ? [-0.75, 0.75] : [Math.random() < 0.5 ? -0.75 : 0.75]) {
      const k = P.v * (P.drift ? 0.55 : 0.9);
      player.grp.localToWorld(tmpV.set(sx + (Math.random() - 0.5) * 0.3, 0.12, 1.6));
      if (P.drift) fx.smoke.emit(tmpV.x, tmpV.y + 0.2, tmpV.z, tmpV2.x * k + (Math.random() - 0.5) * 2, 1.2, tmpV2.z * k, 0.62, 0.62, 0.65, 0.5);
      else fx.smoke.emit(tmpV.x, tmpV.y, tmpV.z, tmpV2.x * k + sx * 1.5, 0.8, tmpV2.z * k, 0.33, 0.35, 0.38, 0.16);
    }
  }
  fx.update(dt, { T, ps: P.s, plat: P.lat, v: P.v, vmax: VMAX, nitro: P.boosting });
  glows();
  W.update(cam, player.grp.position.x, player.grp.position.y, player.grp.position.z, P.v, dt);

  flash *= Math.exp(-5 * dt);
  $('flash').style.opacity = (flash * 0.5).toFixed(3);
  $('vig').style.opacity = (0.45 + Math.min(1, sv) * 0.4 + (P.boosting ? 0.2 : 0)).toFixed(2);
  renderer.render(scene, cam);
}
const glowList = [], gp = new THREE.Vector3();
function glows() {
  const k = env.glow;
  glowList.length = 0;
  const add = (x, y, z, r, g, b, gy, noRef) => glowList.push([x, y, z, r * k, g * k, b * k, gy, noRef]);
  for (const c of traffic.cars) {
    const ds = c.s - P.s; if (ds < -20 || ds > 300) continue;
    const g = c.m.grp, hz = c.len / 2 + 0.05, hy = c.type === 'truck' ? 1.1 : 0.6, hx = c.wid / 2 - 0.3, gy = g.position.y;
    const br = c.braking ? 1 : 0.35;
    for (const sx of [-hx, hx]) { g.localToWorld(gp.set(sx, hy, hz)); add(gp.x, gp.y, gp.z, 1 * br + 0.1, 0.08 * br, 0.05, gy); }
    if (c.dir < 0) for (const sx of [-hx, hx]) { g.localToWorld(gp.set(sx, 0.6, -hz)); add(gp.x, gp.y, gp.z, 1, 0.92, 0.7, gy); }
    if (Math.sin(G.time * 10) > 0 && (c.blinkSide || c.hitT > 0)) for (const q of (c.hitT > 0 ? [-1, 1] : [c.blinkSide * c.dir])) { g.localToWorld(gp.set(q * (c.wid / 2 - 0.06), 0.6, hz)); add(gp.x, gp.y, gp.z, 1, 0.6, 0.05, gy); }
  }
  if (env.night > 0.3) {
    for (const L of W.lamps()) { const ds = L[3] - P.s; if (ds > -10 && ds < 260) add(L[0], L[1], L[2], 0.9, 0.7, 0.4, L[4]); }
    for (const sx of [-0.62, 0.62]) { player.grp.localToWorld(gp.set(sx, 0.55, -2.2)); add(gp.x, gp.y, gp.z, 0.8, 0.75, 0.6, player.grp.position.y, true); }
  }
  fx.setGlows(glowList, env.wet > 0.4, 0);
}

// ---------------------------------------------------------------- HUD
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setHTML(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
const KIND = { hairpin: 'HAIRPIN', chicane: 'CHICANE', scurve: 'S-BENDS', offcamber: 'OFF-CAMBER', bend: 'BEND', sweeper: 'BEND' };
function hud() {
  if (G.state !== 'play' && G.state !== 'result' && G.state !== 'pause') return;
  setText('time', Math.max(0, P.timeLeft).toFixed(1));
  $('time').classList.toggle('low', P.timeLeft < 8 && G.state === 'play');
  setText('score', P.score.toLocaleString());
  setText('combo', P.combo > 1 ? 'COMBO x' + Math.min(10, P.combo) : '');
  setText('spd', String(Math.round(P.v * 3.6)));
  const i = P.stage, pr = clamp((P.s - T.B[i]) / STAGES[i].len, 0, 1) * 100;
  $('progFill').style.width = pr + '%'; $('progCar').style.left = pr + '%';
  $('nitroFill').style.width = (P.nitro * 100).toFixed(0) + '%';
  $('nitroBar').classList.toggle('on', P.boosting);
  $('nitroBar').classList.toggle('ready', P.nitro > 0.25);
  // next real corner within ~3 s
  let warn = '';
  for (let j = P.cornerI; j < Math.min(T.corners.length, P.cornerI + 4); j++) {
    const c = T.corners[j], d = c.s0 - P.s;
    if (d < -5 || d > Math.max(140, P.v * 3)) continue;
    if (!c.sign || c.R > 260) continue;
    const tight = c.kind === 'hairpin' || c.R < 90, label = KIND[c.kind] + (c.kind === 'bend' && c.R < 110 ? ' SHARP' : '');
    warn = `<span class="${tight ? 'hot' : ''}">${c.d < 0 ? '&#9664;&#9664; ' : ''}${label}${c.d > 0 ? ' &#9654;&#9654;' : ''}</span><small>${Math.max(0, Math.round(d))} m</small>`;
    break;
  }
  setHTML('cornerWarn', G.state === 'play' ? warn : '');
  setText('driftTag', P.drift ? 'DRIFT ' + (P.driftCharge > 0.2 ? 'BOOST ' + Math.round(Math.min(1, P.driftCharge / 0.8) * 100) + '%' : '') : '');
}

// ---------------------------------------------------------------- loop
let last = performance.now();
const ftRing = new Float32Array(240); let ftI = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (!P) return;
  const t0 = performance.now();
  if (G.state !== 'pause') {
    if (slowmo > 0) { slowmo -= dt; dt *= 1 - 0.65 * Math.max(0, slowmo / 0.55); }
    step(dt);
  }
  const t1 = performance.now();
  snd.engine(P.v, VMAX, P.boosting, G.state === 'play' || G.state === 'result', env.wet > 0.4);
  render(dt);
  const t2 = performance.now();
  if (t2 - t0 > 40) G.spikes.push({ s: Math.round(P.s), step: +(t1 - t0).toFixed(1), render: +(t2 - t1).toFixed(1), progs: renderer.info.programs.length });
  hud();
  ftRing[ftI++ % ftRing.length] = performance.now() - t0;
}

// headless helpers
G.start = (i, seed) => { G.headless = true; startRun(i, { seed }); return G.state; };
G.fast = (sec, dt = 1 / 60) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { step(dt); if (G.state === 'result' && G.result) break; } return G.state; };
G.render = () => render(1 / 60);
G.botInput = () => botInput();
G.frameTimes = (n = 30) => { const o = []; for (let i = Math.max(0, ftI - n); i < ftI; i++) o.push(ftRing[i % ftRing.length]); return o; };
G.info = () => {
  let objs = 0; scene.traverse(() => objs++);
  return { geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, objs, chunks: W.chunks.size,
    cars: traffic.cars.length, pooled: traffic.pooled(), buildMsMax: +W.buildMax.toFixed(1), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 };
};
Object.defineProperty(G, 'P', { get: () => P });
Object.defineProperty(G, 'traffic', { get: () => traffic });

// ---------------------------------------------------------------- boot
const startAt = clamp((+Q.get('stage') || 0) - 1, 0, STAGES.length - 1);
if (Q.has('title')) { startRun(Q.has('stage') ? startAt : 0, { attract: true }); G.state = 'title'; showOnly('title'); }
else if (Q.has('select')) { startRun(0, { attract: true }); openSelect(); }
else startRun(Q.has('stage') ? startAt : Math.min(save.last || 0, save.unlocked - 1), { seed: Q.has('seed') ? +Q.get('seed') : undefined });
requestAnimationFrame(frame);
