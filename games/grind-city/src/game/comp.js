// COMPETITIONS. The only place money comes from.
//
// Free skating still scores, and your best run per park is still kept, but it
// pays nothing. Cash comes from placing in a comp, which means every hoodie in
// the shop is the result of beating somebody.
//
// Target spots are DERIVED from the park's own rails and lips rather than typed
// in as coordinates -- edit a park and its comps follow it instead of quietly
// pointing at empty concrete. The formats themselves are described on the
// circuit below.

const AIR_TRICKS = ['KICKFLIP', 'SHOVE-IT', 'HEELFLIP', '180', 'OLLIE'];
// SLIDE is not in here. The settle magnets the deck's yaw onto multiples of a
// HALF turn, and every one of those is parallel to the bar -- so there is no
// stable sideways for the board to land in, and a shove-it passes through the
// slide window for about one frame in seventy. Asking for one was asking for
// something the controls cannot deliver.
const RAIL_TRICKS = ['GRIND', '50-50', 'GRIND', '50-50'];

import { WORLD } from '../world/park.js';

// THE CIRCUIT.
//
// Three formats, and they are deliberately unequal in number:
//
//   JAM    a clock and three rivals, out-score them. There are only six in the
//          game and there will not be more -- a jam asks nothing specific of
//          you, so a circuit made of them is the same evening over and over.
//   SPOTS  marked places on the course, each naming a trick you must land
//          THERE. Take them in any order, retry as often as the clock allows.
//   LINE   the same idea in ORDER, one attempt at each, and the faster you
//          ride it the more every cleared trick pays.
//
// Purses climb with the park rather than with the format, so the circuit reads
// as somewhere to work your way up rather than a menu of equals.
export const COMPS = [
  // --- the starter parks ---------------------------------------------------
  { id: 'plaza-jam', park: 'plaza', kind: 'jam', name: 'PLAZA JAM',
    blurb: 'ninety seconds. out-score three locals.',
    time: 90, purse: [700, 350, 150],
    rivals: [['DEZ', 5200], ['MARCUS', 3900], ['OLLIE B', 2600]] },
  { id: 'plaza-spots', park: 'plaza', kind: 'spots', name: 'PLAZA SPOT CHECK',
    blurb: 'five marked spots. land the named trick at each.',
    time: 120, purse: [900, 450, 200], spots: 5,
    rivals: [['DEZ', 4600], ['MARCUS', 3400], ['OLLIE B', 2200]] },
  { id: 'plaza-line', park: 'plaza', kind: 'line', name: 'SIXTH STREET LINE',
    blurb: 'the bar, the funbox, the six stair. in that order.',
    time: 70, purse: [1100, 550, 240], spots: 4,
    rivals: [['MARCUS', 5000], ['OLLIE B', 3600], ['NAT', 2400]] },
  { id: 'plaza-spots-2', park: 'plaza', kind: 'spots', name: 'GOLDEN HOUR',
    blurb: 'six spots, and the light is going.',
    time: 110, purse: [1300, 650, 280], spots: 6,
    rivals: [['DEZ', 5400], ['VIV', 4100], ['NAT', 2800]] },

  { id: 'bowl-jam', park: 'bowl', kind: 'jam', name: 'BOWL JAM',
    blurb: 'pump, air out, keep the line alive.',
    time: 90, purse: [800, 400, 180],
    rivals: [['KAZ', 6100], ['RENA', 4400], ['TOMO', 3000]] },
  { id: 'bowl-line', park: 'bowl', kind: 'line', name: 'BOWL RUN',
    blurb: 'one end to the other, in order, on the clock.',
    time: 75, purse: [1200, 600, 260], spots: 4,
    rivals: [['KAZ', 5200], ['RENA', 3800], ['TOMO', 2500]] },
  { id: 'bowl-spots', park: 'bowl', kind: 'spots', name: 'COPING CALL',
    blurb: 'five spots round the lip. mind the fence.',
    time: 115, purse: [1000, 500, 220], spots: 5,
    rivals: [['RENA', 4800], ['TOMO', 3500], ['GIL', 2300]] },

  { id: 'warehouse-spots', park: 'warehouse', kind: 'spots', name: 'WAREHOUSE SESSION',
    blurb: 'the indoor spot check. tight and fast.',
    time: 110, purse: [1000, 500, 220], spots: 5,
    rivals: [['VIV', 5600], ['PAOLO', 4200], ['SNAKE', 2900]] },
  { id: 'warehouse-line', park: 'warehouse', kind: 'line', name: 'AFTER HOURS',
    blurb: 'mini ramp to the long bar, before anyone notices.',
    time: 65, purse: [1400, 700, 300], spots: 4,
    rivals: [['VIV', 5000], ['SNAKE', 3600], ['ARCH', 2400]] },
  { id: 'warehouse-spots-2', park: 'warehouse', kind: 'spots', name: 'ONE LAMP',
    blurb: 'six spots in one room. no excuses.',
    time: 125, purse: [1500, 750, 320], spots: 6,
    rivals: [['PAOLO', 5800], ['VIV', 4400], ['ARCH', 3000]] },

  // --- the schoolyard and the docks -----------------------------------------
  { id: 'schoolyard-line', park: 'schoolyard', kind: 'line', name: 'SCHOOLYARD LINE',
    blurb: 'both stair sets, in order, before the bell.',
    time: 80, purse: [1500, 750, 320], spots: 4,
    rivals: [['DEZ', 6400], ['VIV', 5000], ['SNAKE', 3400]] },
  { id: 'schoolyard-jam', park: 'schoolyard', kind: 'jam', name: 'SCHOOLYARD JAM',
    blurb: 'open session. biggest score takes it.',
    time: 100, purse: [1100, 550, 240],
    rivals: [['DEZ', 7000], ['MARCUS', 5100], ['RENA', 3600]] },
  { id: 'schoolyard-spots', park: 'schoolyard', kind: 'spots', name: 'DETENTION',
    blurb: 'six spots. hubba, handrails, the lot.',
    time: 130, purse: [1700, 850, 360], spots: 6,
    rivals: [['DEZ', 6800], ['MARCUS', 5200], ['CASS', 3500]] },
  { id: 'schoolyard-line-2', park: 'schoolyard', kind: 'line', name: 'LAST BELL',
    blurb: 'five in order, and the clock is short.',
    time: 62, purse: [2000, 1000, 430], spots: 5,
    rivals: [['VIV', 6000], ['CASS', 4600], ['NAT', 3100]] },

  { id: 'docks-jam', park: 'docks', kind: 'jam', name: 'DOCKS JAM',
    blurb: 'the big transition contest. two minutes.',
    time: 120, purse: [1800, 900, 400],
    rivals: [['KAZ', 9000], ['VIV', 6800], ['PAOLO', 4600]] },
  { id: 'docks-spots', park: 'docks', kind: 'spots', name: 'DOCKS SPOT CHECK',
    blurb: 'five spots on the biggest park in town.',
    time: 130, purse: [2200, 1100, 480], spots: 5,
    rivals: [['KAZ', 8200], ['RENA', 6000], ['TOMO', 4100]] },
  { id: 'docks-line', park: 'docks', kind: 'line', name: 'LAST LIGHT',
    blurb: 'quarter, spine, quarter. in order, off the water.',
    time: 78, purse: [2400, 1200, 520], spots: 4,
    rivals: [['KAZ', 7600], ['PAOLO', 5800], ['WEN', 3900]] },

  // --- the beach ------------------------------------------------------------
  { id: 'sm-jam', park: 'santamonica', kind: 'jam', name: 'SANTA MONICA JAM',
    blurb: 'flow the snake run and keep the line alive.',
    time: 100, purse: [1400, 700, 300],
    rivals: [['SHAY', 7600], ['DEZ', 5800], ['TOMO', 3900]] },
  { id: 'sm-line', park: 'santamonica', kind: 'line', name: 'THE BEACH PATH',
    blurb: 'snake run to the far bowl, in order.',
    time: 85, purse: [1700, 850, 360], spots: 4,
    rivals: [['SHAY', 6400], ['KAZ', 5000], ['RENA', 3300]] },
  { id: 'sm-spots', park: 'santamonica', kind: 'spots', name: 'BOARDWALK CHECK',
    blurb: 'six spots between the pier and the path.',
    time: 125, purse: [1900, 950, 410], spots: 6,
    rivals: [['SHAY', 7000], ['TOMO', 5300], ['HOLLY', 3600]] },

  { id: 'venice-jam', park: 'venice', kind: 'jam', name: 'VENICE OPEN',
    blurb: 'the big one. two minutes on the sand.',
    time: 120, purse: [2600, 1300, 560],
    rivals: [['SHAY', 11000], ['KAZ', 8600], ['VIV', 6200]] },
  { id: 'venice-spots', park: 'venice', kind: 'spots', name: 'VENICE SPOT CHECK',
    blurb: 'five spots across the painted bowls.',
    time: 130, purse: [2400, 1200, 520], spots: 5,
    rivals: [['SHAY', 9400], ['PAOLO', 7000], ['SNAKE', 4800]] },
  { id: 'venice-line', park: 'venice', kind: 'line', name: 'PAINT THE LINE',
    blurb: 'five bowls, in order, one go at each.',
    time: 80, purse: [3000, 1500, 640], spots: 5,
    rivals: [['SHAY', 8800], ['KAZ', 6800], ['HOLLY', 4600]] },

  // --- san francisco --------------------------------------------------------
  { id: 'sf-line', park: 'sanfran', kind: 'line', name: 'THE HILL BOMB',
    blurb: 'four corners, four tricks, in order, all downhill.',
    time: 70, purse: [2200, 1100, 480], spots: 4,
    rivals: [['GIL', 7200], ['SHAY', 5600], ['WEN', 3800]] },
  { id: 'sf-spots', park: 'sanfran', kind: 'spots', name: 'FOG CHECK',
    blurb: 'six spots down four blocks of hill.',
    time: 135, purse: [2000, 1000, 430], spots: 6,
    rivals: [['GIL', 6800], ['DEZ', 5200], ['NAT', 3500]] },
  { id: 'sf-line-2', park: 'sanfran', kind: 'line', name: 'NINE STAIR, NO BRAKES',
    blurb: 'five in order, and the last one is the big set.',
    time: 60, purse: [2800, 1400, 600], spots: 5,
    rivals: [['GIL', 8000], ['KAZ', 6200], ['TREZ', 4200]] },

  // --- the arena ------------------------------------------------------------
  { id: 'arena-spots', park: 'arena', kind: 'spots', name: 'QUALIFIERS',
    blurb: 'five spots on the contest course. the crowd is watching.',
    time: 120, purse: [2400, 1200, 520], spots: 5,
    rivals: [['TREZ', 8600], ['KAZ', 6600], ['VIV', 4500]] },
  { id: 'arena-line', park: 'arena', kind: 'line', name: 'THE RUN',
    blurb: 'hip, rail, spine, quarter. in order. one go at each.',
    time: 72, purse: [3200, 1600, 690], spots: 5,
    rivals: [['TREZ', 9400], ['SHAY', 7400], ['KAZ', 5200]] },
  { id: 'arena-final', park: 'arena', kind: 'spots', name: 'THE FINAL',
    blurb: 'six spots, the biggest purse on the circuit.',
    time: 140, purse: [3600, 1800, 780], spots: 6,
    rivals: [['TREZ', 12000], ['SHAY', 9600], ['GIL', 7000]] },

  // --- the sewer ------------------------------------------------------------
  { id: 'sewer-line', park: 'sewer', kind: 'line', name: 'THE OUTFALL',
    blurb: 'down the channel, in order, in the dark.',
    time: 68, purse: [1800, 900, 390], spots: 4,
    rivals: [['SNAKE', 6600], ['ARCH', 5000], ['WEN', 3400]] },
  { id: 'sewer-spots', park: 'sewer', kind: 'spots', name: 'NOBODY DOWN HERE',
    blurb: 'five spots nobody is supposed to be near.',
    time: 120, purse: [1600, 800, 350], spots: 5,
    rivals: [['SNAKE', 6000], ['PAOLO', 4600], ['ARCH', 3100]] },

  // --- the pool -------------------------------------------------------------
  { id: 'pool-spots', park: 'pool', kind: 'spots', name: 'BACKYARD CHECK',
    blurb: 'five spots round the coping. no flat to rest on.',
    time: 115, purse: [1700, 850, 370], spots: 5,
    rivals: [['RENA', 6200], ['HOLLY', 4700], ['GIL', 3200]] },
  { id: 'pool-line', park: 'pool', kind: 'line', name: 'SHALLOW TO DEEP',
    blurb: 'love seat, deep end, far wall. in order.',
    time: 64, purse: [2100, 1050, 450], spots: 4,
    rivals: [['RENA', 6800], ['KAZ', 5400], ['HOLLY', 3600]] },

  // --- the car park ---------------------------------------------------------
  { id: 'garage-line', park: 'garage', kind: 'line', name: 'LEVEL THREE',
    blurb: 'kerbs, the barrier, the ramp down. in order.',
    time: 74, purse: [1600, 800, 350], spots: 4,
    rivals: [['ARCH', 5800], ['NAT', 4400], ['SNAKE', 3000]] },
  { id: 'garage-spots', park: 'garage', kind: 'spots', name: 'AFTER CLOSING',
    blurb: 'six spots, two levels, no security.',
    time: 130, purse: [1800, 900, 390], spots: 6,
    rivals: [['ARCH', 6400], ['PAOLO', 4900], ['NAT', 3300]] },

  // --- the ditch ------------------------------------------------------------
  { id: 'ditch-line', park: 'ditch', kind: 'line', name: 'THE CHANNEL',
    blurb: 'nine banks, four tricks, in order. keep your speed.',
    time: 82, purse: [2000, 1000, 430], spots: 4,
    rivals: [['WEN', 6600], ['GIL', 5100], ['TOMO', 3400]] },
  { id: 'ditch-spots', park: 'ditch', kind: 'spots', name: 'A MILE OF CONCRETE',
    blurb: 'six spots and a long way between them.',
    time: 140, purse: [1900, 950, 410], spots: 6,
    rivals: [['WEN', 6000], ['TOMO', 4600], ['CASS', 3100]] },

  // --- the vert ramp --------------------------------------------------------
  { id: 'vert-spots', park: 'vert', kind: 'spots', name: 'VERT SESSION',
    blurb: 'five spots, all of them in the air.',
    time: 120, purse: [2600, 1300, 560], spots: 5,
    rivals: [['TREZ', 9000], ['KAZ', 7000], ['SHAY', 4800]] },
  { id: 'vert-line', park: 'vert', kind: 'line', name: 'WALL TO WALL',
    blurb: 'near wall, spine, channel, far wall. one go at each.',
    time: 66, purse: [3400, 1700, 730], spots: 4,
    rivals: [['TREZ', 10000], ['SHAY', 7800], ['KAZ', 5600]] },

  // --- the museum -----------------------------------------------------------
  { id: 'museum-line', park: 'museum', kind: 'line', name: 'BEFORE SECURITY',
    blurb: 'three ledges and the twelve stair. in order, quickly.',
    time: 68, purse: [2600, 1300, 560], spots: 4,
    rivals: [['CASS', 8000], ['DEZ', 6200], ['GIL', 4300]] },
  { id: 'museum-spots', park: 'museum', kind: 'spots', name: 'MARBLE CHECK',
    blurb: 'six spots on polished granite.',
    time: 130, purse: [2300, 1150, 500], spots: 6,
    rivals: [['CASS', 7400], ['VIV', 5700], ['NAT', 3900]] },
  { id: 'museum-line-2', park: 'museum', kind: 'line', name: 'THE TWELVE',
    blurb: 'five in order and the set is in the middle of it.',
    time: 58, purse: [3000, 1500, 640], spots: 5,
    rivals: [['CASS', 8800], ['TREZ', 6800], ['DEZ', 4700]] },

  // --- the subway -----------------------------------------------------------
  // Two levels, so two very different evenings: one up on the pavement where
  // the fence is the whole spot, and the rest of them down on the platform.
  { id: 'subway-line', park: 'subway', kind: 'line', name: 'LAST TRAIN',
    blurb: 'the fence, the rail down the stairs, then the platform. in order.',
    time: 74, purse: [3000, 1500, 640], spots: 5,
    rivals: [['DEZ', 8800], ['MARCUS', 6900], ['ARCH', 4600]] },
  { id: 'subway-spots', park: 'subway', kind: 'spots', name: 'OFF PEAK',
    blurb: 'six spots between trains. nobody down here is watching.',
    time: 140, purse: [2500, 1250, 540], spots: 6,
    rivals: [['DEZ', 7600], ['GIL', 5900], ['NAT', 4100]] },
  { id: 'subway-line-2', park: 'subway', kind: 'line', name: 'THE EXPRESS',
    blurb: 'four spots along the carriages, one attempt each. do not hang about.',
    time: 52, purse: [3600, 1800, 780], spots: 4,
    rivals: [['MARCUS', 10200], ['DEZ', 7900], ['CASS', 5400]] },
  { id: 'subway-fence', park: 'subway', kind: 'spots', name: 'THE LONG FENCE',
    blurb: 'five spots up top. the fence runs three screens.',
    time: 110, purse: [2100, 1050, 450], spots: 5,
    rivals: [['GIL', 6800], ['NAT', 5200], ['ARCH', 3600]] },

  // --- the city ------------------------------------------------------------
  { id: 'nyc-line', park: 'nyc', kind: 'line', name: 'FORTY BLOCKS',
    blurb: 'six spots across the whole city, in order.',
    time: 130, purse: [3200, 1600, 690], spots: 6,
    rivals: [['MARCUS', 9800], ['DEZ', 7600], ['CASS', 5200]] },
  { id: 'nyc-spots', park: 'nyc', kind: 'spots', name: 'CITY CHECK',
    blurb: 'six spots out on the block. traffic does not stop.',
    time: 150, purse: [2800, 1400, 600], spots: 6,
    rivals: [['MARCUS', 8600], ['NAT', 6600], ['ARCH', 4500]] },

];

