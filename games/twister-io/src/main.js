// TWISTER.IO: boot, renderer, camera, input, the fixed 60 Hz loop, round
// flow (title attract -> play -> results), meta progression and test hooks.
import * as THREE from 'three';
import { Game, SKINS, PERKS, TIER_MASS, TIER_COLORS, ROUND_TIME, CHASE_LIMIT, CHASE_MEDALS } from './game.js';
import { S, types } from './world.js';
import { Particles } from './fx.js';
import { Sound } from './audio.js';
import { UI, fmtT } from './ui.js';
import { load, save, today, yesterday, checkMissions } from './save.js';
import { hashStr } from './rng.js';
import { TIER_NAMES } from './geo.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const COARSE = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shots') });
// phones: lower pixel ratio and a cheaper shadow map (no visible loss at phone size)
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.25 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = COARSE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY = new THREE.Color('#bfe8ff');
scene.background = SKY;
scene.fog = new THREE.Fog('#c9ecff', 160, 420);
const camera = new THREE.PerspectiveCamera(35, 1, 1, 1200);
const hemi = new THREE.HemisphereLight('#f4fbff', '#9fd17a', 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

const particles = new Particles(scene);
const snd = new Sound();
const data = load();
snd.musicOn = data.music; snd.sfxOn = data.sfx;
if (Q.has('mute')) { snd.musicOn = false; snd.sfxOn = false; }
const game = new Game(scene, particles, snd);
types();

const app = {
  snd, data, game,
  persist() { save(data); },
  play(mode) { startRound(mode || data.mode); },
};
const ui = new UI(app);
app.ui = ui;
window.__G = app;

// ---------------- input ----------------
const input = { mx: 0, my: 0, mouseActive: false, keys: new Set(), joy: null, dash: false, kbDash: false, touch: false };
const isTouch = matchMedia('(pointer: coarse)').matches || Q.has('touch');
if (isTouch) { document.body.classList.add('touch'); input.touch = true; app.touch = true; }
const hud = document.getElementById('hud');
if (isTouch) hud.classList.add('touch');
const joyEl = document.getElementById('joy');

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { input.mx = e.clientX; input.my = e.clientY; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) input.mouseActive = true; }
  if (input.joy && e.pointerId === input.joy.id) {
    input.joy.x = e.clientX; input.joy.y = e.clientY;
    const dx = e.clientX - input.joy.ox, dy = e.clientY - input.joy.oy, d = Math.hypot(dx, dy), mx = 56;
    const k = d > mx ? mx / d : 1;
    joyEl.firstChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }
});
canvas.addEventListener('pointerdown', (e) => {
  snd.init();
  if (state !== 'play') return;
  if (e.pointerType === 'mouse') {
    input.mx = e.clientX; input.my = e.clientY; input.mouseActive = true;
    if (e.button === 0 || e.button === 2) doFling();
  } else if (!input.joy) {
    input.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() };
    joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
    joyEl.classList.add('on'); joyEl.firstChild.style.transform = '';
  }
});
// (a quick tap used to fling too; it cost resting thumbs mass without them
// knowing why, so on touch only the FLING button flings)
const endJoy = (e) => {
  if (input.joy && e.pointerId === input.joy.id) { input.joy = null; joyEl.classList.remove('on'); }
};
window.addEventListener('pointerup', endJoy);
window.addEventListener('pointercancel', endJoy);
const flingBtn = document.getElementById('flingBtn'), dashBtn = document.getElementById('dashBtn');
flingBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); snd.init(); flingBtn.classList.add('down'); doFling(); });
flingBtn.addEventListener('pointerup', () => flingBtn.classList.remove('down'));
dashBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); input.dash = true; dashBtn.classList.add('down'); });
const dashUp = () => { input.dash = false; dashBtn.classList.remove('down'); };
dashBtn.addEventListener('pointerup', dashUp); dashBtn.addEventListener('pointerleave', dashUp); dashBtn.addEventListener('pointercancel', dashUp);
document.getElementById('pauseBtn').addEventListener('click', () => pause());

