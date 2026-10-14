// SKY ACES - boot, main loop, camera, player controls, glue between game / HUD / audio / online.
import * as THREE from '../vendor/three.module.js';
import { makeRenderer, buildWorld, ARENA, groundAt } from './world.js';
import { FX } from './fx.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Online } from './online.js';
import { Brain } from './ai.js';
import { makePlane, animatePilot } from './models.js';
import { planeById, statsFor, upOf } from './meta.js';
import { clamp, damp, QS, rand } from './util.js';
import { save, persist, addMoney, MISSIONS } from './meta.js';
import * as A from './audio.js';

const canvas = document.getElementById('c');
const lowq = QS.has('lq') || (matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 500);
const renderer = makeRenderer(canvas, lowq);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 1, 14000);
const world = buildWorld(scene);
const fx = new FX(scene);
const game = new Game(scene, fx, world);
const input = new Input(canvas, save.settings);
const app = { game, input, state: 'menu', camera, renderer };
const online = new Online(app);
app.online = online;
const ui = new UI(app);
app.ui = ui;
A.setMuted(!!save.settings.mute);

// ------------------------------------------------------------------ sizing
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fx.setScale(h * renderer.getPixelRatio(), camera.projectionMatrix.elements[5]);
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ aim + camera state
const aim = { yaw: 0, pitch: 0 };
const camOff = new THREE.Vector3(0, 6, 22);
const camLook = new THREE.Vector3();
let trauma = 0, cloudFade = 0, dmgFlash = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), upW = new THREE.Vector3(0, 1, 0);
function aimFromAngles(out) { const c = Math.cos(aim.pitch); return out.set(-Math.sin(aim.yaw) * c, Math.sin(aim.pitch), -Math.cos(aim.yaw) * c); }
function anglesFromDir(d) { aim.yaw = Math.atan2(-d.x, -d.z); aim.pitch = Math.asin(clamp(d.y, -1, 1)); }
app.shake = (n) => { trauma = Math.min(1, trauma + n); };

// ------------------------------------------------------------------ starting things
function begin(cfg) {
  A.initAudio(); A.engineStart();
  game.start(cfg);
  app.state = 'play';
  input.enabled = true;
  input.lock();
  if (game.player) { anglesFromDir(game.player.fwd); camOff.set(0, 6, 24).applyQuaternion(game.player.quat); }
  ui.hud();
  if (app.bot) attachBot();
}
app.startMission = (i) => { app.lastCfg = { mode: 'mission', mission: i }; begin(app.lastCfg); };
app.startEndless = () => { app.lastCfg = { mode: 'endless' }; begin(app.lastCfg); };
app.retry = () => { if (app.lastCfg) begin(app.lastCfg); };
app.startOnline = (o) => { app.lastCfg = null; A.initAudio(); A.engineStart(); game.start({ mode: 'online', online: o }); app.state = 'play'; input.enabled = true; if (app.bot) setTimeout(attachBot, 50); };
app.endOnline = (toLobby) => { game.running = false; game.clear(); app.state = 'menu'; input.enabled = false; input.unlock(); A.engineSet(false, 0, false); A.sLockTone(0); if (!toLobby) ui.title(); };
app.onlineEnd = (res) => {
  const me = game.player;
  const table = res.table;
  const place = table.findIndex((r) => me && r[0] === me.id) + 1;
  let bonus = 0;
  if (res.teams) { const won = me && res.tk[me.team] > res.tk[1 - me.team]; bonus = won ? 600 : 200; }
  else bonus = place === 1 ? 800 : place === 2 ? 450 : place === 3 ? 300 : 150;
  const total = game.earned + bonus;
  addMoney(total);
  save.kills += game.kills; persist();
  setTimeout(() => ui.onlineResults(res, { place, bonus, earned: game.earned, total }), 1200);
};
app.quit = () => {
  if (game.mode === 'online') { online.leave(); app.endOnline(); return; }
  game.running = false; game.clear(); app.state = 'menu'; input.enabled = false; input.unlock();
  A.engineSet(false, 0, false); A.sLockTone(0);
  ui.title();
};
app.pause = (on) => {
  if (game.mode === 'online') { if (on) ui.pauseMenu(); else ui.hud(); app.paused = false; return; }
  app.paused = on;
  if (on) { input.unlock(); A.engineSet(false, 0, false); A.sLockTone(0); ui.pauseMenu(); } else ui.hud();
};
input.onUnlock = () => { if (app.state === 'play' && !app.paused && game.phase === 'live' && !app.bot) app.pause(true); };

