// A match: world + nav + soldiers + rules. Modes:
//   'battle'  - 8v8 conquest: 3 capture points, tickets, 8 minute rounds
//   'waves'   - solo skirmish: survive 10 waves of hunting squads
//   'watch'   - 8v8 with no player (AI vs AI), camera follows a bot
import * as THREE from '../vendor/three.module.js';
import { World } from './world.js';
import { Nav } from './nav.js';
import { getMap } from './maps.js';
import { FX } from './fx.js';
import { Soldier, RADIUS } from './actors.js';
import { Brain, Squad, DIFF, roleLoadout } from './ai.js';
import { damageAt, WEAPONS, GRENADES, statsFor } from './weapons.js';
import { buildGun, TEAM_LOOK, Merger, MAT } from './models.js';
import { rng, clamp, segDist3, yawTo, R } from './util.js';

const NAMES = ['Harlow', 'Brennan', 'Okafor', 'Vasquez', 'Lindqvist', 'Kowal', 'Mercer', 'Adeyemi', 'Sato', 'Ruiz', 'Fenn', 'Dupont', 'Novak', 'Hale', 'Ibarra', 'Quist', 'Rourke', 'Tamsin', 'Weller', 'Yates', 'Moreau', 'Achebe', 'Varga', 'Lund', 'Pryce', 'Castell', 'Oduya', 'Sorensen', 'Bishop', 'Kade'];
const ROLES8 = ['rifleman', 'support', 'medic', 'marksman', 'rifleman', 'flanker', 'medic', 'rifleman'];

