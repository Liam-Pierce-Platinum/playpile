// CURVEBALL - game flow, camera, swipe input, HUD and saving.
import * as THREE from '../vendor/three.module.js';
import { makeWorld, kick, step, score, simulate, DT, GW, GH } from './physics.js';
import { LEVELS, suddenDeathSetup } from './levels.js';
import { Stage } from './scene.js';
import { Sound } from './audio.js';
import { planShot } from './bot.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------ save
const KEY = 'pd.curveball';
const save = { stars: [], best: [], sd: 0, muted: false, seen: {} };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const starsOf = (i) => save.stars[i] || 0;
const unlocked = (i) => i === 0 || starsOf(i - 1) > 0 || params.has('unlock');
const totalStars = () => LEVELS.reduce((a, _, i) => a + starsOf(i), 0);

// ------------------------------------------------------------ core objects
const stage = new Stage($('gl'));
const snd = new Sound(); snd.muted = !!save.muted;
const swipeCv = $('swipe'), sctx = swipeCv.getContext('2d');

const G = {
  state: 'title', mode: 'challenge', li: 0, setup: LEVELS[0], world: null,
  ballIdx: 0, balls: 3, score: 0, kicks: [], streak: 0, sdN: 0, sdSeed: 1,
  acc: 0, hitstop: 0, slowT: 0, timeScale: 1, afterT: 0, outcome: null, pre: null,
  paused: false, camShake: 0, lastShot: null,
};
window.__G = G;

// ------------------------------------------------------------ layout
let W = 1, H = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  stage.resize(W, H);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  swipeCv.width = W * dpr; swipeCv.height = H * dpr; sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.state === 'aim') { placeAimCam(true); updateCamera(0, 0); if (!$('hand').classList.contains('hidden')) placeHand(); }
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------ camera
const cam = stage.camera;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const aimPos = new THREE.Vector3(), aimLook = new THREE.Vector3();
function aimView(start) {
  const dx = start[0], dz = start[2] + 3;
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  const portrait = W / H < 0.8;
  const back = portrait ? 7.2 : 6.6, up = portrait ? 3.3 : 2.6;
  aimPos.set(start[0] + ux * back, up, start[2] + uz * back);
  aimLook.set(start[0] * 0.04, portrait ? -0.9 : 0.55, start[2] * (portrait ? 0.12 : 0.04));
}
function placeAimCam(snap) {
  aimView(G.world.start);
  if (snap) { camPos.copy(aimPos); camLook.copy(aimLook); }
}

function updateCamera(dt, tReal) {
  if (G.state === 'title' || G.state === 'levels') {
    const a = tReal * 0.06;
    camPos.set(Math.sin(a) * 24, 7 + Math.sin(tReal * 0.2) * 1.5, 18 + Math.cos(a) * 10);
    camLook.set(0, 1.2, 0);
  } else if (G.world) {
    const w = G.world, b = w.ball.p;
    let tp = aimPos, tl = aimLook;
    G.zoom = 0;
    if (w.kicked) {
      // TV-style: creep forward (never past the wall), track the ball, zoom in as it nears goal
      const prog = clamp(1 - Math.max(b[2], 0) / w.start[2], 0, 1);
      const e = prog * prog * (3 - 2 * prog);
      const dir = new THREE.Vector3(aimLook.x - aimPos.x, 0, aimLook.z - aimPos.z).normalize();
      let adv = 4;
      if (w.wall.length) adv = Math.max(0, Math.min(adv, (aimPos.z - w.wall[0].z) - 4));
      tp = aimPos.clone().addScaledVector(dir, adv * e);
      tp.y += e * 0.3;
      tl = new THREE.Vector3().lerpVectors(aimLook, new THREE.Vector3(b[0], Math.min(b[1], 3) * 0.8 + 0.2, Math.max(b[2], -1)), 0.6 * e);
      G.zoom = e;
    }
    const k = 1 - Math.exp(-dt * (w.kicked ? 5 : 8));
    camPos.lerp(tp, k); camLook.lerp(tl, k);
  }
  cam.position.copy(camPos);
  if (G.camShake > 0) {
    const s = G.camShake * G.camShake * 0.25;
    cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
    G.camShake = Math.max(0, G.camShake - dt * 2.2);
  }
  cam.lookAt(camLook);
  const target = stage.baseFov * (1 - 0.3 * (G.zoom || 0)) - (G.fovKick || 0);
  cam.fov = lerp(cam.fov, target, 1 - Math.exp(-dt * 10));
  G.fovKick = Math.max(0, (G.fovKick || 0) - dt * 30);
  // In-game lens: zoom in and shift the picture so the goal is big and the ball sits
  // near the thumb (portrait: shift down, else the bottom third is empty grass;
  // landscape: shift up, else the zoom pushes the ball off the bottom edge).
  // project()/unprojectToGoal() read the same projection matrix, so aiming stays exact.
  const inGame = G.state !== 'title' && G.state !== 'levels';
  if (inGame) {
    const port = W / H < 0.8;
    const z = port ? PORTRAIT_ZOOM : LAND_ZOOM, sh = (port ? PORTRAIT_SHIFT : LAND_SHIFT) * H;
    cam.setViewOffset(W * z, H * z, (W * z - W) / 2, (H * z - H) / 2 - sh, W, H);
  } else if (cam.view && cam.view.enabled) cam.clearViewOffset();
  cam.updateProjectionMatrix();
}
const PORTRAIT_ZOOM = 1.45, PORTRAIT_SHIFT = 0.07, LAND_ZOOM = 1.25, LAND_SHIFT = -0.11;

