// BANNERFALL :: main.js - boot, URL hooks, the state machine (title -> prepare -> battle -> results),
// the fixed-step loop with render interpolation, and the glue between sim, render, input and UI.
// Two kinds of world share it: the v1 single-arena battles (256 m, data/battles.js) and the v2 WAR
// on a huge generated map (sim/war.js: FOUNDING, then a war against rival kingdoms).
import * as THREE from '../vendor/three.module.js';
import { battleById } from './data/battles.js';
import { BUILD_TYPES } from './data/builds.js';
import { ENVS } from './data/envs.js';
import { C } from './data/constants.js';
import { createWorld, step, startBattle, snapshot } from './sim/world.js';
import { createWarWorld, startWar, autoFound, recruit, chooseVillage, chooseFort, warSnapshot, bannerCap, bannersUsed, incomeOf } from './sim/war.js';
import { offerTruce, demandTribute, payToAttack, declareWar, answerOffer, demandSurrender } from './sim/diplomacy.js';
import { placeBlueprint, cancelBlueprint, finishBlueprints } from './sim/construction.js';
import { stageBattle } from './sim/testkit.js';
import { serializeWorld, restoreWorld, stateHash } from './sim/save.js';
import { issue, buy, deploy, build, undo, previewBuild, demolish, planLine, inZone } from './sim/orders.js';
import { aiPrepare } from './sim/ai.js';
import { makeSlots } from './sim/squads.js';
import { segClosest, canGarrison } from './sim/structures.js';
import { hostile } from './sim/factions.js';
import { regionAt } from './sim/regions.js';
import { canSee } from './sim/vision.js';
import { createScene } from './render/scene.js';
import { buildTerrain, buildSkirt, buildFlowers, setPalette } from './render/terrainMesh.js';
import { buildWorldTerrain } from './render/worldTerrain.js';
import { buildProps, setTentColours } from './render/props.js';
import { buildWarProps } from './render/warProps.js';
import { createUnitRenderer, setTeamColors } from './render/unitMeshes.js';
import { createStructureRenderer } from './render/structureMeshes.js';
import { createStructureInstancer } from './render/structInstanced.js';
import { createFX } from './render/fx.js';
import { createOverlays } from './render/overlays.js';
import { createRTSCamera } from './input/camera.js';
import { bindInput } from './input/input.js';
import { createHUD } from './ui/hud.js';
import { createWarHUD } from './ui/warhud.js';
import { createPrepareUI } from './ui/prepare.js';
import { createMenus } from './ui/menus.js';
import { initAudio, setAudio, audioState, sfx, setMusicMode } from './audio.js';
import { installDebug } from './debug.js';
import { lodScale, applyLod } from './render/lod.js';
// the Long War (builder B, v3): the realm, its map, its HUD and the bridge to fought battles
import { createRealm, realmDay, realmAdvance, realmHash, dateText } from './sim/realm/realm.js';
import { saveRealm, loadRealm, slotInfo, serializeRealm, restoreRealm } from './sim/realm/save.js';
import { order as realmOrder, raise as realmRaise, musterGarrison, armiesOf, findPath as realmPath, pathDays } from './sim/realm/armies.js';
import { resolveAbstract, engagementInfo } from './sim/realm/engage.js';
import { judge, propose as realmPropose, declareWar as realmDeclare, answerLetter, opinion as realmOpinion, atWar as realmAtWar, makeTruce } from './sim/realm/diplomacy.js';
import { battleOptions, payChest, writeBack, playerSide } from './sim/realm/battlebridge.js';
import { buildRealmMap } from './render/realmMap.js';
import { createRealmUI } from './ui/realm.js';

const Q = new URLSearchParams(location.search);
const SAVE_KEY = 'pd.bannerfall';
function loadSave() {
  const d = { best: {}, difficulty: 'captain', sfx: true, music: true, edgePan: true, seenTips: false, war: {} };
  try {
    let s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s) { const old = JSON.parse(localStorage.getItem('pd.warfront') || 'null'); if (old) { s = old; localStorage.setItem(SAVE_KEY, JSON.stringify(old)); } }
    if (s) Object.assign(d, s);
  } catch (e) { /* no storage */ }
  return d;
}

const canvas = document.getElementById('c');
const lowfx = Q.has('nofx');
const view = createScene(canvas, { lowfx, preserve: Q.has('shot') });
const G = {
  world: null, mode: 'title', sel: new Set(), hover: null, tool: null, groups: {}, paused: false, speed: Number(Q.get('speed') || 1),
  save: loadSave(), v: null, fpsAvg: 60, simOnly: false, focusSettle: null, frameMs: 0,
};
G.persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* ignore */ } };
G.cam = createRTSCamera(view.camera, (x, z) => (G.v ? G.v.heightAt(x, z) : 0), 256);
G.cam.S.edgePan = G.save.edgePan !== false && !navigator.webdriver;
setAudio({ sfx: G.save.sfx, music: G.save.music });
G.initAudio = () => initAudio();
G.setAudio = (o) => { setAudio(o); Object.assign(G.save, o); G.persist(); };
G.audio = () => audioState();

const hud = createHUD(G);
const whud = createWarHUD(G);
const prep = createPrepareUI(G);
const rui = createRealmUI(G);
G.rui = rui;
const menus = createMenus(G);
G.menus = menus;
G.toast = (t, c, pos) => hud.toast(t, c, pos);
G.isWar = () => !!(G.world && G.world.war);
// fog of war (sim/vision.js): what your kingdom sees; ?reveal=1 shows everything
G.reveal = Q.has('reveal');
G.seen = (x, z) => canSee(G.world, 0, x, z);
G.foe = (team) => (G.world && G.world.hostM ? hostile(G.world, 0, team) : team !== 0);

// ------------------------------------------------------------------ building a view
function disposeScene() {
  const sc = view.scene;
  for (let i = sc.children.length - 1; i >= 0; i--) {
    const o = sc.children[i];
    if (o === view.sun || o === view.sun.target || o === view.hemi || o === view.sky || o.isLight) continue;
    sc.remove(o);
    o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) { const ms = Array.isArray(n.material) ? n.material : [n.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } });
  }
}
function lightFor(env, war) {
  // the v1 palettes, with the fog thinned for a several-km map (aerial perspective, not a wall)
  const E = { ...env };
  if (war) E.fogD = env.fogD * 0.2;
  view.applyEnv(E);
  G.fogD = E.fogD;
  view.camera.near = 0.5; view.camera.far = war ? 7000 : 1400;
  view.camera.updateProjectionMatrix();
}
function buildView(world) {
  disposeScene();
  leaveRealmShadow();
  const env = ENVS[world.def.env || 'spring'] || ENVS.spring;
  lightFor(env, false);
  setPalette(env);
  setTeamColors([{ slot: 0, main: 0x2f5fa8, trim: 0xe2b33c, ink: 0xf6eccf }, { slot: 1, main: 0xa82f2f, trim: 0x2a2326, ink: 0xf1e3d0 }]);
  const terrain = buildTerrain(view.scene, world, { noGrass: lowfx, env });
  const heightAt = (x, z) => { const h = terrain.heightShown(x, z); return h < world.terrain.waterLevel - 0.25 ? world.terrain.waterLevel - 0.25 : h; };
  G.v = { terrain, heightAt, units: createUnitRenderer(view.scene), structs: createStructureRenderer(view.scene, world), fx: createFX(view.scene, world), over: createOverlays(view.scene, heightAt), war: false };
  G.v.skirt = buildSkirt(view.scene, world);
  G.v.flowers = lowfx ? null : buildFlowers(view.scene, world);
  G.v.props = buildProps(view.scene, world, { skirtHeight: G.v.skirt.height, env });
  G.cam.configure(world.terrain.size, 14, 210);
}
function buildWarView(world) {
  disposeScene();
  leaveRealmShadow();
  const W = world.war;
  const env = ENVS[W.env] || ENVS.spring;
  lightFor(env, true);
  setPalette(env);
  const cols = Object.values(W.factions).map((f) => ({ slot: f.slot, main: f.main, trim: f.trim, ink: f.ink }));
  setTeamColors(cols); setTentColours(cols);
  const t0 = performance.now(), tm = {};
  const terrain = buildWorldTerrain(view.scene, world, { env, noGrass: lowfx, reveal: G.reveal });
  tm.terrain = Math.round(performance.now() - t0);
  const heightAt = (x, z) => { const h = terrain.heightShown(x, z); return h < world.terrain.waterLevel - 0.25 ? world.terrain.waterLevel - 0.25 : h; };
  G.v = { terrain, heightAt, war: true, env, timings: tm };
  G.v.props = buildWarProps(view.scene, world, { env, renderer: view.renderer });
  tm.props = Math.round(performance.now() - t0) - tm.terrain;
  G.v.units = createUnitRenderer(view.scene);
  G.v.structs = createStructureInstancer(view.scene, world);
  tm.rest = Math.round(performance.now() - t0) - tm.terrain - tm.props;
  G.v.fx = createFX(view.scene, world);
  G.v.over = createOverlays(view.scene, heightAt);
  G.v.buildMs = Math.round(performance.now() - t0);
  G.cam.configure(world.terrain.size, 14, 1400);
}

