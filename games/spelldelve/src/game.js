// Core gameplay: runs, floors, the wizard, spells, projectiles, pickups, rooms, shop, meta.
import * as THREE from '../vendor/three.module.js';
import { TS, rnd, rint, pick, shuffle, clamp, d2, angDiff, damp, lerp } from './util.js';
import { SPELLS, PRIMARIES, ACTIVES, spellStats, modLabel, MOD_MAX, MONSTERS, monsterPool, RELICS, LAST_FLOOR, META, START_SPELLS } from './data.js';
import { generateFloor, buildFloorMeshes, updateDoorMeshes, collide, solidTile, tileAt, los, flowField, T, WALL_H } from './dungeon.js';
import { makeWizard, makeMonsterModel, makeChest, makeBook, makeRelic, makeStairs, glowSprite } from './models.js';
import { sfx } from './audio.js';
import { G, C } from './state.js';
import { updateMonsters, monsterAnimate } from './monsters.js';

const SAVE_KEY = 'pd.spelldelve';
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ save / meta
export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  const d = { gold: 0, meta: {}, unlocked: ['fireball'], startSpell: 'fireball', bestFloor: 0, wins: 0, runs: 0, muted: false };
  G.save = Object.assign(d, s || {});
  if (!G.save.unlocked.includes('fireball')) G.save.unlocked.push('fireball');
  return G.save;
}
export function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* storage off */ } }
export function buyMeta(key) {
  const lvl = G.save.meta[key] || 0, def = META[key];
  if (lvl >= def.max) return false;
  const cost = def.cost(lvl);
  if (G.save.gold < cost) { sfx('deny'); return false; }
  G.save.gold -= cost; G.save.meta[key] = lvl + 1; persist(); sfx('buy');
  return true;
}
export function buyStartSpell(id) {
  if (G.save.unlocked.includes(id)) { G.save.startSpell = id; persist(); sfx('click'); return true; }
  const cost = START_SPELLS[id];
  if (G.save.gold < cost) { sfx('deny'); return false; }
  G.save.gold -= cost; G.save.unlocked.push(id); G.save.startSpell = id; persist(); sfx('buy');
  return true;
}

// ------------------------------------------------------------------ helpers
export const has = (r) => G.P && G.P.relics.has(r);
export function xpFor(l) { return Math.floor(20 + l * 12 + l * l * 3); }
export function shakeIt(a) { G.shake = Math.max(G.shake, a); }
export function hitStop(t) { G.hitstop = Math.max(G.hitstop, t); }
export function schedule(t, fn) { G.timers.push({ t, fn }); }
function emitColor(hex) { return hex; }

export function recalc() {
  const P = G.P, m = G.save.meta, sp = G.run.statPicks;
  const prevMax = P.maxHp || 0;
  P.maxHp = Math.round((100 + 12 * (m.vitality || 0) + 20 * sp.hp + (has('heartstone') ? 30 : 0)) * (has('glass') ? 0.8 : 1));
  P.maxMana = 100 + 15 * (m.wellspring || 0) + 20 * sp.mana;
  P.regen = 9 * (1 + 0.12 * (m.flow || 0)) * (1 + 0.2 * sp.regen);
  P.speed = 6.4 * (1 + 0.08 * sp.speed) * (has('boots') ? 1.15 : 1);
  P.dmgMul = (1 + 0.1 * sp.power) * (has('glass') ? 1.35 : 1);
  P.cdMul = Math.pow(0.92, sp.haste) * (has('hourglass') ? 0.85 : 1);
  P.manaMul = has('prism') ? 0.75 : 1;
  P.goldMul = has('coin') ? 1.4 : 1;
  P.xpMul = 1 + 0.1 * (m.wisdom || 0);
  P.dashCdMax = has('boots') ? 0.75 : 1.15;
  if (prevMax && P.maxHp > prevMax) P.hp += P.maxHp - prevMax;
  P.hp = Math.min(P.hp, P.maxHp); P.mana = Math.min(P.mana, P.maxMana);
}
export function statsOf(id) { return spellStats(id, (G.P.spells[id] || { mods: {} }).mods, G.P); }

// ------------------------------------------------------------------ run flow
export function newRun(opts = {}) {
  const meta = G.save.meta;
  clearFloorEntities();
  G.run = { floorNum: 0, kills: 0, time: 0, goldEarned: 0, statPicks: { hp: 0, mana: 0, regen: 0, speed: 0, power: 0, haste: 0 },
    rerolls: meta.reroll || 0, seed: opts.seed ?? ((Math.random() * 1e9) | 0), elitesKilled: 0, booksRead: 0 };
  const start = opts.startSpell || G.save.startSpell || 'fireball';
  if (!G.P) {
    const model = makeWizard();
    C.scene.add(model.root);
    G.P = { model };
  }
  const P = G.P;
  Object.assign(P, { x: 0, z: 0, vx: 0, vz: 0, r: 0.45, level: 1, xp: 0, xpNext: xpFor(1), gold: 25 * (meta.purse || 0),
    relics: new Set(), spells: { bolt: { mods: {} }, [start]: { mods: {} } }, slots: ['bolt', start, null, null, null], cds: {},
    dashT: 0, dashCd: 0, dashX: 0, dashZ: 1, iframes: 0, shield: 0, shieldT: 0, phoenixUsed: false, primaryCount: 0,
    frostwardCd: 0, face: Math.PI, aimX: 0, aimZ: -5, dead: false, slowT: 0, castAnim: 0, maxHp: 0, hp: 1, mana: 0, moving: 0 });
  P.model.root.visible = true;
  recalc(); P.hp = P.maxHp; P.mana = P.maxMana;
  G.pendingLevels = 0; G.modalQueue.length = 0; G.modalOpen = false;
  if (!opts.backdrop) { G.save.runs++; persist(); }
  enterFloor(opts.floor || 1);
  G.mode = 'play'; G.baseMode = 'play';
  C.ui.hideAll(); C.ui.showHud(true);
}

function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose?.();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose?.());
  });
}

export function clearFloorEntities() {
  for (const d of G.dying) C.scene.remove(d.m.model.root);
  G.dying.length = 0;
  for (const m of G.monsters) { C.scene.remove(m.model.root); if (m.model.bar) C.scene.remove(m.model.bar); }
  for (const p of G.projs) C.scene.remove(p.mesh);
  for (const p of G.eprojs) C.scene.remove(p.mesh);
  for (const p of G.pickups) C.scene.remove(p.mesh);
  for (const z of G.zones) if (z.mesh) C.scene.remove(z.mesh);
  for (const s of G.summons) C.scene.remove(s.mesh);
  for (const c of G.chests) C.scene.remove(c.model.root);
  if (G.stairs) C.scene.remove(G.stairs.model.root);
  G.monsters.length = 0; G.projs.length = 0; G.eprojs.length = 0; G.pickups.length = 0; G.zones.length = 0;
  G.summons.length = 0; G.chests.length = 0; G.timers.length = 0; G.hazards.length = 0; G.stairs = null; G.boss = null;
  C.ground.clear(); C.fx.clear(); C.dmg.clear();
  if (G.M) { C.scene.remove(G.M.group); disposeTree(G.M.group); G.M = null; }
}

export function enterFloor(n) {
  clearFloorEntities();
  G.run.floorNum = n;
  const F = generateFloor(n, G.run.seed + n * 7919);
  G.F = F;
  G.M = buildFloorMeshes(F, C.TEX);
  C.scene.add(G.M.group);
  updateDoorMeshes(F, G.M);
  const P = G.P;
  P.x = F.start.x; P.z = F.start.z; P.vx = P.vz = 0;
  G.explored = new Uint8Array(F.W * F.H);
  G.room = 0;
  for (const r of F.rooms) {
    if (r.type !== 'treasure') continue;
    if (n >= 2 && Math.random() < 0.28) spawnMonster('mimic', r.cx, r.cz, { state: 'disguised', instant: true, room: -1 });
    else spawnChest(r.cx, r.cz);
  }
  for (const w of G.M.wallData) w.s = 1;
  G.flow = null; G.flowT = 0;
  G.save.bestFloor = Math.max(G.save.bestFloor, n); persist();
  const title = F.final ? 'The Hollow Throne' : `Floor ${n}`;
  C.ui.banner(title, F.final ? 'Final floor' : F.bossKey ? `${MONSTERS[F.bossKey].name} waits below` : `of ${LAST_FLOOR - 1}, then the throne`);
  C.ui.bossBar(null);
}

export function descend() {
  sfx('stairs');
  const n = G.run.floorNum;
  if (n >= LAST_FLOOR) return;
  G.mode = 'shop'; G.baseMode = 'shop';
  G.shop = makeShop(n);
  C.ui.showHud(false);
  C.ui.showShop();
}
export function leaveShop() {
  G.mode = 'play'; G.baseMode = 'play';
  C.ui.hideShop();
  C.ui.showHud(true);
  enterFloor(G.run.floorNum + 1);
}

export function playerDied() {
  const P = G.P;
  if (has('phoenix') && !P.phoenixUsed) {
    P.phoenixUsed = true; P.hp = Math.round(P.maxHp * 0.5); P.iframes = 2.5;
    C.ui.toast('The Phoenix Feather burns - you rise again!', '#ffb050');
    castSpell('nova', { ...statsOf('nova'), dmg: 40, area: 7, dur: 2 }, P.x, P.z, true);
    sfx('relic'); shakeIt(0.8);
    return;
  }
  P.dead = true; P.hp = 0;
  sfx('death'); shakeIt(1); hitStop(0.25);
  C.fx.burst(P.x, 1, P.z, 0xb48cff, 60, 9, 0.6, 1.0, { grav: 4 });
  P.model.root.visible = false;
  G.deathT = 1.6;
}
function finishRun(won) {
  const P = G.P;
  const bank = Math.round(P.gold + (won ? 300 : 0));
  G.save.gold += bank;
  if (won) G.save.wins++;
  persist();
  G.lastRun = { won, floor: G.run.floorNum, level: P.level, kills: G.run.kills, time: G.run.time, banked: bank, spells: Object.keys(P.spells), relics: [...P.relics] };
  G.mode = won ? 'victory' : 'dead';
  C.ui.showHud(false);
  C.ui.showEnd(G.lastRun);
}