// ------------------------------------------------------------ flow
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function screen(name) {
  for (const s of ['title', 'levels', 'results', 'pause']) show(s, s === name);
  show('hud', name === null || name === 'pause');
}

function startChallenge(i) {
  G.mode = 'challenge'; G.li = i; G.setup = LEVELS[i];
  G.balls = G.setup.balls; G.ballIdx = 0; G.score = 0; G.kicks = [];
  G.streak = 0;
  screen(null);
  newBall(true);
}
function startSudden() {
  G.mode = 'sudden'; G.sdN = 0; G.sdSeed = (Math.random() * 1e6) | 0;
  G.score = 0; G.kicks = []; G.streak = 0; G.ballIdx = 0; G.balls = 1;
  screen(null);
  newBall(true);
}
function retry() { snd.play('click'); if (G.mode === 'sudden') startSudden(); else startChallenge(G.li); }

function newBall(first) {
  if (G.mode === 'sudden') G.setup = suddenDeathSetup(G.sdN, G.sdSeed);
  const preT = (G.mode === 'sudden' ? G.sdN * 2.3 : G.ballIdx * 1.7) + Math.random() * 3;
  G.world = makeWorld(G.setup, preT);
  stage.setLevel(G.setup, G.world);
  G.state = 'aim'; G.outcome = null; G.acc = 0; G.timeScale = 1; G.slowT = 0;
  placeAimCam(true);
  G.zoom = 0; G.fovKick = 0; cam.fov = stage.baseFov; cam.updateProjectionMatrix();
  updateCamera(0, 0);
  hud();
  if (first) snd.play('whistle');
  // tips: level tip on the first ball, swipe-hand demo until the player has shot once
  const tip = G.mode === 'sudden' ? (G.sdN === 0 ? 'One miss and it\'s over' : null) : (G.ballIdx === 0 ? G.setup.tip : null);
  $('tipTxt').textContent = tip || '';
  show('tip', !!tip);
  const hand = !save.seen.shot || (G.mode === 'challenge' && G.li === 4 && G.ballIdx === 0 && !save.seen.bend);
  show('hand', hand);
  if (hand) {
    const d = G.mode === 'challenge' && G.li === 4 ? 'M100 235 C 30 170, 40 80, 120 20' : 'M100 235 C 96 170, 104 90, 104 20';
    $('handPath').setAttribute('d', d);
    $('handDot').style.offsetPath = `path("${d}")`;
    placeHand();
  }
  show('speed', false);
}

// the swipe demo starts on the ball and is sized like a real swipe
function placeHand() {
  const bs = project(G.world.start[0], G.world.start[1], G.world.start[2]);
  const h = Math.min(W, H) * 0.42 * 260 / 215, w = h * 200 / 260;
  const el = $('hand');
  el.style.width = w + 'px'; el.style.height = h + 'px';
  el.style.left = (bs[0] - w * 0.5) + 'px'; el.style.top = (bs[1] - h * 235 / 260) + 'px';
}

