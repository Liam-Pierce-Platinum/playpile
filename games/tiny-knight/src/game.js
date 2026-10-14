// Core game state + simulation: player, enemies, boss, combat, gathering, spawning, saving.
import { World, TS, N, T, Z, ZONE_TIER, ZONE_NAMES, TOWN, CAMP, CASTLE, rng } from './world.js';
import { ENEMIES, SPAWNS, NIGHT_EXTRA, SWORDS, AXES, PICKS, ARMORS, SHIELDS, RECIPES, BRIDGE, MATS, SELL, xpNeeded, maxHpFor, atkBonus } from './data.js';
import { sfx, playMusic } from './audio.js';

const SAVE_KEY = 'pd.tiny-knight';
export const G = {
  state: 'title', world: null, player: null, enemies: [], projs: [], hazards: [], parts: [], pops: [], drops: [],
  time: 0, hitstop: 0, shake: 0, slow: 1, day: 0.12, boss: null, input: null, ui: null,
  flags: null, stats: null, zone: -1, interactTarget: null, autosaveT: 0, flashT: 0, victoryT: 0, god: false,
};
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
const dirOf = (a) => { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) > Math.abs(s) ? (c > 0 ? 'right' : 'left') : (s > 0 ? 'down' : 'up'); };

function newPlayer() {
  return {
    x: TOWN.x * TS + 8, y: (TOWN.y + 2) * TS + 8, vx: 0, vy: 0, kbx: 0, kby: 0, dir: 'up', aim: -Math.PI / 2,
    hp: maxHpFor(1), lvl: 1, xp: 0, coins: 0, inv: Object.fromEntries(MATS.map((m) => [m, 0])), potions: 1, arrows: 0,
    sword: 0, axe: 0, pick: 0, armor: 0, shield: 0, bow: false,
    atkT: 0, atkCd: 0, combo: 0, comboT: 0, hitSet: null, swingTool: null, rollT: 0, rollCd: 0, rdx: 0, rdy: 0, iT: 0, hurtT: 0,
    walkT: 0, chopCd: 0, bowCd: 0, totals: { wood: 0, stone: 0, iron: 0 }, slimeKills: 0,
  };
}
export function newGame() {
  G.world = G.world || new World();
  resetWorldState();
  G.player = newPlayer();
  G.flags = { sentinels: [false, false, false], bossDead: false, victory: false, chests: [], gateOpened: false, metForeman: false, freeplay: false };
  G.stats = { kills: 0, deaths: 0, time: 0, chopped: 0, mined: 0, crafted: 0, killsBy: {}, damageTaken: 0 };
  G.day = 0.12; clearActors();
}
function resetWorldState() {
  const w = G.world; w.bridgeStage = 0; w.gateOpen = false;
  for (const o of w.objs) { o.gone = false; o.regrow = 0; if (o.maxHp) o.hp = o.maxHp; if (o.kind === 'chest') o.open = false; }
}
function clearActors() { G.enemies = []; G.projs = []; G.hazards = []; G.parts = []; G.pops = []; G.drops = []; G.boss = null; G.hitstop = 0; G.slow = 1; }

// ---------- saving ----------
export function hasSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return !!(s && s.v === 1 && s.player); } catch (e) { return false; } }
export function save() {
  if (!G.player || G.state === 'title') return;
  const p = G.player;
  const data = {
    v: 1, player: { x: p.x, y: p.y, hp: p.hp, lvl: p.lvl, xp: p.xp, coins: p.coins, inv: p.inv, potions: p.potions, arrows: p.arrows, sword: p.sword, axe: p.axe, pick: p.pick, armor: p.armor, shield: p.shield, bow: p.bow, totals: p.totals, slimeKills: p.slimeKills },
    bridge: G.world.bridgeStage, flags: G.flags, stats: G.stats, day: G.day,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) {}
}
export function load() {
  let s = null; try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
  if (!s || s.v !== 1) return false;
  newGame();
  Object.assign(G.player, s.player);
  G.player.inv = Object.assign(Object.fromEntries(MATS.map((m) => [m, 0])), s.player.inv || {});
  G.world.bridgeStage = s.bridge || 0;
  G.flags = Object.assign(G.flags, s.flags || {});
  G.stats = Object.assign(G.stats, s.stats || {});
  G.day = s.day || 0.12;
  for (const o of G.world.objs) if (o.kind === 'chest' && G.flags.chests.includes(o.chest)) o.open = true;
  G.world.gateOpen = G.flags.sentinels.every(Boolean);
  // never load inside the throne room mid-fight or in a wall
  if (G.world.zoneAt(G.player.x, G.player.y) === Z.THRONE && !G.flags.bossDead) { G.player.x = 80 * TS + 8; G.player.y = 86 * TS + 8; }
  if (boxHits(G.player.x, G.player.y, 5)) respawnPoint();
  G.player.hp = Math.max(G.player.hp, 1);
  return true;
}
export function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// ---------- helpers ----------
function boxHits(x, y, hw, fly) { return G.world.hits(x - hw, y - 4, x + hw, y + 2, fly); }
function moveBody(e, dx, dy, hw = 5, fly = false) {
  let blocked = false;
  if (dx) { if (!boxHits(e.x + dx, e.y, hw, fly)) e.x += dx; else blocked = true; }
  if (dy) { if (!boxHits(e.x, e.y + dy, hw, fly)) e.y += dy; else blocked = true; }
  return blocked;
}
export function addParts(x, y, col, n = 8, spd = 60, life = 0.5, grav = 0, size = 1) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7); G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - grav * 0.3, life: life * (0.6 + Math.random() * 0.6), max: life, col, grav, size }); }
}
function pop(x, y, str, col = '#f4f4f4') { G.pops.push({ x, y, str: String(str), col, t: 0 }); }
function toast(msg, kind) { G.ui && G.ui.toast(msg, kind); }
function shake(v) { G.shake = Math.max(G.shake, v); }
export function weaponDmg(p) { return SWORDS[p.sword].dmg + atkBonus(p.lvl); }
export function defense(p) { return ARMORS[p.armor].def; }

