// =====================================================================
// NASCAR :: draft.js - THE AIR BETWEEN THE CARS
// =====================================================================
//
// This is the file that makes it NASCAR and not a racing game with an
// oval in it.
//
// At Daytona a Cup car is flat out from the moment the green flag drops
// until somebody crashes. The tyres are not the limit - the banking sees
// to that - and the driver's right foot is not a variable, because it is
// on the floor. The ONLY thing that decides who goes forward and who goes
// backward is the air, and specifically the hole that the car in front
// punches in it.
//
// Four things happen and all four of them matter:
//
//   THE TOW. A car in the wake of another has less air to push out of the
//   way, so the same 670 horsepower carries it several miles an hour
//   faster. Pull out of line on your own and you fall back to the speed of
//   a single car - which is why you cannot simply drive round the
//   outside, and why NASCAR's whole strategy is about who will go with you.
//
//   THE PUSH. The car IN FRONT also goes faster, because the car behind
//   fills in the low-pressure hole it drags along with it. Two cars nose
//   to tail are faster than either alone; twenty of them are faster again.
//   This is the part people get wrong and it is the part that makes a
//   pack a pack rather than a queue.
//
//   DIRTY AIR. The car behind is running in air that has already been
//   through somebody else's radiator. Its front splitter never sees clean
//   flow, so it loses FRONT downforce and the car will not turn - the
//   aero push. And the car in front loses REAR downforce with a nose
//   under its spoiler, which makes it loose. That combination, a tight
//   car behind a loose car, is how the Big One starts.
//
//   THE SIDE DRAFT. Pull alongside and slightly ahead and your quarter
//   panel takes the air off the other car's spoiler. It is worth a tenth
//   or two and it is what a side-by-side run down the backstretch is
//   actually made of.
//
// Everything here is written into `car.air`, which stock.js reads as three
// multipliers and never has to know about any of this. The numbers below
// were set by tools/draft.mjs, which measures the effect and prints it in
// miles an hour against what the sport reports: a single car qualifies at
// about 194 mph, a pair hooked up run 200 to 205, and a full pack is
// faster again.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const AIR = {
  // how far back the hole in the air reaches, in metres. Ten car lengths is
  // what the drivers say and fifty metres is ten car lengths.
  wake:        52,
  // and how wide it is: a car's width at the bumper, opening out behind
  halfNear:    1.5,
  halfFar:     4.6,
  // the tow, as a fraction of drag taken off the car BEHIND at zero gap
  tow:         0.140,
  // and off the car IN FRONT, for having its wake filled in
  push:        0.080,
  // dirty air: what the car behind loses at the front, and what the car in
  // front loses at the back
  dirtyFront:  0.26,
  looseRear:   0.16,
  // the side draft: extra drag on a car being sided, and how far out it works
  side:        0.075,
  sideReach:   6.5,
  // HOW MUCH THE DRAFT CAN EVER BE WORTH, all cars added together.
  //
  // The tow and the push are worked out car by car and added up, and added
  // up is wrong past two or three of them: the sixth car in a line had four
  // cars ahead and five behind and came out at sixty per cent of clean-air
  // drag, which is thirty-five miles an hour in hand over a single car. A
  // run in the draft is worth five or ten, not thirty-five. Air does not
  // stack like that - the second car ahead is already in a hole somebody
  // else made - so the total is passed through 1-exp(-x) and approaches
  // this and no further.
  maxDraft:    0.22,
  // nothing is allowed to run away: floors on all three multipliers
  minDrag:     0.40,
  minPushF:    0.66,
  minPushR:    0.76,
};

