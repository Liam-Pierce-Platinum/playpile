// =====================================================================
// APEX :: league.js - A SEASON, RACE BY RACE
// =====================================================================
//
// Liam: "make a league mode where you go match by match".
//
// A season is a calendar of circuits and a table. You turn up at each
// round in order, qualify, race, take your points, and the standings
// carry to the next one - drivers' and constructors' both, because the
// field is eight teams of two (teams.js) and a team's two cars adding up
// is half of what makes a championship worth following.
//
// THE WHOLE SEASON IS ONE OBJECT, saved in localStorage after every
// session, so closing the tab in the middle of a season loses nothing:
//
//   { seed, length, skill, laps, weather, round, calendar: [keys],
//     results: [ { key, grid, finish: [{ id, pos, points, fastest }] } ],
//     points: { driverId: n }, teamPoints: { teamId: n } }
//
// A DRIVER IS AN ID, not an object: 'volta:16' - the team and the number.
// The entries come from teams.js every time they are needed, so nothing
// here goes stale when a livery or a name changes.
//
// WHAT A ROUND IS
//   QUALIFYING  one flying lap, alone, on the circuit - the same session
//               time attack runs. The robots' laps are SIMULATED from
//               their pace rather than driven, because sitting through
//               fifteen laps of somebody else's qualifying is not a game.
//               Your lap sets your grid slot among them.
//   THE RACE    the real thing, from that grid slot, over the season's
//               lap count.
//   POINTS      25-18-15-12-10-8-6-4-2-1, and one for the fastest lap if
//               you finish in the top ten, which is the real rule.
import { field, TEAMS } from './teams.js';
import { CIRCUITS } from './circuits.js';

const KEY = 'apex.league';
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/** every circuit, in the order a season runs them */
const ALL = Object.keys(CIRCUITS);

export const idOf = (entry) => entry.team.id + ':' + entry.number;

/** a repeatable shuffle, so a season's calendar is the same every time it is loaded */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function makeSeason({ length = 10, skill = 'medium', laps = 5, weather = 'changing', seed = Date.now() } = {}) {
  const r = rng(seed);
  const pool = ALL.slice();
  // shuffle, then take the first `length` - a season is a different set of
  // circuits each time, in a different order
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const calendar = pool.slice(0, Math.min(length, pool.length));
  return {
    seed, length: calendar.length, skill, laps, weather,
    round: 0, calendar, results: [],
    points: {}, teamPoints: {}, fastest: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.calendar ? s : null;
  } catch (e) { return null; }
}
export function save(season) {
  try { localStorage.setItem(KEY, JSON.stringify(season)); } catch (e) { /* a full store is not a reason to stop racing */ }
}
export function clear() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ditto */ }
}

export const done = (season) => season.round >= season.calendar.length;
export const nextKey = (season) => season.calendar[Math.min(season.round, season.calendar.length - 1)];

/**
 * QUALIFYING, FOR EVERYONE ELSE.
 *
 * You drive your lap; they get one out of their pace. A driver's lap is
 * the circuit's benchmark divided by how hard he tries, plus a roll - a
 * quarter of a second of luck either way, and more of it for the ones who
 * are not very good. That spread is what makes a grid look like a grid
 * rather than a table sorted by team budget.
 *
 * `yourTime` is your own flying lap in seconds; pass null and you start
 * last, which is what happens if you do not bother setting one.
 */
export function qualifying(season, yourTime, lapFor) {
  const entries = field();
  const skill = { easy: 0.86, medium: 0.925, hard: 0.975 }[season.skill] || 0.925;
  const rows = entries.map((e) => {
    if (e.player) return { entry: e, time: yourTime || Infinity, you: true };
    // HIS OWN LAP, NOT A FUDGE OF SOMEBODY ELSE'S. lapFor(skill) is the
    // time the game's own speed plan says a driver of that skill takes
    // round this circuit - the same plan the robots race to - so a
    // qualifying sheet is the field you are about to race, not a guess
    // scaled off one benchmark number. The roll on top is the difference
    // between a driver's good lap and his ordinary one.
    const lap = lapFor(skill * e.pace) * (1 + (Math.random() - 0.5) * 0.010 + (1 - e.pace) * Math.random() * 0.008);
    return { entry: e, time: lap, you: false };
  });
  rows.sort((a, b) => a.time - b.time);
  return rows;
}

/** what a finishing order is worth */
export function award(season, order, fastestId) {
  const top10 = order.slice(0, 10);
  order.forEach((row, i) => {
    const pts = (POINTS[i] || 0) + (row.id === fastestId && i < 10 ? 1 : 0);
    if (!pts) return;
    season.points[row.id] = (season.points[row.id] || 0) + pts;
    const team = row.id.split(':')[0];
    season.teamPoints[team] = (season.teamPoints[team] || 0) + pts;
  });
  void top10;
  if (fastestId) season.fastest[fastestId] = (season.fastest[fastestId] || 0) + 1;
}

/** the drivers' table, best first */
export function standings(season) {
  const entries = field();
  return entries.map((e) => {
    const id = idOf(e);
    return { id, entry: e, name: e.name, team: e.team, points: season.points[id] || 0, player: !!e.player };
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** the constructors' table */
export function teamStandings(season) {
  return TEAMS.map((t) => ({ team: t, points: season.teamPoints[t.id] || 0 }))
    .sort((a, b) => b.points - a.points || a.team.name.localeCompare(b.team.name));
}

/** where you are in the championship, 1-based */
export function playerPosition(season) {
  const table = standings(season);
  return table.findIndex((r) => r.player) + 1;
}
