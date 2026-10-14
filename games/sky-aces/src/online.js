// ONLINE DOGFIGHTS - peer to peer, host-authoritative.
//   The host's browser runs the match: AI bots, bullets, missiles, damage, kills, respawns, score.
//   Each guest flies its own plane locally (no input lag) and sends its transform + trigger state
//   at 30 Hz; the host moves that plane as a puppet, fires its guns for real and resolves the hits.
//   The host sends a 20 Hz snapshot of every plane and missile plus reliable events (kills,
//   spawns, hit markers, match end). Bots fill empty slots up to 8 planes.
// Messages:
//   guest -> host  {k:'hello', name, planeId, up}  {k:'i', s:[x,y,z,qx,qy,qz,qw,speed,flags], m: targetId|null}  {k:'crash'}
//   host  -> guest {k:'lobby', players, cfg}  {k:'start', roster, cfg, you}  {k:'s', ...snapshot}  {k:'ev', e:[...]}
import * as THREE from '../vendor/three.module.js';
import { makeNet, NET_ERRORS, cleanCode } from './net.js';
import { Plane } from './entities.js';
import { Brain } from './ai.js';
import { makePlane, TEAM_COLORS } from './models.js';
import { statsFor, planeById, save, upOf } from './meta.js';
import { QS, pick, rand } from './util.js';

const MAX = 8;
const BOT_NAMES = ['Biggles', 'Dot', 'Wren', 'Ziggy', 'Pip', 'Loopy', 'Skye', 'Hops', 'Bramble', 'Nimbus', 'Puddle', 'Kite'];
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

export class Online {
  constructor(app) {
    this.app = app;
    this.state = 'idle'; this.role = null; this.code = ''; this.error = '';
    this.players = []; this.cfg = { teams: false, time: 240, goal: 10 };
    this.net = null; this.myId = -1; this.myConn = 0;
    this.sendT = 0; this.inT = 0;
    this.pending = [];
  }
  get inMatch() { return this.state === 'match'; }
  get netKind() { return QS.get('net') === 'loop' ? 'loop' : 'peer'; }

  me() { return { name: save.name || 'Pilot' + Math.floor(rand(100, 999)), planeId: save.sel, up: upOf(save.sel) }; }

  status(t) { this.statusText = t; this.app.ui && this.app.ui.onlineStatus && this.app.ui.onlineStatus(t); }

