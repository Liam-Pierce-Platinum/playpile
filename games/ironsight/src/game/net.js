// Online play client. One WebSocket to the game server (/ws). Lobby: create / join by code, the host
// picks mode, map and bot skill and starts. In the match the server owns health, kills, points and the
// end; every client sends its own position + aim (15 Hz), shots and grenades (replicated as visuals) and
// reports the hits it lands; the lobby host simulates the bots (their AI fights everyone, online players
// included) and streams them to the others as puppets.
import * as THREE from 'three';
import { TEAM_NAME } from './match.js';

const _v = new THREE.Vector3();

export class Net {
  constructor(game) {
    this.game = game; this.ws = null; this.id = null; this.lobby = null; this.inMatch = false; this.host = false;
    this.ents = new Map(); this.sendT = 0; this.botT = 0; this.onLobby = null; this.onError = null;
  }
  connect() {
    if (this.ws && this.ws.readyState <= 1) return this.ready;
    this.ready = new Promise((res, rej) => {
      const ws = this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } this.recv(m); if (m.t === 'hello') res(); };
      ws.onerror = () => rej(new Error('Could not reach the game server'));
      ws.onclose = () => { if (this.inMatch) this.game.hud.center('Connection to the server lost', 4); this.ws = null; };
    });
    return this.ready;
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  async create(name, mode, map, diff) { await this.connect(); this.send({ t: 'create', name, mode, map, diff }); }
  async join(code, name) { await this.connect(); this.send({ t: 'join', code, name }); }
  settings(o) { this.send({ t: 'settings', ...o }); }
  start() { this.send({ t: 'start' }); }
  leave() { this.send({ t: 'leave' }); this.inMatch = false; this.lobby = null; this.ents.clear(); }
  // ---------------------------------------------------------------- incoming
  recv(m) {
    const G = this.game;
    switch (m.t) {
      case 'hello': this.id = m.id; return;
      case 'joined': this.id = m.id; return;
      case 'lobby': this.lobby = m; this.host = m.host === this.id; this.onLobby?.(m); return;
      case 'error': this.onError?.(m.msg); return;
      case 'host': this.host = m.id === this.id; if (this.lobby) this.lobby.host = m.id; if (this.inMatch && this.host) G.hud.center('You are now the host', 2); return;
      case 'start': this.startInfo = m; this.host = m.host === this.id; this.onStart?.(m); return;
    }
    if (m.t === 'loadout') { (this.gunCfg || (this.gunCfg = {}))[m.id] = m.gun; const n = this.ents.get(m.id); if (n?.npc && m.gun) n.npc.setGun(m.gun); return; }
    if (!this.inMatch) return;
    const M = G.match, P = G.player;
    switch (m.t) {
      case 'tick': if (M) M.t = m.t; return;
      case 'state': { const n = this.ents.get(m.id); if (n?.npc && m.p) n.npc.net = { x: m.p[0], y: m.p[1], z: m.p[2], yaw: m.p[3], pitch: m.p[4], crouch: m.p[5] }; return; }
      case 'bots': for (const b of m.b) { const n = this.ents.get(b[0]); if (n?.npc && n.npc.isPuppet) n.npc.net = { x: b[1], y: b[2], z: b[3], yaw: b[4], pitch: b[5], crouch: b[6] }; } return;
      case 'guns': for (const [id, gun] of m.list) { const n = this.ents.get(id); if (n?.npc && gun && !n.npc.isLocalBot) n.npc.setGun(gun); } return;
      case 'shot': {
        const n = this.ents.get(m.id); if (!n?.npc) return;
        const o = new THREE.Vector3(...m.o), d = new THREE.Vector3(...m.d);
        G.ballistics.fire({ pos: o, dir: d, velocity: 850, damage: 0, team: n.npc.team, owner: n.npc, cls: m.cls, visual: true });
        G.fx.tracer(o, d, 850, { alpha: 0.5, w: 0.006 }); G.fx.worldFlash?.(o, d, 0.8);
        G.audio.gunshot(o, m.cls || 'ar', { suppressed: m.sup });
        G.npcs.noise(o, m.sup ? 25 : 120, 'gunshot', o.clone(), n.npc); n.npc.recoilKick = 1; n.npc.firedT = G.time;
        return;
      }
      case 'nade': { const n = this.ents.get(m.owner); G.grenades.launch(m.type, new THREE.Vector3(...m.o), new THREE.Vector3(...m.v), n?.npc || null, true); return; }
      case 'dmg': {
        const v = this.actor(m.victim), a = this.actor(m.attacker); if (!v) return;
        M?.onDamage(a, v);
        if (v === P) { const lost = P.health - m.hp; if (lost > 0) { P.health = m.hp; P.lastHurt = P.time; G.audio.hurt(); if (a) { const to = a.pos.clone().sub(P.pos), ang = Math.atan2(to.x, to.z); G.hud.damageFrom(-(ang - Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw)))); } P.shake.p += 0.01; } }
        else { v.hp = m.hp; v.hurtT = v.time; if (v.state !== 'puppet') { v.suppression = 1; if (a && a.team !== v.team) { v.target = a; v.lastKnown = a.pos.clone(); if (v.state !== 'combat') v.enterCombat(true); } } v.flinch = 0.3; }
        return;
      }
      case 'kill': {
        const v = this.actor(m.victim), a = this.actor(m.killer);
        if (m.score) this.applyScore(m.score);
        const ve = M?.roster.get(m.victim), ke = m.killer ? M?.roster.get(m.killer) : null;
        G.feed(ke, ve, m.zone, m.weapon);
        if (ke?.local) G.onScore(100 + (m.zone === 'head' ? 25 : 0), m.zone === 'head' ? 'Headshot kill' : 'Kill');
        if (m.assists?.includes(this.id)) G.onScore(50, 'Assist');
        const dir = m.dir ? new THREE.Vector3(...m.dir) : new THREE.Vector3(0, 0, 1);
        if (v === P) { P.health = 0; P.dead = true; G.deathHandled = true; G.deathT = G.time; }
        else if (v?.alive) { v.lastAttacker = a; v.die(dir, v.center.clone(), m.zone, 1.4); }
        // respawns: this client brings back itself and (host) the bots it runs
        if (ve && M && (ve.local || (this.host && ve.bot))) M.respawns.push({ entry: ve, at: M.t + 4 });
        return;
      }
      case 'spawn': { const n = this.ents.get(m.id); if (n?.npc && n.npc.isPuppet && m.pos) { n.npc.respawn(m.pos, m.pos[3] || 0); n.npc.protUntil = G.time + 2.5; } return; }
      case 'left': { const n = this.ents.get(m.id); if (n?.npc) { G.scene.remove(n.npc.holder); if (n.npc.gunObj) G.scene.remove(n.npc.gunObj); G.npcs.list = G.npcs.list.filter(x => x !== n.npc); } M?.remove(m.id); this.ents.delete(m.id); G.hud.killfeed('<em>' + (n?.name || 'A player') + ' left</em>'); return; }
      case 'end': if (m.score) this.applyScore(m.score); if (M) { M.over = true; G.endMatch(); } this.inMatch = false; return;
    }
  }
  actor(id) { if (!id) return null; if (id === this.id) return this.game.player; return this.ents.get(id)?.npc || null; }
  applyScore(rows) { const M = this.game.match; if (!M) return; for (const [id, k, d, a, s] of rows) { const e = M.roster.get(id); if (e) Object.assign(e, { kills: k, deaths: d, assists: a, score: s }); } const me = M.me; if (me) this.game.hud.score(me.score); }
  // ---------------------------------------------------------------- match setup (called from game.startMode)
  setupMatch(M) {
    const G = this.game, S = this.startInfo; this.inMatch = true; this.ents.clear();
    M.limit = S.limit; M.timeLimit = S.time;
    for (const r of S.roster) {
      if (r.id === this.id) { G.player.team = r.team; G.player.id = this.id; M.add(G.player, { name: r.name + ' (you)', team: r.team, local: true }); this.ents.set(r.id, { name: r.name }); continue; }
      const puppet = !r.bot || !this.host;
      const n = G.addBot(r.id, r.name, r.team, { puppet, human: !r.bot, remote: puppet });
      n.net = { x: n.pos.x, y: n.pos.y, z: n.pos.z, yaw: n.yaw, pitch: 0, crouch: 0 };
      if (puppet) n.state = 'puppet';
      M.roster.get(r.id).bot = r.bot;
      this.ents.set(r.id, { npc: n, name: r.name });
      if (r.bot && this.host) { n.isLocalBot = true; this.send({ t: 'botgun', id: r.id, gun: n.cfgWanted }); }
    }
    const sp = M.pickSpawn(G.player.team); G.player.spawn(sp[0], sp[1], sp[2], sp[3]);
    this.send({ t: 'ready' });
    G.hud.center((M.tdm ? 'Team ' + TEAM_NAME[G.player.team] + '  ·  ' : '') + 'Online  ·  ' + S.roster.filter(r => !r.bot).length + ' players', 3);
  }
  // ---------------------------------------------------------------- outgoing
  update(dt) {
    if (!this.inMatch) return;
    const G = this.game, P = G.player;
    this.sendT -= dt; this.botT -= dt;
    if (this.sendT <= 0) { this.sendT = 1 / 15; const f = +(P.stance !== 'stand'); this.send({ t: 'state', p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r3(Math.PI + P.yaw), r3(P.pitch), f] }); }
    if (this.host && this.botT <= 0) {
      this.botT = 1 / 10;
      const b = []; for (const [id, e] of this.ents) if (e.npc && !e.npc.isPuppet) { const n = e.npc; b.push([id, r2(n.pos.x), r2(n.pos.y), r2(n.pos.z), r3(n.aimYaw), r3(n.aimPitch), n.crouch > 0.5 ? 1 : 0]); }
      if (b.length) this.send({ t: 'bots', b });
    }
  }
  sendShot(o, d, st) { if (this.inMatch) this.send({ t: 'shot', id: this.id, o: v3(o), d: v3(d), cls: st.cls, sup: !!st.suppressed }); }
  botShot(n, o, d) { if (this.inMatch && this.host && !n.isPuppet) this.send({ t: 'shot', id: n.id, o: v3(o), d: v3(d), cls: n.gunCls, sup: !!(n.cfg && /suppress/.test(n.cfg.muzzle)) }); }
  sendNade(type, o, v, owner) { if (!this.inMatch) return; const id = owner === this.game.player ? this.id : owner?.id; if (id) this.send({ t: 'nade', type, o: v3(o), v: v3(v), owner: id }); }
  sendLoadout(L) { if (this.inMatch) this.send({ t: 'loadout', gun: L.primary }); }
  sendRespawn(sp) { if (this.inMatch) this.send({ t: 'spawn', id: this.id, pos: sp }); }
  botRespawned(n) { if (this.inMatch && this.host) this.send({ t: 'spawn', id: n.id, pos: [r2(n.pos.x), r2(n.pos.y), r2(n.pos.z), r3(n.yaw)] }); }
  reportKill() { /* the server scores kills online */ }
  // every hit goes to the server, which decides health and kills for everybody
  routeDamage(v, dmg, zone, dir, point, attacker, weapon) {
    if (!this.inMatch) return false;
    const vid = v === this.game.player ? this.id : v.id, aid = attacker === this.game.player ? this.id : attacker?.id || null;
    this.send({ t: 'hit', victim: vid, attacker: aid, dmg: Math.round(dmg), zone, weapon: weapon || '', dir: dir ? v3(dir) : null });
    return true;
  }
}
const r2 = x => Math.round(x * 100) / 100, r3 = x => Math.round(x * 1000) / 1000;
const v3 = v => [r3(v.x), r3(v.y), r3(v.z)];