window.addEventListener('keydown', (e) => {
  snd.init();
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (state === 'play' && !paused) {
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { input.keys.add(k); input.mouseActive = false; }
    if (k === 'shift' || k === ' ') input.kbDash = true;
    if ((k === 'e' || k === 'j' || k === 'f' || k === 'enter') && !e.repeat) doFling();
    if (k === 'escape' || k === 'p') pause();
    if (k === 'r' && !e.repeat) startRound(curMode);
  } else if (state === 'play' && paused) {
    if (k === 'escape' || k === 'p') resume();
  } else if (state === 'over') {
    if ((k === 'enter' || k === 'r' || k === ' ') && !e.repeat && performance.now() - overAt > 600) startRound(curMode);
    if (k === 'escape') toTitle();
  } else if (state === 'title') {
    if ((k === 'enter' || k === ' ') && !e.repeat && !document.querySelector('.scrim')) startRound(data.mode);
    if (k === 'escape') { const s = document.querySelector('.scrim'); if (s) { s.remove(); ui.title(data); } }
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  input.keys.delete(k);
  if (k === 'shift' || k === ' ') input.kbDash = false;
});
window.addEventListener('blur', () => { input.keys.clear(); input.kbDash = false; input.dash = false; if (state === 'play' && !paused && !Q.has('bot')) pause(); });

function doFling() { if (state === 'play' && !paused && game.player && !game.player.dead) game.player.wantFling = true; }

// ---------------- camera ----------------
const cam = { look: 0, x: 0, z: 0, d: 50, pull: 0, shakeX: 0, shakeY: 0, orbit: 0 };
const v3 = new THREE.Vector3();
function project(x, y, z) {
  v3.set(x, y, z).project(camera);
  return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight, v3.z < 1];
}
// screen point -> ground plane (y = 0), so the mouse steers exactly where it
// points even though the camera looks down at an angle
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit3 = new THREE.Vector3();
function unproject(sx, sy) {
  ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(ground, hit3) ? hit3 : null;
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  particles.mat.uniforms.uScale.value = innerHeight * 1.6 * renderer.getPixelRatio() / Math.tan((35 * Math.PI) / 360) / 4;
}
window.addEventListener('resize', resize);
resize();

// ---------------- flow ----------------
let state = 'title', paused = false, curMode = 'classic', overAt = 0, last = performance.now(), acc = 0, hudT = 0, missionT = 0;
let roundInfo = null;
let pulseTier = -1;

function seedFor(mode) {
  if (Q.has('seed')) return +Q.get('seed');
  if (mode === 'daily') return hashStr('twister-daily-' + today());
  return (Math.random() * 1e9) | 0;
}
function startRound(mode) {
  if (navigator.userActivation ? navigator.userActivation.hasBeenActive : true) snd.init();
  curMode = mode;
  ui.clear(); ui.clearTags();
  const first = data.rounds === 0 && mode === 'classic';
  const mmr = data.mmr;
  game.autopilot = Q.has('bot');
  const botSkill = mode === 'daily' ? 0.5 : 0.22 + (mmr / 100) * 0.65;
  const brake = first ? 1 : mode === 'daily' ? 0.6 : Math.max(0.25, 0.85 - (mmr / 100) * 0.6);
  game.start({ mode, seed: seedFor(mode), skin: data.skin, perk: unlockedPerk(data.perk), botSkill, brake, easy: first, sleepy: first });
  state = 'play'; paused = false;
  ui.showHud(true, mode);
  roundInfo = { missionsDone: [], startStars: data.stars };
  pulseTier = -1;
  cam.x = game.player.x; cam.z = game.player.z; cam.d = camDist(game.player); cam.pull = 0;
  ui.banner(mode === 'chase' ? 'CLEAR IT!' : mode === 'daily' ? 'DAILY TOWN' : 'GO!', mode === 'chase' ? 'Lift every last thing' : first ? 'Suck up small things first' : 'Biggest storm in 2:00 wins', '#ffcc4d');
  reticle.style.display = 'none';
  snd.tick(true);
  acc = 0;
}
function unlockedPerk(p) { const d = PERKS.find((x) => x.id === p); return d && data.stars >= d.stars ? p : 'suction'; }
function toTitle() {
  state = 'title'; paused = false;
  ui.showHud(false, 'attract'); ui.clearTags();
  game.start({ mode: 'attract', seed: (Math.random() * 1e9) | 0, botSkill: 0.6 });
  // give the attract bots a head start so the town already looks busy
  for (let i = 0; i < 60 * 14; i++) game.step(1 / 60);
  ui.title(data);
}
function pause() {
  if (state !== 'play' || paused) return;
  paused = true;
  ui.pause(data, resume, () => { paused = false; toTitle(); }, () => { paused = false; startRound(curMode); });
}
function resume() { paused = false; last = performance.now(); const s = document.querySelector('.scrim'); if (s) s.remove(); }