// ---------- player ----------
function updatePlayer(dt) {
  const p = G.player, I = G.input;
  p.calmT = (p.calmT || 0) + dt;
  if (p.calmT > 4 && p.hp > 0) { const mh = maxHpFor(p.lvl), safe = G.world.zoneAt(p.x, p.y) === Z.TOWN; p.hp = Math.min(mh, p.hp + dt * (safe ? mh / 6 : 0.6 + mh * 0.006)); }
  p.atkCd -= dt; p.rollCd -= dt; p.iT -= dt; p.hurtT -= dt; p.chopCd -= dt; p.bowCd -= dt; p.comboT -= dt;
  // knockback
  if (p.kbx || p.kby) { moveBody(p, p.kbx * dt, p.kby * dt); p.kbx *= Math.pow(0.0005, dt); p.kby *= Math.pow(0.0005, dt); if (Math.abs(p.kbx) + Math.abs(p.kby) < 4) p.kbx = p.kby = 0; }
  let mx = I.mx, my = I.my; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  if (I.rollP && p.rollCd <= 0 && p.rollT <= 0) {
    let rx = mx, ry = my; if (Math.hypot(rx, ry) < 0.2) { rx = Math.cos(p.aim); ry = Math.sin(p.aim); }
    const l = Math.hypot(rx, ry); p.rdx = rx / l; p.rdy = ry / l; p.rollT = 0.3; p.iT = Math.max(p.iT, 0.34); p.rollCd = 0.55; p.atkT = 0; sfx('roll');
    addParts(p.x, p.y, '#e8d8b0', 5, 30, 0.3);
  }
  if (p.rollT > 0) {
    p.rollT -= dt; moveBody(p, p.rdx * 165 * dt, p.rdy * 165 * dt);
    if (Math.random() < 0.5) G.parts.push({ x: p.x + rand(-3, 3), y: p.y, vx: 0, vy: -8, life: 0.3, max: 0.3, col: '#d8c8a0', grav: 0, size: 1 });
  } else {
    const spd = 74 * (p.atkT > 0 ? 0.45 : 1);
    if (ml > 0.1) {
      moveBody(p, mx * spd * dt, my * spd * dt); p.vx = mx * spd; p.vy = my * spd;
      p.walkT += dt * Math.min(1, ml);
      if (p.atkT <= 0) { p.aim = Math.atan2(my, mx); }
      if (Math.floor(p.walkT * 6) !== Math.floor((p.walkT - dt) * 6) && Math.floor(p.walkT * 6) % 2 === 0) sfx('step');
    }
    else { p.vx = p.vy = 0; }
    if (I.aim != null && (I.attackP || I.bowP)) p.aim = I.aim;
    if (p.atkT <= 0) p.dir = dirOf(p.aim);
  }
  // attack
  if (I.attackP) p.atkBuf = 0.2; p.atkBuf = (p.atkBuf || 0) - dt;
  if (p.atkBuf > 0 && p.atkCd <= 0 && p.rollT <= 0) {
    p.atkBuf = 0;
    p.combo = p.comboT > 0 ? (p.combo % 3) + 1 : 1; p.comboT = 0.7;
    p.atkT = p.combo === 3 ? 0.32 : 0.24; p.atkDur = p.atkT; p.atkCd = p.combo === 3 ? 0.42 : 0.27; p.hitSet = new Set(); p.swingTool = 'sword';
    p.dir = dirOf(p.aim); sfx('swing');
    // slight lunge
    moveBody(p, Math.cos(p.aim) * 4, Math.sin(p.aim) * 4);
  }
  if (p.atkT > 0) {
    const prog = 1 - p.atkT / p.atkDur;
    if (p.swingTool === 'sword' && prog > 0.15 && prog < 0.75) swordHits(p);
    p.atkT -= dt;
  }
  // bow
  if (I.bowP) {
    if (!p.bow) { toast('Craft a Hunting Bow first (12 wood + 4 gel)', 'bad'); }
    else if (p.arrows <= 0) { toast('Out of arrows - craft or buy more', 'bad'); sfx('deny'); }
    else if (p.bowCd <= 0) {
      p.bowCd = 0.38; p.arrows--; sfx('bow'); p.dir = dirOf(p.aim);
      const a = p.aim; G.projs.push({ x: p.x + Math.cos(a) * 6, y: p.y - 6 + Math.sin(a) * 6, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 4, dmg: 6 + atkBonus(p.lvl), owner: 'p', life: 0.9, kind: 'arrow' });
    }
  }
  // potion
  if (I.potionP) {
    const mh = maxHpFor(p.lvl);
    if (p.potions <= 0) { toast('No potions. Craft them from 3 slime gel.', 'bad'); sfx('deny'); }
    else if (p.hp >= mh) toast('Already at full health');
    else { p.potions--; const h = Math.ceil(mh * 0.4); p.hp = Math.min(mh, p.hp + h); pop(p.x, p.y - 20, '+' + h, '#a7f070'); sfx('potion'); addParts(p.x, p.y - 8, '#ff6b8a', 14, 40, 0.7, -40); }
  }
  // interact
  findInteract();
  if ((I.useP || (I.use && G.interactTarget && (G.interactTarget.interact === 'chop' || G.interactTarget.interact === 'mine'))) && p.rollT <= 0) {
    const o = G.interactTarget;
    if (o) interact(o, I.useP);
    else if (I.useP) toast('Nothing here. Walk up to a tree, rock, chest or person.');
  }
  if (p.iT <= 0 && G.world.zoneAt(p.x, p.y) === Z.OCEAN) respawnPoint();
}
function swordHits(p) {
  const S = SWORDS[p.sword], fin = p.combo === 3, reach = S.reach + (fin ? 5 : 0), arc = fin ? 1.9 : 1.25;
  const cx = p.x, cy = p.y - 6;
  for (const e of G.enemies) {
    if (e.dead || p.hitSet.has(e) || e.hidden) continue;
    const ex = e.x, ey = e.y - (e.fly ? 10 : 5) * (e.scale || 1);
    const d = Math.hypot(ex - cx, ey - cy) - e.r;
    if (d > reach) continue;
    const a = Math.atan2(ey - cy, ex - cx);
    if (d > 4 && angDiff(a, p.aim) > arc) continue;
    p.hitSet.add(e);
    let dmg = weaponDmg(p) * (fin ? 1.5 : 1) * rand(0.9, 1.1);
    const crit = Math.random() < 0.08; if (crit) dmg *= 1.8;
    damageEnemy(e, dmg, Math.cos(a), Math.sin(a), fin ? 230 : 150, crit);
  }
  if (G.boss && !p.hitSet.has(G.boss) && G.boss.alive && !G.boss.hidden) {
    const b = G.boss, by = b.y - 16, d = Math.hypot(b.x - cx, by - cy) - 14;
    const a = Math.atan2(by - cy, b.x - cx);
    if (d <= reach && (d < 4 || angDiff(a, p.aim) < arc)) { p.hitSet.add(b); let dmg = weaponDmg(p) * (fin ? 1.5 : 1) * rand(0.9, 1.1); const crit = Math.random() < 0.08; if (crit) dmg *= 1.8; damageBoss(dmg, crit); }
  }
}
export function damageEnemy(e, dmg, nx, ny, kb, crit) {
  if (e.dead) return;
  if (e.dormant) { e.dormant = false; e.t = 0.4; e.state = 'wake'; }
  dmg = Math.max(1, Math.round(dmg - (e.def || 0)));
  if (e.stagger > 0) dmg = Math.round(dmg * 1.5);
  e.hp -= dmg; e.flash = 0.12; e.aggro = true;
  const heavy = e.type === 'sentinel' || e.type === 'sknight' ? 0.35 : e.type === 'rockling' || e.type === 'bigslime' ? 0.55 : 1;
  e.kbx = nx * kb * heavy; e.kby = ny * kb * heavy;
  pop(e.x + rand(-3, 3), e.y - 18 * (e.scale || 1), dmg + (crit ? '!' : ''), crit ? '#ffcd75' : '#f4f4f4');
  addParts(e.x, e.y - 6, e.def_.shadow ? '#8a4bd6' : (e.type.includes('slime') ? '#a7f070' : '#f4f4f4'), crit ? 12 : 6, 80, 0.35);
  G.hitstop = Math.max(G.hitstop, crit ? 0.09 : 0.05); shake(crit ? 4 : 2); sfx(crit ? 'crit' : 'hit');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; const p = G.player, D = e.def_;
  G.stats.kills++; G.stats.killsBy[e.type] = (G.stats.killsBy[e.type] || 0) + 1;
  if (e.type === 'slime' || e.type === 'bslime' || e.type === 'bigslime') p.slimeKills++;
  sfx('enemyDie'); shake(3);
  addParts(e.x, e.y - 6, D.shadow ? '#8a4bd6' : '#f4f4f4', 16, 90, 0.6);
  if (D.shadow) addParts(e.x, e.y - 6, '#2b1740', 10, 50, 0.9, -30, 2);
  const mult = e.mult || 1;
  gainXp(Math.round(D.xp * mult));
  const coins = Math.round(irand(D.coins[0], D.coins[1]) * mult);
  spawnDrop(e.x, e.y, 'coin', coins);
  for (const [m, ch, n] of D.drops) if (Math.random() < ch) spawnDrop(e.x, e.y, m, n);
  if (e.type === 'bigslime') for (let i = 0; i < 3; i++) { const s = spawnEnemy('slime', e.x + rand(-8, 8), e.y + rand(-8, 8)); if (s) { s.aggro = true; s.kbx = rand(-120, 120); s.kby = rand(-120, 120); } }
  if (e.type === 'sentinel') {
    G.flags.sentinels[e.idx] = true; const left = G.flags.sentinels.filter((x) => !x).length;
    if (left === 0) { G.world.gateOpen = true; G.flags.gateOpened = true; toast('The throne room door grinds open...', 'big'); sfx('roar'); shake(8); save(); }
    else toast(`Sentinel destroyed! ${left} left`, 'good');
  }
}
function gainXp(n) {
  const p = G.player; p.xp += n; pop(p.x, p.y - 26, '+' + n + 'xp', '#a7f070');
  while (p.xp >= xpNeeded(p.lvl)) {
    p.xp -= xpNeeded(p.lvl); p.lvl++; p.hp = maxHpFor(p.lvl);
    sfx('levelup'); G.ui && G.ui.banner('LEVEL ' + p.lvl + '!', `HP ${maxHpFor(p.lvl)}  ·  Attack +${atkBonus(p.lvl)}`);
    addParts(p.x, p.y - 8, '#ffcd75', 30, 90, 1, -20); G.flashT = 0.2;
  }
}
export function spawnDrop(x, y, kind, n) {
  if (n <= 0) return;
  if (kind === 'coin') { const pieces = Math.min(n, 6); let left = n; for (let i = 0; i < pieces; i++) { const v = i === pieces - 1 ? left : Math.floor(n / pieces); left -= v; G.drops.push({ x, y, vx: rand(-50, 50), vy: rand(-50, 50), z: 0, vz: rand(60, 110), kind, n: v, t: 0 }); } return; }
  G.drops.push({ x, y, vx: rand(-40, 40), vy: rand(-40, 40), z: 0, vz: rand(60, 100), kind, n, t: 0 });
}
function updateDrops(dt) {
  const p = G.player;
  for (const d of G.drops) {
    d.t += dt; d.vz -= 300 * dt; d.z = Math.max(0, d.z + d.vz * dt); if (d.z === 0) { d.vx *= 0.85; d.vy *= 0.85; d.vz = Math.abs(d.vz) > 40 ? -d.vz * 0.4 : 0; }
    d.x += d.vx * dt; d.y += d.vy * dt;
    const dd = Math.hypot(p.x - d.x, p.y - 4 - d.y);
    if (d.t > 0.35 && dd < 40) { const s = 160 * (1 - dd / 50) + 60; d.x += (p.x - d.x) / dd * s * dt; d.y += (p.y - 4 - d.y) / dd * s * dt; }
    if (d.t > 0.35 && dd < 8) {
      d.taken = true;
      if (d.kind === 'coin') { p.coins += d.n; sfx('coin'); pop(p.x, p.y - 22, '+' + d.n, '#ffcd75'); }
      else if (d.kind === 'potion') { p.potions += d.n; sfx('pickup'); }
      else if (d.kind === 'arrow') { p.arrows += d.n; sfx('pickup'); }
      else { p.inv[d.kind] = (p.inv[d.kind] || 0) + d.n; if (p.totals[d.kind] != null) p.totals[d.kind] += d.n; sfx('pickup'); G.ui && G.ui.gain(d.kind, d.n); }
    }
    if (d.t > 90) d.taken = true;
  }
  G.drops = G.drops.filter((d) => !d.taken);
}

