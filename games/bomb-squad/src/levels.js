// Campaign of 20 bombs, plus endless and daily specs.
import { rng, ri, hashStr } from './rng.js';
import { randomMods, MODULE_TYPES } from './rules.js';

// mods: fixed module list, or a number = that many random modules from `pool`.
export const CAMPAIGN = [
  { name: 'First Snip', mods: ['wires'], time: 40, diff: { wires: [3, 3] }, tip: 'Click a wire to cut it. The manual says which one.' },
  { name: 'Four Wires', mods: ['wires'], time: 35, diff: { wires: [4, 4] }, tip: 'The serial number is on the plate along the top edge.' },
  { name: 'The Button', mods: ['button'], time: 40, tip: 'Tap = quick click. Hold = keep it down, watch the strip.' },
  { name: 'Pair', mods: ['wires', 'button'], time: 45, diff: { wires: [3, 5] }, tip: 'Click a module to open its page in the manual.' },
  { name: 'Flip It', mods: ['switches'], time: 35, tip: 'Set every switch, then press SET.' },
  { name: 'Wired Up', mods: ['wires', 'switches'], time: 45, diff: { wires: [4, 6] } },
  { name: 'Glyphs', mods: ['keypad'], time: 35, tip: 'One column holds all four symbols. Press them in its order.' },
  { name: 'Push & Press', mods: ['keypad', 'button'], time: 45 },
  { name: 'Simon Says', mods: ['simon'], time: 40, diff: { simon: 3 }, tip: 'Press the MAPPED colour, not the one that flashed.' },
  { name: 'Triple', mods: ['wires', 'keypad', 'switches'], time: 65, diff: { wires: [3, 6] } },
  { name: 'Spell It', mods: ['code'], time: 40, tip: 'Only one word from the list can be made. Spin the wheels.' },
  { name: 'Lights & Letters', mods: ['simon', 'code'], time: 50, diff: { simon: 3 } },
  { name: 'Dial Maze', mods: ['maze'], time: 45, diff: { mazeMin: 4, mazeMax: 6 }, tip: 'The green ring tells you which maze it is.' },
  { name: 'Busy Desk', mods: ['maze', 'wires', 'button'], time: 70, diff: { mazeMin: 4, mazeMax: 6, wires: [3, 6] } },
  { name: 'Hiss', mods: ['keypad', 'switches'], needy: true, time: 60, tip: 'The VENT never clears. When it hisses, open the right valve.' },
  { name: 'Pressure', mods: 3, needy: true, time: 75, diff: { simon: 3, mazeMin: 4, mazeMax: 6 } },
  { name: 'Four Square', mods: 4, time: 80, diff: { simon: 3, mazeMin: 4, mazeMax: 7 } },
  { name: 'Full House', mods: 4, needy: true, time: 85, diff: { simon: 4, mazeMin: 5, mazeMax: 7 } },
  { name: 'Short Fuse', mods: 4, needy: true, time: 75, diff: { simon: 4, mazeMin: 5, mazeMax: 8 } },
  { name: 'The Big One', mods: 4, needy: true, time: 70, diff: { simon: 4, mazeMin: 5, mazeMax: 8, wires: [5, 6] } },
];

export function campaignSpec(i, seed) {
  const L = CAMPAIGN[i];
  const mods = typeof L.mods === 'number' ? randomMods(rng(seed ^ 0x51ed), L.mods, MODULE_TYPES) : L.mods;
  return { ...L, mods };
}

// Endless: bomb n (0-based) grows from 1 module to 4 + vent; the clock tightens.
export function endlessSpec(n, seed) {
  const count = Math.min(4, 1 + Math.floor(n / 2));
  const needy = n >= 6;
  const time = Math.max(30, Math.min(80, 20 + count * 16 + (needy ? 8 : 0) - Math.max(0, n - 8) * 1.5)) | 0;
  return { name: 'Bomb ' + (n + 1), mods: randomMods(rng(seed ^ 0x9e37), count), needy, time,
    diff: { simon: n > 8 ? 4 : 3, mazeMin: 4, mazeMax: n > 8 ? 8 : 6 } };
}

export function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function dailySeed(key = todayKey()) { return hashStr('bomb-squad-' + key); }
export function dailySpec(seed) {
  return { name: 'Daily ' + todayKey(), mods: randomMods(rng(seed), 3), needy: true, time: 75, diff: { simon: 3, mazeMin: 4, mazeMax: 7 } };
}
export const newSeed = () => (Math.random() * 4294967296) >>> 0;
export { ri };