function liveReport(over) {
  const p = game.player;
  const list = game.standings();
  return {
    mode: curMode, kills: p.kills, keys: p.liftedKeys, cars: p.cars, cows: p.cows, tier: p.tier, hits: p.hits,
    pct: curMode === 'chase' ? (1 - game.origLeft / game.chaseTotal) * 100 : (p.destroyed / game.world.totalMass) * 100, rank: list.indexOf(p) + 1, over, medal: chaseMedal(),
  };
}
function chaseMedal() {
  if (curMode !== 'chase' || game.origLeft > 0) return 3;
  const t = CHASE_LIMIT - game.timeLeft;
  return t <= CHASE_MEDALS[0] ? 0 : t <= CHASE_MEDALS[1] ? 1 : t <= CHASE_MEDALS[2] ? 2 : 3;
}
function endRound() {
  state = 'over'; overAt = performance.now() + 1300;
  ui.banner(curMode === 'chase' ? (game.origLeft <= 0 ? 'CLEARED!' : 'TIME UP!') : 'TIME UP!', '', '#ffcc4d');
  snd.boom(0.5);
  const r = finalize();
  const round = roundInfo;
  const show = () => { if (state !== 'over' || roundInfo !== round) return; ui.showHud(false, curMode); ui.results(r, data, () => startRound(curMode), toTitle, (btn) => share(r, btn)); };
  if (Q.has('bot') || app.instant) show(); else setTimeout(show, 1300);
}
function finalize() {
  const p = game.player;
  const list = game.standings();
  const rep = liveReport(true);
  const rank = rep.rank;
  const pct = rep.pct;
  let stars = 0;
  const before = data.stars;
  if (curMode === 'chase') {
    const m = chaseMedal();
    stars = [3, 2, 1, 0][m];
    const t = CHASE_LIMIT - game.timeLeft;
    if (game.origLeft <= 0 && (!data.chaseBest || t < data.chaseBest)) data.chaseBest = t;
  } else {
    // every finished round pays at least one star (Hole.io gives coins every round)
    stars = rank === 1 ? 3 : rank <= 3 ? 2 : 1;
    if (pct >= 12) stars++;
    data.mmr = Math.max(0, Math.min(100, data.mmr + (5.5 - rank) * 4));
    if (rank === 1) data.wins++;
  }
  data.stars += stars;
  data.rounds++;
  data.absorbs += p.kills;
  const newRec = p.peak > data.recMass;
  data.recMass = Math.max(data.recMass, Math.round(p.peak));
  if (p.best && p.best.tier >= data.recObjTier) { data.recObjTier = p.best.tier; data.recObj = p.best.label; }
  let date = null;
  if (curMode === 'daily') {
    date = today();
    if (data.daily.last !== date) { data.daily.streak = data.daily.last === yesterday() ? data.daily.streak + 1 : 1; data.daily.last = date; }
    data.daily.best[date] = Math.max(data.daily.best[date] || 0, Math.round(p.mass));
    const keys = Object.keys(data.daily.best).sort();
    while (keys.length > 14) delete data.daily.best[keys.shift()];
  }
  const done = checkMissions(data, rep);
  roundInfo.missionsDone.push(...done);
  const unlocks = [];
  for (const s of SKINS) if (s.stars > roundInfo.startStars && s.stars <= data.stars) unlocks.push(s.name);
  for (const pk of PERKS) if (pk.stars > roundInfo.startStars && pk.stars <= data.stars) unlocks.push(pk.name);
  app.persist();
  snd.jingle(curMode === 'chase' ? game.origLeft <= 0 : rank <= 3);
  const r = {
    mode: curMode, list, rank, mass: p.mass, pct, best: p.best ? p.best.label : null, kills: p.kills, stars: data.stars - roundInfo.startStars,
    missionsDone: roundInfo.missionsDone, unlocks, newRec, date, time: CHASE_LIMIT - game.timeLeft, cleared: game.origLeft <= 0, medal: chaseMedal(),
    tier: p.tier, hits: p.hits, deaths: p.deaths, peak: p.peak,
  };
  app.lastResult = r;
  return r;
}
function share(r, btn) {
  const txt = `🌪️ TWISTER.IO Daily Town ${r.date}\n#${r.rank}/10 · ${Math.round(r.mass).toLocaleString()} t · ${r.pct.toFixed(1)}% of town\n${'🟥'.repeat(Math.min(10, Math.round(r.pct / 3)))}${'⬜'.repeat(Math.max(0, 10 - Math.round(r.pct / 3)))}\nStreak ${data.daily.streak} 🔥`;
  const done = () => { btn.textContent = 'Copied!'; };
  try {
    if (navigator.share && input.touch) navigator.share({ text: txt }).catch(() => {});
    else navigator.clipboard.writeText(txt).then(done, () => { btn.textContent = 'Copy failed'; });
  } catch (e) { btn.textContent = 'Copy failed'; }
}

