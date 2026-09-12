// =====================================================================
// HIGHRISE :: level.js - ONE FLOOR OF THE TOWER
// =====================================================================
//
// Liam: *"make sure each floor feels like a new york office/ apartment
// building but make sure to include lots of walls and hallways to make
// very cool hide and shoot scenarios"* and *"multiple ways to get to the
// next floor"*.
//
// Both of those are the same requirement: the floor plan IS the combat
// design. A big open room is a shooting gallery whoever sees first wins;
// a maze is frustrating. What makes a firefight is SIGHTLINES OF
// DIFFERENT LENGTHS meeting at corners you can break - a long corridor
// you dare not cross, an office you can flank through, a doorway two
// people want at once.
//
// So the plan is not random. It is the plan a real Manhattan floor plate
// has, because that plan is why those buildings feel the way they do:
//
//   * a SERVICE CORE in the middle - stairs, lift, risers, toilets. It is
//     solid, so nothing can be shot across the middle of the floor, and
//     it creates...
//   * a RING CORRIDOR around it, which is the floor's main artery and its
//     most dangerous ground: long sightlines both ways, doors off it.
//   * OFFICES AND SUITES on the window wall, split by BSP so their sizes
//     vary, each with a door onto the ring and often onto its neighbour -
//     which is what makes flanking possible.
//   * a GLASS PERIMETER, which is the parkour route: shoot it out, step
//     onto the ledge, and go round the outside of the building.
//
// Four ways up, deliberately different in character: the stairwell (fast,
// obvious, defended), the lift shaft (a ladder, slow and exposed), a
// collapsed slab you climb furniture to reach, and the exterior ledge.
import { rng } from './rng.js';
// Only for the top of the tower: the penthouse is "the last storey",
// which is a different floor number in build mode and in play.
import { FLOOR_COUNT } from './mode.js';

export const CELL = 1.0;          // metres
export const WALL_H = 3.0;        // floor to ceiling
export const W = 46, D = 34;      // cells

export const EMPTY = 0, WALL = 1, GLASS = 2, CORE = 3;

// ---------------------------------------------------------------------
// THE PLAN
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// WHAT KIND OF FLOOR THIS IS
// ---------------------------------------------------------------------
//
// Liam: *"work on interiors with not the same grid"*. He is right - every
// floor was the same plate with the rooms shuffled, and after three of
// them the building stops being a building and becomes a level select.
//
// A real tower is not one thing stacked a hundred times. It has trading
// floors, cellular office suites, residential conversions, a half-gutted
// floor the contractors abandoned, and a double-height lobby. Each of
// those has a different SHAPE, and shape is what the fight is made of:
// a construction floor is long sightlines and thin cover, apartments are
// doorway after doorway, a trading floor is one big room you cross at
// your peril. Same generator, different constants.
export const ARCHETYPES = {
  office:  { core: [12, 10], ring: 2, maxRoom: 9,  depth: 5, piers: 4,
             note: 'office suites' },
  cellular:{ core: [10, 8],  ring: 2, maxRoom: 6,  depth: 6, piers: 3,
             note: 'cellular offices' },
  trading: { core: [8, 8],   ring: 3, maxRoom: 17, depth: 3, piers: 6,
             note: 'trading floor' },
  apart:   { core: [12, 10], ring: 2, maxRoom: 7,  depth: 6, piers: 3,
             note: 'residential conversion' },
  gutted:  { core: [14, 12], ring: 4, maxRoom: 13, depth: 3, piers: 8,
             note: 'stripped to the slab' },

  // ---- and four that only exist above floor 8 ----------------------
  //
  // Liam: *"add in twenty more levels"*. Twenty storeys of the five
  // above is twenty storeys of the same five, and the pool up here was
  // four of them, so the top two thirds of the tower would have been the
  // most repetitive part of it. A tall building is not a tall stack of
  // its lower floors - the higher you go the stranger and the more
  // expensive the space gets, and each of these is a different fight:
  //
  //   mech  - the plant floor. Almost no rooms, enormous machine halls,
  //           a wide ring. Long sightlines and heavy cover you can put a
  //           chiller between you and, and nowhere to hide close in.
  //   sky   - the sky lobby. The most open plate in the building: a
  //           two-room floor you have to cross in the open, which is the
  //           trading floor pushed as far as it goes.
  //   exec  - the executive floor. Few, deep, expensive rooms off a tight
  //           ring: the opposite of mech, all corners and no distance.
  //   pent  - the penthouse. Four vast rooms and the top of the climb.
  mech:    { core: [12, 10], ring: 3, maxRoom: 15, depth: 3, piers: 7,
             note: 'mechanical plant' },
  sky:     { core: [10, 8],  ring: 4, maxRoom: 19, depth: 2, piers: 5,
             note: 'sky lobby' },
  exec:    { core: [12, 10], ring: 2, maxRoom: 11, depth: 7, piers: 4,
             note: 'executive suites' },
  pent:    { core: [10, 8],  ring: 2, maxRoom: 20, depth: 8, piers: 3,
             note: 'the penthouse' },
};
const ARCH_ORDER = ['office', 'cellular', 'trading', 'apart', 'gutted',
                    'mech', 'sky', 'exec', 'pent'];

