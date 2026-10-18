// BLADEBORN: boot, render pipeline, game loop, waves, HUD, menus, test hooks.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, groundBelow, nearestWall, boxes } from './world.js';
import { FX } from './fx.js';
import { Hero } from './hero.js';
import { Enemy, updateProjectiles } from './enemy.js';
import { CombatCam } from './camera.js';
import { loadClips, CLIPS } from './clips.js';
import { crossTarget } from './aim.js';
import { Script as FinScript, SCRIPT_NAMES, updateSlump } from './finisher.js';
import { ragMat } from './ragdoll.js';
import { initAudio, sfx, setVolume } from './audio.js';
import { Campaign } from './campaign/campaign.js';
import { initHome, homeShot, homePose } from './campaign/home.js';
import { loadSettings } from './campaign/save.js';
import { installTeach } from './teach.js';

const Q = new URLSearchParams(location.search);
const SETTINGS = loadSettings();
const $ = id => document.getElementById(id);

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement); renderer.info.autoReset = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8e8e8e);
scene.fog = new THREE.Fog(0x8e8e8e, 22, 75);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 200);

const hemi = new THREE.HemisphereLight(0xc8d6ec, 0x5c4c3c, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4c8, 2.6);
sun.position.set(14, 26, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -34; sc.right = sc.top = 34; sc.near = 1; sc.far = 80;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);
// cool rim from behind to carve the cube men out of the grey (no shadows, cheap)
const rim = new THREE.DirectionalLight(0xa8c4ff, 0.9); rim.position.set(-12, 9, -16); scene.add(rim);

// --- physics ---
const physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
physics.broadphase = new CANNON.SAPBroadphase(physics); physics.allowSleep = true;
physics.solver.iterations = 12;
physics.defaultContactMaterial.friction = 0.45; physics.defaultContactMaterial.restitution = 0.05;
physics.addContactMaterial(new CANNON.ContactMaterial(ragMat, physics.defaultMaterial, { friction: 0.6, restitution: 0.05 }));

buildWorld(scene, physics);

// --- post ---
const useFx = !Q.has('nofx') && SETTINGS.fx !== false;
let composer = null, gtao = null, grade = null;
if (useFx) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 1.0;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 8 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, punch: { value: 0 }, radial: { value: 0 }, motion: { value: new THREE.Vector2() }, pulse: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time, hurt, punch, radial, pulse; uniform vec2 motion; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
      void main(){
        vec2 uv = vUv, d = uv - 0.5;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        if (radial > 0.002 || dot(motion, motion) > 1e-6) {                // cheap 8-tap zoom + motion blur
          vec3 acc = c; float w = 1.0;
          for (int i = 1; i < 8; i++) { float k = float(i) / 7.0; vec2 o = -d * radial * 0.09 * k * smoothstep(0.05, 0.5, length(d)) - motion * k; acc += texture2D(tDiffuse, uv + o).rgb; w += 1.0; }
          c = acc / w;
        }
        float red = clamp((c.r - max(c.g, c.b)) * 4.0, 0.0, 1.0);          // blood keeps its colour
        float ca = punch * 0.012;                                            // punch: luminance-only lens split
        float l = dot(c, vec3(0.299,0.587,0.114)) * (1.0 - ca * 20.0) + ca * 10.0 * (dot(texture2D(tDiffuse, uv + d*ca).rgb, vec3(0.333)) + dot(texture2D(tDiffuse, uv - d*ca).rgb, vec3(0.333)));
        c = mix(vec3(l), c, 0.74 + 0.26 * red);                              // gritty grade: colour pulled down, blood kept
        c *= mix(vec3(0.93, 1.0, 1.07), vec3(1.06, 1.0, 0.92), smoothstep(0.15, 0.8, l)); // cool shadows, warm highlights
        c = mix(c, c * vec3(1.18, 0.82, 0.82), red * 0.6);                   // blood stays a strong red
        c = (c - 0.5) * 1.1 + 0.5;                                           // contrast
        float v = smoothstep(0.85 - pulse * 0.25, 0.25 - pulse * 0.1, length(d));
        c *= mix(0.62 - pulse * 0.3, 1.0, v);
        c = mix(c, vec3(0.35,0.0,0.0), hurt * (1.0 - v) * 0.8);
        c += (h(uv * 731.0) - 0.5) * 0.035;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);
}

