// Save data in localStorage under "pd.sumo-slam". Every access is wrapped:
// private windows and blocked storage just mean nothing is remembered.
const KEY = 'pd.sumo-slam';

export const COLORS = [
  { id: 'red', hex: '#ff4b5c', need: 0 },
  { id: 'blue', hex: '#3d8bff', need: 0 },
  { id: 'yellow', hex: '#ffc928', need: 0 },
  { id: 'green', hex: '#3fd27a', need: 0 },
  { id: 'pink', hex: '#ff7ad9', need: 1 },
  { id: 'purple', hex: '#9b5cff', need: 3 },
  { id: 'orange', hex: '#ff8a2b', need: 5 },
  { id: 'mint', hex: '#4fe3d2', need: 8 },
];

const fresh = () => ({ v: 1, unlocked: 0, tier: 0, wins: 0, matches: 0, color: 'red', crown: false, muted: false, mode: 'solo', bestStreak: 0, streak: 0 });

export function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
  const f = fresh();
  if (!d || typeof d !== 'object') return f;
  return { ...f, ...d };
}

export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* no storage: play on */ }
}
