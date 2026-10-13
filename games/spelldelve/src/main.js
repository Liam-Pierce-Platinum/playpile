// Boot: renderer, camera, lights, loop, menus, test hooks.
import * as THREE from '../vendor/three.module.js';
import { G, C } from './state.js';
import { floorTexture, wallTexture, glowTexture, ringTexture, bookCoverTexture } from './textures.js';
import { setModelTextures, prewarmModels, makeMonsterModel, makeWizard } from './models.js';
import { Particles, FlashLights, Ground, DamageNumbers } from './fx.js';
import { ui, toggleMute } from './ui.js';
import { input, initInput, pollInput } from './input.js';
import { Audio } from './audio.js';
import * as game from './game.js';
import { botStep } from './bot.js';
import { SPELLS, RELICS } from './data.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const lowGfx = params.has('low') || /Mobi|Android/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowGfx, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowGfx ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07050a);
scene.fog = new THREE.FogExp2(0x0b0709, 0.024);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 140);

const hemi = new THREE.HemisphereLight(0x9a88b8, 0x2a1810, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd8b0, 0.85);
sun.castShadow = true;
sun.shadow.mapSize.set(lowGfx ? 1024 : 2048, lowGfx ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 60;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// soft studio environment so glossy / metal materials have something to reflect
{
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = sky.geometry.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = new THREE.Color().lerpColors(new THREE.Color(0x3a2418), new THREE.Color(0x6a5a88), (y + 1) / 2); cols.push(c.r, c.g, c.b); }
  sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(sky);
  const lamp = (c, x, y, z, s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); env.add(m); };
  lamp(0xffc080, 5, 6, 4, 1.6); lamp(0xb090ff, -6, 4, -3, 1.2); lamp(0xffe0c0, 0, 9, 0, 2.2);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.55;
}
const coverCache = {};
const TEX = { floor: floorTexture(), wall: wallTexture(), glow: glowTexture(), ring: ringTexture(),
  bookCover: (hex, glyph) => coverCache[hex + glyph] || (coverCache[hex + glyph] = bookCoverTexture(hex, glyph)) };
setModelTextures(TEX);

Object.assign(C, { scene, camera, renderer, TEX, ui,
  fx: new Particles(scene, TEX.glow, true), flash: new FlashLights(scene, 4), ground: new Ground(scene, TEX),
  dmg: new DamageNumbers(document.getElementById('dmg')) });
game.loadSave();
Audio.setMuted(!!G.save.muted || params.has('mute'));
game.initVisuals();
// build every character blueprint up front, then compile their shaders by drawing them once in the live scene a
// few frames after start, so first spawns never hitch. Warming before the first real frame (or with
// renderer.compile on a separate scene) left every later frame ~100 ms slower in swiftshader, so it waits.
prewarmModels();
function warmShaders() {
  if (params.has('nowarm')) return;
  const warm = new THREE.Group();
  for (const k of ['slime', 'skeleton', 'bat', 'goblin', 'ghost', 'knight', 'spider', 'mimic', 'crown']) warm.add(makeMonsterModel(k).root);
  warm.add(makeWizard().root);
  // drawn tiny (sub-pixel) and never culled: the draw calls still compile every program, nothing shows on screen
  warm.scale.setScalar(1e-4); if (G.P) warm.position.set(G.P.x, 0.5, G.P.z);
  warm.traverse((o) => { o.frustumCulled = false; });
  scene.add(warm);
  try { renderer.render(scene, camera); } catch (e) { /* warm-up only */ }
  scene.remove(warm);
}
let warmIn = 3;

// ---------------------------------------------------------------- resize
let W = 1, H = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  C.fx.setScale(H * renderer.getPixelRatio());
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- menus
function toTitle() {
  G.mode = 'title';
  ui.showHud(false);
  ui.showTitle(() => game.newRun(), toHub);
}
function toHub() {
  G.mode = 'hub';
  ui.showHud(false);
  ui.showHub(() => game.newRun(), toTitle);
}
ui._onAgain = () => game.newRun();
ui._onHub = toHub;

function openGrimoire() {
  if (G.modalApi && G.modalApi.kind === 'grimoire') { G.modalApi.choose(0); return; }
  if (G.mode !== 'play' || G.modalOpen || !G.P || G.P.dead) return;
  G.mode = 'modal'; G.modalOpen = true; G.modalApi = { kind: 'grimoire', options: [], choose: () => close() };
  const close = () => { ui.closeModal(); G.modalOpen = false; G.modalApi = null; G.mode = 'play'; };
  ui.showGrimoire(close);
}
function openPause() {
  if (G.modalApi && (G.modalApi.kind === 'grimoire' || G.modalApi.kind === 'pause')) { G.modalApi.choose(0); return; }
  if (G.mode !== 'play' || G.modalOpen || !G.P || G.P.dead) return;
  G.mode = 'modal'; G.modalOpen = true; G.modalApi = { kind: 'pause', options: [], choose: () => resume() };
  const resume = () => { ui.closeModal(); G.modalOpen = false; G.modalApi = null; G.mode = 'play'; };
  ui.showPause(resume, () => { resume(); G.P.hp = 0; game.playerDied(); });
}
initInput(canvas, { grimoire: openGrimoire, pause: openPause, mute: toggleMute });
document.getElementById('b-grim').onclick = openGrimoire;
document.getElementById('b-pause').onclick = openPause;
document.getElementById('b-mute').onclick = toggleMute;
document.getElementById('b-mute').style.opacity = Audio.muted ? 0.4 : 1;
addEventListener('visibilitychange', () => { if (document.hidden && !G.modalOpen) openPause(); });