function shoot(shot) {
  if (G.state !== 'aim') return;
  const w = G.world;
  // predict the exact outcome so we know when to slow time
  G.pre = simulate(G.setup, w.preT, shot);
  kick(w, shot);
  G.lastShot = shot;
  G.state = 'flight';
  G.hitstop = 0.06; G.fovKick = 4; G.camShake = Math.max(G.camShake, 0.25 + (shot.speed - 20) / 40);
  show('tip', false); show('hand', false);
  if (!save.seen.shot) { save.seen.shot = 1; persist(); }
  if (Math.abs(shot.bend) > 1) { save.seen.bend = 1; persist(); }
  $('speed').innerHTML = `<b>${Math.round(shot.speed * 3.6)}</b> km/h${Math.abs(shot.bend) >= 0.8 ? ` &middot; curl <b>${Math.abs(shot.bend).toFixed(1)}m</b>` : ''}`;
  show('speed', true);
  stage.burst([w.start[0], 0.05, w.start[2]], 14, ['#7bbf6a', '#4f8f40', '#d9e8c8'], { speed: 2.5, size: 0.05, life: 0.7, g: 9, up: 1.5 });
  stage.flash([w.start[0], 0.15, w.start[2] - 0.1], 0.9);
}

function onEvent(e) {
  const w = G.world, b = w.ball.p;
  switch (e.type) {
    case 'kick': snd.play('kick', clamp((e.speed - 16) / 16, 0, 1)); snd.play('swoosh'); break;
    case 'bounce': snd.play('bounce', clamp(e.s / 5, 0.2, 1)); break;
    case 'post':
      snd.play('post'); G.camShake = Math.max(G.camShake, 0.7); G.hitstop = 0.05;
      stage.burst([b[0], b[1], b[2]], 24, ['#ffffff', '#cfe3ff'], { speed: 5, size: 0.04, life: 0.6, g: 4 });
      stage.flash([b[0], b[1], b[2]], 1.2);
      break;
    case 'save':
      snd.play('save'); G.camShake = Math.max(G.camShake, 0.5); G.hitstop = 0.07;
      stage.burst([b[0], b[1], b[2]], 18, ['#ffffff', '#ffd21f'], { speed: 4, size: 0.05, life: 0.6, g: 4 });
      stage.flash([b[0], b[1], b[2]], 1.4);
      break;
    case 'wall': snd.play('wall'); G.camShake = Math.max(G.camShake, 0.35); stage.flash([b[0], b[1], b[2]], 1); break;
    case 'goal': {
      snd.play('goal'); stage.uniforms.uHype.value = 1;
      G.camShake = Math.max(G.camShake, 1.0); G.hitstop = 0.05;
      const s = score(Object.assign({}, w, { result: 'goal' }));
      if (s.target >= 0) { stage.hitTarget(s.target); snd.play('target'); }
      const cols = ['#ff3d5a', '#ffd23a', '#1f6bff', '#ffffff', '#11c48a'];
      stage.burst([e.x, e.y, -0.3], 140, cols, { speed: 8, size: 0.16, life: 2.8, g: 2.2, drag: 1.6, flutter: 3, dir: [0, 2, 4] });
      for (const sx of [-GW - 0.3, GW + 0.3]) stage.burst([sx, 0.2, 0.3], 110, cols, { speed: 5, size: 0.17, life: 3.2, g: 2.6, drag: 1.1, flutter: 3, dir: [-Math.sign(sx) * 1.5, 11, 3] });
      stage.flash([e.x, e.y, -0.2], 3.5);
      break;
    }
    case 'net': snd.play('net'); break;
    case 'result': onResult(e.result); break;
  }
}

