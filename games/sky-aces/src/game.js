// The match: planes, guns, missiles, damage, kills, money, waves, missions, endless, online rules.
// The simulation is the same everywhere. `authority` is true offline and on an online host; a
// guest does not resolve damage or run AI - it flies its own plane and draws the host's world.
import * as THREE from '../vendor/three.module.js';
import { clamp, rand, pick } from './util.js';
import { Plane, Bullet, Missile, segSphere, safetyDir, BULLET_SPEED, resetIds } from './entities.js';
import { Brain, gunnerUpdate } from './ai.js';
import { makePlane, makeBomber, makeAirship, makeMissile, RAIDER, ACE, TEAM_COLORS } from './models.js';
import { statsFor, planeById, save, upOf, MISSIONS, endlessWave, REWARD } from './meta.js';
import { groundAt, heightAt, HARBOR, ARENA } from './world.js';
import * as A from './audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const RAIDER_NAMES = ['Grub', 'Slick', 'Mange', 'Rook', 'Tusk', 'Vex', 'Cinder', 'Moth', 'Brick', 'Snipe', 'Dregs', 'Scab', 'Hex', 'Jolt', 'Knave', 'Rust'];
const BOT_NAMES = ['Biggles', 'Dot', 'Wren', 'Ziggy', 'Pip', 'Maverick Jr', 'Loopy', 'Skye', 'Hops', 'Bramble', 'Duck', 'Nimbus'];
const STREAKS = { 3: 'ON A ROLL', 5: 'ACE!', 8: 'DOUBLE ACE', 12: 'UNSTOPPABLE', 16: 'LEGEND OF THE SKY' };

export class Game {
  constructor(scene, fx, world) {
    this.scene = scene; this.fx = fx; this.world = world;
    this.planes = []; this.bullets = []; this.missiles = [];
    for (let i = 0; i < 900; i++) this.bullets.push(new Bullet());
    this.bi = 0;
    this.missilePool = [];
    for (let i = 0; i < 40; i++) { const m = new Missile(); m.model = makeMissile(); m.model.visible = false; scene.add(m.model); this.missilePool.push(m); }
    this.listeners = [];
    this.t = 0; this.running = false; this.authority = true;
    this.aim = new THREE.Vector3(0, 0, -1);
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, d) { for (const f of this.listeners) f(type, d); }

