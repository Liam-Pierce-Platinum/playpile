// =====================================================================
// HOOPS - drag anywhere, let go, keep the streak alive
// =====================================================================
//
// Liam: *"better net graphics with realistic physics a real 3D lowpoly
// model of a person should shoot and lowpoly model should cheer from the
// stands too for hoops"*.
//
// THREE THINGS ARE REAL IN HERE NOW.
//
//   THE SHOOTER is a low-poly person - shins, thighs, torso, arms, head,
//   built out of boxes with joints that actually rotate - and the shot is
//   an animation of that body: he dips into the knees while you pull, and
//   the ball leaves his hands at the top of the extension. The ball does
//   not appear out of the air any more; it comes off him.
//
//   THE NET IS SIMULATED. Twelve strands of five beads, pinned to the rim
//   and otherwise free: verlet points with distance constraints to the
//   bead above and to their neighbours round the ring. The ball pushes
//   the beads out of its way as it goes through, the net snaps back, and
//   that is the shot's own replay - you can see from the net whether it
//   went in clean or scraped the rim.
//
//   THE CROWD ARE PEOPLE, not spheres: the same low-poly body at a
//   quarter scale, seated in tiers, who stand up and throw their arms
//   over their heads when a shot goes in and sit back down after it.
//
// The rule that decides how people play is unchanged: a swish stacks the
// multiplier and a rim-in resets it. Both go in, only one pays.
import { Deck3D, THREE, mat, box, sphere, cyl, paint, clamp, rnd, lerp, pick } from '../_deck/deck3d.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';
import { person, HIP_Y } from './kit.js';
import { playerOutfit, wardrobePanel, coins as coinsNow } from './wardrobe.js';
import { Net, packInput } from './net.js';
let panelTab = 'match';
let venueKind = (() => { try { return localStorage.getItem('pd.hoops.venue') || 'street'; } catch (e) { return 'street'; } })();
let panelHot = [];

// =====================================================================
// ONLINE. Liam: "add online multiplay through the site".
//
// PLAYPILE has no server, so a match is peer to peer: one player hosts and
// the others join with a four-letter room code (net.js explains the whole
// arrangement). Everything here is the front of it - the code on the
// screen, the four letters you type, and pumping the wire once a frame.
// =====================================================================
const online = {
  net: null, role: null, code: '', status: '', kind: '',
  entry: '', typing: false, sendT: 0, stateT: 0, seat: 0,
};

function onlineStatus(text, kind) { online.status = text; online.kind = kind; }

async function hostOnline() {
  online.net = new Net({
    onStatus: onlineStatus,
    onInput: (slot, d) => { if (half) half.netInput(slot, d); },
    onJoin: () => { if (half) half.say('A PLAYER JOINED', 1.6); },
    onLeave: () => { if (half) half.say('A PLAYER LEFT', 1.6); },
  });
  online.role = 'host';
  onlineStatus('opening a room...', 'waiting');
  try {
    online.code = await online.net.host(3);
    startHalf('half');
    half.setNet(online.net, 'host', 0);
    half.say('ROOM ' + online.code, 3);
  } catch (e) {
    online.role = null;
  }
}

async function joinOnline(code) {
  online.net = new Net({
    onStatus: onlineStatus,
    onState: (snap) => { if (half) half.netApply(snap); },
  });
  online.role = 'guest';
  onlineStatus('connecting to ' + code + '...', 'waiting');
  try {
    const seat = await online.net.join(code);
    online.seat = seat;
    online.code = code;
    startHalf('half');
    half.setNet(online.net, 'guest', seat);
    half.say('YOU ARE IN', 2);
  } catch (e) {
    online.role = null;
    online.net = null;
  }
}

/** the wire, pumped once a frame: state out if hosting, hands out if not */
function pumpNet(dt) {
  if (!online.net || !half) return;
  if (online.role === 'host') {
    online.stateT -= dt;
    if (online.stateT <= 0) {
      online.stateT = 1 / 20;
      online.net.sendState(half.netSnapshot(performance.now()));
    }
  } else if (online.role === 'guest') {
    online.sendT -= dt;
    if (online.sendT <= 0) {
      online.sendT = 1 / 30;
      online.net.sendInput(packInput(half.you, half.netTakeInput()));
    }
  }
}

function leaveOnline() {
  if (online.net) online.net.close();
  online.net = null; online.role = null; online.status = ''; online.code = '';
}

// TYPING A ROOM CODE. The home screen is a canvas, so there is no text box
// to put a cursor in: while the join prompt is up this listener collects
// letters, Enter connects and Escape gives up.
addEventListener('keydown', (e) => {
  if (!online.typing) return;
  if (e.key === 'Escape') { online.typing = false; online.entry = ''; return; }
  if (e.key === 'Enter') {
    if (online.entry.length >= 4) { const c = online.entry; online.typing = false; online.entry = ''; joinOnline(c); }
    return;
  }
  if (e.key === 'Backspace') { online.entry = online.entry.slice(0, -1); return; }
  const ch = e.key.toUpperCase();
  if (/^[A-Z0-9]$/.test(ch) && online.entry.length < 4) online.entry += ch;
});
import { HalfCourt, FLOOR as HALF_FLOOR } from './half.js';

// A BASKETBALL COURT IS A WIDE THING AND THIS WAS A TALL WINDOW.
//
// Liam: "on the official site its impossible to move in the hoops game".
// It was not the controls - they work, and tools/livehoops.mjs proves it.
// It was the shape. 520 x 680 is a phone held upright, and playpile.net
// gives a game a wide stage, so HOOPS ran as a narrow vertical strip down
// the middle of it with black either side: the court squeezed into a
// sliver, the men the size of a fingernail, and the home screen stacked
// into one thin column with the scoreboard pushed off the bottom. You
// could move. You just could not see that you had.
//
// Landscape fixes all of it at once. Home (see _deck/home.js) lays out in
// TWO columns above 620 wide, so the buttons and the high scores stop
// fighting for the same strip; and `units` goes up with the width so the
// same amount of court is still in shot - the extra pixels go into the
// floor either side, which is where the running happens.
const D = new Deck3D({ key: 'hoops', w: 960, h: 600, units: 28, bg: '#101826',
                       tilt: 0.13, scale: 2 });