function resetState() { G.sel.clear(); G.groups = {}; G.tool = null; G.hover = null; G.paused = false; G.focusSettle = null; }

// ------------------------------------------------------------------ v1 single battles
function setupWorld(opts = {}) {
  document.body.classList.remove('realm');
  const def = battleById(Q.get('battle') || 1);
  const diff = Q.get('diff') || G.save.difficulty || 'captain';
  const world = createWorld(def, { seed: Number(Q.get('seed')) || def.seed, difficulty: diff, unlockAll: Q.get('tech') === 'all' || opts.unlockAll });
  G.world = world;
  resetState();
  buildView(world);
  hud.reset(); prep.reset(); whud.reset();
  return world;
}

G.newBattle = (opts = {}) => {
  menus.close();
  const world = setupWorld(opts);
  G.mode = 'prepare';
  document.getElementById('hud').classList.remove('hidden');
  document.body.classList.remove('war');
  G.v.terrain.uniforms.uZone.value = 1;
  setMusicMode('calm');
  autoPlaceReserve(world);
  G.cam.jump(128, 100, 92, Math.PI);
  G.tipStep = 0;
  showTutorial();
  if (Q.get('phase') === 'battle' || opts.autoBattle) {
    for (const s of [...world.squads.values()]) if (s.team === 0) s.deployed = false;
    aiPrepare(world, 0);
    G.startBattle();
  }
  if (Q.has('bot') || opts.bot) world.botPlayer = true;
  return world;
};

// ------------------------------------------------------------------ the war on a huge map
G.newWar = (opts = {}) => {
  menus.close();
  const num = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);
  const o = opts.realmOpts ? { ...opts } : {
    seed: opts.seed ?? num('seed', (Math.random() * 1e6) | 0),
    size: opts.size || Q.get('size') || 'medium',
    biome: opts.biome || Q.get('biome') || undefined,
    enemies: opts.enemies ?? num('enemies', 2),
    gold: opts.gold ?? num('gold', 50000),
    difficulty: opts.difficulty || Q.get('diff') || G.save.difficulty || 'captain',
    win: opts.win || Q.get('win') || 'conquest',
    villages: Q.get('villages') || undefined,
    factions: Q.get('factions') ? Q.get('factions').split(',') : undefined,
    tech: Q.get('tech') === 'all' ? ['chainmail', 'longbows', 'fireArrows', 'shieldWall', 'pavise', 'masonry'] : [],
  };
  const t0 = performance.now();
  const world = createWarWorld(o);
  world.genMs = Math.round(performance.now() - t0);
  G.world = world;
  resetState();
  buildWarView(world);
  hud.reset(); prep.reset(); whud.reset();
  G.mode = 'prepare';
  document.getElementById('hud').classList.remove('hidden');
  document.body.classList.add('war');
  G.v.terrain.uniforms.uZone.value = 1;
  setMusicMode('calm');
  const home = world.war.settlements.find((s) => s.id === world.war.home);
  G.cam.jump(home.pos[0], home.pos[1] - 10, 240, Math.PI - home.gateDir * 0 + 0);
  G.cam.S.tyaw = G.cam.S.yaw = home.gateDir + Math.PI;
  G.tipStep = 20;
  showTutorial();
  if (!opts.realmOpts && (Q.get('phase') === 'war' || opts.autoWar)) { autoFound(world, 0); G.startBattle(); }
  if (!opts.realmOpts && (Q.has('bot') || opts.bot)) world.botPlayer = true;
  return world;
};

// continue a saved war (sim/save.js): the map is regenerated from its seed, then everything else
G.loadWar = (data) => {
  menus.close();
  const world = restoreWorld(data);
  G.world = world;
  resetState();
  buildWarView(world);
  hud.reset(); prep.reset(); whud.reset();
  G.mode = world.phase === 'prepare' ? 'prepare' : world.phase === 'over' ? 'over' : 'battle';
  document.getElementById('hud').classList.remove('hidden');
  document.body.classList.add('war');
  G.v.terrain.uniforms.uZone.value = G.mode === 'prepare' ? 1 : 0;
  const home = world.war.settlements.find((s) => s.owner === 0 && s.kind !== 'village') || world.war.settlements.find((s) => s.id === world.war.home);
  G.cam.jump(home.pos[0], home.pos[1], 240, home.gateDir + Math.PI);
  return world;
};

// a free spot in the deploy zone by role: foot in front, shooters behind, monks and horse at the back
function autoSpot(world, sq) {
  if (world.war) {
    const home = world.war.settlements.find((s) => s.id === world.war.home);
    const gd = [Math.sin(home.gateDir), Math.cos(home.gateDir)], pp = [-gd[1], gd[0]];
    const row = sq.def.heal ? 8 : sq.def.tags.includes('cavalry') ? 14 : sq.def.ranged ? 22 : sq.def.builder ? -6 : 30;
    const taken = [...world.squads.values()].filter((s) => s.team === 0 && s.deployed && s !== sq);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) {
      const u = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 15, d = home.r * 0.25 + row + r * 9;
      const x = home.pos[0] + gd[0] * d + pp[0] * u, z = home.pos[1] + gd[1] * d + pp[1] * u;
      if (!inZone(world, 0, x, z) || world.terrain.waterDepth(x, z) > 0.2) continue;
      if (taken.some((s) => Math.hypot(s.cx - x, s.cz - z) < 11)) continue;
      if (world.obstacleCells(x, z).some((o) => o.r > 1.2 && Math.hypot(o.x - x, o.z - z) < o.r + 6)) continue;
      return [x, z];
    }
    return [home.pos[0] + gd[0] * 40, home.pos[1] + gd[1] * 40];
  }
  const F = world.def.zones.flag.pos;
  const cav = sq.def.tags.includes('cavalry');
  const row = sq.type === 'commander' ? 14 : sq.def.heal ? 24 : cav ? 18 : sq.def.ranged ? 32 : 42;
  const taken = [...world.squads.values()].filter((s) => s.team === 0 && s.deployed && s !== sq);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 13; k++) {
    const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 16;
    const x = F[0] + dx, z = F[1] + row + (r % 2 ? 1 : -1) * Math.ceil(r / 2) * 7;
    if (!inZone(world, 0, x, z) || world.terrain.waterDepth(x, z) > 0.2) continue;
    if (taken.some((s) => Math.hypot(s.cx - x, s.cz - z) < 11)) continue;
    if (world.obstacles.some((o) => o.r > 1.2 && Math.hypot(o.x - x, o.z - z) < o.r + 6)) continue;
    return [x, z];
  }
  return [F[0], F[1] + row];
}
function autoPlaceReserve(world) {
  for (const s of [...world.squads.values()]) {
    if (s.team !== 0 || s.deployed) continue;
    const [x, z] = autoSpot(world, s);
    deploy(world, 0, s.id, x, z, 0);
  }
}

G.toTitle = () => {
  menus.close();
  rui.hide(); document.body.classList.remove('realm'); G.realm = null; G.realmBattle = null; G.rv = null; G.rDone = false;
  setupWorld({ unlockAll: false });
  const w = G.world;
  aiPrepare(w, 0);
  w.botPlayer = true;
  startBattle(w);
  w.t = 0;
  G.mode = 'title';
  G.v.terrain.uniforms.uZone.value = 0;
  document.getElementById('hud').classList.add('hidden');
  document.body.classList.remove('war');
  G.cam.jump(128, 120, 52, Math.PI * 0.86);
  menus.title();
};

