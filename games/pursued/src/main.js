// PURSUED - game flow: title -> intro jolt -> the chase -> caught -> results -> run again.
import * as THREE from 'three';
import { createStage, params } from './stage.js';
import { Monster } from './monster.js';
import { Doors } from './doors.js';
import { Player } from './player.js';
import { Hunter } from './ai.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { insideZone, CURB } from './world.js';
import { F_VAULT, F_DUCK } from './nav.js';
import { VAULT, LOW } from './collide.js';

const $ = (id) => document.getElementById(id);
const msg = t => { const e = $('loadmsg'); if (e) e.textContent = t; };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touchdev');

// ---------------- save ----------------
const KEY = 'pd.pursued';
let save = { best: 0, bestScore: 0, bestDist: 0, runs: 0, muted: false, quality: 'high' };
try { save = { ...save, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) {}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };

// ---------------- build ----------------
const stage = await createStage(msg);
const { scene, camera, W, nav, props } = stage;
const monster = new Monster(scene);
const doors = new Doors(scene, W, props);
const player = new Player(W, doors);
const hunter = new Hunter(stage, monster, player, doors);
const sound = new Sound(); sound.muted = save.muted;
const input = new Input(stage.renderer.domElement);
const ground = (x, z, y) => W.statics.groundAt(x, z, y);

// ---------------- game state ----------------
const G = {
  state: 'loading', t: 0, time: 0, level: 0, introT: 0, caughtT: 0, cause: '', noises: [], fear: 0, lastStumble: -9, lastSlowVault: -9,
  lightning: 0, nextLightning: 20, flash: 0, still: 0, hintI: 0, hintT: 0, shake: 0, pulse: 0, spawn: null, msgT: 0,
};

// title shot: down a long street, it stands far off under a lamp, twitching
const titleSpot = (() => {
  const z = -29, x0 = -60;
  return { cam: new THREE.Vector3(x0, 1.65, z + 1.2), look: new THREE.Vector3(x0 + 20, 1.6, z), mon: new THREE.Vector3(x0 + 24, 0, z - 1.6) };
})();
function placeTitle() {
  hunter.reset(titleSpot.mon.x, 0, titleSpot.mon.z, -Math.PI / 2);
  hunter.mode = 'idle';
  Object.assign(monster.st, { crawl: 0, rear: 0.4, jaw: 0.1, speed: 0, stop: true, look: titleSpot.cam, twitch: 1.6, scream: 0, grab: 0, reach: 0, loom: 0 });
  hunter.syncBody(0, 0);
  monster.st.look = camera.position; monster.st.stop = true; monster.st.rear = 0.5;
}

// ---------------- spawning a run ----------------
function pickSpawn() {
  const list = W.spawns.filter(s => s.where === 'street' || s.where === 'alley');
  for (let tries = 0; tries < 80; tries++) {
    const s = list[Math.floor(Math.random() * list.length)];
    const y = ground(s.x, s.z, 1);
    const pn = nav.nodeAt(s.x, y, s.z, 3); if (pn < 0) continue;
    const back = 13 + Math.random() * 2;
    const mx = s.x - s.dx * back, mz = s.z - s.dz * back;
    const mn = nav.nodeAt(mx, ground(mx, mz, 1), mz, 3); if (mn < 0) continue;
    const res = nav.path(mn, pn, {});
    if (!res || !res.complete || res.cost > back + 6) continue;
    // and somewhere to run to
    const ax = s.x + s.dx * 10, az = s.z + s.dz * 10;
    if (nav.nodeAt(ax, y, az, 2) < 0) continue;
    // never open a run facing into a dead end
    if (tries < 60 && W.deadEnds.some(d => Math.hypot(s.x - d.x, s.z - d.z) < 22)) continue;
    const bx = s.x + s.dx * 20, bz = s.z + s.dz * 20;
    if (tries < 60 && nav.nodeAt(bx, y, bz, 2.5) < 0) continue;
    const mp = new THREE.Vector3(); nav.pos(mn, mp);
    const pp = new THREE.Vector3(); nav.pos(pn, pp);
    return { p: pp, m: mp, dx: s.dx, dz: s.dz };
  }
  return { p: new THREE.Vector3(0, 0, -29), m: new THREE.Vector3(-14, 0, -29), dx: 1, dz: 0 };
}

