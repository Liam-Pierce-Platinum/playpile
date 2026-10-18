// IRONSIGHT - main loop and game orchestration: renderer + post (world pass, weapon pass with its
// own FOV and cleared depth, bloom, SMAA, film grade + scope picture), map loading, matches (Free for
// all / Team deathmatch with bots, offline or online through game.net) and the Firing Range, damage
// routing (dealDamage), throwables, input, settings, menus and the headless test API (window.__game).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { setAnisotropy, setLoading, loadStep, loadError, clearMaterialCache, hdr } from './core/assets.js';
import { World, SURF } from './world/world.js';
import { MapBuilder } from './world/builder.js';
import { applyEnvironment, followSun } from './world/env.js';
import { LightPool } from './render/lightpool.js';
import { ContactShadows } from './render/contact.js';
import { makePuddleTexture, Ripples, wetUniforms, PlanarReflection, reflectionOverlay, LAYER_REFLECTOR } from './render/wet.js';
import { ViewModel } from './game/viewmodel.js';
import { interiorMaterial } from './render/interiors.js';
import { Player } from './game/player.js';
import { Weapons } from './game/weapons.js';
import { Ballistics } from './game/ballistics.js';
import { FX } from './game/fx.js';
import { Audio } from './game/audio.js';
import { NPCManager, DIFFICULTY } from './game/npc.js';
import { Armory, defaultConfig, buildWeapon } from './game/manifest.js';
import { HUD } from './ui/hud.js';
import { Grenades, THROWABLES } from './game/grenades.js';
import { Match, MODES, BOT_NAMES, PROTECT, TEAM_NAME, esc } from './game/match.js';
import { Net } from './game/net.js';
import { Gunsmith, loadLoadouts } from './ui/gunsmith.js';
import city from './maps/city.js';
import desert from './maps/desert.js';
import docks from './maps/docks.js';
import office from './maps/office.js';
import range from './maps/range.js';

// four maps reworked for 10-player fights (three lanes, opposite team spawns); fewer, better maps
export const MAPS = [city, office, docks, desert];
const ALL_MAPS = { city, desert, docks, office, range };
const params = new URLSearchParams(location.search);
const clsName = c => ({ ar: 'Rifle', smg: 'SMG', sniper: 'Sniper', dmr: 'DMR', shotgun: 'Shotgun', pistol: 'Pistol' }[c] || 'Rifle');
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- settings
const SETTINGS_KEY = 'ironsight.settings.v1';
const DEFAULTS = { sens: 1.0, adsSens: 0.8, fov: 90, vmFov: 54, quality: 2, volume: 0.8, invert: false, showFps: false };
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; } }
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }

// built-in classes (lethal + tactical included); the gunsmith's saved presets come first in the list
export const PRESETS = [
  { id: 'custom', name: 'Custom (Gunsmith)' },
  // ids are armory guns / attachments; anything a gun cannot mount falls back in validateConfig. Old ids
  // (m4, ak, mp5...) still resolve through Armory.gun for saved URLs and the test API.
  { id: 'm4', name: 'Assault', p: 'ar14', s: 'p9', o: { optic: 'holo', muzzle: 'compensator', laser: 'laser_box', underbarrel: 'vgrip' }, lethal: 'frag', tactical: 'flash' },
  { id: 'mp5', name: 'CQB', p: 'vx9', s: 'p9', o: { optic: 'reddot', muzzle: 'suppressor', laser: 'laser_compact', underbarrel: 'agrip' }, lethal: 'semtex', tactical: 'flash' },
  { id: 'acog', name: 'Rifleman', p: 'ar14', s: 'p9', o: { optic: 'acog', muzzle: 'flashhider', underbarrel: 'vgrip', stock: 'stock_precision' }, lethal: 'frag', tactical: 'smoke' },
  { id: 'dmr', name: 'Marksman', p: 'm38', s: 'p9', o: { optic: 'prism3x', muzzle: 'brake' }, lethal: 'frag', tactical: 'smoke' },
  { id: 'm700', name: 'Sniper', p: 'lr338', s: 'p9', o: { optic: 'scope8x', muzzle: 'suppressor' }, lethal: 'semtex', tactical: 'smoke' },
  { id: 'm870', name: 'Breacher', p: 'h12', s: 'p9', o: { optic: 'reddot', laser: 'laser_compact' }, lethal: 'frag', tactical: 'flash' },
];
export const presetConfigs = pr => ({ primary: { ...defaultConfig(pr.p), ...pr.o }, secondary: defaultConfig(pr.s), lethal: pr.lethal || 'frag', tactical: pr.tactical || 'flash' });
const presetLabel = p => p.p ? `${p.name}  ·  ${Armory.gun(p.p)?.name || p.p} + ${Armory.gun(p.s)?.name || p.s}` : p.name;