  // ---------------------------------------------------------------- lobby
  async host() {
    this.leave(true);
    this.error = '';
    this.role = 'host';
    this.net = makeNet(this.netKind, {
      onOpen: (id) => { /* wait for hello */ },
      onData: (id, d) => this.hostData(id, d),
      onLeave: (id) => this.guestLeft(id),
    });
    this.status('Opening a room...');
    try { this.code = await this.net.host(); } catch (e) { this.fail(e.message); return false; }
    const m = this.me();
    this.players = [{ conn: 0, name: m.name, planeId: m.planeId, up: m.up, team: 0 }];
    this.state = 'lobby';
    this.status('Room ' + this.code + ' is open. Share the code or the link.');
    this.app.ui.lobby();
    return true;
  }
  async join(code) {
    this.leave(true);
    this.error = '';
    this.role = 'guest';
    this.net = makeNet(this.netKind, {
      onData: (id, d) => this.guestData(d),
      onLost: (why) => this.lost(why),
    });
    this.status('Joining ' + cleanCode(code) + '...');
    try { await this.net.join(code); } catch (e) { this.fail(e.message); return false; }
    this.code = this.net.code;
    this.net.sendHost({ k: 'hello', ...this.me() });
    this.state = 'lobby';
    this.status('Joined room ' + this.code + '. Waiting for the host to start.');
    this.app.ui.lobby();
    return true;
  }
  fail(code) {
    this.error = NET_ERRORS[code] || NET_ERRORS.broker;
    this.status(this.error);
    try { this.net && this.net.close(); } catch (e) { /* */ }
    this.net = null; this.state = 'idle'; this.role = null;
    this.app.ui.onlineError && this.app.ui.onlineError(this.error);
  }
  lost(why) {
    this.error = NET_ERRORS[why] || NET_ERRORS.connection;
    const wasMatch = this.state === 'match';
    this.net = null; this.state = 'idle'; this.role = null;
    if (wasMatch) this.app.endOnline();
    this.app.ui.onlineError && this.app.ui.onlineError(this.error);
  }
  leave(silent) {
    if (this.net) { try { this.net.close(); } catch (e) { /* */ } }
    this.net = null; this.state = 'idle'; this.role = null; this.players = [];
    if (!silent) this.status('');
  }
  setTeams(on) {
    if (this.role !== 'host') return;
    this.cfg.teams = !!on;
    this.cfg.goal = on ? 20 : 10;
    // balance
    this.players.forEach((p, i) => { p.team = i % 2; });
    this.pushLobby();
  }
  pushLobby() {
    if (this.role !== 'host' || !this.net) return;
    this.net.broadcast({ k: 'lobby', players: this.players.map((p) => ({ name: p.name, planeId: p.planeId, team: p.team, conn: p.conn })), cfg: this.cfg });
    this.app.ui.lobby();
  }
  hostData(id, d) {
    if (!d) return;
    if (d.k === 'hello') {
      if (this.players.length >= MAX && !this.players.find((p) => p.conn === id)) { this.net.send(id, { k: 'full' }); this.net.drop(id); return; }
      const p = { conn: id, name: String(d.name || 'Pilot').slice(0, 14), planeId: planeById(d.planeId).id, up: d.up || {}, team: this.players.length % 2 };
      this.players.push(p);
      this.pushLobby();
      if (this.state === 'match') this.lateJoin(p);
      return;
    }
    if (this.state !== 'match') return;
    const pl = this.planeOfConn(id);
    if (!pl) return;
    if (d.k === 'i') {
      const s = d.s;
      pl.netPos.set(s[0], s[1], s[2]); pl.netQuat.set(s[3], s[4], s[5], s[6]); pl.netSpeed = s[7]; pl.netT = performance.now();
      pl.netFiring = !!(s[8] & 1); pl.boosting = !!(s[8] & 2); pl.rollT = s[8] & 4 ? 0.3 : 0;
      if (d.m !== undefined && d.m !== null && pl.alive) {
        const tg = d.m >= 0 ? this.app.game.planes.find((q) => q.id === d.m) : null;
        pl.missileCd = 0; this.app.game.fireMissile(pl, tg || null);
      }
    } else if (d.k === 'crash') {
      if (pl.alive) this.app.game.kill(pl, null, 'crash');
    }
  }
  guestLeft(id) {
    const i = this.players.findIndex((p) => p.conn === id);
    if (i < 0) return;
    const p = this.players[i];
    this.players.splice(i, 1);
    if (this.state === 'match') {
      const pl = this.planeOfConn(id);
      if (pl) { this.makeBot(pl); this.event({ type: 'note', text: p.name + ' left - a bot takes over' }); }
    }
    this.pushLobby();
  }
  planeOfConn(id) { return this.app.game.planes.find((q) => q.conn === id && q.human); }