// ---------------- events from the sim ----------------
function handleEvents() {
  const p = game.player;
  for (const ev of game.events) {
    if (ev.type === 'tier' && ev.st === p) {
      const n = ev.tier + 1;
      ui.banner(`CATEGORY ${n}!`, `Now lifting ${TIER_NAMES[ev.tier].toUpperCase()}`, TIER_COLORS[ev.tier]);
      snd.tierUp(ev.tier); cam.pull = 1; game.shake = Math.max(game.shake, 0.5);
    } else if (ev.type === 'lift') {
      if (ev.st === p && state === 'play') {
        snd.lift(ev.def.tier);
        // pops only for things that still matter at your size: at Category 6
        // a cone is noise, a house is a headline
        if (ev.def.tier >= p.tier - 2) {
          const [x, y] = project(p.x, p.h * 0.75, p.z);
          ui.pop(ev.def.label, ev.def.mass, x, y - 30, ev.def.tier >= 4);
        }
        if (ev.def.tier >= 4) game.shake = Math.max(game.shake, 0.25 + ev.def.tier * 0.06);
      }
    } else if (ev.type === 'fling') {
      if (ev.st === p) snd.fling();
    } else if (ev.type === 'hit') {
      if (ev.st === p) { const [x, y] = project(ev.target.x, ev.target.h * 0.6, ev.target.z); ui.flyText(`HIT! −${ev.n}`, x, y, 'hit'); snd.hit(); }
      if (ev.target === p) { game.shake = Math.max(game.shake, 0.6); snd.hit(); }
    } else if (ev.type === 'absorb') {
      const d = p ? Math.hypot(ev.victim.x - p.x, ev.victim.z - p.z) : 50;
      snd.boom(Math.max(0.15, 1 - d / 140));
      if (ev.killer === p) { const [x, y] = project(p.x, p.h * 0.8, p.z); ui.flyText(`ABSORBED ${esc(ev.victim.name)}!`, x, y - 40, 'big'); ui.toast(`💥 You absorbed <b>${esc(ev.victim.name)}</b> (+${Math.round(ev.gain)})`); }
      else if (ev.victim !== p && state === 'play') ui.toast(`<b>${esc(ev.killer.name)}</b> absorbed ${esc(ev.victim.name)}`);
    } else if (ev.type === 'threat' && ev.st === p && state === 'play') {
      const [x, y] = project(p.x, 0, p.z);
      ui.flyText('TOO BIG · RUN!', x, y + 34, 'warn');
      snd.alarm();
    } else if (ev.type === 'respawn' && ev.st === p) {
      ui.dead(false);
    } else if (ev.type === 'zap') {
      if (p && ev.st === p) snd.zap();
    } else if (ev.type === 'empty') {
      flingBtn.classList.remove('shake'); void flingBtn.offsetWidth;
    } else if (ev.type === 'over' && state === 'play') {
      endRound();
    }
  }
  game.events.length = 0;
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }

