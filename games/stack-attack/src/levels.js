// Shifts, food data and bun skins.

// h = how thick it sits in the stack, w = width, m = mass (heavier = more sway).
export const FOOD = {
  bun:     { h: 44, w: 176, m: 1.2, name: 'Bun' },
  patty:   { h: 38, w: 182, m: 1.4, name: 'Patty' },
  cheese:  { h: 13, w: 186, m: 0.5, name: 'Cheese' },
  lettuce: { h: 20, w: 196, m: 0.4, name: 'Lettuce' },
  tomato:  { h: 18, w: 166, m: 0.6, name: 'Tomato' },
  onion:   { h: 16, w: 160, m: 0.4, name: 'Onion' },
  pickles: { h: 14, w: 156, m: 0.3, name: 'Pickles' },
  bacon:   { h: 16, w: 190, m: 0.6, name: 'Bacon' },
  egg:     { h: 24, w: 172, m: 0.8, name: 'Egg' },
  top:     { h: 70, w: 180, m: 1.0, name: 'Top bun' },
  boot:    { h: 70, w: 120, m: 2.2, junk: true, name: 'Boot' },
  fish:    { h: 48, w: 152, m: 1.2, junk: true, name: 'Fish' },
  sock:    { h: 46, w: 108, m: 0.4, junk: true, name: 'Sock' },
};
export const INGREDIENTS = ['patty', 'cheese', 'lettuce', 'tomato', 'onion', 'pickles', 'bacon', 'egg'];
export const JUNK = ['boot', 'fish', 'sock'];

// Ten shifts that ramp up, then endless Rush Hour.
// order = [min, max] items, drop = seconds between drops, fall = start fall speed,
// junk/sauce = share of drops, wind = gust strength, gull = seconds between gull raids (0 = none),
// need = chance a drop is the piece you need next, multi = chance a second item drops at the same time. stars = cash for 1/2/3 stars.
export const SHIFTS = [
  { name: 'Monday Morning', tip: 'Catch what the ticket says, in order, then grab the TOP BUN to serve.', time: 60, order: [2, 3], drop: 0.8, fall: 330, need: 0.65, kinds: 4, junk: 0, sauce: 0, wind: 0, gull: 0, multi: 0, stars: [24, 46, 66] },
  { name: 'Tuesday Lunch', tip: 'Junk ruins the burger. Dodge boots, fish and socks!', time: 65, order: [3, 4], drop: 0.78, fall: 340, need: 0.6, kinds: 6, junk: 0.1, sauce: 0, wind: 0, gull: 0, multi: 0, stars: [20, 38, 55] },
  { name: 'Wobbly Wednesday', tip: 'Off-centre catches make the tower lean. Catch the next piece on the other side to balance it.', time: 70, order: [4, 5], drop: 0.75, fall: 350, need: 0.55, kinds: 8, junk: 0.1, sauce: 0, wind: 0, gull: 0, multi: 0.08, stars: [20, 38, 56] },
  { name: 'Windy Thursday', tip: 'Gusts push falling food AND your tower. Watch the wind arrow.', time: 70, order: [3, 5], drop: 0.75, fall: 350, need: 0.55, kinds: 8, junk: 0.1, sauce: 0, wind: 1, gull: 0, multi: 0.1, stars: [20, 38, 54] },
  { name: 'Seagull Friday', tip: 'A seagull swoops for the top of your stack. Slide away when you see the red !', time: 75, order: [4, 5], drop: 0.72, fall: 360, need: 0.52, kinds: 8, junk: 0.12, sauce: 0, wind: 0, gull: 11, multi: 0.12, stars: [20, 38, 54] },
  { name: 'Saucy Saturday', tip: 'Sauce blobs make the stack slippery. Pieces slide downhill on sauce.', time: 75, order: [4, 6], drop: 0.72, fall: 360, need: 0.52, kinds: 8, junk: 0.1, sauce: 0.12, wind: 0, gull: 0, multi: 0.15, stars: [18, 34, 50] },
  { name: 'Sunday Brunch', tip: 'Wind and seagulls together. Keep it smooth.', time: 80, order: [5, 6], drop: 0.68, fall: 370, need: 0.5, kinds: 8, junk: 0.12, sauce: 0, wind: 1.2, gull: 12, multi: 0.18, stars: [18, 36, 52] },
  { name: 'Late Night Rush', tip: 'Faster drops and two at a time. Pick your catch.', time: 80, order: [5, 7], drop: 0.6, fall: 400, need: 0.48, kinds: 8, junk: 0.14, sauce: 0.08, wind: 0.8, gull: 0, multi: 0.3, stars: [18, 36, 54] },
  { name: 'Health Inspector', tip: 'Everything at once. Do not drop a boot in front of the inspector.', time: 85, order: [5, 8], drop: 0.6, fall: 410, need: 0.48, kinds: 8, junk: 0.16, sauce: 0.1, wind: 1.2, gull: 11, multi: 0.3, stars: [18, 34, 50] },
  { name: 'The Monster', tip: 'Monster burgers, up to nine layers. Tall towers sway a LOT.', time: 90, order: [6, 9], drop: 0.6, fall: 420, need: 0.5, kinds: 8, junk: 0.12, sauce: 0.1, wind: 1.2, gull: 13, multi: 0.22, stars: [12, 26, 42] },
];

