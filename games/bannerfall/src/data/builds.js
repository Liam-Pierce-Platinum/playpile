// BANNERFALL :: data/builds.js - fortifications (DESIGN.md 3.2).
// Segment builds snap to segLen metre pieces along the drawn line.
// wood: true means it burns (fire arrows) and takes full damage from infantry.

export const BUILD_TYPES = {
  trench:    { name: 'Trench', key: 'T', costPerM: 2, depth: 1.6, width: 2.5, parapet: 0.6, kind: 'earth',
               desc: 'Drag to dig. 2 g per metre. Troops inside take half damage from arrows; cavalry cannot charge through.' },
  stakes:    { name: 'Stakes', key: 'Y', costPerSeg: 15, segLen: 4, hp: 300, cavDmg: 50, height: 1.2, kind: 'obstacle', wood: true,
               desc: '15 g per 4 m row. Breaks cavalry charges (50 damage). Infantry hack through slowly.' },
  caltrops:  { name: 'Caltrops', key: 'J', cost: 20, hp: 200, height: 0.2, kind: 'caltrops', size: 6,
               desc: '20 g per 6 x 6 m patch. Hidden spikes: x0.5 speed and 2 damage/s to horses.' },
  palisade:  { name: 'Palisade', key: 'P', costPerSeg: 20, segLen: 4, height: 3.5, hp: 400, thick: 0.7, kind: 'wall', wood: true,
               desc: '20 g per 4 m. Blocks men and flat shots. Archers arc over it. Burns.' },
  gate:      { name: 'Gate', key: 'G', cost: 60, segLen: 4, height: 3.8, hp: 700, thick: 0.8, kind: 'gate', wood: true,
               desc: '60 g. Your men pass, the enemy must break it. Place on the line of a wall.' },
  tower:     { name: 'Watchtower', key: 'O', cost: 90, hp: 600, height: 9, size: 4, kind: 'tower', wood: true,
               desc: '90 g. Right-click it with archers to garrison: height means range and damage.' },
  stoneWall: { name: 'Stone Wall', key: 'L', costPerSeg: 60, segLen: 4, height: 6, hp: 1600, thick: 2.4, kind: 'wall', walkway: true,
               desc: '60 g per 4 m. 6 m tall, 1600 HP. Shooters can stand on top (right-click it): arrows x0.3.' },
  stoneGate: { name: 'Gatehouse', key: 'J', cost: 180, segLen: 6, height: 7.5, hp: 2500, thick: 3.2, kind: 'gate', tech: 'masonry',
               desc: '180 g. A stone gatehouse, 2500 HP. Place it on a wall line. Murder Holes add boiling oil.' },
  stoneTower:{ name: 'Stone Tower', key: 'K', cost: 220, hp: 2000, height: 13, size: 5.5, kind: 'tower', tech: 'masonry',
               desc: '220 g. 13 m platform, 2000 HP, does not burn. Garrison a shooter squad.' },
  // ---- v2/v3.1 builds (DESIGN.md 6.3, LIAM_BRIEF item 6). Prices are v1 gold (a war map pays x5).
  moat:      { name: 'Moat', key: 'M', costPerM: 3, depth: 3.0, width: 6, parapet: 0.9, kind: 'earth', moat: true,
               desc: 'Drag to dig a 6 m wide, 3 m deep moat. Near a river it fills with water. Nobody crosses it but over your own gate (the drawbridge).' },
  stairs:    { name: 'Wall Stairs', key: 'N', cost: 16, size: 3, hp: 500, height: 3.5, kind: 'stairs',
               desc: 'Place against your palisade or stone wall: any foot squad can climb onto the wall-walk there (right-click the wall). Stone walls get stairs every 20 m for free.' },
  outpost:   { name: 'Outpost', key: 'B', cost: 600, size: 11, hp: 3000, height: 12, kind: 'keep', wood: true, seat: 'outpost',
               desc: 'A timber keep on a mound. Claims the region; recruits builders, militia, spears, archers and javelins; heals and rallies. 450 m from any other seat.' },
  castleKeep:{ name: 'Castle Keep', key: 'V', cost: 1600, size: 16, hp: 8000, height: 19, kind: 'keep', seat: 'castle',
               desc: 'A stone keep: a new CASTLE. Claims the region and its wild neighbours, recruits every unit, +6 banners, heals 2 HP/s. 450 m from any other seat.' },
};

export const BUILD_ORDER = ['trench', 'stakes', 'caltrops', 'palisade', 'gate', 'tower', 'stoneWall', 'stoneGate', 'stoneTower', 'moat', 'stairs', 'outpost', 'castleKeep'];
// what FOUNDING offers (the keeps are mid-war builds: you found them on land you take)
export const FOUNDING_BUILDS = ['trench', 'stakes', 'caltrops', 'palisade', 'gate', 'tower', 'stoneWall', 'stoneGate', 'stoneTower', 'moat', 'stairs'];
export const isWood = (type) => !!(BUILD_TYPES[type] && BUILD_TYPES[type].wood);