const G = -17;
const FLOOR = -5.4;
const BALL_R = 0.42;
const RIM_R = 0.72;
const SPOT = { x: -5.0, y: FLOOR };

let ball, hoop, drag, score, mult, ballsLeft, over, started, wind, msg, msgT, trail, spin, shooter, cheer;

// ---------------------------------------------------------------------
// THREE GAMES IN ONE. Liam: "make hoops have the stand still mdoe but the
// main game mode should be like dunk", and then "make it so there can also
// be full court".
//
// STAND STILL is the game this file has always been: one spot, ten balls,
// a moving hoop and a streak. HALF COURT and FULL COURT are the main ones
// now - a real game against a team, both of them built in half.js, drawn
// with the same camera, the same bodies and the same shot. DUNK, which the
// quote above refers to, has since been deleted; half.js says why.
// ---------------------------------------------------------------------
let mode = 'half';                  // 'half' | 'still'
let court = 'half';                 // which court the match game is on: 'half' | 'full'
let half = null;                    // the court game, made on first use
let teamSize = 3;                   // how many a side

// ONE CAMERA FOR BOTH COURTS. Liam: *"same camera angle for half court and
// stuff to"*. So the half-width, the tilt and the height are the SAME
// NUMBERS in both rows below, deliberately written out twice rather than
// shared, because the whole point is that they match and the next person to
// change one should see the other sitting beside it. The only thing that
// differs is the x, and on a full court even that is not a number - thirty
// metres of floor will not fit in a frame that shows a person at a size you
// can read, so the camera TRACKS, and half.camX() says where to.
const CAM = {
  still: { hw: D.units / 2, tilt: 0.13, x: 0, y: 0.6 },
  half:  { hw: 10, tilt: 0.30, x: -1.6, y: HALF_FLOOR + 3.4 },
  full:  { hw: 10, tilt: 0.30, x: 0, y: HALF_FLOOR + 3.4 },
};

/** point the camera at whichever game is being played */
function useCam(which) {
  const c = CAM[which];
  const hh = c.hw * (D.H / D.W);
  D.cam.left = -c.hw; D.cam.right = c.hw;
  D.cam.top = hh; D.cam.bottom = -hh;
  D.cam.updateProjectionMatrix();
  D.tilt = c.tilt;
  D.lookAt(c.x, c.y);
}

const root = new THREE.Group();
D.scene.add(root);

// ---------------------------------------------------------------------
// the court
// ---------------------------------------------------------------------
const boards = paint(64, 64, (g) => {
  g.fillStyle = '#b5793f'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.08) + ')';
    g.fillRect(Math.random() * 64, Math.random() * 64, 6, 1);
  }
  g.fillStyle = 'rgba(255,235,200,.10)';
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 1);
});
boards.wrapS = boards.wrapT = THREE.RepeatWrapping;
boards.repeat.set(8, 3);

{
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 14),
    new THREE.MeshLambertMaterial({ map: boards }));
  floor.position.set(0, FLOOR - 0.4, 0);
  floor.receiveShadow = true;
  root.add(floor);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 26, 1), mat('#16202f'));
  wall.position.set(0, FLOOR + 12, -5);
  wall.receiveShadow = true;
  root.add(wall);

  const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 12), mat('#e8e2d2'));
  line.position.set(SPOT.x, FLOOR + 0.01, 0);
  root.add(line);
}

// ---- the crowd -------------------------------------------------------
// One body, four tiers, forty of them, each with its own colour and its
// own little offset in the cheer so they are not a Mexican wave of
// clones.
const crowd = [];
{
  for (let row = 0; row < 4; row++) {
    const y = FLOOR + 0.6 + row * 1.05, z = -2.6 - row * 0.55;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(40, 1.05, 0.6), mat(row % 2 ? '#1b2738' : '#202e42'));
    tier.position.set(0, y, z);
    tier.receiveShadow = true;
    root.add(tier);
    for (let i = 0; i < 12; i++) {
      const p = person(0.34, new THREE.Color().setHSL(rnd(0, 1), 0.32, rnd(0.30, 0.5)),
                       new THREE.Color().setHSL(rnd(0.05, 0.12), 0.4, rnd(0.35, 0.62)));
      p.g.position.set(-18 + i * 3.2 + rnd(-0.6, 0.6) + (row % 2 ? 1.4 : 0), y + 0.52, z);
      p.g.rotation.y = rnd(-0.2, 0.2);
      p.seat = p.g.position.y;
      p.phase = rnd(0, 6.283);
      root.add(p.g);
      crowd.push(p);
    }
  }
}

// ---- the hoop --------------------------------------------------------
const hoopG = new THREE.Group();
root.add(hoopG);
{
  const bb = box(1.9, 3.1, 0.14, mat('#e9e6dd'));
  bb.position.set(1.15, 1.2, -0.55);
  hoopG.add(bb);
  const sq = box(1.15, 0.9, 0.06, mat('#d8552f'));
  sq.position.set(1.05, 0.55, -0.46);
  hoopG.add(sq);
  const rail = box(2.1, 0.12, 0.1, mat('#c9c3b4'));
  rail.position.set(1.15, 2.62, -0.45);
  hoopG.add(rail);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.075, 8, 26), mat('#ff7a2f'));
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  hoopG.add(rim);
  const post = box(0.34, 7.2, 0.34, mat('#2c3a4d'));
  post.position.set(1.15, -2.4, -0.95);
  hoopG.add(post);
  const arm = box(0.9, 0.22, 0.22, mat('#2c3a4d'));
  arm.position.set(1.15, 0.9, -0.8);
  hoopG.add(arm);
}