// Rush Hour: endless, ramps over time, three plates (lives).
export function rushShift(t) {
  const k = Math.min(1, t / 240);
  return {
    name: 'Rush Hour', tip: 'Endless. Three broken plates and you are done.', time: Infinity,
    order: [3 + Math.round(k * 4), 5 + Math.round(k * 4)], drop: 0.8 - k * 0.24, fall: 340 + k * 90, need: 0.55 - k * 0.07, kinds: 8,
    junk: 0.08 + k * 0.08, sauce: t > 60 ? 0.08 : 0, wind: t > 40 ? 0.6 + k * 0.8 : 0, gull: t > 80 ? 12 - k * 3 : 0, multi: 0.1 + k * 0.25,
  };
}

// Bun skins, unlocked by total stars.
export const SKINS = [
  { id: 'classic', name: 'Sesame', need: 0, base: '#f0a33c', dark: '#c9772a', light: '#ffd27a', seed: '#fff3d6' },
  { id: 'brioche', name: 'Brioche', need: 4, base: '#e2731f', dark: '#a84b12', light: '#ffb45a', seed: null, gloss: true },
  { id: 'pretzel', name: 'Pretzel', need: 8, base: '#9a4c1c', dark: '#6b2f0e', light: '#c77a3e', seed: '#ffffff', salt: true },
  { id: 'charcoal', name: 'Charcoal', need: 13, base: '#3a3640', dark: '#1f1c24', light: '#6b6574', seed: '#f2e6c8' },
  { id: 'rainbow', name: 'Rainbow', need: 18, base: '#ff6fa8', dark: '#c43f7c', light: '#ffb3d1', seed: '#ffffff', rainbow: true },
  { id: 'golden', name: 'Golden', need: 24, base: '#ffc21a', dark: '#c98a00', light: '#fff0a0', seed: '#ffffff', gloss: true, sparkle: true },
];

export function makeOrder(sh, rnd = Math.random) {
  const pool = INGREDIENTS.slice(0, sh.kinds);
  const n = sh.order[0] + Math.floor(rnd() * (sh.order[1] - sh.order[0] + 1));
  const out = [];
  // first item is usually a patty: it is a burger after all
  out.push(rnd() < 0.7 ? 'patty' : pool[Math.floor(rnd() * pool.length)]);
  while (out.length < n) {
    let k = pool[Math.floor(rnd() * pool.length)];
    if (k === out[out.length - 1] && rnd() < 0.7) k = pool[Math.floor(rnd() * pool.length)];
    out.push(k);
  }
  return out;
}

export const CUSTOMERS = ['Dot', 'Earl', 'Marge', 'Big Lou', 'Trixie', 'Hank', 'Gus', 'Peggy', 'Sal', 'Bev', 'Chet', 'Noreen'];