// bot (headless tests / attract): the player's plane gets an AI brain
function attachBot() {
  if (game.player) { const b = new Brain(game.player, game); b.state = 'engage'; game.player.botBrain = b; game.player.skill = app.botSkill ?? 0.7; }
}

// ------------------------------------------------------------------ game events -> feel
game.on((type, d) => {
  if (type === 'hit') { ui.hitMarker(d.missile); A.sHit(); }
  else if (type === 'hurt') { dmgFlash = Math.min(1, dmgFlash + 0.25 + (d.dmg || 0) / 60); app.shake(0.2 + Math.min(0.4, (d.dmg || 0) / 80)); }
  else if (type === 'kill') {
    ui.feed(d);
    if (game.player && d.victim === game.player) app.shake(0.9);
    else if (game.player && d.victim.pos.distanceTo(game.player.pos) < 400) app.shake(0.35);
    if (d.by && d.by.isPlayer) ui.killConfirm(d.victim);
    if (game.mode === 'online') online.hostEvent('kill', d);
  }
  else if (type === 'streak') ui.callout(d.text, '+$' + d.bonus);
  else if (type === 'money') ui.moneyPop(d.n, d.label);
  else if (type === 'wave') ui.banner(game.mode === 'mission' ? (d.total > 1 ? 'WAVE ' + d.n + ' / ' + d.total : MISSIONS[game.cfg.mission].name.toUpperCase()) : 'WAVE ' + d.n, game.mode === 'mission' && d.n === 1 ? MISSIONS[game.cfg.mission].brief : '');
  else if (type === 'waveclear') ui.callout('WAVE ' + d.n + ' CLEARED', '');
  else if (type === 'incoming') ui.incoming = 0.3;
  else if (type === 'overheat') ui.flashWarn('GUNS OVERHEATED');
  else if (type === 'note') ui.note(d);
  else if (type === 'dodged') { if (d.target && d.target.isPlayer) ui.callout('MISSILE SHAKEN!', ''); }
  else if (type === 'turret') { if (d.by && d.by.isPlayer) ui.note('TURRET DESTROYED'); }
  else if (type === 'relayhit') { if (online.role === 'host') online.event({ type: 'hit', by: d.by.id, t: d.target.id, d: Math.round(d.dmg) }); }
  else if (type === 'localcrash') online.localCrash();
  else if (type === 'boom') { if (game.player && d.pos.distanceTo(game.player.pos) < 300 * d.size) app.shake(0.3 * d.size); }
  else if (type === 'end') {
    const r = d;
    const total = r.earned + r.bonus;
    addMoney(total);
    save.kills += r.kills;
    if (r.mode === 'mission' && r.win) { const id = MISSIONS[r.mission].id; save.done[id] = Math.max(save.done[id] || 0, r.stars); }
    if (r.mode === 'endless') { r.prevBest = save.bestWave; save.bestWave = Math.max(save.bestWave, r.wave - (r.win ? 0 : 1)); }
    persist();
    A.sJingle(r.win ? 'win' : 'lose');
    setTimeout(() => { if (game.result === r) { app.state = 'results'; input.enabled = false; input.unlock(); A.sLockTone(0); ui.results(r); } }, r.win ? 900 : 300);
  }
});