function startRun(skipIntro = params.has('nointro')) {
  props.resetAll(); doors.resetAll();
  const sp = G.spawn = pickSpawn();
  player.reset(sp.p.x, sp.p.y, sp.p.z, Math.atan2(-sp.dx, -sp.dz));
  player.caught = false;
  hunter.reset(sp.m.x, sp.m.y, sp.m.z, Math.atan2(sp.p.x - sp.m.x, sp.p.z - sp.m.z));
  for (const k in monster.w) monster.w[k] = 0;
  for (const L of monster.limbs) L.init = false;
  Object.assign(G, { time: 0, level: 0, introT: skipIntro ? 2.6 : 0, caughtT: 0, cause: '', fear: 0, still: 0, lastStumble: -9, lastSlowVault: -9, lastAmbush: -99, nextLightning: 18 + Math.random() * 20, hintI: 0, hintT: 0, shake: 0, msgT: 0, _introPrev: skipIntro ? 2.6 : 0 });
  G.state = 'intro';
  showPanel(null);
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  player.frozen = true;
  input.clear();
  save.runs++; persist();
}

// ---------------- UI ----------------
function showPanel(id) {
  for (const p of ['title', 'pause', 'results']) $(p).classList.toggle('hidden', p !== id);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function bigMsg(text, dur = 1.2) { const m = $('msg'); m.textContent = text; m.style.opacity = 1; G.msgT = dur; }
function hint(text) { const h = $('hint'); h.textContent = text; h.style.opacity = text ? 1 : 0; }
function refreshTitle() {
  $('best').textContent = save.best > 0 ? `BEST  ${fmt(save.best)}   ·   ${save.bestScore} pts` : '';
  $('snd').textContent = 'SOUND: ' + (save.muted ? 'OFF' : 'ON');
  $('qual').textContent = 'QUALITY: ' + (save.quality === 'low' ? 'LOW' : 'HIGH');
}
function toTitle() {
  G.state = 'title'; showPanel('title'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  placeTitle(); refreshTitle(); input.unlock();
}
$('play').onclick = () => { sound.init(); sound.ui(); if (!isTouch) input.lock(); startRun(); };
// tap or click anywhere on the title (outside the option buttons) starts the run
$('title').addEventListener('click', e => { if (G.state === 'title' && !e.target.closest('button')) $('play').click(); });
$('retry').onclick = () => { sound.init(); if (!isTouch) input.lock(); startRun(); };
$('rmenu').onclick = () => toTitle();
$('menu').onclick = () => toTitle();
$('restart').onclick = () => { if (!isTouch) input.lock(); startRun(); };
$('resume').onclick = () => { G.state = G.paused || 'play'; showPanel(null); if (!isTouch) input.lock(); };
$('tpause').onclick = () => pause();
$('snd').onclick = () => { save.muted = !save.muted; sound.setMuted(save.muted); persist(); refreshTitle(); };
$('qual').onclick = () => { save.quality = save.quality === 'low' ? 'high' : 'low'; persist(); location.reload(); };
input.onLock = (locked) => { if (!locked && (G.state === 'play' || G.state === 'intro') && !isTouch && !window.__G.bot) pause(); };
function pause() { if (G.state !== 'play' && G.state !== 'intro') return; G.paused = G.state; G.state = 'paused'; showPanel('pause'); }
addEventListener('keydown', e => {
  if (e.code === 'KeyM') { save.muted = !save.muted; sound.setMuted(save.muted); persist(); refreshTitle(); }
  if (G.state === 'results' && (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); sound.init(); if (!isTouch) input.lock(); startRun(); }
  if (G.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('play').click(); }
  if (e.code === 'Escape' && G.state === 'paused') { }
  if (e.code === 'KeyP' && (G.state === 'play' || G.state === 'intro')) { input.unlock(); pause(); }
});
// clicking the canvas during play re-grabs the mouse
stage.renderer.domElement.addEventListener('click', () => { if ((G.state === 'play' || G.state === 'intro') && !isTouch && !input.locked) input.lock(); });

// ---------------- sound / noise helpers ----------------
function noise(pos, r) { G.noises.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), r }); }
function surfaceAt(p) {
  let s = 'street';
  if (insideZone(W, p.x, p.y + 0.5, p.z)) s = 'indoor';
  W.statics.query(p.x - 0.1, p.z - 0.1, p.x + 0.1, p.z + 0.1, b => { if (Math.abs(b.y1 - p.y) < 0.06) { if (b.fire) s = 'metal'; else if (b.stair || b.stoop) s = 'indoor'; } });
  return s;
}

