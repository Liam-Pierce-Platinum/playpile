// =====================================================================
// SPIKE - two slimes, one ball, one net. First to eleven.
// =====================================================================
//
// Liam: *"spike 2D 3D better graphics make it slimes and stardew valley
// style"*, and *"add in two player for quickdraw and spike"*.
//
// So: the same one-rule volleyball - the ball must not land on your side,
// and there are no other rules, no touch limit, no positions - played by
// two slimes on a summer afternoon, seen from the side in solids.
//
// WHAT MAKES IT READ AS STARDEW rather than as grey physics shapes is not
// the polygon count, it is four decisions about colour and motion:
//
//   A WARM, HIGH-CHROMA PALETTE with a sky that is lighter at the horizon
//   than at the top. Everything in that game is saturated and nothing in
//   it is grey.
//   SOFT, ROUND SILHOUETTES. There is not a sharp corner on either
//   player: a slime is a squashed sphere and the fence posts are capped.
//   SQUASH AND STRETCH. The slimes flatten when they land and stretch
//   when they jump, which is most of the character in the whole game.
//   CLUTTER AT THE EDGES - grass tufts, a fence, trees, a sun. A pitch
//   with nothing around it looks like a test scene.
//
// TWO PLAYERS share one keyboard: A/D/W against the arrow keys. The
// computer is still there if nobody takes the second slime, and it still
// gets better every point it loses, because an opponent that improves is
// the only kind worth beating.
import { Deck3D, THREE, mat, box, sphere, cyl, paint, clamp, rnd, lerp, pick } from '../_deck/deck3d.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck3D({ key: 'spike', w: 760, h: 440, units: 22, bg: '#8fd3e8',
                       tilt: 0.10, scale: 1.6 });

const FLOOR = -4.2, NET_X = 0, NET_H = 3.4, R = 1.05, BR = 0.42, G = -22;

let you, cpu, ball, scoreL, scoreR, serving, over, started, msg, msgT, skill, rally, twoPlayer, menu, bestRally;

// ---------------------------------------------------------------------
// the afternoon
// ---------------------------------------------------------------------
const root = new THREE.Group();
D.scene.add(root);
const trees = [];

// sky: a big backdrop painted with a gradient, because a flat clear
// colour behind a warm scene is the one thing that always looks cheap
{
  const sky = paint(8, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#4fa8d8');
    grad.addColorStop(0.55, '#9fd8ec');
    grad.addColorStop(1, '#e8f3d6');
    g.fillStyle = grad; g.fillRect(0, 0, 8, 128);
  }, 'linear');
  const back = new THREE.Mesh(new THREE.PlaneGeometry(90, 46),
    new THREE.MeshBasicMaterial({ map: sky }));
  back.position.set(0, FLOOR + 17, -14);
  root.add(back);

  const sun = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
  sun.position.set(-13, FLOOR + 22, -13.5);
  root.add(sun);

  for (let i = 0; i < 7; i++) {          // clouds, as clusters of spheres
    const c = new THREE.Group();
    const n = 3 + Math.floor(rnd(0, 3));
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.9, 1.7), 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      s.position.set(j * 1.5 + rnd(-0.4, 0.4), rnd(-0.3, 0.4), 0);
      c.add(s);
    }
    c.position.set(rnd(-24, 24), FLOOR + rnd(13, 20), -12);
    root.add(c);
  }
}

