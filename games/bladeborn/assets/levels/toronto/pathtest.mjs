// Offline critical-path test for the TORONTO chapter (no GPU): node assets/levels/toronto/pathtest.mjs
// Builds src/levels/toronto.js with the real LevelKit and drives the real hero: spawn on King St, run west along King,
// all three ways into each crew (skylight cut / smash, window cut, front door + ramps / service-shaft ladder), clear
// each crew, take the three intel pieces in turn, the tower reveal, the tower foot ends the chapter (-> 'tower'), and
// a checkpoint reload keeps the cleared crews.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
const ctx = new Proxy({}, { get: (t, k) => k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
const el = () => ({ width: 0, height: 0, getContext: () => ctx, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, querySelector: () => null });
globalThis.document = { createElement: el, getElementById: () => null, body: el(), querySelectorAll: () => [] };
const keyFns = []; globalThis.addEventListener = (t, fn) => { if (t === 'keydown') keyFns.push(fn); }; globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
const { setWorldTargets, boxes, clearWorld, groundBelow } = await import('../../../src/world.js');
const { LevelKit } = await import('../../../src/campaign/kit.js');
const { makeTraverse } = await import('../../../src/campaign/traverse.js');
const { Hero } = await import('../../../src/hero.js');
const lvl = (await import('../../../src/levels/toronto.js')).default;
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
const scene = new THREE.Scene(), physics = new CANNON.World();
setWorldTargets(scene, physics);
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 200);
const G = { scene, physics, camera, input: { keys: {}, yaw: 0, pitch: 0 }, fx: noop, enemies: [], ragdolls: [], parts: [], projectiles: [], finMeter: 0, finGain() {}, flags: {},
  shake() {}, hitstop() {}, slowmo() {}, fovKick() {}, blurKick() {}, punch() {}, camImpulse() {}, banner() {}, noise() {}, onHit() {}, coverBoxes: [], kills: 0, combo: 0, onAlarm() {}, onHeroDeath() {}, playing: true };
let finished = null, cps = [];
const objs = {};
const C = { hud: { objective(id, t) { objs[id] = t; }, complete(id) { objs[id] = 'DONE'; } }, reachCheckpoint(id) { cps.push(id); }, finish(n) { finished = n; } };
let L;
function load(cp = 'start') {
  if (L) { lvl.unload(L); L.dispose(); }
  for (const e of G.enemies) scene.remove(e.rig.root); G.enemies.length = 0; clearWorld();
  L = new LevelKit(G, C, lvl); L.cutscene = async () => {}; L.say = async () => {}; L.C = C;
  lvl.build(L); makeTraverse(L);
  G.hero = new Hero(G);
  const s = L.checkpoints[cp]; put(s.x, s.y, s.z, s.yaw);
  return lvl.start(L, { checkpoint: cp });
}
let fail = 0; const ok = (n, c, i) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + JSON.stringify(i) : '')); };
const step = () => { const h = G.hero; h.update(1 / 60); for (const e of [...G.enemies]) e.update(1 / 60); L.update(1 / 60); };
const sim = (s, fn) => { for (let i = 0; i < s * 60; i++) { if (fn?.(i) === false) break; step(); } };
const go = (yaw, keys) => { G.input.yaw = yaw; G.input.keys = {}; for (const k of keys) G.input.keys[k] = true; };
function put(x, y, z, yaw = 0) { const h = G.hero; h.pos.set(x, y, z); h.vel.set(0, 0, 0); h.yaw = yaw; h.crawling = h.tight = false; h.ladder = null; h.mantle = null; h.climbing = false; h.wall = null; h.fin = null; h.grounded = true; h.hp = 1e6; h.dead = false; h.iframes = 0; G.input.crouch = false; G.input.keys = {}; }
const blind = () => { for (const e of G.enemies) { e.patrol = null; e.wander = false; e.wp = null; e.seeK = 0.001; e.hearK = 0; } };
const kill = tag => { for (const e of G.enemies) if (e.tag === tag) e.alive = false; };
const press = code => keyFns.forEach(fn => fn({ code, repeat: false }));
const E = Math.PI / 2, Wd = -Math.PI / 2, N = Math.PI, S = 0; // yaw: east, west, north (-z), south (+z)

await load('start'); blind();
const st = lvl.st;
ok('city builds from OSM: hundreds of colliders, three crews of 7, the tower found', boxes.length > 500 && ['wh', 'pg', 'of'].every(t => L.alive(t) === 7) && lvl.towerTop > 250,
  { boxes: boxes.length, crews: ['wh', 'pg', 'of'].map(t => L.alive(t)), tower: lvl.towerTop, enemies: G.enemies.length });
