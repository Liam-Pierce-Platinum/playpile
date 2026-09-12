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

const D = new Deck3D({ key: 'hoops', w: 520, h: 680, units: 15, bg: '#101826',
                       tilt: 0.13, scale: 2 });

const G = -17;
const FLOOR = -5.4;
const BALL_R = 0.42;
const RIM_R = 0.72;
const SPOT = { x: -5.0, y: FLOOR };

let ball, hoop, drag, score, mult, ballsLeft, over, started, wind, msg, msgT, trail, spin, shooter, cheer;

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

// ---------------------------------------------------------------------
// a low-poly person, at any scale
// ---------------------------------------------------------------------
function person(scale, shirtCol, skinCol) {
  const g = new THREE.Group();
  const shirt = mat(shirtCol);
  const shorts = mat(new THREE.Color(shirtCol).offsetHSL(0, 0, -0.18));
  const skin = mat(skinCol);

  const hips = new THREE.Group(); g.add(hips);
  const torso = box(0.62 * scale * 2, 0.9 * scale * 2, 0.34 * scale * 2, shirt);
  torso.position.y = 0.45 * scale * 2;
  hips.add(torso);
  const head = box(0.34 * scale * 2, 0.36 * scale * 2, 0.34 * scale * 2, skin);
  head.position.y = 1.10 * scale * 2;
  hips.add(head);
  const hair = box(0.36 * scale * 2, 0.10 * scale * 2, 0.36 * scale * 2,
    mat(new THREE.Color(0x2a1d16)));
  hair.position.y = 1.27 * scale * 2;
  hips.add(hair);

  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.40 * scale * 2, 0.86 * scale * 2, 0);
    const upper = box(0.18 * scale * 2, 0.62 * scale * 2, 0.18 * scale * 2, skin);
    upper.position.y = -0.31 * scale * 2;
    pivot.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.62 * scale * 2;
    const lower = box(0.16 * scale * 2, 0.56 * scale * 2, 0.16 * scale * 2, skin);
    lower.position.y = -0.28 * scale * 2;
    fore.add(lower);
    pivot.add(fore);
    hips.add(pivot);
    arms.push({ pivot, fore });
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.18 * scale * 2, 0, 0);
    const thigh = box(0.24 * scale * 2, 0.6 * scale * 2, 0.24 * scale * 2, shorts);
    thigh.position.y = -0.3 * scale * 2;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.6 * scale * 2;
    const shin = box(0.20 * scale * 2, 0.6 * scale * 2, 0.20 * scale * 2, skin);
    shin.position.y = -0.3 * scale * 2;
    knee.add(shin);
    const shoe = box(0.24 * scale * 2, 0.14 * scale * 2, 0.4 * scale * 2, mat('#1d2430'));
    shoe.position.set(0, -0.62 * scale * 2, 0.08 * scale * 2);
    knee.add(shoe);
    pivot.add(knee);
    hips.add(pivot);
    legs.push({ pivot, knee });
  }
  hips.position.y = 1.22 * scale * 2;
  return { g, hips, arms, legs, scale };
}

// the shooter, at the free-throw line
shooter = person(0.5, new THREE.Color('#e2584a'), new THREE.Color('#e8b98c'));
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
  if (!started) { pose(0); place(); home.step(dt); return; }
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
  s.hips.position.y = 1.22 - dip * 0.5;
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
  lines: ['drag anywhere on the screen and let go',
          'nothing but net stacks the multiplier, a rim-in resets it',
          'the hoop starts moving on the fifth ball'],
  board,
  buttons: [{ label: 'SHOOT', sub: 'ten balls', fn: () => { started = true; reset(); } }],
  hint: 'DRAG and RELEASE · P pause',
});

reset(); started = false;

if (D.shot) {
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