  // ---------------------------------------------------------------- match (host)
  start() {
    if (this.role !== 'host') return;
    const G = this.app.game;
    this.app.startOnline({ role: 'host', teams: this.cfg.teams });
    const roster = [];
    const n = MAX;
    for (let i = 0; i < n; i++) {
      const pl = this.players[i];
      const team = this.cfg.teams ? (pl ? pl.team : (i % 2)) : 100 + i;
      let p;
      if (pl) p = this.addPlane({ id: i + 1, name: pl.name, planeId: pl.planeId, up: pl.up, team, human: true, conn: pl.conn });
      else {
        p = this.addPlane({ id: i + 1, name: BOT_NAMES[i % BOT_NAMES.length] + ' (bot)', planeId: pick(['sparrow', 'kestrel', 'kestrel', 'bulldog', 'hornet']), up: { dmg: 1, armor: 1 }, team, human: false, conn: -1 });
      }
      this.spawnAt(p, i);
    }
    // re-balance teams so bots fill the smaller side
    if (this.cfg.teams) {
      const cnt = [0, 0];
      for (const p of G.planes) if (p.human) cnt[p.team]++;
      for (const p of G.planes) if (!p.human) { const t = cnt[0] <= cnt[1] ? 0 : 1; p.team = t; cnt[t]++; this.recolor(p); }
    }
    for (const p of G.planes) roster.push(this.rosterEntry(p));
    this.state = 'match';
    this.matchT = this.cfg.time;
    for (const pl of this.players) if (pl.conn) this.net.send(pl.conn, { k: 'start', roster, cfg: this.cfg, you: G.planes.find((q) => q.conn === pl.conn).id });
    this.app.ui.hud();
  }
  rosterEntry(p) { return { id: p.id, name: p.name, planeId: p.planeId, up: p.upg, team: p.team, human: p.human, conn: p.conn }; }
  recolor(p) {
    if (!this.cfg.teams) return;
    const G = this.app.game;
    G.scene.remove(p.model);
    p.model = makePlane(p.planeId, TEAM_COLORS[p.team], p.team ? 0x222222 : 0xffffff, p.st.barrels);
    G.scene.add(p.model);
    p.gunsCache = null;
  }
  addPlane(r) {
    const G = this.app.game;
    const st = statsFor(r.planeId, r.up || {});
    const colors = this.cfg.teams ? TEAM_COLORS[r.team] : planeById(r.planeId).colors;
    const isMe = this.role === 'host' ? r.conn === 0 : r.id === this.myId;
    const p = new Plane({ id: r.id, model: makePlane(r.planeId, colors, this.cfg.teams ? (r.team ? 0x222222 : 0xffffff) : 0xe8433a, st.barrels), stats: st, team: r.team, name: r.name, isPlayer: isMe, human: r.human, skill: 0.5, planeId: r.planeId });
    p.upg = r.up || {}; p.conn = r.conn; p.human = r.human;
    p.netPos = new THREE.Vector3(); p.netQuat = new THREE.Quaternion(); p.netSpeed = 0; p.netT = 0; p.netFiring = false;
    if (this.role === 'host') {
      if (r.human && !isMe) p.puppet = true;
      if (!r.human) { p.brain = new Brain(p, G); p.skill = 0.45 + rand(0.2); }
    } else if (!isMe) p.puppet = true;
    G.scene.add(p.model); G.planes.push(p);
    if (isMe) { G.player = p; }
    return p;
  }
  spawnAt(p, i) {
    const a = (i ?? Math.floor(rand(8))) / 8 * Math.PI * 2 + rand(-0.2, 0.2);
    const R = this.cfg.teams ? 1500 : 1300;
    let pos, dir;
    if (this.cfg.teams) {
      const side = p.team ? 1 : -1;
      pos = new THREE.Vector3(rand(-400, 400), 450 + rand(0, 200), side * R);
      dir = new THREE.Vector3(0, 0, -side);
    } else {
      pos = new THREE.Vector3(Math.cos(a) * R, 420 + rand(0, 250), Math.sin(a) * R);
      dir = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
    }
    p.place(pos, dir);
    p.netPos.copy(p.pos); p.netQuat.copy(p.quat); p.netSpeed = p.speed; p.netT = performance.now();
    p.alive = true; p.dying = false; p.gone = false; p.hp = p.maxHp; p.missiles = p.st.missiles; p.heat = 0; p.overheat = 0; p.invuln = 2; p.boostE = 1;
    p.model.visible = true;
    if (p.isPlayer) this.app.game.aim.copy(p.fwd);
    return { id: p.id, x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), dx: r2(dir.x), dy: r2(dir.y), dz: r2(dir.z) };
  }
  makeBot(p) {
    p.human = false; p.puppet = false; p.conn = -1; p.name = p.name.replace(/ \(bot\)$/, '') + ' (bot)';
    p.brain = new Brain(p, this.app.game);
    if (p.alive) p.speed = Math.max(p.speed, p.st.speed * 0.8);
    this.event({ type: 'roster', r: this.rosterEntry(p) });
  }
  lateJoin(pl) {
    const G = this.app.game;
    // take over a bot (same team when playing teams)
    const bot = G.planes.find((q) => !q.human && (!this.cfg.teams || q.team === pl.team)) || G.planes.find((q) => !q.human);
    if (!bot) { this.net.send(pl.conn, { k: 'full' }); return; }
    const idx = G.planes.indexOf(bot);
    G.scene.remove(bot.model);
    G.planes.splice(idx, 1);
    const p = this.addPlane({ id: bot.id, name: pl.name, planeId: pl.planeId, up: pl.up, team: bot.team, human: true, conn: pl.conn });
    p.kills = bot.kills; p.deaths = bot.deaths;
    const sp = this.spawnAt(p);
    const roster = G.planes.map((q) => this.rosterEntry(q));
    this.net.send(pl.conn, { k: 'start', roster, cfg: this.cfg, you: p.id, spawn: sp });
    this.event({ type: 'roster', r: this.rosterEntry(p) });
    this.event({ type: 'note', text: pl.name + ' joined' });
  }
  event(e) { this.pending.push(e); }

  /** host: every kill / respawn / hit flows through here */
  hostEvent(type, d) {
    if (this.role !== 'host' || this.state !== 'match') return;
    if (type === 'kill') {
      this.event({ type: 'kill', v: d.victim.id, by: d.by ? d.by.id : -1, how: d.how });
      const v = d.victim;
      setTimeout(() => {
        if (this.state !== 'match' || !this.app.game.planes.includes(v)) return;
        const sp = this.spawnAt(v);
        this.event({ type: 'spawn', ...sp });
        if (v.isPlayer) this.app.ui.respawned && this.app.ui.respawned();
      }, 3500);
    } else if (type === 'hit') {
      // the host's own hits are emitted locally; relay hits by guests' planes is done in tickHost via hitLog
    } else if (type === 'boom') {
      // explosions are derived from kills on guests
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (this.state !== 'match' || !this.net) return;
    const G = this.app.game;
    // puppets glide toward the latest network transform (extrapolated by their speed)
    const now = performance.now();
    for (const p of G.planes) {
      if (!p.puppet) continue;
      const age = Math.min(0.25, (now - p.netT) / 1000);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.netQuat);
      const want = fwd.multiplyScalar(p.netSpeed * age).add(p.netPos);
      if (p.pos.distanceToSquared(want) > 200 * 200) p.pos.copy(want);
      p.lastPos.copy(p.pos);
      p.pos.lerp(want, 1 - Math.exp(-12 * dt));
      p.quat.slerp(p.netQuat, 1 - Math.exp(-14 * dt));
      p.fwd.set(0, 0, -1).applyQuaternion(p.quat);
      p.speed = p.netSpeed;
      p.vel.copy(p.fwd).multiplyScalar(p.speed);
    }
    if (this.role === 'host') this.tickHost(dt); else this.tickGuest(dt);
  }

  tickHost(dt) {
    const G = this.app.game;
    this.matchT -= dt;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.05;
      const snap = {
        k: 's', tl: Math.max(0, Math.round(this.matchT)),
        p: G.planes.map((p) => [p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r4(p.quat.x), r4(p.quat.y), r4(p.quat.z), r4(p.quat.w), r2(p.speed), Math.round(p.hp), (p.alive ? 1 : 0) | (p.firing ? 2 : 0) | (p.boosting ? 4 : 0) | (p.dying ? 8 : 0), p.kills, p.deaths, p.missiles]),
        m: G.missiles.filter((m) => m.alive).map((m) => [m.id, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r4(m.quat.x), r4(m.quat.y), r4(m.quat.z), r4(m.quat.w), m.target ? m.target.id : -1]),
      };
      if (this.pending.length) { this.net.broadcast({ k: 'ev', e: this.pending }); this.pending = []; }
      this.net.broadcast(snap);
    }
    // match end: time, or a pilot / team reaching the goal
    const best = this.standings();
    const top = best[0];
    let over = this.matchT <= 0;
    if (this.cfg.teams) { const tk = this.teamKills(); if (tk[0] >= this.cfg.goal || tk[1] >= this.cfg.goal) over = true; }
    else if (top && top.kills >= this.cfg.goal) over = true;
    if (over && G.phase === 'live') {
      G.phase = 'over';
      const res = { type: 'end', table: best.map((p) => [p.id, p.name, p.kills, p.deaths, p.team]), tk: this.teamKills(), teams: this.cfg.teams };
      this.event(res);
      this.net.broadcast({ k: 'ev', e: this.pending }); this.pending = [];
      this.app.onlineEnd(res);
    }
  }
  standings() { return this.app.game.planes.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths); }
  teamKills() { const t = [0, 0]; for (const p of this.app.game.planes) if (p.team === 0 || p.team === 1) t[p.team] += p.kills; return t; }

  backToLobby() {
    if (this.role !== 'host') return;
    this.state = 'lobby';
    this.net && this.net.broadcast({ k: 'tolobby' });
    this.app.endOnline(true);
    this.pushLobby();
  }

  // ---------------------------------------------------------------- guest
  guestData(d) {
    if (!d) return;
    const G = this.app.game;
    if (d.k === 'lobby') { this.players = d.players; this.cfg = d.cfg; if (this.state !== 'match') { this.state = 'lobby'; this.app.ui.lobby(); } return; }
    if (d.k === 'full') { this.fail('full'); return; }
    if (d.k === 'tolobby') { this.state = 'lobby'; this.app.endOnline(true); this.app.ui.lobby(); return; }
    if (d.k === 'start') {
      this.cfg = d.cfg; this.myId = d.you;
      this.app.startOnline({ role: 'guest', teams: this.cfg.teams });
      for (const r of d.roster) this.addPlane(r);
      // initial positions come with the first snapshot; place mine from the spawn message if any
      this.state = 'match';
      this.awaitFirst = true;
      if (d.spawn) this.applySpawn(d.spawn);
      this.app.ui.hud();
      return;
    }
    if (this.state !== 'match') return;
    if (d.k === 's') {
      this.timeLeft = d.tl;
      for (const s of d.p) {
        const p = G.planes.find((q) => q.id === s[0]);
        if (!p) continue;
        const alive = !!(s[10] & 1);
        p.kills = s[11]; p.deaths = s[12];
        if (p.isPlayer) {
          if (this.awaitFirst) { p.pos.set(s[1], s[2], s[3]); p.quat.set(s[4], s[5], s[6], s[7]); p.fwd.set(0, 0, -1).applyQuaternion(p.quat); p.speed = s[8]; G.aim.copy(p.fwd); this.awaitFirst = false; }
          if (s[9] < p.hp - 0.5 && p.alive) { G.emit('hurt', { dmg: p.hp - s[9] }); }
          p.hp = s[9];
          p.missiles = Math.min(p.missiles, s[13]);
          continue;
        }
        p.netPos.set(s[1], s[2], s[3]); p.netQuat.set(s[4], s[5], s[6], s[7]); p.netSpeed = s[8]; p.netT = performance.now();
        if (!p.seen) { p.pos.copy(p.netPos); p.quat.copy(p.netQuat); p.seen = true; }
        p.hp = s[9]; p.netFiring = !!(s[10] & 2); p.boosting = !!(s[10] & 4);
        if (alive && !p.alive && !p.dying) { p.alive = true; p.model.visible = true; p.gone = false; }
      }
      // missiles: puppets keyed by id
      const seen = new Set();
      for (const s of d.m) {
        seen.add(s[0]);
        let m = G.missiles.find((q) => q.id === s[0]);
        if (!m) {
          m = G.missilePool.find((q) => !q.alive);
          if (!m) continue;
          m.alive = true; m.id = s[0]; m.model.visible = true; m.life = 99; m.speed = 300; m.owner = null; m.puppet = true;
          m.pos.set(s[1], s[2], s[3]);
          G.missiles.push(m);
        }
        m.netPos = m.netPos || new THREE.Vector3(); m.netPos.set(s[1], s[2], s[3]);
        m.quat.set(s[4], s[5], s[6], s[7]);
        const tg = s[8] >= 0 ? G.planes.find((q) => q.id === s[8]) : null;
        m.target = tg;
        if (tg && tg.isPlayer) G.emit('incoming', m);
      }
      for (const m of G.missiles) if (m.puppet && !seen.has(m.id)) { m.alive = false; m.model.visible = false; m.puppet = false; G.fx.explosion(m.pos, 0.6, null); }
      G.missiles = G.missiles.filter((m) => m.alive);
      return;
    }
    if (d.k === 'ev') {
      for (const e of d.e) this.applyEvent(e);
    }
  }
  applySpawn(e) {
    const G = this.app.game;
    const p = G.planes.find((q) => q.id === e.id);
    if (!p) return;
    p.alive = true; p.dying = false; p.gone = false; p.hp = p.maxHp; p.model.visible = true;
    if (p.isPlayer) {
      p.place(new THREE.Vector3(e.x, e.y, e.z), new THREE.Vector3(e.dx, e.dy, e.dz));
      p.missiles = p.st.missiles; p.heat = 0; p.overheat = 0; p.boostE = 1; p.invuln = 2;
      G.aim.copy(p.fwd);
      this.awaitFirst = false;
      this.app.ui.respawned && this.app.ui.respawned();
    } else {
      p.netPos.set(e.x, e.y, e.z); p.pos.copy(p.netPos);
      p.place(p.netPos, new THREE.Vector3(e.dx, e.dy, e.dz)); p.netQuat.copy(p.quat);
    }
  }
  applyEvent(e) {
    const G = this.app.game;
    const P = (id) => G.planes.find((q) => q.id === id);
    if (e.type === 'kill') {
      const v = P(e.v), by = e.by >= 0 ? P(e.by) : null;
      if (v) { v.alive = true; G.authorityOverride = true; const a = G.authority; G.authority = true; G.kill(v, by, e.how); G.authority = a; }
    } else if (e.type === 'spawn') this.applySpawn(e);
    else if (e.type === 'hit') { if (e.by === this.myId) G.emit('hit', { target: P(e.t), dmg: e.d }); }
    else if (e.type === 'note') G.emit('note', e.text);
    else if (e.type === 'roster') {
      const p = P(e.r.id);
      if (p) { p.name = e.r.name; p.human = e.r.human; }
    } else if (e.type === 'end') { G.phase = 'over'; this.app.onlineEnd(e); }
  }

  tickGuest(dt) {
    const G = this.app.game, p = G.player;
    this.sendT -= dt;
    if (!p) return;
    if (p.ctrl.missile && p.alive && p.missiles > 0 && p.missileCd <= 0) {
      this.missileReq = p.locked && p.lockTarget ? p.lockTarget.id : -1;
      p.missiles--; p.missileCd = 0.6;
    }
    p.ctrl.missile = false;
    if (this.sendT <= 0 || this.missileReq !== undefined) {
      this.sendT = 1 / 30;
      const msg = { k: 'i', s: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r4(p.quat.x), r4(p.quat.y), r4(p.quat.z), r4(p.quat.w), r2(p.speed), (p.firing ? 1 : 0) | (p.boosting ? 2 : 0) | (p.rollT > 0 ? 4 : 0)] };
      if (this.missileReq !== undefined) { msg.m = this.missileReq; this.missileReq = undefined; }
      this.net.sendHost(msg);
    }
    if (this.crashSent && p.alive) this.crashSent = false;
  }
  localCrash() {
    if (this.role === 'guest' && this.net && !this.crashSent) { this.crashSent = true; this.net.sendHost({ k: 'crash' }); }
  }
}
