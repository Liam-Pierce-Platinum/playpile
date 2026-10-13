// Owned-monster logic: hatching, stats, levels, XP spending (evolve / learn), gacha pulls.
import { SPECIES, SPECIES_BY_ID, RARITY, RARITY_ORDER, LEARN, EVOLVE, levelFromXp, xpForLevel, MAX_LVL, EGG_COST, EGG10_COST } from './data.js';

export function newMon(save, spId) {
  const sp = SPECIES_BY_ID[spId];
  const m = { uid: save.nextUid++, sp: spId, stage: 0, xpTotal: 0, xp: 0, known: sp.pool.slice(0, 3), eq: sp.pool.slice(0, 3) };
  save.mons.push(m);
  if (save.seen && !save.seen.includes(spId)) save.seen.push(spId);
  if (save.active == null) save.active = m.uid;
  return m;
}
export const lvlOf = (m) => levelFromXp(m.xpTotal);
export const formOf = (m) => SPECIES_BY_ID[m.sp].forms[m.stage];
export const speciesOf = (m) => SPECIES_BY_ID[m.sp];

// Battle stats for a species/stage/level (enemies use this too).
export function statsFor(spId, stage, lvl) {
  const sp = SPECIES_BY_ID[spId], b = sp.base, r = RARITY[sp.rarity].mult;
  const s = (stage ? 1.3 : 1) * r * (1 + 0.08 * (lvl - 1));
  return { hp: Math.round(b.hp * s), atk: b.atk * s, def: b.def * s, spd: b.spd * (stage ? 1.06 : 1) };
}

export function giveXp(m, amt) {
  const before = lvlOf(m);
  m.xpTotal += amt; m.xp += amt;
  return lvlOf(m) - before; // levels gained
}
export function levelProgress(m) {
  const l = lvlOf(m); if (l >= MAX_LVL) return { l, cur: 1, need: 1 };
  const a = xpForLevel(l), b = xpForLevel(l + 1);
  return { l, cur: m.xpTotal - a, need: b - a };
}

export function evolveState(m) {
  if (m.stage >= 1) return { ok: false, why: 'Fully evolved' };
  if (lvlOf(m) < EVOLVE.lvl) return { ok: false, why: `Needs Lv ${EVOLVE.lvl}` };
  if (m.xp < EVOLVE.cost) return { ok: false, why: `Needs ${EVOLVE.cost} XP` };
  return { ok: true, why: `Spend ${EVOLVE.cost} XP` };
}
export function evolve(m) { const s = evolveState(m); if (!s.ok) return false; m.xp -= EVOLVE.cost; m.stage = 1; return true; }

export function learnState(m, idx) {
  const sp = speciesOf(m), id = sp.pool[idx];
  if (m.known.includes(id)) return { ok: false, known: true, why: 'Known' };
  const L = LEARN[idx];
  if (lvlOf(m) < L.lvl) return { ok: false, why: `Lv ${L.lvl}`, cost: L.cost };
  if (m.xp < L.cost) return { ok: false, why: `${L.cost} XP`, cost: L.cost };
  return { ok: true, why: `${L.cost} XP`, cost: L.cost };
}
export function learn(m, idx) {
  const s = learnState(m, idx); if (!s.ok) return false;
  const id = speciesOf(m).pool[idx];
  m.xp -= s.cost; m.known.push(id);
  return true;
}
export function equip(m, moveId, slot) {
  if (!m.known.includes(moveId)) return false;
  const other = m.eq.indexOf(moveId);
  if (other >= 0) { m.eq[other] = m.eq[slot]; }
  m.eq[slot] = moveId; return true;
}

// ---- gacha ----
export function rollRarity(rng = Math.random) {
  let r = rng(), acc = 0;
  for (const k of RARITY_ORDER) { acc += RARITY[k].rate; if (r < acc) return k; }
  return 'common';
}
export function pull(save, n = 1, rng = Math.random) {
  const cost = n === 10 ? EGG10_COST : EGG_COST * n;
  if (save.coins < cost) return null;
  save.coins -= cost; save.pulls += n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const rar = rollRarity(rng);
    const opts = SPECIES.filter((s) => s.rarity === rar);
    const sp = opts[Math.floor(rng() * opts.length)];
    const owned = save.mons.find((m) => m.sp === sp.id);
    if (owned) {
      const R = RARITY[rar]; giveXp(owned, R.dupXp); save.coins += R.dupCoins;
      out.push({ sp: sp.id, rarity: rar, dup: true, xp: R.dupXp, coins: R.dupCoins, uid: owned.uid });
    } else {
      const m = newMon(save, sp.id);
      out.push({ sp: sp.id, rarity: rar, dup: false, uid: m.uid });
    }
  }
  return out;
}
