/* =====================================================================
   LIGHTS OUT
   =====================================================================
   You are standing in a dark house holding a torch. There are six light
   switches. Turn them all on and you can leave.

   THE RULE THE WHOLE GAME HANGS OFF:

     torch ON   you cannot take a step. You can turn, and anything your
                beam is actually on stops dead where it stands.
     torch OFF  you can run. Everything in the house starts moving, and
                you cannot see any of it.

   So the beam is not a light, it is a leash. Every switch on the far
   side of the room has to be paid for in seconds of darkness, and the
   only thing you can spend instead of those seconds is a blanket -
   throw one over something and it spends four seconds getting out from
   under it, whether the lights are on or not.

   A room whose switch you have flipped stays lit for good, and they will
   not walk into a lit room. The house does not get easier because you
   got better at it. It gets smaller.
   ===================================================================== */
import * as THREE from '../vendor/three.module.js';
import { makeRenderer, ps1ify, paint, rng, RES, Post, setAniso } from './real.js';
import { makeCreature, poseCreature } from './creature.js';
import * as Menu from './menu.js';
import { buildHouse, TILE, COLS, ROWS } from './house.js';

const canvas = document.getElementById('screen');
const renderer = makeRenderer(canvas);
setAniso(renderer);
const post = new Post(renderer, RES.w, RES.h);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
/* fog that swallows everything past the beam - the reason the dark is a
   place rather than an absence */
scene.fog = new THREE.FogExp2(0x05060a, 0.022);

const camera = new THREE.PerspectiveCamera(68, RES.w / RES.h, 0.1, 260);
camera.rotation.order = 'YXZ';

const house = buildHouse(scene);

/* barely-there ambient, so an unlit room is a shape and not a void */
scene.add(new THREE.AmbientLight(0x10141c, 1.4));

/* ---- the torch ---------------------------------------------------------
   A spot on the camera. Its cone is also the hit test for what is safe:
   whatever the beam is on does not move.

   IT CASTS SHADOWS NOW, and that single change is most of the horror in
   the game: a doorframe throws a hard edge across the room behind it, a
   chair puts a leg-shaped bar of dark on the wall, and something
   standing in the beam has a shadow that arrives before it does. The map
   is 2048 and the shadow camera is fitted to the beam rather than left at
   its default - resolution spent outside the cone is resolution burnt.

   A REAL TORCH ALSO IS NOT STEADY. The intensity is multiplied by a tiny
   slow flicker (see the frame loop), which reads as a bulb and a battery
   rather than as a light source in a renderer. */
const torch = new THREE.SpotLight(0xfff0d0, 0, 90, 0.40, 0.55, 1.0);
torch.position.set(0, 0, 0);
torch.castShadow = true;
torch.shadow.mapSize.set(2048, 2048);
torch.shadow.camera.near = 0.6;
torch.shadow.camera.far = 70;
torch.shadow.bias = -0.0012;
torch.shadow.normalBias = 0.03;
torch.shadow.focus = 1.0;
const torchTarget = new THREE.Object3D();
camera.add(torch);
camera.add(torchTarget);
torchTarget.position.set(0, 0, -1);
torch.target = torchTarget;
scene.add(camera);

/* a very weak second source at the lens, so the first metre in front of
   you is not a black hole when the beam is pointed past something */
const spill = new THREE.PointLight(0xbfc8d8, 1.6, 16, 1.6);
camera.add(spill);

/* ---- the things in the house ------------------------------------------- */
const foeMat = ps1ify(new THREE.MeshLambertMaterial({
  color: 0x2f3540,
  map: paint(32, 48, (g) => {
    const R = rng(53);
    g.fillStyle = '#20242c'; g.fillRect(0, 0, 32, 48);
    g.fillStyle = '#2b3038'; g.fillRect(0, 0, 32, 14);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(10,12,16,' + (0.2 + R() * 0.5).toFixed(2) + ')';
      g.fillRect((R() * 32) | 0, (R() * 48) | 0, 1, R() > 0.8 ? 4 : 1);
    }
    /* two pale marks where a face would be. Nothing else. */
    g.fillStyle = '#c9c2ae'; g.fillRect(9, 6, 4, 2); g.fillRect(19, 6, 4, 2);
  }),
}));
const blanketMat = ps1ify(new THREE.MeshLambertMaterial({
  map: paint(16, 16, (g) => {
    const R = rng(71);
    g.fillStyle = '#8d7f66'; g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = R() > 0.5 ? '#7a6d56' : '#9c8f76';
      g.fillRect((R() * 16) | 0, (R() * 16) | 0, 2, 1);
    }
  }),
}));