// ---------------------------------------------------------------------
// THE NET, as a verlet cloth
// ---------------------------------------------------------------------
const NET_S = 12, NET_R = 5;          // strands round, beads down
const netPts = [];                    // {p, old, pinned}
const netLinks = [];
{
  for (let r = 0; r < NET_R; r++) {
    for (let s = 0; s < NET_S; s++) {
      const a = s / NET_S * Math.PI * 2;
      const rad = RIM_R * (1 - r * 0.11);
      const p = new THREE.Vector3(Math.cos(a) * rad, -r * 0.24, Math.sin(a) * rad);
      netPts.push({ p, old: p.clone(), pinned: r === 0 });
    }
  }
  const at = (r, s) => r * NET_S + ((s + NET_S) % NET_S);
  for (let r = 0; r < NET_R; r++) for (let s = 0; s < NET_S; s++) {
    if (r > 0) netLinks.push([at(r - 1, s), at(r, s), netPts[at(r - 1, s)].p.distanceTo(netPts[at(r, s)].p)]);
    netLinks.push([at(r, s), at(r, s + 1), netPts[at(r, s)].p.distanceTo(netPts[at(r, s + 1)].p)]);
  }
}
// one line per strand, rebuilt each frame from the simulation
const netGeo = new THREE.BufferGeometry();
const netArr = new Float32Array(NET_S * (NET_R - 1) * 2 * 3 + NET_S * NET_R * 2 * 3);
netGeo.setAttribute('position', new THREE.BufferAttribute(netArr, 3));
const netMesh = new THREE.LineSegments(netGeo,
  new THREE.LineBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0.9 }));
hoopG.add(netMesh);

function stepNet(dt) {
  const damp = 0.985;
  for (const n of netPts) {
    if (n.pinned) continue;
    const vx = (n.p.x - n.old.x) * damp, vy = (n.p.y - n.old.y) * damp, vz = (n.p.z - n.old.z) * damp;
    n.old.copy(n.p);
    n.p.x += vx; n.p.y += vy - 9 * dt * dt * 60; n.p.z += vz;
  }
  // the ball, in the hoop's own space, pushing beads out of its way
  if (ball) {
    const b = new THREE.Vector3(ball.x - hoop.x, ball.y - hoop.y, 0);
    for (const n of netPts) {
      if (n.pinned) continue;
      const d = n.p.distanceTo(b);
      if (d < BALL_R + 0.05 && d > 0.0001) {
        const push = (BALL_R + 0.05 - d);
        n.p.addScaledVector(n.p.clone().sub(b).normalize(), push);
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    for (const [i, j, rest] of netLinks) {
      const a = netPts[i], c = netPts[j];
      const d = a.p.distanceTo(c.p);
      if (d < 0.0001) continue;
      const diff = (d - rest) / d * 0.5;
      const dx = (c.p.x - a.p.x) * diff, dy = (c.p.y - a.p.y) * diff, dz = (c.p.z - a.p.z) * diff;
      if (!a.pinned) { a.p.x += dx; a.p.y += dy; a.p.z += dz; }
      if (!c.pinned) { c.p.x -= dx; c.p.y -= dy; c.p.z -= dz; }
    }
  }
  let k = 0;
  const at = (r, s) => r * NET_S + ((s + NET_S) % NET_S);
  const put = (v) => { netArr[k++] = v.x; netArr[k++] = v.y; netArr[k++] = v.z; };
  for (let r = 0; r < NET_R; r++) for (let s = 0; s < NET_S; s++) {
    if (r > 0) { put(netPts[at(r - 1, s)].p); put(netPts[at(r, s)].p); }
    put(netPts[at(r, s)].p); put(netPts[at(r, s + 1)].p);
  }
  netGeo.attributes.position.needsUpdate = true;
}

// The person builder moved to kit.js when the half court arrived: both
// modes are made of the same body, and the crowd in both is that body at
// a third of the size.
// the shooter, at the free-throw line
shooter = person(0.5, null, null, playerOutfit());
shooter.g.position.set(SPOT.x, FLOOR, 0.6);
shooter.g.rotation.y = -0.5;
root.add(shooter.g);

// ---- the ball --------------------------------------------------------
const ballTex = paint(64, 64, (g) => {
  g.fillStyle = '#e07a2c'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.10) + ')';
    g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
  }
  g.strokeStyle = '#20140c'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
  g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke();
  g.beginPath(); g.arc(0, 32, 26, -1.1, 1.1); g.stroke();
  g.beginPath(); g.arc(64, 32, 26, Math.PI - 1.1, Math.PI + 1.1); g.stroke();
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 16),
  new THREE.MeshLambertMaterial({ map: ballTex }));
ballMesh.castShadow = true;
root.add(ballMesh);
const blob = new THREE.Mesh(new THREE.CircleGeometry(BALL_R, 18),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
blob.rotation.x = -Math.PI / 2;
root.add(blob);

// the aim preview and the flight trail
const arcGeo = new THREE.BufferGeometry();
const arcPts = new Float32Array(30 * 3);
arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPts, 3));
const arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({
  color: 0xe7ecf3, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.55 }));
root.add(arcLine);
arcLine.visible = false;

const trailGeo = new THREE.BufferGeometry();
const trailPts = new Float32Array(120 * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
  color: 0xff9f43, transparent: true, opacity: 0.35 }));
root.add(trailLine);

// ---------------------------------------------------------------------
function reset() {
  score = 0; mult = 1; ballsLeft = 10; over = false; wind = 0; msg = ''; msgT = 0;
  hoop = { x: 3.4, y: 1.2, dir: 1, speed: 0 };
  cheer = 0;
  newBall();
}

function newBall() {
  ball = { x: SPOT.x, y: FLOOR + 1.9, vx: 0, vy: 0, live: false, scored: false, touched: false, held: true };
  drag = null; trail = []; spin = 0;
  const shot = 10 - ballsLeft;
  hoop.speed = shot >= 4 ? 0.9 + shot * 0.11 : 0;
  wind = shot >= 14 ? rnd(-2.2, 2.2) : 0;
  trailLine.visible = false;
}

