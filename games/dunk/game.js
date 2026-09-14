// =====================================================================
// DUNK - basketball
// =====================================================================
//
// Liam: *"get rid of the slimes in dunk make it 3D... really good looking
// lowpoly basketball characters with shadows... cloth physics and give
// them basketball shorts and jersey... really complex NPC stuff and then
// make a full functioning 2K type basketball game WASD to move player can
// move mouse and the character follows it if mouse is pointed at team
// member it passes enemies can block passes and shots... when near goal
// they can point it at the goal and hold the mouse down to decide how hard
// they shoot it... multiple characters and fake teams that have stats...
// for defense they can point at person they are guarding if they have the
// ball and click to try and grab it... Q and E to swap what hand the ball
// is in so people can actually juke others out... make NPCs make mistakes
// and have stats... high quality net physics"*.
//
// HOW IT CONTROLS, which is what everything else is built around:
//
//   W A S D      move, relative to the camera - W is always away from it
//   MOUSE        LOOK. The camera sits behind his shoulder and the mouse
//                turns it; the crosshair in the middle of the screen is
//                what every action is aimed at. Click once and the mouse
//                is captured so it can keep turning past the edge of the
//                screen; ESC gives it back.
//   CLICK        with the ball, on a team-mate: PASS to him.
//                with the ball, anywhere else: start a SHOT - hold to
//                charge, release to let go. The bar has a green band and
//                releasing inside it is a clean release; outside it the
//                shot loses accuracy.
//                without the ball, on the man who has it: reach in and
//                try to TAKE it.
//   SPACE        jump. With the ball, in the air, at the ring: a dunk.
//   Q  E         put the ball in the left or the right hand.
//
// THE HAND MATTERS. A defender can only swipe at the ball if it is on the
// hand NEARER him, so carrying it on the far hand is protection - and
// swapping hands as you go past somebody is a crossover, which is why Q
// and E are on the keyboard rather than being automatic.
//
// EVERY NUMBER THAT DECIDES ANYTHING IS IN `teams.js`: speed, shot error,
// steal and block chances, jump, and an IQ that every NPC decision is
// rolled against - so the opponents make real, visible mistakes, and a
// low-IQ guard throws a pass into a defender's chest.
import { Deck3D, THREE, clamp, rnd, lerp, pick } from '../_deck/deck3d.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';
import { TEAMS, teamById, topSpeed, turnRate, shotError, releaseWindow,
         stealChance, blockChance, jumpSpeed, mistakeChance, overall, norm,
         mass } from './teams.js';
import { buildCourt, stepNet, COURT } from './court.js';
import { SCALE, len, launch } from './scale.js';
import { makePlayer, posePlayer, handPoint } from './player.js';

const D = new Deck3D({ key: 'dunk', w: 960, h: 560, units: 26, bg: '#070b11',
                       fov: 48, scale: 1.35 });

// GRAVITY IS NOT SCALED. It is the one quantity in here that belongs to
// the world rather than to the building: scaling it as well would undo
// the whole point, because a scaled world under scaled gravity behaves
// exactly like the unscaled one and nothing would have changed. Leaving
// it real is what makes a smaller court play quicker.
const G = -9.8 * 2.2;              // wound up 2.2x so shots feel arcade
const BALL_R = len(0.121);         // a real basketball, to scale
const GAME_TIME = 180;             // three minutes
const SHOT_CLOCK = 20;

let play = null;                   // the match, or null on the home screen
let home, board, court, ballMesh, ballShadow, aimRing, arcLine, arcPts, arcGeo;
let myTeamId = TEAMS[0].id;
const panelHits = [];

// =====================================================================
// lights and the arena
// =====================================================================
// TONE MAPPING, because a sports hall is a bright room and clipping is
// what bright rooms look like without it: the crowd went to pastel mush
// and the jerseys went white. ACES rolls the highlights off instead.
D.renderer.toneMapping = THREE.ACESFilmicToneMapping;
D.renderer.toneMappingExposure = 1.05;

D.setShadowArea(len(16), len(80));
D.key.intensity = 2.2;
// A SPORTS HALL IS NOT A VOID WITH A FLOOR IN IT.
//
// Everything above the top row of seats was pure black, so the arena read
// as a lit disc floating in space. Real halls have light bouncing off a
// pale ceiling and spilling down the far walls, and the cheapest honest
// way to get that is a hemisphere light with a sky colour that is
// actually visible plus a faint ambient floor - so the roof structure and
// the backs of the stands are dim rather than absent.
D.scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x3a3f48, 1.05));
D.scene.add(new THREE.AmbientLight(0x2a3442, 0.55));
for (const x of [-len(9), len(9)]) for (const z of [-len(5), len(5)]) {
  // the house lights, so the floor has highlights running down it rather
  // than one flat wash
  // bright, and a slow falloff: a sports hall is FLOODED with light
  const l = new THREE.PointLight(0xfff3dc, len(34), len(38), 1.5);
  l.position.set(x, len(11.5), z);
  D.scene.add(l);
}

court = buildCourt(D.scene, TEAMS[0].trim);

// ---- the ball --------------------------------------------------------
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d9741f'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.10) + ')';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = '#20140c'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
  g.beginPath(); g.moveTo(192, 0); g.lineTo(192, 256); g.stroke();
  g.beginPath(); g.arc(128, 0, 74, 0.35, Math.PI - 0.35); g.stroke();
  g.beginPath(); g.arc(128, 256, 74, Math.PI + 0.35, -0.35); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 22, 18),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.72 }));
  ballMesh.castShadow = true;
  D.scene.add(ballMesh);

  ballShadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.5, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
  ballShadow.rotation.x = -Math.PI / 2;
  D.scene.add(ballShadow);

  // the pointer: a ring on the floor where the mouse is, coloured by what
  // clicking would actually do from here
  aimRing = new THREE.Mesh(new THREE.RingGeometry(len(0.34), len(0.44), 28),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8,
                                  side: THREE.DoubleSide }));
  aimRing.rotation.x = -Math.PI / 2;
  aimRing.position.y = 0.02;
  D.scene.add(aimRing);

  arcGeo = new THREE.BufferGeometry();
  arcPts = new Float32Array(34 * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPts, 3));
  arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({
    color: 0xffe9a8, dashSize: len(0.28), gapSize: len(0.2), transparent: true, opacity: 0.7 }));
  arcLine.visible = false;
  D.scene.add(arcLine);
}

// =====================================================================
// a match
// =====================================================================
function startMatch(teamId, n) {
  if (play) for (const p of play.players) p.model.dispose();
  const mine = teamById(teamId);
  const theirs = pick(TEAMS.filter((t) => t.id !== teamId));

  const players = [];
  for (let side = 0; side < 2; side++) {
    const team = side === 0 ? mine : theirs;
    const col = side === 0 ? team.home : team.away;
    for (let i = 0; i < n; i++) {
      const card = team.roster[i % team.roster.length];
      const model = makePlayer(D.scene, {
        main: col, trim: team.trim, number: card.num, short: team.short,
        skinIndex: (i * 3 + side * 2) % 6,
        hairIndex: (i * 2 + side) % 5,
        // A TEAM IS NOT FIVE IDENTICAL BODIES, and none of them is 1.95
        // any more: len() puts a real basketball player's height through
        // the same scale as the floor he is standing on, so a guard is
        // 1.47 and a centre 1.58 on a 21.8-metre court - the same ratio
        // as 1.88 and 2.02 on a real one.
        height: len(1.88 + (card.pos === 'C' ? 0.14 : card.pos === 'F' ? 0.07 : 0)),
        shoulder: card.pos === 'C' ? 1.12 : 1.04,
        arm: card.pos === 'G' ? 1.02 : 1.06,
        leg: 1.04 + (card.pos === 'G' ? 0.03 : 0),
        sleeve: i === 1, brace: i === 2,
      });
      players.push({
        card, team, side, index: i, model,
        x: (side === 0 ? -len(3.5) : len(3.5)), z: (i - (n - 1) / 2) * len(3.0), y: 0,
        vx: 0, vz: 0, vy: 0, yaw: side === 0 ? Math.PI / 2 : -Math.PI / 2,
        air: false, hasBall: false, hand: 1,
        action: null, actionT: 0, charge: 0, charging: false,
        // TRUE, not false: the click that started the match is still down
        // on the first frame, and a fresh latch would read it as a shot.
        pressLatch: true,
        cool: 0, think: 0, plan: null, planMate: null, mark: null,
        defending: false, speed: 0,
        // contact: a knock that lives outside the walk, and the moment
        // after one where he has lost his footing
        mass: mass(card), bx: 0, bz: 0, stagger: 0, thud: 0,
        // how long until he notices a loose ball
        react: 0,
      });
    }
  }
  play = {
    players, mine, theirs, n,
    me: players[0],
    ball: { x: 0, y: len(2.4), z: 0, vx: 0, vy: 0, vz: 0, carrier: null,
            cool: 0.3, lastShot: null, pass: null, scored: false },
    score: [0, 0], clock: GAME_TIME, shotClock: SHOT_CLOCK, possession: 0,
    msg: 'TIP OFF', msgT: 1.6, over: false, cheer: 0,
    // the camera is an angle now, not a rail down the touchline
    camYaw: Math.PI / 2, camPitch: 0.30,
    camPosV: new THREE.Vector3(), aimDir: new THREE.Vector3(0, 0, 1),
    settled: false, mateT: null, thiefT: null, camDist: CAM_DIST,
    // (everything physical in here is in scaled metres - see scale.js)
    // the tools can hold the other nine still - see __dunk.freeze
    frozen: false,
    stat: { shots: [0, 0], made: [0, 0], steals: [0, 0], blocks: [0, 0] },
  };
  // the mouse belongs to the game now, not to the menu
  D.enableLook(true);
  return play;
}