// ---------------------------------------------------------------- loop
const ray = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
const ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
const camT = new THREE.Vector3(), camPos = new THREE.Vector3();
let camInit = false;
let lastT = performance.now();
let fpsAcc = 0, fpsN = 0;
G.fps = 60;

function frame(now) {
  requestAnimationFrame(frame);
  if (warmIn > 0 && --warmIn === 0) warmShaders();
  let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (G.fixedDt) dt = G.fixedDt;
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  step(dt);
  renderer.render(scene, camera);
}
function step(dt) {
  const inp = pollInput();
  G.input = inp;
  const P = G.P;
  // mouse aim -> world point
  if (P && inp.hasMouse) {
    ndc.set((inp.mouseX / W) * 2 - 1, -(inp.mouseY / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(aimPlane, hitP)) { inp.aimX = hitP.x; inp.aimZ = hitP.z; }
  } else if (P) { inp.aimX = P.x + Math.sin(P.face) * 5; inp.aimZ = P.z + Math.cos(P.face) * 5; }
  if (G.autopilot && G.mode !== 'title' && G.mode !== 'hub') botStep(inp, dt);
  if (G.god && P) { P.hp = P.maxHp; P.mana = P.maxMana; }

  let gdt = dt;
  if (G.hitstop > 0) { G.hitstop -= dt; gdt = dt * 0.08; }
  if (P && P.dead) gdt *= 0.5;
  game.update(gdt);
  if (G.mode === 'play' || G.mode === 'modal' || G.mode === 'shop' || G.mode === 'dead' || G.mode === 'victory') {
    const live = G.mode === 'play' ? gdt : 0;
    game.updateVisuals(G.mode === 'play' ? gdt : dt * 0.25, camera);
    C.fx.update(live || (G.mode === 'dead' || G.mode === 'victory' ? dt : 0));
    C.flash.update(live);
    C.ground.update(live);
  }
  C.dmg.update(G.mode === 'play' ? gdt : 0, camera, W, H);
  if (G.mode === 'play' || G.mode === 'modal') ui.update(dt);

  // camera
  if (P) {
    const portrait = W < H;
    const back = portrait ? 1.45 : 1;
    const lx = (inp.aimX - P.x) * 0.12, lz = (inp.aimZ - P.z) * 0.12;
    const ll = Math.hypot(lx, lz), lk = ll > 2.2 ? 2.2 / ll : 1;
    camT.set(P.x + lx * lk, 0, P.z + lz * lk);
    camPos.set(camT.x, 15.5 * back, camT.z + 9.6 * back);
    if (!camInit) { camera.position.copy(camPos); camInit = true; }
    camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
    if (G.shake > 0.001) {
      const s = G.shake * 0.55;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
      G.shake = Math.max(0, G.shake - dt * 2.8);
    }
    camera.lookAt(camera.position.x, 0, camera.position.z - 9.6 * back);
    sun.position.set(P.x + 8, 24, P.z + 10); sun.target.position.set(P.x, 0, P.z);
  } else {
    camera.position.set(0, 18, 12); camera.lookAt(0, 0, 0);
  }
}

// ---------------------------------------------------------------- start
if (params.has('bot')) G.autopilot = true;
if (params.has('god')) G.god = true;
if (params.has('play') || params.has('bot')) {
  const floor = parseInt(params.get('floor') || '1', 10);
  const seed = params.has('seed') ? parseInt(params.get('seed'), 10) : undefined;
  game.newRun({ floor, seed, startSpell: params.get('spell') || undefined });
} else {
  // a backdrop floor behind the title
  game.newRun({ seed: 7, backdrop: true });
  G.mode = 'title';
  ui.showHud(false);
  toTitle();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- test hooks
window.__G = {
  G, C, game, SPELLS, RELICS,
  get state() { const P = G.P; return { mode: G.mode, floor: G.run && G.run.floorNum, hp: P && P.hp, maxHp: P && P.maxHp, mana: P && P.mana, level: P && P.level, gold: P && P.gold,
    kills: G.run && G.run.kills, monsters: G.monsters.filter((m) => !m.dead).length, room: G.room, spells: P && Object.keys(P.spells), slots: P && P.slots.slice(), relics: P && [...P.relics],
    modal: G.modalApi && G.modalApi.kind, fps: G.fps, boss: G.boss ? Math.round(G.boss.hp) : null, x: P && P.x, z: P && P.z, time: G.run && G.run.time }; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); renderer.render(scene, camera); },
  render() { renderer.render(scene, camera); },
  autopilot(on = true) { G.autopilot = on; },
  god(on = true) { G.god = on; },
  newRun: (o) => game.newRun(o),
  floor(n) { game.enterFloor(n); },
  learn(id, slot) { game.learnSpell(id); if (slot != null) game.equip(id, slot); },
  relic(id) { game.gainRelic(id); },
  killAll() { for (const m of [...G.monsters]) if (!m.dead && m.state !== 'disguised') game.killMonster(m); },
  choose(i) { G.modalApi && G.modalApi.choose(i); },
  teleport(x, z) { G.P.x = x; G.P.z = z; },
  spawn(type, dx = 4, dz = 0, o = {}) { return game.spawnMonster(type, G.P.x + dx, G.P.z + dz, Object.assign({ room: G.room }, o)); },
  cast(slot) { return game.tryCast(slot); },
  hub: toHub, title: toTitle,
  setCam(x, z) { G.P.x = x; G.P.z = z; },
};