// ---------- interaction ----------
function findInteract() {
  const p = G.player, w = G.world;
  const px = p.x + Math.cos(p.aim) * 8, py = p.y - 4 + Math.sin(p.aim) * 8;
  let best = null, bd = 1e9;
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
    const g = w.grid[y * N + x]; if (!g) continue;
    for (const o of g) {
      if (!o.interact || o.gone || (o.kind === 'chest' && o.open)) continue;
      const oy = o.y - 4, d = Math.hypot(o.x - px, oy - py) - (o.kind === 'stall' || o.kind === 'workbench' ? 10 : 0);
      if (d < 16 && d < bd) { bd = d; best = o; }
    }
  }
  G.interactTarget = best;
}
function interact(o, pressed) {
  const p = G.player;
  if (o.interact === 'chop' || o.interact === 'mine') {
    if (p.chopCd > 0) return;
    const pow = o.interact === 'chop' ? AXES[p.axe].pow : PICKS[p.pick].pow;
    if (o.interact === 'mine') {
      if (pow <= 0) { if (pressed) { toast('You need a pickaxe. Craft one at the workbench (8 wood).', 'bad'); sfx('deny'); } return; }
      if (o.ore === 1 && p.pick < 2) { if (pressed) { toast('Iron ore needs a Stone Pickaxe.', 'bad'); sfx('deny'); } return; }
    }
    p.chopCd = 0.34; p.atkT = 0.22; p.atkDur = 0.22; p.swingTool = o.interact === 'chop' ? 'axe' : 'pick'; p.hitSet = new Set();
    p.aim = Math.atan2(o.y - 6 - (p.y - 6), o.x - p.x); p.dir = dirOf(p.aim);
    o.hp -= pow; o.shake = 0.2;
    sfx(o.interact === 'chop' ? 'chop' : 'mine');
    addParts(o.x, o.y - 8, o.interact === 'chop' ? '#9a6232' : '#94b0c2', 6, 50, 0.4, 120);
    if (o.interact === 'chop') addParts(o.x, o.y - 20, '#38b764', 4, 30, 0.7, 60);
    shake(1);
    if (o.hp <= 0) {
      o.gone = true; o.regrow = o.interact === 'chop' ? 75 : 110;
      if (o.interact === 'chop') { const n = 3 + (p.axe >= 2 ? 1 : 0); spawnDrop(o.x, o.y - 4, 'wood', n); G.stats.chopped++; sfx('treeFall'); addParts(o.x, o.y - 18, '#38b764', 18, 70, 0.8, 80); shake(3); }
      else { if (o.ore === 1) { spawnDrop(o.x, o.y - 4, 'iron', 2); spawnDrop(o.x, o.y - 4, 'stone', 1); } else spawnDrop(o.x, o.y - 4, 'stone', 2); G.stats.mined++; sfx('rockBreak'); addParts(o.x, o.y - 6, '#94b0c2', 14, 80, 0.6, 150); shake(3); }
    }
    return;
  }
  if (!pressed) return;
  if (o.interact === 'chest') {
    o.open = true; G.flags.chests.push(o.chest); sfx('chest');
    const z = G.world.zoneAt(o.x, o.y), tier = Math.max(1, ZONE_TIER[z] || 1);
    spawnDrop(o.x, o.y - 6, 'coin', irand(12, 22) * tier);
    const mats = [['wood', 6], ['stone', 5], ['gel', 3], ['iron', 3], ['bone', 3], ['cloth', 3]];
    for (let i = 0; i < 2; i++) { const [m, n] = mats[Math.min(mats.length - 1, irand(0, 1 + tier))]; spawnDrop(o.x, o.y - 6, m, n); }
    spawnDrop(o.x, o.y - 6, 'potion', 1);
    toast('Treasure chest!', 'good'); addParts(o.x, o.y - 8, '#ffcd75', 20, 80, 0.8, -20); save();
    return;
  }
  G.ui && G.ui.open(o.interact, o);
}

// ---------- crafting / shop / bridge (called by UI) ----------
export function canAfford(cost) { const p = G.player; return Object.entries(cost).every(([k, v]) => k === 'coins' ? p.coins >= v : (p.inv[k] || 0) >= v); }
function pay(cost) { const p = G.player; for (const [k, v] of Object.entries(cost)) { if (k === 'coins') p.coins -= v; else p.inv[k] -= v; } }
export function craft(id) {
  const r = RECIPES.find((x) => x.id === id), p = G.player;
  if (!r || (r.have && r.have(p))) return false;
  if (r.need && !r.need(p)) { toast('Needs a Hunting Bow first', 'bad'); sfx('deny'); return false; }
  if (!canAfford(r.cost)) { sfx('deny'); toast('Not enough materials', 'bad'); return false; }
  pay(r.cost); r.apply(p); G.stats.crafted++; sfx('craft'); toast('Crafted ' + r.name + '!', 'good');
  addParts(p.x, p.y - 10, '#ffcd75', 16, 60, 0.6, -20); save(); return true;
}
export function sell(mat, all) {
  const p = G.player, n = all ? p.inv[mat] : Math.min(1, p.inv[mat]); if (!n) { sfx('deny'); return; }
  p.inv[mat] -= n; p.coins += n * SELL[mat]; sfx('coin'); save();
}
export function buy(what) {
  const p = G.player, price = what === 'potion' ? 15 : 8;
  if (what === 'arrows' && !p.bow) { toast('You need a bow for arrows', 'bad'); sfx('deny'); return; }
  if (p.coins < price) { sfx('deny'); toast('Not enough coins', 'bad'); return; }
  p.coins -= price; if (what === 'potion') p.potions++; else p.arrows += 10; sfx('coin'); save();
}
export function buildBridge() {
  const w = G.world; if (w.bridgeStage >= 5) return false;
  const c = BRIDGE[w.bridgeStage];
  if (!canAfford(c)) { sfx('deny'); toast('Bram needs more coins and materials', 'bad'); return false; }
  pay(c); w.bridgeStage++; sfx('build'); shake(5);
  const rows = w.bridgeBuiltRows();
  for (const y of rows.slice(0, 3)) addParts(80 * TS + 8, y * TS + 8, '#c98a4b', 12, 70, 0.8, 60);
  G.ui && G.ui.banner(w.bridgeStage >= 5 ? 'BRIDGE COMPLETE!' : 'BRIDGE STAGE ' + w.bridgeStage + ' / 5', w.bridgeStage >= 5 ? 'The Shadow Castle awaits...' : 'Bram and the crew hammer away');
  G.flags.metForeman = true; save(); return true;
}