// ------------------------------------------------------------------ modals
export function openModal(fn) {
  G.modalQueue.push(fn);
  if (!G.modalOpen) nextModal();
}
function nextModal() {
  const fn = G.modalQueue.shift();
  if (!fn) {
    G.modalOpen = false; G.modalApi = null;
    if (G.mode === 'modal') G.mode = G.baseMode;
    C.ui.closeModal();
    return;
  }
  G.modalOpen = true;
  if (G.mode === 'play' || G.mode === 'shop') G.mode = 'modal';
  fn(() => nextModal());
}

export function learnSpell(id) {
  const P = G.P;
  if (!P.spells[id]) P.spells[id] = { mods: {} };
  G.run.booksRead++;
}
export function equip(id, slot) {
  const P = G.P;
  const kind = SPELLS[id].kind;
  if (kind === 'primary') slot = 0;
  else if (slot < 1 || slot > 4) return;
  const prev = P.slots.indexOf(id);
  if (prev >= 0 && prev !== slot) P.slots[prev] = P.slots[slot] && SPELLS[P.slots[slot]].kind === kind ? P.slots[slot] : null;
  P.slots[slot] = id;
}
export function openBook(id) {
  sfx('book');
  learnSpell(id);
  openModal((close) => {
    const P = G.P;
    const s = SPELLS[id];
    const opts = s.kind === 'primary' ? [0, -1] : [1, 2, 3, 4, -1];
    G.modalApi = { kind: 'book', spell: id, options: opts, choose: (slot) => { if (slot >= 0) equip(id, slot); sfx('click'); close(); } };
    C.ui.showBook(id);
  });
}
export function openTome() {
  sfx('book');
  const choices = buildChoices(3, true);
  if (!choices.length) { G.P.gold += 40; C.ui.toast('The tome crumbles... +40 gold'); return; }
  openModal((close) => {
    G.modalApi = { kind: 'tome', options: choices, choose: (i) => { applyChoice(choices[i]); sfx('levelup'); close(); } };
    C.ui.showChoices('Tome of Empowerment', 'Choose one spell to empower', choices, false);
  });
}
function openLevelUp() {
  G.pendingLevels--;
  sfx('levelup');
  openModal((close) => {
    let choices = buildChoices(3, false);
    const api = {
      kind: 'levelup', options: choices,
      choose: (i) => { const c = api.options[i]; close(); applyChoice(c); },
      reroll: () => {
        if (G.run.rerolls <= 0) return;
        G.run.rerolls--; api.options = buildChoices(3, false); sfx('click');
        C.ui.showChoices(`Level ${G.P.level}!`, 'Choose an upgrade', api.options, true);
      },
    };
    G.modalApi = api;
    C.ui.showChoices(`Level ${G.P.level}!`, 'Choose an upgrade', choices, true);
  });
}
const STAT_OPTS = {
  hp: { label: '+20 max HP', sub: 'and heal 20', glyph: '❤', color: '#ff6a6a' },
  mana: { label: '+20 max mana', sub: 'a deeper well', glyph: '◆', color: '#6ab0ff' },
  regen: { label: '+20% mana regen', sub: 'cast more often', glyph: '≈', color: '#6ae0ff' },
  speed: { label: '+8% move speed', sub: 'lighter feet', glyph: '»', color: '#a0ffa0' },
  power: { label: '+10% spell damage', sub: 'all spells', glyph: '✶', color: '#ffb050' },
  haste: { label: '-8% cooldowns', sub: 'all spells', glyph: '⧗', color: '#d0a0ff' },
};
export function buildChoices(n, spellOnly) {
  const P = G.P;
  const pool = [];
  const known = Object.keys(P.spells);
  for (const id of known) {
    const equipped = P.slots.includes(id);
    for (const mod of SPELLS[id].mods) {
      const c = P.spells[id].mods[mod] || 0;
      if (c >= MOD_MAX) continue;
      pool.push({ w: equipped ? 3 : 0.6, type: 'mod', spell: id, mod, label: `${SPELLS[id].name}`, sub: modLabel(id, mod) + (c ? `  (lv ${c + 1})` : ''), glyph: SPELLS[id].glyph, color: hexCss(SPELLS[id].hex) });
    }
  }
  if (!spellOnly) {
    for (const k of Object.keys(STAT_OPTS)) pool.push({ w: 1.2, type: 'stat', stat: k, ...STAT_OPTS[k] });
    const unknown = ACTIVES.concat(PRIMARIES).filter((id) => !P.spells[id]);
    if (unknown.length) { const id = pick(unknown); pool.push({ w: 1.5, type: 'learn', spell: id, label: `Learn ${SPELLS[id].name}`, sub: SPELLS[id].desc, glyph: SPELLS[id].glyph, color: hexCss(SPELLS[id].hex) }); }
  }
  const out = [];
  while (out.length < n && pool.length) {
    let tot = 0; for (const p of pool) tot += p.w;
    let r = Math.random() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    const c = pool.splice(k, 1)[0];
    if (out.some((o) => o.type === 'mod' && c.type === 'mod' && o.spell === c.spell && o.mod === c.mod)) continue;
    out.push(c);
  }
  return out;
}
export function applyChoice(c) {
  const P = G.P;
  if (!c) return;
  if (c.type === 'mod') P.spells[c.spell].mods[c.mod] = (P.spells[c.spell].mods[c.mod] || 0) + 1;
  else if (c.type === 'stat') { G.run.statPicks[c.stat]++; recalc(); if (c.stat === 'hp') P.hp = Math.min(P.maxHp, P.hp + 20); if (c.stat === 'mana') P.mana += 20; }
  else if (c.type === 'learn') openBook(c.spell);
}
export const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');

export function gainRelic(id) {
  const P = G.P;
  P.relics.add(id); recalc();
  if (id === 'heartstone') P.hp = Math.min(P.maxHp, P.hp + 30);
  sfx('relic');
  C.ui.toast(`${RELICS[id].name}: ${RELICS[id].desc}`, '#ffd36b', 4);
}
function unknownSpell() {
  const u = ACTIVES.concat(ACTIVES, PRIMARIES).filter((id) => !G.P.spells[id]);
  return u.length ? pick(u) : null;
}
function unownedRelic() {
  const u = Object.keys(RELICS).filter((k) => !G.P.relics.has(k));
  return u.length ? pick(u) : null;
}

// ------------------------------------------------------------------ shop
function makeShop(n) {
  const items = [];
  const taken = new Set();
  for (let i = 0; i < 3; i++) {
    const u = ACTIVES.concat(PRIMARIES).filter((id) => !G.P.spells[id] && !taken.has(id));
    if (!u.length) break;
    const id = pick(u); taken.add(id);
    items.push({ kind: 'book', spell: id, price: 50 + n * 9, name: `Spellbook: ${SPELLS[id].name}`, desc: SPELLS[id].desc, glyph: SPELLS[id].glyph, color: hexCss(SPELLS[id].hex) });
  }
  items.push({ kind: 'tome', price: 40 + n * 6, name: 'Tome of Empowerment', desc: 'Upgrade one of your spells.', glyph: '✚', color: '#ffd36b' });
  const r = unownedRelic();
  if (r) items.push({ kind: 'relic', relic: r, price: 110 + n * 14, name: RELICS[r].name, desc: RELICS[r].desc, glyph: RELICS[r].glyph, color: '#ffb050' });
  items.push({ kind: 'potion', price: 25 + n * 2, name: 'Healing Draught', desc: 'Restore 60% of your HP.', glyph: '♥', color: '#ff6a6a' });
  items.push({ kind: 'vigor', price: 45 + n * 5, name: 'Vigor Elixir', desc: '+15 max HP for this run.', glyph: '❤', color: '#ff9a9a' });
  return { items, sold: new Set() };
}
export function buyShop(i) {
  const it = G.shop.items[i];
  const P = G.P;
  if (!it || G.shop.sold.has(i)) return false;
  if (P.gold < it.price) { sfx('deny'); return false; }
  P.gold -= it.price; G.shop.sold.add(i); sfx('buy');
  if (it.kind === 'book') openBook(it.spell);
  else if (it.kind === 'tome') openTome();
  else if (it.kind === 'relic') gainRelic(it.relic);
  else if (it.kind === 'potion') P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.6);
  else if (it.kind === 'vigor') { G.run.statPicks.hp += 0.75; recalc(); }
  C.ui.showShop();
  return true;
}

