// TOY SOLDIER BLITZ - build a fort on your half of the bedroom, then fight it out.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, rand, angDiff, rayBox, raySphere } from './util.js';
import { World, MAPS, HX, HZ, BUILD } from './world.js';
import { Pieces, PIECES, ORDER, makeMesh, footprint } from './pieces.js';
import { Soldier, MAXHP, MAG, GREN } from './soldier.js';
import { Bot } from './bot.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Net } from './net.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const isTouch = Q.has('touch') || (matchMedia('(pointer: coarse)').matches && !Q.has('mouse'));
if (isTouch) document.body.classList.add('touch');

// ------------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.25 : 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const world = new World(scene);
const pieces = new Pieces(scene, world);
const fx = new FX(scene);

// ------------------------------------------------------------------ save + progression
const SAVE_KEY = 'tsb-save-v1';
const save = { xp: 0, unlocked: 1, stars: {}, sens: 1, mute: false, tips: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* */ } };
const RANKS = [['PRIVATE', 0], ['CORPORAL', 250], ['SERGEANT', 600], ['LIEUTENANT', 1100], ['CAPTAIN', 1800], ['MAJOR', 2700], ['COLONEL', 3800], ['GENERAL', 5200]];
const rankOf = (xp) => { let r = 0; for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i][1]) r = i; return r; };
const budgetFor = (rank) => Math.min(20, 12 + rank);
if (Q.get('mute') === '1') save.mute = true;
Audio.setMuted(save.mute);

const OPS = [
  { name: 'BASIC TRAINING', map: 0, mode: 'team', size: 3, diff: 0, build: 30 },
  { name: 'PILLOW TALK', map: 1, mode: 'hill', size: 3, diff: 0 },
  { name: 'RUBBER DUCKY', map: 2, mode: 'duel', size: 1, diff: 1 },
  { name: 'HOMEWORK HELL', map: 3, mode: 'team', size: 4, diff: 1 },
  { name: 'SOAP OPERA', map: 2, mode: 'hill', size: 4, diff: 1 },
  { name: 'LIGHTS OUT', map: 0, mode: 'duel', size: 1, diff: 2 },
  { name: 'FORT KNOCKS', map: 1, mode: 'team', size: 5, diff: 2 },
  { name: 'FINAL EXAM', map: 3, mode: 'hill', size: 5, diff: 2 },
];
const MODE_NAME = { team: 'TEAM KO', hill: 'KING OF THE HILL', duel: 'DUEL' };
const NAMES = [['Sarge', 'Rocco', 'Dusty', 'Bolt', 'Tank'], ['Sandy', 'Khaki', 'Dune', 'Biscuit', 'Crumb']];

// ------------------------------------------------------------------ game state
const G = {
  phase: 'none', cfg: null, soldiers: [], me: null, score: [0, 0], hill: [0, 0], target: 12, time: 0, buildT: 0,
  ready: [false, false], botQueue: [], botQT: 0, grenades: [], events: [], result: null, timeScale: 1, slowT: 0,
  shake: 0, streak: 0, streakT: 0, killer: null, demo: false, mode: 'team', fallSent: new Map(), placed: [],
};
G.pieces = pieces;
let net = null;
const role = () => (G.cfg && G.cfg.online) || 'local'; // 'local' | 'host' | 'guest'
const myTeam = () => (role() === 'guest' ? 1 : 0);

// ------------------------------------------------------------------ queries used by bots + combat
G.rayBoxes = (ox, oy, oz, dx, dy, dz, maxT, noFloor) => {
  let best = maxT, hit = null;
  for (const b of world.allBoxes()) {
    if (noFloor && b.floor) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, best);
    if (t >= 0 && t < best) { best = t; hit = b; }
  }
  return hit ? { t: best, box: hit } : null;
};
G.los = (ax, ay, az, bx, by, bz) => {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  for (const b of world.allBoxes()) { if (b.wall) continue; const t = rayBox(ax, ay, az, dx / d, dy / d, dz / d, b, d); if (t >= 0 && t < d - 0.3) return false; }
  return true;
};
G.inHill = (s) => Math.hypot(s.x, s.z) < 4.5 && s.y < 4.5;
function rayScene(ox, oy, oz, dx, dy, dz, maxT, ignore, minT = 0) {
  let best = maxT, hit = null;
  for (const b of world.allBoxes()) {
    if (b.wall) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, best);
    if (t >= minT && t < best) { best = t; hit = { kind: 'box', box: b }; }
  }
  for (const s of G.soldiers) {
    if (s === ignore || !s.alive) continue;
    const th = raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y + 1.66, s.z, 0.21);
    if (th >= minT && th < best) { best = th; hit = { kind: 'head', s }; }
    const tb = rayBox(ox, oy, oz, dx, dy, dz, { x0: s.x - 0.3, x1: s.x + 0.3, y0: s.y, y1: s.y + 1.48, z0: s.z - 0.3, z1: s.z + 0.3 }, best);
    if (tb >= minT && tb < best) { best = tb; hit = { kind: 'body', s }; }
  }
  return { t: best, hit, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best };
}
// the third-person aim ray: what the crosshair sees, for the local player and the online guest alike
function aimRay(s) {
  const back = s.input.aim ? 1.7 : 3.4, side = s.input.aim ? 0.55 : 0.7;
  const rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw);
  const d = s.dir();
  const px = s.x + rx * side, py = s.y + 1.62, pz = s.z + rz * side;
  return { o: [px - d[0] * back, py - d[1] * back + 0.25, pz - d[2] * back], d, back, pivot: [px, py, pz] };
}

// ------------------------------------------------------------------ match setup
function clearSoldiers() { for (const s of G.soldiers) s.dispose(); G.soldiers = []; G.me = null; }
let hillMesh = null, zoneMeshes = [], ghost = null, ghostType = '', ghostMat = null;
const grenMeshes = [];

function startMatch(cfg) {
  G.cfg = cfg = Object.assign({ map: 0, mode: 'team', size: 3, diff: 1, op: -1, online: false, build: 35 }, cfg);
  G.demo = !!cfg.demo; G.mode = cfg.mode;
  world.build(cfg.map); pieces.clear(); fx.clear();
  pieces.onBreak = onBreak; pieces.onLand = (p) => { if (!G.fast) Audio.wood(0.7); fx.chip(p.x, p.y + 0.1, p.z, 0xd8b07a, 5, 3, 0.1); };
  for (const g of G.grenades) g.mesh.visible = false;
  G.grenades = []; G.events = []; G.score = [0, 0]; G.hill = [0, 0]; G.result = null; G.timeScale = 1; G.slowT = 0; G.streak = 0; G.killer = null; G.placed = [];
  G.target = cfg.mode === 'duel' ? 5 : cfg.mode === 'hill' ? 60 : cfg.size * 4;
  G.time = cfg.mode === 'duel' ? 120 : 150;
  clearSoldiers();
  for (let t = 0; t < 2; t++) for (let i = 0; i < cfg.size; i++) {
    const s = new Soldier(t, scene, NAMES[t][i % 5]);
    G.soldiers.push(s);
  }
  G.soldiers.forEach((s, i) => { s.id = i + 1; });
  const mine = G.soldiers.find((s) => s.team === myTeam());
  if (!G.demo) { G.me = mine; mine.local = true; mine.name = 'YOU'; }
  const rival = role() === 'local' ? null : G.soldiers.find((s) => s.team === 1 - myTeam());
  if (rival) { rival.name = 'RIVAL'; if (role() === 'host') rival.remote = true; }
  for (const s of G.soldiers) {
    if (s.local || s.remote) continue;
    if (role() === 'guest') continue; // the host runs every bot
    s.bot = new Bot(s, cfg.diff);
  }
  if (Q.has('bot') && G.me && role() !== 'guest') G.me.bot = new Bot(G.me, 2);
  G.soldiers.forEach((s) => respawn(s, true));
  // hill zone
  if (hillMesh) { scene.remove(hillMesh); hillMesh = null; }
  if (cfg.mode === 'hill') {
    hillMesh = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.5, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; hillMesh.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.025; hillMesh.add(disc);
    hillMesh.userData = { ring, disc };
    scene.add(hillMesh);
  }
  // build zone overlays
  for (const z of zoneMeshes) scene.remove(z);
  zoneMeshes = [0, 1].map((t) => {
    const w = BUILD.x * 2, d = BUILD.zMax - BUILD.zMin;
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); return c; })());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w, d);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, color: t === myTeam() ? 0x9fffa0 : 0xff9a7a, transparent: true, opacity: 0.22, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, (t === 0 ? -1 : 1) * (BUILD.zMin + d / 2)); scene.add(m); return m;
  });
  // the build phase
  G.phase = 'build'; G.buildT = G.demo ? 0 : cfg.build; G.ready = [false, false];
  const rank = rankOf(save.xp);
  G.budget = [budgetFor(rank), budgetFor(rank)];
  if (role() !== 'local') G.budget = [16, 16];
  G.botQueue = [];
  if (role() === 'local') {
    const bTeams = G.demo ? [0, 1] : [1];
    for (const t of bTeams) for (const p of pieces.plan(t, G.budget[t] + (t === 1 ? cfg.diff : 0), Math.floor(Math.random() * 1e6))) G.botQueue.push([t, ...p]);
    G.botQueue.sort(() => Math.random() - 0.5);
  }
  G.botQT = 1;
  buildSel = 'block'; buildRot = 0; buildPan = [0, 0]; buildZoom = 1;
  if (G.demo) { while (G.botQueue.length) botPlaceNext(); beginFight(); return; }
  showHUD(true); $('buildbar').classList.remove('hidden'); $('result').classList.add('hidden');
  refreshBuildBar();
  banner(OPS[cfg.op] ? OPS[cfg.op].name : MAPS[cfg.map].name, MODE_NAME[cfg.mode] + ' · ' + MAPS[cfg.map].sub);
  if (save.tips < 3) tip(isTouch ? 'Tap your green half to place pieces. Then hit READY.' : 'Click your green half to place pieces. R rotates, 1-5 picks. Then READY.', 6);
  Audio.music(false);
}

