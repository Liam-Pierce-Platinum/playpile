// BANNERFALL :: data/personalities.js - how the AI kingdoms of the Long War think (DESIGN.md 20.6).
// Grudge divides how fast memory fades; honour is how hard it is to break their word.

export const REALM_PERSONALITY = {
  conqueror: { aggression: 0.7, honour: 1.0, greed: 0.8, grudge: 1.0, fear: 0.3, ambition: 0.9, truce: 0.15, base: -10,
    deal: 'Few truces, never breaks one, demands vassalage, hates the strongest' },
  ambusher: { aggression: 0.5, honour: 0.7, greed: 1.0, grudge: 2.0, fear: 0.6, ambition: 0.4, truce: 0.6, base: 0,
    deal: 'Truces easily, betrays the weakened, never forgets' },
  merchant: { aggression: 0.3, honour: 0.9, greed: 1.6, grudge: 0.7, fear: 0.8, ambition: 0.5, truce: 0.8, base: 10,
    deal: 'Trades with everyone, sells truces, pays others to fight' },
  raider: { aggression: 0.9, honour: 0.3, greed: 1.3, grudge: 0.5, fear: 0.2, ambition: 0.1, truce: 0.4, base: -20,
    deal: 'Takes tribute to leave you alone, breaks deals when it pays, no alliances' },
  steadfast: { aggression: 0.3, honour: 1.0, greed: 0.9, grudge: 1.0, fear: 0.5, ambition: 0.3, truce: 0.6, base: 5,
    deal: 'Defensive alliances, answers every call' },
  opportunist: { aggression: 0.6, honour: 0.6, greed: 1.2, grudge: 1.0, fear: 0.7, ambition: 0.6, truce: 0.5, base: 0,
    deal: 'Joins whoever is winning and changes sides when the war turns' },
  zealot: { aggression: 0.8, honour: 0.9, greed: 0.6, grudge: 2.0, fear: 0.1, ambition: 0.7, truce: 0.2, base: -5,
    deal: 'Fights one hated rival to the end' },
};

// traits nudge the numbers (DESIGN.md 20.6)
export const TRAITS = {
  Cautious: { aggression: -0.1, fear: 0.1 },
  Proud: { honour: 0.1, truce: -0.1 },
  Greedy: { greed: 0.2 },
  Just: { honour: 0.1, grudge: -0.2 },
  Cruel: { aggression: 0.1, honour: -0.1 },
};

// memory events (DESIGN.md 20.3): [victim, everyone else, decay per season, floor]
export const MEMORY = {
  brokeTruce: [-60, -25, 5, -20],
  brokeTreaty: [-50, -20, 5, -15],
  warNoClaim: [-25, -10, 5, 0],
  warClaim: [-10, 0, 5, 0],
  pillaged: [-8, 0, 4, 0],
  spared: [5, 0, 2, 0],
  tookProvince: [-20, 0, 3, -5],
  honouredCall: [20, 5, 3, 5],
  refusedCall: [-30, -10, 4, -5],
  gift: [1, 0, 4, 0],                     // x per 1,000 g, to +25
  freedCaptive: [15, 3, 2, 0],
  slewRuler: [-40, -5, 2, -20],
  foughtBeside: [10, 0, 3, 0],
  harshPeace: [-15, 0, 3, 0],
  turnedAway: [-4, 0, 3, 0],
  trespass: [-3, 0, 3, 0],                // an army marched through without leave (to -20)
};