// ------------------------------------------------------------------ the wizard
export function hurtPlayer(dmg, sx, sz, o = {}) {
  const P = G.P;
  if (P.dead || G.mode !== 'play') return false;
  if (P.iframes > 0 || P.dashT > 0) return false;
  dmg = Math.round(dmg);
  if (P.shield > 0) {
    const a = Math.min(P.shield, dmg); P.shield -= a; dmg -= a;
    C.fx.burst(P.x, 1, P.z, 0x7fb2ff, 14, 6, 0.4, 0.4);
    if (dmg <= 0) { sfx('hit'); P.iframes = 0.25; return true; }
  }
  P.hp -= dmg; P.iframes = 0.65;
  if (G.dmgLog) G.dmgLog.push([G.run.floorNum, dmg, G.boss ? 1 : 0, G.dmgWhy ? (new Error().stack.split('\n')[2] || '').replace(/.*\/src\//, '').replace(/:\d+\)?$/, '') : '']); // test-only damage log
  if (o.slow) P.slowT = Math.max(P.slowT, o.slow);
  sfx('hurt'); shakeIt(0.45); hitStop(0.05);
  C.dmg.add(P.x, 1.8, P.z, '-' + dmg, 'hurt');
  C.ui.hurtFlash();
  C.fx.burst(P.x, 1, P.z, 0xff3a3a, 16, 6, 0.35, 0.4, { grav: 6 });
  if (sx != null) { const dx = P.x - sx, dz = P.z - sz, d = Math.hypot(dx, dz) || 1; P.vx += (dx / d) * 8; P.vz += (dz / d) * 8; }
  if (has('frostward') && P.frostwardCd <= 0) { P.frostwardCd = 5; castSpell('nova', statsOf('nova'), P.x, P.z, true); }
  if (P.hp <= 0) playerDied();
  return true;
}

function updatePlayer(dt) {
  const P = G.P, inp = G.input, F = G.F;
  if (P.dead) return;
  P.mana = Math.min(P.maxMana, P.mana + P.regen * dt);
  if (has('heartstone')) P.hp = Math.min(P.maxHp, P.hp + dt);
  P.iframes -= dt; P.dashCd -= dt; P.frostwardCd -= dt; P.slowT -= dt; P.castAnim -= dt;
  if (P.shieldT > 0) { P.shieldT -= dt; if (P.shieldT <= 0) P.shield = 0; }
  for (const k in P.cds) P.cds[k] -= dt;

  let mx = inp.mx, mz = inp.mz;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  // aim
  let ax = inp.aimX, az = inp.aimZ;
  if (inp.autoAim) {
    const t = nearestMonster(P.x, P.z, 16, true);
    if (t) { ax = t.x; az = t.z; }
    else if (ml > 0.2) { ax = P.x + mx * 6; az = P.z + mz * 6; }
    else { ax = P.x + Math.sin(P.face) * 6; az = P.z + Math.cos(P.face) * 6; }
  }
  P.aimX = ax; P.aimZ = az;
  // dash
  if (inp.dash && P.dashCd <= 0) {
    let dx = mx, dz = mz;
    if (Math.hypot(dx, dz) < 0.2) { dx = ax - P.x; dz = az - P.z; }
    const dl = Math.hypot(dx, dz) || 1;
    P.dashX = dx / dl; P.dashZ = dz / dl; P.dashT = 0.17; P.dashCd = P.dashCdMax; P.iframes = Math.max(P.iframes, 0.28);
    sfx('dash');
    C.fx.burst(P.x, 0.6, P.z, 0xb48cff, 18, 5, 0.5, 0.35);
  }
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vx = P.dashX * 23; P.vz = P.dashZ * 23;
    C.fx.emit(P.x + rnd(-0.3, 0.3), 0.4 + Math.random() * 1.2, P.z + rnd(-0.3, 0.3), 0, 0.5, 0, 0x9a7bff, 0.7, 0.35);
  } else {
    const sp = P.speed * (P.slowT > 0 ? 0.55 : 1) * (P.castAnim > 0 && false ? 0.8 : 1);
    P.vx = damp(P.vx, mx * sp, 16, dt); P.vz = damp(P.vz, mz * sp, 16, dt);
  }
  P.x += P.vx * dt; P.z += P.vz * dt;
  collide(F, P, P.r);
  P.moving = Math.hypot(P.vx, P.vz);
  P.face = Math.atan2(ax - P.x, az - P.z);

  // casting
  if (inp.fire) tryCast(0);
  for (let i = 0; i < 4; i++) if (inp.cast[i]) tryCast(i + 1);

  // explored mask for minimap
  const tx = Math.floor(P.x / TS), ty = Math.floor(P.z / TS);
  for (let y = ty - 5; y <= ty + 5; y++) for (let x = tx - 6; x <= tx + 6; x++) if (x >= 0 && y >= 0 && x < F.W && y < F.H) G.explored[y * F.W + x] = 1;
}

export function tryCast(slot) {
  const P = G.P;
  const id = P.slots[slot];
  if (!id || P.dead) return false;
  if ((P.cds[id] || 0) > 0) return false;
  const st = statsOf(id);
  const cost = st.mana * P.manaMul;
  if (P.mana < cost) { if (slot > 0) { sfx('deny'); C.ui.slotDenied(slot); } return false; }
  P.mana -= cost;
  P.cds[id] = st.cd;
  P.castAnim = 0.22;
  castSpell(id, st, P.aimX, P.aimZ);
  if (slot > 0 && has('echo') && Math.random() < 0.25) schedule(0.25, () => { if (!P.dead) castSpell(id, st, P.aimX, P.aimZ); C.fx.burst(P.x, 1.5, P.z, 0xc6a0ff, 10, 3, 0.4, 0.3); });
  if (slot === 0) {
    P.primaryCount++;
    if (has('crown') && P.primaryCount % 6 === 0) castSpell('chain', statsOf('chain'), P.aimX, P.aimZ, true);
  }
  return true;
}

// ------------------------------------------------------------------ spells
const PROJ_LOOK = {
  bolt: { size: 0.16, glow: 1.3 }, spark: { size: 0.1, glow: 0.8 }, shard: { size: 0.13, glow: 1.0 }, fire: { size: 0.32, glow: 2.6 },
  lance: { size: 0.14, glow: 1.4, stretch: 3.5 }, missile: { size: 0.13, glow: 1.2 }, fam: { size: 0.1, glow: 0.9 },
};
const projGeo = new THREE.SphereGeometry(1, 16, 12); projGeo.userData.shared = true;
const projMats = {};
function projMesh(kind, hex) {
  const look = PROJ_LOOK[kind];
  const key = kind + hex;
  if (!projMats[key]) projMats[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.55) });
  const g = new THREE.Group();
  const core = new THREE.Mesh(projGeo, projMats[key]); core.scale.setScalar(look.size);
  if (look.stretch) core.scale.z = look.size * look.stretch;
  g.add(core);
  g.add(glowSprite(hex, look.glow, 0.95));
  C.scene.add(g);
  return g;
}
function spawnProj(o) {
  const p = Object.assign({ y: 1.0, r: 0.25, life: 1, pierce: 0, bounce: 0, hit: new Set(), home: 0, area: 0 }, o);
  p.mesh = projMesh(p.kind, p.hex);
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
  G.projs.push(p);
  return p;
}