function flightStep(p, dt) {
  p.vy += G * dt;
  p.vx += wind * dt;
  p.x += p.vx * dt; p.y += p.vy * dt;
}

function step(dt) {
  if (!started) {
    if (half) half.stop();
    root.visible = true;
    useCam('still');
    pose(0); place(); home.step(dt);
    return;
  }
  if (mode === 'half') return stepHalf(dt);
  if (over) {
    place(); poseCrowd(dt);
    D.card('FULL TIME', ['score ' + score, 'record ' + board.best], 'click for the home screen');
    if (D.tapped()) { home.finish(score); started = false; }
    return;
  }
  if (D.shot) { pose(dt); poseCrowd(dt); place(); stepNet(dt); drawHud(); return; }

  if (hoop.speed) {
    hoop.x += hoop.dir * hoop.speed * dt;
    if (hoop.x < 1.2) { hoop.x = 1.2; hoop.dir = 1; }
    if (hoop.x > 5.2) { hoop.x = 5.2; hoop.dir = -1; }
  }

  // ---- aiming --------------------------------------------------------
  if (!ball.live) {
    if (D.mouse.down && !drag) drag = { x: D.mouse.wx, y: D.mouse.wy };
    if (D.mouse.down && drag) {
      const dx = D.mouse.wx - drag.x, dy = D.mouse.wy - drag.y;
      const p = clamp(Math.hypot(dx, dy) / 6.2, 0, 1);
      drag.power = p; drag.angle = Math.atan2(dy, dx);
      previewArc(p, drag.angle);
    }
    if (!D.mouse.down && drag) {
      if (drag.power > 0.08) {
        ball.vx = Math.cos(drag.angle) * drag.power * 22;
        ball.vy = Math.sin(drag.angle) * drag.power * 22;
        ball.live = true; ball.held = false;
        shooter.shotT = 0;                 // the release animation starts
        spin = -ball.vx * 0.5;
        D.beep(300, 0.07, 'sine', 0.05, 160);
      }
      drag = null;
      arcLine.visible = false;
    }
  } else {
    const prevY = ball.y;
    flightStep(ball, dt);
    trail.push(ball.x, ball.y, 0);
    if (trail.length > 360) trail.splice(0, 3);

    if (ball.y < FLOOR + BALL_R) {
      ball.y = FLOOR + BALL_R; ball.vy = Math.abs(ball.vy) * 0.52; ball.vx *= 0.82;
      ball.touched = true;
      D.beep(120, 0.06, 'sine', 0.05);
      if (Math.abs(ball.vy) < 1.2) finish();
    }
    const bbx = hoop.x + 1.15 - 0.07;
    if (ball.x + BALL_R > bbx && ball.y > hoop.y - 0.4 && ball.y < hoop.y + 2.7) {
      ball.x = bbx - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.62; ball.touched = true;
      D.beep(150, 0.07, 'square', 0.05);
    }
    for (const px of [hoop.x - RIM_R, hoop.x + RIM_R]) {
      const dx = ball.x - px, dy = ball.y - hoop.y, d = Math.hypot(dx, dy);
      if (d < BALL_R + 0.09) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        ball.x = px + nx * (BALL_R + 0.09); ball.y = hoop.y + ny * (BALL_R + 0.09);
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * 0.58;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.58;
        ball.touched = true;
        D.beep(210, 0.05, 'square', 0.045);
      }
    }
    if (!ball.scored && ball.vy < 0 && prevY >= hoop.y && ball.y < hoop.y
        && Math.abs(ball.x - hoop.x) < RIM_R - 0.08) {
      ball.scored = true;
      const swish = !ball.touched;
      if (swish) { mult = Math.min(9, mult + 1); msg = 'SWISH  x' + mult;
                   D.beep(880, 0.18, 'triangle', 0.06, 300); }
      else { msg = 'IN'; mult = 1; D.beep(520, 0.12, 'triangle', 0.05); }
      score += (swish ? 3 : 2) * mult * 10;
      msgT = 1.3;
      cheer = swish ? 2.2 : 1.4;            // and the stands get up
    }
    if (ball.y < FLOOR - 6 || ball.x < -18 || ball.x > 18) finish();
    ballMesh.rotation.z += spin * dt;
  }

  if (msgT > 0) msgT -= dt;
  if (cheer > 0) cheer -= dt;
  stepNet(dt);
  pose(dt);
  poseCrowd(dt);
  place();
  drawHud();
}

// ---------------------------------------------------------------------
// THE HALF COURT
// ---------------------------------------------------------------------
function stepHalf(dt) {
  pumpNet(dt);
  if (!half) return;
  // WHERE THE CAMERA LOOKS, EVERY FRAME. On a half court camX hands back
  // the same fixed spot every time and this costs nothing; on a full court
  // it is the tracking shot. Either way it goes through the same lookAt, at
  // the same tilt and the same height, which is what makes the two modes
  // look like one game.
  const c = CAM[court];
  D.lookAt(half.camX(c.hw * 2), c.y);
  if (half.over) {
    half.step(0);
    drawHalfHud();
    const s = half.score;
    const draw = s[0] === s[1];
    D.card(draw ? 'A DRAW' : (s[0] > s[1] ? 'YOU WIN' : 'THEY WIN'),
           ['home ' + s[0] + '   away ' + s[1],
            teamSize + ' v ' + teamSize + '   ·   ' + (court === 'half' ? 'half court' : 'full court')],
           'click for the home screen');
    if (D.tapped()) { half.stop(); started = false; home.finish(s[0] * 10 + (s[0] > s[1] ? 50 : 0)); }
    return;
  }
  half.step(dt);
  drawHalfHud();
}