function onResult(res) {
  const w = G.world;
  const s = score(w);
  G.outcome = s;
  let pts = s.pts;
  const good = res === 'goal';
  if (G.mode === 'sudden' && good) {
    G.streak++;
    const mult = 1 + Math.floor((G.streak - 1) / 3);
    pts *= mult; s.mult = mult;
  } else if (good) G.streak++;
  else G.streak = 0;
  G.score += pts;
  G.kicks.push({ res, pts });
  const words = { goal: ['GOAL!', 'GOLAZO!', 'WHAT A HIT!', 'BEAUTY!', 'SCREAMER!'], saved: ['SAVED!'], blocked: ['BLOCKED!'], miss: ['MISSED!'], short: ['TOO SOFT!'] };
  let word = words[res][0];
  if (good) {
    if (s.tags.length >= 4) word = 'GOLAZO!'; else if (s.tags.length === 3) word = 'SCREAMER!'; else if (s.tags.some((t) => t[0] === 'TOP BINS')) word = 'TOP BINS!'; else if (s.tags.some((t) => t[0] === 'CURLER')) word = 'BEAUTY!';
  } else if (res === 'miss') {
    const c = w.crossed;
    if (w.hitPost) word = 'WOODWORK!';
    else if (c && c[1] >= GH) word = Math.abs(c[0]) < GW ? 'OVER!' : 'WIDE!';
    else if (c) word = 'WIDE!';
  }
  if (!good) { snd.play(res === 'miss' && (w.hitPost || (w.crossed && Math.abs(Math.abs(w.crossed[0]) - GW) < 0.8)) ? 'ooh' : 'ooh'); }
  popup(word, good, good ? s.tags.slice(1) : [], s.mult);
  if (good) {
    $('score').classList.add('bump'); setTimeout(() => $('score').classList.remove('bump'), 140);
    s.tags.slice(1).forEach((t, i) => setTimeout(() => snd.play('bonus', 1 + i * 0.25), 250 + i * 160));
  }
  G.afterT = good ? 1.55 : 1.25;
  G.state = 'after';
  hud();
}

function popup(word, good, tags, mult) {
  const p = $('pop');
  p.classList.remove('fade');
  p.innerHTML = `<div class="big ${good ? '' : 'bad'}">${word}</div>` +
    (tags.length ? `<div class="tags">${tags.map((t, i) => `<span class="tag" style="animation-delay:${0.15 + i * 0.12}s">${t[0]} +${t[1]}</span>`).join('')}</div>` : '') +
    (mult > 1 ? `<div class="mult">STREAK x${mult}</div>` : '');
}
function clearPopup() { $('pop').classList.add('fade'); }

function nextAfterKick() {
  clearPopup();
  if (G.mode === 'sudden') {
    if (G.outcome && G.outcome.result === 'goal') { G.sdN++; newBall(false); }
    else finish();
    return;
  }
  G.ballIdx++;
  if (G.ballIdx >= G.balls) finish();
  else newBall(false);
}

function finish() {
  G.state = 'results';
  show('speed', false); show('tip', false); show('hand', false);
  const r = $('results');
  let stars = 0, title, sub = '';
  if (G.mode === 'challenge') {
    const th = G.setup.stars;
    stars = th.filter((t) => G.score >= t).length;
    const i = G.li;
    const newBest = G.score > (save.best[i] || 0);
    if (stars > starsOf(i)) save.stars[i] = stars;
    if (newBest) save.best[i] = G.score;
    persist();
    title = stars ? (G.li === LEVELS.length - 1 ? 'CHAMPION!' : 'CHALLENGE COMPLETE') : 'NOT THIS TIME';
    const goals = G.kicks.filter((k) => k.res === 'goal').length;
    const nx = th.find((t) => G.score < t);
    sub = `${goals}/${G.balls} goals &middot; ${newBest ? 'NEW BEST' : 'best ' + (save.best[i] || 0)}${nx ? ` &middot; next star at ${nx}` : ' &middot; all stars!'}`;
    const canNext = stars > 0 && i + 1 < LEVELS.length;
    $('nextBtn').disabled = !canNext;
    $('nextBtn').classList.remove('hidden');
    // the big button is whatever you most likely want: NEXT after a pass, RETRY after a fail
    $('nextBtn').innerHTML = canNext ? 'NEXT &#8594;' : 'NEXT';
    arrangeResults(canNext);
  } else {
    const nb = G.score > save.sd;
    if (nb) { save.sd = G.score; persist(); }
    title = 'SUDDEN DEATH';
    sub = `${G.sdN} goal${G.sdN === 1 ? '' : 's'} in a row &middot; ${nb ? 'NEW BEST!' : 'best ' + save.sd}`;
    stars = G.sdN >= 10 ? 3 : G.sdN >= 5 ? 2 : G.sdN >= 1 ? 1 : 0;
    $('nextBtn').classList.add('hidden');
    arrangeResults(false);
  }
  $('resTitle').textContent = title;
  $('resSub').innerHTML = sub;
  r.classList.toggle('fail', stars === 0);
  const sts = r.querySelectorAll('.st'); sts.forEach((s) => s.classList.remove('on'));
  screen('results');
  // count up the score, then pop the stars in
  const target = G.score; let shown = 0; const t0 = performance.now();
  const tick = () => {
    const u = Math.min(1, (performance.now() - t0) / 600); shown = Math.round(target * u);
    $('resScore').textContent = shown; if (u < 1 && G.state === 'results') requestAnimationFrame(tick);
  };
  tick();
  for (let i = 0; i < stars; i++) setTimeout(() => { if (G.state !== 'results') return; sts[i].classList.add('on'); snd.play('star', i); }, 450 + i * 280);
  if (!stars) snd.play('fail');
}

