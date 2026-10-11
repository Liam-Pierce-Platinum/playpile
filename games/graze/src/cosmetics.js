// Cosmetic unlocks bought with Sparks (1 Spark per graze + mission rewards).
// Purely visual: arrows, trails and death effects.
export const ARROWS = [
  { id: 'dart', name: 'Dart', price: 0, pts: [[1, 0], [-0.75, 0.66], [-0.38, 0], [-0.75, -0.66]] },
  { id: 'delta', name: 'Delta', price: 120, pts: [[1, 0], [-0.7, 0.72], [-0.7, -0.72]] },
  { id: 'kite', name: 'Kite', price: 220, pts: [[1.05, 0], [0, 0.6], [-0.95, 0], [0, -0.6]] },
  { id: 'needle', name: 'Needle', price: 380, pts: [[1.25, 0], [-0.8, 0.4], [-0.5, 0], [-0.8, -0.4]] },
  { id: 'chevron', name: 'Chevron', price: 600, pts: [[1, 0], [-0.45, 0.85], [-0.85, 0.85], [0.1, 0], [-0.85, -0.85], [-0.45, -0.85]] },
  { id: 'manta', name: 'Manta', price: 900, pts: [[1.05, 0], [0.15, 0.32], [-0.55, 0.95], [-0.35, 0], [-0.55, -0.95], [0.15, -0.32]] },
];
export const TRAILS = [
  { id: 'ribbon', name: 'Ribbon', price: 0 },
  { id: 'twin', name: 'Twin Rails', price: 150 },
  { id: 'comet', name: 'Comet', price: 260 },
  { id: 'dashes', name: 'Morse', price: 420 },
  { id: 'prism', name: 'Prism', price: 700 },
  { id: 'pulse', name: 'Pulse', price: 1000 },
];
export const DEATHS = [
  { id: 'shatter', name: 'Shatter', price: 0 },
  { id: 'nova', name: 'Nova', price: 200 },
  { id: 'pixel', name: 'Pixel Burst', price: 400 },
  { id: 'glitch', name: 'Glitch', price: 750 },
];
export const SHOP = { arrow: ARROWS, trail: TRAILS, death: DEATHS };
export const byId = (list, id) => list.find((x) => x.id === id) || list[0];
