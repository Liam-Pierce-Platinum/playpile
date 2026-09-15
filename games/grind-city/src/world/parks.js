// The three parks. Each one is a different kind of skating: street, transition,
// and a tight indoor room that asks for both.
import { buildPark } from './park.js';

export const PARKS = [
  {
    id: 'plaza',
    name: 'NEW YORK',
    sub: 'a plaza in the shadow of the deco towers. ledges, a six stair, a handrail.',
    blurb: 'street. flat bars, a funbox and a gap, under a golden-hour skyline.',
    theme: 'sunset',
    mat: 'con',
    start: [0, 104],
    spawn: 260,
    build(b) {
      b.flat(34).lip();
      b.transDown(46, 84);                        // roll-in off the top deck
      b.put('planter', b.x + 10, b.y, { w: 26 });
      b.flat(70);

      // long flat bar out on the open flat
      const fbX = b.x + 14, fbY = b.y;
      b.flatbar(fbX, fbY, 96, 15);
      b.put('cone', fbX - 12, fbY);
      b.flat(150);

      b.put('bench', b.x + 8, b.y);
      b.flat(46);

      // a quarter against the wall of the next building, and a hip off it
      b.transUp(40, 66).lip();
      b.flat(26);
      b.transDown(40, 66);
      b.flat(70);
      b.put('trash', b.x - 20, b.y);

      // funbox with a ledge along the top
      const bx = b.x, by = b.y;
      b.block(70, 17, 26);
      b.flatbar(bx + 26, by - 17, 70, 14);
      b.flat(64);

      b.put('lamp', b.x + 6, b.y);
      b.flat(34);

      // six stair + handrail
      const sx = b.x, sy = b.y;
      b.stairs(6, 14, 8);
      b.rail(sx + 4, sy - 17, b.x - 6, b.y - 17, 'rail');
      b.put('trash', b.x + 16, b.y);
      b.flat(120);

      // the gap
      b.pit(50, 24);
      b.put('graffiti', b.x - 40, 0, { seed: 3, deep: 7 });
      b.flat(96);

      // kicker into a hubba
      b.kicker(36, 21);
      b.flat(58);
      const hx = b.x, hy = b.y;
      b.ledge(hx, hy, 130, 20);
      b.put('cone', hx - 14, hy);
      b.flat(160);

      // a deep quarter tucked in behind the hubba
      b.transUp(52, 80).lip();
      b.flat(30);
      b.transDown(52, 80);
      b.flat(90);

      // up to the upper plaza
      b.bank(66, -30);
      b.put('bench', b.x + 20, b.y);
      b.flat(60);
      const fb2 = b.x + 10;
      b.flatbar(fb2, b.y, 84, 14);
      b.flat(150);
      b.put('planter', b.x - 40, b.y, { w: 30 });

      b.transUp(52, 84).lip();
      b.flat(40);
      b.put('lamp', b.x - 12, b.y);
    },
  },

  {
    id: 'bowl',
    name: 'THE LOT',
    sub: 'a fenced city lot with brick behind it. deep end, a spine, pool coping.',
    blurb: 'transition. pump it, air out over the coping and over the fence.',
    theme: 'lot',
    mat: 'con',
    start: [0, 62],
    spawn: 240,
    build(b) {
      b.flat(46).lip();
      b.put('fence', b.x - 40, b.y, { w: 46 });

      // deep end
      b.transDown(74, 84);
      b.flat(96);
      b.transUp(52, 78).lip();
      b.flat(26).lip();

      // spine: straight back down the other side
      b.transDown(52, 78);
      b.flat(120);

      // shallow end up to a deck with a ledge on it
      b.transUp(46, 84).lip();
      const dx = b.x, dy = b.y;
      b.flat(150);
      b.ledge(dx + 24, dy, 104, 12);
      b.put('bench', dx + 6, dy);
      b.lip();

      // second bowl
      b.transDown(46, 84);
      b.flat(70);
      b.put('graffiti', b.x - 50, 0, { seed: 7, deep: 7 });

      // hip: small quarter, deck, then the big wall
      // a spine down the middle of the lot, and a shallow pocket past it
      b.transUp(46, 86).lip();
      b.flat(22).lip();
      b.transDown(46, 86);
      b.flat(86);
      b.transUp(34, 60).lip();
      b.flat(28);
      b.transDown(34, 60);
      b.flat(70);

      b.transUp(38, 80).lip();
      b.flat(58);
      const fb = b.x + 6;
      b.flatbar(fb, b.y, 70, 13);
      b.lip();
      b.transDown(38, 80);
      b.flat(110);

      b.transUp(78, 84).lip();
      b.flat(52);
      b.put('fence', b.x - 44, b.y, { w: 48 });
    },
  },

  {
    id: 'warehouse',
    name: 'THE WAREHOUSE',
    sub: 'plywood, a mini ramp and a long bar. after hours.',
    blurb: 'indoor wood. tight, fast, and lit by one lamp.',
    theme: 'warehouse',
    mat: 'wood',
    start: [0, 74],
    spawn: 230,
    build(b) {
      b.flat(40, 'con').lip();
      b.put('crate', b.x - 30, b.y);

      // mini ramp, left wall
      b.transDown(58, 82, 'wood');
      b.flat(150, 'con');

      // long flat bar down the middle of the floor
      const fbX = b.x - 120;
      b.flatbar(fbX, b.y, 130, 14);
      b.put('barrel', b.x + 6, b.y);
      b.flat(60, 'con');

      // funbox with rail over it
      const bx = b.x, by = b.y;
      b.block(64, 20, 28, 'wood');
      b.rail(bx + 20, by - 34, bx + 20 + 100, by - 34, "rail");
      b.flat(70, 'con');

      b.put('crate', b.x + 10, b.y);
      b.flat(40, 'con');

      // kicker to a pyramid
      b.kicker(34, 22, 'wood');
      b.flat(90, 'con');
      b.bank(48, -26, 'wood').lip();
      b.flat(46, 'con');
      const px = b.x - 40;
      b.ledge(px, b.y, 86, 11);
      b.lip();
      b.bank(48, 26, 'wood');
      b.flat(80, 'con');

      // small quarter into a spine and out
      b.transUp(40, 80, 'wood').lip();
      b.flat(30, 'con').lip();
      b.transDown(40, 80, 'wood');
      b.flat(120, 'con');
      b.put('barrel', b.x - 60, b.y);

      // big right wall
      b.transUp(66, 84, 'wood').lip();
      b.flat(46, 'con');
      b.put('crate', b.x - 26, b.y);
    },
  },
  // --------------------------------------------------------------- san francisco
  // The one you BOMB. It runs downhill almost the whole way, with the street
  // furniture of a real hill in the way -- and the speed cap is high enough now
  // that the bottom of it is genuinely fast.
  {
    id: 'sanfran',
    name: 'SAN FRANCISCO',
    sub: 'a hill you bomb, with the bridge in the fog behind it. steep, long, fast.',
    blurb: 'hill bomb. four blocks downhill, gaps at every corner.',
    theme: 'sanfran',
    mat: 'con',
    start: [0, -180],
    spawn: 200,
    build(b) {
      b.flat(120);
      b.put('lamp', b.x - 30, b.y);

      // block one: a steady pitch with a bank off a driveway
      b.slope(200, 74);
      b.put('trash', b.x - 60, b.y);
      b.flat(52);
      const c1 = b.x;
      b.ledge(c1 + 6, b.y, 96, 17);
      b.put('cone', c1 - 10, b.y);
      b.flat(120);

      // the crossing: a flat landing, then it drops again
      b.slope(180, 66);
      b.kicker(34, 20);
      b.pit(58, 20);                        // the gap across the intersection
      b.flat(90);
      b.put('bench', b.x - 40, b.y);

      // block two: steeper, with a long handrail down a big set
      b.slope(210, 96);
      b.flat(46);
      const sx = b.x, sy = b.y;
      b.stairs(9, 15, 9);
      b.rail(sx + 4, sy - 18, b.x - 6, b.y - 18, 'rail');
      b.put('lamp', b.x + 22, b.y);
      b.flat(130);

      // a hydrant-height ledge on the corner, then the last and fastest block
      b.put('planter', b.x + 10, b.y, { w: 28 });
      b.flat(60);
      b.slope(240, 118);
      b.put('cone', b.x - 120, b.y - 60);
      b.put('cone', b.x - 70, b.y - 34);
      b.flat(60);

      // the bottom: a kicker into a long flat bar, and a bank out
      b.kicker(40, 24);
      const fb = b.x + 20;
      b.flatbar(fb, b.y, 110, 15);
      b.flat(190);
      b.bank(80, -34).lip();
      b.flat(70);
    },
  },

  // ------------------------------------------------------------------- the arena
  // A contest course: everything is big, everything is symmetrical, and there
  // is a spine in the middle because that is what a contest course has.
  {
    id: 'arena',
    // Named for nobody real. It was RED BULL ARENA until the game went on
    // playpile.net, and a live trademark on a page carrying advertising is
    // somebody else's problem to hand you.
    name: 'THE BIG TOP',
    sub: 'a contest course under the lights. big transition, a spine and a hip.',
    blurb: 'contest park. quarters, a spine, a hip and a long rail, indoors.',
    theme: 'arena',
    mat: 'wood',
    start: [0, 96],
    spawn: 230,
    build(b) {
      b.flat(60);
      b.transDown(54, 86);                       // roll-in off the start deck
      b.flat(120);

      // a hip out of a quarter
      b.transUp(46, 70).lip();
      b.flat(30);
      b.transDown(46, 70);
      b.flat(150);

      // the long rail down the middle of the floor
      const fb = b.x + 10;
      b.flatbar(fb, b.y, 150, 16);
      b.put('cone', fb - 16, b.y);
      b.flat(210);

      // the spine: up one side, straight over, down the other
      b.transUp(52, 88).lip();
      b.flat(26);
      b.transDown(52, 88);
      b.flat(170);

      // a big funbox with a ledge either side
      const bx = b.x, by = b.y;
      b.block(96, 22, 32);
      b.ledge(bx + 30, by - 22, 84, 15);
      b.flat(140);

      // the far quarter, the biggest thing in the room
      b.transUp(66, 90).lip();
      b.flat(46);
      b.put('crate', b.x - 24, b.y);
    },
  },

  // ----------------------------------------------------------------- the sewer
  // A storm drain: one long channel with a curved wall either side, so it is
  // effectively a pipe you can carve. Tight, dark, and it never really flattens
  // out -- there is always something to pump against.
  {
    id: 'sewer',
    name: 'THE SEWER',
    sub: 'a storm drain nobody is supposed to be in. one long pipe, no daylight.',
    blurb: 'drainage. a carveable channel, ledges and an outfall to gap.',
    theme: 'sewer',
    mat: 'con',
    start: [0, 60],
    spawn: 220,
    build(b) {
      b.flat(70);
      b.transDown(40, 76);                       // in over the lip of the channel
      b.flat(110);

      // the channel proper: a shallow curve you can pump along
      for (let i = 0; i < 3; i++) {
        b.transUp(58, 40);
        b.transDown(58, 40);
        b.flat(40);
      }

      // a maintenance ledge along the wall
      const lx = b.x + 8;
      b.ledge(lx, b.y, 120, 18);
      b.put('barrel', lx - 16, b.y);
      b.flat(180);

      // the outfall: a gap where a pipe empties into the channel
      b.pit(64, 26);
      b.put('graffiti', b.x - 46, 0, { seed: 5, deep: 8 });
      b.flat(90);

      // a bar across the channel at head height
      const fb = b.x + 12;
      b.flatbar(fb, b.y, 104, 17);
      b.flat(150);

      // the deep end, walled either side, with a spine down the middle
      b.transUp(62, 86).lip();
      b.flat(24);
      b.transDown(62, 86);
      b.flat(120);
      b.put('crate', b.x - 30, b.y);
      b.put('tag', b.x - 90, 0, { seed: 7, deep: 30, w: 56, h: 24 });
      b.flat(60);
      b.transUp(46, 80).lip();
      b.flat(50);
    },
  },

  // ------------------------------------------------------------------ the pool
  // A drained backyard pool. Round, tight, and it is all coping -- there is no
  // flat to rest on, so the only way to keep your speed is to pump.
  {
    id: 'pool',
    name: 'THE POOL',
    sub: 'someone drained it. round walls, tile and coping, no flat anywhere.',
    blurb: 'transition. tight round walls and coping the whole way.',
    theme: 'noon',
    mat: 'con',
    start: [0, 40],
    spawn: 200,
    build(b) {
      b.flat(90).lip();
      b.transDown(46, 88);
      b.flat(40);

      // the shallow end: a gentle round wall
      b.transUp(34, 60);
      b.transDown(34, 60);
      b.flat(60);

      // the love seat -- a step in the wall that gives you two lips
      b.transUp(30, 70).lip();
      b.flat(22);
      b.transDown(24, 50);
      b.flat(70);

      // the deep end, and the death box at the bottom of it
      b.transUp(64, 92).lip();
      b.put('graffiti', b.x - 40, 0, { seed: 21, deep: 18 });
      b.flat(34).lip();
      b.transDown(64, 92);
      b.flat(120);
      b.put('tag', b.x - 90, 0, { seed: 12, deep: 40, w: 60, h: 26 });

      // round the far side and back out
      b.transUp(52, 90).lip();
      b.flat(26);
      b.transDown(52, 90);
      b.flat(90);
      b.transUp(40, 80).lip();
      b.flat(70);
      b.put('planter', b.x - 30, b.y, { w: 30 });
    },
  },

  // -------------------------------------------------------------- the car park
  // A multi-storey at night. Long flat runs, kerbs, a barrier to gap and a
  // ramp between levels -- it is fast and it is all straight lines.
  {
    id: 'garage',
    name: 'THE CAR PARK',
    sub: 'level three, after hours. kerbs, barriers, and the ramp down to two.',
    blurb: 'street. long flat, kerbs and a barrier gap, indoors.',
    theme: 'warehouse',
    mat: 'con',
    start: [0, 70],
    spawn: 220,
    build(b) {
      b.flat(150);
      b.put('cone', b.x - 50, b.y);

      // a run of kerbs down the bay markings
      for (let n = 0; n < 3; n++) {
        const kx = b.x + 20;
        b.ledge(kx, b.y, 70, 11);
        b.flat(130);
      }

      // the barrier: a gap with a low wall either side
      b.put('crate', b.x + 10, b.y);
      b.flat(40);
      b.pit(56, 20);
      b.flat(90);

      // the ramp down to the next level
      b.slope(190, 62);
      b.put('cone', b.x - 90, b.y - 30);
      b.flat(60);
      const fb = b.x + 12;
      b.flatbar(fb, b.y, 130, 16);
      b.flat(180);

      // a bank off a pillar, then a quarter against the far wall
      b.bank(64, -26);
      b.flat(40);
      b.bank(64, 26);
      b.flat(90);
      b.transUp(50, 84).lip();
      b.flat(40);
      b.put('barrel', b.x - 20, b.y);
    },
  },

  // ------------------------------------------------------------- the ditch
  // A concrete flood ditch in the desert. Two long banks facing each other and
  // nothing else at all -- it is the simplest park here and the fastest.
  {
    id: 'ditch',
    name: 'THE DITCH',
    sub: 'a flood channel in the desert. two banks, a mile of them, nothing else.',
    blurb: 'transition. carve the banks, nothing in your way.',
    theme: 'coast',
    mat: 'con',
    start: [0, 20],
    spawn: 210,
    build(b) {
      b.flat(120);
      b.bank(70, 36);

      // a long run of alternating banks -- carve one, cross, carve the other
      for (let n = 0; n < 5; n++) {
        b.flat(90);
        b.bank(76, -30).lip();
        b.flat(30);
        b.bank(76, 30);
      }

      // one thing in the way, halfway down: a pipe across the channel
      const fb = b.x + 14;
      b.flatbar(fb, b.y, 120, 18);
      b.put('barrel', fb - 20, b.y);
      b.flat(200);

      for (let n = 0; n < 4; n++) {
        b.bank(80, -34).lip();
        b.flat(40);
        b.bank(80, 34);
        b.flat(80);
      }

      b.transUp(48, 70).lip();
      b.flat(80);
    },
  },

  // --------------------------------------------------------------- the vert
  // A vert ramp, and only a vert ramp. Two walls, a channel in one of them and
  // a spine down the middle. It is the highest thing in the game.
  {
    id: 'vert',
    name: 'THE VERT RAMP',
    sub: 'thirteen foot of plywood and nothing else. drop in and try to keep up.',
    blurb: 'vert. two walls, a spine and a channel. all air.',
    theme: 'arena',
    mat: 'wood',
    start: [0, 120],
    spawn: 240,
    build(b) {
      b.flat(80);
      b.transDown(76, 90, 'wood');       // drop in off the deck
      b.flat(150, 'wood');

      // the spine down the middle
      b.transUp(70, 90, 'wood').lip();
      b.flat(26, 'wood').lip();
      b.transDown(70, 90, 'wood');
      b.flat(150, 'wood');

      // the far wall, with a channel cut into it
      b.transUp(76, 92, 'wood').lip();
      b.flat(46, 'wood');
      b.put('crate', b.x - 20, b.y);
      b.transDown(76, 92, 'wood');
      b.flat(160, 'wood');

      // and back up the near wall
      b.transUp(76, 90, 'wood').lip();
      b.flat(70);
      b.put('barrel', b.x - 24, b.y);
    },
  },

  // -------------------------------------------------------------- the museum
  // Marble, granite ledges and a long set of steps. Everything is polished and
  // everything is a hubba -- it is the fanciest place you should not be.
  {
    id: 'museum',
    name: 'THE MUSEUM',
    sub: 'marble ledges and granite steps. security will be along shortly.',
    blurb: 'street. long hubbas, a twelve stair, and a lot of polished stone.',
    theme: 'sunset',
    mat: 'con',
    start: [0, 130],
    spawn: 230,
    build(b) {
      b.flat(140);
      b.put('planter', b.x - 40, b.y, { w: 36 });

      // the plaza: three ledges at different heights
      for (let n = 0; n < 3; n++) {
        const lx = b.x + 16;
        b.ledge(lx, b.y, 110, 12 + n * 5);
        b.put('bench', lx + 130, b.y);
        b.flat(190);
      }

      // the big set, with a hubba down one side
      const sx = b.x, sy = b.y;
      b.stairs(12, 15, 9);
      b.rail(sx + 6, sy - 20, b.x - 8, b.y - 20, 'ledge');
      b.put('lamp', b.x + 26, b.y);
      b.flat(150);

      // a fountain to gap, then the long marble run-out
      b.pit(70, 26);
      b.put('graffiti', b.x - 50, 0, { seed: 31, deep: 9 });
      b.flat(120);
      const fb = b.x + 14;
      b.flatbar(fb, b.y, 140, 15);
      b.flat(200);

      // a bank up to the entrance, and a quarter beside the doors
      b.bank(76, -34);
      b.put('planter', b.x + 20, b.y, { w: 32 });
      b.flat(90);
      b.transUp(46, 78).lip();
      b.flat(30);
      b.transDown(46, 78);
      b.flat(80);
      b.put('lamp', b.x - 24, b.y);
    },
  },

  // ----------------------------------------------------------------- the subway
  // TWO LEVELS, ONE POLYLINE.
  //
  // A park is a single continuous ground line, so it cannot have two floors at
  // the same x. What it CAN do is go down a staircase, run a long way, and come
  // back up another one -- which is exactly what a subway entrance is. Read left
  // to right the park is: street, stairs down, a very long platform, stairs up,
  // street. Read as a place, it is one block of Manhattan with the line running
  // underneath it.
  //
  // The staircase at each end is the join. Going DOWN you just ride off the top.
  // Coming back UP you cannot ride at a riser -- that is a wall and it puts you
  // on the floor -- so you either ollie onto the handrail and grind up it, or you
  // stay down there in front of the stairs and skate the trains. That is the
  // whole shape of the level and it is enforced by the geometry, not by a rule.
  {
    id: 'subway',
    name: 'THE SUBWAY',
    sub: 'a block of street, and the line running underneath it. mind the gap.',
    blurb: 'street and platform. a long fence up top, and trains to grind below.',
    theme: 'subway',
    mat: 'con',
    start: [0, 40],
    spawn: 220,
    build(b) {
      // ---------------------------------------------------------------- street
      b.flat(140);
      b.put('lamp', b.x - 50, b.y);
      b.put('npc', b.x - 90, b.y, { seed: 3, dir: 1 });

      // THE FENCE. One very long grindable run along the edge of the little park
      // up top -- 520 units, which is over three screens at this scale, and the
      // longest single grind in the game.
      const fenceX = b.x + 10;
      b.put('fence', fenceX, b.y, { w: 520 });
      b.rail(fenceX, b.y - 17, fenceX + 520, b.y - 17, 'rail');
      b.put('bench', fenceX + 60, b.y);
      b.put('planter', fenceX + 220, b.y, { w: 34 });
      b.put('bench', fenceX + 380, b.y);
      b.flat(560);

      // a kicker and a ledge so the street is not only the fence
      b.kicker(34, 19);
      b.flat(70);
      const lx = b.x + 10;
      b.ledge(lx, b.y, 130, 15);
      b.put('trash', lx - 18, b.y);
      b.flat(190);
      b.put('lamp', b.x - 30, b.y);

      // ------------------------------------------------------- stairs down, left
      // Fourteen steps into the ground. The handrail runs the whole flight, so
      // you can drop in on it and grind the entire way down.
      const d1x = b.x, d1y = b.y;
      b.stairs(14, 13, 9);
      b.rail(d1x + 4, d1y - 17, b.x - 6, b.y - 17, 'rail');
      b.put('graffiti', b.x - 60, 0, { seed: 41, deep: 12 });
      b.flat(90);

      // ------------------------------------------------------------- the platform
      // Everything from here to the far stairs is underground. It runs about
      // 2,600 units, and it is dense with things to grind -- that is the point of
      // being down here.
      b.put('barrel', b.x + 20, b.y);
      b.flat(120);

      // platform bench and the yellow edge strip
      for (let n = 0; n < 3; n++) {
        const px = b.x + 16;
        b.ledge(px, b.y, 90, 12);
        b.put('bench', px + 110, b.y);
        b.flat(200);
      }

      // TRAIN ONE. The carriage sits alongside the platform; the ledge is its
      // roof edge, high enough that you have to pop to reach it.
      const t1 = b.x + 10;
      b.put('train', t1, b.y, { w: 300, seed: 1 });
      b.bar(t1 + 14, b.y, 270, 26);
      b.flat(340);

      // a gap where the platform is being dug out, with a bar over it
      b.pit(58, 22);
      b.put('graffiti', b.x - 46, 0, { seed: 42, deep: 9 });
      b.flat(60);
      const g1 = b.x + 8;
      b.flatbar(g1, b.y, 120, 16);
      b.flat(180);

      // a run of columns with rails strung between them
      for (let n = 0; n < 4; n++) {
        const cx = b.x + 12;
        b.flatbar(cx, b.y, 95, 14 + (n % 2) * 4);
        b.put('crate', cx + 108, b.y);
        b.flat(150);
      }

      // TRAIN TWO, longer, with a bank up onto the platform edge beside it
      const t2 = b.x + 10;
      b.put('train', t2, b.y, { w: 380, seed: 2 });
      b.bar(t2 + 16, b.y, 348, 26);
      b.flat(300);
      b.bank(60, -22).lip();
      b.flat(40);
      b.bank(60, 22);
      b.flat(120);

      // a maintenance ledge along the tunnel wall, and a low bar under it
      const mx = b.x + 10;
      b.ledge(mx, b.y, 200, 20);
      b.flatbar(mx + 30, b.y, 140, 9);
      b.put('barrel', mx - 20, b.y);
      b.flat(280);

      // TRAIN THREE, the long one, with a kicker onto it
      b.kicker(36, 20);
      b.flat(50);
      const t3 = b.x + 8;
      b.put('train', t3, b.y, { w: 440, seed: 3 });
      b.bar(t3 + 16, b.y, 408, 26);
      b.flat(420);

      // the far end of the platform: a quarter against the tunnel mouth
      b.put('graffiti', b.x - 70, 0, { seed: 43, deep: 14 });
      b.transUp(44, 74).lip();
      b.flat(26);
      b.transDown(44, 74);
      b.flat(150);
      b.put('crate', b.x - 40, b.y);

      // one last run of bars before the stairs
      for (let n = 0; n < 3; n++) {
        const rx = b.x + 12;
        b.flatbar(rx, b.y, 110, 15);
        b.flat(170);
      }

      // ------------------------------------------------------ stairs up, right
      // The way out. You cannot ride at these -- a riser is a wall -- so it is
      // the handrail or nothing.
      const u1x = b.x + 40, u1y = b.y;
      b.flat(40);
      b.stairs(14, 13, -9);
      b.rail(u1x + 4, u1y - 17, b.x - 6, b.y - 17, 'rail');
      b.flat(120);

      // ------------------------------------------------------------ street again
      b.put('lamp', b.x - 30, b.y);
      const f2 = b.x + 10;
      b.put('fence', f2, b.y, { w: 300 });
      b.rail(f2, b.y - 17, f2 + 300, b.y - 17, 'rail');
      b.flat(340);
      b.put('bench', b.x - 60, b.y);
      b.bank(70, -28).lip();
      b.flat(90);
      b.put('lamp', b.x - 24, b.y);
    },
  },

];