// ---------- damage to player ----------
export function hurtPlayer(dmg, sx, sy, kb = 120) {
  const p = G.player;
  if (p.iT > 0 || G.state !== 'play' || G.god) return false;
  const a = Math.atan2(sy - (p.y - 6), sx - p.x);
  let blocked = false;
  if (p.shield > 0 && p.atkT <= 0 && angDiff(a, p.aim) < 1.05) { dmg *= 1 - SHIELDS[p.shield].block; blocked = true; }
  dmg = Math.max(1, Math.round(dmg - defense(p)));
  p.hp -= dmg; G.stats.damageTaken += dmg; p.calmT = 0; p.iT = 0.75; p.hurtT = 0.25;
  p.kbx = -Math.cos(a) * kb; p.kby = -Math.sin(a) * kb;
  pop(p.x, p.y - 20, '-' + dmg, '#ff5060');
  if (blocked) { sfx('block'); addParts(p.x + Math.cos(a) * 8, p.y - 6 + Math.sin(a) * 8, '#ffcd75', 8, 70, 0.3); }
  sfx('hurt'); shake(5); G.hitstop = Math.max(G.hitstop, 0.07); G.ui && G.ui.hurt();
  addParts(p.x, p.y - 6, '#b13e53', 8, 70, 0.4);
  if (p.hp <= 0) die();
  return true;
}
function die() {
  const p = G.player; p.hp = 0; G.stats.deaths++; sfx('die'); shake(10);
  addParts(p.x, p.y - 6, '#f4f4f4', 30, 100, 1);
  G.state = 'dying'; G.dyingT = 1.1; G.slow = 0.3;
}
export function respawnPoint() {
  const p = G.player, w = G.world;
  const atCamp = w.bridgeStage >= 1;
  p.x = (atCamp ? CAMP.x : TOWN.x) * TS + 8; p.y = (atCamp ? CAMP.y + 2 : TOWN.y + 2) * TS + 8; p.kbx = p.kby = 0;
}
export function retry() {
  const p = G.player; const lost = Math.floor(p.coins * 0.1); p.coins -= lost;
  p.hp = maxHpFor(p.lvl); respawnPoint(); p.iT = 1.5;
  G.enemies = G.enemies.filter((e) => e.type === 'sentinel' && !e.dead); G.projs = []; G.hazards = []; G.drops = [];
  for (const e of G.enemies) { e.hp = e.maxHp; e.x = e.homeX; e.y = e.homeY; e.aggro = false; }
  if (G.boss) { G.boss = null; }
  if (G.flags.sentinels.every(Boolean)) G.world.gateOpen = true;
  G.state = 'play'; G.slow = 1;
  if (lost > 0) toast(`You dropped ${lost} coins`, 'bad');
  save();
}

