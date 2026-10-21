// The wardrobe: what can be worn, what it costs, and what unlocks it.
// Items are drawn by draw.js (drawFigure / drawScarf) from these specs.

export const SLOTS = [
  { id: 'hat', name: 'Head', kanji: '笠' },
  { id: 'robe', name: 'Robe', kanji: '衣' },
  { id: 'sash', name: 'Sash', kanji: '帯' },
  { id: 'scarf', name: 'Scarf', kanji: '巾' },
  { id: 'blade', name: 'Blade', kanji: '刀' },
];

// price: coins. ach: unlocked by an achievement instead (free once earned).
export const ITEMS = {
  hat: [
    { id: 'kasa', name: 'Straw Kasa', price: 0 },
    { id: 'hachimaki', name: 'Hachimaki', price: 40 },
    { id: 'topknot', name: 'Topknot', price: 80 },
    { id: 'hood', name: 'Ninja Hood', price: 140 },
    { id: 'kabuto', name: 'Kabuto Helm', price: 260 },
    { id: 'oni', name: 'Oni Mask', ach: 'ch2' },
    { id: 'kitsune', name: 'Kitsune Mask', ach: 'stars100' },
  ],
  robe: [
    { id: 'ink', name: 'Ink Gi', price: 0, color: null },
    { id: 'indigo', name: 'Indigo', price: 60, color: '#2b3a67' },
    { id: 'crimson', name: 'Crimson', price: 100, color: '#a3201a' },
    { id: 'wave', name: 'Wave Pattern', price: 180, color: '#24406e', pattern: 'wave', mark: '#e9eef4' },
    { id: 'sakura', name: 'Sakura', price: 240, color: '#f3ece2', pattern: 'sakura', mark: '#e46a8e' },
    { id: 'storm', name: 'Storm Grey', price: 320, color: '#5d6470', pattern: 'bolt', mark: '#f2d34a' },
    { id: 'gold', name: 'Shogun Gold', ach: 'shogun', color: '#b8901e', pattern: 'crest', mark: '#1a1210' },
  ],
  sash: [
    { id: 'white', name: 'White Obi', price: 0, color: '#f4efe4' },
    { id: 'red', name: 'Red Obi', price: 30, color: '#c8281e' },
    { id: 'black', name: 'Black Belt', price: 50, color: '#0e0c0a' },
    { id: 'purple', name: 'Purple Obi', price: 90, color: '#6a2d7e' },
    { id: 'rope', name: 'Shimenawa', price: 150, color: '#d8b46a', rope: true },
    { id: 'goldsash', name: 'Gold Obi', ach: 'wave10', color: '#e0b030' },
  ],
  scarf: [
    { id: 'red', name: 'Red Scarf', price: 0, colors: ['#c8281e'], len: 7, w: 5 },
    { id: 'white', name: 'Long White', price: 70, colors: ['#f4efe4'], len: 10, w: 5, edge: true },
    { id: 'indigo', name: 'Indigo', price: 110, colors: ['#2b3a67'], len: 8, w: 6 },
    { id: 'twin', name: 'Twin Tails', price: 200, colors: ['#c8281e'], len: 8, w: 4, twin: true },
    { id: 'flame', name: 'Flame', price: 300, colors: ['#ffd23a', '#ff7a1a', '#c8281e'], len: 10, w: 6, embers: true },
    { id: 'petal', name: 'Sakura Silk', price: 380, colors: ['#f2a0b8'], len: 10, w: 5, petals: true },
    { id: 'shadow', name: 'Shadow Silk', ach: 'perfect10', colors: ['#14101a', '#5a2d8a'], len: 12, w: 6, wisps: true },
  ],
  blade: [
    { id: 'steel', name: 'Steel Katana', price: 0, steel: null, core: null },
    { id: 'crimson', name: 'Crimson Edge', price: 80, steel: '#e04a3a', core: '#ff8a6a' },
    { id: 'jade', name: 'Jade', price: 150, steel: '#3aa86a', core: '#9ff0c0' },
    { id: 'goldblade', name: 'Gold Leaf', price: 250, steel: '#e0b030', core: '#fff0a0' },
    { id: 'sakura', name: 'Sakura Blade', price: 350, steel: '#f2a0b8', core: '#ffe0ea', petals: true },
    { id: 'moon', name: 'Moonlight', ach: 'ch4', steel: '#bfe0ff', core: '#eaf6ff', glow: '#8ac8ff' },
    { id: 'void', name: 'Void Edge', price: 500, steel: '#1a1024', core: '#c08aff', glow: '#9a5aff' },
  ],
};

