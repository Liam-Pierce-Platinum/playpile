// The eight stages of the derby ladder. speed = fastball speed in m/s.
export const STAGES = [
  { id: 'sandlot', win: 1.4, rcMul: 1.3,  name: 'SANDLOT',     need: 3,  speed: 25, types: ['fastball'], brk: 0.6, edge: 0.0, ballPct: 0,    assist: true,  sky: 0x1b2a55 },
  { id: 'minors', win: 1.25, rcMul: 1.18,   name: 'MINORS',      need: 4,  speed: 27, types: ['fastball', 'fastball', 'changeup'], brk: 0.8, edge: 0.25, ballPct: 0.05, sky: 0x1a2350 },
  { id: 'prospect', win: 1.12, rcMul: 1.1, name: 'PROSPECT',    need: 5,  speed: 29, types: ['fastball', 'fastball', 'changeup', 'curve'], brk: 0.9, edge: 0.4, ballPct: 0.08, sky: 0x1d1e4a },
  { id: 'bigleague', win: 1, rcMul: 1,name: 'BIG LEAGUE',  need: 6,  speed: 31, types: ['fastball', 'changeup', 'curve', 'slider'], brk: 1.0, edge: 0.55, ballPct: 0.1, sky: 0x221a48 },
  { id: 'allstar', win: 0.93, rcMul: 0.95,  name: 'ALL-STAR',    need: 7,  speed: 33, types: ['fastball', 'changeup', 'curve', 'slider'], brk: 1.0, edge: 0.7, ballPct: 0.12, sky: 0x281945 },
  { id: 'derby', win: 0.88, rcMul: 0.9,    name: 'DERBY NIGHT', need: 8,  speed: 35, types: ['fastball', 'changeup', 'curve', 'slider'], brk: 1.1, edge: 0.8, ballPct: 0.12, sky: 0x2a1640 },
  { id: 'legend', win: 0.83, rcMul: 0.86,   name: 'LEGEND',      need: 9,  speed: 37, types: ['fastball', 'changeup', 'curve', 'slider'], brk: 1.25, edge: 0.9, ballPct: 0.15, sky: 0x2b1235 },
  { id: 'mythic', win: 0.78, rcMul: 0.83,   name: 'MYTHIC',      need: 10, speed: 39, types: ['fastball', 'changeup', 'curve', 'slider'], brk: 1.4, edge: 1.0, ballPct: 0.15, sky: 0x2a0d2a },
];

export function starsFor(stage, hrs) {
  if (hrs >= stage.need + 6) return 3;
  if (hrs >= stage.need + 3) return 2;
  if (hrs >= stage.need) return 1;
  return 0;
}

const KEY = 'pd.home-run';
export function loadSave() {
  const d = { unlocked: 1, best: {}, stars: {}, longest: 0, totalHR: 0, rounds: 0, muted: false };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) Object.assign(d, s); } catch (e) { /* no storage */ }
  return d;
}
export function writeSave(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* no storage */ }
}
