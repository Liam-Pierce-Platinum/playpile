// =====================================================================
// NASCAR :: oval.js - THE TRACK, AS A SHAPE AND AS A SET OF QUESTIONS
// =====================================================================
//
// This file has no three.js in it, on purpose. It builds the centre line,
// the banking, the walls, the apron and the pit road as NUMBERS, and
// answers the four questions the physics asks every frame:
//
//   locate(x, z)      where am I round the lap, and how far off the line
//   surface(i, lat)   what is this wheel standing on
//   bank(i)           how steep is the road here, and which way
//   heightAt(i, lat)  and how high off the infield
//
// track.js turns the same numbers into geometry you can look at. Keeping
// them apart is worth a file of its own for one reason: `node tools/race.mjs`
// runs a whole twenty-car race, with drafting, damage and pit stops,
// against the REAL track model, in about a second, with no browser
// anywhere. A bug in the racing line is found in a second instead of in a
// screenshot.
//
// ---------------------------------------------------------------------
// A TRACK IS DESCRIBED, NOT DRAWN
// ---------------------------------------------------------------------
//
// An oval is a handful of straights and a handful of constant-radius arcs,
// and that is exactly how the sport describes them: "3,800 feet of
// frontstretch, thirty-one degrees in the corners, a thousand-foot radius".
// So a track here is that list, starting at the start/finish line:
//
//   { straight: 387, bank: 12 }
//   { arc: 160, radius: 310, bank: 31 }
//
// and everything else - the closure, the banking transitions, the walls,
// the pit road, the racing line - falls out. Adding Talladega or
// Martinsville is a dozen lines at the bottom of this file, which is the
// point of writing it this way.
//
// THE SHAPE HAS TO CLOSE, and it will not on the first try. The sweeps of
// the arcs decide the heading, so they must add to 360 degrees, and that is
// the author's job. The POSITION closing is arithmetic, and it is done
// here: every arc's displacement is fixed once the sweeps are known, and
// each straight contributes its own length times its own (fixed) direction,
// so the closure error is LINEAR in the straight lengths. The smallest
// correction that closes it is one matrix solve, two by two. The published
// straight lengths come out of it barely moved - Daytona's move by under a
// metre - which is the difference between a shape that is nearly right and
// a shape that is right.
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const leftOf = (h) => [Math.cos(h), -Math.sin(h)];

