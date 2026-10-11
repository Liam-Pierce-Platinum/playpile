// BANNERFALL :: data/constants.js - tuning numbers shared by the sim.
export const C = {
  DT: 0.05,              // fixed 20 Hz sim step
  GRAVITY: 9.8,
  CELL: 4,               // spatial hash cell (m)
  NAV_CELL: 2,           // nav grid cell (m)

  // morale (DESIGN.md 5)
  MORALE_START: 70,
  MORALE_LOSS_PER_PCT: 1.2,
  MORALE_FLANK_SIDE: 0.5,
  MORALE_FLANK_REAR: 1.0,
  MORALE_NEAR_ROUT: 10,
  MORALE_COMMANDER_DEATH: 25,
  MORALE_CHARGED: 8,
  MORALE_HEAL_REGEN: 1,
  MORALE_IDLE_REGEN: 0.5,
  MORALE_KILL: 0.3,
  WAVER_AT: 25,
  ROUT_AT: 10,
  RALLY_MORALE: 40,
  RALLY_CLEAR_TIME: 15,
  ARMY_BREAK: 0.7,

  // cover and terrain
  ENTRENCH_TIME: 2,
  TRENCH_COVER: 0.5,
  TRENCH_COVER_BOLT: 0.6,
  TRENCH_MORALE: 10,
  TRENCH_SPEED_INF: 0.35,
  TRENCH_SPEED_CAV: 0.25,
  DISORDER_DMG: 0.75,
  DISORDER_TAKEN: 1.25,
  WATER_SPEED: 0.45,

  // combat
  CHARGE_SPEED: 6,
  BRACE_REFLECT: 30,
  SHIELD_FRONT: 0.5,
  SHIELD_WALL_FRONT: 0.25,
  ENGAGE_RANGE: 22,      // melee squads lock onto enemies within this of their centre
  CHASE_RANGE: 35,       // aggressive stance chase leash
  HOLD_REACH: 6,         // hold stance melee will step this far from its slot
  SKIRMISH_TRIGGER: 20,
  SKIRMISH_BACKOFF: 25,

  // healing
  HEAL_RADIUS: 12,
  HEAL_FLOOR_MORALE: 15,
  SANCTUARY_MULT: 3,
  SANCTUARY_TIME: 8,

  // commander
  CMD_AURA: 30,
  CMD_AURA_MORALE: 10,
  RALLY_BOOST: 25,

  // capture
  FLAG_HOLD_LOSE: 30,
  BODY_TIME: 20,
};