function respawn(s, first) {
  const side = s.team === 0 ? -1 : 1;
  const xs = [-13, -6.5, 0, 6.5, 13];
  let best = 0, bd = -1;
  xs.forEach((x, i) => {
    let md = 99; for (const e of G.soldiers) if (e.team !== s.team && e.alive && e !== s) md = Math.min(md, Math.hypot(e.x - x, e.z - side * 23));
    const taken = first ? G.soldiers.filter((o) => o !== s && o.team === s.team && Math.abs(o.x - x) < 1 && o.alive).length * 50 : 0;
    // prefer lanes with an open view towards the fight (no book stack in your face)
    const blk = G.rayBoxes(x, 1.5, side * 23, 0, 0, -side, 7, true);
    const sc = md - taken + Math.random() - (blk ? (first ? 40 : 12) * (1 - blk.t / 7) : 0);
    if (sc > bd) { bd = sc; best = x; }
  });
  s.spawn(best + rand(-0.6, 0.6), side * 23 + rand(-0.6, 0.6));
  s.y = world.supportAt(s.x - 0.3, s.z - 0.3, s.x + 0.3, s.z + 0.3) + 0.01;
  if (first) s.spawnProt = 0;
}

function beginFight() {
  // anything still queued by a bot builder drops in now
  while (G.botQueue.length) botPlaceNext();
  G.phase = 'fight';
  for (const z of zoneMeshes) z.visible = false;
  if (ghost) ghost.visible = false;
  G.soldiers.forEach((s) => respawn(s, true));
  $('buildbar').classList.add('hidden');
  if (G.demo) return;
  banner('FIGHT!', G.mode === 'hill' ? 'Hold the circle in the middle' : G.mode === 'duel' ? 'First to 5 KOs' : 'First team to ' + G.target + ' KOs');
  Audio.horn(); Audio.music(true);
  if (save.tips < 3) { tip(isTouch ? 'Left stick moves, drag right side to aim. BANG throws a firecracker.' : 'WASD + mouse. Click shoots, right-click aims, G throws a firecracker.', 6); save.tips++; persist(); }
  if (role() === 'host') net.send({ ph: 'fight' });
  lockPointer();
}

function botPlaceNext() {
  const q = G.botQueue.shift(); if (!q) return;
  const [t, type, rot, x, z] = q;
  if (pieces.spent(t) + PIECES[type].cost > G.budget[t] + (t === 1 ? (G.cfg.diff || 0) : 0)) return;
  const p = pieces.add(type, rot, x, z, t);
  if (p && !G.fast && G.phase === 'build') { Audio.wood(0.9 + Math.random() * 0.3); fx.chip(p.x, p.y + 0.2, p.z, 0xe8c48a, 4, 3, 0.1); }
}

// ------------------------------------------------------------------ combat
function shoot(s) {
  let o, d, minT = 0, cam = false;
  if (s.bot) { o = [s.x, s.y + 1.62, s.z]; d = s.dir(); }
  else { const a = aimRay(s); o = a.o; d = a.d; minT = a.back + 0.25; cam = true; }
  const spd = Math.hypot(s.vx, s.vz);
  const spread = (s.input.aim ? 0.004 : 0.016) + spd * 0.0025 + (s.ground ? 0 : 0.03) + (s.bloom || 0);
  s.bloom = Math.min(0.05, (s.bloom || 0) + 0.008);
  // random cone around d
  const ux = -d[2], uz = d[0], ul = Math.hypot(ux, uz) || 1;
  const a1 = rand(-spread, spread), a2 = rand(-spread, spread);
  let dx = d[0] + (ux / ul) * a1, dy = d[1] + a2, dz = d[2] + (uz / ul) * a1;
  const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
  let r = rayScene(o[0], o[1], o[2], dx, dy, dz, 90, s, minT);
  // muzzle position (approximate, so it works with no rendering at all)
  const rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw);
  const mx = s.x + d[0] * 0.75 + rx * 0.12, my = s.y + 1.5 + d[1] * 0.75, mz = s.z + d[2] * 0.75 + rz * 0.12;
  if (cam) {
    // something between the muzzle and where the crosshair landed? that eats the bullet
    const ex = r.x - mx, ey = r.y - my, ez = r.z - mz, el = Math.hypot(ex, ey, ez);
    if (el > 0.2) { const r2 = rayScene(mx, my, mz, ex / el, ey / el, ez / el, el - 0.05, s, 0); if (r2.hit) r = r2; }
  }
  const h = r.hit;
  let kind = 0;
  if (h && (h.kind === 'head' || h.kind === 'body')) {
    kind = h.kind === 'head' ? 3 : 2;
    hurt(h.s, h.kind === 'head' ? 45 : 20, s, h.kind === 'head', [dx, dy, dz], [r.x, r.y, r.z]);
  } else if (h && h.box.piece) { kind = 1; pieces.damage(h.box.piece, 14); }
  else if (h) kind = 4;
  shotFx(s, mx, my, mz, r.x, r.y, r.z, kind);
  if (role() === 'host') G.events.push(['s', s.id, ...[mx, my, mz, r.x, r.y, r.z].map(r2), kind]);
  if (s === G.me) { G.shake = Math.max(G.shake, 0.06); s.pitch += 0.006; }
}
const r2 = (v) => Math.round(v * 100) / 100;
function shotFx(s, mx, my, mz, x, y, z, kind) {
  if (G.fast) return;
  s.recoil = 1;
  fx.muzzle(mx, my, mz);
  fx.tracer(mx, my, mz, x, y, z, s.team ? 0xffd08a : 0xd8ff9a);
  if (kind === 1) fx.impact(x, y, z, 0xd8b07a, true);
  else if (kind === 4) fx.impact(x, y, z, 0xbbbbbb, false);
  else if (kind >= 2) fx.chip(x, y, z, s.team ? 0x4f7a32 : 0xc9a66b, 4, 3, 0.07);
  const dist = Math.hypot(camera.position.x - mx, camera.position.z - mz);
  Audio.shot(s === G.me ? 1 : clamp(1.2 - dist / 40, 0, 0.7));
  if (kind === 1 && Math.random() < 0.5) Audio.chip();
}

function hurt(v, dmg, a, head, dir, at) {
  if (!v.alive || v.spawnProt > 0) return;
  if (a && a.team === v.team && a !== v) return; // no friendly fire
  v.hp -= dmg; v.hurtT = 0; v.lastHitBy = a;
  if (a === G.me && v !== G.me) hitFeedback(dmg, head, at || [v.x, v.y + 1.4, v.z], v.hp <= 0);
  if (v === G.me) { G.shake = Math.max(G.shake, 0.18); flashHurt(); if (!G.fast) Audio.hurt(); }
  if (v.hp <= 0) kill(v, a, head, dir);
}
function kill(v, a, head, dir) {
  v.alive = false; v.hp = 0; v.deaths++; v.respawnT = 3.2; v.deadT = 0;
  dir = dir || [0, 0, 1];
  const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
  const lx = dir[0] * cs - dir[2] * sn, lz = dir[0] * sn + dir[2] * cs, ll = Math.hypot(lx, lz) || 1;
  v.tip.ax = lz / ll; v.tip.az = -lx / ll;
  if (!G.fast) { fx.chip(v.x, v.y + 1, v.z, v.team ? 0xc9a66b : 0x4f7a32, 12, 5, 0.11); if (head) fx.chip(v.x, v.y + 1.7, v.z, v.team ? 0xc9a66b : 0x4f7a32, 6, 4, 0.09); }
  if (a && a !== v) { a.kills++; if (G.mode !== 'hill') G.score[a.team]++; bumpScore(a.team); }
  else if (G.mode !== 'hill') { G.score[1 - v.team]++; bumpScore(1 - v.team); }
  feed(a, v, head);
  if (a === G.me && v !== G.me) {
    G.streak = G.streakT > 0 ? G.streak + 1 : 1; G.streakT = 4;
    banner(G.streak >= 4 ? 'RAMPAGE!' : G.streak === 3 ? 'TRIPLE KO!' : G.streak === 2 ? 'DOUBLE KO!' : head ? 'HEADSHOT!' : 'KO!', '', 0.9);
    if (!G.fast) Audio.kill();
  }
  if (v === G.me) { G.killer = a && a !== v ? a : null; G.streak = 0; if (!G.fast) Audio.died(); sub(a && a !== v ? 'KO’d by ' + a.name : 'Oops', 3); }
  if (role() === 'host') G.events.push(['k', a ? a.id : 0, v.id, head ? 1 : 0, r2(v.tip.ax), r2(v.tip.az)]);
}