// ---------------- the intro jolt ----------------
function updateIntro(dt) {
  const T = G.introT += dt;
  const inp = input.read();
  if (T > 0.4 && T < 2.2 && (inp.jump || inp.shove || inp.use)) G.introT = 2.2;
  player.frozen = true;
  // the camera is pulled round to look back
  let back = 0;
  if (T > 0.65 && T < 2.3) back = clamp((T - 0.65) / 0.35, 0, 1);
  if (T >= 2.3) back = clamp(1 - (T - 2.3) / 0.22, 0, 1);
  player.update(dt, G.t, { mx: 0, mz: 0, sprint: false, jump: false, slide: false, slideHeld: false, back: false, lookDX: 0, lookDY: 0 });
  player.back = back;
  { let a = Math.atan2(-(hunter.pos.x - player.pos.x), -(hunter.pos.z - player.pos.z)) - player.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); if (a < 0) a += Math.PI * 2; player.backYaw = a; }
  // the monster: crouched in the dark, then it rears up and screams
  hunter.mode = 'intro';
  hunter.syncBody(dt, G.t);
  hunter.dist = Math.hypot(player.pos.x - hunter.pos.x, player.pos.z - hunter.pos.z);
  const st = monster.st;
  st.look = (G._pl || (G._pl = new THREE.Vector3())).set(player.pos.x, player.camY, player.pos.z);
  if (T < 0.85) Object.assign(st, { crawl: 1, rear: 0, scream: 0, jaw: 0.2, speed: 0, stop: true, loom: 0 });
  else if (T < 2.35) Object.assign(st, { crawl: 0, rear: 1, scream: 1, jaw: 1, stop: false });
  else Object.assign(st, { crawl: 1, rear: 0, scream: 0, jaw: 0.6, stop: false });
  if (G._introPrev < 0.55 && T >= 0.55) { sound.prop('metal', hunter.pos.clone().setY(1), 2); sound.clicks(6); }
  if (G._introPrev < 0.88 && T >= 0.88) { lightning(1.2); sound.screech(1.2, 1.5); sound.stinger(1); player.shake = 0.7; }
  if (G._introPrev < 2.3 && T >= 2.3) { bigMsg('RUN', 1.4); sound.whoosh(); }
  G._introPrev = T;
  if (T >= 2.6) {
    G.state = 'play'; player.frozen = false; player.back = 0; player.backYaw = null;
    hunter.setMode('chase'); hunter.lastSeen = 0; hunter.burstT = 0.5; hunter.burstCD = 3.5; hunter.lkp.copy(player.pos);
    if (save.runs <= 3) G.hintI = 1;
    G._introPrev = -1;
  }
}

// ---------------- lightning ----------------
function lightning(k = 1) { G.lightning = 0.55 * k; sound.thunder(0.5 + Math.random() * 1.6, 0.6 + 0.4 * k); }
function updateLightning(dt) {
  if (G.lightning > 0) {
    G.lightning -= dt;
    const ph = G.lightning;
    const f = (ph > 0.42 ? 1 : ph > 0.33 ? 0.15 : ph > 0.22 ? 0.85 : ph > 0.1 ? 0.3 : 0) * (G.lightK || 1);
    stage.hemi.intensity = 0.34 + f * 3.2;
    stage.hemi.color.setRGB(0.45 + f * 0.4, 0.5 + f * 0.45, 0.62 + f * 0.4);
    scene.fog.color.setRGB(0.026 + f * 0.09, 0.03 + f * 0.1, 0.038 + f * 0.12);
  } else { stage.hemi.intensity = 0.34; stage.hemi.color.setHex(0x3a4658); scene.fog.color.setRGB(0.026, 0.03, 0.038); }
}

// ---------------- context prompts ----------------
const PK = isTouch ? { vault: 'VAULT', climb: 'VAULT', slam: 'DOOR', open: 'DOOR', shove: 'SHOVE', slide: 'SLIDE' } : { vault: 'SPACE', climb: 'SPACE', slam: 'E', open: 'E', shove: 'CLICK', slide: 'CTRL' };
function nearestShove() {
  let best = null, bd = 2.4;
  const fy = player.yaw;
  props.near(player.pos.x, player.pos.z, 2.4, (p, d) => {
    if (d > bd || Math.abs(p.pos.y - player.pos.y - 0.5) > 1.4) return;
    const a = Math.atan2(-(p.pos.x - player.pos.x), -(p.pos.z - player.pos.z));
    let da = a - fy; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 2.0) return;
    if (props.upright(p) < 0.6 && p.T.mass > 6) return;
    bd = d; best = p;
  });
  return best;
}
function prompts() {
  if (G.state !== 'play') { $('prompt').textContent = ''; return; }
  let txt = '';
  const f = player.forward();
  const d = doors.nearest(player.pos, player.yaw, 2.4);
  if (!txt && d) txt = Math.abs(d.ang) > 0.4 ? `${PK.slam}  ·  SLAM DOOR` : `${PK.open}  ·  OPEN`;
  if (false) {
    // a low barrier ahead (ducking is automatic now)
    let low = false;
    W.statics.query(player.pos.x + f.x * 1.2 - 0.3, player.pos.z + f.z * 1.2 - 0.3, player.pos.x + f.x * 1.2 + 0.3, player.pos.z + f.z * 1.2 + 0.3, b => { if (b.k === LOW && b.y0 > player.pos.y + 0.6 && b.y0 < player.pos.y + 1.6) low = true; });
    if (low && player.crouch < 0.5) txt = `${PK.slide}  ·  SLIDE UNDER`;
  }
  if (!txt && nearestShove()) txt = `${PK.shove}  ·  SHOVE IT OVER`;
  if (!txt && G.lockedNear > 0) txt = 'LOCKED';
  $('prompt').textContent = txt;
}
const HINTS = isTouch
  ? ['', 'Push the stick to the rim (or SPRINT) to sprint', 'Run straight at fences and cars: you go over', 'Hold LOOK BACK to see it', 'Slam doors behind you. Shove bins into its path.']
  : ['', 'Hold SHIFT to sprint', 'Run straight at fences and cars: you go over', 'Hold Q (or middle mouse) to look back', 'E slams doors behind you  ·  CLICK shoves bins into its path'];