export function castSpell(id, st, ax, az, free = false) {
  const P = G.P, s = SPELLS[id];
  const dx = ax - P.x, dz = az - P.z, dl = Math.hypot(dx, dz) || 1;
  const ux = dx / dl, uz = dz / dl;
  const ang = Math.atan2(ux, uz);
  const ox = P.x + ux * 0.6, oz = P.z + uz * 0.6;
  const hex = s.hex;
  const fan = (n, spread, fn) => { for (let i = 0; i < n; i++) { const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0); fn(Math.sin(a), Math.cos(a), i); } };
  switch (id) {
    case 'bolt':
      fan(st.count, 0.14 * (st.count - 1), (sx, sz) => spawnProj({ kind: 'bolt', hex, x: ox, z: oz, vx: sx * s.speed, vz: sz * s.speed, dmg: st.dmg, life: s.life, pierce: st.pierce, bounce: st.bounce }));
      sfx('bolt'); break;
    case 'scatter':
      for (let i = 0; i < st.count; i++) {
        const a = ang + rnd(-0.32, 0.32), sp = s.speed * rnd(0.8, 1.15);
        spawnProj({ kind: 'spark', hex, x: ox, z: oz, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg: st.dmg, life: s.life * rnd(0.8, 1.1), pierce: st.pierce, r: 0.22 });
      }
      sfx('scatter'); break;
    case 'shard':
      fan(st.count, 0.12 * (st.count - 1), (sx, sz) => spawnProj({ kind: 'shard', hex, x: ox, z: oz, vx: sx * s.speed, vz: sz * s.speed, dmg: st.dmg, life: s.life, pierce: st.pierce, slow: 2 }));
      sfx('shard'); break;
    case 'fireball':
      fan(st.count, 0.2 * (st.count - 1), (sx, sz) => spawnProj({ kind: 'fire', hex, x: ox, z: oz, vx: sx * s.speed, vz: sz * s.speed, dmg: st.dmg, life: 1.4, area: st.area, bounce: st.bounce, r: 0.35 }));
      sfx('fireball'); break;
    case 'lance':
      fan(st.count, 0.1 * (st.count - 1), (sx, sz) => spawnProj({ kind: 'lance', hex, x: ox, z: oz, vx: sx * s.speed, vz: sz * s.speed, dmg: st.dmg, life: 0.9, pierce: 99, r: 0.3, lance: true }));
      sfx('lance'); break;
    case 'missiles': {
      const targets = monstersNear(P.x, P.z, 18).sort((a, b) => d2(a.x, a.z, P.x, P.z) - d2(b.x, b.z, P.x, P.z));
      for (let i = 0; i < st.count; i++) {
        const a = ang + rnd(-1.6, 1.6), sp = 9;
        const t = targets.length ? targets[i % targets.length] : null;
        schedule(i * 0.05, () => spawnProj({ kind: 'missile', hex, x: P.x, z: P.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg: st.dmg, life: 2.4, home: 1, target: t, speed: 17, r: 0.25 }));
      }
      sfx('missile'); break;
    }
    case 'nova': {
      const r = st.area;
      C.ground.ring(P.x, P.z, r * 1.15, hex, 0.5);
      C.flash.flash(P.x, 1.5, P.z, hex, 6, r * 2.5, 0.35);
      for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2; C.fx.emit(P.x + Math.sin(a) * 0.6, 0.5 + Math.random(), P.z + Math.cos(a) * 0.6, Math.sin(a) * r * 3.2, rnd(0, 2), Math.cos(a) * r * 3.2, i % 3 ? hex : 0xffffff, 0.6, 0.45, { drag: 4 }); }
      for (const m of monstersNear(P.x, P.z, r)) { damage(m, st.dmg, { hex, kx: m.x - P.x, kz: m.z - P.z, freeze: st.dur }); }
      sfx('nova'); shakeIt(0.25); break;
    }
    case 'chain': {
      let src = { x: P.x, z: P.z };
      const hitSet = new Set();
      let first = null, best = 1e9;
      for (const m of liveMonsters()) {
        const dd = Math.hypot(m.x - P.x, m.z - P.z);
        if (dd > s.range) continue;
        const ad = Math.abs(angDiff(ang, Math.atan2(m.x - P.x, m.z - P.z)));
        const score = dd + ad * 6;
        if (ad < 1.2 && score < best && los(G.F, P.x, P.z, m.x, m.z)) { best = score; first = m; }
      }
      let cur = first, dmg = st.dmg;
      if (!cur) { lightning(P.x, P.z, P.x + ux * 5, P.z + uz * 5, hex); }
      for (let k = 0; cur && k <= st.chain; k++) {
        lightning(src.x, src.z, cur.x, cur.z, hex);
        hitSet.add(cur);
        damage(cur, dmg, { hex, stun: 0.15 });
        src = cur; dmg *= 0.92;
        let nxt = null, nb = 7 * 7;
        for (const m of liveMonsters()) { if (hitSet.has(m)) continue; const q = d2(m.x, m.z, src.x, src.z); if (q < nb) { nb = q; nxt = m; } }
        cur = nxt;
      }
      C.flash.flash(P.x + ux * 2, 1.5, P.z + uz * 2, hex, 5, 12, 0.18);
      sfx('zap'); shakeIt(0.12); break;
    }
    case 'meteor':
      for (let i = 0; i < st.count; i++) {
        let tx = ax + (i ? rnd(-3, 3) : 0), tz = az + (i ? rnd(-3, 3) : 0);
        const dd = Math.hypot(tx - P.x, tz - P.z); if (dd > 16) { tx = P.x + (tx - P.x) / dd * 16; tz = P.z + (tz - P.z) / dd * 16; }
        const delay = 0.85 + i * 0.25;
        C.ground.teleCircle(tx, tz, st.area, delay, 0xff8030);
        const rock = new THREE.Group();
        const core = new THREE.Mesh(projGeo, new THREE.MeshStandardMaterial({ color: 0x4a2a1a, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.6 }));
        core.scale.setScalar(0.9); rock.add(core); rock.add(glowSprite(0xff7020, 6, 1));
        rock.position.set(tx - 6, 22, tz - 4); C.scene.add(rock);
        G.zones.push({ kind: 'meteor', x: tx, z: tz, t: 0, dur: delay, r: st.area, dmg: st.dmg, mesh: rock, hex });
      }
      sfx('meteorCall'); break;
    case 'poison': {
      let tx = ax, tz = az; const dd = Math.hypot(tx - P.x, tz - P.z); if (dd > 13) { tx = P.x + (tx - P.x) / dd * 13; tz = P.z + (tz - P.z) / dd * 13; }
      const disc = new THREE.Mesh(C.ground.circleGeo, new THREE.MeshBasicMaterial({ color: 0x2f7a18, transparent: true, opacity: 0.3, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(tx, 0.04, tz); disc.scale.setScalar(st.area); C.scene.add(disc);
      G.zones.push({ kind: 'poison', x: tx, z: tz, t: 0, dur: st.dur, r: st.area, dmg: st.dmg, tick: 0, mesh: disc, hex });
      sfx('poison'); break;
    }
    case 'gravity': {
      let tx = ax, tz = az; const dd = Math.hypot(tx - P.x, tz - P.z); if (dd > 12) { tx = P.x + (tx - P.x) / dd * 12; tz = P.z + (tz - P.z) / dd * 12; }
      const g = new THREE.Group();
      g.add(new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0x080010 })));
      g.children[0].scale.setScalar(0.45);
      g.add(glowSprite(0x9a6bff, 4, 0.9));
      g.position.set(tx, 1.2, tz); C.scene.add(g);
      G.zones.push({ kind: 'gravity', x: tx, z: tz, t: 0, dur: st.dur, r: st.area, dmg: st.dmg, tick: 0, mesh: g, hex });
      sfx('gravity'); break;
    }
    case 'blink': {
      const range = Math.min(s.range, dl);
      const sx = P.x, sz = P.z;
      let bx = P.x, bz = P.z;
      for (let d = 0; d <= range; d += 0.25) {
        const tx = P.x + ux * d, tz = P.z + uz * d;
        const tl = tileAt(G.F, tx, tz);
        if (solidTile(G.F, tl.tx, tl.ty)) break;
        bx = tx; bz = tz;
      }
      C.fx.burst(sx, 1, sz, hex, 30, 6, 0.6, 0.5);
      P.x = bx; P.z = bz; collide(G.F, P, P.r); P.iframes = Math.max(P.iframes, 0.3);
      for (let k = 0; k < 14; k++) { const t = k / 13; C.fx.emit(lerp(sx, P.x, t), 1, lerp(sz, P.z, t), 0, 1, 0, hex, 0.8, 0.4); }
      C.fx.burst(P.x, 1, P.z, hex, 40, 8, 0.6, 0.5);
      C.ground.ring(P.x, P.z, st.area * 1.2, hex, 0.35);
      for (const m of monstersNear(P.x, P.z, st.area)) damage(m, st.dmg, { hex, kx: m.x - P.x, kz: m.z - P.z });
      sfx('blink'); break;
    }
    case 'familiar':
      for (let i = 0; i < st.count; i++) spawnFamiliar(st);
      sfx('summon'); break;
    case 'shield': {
      P.shield = st.dmg; P.shieldT = st.dur;
      sfx('shield'); C.fx.burst(P.x, 1, P.z, hex, 30, 5, 0.6, 0.5);
      break;
    }
    case 'orbit':
      for (let i = 0; i < st.count; i++) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0xe8eeff, emissive: 0x8aa0ff, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 }));
        b.scale.set(0.5, 0.5, 2.0); g.add(b); g.add(glowSprite(0xaab8ff, 1.4, 0.8));
        C.scene.add(g);
        G.summons.push({ kind: 'blade', mesh: g, t: 0, dur: st.dur, ang: (i / st.count) * Math.PI * 2, dmg: st.dmg, hits: new Map() });
      }
      sfx('orbit'); break;
  }
}

function spawnFamiliar(st) {
  const P = G.P;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9fffd8, emissive: 0x30c090, emissiveIntensity: 1, roughness: 0.3 });
  const body = new THREE.Mesh(projGeo, mat); body.scale.set(0.3, 0.34, 0.3); g.add(body);
  const earGeo = new THREE.ConeGeometry(0.08, 0.2, 10);
  const e1 = new THREE.Mesh(earGeo, mat); e1.position.set(-0.14, 0.32, 0); g.add(e1);
  const e2 = new THREE.Mesh(earGeo, mat); e2.position.set(0.14, 0.32, 0); g.add(e2);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x103020 });
  const ey1 = new THREE.Mesh(projGeo, eyeM); ey1.scale.setScalar(0.06); ey1.position.set(-0.1, 0.08, 0.26); g.add(ey1);
  const ey2 = new THREE.Mesh(projGeo, eyeM); ey2.scale.setScalar(0.06); ey2.position.set(0.1, 0.08, 0.26); g.add(ey2);
  g.add(glowSprite(0x7dffc4, 1.8, 0.7));
  g.position.set(P.x, 2, P.z); C.scene.add(g);
  G.summons.push({ kind: 'fam', mesh: g, t: 0, dur: st.dur || 15, ang: Math.random() * 6.28, cd: 0.5, dmg: st.dmg || 9, x: P.x, z: P.z });
}

function lightning(x0, z0, x1, z1, hex) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(3, Math.ceil(d / 0.9));
  let px = x0, pz = z0, py = 1.1;
  for (let i = 1; i <= n; i++) {
    const t = i / n, j = i === n ? 0 : 0.5;
    const nx = lerp(x0, x1, t) + rnd(-j, j), nz = lerp(z0, z1, t) + rnd(-j, j), ny = 1.1 + rnd(-j, j) * 0.6;
    const seg = Math.ceil(Math.hypot(nx - px, nz - pz) / 0.18);
    for (let k = 0; k < seg; k++) { const u = k / seg; C.fx.emit(lerp(px, nx, u), lerp(py, ny, u), lerp(pz, nz, u), 0, 0, 0, k % 4 ? hex : 0xffffff, 0.45, 0.16, { drag: 0, end: 0.2 }); }
    px = nx; pz = nz; py = ny;
  }
  C.fx.burst(x1, 1, z1, hex, 8, 5, 0.4, 0.25);
}

export function liveMonsters() { return G.monsters.filter((m) => !m.dead && m.spawnT <= 0 && m.state !== 'disguised' && !m.hidden); }
export function monstersNear(x, z, r) { const r2 = r * r; return liveMonsters().filter((m) => d2(m.x, m.z, x, z) < (r + m.r) * (r + m.r) || d2(m.x, m.z, x, z) < r2); }
export function nearestMonster(x, z, maxR = 99, needLos = false) {
  let best = null, bd = maxR * maxR;
  for (const m of liveMonsters()) {
    const q = d2(m.x, m.z, x, z);
    if (q < bd && (!needLos || los(G.F, x, z, m.x, m.z))) { bd = q; best = m; }
  }
  return best;
}

export function explode(x, z, r, dmg, hex, burn = true) {
  C.ground.ring(x, z, r * 1.2, hex, 0.4);
  C.flash.flash(x, 1.5, z, hex, 8, r * 4, 0.3);
  C.fx.burst(x, 0.8, z, hex, 40, r * 3, 0.9, 0.55, { up: 2 });
  C.fx.burst(x, 0.8, z, 0xffe0a0, 16, r * 2, 0.6, 0.3);
  C.fx.burst(x, 0.8, z, 0x302020, 10, r * 1.2, 1.4, 0.9, { up: 2, drag: 1.5 });
  for (const m of monstersNear(x, z, r)) damage(m, dmg, { hex, kx: m.x - x, kz: m.z - z, burn: burn ? 3 : 0, aoe: true });
  sfx('explode'); shakeIt(0.3); hitStop(0.03);
}

