// The Royal Atelier: permanent upgrades bought with stars earned in battle.
// Six columns, five tiers each, bought in order within a column.

export const UPGRADE_COSTS = [1, 1, 2, 2, 3];

export const UPGRADES = {
  archer: {
    name: 'Archers', tiers: [
      { name: 'Fletching', desc: 'Archer towers +10% range.' },
      { name: 'Bodkin Points', desc: 'Archer arrows ignore 20% of armour.' },
      { name: 'Seasoned Yew', desc: 'Archer towers +10% damage.' },
      { name: 'Cheap Timber', desc: 'Archer towers cost 10% less.' },
      { name: 'Eagle Eye', desc: '10% chance for an arrow to deal double damage.' },
    ],
  },
  barracks: {
    name: 'Barracks', tiers: [
      { name: 'Better Rations', desc: 'Soldiers +20% health.' },
      { name: 'Quick Muster', desc: 'Soldiers respawn 30% faster.' },
      { name: 'Riveted Mail', desc: 'Soldiers +10% armour.' },
      { name: 'Drill Sergeant', desc: 'Soldiers +15% damage.' },
      { name: 'Fourth Man', desc: 'Every barracks fields a fourth soldier.' },
    ],
  },
  mage: {
    name: 'Mages', tiers: [
      { name: 'Long Sight', desc: 'Mage towers +10% range.' },
      { name: 'Rich Pigment', desc: 'Mage towers +12% damage.' },
      { name: 'Scholarship', desc: 'Mage towers cost 10% less.' },
      { name: 'Wet Paint', desc: 'Magic bolts slow by 25% for 1s.' },
      { name: 'Unbinding', desc: 'Mage attacks ignore 25% of magic resistance.' },
    ],
  },
  artillery: {
    name: 'Artillery', tiers: [
      { name: 'Finer Powder', desc: 'Artillery +15% blast radius.' },
      { name: 'Ranging Rods', desc: 'Artillery +10% range.' },
      { name: 'Dwarf Discount', desc: 'Artillery costs 10% less.' },
      { name: 'Shrapnel', desc: 'Artillery +15% damage.' },
      { name: 'Shell Shock', desc: 'Blasts stun small enemies for 0.5s.' },
    ],
  },
  // The two spell columns keep their old keys ('meteor', 'militia') so a
  // save from before 2026-10-07 keeps what it bought - but the spells are
  // new: you DRAW them now. A wash is a stroke of water along the road, a
  // wall is a stroke of ink across it.
  meteor: {
    name: 'The Wash', tiers: [
      { name: 'Heavier Water', desc: 'Wash does 30% more damage.' },
      { name: 'Broad Brush', desc: 'The wash stroke is 40% wider.' },
      { name: 'Quick Drying', desc: 'Wash cooldown -10s.' },
      { name: 'Undertow', desc: 'Wash pushes foes twice as far back.' },
      { name: 'Flood', desc: 'A second wash follows the first.' },
    ],
  },
  militia: {
    name: 'Ink Wall', tiers: [
      { name: 'Thick Ink', desc: 'Walls are 50% tougher.' },
      { name: 'Barbed Line', desc: 'Foes that hit a wall are cut by it.' },
      { name: 'Long Stroke', desc: 'Walls can be drawn 40% longer.' },
      { name: 'Indelible', desc: 'Walls last 50% longer.' },
      { name: 'Quick Hand', desc: 'Wall cooldown -6s.' },
    ],
  },
};

export const UPGRADE_ORDER = ['archer', 'barracks', 'mage', 'artillery', 'meteor', 'militia'];

// Turn a save's purchased tiers into one flat modifier object the game reads.
export function upgradeMods(bought = {}) {
  const t = k => bought[k] || 0;
  const m = {
    archerRange: t('archer') >= 1 ? 1.1 : 1, archerPierce: t('archer') >= 2 ? 0.2 : 0,
    archerDmg: t('archer') >= 3 ? 1.1 : 1, archerCost: t('archer') >= 4 ? 0.9 : 1, archerCrit: t('archer') >= 5 ? 0.1 : 0,
    soldierHp: t('barracks') >= 1 ? 1.2 : 1, respawn: t('barracks') >= 2 ? 0.7 : 1,
    soldierArmor: t('barracks') >= 3 ? 0.1 : 0, soldierDmg: t('barracks') >= 4 ? 1.15 : 1, soldiers: t('barracks') >= 5 ? 4 : 3,
    mageRange: t('mage') >= 1 ? 1.1 : 1, mageDmg: t('mage') >= 2 ? 1.12 : 1, mageCost: t('mage') >= 3 ? 0.9 : 1,
    mageSlow: t('mage') >= 4, mageUnbind: t('mage') >= 5 ? 0.25 : 0,
    splash: t('artillery') >= 1 ? 1.15 : 1, artRange: t('artillery') >= 2 ? 1.1 : 1, artCost: t('artillery') >= 3 ? 0.9 : 1,
    artDmg: t('artillery') >= 4 ? 1.15 : 1, artStun: t('artillery') >= 5,
    washDmg: t('meteor') >= 1 ? 1.3 : 1, washWide: t('meteor') >= 2 ? 1.4 : 1, washCd: 42 - (t('meteor') >= 3 ? 10 : 0),
    washPush: t('meteor') >= 4 ? 2 : 1, washTwin: t('meteor') >= 5,
    wallHp: t('militia') >= 1 ? 1.5 : 1, wallThorns: t('militia') >= 2, wallLen: t('militia') >= 3 ? 1.4 : 1,
    wallLife: t('militia') >= 4 ? 1.5 : 1, wallCd: 24 - (t('militia') >= 5 ? 6 : 0),
    pigment: 1,
  };
  return m;
}