const other = (s) => (s === 0 ? 1 : 0);
/** the ring a side is attacking */
const targetRim = (side) => ({ x: side === 0 ? COURT.rimX : -COURT.rimX, y: COURT.rimY, z: 0 });

// =====================================================================
// the ball
// =====================================================================
function loose(b, x, y, z, vx, vy, vz) {
  b.x = x; b.y = y; b.z = z;
  b.vx = vx; b.vy = vy; b.vz = vz;
  b.carrier = null; b.cool = 0.18; b.scored = false;
  for (const p of play.players) {
    p.hasBall = false;
    // THEY HAVE TO SEE IT FIRST.
    //
    // Five NPCs converging on a loose ball the instant it comes free is
    // why the human never got one: they were already moving before the
    // ball had left the shooter's hand. A tenth to half a second of
    // reaction, worse for a worse decision-maker, turns every rebound
    // into a scramble that can be won.
    p.react = 0.1 + (1 - norm(p.card.iq)) * 0.45;
  }
}

function giveBall(p) {
  const b = play.ball;
  b.carrier = p; b.cool = 0.12; b.pass = null; b.lastShot = null;
  for (const q of play.players) q.hasBall = false;
  p.hasBall = true;
  if (play.possession !== p.side) {
    play.possession = p.side;
    play.shotClock = SHOT_CLOCK;
  }
}

/**
 * The arc that gets the ball from here to there at a given speed.
 *
 *   tan(theta) = (v^2 -+ sqrt(v^4 - g(g d^2 + 2 h v^2))) / (g d)
 *
 * Taking the MINUS root gives the flatter of the two arcs that reach.
 * The high root is also correct and looks ridiculous - from three metres
 * out with any real power on it, it leaves at eighty-five degrees and
 * hangs for a second and a half.
 */
function solveArc(from, to, speed) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const flat = Math.hypot(dx, dz);
  const dy = to.y - from.y;
  const g = -G;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * flat * flat + 2 * dy * v2);
  const ang = disc >= 0 && flat > 0.2
    ? Math.atan2(v2 - Math.sqrt(disc), g * flat)
    : Math.PI / 4;
  const dir = flat > 1e-4 ? { x: dx / flat, z: dz / flat } : { x: 1, z: 0 };
  return { ang, dir, reaches: disc >= 0 };
}

/** the least speed that reaches - the charge bar and the NPCs both use it */
function speedFor(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const flat = Math.hypot(dx, dz), dy = to.y - from.y;
  const g = -G;
  return Math.sqrt(Math.max(1, g * (dy + Math.sqrt(flat * flat + dy * dy))));
}

// launch(), like a jump: the speed that throws a ball to a given height
// goes as the square root of that height.
const SHOT_MIN = launch(6), SHOT_MAX = launch(21);
const chargeToSpeed = (c) => lerp(SHOT_MIN, SHOT_MAX, c);
const speedToCharge = (v) => clamp((v - SHOT_MIN) / (SHOT_MAX - SHOT_MIN), 0, 1);

function shoot(p, charge) {
  const b = play.ball;
  const rim = targetRim(p.side);
  const from = handPoint(p.model, p.hand, new THREE.Vector3());
  const dist = Math.hypot(rim.x - p.x, rim.z - p.z);
  const threes = dist > COURT.arc;
  const need = speedToCharge(speedFor(from, rim));
  const win = releaseWindow(p.card);
  const off = Math.max(0, Math.abs(charge - need) - win);
  const contested = play.players.some((q) => q.side !== p.side
    && Math.hypot(q.x - p.x, q.z - p.z) < len(1.6));

  const speed = chargeToSpeed(Math.max(charge, 0.12));
  const sol = solveArc(from, rim, speed);
  const err = shotError(p.card, dist, threes, contested, off);
  const ang = sol.ang + rnd(-1, 1) * err;
  const yaw = Math.atan2(sol.dir.z, sol.dir.x) + rnd(-1, 1) * err * 0.9;

  p.action = 'shoot'; p.actionT = 0;
  play.stat.shots[p.side]++;
  play.shotClock = Math.max(play.shotClock, 4);
  loose(b, from.x, from.y, from.z,
        Math.cos(ang) * speed * Math.cos(yaw),
        Math.sin(ang) * speed,
        Math.cos(ang) * speed * Math.sin(yaw));
  b.lastShot = { by: p, side: p.side, threes, dunk: false };
  D.beep(300, 0.07, 'sine', 0.05, 170);

  // A DEFENDER CAN GET A HAND ON IT, rolled at the moment of release
  // against his block rating and how close he is. A block is a timing
  // event; testing it as a collision would make tall players unbeatable.
  for (const q of play.players) {
    if (q.side === p.side) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d > len(2.2)) continue;
    const reach = q.air ? 1 : 0.55;         // a fraction, not a distance
    if (Math.random() < blockChance(q.card, d) * reach) {
      b.vx *= -0.35; b.vy *= 0.4; b.vz *= -0.35;
      b.vx += rnd(-2, 2); b.vz += rnd(-2, 2);
      b.lastShot = null;
      play.stat.blocks[q.side]++;
      play.msg = 'BLOCKED  ' + q.card.name; play.msgT = 1.3;
      q.action = 'block'; q.actionT = 0;
      D.noise(0.2, 0.07, 300);
      break;
    }
  }
}

function dunk(p) {
  const b = play.ball;
  const rim = targetRim(p.side);
  play.stat.shots[p.side]++;
  loose(b, rim.x, rim.y + len(0.26), rim.z,
        (p.side === 0 ? 1 : -1) * len(0.5), launch(-7), rnd(-len(0.3), len(0.3)));
  b.lastShot = { by: p, side: p.side, threes: false, dunk: true };
  play.msg = 'DUNK'; play.msgT = 1.4;
  play.cheer = 2.2;
  D.noise(0.3, 0.09, 180);
  D.beep(150, 0.25, 'square', 0.07, -70);
}

function pass(from, to) {
  const b = play.ball;
  const src = handPoint(from.model, from.hand, new THREE.Vector3());
  // lead him a little, the way a pass is actually thrown
  const tgt = { x: to.x + to.vx * 0.22, y: 1.3, z: to.z + to.vz * 0.22 };
  const flat = Math.hypot(tgt.x - src.x, tgt.z - src.z);
  const speed = clamp(launch(7) + flat * 1.4, launch(8), launch(20));
  const sol = solveArc(src, tgt, speed);
  const spray = (1 - norm(from.card.iq)) * 0.05;
  const ang = sol.ang + rnd(-1, 1) * spray;
  const yaw = Math.atan2(sol.dir.z, sol.dir.x) + rnd(-1, 1) * spray;
  loose(b, src.x, src.y, src.z,
        Math.cos(ang) * speed * Math.cos(yaw),
        Math.sin(ang) * speed,
        Math.cos(ang) * speed * Math.sin(yaw));
  b.pass = { from, to };
  // the man it was thrown to is already moving to meet it
  to.react = 0;
  from.action = 'pass'; from.actionT = 0;
  D.beep(420, 0.05, 'square', 0.04);

  // AND IT CAN BE READ. Anybody on the other side standing near the line
  // between the two of them gets a roll at it, which is what makes a lazy
  // cross-court pass a bad idea - for the player and the NPCs alike.
  for (const q of play.players) {
    if (q.side === from.side) continue;
    const t = closestOnSegment(q, src, tgt);
    if (t.d > len(1.3) || t.t < 0.15 || t.t > 0.95) continue;
    if (Math.random() < blockChance(q.card, t.d) * 0.75) {
      b.vx *= -0.4; b.vz *= -0.4; b.vy = launch(3.2);
      b.pass = null;
      play.stat.steals[q.side]++;
      play.msg = 'PICKED OFF  ' + q.card.name; play.msgT = 1.4;
      q.action = 'steal'; q.actionT = 0;
      D.noise(0.18, 0.06, 420);
      break;
    }
  }
}

/** how close a player stands to the line a pass travels along */
function closestOnSegment(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1e-6;
  const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1);
  return { t, d: Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)) };
}