// ------------------------------------------------------------------ damage to monsters
export function damage(m, amt, o = {}) {
  if (m.dead || m.spawnT > 0) return;
  const P = G.P;
  let crit = Math.random() < 0.1;
  let dmg = amt * (crit ? 2 : 1);
  if (m.type === 'knight' && !o.aoe && m.state !== 'swing') {
    const toP = Math.atan2(P.x - m.x, P.z - m.z);
    if (Math.abs(angDiff(m.face, toP)) < 0.9) { dmg *= 0.3; crit = false; o.blocked = true; }
  }
  if (m.boss && m.invuln) return;
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg;
  if (!o.dot) m.flash = m.boss ? 0.05 : 0.08;
  if (o.freeze) m.freezeT = Math.max(m.freezeT, m.boss ? o.freeze * 0.3 : o.freeze);
  if (o.slow) m.slowT = Math.max(m.slowT, o.slow);
  if (o.stun && !m.boss) m.stunT = Math.max(m.stunT || 0, o.stun);
  const burnChance = o.burn ? 1 : has('ember') ? 0.25 : 0;
  if (burnChance && Math.random() < burnChance) { m.burnT = Math.max(m.burnT, o.burn || 3); m.burnDps = Math.max(m.burnDps, 5 + G.run.floorNum * 1.2); }
  if (o.kx != null && !m.boss && m.type !== 'knight') {
    const l = Math.hypot(o.kx, o.kz) || 1, k = o.aoe ? 9 : 5;
    m.kx += (o.kx / l) * k; m.kz += (o.kz / l) * k;
  }
  const y = (m.boss ? 3.5 : 1.6) + (m.y || 0);
  C.dmg.add(m.x, y, m.z, o.blocked ? 'block' : String(dmg), o.blocked ? 'block' : crit ? 'crit' : o.dot ? 'dot' : '');
  if (!o.dot) {
    C.fx.burst(m.x, 0.8 + (m.y || 0), m.z, o.hex || 0xffffff, crit ? 14 : 7, 5, 0.35, 0.3);
    sfx(crit ? 'crit' : 'hit');
    if (crit) { hitStop(0.045); shakeIt(0.12); }
  }
  m.hpShow = 2.5;
  if (m.hp <= 0) killMonster(m);
}

export function killMonster(m) {
  if (m.dead) return;
  m.dead = true;
  const P = G.P, f = G.run.floorNum;
  G.run.kills++;
  const col = { slime: 0x6aff6a, slimelet: 0x8af07a, skeleton: 0xeee4cf, bat: 0x9a5ac0, goblin: 0x7bb04a, ghost: 0xaad0ff, knight: 0xb0b8c8, spider: 0x8a3050, mimic: 0xd9a94a }[m.type] || 0xffd36b;
  C.fx.burst(m.x, 0.8 + (m.y || 0), m.z, col, m.boss ? 140 : 26, m.boss ? 14 : 7, m.boss ? 1.4 : 0.7, 0.7, { grav: 6, up: 3 });
  C.fx.burst(m.x, 0.8, m.z, 0xffffff, 8, 6, 0.5, 0.25);
  sfx('kill');
  if (has('vamp')) P.hp = Math.min(P.maxHp, P.hp + 2);
  // drops
  const def = m.def;
  const xp = def.xp * (1 + 0.15 * (f - 1)) * (m.elite ? 4 : 1);
  dropXp(m.x, m.z, xp);
  const gold = Math.round(rint(def.gold[0], def.gold[1]) * (m.elite ? 3 : 1) * P.goldMul * 0.6 * (1 + 0.06 * (f - 1)));
  dropGold(m.x, m.z, gold);
  if (Math.random() < 0.035 && !m.boss) spawnPickup('potion', m.x, m.z);
  if (m.elite || m.type === 'mimic') { const s = unknownSpell(); if (s) spawnPickup('book', m.x, m.z, s); else spawnPickup('tome', m.x, m.z); G.run.elitesKilled++; }
  if (m.type === 'slime' || (m.type === 'gloop' && false)) {
    for (let i = 0; i < 2; i++) spawnMonster('slimelet', m.x + rnd(-0.6, 0.6), m.z + rnd(-0.6, 0.6), { room: m.room, instant: true });
  }
  if (m.boss) {
    hitStop(0.35); shakeIt(1.4); sfx('explode'); sfx('roar');
    C.flash.flash(m.x, 3, m.z, 0xffd080, 14, 30, 1.2);
    for (let i = 0; i < 6; i++) schedule(i * 0.18, () => { C.fx.burst(m.x + rnd(-2, 2), rnd(1, 3), m.z + rnd(-2, 2), pick([0xffd36b, 0xff7a2a, 0xb48cff]), 40, 10, 1, 0.8, { grav: 3 }); sfx('explode'); });
    C.ui.bossBar(null);
    G.boss = null;
    if (m.type === 'crown') {
      schedule(2.6, () => { sfx('victory'); finishRun(true); });
    } else {
      const r = G.F.rooms[m.room];
      if (r) { r.state = 'clear'; openDoors(r); spawnStairs(r.cx, r.cz); }
      const s = unknownSpell(); if (s) spawnPickup('book', m.x + 1.5, m.z, s);
      const rl = unownedRelic(); if (rl) spawnPickup('relic', m.x - 1.5, m.z, rl);
      C.ui.toast(`${def.name} is defeated!`, '#ffd36b', 3);
    }
  }
  if (m.model.bar) C.scene.remove(m.model.bar);
  for (const o of m.model.root.children) if (o.isSprite) o.visible = false;
  m.model.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  G.dying.push({ m, t: 0, dur: m.boss ? 1.8 : 0.55, y0: m.y || 0 });
}

// ------------------------------------------------------------------ spawning
export function spawnMonster(type, x, z, o = {}) {
  const def = MONSTERS[type];
  const f = G.run.floorNum;
  const elite = !!o.elite;
  const hpScale = def.boss ? 1 : 1 + 0.26 * (f - 1);
  const m = {
    type, def, x, z, y: 0, vx: 0, vz: 0, r: def.r * (elite ? 1.3 : 1), maxHp: Math.round(def.hp * hpScale * (elite ? 3.2 : 1)),
    dmg: def.dmg * (1 + 0.1 * (f - 1)) * (elite ? 1.3 : 1), speed: def.speed * (elite ? 1.1 : 1), elite, boss: !!def.boss,
    room: o.room ?? -1, state: o.state || 'idle', t: 0, cd: rnd(0.6, 1.8), face: Math.atan2(G.P.x - x, G.P.z - z),
    slowT: 0, freezeT: 0, burnT: 0, burnDps: 0, burnTick: 0, flash: 0, kx: 0, kz: 0, spawnT: o.instant ? 0 : 0.7, dead: false,
    contactCd: 0, hpShow: 0, anim: Math.random() * 10, minion: !!o.minion,
  };
  m.hp = m.maxHp;
  m.model = makeMonsterModel(type, elite);
  m.model.root.position.set(x, 0, z);
  m.baseScale = m.model.root.scale.x;
  C.scene.add(m.model.root);
  if (!o.instant) {
    m.model.root.scale.setScalar(0.01);
    C.ground.ring(x, z, m.boss ? 5 : 1.8, 0x8a5cff, 0.7);
    C.fx.burst(x, 0.3, z, 0x8a5cff, 20, 3, 0.6, 0.7, { up: 3, flat: true });
  }
  G.monsters.push(m);
  return m;
}

function randomRoomSpot(r, minFromPlayer = 4) {
  const F = G.F, P = G.P;
  for (let k = 0; k < 60; k++) {
    const tx = rint(r.x + 1, r.x + r.w - 2), ty = rint(r.y + 1, r.y + r.h - 2);
    if (F.tiles[ty * F.W + tx] !== T.FLOOR) continue;
    const x = (tx + 0.5) * TS, z = (ty + 0.5) * TS;
    if (Math.hypot(x - P.x, z - P.z) < minFromPlayer) continue;
    return { x, z };
  }
  return { x: r.cx, z: r.cz };
}
export { randomRoomSpot };

function lockDoors(r) { for (const id of r.doors) G.F.doors[id].target = 0; sfx('door'); shakeIt(0.15); }
function openDoors(r) { for (const id of r.doors) G.F.doors[id].target = 1; sfx('door'); }

function startRoom(r) {
  const f = G.run.floorNum;
  r.state = 'locked';
  lockDoors(r);
  if (r.type === 'boss') {
    const b = spawnMonster(G.F.bossKey, r.cx, r.cz - 2, { room: r.id });
    b.spawnT = 1.4; G.boss = b;
    sfx('roar'); shakeIt(0.8);
    C.ui.bossBar(b);
    C.ui.banner(b.def.name, f === LAST_FLOOR ? 'The last thing between you and daylight' : 'Guardian of the deep');
  } else {
    r.waves = 1 + (f >= 3 && Math.random() < 0.5 ? 1 : 0) + (f >= 7 && Math.random() < 0.35 ? 1 : 0);
    spawnWave(r);
  }
  if (has('bell')) spawnFamiliar(statsOf('familiar'));
}
function spawnWave(r) {
  const f = G.run.floorNum;
  r.waves--;
  const n = Math.round(clamp(2 + f * 0.5 + (r.w * r.h) / 32 + rnd(0, 1.5), 3, 12));
  const pool = monsterPool(f);
  const elite = f >= 2 && !r.hadElite && Math.random() < 0.4 ? rint(0, n - 1) : -1;
  if (elite >= 0) r.hadElite = true;
  for (let i = 0; i < n; i++) {
    const s = randomRoomSpot(r, 4.5);
    const type = pick(pool);
    schedule(i * 0.08, () => spawnMonster(type, s.x, s.z, { room: r.id, elite: i === elite }));
  }
  r.spawning = 0.1 + n * 0.08;
}
function clearRoom(r) {
  r.state = 'clear';
  openDoors(r);
  C.ui.toast('Room cleared', '#a0ffa0', 1.2);
  if (r.type === 'exit') spawnStairs(r.cx, r.cz);
  else if (r.type === 'combat' && Math.random() < 0.3) spawnChest(r.cx, r.cz);
}

function updateRooms(dt) {
  const F = G.F, P = G.P;
  const tl = tileAt(F, P.x, P.z);
  const rid = tl.i >= 0 ? F.roomOf[tl.i] : -1;
  G.room = rid;
  if (rid >= 0) {
    const r = F.rooms[rid];
    r.seen = true;
    // only lock once the wizard is fully inside (not straddling a door)
    const inside = P.x > r.x * TS + 0.7 && P.x < (r.x + r.w) * TS - 0.7 && P.z > r.y * TS + 0.7 && P.z < (r.y + r.h) * TS - 0.7;
    if (r.state === 'idle' && inside) startRoom(r);
  }
  for (const r of F.rooms) {
    if (r.state !== 'locked') continue;
    if (r.spawning > 0) { r.spawning -= dt; continue; }
    if (r.type === 'boss') continue;
    const alive = G.monsters.some((m) => !m.dead && m.room === r.id);
    if (!alive) {
      if (r.waves > 0) { r.spawning = 0.8; schedule(0.6, () => { if (r.state === 'locked') { spawnWave(r); C.ui.toast('Another wave!', '#ff9a6a', 1); } }); }
      else clearRoom(r);
    }
  }
}