const built = new Map();
export function getPark(id) {
  if (!built.has(id)) {
    const def = PARKS.find((p) => p.id === id) || PARKS[0];
    built.set(id, buildPark(def));
  }
  const park = built.get(id);
  // Every collectible is back on the map when you arrive. The city is a lap,
  // not a checklist you tick off once and never return to.
  if (park.coins) for (const c of park.coins) c.taken = false;
  return park;
}

// -----------------------------------------------------------------------------
// Two more parks, and then the city run.
PARKS.push(
  {
    id: 'schoolyard',
    name: 'THE SCHOOLYARD',
    sub: 'big stair sets and long handrails. midday.',
    blurb: 'street. two stair sets, a hubba and a long flat bar.',
    theme: 'noon',
    mat: 'con',
    start: [0, 88],
    spawn: 240,
    build(b) {
      b.flat(38).lip();
      b.transDown(44, 84);
      b.put('fence', b.x - 70, b.y - 44, { w: 60 });
      b.flat(90);

      // long flat bar out on the yard
      const fb = b.x + 10;
      b.flatbar(fb, b.y, 120, 15);
      b.put('bench', b.x + 4, b.y);
      b.flat(170);

      // eight stair with a rail down it
      const sx = b.x, sy = b.y;
      b.stairs(8, 13, 8);
      b.rail(sx + 4, sy - 18, b.x - 6, b.y - 18, 'rail');
      b.put('trash', b.x + 14, b.y);
      b.flat(150);

      // hubba down a bank
      const hx = b.x, hy = b.y;
      b.ledge(hx, hy, 150, 22);
      b.bank(58, 24);
      b.put('cone', b.x + 8, b.y);
      b.flat(120);

      // manny pad
      const bx = b.x, by = b.y;
      b.block(90, 13, 22);
      b.ledge(bx + 22, by - 13, 90, 5);
      b.flat(90);

      // a hip in the corner of the yard, and a deep quarter against the wall
      b.transUp(44, 72).lip();
      b.flat(24);
      b.transDown(44, 72);
      b.flat(110);
      b.transUp(58, 86).lip();
      b.flat(30);
      b.transDown(58, 86);
      b.put('crate', b.x + 20, b.y);
      b.flat(120);

      // kicker into a five stair
      b.kicker(34, 20);
      b.flat(70);
      const s2 = b.x, s2y = b.y;
      b.stairs(5, 14, 8);
      b.rail(s2 + 4, s2y - 17, b.x - 6, b.y - 17, 'rail');
      b.flat(140);

      b.put('lamp', b.x - 30, b.y);
      b.bank(60, -34);
      b.flat(120);
      const fb2 = b.x - 90;
      b.flatbar(fb2, b.y, 80, 14);
      b.transUp(52, 84).lip();
      b.flat(40);
      b.put('fence', b.x - 44, b.y, { w: 46 });
    },
  },
  {
    id: 'docks',
    name: 'SEATTLE DOCKS',
    sub: 'plywood over concrete on the waterfront, the needle across the sound.',
    blurb: 'big transition. two deep quarters and a spine, at last light.',
    theme: 'dusk',
    mat: 'con',
    start: [0, 54],
    spawn: 250,
    build(b) {
      b.flat(46).lip();
      b.put('crate', b.x - 28, b.y);

      b.transDown(84, 84, 'wood');
      b.flat(110);
      b.put('barrel', b.x - 40, b.y);

      // a mid spine off a wooden hip
      b.transUp(46, 80, 'wood').lip();
      b.flat(24, 'wood').lip();
      b.transDown(46, 80, 'wood');
      b.flat(130);

      // deck with a bar across it
      b.transUp(52, 84, 'wood').lip();
      const dx = b.x, dy = b.y;
      b.flat(160);
      b.flatbar(dx + 30, dy, 100, 14);
      b.put('crate', dx + 12, dy);
      b.lip();
      b.transDown(52, 84, 'wood');
      b.flat(90);
      b.put('graffiti', b.x - 60, 0, { seed: 11, deep: 7 });

      // a pyramid in the middle of the floor
      // another hip, tighter than the first, and a barrel to duck round
      b.transUp(38, 74, 'wood').lip();
      b.flat(20, 'wood');
      b.transDown(38, 74, 'wood');
      b.flat(100);
      b.put('barrel', b.x - 30, b.y);

      const px = b.x, py = b.y;
      b.block(70, 18, 26, 'wood');
      b.ledge(px + 24, py - 18, 72, 6);
      b.flat(120);

      // and the big wall at the end
      b.transUp(92, 84, 'wood').lip();
      b.flat(56);
      b.put('barrel', b.x - 30, b.y);
      b.put('crate', b.x - 6, b.y);
    },
  }
);