// --- game state ---
const G = {
  scene, physics, camera, enemies: [], ragdolls: [], parts: [], fx: new FX(scene),
  input: { keys: {}, yaw: Math.PI, pitch: -0.12, buttons: {} },
  camPunch: 0, hurtFlash: 0, stopT: 0, shakeAmt: 0, projectiles: [], cine: null,
  slowS: 1, slowT: 0, slowDur: 0, blur: 0, punchAmt: 0, meleeToken: null, shotToken: null, shotCD: 0,
  combo: 0, comboT: 0, kills: 0, wave: 0, waveT: 2, maxCombo: 0, playing: false, paused: false, over: false,
};
G.renderer = renderer; G.sun = sun; G.hemi = hemi; G.settings = SETTINGS; G.mode = 'home'; G.flags = {};
G.shake = a => { a *= G.settings.shake ?? 1; G.shakeAmt = Math.min(1, Math.max(G.shakeAmt, a)); };
G.hitstop = s => { G.stopT = Math.max(G.stopT, s); };
// slow motion: drop to scale, hold, ramp back up over the last half
G.slowmo = (scale, dur) => { if (scale <= G.slowS || G.slowT <= 0) { G.slowS = scale; G.slowT = dur; G.slowDur = dur; } };
installTeach(G);
G.timeScale = () => { if (G.slowT <= 0) return 1; const k = G.slowT / G.slowDur; return k > 0.5 ? G.slowS : G.slowS + (1 - G.slowS) * (1 - k * 2); };
G.fovKick = a => { cc.fovK += a; };
G.blurKick = a => { G.blur = Math.min(1.6, Math.max(G.blur, a)); };
G.punch = a => { G.punchAmt = Math.min(1.5, Math.max(G.punchAmt, a)); };
G.camImpulse = (push, swing) => cc.impulse(push, swing);
// stealth: sounds wake up anyone in range who is not already fighting
G.stealthSpawn = !Q.has('nostealth');
// finisher meter: hits, parries and dodges charge it; a full bar + LMB double-click spends it
G.finMeter = 0;
G.finGain = a => { if (G.finMeter < 1 && G.finMeter + a >= 1) { sfx.ready?.(); } G.finMeter = Math.min(1, G.finMeter + a); };
G.noise = (p, r, loud) => { for (const e of G.enemies) { const d = e.pos.distanceTo(p); if (d < r) e.hear(p, loud, d / r); } };
G.onHit = (e, killed, kind) => {
  G.combo++; G.comboT = 2.2; G.maxCombo = Math.max(G.maxCombo, G.combo);
  const heavy = kind !== 'slash' && kind !== 'air';
  G.finGain(killed ? 0.15 : heavy ? 0.12 : 0.07);
  G.hitstop(killed ? 0.13 : heavy ? 0.09 : 0.055); G.shake(killed ? 0.45 : heavy ? 0.32 : 0.16); sfx.hit(heavy || killed);
  if (!G.hero.silent) G.noise(G.hero.pos, e.mode === 'alert' ? 11 : 5, true);
  G.camImpulse(killed ? 0.7 : heavy ? 0.5 : 0.12, (Math.random() < 0.5 ? -1 : 1) * (killed ? 1.1 : heavy ? 0.6 : 0));
  if (heavy || killed) { G.blurKick(killed ? 0.7 : 0.4); G.punch(killed ? 0.8 : 0.45); G.fovKick(killed ? -5 : -3); }
  if (killed) { G.kills++; const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); G.slowmo(0.3, 0.45); }
};
G.onHeroDeath = () => { setTimeout(() => { G.over = true; document.exitPointerLock?.(); $('overstats').textContent = G.mode === 'campaign' ? 'Back to the last checkpoint.' : `Wave ${G.wave}  ·  ${G.kills} kills  ·  best combo ${G.maxCombo}`; $('again').textContent = G.mode === 'campaign' ? 'RETRY' : 'AGAIN'; $('over').classList.remove('hidden'); }, 2200); };
G.onAlarm = who => { if (G.campaign?.L) G.campaign.L.alarm(who?.pos, 45); };
// characters: the cube men (src/rig.js), hero and enemies alike
// Mixamo clips (assets/anim, baked from Liam's pack); every one was watched in a filmstrip before mapping (tools/clipsheet.mjs)
await loadClips(['walking_3', 'sprint', 'jumping_1', 'jumping_2', 'lead_jab', 'cross_punch_1', 'hook', 'hook_punch_1', 'uppercut', 'punching', 'mma_kick', 'side_kick', 'roundhouse_kick', 'illegal_headbutt', 'front_flip', 'sprinting_forward_roll', 'swing_to_land', 'running_jump', 'idle_to_sprint']);
G.hero = new Hero(G);
// a fresh hero at a level's spawn/checkpoint (the old body, trails and ragdoll go)
function resetHero(x, y, z, yaw) {
  const o = G.hero;
  if (o) { scene.remove(o.rig.root); o.rig.skin?.dispose(); for (const k in o.trails) { const m = o.trails[k].mesh; if (m) scene.remove(m); } if (o.rd) { o.rd.dispose(); const i = G.ragdolls.indexOf(o.rd); if (i >= 0) G.ragdolls.splice(i, 1); } }
  G.hero = new Hero(G); G.hero.pos.set(x, y, z); G.hero.yaw = yaw; G.input.yaw = yaw; G.input.pitch = -0.12;
  G.over = false; G.combo = 0; G.finMeter = 0; G.aimT = null; G.td = null; G.slowT = 0; G.stopT = 0; G.cine = null;
  $('over').classList.add('hidden');
}
G.campaign = new Campaign(G, { resetHero, onClear: () => toMenu() });
G.coverBoxes = boxes.filter(b => b.max.y > 1.2 && b.max.y < 9 && (b.max.x - b.min.x) < 12 && (b.max.z - b.min.z) < 12);

