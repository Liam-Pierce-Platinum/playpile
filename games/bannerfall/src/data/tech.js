// BANNERFALL :: data/tech.js - the 7-branch tech tree (DESIGN.md 7.4), bought at the war camp.
// Prices are the design's x3 (the war chests are 6,000-12,000 g, so tech stays a real choice
// between battles; the battle budget floor means it can never starve a battle).
// A tier needs the tier to its left in the same branch.

export const TECH_PRICE_MULT = 3;

export const TECH = {
  stakes80:     { branch: 'Earthworks', tier: 1, name: 'Sharpened Stakes', cost: 150, desc: 'Stakes deal 80 to charging horse (was 50).' },
  earthCrew:    { branch: 'Earthworks', tier: 2, name: 'Earthworks Crew', cost: 250, desc: 'Trenches cost 1.4 g per metre.' },
  deepTrench:   { branch: 'Earthworks', tier: 3, name: 'Deep Trenches', cost: 400, desc: 'Trenches 2.2 m deep, entrenched arrows x0.4.' },
  masonry:      { branch: 'Masonry', tier: 1, name: 'Masonry', cost: 400, desc: 'Stone gatehouses and stone towers.' },
  murderHoles:  { branch: 'Masonry', tier: 2, name: 'Murder Holes', cost: 250, desc: 'Gatehouses pour boiling oil: 60 damage at the gate every 20 s.' },
  bastions:     { branch: 'Masonry', tier: 3, name: 'Bastions', cost: 400, desc: 'Stone walls, gatehouses and towers +40% HP.' },
  longbows:     { branch: 'Archery', tier: 1, name: 'Longbows', cost: 200, desc: 'Archer range +15 m.' },
  fireArrows:   { branch: 'Archery', tier: 2, name: 'Fire Arrows', cost: 300, desc: 'Archers toggle burning arrows (F): they set palisades, gates and towers alight.' },
  bodkin:       { branch: 'Archery', tier: 3, name: 'Bodkin Points', cost: 350, desc: 'Arrows pierce armour (0.3).' },
  chainmail:    { branch: 'Arms', tier: 1, name: 'Chainmail', cost: 250, desc: '+2 armour for Spearmen, Swordsmen and Sappers.' },
  shieldWall:   { branch: 'Arms', tier: 2, name: 'Shield Wall', cost: 250, desc: 'Swordsmen ability: frontal arrows x0.25, half speed.' },
  plate:        { branch: 'Arms', tier: 3, name: 'Plate', cost: 500, desc: '+4 more armour, -5% speed.' },
  barding:      { branch: 'Cavalry', tier: 1, name: 'Barding', cost: 200, desc: 'Horsemen +40 HP.' },
  knights:      { branch: 'Cavalry', tier: 2, name: 'Knights', cost: 400, desc: 'Recruit Knights: heavy lances that knock lines flat.' },
  lances:       { branch: 'Cavalry', tier: 3, name: 'Lances', cost: 350, desc: 'Knight charge impact 70 (was 45).' },
  abbey:        { branch: 'Faith', tier: 1, name: 'Abbey', cost: 200, desc: 'Healers cost 25% less.' },
  surgeons:     { branch: 'Faith', tier: 2, name: 'Field Surgeons', cost: 400, desc: 'Men who fall inside a healing ring are only downed: a monk raises them at 35% HP.' },
  hymns:        { branch: 'Faith', tier: 3, name: 'Hymns', cost: 350, desc: 'Healing rings +6 m, morale +2/s inside.' },
  siegecraft:   { branch: 'Siegecraft', tier: 1, name: 'Siegecraft', cost: 350, desc: 'Build Mangonels: 140 m boulders that smash towers and walls.' },
  pavise:       { branch: 'Siegecraft', tier: 2, name: 'Pavise', cost: 200, desc: 'Crossbow ability: planted shields halve arrows.' },
  counterweights: { branch: 'Siegecraft', tier: 3, name: 'Counterweights', cost: 500, desc: 'Build Trebuchets: 450 damage a shot from 220 m.' },
};

export const BRANCHES = ['Earthworks', 'Masonry', 'Archery', 'Arms', 'Cavalry', 'Faith', 'Siegecraft'];

export const techCost = (id, campaign) => {
  const T = TECH[id];
  let c = T.cost * TECH_PRICE_MULT;
  if (id === 'masonry' && campaign && campaign.done && campaign.done['5']) c = Math.round(c * 0.6);   // discounted after Thornfield
  return c;
};

export function techPrereq(id) {
  const T = TECH[id];
  if (T.tier === 1) return null;
  return Object.keys(TECH).find((k) => TECH[k].branch === T.branch && TECH[k].tier === T.tier - 1);
}

// which recruits and builds a set of techs opens (on top of battle unlocks)
export const TECH_UNITS = { knights: 'knight', siegecraft: 'mangonel', counterweights: 'trebuchet' };
export const TECH_BUILDS = { masonry: ['stoneGate', 'stoneTower'] };
