// =====================================================================
// PLAYPILE :: catalogue.js - EVERY GAME ON THE DECK, ONCE
// =====================================================================
//
// The home page and every game page read this and nothing else. Adding a
// game is one entry here plus its folder; there is no second list to
// keep in step, which is the only way a fourteen-game site stays true.
//
//   how   'local'   - static files under games/<slug>/, served from here.
//                     These are the ones that would work on any host.
//         'mounted' - a project of Liam's with its own server on its own
//                     port. The page frames http://localhost:<port>.
//         'unity'   - a Unity WebGL build under games/<slug>/build.
export const GAMES = [
  // ---- the big ones ------------------------------------------------
  {
    slug: 'highrise', title: 'HIGHRISE', how: 'mounted', port: 8141, url: '/?play',
    web: 'highrise/?play',
    tag: 'Shooter', big: true,
    blurb: 'Thirty-one storeys of a 2000s Manhattan tower, and you go up all of them.',
    about: `One building, not thirty-one levels: every floor exists at its real
    height in the same world at the same time, so you climb actual stairs and can
    look back down the well at the floor you just cleared. The plate changes as you
    go up - offices, trading floors, residential conversions, the plant floor on 12,
    the sky lobby on 16, and a penthouse at the top.`,
    controls: [['W A S D', 'move'], ['Mouse', 'look and fire'], ['Shift', 'sprint'],
               ['R', 'reload'], ['E', 'pick up'], ['F6', 'editor']],
    tips: 'Cover is real - a locker bank stops bullets. Crouch behind a barrier and it covers you.',
  },
  {
    slug: 'kickback', title: 'KICKBACK', how: 'mounted', port: 8157, url: '/',
    web: 'kickback/',
    tag: 'Action', big: true,
    blurb: 'A sawed-off with two shells in it, and the shells are your legs.',
    about: `Six floors of an unfinished tower over the harbour with downtown across
    the water. Fire it at the floor and it throws you; fire it at a man and it is a
    shotgun. Two shells, then a reload you have to find the time for.`,
    controls: [['A D', 'walk'], ['Mouse', 'swing the gun'], ['Click', 'fire'],
               ['R', 'reload'], ['1 2 3', 'pick an upgrade at a crate']],
    tips: 'Down is a jump. Aim under your feet and pull.',
  },
  {
    slug: 'lightsout', title: 'LIGHTS OUT', how: 'mounted', port: 8154, url: '/',
    web: 'lightsout/',
    tag: 'Horror', big: true,
    blurb: 'A dark house, a torch, six switches, and something nine feet tall.',
    about: `You are standing in a dark house holding a torch. There are six light
    switches, and the house does not want you to reach them. The torch throws real
    shadows, the walls have plaster and paper and damp on them, and the thing that
    lives here is nine feet tall, folded forward, and only ever half seen.`,
    controls: [['W A S D', 'move'], ['Mouse', 'look'], ['E', 'switch / interact'],
               ['F', 'torch']],
    tips: 'The torch is a beam, not a lamp. What it is not pointed at is not empty.',
  },
  {
    slug: 'exposure', title: 'EXPOSURE', how: 'mounted', port: 8151, url: '/',
    web: 'exposure/',
    tag: 'Horror', big: true,
    blurb: 'The deck is pitch black. Your muzzle flash is the only light, and it freezes.',
    about: `Firing lights the room for an instant, and that instant STAYS on the
    screen - cold, grainy and still - while everything in the actual room keeps
    moving in the dark. You are always looking at a photograph of where things were.`,
    controls: [['Move', 'mouse or arrows'], ['Click', 'fire'], ['R', 'reload']],
    tips: 'The photograph is a second old. Shoot where the thing is going, not where it was.',
  },
  {
    slug: 'dungeon-quest', title: 'DUNGEON QUEST', how: 'mounted', port: 8124, url: '/',
    web: 'dungeon-quest/',
    tag: 'Adventure', big: true,
    blurb: 'An N64 dungeon crawler: four levels, three classes, and a black dragon at the end.',
    about: `A forest between the cliffs, a mine shaft, a frozen mountain that actually
    climbs, and a ledge on a black cliff - then the dragon that took the kingdom. Knight,
    archer or wizard, told in cutscenes, with every enemy wind-up telegraphed on the
    ground before it lands. Plug in an N64 controller and that works too.`,
    controls: [['W A S D', 'move'], ['Arrows', 'jump · block · attack · special'],
               ['Shift / C', 'run · crouch'], ['Space', 'pick up · open · talk'],
               ['1 2 3', 'potion · throw · eat'], ['E / M / Tab', 'satchel · map · target']],
    tips: 'The dragon tells you which way to move: an orange tail sweep is jumped, green breath is dodged sideways.',
  },

  // ---- the ten written for the deck --------------------------------
  {
    slug: 'stack', title: 'STACK', how: 'local', tag: 'Skill',
    blurb: 'Drop each slab on the one below. What hangs over gets sliced off and falls.',
    about: `One button, seen from the side in real solids: each slab is a lit block with a
    shaded edge, so you can see the overhang before you drop, and the piece that gets cut
    off tumbles away down the tower. Land one dead flush and you get the width back - three
    in a row and the slab grows. Every run goes on the board.`,
    controls: [['Click / Space', 'drop'], ['Tap', 'drop (mobile)'], ['P', 'pause']],
    tips: 'Perfect drops give width back. Three in a row and the slab grows.',
  },
  {
    slug: 'bricks', title: 'BRICKS', how: 'local', tag: 'Arcade',
    blurb: 'Breakout, with a paddle that is exactly as wide as your last mistake.',
    about: `Ten columns, a row of steel that moves down the wall every level, and five
    drops worth leaving the ball for. The paddle shrinks the longer a wall takes and
    comes back to full on every clear. Mouse or arrow keys - whichever you touched last
    is the one driving it.`,
    controls: [['Mouse', 'move the paddle'], ['A D / arrows', 'move the paddle'],
               ['Click', 'launch'], ['P', 'pause']],
    tips: 'Hitting the paddle off-centre angles the ball. That is the whole game.',
  },
  {
    slug: 'drifter', title: 'DRIFTER', how: 'local', tag: 'Arcade',
    blurb: 'Rocks, a small ship, and bullets that cost the fuel you steer with.',
    about: `Asteroids with one rule changed: the gun and the engine come out of the same
    tank. Shooting a rock is easy; shooting everything is how you end up drifting into
    one with nothing left to stop with. Fuel comes back slowly while you fly and quickly
    while you sit still - and sitting still is not safe.`,
    controls: [['A D / arrows', 'turn'], ['W', 'thrust'], ['Space', 'fire'],
               ['Shift', 'hyperspace']],
    tips: 'The rocks are quick. Let the small ones go by rather than pay for them.',
  },
  {
    slug: 'hopper', title: 'HOPPER', how: 'local', tag: 'Endless',
    blurb: 'One button, one long night on the rooftops, and a jump as high as you hold it.',
    about: `An endless runner in pixel art, back on the rooftops at night: lit windows,
    neon, water towers and aerials going past in three depths. The jump is analogue -
    how long you hold is how high you go - and there is a dive for landing early.
    Coins arc over the gaps, and they buy what your runner wears.`,
    controls: [['Space / Click', 'jump (hold for higher)'], ['Down / S', 'dive'],
               ['P', 'pause']],
    tips: 'Dive to land early. A short hop over a low gap beats a long one every time.',
  },
  {
    slug: 'merge', title: 'MERGE', how: 'local', tag: 'Puzzle',
    blurb: 'Drop the fruit in, match two, get a bigger one. A thousand stages of it.',
    about: `Real rolling physics in a glass jar. Two of the same touch and become the next
    one up - a thousand stages of it. Past the eleventh the sizes start again and the
    pieces wear rings and pips instead, so a small one can be worth thousands. The jar
    is narrow and the grace over the line is short.`,
    controls: [['Mouse', 'aim'], ['Click', 'drop'], ['Tap', 'drop (mobile)']],
    tips: 'Keep the big ones at the bottom. A large one stranded on top is a dead jar.',
  },
  {
    slug: 'pipeworks', title: 'PIPEWORKS', how: 'local', tag: 'Puzzle',
    blurb: 'Six rooms of pipe by hand, then it generates them for ever.',
    about: `The cellar, the waterworks, the boiler, the roof, the foundry and the deep -
    each with its own room and one new idea: pipes bolted down that cannot be turned, and
    crossovers that carry water both ways at once. After those six it generates rooms for
    ever, growing a row or a column every third stage and then tightening the clock.`,
    controls: [['Click', 'turn a pipe'], ['Space', 'let the water go early (bonus)']],
    tips: 'Bolted pipes are already correct - build around them. Finishing early pays.',
  },
  {
    slug: 'sweep', title: 'SWEEP', how: 'local', tag: 'Puzzle',
    blurb: 'Minesweeper on a clock, at whatever size and difficulty you can stand.',
    about: `Four board sizes and four difficulties, from an 11% board with room to think
    to a 26% one past the density where logic alone gets you home. Boards come one after
    another and grow as you go. Your first click is always safe; nothing after it is.`,
    controls: [['Left click', 'clear'], ['Right click', 'flag'],
               ['Click a number', 'clear around it'], ['Long press', 'flag (mobile)']],
    tips: 'Clicking a satisfied number clears its neighbours. At this speed, that is the game.',
  },
  {
    slug: 'quickdraw', title: 'QUICKDRAW', how: 'local', tag: 'Reaction',
    blurb: 'Hand on the holster. One shot each, then hands down, until one of you drops.',
    about: `Keep the pointer on your holster through the wait. Leaving early is a re-do
    rather than a death - but three of them in one fight and you stand through the next
    word with an empty hand while he takes his time over you. On DRAW you pull the
    pointer clear and the gun follows your HAND, not a crosshair on his chest: the shot
    goes out along the line from your hip through your hand and carries on, and your hand
    has to stay on your own side of the street, so aiming is an angle. One shot each, then
    hands go back down and you do it again, until somebody is on the floor - being slower
    than him is survivable, but only just, because a bullet in you starts a quarter of a
    second to answer it. Damage is per limb: a headshot is instant, an arm is that arm
    gone, a leg puts you on one knee. He is a person too, not a stopwatch - he fumbles the
    draw, jumps the word, and pulls shots wide, and the worse he is the more of all three.`,
    controls: [['Mouse', 'hold the holster, then pull clear and aim'],
               ['Click', 'fire - your hand must be on your own half'],
               ['Arrows', 'player two aims'], ['Enter', 'player two fires']],
    tips: 'Hit and still holding your shot? Fire NOW - you have a quarter of a second.',
  },
  {
    slug: 'hoops', title: 'HOOPS', how: 'local', tag: 'Sport',
    blurb: 'Drag anywhere and let go. The hoop moves, and the streak is the score.',
    about: `A side-on court in solids, with a low-poly shooter who dips into his knees as you
    pull and puts the ball up out of his hands, a net simulated as twelve strands of beads
    that the ball pushes through, and a crowd who get on their feet when one goes in. The
    drag starts anywhere and the dotted line is the real flight.`,
    controls: [['Drag anywhere', 'aim and power'], ['Release', 'shoot']],
    tips: 'Swishes stack the multiplier. A rim-in resets it to one.',
  },
  {
    slug: 'spike', title: 'SPIKE', how: 'local', tag: 'Sport',
    blurb: 'Two jelly slimes, one ball, one net, first to eleven. Bring a friend.',
    about: `Volleyball with the rules taken out: no touch limit, no positions, just a ball that
    must not land on your side. The slimes are jelly - a spring for the squash and four
    wobble modes across the surface, so they ring and settle instead of snapping back - and
    the ball comes off wherever you meet it. Play the computer, which gets better every
    point it loses, or take the right-hand slime yourself.`,
    controls: [['A D', 'move'], ['W', 'jump'], ['Arrows', 'player two moves'],
               ['Up arrow', 'player two jumps']],
    tips: 'Jump INTO the ball, not under it. Press 2 on the title screen for two players.',
  },
  {
    slug: 'dunk', title: 'DUNK', how: 'local', tag: 'Sport',
    blurb: 'Three a side, three minutes, and the camera is over your shoulder.',
    about: `Six low-poly players in painted kit on a hardwood floor, in front of a crowd
    on tiers. The camera sits behind your man and the mouse looks: the crosshair in the
    middle of the screen is the aim, and what is under it decides what a click does -
    a team-mate and it is a pass, anything else and it starts a shot you charge by
    holding and release in the green band. Point at the man with the ball and click to
    reach in, but only the hand NEARER you can be swiped, so Q and E - which put the
    ball in your left or right hand - are a crossover. Everybody has stats that mean
    something: speed, shooting, handle, steal, block, and an IQ that every decision the
    other five make is rolled against, so they take the wrong option, pass into
    coverage and shoot from too far. They bump, too: run into somebody and you both
    come off it, and a hard shoulder into the carrier can knock the ball loose.`,
    controls: [['W A S D', 'move, relative to the camera'], ['Mouse', 'look - click once to capture it'],
               ['Click', 'on a team-mate: pass · elsewhere: hold to charge, release to shoot'],
               ['Click', 'without the ball: reach in'], ['Q  E', 'ball to the left or right hand'],
               ['SPACE', 'jump - at the ring with the ball, it is a dunk']],
    tips: 'The hand away from your man cannot be stolen. Swap hands as you go past him.',
  },
];

export const bySlug = (s) => GAMES.find((g) => g.slug === s);