export class Match {
  constructor(o) {
    this.o = o;
    this.mode = o.mode || 'battle';
    this.diffKey = o.difficulty || 'regular';
    this.diff = DIFF[this.diffKey];
    this.renderer = o.renderer; this.audio = o.audio; this.hud = o.hud;
    this.scene = o.renderer.scene;
    this.def = getMap(o.map || 'ashfall');
    this.world = new World(this.def);
    this.nav = new Nav(this.world);
    this.renderer.loadMap(this.def, this.world);
    this.fx = new FX(this.scene);
    this.fx.cam = this.renderer.camera;
    this.time = 0; this.phase = 'countdown'; this.phaseT = 3;
    this.soldiers = []; this.squads = [];
    this.grenades = []; this.rockets = []; this.pickups = [];
    this.sounds = []; this.soundClock = 0;
    this.timers = [];
    this.events = []; // for HUD: kills, captures, popups
    this.playerTeam = 0;
    this.thirdPerson = false;
    this.roundTime = this.mode === 'waves' ? 0 : (o.roundTime || 480);
    this.tickets = [o.tickets || 200, o.tickets || 200];
    this.bleedT = 0;
    this.reward = { credits: 0, xp: 0, kills: 0, heads: 0, caps: 0, revives: 0, log: [] };
    this.rnd = rng((o.seed || 7) * 7919);
    this.wave = 0; this.waveState = 'pre'; this.waveT = 6; this.lives = 3;
    this.fogVis = 1;
    this.stat = { downs: 0, finished: 0, bleed: 0, revived: 0, shots: 0, hits: 0, heads: 0 };
    this.setupPoints();
    this.setupTeams();
    this.audio.ambient(this.def.id);
    this.winner = null;
  }
  // ---------------------------------------------------------------- setup
  setupPoints() {
    this.points = [];
    if (this.mode === 'waves') return;
    for (const p of this.def.points) {
      const y = this.world.groundY(p.x, p.z);
      const pt = { ...p, y, owner: -1, prog: 0, contested: false, n: [0, 0] };
      if (p.id === 'A') { pt.owner = 0; pt.prog = 1; }
      if (p.id === 'C') { pt.owner = 1; pt.prog = -1; }
      // ring of posts + flag
      const g = new THREE.Group();
      const m = new Merger(3);
      const n = 80;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * p.r, z = p.z + Math.sin(a) * p.r;
        const fy = this.world.floorAt(x, z, 0.1, this.world.groundY(x, z) + 1.0);
        if (i % 2 === 0) m.addBox(x, fy + 0.03, z, 0.12, 0.04, (Math.PI * 2 * p.r / n) * 1.1, '#ffffff', { ry: -a, ao: 0, jit: 0 });
      }
      const ring = new THREE.Mesh(m.build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
      g.add(ring); pt.ring = ring;
      const fy = this.flagBase(pt);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(pt.fx, fy + 3.5, pt.fz); pole.castShadow = true; g.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.05), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }));
      flag.position.set(pt.fx + 0.8, fy + 6.2, pt.fz); g.add(flag); pt.flag = flag; pt.flagY0 = fy;
      // floating letter beacon (sprite)
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true, fog: false }));
      sp.scale.set(1.3, 1.3, 1); sp.position.set(p.x, y + 9, p.z); sp.renderOrder = 20; g.add(sp);
      pt.sprite = sp; pt.cv = cv; pt.lastDraw = '';
      this.scene.add(g); pt.group = g;
      this.points.push(pt);
    }
  }
  flagBase(pt) {
    // put the flag pole on walkable ground near the centre
    const i = this.nav.nearestWalkable(pt.x + 1.5, pt.z + 1.5, 6);
    pt.fx = i >= 0 ? this.nav.cx(i) : pt.x; pt.fz = i >= 0 ? this.nav.cz(i) : pt.z;
    return i >= 0 ? this.nav.h[i] : pt.y;
  }
  setupTeams() {
    const o = this.o;
    let ni = Math.floor(this.rnd() * NAMES.length);
    const name = () => NAMES[(ni++) % NAMES.length];
    const mkSquad = (team, k, label) => { const s = new Squad(this.squads.length, team, label); this.squads.push(s); return s; };
    const addBot = (team, role, squad, diff) => {
      const s = new Soldier(this, { team, role, name: name(), loadout: roleLoadout(role, this.rnd) });
      s.brain = new Brain(s, this, squad, diff);
      squad.members.push(s);
      this.soldiers.push(s);
      return s;
    };
    if (this.mode === 'waves') {
      this.player = new Soldier(this, { team: 0, role: 'rifleman', name: 'You', isPlayer: true, loadout: o.loadout });
      this.player.squad = mkSquad(0, 0, 'You');
      this.soldiers.push(this.player);
      this.player.spawn(0, 30, 0);
      return;
    }
    const watch = this.mode === 'watch';
    for (const team of [0, 1]) {
      const sqA = mkSquad(team, 0, team === 0 ? 'ALPHA' : 'HYDRA'), sqB = mkSquad(team, 1, team === 0 ? 'BRAVO' : 'JACKAL');
      // team difficulty: allies one notch kinder so they are competent but not carrying you
      const diff = this.diff;
      for (let i = 0; i < 8; i++) {
        if (team === 0 && i === 0 && !watch) continue; // player's slot
        addBot(team, ROLES8[i], i < 4 ? sqA : sqB, diff);
      }
      if (team === 0 && !watch) {
        this.player = new Soldier(this, { team: 0, role: 'rifleman', name: 'You', isPlayer: true, loadout: o.loadout });
        this.player.squad = sqA;
        sqA.members.push(this.player); // player is listed last so bots don't follow you blindly
        this.soldiers.push(this.player);
      }
    }
    // initial spawns at the bases
    for (const s of this.soldiers) this.spawnAtBase(s, true);
    this.commander(true);
    this.frontSpawn();
  }
  // first spawn: put the player at the front of the squad, facing its objective, so the opening
  // view is the battlefield and not the back of a teammate's head
  frontSpawn() {
    const p = this.player;
    if (!p || this.mode !== 'battle') return;
    const o = p.squad && p.squad.order && p.squad.order.point;
    if (!o) return;
    const sp = this.def.spawns[0];
    let cx = 0, cz = 0; for (const q of sp) { cx += q.x; cz += q.z; } cx /= sp.length; cz /= sp.length;
    const dx = o.x - cx, dz = o.z - cz, L = Math.hypot(dx, dz) || 1;
    const i = this.nav.nearestWalkable(cx + dx / L * 6, cz + dz / L * 6, 6);
    if (i < 0) return;
    const x = this.nav.cx(i), z = this.nav.cz(i);
    p.spawn(x, z, yawTo(o.x - x, o.z - z));
    p.pitch = -0.04;
  }
  spawnAtBase(s, initial = false) {
    const sp = this.def.spawns[s.team];
    const k = Math.floor(this.rnd() * sp.length);
    const p = sp[k];
    let x = p.x + (this.rnd() - 0.5) * 3, z = p.z + (this.rnd() - 0.5) * 3;
    const i = this.nav.nearestWalkable(x, z, 6);
    if (i >= 0) { x = this.nav.cx(i); z = this.nav.cz(i); }
    s.spawn(x, z, s.team === 0 ? 0 : Math.PI);
    if (initial && s.brain) s.brain.thinkT = this.rnd() * 0.5;
  }
  spawnAtPoint(s, pt) {
    // behind the point relative to the enemy base
    const eb = this.def.spawns[1 - s.team][0];
    const dx = pt.x - eb.x, dz = pt.z - eb.z, L = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 10; k++) {
      const x = pt.x + dx / L * (pt.r + 4) + (this.rnd() - 0.5) * 8, z = pt.z + dz / L * (pt.r + 4) + (this.rnd() - 0.5) * 8;
      const i = this.nav.nearestWalkable(x, z, 4);
      if (i >= 0) { s.spawn(this.nav.cx(i), this.nav.cz(i), yawTo(-dx, -dz)); return true; }
    }
    return false;
  }
  respawnOptions(team) {
    const out = [{ id: 'base', label: 'BASE' }];
    for (const p of this.points) if (p.owner === team && !p.contested) out.push({ id: p.id, label: p.id + ' ' + p.name, p });
    return out;
  }
  respawn(s, choice) {
    if (choice && choice !== 'base') {
      const p = this.points.find((q) => q.id === choice && q.owner === s.team && !q.contested);
      if (p && this.spawnAtPoint(s, p)) { this.afterSpawn(s); return; }
    }
    if (!choice && s.brain && this.mode === 'battle') {
      // bots: spawn on an owned point near their squad's objective if it is safe
      const o = s.brain.squad.order;
      const owned = this.points.filter((p) => p.owner === s.team && !p.contested);
      if (owned.length && o && o.point) {
        owned.sort((a, b) => Math.hypot(a.x - o.point.x, a.z - o.point.z) - Math.hypot(b.x - o.point.x, b.z - o.point.z));
        if (this.rnd() < 0.75 && this.spawnAtPoint(s, owned[0])) { this.afterSpawn(s); return; }
      }
    }
    this.spawnAtBase(s);
    this.afterSpawn(s);
  }
  afterSpawn(s) {
    s.respawnAt = null;
    if (s.isPlayer) { this.events.push({ type: 'spawn' }); }
  }
  // ---------------------------------------------------------------- commander
  commander(force = false) {
    if (this.mode === 'waves') { this.waveOrders(); return; }
    for (const team of [0, 1]) {
      const sqs = this.squads.filter((s) => s.team === team);
      const base = this.def.spawns[team][0], ebase = this.def.spawns[1 - team][0];
      const dist = (p) => Math.hypot(p.x - base.x, p.z - base.z);
      const notOwned = this.points.filter((p) => p.owner !== team).sort((a, b) => dist(a) - dist(b));
      const threatened = this.points.filter((p) => p.owner === team && (p.contested || p.n[1 - team] > 0 || p.prog * (team === 0 ? 1 : -1) < 0.99));
      const owned = this.points.filter((p) => p.owner === team).sort((a, b) => dist(b) - dist(a));
      sqs.forEach((sq, i) => {
        let order;
        // stalemate breaker: stuck on a contested point for 70 s -> hit another point for 60 s
        const cur = sq.order && sq.order.type === 'attack' ? sq.order.point : null;
        if (cur && cur.owner !== team) sq.stallT = (sq.stallT || 0) + (force ? 0 : 3); else sq.stallT = 0;
        if (sq.stallT > 70 && notOwned.length > 1) { sq.altUntil = this.time + 60; sq.altFrom = cur; sq.stallT = 0; const ld = sq.members.find((m2) => m2.brain && m2.alive && !m2.downed); if (ld) ld.brain.radio('Stuck here. Hit them somewhere else!', 'alt', 20); }
        const alt = sq.altUntil > this.time ? notOwned.filter((p) => p !== sq.altFrom) : null;
        if (alt && alt.length) order = { type: 'attack', point: alt[0] };
        else if (threatened.length && i === 1) order = { type: 'defend', point: threatened[0] };
        else if (notOwned.length) order = { type: 'attack', point: notOwned[Math.min(i, notOwned.length - 1)] };
        else if (owned.length) order = { type: 'defend', point: owned[Math.min(i, owned.length - 1)] };
        if (!order) return;
        const p = order.point;
        const L = Math.hypot(ebase.x - p.x, ebase.z - p.z) || 1;
        order.ax = (ebase.x - p.x) / L; order.az = (ebase.z - p.z) / L;
        order.x = p.x; order.z = p.z;
        if (order.type === 'attack' && sq.order && sq.order.point === order.point && sq.order.type === 'attack') {
          const was = sq.order.push;
          sq.order.push = (sq.stallT || 0) > 40;
          if (sq.order.push && !was) { const ld = sq.members.find((m2) => m2.brain && m2.alive && !m2.downed); if (ld) ld.brain.radio(`All in on ${order.point.id}, go go go!`, 'push', 20); }
        }
        const prev = sq.order;
        if (!prev || prev.point !== order.point || prev.type !== order.type) {
          if (prev && prev.point !== order.point) sq.stallT = 0;
          sq.order = order;
          const ld = sq.members.find((m) => m.brain && m.alive && !m.downed);
          if (ld && !force) ld.brain.radio(order.type === 'defend' ? `Hold ${p.id}, ${p.name.toLowerCase()}!` : `Push on ${p.id}!`, 'order', 8);
        }
      });
    }
  }
  // ---------------------------------------------------------------- waves mode
  waveOrders() {
    const P = this.player;
    for (const sq of this.squads) {
      if (sq.team !== 1) continue;
      // hunters know roughly where you are; the circle tightens the longer the wave lasts
      const t = this.time - (this.waveStart || 0);
      const noise = Math.max(10, 45 - t * 0.45);
      if (!sq.order || this.time > (sq.orderT || 0)) {
        sq.order = { type: 'hunt', x: P.pos.x + (this.rnd() - 0.5) * noise * 2, z: P.pos.z + (this.rnd() - 0.5) * noise * 2, ax: 0, az: 0 };
        sq.orderT = this.time + 6;
      }
    }
  }
  startWave() {
    this.wave++;
    this.waveState = 'live';
    this.waveStart = this.time;
    // clear old hunters
    for (const s of this.soldiers.filter((q) => q.team === 1)) { s.dispose(); }
    this.soldiers = this.soldiers.filter((q) => q.team !== 1);
    this.squads = this.squads.filter((q) => q.team !== 1);
    const n = Math.min(14, 1 + Math.round(this.wave * 1.3));
    const diffKeys = ['recruit', 'regular', 'veteran', 'elite'];
    const base = diffKeys.indexOf(this.diffKey);
    const dk = diffKeys[Math.max(0, Math.min(3, base + (this.wave <= 3 ? -1 : this.wave <= 6 ? 0 : 1)))];
    // spawn far from the player, around the map edge
    const spots = [[0, -68], [-40, -60], [40, -60], [-50, 0], [50, 0], [0, 68], [-40, 60], [40, 60]];
    spots.sort((a, b) => Math.hypot(b[0] - this.player.pos.x, b[1] - this.player.pos.z) - Math.hypot(a[0] - this.player.pos.x, a[1] - this.player.pos.z));
    let ni = this.wave * 3;
    const roles = ['rifleman', 'flanker', 'support', 'rifleman', 'medic', 'marksman'];
    let sq = null;
    for (let i = 0; i < n; i++) {
      if (i % 4 === 0) { sq = new Squad(this.squads.length, 1, 'HUNTER-' + (i / 4 + 1)); this.squads.push(sq); }
      const role = roles[i % roles.length];
      const s = new Soldier(this, { team: 1, role, name: NAMES[(ni++) % NAMES.length], loadout: roleLoadout(role, this.rnd) });
      s.brain = new Brain(s, this, sq, DIFF[dk]);
      sq.members.push(s);
      this.soldiers.push(s);
      const sp = spots[Math.floor(i / 4) % 3];
      const idx = this.nav.nearestWalkable(sp[0] + (this.rnd() - 0.5) * 6, sp[1] + (this.rnd() - 0.5) * 6, 8);
      s.spawn(this.nav.cx(idx), this.nav.cz(idx), yawTo(this.player.pos.x - sp[0], this.player.pos.z - sp[1]));
      s.noRespawn = true;
    }
    this.waveOrders();
    this.events.push({ type: 'banner', text: 'WAVE ' + this.wave, sub: `${n} hostiles inbound · ${DIFF[dk].name}` });
    this.audio.capture(false);
  }
  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.time += dt;
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; if (this.time >= t.at) { this.timers.splice(i, 1); t.fn(); } }
    if (this.phase === 'countdown') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'live'; this.events.push({ type: 'banner', text: this.mode === 'waves' ? 'SURVIVE' : 'CAPTURE THE POINTS', sub: this.def.name }); }
    }
    const live = this.phase === 'live';
    // soldiers
    for (const s of this.soldiers) {
      if (s.alive && !s.downed && s.brain && live) s.brain.update(dt);
      else if (s.brain && s.alive && !s.downed && !live) { s.brain.perceive && (s.intent.mx = 0, s.intent.mz = 0); }
      if (!live && s.alive) { s.intent.mx = 0; s.intent.mz = 0; s.intent.fire = false; }
      s.update(dt);
      if (s.isPlayer && s.alive && !s.downed && !s.brain && this.time - s.lastHurt > 5 && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + dt * 14);
      if (!s.alive && s.respawnAt && this.time >= s.respawnAt && !s.isPlayer && !s.noRespawn && this.phase !== 'ended') this.respawn(s);
      // bots top up ammo at their base
      if (s.alive && s.brain) { const b = this.def.spawns[s.team][0]; if (Math.abs(s.pos.z - b.z) < 14) for (const sl of s.slots) if (sl && sl.s.mag) sl.reserve = Math.max(sl.reserve, sl.s.reserve); }
    }
    this.separate();
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    if (this.mode !== 'waves') this.updatePoints(dt);
    else this.updateWaves(dt);
    // commander + sounds pruning
    this.cmdT = (this.cmdT || 0) - dt;
    if (this.cmdT <= 0) { this.commander(); this.cmdT = 3; }
    while (this.sounds.length && this.sounds[0].time < this.time - 1) this.sounds.shift();
    // smoke clouds -> sight blockers
    this.world.smokes = this.fx.clouds;
    // round end
    if (this.phase === 'live' && this.mode !== 'waves') {
      if (this.roundTime > 0) this.roundTime -= dt;
      if (this.tickets[0] <= 0 || this.tickets[1] <= 0 || this.roundTime <= 0) {
        const w = this.tickets[0] === this.tickets[1] ? -1 : this.tickets[0] > this.tickets[1] ? 0 : 1;
        this.end(w);
      }
    }
    this.fx.update(dt);
  }
  end(winner) {
    if (this.phase === 'ended') return;
    this.phase = 'ended'; this.winner = winner;
    if (this.player) {
      const won = winner === this.playerTeam;
      if (this.mode === 'battle') this.award(won ? 600 : winner === -1 ? 350 : 250, won ? 'VICTORY' : 'MATCH BONUS', won ? 900 : 400);
      this.events.push({ type: 'end', winner });
    } else this.events.push({ type: 'end', winner });
  }
  updateWaves(dt) {
    if (this.phase !== 'live') return;
    const P = this.player;
    if (this.waveState === 'pre' || this.waveState === 'break') {
      this.waveT -= dt;
      if (this.waveT <= 0) this.startWave();
    } else if (this.waveState === 'live') {
      const left = this.soldiers.filter((s) => s.team === 1 && s.alive).length;
      this.enemiesLeft = left;
      if (left === 0) {
        this.award(150 + this.wave * 25, 'WAVE ' + this.wave + ' CLEARED', 200 + this.wave * 40);
        if (this.wave >= 10) { this.award(1000, 'ALL WAVES SURVIVED', 1500); this.end(0); return; }
        this.waveState = 'break'; this.waveT = 14;
        P.hp = P.maxHp;
        for (const sl of P.slots) if (sl) { sl.reserve = sl.s.reserve; }
        P.grenades = Math.max(P.grenades, GRENADES[P.grenadeType].count);
        // every third wave cleared gives a life back (max 3), so one bad wave is not the end
        const bonus = this.wave % 3 === 0 && this.lives < 3;
        if (bonus) this.lives++;
        this.events.push({ type: 'banner', text: 'WAVE ' + this.wave + ' CLEARED', sub: (bonus ? '+1 LIFE · ' : '') + 'Health and ammo restocked · next wave in 14 s' });
      }
    }
    if (!P.alive && this.phase === 'live') {
      if (this.lives <= 1) { this.lives = 0; this.end(1); }
      else if (!P.respawnAt) { this.lives--; P.respawnAt = this.time + 4; this.events.push({ type: 'banner', text: 'MAN DOWN', sub: `${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left · redeploying` }); }
      else if (this.time >= P.respawnAt) { this.respawnWaves(P); }
    }
  }
  // waves: respawn the player at the walkable spot farthest from living hunters
  respawnWaves(P) {
    let best = null, bd = -1;
    for (let k = 0; k < 40; k++) {
      const x = (this.rnd() - 0.5) * 90, z = (this.rnd() - 0.5) * 130;
      const i = this.nav.nearestWalkable(x, z, 4); if (i < 0) continue;
      let dmin = 999; for (const s of this.soldiers) if (s.team === 1 && s.alive) dmin = Math.min(dmin, Math.hypot(s.pos.x - this.nav.cx(i), s.pos.z - this.nav.cz(i)));
      if (dmin > bd) { bd = dmin; best = i; }
    }
    P.respawnAt = null;
    P.spawn(this.nav.cx(best), this.nav.cz(best), 0);
    this.afterSpawn(P);
  }
  separate() {
    const S = this.soldiers;
    for (let i = 0; i < S.length; i++) {
      const a = S[i]; if (!a.alive || a.downed) continue;
      for (let j = i + 1; j < S.length; j++) {
        const b = S[j]; if (!b.alive || b.downed) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
        if (d2 > 0.5 || d2 < 1e-6 || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const d = Math.sqrt(d2), push = (0.72 - d) * 0.5;
        if (push <= 0) continue;
        const ka = a.isPlayer ? 0.3 : 1, kb = b.isPlayer ? 0.3 : 1;
        a.pos.x -= dx / d * push * ka; a.pos.z -= dz / d * push * ka;
        b.pos.x += dx / d * push * kb; b.pos.z += dz / d * push * kb;
      }
    }
  }
  updatePoints(dt) {
    if (this.phase !== 'live') { for (const p of this.points) this.drawPoint(p); return; }
    for (const p of this.points) {
      p.n[0] = 0; p.n[1] = 0;
      for (const s of this.soldiers) if (s.alive && !s.downed && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < p.r && Math.abs(s.pos.y - p.y) < 5) p.n[s.team]++;
      p.contested = p.n[0] > 0 && p.n[1] > 0;
      const prev = p.prog, prevOwner = p.owner;
      if (!p.contested && (p.n[0] || p.n[1])) {
        const team = p.n[0] ? 0 : 1, n = p.n[team];
        const rate = 0.11 * (1 + 0.35 * (Math.min(4, n) - 1));
        p.prog = clamp(p.prog + (team === 0 ? 1 : -1) * rate * dt, -1, 1);
        if (p.prog >= 1 && p.owner !== 0) this.capture(p, 0);
        if (p.prog <= -1 && p.owner !== 1) this.capture(p, 1);
        if (p.owner === 0 && p.prog < 0 && prev >= 0) this.neutralize(p, prevOwner);
        if (p.owner === 1 && p.prog > 0 && prev <= 0) this.neutralize(p, prevOwner);
      }
      this.drawPoint(p);
    }
    // ticket bleed by majority
    const own = [0, 0];
    for (const p of this.points) if (p.owner >= 0) own[p.owner]++;
    if (own[0] !== own[1]) {
      const loser = own[0] > own[1] ? 1 : 0, diff = Math.abs(own[0] - own[1]);
      this.bleedT += dt * diff;
      if (this.bleedT >= 3) { this.bleedT = 0; this.tickets[loser] = Math.max(0, this.tickets[loser] - 1); }
    }
  }
  capture(p, team) {
    p.owner = team;
    this.events.push({ type: 'capture', point: p, team });
    this.audio.capture(team === this.playerTeam);
    for (const s of this.soldiers) if (s.alive && !s.downed && s.team === team && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < p.r) { s.caps++; if (s.isPlayer) { this.reward.caps++; this.award(150, 'CAPTURED ' + p.id, 200); } }
    const sp = this.soldiers.find((s) => s.team === team && s.brain && s.alive && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < p.r + 5);
    if (sp) sp.brain.radio(`${p.id} is ours!`, 'cap' + p.id, 5);
    this.commander();
  }
  neutralize(p, prevOwner) {
    p.owner = -1;
    this.events.push({ type: 'neutral', point: p, prev: prevOwner });
    const sp = this.soldiers.find((s) => s.team === prevOwner && s.brain && s.alive);
    if (sp) sp.brain.radio(`We're losing ${p.id}!`, 'lose' + p.id, 8);
    this.commander();
  }
  drawPoint(p) {
    const col = p.owner === 0 ? TEAM_LOOK[0].css : p.owner === 1 ? TEAM_LOOK[1].css : '#e8e8e8';
    const pr = Math.abs(p.prog), side = p.prog >= 0 ? 0 : 1;
    const key = col + pr.toFixed(2) + p.contested;
    p.ring.material.color.set(p.contested ? '#ffd040' : col);
    p.flag.material.color.set(col);
    p.flag.position.y = p.flagY0 + 1.0 + 5.2 * (p.owner >= 0 ? 1 : pr);
    if (key === p.lastDraw) return;
    p.lastDraw = key;
    const c = p.cv.getContext('2d');
    c.clearRect(0, 0, 64, 64);
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(32, 32, 26, 0, 7); c.stroke();
    c.strokeStyle = side === 0 ? TEAM_LOOK[0].css : TEAM_LOOK[1].css; c.beginPath(); c.arc(32, 32, 26, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(10,14,20,0.6)'; c.beginPath(); c.arc(32, 32, 22, 0, 7); c.fill();
    c.fillStyle = col; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(p.id, 32, 34);
    p.sprite.material.map.needsUpdate = true;
  }
  // ---------------------------------------------------------------- combat
  muzzleOf(s, out) {
    if (s.isPlayer && this.viewMuzzle && !this.thirdPerson) return out.copy(this.viewMuzzle());
    if (s.gun && s.gun.userData.muzzle) { s.root.updateMatrixWorld(true); return s.gun.userData.muzzle.getWorldPosition(out); }
    return s.eye(out);
  }
  rayHitSoldier(o, origin, dir, maxT) {
    // head sphere
    const h = o.head(this._hv || (this._hv = new THREE.Vector3()));
    let best = null;
    const hr = 0.19;
    const lx = origin.x - h.x, ly = origin.y - h.y, lz = origin.z - h.z;
    const b = lx * dir.x + ly * dir.y + lz * dir.z, c = lx * lx + ly * ly + lz * lz - hr * hr, disc = b * b - c;
    if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) best = { t, head: true }; }
    // body: vertical cylinder (horizontal blob if downed)
    if (o.downed) {
      const cc = o.chest(this._cc || (this._cc = new THREE.Vector3()));
      const r = 0.55, mx = origin.x - cc.x, my = origin.y - cc.y, mz = origin.z - cc.z;
      const bb = mx * dir.x + my * dir.y + mz * dir.z, c2 = mx * mx + my * my + mz * mz - r * r, d2 = bb * bb - c2;
      if (d2 >= 0) { const t = -bb - Math.sqrt(d2); if (t > 0 && t < (best ? best.t : maxT)) best = { t, head: false }; }
      return best;
    }
    const r = 0.33;
    const ox = origin.x - o.pos.x, oz = origin.z - o.pos.z;
    const A = dir.x * dir.x + dir.z * dir.z;
    if (A > 1e-8) {
      const B = 2 * (ox * dir.x + oz * dir.z), C = ox * ox + oz * oz - r * r, D = B * B - 4 * A * C;
      if (D >= 0) {
        const sq = Math.sqrt(D);
        for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
          if (t <= 0 || t >= (best ? best.t : maxT)) continue;
          const y = origin.y + dir.y * t;
          if (y >= o.pos.y && y <= o.pos.y + o.bodyTop()) { best = { t, head: false }; break; }
        }
      }
    }
    return best;
  }
  hitscan(shooter, origin, dir, s, first) {
    const W = this.world, maxR = 260;
    this.stat.shots++;
    const wr = W.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxR, false, this._wr || (this._wr = {}));
    let bestT = wr ? wr.t : maxR, hit = null;
    for (const o of this.soldiers) {
      if (o === shooter || !o.alive || o.team === shooter.team) continue;
      // cheap reject
      const ex = o.pos.x - origin.x, ez = o.pos.z - origin.z;
      const along = ex * dir.x + ez * dir.z;
      if (along < -1 || along > bestT + 1) continue;
      const r = this.rayHitSoldier(o, origin, dir, bestT);
      if (r && r.t < bestT) { bestT = r.t; hit = { o, head: r.head }; }
    }
    const end = new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    if (hit) {
      const dmg = damageAt(s, bestT) * (hit.head ? s.headMul : 1);
      this.stat.hits++; if (hit.head) this.stat.heads++;
      this.fx.blood(end.x, end.y, end.z, dir.x, dir.z);
      this.damage(hit.o, dmg, shooter, dir, hit.head, s.id, 'bullet');
    } else if (wr) {
      const mat = wr.box ? wr.box.mat : (this.def.id === 'dustline' ? 'sand' : 'dirt');
      if (wr.y < W.waterY && this.def.waterY !== undefined) this.fx.splash(end.x, W.waterY, end.z);
      else this.fx.impact(end.x, end.y, end.z, wr.nx, wr.ny, wr.nz, mat);
      if (this.player && end.distanceToSquared(this.player.pos) < 600) this.audio.impact(end.x, end.y, end.z, mat);
    }
    // tracer
    if (first && (!s.suppressed || shooter.isPlayer) && (s.mode !== 'auto' || (shooter.tracerN = (shooter.tracerN || 0) + 1) % 2 === 0 || shooter.isPlayer)) {
      const m = this.muzzleOf(shooter, this._mz || (this._mz = new THREE.Vector3()));
      this.fx.ownNext = shooter.isPlayer && !this.thirdPerson;
      this.fx.tracer(m.x, m.y, m.z, end.x, end.y, end.z, s.tracer || '#ffd27a', s.id === 'sniper' ? 1.8 : 1);
    }
    // suppression / near misses
    if (first || (s.pellets || 1) < 3 || Math.random() < 0.3) {
      for (const o of this.soldiers) {
        if (o.team === shooter.team || !o.alive || o.downed || (hit && hit.o === o)) continue;
        const h = o.head(this._sh || (this._sh = new THREE.Vector3()));
        const { d, t } = segDist3(h, origin, end);
        if (d < 3 && t > 0.05) {
          const amt = s.supp * (1 - d / 3) * (s.pellets ? 0.4 : 1);
          if (o.brain) o.brain.onNearMiss(shooter, amt);
          if (o.isPlayer) { this.audio.whiz(h.x + dir.x, h.y, h.z + dir.z); this.events.push({ type: 'suppressed', amt }); }
        }
      }
    }
    this.sound(shooter, s.suppressed ? 16 : s.id === 'sniper' ? 160 : s.id === 'shotgun' ? 90 : 110, 'shot');
  }
  damage(o, dmg, attacker, dir, head, weapon, kind) {
    if (!o.alive) return;
    if (this.phase === 'ended') return;
    // spawn protection
    if (this.time - o.spawnT < 1.5 && kind !== 'fall') return;
    if (o.downed) { this.stat.finished++; this.kill(o, attacker, weapon, head, false, dir); return; }
    if (o.isPlayer && this.o.godMode) dmg = 0;
    o.hp -= dmg;
    o.lastHurt = this.time;
    if (attacker) { o.damagers.set(attacker.id, { s: attacker, dmg: (o.damagers.get(attacker.id)?.dmg || 0) + dmg, t: this.time }); o.lastAttacker = attacker; o.lastWeapon = weapon; }
    if (o.brain) o.brain.onDamage(attacker, dmg);
    if (o.isPlayer && dmg > 0) { this.events.push({ type: 'hurt', dir: dir ? { x: dir.x, z: dir.z } : null, from: attacker ? { x: attacker.pos.x, z: attacker.pos.z } : null, dmg }); this.audio.hurt(); }
    if (attacker && attacker.isPlayer) { this.events.push({ type: 'hit', head, kill: o.hp <= 0 }); this.audio.hit(head); }
    if (o.hp <= 0) {
      const canDown = !head && kind !== 'explosion' && kind !== 'melee' && dmg < 85 && !(o.isPlayer && this.mode === 'waves');
      if (canDown) this.down(o, attacker, weapon, dir);
      else this.kill(o, attacker, weapon, head, false, dir, kind === 'explosion' ? 2.2 : 1);
    }
  }
  down(o, attacker, weapon, dir) {
    this.stat.downs++;
    o.downed = true; o.downT = 0; o.hp = 0; o.reviveProg = 0; o.reviver = null; o.intent.fire = false;
    o.reloadT = 0;
    this.creditKill(o, attacker, weapon, false, true);
    // a squadmate calls it
    const mate = this.soldiers.find((s) => s.team === o.team && s.brain && s.alive && !s.downed && s !== o && Math.hypot(s.pos.x - o.pos.x, s.pos.z - o.pos.z) < 40);
    if (mate) mate.brain.radio(o.isPlayer ? 'You\'re down! Medic!' : `${o.name} is down! Medic!`, 'down' + o.id, 6);
    if (o.isPlayer) this.events.push({ type: 'downed' });
    this.sound(o, 25, 'boom');
  }
  creditKill(o, attacker, weapon, head, downed) {
    if (o._credited) return;
    o._credited = true;
    o.killedBy = attacker; o.killedWith = weapon;
    this.events.push({ type: 'kill', killer: attacker, victim: o, weapon, head });
    if (attacker && attacker !== o && attacker.team !== o.team) {
      attacker.kills++; attacker.score += 100;
      if (attacker.isPlayer) { this.reward.kills++; if (head) this.reward.heads++; this.award(head ? 150 : 100, head ? 'HEADSHOT' : downed ? 'ENEMY DOWN' : 'KILL', head ? 160 : 100); this.audio.kill(); }
    }
    // assists
    for (const [, d] of o.damagers) {
      if (d.s === attacker || d.dmg < 25 || this.time - d.t > 12 || d.s.team === o.team) continue;
      d.s.assists++; d.s.score += 40;
      if (d.s.isPlayer) this.award(40, 'ASSIST', 40);
    }
  }
  kill(o, attacker, weapon, head, silent, dir, force = 1) {
    if (!o.alive) return;
    if (!o._credited) this.creditKill(o, attacker, weapon, head, false);
    o.alive = false; o.downed = false; o.deaths++;
    o.hp = 0;
    if (this.mode === 'battle' || this.mode === 'watch') this.tickets[o.team] = Math.max(0, this.tickets[o.team] - 1);
    const dv = dir ? dir : (attacker ? new THREE.Vector3(o.pos.x - attacker.pos.x, 0, o.pos.z - attacker.pos.z).normalize() : new THREE.Vector3(0, 0, 1));
    o.startDeath(dv, force);
    o.root.visible = true;
    if (o.brain && o.brain.cover) o.brain.claimCover(null);
    // drop the primary as a pickup
    const sl = o.slots[0];
    if (sl && (sl.mag + sl.reserve) > 0 && !o.isPlayer) this.dropPickup(o.pos, sl);
    o.respawnAt = this.mode === 'waves' ? (o.isPlayer ? null : this.time + 99999) : this.time + 6;
    o._credited = false;
    if (o.isPlayer) { o.deathTime = this.time; this.events.push({ type: 'died', killer: attacker, weapon }); }
  }
  reviveTick(rev, o, dt) {
    if (!o.downed || !o.alive) return;
    o.reviver = rev; o.reviverT = this.time;
    o.reviveProg = (o.reviveProg || 0) + dt / (rev.role === 'medic' ? 2.2 : 3.6);
    if (o.reviveProg >= 1) {
      this.stat.revived++;
      o.downed = false; o.hp = 45; o.reviveProg = 0; o.lastHurt = this.time; o.damagers.clear();
      o._credited = false;
      rev.revives++; rev.score += 75;
      if (rev.brain) rev.brain.radio(o.isPlayer ? 'You\'re good, get up!' : `${o.name}'s back up!`, 'rev' + o.id, 4);
      if (rev.isPlayer) { this.reward.revives++; this.award(75, 'REVIVE', 90); }
      if (o.isPlayer) this.events.push({ type: 'revived', by: rev });
      if (o.brain) o.brain.onSpawn();
    }
  }
  melee(s) {
    const f = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    this.audio.gun('knife', s.pos.x, s.pos.y, s.pos.z, { own: s.isPlayer });
    let best = null, bd = 2.3;
    for (const o of this.soldiers) {
      if (o.team === s.team || !o.alive) continue;
      const dx = o.pos.x - s.pos.x, dz = o.pos.z - s.pos.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(o.pos.y - s.pos.y) > 1.5) continue;
      if ((dx * f.x + dz * f.z) / (d || 1) < 0.6) continue;
      best = o; bd = d;
    }
    if (best) {
      const behind = Math.cos(best.yaw - s.yaw) > 0.5;
      this.damage(best, behind ? 200 : 55, s, new THREE.Vector3(f.x, 0, f.z), false, 'knife', 'melee');
    }
  }
  // ---------------------------------------------------------------- grenades & rockets
  throwGrenade(s, type) {
    const eye = s.eye(new THREE.Vector3());
    let vel;
    if (s.throwVel) {
      vel = new THREE.Vector3(s.throwVel.x, s.throwVel.y, s.throwVel.z);
      s.throwVel = null; s.throwTarget = null;
    } else if (s.throwTarget) {
      const t = s.throwTarget; s.throwTarget = null;
      const dx = t.x - eye.x, dz = t.z - eye.z, d = Math.hypot(dx, dz), h = (t.y + 0.3) - eye.y;
      const th = 38 * Math.PI / 180, g = 20;
      const denom = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h);
      const v = denom > 0 ? Math.min(24, Math.sqrt(g * d * d / denom)) : 18;
      vel = new THREE.Vector3(dx / d * Math.cos(th) * v, Math.sin(th) * v, dz / d * Math.cos(th) * v);
    } else {
      const cp = Math.cos(s.pitch + 0.15);
      vel = new THREE.Vector3(-Math.sin(s.yaw) * cp, Math.sin(s.pitch + 0.15), -Math.cos(s.yaw) * cp).multiplyScalar(17).add(s.vel);
    }
    const mesh = new THREE.Mesh(this._gGeo || (this._gGeo = new THREE.IcosahedronGeometry(0.09, 0)), new THREE.MeshLambertMaterial({ color: type === 'smoke' ? 0x8a9aa0 : 0x3d4a2a, flatShading: true }));
    mesh.castShadow = true;
    this.scene.add(mesh);
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const pos = eye.clone().addScaledVector(right, -0.2);
    const g = { pos, vel, type, owner: s, fuse: GRENADES[type].fuse, mesh, team: s.team, bounces: 0 };
    this.grenades.push(g);
    if (s.isPlayer) this.audio.click(1500, 0.05, 0.25);
  }
  grenadeNear(pos, r, team) {
    for (const g of this.grenades) if (g.type === 'frag' && g.fuse < 2.2 && Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z) < r && Math.abs(g.pos.y - pos.y) < 3) return g;
    return null;
  }
  fireRocket(s, eye, dir, st) {
    const m = this.muzzleOf(s, new THREE.Vector3());
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x6a8040 }));
    body.rotation.x = Math.PI / 2; mesh.add(body);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    flame.rotation.x = -Math.PI / 2; flame.position.z = 0.4; mesh.add(flame);
    mesh.position.copy(m);
    mesh.lookAt(m.clone().sub(dir));
    this.scene.add(mesh);
    // aim from the eye so the rocket goes where the crosshair is
    this.rockets.push({ pos: eye.clone().addScaledVector(dir, 0.6), vel: dir.clone().multiplyScalar(st.proj.speed), owner: s, st, life: 4, mesh, trailT: 0 });
    this.sound(s, 120, 'shot');
  }
  updateProjectiles(dt) {
    const W = this.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        const h = dt / steps;
        g.vel.y -= 20 * h;
        const L = g.vel.length() * h;
        if (L > 1e-5) {
          const d = g.vel.clone().normalize();
          const hit = W.raycast(g.pos.x, g.pos.y, g.pos.z, d.x, d.y, d.z, L + 0.08, false, {});
          if (hit) {
            g.pos.set(hit.x + hit.nx * 0.09, hit.y + hit.ny * 0.09, hit.z + hit.nz * 0.09);
            const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
            g.vel.reflect(n).multiplyScalar(0.38);
            if (n.y > 0.6 && Math.abs(g.vel.y) < 1.5) { g.vel.y = 0; g.vel.x *= 0.7; g.vel.z *= 0.7; }
            if (g.vel.length() > 2 && g.bounces++ < 6) this.audio.bounce(g.pos.x, g.pos.y, g.pos.z);
          } else g.pos.addScaledVector(g.vel, h);
        }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * g.vel.length() * 2;
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        if (g.type === 'frag') this.explode(g.pos, GRENADES.frag.radius, GRENADES.frag.dmg, g.owner, 'frag');
        else { const c = this.fx.smokeCloud(g.pos.x, W.groundY(g.pos.x, g.pos.z), g.pos.z, GRENADES.smoke.radius, 15); c.r = GRENADES.smoke.radius; this.audio.hiss(g.pos.x, g.pos.y, g.pos.z); }
      }
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const L = r.vel.length() * dt;
      const d = r.vel.clone().normalize();
      let hitT = null;
      const wh = W.raycast(r.pos.x, r.pos.y, r.pos.z, d.x, d.y, d.z, L, false, {});
      if (wh) hitT = wh.t;
      for (const o of this.soldiers) {
        if (o === r.owner || !o.alive || o.team === r.owner.team) continue;
        const h = this.rayHitSoldier(o, r.pos, d, hitT ?? L);
        if (h) hitT = h.t;
      }
      if (hitT !== null || r.life <= 0) {
        const p = r.pos.clone().addScaledVector(d, hitT ?? 0);
        this.scene.remove(r.mesh); this.rockets.splice(i, 1);
        this.explode(p, r.st.proj.splash, r.st.dmg[0], r.owner, 'rocket');
        continue;
      }
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.trailT -= dt;
      if (r.trailT <= 0) { r.trailT = 0.025; this.fx.puff(r.pos.x, r.pos.y, r.pos.z, 0, 0.3, 0, 1.2, 0.15, 0.6, '#c8c4bc', 0.6); }
    }
  }
  explode(p, radius, dmg, owner, weapon) {
    const W = this.world;
    this.fx.explosion(p.x, p.y, p.z, radius / 7, W.groundY(p.x, p.z));
    this.audio.explosion(p.x, p.y, p.z);
    if (this.player) {
      const d = this.player.pos.distanceTo(p);
      this.fx.addShake(Math.max(0, 1.1 - d / 30));
    }
    this.sound(owner, 140, 'boom', p);
    for (const o of this.soldiers) {
      if (!o.alive) continue;
      const c = o.chest(new THREE.Vector3());
      const d = c.distanceTo(p);
      if (d < radius) {
        const los = W.clear(p.x, p.y + 0.3, p.z, c.x, c.y, c.z, false);
        let k = Math.pow(1 - d / radius, 1.1) * (los ? 1 : 0.3);
        if (o.team === (owner ? owner.team : -1) && o !== owner) k *= 0; // no friendly fire
        if (o === owner) k *= 0.6;
        if (k > 0.01) this.damage(o, dmg * k, owner, c.clone().sub(p).setY(0).normalize(), false, weapon, 'explosion');
      }
      if (d < radius * 2.2 && o.alive && !o.downed) {
        if (o.brain) o.brain.onNearMiss(owner || o, 0.8 * (1 - d / (radius * 2.2)));
      }
    }
  }
  // ---------------------------------------------------------------- pickups
  dropPickup(pos, sl) {
    if (this.pickups.length > 14) { const old = this.pickups.shift(); this.scene.remove(old.mesh); }
    const mesh = buildGun(sl.id, sl.att);
    mesh.scale.setScalar(1.3);
    const g = this.world.floorAt(pos.x, pos.z, 0.2, pos.y + 0.5);
    // small scatter, but never into a wall (the body may be lying against one)
    let ox = (Math.random() - 0.5), oz = (Math.random() - 0.5);
    const oL = Math.hypot(ox, oz) || 1;
    if (this.world.raycast(pos.x, g + 0.25, pos.z, ox / oL, 0, oz / oL, oL + 0.35, false, {})) { ox = 0; oz = 0; }
    mesh.position.set(pos.x + ox, g + 0.08, pos.z + oz);
    mesh.rotation.set(0, Math.random() * 6, Math.PI / 2);
    this.scene.add(mesh);
    // glow ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 12), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(mesh.position.x, g + 0.05, mesh.position.z);
    this.scene.add(ring);
    this.pickups.push({ id: sl.id, att: sl.att.slice(), mag: Math.max(sl.mag, Math.round(sl.s.mag * 0.5)), reserve: Math.max(sl.reserve, sl.s.mag), mesh, ring, t: this.time, x: mesh.position.x, z: mesh.position.z, y: g });
  }
  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.ring.material.opacity = 0.35 + Math.sin(this.time * 4) * 0.25;
      if (this.time - p.t > 45) { this.scene.remove(p.mesh); this.scene.remove(p.ring); this.pickups.splice(i, 1); }
    }
  }
  nearestPickup(s, r = 2.2) {
    let best = null, bd = r;
    for (const p of this.pickups) { const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z); if (d < bd && Math.abs(p.y - s.pos.y) < 2) { bd = d; best = p; } }
    return best;
  }
  // player presses E on a pickup: swap with the held weapon slot (or fill the pickup slot)
  takePickup(s, p) {
    const idx = this.pickups.indexOf(p);
    if (idx < 0) return;
    const same = s.slots.findIndex((sl) => sl && sl.id === p.id);
    if (same >= 0) { s.slots[same].reserve = Math.min(s.slots[same].s.reserve * 2, s.slots[same].reserve + p.mag + p.reserve); this.scene.remove(p.mesh); this.scene.remove(p.ring); this.pickups.splice(idx, 1); this.audio.swap(); this.events.push({ type: 'popup', text: '+AMMO ' + WEAPONS[p.id].short }); return; }
    const slotIdx = WEAPONS[p.id].slot === 'secondary' ? 1 : (s.cur === 0 || s.cur === 2 ? s.cur : 2);
    const old = s.slots[slotIdx];
    const st = statsFor(p.id, p.att);
    s.slots[slotIdx] = { id: p.id, att: p.att, s: st, mag: Math.min(st.mag, p.mag), reserve: p.reserve };
    this.scene.remove(p.mesh); this.scene.remove(p.ring); this.pickups.splice(idx, 1);
    if (old && old.id !== 'knife' && slotIdx !== 2) this.dropPickup(s.pos, old);
    s.cur = slotIdx; s.attachGun();
    this.audio.swap();
    this.onSwitch(s);
    this.events.push({ type: 'popup', text: 'PICKED UP ' + WEAPONS[p.id].name });
  }
  // ---------------------------------------------------------------- events from soldiers
  sound(src, r, kind, at) {
    const p = at || src.pos;
    this.sounds.push({ x: p.x, y: p.y, z: p.z, r, kind, src, t: ++this.soundClock, time: this.time });
  }
  footstep(s, loud) {
    const surface = s.inWater ? 'water' : this.def.id === 'dustline' ? 'sand' : 'dirt';
    if (s.isPlayer) this.audio.step(s.pos.x, s.pos.y, s.pos.z, surface, true, loud);
    else if (this.player && s.pos.distanceToSquared(this.player.pos) < 700) this.audio.step(s.pos.x, s.pos.y, s.pos.z, surface, false, loud);
    if (loud > 0.5) this.sound(s, loud > 1 ? 24 : 12, 'step');
    if (s.inWater && Math.random() < 0.5) this.fx.splash(s.pos.x, this.world.waterY, s.pos.z);
  }
  onShot(s, st, kv, kh) {
    const near = this.player ? s.pos.distanceTo(this.player.pos) : 0;
    this.audio.gun(st.snd, s.pos.x, s.pos.y + 1.4, s.pos.z, { own: s.isPlayer && !this.thirdPerson, suppressed: st.suppressed });
    if (!st.suppressed) { const m = this.muzzleOf(s, this._fm || (this._fm = new THREE.Vector3())); if (s.isPlayer || near < 60) this.fx.flashLight(m.x, m.y, m.z, s.isPlayer ? 4 : 3, 0.05); }
    if (s.isPlayer) this.events.push({ type: 'shot', kv, kh, st });
    else if (s.brain) { s.brain.aimPitch += kv * 0.8; s.brain.aimYaw += kh * 0.8; }
    // shell casing smoke puff at muzzle for heavy weapons
    if (st.id === 'shotgun' || st.id === 'sniper') { const m = this.muzzleOf(s, new THREE.Vector3()); this.fx.puff(m.x, m.y, m.z, 0, 0.5, 0, 0.8, 0.1, 0.5, '#bbbbbb', 0.4); }
  }
  onReload(s) {
    if (s.isPlayer) this.audio.reload(s.w.s.snd, s.w.s.reload);
    else if (s.brain && this.rnd() < 0.25) { const near = this.soldiers.some((o) => o.team !== s.team && o.alive && s.brain.mem.get(o.id)?.seen); if (near) s.brain.radio('Reloading!', 'reload' + s.id, 10); }
    this.sound(s, 6, 'step');
  }
  onSwitch(s) { if (s.isPlayer) this.events.push({ type: 'switch' }); }
  onLand(s, v) { if (v > 12) this.damage(s, (v - 12) * 6, null, null, false, 'fall', 'fall'); this.fx.addShake(0.15); }
  radio(speaker, text) {
    if (this.mode === 'watch' || speaker.team === this.playerTeam) {
      this.events.push({ type: 'radio', who: speaker, text });
      if (speaker.team === this.playerTeam && this.mode !== 'watch') this.audio.radio();
    }
    this.lastRadio = this.lastRadio || [];
    this.lastRadio.push({ who: speaker, text, t: this.time });
    if (this.lastRadio.length > 40) this.lastRadio.shift();
  }
  onCallout(who, enemy, pos) {
    if (who.team === this.playerTeam) this.events.push({ type: 'spot', pos, enemy, t: this.time });
    enemy.spottedT = this.time; enemy.spottedBy = who.team;
  }
  regionName(x, z) {
    let best = 'the open', bd = 1e9;
    for (const [n, rx, rz] of this.def.regions) { const d = Math.hypot(rx - x, rz - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  later(dt, fn) { this.timers.push({ at: this.time + dt, fn }); }
  award(credits, label, xp = credits) {
    this.reward.credits += credits; this.reward.xp += xp;
    this.reward.log.push([label, credits]);
    this.events.push({ type: 'popup', text: `+${credits} ${label}` });
  }
  dispose() {
    for (const s of this.soldiers) s.dispose();
    for (const p of this.points) this.scene.remove(p.group);
    for (const p of this.pickups) { this.scene.remove(p.mesh); this.scene.remove(p.ring); }
    for (const g of this.grenades) this.scene.remove(g.mesh);
    for (const r of this.rockets) this.scene.remove(r.mesh);
    // fx objects
    const kill = [];
    this.scene.traverse((o) => { if (o.userData && o.userData.fx) kill.push(o); });
    this.fxDispose();
    this.audio.stopAmbient();
  }
  fxDispose() {
    const f = this.fx;
    const rm = (o) => this.scene.remove(o);
    f.tracers.forEach((t) => rm(t.m)); f.decals.forEach(rm); f.scorch.forEach(rm); f.parts.forEach((c) => rm(c.pts));
    f.puffs.forEach((p) => rm(p.m)); f.fireballs.forEach((p) => rm(p.m)); f.lights.forEach((l) => rm(l.l)); f.debris.forEach((d) => rm(d.m));
  }
}
export { MAT, RADIUS, R };
