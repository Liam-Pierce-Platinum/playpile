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
  // ---- 2026-10-18: BLADE DASH: CASTLE + 25 3D games from the session hub ----
  {
    slug: "blade-dash-story", title: "BLADE DASH: CASTLE", how: 'mounted', port: 8402, url: "/",
    content: "Ink-and-paper sword fighting: enemies are cut down with ink splats, and the final boss is cut in half in a stylised ink finish. Spring-spike plates flash red before they fire, and there is slow-motion and screen shake.",
    web: "blade-dash-story/",
    tag: "Story dash-slash", big: true, added: '2026-10-18',
    cat: "Action", tags: ["new","action","samurai","ninja","story","boss","ink","mobile"],
    blurb: "BLADE DASH with a story: smash in through the windows of a fifteen-storey castle, dash-slash your way up floor by floor and beat the rival ninja on the roof to save the princess.",
    about: `The story version of BLADE DASH. On the night of the red moon, Kage the shadow blade has carried Princess Hana to the roof of Tenshu Castle. You climb the outside of the tower, smash in through a window on every floor, and cut your way across it room by room to the stairs.

Each floor is two to six rooms in a row. Every doorway is a paper door sealed with a talisman until that room's guards are down: grunts, lanterns, archers, shields, bombers and generals. Earn up to three stars and coins per floor, spend the coins on hats, masks, robes, patterns and sashes, and face Kage on the roof: dodge his dash, then strike while he recovers.`,
    controls: [["Click / tap","dash 300 px that way (aim snaps onto a nearby enemy)"],["Hold Space","slow-mo while the meter lasts"],["J / K / Enter","dash toward the mouse"],["R","back to the start of this room"],["Esc","pause"],["Touch","tap to dash, the 集中 button for slow-mo"]],
    tips: "You have two dash charges and a kill refills both, so chain kill to kill without touching the floor. Against Kage, dodge first and only strike while he staggers: hit him at any other time and he parries.",
  },
  {
    slug: "egg-wars", title: "EGG WARS", how: 'mounted', port: 8403, url: "/",
    content: "A first-person shooter with clay eggs: eggs crack and break apart, nobody bleeds. Cartoon weapons. Optional online play with friends via a 4-letter room code; there is no text chat.",
    web: "egg-wars/",
    tag: "Claymation egg FPS", big: true, added: '2026-10-18',
    cat: "Shooter", tags: ["new","shooter","fps","eggs","clay","online","3d","mobile"],
    blurb: "A claymation egg shooter. Crack the other eggs in a free-for-all against five bots, aim for the yolk for a YOLKSHOT, and level up to unlock new guns, shell colours and hats.",
    about: `A stop-motion clay first-person shooter where everyone is an egg. Every match is a free-for-all against five bots: the first egg to 15 cracks, or the leader when the 2:30 clock runs out, wins. Headshots are YOLKSHOTS and do double damage, shells visibly crack as eggs take damage, and the last kill plays in slow motion.

Matches earn XP. Levels unlock the Yolker shotgun at level 2 and the Whisk sniper at level 4, plus shell colours and hats, and the bots get sharper as you level up. You can also host an online room and give friends the 4-letter code.`,
    controls: [["WASD","move"],["Mouse","aim (click to lock the pointer)"],["Click","shoot"],["Right mouse","Whisk scope"],["Space","jump"],["R","reload"],["1-3 / Q / wheel","swap weapon"],["Tab","scoreboard"],["M","menu"],["Touch","left stick moves, drag the right side to look, FIRE / JUMP / R / SWAP / SCOPE buttons"]],
    tips: "Aim at the top of the egg: a YOLKSHOT does double damage. Keep moving and jumping between shots, and reload behind cover instead of in the open.",
  },
  {
    slug: "kart-clash", title: "KART CLASH", how: 'mounted', port: 8404, url: "/",
    content: "Toy karts bump and blast each other with cartoon rockets, gumballs and mines in a plastic toy arena. Knocked-out karts just respawn; nobody is hurt.",
    web: "kart-clash/",
    tag: "Toy kart battle", big: true, added: '2026-10-18',
    cat: "Driving", tags: ["new","driving","karts","battle","arena","toys","3d","mobile"],
    blurb: "Glossy toy-plastic kart battles. Grab ? boxes for rockets, gumball guns, mines and shockwaves, and knock out the most karts in two minutes.",
    about: `A battle-arena kart game in shiny toy plastic, against five bots, on a baseplate arena surrounded by giant toys. Drive over the ? boxes to pick up an item and fire it with Space: a homing ROCKET, a GUMBALL GUN with 12 shots, two POP MINES that drop behind you, or a BOING WAVE that blasts karts away from you at close range.

Each match lasts two minutes and the most KOs wins. KOs and your finishing place earn XP, levels unlock new paint jobs, and the bots get sharper as your level rises.`,
    controls: [["WASD / arrows","drive"],["Space / J","fire your item"],["Esc","garage menu"],["Touch","left stick drives, FIRE button"]],
    tips: "Keep moving between ? boxes so you are never empty-handed. Save the BOING WAVE for when a kart is right on you, and drop POP MINES when someone is chasing you.",
  },
  {
    slug: "slope-rush", title: "SLOPE RUSH", how: 'mounted', port: 8405, url: "/",
    content: "A glowing ball on a neon track; no characters and no violence. The screen flashes when you crash and when the colours change every 400 m, with glow, scanlines and screen shake.",
    web: "slope-rush/",
    tag: "Endless neon slope", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","endless","ball","runner","synthwave","3d","mobile"],
    blurb: "Roll a glowing ball down an endless synthwave slope. Steer round holes and red blocks while the speed keeps climbing.",
    about: `Roll a glowing ball down an endless, twisting neon slope under a striped synthwave sun. Steer left and right to stay on the track, avoid the red blocks and the holes, and keep going as the speed climbs. Fall off or hit a red block and the run is over.

Every 400 m is a new sector with a new colour palette and a narrower track, more holes, drop-offs, red blocks and narrow bridges. Score is your distance plus bonuses for gold shards and close passes, and shards unlock new ball skins.`,
    controls: [["A D / Left Right","steer"],["Space / tap","retry"],["P / Esc","pause"],["M","mute"],["Touch","hold the left or right half of the screen"]],
    tips: "Small, early steering beats late swerves. Look further down the track as the speed rises, and only chase shards that are already on your line.",
  },
  {
    slug: "tunnel-dive", title: "TUNNEL DIVE", how: 'mounted', port: 8406, url: "/",
    content: "Abstract black-and-white tunnel; no characters, no violence. Strong high-contrast patterns (checkerboards, moire, spirals) rush and rotate all the time, and the screen flashes on a crash and at each new zone. Not suitable for anyone sensitive to patterns or flashing.",
    web: "tunnel-dive/",
    tag: "Op-art tunnel runner", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","endless","tunnel","reflex","black and white","3d","mobile"],
    blurb: "Dive down a spinning black-and-white op-art tunnel. Rotate the whole tunnel to thread the gaps as it gets faster and narrower.",
    about: `A kaleidoscope tunnel runner in stark black and white. You fly down the tunnel on your own; your job is to rotate the whole tunnel left or right so the gap in each gate comes round to meet you. Clip a barrier and the run ends.

Clean gates raise your multiplier from x1 up to x8. Close calls and prisms pay bonus points, and every 700 m a new zone makes it faster, narrows the gaps, adds spinning gates and switches the tunnel's pattern.`,
    controls: [["A D / Left Right","rotate the tunnel"],["Space / Enter / tap","retry"],["P / Esc","pause"],["M","mute"],["Touch","hold the left or right half of the screen"]],
    tips: "Look at the next gate, not the one you are in, and start turning early. Your multiplier is the real score, so a clean run beats a risky prism.",
  },
  {
    slug: "bridge-race", title: "BRIDGE RACE", how: 'mounted', port: 8407, url: "/",
    content: "Pastel clay figures race and bump each other to knock bricks loose; nobody is hurt. Confetti and gentle camera shake; no flashing.",
    web: "bridge-race/",
    tag: "Brick stacking race", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","race","bricks","casual","pastel","3d","mobile"],
    blurb: "Collect bricks in your colour, lay them as steps up a bridge and reach the golden top floor before three rivals. Bump them to knock their bricks loose.",
    about: `A pastel sky-island race. Run around the floor picking up bricks in your colour (pink), then walk up a bridge to lay them down as steps. Run out of bricks halfway up and you are stuck, so collect enough before you climb. Reach the golden top floor before the three rivals to win.

Bump into a rival who carries fewer bricks than you and their stack falls off as white bricks that anyone can grab. Later levels add more floors and faster rivals. Coins from each race buy hats.`,
    controls: [["WASD / arrows","move"],["Drag anywhere","touch joystick"],["Esc / II","menu and hat shop"],["Enter / Space","next level from the results"],["M","mute"]],
    tips: "Count your bricks against the bridge before you climb. Carry a bigger stack than the rival you bump, or it is you who loses your bricks.",
  },
  {
    slug: "hole-feast", title: "HOLE FEAST", how: 'mounted', port: 8408, url: "/",
    content: "A hole in the ground swallows toy-like props, cars, buildings and tiny people in a miniature model town; they simply drop out of sight. No blood and no flashing.",
    web: "hole-feast/",
    tag: "Swallow the city", big: true, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","hole","io","city","miniature","3d","mobile"],
    blurb: "Steer a hole through a tilt-shift model city and swallow everything smaller than you, from cones to skyscrapers, before the clock runs out.",
    about: `A hole-in-the-ground arena game in a tilt-shift miniature look, like a model town on a table. Steer your hole around the streets and swallow anything smaller than it: people, cones, cars, buses, houses, towers and finally skyscrapers. Everything you swallow makes you bigger.

Five rival holes are doing the same. A hole 20% bigger than another can swallow it for a bonus. When the clock hits zero, the highest score wins. Finishing first unlocks the next city, and lifetime points unlock hole skins.`,
    controls: [["Mouse","the hole steers toward the cursor (further = faster)"],["WASD / arrows","steer"],["Touch","drag anywhere"],["Enter / Space","play again from the results"],["M","mute"]],
    tips: "Grow on small things first and keep combos going. Stay away from bigger holes, and hunt a rival only when you are clearly more than a fifth bigger.",
  },
  {
    slug: "stick-swing", title: "STICK SWING", how: 'mounted', port: 8409, url: "/",
    content: "A folded-paper figure swings on a rope; obstacles just knock it back and falling restarts the level. No blood, no flashing.",
    web: "stick-swing/",
    tag: "Paper hook and swing", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","swing","physics","levels","paper","3d","mobile"],
    blurb: "Hold to hook the nearest star, let go to fly. Swing a folded-paper figure through 30 levels across five paper worlds.",
    about: `A one-button swinging game in folded paper. Hold the mouse, a finger or Space to hook the nearest star and swing on it, and let go to fly. Hook the next star, swing and let go again, all the way to the finish.

There are 30 levels across five paper worlds, with bounce pads, floor pillars, hanging blades and moving hooks. Each level gives stars for your time, and every five levels unlocks a new paper skin.`,
    controls: [["Hold mouse / touch / Space","hook the nearest star"],["Release","let go and fly"],["R","restart"],["Esc","menu"],["M","mute"]],
    tips: "Let go just after the bottom of the swing, on the way up, to fly forward and high. Short swings are often faster than big ones.",
  },
  {
    slug: "moto-stunt", title: "MOTO STUNT", how: 'mounted', port: 8410, url: "/",
    content: "A cartoon stunt rider in a comic-book style crashes into barrels, hammers and spike pits and simply respawns at the last flag; no injuries are shown. Comic 'boom' bursts flash on crashes, with screen shake.",
    web: "moto-stunt/",
    tag: "Comic stunt bike", big: false, added: '2026-10-18',
    cat: "Driving", tags: ["new","driving","motorbike","stunts","flips","comic","3d","mobile"],
    blurb: "Side-view stunt bike in a comic-book style. Flip over jumps, dodge barrels and swinging hammers, and finish 12 levels fast for three stars.",
    about: `A side-view stunt bike game drawn like a comic book, with halftone dots, ink outlines and sunburst skies. Ride over hills and jumps, lean back and forward to flip in the air, and land on your wheels.

There are 12 levels with jumps, hills, barrels, swinging hammers and spike pits, and checkpoint flags along the way. Every full flip takes one second off your time, so flips are the way to three stars.`,
    controls: [["Up / W","gas"],["Down / S","brake / reverse"],["Left / A","lean back (backflip)"],["Right / D","lean forward (frontflip)"],["R","restart"],["P / Esc","pause"],["Touch","on-screen lean, GO and brake buttons"]],
    tips: "Each full flip takes a second off your time, but only if you land it. Lean to level the bike before touching down.",
  },
  {
    slug: "drift-tower", title: "DRIFT TOWER", how: 'mounted', port: 8411, url: "/",
    content: "A little clay car drifts along a zigzag road in the sky; falling off just ends the run. No characters hurt, no flashing.",
    web: "drift-tower/",
    tag: "One-button drift", big: false, added: '2026-10-18',
    cat: "Driving", tags: ["new","driving","drift","one button","endless","clay","3d","mobile"],
    blurb: "One button, one zigzag road above the clouds. Hold to drift left, let go to drift right, and do not fall off.",
    about: `A one-button drifting game on a zigzag clay road floating on pastel towers above the clouds. Hold to drift left, let go to drift right, and turn every corner before you run off the edge. Fall off and the run is over.

Every corner cleared is a point. The car speeds up and the straights get shorter as your score climbs, and the colours change every 20 points. Gems on the road are banked between runs and buy new car colours in the garage.`,
    controls: [["Hold mouse / touch / Space","drift left"],["Release","drift right"],["Left / Up / A","also drift left while held"],["Tap / DRIVE AGAIN","go again after a fall"]],
    tips: "Turn at the corner, not before it: watch where the road bends and switch just as the car reaches the bend. Rhythm matters more than reaction once the straights get short.",
  },
  {
    slug: "eggy-road", title: "EGGY ROAD", how: 'mounted', port: 8412, url: "/",
    content: "A truck carries a loose egg over painted hills; if the egg touches the ground it cracks and the run ends. No characters hurt. A short bright flash and a moment of slow motion when the egg cracks.",
    web: "eggy-road/",
    tag: "Watercolour egg truck", big: false, added: '2026-10-18',
    cat: "Driving", tags: ["new","driving","physics","hills","egg","watercolour","3d","mobile"],
    blurb: "Drive a little truck over hand-painted watercolour hills with an egg rolling loose in the back. Go as far as you can before it cracks.",
    about: `A physics driving game in a hand-painted watercolour style. Your little truck has an egg sitting loose in its bed. Drive over the hills as far as you can, and if the egg falls out and touches the ground, it cracks and the run is over.

Collect golden drops along the way and spend them in the Garage on Engine, Soft springs, Basket wall and Tyres, five levels each. Every 350 m you cross into a new painted region.`,
    controls: [["Right / D / W","gas"],["Left / A / S","brake / reverse"],["Gas in the air","leans the truck back"],["R","restart"],["Space / Enter","retry"],["Touch","hold the right half for gas, the left half to brake"]],
    tips: "Slow over crests and smooth on landings: the egg leaves the bed when the truck kicks up. Upgrade the Basket wall and Soft springs early.",
  },
  {
    slug: "stunt-city", title: "STUNT CITY", how: 'mounted', port: 8413, url: "/",
    content: "A chrome car in a free-roam neon stunt park with ramps and loops. Wipe-outs just reset the car; no people. Neon colours but no flashing.",
    web: "stunt-city/",
    tag: "Vaporwave stunt park", big: true, added: '2026-10-18',
    cat: "Driving", tags: ["new","driving","stunts","free roam","loops","vaporwave","3d","mobile"],
    blurb: "Drive a chrome car around a vaporwave stunt park. Flip, spin and barrel-roll off ramps and loops, clear eight challenges and upgrade your ride.",
    about: `A free-roam stunt park in vaporwave colours: a chrome car on a mirror-grid floor under a striped sunset, full of ramps, loops and rings. Drive anywhere, launch off anything, and flip, spin and barrel-roll in the air. Land wheels-down or wipe out.

Eight challenges run in order: rings, loops, big air, a backflip, a gap jump and a stunt show. Stunts and challenges pay cash, which buys engine and nitro upgrades and chrome paints in the garage.`,
    controls: [["WASD / arrows","drive"],["Shift","nitro"],["Space","handbrake drift"],["W / S in the air","front / back flip"],["A / D in the air","spin"],["Q / E in the air","barrel roll"],["Enter","warp to the next challenge"],["R","reset to the last safe spot"],["G","garage"],["M","mute"],["Esc","quit a challenge"],["Touch","steer, GAS, BRK and NOS buttons"]],
    tips: "Stop rotating a moment before you land so the car settles wheels-down. Use nitro on the run-up to ramps for bigger air and more cash.",
  },
  {
    slug: "crazy-cattle", title: "CRAZY CATTLE", how: 'mounted', port: 8414, url: "/",
    content: "Knitted toy sheep ram each other off a floating quilt; they fall away in a puff of wool. Cartoon bonks and baas, no injuries, no flashing.",
    web: "crazy-cattle/",
    tag: "Knitted sheep royale", big: false, added: '2026-10-18',
    cat: "Action", tags: ["new","action","battle royale","sheep","ram","knitted","3d","mobile"],
    blurb: "A knitted-sheep battle royale on a quilt in the sky. Ram the flock off the edge while the quilt unravels, and be the last sheep standing.",
    about: `A battle royale for knitted sheep, played on a patchwork quilt floating in the sky. Run around, dash into other sheep to ram them, and knock them off the edge. The quilt unravels patch by patch from the outside in, so the field keeps shrinking. Be the last sheep standing to clear the field.

Every sheep you ram off earns yarn, which buys new wool coats. Later fields bring bigger, more aggressive flocks.`,
    controls: [["WASD / arrows","move"],["Space / Shift / J","RAM dash"],["Enter","next round"],["Touch","left stick moves, RAM button"]],
    tips: "Stay near the middle as the quilt unravels and let the others fight at the edges. Sheep that have been rammed a lot fly further, so finish off the flustered ones.",
  },
  {
    slug: "freeze-run", title: "FREEZE RUN", how: 'mounted', port: 8415, url: "/",
    content: "A pastel red-light, green-light game: runners caught moving pop into confetti and paint splats. Cartoon only, no blood, no flashing.",
    web: "freeze-run/",
    tag: "Red light, green light", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","red light green light","runner","timing","pastel","3d","mobile"],
    blurb: "Run while giant Marigold sings with her back turned, and freeze the moment she turns round. Move while she watches and you pop into confetti.",
    about: `A 3D red-light, green-light game in a pastel flat-shape style. Giant Marigold sings with her back to the field. While she sings, hold to run across the playground towards her. When she turns round, let go and freeze. Anyone still moving while she watches pops into confetti.

There are 12 tuned levels and then endless ones: longer fields, more runners, shorter songs, longer stares, mushroom bumpers from level 3 and fake half-turns from level 5. Finish before the timer for one to three stars.`,
    controls: [["Hold Space / W / Up","run"],["Release","freeze"],["A / D / arrows","steer"],["Hold mouse / touch","run (drag to steer)"],["Enter / Space","next or retry on the result card"],["R","retry"],["M","mute"]],
    tips: "Listen to the song: it resolves to a low home note right before she turns. From level 5 she sometimes only half-turns, so do not start running the instant she moves.",
  },
  {
    slug: "archer-duel", title: "ARCHER DUEL", how: 'mounted', port: 8416, url: "/",
    content: "Archers shoot each other with arrows in a woodcut-print style: arrows stick in limbs, struck limbs go limp and a defeated archer ragdolls with ink splats and slow motion. Stylised, no realistic blood. No flashing.",
    web: "archer-duel/",
    tag: "Woodcut archery duel", big: false, added: '2026-10-18',
    cat: "Shooter", tags: ["new","shooter","archery","bow","duel","2 player","3d","mobile"],
    blurb: "A woodcut-print archery duel. Drag back, aim the arc and loose. Head shots hit hardest, and a ladder of rivals gets tougher with wind.",
    about: `A ragdoll archery duel drawn like a woodcut print, with carved hatching, ink outlines and a ringed sun. Press anywhere, drag back and release to shoot. The further you drag, the more power, and a dotted guide shows the arc.

In the 1P LADDER you face rival archers in real time; wind starts at stage 3, and each win lets you pick one of three perks. In 2P DUEL two people share the screen and take turns.`,
    controls: [["Mouse / touch","press, drag back, release to shoot"],["Drag length","power"],["Bottom-left button","menu"],["Bottom-right button","mute"]],
    tips: "Head shots are worth the most. Fire a quick first arrow to find the range, then adjust; from stage 3 allow for the wind.",
  },
  {
    slug: "rooftop-duel", title: "ROOFTOP DUEL", how: 'mounted', port: 8417, url: "/",
    content: "Chunky voxel fighters shoot each other with cartoon guns to knock each other off a rooftop; a hit fighter flashes and is pushed back. No blood.",
    web: "rooftop-duel/",
    tag: "Wobbly rooftop duels", big: true, added: '2026-10-18',
    cat: "Shooter", tags: ["new","shooter","duel","2 player","physics","voxel","3d","mobile"],
    blurb: "Two buttons, one wobbly fighter. Jump, time your swaying gun and knock your rival off the roof. Beat an eight-rival ladder or duel a friend.",
    about: `A two-button rooftop duel with chunky, wobbly voxel fighters. One button jumps (you jump the way you are leaning) and the other fires, but your gun sways on its own, so every shot is about timing. Hits push your rival back; knock them off the roof to win the round.

The weapon changes every round between a revolver, a shotgun, a sniper, the automatic burp gun and the lobbed boom tube, across five rooftops. Play the arcade ladder of eight rivals, a quick duel, or two players on one keyboard.`,
    controls: [["W / Space / Up","jump (1 player)"],["D / J / F / Enter","fire (1 player)"],["P1: W / D","jump / fire (2 players)"],["P2: Up / Left","jump / fire (2 players)"],["Esc / P","menu"],["Touch","JUMP and FIRE buttons (four in 2P)"]],
    tips: "Wait for the gun to sway onto your rival, then fire. Do not jump wildly: land badly and you fall over, and a fighter on the floor is an easy target.",
  },
  {
    slug: "snake-arena", title: "SNAKE ARENA", how: 'mounted', port: 8418, url: "/",
    content: "Glowing sea snakes on a dark sea; a snake that crashes bursts into glowing orbs. No blood. A pink flash over the screen when you die.",
    web: "snake-arena/",
    tag: "Glowing snake brawl", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","snake","io","grow","neon","3d","mobile"],
    blurb: "A glowing snake brawl on a dark sea. Eat orbs to grow, cut off the other snakes so they crash into you, and climb from Plankton to Leviathan.",
    about: `A snake brawl on a dark, bioluminescent sea, against 24 computer snakes. Steer toward the cursor and eat glowing orbs to grow. Any head that touches another snake's body dies and bursts into orbs, so the trick is to cut across the others and make them crash into you. Leave the pink ring and you die too.

Hold to SURGE for speed, at the cost of shedding length. Every run earns pearls that raise your rank from Plankton to Leviathan and unlock new skins.`,
    controls: [["Mouse","steer toward the cursor"],["Hold click / Space / W / Up","SURGE (faster, sheds length)"],["A D / Left Right","turn"],["Touch","drag to steer, SURGE button"]],
    tips: "Never cross in front of a bigger snake. Surge to get ahead of a rival and curl across its path, then eat the orbs it bursts into.",
  },
  {
    slug: "paper-land", title: "PAPER LAND", how: 'mounted', port: 8419, url: "/",
    content: "Folded-paper tokens cut out territory on a sheet of paper; a token that is caught is snipped off the sheet. No violence, no flashing.",
    web: "paper-land/",
    tag: "Cut-paper territory", big: false, added: '2026-10-18',
    cat: "Strategy", tags: ["new","strategy","territory","io","paper","casual","3d","mobile"],
    blurb: "Leave your land, draw a paper strip and loop back home to cut out everything inside. Snip rivals' strips, and claim the target share of the sheet.",
    about: `A territory game made of cut paper. Your folded-paper token starts on a small sheet of your colour. Leave it and you draw a paper strip behind you; loop back home and everything inside the loop becomes yours. But while your strip is out, anyone who crosses it snips you off the sheet, and if you touch your own strip you tear.

Each level adds a rival, makes the rivals faster and sharper, and raises the share of the board you need to claim, from 20% to 60%. Clearing a level unlocks a new paper colour.`,
    controls: [["Mouse","your token steers toward the cursor"],["WASD / arrows","8-way steering"],["Touch","drag anywhere to steer"]],
    tips: "Take small, quick bites close to home: the longer your strip is out, the more chances a rival has to snip it. Cut a rival's strip while it is out to knock them off the sheet.",
  },
  {
    slug: "cube-merge", title: "CUBE MERGE", how: 'mounted', port: 8420, url: "/",
    content: "Number cubes made of glowing crystal merge and shatter into star shards. No characters and no violence. Bright sparkles but no screen flashing.",
    web: "cube-merge/",
    tag: "2048 cube snake", big: false, added: '2026-10-18',
    cat: "Puzzle", tags: ["new","puzzle","2048","merge","snake","numbers","3d","mobile"],
    blurb: "A 2048 snake made of crystal number cubes. Eat cubes, fuse equal numbers and bite smaller snakes to reach 128, 256, 512 and beyond.",
    about: `A number-cube snake brawl in a faceted crystal arena, mixing 2048 with a snake game. Your snake is a chain of numbered gem cubes. Eat loose cubes worth no more than your head, and equal values fuse into the next power of two, 2048-style.

Other cube snakes roam the arena too. Bite the tails off smaller snakes, ram smaller heads to shatter them, and keep away from bigger heads. Reach the level target (128, then 256, then 512 and so on) to level up; the rival snakes get bigger and meaner each time.`,
    controls: [["Mouse / touch drag","steer toward the pointer"],["A D / arrows","turn"],["Hold click / Space","dash"],["Touch","drag to steer, BOOST button to dash"]],
    tips: "Only eat cubes that help a merge: a tail in descending order (64, 32, 16...) fuses fastest. Check a rival's head value before you go near it.",
  },
  {
    slug: "getaway-flop", title: "GETAWAY FLOP", how: 'mounted', port: 8421, url: "/",
    content: "1930s rubber-hose cartoon crooks knock each other off rooftops with popguns, blunderbusses and cream pies, old-cartoon style. No blood. Old-film flicker and scratches throughout.",
    web: "getaway-flop/",
    tag: "Rubber-hose heist race", big: true, added: '2026-10-18',
    cat: "Action", tags: ["new","action","race","cartoon","1930s","2 player","3d","mobile"],
    blurb: "A wobbly 1930s cartoon heist race. Hop across the rooftops to the getaway car, grab popguns and cream pies, and knock the other crooks off.",
    about: `A wobbly rubber-hose heist race drawn like a 1930s cartoon, with bendy limbs, ink hatching, film grain and an iris wipe. Four crooks hop across the city rooftops to reach the getaway car, picking up popguns, blunderbusses and cream pies to knock each other off the roofs. The first to make three getaways wins the match.

Play the single-player campaign of heists against three bots, which get sharper and unlock hats as you go, or two players on one keyboard against two bots. Your body tilt steers each hop and your aim, and if you land too tilted you flop flat.`,
    controls: [["P1: A / D","hop left / right (tap again mid-air for a second hop)"],["P1: W / S / Space","fire"],["P2: Left / Right","hop"],["P2: Up / Down","fire"],["Esc","menu"],["Touch","on-screen hop buttons and BANG"]],
    tips: "Short, controlled hops beat big ones: a tilted landing makes you flop. Grab a weapon before the big gaps and use it on whoever is ahead.",
  },
  {
    slug: "block-world", title: "BLOCK WORLD", how: 'mounted', port: 8422, url: "/",
    content: "First-person block parkour in a painted sky; falling or touching lava just respawns you at the checkpoint with a soft warm screen flash. No violence.",
    web: "block-world/",
    tag: "Voxel parkour", big: true, added: '2026-10-18',
    cat: "Adventure", tags: ["new","adventure","parkour","voxel","blocks","build","3d","mobile"],
    blurb: "First-person voxel parkour in a painted sky. Jump, build your own blocks across gaps and reach the golden beacon in 12 courses, plus a sandbox.",
    about: `First-person parkour over block courses floating in a painted sky. Hop across gaps, balance along beams, bounce on pads, slide on ice, cross lava stepping stones and ride moving lifts to the golden beacon at the end of each course. Some gaps can only be crossed by building: you get a limited number of clay blocks per course to place and take back.

There are 12 courses with gold checkpoints and gems, stars for your time against par, and a sandbox build mode that unlocks after course 2.`,
    controls: [["WASD","move"],["Space","jump"],["Mouse","look (click to lock)"],["Shift","walk"],["Right click / F","build a clay block"],["Left click / Q","take a placed block back"],["R","respawn at the checkpoint"],["Esc / P","pause"],["M","mute"],["1-9 / wheel","pick a block in the sandbox"],["Touch","left stick, right side looks, JUMP / BUILD / TAKE buttons"]],
    tips: "Hold Shift to walk on narrow beams and ice. On build gaps, place a block, take back the one behind you, and you can cross with only a couple of blocks.",
  },
  {
    slug: "sky-climb", title: "SKY CLIMB", how: 'mounted', port: 8423, url: "/",
    content: "A calm, hazy platform climb up a floating tower of junk. Falling costs height, not lives. No violence and no flashing.",
    web: "sky-climb/",
    tag: "Dreamy junk tower climb", big: false, added: '2026-10-18',
    cat: "Adventure", tags: ["new","adventure","climb","platformer","parkour","dreamy","3d","mobile"],
    blurb: "Climb a giant floating tower of junk into a hazy, dreamy sky and ring the bell at the top. Falling costs height, not lives.",
    about: `A third-person climbing game up a huge tower of floating junk, into a soft, hazy sky. Jump between crates, pipes, laundry lines and books through six zones, and ring the Bell of Stillness at the very top. There are no lives: if you fall, you drop back down into the clouds, and you return to your pin or the start.

You get a pin to plant in each new zone, which saves your place. Sky shards hidden on the way are kept between climbs and unlock Scarf Glide and new scarf weaves.`,
    controls: [["WASD / arrows","move"],["Space","jump (hold for full height)"],["Shift","sprint"],["Mouse","look (click to lock)"],["Wheel","zoom"],["F","plant a pin"],["R","return to pin or start"],["M","mute"],["Touch","left half stick, right half look, jump and pin buttons"]],
    tips: "Plant your pin as soon as you reach solid ground in a new zone. Tap Space for short hops and hold it only for the big gaps.",
  },
  {
    slug: "golf-orbit", title: "GOLF ORBIT", how: 'mounted', port: 8424, url: "/",
    content: "A golf ball bounces across sunny tropical islands with palms and beach balls. No characters, no violence, no flashing.",
    web: "golf-orbit/",
    tag: "Island-hopping golf drive", big: false, added: '2026-10-18',
    cat: "Sport", tags: ["new","sport","golf","one button","upgrades","tropical","3d","mobile"],
    blurb: "Drive a golf ball across a chain of tiny resort-island planets. Lock the angle, lock the power, skip over the sea and upgrade your swing.",
    about: `A one-button golf drive across a chain of tiny resort islands that curve like little planets, in a sunny postcard style with palms, umbrellas, starfish and pool floaties. Tap once to lock the angle and again to lock the power, and hit the dashed sweet spot for a PERFECT shot.

The ball skips off the sea, slows in the sand and bounces hard off giant beach balls. Floaties give a boost, and starfish are coins you spend on upgrades. The run ends when the ball stops, stalls or sinks.`,
    controls: [["Tap / Space","lock the angle, then lock the power"],["Tap / Space in flight","fire the Pocket Rocket (once bought)"],["M","mute"]],
    tips: "Hit the dashed sweet spot for PERFECT (+15%). A low, fast angle skips off the sea better than a high lob.",
  },
  {
    slug: "time-shooter", title: "STILLSHOT", how: 'mounted', port: 8425, url: "/",
    content: "A first-person shooter in a white room against red crystal figures that shatter into shards when hit; no blood. One hit and you are out, and the level restarts. Muzzle flashes and a brief screen flash when you are hit.",
    web: "time-shooter/",
    tag: "Time moves when you move", big: true, added: '2026-10-18',
    cat: "Shooter", tags: ["new","shooter","fps","slow motion","puzzle","minimal","3d","mobile"],
    blurb: "Time moves only when you move. Step, aim and shoot your way through red crystal enemies in a stark white room, one frozen moment at a time.",
    about: `A first-person shooter where time only moves when you do. Stand still and the bullets hang in the air; walk and the world speeds up with you. Looking around lets time trickle forward, and firing gives it a short burst. The enemies are red crystal figures in a stark white room, and they shatter when hit.

One hit from an enemy and you are out. Levels are endless, with more enemies and waves as you go: melee runners from level 3, the SCATTER gun at level 4 and RAPID at level 7.`,
    controls: [["WASD","move (time flows)"],["Mouse","look (time trickles)"],["Click","shoot (a short burst of time)"],["Q / 1-3","switch weapon"],["R","retry"],["M","mute"],["Touch","left stick moves, drag the right side to look, FIRE and GUN buttons"]],
    tips: "Stop and look before every step: time is frozen while you stand still, so plan where every bullet is going. Step sideways out of a bullet's path rather than backwards.",
  },
  {
    slug: "subway-run", title: "SUBWAY RUN", how: 'mounted', port: 8426, url: "/",
    content: "A cartoon runner dodges trains and barriers in a graffiti train yard; a crash shows a BUSTED card, nobody is hurt. The screen flashes red on a crash and orange on a stumble.",
    web: "subway-run/",
    tag: "Graffiti train-yard runner", big: true, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","runner","endless","trains","graffiti","3d","mobile"],
    blurb: "An endless three-lane run through a graffiti train yard. Jump, roll and switch lanes past trains, run along the roofs and grab spray-can power-ups.",
    about: `An endless three-lane runner through a sunset train yard covered in graffiti, in a cel-shaded spray-paint style. Switch lanes, jump over low hurdles, roll under high bars and dodge trains, some of which come towards you sounding their horns. Ramps lead up onto the train roofs, where coins wait.

Spray-can power-ups give you MAGNET, SPRING KICKS for big jumps onto trains, and 2X SCORE. Complete three crew tags (missions) to rank up and raise your score multiplier, and bank coins to make power-ups last longer.`,
    controls: [["Left / Right / A / D","switch lane"],["Up / W / Space","jump"],["Down / S","roll (fast-drop in the air)"],["M","mute"],["Touch","swipe left, right, up or down; tap to jump"]],
    tips: "Clipping the side of a train only makes you stumble, but a second stumble within 3.5 seconds ends the run, so play safe right after one. Get up on the roofs when you can.",
  },
  {
    slug: "marble-roll", title: "MARBLE ROLL", how: 'mounted', port: 8427, url: "/",
    content: "A glass marble rolls along stone courses above the clouds; falling off returns it to the last checkpoint. No characters, no violence, no flashing.",
    web: "marble-roll/",
    tag: "Glass marble sky courses", big: false, added: '2026-10-18',
    cat: "Arcade", tags: ["new","arcade","marble","ball","balance","levels","3d","mobile"],
    blurb: "Roll a glass cat's-eye marble along polished-stone sky courses. Dodge sweepers and pushers, cross narrow beams and reach the swirl portal in 15 courses.",
    about: `Roll a glass cat's-eye marble along polished-stone courses floating above a sea of clouds. Hold to roll forward and drag to steer, across narrow beams, diagonal shifts, zigzags, drops and jump gaps, past sweepers, pushers and pillar walls, to the swirl portal at the finish.

There are 15 courses in four sky themes, Dawn, Noon, Sunset and Dusk. Checkpoint arches catch you when you fall, stars depend on how few falls you take, and gems buy six glass marbles.`,
    controls: [["Hold mouse / finger","roll forward"],["Drag sideways","steer"],["W / Up","roll"],["A D / Left Right","steer"],["S / Down","brake"],["R","restart"],["Esc","menu"],["M","mute"]],
    tips: "Brake before narrow beams and steer gently: the marble keeps its momentum. Wait for sweepers to pass, then roll through behind them.",
  },
  // ---- 2026-10-14 (later): RUSH HOUR ----
  {
    slug: "rush-hour", title: "RUSH HOUR", how: 'mounted', port: 8401, url: "/",
    content: "Blocky cartoon cars; a crash throws off block debris and sparks and nobody is shown hurt. The screen flashes red on every crash, roadwork arrow signs blink amber, and there is screen shake on crashes and near misses.",
    web: "rush-hour/",
    tag: "Traffic racer", big: true, added: '2026-10-14',
    cat: "Driving", tags: ["driving","racing","traffic","drift","highway","3d","mobile"],
    blurb: "Weave through traffic at 250 km/h down one 36 km road. Ten stages of hairpins, drifts and near misses against the clock.",
    about: `A blocky high-speed traffic racer with a high chase camera. The throttle is always on, and one connected 35.8 km road runs through ten stages and 138 corners, from wide sweepers to hairpin switchbacks. Every checkpoint arch adds time to the clock and rolls straight into the next stage, with the sky, weather and scenery changing as you go: trucks on Freight Line, roadworks in Cone Zone, oncoming traffic at sunset, rain in Storm Front and one lane each way through the canyon.

Shave past cars for NEAR MISS, CLOSE and INSANE bonuses, tap the brake mid-corner to drift for a DRIFT BOOST, and clip the inside of tight bends for an APEX. Chains build a combo of up to x10 and fill your nitro. A crash costs three seconds. Each stage awards up to three stars, and you can restart from any checkpoint you have reached.`,
    controls: [["A D / arrows","steer"],["S / Down","brake"],["Tap brake while steering, or X","drift"],["Space / Shift","nitro"],["R","retry from the checkpoint"],["Esc / P","pause"],["M","mute"],["Touch","hold the left or right side to steer, BRAKE, NITRO and II buttons"]],
    tips: "Speed is the danger, not steering: the car always makes the gap, but traffic bunches up in corners, so brake a touch before blind bends. Drift for at least 0.6 seconds for a DRIFT BOOST.",
  },
  // ---- NEWEST FIRST: eight from the 2026-10-14 batch ----
  {
    slug: "mirror-duel", title: "MIRROR DUEL", how: 'mounted', port: 8391, url: "/",
    content: "A cartoon fighting game between two glowing stick figures with no blood; a knocked-out fighter just falls over. Brief white screen flashes on hazard hits and knockouts, and screen shake.",
    web: "mirror-duel/",
    tag: "Fighting puzzle", big: false, added: '2026-10-14',
    cat: "Action", tags: ["fighting","puzzle","neon","2d","mobile"],
    blurb: "One controller, two fighters. Your opponent copies every move you make, flipped. Win by making the same move hurt them more.",
    about: `You control both fighters. Your cyan fighter gets your input, and the magenta MIRROR gets exactly the same input flipped left and right, so in an even room every punch would trade. Each of the eight neon arenas is lopsided on purpose: spikes on one side, a live electric wall, a conveyor belt, pits of different widths, lasers firing out of step, black ice, spiked ceilings.

Find where the same move costs the MIRROR more than it costs you, and launch it into its own hazards with a heavy. Some stages give the MIRROR a twist like LAG, TURBO or ARMOR. Best of three rounds, 45 seconds a round, up to three diamonds per stage.`,
    controls: [["A D / arrows","move (the MIRROR moves the other way)"],["W / Up / Space","jump"],["J / Z","punch"],["K / X","heavy (launches)"],["R","retry"],["Esc","menu"],["M","mute"],["Touch","arrow buttons, JUMP / PUNCH / HEAVY"]],
    tips: "Read the hint at the top of each stage. Hazards decide fights, not fists: line up a heavy so the MIRROR flies into the spikes, laser or electric wall while you stay safe.",
  },
  {
    slug: "bubble-trouble", title: "BUBBLE TROUBLE", how: 'mounted', port: 8394, url: "/",
    content: "A bright cartoon platformer with candy enemies that pop into confetti. No blood. No full-screen flashes; the boss turns white for a moment when hit.",
    web: "bubble-trouble/",
    tag: "Platformer", big: false, added: '2026-10-14',
    cat: "Arcade", tags: ["platformer","cute","boss","2d","mobile"],
    blurb: "A bubble-gum blob bouncing through a candy city. Blow up to float, slam to smash, stick to walls and enemies.",
    about: `Roll a bouncy bubble-gum blob through five levels of a bright candy city and then take on the Sour King. Hold jump in the air to blow yourself into a bubble and float, slam down to smash gum crates, and stick to walls to climb them. Stomp an enemy and it is wrapped in gum: harmless for a few seconds, a trampoline, and ready to be slammed for extra candy.

Each level hides golden gumballs under crates and up high, and the end card gives a GOLD, SILVER or BRONZE time medal. The Sour King hops, charges and spits; wait until he crashes into a wall and goes dizzy, then land on him.`,
    controls: [["A D / arrows","roll"],["Space / W / Up / Z","jump"],["Hold jump in the air","blow a bubble and float"],["S / Down / X in the air","slam"],["Hold toward a wall","stick, jump to climb"],["R","restart level"],["P / Esc","pause"],["M","mute"],["Touch","arrow buttons, JUMP / SLAM, II to pause"]],
    tips: "Floating drains the gum bar in about two and a half seconds and it refills when you land. Only hit the Sour King while he is dizzy or spitting; a slam does double damage.",
  },
  {
    slug: "pizza-panic", title: "PIZZA PANIC", how: 'mounted', port: 8395, url: "/",
    content: "Cartoon traffic and scooters bump into each other; the worst that happens is a pizza splatting on the road. Screen shake and confetti, no flashing lights.",
    web: "pizza-panic/",
    tag: "Delivery", big: false, added: '2026-10-14',
    cat: "Driving", tags: ["driving","delivery","arcade","top-down","upgrades","mobile"],
    blurb: "Drift a scooter through busy city traffic and throw hot pizzas at glowing doors before the shift clock runs out.",
    about: `You ride a pizza scooter through a busy top-down city with 80 seconds on the clock. Grab three pizzas at the shop, weave through traffic and throw them at the glowing doors as you pass; every delivery buys five more seconds. Pizzas cool as you ride, so hot ones tip best, and near misses, long drifts and long-range throws chain into a combo worth up to triple pay.

From Shift 2 rival RAT scooters hunt you to ram pizzas off your rack, unless you boost into them first for a takedown. Everything you earn goes in the bank, win or lose, to spend between shifts on a faster engine, a bigger nitro tank, a thermal bag, a bigger rack and a stronger pitching arm.`,
    controls: [["WASD / arrows","drive"],["Space","drift (handbrake)"],["Shift","boost"],["Click","throw a pizza (snaps to nearby order doors)"],["E","throw at the nearest order"],["P / Esc","pause"],["M","mute"],["Touch","left thumb steers, tap the right side to throw, DRIFT and BOOST buttons"]],
    tips: "Hug cars for NEAR MISS cash and boost, drift to refill boost, and throw from the edge of your range for a LONG SHOT worth x1.5. When a rival flashes a red !, boost into it first for a TAKEDOWN.",
  },
  {
    slug: "toy-soldier-blitz", title: "TOY SOLDIER BLITZ", how: 'mounted', port: 8396, url: "/",
    content: "A toy-soldier shooter with no blood: plastic army men topple over and come back a few seconds later. Muzzle flashes, bright flashes from firecracker explosions and a red glow at the screen edges when hit. Online play is a direct connection to one friend by room code, with no chat.",
    web: "toy-soldier-blitz/",
    tag: "Build & fight", big: true, added: '2026-10-14',
    cat: "Shooter", tags: ["shooter","third-person","building","3d","online","multiplayer","bots","mobile"],
    blurb: "Build a fort out of wooden blocks and dominoes, then fight over it as a plastic army man in a kid's bedroom.",
    about: `You are a little green plastic army man at war with the tan army across a kid's bedroom. Every battle starts with a timed build phase: both sides spend a points budget on wooden alphabet blocks, domino walls, staircases, ramps and ruler bridges on their own half. Then the fight starts, and every piece can be shot to splinters or blown apart with firecrackers, bringing down anything stacked on top.

Play Team KO, King of the Hill or a one-on-one Duel across four maps: the rug, a pillow fort on the bed, a bathtub beach and a desk. Eight operations earn stars and XP through eight ranks from Private to General, each adding build points and unlocking new pieces. Quick Battle against bots of three skill levels, or host an online room and send the code to a friend.`,
    controls: [["Click / right-click","place / remove a piece (build)"],["1-5","pick a piece"],["R (Q, E)","rotate"],["Z","undo"],["F","auto-build"],["Enter","ready"],["WASD + mouse","move and look (click to lock the mouse)"],["Left / right mouse","fire / aim"],["Space / Shift","jump / sprint"],["G","firecracker"],["R","reload (fight)"],["M","mute"],["Touch","tap to build; left stick to move, drag right side to look, FIRE / AIM / JUMP / BANG / R buttons"]],
    tips: "Headshots do more than double damage, so aim high. Save a firecracker for the enemy tower: anything resting on a broken piece falls with it.",
  },
  {
    slug: "ski-mountain", title: "SKI MOUNTAIN", how: 'mounted', port: 8397, url: "/",
    content: "Skiing and snowboarding with cartoon wipeouts and no injuries shown. The screen shakes on crashes and there are fast-moving speed lines at high speed, but no flashing lights.",
    web: "ski-mountain/",
    tag: "Endless ski", big: true, added: '2026-10-14',
    cat: "Sport", tags: ["ski","snowboard","tricks","endless","winter","3d","mobile"],
    blurb: "One endless, ever-faster downhill. Weave the trees, hit the kickers, spin and flip with the mouse, and see how far you get on three lives.",
    about: `Drop into a snowy valley that never ends. Weave through walls of trees, rock bands, fallen logs, snow fences, parked snowcats and huts, and there is always a gap if you can find it. Hit kicker after kicker, grind rails and logs, and spin and flip with the mouse, then land straight to bank the combo.

The further you go, the faster you fly: the valley winds tighter, the gaps get narrower and the speed keeps climbing past 200 km/h. Swap between skis and a snowboard at any moment with the scroll wheel, even in mid-air. Sixteen challenges unlock five more outfits, and your best score, furthest distance and top speed are saved.`,
    controls: [["A / D, arrows or mouse","steer"],["W / S","tuck / brake"],["Hold Space or click, release","jump"],["Mouse in the air","spin and flip"],["Shift / E / right click","grab"],["Scroll wheel","swap skis and snowboard"],["A / D in the air","bend your flight"],["Enter","go again"],["R","restart"],["Esc","home screen"],["M","mute"],["Touch","left half steers, right half jumps and spins, GRAB button, tap the gear chip to swap"]],
    tips: "Tricks only count after two seconds back on the snow, so land clean and ride it out. Distance pays more the further you get, so staying alive often beats one risky spin.",
  },
  {
    slug: "dodgeball-dash", title: "DODGEBALL DASH", how: 'mounted', port: 8398, url: "/",
    content: "Cartoon gym dodgeball: players who are hit simply walk to the bench. A short red tint fills the screen when you go out and a short yellow tint on a catch, with screen shake on hits.",
    web: "dodgeball-dash/",
    tag: "Dodgeball", big: false, added: '2026-10-14',
    cat: "Sport", tags: ["dodgeball","team","arcade","bots","2d","mobile"],
    blurb: "3v3 arcade dodgeball. Charge and curve your throws, catch one to bring a teammate back, and climb an eight-team ladder.",
    about: `Top-down 3 against 3 dodgeball in a packed school gym. Three balls sit on the centre line at the start of every round, so each one opens with a rush. Hold to charge a throw and let go to fire, bend it around a dodger with a curve, or catch an incoming ball to put the thrower out and bring your first teammate back off the bench. Holding a ball? The catch button blocks instead.

Rounds last 60 seconds and the first team to three wins the match. Climb a ladder of eight teams, from the REC ROOM ROOKIES to THE CHAMPS, each quicker to react, aim, catch and dodge, and earn up to three stars against each.`,
    controls: [["WASD / arrows","move"],["Hold click or J, release","charge and throw at the mouse"],["Q / E or swipe while charging","curve the throw"],["Space / right click / K","catch (block if holding a ball)"],["Shift / L","dash"],["P / Esc","pause"],["M","mute"],["Touch","left thumb stick, hold THROW and release (drag sideways to curve), CATCH and DASH buttons"]],
    tips: "A ball goes dead the moment it bounces, so charge your throws or they drop short. Press catch just before the ball arrives, not early: mashing it leaves you open.",
  },
  {
    slug: "roof-run", title: "ROOF RUN", how: 'mounted', port: 8399, url: "/",
    content: "A cartoon rooftop runner with no violence: if you crash, your runner tumbles off the roof and you start again. Screen shake on crashes and glass smashes, but no flashing lights.",
    web: "roof-run/",
    tag: "Runner", big: false, added: '2026-10-14',
    cat: "Arcade", tags: ["runner","one-button","endless","parkour","mobile"],
    blurb: "Jump the gaps, slide under the neon signs and smash through glass towers as a sunset city speeds up beneath you.",
    about: `One button, one runner, one endless skyline. Tap to jump the gaps and hop the rooftop boxes, hold to slide under hanging neon signs, and run straight through the lit office floors of glass towers for a burst of speed and a shower of shards. The run keeps getting faster, and the sky turns from golden hour to dusk to neon night as you go.

Every clean move feeds a combo that doubles and then triples your coins, and the coins you bank unlock four more runners: KITE jumps higher, SPARK pulls coins in like a magnet, GHOST can double jump, and NOVA makes every coin count double.`,
    controls: [["Tap / Space / click","jump"],["Hold","slide (in the air: drop fast)"],["Up / W","instant jump"],["Down / S / Shift","instant slide"],["P / Esc","pause"],["M","mute"],["Touch","tap to jump, hold to slide"]],
    tips: "Hold in the air to drop fast and land already sliding under a sign. Keep the combo alive: a new move every 3.2 seconds, and at 10 your coins count double.",
  },
  {
    slug: "firework-frenzy", title: "FIREWORK FRENZY", how: 'mounted', port: 8400, url: "/",
    content: "A pixel-art arcade game about steering a firework rocket. No violence; a crash is a burst of sparks. The screen flashes briefly and faintly on firework bursts, and more strongly on shape bonuses, crashes and level clears.",
    web: "firework-frenzy/",
    tag: "Flying", big: false, added: '2026-10-14',
    cat: "Arcade", tags: ["pixel","flying","physics","levels","mobile"],
    blurb: "Steer a firework rocket through a night city: fly the rings, light the fireworks and set off chain reactions before your fuel runs out.",
    about: `You are a firework rocket over a pixel city at night. Your flame only pushes you the way your nose points and gravity never lets go, so every flight is a wild, swooping arc. Fly through the rings, touch or flame the fireworks to light them, and watch one burst set off the next in a chain worth more with every pop. Burst a whole heart, star or circle for a big shape bonus.

Ten levels teach one idea each, from CHAIN REACTION to LIVE WIRES and BIRD SEASON, up to a GRAND FINALE. Earn up to three stars on each by bursting everything and saving fuel, land gently on roofs to steady yourself, then take on ENDLESS mode as the city keeps on growing.`,
    controls: [["Left / Right or A / D","turn"],["Hold Space / Up / W","thrust (each fresh press kicks)"],["R","retry"],["P / Esc","pause"],["M","mute"],["Touch","< > buttons on the left to turn, hold the right half to fire"]],
    tips: "Fly in short bursts: fuel is seconds of thrust. Light the edge of a cluster and let the chain spread, and set down softly on a roof when you lose control.",
  },
  // ---- NEWEST FIRST: six from the 2026-10-12/13 category-fill batch ----
  {
    slug: "pursued", title: "PURSUED", how: 'mounted', port: 8378, url: "/",
    content: "First-person horror chase. A tall, pale, eyeless monster chases you through dark rainy streets, with screams, jump scares and a grab when it catches you; no blood or gore. Lightning flashes light the sky now and then, the screen edge glows and pulses red when it is close, there is a red flash when it cuts you off, and a brief bright flash when it catches you.",
    web: "pursued/",
    tag: "Chase", big: true, added: '2026-10-13',
    cat: "Horror", tags: ["horror","chase","monster","first person","parkour","rain","3d","mobile"],
    blurb: "Night, rain, and something tall and wrong right behind you. Vault fences, slam doors, knock bins into its path and run.",
    about: `It is night, it is raining, and something about 2.7 metres tall, pale and eyeless has just burst out of the dark behind you. You run. Fences, cars and dumpsters are vaulted automatically, you slide under half-shut gates, slam doors behind you and shove bins, trolleys and shelves over into its path.

It hunts by sight and by sound through the same alleys, backyards and walk-through apartment buildings you do. Break its line of sight and keep quiet and it loses you and searches; get careless and it comes out of a side street ahead of you. It grows faster the longer you last. Score is time survived plus distance run, and your best is kept.`,
    controls: [["W A S D / arrows","run"],["Mouse","look"],["Shift","sprint"],["Run at fences","auto vault"],["Space","jump / vault"],["Ctrl / C","slide · hold to crouch"],["E / F","open · slam door"],["Left click","shove things over"],["Q / middle mouse","look back"],["P","pause"],["M","sound on / off"],["R / Space","run again"],["Touch","left thumb to run (rim = sprint), right thumb to look, on-screen buttons"]],
    tips: "Never stand still, and break its line of sight before you slow down: out of view and quiet, it loses you and searches. Slam a door or knock a bin into its path to buy a second.",
  },
  {
    slug: "deep-dive", title: "DEEP DIVE", how: 'mounted', port: 8379, url: "/",
    content: "Cartoon pixel-art sea rescue. Sharks bite, jellyfish sting and eels zap the diver, which costs oxygen; there is no blood. Survivors can be lost if they run out of air (shown with a burst of bubbles and a message) and the diver can black out. Taking a hit gives a faint red screen tint and a small screen shake.",
    web: "deep-dive/",
    tag: "Rescue", big: true, added: '2026-10-13',
    cat: "Adventure", tags: ["diving","rescue","underwater","pixel","upgrades","endless","mobile"],
    blurb: "A ship is going down with people trapped inside. Swim into the wreck, hook them onto your air line and tow them out before anyone's air runs out.",
    about: `Every mission a ship is sinking, and its passengers are trapped in air pockets in the flooded rooms. You are the rescue diver: find a hole in the hull, crank hatches open, cut through debris, clip your spare air line onto each survivor and tow them out to the rescue bell or the surface. Your tank drains the whole time, each pocket's air runs low as the wreck tilts and sinks, and a survivor whose room floods can only hold their breath for nine seconds.

There are 24 missions across fishing boats, ferries, cargo ships, cruise liners, submarines and oil rigs, with sharks, jellyfish, electric eels, fires, sliding cargo and collapsing ceilings. Coins and stars buy a bigger tank, faster fins, a flashlight, a cutter, sonar and a rescue sled. Mayday mode sends ship after ship down until you black out or lose three people.`,
    controls: [["W A S D / Arrows","swim"],["Shift / K","kick (tap) or sprint (hold)"],["E / Space / J (hold)","air line, open hatch, cut debris"],["Q / L","sonar ping (needs the upgrade)"],["P / Esc","pause"],["M","mute"],["R","restart"],["Touch","drag on the left half to swim; KICK, ACT and PING buttons"]],
    tips: "Follow the arrows: yellow WAY IN points to the nearest hole in the hull, and while you tow someone inside a wreck the green EXIT pointer traces the real route back to the bell. Holding the kick to sprint burns more than twice the oxygen, so tap it instead.",
  },
  {
    slug: "sky-aces", title: "SKY ACES", how: 'mounted', port: 8380, url: "/",
    content: "Cartoon plane dogfights: planes are shot down in fireballs with smoke and falling wreckage, no people are shown hurt. Bright explosion and muzzle flashes, a red flash at the screen edges when you are hit, screen shake, and the screen briefly turns white when you fly through a cloud.",
    web: "sky-aces/",
    tag: "Dogfight", big: true, added: '2026-10-13',
    cat: "Shooter", tags: ["planes","dogfight","airships","3d","upgrades","online","mobile"],
    blurb: "Arcade dogfights in a bright cartoon sky. Shoot down raiders, aces, bombers and armoured airships, then spend the money on faster planes.",
    about: `You are a little pilot in goggles and a flapping scarf, flying an open-cockpit biplane over a sea of islands. Point with the mouse and the plane follows; lead your shots, lock missiles, boost, and barrel roll to shake a missile on your tail. Enemy pilots line up real shots, climb away when they are slow, break hard when you sit on their six and fly with wingmen.

Ten campaign missions run from three rookie raiders to bomber raids on the harbour, a duel with the Red Baroness, armoured airships with gun turrets and the raider flagship, the Leviathan. Endless waves keep coming until you fall, and online lets up to eight planes fight free-for-all or in two teams with bots filling the gaps. Money buys five planes, from the Sparrow biplane to the Comet jet, each with seven upgrade tracks.`,
    controls: [["Mouse","aim (click to lock the mouse)"],["W A S D","fly directly: S up, W down, A/D roll"],["Left click / Space","guns"],["Right click / F","missile"],["Shift","boost"],["Q / E","barrel roll"],["C","look back"],["Tab","scores (online)"],["Esc","pause"],["M","mute"],["Touch","left thumb steers, FIRE / BOOST / MSL / ROLL buttons"]],
    tips: "Aim at the small lead marker ahead of the enemy, not the plane itself: bullets take time to fly. When the missile warning beeps, barrel roll as it closes in to shake it off.",
  },
  {
    slug: "auto-arena", title: "AUTO ARENA", how: 'mounted', port: 8381, url: "/",
    content: "Cartoon animals and monsters fight with swords, arrows and spells in a painted arena. Beaten units burst into an ink splat; there is no blood. Units flash white for a moment when hit, and big spells and lost fights give a small screen shake.",
    web: "auto-arena/",
    tag: "Auto-battler", big: false, added: '2026-10-13',
    cat: "Strategy", tags: ["auto battler","strategy","shop","merge","ranked","daily","mobile"],
    blurb: "Buy ink-and-watercolour fighters, merge three into a star, then watch them battle on their own. Ten trophies before six hearts run out.",
    about: `Each round you shop, then fight. Spend gold on little fighters, from a mouse knight in a thimble helmet to a dragon made of ink, and arrange them on a two-row board: tanks in front, archers and mages behind. Press FIGHT and the battle plays itself: your units walk in, attack and cast their abilities when their mana fills. Win and you take a trophy; lose and you lose a heart. Ten trophies before your six hearts run out wins the run.

There are 34 units with their own abilities, 10 traits that switch on when you field matching units, and 10 items offered as treasure every few rounds. Three copies of a unit merge into a stronger star-two, and three of those into a star-three. Seven computer rivals with their own plans shop and level just like you, a ranked ladder climbs from Paper to Masterwork, and a Daily run gives everyone the same shops.`,
    controls: [["Click / drag","buy a card, move units between board and bench"],["Drag to shop / right click / E","sell"],["D","reroll the shop"],["F","buy XP"],["L","lock the shop"],["Space / Enter","fight · change fight speed · play again"],["1 2 3","pick a treasure item"],["M","mute"],["Esc","menu"],["Touch","tap to buy, drag to move or sell, on-screen buttons"]],
    tips: "Hold gold when you can: every 10 gold you keep pays 1 extra a round, up to 5. And look at the faded board in the top half while you shop - that is your next rival, so you can set up against it.",
  },
  {
    slug: "tiny-knight", title: "TINY KNIGHT", how: 'mounted', port: 8382, url: "/",
    content: "Cartoon sword fighting against cute pixel monsters (slimes, zombies, skeletons, bats, shadow creatures) that pop into particles when beaten, with no blood. Enemies flash white when hit, a short white screen flash on every level-up, a red glow at the screen edges when you are hurt, red danger circles and lines on the ground, and screen shake on big hits.",
    web: "tiny-knight/",
    tag: "Action RPG", big: true, added: '2026-10-13',
    cat: "Adventure", tags: ["pixel","crafting","action rpg","knight","boss","island","mobile"],
    blurb: "Chop, mine and craft your way up from bare fists to the Shadowbane, then pay to build the bridge to the Shadow King's castle.",
    about: `You are a tiny knight on a big island. In the middle, a castle sits on a lake, swallowed by shadow, and the only way across is a bridge that Foreman Bram builds in five stages, if you can pay for them. Chop trees and mine rock and iron, craft better swords, axes, pickaxes, shields, armour and a bow at the workbench, and push out through the Meadow, Whisperwood, the Pebble Hills and the Hollow Graves, where night brings out zombies and bats.

Every hit lands with a flash, knockback and a bit of hit-stop, and every dangerous enemy attack is shown before it comes, so a well-timed dodge roll gets you through. Level up, loot fourteen chests and sell spare loot in Oakhaven, then cross the bridge, beat the three Shadow Sentinels and face Umbra, the Shadow King, in a three-phase fight. Win and the island stays open for free play.`,
    controls: [["W A S D / arrows","move"],["J / Z / left click","attack (hold to combo)"],["K / Space / X / right click","dodge roll"],["E","chop, mine (hold) · open · talk · craft"],["L / F","shoot bow"],["Q / H","potion"],["I / Tab / B","bag"],["M","map"],["Esc / P","pause"],["N","mute"],["Touch","left stick, attack / roll / E / bow / potion buttons"]],
    tips: "Every dangerous attack is shown first as a flash, a \"!\", a red circle or a red line. Roll through it rather than away: you cannot be hurt mid-roll. After Umbra's charge he is stunned and takes 1.6 times damage.",
  },
  {
    slug: "the-mark", title: "THE MARK", how: 'mounted', port: 8383, url: "/",
    content: "A sniper game with no blood: stylised figures simply fall down when hit. A short white screen flash on every shot, and a red and blue flashing siren light for a few seconds on some missions.",
    web: "the-mark/",
    tag: "Sniper", big: true, added: '2026-10-13',
    cat: "Shooter", tags: ["sniper","deduction","puzzle","crowd","3d","mobile"],
    blurb: "One person in the crowd below is an enemy agent. Read the clues, watch for the tell, and take one clean shot.",
    about: `You lie on a rooftop with a scoped rifle above a busy crowd, and one of the people down there is THE MARK, an enemy agent trying to blend in. A target profile gives you two clues, and over the next few minutes your radio adds more: what they wear, which bag they carry, which hand they hold things in, and habits you have to watch for, like checking a wristwatch, glancing at the security cameras or steering clear of the police. A siren, a dropped parcel or a bag swap can give them away.

You have three rounds. Hit the wrong person and the crowd panics while the mark runs for an exit. The mark and the clues are picked fresh every play, across sixteen missions in a market, a train station, a harbour, a festival and a rooftop party, from morning to rainy night.`,
    controls: [["Click, then mouse","aim"],["Right mouse / Q","scope"],["Wheel / 1 2 3","zoom 3x · 6x · 10x"],["Shift (hold)","hold breath"],["Left click / Space / F","fire"],["E / middle click","tag a suspect"],["Tab","fold the intel panel"],["R","restart"],["P","pause"],["M","mute"],["Touch","drag to aim, pinch to zoom, SCOPE / HOLD BREATH / TAG / FIRE buttons"]],
    tips: "Wait for the last piece of intel: the full set always points at exactly one person. Tag anyone who fits early with E so you only re-check them when the radio speaks.",
  },
  // ---- NEWEST FIRST: three from the 2026-10-12 session ----
  {
    slug: "chibi-clash", title: "CHIBI CLASH", how: 'mounted', port: 8375, url: "/",
    content: "Cute cartoon pixel monsters fight with fire, leaves, water and lightning. Beaten monsters just faint with a \"K.O.!\", with no blood. Monsters flash white when hit and blink white while winding up a big attack, danger circles on the ground flicker red and white, the screen edge flashes red when you are hit, and hatching an egg or evolving ends in a quick white flash.",
    web: "chibi-clash/",
    tag: "Action", big: false, added: '2026-10-11',
    cat: "Adventure", tags: ["monsters","pixel","collect","eggs","evolve","boss","mobile"],
    blurb: "Hatch chibi monsters from eggs, then fight wild ones in real time with WASD and three abilities.",
    about: `Pick a free starter, Pipkin, Sproutle or Bubbit, and take it into a field arena to fight wild monsters in real time. You move with WASD, aim with the mouse, fire three abilities on J, K and L, and dodge with Space. A red circle on the ground means an attack is about to land there, and a red ! over a foe means a big one is coming. Wins pay coins and XP: coins buy eggs in the shop, and XP levels your monster, teaches it new moves and evolves it into a bigger form.

There are 67 species, each with an evolved form, across 10 types and 63 moves. Five zones each have three fights and a boss that turns ENRAGED at half health, the last one the dragon Eclipsidon. After that the Endless Arena throws waves at you forever, with a boss every fifth wave. Eggs cost 100 coins, or 900 for ten, and the rarity chances are shown in the shop. Coins are only ever won in the game.`,
    controls: [["W A S D / arrows","move"],["Mouse","aim"],["J K L / 1 2 3","abilities (hold to repeat)"],["Left click","ability 1"],["Space / Shift","dodge"],["Esc / P","pause"],["M","sound on / off"],["Touch","drag on the left half to move, round buttons to attack and dodge"]],
    tips: "Use your monster's own type: its own-type moves do 15% more, and a hit on the type it beats does half as much again. Evolve at level 5 before you take on the zone 2 boss.",
  },
  {
    slug: "spelldelve", title: "SPELLDELVE", how: 'mounted', port: 8376, url: "/",
    content: "Fantasy spell combat against cartoon monsters (slimes, skeletons, bats, ghosts, spiders) that dissolve away when they die, with no blood. Explosions light up the room, and the screen edges flash and pulse red when you are hurt or low on health.",
    web: "spelldelve/",
    tag: "Roguelite", big: true, added: '2026-10-11',
    cat: "Adventure", tags: ["wizard","roguelite","dungeon","spells","bosses","3d","mobile"],
    blurb: "A wizard, a spellbook and ten floors of dungeon. Read every spellbook you find and build a run that melts the Hollow Crown.",
    about: `You are a wizard working down through nine floors of dungeon to a throne room at the bottom. Each floor is generated fresh: rooms seal shut when you walk in and only open when every monster is dead, and most attacks are drawn on the floor first as a red shape, so you get the chance to dodge. Slimes split, goblins charge, skeleton archers aim, ghosts teleport and fire homing orbs, knights hide behind shields and spiders leap at you.

There are fifteen spells to learn from spellbooks, from Fireball and Chain Lightning to Meteor, Gravity Well and Blade Orbit, and every level-up and tome makes one stronger. Thirteen relics change how a run plays. Bosses wait on floors 3, 6 and 9 and in the throne room. When you fall, the gold you carried is banked in the Sanctum for upgrades that help the next run.`,
    controls: [["W A S D","move"],["Mouse","aim"],["Left click","primary spell"],["Right click / Q / E / R","equipped spells"],["Space / Shift","dodge"],["Tab / G","grimoire (equip spells)"],["Esc / P","pause"],["M","mute"],["Touch","left half to move, right buttons to cast (auto-aim)"]],
    tips: "Watch the floor, not the monster: charges, leaps, arrows and boss attacks are drawn in red first, and the edge turns pale gold just before it lands. Dodge through it, since the dodge makes you briefly untouchable.",
  },
  {
    slug: "frontline", title: "FRONTLINE", how: 'mounted', port: 8377, url: "/",
    content: "A war shooter with guns, grenades and explosions against simple low-poly soldiers. Hits show a small red puff and soldiers tumble when they fall; no gore. Muzzle flashes and explosion flashes.",
    web: "frontline/",
    tag: "FPS", big: true, added: '2026-10-12',
    cat: "Shooter", tags: ["fps","squad","ai","low poly","3d","armory","war"],
    blurb: "A low-poly squad shooter against soldiers who take cover, flank, suppress, throw grenades and call out your position.",
    about: `Eight against eight across three capture points, with every other soldier on the field run by an AI that fights the way you do. Enemies hide behind cover and peek to shoot, pin you down with suppressing fire, send a flanker round the side, put a marksman on the bell tower, throw grenades when you camp, and revive each other. Spot one and he radios your position to his whole squad.

Three battlefields - a war-torn village at dusk, a desert outpost with trenches, and a forest river with bridges - plus Skirmish, ten waves of hunters against you alone, and a mode where you just watch the AI fight with its thinking shown on screen. Nine guns and a knife, four attachments that change the model and the stats, and an Armory where credits from kills, captures, revives and wins buy your next gun.`,
    controls: [["W A S D","move"],["Mouse","look"],["Left click","fire"],["Right click","aim down sights"],["R","reload"],["Shift","sprint"],["C / Ctrl","crouch"],["Space","jump"],["G","grenade"],["1-4 / wheel","switch weapon"],["E","pick up · resupply · hold to revive"],["Tab","scores"],["Esc","pause"],["Touch","left stick, drag right to look, on-screen buttons"]],
    tips: "Move after every fight: whoever spotted you has already radioed your position, and his squad will come and search that exact spot for the next 22 seconds.",
  },
  // ---- NEWEST FIRST: fifteen from the 2026-10-11 game batch ----
  {
    slug: "curveball", title: "CURVEBALL", how: 'mounted', port: 8360, url: "/",
    content: "Football free kicks in a floodlit stadium with cartoon players. Nobody gets hurt: the keeper dives and the wall jumps. A short bright glow appears when the ball is kicked and when it hits the post, keeper, wall or net. Small camera flashes twinkle in the crowd the whole time, and there are many more after a goal.",
    web: "curveball/",
    tag: "Sport", big: false, added: '2026-10-11',
    cat: "Sport", tags: ["football","free kick","swipe","curl","3d","one touch","mobile"],
    blurb: "Swipe from the ball to bend free kicks round the wall, past a diving keeper and into the top corner.",
    about: `A free-kick game in a floodlit 3D stadium, played with one swipe. Swipe up from the ball. The direction picks left or right, the length picks the height, the speed sets the power from 16 to 34 metres per second, and bending the swipe curls the ball the same way. The wall jumps, the keeper dives, and a goal brings confetti, a bulging net and a roar from the crowd. A goal is worth 100, with bonuses on top: rings in the goal, TOP BINS, CURLER, ROCKET, OFF THE POST and UNDER THE WALL.

There are thirty challenges of three to five balls each, with three stars on every one. They start with an empty net, then add a keeper, curl, walls, wide angles, small targets, wind, sliding walls and a dancing keeper, ending with The Final. Sudden Death is endless and one miss ends it. Every goal moves the ball further out and makes the wall and keeper tougher, and goals in a row build a streak multiplier.`,
    controls: [["Swipe up from the ball","shoot (direction = aim, length = height, speed = power)"],["Bend the swipe","curl the ball"],["Tap","skip to the next ball"],["R","retry"],["Esc / P","pause"],["M","sound on/off"],["Enter / Space","continue on the results screen"],["Touch","swipe with your thumb"]],
    tips: "The keeper cannot read curl or wind, so a shot that bends late into the far corner beats even the best keeper in the game.",
  },
  {
    slug: "helix-drop", title: "HELIX DROP", how: 'mounted', port: 8361, url: "/",
    content: "A bouncing ball and a tower of candy rings. Nobody gets hurt: the ball just goes splat in paint. The screen brightens briefly when the fireball smashes a ring and when a level is cleared.",
    web: "helix-drop/",
    tag: "Arcade", big: false, added: '2026-10-11',
    cat: "Arcade", tags: ["one finger","tower","fireball","3d","endless","mobile","casual"],
    blurb: "Spin the candy tower, drop the ball through the gaps and stay off the red. Fall three rings in a row and you smash the next one.",
    about: `A ball bounces on top of a tall tower of candy rings and never moves sideways. You drag to spin the tower, and the tower follows your finger exactly, so you line a gap up underneath the ball and it drops to the next ring. Coloured parts are safe to bounce on, red ones splat you and restart the level. Fall through three rings without a bounce and the ball catches fire: the next ring it touches shatters, red or not, and a smash is worth double.

Levels are built from fixed seeds, so every player gets the same towers. They start at 11 rings and grow to 40, with fewer and narrower gaps, more red and, from level 5, rings that turn by themselves; the colour theme changes every level and the next one starts on its own. Endless is one random tower that never stops, getting harder the deeper you fall, with its own best score.`,
    controls: [["Drag left / right","spin the tower"],["Left / Right or A / D","spin the tower"],["Space / Enter","play · retry · next level"],["Tap","retry after a splat"],["R","restart the level"],["Esc / P","pause"],["M","mute"]],
    tips: "Once the ball is on fire you do not need a gap at all: if the next gap is a long way round, let the ball hit the ring and smash it for double points.",
  },
  {
    slug: "axe-throw", title: "AXE THROW", how: 'mounted', port: 8362, url: "/",
    content: "Cartoon axes thrown into wooden logs, which burst into pieces; boss logs have angry carved faces. Nobody is hurt and there are no scares.",
    web: "axe-throw/",
    tag: "Arcade", big: false, added: '2026-10-11',
    cat: "Arcade", tags: ["one touch","axes","timing","endless","bosses","mobile"],
    blurb: "Tap to throw axes into a spinning log. Hit an axe that is already stuck and the run is over.",
    about: `A log spins at the top of the screen and your axe waits at the bottom. Tap and it flies up and sticks. Land every axe the log needs and it splits apart with a TIMBER!, but every axe you land keeps turning with the log, and hitting one that is already stuck is a CLANG! that ends the run. Logs speed up, slow down, flip and whip about, and from stage 3 some arrive with old rusty axes already in them.

Every fifth stage is a boss log with a carved angry face: Old Gnarl, Iron Bark, Frost Stump, Ember Heart, Moss Titan and Golden Burl, and after stage 30 they come round again faster. Quick throws build a SWIFT combo worth double points, a near miss scores a CLOSE! bonus, and slicing the apples on the rim earns coins for 13 axes, six of them trophies from beating each boss.`,
    controls: [["Click / tap","throw"],["Space / Enter / Up / W","throw"],["R","restart the run"],["Esc / P","pause"],["M","sound on / off"],["Touch: tap","throw"]],
    tips: "Throw your first few axes in quick succession while the log is empty: from SWIFT x3 every axe scores 2, then slow down and wait for the gaps once the log fills up.",
  },
  {
    slug: "car-soccer", title: "TURBO GOAL", how: 'mounted', port: 8363, url: "/",
    content: "Cartoon cars play football with a giant ball. Cars can be rammed and blown up (demolished) and come straight back; nobody is shown hurt. Every goal sets off a big explosion with a bright coloured flash.",
    web: "car-soccer/",
    tag: "Sport", big: false, added: '2026-10-11',
    cat: "Sport", tags: ["football","cars","boost","2 players","bots","versus","mobile"],
    blurb: "Rocket-car football from the side: boost, double jump and flip into a giant ball to smash it into the net.",
    about: `Two cars, one huge glowing ball and two minutes on the clock. You drive the blue car and attack the orange goal on the right. Jump, jump again in the air for a double jump, or hold a direction to flip, which hits the ball far harder. Boost until you go supersonic and you can demolish the other car by ramming it. Your wheels stick to the walls and ceiling, and a tied match goes to golden-goal overtime.

Play a bot at Rookie, Pro or All-Star, or two players on one keyboard. Every goal gets a slow-motion explosion and a replay. Every match earns XP, and each level from 2 to 20 unlocks paints, three car bodies, boost trails or goal explosions for your garage.`,
    controls: [["A / D or ← / →","drive and turn round"],["W / S or ↑ / ↓","tilt the nose in the air"],["Space / J / Z","jump · again in the air = double jump or flip"],["Shift / K / X","boost"],["Esc / P","pause"],["M","mute"],["2 players","P1 WASD + Space + Left Shift · P2 arrows + Enter + Right Shift"],["Touch","left thumb = joystick, JUMP and BOOST buttons"]],
    tips: "Flip into the ball instead of just driving into it - jump, then press jump again while holding towards it. A flip shot flies far harder and can score from midfield.",
  },
  {
    slug: "tank-duel", title: "TANK DUEL", how: 'mounted', port: 8364, url: "/",
    content: "Cartoon tanks shell each other across hills; hits make big cartoon fireballs, craters and damage numbers, and a beaten tank blows up with a KO! No people are shown and there is no blood. Explosions give a soft screen flash and screen shake.",
    web: "tank-duel/",
    tag: "Strategy", big: false, added: '2026-10-11',
    cat: "Strategy", tags: ["artillery","tanks","turn based","2 players","wind","weapons","mobile"],
    blurb: "Pull back, let go, and lob a shell over the hill through the wind. First to three rounds wins.",
    about: `Two cartoon tanks on rolling hills take turns shooting at each other. Press on the battlefield and pull back like a slingshot: the direction is the angle, the length of the pull is the power, and a short dotted line shows where the shell starts to go. The wind changes every turn and pushes every shell sideways, and every blast digs a crater that tanks drop into, with fall damage if the drop is big. Each tank has 100 health, and the first to win three rounds takes the match.

There are twelve weapons, from the unlimited Shell to the Cluster, the MIRV that splits at the top of its arc, the Roller, the hill-tunnelling Digger, Napalm that runs downhill, the Skipper, the wind-proof Sniper and one Nuke, and the ammo has to last the whole match. Beat four bot ranks in turn, Rookie, Gunner, Ace and General, or play a friend on the same device. Every round rolls a new landscape: meadow, desert, snowfield or dusk.`,
    controls: [["Press + pull back","aim (direction = angle, length = power), let go to fire"],["← →","angle"],["↑ ↓","power (hold Shift for fine)"],["Space / Enter","fire"],["Q / E / Tab","change weapon"],["W","weapon picker"],["A / D","drive (2 moves a round)"],["M","mute"],["Esc / P","pause"],["Touch","pull back on the battlefield; bottom bar for weapon, move and FIRE"]],
    tips: "Ammo lasts the whole match, not one round: you get one Nuke and one Volcano for the whole match, and the bot gets more accurate with every shot it takes in a round, so finish rounds quickly.",
  },
  {
    slug: "sumo-slam", title: "SUMO SLAM", how: 'mounted', port: 8365, url: "/",
    content: "Cartoon toy sumo blobs bump each other off a floating ring and fall away into the clouds with a slide-whistle; nobody is hurt and there is no blood. Blobs flash white for a moment when hit, and the screen shakes on big hits.",
    web: "sumo-slam/",
    tag: "Party", big: false, added: '2026-10-11',
    cat: "Action", tags: ["sumo","party","brawler","physics","2 player","3d","mobile"],
    blurb: "Hold to charge, let go to dash. Slam the other blobs off a shrinking, tilting ring and be the last one standing.",
    about: `Four glossy sumo blobs on a ring floating in the sky, and one rule: be the last one on it. Hold to charge a dash, let go to launch, and a dash that connects throws the other blob hard. One that hits nothing can carry you straight off the edge. From 4 seconds the edge crumbles and the ring shrinks, from 6 seconds it tilts and keeps swinging round so everyone slides downhill, and at 48 seconds it starts collapsing fast, so no round reaches a minute. First to three rounds wins the match.

Power-up orbs drop in: GIANT makes you bigger and heavier, HEAVY gives you an iron body that hits barely move, and SPRING turns your next dash into a leap that lands with a shockwave. Beat four bot leagues, ROOKIE, CONTENDER, CHAMPION and YOKOZUNA, to unlock the next, win solo matches to unlock four more blob colours, and beat YOKOZUNA for a gold crown. Two players can share one keyboard against two bots.`,
    controls: [["WASD / arrows","move"],["Hold Space / Enter / mouse","charge a dash"],["Let go","dash (SLAM)"],["2 players","P1 WASD + Space · P2 arrows + Enter"],["Esc / P","pause"],["M","sound on / off"],["R","play again (results)"],["Touch","drag left side to move, hold SLAM and let go"]],
    tips: "When the ring tilts, dash so your target is between you and the low side - the slope finishes the throw for you. And never dash at someone standing right on the edge with nothing behind you: if they step aside, you go over instead.",
  },
  {
    slug: "prism", title: "PRISM", how: 'mounted', port: 8366, url: "/",
    content: "Abstract neon shapes and a glowing ball; nobody gets hurt. When the ball breaks it shatters into coloured pieces with a short white screen flash, and a smaller flash marks every tenth star.",
    web: "prism/",
    tag: "Arcade", big: false, added: '2026-10-11',
    cat: "Arcade", tags: ["colour","neon","one touch","endless","tap","reflex","mobile"],
    blurb: "Tap to hop a glowing ball up a neon tower, but you can only pass through the colour that matches it.",
    about: `Each tap hops your ball up a little and gravity pulls it back down. Every obstacle in the endless tower is split into cyan, pink, yellow and violet, and you may only pass through the part that matches your ball. Touch any other colour and it shatters. A star sits in the middle of every obstacle, and a four-colour switch orb in the gap above it gives you a new colour for the next one.

There are eight kinds of obstacle: rings, squares and sliding bars to start, then windmills and triangles from the third, dotted rings and double counter-spinning rings from the sixth, and twin windmills from the tenth, each turning a little faster than the last. CLASSIC starts gently; RUSH has every shape from the start and runs 25 per cent faster, with its own best score. Stars are banked when you die and buy five new ball styles, from COMET at 25 stars to PULSE at 350.`,
    controls: [["Click / tap","hop"],["Space / Up / W","hop"],["R / Enter","retry"],["P / Esc","pause"],["M","sound on / off"],["Touch: tap anywhere","hop"]],
    tips: "Small, even taps keep the ball floating in place under an obstacle. Hover there until your colour swings round, then tap quickly to go through.",
  },
  {
    slug: "home-run", title: "MOONSHOT SLUGGER", how: 'mounted', port: 8367, url: "/",
    content: "A cartoon baseball home run derby at night. Nobody gets hurt and there is no violence; perfect hits give a brief white screen flash and home runs set off fireworks.",
    web: "home-run/",
    tag: "Sport", big: false, added: '2026-10-11',
    cat: "Sport", tags: ["baseball","home run","timing","3d","stadium","one button","mobile"],
    blurb: "Put the circle on the pitch, time the swing, and send it into the night. Ten outs, only home runs count.",
    about: `A home run derby under the stadium lights. The pitcher winds up, the pitch is called with its type and speed, and you put the aim circle on the ball and swing as it arrives. Timing decides how hard you hit it and where it goes - early pulls it to left, late pushes it to right - and aim decides the launch: centred is a bomb, too high is a grounder, too low is a pop-up. Only home runs count. Everything else is an out, and ten outs (or 30 pitches) ends the round.

Eight stages run from SANDLOT to MYTHIC, adding the changeup, curveball and slider and getting faster, from about 90 to 140 km/h. Each asks for more home runs, from 3 up to 10, with three stars per stage. Back-to-back home runs multiply your score up to x5, golden balls are worth double, glowing rings in the stands give +300 and a 160 m moonshot adds +100.`,
    controls: [["Mouse","move the aim circle"],["Click / Space","swing"],["R","restart the round"],["M","mute"],["Esc / P","pause"],["Touch: tap the ball","aim and swing in one go"]],
    tips: "Click a fraction before the ball reaches the batter, not when it arrives, and aim a little low on curveballs - they still have some drop to make when you swing.",
  },
  {
    slug: "air-hockey", title: "PUCK BLITZ", how: 'mounted', port: 8368, url: "/",
    content: "Neon air hockey with no violence or scares. Goals flash the goal mouth in colour with a screen shake, and hard hits throw sparks.",
    web: "air-hockey/",
    tag: "Sport", big: false, added: '2026-10-11',
    cat: "Sport", tags: ["air hockey","neon","2 players","one screen","vs bot","quick","mobile"],
    blurb: "Neon air hockey where your mouse or finger is the mallet. Beat the bot or a friend on one phone. First to 7.",
    about: `Your mallet is a glowing ring that sits right under your mouse or finger and stays in your half of the table. Swipe through the puck to fire it down the table, bank it off the rails round a defender, and score in the goal at the far end. After a goal the puck is put back, sitting still, in the half of whoever let it in. First to 7 wins, and a match takes a minute or two.

Play the bot on Easy, Medium or Hard. The bots get faster, react quicker and aim better as you go up, and only Hard reads bank shots. Each difficulty you beat lights a star. Or hand one phone or tablet to a friend for 2 PLAYERS, where each of you drags on your own half at the same time. The game saves your wins and losses, your best win streak and your hardest shot. The puck tops out at about 112 km/h.`,
    controls: [["Move the mouse","move your mallet (no click needed)"],["Arrows / WASD","move your mallet"],["Esc / P","pause"],["R","restart the match"],["M","sound on / off"],["Space / Enter","play from the title · rematch"],["Touch: drag","move your mallet on your half"],["Touch: 2 players","each finger plays the half it touched first"]],
    tips: "Bank it off a side rail. A straight shot runs into the bot's mallet in front of its goal, and the Easy and Medium bots cannot see a bank shot coming.",
  },
  {
    slug: "strike", title: "STRIKE", how: 'mounted', port: 8369, url: "/",
    content: "Bowling in a neon alley. Pins crash and fly with sparks and confetti; nobody is shown and nothing violent happens.",
    web: "strike/",
    tag: "Sport", big: false, added: '2026-10-11',
    cat: "Sport", tags: ["bowling","swipe","neon","3d","physics","puzzle","mobile"],
    blurb: "Swipe up to bowl, curve the swipe to hook it, and send the pins flying in a glossy neon alley.",
    about: `One swipe throws the ball. Swipe direction is your aim, swipe speed is the ball speed, and a curved swipe is a hook: bow it out like a ) and the ball goes out right and curls back left. Drag sideways first to move your starting spot. The front of the lane is oiled, so the ball skids straight and only bites on the dry end near the pins, where real pin physics decide what falls. The camera rides the ball, then swings round to the pins for the crash.

The 10-frame game uses real scoring, bonus balls in the tenth and a 300 perfect game, and strikes in a row earn DOUBLE, TURKEY, HAMBONE and beyond. Split Challenges are twelve set-up racks, from the lone 10 pin to the Big Four, with three balls each and up to three stars. Six ball finishes to pick from: one from the start, the rest unlocked with strikes and split stars.`,
    controls: [["Swipe up","bowl (speed = how fast you swipe)"],["Curved swipe","hook the ball"],["Drag left / right","move your starting spot"],["← →","move the ball"],["A D","aim"],["Q E","hook"],["Hold Space","power, release to throw"],["Tap / Space","speed up the pinfall"],["M","mute"]],
    tips: "Start a little right of centre and give your swipe a gentle ) curve: the ball skids on the oil, then hooks left into the pocket between the 1 and 3 pins, which is where most strikes come from.",
  },
  {
    slug: "word-blitz", title: "WORD BLITZ", how: 'mounted', port: 8370, url: "/",
    content: "A word-finding game on a grid of letter tiles. No violence, no scares and no bright flashes, just confetti, a small screen shake on long words and a soft red glow at the screen edge in the last ten seconds. A blocklist removes rude words from the word list.",
    web: "word-blitz/",
    tag: "Word", big: false, added: '2026-10-11',
    cat: "Puzzle", tags: ["words","spelling","boggle","daily","90 seconds","brain","mobile"],
    blurb: "Ninety seconds, sixteen letters. Drag through touching tiles to spell words, and the long ones score huge.",
    about: `A 4x4 grid of letter tiles and a 90-second clock. Press on a letter and drag through the ones touching it, diagonals included, then let go: green means a new word, yellow means you already found it, red means it is not a word. Every tile shows its points, from 1 for common letters up to 9 for J and Z, and the word's total is multiplied by its length, up to x4 for eight letters or more. Each board has two 2L tiles that double a letter and one 3W tile that triples the whole word. Words found within four seconds of each other build a combo of up to x2.

Classic deals a new board every round, and the Daily Board is the same board for everyone that day, with your daily best and a day streak. Each board has three stars to earn. When the clock runs out you see the common words you missed, longest first, and you can tap one to see where it was. Your score becomes XP, and the ranks run from Rookie to Lexicon Legend.`,
    controls: [["Press + drag","spell a word through touching letters"],["Let go","submit the word"],["Drag back one tile","undo the last letter"],["Type letters","spell on the keyboard (Q types Qu)"],["Enter / Backspace / Esc","submit · delete a letter · clear"],["Tab / 1 / Shift+R / ↻ button","rotate the board"],["Space / Enter","play again on the results"],["M","mute (title and results screens)"],["Touch: drag","spell a word"]],
    tips: "Look for a long word through the 3W tile. It triples the whole word, and on top of the x4 length bonus for eight letters, that one word can outscore the rest of your round.",
  },
  {
    slug: "beat-dash", title: "BEAT DASH", how: 'mounted', port: 8371, url: "/",
    content: "A neon cube that shatters into squares when it hits a spike, then restarts straight away. No people, no blood. Bright colour flashes when you finish a level and go through gravity portals, and the background pulses on the beat.",
    web: "beat-dash/",
    tag: "Rhythm", big: false, added: '2026-10-11',
    cat: "Arcade", tags: ["rhythm","music","one button","runner","neon","jump","mobile"],
    blurb: "Tap to jump. A neon cube runs a course built on the beat, and one touch of a spike sends you back to the start.",
    about: `A glowing cube runs right on its own across a course built on the beat of a synth track, and your only button is jump. Clear spikes, land on blocks, bounce off yellow pads, tap orbs for a jump in mid-air, hit blue orbs to flip gravity and go through portals to run along the ceiling. Hold to keep jumping every time you land. One touch of a hazard and the cube shatters, and the next attempt starts in under a second.

Six hand-built levels go from First Light at 128 BPM to Event Horizon at 170, and every one is open from the start. Each has its own track, made in your browser, and the speed is locked to the tempo so every jump lands on the beat. A progress bar keeps your best, practice mode puts down checkpoints for you or wherever you press Z, and beating levels unlocks five more cube colours.`,
    controls: [["Click / Space / Up / W / Enter","jump (hold to keep jumping)"],["Esc / P","pause"],["R","restart"],["M","mute"],["Z / X","practice: place / remove checkpoint"],["Level select: arrows / A D","choose a level · Space plays · P practice"],["Touch: tap or hold","jump"]],
    tips: "When in doubt, press early: every jump has some leeway and the safe side is almost always early. A press made just before an orb still counts if you are holding it when you touch the orb.",
  },
  {
    slug: "neon-swarm", title: "NEON SWARM", how: 'mounted', port: 8372, url: "/",
    content: "Abstract glowing shapes burst into neon sparks when shot; there are no people and no blood. Explosions shake the screen, and bombs and deaths give a bright full-screen flash.",
    web: "neon-swarm/",
    tag: "Shooter", big: false, added: '2026-10-11',
    cat: "Shooter", tags: ["twin stick","neon","arena","shooter","high score","endless","mobile"],
    blurb: "Shred waves of neon shapes on a warping grid, and grab every green shard to send your multiplier through the roof.",
    about: `A twin-stick arena shooter on a glowing grid that bends under every explosion. Your little white ship fires on its own, so you just steer and aim. Every shape you destroy drops green shards, and each one you collect adds 1 to your multiplier, so a long life is worth far more than a fast one. Die and the screen clears, and the multiplier drops back to x1. A bomb wipes out everything on the screen.

Purple pinwheels drift, cyan diamonds chase, green squares sidestep your bullets, pink splitters break into three, yellow snakes block shots with their tails, and red black holes swallow everything nearby once you shoot them, then burst into sparks if they eat too much. SURGE gives you three lives and three bombs, a scripted wave every 15 seconds or less, and a gun that grows from two streams to a five-way fan. BLITZ is exactly three minutes with unlimited lives and no bombs.`,
    controls: [["W A S D","move"],["Mouse / arrow keys","aim (fire is automatic)"],["Space / right click","bomb"],["Esc / P","pause"],["R","restart"],["M","sound on/off"],["Gamepad","left stick move, right stick aim, A / triggers / bumpers bomb, Start pause"],["Touch","left half moves, right half aims (no right thumb = auto-aim), BOMB button"]],
    tips: "Your multiplier only resets when you die, so spend a bomb rather than a life: a hit on x400 costs you far more than the bomb does.",
  },
{
    slug: "pinball", title: "STARLANE PINBALL", how: 'mounted', port: 8373, url: "/",
    content: "A neon space-themed pinball table with no people and no violence. Jackpots, multiball, mission completes, skill shots, extra balls and tilts briefly wash the screen in a bright colour.",
    web: "pinball/",
    tag: "Arcade", big: false, added: '2026-10-11',
    cat: "Arcade", tags: ["pinball","neon","multiball","physics","high score","retro","mobile"],
    blurb: "A full neon pinball table: lock two balls in the Black Hole for multiball, then hit the ramp for jackpots.",
    about: `One full pinball table in bright neon, seen from above, with real ball physics. Pull the plunger, keep the ball alive with the flippers, and shoot whatever the orange dot-matrix display asks for. Hold a flipper up to catch the ball and aim. Tip shots are hard, base shots soft. There are three pop bumpers, slingshots, a wire ramp, a left orbit with a spinner, three drop targets, three STAR targets, three top lanes and the Black Hole.

Eight missions, from Bumper Storm to Ramp Race, promote you one rank each, from Cadet to Fleet Admiral, and each pays more than the last. Sink the Black Hole twice to start 3-ball multiball, where every ramp is a jackpot worth 250,000 or more. Light the stars for an extra ball, roll the top lanes for up to 6x bonus, chain big shots into combos, and nudge the table - but nudge too hard and it tilts. Three balls, a ball save and a top-five high score table.`,
    controls: [["Z / Left Shift / ←","left flipper"],["M / / / Right Shift / →","right flipper"],["Hold Space / ↓ / Enter","pull the plunger, let go to launch"],["X / . / ↑","nudge from the left / right / front"],["P / Esc","pause"],["S","sound on / off"],["Touch","hold left or right half to flip, hold right half to launch, NUDGE button"]],
    tips: "Your first multiball of each game has LOCK already lit, so two shots into the Black Hole start it - then aim every shot at the ramp for 250,000-point jackpots.",
  },
  {
    slug: "mini-golf", title: "PUTT PARK", how: 'mounted', port: 8374, url: "/",
    content: "Cartoon mini golf with no violence and no scares. The worst that happens is your ball splashes into a pond, and the 'ghost golfers' you race are just coloured balls.",
    web: "mini-golf/",
    tag: "Sport", big: false, added: '2026-10-11',
    cat: "Sport", tags: ["golf","mini golf","putting","race","physics","casual","mobile"],
    blurb: "Pull back, let go, watch it roll. Eighteen holes of windmills, portals and conveyor belts, plus races against three ghost golfers.",
    about: `Bright top-down mini golf where the whole hole fits on the screen. Press anywhere, drag away from where you want the ball to go and let go: a dotted line shows the path and the first bounce, and the power ring goes from green to red. A slow ball drops into the cup, but a fast one rattles round the lip and spins out. Water costs a stroke and puts you back where you shot from, sand stops the ball hard, hills push it downhill, belts carry it, matching portals throw it out the other side at the same speed, and windmill blades, sliding walls and pink bumpers knock it about.

PLAY is the career round of eighteen holes, par 48, with up to three stars on each: under par, par, or within two over. A hole stops at par plus four so nobody gets stuck. RACE is five random holes against Pip, Dot and Ace, three ghost golfers playing the same hole at the same time, scoring 3, 2, 1 and 0 points a hole. Stars unlock eight ball skins, the last one at 50.`,
    controls: [["Drag back + release","putt (further = harder)"],["Drag back to the start","cancel"],["Arrows / WASD","aim and power"],["Shift","fine aim"],["Space / Enter","putt"],["R","restart the hole (not in a race)"],["M","mute"],["Esc","pause menu"],["Touch: drag back","putt"]],
    tips: "The cup only grabs a slow ball. Hit your last putt so it is dying as it reaches the hole - a fast one rattles round the lip and spins back out.",
  },
  // ---- NEWEST FIRST: six from the 2026-10-10/11 session hub ----
  {
    slug: "graze", title: "GRAZE", how: 'mounted', port: 8340, url: "/",
    content: "Abstract neon arrow dodging walls, spikes and saws. Crashes are a burst of sparks, and there are brief white screen flashes when you crash, use Phase, speed up or finish a level. No people and no violence.",
    web: "graze/",
    tag: "Arcade", big: false, added: '2026-10-11',
    cat: "Arcade", tags: ["one button","neon","wave","reflex","daily","endless","mobile"],
    blurb: "Hold to climb, let go to dive. Scrape past the walls to build your combo, then ghost straight through one.",
    about: `A one-button neon dodger. Your arrow only ever flies at 45 degrees, up while you hold and down when you let go, through tunnels of walls, spikes and spinning saws, all to a beat-driven soundtrack. Flying close past anything without touching it is a graze: it scores ten times your multiplier, builds a combo up to x10 and fills your Phase meter. With a full meter your next crash does not kill you - time slows and for just over half a second you pass straight through anything.

PLAY is an endless run that speeds up a tier every 30 seconds. DAILY is one 90-second course a day, the same for everyone, with a copyable share line. WORLDS has 24 levels in four worlds, with gravity flips, mini size, speed and mirror portals, three stars on each level and a practice mode with checkpoints. Every graze earns a Spark to spend on arrows, trails and crash effects, and three missions are always running.`,
    controls: [["Hold mouse / Space / Up / W","climb"],["Let go","dive"],["R / Enter","restart"],["Esc / P","pause"],["Touch: hold anywhere","climb, lift to dive"]],
    tips: "The graze zone is far wider than your hitbox, so fly along the faint strip inside each wall on purpose - staying in it scrapes a new graze about every quarter of a second.",
  },
  {
    slug: "lanternfall", title: "LANTERNFALL", how: 'mounted', port: 8341, url: "/",
    content: "Cartoon forest creatures (moths, wolves, walking trees, ghostly wraiths) catch fire and fade away in your lantern light; no blood or gore. The dark is spooky, with glowing eyes and a big shadowy boss, and there are bright flashes when weapons evolve, when the boss arrives and at sunrise.",
    web: "lanternfall/",
    tag: "Survivor", big: false, added: '2026-10-11',
    cat: "Action", tags: ["survivor","roguelite","horde","lantern","night","daily","mobile"],
    blurb: "Carry the last lantern through a haunted forest. Anything that steps into your light burns. Last five minutes until dawn.",
    about: `You only move: everything fires on its own. Out in the dark the forest is pairs of glowing eyes, and anything that wanders into your lantern's circle slows down, catches fire and drops an ember. Collect embers to level up and pick one of three gifts - twenty-three in all, from orbiting wisps and firefly bolts to thorn hedges, shield moths and a sweeping lighthouse beam. Max a weapon, own its partner charm and open a chest, and it evolves into one of nine bigger forms.

The night lasts five minutes and gets worse as the moon crosses the sky: wolves that dash, slow hollow trees, wraiths that lunge through the light, the Grey Stag at 2:30 and the Night Warden at 4:30. Reach sunrise and it burns everything away. The embers you gather turn into Oil for the Lamplighter's Shed, achievements unlock four more lantern bearers, the Fogmarsh map and Moonless mode, and there is a Daily run with the same seed for everyone.`,
    controls: [["W A S D / arrows","walk"],["Hold mouse button","walk towards the pointer"],["1 / 2 / 3","pick a gift"],["R","reroll the gifts · restart after a run"],["X","skip the gift"],["Space","start · take the chest"],["P / Esc","pause"],["Touch","drag anywhere to walk, tap a card to pick"]],
    tips: "Max a weapon and grab its partner charm (Orbiting Wisps + Kindling, Firefly Bolts + Glass Lens, Thorn Hedge + Ironbark...), then burn the golden moth that turns up: its chest evolves the weapon.",
  },
  {
    slug: "bailout", title: "BAILOUT", how: 'mounted', port: 8342, url: "/",
    content: "Cartoon stunt-bike crashes: the rider flops off as a ragdoll, slides on his face and gets singed by lava, but there is no blood and he is always straight back on the bike. TNT explosions give a bright flash and a screen shake.",
    web: "bailout/",
    tag: "Stunts", big: false, added: '2026-10-11',
    cat: "Driving", tags: ["stunt","bike","ragdoll","flips","physics","daily","mobile"],
    blurb: "Two buttons, forty courses: flip for time, stick the landing, and land on your head to send the rider flying.",
    about: `A side-on stunt-bike race against the clock, with gas, brake and nothing else. Hold gas up the ramp, let go over the lip, then tap gas for a backflip or brake for a frontflip. Every full flip you land takes a second off your time and a clean landing gives you a speed boost. Touch anything with the rider's head or chest and he bails: he flies over the bars as a floppy ragdoll in slow motion, and you are back at the last checkpoint a moment later.

Forty levels in five worlds - the Canyon, the Junkyard, the Glacier, the Volcano and Neon City - with boulders, TNT, see-saws, ice, loops, fans, lava and drawbridges, and bronze, silver, gold and platinum medals on each. There is a new Daily Gauntlet every day with a streak, an endless downhill on Freefall Mountain, six bikes and a pile of helmets and suits to buy with coins, and a gallery of your best crashes with 20 trophies.`,
    controls: [["Right / D / Up / W","gas · in the air, tap again to backflip"],["Left / A / Down / S","brake and reverse · in the air, tap to frontflip"],["R","restart the level"],["Enter","back to the last checkpoint"],["Esc / P","pause"],["Touch: right half","gas"],["Touch: left half","brake"]],
    tips: "Let go of gas as you leave the ramp and tap it again in the air: a pedal you were already holding does nothing up there, and every flip you land is a second off your time.",
  },
  {
    slug: "twister-io", title: "TWISTER.IO", how: 'mounted', port: 8343, url: "/",
    content: "Cartoon tornadoes suck up toy cars, cows, houses and little people, who float away unharmed; rival storms swallow each other. No blood or injuries. Bigger storms throw small lightning bolts that flash brightly.",
    web: "twister-io/",
    tag: "Arena", big: true, added: '2026-10-11',
    cat: "Action", tags: ["tornado","io","grow","3d","arena","bots","mobile"],
    blurb: "Be a tornado in a toy town: suck up cones, then cars, then houses, and be the biggest storm when the clock runs out.",
    about: `Every round is two minutes in a bright toy town against nine rival storms, and the biggest one at the end wins. Steer over anything your size or smaller and it rips loose, spirals up and joins the ring of debris circling you. You start on cones and bins and climb through seven categories: people, cars and cows, trees and vans, houses, towers and the lighthouse, and finally the stadium.

Your debris ring is your armour. Fling pieces at rivals to knock their rings apart, dash when you need speed (it costs mass), and run when your ground ring turns red, because a bigger storm will strip you and swallow you. Classic is the two-minute fight, Daily Town is the same map for everyone each day, and Storm Chase is a solo race to flatten a whole village. Stars from every round unlock six skins and three perks.`,
    controls: [["Mouse","the storm heads for the pointer"],["WASD / arrows","steer"],["Click / E / J / F / Enter","fling debris at a rival"],["Shift / Space","dash (costs mass)"],["Esc / P","pause"],["R","restart the round"],["Touch","drag to steer, FLING and DASH buttons"]],
    tips: "When your ground ring pulses red, run: a bigger storm only swallows you once your debris ring is empty, and half of what it strips off you drops on the ground for you to pick back up.",
  },
  {
    slug: "block-royale", title: "BLOCK ROYALE", how: 'mounted', port: 8344, url: "/",
    content: "A gentle block puzzle with no violence or scares. Clears set off sparkles, short glows along the cleared lines and a small screen shake (a bigger one for the Bomb glyph).",
    web: "block-royale/",
    tag: "Puzzle", big: false, added: '2026-10-11',
    cat: "Puzzle", tags: ["blocks","8x8","roguelike","charms","daily","zen","mobile"],
    blurb: "The 8x8 block puzzle scored like a poker hand: clears earn Chips, streaks build Mult, and charms break the rules.",
    about: `Drag pieces onto an 8x8 board and fill rows and columns to clear them. Every clear scores Chips x Mult: 10 Chips per block cleared, and Mult grows with lines cleared at once and with your streak of clears in a row. Each round gives you a target and 20 placements. A run is 8 antes of a Small, a Big and a Boss round, and the bosses bend the rules: one stops columns clearing, one shrinks the board, one deals pieces one at a time.\n\nBetween rounds the shop sells charms, which fire left to right on every clear, and one-shot glyphs like Bomb, Undo and Redeal. There are 60 charms and 8 glyphs to build with. Daily gives everyone the same seed with a shareable result card, Zen is endless classic play, and runs earn XP that unlocks 5 more decks (6 in all), with 8 stakes each.`,
    controls: [["Drag","move a piece onto the board"],["Tap piece, tap board","place it"],["1 / 2 / 3","select a piece"],["Arrows / WASD","move it"],["Space / Enter","place"],["Q / E","rotate (with Rotate)"],["4 / 5","use a glyph"],["Z","undo (with Undo)"],["Esc","pause"],["Shop: Enter / R","next round / reroll"]],
    tips: "Charms fire left to right, so put flat +Mult charms first and the x-Mult ones at the end, where they multiply the biggest number.",
  },
  {
    slug: "bannerfall", title: "BANNERFALL", how: 'mounted', port: 8320, url: "/",
    content: "Medieval battles between toy-like armies with swords, bows, cavalry and siege engines: soldiers fall when beaten and villages can be burned, but there is no blood, and hits show as small sparks and dust.",
    web: "bannerfall/",
    tag: "Strategy", big: true, added: '2026-10-11',
    cat: "Strategy", tags: ["strategy","medieval","rts","castles","siege","3d","war"],
    blurb: "Dig trenches, raise walls, then lead your army in real time to storm every rival capital.",
    about: `Found a kingdom with a royal grant of 50,000 gold. While time is stopped you dig trenches, raise palisades and stone walls, and recruit your first squads. Then raise the banners and the war runs in real time on a generated map 2, 3 or 4 km across, against 1 to 3 rival kingdoms that also fight each other. Take villages and pillage them or tax them, raid forts, claim land, and break into castles with rams and mangonels. A kingdom falls when its capital is taken, its ruler is slain or it surrenders. Space pauses whenever you need to think.

Recruit from 25 kinds of troops, from militia and longbowmen to knights, siege towers and trebuchets, and send builders out to dig in during the war. Millbrook Ford is a single five-wave defence of a river crossing with three stars to earn, and the Long War is a realm of provinces fought over season by season, where you can fight any battle yourself on the 3D field.`,
    controls: [["Left click / drag","select squads"],["Right click","move · attack"],["Right drag","draw a battle line"],["Space","pause (orders still work)"],["W A S D / arrows, Q E, wheel","pan, rotate, zoom"],["Z X C · H G K","formation · stance"],["F / R","ability / retreat"],["F1 · Esc","controls · menu"],["Touch","tap to select and move, pinch to zoom"]],
    tips: "Taking a village pauses the game and asks you to choose. Pillage pays 6,000-16,000 gold once, but protecting and taxing it pays 150-400 gold every minute for as long as you hold it.",
  },
  // ---- NEWEST FIRST: thirteen from the 2026-10-08/09 games session (session hub) ----
  {
    slug: "stack-attack", title: "STACK ATTACK", how: 'mounted', port: 8306, url: "/",
    content: "Cartoon food falls and stacks up. A seagull steals bits of burger, and customers gag and walk out when you catch a boot, a fish or a sock. No violence.",
    web: "stack-attack/",
    tag: "Arcade", big: false, added: '2026-10-09',
    cat: "Arcade", tags: ["burger","stacking","cooking","physics","cartoon","mobile","endless"],
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
    tag: "Arcade", big: false, added: '2026-10-09',
    cat: "Action", tags: ["snowball fight","top down","battle royale","teams","winter","mobile"],
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
    tag: "Arcade", big: false, added: '2026-10-09',
    cat: "Arcade", tags: ["physics","destruction","crane","city","upgrades","mobile","2d"],
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
    tag: "Arcade", big: false, added: '2026-10-09',
    cat: "Driving", tags: ["mowing","lawn","stripes","garden","time trial","cartoon","top down"],
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
    tag: "Arcade", big: false, added: '2026-10-09',
    cat: "Arcade", tags: ["sushi","cooking","serving","time management","cute","touch","2d"],
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
    tag: "Puzzle", big: false, added: '2026-10-09',
    cat: "Puzzle", tags: ["bomb","defusal","puzzle","manual","timer","daily","endless"],
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
    tag: "Arcade", big: false, added: '2026-10-09',
    cat: "Arcade", tags: ["one button","swinging","grappling hook","mobile","caves","endless","2d"],
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
    tag: "Rhythm", big: false, added: '2026-10-09',
    cat: "Arcade", tags: ["rhythm","music","blocking","boss fights","reflex","endless","2d"],
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
    tag: "Puzzle", big: false, added: '2026-10-09',
    cat: "Puzzle", tags: ["heist","stealth","pixel","guards","real time","puzzle","2d"],
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
    tag: "Driving", big: false, added: '2026-10-09',
    cat: "Driving", tags: ["demolition derby","cars","crashing","top down","arena","destruction","physics"],
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
    tag: "Driving", big: false, added: '2026-10-09',
    cat: "Driving", tags: ["drifting","racing","touge","eurobeat","top down","cars","time attack"],
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
    tag: "Action", big: false, added: '2026-10-09',
    cat: "Action", tags: ["samurai","ink","slash","combo","one touch","endless","mobile"],
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
    tag: "Cosy", big: true, added: '2026-10-09',
    cat: "Adventure", tags: ["cosy","island","fishing","lighthouse","building","3d","sailing"],
    blurb: "Keep a tiny island: tie up the trading boats, light them in at night, and grow a leaky tent into a cottage.",
    about: `You keep a small island with a campfire, a wooden dock and a striped lighthouse out on its own islet. Chop trees for wood, fish off the dock for supper, and pick up clams and shells off the wet sand when the tide goes out - it comes back twice a day and takes whatever you left. Three trading boats sail in by day, and each one pays extra for something: fish, shells or wood. At night they wait out at sea, and you climb the lighthouse and lead them past the rocks with the beam.

The tent becomes a shack, a cabin, then a two-floor cottage that you paint and fill with furniture you make yourself. Eleven fish bite by depth, tide, time of day and weather, and storms flood the beach. Build a sailboat and you can sail to three far islands, each with a village and a trader who pays double.`,
    controls: [["W A S D / arrows","walk · steer the sailboat · move the lamp beam"],["E / Space / click","use · cast · hook · hold to reel"],["F","eat"],["Q","go in and out of your home"],["B","make furniture (indoors) · R rotates"],["J","journal"],["Esc","pause · back"],["Touch","stick to walk, USE button to act"]],
    tips: "Save your fish for the Puffin and your wood for Old Oak - each boat pays half as much again for the one thing it wants.",
  },

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
    cat: 'Driving', tags: ['racing', 'f1', 'cars', 'simulation', '3d', 'track',
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
    cat: 'Driving', tags: ['racing', 'nascar', 'stock cars', 'oval', 'cars',
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
    cat: 'Action', tags: ['crime', 'driving', 'stealth', 'top down', 'cars', 'open world'],
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
    cat: 'Sport', tags: ['skateboard', 'pixel', 'tricks', '2d', 'street'],
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
    cat: 'Sport', tags: ['boxing', 'fighting', 'pixel', 'wrestling', 'sumo', 'career', '2d'],
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
    cat: 'Strategy', tags: ['tower defence', 'watercolour', 'co-op', 'online', 'heroes', 'story', '2 player'],
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
    cat: 'Arcade', tags: ['penguin', 'fishing', 'pixel', 'underwater', 'side scroller', 'animals'],
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
    cat: 'Sport', tags: ['basketball', 'multiplayer', 'online', '2 player', 'ball'],
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
    cat: 'Arcade', tags: ['endless', 'hopping', 'traffic', 'mobile', 'one life'],
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
