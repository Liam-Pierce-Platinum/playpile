// Matches: 10 combatants, FREE FOR ALL (you + 9 bots, everyone for themselves) or TEAM DEATHMATCH
// (5 v 5: you + 4 bot team-mates against 5 bots). Points for kills (+ headshot bonus) and assists,
// respawns after a short timer at the safest spawn of your side (far from enemies, out of their sight),
// brief spawn protection, and the match ends at the score limit or the time limit.
// Online the server owns the roster and the score (game.net feeds applyState / applyKill); offline
// this class is the authority.
import * as THREE from 'three';

export const MODES = {
  ffa: { name: 'Free for all', short: 'FFA', limit: 2000, time: 480 },
  tdm: { name: 'Team deathmatch', short: 'TDM', limit: 6000, time: 600 },
};
export const PTS = { kill: 100, head: 25, assist: 50 };
export const RESPAWN = 4, PROTECT = 2.5;
export const TEAM_NAME = { A: 'Ghost', B: 'Viper' };
export const BOT_NAMES = ['Reaper', 'Havoc', 'Nomad', 'Kilo', 'Rook', 'Specter', 'Vandal', 'Jackal', 'Mako', 'Bishop', 'Cipher', 'Torque', 'Saber', 'Wraith', 'Onyx', 'Drifter', 'Talon', 'Grit'];
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Match {
  constructor(game, mode) {
    this.game = game; this.mode = mode; this.M = MODES[mode] || MODES.ffa;
    this.t = 0; this.over = false; this.roster = new Map(); this.respawns = [];
    this.limit = this.M.limit; this.timeLimit = this.M.time;
  }
  get tdm() { return this.mode === 'tdm'; }
  add(actor, o) {
    const e = { id: actor.id, name: o.name, team: o.team, kills: 0, deaths: 0, assists: 0, score: 0, actor, bot: !!o.bot, local: !!o.local, remote: !!o.remote };
    actor.team = o.team; actor.name = o.name; this.roster.set(e.id, e); return e;
  }
  remove(id) { this.roster.delete(id); this.respawns = this.respawns.filter(r => r.entry.id !== id); }
  entry(a) { return a ? this.roster.get(a.id) : null; }
  get me() { for (const e of this.roster.values()) if (e.local) return e; return null; }
  onDamage(attacker, victim) { if (attacker && attacker !== victim) (victim.dmgLog || (victim.dmgLog = new Map())).set(attacker.id, this.t); }
  // offline authority: score the kill, credit assists, queue the respawn
  onKill(killer, victim, zone, weapon) {
    const ve = this.entry(victim), ke = killer && killer !== victim ? this.entry(killer) : null;
    if (ve) ve.deaths++;
    if (ke && ke.team !== ve?.team) { ke.kills++; ke.score += PTS.kill + (zone === 'head' ? PTS.head : 0); if (ke.local) this.game.onScore(PTS.kill + (zone === 'head' ? PTS.head : 0), zone === 'head' ? 'Headshot kill' : 'Kill'); }
    if (victim.dmgLog) for (const [id, t] of victim.dmgLog) {
      if (id === killer?.id || this.t - t > 8) continue;
      const e = this.roster.get(id); if (!e || e.team === ve?.team) continue;
      e.assists++; e.score += PTS.assist; if (e.local) this.game.onScore(PTS.assist, 'Assist');
    }
    victim.dmgLog = null;
    this.game.feed(ke, ve, zone, weapon);
    if (ve && !this.over) this.respawns.push({ entry: ve, at: this.t + RESPAWN });
    this.checkEnd();
  }
  teamScore(team) { let s = 0; for (const e of this.roster.values()) if (e.team === team) s += e.score; return s; }
  sorted() { return [...this.roster.values()].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths); }
  winner() {
    if (this.tdm) { const a = this.teamScore('A'), b = this.teamScore('B'); return a === b ? null : a > b ? 'A' : 'B'; }
    return this.sorted()[0] || null;
  }
  checkEnd() {
    if (this.over || this.game.net) return;
    const hit = this.tdm ? ['A', 'B'].some(t => this.teamScore(t) >= this.limit) : [...this.roster.values()].some(e => e.score >= this.limit);
    if (hit || this.t >= this.timeLimit) { this.over = true; this.game.endMatch(); }
  }
  update(dt) {
    if (this.over) return;
    this.t += dt;
    if (this.t >= this.timeLimit) this.checkEnd();
    for (const r of this.respawns) if (this.t >= r.at && !r.done) {
      const e = r.entry; if (e.remote) { r.done = true; continue; }
      if (e.local && !this.game.readyToRespawn()) continue;
      r.done = true;
      const sp = this.pickSpawn(e.team);
      if (e.local) this.game.respawnPlayer(sp); else this.game.respawnBot(e.actor, sp);
    }
    this.respawns = this.respawns.filter(r => !r.done);
  }
  // the spawn of this side that is furthest from living enemies and out of their sight
  pickSpawn(team) {
    const G = this.game, S = G.mapData.spawns, W = G.world;
    const pts = this.tdm ? S[team] : [...S.A, ...S.B, ...(S.ffa || [])];
    const enemies = G.actors().filter(a => a.alive && a.team !== team);
    const friends = G.actors().filter(a => a.alive && a.team === team);
    let scored = pts.map(p => {
      let minD = 80, seen = 0;
      _a.set(p[0], (p[1] || 0) + 1.6, p[2]);
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - p[0], e.pos.z - p[2]); minD = Math.min(minD, d);
        if (d < 60) { _b.set(e.pos.x, e.pos.y + 1.5, e.pos.z); if (W.los(_a, _b)) seen++; }
      }
      const crowd = friends.some(f => Math.hypot(f.pos.x - p[0], f.pos.z - p[2]) < 1.2) ? 15 : 0;
      return [minD - seen * 40 - crowd + Math.random() * 6, p];
    });
    scored.sort((a, b) => b[0] - a[0]);
    const p = scored[Math.floor(Math.random() * Math.min(2, scored.length))][1];
    return [p[0] + (Math.random() - 0.5) * 0.8, p[1] || 0, p[2] + (Math.random() - 0.5) * 0.8, p[3] ?? 0];
  }
  // ---------------------------------------------------------------- leaderboard
  boardHTML(final = false) {
    const row = (e, i) => `<tr class="${e.local ? 'me' : ''}${e.actor && !e.actor.alive && !final ? ' dead' : ''}"><td>${i + 1}</td><td>${esc(e.name)}${e.bot ? ' <i>bot</i>' : ''}</td><td>${e.kills}</td><td>${e.deaths}</td><td>${e.assists}</td><td>${e.score.toLocaleString()}</td></tr>`;
    const head = '<tr><th>#</th><th>Player</th><th>K</th><th>D</th><th>A</th><th>Points</th></tr>';
    if (!this.tdm) return `<table class="lb">${head}${this.sorted().map(row).join('')}</table>`;
    return ['A', 'B'].sort((a, b) => this.teamScore(b) - this.teamScore(a)).map(t => `<div class="lb-team t${t}"><h3>${TEAM_NAME[t]} <b>${this.teamScore(t).toLocaleString()}</b></h3><table class="lb">${head}${this.sorted().filter(e => e.team === t).map(row).join('')}</table></div>`).join('');
  }
  barHTML() {
    const left = Math.max(0, this.timeLimit - this.t), mm = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const me = this.me;
    if (this.tdm) { const my = me?.team || 'A', other = my === 'A' ? 'B' : 'A'; return `<span class="mb-f">${TEAM_NAME[my]} ${this.teamScore(my).toLocaleString()}</span><span class="mb-t">${mm}<small>first to ${this.limit.toLocaleString()}</small></span><span class="mb-e">${this.teamScore(other).toLocaleString()} ${TEAM_NAME[other]}</span>`; }
    const s = this.sorted(), lead = s[0], rank = s.indexOf(me) + 1;
    return `<span class="mb-f">You ${me?.score.toLocaleString() || 0} <small>#${rank}</small></span><span class="mb-t">${mm}<small>first to ${this.limit.toLocaleString()}</small></span><span class="mb-e">${lead && lead !== me ? esc(lead.name) + ' ' + lead.score.toLocaleString() : (s[1] ? esc(s[1].name) + ' ' + s[1].score.toLocaleString() : '')}</span>`;
  }
}
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
