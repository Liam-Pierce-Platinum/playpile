// THE MARK - game loop, input, scope, shooting, levels, HUD, saving.
import * as THREE from '../vendor/three.module.js';
import { makeRng, clamp, lerp, fmtTime, angDiff } from './util.js';
import { LEVELS, VENUE_NAMES } from './levels.js';
import { buildVenue } from './world.js';
import { Crowd } from './crowd.js';
import { planLevel } from './clues.js';
import { Audio } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const IS_TOUCH = Q.has('touch') || (matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window);

// ---------------------------------------------------------------- save
const SAVE_KEY = 'pd.the-mark';
let save = { best: {}, cleared: -1, muted: false };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) save = { ...save, ...s }; } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
if (Q.has('mute')) save.muted = true;
Audio.setMuted(save.muted);

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const BASE_FOV = 55;
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 900);
camera.rotation.order = 'YXZ';
scene.add(camera);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// rifle viewmodel (visible when not scoped): olive synthetic stock, dark metal, scope on rings
const rifle = new THREE.Group();
const RB = { x: 0.2, y: -0.185, z: -0.38, rx: 0.06, ry: 0.1, rz: 0.05, s: 0.43 };
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.38, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.2 });
  const stock = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.75 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x0c2236, roughness: 0.05, metalness: 0.8, emissive: 0x0a3a5a, emissiveIntensity: 0.7 });
  const add = (g, m, x, y, z, rx = 0, rz = 0) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.rotation.set(rx, 0, rz); rifle.add(me); return me; };
  const R = Math.PI / 2;
  add(new THREE.BoxGeometry(0.07, 0.15, 0.26), stock, 0, -0.045, 0.33);          // butt
  add(new THREE.BoxGeometry(0.075, 0.035, 0.2), black, 0, 0.035, 0.36);          // cheek rest
  add(new THREE.BoxGeometry(0.06, 0.07, 0.22), stock, 0, -0.03, 0.14);           // wrist
  add(new THREE.BoxGeometry(0.05, 0.12, 0.05), stock, 0, -0.09, 0.12, -0.35);    // pistol grip
  add(new THREE.BoxGeometry(0.068, 0.085, 0.36), metal, 0, 0.0, -0.08);         // receiver
  add(new THREE.BoxGeometry(0.075, 0.07, 0.42), stock, 0, -0.035, -0.36);        // fore-end
  add(new THREE.BoxGeometry(0.045, 0.09, 0.08), black, 0, -0.09, -0.06);         // magazine
  add(new THREE.CylinderGeometry(0.015, 0.018, 0.78, 12), metal, 0, 0.012, -0.72, R);   // barrel
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 12), black, 0, 0.012, -1.1, R);   // muzzle brake
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 18), black, 0, 0.1, -0.06, R);      // scope tube
  add(new THREE.CylinderGeometry(0.048, 0.032, 0.09, 18), black, 0, 0.1, -0.26, R);    // objective bell
  add(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 18), black, 0, 0.1, 0.14, R);      // eyepiece
  add(new THREE.CircleGeometry(0.034, 18), lens, 0, 0.1, 0.176);                        // eyepiece glass
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), black, 0, 0.145, -0.06);     // elevation turret
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), black, 0.045, 0.1, -0.06, 0, R); // windage turret
  for (const z of [-0.16, 0.04]) add(new THREE.BoxGeometry(0.05, 0.06, 0.03), metal, 0, 0.055, z); // rings
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8), metal, 0.05, 0.02, 0.06, 0, R); // bolt handle
  add(new THREE.SphereGeometry(0.016, 10, 8), metal, 0.09, 0.02, 0.06);                // bolt knob
  for (const x of [-0.018, 0.018]) add(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 6), black, x, -0.07, -0.62, R); // folded bipod
  rifle.position.set(RB.x, RB.y, RB.z); rifle.scale.setScalar(RB.s); rifle.rotation.set(RB.rx, RB.ry, RB.rz);
  camera.add(rifle);
  // a short-range fill light so the rifle reads in every time of day (falls off before the crowd)
  const fill = new THREE.PointLight(0xfff2e0, 2.2, 1.4, 1); fill.position.set(0.05, 0.25, 0.05); camera.add(fill);
}
const muzzle = new THREE.PointLight(0xffc070, 0, 8, 2); muzzle.position.set(0.2, -0.15, -1.1); camera.add(muzzle);

// tracer + dust
const tracerGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0 })); tracer.frustumCulled = false; scene.add(tracer);
const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(40 * 3), 3)), new THREE.PointsMaterial({ color: 0xc8b8a0, size: 0.18, transparent: true, opacity: 0 }));
dust.frustumCulled = false; scene.add(dust); const dustVel = new Float32Array(40 * 3);

// ---------------------------------------------------------------- game state
const ZOOMS = [3, 6, 10];
const G = {
  state: 'title', li: 0, L: null, V: null, crowd: null, mark: null, plan: null, tl: 0,
  t: 0, shots: 3, used: 0, scoped: false, zoomIdx: 0, breath: 1, holding: false, exhausted: 0,
  yaw: 0, pitch: 0, baseYaw: 0, basePitch: 0, recoil: 0, shake: 0, timeScale: 1, slowT: 0, cooldown: 0,
  swapDone: false, parcelPending: false, leaving: false, ended: false, result: null, paused: false, cine: null,
};
window.__G = G;

