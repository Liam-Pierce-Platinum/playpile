// localStorage under "pd.car-soccer". Every access is wrapped: the game runs without storage.
const KEY = 'pd.car-soccer';
const DEFAULTS = {
  xp: 0, wins: 0, losses: 0, draws: 0, goals: 0, saves: 0, streak: 0, bestStreak: 0,
  winsBy: { rookie: 0, pro: 0, allstar: 0 }, diff: 'rookie', mode: 'bot',
  paint: 'stock', body: 'octo', trail: 'team', goalfx: 'classic', muted: false, music: true, replays: true, played: 0,
};
export const save = load();
function load() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { d = {}; }
  return { ...DEFAULTS, ...d, winsBy: { ...DEFAULTS.winsBy, ...(d.winsBy || {}) } };
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* no storage: fine */ }
}