function drawHalfHud() {
  const h = half.hud();
  D.hud('HOME ' + h.home + '   AWAY ' + h.away, h.ball + '   BEST ' + board.best);
  // ---- THE STAMINA BAR -------------------------------------------------
  // Bottom left, under your feet rather than up with the score, because it
  // is about YOU and you look at it while you are deciding whether you can
  // afford another jump. It goes amber under a third and red under a sixth.
  {
    const bw = 128, bh = 9, bx = 14, by = D.H - 30;
    const g = D.g;
    g.fillStyle = 'rgba(8,12,18,0.75)';
    g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    const f = clamp(h.stam, 0, 1);
    g.fillStyle = f < 0.17 ? '#ff5a5a' : f < 0.34 ? '#ffb15e' : '#35d07f';
    g.fillRect(bx, by, bw * f, bh);
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    D.text('LEGS', bx, by - 5, 9, '#8b96a8');
    if (online.role) D.text(online.role === 'host' ? 'ONLINE · ROOM ' + online.code : 'ONLINE', bx, by + 22, 9, '#35d07f');
    D.text('✦ ' + coinsNow(), bx + bw, by - 5, 10, '#ffd166', 'right');
  }
  // THE TWO CLOCKS, one above the other, because they mean opposite
  // things: the game clock is how long is left of the match and the shot
  // clock is how long is left of this possession. Only a full court has
  // the first one - a half court is played to eleven, not to a horn.
  if (h.game != null) {
    const m = Math.floor(h.game / 60), s = Math.floor(h.game % 60);
    D.text(m + ':' + String(s).padStart(2, '0'), D.W / 2, 50, 22,
           h.game <= 15 ? '#ff6b8b' : '#e7ecf3', 'center');
    D.text(String(h.clock), D.W / 2, 70, 13, h.clock <= 5 ? '#ff6b8b' : '#4dc9ff', 'center');
  } else {
    D.text(String(h.clock), D.W / 2, 52, 16, h.clock <= 5 ? '#ff6b8b' : '#4dc9ff', 'center');
  }
  if (h.check) D.text('TAKE IT BACK', D.W / 2, 88, 12, '#d8ac4a', 'center');
  if (h.msg) D.text(h.msg, D.W / 2, 110, 20, '#ffd166', 'center');

  // THE POWER RING, with the band that would drop it through the middle.
  // Same ring the stand-still game draws; the band is the half court's
  // one addition, because here the range changes every time you move.
  //
  // TWO THINGS ABOUT IT CHANGED WHEN THE AIMING WAS FIXED.
  //
  // It is drawn where the HAND went down, in screen pixels, rather than at
  // the patch of floor that was under the hand at the time - on a full
  // court the camera travels, and the ring used to slide away across the
  // screen while you were still pulling on it.
  //
  // And the green band is now the band the shot actually uses, which
  // half.js works out in idealBand(). It used to be a fixed 0.07 either
  // side while the shot forgave a fraction of the ideal speed, which at
  // every range measured was narrower - so the ring was painting a promise
  // the shot had no intention of keeping. See idealBand() for the numbers.
  if (h.drag && h.drag.power !== undefined) {
    const p = { x: h.drag.sx, y: h.drag.sy };
    const g = D.g;
    g.strokeStyle = 'rgba(231,236,243,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x, p.y, 26, 0, 7); g.stroke();
    if (h.ideal != null) {
      const w = h.band != null ? h.band : 0.07;
      const a0 = -Math.PI / 2 + (h.ideal - w) * 6.283;
      const a1 = -Math.PI / 2 + (h.ideal + w) * 6.283;
      g.strokeStyle = 'rgba(74,226,138,.85)'; g.lineWidth = 7;
      g.beginPath(); g.arc(p.x, p.y, 26, a0, a1); g.stroke();
    }
    g.strokeStyle = h.drag.power > 0.85 ? '#ff6b8b' : '#ff9f43'; g.lineWidth = 4;
    g.beginPath(); g.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + h.drag.power * 6.283); g.stroke();
  } else {
    const you = h.you;
    const hint = half.ball.holder === you
      ? 'drag to shoot  ·  click a team-mate to pass'
      : 'click the man with the ball to swat  ·  SHIFT to guard';
    D.text(hint, D.W / 2, D.H - 26, 11, '#8b96a8', 'center');
  }
}

/** start a match on either court; `which` is 'half' or 'full' */
function startHalf(which = 'half') {
  if (!half) half = new HalfCourt(D, { size: teamSize, onEnd: () => {} });
  half.venueKind = venueKind;
  court = which === 'full' ? 'full' : 'half';
  root.visible = false;
  useCam(court);
  half.start(teamSize, court);
  mode = 'half';
  started = true;
}

function finish() {
  if (!ball.scored) { mult = 1; msg = 'MISS'; msgT = 1.1; }
  ballsLeft--;
  if (ballsLeft <= 0) { over = true; D.record(score); }
  else newBall();
}

/**
 * The shooter.
 *
 * Three states, all driven off the same body: waiting (a small idle sway
 * and the ball on his hip), loading (the deeper you pull, the deeper the
 * knees and the further back the arms), and releasing (a fast extension
 * that the ball has already left, so the follow-through reads as a
 * follow-through rather than as a throw).
 */
function pose(dt) {
  const s = shooter;
  if (s.shotT !== undefined && s.shotT < 1) s.shotT = Math.min(1, s.shotT + dt * 4);
  const load = drag && drag.power !== undefined ? drag.power : 0;
  const rel = s.shotT !== undefined ? s.shotT : 1;
  const ext = rel < 1 ? Math.sin(rel * Math.PI) : 0;

  const dip = load * 0.55 - ext * 0.2;
  s.hips.position.y = HIP_Y - dip * 0.5;
  for (const leg of s.legs) {
    leg.pivot.rotation.x = dip * 0.9;
    leg.knee.rotation.x = -dip * 1.8;
  }
  // ARMS SWING IN THE SCREEN PLANE, which means around Z.
  //
  // The first version rotated them about X - anatomically the right axis
  // for raising an arm forwards, and completely invisible to a camera
  // that is looking along Z: the arms went behind the body and the
  // shooter appeared to have none. Everything the player is meant to
  // read about this pose has to happen sideways.
  const raise = -0.35 - load * 0.5 + ext * 2.9;      // 0 = down, ~2.6 = overhead
  for (let i = 0; i < s.arms.length; i++) {
    const sign = i ? -1 : 1;
    s.arms[i].pivot.rotation.z = sign * raise;
    s.arms[i].pivot.rotation.x = -0.25 + load * 0.3 - ext * 0.5;
    s.arms[i].fore.rotation.z = sign * (0.7 - load * 0.4 - ext * 0.6);
  }
  s.g.rotation.y = -0.5 + Math.sin(D.t * 0.9) * 0.03;
}