function throwGren(s) {
  s.gren--; s.grenT = 0.6;
  let d;
  if (s.bot) d = s.dir(); else d = aimRay(s).d;
  const sp = 15;
  const g = { x: s.x + d[0] * 0.6, y: s.y + 1.6, z: s.z + d[2] * 0.6, vx: d[0] * sp + s.vx * 0.5, vy: d[1] * sp + 4.5, vz: d[2] * sp + s.vz * 0.5, t: 1.7, owner: s, sparkT: 0 };
  g.mesh = grenMesh(); g.mesh.visible = true;
  G.grenades.push(g);
  if (!G.fast) Audio.throwIt();
}
function grenMesh() {
  let m = grenMeshes.find((q) => !q.visible);
  if (!m) {
    m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 14), new THREE.MeshPhysicalMaterial({ color: 0xd8282a, roughness: 0.3, clearcoat: 0.8 }));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0xffd23a }));
    m.add(body, band); m.traverse((o) => { o.castShadow = true; }); scene.add(m); grenMeshes.push(m);
  }
  return m;
}
function updateGrenades(dt) {
  const boxes = world.allBoxes();
  for (const g of G.grenades.slice()) {
    for (let k = 0; k < 2; k++) {
      const h = dt / 2;
      g.vy -= 22 * h;
      for (const ax of ['x', 'y', 'z']) {
        const v = 'v' + ax; const prev = g[ax]; g[ax] += g[v] * h;
        for (const b of boxes) if (g.x > b.x0 - 0.08 && g.x < b.x1 + 0.08 && g.y > b.y0 - 0.08 && g.y < b.y1 + 0.08 && g.z > b.z0 - 0.08 && g.z < b.z1 + 0.08) {
          g[ax] = prev; g[v] *= -0.4; if (ax === 'y') { g.vx *= 0.7; g.vz *= 0.7; }
          if (Math.abs(g[v]) > 2 && !G.fast) Audio.tick();
          break;
        }
      }
    }
    g.t -= dt;
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * 9; g.mesh.rotation.z += dt * 5;
    g.sparkT -= dt;
    if (g.sparkT <= 0 && !G.fast) { g.sparkT = 0.04; fx.sprite(g.x, g.y + 0.2, g.z, { color: 0xffe08a, size: 0.25, life: 0.15, grow: 0.5, vy: 1, add: true, a0: 1 }); }
    if (g.t <= 0) { explode(g.x, g.y, g.z, g.owner); g.mesh.visible = false; G.grenades.splice(G.grenades.indexOf(g), 1); }
  }
}
function explode(x, y, z, owner) {
  if (!G.fast) {
    fx.boom(x, y, z);
    const dc = Math.hypot(camera.position.x - x, camera.position.z - z);
    Audio.boom(clamp(1.3 - dc / 40, 0.15, 1)); G.shake = Math.max(G.shake, clamp(0.9 - dc / 25, 0.05, 0.6));
  }
  const R = 4.6;
  for (const s of G.soldiers) {
    if (!s.alive) continue;
    const dx = s.x - x, dy = s.y + 0.9 - y, dz = s.z - z, d = Math.hypot(dx, dy, dz);
    if (d > R) continue;
    if (!G.los(x, y + 0.3, z, s.x, s.y + 1.0, s.z) && d > 1.5) continue;
    const f = 1 - d / R;
    s.vx += dx / (d || 1) * 10 * f; s.vz += dz / (d || 1) * 10 * f; s.vy = Math.max(s.vy, 6 * f); s.ground = false;
    hurt(s, (s === owner ? 0.5 : 1) * (12 + 95 * f), owner, false, [dx, 0.5, dz]);
  }
  for (const p of pieces.list.slice()) {
    const [w, d] = footprint(p.type, p.rot);
    const cx = clamp(x, p.x - w / 2, p.x + w / 2), cz = clamp(z, p.z - d / 2, p.z + d / 2), cy = clamp(y, p.y, p.y + 2);
    const dd = Math.hypot(cx - x, cy - y, cz - z);
    if (dd < R) pieces.damage(p, 40 + 170 * (1 - dd / R));
  }
  if (role() === 'host') G.events.push(['b', r2(x), r2(y), r2(z)]);
}
function onBreak(p) {
  if (role() === 'host') G.events.push(['br', p.id]);
  if (G.fast) return;
  const col = p.type === 'wall' ? 0x222226 : p.type === 'plank' ? 0xf5d76e : p.type === 'ramp' ? (p.team ? 0xd9634a : 0x4a9ad9) : 0xe0b880;
  const [w, d] = footprint(p.type, p.rot);
  for (let i = 0; i < 4; i++) fx.chip(p.x + rand(-w / 3, w / 3), p.y + rand(0.3, 1.6), p.z + rand(-d / 3, d / 3), col, 5, 6, 0.22);
  fx.sprite(p.x, p.y + 1, p.z, { color: 0xd8c09a, size: 2, life: 1.2, grow: 2, vy: 0.6, a0: 0.5 });
  Audio.crack();
  const dc = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
  G.shake = Math.max(G.shake, clamp(0.3 - dc / 60, 0, 0.25));
}

// ------------------------------------------------------------------ simulation (host / local)
function sim(dt) {
  if (G.phase === 'build') {
    G.buildT -= dt;
    G.botQT -= dt;
    if (G.botQueue.length && G.botQT <= 0) { G.botQT = Math.max(0.35, (G.cfg.build * 0.75) / Math.max(1, G.botQueue.length + 2)); botPlaceNext(); }
    pieces.update(dt);
    const allReady = role() === 'local' ? G.ready[0] : G.ready[0] && G.ready[1];
    if (G.buildT <= 0 || allReady) beginFight();
    return;
  }
  if (G.phase !== 'fight' && G.phase !== 'over') return;
  const boxes = world.allBoxes();
  for (const s of G.soldiers) if (s.bot && G.phase === 'fight') s.bot.update(dt, G);
  if (G.me && !G.me.bot && G.phase === 'fight') readLocalInput(G.me);
  for (const s of G.soldiers) {
    if (!s.alive) {
      s.respawnT -= dt;
      if (s.respawnT <= 0 && G.phase === 'fight') respawn(s);
      continue;
    }
    const inp = s.input;
    s.fireT -= dt; s.grenT -= dt; s.hurtT += dt; s.spawnProt -= dt; s.bloom = Math.max(0, (s.bloom || 0) - dt * 0.12);
    if (s.hurtT > 4 && s.hp < MAXHP) s.hp = Math.min(MAXHP, s.hp + dt * 25);
    if (s.reloadT > 0) { s.reloadT -= dt; if (s.reloadT <= 0) s.ammo = MAG; }
    if (G.phase === 'fight') {
      if (inp.reload && s.ammo < MAG && s.reloadT <= 0) { s.reloadT = 1.3; if (s === G.me) Audio.reload(); }
      if (inp.fire && s.fireT <= 0 && s.reloadT <= 0) {
        if (s.ammo > 0) { s.fireT = 1 / 7.5; s.ammo--; s.spawnProt = 0; shoot(s); if (s.ammo === 0) { s.reloadT = 1.3; if (s === G.me) Audio.reload(); } }
        else { s.fireT = 0.25; if (s === G.me) Audio.empty(); }
      }
      if (inp.gren && !s.prevGren && s.gren > 0 && s.grenT <= 0) { s.spawnProt = 0; throwGren(s); }
      s.prevGren = inp.gren;
    } else { inp.fire = false; inp.mx = inp.mz = 0; }
    s.jumped = s.landed = false;
    s.move(dt, boxes, world.water);
    if (s === G.me && !G.fast) { if (s.jumped) Audio.jump(); if (s.landed) Audio.land(); }
    if (s.hp <= 0 && s.alive) kill(s, s.lastHitBy || null, false, [0, 0, 1]);
  }
  updateGrenades(dt);
  pieces.update(dt);
  if (G.phase !== 'fight') return;
  if (G.mode === 'hill') {
    const inz = [0, 0]; for (const s of G.soldiers) if (s.alive && G.inHill(s)) inz[s.team]++;
    G.contested = inz[0] > 0 && inz[1] > 0;
    G.holder = G.contested ? -1 : inz[0] ? 0 : inz[1] ? 1 : -1;
    if (G.holder >= 0) { const before = Math.floor(G.hill[G.holder]); G.hill[G.holder] += dt; if (Math.floor(G.hill[G.holder]) !== before && G.holder === myTeam() && !G.fast && Math.floor(G.hill[G.holder]) % 5 === 0) Audio.tick(); }
    G.score = [Math.floor(G.hill[0]), Math.floor(G.hill[1])];
  }
  G.time -= dt;
  G.streakT -= dt;
  const won = G.score[0] >= G.target ? 0 : G.score[1] >= G.target ? 1 : -2;
  if (won >= 0) endMatch(won);
  else if (G.time <= 0) endMatch(G.score[0] > G.score[1] ? 0 : G.score[1] > G.score[0] ? 1 : -1);
}