function stealAttempt(p, carrier) {
  // WHICH HAND IS IT IN? A swipe only works on the near one, which is the
  // whole reason Q and E exist.
  const toMe = Math.atan2(p.z - carrier.z, p.x - carrier.x);
  const handAngle = carrier.yaw + (carrier.hand > 0 ? -Math.PI / 2 : Math.PI / 2);
  const diff = Math.abs(((toMe - handAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const nearHand = diff < 1.25;
  p.action = 'steal'; p.actionT = 0; p.cool = 0.55;
  if (Math.random() < stealChance(p.card, carrier.card, nearHand)) {
    play.stat.steals[p.side]++;
    play.msg = 'STOLEN  ' + p.card.name; play.msgT = 1.3;
    D.beep(700, 0.1, 'square', 0.05, 200);
    const dx = p.x - carrier.x, dz = p.z - carrier.z;
    loose(play.ball, carrier.x + dx * 0.4, len(1.1), carrier.z + dz * 0.4,
          dx * 1.6, launch(2.2), dz * 1.6);
    play.possession = p.side;
    play.shotClock = SHOT_CLOCK;
  } else {
    play.msg = nearHand ? 'REACHED AND MISSED' : 'WRONG HAND'; play.msgT = 0.9;
    D.beep(180, 0.07, 'square', 0.04);
  }
}

function basket(side) {
  const shot = play.ball.lastShot;
  const scorer = shot ? shot.by : null;
  const pts = shot && shot.threes && !shot.dunk ? 3 : 2;
  play.score[side] += pts;
  play.stat.made[side]++;
  play.msg = (shot && shot.dunk ? 'DUNK' : pts === 3 ? 'THREE' : 'TWO')
    + (scorer ? '   ' + scorer.card.name : '');
  play.msgT = 1.8;
  play.cheer = Math.max(play.cheer, 1.6);
  D.beep(760, 0.2, 'triangle', 0.06, 380);

  // the other side takes it in from under their own ring
  const inSide = other(side);
  play.possession = inSide;
  play.shotClock = SHOT_CLOCK;
  const x = -Math.sign(targetRim(inSide).x) * (COURT.halfLen - len(1.4));
  const taker = play.players.find((p) => p.side === inSide);
  loose(play.ball, x, len(1.3), 0, 0, 0, 0);
  if (taker) { taker.x = x; taker.z = 0; taker.y = 0; taker.cool = 0; play.ball.cool = 0.05; }
}

// =====================================================================
// THE CAMERA, AND THEREFORE THE AIMING
// =====================================================================
//
// Liam: *"the camera should be behind the player not 2D"*.
//
// That one change drags two others behind it, and they are the whole
// reason this section is long.
//
// FIRST, THE MOUSE CANNOT BE A POINT ON THE FLOOR ANY MORE. The old
// camera never moved, so a cursor cast onto the floorboards was a fixed
// thing to aim at. A camera sitting behind the man and turning with him
// would chase its own tail: he turns to face the cursor, the camera turns
// with him, the cursor now lands somewhere else on the floor, and he
// spins on the spot forever. So the mouse moves a CAMERA ANGLE, and what
// you are pointing at is whatever is under the crosshair in the middle of
// the screen.
//
// SECOND, PICKING A TARGET IS AN ANGLE, NOT A DISTANCE. A team-mate
// fifteen metres away is dead under the crosshair when you look at him,
// even though the crosshair's own point on the floor is six metres out -
// so a target is chosen by how far off the aiming RAY he is, which is
// exactly what "am I pointing at him" means. It is also what made
// passing work: the old two-and-a-half metre radius on the floor meant
// you could only pass to somebody already standing next to you.
//
// The pointer is captured on the first click so it can keep turning past
// the edge of the screen. Browsers are allowed to refuse that, so there
// is a fallback: push the cursor away from the middle and it steers. The
// crosshair means the same thing either way.
const aim = new THREE.Vector3();
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();

// ALL THREE ARE LENGTHS, so they go through the scale with everything
// else - a camera four and a half metres off a 1.52-metre man is a
// wildlife documentary.
// THE CAMERA IS NOT A PHYSICAL OBJECT, so these are composition rather
// than measurement - but they are still expressed in the same metres as
// everything else, because the thing being framed is a 1.47-metre man on
// a 21.8-metre floor and the numbers have to mean something next to his.
//
// It sits ABOVE HIS HEAD, not at his chest. At chest height on a smaller
// man the horizon rode up into the top of the frame and two thirds of
// the picture was roof; from up here you can see the floor he is running
// onto, which is the only reason the camera is behind him at all.
const CAM_DIST = len(5.6);      // how far behind him
const CAM_HIGH = len(1.9);      // the height it orbits about
const CAM_SIDE = len(-0.72);    // over which shoulder
const LOOK_SENS = 0.0030;  // radians per pixel of mouse
const PITCH_MIN = -0.10, PITCH_MAX = 0.62;

function mouseLook(dt) {
  if (D.locked) {
    const d = D.takeLook();
    play.camYaw -= d.dx * LOOK_SENS;
    play.camPitch = clamp(play.camPitch + d.dy * LOOK_SENS, PITCH_MIN, PITCH_MAX);
  } else {
    // NO LOCK: the cursor's distance from the middle of the screen is a
    // turning RATE instead. The dead zone is not optional - without it a
    // mouse resting an inch off centre turns him slowly forever.
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    play.camYaw -= dz((D.mouse.x / D.W - 0.5) * 2) * 3.1 * dt;
    play.camPitch = clamp(play.camPitch + dz((D.mouse.y / D.H - 0.5) * 2) * 1.3 * dt,
                          PITCH_MIN, PITCH_MAX);
  }
}

function updateCamera(dt) {
  const me = play.me;
  const cy = Math.cos(play.camPitch), sy = Math.sin(play.camPitch);
  // the way the camera looks: yaw around the floor, tipped by the pitch.
  // Yaw in this game is atan2(dx, dz), so zero is +Z.
  play.aimDir.set(Math.sin(play.camYaw) * cy, -sy, Math.cos(play.camYaw) * cy);
  const rx = Math.cos(play.camYaw), rz = -Math.sin(play.camYaw);   // screen left

  // HE SITS OFF TO ONE SIDE. A camera directly behind a man puts the back
  // of his head exactly where the crosshair is, and then you cannot see
  // what you are aiming at - which is the entire reason
  // over-the-shoulder exists as a shot.
  // THE CAMERA ONLY PARTLY FOLLOWS HIM UP.
  //
  // A jump is a metre and a half, and a camera that tracks it one for one
  // throws the whole arena down the screen and back every time he leaves
  // the floor - which is nauseating and hides the ring, the one thing he
  // is jumping at. Taking 45% of his height keeps him in frame and keeps
  // the horizon where it was.
  const px = me.x + rx * CAM_SIDE, py = me.y * 0.45 + CAM_HIGH, pz = me.z + rz * CAM_SIDE;

  // THE BOOM IS SHORTENED, NEVER SHOVED.
  //
  // The camera hangs behind him on an arm, and near a baseline or a
  // sideline that arm wants to be somewhere solid: the stands are a
  // staircase of boxes starting a metre and a half off the floor, and at
  // a low pitch the camera ended up INSIDE one of the treads - which
  // renders as the inside of a box, which is a flat grey screen. The
  // smoke test caught it as "5 distinct colours".
  //
  // Clamping the position was the first fix and it is the wrong one: a
  // camera that has been pushed sideways is no longer looking where the
  // crosshair says it is, and every aim in the game is a ray out of it.
  // So the ARM gets shorter instead. The view closes in on his back near
  // the edge of the floor and keeps pointing exactly where he is aiming.
  const bx = COURT.halfLen + len(1.2), bz = COURT.halfWid + len(1.2);
  const d = play.aimDir;
  let dist = play.camDist || CAM_DIST;
  const cap = (pos, dir, bound) => {
    if (Math.abs(dir) < 1e-6) return;
    // the arm runs along -dir, so it leaves the box at this length
    const t = dir > 0 ? (pos + bound) / dir : (pos - bound) / dir;
    if (t > 0) dist = Math.min(dist, t);
  };
  cap(px, d.x, bx);
  cap(pz, d.z, bz);
  if (d.y < -1e-6) dist = Math.min(dist, (len(9) - py) / -d.y);   // not into the roof
  if (d.y > 1e-6) dist = Math.min(dist, (py - len(0.75)) / d.y);  // not into the floor
  dist = Math.max(dist, len(1.5));                                // never inside him

  camPos.set(px - d.x * dist, Math.max(len(0.7), py - d.y * dist), pz - d.z * dist);

  // the position is smoothed and the DIRECTION is not: lagging the angle
  // makes the crosshair disagree with the mouse, which feels broken in a
  // way that a lagging position never does
  play.camPosV.lerp(camPos, play.settled ? 1 - Math.exp(-dt * 17) : 1);
  play.settled = true;
  camTgt.copy(play.camPosV).addScaledVector(play.aimDir, 7);
  if (!D.frozenCam) D.look(play.camPosV, camTgt);

  // WHERE THE CROSSHAIR LANDS ON THE FLOOR, capped - with the camera near
  // level that point is past the far wall, and a marker at infinity is
  // not a marker.
  const t = play.aimDir.y < -1e-3 ? -play.camPosV.y / play.aimDir.y : 1e3;
  const reach = Math.min(t, 13);
  aim.set(play.camPosV.x + play.aimDir.x * reach, 0,
          play.camPosV.z + play.aimDir.z * reach);
  aim.x = clamp(aim.x, -COURT.halfLen - 1, COURT.halfLen + 1);
  aim.z = clamp(aim.z, -COURT.halfWid - 1, COURT.halfWid + 1);
}

/**
 * Who is under the crosshair.
 *
 * The angle between the aiming ray and the line to his chest, with a
 * small distance term so a man standing right in front of you beats one
 * twelve metres behind him who happens to be on the same line.
 */
function pickTarget(filter, maxAng = 0.25) {
  const o = play.camPosV, d = play.aimDir;
  let best = null, bs = 1e9;
  for (const q of play.players) {
    if (filter && !filter(q)) continue;
    const vx = q.x - o.x, vy = (q.y + 1.15) - o.y, vz = q.z - o.z;
    const len = Math.hypot(vx, vy, vz) || 1e-6;
    const ang = Math.acos(clamp((vx * d.x + vy * d.y + vz * d.z) / len, -1, 1));
    if (ang > maxAng) continue;
    const score = ang + len * 0.004;
    if (score < bs) { bs = score; best = q; }
  }
  return best
    ? { p: best, ang: bs, d: Math.hypot(best.x - play.me.x, best.z - play.me.z) }
    : null;
}

// =====================================================================
// the human
// =====================================================================
function humanTurn(p, dt) {
  const carrier = play.players.find((q) => q.hasBall);

  // ---- WASD, RELATIVE TO THE CAMERA ---------------------------------
  // W is away from the camera, always, whichever way it is pointing -
  // the only scheme that survives a camera that rotates.
  const fx = Math.sin(play.camYaw), fz = Math.cos(play.camYaw);
  const rx = Math.cos(play.camYaw), rz = -Math.sin(play.camYaw);   // screen left
  let mx = 0, mz = 0;
  if (D.held('w', 'W', 'KeyW')) { mx += fx; mz += fz; }
  if (D.held('s', 'S', 'KeyS')) { mx -= fx; mz -= fz; }
  if (D.held('d', 'D', 'KeyD')) { mx -= rx; mz -= rz; }
  if (D.held('a', 'A', 'KeyA')) { mx += rx; mz += rz; }
  const m = Math.hypot(mx, mz);
  const sp = topSpeed(p.card) * (p.hasBall ? 0.93 : 1) * (p.charging ? 0.45 : 1);
  if (m > 0) { p.vx = mx / m * sp; p.vz = mz / m * sp; }
  else { p.vx *= 0.5; p.vz *= 0.5; }

  // ---- which way his body faces --------------------------------------
  // With the ball, or guarding the man who has it, he faces where you are
  // LOOKING: that is what the near-hand rule and a reach-in are measured
  // against, so it has to be the thing the mouse controls. Otherwise he
  // faces where he is running, because a man sprinting sideways down the
  // floor for ten seconds looks like a bug.
  const guarding = !p.hasBall && !!carrier && carrier.side !== p.side;
  const face = (p.hasBall || p.charging || guarding) ? play.camYaw
             : (m > 0.01 ? Math.atan2(mx, mz) : p.yaw);
  const rate = turnRate(p.card) * (p.hasBall || guarding ? 2.4 : 1);
  const diff = ((face - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  p.yaw += clamp(diff, -rate * dt, rate * dt);

  if (D.held('q', 'Q', 'KeyQ') && p.hand !== -1) { p.hand = -1; D.beep(300, .04, 'square', .03); }
  if (D.held('e', 'E', 'KeyE') && p.hand !== 1) { p.hand = 1; D.beep(340, .04, 'square', .03); }
  if (D.held(' ', 'Space') && !p.air) { p.vy = jumpSpeed(p.card); p.air = true; }

  // ---- what the crosshair is on --------------------------------------
  const mateT = p.hasBall ? pickTarget((q) => q.side === p.side && q !== p) : null;
  const thiefT = guarding ? pickTarget((q) => q === carrier, 0.38) : null;
  play.mateT = mateT; play.thiefT = thiefT;

  if (p.hasBall) {
    if (D.mouse.down && !p.charging && !p.pressLatch) {
      p.pressLatch = true;
      if (mateT) pass(p, mateT.p);
      else p.charging = true;
    }
    if (p.charging) {
      if (D.mouse.down) p.charge = Math.min(1, p.charge + dt * 0.85);
      else {
        const rim = targetRim(p.side);
        if (p.air && p.y > len(0.8) && Math.hypot(rim.x - p.x, rim.z - p.z) < len(1.4)) dunk(p);
        else shoot(p, p.charge);
        p.charging = false; p.charge = 0;
      }
    }
  } else if (D.mouse.down && !p.pressLatch) {
    p.pressLatch = true;
    if (thiefT && thiefT.d < len(2.2) && p.cool <= 0) stealAttempt(p, carrier);
  }
  if (!D.mouse.down) p.pressLatch = false;
  p.defending = guarding;
}

function nearestTo(point, filter) {
  let best = null, bd = 1e9;
  for (const q of play.players) {
    if (filter && !filter(q)) continue;
    const d = Math.hypot(q.x - point.x, q.z - point.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best ? { p: best, d: bd } : null;
}

// =====================================================================
// the NPCs
// =====================================================================
//
// Each of them answers the same three questions - do we have the ball, do
// I have the ball, where should I be - and every answer is rolled against
// that player's IQ. A mistake is not a random twitch: it is taking the
// SECOND best option, which is what a real bad decision looks like from
// the outside. So a low-IQ side passes into coverage, shoots from too
// far, and guards the wrong man.
function npcTurn(p, dt) {
  const b = play.ball;
  const carrier = play.players.find((q) => q.hasBall);
  const rim = targetRim(p.side);
  const ourBall = carrier && carrier.side === p.side;
  p.think -= dt;
  p.defending = !!carrier && !ourBall;

  let goX = p.x, goZ = p.z, jump = false;

  if (p.hasBall) {
    const dist = Math.hypot(rim.x - p.x, rim.z - p.z);
    const pressure = play.players.filter((q) => q.side !== p.side
      && Math.hypot(q.x - p.x, q.z - p.z) < len(1.8)).length;
    const openMate = bestOpenMate(p);

    if (p.think <= 0) {
      p.think = 0.22 + Math.random() * 0.3;
      const options = [];
      if (dist < len(1.8)) options.push({ what: 'dunk', worth: 9 });
      if (dist < len(7)) options.push({ what: 'shoot', worth: 7 - pressure * 2.2 - dist * 0.3 });
      else options.push({ what: 'shoot', worth: 4.4 - pressure * 2 - (dist - len(7)) * 0.5
                                    + norm(p.card.thr) * 2.5 });
      if (openMate) options.push({ what: 'pass', worth: 5 + openMate.open * 2.4 });
      options.push({ what: 'drive', worth: 5.2 - pressure * 0.9 + norm(p.card.spd) * 1.6 });
      options.sort((a, c) => c.worth - a.worth);
      const wrong = Math.random() < mistakeChance(p.card);
      p.plan = (wrong && options.length > 1 ? options[1] : options[0]).what;
      p.planMate = openMate ? openMate.p : null;
      // and if a crossover is on, take it: the ball goes to the hand away
      // from the nearest defender
      const near = nearestTo(p, (q) => q.side !== p.side);
      if (near && near.d < len(3)) {
        const rel = Math.sin(Math.atan2(near.p.z - p.z, near.p.x - p.x) - p.yaw);
        p.hand = rel > 0 ? -1 : 1;
      }
    }

    if (p.plan === 'dunk') {
      goX = rim.x - Math.sign(rim.x) * len(0.6); goZ = 0;
      if (dist < len(2.0) && !p.air) jump = true;
      if (p.air && p.y > len(0.8) && dist < len(1.4)) { dunk(p); p.plan = null; }
    } else if (p.plan === 'shoot') {
      p.charging = true;
      p.charge = Math.min(1, p.charge + dt * 0.85);
      const from = handPoint(p.model, p.hand, new THREE.Vector3());
      const need = speedToCharge(speedFor(from, rim));
      // they aim for a clean release; a worse IQ lets it go earlier or
      // later, which is exactly the accuracy penalty a human gets
      const slop = (1 - norm(p.card.iq)) * 0.14;
      if (p.charge >= need + rnd(-slop, slop)) {
        shoot(p, p.charge); p.charging = false; p.charge = 0; p.plan = null;
      }
    } else if (p.plan === 'pass' && p.planMate) {
      pass(p, p.planMate); p.plan = null;
    } else {
      goX = rim.x - Math.sign(rim.x) * len(1.4);
      goZ = (p.index - 1) * len(1.6);
      const near = nearestTo(p, (q) => q.side !== p.side);
      if (near && near.d < len(1.7)) goZ += (p.z > near.p.z ? len(2.4) : -len(2.4));
    }
  } else if (ourBall) {
    const spots = spacing(p.side, play.n);
    const spot = spots[p.index % spots.length];
    goX = spot.x; goZ = spot.z;
    if (carrier && play.players.some((q) => q.side !== p.side
        && Math.hypot(q.x - carrier.x, q.z - carrier.z) < len(1.4))) {
      // he is in trouble: come and help
      goX = lerp(goX, carrier.x - Math.sign(rim.x) * len(2.4), 0.6);
      goZ = lerp(goZ, carrier.z + (p.index % 2 ? len(2.6) : -len(2.6)), 0.6);
    }
  } else if (carrier) {
    if (!p.mark || p.think <= 0) {
      const them = play.players.filter((q) => q.side !== p.side);
      const byNear = them.slice().sort((a, c) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z));
      const slow = Math.random() < mistakeChance(p.card);
      p.mark = slow && byNear.length > 1 ? byNear[1] : (byNear[0] || carrier);
    }
    const m = p.mark || carrier;
    const own = targetRim(other(p.side));
    const ang = Math.atan2(own.z - m.z, own.x - m.x);
    goX = m.x + Math.cos(ang) * len(1.05);
    goZ = m.z + Math.sin(ang) * len(1.05);
    const dm = Math.hypot(m.x - p.x, m.z - p.z);
    if (m.hasBall && dm < len(1.8)) {
      if (m.charging && !p.air && Math.random() < 0.04 + norm(p.card.blk) * 0.06) jump = true;
      else if (p.cool <= 0 && Math.random() < 0.010 + norm(p.card.stl) * 0.018) stealAttempt(p, m);
    }
  } else if (p.react > 0) {
    // HE HAS NOT SEEN IT YET. See loose() - five men converging on a
    // loose ball the instant it comes free is why the human never got
    // one.
    p.react -= dt;
    goX = p.x; goZ = p.z;
  } else {
    // the ball is loose
    const eta = b.y > 0.6 ? 0.3 : 0;
    goX = b.x + b.vx * eta; goZ = b.z + b.vz * eta;
    if (b.y > len(1.7) && Math.hypot(b.x - p.x, b.z - p.z) < len(1.5) && !p.air
        && Math.random() < 0.05 + norm(p.card.blk) * 0.06) jump = true;
  }

  goX = clamp(goX, -COURT.halfLen + len(0.5), COURT.halfLen - len(0.5));
  goZ = clamp(goZ, -COURT.halfWid + len(0.5), COURT.halfWid - len(0.5));
  const dx = goX - p.x, dz = goZ - p.z;
  const d = Math.hypot(dx, dz);
  const sp = topSpeed(p.card) * (p.hasBall ? 0.93 : 1) * (p.charging ? 0.4 : 1);
  if (d > len(0.25)) {
    p.vx = dx / d * sp; p.vz = dz / d * sp;
    const want = Math.atan2(p.vx, p.vz);
    const diff = ((want - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.yaw += clamp(diff, -turnRate(p.card) * dt, turnRate(p.card) * dt);
  } else { p.vx *= 0.5; p.vz *= 0.5; }
  if (p.defending && p.mark) {
    const want = Math.atan2(p.mark.x - p.x, p.mark.z - p.z);
    const diff = ((want - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.yaw += clamp(diff, -turnRate(p.card) * dt, turnRate(p.card) * dt);
  }
  if (jump && !p.air) { p.vy = jumpSpeed(p.card); p.air = true; }
}

/** the best man to pass to, and how open he is */
function bestOpenMate(p) {
  let best = null;
  const rim = targetRim(p.side);
  for (const q of play.players) {
    if (q.side !== p.side || q === p) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < len(1.8) || d > len(18)) continue;
    const cover = play.players.filter((e) => e.side !== p.side
      && Math.hypot(e.x - q.x, e.z - q.z) < len(2)).length;
    const lane = play.players.filter((e) => e.side !== p.side
      && closestOnSegment(e, p, q).d < len(1.1)).length;
    const open = 1 - cover * 0.45 - lane * 0.5;
    const closer = Math.hypot(rim.x - q.x, rim.z - q.z) < Math.hypot(rim.x - p.x, rim.z - p.z) ? 0.5 : 0;
    const score = open + closer;
    if (!best || score > best.score) best = { p: q, d, open, score };
  }
  return best && best.open > -0.2 ? best : null;
}

/** where a side stands when it has the ball */
function spacing(side, n) {
  const rim = targetRim(side);
  const dir = Math.sign(rim.x);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({
      x: rim.x - dir * lerp(len(2.4), len(8.5), (i % 2) ? 0.85 : 0.3),
      z: lerp(-COURT.halfWid + len(1.8), COURT.halfWid - len(1.8), t),
    });
  }
  return out;
}

// =====================================================================
// a frame
// =====================================================================
function step(dt) {
  if (!play) {
    // the menu needs a cursor, so the game gives the pointer back
    if (D.locked) D.releaseLook();
    home.step(dt);
    return;
  }
  if (play.over) {
    drawWorld(dt);
    const won = play.score[0] > play.score[1];
    D.card(won ? 'YOU WIN' : (play.score[0] === play.score[1] ? 'TIED' : 'YOU LOSE'),
           [play.mine.short + ' ' + play.score[0] + '  —  ' + play.score[1] + ' ' + play.theirs.short,
            play.stat.made[0] + '/' + play.stat.shots[0] + ' from the floor',
            play.stat.steals[0] + ' steals · ' + play.stat.blocks[0] + ' blocks'],
           'click for the home screen');
    if (D.tapped()) { home.finish(won ? play.score[0] : null, { vs: play.theirs.short }); play = null; }
    return;
  }
  if (D.shot) {
    // A PHOTOGRAPH IS STILL A LIVE SCENE: the bodies are posed and the
    // nets simulated, the game rules are not. Without this the tools
    // could move a player and nothing would move.
    updateCamera(dt);
    // VY IS NOT OPTIONAL. posePlayer tucks the knees on the way up and
    // reaches for the floor on the way down, and it decides which by the
    // sign of s.vy - which none of these three call sites was passing,
    // so every jump in the game was posed as a descent. Found by looking
    // at the card and wondering why a man in the air was standing up.
    for (const p of play.players) posePlayer(p.model, dt, {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, air: p.air, vy: p.vy,
      hasBall: p.hasBall, hand: p.hand, action: p.action, actionT: p.actionT,
      defending: false });
    // and the ball rides in a hand, which only happens if this is called
    stepBall(0);
    for (const h of court.hoops) stepNet(h.net, dt, play.ball, BALL_R);
    drawWorld(dt); drawHud(); return;
  }

  play.clock -= dt;
  play.shotClock -= dt;
  if (play.msgT > 0) play.msgT -= dt;
  if (play.cheer > 0) play.cheer -= dt;
  if (play.clock <= 0) {
    play.clock = 0; play.over = true;
    // DRAIN THE PENDING CLICKS. Nothing reads the tap counter while a
    // match is running, so every click of the last three minutes is
    // still sitting in it - and the full-time card, which asks for a
    // click, would be answered by one of those and vanish before
    // anybody had read the score off it.
    D.tapped();
    if (play.score[0] > play.score[1]) D.record(play.score[0]);
    return;
  }
  if (play.shotClock <= 0) {
    play.shotClock = SHOT_CLOCK;
    const turn = other(play.possession);
    play.possession = turn;
    play.msg = 'SHOT CLOCK'; play.msgT = 1.4;
    const x = -Math.sign(targetRim(turn).x) * (COURT.halfLen - len(2));
    loose(play.ball, x, len(1.2), 0, 0, 0, 0);
  }

  // the mouse turns the camera, the camera decides what everything is
  // aimed at, and only then does anybody act on it
  mouseLook(dt);
  updateCamera(dt);

  for (const p of play.players) {
    if (p.cool > 0) p.cool -= dt;
    if (p === play.me) humanTurn(p, dt);
    else if (play.frozen) { p.vx = 0; p.vz = 0; }
    else npcTurn(p, dt);
  }

  for (const p of play.players) {
    p.stagger = Math.max(0, p.stagger - dt);
    if (p.thud > 0) p.thud -= dt;
    // A KNOCK LIVES OUTSIDE THE WALK.
    //
    // Every controller in this game WRITES p.vx each frame rather than
    // adding to it, so an impulse put there is gone by the next tick -
    // which is why the old code could not make a collision do anything.
    // p.bx is a second velocity that decays on its own and is added to
    // the walk, and a staggered man only has a third of his own legs for
    // a moment, so a shoulder actually moves somebody.
    const decay = Math.exp(-dt * 5.5);
    p.bx *= decay; p.bz *= decay;
    const ctrl = p.stagger > 0 ? 0.34 : 1;
    p.x += (p.vx * ctrl + p.bx) * dt;
    p.z += (p.vz * ctrl + p.bz) * dt;
    p.vy += G * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      if (p.air) { p.model.land = 1; D.beep(110, 0.04, 'sine', 0.03); }
      p.y = 0; p.vy = 0; p.air = false;
    }
    p.x = clamp(p.x, -COURT.halfLen + len(0.35), COURT.halfLen - len(0.35));
    p.z = clamp(p.z, -COURT.halfWid + len(0.35), COURT.halfWid - len(0.35));
    p.speed = Math.hypot(p.vx * ctrl + p.bx, p.vz * ctrl + p.bz);
    if (p.action) {
      p.actionT += dt * 2.4;
      if (p.actionT > 1) { p.action = null; p.actionT = 0; }
    }
  }

  // ---- CONTACT --------------------------------------------------------
  //
  // Liam: *"people don't bump into each other"*.
  //
  // They did not. The old code moved two overlapping players apart by
  // half the overlap each and stopped there, so running into somebody was
  // a silent sideways slide with no weight in it at all. A bump is now
  // three things: they stop overlapping, the CLOSING SPEED becomes a
  // knock shared out by weight, and a hard one takes both men's footing
  // away for a moment. Contact between two big men at a combined 20 m/s
  // now looks and reads like contact.
  // shoulder to shoulder: two people standing as close as two people do
  const CONTACT = len(0.8);
  for (let i = 0; i < play.players.length; i++) {
    for (let j = i + 1; j < play.players.length; j++) {
      const a = play.players[i], c = play.players[j];
      // a man in the air over somebody is not touching him
      if (Math.abs(a.y - c.y) > len(1.15)) continue;
      const dx = c.x - a.x, dz = c.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > CONTACT || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      const ma = a.mass, mc = c.mass, tm = ma + mc;
      // 1. out of each other, the lighter man giving the more ground
      const over = CONTACT - d;   // both in scaled metres
      a.x -= nx * over * (mc / tm); a.z -= nz * over * (mc / tm);
      c.x += nx * over * (ma / tm); c.z += nz * over * (ma / tm);
      // 2. THE CLOSING SPEED BECOMES A KNOCK, as a real impulse:
      //
      //     j = -(1 + e) * v_closing / (1/ma + 1/mc)
      //
      // with a restitution of a quarter, which is about what two people
      // running into each other do - they mostly stop, and rock back a
      // little. The first version scaled the closing speed by 0.9 and
      // split it by weight, which works out to a restitution of about
      // MINUS a tenth: the two of them cancelled out and stood there
      // still leaning into one another. Both men have to come off it.
      const rel = ((c.vx + c.bx) - (a.vx + a.bx)) * nx
                + ((c.vz + c.bz) - (a.vz + a.bz)) * nz;
      if (rel >= -0.4) continue;
      const imp = -(1 + 0.25) * rel / (1 / ma + 1 / mc);
      a.bx -= nx * imp / ma; a.bz -= nz * imp / ma;
      c.bx += nx * imp / mc; c.bz += nz * imp / mc;
      if (rel > -len(3.4)) continue;
      // 3. a real collision: both lose a step, the heavier one less
      a.stagger = Math.max(a.stagger, 0.14 + -rel * 0.026 * (mc / tm));
      c.stagger = Math.max(c.stagger, 0.14 + -rel * 0.026 * (ma / tm));
      if (a.thud <= 0 && c.thud <= 0) {
        D.noise(0.13, 0.05, 130);
        a.thud = 0.4; c.thud = 0.4;
      }
      // AND THE BALL CAN COME OUT OF HIS HANDS. Rarely, and only on a
      // hard shoulder from the other side - because a game where contact
      // can never cost possession is a game where driving into three men
      // is free.
      const hit = a.hasBall ? a : c.hasBall ? c : null;
      if (!hit) continue;
      const by = hit === a ? c : a;
      if (by.side === hit.side || rel > -len(5.5)) continue;
      if (Math.random() > 0.2 * (by.mass / hit.mass)) continue;
      const ax = hit === a ? -nx : nx, az = hit === a ? -nz : nz;
      play.msg = 'KNOCKED LOOSE'; play.msgT = 1.1;
      loose(play.ball, hit.x + ax * len(0.34), len(1.15), hit.z + az * len(0.34),
            ax * len(2.8), launch(2.6), az * len(2.8));
      hit.cool = 0.4;
    }
  }

  stepBall(dt);

  for (const h of court.hoops) stepNet(h.net, dt, play.ball, BALL_R);
  for (const p of play.players) {
    posePlayer(p.model, dt, {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, air: p.air, vy: p.vy,
      hasBall: p.hasBall, hand: p.hand, action: p.action, actionT: p.actionT,
      defending: p.defending && !p.hasBall,
    });
  }

  drawWorld(dt);
  drawHud();
}

function stepBall(dt) {
  const b = play.ball;
  if (b.cool > 0) b.cool -= dt;

  if (b.carrier) {
    // it rides in the carrying hand and bounces on the floor between
    // dribbles, which is what makes the hand visible - and the hand is
    // what defence is about
    const h = handPoint(b.carrier.model, b.carrier.hand, new THREE.Vector3());
    // THE BALL FOLLOWS THE SAME PHASE THE HAND DOES. posePlayer works
    // out a skewed dribble phase - fast push down, slow ride back up -
    // and writes it to dribblePhase. Using a plain sine here instead put
    // the ball at the floor while the hand was still on its way down.
    const low = b.carrier.model.dribblePhase || 0;
    b.x = h.x; b.z = h.z;
    b.y = b.carrier.air ? h.y : lerp(h.y, BALL_R + len(0.02), low * 0.85);
    b.vx = b.carrier.vx; b.vz = b.carrier.vz;
    return;
  }

  b.vy += G * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

  if (b.y < BALL_R) {
    b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.74;
    b.vx *= 0.94; b.vz *= 0.94;
    if (Math.abs(b.vy) > 0.8) D.beep(150, 0.05, 'sine', 0.04);
  }
  // IT HAS TO SETTLE. A ball that keeps its speed through every bounce
  // skitters the length of the floor and nobody ever gets to it, which
  // was the other half of "its hard to get the ball". Once it is low and
  // slow, the floor takes the pace off it.
  if (b.y < BALL_R + len(0.06) && Math.abs(b.vy) < launch(2.4)) {
    const f = Math.exp(-dt * 2.1);
    b.vx *= f; b.vz *= f;
  }
  const wallX = COURT.halfLen + len(1.6), wallZ = COURT.halfWid + len(1.6);
  if (Math.abs(b.x) > wallX) { b.x = Math.sign(b.x) * wallX; b.vx *= -0.6; }
  if (Math.abs(b.z) > wallZ) { b.z = Math.sign(b.z) * wallZ; b.vz *= -0.6; }

  for (const h of court.hoops) {
    const rx = h.side * COURT.rimX;
    const bx = h.side * COURT.boardX;
    if (Math.abs(b.x - bx) < BALL_R + len(0.04) && Math.abs(b.z) < COURT.boardW / 2
        && b.y > COURT.rimY - len(0.2) && b.y < COURT.rimY + len(1.4)) {
      b.x = bx - h.side * (BALL_R + len(0.04));
      b.vx *= -0.62;
      D.beep(190, 0.07, 'square', 0.05);
    }
    // THE RING AS A TORUS: the nearest point on the ring circle, then a
    // sphere bounce off it. This is what makes a shot rattle in or out
    // instead of passing through metal.
    const dx = b.x - rx, dz = b.z;
    const flat = Math.hypot(dx, dz);
    if (flat > 1e-5) {
      const nx = rx + dx / flat * COURT.rimR, nz = dz / flat * COURT.rimR;
      const ddx = b.x - nx, ddy = b.y - COURT.rimY, ddz = b.z - nz;
      const d = Math.hypot(ddx, ddy, ddz);
      if (d < BALL_R + len(0.02) && d > 1e-5) {
        const ux = ddx / d, uy = ddy / d, uz = ddz / d;
        b.x = nx + ux * (BALL_R + len(0.02));
        b.y = COURT.rimY + uy * (BALL_R + len(0.02));
        b.z = nz + uz * (BALL_R + len(0.02));
        const dot = b.vx * ux + b.vy * uy + b.vz * uz;
        b.vx = (b.vx - 2 * dot * ux) * 0.52;
        b.vy = (b.vy - 2 * dot * uy) * 0.52;
        b.vz = (b.vz - 2 * dot * uz) * 0.52;
        D.beep(230, 0.06, 'square', 0.05);
      }
    }
    if (!b.scored && b.vy < 0 && b.y < COURT.rimY && b.y > COURT.rimY - len(0.55)
        && Math.hypot(b.x - rx, b.z) < COURT.rimR - len(0.03)) {
      b.scored = true;
      basket(h.side > 0 ? 0 : 1);
      return;
    }
  }
  if (b.y < len(0.5)) b.scored = false;

  if (!b.carrier && b.cool <= 0) {
    for (const p of play.players) {
      if (p.cool > 0) continue;
      // MEASURED FROM HIS MIDDLE, NOT HIS CHEST. The old pickup point was
      // at 1.15 with a reach of 0.8, which means a ball sitting on the
      // floor at his own feet was a metre away and out of reach. That is
      // the bug Liam actually hit.
      const d = Math.hypot(b.x - p.x, b.y - (p.y + len(0.95)), b.z - p.z);
      const reach = len(1.15 + (p.air ? 0.6 : 0) + norm(p.card.blk) * 0.25);
      if (d < reach) {
        giveBall(p);
        D.beep(500, 0.05, 'triangle', 0.04);
        break;
      }
    }
  }
}

// =====================================================================
// drawing
// =====================================================================
function drawWorld(dt) {
  const b = play.ball;
  ballMesh.position.set(b.x, b.y, b.z);
  ballMesh.rotation.x += (b.vz * dt) / BALL_R * 0.4;
  ballMesh.rotation.z -= (b.vx * dt) / BALL_R * 0.4;
  ballShadow.position.set(b.x, 0.013, b.z);
  const hgt = clamp(1 - b.y / len(5), 0.25, 1);
  ballShadow.scale.setScalar(hgt);
  ballShadow.material.opacity = 0.3 * hgt;

  // THE CAMERA IS DONE AT THE TOP OF THE FRAME, in updateCamera(), because
  // everything the human does this tick is aimed through it - working it
  // out down here would aim him with last frame's view.

  const me = play.me;
  // THE MARKER GOES ON WHOEVER IS UNDER THE CROSSHAIR, and only falls
  // back to a ring on the floor when that is nobody. A ring at the
  // crosshair's ground point does not answer the question a player is
  // actually asking, which is "will this pass go to him".
  const t = play.mateT || play.thiefT;
  if (t) {
    aimRing.position.set(t.p.x, 0.02, t.p.z);
    aimRing.scale.setScalar(1.15);
    aimRing.material.color.set(play.mateT ? 0x8fd98f : 0xff6b8b);
  } else {
    aimRing.position.set(aim.x, 0.02, aim.z);
    aimRing.scale.setScalar(0.72);
    aimRing.material.color.set(0xffd166);
  }

  if (me.charging) {
    const rim = targetRim(me.side);
    const from = handPoint(me.model, me.hand, new THREE.Vector3());
    const speed = chargeToSpeed(Math.max(me.charge, 0.12));
    const sol = solveArc(from, rim, speed);
    let x = from.x, y = from.y, z = from.z;
    let vx = Math.cos(sol.ang) * speed * sol.dir.x;
    let vy = Math.sin(sol.ang) * speed;
    let vz = Math.cos(sol.ang) * speed * sol.dir.z;
    for (let i = 0; i < 34; i++) {
      arcPts[i * 3] = x; arcPts[i * 3 + 1] = y; arcPts[i * 3 + 2] = z;
      for (let k = 0; k < 2; k++) { vy += G * 0.02; x += vx * 0.02; y += vy * 0.02; z += vz * 0.02; }
    }
    arcGeo.attributes.position.needsUpdate = true;
    arcLine.computeLineDistances();
    arcLine.visible = true;
  } else arcLine.visible = false;
}

function drawHud() {
  const s = play.score;
  const mm = Math.floor(play.clock / 60), ss = Math.floor(play.clock % 60);
  D.hud(play.mine.short + '  ' + s[0] + '   —   ' + s[1] + '  ' + play.theirs.short,
        mm + ':' + String(ss).padStart(2, '0') + '    SHOT ' + Math.ceil(play.shotClock));
  if (play.msgT > 0) D.text(play.msg, D.W / 2, 82, 22, '#ffd166', 'center');

  // ---- THE CROSSHAIR --------------------------------------------------
  // With the camera behind him the middle of the screen IS the aim, and
  // the cursor is either captured or beside the point - so the thing you
  // are pointing with has to be drawn. It turns green over a team-mate
  // you can pass to and red over the man you can reach in on, which is
  // the only feedback the scheme needs.
  //
  // NONE OF IT BELONGS IN A PHOTOGRAPH, though: a crosshair and a line
  // of instructions across the middle of the card on the home page is
  // furniture, not the game.
  if (!D.shot) {
    const g = D.g;
    const cx = Math.round(D.W / 2), cy = Math.round(D.H / 2);
    const col = play.mateT ? '#8fd98f' : play.thiefT ? '#ff6b8b' : 'rgba(255,255,255,.82)';
    g.strokeStyle = col; g.lineWidth = 2;
    g.beginPath();
    for (const [a, b] of [[-14, -5], [5, 14]]) {
      g.moveTo(cx + a, cy); g.lineTo(cx + b, cy);
      g.moveTo(cx, cy + a); g.lineTo(cx, cy + b);
    }
    g.stroke();
    g.fillStyle = col; g.fillRect(cx - 1, cy - 1, 2, 2);

    if (!D.locked) {
      // THE FALLBACK STEER NEEDS AN INSTRUMENT. Without the pointer lock
      // the input is how far the cursor sits from the middle, and a
      // player cannot see that - so it is drawn as a slider.
      const bx = cx - 92, by = D.H - 96;
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(bx, by, 184, 2);
      g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(cx - 14, by - 3, 28, 8);
      g.fillStyle = '#ffd166';
      g.fillRect(clamp(D.mouse.x, bx, bx + 184) - 2, by - 6, 4, 14);
      D.text('click to capture the mouse - or push it off centre to turn',
             cx, by - 12, 10, '#8b96a8', 'center');
    }
  }

  const me = play.me;
  D.text(me.card.name + '  #' + me.card.num + '  ' + me.card.pos, 14, D.H - 34, 12, '#e7ecf3');
  D.text('SHT ' + me.card.sht + '   3PT ' + me.card.thr + '   HND ' + me.card.hnd
         + '   STL ' + me.card.stl + '   SPD ' + me.card.spd, 14, D.H - 18, 11, '#8b96a8');
  D.text(me.hand > 0 ? 'BALL IN THE RIGHT HAND · Q to switch' : 'BALL IN THE LEFT HAND · E to switch',
         D.W - 14, D.H - 18, 11, me.hasBall ? '#ffd166' : '#4a5666', 'right');

  // the charge bar, with the clean-release band marked on it
  if (me.charging) {
    const rim = targetRim(me.side);
    const from = handPoint(me.model, me.hand, new THREE.Vector3());
    const need = speedToCharge(speedFor(from, rim));
    const win = releaseWindow(me.card);
    const g = D.g;
    const x = D.W / 2 - 130, y = D.H - 74, w = 260;
    g.fillStyle = 'rgba(8,12,18,.75)'; g.fillRect(x, y, w, 14);
    g.fillStyle = 'rgba(143,217,143,.4)';
    g.fillRect(x + w * clamp(need - win, 0, 1), y, w * Math.min(win * 2, 1), 14);
    g.fillStyle = Math.abs(me.charge - need) < win ? '#8fd98f' : '#ffd166';
    g.fillRect(x, y, w * me.charge, 14);
    g.fillStyle = '#ffffff';
    g.fillRect(x + w * clamp(need, 0, 1) - 1, y - 3, 2, 20);
    D.text('RELEASE IN THE GREEN', D.W / 2, y - 8, 10, '#8b96a8', 'center');
  }
}

// =====================================================================
// the home screen: pick a team, read the roster, tip off
// =====================================================================
board = new Board('dunk', { unit: 'POINTS' });
home = new Home(D, {
  title: 'DUNK',
  lines: ['WASD to move · the mouse looks, from behind your shoulder',
          'the crosshair is the aim: on a team-mate it passes, elsewhere',
          'hold to shoot and release in the green · Q and E swap hands'],
  board,
  buttons: [
    { label: 'TIP OFF', sub: 'three minutes, three a side', fn: () => startMatch(myTeamId, 3) },
    { label: 'FIVE A SIDE', sub: 'the whole team, and it is busy', fn: () => startMatch(myTeamId, 5) },
  ],
  hint: 'SPACE jumps · get up at the ring with the ball and it is a dunk',
  wash: 'rgba(6,10,16,.84)',
  panel: {
    draw: (Dd, x, y, w) => {
      Dd.text('YOUR TEAM', x, y + 12, 10, '#5a6577');
      panelHits.length = 0;
      let cx = x;
      for (const t of TEAMS) {
        const on = t.id === myTeamId;
        const bw = Math.min(88, (w - 8) / TEAMS.length - 5);
        Dd.g.fillStyle = on ? t.home : 'rgba(255,255,255,.06)';
        Dd.g.fillRect(cx, y + 20, bw, 32);
        Dd.g.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,.18)';
        Dd.g.lineWidth = on ? 2 : 1;
        Dd.g.strokeRect(cx + 0.5, y + 20.5, bw - 1, 31);
        Dd.text(t.short, cx + bw / 2, y + 40, 12, on ? '#ffffff' : '#8b96a8', 'center');
        panelHits.push({ x: cx, y: y + 20, w: bw, h: 32, id: t.id });
        cx += bw + 5;
      }
      const t = teamById(myTeamId);
      Dd.text(t.name, x, y + 72, 13, '#e7ecf3');
      let ry = y + 90;
      for (const r of t.roster) {
        Dd.text('#' + String(r.num).padStart(2, ' ') + '  ' + r.name, x, ry, 11, '#cbd6e4');
        Dd.text(r.pos + '   ' + overall(r), x + w - 6, ry, 11, '#8b96a8', 'right');
        ry += 15;
      }
      Dd.text('you play #' + t.roster[0].num + ', ' + t.roster[0].name
              + ' — the rest of the five play themselves', x, ry + 12, 10, '#5a6577');
      return 112 + t.roster.length * 15;
    },
    click: (Dd) => {
      for (const h of panelHits) {
        if (Dd.mouse.x > h.x && Dd.mouse.x < h.x + h.w && Dd.mouse.y > h.y && Dd.mouse.y < h.y + h.h) {
          myTeamId = h.id;
          Dd.beep(520, 0.06, 'triangle', 0.05, 140);
          return;
        }
      }
    },
  },
});

// ---- the card on the deck's home page --------------------------------
if (D.shot) {
  startMatch(TEAMS[0].id, 3);
  const p = play;
  p.score = [18, 14]; p.clock = 96;
  // A CARD IS A PHOTOGRAPH, AND A PHOTOGRAPH NEEDS ROOM.
  //
  // The playing camera sits four and a half metres off his shoulder,
  // which is right for playing and too tight for a picture: the first
  // version of this card was one man's back filling the frame with the
  // ring cut off above him. So the boom goes out to nine metres and
  // tilts down, which puts the whole play in it - him rising, the man
  // coming across to block, the ring, and the stand behind.
  const rim = targetRim(0);
  p.players[0].x = rim.x - 1.5; p.players[0].z = 0.25; p.players[0].y = 1.55; p.players[0].air = true;
  p.players[0].vy = 2.4;
  p.players[0].yaw = Math.PI / 2; p.players[0].action = 'shoot'; p.players[0].actionT = 0.62;
  p.players[1].x = 5.2; p.players[1].z = -2.6;
  p.players[2].x = 6.4; p.players[2].z = 2.9;
  p.players[3].x = rim.x - 2.6; p.players[3].z = 1.45; p.players[3].y = 1.05; p.players[3].air = true;
  p.players[3].vy = 1.2;
  p.players[3].action = 'block'; p.players[3].actionT = 0.5; p.players[3].yaw = -Math.PI / 2;
  p.players[4].x = 4.1; p.players[4].z = -3.6;
  p.players[5].x = 7.6; p.players[5].z = 3.5;
  // the ball in the shooting hand, so the picture has a ball in it
  p.ball.carrier = p.players[0];
  p.players[0].hasBall = true;
  p.msg = 'DUNK'; p.msgT = 4; p.cheer = 2;
  // behind the man going up, looking at the ring he is going to
  p.camYaw = Math.PI / 2; p.camPitch = 0.20; p.camDist = len(7.4);
  for (let i = 0; i < 60; i++) {
    for (const h of court.hoops) stepNet(h.net, 1 / 60, p.ball, BALL_R);
    for (const q of p.players) posePlayer(q.model, 1 / 60, {
      x: q.x, y: q.y, z: q.z, yaw: q.yaw, speed: 0, air: q.air, vy: q.vy,
      hasBall: q.hasBall, hand: q.hand, action: q.action, actionT: q.actionT,
      defending: false });
  }
}

// =====================================================================
// what the tools look at
// =====================================================================
window.__deck3d = D;   // the tools park the camera through this
window.__dunk = {
  state: () => play ? ({
    menu: false, over: play.over, score: play.score.slice(), clock: play.clock,
    shotClock: play.shotClock, msg: play.msg, possession: play.possession,
    n: play.n, mine: play.mine.short, theirs: play.theirs.short,
    ball: { x: +play.ball.x.toFixed(2), y: +play.ball.y.toFixed(2), z: +play.ball.z.toFixed(2),
            carried: !!play.ball.carrier,
            carrierSide: play.ball.carrier ? play.ball.carrier.side : null },
    players: play.players.map((p) => ({ side: p.side, name: p.card.name, x: +p.x.toFixed(2),
      y: +p.y.toFixed(2), z: +p.z.toFixed(2), hasBall: p.hasBall, hand: p.hand, air: p.air,
      h: +p.model.height.toFixed(2), action: p.action })),
    stat: play.stat, rim: targetRim(0),
    cam: { yaw: +play.camYaw.toFixed(3), pitch: +play.camPitch.toFixed(3),
           x: +play.camPosV.x.toFixed(2), y: +play.camPosV.y.toFixed(2),
           z: +play.camPosV.z.toFixed(2), locked: !!D.locked },
    aim: { x: +aim.x.toFixed(2), z: +aim.z.toFixed(2) },
    onMate: play.mateT ? play.mateT.p.card.name : null,
    input: { down: !!D.mouse.down, latch: !!play.me.pressLatch,
             charging: !!play.me.charging, charge: +play.me.charge.toFixed(2) },
    onThief: play.thiefT ? play.thiefT.p.card.name : null,
    court: { halfLen: +COURT.halfLen.toFixed(2), halfWid: +COURT.halfWid.toFixed(2),
             rimY: +COURT.rimY.toFixed(2), scale: SCALE },
  }) : ({ menu: true, buttons: (home.hot || []).map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h })) }),
  give: (i, x, z, y) => {
    const p = play.players[i];
    p.x = x; p.z = z; p.y = y || 0; p.air = (y || 0) > 0.01;
    giveBall(p);
  },
  put: (i, x, z, y) => {
    const p = play.players[i];
    p.x = x; p.z = z;
    if (y !== undefined) { p.y = y; p.air = y > 0.01; }
  },
  shootNow: (i, charge) => shoot(play.players[i], charge === undefined ? 0.5 : charge),
  perfectShot: (i) => {
    const p = play.players[i];
    const from = handPoint(p.model, p.hand, new THREE.Vector3());
    shoot(p, speedToCharge(speedFor(from, targetRim(p.side))));
  },
  passNow: (i, j) => pass(play.players[i], play.players[j]),
  dunkNow: (i) => dunk(play.players[i]),
  stealNow: (i, j) => stealAttempt(play.players[i], play.players[j]),
  setScore: (a, b2) => { play.score[0] = a; play.score[1] = b2; },
  setClock: (t) => { play.clock = t; },
  start: (n) => startMatch(myTeamId, n || 3),
  // point the camera somewhere, so a test can aim without a real mouse
  look: (yaw, pitch) => {
    play.camYaw = yaw;
    if (pitch !== undefined) play.camPitch = pitch;
    updateCamera(1 / 60);
    // and again, because the position is smoothed towards the target
    for (let i = 0; i < 20; i++) updateCamera(1 / 60);
    return { yaw: play.camYaw, aim: { x: +aim.x.toFixed(2), z: +aim.z.toFixed(2) } };
  },
  // drop the ball on the floor, for the pickup test
  drop: (x, z, y) => {
    loose(play.ball, x, y === undefined ? BALL_R : y, z, 0, 0, 0);
    play.ball.cool = 0;
    return { x: play.ball.x, y: play.ball.y, z: play.ball.z };
  },
  // and let the NPCs see it immediately, when a test is not about them
  wake: () => { for (const q of play.players) q.react = 0; },
  // HOLD THE OTHER NINE STILL.
  //
  // An NPC put somewhere by a test is running back to where he thinks he
  // should be by the next frame, at eleven metres a second - which is
  // the game working, and which makes any test about a position or an
  // angle fail at random. This is the only way to ask a question about
  // one thing at a time.
  freeze: (on) => { play.frozen = on !== false; },
  // face a player, which is what "point the crosshair at him" means
  faceAt: (i) => {
    const q = play.players[i], me = play.me;
    const yaw = Math.atan2(q.x - me.x, q.z - me.z);
    play.camYaw = yaw; play.camPitch = 0.22;
    for (let k = 0; k < 24; k++) updateCamera(1 / 60);
    return yaw;
  },
  // RUN ONE BUMP.
  //
  // The closing speed is put into bx, not vx, and that is not a cheat:
  // every controller in the game WRITES vx from scratch each frame, so a
  // velocity set from outside is gone before the contact test ever sees
  // it. bx is the channel a knock actually travels on, which makes it
  // the right one to drive a test with too.
  bump: (i, j) => {
    const a = play.players[i], c = play.players[j];
    a.x = -0.35; a.z = 0; a.y = 0; a.vx = 0; a.vz = 0; a.bx = 9; a.bz = 0; a.stagger = 0;
    c.x = 0.35; c.z = 0; c.y = 0; c.vx = 0; c.vz = 0; c.bx = -9; c.bz = 0; c.stagger = 0;
    return { gap: +Math.abs(c.x - a.x).toFixed(2) };
  },
  bumpState: (i, j) => {
    const a = play.players[i], c = play.players[j];
    return { a: { x: +a.x.toFixed(2), bx: +a.bx.toFixed(2), stagger: +a.stagger.toFixed(2) },
             c: { x: +c.x.toFixed(2), bx: +c.bx.toFixed(2), stagger: +c.stagger.toFixed(2) },
             gap: +Math.hypot(c.x - a.x, c.z - a.z).toFixed(2) };
  },
};

D.run(step);