// ---------- enemies ----------
export function spawnEnemy(type, x, y, mult = 1) {
  const D = ENEMIES[type];
  const e = { type, def_: D, x, y, homeX: x, homeY: y, hp: Math.round(D.hp * mult), maxHp: Math.round(D.hp * mult), dmg: D.dmg * (1 + (mult - 1) * 0.6), spd: D.spd, r: D.r, fly: !!D.fly, def: D.def || 0, scale: D.scale || 1,
    state: 'idle', t: rand(0, 1), cd: rand(0.5, 1.5), dir: 'down', flash: 0, anim: rand(0, 10), kbx: 0, kby: 0, aggro: false, mult, tele: 0, stagger: 0, wx: 0, wy: 0 };
  if (type === 'rockling') { e.dormant = true; }
  G.enemies.push(e); return e;
}
function nightness() { const d = G.day; return d > 0.68 && d < 0.98 ? Math.min(1, (d - 0.68) / 0.05, (0.98 - d) / 0.05) : 0; }
export function isNight() { return nightness() > 0.5; }
let spawnT = 0;
function spawning(dt) {
  spawnT -= dt; if (spawnT > 0) return; spawnT = 1.7;
  const p = G.player, w = G.world, z = w.zoneAt(p.x, p.y);
  // despawn far enemies
  G.enemies = G.enemies.filter((e) => e.type === 'sentinel' || dist(e, p) < 560 || e.dead);
  let tbl = SPAWNS[z]; if (!tbl) return;
  if (z === Z.CASTLE && G.flags.bossDead) return;
  if (p.x > CASTLE.x0 * TS && p.x < (CASTLE.x1 + 1) * TS && p.y > CASTLE.y0 * TS && p.y < (CASTLE.y1 + 1) * TS) return; // courtyard: only the Sentinels
  const near = G.enemies.filter((e) => !e.dead && e.type !== 'sentinel' && dist(e, p) < 420).length;
  const night = isNight();
  const cap = tbl.cap + (night && z < 4 ? 2 : 0);
  if (near >= cap) return;
  let list = tbl.list; if (night && NIGHT_EXTRA[z]) list = list.concat(NIGHT_EXTRA[z]);
  let tot = list.reduce((s, x) => s + x[1], 0), r = Math.random() * tot, type = list[0][0];
  for (const [t, wt] of list) { if ((r -= wt) < 0) { type = t; break; } }
  for (let tries = 0; tries < 20; tries++) {
    const a = Math.random() * Math.PI * 2, d = z === Z.CASTLE ? rand(90, 170) : rand(170, 260);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    const zz = w.zoneAt(x, y);
    if (zz !== z && !(z === Z.CASTLE && zz === Z.CASTLE)) continue;
    if (boxHits(x, y, 7)) continue;
    const inC = (X, Y) => X > CASTLE.x0 * TS && X < (CASTLE.x1 + 1) * TS && Y > CASTLE.y0 * TS && Y < (CASTLE.y1 + 1) * TS;
    if (inC(x, y) !== inC(p.x, p.y)) continue;
    let mult = 1; if (z === Z.GRAVE) mult = 1.3; if (night) mult *= 1.15;
    if ((type === 'zombie' || type === 'bat') && z <= 1) mult *= 0.8;
    spawnEnemy(type, x, y, mult); return;
  }
}
function ensureSentinels() {
  const p = G.player, z = G.world.zoneAt(p.x, p.y);
  if (z !== Z.CASTLE && z !== Z.THRONE) return;
  const spots = [[74, 84], [86, 84], [80, 86]];
  G.flags.sentinels.forEach((dead, i) => {
    if (dead || G.enemies.some((e) => e.type === 'sentinel' && e.idx === i && !e.dead)) return;
    const e = spawnEnemy('sentinel', spots[i][0] * TS + 8, spots[i][1] * TS + 8); e.idx = i;
  });
}
function updateEnemies(dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.anim += dt; e.flash -= dt; e.cd -= dt; e.t -= dt; e.stagger -= dt;
    const dx = p.x - e.x, dy = (p.y - 4) - (e.y - 4), d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    if (!e.aggro && d < (e.type === 'sentinel' ? 90 : 115) && !e.dormant) { e.aggro = true; }
    if (e.aggro && d > 300 && e.type !== 'sentinel') e.aggro = false;
    if (e.type === 'sentinel' && e.aggro && Math.hypot(e.x - e.homeX, e.y - e.homeY) > 220) { e.aggro = false; }
    // knockback
    if (e.kbx || e.kby) { moveBody(e, e.kbx * dt, e.kby * dt, 4, e.fly); e.kbx *= Math.pow(0.002, dt); e.kby *= Math.pow(0.002, dt); if (Math.abs(e.kbx) + Math.abs(e.kby) < 5) e.kbx = e.kby = 0; }
    let mvx = 0, mvy = 0; const S = e.spd;
    const wander = () => { if (e.t <= 0) { e.t = rand(1, 3); const a = Math.random() * Math.PI * 2; const r = Math.random() < 0.4 ? 0 : 1; e.wx = Math.cos(a) * r; e.wy = Math.sin(a) * r; } mvx = e.wx * S * 0.4; mvy = e.wy * S * 0.4; };
    let contact = true;
    switch (e.type) {
      case 'slime': case 'bslime': case 'bigslime': case 'sslime': {
        if (e.state === 'hop') { mvx = e.hx; mvy = e.hy; if (e.t <= 0) { e.state = 'idle'; e.t = rand(0.5, 1.0) * (e.type === 'sslime' ? 0.6 : 1); } }
        else if (e.t <= 0) {
          const a = e.aggro ? Math.atan2(ny, nx) + rand(-0.3, 0.3) : Math.random() * Math.PI * 2;
          const sp = S * 2.4 * (e.aggro ? 1 : 0.5); e.hx = Math.cos(a) * sp; e.hy = Math.sin(a) * sp; e.state = 'hop'; e.t = 0.35;
          if (e.aggro && d < 140) sfx('slime');
        }
        break;
      }
      case 'zombie': {
        contact = true;
        if (e.state === 'tele') { if (e.t <= 0) { e.state = 'lunge'; e.t = 0.32; e.lx = nx; e.ly = ny; } }
        else if (e.state === 'lunge') { mvx = e.lx * 150; mvy = e.ly * 150; if (e.t <= 0) { e.state = 'idle'; e.cd = rand(1.4, 2); } }
        else if (e.aggro) { mvx = nx * S; mvy = ny * S; if (d < 42 && e.cd <= 0) { e.state = 'tele'; e.t = 0.45; e.tele = 0.45; } }
        else wander();
        break;
      }
      case 'skeleton': {
        contact = false;
        if (e.state === 'tele') { if (e.t <= 0) { e.state = 'idle'; e.cd = rand(1.5, 2.2); const lead = 0.25; const tx = p.x + p.vx * lead, ty = p.y - 6; const a = Math.atan2(ty - (e.y - 8), tx - e.x); G.projs.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 115, vy: Math.sin(a) * 115, r: 3, dmg: e.dmg, owner: 'e', life: 2.2, kind: 'bone', rot: 0 }); sfx('throw'); } }
        else if (e.aggro) {
          if (d < 55) { mvx = -nx * S; mvy = -ny * S; } else if (d > 95) { mvx = nx * S; mvy = ny * S; } else { mvx = -ny * S * 0.6 * (e.strafe || 1); mvy = nx * S * 0.6 * (e.strafe || 1); if (Math.random() < 0.01) e.strafe = -(e.strafe || 1); }
          if (e.cd <= 0 && d < 150) { e.state = 'tele'; e.t = 0.45; e.tele = 0.45; }
        } else wander();
        break;
      }
      case 'bat': {
        if (e.state === 'tele') { if (e.t <= 0) { e.state = 'swoop'; e.t = 0.45; e.lx = nx; e.ly = ny; } }
        else if (e.state === 'swoop') { mvx = e.lx * 160; mvy = e.ly * 160; if (e.t <= 0) { e.state = 'idle'; e.cd = rand(1.2, 2); } }
        else if (e.aggro) { const s = Math.sin(e.anim * 4); mvx = nx * S * 0.6 + -ny * s * S * 0.8; mvy = ny * S * 0.6 + nx * s * S * 0.8; if (d < 75 && e.cd <= 0) { e.state = 'tele'; e.t = 0.3; e.tele = 0.3; } }
        else { mvx = Math.cos(e.anim) * S * 0.5; mvy = Math.sin(e.anim * 1.3) * S * 0.5; }
        break;
      }
      case 'rockling': {
        if (e.dormant) { contact = false; if (d < 26) { e.dormant = false; e.state = 'wake'; e.t = 0.5; e.aggro = true; sfx('rockBreak'); shake(2); } break; }
        if (e.state === 'wake') { contact = false; if (e.t <= 0) e.state = 'idle'; break; }
        if (e.state === 'tele') { contact = false; if (e.t <= 0) { e.state = 'idle'; e.cd = 2; G.hazards.push({ kind: 'circle', x: e.x, y: e.y - 4, r: 26, delay: 0, t: 0, dmg: e.dmg, done: false, life: 0.25, col: '#94b0c2' }); sfx('boom'); shake(4); addParts(e.x, e.y, '#94b0c2', 16, 90, 0.5); } break; }
        if (e.aggro) { mvx = nx * S; mvy = ny * S; if (d < 30 && e.cd <= 0) { e.state = 'tele'; e.t = 0.55; e.tele = 0.55; G.hazards.push({ kind: 'warn', x: e.x, y: e.y - 4, r: 26, t: 0, life: 0.55 }); } }
        else wander();
        break;
      }
      case 'hound': {
        contact = e.state === 'pounce';
        if (e.state === 'tele') { if (e.t <= 0) { e.state = 'pounce'; e.t = 0.38; e.lx = nx; e.ly = ny; sfx('shadow'); } }
        else if (e.state === 'pounce') { mvx = e.lx * 230; mvy = e.ly * 230; if (e.t <= 0) { e.state = 'idle'; e.cd = rand(1.4, 2.2); e.stagger = 0.4; } }
        else if (e.aggro) { mvx = nx * S; mvy = ny * S; if (d < 85 && e.cd <= 0) { e.state = 'tele'; e.t = 0.5; e.tele = 0.5; } }
        else wander();
        break;
      }
      case 'wisp': {
        contact = false;
        if (e.state === 'fade') { e.hidden = e.t < 0.3; if (e.t <= 0) { const a = Math.random() * Math.PI * 2, r = rand(70, 95); const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (!boxHits(x, y, 4, true)) { e.x = x; e.y = y; } e.hidden = false; e.state = 'tele'; e.t = 0.6; e.tele = 0.6; addParts(e.x, e.y - 8, '#8a4bd6', 12, 60, 0.5); } }
        else if (e.state === 'tele') { if (e.t <= 0) { e.state = 'idle'; e.cd = rand(3, 4.2); for (let i = -1; i <= 1; i++) { const a = Math.atan2(ny, nx) + i * 0.35; G.projs.push({ x: e.x, y: e.y - 10, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, r: 4, dmg: e.dmg, owner: 'e', life: 3, kind: 'orb', homing: 1.2 }); } sfx('shadow'); } }
        else if (e.aggro) { const want = 85; mvx = (d > want ? nx : -nx) * S * 0.7 + -ny * S * 0.4; mvy = (d > want ? ny : -ny) * S * 0.7 + nx * S * 0.4; if (e.cd <= 0) { e.state = Math.random() < 0.5 ? 'fade' : 'tele'; e.t = e.state === 'fade' ? 0.6 : 0.6; e.tele = e.state === 'tele' ? 0.6 : 0; } }
        else { mvx = Math.cos(e.anim * 0.7) * S * 0.3; mvy = Math.sin(e.anim) * S * 0.3; }
        break;
      }
      case 'sknight': case 'sentinel': {
        contact = e.state === 'dash';
        const big = e.type === 'sentinel';
        if (e.state === 'tele') { e.lx = e.lx ?? nx; if (e.t <= 0) { e.state = 'dash'; e.t = big ? 0.42 : 0.36; sfx('swing'); } }
        else if (e.state === 'dash') { mvx = e.lx * 270; mvy = e.ly * 270; if (Math.random() < 0.6) G.parts.push({ x: e.x, y: e.y - 6, vx: 0, vy: 0, life: 0.3, max: 0.3, col: '#8a4bd6', grav: 0, size: 2 });
          if (e.t <= 0) { e.state = 'recover'; e.t = big ? 0.8 : 0.7; e.stagger = e.t; if (big) { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; G.projs.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, r: 4, dmg: e.dmg * 0.6, owner: 'e', life: 2, kind: 'orb' }); } sfx('shadow'); } } }
        else if (e.state === 'recover') { if (e.t <= 0) { e.state = 'idle'; e.cd = rand(1.2, 2); } }
        else if (e.state === 'swipeT') { if (e.t <= 0) { e.state = 'recover'; e.t = 0.4; } }
        else if (e.aggro) {
          mvx = nx * S; mvy = ny * S;
          if (e.cd <= 0 && d < 30) { e.state = 'swipeT'; e.t = 0.5; e.tele = 0.5; e.cd = 1.2; G.hazards.push({ kind: 'circle', x: e.x + nx * 14, y: e.y - 4 + ny * 14, r: big ? 26 : 20, delay: 0.45, t: 0, dmg: e.dmg, life: 0.6, col: '#8a4bd6' }); }
          else if (e.cd <= 0 && d < 120) { e.state = 'tele'; e.t = big ? 0.7 : 0.6; e.tele = e.t; e.lx = nx; e.ly = ny; G.hazards.push({ kind: 'line', x: e.x, y: e.y - 4, ang: Math.atan2(ny, nx), len: 270 * (big ? 0.42 : 0.36), w: 12, t: 0, life: e.t }); sfx('telegraph'); }
        } else { if (big) { const hx = e.homeX - e.x, hy = e.homeY - e.y, hd = Math.hypot(hx, hy); if (hd > 6) { mvx = hx / hd * S; mvy = hy / hd * S; } } else wander(); }
        break;
      }
    }
    if (e.tele > 0) e.tele -= dt;
    if (mvx || mvy) {
      const blocked = moveBody(e, mvx * dt, mvy * dt, 4, e.fly);
      if (blocked && e.aggro && !e.fly) { moveBody(e, -mvy * dt * 0.8, mvx * dt * 0.8, 4); }
      if (Math.abs(mvx) > Math.abs(mvy)) e.dir = mvx > 0 ? 'right' : 'left'; else e.dir = mvy > 0 ? 'down' : 'up';
    }
    // keep enemies out of town
    const ez = G.world.zoneAt(e.x, e.y);
    if (ez === Z.TOWN && e.type !== 'sentinel') { e.aggro = false; const a = Math.atan2(e.y - TOWN.y * TS, e.x - TOWN.x * TS); moveBody(e, Math.cos(a) * 60 * dt, Math.sin(a) * 60 * dt, 4, e.fly); }
    // contact damage
    if (contact && !e.hidden && d < e.r * (e.scale || 1) + 6) hurtPlayer(e.dmg, e.x, e.y - 6);
  }
  // separation
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j]; if (a.dead || b.dead || a.fly !== b.fly) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
    if (d > 0 && d < m) { const push = (m - d) / 2; moveBody(a, -dx / d * push, -dy / d * push, 4, a.fly); moveBody(b, dx / d * push, dy / d * push, 4, b.fly); }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
}