/* THE THING ITSELF is in creature.js now: nine feet, folded forward,
   arms past the knee, no face, and knees that bend the wrong way. Two
   materials - one that is nearly black and reflects almost nothing, and
   one wet line where a mouth would be, which is the only shine on it. */
const skinMat = new THREE.MeshStandardMaterial({
  // just light enough that the beam finds it. Any darker and it is a
  // hole in the image rather than a thing standing in the room.
  color: 0x262a33, roughness: 0.82, metalness: 0.03,
  map: paint(128, 256, (g) => {
    const R = rng(53);
    g.fillStyle = '#171a20'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = 'rgba(6,7,10,' + (0.10 + R() * 0.45).toFixed(2) + ')';
      g.fillRect((R() * 128) | 0, (R() * 256) | 0, 1 + (R() > 0.9 ? 2 : 0), 1);
    }
    /* long vertical striations, like something that has been stretched */
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(30,34,42,' + (0.05 + R() * 0.2).toFixed(2) + ')';
      g.fillRect((R() * 128) | 0, (R() * 256) | 0, 1, 20 + R() * 70);
    }
  }),
});
const wetMat = new THREE.MeshStandardMaterial({
  color: 0x2a0f12, roughness: 0.18, metalness: 0.1,
});

const foes = [];
for (const s of house.spawns) foes.push(makeCreature(scene, s[0], s[1], { skin: skinMat, wet: wetMat }));

/* EVERYTHING IN THE HOUSE CASTS AND RECEIVES.
   Done once, here, rather than as a flag on every mesh in house.js -
   there is nothing in this game that should not take the torch's
   shadow, and a shadow that is missing from one object is the thing
   that tells a player the scene is fake. */
scene.traverse((o) => {
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
});

/* the blankets you have not picked up yet */
const pickups = [];
for (const b of house.blankets) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), blanketMat);
  m.position.set(b.x, 0.3, b.z);
  scene.add(m);
  pickups.push({ mesh: m, taken: false });
}

/* ---- state -------------------------------------------------------------- */
const P = {
  x: house.start[0], z: house.start[1], yaw: 0, pitch: 0,
  torch: true, blankets: 2, alive: true, won: false,
  // TORCH BRIGHTNESS IS IN PHYSICAL UNITS. three r169 has no legacy
  // lighting mode, so a SpotLight's intensity is candela and the falloff
  // is real: at 900 the wall six feet in front of you came back at pure
  // white, which is a torch that hides the house as effectively as no
  // torch at all. 250 with decay 1 puts the near wall at about 70% and
  // still reaches the far side of a room.
  lit: 0, panic: 0, t: 0, dark: 0, best: 0, power: 250,
  /* the house waits on the home screen until you ask to go in */
  phase: 'home', typed: '', lastDark: null, homeBtn: null,
};
const EYE = 5.2;