function lookAtYawPitch(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

function clearWorld() {
  if (G.crowd) G.crowd.dispose();
  if (G.V) G.V.dispose();
  G.crowd = null; G.V = null;
}

function loadLevel(li, { attract = false } = {}) {
  clearWorld();
  const L = LEVELS[li];
  G.li = li; G.L = L;
  const seed = Q.has('seed') ? +Q.get('seed') + li * 7919 : (Math.random() * 1e9) | 0;
  const r = makeRng(seed);
  G.seed = seed;
  const V = buildVenue(scene, L.venue, L.tod, 1000 + li * 31);
  renderer.toneMappingExposure = V.exposure;
  const crowd = new Crowd(scene, V, L, r);
  const civ = crowd.people.filter((p) => p.civ && p.role !== 'vendor');
  const mark = r.pick(civ.filter((p) => p.role !== 'sit') .length ? civ.filter((p) => p.role !== 'sit') : civ);
  mark.isMark = true;
  const plan = planLevel(r, crowd.people, mark, L);
  // pacing habit turns people into pacers (role-level behaviour)
  for (const p of crowd.people) if (p.behave.pace && p.role !== 'vendor' && p.role !== 'police') { crowd.release(p); crowd.leaveGroup(p); p.role = 'pacer'; crowd.placeForRole(p, true); }
  crowd.buildMeshes();
  Object.assign(G, { V, crowd, mark, plan, tl: 0, t: 0, shots: 3, used: 0, scoped: false, zoomIdx: 0, breath: 1, holding: false, exhausted: 0, recoil: 0, shake: 0, timeScale: 1, slowT: 0, cooldown: 0, swapDone: false, parcelPending: false, leaving: false, ended: false, result: null, cine: null, panicLevel: 0, panicked: false, outT: 0, sirenT: 0, revealed: [...plan.briefing] });
  camera.position.copy(V.camPos);
  const yp = lookAtYawPitch(V.camPos, V.lookAt);
  G.baseYaw = G.yaw = yp.yaw; G.basePitch = G.pitch = yp.pitch;
  G.attract = attract;
  // par: you need the last piece of intel, plus a little time to act on it
  G.par = Math.round(Math.max(...plan.timeline.filter((e) => e.clue).map((e) => e.t), 30) + 25);
  // warm the crowd so nobody starts frozen mid-step
  for (let i = 0; i < 20; i++) crowd.update(0.05, ctxCb);
  crowd.render(0);
  // HUD
  $('lvlName').textContent = `${li + 1}. ${L.name.toUpperCase()}`;
  const list = $('intelList'); list.innerHTML = '';
  for (const c of plan.briefing) addIntel(c.text, c.kind, false);
  updateAmmo();
}

const ctxCb = {
  onEscape: (p) => { if (p === G.mark && !G.ended) endLevel(false, G.leaving && !G.panicked ? 'The mark slipped away when the clock ran out.' : 'The mark escaped through the exit.'); },
  onSwap: () => { if (!G.swapDone) { G.crowd.finishSwap(G.mark, G.plan.contact); G.swapDone = true; } },
};

// ---------------------------------------------------------------- HUD helpers
function addIntel(text, kind, fresh = true) {
  const li = document.createElement('li'); li.textContent = text; li.className = kind + (fresh ? ' new' : '');
  $('intelList').appendChild(li);
}
let radioTimer = 0;
function radio(text, dur = 6) { $('radio').classList.remove('hidden'); $('radio').querySelector('span').textContent = text; radioTimer = dur; Audio.radio(); }
let toastTimer = 0;
function toast(text, dur = 3) { $('toast').textContent = text; $('toast').classList.remove('hidden'); toastTimer = dur; }
function updateAmmo() { const bs = document.querySelectorAll('#ammo .b'); bs.forEach((b, i) => b.classList.toggle('spent', i >= G.shots)); }
function flash(o = 0.6) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = o; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }

function show(screen) {
  for (const id of ['title', 'brief', 'result', 'pause']) $(id).classList.toggle('hidden', id !== screen);
  const playing = screen === null;
  document.body.classList.toggle('res', screen === 'result'); // result card replaces the HUD
  $('hud').classList.toggle('hidden', !(playing || screen === 'result' || screen === 'pause'));
  $('touch').classList.toggle('hidden', !(playing && IS_TOUCH));
  if (IS_TOUCH) $('hint').classList.add('hidden');
}