function arrangeResults(nextFirst) {
  const big = nextFirst ? $('nextBtn') : $('retryBtn'), small = nextFirst ? $('retryBtn') : $('nextBtn');
  big.className = 'big'; small.className = 'mid';
  if (G.mode === 'sudden') $('nextBtn').classList.add('hidden');
  $('resBtns').insertBefore(big, $('resRow'));
  $('resRow').insertBefore(small, $('menuBtn'));
}

function goTitle() {
  G.state = 'title'; G.paused = false;
  show('speed', false); show('tip', false); show('hand', false); clearPopup();
  $('starTotal').textContent = `★ ${totalStars()}/${LEVELS.length * 3}`;
  $('sdBest').textContent = save.sd ? `best ${save.sd}` : '';
  screen('title');
  muteIcons();
  if (!G.world) { G.world = makeWorld(LEVELS[0], 0); stage.setLevel(LEVELS[0], G.world); }
}

function quickPlay() {
  let i = LEVELS.findIndex((_, k) => unlocked(k) && !starsOf(k));
  if (i < 0) i = LEVELS.findIndex((_, k) => starsOf(k) < 3);
  if (i < 0) { startSudden(); return; }
  startChallenge(i);
}

function levelGrid() {
  const g = $('lvGrid'); g.innerHTML = '';
  const nextI = LEVELS.findIndex((_, k) => unlocked(k) && !starsOf(k));
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    const lock = !unlocked(i);
    b.className = 'lv' + (lock ? ' locked' : '') + (i === nextI ? ' next' : '');
    const s = starsOf(i);
    b.innerHTML = `<b>${lock ? '&#128274;' : i + 1}</b><small>${L.name}</small><span class="s">${'<i>★</i>'.repeat(s)}${'★'.repeat(3 - s)}</span>`;
    b.disabled = lock;
    b.onclick = () => { snd.unlock(); snd.play('click'); startChallenge(i); };
    g.appendChild(b);
  });
  $('lvStars').textContent = `★ ${totalStars()}/${LEVELS.length * 3}`;
}

// ------------------------------------------------------------ HUD
function hud() {
  if (G.mode === 'challenge') {
    $('lvl').textContent = `${G.li + 1} · ${G.setup.name.toUpperCase()}`;
    $('goalstars').innerHTML = G.setup.stars.map((t, i) => `<span class="${G.score >= t ? 'got' : ''}">${'★'.repeat(i + 1)} ${t}</span>`).join(' &nbsp;');
    $('balls').innerHTML = Array.from({ length: G.balls }, (_, i) => `<i class="${i < G.kicks.length ? (G.kicks[i].res === 'goal' ? 'goal' : 'used') : ''}"></i>`).join('');
    show('streak', false);
  } else {
    $('lvl').textContent = `SUDDEN DEATH · KICK ${G.sdN + 1}`;
    $('goalstars').innerHTML = `best ${save.sd}`;
    $('balls').innerHTML = '<i></i>';
    const mult = 1 + Math.floor(G.streak / 3);
    $('streak').textContent = G.streak ? `${G.streak} in a row${mult > 1 ? ' · x' + mult : ''}` : '';
    show('streak', G.streak > 0);
  }
  $('score').textContent = G.score;
  const wd = G.setup.wind;
  const has = wd && Math.hypot(wd[0], wd[1]) > 0.05;
  show('wind', !!has);
  if (has) {
    $('windArrow').style.transform = `rotate(${Math.atan2(wd[0], -wd[1])}rad)`;
    $('windTxt').textContent = `WIND ${Math.hypot(wd[0], wd[1]).toFixed(1)}`;
  }
  muteIcons();
}
function muteIcons() { for (const id of ['muteBtn', 'titleMute']) $(id).classList.toggle('off', snd.muted); }
function toggleMute() { snd.setMuted(!snd.muted); save.muted = snd.muted; persist(); muteIcons(); if (!snd.muted) snd.play('click'); }