// -----------------------------------------------------------------------------
// California: two concrete parks by the water, and they are not the same park.
// Santa Monica is swept and municipal -- long flowing transition, palms, blue.
// Venice is the famous one on the sand: tighter pools, coping everywhere, and
// painted end to end.
PARKS.push(
  {
    id: 'santamonica',
    name: 'SANTA MONICA',
    sub: 'the municipal park off the beach path. flowing transition and palms.',
    blurb: 'california transition. a snake run into two bowls.',
    theme: 'boardwalk',
    mat: 'con',
    start: [0, 58],
    spawn: 240,
    build(b) {
      b.flat(52).lip();
      b.put('palm', b.x - 34, b.y, { tall: 1, lean: -1 });
      b.put('fence', b.x - 104, b.y, { w: 54 });

      // the snake run: a chain of shallow hips you pump through
      b.transDown(58, 80);
      b.flat(70);
      for (let i = 0; i < 3; i++) {
        b.transUp(34, 66).lip();
        b.flat(22).lip();
        b.transDown(34, 66);
        b.flat(74);
      }

      // first bowl, with a ledge along the deck
      b.transUp(50, 84).lip();
      const dx = b.x, dy = b.y;
      b.flat(140);
      b.ledge(dx + 26, dy, 96, 12);
      b.put('bench', dx + 8, dy);
      b.put('palm', dx + 130, dy, { tall: 1, lean: 0 });
      b.lip();
      b.transDown(50, 84);
      b.flat(96);

      // a flat bar across the middle of the floor
      const fb = b.x - 86;
      b.flatbar(fb, b.y, 92, 15);
      b.flat(60);

      // a spine, then the deep end
      b.transUp(40, 78).lip();
      b.flat(30).lip();
      b.transDown(40, 78);
      b.flat(110);
      b.put('cone', b.x - 50, b.y);

      b.transUp(76, 84).lip();
      b.flat(58);
      b.put('palm', b.x - 20, b.y, { tall: 1, lean: 1 });
      b.put('fence', b.x + 8, b.y, { w: 40 });
    },
  },
  {
    id: 'venice',
    name: 'VENICE BEACH',
    sub: 'the one on the sand. tight pools, coping everywhere, painted all over.',
    blurb: 'graffiti bowls. pool coping and a snake run at golden hour.',
    theme: 'venice',
    mat: 'con',
    start: [0, 50],
    spawn: 250,
    build(b) {
      b.flat(46).lip();
      b.put('tag', b.x - 120, 0, { seed: 1, w: 58, h: 20, deep: 8 });
      b.put('palm', b.x - 20, b.y, { tall: 1, lean: -1 });

      // the deep pool
      b.transDown(78, 86);
      b.flat(84);
      b.put('tag', b.x - 76, 0, { seed: 2, w: 62, h: 22, deep: 9 });
      b.transUp(60, 86).lip();
      b.flat(34).lip();

      // spine into the second pool
      b.transDown(60, 86);
      b.flat(96);
      b.put('tag', b.x - 84, 0, { seed: 3, w: 56, h: 20, deep: 8 });

      // the painted pyramid in the middle
      const px = b.x, py = b.y;
      b.block(64, 20, 26);
      b.ledge(px + 22, py - 20, 70, 6);
      b.flat(70);
      b.put('tag', b.x - 44, 0, { seed: 4, w: 46, h: 18, deep: 7 });

      // snake run out the far side
      for (let i = 0; i < 2; i++) {
        b.transUp(32, 64).lip();
        b.flat(20).lip();
        b.transDown(32, 64);
        b.flat(66);
      }

      // hip with a bar on the deck
      b.transUp(44, 82).lip();
      const hx = b.x, hy = b.y;
      b.flat(120);
      b.flatbar(hx + 20, hy, 84, 14);
      b.put('palm', hx + 106, hy, { tall: 0, lean: 1 });
      b.lip();
      b.transDown(44, 82);
      b.flat(110);
      b.put('trash', b.x - 40, b.y);

      b.transUp(70, 86).lip();
      b.flat(56);
      b.put('tag', b.x - 60, 0, { seed: 5, w: 50, h: 20, deep: 8 });
      b.put('palm', b.x + 22, b.y, { tall: 1, lean: 1 });
    },
  }
);

