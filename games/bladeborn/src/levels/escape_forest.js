// CH II THE TREES (?level=escape_forest&play=1). Stealth traversal through the woods outside Site 9, at night.
// A wide forest (x -44..44, z 0..150) with trees everywhere: any line through the canopy works. Patrols sweep the
// ground with flashlights, dog handlers work the paths (a dog smells you on the ground nearby and barks, its handler
// comes to look; within a few metres he knows), the helicopter's light hunts the clearings. Guards never look up:
// in the trees you are hidden. Spotted, you can still break line of sight, climb and lose them. Reach the river
// (z 146): the escape montage (freight line, highway at dawn) and the title card TORONTO, CANADA -> NEXT().
// Trunks, leaves and branches are instanced; their colliders are invisible boxes registered as L.trees.
import { groundBelow } from '../world.js';
import { CHAPTERS, nextChapter, chapterIndex } from '../campaign/registry.js';
import { instancer, building, searchlight, pursue, tip, titleCard, rng, escMats, skyDome } from './escape_kit.js';

// a marked line through the canopy (6 m apart): the trees you can always chain; the rest of the forest is open too
export const SPINE = []; for (let z = 8, i = 0; z <= 146; z += 6, i++) SPINE.push([[0, 3, -1, 2.5, -2, 1.5][i % 6] + Math.sin(z * 0.05) * 6, z]);
const END_Z = 147, W = 44;
const SPAWNS = [[-40, 0, 10], [40, 0, 30], [-40, 0, 60], [40, 0, 90], [-40, 0, 120], [40, 0, 140]];
const MX = 900;
export const NEXT = () => (chapterIndex('escape_forest') >= 0 && nextChapter('escape_forest')) || (CHAPTERS.some(c => c.id === 'toronto') ? 'toronto' : 'tower');
const PATROLS = [
  [[-20, 30, 2], [20, 30, 2]], [[25, 45, 2], [25, 80, 2]], [[-30, 55, 3], [-5, 70, 2], [-30, 85, 2]], [[10, 95, 2], [-20, 100, 2]],
  [[30, 110, 2], [5, 125, 2]], [[-25, 120, 2], [-25, 140, 2]], [[0, 60, 2], [12, 72, 2], [0, 84, 2]], [[-12, 135, 2], [15, 138, 2]],
];
const HANDLERS = [[[-8, 40, 2], [-8, 75, 2]], [[20, 85, 2], [-10, 110, 2]], [[5, 115, 2], [30, 135, 2]]];

