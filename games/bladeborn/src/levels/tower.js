// CH V THE TOWER (?level=tower&play=1). Rourke Tower, King St W, night, rain. In through the lobby (clear it), the
// express elevator to floor 68, then floor by floor: every floor is a security crew round the central core; kill
// the crew and the stair door to the next floor unlocks (a ladder up a corner shaft). Floor 71's stair comes out on
// the roof: the helipad, Rourke with two katanas (boss layer: ./tower_boss.js), the helicopter circling (rotor
// wash in phase II pushes you toward the open east/west edges). Beaten, he kneels: double-click LMB = RECKONING.
// Ending cutscene, then the credits. Art helpers: ./tower_fx.js. Tower footprint x, z in [-12, 12].
import * as THREE from 'three';
import { towerMats, buildCity, makeRain, makeHeli, lightPool } from './tower_fx.js';
import { makeBoss, patchHero } from './tower_boss.js';
import { skyDome } from './escape_kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FL = [38, 42.5, 47, 51.5], ROOF = 56, HALF = 12;
const NAMES = ['68', '69', '70', '71'];
const STAIR = [[1, -1], [-1, -1], [-1, 1], [1, 1]];      // corner of the shaft from floor i up to floor i + 1 (3 = roof)
const SC = 10.2, SH = 1.3;                               // shaft centre offset, half size
const CREWS = [
  [['guard_baton', -7, -7, [[-7, -7, 2], [7, -7, 2]]], ['guard_rifle', 7, 7, null, 2.4], ['guard_baton', -7, 8, [[-7, 8, 2], [-7, -2, 2]]], ['guard_rifle', 5, -4, [[5, -4, 3], [9, 3, 2]]]],
  [['guard_rifle', 8, 6, null, 3.1], ['thug_pistol', -8, 6, [[-8, 6, 2], [-8, -6, 2]], 0, 'smg'], ['guard_baton', 0, -8, [[-6, -8, 2], [6, -8, 2]]], ['guard_baton', 7, -2], ['guard_rifle', -5, -9, null, 0.6]],
  [['thug_sword', -7, 6, null, 3, 'katana'], ['thug_pistol', 7, 7, null, 2.5, 'shotgun'], ['guard_rifle', 7, -7, [[7, -7, 2], [7, 4, 2]]], ['guard_baton', -2, -8], ['thug_pistol', -8, -2, null, 1.6, 'smg']],
  [['guard_rifle', -8, -8, null, 0.8], ['guard_rifle', 8, -8, null, -0.8], ['thug_sword', 0, 8, null, Math.PI, 'katana'], ['guard_baton', -7, 4], ['thug_pistol', 7, 2, [[7, 2, 2], [7, 8, 2]], 0, 'shotgun'], ['guard_baton', 3, -6]],
];

function dropEnemy(L, e) { const G = L.G; G.scene.remove(e.rig.root); e.rig.skin?.dispose?.(); if (e.laser) G.scene.remove(e.laser); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }
// a rect minus one hole, as up to 4 rects
function minusHole([x0, z0, x1, z1], [a, b, c, d]) {
  return [[x0, z0, a, z1], [c, z0, x1, z1], [a, z0, c, b], [a, d, c, z1]].filter(r => r[2] - r[0] > 0.05 && r[3] - r[1] > 0.05);
}