// ---------------- the chase ----------------
function updatePlay(dt) {
  const inp = input.read();
  G.time += dt;
  G.level = Math.min(8, G.time / 30);
  player.update(dt, G.t, inp);
  for (const e of player.events) {
    if (e.type === 'step') sound.step(player.surface, e.speed);
    else if (e.type === 'land') { sound.land(e.h || 0.5); if ((e.h || 0) > 1) noise(player.pos, 10); }
    else if (e.type === 'vault') { sound.grunt(e.slow ? 1.4 : 0.8); sound.rattle(e.fence === 'chain' ? 'chain' : e.fence === 'car' ? 'car' : e.fence === 'dumpster' ? 'dumpster' : 'wood', player.pos.clone().setY(player.pos.y + 1)); noise(player.pos, e.fence === 'chain' ? 18 : 12); if (e.slow) G.lastSlowVault = G.time; }
    else if (e.type === 'stumble') { sound.grunt(1.5); sound.land(1); G.lastStumble = G.time; G.stumbleWhy = e.why; noise(player.pos, 14); }
    else if (e.type === 'doorOpen') { sound.door('open', e.pos); noise(e.pos, e.hard ? 14 : 8); }
    else if (e.type === 'jump') sound.grunt(0.4);
    else if (e.type === 'slide') { sound.whoosh(); noise(player.pos, 8); }
  }
  // E: slam / open the nearest door
  G.lockedNear = Math.max(0, (G.lockedNear || 0) - dt);
  if (inp.use) {
    const d = doors.nearest(player.pos, player.yaw, 2.6);
    if (d) {
      if (Math.abs(d.ang) > 0.4) {
        // slam only if we are not standing in its swing
        const inSwing = Math.hypot(player.pos.x - d.hx, player.pos.z - d.hz) < d.w + 0.2 && sideOf(d) * Math.sign(d.ang) < 0;
        doors.slam(d, player.pos); if (inSwing) d.target = d.ang * 0.4;
      } else doors.open(d, player.pos);
    } else if (W.doors.some(x => x.locked)) G.lockedNear = 1;
  }
  // click: shove something over into your wake
  if (inp.shove) {
    const p = nearestShove();
    if (p) {
      const away = new THREE.Vector3(p.pos.x - player.pos.x, 0, p.pos.z - player.pos.z).normalize();
      const back = player.forward().multiplyScalar(-1);
      const dir = away.multiplyScalar(0.55).add(back.multiplyScalar(0.75)).normalize();
      const fp = props.footprint(p);
      props.impulse(p, dir.multiplyScalar(p.T.mass * 4.2).setY(p.T.mass * 0.8), p.pos.clone().setY(p.pos.y + fp.ey * 0.75));
      sound.whoosh(); sound.grunt(0.5); noise(p.pos, 16);
      player.shake = Math.max(player.shake, 0.15);
    } else sound.whoosh();
  }
  // running into things knocks them over
  props.near(player.pos.x, player.pos.z, 0.35, (p, d) => {
    if (Math.abs(p.pos.y - player.pos.y - 0.4) > 1.2) return;
    const fp = props.footprint(p), r = Math.min(fp.ex, fp.ez) + 0.3;
    if (d > r) return;
    const sp = Math.hypot(player.vel.x, player.vel.z);
    const dir = new THREE.Vector3(p.pos.x - player.pos.x, 0, p.pos.z - player.pos.z).normalize();
    const head = (player.vel.x * dir.x + player.vel.z * dir.z) / Math.max(0.1, sp);
    if (sp > 1 && head > 0.3) {
      props.impulse(p, dir.clone().multiplyScalar(p.T.mass * sp * 0.55).setY(p.T.mass * 0.4), p.pos.clone().setY(p.pos.y + fp.ey * 0.6));
      if (props.upright(p) > 0.7 && p.T.mass >= 10 && sp > 7 && head > 0.92 && player.stumble <= 0) { player.stumble = 0.22; player.stumbleKind = 'prop'; player.shake = 0.4; sound.grunt(1.3); G.lastStumble = G.time; G.stumbleWhy = 'ran straight into a ' + (p.type === 'shelf' ? 'shelf' : p.type === 'bin' ? 'bin' : p.type === 'trolley' ? 'trolley' : 'cart'); }
      else { player.vel.x *= 0.85; player.vel.z *= 0.85; }
    }
    // keep out of it a little
    const pen = r - d; if (pen > 0) { player.pos.x -= dir.x * pen * 0.6; player.pos.z -= dir.z * pen * 0.6; }
  });
  doors.update(dt);
  props.update(dt, G.t); props.separate();
  for (const e of props.events) if (e.speed > 1.8) { sound.prop(e.sound, e.pos, e.speed / 3); noise(e.pos, 9 + Math.min(14, e.speed * 2.5)); }
  props.events.length = 0;
  for (const e of doors.events) {
    if (e.type === 'slam') { sound.door('slam', e.pos); noise(e.pos, 28); }
    else if (e.type === 'pound') { sound.door('pound', e.pos); const dd = e.pos.distanceTo(player.pos); G.shake = Math.max(G.shake, clamp(1 - dd / 12, 0, 0.8)); }
    else if (e.type === 'break') { sound.door('break', e.pos); sound.screech(0.6, 0.6); G.shake = Math.max(G.shake, clamp(1 - e.pos.distanceTo(player.pos) / 14, 0, 1)); }
  }
  doors.events.length = 0;
  // the thing
  hunter.update(dt, G.t, G.level, G.noises);
  G.noises.length = 0;
  for (const e of hunter.events) {
    if (e.type === 'mode' && e.mode === 'scream') { sound.screech(1, 1.1); sound.stinger(0.8); }
    else if (e.type === 'mode' && e.mode === 'search') sound.clicks(8);
    else if (e.type === 'burst') { sound.clicks(5); if (Math.random() < 0.35) sound.screech(0.5, 0.5); }
    else if (e.type === 'vault') sound.rattle('chain', e.pos.clone().setY(e.pos.y + 1));
    else if (e.type === 'trip') { sound.prop(e.p.sound, e.p.pos, 3); sound.screech(0.45, 0.45); }
    else if (e.type === 'swat') sound.prop(e.p.sound, e.p.pos, 2.5);
    else if (e.type === 'heard') sound.clicks(5);
    else if (e.type === 'ambush') { sound.screech(0.9, 0.8); sound.clicks(6); sound.stinger(0.6); G.shake = Math.max(G.shake, 0.35); G.ambushT = 1.2; G.lastAmbush = G.time; }
    else if (e.type === 'catch' && !G.god) { startCaught(); break; }
    else if (e.type === 'catch' && G.god && hunter.mode !== 'stumble') { G.godCatches = (G.godCatches || 0) + 1; hunter.stumbleDur = 3; hunter.setMode('stumble'); }
  }
  hunter.events.length = 0;
  // you got away from it, then it saw you again
  if (hunter.mode === 'search' && hunter.seeing) { hunter.setMode('scream'); }
  if (hunter.mode === 'hunt' && hunter.seeing) hunter.setMode('scream');
  // standing still is a mistake too
  const sp = Math.hypot(player.vel.x, player.vel.z);
  G.still = sp < 1 ? G.still + dt : 0;
  // surface & indoors
  player.surface = surfaceAt(player.pos);
  stage.indoor = !!insideZone(W, player.pos.x, player.pos.y + 0.5, player.pos.z);
  // lightning now and then
  G.nextLightning -= dt;
  if (G.nextLightning <= 0) { lightning(0.8 + Math.random() * 0.5); G.nextLightning = 25 + Math.random() * 35; }
  // hints for the first runs
  if (G.hintI > 0) {
    G.hintT += dt;
    if (G.hintT > 3.2) { G.hintI++; G.hintT = 0; }
    hint(HINTS[G.hintI] || ''); if (G.hintI >= HINTS.length) G.hintI = 0;
  } else hint('');
}
function sideOf(d) { const tp = doors.tip(d), bx = tp.x - d.hx, bz = tp.z - d.hz, L = Math.hypot(bx, bz); return Math.sign((player.pos.x - d.hx) * (-bz / L) + (player.pos.z - d.hz) * (bx / L)) || 1; }