// =====================================================================
// THE TRACKS
// =====================================================================
//
// Lengths, widths, banking and straight lengths are the published ones.
// `finalDrive` is the rear gear a team would bolt in for that race, and it
// is what makes the four-speed mean something different at each one.
//
// THREE CONVENTIONS, because the published figures are not all measured the
// same way and pretending otherwise is how you end up with a track that is
// the right length and the wrong shape:
//
//  - `width` is the RACING SURFACE IN THE TURNS. Most speedways publish a
//    wider figure for the frontstretch (Charlotte is 55 ft at the line and
//    40 ft in the corner); the corner is the one that decides whether three
//    cars fit, so the corner is the one that is here.
//
//  - The LAP LENGTH and the BANKING are published and are exact. The
//    RADII are then whatever closes the shape at that length. Quoted turn
//    radii are a mixture of outside-wall figures, design-drawing figures
//    and figures for a corner that sweeps a full half circle when the
//    real one does not - Daytona's comment below works through why.
//
//    AND THE PUBLISHED STRAIGHT LENGTHS CANNOT ALL BE KEPT. A media guide
//    measures "frontstretch" along the outside wall from wherever the
//    corner banking is judged to end, and "backstretch" the same way, and
//    the two are not measured against each other. Hold all three of the
//    lap, the frontstretch and the backstretch and most of these shapes
//    will not close - there is a hard geometric identity hiding in an
//    oval, that the frontstretch exceeds the backstretch by very nearly
//    the corner radius times the bend angle, and the published pairs do
//    not obey it. So the straights here are the published ones WHERE THEY
//    CLOSE (Talladega's do, to the metre) and are otherwise the longest
//    ones that do, with the difference called out in the track's comment.
//    Every shape below closes to under a metre, which means the solver in
//    centreline() has nothing left to do and the corner you drive is the
//    corner that was written down.
//
//  - `bank` is the banking at the OUTSIDE edge of the racing surface and
//    `bankLow`, where a segment has it, is the banking at the inside edge.
//    A segment with no `bankLow` is banked the same all the way across.
//    Homestead, Las Vegas, Kansas, Iowa, Phoenix, New Hampshire and
//    Kentucky's turns 1-2 all have real progressive banking, and it is
//    real here too: `heightAt` integrates the varying slope across the
//    width, so the top groove is genuinely steeper, genuinely longer, and
//    genuinely worth going to find.
export const TRACKS = {
  daytona: {
    key: 'daytona',
    name: 'DAYTONA INTERNATIONAL SPEEDWAY',
    short: 'DAYTONA',
    where: 'Daytona Beach, Florida',
    blurb: '2.5 miles, 31 degrees, and nobody lifts. The whole race is the draft.',
    length: 4023,          // m - 2.5 miles, and the shape is scaled to match
    width: 12.2,           // m - 40 feet
    apron: 9.0,            // m of paved apron inside the racing surface
    apronBank: 9,          // deg - it flattens out but it does not go flat
    innerRun: 34,          // m of infield before the inside wall
    outerRun: 1.1,         // m of shoulder before the outside wall
    concrete: false,
    finalDrive: 3.55,      // a tall Daytona gear
    pitLimit: 55 / 2.23694,   // m/s - 55 mph on pit road
    stalls: 40,
    pitFrom: -680, pitTo: 430,
    // THREE corners, which is what a tri-oval is: turns 1-2, turns 3-4, and
    // the bend in the frontstretch that the start/finish line sits at the
    // end of. The sweeps add to 360 because they must.
    //
    // The lengths are the published ones and they add up to the published
    // lap: 3,800 ft of frontstretch (which here is the 200 m out of turn 4,
    // the 40 degrees of tri-oval and the 469 m up to turn 1), 3,000 ft of
    // backstretch, and 3,200 ft in each pair of turns - which at 160 degrees
    // of sweep is a 349 m radius, not the 1,000 ft you see quoted, because
    // the quoted figure is for a corner that sweeps a full half circle and
    // a tri-oval's do not.
    shape: [
      { straight: 469, bank: 12, name: 'TRI-OVAL EXIT' },
      { arc: 160, radius: 349, bank: 31, name: 'TURNS 1-2' },
      { straight: 914, bank: 3, name: 'BACKSTRETCH' },
      { arc: 160, radius: 349, bank: 31, name: 'TURNS 3-4' },
      { straight: 200, bank: 6, name: 'TURN 4 EXIT' },
      { arc: 40, radius: 700, bank: 18, name: 'TRI-OVAL' },
    ],
    // where the start/finish line is, as metres from the beginning of the
    // description. Daytona's description starts at the tri-oval apex, which
    // is where the line is painted, so it is zero.
    startAt: 0,
    grandstand: { from: -820, to: 560, rows: 34, height: 24 },
  },

  bristol: {
    key: 'bristol',
    name: 'BRISTOL MOTOR SPEEDWAY',
    short: 'BRISTOL',
    where: 'Bristol, Tennessee',
    blurb: 'Half a mile of concrete in a bowl. You will use second gear and you will use the wall.',
    length: 858,           // m - 0.533 miles
    width: 12.2,
    apron: 5.0,
    apronBank: 12,
    innerRun: 26,
    outerRun: 0.9,
    concrete: true,
    finalDrive: 5.40,      // a short-track gear: fourth is 8,000 rpm down the straight
    pitLimit: 35 / 2.23694,
    stalls: 24,
    // Bristol's pit road runs INTO the corners, because half a mile of
    // frontstretch is 198 m and forty cars do not fit on it. This is not a
    // simplification; it is what the place is like.
    pitFrom: -215, pitTo: 215,
    // The description starts in the middle of the frontstretch, which is
    // where the line is, so startAt is zero and the first 99 m straight is
    // the run up to turn 1.
    shape: [
      { straight: 99, bank: 10, name: 'FRONTSTRETCH' },
      { arc: 180, radius: 73, bank: 28, name: 'TURNS 1-2' },
      { straight: 201, bank: 10, name: 'BACKSTRETCH' },
      { arc: 180, radius: 73, bank: 28, name: 'TURNS 3-4' },
      { straight: 99, bank: 10, name: 'FRONTSTRETCH' },
    ],
    startAt: 0,
    grandstand: { from: -330, to: 330, rows: 46, height: 32 },
  },

  // ===================================================================
  // SUPERSPEEDWAYS - restrictor country
  // ===================================================================

  talladega: {
    key: 'talladega',
    name: 'TALLADEGA SUPERSPEEDWAY',
    short: 'TALLADEGA',
    where: 'Lincoln, Alabama',
    blurb: '2.66 miles and 33 degrees. The biggest and the fastest, and the whole field arrives at turn three together.',
    length: 4280,          // m - 2.66 miles
    width: 14.6,           // m - 48 feet, the widest superspeedway surface
    apron: 9.5,
    apronBank: 8,
    innerRun: 40,
    outerRun: 1.2,
    concrete: false,
    finalDrive: 3.45,      // taller even than Daytona
    pitLimit: 55 / 2.23694,
    stalls: 40,
    pitFrom: -700, pitTo: 480,
    // HERE THE RADIUS IS THE FIGURE THAT IS KEPT, and it is the opposite
    // choice to Daytona's on purpose. Talladega's quoted 1,100 ft turn
    // radius, its 2.66-mile lap and its 33 degrees all agree with each
    // other; it is the 4,300 ft frontstretch and 4,000 ft backstretch
    // that do not fit alongside them. Hold the published straights and
    // the corners come out at 281 m - TIGHTER than Daytona's, which is
    // simply wrong: Talladega is the bigger, faster track and the reason
    // is that its corners are bigger. Built that way it also drove
    // wrong, ten mph a lap slower than Daytona instead of faster.
    //
    // So the corners are 324 m and 340 m - the published 1,100 ft to
    // within two per cent - and both straights are shortened by the same
    // ten per cent to pay for it, which keeps the 4,300:4,000 ratio the
    // place is shaped by.
    //
    // The two ends are not quite equal, and they cannot be: the tri-oval
    // apex is 600 m from turn 1 and only 340 m from turn 4, and an oval
    // with an off-centre apex has to have slightly different ends to
    // close at all. Five per cent, and it is why turn 1 and turn 3 do
    // not feel the same.
    //
    // The tri-oval bend is 14 degrees on a 989 m radius - MUCH shallower
    // than Daytona's 40, which is right. It is a longer, flatter
    // frontstretch, and it is why the field arrives at turn one still in
    // one enormous pack.
    shape: [
      { straight: 600, bank: 12, name: 'TRI-OVAL EXIT' },
      { arc: 173, radius: 324.1, bank: 33, name: 'TURNS 1-2' },
      { straight: 1093, bank: 2, name: 'BACKSTRETCH' },
      { arc: 173, radius: 340.1, bank: 33, name: 'TURNS 3-4' },
      { straight: 340, bank: 5, name: 'TURN 4 EXIT' },
      { arc: 14, radius: 989, bank: 16.5, name: 'TRI-OVAL' },
    ],
    startAt: 0,
    grandstand: { from: -860, to: 560, rows: 38, height: 27 },
  },

  // ===================================================================
  // INTERMEDIATES - a mile and a half, and the sport's bread and butter
  // ===================================================================

  charlotte: {
    key: 'charlotte',
    name: 'CHARLOTTE MOTOR SPEEDWAY',
    short: 'CHARLOTTE',
    where: 'Concord, North Carolina',
    blurb: 'A mile and a half with a quad-oval kink and 24 degrees. The 600 is long enough that the car you start is not the car you finish.',
    length: 2414,          // m - 1.5 miles
    width: 12.2,           // 40 ft in the turns (55 at the start/finish line)
    apron: 7.0,
    apronBank: 7,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -400, pitTo: 300,
    // A QUAD-OVAL, which is a tri-oval with the apex split in two: the
    // frontstretch bows out at the grandstand over two 12-degree bends
    // instead of one 40-degree one. Four convex corners, and the sweeps
    // still add to 360 because a closed left-hand loop has no choice.
    // 1,360 ft of backstretch, 251 m of corner radius over 168 degrees,
    // and a frontstretch of 85 + 150 + 150 m of straight through two 71 m
    // bends - 507 m of it, against a published 1,952.8 ft. That is the
    // gap the note at the top of this file is about: hold the published
    // frontstretch as well and the shape misses closing by 72 m.
    shape: [
      { straight: 85, bank: 5, name: 'FRONTSTRETCH' },
      { arc: 12, radius: 339, bank: 8, name: 'QUAD-OVAL' },
      { straight: 150, bank: 5, name: 'FRONTSTRETCH' },
      { arc: 168, radius: 251, bank: 24, name: 'TURNS 1-2' },
      { straight: 415, bank: 5, name: 'BACKSTRETCH' },
      { arc: 168, radius: 251, bank: 24, name: 'TURNS 3-4' },
      { straight: 150, bank: 5, name: 'TURN 4 EXIT' },
      { arc: 12, radius: 339, bank: 8, name: 'QUAD-OVAL' },
    ],
    // the line is painted half way along the middle of the quad-oval
    startAt: 42,
    grandstand: { from: -420, to: 340, rows: 40, height: 29 },
  },

  atlanta: {
    key: 'atlanta',
    name: 'ATLANTA MOTOR SPEEDWAY',
    short: 'ATLANTA',
    where: 'Hampton, Georgia',
    blurb: 'Reprofiled to 28 degrees and narrowed to forty feet. A superspeedway pack race squeezed onto a mile and a half.',
    length: 2478,          // m - 1.54 miles
    width: 12.2,           // 40 ft since the 2022 reconfiguration narrowed it
    apron: 6.5,
    apronBank: 8,
    innerRun: 28,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -420, pitTo: 300,
    // The 2022 numbers, not the old ones: 28 degrees in the turns instead
    // of 24, and a forty-foot surface instead of fifty-five. 1,800 ft of
    // backstretch and 219 m of corner radius over 169 degrees - the
    // tightest, steepest, narrowest corner on any intermediate, which is
    // exactly why this one runs in a superspeedway pack.
    shape: [
      { straight: 102, bank: 5, name: 'FRONTSTRETCH' },
      { arc: 11, radius: 515, bank: 7, name: 'QUAD-OVAL' },
      { straight: 170, bank: 5, name: 'FRONTSTRETCH' },
      { arc: 169, radius: 218.5, bank: 28, name: 'TURNS 1-2' },
      { straight: 549, bank: 5, name: 'BACKSTRETCH' },
      { arc: 169, radius: 218.5, bank: 28, name: 'TURNS 3-4' },
      { straight: 170, bank: 5, name: 'TURN 4 EXIT' },
      { arc: 11, radius: 515, bank: 7, name: 'QUAD-OVAL' },
    ],
    startAt: 51,
    grandstand: { from: -440, to: 340, rows: 38, height: 27 },
  },

  texas: {
    key: 'texas',
    name: 'TEXAS MOTOR SPEEDWAY',
    short: 'TEXAS',
    where: 'Fort Worth, Texas',
    blurb: 'Turns one and two at 20 degrees, three and four at 24. The two ends want different cars and you only get one.',
    length: 2414,          // m - 1.5 miles
    width: 18.3,           // 60 ft
    apron: 7.0,
    apronBank: 7,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -420, pitTo: 300,
    // THE ENDS ARE NOT THE SAME, and that is the whole character of the
    // place. The 2017 repave took turns 1-2 down to 20 degrees and left
    // turns 3-4 at 24; same radius, same length, four degrees apart, so
    // the car that is happy at one end is loose at the other and there is
    // nothing in the toolbox that fixes both. 1,330 ft of backstretch and
    // 254.5 m of corner radius over 170 degrees.
    shape: [
      { straight: 94, bank: 5, name: 'FRONTSTRETCH' },
      { arc: 10, radius: 214, bank: 6, name: 'QUAD-OVAL' },
      { straight: 165, bank: 5, name: 'FRONTSTRETCH' },
      { arc: 170, radius: 254.5, bank: 20, name: 'TURNS 1-2' },
      { straight: 405, bank: 5, name: 'BACKSTRETCH' },
      { arc: 170, radius: 254.5, bank: 24, name: 'TURNS 3-4' },
      { straight: 165, bank: 5, name: 'TURN 4 EXIT' },
      { arc: 10, radius: 214, bank: 6, name: 'QUAD-OVAL' },
    ],
    startAt: 47,
    grandstand: { from: -440, to: 340, rows: 40, height: 29 },
  },

  kansas: {
    key: 'kansas',
    name: 'KANSAS SPEEDWAY',
    short: 'KANSAS',
    where: 'Kansas City, Kansas',
    blurb: 'Tight corners, long straights, and banking that gets steeper the higher you run. The top groove is worth going to find.',
    length: 2414,          // m - 1.5 miles
    width: 18.3,           // 60 ft
    apron: 7.0,
    apronBank: 7,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -500, pitTo: 270,
    // A D-SHAPE WITH PROGRESSIVE BANKING. 2,207 ft of backstretch and a
    // 17-degree dogleg in the frontstretch leave only 170 m of corner
    // radius - far tighter than Charlotte's 251 on exactly the same lap
    // length. Long straights, short corners, and banking that runs 17
    // degrees at the white line to 20 at the wall, which is why a Kansas
    // car can run the fence when nowhere else lets it.
    shape: [
      { straight: 281, bank: 10.4, name: 'FRONTSTRETCH' },
      { arc: 171.5, radius: 170.8, bank: 20, bankLow: 17, name: 'TURNS 1-2' },
      { straight: 673, bank: 5, name: 'BACKSTRETCH' },
      { arc: 171.5, radius: 167.2, bank: 20, bankLow: 17, name: 'TURNS 3-4' },
      { straight: 330, bank: 9, name: 'TURN 4 EXIT' },
      { arc: 17, radius: 400, bank: 12, name: 'DOGLEG' },
    ],
    startAt: 0,
    grandstand: { from: -520, to: 300, rows: 38, height: 27 },
  },

  lasvegas: {
    key: 'lasvegas',
    name: 'LAS VEGAS MOTOR SPEEDWAY',
    short: 'LAS VEGAS',
    where: 'Las Vegas, Nevada',
    blurb: 'Twelve degrees at the bottom and twenty at the top. Three grooves, and the one that works changes every run.',
    length: 2414,          // m - 1.5 miles
    width: 18.3,           // 60 ft
    apron: 7.0,
    apronBank: 7,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -440, pitTo: 220,
    // The 2006 reconfiguration is the one that matters: the turns went
    // from a flat 12 degrees to PROGRESSIVE 12-to-20, and that is the
    // reason this place has three grooves and Charlotte has one and a
    // half. 1,572 ft of backstretch, a 16-degree dogleg, and 231 m of
    // corner radius over 172 degrees.
    shape: [
      { straight: 226, bank: 9, name: 'FRONTSTRETCH' },
      { arc: 172, radius: 231.8, bank: 20, bankLow: 12, name: 'TURNS 1-2' },
      { straight: 479, bank: 3, name: 'BACKSTRETCH' },
      { arc: 172, radius: 230.1, bank: 20, bankLow: 12, name: 'TURNS 3-4' },
      { straight: 250, bank: 9, name: 'TURN 4 EXIT' },
      { arc: 16, radius: 259, bank: 12, name: 'DOGLEG' },
    ],
    startAt: 0,
    grandstand: { from: -460, to: 260, rows: 40, height: 29 },
  },

  michigan: {
    key: 'michigan',
    name: 'MICHIGAN INTERNATIONAL SPEEDWAY',
    short: 'MICHIGAN',
    where: 'Brooklyn, Michigan',
    blurb: 'Two miles, 18 degrees and the widest surface in the sport. Nobody lifts here either, and there is no restrictor plate to blame.',
    length: 3219,          // m - 2.0 miles
    width: 22.3,           // 73 ft - it really is that wide
    apron: 8.0,
    apronBank: 7,
    innerRun: 34,
    outerRun: 1.1,
    concrete: false,
    finalDrive: 3.55,
    pitLimit: 55 / 2.23694,
    stalls: 40,
    pitFrom: -640, pitTo: 320,
    // 2,242 ft of backstretch, a 22-degree bend in the frontstretch, and
    // 293 m of corner radius over 169 degrees - the biggest corner in the
    // game after Pocono's turn 3, and the media guide's 1,000 ft is the
    // outside wall of it. Eighteen degrees on a corner that big is a 210
    // mph corner, which is why the qualifying record here was set without
    // a plate on the car.
    shape: [
      { straight: 333, bank: 12, name: 'FRONTSTRETCH' },
      { arc: 169, radius: 295, bank: 18, name: 'TURNS 1-2' },
      { straight: 683, bank: 5, name: 'BACKSTRETCH' },
      { arc: 169, radius: 290.5, bank: 18, name: 'TURNS 3-4' },
      { straight: 380, bank: 9, name: 'TURN 4 EXIT' },
      { arc: 22, radius: 249, bank: 12, name: 'THE BEND' },
    ],
    startAt: 0,
    grandstand: { from: -720, to: 340, rows: 40, height: 29 },
  },

  homestead: {
    key: 'homestead',
    name: 'HOMESTEAD-MIAMI SPEEDWAY',
    short: 'HOMESTEAD',
    where: 'Homestead, Florida',
    blurb: 'Eighteen degrees at the white line and twenty at the wall, and the fast way round is all the way up against it.',
    length: 2414,          // m - 1.5 miles
    width: 18.0,           // 59 ft
    apron: 7.0,
    apronBank: 7,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -400, pitTo: 260,
    // A TRUE OVAL - no dogleg, no quad, two straights and two semicircles
    // - and the only one on the calendar whose corners are VARIABLE
    // banked by design. The 2003 rebuild took it from a flat 6 degrees to
    // 18 at the bottom and 20 at the top, and the groove promptly moved
    // to the fence and stayed there. 1,760 ft each straight, 671 m per
    // corner at 180 degrees - a 213 m radius.
    shape: [
      { straight: 268, bank: 4, name: 'FRONTSTRETCH' },
      { arc: 180, radius: 213, bank: 20, bankLow: 18, name: 'TURNS 1-2' },
      { straight: 536, bank: 4, name: 'BACKSTRETCH' },
      { arc: 180, radius: 213, bank: 20, bankLow: 18, name: 'TURNS 3-4' },
      { straight: 268, bank: 4, name: 'FRONTSTRETCH' },
    ],
    startAt: 0,
    grandstand: { from: -420, to: 280, rows: 36, height: 26 },
  },

  darlington: {
    key: 'darlington',
    name: 'DARLINGTON RACEWAY',
    short: 'DARLINGTON',
    where: 'Darlington, South Carolina',
    blurb: 'The egg. One end is tighter and steeper than the other, the speed is against the wall, and it will leave its mark on you.',
    length: 2198,          // m - 1.366 miles
    width: 16.8,           // 55 ft, and turns 1-2 are the narrow end
    apron: 5.0,
    apronBank: 6,
    innerRun: 22,
    outerRun: 0.8,
    concrete: false,
    finalDrive: 4.45,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -380, pitTo: 260,
    // THE ONE TRACK ON THE CALENDAR WITH TWO DIFFERENT ENDS, and the
    // reason it is famous. Turns 1-2 are 25 degrees on a 217 m radius;
    // turns 3-4 are 23 degrees on a 243 m radius. Twelve per cent of
    // radius and two degrees of bank between one end and the other, and
    // you can feel every bit of it.
    //
    // THE SWEEPS HAVE TO DIFFER TOO, and that is the part that is easy to
    // get wrong. Two different-radius ends joined by PARALLEL straights
    // cannot close: the lateral error is 2(R2-R1) and no change to the
    // straight lengths can touch it, because both straights point the
    // same way and the solver's 2x2 goes singular. The straights have to
    // converge, which means the corners sweep 172 and 188 rather than 180
    // and 180. Eight degrees, and without them there is no egg - only a
    // failed oval.
    //
    // Both straights are the published 1,229 ft. The 1.366-mile lap then
    // forces 650 m of turns 1-2 against 797 m of turns 3-4, and the
    // radii follow. None of it is a choice once the egg is admitted.
    shape: [
      { straight: 187, bank: 3, name: 'FRONTSTRETCH' },
      { arc: 172, radius: 216.7, bank: 25, name: 'TURNS 1-2' },
      { straight: 375, bank: 2, name: 'BACKSTRETCH' },
      { arc: 188, radius: 243, bank: 23, name: 'TURNS 3-4' },
      { straight: 188, bank: 3, name: 'FRONTSTRETCH' },
    ],
    startAt: 0,
    grandstand: { from: -390, to: 270, rows: 34, height: 24 },
  },

  nashville: {
    key: 'nashville',
    name: 'NASHVILLE SUPERSPEEDWAY',
    short: 'NASHVILLE',
    where: 'Lebanon, Tennessee',
    blurb: 'A mile and a third of concrete at 14 degrees. It takes rubber like a short track and it is quick like an intermediate.',
    length: 2146,          // m - 1.333 miles
    width: 18.3,           // 60 ft
    apron: 6.0,
    apronBank: 8,
    innerRun: 28,
    outerRun: 0.9,
    concrete: true,        // the only concrete track over a mile
    finalDrive: 4.45,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -420, pitTo: 240,
    // 14 degrees in the turns, 9 on both straights. The straight lengths
    // are the least well published figures on the calendar - this is the
    // newest track in the game and the least written about - so they are
    // reconstructed to the published 1.333-mile lap with the dogleg where
    // the aerial photographs put it, and the corners take what is left:
    // a 214 m radius over 173 degrees.
    shape: [
      { straight: 200, bank: 9, name: 'FRONTSTRETCH' },
      { arc: 173, radius: 213.8, bank: 14, name: 'TURNS 1-2' },
      { straight: 396, bank: 9, name: 'BACKSTRETCH' },
      { arc: 173, radius: 216.3, bank: 14, name: 'TURNS 3-4' },
      { straight: 160, bank: 9, name: 'TURN 4 EXIT' },
      { arc: 14, radius: 374, bank: 10, name: 'DOGLEG' },
    ],
    startAt: 0,
    grandstand: { from: -470, to: 260, rows: 32, height: 23 },
  },

  kentucky: {
    key: 'kentucky',
    name: 'KENTUCKY SPEEDWAY',
    short: 'KENTUCKY',
    where: 'Sparta, Kentucky',
    blurb: 'Fourteen degrees, a frontstretch long enough to see the run coming, and turns one and two that climb to seventeen at the top.',
    length: 2414,          // m - 1.5 miles
    width: 18.3,           // 60 ft
    apron: 7.0,
    apronBank: 7,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 4.30,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -460, pitTo: 200,
    // The 2016 repave left turns 3-4 at a flat 14 degrees and made turns
    // 1-2 PROGRESSIVE, 14 at the bottom to 17 at the top. So the two ends
    // are different again, in a different way to Texas: here one end has
    // a second groove and the other does not. 1,346 ft of backstretch, a
    // 14-degree bend in the frontstretch, and 253 m of corner radius.
    shape: [
      { straight: 210, bank: 8, name: 'FRONTSTRETCH' },
      { arc: 173, radius: 252.4, bank: 17, bankLow: 14, name: 'TURNS 1-2' },
      { straight: 410, bank: 4, name: 'BACKSTRETCH' },
      { arc: 173, radius: 253.9, bank: 14, name: 'TURNS 3-4' },
      { straight: 187, bank: 8, name: 'TURN 4 EXIT' },
      { arc: 14, radius: 320, bank: 10, name: 'DOGLEG' },
    ],
    startAt: 0,
    grandstand: { from: -500, to: 280, rows: 34, height: 25 },
  },

  // ===================================================================
  // SHORT TRACKS - brakes, tempers and sheet metal
  // ===================================================================

  martinsville: {
    key: 'martinsville',
    name: 'MARTINSVILLE SPEEDWAY',
    short: 'MARTINSVILLE',
    where: 'Ridgeway, Virginia',
    blurb: 'The paperclip. Two eight-hundred-foot straights, two flat hairpins, and the brakes are the whole race.',
    length: 847,           // m - 0.526 miles
    width: 12.8,           // 42 ft
    apron: 4.0,
    apronBank: 6,
    innerRun: 20,
    outerRun: 0.8,
    concrete: true,        // the CORNERS are concrete and the straights are
                           // asphalt; the model has one surface and the
                           // corners are the ones that decide the lap
    finalDrive: 5.60,      // shorter even than Bristol
    pitLimit: 30 / 2.23694,
    stalls: 24,
    pitFrom: -200, pitTo: 200,
    // A PAPERCLIP, and the numbers say so without any help: 800 ft of
    // straight at each end and 0.526 of a mile in total leaves 179 m for
    // each corner, and 179 m through 180 degrees is a 57 METRE RADIUS.
    // That is a quarter of an intermediate's corner and a fifth of a
    // superspeedway's. Twelve degrees of banking on a 57 m radius holds
    // about 60 mph, so everything else is brakes - which is exactly what
    // this place is, and why the model needs no special case for it.
    shape: [
      { straight: 122, bank: 0, name: 'FRONTSTRETCH' },
      { arc: 180, radius: 57, bank: 12, name: 'TURNS 1-2' },
      { straight: 244, bank: 0, name: 'BACKSTRETCH' },
      { arc: 180, radius: 57, bank: 12, name: 'TURNS 3-4' },
      { straight: 122, bank: 0, name: 'FRONTSTRETCH' },
    ],
    startAt: 0,
    grandstand: { from: -240, to: 240, rows: 34, height: 24 },
  },

  richmond: {
    key: 'richmond',
    name: 'RICHMOND RACEWAY',
    short: 'RICHMOND',
    where: 'Richmond, Virginia',
    blurb: 'Three quarters of a mile that drives like a mile and a half. Long enough to get a run, short enough to lose a lap.',
    length: 1207,          // m - 0.75 miles
    width: 18.3,           // 60 ft, which is why three cars fit
    apron: 5.5,
    apronBank: 9,
    innerRun: 24,
    outerRun: 0.9,
    concrete: false,
    finalDrive: 5.15,
    pitLimit: 40 / 2.23694,
    // thirty boxes, not forty: the frontstretch is 393 m and the pit road
    // that fits inside it without running to the middle of turn three is
    // 480 m long. Richmond really does put cars in the corner to pit.
    stalls: 30,
    pitFrom: -300, pitTo: 180,
    // A D-SHAPE, and the reason it is the short track that drives big:
    // 14 degrees is intermediate banking, and a 109 m corner radius is
    // half again what Bristol has on a track only forty per cent longer.
    // 860 ft of backstretch, and a frontstretch of 286 m against a
    // published 1,290 ft - the biggest gap of any track here, and the
    // clearest case of the two published straights not being measured
    // against each other. Hold both and the shape misses by 110 m and
    // the bend has to curve the WRONG WAY to fix it.
    shape: [
      { straight: 100, bank: 8, name: 'FRONTSTRETCH' },
      { arc: 174, radius: 109, bank: 14, name: 'TURNS 1-2' },
      { straight: 262, bank: 2, name: 'BACKSTRETCH' },
      { arc: 174, radius: 108, bank: 14, name: 'TURNS 3-4' },
      { straight: 120, bank: 8, name: 'TURN 4 EXIT' },
      { arc: 12, radius: 316, bank: 10, name: 'THE BEND' },
    ],
    startAt: 0,
    grandstand: { from: -320, to: 200, rows: 38, height: 27 },
  },

  phoenix: {
    key: 'phoenix',
    name: 'PHOENIX RACEWAY',
    short: 'PHOENIX',
    where: 'Avondale, Arizona',
    blurb: 'A flat mile with a dogleg in the back straight and two corners that are nothing like each other.',
    length: 1645,          // m - 1.022 miles
    width: 15.8,           // 52 ft
    apron: 6.0,
    apronBank: 6,
    innerRun: 26,
    outerRun: 0.9,
    concrete: false,
    finalDrive: 4.90,
    pitLimit: 45 / 2.23694,
    stalls: 34,
    pitFrom: -320, pitTo: 220,
    // TWO DIFFERENT CORNERS AND A KINK IN THE BACK STRAIGHT, which is
    // three things no other oval on the calendar has together. Turns 1-2
    // are 10-11 degrees on a 142 m radius; turns 3-4 are 8-9 degrees on a
    // 151 m radius and sweep six degrees more, so they are flatter, more
    // open and taken faster. The dogleg is a 22-degree convex bend banked
    // 11 - the backstretch genuinely bows outward, which is why the lap
    // is 1.022 miles and not one, and why the sweeps here are 166 and 172
    // rather than 180 and 180.
    shape: [
      { straight: 180, bank: 3, name: 'FRONTSTRETCH' },
      { arc: 166, radius: 141.6, bank: 11, bankLow: 10, name: 'TURNS 1-2' },
      { straight: 180, bank: 8, name: 'BACKSTRETCH' },
      { arc: 22, radius: 166, bank: 11, name: 'THE DOGLEG' },
      { straight: 178, bank: 8, name: 'BACKSTRETCH' },
      { arc: 172, radius: 151.2, bank: 9, bankLow: 8, name: 'TURNS 3-4' },
      { straight: 179, bank: 3, name: 'FRONTSTRETCH' },
    ],
    startAt: 0,
    grandstand: { from: -330, to: 230, rows: 34, height: 25 },
  },

  iowa: {
    key: 'iowa',
    name: 'IOWA SPEEDWAY',
    short: 'IOWA',
    where: 'Newton, Iowa',
    blurb: 'Seven eighths of a mile with progressive banking. A short track with an intermediate\'s manners.',
    length: 1408,          // m - 0.875 miles
    width: 17.1,           // 56 ft
    apron: 5.5,
    apronBank: 9,
    innerRun: 24,
    outerRun: 0.9,
    concrete: false,
    finalDrive: 5.10,
    pitLimit: 40 / 2.23694,
    stalls: 30,
    pitFrom: -300, pitTo: 180,
    // Rusty Wallace drew it as a scale Richmond and then added the one
    // thing Richmond has not got: PROGRESSIVE BANKING, 12 degrees at the
    // bottom of the corner and 14 at the top. A 146 m corner radius on a
    // seven-eighths-mile lap, which is why the corners feel long.
    shape: [
      { straight: 100, bank: 10, name: 'FRONTSTRETCH' },
      { arc: 174, radius: 146.7, bank: 14, bankLow: 12, name: 'TURNS 1-2' },
      { straight: 244, bank: 4, name: 'BACKSTRETCH' },
      { arc: 174, radius: 145.7, bank: 14, bankLow: 12, name: 'TURNS 3-4' },
      { straight: 120, bank: 10, name: 'TURN 4 EXIT' },
      { arc: 12, radius: 267, bank: 11, name: 'THE BEND' },
    ],
    startAt: 0,
    grandstand: { from: -310, to: 200, rows: 28, height: 20 },
  },

  newhampshire: {
    key: 'newhampshire',
    name: 'NEW HAMPSHIRE MOTOR SPEEDWAY',
    short: 'NEW HAMPSHIRE',
    where: 'Loudon, New Hampshire',
    blurb: 'A mile of nearly flat. Two degrees at the bottom of the corner, seven at the top, and the brakes do what the banking will not.',
    length: 1703,          // m - 1.058 miles
    width: 19.8,           // 65 ft
    apron: 6.0,
    apronBank: 3,
    innerRun: 28,
    outerRun: 0.9,
    concrete: false,
    finalDrive: 4.85,
    pitLimit: 45 / 2.23694,
    stalls: 40,
    pitFrom: -360, pitTo: 260,
    // THE FLAT ONE. 1,500 ft of straight at each end banked one degree,
    // and corners that run 2 degrees at the white line to 7 at the wall -
    // so it is a paperclip with a mile's worth of corner radius, 394 m at
    // 180 degrees, a 125 m radius. Seven degrees on 125 m holds about 85
    // mph; the straights are long enough to see 170. That gap is the
    // whole reason this place is a brake race.
    shape: [
      { straight: 229, bank: 1, name: 'FRONTSTRETCH' },
      { arc: 180, radius: 125, bank: 7, bankLow: 2, name: 'TURNS 1-2' },
      { straight: 457, bank: 1, name: 'BACKSTRETCH' },
      { arc: 180, radius: 125, bank: 7, bankLow: 2, name: 'TURNS 3-4' },
      { straight: 229, bank: 1, name: 'FRONTSTRETCH' },
    ],
    startAt: 0,
    grandstand: { from: -380, to: 280, rows: 38, height: 27 },
  },

  // ===================================================================
  // THE ODD ONES - a triangle and a rectangle
  // ===================================================================

  pocono: {
    key: 'pocono',
    name: 'POCONO RACEWAY',
    short: 'POCONO',
    where: 'Long Pond, Pennsylvania',
    blurb: 'The Tricky Triangle. Three straights, three corners, and not one of them is like the other two.',
    length: 4023,          // m - 2.5 miles
    width: 15.2,           // 50 ft
    apron: 7.0,
    apronBank: 5,
    innerRun: 36,
    outerRun: 1.1,
    concrete: false,
    finalDrive: 3.70,      // a 1,140 m straight and a corner taken in third
    pitLimit: 55 / 2.23694,
    stalls: 40,
    pitFrom: -390, pitTo: 330,
    // A TRIANGLE, AND IT WILL NOT FIT THE OVAL MOULD, which is the point
    // of it. Three straights of 3,740, 3,055 and 1,780 feet, and three
    // corners that famously copy three other tracks: turn 1 is Trenton at
    // 14 degrees, the Tunnel Turn is Indianapolis at 8, and turn 3 is
    // Milwaukee at 6.
    //
    // The SWEEPS are not free here the way they are on an oval - they are
    // very nearly fixed by the triangle itself. Law of cosines on the
    // three straight lengths gives interior angles of about 28, 98 and 54
    // degrees, so the corners sweep about 152, 82 and 126, and those add
    // to 360 because the exterior angles of any triangle do. Rounding the
    // corners off pulls them to 146, 76 and 138, which is what closes.
    //
    // WHAT DOES NOT RECONCILE: the published radii (675, 750 and 1,000
    // ft) with the published straights and the published 2.5-mile lap.
    // The RATIO between them is kept - turn 3 is still a corner half as
    // tight again as turn 1 - and the whole set is scaled by 0.90 to
    // close the lap, because the straights and the lap are the figures a
    // driver would recognise and the radii are not.
    shape: [
      { straight: 1140, bank: 3, name: 'FRONT STRAIGHT' },
      { arc: 146, radius: 185.6, bank: 14, name: 'TURN 1' },
      { straight: 931, bank: 2, name: 'LONG POND STRAIGHT' },
      { arc: 76, radius: 206.3, bank: 8, name: 'TUNNEL TURN' },
      { straight: 543, bank: 2, name: 'NORTH STRAIGHT' },
      { arc: 138, radius: 275, bank: 6, name: 'TURN 3' },
    ],
    startAt: 420,
    grandstand: { from: -400, to: 700, rows: 34, height: 24 },
  },

  indianapolis: {
    key: 'indianapolis',
    name: 'INDIANAPOLIS MOTOR SPEEDWAY',
    short: 'INDIANAPOLIS',
    where: 'Speedway, Indiana',
    blurb: 'Two and a half miles, four flat nine-degree corners and two short chutes. The most famous rectangle on earth.',
    length: 4023,          // m - 2.5 miles
    width: 15.2,           // 50 ft in the turns, 60 on the straights
    apron: 4.5,            // there is barely any - it is a warm-up lane
    apronBank: 1,
    innerRun: 30,
    outerRun: 1.0,
    concrete: false,
    finalDrive: 3.90,      // flat corners: you lift, so you need the gear back
    pitLimit: 60 / 2.23694,
    stalls: 40,
    pitFrom: -640, pitTo: 300,
    // A RECTANGLE WITH THE CORNERS ROUNDED OFF, and unlike every other
    // track here the published description needs no reconstruction at
    // all: four turns of a quarter mile each, two straights of five
    // eighths, two short chutes of an eighth, and 9 degrees 12 minutes of
    // banking. 402.3 x 4 + 1005.8 x 2 + 201.2 x 2 = 4,023 m to the metre.
    //
    // The four 90-degree sweeps add to 360 without any help either. The
    // radius is the one number that moves: 402 m through 90 degrees is
    // 256 m, not the quoted 800 ft, because the quoted figure is the
    // outside wall.
    //
    // NINE DEGREES IS ALMOST NOTHING. Every other corner in this game is
    // held up by its banking; these four are held up by the tyres, and
    // that is why the car has to be turned rather than aimed.
    shape: [
      { straight: 1006, bank: 0, name: 'MAIN STRAIGHT' },
      { arc: 90, radius: 256, bank: 9.2, name: 'TURN 1' },
      { straight: 201, bank: 0, name: 'SHORT CHUTE' },
      { arc: 90, radius: 256, bank: 9.2, name: 'TURN 2' },
      { straight: 1006, bank: 0, name: 'BACK STRAIGHT' },
      { arc: 90, radius: 256, bank: 9.2, name: 'TURN 3' },
      { straight: 201, bank: 0, name: 'SHORT CHUTE' },
      { arc: 90, radius: 256, bank: 9.2, name: 'TURN 4' },
    ],
    // the yard of bricks sits well down the main straight, not at the
    // start of it
    startAt: 680,
    grandstand: { from: -700, to: 320, rows: 44, height: 31 },
  },
};

