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
    cat: 'Shooter', tags: ['fps', 'guns', '3d', 'tower', 'singleplayer', 'first person'],
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
    cat: 'Action', tags: ['shotgun', 'platformer', 'physics', '2d', 'guns'],
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
    cat: 'Horror', tags: ['dark', 'torch', '3d', 'survival', 'scary', 'first person'],
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
    cat: 'Horror', tags: ['dark', 'shooting', 'atmospheric', '2d', 'scary'],
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
    cat: 'Adventure', tags: ['rpg', 'dungeon', 'retro', '3d', 'dragon', 'n64'],
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
  {
    slug: 'apex', title: 'APEX', how: 'mounted', port: 8201, url: '/',
    web: 'apex/',
    tag: 'Racing', big: true,
    cat: 'Driving', tags: ['new', 'racing', 'f1', 'cars', 'simulation', '3d', 'track',
                           'rain', 'pit stops', 'damage', 'career'],
    blurb: 'Thirty-three real circuits, twenty-four cars, and a tow worth eighteen km/h.',
    about: `Every circuit on the calendar and a good many that are not, each laid out
    from its real corner sequence and solved until the lap closes to under a metre and
    measures the published distance. The car makes its own grip out of air - about its
    own weight again in downforce by 200 km/h - so it corners harder the faster it is
    going, and the body heaves, pitches and rolls on four real springs rather than on
    a formula. Twelve teams, two cars each, and the air behind them matters: sit in
    somebody's tow down a straight and you gain eighteen km/h, follow him through the
    corner and you are the one with seven per cent less grip. Tyres go off and get too
    hot, it rains and the road reflects it, the car breaks when you hit things, and
    the crew come over the wall to change four of them while you sit there. A season
    is run race by race with a championship table at the end of it.`,
    controls: [['W S', 'throttle · brake'], ['A D', 'steer'],
               ['E Q', 'up a gear · down a gear'], ['Space', 'DRS'],
               ['P', 'call the pits'], ['1 - 5', 'choose tyres'],
               ['V', 'camera'], ['R', 'back on track'], ['Esc', 'pause']],
    tips: 'Get a tow down the straight before you commit to the move - in the corner behind him you have less grip than he does, not more. And a downshift too many will step the back out.',
  },
  {
    slug: 'nascar', title: 'NASCAR', how: 'mounted', port: 8220, url: '/',
    web: 'nascar/',
    tag: 'Racing', big: true,
    cat: 'Driving', tags: ['new', 'racing', 'nascar', 'stock cars', 'oval', 'cars',
                           'simulation', '3d', 'draft', 'pit stops', 'career'],
    blurb: 'Twenty ovals, forty cars, and a draft that decides it on the last lap.',
    about: `Twenty speedways, each solved from its published lap distance, banking and
    corner radius until the shape closes - Daytona's tri-oval, Bristol's concrete bowl,
    Martinsville's paperclip, Darlington with its two different ends, Pocono's three
    corners and Indianapolis with its straights dead flat. The banking is real
    arithmetic: at thirty-one degrees the corner takes the tyres out of the argument
    entirely, which is why nobody lifts at Daytona and everybody does at Phoenix.
    The air is the other half of the race - a car on its own is slower than two cars
    nose to tail, so the pack forms itself. The other thirty-nine drive the same car
    you do, with the same four-speed box and the same wall. Tyres go off in about a
    fuel run, so a stop is a decision rather than a formality, and the crew take
    thirteen seconds over the wall because the fuel man works while the tyres are
    changed. Run one race, a season of them, or four hundred laps in one sitting.`,
    controls: [['W S', 'throttle · brake'], ['A D', 'steer'],
               ['E Q', 'up a gear · down a gear'], ['P', 'call the pits'],
               ['T', 'tear-off'], ['V', 'camera'],
               ['Arrows', 'wedge · track bar'], ['[ ]', 'race speed'],
               ['R', 'back on track'], ['Esc', 'pause']],
    tips: 'Nobody wins a superspeedway race on their own. Stay on the bumper in front, and remember the man behind you is pushing because it suits him, not you.',
  },
  {
    slug: 'night-shift', title: 'NIGHT SHIFT', how: 'mounted', port: 8130, url: '/',
    web: 'night-shift/',
    tag: 'Crime', big: true,
    cat: 'Action', tags: ['new', 'crime', 'driving', 'stealth', 'top down', 'cars', 'open world'],
    blurb: 'Do the job, and do not get caught. They have to kill you to stop you.',
    about: `A top-down city at night, and a police force that does not look for YOU -
    it looks for a description, built one line at a time out of what you left at the
    scene: vehicle, clothing, face, prints, build. The screen before the job is the
    one that matters, because a ski mask denies them your face and gloves deny them
    your prints, and face or prints means identified, which means your name, your
    address and your bank card. Drive, get out, go in, take a different car.`,
    controls: [['W A S D', 'drive · walk'], ['F', 'get out · go in · take a car'],
               ['Shift', 'sprint'], ['Mouse', 'aim'], ['Click', 'fire'],
               ['R', 'reload'], ['M', 'mask'], ['Esc', 'pause']],
    tips: 'Change the car and the clothes between jobs. What they cannot describe, they cannot look for.',
  },
  {
    slug: 'grind-city', title: 'GRIND CITY', how: 'mounted', port: 8126, url: '/',
    web: 'grind-city/',
    tag: 'Sport', big: true,
    cat: 'Sport', tags: ['new', 'skateboard', 'pixel', 'tricks', '2d', 'street'],
    blurb: 'A 2D pixel skater where the mouse IS the board, not a pointer.',
    about: `Your hand is your weight on the deck. Slide to a tip and flick sideways and
    it flips; push down in the middle and it spins flat; push down over a tip and it
    goes end over end. Because a slow slide only moves your foot and only a real snap
    counts as a flick, you get to choose the trick before you commit to it - and past
    about a sixth of a turn the rotation completes itself, so there is no catch to time
    and you never wipe out for doing nothing. Free skating scores; money comes out of
    competitions only.`,
    controls: [['Mouse / arrows', 'your weight on the deck'],
               ['A D', 'push · brake · spin in the air'],
               ['Hold down', 'pump in a transition · manual over a tip'],
               ['R', 'bail and reset'], ['Esc', 'pause']],
    tips: 'TRICK SHEETS on the main screen plays every gesture back at you with the real board attached.',
  },

  // ---- the ten written for the deck --------------------------------
  {
    slug: 'stack', title: 'STACK', how: 'local', tag: 'Skill',
    cat: 'Arcade', tags: ['one button', 'tower', 'skill', 'mobile', 'timing'],
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
    cat: 'Arcade', tags: ['breakout', 'paddle', 'retro', 'mobile', 'ball'],
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
    cat: 'Arcade', tags: ['asteroids', 'space', 'shooting', 'retro', 'ship'],
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
    cat: 'Arcade', tags: ['endless', 'runner', 'pixel', 'one button', 'mobile', 'jumping'],
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
    cat: 'Puzzle', tags: ['merge', 'physics', 'fruit', 'mobile', 'relaxing', 'match'],
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
    cat: 'Puzzle', tags: ['pipes', 'water', 'logic', 'levels', 'tiles'],
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
    cat: 'Puzzle', tags: ['minesweeper', 'logic', 'mines', 'timed', 'board'],
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
    cat: 'Shooter', tags: ['reaction', 'western', 'duel', '2 player', 'aim'],
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
    cat: 'Sport', tags: ['new', 'basketball', 'multiplayer', 'online', '2 player', 'ball'],
    blurb: 'Streetball on the blacktop or a full game in the arena - alone, or online with a friend.',
    about: `Three games on one side-on court. HALF COURT is streetball: one ring, both teams
    attacking it, first to eleven and win by two, and a team that wins the ball has to take it
    back behind the check line. FULL COURT is the real thing: two rings, twos and threes, two
    minutes on the clock, and the camera runs with the ball. STAND STILL is the old game - one
    spot, ten balls, a moving hoop and a streak.

    The other players actually play basketball: they pick a man and stay with him, deny the pass,
    sag off and help in the lane, and run plays - pick and roll, give and go, a back-door cut -
    and they miss, especially from distance and especially tired. Everything you do costs
    STAMINA: sprinting, guarding, jumping, swiping at the ball and shooting, so a tired player is
    slower, jumps lower and shoots worse.

    Play it on the BLACKTOP, with a chain-link fence, a city block and people hanging over the
    railings, or in an ARENA with a full bowl, a scoreboard and banners. Baskets, steals and
    blocks pay COINS, and coins buy jersey designs, street tees, baggy jeans, shoes, hair and
    caps - or a bigger stamina tank. And you can PLAY ONLINE: one of you hosts a room, the
    other types the four-letter code, and you are in the same match.`,
    controls: [['A D', 'back and forward, the way you are attacking'],
               ['W S', 'away from the camera and towards it'],
               ['Drag', 'aim and shoot - let go in the green band for a clean look'],
               ['Hold Q + drag', 'pass where you point'],
               ['Click', 'pass to a team-mate, or swipe at the ball'],
               ['Shift', 'guard'], ['Space', 'jump - rebound, block or dunk']],
    tips: 'Time a jump into the flight of a shot and you can take it out of the air.',
  },
  {
    slug: 'spike', title: 'SPIKE', how: 'local', tag: 'Sport',
    cat: 'Sport', tags: ['volleyball', 'physics', '2 player', 'ball', 'jelly'],
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
  // DUNK WAS HERE. Liam: "delete dunk". It was a three-a-side game with
  // the camera over your shoulder, and HOOPS now does the same job from
  // the side with the same body, the same shot and both courts - so there
  // were two basketball games on the pile and only one of them was being
  // worked on. Its folder, its card and its test went with this entry.

  // ---- the classics ------------------------------------------------
  {
    slug: 'snake', title: 'SNAKE', how: 'local', tag: 'Classic',
    cat: 'Classic', tags: ['snake', 'retro', 'arcade', 'mobile', '80s'],
    blurb: 'Every fifth apple leaves a block where you ate it.',
    about: `Plain Snake is solved - you learn to fold it into rows and then it is a
    chore with a timer. So this one fights back: every fifth apple drops a wall block
    on the square where you ate it, which means the tidy fold stops being safe and the
    board at apple forty is one you built yourself out of forty decisions. The golden
    apple is worth five and rots in seven seconds, and the route to it is never the
    route you would otherwise take.`,
    controls: [['Arrows / W A S D', 'turn'], ['Swipe', 'turn (mobile)'], ['P', 'pause']],
    tips: 'Turns are buffered two deep, so left-then-up as one motion works at full speed.',
  },
  {
    slug: 'lines', title: 'LINES', how: 'local', tag: 'Classic',
    cat: 'Classic', tags: ['blocks', 'falling', 'retro', 'puzzle', '80s'],
    blurb: 'Seven shapes, ten columns, and a piece that lands still has half a second.',
    about: `The falling-block game with the four details that decide whether it feels
    right: a landed piece gets half a second in which it can still be slid or spun, the
    next piece comes from a shuffled bag of all seven rather than a dice, a rotation
    that would not fit is retried against the wall before being refused, and a ghost
    shows where it will land. Four rows at once pays double if you did it last time too.`,
    controls: [['← →', 'move'], ['↑ or X', 'spin'], ['Z', 'spin back'],
               ['↓', 'soft drop'], ['Space', 'hard drop'], ['Shift / C', 'hold']],
    tips: 'The bag means the longest you can ever wait for the long piece is twelve.',
  },
  {
    slug: 'rally', title: 'RALLY', how: 'local', tag: 'Classic',
    cat: 'Classic', tags: ['pong', 'bat and ball', 'retro', '2 player', '70s'],
    blurb: 'Two bats and a ball. Where it hits the bat is where it goes.',
    about: `The oldest one there is, with the rule most copies get wrong left in: the
    ball leaves at an angle set by WHERE on the bat it struck, so the middle sends it
    straight back and the end sends it away. Move as you make contact and you cut it
    sideways. The ball speeds up through a rally, and the computer has a reaction delay
    and an aim error rather than being perfect, so it can be wrong-footed.`,
    controls: [['W S or Mouse', 'move'], ['↑ ↓', 'player two'], ['P', 'pause']],
    tips: 'The end of the bat is a weapon. Take the ball early and wide to pull him out of position.',
  },
  {
    slug: 'invasion', title: 'INVASION', how: 'local', tag: 'Classic',
    cat: 'Classic', tags: ['space', 'shooting', 'retro', 'aliens', '70s'],
    blurb: 'Five rows of them, and they march faster the fewer are left.',
    about: `The 1978 one. The whole arc of it is an accident of the original hardware
    that turned out to be the design: with fewer aliens on screen the machine redrew
    faster, so it starts as a shooting gallery and ends as a panic without any
    difficulty curve existing. One shot at a time, so a miss costs you the wait. The
    bunkers erode block by block - and your own shots eat them from underneath.`,
    controls: [['← → or Mouse', 'move'], ['Space / Click', 'fire'], ['P', 'pause']],
    tips: 'The saucer is worth up to 300. It is also the only time your shot is not defending you.',
  },
  {
    slug: 'crossing', title: 'CROSSING', how: 'local', tag: 'Endless',
    cat: 'Arcade', tags: ['new', 'endless', 'hopping', 'traffic', 'mobile', 'one life'],
    blurb: 'It never ends, and the bottom of the screen is rising. How far did you get?',
    about: `Road and river, generated forever as they come into view, and they play as
    opposites - on the road touching anything kills you, on the river touching NOTHING
    does. The river carries you along with the log, so the far bank is about where you
    WILL be rather than where you are, and the turtles dive. What makes it a game is
    the camera: it creeps up from the bottom of the screen, faster the further you get,
    and the edge is lethal. You are never allowed to wait for a gap, only to pick one.
    One life, and your score is the row you reached.`,
    controls: [['Arrows / W A S D', 'hop'], ['Swipe', 'hop (mobile)'], ['P', 'pause']],
    tips: 'A diving turtle will not hold you - but you cannot wait for it either. Take the gap you have.',
  },
];

export const bySlug = (s) => GAMES.find((g) => g.slug === s);