// --- waves ---
const SPAWNS = [[-20, -20], [20, -20], [-20, 20], [20, 20], [0, -22], [0, 22], [-22, 0], [22, 0]];
function spawnWave() {
  G.wave++; G.toSpawn = 2 + G.wave; banner('WAVE ' + G.wave);
}
function spawnOne(x, z, type0) {
  if (x === undefined) { // furthest spawn points from the hero
    const s = SPAWNS.map(p => [p, Math.hypot(p[0] - G.hero.pos.x, p[1] - G.hero.pos.z)]).sort((a, b) => b[1] - a[1]);
    [x, z] = s[Math.floor(Math.random() * 3)][0]; x += (Math.random() - 0.5) * 3; z += (Math.random() - 0.5) * 3;
  }
  const throwers = G.enemies.filter(o => o.type === 'thrower' || o.type === 'gunner').length;
  const r = Math.random();
  const type = type0 || (G.wave >= 2 && throwers < 2 && r < 0.2 ? 'gunner' : G.wave >= 2 && throwers < 2 && r < 0.36 ? 'thrower' : 'brute');
  const e = new Enemy(G, new THREE.Vector3(x, groundBelow(x, z, 30), z), G.wave, type); G.enemies.push(e); return e;
}
let bannerT = 0;
function banner(t, d = 1.6) { $('banner').textContent = t; $('banner').style.opacity = 1; bannerT = d; }
G.banner = banner;

