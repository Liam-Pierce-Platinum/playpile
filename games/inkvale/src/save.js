// save.js - one save in localStorage. Everything wrapped in try/catch so a
// private window or blocked storage just means progress isn't kept.

const KEY = 'inkvale.save.v1';

export function blankSave() {
  return {
    stars: {},              // levelId -> best stars (1..3)
    upgrades: {},           // column -> tiers bought
    hero: 'wren',
    heroXp: { wren: 0, ysolde: 0, moss: 0 },
    difficulty: 'normal',
    seen: [],               // enemy kinds met
    story: {},              // which story panels have been shown
    sfx: true, music: true,
    speed: 1,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankSave();
    return Object.assign(blankSave(), JSON.parse(raw));
  } catch { return blankSave(); }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

export function totalStars(s) { return Object.values(s.stars).reduce((a, b) => a + b, 0); }
export function spentStars(s) {
  const COST = [1, 1, 2, 2, 3];
  let n = 0;
  for (const t of Object.values(s.upgrades)) for (let i = 0; i < t; i++) n += COST[i];
  return n;
}
export function unlockedLevel(s) {
  // highest level you may play: one past the best cleared
  let max = 1;
  for (const id of Object.keys(s.stars)) if (s.stars[id] > 0) max = Math.max(max, +id + 1);
  return Math.min(12, max);
}
