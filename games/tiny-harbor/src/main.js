// TINY HARBOR - a cosy island keeper game.
// Run the docks, light the way for boats at night, fish for supper and
// grow a leaky tent into a cottage while the tide comes and goes.
import * as THREE from 'three';
import { clamp, lerp, damp, rand, smooth, fmtTime, angleDiff, segDist } from './util.js';
import {
  heightAt, groundAt, inDock, buildTerrain, buildFoliage, buildHeightTexture,
  LH, LH_TOP, CABIN, FIRE, DOCK, BOLLARD, BRIDGE_SIGN, CAUSE, TIDE_MID, TIDE_AMP, WADE_LIMIT,
  ISLANDS, DOCKS, BAY_ROCKS, bridgeY,
} from './terrain.js';
import { buildIslands, makeSailboat, ISLE_TRADERS } from './islands.js';
import { Tower, TOWER_R } from './tower.js';
import { Weather, WEATHER_ICON } from './weather.js';
import { updateVillagers, villagerLine } from './islands.js';
import { buildWater } from './water.js';
import { Sky, isNightT } from './sky.js';
import {
  makeTree, buildSign as buildSignPost, buildBayRocks, buildShoreRocks, buildDock, buildLighthouse, buildBridge, buildSign,
  buildCampfire, makePickup, makeLog, makeGull, makeCrab, makeKeeper, Particles,
} from './props.js';
import { Cabin, PAINTS, STAGES, EXTRAS } from './cabin.js';
import { Harbor, BOAT_TYPES, BASE_PRICE } from './boats.js';
import { Fishing, FISH, FISH_BY_ID } from './fishing.js';
import { Audio } from './audio.js';
import { UI, ICON, fishSvg } from './ui.js';
import { Interior, FURNITURE, footprint } from './interior.js';

const DAY = 420;                  // seconds in a full day
const TIDE_PERIOD = DAY / 2;      // two tides a day
const TIDE_PHASE = -1.57;
const SAVE_KEY = 'pd.tinyharbor';
const SETTINGS_KEY = 'pd.tinyharbor.settings';
const params = new URLSearchParams(location.search);
const BOATYARD = { x: 2.6, z: 16.6 };

function freshState() {
  return {
    v: 1, clock: DAY * 0.29, wood: 0, coins: 10, belly: 85,
    fish: {}, cooked: 0, clams: 0, shells: 0, caught: {}, goals: {},
    stage: 0, paint: { walls: 'wood', roof: 'red', door: 'moss', trim: 'white' }, painted: false,
    paints: {}, owned: {}, shown: {}, tools: {}, bait: 0, bridge: false,
    stats: { trees: 0, fish: 0, cooked: 0, clams: 0, boats: 0, guided: 0, earned: 0 },
    px: -1.5, pz: 2.5, trees: {},
    room: [], furn: {}, wallpaper: 'white', floor: 'oak',
  };
}

const GOALS = [
  { id: 'wood', text: 'Chop down a tree', reward: 5, check: (S) => S.stats.trees >= 1 },
  { id: 'fish', text: 'Catch a fish', reward: 5, check: (S) => S.stats.fish >= 1 },
  { id: 'cook', text: 'Cook a fish at the campfire', reward: 5, check: (S) => S.stats.cooked >= 1 },
  { id: 'shack', text: 'Turn your tent into a shack', reward: 10, check: (S) => S.stage >= 1 },
  { id: 'tie', text: 'Tie up a boat at the dock', reward: 10, check: (S) => S.stats.boats >= 1 },
  { id: 'clam', text: 'Dig up 3 clams at low tide', reward: 8, check: (S) => S.stats.clams >= 3 },
  { id: 'paint', text: 'Paint your house', reward: 8, check: (S) => S.painted },
  { id: 'lamp', text: 'Guide a boat in with the lighthouse', reward: 20, check: (S) => S.stats.guided >= 1 },
  { id: 'cabin', text: 'Build the log cabin', reward: 20, check: (S) => S.stage >= 2 },
  { id: 'bridge', text: 'Build the lighthouse bridge', reward: 15, check: (S) => S.bridge },
  { id: 'boat', text: 'Build a sailboat at the boatyard', reward: 20, check: (S) => !!S.boat },
  { id: 'isles', text: 'Sail to all three islands', reward: 30, check: (S) => Object.keys(S.visited || {}).length >= 3 },
  { id: 'five', text: 'Find 5 kinds of fish', reward: 20, check: (S) => Object.keys(S.caught).length >= 5 },
  { id: 'extras', text: 'Place 3 extras around your home', reward: 15, check: (S) => Object.values(S.shown).filter(Boolean).length >= 3 },
  { id: 'cottage', text: 'Build the cottage', reward: 40, check: (S) => S.stage >= 3 },
  { id: 'lantern', text: 'Catch the Lantern Fish', reward: 50, check: (S) => !!S.caught.lantern },
];