// ------------------------------------------------------------------ player control
function controlPlayer(dt) {
  const P = game.player;
  const st = input.read(dt);
  if (!P) return st;
  if (P.botBrain) {
    if (P.alive) { P.botBrain.update(dt); }
    anglesFromDir(P.fwd);
    return st;
  }
  if (!P.alive || game.phase !== 'live' || app.paused) { P.ctrl.fire = false; P.ctrl.boost = false; return st; }
  const aimDir = aimFromAngles(tmp);
  if (st.direct) {
    P.ctrl.pitch = st.pitch; P.ctrl.roll = st.roll; P.ctrl.yaw = 0;
    anglesFromDir(P.fwd);
  } else {
    aim.yaw += st.aimYaw;
    aim.pitch = clamp(aim.pitch + st.aimPitch, -1.35, 1.35);
    aimFromAngles(aimDir);
    // far outside the arena: the aim is dragged home
    const d = Math.hypot(P.pos.x, P.pos.z);
    if (d > ARENA + 450) { tmp2.set(-P.pos.x, 0, -P.pos.z).normalize(); aimDir.lerp(tmp2, Math.min(1, dt * 1.5)).normalize(); anglesFromDir(aimDir); }
    P.steer(aimDir, 1);
  }
  P.ctrl.fire = st.fire;
  P.ctrl.boost = st.boost;
  if (st.missile) {
    if (P.missiles > 0) P.ctrl.missile = true;
    else { ui.flashWarn('NO MISSILES'); A.sJingle('deny'); }
  }
  let rd = st.rollL ? -1 : st.rollR ? 1 : 0;
  if (st.rollAny) rd = P.ctrl.roll < -0.1 ? -1 : P.ctrl.roll > 0.1 ? 1 : (Math.random() < 0.5 ? -1 : 1);
  if (rd && P.barrelRoll(rd)) A.sWhoosh();
  return st;
}

// ------------------------------------------------------------------ camera
function updateCamera(dt, st) {
  const P = game.player;
  if (!P) return;
  const ud = P.model.userData;
  const size = ud.size || 1;
  const direct = st && st.direct;
  let look = direct || P.botBrain || !P.alive ? tmp.copy(P.alive ? P.fwd : tmp.copy(P.vel).normalize()) : aimFromAngles(tmp);
  if (st && st.lookBack && P.alive) look = tmp.copy(P.fwd).negate();
  const pUp = P.up(tmp2);
  const upRef = direct ? pUp.lerp(upW, 0.35).normalize() : upW;
  const speedK = clamp(P.speed / P.st.speed, 0.6, 1.8);
  const portrait = camera.aspect < 1;
  const dist = ((17 + speedK * 4) * size + (P.alive ? 0 : 30)) * (portrait ? 1.3 : 1);
  const want = new THREE.Vector3().copy(look).multiplyScalar(-dist).addScaledVector(upRef, 7 * size + (P.alive ? 0 : 12));
  camOff.x = damp(camOff.x, want.x, 9, dt); camOff.y = damp(camOff.y, want.y, 9, dt); camOff.z = damp(camOff.z, want.z, 9, dt);
  camera.position.copy(P.pos).add(camOff);
  // never under the sea / inside an island
  const gh = groundAt(camera.position.x, camera.position.z) + 3;
  if (camera.position.y < gh) camera.position.y = gh;
  camLook.copy(P.pos).addScaledVector(look, 70).addScaledVector(upRef, 3);
  camera.up.lerp(upRef, 1 - Math.exp(-6 * dt)).normalize();
  camera.lookAt(camLook);
  // shake
  if (trauma > 0) {
    const s = trauma * trauma;
    camera.rotation.x += rand(-1, 1) * 0.03 * s; camera.rotation.y += rand(-1, 1) * 0.03 * s; camera.rotation.z += rand(-1, 1) * 0.05 * s;
    trauma = Math.max(0, trauma - dt * 1.6);
  }
  // portrait phones: open the vertical FOV so the horizontal view is not a keyhole
  const fov = (camera.aspect < 1 ? 82 : 68) + (P.boosting ? 9 : 0) + (speedK - 1) * 6;
  camera.fov = damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();
  game.camPos = camera.position;
}

// attract camera on the menu: slow orbit over the harbour
let menuT = 0;
function menuCamera(dt) {
  menuT += dt * 0.05;
  camera.position.set(Math.cos(menuT) * 900 + 300, 260, Math.sin(menuT) * 900 + 300);
  camera.up.set(0, 1, 0);
  camera.lookAt(300, 140, 200);
  camera.fov = 60; camera.updateProjectionMatrix();
}