// ---------------- caught ----------------
function startCaught() {
  G.state = 'caught'; G.caughtT = 0; player.caught = true; player.frozen = true;
  hunter.setMode('grab'); hunter.events.length = 0;
  G.cause = causeOfDeath();
  sound.jumpscare();
  G.hintI = 0; hint(''); $('prompt').textContent = '';
}
function causeOfDeath() {
  if (G.time - G.lastStumble < 2.5) return 'You ' + (G.stumbleWhy || 'stumbled') + '.';
  if (G.time - G.lastSlowVault < 3) return 'You scrambled over with no breath left.';
  for (const d of W.deadEnds) if (Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 9) return 'Dead end.';
  if (G.still > 1.5) return 'You stopped running.';
  if (player.stamina < 0.05) return 'You ran out of breath.';
  if (stage.indoor) return 'It followed you inside.';
  if (G.time < 8) return 'It was on you from the start.';
  if (G.time - G.lastAmbush < 7) return 'It cut you off.';
  return ['It was faster.', 'It knew where you were going.'][Math.floor(Math.random() * 2)];
}
function updateCaught(dt) {
  const T = G.caughtT += dt;
  player.update(dt, G.t, { mx: 0, mz: 0, sprint: false, jump: false, slide: false, slideHeld: false, back: false, lookDX: 0, lookDY: 0 });
  player.back *= 0.8;
  // it closes the last metre, rears up over you and the head opens
  const st = monster.st;
  const toP = new THREE.Vector3(player.pos.x - hunter.pos.x, 0, player.pos.z - hunter.pos.z);
  const d = toP.length();
  const want = T < 0.9 ? 1.45 : 1.3;   // the head is ~0.9 m ahead of its feet when it folds down: end with the camera in the mouth
  if (d > want) hunter.pos.addScaledVector(toP.normalize(), Math.min(d - want, dt * 6));
  hunter.yaw = Math.atan2(player.pos.x - hunter.pos.x, player.pos.z - hunter.pos.z);
  hunter.speed = 0; hunter.vel.set(0, 0, 0);
  hunter.syncBody(dt, G.t);
  Object.assign(st, { crawl: 0, rear: 1, grab: 1, jaw: T > 0.15 ? 1 : 0.5, reach: 1, stop: false, scream: T > 0.3 && T < 1.0 ? 1 : 0, loom: T > 0.28 ? 1 : 0 });
  st.look = (G._pl || (G._pl = new THREE.Vector3())).set(player.pos.x, player.camY, player.pos.z);
  // the camera is wrenched round to face it and pulled up toward the mouth
  const head = monster.mouthWorld;
  const dx = head.x - player.pos.x, dz = head.z - player.pos.z, dy = head.y - player.camY;
  const yawT = Math.atan2(-dx, -dz), pitchT = Math.atan2(dy, Math.hypot(dx, dz));
  let dyaw = yawT - player.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const k = 1 - Math.exp(-dt * 14);
  player.yaw += dyaw * k; player.pitch += (pitchT - player.pitch) * k;
  if (T > 0.35) player.camY += (player.pos.y + 1.5 - player.camY) * (1 - Math.exp(-dt * 3));   // knees go: you sink as it folds down over you
  player.shake = 0.6 + (T > 0.3 ? 0.9 : 0);
  if (T > 1.75) G.black = clamp((T - 1.75) / 0.25, 0, 1);
  if (T > 2.4) showResults();
}
function showResults() {
  G.state = 'results'; G.black = 1;
  const score = Math.floor(G.time * 10 + player.dist);
  const newBest = G.time > save.best;
  if (newBest) save.best = G.time;
  if (score > save.bestScore) save.bestScore = score;
  if (player.dist > save.bestDist) save.bestDist = player.dist;
  persist();
  $('rtime').textContent = fmt(G.time); $('rdist').textContent = Math.round(player.dist) + ' m'; $('rscore').textContent = score;
  $('rbest').textContent = newBest ? 'NEW BEST TIME' : `best  ${fmt(save.best)}  ·  ${save.bestScore} pts`;
  $('rcause').textContent = G.cause;
  showPanel('results'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  input.unlock();
}

// ---------------- fear, post, camera ----------------
function updateFeel(dt) {
  const d = hunter.dist ?? 99;
  let f = clamp(1 - (d - 2.5) / 24, 0, 1);
  if (hunter.seeing) f = Math.min(1, f + 0.15);
  if (G.state === 'intro') f = G.introT > 0.85 ? 0.9 : 0.3;
  if (G.state === 'caught') f = 1;
  if (G.state === 'title') f = 0.15;
  G.fear += (f - G.fear) * (1 - Math.exp(-dt * (f > G.fear ? 4 : 0.8)));
  const close = clamp((10 - d) / 8, 0, 1) * (G.state === 'play' || G.state === 'caught' ? 1 : 0);
  G.close = close;
  G.shake = Math.max(0, G.shake - dt * 2);
  const u = stage.grade.uniforms;
  u.uFear.value = G.fear * 0.85;
  u.uCA.value = Math.max(close, G.state === 'caught' ? Math.min(1, G.caughtT * 2) : 0, G.state === 'intro' && G.introT > 0.88 && G.introT < 2.3 ? 0.35 : 0);
  u.uTired.value = G.state === 'play' ? 1 - player.stamina : 0;
  u.uRed.value = G.state === 'caught' ? Math.min(1, G.caughtT * 1.5) : 0;
  // heartbeat pulse in the image
  const bpm = 72 + G.fear * 105;
  G.pulse = (G.pulse + dt * bpm / 60) % 1;
  u.uPulse.value = G.fear > 0.4 ? Math.exp(-G.pulse * 10) * (G.fear - 0.4) * 2 : 0;
  u.uFlash.value = G.state === 'caught' ? (G.caughtT > 0.32 && G.caughtT < 0.42 ? 0.6 : 0) : Math.max(0, G.lightning > 0.42 ? 0.12 : 0);
  u.uBlack.value = G.state === 'results' ? 1 : (G.black || 0);
  if (G.state !== 'caught' && G.state !== 'results') G.black = 0;
  danger(d, close);
  return close * close * 0.8 + G.shake;
}

// red edge on the side it is coming from, beating with your heart
const dangerEl = $('danger');
function danger(d, close) {
  if (!dangerEl) return;
  if (G.state !== 'play') { dangerEl.style.opacity = 0; return; }
  const near = clamp((16 - d) / 13, 0, 1);
  let a = Math.atan2(-(hunter.pos.x - player.pos.x), -(hunter.pos.z - player.pos.z)) - player.yaw;
  a = Math.atan2(Math.sin(a), Math.cos(a));         // 0 = dead ahead, +-PI = behind
  const x = 50 - Math.sin(a) * 62, y = 50 - Math.cos(a) * 62;
  dangerEl.style.background = `radial-gradient(ellipse 75% 75% at ${x.toFixed(0)}% ${y.toFixed(0)}%, rgba(170,8,4,.85), rgba(120,0,0,.25) 45%, transparent 70%)`;
  const beat = Math.exp(-G.pulse * 7);
  G.ambushT = Math.max(0, (G.ambushT || 0) - 1 / 60);
  dangerEl.style.opacity = Math.min(1, near * (0.35 + 0.45 * beat) + G.ambushT * 0.5).toFixed(3);
}

// ---------------- the frame ----------------
const clock = { last: performance.now() };
function step(dt) {
  G.t += dt;
  if (G.state === 'intro') updateIntro(dt);
  else if (G.state === 'play') updatePlay(dt);
  else if (G.state === 'caught') updateCaught(dt);
  if (G.state === 'title') {
    // slow drift down the street
    const k = (G.t * 0.02) % 1;
    camera.position.copy(titleSpot.cam).add(new THREE.Vector3(k * 6, Math.sin(G.t * 0.5) * 0.03, 0));
    camera.lookAt(titleSpot.look.x + k * 6, titleSpot.look.y + Math.sin(G.t * 0.3) * 0.05, titleSpot.look.z + Math.sin(G.t * 0.2) * 0.4);
    camera.fov = 60; camera.updateProjectionMatrix();
    monster.st.look = camera.position;
    G.nextLightning -= dt; if (G.nextLightning <= 0) { lightning(1); G.nextLightning = 10 + Math.random() * 12; }
  }
  if (G.state !== 'paused') {
    monster.update(dt, G.t, ground);
    for (const e of monster.events) if (G.state === 'play' || G.state === 'intro') sound.mStep(e.pos, monster.w.crawl > 0.5, hunter.speed, e.arm);
    monster.events.length = 0;
  }
  updateLightning(dt);
  const shake = updateFeel(dt);
  if (G.state === 'intro' || G.state === 'play' || G.state === 'caught') player.applyCamera(camera, G.t, shake);
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) $('msg').style.opacity = 0; }
  // hud
  if (G.state === 'play') {
    $('time').textContent = fmt(G.time);
    $('dist').textContent = Math.round(player.dist) + ' m';
    const s = $('stam'); s.style.opacity = player.stamina < 0.98 ? 1 : 0.15; s.firstChild.style.width = (player.stamina * 100).toFixed(1) + '%'; s.classList.toggle('low', player.stamina < 0.2);
  }
  prompts();
  sound.update(dt, { fear: G.state === 'title' ? 0.12 : G.fear, exert: G.state === 'play' ? player.exert : 0.2, indoor: stage.indoor, alive: G.state !== 'results' && G.state !== 'title', mPos: (G.state === 'title' || G.state === 'results') ? null : hunter.pos, mMode: hunter.mode, cam: camera, mVol: 1, close: G.close || 0 });
}
function frame() {
  const now = performance.now();
  const raw = (now - clock.last) / 1000, dt = Math.min(0.05, raw); clock.last = now;
  if (G.state !== 'paused') step(dt);
  stage.render(dt, G.t, raw);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}

