// Cars you can buy, paint, the AI drivers and the arenas.
// L / W are half length / half width in world px. Speeds are px/s (handling from TOUGE DRIFT, tuned for an arena).
export const CARS = {
  hatch:  { name: 'Hatchback',     blurb: 'Light, quick and twitchy. Folds like paper.',            price: 0,    L: 27, W: 14,   mass: 1.0,  accel: 980,  top: 660, turn: 2.9,  zone: 95,  engine: 105,  shape: 'hatch' },
  wagon:  { name: 'Station Wagon', blurb: 'The classic derby tank. Long, tough and forgiving.',     price: 600,  L: 33, W: 15.5, mass: 1.35, accel: 870,  top: 625, turn: 2.6,  zone: 120, engine: 110, shape: 'wagon' },
  muscle: { name: 'Muscle Car',    blurb: 'Big V8, fastest car here. Hits like a freight train.',   price: 1200, L: 32, W: 15.5, mass: 1.4,  accel: 1100, top: 740, turn: 2.5,  zone: 100, engine: 105, shape: 'muscle' },
  pickup: { name: 'Pickup',        blurb: 'Steel frame and a heavy bed. Slow to turn, hard to stop.', price: 2000, L: 34, W: 16,   mass: 1.75, accel: 860,  top: 610, turn: 2.35, zone: 135, engine: 125, shape: 'pickup' },
  bus:    { name: 'School Bus',    blurb: 'For laughs. Enormous and unstoppable. Turns like a boat.', price: 3500, L: 52, W: 17.5, mass: 2.8,  accel: 720,  top: 545, turn: 1.8,  zone: 175, engine: 150, shape: 'bus' },
};
export const CAR_KEYS = Object.keys(CARS);

export const PAINTS = [
  { name: 'Fire Red', top: '#d8322a', stripe: '#ffffff', price: 0 },
  { name: 'Derby Blue', top: '#2a62d0', stripe: '#ffd23a', price: 0 },
  { name: 'Hazard Yellow', top: '#f2c21e', stripe: '#141414', price: 0 },
  { name: 'Track White', top: '#eeede6', stripe: '#d8322a', price: 0 },
  { name: 'Lime', top: '#7ad230', stripe: '#141414', price: 150 },
  { name: 'Hot Pink', top: '#ff4fa0', stripe: '#ffffff', price: 150 },
  { name: 'Gloss Black', top: '#232327', stripe: '#ff8a1e', price: 250 },
  { name: 'Gold Leaf', top: '#d9a52a', stripe: '#2a1a0a', price: 400 },
];

// Seven rivals. kind sets the personality in ai.js.
export const DRIVERS = [
  { name: 'BRUTUS', num: 8,  kind: 'bully',   top: '#b8242c', stripe: '#141414', car: 'pickup' },
  { name: 'LUCKY',  num: 13, kind: 'coward',  top: '#3fb4e8', stripe: '#ffffff', car: 'hatch' },
  { name: 'LOCO',   num: 77, kind: 'chaos',   top: '#8a3ad8', stripe: '#ffd23a', car: 'muscle' },
  { name: 'TANK',   num: 1,  kind: 'bully',   top: '#5d6b30', stripe: '#e8e2c8', car: 'wagon' },
  { name: 'SLY',    num: 42, kind: 'sniper',  top: '#18a090', stripe: '#ffffff', car: 'muscle' },
  { name: 'DUSTY',  num: 5,  kind: 'brawler', top: '#e8781a', stripe: '#2a1608', car: 'wagon' },
  { name: 'PIXIE',  num: 99, kind: 'chaos',   top: '#f06aa8', stripe: '#ffffff', car: 'hatch' },
];

export const ARENAS = [
  { key: 'bowl',  name: 'County Fair Bowl', blurb: 'A dirt bowl ringed with tyres, hay bales and a packed grandstand.', unlock: null },
  { key: 'mud',   name: 'Mud Field',        blurb: 'A soaked farm field. Puddles kill your grip, so slide them in.',     unlock: 'Win at the County Fair Bowl' },
  { key: 'eight', name: 'Figure-8',         blurb: 'Two loops and one crossover. Everybody meets in the middle.',       unlock: 'Win in the Mud Field' },
];

// coins by finishing place (index = place)
export const PAYOUT = [0, 300, 180, 120, 90, 70, 50, 35, 25];