export const ACHIEVEMENTS = {
  ch2: { label: 'Clear chapter 2', test: (s) => !!s.stars[20] },
  ch4: { label: 'Clear chapter 4 (beat the Frost General)', test: (s) => !!s.stars[40] },
  shogun: { label: 'Defeat the Shogun (stage 60)', test: (s) => !!s.stars[60] },
  perfect10: { label: '10 perfect chains', test: (s) => (s.stats.perfect || 0) >= 10 },
  stars100: { label: 'Earn 100 stars', test: (s) => totalStars(s) >= 100 },
  wave10: { label: 'Reach wave 10 in Endless', test: (s) => (s.stats.bestWave || 0) >= 10 },
};

export const DEFAULT_OUTFIT = { hat: 'kasa', robe: 'ink', sash: 'white', scarf: 'red', blade: 'steel' };

export function totalStars(s) { return Object.values(s.stars || {}).reduce((a, st) => a + (Array.isArray(st) ? st.filter(Boolean).length : 0), 0); }
export function item(slot, id) { const list = ITEMS[slot]; return list.find((i) => i.id === id) || list[0]; }
export function outfitOf(equip) { const o = {}; for (const s of SLOTS) o[s.id] = item(s.id, equip && equip[s.id]); return o; }

// Bring any saved wardrobe state (or none, from a v1 save) into shape.
export function migrateWardrobe(save) {
  if (typeof save.coins !== 'number' || !isFinite(save.coins) || save.coins < 0) save.coins = 0;
  save.coins = Math.floor(save.coins);
  if (!save.stats || typeof save.stats !== 'object') save.stats = {};
  for (const k of ['perfect', 'kills', 'bosses', 'bestWave', 'coinsEarned']) if (typeof save.stats[k] !== 'number') save.stats[k] = 0;
  const owned = save.owned && typeof save.owned === 'object' ? save.owned : {};
  const equip = save.equip && typeof save.equip === 'object' ? save.equip : {};
  for (const s of SLOTS) {
    const ids = new Set(ITEMS[s.id].map((i) => i.id));
    const have = Array.isArray(owned[s.id]) ? owned[s.id].filter((id) => ids.has(id)) : [];
    if (!have.includes(DEFAULT_OUTFIT[s.id])) have.unshift(DEFAULT_OUTFIT[s.id]);
    owned[s.id] = [...new Set(have)];
    if (!owned[s.id].includes(equip[s.id])) equip[s.id] = DEFAULT_OUTFIT[s.id];
  }
  save.owned = owned; save.equip = equip;
  return save;
}

// Grant any achievement items whose condition is now met. Returns the new items.
export function checkAchievements(save) {
  const fresh = [];
  for (const s of SLOTS) for (const it of ITEMS[s.id]) {
    if (!it.ach || save.owned[s.id].includes(it.id)) continue;
    if (ACHIEVEMENTS[it.ach].test(save)) { save.owned[s.id].push(it.id); fresh.push({ slot: s.id, item: it }); }
  }
  return fresh;
}

// The cheapest coin item not yet owned, if the player can afford it (for the "!" nudge).
export function affordable(save) {
  let best = null;
  for (const s of SLOTS) for (const it of ITEMS[s.id]) {
    if (it.ach || save.owned[s.id].includes(it.id) || it.price > save.coins) continue;
    if (!best || it.price < best.item.price) best = { slot: s.id, item: it };
  }
  return best;
}