// ---------------------------------------------------------------- title / levels
function unlocked(i) { return Q.has('all') || i <= save.cleared + 1; }
function buildLevelGrid() {
  const el = $('levels'); el.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button'); b.className = 'lv' + (unlocked(i) ? '' : ' locked');
    const best = save.best[i];
    b.innerHTML = `<div class="n">MISSION ${i + 1}</div><div class="t">${L.name}</div><div class="v">${VENUE_NAMES[L.venue]} &middot; ${L.crowd} people</div><div class="s">${best ? '★'.repeat(best.stars) + '<span style="opacity:.25">' + '★'.repeat(3 - best.stars) + '</span>' : unlocked(i) ? '<span style="opacity:.25">★★★</span>' : 'LOCKED'}</div>`;
    b.onclick = () => { if (!unlocked(i)) return; Audio.init(); Audio.click(); startLevel(i); };
    el.appendChild(b);
  });
}
function toTitle() {
  G.state = 'title'; exitLock();
  loadLevel(0, { attract: true });
  buildLevelGrid(); show('title');
  Audio.bed(true, 0); Audio.siren(false);
}
function startLevel(i, skipBrief = false) {
  Audio.init(); Audio.siren(false);
  loadLevel(i);
  if (skipBrief) beginPlay();
  else {
    G.state = 'brief';
    $('bLoc').textContent = VENUE_NAMES[G.L.venue].toUpperCase() + ' · ' + G.L.tod.toUpperCase();
    $('bName').textContent = G.L.name;
    $('bClues').innerHTML = G.plan.briefing.map((c) => `<li>${c.text}</li>`).join('');
    show('brief');
  }
  Audio.bed(true, 0);
}
function beginPlay() {
  tipI = 0; $('tip').classList.add('hidden');
  G.state = 'play'; G.paused = false; show(null);
  $('cross').classList.remove('hidden');
}

// ---------------------------------------------------------------- shooting
const ray = new THREE.Raycaster();
function aimRay(spread = 0) {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (spread) { dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize(); }
  ray.set(camera.position.clone(), dir); return ray.ray;
}
function groundT(rr) {
  // ground plane y = 0 (plaza), but also hit tall obstacles roughly as 2m boxes
  if (rr.direction.y >= -1e-4) return 400;
  return (0 - rr.origin.y) / rr.direction.y;
}
function fire() {
  if (G.state !== 'play' || G.paused) return;
  if (G.cooldown > 0) return;
  if (G.shots <= 0) { Audio.dry(); return; }
  G.shots--; G.used++; updateAmmo();
  G.cooldown = 1.15;
  Audio.shot(); Audio.bolt();
  G.recoil = G.scoped ? 0.05 : 0.035; G.shake = 0.5; flash(G.scoped ? 0.12 : 0.25);
  muzzle.intensity = 30;
  const rr = aimRay(G.scoped ? 0 : 0.01).clone();
  const hit = G.crowd.pick(rr);
  const gt = groundT(rr);
  const end = new THREE.Vector3();
  const from = camera.position.clone().add(new THREE.Vector3(0.2, -0.25, -0.5).applyQuaternion(camera.quaternion));
  if (hit && hit.t < gt + 0.5) {
    end.copy(rr.at(hit.t, new THREE.Vector3()));
    const p = hit.person;
    G.crowd.hit(p, camera.position.x, camera.position.z);
    setTracer(from, end);
    if (p === G.mark) {
      // the takedown: dramatic slow motion, camera locks onto the mark
      G.state = 'slowmo'; G.timeScale = 0.12; G.slowT = 2.6; G.cine = p; G.panicked = G.panicked || false;
      Audio.whoosh(); setTimeout(() => Audio.impactHit(), 250);
      $('vignette').classList.add('on');
      return;
    }
    // innocent
    G.timeScale = 0.25; G.slowT = 0.7; Audio.impactHit(); setTimeout(() => Audio.scream(), 200);
    toast(G.shots > 0 ? 'Innocent down. The crowd is panicking - the mark will run!' : 'Innocent down. Out of rounds.', 3.5);
    triggerPanic(p.x, p.z);
  } else {
    end.copy(rr.at(Math.min(gt, 300), new THREE.Vector3()));
    setTracer(from, end); puff(end);
    Audio.dust(); setTimeout(() => Audio.scream(), 150);
    toast(G.shots > 0 ? 'Miss! The crowd scatters - the mark is running.' : 'Miss. Out of rounds.', 3);
    triggerPanic(end.x, end.z);
  }
  if (G.shots <= 0) G.outT = 1.8;
}
function triggerPanic(x, z) {
  G.panicked = true; G.panicLevel = 1;
  G.crowd.panic(x, z, G.mark);
  Audio.alarm();
}
let tracerT = 0;
function setTracer(a, b) { const p = tracerGeo.attributes.position.array; p.set([a.x, a.y, a.z, b.x, b.y, b.z]); tracerGeo.attributes.position.needsUpdate = true; tracer.material.opacity = 0.9; tracerT = 0.35; }
let dustT = 0;
function puff(at) {
  const a = dust.geometry.attributes.position.array;
  for (let i = 0; i < 40; i++) { a[i * 3] = at.x; a[i * 3 + 1] = at.y + 0.05; a[i * 3 + 2] = at.z; dustVel[i * 3] = (Math.random() - 0.5) * 3; dustVel[i * 3 + 1] = Math.random() * 3; dustVel[i * 3 + 2] = (Math.random() - 0.5) * 3; }
  dust.geometry.attributes.position.needsUpdate = true; dust.material.opacity = 1; dustT = 1.2;
}
function tagAtCrosshair() {
  if (G.state !== 'play') return;
  const hit = G.crowd.pick(aimRay().clone());
  if (hit && !hit.person.fallen) { hit.person.tagged = !hit.person.tagged; hit.person.tagged ? Audio.tag() : Audio.untag(); }
}