function endMatch(win) {
  G.phase = 'over'; G.winner = win;
  if (G.demo) { setTimeout(() => { if (G.demo && G.phase === 'over') startMatch(demoCfg()); }, 2500); return; }
  G.timeScale = 0.25; G.slowT = 1.4;
  const mine = myTeam(), victory = win === mine;
  banner(victory ? 'VICTORY!' : win === -1 ? 'DRAW' : 'DEFEAT', '', 2);
  Audio.music(false); Audio.bugle(victory);
  if (role() === 'host') net.send({ end: { win, sc: G.score } });
  finishResult(win);
}
function finishResult(win) {
  const mine = myTeam(), victory = win === mine, me = G.me;
  const margin = G.score[mine] - G.score[1 - mine];
  let stars = 0;
  if (victory) { stars = 1; if (me.kills >= me.deaths) stars++; if (margin >= G.target * 0.4) stars++; }
  const xp = (victory ? 120 : 40) + me.kills * 15;
  const r0 = rankOf(save.xp); save.xp += xp; const r1 = rankOf(save.xp);
  const op = G.cfg.op;
  if (op >= 0 && victory) { save.unlocked = Math.max(save.unlocked, op + 2); save.stars[op] = Math.max(save.stars[op] || 0, stars); }
  persist();
  G.result = { win, victory, stars, xp, rankUp: r1 > r0, kills: me.kills, deaths: me.deaths };
  setTimeout(() => showResult(), 1700);
}
function showResult() {
  if (!G.result) return;
  const R = G.result, mine = myTeam();
  unlockPointer();
  $('r-title').textContent = R.victory ? 'VICTORY' : R.win === -1 ? 'DRAW' : 'DEFEAT';
  $('r-title').classList.toggle('lose', !R.victory);
  $('r-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < R.stars ? '' : 'off'}">★</span>`).join('');
  $('r-stats').innerHTML = `Score ${G.score[mine]} - ${G.score[1 - mine]}<br>KOs ${R.kills} &middot; Times KO'd ${R.deaths}`;
  $('r-xp').textContent = `+${R.xp} XP` + (R.rankUp ? `  ·  PROMOTED TO ${RANKS[rankOf(save.xp)][0]}! (+1 build budget)` : '');
  const op = G.cfg.op;
  $('r-next').classList.toggle('hidden', !(R.victory && op >= 0 && op + 1 < OPS.length));
  $('r-retry').classList.toggle('hidden', role() !== 'local');
  $('result').classList.remove('hidden');
  bannerT = 0; subT = 0; tipT = 0;
}

// ------------------------------------------------------------------ input
const keys = new Set();
let mouseL = false, mouseR = false, locked = false, buildSel = 'block', buildRot = 0, buildPan = [0, 0], buildZoom = 1;
const cursor = new THREE.Vector2(0, 0.2);
const touchState = { mx: 0, mz: 0, fire: false, aim: false, jump: false, gren: false, reload: false, stickId: null, lookId: null, lx: 0, ly: 0 };
const latch = { jump: false, gren: false, reload: false };
function readLocalInput(s) {
  const inp = s.input;
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  mx += touchState.mx; mz += touchState.mz;
  inp.mx = clamp(mx, -1, 1); inp.mz = clamp(mz, -1, 1);
  inp.fire = mouseL || touchState.fire;
  inp.aim = mouseR || touchState.aim;
  inp.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || (isTouch && Math.hypot(touchState.mx, touchState.mz) > 0.95 && !inp.aim);
  inp.jump = keys.has('Space') || latch.jump;
  inp.gren = latch.gren || keys.has('KeyG');
  inp.reload = latch.reload;
  latch.jump = latch.gren = latch.reload = false;
}
function lockPointer() {
  if (isTouch || G.demo || Q.has('nolock')) return;
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* */ }
}
function unlockPointer() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* */ } }
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked) { mouseL = mouseR = false; } });

addEventListener('keydown', (e) => {
  Audio.init();
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyM') { save.mute = !save.mute; Audio.setMuted(save.mute); persist(); }
  if (G.phase === 'build' && !G.demo) {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (i >= 0) selectPiece(ORDER[i]);
    if (e.code === 'KeyR' || e.code === 'KeyQ' || e.code === 'KeyE') { buildRot = (buildRot + (e.code === 'KeyQ' ? 3 : 1)) % 4; Audio.click(); }
    if (e.code === 'KeyF') autoBuild();
    if (e.code === 'KeyZ') undoPiece();
    if (e.code === 'Enter') pressReady();
  } else if (G.phase === 'fight') {
    if (e.code === 'Space') latch.jump = true;
    if (e.code === 'KeyR') latch.reload = true;
    if (e.code === 'KeyG') latch.gren = true;
  } else if (!$('result').classList.contains('hidden')) {
    if (e.code === 'KeyR' && role() === 'local') $('r-retry').click();
    if (e.code === 'KeyN' && !$('r-next').classList.contains('hidden')) $('r-next').click();
  }
  if (e.code === 'Escape' && G.phase !== 'fight') { /* pointer lock exit handles fight */ }
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  Audio.init();
  if (isTouch) return;
  if (G.phase === 'build' && !G.demo) {
    setCursor(e);
    if (e.button === 0) placePiece(); else if (e.button === 2) removeAtCursor();
    return;
  }
  if (G.phase === 'fight') {
    if (!locked && !Q.has('nolock')) { lockPointer(); return; }
    if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true;
  }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('mousemove', (e) => {
  if (G.phase === 'build') setCursor(e);
  if (locked && G.me && G.me.alive && G.phase === 'fight') look(e.movementX, e.movementY);
});
addEventListener('wheel', (e) => { if (G.phase === 'build') buildZoom = clamp(buildZoom + Math.sign(e.deltaY) * 0.1, 0.6, 1.4); }, { passive: true });
function look(dx, dy) {
  const k = 0.0023 * save.sens * (G.me.input.aim ? 0.55 : 1);
  G.me.yaw -= dx * k; G.me.pitch = clamp(G.me.pitch - dy * k, -1.2, 1.25);
  if (role() === 'guest') { /* yaw is ours; sent with input */ }
}
function setCursor(e) { cursor.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }

// touch
if (isTouch) {
  $('touch').classList.remove('hidden');
  const stick = $('stick'), knob = $('knob');
  stick.addEventListener('pointerdown', (e) => { Audio.init(); touchState.stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === touchState.stickId) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== touchState.stickId) return; touchState.stickId = null; touchState.mx = touchState.mz = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
  function moveStick(e) {
    const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    touchState.mx = dx; touchState.mz = -dy; knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
  }
  const hold = (id, k) => { const b = $(id); b.addEventListener('pointerdown', (e) => { Audio.init(); e.preventDefault(); touchState[k] = true; }); const up = () => { touchState[k] = false; }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); };
  hold('t-fire', 'fire');
  $('t-aim').addEventListener('pointerdown', (e) => { e.preventDefault(); touchState.aim = !touchState.aim; $('t-aim').style.background = touchState.aim ? '#ffd23a' : ''; });
  $('t-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); latch.jump = true; });
  $('t-gren').addEventListener('pointerdown', (e) => { e.preventDefault(); latch.gren = true; });
  $('t-rel').addEventListener('pointerdown', (e) => { e.preventDefault(); latch.reload = true; });
}
let tapStart = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  Audio.init();
  if (G.phase === 'build') { tapStart = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, px: buildPan[0], pz: buildPan[1] }; return; }
  if (touchState.lookId == null) { touchState.lookId = e.pointerId; touchState.lx = e.clientX; touchState.ly = e.clientY; }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') return;
  if (G.phase === 'build' && tapStart && e.pointerId === tapStart.id) {
    const dx = e.clientX - tapStart.x, dy = e.clientY - tapStart.y;
    if (Math.hypot(dx, dy) > 12) tapStart.moved = true;
    if (tapStart.moved) { const s = myTeam() ? -1 : 1; buildPan[0] = clamp(tapStart.px + dx * 0.04 * s, -10, 10); buildPan[1] = clamp(tapStart.pz + dy * 0.04 * s, -6, 6); }
    setCursor(e); return;
  }
  if (e.pointerId === touchState.lookId && G.me && G.phase === 'fight') {
    look((e.clientX - touchState.lx) * 2.2, (e.clientY - touchState.ly) * 2.2);
    touchState.lx = e.clientX; touchState.ly = e.clientY;
  }
});
const endTouch = (e) => {
  if (e.pointerType === 'mouse') return;
  if (G.phase === 'build' && tapStart && e.pointerId === tapStart.id) { if (!tapStart.moved) { setCursor(e); updateGhost(); placePiece(); } tapStart = null; }
  if (e.pointerId === touchState.lookId) touchState.lookId = null;
};
canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);