// ---------- projectiles + hazards ----------
function updateProjs(dt) {
  const p = G.player, w = G.world;
  for (const q of G.projs) {
    q.life -= dt; q.rot = (q.rot || 0) + dt * 12;
    if (q.homing) { const a = Math.atan2(p.y - 6 - q.y, p.x - q.x), cur = Math.atan2(q.vy, q.vx); let dA = a - cur; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2; const na = cur + Math.max(-q.homing * dt, Math.min(q.homing * dt, dA)); const sp = Math.hypot(q.vx, q.vy); q.vx = Math.cos(na) * sp; q.vy = Math.sin(na) * sp; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (w.hits(q.x - 1, q.y + 4, q.x + 1, q.y + 6, q.kind !== 'arrow')) { if (q.kind !== 'orb') { q.life = 0; addParts(q.x, q.y, q.kind === 'arrow' ? '#9a6232' : '#eee6c8', 4, 40, 0.3); } }
    if (q.owner === 'e') {
      if (Math.hypot(p.x - q.x, p.y - 6 - q.y) < q.r + 5) { if (hurtPlayer(q.dmg, q.x, q.y, 90)) q.life = 0; }
      // the sword can bat projectiles away
      if (p.atkT > 0 && p.swingTool === 'sword' && Math.hypot(p.x - q.x, p.y - 6 - q.y) < SWORDS[p.sword].reach + 2 && angDiff(Math.atan2(q.y - p.y + 6, q.x - p.x), p.aim) < 1.2 && q.kind === 'bone') { q.life = 0; addParts(q.x, q.y, '#ffcd75', 6, 60, 0.3); sfx('block'); }
    } else {
      for (const e of G.enemies) { if (e.dead || e.hidden) continue; if (Math.hypot(e.x - q.x, e.y - 6 * e.scale - q.y) < e.r * e.scale + q.r) { damageEnemy(e, q.dmg, q.vx / 280, q.vy / 280, 90); q.life = 0; break; } }
      if (q.life > 0 && G.boss && G.boss.alive && !G.boss.hidden && Math.hypot(G.boss.x - q.x, G.boss.y - 16 - q.y) < 16) { damageBoss(q.dmg); q.life = 0; }
    }
  }
  G.projs = G.projs.filter((q) => q.life > 0);
  for (const h of G.hazards) {
    h.t += dt;
    if (h.kind === 'circle' && !h.done && h.t >= (h.delay || 0)) {
      h.done = true; if (Math.hypot(p.x - h.x, p.y - 4 - h.y) < h.r + 3) hurtPlayer(h.dmg, h.x, h.y, 160);
      addParts(h.x, h.y, h.col || '#8a4bd6', 14, 90, 0.5); if (h.boom) { sfx('boom'); shake(5); }
    }
    if (h.kind === 'ring') { const rr = h.t * h.speed; if (!h.hit && Math.abs(Math.hypot(p.x - h.x, p.y - 4 - h.y) - rr) < 7 && rr < h.max) { h.hit = true; hurtPlayer(h.dmg, h.x, h.y, 150); } if (rr > h.max) h.life = 0; }
  }
  G.hazards = G.hazards.filter((h) => h.t < (h.life ?? 1));
}

// ---------- boss: Umbra, the Shadow King ----------
function startBoss() {
  const b = { x: 80 * TS + 8, y: 74 * TS + 8, hp: 1300, maxHp: 1300, alive: true, phase: 1, state: 'intro', t: 2.2, flash: 0, anim: 0, atk: 0, hidden: false, stagger: 0, z: 0, dir: 0, tele: 0 };
  G.boss = b; G.world.gateOpen = false; sfx('roar'); shake(10); playMusic('boss');
  G.ui && G.ui.banner('UMBRA', 'the Shadow King', 2.2);
}
export function damageBoss(dmg, crit) {
  const b = G.boss; if (!b || !b.alive || b.state === 'intro') return;
  dmg = Math.max(1, Math.round(dmg - 3)); if (b.stagger > 0) dmg = Math.round(dmg * 1.6);
  b.hp -= dmg; b.flash = 0.1; pop(b.x + rand(-6, 6), b.y - 40, dmg + (crit ? '!' : ''), crit ? '#ffcd75' : (b.stagger > 0 ? '#73eff7' : '#f4f4f4'));
  addParts(b.x, b.y - 16, '#8a4bd6', 8, 90, 0.4); G.hitstop = Math.max(G.hitstop, crit ? 0.09 : 0.05); shake(2); sfx(crit ? 'crit' : 'hit');
  const ph = b.hp > b.maxHp * 0.66 ? 1 : b.hp > b.maxHp * 0.33 ? 2 : 3;
  if (ph !== b.phase && b.hp > 0) {
    b.phase = ph; b.state = 'phase'; b.t = 1.6; b.hidden = false; G.hazards = G.hazards.filter((h) => h.kind !== 'line');
    sfx('roar'); shake(12); G.ui && G.ui.banner(ph === 2 ? 'PHASE 2' : 'FINAL PHASE', ph === 2 ? 'Umbra calls the shadows' : 'Umbra is enraged!', 1.4);
    G.hazards.push({ kind: 'ring', x: b.x, y: b.y - 4, t: 0, speed: 160, max: 200, dmg: 0, hit: true, life: 1.4 });
    const p = G.player; const a = Math.atan2(p.y - b.y, p.x - b.x); p.kbx = Math.cos(a) * 260; p.kby = Math.sin(a) * 260;
  }
  if (b.hp <= 0) bossDie();
}
function bossDie() {
  const b = G.boss; b.alive = false; b.state = 'dead'; b.t = 3;
  G.slow = 0.25; G.hazards = []; G.projs = []; sfx('roar'); shake(16);
  for (const e of G.enemies) if (e.def_.shadow) { e.hp = 0; killEnemy(e); }
  G.flags.bossDead = true; G.stats.kills++; G.stats.killsBy.boss = 1;
  gainXp(400); spawnDrop(b.x, b.y, 'coin', 300);
  G.world.gateOpen = true; save();
}
function updateBoss(dt) {
  const b = G.boss; if (!b) return;
  const p = G.player;
  b.anim += dt; b.flash -= dt; b.t -= dt; b.stagger -= dt; if (b.tele > 0) b.tele -= dt;
  if (b.state === 'dead') {
    b.t -= dt / G.slow - dt; if (b.t < 2) G.slow = 1;
    if (Math.random() < 0.5) addParts(b.x + rand(-16, 16), b.y - rand(0, 36), Math.random() < 0.5 ? '#8a4bd6' : '#f4f4f4', 3, 80, 0.8, -20, 2);
    if (b.t <= 0) { G.boss = null; G.slow = 1; victory(); }
    return;
  }
  const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  const P = b.phase, speedMul = P === 3 ? 1.35 : 1;
  const arena = { x0: 72 * TS, x1: 89 * TS, y0: 72 * TS, y1: 78 * TS + 12 };
  const clampB = () => { b.x = Math.max(arena.x0 + 8, Math.min(arena.x1 - 8, b.x)); b.y = Math.max(arena.y0 + 10, Math.min(arena.y1, b.y)); };
  if (b.state === 'intro' || b.state === 'phase') { if (b.t <= 0) { b.state = 'walk'; b.t = 0.8; } return; }
  if (b.state === 'walk') {
    if (d > 26) { b.x += nx * 34 * speedMul * dt; b.y += ny * 34 * speedMul * dt; clampB(); }
    b.dir = nx;
    if (b.t <= 0) {
      const opts = P === 1 ? ['slam', 'dash', 'burst', 'slam'] : P === 2 ? ['slam', 'dash', 'burst', 'summon', 'teleport', 'dash'] : ['pools', 'dash', 'spiral', 'teleport', 'slam', 'pools'];
      let pick = opts[Math.floor(Math.random() * opts.length)];
      if (pick === b.last && Math.random() < 0.7) pick = opts[(opts.indexOf(pick) + 1) % opts.length];
      if (pick === 'summon' && G.enemies.filter((e) => e.type === 'wisp').length >= 2) pick = 'burst';
      b.last = pick; b.state = pick; b.step = 0; b.t = 0;
    }
    return;
  }
  const done = (rest = 1) => { b.state = 'walk'; b.t = rest / speedMul; };
  switch (b.state) {
    case 'slam': {
      // leap onto a telegraphed circle at the player's position, then shockwave
      if (b.step === 0) { b.sx = b.x; b.sy = b.y; b.tx = p.x; b.ty = p.y; const tt = P === 3 ? 0.65 : 0.9; b.dur = tt; b.t = tt; b.step = 1; b.tele = tt; G.hazards.push({ kind: 'circle', x: b.tx, y: b.ty - 4, r: 36, delay: tt, t: 0, dmg: 15, life: tt + 0.15, boom: true }); sfx('telegraph'); }
      else if (b.step === 1) { const k = 1 - b.t / b.dur; b.x = b.sx + (b.tx - b.sx) * k; b.y = b.sy + (b.ty - b.sy) * k; b.z = Math.sin(k * Math.PI) * 40; clampB(); if (b.t <= 0) { b.z = 0; b.step = 2; b.t = 0.5; G.hazards.push({ kind: 'ring', x: b.x, y: b.y - 4, t: 0, speed: 130, max: P >= 2 ? 170 : 130, dmg: 10, life: 2 }); addParts(b.x, b.y, '#8a4bd6', 24, 120, 0.6); b.count = (b.count || 0) + 1; } }
      else if (b.t <= 0) { if (P >= 2 && b.count < (P === 3 ? 3 : 2)) { b.step = 0; } else { b.count = 0; done(0.9); } }
      break;
    }
    case 'dash': {
      if (b.step === 0) { b.lx = nx; b.ly = ny; const tt = P === 3 ? 0.5 : 0.75; b.t = tt; b.step = 1; b.tele = tt; G.hazards.push({ kind: 'line', x: b.x, y: b.y - 6, ang: Math.atan2(ny, nx), len: 260, w: 24, t: 0, life: tt }); sfx('telegraph'); }
      else if (b.step === 1) { if (b.t <= 0) { b.step = 2; b.t = 0.55; sfx('swing'); } }
      else if (b.step === 2) {
        b.x += b.lx * 470 * dt; b.y += b.ly * 470 * dt; const before = [b.x, b.y]; clampB(); const hitWall = before[0] !== b.x || before[1] !== b.y;
        G.parts.push({ x: b.x + rand(-8, 8), y: b.y - rand(0, 30), vx: 0, vy: 0, life: 0.4, max: 0.4, col: '#5d275d', grav: 0, size: 3 });
        if (Math.hypot(p.x - b.x, p.y - b.y) < 20) hurtPlayer(17, b.x, b.y - 10, 220);
        if (b.t <= 0 || hitWall) { b.step = 3; b.t = 1.2; b.stagger = 1.2; if (hitWall) { shake(6); sfx('boom'); } b.count = (b.count || 0) + 1; }
      } else if (b.t <= 0) { if (P === 3 && b.count < 2) { b.step = 0; } else { b.count = 0; done(0.6); } }
      break;
    }
    case 'burst': {
      if (b.step === 0) { b.t = 0.6; b.step = 1; b.tele = 0.6; sfx('telegraph'); }
      else if (b.step <= (P >= 2 ? 3 : 2) && b.t <= 0) { const n = 14, off = b.step * 0.22; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + off; G.projs.push({ x: b.x, y: b.y - 16, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, r: 4, dmg: 9, owner: 'e', life: 3.5, kind: 'orb' }); } sfx('shadow'); b.step++; b.t = 0.5; }
      else if (b.step > (P >= 2 ? 3 : 2) && b.t <= 0) done(1);
      break;
    }
    case 'spiral': {
      if (b.step === 0) { b.t = 2.6; b.step = 1; b.tele = 0.4; b.sp = 0; }
      b.sp = (b.sp || 0) + dt; if (b.sp > 0.09) { b.sp = 0; const a = b.anim * 3.2; for (let k = 0; k < 3; k++) { const aa = a + k * Math.PI * 2 / 3; G.projs.push({ x: b.x, y: b.y - 16, vx: Math.cos(aa) * 80, vy: Math.sin(aa) * 80, r: 4, dmg: 8, owner: 'e', life: 3.2, kind: 'orb' }); } }
      if (b.t <= 0) done(1.1);
      break;
    }
    case 'summon': {
      if (b.step === 0) { b.t = 0.9; b.step = 1; b.tele = 0.9; sfx('shadow'); }
      else if (b.t <= 0) { for (let i = 0; i < 2; i++) { const e = spawnEnemy(Math.random() < 0.5 ? 'wisp' : 'sslime', b.x + (i ? 30 : -30), b.y + 10, 0.8); e.aggro = true; addParts(e.x, e.y - 8, '#8a4bd6', 16, 70, 0.6); } done(0.8); }
      break;
    }
    case 'teleport': {
      if (b.step === 0) { b.t = 0.45; b.step = 1; b.hidden = false; addParts(b.x, b.y - 16, '#2b1740', 20, 60, 0.6, -20, 2); }
      else if (b.step === 1 && b.t <= 0) { b.hidden = true; b.step = 2; b.t = 0.75; const a = Math.random() * Math.PI * 2; b.tx = p.x + Math.cos(a) * 50; b.ty = p.y + Math.sin(a) * 30; b.tx = Math.max(arena.x0 + 8, Math.min(arena.x1 - 8, b.tx)); b.ty = Math.max(arena.y0 + 10, Math.min(arena.y1, b.ty)); G.hazards.push({ kind: 'circle', x: b.tx, y: b.ty - 4, r: 30, delay: 0.75, t: 0, dmg: 12, life: 0.9, boom: true }); }
      else if (b.step === 2 && b.t <= 0) { b.x = b.tx; b.y = b.ty; b.hidden = false; addParts(b.x, b.y - 16, '#8a4bd6', 24, 100, 0.6); b.state = P >= 2 ? 'burst' : 'walk'; b.step = 0; b.t = 0.5; }
      break;
    }
    case 'pools': {
      if (b.step === 0) { b.step = 1; b.t = 1.4; b.tele = 0.6; sfx('telegraph'); for (let i = 0; i < 7; i++) { const x = i === 0 ? p.x : rand(arena.x0 + 10, arena.x1 - 10), y = i === 0 ? p.y : rand(arena.y0 + 12, arena.y1); G.hazards.push({ kind: 'circle', x, y: y - 4, r: 24, delay: 0.95 + i * 0.05, t: 0, dmg: 13, life: 1.2 + i * 0.05, boom: i === 0 }); } }
      else if (b.t <= 0) done(0.7);
      break;
    }
  }
}
function victory() {
  G.flags.victory = true; G.state = 'victory'; sfx('victory'); playMusic('win'); save();
  G.ui && G.ui.open('victory');
}