/* ---- input --------------------------------------------------------------- */
const keys = {};
addEventListener('keydown', (e) => {
  /* the three-initials prompt owns the keyboard while it is up */
  if (P.phase === 'entry') {
    if (e.key === 'Enter') {
      Menu.setName(P.typed || 'YOU');
      Menu.submit(P.lastDark, P.lit, P.typed || 'YOU');
      P.phase = 'home';
    } else if (e.key === 'Backspace') P.typed = P.typed.slice(0, -1);
    else if (/^[a-zA-Z0-9]$/.test(e.key) && P.typed.length < 3) P.typed += e.key.toUpperCase();
    e.preventDefault();
    return;
  }
  keys[e.code] = true;
  if (['Space', 'KeyF', 'KeyE', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyF' || e.code === 'Space') toggleTorch();
  if (e.code === 'KeyQ') throwBlanket();
  if (e.code === 'KeyE') flipSwitch();
  if (e.code === 'KeyR' && (!P.alive || P.won)) location.reload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

canvas.addEventListener('click', (e) => {
  /* ON THE HOME SCREEN the click is a button press, not a request for
     the pointer lock - locking the pointer on a menu is the thing that
     makes a game feel like it has stolen your mouse. */
  if (P.phase === 'home') {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * UIW;
    const y = (e.clientY - r.top) / r.height * UIH;
    const b = P.homeBtn;
    if (b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
      P.phase = 'play';
      canvas.requestPointerLock();
      snd(320, 120, 'triangle', 0.05, 640);
    }
    return;
  }
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  P.yaw -= e.movementX * 0.0022;
  P.pitch -= e.movementY * 0.0018;
  P.pitch = Math.max(-0.7, Math.min(0.55, P.pitch));
});
addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 2) throwBlanket();
  else toggleTorch();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---- sound ---------------------------------------------------------------- */
let AC = null;
function snd(freq, ms, type, vol, slide) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, AC.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + ms / 1000);
    g.gain.value = vol === undefined ? 0.05 : vol;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + ms / 1000);
    o.connect(g).connect(AC.destination);
    o.start(); o.stop(AC.currentTime + ms / 1000);
  } catch (e) { /* no audio, no problem */ }
}

/* IT MAKES A NOISE WHEN IT IS ON TOP OF YOU.
   Filtered noise with the cutoff swept down, which is the cheapest thing
   that sounds organic rather than electronic - and it only fires when
   something is inside seven units in the dark, so it is information
   ("that is CLOSE") and not decoration. */
let lastScreech = -9;
function screech() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const n = AC.sampleRate * 0.9;
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const s = AC.createBufferSource(); s.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4.5;
    f.frequency.setValueAtTime(1500, AC.currentTime);
    f.frequency.exponentialRampToValueAtTime(180, AC.currentTime + 0.85);
    const g = AC.createGain(); g.gain.value = 0.16;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.9);
    s.connect(f).connect(g).connect(AC.destination);
    s.start();
  } catch (e) {}
}

function toggleTorch() {

  if (!P.alive || P.won) return;
  P.torch = !P.torch;
  snd(P.torch ? 900 : 300, 45, 'square', 0.04, P.torch ? 1400 : 160);
}

function throwBlanket() {
  if (!P.alive || P.won || P.blankets <= 0) return;
  /* it goes on the nearest thing roughly in front of you, lit or not -
     which is the point: it is the one move that works blind */
  let best = null, bestD = 1e9;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  for (const f of foes) {
    if (f.userData.stun > 0) continue;
    const dx = f.position.x - P.x, dz = f.position.z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > 26) continue;
    const dot = (dx / d) * fx + (dz / d) * fz;
    if (dot < 0.55) continue;
    if (d < bestD) { bestD = d; best = f; }
  }
  P.blankets--;
  snd(210, 220, 'triangle', 0.05, 90);
  if (!best) { P.miss = 1.2; return; }
  best.userData.stun = 4;
  if (!best.userData.cloth) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 1.7), blanketMat);
    c.position.y = 3.4;
    best.add(c);
    best.userData.cloth = c;
  }
  best.userData.cloth.visible = true;
  snd(140, 320, 'sawtooth', 0.05, 70);
}

function flipSwitch() {
  if (!P.alive || P.won) return;
  for (const s of house.switches) {
    if (s.on) continue;
    if (Math.hypot(s.x - P.x, s.z - P.z) > TILE * 1.2) continue;
    s.on = true;
    s.mesh.material = s.onMat;
    s.lamp.intensity = 420;
    s.bulb.material = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
    P.lit++;
    snd(1200, 70, 'square', 0.05, 700);
    snd(520, 400, 'triangle', 0.04, 620);
    if (P.lit >= house.switches.length) {
      P.won = true; snd(300, 900, 'triangle', 0.06, 900);
      // the board is seconds spent in the DARK, not total time - see menu.js
      P.lastDark = P.dark;
      if (Menu.qualifies(P.dark)) { P.phase = 'entry'; P.typed = Menu.playerName() === 'YOU' ? '' : Menu.playerName(); }
    }
    return;
  }
  P.noSwitch = 0.9;
}