// ------------------------------------------------------------------ building (player side)
const raycaster = new THREE.Raycaster();
let cursorHit = null;
function updateGhost() {
  if (G.phase !== 'build' || G.demo) { if (ghost) ghost.visible = false; return; }
  raycaster.setFromCamera(cursor, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  let t = d.y < -0.01 ? -o.y / d.y : 200;
  const hit = G.rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, t, true);
  if (hit && !hit.box.wall) t = hit.t;
  const x = o.x + d.x * t, z = o.z + d.z * t;
  if (ghostType !== buildSel) {
    if (ghost) scene.remove(ghost);
    ghost = makeMesh(buildSel, myTeam(), 1); ghostType = buildSel;
    ghostMat = ghostMat || new THREE.MeshBasicMaterial({ color: 0x7cff7a, transparent: true, opacity: 0.45, depthWrite: false });
    ghost.traverse((m) => { if (m.isMesh) { m.material = ghostMat; m.castShadow = false; } });
    scene.add(ghost);
  }
  const res = pieces.test(buildSel, buildRot, x, z, myTeam());
  const afford = pieces.spent(myTeam()) + PIECES[buildSel].cost <= G.budget[myTeam()];
  cursorHit = Object.assign(res, { afford });
  ghost.visible = true; ghost.position.set(res.x, res.y + 0.02, res.z); ghost.rotation.y = buildRot * Math.PI / 2;
  ghostMat.color.set(res.ok && afford ? 0x7cff7a : 0xff5a4a);
  ghostMat.opacity = 0.38 + Math.sin(performance.now() / 150) * 0.08;
}
function placePiece() {
  updateGhost();
  const c = cursorHit; if (!c) return;
  const t = myTeam();
  if (!c.ok || !c.afford) { Audio.deny(); bbMsg(!c.afford ? 'Out of build points - undo something or hit READY' : 'Can’t build there: ' + c.why); return; }
  if (role() === 'guest') { net.send({ pl: [buildSel, buildRot, c.x, c.z] }); Audio.wood(); return; }
  const p = pieces.add(buildSel, buildRot, c.x, c.z, t);
  if (p) { G.placed.push(p.id); Audio.wood(); fx.chip(p.x, p.y + 0.1, p.z, 0xe8c48a, 6, 3, 0.1); if (role() === 'host') net.send({ pa: packPiece(p) }); }
  refreshBuildBar();
}
function removeAtCursor() {
  raycaster.setFromCamera(cursor, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const hit = G.rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, 200, true);
  if (hit && hit.box.piece && hit.box.piece.team === myTeam()) removeOwn(hit.box.piece);
}
function removeOwn(p) {
  if (role() === 'guest') { net.send({ pr: p.id }); return; }
  pieces.remove(p); G.placed = G.placed.filter((i) => i !== p.id); Audio.click(); fx.chip(p.x, p.y + 0.5, p.z, 0xe8c48a, 6, 3, 0.1);
  if (role() === 'host') net.send({ prm: p.id });
  refreshBuildBar();
}
function undoPiece() {
  const mine = pieces.list.filter((p) => p.team === myTeam());
  const p = mine[mine.length - 1]; if (p) removeOwn(p);
}
function autoBuild() {
  const t = myTeam();
  const plan = pieces.plan(t, G.budget[t] - pieces.spent(t));
  let n = 0;
  plan.forEach(([type, rot, x, z], i) => {
    setTimeout(() => {
      if (G.phase !== 'build') return;
      if (role() === 'guest') { net.send({ pl: [type, rot, x, z] }); return; }
      if (pieces.spent(t) + PIECES[type].cost > G.budget[t]) return;
      const p = pieces.add(type, rot, x, z, t);
      if (p) { n++; G.placed.push(p.id); if (!G.fast) { Audio.wood(1 + Math.random() * 0.2); fx.chip(p.x, p.y + 0.1, p.z, 0xe8c48a, 5, 3, 0.1); } if (role() === 'host') net.send({ pa: packPiece(p) }); }
      refreshBuildBar();
    }, G.fast ? 0 : i * 90);
  });
}
function pressReady() {
  if (G.phase !== 'build') return;
  Audio.click();
  if (role() === 'guest') { net.send({ rd: 1 }); G.ready[1] = true; bbMsg('Ready! Waiting for the host...'); return; }
  G.ready[0] = true;
  if (role() === 'host') bbMsg('Ready! Waiting for your rival...');
  if (role() === 'local') beginFight();
}
function selectPiece(t) {
  if (PIECES[t].rank > rankOf(save.xp) && role() === 'local') { Audio.deny(); bbMsg(PIECES[t].name + ' unlocks at rank ' + RANKS[PIECES[t].rank][0]); return; }
  buildSel = t; Audio.click(); refreshBuildBar();
}
function bbMsg(t) { $('bb-msg').textContent = t; clearTimeout(bbMsg.t); bbMsg.t = setTimeout(() => { $('bb-msg').textContent = ''; }, 2500); }
function pieceIcon(type) {
  const c = document.createElement('canvas'); c.width = 112; c.height = 80; const g = c.getContext('2d');
  g.lineWidth = 3; g.strokeStyle = '#3a2a12';
  const box = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
  if (type === 'block') { box(34, 18, 44, 44, '#e8c48a'); g.fillStyle = '#2f8f5b'; g.font = 'bold 30px Arial Black'; g.fillText('A', 44, 52); }
  else if (type === 'wall') { box(14, 26, 84, 40, '#15161a'); g.fillStyle = '#eee'; g.fillRect(54, 30, 4, 32); for (const [x, y] of [[26, 36], [40, 54], [70, 36], [86, 54]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }
  else if (type === 'stairs') { for (let i = 0; i < 4; i++) box(14 + i * 21, 66 - (i + 1) * 12, 21, (i + 1) * 12, '#e3b778'); }
  else if (type === 'ramp') { g.fillStyle = '#4a9ad9'; g.beginPath(); g.moveTo(10, 66); g.lineTo(100, 66); g.lineTo(100, 20); g.closePath(); g.fill(); g.stroke(); }
  else if (type === 'plank') { box(6, 40, 100, 12, '#f5d76e'); g.lineWidth = 2; for (let i = 10; i < 104; i += 8) { g.beginPath(); g.moveTo(i, 40); g.lineTo(i, 46); g.stroke(); } }
  return c;
}
function refreshBuildBar() {
  const t = myTeam(), rank = rankOf(save.xp);
  const el = $('bb-pieces');
  if (!el.children.length) {
    for (const type of ORDER) {
      const b = document.createElement('button'); b.dataset.type = type;
      b.appendChild(pieceIcon(type));
      b.insertAdjacentHTML('beforeend', `<span>${PIECES[type].name} <kbd>${PIECES[type].key}</kbd></span><span class="cost">${PIECES[type].cost} pt</span>`);
      b.addEventListener('click', () => selectPiece(type));
      el.appendChild(b);
    }
  }
  for (const b of el.children) {
    b.classList.toggle('sel', b.dataset.type === buildSel);
    b.classList.toggle('locked', PIECES[b.dataset.type].rank > rank && role() === 'local');
  }
  if (G.budget) $('bb-budget').textContent = (G.budget[t] - pieces.spent(t)) + ' of ' + G.budget[t] + ' pts left';
}
$('bb-rot').onclick = () => { buildRot = (buildRot + 1) % 4; Audio.click(); };
$('bb-undo').onclick = () => undoPiece();
$('bb-auto').onclick = () => autoBuild();
$('bb-ready').onclick = () => pressReady();

// ------------------------------------------------------------------ HUD + feedback
function showHUD(on) { $('hud').classList.toggle('hidden', !on); $('t-menu').classList.toggle('hidden', !on); if (isTouch) $('touch').classList.toggle('hidden', !on); }
let bannerT = 0, subT = 0, tipT = 0;
function banner(t, s = '', dur = 1.6) { const b = $('banner'); b.textContent = t; b.style.opacity = 1; b.style.transform = 'scale(1.25)'; requestAnimationFrame(() => { b.style.transition = 'transform .25s cubic-bezier(.2,1.6,.4,1)'; b.style.transform = 'scale(1)'; }); bannerT = dur; if (s) sub(s, dur + 0.4); }
function sub(t, dur = 2) { $('sub').textContent = t; $('sub').style.opacity = 1; subT = dur; }
function tip(t, dur = 5) { $('tip').textContent = t; $('tip').classList.add('on'); tipT = dur; }
function bumpScore(team) { const e = $('sc' + team).parentElement; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
function feed(a, v, head) {
  if (G.fast || G.demo) return;
  const d = document.createElement('div');
  const nm = (s) => `<span class="${s.team ? 't' : 'g'}">${s.name}</span>`;
  d.innerHTML = (a && a !== v ? nm(a) + (head ? ' ⌖ ' : ' → ') : '') + nm(v);
  if (a === G.me || v === G.me) d.classList.add('me');
  $('feed').prepend(d); while ($('feed').children.length > 5) $('feed').lastChild.remove();
  setTimeout(() => d.remove(), 5000);
}
let hitT = 0;
function hitFeedback(dmg, head, at, killed) {
  if (G.fast) return;
  const h = $('hitm'); h.classList.toggle('kill', !!killed); h.style.opacity = 1; hitT = 0.18;
  head ? Audio.head() : Audio.hit();
  const v = new THREE.Vector3(at[0], at[1], at[2]).project(camera);
  if (v.z > 1) return;
  const n = document.createElement('div'); n.textContent = Math.round(dmg); if (head) n.className = 'h';
  n.style.left = ((v.x + 1) / 2 * innerWidth + rand(-12, 12)) + 'px'; n.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  $('nums').appendChild(n);
  n.animate([{ transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 }, { transform: 'translate(-50%,-160%) scale(1)', opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => n.remove();
}
let hurtA = 0;
function flashHurt() { hurtA = 0.8; }
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
let lastHud = '';
function updateHUD(dt) {
  bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = Math.max(0, 1 + bannerT * 4);
  subT -= dt; if (subT <= 0) $('sub').style.opacity = 0;
  tipT -= dt; if (tipT <= 0) $('tip').classList.remove('on');
  hitT -= dt; if (hitT <= 0) $('hitm').style.opacity = 0;
  hurtA = Math.max(0, hurtA - dt * 1.5);
  const me = G.me;
  const low = me && me.alive ? clamp(1 - me.hp / 45, 0, 0.6) : 0;
  $('hurt').style.opacity = Math.max(hurtA, low);
  if (isTouch) $('touch').classList.toggle('hidden', !(G.phase === 'fight' && me && !G.demo));
  if (!me || G.demo) return;
  const build = G.phase === 'build';
  const s = [G.score[0], G.score[1], build ? 'BUILD' : G.phase === 'fight' ? MODE_NAME[G.mode] : 'FINAL', fmt(build ? G.buildT : G.time), Math.ceil(me.hp), me.ammo, me.gren, me.reloadT > 0, G.mode === 'hill' ? G.holder + '' + G.contested : ''].join('|');
  if (s === lastHud) return; lastHud = s;
  $('sc0').textContent = G.score[0]; $('sc1').textContent = G.score[1];
  $('phase').textContent = build ? 'BUILD PHASE' : G.phase === 'fight' ? MODE_NAME[G.mode] : 'FINAL';
  $('clock').textContent = fmt(build ? G.buildT : G.time);
  $('clock').classList.toggle('low', (build ? G.buildT : G.time) < 10);
  $('goal').textContent = G.mode === 'hill' ? 'hold for ' + G.target + 's' : 'first to ' + G.target;
  $('hptxt').textContent = Math.max(0, Math.ceil(me.hp)); $('hpfill').style.width = clamp(me.hp, 0, 100) + '%'; $('hpfill').classList.toggle('low', me.hp < 40);
  $('ammoN').textContent = me.ammo; $('reload').classList.toggle('on', me.reloadT > 0);
  $('grens').innerHTML = '<i></i>'.repeat(Math.max(0, me.gren));
  $('bb-time').textContent = Math.ceil(G.buildT); $('bb-time').classList.toggle('low', G.buildT < 8);
  $('hill').classList.toggle('hidden', G.mode !== 'hill' || build);
  if (G.mode === 'hill') {
    $('hb0').style.width = (G.hill[0] / G.target * 50) + '%'; $('hb1').style.width = (G.hill[1] / G.target * 50) + '%';
    $('hilltxt').textContent = G.contested ? 'CONTESTED!' : G.holder === myTeam() ? 'HOLDING THE HILL' : G.holder >= 0 ? 'ENEMY HOLDS THE HILL' : 'TAKE THE HILL';
  }
  $('cross').style.display = G.phase === 'fight' && me.alive ? '' : 'none';
  $('clickto').classList.toggle('hidden', !(G.phase === 'fight' && !locked && !isTouch && !Q.has('nolock') && !G.me.bot));
}

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(0, 30, -40), camLook = new THREE.Vector3();
let orbit = 0;
function updateCamera(dt) {
  const me = G.me;
  let fov = 70;
  if (G.demo || G.phase === 'none') {
    orbit += dt * 0.08;
    camPos.set(Math.sin(orbit) * 34, 17, Math.cos(orbit) * 34); camLook.set(0, 1, 0);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 2)); camera.lookAt(camLook);
  } else if (G.phase === 'build') {
    const s = myTeam() ? -1 : 1;
    const ax = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), az = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    buildPan[0] = clamp(buildPan[0] - ax * dt * 14 * s, -10, 10); buildPan[1] = clamp(buildPan[1] + az * dt * 14 * s, -6, 8);
    const z = buildZoom;
    camPos.set(buildPan[0], 21 * z, s * (-30 * z) + buildPan[1]);
    camLook.set(buildPan[0] * 0.9, 0, s * -9 + buildPan[1]);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 5));
    camera.lookAt(camLook);
    fov = isTouch ? 62 : 55;
  } else if (me && me.alive && G.phase === 'fight') {
    const a = aimRay(me);
    const [px, py, pz] = a.pivot;
    const tx = a.o[0], ty = a.o[1], tz = a.o[2];
    // pull the camera in if something sits between it and the soldier's shoulder
    const vx = tx - px, vy = ty - py, vz = tz - pz, vl = Math.hypot(vx, vy, vz);
    const hit = G.rayBoxes(px, py, pz, vx / vl, vy / vl, vz / vl, vl, false);
    const k = hit ? Math.max(0.15, (hit.t - 0.25) / vl) : 1;
    camera.position.set(px + vx * k, py + vy * k, pz + vz * k);
    const d = a.d; camera.lookAt(camera.position.x + d[0], camera.position.y + d[1], camera.position.z + d[2]);
    fov = me.input.aim ? 48 : me.input.sprint && Math.hypot(me.vx, me.vz) > 7 ? 76 : 70;
  } else if (me) {
    // death cam / finale: orbit the fallen soldier, look toward the killer
    orbit += dt * 0.5;
    const f = G.killer && G.phase === 'fight' ? G.killer : me;
    const cx = (me.x + f.x) / 2, cz = (me.z + f.z) / 2;
    const ox = Math.sin(orbit) * 7, oz = Math.cos(orbit) * 7, ol = Math.hypot(ox, 5, oz);
    const hit = G.rayBoxes(me.x, me.y + 1.2, me.z, ox / ol, 5 / ol, oz / ol, ol, true);
    const k = hit ? Math.max(0.2, (hit.t - 0.4) / ol) : 1;
    camPos.set(me.x + ox * k, me.y + 1.2 + 5 * k, me.z + oz * k);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 3)); camLook.set(cx, me.y + 1, cz); camera.lookAt(camLook);
    if (G.phase === 'fight') sub('Respawn in ' + Math.max(0, me.respawnT).toFixed(1), 0.2);
  }
  if (G.shake > 0.001) {
    camera.position.x += rand(-1, 1) * G.shake * 0.35; camera.position.y += rand(-1, 1) * G.shake * 0.35;
    camera.rotation.z += rand(-1, 1) * G.shake * 0.04;
    G.shake *= Math.exp(-dt * 9);
  }
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 12)); camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ online
function packPiece(p) { return [p.id, p.type, p.rot, p.x, p.y, p.z, p.team]; }
function packSnap() {
  const snap = { s: 1, ph: G.phase, bt: r2(G.buildT), tm: r2(G.time), sc: G.score.slice(), hl: G.hill.map(r2), hd: G.holder, ct: G.contested ? 1 : 0, rd: G.ready.slice() };
  snap.so = G.soldiers.map((s) => [s.id, r2(s.x), r2(s.y), r2(s.z), r2(s.yaw), r2(s.pitch), Math.ceil(s.hp), s.alive ? 1 : 0, s.ammo, s.gren, s.reloadT > 0 ? 1 : 0, s.spawnProt > 0 ? 1 : 0, s.kills, s.deaths, r2(s.respawnT)]);
  snap.gr = G.grenades.map((g) => [r2(g.x), r2(g.y), r2(g.z)]);
  const pf = [];
  for (const p of pieces.list) { const y = G.fallSent.get(p.id); if (y === undefined || Math.abs(y - p.y) > 0.01) { pf.push([p.id, r2(p.y)]); G.fallSent.set(p.id, p.y); } }
  if (pf.length) snap.pf = pf;
  if (G.events.length) { snap.ev = G.events; G.events = []; }
  return snap;
}
function applySnap(d) {
  G.buildT = d.bt; G.time = d.tm; G.score = d.sc; G.hill = d.hl; G.holder = d.hd; G.contested = !!d.ct; G.ready = d.rd || G.ready;
  for (const q of d.so) {
    const s = G.soldiers.find((o) => o.id === q[0]); if (!s) continue;
    const nx = q[1], ny = q[2], nz = q[3];
    s.vx = (nx - s.x) * 20; s.vz = (nz - s.z) * 20;
    if (Math.hypot(nx - s.x, nz - s.z) > 4) { s.x = nx; s.y = ny; s.z = nz; } else { s.x += (nx - s.x) * 0.55; s.y += (ny - s.y) * 0.55; s.z += (nz - s.z) * 0.55; }
    s.ground = Math.abs(ny - s.y) < 0.05;
    if (s !== G.me) { s.yaw = q[4]; s.pitch = q[5]; }
    s.hp = q[6];
    const alive = !!q[7];
    if (alive && !s.alive) { s.alive = true; s.deadT = 0; s.m.body.rotation.set(0, 0, 0); s.m.body.position.set(0, 0, 0); s.m.root.visible = true; s.x = nx; s.y = ny; s.z = nz; }
    if (!alive && s.alive) { s.alive = false; s.deadT = 0; }
    s.ammo = q[8]; s.gren = q[9]; s.reloadT = q[10] ? 1 : 0; s.spawnProt = q[11] ? 1 : 0; s.kills = q[12]; s.deaths = q[13]; s.respawnT = q[14];
  }
  // grenades
  for (const m of grenMeshes) m.visible = false;
  (d.gr || []).forEach((g, i) => { const m = grenMeshes[i] || grenMesh(); m.visible = true; m.position.set(g[0], g[1], g[2]); m.rotation.x += 0.4; fx.sprite(g[0], g[1] + 0.2, g[2], { color: 0xffe08a, size: 0.25, life: 0.15, grow: 0.5, vy: 1, add: true, a0: 1 }); });
  for (const [id, y] of d.pf || []) { const p = pieces.byId(id); if (p) { p.y = y; p.mesh.position.y = y; pieces.setBoxes(p); } }
  for (const e of d.ev || []) {
    if (e[0] === 's') {
      const s = G.soldiers.find((o) => o.id === e[1]); if (!s) continue;
      shotFx(s, e[2], e[3], e[4], e[5], e[6], e[7], e[8]);
      if (s === G.me && e[8] >= 2) hitFeedback(e[8] === 3 ? 45 : 20, e[8] === 3, [e[5], e[6], e[7]], false);
      if (e[8] >= 2) { const v = G.soldiers.find((o) => o !== s && o.alive && Math.hypot(o.x - e[5], o.z - e[7]) < 0.8); if (v === G.me) { flashHurt(); G.shake = 0.18; Audio.hurt(); } }
    } else if (e[0] === 'k') {
      const a = G.soldiers.find((o) => o.id === e[1]), v = G.soldiers.find((o) => o.id === e[2]); if (!v) continue;
      v.alive = false; v.deadT = 0; v.tip.ax = e[4]; v.tip.az = e[5];
      fx.chip(v.x, v.y + 1, v.z, v.team ? 0xc9a66b : 0x4f7a32, 12, 5, 0.11);
      feed(a, v, !!e[3]);
      if (a === G.me && v !== G.me) { G.streak = G.streakT > 0 ? G.streak + 1 : 1; G.streakT = 4; banner(G.streak >= 2 ? 'DOUBLE KO!' : e[3] ? 'HEADSHOT!' : 'KO!', '', 0.9); Audio.kill(); $('hitm').classList.add('kill'); }
      if (v === G.me) { G.killer = a; Audio.died(); sub('KO’d by ' + (a ? a.name : '?'), 3); }
    } else if (e[0] === 'b') { fx.boom(e[1], e[2], e[3]); const dc = Math.hypot(camera.position.x - e[1], camera.position.z - e[3]); Audio.boom(clamp(1.3 - dc / 40, 0.15, 1)); G.shake = Math.max(G.shake, clamp(0.9 - dc / 25, 0.05, 0.6)); }
    else if (e[0] === 'br') { const p = pieces.byId(e[1]); if (p) { pieces.remove(p); onBreak(p); } }
  }
}
let netT = 0;
const sentLatch = { jump: false, gren: false, reload: false };
function netTick(dt) {
  if (!net || !net.live) return;
  netT -= dt;
  if (role() === 'guest' && G.me) {
    if (latch.jump) sentLatch.jump = true; if (latch.gren) sentLatch.gren = true; if (latch.reload) sentLatch.reload = true;
    if (netT > 0) return; netT = 1 / 30;
    const me = G.me, inp = me.input;
    readLocalInput(me);
    if (sentLatch.jump) inp.jump = true; if (sentLatch.gren) inp.gren = true; if (sentLatch.reload) inp.reload = true;
    sentLatch.jump = sentLatch.gren = sentLatch.reload = false;
    net.send({ i: [r2(inp.mx), r2(inp.mz), r2(me.yaw), r2(me.pitch), (inp.fire ? 1 : 0) | (inp.jump ? 2 : 0) | (inp.sprint ? 4 : 0) | (inp.aim ? 8 : 0) | (inp.gren ? 16 : 0) | (inp.reload ? 32 : 0)] });
  } else if (role() === 'host') {
    if (netT > 0) return; netT = 1 / 20;
    net.send(packSnap());
  }
}
function onNetMsg(slot, d) {
  if (role() === 'host') {
    const t = 1;
    if (d.pl && G.phase === 'build') {
      const [type, rot, x, z] = d.pl;
      if (PIECES[type] && pieces.spent(t) + PIECES[type].cost <= G.budget[t]) { const p = pieces.add(type, rot | 0, +x, +z, t); if (p) { Audio.wood(0.8); net.send({ pa: packPiece(p) }); } }
    }
    if (d.pr && G.phase === 'build') { const p = pieces.byId(d.pr); if (p && p.team === t) { pieces.remove(p); net.send({ prm: p.id }); } }
    if (d.rd) { G.ready[1] = true; bbMsg('Your rival is ready'); }
    if (d.i) {
      const s = G.soldiers.find((o) => o.remote); if (!s) return;
      const [mx, mz, yaw, pitch, f] = d.i;
      Object.assign(s.input, { mx: clamp(mx, -1, 1), mz: clamp(mz, -1, 1), fire: !!(f & 1), jump: !!(f & 2), sprint: !!(f & 4), aim: !!(f & 8), gren: !!(f & 16), reload: !!(f & 32) });
      s.yaw = yaw; s.pitch = clamp(pitch, -1.2, 1.25);
    }
  } else {
    if (d.cfg) { startMatch(Object.assign(d.cfg, { online: 'guest' })); hideMenu(); return; }
    if (!G.cfg || role() !== 'guest') return;
    if (d.pa) { const [id, type, rot, x, y, z, team] = d.pa; if (!pieces.byId(id)) { const p = pieces.addAt(type, rot, x, y, z, team, id); if (team === 1) Audio.wood(); else Audio.wood(0.8); fx.chip(p.x, p.y + 0.1, p.z, 0xe8c48a, 4, 3, 0.1); } refreshBuildBar(); }
    if (d.prm) { const p = pieces.byId(d.prm); if (p) pieces.remove(p); refreshBuildBar(); }
    if (d.ph === 'fight' && G.phase === 'build') { guestFight(); }
    if (d.s) { if (G.phase === 'build' && d.ph === 'fight') guestFight(); applySnap(d); }
    if (d.end) { G.phase = 'over'; G.score = d.end.sc; const v = d.end.win === myTeam(); banner(v ? 'VICTORY!' : d.end.win === -1 ? 'DRAW' : 'DEFEAT', '', 2); Audio.music(false); Audio.bugle(v); finishResult(d.end.win); }
  }
}
function guestFight() {
  G.phase = 'fight'; for (const z of zoneMeshes) z.visible = false; if (ghost) ghost.visible = false;
  $('buildbar').classList.add('hidden'); banner('FIGHT!', 'Online ' + MODE_NAME[G.mode]); Audio.horn(); Audio.music(true); lockPointer();
}
function onNetLeave() {
  if (role() === 'host' && G.phase !== 'over') {
    const s = G.soldiers.find((o) => o.remote); if (s) { s.remote = false; s.bot = new Bot(s, 1); s.name = 'Bot'; }
    sub('Your rival left - a bot takes over', 3); G.ready[1] = true;
  } else if (role() === 'guest') {
    if (G.phase !== 'over') { sub('The host left the game', 3); setTimeout(() => goMenu(), 1800); }
  }
}
function setOnline(t, err) { $('o-status').textContent = t; $('o-status').classList.toggle('err', !!err); }
$('o-host').onclick = async () => {
  Audio.init();
  if (net) net.close();
  net = new Net({ onStatus: (t, k) => setOnline(t, k === 'error'), onMsg: onNetMsg, onLeave: onNetLeave, onJoin: () => {
    const cfg = quickCfg(); cfg.online = 'host';
    if (cfg.mode === 'duel') cfg.size = 1;
    startMatch(cfg); hideMenu();
    net.send({ cfg: { map: cfg.map, mode: cfg.mode, size: cfg.size, diff: cfg.diff, build: cfg.build } });
    Audio.horn();
  } });
  setOnline('opening a room...');
  try { const code = await net.host(); setOnline('ROOM CODE: ' + code + ' - send it to a friend. Waiting...'); } catch (e) { setOnline('Online unavailable right now (' + (e.message || e.type || 'error') + '). Bots are ready though!', true); }
};
$('o-join').onclick = async () => {
  Audio.init();
  const code = $('o-code').value.trim().toUpperCase();
  if (code.length !== 4) { setOnline('enter the 4-letter code', true); return; }
  if (net) net.close();
  net = new Net({ onStatus: (t, k) => setOnline(t, k === 'error'), onMsg: onNetMsg, onLeave: onNetLeave });
  setOnline('connecting to ' + code + '...');
  try { await net.join(code); setOnline('connected - waiting for the host'); } catch (e) { setOnline((e.message || 'could not connect') + ' - try again or play bots', true); }
};

