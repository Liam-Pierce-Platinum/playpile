// =====================================================================
// DUNK :: teams.js - THE LEAGUE
// =====================================================================
//
// Liam: *"add in multiple characters and fake teams that have stats and
// stuff... make NPC's make mistakes and have stats so like charging up
// and stuff is slightly less accurate the lower the stats like in retro
// bowl"*.
//
// So every player is a set of numbers, and every number is wired to
// something the game actually does. Retro Bowl's trick is that the
// stats are FEW and each one is obvious - there is no point in a stat a
// player cannot feel - so there are seven here and this is exactly what
// each one changes:
//
//   SPD  top speed, and how fast they turn.
//   SHT  shooting: the size of the random angle error on a shot. A 95
//        shoots almost where he aims; a 40 sprays.
//   THR  the same again for shots from beyond the arc, so a specialist
//        can be a poor finisher and a great shooter.
//   HND  handle: resistance to a steal attempt, and how well a crossover
//        shakes a defender.
//   STL  steal: the chance a swipe takes the ball, and how much reach.
//   BLK  block: reach and timing on a shot or a pass through their zone.
//   IQ   decision-making. Everything an NPC decides is rolled against
//        this: a low IQ passes into coverage, shoots from too far, and is
//        slow to rotate on defence. This is where the MISTAKES live.
//
// Ratings run 40-99 the way everybody expects them to, and the helpers at
// the bottom are the only place those numbers are turned into gameplay
// values - so a stat can be rebalanced in one place rather than in nine.

/** a player: name, number, position, and the seven numbers */
const P = (name, num, pos, spd, sht, thr, hnd, stl, blk, iq) =>
  ({ name, num, pos, spd, sht, thr, hnd, stl, blk, iq });

export const TEAMS = [
  {
    id: 'harbour', name: 'HARBOUR LIGHTS', short: 'HAR',
    home: '#e8552f', away: '#1d2733', trim: '#ffd166',
    roster: [
      P('D. VANCE',    3, 'G', 88, 76, 84, 86, 72, 55, 84),
      P('K. OSEI',    11, 'G', 92, 71, 79, 80, 84, 58, 76),
      P('R. MBEKI',   21, 'F', 78, 85, 68, 74, 66, 82, 81),
      P('T. HALE',    34, 'F', 74, 82, 72, 70, 62, 79, 74),
      P('S. KOVAC',   50, 'C', 66, 88, 45, 68, 54, 93, 79),
    ],
  },
  {
    id: 'foundry', name: 'IRON FOUNDRY', short: 'FND',
    home: '#4a5a6b', away: '#d8dee6', trim: '#ff9f43',
    roster: [
      P('A. QUINN',    1, 'G', 85, 74, 88, 84, 70, 52, 88),
      P('M. DOYLE',    8, 'G', 80, 78, 81, 76, 78, 56, 72),
      P('J. FARO',    23, 'F', 82, 80, 74, 78, 72, 80, 78),
      P('E. STRAND',  31, 'F', 70, 86, 62, 72, 60, 86, 76),
      P('B. VOSS',    55, 'C', 62, 90, 41, 70, 52, 95, 74),
    ],
  },
  {
    id: 'heights', name: 'NORTH HEIGHTS', short: 'NTH',
    home: '#3f6fd8', away: '#f2f4f8', trim: '#8fd98f',
    roster: [
      P('C. AMADI',    5, 'G', 94, 70, 86, 88, 82, 50, 82),
      P('L. PARK',     9, 'G', 86, 76, 90, 82, 74, 54, 86),
      P('N. OKAFOR',  14, 'F', 80, 83, 71, 76, 70, 84, 77),
      P('G. RIOS',    27, 'F', 76, 81, 76, 74, 68, 78, 73),
      P('W. TATE',    44, 'C', 64, 87, 44, 66, 50, 91, 71),
    ],
  },
  {
    id: 'cannery', name: 'OLD CANNERY', short: 'CAN',
    home: '#3fa05a', away: '#1b2430', trim: '#ffe9a8',
    roster: [
      P('F. LEROY',    2, 'G', 90, 73, 83, 85, 80, 52, 79),
      P('H. NAKATA',   7, 'G', 83, 79, 85, 80, 72, 55, 84),
      P('I. BELOV',   18, 'F', 79, 84, 70, 77, 69, 83, 75),
      P('O. SANTOS',  30, 'F', 72, 80, 74, 71, 64, 80, 72),
      P('Z. ADEBAYO', 52, 'C', 68, 89, 46, 69, 56, 94, 76),
    ],
  },
  {
    id: 'pierpoint', name: 'PIER POINT', short: 'PIE',
    home: '#b07cff', away: '#221b30', trim: '#4dc9ff',
    roster: [
      P('V. RIGBY',    4, 'G', 87, 75, 87, 83, 76, 53, 85),
      P('U. DIALLO',  12, 'G', 91, 72, 80, 86, 83, 57, 74),
      P('P. HOLM',    20, 'F', 77, 86, 69, 75, 67, 85, 80),
      P('Q. MARSH',   33, 'F', 73, 83, 73, 72, 63, 81, 71),
      P('Y. CRUZ',    41, 'C', 65, 91, 43, 67, 53, 92, 73),
    ],
  },
  {
    id: 'saltworks', name: 'SALTWORKS', short: 'SLT',
    home: '#e0c04a', away: '#2a2418', trim: '#ff6b8b',
    roster: [
      P('X. BRENNAN',  6, 'G', 89, 77, 82, 84, 78, 54, 81),
      P('D. IKEDA',   10, 'G', 84, 80, 88, 79, 73, 56, 87),
      P('R. SOLIS',   19, 'F', 81, 82, 72, 78, 71, 82, 76),
      P('T. WYNNE',   28, 'F', 75, 85, 70, 73, 65, 84, 74),
      P('K. ABARA',   45, 'C', 63, 92, 42, 71, 55, 96, 72),
    ],
  },
];

