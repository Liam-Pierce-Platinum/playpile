// MOONSHOT SLUGGER - game loop, rounds, camera, input, HUD.
import * as THREE from '../vendor/three.module.js';
import { makePitch, pitchPos, contact, simulate, rng, inZone, fenceDist, SWING_LAG, WINDOW, ZONE } from './physics.js';
import { STAGES, starsFor, loadSave, writeSave } from './stages.js';
import { buildPark } from './park.js';
import { buildActors } from './actors.js';
import { buildFx } from './fx.js';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const canvas = $('c');

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// phones: cap the pixel ratio a bit lower, the crowd + field fill rate is the main cost there
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const park = buildPark(renderer);
const scene = park.scene;
const A = buildActors(scene, park.glowTex);
const fx = buildFx(scene);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);

const save = loadSave();
SFX.setMuted(!!save.muted);

const isTouchDevice = matchMedia('(pointer: coarse)').matches;
let usingTouch = isTouchDevice;

// ---------- state ----------
const S = {
  mode: 'title',          // title | play | results | paused
  stageIdx: Math.min(save.unlocked, STAGES.length) - 1,
  time: 0,
  freeze: 0,              // hit-stop seconds remaining
  slow: 0,                // slow-motion seconds remaining
  shake: 0,
  flash: 0,
  excite: 0,
  aim: { x: 0, y: 0.82 },
  camMode: 'bat',         // bat | flight | title
  camBlend: 1,
  fireworks: [],
  r: null,                // current round
};

// a round is 10 outs, but never more than PITCH_CAP pitches, so a hot streak still ends in ~2 min
const PITCH_CAP = 30;
function newRound(idx) {
  const stage = STAGES[idx];
  const seed = params.has('seed') ? +params.get('seed') : (Math.random() * 1e9) | 0;
  S.stageIdx = idx;
  S.r = {
    stage, rand: rng(seed), seed,
    outs: 0, hr: 0, score: 0, streak: 0, bestStreak: 0, longest: 0, pitches: 0,
    phase: 'ready', phaseT: 0,
    pitch: null, t: 0, swung: false, swingAt: 0, resolved: false, hit: null, sim: null, fT: 0,
    targetsHit: 0, log: [],
  };
  for (const t of fx.targets) fx.placeTarget(t, S.r.rand);
  A.swing.t = -1;
  A.ball.visible = false; A.ballShadow.visible = false;
  fx.trailClear();
  S.camMode = 'bat'; S.camBlend = 1;
  updateHud(true);
  park.drawScoreboard({ title: stage.name, hr: 0, outs: 0, score: 0, foot: 'NEED ' + stage.need + ' HR' });
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const batPos = new THREE.Vector3(), batLook = new THREE.Vector3();
const flPos = new THREE.Vector3(), flLook = new THREE.Vector3();
function batCam() {
  const asp = camera.aspect;
  // portrait: pull back + up a little so the batter and zone fit
  const back = asp < 1 ? (1 - asp) * 1.1 : 0;
  // in portrait also slide toward the batter so he stays in frame
  batPos.set(0.28 - back * 0.45, 1.38 + back * 0.2, 3.0 + back * 1.5);
  batLook.set(-back * 0.2, 1.12, -14);
  camera.fov = asp < 1 ? 52 : 46;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  batCam();
  camera.updateProjectionMatrix();
  fx.mat.uniforms.uScale.value = h * 0.9;
}
window.addEventListener('resize', resize);
resize();

// ---------- input ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitP = new THREE.Vector3();
function screenToPlate(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  // aim is always measured from the batting camera, even mid-transition
  const cam = aimCam;
  ray.setFromCamera(ndc, cam);
  if (!ray.ray.intersectPlane(plane, hitP)) return null;
  return { x: Math.max(-0.8, Math.min(0.8, hitP.x)), y: Math.max(0.15, Math.min(1.7, hitP.y)) };
}
const aimCam = new THREE.PerspectiveCamera();
function syncAimCam() {
  aimCam.copy(camera); aimCam.position.copy(batPos); aimCam.lookAt(batLook); aimCam.updateMatrixWorld();
}
const rc = () => (usingTouch ? 0.19 : 0.155);
// Where the ball LOOKS like it is right now, measured on the plate plane from the batting
// camera. Players aim at the ball they see, so a circle on the ball (as seen at the click)
// counts the same as a circle on the crossing point.
const _bp = new THREE.Vector3(), _dir = new THREE.Vector3();
function ballOnPlate() {
  if (!A.ball.visible) return null;
  _dir.copy(A.ball.position).sub(batPos);
  if (Math.abs(_dir.z) < 1e-4) return null;
  const k = (0 - batPos.z) / _dir.z;
  if (k <= 0) return null;
  _bp.copy(batPos).addScaledVector(_dir, k);
  return { x: _bp.x, y: _bp.y };
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    usingTouch = false;
    const p = screenToPlate(e.clientX, e.clientY); if (p) { S.aim.x = p.x; S.aim.y = p.y; }
  }
});
canvas.addEventListener('pointerdown', (e) => {
  SFX.initAudio();
  if (S.mode !== 'play') return;
  if (e.pointerType !== 'mouse') {
    usingTouch = true;
    const p = screenToPlate(e.clientX, e.clientY);
    if (p) {
      // light aim assist for fingers: pull a near tap toward where the ball will cross
      const r = S.r;
      if (r && r.pitch && r.phase === 'pitch') {
        // pull toward whichever is nearer: the crossing point or the ball as it looks now
        const bn = ballOnPlate();
        let tx = r.pitch.p1.x, ty = r.pitch.p1.y;
        if (bn && Math.hypot(bn.x - p.x, bn.y - p.y) < Math.hypot(tx - p.x, ty - p.y)) { tx = bn.x; ty = bn.y; }
        const dx = tx - p.x, dy = ty - p.y;
        if (Math.hypot(dx, dy) < 0.4) { p.x += dx * 0.35; p.y += dy * 0.35; }
      }
      S.aim.x = p.x; S.aim.y = p.y;
    }
  } else {
    usingTouch = false;
    const p = screenToPlate(e.clientX, e.clientY); if (p) { S.aim.x = p.x; S.aim.y = p.y; }
  }
  swing();
});
window.addEventListener('keydown', (e) => {
  SFX.initAudio();
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (S.mode === 'play') swing();
    else if (S.mode === 'results' && !e.repeat) startStage(S.stageIdx);
    else if (S.mode === 'title' && !e.repeat) startStage(S.stageIdx);
  } else if (e.code === 'KeyR') {
    if (S.mode === 'play' || S.mode === 'results') startStage(S.stageIdx);
  } else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.mode === 'play') pauseGame(); else if (S.mode === 'paused') resumeGame();
  }
});

