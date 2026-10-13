// Autopilot used by the headless playtests (?bot=1 or __G.autopilot()). Plays the real game through the input struct.
import { G, C } from './state.js';
import { TS, d2 } from './util.js';
import { flowField, los, tileAt, solidTile } from './dungeon.js';
import * as game from './game.js';
import { SPELLS } from './data.js';

let field = null, fieldKey = '', fieldT = 0;
let stuckT = 0, lastX = 0, lastZ = 0, wanderT = 0, wanderA = 0, strafe = 1, modalT = 0, shopT = 0;
export const botLog = [];

function pathDir(tx, tz) {
  const F = G.F, P = G.P;
  const key = Math.floor(tx / TS) + ',' + Math.floor(tz / TS);
  fieldT -= 1 / 60;
  if (key !== fieldKey || fieldT <= 0 || !field) { field = flowField(F, Math.floor(tx / TS), Math.floor(tz / TS)); fieldKey = key; fieldT = 0.5; }
  const px = Math.floor(P.x / TS), py = Math.floor(P.z / TS);
  if (los(F, P.x, P.z, tx, tz) && Math.hypot(tx - P.x, tz - P.z) < 8) return norm(tx - P.x, tz - P.z);
  let best = field[py * F.W + px], bx = px, by = py;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = field[(py + oy) * F.W + px + ox];
    if (v >= 0 && (best < 0 || v < best)) { best = v; bx = px + ox; by = py + oy; }
  }
  if (bx === px && by === py) return norm(tx - P.x, tz - P.z);
  return norm((bx + 0.5) * TS - P.x, (by + 0.5) * TS - P.z);
}
function pathLen(tx, tz) {
  const F = G.F, P = G.P;
  const f = flowField(F, Math.floor(tx / TS), Math.floor(tz / TS));
  return f[Math.floor(P.z / TS) * F.W + Math.floor(P.x / TS)];
}
function norm(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }

function inDanger() {
  const P = G.P;
  for (const it of C.ground.items) {
    if (it.dead || it.t < (G.botReact || 0)) continue; // optional human-like reaction delay
    if (it.kind === 'tele') { const g = it.g.position; if (Math.hypot(P.x - g.x, P.z - g.z) < it.r + 0.6) return [P.x - g.x, P.z - g.z]; }
    else if (it.kind === 'line' || it.kind === 'arc') {
      const g = it.g, a = g.rotation.y, ux = Math.sin(a), uz = Math.cos(a), px = P.x - g.position.x, pz = P.z - g.position.z;
      const along = px * ux + pz * uz, perp = px * uz - pz * ux;
      if (it.kind === 'line' && along > -0.5 && along < it.len + 0.5 && Math.abs(perp) < it.w / 2 + 0.7) return [uz * Math.sign(perp || 1), -ux * Math.sign(perp || 1)];
      if (it.kind === 'arc' && Math.hypot(px, pz) < it.r + 0.7) return [px, pz];
    }
  }
  if (G.botReact) for (const p of G.eprojs) { // human mode: sidestep shots that will hit within ~0.6 s
    const rx = P.x - p.x, rz = P.z - p.z, v2 = p.vx * p.vx + p.vz * p.vz; if (!v2) continue;
    const tc = (rx * p.vx + rz * p.vz) / v2; if (tc < 0.15 || tc > 0.6) continue;
    const mx = rx - p.vx * tc, mz = rz - p.vz * tc;
    if (Math.hypot(mx, mz) < P.r + (p.r || 0.3) + 0.25) { const s = Math.sign(mx * p.vz - mz * p.vx) || 1; return [p.vz * s, -p.vx * s]; }
  }
  for (const h of G.hazards) { const d = Math.hypot(P.x - h.x, P.z - h.z); if (d - h.rad < 2 && d - h.rad > -0.3) return 'dash'; }
  return null;
}