G.startBattle = () => {
  const w = G.world;
  if (G.mode !== 'prepare') return;
  const any = [...w.squads.values()].some((s) => s.team === 0 && s.deployed && s.type !== 'commander' && !s.def.builder);
  if (!any) { G.toast('Raise at least one squad of soldiers first.', 'bad'); sfx.error(); return; }
  if (w.war) startWar(w); else startBattle(w);
  G.mode = 'battle';
  G.setTool(null);
  G.v.terrain.uniforms.uZone.value = 0;
  setMusicMode('battle');
  sfx.horn(true);
  G.toast(w.war ? 'Raise the banners! The war begins.' : 'To arms! Hold the ford.', 'good');
  G.tipStep = w.war ? 30 : 10;
  showTutorial();
  hud.reset(); whud.reset();
};

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmpV = new THREE.Vector3();
G.groundAt = (cx, cy) => {
  if (!G.v) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, view.camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const H = G.v.heightAt;
  const S = G.mode === 'realm' && G.realm ? G.realm.size : G.world.terrain.size;
  let t = 0, prev = 0;
  for (let i = 0; i < 1600; i++) {
    t += 0.8 + t * 0.004;
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y <= H(x, z)) {
      let a = prev, b = t;
      for (let k = 0; k < 12; k++) { const m = (a + b) / 2; const yy = o.y + d.y * m; if (yy <= H(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      const px = o.x + d.x * b, pz = o.z + d.z * b;
      if (px < -20 || pz < -20 || px > S + 20 || pz > S + 20) return null;
      return [Math.max(0, Math.min(S, px)), H(px, pz), Math.max(0, Math.min(S, pz))];
    }
    if (t > 9000) break;
    prev = t;
  }
  return null;
};
function toScreen(x, y, z) {
  tmpV.set(x, y, z).project(view.camera);
  const r = canvas.getBoundingClientRect();
  return [(tmpV.x * 0.5 + 0.5) * r.width + r.left, (-tmpV.y * 0.5 + 0.5) * r.height + r.top, tmpV.z];
}
G.toScreen = toScreen;
G.squadAt = (cx, cy) => {
  const w = G.world; if (!w) return null;
  let best = null, bd = 26 * 26;
  const cp = view.camera.position;
  for (const so of w.soldiers) {
    if (!so.alive || !so.sq.deployed) continue;
    if (w.war && (so.x - cp.x) ** 2 + (so.z - cp.z) ** 2 > 360000) continue;
    if (w.war && !G.reveal && so.sq.team !== 0 && !G.seen(so.x, so.z)) continue;
    const cav = so.sq.def.tags.includes('cavalry');
    const p = toScreen(so.x, so.y + (cav ? 1.6 : 1.0), so.z);
    if (p[2] > 1) continue;
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d < bd) { bd = d; best = so.sq; }
  }
  // banners are big targets (and grow into badges far away)
  for (const [id, b] of G.v.units.banners) {
    const sq = w.squads.get(id);
    if (!sq || !sq.deployed || sq.alive <= 0 || b.x === undefined) continue;
    if (w.war && !G.reveal && sq.team !== 0 && !G.seen(sq.cx, sq.cz)) continue;
    const p = toScreen(b.x, b.y, b.z);
    if (p[2] > 1) continue;
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d < bd * (b.s > 1.5 ? 2 : 1)) { bd = d; best = sq; }
  }
  return best;
};
function structAt(g) {
  if (!g) return null;
  let best = null, bd = 3.5;
  for (const s of G.world.structures.values()) {
    if (!s.alive) continue;
    const c = s.kind === 'tower' ? { d: Math.hypot(g[0] - s.pos[0], g[2] - s.pos[1]) - 1.5 } : segClosest(s, g[0], g[2]);
    if (c.d < bd) { bd = c.d; best = s; }
  }
  return best;
}
// a settlement under a ground point (its yard, square or treasury)
G.settlementAt = (g) => {
  if (!g || !G.isWar()) return null;
  let best = null, bd = Infinity;
  for (const s of G.world.war.settlements) {
    const d = Math.hypot(g[0] - s.pos[0], g[2] - s.pos[1]);
    if (d < s.r * 0.85 && d < bd) { bd = d; best = s; }
  }
  return best;
};
G.hoverAt = (cx, cy) => {
  if (G.mode === 'realm') return;
  const sq = G.squadAt(cx, cy);
  G.hover = sq ? sq.id : null;
  const tip = document.getElementById('cursorTip');
  if (G.toolMode() && G.tool) return;
  if (sq) {
    const enemy = sq.team !== 0;
    const fac = G.isWar() ? G.world.war.factions[sq.team] : null;
    tip.style.display = 'block'; tip.className = 'parch' + (enemy ? ' bad' : '');
    tip.style.left = cx + 'px'; tip.style.top = cy + 'px';
    tip.textContent = `${sq.name}${fac && enemy ? ' (' + fac.short + ')' : ''} · ${sq.alive}/${sq.menMax}${sq.state !== 'steady' ? ' · ' + sq.state : ''}${enemy && G.sel.size && G.foe(sq.team) ? ' · right-click to attack' : ''}`;
  } else tip.style.display = 'none';
};

// ------------------------------------------------------------------ selection + orders
G.select = (ids, add) => {
  if (!add) G.sel.clear();
  for (const id of ids) {
    const s = G.world.squads.get(id);
    if (!s || s.team !== 0 || s.state === 'routing' || s.state === 'gone') continue;
    if (add && G.sel.has(id) && ids.length === 1) G.sel.delete(id); else G.sel.add(id);
  }
  if (ids.length) { sfx.click(); G.focusSettle = null; }
  if (G.tool && G.mode === 'battle' && !G.toolMode()) G.setTool(null);
};
G.clickSelect = (cx, cy, shift, dbl) => {
  if (G.mode === 'realm') { rui.click(cx, cy); sfx.click(); return; }
  const sq = G.squadAt(cx, cy);
  if (sq && sq.team === 0) {
    if (dbl) {
      const ids = [...G.world.squads.values()].filter((s) => s.team === 0 && s.type === sq.type && s.deployed && s.alive > 0).filter((s) => { const p = toScreen(s.cx, s.cy, s.cz); return p[2] < 1 && p[0] > 0 && p[1] > 0 && p[0] < innerWidth && p[1] < innerHeight; }).map((s) => s.id);
      G.select(ids, shift);
    } else G.select([sq.id], shift);
    return;
  }
  // a castle, fort or village: open its panel
  const st = G.settlementAt(G.groundAt(cx, cy));
  if (st && !shift) { G.sel.clear(); G.focusSettle = st.id; sfx.click(); return; }
  if (!shift) { G.select([], false); G.focusSettle = null; }
};
G.boxSelect = (x0, y0, x1, y1, shift) => {
  if (G.mode === 'realm') return;
  const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
  const ids = new Set();
  for (const so of G.world.soldiers) {
    if (!so.alive || so.sq.team !== 0 || !so.sq.deployed) continue;
    const p = toScreen(so.x, so.y + 1, so.z);
    if (p[2] < 1 && p[0] >= a && p[0] <= b && p[1] >= c && p[1] <= d) ids.add(so.sq.id);
  }
  G.select([...ids], shift);
};
function selIds() { return [...G.sel].filter((id) => { const s = G.world.squads.get(id); return s && s.alive > 0 && s.state !== 'routing'; }); }
G.selIds = selIds;
G.rightClick = (cx, cy, mods) => {
  if (G.mode === 'realm') { rui.rightClick(cx, cy); return; }
  const ids = selIds();
  const w = G.world;
  const g = G.groundAt(cx, cy);
  if (!ids.length) {
    // with a castle panel open, right-click sets its rally point
    if (G.focusSettle && g && w.war) { const s = w.war.settlements.find((q) => q.id === G.focusSettle); if (s && s.owner === 0) { s.rally = [g[0], g[2]]; G.toast('Rally point set for ' + s.name + '.'); sfx.order(); } }
    return;
  }
  const sq = G.squadAt(cx, cy);
  if (sq && sq.team !== 0 && G.mode === 'battle' && G.foe(sq.team)) {
    issue(w, 0, ids, { type: 'attack', targetId: sq.id });
    sfx.order();
    return;
  }
  const st = structAt(g);
  if (st && st.team === 0 && (st.kind === 'tower' || st.kind === 'wall') && canGarrison(st, w) && (st.kind === 'wall' || ids.some((id) => w.squads.get(id).def.ranged)) && issue(w, 0, ids, { type: 'garrison', structureId: st.id })) {
    G.toast(st.kind === 'tower' ? 'Archers climb the tower.' : 'The men climb onto the wall-walk.');
    sfx.order();
    return;
  }
  if (st && st.team !== 0 && G.mode === 'battle' && G.foe(st.team)) { issue(w, 0, ids, { type: 'attackStruct', structureId: st.id }); sfx.order(); return; }
  if (!g) return;
  if (G.mode === 'prepare' && !inZone(w, 0, g[0], g[2])) { G.toast(w.war ? 'Keep to your own land until the war starts.' : 'Keep to the blue ground until the battle starts.', 'bad'); sfx.error(); return; }
  issue(w, 0, ids, { type: 'move', to: [g[0], g[2]], queue: mods.queue, attackMove: mods.attackMove, force: mods.force });
  sfx.order();
};
function lineFacing(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let f = Math.atan2(-dz, dx);
  const cf = [-Math.sin(G.cam.S.yaw), -Math.cos(G.cam.S.yaw)];
  if (Math.sin(f) * cf[0] + Math.cos(f) * cf[1] < 0) f += Math.PI;
  return f;
}
G.lineOrder = (a, b, mods) => {
  const ids = selIds(); if (!ids.length) return;
  const w = G.world;
  if (G.mode === 'prepare' && (!inZone(w, 0, a[0], a[1]) || !inZone(w, 0, b[0], b[1]))) { G.toast(w.war ? 'Keep to your own land until the war starts.' : 'Keep to the blue ground until the battle starts.', 'bad'); sfx.error(); return; }
  issue(w, 0, ids, { type: 'line', a, b, facing: lineFacing(a, b), queue: mods.queue, attackMove: mods.attackMove, force: mods.force, ranks: true });
  sfx.order();
};
G.previewLine = (a, b) => {
  if (!G.v || !G.v.over) return;
  if (!a) { G.v.over.showFormation(null); return; }
  const sqs = selIds().map((id) => G.world.squads.get(id));
  const plan = planLine(G.world, sqs, { a, b, facing: lineFacing(a, b), ranks: true });
  if (!plan) { G.v.over.showFormation(null); return; }
  G.v.over.showFormation(plan.map((p) => {
    const f = p.facing, sn = Math.sin(f), cs = Math.cos(f);
    return { centre: p.to, facing: f, slots: p.slots.slice(0, p.sq.alive).map((s) => [p.to[0] + s[0] * cs - s[1] * sn, p.to[1] - s[0] * sn - s[1] * cs]) };
  }));
};
G.order = (cmd) => {
  const ids = selIds(); if (!ids.length) return;
  const w = G.world;
  if (cmd.type === 'ability' && G.mode !== 'battle') return;
  const ok = issue(w, 0, ids, cmd);
  if (cmd.type === 'ability' && !ok) { sfx.error(); return; }
  sfx.click();
  hud.renderCmd();
};
G.setPause = (p) => {
  if (G.mode !== 'battle') return;
  G.paused = p;
  document.getElementById('pauseFrame').classList.toggle('show', p);
  sfx.click();
};
G.setSpeed = (s) => { G.speed = s; };
G.openMenu = () => { if (G.mode === 'battle' && !G.paused) { G.paused = true; G.menuPaused = true; } if (G.mode === 'realm' && !G.rPaused) { G.rPaused = true; G.menuPaused = true; } menus.pause(); };
G.closeMenu = () => { menus.close(); if (G.menuPaused) { if (G.mode === 'realm') G.rPaused = false; else G.paused = false; G.menuPaused = false; } if (G.mode === 'title') menus.title(); };
G.resetView = () => {
  if (G.mode === 'realm' && G.realm) { const me = G.realm.kingdoms.find((k) => k.player); const P = G.realm.provinces[Math.max(0, me.capital)]; G.cam.flyTo(P.pos[0], P.pos[1], 2600); return; }
  if (G.isWar()) { const h = G.world.war.settlements.find((s) => s.owner === 0 && s.kind !== 'village') || G.world.war.settlements.find((s) => s.id === G.world.war.home); G.cam.flyTo(h.pos[0], h.pos[1], 220); return; }
  G.cam.jump(128, 100, 92, Math.PI);
};
G.focusSelection = () => {
  const s = selIds().map((id) => G.world.squads.get(id)); if (!s.length) return;
  let x = 0, z = 0; for (const q of s) { x += q.cx; z += q.cz; }
  if (G.isWar()) G.cam.flyTo(x / s.length, z / s.length); else G.cam.focus(x / s.length, z / s.length);
};
G.cycleIdle = (builders) => {
  const idle = [...G.world.squads.values()].filter((s) => s.team === 0 && s.deployed && s.alive > 0 && s.state !== 'routing' && (builders ? s.def.builder && !s.job && !s.building : s.mode === 'idle' && !s.order));
  if (!idle.length) return;
  G.idleI = ((G.idleI || 0) + 1) % idle.length;
  const s = idle[G.idleI];
  G.select([s.id], false);
  if (G.isWar()) G.cam.flyTo(s.cx, s.cz); else G.cam.focus(s.cx, s.cz);
};
G.assignGroup = (k) => { for (const g in G.groups) G.groups[g] = G.groups[g].filter((id) => !G.sel.has(id)); G.groups[k] = [...G.sel]; G.toast('Group ' + k + ' set.'); };
G.selectGroup = (k) => { if (G.groups[k]) G.select(G.groups[k], false); };