// ------------------------------------------------------------ swipe input
const touch = $('touch');
let swipe = null; const trails = [];
touch.addEventListener('pointerdown', (e) => {
  snd.unlock();
  if (G.state === 'after') { if (G.afterT < 1.0) G.afterT = 0; return; }
  if (G.state !== 'aim' || G.paused) return;
  touch.setPointerCapture(e.pointerId);
  swipe = { id: e.pointerId, pts: [[e.clientX, e.clientY, e.timeStamp || performance.now()]] };
});
touch.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const c of (evs.length ? evs : [e])) swipe.pts.push([c.clientX, c.clientY, c.timeStamp || e.timeStamp || performance.now()]);
  // auto-release once the flick is long enough (feels instant on touch)
  const p0 = swipe.pts[0], p = swipe.pts[swipe.pts.length - 1];
  if (Math.hypot(p[0] - p0[0], p[1] - p0[1]) > reachU() * 0.68) endSwipe();
});
const endSwipe = () => {
  if (!swipe) return;
  const pts = swipe.pts; swipe = null;
  trails.push({ pts, age: 0 });
  const shot = swipeToShot(pts);
  if (shot) shoot(shot);
};
touch.addEventListener('pointerup', endSwipe);
touch.addEventListener('pointercancel', () => { swipe = null; });

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
function project(x, y, z) { cam.updateMatrixWorld(); _v.set(x, y, z).project(cam); return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H]; }
// screen point -> where it lands on the goal plane z = 0
function unprojectToGoal(sx, sy) {
  _v.set(sx / W * 2 - 1, -(sy / H * 2 - 1), 0.5).unproject(cam);
  _d.copy(_v).sub(cam.position).normalize();
  if (_d.z > -0.01) return null;
  const t = -cam.position.z / _d.z;
  return [cam.position.x + _d.x * t, cam.position.y + _d.y * t];
}

export function swipeToShot(pts) {
  if (pts.length < 2) return null;
  const U = reachU();
  const a = pts[0], b = pts[pts.length - 1];
  const cx = b[0] - a[0], cy = b[1] - a[1];
  const L = Math.hypot(cx, cy);
  if (L < U * 0.06 || cy > -L * 0.25) return null;          // too short, or not upward
  // flick speed over the last 0.35 s of movement
  const tEnd = b[2];
  let i0 = pts.length - 1;
  while (i0 > 0 && tEnd - pts[i0 - 1][2] < 350) i0--;
  // skip a still start inside that window
  while (i0 < pts.length - 2 && Math.hypot(pts[i0 + 1][0] - pts[i0][0], pts[i0 + 1][1] - pts[i0][1]) < 1.5) i0++;
  const p0 = pts[i0];
  const lw = Math.hypot(b[0] - p0[0], b[1] - p0[1]) / U;
  const dur = Math.max(0.05, (tEnd - p0[2]) / 1000);
  const vs = lw / dur;
  const speed = clamp(16 + vs * 6.5, 16, 34);
  // curl from how far the path bows away from the straight chord
  const nx = -cy / L, ny = cx / L;     // screen "right" of the chord
  let bow = 0;
  for (const p of pts) { const d = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny; if (Math.abs(d) > Math.abs(bow)) bow = d; }
  bow /= L;
  // aim HEIGHT comes from swipe length alone: a tiny flick is a daisy-cutter, half the reach unit
  // is the crossbar, and above a knee it is squashed (tanh) so an excited over-long flick goes top
  // corner, not into row Z. (The old pure-perspective mapping spent the first ~40% of every swipe
  // below the goal line, so all short and medium swipes were identical ground shots.)
  // aim SIDEWAYS: follow the swipe's direction on screen up to that height, then read the goal
  // plane there, so the ball goes where the finger pointed.
  const w = G.world;
  const bs = project(w.start[0], w.start[1], w.start[2]);
  const x = L / reachU();
  let ty = GH * (x - AIM_X0) / (AIM_XBAR - AIM_X0);
  if (ty > AIM_KNEE) ty = AIM_KNEE + AIM_SOFT * Math.tanh((ty - AIM_KNEE) / AIM_SOFT);
  ty = Math.max(R2, ty);
  const rowY = project(w.start[0] * 0.5, ty, 0)[1];
  const k = (rowY - bs[1]) / cy;
  let hit = k > 0 ? unprojectToGoal(bs[0] + cx * k, rowY) : null;
  if (!hit) hit = [clamp((cx / L) * 20, -12, 12), ty];
  hit[1] = ty;
  const dist = Math.hypot(w.start[0], w.start[2]);
  const bend = Math.abs(bow) < 0.035 ? 0 : clamp(bow * dist * 0.75, -dist * 0.2, dist * 0.2);
  return { tx: clamp(hit[0], -14, 14), ty: clamp(hit[1], R2, 8), speed, bend: Math.round(bend * 100) / 100 };
}
const R2 = 0.12;
// a portrait phone has far more room up than across, so thumbs swipe longer there
const reachU = () => (W / H < 0.8 ? Math.min(H * 0.5, W * 1.2) : Math.min(W, H));
const AIM_X0 = 0.12, AIM_XBAR = 0.5;    // swipe length (in reach units) for a ground shot / the bar
const AIM_KNEE = 1.6, AIM_SOFT = 0.72;    // aim height tops out at 2.32 m, just under the bar: a huge flick is top bins, not row Z

