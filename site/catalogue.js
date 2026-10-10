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
    content: 'Realistic gun and melee violence in first person, with blood. Enemies are shot and killed. Not for young children.',
    web: 'highrise/?play',
    tag: 'Shooter', big: true,
    cat: 'Shooter', tags: ['fps', 'guns', '3d', 'tower', 'singleplayer', 'first person'],
    blurb: 'Thirty-one storeys of a 2000s Manhattan tower, and you go up all of them.',
    about: `One building, not thirty-one levels: every floor exists at its real
    height in the same world at the same time, so you climb actual stairs and can
    look back down the well at the floor you just cleared. The plate changes as you
    go up - offices, trading floors, residential conversions, the plant floor on 12,
    the sky lobby on 16, and a penthouse at the top.`,
    controls: [['W A S D', 'move'], ['Mouse', 'look · click to fire · right-click to strike'],
               ['Shift', 'sprint'], ['Ctrl', 'crouch'], ['Space', 'slide'],
               ['Q E', 'lean'], ['R', 'reload'], ['1 - 8 / wheel', 'weapons'],
               ['H', 'bandage']],
    tips: 'Cover is real - a locker bank stops bullets. Crouch behind a barrier and it covers you.',
  },
  {
    slug: 'kickback', title: 'KICKBACK', how: 'mounted', port: 8157, url: '/',
    content: 'Cartoon pixel-art gun violence: enemies are shot and fall. No blood close up.',
    web: 'kickback/',
    tag: 'Action', big: true,
    cat: 'Action', tags: ['shotgun', 'platformer', 'physics', '2d', 'guns'],
    blurb: 'A sawed-off with two shells in it, and the shells are your legs.',
    about: `Six floors of an unfinished tower over the harbour with downtown across
    the water. Fire it at the floor and it throws you; fire it at a man and it is a
    shotgun. Two shells, then a reload you have to find the time for.`,
    controls: [['A D / arrows', 'walk'], ['Mouse', 'swing the gun'], ['Click', 'fire'],
               ['R', 'reload'], ['1 2 3', 'pick an upgrade at a crate'], ['P', 'pause']],
    tips: 'Down is a jump. Aim under your feet and pull.',
  },
  {
    slug: 'exposure', title: 'EXPOSURE', how: 'mounted', port: 8151, url: '/',
    content: 'Horror. A dark ship, creatures in the dark and sudden scares, with a gun you fire to see. Bright flashes.',
    web: 'exposure/',
    tag: 'Horror', big: true,
    cat: 'Horror', tags: ['dark', 'shooting', 'atmospheric', '2d', 'scary'],
    blurb: 'The deck is pitch black. Your muzzle flash is the only light, and it freezes.',
    about: `Firing lights the room for an instant, and that instant STAYS on the
    screen - cold, grainy and still - while everything in the actual room keeps
    moving in the dark. You are always looking at a photograph of where things were.`,
    controls: [['W A S D / arrows', 'move'], ['Mouse', 'aim'],
               ['Click / Z / Space', 'fire'], ['X / F / right-click', 'strike a match'],
               ['Shift', 'hold your aim and creep'], ['R', 'restart after a run']],
    tips: 'The photograph is a second old. Shoot where the thing is going, not where it was.',
  },
  {
    slug: 'dungeon-quest', title: 'DUNGEON QUEST', how: 'mounted', port: 8124, url: '/',
    content: 'Fantasy combat with swords, bows and magic against monsters and a dragon, in a blocky retro style.',
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
    content: 'Motor racing. Cars crash and lose wheels; no people are shown hurt.',
    web: 'apex/',
    tag: 'Racing', big: true,
    cat: 'Driving', tags: ['new', 'racing', 'f1', 'cars', 'simulation', '3d', 'track',
                           'rain', 'pit stops', 'damage', 'career'],
    blurb: 'Thirty-three real circuits, twenty-four cars, and air that decides the overtake.',
    about: `Every circuit on the calendar and a good many that are not, each laid out
    from its real corner sequence and solved until the lap closes to under a metre and
    measures the published distance. The car makes its own grip out of air - about its
    own weight again in downforce by 200 km/h - so it corners harder the faster it is
    going, and the body heaves, pitches and rolls on four real springs rather than on
    a formula. Twelve teams, two cars each, and the air behind them matters: sit in
    somebody's tow down a straight and you gain on him, follow him through a corner
    and his wake takes downforce off your car. Tyres go off and get too
    hot, it rains and the road reflects it, the car breaks when you hit things, and
    the crew come over the wall to change four of them while you sit there. Drive on
    your own, set a time, run a single race, or take on the League, race by race with a
    championship table at the end of it.`,
    controls: [['W S', 'throttle · brake'], ['A D', 'steer'],
               ['E Q', 'up a gear · down a gear'], ['Space', 'DRS'],
               ['C', 'clutch'], ['P', 'ready the crew, then drive into the pit lane'],
               ['1 - 5', 'choose tyres'],
               ['V', 'camera'], ['R', 'back on track'], ['Esc', 'pause']],
    tips: 'Get a tow down the straight before you commit to the move - in the corner behind him you have less grip than he does, not more. And a downshift too many will step the back out.',
  },
  {
    slug: 'nascar', title: 'NASCAR', how: 'mounted', port: 8220, url: '/',
    content: 'Motor racing on ovals. Cars crash and spin; no people are shown hurt.',
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
    changed. Run one race, a season of them, or five hundred laps in one sitting.`,
    controls: [['W S', 'throttle · brake'], ['A D', 'steer'],
               ['E Q', 'up a gear · down a gear'], ['C', 'clutch - restart after a stall'],
               ['P', 'call the pits'], ['V', 'camera'],
               ['Arrows', 'wedge · track bar'], ['[ ]', 'race speed'],
               ['R', 'back on track'], ['Esc', 'pause']],
    tips: 'Nobody wins a superspeedway race on their own. Stay on the bumper in front, and remember the man behind you is pushing because it suits him, not you.',
  },
  {
    slug: 'night-shift', title: 'NIGHT SHIFT', how: 'mounted', port: 8130, url: '/',
    content: 'A crime story seen from above: robberies, police chases and gunfights with the police. Small figures, no blood close up.',
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
               ['R', 'reload'], ['M', 'mask'], ['Q', 'down a floor in a stairwell'],
               ['E', 'eat'], ['Esc', 'pause']],
    tips: 'Change the car and the clothes between jobs. What they cannot describe, they cannot look for.',
  },
  {
    slug: 'grind-city', title: 'GRIND CITY', how: 'mounted', port: 8126, url: '/',
    content: 'Skateboarding in the street. Falls, but nothing violent.',
    web: 'grind-city/',
    tag: 'Sport', big: true,
    cat: 'Sport', tags: ['new', 'skateboard', 'pixel', 'tricks', '2d', 'street'],
    blurb: 'A 2D pixel skater where the mouse IS the board, not a pointer.',
    about: `Your hand is your weight on the deck. Slide to a tip and flick sideways and
    it flips; push down in the middle and it spins flat; push down over a tip and it
    goes end over end. Because a slow slide only moves your foot and only a real snap
    counts as a flick, you get to choose the trick before you commit to it - and past
    about a sixth of a turn the rotation completes itself, so there is no catch to time
    and you never wipe out for doing nothing. Competitions pay the most,
    but the free-roam city has coins lying about and a grab pays a little too.`,
    controls: [['Mouse / arrows', 'your weight on the deck'],
               ['A D', 'push · brake · spin in the air'],
               ['Hold down', 'pump in a transition · manual over a tip'],
               ['1 - 0', 'grabs'], ['R', 'bail and reset'], ['Esc', 'pause']],
    tips: 'TRICK SHEETS on the main screen plays every gesture back at you with the real board attached.',
  },
  {
    slug: 'southpaw', title: 'SOUTHPAW', how: 'mounted', port: 8262, url: '/',
    content: 'Cartoon pixel-art boxing, plus wrestling and sumo. Fighters are knocked down; no blood.',
    web: 'southpaw/',
    tag: 'Sport', big: true,
    cat: 'Sport', tags: ['new', 'boxing', 'fighting', 'pixel', 'wrestling', 'sumo', 'career', '2d'],
    blurb: 'Arcade pixel boxing: ten opponents, a gym, and a wrestling bowl and a sumo ring besides.',
    about: `Ten fighters stand between you and the belt, and every one of them has a
    strength and a hole you can find - one drops his guard after a flurry, one taunts,
    one takes body shots badly. The ring is drawn three-quarters on, so you step across
    it as well as along it, and a punch only lands if you are lined up with him. Hold
    SPACE and every punch goes to the body, under a high guard. Mash and he will learn
    it: he covers the spot you keep hitting and counters the gap in your rhythm.
    Winning pays points to spend in the gym, and the locker room is where you choose
    what you look like. SPECIAL MODES add a wrestling bowl with ropes to bounce off and
    a sumo ring where the health bar is your balance.`,
    controls: [['A D / W S', 'step along and across the ring'],
               ['← ↑ → ↓', 'jab · cross · hook · uppercut'],
               ['Hold Space', 'punches go to the body'], ['Shift', 'guard high'],
               ['Shift + Space', 'guard low'], ['Q / E', 'slip · duck'],
               ['F', 'star punch'], ['Esc', 'pause']],
    tips: 'If he keeps blocking high, hold SPACE and go to the body - and if you are guarding high yourself, expect him to wait half a second and go low.',
  },
  {
    slug: 'inkvale', title: 'INKVALE', how: 'mounted', port: 8285, url: '/',
    content: 'Storybook fantasy battles: archers, knights and wizards against ink monsters, which splash into ink when beaten. No blood.',
    web: 'inkvale/',
    tag: 'Strategy', big: true,
    cat: 'Strategy', tags: ['new', 'tower defence', 'watercolour', 'co-op', 'online', 'heroes', 'story', '2 player'],
    blurb: 'A tower defence painted in watercolour, where your towers paint the enemy and the colours mix.',
    about: `Twelve battles, three acts, and a Hollow King at the end of the road. Archers stain
    what they hit ochre, mages ultramarine, artillery vermilion - and a second colour on a
    foe that is still wet MIXES: blue and red make a hex that makes everything hit harder,
    yellow and blue grow vines that root it, yellow and red burst into fire that spreads.
    Where you build is a palette. The spells are drawn, not clicked: drag a Wash along the
    road to shove the crowd back and paint it blue, or an Ink Wall across it to make them
    hack their way through.

    Five tower lines split into fifteen paths, there are sixteen foes and three bosses,
    and every battle pays coins to hire warriors in the Hall - eight heroes in all. Two
    Wardens is the co-op: one of you hosts, the other joins with a four-letter code,
    and you each bring your own gold, towers and hero.`,
    controls: [['Click', 'build on a plot · upgrade a tower'], ['Drag + 1', 'The Wash, along the road'],
               ['Drag + 2', 'Ink Wall, across the road'], ['H', 'select your hero, then click to send'],
               ['Space', 'call the next wave early'], ['F', 'game speed'], ['Esc', 'pause · cancel']],
    tips: 'Two colours on the same bend of road beat one big tower. Put an archer post and a mage tower side by side and watch the vines.',
  },
  {
    slug: 'penguin-dash', title: 'PENGUIN DASH', how: 'mounted', port: 8250, url: '/',
    content: 'A cartoon penguin fishing while seals, sharks and orcas try to catch it. Nothing graphic.',
    web: 'penguin-dash/',
    tag: 'Arcade', big: true,
    cat: 'Arcade', tags: ['new', 'penguin', 'fishing', 'pixel', 'underwater', 'side scroller', 'animals'],
    blurb: 'A penguin, a grey sea, and everything in it that eats penguins.',
    about: `Swim out from the shore, catch a fish in your beak and bring it back to the
    pile - while seals, sharks and orcas hunt you. The penguin swims towards the
    pointer and dashes with a barrel roll, and it carries its speed, so a fast run at
    the surface throws it into the air. Ice floes are safe to rest on; icebergs are
    not, and block a breach from underneath. The sea runs two kilometres out, darker
    and stormier the farther you go, with deep caverns at the bottom guarded by a
    giant squid and a giant crab. Thirty-six fish for the Fish Book, twenty-two
    penguins to dress as, and points to spend on speed and strength.`,
    controls: [['Mouse', 'swim towards the pointer · hop on land and ice'],
               ['Click / Space', 'dash'], ['Arrows + Enter', 'menus'],
               ['Esc', 'pause · back'], ['M', 'sound']],
    tips: 'A shark that sees you calls every predator nearby to where you were - so change direction after it spots you, not before.',
  },

  // ---- thirteen from the 2026-10-08/09 games session (session hub) ----
  {
    slug: "stack-attack", title: "STACK ATTACK", how: 'mounted', port: 8306, url: "/",
    content: "Cartoon food falls and stacks up. A seagull steals bits of burger, and customers gag and walk out when you catch a boot, a fish or a sock. No violence.",
    web: "stack-attack/",
    tag: "Arcade", big: true,
    cat: "Arcade", tags: ["new","burger","stacking","cooking","physics","cartoon","mobile","endless"],
    blurb: "Catch the order on a wobbly bun, in the right order, before the tower falls over.",
    about: `Food rains down on a cartoon diner and you catch it on a sliding bottom bun, in the order the ticket says, then grab the top bun to serve. Every piece stays exactly where it lands and hangs off the one below on a springy hinge, so an off-centre catch makes the tower lean and a jerk of the bun makes it sway. Wrong slices cost pay and tip. Catch a boot, a fish or a sock and the customer walks out.

Ten shifts of 60 to 90 seconds add wind, a seagull that dives for the top of your stack, slippery sauce and double drops, up to The Monster's nine-layer orders. Cash earns stars, stars unlock shifts and six bun skins, and a star on shift 2 opens Rush Hour: endless, getting harder, three plates and you are done.`,
    controls: [["Mouse","slide the bun"],["A D / ← →","slide the bun"],["Esc / P","pause"],["R","restart the shift"],["Space / Enter","main button on menus"],["Drag anywhere","slide the bun (touch)"]],
    tips: "When the tower leans one way, catch the next piece a little off-centre on the other side. And if the top piece is a wrong ingredient, let the seagull steal it: that takes the mistake off your order.",
  },
  {
    slug: "snowball-royale", title: "SNOWBALL ROYALE", how: 'mounted', port: 8307, url: "/",
    content: "Cartoon kids throw snowballs at each other; three hits knock a kid out to the sidelines and they come back a few seconds later. A dog runs through and knocks kids over. The screen shakes and its edges briefly go red when you are hit. Nothing graphic.",
    web: "snowball-royale/",
    tag: "Arcade", big: true,
    cat: "Action", tags: ["new","snowball fight","top down","battle royale","teams","winter","mobile"],
    blurb: "A snowball fight at dusk: duck behind snow walls, lob over them, and roll a giant one to flatten everybody.",
    about: `Up to six kids, one snowy garden, ninety seconds. A click throws a fast flat snowball that a wall will stop; hold it and you lob one over the wall instead, and a red ring on the ground shows you where theirs are coming down. Scoop fresh snow to reload and you dig the ground bare, so nobody can camp. Build your own walls, belly-dive under throws and tackle people, or hold R and roll a snowball until it is big enough to flatten anyone in its way.

Four modes - free-for-all, 2 v 2, 3 v 3 and King of the Fort - across eight maps, from a frozen pond where dives slide forever to a sledging hill where big balls run away downhill. The AI kids are snipers, rushers, builders and cowards, and they get sharper on every map you unlock. Every round pays coins for hats and scarves.`,
    controls: [["WASD / arrows","move"],["Mouse + click","aim · fast flat throw"],["Hold click","charge a lob over walls"],["Space / Shift / right click","dive · tackle"],["E (or stand still)","scoop snow"],["Q","build a snow wall (3 snowballs)"],["Hold R","roll a big snowball"],["Touch","left thumb moves, right thumb aims · DIVE WALL ROLL SCOOP buttons"]],
    tips: "Hit a snowy tree when enemies are standing under it: the whole load drops on them for a hit each and a long stun, but it hits your own side too, and the tree needs about 8 seconds to load up again.",
  },
  {
    slug: "wrecking-ball", title: "WRECKING BALL", how: 'mounted', port: 8308, url: "/",
    content: "Cartoon buildings, cars and gas tanks get smashed, crumple and explode into dust and fireballs. There are no people in it and nobody gets hurt.",
    web: "wrecking-ball/",
    tag: "Arcade", big: true,
    cat: "Arcade", tags: ["new","physics","destruction","crane","city","upgrades","mobile","2d"],
    blurb: "One crane, one wrecking ball, 30 seconds: knock the whole block down.",
    about: `You do not throw the ball. You drive the trolley it hangs from, and the trolley is slow on purpose, so the big hits come from rocking it in time with the swing until the ball is flying. Every building is made of physics blocks welded together. Snap the columns low down and the floors above pancake into the street, and every brick, window and car that falls pays. Gas tanks explode and set each other off, water towers burst, cars crumple and set off their alarms, and a big enough collapse drops the game into slow motion.

There are fifteen blocks in three districts: Old Town brick and timber, Downtown glass towers and Industrial steel, smokestacks and tank farms. Each block has a target to beat and three stars to earn. Every dollar of damage goes into the bank, pass or fail, and the Garage spends it on a heavier ball, a longer cable, spikes and a second ball on a chain.`,
    controls: [["A D / ← →","move the trolley along the jib"],["W S / ↑ ↓ / wheel","wind the cable up and down"],["Drag","the trolley chases the pointer"],["R","instant retry"],["Esc / P","pause"],["Enter / Space","menu button"],["Touch: drag","move the trolley"],["Touch: slider","cable up and down"]],
    tips: "Drive the trolley against the ball's swing, left as it swings right and back again, and four or five pumps will build more speed than holding one key ever will.",
  },
  {
    slug: "mower-madness", title: "MOWER MADNESS", how: 'mounted', port: 8309, url: "/",
    content: "Cartoon garden chaos: gnomes and toys get knocked flying and shatter, a dog chases the mower and bumps into it, and cats leap away hissing. No animals are hurt and there is no blood.",
    web: "mower-madness/",
    tag: "Arcade", big: true,
    cat: "Driving", tags: ["new","mowing","lawn","stripes","garden","time trial","cartoon","top down"],
    blurb: "A ride-on mower, a ticking clock, and a lawn full of gnomes that will not get out of the way.",
    about: `Fifteen gardens to cut against the clock, from a tidy front lawn on Number 12 to a royal garden party with the corgis loose. The mower drives the way you press and spins on the spot, the grass turns light or dark by the way you mowed it, and every straight pass you lay right beside the last one grows a STRIPE CHAIN that multiplies everything you cut, up to five times.

Gnomes, a dog that chases, sleeping cats, toys that clog the blades, pop-up sprinklers that leave slippery mud, bunkers, slopes and a hedge maze all stand between you and the target. Each garden has three stars, for time, stripes and untouched flowers, and the stars unlock four more mowers in the Garage, from the sliding Zippy to the Monster Mower that chews toys for points.`,
    controls: [["WASD / arrows","drive the way you press"],["Space / Shift","boost (burns fuel)"],["Esc / P","pause"],["R","restart the garden"],["Enter / Space","next garden on the results screen"],["Drag anywhere","steer on a phone"],["BOOST button","boost on a phone"]],
    tips: "Mow in lanes along the long side of the lawn and tap straight back next to your last pass: the chain multiplier is worth far more than cutting corners past a gnome.",
  },
  {
    slug: "sushi-conveyor", title: "SUSHI CONVEYOR", how: 'mounted', port: 8310, url: "/",
    content: "Cartoon customers in a sushi bar get grumpy and storm out if kept waiting, and a cat steals plates. No violence.",
    web: "sushi-conveyor/",
    tag: "Arcade", big: true,
    cat: "Arcade", tags: ["new","sushi","cooking","serving","time management","cute","touch","2d"],
    blurb: "Grab the right plate off three speeding belts and get it to the right face before they storm out.",
    about: `Customers line the back of the counter, each with a bubble that says what they want: a dish, any plate of a colour, a colour under a price, or just "something hot". Drag, flick or tap the right plate up to them before their patience bar runs red. Serve fast for bigger tips and a growing combo; serve wrong and they shove it back. Three walkouts and the shop closes.

Twelve short days at four restaurants, from a Tiny Tokyo Stall to a Floating River at sunset. A second belt arrives on day 4 and a third on day 8, and along the way come gold plates, a five-dish sumo, a VIP critic and a cat that steals plates. Every tip goes in your wallet for the shop: extra hands, a faster chef, a better SLOW lever, a tip jar and decorations that keep customers calm.`,
    controls: [["Drag / flick a plate","serve it to a customer"],["Click plate, then customer","hold a plate and serve it"],["1 - 5","serve the held plate to that seat"],["C or click the chef","cook for the most impatient customer"],["Space or the SLOW lever","slow the belts"],["Click the cat","shoo it and save the plate"],["R / Esc or P","restart day / pause"],["Touch","drag, flick or tap plates and customers"]],
    tips: "Tips grow by 5 per cent for every serve in a row up to x1.5, and one wrong plate wipes it, so if you are not sure a plate is under the price in the bubble, wait for the next one.",
  },
  {
    slug: "bomb-squad", title: "BOMB SQUAD", how: 'mounted', port: 8311, url: "/",
    content: "A cartoon bomb that goes BOOM with a comic-book explosion, a bright white flash and a sooty pair of eyes when you fail. A strike tints the screen red and shakes it. Nobody is hurt and there is no blood.",
    web: "bomb-squad/",
    tag: "Puzzle", big: true,
    cat: "Puzzle", tags: ["new","bomb","defusal","puzzle","manual","timer","daily","endless"],
    blurb: "A ticking bomb, a paper manual and three strikes to spare: snip, flip, read, don't panic.",
    about: `A bomb sits on your desk under the lamp, with a manual open beside it. Pick a module and the booklet flips to its page: cut the right one of three to six wires, tap or hold the button and let go on the right digit, set five switches by their cap colours, press four symbol keys in column order, answer Simon with the mapped colour, steer through a maze whose walls you cannot see, or spin four letter wheels to the one word that fits. Almost every rule depends on the serial number, the batteries and the lights along the top.

Every wrong move is a strike and makes the clock run a quarter faster, and three strikes is BOOM. The campaign is twenty bombs that bring in the modules one at a time, until four modules and a hissing Vent share one clock. Endless keeps them coming until one goes off, and the Daily is one new bomb a day.`,
    controls: [["Click","pick a module · cut, press, flip, spin"],["Tab","next module"],["1 - 6","cut a wire · flip a switch · press a key"],["Space (hold)","hold the button, let go to release"],["Arrows","Simon pads · steer the maze · code wheels"],["Z X C","Vent valves, from anywhere"],["Esc / M / R","pause · manual · retry"],["Tap","everything on touch; the manual is a drawer"]],
    tips: "Read the serial, the batteries and the lights before you touch anything: nearly every rule asks about them, and each strike makes the clock run 25 per cent faster.",
  },
  {
    slug: "grapple-goblin", title: "GRAPPLE GOBLIN", how: 'mounted', port: 8305, url: "/",
    content: "A cartoon goblin swings over spikes, lava and icy water and dodges bats. A fall is a puff of smoke and a restart at the last flag. Nothing graphic.",
    web: "grapple-goblin/",
    tag: "Arcade", big: true,
    cat: "Arcade", tags: ["new","one button","swinging","grappling hook","mobile","caves","endless","2d"],
    blurb: "Hold to hook, let go to fling: one button, one goblin, and twenty caves full of gold.",
    about: `Hold and the hook fires at the next anchor; let go and the goblin flies off with everything the swing gave him. That is the whole game, and it is enough. The rope is a real pendulum, faint dots show where a release right now would send you, and a release on the upswing at just the right angle is a PERFECT - faster, and it pulls in the gold around you. Spikes, lava, pits and bats send you back to the last flag, but the coins you took stay taken.

Twenty caves in four places - the Mossy Cave, the Crystal Cavern, the Lava Mine and the Frozen Grotto - bring crumbling anchors, anchors on rails, bouncy mushrooms, updrafts, mine carts that launch you off a bumper and icy gusts that shove you backwards. Every cave has three stars, one of them a big gem hidden behind the rocks in front. Deep Dive is the endless run: one life, harder the deeper you go, and your score in metres.`,
    controls: [["Hold mouse / Space","fire the hook and swing"],["Release","let go and fling"],["Enter / Up / W / Z / X / J","also hold to hook"],["R","restart the cave"],["Esc / P","pause"],["Touch: hold anywhere","hook · lift to fling"]],
    tips: "Let go while you are swinging up with the rope leaning well forward - when the preview dots turn gold, the release is a PERFECT and flings you 10 per cent faster.",
  },
  {
    slug: "parry", title: "PARRY", how: 'mounted', port: 8304, url: "/",
    content: "Cartoon fantasy fighters (bandits, knights, ninjas, ogres, pirates) are knocked flying or puff away with a KO when you block them back. Small cartoon explosions from bombs and fireballs. No blood.",
    web: "parry/",
    tag: "Rhythm", big: true,
    cat: "Arcade", tags: ["new","rhythm","music","blocking","boss fights","reflex","endless","2d"],
    blurb: "You only block, and every arrow, axe and fireball lands on the beat.",
    about: `You stand at a crossroads and attacks come down all four roads, each landing on the beat of a drum and bass loop that speeds up through the round. A ring closes on the target in each lane: block as it lands. A perfect, inside 45 milliseconds, sends the arrow or fireball straight back and knocks out whoever threw it. A good just bounces it off, and a miss costs one of your three hearts. Rogues fake a swing and strike a beat later. Ninjas throw two daggers down the same road, half a beat apart. Boulders have to be held, and bombs must not be blocked at all.

There are eight stages, from Forest Road to the Storm Citadel. Each round lasts about a minute and ends with a boss whose attacks are a short song, from the Bandit Brute to the Black King. Perfects in a row build a multiplier up to x8. Every stage has three stars, for surviving, for the score target and for perfecting the boss. Clear stage 4 and Endless opens, starting at 108 beats a minute and climbing to 168.`,
    controls: [["Arrows / W A S D","block up, right, down, left"],["Hold the key","hold against a boulder (purple ring)"],["Do nothing","let a bomb (red X) fly over"],["Esc / P","pause"],["R","retry straight away"],["Enter / Space","menu button"],["Tap a side","block on a phone (swipe in settings)"]],
    tips: "On a dashed cyan ring, count \"one\" on the fake swing and block on \"two\": the rogue always strikes exactly one beat later.",
  },
  {
    slug: "one-tile", title: "ONE TILE", how: 'mounted', port: 8303, url: "/",
    content: "A cartoon pixel thief sneaks past guards, cameras and lasers. Being spotted sets off an alarm and a soft red pulse over the room, then the level restarts. Nobody is hurt.",
    web: "one-tile/",
    tag: "Puzzle", big: true,
    cat: "Puzzle", tags: ["new","heist","stealth","pixel","guards","real time","puzzle","2d"],
    blurb: "Crack the safe, grab the gold and get out before the guard turns round.",
    about: `Twenty-four rooms across a bank, a museum, a casino and a penthouse, each one a single screen seen from above. Hold WASD and the thief dashes tile to tile, more than twice as fast as a guard. Stand next to the safe until it clicks open three times, then run for the EXIT, which stays padlocked until you do. Guards, cameras and lasers run their loops whether you move or not, and each one throws a cone showing exactly what it can see.

Walk one tile behind a guard and he never knows. Duck into a potted fern or a locker and no cone can find you. Glass cases stop your feet but not his eyes, and the tile under a camera is always watched. Get caught and any key puts you back at the door: no lives, no step limits. Three stars a level for escaping, picking up every gold coin and taking the cash bag or the gem.`,
    controls: [["W A S D / arrows","hold to run tile to tile"],["Stand by the safe","crack it (progress is kept)"],["Any key","try again after being caught"],["R","restart the level"],["Esc / P","pause, how to play, music and sound"],["Enter / N","next job after an escape"],["Hold a finger","run towards that side of the thief (phone, sideways)"]],
    tips: "Every patrol repeats exactly, so watch one loop before you move, and the safest spot in the room is often one tile behind a walking guard, since he only looks ahead.",
  },
  {
    slug: "derby", title: "DEMOLITION DERBY", how: 'mounted', port: 8302, url: "/",
    content: "Cartoon top-down cars ram each other, lose panels, smoke and catch fire. There are no people shown and nobody is hurt.",
    web: "derby/",
    tag: "Driving", big: true,
    cat: "Driving", tags: ["new","demolition derby","cars","crashing","top down","arena","destruction","physics"],
    blurb: "Eight cars, one dirt bowl, and the last one still running wins.",
    about: `Seven AI drivers and you, boxed into a walled arena with nowhere to go but into each other. Your front bumper is armoured and the sides crumple, so the hit that counts is the T-bone: nose into a door at full boost. Panels dent where they are struck, bumpers, bonnets and doors fall off and stay on the dirt, and engines go from grey smoke to black smoke to fire before they stall for good. At 75 seconds a ring of fire starts closing in, so nobody hides forever.

Every round pays coins by place, by damage dealt and by wrecks caused, to spend on five cars from a light hatchback to an enormous school bus, and on paint. Win at the County Fair Bowl to open the Mud Field, with its grip-killing puddles, then win there to open the Figure-8, where the two loops only meet in the middle.`,
    controls: [["W / S or Up / Down","gas · brake and reverse"],["A / D or Left / Right","steer"],["Space","handbrake"],["Shift","boost (1.4 s, refills in 8 s)"],["R","restart"],["Esc / P","pause"],["Touch: drag left side","steer, gas is automatic"],["Touch: BOOST / REV","boost · reverse"]],
    tips: "Never take a hit on the door: your front takes 0.45x damage and your sides 1.25x, so turn your nose to anything coming at you and save boost for your own T-bone.",
  },
  {
    slug: "touge-drift", title: "TOUGE DRIFT", how: 'mounted', port: 8297, url: "/",
    content: "Cartoon cars racing and drifting on a mountain road. They scrape the guardrail and bump each other, with sparks and tyre smoke. No crashes that hurt anyone and no people shown.",
    web: "touge-drift/",
    tag: "Driving", big: true,
    cat: "Driving", tags: ["new","drifting","racing","touge","eurobeat","top down","cars","time attack"],
    blurb: "Slide an 80s hatchback down an endless Japanese mountain pass at dusk, one long drift at a time.",
    about: `A white-and-black hatchback with pop-up headlights, a mountain road that never ends, and eurobeat playing. Turn hard at speed and the back steps out; hold the slide and the points climb, faster and wider worth more. Hold it long enough and the multiplier ticks up to x10, and drifting right next to the guardrail doubles everything. Slam the rail hard, though, and you lose the drift you have not banked yet. Banked points fill the nitro.

Race puts you on a grid with three rivals, Kenta, Shin and Mika, for an eighty-second sprint down to the finish banner. Time Attack gives you 45 seconds, and every chequered strip across the road adds more. Free Run has no clock. The road is built as you drive: sweepers, S-bends and hairpins through cedar forest, lit by street lamps and your own headlights, and it gets narrower and tighter the further down you go.`,
    controls: [["W / ↑","gas"],["S / ↓","brake"],["A D / ← →","steer (turn hard at speed to drift)"],["Space","handbrake"],["Shift","nitro"],["R","restart"],["Esc / P","pause"],["Touch","hold left or right half to steer, both = handbrake (gas is automatic)"]],
    tips: "Start your next drift within 2.2 seconds of banking the last one and you keep the multiplier, so on S-bends flick straight from one slide into the next.",
  },
  {
    slug: "blade-dash", title: "BLADE DASH", how: 'mounted', port: 8296, url: "/",
    content: "Stylised ink stick-figure samurai fights: enemies split in two when cut, barrels explode, and hits leave red ink splats on the paper. No realistic blood or gore.",
    web: "blade-dash/",
    tag: "Action", big: true,
    cat: "Action", tags: ["new","samurai","ink","slash","combo","one touch","endless","mobile"],
    blurb: "Tap to dash-slash. Every kill refills your dash, so the whole room can be one unbroken chain.",
    about: `Every stage is one room drawn in ink on paper, full of enemies, and you clear it with a tap. Your samurai dashes wherever you point, the aim snaps onto anyone close to your line, and a kill refills both of your dash charges, so you can go from enemy to enemy without touching the ground. Landing breaks the chain. Swordsmen flash a red ! before they swing, archers draw a line at you before they loose, shield guards block from the front, barrel carriers blow up everyone near them, and generals take three hits.

Thirty stages in three chapters, the Bamboo Forest, the Red Castle and the Night Temple, with three stars on each: clear it, beat the par time, and kill every enemy in one chain. Hold Space for a few seconds of slow motion when you need to line up a hard jump. Endless is an open arena where the waves keep coming, and a kill scores 100 times your current chain.`,
    controls: [["Click / tap","dash-slash that way"],["J / K / Enter","dash towards the pointer"],["Arrows / WASD + J","dash in that direction"],["Hold Space","slow motion (focus)"],["R","restart the room"],["Esc / P","pause"],["Touch: tap","dash-slash"],["Touch: hold 集中","slow motion"]],
    tips: "Cut a barrel carrier while others are standing near him: his blast kills everyone within 170 pixels, and every one of those kills counts towards your chain.",
  },
  {
    slug: "tiny-harbor", title: "TINY HARBOR", how: 'mounted', port: 8290, url: "/",
    content: "A peaceful island game. Nobody gets hurt and you cannot die. You chop trees and catch, cook and eat fish; storms bring rain, thunder and lightning.",
    web: "tiny-harbor/",
    tag: "Cosy", big: true,
    cat: "Adventure", tags: ["new","cosy","island","fishing","lighthouse","building","3d","sailing"],
    blurb: "Keep a tiny island: tie up the trading boats, light them in at night, and grow a leaky tent into a cottage.",
    about: `You keep a small island with a campfire, a wooden dock and a striped lighthouse out on its own islet. Chop trees for wood, fish off the dock for supper, and pick up clams and shells off the wet sand when the tide goes out - it comes back twice a day and takes whatever you left. Three trading boats sail in by day, and each one pays extra for something: fish, shells or wood. At night they wait out at sea, and you climb the lighthouse and lead them past the rocks with the beam.

The tent becomes a shack, a cabin, then a two-floor cottage that you paint and fill with furniture you make yourself. Eleven fish bite by depth, tide, time of day and weather, and storms flood the beach. Build a sailboat and you can sail to three far islands, each with a village and a trader who pays double.`,
    controls: [["W A S D / arrows","walk · steer the sailboat · move the lamp beam"],["E / Space / click","use · cast · hook · hold to reel"],["F","eat"],["Q","go in and out of your home"],["B","make furniture (indoors) · R rotates"],["J","journal"],["Esc","pause · back"],["Touch","stick to walk, USE button to act"]],
    tips: "Save your fish for the Puffin and your wood for Old Oak - each boat pays half as much again for the one thing it wants.",
  },

  // ---- the ten written for the deck --------------------------------
  {
    slug: 'stack', title: 'STACK', how: 'local', tag: 'Skill',
    content: 'A stacking game. Nothing of concern.',
    cat: 'Arcade', tags: ['one button', 'tower', 'skill', 'mobile', 'timing'],
    blurb: 'Drop each slab on the one below. What hangs over gets sliced off and falls.',
    about: `One button, seen from the side in real solids: each slab is a lit block with a
    shaded edge, so you can see the overhang before you drop, and the piece that gets cut
    off tumbles away down the tower. Land one dead flush and you win back a sliver of width -
    and from the third perfect in a row, three times as much. Every run goes on the board.`,
    controls: [['Click / Space', 'drop'], ['Tap', 'drop (mobile)'], ['P', 'pause']],
    tips: 'Perfect drops give width back, and from the third in a row they give back three times as much.',
  },
  {
    slug: 'drifter', title: 'DRIFTER', how: 'local', tag: 'Arcade',
    content: 'A spaceship shooting at asteroids. Nothing of concern.',
    cat: 'Arcade', tags: ['asteroids', 'space', 'shooting', 'retro', 'ship'],
    blurb: 'Rocks, a small ship, and bullets that cost the fuel you steer with.',
    about: `Asteroids with one rule changed: the gun and the engine come out of the same
    tank. Shooting a rock is easy; shooting everything is how you end up drifting into
    one with nothing left to stop with. Fuel comes back slowly while you fly and quickly
    while you sit still - and sitting still is not safe.`,
    controls: [['A D / ← →', 'turn'], ['W / ↑', 'thrust'], ['Space / Click', 'fire'],
               ['Shift', 'hyperspace - tap it, do not hold it']],
    tips: 'A small rock is worth five times a big one, and the wave does not end until every one of them is gone - so shoot the big ones where they will break up away from you.',
  },
  {
    slug: 'merge', title: 'MERGE', how: 'local', tag: 'Puzzle',
    content: 'A fruit-merging puzzle. Nothing of concern.',
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
    content: 'A pipe puzzle. Nothing of concern.',
    cat: 'Puzzle', tags: ['pipes', 'water', 'logic', 'levels', 'tiles'],
    blurb: 'Six rooms of pipe by hand, then it generates them for ever.',
    about: `The cellar, the waterworks, the boiler, the roof, the foundry and the deep -
    each with its own room and one new idea: pipes bolted down that cannot be turned, and
    crossovers that carry water both ways at once. After those six it generates rooms for
    ever, growing a row or a column every third stage and then tightening the clock.`,
    controls: [['Click', 'turn a pipe'], ['Tap', 'turn a pipe (mobile)']],
    tips: 'Bolted pipes are already correct - build around them. Every second left on the clock is a bonus.',
  },
  {
    slug: 'sweep', title: 'SWEEP', how: 'local', tag: 'Puzzle',
    content: 'Minesweeper. Nothing of concern.',
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
    content: 'Cartoon western gunfights between two cowboys, with hits counted by limb. Bright muzzle flashes; no blood.',
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
    content: 'Basketball. Can be played online with a friend using a room code; there is no chat.',
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
    caps - or a bigger stamina tank. And you can PLAY ONLINE: one of you hosts a room, up
    to three friends type the four-letter code, and you are all in the same match.`,
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
    content: 'Volleyball between two jelly blobs. Nothing of concern.',
    cat: 'Sport', tags: ['volleyball', 'physics', '2 player', 'ball', 'jelly'],
    blurb: 'Two jelly slimes, one ball, one net, first to eleven. Bring a friend.',
    about: `Volleyball with the rules taken out: no touch limit, no positions, just a ball that
    must not land on your side. The slimes are jelly - a spring for the squash and four
    wobble modes across the surface, so they ring and settle instead of snapping back - and
    the ball comes off wherever you meet it. Play the computer, which gets better every
    point it loses, or take the right-hand slime yourself.`,
    controls: [['A D / mouse', 'move'], ['W', 'jump'], ['Click / Space', 'serve'],
               ['Arrows', 'player two moves'], ['Up arrow', 'player two jumps']],
    tips: 'Jump INTO the ball, not under it. TWO PLAYER on the home screen puts a friend on the right-hand slime.',
  },
  // DUNK WAS HERE. Liam: "delete dunk". It was a three-a-side game with
  // the camera over your shoulder, and HOOPS now does the same job from
  // the side with the same body, the same shot and both courts - so there
  // were two basketball games on the pile and only one of them was being
  // worked on. Its folder, its card and its test went with this entry.

  // ---- the classics ------------------------------------------------
  {
    slug: 'crossing', title: 'CROSSING', how: 'local', tag: 'Endless',
    content: 'A pixel-art frog crossing roads and rivers. The frog can be run over or fall in the water, cartoon style.',
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