/** the stands: sitting, then up on their feet when one goes in */
function poseCrowd(dt) {
  for (const c of crowd) {
    const up = cheer > 0 ? clamp(cheer * 1.4, 0, 1) : 0;
    const bob = up * (0.35 + 0.25 * Math.sin(D.t * 9 + c.phase));
    c.g.position.y = c.seat + bob;
    // hands over the head, out to the sides, so they read from the front
    const arms = up * (2.4 + 0.4 * Math.sin(D.t * 11 + c.phase));
    for (let i = 0; i < c.arms.length; i++) {
      const sign = i ? -1 : 1;
      c.arms[i].pivot.rotation.z = sign * (0.25 + arms);
      c.arms[i].pivot.rotation.x = 0;
      c.arms[i].fore.rotation.z = sign * 0.3;
    }
    for (const l of c.legs) { l.pivot.rotation.x = up ? 0 : 1.4; l.knee.rotation.x = up ? 0 : -1.5; }
  }
}

function previewArc(power, angle) {
  const p = { x: SPOT.x, y: FLOOR + 1.9,
              vx: Math.cos(angle) * power * 22, vy: Math.sin(angle) * power * 22 };
  for (let i = 0; i < 30; i++) {
    arcPts[i * 3] = p.x; arcPts[i * 3 + 1] = p.y; arcPts[i * 3 + 2] = 0;
    for (let k = 0; k < 3; k++) flightStep(p, 0.016);
  }
  arcGeo.attributes.position.needsUpdate = true;
  arcLine.computeLineDistances();
  arcLine.visible = true;
}