ok('objectives up: hunt + three crews', /0\/3/.test(objs.hunt || '') && /7 men/.test(objs.wh || ''), objs);
{ const h = G.hero; ok('spawn on King St at Yonge stands on the street', Math.abs(h.pos.y) < 0.01 && groundBelow(h.pos.x, h.pos.z, 1) === 0);
  go(Wd, ['KeyW', 'ShiftLeft']); sim(6); ok('sprint west along King St: the street is open', h.pos.x < 215 - 40 && Math.abs(h.pos.z - 20) < 3, { x: +h.pos.x.toFixed(1), z: +h.pos.z.toFixed(1) }); }

// --- WAREHOUSE: smash a skylight (C) and drop in; the fire-escape window; the front door
{ const h = G.hero, sk = st.entries.filter(w => w.sky && w.base === 'wh');
  put(-190, 10.3, 286, S); sim(0.2);
  ok('standing on a warehouse skylight offers the glass', st.near === sk[0], { near: !!st.near, y: +h.pos.y.toFixed(2) });
  G.input.crouch = true; sim(0.1); G.input.crouch = false; sim(2.0);
  ok('C smashes it and he drops into the hall', sk[0].broken && h.pos.y < 0.2 && h.pos.z > 275 && h.pos.z < 297, { y: +h.pos.y.toFixed(2) });
  put(-156.5, 0, 294, Wd); go(Wd, ['KeyW']); let onL = false; sim(4, () => { if (h.ladder) onL = true; });
  ok('fire-escape ladder up to the landing', onL && Math.abs(h.pos.y - 5.5) < 0.1, { y: +h.pos.y.toFixed(2), x: +h.pos.x.toFixed(2) });
  put(-158.6, 5.5, 292, Wd); sim(0.1); const win = st.near;
  ok('at the high window the glass is offered', win && !win.sky && win.base === 'wh');
  press('KeyE'); go(Wd, ['KeyW']); sim(1.5, () => { if (h.pos.x < -160.9) G.input.keys = {}; });
  ok('E cuts it quietly and he steps through onto the catwalk', win?.broken && h.pos.x < -160.5 && Math.abs(h.pos.y - 5.5) < 0.1, { x: +h.pos.x.toFixed(2), y: +h.pos.y.toFixed(2) });
  put(-180, 0, 268, S); go(S, ['KeyW']); sim(2.5);
  ok('front: the roll-up door opens and he walks into the hall', h.pos.z > 276, { z: +h.pos.z.toFixed(2) });
}
// --- PARKING GARAGE: in through the vehicle entrance, up both ramps; the ledge window; the roof skylight (E)
{ const h = G.hero;
  put(216, 0, -247, Wd); go(Wd, ['KeyW']); sim(1.6); ok('vehicle entrance from Yonge', h.pos.x < 210, { x: +h.pos.x.toFixed(2) });
  put(171.2, 0, -230, E); go(E, ['KeyW']); sim(2.6, () => { if (h.pos.x > 186) G.input.keys = {}; });
  ok('ramp 1: ground -> P2 (3.4 m)', Math.abs(h.pos.y - 3.4) < 0.05, { y: +h.pos.y.toFixed(2), x: +h.pos.x.toFixed(2) });
  put(201, 3.4, -254.6, Wd); go(Wd, ['KeyW']); sim(2.6, () => { if (h.pos.x < 186) G.input.keys = {}; });
  ok('ramp 2: P2 -> top deck (6.8 m)', Math.abs(h.pos.y - 6.8) < 0.05, { y: +h.pos.y.toFixed(2), x: +h.pos.x.toFixed(2) });
  put(181, 0, -261, S); go(S, ['KeyW']); let onL = false; sim(3.5, () => { if (h.ladder) onL = true; });
  ok('lane ladder up to the office ledge', onL && Math.abs(h.pos.y - 6.8) < 0.1, { y: +h.pos.y.toFixed(2) });
  put(176, 6.8, -258.9, S); sim(0.1); const win = st.near; press('KeyE'); go(S, ['KeyW']); sim(1.2);
  ok('ledge window cut, into the crew office', win?.base === 'pg' && win.broken && h.pos.z > -257.6 && Math.abs(h.pos.y - 6.8) < 0.1, { z: +h.pos.z.toFixed(2) });
  put(176, 10.2, -252, S); sim(0.2); const sk = st.near; press('KeyE'); sim(1.5);
  ok('roof skylight: E cuts it, he drops into the office', sk?.sky && sk.broken && Math.abs(h.pos.y - 6.8) < 0.1, { y: +h.pos.y.toFixed(2) });
}
// --- OFFICE FLOOR: lobby door, the service shaft ladder to 18.5, the ledge window, a hard landing on a skylight
{ const h = G.hero;
  put(-236, 0, -97, E); go(E, ['KeyW']); sim(1.5); ok('lobby front door from York St', h.pos.x > -231, { x: +h.pos.x.toFixed(2) });
  put(-205.0, 0, -98.8, Wd); go(Wd, ['KeyW']); let onL = false; sim(9, () => { if (h.ladder) onL = true; if (onL && !h.ladder && !h.mantle) return false; });
  sim(0.6); ok('service shaft ladder up to the top floor', onL && Math.abs(h.pos.y - 18.5) < 0.1 && h.pos.x < -206, { y: +h.pos.y.toFixed(2), x: +h.pos.x.toFixed(2) });
  put(-214, 18.5, -84.8, N); sim(0.1); const win = st.near; press('KeyE'); go(N, ['KeyW']); sim(1.2);
  ok('south ledge window cut, onto the office floor', win?.base === 'of' && win.broken && h.pos.z < -86 && Math.abs(h.pos.y - 18.5) < 0.1, { z: +h.pos.z.toFixed(2), y: +h.pos.y.toFixed(2) });
  put(-220, 30, -97, S); h.grounded = false; h.vel.set(0, -14, 0); sim(2);
  ok('a hard landing on the skylight smashes through to the floor', st.entries.find(w => w.sky && w.base === 'of').broken && Math.abs(h.pos.y - 18.5) < 0.1, { y: +h.pos.y.toFixed(2) });
}
// --- intel: refused while the crew lives, then each piece in turn, then the reveal and the tower
{ const h = G.hero;
  put(-197.5, 0, 295); sim(0.3); ok('intel refused while the crew lives', !st.taken.wh);
  put(-185, 0, 285); kill('wh'); sim(0.2); ok('crew cleared: objective turns to the intel', st.cleared.wh && /intel/.test(objs.wh), { wh: objs.wh });
  const t = lvl.target(L); ok('the waypoint now points at the intel', t && t.label === 'INTEL' && t.id === 'wh');
  put(-197.5, 0, 295.4); sim(0.3); ok('intel 1/3 taken, checkpoint saved', st.taken.wh && st.intel === 1 && cps.includes('c1_wh'), { cps });
  kill('pg'); sim(0.1); put(168.6, 6.8, -254.2); sim(0.3); ok('intel 2/3 (garage)', st.taken.pg && st.intel === 2 && cps.includes('c3_pg'));
  kill('of'); sim(0.1); put(-229.5, 18.5, -104.2); sim(0.3); await new Promise(r => setTimeout(r, 0)); sim(0.1);
  ok('intel 3/3 reveals Rourke Tower', st.intel === 3 && st.revealed && /Rourke Tower/.test(objs.tower || '') && cps.includes('r_of'), { tower: objs.tower, cps });
  const t2 = lvl.target(L); ok('the waypoint points at the tower foot', t2 && t2.label === 'ROURKE TOWER');
  put(-75, 0, 4, N); sim(0.3); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  ok('reaching the tower foot ends the chapter -> tower', finished === 'tower', { finished });
}
// --- checkpoint reload keeps progress
{ await load('c3_pg'); ok('reload at c3_pg: warehouse + garage crews gone, intel 2/3', L.alive('wh') === 0 && L.alive('pg') === 0 && L.alive('of') === 7 && lvl.st.intel === 2, { wh: L.alive('wh'), pg: L.alive('pg'), of: L.alive('of') });
  await load('r_of'); ok('reload after the reveal: straight to the tower objective', lvl.st.revealed && /Rourke Tower/.test(objs.tower || ''));
  const big = boxes.filter(b => b.max.y > 1).length; ok('collider count stays sane (spatial grid in world.js)', big < 4500, { big });
  ok('ordinary buildings are enterable: a street door, windows, interiors; traffic, pedestrians, taxi stands', lvl.enter.length >= 80 && lvl.life.cars.length >= 10 && L.alive('civ') >= 10 && lvl.life.stands.length === 4, { enter: lvl.enter.length, cars: lvl.life.cars.length, civ: L.alive('civ') });
  { const B = lvl.enter[5], dz = L.doors.find(d => d.x > B[0] - 0.5 && d.x < B[2] + 0.5 && d.z > B[1] - 0.5 && d.z < B[3] + 0.5); ok('...each with a door in its walls', !!dz, { B }); } }
process.exit(fail ? 1 : 0);