// =====================================================================
// THE CENTRE LINE
// =====================================================================

/**
 * Walk the description, close it, sample it and smooth it.
 *
 * Returns { points, length, spacing } where every point carries
 *   x, z     plan position, metres
 *   h        heading; forward is (sin h, cos h), matching the car
 *   curve    signed curvature, 1/metres, positive turning LEFT
 *   bank     the road's banking angle here, radians, rising to the right
 *   dist     metres round the lap
 *   seg      which piece of the description it came from, for corner names
 */
function centreline(spec, targetSpacing = 2) {
  const S = spec.shape;

  // ---- 1. the headings, which the straight lengths cannot change --------
  const startH = [];
  let h = 0;
  for (const s of S) {
    startH.push(h);
    if (s.arc) h += s.arc * DEG;
  }
  const closedHeading = Math.abs(((h / DEG) % 360) - 0) < 0.5 || Math.abs(((h / DEG) % 360) - 360) < 0.5;
  if (!closedHeading) {
    console.warn('[oval] ' + spec.key + ': the arcs sweep ' + (h / DEG).toFixed(1) + ' degrees, not 360');
  }

  // ---- 2. the closure, which they can ------------------------------------
  // Arc displacement, in closed form: turning left by phi on radius R about
  // a centre R metres to the left of the car.
  const arcStep = (h0, sweep, R) => {
    const c = [Math.sin(h0), Math.cos(h0)], l = leftOf(h0);
    const cx = l[0] * R, cz = l[1] * R;                 // the centre, relative to here
    const ca = Math.cos(sweep), sa = Math.sin(sweep);
    // rotate (-cx, -cz) by -sweep about the centre... written out: turning
    // LEFT by sweep rotates the radius vector clockwise in (x, z) because z
    // is the second axis and our heading measures from +Z toward +X.
    const rx = -cx, rz = -cz;
    return [cx + rx * ca + rz * sa, cz - rx * sa + rz * ca];
  };

  let ax = 0, az = 0;                                   // what the arcs alone contribute
  const dirs = [], idx = [];                            // straight directions and where they are
  S.forEach((s, i) => {
    if (s.arc) {
      const [dx, dz] = arcStep(startH[i], s.arc * DEG, s.radius);
      ax += dx; az += dz;
    } else {
      dirs.push([Math.sin(startH[i]), Math.cos(startH[i])]);
      idx.push(i);
    }
  });
  const L0 = idx.map((i) => S[i].straight);
  let ex = ax, ez = az;
  for (let k = 0; k < L0.length; k++) { ex += dirs[k][0] * L0[k]; ez += dirs[k][1] * L0[k]; }
  // the smallest change to the straights that kills the error: dL = D^T (D D^T)^-1 (-e)
  const a11 = dirs.reduce((s, d) => s + d[0] * d[0], 0);
  const a12 = dirs.reduce((s, d) => s + d[0] * d[1], 0);
  const a22 = dirs.reduce((s, d) => s + d[1] * d[1], 0);
  const det = a11 * a22 - a12 * a12;
  const lengths = L0.slice();
  if (Math.abs(det) > 1e-9) {
    const l1 = (-ex * a22 + ez * a12) / det;
    const l2 = (-ez * a11 + ex * a12) / det;
    for (let k = 0; k < lengths.length; k++) lengths[k] = Math.max(6, L0[k] + dirs[k][0] * l1 + dirs[k][1] * l2);
  }
  // HOW HARD THE SOLVER HAD TO PULL is the single best measure of whether a
  // track description is any good. A shape written from figures that agree
  // with each other needs a metre; one where the straights, the radii and
  // the sweeps are quietly inconsistent needs twenty, and twenty metres on
  // a 150 m straight is a different corner entry to the real one. map.mjs
  // prints it, so it is checkable rather than a matter of faith.
  const fit = {
    error: Math.hypot(ex, ez),
    straights: idx.map((i, k) => ({ seg: i, name: S[i].name, was: L0[k], now: lengths[k] })),
  };
  fit.worst = fit.straights.reduce((m, s) => Math.max(m, Math.abs(s.now - s.was)), 0);

  // ---- 3. walk it, finely -------------------------------------------------
  const raw = [];
  let x = 0, z = 0;
  h = 0;
  let si = 0;
  S.forEach((s, i) => {
    if (s.arc) {
      const sweep = s.arc * DEG, R = s.radius;
      const n = Math.max(8, Math.ceil(Math.abs(sweep) * R / 1.0));
      for (let k = 0; k < n; k++) {
        raw.push({ x, z, h, bank: s.bank * DEG, bankLo: (s.bankLow === undefined ? s.bank : s.bankLow) * DEG, seg: i });
        const d = Math.abs(sweep) * R / n;
        x += Math.sin(h) * d; z += Math.cos(h) * d;
        h += sweep / n;
      }
    } else {
      const L = lengths[si++];
      const n = Math.max(4, Math.ceil(L / 1.0));
      for (let k = 0; k < n; k++) {
        raw.push({ x, z, h, bank: s.bank * DEG, bankLo: (s.bankLow === undefined ? s.bank : s.bankLow) * DEG, seg: i });
        x += Math.sin(h) * (L / n); z += Math.cos(h) * (L / n);
      }
    }
  });

  // ---- 4. SPIRAL TRANSITIONS, for free -----------------------------------
  // A straight that becomes a 310 m arc in one sample is a step change in
  // curvature, and a car cannot drive a step change in curvature: it would
  // need the steering wheel moved instantly. Real tracks are built with a
  // transition spiral into every corner and so is this one - not by working
  // out a clothoid, but by running a short smoothing pass over the plan
  // positions, which IS a transition spiral and lands in the right place
  // because a circle is its own average.
  const N = raw.length;
  for (let pass = 0; pass < 3; pass++) {
    const nx = new Float64Array(N), nz = new Float64Array(N);
    const reach = 14;
    for (let i = 0; i < N; i++) {
      let sx = 0, sz = 0, w = 0;
      for (let d = -reach; d <= reach; d++) {
        const j = (i + d + N) % N, k = 1 - Math.abs(d) / (reach + 1);
        sx += raw[j].x * k; sz += raw[j].z * k; w += k;
      }
      nx[i] = sx / w; nz[i] = sz / w;
    }
    for (let i = 0; i < N; i++) { raw[i].x = nx[i]; raw[i].z = nz[i]; }
  }

  // ---- 5. resample at even spacing and measure it -------------------------
  let plan = 0;
  for (let i = 0; i < N; i++) plan += Math.hypot(raw[(i + 1) % N].x - raw[i].x, raw[(i + 1) % N].z - raw[i].z);
  // and SCALE to the published length. NASCAR publishes 2.5 miles and 0.533
  // miles; whatever the description came out as, the track is that long.
  const scale = spec.length / plan;
  for (const p of raw) { p.x *= scale; p.z *= scale; }

  const n = Math.max(64, Math.round(spec.length / targetSpacing));
  const ds = spec.length / n;
  const points = [];
  {
    // cumulative distance along the fine walk, then pick evenly along it
    const cum = [0];
    for (let i = 0; i < N; i++) cum.push(cum[i] + Math.hypot(raw[(i + 1) % N].x - raw[i].x, raw[(i + 1) % N].z - raw[i].z));
    const total = cum[N];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const want = i * ds * (total / spec.length);
      while (j < N - 1 && cum[j + 1] < want) j++;
      const t = (want - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      const a = raw[j], b = raw[(j + 1) % N];
      points.push({
        x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        bank: a.bank + (b.bank - a.bank) * t,
        bankLo: a.bankLo + (b.bankLo - a.bankLo) * t,
        seg: a.seg, dist: i * ds,
      });
    }
  }

  // ---- 6. heading and curvature from the points themselves ----------------
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
    points[i].h = Math.atan2(b.x - a.x, b.z - a.z);
  }
  for (let i = 0; i < n; i++) {
    const a = points[(i - 3 + n) % n], b = points[i], c = points[(i + 3) % n];
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z);
    const ca = Math.hypot(a.x - c.x, a.z - c.z);
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    // positive curvature is a LEFT turn, and on these tracks that is all of them
    points[i].curve = -2 * cross / Math.max(1e-6, ab * bc * ca);
  }

  // ---- 7. THE BANKING TRANSITIONS ----------------------------------------
  // The description gives each piece one banking angle, which would mean the
  // road tips from three degrees to thirty-one in the space of one sample.
  // Real tracks take sixty or eighty metres over it, and so does this: the
  // angle is averaged over a window, which puts the transition exactly where
  // the corner entry is and makes the car's tyres feel it arrive.
  //
  // AND THE BANKING HAS TO OUTLAST THE CORNER, not merely straddle it.
  // A plain blur puts half the transition inside the turn: thirty metres
  // after the exit the road is nearly flat while the car is still turning,
  // which asks it for two and a half g of real grip that it has not got. A
  // car driven by anything - robot or human - slid straight down the banking
  // onto the infield grass at the end of the backstretch every single lap.
  //
  // So the angle is spread OUTWARD first (each sample takes the steepest
  // banking within 30 m of it) and only then blurred. The steep part now
  // reaches past both ends of the corner and the blur happens on the
  // straight, where there is nothing to hold on with and nothing being
  // asked of the tyres - which is where a real speedway puts it too.
  //
  // BOTH EDGES GO THROUGH IT. A progressively banked corner - Homestead,
  // Las Vegas, Kansas, Iowa, Phoenix, New Hampshire, Kentucky's turns 1-2 -
  // has a different angle at the white line and at the wall, so there are
  // two bank profiles round the lap, not one, and each gets the same
  // grow-then-blur. They are IDENTICAL arrays on a track with no
  // `bankLow` anywhere, which is why Daytona and Bristol come out of this
  // bit for bit the same as they did before there was such a thing.
  {
    const grow = Math.max(2, Math.round(30 / ds));
    const blur = Math.max(2, Math.round(34 / ds));
    const carry = (get) => {
      const raw0 = points.map(get);
      let b = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let d = -grow; d <= grow; d++) m = Math.max(m, raw0[(i + d + n) % n]);
        b[i] = m;
      }
      for (let pass = 0; pass < 2; pass++) {
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          let s = 0, w = 0;
          for (let d = -blur; d <= blur; d++) {
            const k = 1 - Math.abs(d) / (blur + 1);
            s += b[(i + d + n) % n] * k; w += k;
          }
          out[i] = s / w;
        }
        b = out;
      }
      return b;
    };
    const hi = carry((p) => p.bank), lo = carry((p) => p.bankLo);
    for (let i = 0; i < n; i++) {
      points[i].bankHi = hi[i];                 // at the outside edge
      points[i].bankLo = lo[i];                 // at the inside edge
      // `bank` stays what it always was: the banking in the middle of the
      // road, which is what the cameras, the rain and the car's own roll
      // read. On a uniformly banked corner it is both of the above.
      points[i].bank = (hi[i] + lo[i]) / 2;
    }
  }

  return { points, length: spec.length, spacing: ds, fit };
}

