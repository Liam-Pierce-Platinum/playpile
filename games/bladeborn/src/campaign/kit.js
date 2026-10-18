// LevelKit: everything a level file builds with. One instance per loaded level (passed to level.build(L) and
// level.start(L)); unloading the level throws all of it away. See CAMPAIGN.md for the full API with examples.
import * as THREE from 'three';
import { addBox, removeBox, boxes, groundBelow, pointInBox, nearestWall } from '../world.js';
import { Enemy } from '../enemy.js';
import { sfx } from '../audio.js';
import { mat } from './mats.js';
import { ventKit } from './vents.js';
import { Cutscene, Actor, say } from './cutscene.js';
const STORY_FREE = new Set(['', 'PA', 'GUARD']);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DIRS = { '+x': V(1, 0, 0), '-x': V(-1, 0, 0), '+z': V(0, 0, 1), '-z': V(0, 0, -1) };
export const dirVec = d => (DIRS[d] || DIRS['+z']).clone();

// campaign enemy types -> engine type + weapon
const TYPES = {
  guard_rifle: { type: 'gunner', gun: 'rifle' },
  guard_baton: { type: 'brute', wkind: 'baton' },
  scientist: { type: 'scientist' },
  thug_sword: { type: 'brute', wkind: 'machete' },
  thug_pistol: { type: 'gunner', gun: 'pistol' },
  sniper: { type: 'gunner', gun: 'sniper', hold: true },
  // raw engine types still work: brute, gunner, thrower
};

export class LevelKit {
  constructor(G, campaign, def) {
    this.G = G; this.C = campaign; this.def = def; this.THREE = THREE; this.V = V;
    this.group = new THREE.Group(); this.group.name = 'level:' + def.id; G.scene.add(this.group);
    this.flags = { ...(def.flags || {}) };
    this.triggers = []; this.doors = []; this.windows = []; this.ladders = []; this.trees = []; this.grates = [];
    this.crawlZones = []; this.mouths = []; this.updaters = []; this.waits = []; this.listeners = {};
    this.debris = []; this.checkpoints = {}; this.time = 0; this.extraCover = []; this.actors = [];
    this.vent = ventKit(this);
  }
  get hero() { return this.G.hero; }
  get enemies() { return this.G.enemies; }
  mat(name) { return mat(name); }

