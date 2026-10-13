// Collects every species file and turns each data object into the game's species shape.
// Authors: add your species to batch1.js..batch4.js (each file exports an array).
// Format and rules: SPECIES_GUIDE.md. Validate with: node tools/check.mjs
import { resolveForm } from '../creature.js';
import legacy from './legacy.js';
import batch1 from './batch1.js';
import batch2 from './batch2.js';
import batch3 from './batch3.js';
import batch4 from './batch4.js';

export const SPECIES_FILES = { legacy, batch1, batch2, batch3, batch4 };

// Game shape used by battle/ui/mons: { id, type, rarity, base, pool, forms:[base, evolved], def, file }
export function toGameSpecies(def, file) {
  return {
    id: def.id, type: def.type, rarity: def.rarity, base: def.stats, pool: def.movePool,
    forms: [resolveForm(def, 0), resolveForm(def, 1)], def, file,
  };
}

export const ALL_SPECIES = [];
for (const [file, arr] of Object.entries(SPECIES_FILES)) {
  for (const def of arr) {
    // Light guard so one bad entry cannot break the game; tools/check.mjs is the strict check.
    if (!def || !def.id || !def.plan || !def.stats || !def.movePool || ALL_SPECIES.some((s) => s.id === def.id)) {
      console.warn('[species] skipped bad/duplicate entry in', file, def && def.id); continue;
    }
    ALL_SPECIES.push(toGameSpecies(def, file));
  }
}