// ---------------- per-frame ----------------
function readSteer() {
  const p = game.player;
  if (!p || game.autopilot) return;
  let x = 0, z = 0, thr = 0;
  const K = input.keys;
  const kx = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
  const kz = (K.has('s') || K.has('arrowdown') ? 1 : 0) - (K.has('w') || K.has('arrowup') ? 1 : 0);
  if (input.joy) {
    const dx = input.joy.x - input.joy.ox, dy = input.joy.y - input.joy.oy, d = Math.hypot(dx, dy);
    if (d > 6) {
      // push the stick toward a spot on screen and the storm heads for that spot
      const [sx, sy] = project(p.x, 0, p.z), g = unproject(sx + (dx / d) * 120, sy + (dy / d) * 120);
      const wx = g ? g.x - p.x : dx, wz = g ? g.z - p.z : dy, wd = Math.hypot(wx, wz) || 1;
      x = wx / wd; z = wz / wd; thr = Math.min(1, d / 50);
    }
  } else if (kx || kz) {
    const d = Math.hypot(kx, kz); x = kx / d; z = kz / d; thr = 1;
  } else if (input.mouseActive) {
    const [sx, sy] = project(p.x, 0, p.z);
    const dx = input.mx - sx, dy = input.my - sy, d = Math.hypot(dx, dy);
    if (d > 14) {
      const g = unproject(input.mx, input.my);
      let wx = g ? g.x - p.x : dx, wz = g ? g.z - p.z : dy;
      const wd = Math.hypot(wx, wz) || 1;
      x = wx / wd; z = wz / wd; thr = Math.min(1, (d - 14) / 110);
    }
  }
  p.steerX = x; p.steerZ = z; p.thr = thr;
  p.wantDash = input.kbDash || input.dash;
}
function camDist(st) {
  const portrait = Math.max(1, (0.95 / camera.aspect) * 0.9);
  return (40 + st.s * 7.5) * Math.min(1.9, portrait);
}
function updateCamera(dt) {
  let target = game.player;
  if (!target) {
    // attract: drift with the biggest bot, slowly orbit
    target = game.standings()[0];
    cam.orbit += dt * 0.05;
  } else if (target.dead && target.killer) target = target.killer;
  if (!target) return;
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (target.x - cam.x) * k; cam.z += (target.z - cam.z) * k;
  cam.look += (target.h * 0.32 - cam.look) * k;
  const want = camDist(target) * (game.player ? 1 : 1.5) + cam.pull * 14;
  cam.d += (want - cam.d) * (1 - Math.exp(-dt * 2.2));
  cam.pull = Math.max(0, cam.pull - dt * 0.6);
  const el = (game.player ? 56 : 48) * (Math.PI / 180);
  const sh = game.shake * game.shake * 1.4;
  const ox = Math.sin(cam.orbit) * Math.cos(el) * cam.d, oz = Math.cos(cam.orbit) * Math.cos(el) * cam.d;
  camera.position.set(cam.x + ox + (Math.random() - 0.5) * sh, Math.sin(el) * cam.d + (Math.random() - 0.5) * sh, cam.z + oz + (Math.random() - 0.5) * sh);
  camera.lookAt(cam.x, 0, cam.z - cam.look);
  // shadow box follows the camera target
  const sb = Math.min(150, cam.d * 0.85 + 20);
  sun.position.set(cam.x - 40, 90, cam.z + 35);
  sun.target.position.set(cam.x, 0, cam.z);
  const sc = sun.shadow.camera;
  if (sc.right !== sb) { sc.left = -sb; sc.right = sb; sc.top = sb; sc.bottom = -sb; sc.near = 10; sc.far = 260; sc.updateProjectionMatrix(); }
}
function updateVisuals(dt, t) {
  const W = game.world;
  if (!W) return;
  // wobble anything being ripped loose
  for (const o of game.wobbling) {
    if (o.state !== S.GROUND) continue;
    const a = Math.min(1, o.rip);
    const f = 22 + o.def.tier * 2;
    o.rx = Math.sin(t * f + o.id) * 0.13 * a; o.rz = Math.cos(t * f * 1.13 + o.id * 2) * 0.13 * a;
    o.sy = 1 + Math.sin(t * f * 0.8) * 0.06 * a;
    o.peel = a * 0.35;
    o.y = o.base + a * a * 0.25;
    W.writeMatrix(o);
  }
  W.flush();
  if (W.water) W.water.material.uniforms.uTime.value = t;
  // pulse the next tier up so new players see what they can grow into
  const p = game.player;
  const want = p ? p.tier + 1 : -1;
  const T = types();
  if (want !== pulseTier) { for (const d of T) for (const m of d.mats) m.emissive.setRGB(0, 0, 0); pulseTier = want; }
  if (want >= 0 && want <= 6) {
    const k = 0.16 * (0.5 + 0.5 * Math.sin(t * 5));
    for (const d of T) if (d.tier === want) for (const m of d.mats) m.emissive.setRGB(k, k * 0.95, k * 0.8);
  }
  for (const st of game.storms) {
    const danger = st.isPlayer && st.threat && !st.dead ? 0.7 + 0.3 * Math.sin(t * 14) : 0;
    st.funnel.update(st.x, st.z, st.s, st.leanX, st.leanZ, t, st.flash + (st.inv > 0 && !st.dead ? 0.25 + 0.25 * Math.sin(t * 20) : 0), st.R, !st.dead, danger);
    st.funnel.ringMat.uniforms.uA.value = st.isPlayer ? 0.85 : 0.3;
  }
  particles.update(dt);
}
// lock-on tag over whichever rival the player's flung piece is homing on
const reticle = document.getElementById('reticle');
function updateReticle() {
  const p = game.player;
  let tg = null;
  if (p && state === 'play') for (const o of game.moving) if (o.state === S.FLY && o.from === p && o.target && !o.target.dead) { tg = o.target; break; }
  if (!tg) { reticle.style.display = 'none'; return; }
  const [x, y, ok] = project(tg.x, tg.h * 0.45, tg.z);
  reticle.style.display = ok ? '' : 'none';
  reticle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  reticle.style.width = reticle.style.height = Math.round(40 + tg.s * 9) + 'px';
}
function updateHud(dt) {
  const p = game.player;
  // tags
  for (const st of game.storms) {
    const [x, y, ok] = project(st.x + st.leanX, st.h + 1.5, st.z + st.leanZ);
    ui.tag(st, x, y, ok && !st.dead && state === 'play', !!p && !st.isPlayer && st.mass > p.mass * 1.1 + 2);
  }
  updateReticle();
  if (!p) return;
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  if (curMode === 'chase') {
    const left = game.origLeft;
    ui.timer(fmtT(CHASE_LIMIT - game.timeLeft).replace(/^/, ''), `${((1 - left / game.chaseTotal) * 100).toFixed(left < 20 ? 1 : 0)}% · ${left} LEFT`, game.timeLeft < 20);
    // point at the nearest leftover when it gets sparse
    if (left > 0 && left <= 25) {
      let best = null, bd = 1e9;
      for (const o of game.world.objs) if (o.orig && o.state === S.GROUND) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } }
      if (best && bd > p.R + 4) ui.arrow(true, Math.atan2(best.z - p.z, best.x - p.x), bd); else ui.arrow(false);
    } else ui.arrow(false);
  } else ui.timer(game.timeLeft, curMode === 'daily' ? 'DAILY' : 'TIME', game.timeLeft < 10);
  ui.board(game.standings(), p);
  ui.me(p, game.ringCap(p));
  ui.dead(p.dead, p.killer || p, p.respawn);
  if (state === 'play' && curMode !== 'attract') {
    missionT -= 0.1;
    if (missionT <= 0) {
      missionT = 0.5;
      const done = checkMissions(data, liveReport(false));
      for (const m of done) { ui.toast(`🎯 Mission complete: <b>${m.text}</b> +2★`); roundInfo.missionsDone.push(m); app.persist(); snd.tierUp(5); }
    }
  }
}
let lastTick = -1;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (!paused && (state === 'play' || state === 'title' || state === 'over')) {
    readSteer();
    let simDt = dt;
    if (game.hitstop > 0) { game.hitstop -= dt; simDt = dt * 0.2; }
    if (state !== 'over') {
      acc += simDt;
      let n = 0;
      while (acc >= 1 / 60 && n < 6) { game.step(1 / 60); acc -= 1 / 60; n++; }
      if (n === 6) acc = 0;
    }
    handleEvents();
    if (state === 'play' && curMode !== 'chase' && game.timeLeft <= 5.5) {
      const s = Math.ceil(game.timeLeft);
      if (s !== lastTick && s > 0) { snd.tick(s <= 3); lastTick = s; }
    }
    const p = game.player;
    snd.wind(p ? p.s : 3, p ? Math.hypot(p.vx, p.vz) : 6, state === 'play' && !!p && !p.dead || state === 'title', !!(p && p.threat && !p.dead));
    updateVisuals(dt, t);
    updateCamera(dt);
    updateHud(dt);
  }
  renderer.render(scene, camera);
}

// ---------------- test hooks ----------------
Object.assign(app, {
  startRound, toTitle, pause, resume, endRound,
  // advance the simulation without rendering (for tests)
  fast(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n && game.state === 'play'; i++) { if (i % 6 === 0) updateCamera(0.1); readSteer(); game.step(1 / 60); if (i % 30 === 0) handleEvents(); } handleEvents(); },
  toScreen(x, z) { return project(x, 0, z); },
  teleport(x, z) { const p = game.player; p.x = x; p.z = z; cam.x = x; cam.z = z; },
  setSteer(x, z, thr = 1) { const p = game.player; p.steerX = x; p.steerZ = z; p.thr = thr; },
  info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }; },
  render() { updateVisuals(1 / 60, performance.now() / 1000); updateCamera(1); updateHud(1); renderer.render(scene, camera); },
});

Object.defineProperties(app, { state: { get: () => state }, paused: { get: () => paused }, mode: { get: () => curMode } });
if (Q.has('play')) { toTitleQuiet(); startRound(Q.get('mode') || data.mode); }
else toTitle();
function toTitleQuiet() { state = 'title'; }
requestAnimationFrame(frame);
