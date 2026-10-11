// BANNERFALL :: data/realm.js - every number of the Long War (DESIGN.md 19, 20).
// The realm runs on a day clock: 1 day = 2 s at 1x, a season = 30 days, a year = 4 seasons.

export const CLOCK = { dayS: 2, seasonDays: 30, yearDays: 120, speeds: [0, 0.5, 1, 2, 4] };
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

// what each season does (DESIGN.md 19.2)
export const SEASON_FX = {
  Spring: { march: 0.85, recruit: 0.8, income: 1, aggression: 0, flood: true, attrition: 0 },
  Summer: { march: 1, recruit: 1, income: 1, aggression: 0.1, attrition: 0 },
  Autumn: { march: 1, recruit: 1, income: 1, harvest: 1.5, aggression: -0.05, truceBias: 10, attrition: 0 },
  Winter: { march: 0.7, recruit: 1, income: 0.8, aggression: -0.15, attrition: 0.01 / 3, passesShut: true },
};

// realm sizes
export const REALM_SIZES = { small: 20, standard: 28, grand: 40 };
// the realm map is drawn this many metres across (the camera works in the same units as a war map)
export const REALM_M = 4000;

// economy per SEASON (DESIGN.md 19.4); the treasury ticks daily (a thirtieth at a time)
export const R_ECON = {
  provinceBase: 2000,                     // x development (1-5)
  village: [0, 1500, 2500, 4000],         // a taxed village by tier
  seat: { capital: 8000, castle: 4000, stronghold: 1500, outpost: 1000 },
  market: 2000,
  tradeShare: 0.1, tradeMax: 3,
  upkeepPerMin: 20,                       // a season's upkeep = the war's per-minute upkeep x 20
  garrisonShare: 0.5,
  royalGrant: 20000,                      // a fought battle's chest is never below this
  startPlayer: 100000, startAI: [40000, 100000],
  priceMult: 5,                           // realm recruiting uses the war-map prices (v1 x5)
};

// armies (DESIGN.md 19.5)
export const R_ARMY = {
  maxBanners: 48,
  trainDays: 2, queue: 5,
  supplyLoss: 0.01 / 5,                   // 1% of men per 5 days in hostile land without supply
  winterLoss: 0.01 / 3,
  avoidLoss: 0.05,                        // slipping away from a stronger army costs the rearguard
};

// sieges (DESIGN.md 19.9)
export const R_SIEGE = {
  supplies: { stronghold: 30, castle: 60, capital: 90, outpost: 20 },
  starveLoss: 0.02,
  wall: { stronghold: 1.35, castle: 1.8, capital: 2.2, outpost: 1.2 },  // the defenders' multiplier on an assault
  worksPerDay: 0.012,                     // siege works wear the wall multiplier down, a day at a time
  termsSupplies: 10, termsRatio: 0.4,
};

// kingdoms rise and fall (DESIGN.md 19.10)
export const R_KINGDOM = {
  loyaltyStart: 70, loyaltyConquered: -20, loyaltyPillage: -10, loyaltyHeld: 4, loyaltyWar: -5, loyaltyGarrison: 10,
  unrest: 30, rebelChance: 0.06, rebelChanceLow: 0.14, breakawaySeasons: 1,
  houndsReform: [120, 240],               // days until the Black Hounds ride again
  rulerDeathFrom: 60, rulerDeath: 0.05,
};

// war score, exhaustion and the AI's will to fight (DESIGN.md 20.2, 20.5)
export const R_WAR = {
  battleWon: [5, 15], provinceTaken: 15, capitalHeld: 40, armyDestroyed: 10,
  exhaustionPerPct: 1, exhaustionPerProvince: 5, exhaustionPerSeason: 2, peaceRelief: 3,
  acceptU: 10, proposeU: 15, declareAt: 40, warning: 10,
};