// ---------------------------------------------------------------- level end
function endLevel(win, why) {
  if (G.ended) return;
  G.ended = true; G.state = 'result'; G.timeScale = 1;
  $('vignette').classList.remove('on'); Audio.siren(false);
  exitLock();
  const L = G.L, par = G.par;
  let stars = 0;
  if (win) { stars = Math.max(1, 4 - G.used - (G.t > par ? 1 : 0)); stars = Math.min(3, stars); }
  G.result = { win, stars, time: G.t, used: G.used, why };
  if (win) {
    const b = save.best[G.li];
    if (!b || stars > b.stars || (stars === b.stars && G.t < b.time)) save.best[G.li] = { stars, time: Math.round(G.t) };
    save.cleared = Math.max(save.cleared, G.li); persist();
    Audio.win();
  } else Audio.fail();
  // reveal: turn the camera onto the mark and ring them
  G.crowd.showRing(G.mark); if (!win) G.mark.tagged = true; // marker shows through cover
  G.reveal = { t: 0 };
  $('rTitle').textContent = win ? 'TARGET DOWN' : 'MISSION FAILED'; $('rTitle').className = win ? '' : 'fail';
  $('rStars').classList.toggle('hidden', !win);
  $('rStars').innerHTML = win ? [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('') : '';
  $('rWhy').textContent = win ? (G.used === 1 ? 'Clean. One round, one mark.' : `Mark neutralised with ${G.used} rounds.`) : why + ' The red ring shows who it was.';
  $('rMark').innerHTML = '<b>THE MARK:</b> ' + describe(G.mark) + '<ul>' + G.plan.used.map((c) => `<li class="${G.revealed.includes(c) ? '' : 'unseen'}">${c.text}</li>`).join('') + '</ul>';
  $('rStats').innerHTML = `TIME ${fmtTime(G.t)} &nbsp; PAR ${fmtTime(par)} &nbsp; ROUNDS ${G.used}/3` + (save.best[G.li] ? `<br>BEST ${'★'.repeat(save.best[G.li].stars)} ${fmtTime(save.best[G.li].time)}` : '');
  $('nextBtn').classList.toggle('hidden', !(win && G.li < LEVELS.length - 1) && !(G.li < LEVELS.length - 1 && unlocked(G.li + 1)));
  $('rKeys').innerHTML = $('nextBtn').classList.contains('hidden') ? 'R retry' : 'R retry &middot; Enter next';
  $('scope').classList.add('hidden'); $('cross').classList.add('hidden'); $('breath').classList.add('hidden'); $('escape').classList.add('hidden');
  $('radio').classList.add('hidden'); $('tip').classList.add('hidden'); radioTimer = 0; tipT = 0;
  G.scoped = false;
  setTimeout(() => { if (G.state === 'result') show('result'); }, win ? 300 : 1400);
}

function describe(p) {
  const l = p.look, out = [];
  out.push(l.top + ' top', l.bottom + ' ' + (l.bottomType === 'skirt' ? 'skirt' : 'trousers'));
  out.push(l.hat === 'none' ? 'no hat, ' + l.hair + ' hair' : l.hatColor + ' ' + ({ cap: 'cap', fedora: 'fedora', beanie: 'beanie', sunhat: 'sun hat' }[l.hat] || 'hat'));
  if (l.glasses) out.push('sunglasses');
  if (l.bag !== 'none') out.push(l.bagColor + ' ' + ({ backpack: 'backpack', shoulder: 'shoulder bag', briefcase: 'briefcase' }[l.bag]));
  if (l.handItem !== 'none') out.push(l.handItem + ' in the ' + (l.hand === 'L' ? 'left' : 'right') + ' hand');
  return out.join(', ');
}

// first-mission coaching (only until mission 1 has been cleared once)
const TIPS = [
  [3, 'Hold RIGHT MOUSE (or Q) to look through the scope. Wheel zooms 3x / 6x / 10x.', 'Tap SCOPE (or pinch) to look closer. ZOOM cycles 3x / 6x / 10x.'],
  [11, 'Compare people with the TARGET PROFILE (top left). Press E to tag a suspect.', 'Compare people with the TARGET PROFILE. TAG marks a suspect.'],
  [26, 'Blue dots are habits - you have to SEE them happen. Hold SHIFT to steady your aim.', 'Blue dots are habits - you have to SEE them happen. HOLD BREATH steadies your aim.'],
  [52, 'Sure? Crosshair on them, then CLICK or SPACE. A wrong shot panics the crowd.', 'Sure? Crosshair on them, then FIRE. A wrong shot panics the crowd.'],
];
let tipI = 0, tipT = 0;
function tip(text, dur = 6) { $('tip').textContent = text; $('tip').classList.remove('hidden'); tipT = dur; }

// ---------------------------------------------------------------- timeline
function runTimeline() {
  if (G.li === 0 && !save.best[0] && tipI < TIPS.length && G.t >= TIPS[tipI][0]) { tip(TIPS[tipI][IS_TOUCH ? 2 : 1]); tipI++; }
  const tl = G.plan.timeline;
  while (G.tl < tl.length && G.t >= tl[G.tl].t) {
    const e = tl[G.tl];
    if (e.clue) {
      if (e.clue.after && !G.swapDone) {
        if (G.t < e.t + 25) break; // wait for the hand-off to happen on screen
        G.crowd.finishSwap(G.mark, G.plan.contact); G.swapDone = true;
      }
      addIntel(e.clue.text, e.clue.kind); G.revealed.push(e.clue);
      radio('New intel: ' + e.clue.text + '.');
    } else if (e.radio) radio(e.radio);
    else if (e.event === 'siren') {
      Audio.siren(true); G.sirenT = 8; G.crowd.siren(G.mark);
      radio('Police sirens on the way through. Watch who gets jumpy.');
      addIntel('Siren passing - watch who flinches and hurries off', 'event');
    } else if (e.event === 'parcel') {
      if (G.crowd.startParcel(G.mark)) G.parcelPending = true;
    } else if (e.event === 'swap') {
      if (!G.crowd.startSwap(G.mark, G.plan.contact)) { G.crowd.finishSwap(G.mark, G.plan.contact); G.swapDone = true; }
      else radio('Heads up: the mark may be meeting a contact for a hand-off.');
    }
    G.tl++;
  }
  if (G.parcelPending && G.crowd.parcelAt) {
    G.parcelPending = false;
    const pa = G.crowd.parcelAt; let best = G.V.landmarks[0], bd = 1e9;
    for (const l of G.V.landmarks) { const d = Math.hypot(l.x - pa.x, l.z - pa.z); if (d < bd) { bd = d; best = l; } }
    const where = bd < 9 ? `near the ${best.name}` : `${pa.x < 0 ? 'on the left' : 'on the right'} side, ${pa.z < 0 ? 'close to us' : 'far side'}`;
    radio(`Drone feed: someone just left a parcel on the ground ${where}. That was the mark.`);
    addIntel(`Mark left a parcel on the ground ${where}`, 'event');
  }
}

// ---------------------------------------------------------------- input
let locked = false, noLock = Q.has('nolock') || IS_TOUCH, drag = null;
function exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && G.state === 'play' && !G.ended && !IS_TOUCH && !noLock) { G.scoped = false; G.holding = false; if (!G.paused) togglePause(); } });
document.addEventListener('pointerlockerror', () => { noLock = true; });
function sens() { return (camera.fov / BASE_FOV) * 0.0022; }
function aimBy(dx, dy, k) { G.yaw -= dx * k; G.pitch -= dy * k; clampAim(); }
function clampAim() { G.yaw = G.baseYaw + clamp(angDiff(G.baseYaw, G.yaw), -0.85, 0.85); G.pitch = clamp(G.pitch, Math.max(G.basePitch - 0.55, -1.0), G.basePitch + 0.42); }
function setScope(on) {
  if (G.state !== 'play' && on) return;
  if (on !== G.scoped) { G.scoped = on; if (on) Audio.scopeIn(); }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  Audio.init();
  if (G.state !== 'play' || IS_TOUCH) return;
  if (e.button === 2) { setScope(true); return; }
  if (e.button === 1) { tagAtCrosshair(); e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (locked) { fire(); return; }
  if (!noLock) { try { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => { noLock = true; }); } catch (err) { noLock = true; } return; }
  drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
});
addEventListener('mouseup', (e) => {
  if (e.button === 2) setScope(false);
  if (e.button === 0 && drag) { if (drag.moved < 6 && performance.now() - drag.t < 350) fire(); drag = null; }
});
addEventListener('mousemove', (e) => {
  if (G.state !== 'play' || G.paused) return;
  if (locked) { aimBy(e.movementX, e.movementY, sens()); return; }
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; aimBy(dx, dy, dragSens()); }
});
function dragSens() { return (camera.fov * Math.PI / 180) / innerHeight; }
addEventListener('wheel', (e) => {
  if (G.state !== 'play') return;
  if (e.deltaY < 0) { if (!G.scoped) { setScope(true); G.wheelScope = true; } else if (G.zoomIdx < 2) { G.zoomIdx++; Audio.zoom(); } }
  else { if (G.scoped && G.zoomIdx > 0) { G.zoomIdx--; Audio.zoom(); } else if (G.scoped && G.wheelScope) { setScope(false); G.wheelScope = false; } }
}, { passive: true });
addEventListener('keydown', (e) => {
  Audio.init();
  const k = e.key.toLowerCase();
  if (G.state === 'brief' && (k === 'enter' || k === ' ')) { beginPlay(); return; }
  if (G.state === 'result') { if (k === 'r') startLevel(G.li, true); if (k === 'enter' || k === 'n') { if (!$('nextBtn').classList.contains('hidden')) startLevel(G.li + 1); } return; }
  if (G.state === 'title' && (k === 'enter' || k === ' ')) { $('playBtn').click(); return; }
  if (k === 'm') toggleMute();
  if (G.state !== 'play') return;
  if (k === 'p' || (k === 'escape' && noLock)) { togglePause(); return; }
  if (G.paused) return;
  if (k === 'shift') G.holding = true;
  if (k === ' ' || k === 'f') { fire(); e.preventDefault(); }
  if (k === 'e') tagAtCrosshair();
  if (k === 'q') setScope(!G.scoped);
  if (k === '1' || k === '2' || k === '3') { G.zoomIdx = +k - 1; setScope(true); Audio.zoom(); }
  if (k === 'r') startLevel(G.li, true);
  if (k === 'tab') { $('intel').classList.toggle('collapsed'); e.preventDefault(); }
  if (k === 'arrowleft') aimBy(-30, 0, sens()); if (k === 'arrowright') aimBy(30, 0, sens());
  if (k === 'arrowup') aimBy(0, -30, sens()); if (k === 'arrowdown') aimBy(0, 30, sens());
});
addEventListener('keyup', (e) => { if (e.key === 'Shift') G.holding = false; });
addEventListener('blur', () => { G.holding = false; });

