// =====================================================================
// DUNK :: plays.js - WHAT A TEAM RUNS
// =====================================================================
//
// Liam: *"I need you to make actual plays to be run and NPC's to be
// looking good"*.
//
// THE PROBLEM WITH THE OLD OFFENCE was not that it played badly. It was
// that it did not play TOGETHER. Every man asked himself the same three
// questions - am I open, is he in trouble, where is my spot - answered
// them well, and stood there. Five reasonable individuals looks like
// nobody has any idea what anybody else is doing, because they do not.
//
// A PLAY IS A SHARED INTENTION WITH A CLOCK ON IT. One man calls it, all
// five get a role, and each role knows where to be at each moment and
// what it is waiting for. The ball handler is not choosing freely any
// more: he is running something, and the other four are running it with
// him.
//
// ---------------------------------------------------------------------
// HOW A PLAY IS WRITTEN
// ---------------------------------------------------------------------
//
// In ATTACK-RELATIVE coordinates, so a play is written once and works at
// both ends: `out` is metres back from the rim you are attacking, `side`
// is metres across, positive being the side the ball started on. `at()`
// turns that into world space.
//
// Each role gets a `spot(t)` - where to be, t seconds into the play - and
// the play gets `beat`s: things that should happen at a moment, like "the
// ball goes to the roller now, if he is open".
//
// THE SCREENS ARE REAL. A screener is a man standing still in somebody's
// way, and this game already has honest contact between players - so a
// pick works because the defender genuinely cannot walk through it, not
// because a flag was set. That is the whole reason it was worth building
// contact properly first.
import { len } from './scale.js';

/** attack-relative -> world. `dir` is which way this side attacks. */
export function at(rim, dir, flip, out, side) {
  return { x: rim.x - dir * len(out), z: flip * len(side) };
}

// ---------------------------------------------------------------------
// the roles a man can have
// ---------------------------------------------------------------------
//   ball    has it, or is about to
//   screen  sets the pick, then rolls
//   pop     spaces to the arc and waits for the kick-out
//   corner  stands in the corner and does not move, which is a job
//   cut     goes backdoor at a moment
export const ROLES = ['ball', 'screen', 'pop', 'corner', 'cut'];

