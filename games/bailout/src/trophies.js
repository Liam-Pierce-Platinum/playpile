// Trophies: little lifetime goals computed from the save (no extra bookkeeping
// beyond the gallery counters). Surfaced on the title and in the gallery; the
// result card announces newly earned ones.
import { LEVELS } from './levels.js';

const T = (id, name, desc, test) => ({ id, name, desc, test });
const levelsDone = (S) => Object.keys(S.levels).length;
const worldGolds = (S, w) => { let n = 0; for (let i = w * 8; i < w * 8 + 8; i++) if (S.levels[i] && S.levels[i].medal >= 3) n++; return n; };
const worldClean = (S, w) => { for (let i = w * 8; i < w * 8 + 8; i++) if (!S.levels[i] || !S.levels[i].clean) return false; return true; };

export const TROPHIES = [
  T('first', 'First Gear', 'finish a level', (S) => levelsDone(S) >= 1),
  T('flip1', 'Upside Down', 'land a backflip or frontflip', (S) => S.gallery.flips >= 1),
  T('bail1', 'Baptism of Dirt', 'bail out once', (S) => S.gallery.bailouts >= 1),
  T('double', 'Double Trouble', 'land a double flip', (S) => S.gallery.combo >= 2),
  T('triple', 'Triple Threat', 'land a triple flip', (S) => S.gallery.combo >= 3),
  T('quint', 'Washing Machine', 'land five flips in one jump', (S) => S.gallery.combo >= 5),
  T('flips100', 'Century', 'land 100 flips', (S) => S.gallery.flips >= 100),
  T('gold1', 'Go for Gold', 'win a gold medal', (S) => Object.values(S.levels).some((l) => l.medal >= 3)),
  T('plat1', 'Platinum Club', 'win a platinum medal', (S) => Object.values(S.levels).some((l) => l.medal >= 4)),
  T('canyonGold', 'Canyon King', 'gold every Canyon level', (S) => worldGolds(S, 0) === 8),
  T('cleanWorld', 'Not a Scratch', 'finish every level of a world without a bailout', (S) => [0, 1, 2, 3, 4].some((w) => worldClean(S, w))),
  T('campaign', 'Grand Tour', 'finish all 40 levels', (S) => levelsDone(S) >= LEVELS.length),
  T('air2', 'Frequent Flyer', 'ragdoll airtime of 2 s', (S) => S.gallery.air >= 2),
  T('slide10', 'Gravel Rash', 'a 10 m face slide', (S) => S.gallery.slide >= 10),
  T('bail100', 'Crash Test Dummy', 'bail out 100 times', (S) => S.gallery.bailouts >= 100),
  T('tnt', 'Fire in the Hole', 'get launched by TNT', (S) => S.gallery.tnt >= 1),
  T('lava', 'Medium Rare', 'take a lava dip', (S) => S.gallery.lava >= 1),
  T('streak3', 'Regular', 'a 3-day Daily streak', (S) => S.daily.streak >= 3),
  T('free500', 'Mountain Goat', '500 m on Freefall Mountain', (S) => S.endless.best >= 500),
  T('garage', 'Collector', 'own three bikes', (S) => Object.keys(S.owned).length >= 3),
];

export function unlockedTrophies(S) { return TROPHIES.filter((t) => { try { return t.test(S); } catch (e) { return false; } }); }
