// BANNERFALL :: sim/realm/save.js - saving and continuing a Long War (DESIGN.md 19.12).
// The realm is plain JSON apart from its look (the province grid, the relief and the river are
// regenerated from the seed on load, so a save is small). Slots: pd.bannerfall.war1..war3 and
// pd.bannerfall.warAuto; a battle in progress goes in pd.bannerfall.battle with the realm's stamp.
// Every storage access is in try/catch; on a quota error the battle snapshot is dropped and the
// save retried once.
import { generateRealm } from './realmgen.js';
import { setSeason } from './realm.js';

const LOOK = ['grid', 'height', 'river'];
export function serializeRealm(R) {
  const o = {};
  for (const k of Object.keys(R)) if (!LOOK.includes(k) && k !== 'events') o[k] = R[k];
  o.stamp = R.seed + ':' + R.day;
  o.savedAt = Date.now();
  return JSON.parse(JSON.stringify(o));
}
export function restoreRealm(data) {
  const base = generateRealm(data.opts || { seed: data.seed });
  const R = { ...data };
  for (const k of LOOK) R[k] = base[k];
  R.events = [];
  setSeason(R);
  return R;
}
export const SLOT_KEYS = { 1: 'pd.bannerfall.war1', 2: 'pd.bannerfall.war2', 3: 'pd.bannerfall.war3', auto: 'pd.bannerfall.warAuto' };
export function saveRealm(R, slot = 'auto', battle = null, storage = globalThis.localStorage) {
  const key = SLOT_KEYS[slot] || SLOT_KEYS.auto;
  const data = serializeRealm(R);
  try {
    storage.setItem(key, JSON.stringify(data));
    if (battle) { try { storage.setItem('pd.bannerfall.battle', JSON.stringify({ stamp: data.stamp, slot, battle })); } catch (e) { storage.removeItem('pd.bannerfall.battle'); } }
    else storage.removeItem('pd.bannerfall.battle');
    return { ok: true, bytes: JSON.stringify(data).length };
  } catch (e) {
    try { storage.removeItem('pd.bannerfall.battle'); storage.setItem(key, JSON.stringify(data)); return { ok: true, dropped: 'battle' }; } catch (e2) { return { error: 'Save failed (storage full)' }; }
  }
}
export function loadRealm(slot = 'auto', storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(SLOT_KEYS[slot] || SLOT_KEYS.auto);
    if (!raw) return null;
    const R = restoreRealm(JSON.parse(raw));
    let battle = null;
    try { const b = JSON.parse(storage.getItem('pd.bannerfall.battle') || 'null'); if (b && b.stamp === R.seed + ':' + R.day) battle = b.battle; } catch (e) { /* none */ }
    return { R, battle };
  } catch (e) { return null; }
}
// the most recently saved slot (Continue on the title screen)
export function latestSlot(storage = globalThis.localStorage) { const I = slotInfo(storage); let best = null; for (const k in I) if (!best || I[k].savedAt > best.savedAt) best = I[k]; return best; }
export function slotInfo(storage = globalThis.localStorage) {
  const out = {};
  for (const s of Object.keys(SLOT_KEYS)) {
    try { const raw = storage.getItem(SLOT_KEYS[s]); if (!raw) continue; const d = JSON.parse(raw); const me = d.kingdoms.find((k) => k.player); out[s] = { slot: s, savedAt: d.savedAt || 0, day: d.day, season: d.season, year: d.year, provinces: d.provinces.filter((p) => p.owner === me.id).length, total: d.provinces.length, result: d.result }; } catch (e) { /* skip */ }
  }
  return out;
}