// touch: one finger drags the aim, two fingers pinch the zoom
const touches = new Map(); let pinch0 = 0;
canvas.addEventListener('touchstart', (e) => {
  Audio.init(); e.preventDefault();
  for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
  if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (G.state !== 'play' || G.paused) return;
  for (const t of e.changedTouches) {
    const o = touches.get(t.identifier); if (!o) continue;
    if (touches.size === 1) aimBy(t.clientX - o.x, t.clientY - o.y, dragSens() * 0.9);
    o.x = t.clientX; o.y = t.clientY;
  }
  if (touches.size === 2) {
    const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d / pinch0 > 1.35) { if (!G.scoped) setScope(true); else if (G.zoomIdx < 2) G.zoomIdx++; Audio.zoom(); pinch0 = d; }
    else if (d / pinch0 < 0.74) { if (G.zoomIdx > 0) G.zoomIdx--; else setScope(false); Audio.zoom(); pinch0 = d; }
  }
}, { passive: false });
const endTouch = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); };
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
const tbtn = (id, down, up) => { const b = $(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); Audio.init(); down(b); }, { passive: false }); b.addEventListener('mousedown', (e) => { e.stopPropagation(); Audio.init(); down(b); }); if (up) { b.addEventListener('touchend', (e) => { e.preventDefault(); up(b); }); b.addEventListener('mouseup', () => up(b)); b.addEventListener('mouseleave', () => up(b)); } };
tbtn('tFire', () => fire());
tbtn('tScope', () => setScope(!G.scoped));
tbtn('tZoom', () => { if (!G.scoped) setScope(true); else G.zoomIdx = (G.zoomIdx + 1) % 3; Audio.zoom(); });
tbtn('tBreath', (b) => { G.holding = true; b.classList.add('on'); }, (b) => { G.holding = false; b.classList.remove('on'); });
tbtn('tTag', () => tagAtCrosshair());