// --- input ---
const canvas = renderer.domElement;
addEventListener('keydown', e => {
  if (G.cut && G.playing && !G.paused && ['Space', 'Enter', 'Escape'].includes(e.code)) { e.preventDefault(); if (!e.repeat) G.cut.skip(); return; }
  if (e.code === 'Escape' && G.playing && !G.over) return setPause(!G.paused);
  G.input.keys[e.code] = true;
  if (!e.repeat && G.playing && !G.cut) G.teachInput?.(e.code);
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && !G.campaign.key('Space')) G.hero.jumpPressed(); }
  if (e.code === 'KeyE' && !e.repeat && G.playing && !G.paused && !G.cut) { if (!G.campaign.key('E')) G.hero.takedown(); }
  if (e.code === 'KeyC' && !e.repeat) G.input.crouch = !G.input.crouch;
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') e.preventDefault();
});
addEventListener('keyup', e => { G.input.keys[e.code] = false; });
addEventListener('blur', () => { G.input.keys = {}; });
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!G.playing || G.paused || G.over || G.cut) return;
  if (document.pointerLockElement !== canvas && !Q.has('play')) { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch (_) {} }
  G.teachInput?.(['LMB', 'MMB', 'RMB'][e.button]);
  if (e.button === 0) G.hero.mouseDown('L'); else if (e.button === 2) G.hero.mouseDown('R');
  else if (e.button === 1) { e.preventDefault(); G.hero.blockDown(); }
});
canvas.addEventListener('pointerdown', e => { if (e.button === 1) e.preventDefault(); });
addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
addEventListener('mouseup', e => {
  if (e.button === 0) G.hero.mouseUp('L'); else if (e.button === 2) G.hero.mouseUp('R'); else if (e.button === 1) { e.preventDefault(); G.hero.blockUp(); }
});
addEventListener('blur', () => { G.hero.mouseUp('L'); G.hero.mouseUp('R'); G.hero.blockUp(); });
addEventListener('mousemove', e => {
  if (!G.playing || G.paused) return;
  if (document.pointerLockElement === canvas || e.buttons & 4) {
    if (e.movementX || e.movementY) G.input.lastMouse = performance.now();
    const k = G.settings.sens || 1, iy = G.settings.invertY ? -1 : 1;
    G.input.yaw -= e.movementX * 0.0024 * k; G.input.pitch = Math.max(-1.2, Math.min(0.9, G.input.pitch - e.movementY * 0.0022 * k * iy));
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.playing && !G.paused && !G.over && !Q.has('play')) setPause(true);
});
function setPause(p) {
  G.paused = p; $('pause').classList.toggle('hidden', !p);
  if (p) document.exitPointerLock?.(); else lock();
}
function lock() { if (Q.has('play')) return; try { canvas.requestPointerLock()?.catch?.(() => {}); } catch (_) {} }
function start() {
  initAudio(); setVolume(G.settings.volume ?? 1); $('home').classList.add('hidden'); $('hud').classList.remove('hidden');
  G.playing = true; window.__playing = true; if (!G.cut) G.camOverride = null; lock();
}
// Arena mode: the original yard and endless waves
function startArena() { G.mode = 'arena'; document.body.classList.remove('campaign'); G.camOverride = null; G.hero.clawsOut = false; G.hero.ext = 0; G.hero.pos.set(0, 0, 6); G.hero.yaw = G.input.yaw = Math.PI; start(); }
// Stages: the arena backdrop is unloaded and the level loads in its place
async function startCampaign(id, cp) {
  document.body.classList.add('campaign'); G.camOverride = null; G.paused = false; $('pause').classList.add('hidden');
  try { await G.campaign.load(id, cp); } catch (err) { console.warn('[campaign] ' + err.message); }
  start();
}
function toMenu() { location.href = location.pathname; }
initHome(G, { campaign: startCampaign, arena: startArena, applySettings: s => { setVolume(s.volume ?? 1); } });
$('resume').onclick = () => setPause(false);
$('restart').onclick = () => { if (G.mode === 'campaign') { setPause(false); G.campaign.retry(); } else location.reload(); };
$('tomenu').onclick = toMenu;
$('again').onclick = () => { if (G.mode === 'campaign') { $('over').classList.add('hidden'); G.campaign.retry().then(() => lock()); } else location.reload(); };
$('overmenu').onclick = toMenu;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight);
});