function updateDoors(dt) {
  const F = G.F;
  let changed = false;
  for (const d of F.doors) {
    if (d.open !== d.target) { d.open = d.target > d.open ? Math.min(1, d.open + dt * 3) : Math.max(0, d.open - dt * 4); changed = true; }
  }
  if (changed) updateDoorMeshes(F, G.M);
}

// ------------------------------------------------------------------ chests, pickups, stairs
export function spawnChest(x, z) {
  const model = makeChest(false);
  model.root.position.set(x, 0, z);
  model.root.rotation.y = 0;
  C.scene.add(model.root);
  const c = { x, z, model, opened: false, t: 0 };
  G.chests.push(c);
  return c;
}
function openChest(c) {
  c.opened = true; c.t = 0;
  sfx('chest'); shakeIt(0.15);
  C.fx.burst(c.x, 0.8, c.z, 0xffd36b, 30, 6, 0.6, 0.6, { up: 4, grav: 6 });
  C.flash.flash(c.x, 1.5, c.z, 0xffd36b, 5, 8, 0.5);
  dropGold(c.x, c.z, Math.round(rint(8, 16) * G.P.goldMul * (1 + 0.1 * G.run.floorNum)));
  const r = Math.random();
  const s = unknownSpell(), rl = unownedRelic();
  if (r < 0.55 && s) spawnPickup('book', c.x, c.z + 1.2, s);
  else if (r < 0.8 || !rl) spawnPickup('tome', c.x, c.z + 1.2);
  else spawnPickup('relic', c.x, c.z + 1.2, rl);
  if (Math.random() < 0.3) spawnPickup('potion', c.x + 1, c.z + 1);
}
const pickupGeo = {};
function spawnPickup(kind, x, z, val = 0) {
  let mesh;
  if (kind === 'gold') {
    mesh = new THREE.Group();
    const g = pickupGeo.coin || (pickupGeo.coin = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18)); g.userData.shared = true;
    const mm = pickupGeo.coinM || (pickupGeo.coinM = new THREE.MeshStandardMaterial({ color: 0xffd040, metalness: 0.9, roughness: 0.25, emissive: 0x553300 }));
    const c = new THREE.Mesh(g, mm); c.rotation.x = Math.PI / 2; mesh.add(c);
  } else if (kind === 'xp') {
    mesh = new THREE.Group();
    const mm = pickupGeo.xpM || (pickupGeo.xpM = new THREE.MeshBasicMaterial({ color: 0x9ff8ff }));
    const c = new THREE.Mesh(projGeo, mm); c.scale.setScalar(0.09 + Math.min(0.12, val * 0.008)); mesh.add(c);
    mesh.add(glowSprite(0x40e0ff, 0.7 + Math.min(1, val * 0.05), 0.9));
  } else if (kind === 'potion') {
    mesh = new THREE.Group();
    const b = new THREE.Mesh(projGeo, new THREE.MeshPhysicalMaterial({ color: 0xff3050, clearcoat: 1, roughness: 0.1, emissive: 0x500010 }));
    b.scale.setScalar(0.25); mesh.add(b);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xd8c0a0 })); n.position.y = 0.3; mesh.add(n);
    mesh.add(glowSprite(0xff4060, 1.4, 0.6));
  } else if (kind === 'book') { mesh = makeBook(SPELLS[val].hex, SPELLS[val].glyph).root; }
  else if (kind === 'tome') { mesh = makeBook(0xffd36b, '✚').root; }
  else if (kind === 'relic') { mesh = makeRelic(0xffb050).root; }
  mesh.position.set(x, 0.6, z);
  C.scene.add(mesh);
  const a = Math.random() * Math.PI * 2, sp = kind === 'gold' || kind === 'xp' ? rnd(2, 5) : 1.5;
  const p = { kind, x, z, y: 0.6, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(4, 7), val, mesh, t: 0, mag: false };
  G.pickups.push(p);
  return p;
}
export { spawnPickup };
function dropGold(x, z, amount) {
  let left = amount;
  while (left > 0) { const v = left > 20 ? 5 : left > 6 ? 2 : 1; spawnPickup('gold', x, z, v); left -= v; }
}
function dropXp(x, z, amount) {
  let left = Math.round(amount);
  while (left > 0) { const v = left >= 25 ? 10 : left >= 8 ? 4 : 1; spawnPickup('xp', x, z, v); left -= v; }
}
export function gainXp(v) {
  const P = G.P;
  P.xp += v * P.xpMul;
  while (P.xp >= P.xpNext) { P.xp -= P.xpNext; P.level++; P.xpNext = xpFor(P.level); G.pendingLevels++; G.levelDelay = 0.35; }
}

function updatePickups(dt) {
  const P = G.P;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.t += dt;
    const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz);
    const small = p.kind === 'gold' || p.kind === 'xp';
    if (small && !P.dead && p.t > 0.35 && (d < (p.kind === 'xp' ? 5 : 3.6) || p.mag)) {
      p.mag = true;
      const sp = 9 + p.t * 10;
      p.vx = (dx / d) * sp; p.vz = (dz / d) * sp;
    } else { p.vx *= Math.exp(-3 * dt); p.vz *= Math.exp(-3 * dt); }
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (!p.mag) collide(G.F, p, 0.2);
    p.vy -= 18 * dt; p.y += p.vy * dt;
    const rest = small ? 0.3 : 0.9 + Math.sin(p.t * 2.5) * 0.15;
    if (p.y < rest) { p.y = rest; p.vy = small ? -p.vy * 0.4 : 0; }
    p.mesh.position.set(p.x, p.mag ? 1 : p.y, p.z);
    p.mesh.rotation.y += dt * (small ? 5 : 1.5);
    if (P.dead || d > (small ? 0.6 : 1.1) || p.t < (small ? 0.2 : 0.5)) continue;
    // collect
    C.scene.remove(p.mesh);
    G.pickups.splice(i, 1);
    if (p.kind === 'gold') { P.gold += p.val; G.run.goldEarned += p.val; sfx('coin'); }
    else if (p.kind === 'xp') { gainXp(p.val); sfx('xp'); }
    else if (p.kind === 'potion') { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.35); sfx('relic'); C.dmg.add(P.x, 2, P.z, '+HP', 'heal'); }
    else if (p.kind === 'book') openBook(p.val);
    else if (p.kind === 'tome') openTome();
    else if (p.kind === 'relic') gainRelic(p.val);
  }
}

function spawnStairs(x, z) {
  if (G.stairs) return;
  const model = makeStairs();
  model.root.position.set(x, 0.01, z);
  C.scene.add(model.root);
  G.stairs = { x, z, model, t: 0 };
  C.ui.toast('A stairway opens downward...', '#c6a0ff', 2);
}
function updateStairs(dt) {
  const s = G.stairs; if (!s) return;
  s.t += dt;
  s.model.swirl.rotation.z += dt * 1.5;
  if (Math.random() < 0.5) C.fx.emit(s.x + rnd(-1.2, 1.2), 0.2, s.z + rnd(-1.2, 1.2), 0, rnd(1, 2.5), 0, 0x8a6bff, 0.5, 0.9, { drag: 0.5 });
  const P = G.P;
  if (!P.dead && s.t > 0.8 && Math.hypot(P.x - s.x, P.z - s.z) < 1.3) descend();
}

function updateChests(dt) {
  const P = G.P;
  for (const c of G.chests) {
    if (!c.opened && !P.dead && Math.hypot(P.x - c.x, P.z - c.z) < 1.6) openChest(c);
    if (c.opened) { c.t += dt; c.model.lid.rotation.x = -Math.min(1, c.t * 4) * 1.9; }
  }
}

// ------------------------------------------------------------------ projectiles
function updateProjectiles(dt) {
  const F = G.F;
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    p.life -= dt;
    if (p.home) {
      if (!p.target || p.target.dead) p.target = nearestMonster(p.x, p.z, 14);
      if (p.target) {
        const want = Math.atan2(p.target.x - p.x, p.target.z - p.z), cur = Math.atan2(p.vx, p.vz);
        const na = cur + clamp(angDiff(cur, want), -9 * dt, 9 * dt);
        const sp = Math.min(p.speed, Math.hypot(p.vx, p.vz) + 30 * dt);
        p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp;
      }
    }
    const sp = Math.hypot(p.vx, p.vz);
    const steps = Math.max(1, Math.ceil((sp * dt) / 0.35));
    let gone = false;
    for (let s = 0; s < steps && !gone; s++) {
      const ox = p.x, oz = p.z;
      p.x += (p.vx * dt) / steps; p.z += (p.vz * dt) / steps;
      const tl = tileAt(F, p.x, p.z);
      if (solidTile(F, tl.tx, tl.ty)) {
        if (p.bounce > 0 && p.kind !== 'fire') {
          p.bounce--;
          const txo = Math.floor(ox / TS), tzo = Math.floor(oz / TS);
          if (txo !== tl.tx) p.vx = -p.vx;
          if (tzo !== tl.ty) p.vz = -p.vz;
          if (txo === tl.tx && tzo === tl.ty) { p.vx = -p.vx; p.vz = -p.vz; }
          p.x = ox; p.z = oz; p.hit.clear();
          continue;
        }
        p.x = ox; p.z = oz;
        projEnd(p, true); gone = true; break;
      }
      for (const m of G.monsters) {
        if (m.dead || m.spawnT > 0 || m.state === 'disguised' || m.hidden || p.hit.has(m)) continue;
        const rr = m.r + p.r;
        if (d2(m.x, m.z, p.x, p.z) > rr * rr) continue;
        if (p.kind === 'fire') { explode(p.x, p.z, p.area, p.dmg, p.hex); if (p.bounce > 0) { p.bounce--; p.hit.add(m); retarget(p, m); continue; } gone = true; break; }
        const frozen = m.freezeT > 0 || m.slowT > 0;
        damage(m, p.dmg * (p.lance && frozen ? 2 : 1), { hex: p.hex, kx: p.vx, kz: p.vz, slow: p.slow });
        p.hit.add(m);
        if (p.pierce > 0) { p.pierce--; continue; }
        if (p.bounce > 0) { p.bounce--; retarget(p, m); continue; }
        projEnd(p, false); gone = true; break;
      }
    }
    if (!gone && p.life <= 0) { if (p.kind === 'fire') explode(p.x, p.z, p.area * 0.8, p.dmg * 0.7, p.hex); projEnd(p, false, true); gone = true; }
    if (gone) { C.scene.remove(p.mesh); G.projs.splice(i, 1); continue; }
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
    if (Math.random() < (p.kind === 'fire' ? 1 : 0.6)) C.fx.emit(p.x, p.y, p.z, rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5), p.kind === 'fire' && Math.random() < 0.5 ? 0xffd080 : p.hex, p.kind === 'fire' ? 0.9 : 0.45, 0.3);
  }
}
function retarget(p, from) {
  let best = null, bd = 10 * 10;
  for (const m of liveMonsters()) { if (m === from || p.hit.has(m)) continue; const q = d2(m.x, m.z, p.x, p.z); if (q < bd) { bd = q; best = m; } }
  const sp = Math.hypot(p.vx, p.vz);
  if (best) { const a = Math.atan2(best.x - p.x, best.z - p.z); p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; }
  else { p.vx = -p.vx + rnd(-3, 3); p.vz = -p.vz + rnd(-3, 3); }
  p.life = Math.max(p.life, 0.6);
}
function projEnd(p, wall, fizzle = false) {
  if (p.kind === 'fire' && wall) { explode(p.x, p.z, p.area, p.dmg, p.hex); return; }
  C.fx.burst(p.x, p.y, p.z, p.hex, fizzle ? 4 : 8, 3, 0.4, 0.25);
}