// grass, with a mown stripe pattern and a dirt court in the middle
const grassTex = paint(64, 64, (g) => {
  g.fillStyle = '#69a545'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = pick(['#5d9a3c', '#74b04c', '#8cc45f', '#4f8a34']);
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(14, 5);

const sandTex = paint(64, 64, (g) => {
  g.fillStyle = '#e3c893'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = pick(['#d8bb82', '#eed6a5', '#cdae76']);
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
sandTex.repeat.set(10, 3);

{
  const grass = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 26),
    new THREE.MeshLambertMaterial({ map: grassTex }));
  grass.position.set(0, FLOOR - 1, -3);
  grass.receiveShadow = true;
  root.add(grass);

  const court = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 11),
    new THREE.MeshLambertMaterial({ map: sandTex }));
  court.position.set(0, FLOOR - 0.14, 0);
  court.receiveShadow = true;
  root.add(court);

  // tufts along the front, so the court sits IN the grass
  for (let i = 0; i < 60; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.12, 0.26), rnd(0.4, 0.9), 5),
      mat(pick(['#6fae49', '#84c058', '#5c9a3c'])));
    t.position.set(rnd(-28, 28), FLOOR + 0.2, rnd(3.2, 7));
    t.castShadow = true;
    root.add(t);
  }
  // a fence and a treeline behind
  for (let x = -28; x <= 28; x += 3.2) {
    const p = cyl(0.16, 0.18, 2.2, mat('#9b6b3e'), 7);
    p.position.set(x, FLOOR + 1.0, -7.5);
    root.add(p);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), mat('#a8763f'));
    cap.position.set(x, FLOOR + 2.1, -7.5);
    root.add(cap);
  }
  for (const y of [1.4, 0.6]) {
    const rail = box(58, 0.16, 0.14, mat('#8d6136'));
    rail.position.set(0, FLOOR + y, -7.5);
    root.add(rail);
  }
  // ---- the treeline --------------------------------------------------
  //
  // Three spheres on a stick is a bush. A tree needs: a trunk that TAPERS
  // and forks, canopy clumps in three greens (a dark under-layer, the
  // body, and a lit top on the side the sun is on), and a size that
  // varies with distance - so the line behind the court reads as depth
  // rather than as a row of identical props. They also sway, very
  // slightly, out of phase, which is the thing the eye notices without
  // being able to say what it noticed.
  for (let i = 0; i < 16; i++) {
    const tr = new THREE.Group();
    const scale = rnd(0.8, 1.45);
    const trunk = cyl(0.16 * scale, 0.34 * scale, 2.6 * scale, mat('#6b4630'), 7);
    trunk.position.y = 1.3 * scale;
    tr.add(trunk);
    // a fork, so the trunk is not a dowel
    const fork = cyl(0.10 * scale, 0.16 * scale, 1.1 * scale, mat('#63412c'), 6);
    fork.position.set(0.35 * scale, 2.3 * scale, 0);
    fork.rotation.z = -0.5;
    tr.add(fork);

    const deep = pick(['#2f5f2c', '#356b31', '#2a5528']);
    const body = pick(['#3f7d3a', '#4d9142', '#448536']);
    const lit  = pick(['#6aab52', '#79b85c', '#5fa04a']);
    const clumps = 5 + Math.floor(rnd(0, 3));
    for (let j = 0; j < clumps; j++) {
      const rr = rnd(1.0, 1.7) * scale;
      const col = j === 0 ? deep : (j < clumps - 2 ? body : lit);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(rr, 9, 7), mat(col));
      leaf.castShadow = true;
      leaf.position.set(rnd(-1.0, 1.0) * scale + (col === lit ? -0.5 : 0),
                        (2.8 + j * 0.42) * scale,
                        rnd(-0.6, 0.6) * scale);
      leaf.scale.y = rnd(0.7, 0.95);
      tr.add(leaf);
    }
    tr.position.set(rnd(-30, 30), FLOOR, -10 - rnd(0, 3));
    tr.userData.sway = rnd(0, 6.283);
    trees.push(tr);
    root.add(tr);
  }
}

// the net
{
  for (const z of [-1.6, 1.6]) {
    const post = cyl(0.13, 0.15, NET_H + 0.6, mat('#b08a52'), 8);
    post.position.set(NET_X, FLOOR + (NET_H + 0.6) / 2, z);
    post.castShadow = true;
    root.add(post);
  }
  const netTex = paint(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    for (let i = 0; i <= 32; i += 6) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 32); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(32, i); g.stroke();
    }
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(1, 6);
  // THE NET FACES THE CAMERA. Strung across the court it is perpendicular
  // to this view, which means a side-on camera sees nothing at all - the
  // first version had a net you could only find by hitting it. Seen from
  // the side a real net IS a narrow vertical strip of mesh, so this is
  // what it looks like rather than a cheat.
  const net = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.9),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide }));
  net.position.set(NET_X, FLOOR + NET_H - 0.95, 1.65);
  root.add(net);
  const net2 = net.clone();
  net2.position.z = -1.65;
  root.add(net2);
  const band = box(0.1, 0.22, 3.2, mat('#ffffff'));
  band.position.set(NET_X, FLOOR + NET_H, 0);
  root.add(band);
}