export default {
  id: 'tower',
  title: 'THE TOWER',
  flags: { gunsKill: false },
  env: { bg: 0x5a3c4a, fog: [60, 420, 0x5a3c4a], hemi: 0.6, sun: 0.5, exposure: 1.12 }, // dusk over the lake
  bounds: [-11.5, -11.5, 11.5, 11.5],

  build(L) {
    const M = towerMats(); this.doors = []; this.up = false; this.bossOn = false;
    buildCity(L); skyDome(L, 0x221d44, 0xe8874c);
    // ---- plaza and the tower shell (curtain wall, front faces only: from inside you see the city through it) ----
    L.floor(0, 20, 80, 60, { mat: 'concreteDark' });
    L.wall(-30, 34, 30, 34, { h: 8, visible: false }); L.wall(-30, 12, -30, 34, { h: 8, visible: false }); L.wall(30, 12, 30, 34, { h: 8, visible: false });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.2, ROOF - 0.3, HALF * 2 + 0.2), M.curtain); shell.position.set(0, (ROOF - 0.3) / 2, 0); L.deco(shell);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.6, 0.6, HALF * 2 + 0.6), L.mat('steel')); crown.position.set(0, ROOF - 0.3, 0); L.deco(crown);
    for (const [x1, z1, x2, z2] of [[-HALF, -HALF, HALF, -HALF], [-HALF, HALF, -2, HALF], [2, HALF, HALF, HALF], [-HALF, -HALF, -HALF, HALF], [HALF, -HALF, HALF, HALF]]) L.wall(x1, z1, x2, z2, { h: 6.3, t: 0.3, mat: 'concreteDark', visible: false });
    L.wall(-2, HALF, 2, HALF, { y: 3.5, h: 2.8, t: 0.3, visible: false });
    this.front = L.door(0, HALF, { axis: 'x', w: 4, h: 3.5, auto: true, mat: 'glass' });
    for (const s of [-1, 1]) { L.box(s * 6, 0, 16, 0.5, 4, 0.5, { mat: 'steel', cover: true }); L.light(s * 6, 4.2, 16, { intensity: 6, dist: 12 }); }
    L.box(-9, 0, 20, 4, 0.9, 1.2, { mat: 'concrete', cover: true }); L.box(8, 0, 22, 4, 0.9, 1.2, { mat: 'concrete', cover: true }); // planters
    L.checkpoint('start', 0, 0, 27, Math.PI);
    // ---- the lobby (0 - 6 m): the core, a desk, pillars; its ceiling is the first slab ----
    L.box(0, 6, 0, HALF * 2, 0.3, HALF * 2, { mat: 'concreteDark', flags: { noClimb: true } });
    L.box(0, 0, 0, 6, 6, 6, { mat: 'concrete' });
    L.box(0, 0, 6.5, 5, 1.1, 1.2, { mat: 'paintDark', cover: true, tile: 1.2 });
    for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) L.box(x, 0, z, 1, 6, 1, { mat: 'concreteLight' });
    this.elevDoor(L, 0);
    const pool = this.pool = lightPool(L, 5);
    for (const [x, z] of [[-6, 0], [6, 0], [0, 9], [0, -9]]) pool.add(x, 5.95, z, { intensity: 10, dist: 14 });
    for (const [t, x, z, yaw] of [['guard_rifle', -8, 9, 2.5], ['guard_baton', 5, 8, Math.PI], ['guard_baton', -5, -8, 0], ['thug_pistol', 8, -6, -0.8]]) L.enemy(t, x, z, { yaw, tag: 'lobby' });
    // ---- floors 68 - 71 and the roof ----
    L.box(0, FL[0], 0, 6, ROOF - FL[0], 6, { mat: 'concrete' }); // the core runs through every floor
    FL.forEach((y, i) => this.floor(L, i, y, pool));
    this.roof(L);
    // ---- falling off the tower kills ----
    L.every(() => { const h = L.hero; if (this.up && !h.dead && h.pos.y < 30) { h.hp = 0; h.die(V(0, -1, 0)); } });
    // ---- rain, the helicopter ----
    this.rain = makeRain(L); this.heli = makeHeli(L);
    L.every(dt => {
      const h = L.hero, out = h.pos.y > ROOF - 0.5 || Math.abs(h.pos.x) > HALF || Math.abs(h.pos.z) > HALF;
      this.rain.update(dt, L.G.camera?.position, V(this.gust === 'on' ? -9 : -2, 0, 1), out || !!L.G.cut);
      this.heli.update(dt, this.bossOn && this.boss ? this.boss.e.pos.clone().lerp(h.pos, 0.5).setY(ROOF) : null);
      pool.update(dt, h.pos);
    });
  },

  elevDoor(L, y) {
    for (const s of [-1, 1]) L.mesh(new THREE.BoxGeometry(0.95, 2.6, 0.06), 'steel', s * 0.5, y + 1.3, 3.03);
    L.mesh(new THREE.BoxGeometry(2.4, 0.15, 0.08), 'lamp', 0, y + 2.85, 3.04);
  },

  floor(L, i, y, pool) {
    const [sx, sz] = STAIR[i], cx = sx * SC, cz = sz * SC, tag = 'f' + i;
    // slab with the shaft hole from the floor below (floor 0 sits on the solid stack below it)
    const hole = i > 0 ? (() => { const [px, pz] = STAIR[i - 1]; return [px * SC - SH, pz * SC - SH, px * SC + SH, pz * SC + SH]; })() : null;
    for (const [x0, z0, x1, z1] of hole ? minusHole([-HALF, -HALF, HALF, HALF], hole) : [[-HALF, -HALF, HALF, HALF]]) L.box((x0 + x1) / 2, y - 0.3, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'concreteDark', flags: { noClimb: true } });
    if (i === 0) L.box(0, 6.3, 0, HALF * 2, y - 6.6, HALF * 2, { visible: false, flags: { noClimb: true } });
    for (const [x1, z1, x2, z2] of [[-HALF, -HALF, HALF, -HALF], [-HALF, HALF, HALF, HALF], [-HALF, -HALF, -HALF, HALF], [HALF, -HALF, HALF, HALF]]) L.wall(x1, z1, x2, z2, { y, h: 4.2, t: 0.3, visible: false, mat: 'glass' });
    this.elevDoor(L, y);
    // office: desk rows (cover), a few partitions, the lights
    for (const [x, z] of [[-8, -4], [-8, 4], [8, -4], [8, 4], [-4, -8], [4, -8], [-4, 8], [4, 8]]) {
      if (Math.hypot(x - cx, z - cz) < 4) continue;
      L.box(x, y, z, Math.abs(x) > 6 ? 1.2 : 2.6, 0.8, Math.abs(x) > 6 ? 2.6 : 1.2, { mat: i % 2 ? 'paintDark' : 'paint', cover: true, tile: 1.2 });
    }
    L.box(-5, y, 0, 0.12, 2.2, 3, { mat: 'concreteLight', cover: true }); L.box(5, y, 0, 0.12, 2.2, 3, { mat: 'concreteLight', cover: true });
    for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7], [0, -8], [0, 8], [-8, 0], [8, 0]]) pool.add(x, y + 4.15, z, { intensity: 8, dist: 11 });
    // the stair shaft up: riser wall + ladder on its inner face, a locked door into the shaft
    const top = i < 3 ? FL[i + 1] : ROOF, ex = cx - sx * SH;
    L.box(ex - sx * 0.15, y, sz * (Math.abs(cz) - SH + HALF) / 2, 0.3, top - y - 0.3, HALF - Math.abs(cz) + SH, { mat: 'concrete' });
    L.ladder(ex, cz, { face: sx > 0 ? '+x' : '-x', y0: y, y1: top });
    const wz = cz - sz * SH, dW = 1.5;
    L.wall(ex - sx * 0.3, wz, cx - dW / 2 * sx, wz, { y, h: 4.2, t: 0.2, mat: 'concrete' });
    L.wall(cx + dW / 2 * sx, wz, sx * HALF, wz, { y, h: 4.2, t: 0.2, mat: 'concrete' });
    L.box(cx, y + 2.6, wz, dW, 1.6, 0.2, { mat: 'concrete' });
    this.doors[i] = L.door(cx, wz, { axis: 'x', w: dW, h: 2.6, y, locked: true });
    // the crew
    for (const [t, x, z, patrol, yaw, w] of CREWS[i]) {
      const o = { y, tag, hp: 100 + i * 10 };
      if (patrol) o.patrol = patrol; else o.yaw = yaw || 0;
      if (w === 'katana') o.wkind = 'katana'; else if (w) o.gun = w;
      L.enemy(t, x, z, o);
    }
    if (i > 0) { const [px, pz] = STAIR[i - 1]; L.checkpoint('f' + i, px * SC - px * (SH + 1.2), y, pz * SC, px > 0 ? -Math.PI / 2 : Math.PI / 2, { box: [px * SC - px * (SH + 1), y, pz * SC, 2, 3, 3] }); }
    else L.checkpoint('f0', 0, y, 4.4, 0);
  },

  roof(L) {
    const M = towerMats(), [px, pz] = STAIR[3];
    this.hatchHole = [px * SC - SH, pz * SC - SH, px * SC + SH, pz * SC + SH];
    for (const [x0, z0, x1, z1] of minusHole([-HALF, -HALF, HALF, HALF], this.hatchHole)) L.box((x0 + x1) / 2, ROOF - 0.3, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'concreteDark', flags: { noClimb: true } });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(8.5, 40), M.mark); pad.rotation.x = -Math.PI / 2; pad.position.set(0, ROOF + 0.02, 0); L.deco(pad);
    for (const s of [-1, 1]) L.box(0, ROOF, s * (HALF - 0.15), HALF * 2, 1.0, 0.3, { mat: 'steel', flags: { noClimb: true } }); // lips north and south; east and west are open
    for (const [x, z] of [[-11.6, -11.6], [11.6, -11.6], [-11.6, 11.6], [11.6, 11.6]]) { L.mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), 'lamp', x, ROOF + 0.15, z); }
    L.checkpoint('roof', px * SC - px * (SH + 1.2), ROOF, pz * SC, px > 0 ? -Math.PI / 2 : Math.PI / 2, { box: [px * SC - px * (SH + 1), ROOF, pz * SC, 2, 3, 3] });
    L.trigger({ box: [0, ROOF - 0.2, 0, 20, 4, 20] }, () => this.bossIntro(L));
  },

  // ---------------- flow ----------------
  async start(L, ctx) {
    const cp = ctx.checkpoint, order = ['start', 'f0', 'f1', 'f2', 'f3', 'roof'], k = Math.max(0, order.indexOf(cp));
    if (k >= 1) { for (const e of [...L.enemies]) if (e.tag === 'lobby') dropEnemy(L, e); this.up = true; }
    for (let i = 0; i < 4; i++) if (k >= i + 2) { for (const e of [...L.enemies]) if (e.tag === 'f' + i) dropEnemy(L, e); this.doors[i].unlock(); this.doors[i].open(); }
    if (k === 0) {
      const me = L.actor({ hero: true, pos: [0, 0, 30], yaw: Math.PI });
      await L.cutscene({
        shots: [
          { from: [6, 1.2, 36], to: [4, 1.6, 33], look: [0, 6, 12], lookTo: [0, 56, 0], fov: 50, fovTo: 40, dur: 5 },
          { from: [-3, 1.7, 22], to: [-2, 1.7, 20], look: me, fov: 42, dur: 3 },
        ],
        lines: [[0.6, 'ROURKE', 'Front door, Ash? You never could do subtle.', 3], [3.8, 'CALDER', 'Send them down. Save me the stairs.', 2.6], [6.2, 'PA', 'Lobby, he is at the doors. Weapons free.', 2.2]],
        beats: [[0.2, () => me.walkTo(0, 24)]],
        end: () => { L.dropActor(me); L.hero.pos.set(0, 0, 24); L.hero.yaw = Math.PI; L.G.input.yaw = Math.PI; },
      });
    }
    if (k <= 0) { L.objective('lobby', 'Clear the lobby'); await L.until(() => L.alive('lobby') === 0); L.done('lobby'); await this.elevator(L); }
    for (let i = Math.max(0, k - 1); i < 4; i++) {
      if (k <= i + 1) {
        L.objective('f' + i, `Floor ${NAMES[i]}: kill the security crew (${L.alive('f' + i)} left)`);
        L.every(() => { if (this.cur === i) L.objective('f' + i, `Floor ${NAMES[i]}: kill the security crew (${L.alive('f' + i)} left)`); });
        this.cur = i;
        if (i === 0) L.say('PA', 'Sixty-eight, he is on sixty-eight! Every floor, hold your stairwell.', 3);
        await L.until(() => L.alive('f' + i) === 0);
        this.cur = -1; L.done('f' + i);
        this.doors[i].unlock(); this.doors[i].open();
        L.objective('s' + i, i < 3 ? `Stairwell (${['north-east', 'north-west', 'south-west', 'south-east'][i]} corner): up to ${NAMES[i + 1]}` : 'The stairwell to the roof');
        const lines = [['ROURKE', 'Sixty-eight is gone? I paid for those men.'], ['ROURKE', 'You are bleeding on my carpets, Ash.'], ['ROURKE', 'Two more floors. Then it is just us.'], ['ROURKE', 'Come up. I want to see your face.']];
        L.say(...lines[i], 3);
        await L.until(() => L.hero.pos.y > (i < 3 ? FL[i + 1] : ROOF) - 0.2);
        L.done('s' + i);
      }
    }
    L.objective('boss', 'The helipad');
  },

  async elevator(L) {
    L.objective('elev', 'Take the express elevator (the core, south doors)');
    await L.until(() => Math.hypot(L.hero.pos.x, L.hero.pos.z - 3.8) < 1.6 && L.hero.pos.y < 1);
    L.done('elev');
    const me = L.actor({ hero: true, pos: [0, 0, 3.6], yaw: Math.PI });
    await L.cutscene({
      shots: [
        { from: [0, 1.6, 7.5], to: [0, 1.6, 6.5], look: me, fov: 40, dur: 2.4 },
        { from: [3, 39.6, 9], to: [2, 39.8, 8], look: [0, 39, 3.6], fov: 46, dur: 2.6 },
      ],
      lines: [[0.3, 'PA', 'Express two is moving. Sixty-eight. Sixty-eight!', 2.4], [2.6, 'CALDER', 'Ding.', 1]],
      beats: [[2.4, () => { me.place(0, FL[0], 3.6, 0); me.walkTo(0, 5.2); }]],
      end: () => { L.dropActor(me); L.hero.pos.set(0, FL[0], 5.2); L.hero.yaw = 0; L.G.input.yaw = 0; this.up = true; },
    });
    L.C.reachCheckpoint?.('f0');
  },

  // ---------------- the boss ----------------
  async bossIntro(L) {
    if (this.bossOn) return; this.bossOn = true;
    L.box((this.hatchHole[0] + this.hatchHole[2]) / 2, ROOF - 0.3, (this.hatchHole[1] + this.hatchHole[3]) / 2, SH * 2, 0.3, SH * 2, { mat: 'steel', flags: { noClimb: true } }); // the hatch slams shut
    const h = L.hero, rk = L.actor({ pos: [0, ROOF, -5], yaw: 0, weapon: 'katana', offhand: 'katana', shade: 0.3, outfit: 'boss', build: { bulk: 1.05, height: 1.02 } });
    this.heli.mode = 'hover';
    await L.cutscene({
      shots: [
        { from: [-6, ROOF + 1.4, 3], to: [-4, ROOF + 1.7, 1], look: rk, fov: 44, dur: 4.2 },
        { from: [3, ROOF + 1.6, -9], to: [2, ROOF + 1.5, -8.2], look: [h.pos.x, ROOF + 1.4, h.pos.z], fov: 40, dur: 3.6 },
        { from: [9, ROOF + 4, 0], to: [6, ROOF + 3, -2], look: [0, ROOF + 1.2, -2], fov: 52, dur: 4.4 },
      ],
      lines: [
        [0.4, 'ROURKE', 'Twenty years, Ash. Paper routes, bar fights, that summer at the lake.', 3.8],
        [4.4, 'CALDER', 'And then a price.', 1.8],
        [6.6, 'ROURKE', 'Eleven million. You would have done the same.', 2.8],
        [9.6, 'CALDER', 'No. That is the difference.', 2.2],
        [11.8, 'ROURKE', 'Then show me.', 1.4],
      ],
      beats: [[0.1, () => rk.pose('armsCrossed')], [7.4, () => rk.pose('guard')]],
      end: () => L.dropActor(rk),
    });
    this.heli.mode = 'circle';
    const e = L.enemy('thug_sword', 0, -5, { y: ROOF, wkind: 'katana', offhand: 'katana', hp: 600, speed: 5, mode: 'alert', tag: 'boss', outfit: 'boss', build: { bulk: 1.05, height: 1.02 } });
    const B = this.boss = makeBoss(L, e, {
      windDir: V(-1, 0, 0),
      onPhase: n => { if (n === 1) { L.say('ROURKE', 'Faster now, brother. Keep up.', 2.6); this.heli.mode = 'hover'; L.say('', 'Phase II: the rotor wash shoves you toward the open edge. Watch for the warning.', 4); } else { L.say('ROURKE', 'They would have taken you anyway! I just got paid!', 3); this.heli.mode = 'circle'; } },
      gust: s => { this.gust = s; if (s === 'warn') { L.G.banner?.('ROTOR WASH', 0.9); L.G.shake?.(0.15); } },
      onBeaten: () => this.beaten(L),
    });
    B.padY = ROOF;
    L.every(() => patchHero(L, B));
    L.objective('boss', 'Kill the boss');
    L.say('', 'He deflects strikes from the front. Parry his swings, dodge the glinting dash, hit him after his combos.', 5);
  },

  async beaten(L) {
    L.done('boss');
    L.say('ROURKE', 'Go on, then. Finish it.', 2.6);
    L.objective('fin', 'Double-click LMB on him: finish him');
    L.G.teach?.('reckoning', 'FINISH HIM', 'dbl');
    await L.until(() => this.boss.finished && !L.hero.fin);
    await L.wait(1.2);
    L.done('fin');
    const h = L.hero, me = L.actor({ hero: true, pos: [h.pos.x, ROOF, h.pos.z], yaw: h.yaw });
    this.heli.mode = 'leave';
    await L.cutscene({
      shots: [
        { from: [h.pos.x + 3, ROOF + 1.5, h.pos.z + 3], to: [h.pos.x + 2.4, ROOF + 1.7, h.pos.z + 2.2], look: me, fov: 40, dur: 4 },
        { from: [-20, ROOF + 8, 30], to: [-30, ROOF + 14, 44], look: [0, ROOF + 2, 0], fov: 50, dur: 6 },
      ],
      lines: [
        [0.5, 'CALDER', 'Twenty years.', 1.6],
        [2.6, 'CALDER', 'They will send more. Let them come to me.', 3],
        [6.0, 'PA', 'All units, Rourke Tower. Roof. Nobody goes up alone.', 3],
      ],
      beats: [[1.0, () => me.walkTo(h.pos.x + Math.sign(h.pos.x || 1) * 2, h.pos.z)]],
      end: () => L.dropActor(me),
    });
    L.end('credits');
  },
};
