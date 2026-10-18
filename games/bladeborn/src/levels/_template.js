// LEVEL TEMPLATE / PROVING GROUND (?level=template). A small working level that uses every campaign API once:
// geometry, doors, a breakable window, a ladder, trees, the vent kit (mouth, shaft, T-junction, floor grate,
// ceiling grate, wall grate), every enemy type with patrols and posts, triggers, checkpoints, objectives, an
// intro cutscene with an actor, subtitles, the alarm, and the level end. Copy it to src/levels/<id>.js to start.
// Coordinates: metres, y up, feet-based boxes (y = bottom). Story names: the hero is CALDER, the friend ROURKE.

export default {
  id: 'template',
  title: 'PROVING GROUND',
  // rules for this level (G.flags): gunsKill = any bullet that lands kills (the vents chapter uses it)
  flags: { gunsKill: false },
  // look: background/fog grey, light levels. Everything stays grey; blood is the only colour.
  env: { bg: 0x7c7c7c, fog: [18, 70], hemi: 1.0, sun: 2.2 },
  // patrol/wander bounds [minX, minZ, maxX, maxZ]
  bounds: [-24, -24, 24, 24],

  build(L) {
    // ---- ground, perimeter ----
    L.floor(0, 0, 60, 60, { mat: 'concreteLight' });
    L.wall(-25, -25, 25, -25, { h: 6 }); L.wall(-25, 25, 25, 25, { h: 6 });
    L.wall(-25, -25, -25, 25, { h: 6 }); L.wall(25, -25, 25, 25, { h: 6 });

    // ---- the cell you start in (8 x 8, roofed), steel door on its east wall ----
    L.wall(-22, -14, -14, -14, { h: 4, mat: 'tile' });
    L.wall(-14, -22, -14, -18.9, { h: 4, mat: 'tile' }); L.wall(-14, -17.1, -14, -14, { h: 4, mat: 'tile' });
    L.box(-18, 4, -18, 8.3, 0.3, 8.3, { mat: 'concreteDark' });
    L.box(-20.5, 0, -18, 2, 0.8, 1, { mat: 'steel' });                  // the table you woke up on
    L.light(-18, 3.9, -18, { intensity: 6, dist: 9 });
    this.cellDoor = L.door(-14, -18, { axis: 'z', locked: true });
    L.checkpoint('start', -18, 0, -18, Math.PI / 2);

    // ---- office with a window: dash or slash through the glass. A scientist runs for the alarm. ----
    L.wall(4, -20, 12, -20, { h: 3.5, mat: 'paint' }); L.wall(12, -20, 12, -12, { h: 3.5, mat: 'paint' });
    L.wall(4, -20, 4, -17.5, { h: 3.5, mat: 'paint' }); L.wall(4, -14.5, 4, -12, { h: 3.5, mat: 'paint' });
    L.box(4, 0, -16, 0.3, 0.3, 3, { mat: 'paint' }); L.box(4, 2.6, -16, 0.3, 0.9, 3, { mat: 'paint' }); // low sill (you can crash through) + lintel
    L.window(4, -16, { axis: 'z', w: 3, h: 2.3, y: 0.3 });
    L.wall(4, -12, 7.2, -12, { h: 3.5, mat: 'paint' }); L.wall(8.8, -12, 12, -12, { h: 3.5, mat: 'paint' });
    L.box(8, 3.5, -16, 8.3, 0.25, 8.3, { mat: 'paintDark' });
    L.door(8, -12, { axis: 'x', auto: true });
    L.box(9, 0, -17, 2.4, 0.8, 1.1, { mat: 'paintDark', cover: true });   // desk
    L.mesh(new L.THREE.BoxGeometry(0.3, 0.5, 0.3), 'black', 10.6, 1.4, -19.8); // the alarm box on the wall
    L.light(8, 3.4, -16, { intensity: 5, dist: 8 });
    L.enemy('scientist', 8, -16, { yaw: Math.PI / 2, alarm: [10.6, -19.2], tag: 'office' });

    // ---- yard cover and a patrol ----
    for (const [x, z] of [[-4, -4], [3, 2], [-2, 6], [8, -4]]) L.box(x, 0, z, 1.6, 1.4, 1.6, { mat: 'metal', cover: true, tile: 1.2 });
    L.enemy('guard_rifle', -6, -2, { patrol: [[-6, -2], [6, -2, 2.5], [6, 4], [-6, 4, 2.5]], tag: 'yard' });
    L.enemy('thug_pistol', 2, 8, { yaw: 0, wander: false, tag: 'yard' });

    // ---- east block: ladder up its west face, a sniper on the roof ----
    L.box(14, 0, 10, 10, 6, 8, { mat: 'concrete' });
    L.ladder(9, 10, { face: '-x', y1: 6 });
    L.enemy('sniper', 16, 8, { y: 6, yaw: Math.PI, tag: 'roof' });

    // ---- trees: claw up a trunk, A/D round it, wall-jump while looking at the next one ----
    for (const [x, z, h] of [[16, -4, 9], [21, -8, 10], [20, -1.5, 8.5], [15.5, -10, 9.5]]) L.tree(x, z, { h });
    L.enemy('thug_sword', 18.5, -5.5, { patrol: [[18.5, -5.5], [18.5, 2, 3]], tag: 'grove' });

    // ---- vents ----
    // a: mouth in the yard -> north to a vertical shaft -> ladder up -> elevated run west->east -> T-junction ->
    //    run south with a FLOOR grate over a guard (drag him up / drop on him)
    const V = L.vent, y2 = 3;
    V.run(-21, -5, -21, -7.27, 0, { start: 'mouth' });                       // from the yard (z=-5) to the shaft
    V.shaft(-21, -8, 0, y2 + 1.03, { exits: [{ y: 0, side: '+z' }, { y: y2, side: '+x' }], cap: true });
    V.run(-20.27, -8, -12.55, -8, y2, {});
    V.tee(-12, -8, y2, '-x', '+x', '+z');
    V.run(-11.45, -8, -9, -8, y2, { end: 'cap' });
    V.run(-12, -7.45, -12, -1, y2, { down: [3], end: 'grate' });              // floor grate 3 m down the run
    for (const [x, z] of [[-18, -8], [-15, -8], [-12, -6], [-12, -2.5]]) L.box(x, 0, z, 0.2, y2 - 0.08, 0.2, { mat: 'steel' }); // hangers
    L.enemy('guard_baton', -12, -4.45, { patrol: [[-12, -4.45, 4], [-8, -4.45, 2]], tag: 'vent' });
    // b: a duct UNDER a raised pump room: crawl in from the west mouth, pull the guard down through the ceiling
    //    grate, kick the east grate out
    const pf = 0.1 + 0.95 + 0.08; // the duct's ceiling top = the pump room floor
    V.run(-16, 12, -4, 12, 0.1, { start: 'mouth', end: 'grate', up: [6] });
    L.box(-10, 0, 9.685, 8, pf, 3.37, { mat: 'concreteDark' }); L.box(-10, 0, 14.315, 8, pf, 3.37, { mat: 'concreteDark' });
    L.enemy('guard_baton', -10, 12.6, { y: pf, yaw: 0, wander: false, tag: 'pump' });

    // ---- triggers ----
    L.checkpoint('yard', -11, 0, -18, Math.PI / 2, { at: [-11.5, -18], r: 1.6 });
    L.trigger({ at: [-11.5, -18], r: 1.6 }, () => { L.done('out'); L.objective('roof', 'Reach the roof of the east block'); L.objective('opt', 'Optional: take a guard through a vent grate'); });
    L.trigger({ box: [14, 5.9, 10, 10, 3, 8] }, () => this.finale(L));
    L.on('grate', g => { if (g.orient !== 'wall') L.done('opt'); });
  },

  // runs after build (async is fine). ctx.checkpoint = 'start' or the checkpoint you respawned at.
  async start(L, ctx) {
    L.on('alarm', () => L.say('PA', 'Containment breach, Block C. All units.', 3));
    if (ctx.checkpoint !== 'start') { this.cellDoor.unlock(); this.cellDoor.open(); L.objective('roof', 'Reach the roof of the east block'); return; }
    // intro: the hero is an actor; a guard walks past the window slit; Rourke on the intercom
    const me = L.actor({ hero: true, pose: 'slump' });
    const guard = L.actor({ pos: [-9, 0, -20], yaw: 0, weapon: 'rifle', shade: 0.4 });
    await L.cutscene({
      shots: [
        { from: [-15.2, 3.2, -15.2], to: [-15.6, 2.4, -15.8], look: [-18, 0.8, -18], lookTo: [-18, 1.2, -18], fov: 42, fovTo: 36, dur: 5 },
        { path: [[-16, 1.0, -21], [-15, 1.2, -19.5], [-15.2, 1.5, -17]], look: me, dur: 5, ease: 'linear' },
        { from: [-13.2, 1.6, -18], look: [-9, 1.2, -17], fov: 50, dur: 3 },
      ],
      lines: [
        [0.8, 'ROURKE', 'You are awake. Good. They wanted you under for the transfer.', 3.2],
        [4.3, 'CALDER', 'Vince. Open the door.', 2],
        [6.6, 'ROURKE', 'I made a deal, Ash. You were the price.', 3],
        [9.9, 'CALDER', 'Then come down here and collect.', 2.4],
        [12.2, 'PA', 'Power fault, Block C. Doors on manual.', 2.2],
      ],
      beats: [[4.0, () => me.pose('idle')], [10.2, () => guard.walkTo(-9, -15, { speed: 1.4 })], [12.4, () => { this.cellDoor.unlock(); this.cellDoor.open(); }]],
      end: () => { L.dropActor(guard); L.dropActor(me); this.cellDoor.unlock(); this.cellDoor.open(); },
    });
    L.objective('out', 'Get out of the cell');
  },

  async finale(L) {
    L.done('roof');
    await L.cutscene({ shots: [{ from: [12, 8, 4], to: [10, 9, 2], look: [14, 6.5, 10], dur: 3.5 }], lines: [[0.4, 'CALDER', 'He is not here. He is in Toronto.', 2.6]] });
    L.end('credits');
  },
};
