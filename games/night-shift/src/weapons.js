// ===================== NIGHT SHIFT :: WEAPONS =====================
// Bought once, kept forever. The garage is a loadout now rather than a car
// showroom: what you own carries between jobs, and what you take on any given
// job is chosen before you leave.
//
// None of these make you win a firefight against five units. They change how
// long you last in one, and how far away you can afford to be when it starts -
// which is a different thing, and the right thing for a game about escaping.

export const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', price: 0, owned: true,
    dmg: 34, mag: 12, rate: 0.16, spread: 0.045, reload: 1.5, reserve: 48,
    range: 1.0, len: 0.5,
    note: 'What you already have. Quiet enough that one shot does not bring the whole borough.' },
  { id: 'revolver', name: 'REVOLVER', price: 900,
    dmg: 62, mag: 6, rate: 0.42, spread: 0.030, reload: 2.6, reserve: 30,
    range: 1.15, len: 0.6, loud: 1.5,
    note: 'Two shots to put anyone down, and six before a long reload. Loud enough to be heard two streets away.' },
  { id: 'smg', name: 'MACHINE PISTOL', price: 1600,
    dmg: 19, mag: 30, rate: 0.075, spread: 0.11, reload: 1.9, reserve: 120,
    range: 0.85, len: 0.62, loud: 1.8,
    note: 'Wins a doorway. Empties in two seconds and tells everyone where the doorway was.' },
  { id: 'shotgun', name: 'SHOTGUN', price: 1400,
    dmg: 22, pellets: 6, mag: 6, rate: 0.75, spread: 0.16, reload: 3.0, reserve: 24,
    range: 0.5, len: 0.75, loud: 2.0,
    note: 'Devastating at a stairwell, useless across a street. The best thing you can own if you plan to be cornered.' },
  { id: 'rifle', name: 'CARBINE', price: 2600,
    dmg: 44, mag: 20, rate: 0.14, spread: 0.028, reload: 2.4, reserve: 80,
    range: 1.6, len: 0.9, loud: 2.2,
    note: 'Reaches further than they can. Also turns a manhunt into a siege, which is not always what you want.' },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