// ------------------------------------------------------------------ build tools (FOUNDING, and builders mid-war)
const cursorTip = document.getElementById('cursorTip');
G.buildersSelected = () => G.isWar() && selIds().some((id) => G.world.squads.get(id).def.builder);
G.toolMode = () => G.mode === 'prepare' || (G.mode === 'battle' && G.buildersSelected());
G.pointTool = () => ['tower', 'gate', 'stoneTower', 'stoneGate', 'caltrops', 'stairs', 'outpost', 'castleKeep'].includes(G.tool);
G.setTool = (t) => {
  if (!G.toolMode()) t = null;
  if (t && G.world.builds && !G.world.builds.includes(t)) { G.toast(BUILD_TYPES[t].name + ' needs a tech from the war camp.', 'bad'); sfx.error(); return; }
  G.tool = t;
  G.previewTool(null);
  if (t && G.mode === 'prepare') { G.sel.clear(); sfx.click(); }
  else if (t) sfx.click();
  canvas.style.cursor = t ? 'crosshair' : '';
};
let lastPreview = null;
G.previewTool = (pts) => {
  const O = G.v.over;
  O.clearTrench(); O.clearSegs();
  lastPreview = null;
  if (!pts || !G.tool) { cursorTip.style.display = 'none'; return; }
  const live = G.mode === 'battle';
  const pv = previewBuild(G.world, 0, G.tool, pts, live ? { anywhere: true } : {});
  lastPreview = pv;
  if (BUILD_TYPES[G.tool].kind === 'earth') O.showTrench(pv);
  else O.showSegs(pv, BUILD_TYPES[G.tool].height || 3.5, BUILD_TYPES[G.tool].thick || 0.7, BUILD_TYPES[G.tool].size);
  const last = pts[pts.length - 1];
  const p = toScreen(last[0], G.v.heightAt(last[0], last[1]), last[1]);
  cursorTip.style.display = 'block';
  cursorTip.style.left = p[0] + 'px'; cursorTip.style.top = p[1] + 'px';
  const bad = !pv.ok || !pv.afford;
  cursorTip.className = 'parch' + (bad ? ' bad' : '');
  const what = live ? ' · builders will raise it' : '';
  cursorTip.textContent = BUILD_TYPES[G.tool].kind === 'earth' ? `${BUILD_TYPES[G.tool].name} ${pv.metres ? pv.metres.toFixed(0) : 0} m · ${pv.cost.toLocaleString()} g${!pv.afford ? ' · not enough gold' : what}` : `${BUILD_TYPES[G.tool].name} · ${pv.cost.toLocaleString()} g${!pv.ok ? ' · ' + (pv.why || 'cannot build here') : !pv.afford ? ' · not enough gold' : what}`;
};
G.commitTool = (pts) => {
  const t = G.tool;
  G.previewTool(null);
  if (!t || !pts || !pts.length) return;
  if (G.mode === 'battle' && G.isWar()) {
    const r = placeBlueprint(G.world, 0, t, pts);
    if (r.error) { G.toast(r.error, 'bad'); sfx.error(); return; }
    // the selected builders go straight to the first piece
    const b = selIds().map((id) => G.world.squads.get(id)).filter((s) => s.def.builder);
    for (const s of b) { s.job = r.ids[0]; s.order = null; s.path = null; }
    G.toast(`Blueprint placed (${r.cost.toLocaleString()} g). ${b.length ? 'The builders are on their way.' : ''}`, 'good');
    sfx.build(); sfx.coin();
    return;
  }
  const r = build(G.world, 0, t, pts);
  if (r.error) { G.toast(r.error, 'bad'); sfx.error(); return; }
  if (BUILD_TYPES[t].kind === 'earth') { sfx.dig(); if (G.tipStep === 0) { G.tipStep = 1; showTutorial(); } }
  else sfx.build();
  sfx.coin();
};
G.undo = () => { if (G.mode === 'prepare' && undo(G.world, 0)) { G.toast('Undone. Gold refunded.'); sfx.click(); } };
G.demolishHovered = () => {
  const g = G.groundAt(G.input.M.x, G.input.M.y);
  if (G.mode === 'battle' && G.isWar() && g) {
    // cancel the nearest own blueprint under the cursor
    let best = null, bd = 6;
    for (const bp of G.world.blueprints.values()) { if (bp.team !== 0) continue; const d = Math.hypot(bp.pos[0] - g[0], bp.pos[1] - g[2]); if (d < bd) { bd = d; best = bp; } }
    if (best && cancelBlueprint(G.world, 0, best.id)) { G.toast('Blueprint cancelled.'); sfx.click(); }
    return;
  }
  if (G.mode !== 'prepare') return;
  const st = structAt(g);
  if (st && demolish(G.world, 0, st.id)) { G.toast('Removed. Gold refunded.'); sfx.click(); }
};
G.buy = (type) => {
  const r = buy(G.world, 0, type);
  if (r.error) { G.toast(r.error, 'bad'); sfx.error(); return; }
  sfx.coin();
  const [x, z] = autoSpot(G.world, r.sq);
  const d = deploy(G.world, 0, r.sq.id, x, z, G.isWar() ? G.world.war.settlements.find((s) => s.id === G.world.war.home).gateAng : 0);
  if (!d.error) { G.select([r.sq.id], false); G.toast(`${r.sq.name} take the field. Right-drag to place them.`, 'good'); }
  else G.toast(`${r.sq.name} wait in the reserve. Drag them onto the field.`, 'good');
};
G.recruit = (settleId, type) => {
  const r = recruit(G.world, 0, settleId, type);
  if (r.error) { G.toast(r.error, 'bad'); sfx.error(); return false; }
  sfx.coin(); return true;
};
// a raided fort: burn it or hold it
G.chooseFort = (id, choice) => {
  if (chooseFort(G.world, id, choice)) { sfx.coin(); if (G.choicePaused) { G.paused = false; G.choicePaused = false; document.getElementById('pauseFrame').classList.remove('show'); } }
};
// the Banners panel (sim/diplomacy.js, DESIGN.md 9.4): truce, tribute, pay to attack, break a truce
G.dipOpen = false;
G.toggleDip = (on) => { G.dipOpen = on === undefined ? !G.dipOpen : !!on; G.dipMsg = ''; G.payPick = null; sfx.click(); };
G.diplo = (what, f, t) => {
  const w = G.world;
  let r = null;
  if (what === 'truce') r = offerTruce(w, 0, f);
  else if (what === 'tribute') r = demandTribute(w, 0, f);
  else if (what === 'payto') r = payToAttack(w, 0, f, t);
  else if (what === 'war') r = declareWar(w, 0, f);
  else if (what === 'surrender') r = demandSurrender(w, 0, f);
  if (!r) return;
  G.dipMsg = r.error || r.text || (what === 'war' ? 'The truce is broken. Every kingdom will remember it.' : '');
  if (r.error || r.refused) sfx.error(); else { sfx.coin(); if (what === 'war') sfx.horn(false); }
  return r;
};
G.answerEnvoy = (id, yes) => {
  if (answerOffer(G.world, id, yes)) { if (yes) sfx.coin(); else sfx.click(); if (G.choicePaused) { G.paused = false; G.choicePaused = false; document.getElementById('pauseFrame').classList.remove('show'); } }
};
G.chooseVillage = (id, choice) => {
  if (chooseVillage(G.world, id, choice)) { sfx.coin(); if (G.choicePaused) { G.paused = false; G.choicePaused = false; document.getElementById('pauseFrame').classList.remove('show'); } }
};
G.beginDeployDrag = (id, e0) => {
  const w = G.world, sq = w.squads.get(id);
  let moved = false;
  const mv = (e) => {
    if (Math.hypot(e.clientX - e0.clientX, e.clientY - e0.clientY) > 8) moved = true;
    if (!moved) return;
    const g = G.groundAt(e.clientX, e.clientY);
    if (!g) { G.v.over.showFormation(null); return; }
    const { slots } = makeSlots(sq);
    G.v.over.showFormation([{ centre: [g[0], g[2]], facing: 0, slots: slots.map((s) => [g[0] - s[0], g[2] - s[1]]) }]);
  };
  const up = (e) => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    G.v.over.showFormation(null);
    if (!moved) {
      if (sq.deployed) { G.select([sq.id], false); G.cam.focus(sq.cx, sq.cz); }
      else { autoPlaceReserve(w); G.toast(sq.name + ' take the field.'); }
      return;
    }
    const g = G.groundAt(e.clientX, e.clientY);
    if (!g) return;
    const r = deploy(w, 0, id, g[0], g[2], 0);
    if (r.error) { G.toast(r.error, 'bad'); sfx.error(); return; }
    sfx.order();
    G.select([id], false);
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
};