export function botStep(inp, dt) {
  const P = G.P;
  if (G.modalOpen && G.modalApi) {
    modalT += dt; if (modalT < 0.3) return; modalT = 0;
    const api = G.modalApi;
    if (api.kind === 'book') {
      const s = SPELLS[api.spell];
      if (s.kind === 'primary') api.choose(Math.random() < 0.5 ? 0 : -1);
      else { let slot = [1, 2, 3, 4].find((i) => !P.slots[i]); if (!slot) slot = 1 + Math.floor(Math.random() * 4); api.choose(slot); }
    } else if (api.kind === 'levelup' || api.kind === 'tome') api.choose(Math.floor(Math.random() * api.options.length));
    else api.choose(0);
    return;
  }
  if (G.mode === 'shop') {
    shopT += dt; if (shopT < 0.4) return; shopT = 0;
    const items = G.shop.items;
    const pri = (it) => it.kind === 'potion' ? (P.hp < P.maxHp * 0.6 ? 0 : 99) : { relic: 1, book: 2, tome: 3, vigor: 4 }[it.kind] ?? 99;
    const order = items.map((it, i) => ({ it, i })).filter(({ it, i }) => !G.shop.sold.has(i) && P.gold >= it.price && pri(it) < 99).sort((a, b) => pri(a.it) - pri(b.it));
    if (order.length) { game.buyShop(order[0].i); botLog.push('buy ' + order[0].it.name); }
    else { game.leaveShop(); botLog.push('leave shop'); }
    return;
  }
  if (G.mode !== 'play' || !P || P.dead) return;

  inp.autoAim = false; inp.fire = false; inp.cast = [false, false, false, false]; inp.dash = false;
  let mv = [0, 0];
  const threats = game.liveMonsters().filter((m) => m.room === G.room || (Math.hypot(m.x - P.x, m.z - P.z) < 12 && los(G.F, P.x, P.z, m.x, m.z)));
  const danger = inDanger();
  if (threats.length) {
    threats.sort((a, b) => d2(a.x, a.z, P.x, P.z) - d2(b.x, b.z, P.x, P.z));
    const t = threats.find((m) => los(G.F, P.x, P.z, m.x, m.z)) || threats[0];
    const d = Math.hypot(t.x - P.x, t.z - P.z);
    const ae = G.botAimErr || 0;
    inp.aimX = t.x + (t.vx || 0) * 0.1 + (Math.random() - 0.5) * ae; inp.aimZ = t.z + (t.vz || 0) * 0.1 + (Math.random() - 0.5) * ae;
    const sight = los(G.F, P.x, P.z, t.x, t.z);
    inp.fire = sight;
    for (let i = 1; i <= 4; i++) {
      const id = P.slots[i]; if (!id) continue;
      const st = game.statsOf(id);
      if ((P.cds[id] || 0) > 0 || P.mana < st.mana * P.manaMul) continue;
      if (id === 'shield' && P.hp > P.maxHp * 0.7) continue;
      if (id === 'nova' && d > st.area) continue;
      if (id === 'blink') continue;
      if (!sight && id !== 'familiar' && id !== 'shield' && id !== 'orbit') continue;
      inp.cast[i - 1] = true;
    }
    const want = t.boss ? 8 : t.type === 'skeleton' || t.type === 'ghost' ? 7 : 5.5;
    const [ux, uz] = norm(t.x - P.x, t.z - P.z);
    if (!sight) mv = pathDir(t.x, t.z);
    else if (d < want - 1.5) mv = [-ux + uz * strafe * 0.6, -uz - ux * strafe * 0.6];
    else if (d > want + 2) mv = [ux, uz];
    else mv = [uz * strafe, -ux * strafe];
    if (Math.random() < 0.01) strafe = -strafe;
  } else {
    // loot, chests, the next room, the stairs
    let goal = null;
    const loot = G.pickups.filter((p) => ['book', 'tome', 'relic', 'potion'].includes(p.kind) && (p.kind !== 'potion' || P.hp < P.maxHp));
    if (loot.length) goal = loot.sort((a, b) => d2(a.x, a.z, P.x, P.z) - d2(b.x, b.z, P.x, P.z))[0];
    if (!goal) { const ch = G.chests.filter((c) => !c.opened && pathLen(c.x, c.z) >= 0); if (ch.length) goal = ch.sort((a, b) => d2(a.x, a.z, P.x, P.z) - d2(b.x, b.z, P.x, P.z))[0]; }
    if (!goal) {
      let best = null, bl = 1e9;
      for (const r of G.F.rooms) {
        if (r.state !== 'idle') continue;
        const l = pathLen(r.cx, r.cz);
        if (l >= 0 && l < bl) { bl = l; best = r; }
      }
      if (best) goal = { x: best.cx, z: best.cz };
    }
    if (!goal && G.stairs) goal = G.stairs;
    if (!goal) { const m = G.monsters.find((o) => o.state === 'disguised'); if (m) goal = m; }
    if (goal) { mv = pathDir(goal.x, goal.z); inp.aimX = P.x + mv[0] * 5; inp.aimZ = P.z + mv[1] * 5; }
  }
  if (danger) {
    if (danger === 'dash') inp.dash = true;
    else { const [dx, dz] = norm(danger[0], danger[1]); mv = [dx, dz]; if (P.dashCd <= 0 && Math.random() < 0.3) inp.dash = true; }
  }
  // stuck detection
  stuckT += dt;
  if (stuckT > 1.2) {
    if (Math.hypot(P.x - lastX, P.z - lastZ) < 0.4 && Math.hypot(mv[0], mv[1]) > 0.1) { wanderT = 0.7; wanderA = Math.random() * 6.28; }
    lastX = P.x; lastZ = P.z; stuckT = 0;
  }
  if (wanderT > 0) { wanderT -= dt; mv = [Math.sin(wanderA), Math.cos(wanderA)]; }
  inp.mx = mv[0]; inp.mz = mv[1];
}
