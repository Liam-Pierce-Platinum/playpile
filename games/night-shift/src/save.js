// ===================== TOKYO SLIDE :: SAVE =====================
// One localStorage blob. Anything the player paid for lives in here.

const KEY = 'highway.save.v1';

export function defaultSave() {
  return {
    cash: 60000,
    funds: 340,
    current: 'fox',
    owned: {
      fox: { tune: { power:0, tyre:0, brakes:0, susp:0, weight:0, armour:0 },
               kit:'stock', wing:'none', wheel:'stockw',
               paint:'#d8dce2', accent:'#1b2028', livery:'none', glow:'none' },
    },
    times: {},
    driftBest: {},
    totalDrift: 0,
    tierSeen: 0,
    bestScore: 0,
    bestDist: 0,
    seenIntro: false,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    const d = defaultSave();
    return { ...d, ...s, owned: { ...d.owned, ...(s.owned || {}) },
             times: s.times || {}, driftBest: s.driftBest || {} };
  } catch (e) {
    return defaultSave();
  }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

export function loadout(s, carId) {
  return s.owned[carId] || {
    tune: { power:0, tyre:0, brakes:0, susp:0, weight:0, armour:0 },
    kit:'stock', wing:'none', wheel:'stockw', paint:null, accent:null,
    livery:'none', glow:'none',
  };
}