// ---------------------------------------------------------------------
// THE SLIMES, WHICH ARE SIMULATED
// ---------------------------------------------------------------------
//
// Liam: *"better blob and tree graphics and make the blobs smoosh down
// have shine and be simulated"*.
//
// A slime that only scales when it lands is a ball with a squash frame.
// This one has a JELLY SIMULATION in it, and it is two things:
//
//   A SPRING for the overall squash. Landing pushes it down, and it
//   springs back through the middle and overshoots - so it wobbles the
//   way jelly does, several times, getting smaller each time, instead of
//   snapping back like rubber. One number, one velocity, real ringing.
//
//   FOUR WOBBLE MODES on top of that, applied per VERTEX: each is a
//   standing wave round the body (two-lobed, three-lobed, four and five)
//   with its own frequency and its own decay. An impact kicks all four,
//   and because they beat against each other the surface never repeats,
//   which is what stops it looking like an animation.
//
// The shine is a real specular highlight - phong, not lambert, with a
// tight shininess - so it moves across the body as the slime moves,
// which is the thing that says "wet" rather than "matte plastic".
function makeSlime(col, dark) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(R, 30, 22);
  const body = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: new THREE.Color(col), transparent: true, opacity: 0.94,
    shininess: 70, specular: new THREE.Color(0xffffff), flatShading: false,
  }));
  body.castShadow = true; body.receiveShadow = true;
  body.scale.set(1, 0.82, 1);
  g.add(body);
  // the rest pose, kept so the wobble is a displacement from it rather
  // than an accumulating drift
  body.userData.rest = geo.attributes.position.array.slice();
  // a lighter dome on top, which is what makes a blob read as gel
  const gloss = new THREE.Mesh(new THREE.SphereGeometry(R * 0.55, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
  gloss.position.set(-R * 0.25, R * 0.35, R * 0.35);
  gloss.scale.set(1, 0.6, 0.5);
  g.add(gloss);
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(R * 0.17, 10, 8), mat('#ffffff'));
    e.position.set(s * R * 0.34, R * 0.18, R * 0.82);
    eyes.add(e);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(R * 0.09, 8, 6), mat('#1d2430'));
    pupil.position.set(s * R * 0.34, R * 0.18, R * 0.94);
    eyes.add(pupil);
  }
  g.add(eyes);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(R * 0.18, R * 0.045, 6, 12, Math.PI),
    mat(dark));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -R * 0.12, R * 0.86);
  g.add(mouth);
  // the state of the jelly: one spring, four modes
  g.userData = {
    body, eyes,
    squash: 0, squashV: 0,
    modes: [
      { k: 2, amp: 0, vel: 0, w: 17, damp: 2.6, phase: 0 },
      { k: 3, amp: 0, vel: 0, w: 23, damp: 3.2, phase: 1.1 },
      { k: 4, amp: 0, vel: 0, w: 31, damp: 4.0, phase: 2.3 },
      { k: 5, amp: 0, vel: 0, w: 39, damp: 5.0, phase: 0.6 },
    ],
  };
  root.add(g);
  return g;
}

/** kick the jelly - `hit` is how hard, 0..1 */
function wobble(g, hit) {
  const u = g.userData;
  u.squashV -= hit * 9;
  for (const m of u.modes) m.vel += hit * (0.5 + Math.random() * 0.5) * (6 / m.k);
}

/**
 * Run one slime's jelly forwards.
 *
 * The spring is a plain damped harmonic oscillator on a single squash
 * number; the modes are the same thing again, one per wave. Then the
 * vertices are rebuilt from the rest pose: never from the current
 * positions, or the rounding drifts and the slime slowly inflates.
 */
function jelly(g, dt) {
  const u = g.userData;
  const K = 120, C = 9;                       // stiffness and damping
  u.squashV += (-K * u.squash - C * u.squashV) * dt;
  u.squash += u.squashV * dt;
  u.squash = clamp(u.squash, -0.55, 0.55);

  for (const m of u.modes) {
    m.vel += (-m.w * m.w * m.amp - 2 * m.damp * m.vel) * dt;
    m.amp += m.vel * dt;
  }

  const sq = u.squash;
  const body = u.body;
  body.scale.set(1 + sq * 0.45, 0.82 - sq * 0.45, 1 + sq * 0.45);

  const pos = body.geometry.attributes.position;
  const rest = body.userData.rest;
  const t = D.t;
  let moving = false;
  for (const m of u.modes) if (Math.abs(m.amp) > 0.0006) moving = true;
  if (!moving) {
    // nothing is ringing: put it back exactly, once, and stop touching it
    if (body.userData.dirty) {
      pos.array.set(rest); pos.needsUpdate = true;
      body.geometry.computeVertexNormals();
      body.userData.dirty = false;
    }
    return;
  }
  for (let i = 0; i < pos.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
    const a = Math.atan2(z, x);
    const up = y / R;                          // -1 bottom, +1 top
    let d = 0;
    for (const m of u.modes) d += m.amp * Math.cos(m.k * a + m.phase + t * 0.6) * (1 - up * up * 0.4);
    const s = 1 + d * 0.22;
    pos.array[i * 3] = x * s;
    pos.array[i * 3 + 1] = y * (1 - d * 0.10);
    pos.array[i * 3 + 2] = z * s;
  }
  pos.needsUpdate = true;
  body.geometry.computeVertexNormals();
  body.userData.dirty = true;
}
const slimeL = makeSlime('#ff9f43', '#8a4a12');
const slimeR = makeSlime('#4dc9ff', '#10506e');

