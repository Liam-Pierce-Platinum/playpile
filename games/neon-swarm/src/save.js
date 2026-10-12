// localStorage wrapper under "pd.neon-swarm". Every access is guarded so the
// game runs fine in private windows / with storage blocked.
const KEY = 'pd.neon-swarm';
const DEFAULTS = () => ({ best: { surge: 0, blitz: 0 }, bestWave: 0, bestMult: 0, runs: 0, kills: 0, muted: false });

export function load() {
  const d = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(d, s);
      d.best = Object.assign(DEFAULTS().best, s.best || {});
    }
  } catch (_) { /* no storage */ }
  return d;
}
export function store(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) { /* ignore */ }
}
