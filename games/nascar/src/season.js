// =====================================================================
// NASCAR :: season.js - A CHAMPIONSHIP, AND A RACE THAT LASTS
// =====================================================================
//
// Liam: "add in a endurance mode for hundreds of laps ... a league mode".
//
// Two things live here because they are the same thing at different
// lengths: a season is a list of races, and an endurance race is one race
// long enough that the strategy in it is a season of its own.
//
// ---------------------------------------------------------------------
// THE POINTS, and why they are shaped like this
// ---------------------------------------------------------------------
// Stock car racing does not hand out points the way open-wheel does: the
// winner takes 40, second 35, and then it steps down by one all the way to
// last, so a driver who finishes 30th still scores. On top of that a
// driver takes a point for leading a lap and a point for leading the most
// of them, which is what makes a long green run worth chasing rather than
// riding round in it. That is the real shape and it is worth copying,
// because it is what makes a bad day cost you a handful of points instead
// of everything - and a championship that is still alive in the last race
// is the whole reason to run one.
//
// ---------------------------------------------------------------------
// ENDURANCE
// ---------------------------------------------------------------------
// A 400-lap race at Bristol is two and a half hours of real time, and
// nobody is going to sit through that to find out whether the tyre model
// works. So an endurance race has:
//
//   STAGES        the race is cut into three, with a caution at the end of
//                 each - which is how the real ones are run, and it gives
//                 the strategy a shape rather than one long grind
//   A TIME SCALE  the one concession: the world can be run at up to eight
//                 times speed from the wheel, so a 400-lap race can be
//                 driven in twenty minutes and watched in five. The
//                 physics still runs every step; it is the clock that
//                 moves, not the accuracy
//   TYRES THAT GO OFF and FUEL THAT RUNS OUT, which is the point: at 400
//                 laps you will make a dozen stops and the ones you get
//                 wrong are the ones that lose it
const KEY = 'nascar.season';

export const POINTS_WIN = 40;
export const POINTS_SECOND = 35;

/** what a finishing position is worth */
export function pointsFor(pos, cars) {
  if (pos <= 1) return POINTS_WIN;
  if (pos === 2) return POINTS_SECOND;
  // third takes 34 and it steps down by one; nobody scores less than one
  return Math.max(1, POINTS_SECOND - (pos - 2));
  void cars;
}

/** the lengths a season can be run over, and what each one means */
export const SEASON_LENGTHS = [
  { v: 5, t: '5 RACES' },
  { v: 10, t: '10 RACES' },
  { v: 18, t: 'FULL SEASON' },
];

/** how long a race is, per mode */
export const RACE_LAPS = {
  sprint: [20, 40, 60],
  endurance: [100, 200, 400, 500],
};

/**
 * A NEW SEASON over a calendar drawn from the tracks the game has.
 * `keys` is every track key; the calendar is a shuffled slice of it, so no
 * two seasons are the same and every track gets used.
 */
export function makeSeason(keys, { races = 10, laps = 60, cars = 24, skill = 0.97, weather = 'mixed', seed = Date.now() } = {}) {
  let s = (seed >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const pool = keys.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    seed, races: Math.min(races, pool.length), laps, cars, skill, weather,
    round: 0,
    calendar: pool.slice(0, Math.min(races, pool.length)),
    results: [],                       // one per completed round
    points: {},                        // number -> points
    wins: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.calendar ? s : null;
  } catch (e) { return null; }
}
export function save(season) {
  try { localStorage.setItem(KEY, JSON.stringify(season)); } catch (e) { /* a full store is not a reason to stop racing */ }
}
export function clear() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ditto */ }
}

export const done = (s) => s.round >= s.calendar.length;
export const nextTrack = (s) => s.calendar[Math.min(s.round, s.calendar.length - 1)];

/**
 * Score a finished race. `order` is the finishing order as
 * [{ number, name, pos }], `ledMost` the car number that led the most laps
 * and `led` every number that led one.
 */
export function score(season, order, { led = [], ledMost = null } = {}) {
  for (const row of order) {
    const pts = pointsFor(row.pos, order.length)
      + (led.includes(row.number) ? 1 : 0)
      + (row.number === ledMost ? 1 : 0);
    season.points[row.number] = (season.points[row.number] || 0) + pts;
    if (row.pos === 1) season.wins[row.number] = (season.wins[row.number] || 0) + 1;
  }
}

/** the table, best first */
export function standings(season, field) {
  return field.map((e) => ({
    number: e.number, name: e.name, team: e.team,
    points: season.points[e.number] || 0,
    wins: season.wins[e.number] || 0,
  })).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
}

/**
 * WHERE THE STAGE BREAKS FALL. Three stages: a quarter, a half, and the
 * flag. Under 60 laps it is one stage, because cutting a twenty-lap race
 * into three leaves nothing between the cautions.
 */
export function stagesFor(laps) {
  if (laps < 60) return [];
  return [Math.round(laps * 0.25), Math.round(laps * 0.55)];
}