/**
 * Work out what every car does to every other car's air, and write it into
 * each car's `air`.
 *
 * @param runners  the world.js Runners, player and robots alike
 * @param length   the lap distance, so the gap can be measured round the wrap
 *
 * ---------------------------------------------------------------------
 * THE WAKE FOLLOWS THE ROAD, NOT THE CAR
 * ---------------------------------------------------------------------
 *
 * The first version measured where each car was in the OTHER car's own
 * frame - how far behind, how far to the side - which is the obvious
 * thing and is wrong on an oval. Forty metres back on a 349 m radius
 * corner is two and a half metres off to the side in the leader's frame,
 * and a hundred metres back is nearly nine; so the wake, which is only a
 * few metres wide, swung off the outside of the corner and missed
 * everybody behind it. A twelve-car pack got less tow in the turns than a
 * pair did, which is the exact opposite of the truth, and the pack read
 * as SLOWER than a single car.
 *
 * So both numbers are taken in TRACK coordinates: `back` is the
 * difference in lap distance, `lat` the difference in how far each car is
 * off the centre line. The hole in the air bends round the corner with
 * the road, which is what it does in life.
 *
 * The lap distance has to be taken modulo the lap, too, or a car about to
 * be lapped - a few car lengths ahead in plan, a whole lap behind in
 * progress - gives no tow to the leader closing on it.
 */
export function airflow(runners, length) {
  const N = runners.length;
  const L = length || 1e9;
  for (const r of runners) {
    r.car.air.dragScale = 1; r.car.air.pushF = 1; r.car.air.pushR = 1;
    r.tow = 0; r.pushedBy = 0;
  }
  for (let a = 0; a < N; a++) {
    if (runners[a].out) continue;
    const A = runners[a].car;
    for (let b = 0; b < N; b++) {
      if (a === b || runners[b].out) continue;
      const B = runners[b].car;
      // how far BEHIND A car B is, round the lap
      let back = runners[a].dist - runners[b].dist;
      back = ((back % L) + L) % L;
      if (back > L / 2) back -= L;
      if (back > AIR.wake || back < -AIR.sideReach - 4) continue;
      const lat = runners[b].lat - runners[a].lat;

      // ---- IS B IN A'S WAKE? ------------------------------------------
      if (back > 1.5 && back < AIR.wake) {
        const t = back / AIR.wake;
        // the wake opens out behind the car, so the further back you sit the
        // more room there is to be in it - and the weaker it is
        const half = AIR.halfNear + (AIR.halfFar - AIR.halfNear) * t;
        if (Math.abs(lat) < half) {
          // strength: strongest on the bumper, gone by ten car lengths, and
          // a soft edge sideways so easing out of line loses it gradually
          const fLat = 1 - (Math.abs(lat) / half) ** 2;
          // ...and only if they are pointing the same way. A car that has
          // spun is not towing anybody.
          const align = Math.max(0, Math.cos(A.yaw - B.yaw));
          const f = (1 - t) ** 1.25 * fLat * align;

          // B, in the tow: less drag, and no clean air over its splitter
          B.air.dragScale -= AIR.tow * f;
          B.air.pushF -= AIR.dirtyFront * f;
          runners[b].tow += f;

          // A, being pushed: less drag too, and a nose under its spoiler
          A.air.dragScale -= AIR.push * f;
          A.air.pushR -= AIR.looseRear * f;
          runners[a].pushedBy += f;
        }
      }

      // ---- IS B SIDE-DRAFTING A? ---------------------------------------
      // B is alongside, and B's nose is AHEAD of A's: B's quarter panel is
      // pulling the air off A's spoiler and A pays for it in drag.
      const al = Math.abs(lat);
      if (al > 1.9 && al < AIR.sideReach && back < -0.5 && back > -6.5) {
        const f = (1 - al / AIR.sideReach) * (1 - Math.abs(back + 3.5) / 3.5);
        if (f > 0) A.air.dragScale += AIR.side * f;
      }
    }
  }
  for (const r of runners) {
    const air = r.car.air;
    // the linear sum above is only the raw demand; what actually comes off
    // saturates (see AIR.maxDraft). A side draft ADDS drag and is left alone.
    const want = 1 - air.dragScale;
    if (want > 0) air.dragScale = 1 - AIR.maxDraft * (1 - Math.exp(-want / AIR.maxDraft));
    air.dragScale = clamp(air.dragScale, AIR.minDrag, 1.25);
    air.pushF = clamp(air.pushF, AIR.minPushF, 1);
    air.pushR = clamp(air.pushR, AIR.minPushR, 1);
  }
}