export default {
  id: 'escape_forest',
  title: 'THE TREES',
  flags: { gunsKill: false },
  env: { bg: 0x161d1a, fog: [12, 75, 0x161d1a], hemi: 0.42, sun: 0.45, exposure: 1.1 },
  bounds: [-W + 2, -4, W - 2, 150],

  build(L) {
    const T = L.THREE, I = instancer(L), r = rng(41);
    this.route = []; this.ending = false; this.dogs = []; skyDome(L, 0x060b14, 0x1e3330);
    L.floor(0, 75, 200, 220, { mat: 'dirt', thick: 8 });
    for (const s of [-1, 1]) L.wall(s * W, -6, s * W, 156, { h: 50, y: -1, visible: false, see: true }); // dense thorn thicket at the sides (no way through)
    L.wall(-W, -4, W, -4, { h: 50, visible: false, see: true }); L.wall(-W, 154, W, 154, { h: 50, visible: false, see: true });
    L.box(0, 0, -2, W * 2, 3.2, 0.1, { mat: 'steel', see: true }); // the Site 9 fence behind him
    for (let x = -W; x <= W; x += 3) L.mesh(new T.BoxGeometry(0.1, 3.4, 0.1), 'steel', x, 1.7, -2);
    L.checkpoint('start', 0, 0, 4.5, 0);
    // ---- trees: the marked line, then the whole forest (all climbable), decorative depth outside ----
    const tree = (x, z, o = {}) => this.addTree(L, I, x, z, o);
    SPINE.forEach(([x, z], i) => {
      const nx = SPINE[i + 1], dir = nx ? (Math.abs(nx[0] - x) > Math.abs(nx[1] - z) ? (nx[0] > x ? '+x' : '-x') : '+z') : '+z';
      const h = 12 + r() * 2;
      this.route.push(tree(x, z, { h, branches: [{ y: h * 0.5, dir, len: 2.2 }, { y: h * 0.7, dir: ['+x', '-x', '+z', '-z'][Math.floor(r() * 4)], len: 1.7 }] }));
    });
    const near = (x, z, d) => SPINE.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < d);
    for (let z = 5; z < 150; z += 6.2) for (let x = -W + 4; x <= W - 4; x += 6.2) {
      const tx = x + (r() - 0.5) * 2.6, tz = z + (r() - 0.5) * 2.6;
      if (near(tx, tz, 4.4) || tz < 3) continue;
      if (r() < 0.12) continue; // clearings
      tree(tx, tz, { h: 10 + r() * 4, r: 0.4 + r() * 0.2 });
    }
    const g = this.geo(T);
    for (let i = 0; i < 360; i++) {
      const side = i % 2 ? 1 : -1, x = i < 280 ? side * (W + 2 + r() * 30) : -60 + r() * 120, z = i < 280 ? -20 + r() * 190 : 156 + r() * 40, h = 11 + r() * 7;
      I.add('trunk', g.trunk, 'bark', x, h / 2, z, 0.5, h, 0.5);
      for (let k = 0; k < 3; k++) I.add('leaf', g.clump, 'leaf', x + (r() - 0.5) * 3, h - 1.2 + k, z + (r() - 0.5) * 3, 1.8 + r(), 1.5 + r(), 1.8 + r(), r() * 6);
    }
    for (let i = 0; i < 220; i++) I.add('bush', g.clump, 'leaf', -W + r() * W * 2, 0.3, 2 + r() * 146, 0.6 + r() * 0.6, 0.4 + r() * 0.3, 0.6 + r() * 0.6, r() * 6, 0, false);
    // the river at the far edge
    const water = new T.Mesh(new T.PlaneGeometry(200, 30), escMats(T).water); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.02, 165); L.deco(water);
    // ---- patrols with flashlights, dog handlers ----
    const beam = new T.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.05, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    const cone = new T.ConeGeometry(2.4, 11, 14, 1, true); cone.translate(0, -5.5, 0); cone.rotateX(-Math.PI / 2 - 0.12);
    const torch = e => { const c = new T.Mesh(cone, beam); c.position.set(0.2, 1.35, 0.3); c.castShadow = false; c.renderOrder = 4; e.rig.root.add(c); const lamp = new T.Mesh(new T.SphereGeometry(0.06, 6, 4), L.mat('lamp')); lamp.position.set(0.2, 1.35, 0.32); e.rig.root.add(lamp); };
    PATROLS.forEach((p, i) => torch(L.enemy(i % 3 === 2 ? 'guard_baton' : 'guard_rifle', p[0][0], p[0][1], { patrol: p, tag: 'woods' })));
    for (const p of HANDLERS) { const e = L.enemy('guard_rifle', p[0][0], p[0][1], { patrol: p, tag: 'woods', speed: 3.4 }); torch(e); this.dogs.push(this.dog(L, e)); }
    L.checkpoint('mid', 0, 0, 74, 0, { box: [0, -1, 74, W * 2, 40, 3] });
    // ---- the helicopter light over the clearings: the canopy (anything 1.8 m+ off the ground) hides you ----
    const hp = { x: 0, z: -20, t: 0 };
    this.heliLight = searchlight(L, {
      at: [0, 32, -20], tower: false, angle: 0.1, power: 3000, speed: 0.4, sweep: [[0, 0, 0], [0, 0, 1]],
      follow: dt => { const h = L.hero; hp.t += dt; const tz = Math.min(140, h.pos.z + 8); hp.z += Math.sign(tz - hp.z) * Math.min(Math.abs(tz - hp.z), dt * 4); hp.x = Math.sin(hp.t * 0.2) * 25; return [hp.x, 32, hp.z]; },
      sweepFn: t => [hp.x + Math.sin(t * 1.1) * 14, 0, hp.z + Math.sin(t * 0.7) * 12],
      hidden: this.heliHidden = h => h.climbing || h.pos.y - groundBelow(h.pos.x, h.pos.z, h.pos.y + 0.1) > 1.8,
      onSpot: () => this.onSpot(L),
    });
    L.every(dt => { if (this.ending) return; this.heliLight.update(dt); for (const D of this.dogs) D.update(dt); });
    L.trigger({ box: [0, -1, 20, W * 2, 3, 3] }, () => L.say('GUARD', 'Spread out. Flashlights on the ground, he is on foot.', 2.8));
    L.trigger({ box: [0, -1, 100, W * 2, 3, 3] }, () => L.say('PA', 'Dog teams, push to the river. Nobody crosses.', 3));
    L.trigger({ box: [0, -1, END_Z + 1, W * 2, 40, 4] }, () => this.finale(L));
    this.buildMontage(L, I);
    I.flush();
  },

  // a dog: a low box body that trots at its handler's heel, noses the ground, barks when it smells you
  dog(L, e) {
    const T = L.THREE, V3 = (x, y, z) => new T.Vector3(x, y, z), g = new T.Group(), m = L.mat('paintDark'), D = { e, g, t: Math.random() * 9, sniff: 0, bark: 0, pos: e.pos.clone() };
    const part = (w, h, d, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    part(0.3, 0.3, 0.8, 0, 0.55, 0); D.head = part(0.22, 0.24, 0.32, 0, 0.75, 0.5); part(0.06, 0.1, 0.3, 0, 0.62, -0.5);
    D.legs = [[-0.1, 0.3], [0.1, 0.3], [-0.1, -0.3], [0.1, -0.3]].map(([x, z]) => part(0.08, 0.42, 0.08, x, 0.21, z));
    L.deco(g);
    D.update = dt => {
      const h = L.hero; D.t += dt;
      if (!e.alive) { g.rotation.z = Math.PI / 2; return; }
      const side = V3(Math.cos(e.yaw) * 0.9, 0, -Math.sin(e.yaw) * 0.9), want = e.pos.clone().add(side).addScaledVector(V3(Math.sin(e.yaw), 0, Math.cos(e.yaw)), 1.2);
      const d = want.sub(D.pos), sp = Math.min(d.length(), dt * 6); if (d.length() > 0.05) { D.pos.addScaledVector(d.normalize(), sp); g.rotation.y = Math.atan2(d.x, d.z); }
      const trot = Math.min(1, sp / dt / 3); D.legs.forEach((l, i) => l.rotation.x = Math.sin(D.t * 12 + (i % 3 ? Math.PI : 0)) * 0.6 * trot);
      g.position.set(D.pos.x, e.pos.y, D.pos.z); D.head.position.y = 0.75 - (D.sniff > 0 ? 0.25 : 0);
      // the nose: on the ground nearby he smells you; up a tree only very close
      const dx = h.pos.x - D.pos.x, dz = h.pos.z - D.pos.z, dist = Math.hypot(dx, dz), up = h.climbing || h.pos.y - groundBelow(h.pos.x, h.pos.z, h.pos.y + 0.1) > 1.8;
      D.bark -= dt; D.sniff -= dt;
      if (!h.dead && e.mode !== 'alert' && D.bark <= 0 && (dist < (up ? 3 : 8))) {
        D.bark = 1.6; D.sniff = 0.6; g.rotation.y = Math.atan2(dx, dz); L.G.shake?.(0.02);
        try { L.say('', '*the dog barks*', 1); } catch (_) {}
        if (!up && dist < 4.5) e.alert(true); else e.hear(h.pos.clone(), false, 0.7);
      }
    };
    return D;
  },

  geo(T) { return this._g || (this._g = (() => {
    const ap = 1 / Math.cos(Math.PI / 8), trunk = new T.CylinderGeometry(ap, ap * 1.05, 1, 8, 2); trunk.rotateY(Math.PI / 8);
    const flare = new T.CylinderGeometry(ap * 1.05, ap * 1.6, 1, 8); flare.rotateY(Math.PI / 8);
    return { trunk, flare, clump: new T.IcosahedronGeometry(1, 0), branch: new T.BoxGeometry(1, 1, 1) };
  })()); },

  // a climbable tree (same contract as L.tree: square collider flagged tree, branch boxes flagged branch) drawn
  // with instances. o: { y, h, r, branches: [{ y, dir, len }] }
  addTree(L, I, x, z, o = {}) {
    const g = this.geo(L.THREE), y = o.y || 0, h = o.h || 11, r = o.r || 0.5, rr = rng(Math.floor(x * 13 + z * 7 + 99));
    const box = L.box(x, y, z, r * 2, h, r * 2, { visible: false, flags: { tree: true } });
    I.add('trunk', g.trunk, 'bark', x, y + h / 2, z, r, h, r);
    I.add('flare', g.flare, 'bark', x, y + 0.25, z, r, 0.5, r);
    const Tr = { x, z, y, h, r, box, branches: [] };
    const brs = o.branches || [{ y: h * (0.4 + rr() * 0.1), dir: ['+x', '-z', '-x', '+z'][Math.floor(rr() * 4)], len: 1.6 + rr() * 0.8 }, { y: h * (0.62 + rr() * 0.1), dir: ['-x', '+z', '+x', '-z'][Math.floor(rr() * 4)], len: 1.4 + rr() * 0.6 }];
    for (const br of brs) {
      const d = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[br.dir], len = br.len || 2, t = 0.36, cx = x + d[0] * (r + len / 2), cz = z + d[1] * (r + len / 2);
      Tr.branches.push(L.box(cx, y + br.y, cz, d[0] ? len : t, t, d[1] ? len : t, { visible: false, flags: { branch: true, noClimb: true } }));
      I.add('branch', g.branch, 'bark', cx, y + br.y + t / 2, cz, d[0] ? len : t, t, d[1] ? len : t);
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 2.1 + x, k = 1 + (i % 3) * 0.9, s = 1.5 + rr() * 1.1;
      I.add('leaf', g.clump, 'leaf', x + Math.cos(a) * k, y + h - 0.5 + (i % 2) * 1.0, z + Math.sin(a) * k, s, s * 0.8, s, i * 2);
    }
    L.trees.push(Tr); return Tr;
  },

  onSpot(L) {
    this.spots = (this.spots || 0) + 1; L.alarm(L.hero.pos.clone(), 30);
    pursue(L, SPAWNS, { n: 2, cap: 4, min: 18, types: ['guard_rifle', 'guard_baton'] });
    L.say(...[['PA', 'Light on him! Ground teams, converge!'], ['PA', 'There, in the clearing!']][(this.spots - 1) % 2], 2.4);
    if (this.spots === 1) tip(L, 'lose', 'Seen. Break their line of sight: get up a trunk. Up there they lose you.', 4);
  },

  async start(L, ctx) {
    L.objective('north', 'Reach the river. Stay in the trees, out of the flashlights');
    if (ctx.checkpoint !== 'start') return;
    const me = L.actor({ hero: true, pos: [0, 0, 3.2], yaw: 0, pose: 'kneel' });
    await L.cutscene({
      shots: [
        { from: [-4, 1.0, -5], to: [-3, 1.4, -4], look: [0, 1.2, 6], lookTo: [0, 3, 30], fov: 48, fovTo: 42, dur: 3.6 },
        { from: [2.4, 1.5, 3.4], to: [2.0, 1.6, 3.0], look: [0, 1, 40], fov: 44, dur: 3.2 },
      ],
      lines: [
        [0.4, 'PA', 'Ground teams into the woods. Flashlights and dogs. He is on foot.', 3.4],
        [4.0, 'CALDER', 'They never look up.', 1.8],
      ],
      beats: [[3.6, () => me.pose('idle')]],
      end: () => { L.dropActor(me); L.hero.pos.set(0, 0, 4.5); L.hero.yaw = 0; L.G.input.yaw = 0; },
    });
    tip(L, 'trunk', 'Jump at a trunk and click: claw in. Look at the next trunk, SPACE: leap. The flashlights only sweep the ground.', 6);
  },

  // ---- the montage sets, far east of the woods ----
  buildMontage(L, I) {
    const T = L.THREE, M = escMats(T), r = rng(5), g = this.geo(T);
    // 1. freight line through the trees (z = 0)
    L.floor(MX, 0, 420, 40, { mat: 'dirt' });
    for (const s of [-0.75, 0.75]) L.mesh(new T.BoxGeometry(420, 0.15, 0.1), 'steel', MX, 0.08, s);
    const train = this.train = new T.Group(); L.deco(train);
    for (let i = 0; i < 7; i++) { const c = new T.Mesh(new T.BoxGeometry(12, 3.2, 3), L.mat(i ? 'paintDark' : 'steel')); c.position.set(-i * 13, 2.2, 0); train.add(c); const u = new T.Mesh(new T.BoxGeometry(11, 0.6, 2.4), L.mat('black')); u.position.set(-i * 13, 0.4, 0); train.add(u); }
    for (let i = 0; i < 80; i++) { const x = MX - 200 + r() * 400, z = (r() < 0.5 ? -1 : 1) * (7 + r() * 16), h = 10 + r() * 6; I.add('trunk', g.trunk, 'bark', x, h / 2, z, 0.5, h, 0.5); I.add('leaf', g.clump, 'leaf', x, h, z, 2.2, 1.8, 2.2, r() * 6); }
    // 2. highway at dawn (z = 300)
    L.floor(MX, 300, 40, 420, { mat: 'concreteDark' });
    for (let z = 100; z < 500; z += 9) L.mesh(new T.BoxGeometry(0.15, 0.02, 3.5), 'concreteLight', MX, 0.01, z);
    L.mesh(new T.BoxGeometry(0.15, 0.5, 400), 'steel', MX + 8, 0.6, 300);
    L.mesh(new T.BoxGeometry(18, 1.6, 0.3), 'paintDark', MX, 6.5, 330); for (const s of [-1, 1]) L.mesh(new T.BoxGeometry(0.3, 6.5, 0.3), 'steel', MX + s * 9, 3.25, 330);
    this.trucks = [];
    for (let i = 0; i < 3; i++) { const t = new T.Group(); const a = new T.Mesh(new T.BoxGeometry(2.5, 3.4, 9), L.mat('concreteLight')); a.position.y = 2.1; t.add(a); const b = new T.Mesh(new T.BoxGeometry(2.4, 2.4, 2.4), L.mat('paintDark')); b.position.set(0, 1.6, 5.8); t.add(b); t.position.set(MX + (i % 2 ? -2 : 3), 0, 420 + i * 45); L.deco(t); this.trucks.push(t); }
    // 3. the city across the water (z = 600)
    L.floor(MX, 596, 60, 20, { mat: 'concrete' });
    const water = new T.Mesh(new T.PlaneGeometry(600, 400), M.water); water.rotation.x = -Math.PI / 2; water.position.set(MX, -0.6, 806); L.deco(water);
    for (let i = 0; i < 26; i++) { const x = MX - 120 + i * 9.5 + r() * 3, h = 18 + r() * 55 * (1 - Math.abs(i - 13) / 16), w = 6 + r() * 5; building(L, I, x, 700 + r() * 30, w, 7, h, { faces: ['-z'], win: 0.45, mat: r() < 0.5 ? 'concreteLight' : 'concrete' }); }
    L.mesh(new T.CylinderGeometry(1.4, 3.2, 100, 6), 'concreteLight', MX + 22, 50, 712); // the needle tower
    L.mesh(new T.CylinderGeometry(5.5, 4.5, 6, 10), 'concrete', MX + 22, 72, 712); L.mesh(new T.CylinderGeometry(0.4, 0.8, 30, 6), 'steel', MX + 22, 115, 712);
  },

  async finale(L) {
    if (this.ending) return; this.ending = true;
    L.done('north');
    for (const e of [...L.enemies]) e.lastKnown = null;
    const ex = L.hero.pos.x;
    const me = L.actor({ hero: true, pos: [ex, 0, END_Z + 2], yaw: 0 });
    let ride = false, tx = MX - 120, trk = false;
    L.every(dt => {
      if (ride) { tx += dt * 15; this.train.position.set(tx, 0, 0); me.place(tx - 13 * 2 - 2, 3.8, 0, Math.PI / 2); }
      if (trk) for (const t of this.trucks) { t.position.z -= dt * 22; if (t.position.z < 200) t.position.z += 300; }
    });
    const env = e => { try { L.C.applyEnv(e); } catch (_) {} };
    await L.cutscene({
      shots: [
        { from: [ex - 3, 1.2, END_Z + 6], to: [ex - 2, 1.6, END_Z + 7], look: me, fov: 46, dur: 2.6 },
        { from: [-4, 0.3, 6.5], follow: me, look: me, fov: 50, dur: 3.6 },
        { from: [MX - 40, 5, 18], to: [MX - 30, 6, 16], look: me, fov: 40, dur: 3.0 },
        { from: [MX + 4.5, 1.6, 300], to: [MX + 4, 2.2, 304], look: me, fov: 45, dur: 3.6 },
        { from: [MX - 2.5, 1.5, 590], to: [MX - 2, 2.4, 592], look: [MX + 10, 26, 712], fov: 56, fovTo: 50, dur: 5.6 },
      ],
      lines: [
        [0.3, 'PA', 'Lost him at the river. Widen the net.', 2.4],
        [2.8, 'CALDER', 'Three nights on a freight line. Nobody looks at the roof.', 3.4],
        [9.6, 'CALDER', 'Two more on foot.', 2.0],
        [13.4, 'CALDER', 'He sold me from this city. He is still in it.', 3.2],
      ],
      beats: [
        [0.1, () => me.walkTo(ex, END_Z + 8, { run: true })],
        [2.6, () => { me.pose('kneel'); ride = true; }],
        [9.2, () => { ride = false; me.pose('idle'); env({ bg: 0x9a8f86, fog: [50, 190, 0x9a8f86], hemi: 0.95, sun: 1.3, exposure: 1.0 }); me.place(MX + 6.5, 0, 296, 0); me.walkTo(MX + 6.5, 312); trk = true; }],
        [12.8, () => { trk = false; me.place(MX, 0, 593.5, 0); me.walkTo(MX, 594.5); }],
        [13.2, () => titleCard('TORONTO, CANADA')],
      ],
      end: () => { ride = trk = false; L.dropActor(me); },
    });
    await L.wait(0.8); titleCard('');
    L.end(NEXT());
  },
};