// ------------------------------------------------------------------ tutorial tips
const TIPS = [
  ['Dig in', 'Press <b>T</b> (or pick the shovel) and drag across the field in front of the ford. The ground really sinks: troops inside take half damage from arrows and horses cannot charge through.'],
  ['Archers behind the earth', 'Put your <b>archers in the trench</b> and your <b>spears in front</b>. Recruit more at the bottom, then drag them onto the blue ground. <b>Right-drag</b> sets a line and its facing.'],
];
function showTutorial() {
  if (G.mode === 'prepare' && G.tipStep === 20 && G.world && G.world.war && G.world.war.realm) hud.showTip('Deploy for battle', `The battle chest (<b>${G.world.war.realm.chest.toLocaleString()} g</b>) buys trenches, stakes and walls at once, and fresh squads. Place your host, then <b>Raise the Banners</b>. Unspent gold goes back to the treasury.`);
  else if (G.mode === 'prepare' && G.tipStep === 20) hud.showTip('Found your kingdom', 'Your land glows blue. Spend the royal grant on <b>walls, towers and trenches</b> (left) and an <b>army</b> (bottom). Everything is built at once and refunds in full until you <b>Raise the Banners</b>.');
  else if (G.mode === 'prepare' && G.tipStep < TIPS.length) hud.showTip(TIPS[G.tipStep][0], TIPS[G.tipStep][1]);
  else if (G.mode === 'battle' && G.tipStep === 30 && G.world && G.world.war && G.world.war.realm) { const RL = G.world.war.realm; hud.showTip('The battle of the Long War', `<b>${RL.aim}</b>. Break their host (leave a quarter of it standing) or storm the seat; at the second nightfall the field goes to whoever kept more men. Everything you keep goes back to the realm. <b>Space</b> pauses.`); setTimeout(() => { if (G.tipStep === 30) hud.showTip(null); }, 16000); }
  else if (G.mode === 'battle' && G.tipStep === 30) { hud.showTip('The war', 'Take <b>villages</b> (tax or pillage), raid <b>forts</b> and storm <b>castles</b> for gold and land. Click your keep to raise troops; select <b>builders</b> to build in the field. Take every rival capital to win. <b>Space</b> pauses.'); setTimeout(() => { if (G.tipStep === 30) hud.showTip(null); }, 16000); }
  else if (G.mode === 'battle' && G.tipStep === 10) { hud.showTip('Pause is your friend', 'Press <b>Space</b> to stop time and give orders. Waves come from the north: the horn sounds and a red pennant marks where.'); setTimeout(() => { if (G.tipStep === 10) hud.showTip(null); }, 12000); }
  else hud.showTip(null);
}

// ------------------------------------------------------------------ events -> fx, audio, toasts
function handleEvents(w) {
  const ev = w.events;
  if (!ev.length) return;
  const cx = G.cam.S.x, cz = G.cam.S.z, cd = G.cam.S.dist;
  const vol = (x, z) => Math.max(0.0, Math.min(1, 1.4 - Math.hypot(x - cx, z - cz) / (cd * 1.6 + 30)));
  const listening = G.mode !== 'title';
  if (!G.simOnly) G.v.fx.consume(ev, G.v.heightAt);
  for (const e of ev) {
    if (listening) switch (e.type) {
      case 'shoot': { const v = vol(e.x, e.z); if (v > 0.03) { if (e.bolt) sfx.bolt(v); else sfx.bow(v * 0.7); } break; }
      case 'hit': { const v = vol(e.x, e.z); if (v > 0.05) { if (e.melee) (Math.random() < 0.6 ? sfx.clang : sfx.hit)(v); else sfx.thud(v); } break; }
      case 'tink': if (vol(e.x, e.z) > 0.1) sfx.tink(vol(e.x, e.z)); break;
      case 'death': if (!w.war || vol(e.x, e.z) > 0.15) sfx.death(); break;
      case 'charge': if (!w.war || vol(e.x, e.z) > 0.2) { sfx.charge(); G.cam.S.shake = Math.min(1.2, G.cam.S.shake + 0.4); } break;
      case 'brace': if (!w.war || vol(e.x, e.z) > 0.2) sfx.clang(1); break;
      case 'destroyed': if (!w.war || vol(e.a ? e.a[0] : e.pos[0], e.a ? e.a[1] : e.pos[1]) > 0.1) { sfx.crash(); G.cam.S.shake = Math.min(1.5, G.cam.S.shake + 0.6); } break;
      case 'wave': sfx.horn(false); G.v.over.waveMarker(e.x, e.z - 8); break;
      case 'retreat': sfx.horn(true); break;
      case 'ability': if (e.ability === 'rally') sfx.rally(); else if (e.ability === 'sanctuary') sfx.heal(); else sfx.click(); break;
      case 'rout': if (!w.war && e.team === 1) sfx.shout(); break;
      case 'toast': if (!w.war || e.team === 0 || e.team === -1) G.toast(e.text, e.team === 0 && /running|fallen|broken|breached/.test(e.text) ? 'bad' : /Wave/.test(e.text) ? 'bad' : 'good'); break;
      case 'alert': if (e.team === 0 || e.team === -1) { G.toast(e.text, e.tone === 'bad' ? 'bad' : e.tone === 'good' ? 'good' : '', e.pos); if (e.tone === 'bad') sfx.horn(false); } break;
      case 'loot': if (e.team === 0 && e.gold) sfx.coin(); break;
      case 'choice': if ((e.kind === 'village' || e.kind === 'fort') && G.mode === 'battle' && !G.paused) { G.paused = true; G.choicePaused = true; document.getElementById('pauseFrame').classList.add('show'); } break;
      case 'envoy': if (G.mode === 'battle' && !G.paused) { G.paused = true; G.choicePaused = true; document.getElementById('pauseFrame').classList.add('show'); } sfx.horn(true); break;
      case 'truceEnd': if (e.why === 'betrayal' && e.b === 0) { G.cam.S.shake = Math.min(1.5, G.cam.S.shake + 0.5); sfx.horn(false); } break;
      case 'choiceLost': if (G.choicePaused && !(w.war.choices.length)) { G.paused = false; G.choicePaused = false; document.getElementById('pauseFrame').classList.remove('show'); } break;
      case 'over': (e.winner === 0 ? sfx.win : sfx.lose)(); break;
    }
  }
  ev.length = 0;
}