// -----------------------------------------------------------------------------
// THE CITY RUN -- the endless mode.
//
// Not literally infinite: it is one very long generated street that starts and
// ends on the same long flat at the same height, and the skater WRAPS from one
// to the other. Everything about that wrap is invisible except a single frame
// of parallax, and it buys endlessness without a streaming terrain system --
// the arc-length table and the bucket index can stay immutable, which is what
// every other part of the world code assumes.
//
// It also runs slightly downhill overall, so you keep your speed without having
// to push. That is what "flying through the city" needs.
// ---------------------------------------------------------------- free roam
// THE CITY. Not a course -- a place. It is one very long generated stretch of
// Manhattan with no clock, no rivals and no run to finish, and the only reason
// to be here is that there is a whole city of things to skate and a few hundred
// dollars a lap scattered through it if you can hold a line long enough to
// reach them.
//
// It is built the same way the endless run is, from a seeded generator, but it
// has ENDS -- you can reach the top of the map and the bottom of it, and the
// collectibles do not come back until you leave and return. That is the grind.
export const FREEROAM = {
  id: 'nyc',
  name: 'NEW YORK CITY',
  sub: 'the whole thing. no clock, no rivals, and a lot of ground.',
  blurb: 'free roam. blocks, stoops, traffic and every collectible in the city.',
  theme: 'block',
  mat: 'con',
  freeroam: true,
  start: [0, 60],
  spawn: 260,
  build(b) {
    // A seeded generator, so the city is the same city every time you load it
    // -- you can learn where things are, which is most of what makes a place
    // worth roaming rather than just large.
    let seed = 90210;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

    b.flat(200);
    b.put('lamp', b.x - 60, b.y);

    // Twenty-six blocks. Each one is a stretch of street with something on it
    // and a crossing at the end, and the generator leans on a small set of
    // block TYPES rather than random furniture, so a block reads as a place.
    const BLOCKS = 40;
    for (let n = 0; n < BLOCKS; n++) {
      const kind = pick(['stoop', 'plaza', 'rail', 'hydrant', 'bank', 'gap', 'park', 'lot']);

      // Traffic and the far pavement are part of the BACKDROP now -- they live
      // on the road behind you, at the size a car and a person actually are.
      // What stays here is the odd person on YOUR side of the street.
      if (rnd() > 0.55) {
        b.put('npc', b.x + 20 + rnd() * 250, b.y, {
          seed: Math.floor(rnd() * 999),
          dir: rnd() > 0.5 ? 1 : -1,
        });
      }

      if (kind === 'stoop') {
        b.flat(60);
        const sx = b.x, sy = b.y;
        b.stairs(5, 13, 8);
        b.rail(sx + 4, sy - 16, b.x - 6, b.y - 16, 'rail');
        b.put('trash', b.x + 14, b.y);
        b.flat(120);
        b.put('coin', sx + 40, sy - 19, { seed: n });
      } else if (kind === 'plaza') {
        b.flat(50);
        const bx = b.x, by = b.y;
        b.block(80, 16, 26);
        b.ledge(bx + 26, by - 16, 80, 14);
        b.put('bench', b.x + 20, b.y);
        b.flat(110);
        b.put('coin', bx + 60, by - 20, { seed: n });
      } else if (kind === 'rail') {
        b.flat(70);
        const fb = b.x + 10;
        b.flatbar(fb, b.y, 110, 15);
        b.put('cone', fb - 14, b.y);
        b.flat(150);
        b.put('coin', fb + 55, b.y - 18, { seed: n });
      } else if (kind === 'hydrant') {
        b.put('planter', b.x + 20, b.y, { w: 26 });
        b.flat(90);
        b.kicker(30, 17);
        b.flat(60);
        b.put('coin', b.x - 40, b.y - 22, { seed: n });
        b.flat(80);
      } else if (kind === 'bank') {
        b.bank(70, -26);
        b.put('coin', b.x - 20, b.y - 17, { seed: n });
        b.flat(80);
        b.bank(70, 26);
        b.flat(60);
      } else if (kind === 'gap') {
        b.flat(60);
        b.pit(52, 22);
        b.put('graffiti', b.x - 40, 0, { seed: n, deep: 8 });
        b.flat(120);
        b.put('coin', b.x - 90, b.y - 23, { seed: n + 100 });
      } else if (kind === 'park') {
        b.flat(70);
        b.put('planter', b.x, b.y, { w: 40 });
        const lx = b.x + 50;
        b.ledge(lx, b.y, 90, 13);
        b.flat(170);
        b.put('bench', b.x - 60, b.y);
        b.put('coin', lx + 45, b.y - 17, { seed: n });
      } else {
        // a lot: a quarter pipe against the party wall of the next building
        b.flat(80);
        b.transUp(40, 62).lip();
        b.put('coin', b.x + 6, b.y - 13, { seed: n });
        b.transDown(40, 62);
        b.flat(90);
        b.put('crate', b.x - 30, b.y);
      }

      // the crossing: every block ends stepping down to the next one
      const drop = 4 + Math.floor(rnd() * 10);
      b.slope(70, drop);
      b.put('lamp', b.x - 24, b.y);
    }

    b.flat(240);
    b.put('lamp', b.x - 70, b.y);
  },
};