// --- camera ---
const cc = new CombatCam(camera);
function updateCamera(dt, rdt) {
  if (G.mode === 'home' && !G.playing) G.camOverride = homeShot(G, homeT);
  if (G.camOverride) { camera.position.copy(G.camOverride.pos); camera.lookAt(G.camOverride.look); camera.fov = G.camOverride.fov || 40; camera.updateProjectionMatrix(); const h = G.campaign?.L ? G.camOverride.look : G.hero.pos; sun.position.set(h.x + 14, 26, h.z + 10); sun.target.position.set(h.x, 0, h.z); return; }
  cc.update(G, dt, rdt);
  const h = G.hero; sun.position.set(h.pos.x + 14, 26, h.pos.z + 10); sun.target.position.set(h.pos.x, 0, h.pos.z);
}

// --- HUD ---
let lastCombo = -1;
function updateHud(rdt) {
  const h = G.hero;
  $('hpf').style.width = Math.max(0, h.hp) + '%';
  $('finf').style.width = (G.finMeter * 100).toFixed(1) + '%'; $('fin').classList.toggle('ready', G.finMeter >= 1);
  $('wave').textContent = 'WAVE ' + G.wave; $('kills').textContent = 'KILLS ' + G.kills;
  if (G.combo !== lastCombo) { lastCombo = G.combo; $('cn').textContent = G.combo; $('cn').style.transform = 'scale(1.35)'; setTimeout(() => $('cn').style.transform = '', 70); }
  $('combo').style.opacity = G.combo > 1 ? 1 : 0;
  $('hint').textContent = G.hintOverride ? G.hintOverride : h.slamReady ? 'SLAM READY: same button twice' : G.td ? 'E  ' + ({ silent: 'SILENT TAKEDOWN', pounce: 'DROP TAKEDOWN', ledgepull: 'LEDGE TAKEDOWN', ambush: 'WALL AMBUSH' })[G.td.k] : !h.clawsOut ? 'Click LEFT + RIGHT together to unsheathe' : h.climbing ? 'Alternate LMB / RMB to climb  ·  A/D swing  ·  MIDDLE = stealth kill below  ·  Space wall-jump' : (G.finMeter >= 1 ? 'FINISHER READY: double-click LMB  ·  ' : '') + 'LMB / RMB strike where you aim  ·  hold MIDDLE to block  ·  in the air: same button twice = slam';
  { // sight meter: how close anyone is to spotting you
    let a = 0, seen = false, alert = false;
    for (const e of G.enemies) { if (e.mode === 'alert') alert = true; else { a = Math.max(a, e.aware); if (e.seesHero) seen = true; } }
    const el = $('sight'); a = alert ? 1 : Math.min(1, a);
    $('sightf').style.width = (a * 100).toFixed(0) + '%';
    el.style.opacity = G.enemies.length ? (alert ? 0.55 : seen ? 1 : a > 0.02 ? 0.75 : 0.35) : 0;
    const why = G.hero.stealthFactor().why;
    $('sightl').textContent = (alert ? 'ALERTED' : seen ? (a > 0.3 ? 'SPOTTING YOU' : 'IN SIGHT') : a > 0.02 ? 'SUSPICIOUS' : 'HIDDEN') + (why && !alert ? '  ·  ' + why : '');
    el.classList.toggle('seen', seen && !alert);
  }
  bannerT -= rdt; if (bannerT <= 0) $('banner').style.opacity = 0;
  $('dmg').style.boxShadow = `inset 0 0 180px rgba(140,0,0,${(G.hurtFlash * 0.8).toFixed(2)})`;
}

