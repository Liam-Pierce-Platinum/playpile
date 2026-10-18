// The wardrobe catalogue. Each slot has a list of items; the first of every
// slot is free and owned from the start. Prices are in coins (銭).
export const SLOTS = [
  { key: 'hat', name: 'Head', items: [
    { id: 'kasa', name: 'Straw hat', price: 0 },
    { id: 'band', name: 'Headband', price: 60 },
    { id: 'none', name: 'Bare head', price: 0 },
    { id: 'hood', name: 'Shinobi hood', price: 150 },
    { id: 'topknot', name: 'Topknot', price: 120 },
    { id: 'kabuto', name: 'Horned kabuto', price: 400 },
    { id: 'oni', name: 'Oni horns', price: 300 },
  ] },
  { key: 'mask', name: 'Mask', items: [
    { id: 'none', name: 'No mask', price: 0 },
    { id: 'cloth', name: 'Cloth mask', price: 80 },
    { id: 'kitsune', name: 'Fox mask', price: 250 },
    { id: 'oni', name: 'Oni mask', price: 350 },
    { id: 'menpo', name: 'Iron menpo', price: 450 },
  ] },
  { key: 'robe', name: 'Robe colour', items: [
    { id: 'ink', name: 'Ink', price: 0, c: null },
    { id: 'indigo', name: 'Indigo', price: 60, c: '#2c3e78' },
    { id: 'crimson', name: 'Crimson', price: 90, c: '#a8201a' },
    { id: 'white', name: 'Mourning white', price: 120, c: '#f4efe4' },
    { id: 'pine', name: 'Pine', price: 90, c: '#2f5a3a' },
    { id: 'gold', name: 'Gold', price: 300, c: '#c9962a' },
    { id: 'violet', name: 'Violet', price: 180, c: '#5a2a6e' },
  ] },
  { key: 'pattern', name: 'Pattern', items: [
    { id: 'plain', name: 'Plain', price: 0 },
    { id: 'stripes', name: 'Stripes', price: 80 },
    { id: 'checks', name: 'Ichimatsu checks', price: 140 },
    { id: 'dots', name: 'Snow dots', price: 100 },
    { id: 'waves', name: 'Seigaiha waves', price: 220 },
    { id: 'cranes', name: 'Cranes', price: 320 },
  ] },
  { key: 'sash', name: 'Sash', items: [
    { id: 'red', name: 'Red', price: 0, c: '#c8281e' },
    { id: 'white', name: 'White', price: 40, c: '#f4efe4' },
    { id: 'gold', name: 'Gold', price: 120, c: '#e0aa30' },
    { id: 'black', name: 'Black', price: 40, c: '#16120f' },
    { id: 'sky', name: 'Sky', price: 80, c: '#5aa0d8' },
  ] },
  { key: 'scarf', name: 'Sword scarf', items: [
    { id: 'red', name: 'Red', price: 0, c: '#c8281e' },
    { id: 'white', name: 'White', price: 50, c: '#f4efe4' },
    { id: 'gold', name: 'Gold', price: 150, c: '#e0aa30' },
    { id: 'jade', name: 'Jade', price: 120, c: '#3aa878' },
    { id: 'sky', name: 'Sky', price: 100, c: '#5aa0d8' },
    { id: 'black', name: 'Black', price: 60, c: '#16120f' },
  ] },
];

export const DEFAULT_OUTFIT = { hat: 'kasa', mask: 'none', robe: 'ink', pattern: 'plain', sash: 'red', scarf: 'red' };
export const DEFAULT_OWNED = SLOTS.flatMap((s) => s.items.filter((i) => i.price === 0).map((i) => s.key + ':' + i.id));

export function item(slot, id) { const s = SLOTS.find((q) => q.key === slot); return s.items.find((i) => i.id === id) || s.items[0]; }
// resolve the outfit into the colours drawFigure wants
export function look(o) {
  return { hat: o.hat, mask: o.mask, robe: item('robe', o.robe).c, pattern: o.pattern, sash: item('sash', o.sash).c, scarf: item('scarf', o.scarf).c };
}