export const ENDLESS = {
  id: 'city',
  name: 'CHICAGO',
  sub: 'no end, no rules. keep your speed and keep the line alive.',
  blurb: 'endless. downhill through the loop, as far as you can get.',
  theme: 'chicago',
  mat: 'con',
  endless: true,
  start: [0, 40],
  // Must sit INSIDE the opening flat and clear of the wrap seams, or the very
  // first frame wraps you to the far end and back again forever. buildPark
  // resolves this to the segment whose MIDPOINT is nearest, and the opening
  // flat is one long segment, so this lands dead centre of it.
  spawn: 210,
  build(b) {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = (n) => Math.floor(rnd() * n);

    b.flat(420);                       // the landing strip, and the wrap seam
    let drop = 0;                      // how far below the start we have sunk

    for (let i = 0; i < 130; i++) {
      const kind = pick(9);
      if (kind === 0) {
        const fb = b.x + 20;
        b.flatbar(fb, b.y, 90 + pick(60), 14);
        b.flat(150);
      } else if (kind === 1) {
        const sx = b.x, sy = b.y;
        const n = 4 + pick(5);
        b.stairs(n, 13, 8);
        b.rail(sx + 4, sy - 17, b.x - 6, b.y - 17, 'rail');
        drop += n * 8;
        b.flat(110);
      } else if (kind === 2) {
        b.pit(40 + pick(30), 22);
        b.flat(110);
      } else if (kind === 3) {
        const bx = b.x, by = b.y;
        b.block(60 + pick(40), 16, 24);
        b.flatbar(bx + 26, by - 16, 70, 14);
        b.flat(100);
      } else if (kind === 4) {
        b.kicker(34, 18 + pick(8));
        b.flat(130);
      } else if (kind === 5) {
        const hx = b.x, hy = b.y;
        b.ledge(hx, hy, 120, 20);
        b.flat(190);
      } else if (kind === 6) {
        // gentle enough to push up from a standstill if you stall on it
        b.bank(78, -22);
        b.flat(80);
        b.bank(78, 22);
        b.flat(90);
      } else if (kind === 7) {
        b.transUp(40, 78).lip();
        b.flat(26).lip();
        b.transDown(40, 78);
        b.flat(120);
      } else {
        b.flat(160);
        if (rnd() > 0.5) b.put('lamp', b.x - 70, b.y);
        else b.put('bench', b.x - 60, b.y);
      }
      // Trend gently downhill so speed is free, and climb back every so often
      // in ONE long shallow bank. Everything here is kept under the angle you
      // can push up from a standstill -- an endless run that can strand you on
      // a wall you cannot climb is just a wall.
      b.slope(110, 9); drop += 9;
      if (i % 6 === 5 && drop > 40) {
        const rise = Math.min(54, drop * 0.8);
        b.bank(Math.max(280, rise * 6), -rise);
        drop -= rise;
      }
      if (rnd() > 0.72) b.put(['cone', 'trash', 'barrel', 'planter'][pick(4)], b.x - 30, b.y);
    }

    // Climb back to the starting height and finish on the same long flat, so
    // the wrap is seamless. Spread over at least six times the rise so it is
    // never steeper than about ten degrees.
    if (Math.abs(drop) > 0.5) b.bank(Math.max(300, Math.abs(drop) * 6), -drop);
    b.flat(420);
  },
};
// Free roam goes FIRST in the list -- it is the front door of the game now,
// not a curiosity at the end of it.
PARKS.unshift(FREEROAM);
PARKS.push(ENDLESS);