// the selected plane showing off in front of the title screen
let show = null, showId = null;
app.setShowcase = (id, panel) => {
  if (id !== showId) {
    if (show) scene.remove(show);
    show = null; showId = id;
    if (id) { show = makePlane(id, planeById(id).colors, 0xe8433a, statsFor(id, upOf(id)).barrels); scene.add(show); }
  }
  if (show) show.visible = !!id && panel === 'title';
};
function updateShowcase(dt, t) {
  if (!show || !show.visible) return;
  const asp = innerWidth / innerHeight;
  if (asp < 0.9) { show.visible = false; return; }
  const dist = 44;
  const halfH = Math.tan(camera.fov * Math.PI / 360) * dist, halfW = halfH * asp;
  const right = tmp.set(1, 0, 0).applyQuaternion(camera.quaternion), upv = tmp2.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  show.position.copy(camera.position).addScaledVector(fwd, dist).addScaledVector(right, halfW * 0.66).addScaledVector(upv, -halfH * 0.12 + Math.sin(t * 1.3) * 0.6);
  show.quaternion.copy(camera.quaternion);
  show.rotateY(1.85 + Math.sin(t * 0.4) * 0.15);
  show.rotateZ(Math.sin(t * 0.9) * 0.18);
  show.rotateX(Math.sin(t * 0.7) * 0.05);
  for (const p of show.userData.props) p.rotation.z += dt * 50;
  if (show.userData.pilot) animatePilot(show.userData.pilot, t, 0.6, Math.sin(t * 0.6) * 0.8, 0.1, 0);
}

// ------------------------------------------------------------------ loop
let last = performance.now(), fpsAcc = 0, fpsN = 0;
app.fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { app.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  const t = now / 1000;
  let st = null;
  if (app.state === 'play' || app.state === 'results') {
    if (!app.paused) {
      st = controlPlayer(dt);
      game.aim.copy(aimFromAngles(tmp));
      online.update(dt);
      game.update(dt * (game.timeScale || 1));
      fx.update(dt, game.bullets, camera);
    }
    updateCamera(dt, st);
    const P = game.player;
    if (P && app.state === 'play' && !app.paused) {
      A.engineSet(P.alive, clamp(P.speed / 220, 0, 1), P.boosting, P.model.userData.jet);
      const c = world.cloudAt(camera.position);
      cloudFade = damp(cloudFade, c, 6, dt);
      dmgFlash = Math.max(0, dmgFlash - dt * 1.5);
      ui.frame(dt, { cloud: cloudFade, dmg: dmgFlash, camera });
    }
  } else {
    menuCamera(dt);
    updateShowcase(dt, t);
    ui.tickPreview(dt, t);
    fx.update(dt, game.bullets, camera);
  }
  world.update(dt, t, camera);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ boot
app.nextMission = nextMission;
ui.title();
if (QS.get('join')) { ui.online(); online.join(QS.get('join')); }
else if (QS.has('play')) app.startMission(Math.min(MISSIONS.length - 1, Math.max(0, +QS.get('mission') || nextMission())));
else if (QS.has('endless')) app.startEndless();
// a first visit (nothing flown yet) lands straight in mission 1; ?title forces the menu
else if (!QS.has('title') && !QS.has('bot') && !Object.keys(save.done).length && !save.kills && !save.money) app.startMission(0);
// browsers keep audio suspended until a gesture: wake it on the first one
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => A.initAudio(), { capture: true });
if (QS.has('bot')) { app.bot = true; attachBot(); }

export function nextMission() { const i = MISSIONS.findIndex((m) => !save.done[m.id]); return i < 0 ? MISSIONS.length - 1 : i; }

// ------------------------------------------------------------------ test hooks
window.__G = {
  app, game, online, input, ui, save, fx, world, camera,
  get state() { return app.state; },
  get fps() { return app.fps; },
  aim,
  startMission: app.startMission, startEndless: app.startEndless, retry: app.retry, quit: app.quit,
  bot(on = true, skill = 0.7) { app.bot = on; app.botSkill = skill; if (on) attachBot(); else if (game.player) game.player.botBrain = null; },
  addMoney, persist,
  /** fast-forward the simulation without rendering (headless balance tests) */
  sim(seconds, dt = 1 / 30) { const n = Math.round(seconds / dt); for (let i = 0; i < n && app.state === 'play'; i++) { const st = controlPlayer(dt); game.aim.copy(aimFromAngles(tmp)); online.update(dt); game.update(dt); fx.update(dt, game.bullets, camera); } return game.t; },
};