function drawTrails(dt) {
  sctx.clearRect(0, 0, W, H);
  const list = swipe ? trails.concat([{ pts: swipe.pts, age: 0, live: true }]) : trails;
  for (let k = list.length - 1; k >= 0; k--) {
    const t = list[k];
    if (!t.live) { t.age += dt; if (t.age > 0.45) { trails.splice(trails.indexOf(t), 1); continue; } }
    const a = 1 - t.age / 0.45;
    const p = t.pts; if (p.length < 2) continue;
    sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    for (const [w, c] of [[18, `rgba(255,190,60,${0.18 * a})`], [8, `rgba(255,230,140,${0.6 * a})`], [3, `rgba(255,255,255,${0.95 * a})`]]) {
      sctx.lineWidth = w; sctx.strokeStyle = c; sctx.beginPath();
      p.forEach((q, i) => (i ? sctx.lineTo(q[0], q[1]) : sctx.moveTo(q[0], q[1])));
      sctx.stroke();
    }
  }
}

// ------------------------------------------------------------ buttons / keys
const btn = (id, f) => $(id).addEventListener('click', (e) => { e.stopPropagation(); snd.unlock(); f(); });
btn('playBtn', () => { snd.play('click'); quickPlay(); });
btn('levelsBtn', () => { snd.play('click'); levelGrid(); G.state = 'levels'; screen('levels'); });
btn('sdBtn', () => { snd.play('click'); startSudden(); });
btn('lvBack', () => { snd.play('click'); goTitle(); });
btn('retryBtn', retry);
btn('nextBtn', () => { snd.play('click'); if (G.li + 1 < LEVELS.length) startChallenge(G.li + 1); });
btn('menuBtn', () => { snd.play('click'); goTitle(); });
btn('muteBtn', toggleMute);
btn('titleMute', toggleMute);
btn('pauseBtn', () => pause(true));
btn('resumeBtn', () => pause(false));
btn('restartBtn', () => { pause(false); retry(); });
btn('quitBtn', () => { pause(false); goTitle(); });
function pause(on) {
  if (on && !['aim', 'flight', 'after'].includes(G.state)) return;
  G.paused = on; screen(on ? 'pause' : null);
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyR' && ['aim', 'flight', 'after', 'results'].includes(G.state)) { if (G.paused) pause(false); retry(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') { if (G.state === 'results' || G.state === 'levels') goTitle(); else pause(!G.paused); }
  else if ((e.code === 'Enter' || e.code === 'Space') && G.state === 'results') { if (G.mode === 'challenge' && !$('nextBtn').disabled) startChallenge(G.li + 1); else retry(); }
  else if ((e.code === 'Enter' || e.code === 'Space') && G.state === 'title') quickPlay();
  else if (e.code === 'KeyM') toggleMute();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && ['aim', 'flight', 'after'].includes(G.state)) pause(true); });