// ------------------------------------------------------------------ the loop
let acc = 0, last = performance.now(), frames = 0, fpsT = 0, rt = 0;
G.stepSim = (n = 1) => {
  const w = G.world;
  for (let i = 0; i < n; i++) {
    for (const so of w.soldiers) { so.px = so.x; so.pz = so.z; so.py = so.y; }
    const a = performance.now();
    step(w, C.DT);
    G.simMs = (G.simMs || 0) * 0.95 + (performance.now() - a) * 0.05;
  }
};
function frame(now) {
  requestAnimationFrame(frame);
  const f0 = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  rt += dt;
  frames++; fpsT += dt;
  if (fpsT > 0.5) { G.fpsAvg = frames / fpsT; frames = 0; fpsT = 0; }
  if (G.mode === 'realm' && G.realm) { realmFrame(dt); G.frameMs = G.frameMs * 0.9 + (performance.now() - f0) * 0.1; return; }
  const w = G.world;
  if (!w) return;
  const running = !G.paused && !(menus.open() && G.mode !== 'title');
  if (running) {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= C.DT && n < 12) { G.stepSim(1); acc -= C.DT; n++; }
    if (n >= 12) acc = 0;
  }
  handleEvents(w);
  const alpha = running ? Math.min(1, acc / C.DT) : 1;
  if (w.result && G.mode === 'battle') {
    G.mode = 'over';
    G.paused = false; document.getElementById('pauseFrame').classList.remove('show');
    const r = w.result;
    if (w.war && w.war.realm && G.realmBattle) {
      setTimeout(() => { if (G.mode === 'over' && G.world === w) menus.realmBattleResults(r); }, 2600);
    } else if (w.war) {
      const key = 'war_' + w.war.win;
      const b = G.save.war[key] || { wins: 0, played: 0 };
      b.played++; if (r.winner === 0) b.wins++;
      G.save.war[key] = b; G.persist();
      setTimeout(() => { if (G.mode === 'over' && G.world === w) menus.warResults(r); }, 2600);
    } else {
      const b = G.save.best[w.def.id] || { stars: 0, wins: 0 };
      if (r.winner === 0) { b.wins++; b.stars = Math.max(b.stars, r.nStars); }
      G.save.best[w.def.id] = b; G.persist();
      setTimeout(() => { if (G.mode === 'over' && G.world === w) menus.results(r); }, 2600);
    }
  }
  if (G.mode === 'title') {
    G.cam.S.tyaw += dt * 0.04;
    let x = 0, z = 0, k = 0;
    for (const s of w.squads.values()) if (s.deployed && s.alive > 0 && s.state !== 'routing' && (s.inContact || s.team === 1)) { x += s.cx * s.alive; z += s.cz * s.alive; k += s.alive; }
    if (k) { G.cam.S.tx += (x / k - G.cam.S.tx) * dt * 0.4; G.cam.S.tz += (z / k - 10 - G.cam.S.tz) * dt * 0.4; }
    G.cam.S.tdist = 52;
    if (w.result || w.t > 280) G.toTitle();
  }
  // view
  const V = G.v;
  const look = G.cam.update(dt);
  view.fitShadow({ x: look.x, y: look.y, z: look.z }, V.war ? Math.min(look.dist, 320) : look.dist);
  if (V.war) {
    // LOD by projected size: the same rules for the RTS camera, a phone, or a first-person view
    if ((G.lodT = (G.lodT || 0) + 1) % 30 === 1) applyLod(V, lodScale(view.camera, view.size.h || innerHeight, G.quality || (lowfx ? 'low' : 'high')));
    V.terrain.uniforms.uStrat.value = Math.max(0, Math.min(1, (look.dist - 320) / 480));
    // the higher the camera, the thinner the haze: the strategic view stays crisp
    view.scene.fog.density = G.fogD * (1 - 0.6 * V.terrain.uniforms.uStrat.value);
    V.terrain.update(dt, rt, view.camera, look);
    V.props.update(dt, rt, view.camera);
  } else {
    V.terrain.update(dt, rt);
    if (V.flowers && V.flowersV !== w.terrain.version && !V.terrain.digging()) { V.flowersV = w.terrain.version; V.flowers.refresh(); }
    V.props.update(dt, rt);
  }
  V.structs.update(dt, rt, V.terrain.digging(), V.heightAt, V.war ? view.camera : null);
  const auras = [];
  for (const s of w.squads.values()) if (s.type === 'healer' && s.deployed && s.alive > 0 && s.state !== 'gone') {
    if (V.war && Math.hypot(s.cx - look.x, s.cz - look.z) > 300) continue;
    const k = s.team === 0 ? (G.sel.has(s.id) ? 1.0 : 0.42) * (s.sanctuaryUntil > w.t ? 2 : 1) : 0.3;
    auras.push([s.cx, s.cz, s.def.heal.radius, k * (s.healing ? 1.15 : 0.85)]);
  }
  V.terrain.setAuras(auras);
  if (!V.war) V.terrain.uniforms.uFlagHot.value = Math.min(1, w.flag.hold / 10);
  V.units.sync(w, alpha, rt, G.sel, G.hover, V.heightAt, V.war ? view.camera : null, V.war && !G.reveal ? G.seen : null);
  V.fx.update(dt, rt, alpha, view.camera, V.heightAt);
  V.over.update(dt, rt);
  if (G.mode !== 'title') {
    if (w.war) whud.update(); else hud.update();
    prep.update();
  }
  view.render(rt);
  G.frameMs = G.frameMs * 0.9 + (performance.now() - f0) * 0.1;
}