// ---------- world ticking ----------
function updateWorldObjs(dt) {
  const p = G.player;
  for (const o of G.world.objs) {
    if (o.shake > 0) o.shake -= dt;
    if (o.gone && o.regrow > 0) { o.regrow -= dt; if (o.regrow <= 0) { if (Math.hypot(p.x - o.x, p.y - o.y) < 20) o.regrow = 3; else { o.gone = false; o.hp = o.maxHp; } } }
  }
}
function updateFx(dt) {
  for (const q of G.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.grav * dt; q.vx *= 0.96; }
  G.parts = G.parts.filter((q) => q.life > 0);
  if (G.parts.length > 600) G.parts.splice(0, G.parts.length - 600);
  for (const q of G.pops) q.t += dt;
  G.pops = G.pops.filter((q) => q.t < 0.9);
}
function zoneWatch() {
  const p = G.player, w = G.world, z = w.zoneAt(p.x, p.y);
  if (z !== G.zone) {
    const prev = G.zone; G.zone = z;
    if (z !== Z.LAKE && z !== Z.OCEAN && G.ui) { if (prev !== -1 && !(z === Z.TOWN && prev === Z.TOWN)) G.ui.zoneBanner(ZONE_NAMES[z] + (z === Z.TOWN && Math.abs(p.y / TS - CAMP.y) < 6 ? ' Camp' : ''), ZONE_TIER[z]); }
  }
  // music
  if (G.boss) playMusic('boss');
  else if (G.flags.victory) playMusic('win');
  else if (z === Z.CASTLE || z === Z.THRONE) playMusic('castle');
  else playMusic(isNight() ? 'night' : 'field');
  // throne room trigger
  if (z === Z.THRONE && !G.flags.bossDead && !G.boss && p.y < (CASTLE.innerY - 1) * TS) startBoss();
}