// ---------------- boot ----------------
placeTitle();
camera.position.copy(titleSpot.cam); camera.lookAt(titleSpot.look);
monster.update(0.016, 0, ground);
await stage.compile();
for (let i = 0; i < 30; i++) monster.update(1 / 30, i / 30, ground);
const ld = $('load'); ld.style.opacity = 0; setTimeout(() => ld.remove(), 1100);
if (params.has('play')) { startRun(); } else toTitle();
frame();

// ---------------- test hooks ----------------
window.__G = {
  G, stage, player, hunter, monster, doors, props, nav, W, sound, input, startRun, toTitle, bot: false,
  get state() { return G.state; },
  // run the simulation without rendering (fast headless logic tests)
  sim(seconds, dt = 1 / 60) { const n = Math.round(seconds / dt); for (let i = 0; i < n && G.state !== 'results'; i++) step(dt); return { state: G.state, time: G.time, dist: player.dist, mode: hunter.mode, d: hunter.dist }; },
  enableBot(on = true) { this.bot = on; input.bot = on ? botInput : null; },
};
if (params.has('bot')) window.__G.enableBot(true);

// ---------------- autopilot for tests: flee along the nav grid ----------------
const bot = { target: -1, path: null, i: 0, replan: 0, lastDoorSlam: 0 };
function botInput() {
  const out = { mx: 0, mz: 0, sprint: false, jump: false, slide: false, slideHeld: false, use: false, shove: false, back: false, lookDX: 0, lookDY: 0 };
  if (G.state !== 'play') return out;
  // the opening: like a person, just bolt straight ahead
  if (G.time < 1.8) { out.mz = 1; out.sprint = true; bot.path = null; return out; }
  bot.replan -= 1 / 60;
  const pn = nav.nodeAt(player.pos.x, player.pos.y, player.pos.z, 8);
  bot.prog = (bot.prog || 0) + 1 / 60;
  if (Math.hypot(player.vel.x, player.vel.z) > 2) bot.prog = 0;
  if (bot.prog > 1 && !player.vault) { bot.path = null; bot.replan = 0; bot.prog = 0; }
  // commit to a far target away from the thing; re-pick when reached or when the thing is in the way
  let blocked = false;
  if (bot.path) { const v = new THREE.Vector3(); nav.pos(bot.path[Math.min(bot.path.length - 1, bot.i + 6)], v); const toT = new THREE.Vector3(v.x - player.pos.x, 0, v.z - player.pos.z).normalize(); const toM = new THREE.Vector3(hunter.pos.x - player.pos.x, 0, hunter.pos.z - player.pos.z); blocked = toM.length() < 10 && toT.dot(toM.normalize()) > 0.5; }
  if (bot.replan <= 0 && (!bot.path || bot.i >= bot.path.length - 4 || blocked)) {
    bot.replan = 0.8;
    let best = null, bs = -1e9;
    for (let k = 0; k < 30; k++) {
      const n = nav.randomNear(player.pos.x, player.pos.y, player.pos.z, 55);
      if (n < 0) continue;
      const v = new THREE.Vector3(); nav.pos(n, v);
      const dp = v.distanceTo(player.pos); if (dp < 25) continue;
      const dm = v.distanceTo(hunter.pos);
      const away = ((v.x - player.pos.x) * (player.pos.x - hunter.pos.x) + (v.z - player.pos.z) * (player.pos.z - hunter.pos.z)) / (dp * Math.max(1, hunter.dist));
      const sc = dm - dp * 0.4 + away * 30;
      if (sc > bs) { bs = sc; best = n; }
    }
    if (best !== null) { const r = nav.path(pn, best, { doorCost: () => 0, vaultCost: 1.5 }); if (r && r.nodes.length > 2) { bot.path = r.nodes; bot.i = 0; } }
  }
  if (!bot.path) return out;
  const v = new THREE.Vector3();
  while (bot.i < bot.path.length - 1) { nav.pos(bot.path[bot.i], v); if (Math.hypot(v.x - player.pos.x, v.z - player.pos.z) < 0.7) bot.i++; else break; }
  const look = Math.min(bot.path.length - 1, bot.i + 2);
  nav.pos(bot.path[look], v);
  const want = Math.atan2(-(v.x - player.pos.x), -(v.z - player.pos.z));
  let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  out.lookDX = -d * 0.5;
  out.mz = Math.abs(d) > 1.2 ? 0.3 : 1; out.sprint = (player.stamina > 0.2 || hunter.dist < 12) && Math.abs(d) < 0.9;
  for (let k = bot.i; k < Math.min(bot.path.length, bot.i + 3); k++) {
    const fl = nav.flagOf(bot.path[k]);
    if (fl & F_VAULT) out.jump = true;
    if (fl & F_DUCK) { out.slide = true; out.slideHeld = true; }
  }
  if (hunter.dist < 9 && Math.random() < 0.05) out.shove = true;
  const dn = doors.nearest(player.pos, player.yaw, 2.2);
  if (dn && Math.abs(dn.ang) > 0.5 && hunter.dist > 3 && G.t - bot.lastDoorSlam > 2) {
    const ahead = (dn.cx - player.pos.x) * Math.sin(-player.yaw) + (dn.cz - player.pos.z) * -Math.cos(player.yaw);
    if (ahead < -0.6) { out.use = true; bot.lastDoorSlam = G.t; }
  }
  return out;
}