// =====================================================================
// THE TRACK OBJECT
// =====================================================================

export function buildOval(key) {
  const spec = typeof key === 'string' ? TRACKS[key] : key;
  if (!spec) throw new Error('no such track: ' + key);
  const C = centreline(spec, 2);
  const { points, length, spacing: ds } = C;
  const n = points.length;
  const HW = spec.width / 2;
  const APRON = spec.apron;
  const tanApron = Math.tan(spec.apronBank * DEG);

  // ---- WHERE THE START/FINISH LINE IS ------------------------------------
  // Rotate the distances so that zero is where the line is painted. Every
  // other number in the game - lap distance, the running order, the pit
  // road, the grid - is measured from it.
  {
    const shift = Math.round(spec.startAt / ds) % n;
    if (shift) {
      const rolled = points.slice(shift).concat(points.slice(0, shift));
      for (let i = 0; i < n; i++) { points[i] = rolled[i]; points[i].dist = i * ds; }
    }
  }

  const sampleAt = (dist) => (Math.round((((dist % length) + length) % length) / ds)) % n;
  const rel = (dist) => (dist > length / 2 ? dist - length : dist);

  // ---- THE CROSS SECTION -------------------------------------------------
  //
  // `lat` is metres LEFT of the centre line, and on a left-hand oval left is
  // the INSIDE. So the road rises as lat falls, and the outside wall is the
  // high one. Reading outward from the infield:
  //
  //     grass  |  apron  |  R A C I N G  S U R F A C E  |shoulder| WALL
  //    lat>    HW+APRON        +HW ........ -HW              -HW-outerRun
  //
  // Height is measured from the infield, which is flat and at zero.
  //
  // PROGRESSIVE BANKING IS INTEGRATED, NOT INTERPOLATED. A corner that is
  // 18 degrees at the white line and 20 at the wall does not have a bank
  // angle - it has a bank angle AT EVERY LATITUDE, rising linearly across
  // the road. The height is therefore the integral of that slope, which is
  // a quadratic and not a straight line:
  //
  //     t(u)   = tLo + (HW - u)/(2 HW) (tHi - tLo)        slope at u
  //     y(lat) = apron + tLo s + (tHi - tLo) s^2 / (4 HW),  s = HW - lat
  //
  // and the surface really is dished - the cross section is a parabola.
  // When tHi === tLo the square term vanishes and this is exactly the
  // straight-line cross section every other track has always had.
  const heightAt = (i, lat) => {
    if (lat >= HW + APRON) return 0;
    if (lat >= HW) return (HW + APRON - lat) * tanApron;
    const tLo = Math.tan(points[i].bankLo), tHi = Math.tan(points[i].bankHi);
    const s = HW - lat;
    // beyond the outside edge (the shoulder against the wall) the road
    // stops getting steeper and keeps going at the edge angle, which is
    // what a real transition to the wall apron does
    if (s <= 2 * HW) return APRON * tanApron + tLo * s + (tHi - tLo) * s * s / (4 * HW);
    return APRON * tanApron + HW * (tLo + tHi) + tHi * (s - 2 * HW);
  };
  /** the slope of the road under a wheel at `lat`, as a banking angle */
  const bankAt = (i, lat) => {
    if (lat >= HW + APRON) return 0;
    if (lat >= HW) return spec.apronBank * DEG;
    const lo = points[i].bankLo, hi = points[i].bankHi;
    if (hi === lo) return lo;
    const f = clamp((HW - lat) / (2 * HW), 0, 1);
    return Math.atan(Math.tan(lo) + f * (Math.tan(hi) - Math.tan(lo)));
  };
  // the centre line's own height, cached: everything else is drawn relative
  for (let i = 0; i < n; i++) points[i].y = heightAt(i, 0);

  // ---- THE PIT ROAD ------------------------------------------------------
  //
  // Down the inside of the frontstretch, on flat ground beyond the apron,
  // with a wall between it and the racing surface. You drive in off the
  // apron after the last corner, you drive out onto it before the first.
  // The whole thing is described in metres from the start/finish line
  // (negative before it) and metres LEFT of the centre line.
  const pitWall = HW + APRON + 3.0;       // the track face of the pit wall
  const PIT = {
    from: spec.pitFrom, to: spec.pitTo,
    // the entry and exit roads eat into each end; the walled lane is what
    // is left in the middle, and that is the part with the stalls on it
    wallFrom: spec.pitFrom + Math.min(150, (spec.pitTo - spec.pitFrom) * 0.20),
    wallTo: spec.pitTo - Math.min(120, (spec.pitTo - spec.pitFrom) * 0.16),
    wall: pitWall,
    fast: pitWall + 4.2,                  // the middle of the lane you drive down
    box: pitWall + 11.0,                  // where a car stops, against its stall
    garage: pitWall + 19.0,               // the far wall of the whole thing
    halfRoad: 3.6,
    limit: spec.pitLimit,
    stalls: spec.stalls,
  };
  PIT.boxFirst = PIT.wallFrom + 28;
  PIT.boxGap = Math.max(9, (PIT.wallTo - PIT.wallFrom - 50) / PIT.stalls);
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  /** the middle of the pit road at d metres from the line, or null if there is none there */
  const pitCentre = (d) => {
    if (d < PIT.from || d > PIT.to) return null;
    if (d < PIT.wallFrom) return HW + 1.0 + (PIT.fast - HW - 1.0) * ease((d - PIT.from) / (PIT.wallFrom - PIT.from));
    if (d <= PIT.wallTo) return PIT.fast;
    return PIT.fast + (HW + 1.0 - PIT.fast) * ease((d - PIT.wallTo) / (PIT.to - PIT.wallTo));
  };
  const wallHere = new Uint8Array(n), roadHere = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = rel(points[i].dist);
    if (d >= PIT.wallFrom && d <= PIT.wallTo) wallHere[i] = 1;
    else if (d >= PIT.from && d <= PIT.to) roadHere[i] = 1;
  }

  // ---- THE BARRIERS ------------------------------------------------------
  // The outside wall runs the whole way round and never moves - that is
  // what an oval is. On the inside there is the pit wall along the
  // frontstretch and the inner retaining wall everywhere else.
  const barR = new Float32Array(n);       // how far RIGHT (outward) a car may go
  const barL = new Float32Array(n);       // how far LEFT (inward)
  for (let i = 0; i < n; i++) {
    barR[i] = HW + spec.outerRun;
    barL[i] = wallHere[i] ? PIT.wall : HW + APRON + spec.innerRun;
  }

  // ---- THE SPATIAL GRID --------------------------------------------------
  const CELL = 36;
  const grid = new Map();
  const cellKey = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  points.forEach((p, i) => {
    const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const around = (x, z, fn) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = grid.get(cellKey(cx + a, cz + b));
      if (list) for (const i of list) fn(i);
    }
  };

  // ---- THE GRID SLOTS ----------------------------------------------------
  // A Cup field lines up in two columns, inside and outside, back from the
  // line. Rows are 10 m apart, which is close enough to feel like a pack.
  const gridSlots = (cars) => {
    const out = [];
    for (let k = 0; k < cars; k++) {
      const row = Math.floor(k / 2), col = k % 2;
      const d = -20 - row * 11;
      const i = sampleAt(d);
      const p = points[i], l = leftOf(p.h);
      const lat = col === 0 ? HW * 0.45 : -HW * 0.45;
      out.push({ x: p.x + l[0] * lat, z: p.z + l[1] * lat, h: p.h, i, lat, dist: ((d % length) + length) % length });
    }
    return out;
  };

  // the corner names, in distance order, for the HUD
  const corners = [];
  {
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (points[i].seg !== last) {
        last = points[i].seg;
        const nm = spec.shape[last] && spec.shape[last].name;
        if (nm && (!corners.length || corners[corners.length - 1].name !== nm)) {
          corners.push({ name: nm, dist: points[i].dist });
        }
      }
    }
  }

  return {
    spec, points, length, spacing: ds, halfWidth: HW, apron: APRON, corners, fit: C.fit,
    barL, barR, gridSlots, heightAt, bankAt, limit: HW,
    innerEdge: HW + APRON,
    pit: {
      ...PIT, rel, centre: pitCentre,
      wallAt: (i) => wallHere[i] === 1,
      roadAt: (i) => roadHere[i] === 1,
      /** the world pose of the stall `k` cars down the lane */
      stallPose(k, lat = PIT.box) {
        const at = PIT.boxFirst + k * PIT.boxGap;
        const p = points[sampleAt(at)], l = leftOf(p.h);
        return { x: p.x + l[0] * lat, z: p.z + l[1] * lat, h: p.h, at, i: sampleAt(at) };
      },
    },

    at(dist) { return points[sampleAt(dist)]; },
    index(dist) { return sampleAt(dist); },

    /** the world position of a point `lat` left of the centre line at `dist` */
    pos(dist, lat) {
      const i = sampleAt(dist), p = points[i], l = leftOf(p.h);
      return { x: p.x + l[0] * lat, y: heightAt(i, lat), z: p.z + l[1] * lat, h: p.h, i };
    },

    /**
     * Where a point is relative to the track. An oval never crosses itself,
     * so this is simply the nearest sample - no bridges, no height test, and
     * the hint is only there to keep it cheap.
     */
    locate(x, z, hint = -1) {
      let best = -1, bestD = Infinity;
      if (hint >= 0) {
        // walk out from last frame's answer: a car moves a few metres a
        // frame, so the answer is nearly always within a dozen samples
        const R = Math.max(6, Math.ceil(40 / ds));
        for (let d = -R; d <= R; d++) {
          const i = (hint + d + n) % n, p = points[i];
          const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (dd < bestD) { bestD = dd; best = i; }
        }
        // and if the answer is nowhere near, the hint was stale (a car has
        // just been placed, or teleported back to the pits). Throw away the
        // DISTANCE as well as the index - leaving a small bestD behind meant
        // the full search below could never beat it and returned nothing.
        if (Math.sqrt(bestD) > 30) { best = -1; bestD = Infinity; }
      }
      if (best < 0) {
        around(x, z, (i) => {
          const p = points[i];
          const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (dd < bestD) { bestD = dd; best = i; }
        });
      }
      if (best < 0) {
        for (let i = 0; i < n; i++) {
          const p = points[i], dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (dd < bestD) { bestD = dd; best = i; }
        }
      }
      const p = points[best], l = leftOf(p.h);
      const off = (x - p.x) * l[0] + (z - p.z) * l[1];
      return { i: best, point: p, off, dist: p.dist, bank: bankAt(best, off),
               y: heightAt(best, off), barL: barL[best], barR: barR[best] };
    },

    /**
     * What a wheel `lat` metres left of sample i is standing on.
     *
     * The apron is paved and almost as quick as the racing surface - which
     * matters, because the bottom groove at Daytona runs right on the white
     * line and cars DO drop a wheel below it. The infield grass is a
     * different matter: it is flat, it is wet, and a car that gets on it at
     * 190 mph is a passenger.
     */
    surface(i, lat) {
      if (lat <= HW && lat >= -HW) return SURF[spec.concrete ? 'concrete' : 'asphalt'];
      if (lat < -HW) return SURF.shoulder;                 // the strip against the wall
      if (lat <= HW + APRON) return SURF.apron;
      const d = rel(points[i].dist);
      if ((roadHere[i] || wallHere[i])) {
        const c = pitCentre(d);
        if (c !== null && Math.abs(lat - c) <= PIT.halfRoad + 0.4) return SURF.asphalt;
        if (wallHere[i] && lat > PIT.wall + 0.4) return SURF.asphalt;
      }
      return SURF.grass;
    },
  };
}

// grip is a multiplier on the tyre's own; drag is speed lost per second
const SURF = {
  asphalt:  { kind: 'asphalt',  grip: 1.00, drag: 0 },
  concrete: { kind: 'concrete', grip: 0.97, drag: 0 },
  apron:    { kind: 'apron',    grip: 0.95, drag: 0.01 },
  shoulder: { kind: 'shoulder', grip: 0.90, drag: 0.03 },
  grass:    { kind: 'grass',    grip: 0.48, drag: 0.45 },
};