/* ---- is a thing in the beam --------------------------------------------- */
const fwd = new THREE.Vector3();
function inBeam(f) {
  if (!P.torch) return false;
  const dx = f.position.x - P.x, dz = f.position.z - P.z;
  const d = Math.hypot(dx, dz);
  if (d > 70) return false;
  camera.getWorldDirection(fwd);
  const dot = (dx / d) * fwd.x + (dz / d) * fwd.z;
  if (dot < Math.cos(0.46)) return false;
  return clearLine(P.x, P.z, f.position.x, f.position.z);
}
function clearLine(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const n = Math.ceil(Math.hypot(dx, dz) / 1.2);
  for (let i = 1; i < n; i++)
    if (house.solid(x0 + dx * i / n, z0 + dz * i / n)) return false;
  return true;
}

/* ---- moving against the walls -------------------------------------------- */
function slide(o, dx, dz, r) {
  if (!house.solid(o.x + dx + Math.sign(dx) * r, o.z)) o.x += dx;
  if (!house.solid(o.x, o.z + dz + Math.sign(dz) * r)) o.z += dz;
}

/* ---- one frame ------------------------------------------------------------ */
let last = performance.now(), acc = 0;
const STEP = 1 / 60;

function step(dt) {
  if (P.phase !== 'play') return;      // nothing moves on the home screen
  P.t += dt;
  if (!P.alive || P.won) return;
  if (P.miss > 0) P.miss -= dt;
  if (P.noSwitch > 0) P.noSwitch -= dt;

  /* turning is free; walking costs you the light */
  if (keys.ArrowLeft) P.yaw += 1.9 * dt;
  if (keys.ArrowRight) P.yaw -= 1.9 * dt;

  let mx = 0, mz = 0;
  if (!P.torch) {
    if (keys.KeyW) mz--;
    if (keys.KeyS) mz++;
    if (keys.KeyA) mx--;
    if (keys.KeyD) mx++;
  }
  const m = Math.hypot(mx, mz);
  if (m) {
    const sp = 15.5 * dt;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    slide(P, (fx * (-mz) + rx * mx) / m * sp, (fz * (-mz) + rz * mx) / m * sp, 1.1);
    P.dark += dt;
    if (Math.floor(P.t * 3.6) !== Math.floor((P.t - dt) * 3.6)) snd(70 + Math.random() * 20, 60, 'sine', 0.03);
  }

  // the flicker in frame() owns the intensity while it is on
  if (!P.torch) torch.intensity = 0;

  /* ---- them ---------------------------------------------------------- */
  let nearest = 1e9;
  for (const f of foes) {
    const U = f.userData;
    if (U.stun > 0) {
      U.stun -= dt;
      if (U.stun <= 0 && U.cloth) U.cloth.visible = false;
      continue;
    }
    const held = inBeam(f);
    const dx = P.x - f.position.x, dz = P.z - f.position.z;
    const d = Math.hypot(dx, dz) || 0.001;
    nearest = Math.min(nearest, d);
    if (d < 2.4) { P.alive = false; snd(90, 900, 'sawtooth', 0.08, 40); }
    if (held) continue;                       // pinned by the beam

    /* a lit room is a room they will not walk into */
    const sp = (P.torch ? 5.0 : 9.2) * dt;
    const nx = f.position.x + (dx / d) * sp, nz = f.position.z + (dz / d) * sp;
    const rid = house.roomAt(nx, nz);
    const litRoom = house.switches.some((s) => s.on && s.room === rid);
    if (litRoom && house.roomAt(f.position.x, f.position.z) !== rid) continue;

    const o = { x: f.position.x, z: f.position.z };
    // IT COMES IN LURCHES. poseCreature runs a three-step-then-pause
    // cycle, and the actual walking speed follows it, so the distance it
    // closes is not smooth - which is the thing that makes it hard to
    // judge where it is when you cannot see it.
    const gait = U.lurch ? 1.45 : 0.15;
    slide(o, (dx / d) * sp * gait, (dz / d) * sp * gait, 1.0);
    f.position.x = o.x; f.position.z = o.z;
    f.rotation.y = Math.atan2(dx, dz);
  }
  // and everything that is not pinned gets animated, including the ones
  // standing in the beam - being frozen is a pose of its own
  for (const f of foes) {
    const U = f.userData;
    if (U.stun > 0) continue;
    const d = Math.hypot(P.x - f.position.x, P.z - f.position.z);
    poseCreature(f, dt, !P.torch, inBeam(f), Math.max(0, 1 - d / 20));
  }
  P.near = nearest;
  if (nearest < 7 && !P.torch && P.t - lastScreech > 4) { lastScreech = P.t; screech(); }

  /* the closer the nearest one is, the harder you are breathing */
  P.panic -= dt;
  if (P.panic <= 0 && nearest < 34) {
    P.panic = Math.max(0.28, nearest / 34);
    snd(52 + (34 - nearest) * 1.2, 200, 'sine', 0.035 + (34 - nearest) * 0.0016);
  }

  for (const p of pickups) {
    if (p.taken) continue;
    if (Math.hypot(p.mesh.position.x - P.x, p.mesh.position.z - P.z) < 2.4) {
      p.taken = true; p.mesh.visible = false; P.blankets++;
      snd(700, 90, 'triangle', 0.04, 1000);
    }
  }
}