function place() {
  if (hoop) hoopG.position.set(hoop.x, hoop.y, 0);
  if (ball) {
    // while it is in his hands it rides with them
    if (ball.held) {
      const load = drag && drag.power !== undefined ? drag.power : 0;
      ball.x = SPOT.x + 0.55 - load * 0.35;
      ball.y = FLOOR + 1.9 - load * 0.5;
    }
    ballMesh.position.set(ball.x, ball.y, 0);
    blob.position.set(ball.x, FLOOR + 0.03, 0);
    const h = clamp(1 - (ball.y - FLOOR) / 9, 0.25, 1);
    blob.scale.setScalar(h);
    blob.material.opacity = 0.30 * h;
  }
  if (trail && trail.length > 6) {
    for (let i = 0; i < 120; i++) {
      const j = Math.min(i, trail.length / 3 - 1) | 0;
      trailPts[i * 3] = trail[j * 3]; trailPts[i * 3 + 1] = trail[j * 3 + 1]; trailPts[i * 3 + 2] = 0;
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailLine.visible = true;
  }
  D.lookAt(0, 0.6);
}

function drawHud() {
  D.hud('SCORE ' + (score || 0) + '   x' + (mult || 1),
        'BALLS ' + (ballsLeft || 0) + '   BEST ' + board.best);
  if (wind) D.text((wind > 0 ? 'WIND →' : '← WIND') + '  ' + Math.abs(wind).toFixed(1),
                   D.W / 2, 52, 11, '#4dc9ff', 'center');
  if (msgT > 0) D.text(msg, D.W / 2, 96, 22, '#ffd166', 'center');
  if (drag && drag.power !== undefined) {
    const s = D.toScreen(drag.x, drag.y);
    const g = D.g;
    g.strokeStyle = 'rgba(231,236,243,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(s.x, s.y, 26, 0, 7); g.stroke();
    g.strokeStyle = drag.power > 0.85 ? '#ff6b8b' : '#ff9f43'; g.lineWidth = 4;
    g.beginPath(); g.arc(s.x, s.y, 26, -Math.PI / 2, -Math.PI / 2 + drag.power * 6.283); g.stroke();
  }
  if (ball && !ball.live && !drag)
    D.text('drag anywhere and let go', D.W / 2, D.H - 26, 11, '#8b96a8', 'center');
}

const board = new Board('hoops', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'HOOPS',
  lines: ['A and D run up and down the floor, W and S go away and towards you',
          'drag to shoot, click a team-mate to pass, click the ball to swat',
          'SHIFT guards him  ·  half court is first to eleven, full court is two minutes'],
  board,
  buttons: [
    { label: 'HALF COURT', sub: 'one ring, ones and twos, first to 11', fn: () => startHalf('half') },
    { label: 'FULL COURT', sub: 'two rings, twos and threes, two minutes', fn: () => startHalf('full') },
    { label: 'STAND STILL', sub: 'ten balls, keep the streak alive',
      fn: () => { mode = 'still'; root.visible = true; useCam('still'); started = true; reset(); } },
    { label: 'PLAY ONLINE', sub: 'host a room, or join a friend with a code',
      fn: () => { panelTab = 'online'; } },
  ],
  // HOW MANY A SIDE. Liam: "the player can choose how many people play".
  // THE PANEL HAS TWO TABS. Everything - the team size, ten rows of kit
  // and the stamina shelf - does not fit under the buttons on a phone, and
  // a panel that runs off the bottom of the screen is a shop you cannot
  // buy from. So: MATCH is how many a side, KIT is the wardrobe.
  panel: {
    h: 190,
    draw: (DD, x, y, w) => {
      const g = DD.g;
      const tabs = [['match', 'MATCH'], ['kit', 'KIT & SHOP'], ['online', 'ONLINE']];
      panelHot = [];
      tabs.forEach(([id, label], i) => {
        const bw = 74, bx = x + i * (bw + 6), by = y;
        const on = panelTab === id;
        g.fillStyle = on ? '#ffb15e' : 'rgba(255,159,67,.14)';
        g.fillRect(bx, by, bw, 20);
        DD.text(label, bx + 8, by + 14, 11, on ? '#2a1a10' : '#ffd9a8');
        panelHot.push({ x: bx, y: by, w: bw, h: 20, tab: id });
      });
      if (panelTab === 'match') {
        DD.text('HOW MANY A SIDE', x, y + 42, 11, '#8b96a8');
        for (let i = 1; i <= 5; i++) {
          const bw = 34, bx = x + (i - 1) * (bw + 6), by = y + 50;
          const on = teamSize === i;
          g.fillStyle = on ? '#ffb15e' : 'rgba(255,159,67,.14)';
          g.fillRect(bx, by, bw, 26);
          g.strokeStyle = on ? '#ffd9a8' : 'rgba(255,159,67,.45)';
          g.lineWidth = 2; g.strokeRect(bx + 1, by + 1, bw - 2, 24);
          DD.text(i + 'v' + i, bx + 5, by + 18, 12, on ? '#2a1a10' : '#ffd9a8');
          panelHot.push({ x: bx, y: by, w: bw, h: 26, size: i });
        }
        // WHERE YOU PLAY. Liam asked for street ball, so that is the default:
        // the blacktop with the fence round it, or the arena with the bowl.
        DD.text('WHERE', x, y + 96, 11, '#8b96a8');
        [['street', 'STREET COURT'], ['arena', 'ARENA']].forEach(([id, label], i) => {
          const bw = 110, bx = x + i * (bw + 8), by = y + 104;
          const on = venueKind === id;
          g.fillStyle = on ? '#ffb15e' : 'rgba(255,159,67,.14)';
          g.fillRect(bx, by, bw, 24);
          DD.text(label, bx + 8, by + 16, 11, on ? '#2a1a10' : '#ffd9a8');
          panelHot.push({ x: bx, y: by, w: bw, h: 24, venue: id });
        });
        return 136;
      }
      if (panelTab === 'online') {
        const oy = y + 30;
        DD.text('PLAY SOMEBODY', x, oy + 10, 11, '#8b96a8');
        const btn = (label, bx, by, bw2, on) => {
          g.fillStyle = on ? '#ffb15e' : 'rgba(255,159,67,.16)';
          g.fillRect(bx, by, bw2, 24);
          DD.text(label, bx + 8, by + 16, 11, on ? '#2a1a10' : '#ffd9a8');
          panelHot.push({ x: bx, y: by, w: bw2, h: 24, online: label });
        };
        btn('HOST A ROOM', x, oy + 18, 108, online.role === 'host');
        btn(online.typing ? 'TYPE: ' + (online.entry || '____') : 'JOIN A ROOM', x + 116, oy + 18, 120, online.role === 'guest');
        if (online.role) btn('LEAVE', x + 244, oy + 18, 60, false);
        if (online.code && online.role === 'host') {
          DD.text('ROOM CODE', x, oy + 62, 10, '#8b96a8');
          DD.text(online.code, x + 78, oy + 66, 22, '#ffd166');
          DD.text('tell a friend to press JOIN and type it', x, oy + 84, 9, '#5a6577');
        } else if (online.typing) {
          DD.text('type four letters, ENTER to connect, ESC to stop', x, oy + 62, 9, '#5a6577');
        } else {
          DD.text('one of you hosts and reads out the code.', x, oy + 60, 9, '#5a6577');
          DD.text('the host\'s browser runs the match, so keep it open.', x, oy + 74, 9, '#5a6577');
        }
        if (online.status) {
          DD.text(online.status, x, oy + 104, 10,
                  online.kind === 'error' ? '#ff6b8b' : online.kind === 'live' ? '#35d07f' : '#ffd166');
        }
        return 150;
      }
      return 26 + wardrobePanel.draw(DD, x, y + 26, w);
    },
    click: (DD, x, y) => {
      for (const h of panelHot) {
        if (DD.mouse.x < h.x || DD.mouse.x > h.x + h.w || DD.mouse.y < h.y || DD.mouse.y > h.y + h.h) continue;
        if (h.tab) { panelTab = h.tab; DD.beep(560, 0.05, 'triangle', 0.05); return; }
        if (h.size) { teamSize = h.size; return; }
        if (h.venue) { venueKind = h.venue; try { localStorage.setItem('pd.hoops.venue', h.venue); } catch (e) { /* fine */ } DD.beep(600, 0.05, 'triangle', 0.05); return; }
        if (h.online) {
          if (h.online === 'HOST A ROOM') hostOnline();
          else if (h.online === 'LEAVE') leaveOnline();
          else { online.typing = true; online.entry = ''; }
          DD.beep(600, 0.06, 'triangle', 0.05);
          return;
        }
      }
      if (panelTab === 'kit') wardrobePanel.click(DD, x, y + 26, 0);
    },
  },
  hint: 'WASD move · DRAG shoot · CLICK pass or swat · SHIFT guard · SPACE jump · P pause',
});