// ------------------------------------------------------------ loop
function advance(dt) {
  const w = G.world; if (!w) return;
  if (G.state === 'aim' || G.state === 'title' || G.state === 'levels' || G.state === 'results') {
    if (!w.kicked) { G.acc += dt; while (G.acc >= DT) { step(w); G.acc -= DT; } }
    return;
  }
  // slow-motion for the money moments: goals into the corners/targets and near misses
  if (G.pre && G.slowT === 0 && w.kicked && !w.result && !w.inGoal) {
    const pw = G.pre.w, ps = G.pre.s;
    const special = (ps.result === 'goal' && ps.tags.length >= 2) || pw.hitPost || (pw.touchedKeeper && ps.result === 'goal');
    if (special && w.ball.p[2] < 3.2 && w.ball.p[2] > 0) G.slowT = 0.42;
  }
  if (G.slowT > 0) { G.slowT = Math.max(-1, G.slowT - dt); G.timeScale = 0.28; } else G.timeScale = 1;
  G.acc += dt * G.timeScale;
  while (G.acc >= DT) {
    step(w); G.acc -= DT;
    while (w.events.length) onEvent(w.events.shift());
  }
  if (G.state === 'after' && !w.inGoal) {
    // keep simulating a blocked/missed ball so it rolls away naturally
  }
  if (G.state === 'after') { G.afterT -= dt; if (G.afterT <= 0) nextAfterKick(); }
}

// Resolution governor: a weak phone at devicePixelRatio 2-3 is fill-rate bound, so if real frames
// average slower than ~40 fps over a 1.5 s window, render fewer pixels (down to 1x), never up again.
// The canvas is CSS-sized, so only sharpness changes; input and layout are untouched.
const gov = { t: 0, n: 0, sum: 0, floor: 1 };
function governor(rawMs) {
  if (G.manual || G.paused || document.hidden || rawMs > 250 || params.has('hq')) return;   // skip test clocks, tab switches, ?hq
  gov.sum += rawMs; gov.n++; gov.t += rawMs;
  if (gov.t < 1500) return;
  const avg = gov.sum / gov.n; gov.t = gov.sum = gov.n = 0;
  const r = stage.renderer, pr = r.getPixelRatio();
  if (avg > 25 && pr > gov.floor + 0.01) {
    r.setPixelRatio(Math.max(gov.floor, pr * 0.8));   // three re-sizes the drawing buffer itself
    G.pixelRatio = r.getPixelRatio();
  } else if (avg > 25 && stage.key.shadow.mapSize.x > 512) {
    // still slow at 1x: halve the shadow map (no shader recompile, just a new render target)
    const sh = stage.key.shadow, n = sh.mapSize.x / 2;
    sh.mapSize.set(n, n); if (sh.map) { sh.map.dispose(); sh.map = null; }
    G.shadowSize = n;
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  governor(now - last);
  let dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  const tReal = now / 1000;
  if (G.paused || G.manual) dt = 0;
  if (G.manual) { /* headless tests drive time with __G.run() */ }
  else if (G.hitstop > 0) { G.hitstop -= dt; advance(0); } else advance(dt);
  // the world events from an idle (aim) world are just noise; clear them
  if (G.world && !G.world.kicked) G.world.events.length = 0;
  updateCamera(dt, tReal);
  stage.sync(G.world, dt * (G.timeScale || 1), tReal);
  drawTrails(dt);
  stage.render();
}

// ------------------------------------------------------------ test hooks
Object.assign(G, {
  LEVELS, stage, snd, save,
  startChallenge, startSudden, retry, goTitle, quickPlay, shoot, swipeToShot, finish,
  simulate, planShot, project,
  // advance the game by `sec` seconds of game time synchronously (for headless bots)
  run(sec) { const n = Math.round(sec / (1 / 60)); for (let i = 0; i < n; i++) { advance(1 / 60); updateCamera(1 / 60, performance.now() / 1000); } },
  // plan the best shot for the current ball with the real physics
  bot(samples = 600) { const w = G.world; return planShot(G.setup, w.preT, { samples, seed: (G.ballIdx + 1) * 7 + G.sdN }); },
  ballScreen() { const w = G.world; return project(w.start[0], w.start[1], w.start[2]); },
});

resize();
stage.warmup();
goTitle();
if (params.has('play')) {
  const lv = parseInt(params.get('level') || '1', 10) || 1;
  if (params.get('mode') === 'sudden') startSudden(); else startChallenge(clamp(lv - 1, 0, LEVELS.length - 1));
}
requestAnimationFrame(frame);