// buttons
$('playBtn').onclick = () => { Audio.init(); Audio.click(); let i = 0; while (i < LEVELS.length - 1 && save.best[i]) i++; startLevel(i); };
$('goBtn').onclick = () => { Audio.init(); Audio.click(); beginPlay(); };
$('retryBtn').onclick = () => { Audio.click(); startLevel(G.li, true); };
$('nextBtn').onclick = () => { Audio.click(); startLevel(Math.min(LEVELS.length - 1, G.li + 1)); };
$('menuBtn').onclick = () => { Audio.click(); toTitle(); };
$('muteBtn').onclick = (e) => { e.stopPropagation(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.stopPropagation(); togglePause(); };
$('resumeBtn').onclick = () => togglePause();
$('pRestart').onclick = () => { startLevel(G.li, true); };
$('pMenu').onclick = () => { toTitle(); };
$('intelHead').onclick = () => { $('intel').classList.toggle('collapsed'); $('intelToggle').textContent = $('intel').classList.contains('collapsed') ? '+' : '-'; };
function toggleMute() { save.muted = !Audio.muted; Audio.setMuted(save.muted); persist(); $('muteBtn').classList.toggle('off', save.muted); }
function togglePause() { if (G.state !== 'play') return; G.paused = !G.paused; if (G.paused) { exitLock(); show('pause'); } else show(null); }
$('muteBtn').classList.toggle('off', save.muted);

// ---------------------------------------------------------------- main loop
let last = performance.now(), realT = 0, beatT = 0, wasHolding = false, lastBed = -1;
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  step(rdt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function step(rdt) {
  realT += rdt;
  if (G.paused) return;
  // time scale (slow motion)
  if (G.slowT > 0) { G.slowT -= rdt; if (G.slowT <= 0) { if (G.state === 'slowmo') { endLevel(true); } G.timeScale = 1; } }
  const dt = rdt * G.timeScale;
  const live = G.state === 'play' || G.state === 'slowmo' || G.state === 'brief' || G.state === 'title' || G.state === 'result';
  if (live && G.crowd) {
    if (G.state === 'play') {
      G.t += dt;
      runTimeline();
      if (G.outT > 0) { G.outT -= rdt; if (G.outT <= 0 && !G.ended) endLevel(false, 'Out of rounds. The mark walked away.'); }
      if (!G.leaving && G.t >= G.L.time) { G.leaving = true; G.crowd.leave(G.mark); radio('Control: time is up - the mark is leaving. Last chance!'); Audio.alarm(); }
    }
    G.crowd.update(dt, ctxCb);
    G.V.update(realT, dt);
  }
  // siren light
  if (G.sirenT > 0) { G.sirenT -= dt; G.V.siren.intensity = 40 * (Math.sin(realT * 14) > 0 ? 1 : 0); G.V.siren.color.setHex(Math.sin(realT * 7) > 0 ? 0xff2020 : 0x2040ff); if (G.sirenT <= 0) { Audio.siren(false); G.V.siren.intensity = 0; } }
  G.panicLevel = Math.max(0, (G.panicLevel || 0) - rdt * 0.08);
  if (Math.abs(G.panicLevel - lastBed) > 0.03 || (G.panicLevel === 0 && lastBed !== 0)) { lastBed = G.panicLevel; Audio.bed(true, G.panicLevel); }

  // ---- aim, breath, sway, recoil
  G.cooldown -= rdt;
  const playing = G.state === 'play';
  if (playing && G.scoped) {
    if (G.holding && G.exhausted <= 0 && G.breath > 0) { G.breath -= rdt / 4.2; if (!wasHolding) Audio.breathIn(); wasHolding = true; beatT -= rdt; if (beatT <= 0) { Audio.heartbeat(); beatT = 0.85; } if (G.breath <= 0) { G.breath = 0; G.exhausted = 2.6; Audio.breathOut(); } }
    else { if (wasHolding && G.exhausted <= 0) Audio.breathOut(); wasHolding = false; G.breath = Math.min(1, G.breath + rdt / 3.2); }
  } else { wasHolding = false; G.breath = Math.min(1, G.breath + rdt / 3.2); }
  G.exhausted -= rdt;
  const steady = playing && G.scoped && G.holding && G.exhausted <= 0 && G.breath > 0;
  const swayK = G.scoped ? (steady ? 0.1 : G.exhausted > 0 ? 2.3 : 1) : 0.25;
  const sa = G.noSway ? 0 : 0.0042 * swayK;
  const swayY = (Math.sin(realT * 0.71) * 0.7 + Math.sin(realT * 1.93 + 1) * 0.3) * sa;
  const swayP = (Math.sin(realT * 1.13 + 2) * 0.6 + Math.sin(realT * 2.4) * 0.25 + Math.sin(realT * 0.37) * 0.3) * sa;
  G.recoil *= Math.exp(-rdt * 5); G.shake *= Math.exp(-rdt * 7);
  const sh = G.shake * 0.01;
  let yaw = G.yaw, pitch = G.pitch;
  if (G.attract) { yaw = G.baseYaw + Math.sin(realT * 0.06) * 0.35; pitch = G.basePitch + 0.05 + Math.sin(realT * 0.09) * 0.04; }
  // cinematic: during the takedown and after the level ends, swing toward the mark
  let fovTarget = G.scoped ? BASE_FOV / ZOOMS[G.zoomIdx] : BASE_FOV;
  if ((G.state === 'slowmo' || G.state === 'result') && G.mark && G.crowd) {
    const m = G.mark; const tgt = new THREE.Vector3(m.x, (m.fallen ? 0.3 : 1.0), m.z);
    const yp = lookAtYawPitch(camera.position, tgt);
    const k = 1 - Math.exp(-rdt * (G.state === 'slowmo' ? 3 : 2));
    G.yaw += angDiff(G.yaw, yp.yaw) * k; G.pitch += (yp.pitch - G.pitch) * k; yaw = G.yaw; pitch = G.pitch;
    const dist = camera.position.distanceTo(tgt);
    fovTarget = clamp((2 * Math.atan((G.state === 'slowmo' ? 2.4 : 7) / dist) * 180) / Math.PI, 2.5, 24);
    if (G.state === 'result') {
      // centre the mark in the open strip above the results card (not under the old HUD)
      const card = $('result').querySelector('.card'), H = innerHeight;
      const top = card ? Math.max(60, card.getBoundingClientRect().top) : H * 0.3;
      pitch -= Math.atan((1 - top / H) * Math.tan((camera.fov * Math.PI / 180) / 2));
    }
  }
  camera.rotation.set(pitch + swayP + G.recoil + (Math.random() - 0.5) * sh, yaw + swayY + (Math.random() - 0.5) * sh, 0);
  camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-rdt * 14));
  camera.updateProjectionMatrix();
  rifle.visible = !G.scoped && G.state !== 'slowmo' && G.state !== 'result' && G.state !== 'title' && G.state !== 'brief';
  rifle.position.z = RB.z + G.recoil * 2; rifle.rotation.x = RB.rx + G.recoil * 4;
  muzzle.intensity *= Math.exp(-rdt * 30);
  // effects
  if (tracerT > 0) { tracerT -= rdt; tracer.material.opacity = Math.max(0, tracerT / 0.35) * 0.9; }
  if (dustT > 0) { dustT -= dt; const a = dust.geometry.attributes.position.array; for (let i = 0; i < 40; i++) { dustVel[i * 3 + 1] -= 6 * dt; a[i * 3] += dustVel[i * 3] * dt; a[i * 3 + 1] = Math.max(0, a[i * 3 + 1] + dustVel[i * 3 + 1] * dt); a[i * 3 + 2] += dustVel[i * 3 + 2] * dt; } dust.geometry.attributes.position.needsUpdate = true; dust.material.opacity = Math.max(0, dustT / 1.2); }
  if (G.state === 'result' && G.mark && G.crowd) G.crowd.showRing(G.mark); // the ring follows a mark that walks off
  if (G.crowd) G.crowd.render(realT);

  // ---- HUD
  const showScope = G.scoped && (G.state === 'play');
  $('scope').classList.toggle('hidden', !showScope);
  $('cross').classList.toggle('hidden', !(G.state === 'play' && !G.scoped));
  $('zoomLbl').textContent = ZOOMS[G.zoomIdx] + 'x';
  $('breath').classList.toggle('hidden', !showScope);
  $('hint').style.opacity = showScope || G.state !== 'play' ? 0 : 1;
  $('breathFill').style.width = (G.breath * 100).toFixed(0) + '%';
  $('breath').classList.toggle('out', G.exhausted > 0);
  if (G.L && (playing || G.state === 'slowmo')) {
    const left = G.L.time - G.t;
    $('clock').textContent = left > 0 ? fmtTime(left) : 'LEAVING';
    $('clock').classList.toggle('low', left < 30);
    const m = G.mark;
    const fleeing = m && !m.down && (m.mode === 'flee' || m.mode === 'leave') && m.exit;
    $('escape').classList.toggle('hidden', !fleeing);
    if (fleeing) { const d = Math.hypot(m.exit.x - m.x, m.exit.z - m.z); $('escape').querySelector('span').textContent = (d / (m.runSpeed || 1.4)).toFixed(1) + 's'; $('escape').firstChild.textContent = m.mode === 'flee' ? 'MARK ESCAPING ' : 'MARK LEAVING '; }
  }
  if (radioTimer > 0) { radioTimer -= rdt; if (radioTimer <= 0) $('radio').classList.add('hidden'); }
  if (tipT > 0) { tipT -= rdt; if (tipT <= 0 || G.state !== 'play') { tipT = 0; $('tip').classList.add('hidden'); } }
  if (toastTimer > 0) { toastTimer -= rdt; if (toastTimer <= 0) $('toast').classList.add('hidden'); }
}