// enemy projectiles
const eGeo = { arrow: new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6) };
eGeo.arrow.rotateX(Math.PI / 2); eGeo.arrow.userData.shared = true;
export function spawnEProj(o) {
  const p = Object.assign({ y: 1.0, r: 0.28, life: 4, kind: 'orb', hex: 0xff5050, turn: 0 }, o);
  const g = new THREE.Group();
  if (p.kind === 'arrow') {
    g.add(new THREE.Mesh(eGeo.arrow, new THREE.MeshStandardMaterial({ color: 0xcfc0a0, roughness: 0.5 })));
    g.add(glowSprite(0xff6040, 0.9, 0.7));
  } else {
    const c = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(p.hex).lerp(new THREE.Color(0xffffff), 0.5) }));
    c.scale.setScalar(p.r * 0.75); g.add(c);
    g.add(glowSprite(p.hex, p.r * 6, 0.95));
  }
  g.position.set(p.x, p.y, p.z);
  C.scene.add(g);
  p.mesh = g;
  G.eprojs.push(p);
  return p;
}
function updateEProjectiles(dt) {
  const P = G.P, F = G.F;
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const p = G.eprojs[i];
    p.life -= dt;
    if (p.turn && !P.dead) {
      const want = Math.atan2(P.x - p.x, P.z - p.z), cur = Math.atan2(p.vx, p.vz), sp = Math.hypot(p.vx, p.vz);
      const na = cur + clamp(angDiff(cur, want), -p.turn * dt, p.turn * dt);
      p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp;
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    let gone = p.life <= 0;
    const tl = tileAt(F, p.x, p.z);
    if (tl.t === T.VOID || tl.t === T.PILLAR || (F.doorAt[tl.i] >= 0 && F.doors[F.doorAt[tl.i]].open < 0.5)) gone = true;
    if (!gone && !P.dead && d2(P.x, P.z, p.x, p.z) < (P.r + p.r) ** 2) {
      if (hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { slow: p.slow })) gone = true;
    }
    // shield / blade orbit can eat enemy shots
    if (!gone && P.shield > 0 && d2(P.x, P.z, p.x, p.z) < 1.3 * 1.3) { gone = true; P.shield = Math.max(0, P.shield - p.dmg * 0.5); }
    if (gone) { C.fx.burst(p.x, p.y, p.z, p.hex, 6, 3, 0.4, 0.25); C.scene.remove(p.mesh); G.eprojs.splice(i, 1); continue; }
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
    if (p.kind !== 'arrow' && Math.random() < 0.4) C.fx.emit(p.x, p.y, p.z, 0, 0.3, 0, p.hex, p.r * 2, 0.3);
  }
  // expanding shockwave hazards (bosses)
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.rad += h.speed * dt;
    if (!h.hit && !P.dead) { const d = Math.hypot(P.x - h.x, P.z - h.z); if (Math.abs(d - h.rad) < 0.6 && hurtPlayer(h.dmg, h.x, h.z)) h.hit = true; }
    if (h.rad > h.max) G.hazards.splice(i, 1);
  }
}

// ------------------------------------------------------------------ zones & summons
function updateZones(dt) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    z.t += dt;
    if (z.kind === 'meteor') {
      const p = Math.min(1, z.t / z.dur);
      z.mesh.position.set(z.x - 6 * (1 - p), 22 * (1 - p) + 0.5, z.z - 4 * (1 - p));
      C.fx.emit(z.mesh.position.x, z.mesh.position.y, z.mesh.position.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), Math.random() < 0.5 ? 0xff7020 : 0xffd080, 1.4, 0.4);
      if (p >= 1) {
        explode(z.x, z.z, z.r, z.dmg, 0xff5020);
        C.fx.burst(z.x, 0.5, z.z, 0xff9040, 60, z.r * 4, 1.1, 0.8, { up: 6, grav: 9 });
        sfx('meteor'); shakeIt(0.8); hitStop(0.07);
        C.scene.remove(z.mesh); G.zones.splice(i, 1);
      }
      continue;
    }
    if (z.kind === 'poison') {
      z.tick -= dt;
      if (Math.random() < 0.9) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * z.r; C.fx.emit(z.x + Math.sin(a) * r, 0.3, z.z + Math.cos(a) * r, rnd(-0.3, 0.3), rnd(0.3, 1.0), rnd(-0.3, 0.3), Math.random() < 0.3 ? 0xc0ff60 : 0x40c030, 1.6, 1.2, { drag: 1, end: 2 }); }
      if (z.tick <= 0) { z.tick = 0.5; for (const m of monstersNear(z.x, z.z, z.r)) { damage(m, z.dmg * 0.5, { hex: z.hex, dot: true, slow: 0.6 }); } }
      z.mesh.material.opacity = 0.3 * Math.min(1, (z.dur - z.t) * 2);
    }
    if (z.kind === 'gravity') {
      z.tick -= dt;
      for (const m of monstersNear(z.x, z.z, z.r)) {
        if (m.boss) continue;
        const dx = z.x - m.x, dz = z.z - m.z, d = Math.hypot(dx, dz) || 1;
        const pull = (7 * (1 - d / (z.r + 1)) + 2) * dt;
        if (d > 0.5) { m.x += (dx / d) * pull; m.z += (dz / d) * pull; }
      }
      if (z.tick <= 0) { z.tick = 0.33; for (const m of monstersNear(z.x, z.z, z.r * 0.6)) damage(m, z.dmg * 0.33, { hex: z.hex, dot: true }); }
      for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, r = z.r * rnd(0.6, 1); C.fx.emit(z.x + Math.sin(a) * r, rnd(0.3, 1.8), z.z + Math.cos(a) * r, -Math.sin(a) * r * 2.5 + Math.cos(a) * 3, 0, -Math.cos(a) * r * 2.5 - Math.sin(a) * 3, Math.random() < 0.5 ? 0x9a6bff : 0x5030c0, 0.6, 0.4, { drag: 0.5 }); }
      z.mesh.children[1].scale.setScalar(4 + Math.sin(z.t * 12) * 0.5);
    }
    if (z.t >= z.dur) { C.scene.remove(z.mesh); G.zones.splice(i, 1); }
  }
}
function updateSummons(dt) {
  const P = G.P;
  for (let i = G.summons.length - 1; i >= 0; i--) {
    const s = G.summons[i];
    s.t += dt;
    if (s.kind === 'fam') {
      s.ang += dt * 1.6;
      const tx = P.x + Math.sin(s.ang) * 1.8, tz = P.z + Math.cos(s.ang) * 1.8;
      s.x = damp(s.x, tx, 5, dt); s.z = damp(s.z, tz, 5, dt);
      s.mesh.position.set(s.x, 2.1 + Math.sin(s.t * 4) * 0.2, s.z);
      s.cd -= dt;
      const t = nearestMonster(s.x, s.z, 11, true);
      if (t) s.mesh.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
      if (s.cd <= 0 && t) {
        s.cd = 0.65;
        const a = Math.atan2(t.x - s.x, t.z - s.z);
        spawnProj({ kind: 'fam', hex: 0x7dffc4, x: s.x, z: s.z, y: 1.6, vx: Math.sin(a) * 20, vz: Math.cos(a) * 20, dmg: s.dmg, life: 0.8 });
      }
    } else if (s.kind === 'blade') {
      s.ang += dt * 4.2;
      const x = P.x + Math.sin(s.ang) * 2.3, z = P.z + Math.cos(s.ang) * 2.3;
      s.mesh.position.set(x, 1.0, z);
      s.mesh.rotation.y = s.ang + Math.PI / 2;
      for (const m of liveMonsters()) {
        if (d2(m.x, m.z, x, z) > (m.r + 0.5) ** 2) continue;
        const last = s.hits.get(m) || -9;
        if (s.t - last < 0.4) continue;
        s.hits.set(m, s.t);
        damage(m, s.dmg, { hex: 0xe0e6ff, kx: m.x - P.x, kz: m.z - P.z });
      }
      if (Math.random() < 0.5) C.fx.emit(x, 1, z, 0, 0, 0, 0xaab8ff, 0.5, 0.25);
    }
    if (s.t >= s.dur) { C.fx.burst(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 0x7dffc4, 12, 3, 0.4, 0.4); C.scene.remove(s.mesh); G.summons.splice(i, 1); }
  }
}

