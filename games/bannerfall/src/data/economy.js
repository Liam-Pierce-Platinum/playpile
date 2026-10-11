// BANNERFALL :: data/economy.js - every money number of a war (DESIGN.md 4, 5.4). Gold per MINUTE;
// the war pays it out every 10 s (a sixth at a time).

// income (DESIGN.md 4.2)
export const INCOME = {
  homeKeep: 600,          // your own capital (the free keep)
  capital: 400,           // a capital you took from someone else
  castle: 400,            // a castle (captured or built with a Castle Keep)
  outpost: 150,           // a timber keep you built
  stronghold: 250,        // a held fort
  region: 80,             // each owned region without a settlement
  cutOff: 0.5,            // a region cut off from your castles pays half
  bankruptMorale: 1,      // morale lost per 10 s by every squad while gold < 0
};

// upkeep per squad per minute (DESIGN.md 4.3, plus the v3.1 roster). Commanders are free.
export const UPKEEP = {
  builder: 10, militia: 10, militiaBow: 10, sapper: 15,
  spear: 15, pike: 18, sword: 20, menAtArms: 26, halberd: 22, shieldbearer: 18, standard: 12,
  archer: 20, longbow: 24, javelin: 16, xbow: 25, healer: 20, surgeon: 18,
  outrider: 30, horseArcher: 32, knight: 45, heavyCav: 55,
  ram: 25, siegeTower: 35, mangonel: 40, ballista: 35, trebuchet: 60,
  commander: 0, king: 0,
};
// garrisons (squads posted to a seat, or standing on its walls) pay half
export const GARRISON_UPKEEP = 0.5;
// structures that cost money to keep up (per minute)
export const STRUCT_UPKEEP = { castleKeep: 50, outpost: 20, stoneTower: 5, tower: 3, stoneGate: 5 };

// recruiting, refill and the banner cap (DESIGN.md 5.4, 7.3)
export const BANNERS = { base: 16, capital: 6, castle: 6, outpost: 3, stronghold: 2, max: 48 };
export const HEAL = { castle: [80, 2], capital: [80, 2], outpost: [50, 1], stronghold: [40, 1] };   // [radius m, HP/s]

// one-off money (DESIGN.md 4.4)
export const LOOT = {
  village: [0, 6000, 10000, 16000],     // pillage by tier
  tax: [0, 150, 250, 400],             // tax per minute by tier
  burnBonus: 0.15,                     // burning a raided fort pays 15% more
  outpostRaze: 3000,                   // sacking somebody's outpost
};

// settlements founded by builders (DESIGN.md 6.3, 6.5)
export const FOUND = {
  minSeatGap: 450,                     // metres from any other keep, castle, outpost or fort
  maxSlope: 0.14,
};
