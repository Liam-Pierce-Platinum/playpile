// Save data (localStorage pd.twister-io), stars, unlocks, missions, daily
// streak and the soft MMR that scales bot skill.
const KEY = 'pd.twister-io';

export const MISSIONS = [
  { id: 'absorb2', text: 'Absorb 2 rivals in one round', check: (r) => r.kills >= 2 },
  { id: 'lighthouse', text: 'Lift the lighthouse', check: (r) => r.keys.has('lighthouse') },
  { id: 'cars30', text: 'Lift 30 cars in one round', check: (r) => r.cars >= 30 },
  { id: 'cat5', text: 'Reach Category 5 (houses)', check: (r) => r.tier >= 4 },
  { id: 'win', text: 'Win a Classic round', check: (r) => r.mode === 'classic' && r.rank === 1 && r.over },
  { id: 'pct15', text: 'Destroy 15% of the town', check: (r) => r.pct >= 15 },
  { id: 'hits5', text: 'Land 5 fling hits in one round', check: (r) => r.hits >= 5 },
  { id: 'cows', text: 'Lift 8 cows in one round', check: (r) => r.cows >= 8 },
  { id: 'cat6', text: 'Reach Category 6 (towers)', check: (r) => r.tier >= 5 },
  { id: 'daily', text: 'Play a Daily Town', check: (r) => r.mode === 'daily' && r.over },
  { id: 'chaseGold', text: 'Get gold in Storm Chase', check: (r) => r.mode === 'chase' && r.medal === 0 },
  { id: 'stadium', text: 'Lift the stadium', check: (r) => r.keys.has('stadium') },
];

const fresh = () => ({
  v: 1, stars: 0, skin: 'classic', perk: 'suction', mmr: 35, rounds: 0, wins: 0, absorbs: 0,
  recMass: 0, recObj: null, recObjTier: -1, chaseBest: null, daily: { last: null, streak: 0, best: {} },
  missions: { done: [], active: ['absorb2', 'lighthouse', 'cars30'] }, music: true, sfx: true, mode: 'classic',
});

export function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
  const f = fresh();
  if (!d || typeof d !== 'object') return f;
  return { ...f, ...d, daily: { ...f.daily, ...(d.daily || {}) }, missions: { ...f.missions, ...(d.missions || {}) } };
}
export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode: play on without saving */ }
}

export function today() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
export function yesterday() {
  const t = new Date(Date.now() - 864e5);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

// Live mission progress during a round: returns newly completed missions.
export function checkMissions(d, r) {
  const out = [];
  for (const id of d.missions.active) {
    const m = MISSIONS.find((x) => x.id === id);
    if (m && m.check(r)) out.push(m);
  }
  for (const m of out) completeMission(d, m.id);
  return out;
}
function completeMission(d, id) {
  const a = d.missions.active;
  const i = a.indexOf(id);
  if (i < 0) return;
  d.missions.done.push(id);
  d.stars += 2;
  const next = MISSIONS.find((m) => !d.missions.done.includes(m.id) && !a.includes(m.id));
  if (next) a[i] = next.id; else a.splice(i, 1);
}
