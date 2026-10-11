// localStorage 'pd.lanternfall'. Every access is wrapped: the game must run with no storage at all.
const KEY = 'pd.lanternfall';

export function defaults() {
  return {
    v: 1,
    oil: 0,
    shed: {},                 // node id -> tier 0..5
    ach: {},                  // id -> date unlocked
    stats: { runs: 0, kills: 0, dawns: 0, bestScore: 0, bestTime: 0, evolves: 0, dawnChars: {} },
    daily: { last: '', streak: 0, bestStreak: 0, scores: {} },  // scores: dateKey -> best score
    sel: { char: 'lamplighter', map: 'forest', moonless: false },
    opt: { music: 0.6, sfx: 0.85, muted: false, shake: true, numbers: true },
    seenChest: false,
    seen: {},                 // one-time in-world callouts already shown (burn, ember, wraith, stag)
  };
}

export function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    for (const k of Object.keys(d)) {
      if (s[k] === undefined) continue;
      if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) d[k] = Object.assign(d[k], s[k]);
      else d[k] = s[k];
    }
  } catch (e) { /* private window or corrupt: fresh save */ }
  return d;
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export function wipe() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
