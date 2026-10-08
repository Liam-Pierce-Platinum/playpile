// Heroes. You take one into each battle. They keep their experience between
// battles (saved), up to level 10.
//
// Two ways to get one. The first three join through the story. The other
// five are WARRIORS FOR HIRE (2026-10-07, Liam: "a way to get coins from
// battles to get new warriors that the player can use") - every battle pays
// coins, win or lose, and the Hall sells these for coins. `cost` is in
// coins; a hero with a cost and no unlock is bought, not earned.

export const XP_LEVELS = [0, 300, 750, 1400, 2300, 3500, 5000, 6800, 9000, 12000];

export const HEROES = {
  wren: {
    name: 'Sir Wren Ashby', title: 'Knight of the Quill',
    unlock: 0, look: 'wren',
    hp: [320, 40], dmg: [[12, 18], [2, 3]], armor: 0.4, rate: 1, speed: 70, range: 0, respawn: 16,
    skill: { name: 'Shield Bash', every: 11, desc: l => `Bashes up to 3 enemies: ${40 + l * 12} damage and a 2s stun.` },
    passive: { name: 'Stand Fast', desc: 'Regenerates 6 health a second while not fighting.' },
    lore: 'The last knight who still keeps his own quill. Slow to anger, slower to fall.',
  },
  ysolde: {
    name: 'Ysolde Fenwhistle', title: 'Ranger of the Reeds',
    unlock: 3, look: 'ysolde',
    hp: [210, 25], dmg: [[9, 15], [2, 2]], armor: 0.1, rate: 0.8, speed: 85, range: 150, air: true, respawn: 14,
    skill: { name: 'Rain of Reeds', every: 10, desc: l => `Looses 8 arrows onto a crowd, ${18 + l * 5} each.` },
    passive: { name: 'Light Step', desc: 'Moves faster than any other hero.' },
    lore: 'Grew up on the Fenlight marshes. Has never missed a heron and never shot one either.',
  },
  moss: {
    name: 'Moss Maurice', title: 'Hedge Wizard',
    unlock: 7, look: 'moss',
    hp: [190, 22], dmg: [[14, 24], [3, 4]], armor: 0, rate: 1.2, speed: 65, range: 130, air: true, magic: true, respawn: 15,
    skill: { name: 'Mossgrasp', every: 13, desc: l => `Roots everything in a patch for ${2 + l * 0.2 | 0}s and heals nearby soldiers by ${40 + l * 10}.` },
    passive: { name: 'Green Thumb', desc: 'His magic ignores some magic resistance.' },
    lore: 'Lives in a cottage that is mostly hedge. Talks to mushrooms. Mushrooms talk back.',
  },

  // ---------------------------------------------------------- for hire
  tamsin: {
    name: 'Tamsin Inkblade', title: 'Duellist of the Margins',
    cost: 250, look: 'tamsin',
    hp: [240, 30], dmg: [[16, 24], [3, 4]], armor: 0.15, rate: 0.6, speed: 90, range: 0, respawn: 12,
    skill: { name: 'Flurry', every: 9, desc: l => `Five cuts in a heartbeat: ${150 + l * 45} damage to the foe in front of her.` },
    passive: { name: 'Quick Hands', desc: 'Strikes almost twice as often as a knight.' },
    lore: 'Learned the sword copying fencing manuals, and the manuals copied her back.',
  },
  hob: {
    name: 'Old Hob Gaffhook', title: 'Eelman of the Drowned Marches',
    cost: 400, look: 'hob',
    hp: [230, 28], dmg: [[14, 22], [2, 3]], armor: 0.1, rate: 1.1, speed: 70, range: 140, respawn: 14, harpoon: true,
    skill: { name: 'Gaff Hook', every: 11, desc: l => `Hooks the foe nearest the gate and hauls it back down the road, ${40 + l * 10} damage and a 1s stun.` },
    passive: { name: 'Long Reach', desc: 'Throws a harpoon at anything in reach.' },
    lore: 'Has fished every river in the Vale. Swears the ink makes the eels taste better.',
  },
  vermilia: {
    name: 'Vermilia Rook', title: 'Painter of the Red Hour',
    cost: 550, look: 'vermilia',
    hp: [180, 22], dmg: [[12, 20], [3, 4]], armor: 0, rate: 1, speed: 72, range: 150, air: true, magic: true, respawn: 14,
    skill: { name: 'Red Wash', every: 10, desc: l => `Throws a wash of vermilion over a crowd: ${30 + l * 8} damage, and every foe it touches is stained red.` },
    passive: { name: 'Colourist', desc: 'Her bolts stain foes red, ready to mix with your towers.' },
    lore: 'Once painted a sunset so red the sun came back to look at it.',
  },
  bramwell: {
    name: 'Sir Bramwell Stout', title: 'The Wall of Vellum',
    cost: 700, look: 'bramwell',
    hp: [420, 50], dmg: [[8, 12], [2, 2]], armor: 0.5, rate: 1.1, speed: 55, range: 0, respawn: 18,
    skill: { name: 'Hold the Line', every: 12, desc: l => `Plants his shield: every foe near him is stopped for 2s and he takes half damage for 5s.` },
    passive: { name: 'Immovable', desc: 'The heaviest armour in the kingdom.' },
    lore: 'Has never retreated, mostly because nobody has ever been able to move him.',
  },
  umber: {
    name: 'Mother Umber', title: 'Witch of the Brown Earth',
    cost: 900, look: 'umber',
    hp: [200, 24], dmg: [[13, 21], [3, 4]], armor: 0.05, rate: 1.1, speed: 66, range: 140, air: true, magic: true, respawn: 15,
    skill: { name: 'Umber Curse', every: 12, desc: l => `Curses a crowd for 5s: they take ${35 + l * 2}% more damage from everything, and walk slower.` },
    passive: { name: 'Old Earth', desc: 'Foes she curses cannot heal.' },
    lore: 'Older than the Vale. Says the First Painter borrowed her brown and never gave it back.',
  },
};

export const HERO_ORDER = ['wren', 'ysolde', 'moss', 'tamsin', 'hob', 'vermilia', 'bramwell', 'umber'];

/** can this save field this hero? Story heroes by battles cleared, hired ones by purchase */
export function heroOwned(s, id) {
  const H = HEROES[id];
  if (!H) return false;
  if (H.cost) return (s.owned || []).includes(id);
  const cleared = Math.max(0, ...Object.keys(s.stars || {}).filter(k => s.stars[k] > 0).map(Number));
  return cleared >= (H.unlock || 0);
}

export function heroLevel(xp) {
  let l = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) l = i + 1;
  return Math.min(10, l);
}

export function heroStats(id, level) {
  const h = HEROES[id];
  const L = level - 1;
  return {
    hp: h.hp[0] + h.hp[1] * L,
    dmg: [h.dmg[0][0] + h.dmg[1][0] * L, h.dmg[0][1] + h.dmg[1][1] * L],
    armor: Math.min(0.8, h.armor + L * 0.02),
    rate: h.rate, speed: h.speed, range: h.range,
  };
}