  // ---------- geometry ----------
  // Solid box, feet-based (y = bottom). o: { mat: name|Material, tile (texture metres), cover: true = gunners use
  // it, see: true = sight and bullets pass (glass), visible: false = invisible collider, flags: {...} }
  box(x, y, z, w, h, d, o = {}) {
    const m = typeof o.mat === 'string' || !o.mat ? mat(o.mat || 'concrete') : o.mat;
    const b = addBox(x, y, z, w, h, d, m, o.tile || 4, { mesh: o.visible !== false, ray: !o.see, flags: o.flags, shadow: o.shadow });
    b.level = true; if (o.cover) this.extraCover.push(b);
    return b;
  }
  // a floor slab whose TOP is at o.y (default 0)
  floor(x, z, w, d, o = {}) { return this.box(x, (o.y || 0) - (o.thick || 1), z, w, o.thick || 1, d, { tile: 6, ...o }); }
  // an axis-aligned wall from (x1,z1) to (x2,z2). o: { h = 4, t = 0.3 thickness, y = 0, mat }
  wall(x1, z1, x2, z2, o = {}) {
    const h = o.h || 4, t = o.t || 0.3, y = o.y || 0;
    if (Math.abs(x1 - x2) > Math.abs(z1 - z2)) return this.box((x1 + x2) / 2, y, z1, Math.abs(x2 - x1) + t, h, t, o);
    return this.box(x1, y, (z1 + z2) / 2, t, h, Math.abs(z2 - z1) + t, o);
  }
  // visual only (no collision): any Object3D, removed on unload
  deco(obj) { obj.traverse?.(o => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } }); this.group.add(obj); return obj; }
  mesh(geo, matName, x, y, z) { const m = new THREE.Mesh(geo, typeof matName === 'string' ? mat(matName) : matName); m.position.set(x, y, z); return this.deco(m); }
  // a point light (no shadows, cheap). Grey-white only.
  light(x, y, z, o = {}) { const l = new THREE.PointLight(o.color ?? 0xffdcb0, o.intensity ?? 8, o.dist ?? 12, 2); l.position.set(x, y, z); this.group.add(l); if (o.fixture !== false) this.mesh(new THREE.BoxGeometry(0.8, 0.05, 0.25), 'lamp', x, y + 0.03, z).castShadow = false; return l; }

  // ---------- people ----------
  // type: guard_rifle | guard_baton | scientist | thug_sword | thug_pistol | sniper (or raw brute/gunner/thrower)
  // o: { y (floor height, default 0), yaw, patrol: [[x,z,wait?],...], wander: false, mode: 'alert', tag, alarm: [x,z],
  //      hp, speed, wkind, gun, offhand, kit, see }
  enemy(type, x, z, o = {}) {
    const T = TYPES[type] || { type };
    const opts = { mode: 'unaware', ...T, ...o }; delete opts.type;
    if (opts.patrol || opts.yaw !== undefined) opts.wander = opts.wander ?? false;
    const y = groundBelow(x, z, (o.y || 0) + 0.5);
    const e = new Enemy(this.G, V(x, y, z), o.tier || 0, T.type, opts);
    e.kind = type; e.tag = o.tag; e.spawnT = 0; e.rig.root.rotation.y = e.yaw;
    this.G.enemies.push(e); return e;
  }
  alive(tag) { return this.G.enemies.filter(e => e.alive && (!tag || e.tag === tag)).length; }
  // a scripted person (cutscenes, the friend on a screen, a body on a table). See cutscene.js
  actor(o = {}) { const a = new Actor(this.G, o); this.actors.push(a); return a; }
  dropActor(a) { a.remove(); const i = this.actors.indexOf(a); if (i >= 0) this.actors.splice(i, 1); }

  // ---------- interactables ----------
  // sliding steel door. o: { w = 1.6, h = 2.6, axis: 'x' (door plane runs along x) | 'z', y, locked, auto (opens
  // for anyone near), mat }. Returns { open(), close(), locked, isOpen }
  door(x, z, o = {}) {
    const w = o.w || 1.6, h = o.h || 2.6, t = 0.18, y = o.y || 0, ax = o.axis || 'x', W = ax === 'x' ? w : t, Dd = ax === 'x' ? t : w;
    const collider = () => this.box(x, y, z, W, h, Dd, { visible: false, flags: { door: true, noClimb: true } });
    const panel = this.mesh(new THREE.BoxGeometry(W, h, Dd), o.mat || 'steel', x, y + h / 2, z);
    const D = { b: collider(), panel, x, z, y, h, locked: !!o.locked, auto: !!o.auto, isOpen: false, k: 0, target: 0,
      open: () => { if (D.isOpen) return; D.isOpen = true; D.target = 1; sfx.door(); this.emit('door', D); },
      close: () => { if (!D.isOpen) return; D.isOpen = false; D.target = 0; sfx.door(); },
      unlock: () => { D.locked = false; } };
    D.collider = collider; this.doors.push(D); return D;
  }
  // breakable window: a glass pane that blocks movement but not sight; shatters when you dash, sprint or leap into
  // it, or slash it. o: { w = 2, h = 1.6, y = 0.9 (bottom), axis 'x'|'z', onBreak }
  window(x, z, o = {}) {
    const w = o.w || 2, h = o.h || 1.6, y = o.y ?? 0.9, t = 0.06, ax = o.axis || 'x';
    const b = this.box(x, y, z, ax === 'x' ? w : t, h, ax === 'x' ? t : w, { mat: 'glass', see: true, flags: { glass: true, noClimb: true }, shadow: false });
    // thin frame so the pane reads
    const fr = new THREE.Group(), fm = mat('steel'), fw = 0.06;
    for (const [px, py, sx, sy] of [[0, h / 2, w + fw, fw], [0, -h / 2, w + fw, fw], [-w / 2, 0, fw, h], [w / 2, 0, fw, h]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.1), fm); m.position.set(px, py, 0); fr.add(m); }
    fr.position.set(x, y + h / 2, z); if (ax === 'z') fr.rotation.y = Math.PI / 2; this.deco(fr);
    const W = { b, x, z, y, w, h, ax, broken: false, onBreak: o.onBreak };
    this.windows.push(W); return W;
  }
  shatter(W, dir) {
    if (W.broken) return; W.broken = true; const G = this.G;
    removeBox(W.b); sfx.glass(); G.noise?.(V(W.x, W.y + 1, W.z), 16, true); G.shake(0.2);
    const n = W.ax === 'x' ? V(0, 0, 1) : V(1, 0, 0), d = dir ? dir.clone().setY(0).normalize() : n;
    const gm = mat('glass'), geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.18, 0, 0, 0.05, 0.22, 0], 3)); geo.computeVertexNormals();
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geo, gm); const u = (Math.random() - 0.5) * W.w, v = Math.random() * W.h;
      m.position.set(W.x + (W.ax === 'x' ? u : 0), W.y + v, W.z + (W.ax === 'x' ? 0 : u)); m.scale.setScalar(0.5 + Math.random() * 1.2);
      this.group.add(m);
      this.debris.push({ m, v: d.clone().multiplyScalar(2 + Math.random() * 5).add(V((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)), s: V(Math.random() * 9, Math.random() * 9, 0), life: 6 });
    }
    W.onBreak?.(W); this.emit('window', W);
  }
  // a ladder against a wall. face: the side the climber stands on ('+x'|'-x'|'+z'|'-z'). W climbs, S descends,
  // Space jumps off, the top mantles. o: { y0 = 0, y1 (top, required), w = 0.6, tight (inside a vent shaft) }
  ladder(x, z, o = {}) {
    const n = dirVec(o.face || '+z'), y0 = o.y0 || 0, y1 = o.y1 ?? 4, w = o.w || 0.6, side = V(-n.z, 0, n.x);
    const g = new THREE.Group(), sm = mat('steel'), H = y1 - y0 + 0.9;
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), sm); r.position.copy(side.clone().multiplyScalar(s * w / 2)).setY(H / 2); g.add(r); }
    for (let yy = 0.3; yy < y1 - y0; yy += 0.3) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, w), sm); r.position.set(0, yy, 0); r.rotation.y = Math.atan2(side.x, side.z) + Math.PI / 2; g.add(r); }
    g.position.set(x + n.x * 0.06, y0, z + n.z * 0.06); this.deco(g);
    const Ld = { x, z, y0, y1, n, w, side, tight: !!o.tight }; this.ladders.push(Ld); return Ld;
  }
  // a climbable tree. The trunk is a square collider (claw-climb it like any wall; A/D round it; wall-jump from it
  // leaps to the next trunk you look at), branches are thin boxes you can stand on and claw-grab from the air.
  // o: { y (ground), h = 9, r = 0.5, branches: [{ y, dir: '+x'|..., len }] (default: three), canopy = true, lean }
  tree(x, z, o = {}) {
    const y = o.y || 0, h = o.h || 9, r = o.r || 0.5;
    const trunk = this.box(x, y, z, r * 2, h, r * 2, { mat: 'bark', visible: false, flags: { tree: true } });
    // octagonal trunk whose four flat faces sit exactly on the collider faces (claw gouges land on the bark)
    const ap = r / Math.cos(Math.PI / 8), geo = new THREE.CylinderGeometry(ap, ap * 1.05, h, 8, 3); geo.rotateY(Math.PI / 8);
    const bark = mat('bark'), tm = this.mesh(geo, bark, x, y + h / 2, z);
    const flare = new THREE.CylinderGeometry(ap * 1.05, ap * 1.6, 0.5, 8); flare.rotateY(Math.PI / 8); this.mesh(flare, bark, x, y + 0.25, z);
    const T = { x, z, y, h, r, box: trunk, branches: [] };
    const brs = o.branches || [{ y: h * 0.42, dir: ['+x', '-z', '-x', '+z'][Math.floor(Math.abs(x * 7 + z * 3)) % 4], len: 2.4 }, { y: h * 0.62, dir: ['-x', '+z', '+x', '-z'][Math.floor(Math.abs(x * 5 + z)) % 4], len: 2.0 }, { y: h * 0.8, dir: ['+z', '+x', '-z', '-x'][Math.floor(Math.abs(x + z * 5)) % 4], len: 1.6 }];
    for (const br of brs) {
      const d = dirVec(br.dir), L = br.len || 2, cx = x + d.x * (r + L / 2), cz = z + d.z * (r + L / 2), t = 0.36;
      const bb = this.box(cx, y + br.y, cz, d.x ? L : t, t, d.z ? L : t, { mat: 'bark', tile: 1.5, flags: { branch: true, noClimb: true } });
      T.branches.push(bb);
    }
    if (o.canopy !== false) { // low-poly leaf clumps (no collision)
      const lm = mat('leaf');
      for (let i = 0; i < 6; i++) {
        const a = i * 2.1 + x, rr = 1 + (i % 3) * 0.8, s = 1.4 + ((i * 37) % 10) / 10;
        const m = this.mesh(new THREE.IcosahedronGeometry(s, 0), lm, x + Math.cos(a) * rr, y + h - 0.4 + (i % 2) * 0.9, z + Math.sin(a) * rr);
        m.rotation.set(i, i * 2, 0);
      }
    }
    this.trees.push(T); return T;
  }

  // ---------- triggers, checkpoints, objectives, events ----------
  // spec: { box: [x, y, z, w, h, d] } (feet-based like box()) or { at: [x, z], r, y0 = -1e9, y1 = 1e9 }.
  // fn(L) runs when the hero enters (o.once default true; o.exit = fn on leaving; o.who = 'hero' | 'enemy')
  trigger(spec, fn, o = {}) { const T = { spec, fn, once: o.once !== false, exit: o.exit, who: o.who || 'hero', inside: false, done: false }; this.triggers.push(T); return T; }
  inVolume(spec, p) {
    if (spec.box) { const [x, y, z, w, h, d] = spec.box; return p.x > x - w / 2 && p.x < x + w / 2 && p.z > z - d / 2 && p.z < z + d / 2 && p.y >= y - 0.3 && p.y < y + h; }
    const [x, z] = spec.at; return Math.hypot(p.x - x, p.z - z) < (spec.r || 2) && p.y >= (spec.y0 ?? -1e9) && p.y <= (spec.y1 ?? 1e9);
  }
  // a respawn point. With a volume, reaching it saves progress there (the first checkpoint, 'start', is implicit)
  checkpoint(id, x, y, z, yaw = 0, spec) {
    this.checkpoints[id] = { x, y, z, yaw };
    if (spec) this.trigger(spec, () => this.C.reachCheckpoint(id));
  }
  objective(id, text) { this.C.hud.objective(id, text); this.emit('objective', id); }
  done(id) { this.C.hud.complete(id); this.emit('done', id); }
  on(evt, fn) { (this.listeners[evt] || (this.listeners[evt] = [])).push(fn); }
  emit(evt, ...a) { for (const fn of this.listeners[evt] || []) { try { fn(...a); } catch (err) { console.warn('[level] ' + evt + ': ' + err.message); } } }
  // every frame while the level runs: fn(dt, L)
  every(fn) { this.updaters.push(fn); }
  // promises on GAME time (they stop while paused or skipping a cutscene)
  wait(s) { return new Promise(r => this.waits.push({ t: s, r })); }
  until(cond) { return new Promise(r => this.waits.push({ cond, r })); }
  // subtitle line: who (speaker name, '' for none), text, seconds. Resolves when it is gone.
  // No story: only gameplay voices are spoken (tips, the PA and guards' barks); named characters stay silent
  say(who, text, dur) { return STORY_FREE.has(who) ? say(this.G, who, text, dur) : Promise.resolve(); }
  // No story: a cutscene is skipped the moment it starts (its beats and end() still run, so state and spawns stay right)
  cutscene(def) { const c = new Cutscene(this.G, this, def), p = c.play(); if (c.skippable) c.stop(true); return p; }
  // raise the alarm: everyone within r of p (default: everyone) goes alert, the klaxon sounds
  alarm(p, r = 1e9) { const G = this.G; sfx.alarm(); for (const e of G.enemies) if (e.alive && e.type !== 'scientist' && (!p || e.pos.distanceTo(p) < r)) { e.lastKnown = G.hero.pos.clone(); e.alert(false); } this.emit('alarm', p); }
  // finish the level: next = a chapter id (default: the next chapter), or 'credits'
  end(next) { this.C.finish(next); }
  // a chunk of geometry flies off (kicked grate, door panel): gravity, spin, settles on the floor
  fling(mesh, v, spin = 8) { if (mesh.parent !== this.group) { const p = mesh.getWorldPosition(V(0, 0, 0)); this.group.add(mesh); mesh.position.copy(p); } this.debris.push({ m: mesh, v: v.clone(), s: V(Math.random() * spin, Math.random() * spin, 0), life: 30, solid: true }); }

  // ---------- per frame (called by the campaign) ----------
  update(dt) {
    const G = this.G, h = G.hero; this.time += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; if (w.cond ? w.cond() : (w.t -= dt) <= 0) { this.waits.splice(i, 1); w.r(); } }
    for (const T of this.triggers) {
      if (T.done) continue;
      const inside = T.who === 'enemy' ? G.enemies.some(e => e.alive && this.inVolume(T.spec, e.pos)) : !h.dead && this.inVolume(T.spec, h.pos);
      if (inside && !T.inside) { if (T.once) T.done = true; try { T.fn(this); } catch (err) { console.warn('[level] trigger: ' + err.message); } }
      if (!inside && T.inside && T.exit) T.exit(this);
      T.inside = inside;
    }
    for (const D of this.doors) { // auto doors open for anyone close; panels slide up into the frame
      if (D.auto && !D.locked) { const near = [h, ...G.enemies].some(o => o && Math.hypot(o.pos.x - D.x, o.pos.z - D.z) < 2.6 && Math.abs(o.pos.y - D.y) < 2); if (near && !D.isOpen) D.open(); else if (!near && D.isOpen) D.close(); }
      const k0 = D.k; D.k += Math.sign(D.target - D.k) * Math.min(Math.abs(D.target - D.k), dt * 1.6);
      D.panel.position.y = D.y + D.h / 2 + D.k * (D.h - 0.15);
      if (D.k > 0.55 && D.b) { removeBox(D.b); D.b = null; }
      if (D.k < 0.5 && k0 >= 0.5 && !D.b) D.b = D.collider();
    }
    this.heroSp = Math.max(Math.hypot(h.vel.x, h.vel.z), (this.heroSp || 0) - dt * 25); // recent speed (collision zeroes it on contact)
    if (!h.dead) for (const W of this.windows) { // dash / sprint / leap / slash through glass
      if (W.broken) continue;
      const b = W.b, c = h.center, dx = Math.max(b.min.x - c.x, 0, c.x - b.max.x), dz = Math.max(b.min.z - c.z, 0, c.z - b.max.z), dy = Math.max(b.min.y - c.y, 0, c.y - b.max.y);
      const near = Math.hypot(dx, dz) < 0.75 && dy < 0.8, sp = this.heroSp;
      if (near && (h.dashT > 0 || sp > 7 || h.diving || (!h.grounded && sp > 4))) { this.shatter(W, h.vel); continue; }
      if (h.atk && h.atk.t > 0.04 && h.atk.t < 0.32 && h.clawsOut) {
        h.rig.root.updateMatrixWorld(true);
        for (const hd of ['L', 'R']) { const p = h.clawTip(hd); if (p.x > b.min.x - 0.15 && p.x < b.max.x + 0.15 && p.z > b.min.z - 0.15 && p.z < b.max.z + 0.15 && p.y > b.min.y && p.y < b.max.y) { this.shatter(W, h.forward()); break; } }
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.life -= dt; if (d.rest) continue;
      d.v.y -= 16 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.s.x * dt; d.m.rotation.y += d.s.y * dt;
      const g = groundBelow(d.m.position.x, d.m.position.z, d.m.position.y + 0.3);
      if (d.m.position.y <= g + 0.02) { d.m.position.y = g + 0.02; if (Math.abs(d.v.y) > 2) { d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; if (d.solid) sfx.metal(); } else { d.rest = true; d.m.rotation.x = d.solid ? Math.PI / 2 : -Math.PI / 2; } }
      if (d.life <= 0 && !d.solid) { this.group.remove(d.m); this.debris.splice(i, 1); }
    }
    for (const a of this.actors) a.update(dt);
    for (const fn of this.updaters) fn(dt, this);
  }
  dispose() {
    for (const a of this.actors) a.remove();
    this.G.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.waits.length = 0; this.updaters.length = 0; this.listeners = {};
  }
}
export { nearestWall, pointInBox };