// ------------------------------------------------------------------ boot
G.input = bindInput(G, canvas);
// ------------------------------------------------------------------ THE LONG WAR (DESIGN.md 19-21)
G.rSpeed = 1; G.rPaused = false; G.rAcc = 0;
function enterRealmView() {
  const R = G.realm;
  disposeScene();
  G.world = null;
  realmEnv(R.season); G.rSeason = R.season;
  view.camera.near = 20; view.camera.far = 16000; view.camera.updateProjectionMatrix();
  G.rv = buildRealmMap(view.scene, R);
  G.v = { heightAt: G.rv.heightAt, realm: true };
  G.cam.configure(R.size, 240, 5600);
  const me = R.kingdoms.find((k) => k.player);
  const cap = R.provinces[me.capital >= 0 ? me.capital : R.provinces.findIndex((p) => p.owner === me.id)] || R.provinces[0];
  G.cam.jump(Math.min(R.size * 0.62, cap.pos[0] + 900), Math.min(R.size * 0.62, cap.pos[1] + 1000), 4200, Math.PI * 1.0);
  G.mode = 'realm';
  G.sel.clear(); G.tool = null; G.focusSettle = null;
  document.getElementById('hud').classList.remove('hidden');
  document.body.classList.remove('war'); document.body.classList.add('realm');
  document.getElementById('pauseFrame').classList.remove('show');
  menus.close(); hud.reset(); whud.reset(); prep.reset(); rui.reset();
  document.getElementById('left').innerHTML = ''; document.getElementById('right').innerHTML = ''; document.getElementById('bottom').innerHTML = '';
  setMusicMode('calm');
}
G.newLongWar = (opts = {}) => {
  menus.close();
  const o = { seed: opts.seed ?? (Q.has('seed') ? Number(Q.get('seed')) : ((Math.random() * 1e6) | 0)), provinces: opts.provinces || 'standard', gold: opts.gold, win: opts.win || 'dominion60', day: opts.day || 0, kingdoms: opts.kingdoms };
  G.realm = createRealm(o);
  G.realmBattle = null; G.rResult = null; G.rSel = null; G.courtOpen = false; G.letterSeen = {};
  G.rPaused = false; G.rSpeed = 1;
  enterRealmView();
  G.toast('The Long War begins. ' + G.realm.kingdoms[G.realm.main].name + ' marches against you.', 'bad');
  return G.realm;
};
G.continueLongWar = (slot = 'auto') => {
  const L = loadRealm(slot);
  if (!L) { G.toast('No saved war.', 'bad'); return null; }
  G.realm = L.R; G.realmBattle = null; G.rResult = null; G.rSel = null; G.courtOpen = false; G.letterSeen = {};
  G.rPaused = true;
  enterRealmView();
  G.toast('The war resumes: ' + dateText(G.realm) + '.');
  return G.realm;
};
G.saveRealm = (slot = 'auto') => {
  if (!G.realm) return null;
  let r;
  try { r = saveRealm(G.realm, slot, null, localStorage); } catch (e) { r = { error: 'Save failed' }; }
  if (slot !== 'auto') { if (r.error) G.toast(r.error, 'bad'); else G.toast('The war is saved (slot ' + slot + ').', 'good'); }
  return r;
};
G.realmPause = (p) => { G.rPaused = p; sfx.click(); };
G.realmLook = (A) => { const R = G.realm; const p = A.edge ? R.provinces[A.edge.to].pos : R.provinces[A.prov].pos; G.cam.flyTo(p[0], p[1], 1400); };
function realmEvents() {
  const R = G.realm, me = R.kingdoms.find((k) => k.player);
  for (const e of R.events) {
    if (e.type === 'war' && (e.a === me.id || e.b === me.id)) { G.toast(`${R.kingdoms[e.a].short} ${e.betrayal ? 'BETRAYS' : 'declares war on'} ${R.kingdoms[e.b].short}!`, 'bad'); sfx.horn(false); }
    else if (e.type === 'peace' && (e.a === me.id || e.b === me.id)) G.toast(`Peace with ${R.kingdoms[e.a === me.id ? e.b : e.a].short}.`, 'good');
    else if (e.type === 'truce' && (e.a === me.id || e.b === me.id)) G.toast(`A truce with ${R.kingdoms[e.a === me.id ? e.b : e.a].short}.`, 'good');
    else if (e.type === 'seatFell' && (e.to === me.id || e.from === me.id)) { G.toast(`${R.provinces[e.prov].name} falls to ${R.kingdoms[e.to] ? R.kingdoms[e.to].short : 'rebels'}!`, e.to === me.id ? 'good' : 'bad'); }
    else if (e.type === 'rebellion' && e.against === me.id) { G.toast('Rebels rise in ' + R.provinces[e.prov].name + '!', 'bad'); sfx.horn(false); }
    else if (e.type === 'rise') G.toast('A new power rises: ' + R.kingdoms[e.kingdom].name + '.');
    else if (e.type === 'fall') G.toast(R.kingdoms[e.kingdom].name + ' has fallen.', e.kingdom === me.id ? 'bad' : '');
    else if (e.type === 'letter') { sfx.horn(true); }
    else if (e.type === 'engagement') { G.rPaused = true; sfx.horn(false); }
    else if (e.type === 'season') { G.saveRealm('auto'); }
  }
  R.events.length = 0;
}
let realmT = 0;
const SH0 = { far: view.sun.shadow.camera.far, normalBias: view.sun.shadow.normalBias };
// the war table is 4 km across: one wide shadow map over what the camera sees, the sun high
function realmShadow(look) {
  const s = view.sun, c = s.shadow.camera, r = Math.min(2600, Math.max(900, look.dist * 0.75));
  c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 10; c.far = 9000; c.updateProjectionMatrix();
  const texel = (2 * r) / s.shadow.mapSize.x, tx = Math.round(look.x / texel) * texel, tz = Math.round(look.z / texel) * texel;
  s.target.position.set(tx, 0, tz);
  s.position.set(tx + view.sunDir.x * 4000, view.sunDir.y * 4000, tz + view.sunDir.z * 4000);
  s.shadow.bias = -0.0006; s.shadow.normalBias = 3;
}
function leaveRealmShadow() { const c = view.sun.shadow.camera; c.near = 0.5; c.far = SH0.far; c.updateProjectionMatrix(); view.sun.shadow.normalBias = SH0.normalBias; }
function realmEnv(season) {
  const env = ENVS[{ Spring: 'spring', Summer: 'noon', Autumn: 'autumn', Winter: 'snow' }[season]] || ENVS.spring;
  // a high sun over the war table (no cliff shadows across whole provinces), thin haze
  // the war table stands in a dim hall: dark warm haze and sky beyond the oak
  view.applyEnv({ ...env, sun: [env.sun[0], Math.max(48, env.sun[1] + 22), env.sun[2], env.sun[3]], fogD: env.fogD * 0.05, fog: 0x3a2c22, sky: [0x4a3828, 0x1c140e], clouds: 0 });
  G.fogD = env.fogD * 0.05;
}
function realmFrame(dt) {
  const R = G.realm;
  realmT += dt;
  const pending = R.engagements.some((E) => E.status === 'pending');
  if (!G.rPaused && !pending && !menus.open() && !R.result) {
    G.rAcc += dt * G.rSpeed;
    let n = 0;
    while (G.rAcc >= 2 && n < 4) { realmDay(R); G.rAcc -= 2; n++; realmEvents(); if (R.engagements.some((E) => E.status === 'pending')) { G.rAcc = 0; break; } }
  }
  if (R.result && !G.rDone) { G.rDone = true; setTimeout(() => menus.realmOver(R.result), 600); }
  if (G.rSeason !== R.season) { G.rSeason = R.season; realmEnv(R.season); }
  const look = G.cam.update(dt);
  realmShadow(look);
  view.scene.fog.density = G.fogD;
  const me = R.kingdoms.find((k) => k.player);
  G.rv.update(dt, realmT, { sel: G.rSel && G.rSel.prov !== undefined ? G.rSel.prov : -1, yaw: G.cam.S.yaw, dist: G.cam.S.dist });
  rui.update();
  view.render(realmT);
}
// commands from the realm HUD
G.realmCmd = (what, a, b, c) => {
  const R = G.realm, me = R.kingdoms.find((k) => k.player);
  let r = null;
  if (what === 'raise') { r = realmRaise(R, me.id, a, b); if (!r.error) sfx.coin(); }
  else if (what === 'muster') { const A = musterGarrison(R, me.id, a, 99, 1); r = A ? { ok: true } : { error: 'No room for another army (castles limit your hosts)' }; if (A) G.rSel = { army: A.id }; }
  else if (what === 'stance') { const A = R.armies.find((x) => x.id === a); r = realmOrder(R, A, { stance: b }); }
  else if (what === 'siege') { const A = R.armies.find((x) => x.id === a); A.siegeChoice = b; r = { ok: true }; G.toast({ assault: 'The assault is ordered for dawn.', starve: 'They will starve.', terms: 'A herald offers terms at dawn.', lift: 'The siege will be lifted.' }[b]); if (G.rPaused) G.realmPause(false); }
  else if (what === 'order') {
    const A = R.armies.find((x) => x.id === a);
    if (b === 'merge') r = realmOrder(R, A, { type: 'merge', with: c });
    else if (b === 'split' || b === 'garrison') r = realmOrder(R, A, { type: b });
    else if (b === 'attack' || b === 'raid' || b === 'march') r = realmOrder(R, A, { type: b, target: c !== undefined ? c : A.prov });
    if (r && !r.error && (b === 'attack' || b === 'raid' || b === 'march')) { G.rv.showPath(A.edge ? A.edge.from : A.prov, A.edge ? [A.edge.to, ...A.path] : A.path); G.toast(`${A.name}: ${b === 'march' ? 'marching' : b === 'raid' ? 'off to raid' : 'marching to attack'} ${R.provinces[r.target ?? (c ?? A.prov)] ? R.provinces[c ?? A.prov].name : ''} (${r.days || 0} days).`); sfx.order(); }
    if (r && !r.error && b === 'merge') G.toast('The hosts are joined.');
  }
  else if (what === 'propose') { r = realmPropose(R, me.id, a, b); if (r.ok) sfx.coin(); else if (r.refused) sfx.error(); }
  else if (what === 'declare') { r = realmDeclare(R, me.id, a); if (r.ok) sfx.horn(false); }
  if (r && r.error) { G.toast(r.error, 'bad'); sfx.error(); }
  realmEvents();
  return r;
};
G.answerLetter = (id, yes) => { const r = answerLetter(G.realm, id, yes); if (r && r.error) G.toast(r.error, 'bad'); realmEvents(); return r; };
// the Engagement card (DESIGN.md 19.6): fight it, let the General fight, auto-resolve, withdraw, parley
G.engageChoice = (id, choice) => {
  const R = G.realm, E = R.engagements.find((x) => x.id === id);
  if (!E || E.status !== 'pending') return null;
  const me = R.kingdoms.find((k) => k.player);
  const side = playerSide(R, E);
  const foeK = side === 'att' ? E.defK : E.attK;
  G.parleyMsg = '';
  if (choice === 'auto') {
    const before = engagementInfo(R, E);
    resolveAbstract(R, E);
    const won = E.winner === me.id || (E.winner !== foeK && (side === 'att' ? E.result.winSide === 'att' : E.result.winSide === 'def'));
    G.rResult = { id: E.id, won, title: won ? 'Victory at ' + R.provinces[E.prov].name : 'Defeat at ' + R.provinces[E.prov].name, text: won ? 'Your host carries the field.' : 'Your host is driven from the field.', rows: [['Your men before', g0(side === 'att' ? before.attMen : before.defMen)], ['Lost', g0(side === 'att' ? E.result.start[0] - E.result.end[0] : E.result.start[1] - E.result.end[1])], ['Enemy lost', g0(side === 'att' ? E.result.start[1] - E.result.end[1] : E.result.start[0] - E.result.end[0])], ['The province', R.provinces[E.prov].owner >= 0 ? R.kingdoms[R.provinces[E.prov].owner].short : 'free']] };
    realmEvents(); G.rPaused = false; return E;
  }
  if (choice === 'withdraw') {
    for (const id2 of (side === 'att' ? E.att : E.def)) { const A = R.armies.find((x) => x.id === id2); if (!A) continue; for (const s of A.squads) s.men = Math.max(1, Math.round(s.men * 0.95)); const back = R.provinces[E.prov].neighbors.find((n) => R.provinces[n].owner === me.id) ?? R.provinces[E.prov].neighbors[0]; A.path = [back]; A.order = { type: 'march', target: back }; A.arrived = R.day; }
    E.status = 'done'; G.rPaused = false; G.toast('Your host falls back.'); return E;
  }
  if (choice === 'parley') {
    const J = judge(R, me.id, foeK, { type: 'truce', seasons: 1 });
    if (J.accept) { makeTruce(R, me.id, foeK, 30); E.status = 'done'; G.rPaused = false; G.toast('A field truce: the armies part.', 'good'); }
    else { G.parleyMsg = 'They refuse to parley: ' + J.reasons.join(' · '); G.rui.reset(); }
    realmEvents(); return E;
  }
  // a live battle on the province's own map
  const opts = battleOptions(R, E, { difficulty: G.save.difficulty || 'captain' });
  payChest(R, opts);
  E.status = 'live';
  G.realmBattle = { id: E.id, general: choice === 'general' };
  G.saveRealm('auto');
  rui.hide();
  document.body.classList.remove('realm');
  G.newWar({ ...opts, realmOpts: true, autoWar: false });
  if (choice === 'general') { G.world.botPlayer = true; G.world.autoChoice = true; autoFound(G.world, 0); G.startBattle(); G.toast('Your general commands. Select troops to take over, or watch.', 'good'); }
  else G.toast(opts.realm.aim + '. Deploy your host and dig in, then raise the banners.', 'good');
  return E;
};
// back from a fought battle to the realm (DESIGN.md 19.8)
G.returnToRealm = () => {
  const R = G.realm, w = G.world;
  if (!R || !G.realmBattle) return;
  const E = R.engagements.find((x) => x.id === G.realmBattle.id);
  if (!w.result) warFinishLeave(w);
  const me = R.kingdoms.find((k) => k.player);
  const r = writeBack(R, E, w);
  G.realmBattle = null;
  G.rResult = { id: E.id, won: r.won, title: (r.won ? 'Victory at ' : 'Defeat at ') + R.provinces[E.prov].name, text: r.reason, rows: [['Gold brought home', g0(r.gold) + ' g'], ['Squads raised on the field', r.raised], ['The province now', R.provinces[E.prov].owner >= 0 ? R.kingdoms[R.provinces[E.prov].owner].short : 'free'], ['Treasury', g0(me.gold) + ' g']] };
  G.rPaused = true;
  enterRealmView();
  realmEvents();
  G.saveRealm('auto');
};
function warFinishLeave(w) { w.result = { winner: -1, reason: 'You left the field.', time: w.t, stats: {} }; w.phase = 'over'; }
const g0 = (n) => Math.round(n).toLocaleString('en-GB');

