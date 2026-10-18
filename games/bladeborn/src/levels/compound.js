// CH I SITE 9 (?level=compound&play=1). One chapter: the lab breakout (lab.js: restraints, the lab, the courtyard
// traversal tutorial, up Block A) opens onto the whole government compound, a small open world south of Block A.
// Every building can be entered: doors, breakable windows, roof skylights (land hard / crouch on the glass), climbable
// walls; scientists and guards inside, rifle patrols in the yards, snipers and searchlights on the watchtowers.
// Two ELECTRIFIED yards (blue glow, arcs): the guards' insulated boots walk them, you cross above on pipes and beams.
// Ringed by a 9 m ELECTRIC FENCE (hum, sparks, warning signs): touch or climb it and you are shocked, thrown back,
// stunned. Beyond it the forest (backdrop). Three ways out: the main gate (gatehouse console, loud), the west
// drainage culvert (crawl under the fence), the crane on the east side (walk its jib out over the fence and drop).
// Collectibles: 8 intel files and audio logs about the program and the friend who sold him. Next: 'escape_forest'.
import * as THREE from 'three';
import LAB from './lab.js';
import { instancer, forestRing, searchlight, tip, titleCard, rng, skyDome } from './escape_kit.js';
import { lightPool } from './tower_fx.js';
import { removeBox } from '../world.js';
import { sfx } from '../audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const F = { x0: -110, x1: 110, z0: -332, z1: -112, h: 9 };               // the fence rectangle (north side joins Block A)
const FH = 4.2;                                                          // storey height
const ZONES = [{ x: 0, z: -222, w: 40, d: 22 }, { x: -72, z: -250, w: 26, d: 16 }]; // electrified yards
const OPEN_ENV = { bg: 0x1e2a40, fog: [35, 140, 0x2a3650], hemi: 0.6, sun: 0.7, exposure: 1.1 }; // cool night outside, warm lamps
const BLD = [ // x, z, w, d, floors, kind, doors (sides), enemies
  [-60, -152, 30, 14, 2, 'barracks', ['+z', '-z'], [['guard_rifle', -66, -150, 0], ['guard_baton', -54, -154, 1], ['guard_rifle', -60, -150, 1, 1]]],
  [60, -152, 30, 14, 2, 'barracks', ['+z', '-x'], [['guard_rifle', 54, -150, 0], ['guard_baton', 66, -154, 0], ['thug_pistol', 60, -152, 1, 'smg']]],
  [0, -176, 26, 16, 3, 'office', ['+z', '-z'], [['scientist', -6, -172, 0], ['guard_rifle', 6, -180, 0], ['scientist', 0, -176, 1, null, true], ['guard_baton', -6, -176, 2], ['guard_rifle', 6, -172, 2]]],
  [-78, -205, 24, 20, 2, 'lab', ['+z', '+x'], [['scientist', -82, -200, 0, null, true], ['scientist', -74, -210, 0], ['guard_rifle', -78, -205, 1], ['scientist', -84, -208, 1]]],
  [66, -218, 34, 26, 1, 'hangar', ['-x', '+z'], [['guard_rifle', 60, -224, 0], ['guard_baton', 72, -212, 0], ['thug_pistol', 66, -228, 0, 'shotgun']]],
  [-28, -268, 28, 18, 1, 'warehouse', ['+z', '-x'], [['guard_baton', -34, -268, 0], ['guard_rifle', -22, -272, 0]]],
  [34, -284, 24, 16, 2, 'warehouse', ['+z', '+x'], [['guard_rifle', 30, -284, 0], ['guard_baton', 38, -288, 1]]],
];
const TOWERS = [[-102, -122], [102, -122], [-102, -322], [102, -322]];
const PICKS = [ // collectibles: [x, y, z, kind, title, lines]
  [-64, 0.9, -156, 'file', 'INTEL FILE 1', []],
  [4, 0.9 + FH, -172, 'log', 'INTEL FILE 2', []],
  [-82, 0.9 + FH, -210, 'file', 'INTEL FILE 3', []],
  [70, 0.9, -230, 'log', 'INTEL FILE 4', []],
  [-34, 0.9, -262, 'file', 'INTEL FILE 5', []],
  [36, 0.9 + FH, -280, 'log', 'INTEL FILE 6', []],
  [0, 0.9, -320, 'file', 'GATE ROSTER', [['', 'The gatehouse console opens the main gate.', 4]]],
  [96, 0.9, -196, 'log', 'INTEL FILE 8', []],
];