export const teamById = (id) => TEAMS.find((t) => t.id === id) || TEAMS[0];

// ---------------------------------------------------------------------
// WHAT THE NUMBERS MEAN, in one place
// ---------------------------------------------------------------------
// Everything below turns a 40-99 rating into something the simulation
// uses. If a stat ever feels wrong, it is wrong HERE and nowhere else.

import { gait, launch } from './scale.js';

/** 40..99 -> 0..1, which is what every curve below is written against */
export const norm = (v) => Math.max(0, Math.min(1, (v - 40) / 59));

/**
 * Metres per second of top speed.
 *
 * THESE ARE THE REAL NUMBERS. A basketball player tops out somewhere
 * between six and a half and ten metres a second, and gait() is what
 * turns that into this game: times the scale, because a 1.52-metre man
 * covers 78% of the ground on the same stride, and times QUICK, which is
 * the one place the game is deliberately faster than life.
 *
 * The version before this just put the number up to 8-12 and left
 * everybody full size, which is what Liam saw: people moving at a speed
 * that had nothing to do with how big they were or how big the floor
 * was.
 */
export const topSpeed = (p) => gait(6.4 + norm(p.spd) * 3.4);

/**
 * How fast they can change the way they are facing, radians/sec.
 *
 * An angle is not a length, so this does NOT scale down - if anything a
 * smaller body turns quicker, and a player who moves at 78% of the speed
 * on 78% of the floor needs every bit of the same agility.
 */
export const turnRate = (p) => 7 + norm(p.spd) * 5.5;

/**
 * The random angle error on a shot, in radians.
 *
 * A 99 shooter is off by up to about a degree and a half; a 40 by nearly
 * seven. Distance multiplies it, being contested multiplies it again,
 * and an under- or over-charged shot multiplies it a third time - so a
 * bad shooter taking a rushed three from distance is hopeless, which is
 * the point of having the stat at all.
 */
export function shotError(p, dist, threes, contested, charge) {
  const rating = threes ? p.thr : p.sht;
  const base = 0.026 + (1 - norm(rating)) * 0.10;
  const far = 1 + dist * 0.035;
  const pressure = contested ? 1.8 : 1;
  const timing = 1 + Math.abs(charge) * 0.6;       // how far off perfect the charge was
  return base * far * pressure * timing;
}

/** how much of the charge bar counts as a good release, 0..1 */
export const releaseWindow = (p) => 0.10 + norm(p.sht) * 0.14;

/** chance a swipe takes the ball, given the ball is on the near hand */
export function stealChance(defender, carrier, nearHand) {
  const edge = norm(defender.stl) - norm(carrier.hnd);
  const base = 0.28 + edge * 0.42;
  return Math.max(0.04, Math.min(0.82, base * (nearHand ? 1 : 0.22)));
}

/** chance a defender gets a hand on a shot or a pass through their zone */
export function blockChance(defender, dist) {
  return Math.max(0, Math.min(0.85, (0.18 + norm(defender.blk) * 0.55) * (1 - dist / 3.4)));
}

/**
 * How much of him there is, for a collision.
 *
 * There is no weight on a player card, so it comes off the position and
 * the shot-blocking rating - a centre who blocks shots is a big man, and
 * a big man wins a shoulder. 1.0 to about 1.35.
 */
export const mass = (p) =>
  (p.pos === 'C' ? 1.22 : p.pos === 'F' ? 1.1 : 1.0) + norm(p.blk) * 0.12;

/**
 * How high they get off the floor.
 *
 * launch(), not gait(): height off a jump is v^2 over 2g and gravity is
 * NOT scaled - it is a real 9.8 (times the arcade 2.2 in game.js). So to
 * reach 78% of the height you need the square root of 78% of the speed.
 * Getting this wrong either grounds everybody or has them touching the
 * roof.
 */
export const jumpSpeed = (p) => launch(7.2 + norm(p.blk) * 2.2 + norm(p.spd) * 1.2);

/**
 * How often an NPC does the wrong thing.
 *
 * Rolled before every decision an NPC makes. A 95 IQ is wrong about one
 * time in twenty; a 55 is wrong about one in four - and "wrong" means a
 * real, visible mistake: a pass into a defender, a shot from too far, a
 * late rotation. That is the difference between an opponent and a wall.
 */
export const mistakeChance = (p) => 0.30 - norm(p.iq) * 0.25;

/** a one-line summary for the team sheet on the home screen */
export const overall = (p) =>
  Math.round((p.spd + p.sht + p.thr + p.hnd + p.stl + p.blk + p.iq) / 7);