// ---------------------------------------------------------------- input
class Input {
  constructor(canvas) {
    this.keys = new Set(); this.down = new Set(); this.mouse = { dx: 0, dy: 0, l: false, r: false, lp: false, rp: false, wheel: 0 };
    this.locked = false; this.canvas = canvas;
    addEventListener('keydown', e => { if (e.repeat) return; this.keys.add(e.code); this.down.add(e.code); if (['Space', 'Tab'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('mousedown', e => { if (!this.locked) return; if (e.button === 0) { this.mouse.l = true; this.mouse.lp = true; } if (e.button === 2) { this.mouse.r = true; this.mouse.rp = true; } });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('mousemove', e => { if (!this.locked) return; this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; });
    addEventListener('wheel', e => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked) { this.mouse.l = this.mouse.r = false; this.keys.clear(); if (this.onUnlock) this.onUnlock(); } });
  }
  lock() { try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); } catch (e) { this.canvas.requestPointerLock(); } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  pressed(c) { return this.down.has(c); }
  endFrame() { this.down.clear(); this.mouse.dx = this.mouse.dy = 0; this.mouse.lp = this.mouse.rp = false; this.mouse.wheel = 0; }
}

// ---------------------------------------------------------------- game
class Game {
  constructor() {
    this.settings = loadSettings();
    this.quality = +(params.get('q') ?? this.settings.quality);
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(devicePixelRatio, this.quality >= 3 ? 1.5 : this.quality === 0 ? 0.75 : 1));
    r.setSize(innerWidth, innerHeight);
    r.info.autoReset = false; r.debug.checkShaderErrors = params.has('debug'); r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    document.body.appendChild(r.domElement);
    setAnisotropy(r.capabilities.getMaxAnisotropy());
    RectAreaLightUniformsLib.init();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 2500);
    this.camera.layers.enable(LAYER_REFLECTOR);
    this.scene.add(this.camera);
    this.input = new Input(r.domElement);
    this.audio = new Audio(); this.audio.setVolume(this.settings.volume);
    this.vm = new ViewModel(r); this.vm.fov = this.settings.vmFov;
    this.hud = new HUD();
    this.player = new Player();
    this.ballistics = new Ballistics(this);
    this.weapons = new Weapons(this);
    this.contact = new ContactShadows(this.scene, 2500, 0.55);
    this.fx = new FX(this.scene, null);
    this.npcs = new NPCManager(this.scene, null, this.fx, this.audio);
    // radio: only your own team's soldiers are on your net
    this.npcs.callout = (text, npc) => { if (this.match?.tdm && npc.team === this.player.team && npc.state !== 'puppet' && npc.pos.distanceTo(this.player.pos) < 60) { this.hud.callout(text, npc.name); this.audio.radio(); } };
    this.npcs.onKill = (npc, zone, killer) => this.onKill(npc, zone, killer);
    this.npcs.onShot = (n, from, dir) => { n.protUntil = 0; this.net?.botShot(n, from, dir); };
    const P = this.player; P.isPlayer = true; P.id = 'me'; P.name = 'You'; P.team = 'A';
    Object.defineProperty(P, 'alive', { get() { return !this.dead; } });
    this.gunsmith = new Gunsmith(this);
    this.grenades = new Grenades(this);
    this.state = 'boot'; this.map = null; this.mode = 'ffa'; this.diff = 1; this.match = null; this.net = null; this.flashV = 0;
    this.time = 0; this.recentShot = 0; this.stats = { shots: 0, hits: 0, kills: 0, heads: 0, t0: 0 };
    this.mapObjects = []; this.pools = [];
    this.buildPost();
    this.bindUI();
    addEventListener('resize', () => this.resize());
    this.input.onUnlock = () => { if (this.state === 'play' && !this.testMode) this.pause(true); };
    this.clock = performance.now();
    this.fpsAcc = 0; this.fpsN = 0;
  }
  // ---------------------------------------------------------------- post
  buildPost() {
    const r = this.renderer;
    this.rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 0 });
    const c = this.composer = new EffectComposer(r, this.rt);
    this.mainPass = new RenderPass(this.scene, this.camera);
    this.vmPass = new RenderPass(this.vm.scene, this.vm.cam); this.vmPass.clear = false; this.vmPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.35, 1.6);
    { const bs = this.bloom.setSize.bind(this.bloom); this.bloom.setSize = (w, h) => bs(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); }   // half-res bloom: same look, a third of the cost
    c.addPass(this.mainPass); c.addPass(this.vmPass);
    if (this.quality >= 1) c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.smaa = new SMAAPass(); c.addPass(this.smaa);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uHurt: { value: 0 }, uSupp: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uAds: { value: 0 },
        uScope: { value: 0 }, uRet: { value: 0 }, uIllum: { value: new THREE.Color(1, 0.15, 0.08) }, uScopeOff: { value: new THREE.Vector2() }, uFlash: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uTime, uHurt, uSupp, uAds, uScope, uRet, uFlash; uniform vec2 uRes, uScopeOff; uniform vec3 uTint, uIllum; varying vec2 vUv;
        // reticle line of w pixels (u = reticle units per pixel)
        float ln(float d, float w, float u){ return 1.0 - smoothstep(w * 0.5 * u, (w * 0.5 + 1.0) * u, abs(d)); }
        float seg(vec2 r, vec2 a, vec2 b, float w, float u){ vec2 pa = r - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return ln(length(pa - ba * h), w, u); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec2 c = vUv - 0.5; float r2 = dot(c, c);
          vec2 off = c * r2 * (0.004 + uSupp * 0.012);
          vec3 col;
          col.r = texture2D(tDiffuse, vUv - off).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv + off).b;
          // suppression: blur toward the edges
          if (uSupp > 0.01) { vec3 b = vec3(0.0); for (int i = 0; i < 6; i++) { float a = float(i) * 1.047; b += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * 0.006 * uSupp * (0.3 + r2 * 3.0)).rgb; } col = mix(col, b / 6.0, clamp(uSupp * r2 * 5.0, 0.0, 0.8)); }
          float l = dot(col, vec3(0.299,0.587,0.114));
          col = mix(col, col*vec3(0.94,0.98,1.06), smoothstep(0.35, 0.0, l)*0.5);
          col *= uTint;
          col = mix(col, vec3(l), uSupp * 0.35 + uHurt * 0.25);
          col *= mix(1.0, 0.6, smoothstep(0.14, 0.7, r2*1.6 + uSupp*0.3 + uAds*0.08) * (1.0 - uScope));
          // full-screen scope picture (magnified optics, fully aimed): the world is already zoomed by the
          // camera, so the image is full resolution and sharp; a thin tube ring, a light edge falloff and a
          // pixel-exact reticle are drawn here
          if (uScope > 0.001) {
            vec2 q = (vUv - 0.5) * uRes - uScopeOff; float R = 0.475 * uRes.y, d = length(q), u = 1.0 / R;
            vec2 r = q / R; float ret = 0.0, il = 0.0;
            if (uRet < 0.5) {            // 8x mil-dot: fine centre, heavy outer posts, dots every mil
              ret += ln(r.y, 1.4, u) * step(abs(r.x), 0.55) + ln(r.y, 5.0, u) * step(0.55, abs(r.x));
              ret += ln(r.x, 1.4, u) * step(abs(r.y), 0.55) + ln(r.x, 5.0, u) * step(0.55, abs(r.y));
              for (int i = 1; i < 6; i++) { float f = float(i) * 0.1; ret += 1.0 - smoothstep(2.6 * u, 3.6 * u, min(min(length(r - vec2(f, 0.0)), length(r + vec2(f, 0.0))), min(length(r - vec2(0.0, f)), length(r + vec2(0.0, f))))); }
              il = 1.0 - smoothstep(1.5 * u, 2.5 * u, d / R);
            } else if (uRet < 1.5) {     // ACOG / prism: lit chevron, drop stadia below
              il += seg(r, vec2(0.0, 0.0), vec2(-0.06, -0.07), 2.4, u) + seg(r, vec2(0.0, 0.0), vec2(0.06, -0.07), 2.4, u);
              ret += ln(r.x, 1.6, u) * step(r.y, -0.1) * step(-0.75, r.y);
              for (int i = 1; i < 6; i++) { float y = -0.1 - float(i) * 0.1; ret += ln(r.y - y, 1.6, u) * step(abs(r.x), 0.07 - float(i) * 0.009); }
              ret += ln(r.y, 1.6, u) * step(0.55, abs(r.x));
            } else {                     // 2x / LPVO: lit dot in a thin circle, stadia outside
              il += 1.0 - smoothstep(2.5 * u, 3.5 * u, d / R); il += ln(length(r) - 0.22, 1.6, u);
              ret += ln(r.y, 1.6, u) * step(0.32, abs(r.x)) + ln(r.x, 1.6, u) * step(r.y, -0.32);
            }
            vec3 sc = col * (1.0 - 0.28 * smoothstep(0.8, 1.0, d / R));
            sc = mix(sc, vec3(0.01), clamp(ret, 0.0, 1.0));
            sc = mix(sc, uIllum * 1.4, clamp(il, 0.0, 1.0));
            float inside = smoothstep(R + 1.5, R - 1.5, d);
            vec3 tube = mix(vec3(0.07, 0.072, 0.075), vec3(0.012), smoothstep(R, R * 1.05, d));
            col = mix(col, mix(tube, sc, inside), uScope);
          }
          col = mix(col, vec3(1.0), uFlash);
          col += (h(vUv*uRes + fract(uTime*37.0)*100.0) - 0.5) * 0.022;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    c.addPass(this.grade);
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vm.cam.aspect = w / h; this.vm.cam.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
    if (this.refl) this.refl.setSize(w * pr, h * pr);
  }
  vfov(hdeg) { return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hdeg) / 2) / (16 / 9))); }
  // ---------------------------------------------------------------- map loading
  disposeMap() {
    if (this.builder) { this.scene.remove(this.builder.group); this.builder.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    for (const o of this.mapObjects) { this.scene.remove(o); if (o.target) this.scene.remove(o.target); }
    for (const p of this.pools) for (const l of p.real) { this.scene.remove(l); if (l.target) this.scene.remove(l.target); }
    if (this.env?.sky) this.scene.remove(this.env.sky);
    if (this.env?.weather) this.env.weather.dispose(this.scene);
    if (this.reflMeshes) this.reflMeshes.forEach(m => this.scene.remove(m));
    this.mapObjects = []; this.pools = []; this.refl = null; this.reflMeshes = null; this.ripples = null;
    this.npcs.clear(); this.fx.clear(); this.ballistics.clear(); this.grenades.clear();
    this.contact.mesh.count = 0;
  }
  // mode 'menu' builds only the scene behind the main menu (no NPC models, no weapons): the menu shows
  // as soon as the city stands. A deploy onto the map the menu already built (and nothing played on it)
  // reuses it and only loads hostiles + loadout.
  async loadMap(id, mode = 'elim', diff = 1) {
    const def = ALL_MAPS[id] || city;
    const reuse = mode !== 'menu' && this.menuPristine && this.map === def && !!this.world;
    this.menuPristine = false;
    setLoading(true, mode === 'menu' ? 'Tactical shooter' : (mode === 'range' ? 'Firing range' : 'Deploying  ·  ' + def.name));
    this.state = 'loading';
    if (reuse) { this.npcs.clear(); this.fx.clear(); this.ballistics.clear(); this.grenades.clear(); this.mode = mode; this.diff = diff; }
    else await this.buildMap(def, id, mode, diff);
    const B = this.builder, data = this.mapData, world = this.world;
    // spawn player
    const sp = data.playerSpawns[0];
    this.player.spawn(sp[0], sp[1], sp[2], sp[3]);
    this.player.maxHealth = 100; this.player.health = 100;
    if (mode !== 'menu') {
      // npcs
      loadStep(mode === 'range' ? 'Setting up targets' : 'Deploying hostiles', 0.62, 0.8);
      await this.loadNpcs();
      this.npcs.setDifficulty(diff);
      this.startMode();
      // weapons
      loadStep('Arming loadout', 0.8, 0.9);
      await this.equipLoadout();
    }
    // reflection probe: glass, paint and window panes reflect this map, not the borrowed HDRI
    if (!reuse && (this.winMat || def.env.probe)) {
      const cubeRT = this.cubeRT || (this.cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }));
      const cc = new THREE.CubeCamera(0.5, 900, cubeRT); const p = def.env.probe || [sp[0], 4, sp[2]]; cc.position.set(p[0], p[1], p[2]);
      this.scene.updateMatrixWorld(); for (const pl of this.pools) pl.update(this.camera);
      if (this.winMat) this.winMat.visible = false;
      cc.update(this.renderer, this.scene);
      if (this.winMat) { this.winMat.visible = true; this.winMat.uniforms.tEnvCube.value = cubeRT.texture; }
    }
    // compile shaders off the critical path
    loadStep('Compiling shaders', 0.9, 0.99);
    if (mode === 'menu') this.menuCamera(0); else this.updateCamera(0);
    for (const p of this.pools) p.update(this.camera);
    try { await this.renderer.compileAsync(this.scene, this.camera); if (mode !== 'menu') await this.renderer.compileAsync(this.vm.scene, this.vm.cam); } catch (e) { console.warn(e); }
    if (mode === 'menu') this.menuPristine = true;
    setLoading(false);
    console.log('[game] map ' + def.id + (reuse ? ' (reused)' : '') + ' ready: ' + world.boxes.length + ' boxes, ' + (world.cover?.length || 0) + ' cover points, ' + this.npcs.list.length + ' npcs');
  }
  loadNpcs() { return this.npcLoad || (this.npcLoad = this.npcs.load().catch(e => { this.npcLoad = null; throw e; })); }
  async buildMap(def, id, mode, diff) {
    loadStep('Syncing armory', 0.02, 0.05);
    this.disposeMap();
    clearMaterialCache();
    await Armory.refresh();
    loadStep('Building ' + def.name, 0.05, 0.45);
    const world = this.world = new World(); world.bounds = { ...def.bounds };
    const B = this.builder = new MapBuilder(this.scene, world, id.length * 7919);
    B.useInteriors = def.env.interiors !== false;
    const data = await def.build(B);
    // match data: team spawn zones on opposite sides + roam points (lanes) for hunting bots
    if (!data.spawns) data.spawns = { A: data.playerSpawns, B: data.waveSpawns?.length ? data.waveSpawns.map(p => [p[0], p[1], p[2], Math.atan2(p[0], p[2])]) : data.playerSpawns };
    if (!data.roam) data.roam = [...data.spawns.A, ...data.spawns.B, ...(data.squads || []).map(s => s.pos)];
    world.build();
    await B.finish(this.contact);
    loadStep('Navigation and cover', 0.45, 0.5);
    world.build();
    world.buildNav(0.5, 0.3);
    world.buildCover();
    loadStep('Lighting and weather', 0.5, 0.62);
    this.env = await applyEnvironment(this, def.env);
    if (def.env.bgHdri) { const bg = await hdr('hdri/' + def.env.bgHdri + '.hdr'); bg.mapping = THREE.EquirectangularReflectionMapping; this.scene.background = bg; this.scene.backgroundIntensity = def.env.bgI ?? 1; this.scene.backgroundRotation.y = def.env.envRot || 0; }
    this.mapObjects.push(...this.env.objects);
    if (B.windows.length) {
      this.winMat = interiorMaterial(this.env.hdr);
      this.winMat.uniforms.uLitFrac.value = def.env.litFrac ?? 0.38; this.winMat.uniforms.uEnvI.value = def.env.winEnvI ?? 0.4;
      const wm = B.windowMesh(this.winMat); wm.updateMatrixWorld();
    } else this.winMat = null;
    this.vm.setLighting(this.env.sun ? this.env.sun.userData.dir : new THREE.Vector3(0.3, 1, 0.2), this.env.sun ? this.env.sun.color : 0xffffff, this.env.sun ? Math.min(2.5, this.env.sun.intensity) * 0.8 : 0.5,
      def.env.hemi.sky, def.env.hemi.ground, def.env.hemi.i * 1.4 + 0.15, this.env.envMap, (def.env.envI ?? 1) * 0.9);
    // light pools (fixed real lights, many virtual)
    const Q = { lamps: 0, shadows: 0, points: 4, rects: 0, ...(def.env.pools || {}) };
    if (B.lamps.length && Q.lamps) {
      const lp = new LightPool(this.scene, Q.lamps, () => new THREE.SpotLight(0xffffff, 0, 34, 1.0, 0.75, 2), (r, v, w) => { r.position.copy(v.pos); r.target.position.copy(v.target); r.color.copy(v.color); r.intensity = v.intensity * w; });
      lp.real.slice(0, this.quality >= 1 ? Q.shadows : 0).forEach(s => { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.camera.near = 0.3; s.shadow.camera.far = 30; s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03; });
      B.lamps.forEach(v => lp.add(v)); this.pools.push(lp);
    }
    if (Q.points) { const pp = new LightPool(this.scene, Q.points, () => new THREE.PointLight(0xffffff, 0, 10, 2), (r, v, w) => { r.position.copy(v.pos); r.color.copy(v.color); r.intensity = v.intensity * w; r.distance = v.distance; }); B.points.forEach(v => pp.add(v)); this.pools.push(pp); }
    if (Q.rects && B.rects.length) { const rp = new LightPool(this.scene, Q.rects, () => new THREE.RectAreaLight(0xffffff, 0, 1, 1), (r, v, w) => { r.position.copy(v.pos); r.lookAt(v.look); r.width = v.w; r.height = v.h; r.color.copy(v.color); r.intensity = v.intensity * w; }); B.rects.forEach(v => rp.add(v)); this.pools.push(rp); }
    // wet streets: puddle mask, ripples, planar reflection overlays
    if (def.env.wet) {
      wetUniforms.tPuddle.value = wetUniforms.tPuddle.value || makePuddleTexture();
      this.ripples = this.ripples || new Ripples(512); wetUniforms.tRipple.value = this.ripples.texture;
      if (this.quality >= 2 && B.reflect) {
        this.refl = new PlanarReflection(0, 0.33);
        const pr = this.renderer.getPixelRatio(); this.refl.setSize(innerWidth * pr, innerHeight * pr);
        const pg = (rects, y) => { const pos = [], idx = []; for (const [x0, x1, z0, z1] of rects) { const b = pos.length / 3; pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; };
        this.reflMeshes = [reflectionOverlay(this.refl, pg(B.reflect.road, 0.002), { puddle: 0.585, gutter: true, wetRefl: 0.5, fog: this.scene.fog }), reflectionOverlay(this.refl, pg(B.reflect.walk, 0.152), { puddle: 0.64, wetRefl: 0.32, fog: this.scene.fog, planeY: 0 })];
        this.reflMeshes.forEach(m => this.scene.add(m));
      }
    }
    this.audio.setEnvironment(def.env.audio || 'urban');
    this.fx.setWorld(world); this.npcs.world = world;
    this.map = def; this.mapData = data; this.mode = mode; this.diff = diff;
    // static scene graph: bake matrices once
    B.group.traverse(o => { o.updateMatrix(); o.updateMatrixWorld(true); o.matrixAutoUpdate = false; });
  }
  // the loadout behind an id: 'custom' = the gunsmith's current build, 'p:<n>' = a saved gunsmith preset,
  // anything else = a built-in class
  loadoutFor(sel) {
    if (sel === 'custom' || !sel) return loadLoadouts();
    if (sel.startsWith('p:')) { const pr = loadLoadouts().presets?.[+sel.slice(2)]; if (pr) return pr; }
    return presetConfigs(PRESETS.find(x => x.id === sel) || PRESETS[1]);
  }
  async equipLoadout() {
    const L = { ...this.loadoutFor(this.loadoutId || 'custom') };
    if (this.overrideLoadout) { L.primary = this.overrideLoadout.primary || L.primary; L.secondary = this.overrideLoadout.secondary || L.secondary; }
    this.kit = { lethal: L.lethal || 'frag', tactical: L.tactical || 'flash' };
    await this.weapons.setLoadout([L.primary, L.secondary], { infinite: this.mode === 'range' });
    this.refillKit();
    this.net?.sendLoadout(L);
  }
  refillKit() { this.nades = { lethal: this.mode === 'range' ? 99 : 1, tactical: this.mode === 'range' ? 99 : 2 }; this.hud.nades(this.kit, this.nades); }
  startMode() {
    this.grenades.clear(); this.ended = false; this.deathHandled = false; this.roundTok = (this.roundTok || 0) + 1;
    this.stats = { shots: 0, hits: 0, kills: 0, heads: 0, t0: this.time };
    this.match = null; this.flashV = 0; this.player.protUntil = 0;
    this.hud.board(null);
    if (this.mode === 'range') {
      this.player.team = 'A';
      for (const [x, z] of this.mapData.dummies || []) this.spawnDummy(x, z);
      this.hud.objective('Firing range', 'G: gunsmith · targets respawn · steel plates ring on hit'); this.hud.matchbar(null); this.hud.score(null);
      return;
    }
    // 10 combatants. Online, the lobby decides who is who (net.setupMatch); offline: you + 9 bots
    const M = this.match = new Match(this, this.mode);
    if (this.net) { this.net.setupMatch(M); }
    else {
      const tdm = M.tdm, names = BOT_NAMES.slice().sort(() => Math.random() - 0.5); this.player.id = 'me';
      this.player.team = tdm ? 'A' : 'me';
      M.add(this.player, { name: 'You', team: this.player.team, local: true });
      for (let i = 0; i < 9; i++) this.addBot('bot' + i, names[i], tdm ? (i < 4 ? 'A' : 'B') : 'bot' + i);
      const sp = M.pickSpawn(this.player.team); this.player.spawn(sp[0], sp[1], sp[2], sp[3]);
    }
    this.player.protUntil = this.time + PROTECT;
    this.hud.objective(MODES[this.mode].name, (M.tdm ? 'Team ' + TEAM_NAME[this.player.team] + ' · ' : '') + 'first to ' + M.limit.toLocaleString() + ' points · Tab: leaderboard · L: loadout');
    this.hud.score(0); this.myScore = 0;
  }
  // a bot: a soldier with a team, a name, a real gunsmith build (attachments + camo) and a tactical
  addBot(id, name, team, o = {}) {
    const M = this.match, sp = o.spawn || M.pickSpawn(team);
    const pr = PRESETS[1 + Math.floor(Math.random() * (PRESETS.length - 1))], L = presetConfigs(pr);
    const camos = Armory.m.camos; L.primary.camo = camos[Math.floor(Math.random() * camos.length)].id;
    const n = this.npcs.spawn({ pos: [sp[0], sp[1], sp[2]], yaw: sp[3] + Math.PI, squad: M.tdm ? 'team' + team : id, team, id, name, gun: L.primary, tac: L.tactical, state: o.puppet ? 'puppet' : 'patrol' });
    n.isPuppet = !!o.puppet; n.cfgWanted = L.primary; n.nades = { frag: 1, tac: 1 }; n.nadeCD = 3 + Math.random() * 5;
    M.add(n, { name, team, bot: !o.human, remote: !!o.remote });
    if (M.tdm && team === this.player.team) this.teamMarker(n);
    n.protUntil = this.time + PROTECT;
    return n;
  }
  teamMarker(n) {
    if (n.marker) return;
    if (!this.markerMat) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#5fb6ff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.beginPath(); g.moveTo(14, 18); g.lineTo(50, 18); g.lineTo(32, 46); g.closePath(); g.stroke(); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.markerMat = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }); }
    const s = new THREE.Sprite(this.markerMat); s.scale.set(0.022, 0.022, 1); s.position.y = 2.15; s.renderOrder = 10; n.holder.add(s); n.marker = s;
  }
  respawnBot(n, sp) { if (n.state === 'dead' || !n.alive) { n.respawn([sp[0], sp[1], sp[2]], sp[3] + Math.PI); n.protUntil = this.time + PROTECT; this.net?.botRespawned(n); } }
  readyToRespawn() { return !this.pendingLoadoutUI; }
  async respawnPlayer(sp) {
    const P = this.player;
    P.spawn(sp[0], sp[1], sp[2], sp[3]); P.protUntil = this.time + PROTECT; this.deathHandled = false; this.flashV = 0;
    if (this.nextLoadout) { this.loadoutId = this.nextLoadout; this.nextLoadout = null; await this.equipLoadout(); }
    else { for (const s of this.weapons.slots) { s.mag = s.stats.mag; s.reserve = s.stats.mag * 4; } this.refillKit(); await this.weapons.equip(0, true); }
    this.hud.weapon(this.weapons); this.hud.center('', 0.01);
    this.net?.sendRespawn(sp);
  }
  spawnDummy(x, z) {
    const n = this.npcs.spawn({ pos: [x, 0, z], yaw: Math.PI, state: 'dummy', squad: 99, weapon: 'm4', team: 'B' });
    n.yaw = n.aimYaw = 0; n.dummyHome = [x, z];
    return n;
  }
  // every combatant this client knows about (player, bots, online players' puppets)
  actors() { const a = this.npcs.list.filter(n => n.state !== 'dummy' || this.mode === 'range'); if (this.mode !== 'menu') a.push(this.player); return a; }
  onKill(npc, zone, killer) {
    if (this.mode === 'range') {
      const home = npc.dummyHome; if (home) setTimeout(() => { if (this.mode === 'range' && this.state !== 'loading') { this.scene.remove(npc.holder); if (npc.gunObj) this.scene.remove(npc.gunObj); this.npcs.list = this.npcs.list.filter(x => x !== npc); this.spawnDummy(home[0], home[1]); } }, 3000);
      this.stats.kills++; this.hud.killfeed(`<b>You</b> [${this.weapons.stats?.name || ''}] ${zone === 'head' ? '<em>HEADSHOT</em> ' : ''}Target`);
      return;
    }
    if (killer === this.player) { this.stats.kills++; if (zone === 'head') this.stats.heads++; }
    if (this.net) this.net.reportKill(killer, npc, zone, this._wpn);
    else this.match?.onKill(killer, npc, zone, this._wpn);
  }
  onScore(v, label) { this.myScore = (this.myScore || 0) + v; this.hud.score(this.match?.me?.score ?? this.myScore, `+${v} ${label}`); }
  feed(ke, ve, zone, weapon) {
    const tag = e => !e ? '' : `<b class="${e.local ? 'me' : this.match?.tdm ? (e.team === this.player.team ? 'fr' : 'en') : 'en'}">${esc(e.name)}</b>`;
    this.hud.killfeed(ke ? `${tag(ke)} [${esc(weapon || '')}] ${zone === 'head' ? '<em>HEADSHOT</em> ' : ''}${tag(ve)}` : `${tag(ve)} <em>died</em>`);
    if (ve?.local) { this.killedBy = ke?.name || null; }
  }
  // F / X: the loadout's lethal and tactical
  throwGrenade(slot = 'lethal') {
    const P = this.player;
    if (!this.nades || this.nades[slot] <= 0 || P.dead || P.mantle || this.vm.busy || this.nadeCool > this.time) return;
    this.nades[slot]--; this.nadeCool = this.time + 0.9; this.hud.nades(this.kit, this.nades);
    const dir = P.aimDir(new THREE.Vector3());
    const from = P.camPos.clone().addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.1, 0));
    this.grenades.throw(this.kit[slot], from, dir, P.vel, P);
    this.audio.click('mag'); this.vm.cancelAnim?.(); P.protUntil = 0;
    this.player.shake.p -= 0.01;
  }
  // a flashbang went off in front of the local player: white-out + ringing, scaled 0..1
  flashbanged(k) {
    this.flashV = Math.max(this.flashV, Math.min(1, k * 1.3)); this.flashDecay = 0.25 + 0.4 * (1 - k);
    this.audio.ring?.(k);
  }
  // walk over a fallen soldier to take a magazine for each gun and sometimes a lethal
  loot() {
    if (this.mode === 'range') return;
    const P = this.player; if (P.dead) return;
    for (const n of this.npcs.list) {
      if (n.alive || n.looted || n.state === 'dummy' || Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z) > 2.2 || Math.abs(n.pos.y - P.pos.y) > 2) continue;
      n.looted = true;
      let got = 0;
      for (const s of this.weapons.slots) { const add = s.stats.mag; s.reserve += add; if (s === this.weapons.slot) got = add; }
      let msg = `Ammo +${got}`;
      if (this.nades.lethal < 2 && Math.random() < 0.4) { this.nades.lethal++; this.hud.nades(this.kit, this.nades); msg += '  ·  ' + THROWABLES[this.kit.lethal].name + ' +1'; }
      this.hud.weapon(this.weapons); this.hud.pickup(msg); this.audio.pickup();
    }
  }
  // ---------------------------------------------------------------- ballistics callbacks
  fireBullet(o) { if (o.owner === this.player) this.stats.shots++; return this.ballistics.fire(o); }
  playerHit(o, d, maxT) {
    const P = this.player; if (P.dead) return null;
    const z = P.hitZones();
    const a = new THREE.Vector3(z.x, z.y0 + z.r, z.z), b = new THREE.Vector3(z.x, z.y1 - z.r * 0.6, z.z);
    // ray vs vertical capsule (approximate with sampled spheres - cheap and robust)
    let best = Infinity;
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const c = a.clone().lerp(b, i / n);
      const oc = o.clone().sub(c); const bb = d.dot(oc), cc = oc.dot(oc) - z.r * z.r, h = bb * bb - cc;
      if (h >= 0) { const t = -bb - Math.sqrt(h); if (t > 0 && t < best) best = t; }
    }
    if (best > maxT) return null;
    const point = o.clone().addScaledVector(d, best);
    return { player: true, t: best, zone: point.y > z.headY ? 'head' : 'body', point };
  }
  onCharacterHit(b, hit, dir) {
    const P = this.player, mine = b.owner === P;
    if (hit.npc) {
      this.fx.impact(hit.point, dir.clone().negate(), 'flesh', dir, b.power);
      const wh = this.world.raycast(hit.point, dir, 2.5, bx => bx.solid);
      if (wh) this.fx.decal(wh.point, wh.normal, 'blood', 0.12);
      this.audio.impact(hit.point, hit.zone === 'head' ? 'metal' : 'flesh', 0.8);
      const res = this.dealDamage(hit.npc, b.damage, hit.zone, dir, hit.point, b.owner, b.power, b.weapon || clsName(b.cls));
      if (mine) { this.stats.hits++; this.lastHit = { zone: hit.zone, killed: res?.killed, dist: b.start.distanceTo(hit.point), t: this.time, drop: this.dropAt(b, hit.point) }; }
    } else if (hit.player) {
      const dmg = hit.zone === 'head' ? (this.diff >= 3 ? 999 : b.damage * 2.2) : b.damage;
      this.dealDamage(P, dmg, hit.zone, dir, hit.point, b.owner, b.power, b.weapon || clsName(b.cls), b.start);
    }
  }
  // the one place damage is applied: spawn protection, no friendly fire, assists, kill credit, feedback.
  // Online, hits on other people's soldiers go to the server instead (net.routeDamage).
  dealDamage(v, dmg, zone, dir, point, attacker, power = 1, weapon = '', from = null) {
    if (!v || !v.alive) return null;
    const P = this.player;
    if ((v.protUntil || 0) > this.time) return null;
    if (attacker && attacker !== v && attacker.team === v.team) return null;
    if (this.net && this.net.routeDamage(v, dmg, zone, dir, point, attacker, weapon)) { if (attacker === P) { this.hud.hitmarker(false, zone === 'head'); this.audio.hitmarker(zone === 'head'); } return { pending: true }; }
    this.match?.onDamage(attacker, v);
    this._wpn = weapon;
    if (v === P) {
      P.hurt(dmg, from || attacker?.pos || point);
      this.audio.hurt();
      const src = from || attacker?.pos; if (src) { const to = src.clone().sub(P.pos); const ang = Math.atan2(to.x, to.z); this.hud.damageFrom(-(ang - Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw)))); }
      P.shake.p += 0.01; P.shake.r += (Math.random() - 0.5) * 0.04;
      if (P.dead && !this.deathHandled) { this.deathHandled = true; this.onKillPlayer(attacker, zone, weapon); }
      return { killed: P.dead, zone };
    }
    const res = v.damage(dmg, zone, dir, point, attacker?.pos, power, attacker);
    if (attacker === P && res) { this.hud.hitmarker(res.killed, zone === 'head'); this.audio.hitmarker(zone === 'head'); }
    return res;
  }
  onKillPlayer(attacker, zone, weapon) {
    if (this.mode === 'range') { const tok = this.roundTok; setTimeout(() => { if (tok !== this.roundTok) return; const sp = this.mapData.playerSpawns[0]; this.player.spawn(sp[0], sp[1], sp[2], sp[3]); this.deathHandled = false; }, 2000); return; }
    if (this.net) { if (!attacker) this.net.routeDamage(this.player, 999, 'chest', null, null, null, weapon); }
    else this.match?.onKill(attacker, this.player, zone, weapon);
    this.deathT = this.time;
  }
  dropAt(b, p) { // how far below the line of sight the bullet landed
    if (!b.aimDir) return null; const L = b.start.distanceTo(p); const ideal = b.start.clone().addScaledVector(b.aimDir, L); return ideal.y - p.y;
  }
  onWorldHit(b, point, normal, box, dir, entering) {
    this.fx.impact(point, entering ? normal : dir, box.surf, dir, entering ? 1 : 0.6);
    if (entering) {
      this.audio.impact(point, SURF[box.surf]?.snd || 'hard', box.tag === 'plate' ? 2 : 1);
      if (b.team === 'player') {
        this.npcs.noise(point, 7, 'impact', b.start);
        if (box.tag === 'plate') { this.hud.hitmarker(false, false); this.lastHit = { zone: 'steel', dist: b.start.distanceTo(point), t: this.time, drop: this.dropAt(b, point) }; }
        this.lastImpact = { point: point.clone(), dist: b.start.distanceTo(point), drop: this.dropAt(b, point) };
      }
    }
  }
  onImpact() { }
  onFlyby(pos, d) { this.audio.flyby(pos, 1.2 - d * 0.4); this.hud.suppress(0.35); this.player.shake.r += (Math.random() - 0.5) * 0.01; }
  onPlayerShot(st) {
    this.recentShot = 1.5; this.player.protUntil = 0;
    const r = (st.suppressed ? 22 : st.cls === 'sniper' ? 260 : 160) * (st.suppressed ? 1 : Math.min(1.4, st.loud || 1));   // a brake carries further
    this.npcs.noise(this.player.pos, r, 'gunshot', this.player.pos.clone(), this.player);
    this.net?.sendShot(this.camera.position, this.player.aimDir(new THREE.Vector3()), st);
    // remember the aim line of the newest player bullets (for the range drop readout)
    const aim = this.player.aimDir(new THREE.Vector3());
    for (const b of this.ballistics.list) if (b.team === 'player' && !b.aimDir) b.aimDir = aim.clone();
  }
  // ---------------------------------------------------------------- per frame
  updateCamera(dt) {
    const P = this.player, c = this.camera;
    c.position.copy(P.camPos);
    P.shake.p *= Math.exp(-dt * 14); P.shake.r *= Math.exp(-dt * 10);
    c.rotation.set(P.pitch + P.recoil.p + P.shake.p, P.yaw + P.recoil.y, P.camRoll + P.shake.r, 'YXZ');
    const vm = this.vm, ads = vm.adsW || 0;
    const optic = vm.optic || { zoom: 1 };
    // magnified optics: the PIP lens carries the transition, then the camera itself zooms to the optic's
    // true magnification and the grade pass draws the scope picture (scopeK) - no gun model in the way
    const scopeK = this.scopeK = vm.useScope ? THREE.MathUtils.smoothstep(ads, 0.8, 0.97) : 0;
    const zoom = vm.useScope ? THREE.MathUtils.lerp(1.3, optic.zoom, scopeK) : Math.max(1.1, Math.min(optic.zoom, 1.25));
    const base = this.vfov(this.settings.fov) * (P.sprint ? (P.tac ? 1.08 : 1.04) : 1);
    c.fov = base / (1 + (zoom - 1) * (vm.useScope ? Math.max(ads, scopeK) : ads));
    this.zoomK = c.fov / base;
    c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
  playFrame(dt) {
    const I = this.input, P = this.player, ws = this.weapons, vm = this.vm, S = this.settings;
    // look
    const ads = vm.adsW || 0;
    const zoomK = this.zoomK || 1;
    const sens = 0.0022 * S.sens * THREE.MathUtils.lerp(1, S.adsSens * zoomK, ads);
    P.look(I.mouse.dx, I.mouse.dy, sens, S.invert);
    const k = I.keys;
    const inp = {
      f: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      jump: k.has('Space'), jumpPressed: I.pressed('Space'), sprint: k.has('ShiftLeft') || k.has('ShiftRight'), sprintPressed: I.pressed('ShiftLeft') || I.pressed('ShiftRight'),
      crouchPressed: I.pressed('KeyC') || I.pressed('ControlLeft'), pronePressed: I.pressed('KeyZ'), leanL: k.has('KeyQ'), leanR: k.has('KeyE'),
      ads: I.mouse.r, adsW: ads, firing: I.mouse.l && (ws.slot?.mag > 0),
    };
    if (this.botInput) Object.assign(inp, this.botInput);
    P.update(dt, inp, this.world, ws.stats, this.audio);
    { const st = ws.stats, k = (st?.sway || 0) * ads * (P.stance === 'prone' ? 0.35 : P.stance === 'crouch' ? 0.65 : 1) * (1 + Math.min(1.5, P.speed * 0.5)), t = this.time;
      const sy = k * (Math.sin(t * 0.9) + 0.4 * Math.sin(t * 2.3 + 1)), sp = k * 0.7 * (Math.sin(t * 1.3 + 2) * 0.8 + 0.3 * Math.sin(t * 3.1));
      P.recoil.y += sy - (this._swY || 0); P.recoil.p += sp - (this._swP || 0); this._swY = sy; this._swP = sp; }
    P.regen(dt);
    // quick loadout swap (L): number keys pick; applies now if you just spawned, else on the next respawn
    if (I.pressed('KeyL') && this.match) this.quickLoadout(!this.qlOpen);
    if (this.qlOpen) { for (let i = 0; i < 9; i++) if (I.pressed('Digit' + (i + 1))) this.pickQuick(i); }
    // weapon input
    else { if (I.pressed('Digit1')) ws.equip(0); if (I.pressed('Digit2')) ws.equip(1); }
    if (I.mouse.wheel) ws.equip((ws.cur + 1) % ws.slots.length);
    if (I.pressed('KeyB')) ws.switchMode();
    if (I.pressed('KeyT') && ws.stats?.laser) { ws.laserOn = !ws.laserOn; this.audio.click('laser'); this.hud.weapon(ws); }
    if (I.pressed('KeyV')) vm.inspect();
    if (I.pressed('KeyF') || (I.pressed('KeyG') && this.mode !== 'range')) this.throwGrenade('lethal');
    if (I.pressed('KeyX')) this.throwGrenade('tactical');
    if (I.pressed('KeyG') && this.mode === 'range') { this.openGunsmith(true); return; }
    const winp = { fire: I.mouse.l, firePressed: I.mouse.lp, reloadPressed: I.pressed('KeyR'), ...(this.botWeapon || {}) };
    if (winp.fire || winp.firePressed) vm.cancelAnim();
    ws.update(dt, winp);
    // camera + viewmodel
    this.updateCamera(dt);
    const res = new THREE.Vector2(); this.renderer.getDrawingBufferSize(res);
    const laserCol = new THREE.Color(ws.slot?.cfg.laserColor || '#ff2020');
    vm.update({ dt, lookDX: I.mouse.dx, lookDY: I.mouse.dy, speed: P.speed, sprint: (P.sprint || !!P.mantle) && !inp.firing, tac: P.tac, slide: P.slide > 0, lean: P.lean, grounded: P.grounded,
      landImpulse: P.landImpulse > 0.5 ? P.landImpulse * 0.5 : 0, adsTarget: inp.ads && !P.mantle, adsTime: ws.stats?.adsTime || 0.25, mainCamera: this.camera, res, reticleColor: null });
    if (P.landImpulse > 0.5) P.landImpulse *= 0.5;
    // laser
    if (vm.weapon?.laser && ws.stats?.laser && ws.laserOn && !P.sprint) {
      const from = vm.toWorld(vm.weapon.laser, this.camera, new THREE.Vector3());
      const dir = vm.barrelDir(this.camera, new THREE.Vector3());
      const wh = this.world.raycast(from, dir, 300, b => b.see || b.shoot);
      const nh = this.npcs.raycast(from, dir, wh ? wh.t : 300);
      const t = nh ? nh.t : wh ? wh.t : 300;
      const to = from.clone().addScaledVector(dir, t);
      const vis = this.map.env.weather === 'rain' ? 0.4 : this.map.env.weather ? 0.3 : 0.12;
      this.scene.userData.camPos = this.camera.position;
      this.fx.setLaser(true, from, (nh || wh) ? to : null, laserCol, vis * (1 - 0.5 * ads));
    } else this.fx.setLaser(false);
    if (vm.weapon?.laserLens) { const lm = vm.weapon.laserLens.material; if (ws.laserOn && !P.sprint) lm.color.copy(laserCol).multiplyScalar(4); else lm.color.setRGB(0.02, 0.02, 0.02); }
    // hud
    const spreadPx = (ws.stats ? (ws.stats.hip + ws.stats.moveSpread * Math.min(1.3, P.speed / 6.5)) : 3) * innerHeight / this.camera.fov * 0.5;
    this.hud.crosshair(spreadPx, ads);
    this.hud.vitals(P); this.hud.compass(P.yaw);
    this.recentShot = Math.max(0, this.recentShot - dt);
    // range readout
    if (this.mode === 'range') {
      const lh = this.lastHit, li = this.lastImpact;
      let txt = `${ws.stats?.name || ''}\nvelocity ${ws.stats?.velocity.toFixed(0)} m/s · zero ${ws.stats?.zero} m\n`;
      if (li) txt += `last impact ${li.dist.toFixed(1)} m` + (li.drop != null ? ` · ${li.drop >= 0 ? 'low' : 'high'} ${(Math.abs(li.drop) * 100).toFixed(1)} cm` : '') + '\n';
      if (lh && this.time - lh.t < 6) txt += `hit: ${lh.zone.toUpperCase()}${lh.killed ? ' (kill)' : ''} at ${lh.dist.toFixed(1)} m`;
      this.hud.rangeInfo(txt);
    }
  }
  simulate(dt) {
    const P = this.player;
    this.flashV = Math.max(0, this.flashV - dt * (this.flashDecay || 0.5));
    if (P.dead && !this.deathHandled) { this.deathHandled = true; this.onKillPlayer(null, 'chest', 'Fall'); }
    this.ballistics.update(dt);
    { const f = P.aimDir(this.npcs.camFwd || (this.npcs.camFwd = new THREE.Vector3())); f.y = 0; f.normalize(); }
    const M = this.match;
    this.npcs.update(dt, { player: P, actors: this.actors(), now: this.time, roam: M ? this.mapData.roam : null, fireBullet: o => this.fireBullet(o), viewRange: this.map.env.viewRange, lightK: this.map.env.lightK, recentShot: this.recentShot > 0, surfAt: p => 'concrete',
      smokeBlocks: (a, b) => this.grenades.blocks(a, b), throwNade: M && !this.ended ? (type, from, to, who) => this.grenades.throwAt(type === 'frag' ? 'frag' : type, from, to, who) : null });
    this.fx.update(dt, this.audio);
    this.grenades.update(dt);
    this.loot();
    this.net?.update(dt);
    if (M) {
      M.update(dt);
      this.hud.matchbar(M.barHTML());
      if (this.input.keys.has('Tab') || P.dead) this.hud.board(M.boardHTML()); else this.hud.board(null);
      if (P.dead && !M.over) { const left = Math.max(0, (this.deathT || this.time) + 4 - this.time); this.hud.center((this.killedBy ? 'Killed by ' + this.killedBy : 'You died') + '  ·  respawn in ' + Math.ceil(left) + (this.nextLoadout ? '  ·  new loadout' : '  ·  L: change loadout'), 0.3); }
      else if ((P.protUntil || 0) > this.time) this.hud.center('Spawn protected', 0.2);
    }
  }
  quickLoadout(on) {
    this.qlOpen = on; const el = $('quickLoad'); el.classList.toggle('hidden', !on); if (!on) return;
    this.qlList = this.loadoutChoices();
    el.innerHTML = '<b>Loadout</b>' + this.qlList.map((c, i) => `<div class="${c.id === (this.nextLoadout || this.loadoutId) ? 'on' : ''}"><kbd>${i + 1}</kbd>${esc(c.label)}</div>`).join('') + '<small>L to close · applies on respawn</small>';
  }
  pickQuick(i) {
    const c = this.qlList?.[i]; if (!c) return;
    const P = this.player;
    if (!P.dead && (P.protUntil || 0) > this.time) { this.loadoutId = c.id; this.equipLoadout().then(() => this.hud.weapon(this.weapons)); this.hud.pickup('Loadout: ' + c.label); }
    else { this.nextLoadout = c.id; this.hud.pickup('Next spawn: ' + c.label); }
    this.quickLoadout(false);
  }
  // gunsmith presets first, then the built-in classes
  loadoutChoices() {
    const L = loadLoadouts(), out = [{ id: 'custom', label: 'Gunsmith build  ·  ' + (Armory.gun(L.primary.gun)?.name || '') }];
    (L.presets || []).forEach((p, i) => p && out.push({ id: 'p:' + i, label: (p.name || 'Preset ' + (i + 1)) + '  ·  ' + (Armory.gun(p.primary?.gun)?.name || '') }));
    for (const p of PRESETS.slice(1)) out.push({ id: p.id, label: presetLabel(p) });
    return out.slice(0, 9);
  }
  // end of match: the leaderboard, winner first
  endMatch() {
    if (this.ended) return; this.ended = true;
    const M = this.match, w = M.winner(), me = M.me;
    const win = M.tdm ? w === me?.team : w === me;
    $('endTitle').textContent = M.tdm ? (w ? 'Team ' + TEAM_NAME[w] + ' wins' : 'Draw') : (w ? (w.local ? 'You win' : esc(w.name) + ' wins') : 'Draw');
    $('endscreen').classList.toggle('lost', !win);
    const t = M.t, mmss = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, S = this.stats, acc = S.shots ? S.hits / S.shots : 0;
    $('endStats').innerHTML = `<p class="end-sub">${this.map.name}  ·  ${MODES[this.mode].name}  ·  ${this.net ? 'Online' : DIFFICULTY[this.diff].name + ' bots'}  ·  ${mmss}</p>
      ${M.boardHTML(true)}
      <div class="end-grid"><div><small>Your points</small><b>${(me?.score || 0).toLocaleString()}</b></div><div><small>Kills</small><b>${me?.kills || 0}</b></div><div><small>Deaths</small><b>${me?.deaths || 0}</b></div><div><small>Headshots</small><b>${S.heads}</b></div><div><small>Accuracy</small><b>${Math.round(acc * 100)}%</b></div></div>`;
    this.lastResult = { win, score: me?.score || 0, kills: me?.kills || 0, winner: M.tdm ? w : w?.name };
    this.hud.board(null);
    const tok = this.roundTok;
    setTimeout(() => { if (this.testMode || tok !== this.roundTok || (this.state !== 'play' && this.state !== 'pause')) return; this.state = 'end'; this.input.unlock(); this.show('endscreen'); this.hud.show(false); }, 1800);
  }
  // ---------------------------------------------------------------- rendering
  render(dt) {
    const r = this.renderer;
    if (this.state === 'gunsmith') { this.gunsmith.render(r, dt); return; }
    if (this.state === 'loading' || this.state === 'boot') return;   // the map is half built; the loading screen covers it
    if (!this.world) { r.setRenderTarget(null); r.clear(); return; }
    followSun(this.env?.sun, this.player.pos);
    for (const p of this.pools) p.update(this.camera);
    if (this.env?.sky?.material?.uniforms?.uTime) { this.env.sky.material.uniforms.uTime.value = this.time; }
    if (this.env?.sky) this.env.sky.position.copy(this.camera.position);
    if (this.env?.weather) { this.env.weather.update(this.time, this.camera); if (this.env.weather.kind === 'rain') this.env.weather.setLights(this.builder.lightSources, this.camera.position); }
    if (this.ripples) this.ripples.update(r, this.time, 1);
    if (this.winMat) this.winMat.uniforms.uTime.value = this.time;
    if (this.builder?.lods.length && this.frame % 10 === 0) this.builder.updateLods(this.camera.position);
    this.scene.updateMatrixWorld();
    if (this.refl && (this.frame % 2 === 0)) this.refl.update(r, this.scene, this.camera);
    if ((this.state === 'play' || this.state === 'pause' || this.state === 'end') && !(this.scopeK > 0.99)) this.vm.renderScope(r, this.scene, this.camera);
    this.vmPass.enabled = this.state === 'play' || this.state === 'pause';
    this.grade.uniforms.uTime.value = this.time;
    this.grade.uniforms.uHurt.value = this.hud.hurtV; this.grade.uniforms.uSupp.value = this.hud.suppressV; this.grade.uniforms.uAds.value = this.vm.adsW || 0;
    { const U = this.grade.uniforms, on = (this.state === 'play' || this.state === 'pause') ? (this.scopeK || 0) : 0; U.uScope.value = on;
      if (on > 0) { const o = this.vm.optic, pr = this.renderer.getPixelRatio(); U.uRet.value = o.reticle === 'mil' ? 0 : o.reticle === 'chevron' ? 1 : 2; if (o.color && o.reticle !== 'mil') U.uIllum.value.set(o.color);
        const k = this.vm.kick; U.uScopeOff.value.set((k?.position.x || 0) * -9000 * pr, (k?.position.y || 0) * 9000 * pr); }
      this.vmPass.enabled = this.vmPass.enabled && on < 0.5; U.uFlash.value = this.flashV || 0; }
    this.composer.render(dt);
    if (this.state === 'menu' && this.screen === 'menu' && this.menuGun) this.renderMenuGun(r, dt);
    const I = r.info.render; this.frameInfo = { calls: I.calls, tris: I.triangles }; r.info.reset();
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    try { this.frameStep(); } catch (e) { if ((this.frameErrs = (this.frameErrs || 0) + 1) <= 5) console.error('[game] frame error', e); }
  }
  frameStep() {
    const now = performance.now(); let dt = (now - this.clock) / 1000; this.clock = now;
    this.adapt(dt);
    dt = Math.min(dt, 1 / 20);
    this.time += dt; this.frame = (this.frame || 0) + 1;
    if (this.state === 'play') {
      this.playFrame(dt);
      this.simulate(dt);
      const fwd = this.player.aimDir(new THREE.Vector3());
      this.audio.setListener(this.camera.position, fwd, new THREE.Vector3(0, 1, 0));
      this.hud.update(dt, this.player);
    } else if (this.state === 'menu') {
      this.menuCamera(this.time);
      if (this.world) { this.npcs.update(dt, { player: this.player, fireBullet: () => { }, viewRange: 1, lightK: 0 }); this.fx.update(dt); }
    }
    if (this.state === 'play') { const need = !this.input.locked && !this.testMode; if (need !== this.engageShown) { this.engageShown = need; $('engage').classList.toggle('hidden', !need); } }
    else if (this.engageShown) { this.engageShown = false; $('engage').classList.add('hidden'); }
    this.render(dt);
    this.input.endFrame();
    // fps
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { const f = Math.round(this.fpsN / this.fpsAcc); this.fps = f; if (this.settings.showFps || params.has('fps')) $('fps').textContent = f + ' fps'; else $('fps').textContent = ''; this.fpsAcc = 0; this.fpsN = 0; }
  }
  // ---------------------------------------------------------------- menu backdrop
  // slow street-level dolly from the player spawn along its facing (down the main street on the city),
  // with a lazy sway and a rise, like a title sequence
  menuCamera(time) {
    const sp = this.mapData?.playerSpawns?.[0] || [0, 0, 0, 0], c = this.camera;
    const fx = -Math.sin(sp[3]), fz = -Math.cos(sp[3]), sx = -fz, sz = fx;
    const t = time * 0.045, u = 4 + 14 * (0.5 - 0.5 * Math.cos(t)), side = -2.6 + Math.sin(t * 0.7) * 0.8, h = 1.7 + 0.6 * (0.5 - 0.5 * Math.cos(t * 1.3));
    c.position.set(sp[0] + fx * u + sx * side, (sp[1] || 0) + h, sp[2] + fz * u + sz * side);
    const L = 34, lk = Math.sin(t * 0.5) * 3;
    c.lookAt(c.position.x + fx * L + sx * lk, (sp[1] || 0) + 2.4, c.position.z + fz * L + sz * lk);
    c.fov = 48; c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
  // the gunsmith's primary build, turning slowly on the right of the main menu
  async buildMenuGun() {
    try {
      const L = loadLoadouts(), cfg = L.primary, id = (this.menuGunId = (this.menuGunId || 0) + 1);
      const g = Armory.gun(cfg.gun);
      $('mnGun').textContent = g?.name || cfg.gun;
      $('mnAtt').textContent = ['optic', 'muzzle', 'laser', 'underbarrel'].map(k => cfg[k] && Armory.att(cfg[k])?.name).filter(n => n && !/^(none|no |bare|iron)/i.test(n)).join('  ·  ') || 'iron sights';
      const w = await buildWeapon(cfg);
      if (id !== this.menuGunId) return;
      if (!this.menuGunScene) {
        const S = this.menuGunScene = new THREE.Scene();
        const key = new THREE.DirectionalLight(0xffe9cc, 1.1); key.position.set(1.5, 2, 2.2);
        const rim = new THREE.DirectionalLight(0x8fb4ff, 2.2); rim.position.set(-2, 1.2, -2.4);
        const fill = new THREE.HemisphereLight(0xc9d6e6, 0x1a1410, 0.5);
        S.add(key, rim, fill);
        this.menuPivot = new THREE.Group(); S.add(this.menuPivot);
        this.menuGunCam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
      }
      if (this.menuGun) this.menuPivot.remove(this.menuGun);
      const bb = new THREE.Box3().setFromObject(w.root), c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
      w.root.position.sub(c);
      this.menuGunDist = Math.max(0.8, Math.max(size.x, size.z) * 3.1);
      this.menuGun = w.root; this.menuPivot.add(w.root);
    } catch (e) { console.warn('[menu] gun preview', e); }
  }
  renderMenuGun(r, dt) {
    const S = this.menuGunScene, c = this.menuGunCam, w = innerWidth, h = innerHeight;
    if (this.env?.envMap && S.environment !== this.env.envMap) { S.environment = this.env.envMap; S.environmentIntensity = 0.55; }
    const t = this.time;
    this.menuPivot.rotation.set(0.05 * Math.sin(t * 0.4), 0.6 + Math.sin(t * 0.22) * 0.45, 0.03 * Math.sin(t * 0.31));
    this.menuPivot.position.y = Math.sin(t * 0.8) * 0.01;
    c.aspect = w / h; c.position.set(0, 0.12, this.menuGunDist); c.lookAt(0, 0, 0);
    c.setViewOffset(w, h, -w * 0.24, -h * 0.02, w, h); c.updateProjectionMatrix();
    r.setRenderTarget(null); const ac = r.autoClear; r.autoClear = false; r.clearDepth(); r.render(S, c); r.autoClear = ac;
  }
  adapt(dt) {
    if (params.has('dpr') || this.state !== 'play') return;
    const A = this._ad || (this._ad = { acc: 0, n: 0, cool: 0, max: this.renderer.getPixelRatio() });
    A.acc += dt; A.n++; A.cool -= dt; if (A.acc < 2) return;
    const fps = A.n / A.acc; A.acc = 0; A.n = 0; if (A.cool > 0) return;
    let d = this.renderer.getPixelRatio();
    if (fps < 55 && d > 0.6) d = Math.max(0.6, d * 0.88); else if (fps > 80 && d < A.max) d = Math.min(A.max, d / 0.92);
    if (d !== this.renderer.getPixelRatio()) { this.renderer.setPixelRatio(d); this.resize(); A.cool = 3; }
  }
  // ---------------------------------------------------------------- UI
  show(id) { this.screen = id; for (const s of ['menu', 'mapsel', 'gunsmith', 'settings', 'pause', 'endscreen', 'online']) $(s).classList.toggle('hidden', s !== id); }
  // ---------------------------------------------------------------- online lobby screen
  netClient() {
    if (this.netc) return this.netc;
    const N = this.netc = new Net(this);
    N.onLobby = L => this.renderLobby(L);
    N.onError = msg => { $('olMsg').textContent = msg; };
    N.onStart = async S => { this.net = N; this.loadoutId = $('loadoutSel').value || 'custom'; await this.runGame(S.map, S.mode, S.diff); window.__playing = true; };
    return N;
  }
  openOnline() {
    this.show('online');
    $('olName').value = $('olName').value || (() => { try { return localStorage.getItem('ironsight.name') || ''; } catch (e) { return ''; } })() || 'Operator' + Math.floor(Math.random() * 90 + 10);
    $('olMap').innerHTML = MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    const L = this.netc?.lobby; $('olStart').classList.toggle('hidden', !!L); $('olLobby').classList.toggle('hidden', !L); if (L) this.renderLobby(L);
  }
  olName() { const n = $('olName').value.trim().slice(0, 16) || 'Operator'; try { localStorage.setItem('ironsight.name', n); } catch (e) { /* private */ } return n; }
  renderLobby(L) {
    $('olStart').classList.add('hidden'); $('olLobby').classList.remove('hidden'); $('olMsg').textContent = '';
    const N = this.netc, host = L.host === N.id, map = MAPS.find(m => m.id === L.map);
    $('olCodeV').textContent = L.code;
    $('olInfo').innerHTML = `${L.mode === 'tdm' ? 'Team deathmatch 5 v 5' : 'Free for all'}  ·  ${map?.name || L.map}  ·  ${L.players.length} player${L.players.length > 1 ? 's' : ''} + ${10 - L.players.length} bots${L.started ? '  ·  <b>match running</b>' : ''}`;
    $('olPlayers').innerHTML = L.players.map(p => `<li>${esc(p.name)}${p.id === L.host ? ' <i>host</i>' : ''}${p.id === N.id ? ' <i>you</i>' : ''}</li>`).join('');
    $('olGo').classList.toggle('hidden', !host || L.started); $('olHostOpts').classList.toggle('hidden', !host || L.started);
    if (host) { $('olLMode').value = L.mode; $('olLMap').innerHTML = MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join(''); $('olLMap').value = L.map; $('olLDiff').value = L.diff; }
    $('olWait').classList.toggle('hidden', host);
    $('olLink').textContent = location.host.startsWith('localhost') ? 'Friends on your network open http://<this PC IP>:' + (location.port || 80) + ' and join with the code' : 'Friends open ' + location.origin + ' and join with the code';
  }
  async toLobby() {
    this.state = 'menu'; this.hud.show(false); this.input.unlock();
    const N = this.net; this.net = null;
    this.npcs.clear(); this.fx.clear(); this.ballistics.clear(); this.grenades.clear(); this.ended = true; this.roundTok = (this.roundTok || 0) + 1;
    this.match = null; this.quickLoadout(false); this.hud.board(null); this.hud.matchbar(null);
    if (N) N.inMatch = false;
    this.openOnline();
  }
  bindUI() {
    const list = $('maplist');
    const ART = { city: '#1b2a3d, #07090c 70%', desert: '#6b4a26, #1a120a 75%', docks: '#22343a, #080b0d 72%', office: '#3a3f36, #0b0c0a 72%' };
    list.innerHTML = MAPS.map(m => `<div class="card" data-map="${m.id}"><div class="art" style="background: radial-gradient(ellipse at 70% 0%, ${ART[m.id] || '#222, #000'})"></div><em>Deploy</em><div class="txt"><b>${m.name}</b><span>${m.desc}</span></div></div>`).join('');
    this.selMap = MAPS[0].id;
    // one click on a map deploys. Pointer lock is requested right here, inside the click (a lock asked for
    // after the map has loaded is refused by the browser: the click's user activation has expired by then)
    list.addEventListener('click', e => {
      const c = e.target.closest('.card'); if (!c || this.state !== 'menu') return;
      this.audio.init(); this.uiSound('go'); this.selMap = c.dataset.map; this.loadoutId = $('loadoutSel').value;
      this.input.lock();
      this.runGame(this.selMap, $('modeSel').value, +$('diffSel').value);
    });
    // menu sounds: a tick on hover, a thunk on press (the audio context starts on the first click or key)
    addEventListener('pointerdown', () => this.audio.init());
    addEventListener('keydown', () => this.audio.init());
    document.addEventListener('pointerover', e => { const b = e.target.closest?.('button, .card'); if (b && b !== this.hoverEl) this.uiSound('hover'); this.hoverEl = b; });
    this.fillPresets();
    document.body.addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      this.audio.init();
      const act = b.dataset.act;
      this.uiSound(['play', 'range', 'gsRange', 'restart', 'resume', 'next'].includes(act) ? 'go' : 'press');
      // anything that ends in live play takes the pointer now, while this click still counts as a user gesture
      if (['deploy', 'range', 'gsRange', 'restart', 'resume', 'next'].includes(act)) this.input.lock();
      if (act === 'play') this.show('mapsel');
      else if (act === 'back') this.show('menu');
      else if (act === 'deploy') { this.loadoutId = $('loadoutSel').value; await this.runGame(this.selMap, $('modeSel').value, +$('diffSel').value); }
      else if (act === 'range') { this.loadoutId = 'custom'; await this.runGame('range', 'range', 1); }
      else if (act === 'loadBack') { setLoading(false); await this.toMenu(); }
      else if (act === 'gunsmith') this.openGunsmith(false);
      else if (act === 'gsBack') this.closeGunsmith();
      else if (act === 'gsSave') { this.gunsmith.save(); b.textContent = 'Saved'; setTimeout(() => b.textContent = 'Save loadout', 1200); }
      else if (act === 'gsRange') { this.gunsmith.save(); this.loadoutId = 'custom'; this.gsReturnToGame = false; await this.runGame('range', 'range', 1); }
      else if (act === 'settings') { this.settingsFrom = this.state; this.openSettings(); }
      else if (act === 'setBack') { saveSettings(this.settings); this.applySettings(); this.show(this.settingsFrom === 'pause' ? 'pause' : 'menu'); }
      else if (act === 'resume') this.pause(false);
      else if (act === 'restart' && this.net) await this.toLobby();
      else if (act === 'restart') await this.runGame(this.map.id, this.mode, this.diff);
      else if (act === 'next' && this.net) await this.toLobby();
      else if (act === 'next') { const i = MAPS.findIndex(m => m.id === this.map.id); await this.runGame(MAPS[(i + 1) % MAPS.length].id, this.mode === 'range' ? 'ffa' : this.mode, this.diff); }
      else if (act === 'quit') await this.toMenu();
      else if (act === 'online' && window.__PLAYPILE_WEB) return; // static web build: no lobby server
      else if (act === 'online') this.openOnline();
      else if (act === 'olCreate') { $('olMsg').textContent = 'Connecting...'; try { await this.netClient().create(this.olName(), $('olMode').value, $('olMap').value, +$('olDiff').value); } catch (er) { $('olMsg').textContent = er.message; } }
      else if (act === 'olJoin') { $('olMsg').textContent = 'Connecting...'; try { await this.netClient().join($('olCode').value.trim().toUpperCase(), this.olName()); } catch (er) { $('olMsg').textContent = er.message; } }
      else if (act === 'olGo') { this.input.lock(); this.netc?.start(); }
      else if (act === 'olLeave') { this.netc?.leave(); $('olStart').classList.remove('hidden'); $('olLobby').classList.add('hidden'); }
      else if (act === 'olBack') { this.show('menu'); }
    });
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.state === 'gunsmith' && this.gsReturnToGame) this.closeGunsmith();
    });
    $('hud').addEventListener('click', () => { });
    for (const [id, k] of [['olLMode', 'mode'], ['olLMap', 'map'], ['olLDiff', 'diff']]) $(id).addEventListener('change', () => this.netc?.settings({ [k]: k === 'diff' ? +$(id).value : $(id).value }));
    this.renderer.domElement.addEventListener('click', () => { if (this.state === 'play' && !this.input.locked) this.input.lock(); });
  }
  fillPresets() { const el = $('loadoutSel'), v = el.value || 'custom'; el.innerHTML = this.loadoutChoices().map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join(''); el.value = v; if (!el.value) el.value = 'custom'; }
  openSettings() {
    const s = this.settings; this.show('settings');
    const bind = (id, k, fmt = v => v) => { const el = $(id); el.value = s[k]; const em = el.nextElementSibling; if (em) em.textContent = fmt(s[k]); el.oninput = () => { s[k] = +el.value; if (em) em.textContent = fmt(s[k]); this.applySettings(); }; };
    bind('setSens', 'sens', v => (+v).toFixed(2)); bind('setAdsSens', 'adsSens', v => (+v).toFixed(2)); bind('setFov', 'fov'); bind('setVmFov', 'vmFov'); bind('setVol', 'volume', v => Math.round(v * 100) + '%');
    $('setQuality').value = s.quality; $('setQuality').onchange = () => { s.quality = +$('setQuality').value; saveSettings(s); this.hud.center('Quality applies on next deploy', 2); this.quality = s.quality; };
    $('setInvert').checked = s.invert; $('setInvert').onchange = () => { s.invert = $('setInvert').checked; };
    $('setFps').checked = s.showFps; $('setFps').onchange = () => { s.showFps = $('setFps').checked; };
  }
  uiSound(kind) {
    const A = this.audio; if (!A.ready) return;
    try {
      const t = A.ctx.currentTime, out = A._out(null, { gain: kind === 'hover' ? 0.05 : 0.14, verb: 0.08 });
      if (kind === 'hover') { A._tone(out, t, 0.05, 2300, 1900, 0.5, 'triangle'); A._noise(out, t, 0.02, { type: 'highpass', f: 5000, a: 0.001, gain: 0.4 }); }
      else if (kind === 'go') { A._tone(out, t, 0.18, 180, 60, 0.9, 'sine'); A._noise(out, t, 0.06, { type: 'bandpass', f: 1400, q: 2, a: 0.001, gain: 0.8 }); A._tone(out, t + 0.07, 0.22, 880, 1320, 0.25, 'triangle'); }
      else { A._tone(out, t, 0.08, 520, 300, 0.6, 'triangle'); A._noise(out, t, 0.03, { type: 'bandpass', f: 2200, q: 3, a: 0.001, gain: 0.6 }); }
    } catch (e) { /* audio is optional */ }
  }
  // startGame with the failure path handled: a load that throws used to leave the player on a dead screen
  async runGame(mapId, mode, diff) {
    if (this.state === 'loading') return;
    try { await this.startGame(mapId, mode, diff); }
    catch (e) {
      console.error('[game] deploy failed', e);
      this.state = 'menu'; this.input.unlock(); this.hud.show(false);
      loadError('Deploy failed: ' + (e?.message || e) + '. Press Back to menu and try again.');
    }
  }
  applySettings() { this.vm.fov = this.settings.vmFov; this.audio.setVolume(this.settings.volume); }
  async startGame(mapId, mode, diff) {
    this.show(null); this.hud.show(false);
    await this.loadMap(mapId, mode, diff);
    this.state = 'play'; this.hud.show(true); this.hud.weapon(this.weapons);
    // the lock was taken in the click that started this; if it was refused or dropped, try again (works when
    // the click was recent) and otherwise the "click to engage" prompt shows and any click takes the mouse
    this.hud.rangeInfo(''); if (!this.testMode && !this.input.locked) this.input.lock();
    this.hud.center(mode === 'range' ? 'Firing range' : this.map.name, 2.2);
  }
  pause(on) {
    if (on) { if (this.state !== 'play') return; this.state = 'pause'; this.show('pause'); this.input.unlock(); }
    else { this.state = 'play'; this.show(null); this.input.lock(); }
  }
  async toMenu() {
    if (this.netc && !this.net) this.netc.leave();
    this.state = 'menu'; this.hud.show(false); this.input.unlock(); this.show('menu');
    this.npcs.clear(); this.fx.clear(); this.ballistics.clear(); this.grenades.clear(); this.ended = true; this.roundTok = (this.roundTok || 0) + 1;
    this.match = null; this.quickLoadout(false); this.hud.board(null); this.hud.matchbar(null);
    if (this.net) { this.net.leave(); this.net = null; }
    this.buildMenuGun();
  }
  async openGunsmith(fromGame) {
    this.gsReturnToGame = fromGame; this.prevState = this.state;
    this.state = 'gunsmith'; this.input.unlock(); this.hud.show(false); this.show('gunsmith');
    $('gunsmith').querySelector('[data-act="gsBack"]').textContent = fromGame ? 'Back to range' : 'Back';
    if (!this.gunsmith.scene.environment) { const h = await hdr('hdri/kloofendal_misty_morning.hdr'); h.mapping = THREE.EquirectangularReflectionMapping; if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer); this.gunsmith.scene.environment = this.pmrem.fromEquirectangular(h).texture; this.gunsmith.scene.environmentIntensity = 0.8; }
    await this.gunsmith.open();
  }
  async closeGunsmith() {
    this.gunsmith.save();
    if (this.gsReturnToGame) { this.show(null); this.loadoutId = 'custom'; await this.equipLoadout(); this.state = 'play'; this.hud.show(true); this.hud.weapon(this.weapons); this.input.lock(); }
    else { this.state = 'menu'; this.show('menu'); this.buildMenuGun(); }
  }
  async boot() {
    this.loop();
    // menu backdrop: the rainy city, no enemies. Only the scene is loaded before the menu shows; soldier
    // models and the menu gun stream in behind it, and each map loads its own assets when it is chosen
    try { await this.loadMap(params.get('map') || 'city', 'menu', 1); }
    catch (e) { console.error('[game] menu scene failed', e); setLoading(false); $('menuErr').textContent = 'The menu backdrop failed to load (' + (e?.message || e) + '). You can still deploy.'; $('menuErr').classList.remove('hidden'); }
    this.state = 'menu'; this.show('menu'); this.fillPresets();
    window.__ready = true;
    this.buildMenuGun().then(() => this.loadNpcs()).catch(e => console.warn('[game] prefetch', e));
    // hot swap: check for the armory's manifest every few seconds while in menus
    setInterval(async () => { if (this.state === 'menu' || this.state === 'gunsmith') { const changed = await Armory.refresh(); if (changed && this.state === 'gunsmith') await this.gunsmith.open(); } }, 5000);
    if (params.has('play')) { this.testMode = params.has('test'); this.loadoutId = params.get('loadout') || 'm4'; await this.startGame(params.get('play'), params.get('mode') || 'ffa', +(params.get('diff') ?? 1)); window.__playing = true; }
  }
}

