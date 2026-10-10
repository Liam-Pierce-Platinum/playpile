// All the tuning: dishes, plates, restaurants, the 12 days and the shop.

// price = coins on the plate tag. tags drive the "any roll" / "something hot" orders.
export const DISHES = {
  salmon: { name: 'Salmon nigiri', price: 2, tags: ['fish'] },
  tuna:   { name: 'Tuna roll', price: 2, tags: ['roll', 'fish'] },
  tamago: { name: 'Tamago', price: 1, tags: [] },
  edamame:{ name: 'Edamame', price: 1, tags: ['veg'] },
  ramen:  { name: 'Ramen', price: 4, tags: ['hot'] },
  ebi:    { name: 'Ebi nigiri', price: 3, tags: ['fish'] },
  kappa:  { name: 'Cucumber roll', price: 1, tags: ['roll', 'veg'] },
  gyoza:  { name: 'Gyoza', price: 3, tags: ['hot'] },
  dango:  { name: 'Dango', price: 2, tags: ['sweet'] },
};
export const TAGS = {
  roll: { name: 'any roll', icon: 'tuna' },
  hot: { name: 'something hot', icon: 'ramen' },
  fish: { name: 'any fish', icon: 'salmon' },
  veg: { name: 'any veggie', icon: 'edamame' },
};
export const COLORS = {
  pink:   { name: 'pink',   c: '#ff7fae', d: '#d9467f' },
  green:  { name: 'green',  c: '#5fd08a', d: '#2f9e5c' },
  blue:   { name: 'blue',   c: '#4fa8ff', d: '#2470cc' },
  purple: { name: 'purple', c: '#b48cff', d: '#7a52d6' },
};
export const COLOR_KEYS = Object.keys(COLORS);

// Four restaurants, three days each.
export const PLACES = [
  { name: 'Tiny Tokyo Stall', kanji: '屋', sky: '#2b2350', wall: '#e9b97a', wall2: '#d89b5c', counter: '#f3d2a2', counter2: '#d9a86c', belt: '#4b3f6b', accent: '#ff5f5f' },
  { name: 'Neon City Bar', kanji: '夜', sky: '#160f2e', wall: '#2c1f52', wall2: '#22173f', counter: '#3d3170', counter2: '#2a2154', belt: '#1b1533', accent: '#ff4fd8' },
  { name: 'Cherry Blossom Garden', kanji: '桜', sky: '#ffd6e4', wall: '#fff0f3', wall2: '#ffd9e3', counter: '#f6d9b4', counter2: '#ddb184', belt: '#5d4a7a', accent: '#ff7fae' },
  { name: 'Floating River', kanji: '川', sky: '#ff9f7a', wall: '#7a4a3a', wall2: '#5e382c', counter: '#c98b5e', counter2: '#a86e45', belt: '#3a3354', accent: '#ffb347' },
];

const D1 = ['salmon', 'tuna', 'tamago', 'edamame'];
const D2 = [...D1, 'ramen'];
const D3 = [...D2, 'ebi'];
const D4 = [...D3, 'gyoza', 'kappa'];
const D5 = [...D4, 'dango'];