function swing() {
  const r = S.r;
  if (!r || S.mode !== 'play') return;
  if (r.swung || A.swing.t >= 0) return;
  if (r.phase !== 'pitch' && r.phase !== 'windup') return;
  if (r.phase === 'windup') return;            // too early, ignore (no penalty)
  r.swung = true; r.swingAt = r.t;
  // judge the aim against whichever the player was on: the crossing point, or the ball as seen
  const p1 = r.pitch.p1, bn = ballOnPlate();
  if (bn) {
    // a breaking ball still has some of its bend to come: the player has to lead it
    const u = Math.min(1, r.t / r.pitch.T), left = 1 - u * u;
    bn.x += r.pitch.brk.x * left * 0.35; bn.y += r.pitch.brk.y * left * 0.35;
  }
  r.aimRef = { x: p1.x, y: p1.y };
  if (bn && Math.hypot(S.aim.x - bn.x, S.aim.y - bn.y) < Math.hypot(S.aim.x - p1.x, S.aim.y - p1.y)) r.aimRef = bn;
  A.swing.t = 0; A.swing.aimX = p1.x + S.aim.x - r.aimRef.x; A.swing.aimY = p1.y + S.aim.y - r.aimRef.y;
  hint(false);
}

// ---------- HUD ----------
const hud = {
  stageName: $('stageName'), score: $('score'), hr: $('hr'), hrBox: $('hrBox'), outs: $('outs'), need: $('need'),
  streak: $('streak'), pitchLabel: $('pitchLabel'), pop: $('pop'), sub: $('sub'), dist: $('dist'), hint: $('hint'), flash: $('flash'),
};
for (let i = 0; i < 10; i++) hud.outs.appendChild(document.createElement('i'));
let shownScore = 0;
function updateHud(reset) {
  const r = S.r; if (!r) return;
  hud.stageName.textContent = r.stage.name;
  hud.hr.textContent = r.hr;
  [...hud.outs.children].forEach((el, i) => el.classList.toggle('used', i < r.outs));
  const left = r.stage.need - r.hr;
  const pl = PITCH_CAP - r.pitches;
  hud.need.textContent = pl <= 5 ? (pl > 0 ? `${pl} PITCHES LEFT` : 'LAST PITCH!') : left > 0 ? `${left} MORE HR TO CLEAR` : 'STAGE CLEARED!';
  hud.need.classList.toggle('warn', pl <= 5);
  if (reset) { shownScore = 0; hud.score.textContent = '0'; }
  if (r.streak >= 2) {
    hud.streak.classList.remove('hidden');
    hud.streak.textContent = `STREAK x${Math.min(r.streak, 5)}`;
  } else hud.streak.classList.add('hidden');
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function popText(text, color = '#fff', sub = '', big = false) {
  hud.pop.classList.toggle('hr', big); hud.sub.classList.toggle('hr', big);
  hud.pop.textContent = text; hud.pop.style.color = color;
  hud.pop.classList.remove('show'); void hud.pop.offsetWidth; hud.pop.classList.add('show');
  hud.sub.textContent = sub;
  hud.sub.classList.remove('show'); if (sub) { void hud.sub.offsetWidth; hud.sub.classList.add('show'); }
}
function hint(on, text) {
  if (text) hud.hint.textContent = text;
  hud.hint.classList.toggle('on', !!on);
}

// ---------- round flow ----------
function nextPitch() {
  const r = S.r;
  r.pitch = makePitch(r.stage, r.rand);
  r.pitches++;
  // golden ball: every so often worth double
  r.pitch.golden = r.pitches > 2 && r.rand() < 0.14;
  r.phase = 'windup'; r.phaseT = 0; r.t = 0;
  if (save.rounds < 1 && r.hr === 0) hint(true);
  updateHud();
  r.swung = false; r.resolved = false; r.hit = null; r.sim = null; r.fT = 0;
  A.swing.t = -1;
  A.ballMat.color.set(r.pitch.golden ? 0xffd23a : 0xffffff);
  A.ballMat.emissive.set(r.pitch.golden ? 0x664400 : 0x333333);
  A.ballGlow.material.color.set(r.pitch.golden ? 0xffc030 : 0xffffff);
  A.ballGlow.scale.setScalar(r.pitch.golden ? 0.8 : 0.5);
  fx.tMat.uniforms.uCol.value.set(r.pitch.golden ? 0xffd23a : 0xfff3c4);
}

function endPitch(kind, label, color, sub) {
  const r = S.r;
  r.phase = 'result'; r.phaseT = 0;
  r.log.push(kind);
  if (kind === 'out') {
    r.outs++; r.streak = 0;
    if (label) popText(label, color || '#ff5a6a', sub);
  } else if (kind === 'take') {
    if (label) popText(label, color || '#cfd8ff', sub);
  }
  updateHud();
  park.drawScoreboard({ title: r.stage.name, hr: r.hr, outs: r.outs, score: r.score, foot: r.longest ? 'LONGEST ' + Math.round(r.longest) + ' m' : 'NEED ' + r.stage.need + ' HR' });
}

function resolveContact() {
  const r = S.r, p = r.pitch;
  r.resolved = true;
  const tc = r.swingAt + SWING_LAG;
  const dt = tc - p.T;
  const dx = A.swing.aimX - p.p1.x, dy = A.swing.aimY - p.p1.y;
  const W = WINDOW * r.stage.win;
  const h = contact(dt, dx, dy, rc() * r.stage.rcMul, r.rand, W);
  if (!h) {
    SFX.whiff();
    const why = Math.abs(dt) > W ? (dt < 0 ? 'TOO EARLY' : 'TOO LATE') : 'MISSED IT';
    r.whiff = why;
    return;
  }
  const bp = pitchPos(p, tc);
  bp.z = Math.max(-0.6, Math.min(0.35, bp.z));
  A.ball.visible = true; A.ball.position.set(bp.x, bp.y, bp.z);
  const sim = simulate(h, { x: bp.x, y: bp.y, z: bp.z }, true);
  r.hit = h; r.sim = sim; r.phase = 'flight'; r.phaseT = 0; r.fT = 0;
  const q = h.perfect ? 1 : h.power;
  SFX.crack(q);
  fx.sparks(bp, 18 + Math.round(q * 30), q);
  S.shake = 0.12 + q * 0.25;
  S.freeze = h.perfect ? 0.13 : 0.045 + q * 0.03;
  if (h.perfect) { S.slow = 0.55; S.flash = 0.8; }
  const lab = { PERFECT: ['PERFECT!', '#ffd23a'], GREAT: ['GREAT!', '#7dff7a'], GOOD: ['GOOD', '#8fd8ff'], EARLY: ['EARLY', '#ffb36b'], LATE: ['LATE', '#ffb36b'], TOPPED: ['TOPPED', '#ffb36b'], UNDER: ['UNDER IT', '#ffb36b'] }[h.label];
  popText(lab[0], lab[1], `${Math.round(h.ev * 3.6)} km/h off the bat`);
  // follow fly balls with the flight camera
  r.follow = sim.apex > 6 && sim.dist > 45 && sim.result !== 'foul';
  fx.trailClear();
  if (sim.result === 'hr') SFX.anticipate(0.6);
}

function landBall() {
  const r = S.r, sim = r.sim, h = r.hit;
  const L = sim.land;
  if (sim.result === 'hr') {
    r.hr++; r.streak++; r.bestStreak = Math.max(r.bestStreak, r.streak);
    const mult = Math.min(r.streak, 5) * (r.pitch.golden ? 2 : 1);
    let pts = Math.round(sim.dist) * mult;
    let sub = `${Math.round(sim.dist)} m`;
    if (sim.dist >= 160) { pts += 100; sub += '  MOONSHOT +100'; }
    if (r.pitch.golden) sub += '  GOLDEN x2';
    pts += r.bonusPts || 0;
    if (r.bonusPts) sub += `  TARGET +${r.bonusPts}`;
    r.score += pts;
    r.longest = Math.max(r.longest, sim.dist);
    popText(r.streak >= 2 ? `HOME RUN x${Math.min(r.streak, 5)}` : 'HOME RUN!', r.pitch.golden ? '#ffd23a' : '#ffffff', sub, true);
    bump(hud.hrBox); if (r.streak >= 2) { updateHud(); bump(hud.streak); }
    SFX.roar(1, 1.6); SFX.organ(r.streak >= 3 ? 'streak' : 'hr', r.streak);
    S.excite = 1;
    fx.dust({ x: L.x, y: L.y, z: L.z }, 16, 0xffe9a8);
    fx.burst({ x: L.x, y: L.y + 1, z: L.z }, r.pitch.golden ? 0xffd23a : 0xffffff);
    // fireworks over the stands
    const n = 3 + Math.min(r.streak, 4);
    for (let i = 0; i < n; i++) S.fireworks.push({ at: S.time + 0.15 + i * 0.28, a: -40 + Math.random() * 80, big: r.pitch.golden ? 1.5 : 1 });
    park.drawScoreboard({ big: 'HOME RUN', bigCol: r.pitch.golden ? '#ffd23a' : '#ffffff', sub: `${Math.round(sim.dist)} m` + (r.streak >= 2 ? `  x${Math.min(r.streak, 5)}` : '') });
    S.shake = Math.max(S.shake, 0.18);
    r.phase = 'result'; r.phaseT = -0.6; r.log.push('hr');
    updateHud();
    setTimeout(() => { if (S.r === r) park.drawScoreboard({ title: r.stage.name, hr: r.hr, outs: r.outs, score: r.score, foot: 'LONGEST ' + Math.round(r.longest) + ' m' }); }, 2200);
  } else {
    SFX.thud(); SFX.groan(); SFX.anticipate(0);
    fx.dust({ x: L.x, y: L.y, z: L.z }, 10);
    const lab = sim.result === 'wall' ? ['OFF THE WALL', `${Math.round(sim.dist)} m - so close`] :
      sim.result === 'foul' ? ['FOUL BALL', ''] : sim.result === 'grounder' ? ['GROUNDER', 'get under it more'] :
      ['FLY OUT', `${Math.round(sim.dist)} m`];
    endPitch('out', lab[0], '#ff5a6a', lab[1]);
  }
  r.bonusPts = 0;
}

function startStage(idx) {
  SFX.initAudio();
  hideAll();
  $('hud').classList.remove('hidden');
  S.mode = 'play';
  newRound(idx);
  if (save.rounds < 2) hint(true, usingTouch ? 'TAP THE BALL as it reaches you' : 'Keep the circle ON THE BALL - click as it reaches you');
  SFX.ui(true);
}

function endRound() {
  const r = S.r;
  S.mode = 'results';
  const stars = starsFor(r.stage, r.hr);
  const id = r.stage.id;
  const prevBest = save.best[id] || 0;
  const newBest = r.score > prevBest;
  if (newBest) save.best[id] = r.score;
  save.stars[id] = Math.max(save.stars[id] || 0, stars);
  save.longest = Math.max(save.longest, r.longest);
  save.totalHR += r.hr; save.rounds++;
  let unlockedNew = false;
  if (stars >= 1 && S.stageIdx + 1 < STAGES.length && save.unlocked < S.stageIdx + 2) { save.unlocked = S.stageIdx + 2; unlockedNew = true; }
  writeSave(save);
  $('rTitle').textContent = stars ? (stars === 3 ? 'LEGENDARY!' : 'STAGE CLEARED!') : 'ROUND OVER';
  $('rStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}" style="animation-delay:${0.2 + i * 0.18}s">&#9733;</span>`).join('');
  $('rHR').textContent = r.hr; $('rScore').textContent = r.score; $('rLong').textContent = Math.round(r.longest); $('rStreak').textContent = r.bestStreak;
  $('rNote').textContent = unlockedNew ? `${STAGES[S.stageIdx + 1].name} UNLOCKED!` : newBest ? 'NEW BEST SCORE!' : stars ? '' : `Hit ${r.stage.need} home runs to clear ${r.stage.name}`;
  const canNext = S.stageIdx + 1 < STAGES.length && save.unlocked >= S.stageIdx + 2;
  $('nextBtn').classList.toggle('hidden', !canNext);
  $('results').classList.remove('hidden'); document.body.classList.add('results');
  hint(false); hud.pop.classList.remove('show'); hud.sub.classList.remove('show'); hud.dist.classList.remove('on'); hud.pitchLabel.classList.remove('on');
  SFX.organ('end', stars + 1);
}

function hideAll() { document.body.classList.remove('results'); for (const id of ['title', 'results', 'pause']) $(id).classList.add('hidden'); }
function showTitle() {
  S.mode = 'title';
  hideAll(); $('hud').classList.add('hidden');
  $('title').classList.remove('hidden');
  A.ball.visible = false; A.ballShadow.visible = false; fx.trailClear();
  for (const t of fx.targets) t.grp.visible = false;
  renderStages();
}
function renderStages() {
  document.querySelector('.howto').innerHTML = isTouchDevice ? '<b>Tap the ball</b> just as it reaches you - the tap is your swing!' : '<b>Circle on the ball</b> &middot; <b>click</b> or <b>Space</b> as it arrives &middot; <b>R</b> retry &middot; <b>M</b> mute';
  const box = $('stages'); box.innerHTML = '';
  STAGES.forEach((st, i) => {
    const d = document.createElement('div');
    const locked = i + 1 > save.unlocked;
    d.className = 'stg' + (i === S.stageIdx ? ' sel' : '') + (locked ? ' lock' : '');
    const s = save.stars[st.id] || 0;
    d.innerHTML = `<div class="n">${locked ? '&#128274;' : i + 1}</div><div>${st.name}</div><div class="st">${[0, 1, 2].map((k) => `<span class="${k < s ? '' : 'off'}">&#9733;</span>`).join('')}</div>`;
    if (!locked) d.addEventListener('click', () => { S.stageIdx = i; SFX.initAudio(); SFX.ui(); renderStages(); });
    box.appendChild(d);
  });
  $('playSub').textContent = `${STAGES[S.stageIdx].name}  -  hit ${STAGES[S.stageIdx].need} HR`;
  $('records').textContent = save.rounds ? `Career: ${save.totalHR} HR  -  longest ${Math.round(save.longest)} m` : '';
}
function pauseGame() { S.mode = 'paused'; $('pause').classList.remove('hidden'); }
function resumeGame() { S.mode = 'play'; $('pause').classList.add('hidden'); }
function toggleMute() {
  save.muted = !SFX.isMuted(); SFX.setMuted(save.muted); writeSave(save);
  const ic = save.muted ? '&#128263;' : '&#128266;';
  $('muteBtn').innerHTML = ic; $('muteBtn2').innerHTML = ic;
}
toggleMute(); toggleMute();   // sync icons with the saved state

$('playBtn').addEventListener('click', () => startStage(S.stageIdx));
$('retryBtn').addEventListener('click', () => startStage(S.stageIdx));
$('nextBtn').addEventListener('click', () => startStage(Math.min(S.stageIdx + 1, STAGES.length - 1)));
$('menuBtn').addEventListener('click', showTitle);
$('quitBtn').addEventListener('click', showTitle);
$('resumeBtn').addEventListener('click', resumeGame);
$('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); pauseGame(); });
$('muteBtn').addEventListener('click', (e) => { e.stopPropagation(); SFX.initAudio(); toggleMute(); });
$('muteBtn2').addEventListener('click', (e) => { e.stopPropagation(); SFX.initAudio(); toggleMute(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') pauseGame(); SFX.suspend(document.hidden); });

// ---------- simulation step ----------
const tmp = {};
function stepRound(dt) {
  const r = S.r;
  r.phaseT += dt;
  if (A.swing.t >= 0) { A.swing.t += dt; if (A.swing.t > 0.7 && r.phase !== 'pitch') A.swing.t = -1; }

  if (r.phase === 'ready') {
    if (r.phaseT > 0.55) nextPitch();
  } else if (r.phase === 'windup') {
    if (r.phaseT >= 0.95) {
      r.phase = 'pitch'; r.phaseT = 0; r.t = 0;
      A.ball.visible = true; SFX.release();
      { const q = pitchPos(r.pitch, 0); A.ball.position.set(q.x, q.y, q.z); } fx.trailClear();
      hud.pitchLabel.innerHTML = `<span style="color:${r.pitch.golden ? '#ffd23a' : r.pitch.col}">${r.pitch.golden ? 'GOLDEN ' : ''}${r.pitch.name}</span> &nbsp;${Math.round(r.pitch.speed * 3.6)} km/h`;
      hud.pitchLabel.classList.add('on');
    }
  } else if (r.phase === 'pitch') {
    r.t += dt;
    const p = r.pitch;
    pitchPos(p, r.t, tmp);
    A.ball.position.set(tmp.x, tmp.y, tmp.z);
    A.ball.rotation.x -= dt * 40;
    if (r.swung && !r.resolved && r.t >= r.swingAt + SWING_LAG) {
      resolveContact();
      if (r.phase === 'flight') { hud.pitchLabel.classList.remove('on'); return; }
    }
    if (tmp.z > 0.9 && A.ball.visible) { A.ball.visible = false; SFX.mitt(); }
    if (r.t >= p.T + 0.09 && !(r.swung && !r.resolved)) {
      // ball reaches the catcher
      if (A.ball.visible) SFX.mitt();
      A.ball.visible = false; hud.pitchLabel.classList.remove('on');
      if (r.swung) {
        endPitch('out', 'STRIKE!', '#ff5a6a', r.whiff || 'missed it');
      } else {
        endPitch('take', p.isBall || !inZone(p) ? 'BALL' : 'TAKE', '#cfd8ff', 'no swing, no out');
      }
      r.whiff = null;
    }
  } else if (r.phase === 'flight') {
    const sim = r.sim, path = sim.path;
    const spd = r.follow ? 1.45 : 1.0;
    r.fT += dt * spd;
    const end = path[path.length - 1].t;
    const tt = Math.min(r.fT, end);
    let i = 0; while (i < path.length - 2 && path[i + 1].t < tt) i++;
    const a = path[i], b = path[Math.min(i + 1, path.length - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (tt - a.t) / (b.t - a.t))) : 0;
    const bp = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    if (r.fT < path[0].t) { const s0 = r.fT / path[0].t; Object.assign(bp, { x: A.ball.position.x + (path[0].x - A.ball.position.x) * s0, y: A.ball.position.y + (path[0].y - A.ball.position.y) * s0, z: A.ball.position.z + (path[0].z - A.ball.position.z) * s0 }); }
    A.ball.position.set(bp.x, bp.y, bp.z);
    A.ball.rotation.z += dt * 30;
    fx.trailPush(bp);
    const horiz = Math.hypot(bp.x, bp.z);
    if (r.follow && horiz > 8) { hud.dist.innerHTML = `${Math.round(horiz)}<small>m</small>`; hud.dist.classList.add("on"); }
    // crowd rises with the carry
    if (sim.result === 'hr') SFX.anticipate(Math.min(1, horiz / 110));
    else SFX.anticipate(Math.min(0.5, horiz / 200));
    // targets
    for (const t of fx.targets) {
      if (t.hitT < 0 && t.grp.visible && t.grp.position.distanceTo(A.ball.position) < 3.8) {
        t.hitT = 0; r.bonusPts = (r.bonusPts || 0) + 300; r.targetsHit++;
        fx.burst(t.grp.position, t.col); SFX.pop(); SFX.ui(true);
      }
    }
    if (r.fT >= end) {
      landBall();
      if (r.follow) { hud.dist.innerHTML = `${Math.round(sim.dist)}<small>m</small>`; }
    }
  } else if (r.phase === 'result') {
    // linger on the landing, then head back
    const hold = r.follow ? 1.2 : 0.75;
    if (r.phaseT > hold - 0.35 && S.camMode === 'flight') { S.camMode = 'bat'; S.camBlend = 0; }
    if (r.phaseT > hold) {
      hud.dist.classList.remove('on');
      A.ball.visible = false; A.ballShadow.visible = false; fx.trailClear();
      if (r.outs >= 10 || r.pitches >= PITCH_CAP) { r.phase = 'over'; r.phaseT = 0; }
      else { r.phase = 'ready'; r.phaseT = 0; }
    }
  } else if (r.phase === 'over') {
    if (r.phaseT > 0.5) endRound();
  }
}

// ---------- camera update ----------
function updateCamera(dt) {
  const r = S.r;
  if (S.mode === 'title' || !r) {
    const t = S.time * 0.06;
    camPos.set(Math.sin(t) * 38, 16 + Math.sin(t * 0.7) * 3, 30 + Math.cos(t) * 8);
    camLook.set(0, 6, -70);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 2));
    camera.lookAt(camLook);
    return;
  }
  batCam();
  if (r.phase === 'flight' && r.follow && r.fT > 0.25) S.camMode = 'flight';
  if (S.camMode === 'flight') {
    const b = A.ball.position;
    const hx = b.x, hz = b.z, hl = Math.hypot(hx, hz) || 1;
    // behind and above the ball, looking along its path
    // chase from behind + a little to the side; stop chasing at the warning track and
    // watch it land from there so the camera never ends up inside the stands
    const ang = Math.atan2(hx, -hz) * 180 / Math.PI;
    const stopR = fenceDist(ang) - 48;
    const cr = Math.min(hl - 15, stopR);
    {
      const ux = hx / hl, uz = hz / hl;
      flPos.set(ux * cr + uz * 5, Math.max(4, Math.min(b.y * 0.6 + 4, 22)), uz * cr - ux * 5);
    }
    flLook.set(b.x, b.y * 0.9, b.z);
    camPos.lerp(flPos, 1 - Math.exp(-dt * 4)); camLook.lerp(flLook, 1 - Math.exp(-dt * 12));
  } else {
    S.camBlend = Math.min(1, S.camBlend + dt * 2.2);
    const k = S.camBlend >= 1 ? 1 : 1 - Math.exp(-dt * 6);
    camPos.lerp(batPos, k); camLook.lerp(batLook, k);
  }
  camera.position.copy(camPos);
  if (S.shake > 0) {
    const s = S.shake * S.shake * 0.6;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

// ---------- frame ----------
let last = performance.now();
camPos.set(0.28, 1.4, 3.0); camLook.set(0, 1.12, -14);
camera.position.set(0, 18, 40);
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!window.__G.manual) tick(rdt);
  renderer.render(scene, camera);
}
function tick(rdt) {
  S.time += rdt;
  let dt = rdt;
  if (S.freeze > 0) { S.freeze -= rdt; dt = 0; }
  else if (S.slow > 0) { S.slow -= rdt; dt = rdt * 0.3; }
  if (S.mode === 'paused') dt = 0;
  S.shake = Math.max(0, S.shake - rdt * 1.2);
  if (S.flash > 0) { S.flash = Math.max(0, S.flash - rdt * 2.2); }
  hud.flash.style.opacity = (S.flash * 0.6).toFixed(3);

  if (S.mode === 'play' && S.r) stepRound(dt);

  // actors
  const r = S.r;
  const inPlay = S.mode === 'play' || S.mode === 'paused';
  let pitchU = -1;
  if (r && inPlay) {
    if (r.phase === 'windup') pitchU = r.phaseT / 0.95;
    else if (r.phase === 'pitch') pitchU = 1 + r.t;
    else if (r.phase === 'flight' || r.phase === 'result') pitchU = 1.4;
  }
  const hand = A.posePitcher(pitchU, S.time);
  if (r && r.phase === 'windup') { A.ball.visible = false; }
  if (r && inPlay && A.swing.t < 0) { A.swing.aimX = S.aim.x; A.swing.aimY = S.aim.y; }
  A.poseBatter(S.time, 1);

  // aim circle + zone + assist marker
  const showAim = S.mode === 'play' && r && (r.phase === 'ready' || r.phase === 'windup' || r.phase === 'pitch');
  A.reticle.visible = !!showAim; A.zone.visible = !!showAim;
  A.reticle.position.x += (S.aim.x - A.reticle.position.x) * (usingTouch ? 0.5 : 1);
  A.reticle.position.y += (S.aim.y - A.reticle.position.y) * (usingTouch ? 0.5 : 1);
  A.reticle.scale.setScalar(rc() * (r ? r.stage.rcMul : 1) / 0.155);
  const nearPlate = r && r.phase === 'pitch' ? Math.max(0, 1 - Math.abs(r.pitch.T - r.t) / 0.35) : 0;
  A.ringFill.material.opacity = 0.1 + nearPlate * 0.18;
  if (r && r.stage.assist && r.phase === 'pitch') {
    A.assist.visible = true; A.assist.position.set(r.pitch.p1.x, r.pitch.p1.y, 0.01);
    A.assist.material.opacity = Math.min(0.9, r.t / Math.max(0.01, r.pitch.T) * 1.4);
  } else A.assist.visible = false;

  // ball shadow
  if (A.ball.visible) {
    A.ballShadow.visible = true;
    A.ballShadow.position.set(A.ball.position.x, 0.03, A.ball.position.z);
    const hgt = A.ball.position.y;
    A.ballShadow.scale.setScalar(1 + hgt * 0.15);
    A.ballShadow.material.opacity = Math.max(0.08, 0.55 - hgt * 0.02);
  } else A.ballShadow.visible = false;

  // trail
  const flying = r && (r.phase === 'flight' || (r.phase === 'result' && r.sim));
  fx.trailUpdate(camera, flying ? (S.camMode === 'flight' ? 0.2 : 0.1) : 0);
  if (!flying && r && r.phase === 'pitch') { fx.trailPush(A.ball.position); fx.trailUpdate(camera, 0.02); }

  // fireworks queue
  for (let i = S.fireworks.length - 1; i >= 0; i--) {
    const f = S.fireworks[i];
    if (S.time >= f.at) {
      const a = f.a * Math.PI / 180, rr = 150 + Math.random() * 30;
      fx.firework({ x: Math.sin(a) * rr, y: 45 + Math.random() * 25, z: -Math.cos(a) * rr }, f.big);
      SFX.pop();
      S.fireworks.splice(i, 1);
    }
  }
  fx.update(dt);
  fx.updateTargets(rdt, S.time, r && S.mode === 'play' && (r.phase === 'ready' || r.phase === 'windup' || r.phase === 'pitch') ? 0.15 : 1);
  S.excite = Math.max(0, S.excite - rdt * 0.35);
  park.crowdMat.uniforms.uTime.value = S.time;
  park.crowdMat.uniforms.uExcite.value = Math.min(1, S.excite * 1.3);
  // score ticker
  if (r && shownScore !== r.score) {
    shownScore += Math.max(1, Math.ceil((r.score - shownScore) * Math.min(1, rdt * 8)));
    if (shownScore > r.score) shownScore = r.score;
    hud.score.textContent = shownScore.toLocaleString();
  }
  updateCamera(rdt);
  syncAimCam();
}

// ---------- test hooks ----------
window.__G = {
  get state() { return S.mode; },
  get game() { return S.r; },
  S, A, STAGES, save, camera,
  start: (i = 0) => startStage(i),
  menu: showTitle,
  swing,
  setAim: (x, y) => { S.aim.x = x; S.aim.y = y; },
  // advance the simulation deterministically (dt seconds, in steps of 1/60)
  step: (sec = 1 / 60) => { for (let t = 0; t < sec; t += 1 / 60) tick(1 / 60); },
  render: () => renderer.render(scene, camera),
  // the ideal moment: returns { x, y, swingIn } for the current pitch, or null
  ideal: () => {
    const r = S.r; if (!r || !r.pitch || r.phase !== 'pitch') return null;
    return { x: r.pitch.p1.x, y: r.pitch.p1.y, swingIn: r.pitch.T - SWING_LAG - r.t, isBall: r.pitch.isBall, T: r.pitch.T };
  },
  zone: ZONE,
};

resize();
if (params.get('play') === '1') {
  startStage(params.has('stage') ? Math.max(0, Math.min(STAGES.length - 1, +params.get('stage') - 1)) : S.stageIdx);
} else showTitle();
requestAnimationFrame(frame);