  // ------------------------------------------------------------------ setup
  /** remove a model and free its geometry (materials are shared + cached, so they stay) */
  dropModel(m) {
    if (!m) return;
    this.scene.remove(m);
    m.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
  clear() {
    for (const p of this.planes) this.dropModel(p.model);
    this.planes = [];
    for (const b of this.bullets) b.alive = false;
    for (const m of this.missilePool) { m.alive = false; m.model.visible = false; }
    this.missiles = [];
  }

  /** cfg: { mode: 'mission'|'endless'|'online', mission: index, online: { teams, role, ... } } */
  start(cfg) {
    this.clear();
    resetIds(1);
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.t = 0; this.timeScale = 1; this.hitStop = 0;
    this.earned = 0; this.kills = 0; this.wave = 0; this.waveT = 0;
    this.result = null; this.running = true; this.phase = 'live';
    this.authority = !(cfg.online && cfg.online.role === 'guest');
    this.lastKillT = -9; this.multi = 0;
    this.msgQ = [];
    this.teams = !!(cfg.online && cfg.online.teams);
    this.defend = false; this.harborHits = 0;
    if (this.mode === 'online') return; // online.js spawns the planes
    // the player
    const p = this.spawnPlayer(save.sel, upOf(save.sel), 0, save.name || 'YOU');
    p.place(new THREE.Vector3(0, 480, 1500), new THREE.Vector3(0, -0.05, -1));
    this.player = p;
    this.aim.copy(p.fwd);
    if (this.mode === 'mission') {
      const M = MISSIONS[cfg.mission];
      this.mission = M;
      this.defend = !!M.defend;
      for (let i = 0; i < (M.allies || 0); i++) this.spawnAlly(i);
      this.nextWave();
    } else {
      this.mission = null;
      for (let i = 0; i < 1; i++) this.spawnAlly(i);
      this.nextWave();
    }
  }

  spawnPlayer(planeId, up, team, name, isPlayer = true) {
    const st = statsFor(planeId, up);
    const colors = this.teams ? TEAM_COLORS[team] : planeById(planeId).colors;
    const p = new Plane({ model: makePlane(planeId, colors, 0xe8433a, st.barrels), stats: st, team, name, isPlayer, human: true, planeId });
    this.scene.add(p.model);
    this.planes.push(p);
    return p;
  }

  spawnAlly(i) {
    const st = statsFor('kestrel', { dmg: 1, armor: 2 });
    st.hp = Math.round(st.hp * 1.2);
    const a = new Plane({ model: makePlane('kestrel', { body: 0x3b8fd9, wing: 0xe8eef5, trim: 0xffffff }, 0xffffff), stats: st, team: 0, name: pick(BOT_NAMES), skill: 0.55, planeId: 'kestrel' });
    a.brain = new Brain(a, this);
    a.brain.leader = this.player;
    a.brain.slot.set(i % 2 ? 50 : -50, 8, 40 + Math.floor(i / 2) * 40);
    a.place(this.player.pos.clone().add(new THREE.Vector3(i % 2 ? 50 : -50, 8, 50 + Math.floor(i / 2) * 40)), this.player.fwd);
    this.scene.add(a.model); this.planes.push(a);
    a.ally = true;
    return a;
  }

  spawnEnemy(def, k, n, where) {
    const sk = def.skill ?? 0.3;
    let p;
    const center = where || new THREE.Vector3(0, 0, -900);
    const ang = (k / Math.max(1, n)) * 1.2 - 0.6 + rand(-0.2, 0.2);
    const pos = new THREE.Vector3(center.x + Math.sin(ang) * 900, 380 + rand(0, 260), center.z - Math.cos(ang) * 900 - 300);
    if (def.type === 'fighter' || def.type === 'ace') {
      const ace = def.type === 'ace';
      const model = ace ? pick(['hornet', 'comet']) : (sk > 0.5 ? pick(['kestrel', 'hornet']) : pick(['kestrel', 'sparrow']));
      const st = statsFor(model, {});
      st.speed = (ace ? 125 : 98 + sk * 26) * (model === 'comet' ? 1.2 : 1);
      st.turn = (ace ? 1.85 : 1.45 + sk * 0.4);
      st.roll = 3.2 + sk;
      st.hp = Math.round(ace ? 320 : 60 + sk * 70);
      st.barrels = ace ? 4 : 2 + (sk > 0.5 ? 2 : 0);
      st.dmg = ace ? 3.4 : 2.4 + sk * 3.0;
      st.rof = ace ? 9 : 7 + sk * 4;
      st.missiles = ace ? 3 : sk > 0.45 ? 1 : 0;
      st.lock = 1.4 - sk * 0.5;
      p = new Plane({ model: makePlane(model, ace ? ACE : RAIDER, ace ? 0x111111 : 0x8c2f2f, st.barrels), stats: st, team: 1, name: def.name || pick(RAIDER_NAMES), skill: sk, cls: ace ? 'ace' : 'fighter', planeId: model });
      p.brain = new Brain(p, this);
    } else if (def.type === 'bomber') {
      const st = { speed: 56, turn: 0.55, roll: 0.9, hp: 380 + sk * 120, armor: 1, barrels: 0, dmg: 0, rof: 1, missiles: 0, radius: 15, boost: 1, lock: 9 };
      p = new Plane({ kind: 'bomber', model: makeBomber(), stats: st, team: 1, name: 'Bomber', skill: sk, cls: 'bomber' });
      p.brain = new Brain(p, this);
      p.brain.goal = HARBOR;
      // bombers come from far out and head for the harbour
      const a = rand(Math.PI * 0.9, Math.PI * 1.5) + k * 0.25;
      pos.set(HARBOR.x + Math.cos(a) * 3900, 330 + k * 25, HARBOR.z + Math.sin(a) * 3900);
      p.gunners = [{ local: new THREE.Vector3(0, 1.8, 3.5), world: new THREE.Vector3(), dir: new THREE.Vector3(), cd: rand(1), rof: 0.12, burst: 4, dmg: 3 + sk * 3 }];
    } else if (def.type === 'airship') {
      const big = !!def.big;
      const st = { speed: big ? 18 : 22, turn: 0.1, roll: 0.25, hp: big ? 2600 : 1500, armor: 1, barrels: 0, dmg: 0, rof: 1, missiles: 0, radius: big ? 66 : 50, boost: 1, lock: 9 };
      const model = makeAirship(big);
      p = new Plane({ kind: 'airship', model, stats: st, team: 1, name: big ? 'LEVIATHAN' : 'IRON WHALE', skill: sk, cls: 'airship' });
      p.brain = null;
      p.big = big;
      p.scale = big ? 1.35 : 1;
      pos.set(center.x + rand(-300, 300), 430, center.z - 500);
      p.turrets = model.userData.turrets.map((m) => ({ mesh: m, local: m.position.clone(), world: new THREE.Vector3(), dir: new THREE.Vector3(), hp: 110, alive: true, cd: rand(2), rof: 0.13, burst: 4, dmg: 2.2 + sk * 2 }));
      p.pods = model.userData.pods.map((m, i) => ({ prop: model.userData.props[i], mesh: m, local: m.position.clone(), world: new THREE.Vector3(), hp: 170, alive: true, pod: true }));
      p.spawnT = 18;
    }
    p.place(pos, _v.set(-pos.x * 0.3, 0, 1500 - pos.z).normalize());
    if (p.kind === 'bomber') p.place(pos, _v.set(HARBOR.x - pos.x, 0, HARBOR.z - pos.z).normalize());
    if (p.kind === 'airship') p.place(pos, _v.set(0, 0, 1));
    this.scene.add(p.model); this.planes.push(p);
    return p;
  }

  nextWave() {
    this.wave++;
    let groups;
    if (this.mode === 'mission') groups = this.mission.waves[this.wave - 1];
    else groups = endlessWave(this.wave);
    const center = new THREE.Vector3(this.player.pos.x * 0.3, 0, this.player.pos.z * 0.3 - 400);
    for (const gdef of groups) {
      let leader = null;
      for (let k = 0; k < gdef.n; k++) {
        const e = this.spawnEnemy(gdef, k, gdef.n, center);
        if (gdef.lead && e.brain && e.kind === 'fighter') {
          if (!leader) leader = e;
          else { e.brain.leader = leader; e.brain.slot.set(k % 2 ? 45 : -45, 5, 35 * Math.ceil(k / 2)); e.place(leader.pos.clone().add(_v.set(k % 2 ? 45 : -45, 5, 35 * Math.ceil(k / 2))), leader.fwd); }
        }
      }
    }
    const total = this.mode === 'mission' ? this.mission.waves.length : 0;
    this.emit('wave', { n: this.wave, total });
    A.sJingle('wave');
  }

  hostile(a, b) {
    if (a === b) return false;
    return a.team !== b.team;
  }

  // ------------------------------------------------------------------ weapons
  fireBullet(owner, pos, dir, speed, dmg, big, gunner, cosmetic) {
    const b = this.bullets[this.bi]; this.bi = (this.bi + 1) % this.bullets.length;
    b.alive = true; b.owner = owner; b.dmg = dmg; b.big = big; b.life = gunner ? 1.6 : 1.15; b.cosmetic = !!cosmetic || !this.authority;
    b.pos.copy(pos); b.prev.copy(pos);
    b.vel.copy(dir).multiplyScalar(speed);
    if (!gunner) b.vel.addScaledVector(owner.vel, 1);
    if (owner.isPlayer) b.col.setRGB(1, 0.78, 0.15);
    else if (this.mode === 'online' && this.teams) b.col.setRGB(owner.team ? 1 : 0.4, owner.team ? 0.45 : 0.75, owner.team ? 0.3 : 1);
    else b.col.setRGB(owner.team === 0 ? 0.55 : 1, owner.team === 0 ? 0.85 : 0.3, owner.team === 0 ? 1 : 0.18);
    return b;
  }

  fireGuns(p, dt, cosmetic) {
    p.firing = false;
    if (p.overheat > 0) { p.overheat -= dt; if (p.overheat <= 0) p.heat = 0.5; }
    else p.heat = Math.max(0, p.heat - dt * 0.32);
    p.gunT -= dt;
    if (!p.ctrl.fire || !p.alive || p.overheat > 0 || p.kind !== 'fighter') return;
    p.firing = true;
    if (p.gunT > 0) return;
    p.gunT += 1 / p.st.rof;
    if (p.gunT < -0.05) p.gunT = 0;
    p.heat += 1 / (p.st.rof * 5.2);
    if (p.heat >= 1) { p.heat = 1; p.overheat = 1.6; if (p.isPlayer) this.emit('overheat'); }
    if (!p.gunsCache || p.gunsCache.length !== p.st.barrels) p.gunsCache = p.model.userData.guns(p.st.barrels);
    const conv = _v3.copy(p.fwd).multiplyScalar(420).add(p.pos);
    for (let i = 0; i < p.gunsCache.length; i++) {
      const mp = _v.copy(p.gunsCache[i]).applyQuaternion(p.quat).add(p.pos);
      const dir = _v2.subVectors(conv, mp).normalize();
      const spread = p.isPlayer || p.human ? 0.006 : 0.017;
      dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
      this.fireBullet(p, mp, dir.normalize(), BULLET_SPEED, p.st.dmg, false, false, cosmetic);
      if (i < 2) this.fx.muzzle(mp, p.fwd, p.vel);
    }
    if (p.isPlayer) A.sGun(1);
    else if (this.player && p.pos.distanceToSquared(this.player.pos) < 500 * 500) A.sGun(0.4);
  }

  /** the best lock candidate in a cone around dir */
  lockCandidate(p, dir) {
    let best = null, bs = 0.22;
    for (const q of this.planes) {
      if (!q.alive || !this.hostile(p, q)) continue;
      const d = _v.subVectors(q.pos, p.pos);
      const dist = d.length();
      if (dist > 1500 || dist < 40) continue;
      const ang = Math.acos(clamp(d.divideScalar(dist).dot(dir), -1, 1));
      if (ang < bs) { bs = ang; best = q; }
    }
    return best;
  }
  updateLock(p, dt, dir) {
    const c = this.lockCandidate(p, dir || p.fwd);
    if (c && c === p.lockTarget) p.lockT += dt; else { p.lockTarget = c; p.lockT = 0; }
    p.locked = !!c && p.lockT >= p.st.lock;
  }
  fireMissile(p, targetOverride) {
    if (p.missiles <= 0 || p.missileCd > 0 || !p.alive) return null;
    const m = this.missilePool.find((q) => !q.alive);
    if (!m) return null;
    p.missiles--; p.missileCd = 0.45;
    m.alive = true; m.owner = p; m.target = targetOverride !== undefined ? targetOverride : (p.locked ? p.lockTarget : null);
    m.life = 7; m.speed = p.speed; m.dodged = false; m.id = (this.mid = (this.mid || 0) + 1);
    m.pos.copy(p.pos).addScaledVector(p.up(_v), -1.5); m.vel.copy(p.vel); m.quat.copy(p.quat);
    m.model.visible = true;
    this.missiles.push(m);
    if (p.isPlayer || (this.player && p.pos.distanceTo(this.player.pos) < 600)) A.sMissile();
    if (m.target && m.target.isPlayer) this.emit('incoming', m);
    return m;
  }

  // ------------------------------------------------------------------ damage + kills
  hitPlane(q, dmg, owner, at, part) {
    if (!this.authority) return;
    if (q.kind === 'airship') {
      if (part) {
        part.hp -= dmg;
        this.fx.spark(at, 3, 1);
        if (part.hp <= 0 && part.alive && part.pod) {
          // engine pod = weak point: big blast, a chunk of hull, the ship slows down
          part.alive = false; part.mesh.visible = false; if (part.prop) part.prop.visible = false;
          this.fx.explosion(part.world, 1.2); A.sBoom(1.2, this.distCam(part.world));
          this.fx.debrisBurst(part.world, q.vel, 0x3a3f48, 6, true);
          q.st.speed *= 0.7;
          this.reward(owner, REWARD.turret * 3, 'ENGINE POD');
          this.emit('note', 'ENGINE POD DESTROYED');
          const died = q.damage(q.maxHp * 0.15, owner, this);
          if (died) this.kill(q, owner, 'guns');
          if (owner && owner.isPlayer) this.emit('hit', { target: q, dmg });
          return;
        }
        if (part.hp <= 0 && part.alive) {
          part.alive = false; part.mesh.visible = false;
          this.fx.explosion(part.world, 0.6); A.sBoom(0.6, this.distCam(part.world));
          this.fx.debrisBurst(part.world, q.vel, 0x2b2e35, 4, true);
          this.reward(owner, REWARD.turret, 'TURRET');
          this.emit('turret', { by: owner });
        }
        if (owner && owner.isPlayer) this.emit('hit', { target: q, dmg });
        return;
      }
      dmg *= q.turrets.some((u) => u.alive) ? 0.35 : 1;
    }
    if (q.isPlayer && this.mode !== 'online') dmg *= 0.55; // arcade: the hero is tougher than the raiders
    const died = q.damage(dmg, owner, this);
    if (Math.random() < 0.3) this.fx.spark(at, 4, q.kind === 'fighter' ? 0.6 : 1);
    if (Math.random() < (q.kind === 'fighter' ? 0.12 : 0.05)) this.fx.debrisBurst(at, q.vel, q.model.children[0] && q.model.children[0].material ? q.model.children[0].material.color.getHex() : 0x777777, 1);
    if (owner && owner.isPlayer) this.emit('hit', { target: q, dmg });
    else if (owner && owner.human) this.emit('relayhit', { by: owner, target: q, dmg });
    if (q.isPlayer) { this.emit('hurt', { by: owner, dmg }); A.sHurt(); }
    if (died) this.kill(q, owner, 'guns');
  }

  kill(v, by, how) {
    if (!v.alive) return;
    v.alive = false; v.dying = true; v.dyingT = 0;
    v.deaths++; v.streak = 0;
    if (!by && v.lastAttacker && this.t - v.lastHitT < 6) by = v.lastAttacker;
    if (by && by !== v) { by.kills++; by.score += v.kind === 'airship' ? 5 : v.kind === 'bomber' ? 2 : 1; by.streak++; }
    if (how === 'missile' || how === 'crash' || v.kind === 'airship' && false) this.finalBoom(v);
    else {
      // burning spiral first, wreck explodes on impact
      this.fx.explosion(v.pos, v.kind === 'fighter' ? 0.85 : 1.3, v.vel);
      A.sBoom(0.6, this.distCam(v.pos));
      this.fx.debrisBurst(v.pos, v.vel, 0x666666, v.kind === 'fighter' ? 5 : 10, true);
    }
    const ev = { victim: v, by, how };
    this.emit('kill', ev);
    if (by && by.isPlayer) {
      const val = REWARD[v.cls] || REWARD.fighter;
      this.kills++;
      this.reward(by, this.mode === 'online' ? REWARD.player : val, v.name);
      const chain = this.t - this.lastKillT < 4 ? ++this.multi : (this.multi = 1);
      this.lastKillT = this.t;
      if (chain >= 2) this.emit('streak', { text: chain === 2 ? 'DOUBLE KILL' : chain === 3 ? 'TRIPLE KILL' : 'MULTI KILL x' + chain, bonus: chain * 40 });
      if (chain >= 2) this.reward(by, chain * 40);
      if (STREAKS[by.streak]) { this.emit('streak', { text: STREAKS[by.streak], bonus: by.streak * 25 }); this.reward(by, by.streak * 25); A.sJingle('streak'); }
      else A.sJingle('kill');
      this.hitStop = 0.08;
    }
  }
  reward(p, n, label) {
    if (!p || !p.isPlayer || !n) return;
    this.earned += n;
    this.emit('money', { n, label });
  }

  finalBoom(v) {
    v.gone = true; v.dying = false;
    const size = v.kind === 'airship' ? 3 : v.kind === 'bomber' ? 1.6 : 1;
    this.fx.explosion(v.pos, size, v.vel);
    if (v.pos.y < 12) this.fx.splash(v.pos, size);
    this.fx.debrisBurst(v.pos, v.vel, 0x555555, v.kind === 'fighter' ? 6 : 14, true);
    A.sBoom(size, this.distCam(v.pos));
    this.emit('boom', { pos: v.pos.clone(), size });
    if (v.model) v.model.visible = false;
  }
  distCam(p) { return this.camPos ? this.camPos.distanceTo(p) : 0; }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!this.running) return;
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.12; }
    this.t += dt;
    const t = this.t;
    // brains (authority only - a guest's world is puppets)
    for (const p of this.planes) {
      if (!p.alive) continue;
      if (p.brain && this.authority) p.brain.update(dt);
      if (p.kind === 'airship' && this.authority) this.airshipBrain(p, dt);
    }
    // flight
    for (const p of this.planes) {
      if (p.puppet) continue; // network-driven
      p.fly(dt);
      if (p.missileCd > 0) p.missileCd -= dt;
    }
    // weapons
    for (const p of this.planes) {
      if (!p.alive) continue;
      if (p.kind === 'fighter') {
        if (p.puppet) { if (p.netFiring) { p.ctrl.fire = true; this.fireGuns(p, dt, !this.authority); } else { p.firing = false; } continue; }
        this.fireGuns(p, dt);
        this.updateLock(p, dt, p.isPlayer ? this.aim : p.fwd);
        if (p.ctrl.missile && this.authority) {
          // a press during the re-arm delay is remembered for a moment instead of being lost
          if (!p.mslBuf) p.mslBuf = 0.8;
          p.mslBuf -= dt;
          if (this.fireMissile(p) || p.missiles <= 0 || p.mslBuf <= 0) { p.ctrl.missile = false; p.mslBuf = 0; }
        }
      }
      if (this.authority && (p.gunners || p.turrets)) {
        for (const gn of (p.gunners || p.turrets)) {
          if (gn.alive === false) continue;
          gn.world.copy(gn.local).applyQuaternion(p.quat).add(p.pos);
          if (_v.subVectors(this.player ? this.player.pos : gn.world, gn.world).lengthSq() < 4e6 || this.mode === 'online') gunnerUpdate(this, p, gn, dt, p.kind === 'airship' ? 620 : 480, p.skill * 0.8);
          if (gn.mesh && gn.dir.lengthSq() > 0) { const h = gn.mesh.userData.head; _q.copy(p.quat).multiply(gn.mesh.quaternion).invert(); _v2.copy(gn.dir).applyQuaternion(_q); h.rotation.y = Math.atan2(-_v2.x, -_v2.z); }
        }
      }
      if (p.turrets && !this.authority) for (const gn of p.turrets) gn.world.copy(gn.local).applyQuaternion(p.quat).add(p.pos);
      if (p.pods) for (const pd of p.pods) pd.world.copy(pd.local).applyQuaternion(p.quat).add(p.pos);
    }
    this.updateBullets(dt);
    this.updateMissiles(dt);
    // crashes + dying planes
    for (const p of this.planes) {
      if (p.gone) continue;
      if (p.alive) {
        const gh = groundAt(p.pos.x, p.pos.z);
        const lowest = p.kind === 'airship' ? 25 : p.kind === 'bomber' ? 4 : 1.2;
        if (p.pos.y < gh + lowest && this.authority && !p.puppet) {
          this.kill(p, null, 'crash');
        } else if (p.isPlayer && !this.authority && p.pos.y < gh + lowest) {
          this.emit('localcrash', p);
        }
        // fighters into an airship's hull
        if (p.kind === 'fighter' && this.authority) {
          for (const s of this.planes) {
            if (s.kind !== 'airship' || !s.alive) continue;
            if (this.airshipHull(s, p.lastPos, p.pos, p.radius * 0.4) >= 0) this.kill(p, s, 'crash');
          }
        }
      } else if (p.dying) {
        const gh = groundAt(p.pos.x, p.pos.z);
        if (p.pos.y < gh + 1 || p.dyingT > (p.kind === 'airship' ? 9 : 5)) this.finalBoom(p);
        if (p.kind === 'airship' && Math.random() < dt * 5) {
          const off = _v.set(rand(-40, 40), rand(-14, 14), rand(-40, 40)).applyQuaternion(p.quat).add(p.pos);
          this.fx.explosion(off, 0.8); A.sBoom(0.5, this.distCam(off));
        }
      }
      // damage smoke / fire
      const fx = this.fx;
      if (!p.gone && p.model && p.model.visible) {
        const hpR = p.hp / p.maxHp;
        const level = !p.alive ? 1 : hpR < 0.3 ? 0.8 : hpR < 0.6 ? 0.3 : 0;
        if (level > 0) {
          const e = _v.copy(p.model.userData.engine).applyQuaternion(p.quat).add(p.pos);
          fx.damageTrail(e, p.vel, level, dt);
          if (p.model.userData.engine2 && hpR < 0.45) { const e2 = _v.copy(p.model.userData.engine2).applyQuaternion(p.quat).add(p.pos); fx.damageTrail(e2, p.vel, level, dt); }
        }
        if (p.alive && p.kind === 'fighter') {
          if (p.boosting && Math.random() < 0.7) { const e = _v.copy(p.model.userData.engine).applyQuaternion(p.quat).add(p.pos); if (p.model.userData.jet) fx.boostFlame(e, p.fwd, p.vel, true); else fx.boostFlame(e.addScaledVector(p.fwd, -1.5), p.fwd, p.vel, false); }
          // wingtip vapour when pulling hard and fast
          if (Math.abs(p.rate.x) > 1.0 && p.speed > p.st.speed * 0.8) {
            const span = p.model.userData.size * 5;
            for (const s of [-1, 1]) { const w = _v.set(s * span, -0.4, 0.3).applyQuaternion(p.quat).add(p.pos); fx.contrail(w, p.vel, 0.28); }
          }
        }
      }
      p.syncModel(t, dt);
      if (p.alive && p.kind === 'fighter' && p.model.userData.pilot) this.pilotLook(p);
    }
    // remove gone non-respawning planes
    if (this.mode !== 'online') this.planes = this.planes.filter((p) => { if (p.gone && !p.isPlayer) { this.dropModel(p.model); return false; } return true; });
    // field repairs: out of the fight for 6 s, the hull slowly patches up (campaign + endless)
    const P = this.player;
    if (P && P.alive && this.mode !== 'online' && this.t - (P.lastHitT || 0) > 6 && P.hp < P.maxHp) { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.04 * dt); P.repairing = true; } else if (P) P.repairing = false;
    this.rules(dt);
  }

  pilotLook(p) {
    // the pilot's head turns toward the nearest hostile
    let best = null, bd = 900;
    for (const q of this.planes) { if (!q.alive || !this.hostile(p, q)) continue; const d = q.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = q; } }
    if (!best) { p.lookYaw = 0; p.lookPitch = 0; return; }
    _q.copy(p.quat).invert();
    const l = _v.subVectors(best.pos, p.pos).applyQuaternion(_q).normalize();
    p.lookYaw = clamp(Math.atan2(-l.x, -l.z), -1.7, 1.7);
    p.lookPitch = clamp(Math.asin(clamp(l.y, -1, 1)), -0.5, 0.8);
  }

  airshipBrain(p, dt) {
    // slow circle around the middle, nose gently into the turn
    const a = Math.atan2(p.pos.z, p.pos.x) + 0.35;
    const want = _v.set(Math.cos(a) * 900 - p.pos.x, (430 - p.pos.y) * 0.4, Math.sin(a) * 900 - p.pos.z).normalize();
    p.steer(want, 0.5);
    p.ctrl.roll = clamp(p.bank() * 2, -1, 1);
    p.spawnT -= dt;
    if (p.spawnT <= 0 && this.mode !== 'online') {
      p.spawnT = 28;
      const n = this.planes.filter((q) => q.alive && q.team === p.team && q.kind === 'fighter').length;
      if (n < 4) {
        for (let k = 0; k < 2; k++) {
          const e = this.spawnEnemy({ type: 'fighter', skill: p.skill }, k, 2);
          e.place(_v.set(k ? 30 : -30, -30, 0).applyQuaternion(p.quat).add(p.pos), p.fwd);
        }
        this.emit('note', p.name + ' LAUNCHED FIGHTERS');
      }
    }
  }

  /** capsule along the airship's long axis */
  airshipHull(s, a, b, extra = 0) {
    const sc = s.scale || 1;
    _q.copy(s.quat).invert();
    const la = _v.subVectors(a, s.pos).applyQuaternion(_q);
    const lb = _v2.subVectors(b, s.pos).applyQuaternion(_q);
    // closest approach of segment la-lb to the z axis segment [-44, 44]*sc
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = la.x + (lb.x - la.x) * t, y = la.y + (lb.y - la.y) * t, z = la.z + (lb.z - la.z) * t;
      const zz = z / sc;
      if (zz < -48 || zz > 48) continue;
      const rad = (zz < -30 ? 15.5 * (1 - (-30 - zz) / 20) : zz > 30 ? 15.5 * (1 - (zz - 30) / 20) : 15.5) * sc + extra;
      if (x * x + y * y < rad * rad || (y < -14 * sc && y > -20 * sc && Math.abs(x) < 4 * sc && Math.abs(zz + 2) < 13)) return t;
    }
    return -1;
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; continue; }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y < 0) { b.alive = false; if (Math.random() < 0.3) this.fx.smoke.emit(b.pos.x, 0.5, b.pos.z, 0, 8, 0, 0.6, 1, 3, new THREE.Color(0xeaf6ff), new THREE.Color(0xbcd), 0.7, 1, 12); continue; }
      for (const q of this.planes) {
        if (!q.alive || !this.hostile(b.owner, q)) continue;
        if (q.kind === 'airship') {
          for (const u of q.turrets) {
            if (!u.alive) continue;
            if (segSphere(b.prev, b.pos, u.world, 4.5 * (q.scale || 1)) >= 0) { b.alive = false; if (b.cosmetic) this.fx.spark(b.pos, 2, 0.6); else this.hitPlane(q, b.dmg, b.owner, b.pos, u); break; }
          }
          if (!b.alive) break;
          for (const u of q.pods) {
            if (!u.alive) continue;
            if (segSphere(b.prev, b.pos, u.world, 3.2 * (q.scale || 1)) >= 0) { b.alive = false; if (b.cosmetic) this.fx.spark(b.pos, 2, 0.6); else this.hitPlane(q, b.dmg, b.owner, b.pos, u); break; }
          }
          if (!b.alive) break;
          if (_v.subVectors(b.pos, q.pos).lengthSq() > 90 * 90 * (q.scale || 1) * (q.scale || 1)) continue;
          if (this.airshipHull(q, b.prev, b.pos) >= 0) { b.alive = false; if (b.cosmetic) this.fx.spark(b.pos, 2, 0.8); else this.hitPlane(q, b.dmg, b.owner, b.pos); break; }
          continue;
        }
        const r = q.radius * (b.owner.isPlayer ? 1.25 : q.isPlayer && this.mode !== 'online' ? 0.85 : 1);
        if (segSphere(b.prev, b.pos, q.pos, r) >= 0) {
          b.alive = false;
          if (b.cosmetic) this.fx.spark(b.pos, 2, 0.5);
          else this.hitPlane(q, b.dmg, b.owner, b.pos);
          break;
        }
      }
    }
  }

  updateMissiles(dt) {
    for (const m of this.missiles) {
      if (!m.alive) continue;
      if (m.puppet) {
        // a guest draws the host's missiles: glide toward the network position, trail only
        const f = _v.set(0, 0, -1).applyQuaternion(m.quat);
        m.vel.copy(f).multiplyScalar(300);
        if (m.netPos) { m.pos.addScaledVector(m.vel, dt); m.pos.lerp(m.netPos, 1 - Math.exp(-10 * dt)); m.netPos.addScaledVector(m.vel, dt); }
        m.model.position.copy(m.pos); m.model.quaternion.copy(m.quat);
        this.fx.missileTrail(_v2.copy(f).multiplyScalar(1.4).add(m.pos), m.vel);
        continue;
      }
      m.life -= dt;
      m.speed = Math.min(330, m.speed + 260 * dt);
      const fwd = _v.set(0, 0, -1).applyQuaternion(m.quat);
      const tg = m.target;
      if (tg && (!tg.alive)) m.target = null;
      if (m.target && this.authority) {
        // a barrel roll at the right moment shakes it
        const d = m.pos.distanceTo(tg.pos);
        if (!m.dodged && tg.rollT > 0 && d < 280) { m.dodged = true; if (Math.random() < 0.8) { m.target = null; this.emit('dodged', { target: tg }); } }
      }
      if (m.target) {
        const tof = m.pos.distanceTo(m.target.pos) / Math.max(150, m.speed);
        const aim = _v2.copy(m.target.pos).addScaledVector(m.target.vel, tof * 0.8).sub(m.pos).normalize();
        const ang = Math.acos(clamp(aim.dot(fwd), -1, 1));
        if (ang > 1.4) m.target = null; // overshot: it flies on dumb
        else {
          const maxTurn = 2.1 * dt;
          const k = Math.min(1, maxTurn / Math.max(1e-4, ang));
          _q.setFromUnitVectors(fwd, aim);
          const qq = new THREE.Quaternion().slerp(_q, k);
          m.quat.premultiply(qq).normalize();
        }
      }
      fwd.set(0, 0, -1).applyQuaternion(m.quat);
      m.vel.copy(fwd).multiplyScalar(m.speed);
      const prev = _v3.copy(m.pos);
      m.pos.addScaledVector(m.vel, dt);
      m.model.position.copy(m.pos); m.model.quaternion.copy(m.quat);
      this.fx.missileTrail(_v2.copy(fwd).multiplyScalar(1.4).add(m.pos), m.vel);
      if (m.target && m.target.isPlayer) this.emit('incoming', m);
      let boom = m.life <= 0 || m.pos.y < groundAt(m.pos.x, m.pos.z);
      let victim = null;
      if (!boom) {
        for (const q of this.planes) {
          if (!q.alive || !this.hostile(m.owner, q)) continue;
          if (q.kind === 'airship') { if (this.airshipHull(q, prev, m.pos, 2) >= 0) { boom = true; victim = q; break; } continue; }
          if (segSphere(prev, m.pos, q.pos, q.radius + 4) >= 0) { boom = true; victim = q; break; }
        }
      }
      if (boom) {
        m.alive = false; m.model.visible = false;
        this.fx.explosion(m.pos, 0.6, null); A.sBoom(0.7, this.distCam(m.pos));
        if (m.pos.y < 5) this.fx.splash(m.pos, 0.6);
        if (victim && this.authority) {
          const dmg = (victim.kind === 'airship' ? 190 : victim.kind === 'bomber' ? 170 : 88) * (victim.isPlayer && this.mode !== 'online' ? 0.6 : 1);
          const died = victim.kind === 'airship' ? (this.hitPlane(victim, dmg / (victim.turrets.some((u) => u.alive) ? 0.7 : 1), m.owner, m.pos), false) : victim.damage(dmg, m.owner, this);
          if (victim.kind !== 'airship') {
            if (m.owner && m.owner.isPlayer) this.emit('hit', { target: victim, dmg, missile: true });
            if (victim.isPlayer) { this.emit('hurt', { by: m.owner, dmg }); A.sHurt(); }
            if (died) this.kill(victim, m.owner, victim.kind === 'fighter' ? 'missile' : 'guns');
          }
        }
        this.emit('mboom', { id: m.id, pos: m.pos.clone() });
      }
    }
    this.missiles = this.missiles.filter((m) => m.alive);
  }

  // ------------------------------------------------------------------ win / lose
  rules(dt) {
    if (this.mode === 'online' || this.phase !== 'live') return;
    const P = this.player;
    if (!P.alive) {
      if (!this.loseT) this.loseT = 0;
      this.loseT += dt;
      if (this.loseT > 2.2) this.finish(false, P.deaths && P.lastAttacker ? 'Shot down by ' + P.lastAttacker.name : 'You crashed');
      return;
    }
    // defend: a bomber reaching the harbour
    if (this.defend) {
      for (const p of this.planes) {
        if (p.kind === 'bomber' && p.alive && p.brain && p.brain.distToGoal < 260) {
          this.fx.explosion(new THREE.Vector3(HARBOR.x, 10, HARBOR.z), 2.5);
          for (let i = 0; i < 6; i++) this.fx.explosion(new THREE.Vector3(HARBOR.x + rand(-120, 120), 8, HARBOR.z + rand(-120, 120)), 1.3);
          A.sBoom(2.5, 0);
          this.finish(false, 'The harbour was bombed');
          return;
        }
      }
    }
    const foes = this.planes.filter((p) => p.team !== 0 && (p.alive || p.dying));
    if (foes.length === 0) {
      this.waveT += dt;
      if (this.waveT > 2.2) {
        this.waveT = 0;
        if (this.mode === 'mission' && this.wave >= this.mission.waves.length) this.finish(true, 'Mission complete');
        else { if (this.mode === 'endless') this.emit('waveclear', { n: this.wave }); this.nextWave(); }
      }
    }
  }
  finish(win, why) {
    if (this.phase !== 'live') return;
    this.phase = 'over';
    const P = this.player;
    let bonus = 0, stars = 0;
    if (this.mode === 'mission' && win) {
      bonus = this.mission.reward;
      const hpR = P.hp / P.maxHp;
      stars = 1 + (hpR > 0.5 ? 1 : 0) + (this.t < 60 * (this.mission.waves.length + 1) ? 1 : 0);
    }
    this.result = { win, why, earned: this.earned, bonus, stars, kills: this.kills, wave: this.wave, time: this.t, mode: this.mode, mission: this.cfg.mission };
    this.emit('end', this.result);
  }
}