// ---------------------------------------------------------------- test hooks
Object.assign(G, {
  LEVELS,
  start: (i, brief = false) => startLevel(i, !brief),
  begin: () => beginPlay(),
  fire: () => fire(),
  scope: (on, z = 0) => { G.zoomIdx = z; setScope(on); },
  aimAt: (p, y = 1.2) => { const yp = lookAtYawPitch(camera.position, new THREE.Vector3(p.x, (p.rootY || 0) + y * (p.look.h / 1.75), p.z)); G.yaw = yp.yaw; G.pitch = yp.pitch; },
  aimPoint: (x, y, z) => { const yp = lookAtYawPitch(camera.position, new THREE.Vector3(x, y, z)); G.yaw = yp.yaw; G.pitch = yp.pitch; },
  // advance the simulation quickly without rendering every step
  fast: (sec, dt = 1 / 30) => { const was = renderer.render; for (let s = 0; s < sec; s += dt) step(dt); },
  candidates: () => G.crowd.people.filter((p) => p.civ && !p.down && G.revealed.every((c) => c.test(p))),
  allClues: () => G.plan.used.map((c) => c.text),
  peopleInView: () => G.crowd.people.length,
  stepFrame: (dt = 1 / 60) => step(dt),
  pickCenter: () => { const h = G.crowd.pick(aimRay().clone()); return h && h.person; },
  syncCam: () => { camera.rotation.set(G.pitch, G.yaw, 0); camera.updateMatrixWorld(); },
  render: () => renderer.render(scene, camera),
  camera, scene, renderer, rifle, RB,
});

// ---------------------------------------------------------------- boot
if (Q.has('play')) { Audio.bed(false); startLevel(Q.has('level') ? +Q.get('level') : 0, true); }
// a first visit (nothing cleared or played) goes straight to mission 1's briefing; ?title forces the menu
else if (!Q.has('title') && save.cleared < 0 && !Object.keys(save.best).length) startLevel(0);
else toTitle();
requestAnimationFrame(frame);