// --- loop ---
let last = performance.now(), frames = 0, fpsT = 0, fps = 0, gameTime = 0, homeT = 0;
function frame(now) {
  requestAnimationFrame(frame); renderer.info.reset();
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  frames++; fpsT += rdt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  let dt = rdt;
  if (G.slowT > 0) { dt = rdt * G.timeScale(); G.slowT -= rdt; }
  if (G.stopT > 0) { G.stopT -= rdt; dt = rdt * 0.04; }
  if (G.teachTick && G.playing && !G.paused) { try { G.teachTick(rdt); G.teachClimbCheck(); } catch (err) { console.warn('[teach] ' + err.message); } dt *= G.teachScale(); } // tutorial slow-mo
  if (!G.playing || G.paused) dt = 0;
  if (dt > 0) {
    gameTime += dt;
    if (G.cut) { G.cut.update(rdt * (G.paused ? 0 : 1)); if (!G.cut?.world && !G.campaign.L?.actors.some(a => a.hero)) G.hero.anim(dt, {}, 0); } // cutscene: the hero is an actor
    else G.hero.update(dt);
    if (!G.cut || G.cut.world) for (const e of [...G.enemies]) e.update(dt);
    G.campaign.update(dt);
    updateProjectiles(G, dt); G.shotCD -= dt;
    physics.step(1 / 60, dt, 4);
    for (const rd of G.ragdolls) {
      rd.update(dt);
      if (rd.poolPending !== undefined && rd.age > rd.poolPending) { const t = rd.coreObj.position; G.fx.pool({ x: t.x, y: groundBelow(t.x, t.z, t.y + 0.5), z: t.z }, 1.2 + Math.random() * 0.8); rd.poolPending = undefined; }
    }
    for (const pt of G.parts) pt.update(dt);
    // real bodies follow their rigs (after all poses, IK and physics this frame)
    G.hero.rig.skin?.update(dt); for (const e of G.enemies) e.rig.skin?.update(dt); G.hero.fin?.e?.rig.skin?.update(dt);
    for (const rd of G.ragdolls) rd.skin?.update(dt);
    if (G.slumps) G.slumps = G.slumps.filter(s => updateSlump(G, s, dt));
    while (G.parts.length > 30) G.parts.shift().dispose();
    while (G.ragdolls.length > 14) { const o = G.ragdolls.find(r => r !== G.hero.rd); o.dispose(); G.ragdolls.splice(G.ragdolls.indexOf(o), 1); }
    G.fx.update(dt);
    // waves
    if (G.mode === 'arena' && !Q.has('noenemies') && !G.hero.dead) {
      if (!G.enemies.length && !G.toSpawn) { G.waveT -= dt; if (G.waveT <= 0) { spawnWave(); G.waveT = 3; } }
      if (G.toSpawn > 0 && G.enemies.length < 6) { G.spawnCD = (G.spawnCD || 0) - dt; if (G.spawnCD <= 0) { spawnOne(); G.toSpawn--; G.spawnCD = 0.7; } }
    }
    G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
    if (!G.enemies.some(e => e.mode === 'alert')) G.finMeter = Math.max(0, G.finMeter - dt * 0.03); // slow drain out of combat
  }
  G.campaign.realUpdate(G.paused ? 0 : rdt);
  if (G.mode === 'home' && !G.playing) { homeT += rdt; homePose(G, rdt); G.hero.rig.skin?.update(rdt); }
  G.hurtFlash = Math.max(0, G.hurtFlash - rdt * 1.8);
  updateCamera(dt, G.playing ? rdt : rdt * 0.2);
  { // crosshair target outline
    const h = G.hero; G.td = G.playing ? h.takedownTarget() : null;
    const t = G.td ? G.td.e : G.playing && h.clawsOut && !h.fin && !h.climbing && !h.dead ? crossTarget(G, h) : null;
    if (t !== G.aimT) { G.aimT?.setHighlight(false); t?.setHighlight(true); G.aimT = t; }
  }
  updateHud(rdt);
  if (composer) { grade.uniforms.time.value = now * 0.001 % 100; grade.uniforms.hurt.value = G.hurtFlash; grade.uniforms.punch.value = G.camPunch + G.shakeAmt * 0.5 + G.punchAmt * 0.6;
    // motion blur along screen-space camera motion while dashing or diving
    const h = G.hero, mv = (h.dashT > 0 || h.diving) ? Math.min(1, Math.hypot(h.vel.x, h.vel.y, h.vel.z) / 25) : 0;
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    grade.uniforms.motion.value.set(h.vel.dot(r), h.vel.dot(u)).multiplyScalar(0.0016 * mv);
    grade.uniforms.radial.value = G.blur + (G.cine ? 0.25 : 0); grade.uniforms.pulse.value = Math.min(1, G.punchAmt);
    composer.render(); }
  else renderer.render(scene, camera);
  G.blur = Math.max(0, G.blur - rdt * 2.5); G.punchAmt = Math.max(0, G.punchAmt - rdt * 2.2);
  window.__ready = true;
}
// pre-compile every material the fights use, so the first finisher/gash/shot doesn't hitch while shaders compile
{
  const warm = new THREE.Group(), geo = new THREE.BoxGeometry(0.01, 0.01, 0.01), fx = G.fx;
  for (const mat of [fx.gashMat, fx.gashCore, fx.stainMat, fx.poolMat, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: 0xe6e6e6, side: THREE.BackSide, transparent: true, opacity: 0.5, depthWrite: false })]) {
    const w = new THREE.Mesh(geo, mat); w.position.set(G.hero.pos.x, -5, G.hero.pos.z); warm.add(w);
  }
  scene.add(warm); try { renderer.compile(scene, camera); } catch (_) {} scene.remove(warm);
}
requestAnimationFrame(frame);
G.hero.pos.set(-10, 6.6, 0.5); G.hero.yaw = Math.PI * 0.62; // the title shot: on the slab bridge
if (Q.has('level')) startCampaign(Q.get('level'), Q.get('cp'));
else if (Q.has('play')) startArena();