export function update(dt) {
  if (G.state === 'dying') {
    G.dyingT -= dt; updateFx(dt);
    if (G.dyingT <= 0) { G.state = 'dead'; G.slow = 1; save(); G.ui && G.ui.open('dead'); }
    return;
  }
  if (G.state !== 'play') return;
  G.time += dt; G.stats.time += dt;
  G.day = (G.day + dt / 480) % 1;
  if (G.hitstop > 0) { G.hitstop -= dt; return; } // inputs stay buffered through hit-stop
  const sdt = dt * G.slow;
  updatePlayer(sdt);
  ensureSentinels();
  spawning(sdt);
  updateEnemies(sdt);
  updateBoss(sdt);
  updateProjs(sdt);
  updateDrops(sdt);
  updateWorldObjs(sdt);
  updateFx(sdt);
  zoneWatch();
  G.shake *= Math.pow(0.001, dt);
  G.flashT -= dt;
  G.autosaveT += dt; if (G.autosaveT > 15) { G.autosaveT = 0; save(); }
  G.input.clearEdges();
}

// ---------- objectives ----------
export function objective() {
  const p = G.player, w = G.world, f = G.flags;
  const touchUI = typeof document !== 'undefined' && document.body.classList.contains('touch');
  const E = touchUI ? 'tap E' : 'press E';
  const O = [
    { done: p.totals.wood >= 5 || p.sword >= 1, text: `Chop trees for wood: stand by a tree and ${E}`, target: 'tree', prog: `${Math.min(5, p.totals.wood)}/5` },
    { done: p.sword >= 1, text: 'Craft a Wooden Sword at the workbench (5 wood)', target: 'workbench' },
    { done: p.slimeKills >= 5 || p.sword >= 2, text: 'Defeat slimes in the Sunny Meadow', prog: `${Math.min(5, p.slimeKills)}/5`, target: 'enemy' },
    { done: p.pick >= 1 || p.sword >= 2, text: 'Craft a Wooden Pickaxe (8 wood)', target: 'workbench' },
    { done: p.totals.stone >= 8 || p.sword >= 2, text: `Mine grey rocks for stone (${E})`, target: 'rock', prog: `${Math.min(8, p.totals.stone)}/8` },
    { done: p.sword >= 2, text: 'Craft a Stone Sword (4 wood + 8 stone)', target: 'workbench' },
    { done: w.bridgeStage >= 1, text: 'Visit Foreman Bram at Moonlake and fund bridge stage 1', target: 'foreman' },
    { done: p.pick >= 2 || p.sword >= 3, text: 'Craft a Stone Pickaxe to mine iron ore', target: 'workbench' },
    { done: p.totals.iron >= 8 || p.sword >= 3, text: 'Mine orange iron ore in the Pebble Hills (east)', prog: `${Math.min(8, p.totals.iron)}/8`, target: 'ore' },
    { done: p.sword >= 3, text: 'Craft an Iron Sword (4 wood + 8 iron)', target: 'workbench' },
    { done: w.bridgeStage >= 5, text: `Fund the bridge with Bram (stage ${w.bridgeStage}/5). Level up, loot chests, sell spare loot`, target: 'foreman' },
    { done: f.sentinels.every(Boolean), text: 'Cross the bridge. Destroy the 3 Shadow Sentinels', prog: `${f.sentinels.filter(Boolean).length}/3`, target: 'sentinel' },
    { done: f.bossDead, text: 'Enter the throne room. Defeat Umbra, the Shadow King', target: 'throne' },
    { done: false, text: 'Free play: the island is safe. Collect every chest, max your gear!', target: null },
  ];
  return O.find((o) => !o.done);
}
export function objectiveTarget(o) {
  if (!o || !o.target) return null;
  const p = G.player, w = G.world;
  const nearestObj = (fn) => { let best = null, bd = 1e9; for (const ob of w.objs) { if (!fn(ob)) continue; const d = Math.hypot(ob.x - p.x, ob.y - p.y); if (d < bd) { bd = d; best = ob; } } return best; };
  switch (o.target) {
    case 'tree': return nearestObj((ob) => ob.kind === 'tree' && !ob.gone);
    case 'rock': return nearestObj((ob) => ob.kind === 'rock' && !ob.gone && ob.ore === 0);
    case 'ore': return nearestObj((ob) => ob.kind === 'rock' && !ob.gone && ob.ore === 1);
    case 'workbench': return nearestObj((ob) => ob.kind === 'workbench');
    case 'foreman': return nearestObj((ob) => ob.npc === 'foreman');
    case 'sentinel': { const s = G.enemies.find((e) => e.type === 'sentinel'); return s || { x: 80 * TS + 8, y: 86 * TS }; }
    case 'throne': return { x: 80 * TS + 8, y: 74 * TS };
    case 'enemy': { const z = w.zoneAt(p.x, p.y); if (z !== Z.MEADOW) return { x: 80 * TS, y: 118 * TS }; return null; }
  }
  return null;
}
export { ZONE_NAMES, ZONE_TIER, Z, TS, N, RECIPES, BRIDGE, SELL, MATS, SWORDS, AXES, PICKS, ARMORS, SHIELDS };