const G = new Game();
window.__game = G;
// ---------------------------------------------------------------- test API (used by tools/bot.mjs)
window.__test = {
  async load(map, mode = 'ffa', loadout = 'm4') { G.testMode = true; G.loadoutId = loadout; await G.startGame(map, mode, 1); return { boxes: G.world.boxes.length, npcs: G.npcs.list.length, cover: G.world.cover.length }; },
  // place an NPC in front of the player with a clear line, freeze its AI, aim at a zone and fire one round
  // real=true fires through the weapon itself (ADS spread, zero, pellets, muzzle device stats) instead of one ideal round
  async shootNpc(zone = 'head', gunSlot = 0, dist = 10, real = false) {
    const P = G.player, W = G.world;
    await G.weapons.equip(gunSlot, true);
    G.vm.anim = null; G.weapons.cooldown = 0; G.weapons.reloading = null;
    const aimPoint = n => zone === 'head' ? n.headC.clone() : (() => { const c = n.caps.find(c => c.zone === zone); return c.pa.clone().lerp(c.pb, zone === 'chest' ? 0.45 : 0.5); })();
    // pick a fresh NPC and a standing spot with a clear line to the exact aim point (no other NPC in the way)
    let n = null, ok = false;
    const cands = G.npcs.alive.filter(x => x.hp >= G.npcs.diff.hp && x.state !== 'dummy');
    for (const cand of cands) {
      cand.state = 'dummy'; cand.moveSpeed = 0; cand.protUntil = 0; cand.updateTransform(0);
      for (const dd of [dist, dist * 0.7, dist * 1.4, 5]) {
        for (let k = 0; k < 24 && !ok; k++) {
          const a = k / 24 * Math.PI * 2, x = cand.pos.x + Math.cos(a) * dd, z = cand.pos.z + Math.sin(a) * dd;
          if (!W.walkable(x, z)) continue;
          const g = W.groundAt(x, z, cand.pos.y + 3, 0.3); if (g < -5) continue;
          P.spawn(x, g + 0.01, z, 0); P.update(1 / 60, { f: 0, s: 0 }, W, G.weapons.stats, null);
          const eye = P.camPos.clone(), tgt = aimPoint(cand), d = tgt.clone().sub(eye).normalize();
          if (!W.los(eye, tgt)) continue;
          if (W.raycast(eye, d, eye.distanceTo(tgt), bx => bx.shoot)) continue;
          const first = G.npcs.raycast(eye, d, 200);
          if (first && first.npc === cand && first.zone === zone.replace('chest', 'chest')) ok = true;
        }
        if (ok) break;
      }
      if (ok) { n = cand; break; }
      cand.state = 'patrol';
    }
    if (!ok) return { error: 'no clear line to a ' + zone };
    const target = aimPoint(n);
    const d = target.clone().sub(P.camPos).normalize();
    P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(d.y); P.recoil.p = P.recoil.y = 0;
    G.updateCamera(0);
    const hp0 = n.hp;
    const st = G.weapons.stats;
    if (real) {
      const vm = G.vm, a0 = vm.ads, w0 = vm.adsW; vm.ads = 1; vm.adsW = 1; G.weapons.lastShot = -9; G.weapons.cooldown = 0;
      const mag = G.weapons.slot.mag; G.weapons.slot.mag = Math.max(1, mag); G.weapons.fire(); vm.ads = a0; vm.adsW = w0;
    } else G.ballistics.fire({ pos: P.camPos.clone(), dir: d, velocity: st.velocity, damage: st.damage, team: 'player', owner: 'player', cls: st.cls, pen: st.pen, instant: true });
    for (let i = 0; i < 60 && G.ballistics.list.length; i++) G.ballistics.update(1 / 60);
    return { zone, gun: st.name, damage: st.damage, alive: n.alive, hpBefore: hp0, hpAfter: n.alive ? n.hp : 0, killedBy: n.deathZone || null, dist: P.camPos.distanceTo(target).toFixed(1) };
  },
  // put a given armory gun in slot 0 (bot: every gun class must one-shot a head)
  async equipGun(id) { const M = await import('./game/manifest.js'); await G.weapons.setLoadout([M.defaultConfig(id), M.defaultConfig(G.weapons.slots[1]?.cfg.gun || id)], { infinite: true }); return G.weapons.stats.name; },
  guns() { return Armory.m.guns.map(g => g.id); },
  match() { const M = G.match; return M ? { t: Math.round(M.t), over: M.over, mode: M.mode, A: M.teamScore('A'), B: M.teamScore('B'), roster: M.sorted().map(e => [e.name, e.team, e.kills, e.deaths, e.assists, e.score, e.actor.alive ? 1 : 0].join(' ')) } : null; },
  stats() { return { fps: G.fps, calls: G.frameInfo?.calls, tris: G.frameInfo?.tris, npcs: G.npcs.list.length, alive: G.npcs.alive.length, state: G.state, map: G.map?.id }; },
};
G.boot();
