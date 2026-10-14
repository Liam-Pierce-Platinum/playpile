// Drawing: terrain, bridge, objects + actors y-sorted, effects, lighting.
import * as S from './sprites.js';
import { G, isNight, objective, objectiveTarget } from './game.js';
import { TS, N, T, Z, CASTLE } from './world.js';
import { SWORDS, AXES, PICKS } from './data.js';

export const cam = { x: 0, y: 0, w: 320, h: 180 };
let light = null;

export function render(ctx, vw, vh, dt, title = false) {
  cam.w = vw; cam.h = vh;
  const p = G.player, w = G.world;
  if (!p) return;
  // camera follow with slight look-ahead
  if (!title) {
  const tx = p.x + Math.cos(p.aim) * 10 - vw / 2, ty = p.y - 8 + Math.sin(p.aim) * 8 - vh / 2;
  cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  if (G.boss && G.boss.alive) { cam.x += ((G.boss.x + p.x) / 2 - vw / 2 - cam.x) * Math.min(1, dt * 3); }
  }
  cam.x = Math.max(0, Math.min(N * TS - vw, cam.x)); cam.y = Math.max(0, Math.min(N * TS - vh, cam.y));
  const sh = G.shake > 0.3 ? G.shake : 0;
  const cx = Math.round(cam.x + (Math.random() - 0.5) * sh), cy = Math.round(cam.y + (Math.random() - 0.5) * sh);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#29366f'; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(w.terrain, cx, cy, vw, vh, 0, 0, vw, vh);
  ctx.save(); ctx.translate(-cx, -cy);
  const t = G.time;
  drawWater(ctx, cx, cy, vw, vh, t);
  drawBridge(ctx, t);
  drawGates(ctx);
  // ground hazards
  for (const h of G.hazards) drawHazard(ctx, h);
  // pickups shadows + sprites list
  const list = [];
  const x0 = Math.floor(cx / TS) - 2, x1 = Math.floor((cx + vw) / TS) + 2, y0 = Math.floor(cy / TS) - 1, y1 = Math.floor((cy + vh) / TS) + 4;
  const seen = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const g = w.grid[y * N + x]; if (g) for (const o of g) if (!seen.has(o)) { seen.add(o); list.push({ y: o.y, o }); } }
  for (const o of w.nonSolid || (w.nonSolid = w.objs.filter((o) => !o.solid))) if (o.x > cx - 32 && o.x < cx + vw + 32 && o.y > cy - 8 && o.y < cy + vh + 40) list.push({ y: o.y - 6, o });
  for (const e of G.enemies) list.push({ y: e.y, e });
  for (const d of G.drops) list.push({ y: d.y, d });
  if (G.boss) list.push({ y: G.boss.y, b: G.boss });
  if (!title && G.state !== 'dead' && G.state !== 'dying') list.push({ y: p.y, p });
  for (const q of G.projs) list.push({ y: q.y + 6, q });
  list.sort((a, b) => a.y - b.y);
  // shadows first
  ctx.fillStyle = 'rgba(20,20,40,0.28)';
  for (const it of list) {
    if (it.e && !it.e.hidden && !(it.e.dormant)) shadow(ctx, it.e.x, it.e.y + 1, it.e.r * (it.e.scale || 1) + 1);
    if (it.p) shadow(ctx, p.x, p.y + 1, 5);
    if (it.b && !it.b.hidden) shadow(ctx, it.b.x, it.b.y + 1, 15 - it.b.z * 0.1);
    if (it.d) shadow(ctx, it.d.x, it.d.y + 1, 3);
  }
  for (const it of list) {
    if (it.o) drawObj(ctx, it.o, t);
    else if (it.e) drawEnemy(ctx, it.e, t);
    else if (it.p) drawPlayer(ctx, p, t);
    else if (it.d) drawDrop(ctx, it.d, t);
    else if (it.b) drawBoss(ctx, it.b, t);
    else if (it.q) drawProj(ctx, it.q, t);
  }
  // interact marker
  const it = G.interactTarget;
  if (it && G.state === 'play' && !title) {
    const bob = Math.round(Math.sin(t * 6) * 1.5);
    const ic = it.interact === 'chop' ? S.icon(AXES[p.axe].icon) : it.interact === 'mine' ? S.icon(PICKS[Math.max(1, p.pick)].icon) : it.interact === 'chest' ? S.icon('coin') : null;
    const top = it.kind === 'tree' ? 34 : it.kind === 'stall' ? 34 : it.kind === 'npc' ? 26 : 20;
    const bx = Math.round(it.x - 7), by = Math.round(it.y - top - 14 + bob);
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx - 1, by - 1, 16, 15); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(bx, by, 14, 13);
    ctx.fillRect(bx + 5, by + 13, 4, 2); ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx + 6, by + 15, 2, 1);
    if (ic) ctx.drawImage(ic, bx + 1, by + 1); else { ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx + 4, by + 3, 1, 7); ctx.fillRect(bx + 4, by + 3, 6, 1); ctx.fillRect(bx + 4, by + 6, 5, 1); ctx.fillRect(bx + 4, by + 9, 6, 1); }
    if (it.maxHp && it.hp < it.maxHp) { ctx.fillStyle = '#1a1c2c'; ctx.fillRect(it.x - 8, it.y + 4, 16, 3); ctx.fillStyle = '#ffcd75'; ctx.fillRect(it.x - 7, it.y + 5, 14 * it.hp / it.maxHp, 1); }
  }
  // particles
  for (const q of G.parts) { ctx.globalAlpha = Math.min(1, q.life / q.max * 1.5); ctx.fillStyle = q.col; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size); }
  ctx.globalAlpha = 1;
  // damage pops
  for (const q of G.pops) { const c = S.digits(q.str.replace('xp', ''), q.col); const yy = q.y - q.t * 22 - (q.t < 0.1 ? 0 : 0); ctx.globalAlpha = q.t > 0.6 ? (0.9 - q.t) / 0.3 : 1; ctx.drawImage(c, Math.round(q.x - c.width / 2), Math.round(yy)); }
  ctx.globalAlpha = 1;
  if (!title) drawCanopyFade(ctx, list, p);
  ctx.restore();
  drawLighting(ctx, cx, cy, vw, vh, t);
  if (!title) drawObjectiveArrow(ctx, cx, cy, vw, vh, t);
  if (G.flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flashT})`; ctx.fillRect(0, 0, vw, vh); }
  if (p.hurtT > 0) { ctx.fillStyle = `rgba(177,62,83,${p.hurtT})`; ctx.fillRect(0, 0, vw, 3); ctx.fillRect(0, vh - 3, vw, 3); ctx.fillRect(0, 0, 3, vh); ctx.fillRect(vw - 3, 0, 3, vh); }
}
function shadow(ctx, x, y, r) { ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), r, Math.max(2, r * 0.4), 0, 0, Math.PI * 2); ctx.fill(); }

function drawWater(ctx, cx, cy, vw, vh, t) {
  const w = G.world;
  const x0 = Math.floor(cx / TS), x1 = Math.floor((cx + vw) / TS), y0 = Math.floor(cy / TS), y1 = Math.floor((cy + vh) / TS);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const tt = w.t(x, y); if (tt !== T.WATER && tt !== T.DEEP) continue;
    const ph = (x * 13 + y * 7) % 10;
    const k = Math.sin(t * 1.5 + ph);
    if (k > 0.6) { ctx.fillStyle = tt === T.DEEP ? '#3b5dc9' : '#73eff7'; ctx.fillRect(x * TS + 3 + ((ph * 3) % 8), y * TS + 4 + (ph % 7), 3 + Math.round(k * 2), 1); }
  }
}
function drawBridge(ctx, t) {
  const w = G.world, rows = w.bridgeRows; if (!rows.length) return;
  const built = new Set(w.bridgeBuiltRows());
  const X = 78 * TS, W = 5 * TS;
  for (const y of rows) {
    const Y = y * TS;
    if (built.has(y)) {
      ctx.fillStyle = '#5c3a21'; ctx.fillRect(X - 2, Y, W + 4, TS);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = (i + y) % 2 ? '#c98a4b' : '#b5783d'; ctx.fillRect(X, Y + i * 4, W, 3); }
      ctx.fillStyle = '#9a6232'; ctx.fillRect(X, Y + 3, W, 1); ctx.fillRect(X, Y + 7, W, 1); ctx.fillRect(X, Y + 11, W, 1); ctx.fillRect(X, Y + 15, W, 1);
      ctx.fillStyle = '#5c3a21'; ctx.fillRect(X - 3, Y, 3, TS); ctx.fillRect(X + W, Y, 3, TS);
      if (y % 3 === 0) { ctx.fillStyle = '#5c3a21'; ctx.fillRect(X - 4, Y - 2, 5, 7); ctx.fillRect(X + W - 1, Y - 2, 5, 7); ctx.fillStyle = '#9a6232'; ctx.fillRect(X - 3, Y - 1, 3, 5); ctx.fillRect(X + W, Y - 1, 3, 5); }
    }
  }
  // scaffolding posts for the next unbuilt segment
  if (w.bridgeStage < 5) {
    const n = rows.length, k = Math.ceil(w.bridgeStage / 5 * n), k2 = Math.ceil((w.bridgeStage + 1) / 5 * n);
    for (let i = n - k2; i < n - k; i++) {
      const Y = rows[i] * TS;
      for (const px of [X + 2, X + W - 5]) { ctx.fillStyle = '#5c3a21'; ctx.fillRect(px, Y + 2, 3, 12); ctx.fillStyle = '#73eff7'; ctx.fillRect(px - 1, Y + 13 + Math.round(Math.sin(t * 2 + i)), 5, 1); }
    }
    // marker flag
    const first = rows[n - k2] * TS;
    ctx.fillStyle = '#5c3a21'; ctx.fillRect(X + W / 2, first - 10, 1, 14); ctx.fillStyle = '#b13e53'; ctx.fillRect(X + W / 2 + 1, first - 10, 6, 4);
  }
}
function drawGates(ctx) {
  const w = G.world; if (w.gateOpen) return;
  const Y = CASTLE.innerY * TS;
  for (let x = 78; x <= 82; x++) {
    const X = x * TS;
    ctx.fillStyle = '#2b1740'; ctx.fillRect(X, Y, TS, TS * 2);
    ctx.fillStyle = '#5c3a21'; for (let i = 2; i < 16; i += 5) ctx.fillRect(X + i, Y + 2, 3, TS * 2 - 4);
    ctx.fillStyle = '#566c86'; ctx.fillRect(X, Y + 6, TS, 2); ctx.fillRect(X, Y + 22, TS, 2);
  }
  ctx.fillStyle = '#e6b8ff'; ctx.globalAlpha = 0.5 + Math.sin(G.time * 3) * 0.3; ctx.fillRect(80 * TS + 6, Y + 12, 4, 6); ctx.globalAlpha = 1;
}
function drawHazard(ctx, h) {
  const t = G.time;
  if (h.kind === 'circle' || h.kind === 'warn') {
    const delay = h.kind === 'warn' ? h.life : (h.delay || 0);
    if (h.t < delay) {
      const k = h.t / delay;
      ctx.globalAlpha = 0.22 + 0.15 * Math.sin(t * 20);
      ctx.fillStyle = h.col === '#94b0c2' ? '#ef7d57' : '#b13e53';
      ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, h.r * k, h.r * 0.6 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#ff5060'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (h.kind === 'circle') {
      const k = (h.t - delay) / 0.2; ctx.globalAlpha = Math.max(0, 1 - k); ctx.fillStyle = h.col === '#94b0c2' ? '#f4f4f4' : '#e6b8ff';
      ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, h.r * (1 + k * 0.2), h.r * 0.6 * (1 + k * 0.2), 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  } else if (h.kind === 'line') {
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.ang);
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 24); ctx.fillStyle = '#b13e53'; ctx.fillRect(0, -h.w / 2, h.len, h.w);
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#ff5060'; ctx.fillRect(0, -h.w / 2, h.len * Math.min(1, h.t / h.life), 1); ctx.fillRect(0, h.w / 2 - 1, h.len * Math.min(1, h.t / h.life), 1);
    ctx.restore(); ctx.globalAlpha = 1;
  } else if (h.kind === 'ring') {
    const rr = h.t * h.speed; if (rr > h.max) return;
    ctx.strokeStyle = h.dmg ? '#e6b8ff' : '#f4f4f4'; ctx.globalAlpha = 1 - rr / h.max; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
  }
}
function drawObj(ctx, o, t) {
  const sx = o.shake > 0 ? Math.round(Math.sin(o.shake * 80) * 1.5) : 0;
  let spr = null, ox = 0, oy = 0;
  switch (o.kind) {
    case 'tree': if (o.gone) { spr = S.stump(); oy = 2; } else spr = S.tree(o.tree, o.variant || 0); break;
    case 'rock': if (o.gone) return; spr = S.rock(o.ore); oy = 2; break;
    case 'house': spr = S.house(o.roof); oy = 2; break;
    case 'workbench': spr = S.workbench(); oy = 2; break;
    case 'stall': spr = S.stall(); oy = 2; { const m = S.npc('merchant', Math.floor(t * 2) % 2); ctx.drawImage(m, Math.round(o.x - 8), Math.round(o.y - 30)); } break;
    case 'npc': spr = S.npc(o.npc, Math.floor(t * 2 + o.x) % 2); oy = 2; break;
    case 'well': spr = S.well(); oy = 2; break;
    case 'sign': spr = S.sign(); oy = 2; break;
    case 'fence': spr = S.fence(false); oy = 2; break;
    case 'chest': spr = S.chest(o.open); oy = 2; break;
    case 'grave': spr = S.grave(o.variant); oy = 2; break;
    case 'bush': spr = S.bush(o.variant); oy = 4; break;
    case 'mushroom': spr = S.mushroom(o.variant); oy = 2; break;
    case 'crate': spr = S.crate(); oy = 2; break;
    case 'crystal': spr = S.crystal(); oy = 2; break;
    case 'throne': spr = S.throne(); oy = 2; break;
    case 'pillar': {
      ctx.fillStyle = '#1a1c2c'; ctx.fillRect(o.x - 7, o.y - 34, 14, 36); ctx.fillStyle = '#566c86'; ctx.fillRect(o.x - 6, o.y - 30, 12, 31);
      ctx.fillStyle = '#94b0c2'; ctx.fillRect(o.x - 6, o.y - 30, 3, 31); ctx.fillStyle = '#333c57'; ctx.fillRect(o.x + 3, o.y - 30, 3, 31);
      ctx.fillStyle = '#94b0c2'; ctx.fillRect(o.x - 7, o.y - 34, 14, 4); ctx.fillRect(o.x - 7, o.y - 1, 14, 3); return;
    }
    case 'torch': {
      spr = S.torch(); ctx.drawImage(spr, Math.round(o.x - 4), Math.round(o.y - 16));
      const f = Math.floor(t * 10) % 3; const col = G.flags && G.flags.bossDead ? ['#ffcd75', '#ef7d57', '#f4f4f4'] : ['#e6b8ff', '#8a4bd6', '#f4f4f4'];
      ctx.fillStyle = col[1]; ctx.fillRect(o.x - 2, o.y - 21 + (f === 1 ? 1 : 0), 4, 5); ctx.fillStyle = col[0]; ctx.fillRect(o.x - 1, o.y - 20, 2, 4); ctx.fillStyle = col[2]; ctx.fillRect(o.x - 1, o.y - 18, 1, 1);
      return;
    }
  }
  if (!spr) return;
  ctx.drawImage(spr, Math.round(o.x - spr.width / 2 + sx + ox), Math.round(o.y - spr.height + oy));
}
function drawCanopyFade(ctx, list, p) {
  // redraw trees in front of the player semi-transparent so you can see yourself
  for (const it of list) {
    const o = it.o; if (!o || o.kind !== 'tree' || o.gone) continue;
    if (o.y > p.y && Math.abs(o.x - p.x) < 12 && o.y - p.y < 26) {
      const spr = S.tree(o.tree, o.variant || 0);
      // draw the player silhouette on top
      ctx.globalAlpha = 0.45; drawPlayer(ctx, p, G.time, true); ctx.globalAlpha = 1;
      break;
    }
  }
}
function drawSword(ctx, p, a, tool) {
  const S2 = SWORDS[p.sword];
  ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y - 6)); ctx.rotate(a);
  if (tool === 'axe' || tool === 'pick') {
    ctx.fillStyle = '#5c3a21'; ctx.fillRect(4, -1, 10, 2);
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(11, -5, 4, 9); ctx.fillStyle = tool === 'axe' ? ['#566c86', '#94b0c2', '#f4f4f4'][p.axe] : ['#c98a4b', '#c98a4b', '#94b0c2'][p.pick]; ctx.fillRect(12, -4, 2, 7);
  } else if (p.sword === 0) {
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(6, -3, 5, 5); ctx.fillStyle = '#f6c89f'; ctx.fillRect(7, -2, 3, 3);
  } else {
    const len = S2.reach - 3;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(3, -2, len + 1, 4); ctx.fillRect(4, -4, 2, 8);
    ctx.fillStyle = S2.col; ctx.fillRect(6, -1, len - 3, 2); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(6, -1, len - 3, 1);
    ctx.fillStyle = '#f5b83d'; ctx.fillRect(5, -3, 1, 6);
    if (p.sword === 4) { ctx.fillStyle = '#8a4bd6'; ctx.fillRect(8, 0, len - 6, 1); }
  }
  ctx.restore();
}
export function drawPlayer(ctx, p, t, ghost) {
  if (p.iT > 0 && p.rollT <= 0 && Math.floor(t * 20) % 2 === 0 && !ghost) return;
  const moving = Math.abs(G.input?.mx || 0) + Math.abs(G.input?.my || 0) > 0.1;
  const frame = moving ? Math.floor(p.walkT * 8) % 2 : 0;
  const spr = S.knight(p.dir, frame, p.armor, p.shield);
  const bob = moving && frame ? -1 : 0;
  const X = Math.round(p.x - 8), Y = Math.round(p.y - 15 + bob);
  // swing arc
  const swinging = p.atkT > 0;
  let swingA = null;
  if (swinging) {
    const prog = 1 - p.atkT / p.atkDur, fin = p.combo === 3 && p.swingTool === 'sword';
    const span = fin ? 3.4 : 2.2, dirSign = p.combo === 2 ? -1 : 1;
    swingA = p.aim + dirSign * (-span / 2 + span * Math.min(1, prog * 1.4));
    if (p.swingTool === 'sword' && p.sword > 0 && prog < 0.8) {
      const S2 = SWORDS[p.sword], rr = S2.reach + (fin ? 5 : 0);
      ctx.save(); ctx.translate(p.x, p.y - 6); ctx.globalAlpha = 0.65 * (1 - prog);
      ctx.strokeStyle = fin ? '#ffcd75' : '#f4f4f4'; ctx.lineWidth = fin ? 4 : 3;
      ctx.beginPath(); const a0 = p.aim - dirSign * span / 2, a1 = swingA; ctx.arc(0, 0, rr - 2, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  const behind = p.dir === 'up' || (swingA != null && Math.sin(swingA) < -0.3);
  if (swinging && behind && !ghost) drawSword(ctx, p, swingA, p.swingTool);
  if (p.rollT > 0) {
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y - 7)); ctx.rotate((0.3 - p.rollT) / 0.3 * Math.PI * 2 * (p.rdx < 0 ? -1 : 1)); ctx.drawImage(spr, -8, -8); ctx.restore();
  } else {
    ctx.drawImage(p.hurtT > 0 ? S.tintOf(spr, '#ff8090') : spr, X, Y);
  }
  if (swinging && !behind && !ghost) drawSword(ctx, p, swingA, p.swingTool);
  if (!swinging && p.rollT <= 0 && p.sword > 0 && !ghost) {
    // sheathed sword at the hip
    const side = p.dir === 'left' ? 1 : -1;
    if (p.dir !== 'up') { ctx.fillStyle = '#1a1c2c'; ctx.fillRect(Math.round(p.x + side * 6) - 1, Y + 8, 3, 7); ctx.fillStyle = SWORDS[p.sword].col; ctx.fillRect(Math.round(p.x + side * 6), Y + 9, 1, 5); ctx.fillStyle = '#f5b83d'; ctx.fillRect(Math.round(p.x + side * 6) - 1, Y + 8, 3, 1); }
  }
}
function drawEnemy(ctx, e, t) {
  if (e.hidden) { ctx.globalAlpha = 0.25; }
  let spr; const f = Math.floor(e.anim * 5) % 2;
  switch (e.type) {
    case 'slime': case 'bslime': case 'bigslime': case 'sslime': spr = S.slime(e.state === 'hop' ? 0 : (Math.floor(e.anim * 3) % 2), e.def_.kind); break;
    case 'zombie': spr = S.zombie(e.dir === 'up' ? 'down' : e.dir, f); break;
    case 'skeleton': spr = S.skeleton(e.dir === 'up' ? 'down' : e.dir, f); break;
    case 'bat': spr = S.bat(Math.floor(e.anim * 10) % 2); break;
    case 'rockling': spr = S.rockling(!e.dormant, f); break;
    case 'hound': spr = S.houndCv(f, e.dir === 'left'); break;
    case 'wisp': spr = S.wisp(Math.floor(e.anim * 6) % 2); break;
    case 'sknight': case 'sentinel': spr = S.shadowKnight(e.dir, f); break;
  }
  const sc = e.scale || 1;
  const lift = e.fly ? 10 + Math.sin(e.anim * 3) * 2 : 0;
  let sx = 0; if (e.tele > 0) sx = Math.round(Math.sin(t * 60));
  const W = spr.width * sc, H = spr.height * sc;
  const X = Math.round(e.x - W / 2 + sx), Y = Math.round(e.y - H + 1 - lift);
  const img = e.flash > 0 ? S.whiteOf(spr) : (e.tele > 0 && Math.floor(t * 16) % 2 ? S.tintOf(spr, '#ff7080') : spr);
  if (e.def_.shadow) { ctx.globalAlpha *= 0.35; ctx.fillStyle = '#8a4bd6'; ctx.beginPath(); ctx.ellipse(e.x, e.y - H / 2 - lift, W * 0.6, H * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = e.hidden ? 0.25 : 1; }
  ctx.drawImage(img, X, Y, W, H);
  if (e.tele > 0) { ctx.fillStyle = '#1a1c2c'; ctx.fillRect(Math.round(e.x) - 2, Y - 9, 4, 8); ctx.fillStyle = '#ff5060'; ctx.fillRect(Math.round(e.x) - 1, Y - 8, 2, 4); ctx.fillRect(Math.round(e.x) - 1, Y - 3, 2, 1); }
  if (e.stagger > 0 && (e.type === 'sknight' || e.type === 'sentinel')) { ctx.fillStyle = '#73eff7'; for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; ctx.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(Y - 2 + Math.sin(a) * 2), 1, 1); } }
  ctx.globalAlpha = 1;
  // hp bar
  if (e.hp < e.maxHp && !e.dormant) {
    const bw = Math.max(12, Math.round(W * 0.9)); ctx.fillStyle = '#1a1c2c'; ctx.fillRect(Math.round(e.x - bw / 2) - 1, Y - 4, bw + 2, 3);
    ctx.fillStyle = e.def_.shadow ? '#8a4bd6' : '#b13e53'; ctx.fillRect(Math.round(e.x - bw / 2), Y - 3, Math.ceil(bw * e.hp / e.maxHp), 1);
  }
  if (e.type === 'sentinel') { ctx.fillStyle = '#e6b8ff'; ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3; ctx.fillRect(Math.round(e.x) - 1, Y - 8, 2, 2); ctx.globalAlpha = 1; }
}
function drawBoss(ctx, b, t) {
  if (b.hidden) return;
  const spr = S.boss(Math.floor(t * 3) % 2);
  const X = Math.round(b.x - spr.width / 2), Y = Math.round(b.y - spr.height + 2 - b.z);
  // aura
  ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.1; ctx.fillStyle = b.phase === 3 ? '#b13e53' : '#8a4bd6';
  ctx.beginPath(); ctx.ellipse(b.x, b.y - 18 - b.z, 26, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  let img = spr; if (b.flash > 0) img = S.whiteOf(spr); else if (b.tele > 0 && Math.floor(t * 14) % 2) img = S.tintOf(spr, '#ff7080');
  if (b.state === 'dead') { ctx.globalAlpha = Math.max(0, b.t / 3); }
  ctx.drawImage(img, X, Y);
  ctx.globalAlpha = 1;
  if (b.stagger > 0) { ctx.fillStyle = '#73eff7'; for (let i = 0; i < 4; i++) { const a = t * 5 + i * 1.57; ctx.fillRect(Math.round(b.x + Math.cos(a) * 12), Math.round(Y - 2 + Math.sin(a) * 3), 2, 2); } }
}
function drawDrop(ctx, d, t) {
  const ic = S.icon(d.kind === 'coin' ? 'coin' : d.kind);
  const bob = d.z > 0 ? 0 : Math.round(Math.sin(t * 5 + d.x) * 1);
  const s = d.kind === 'coin' ? 8 : 10;
  ctx.drawImage(ic, Math.round(d.x - s / 2), Math.round(d.y - s - d.z + bob), s, s);
}
function drawProj(ctx, q, t) {
  ctx.save(); ctx.translate(Math.round(q.x), Math.round(q.y));
  if (q.kind === 'arrow') { ctx.rotate(Math.atan2(q.vy, q.vx)); ctx.fillStyle = '#1a1c2c'; ctx.fillRect(-6, -1, 12, 3); ctx.fillStyle = '#c98a4b'; ctx.fillRect(-5, 0, 9, 1); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(4, -1, 3, 3); ctx.fillRect(-6, -1, 2, 1); }
  else if (q.kind === 'bone') { ctx.rotate(q.rot); ctx.fillStyle = '#1a1c2c'; ctx.fillRect(-5, -2, 10, 4); ctx.fillStyle = '#eee6c8'; ctx.fillRect(-4, -1, 8, 2); ctx.fillRect(-5, -2, 2, 1); ctx.fillRect(3, 1, 2, 1); }
  else { const s = 2 + Math.round(Math.sin(t * 20 + q.x) * 0.5 + 0.5); ctx.fillStyle = '#2b1740'; ctx.fillRect(-s - 1, -s - 1, s * 2 + 2, s * 2 + 2); ctx.fillStyle = '#8a4bd6'; ctx.fillRect(-s, -s, s * 2, s * 2); ctx.fillStyle = '#e6b8ff'; ctx.fillRect(-1, -1, 2, 2); }
  ctx.restore();
}
function drawLighting(ctx, cx, cy, vw, vh, t) {
  const p = G.player, w = G.world;
  const d = G.day;
  // 0 day .. 1 night
  let dark = 0;
  if (d > 0.62 && d < 0.7) dark = (d - 0.62) / 0.08; else if (d >= 0.7 && d < 0.95) dark = 1; else if (d >= 0.95) dark = 1 - (d - 0.95) / 0.05;
  const z = w.zoneAt(p.x, p.y), inCastle = (z === Z.CASTLE || z === Z.THRONE || (Math.hypot(p.x / TS - 80, p.y / TS - 80) < 22));
  let shadowAmt = inCastle && !G.flags.bossDead ? 0.55 : 0;
  const amt = Math.max(dark * 0.62, shadowAmt);
  if (d > 0.58 && d < 0.66) { ctx.fillStyle = `rgba(239,125,87,${Math.sin((d - 0.58) / 0.08 * Math.PI) * 0.18})`; ctx.fillRect(0, 0, vw, vh); }
  if (amt <= 0.01) return;
  if (!light || light.width !== vw || light.height !== vh) { light = document.createElement('canvas'); light.width = vw; light.height = vh; }
  const l = light.getContext('2d');
  l.globalCompositeOperation = 'source-over'; l.clearRect(0, 0, vw, vh);
  l.fillStyle = shadowAmt > dark * 0.62 ? `rgba(30,10,50,${amt})` : `rgba(10,14,40,${amt})`; l.fillRect(0, 0, vw, vh);
  l.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => { const g = l.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); l.fillStyle = g; l.fillRect(x - r, y - r, r * 2, r * 2); };
  hole(p.x - cx, p.y - 8 - cy, 70 + Math.sin(t * 7) * 1.5);
  for (const o of w.nonSolid || []) if (o.kind === 'torch' && Math.abs(o.x - p.x) < vw && Math.abs(o.y - p.y) < vh) hole(o.x - cx, o.y - 18 - cy, 40 + Math.sin(t * 9 + o.x) * 2, 0.8);
  for (const q of G.projs) if (q.kind === 'orb') hole(q.x - cx, q.y - cy, 14, 0.6);
  if (G.boss && !G.boss.hidden) hole(G.boss.x - cx, G.boss.y - 20 - cy, 50, 0.7);
  // town lanterns
  for (const [x, y] of [[80, 128], [80, 111], [74, 132], [86, 132]]) hole(x * TS - cx, y * TS - cy, 60, 0.7);
  ctx.drawImage(light, 0, 0);
}
function drawObjectiveArrow(ctx, cx, cy, vw, vh, t) {
  if (G.state !== 'play') return;
  const o = objective(); const tg = objectiveTarget(o); if (!tg) return;
  const p = G.player; const sx = tg.x - cx, sy = tg.y - 10 - cy;
  if (sx > 8 && sx < vw - 8 && sy > 8 && sy < vh - 8) {
    // bouncing marker over the target
    const by = Math.round(sy - 24 + Math.sin(t * 5) * 2);
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(Math.round(sx) - 3, by - 1, 7, 5); ctx.fillRect(Math.round(sx) - 2, by + 4, 5, 2); ctx.fillRect(Math.round(sx) - 1, by + 6, 3, 1);
    ctx.fillStyle = '#ffcd75'; ctx.fillRect(Math.round(sx) - 2, by, 5, 4); ctx.fillRect(Math.round(sx) - 1, by + 4, 3, 1); ctx.fillRect(Math.round(sx), by + 5, 1, 1);
    return;
  }
  const a = Math.atan2(sy - vh / 2, sx - vw / 2);
  const r = Math.min(vw, vh) / 2 - 14;
  const ax = vw / 2 + Math.cos(a) * r, ay = vh / 2 + Math.sin(a) * r;
  ctx.save(); ctx.translate(Math.round(ax), Math.round(ay)); ctx.rotate(a);
  const pulse = Math.round(Math.sin(t * 6));
  ctx.fillStyle = '#1a1c2c'; ctx.beginPath(); ctx.moveTo(8 + pulse, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffcd75'; ctx.beginPath(); ctx.moveTo(6 + pulse, 0); ctx.lineTo(-3, -4); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- minimap ----------
let mini = null;
export function minimap(size) {
  const w = G.world;
  if (!mini) {
    mini = document.createElement('canvas'); mini.width = N; mini.height = N; const g = mini.getContext('2d');
    const col = { [T.DEEP]: '#29366f', [T.WATER]: '#3b5dc9', [T.SAND]: '#f2d39b', [T.GRASS]: '#5cc05a', [T.FOREST]: '#2c7d44', [T.PATH]: '#d4a86a', [T.HILL]: '#a3b86a', [T.GRAVE]: '#6f7f5a', [T.ISLE]: '#4b4660', [T.FLOOR]: '#56567a', [T.WALL]: '#1a1c2c', [T.TOWN]: '#e8dcc0', [T.GATE]: '#5c3a21' };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { g.fillStyle = col[w.t(x, y)]; g.fillRect(x, y, 1, 1); }
    for (const o of w.objs) if (o.kind === 'tree') { g.fillStyle = 'rgba(20,80,40,0.6)'; g.fillRect(o.tx, o.ty, 1, 1); }
  }
  return mini;
}