installDebug(G, { snapshot, issue, buy, deploy, build, view, step, startBattle, aiPrepare, warSnapshot, autoFound, recruit, placeBlueprint, finishBlueprints, bannerCap, bannersUsed, incomeOf, regionAt, chooseVillage, stageBattle, serializeWorld, stateHash });
// the Long War, diplomacy and the conquest economy (DESIGN.md 25.5, builder B)
Object.assign(window.__G, {
  realm: () => G.realm, newLongWar: (o) => G.newLongWar(o || {}), continueLongWar: (s) => G.continueLongWar(s),
  realmAdvance(days) { const R = G.realm; realmAdvance(R, days); const ev = R.events.slice(); realmEvents(); return { day: R.day, season: R.season, year: R.year, events: ev.length, pending: R.engagements.filter((E) => E.status === 'pending').map((E) => E.id) }; },
  provinces: () => G.realm.provinces.map((P) => ({ id: P.id, name: P.name, owner: P.owner, seat: P.seat, pos: P.pos.map(Math.round), garrison: P.garrison.reduce((a, s) => a + s.men, 0), loyalty: P.loyalty, siegedBy: P.siegedBy, supplies: P.supplies })),
  armies: (k) => G.realm.armies.filter((A) => k === undefined || A.kingdom === k).map((A) => ({ id: A.id, kingdom: A.kingdom, name: A.name, prov: A.prov, edge: A.edge ? { to: A.edge.to, t: A.edge.t, days: A.edge.days } : null, men: A.squads.reduce((a, s) => a + s.men, 0), squads: A.squads.length, order: A.order, siegeOf: A.siegeOf })),
  march: (id, prov, type = 'attack', stance) => { const A = G.realm.armies.find((x) => x.id === id); if (stance) A.stance = stance; return G.realmCmd('order', id, type, prov); },
  raise: (prov, type) => G.realmCmd('raise', prov, type), muster: (prov) => G.realmCmd('muster', prov),
  engagements: () => G.realm.engagements.map((E) => ({ id: E.id, prov: E.prov, status: E.status, att: E.att, def: E.def, assault: !!E.assault, winner: E.winner })),
  engage: (id, choice) => { const E = G.engageChoice(id, choice); return E ? E.status : null; },
  autoresolve: (id) => { const E = G.engageChoice(id, 'auto'); return E ? { winner: E.winner, status: E.status } : null; },
  returnToRealm: () => { G.returnToRealm(); return G.mode; },
  kingdoms: () => G.realm.kingdoms.map((k) => ({ id: k.id, name: k.short, alive: k.alive, gold: Math.round(k.gold), provinces: G.realm.provinces.filter((p) => p.owner === k.id).length, player: k.player, exhaustion: Math.round(k.exhaustion || 0), trust: k.trust })),
  opinion: (a, b) => realmOpinion(G.realm, a, b, true), memory: (a, b) => (G.realm.memory[a] || {})[b] || [],
  judge: (from, to, deal) => judge(G.realm, from, to, deal),
  propose: (from, to, deal) => realmPropose(G.realm, from, to, deal), declareWar: (a, b) => realmDeclare(G.realm, a, b),
  letters: () => G.realm.letters.slice(), answer: (id, yes) => G.answerLetter(id, yes),
  realmSave: (slot) => G.saveRealm(slot), realmLoad: (slot) => !!G.continueLongWar(slot), realmHash: () => realmHash(G.realm),
  realmPause: (p) => G.realmPause(p), court: (on) => G.rui.toggleCourt(on), selectRealm: (sel) => { G.rSel = sel; },
  realmView: (x, z, dist, yaw) => G.cam.jump(x, z, dist, yaw),
  realmPath: (k, from, to) => realmPath(G.realm, k, from, to, { anywhere: true }),
  // diplomacy-lite inside a battle, and the fort choice
  burntVillages: () => (G.v && G.v.props && G.v.props.burntCount ? G.v.props.burntCount() : 0),
  whyNot: (type, pt) => previewBuild(G.world, 0, type, [pt], { anywhere: true }).why || '',
  preview: (type, pt) => { const pv = previewBuild(G.world, 0, type, [pt], { anywhere: true }); return pv.ok && pv.afford; },
  diplo: (what, f, t) => G.diplo(what, f, t), chooseFort: (id, c) => G.chooseFort(id, c), envoys: () => (G.world && G.world.dip ? G.world.dip.offers.slice() : []),
});
window.addEventListener('resize', () => view.resize());
if (Q.get('mode') === 'war') G.newLongWar({ seed: Q.has('seed') ? Number(Q.get('seed')) : undefined, provinces: Q.get('provinces') ? (isNaN(+Q.get('provinces')) ? Q.get('provinces') : +Q.get('provinces')) : undefined, gold: Q.has('gold') ? Number(Q.get('gold')) : undefined, win: Q.get('win') || undefined, day: Q.has('day') ? Number(Q.get('day')) : 0, kingdoms: Q.has('kingdoms') ? Number(Q.get('kingdoms')) : undefined });
else if (Q.get('mode') === 'free') G.newWar();
else if (Q.has('play') || Q.has('battle') || Q.has('phase')) G.newBattle();
else G.toTitle();
requestAnimationFrame(frame);