// ---- the ball --------------------------------------------------------
const ballTex = paint(48, 48, (g) => {
  g.fillStyle = '#fdf6e6'; g.fillRect(0, 0, 48, 48);
  g.fillStyle = '#ffb03a';
  g.fillRect(0, 12, 48, 7); g.fillRect(0, 30, 48, 7);
  g.fillStyle = '#e2653c';
  g.fillRect(12, 0, 6, 48);
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 18, 14),
  new THREE.MeshLambertMaterial({ map: ballTex }));
ballMesh.castShadow = true;
root.add(ballMesh);
const blob = new THREE.Mesh(new THREE.CircleGeometry(BR, 16),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
blob.rotation.x = -Math.PI / 2;
root.add(blob);

// ---------------------------------------------------------------------
function reset() {
  scoreL = 0; scoreR = 0; over = false; skill = 0; rally = 0; bestRally = 0;
  you = { x: -5, y: FLOOR, vy: 0, air: false, squash: 0 };
  cpu = { x: 5, y: FLOOR, vy: 0, air: false, squash: 0, wait: 0, target: 5 };
  serve(1);
}

function serve(side) {
  serving = side;
  ball = { x: side > 0 ? -5 : 5, y: FLOOR + 2.4, vx: 0, vy: 0, live: false, spin: 0 };
  msg = side > 0 ? 'LEFT SERVE' : 'RIGHT SERVE';
  msgT = 1.1;
  rally = 0;
}

function step(dt) {
  if (menu) { place(); home.step(dt); return; }
  if (over) {
    place();
    const winner = scoreL > scoreR ? (twoPlayer ? 'LEFT WINS' : 'YOU WIN') : (twoPlayer ? 'RIGHT WINS' : 'YOU LOSE');
    D.card(winner, [scoreL + ' — ' + scoreR, 'longest rally ' + bestRally],
           'click for the home screen');
    // ONE PLAYER ONLY ON THE BOARD. Two people passing a ball can rally
    // for ever by agreement, so a shared-keyboard game is not a score.
    if (D.tapped()) { home.finish(twoPlayer ? null : bestRally); menu = true; }
    return;
  }
  if (D.shot) { place(); drawHud(); return; }

  // ---- the left slime ------------------------------------------------
  drive(you, dt, {
    left: D.held('a', 'A', 'KeyA'), right: D.held('d', 'D', 'KeyD'),
    jump: D.held('w', 'W', 'KeyW'),
  }, -10.2, NET_X - R - 0.1);

  // ---- the right slime: a person, or the machine ----------------------
  if (twoPlayer) {
    drive(cpu, dt, {
      left: D.held('ArrowLeft'), right: D.held('ArrowRight'), jump: D.held('ArrowUp'),
    }, NET_X + R + 0.1, 10.2);
  } else {
    think(dt);
  }

  // ---- the ball --------------------------------------------------------
  if (!ball.live) {
    const server = serving > 0 ? you : cpu;
    ball.x = server.x; ball.y = server.y + R + 1.4;
    const go = serving > 0
      ? (twoPlayer ? D.held('w', 'W', 'KeyW') || D.tapped() : D.tapped())
      : (twoPlayer ? D.held('ArrowUp') : msgT <= 0);
    if (go) {
      ball.live = true;
      ball.vx = serving > 0 ? rnd(3, 6) : rnd(-6, -3);
      ball.vy = 11;
      D.beep(520, 0.07, 'square', 0.05);
    }
  } else {
    ball.vy += G * dt;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.8;
    if (ball.x < -10.6) { ball.x = -10.6; ball.vx = Math.abs(ball.vx); }
    if (ball.x > 10.6) { ball.x = 10.6; ball.vx = -Math.abs(ball.vx); }

    // the net: a post you can hit the side or the top of
    const netTop = FLOOR + NET_H;
    if (Math.abs(ball.x - NET_X) < 0.18 + BR && ball.y < netTop) {
      if (ball.y > netTop - 0.35) { ball.vy = Math.abs(ball.vy) * 0.55; ball.y = netTop + BR; }
      else { ball.vx = -ball.vx * 0.75; ball.x += Math.sign(ball.vx) * 0.2; }
      D.beep(200, 0.05, 'square', 0.04);
    }

    for (const s of [you, cpu]) {
      const dx = ball.x - s.x, dy = ball.y - (s.y + R * 0.1);
      const d = Math.hypot(dx, dy);
      if (d < R + BR) {
        // OFF THE SURFACE: the line from the slime's middle to the ball is
        // the way it leaves, so the top of the head is flat and fast and
        // the shoulder is a lob. That is the whole skill of the game.
        const nx = dx / (d || 1), ny = dy / (d || 1);
        const sp = clamp(Math.hypot(ball.vx, ball.vy) * 0.58 + 8.5, 8, 21);
        ball.vx = nx * sp;
        ball.vy = Math.max(ny * sp, 4.2) + (s.air ? 2.2 : 0);
        ball.x = s.x + nx * (R + BR + 0.03);
        ball.y = s.y + R * 0.1 + ny * (R + BR + 0.03);
        wobble(s === you ? slimeL : slimeR, 0.55);   // the ball rings the jelly
        rally++;
        D.beep(420 + Math.min(300, rally * 18), 0.05, 'square', 0.05);
      }
    }

    if (ball.y < FLOOR + BR) {
      const leftSide = ball.x < NET_X;
      if (leftSide) { scoreR++; if (!twoPlayer) skill = Math.max(0, skill - 0.4);
                      msg = twoPlayer ? 'RIGHT SCORES' : 'THEIR POINT'; }
      else { scoreL++; if (!twoPlayer) skill += 1;
             msg = twoPlayer ? 'LEFT SCORES' : 'YOUR POINT'; }
      if (rally > bestRally) bestRally = rally;
      D.record(rally);
      msgT = 1.3;
      D.noise(0.2, 0.05, 500);
      if (scoreL >= 11 || scoreR >= 11) over = true;
      else serve(leftSide ? -1 : 1);
    }
  }

  if (msgT > 0) msgT -= dt;
  place();
  drawHud();
}

/** one slime, driven by a set of buttons */
function drive(s, dt, btn, lo, hi) {
  let vx = (btn.right ? 1 : 0) - (btn.left ? 1 : 0);
  if (!vx && !twoPlayer && s === you && D.mouse.down) vx = clamp((D.mouse.wx - s.x) / 2, -1, 1);
  s.x = clamp(s.x + vx * 9.5 * dt, lo, hi);
  if (btn.jump && !s.air) { s.vy = 13.5; s.air = true; wobble(s === you ? slimeL : slimeR, -0.35);
                            D.beep(300, 0.06, 'sine', 0.04, 120); }
  s.vy += G * dt; s.y += s.vy * dt;
  if (s.y <= FLOOR) {
    if (s.air) { wobble(s === you ? slimeL : slimeR, clamp(-s.vy / 26, 0.2, 1)); D.beep(150, 0.05, 'sine', 0.03); }
    s.y = FLOOR; s.vy = 0; s.air = false;
  }
}

/** the computer, when nobody has taken the right-hand slime */
function think(dt) {
  let land = cpu.target, eta = 1;
  if (ball.live) {
    let x = ball.x, y = ball.y, bvx = ball.vx, bvy = ball.vy, t = 0;
    for (let i = 0; i < 160; i++) {
      bvy += G * 0.016; x += bvx * 0.016; y += bvy * 0.016; t += 0.016;
      if (x < -10.6 || x > 10.6) bvx = -bvx;
      if (y < FLOOR + R) break;
    }
    land = x; eta = t;
  }
  cpu.wait -= dt;
  if (cpu.wait <= 0) {
    const err = Math.max(0.25, 2.6 - skill * 0.34);
    cpu.target = clamp(land + rnd(-err, err), NET_X + R + 0.1, 10.2);
    cpu.wait = Math.max(0.05, 0.32 - skill * 0.03);
  }
  const sp = 7.6 + skill * 0.7;
  if (Math.abs(cpu.target - cpu.x) > 0.15)
    cpu.x += Math.sign(cpu.target - cpu.x) * Math.min(sp * dt, Math.abs(cpu.target - cpu.x));
  cpu.x = clamp(cpu.x, NET_X + R + 0.1, 10.2);
  if (!cpu.air && ball.live && eta < 0.3 && Math.abs(ball.x - cpu.x) < 2.6
      && ball.y > FLOOR + 1.6 && Math.random() < 0.55 + skill * 0.05) {
    cpu.vy = 13.5; cpu.air = true; cpu.squash = -0.45;
  }
  cpu.vy += G * dt; cpu.y += cpu.vy * dt;
  if (cpu.y <= FLOOR) { cpu.y = FLOOR; cpu.vy = 0; cpu.air = false; }
  cpu.squash = lerp(cpu.squash, 0, Math.min(1, dt * 9));
}

function place() {
  for (const [s, g, look] of [[you, slimeL, 1], [cpu, slimeR, -1]]) {
    if (!s) continue;
    // the jelly runs itself; the body's scale and its vertices are its
    // business now, and all this does is put the whole slime where the
    // game says it is and keep it sitting ON the sand rather than in it
    jelly(g, D.dt);
    const sq = g.userData.squash;
    g.position.set(s.x, s.y + R * (0.82 - sq * 0.45), 0);
    // and they watch the ball, which costs two lines and is most of why
    // they look alive
    if (ball) {
      const dx = clamp((ball.x - s.x) * 0.06, -0.3, 0.3);
      const dy = clamp((ball.y - s.y) * 0.05, -0.2, 0.25);
      g.userData.eyes.position.set(dx, dy, 0);
    }
  }
  if (ball) {
    ballMesh.position.set(ball.x, ball.y, 0);
    ballMesh.rotation.z = -ball.spin;
    blob.position.set(ball.x, FLOOR + 0.05, 0);
    const h = clamp(1 - (ball.y - FLOOR) / 14, 0.3, 1);
    blob.scale.setScalar(h);
    blob.material.opacity = 0.22 * h;
  }
  // the treeline breathes
  for (const t of trees) t.rotation.z = Math.sin(D.t * 0.7 + t.userData.sway) * 0.012;
  D.lookAt(0, 1.3);
}

function drawHud() {
  const l = twoPlayer ? 'LEFT ' : 'YOU ';
  const r = twoPlayer ? ' RIGHT' : ' CPU';
  D.hud(l + (scoreL || 0) + '  —  ' + (scoreR || 0) + r,
        'RALLY ' + (rally || 0) + '   BEST ' + D.best);
  if (msgT > 0) D.text(msg, D.W / 2, 74, 20, '#ffffff', 'center');
  if (ball && !ball.live && msgT <= 0) {
    const who = serving > 0 ? (twoPlayer ? 'W' : 'click') : (twoPlayer ? '↑' : '');
    if (who) D.text('press ' + who + ' to serve', D.W / 2, D.H - 26, 11, '#20303a', 'center');
  }
}

const board = new Board('spike', { unit: 'RALLY', format: (v) => v + ' touches' });
const home = new Home(D, {
  title: 'SPIKE',
  lines: ['no touch limit, no positions - it must not land on your side',
          'the ball comes off the slime where you meet it',
          'the computer gets better every point it loses'],
  board,
  buttons: [
    { label: 'ONE PLAYER', sub: 'against the computer', fn: () => { twoPlayer = false; menu = false; started = true; reset(); } },
    { label: 'TWO PLAYER', sub: 'A D W against the arrow keys', fn: () => { twoPlayer = true; menu = false; started = true; reset(); } },
  ],
  hint: 'A D move · W jump    ← → move · ↑ jump · first to eleven',
  wash: 'rgba(10,18,26,.72)',
});

menu = true; started = false; twoPlayer = false;
reset();

if (D.shot) {
  menu = false; started = true; scoreL = 7; scoreR = 5; rally = 6; skill = 2;
  you = { x: -4.2, y: FLOOR + 2.6, vy: 3, air: true, squash: -0.2 };
  cpu = { x: 5.4, y: FLOOR, vy: 0, air: false, squash: 0.2, wait: 0, target: 5 };
  ball = { x: -2.4, y: FLOOR + 5.2, vx: 7, vy: 2, live: true, spin: 1 };
  msg = ''; msgT = 0;
}

D.run(step);
