// THE SPELL BOOK.
//
// The wizard starts with an orb and a flame cone and nothing else. Buy the
// book at a merchant and the shop opens up: every spell after that is a
// separate purchase, and a bought spell has to be BOUND to a key before it
// does anything.
//
// The bind slot is the BLOCK key -- a wizard has no business hiding behind a
// shield anyway, and it means the spell sits under a finger you already have
// somewhere useful. On a controller that is C-down.
//
// Effects live in main.js because they need enemies, combat and the world;
// this file is the catalogue and the maths.

export const BOOK_PRICE = 185;

/**
 * @property cost      coin
 * @property mana      cast cost
 * @property cooldown  seconds
 * @property cast      'self' | 'target' | 'aoe' -- how main.js resolves it
 */
export const SPELLS = {
  poisonCloud: {
    id: 'poisonCloud',
    name: 'CREEPING ROT',
    desc: 'Poisons everything within 7m. It does not care about armour, '
      + 'and it keeps working while you deal with something else.',
    cost: 150, mana: 30, cooldown: 8,
    cast: 'aoe', radius: 7, damage: 5, ticks: 6, interval: 1.0,
    colour: '#7fc44a',
  },
  seekerBolt: {
    id: 'seekerBolt',
    name: 'SEEKER',
    desc: 'A bolt that will not be dodged. It follows whatever you are '
      + 'locked on to until it lands.',
    cost: 168, mana: 22, cooldown: 4,
    cast: 'target', damage: 34, speed: 13, colour: '#c79bff',
  },
  frostNova: {
    id: 'frostNova',
    name: 'RIME',
    desc: 'FREEZES everything within 8m solid. They break out the same way '
      + 'you do, and until they have, they are yours.',
    cost: 218, mana: 40, cooldown: 14,
    cast: 'aoe', radius: 8, damage: 8, freeze: 3.2, colour: '#9fe4ff',
  },
  emberBrand: {
    id: 'emberBrand',
    name: 'EMBER BRAND',
    desc: 'Sets the target burning: damage every second for eight seconds, '
      + 'and burning things do not fight well.',
    cost: 160, mana: 26, cooldown: 6,
    cast: 'target', damage: 7, ticks: 8, interval: 1.0, burn: true,
    colour: '#ff7a2c',
  },
  mend: {
    id: 'mend',
    name: 'MENDING LIGHT',
    desc: 'Heals you, and in two-player heals whoever else is on the screen. '
      + 'The only spell in the book that is worth more with company.',
    cost: 200, mana: 34, cooldown: 10,
    cast: 'self', heal: 45, allyHeal: 45, radius: 24, colour: '#8fe07a',
    coop: true,
  },
};

export const SPELL_IDS = Object.keys(SPELLS);

/** Everything the player has actually bought, in catalogue order. */
export function ownedSpells(progress) {
  return SPELL_IDS.filter(id => progress.spells.includes(id));
}

/** The one currently bound to the block key, or null. */
export function boundSpell(progress) {
  return progress.boundSpell ? SPELLS[progress.boundSpell] : null;
}