/* ---- the overlay, drawn on a second canvas at the same low resolution --- */
/* the HUD is still laid out in 320x240 units; see drawHUD */
const UIW = 320, UIH = 240;
const hud = document.getElementById('hud');
hud.width = RES.w; hud.height = RES.h;
const hg = hud.getContext('2d');
hg.imageSmoothingEnabled = true;

function drawHUD() {
  hg.setTransform(hud.width / UIW, 0, 0, hud.height / UIH, 0, 0);
  hg.clearRect(0, 0, UIW, UIH);
  if (P.phase === 'home') { P.homeBtn = Menu.drawHome(hg, UIW, UIH, P.lastDark); return; }
  if (P.phase === 'entry') { Menu.drawEntry(hg, UIW, UIH, P.lastDark || 0, P.typed); return; }
  // THE HUD WAS LAID OUT FOR A 320x240 SCREEN and every number in it is
  // in those units. Rather than rewrite forty coordinates for the new
  // resolution, the context is scaled once - the text is vector, so it
  // comes out sharper, not bigger-and-blurrier.
  hg.setTransform(hud.width / UIW, 0, 0, hud.height / UIH, 0, 0);
  hg.clearRect(0, 0, 320, 240);
  hg.font = '8px monospace';
  hg.textBaseline = 'top';

  /* the two numbers that matter */
  hg.fillStyle = '#c9c2ae';
  hg.fillText('LIGHTS  ' + P.lit + ' / ' + house.switches.length, 6, 6);
  hg.fillText('BLANKETS  ' + P.blankets, 6, 16);
  hg.fillStyle = P.torch ? '#ffe9a8' : '#6a6152';
  hg.fillText(P.torch ? 'TORCH ON - YOU CANNOT MOVE' : 'TORCH OFF - RUN', 6, UIH - 14);

  /* a switch you are standing at */
  let near = null;
  for (const s of house.switches)
    if (!s.on && Math.hypot(s.x - P.x, s.z - P.z) < TILE * 1.2) near = s;
  if (near) {
    hg.fillStyle = '#ffe9a8';
    hg.fillText('E  -  TURN IT ON', UIW / 2 - 34, UIH - 40);
  }
  if (P.noSwitch > 0) { hg.fillStyle = '#a08c6a'; hg.fillText('NOTHING HERE', UIW / 2 - 26, UIH - 40); }
  if (P.miss > 0) { hg.fillStyle = '#a08c6a'; hg.fillText('IT LANDED ON NOTHING', UIW / 2 - 42, UIH - 52); }

  /* the beam is a leash, so it gets a reticle you can aim with */
  hg.fillStyle = P.torch ? 'rgba(255,233,168,0.7)' : 'rgba(120,110,92,0.4)';
  hg.fillRect(UIW / 2 - 3, UIH / 2, 2, 1);
  hg.fillRect(UIW / 2 + 2, UIH / 2, 2, 1);
  hg.fillRect(UIW / 2, UIH / 2 - 3, 1, 2);
  hg.fillRect(UIW / 2, UIH / 2 + 2, 1, 2);

  if (!P.alive) {
    hg.fillStyle = 'rgba(4,4,6,0.86)'; hg.fillRect(0, 0, UIW, UIH);
    hg.fillStyle = '#a03028';
    hg.font = 'bold 16px monospace';
    hg.fillText('IT HAD YOU', UIW / 2 - 44, UIH / 2 - 18);
    hg.font = '8px monospace';
    hg.fillStyle = '#8a8272';
    hg.fillText(P.lit + ' of ' + house.switches.length + ' lights on', UIW / 2 - 40, UIH / 2 + 6);
    hg.fillText('R to try again', UIW / 2 - 30, UIH / 2 + 18);
  } else if (P.won) {
    hg.fillStyle = 'rgba(6,6,4,0.8)'; hg.fillRect(0, 0, UIW, UIH);
    hg.fillStyle = '#ffe9a8';
    hg.font = 'bold 14px monospace';
    hg.fillText('EVERY LIGHT ON', UIW / 2 - 52, UIH / 2 - 16);
    hg.font = '8px monospace';
    hg.fillStyle = '#8a8272';
    hg.fillText(P.dark.toFixed(1) + ' seconds spent in the dark', UIW / 2 - 66, UIH / 2 + 6);
    hg.fillText('R to go again', UIW / 2 - 28, UIH / 2 + 18);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 6) { acc -= STEP; step(STEP); }

  camera.position.set(P.x, EYE + Math.sin(P.t * 8) * (P.torch ? 0 : 0.09), P.z);
  camera.rotation.set(P.pitch, P.yaw, 0);

  /* A TORCH IS NOT A CONSTANT. Two slow sines and a rare stutter: it
     reads as a bulb with a loose contact rather than as a light source
     with a number in it. Also gives the beam something to do while you
     are standing still, which is most of this game. */
  if (P.torch) {
    const f = 1
      + Math.sin(P.t * 11.3) * 0.018
      + Math.sin(P.t * 2.7) * 0.03
      - (Math.random() < 0.004 ? 0.22 : 0);
    torch.intensity = P.power * f;
    spill.intensity = 1.6 * f;
  } else {
    spill.intensity = 0;
  }

  /* how close the nearest thing is, 0..1, drives the red lift and the
     aberration in the post pass */
  const panic = P.alive && !P.won ? Math.max(0, 1 - (P.near || 99) / 16) : 0;
  const flash = !P.alive ? 0.35 : 0;
  post.render(scene, camera, P.t, panic, flash);
  drawHUD();
}

/* IT SCALES CONTINUOUSLY NOW, not in whole multiples.
   The old fit only allowed integer scales, because at 320x240 a
   half-pixel is a smear. At 1152x720 with filtering the opposite is
   true: whole multiples waste most of the window. */
function fit() {
  const k = Math.min((Math.min(innerWidth, 1600) - 40) / RES.w,
                     (innerHeight - 200) / RES.h);
  const w = Math.max(320, Math.floor(RES.w * k));
  const h = Math.max(200, Math.floor(RES.h * k));
  for (const el of [canvas, hud]) {
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }
}
addEventListener('resize', fit);
fit();
requestAnimationFrame(frame);

window.LIGHTSOUT = { P, house, foes, camera, scene, THREE, inBeam };