class Game {
  constructor() {
    this.DAY = DAY;
    this.goals = GOALS;
    this.settings = { quality: 'high', zoom: 1 };
    this.audio = new Audio();
    try {
      const st = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (st) { Object.assign(this.settings, st.settings || {}); this.audio.music = st.music ?? 0.5; this.audio.sfx = st.sfx ?? 0.8; }
    } catch (e) { /* storage blocked */ }
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch');

    this.canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQuality();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
    this.camPos = new THREE.Vector3(0, 30, 40);
    this.camLook = new THREE.Vector3();

    this.S = freshState();
    this.buildWorld();
    this.ui = new UI(this);
    this.input();
    this.resize();
    addEventListener('resize', () => this.resize());

    this.mode = 'title';
    this.time = 0;
    this.last = performance.now();
    this.saveT = 15;
    this.ui.show('title', this.titleData());
    if (params.has('play')) this.act(this.hasSave() && !params.has('fresh') ? 'continue' : 'begin');
    window.__TH = this;
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------------ world
  buildWorld() {
    const sc = this.scene;
    this.sky = new Sky(sc);
    this.heightTex = buildHeightTexture();
    this.heightTexFar = buildHeightTexture(1024, 440, true);
    sc.add(buildTerrain());
    this.water = buildWater(this.heightTex, this.heightTexFar);
    sc.add(this.water);
    buildBayRocks(sc);
    this.rocks = buildShoreRocks(sc);
    this.dock = buildDock(sc);
    this.lighthouse = buildLighthouse(sc);
    this.bridge = buildBridge(sc);
    this.sign = buildSign(sc, BRIDGE_SIGN.x, BRIDGE_SIGN.z);
    this.fire = buildCampfire(sc);
    this.cabin = new Cabin(sc);
    this.cabin.build(this.S);
    this.particles = new Particles(sc);
    this.harbor = new Harbor(sc, this);
    this.fishing = new Fishing(sc);
    this.interior = new Interior();
    this.tower = new Tower();
    this.weather = new Weather(sc);
    this.isles = buildIslands(sc);
    this.boatyard = buildSignPost(sc, BOATYARD.x, BOATYARD.z);
    this.sailboat = makeSailboat();
    this.sailboat.visible = false;
    sc.add(this.sailboat);
    this.sb = { pos: new THREE.Vector3(), heading: 0, speed: 0, turn: 0 };
    this.placing = null;

    // trees, placed the same way every time
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.trees = [];
    const avoid = [{ x: CABIN.x, z: CABIN.z, r: 9.5 }, { x: FIRE.x, z: FIRE.z, r: 4 }, { x: 6, z: 12, r: 5 }, { x: -12, z: 11, r: 4 }];
    let guard = 0;
    while (this.trees.length < 30 && guard++ < 5000) {
      const x = (rnd() - 0.5) * 44, z = (rnd() - 0.5) * 44;
      const hh = heightAt(x, z);
      if (hh < 1.15) continue;
      if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
      if (this.trees.some((t) => Math.hypot(x - t.x, z - t.z) < 2.6)) continue;
      const kind = hh > 2.2 || rnd() < 0.4 ? 'pine' : 'round';
      const scale = 0.85 + rnd() * 0.4;
      const t = makeTree(kind, scale);
      t.group.position.set(x, hh - 0.05, z);
      t.group.rotation.y = rnd() * 6.28;
      sc.add(t.group);
      this.trees.push({ ...t, x, z, kind, scale, hp: 4, state: 'up', timer: 0, wob: 0 });
    }
    for (const isle of this.isles) for (const tt of isle.trees) {
      const t = makeTree(tt.kind, tt.scale);
      t.group.position.set(tt.x, heightAt(tt.x, tt.z) - 0.05, tt.z);
      t.group.rotation.y = Math.random() * 6.28;
      isle.group.add(t.group);
      this.trees.push({ ...t, x: tt.x, z: tt.z, kind: tt.kind, scale: tt.scale, hp: 4, state: 'up', timer: 0, wob: 0 });
    }
    this.foliage = buildFoliage([...avoid.slice(0, 1).map((a) => ({ ...a, r: 6.5 })), { x: FIRE.x, z: FIRE.z, r: 2 }, ...this.trees.map((t) => ({ x: t.x, z: t.z, r: 0.8 }))]);
    sc.add(this.foliage);

    this.player = makeKeeper();
    sc.add(this.player);
    this.pl = { pos: new THREE.Vector3(this.S.px, 0, this.S.pz), face: 0, vel: new THREE.Vector3(), walkT: 0, swing: 0, swingHit: false, target: null, cast: 0, held: 0, stepT: 0 };

    this.gulls = [];
    for (let i = 0; i < 5; i++) {
      const g = makeGull();
      g.userData.orbit = { cx: rand(-15, 20), cz: rand(-5, 35), r: rand(8, 20), y: rand(7, 13), a: rand(0, 6.28), s: rand(0.25, 0.45) * (Math.random() < 0.5 ? -1 : 1) };
      sc.add(g);
      this.gulls.push(g);
    }
    this.crabs = [];
    for (let i = 0; i < 3; i++) {
      const c = makeCrab();
      const a = rand(0, 6.28);
      c.userData = { ...c.userData, x: Math.cos(a) * 21, z: Math.sin(a) * 21, tx: 0, tz: 0, t: 0 };
      sc.add(c);
      this.crabs.push(c);
    }
    this.pickups = [];
    this.flyLogs = [];
    this.pickT = 2;
    this.beam = { on: false, x: 14, z: 55 };
    this.cook = 0;
  }

  // ------------------------------------------------------------------ state
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  titleData() {
    let day = 1;
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) day = Math.floor(s.clock / DAY) + 1; } catch (e) { /* none */ }
    return { hasSave: this.hasSave(), day };
  }
  save() {
    if (this.mode === 'title') return;
    let out = (this.mode === 'inside' || this.mode === 'tower') ? this.outsidePos : this.pl.pos;
    if (this.mode === 'sail' || this.mode === 'lamp') { const D = DOCKS.find((d) => d.id === (this.S.boat ? this.S.boat.dock : 'home')); out = this.mode === 'lamp' ? this.lighthouse.doorPos : D.board; }
    this.S.px = out.x; this.S.pz = out.z;
    this.S.trees = {};
    this.trees.forEach((t, i) => { if (t.state !== 'up') this.S.trees[i] = Math.max(1, t.timer); });
    this.S.wx = this.weather.save();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.S)); } catch (e) { /* storage blocked */ }
  }
  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: this.settings, music: this.audio.music, sfx: this.audio.sfx })); } catch (e) { /* blocked */ }
  }
  load(S) {
    const base = freshState();
    this.S = Object.assign(base, S);
    if (S.wx) this.weather.load(S.wx); else { this.weather.set('clear'); this.weather.timer = 150; }
    this.S.stats = Object.assign(freshState().stats, S.stats || {});
    this.S.paint = Object.assign(freshState().paint, S.paint || {});
    this.pl.pos.set(this.S.px, 0, this.S.pz);
    // the boat always starts the day back at the keeper's own dock, and so does a keeper who was away
    if (this.S.boat) {
      if (Math.hypot(this.pl.pos.x, this.pl.pos.z) > 120) { const H = DOCKS[0]; this.pl.pos.set(H.board.x, 0, H.board.z); }
      this.S.boat.dock = 'home';
    }
    if (!this.walkable(this.pl.pos.x, this.pl.pos.z, 99) || this.level() - groundAt(this.pl.pos.x, this.pl.pos.z, this.S.bridge) > 0.2) {
      // saved somewhere wet (or the map moved): put the keeper back beside their boat
      const D = DOCKS.find((d) => d.id === (this.S.boat ? this.S.boat.dock : 'home')) || DOCKS[0];
      if (this.S.boat) this.pl.pos.set(D.board.x, 0, D.board.z); else this.pl.pos.set(-1.5, 0, 2.5);
    }
    this.trees.forEach((t, i) => {
      const left = this.S.trees[i];
      if (left) this.setStump(t, left); else this.setStanding(t);
    });
    this.cabin.build(this.S);
    this.bridge.visible = this.S.bridge;
    this.sailboat.visible = !!this.S.boat;
    if (this.S.boat) this.placeBoatAtDock();
    for (const b of [...this.harbor.boats]) this.harbor.remove(b);
    this.harbor.nextIn = 30;
    this.harbor.orderIdx = 0;
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    this.fishing.stop();
  }
  setStanding(t) { t.state = 'up'; t.hp = this.S.tools.axe ? 3 : 4; t.top.visible = true; t.top.quaternion.identity(); t.top.position.set(0, 0, 0); t.top.scale.setScalar(1); t.stump.visible = false; }
  setStump(t, timer) { t.state = 'stump'; t.timer = timer; t.top.visible = false; t.stump.visible = true; }

  // ------------------------------------------------------------------ helpers
  get t() { return (this.S.clock % DAY) / DAY; }
  isNight() { return isNightT(this.t); }
  tideAngle() { return (this.S.clock / TIDE_PERIOD) * Math.PI * 2 + TIDE_PHASE; }
  level() { return TIDE_MID + TIDE_AMP * Math.sin(this.tideAngle()) + (this.weather ? this.weather.surge : 0); }
  tide01() { return (this.level() - (TIDE_MID - TIDE_AMP)) / (2 * TIDE_AMP); }
  tideInfo() {
    const a = ((this.tideAngle() % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const rising = Math.cos(a) > 0;
    const target = rising ? Math.PI / 2 : Math.PI * 1.5;
    let da = target - a; if (da < 0) da += Math.PI * 2;
    const secs = (da / (Math.PI * 2)) * TIDE_PERIOD;
    return { rising, text: (rising ? 'High' : 'Low') + ' in ' + fmtTime(secs) };
  }
  clockText() {
    const mins = Math.floor(this.t * 24 * 60);
    let hh = Math.floor(mins / 60), mm = Math.floor((mins % 60) / 10) * 10;
    const ap = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
  }
  walkable(x, z, fromDepth) {
    const lvl = this.level();
    const g = groundAt(x, z, this.S.bridge);
    const depth = lvl - g;
    if (depth > WADE_LIMIT && depth > fromDepth - 0.001) return false;
    if (Math.hypot(x, z) > 520) return false;
    return true;
  }
  blockers() {
    const list = [...this.rocks, ...this.dock.crates, ...this.cabin.blockers(), ...this.isles.flatMap((i) => i.blockers), { x: LH.x, z: LH.z, r: 2.0 }, { x: FIRE.x, z: FIRE.z, r: 1.0 }];
    for (const t of this.trees) if (t.state === 'up' || t.state === 'growing') list.push({ x: t.x, z: t.z, r: 0.42 * t.scale }); else list.push({ x: t.x, z: t.z, r: 0.3 * t.scale });
    return list;
  }
  give(key, n) { this.S[key] += n; }
  addCoins(n) { this.S.coins += n; this.S.stats.earned += n; }

  // ------------------------------------------------------------------ input
  input() {
    this.keys = new Set();
    this.pressed = false;
    this.held = false;
    this.joy = { x: 0, y: 0, id: null };
    this.mouse = new THREE.Vector2();
    addEventListener('keydown', (e) => {
      if (e.repeat && ['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); return; }
      this.audio.unlock();
      const k = e.code;
      if (k === 'Escape') {
        if (this.ui.open && this.ui.panel.kind !== 'title') { this.act(this.ui.panel.data.back ? 'back' : 'close'); return; }
        if (this.mode === 'lamp') { this.exitLamp(); return; }
        if (this.mode === 'inside' && this.placing) { this.cancelPlacing(); return; }
        if (['explore', 'inside', 'tower', 'sail'].includes(this.mode)) { this.ui.show('pause'); return; }
      }
      if (this.ui.open) return;
      this.keys.add(k);
      if (k === 'KeyE' || k === 'Space' || k === 'Enter') { this.pressed = true; this.held = true; e.preventDefault(); }
      if (k === 'KeyF') this.eat();
      if (k === 'KeyQ') this.altPressed = true;
      if (k === 'KeyX') this.movePressed = true;
      if (k === 'KeyB' && this.mode === 'inside') this.openFurnish();
      if (k === 'KeyR' && this.placing) this.rotatePlacing();
      if (k === 'KeyJ' || k === 'Tab') { e.preventDefault(); if (this.mode !== 'title') this.ui.show('journal'); }
      if (k === 'KeyM') { this.audio.muted = !this.audio.muted; this.audio.applyVolumes(); this.ui.toast(this.audio.muted ? 'Sound off' : 'Sound on', 1.2); }
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') this.held = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.held = false; if (['explore', 'inside', 'tower', 'sail'].includes(this.mode) && !this.ui.open) this.ui.show('pause'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    addEventListener('pagehide', () => this.save());

    const cv = this.canvas;
    cv.addEventListener('pointermove', (e) => { this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); this.mouseMoved = true; });
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.mouseMoved = true;
      if (e.pointerType === 'mouse' && e.button === 0 && ['explore', 'inside', 'tower', 'sail'].includes(this.mode)) { this.pressed = true; this.held = true; }
      if (e.pointerType !== 'mouse' && this.placing) this.tapPlace = true;
      if (e.button === 2 && this.placing) this.rotatePlacing();
      if (this.mode === 'lamp') this.held = true;
    });
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' || this.mode === 'lamp') this.held = false; });
    cv.addEventListener('wheel', (e) => { this.settings.zoom = clamp(this.settings.zoom + Math.sign(e.deltaY) * 0.08, 0.7, 1.4); }, { passive: true });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch controls
    const T = this.ui.touch;
    const joy = T.querySelector('.joy'), knob = joy.querySelector('i');
    const joyMove = (e) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy), max = r.width / 2 - 10;
      if (m > max) { dx *= max / m; dy *= max / m; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / max; this.joy.y = dy / max;
    };
    joy.addEventListener('pointerdown', (e) => { this.audio.unlock(); this.joy.id = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joy.id) joyMove(e); });
    const joyEnd = (e) => { if (e.pointerId !== this.joy.id) return; this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
    const act = T.querySelector('.act');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); this.audio.unlock(); act.setPointerCapture(e.pointerId); this.pressed = true; this.held = true; act.classList.add('down'); });
    const actEnd = () => { this.held = false; act.classList.remove('down'); };
    act.addEventListener('pointerup', actEnd); act.addEventListener('pointercancel', actEnd);
    T.querySelector('.eat').addEventListener('pointerdown', () => this.eat());
    T.querySelector('.menu').addEventListener('pointerdown', () => { if (this.mode === 'lamp') this.exitLamp(); else this.ui.show('pause'); });
    T.querySelector('.jr').addEventListener('pointerdown', () => this.ui.show('journal'));
    T.querySelector('.alt').addEventListener('pointerdown', (e) => { e.preventDefault(); this.audio.unlock(); this.altTouch(); });
    T.querySelector('.furn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.placing) this.rotatePlacing(); else this.openFurnish(); });
  }

  moveInput() {
    let x = this.joy.x, z = this.joy.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    return { x, z, m: Math.min(1, m) };
  }

  // ------------------------------------------------------------------ actions from menus
  act(a, arg) {
    const S = this.S, ui = this.ui;
    switch (a) {
      case 'close': {
        const p = ui.panel;
        if (p && p.kind === 'title') return;
        if (p && (p.kind === 'settings' || p.kind === 'howto') && this.mode === 'title') { ui.show('title', this.titleData()); return; }
        ui.close();
        break;
      }
      case 'back':
        if (this.mode === 'title') ui.show('title', this.titleData()); else ui.show('pause');
        break;
      case 'tab': ui.setTab(arg); break;
      case 'continue':
        try { this.load(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { this.load(freshState()); }
        this.start();
        ui.toast(`Welcome back! Day ${Math.floor(S.clock / DAY) + 1}`);
        break;
      case 'newgame':
        if (this.hasSave()) ui.show('confirm', { title: 'Start a new island?', text: 'Your current island, house and fish book will be replaced.', yes: 'begin', no: 'back' });
        else this.act('begin');
        break;
      case 'begin':
        this.load(freshState());
        this.start();
        ui.toast('Welcome to Tiny Harbor!', 3);
        setTimeout(() => ui.toast(`Start by chopping a tree. Walk up to one and press <span class="key">${document.body.classList.contains('is-touch') ? 'USE' : 'E'}</span>`, 5), 1200);
        break;
      case 'howto': ui.show('howto', { back: true }); break;
      case 'settings': ui.show('settings', { back: true }); break;
      case 'journal': ui.show('journal'); break;
      case 'quit':
        this.save();
        if (this.mode === 'lamp') this.exitLamp();
        if (this.mode === 'inside') this.exitHouse(true);
        if (this.mode === 'tower') this.exitTower();
        if (this.mode === 'sail') { const D = DOCKS.find((d) => d.id === this.S.boat.dock); this.placeBoatAtDock(); this.pl.pos.set(D.board.x, 0, D.board.z); }
        this.mode = 'title';
        this.fishing.stop();
        ui.showHud(false);
        ui.show('title', this.titleData());
        break;
      case 'set': {
        const [k, v] = arg;
        if (k === 'music') this.audio.music = v / 100;
        if (k === 'sfx') this.audio.sfx = v / 100;
        if (k === 'zoom') this.settings.zoom = v / 100;
        this.audio.applyVolumes();
        this.saveSettings();
        break;
      }
      case 'quality': this.settings.quality = arg; this.applyQuality(); this.saveSettings(); ui.render(); break;
      case 'sell': this.sell(arg); break;
      case 'buy': this.buy(arg); break;
      case 'upgrade': this.upgrade(); break;
      case 'paint': {
        const [part, id] = arg.split(':');
        S.paint[part] = id; S.painted = true;
        this.cabin.build(S);
        ui.render();
        break;
      }
      case 'make': {
        const x = EXTRAS[arg];
        const [res, n] = Object.entries(x.cost)[0];
        if (S[res] < n) return;
        S[res] -= n;
        S.owned[arg] = true; S.shown[arg] = true;
        this.cabin.build(S);
        this.audio.play('build');
        this.puff(this.cabin.root.position, 14);
        ui.render();
        break;
      }
      case 'toggle':
        S.shown[arg] = !S.shown[arg];
        this.cabin.build(S);
        ui.render();
        break;
      case 'sleep': this.sleep(); break;
      case 'boathome': this.boatHome(); break;
      case 'craft': this.craft(arg); break;
      case 'placeItem': this.startPlacing(arg); break;
      case 'wallpaper': S.wallpaper = arg; this.interior.build(S); ui.render(); break;
      case 'floor': S.floor = arg; this.interior.build(S); ui.render(); break;
    }
  }

  start() {
    this.mode = 'explore';
    this.ui.close();
    this.ui.showHud(true);
    this.audio.unlock();
    this.camPos.copy(this.pl.pos).add(new THREE.Vector3(0, 13, 14));
  }

  applyQuality() {
    const hi = this.settings.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : 1));
    this.renderer.shadowMap.enabled = hi;
    if (this.scene) this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ economy
  sellPrice(tr, key) {
    const likes = tr.likes, bonus = tr.bonus;
    if (key.startsWith('fish.')) return Math.round(FISH_BY_ID[key.slice(5)].price * (likes === 'fish' ? bonus : 1));
    const m = likes === key || (likes === 'shells' && key === 'clams') ? bonus : 1;
    return Math.round(BASE_PRICE[key] * m);
  }
  sell(arg) {
    const boat = this.ui.panel?.data.trader;
    if (!boat) return;
    const [key, q] = arg.split(':');
    const S = this.S;
    const have = key.startsWith('fish.') ? S.fish[key.slice(5)] || 0 : S[key];
    const n = q === 'all' ? have : Math.min(1, have);
    if (n <= 0) return;
    if (key.startsWith('fish.')) S.fish[key.slice(5)] -= n; else S[key] -= n;
    const coins = n * this.sellPrice(boat, key);
    this.addCoins(coins);
    this.audio.play('coin');
    this.ui.toast(`${ICON.coin} +${coins}`, 1.4);
    this.ui.render();
  }
  shopFor(boat) {
    const S = this.S;
    const T = BOAT_TYPES[boat.type];
    if (T.goods === 'shop') {
      const out = [];
      for (const [id, x] of Object.entries(EXTRAS)) if (x.shop && !S.owned[id]) out.push({ id: 'extra.' + id, name: x.name, price: x.shop, desc: x.blurb.replace(' Sold by Marigold.', ''), icon: ICON.house });
      for (const [id, c] of Object.entries(PAINTS)) if (!c.free && !c.isle && !S.paints[id]) out.push({ id: 'paint.' + id, name: c.name + ' paint', price: c.price, desc: 'A new colour for walls, roof, door or trim.', icon: `<span class="sw" style="width:30px;height:30px;border-radius:9px;background:${c.hex};flex:none"></span>` });
      return out;
    }
    return T.goods.filter((g) => !(g.once && S.tools[g.id])).map((g) => ({ ...g, icon: g.id === 'crate' ? ICON.wood : g.id === 'bait' ? ICON.fish : '' }));
  }
  buy(id) {
    const tr = this.ui.panel?.data.trader;
    if (!tr) return;
    const item = tr.goods().find((x) => x.id === id);
    const S = this.S;
    if (!item || S.coins < item.price) return;
    S.coins -= item.price;
    if (id.startsWith('extra.')) { S.owned[id.slice(6)] = true; this.ui.toast(`Bought the ${item.name}! Place it from your home's Extras tab.`, 3); }
    else if (id.startsWith('paint.')) { S.paints[id.slice(6)] = true; this.ui.toast(`${item.name} unlocked!`); }
    else if (id === 'bait') { S.bait += 5; this.ui.toast('+5 bait. Fish will bite faster.'); }
    else if (id === 'crate') { S.wood += 12; this.ui.toast(`${ICON.wood} +12 wood`); }
    else if (id === 'pie') { S.belly = Math.min(100, S.belly + 60); this.audio.play('eat'); this.ui.toast(`${ICON.belly} Delicious! +60 belly`); }
    else if (id.startsWith('furn.')) { const f = id.slice(5); S.furn[f] = (S.furn[f] || 0) + 1; this.ui.toast(`${item.name} is waiting in your furniture box. Place it from inside your home (B)`, 3.2); }
    else {
      S.tools[id] = true;
      this.ui.toast(`Got the ${item.name}!`);
      if (id === 'axe') for (const t of this.trees) if (t.state === 'up') t.hp = Math.min(t.hp, 3);
    }
    this.audio.play('coin');
    this.ui.render();
  }
  upgrade() {
    const S = this.S, next = STAGES[S.stage + 1];
    if (!next || S.wood < next.wood || S.coins < next.coins) return;
    S.wood -= next.wood; S.coins -= next.coins;
    S.stage++;
    this.cabin.build(S);
    this.cabin.house.scale.set(1, 0.01, 1);
    this.cabin.grow = 0;
    this.puff(this.cabin.root.position, 30);
    this.audio.play('build');
    this.ui.close();
    this.ui.toast(`${ICON.house} You built the ${next.name}!`, 3);
    this.save();
  }
  puff(pos, n) {
    for (let i = 0; i < n; i++) this.particles.spawn('dust', pos.clone().add(new THREE.Vector3(rand(-3, 3), 0.3, rand(-3, 3))), 1, 1.5, 1.5);
  }

  eat() {
    if (this.mode !== 'explore' || this.ui.open) return;
    const S = this.S;
    if (S.belly >= 99) { this.ui.toast('You\'re full!', 1.2); return; }
    let food = null;
    if (S.cooked > 0) { S.cooked--; S.belly = Math.min(100, S.belly + 35); food = 'a cooked fish'; }
    else if (S.clams > 0) { S.clams--; S.belly = Math.min(100, S.belly + 10); food = 'a clam'; }
    else {
      const f = FISH.find((x) => S.fish[x.id] > 0);
      if (f) { S.fish[f.id]--; S.belly = Math.min(100, S.belly + 15); food = `a raw ${f.name.toLowerCase()} (cooking it fills you more)`; }
    }
    if (!food) { this.ui.toast('Nothing to eat. Go fishing!', 1.8); return; }
    this.audio.play('eat');
    this.ui.toast(`${ICON.belly} Ate ${food}`, 1.8);
  }

  sleep() {
    const S = this.S;
    this.ui.close();
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    this.audio.play('sleep');
    this.sleeping = true;
    setTimeout(() => {
      const day = Math.floor(S.clock / DAY);
      const target = (this.t > 0.5 ? day + 1 : day) * DAY + DAY * 0.27;
      const skipped = target - S.clock;
      S.clock = target;
      S.belly = Math.max(5, S.belly - 15);
      for (const t of this.trees) if (t.state === 'stump') t.timer -= skipped;
      for (const b of [...this.harbor.boats]) this.harbor.remove(b);
      this.harbor.nextIn = 25;
      for (const p of this.pickups) this.scene.remove(p.mesh);
      this.pickups = [];
      if (this.mode !== 'inside') { const door = this.cabin.doorWorld(); this.pl.pos.set(door.x, 0, door.z); }
      this.fishing.stop();
      this.save();
      fade.classList.remove('on');
      this.sleeping = false;
      this.ui.toast(`${ICON.sun} Good morning! Day ${Math.floor(S.clock / DAY) + 1}`, 3);
    }, 900);
  }

  // ------------------------------------------------------------------ weather
  onWeather(e) {
    const ui = this.ui, a = this.audio;
    if (e.startsWith('thunder:')) { a.thunder(parseFloat(e.slice(8))); return; }
    switch (e) {
      case 'storm-coming': ui.toast('⛈ Dark clouds on the horizon. A storm is coming! The sea will rise and boats will need the lamp.', 4.5); a.play('horn'); break;
      case 'change:storm': ui.toast('⛈ Storm! The sea is up. Stay off the beach, and light the lamp for any boats.', 4); break;
      case 'change:rain': ui.toast('🌧 It\'s starting to rain. The tide creeps higher, and fish bite faster.', 3.5); break;
      case 'change:windy': ui.toast('🌬 The wind is picking up. Sail with it for extra speed.', 3); break;
      case 'change:clear': ui.toast(this.weather.washT > 0 ? '☀ The skies clear. The storm washed driftwood and shells up the beach!' : '☀ The skies are clearing.', 3.5); break;
      case 'change:cloudy': ui.toast('☁ Clouds roll in.', 2); break;
    }
  }

  // ------------------------------------------------------------------ boats
  onBoat(ev, b, why) {
    const T = b.T, ui = this.ui, a = this.audio;
    switch (ev) {
      case 'spawn':
        if (b.night) { ui.toast(`${ICON.boat} A lantern blinks out at sea. Light the lighthouse!`, 3.5); a.play('horn'); }
        else { ui.toast(`${ICON.boat} ${T.name} is sailing in`, 3); a.play('bell'); }
        break;
      case 'horn': a.play('horn'); break;
      case 'guided': ui.toast(`${T.name} sees your light!`, 2); break;
      case 'bump': a.play('bump'); ui.toast(`Crunch! ${T.name} hit the rocks (${b.damage}/3)`, 2); break;
      case 'safe': this.S.stats.guided++; this.addCoins(15); a.play('coin'); ui.toast(`${ICON.coin} +15 · ${T.name} made it through safely!`, 3); break;
      case 'arrived': a.play('bell'); ui.toast(`${T.name} is at the dock. Tie it up at the post!`, 3.5); break;
      case 'untied': ui.toast(`${T.name} couldn't tie up and sailed away`, 3); break;
      case 'departing':
        ui.toast(`${T.name} is casting off. See you soon!`, 2.5);
        if (ui.panel?.kind === 'trade' && ui.panel.data.trader?.boat === b) ui.close();
        break;
      case 'lost': ui.toast(`${T.name} turned back (${why})`, 3); break;
    }
  }

  // ------------------------------------------------------------------ interactions
  findInteraction() {
    const p = this.pl.pos, S = this.S;
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    if (this.fishing.state !== 'idle') return null;
    const berth = this.harbor.berth;
    if (berth && near(BOLLARD.x, BOLLARD.z, 2.4)) {
      if (berth.state === 'mooring') return { text: `Tie up ${berth.T.name}`, fn: () => this.tieUp(berth) };
      if (berth.state === 'moored') return { text: `Trade with ${berth.T.who}`, fn: () => this.openTrade(berth) };
    }
    if (near(this.lighthouse.doorPos.x, this.lighthouse.doorPos.z, 2.2)) return { text: 'Go inside the lighthouse', fn: () => this.enterTower() };
    if (this.S.boat) {
      for (const D of DOCKS) if (this.S.boat.dock === D.id && near(D.board.x, D.board.z, 1.8)) return { text: 'Set sail', fn: () => this.enterSail() };
    } else if (near(BOATYARD.x, BOATYARD.z, 2.2)) return { text: `Build a sailboat (${S.wood}/40 wood · ${S.coins}/30 coins)`, fn: () => this.buildBoat() };
    for (const isle of this.isles) {
      if (!isle.group.visible) continue;
      if (near(isle.npcPos.x, isle.npcPos.z, 2.4)) return { text: `Trade with ${isle.T.who}`, fn: () => this.openIsleTrade(isle.I.id) };
      for (const v of isle.villagers) {
        if (v.inside || !near(v.x, v.z, 1.9)) continue;
        return { text: `Talk to ${v.name}`, fn: () => {
          v.say = villagerLine(isle, this.weather.state); v.sayT = 4.5; v.path = [];
          v.mesh.rotation.y = Math.atan2(p.x - v.x, p.z - v.z);
          this.audio.play('click');
        } };
      }
    }
    if (!S.bridge && near(BRIDGE_SIGN.x, BRIDGE_SIGN.z, 2.2)) return { text: S.wood >= 20 ? 'Build the bridge (20 wood)' : `Bridge needs 20 wood (you have ${S.wood})`, fn: () => this.buildBridge() };
    const door = this.cabin.doorWorld();
    if (near(door.x, door.z, 2.0)) return { text: this.isNight() ? 'Home (build · paint · sleep)' : 'Home (build · paint)', fn: () => { this.ui.show('cabin'); }, alt: { key: document.body.classList.contains('is-touch') ? 'IN' : 'Q', text: 'Go inside', fn: () => this.enterHouse() } };
    if (near(FIRE.x, FIRE.z, 2.5)) {
      const raw = Object.values(S.fish).reduce((a, b) => a + b, 0);
      if (this.cook > 0) return { text: 'Cooking…', fn: () => {} };
      if (raw > 0) return { text: 'Cook a fish', fn: () => this.startCook() };
    }
    let best = null, bd = 1.9;
    for (const t of this.trees) {
      if (t.state !== 'up') continue;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) return { text: 'Chop tree', tree: best, fn: () => this.swing(best) };
    const spot = this.fishSpot();
    if (spot) return { text: 'Fish', fn: () => this.startFishing(spot) };
    return null;
  }

  fishSpot() {
    const p = this.pl.pos, lvl = this.level();
    if (lvl - groundAt(p.x, p.z, this.S.bridge) > 0.25) return null;
    for (const dist of [2.6, 3.4]) {
      const x = p.x + Math.sin(this.pl.face) * dist, z = p.z + Math.cos(this.pl.face) * dist;
      if (inDock(x, z)) continue;
      const depth = lvl - heightAt(x, z);
      if (depth > 0.3) {
        if (this.harbor.boats.some((b) => b.distTo(x, z) < 3)) return null;
        return { pos: new THREE.Vector3(x, lvl, z), depth };
      }
    }
    return null;
  }

  tieUp(b) {
    this.harbor.tie(b);
    this.S.stats.boats++;
    this.audio.play('tie');
    this.ui.toast(`Tied up ${b.T.name}. Time to trade!`, 2);
    if (b.guided) { b.guided = false; }
    this.openTrade(b);
  }
  openTrade(b) {
    const T = b.T, hello = T.hello[Math.floor(Math.random() * T.hello.length)];
    this.ui.show('trade', { trader: { title: T.name, sub: `${T.kind} · ${T.who}`, who: T.who, likes: T.likes, bonus: 1.5, hello, boat: b, goods: () => this.shopFor(b) } });
  }
  buildBridge() {
    if (this.S.wood < 20) { this.ui.toast('Chop more trees for wood first', 1.6); return; }
    this.S.wood -= 20;
    this.S.bridge = true;
    this.bridge.visible = true;
    this.audio.play('build');
    this.puff(new THREE.Vector3((CAUSE.ax + CAUSE.bx) / 2, 0.8, (CAUSE.az + CAUSE.bz) / 2), 24);
    this.ui.toast('The bridge is built! The tide can\'t cut you off now.', 3);
    this.save();
  }
  startCook() {
    const f = FISH.find((x) => this.S.fish[x.id] > 0);
    if (!f) return;
    this.S.fish[f.id]--;
    this.cook = 1.8;
    this.fire.spit.visible = true;
    this.audio.play('sizzle');
  }

  swing(tree) {
    if (this.pl.swing > 0) return;
    this.pl.target = tree;
    this.pl.swing = this.S.belly <= 0 ? 0.7 : 0.42;
    this.pl.swingLen = this.pl.swing;
    this.pl.swingHit = false;
    this.pl.face = Math.atan2(tree.x - this.pl.pos.x, tree.z - this.pl.pos.z);
  }
  hitTree(t) {
    t.hp--;
    t.wob = 1;
    this.audio.play('chop');
    const hp = new THREE.Vector3(t.x, groundAt(t.x, t.z) + 0.9, t.z);
    this.particles.spawn('chip', hp, 5, 1, 2.5);
    this.particles.spawn('leaf', hp.clone().setY(hp.y + 1.6), 3, 1.2, 1);
    if (t.hp <= 0) {
      t.state = 'falling';
      t.fall = 0;
      const away = new THREE.Vector3(t.x - this.pl.pos.x, 0, t.z - this.pl.pos.z).normalize();
      t.axis = new THREE.Vector3(away.z, 0, -away.x);
      this.audio.play('fall');
    }
  }

  startFishing(spot) {
    const S = this.S;
    const bait = S.bait > 0;
    if (bait) S.bait--;
    const t = this.t;
    this.pl.face = Math.atan2(spot.pos.x - this.pl.pos.x, spot.pos.z - this.pl.pos.z);
    this.fishing.start(spot.pos, {
      depth: spot.depth, lowTide: this.tide01() < 0.32, highTide: this.tide01() > 0.68,
      night: this.isNight(), dawnDusk: (t > 0.21 && t < 0.31) || (t > 0.73 && t < 0.83), storm: this.weather.storm > 0.5,
    }, { bait, rod: S.tools.rod, lure: S.tools.lure, rain: this.weather.rain > 0.3 });
    this.pl.cast = 0.4;
  }

  catchFish(f) {
    const S = this.S;
    const first = !S.caught[f.id];
    S.fish[f.id] = (S.fish[f.id] || 0) + 1;
    S.caught[f.id] = (S.caught[f.id] || 0) + 1;
    S.stats.fish++;
    this.audio.play('catch');
    this.ui.toast(`${fishSvg(f, 40)} <span>You caught ${/^[AEIOU]/.test(f.name) ? 'an' : 'a'} <b>${f.name}</b>!${first ? ' <span class="chip" style="background:var(--gold)">New!</span>' : ''}</span>`, 2.6);
    this.pl.held = 1.6;
    this.player.userData.held.material = this.player.userData.held.material.clone();
    this.player.userData.held.material.color.set(f.color);
  }

  // ------------------------------------------------------------------ lighthouse
  enterLamp(from) {
    this.lampFrom = from || 'explore';
    this.mode = 'lamp';
    this.fishing.stop();
    this.player.visible = false;
    this.lighthouse.beam.visible = true;
    this.audio.play('lamp');
    const w = this.harbor.waiting[0];
    if (w) { this.beam.x = w.pos.x; this.beam.z = w.pos.z; } else { this.beam.x = 14; this.beam.z = 55; }
    this.mouseMoved = false;
    this.ui.toast(this.isNight() ? 'Point the beam at a waiting boat, then lead it past the rocks to the dock' : 'No boats need the lamp in daylight. Come back at night!', 4);
  }
  exitLamp() {
    this.beam.on = false;
    this.player.visible = true;
    if (this.lampFrom === 'tower') {
      this.mode = 'tower';
      this.pl.pos.set(this.tower.stairFoot.x, 0, this.tower.stairFoot.z);
      this.camPos.set(0, 3.2 + TOWER_R * 1.5, TOWER_R + 1.8 + TOWER_R * 1.1);
      return;
    }
    this.mode = 'explore';
    const d = this.lighthouse.doorPos;
    this.pl.pos.set(d.x, 0, d.z);
  }

  // ------------------------------------------------------------------ inside the lighthouse
  enterTower() {
    this.fishing.stop();
    this.outsidePos = this.pl.pos.clone();
    this.mode = 'tower';
    this.tower.scene.add(this.player);
    this.player.visible = true;
    this.pl.pos.set(0, 0, TOWER_R - 0.9);
    this.pl.vel.set(0, 0, 0);
    this.pl.face = Math.PI;
    this.camPos.set(0, 3.2 + TOWER_R * 1.5, TOWER_R + 1.8 + TOWER_R * 1.1);
    this.camLook.set(0, 0.6, -0.4);
    this.audio.play('door');
  }
  exitTower() {
    this.mode = 'explore';
    this.scene.add(this.player);
    const d = this.lighthouse.doorPos;
    this.pl.pos.set(d.x, 0, d.z);
    this.pl.vel.set(0, 0, 0);
    this.pl.face = Math.atan2(d.x - LH.x, d.z - LH.z);
    this.camPos.copy(this.pl.pos).add(new THREE.Vector3(0, 13, 14));
    this.camLook.copy(this.pl.pos);
    this.audio.play('door');
  }
  updateTower(dt) {
    const pl = this.pl, T = this.tower, R = TOWER_R;
    const inp = this.moveInput();
    pl.vel.x = damp(pl.vel.x, inp.x * 3.2, 12, dt);
    pl.vel.z = damp(pl.vel.z, inp.z * 3.2, 12, dt);
    let nx = pl.pos.x + pl.vel.x * dt, nz = pl.pos.z + pl.vel.z * dt;
    const r = Math.hypot(nx, nz);
    if (r > R - 0.35) {
      if (nz > 0 && Math.abs(nx) < 0.9) { this.exitTower(); return; }
      nx *= (R - 0.35) / r; nz *= (R - 0.35) / r;
    }
    for (const b of T.blockers) {
      const dx = nx - b.x, dz = nz - b.z, d = Math.hypot(dx, dz), min = b.r + 0.3;
      if (d < min && d > 0.0001) { nx = b.x + (dx / d) * min; nz = b.z + (dz / d) * min; }
    }
    pl.pos.set(nx, 0, nz);
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (inp.m > 0.1) pl.face += angleDiff(pl.face, Math.atan2(inp.x, inp.z)) * Math.min(1, dt * 14);
    if (sp > 0.6) { pl.walkT += dt * sp * 2.2; pl.stepT -= dt; if (pl.stepT <= 0) { pl.stepT = 0.34; this.audio.play('step'); } }
    const near = (p, d) => Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < d;
    this.inter = null;
    if (near(T.stairFoot, 1.3)) this.inter = { text: 'Climb up to the lamp', fn: () => this.enterLamp('tower') };
    else if (near(T.chartPos, 1.6)) this.inter = { text: 'Read the sea chart', fn: () => this.ui.show('chart') };
    else if (near(T.deskPos, 1.5)) this.inter = { text: 'Read the logbook', fn: () => this.ui.show('journal') };
    if (this.inter && this.pressed) this.inter.fn();
    if (this.altPressed) this.exitTower();
  }

  // ------------------------------------------------------------------ the sailboat
  buildBoat() {
    const S = this.S;
    if (S.wood < 40 || S.coins < 30) { this.ui.toast(`A sailboat needs ${ICON.wood}40 and ${ICON.coin}30`, 2); return; }
    S.wood -= 40; S.coins -= 30;
    S.boat = { dock: 'home' };
    this.placeBoatAtDock();
    this.sailboat.visible = true;
    this.audio.play('build');
    this.puff(new THREE.Vector3(this.sb.pos.x, 1, this.sb.pos.z), 20);
    this.ui.toast('Your sailboat is tied up at the end of the dock! Walk out to it and press E', 4);
    this.save();
  }
  // rescue: put the boat (and the keeper) back at the keeper's own dock
  boatHome() {
    if (!this.S.boat) return;
    this.ui.close();
    if (this.mode !== 'sail' && this.mode !== 'explore') return;
    this.mode = 'explore';
    this.S.boat.dock = 'home';
    this.placeBoatAtDock();
    const H = DOCKS[0];
    this.pl.pos.set(H.board.x, 0, H.board.z);
    this.pl.vel.set(0, 0, 0);
    this.camPos.copy(this.pl.pos).add(new THREE.Vector3(0, 13, 14));
    this.camLook.copy(this.pl.pos);
    this.save();
    this.ui.toast('Back at your own dock, boat and all.', 2.5);
  }
  placeBoatAtDock() {
    const D = DOCKS.find((d) => d.id === (this.S.boat ? this.S.boat.dock : 'home'));
    this.sb.pos.set(D.berth.x, 0, D.berth.z);
    this.sb.heading = D.berth.heading;
    this.sb.speed = 0;
  }
  enterSail() {
    this.fishing.stop();
    this.mode = 'sail';
    this.sb.speed = 0;
    this.sb.leaveT = 2;      // don't offer to tie straight back up
    this.inter = null;
    this.sb.bumpT = 0;
    this.audio.play('tie');
    if (!this.S.sailedOnce) {
      this.S.sailedOnce = true;
      this.ui.toast('Steer with WASD or the stick. The islands are marked on the little map. Sail up beside a pier to tie up.', 5);
    }
  }
  dockSail(D) {
    const S = this.S;
    S.boat.dock = D.id;
    this.placeBoatAtDock();
    this.mode = 'explore';
    this.pl.pos.set(D.board.x, 0, D.board.z);
    this.pl.vel.set(0, 0, 0);
    this.pl.face = Math.atan2(-D.dx, -D.dz);
    this.audio.play('tie');
    if (D.id === 'home') this.ui.toast('Home again!', 2);
    else {
      const I = ISLANDS.find((i) => i.id === D.id), T = ISLE_TRADERS[D.id];
      S.visited = S.visited || {};
      const first = !S.visited[D.id];
      S.visited[D.id] = true;
      this.ui.toast(`Welcome to ${I.name}!${first ? ` ${T.who} runs the shop up the path.` : ''}`, 3);
    }
    this.save();
  }
  updateSail(dt) {
    const sb = this.sb, S = this.S;
    const inp = this.moveInput();
    const wx = this.weather;
    const max = (S.tools.bigsail ? 12.6 : 9) * (1 + 0.35 * wx.wind * Math.cos(sb.heading - wx.windDir));
    if (inp.m > 0.1) {
      const want = Math.atan2(inp.x, inp.z);
      const d = angleDiff(sb.heading, want);
      sb.heading += clamp(d, -1.5 * dt, 1.5 * dt);
      sb.turn = clamp(d, -1, 1);
      sb.speed = damp(sb.speed, max * inp.m * clamp(Math.cos(d), 0.3, 1), 0.9, dt);
    } else { sb.speed = damp(sb.speed, 0, 0.6, dt); sb.turn = 0; }
    const fx = Math.sin(sb.heading), fz = Math.cos(sb.heading);
    const drift = wx.wind * (0.4 + wx.storm * 1.4);
    const nx = sb.pos.x + fx * sb.speed * dt + Math.sin(wx.windDir) * drift * dt, nz = sb.pos.z + fz * sb.speed * dt + Math.cos(wx.windDir) * drift * dt;
    const bx = nx + fx * 2.1, bz = nz + fz * 2.1;
    const lvl = this.level();
    let hit = heightAt(bx, bz) > lvl - 0.55 || inDock(bx, bz) || inDock(nx + fx * 0.8, nz + fz * 0.8);
    if (!hit) for (const [x, z, r] of BAY_ROCKS) if (Math.hypot(bx - x, bz - z) < r + 0.4) { hit = true; break; }
    if (!hit && this.S.bridge) { const b = bridgeY(bx, bz); if (b !== null) hit = true; }
    sb.bumpT = Math.max(0, (sb.bumpT || 0) - dt);
    if (hit) {
      if (sb.speed > 1.5 && sb.bumpT <= 0) { this.audio.play('bump'); sb.bumpT = 1; sb.shake = 0.4; }
      sb.speed = Math.min(0, -sb.speed * 0.2);
      sb.pos.x -= fx * 0.05; sb.pos.z -= fz * 0.05;
    } else { sb.pos.x = nx; sb.pos.z = nz; }
    const far = Math.hypot(sb.pos.x, sb.pos.z);
    if (far > 480) { sb.pos.x *= 480 / far; sb.pos.z *= 480 / far; if (!this.farWarn) { this.farWarn = 4; this.ui.toast('The open sea is too rough out here. Turn back!', 2); } }
    this.farWarn = Math.max(0, (this.farWarn || 0) - dt);
    if (Math.abs(sb.speed) > 1.5 && Math.random() < dt * 18) this.particles.spawn('foam', new THREE.Vector3(sb.pos.x - fx * 2, lvl + 0.05, sb.pos.z - fz * 2), 1, 0.6, 0);
    // tie up beside any pier
    this.inter = null;
    // anywhere alongside a pier counts, at any speed (the old rule wanted you slow and right at the end,
    // so at full sail the prompt only flickered while you bumped the pier)
    sb.leaveT = Math.max(0, (sb.leaveT || 0) - dt);
    if (sb.leaveT <= 0) for (const D of DOCKS) {
      const along = segDist(sb.pos.x, sb.pos.z, D.sx, D.sz, D.sx + D.dx * D.len, D.sz + D.dz * D.len);
      if (along < D.w / 2 + 5.5 || Math.hypot(sb.pos.x - D.berth.x, sb.pos.z - D.berth.z) < 9) {
        const name = D.id === 'home' ? 'home' : ISLANDS.find((i) => i.id === D.id).name;
        this.inter = { text: `Tie up at ${name}`, fn: () => this.dockSail(D) };
      }
    }
    this.pl.pos.set(sb.pos.x, 0, sb.pos.z);
    // tying up moves the keeper onto the pier, so it must come last
    if (this.inter && this.pressed) this.inter.fn();
  }
  // boat mesh follows its state every frame, docked or sailing
  animateSailboat(dt) {
    const sb = this.sb, g = this.sailboat, u = g.userData;
    if (!g.visible) return;
    const lvl = this.level();
    const wv = 1 + this.weather.wind * 2.5;
    g.position.set(sb.pos.x, lvl + Math.sin(this.time * 1.5 + sb.pos.x) * 0.05 * wv, sb.pos.z);
    g.rotation.y = sb.heading;
    sb.shake = Math.max(0, (sb.shake || 0) - dt);
    u.rig.rotation.z = Math.sin(this.time * 1.2) * 0.04 * wv + Math.sin(this.time * 2.3) * 0.05 * this.weather.storm - (sb.turn || 0) * 0.08 * Math.min(1, Math.abs(sb.speed) / 6) + (sb.shake > 0 ? Math.sin(this.time * 40) * 0.06 : 0);
    u.rig.rotation.x = Math.sin(this.time * 0.9) * 0.025 - Math.abs(sb.speed) * 0.004;
    u.sailPivot.rotation.y = damp(u.sailPivot.rotation.y, 0.5 - (sb.turn || 0) * 0.5 + Math.sin(this.time * 0.5) * 0.06, 3, dt);
    u.sail.scale.x = 0.4 + Math.min(1, Math.abs(sb.speed) / 9) * 1.2;
    const night = this.sky.night;
    u.lanternMat.emissiveIntensity = night * 1.6;
    u.glow.material.opacity = night * 0.8;
  }

  // ------------------------------------------------------------------ island trading
  isleGoods(id) {
    const S = this.S;
    return ISLE_TRADERS[id].goods.filter((g) => !(g.once && S.tools[g.id]) && !(g.id.startsWith('paint.') && S.paints[g.id.slice(6)]))
      .map((g) => ({ ...g, icon: g.id.startsWith('paint.') ? `<span class="sw" style="width:30px;height:30px;border-radius:9px;background:${PAINTS[g.id.slice(6)].hex};flex:none"></span>` : g.id.startsWith('furn.') ? ICON.house : g.id === 'pie' ? ICON.cooked : g.id === 'bait' ? ICON.fish : ICON.boat }));
  }
  openIsleTrade(id) {
    const I = ISLANDS.find((i) => i.id === id), T = ISLE_TRADERS[id];
    this.ui.show('trade', { trader: { title: I.name, sub: `${T.kind} · ${T.who}`, who: T.who, likes: T.likes, bonus: T.bonus, hello: T.hello[Math.floor(Math.random() * T.hello.length)], goods: () => this.isleGoods(id) } });
  }

  // little sea map, drawn while sailing
  drawMinimap() {
    const cv = this.ui.mini;
    if (!cv) return;
    const x = cv.getContext('2d'), W = cv.width, H = cv.height, sc = (W / 2 - 6) / 420;
    const cx = W / 2, cy = H / 2;
    const P = (wx, wz) => [cx + wx * sc, cy + wz * sc];
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#2b8fc8'; x.beginPath(); x.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); x.clip();
    const isle = (wx, wz, r, col, label) => {
      const [px, pz] = P(wx, wz);
      x.fillStyle = col; x.beginPath(); x.arc(px, pz, Math.max(4, r * sc), 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff8ec'; x.font = 'bold 11px Fredoka, sans-serif'; x.textAlign = 'center'; x.fillText(label, px, pz - Math.max(4, r * sc) - 3);
    };
    isle(0, 0, 24, '#7cc46a', 'Home');
    for (const I of ISLANDS) isle(I.x, I.z, I.R, '#a8d68a', { pebble: 'Pebble', drift: 'Drift', coral: 'Coral' }[I.id]);
    const [bx, bz] = P(this.sb.pos.x, this.sb.pos.z);
    x.translate(bx, bz); x.rotate(-this.sb.heading + Math.PI);
    x.fillStyle = '#ffcf3f'; x.strokeStyle = '#3b2f2a'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(-5, 6); x.closePath(); x.fill(); x.stroke();
    x.restore();
  }

  // ------------------------------------------------------------------ inside the house
  enterHouse() {
    this.fishing.stop();
    this.outsidePos = this.pl.pos.clone();
    this.mode = 'inside';
    const I = this.interior;
    I.build(this.S);
    I.scene.add(this.player);
    this.pl.pos.set(0, 0, I.d / 2 - 0.9);
    this.pl.vel.set(0, 0, 0);
    this.pl.face = Math.PI;
    this.camPos.set(0, 3.2 + I.d * 0.75, I.d / 2 + 1.8 + I.d * 0.55);
    this.camLook.set(0, 0.6, -0.4);
    this.audio.play('door');
    if (!this.S.seenInside) {
      this.S.seenInside = true;
      this.ui.toast(`Welcome home! Press <span class="key">${document.body.classList.contains('is-touch') ? '🛠' : 'B'}</span> to make furniture from wood and shells`, 4.5);
    }
  }
  exitHouse(silent) {
    if (this.placing) this.cancelPlacing(true);
    this.mode = 'explore';
    this.scene.add(this.player);
    const door = this.cabin.doorWorld();
    this.pl.pos.set(door.x, 0, door.z);
    this.pl.vel.set(0, 0, 0);
    this.pl.face = this.cabin.root.rotation.y;
    this.camPos.copy(this.pl.pos).add(new THREE.Vector3(0, 13, 14));
    this.camLook.copy(this.pl.pos);
    if (!silent) this.audio.play('door');
  }
  altTouch() {
    if (this.placing) { this.rotatePlacing(); return; }
    if (this.inter && this.inter.alt) this.inter.alt.fn();
  }
  openFurnish() {
    if (this.mode !== 'inside' || this.ui.open) return;
    if (this.placing) this.cancelPlacing(true);
    this.ui.show('furnish');
  }
  canAfford(cost) {
    const S = this.S;
    return Object.entries(cost).every(([k, n]) => (k === 'fish' ? Object.values(S.fish).reduce((a, b) => a + b, 0) : S[k]) >= n);
  }
  craft(id) {
    const F = FURNITURE[id], S = this.S;
    if (!F || !F.cost || !this.canAfford(F.cost)) return;
    for (const [k, n] of Object.entries(F.cost)) {
      if (k === 'fish') { for (let i = 0; i < n; i++) { const f = FISH.find((x) => S.fish[x.id] > 0); S.fish[f.id]--; } }
      else S[k] -= n;
    }
    S.furn[id] = (S.furn[id] || 0) + 1;
    this.audio.play('build');
    this.ui.toast(`${F.name} made! Press Place to put it in the room`, 2);
    this.ui.render();
  }
  startPlacing(id, r = 0) {
    if (!(this.S.furn[id] > 0)) return;
    this.ui.close();
    this.placing = { id, r };
    this.mouseMoved = false;
    this.interior.setGhost(id, this.S);
  }
  rotatePlacing() {
    if (!this.placing || FURNITURE[this.placing.id].wall) return;
    this.placing.r = (this.placing.r + 1) % 4;
    this.audio.play('click');
  }
  cancelPlacing(silent) {
    this.placing = null;
    this.interior.clearGhost();
    if (!silent) this.ui.toast('Put away. Place it any time from the furniture menu', 2);
  }
  pickUp(entry) {
    const S = this.S, I = this.interior;
    I.removeItem(entry);
    S.room.splice(S.room.indexOf(entry.data), 1);
    S.furn[entry.data.id] = (S.furn[entry.data.id] || 0) + 1;
    this.audio.play('pop');
    this.startPlacing(entry.data.id, entry.data.r);
  }

  updateInside(dt) {
    const pl = this.pl, I = this.interior, S = this.S;
    const touch = document.body.classList.contains('is-touch');
    const inp = this.moveInput();
    const speed = 3.2 * (S.belly <= 0 ? 0.6 : 1);
    pl.vel.x = damp(pl.vel.x, inp.x * speed, 12, dt);
    pl.vel.z = damp(pl.vel.z, inp.z * speed, 12, dt);
    let nx = pl.pos.x + pl.vel.x * dt, nz = pl.pos.z + pl.vel.z * dt;
    const hw = I.w / 2 - 0.32, back = -I.d / 2 + 0.32, front = I.d / 2 - 0.15;
    // walking out through the doorway leaves the house
    if (nz > front && Math.abs(nx) < 0.9 && !this.placing) { this.exitHouse(); return; }
    nx = clamp(nx, -hw, hw); nz = clamp(nz, back, front);
    for (const s of I.solids()) {
      const hx = s.w / 2 + 0.28, hz = s.d / 2 + 0.28, dx = nx - s.x, dz = nz - s.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) nx = s.x + Math.sign(dx || 1) * hx; else nz = s.z + Math.sign(dz || 1) * hz;
      }
    }
    pl.pos.set(nx, 0, nz);
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (inp.m > 0.1) pl.face += angleDiff(pl.face, Math.atan2(inp.x, inp.z)) * Math.min(1, dt * 14);
    if (sp > 0.6) { pl.walkT += dt * sp * 2.2; pl.stepT -= dt; if (pl.stepT <= 0) { pl.stepT = 0.34; this.audio.play('step'); } }

    if (this.placing) {
      const P = this.placing, F = FURNITURE[P.id];
      // where the ghost goes: the mouse, a tapped spot, or just in front of the keeper
      let tx = pl.pos.x + Math.sin(pl.face) * 1.5, tz = pl.pos.z + Math.cos(pl.face) * 1.5;
      if ((this.mouseMoved && !touch) || this.tapPlace) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(this.mouse, this.camera);
        const hit = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) { tx = hit.x; tz = hit.z; }
        if (this.tapPlace) { P.tx = tx; P.tz = tz; }
      } else if (touch && P.tx !== undefined && inp.m < 0.1) { tx = P.tx; tz = P.tz; }
      if (inp.m > 0.1) { P.tx = undefined; this.mouseMoved = false; }
      const fp = footprint({ id: P.id, r: P.r });
      const snap = (v) => Math.round(v * 4) / 4;
      const data = {
        id: P.id,
        x: clamp(snap(tx), -I.w / 2 + fp.w / 2, I.w / 2 - fp.w / 2),
        z: F.wall ? 0 : clamp(snap(tz), -I.d / 2 + fp.d / 2, I.d / 2 - 0.7 - fp.d / 2),
        r: F.wall ? 0 : P.r,
      };
      const valid = I.fits(data);
      I.updateGhost(data, valid);
      this.inter = null;
      // on touch a tap only moves the ghost; the USE button places it
      if (this.pressed && !this.tapPlace) {
        if (valid) {
          S.room.push(data);
          S.furn[P.id]--;
          I.clearGhost();
          I.addItem(data, S);
          this.placing = null;
          this.audio.play('build');
          for (let i = 0; i < 6; i++) this.particles.spawn('dust', new THREE.Vector3(data.x, 0.2, data.z), 1, 1, 1);
        } else { this.audio.play('bump'); this.ui.toast('It doesn\'t fit there', 1.2); }
      }
      return;
    }

    // what's next to me?
    let best = null, bd = 1.0;
    for (const e of I.items) {
      const F = FURNITURE[e.data.id];
      let d;
      if (F.wall) d = Math.abs(pl.pos.x - e.data.x) < footprint(e.data).w / 2 + 0.4 ? Math.max(0, pl.pos.z - (-I.d / 2 + 0.6)) : 9;
      else {
        const fp = footprint(e.data);
        d = Math.hypot(Math.max(0, Math.abs(pl.pos.x - e.data.x) - fp.w / 2), Math.max(0, Math.abs(pl.pos.z - e.data.z) - fp.d / 2));
      }
      if (F.flat) d += 0.6;
      if (d < bd) { bd = d; best = e; }
    }
    this.inter = null;
    if (best) {
      const F = FURNITURE[best.data.id];
      const move = { key: touch ? 'MOVE' : 'X', text: 'Move', fn: () => this.pickUp(best) };
      if (F.use === 'sleep') {
        this.inter = { text: this.isNight() ? 'Sleep until morning' : 'Bed (sleep at night)', fn: () => (this.isNight() ? this.sleep() : this.ui.toast('Not sleepy yet. Come back after dark', 1.6)), alt: move };
      } else if (F.use === 'cook') {
        const raw = Object.values(S.fish).reduce((a, b) => a + b, 0);
        this.inter = { text: this.cook > 0 ? 'Cooking…' : raw > 0 ? 'Cook a fish' : 'Stove (catch a fish to cook)', fn: () => { if (this.cook <= 0 && raw > 0) this.startCook(); }, alt: move };
      } else this.inter = { text: 'Move the ' + F.name, fn: move.fn };
    }
    if (this.inter && this.movePressed) (this.inter.alt || this.inter).fn();
    else if (this.inter && this.pressed) this.inter.fn();
    if (this.altPressed) this.exitHouse();
  }

  // ------------------------------------------------------------------ main loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    document.body.classList.toggle('inside', this.mode === 'inside');
    const playing = ['explore', 'lamp', 'inside', 'tower', 'sail'].includes(this.mode) && !this.ui.open && !this.sleeping;
    if (playing) this.update(dt);
    this.updateWorld(dt, playing);
    this.render();
    this.pressed = false;
    this.altPressed = false;
    this.movePressed = false;
    this.tapPlace = false;
  }

  update(dt) {
    const S = this.S;
    S.clock += dt;
    S.belly = Math.max(0, S.belly - dt * (100 / 330));
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 15; this.save(); }
    if (this.mode === 'explore') this.updatePlayer(dt);
    else if (this.mode === 'inside') this.updateInside(dt);
    else if (this.mode === 'tower') this.updateTower(dt);
    else if (this.mode === 'sail') this.updateSail(dt);
    else this.updateLamp(dt);

    // goals
    this.goalT = (this.goalT || 0) - dt;
    if (this.goalT <= 0) {
      this.goalT = 0.5;
      for (const g of GOALS) {
        if (!S.goals[g.id] && g.check(S)) {
          S.goals[g.id] = true;
          this.addCoins(g.reward);
          this.audio.play('goal');
          this.ui.toast(`${ICON.star} Goal done: ${g.text} <span class="chip">${ICON.coin}+${g.reward}</span>`, 3.4);
        }
      }
    }
    // cooking
    if (this.cook > 0) {
      this.cook -= dt;
      if (this.cook <= 0) {
        S.cooked++; S.stats.cooked++;
        this.fire.spit.visible = false;
        this.audio.play('pop');
        this.ui.toast(`${ICON.cooked} Cooked a fish! Press <span class="key">F</span> to eat`, 2.2);
      }
    }
    // trees regrow
    for (const t of this.trees) {
      if (t.state === 'stump') {
        t.timer -= dt;
        if (t.timer <= 0) { t.state = 'growing'; t.timer = 6; t.top.visible = true; t.top.quaternion.identity(); t.top.position.set(0, 0, 0); }
      } else if (t.state === 'growing') {
        t.timer -= dt;
        const k = 1 - Math.max(0, t.timer) / 6;
        t.top.scale.setScalar(0.15 + 0.85 * smooth(0, 1, k));
        t.stump.visible = false;
        if (t.timer <= 0) this.setStanding(t);
      }
    }
    this.updatePickups(dt);
    const wx = this.weather;
    const indoors = this.mode === 'inside' || this.mode === 'tower';
    const wfocus = this.mode === 'lamp' ? new THREE.Vector3(14, 0, 58) : indoors ? this.outsidePos : this.pl.pos;
    for (const e of wx.update(dt, wfocus, this.level(), indoors)) this.onWeather(e);
    this.harbor.update(dt, { night: this.isNight() || wx.storm > 0.5, noSpawn: wx.storm > 0.5, level: this.level(), beam: this.beam, time: this.time, nightAmt: Math.max(this.sky.night, wx.storm * 0.7) });
    for (const isle of this.isles) if (isle.group.visible) updateVillagers(isle, dt, this.time, wx);
  }

  updatePlayer(dt) {
    const pl = this.pl, S = this.S, ud = this.player.userData;
    const inp = this.moveInput();
    if (this.fishing.state !== 'idle' && this.fishing.spot.distanceTo(pl.pos) > 7) this.fishing.stop();
    const fishing = this.fishing.state !== 'idle';
    if (fishing && this.fishing.state !== 'reel' && inp.m > 0.3) { this.fishing.stop(); this.ui.toast('Reeled in', 1); }

    const lvl = this.level();
    const g0 = groundAt(pl.pos.x, pl.pos.z, S.bridge);
    const depth = lvl - g0;
    let speed = 4.4 * (S.belly <= 0 ? 0.55 : 1) * (depth > 0.12 ? 0.6 : 1) * (1 - 0.18 * this.weather.storm);
    const canMove = !fishing && pl.swing <= 0;
    const want = new THREE.Vector3(inp.x, 0, inp.z).multiplyScalar(canMove ? speed : 0);
    pl.vel.x = damp(pl.vel.x, want.x, 12, dt);
    pl.vel.z = damp(pl.vel.z, want.z, 12, dt);
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (sp > 0.05) {
      const nx = pl.pos.x + pl.vel.x * dt, nz = pl.pos.z + pl.vel.z * dt;
      const g1 = groundAt(nx, nz, S.bridge);
      const stepOk = Math.abs(g1 - g0) < 0.75 || g1 < g0;
      if (stepOk && this.walkable(nx, nz, depth)) { pl.pos.x = nx; pl.pos.z = nz; }
      else if (stepOk && this.walkable(nx, pl.pos.z, depth) && Math.abs(groundAt(nx, pl.pos.z, S.bridge) - g0) < 0.75) pl.pos.x = nx;
      else if (stepOk && this.walkable(pl.pos.x, nz, depth) && Math.abs(groundAt(pl.pos.x, nz, S.bridge) - g0) < 0.75) pl.pos.z = nz;
      else if (depth < 0.1 && !this.blockedT) { this.blockedT = 2.5; if (lvl - groundAt(nx, nz, S.bridge) > WADE_LIMIT) this.ui.toast('Too deep to wade!', 1.2); }
      if (inp.m > 0.1) pl.face += angleDiff(pl.face, Math.atan2(inp.x, inp.z)) * Math.min(1, dt * 14);
    }
    this.blockedT = Math.max(0, (this.blockedT || 0) - dt);
    // push out of solid things
    for (const b of this.blockers()) {
      const dx = pl.pos.x - b.x, dz = pl.pos.z - b.z, d = Math.hypot(dx, dz), min = b.r + 0.35;
      if (d < min && d > 0.0001) { pl.pos.x = b.x + (dx / d) * min; pl.pos.z = b.z + (dz / d) * min; }
    }
    const gy = groundAt(pl.pos.x, pl.pos.z, S.bridge);
    pl.pos.y = damp(pl.pos.y || gy, gy, 18, dt);

    // steps, wading splashes
    if (sp > 0.6) {
      pl.walkT += dt * sp * 2.2;
      pl.stepT -= dt;
      if (pl.stepT <= 0) {
        pl.stepT = 0.34;
        const dd = lvl - gy;
        if (dd > 0.05) { this.audio.play('wade'); this.particles.spawn('splash', new THREE.Vector3(pl.pos.x, lvl, pl.pos.z), 4, 0.8, 1.5); }
        else this.audio.play('step');
      }
    }

    // interact
    const it = fishing ? null : this.findInteraction();
    this.inter = it;
    if (it && it.alt && this.altPressed) it.alt.fn();
    else if (it && this.pressed && pl.swing <= 0) it.fn();
    else if (it && it.tree && this.held && pl.swing <= 0) it.fn();

    // swinging the axe
    if (pl.swing > 0) {
      pl.swing -= dt;
      if (!pl.swingHit && pl.swing < pl.swingLen * 0.45) {
        pl.swingHit = true;
        if (pl.target && pl.target.state === 'up' && Math.hypot(pl.pos.x - pl.target.x, pl.pos.z - pl.target.z) < 2.3) this.hitTree(pl.target);
      }
    }

    // fishing
    if (fishing) {
      ud.rod.updateMatrixWorld(true);
      const tip = ud.tip.getWorldPosition(new THREE.Vector3());
      const ev = this.fishing.update(dt, tip, lvl, this.time, this.held, this.pressed);
      const f = this.fishing;
      if (ev === 'splash') { this.audio.play('splash'); this.particles.spawn('splash', f.spot.clone(), 8, 1, 2); }
      if (ev === 'nibble') this.audio.play('nibble');
      if (ev === 'bite') { this.audio.play('bite'); this.particles.spawn('splash', f.spot.clone(), 10, 1, 2.5); }
      if (ev === 'missed') this.ui.toast('Too slow! Wait for the next bite…', 1.5);
      if (ev === 'reelEmpty') this.ui.toast('Reeled in', 1);
      if (ev === 'hook') this.audio.play('splash');
      if (ev === 'caught') this.catchFish(f.fish);
      if (ev === 'escaped') { this.audio.play('escape'); this.ui.toast('It got away!', 1.6); }
      if (f.state === 'reel') { this.reelTick = (this.reelTick || 0) - dt; if (this.held && this.reelTick <= 0) { this.reelTick = 0.07; this.audio.play('reel'); } }
    }
  }

  updateLamp(dt) {
    const inp = this.moveInput();
    if (inp.m > 0.05) { this.beam.x += inp.x * 22 * dt; this.beam.z += inp.z * 22 * dt; this.mouseMoved = false; }
    else if (this.mouseMoved && (!document.body.classList.contains('is-touch') || this.held)) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(this.mouse, this.camera);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.level()), hit)) {
        this.beam.x = damp(this.beam.x, hit.x, 14, dt); this.beam.z = damp(this.beam.z, hit.z, 14, dt);
      }
    }
    const dx = this.beam.x - LH.x, dz = this.beam.z - LH.z, d = Math.hypot(dx, dz);
    if (d > 100) { this.beam.x = LH.x + (dx / d) * 100; this.beam.z = LH.z + (dz / d) * 100; }
    if (d < 8) { this.beam.x = LH.x + (dx / (d || 1)) * 8; this.beam.z = LH.z + (dz / (d || 1)) * 8; }
    this.beam.on = true;
    this.inter = null;
    if (this.pressed) this.exitLamp();
  }

  updatePickups(dt) {
    const lvl = this.level(), p = this.pl.pos;
    this.pickT -= dt;
    const washed = this.weather.washT > 0;
    if (this.pickT <= 0 && this.pickups.length < (washed ? 22 : 12)) {
      this.pickT = washed ? 0.7 : 2.2;
      for (let tries = 0; tries < 12; tries++) {
        const a = rand(0, Math.PI * 2), r = rand(18, 30);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const hh = heightAt(x, z);
        if (hh < -0.45 || hh > 0.5 || hh < lvl + 0.06) continue;
        if (inDock(x, z) || Math.hypot(x - LH.x, z - LH.z) < 8) continue;
        const roll = Math.random();
        const kind = washed ? (roll < 0.3 ? 'clam' : roll < 0.65 ? 'shell' : 'drift') : (roll < 0.55 ? 'clam' : roll < 0.9 ? 'shell' : 'drift');
        const mesh = makePickup(kind);
        mesh.position.set(x, hh, z);
        mesh.scale.setScalar(0.01);
        this.scene.add(mesh);
        this.pickups.push({ mesh, kind, x, z, h: hh, grow: 0 });
        break;
      }
    }
    for (const pk of [...this.pickups]) {
      pk.grow = Math.min(1, pk.grow + dt * 3);
      pk.mesh.scale.setScalar(pk.washing ? Math.max(0.01, pk.mesh.scale.x - dt * 2) : pk.grow);
      if (pk.kind === 'clam' && Math.random() < dt * 0.4) this.particles.spawn('splash', new THREE.Vector3(pk.x, pk.h + 0.1, pk.z), 1, 0.2, 1.2);
      if (lvl > pk.h + 0.08 && !pk.washing) pk.washing = true;
      if (pk.washing && pk.mesh.scale.x <= 0.02) { this.scene.remove(pk.mesh); this.pickups.splice(this.pickups.indexOf(pk), 1); continue; }
      if (this.mode === 'explore' && !pk.washing && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.0) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(this.pickups.indexOf(pk), 1);
        this.audio.play('pop');
        if (pk.kind === 'clam') { this.S.clams++; this.S.stats.clams++; this.ui.toast(`${ICON.clam} +1 clam`, 1.1); }
        else if (pk.kind === 'shell') { this.S.shells++; this.ui.toast(`${ICON.shell} +1 shell`, 1.1); }
        else { this.S.wood += 2; this.ui.toast(`${ICON.wood} +2 driftwood`, 1.1); }
      }
    }
  }

  // things that animate even while paused/title (water, trees falling, critters)
  updateWorld(dt, playing) {
    const S = this.S;
    const titleClock = DAY * 0.33;
    const clock = this.mode === 'title' ? titleClock : S.clock;
    const t = (clock % DAY) / DAY;
    const focus = this.mode === 'lamp' ? new THREE.Vector3(14, 0, 58) : (this.mode === 'inside' || this.mode === 'tower') ? this.outsidePos : this.pl.pos;
    const wx = this.weather, onTitle = this.mode === 'title';
    this.sky.update(t, dt, focus, onTitle ? null : { cloud: wx.cloud, flash: wx.flash, wind: wx.wind });
    if (onTitle) { wx.rainLines.visible = false; wx.bolt.visible = false; }
    this.audio.setWeather(onTitle ? 0 : wx.rain, onTitle ? 0 : wx.wind, this.mode === 'inside' || this.mode === 'tower');
    const lvl = this.mode === 'title' ? TIDE_MID + 0.1 : this.level();
    const night = this.sky.night;
    const wu = this.water.material.uniforms, pal = this.sky.pal;
    wu.uTime.value = this.time; wu.uLevel.value = lvl;
    wu.uAmp.value = onTitle ? 1 : 1 + wx.wind * 2.2; wu.uChop.value = onTitle ? 0 : wx.wind * 0.8 + wx.rain * 0.3;
    wu.uShallow.value.copy(pal.sh); wu.uDeep.value.copy(pal.dp); wu.uSky.value.copy(pal.hor);
    wu.uSunCol.value.copy(pal.sun).multiplyScalar(0.3 + 0.7 * (1 - night)); wu.uSunDir.value.copy(this.sky.sunDir);
    wu.uFogColor.value.copy(pal.fog);
    wu.uFoam.value.setRGB(1, 1, 1).lerp(pal.sky, night * 0.5).multiplyScalar(1 - night * 0.5);
    const fogNear = this.mode === 'lamp' ? 110 : this.mode === 'sail' ? 110 : 80, fogFar = this.mode === 'lamp' ? 260 : this.mode === 'sail' ? 330 : 240;
    wu.uFogNear.value = fogNear; wu.uFogFar.value = fogFar;
    this.scene.fog.near = fogNear; this.scene.fog.far = fogFar;
    this.water.position.x = Math.round(focus.x / 2) * 2;
    this.water.position.z = Math.round(focus.z / 2) * 2 + 10;

    // lighthouse lamp + beam
    const lh = this.lighthouse;
    lh.glassMat.emissiveIntensity = 0.15 + night * 1.6;
    if (this.mode === 'lamp') {
      lh.beam.visible = true;
      this.aimBeam(this.beam.x, this.beam.z, lvl, 0.22);
      wu.uBeam.value.set(this.beam.x, this.beam.z); wu.uBeamOn.value = 1; wu.uBeamR.value = 7;
    } else if (night > 0.3) {
      const a = this.time * 0.7;
      const bx = LH.x + Math.sin(a) * 40, bz = LH.z + Math.cos(a) * 40;
      lh.beam.visible = true;
      this.aimBeam(bx, bz, lvl, 0.09 * night);
      wu.uBeam.value.set(bx, bz); wu.uBeamOn.value = 0.5 * night; wu.uBeamR.value = 6;
    } else { lh.beam.visible = false; wu.uBeamOn.value = 0; }

    for (const l of this.dock.lamps) l.material.emissiveIntensity = night * 1.6;
    this.cabin.update(this.time, night);
    if (this.mode === 'inside') this.interior.update(this.time, night, t);
    if (this.mode === 'tower') this.tower.update(night);
    this.animateSailboat(dt);
    const lampOn = Math.max(night, onTitle ? 0 : wx.storm * 0.8, onTitle ? 0 : wx.cloud * 0.4);
    for (const isle of this.isles) {
      const I = isle.I;
      isle.group.visible = !onTitle && Math.hypot(focus.x - I.x, focus.z - I.z) < I.R * 1.75 + 250;
      if (!isle.group.visible) continue;
      isle.glowM.emissiveIntensity = lampOn * 1.2;
      for (const l of isle.lamps) l.material.emissiveIntensity = lampOn * 1.6;
      if (isle.blades) isle.blades.rotation.z += dt * (0.35 + wx.wind * 2.6);
      for (const f of isle.floaters) { f.position.y = lvl + Math.sin(this.time * 1.3 + f.position.x) * 0.05 * (1 + wx.wind * 2); f.rotation.z = Math.sin(this.time * 1.1 + f.position.z) * 0.05 * (1 + wx.wind * 2); }
      if (I.id === 'coral' && Math.random() < dt * 8) this.particles.spawn('splash', isle.centre.position.clone().add(new THREE.Vector3(0, 2.7, 0)), 1, 0.6, 1.6);
    }
    if (this.cabin.grow !== undefined) {
      this.cabin.grow = Math.min(1, this.cabin.grow + dt * 1.6);
      const k = this.cabin.grow;
      const e = 1 + Math.sin(k * Math.PI) * 0.12 * (1 - k);
      this.cabin.house.scale.set(e, Math.max(0.01, 1 - Math.pow(1 - k, 3)), e);
      if (k >= 1) { this.cabin.house.scale.set(1, 1, 1); this.cabin.grow = undefined; }
    }

    // fire
    const f = this.fire;
    f.flames.forEach((fl, i) => { const s = 1 + Math.sin(this.time * (9 + i * 3) + i) * 0.12; fl.scale.set(s, 1 + Math.sin(this.time * 7 + i * 2) * 0.2, s); });
    f.light.intensity = (1.5 + night * 5) * (0.85 + Math.sin(this.time * 11) * 0.08 + Math.sin(this.time * 17) * 0.06);
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.45;
      this.particles.spawn('smoke', f.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 1, 0.2, 0.5);
      if (this.cabin.chimney) this.particles.spawn('smoke', this.cabin.root.localToWorld(this.cabin.chimney.clone()), 1, 0.2, 0.5);
    }

    // falling trees and flying logs
    for (const tr of this.trees) {
      if (tr.wob > 0) { tr.wob = Math.max(0, tr.wob - dt * 3); if (tr.state === 'up') tr.top.rotation.z = Math.sin(tr.wob * 20) * 0.05 * tr.wob; }
      else if (tr.state === 'up' && !onTitle) { const sw = wx.wind * (0.02 + wx.storm * 0.05); tr.top.rotation.x = Math.sin(this.time * (1.4 + wx.wind) + tr.x * 0.3) * sw + Math.cos(wx.windDir) * sw; tr.top.rotation.z = Math.sin(this.time * 1.7 + tr.z * 0.3) * sw - Math.sin(wx.windDir) * sw; }
      if (tr.state === 'falling') {
        tr.fall += dt;
        const k = Math.min(1, tr.fall / 0.9);
        tr.top.quaternion.setFromAxisAngle(tr.axis, (Math.PI / 2) * k * k);
        tr.stump.visible = true;
        if (tr.fall > 0.9) {
          const s = Math.max(0.01, 1 - (tr.fall - 0.9) * 2.5);
          tr.top.scale.setScalar(s);
          if (tr.fall > 0.95 && !tr.dusted) { tr.dusted = true; this.particles.spawn('leaf', new THREE.Vector3(tr.x, groundAt(tr.x, tr.z) + 0.5, tr.z).addScaledVector(new THREE.Vector3(-tr.axis.z, 0, tr.axis.x), -2), 14, 2, 2); }
        }
        if (tr.fall > 1.3) {
          tr.dusted = false;
          this.setStump(tr, 110);
          const n = 3 + (S.tools.saw ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const log = makeLog();
            log.position.set(tr.x + rand(-0.6, 0.6), groundAt(tr.x, tr.z) + 0.5, tr.z + rand(-0.6, 0.6));
            this.scene.add(log);
            this.flyLogs.push({ mesh: log, t: -i * 0.12, from: log.position.clone() });
          }
          S.stats.trees++;
        }
      }
    }
    for (const lg of [...this.flyLogs]) {
      lg.t += dt;
      const k = clamp(lg.t / 0.55, 0, 1);
      const to = this.pl.pos.clone().add(new THREE.Vector3(0, 1, 0));
      lg.mesh.position.lerpVectors(lg.from, to, k * k);
      lg.mesh.position.y += Math.sin(k * Math.PI) * 1.5;
      lg.mesh.rotation.x += dt * 8;
      if (k >= 1) {
        this.scene.remove(lg.mesh);
        this.flyLogs.splice(this.flyLogs.indexOf(lg), 1);
        S.wood++;
        this.audio.play('wood');
        if (!this.flyLogs.length) this.ui.toast(`${ICON.wood} +${3 + (S.tools.saw ? 1 : 0)} wood`, 1.4);
      }
    }

    // gulls
    for (const g of this.gulls) {
      const o = g.userData.orbit;
      o.a += o.s * dt;
      g.position.set(o.cx + Math.cos(o.a) * o.r, o.y + Math.sin(this.time * 0.7 + o.r) * 0.6, o.cz + Math.sin(o.a) * o.r);
      g.rotation.y = Math.atan2(-Math.sin(o.a) * Math.sign(o.s), Math.cos(o.a) * Math.sign(o.s));
      g.rotation.z = -Math.sign(o.s) * 0.25;
      const flap = Math.sin(this.time * 9 + o.r) * 0.6;
      g.userData.wings[0].rotation.z = flap; g.userData.wings[1].rotation.z = -flap;
      g.visible = night < 0.7 && (onTitle || wx.storm < 0.5);
    }
    // crabs scuttle along the waterline and run from the keeper
    for (const c of this.crabs) {
      const u = c.userData;
      u.t -= dt;
      const fleeD = Math.hypot(this.pl.pos.x - u.x, this.pl.pos.z - u.z);
      if (u.t <= 0 || fleeD < 2.5) {
        u.t = rand(1.5, 4);
        let a = Math.atan2(u.z, u.x) + rand(-0.25, 0.25);
        if (fleeD < 2.5) a = Math.atan2(u.z, u.x) + Math.sign(Math.random() - 0.5) * 0.3;
        let r = 21;
        for (let k = 0; k < 20; k++) { const hh = heightAt(Math.cos(a) * r, Math.sin(a) * r); if (hh > lvl + 0.15 && hh < 0.9) break; r += hh > 0.9 ? -0.6 : 0.6; }
        u.tx = Math.cos(a) * r; u.tz = Math.sin(a) * r;
      }
      const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
      const moving = d > 0.1;
      if (moving) { const s = Math.min(d, dt * (fleeD < 2.5 ? 4 : 1.4)); u.x += (dx / d) * s; u.z += (dz / d) * s; c.rotation.y = Math.atan2(dx, dz) + Math.PI / 2; }
      c.position.set(u.x, Math.max(heightAt(u.x, u.z), lvl - 0.1) + (moving ? Math.abs(Math.sin(this.time * 18)) * 0.03 : 0), u.z);
    }
    this.particles.update(dt);
    this.audio.update(dt, night > 0.5, lvl);
    this.animatePlayer(dt);
    this.updateCamera(dt);
    if (this.mode !== 'title') this.updateHud();
  }

  aimBeam(x, z, lvl, opacity) {
    const b = this.lighthouse.beam;
    const target = new THREE.Vector3(x, lvl, z);
    const len = b.position.distanceTo(target);
    b.lookAt(target);
    b.scale.set(this.mode === 'lamp' ? 7 : 5, this.mode === 'lamp' ? 7 : 5, len);
    b.material.opacity = opacity;
  }

  animatePlayer(dt) {
    const pl = this.pl, ud = this.player.userData;
    this.player.position.copy(pl.pos);
    this.player.rotation.y = pl.face;
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    const walk = Math.min(1, sp / 3);
    const sw = Math.sin(pl.walkT) * 0.7 * walk;
    ud.legs[0].rotation.x = sw; ud.legs[1].rotation.x = -sw;
    ud.body.position.y = Math.abs(Math.sin(pl.walkT)) * 0.08 * walk + Math.sin(this.time * 2) * 0.01;
    ud.head.rotation.z = Math.sin(this.time * 1.3) * 0.04;
    const fishing = this.fishing.state !== 'idle';
    ud.axe.visible = pl.swing > 0 || (this.inter && this.inter.tree);
    ud.rod.visible = fishing;
    ud.held.visible = pl.held > 0;
    pl.held = Math.max(0, pl.held - dt);
    let armR = -sw, armL = sw;
    if (pl.swing > 0) {
      const k = 1 - pl.swing / pl.swingLen;
      armR = k < 0.45 ? lerp(0, -2.6, k / 0.45) : lerp(-2.6, 0.4, (k - 0.45) / 0.55);
    } else if (fishing) {
      pl.cast = Math.max(0, pl.cast - dt);
      armR = pl.cast > 0 ? lerp(-0.4, -2.4, pl.cast / 0.4) : (this.fishing.state === 'reel' ? -0.9 + Math.sin(this.time * 20) * 0.1 : -0.7);
      armL = -0.6;
    } else if (pl.held > 0) armR = -2.8;
    ud.arms[1].rotation.x = damp(ud.arms[1].rotation.x, armR, 25, dt);
    ud.arms[0].rotation.x = damp(ud.arms[0].rotation.x, armL, 20, dt);
    // wading: sink the legs a bit visually via body tilt
    if (this.mode === 'inside' || this.mode === 'tower') { this.player.position.y = 0; return; }
    if (this.mode === 'sail') {
      const sb = this.sb, fx = Math.sin(sb.heading), fz = Math.cos(sb.heading);
      this.player.position.set(sb.pos.x - fx * 1.0, this.sailboat.position.y + 0.05, sb.pos.z - fz * 1.0);
      this.player.rotation.y = sb.heading;
      ud.legs[0].rotation.x = ud.legs[1].rotation.x = -1.4;
      ud.body.position.y = -0.1;
      return;
    }
    const depth = this.level() - groundAt(pl.pos.x, pl.pos.z, this.S.bridge);
    this.player.position.y = pl.pos.y + Math.min(0, -Math.max(0, depth) * 0.25);
  }

  updateCamera(dt) {
    const cam = this.camera;
    let pos, look;
    if (this.mode === 'title') {
      const a = this.time * 0.05;
      pos = new THREE.Vector3(Math.sin(a) * 60 - 8, 32, Math.cos(a) * 60 + 14);
      look = new THREE.Vector3(-9, 0, 13);
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 2));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 2));
    } else if (this.mode === 'lamp') {
      const portrait = innerWidth < innerHeight;
      pos = portrait ? new THREE.Vector3(16, 92, 20) : new THREE.Vector3(10, 58, 2);
      look = new THREE.Vector3(14, 0, 58);
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 2.5));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 2.5));
    } else if (this.mode === 'sail') {
      const sb = this.sb, z = this.settings.zoom * (innerWidth < innerHeight ? 1.4 : 1);
      look = sb.pos.clone().add(new THREE.Vector3(Math.sin(sb.heading) * 4, 0.5, Math.cos(sb.heading) * 4));
      pos = look.clone().add(new THREE.Vector3(0, 19 * z, 20 * z));
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 3));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 4));
    } else if (this.mode === 'tower') {
      const portrait = innerWidth < innerHeight, k = (portrait ? 1.7 : 1) * this.settings.zoom;
      look = new THREE.Vector3(this.pl.pos.x * 0.3, 0.8, -0.3 + this.pl.pos.z * 0.2);
      pos = new THREE.Vector3(look.x, (3.2 + TOWER_R * 1.5) * k, (TOWER_R + 1.8 + TOWER_R * 1.1) * k);
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 6));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 6));
    } else if (this.mode === 'inside') {
      const I = this.interior, portrait = innerWidth < innerHeight;
      const k = (portrait ? 1.7 : 1) * this.settings.zoom;
      look = new THREE.Vector3(this.pl.pos.x * 0.35, 0.6, -0.4 + this.pl.pos.z * 0.2);
      pos = new THREE.Vector3(look.x, (3.2 + I.d * 0.75) * k, (I.d / 2 + 1.8 + I.d * 0.55) * k);
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 6));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 6));
    } else {
      const z = this.settings.zoom * (innerWidth < innerHeight ? 1.25 : 1);
      look = this.pl.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
      pos = look.clone().add(new THREE.Vector3(0, 12.5 * z, 13.5 * z));
      this.camPos.lerp(pos, 1 - Math.exp(-dt * 5));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 7));
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  updateHud() {
    const S = this.S, ui = this.ui;
    const ti = this.tideInfo();
    const goal = GOALS.find((g) => !S.goals[g.id]);
    const wx = this.weather;
    const icon = WEATHER_ICON[wx.state] === 'sun' ? (this.isNight() ? ICON.moon : ICON.sun) : WEATHER_ICON[wx.state];
    const windWord = wx.wind > 0.8 ? 'gale' : wx.wind > 0.5 ? 'breezy' : 'calm';
    const surge = wx.surge > 0.08 ? ` · sea +${wx.surge.toFixed(1)}m` : '';
    const arrow = Math.atan2(Math.cos(wx.windDir), Math.sin(wx.windDir)) * 180 / Math.PI;
    ui.hud(S, { goal: goal?.text, clock: this.clockText(), day: Math.floor(S.clock / DAY) + 1, night: this.isNight(), tide: clamp((this.level() + 0.45) / 1.45, 0, 1), rising: ti.rising, tideText: ti.text + surge,
      wx: { state: wx.state, icon, label: `${wx.name} · ${windWord}`, arrow } });
    // prompt
    const touch = document.body.classList.contains('is-touch');
    if (this.mode === 'inside' && this.placing) ui.prompt(`Place the ${FURNITURE[this.placing.id].name}`, touch ? 'USE' : 'E', FURNITURE[this.placing.id].wall ? null : { key: touch ? '⟳' : 'R', text: 'Rotate' });
    else if (this.mode === 'inside' || this.mode === 'tower' || this.mode === 'sail') ui.prompt(this.inter ? this.inter.text : null, touch ? 'USE' : 'E', this.inter && this.inter.alt);
    else if (this.mode === 'lamp') ui.prompt('Climb down', touch ? 'USE' : 'E');
    else if (this.fishing.state === 'wait') ui.prompt('Wait for a bite… (E reels in)', 'E');
    else if (this.fishing.state === 'bite') ui.prompt('BITE! Press now!', 'E');
    else if (this.fishing.state === 'reel') ui.prompt('Hold to reel · keep the fish in the green', 'E');
    else ui.prompt(this.inter ? this.inter.text : null, touch ? 'USE' : 'E', this.inter && this.inter.alt);
    ui.reel(this.fishing.state === 'reel' ? this.fishing : null);
    // banner for night boats
    const waiting = this.harbor.waiting;
    ui.miniOn(this.mode === 'sail');
    if (this.mode === 'sail') this.drawMinimap();
    if (this.mode === 'tower') ui.banner(touch ? 'The lighthouse · stairs go up to the lamp · walk out the door to leave' : 'The lighthouse · the stairs go up to the lamp · <b>Q</b> go outside');
    else if (this.mode === 'sail') ui.banner(this.inter ? null : 'Sailing · sail up beside any pier to tie up');
    else if (this.mode === 'inside') ui.banner(this.placing ? (touch ? 'Tap the floor or walk to choose a spot' : 'Point with the mouse or walk · R rotate · Esc put it away') : (touch ? 'Home sweet home · 🛠 make furniture · walk out the door to leave' : 'Home sweet home · <b>B</b> make furniture · <b>Q</b> go outside'));
    else if (waiting.length && this.mode !== 'lamp') ui.banner(`${ICON.boat} ${waiting.length === 1 ? 'A boat is' : waiting.length + ' boats are'} waiting at sea. Go to the lighthouse!${!S.bridge && this.level() > CAUSE.ridge + WADE_LIMIT ? ' (The tide is over the sandbar.)' : ''}`);
    else if (this.mode === 'lamp') ui.banner(waiting.length ? `Point the beam at a boat and lead it to the dock · ${waiting.length} waiting` : (this.isNight() ? 'No boats waiting right now' : 'Boats only need the lamp at night'));
    else ui.banner(null);

    // world labels
    const w = innerWidth, h = innerHeight, cam = this.camera;
    ui.beginLabels();
    if (this.mode === 'inside' || this.mode === 'tower') { ui.endLabels(); return; }
    for (const isle of this.isles) {
      const d = Math.hypot(this.pl.pos.x - isle.I.x, this.pl.pos.z - isle.I.z);
      if (d < 460 && this.mode !== 'lamp') ui.label('isle' + isle.I.id, new THREE.Vector3(isle.I.x, 9, isle.I.z), `${isle.I.name} · ${isle.T.kind}`, '', cam, w, h);
      if (isle.group.visible) for (const v of isle.villagers) if (v.sayT > 0) ui.label('say' + v.name + isle.I.id, new THREE.Vector3(v.x, heightAt(v.x, v.z) + 2.5, v.z), `<b>${v.name}:</b> ${v.say}`, 'speech', cam, w, h);
      if (d < 25 && this.mode === 'explore') ui.label('npc' + isle.I.id, new THREE.Vector3(isle.npcPos.x, heightAt(isle.npcPos.x, isle.npcPos.z) + 2.4, isle.npcPos.z), isle.T.who, '', cam, w, h);
    }
    if (this.mode === 'sail' && Math.hypot(this.pl.pos.x, this.pl.pos.z) > 45) ui.label('home', new THREE.Vector3(0, 8, 0), 'Home', '', cam, w, h);
    if (!this.S.boat && Math.hypot(this.pl.pos.x - BOATYARD.x, this.pl.pos.z - BOATYARD.z) < 12) ui.label('yard', new THREE.Vector3(BOATYARD.x, 2.6, BOATYARD.z), `Boatyard · ${ICON.wood}40 ${ICON.coin}30`, '', cam, w, h);
    for (const b of this.harbor.boats) {
      const p = b.mesh.position.clone().add(new THREE.Vector3(0, 4.2, 0));
      if (b.state === 'waiting') ui.label('b' + b.type + b.pos.x.toFixed(0), p, `${b.T.name} · waiting ${fmtTime(b.timer)}`, 'alert', cam, w, h);
      else if (b.state === 'guided') ui.label('b' + b.type, p, `${b.T.name} ${'●'.repeat(3 - b.damage)}${'○'.repeat(b.damage)}`, '', cam, w, h);
      else if (b.state === 'mooring') ui.label('b' + b.type, p, `Tie me up! ${fmtTime(b.timer)}`, 'alert', cam, w, h);
      else if (b.state === 'moored') ui.label('b' + b.type, p, `${b.T.name} · leaves in ${fmtTime(b.timer)}`, '', cam, w, h);
      else if (b.state === 'queue') ui.label('b' + b.type, p, `${b.T.name} · waiting for the berth`, '', cam, w, h);
    }
    const berth = this.harbor.berth;
    if (berth && berth.state === 'mooring') ui.label('bollard', new THREE.Vector3(BOLLARD.x, DOCK.y + 1.4, BOLLARD.z), '!', 'bang', cam, w, h);
    if (this.fishing.state === 'bite') ui.label('bite', this.fishing.bobber.position.clone().add(new THREE.Vector3(0, 1, 0)), '!', 'bang', cam, w, h);
    if (!S.bridge && Math.hypot(this.pl.pos.x - BRIDGE_SIGN.x, this.pl.pos.z - BRIDGE_SIGN.z) < 12) ui.label('sign', new THREE.Vector3(BRIDGE_SIGN.x, 2.6, BRIDGE_SIGN.z), `Bridge · ${ICON.wood}20`, '', cam, w, h);
    if (waiting.length && this.mode === 'explore') ui.label('lh', new THREE.Vector3(LH.x, 13.5, LH.z), 'Light the lamp!', 'alert', cam, w, h);
    ui.endLabels();
  }

  render() {
    this.renderer.render(this.mode === 'inside' ? this.interior.scene : this.mode === 'tower' ? this.tower.scene : this.scene, this.camera);
  }
}

new Game();