// kinds: weights for the order types. belts: [at start, after addAt fraction].
// speed in belt-lengths per second (so it feels the same in portrait and landscape).
export const DAYS = [
  { place: 0, len: 60, belts: [1], speed: [0.085, 0.12], dishes: D1, kinds: { dish: 1 }, patience: 22, match: 0.65, arrive: [2.2, 4], targets: [50, 90, 130], tip: 'Drag a plate onto the customer who wants it.' },
  { place: 0, len: 65, belts: [1], speed: [0.095, 0.135], dishes: D2, kinds: { dish: 3, color: 1 }, patience: 19, match: 0.6, arrive: [1.8, 3.6], targets: [80, 150, 180], tip: 'Some just want a colour of plate. Tap the chef to cook what they want.' },
  { place: 0, len: 70, belts: [1], speed: [0.1, 0.15], dishes: D2, kinds: { dish: 3, color: 1, combo: 1 }, patience: 17, arrive: [1.7, 3.3], gold: true, targets: [85, 155, 180], tip: 'Golden plates: anyone will take one, for a big tip.' },
  { place: 1, len: 70, belts: [1, 2], addAt: 0.35, speed: [0.1, 0.15], dishes: D3, kinds: { dish: 3, color: 1, combo: 1 }, patience: 16, arrive: [1.5, 3], gold: true, cat: true, targets: [100, 190, 270], tip: 'A cat is about. Tap it before it pinches a plate!' },
  { place: 1, len: 75, belts: [2], speed: [0.1, 0.155], dishes: D3, kinds: { dish: 3, color: 1, combo: 1 }, patience: 15, arrive: [1.4, 2.9], gold: true, cat: true, sumo: true, targets: [110, 210, 315], tip: 'The sumo wants five dishes. Feed him and he tips big.' },
  { place: 1, len: 80, belts: [2], speed: [0.11, 0.165], dishes: D3, kinds: { dish: 3, color: 1, combo: 1, double: 1 }, patience: 15, arrive: [1.3, 2.7], gold: true, cat: true, sumo: true, critic: true, targets: [120, 220, 340], tip: 'A VIP food critic is coming. Do not keep them waiting.' },
  { place: 2, len: 75, belts: [2], speed: [0.11, 0.165], dishes: D4, kinds: { dish: 3, color: 1, combo: 1, tag: 1, double: 1 }, patience: 14, arrive: [1.3, 2.6], gold: true, cat: true, sumo: true, critic: true, targets: [125, 230, 345], tip: 'New orders: "any roll", "something hot".' },
  { place: 2, len: 80, belts: [2, 3], addAt: 0.4, speed: [0.11, 0.17], dishes: D4, kinds: { dish: 3, color: 1, combo: 1, tag: 1, double: 1 }, patience: 14, arrive: [1.2, 2.5], gold: true, cat: true, sumo: true, critic: true, targets: [130, 250, 380], tip: 'Three belts! Use the SLOW lever (Space) when it gets busy.' },
  { place: 2, len: 85, belts: [3], speed: [0.115, 0.18], dishes: D4, kinds: { dish: 3, color: 1, combo: 1, tag: 1, double: 2 }, patience: 13, arrive: [1.1, 2.4], gold: true, cat: true, sumo: true, critic: true, targets: [135, 260, 405], tip: 'Hold more plates with an extra hand from the shop.' },
  { place: 3, len: 85, belts: [3], speed: [0.12, 0.185], dishes: D5, kinds: { dish: 3, color: 1, combo: 1, tag: 1, double: 2 }, patience: 13, arrive: [1.1, 2.3], gold: true, cat: true, sumo: true, critic: true, targets: [140, 265, 405], tip: 'The river restaurant. The belts here are quick.' },
  { place: 3, len: 90, belts: [3], speed: [0.125, 0.195], dishes: D5, kinds: { dish: 3, color: 1, combo: 2, tag: 1, double: 2 }, patience: 12, arrive: [1, 2.2], gold: true, cat: true, sumo: true, critic: true, targets: [145, 280, 435], tip: 'Combos multiply tips. Do not serve the wrong thing!' },
  { place: 3, len: 90, belts: [3], speed: [0.13, 0.21], dishes: D5, kinds: { dish: 3, color: 1, combo: 2, tag: 2, double: 3 }, patience: 12, arrive: [0.9, 2.1], gold: true, cat: true, sumo: true, critic: true, targets: [150, 290, 445], tip: 'The final night. Make it a feast!' },
];

// The shop. cost[i] buys level i+1.
export const UPGRADES = [
  { id: 'hand', name: 'Extra Hand', icon: 'hand', desc: (l) => `Hold ${l + 2} plates at once`, max: 2, cost: [90, 240] },
  { id: 'brake', name: 'Slow Lever', icon: 'brake', desc: (l) => ['Slow lever lasts longer (5 s)', 'Slow lever recharges twice as fast'][l], max: 2, cost: [70, 180] },
  { id: 'chef', name: 'Speedy Chef', icon: 'chef', desc: (l) => ['Chef cooks faster (3.2 s)', 'Chef cooks even faster (2.2 s)'][l], max: 2, cost: [80, 200] },
  { id: 'deco', name: 'Decorations', icon: 'deco', desc: (l) => ['Lucky cat: +10% patience', 'Paper lanterns: +10% patience', 'Bonsai: +10% patience', 'Koi tank: +10% patience'][l], max: 4, cost: [60, 130, 210, 320] },
  { id: 'jar', name: 'Tip Jar', icon: 'jar', desc: (l) => ['+15% on every tip', '+30% on every tip'][l], max: 2, cost: [150, 340] },
];