// ---------------------------------------------------------------------
// A HANDLE FOR THE TEST HARNESS (tools/hoops.mjs).
//
// Everything here drives the game the way a player does - it sets a team
// size, starts a match, hands the ball to a side, shoots, passes, swats -
// so a check that passes here is a check on the real thing and not on a
// second copy of the rules written in the test.
// ---------------------------------------------------------------------
window.__hoops = {
  setSize: (n) => { teamSize = clamp(n | 0, 1, 5); return teamSize; },
  // the online lobby, for tools/online.mjs
  hostOnline: async () => { await hostOnline(); return online.code; },
  joinOnline: async (c) => { await joinOnline(c); return online.seat; },
  onlineInfo: () => ({ role: online.role, code: online.code, status: online.status, kind: online.kind,
    seat: online.seat, live: !!(online.net && online.net.live),
    seats: half && half.netSeats ? half.netSeats.length : 0,
    ball: half ? [+half.ball.x.toFixed(2), +half.ball.z.toFixed(2)] : null,
    score: half ? half.score.slice() : null,
    mine: half && half.you ? [+half.you.x.toFixed(2), +half.you.z.toFixed(2)] : null }),
  leaveOnline: () => leaveOnline(),
  /** where the man on a given online seat is, on this machine */
  seatPos: (i) => { const p = half && half.netSeats && half.netSeats[i]; return p ? [+p.x.toFixed(2), +p.z.toFixed(2)] : null; },
  /** drop one man onto another from a height: the foul, for tools/rules.mjs */
  dropOnto: () => {
    if (!half) return null;
    const a = half.players[0], b = half.players.find((q) => q.team !== a.team);
    half.phase = 'live';
    half.needCheck = false;
    b.x = a.x + 0.3; b.z = a.z; b.y = 0; b.vy = 0; b.vx = 0; b.vz = 0;
    a.y = 1.2; a.vy = -6.5; a.vx = 0; a.vz = 0;
    for (let i = 0; i < 20; i++) half.step(1 / 60);
    const f = half.freeThrow;
    return { fouled: !!f, shooter: f ? (f.shooter === b ? 'the man on the floor' : 'somebody else') : null,
      fouls: half.fouls || {}, msg: half.hud().msg };
  },
  /** run the match on without drawing it, for the counting tool */
  simSteps: (n) => { if (half) for (let i = 0; i < n; i++) half.step(1 / 60); },
  /** one line about the match for tools/hoopsim.mjs: what is on the floor now */
  matchProbe: () => {
    if (!half) return null;
    const b = half.ball, h = half.hud();
    const sh = b.shot && b.live ? b.from : null;
    const r = sh ? half.rim(sh.team) : null;
    return {
      shotUp: !!(b.shot && b.live),
      shotFrom: sh && r ? Math.hypot(sh.x - r.x, sh.z - r.z) : 0,
      score: h.home + h.away, msg: h.msg, stam: h.stam, coins: h.coins,
      freeThrow: !!half.freeThrow, fouls: half.fouls || {},
      botStam: Math.min(...half.players.filter((q) => !q.you).map((q) => q.stam)),
      tally: half.tally,
    };
  },
  startHalf,
  startFull: () => startHalf('full'),
  /** how close the man on you is standing, for tools/guarded.mjs */
  guardProbe: () => (half ? half.guardProbe() : null),
  camX: () => (half ? +half.camX(CAM[court].hw * 2).toFixed(2) : null),
  you: () => (half ? { ...half.you } : null),
  freeze: (on) => { if (half) half.frozen = !!on; },
  giveBall: (team) => half && half.debugGive(team),
  standOn: (gap) => half && half.debugStandOnCarrier(gap),
  standAt: (x, z) => half && half.debugStandAt(x, z),
  testShoot: (power, angle) => half && half.debugShoot(power, angle),
  // where the last shot crossed the ring's height: see half.js #ball
  cross: () => (half && half.cross ? {
    long: +half.cross.long.toFixed(3),
    side: +half.cross.side.toFixed(3),
    miss: +half.cross.miss.toFixed(3),
  } : null),
  // what the drag has made of the gesture so far, and what the green band
  // on the power ring is telling the player to release at
  drag: () => (half && half.drag
    ? { power: +half.drag.power.toFixed(3), angle: +half.drag.angle.toFixed(3),
        sx: half.drag.sx, sy: half.drag.sy,
        ideal: half.idealPower(), band: half.idealBand() }
    : null),
  ideal: (a) => {
    if (!half || !half.ball.holder) return null;
    return half.idealPowerFor(half.ball.holder, a == null ? 0.8 : a);
  },
  // the half-width of the green band on the power ring, as the ring draws it
  band: () => (half ? half.idealBand() : null),
  testPass: () => half && half.debugPass(),
  testSwat: () => half && half.debugSwat(),
  testGuard: () => half && half.debugGuard(),
  probe: () => {
    if (!half) return null;
    const b = half.ball;
    return { bx: +b.x.toFixed(2), by: +b.y.toFixed(2), bz: +b.z.toFixed(2),
             vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), vz: +b.vz.toFixed(2),
             rimX: half.COURT.hoopX, rimY: +half.COURT.rimY.toFixed(2), rimZ: half.COURT.hoopZ,
             live: !!b.live, holder: !!b.holder };
  },
  state: () => {
    if (!half || mode !== 'half') return { mode, players: 0 };
    const h = half.hud(), b = half.ball;
    return {
      mode, court: h.mode, players: half.players.length, size: teamSize,
      home: h.home, away: h.away, msg: h.msg, game: h.game == null ? null : +h.game.toFixed(1),
      over: !!half.over,
      holder: b.holder ? (b.holder.you ? 'you' : b.holder.team + ':' + b.holder.idx) : null,
      holderTeam: b.holder ? b.holder.team : null,
      ballY: +b.y.toFixed(2), live: !!b.live,
      tally: half.tally, check: h.check,
    };
  },
};

reset(); started = false;

if (D.shot) {
  // THE CARD IS THE MAIN GAME. It used to be the stand-still mode, which is
  // now the third one on the home screen - a picture of one man on a spot
  // sells the game it used to be. Three a side on the half court, a few
  // seconds in so everyone has run somewhere, and the shot below is left
  // set up underneath in case the match cannot start for any reason.
  teamSize = 3;
  startHalf('half');
  for (let i = 0; i < 150; i++) stepHalf(1 / 60);
  started = true; score = 640; mult = 3; ballsLeft = 6;
  hoop = { x: 3.4, y: 1.2, dir: 1, speed: 1.4 };
  ball = { x: 3.4, y: 1.0, vx: 1, vy: -6, live: true, scored: true, touched: false, held: false };
  cheer = 2;
  trail = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    trail.push(lerp(SPOT.x, 3.4, t), FLOOR + 1.9 + 10.5 * t - 9.4 * t * t, 0);
  }
  shooter.shotT = 0.5;
  msg = 'SWISH  x3'; msgT = 2;
  for (let i = 0; i < 40; i++) stepNet(1 / 60);
}

D.run(step);
