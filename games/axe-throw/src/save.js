// Save lives in localStorage "pd.axe-throw". Every access is guarded: the game runs without storage.
const KEY = 'pd.axe-throw';
export const save = { coins: 0, best: 0, bestScore: 0, skin: 'classic', owned: ['classic'], bosses: [], muted: false, runs: 0 };
export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') Object.assign(save, s); } catch (e) { /* no storage */ }
  if (!Array.isArray(save.owned)) save.owned = ['classic'];
  if (!save.owned.includes('classic')) save.owned.push('classic');
  if (!Array.isArray(save.bosses)) save.bosses = [];
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* no storage */ }
}
