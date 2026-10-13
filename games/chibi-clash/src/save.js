// localStorage save under "pd.chibi-clash". Everything is wrapped: the game runs without storage.
const KEY = 'pd.chibi-clash';
const STORY = 5; // story zones (the endless arena keeps its own record in `endless`)
export function fresh() {
  return { v: 1, coins: 150, mons: [], active: null, nextUid: 1, zones: [-1, -1, -1, -1, -1], endless: 0, seen: [], mute: false, wins: 0, pulls: 0 };
}
// Older saves had 4 zones and no seen list: pad them so every screen can trust the shape.
function upgrade(s) {
  while (s.zones.length < STORY) s.zones.push(-1);
  if (!Array.isArray(s.seen)) s.seen = [];
  for (const m of s.mons) if (!s.seen.includes(m.sp)) s.seen.push(m.sp);
  return s;
}
export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return upgrade(Object.assign(fresh(), s)); } catch (e) { /* ignore */ }
  return fresh();
}
export function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
export function wipe() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
