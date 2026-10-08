// The save: energy points, gym levels, who you have beaten, your record.
// One localStorage key. Reads never throw - a private window just starts fresh.
import { STATS, MAX_LEVEL, statCost } from './data.js';
import { defaultLook, cleanLook } from './looks.js';

const KEY = 'southpaw_save_v1';
const fresh = () => ({
  name: 'YOU', ep: 3, lv: Object.fromEntries(STATS.map((s) => [s.id, 0])),
  beaten: {}, faced: {}, record: { w: 0, l: 0, d: 0, ko: 0 }, spent: 0, champ: false,
  look: defaultLook(),
});

export const save = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.lv) { const f = fresh(); return Object.assign(f, s, { lv: Object.assign(f.lv, s.lv), record: Object.assign(f.record, s.record), look: cleanLook(s.look) }); }
  } catch {}
  return fresh();
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {} }

export function buy(id) {
  const lv = save.lv[id] || 0;
  if (lv >= MAX_LEVEL) return false;
  const c = statCost(lv);
  if (save.ep < c) return false;
  save.ep -= c; save.spent += c; save.lv[id] = lv + 1;
  persist();
  return true;
}
// a full refund, so a bad build is never permanent
export function respec() {
  let back = 0;
  for (const s of STATS) { for (let l = 0; l < (save.lv[s.id] || 0); l++) back += statCost(l); save.lv[s.id] = 0; }
  save.ep += back; save.spent = 0;
  persist();
  return back;
}