// ------------------------------------------------------------------ menu
function demoCfg() { return { map: Math.floor(Math.random() * MAPS.length), mode: 'team', size: 3, diff: 1, demo: true, build: 0 }; }
function quickCfg() { const mode = $('q-mode').value; return { map: +$('q-map').value, mode, size: mode === 'duel' ? 1 : 4, diff: +$('q-diff').value, op: -1, build: 35 }; }
function buildMenu() {
  const rank = rankOf(save.xp), next = RANKS[rank + 1];
  $('rank').innerHTML = `RANK: ${RANKS[rank][0]} &middot; ${save.xp} XP &middot; build budget ${budgetFor(rank)}` + (next ? `<div class="bar"><i style="width:${((save.xp - RANKS[rank][1]) / (next[1] - RANKS[rank][1]) * 100).toFixed(0)}%"></i></div>` : '');
  const ops = $('ops'); ops.innerHTML = '';
  OPS.forEach((o, i) => {
    const b = document.createElement('button'), locked = i >= save.unlocked, st = save.stars[i] || 0;
    b.innerHTML = `<b>${i + 1}. ${o.name}</b>${MAPS[o.map].name} &middot; ${MODE_NAME[o.mode]}<br><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
    if (locked) b.classList.add('locked'); if (i === Math.min(save.unlocked - 1, OPS.length - 1)) b.classList.add('cur');
    b.onclick = () => { if (locked) { Audio.deny(); return; } Audio.click(); playOp(i); };
    ops.appendChild(b);
  });
  if (!$('q-map').children.length) MAPS.forEach((m, i) => $('q-map').insertAdjacentHTML('beforeend', `<option value="${i}">${m.name}</option>`));
}
function playOp(i) { if (net) { net.close(); net = null; } hideMenu(); startMatch(Object.assign({}, OPS[i], { op: i })); }
function hideMenu() { $('menu').classList.add('hidden'); $('result').classList.add('hidden'); }
function goMenu() {
  if (net) { net.close(); net = null; }
  unlockPointer(); Audio.music(false);
  $('result').classList.add('hidden'); $('buildbar').classList.add('hidden'); showHUD(false);
  buildMenu(); $('menu').classList.remove('hidden');
  startMatch(demoCfg());
}
$('m-play').onclick = () => { Audio.init(); playOp(Math.min(save.unlocked - 1, OPS.length - 1)); };
$('q-go').onclick = () => { Audio.init(); if (net) { net.close(); net = null; } hideMenu(); startMatch(quickCfg()); };
$('r-retry').onclick = () => { Audio.init(); const c = Object.assign({}, G.cfg); hideMenu(); startMatch(c); };
$('r-next').onclick = () => { Audio.init(); playOp(G.cfg.op + 1); };
$('r-menu').onclick = () => goMenu();
$('t-menu').onclick = () => goMenu();
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); mouseL = mouseR = false; } });

// ------------------------------------------------------------------ main loop
let last = performance.now(), acc = 0;
function step(dt) {
  if (role() === 'guest') {
    // the host simulates; we only animate and send input
    if (G.phase === 'build') pieces.update(0);
    if (G.phase === 'build') G.buildT -= dt;
    for (const s of G.soldiers) if (s.alive) s.spawnProt -= dt;
    return;
  }
  sim(dt);
}
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.slowT > 0) { G.slowT -= rdt; if (G.slowT <= 0) G.timeScale = 1; }
  const dt = rdt * G.timeScale;
  acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 5) { step(1 / 60); acc -= 1 / 60; n++; }
  if (n >= 5) acc = 0;
  netTick(rdt);
  for (const s of G.soldiers) s.render(dt, now / 1000);
  for (const p of pieces.list) if (p.mesh.scale.x < 1 && role() === 'guest') p.mesh.scale.setScalar(Math.min(1, p.mesh.scale.x + rdt * 6));
  if (hillMesh) {
    const h = G.holder, col = h === 0 ? 0x7cc142 : h === 1 ? 0xe8c27a : G.contested ? 0xff5a4a : 0xffffff;
    hillMesh.userData.ring.material.color.set(col); hillMesh.userData.disc.material.color.set(col);
    hillMesh.userData.disc.material.opacity = 0.1 + (h >= 0 || G.contested ? Math.sin(now / 150) * 0.05 + 0.08 : 0);
  }
  if (world.water) world.water.mesh.position.y = 0.35 + Math.sin(now / 700) * 0.03;
  fx.update(dt);
  updateGhost();
  updateCamera(rdt);
  updateHUD(rdt);
  Audio.update();
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ boot
buildMenu();
if (Q.has('title')) { goMenu(); }
else {
  const op = Q.has('op') ? clamp(+Q.get('op'), 0, OPS.length - 1) : Math.min(save.unlocked - 1, OPS.length - 1);
  if (Q.has('map') || Q.has('mode')) startMatch({ map: +(Q.get('map') || 0), mode: Q.get('mode') || 'team', size: Q.get('mode') === 'duel' ? 1 : +(Q.get('size') || 4), diff: +(Q.get('diff') || 1), build: 35 });
  else startMatch(Object.assign({}, OPS[op], { op }));
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ test hooks (headless)
window.__G = {
  G, world, pieces, OPS, start: startMatch, playOp, autoBuild, ready: pressReady, beginFight, goMenu, save, rayScene,
  botMe(on = true) { if (G.me) G.me.bot = on ? new Bot(G.me, 2) : null; },
  fast(sec, dt = 1 / 30) { G.fast = true; const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { sim(dt); if (G.phase === 'over' && G.result) break; } G.fast = false; },
  place(type, rot, x, z) { buildSel = type; buildRot = rot; const t = pieces.add(type, rot, x, z, myTeam()); return !!t; },
  state() { return { phase: G.phase, score: G.score.slice(), time: G.time, result: G.result, pieces: pieces.list.length, mine: pieces.spent(0), theirs: pieces.spent(1), me: G.me && { hp: G.me.hp, kills: G.me.kills, deaths: G.me.deaths, x: G.me.x, y: G.me.y, z: G.me.z } }; },
  aimAt(s) { const me = G.me; const dx = s.x - me.x, dz = s.z - me.z; me.yaw = Math.atan2(dx, dz); me.pitch = Math.atan2(s.y + 1.1 - (me.y + 1.62), Math.hypot(dx, dz)); },
  net: () => net, Net, onNetMsg,
};