function dropEnemy(L, e) { const G = L.G; G.scene.remove(e.rig.root); e.rig.skin?.dispose?.(); if (e.laser) G.scene.remove(e.laser); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }

export default {
  id: 'compound',
  title: 'SITE 9',
  flags: { gunsKill: false },
  env: LAB.env,
  bounds: [-108, -330, 108, 28],

  build(L) {
    LAB.inCompound = true; LAB.next = L2 => this.openWorld(L2);
    LAB.build(L);
    const T = THREE, I = instancer(L), r = rng(91);
    this.picks = []; this.found = 0; this.out = false; this.zap = 0; this.skies = []; this.gateOpen = false; this.started = false;
    L.checkpoint('yard', 3, 14, -125, Math.PI);
    // ---- ground, the forest beyond the fence (backdrop) ----
    L.floor(0, (F.z0 + F.z1) / 2 - 20, 360, F.z1 - F.z0 + 80, { mat: 'concreteDark' });
    forestRing(L, I, [F.x0 - 14, F.z0 - 14, F.x1 + 14, 50], 90, 23);
    const pool = this.pool = lightPool(L, 6); skyDome(L, 0x08101f, 0x34405a);
    // ---- the electric fence ----
    this.fence(L);
    // ---- buildings ----
    BLD.forEach((b, i) => this.building(L, i, ...b));
    // ---- electrified yards: glow, arcs, the pipes and beams over them ----
    this.zones(L);
    // ---- watchtowers: snipers, two searchlights ----
    for (const [x, z] of TOWERS) {
      L.box(x, 0, z, 3, 12, 3, { mat: 'concrete' }); L.box(x, 12, z, 5, 0.3, 5, { mat: 'steel' });
      for (const [dx, dz] of [[-2.4, 0], [2.4, 0], [0, -2.4], [0, 2.4]]) L.box(x + dx, 12.3, z + dz, dx ? 0.15 : 5, 1.1, dz ? 0.15 : 5, { mat: 'steel', see: true });
      L.ladder(x, z + 1.5 * Math.sign(-z - 220), { face: z > -220 ? '-z' : '+z', y1: 12.3 });
      L.enemy('sniper', x, z, { y: 12.3, hold: true, yaw: Math.atan2(-x, -220 - z), tag: 'tower' });
    }
    const onSpot = () => { L.alarm(L.hero.pos.clone(), 45); L.say('PA', 'Searchlight contact! Yard teams converge!', 2.6); };
    this.lights = [
      searchlight(L, { at: [-102, 16, -322], tower: false, sweep: [[-60, 0, -300], [-20, 0, -250], [-70, 0, -230], [-30, 0, -310]], speed: 0.18, onSpot }),
      searchlight(L, { at: [102, 16, -122], tower: false, sweep: [[60, 0, -140], [20, 0, -200], [80, 0, -190], [40, 0, -150]], speed: 0.2, phase: 1.2, onSpot }),
    ];
    // ---- yard patrols: rifles in pairs on loops, dogs of war in the open ----
    const P = (t, path, o = {}) => L.enemy(t, path[0][0], path[0][1], { patrol: path, tag: 'yard', ...o });
    P('guard_rifle', [[-30, -140, 2], [30, -140, 2]]); P('guard_rifle', [[30, -142, 2], [-30, -142, 2]]);
    P('guard_rifle', [[-95, -150, 2], [-95, -300, 2]]); P('guard_rifle', [[95, -300, 2], [95, -150, 2]]);
    P('guard_rifle', [[-20, -222, 2], [20, -222, 2]]); P('guard_baton', [[10, -214, 2], [-12, -230, 2]]); // inside the live yard (insulated boots)
    P('guard_rifle', [[-80, -250, 3], [-64, -250, 3]]);
    P('guard_rifle', [[-50, -305, 2], [50, -305, 2]]); P('thug_pistol', [[40, -250, 2], [0, -250, 2], [-10, -290, 2]], { gun: 'smg' });
    P('guard_rifle', [[30, -196, 2], [-30, -196, 2]]); P('guard_baton', [[45, -250, 2], [45, -180, 2]]);
    // ---- the gatehouse, the gate; the culvert; the crane ----
    this.exits(L);
    // ---- collectibles ----
    for (const [x, y, z, kind, title, lines] of PICKS) {
      const m = L.mesh(kind === 'file' ? new T.BoxGeometry(0.32, 0.05, 0.42) : new T.BoxGeometry(0.22, 0.14, 0.32), 'lamp', x, y, z);
      m.castShadow = false; const p = { m, x, y, z, title, lines, got: false }; this.picks.push(p);
    }
    L.every((dt) => this.tick(L, dt));
    I.flush();
  },

  // ---------------- the fence: 9 m mesh panels on posts, live wire on top, warning signs ----------------
  fence(L) {
    const T = THREE, sign = this.signMat(), segs = [[F.x0, F.z0, F.x1, F.z0], [F.x0, F.z0, F.x0, F.z1], [F.x1, F.z0, F.x1, F.z1], [F.x0, F.z1, -20.3, F.z1], [20.3, F.z1, F.x1, F.z1]];
    const gate = [-6, 6], culvert = -270;
    for (const [x1, z1, x2, z2] of segs) {
      const ax = z1 === z2, len = ax ? x2 - x1 : z2 - z1;
      const parts = ax && z1 === F.z0 ? [[x1, gate[0]], [gate[1], x2]] : !ax && x1 === F.x0 ? [[z1, culvert - 0.8], [culvert + 0.8, z2]] : [[ax ? x1 : z1, ax ? x2 : z2]];
      for (const [a, b] of parts) {
        const c = (a + b) / 2, l = b - a;
        L.box(ax ? c : x1, 0, ax ? z1 : c, ax ? l : 0.12, F.h, ax ? 0.12 : l, { mat: 'steel', see: true, flags: { fence: true } });
      }
      for (let k = 0; k <= len; k += 6) { const x = ax ? x1 + k : x1, z = ax ? z1 : z1 + k; L.mesh(new T.BoxGeometry(0.22, F.h + 0.6, 0.22), 'steel', x, (F.h + 0.6) / 2, z); }
      const wire = L.mesh(new T.BoxGeometry(ax ? len : 0.05, 0.05, ax ? 0.05 : len), 'lamp', ax ? (x1 + x2) / 2 : x1, F.h + 0.4, ax ? z1 : (z1 + z2) / 2); wire.castShadow = false;
      for (let k = 12; k < len; k += 30) { const s = new T.Mesh(new T.PlaneGeometry(1.2, 0.8), sign); s.position.set(ax ? x1 + k : x1 + 0.1 * Math.sign(-x1 || 1), 1.8, ax ? z1 + 0.1 * Math.sign(-z1 - 220) : z1 + k); s.rotation.y = ax ? (z1 < -200 ? 0 : Math.PI) : (x1 < 0 ? Math.PI / 2 : -Math.PI / 2); L.deco(s); }
    }
    // the culvert: a drain pipe under the west fence (crouch into its mouth and crawl), the fence above it
    L.vent.run(F.x0 + 6, culvert, F.x0 - 7, culvert, 0, { start: 'mouth', end: 'mouth' });
    L.box(F.x0, 1.05, culvert, 0.12, F.h - 1.05, 1.6, { mat: 'steel', see: true, flags: { fence: true } });
    this.lines = segs;
  },
  signMat() {
    let map = null;
    try { const c = document.createElement('canvas'); c.width = 256; c.height = 170; const g = c.getContext('2d'); g.fillStyle = '#e8c21a'; g.fillRect(0, 0, 256, 170); g.fillStyle = '#111'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('DANGER', 128, 52); g.font = 'bold 22px Arial'; g.fillText('HIGH VOLTAGE', 128, 92); g.fillText('10 000 V', 128, 130); map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; } catch (_) {}
    return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0xe8c21a, map, roughness: 0.6, side: THREE.DoubleSide });
  },

  // ---------------- a building: walls with doors and windows, storeys with ladders, a roof skylight ----------------
  building(L, i, x, z, w, d, floors, kind, doors, crew) {
    const H = kind === 'hangar' ? 10 : kind === 'warehouse' && floors === 1 ? 8 : floors * FH, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const mat = kind === 'lab' ? 'concreteLight' : kind === 'hangar' ? 'metal' : 'concrete';
    const storeys = kind === 'hangar' || (kind === 'warehouse' && floors === 1) ? [0] : [...Array(floors).keys()].map(f => f * FH);
    for (const side of ['+z', '-z', '+x', '-x']) {
      const ax = side[1] === 'z', at = side === '+z' ? z1 : side === '-z' ? z0 : side === '+x' ? x1 : x0, a = ax ? x0 : z0, b = ax ? x1 : z1, len = b - a, gaps = [];
      if (doors.includes(side)) gaps.push([a + len / 2, kind === 'hangar' ? 8 : 2.2, 0, kind === 'hangar' ? 6 : 2.7, 'door']);
      for (const y of storeys) for (const f of [0.22, 0.78]) { const c = a + len * f; if (!gaps.some(g => Math.abs(g[0] - c) < 3)) gaps.push([c, 1.8, y + 1.0, y + 2.5, 'win']); }
      this.wallLine(L, ax, at, a, b, 0, H, gaps, mat);
      for (const [c, gw, y0, y1, k] of gaps) {
        const px = ax ? c : at, pz = ax ? at : c;
        if (k === 'door') { if (kind !== 'hangar') L.door(px, pz, { axis: ax ? 'x' : 'z', w: gw, h: y1, auto: true }); }
        else L.window(px, pz, { axis: ax ? 'x' : 'z', w: gw, h: y1 - y0, y: y0 });
      }
    }
    // storeys: slab with a ladder hole in the NW corner; the roof with a skylight in the middle
    for (let f = 1; f < storeys.length; f++) {
      const y = storeys[f], hx = x0 + 1.8, hz = z0 + 1.8;
      this.slab(L, [x0, z0, x1, z1], y, [hx - 1, hz - 1, hx + 1, hz + 1]);
      L.ladder(hx + 1, hz, { face: '-x', y0: y - FH, y1: y });
      L.box(hx + 1.15, y - FH, hz, 0.3, FH - 0.3, 2, { mat: 'concrete' });
    }
    const sk = [x - 1.3, z - 1.3, x + 1.3, z + 1.3];
    this.slab(L, [x0, z0, x1, z1], H, sk);
    const g = L.box(x, H - 0.3, z, 2.6, 0.3, 2.6, { mat: 'glass', see: true, flags: { glass: true, noClimb: true }, shadow: false });
    const W = { b: g, x, z, y: H - 0.3, w: 2.6, h: 0.3, ax: 'x', broken: false, sky: true }; L.windows.push(W); this.skies.push(W);
    L.box(x0, H, z, 0.3, 0.7, d, { mat: 'concreteDark' }); L.box(x1, H, z, 0.3, 0.7, d, { mat: 'concreteDark' }); // parapets
    L.box(x, H, z0, w, 0.7, 0.3, { mat: 'concreteDark' }); L.box(x, H, z1, w, 0.7, 0.3, { mat: 'concreteDark' });
    // props per kind, lights, crew
    const r = rng(i * 17 + 3);
    for (const y of storeys) {
      for (let k = 0; k < 4; k++) {
        const px = x0 + 3 + r() * (w - 6), pz = z0 + 3 + r() * (d - 6);
        if (Math.hypot(px - x, pz - z) < 2 && y === storeys[storeys.length - 1]) continue;
        if (kind === 'barracks') L.box(px, y, pz, 2.1, 0.9, 1, { mat: 'paintDark', cover: true, tile: 1 });
        else if (kind === 'lab') L.box(px, y, pz, 2.4, 0.95, 1.1, { mat: 'steel', cover: true, tile: 1 });
        else if (kind === 'office') L.box(px, y, pz, 2.4, 0.8, 1.2, { mat: 'paint', cover: true, tile: 1.2 });
        else L.box(px, y, pz, 1.6, 1.6, 1.6, { mat: 'paint', cover: true, tile: 1.6 });
      }
      this.pool.add(x, y + FH - 0.1, z, { intensity: 9, dist: 14 });
    }
    if (kind === 'hangar') { L.box(x + 4, 0, z + 2, 6, 2.2, 12, { mat: 'paintDark', cover: true }); L.box(x + 4, 2.2, z - 2, 14, 0.3, 3, { mat: 'paintDark' }); }
    for (const [t, ex, ez, f, gun, alarm] of crew) {
      const o = { y: storeys[Math.min(f, storeys.length - 1)], tag: 'b' + i, yaw: r() * 6.28 };
      if (gun) o.gun = gun; if (alarm) o.alarm = [x0 + 1, z1 - 1];
      if (t === 'guard_rifle' && r() < 0.5) { o.patrol = [[ex, ez, 2], [x + (x - ex) * 0.6, z + (z - ez) * 0.6, 2]]; delete o.yaw; }
      L.enemy(t, ex, ez, o);
    }
  },
  wallLine(L, ax, at, a, b, y0, y1, gaps, mat) {
    const t = 0.3, box = (c0, c1, ya, yb) => { if (c1 - c0 < 0.05 || yb - ya < 0.05) return; const c = (c0 + c1) / 2; L.box(ax ? c : at, ya, ax ? at : c, ax ? c1 - c0 : t, yb - ya, ax ? t : c1 - c0, { mat, tile: 4 }); };
    const gs = gaps.map(([c, w, ga, gb]) => [c - w / 2, c + w / 2, ga, gb]).sort((p, q) => p[0] - q[0]);
    let cur = a;
    for (const [g0, g1, ga, gb] of gs) { box(cur, g0, y0, y1); box(g0, g1, y0, ga); box(g0, g1, gb, y1); cur = g1; }
    box(cur, b, y0, y1);
  },
  slab(L, [x0, z0, x1, z1], y, [a, b, c, d]) {
    for (const [p, q, s, t] of [[x0, z0, a, z1], [c, z0, x1, z1], [a, z0, c, b], [a, d, c, z1]]) if (s - p > 0.05 && t - q > 0.05) L.box((p + s) / 2, y - 0.3, (q + t) / 2, s - p, 0.3, t - q, { mat: 'concreteDark', flags: { noClimb: true } });
  },

  // ---------------- electrified yards ----------------
  zones(L) {
    const T = THREE, glow = new T.MeshBasicMaterial({ color: 0x58c8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending });
    this.arcs = [];
    for (const Z of ZONES) {
      const p = new T.Mesh(new T.PlaneGeometry(Z.w, Z.d), glow); p.rotation.x = -Math.PI / 2; p.position.set(Z.x, 0.03, Z.z); L.deco(p); Z.mesh = p;
      for (const s of [-1, 1]) { L.box(Z.x + s * Z.w / 2, 0, Z.z, 0.3, 0.25, Z.d, { mat: 'steel' }); L.box(Z.x, 0, Z.z + s * Z.d / 2, Z.w, 0.25, 0.3, { mat: 'steel' }); }
      L.light(Z.x, 2, Z.z, { intensity: 8, dist: Z.w * 0.8, color: 0x58c8ff, fixture: false });
      // the way across: pipe racks on legs (walk the top) and beams between them
      const n = Math.round(Z.w / 9);
      for (let k = 0; k <= n; k++) { const px = Z.x - Z.w / 2 + 1 + k * (Z.w - 2) / n; L.box(px, 0, Z.z - Z.d / 2 - 1.2, 0.5, 4.2, 0.5, { mat: 'steel' }); L.box(px, 0, Z.z + Z.d / 2 + 1.2, 0.5, 4.2, 0.5, { mat: 'steel' }); L.box(px, 4.2, Z.z, 0.7, 0.5, Z.d + 3.4, { mat: 'metal', tile: 1 }); }
      L.box(Z.x, 4.2, Z.z - Z.d / 2 - 1.2, Z.w, 0.5, 0.7, { mat: 'metal', tile: 1 }); L.box(Z.x, 4.2, Z.z + Z.d / 2 + 1.2, Z.w, 0.5, 0.7, { mat: 'metal', tile: 1 });
      for (let k = 0; k < 4; k++) { const g = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(new Float32Array(18), 3)); const ln = new T.Line(g, new T.LineBasicMaterial({ color: 0xbfeaff })); ln.frustumCulled = false; L.deco(ln); this.arcs.push({ ln, Z }); }
    }
  },

  // ---------------- the exits ----------------
  exits(L) {
    // main gate: two leaves, the gatehouse with the console
    this.gateL = L.box(-3, 0, F.z0, 6, 7, 0.4, { mat: 'steel' }); this.gateR = L.box(3, 0, F.z0, 6, 7, 0.4, { mat: 'steel' });
    L.box(-14, 0, -324, 8, 3.6, 6, { mat: 'concrete' }); L.box(-14, 3.6, -324, 8.6, 0.3, 6.6, { mat: 'concreteDark' });
    L.box(-10.2, 0, -324, 0.6, 1.1, 1, { mat: 'metal' }); this.console = V(-9.4, 0, -324);
    L.mesh(new THREE.BoxGeometry(0.05, 0.4, 0.6), 'lamp', -9.88, 1.25, -324);
    L.trigger({ at: [-9.4, -324], r: 1.6 }, () => tip(L, 'console', 'The gate console: press E to open the main gate. LOUD.', 4), { once: false });
    // the crane: a lattice tower by the east fence, its jib reaching out over the fence
    L.box(98, 0, -196, 2.2, 24, 2.2, { mat: 'paintDark' });
    L.ladder(98, -194.9, { face: '+z', y1: 24 });
    L.box(98 + 7, 24, -196, 22, 0.6, 1.2, { mat: 'paintDark', tile: 1 }); L.box(92, 24, -196, 6, 1.8, 2.4, { mat: 'paintDark' });
    L.trigger({ box: [100, 23.8, -196, 6, 4, 4] }, () => tip(L, 'jib', 'Walk the jib out past the fence, then drop into the trees.', 4));
  },

  // ---------------- per frame ----------------
  tick(L, dt) {
    const G = L.G, h = L.hero; if (!h || h.dead) return;
    this.pool.update(dt, h.pos);
    for (const S of this.lights || []) S.update(dt);
    // far people are not drawn (fog hides them anyway): keeps the draw calls sane with forty people
    this.visT = (this.visT || 0) - dt;
    if (this.visT <= 0) { this.visT = 0.4; for (const e of G.enemies) { const far = Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) > 60; e.rig.root.visible = !far; if (e.rig.skin?.holder) e.rig.skin.holder.visible = !far; } }
    // the fence: touching or climbing it shocks, throws you back, stuns
    this.zap -= dt; this.stun = Math.max(0, (this.stun || 0) - dt);
    if (this.stun > 0) G.input.keys = {};
    const p = h.pos, inside = p.x > F.x0 && p.x < F.x1 && p.z > F.z0 && p.z < F.z1;
    const dFence = Math.min(p.x - F.x0, F.x1 - p.x, p.z - F.z0, p.z < -112.5 && Math.abs(p.x) > 20.3 ? F.z1 - p.z : 99);
    const inGate = Math.abs(p.x) < 6 && Math.abs(p.z - F.z0) < 1.5 && this.gateOpen, inCulvert = Math.abs(p.z + 270) < 1.8 && p.y < 1.2 && Math.abs(p.x - F.x0) < 1.5;
    if (inside && dFence < 0.75 && p.y < F.h + 0.8 && !inGate && !inCulvert && this.zap <= 0) {
      const n = p.x - F.x0 === dFence ? V(1, 0, 0) : F.x1 - p.x === dFence ? V(-1, 0, 0) : p.z - F.z0 === dFence ? V(0, 0, 1) : V(0, 0, -1);
      this.shock(L, n, 18);
    }
    // electrified yards
    for (const Z of ZONES) {
      if (Z.mesh) Z.mesh.material.opacity = 0.25 + Math.random() * 0.15;
      if (Math.abs(p.x - Z.x) < Z.w / 2 && Math.abs(p.z - Z.z) < Z.d / 2) {
        if (!this.zoneTaught) { this.zoneTaught = true; G.teach?.('live', 'LIVE FLOOR', ['Space'], 'Their boots are insulated, yours are not. Cross above: pipes, beams, roofs.'); }
        if (p.y < 0.4 && h.grounded && this.zap <= 0) { const n = V(p.x - Z.x, 0, p.z - Z.z).normalize(); this.shock(L, n, 12); }
      }
    }
    for (const A of this.arcs || []) { // flickering arcs over the live yards
      const a = A.ln.geometry.attributes.position, Z = A.Z; let x = Z.x + (Math.random() - 0.5) * Z.w, zz = Z.z + (Math.random() - 0.5) * Z.d;
      for (let k = 0; k < 6; k++) { a.setXYZ(k, x, 0.05 + Math.random() * 0.5, zz); x += (Math.random() - 0.5) * 1.2; zz += (Math.random() - 0.5) * 1.2; }
      a.needsUpdate = true; A.ln.visible = Math.random() < 0.6;
    }
    // collectibles: walk over them
    for (const P of this.picks) {
      if (P.got) continue; P.m.rotation.y += dt * 1.5;
      if (Math.hypot(p.x - P.x, p.z - P.z) < 1.3 && Math.abs(p.y + 0.9 - P.y) < 1.4) {
        P.got = true; P.m.visible = false; this.found++; sfx.ready?.(); G.banner?.(P.title, 1.6);
        L.objective('intel', `Optional: intel files (${this.found}/${PICKS.length})`); if (this.found === PICKS.length) L.done('intel');
        (async () => { for (const [who, t, s] of P.lines) await L.say(who, t, s); })();
      }
    }
    // the gate console
    if (!this.gateOpen && Math.hypot(p.x - this.console.x, p.z - this.console.z) < 1.6 && G.input.keys.KeyE) this.openGate(L);
    for (const W of this.skies) { // skylights: crouch on the glass, or land on it hard, and it gives
      if (W.broken) continue; const b = W.b;
      if (Math.abs(p.x - W.x) < 1.3 && Math.abs(p.z - W.z) < 1.3 && p.y > b.max.y - 0.3 && p.y < b.max.y + 0.8 && ((h.grounded && h.crouching) || h.vel.y < -9)) L.shatter(W, V(0, -1, 0));
    }
    // out: past the fence line on any side (gate, culvert, or off the end of the jib)
    if (!this.out && this.started && (p.z < F.z0 - 2 || p.x < F.x0 - 2 || p.x > F.x1 + 2)) this.escape(L);
  },
  shock(L, n, dmg) {
    const G = L.G, h = L.hero; this.zap = 0.9; this.stun = 0.7;
    if (h.climbing) h.leaveWall?.();
    h.damage(dmg, n.clone().negate(), null, {}); h.vel.x = n.x * 9; h.vel.z = n.z * 9; h.vel.y = 4; h.grounded = false;
    G.fx.sparksAt?.(h.center.clone(), n, 30, 1.4); G.shake?.(0.35); sfx.zap?.(); G.banner?.('SHOCKED', 0.6);
    if (!this.fenceTaught) { this.fenceTaught = true; L.say('', 'Ten thousand volts. Find another way out: the gate, the culvert, or over it from the crane.', 4); }
  },
  openGate(L) {
    this.gateOpen = true; sfx.door?.(); sfx.alarm?.();
    removeBox(this.gateL); removeBox(this.gateR);
    L.alarm(V(0, 0, -320), 120); L.say('PA', 'Main gate is open! Gate teams, he is at the main gate!', 3);
  },

  // ---------------- flow ----------------
  async start(L, ctx) {
    if (['start'].includes(ctx.checkpoint) || !String(ctx.checkpoint).startsWith('yard')) { await LAB.start.call(LAB, L, ctx); return; }
    for (const e of [...L.enemies]) if (e.pos.z > -112) dropEnemy(L, e);
    this.openWorld(L, true);
  },
  async openWorld(L, resumed = false) {
    this.started = true;
    try { L.C.applyEnv?.(OPEN_ENV); } catch (_) {}
    if (!resumed) {
      L.C.reachCheckpoint?.('yard');
      await L.cutscene({
        shots: [
          { from: [-6, 18, -118], to: [-10, 22, -124], look: [0, 4, -220], fov: 50, fovTo: 44, dur: 4.4 },
          { from: [60, 30, -150], to: [30, 34, -170], look: [0, 0, -240], fov: 56, dur: 4.4 },
        ],
        lines: [
          [0.3, 'PA', 'Subject C-9 is on Block A. All yard teams, weapons free. Fence is live.', 3.4],
          [4.0, 'CALDER', 'A whole town of them. And one fence.', 2.4],
          [6.6, 'CALDER', 'Gate, culvert or over the top. Quietly, if I can.', 2.4],
        ],
      });
    }
    L.objective('out', 'Get out of Site 9: the main gate, the west culvert, or the crane by the east fence');
    L.objective('intel', `Optional: intel files (${this.found}/${PICKS.length})`);
    tip(L, 'open', 'They do not look up. Roofs, pipes and walls are yours. In the open their guns will shred you.', 5);
  },
  async escape(L) {
    this.out = true; L.done('out');
    const h = L.hero, me = L.actor({ hero: true, pos: [h.pos.x, 0, h.pos.z], yaw: h.yaw });
    for (const e of L.enemies) e.lastKnown = null;
    await L.cutscene({
      shots: [{ from: [h.pos.x + 4, 2, h.pos.z + 5], to: [h.pos.x + 2, 3, h.pos.z + 3], look: me, fov: 46, dur: 3.4 }],
      lines: [[0.3, 'PA', 'He is outside the wire! Tree line! Dogs, get the dogs!', 3]],
      beats: [[0.4, () => { const out = V(Math.sign(h.pos.x) * (Math.abs(h.pos.x) > 100 ? 1 : 0), 0, h.pos.z < F.z0 ? -1 : 0); me.walkTo(h.pos.x + out.x * 12, h.pos.z + out.z * 12, { run: true }); }]],
      end: () => L.dropActor(me),
    });
    L.end('escape_forest');
  },
};