export const PLAYS = [
  // -------------------------------------------------------------------
  {
    id: 'pnr',
    name: 'PICK AND ROLL',
    minPlayers: 2,
    length: 6.0,
    // the most common action in basketball, and the most legible: the big
    // walks into the guard's defender, the guard goes past him, the big
    // turns and runs to the rim. If the defence follows the ball, the
    // roller is free; if it follows the roller, the guard is.
    roles: (n) => n >= 3 ? ['ball', 'screen', 'corner', 'pop', 'corner'] : ['ball', 'screen'],
    spot(role, t) {
      switch (role) {
        case 'ball':
          // bring it, use the screen, turn the corner
          if (t < 1.2) return { out: 8.0, side: 3.5 };
          if (t < 2.4) return { out: 6.6, side: 1.2 };
          return { out: 4.2, side: -1.0 };
        case 'screen':
          // arrive, stand still, then ROLL - the standing still is the
          // whole point and is why it has its own phase
          if (t < 1.0) return { out: 6.2, side: 0.4 };
          if (t < 2.2) return { out: 6.4, side: 2.0 };      // the pick itself
          return { out: 1.6, side: 0.4 };                   // rolling to the rim
        case 'pop':   return { out: 7.2, side: -4.6 };
        case 'corner': return { out: 2.0, side: -5.4 };
        default:      return { out: 6.0, side: -3.0 };
      }
    },
    // the screener is stationary while he is actually setting it
    planted: (role, t) => role === 'screen' && t >= 1.0 && t < 2.3,
    beats: [
      { t: 2.6, from: 'ball', to: 'screen', why: 'the roll' },
      { t: 4.2, from: 'ball', to: 'pop', why: 'the kick-out' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'givego',
    name: 'GIVE AND GO',
    minPlayers: 2,
    length: 4.6,
    // pass it and run. The oldest play there is, and it punishes a
    // defender who turns to watch the ball - which these ones do, because
    // they are told to face it.
    roles: (n) => n >= 3 ? ['ball', 'pop', 'corner', 'cut', 'corner'] : ['ball', 'pop'],
    spot(role, t) {
      switch (role) {
        case 'ball':
          if (t < 0.9) return { out: 7.4, side: 3.0 };
          if (t < 1.6) return { out: 7.0, side: 2.4 };
          return { out: 1.4, side: 0.2 };                   // the cut
        case 'pop':   return { out: 6.8, side: -2.6 };
        case 'cut':   return t < 2 ? { out: 5.0, side: 4.8 } : { out: 2.2, side: 3.0 };
        case 'corner': return { out: 2.0, side: -5.4 };
        default:      return { out: 6.0, side: -4.0 };
      }
    },
    beats: [
      { t: 1.1, from: 'ball', to: 'pop', why: 'the give' },
      { t: 2.6, from: 'pop', to: 'ball', why: 'the go' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'iso',
    name: 'ISOLATION',
    minPlayers: 1,
    length: 5.0,
    // everybody else gets out of the way. Worth running when the man with
    // the ball is a lot better than the man guarding him, which the NPC
    // checks before it calls this.
    roles: (n) => n >= 3 ? ['ball', 'corner', 'corner', 'pop', 'pop'] : ['ball', 'corner'],
    spot(role, t, i) {
      if (role === 'ball') return t < 1.4 ? { out: 7.6, side: 1.0 } : { out: 5.0, side: 0.6 };
      // the clear-out: everybody to the far side and the corners
      const lane = i % 2 ? 1 : -1;
      return { out: i < 3 ? 2.0 : 7.4, side: -5.2 * (i % 2 ? 1 : 0.55) * (lane > 0 ? 1 : 1) };
    },
    beats: [],
  },

  // -------------------------------------------------------------------
  {
    id: 'post',
    name: 'POST UP',
    minPlayers: 2,
    length: 5.6,
    // the big sits on the block with his back to the rim, the ball goes
    // in to him, everybody else spaces so the defence cannot double
    roles: (n) => n >= 3 ? ['ball', 'screen', 'pop', 'corner', 'corner'] : ['ball', 'screen'],
    spot(role, t) {
      switch (role) {
        case 'ball':  return t < 1.4 ? { out: 7.6, side: 3.6 } : { out: 6.8, side: 3.0 };
        case 'screen': return { out: 2.2, side: 2.2 };       // on the block
        case 'pop':   return { out: 7.0, side: -3.4 };
        case 'corner': return { out: 2.0, side: -5.4 };
        default:      return { out: 6.4, side: -4.4 };
      }
    },
    planted: (role, t) => role === 'screen' && t > 1.0,
    beats: [
      { t: 1.8, from: 'ball', to: 'screen', why: 'the entry' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'break',
    name: 'FAST BREAK',
    minPlayers: 2,
    length: 3.4,
    // not really a play - a shape. Fill the lanes and get there first.
    // Called automatically off a live rebound or a steal.
    roles: (n) => n >= 3 ? ['ball', 'cut', 'cut', 'pop', 'corner'] : ['ball', 'cut'],
    spot(role, t, i) {
      if (role === 'ball') return { out: Math.max(1.8, 9 - t * 3.4), side: 0.4 };
      if (role === 'cut') return { out: Math.max(1.4, 10 - t * 4.0), side: i % 2 ? 4.6 : -4.6 };
      return { out: Math.max(4.0, 12 - t * 3.0), side: i % 2 ? 2.4 : -2.4 };
    },
    beats: [
      { t: 1.6, from: 'ball', to: 'cut', why: 'ahead' },
    ],
  },
];

export const playById = (id) => PLAYS.find((p) => p.id === id) || PLAYS[0];

/**
 * Which play to run.
 *
 * Chosen from the situation rather than at random, because a team that
 * calls a post-up with no big man, or a fast break in a half-court set,
 * looks worse than one that always runs the same thing. The IQ of the man
 * calling it decides how often he gets it wrong - the same rule the rest
 * of the NPC decisions use.
 */
export function callPlay(side, players, ball, wrong) {
  const mine = players.filter((q) => q.side === side);
  const carrier = players.find((q) => q.hasBall);
  const n = mine.length;

  const options = [];
  // a break is on if we have just got it and they are behind us
  const backcourt = carrier && players.filter((q) => q.side !== side
    && Math.sign(q.x - carrier.x) === Math.sign(carrier.vx || 1)).length <= 1;
  if (backcourt) options.push({ id: 'break', worth: 8 });

  const big = mine.find((q) => q.card.pos === 'C');
  if (big && n >= 2) options.push({ id: 'post', worth: 5 + (big.card.sht - 70) / 20 });
  if (n >= 2) options.push({ id: 'pnr', worth: 6.5 });
  if (n >= 2) options.push({ id: 'givego', worth: 5.5 });
  // isolation only if the ball is in good hands
  if (carrier && carrier.card.hnd > 78) options.push({ id: 'iso', worth: 4 + (carrier.card.hnd - 78) / 8 });

  options.sort((a, b) => b.worth - a.worth);
  if (!options.length) return 'pnr';
  // a bad decision is the SECOND best call, not a random one - the same
  // shape of mistake the individual choices make
  return (wrong && options.length > 1 ? options[1] : options[0]).id;
}