export function compsFor(parkId) {
  return COMPS.filter((c) => c.park === parkId);
}
export function compById(id) {
  return COMPS.find((c) => c.id === id);
}

// --- where the spots go ------------------------------------------------------
// Rails make grind spots; lips and the tops of blocks make air spots. Spread
// them across the park and give each one a trick to ask for.
function candidates(park) {
  const out = [];
  for (const r of park.rails) {
    out.push({ x: (r.x0 + r.x1) / 2, rail: true });
  }
  for (const s of park.segs) {
    if (!s.lipEnd) continue;
    if (Math.abs(s.ty) > 0.45) continue;          // skip the tops of walls
    out.push({ x: s.x1, rail: false });
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

function buildSpots(park, n, seed) {
  const cand = candidates(park);
  if (!cand.length) return [];
  const spots = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.min(cand.length - 1, Math.round((i + 0.5) / n * cand.length));
    const c = cand[idx] || cand[cand.length - 1];
    const list = c.rail ? RAIL_TRICKS : AIR_TRICKS;
    spots.push({
      x: c.x,
      need: list[(i + seed) % list.length],
      rail: c.rail,
      done: false,
      value: c.rail ? 420 : 360,
    });
  }
  // never ask for the same thing twice in a row
  for (let i = 1; i < spots.length; i++) {
    if (spots[i].need !== spots[i - 1].need) continue;
    const list = spots[i].rail ? RAIL_TRICKS : AIR_TRICKS;
    spots[i].need = list[(i + seed + 1) % list.length];
  }
  return spots;
}

// --- the runtime -------------------------------------------------------------
export function createComp(def, park, sk, score) {
  const seed = def.id.length;
  const spots = def.kind === 'jam' ? [] : buildSpots(park, def.spots || 4, seed);
  const rivals = def.rivals.map((r) => ({
    name: r[0], total: r[1], score: 0,
    // each rival scores at their own pace, so the leaderboard actually moves
    pace: 0.75 + ((r[1] * 7919) % 50) / 100,
  }));

  const c = {
    def, park, spots, rivals,
    t: def.time,
    bonus: 0,
    // line comps only: how many you cleared in a row, and how many you burned
    streak: 0, missed: 0,
    next: 0,                 // for a LINE: the only spot you may claim
    over: false,
    result: null,
    flash: '', flashT: 0,
    // how close to a marked spot you have to be. A length, so it scales with
    // the park -- the spots are 1.75x further apart than they used to be.
    RADIUS: 95 * WORLD,

    live() { return score.total + Math.round(score.chainPts * score.mult) + c.bonus; },

    update(dt) {
      if (c.over) return;
      c.t = Math.max(0, c.t - dt);
      if (c.flashT > 0) c.flashT -= dt;

      const done = 1 - c.t / def.time;
      for (const r of rivals) {
        // ease out: they front-load, so you are behind early and it is a chase
        const k = Math.min(1, Math.pow(done, r.pace));
        r.score = Math.round(r.total * k);
      }

      // claim spots off whatever the score just recorded
      if (spots.length && score.events.length) {
        for (const name of score.events) {
          if (def.kind === 'line') { c.claimLine(name); continue; }
          for (const sp of spots) {
            if (sp.done) continue;
            if (Math.abs(sk.x - sp.x) > c.RADIUS) continue;
            if (name.indexOf(sp.need) < 0) continue;
            sp.done = true;
            c.bonus += sp.value;
            c.flash = 'SPOT CLEARED  +' + sp.value;
            c.flashT = 1.6;
            break;
          }
        }
      }
      score.events.length = 0;

      const allDone = spots.length && spots.every((s) => s.done);
      if (c.t <= 0 || allDone) c.finish(allDone);
    },

    // A LINE IS ONE ATTEMPT PER SPOT, IN ORDER.
    //
    // The next spot is the only one live, and the FIRST trick you land inside it
    // is your go at it. Right, and it pays -- scaled by how much clock you have
    // left, so a line ridden fast is worth more per trick than the same line
    // ridden carefully. Wrong, and the spot is burned: you lose points and the
    // line moves on without it.
    //
    // That is the whole difference between a line and a trick-perform. In a
    // trick-perform you can circle back and try a spot again; here you get one
    // go at each, in sequence, and the run is the run.
    claimLine(name) {
      const sp = spots[c.next];
      if (!sp || sp.done) return;
      if (Math.abs(sk.x - sp.x) > c.RADIUS) return;

      sp.done = true;
      c.next++;

      if (name.indexOf(sp.need) >= 0) {
        // how much clock is left, as a multiplier. Full time remaining is worth
        // two and a half times the base; arriving on the buzzer is worth one.
        const pace = 1 + (c.t / def.time) * 1.5;
        const paid = Math.round(sp.value * pace);
        sp.paid = paid;
        c.bonus += paid;
        c.streak++;
        c.flash = sp.need + ' CLEARED  +' + paid
          + (pace > 1.05 ? '  (x' + pace.toFixed(1) + ' FOR PACE)' : '');
        c.flashT = 1.8;
      } else {
        const lost = Math.round(sp.value * 0.5);
        sp.failed = true;
        sp.paid = -lost;
        c.bonus -= lost;
        c.missed++;
        c.streak = 0;
        c.flash = 'NEEDED ' + sp.need + '  -' + lost;
        c.flashT = 1.8;
      }
    },

    finish(cleared) {
      if (c.over) return;
      c.over = true;
      score.bank();
      // a LINE finished early keeps the leftover clock as a bonus
      if (cleared && def.kind === 'line') c.bonus += Math.round(c.t * 40);
      const mine = c.live();
      const board = rivals.map((r) => ({ name: r.name, score: r.score }));
      board.push({ name: 'YOU', score: mine, you: true });
      board.sort((a, b) => b.score - a.score);
      const place = board.findIndex((e) => e.you);
      c.result = {
        place, board, score: mine,
        purse: place < def.purse.length ? def.purse[place] : 0,
        cleared: !!cleared,
      };
    },
  };
  return c;
}