export function plan(floor) {
  const r = rng(floor * 7919 + 13);
  // the mix changes as you climb: offices low down, residential higher,
  // and the gutted floors near the top where the work stopped
  // ALL FIVE KINDS ARE AVAILABLE LOW DOWN. This used to be three, with
  // office doubled, so the first seven storeys - the ones anybody
  // actually plays through - were half of them the same archetype.
  // MECH, SKY AND PENT ARE NOT IN ANY POOL. They are the three landmark
  // storeys below, and a landmark you can also meet at random is not a
  // landmark - the first run of this drew plant floors on 9, 11 AND 12,
  // so the one that is supposed to be *the* plant floor was the third
  // one in a row.
  const pool = floor < 8  ? ['office', 'cellular', 'trading', 'apart', 'gutted']
             : floor < 16 ? ['office', 'cellular', 'trading', 'apart', 'exec']
             : floor < 25 ? ['exec', 'apart', 'cellular', 'trading', 'office', 'gutted']
             : floor < 70 ? ['exec', 'apart', 'gutted', 'cellular', 'trading']
                          : ['gutted', 'apart', 'gutted', 'trading'];
  let kind = r.pick(pool);

  // ---- THREE STOREYS THAT ARE ALWAYS THE SAME STOREY ---------------
  //
  // A random draw per floor gives you variety and takes away the one
  // thing a climb needs, which is knowing where you are. Nobody can tell
  // floor 19 from floor 22 if both are "whatever came out of the hat".
  //
  // Real towers solve this the same way: the plant floors sit at fixed
  // heights, and the sky lobby is where the lift banks change over. So
  // three floors are pinned, and the rest of the tower is drawn round
  // them. Climb it twice and 12 is the plant floor both times.
  //
  // Guarded on FLOOR_COUNT because build mode is six storeys of shell
  // that Liam edits by hand, and edits.json is keyed to those plans.
  if (FLOOR_COUNT >= 12) {
    if (floor === 12 || floor === 24) kind = 'mech';
    else if (floor === 16) kind = 'sky';
    else if (floor === FLOOR_COUNT) kind = 'pent';   // the top of the climb
  }
  const A = ARCHETYPES[kind];
  // ONE PER-FLOOR FEATURE, chosen here so the whole plan can respond to
  // it. See the FEATURES block after the BSP for what each one does.
  const feature = r.pick(['bullpen', 'server', 'meeting', 'atrium', 'none', 'none']);
  const g = new Uint8Array(W * D);
  const at = (x, z) => g[z * W + x];
  const set = (x, z, v) => { if (x >= 0 && z >= 0 && x < W && z < D) g[z * W + x] = v; };
  const rect = (x0, z0, x1, z1, v) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, v);
  };
  const frame = (x0, z0, x1, z1, v) => {
    for (let x = x0; x <= x1; x++) { set(x, z0, v); set(x, z1, v); }
    for (let z = z0; z <= z1; z++) { set(x0, z, v); set(x1, z, v); }
  };

  // ---- the shell, glazed on all four sides -------------------------
  frame(0, 0, W - 1, D - 1, GLASS);
  // solid piers between the glass, so the perimeter is not one window.
  // The SPACING moves per floor as well as per archetype - the facade is
  // the first thing you see from inside any room on the perimeter, and
  // an identical pier rhythm on every storey is an identical room.
  const piers = Math.max(3, A.piers + r.int(-1, 1));
  for (let x = 0; x < W; x += piers) { set(x, 0, WALL); set(x, D - 1, WALL); }
  for (let z = 0; z < D; z += piers) { set(0, z, WALL); set(W - 1, z, WALL); }

  // A BLANK PARTY WALL, on some floors, on one side.
  //
  // Real towers are not glazed on all four elevations - one face abuts
  // the next building, or holds the plant, or the tenant blocked it in.
  // Filling one run with solid wall changes what a whole band of rooms
  // looks like and where the light comes from, and it costs four lines.
  if (r.chance(0.45)) {
    const side = r.int(0, 3);
    const len = r.int(10, 20), from = r.int(2, (side < 2 ? W : D) - len - 2);
    for (let i = 0; i < len; i++) {
      if (side === 0) set(from + i, 0, WALL);
      else if (side === 1) set(from + i, D - 1, WALL);
      else if (side === 2) set(0, from + i, WALL);
      else set(W - 1, from + i, WALL);
    }
  }

  // ---- the service core --------------------------------------------
  const cw = A.core[0], cd = A.core[1];
  // OFF CENTRE, and differently on every floor. A core dead in the middle
  // makes four identical bands; sliding it a few metres makes one side of
  // the floor deep and the other tight, which is the single cheapest way
  // to stop two floors feeling like the same floor.
  // ---- THE STAIRWELL IS IN THE SAME PLACE ON EVERY FLOOR -----------
  //
  // Liam: *"right now the player just appears up the stairs I want them
  // to have to actually go up"*.
  //
  // A continuous climb needs a continuous shaft, and the core used to
  // slide a few metres in each direction per floor - so the stairwell you
  // climbed out of was never above the one you climbed into, and the only
  // thing the game could do at the top was teleport you.
  //
  // So the STAIR is now the fixed thing and the core is built around it.
  // That is also how a real tower works: the shaft is structure and it
  // runs the whole height of the building. The variety it used to provide
  // is more than covered by the five archetypes, which change the core's
  // SIZE, the corridor width, the room sizes, the wall and floor
  // materials and the props - two floors have not read the same since
  // those went in.
  // ---- THE SHAFT IS FIXED. THE CORE AROUND IT IS NOT ----------------
  //
  // Liam: *"don't make every floor the same make each floor unique in
  // layout"*.
  //
  // He is right and this line was the reason. The core used to be pinned
  // to the stair - `cx0 = STAIR_X - 2` - so the service box sat in the
  // same cell on all eleven storeys and only its SIZE changed. Everything
  // downstream is measured off that box: the ring corridor wraps it, the
  // four bands of offices are what is left over, the spawn is the room
  // furthest from it. Pin the box and you have pinned the floor plan, and
  // no amount of variety in the rooms hides it, because the shape you
  // actually read walking around is the shape of the corridor.
  //
  // But the shaft cannot move: a continuous climb needs a continuous
  // shaft, which is what the last round of work was for. So the two are
  // separated. The STAIR is an absolute rectangle, the same on every
  // floor forever. The CORE is any box that contains it - and it can sit
  // hard against the stair on one side and run six metres past it on the
  // other, which slides the whole corridor and rebalances all four bands.
  const STAIR_X = 17, STAIR_Z = 12;
  const stair = { x: STAIR_X, z: STAIR_Z, w: 4, d: 6 };
  const RING = A.ring + (r.chance(0.3) ? 1 : 0);   // corridor width, in cells

  // WIDE ENOUGH FOR BOTH SHAFTS. The lift needs four cells beside the
  // stair plus its walls, and a core too narrow for it leaves the ladder
  // route with nowhere to be.
  const cw2 = Math.max(11, cw + r.int(0, 3));
  const cd2 = Math.max(11, cd + r.int(0, 3));
  // The legal window for the top-left corner: the core must swallow the
  // stair whole and still leave the ring corridor room inside the shell.
  //
  // TWO CELLS OF CLEARANCE, not one. The first version of this allowed
  // the core wall to sit hard against the stair rectangle, and on the
  // floors where it did the foot of the flight was inside that wall - so
  // you arrived on the storey and could not start the next climb. The
  // flight needs somewhere to BEGIN, and the landing at the top needs
  // somewhere to end, and both of those are outside the treads.
  const M = 2;
  const pick = (lo, hi) => (lo <= hi ? r.int(lo, hi) : Math.max(1, Math.min(hi, lo)));
  const cx0 = pick(Math.max(1 + RING, stair.x + stair.w + M - cw2),
                   Math.min(W - 2 - RING - cw2, stair.x - M));
  const cz0 = pick(Math.max(1 + RING, stair.z + stair.d + M - cd2),
                   Math.min(D - 2 - RING - cd2, stair.z - M));
  const cx1 = cx0 + cw2, cz1 = cz0 + cd2;
  frame(cx0, cz0, cx1, cz1, CORE);

  // THE LIFT GOES WHEREVER THERE IS ROOM, which is now a question rather
  // than a constant: with the core sliding, the space beside the stair
  // can be on either side of it.
  const roomL = (stair.x - 1) - (cx0 + 1);
  const roomR = (cx1 - 1) - (stair.x + stair.w + 1);
  const lift = roomR >= roomL
    ? { x: Math.min(cx1 - 5, stair.x + stair.w + 1), z: cz0 + 2, w: 4, d: 6 }
    : { x: Math.max(cx0 + 1, stair.x - 5),           z: cz0 + 2, w: 4, d: 6 };
  // their doors onto the ring
  const doors = [];
  // The core's own doors are already two cells (w or h is 1), but they
  // still have to record their SPAN, or level.js cannot frame them and the
  // stairwell entrance stays a hole in a brick wall.
  const cut = (x, z, w, h) => {
    rect(x, z, x + w, z + h, EMPTY);
    doors.push({ x, z, x2: x + w, z2: z + h, along: w ? 'x' : 'z' });
  };

  // ---- offices, by BSP, in the band between core and glass ---------
  const rooms = [];
  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0, h = z1 - z0;
    // A BAND THIS BIG MUST ALWAYS SPLIT.
    //
    // The stop condition used to include a flat 12% chance of giving up,
    // and on the first floor generated it fired on the very first call
    // for the east band - turning twelve by thirty-one cells into ONE
    // room. Half the floor was a warehouse: no walls, no hallways, no
    // corners to break, which is the opposite of everything this plan is
    // for. A random stop is only ever allowed once the piece is already
    // small enough to be a plausible office.
    const MAXR = A.maxRoom;
    const tooBig = w > MAXR || h > MAXR;
    if (!tooBig && (depth <= 0 || (w < 5 && h < 5) || r.chance(0.18))) {
      if (w >= 3 && h >= 3) rooms.push({ x0, z0, x1, z1 });
      return;
    }
    if (w < 5 && h < 5) { if (w >= 3 && h >= 3) rooms.push({ x0, z0, x1, z1 }); return; }
    const vertical = w > h ? true : (h > w ? false : r.chance(0.5));
    if (vertical) {
      const cx = Math.round(r.range(x0 + 3, x1 - 3));
      for (let z = z0; z <= z1; z++) if (at(cx, z) === EMPTY) set(cx, z, WALL);
      split(x0, z0, cx - 1, z1, depth - 1);
      split(cx + 1, z0, x1, z1, depth - 1);
    } else {
      const cz = Math.round(r.range(z0 + 3, z1 - 3));
      for (let x = x0; x <= x1; x++) if (at(x, cz) === EMPTY) set(x, cz, WALL);
      split(x0, z0, x1, cz - 1, depth - 1);
      split(x0, cz + 1, x1, z1, depth - 1);
    }
  };
  // the four bands round the core, each partitioned on its own
  split(1, 1, cx0 - RING - 1, D - 2, A.depth);                     // west band
  split(cx1 + RING + 1, 1, W - 2, D - 2, A.depth);                 // east band
  split(cx0 - RING, 1, cx1 + RING, cz0 - RING - 1, A.depth - 1);       // north band
  split(cx0 - RING, cz1 + RING + 1, cx1 + RING, D - 2, A.depth - 1);   // south band

  // ---- carve the ring corridor, which nothing may block ------------
  rect(cx0 - RING, cz0 - RING, cx1 + RING, cz0 - 1, EMPTY);
  rect(cx0 - RING, cz1 + 1, cx1 + RING, cz1 + RING, EMPTY);
  rect(cx0 - RING, cz0 - RING, cx0 - 1, cz1 + RING, EMPTY);
  rect(cx1 + 1, cz0 - RING, cx1 + RING, cz1 + RING, EMPTY);
  frame(cx0, cz0, cx1, cz1, CORE);        // put the core wall back

  // =====================================================================
  // ONE THING THAT IS ONLY ON THIS FLOOR
  // =====================================================================
  //
  // Liam: *"make each floor unique in layout"*.
  //
  // Moving the core and the doors makes the plans different. It does not
  // by itself make them MEMORABLE, and those are separate things - you
  // remember a floor by the one room on it that was not like the others,
  // not by the fact that the corridor was three metres further east.
  //
  // So every floor draws one feature, and each of them is a handful of
  // rectangle operations on the grid that has already been partitioned.
  // They run BEFORE the connectivity repair on purpose: that pass will
  // guarantee whatever they do is still walkable, so a feature is free to
  // wall things off without having to think about it.
  // FEATURES MAY NOT PUT A HOLE IN THE CORE OR THE SHELL.
  //
  // They work in rectangles and a room's edge is often one cell off the
  // core wall or the glass, so an unguarded rect() clearing a bullpen
  // would open the stairwell to the office next door - or the building
  // to the sky. Everything below goes through these two.
  const fset = (x, z, v) => {
    if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return;
    if (at(x, z) === CORE) return;
    set(x, z, v);
  };
  const frect = (x0, z0, x1, z1, v) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fset(x, z, v);
  };

  const bigRooms = () => rooms
    .filter((rm) => rm.x1 - rm.x0 >= 5 && rm.z1 - rm.z0 >= 4)
    .sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));

  if (feature === 'bullpen') {
    // THE OPEN PLAN. Two or three neighbouring rooms lose the walls
    // between them and become one long floor of desks - a room with no
    // cover in the middle of a building made of cover, which is a
    // completely different fight from anything either side of it.
    const big = bigRooms();
    for (const rm of big.slice(0, 3)) {
      frect(rm.x0, rm.z0, rm.x1, rm.z1, EMPTY);
      // and out through the partition to whatever is next door
      for (let z = rm.z0; z <= rm.z1; z++) { fset(rm.x0 - 1, z, EMPTY); fset(rm.x1 + 1, z, EMPTY); }
    }
  } else if (feature === 'server') {
    // THE SERVER ROOM. Racks on a grid with aisles between them: total
    // cover, no sightlines longer than a few metres, and the only room in
    // the building where a shotgun is the right answer.
    const rm = bigRooms()[0];
    if (rm) {
      frect(rm.x0, rm.z0, rm.x1, rm.z1, EMPTY);
      for (let x = rm.x0 + 1; x <= rm.x1 - 1; x += 2)
        for (let z = rm.z0 + 1; z <= rm.z1 - 2; z++)
          if ((z - rm.z0) % 5 !== 0) fset(x, z, WALL);
    }
  } else if (feature === 'meeting') {
    // GLASS MEETING ROOMS. Glass is solid to a body and transparent to a
    // look - see canSee() in ai.js, which steps over it - so a run of
    // these is a place where you and four men can watch each other and
    // none of you can shoot. Then somebody breaks a pane.
    const rm = bigRooms()[0];
    if (rm) {
      frect(rm.x0, rm.z0, rm.x1, rm.z1, EMPTY);
      const n2 = Math.max(2, Math.floor((rm.x1 - rm.x0) / 4));
      for (let i = 1; i < n2; i++) {
        const x = rm.x0 + Math.round((rm.x1 - rm.x0) * i / n2);
        for (let z = rm.z0; z <= rm.z1; z++) fset(x, z, GLASS);
        fset(x, rm.z0 + 1, EMPTY); fset(x, rm.z0 + 2, EMPTY);   // a way through
      }
      for (let x = rm.x0; x <= rm.x1; x++) fset(x, rm.z0 - 1, GLASS);
    }
  } else if (feature === 'atrium') {
    // THE ATRIUM. A room cleared right out to the glass, two bands deep,
    // so there is one place on the floor where you can see a long way and
    // so can everybody else.
    const rm = bigRooms()[0];
    if (rm) {
      const z0 = Math.max(1, rm.z0 - 3), z1 = Math.min(D - 2, rm.z1 + 3);
      frect(rm.x0 - 1, z0, rm.x1 + 1, z1, EMPTY);
      // four columns left standing in it, because a big empty box is a
      // shooting gallery and four pillars is an argument
      for (const px of [rm.x0 + 1, rm.x1 - 1])
        for (const pz of [z0 + 2, z1 - 2]) fset(px, pz, WALL);
    }
  }

  // ---- and only NOW punch the way into the core --------------------
  //
  // These were cut before the BSP, and the line above - which re-draws
  // the core wall after the ring corridor is carved out of it - sealed
  // every one of them again. The stairwell and the lift were behind a
  // solid box: ninety-nine cells unreachable on every floor generated,
  // and two of the four ways up with no route to them at all. Order is
  // the whole bug; there is nothing wrong with either line on its own.
  // AND NOT ALWAYS IN THE SAME PLACE, OR ALL FOUR.
  //
  // Four doors at four fixed offsets meant the core was approached the
  // same way on every floor. Where you can get into the middle of the
  // plate is most of how a floor plays - a core you can only enter from
  // the south is a floor you have to go round - so the offsets move and
  // one of the four is sometimes bricked up. Never more than one: the
  // stairwell has to stay reachable without depending on the
  // connectivity repair to notice.
  const skip = r.chance(0.55) ? r.int(0, 3) : -1;
  if (skip !== 0) cut(cx0, cz0 + r.int(2, cd2 - 2), 0, 1);            // west face
  if (skip !== 1) cut(cx1, cz0 + r.int(2, cd2 - 2), 0, 1);            // east face
  if (skip !== 2) cut(cx0 + r.int(2, cw2 - 2), cz0, 1, 0);            // north face
  if (skip !== 3) cut(cx0 + r.int(2, cw2 - 2), cz1, 1, 0);            // south face

  // ---- AND ONE DOOR OUT OF THE STAIRWELL ITSELF ---------------------
  //
  // Liam: *"there is no clear entrance onto floor 3 that is accessible"*.
  //
  // He is describing arriving. The four doors above are placed at random
  // offsets and one face is sometimes bricked up, and neither of those
  // knows where the STAIRS are - so on floor 3 the face the stairwell
  // stands against was the one bricked up, and you came up the flight
  // into a brick box with the nearest opening 5.5 m away on the far side
  // of the lift shaft. The floor was connected; it did not look it, and
  // finding the way out meant walking round the shaft in the dark.
  //
  // So the face the stairwell is nearest always gets a door, level with
  // the flight, which puts one straight in front of you as you step off
  // the top tread.
  //
  // ADDED, not moved. Re-positioning one of the four would change the
  // layout of every storey including the one Liam has furnished by hand,
  // and a wall shifting under his props is a worse bug than the one
  // being fixed. An extra opening can only make a floor easier to cross.
  //
  // AND NOT ON THE GROUND FLOOR. Even adding one changes it: floor one
  // already has all four faces open, so it gains nothing - and the cell
  // this would have opened has one of his air-conditioning units 63 cm
  // from it, which would have left it hanging in the new doorway. He
  // asked for floor one to be left alone and that includes its walls.
  if (floor > 1) {
    const gapW = stair.x - cx0, gapE = cx1 - (stair.x + stair.w);
    const gapN = stair.z - cz0, gapS = cz1 - (stair.z + stair.d);
    const near = Math.min(gapW, gapE, gapN, gapS);
    const cz = Math.max(cz0 + 1, Math.min(cz1 - 2, stair.z + ((stair.d / 2) | 0) - 1));
    const cx = Math.max(cx0 + 1, Math.min(cx1 - 2, stair.x + ((stair.w / 2) | 0) - 1));
    if (near === gapW) cut(cx0, cz, 0, 1);
    else if (near === gapE) cut(cx1, cz, 0, 1);
    else if (near === gapN) cut(cx, cz0, 1, 0);
    else cut(cx, cz1, 1, 0);
  }


  // ---- A DOOR IS TWO CELLS WIDE ------------------------------------
  //
  // Liam: *"make sure the player can get through doors"*.
  //
  // The flood fill said every floor was fully connected and it was
  // telling the truth - about CELLS. A person is not a cell. The player
  // is 64 cm across, a wall cell is a metre wide box, and the collision
  // pushes him out to his own radius from each side - so a one-cell
  // doorway leaves
  //
  //     2.0 m of wall spacing  -  2 x (0.5 + 0.32)  =  0.36 m
  //
  // of actual gap. Thirty-six centimetres. You can get through it, but
  // only dead centre and only if you approach square on, so every door
  // in the building grabbed you by the shoulder. A grid that is
  // connected is not the same claim as a floor you can walk around, and
  // this is the difference.
  //
  // Two cells gives 1.36 m, which is a double doorway and is generous
  // enough that you can run through one sideways while being shot at -
  // which, in a game about never stopping, is the actual requirement.
  const door = (x, z) => {
    if (x <= 0 || z <= 0 || x >= W - 1 || z >= D - 1) return;
    if (at(x, z) === CORE) return;
    // WIDEN ALONG THE WALL, not across it: the second cell has to be the
    // one beside this door in the same wall run, or the "door" becomes a
    // two-deep hole punched through into the next room.
    const alongZ = at(x, z - 1) !== EMPTY || at(x, z + 1) !== EMPTY;
    const pair = alongZ ? [[x, z + 1], [x, z - 1]] : [[x + 1, z], [x - 1, z]];
    set(x, z, EMPTY);
    // THE SPAN IS RECORDED, not just the centre. level.js frames these -
    // two jambs and a header - and it cannot do that from one cell,
    // because it would not know which way the wall runs or how wide the
    // hole ended up.
    let x2 = x, z2 = z;
    for (const [nx, nz] of pair) {
      if (nx <= 0 || nz <= 0 || nx >= W - 1 || nz >= D - 1) continue;
      const v = at(nx, nz);
      if (v === EMPTY) { x2 = nx; z2 = nz; break; }   // already open: wide enough
      if (v === CORE || v === GLASS) continue;        // never breach either
      set(nx, nz, EMPTY);
      x2 = nx; z2 = nz;
      break;
    }
    const rec = { x, z, x2, z2, along: alongZ ? 'z' : 'x' };
    doors.push(rec);
    return rec;
  };

  // ---- a door into every room --------------------------------------
  // A room with no door is a room the AI walks into a wall trying to
  // reach. Punch one on the side nearest the ring, and often a second
  // between neighbours, because a second door is what turns a dead end
  // into a flank.
  for (const rm of rooms) {
    const mid = { x: (rm.x0 + rm.x1) >> 1, z: (rm.z0 + rm.z1) >> 1 };
    const toCore = [
      { x: rm.x0 - 1, z: mid.z }, { x: rm.x1 + 1, z: mid.z },
      { x: mid.x, z: rm.z0 - 1 }, { x: mid.x, z: rm.z1 + 1 },
    ].filter((p) => p.x > 0 && p.z > 0 && p.x < W - 1 && p.z < D - 1);
    toCore.sort((a, b) =>
      (Math.abs(a.x - W/2) + Math.abs(a.z - D/2)) - (Math.abs(b.x - W/2) + Math.abs(b.z - D/2)));
    if (toCore[0]) door(toCore[0].x, toCore[0].z);
    if (toCore[1] && r.chance(0.55)) door(toCore[1].x, toCore[1].z);
  }


  // ---- AND THEN MAKE SURE IT IS ACTUALLY ONE FLOOR ------------------
  //
  // Liam: *"the player is also stuck in three rooms at the start"*. He
  // was, and the flood fill said it exactly: 58 of 1086 open cells
  // reachable on floor one, none of the four ways up among them.
  //
  // The door pass above is a HEURISTIC - it punches on the side facing
  // the core - and heuristics cannot promise connectivity, because a BSP
  // room's neighbour is usually another room rather than the corridor.
  // So the doors stay (they put openings where a person would expect
  // them) and this runs after: flood the floor into regions, and while
  // there is more than one, knock through a wall that has two different
  // regions on opposite sides. Every knock merges two regions, so it
  // always terminates, and it cannot fail to connect - which a rule about
  // which side of a room to face never could.
  const label = () => {
    const id = new Int32Array(W * D).fill(-1);
    let n = 0;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const s = z * W + x;
      if (id[s] >= 0 || at(x, z) !== EMPTY) continue;
      const q = [s]; id[s] = n;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], cx = c % W, cz = (c / W) | 0;
        for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + ox, nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          const i = nz * W + nx;
          if (id[i] >= 0 || at(nx, nz) !== EMPTY) continue;
          id[i] = n; q.push(i);
        }
      }
      n++;
    }
    return { id, n };
  };

  for (let pass = 0; pass < 400; pass++) {
    const { id, n } = label();
    if (n <= 1) break;
    // which region is the biggest - that is the one everything joins to
    const size = new Int32Array(n);
    for (let i = 0; i < id.length; i++) if (id[i] >= 0) size[id[i]]++;
    let main = 0;
    for (let i = 1; i < n; i++) if (size[i] > size[main]) main = i;

    // find a WALL with the main region on one side and something else on
    // the other. Never the core and never the shell: the core is meant to
    // be solid and a hole in the shell is a hole in the building.
    let cut = null, cutScore = -1;
    for (let z = 2; z < D - 2 && !cut; z++) for (let x = 2; x < W - 2; x++) {
      if (at(x, z) !== WALL) continue;
      for (const [ox, oz] of [[1, 0], [0, 1]]) {
        const a = id[(z - oz) * W + (x - ox)], b = id[(z + oz) * W + (x + ox)];
        if (a < 0 || b < 0 || a === b) continue;
        if (a !== main && b !== main) continue;
        // prefer knocking into the biggest orphan, so one hole does most
        const other = a === main ? b : a;
        if (size[other] > cutScore) { cutScore = size[other]; cut = { x, z }; }
      }
    }
    if (!cut) {
      // Regions separated by more than one wall. Widen to any wall with
      // two different regions across it at two cells' reach.
      outer:
      for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
        if (at(x, z) !== WALL) continue;
        for (const [ox, oz] of [[1, 0], [0, 1]]) {
          const a = id[(z - oz) * W + (x - ox)];
          const b2 = id[(z + oz * 2) * W + (x + ox * 2)];
          if (a >= 0 && b2 >= 0 && a !== b2) {
            // two cells deep AND two cells wide - see the note on door()
            set(x, z, EMPTY);
            set(x + ox, z + oz, EMPTY);
            door(x + oz, z + ox);       // the neighbour across the run
            cut = { x, z };   // recorded by door(); not pushed again here
            break outer;
          }
        }
      }
      if (!cut) break;                  // nothing left that can be joined
    } else {
      // THROUGH THIS ONE TOO. A knock-through that a person cannot fit
      // through is a knock-through that did not happen, and this pass is
      // the one that guarantees the floor is crossable at all - so it is
      // the last place that should be leaving 36-centimetre gaps.
      door(cut.x, cut.z);
    }
  }

  // ---- the four ways up ---------------------------------------------
  const exits = [
    { kind: 'stair', x: stair.x + stair.w/2, z: stair.z + stair.d/2, note: 'stairwell' },
    { kind: 'ladder', x: lift.x + lift.w/2, z: lift.z + lift.d/2, note: 'lift shaft' },
  ];
  // a collapsed slab somewhere in an office - climb the furniture
  const hole = r.pick(rooms.filter((rm) => rm.x1 - rm.x0 >= 4 && rm.z1 - rm.z0 >= 4)) || rooms[0];
  if (hole) exits.push({ kind: 'hole', x: (hole.x0 + hole.x1)/2, z: (hole.z0 + hole.z1)/2,
                         note: 'collapsed slab' });
  // and the outside: a window that is already broken
  // A WINDOW YOU CAN ACTUALLY REACH.
  //
  // Any perimeter cell can be broken, but one whose inward neighbour is a
  // wall is a hole in the shell with nothing behind it - one open cell,
  // connected to nothing, and the flood fill counted it as cut off on
  // half the floors generated. Only break glass with a room behind it.
  let win = null;
  for (let tries = 0; tries < 200 && !win; tries++) {
    const side = r.int(0, 3);
    const wx = side < 2 ? r.int(3, W - 4) : (side === 2 ? 0 : W - 1);
    const wz = side < 2 ? (side === 0 ? 0 : D - 1) : r.int(3, D - 4);
    const ix = side === 2 ? wx + 1 : (side === 3 ? wx - 1 : wx);
    const iz = side === 0 ? wz + 1 : (side === 1 ? wz - 1 : wz);
    if (at(ix, iz) === EMPTY) win = { x: wx, z: wz };
  }
  if (win) {
    set(win.x, win.z, EMPTY);
    exits.push({ kind: 'ledge', x: win.x, z: win.z, note: 'broken window' });
  }

  // WHERE YOU COME IN: the middle of the ROOM furthest from the stairs.
  //
  // Picking the furthest open CELL put the player in the building's far
  // corner with his nose against two walls, which is a thing you only
  // find by walking the level rather than loading it. A room's centre is
  // always somewhere you can stand and turn around in.
  let spawn = { x: 3, z: 3 }, best = -1;
  for (const rm of rooms) {
    const cx = (rm.x0 + rm.x1) >> 1, cz = (rm.z0 + rm.z1) >> 1;
    if (at(cx, cz) !== EMPTY) continue;
    const dd = Math.abs(cx - stair.x) + Math.abs(cz - stair.z);
    if (dd > best) { best = dd; spawn = { x: cx, z: cz }; }
  }

  return { floor, kind, feature, arch: A, g, at, rooms, doors, exits, spawn,
           core: { cx0, cz0, cx1, cz1 }, stair, lift, hole, r };
}


/** cell -> world centre */
export const toWorld = (x, z) => [(x - W/2 + 0.5) * CELL, (z - D/2 + 0.5) * CELL];
/** world -> cell */
export const toCell = (x, z) => [Math.floor(x / CELL + W/2), Math.floor(z / CELL + D/2)];