// ------------------------------------------------------------------ traps
function updateTraps(dt) {
  const F = G.F, P = G.P, M = G.M;
  if (!M.spikes) return;
  const dummy = updateTraps.d || (updateTraps.d = new THREE.Object3D());
  const ptx = Math.floor(P.x / TS), pty = Math.floor(P.z / TS);
  F.traps.forEach((t, k) => {
    t.phase = (t.phase + dt) % 3.2;
    let h;
    if (t.phase < 0.75) h = 0.08 + Math.sin(t.phase * 30) * 0.03; // warning rattle
    else if (t.phase < 1.45) h = 1;
    else if (t.phase < 1.8) h = 1 - (t.phase - 1.45) / 0.35;
    else h = 0;
    if (t.up < 0.5 && h >= 1) sfx('trap');
    t.up = h;
    if (h > 0.8 && ptx === t.tx && pty === t.ty && !P.dead) hurtPlayer(10 + G.run.floorNum * 1.5, (t.tx + 0.5) * TS, (t.ty + 0.5) * TS);
    for (let s = 0; s < 5; s++) {
      const ox = [-0.4, 0.4, 0, -0.4, 0.4][s], oz = [-0.4, -0.4, 0, 0.4, 0.4][s];
      dummy.position.set((t.tx + 0.5) * TS + ox, -0.35 + h * 0.75, (t.ty + 0.5) * TS + oz);
      dummy.updateMatrix(); M.spikes.setMatrixAt(k * 5 + s, dummy.matrix);
    }
  });
  M.spikes.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ main update
export function update(dt) {
  const P = G.P;
  G.time += dt;
  if (G.mode !== 'play') return;
  G.run.time += dt;
  for (let i = G.timers.length - 1; i >= 0; i--) { const t = G.timers[i]; t.t -= dt; if (t.t <= 0) { G.timers.splice(i, 1); t.fn(); } }
  if (G.mode !== 'play') return;
  updatePlayer(dt);
  G.flowT -= dt;
  if (G.flowT <= 0 && !P.dead) { G.flowT = 0.3; G.flow = flowField(G.F, Math.floor(P.x / TS), Math.floor(P.z / TS)); }
  updateRooms(dt);
  updateMonsters(dt);
  updateProjectiles(dt);
  updateEProjectiles(dt);
  updateZones(dt);
  updateSummons(dt);
  updatePickups(dt);
  updateChests(dt);
  updateTraps(dt);
  updateDoors(dt);
  updateStairs(dt);
  if (P.dead) {
    G.deathT -= dt;
    if (G.deathT <= 0 && G.mode === 'play') finishRun(false);
  } else if (G.pendingLevels > 0) {
    G.levelDelay -= dt;
    if (G.levelDelay <= 0 && !G.modalOpen) openLevelUp();
  }
}

// ------------------------------------------------------------------ visuals (run every frame, also while paused)
let torchLights = null, playerLight = null, shieldMesh = null;
export function initVisuals() {
  torchLights = [];
  for (let i = 0; i < 6; i++) { const L = new THREE.PointLight(0xff9a40, 0, 11, 1.4); L.position.set(0, -40, 0); C.scene.add(L); torchLights.push(L); }
  playerLight = new THREE.PointLight(0xb08cff, 6, 9, 1.5); C.scene.add(playerLight);
  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x7fb2ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  shieldMesh.add(glowSprite(0x7fb2ff, 3.2, 0.35));
  C.scene.add(shieldMesh); shieldMesh.visible = false;
}
let torchAssignT = 0;
// death: the model crumbles away through a noise dissolve with a glowing ember edge, sinking and squashing a little
function updateDying(dt) {
  for (let i = G.dying.length - 1; i >= 0; i--) {
    const d = G.dying[i], md = d.m.model;
    d.t += dt;
    const p = Math.min(1, d.t / d.dur);
    for (const mt of md.allMats) mt.userData.sd.uDis.value = Math.max(0.001, p);
    if (md.body) md.body.scale.set(1 + p * 0.15, 1 - p * 0.25, 1 + p * 0.15);
    md.root.position.y = d.y0 * (1 - p) - (d.m.boss ? 0 : p * 0.15);
    if (p >= 1) { C.scene.remove(md.root); G.dying.splice(i, 1); }
  }
}

export function updateVisuals(dt, camera) {
  const P = G.P, M = G.M, F = G.F;
  if (!P || !M) return;
  const t = G.time;
  // wizard
  const w = P.model;
  w.root.position.set(P.x, 0, P.z);
  const cur = w.root.rotation.y;
  w.root.rotation.y = cur + angDiff(cur, P.face) * Math.min(1, dt * 18);
  const mv = Math.min(1, P.moving / 6);
  const cast = P.castAnim > 0 ? P.castAnim / 0.22 : 0;
  const ry = w.root.rotation.y, cr = Math.cos(ry), sr = Math.sin(ry);
  const lvx = P.vx * cr - P.vz * sr, lvz = P.vx * sr + P.vz * cr; // velocity in the wizard's own frame
  const stride = t * 11;
  w.body.position.y = Math.abs(Math.sin(stride)) * 0.07 * mv + Math.sin(t * 2.2) * 0.015;
  w.body.rotation.x = mv * 0.1 + (P.dashT > 0 ? 0.35 : 0) - cast * 0.06;
  w.body.rotation.z = Math.sin(stride) * 0.04 * mv;
  w.head.rotation.x = Math.sin(t * 2.2 + 0.5) * 0.03 - mv * 0.06;
  w.head.rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - mv);
  w.hat.rotation.z = 0.06 + Math.sin(stride + 0.6) * 0.06 * mv + Math.sin(t * 1.3) * 0.02;
  w.hat.rotation.x = -0.08 - mv * 0.1;
  w.armL.rotation.x = cast > 0 ? -1.3 * cast : -Math.sin(stride) * 0.4 * mv;
  w.armL.rotation.z = cast > 0 ? 0.25 * cast : 0;
  w.armR.rotation.x = cast > 0 ? -0.75 * cast : Math.sin(stride) * 0.18 * mv + Math.sin(t * 2.2) * 0.03;
  w.staff.rotation.x = cast > 0 ? 0.35 * cast : 0;
  // cloth: hem trails behind the motion and ripples; the cape streams out when running
  w.sway.set(-lvx * 0.012, -lvz * 0.012, t * 4, 0.01 + 0.02 * mv);
  w.capeSway.set(-lvx * 0.02, -0.06 - 0.25 * mv - (P.dashT > 0 ? 0.25 : 0), t * 3, 0.015 + 0.02 * mv);
  const orbI = 2 + Math.sin(t * 5) * 0.4 + cast * 4;
  w.orbMat.emissiveIntensity = orbI;
  w.orb.rotation.y += dt * (1 + cast * 10);
  w.orbGlow.scale.setScalar(1 + cast * 0.9 + Math.sin(t * 5) * 0.1);
  w.runeMat.color.setScalar(0.65 + 0.35 * Math.sin(t * 3) + cast * 0.6);
  w.root.visible = !P.dead && !(P.iframes > 0 && P.dashT <= 0 && Math.floor(t * 20) % 2 === 0 && P.iframes < 0.6);
  playerLight.position.set(P.x, 2.6, P.z);
  playerLight.intensity = 5 + (P.castAnim > 0 ? 6 : 0);
  shieldMesh.visible = P.shield > 0 && !P.dead;
  if (shieldMesh.visible) { shieldMesh.position.set(P.x, 1, P.z); shieldMesh.scale.setScalar(1 + Math.sin(t * 6) * 0.04); }

  // torches: flicker + assign the light pool to the nearest torches
  torchAssignT -= dt;
  if (torchAssignT <= 0) {
    torchAssignT = 0.25;
    const list = M.torchMeshes.map((o) => ({ o, d: d2(o.t.x, o.t.z, P.x, P.z) })).sort((a, b) => a.d - b.d);
    torchLights.forEach((L, i) => { const it = list[i]; if (it && it.d < 22 * 22) { L.position.set(it.o.t.x, 2.4, it.o.t.z); L.userData.on = 1; L.userData.ph = it.o.ph; } else { L.userData.on = 0; } });
  }
  for (const L of torchLights) L.intensity = L.userData.on ? 7 + Math.sin(t * 13 + L.userData.ph) * 1.2 + Math.sin(t * 7.3 + L.userData.ph * 2) * 0.8 : 0;
  for (const o of M.torchMeshes) {
    const f = 1 + Math.sin(t * 14 + o.ph) * 0.08 + Math.sin(t * 9 + o.ph * 3) * 0.06;
    o.fl.scale.set(1.3 * f, 1.7 * f, 1); o.core.scale.set(0.5 * f, 0.7 * f, 1);
    if (Math.random() < 0.06 && d2(o.t.x, o.t.z, P.x, P.z) < 400) C.fx.emit(o.t.x, 2.6, o.t.z, rnd(-0.2, 0.2), rnd(0.8, 1.6), rnd(-0.2, 0.2), 0xffa040, 0.25, 0.7, { drag: 0.5 });
  }

  // wall cut-away: walls between the camera and the wizard sink down
  const dummy = updateVisuals.d || (updateVisuals.d = new THREE.Object3D());
  let changed = false;
  M.wallData.forEach((wd, k) => {
    const dz = wd.z - P.z, dx = Math.abs(wd.x - P.x);
    const target = dz > 0.5 && dz < 11 && dx < 13 ? 0.16 : 1;
    if (Math.abs(wd.s - target) > 0.002) {
      wd.s = damp(wd.s, target, 10, dt);
      if (Math.abs(wd.s - target) < 0.003) wd.s = target;
      dummy.position.set(wd.x, 0, wd.z); dummy.scale.set(1, wd.s, 1); dummy.updateMatrix();
      M.walls.setMatrixAt(k, dummy.matrix); changed = true;
    }
  });
  if (changed) M.walls.instanceMatrix.needsUpdate = true;

  // monsters' looks
  updateDying(dt);
  for (const m of G.monsters) monsterAnimate(m, dt, camera);
  for (const p of G.pickups) if (p.kind === 'book' || p.kind === 'tome' || p.kind === 'relic') { if (Math.random() < 0.15) C.fx.emit(p.x + rnd(-0.4, 0.4), p.y, p.z + rnd(-0.4, 0.4), 0, 1, 0, 0xffe0a0, 0.3, 0.6); }
}