// --- test hooks for tools/bot.mjs and tools/shot.mjs ---
window.__test = {
  G, THREE,
  stats: () => ({ fps: +fps.toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, enemies: G.enemies.length, ragdolls: G.ragdolls.length, decals: G.fx.decalCount, splats: G.fx.splats.count, drips: G.fx.drips.count, scratches: G.fx.scratches.count, hp: G.hero.hp, combo: G.combo, kills: G.kills, wave: G.wave, claws: G.hero.clawsOut, climbing: G.hero.climbing, y: +G.hero.pos.y.toFixed(2) }),
  look: (yaw, pitch) => { G.input.yaw = yaw; G.input.pitch = pitch; },
  teleport: (x, y, z) => { G.hero.pos.set(x, y, z); G.hero.vel.set(0, 0, 0); },
  spawn: (x, z, type, mode = 'alert') => { const s = G.stealthSpawn; G.stealthSpawn = mode !== 'alert'; const e = spawnOne(x, z, type); G.stealthSpawn = s; e.spawnT = 0; return G.enemies.length; },
  clear: () => { G.enemies.forEach(e => { scene.remove(e.rig.root); e.rig.skin?.dispose(); }); G.enemies.length = 0; G.meleeToken = G.shotToken = null; G.projectiles.forEach(p => scene.remove(p.m)); G.projectiles.length = 0; G.toSpawn = 0; G.waveT = 1e9; },
  finish: (e, name) => { const h = G.hero; h.clawsOut = true; h.ext = 1; const S = h.fin = new FinScript(G, h, e, name); return !!S; },
  finNames: () => SCRIPT_NAMES,
  clips: () => Object.keys(CLIPS).map(k => [k, +CLIPS[k].dur.toFixed(2)]),
  preview: (name, t) => { G.hero.clipPreview = name ? { name, t } : null; },
  wallAt: (x, y, z) => { const w = nearestWall(new THREE.Vector3(x, y, z), 0.36, 1.85, 0.9); return w && w.box; },
  campaign: () => G.campaign, L: () => G.campaign.L,
  freeze: on => { G.frozen = on; G.enemies.forEach(e => { e.state = on ? 'recover' : 'circle'; e.t = on ? 1e9 : 1; }); },
};
