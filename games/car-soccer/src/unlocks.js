// Cosmetics and the level at which each one unlocks.
export const PAINTS = [
  { id: 'stock', name: 'Team', col: null },
  { id: 'midnight', name: 'Midnight', col: '#28305e' },
  { id: 'lime', name: 'Lime', col: '#8fe04a' },
  { id: 'hotpink', name: 'Hot Pink', col: '#ff4fa3' },
  { id: 'gold', name: 'Gold', col: '#ffc845' },
  { id: 'chrome', name: 'Chrome', col: '#cfd8e6' },
  { id: 'royal', name: 'Royal', col: '#7a5cff' },
  { id: 'carbon', name: 'Carbon', col: '#33363f' },
];
export const BODIES = [
  { id: 'octo', name: 'Bulldog' },
  { id: 'dart', name: 'Dart' },
  { id: 'brute', name: 'Brute' },
];
export const TRAILS = [
  { id: 'team', name: 'Team', cols: null },
  { id: 'fire', name: 'Fire', cols: ['#fff3b0', '#ffb703', '#fb5607', '#ff006e'] },
  { id: 'ice', name: 'Ice', cols: ['#ffffff', '#a8f0ff', '#48cae4', '#0077b6'] },
  { id: 'toxic', name: 'Toxic', cols: ['#f1ffb0', '#b6ff3b', '#38f27a', '#0b8f4d'] },
  { id: 'plasma', name: 'Plasma', cols: ['#ffffff', '#ff9cf2', '#c34bff', '#5b2bff'] },
  { id: 'rainbow', name: 'Rainbow', cols: ['#ff3b3b', '#ffb03b', '#ffee3b', '#3bff7a', '#3bc8ff', '#a63bff'] },
];
export const GOALFX = [
  { id: 'classic', name: 'Classic' }, { id: 'fireworks', name: 'Fireworks' }, { id: 'shockwave', name: 'Shockwave' },
  { id: 'confetti', name: 'Confetti' }, { id: 'vortex', name: 'Vortex' }, { id: 'lightning', name: 'Lightning' },
];
// level -> [kind, id]
export const UNLOCKS = {
  2: ['paint', 'midnight'], 3: ['trail', 'fire'], 4: ['goalfx', 'fireworks'], 5: ['body', 'dart'],
  6: ['paint', 'lime'], 7: ['trail', 'ice'], 8: ['goalfx', 'shockwave'], 9: ['paint', 'hotpink'],
  10: ['body', 'brute'], 11: ['trail', 'toxic'], 12: ['goalfx', 'confetti'], 13: ['paint', 'gold'],
  14: ['trail', 'plasma'], 15: ['goalfx', 'vortex'], 16: ['paint', 'chrome'], 17: ['trail', 'rainbow'],
  18: ['goalfx', 'lightning'], 19: ['paint', 'royal'], 20: ['paint', 'carbon'],
};
export const LISTS = { paint: PAINTS, body: BODIES, trail: TRAILS, goalfx: GOALFX };
export function unlockLevel(kind, id) {
  for (const [lv, [k, i]] of Object.entries(UNLOCKS)) if (k === kind && i === id) return +lv;
  return 1;
}
export const XP_PER_LEVEL = 300;
export function levelFromXp(xp) { return 1 + Math.floor(xp / XP_PER_LEVEL); }
export function itemName(kind, id) { const it = LISTS[kind].find((x) => x.id === id); return it ? it.name : id; }
