// =====================================================================
// DUNK :: court.js - THE ARENA
// =====================================================================
//
// Built to REAL PROPORTIONS: every measurement below is the one off a
// rulebook, multiplied by the one scale in scale.js. A real court is 28
// long by 15 wide with the ring 3.05 up, a 1.83 backboard and the
// three-point line 6.75 out; at 0.78 that is a 21.8 by 11.7 floor with
// the ring at 2.38 - and a player, scaled by the same number, is 1.52,
// so the ring is still a foot over the top of his head. That last ratio
// is the one that matters: it is why a dunk has to be earned and why a
// layup is a different shot from a jumper.
//
// A SMALLER BUILDING, NOT SMALLER PEOPLE IN A NORMAL ONE. The version
// before this shrank the floor and left the players full size, which is
// what Liam saw: *"make the players to size with and move at speed with
// the court"*.
//
// THE FLOOR IS ONE PAINTED TEXTURE at 2 cm per pixel: boards with real
// grain and a seam every 8 cm, then the lines drawn on top in the right
// places. Lines as geometry would be forty thin boxes fighting the depth
// buffer; lines in the texture are free and cannot z-fight.
//
// THE NETS ARE SIMULATED - twelve strands of six beads, verlet, pinned to
// the ring, pushed out of the way by the ball. A rim with a cone of
// triangles under it does not tell you whether the shot went through the
// middle or scraped in off the back iron. A net that moves does.
import * as THREE from '../_deck/three.module.js';
import { len } from './scale.js';

// A FULL-SIZE COURT IS THE WRONG SIZE FOR THIS GAME.
//
// Liam: *"its hard to get the ball becuase the court and speeds are not
// right"*. 28 by 15 metres is a floor built for ten trained athletes and
// forty-eight minutes. With three a side and three minutes on the clock
// it is a field: chasing a loose ball the length of it was three seconds
// of holding W.
//
// So the real numbers are all here, and all of them go through len().
export const COURT = {
  halfLen: len(14), halfWid: len(7.5),
  rimX: len(12.425), rimY: len(3.05), rimR: len(0.225),
  boardX: len(12.9), boardW: len(1.83), boardH: len(1.07),
  arc: len(6.75), keyW: len(4.9), keyLen: len(5.8),
  // and the line markings, which are painted rather than built
  line: len(0.05), circle: len(1.8), restricted: len(1.25),
  cornerIn: len(0.9),
};

function tex(w, h, draw, aniso = 8) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/**
 * The floor.
 *
 * Drawn in court space: 50 px per metre, origin at the centre circle, so
 * every measurement below is the real one off a rulebook.
 */
function floorTexture(trim) {
  // PIXELS PER METRE, not pixels per court: the floor is smaller in
  // metres now, so a fixed canvas size would have thinned the texture out
  // over it. 52 keeps the same detail on the boards as before.
  const S = 52;
  const W = COURT.halfLen * 2 * S, H = COURT.halfWid * 2 * S;
  return tex(W, H, (g) => {
    const m = (v) => v * S;                         // metres -> pixels
    const X = (x) => W / 2 + m(x), Z = (z) => H / 2 + m(z);

    // ---- the boards ------------------------------------------------
    const plank = m(len(0.08));
    g.fillStyle = '#c08a4e';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += plank) {
      const shade = 0.86 + Math.random() * 0.26;
      g.fillStyle = 'rgb(' + (192 * shade | 0) + ',' + (138 * shade | 0) + ',' + (78 * shade | 0) + ')';
      g.fillRect(0, y, W, plank - 1);
      // grain along the board
      for (let i = 0; i < W / 6; i++) {
        g.fillStyle = 'rgba(90,58,28,' + (0.03 + Math.random() * 0.07) + ')';
        g.fillRect(Math.random() * W, y + Math.random() * m(0.08), 20 + Math.random() * 90, 1);
      }
      g.fillStyle = 'rgba(60,38,18,.35)';
      g.fillRect(0, y + plank - 1, W, 1);
    }
    // a big soft highlight, so the middle of the floor looks polished
    const gl = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    gl.addColorStop(0, 'rgba(255,240,200,.13)');
    gl.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);

    // ---- the paint -------------------------------------------------
    const LW = Math.max(2, m(COURT.line));
    g.strokeStyle = '#f6f2e8'; g.lineWidth = LW; g.lineJoin = 'round';

    // sidelines and baselines
    g.strokeRect(X(-COURT.halfLen) + LW, Z(-COURT.halfWid) + LW,
                 m(COURT.halfLen * 2) - LW * 2, m(COURT.halfWid * 2) - LW * 2);
    // halfway line and centre circle
    g.beginPath(); g.moveTo(X(0), Z(-COURT.halfWid)); g.lineTo(X(0), Z(COURT.halfWid)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), m(COURT.circle), 0, 7); g.stroke();

    for (const s of [-1, 1]) {
      const base = s * COURT.halfLen;
      const hoop = s * COURT.rimX;
      // the key, filled in the trim colour the way a modern court is
      g.fillStyle = trim + 'cc';
      g.fillRect(Math.min(X(base), X(base - s * COURT.keyLen)), Z(-COURT.keyW / 2),
                 m(COURT.keyLen), m(COURT.keyW));
      g.strokeRect(Math.min(X(base), X(base - s * COURT.keyLen)) + LW / 2, Z(-COURT.keyW / 2) + LW / 2,
                   m(COURT.keyLen) - LW, m(COURT.keyW) - LW);
      // the free-throw circle
      g.beginPath(); g.arc(X(base - s * COURT.keyLen), Z(0), m(COURT.circle), 0, 7); g.stroke();
      // the three-point arc, with the straight sections down the sides
      const inset = COURT.halfWid - COURT.cornerIn;
      g.beginPath();
      g.moveTo(X(base), Z(-inset));
      g.lineTo(X(hoop), Z(-inset));
      g.stroke();
      g.beginPath();
      g.arc(X(hoop), Z(0), m(COURT.arc), s > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
            s > 0 ? Math.PI * 1.5 : Math.PI * 0.5, false);
      g.stroke();
      // the restricted-area semicircle under the basket
      g.beginPath(); g.arc(X(hoop), Z(0), m(COURT.restricted), 0, 7); g.stroke();
      // hash marks up the key
      for (const z of [-COURT.keyW / 2, COURT.keyW / 2]) {
        for (let i = 1; i <= 3; i++) {
          const x = base - s * len(1.75 + i * 0.85);
          g.beginPath();
          g.moveTo(X(x), Z(z));
          g.lineTo(X(x), Z(z + (z < 0 ? -len(0.35) : len(0.35))));
          g.stroke();
        }
      }
    }

    // THE CENTRE LOGO, which is what makes a court look like a building's
    // court rather than a diagram - and the one thing painted on this
    // floor that has a right way up.
    //
    // This texture lands on the top face of a box, whose u runs along
    // world +x and whose v runs along world +z, so canvas +x is +x and
    // canvas +y is -z. The camera lives behind the player and the player
    // mostly runs up and down the court, so the writing has to read when
    // you are looking along the LONG axis - which means its baseline runs
    // along z, which means a quarter turn here. Getting this wrong is why
    // it read backwards: a mirrored texture is not the same as a rotated
    // one, and the first attempt flipped the whole map instead.
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(Math.PI / 2);
    g.globalAlpha = 0.5;
    g.fillStyle = trim;
    g.beginPath(); g.arc(0, 0, m(len(1.45)), 0, 7); g.fill();
    g.globalAlpha = 0.85;
    g.fillStyle = '#1d2733';
    g.font = 'bold ' + m(len(0.9)) + 'px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('DUNK', 0, 0);
    g.restore();
  }, 16);
}

/** a ring of seated crowd, drawn once as instances */
function buildCrowd(scene) {
  const rows = 8, perRow = 64;
  const total = rows * perRow * 2 + rows * 22 * 2;
  // A SEATED PERSON IS A PERSON. These are the same scale as the players
  // on the floor, or the front row looks like a row of parents.
  const bodyGeo = new THREE.BoxGeometry(len(0.42), len(0.6), len(0.34));
  const headGeo = new THREE.BoxGeometry(len(0.24), len(0.26), len(0.24));
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, total);
  const heads = new THREE.InstancedMesh(headGeo, headMat, total);
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
  heads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  let i = 0;
  const put = (x, y, z, ry) => {
    if (i >= total) return;
    m.makeRotationY(ry);
    m.setPosition(x, y, z);
    bodies.setMatrixAt(i, m);
    const m2 = m.clone();
    m2.setPosition(x, y + len(0.44), z);
    heads.setMatrixAt(i, m2);
    // A CROWD IS NOT A GRADIENT. Real ones are mostly dark and drab with
    // a scattering of bright coats through them, and it is the scattering
    // the eye reads as "lots of separate people" rather than as texture.
    const loud = Math.random() < 0.18;
    col.setHSL(Math.random(), loud ? 0.62 : 0.22, loud ? 0.52 : 0.24 + Math.random() * 0.18);
    bodies.setColorAt(i, col);
    col.setHSL(0.07 + Math.random() * 0.05, 0.4, 0.35 + Math.random() * 0.3);
    heads.setColorAt(i, col);
    i++;
  };
  // THE ROWS CLIMB, and each row is a step the crowd sits on. The first
  // version put the crowd inside one solid box of a stand, which hid
  // every one of them: a stand is a staircase with people on the treads.
  for (let r = 0; r < rows; r++) {
    const y = len(0.75 + r * 0.55), z = COURT.halfWid + len(1.9 + r * 0.95);
    for (let k = 0; k < perRow; k++) {
      const x = -COURT.halfLen - len(2) + k * ((COURT.halfLen * 2 + len(4)) / perRow);
      put(x, y, z, Math.PI);
      put(x, y, -z, 0);
    }
  }
  for (let r = 0; r < rows; r++) {
    const y = len(0.75 + r * 0.55), x = COURT.halfLen + len(1.9 + r * 0.95);
    for (let k = 0; k < 22; k++) {
      const z = -COURT.halfWid - len(1) + k * ((COURT.halfWid * 2 + len(2)) / 22);
      put(x, y, z, -Math.PI / 2);
      put(-x, y, z, Math.PI / 2);
    }
  }
  bodies.count = i; heads.count = i;
  bodies.castShadow = false; bodies.receiveShadow = false;
  scene.add(bodies); scene.add(heads);
  return { bodies, heads, count: i };
}

/** one hoop: board, ring, net, stanchion */
function buildHoop(scene, side, trim) {
  const g = new THREE.Group();
  scene.add(g);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdfeaf2, transmission: 0.72, thickness: 0.05, roughness: 0.06,
    metalness: 0, transparent: true, opacity: 0.55, ior: 1.5,
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(len(0.06), COURT.boardH, COURT.boardW), glass);
  board.position.set(side * COURT.boardX, COURT.rimY + len(0.3), 0);
  board.castShadow = false; board.receiveShadow = true;
  g.add(board);
  // the frame and the painted square
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5 });
  for (const [w, h, y, z] of [[len(0.07), len(0.04), COURT.rimY + len(0.3) + COURT.boardH / 2, 0],
                              [len(0.07), len(0.04), COURT.rimY + len(0.3) - COURT.boardH / 2, 0]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, COURT.boardW), frameMat);
    bar.position.set(side * COURT.boardX, y, z);
    g.add(bar);
  }
  const sqMat = new THREE.MeshStandardMaterial({ color: 0xe8552f, roughness: 0.6 });
  const sq = new THREE.Mesh(new THREE.BoxGeometry(len(0.02), len(0.45), len(0.59)), sqMat);
  sq.position.set(side * (COURT.boardX - len(0.04)), COURT.rimY + len(0.22), 0);
  g.add(sq);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.35, metalness: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimR, len(0.018), 8, 28), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(side * COURT.rimX, COURT.rimY, 0);
  ring.castShadow = true;
  g.add(ring);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(len(0.5), len(0.05), len(0.08)), ringMat);
  arm.position.set(side * (COURT.rimX + len(0.24)), COURT.rimY, 0);
  g.add(arm);

  // the stanchion, behind the baseline
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.5, metalness: 0.3 });
  const poleH = COURT.rimY + len(1.2);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(len(0.22), poleH, len(0.22)), poleMat);
  pole.position.set(side * (COURT.halfLen + len(0.9)), poleH / 2, 0);
  pole.castShadow = true;
  g.add(pole);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(len(2.0), len(0.16), len(0.16)), poleMat);
  boom.position.set(side * (COURT.halfLen - len(0.1)), COURT.rimY + len(0.9), 0);
  g.add(boom);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(len(0.4), len(2.0), len(1.4)),
    new THREE.MeshStandardMaterial({ color: 0x161d28, roughness: 0.85 }));
  pad.position.set(side * (COURT.halfLen + len(0.55)), len(1.0), 0);
  pad.castShadow = true;
  g.add(pad);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(len(0.42), len(0.22), len(1.42)),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(trim), roughness: 0.7 }));
  stripe.position.set(side * (COURT.halfLen + len(0.55)), len(1.5), 0);
  g.add(stripe);

  // ---- the net -------------------------------------------------------
  const S = 12, R = 6;
  const net = { pts: [], links: [], S, R, side };
  for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) {
    const a = s / S * Math.PI * 2;
    const rad = COURT.rimR * (1 - r * 0.085);
    const p = new THREE.Vector3(side * COURT.rimX + Math.cos(a) * rad,
                                COURT.rimY - r * len(0.075),
                                Math.sin(a) * rad);
    net.pts.push({ p, old: p.clone(), pin: r === 0 });
  }
  const at = (r, s) => r * S + ((s + S) % S);
  for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) {
    if (r > 0) net.links.push([at(r - 1, s), at(r, s), net.pts[at(r - 1, s)].p.distanceTo(net.pts[at(r, s)].p)]);
    net.links.push([at(r, s), at(r, s + 1), net.pts[at(r, s)].p.distanceTo(net.pts[at(r, s + 1)].p)]);
    if (r > 0) net.links.push([at(r - 1, s), at(r, s + 1), net.pts[at(r - 1, s)].p.distanceTo(net.pts[at(r, s + 1)].p)]);
  }
  net.geo = new THREE.BufferGeometry();
  net.arr = new Float32Array(net.links.length * 2 * 3);
  net.geo.setAttribute('position', new THREE.BufferAttribute(net.arr, 3));
  net.mesh = new THREE.LineSegments(net.geo,
    new THREE.LineBasicMaterial({ color: 0xfbf9f2, transparent: true, opacity: 0.95 }));
  net.mesh.frustumCulled = false;
  scene.add(net.mesh);

  return { group: g, net, side, ring };
}

/**
 * Step one net.
 *
 * The ball is handed in so the net can be pushed out of its way; that is
 * the whole reason the net exists, so it is not optional.
 */
export function stepNet(net, dt, ball, ballR) {
  for (const q of net.pts) {
    if (q.pin) continue;
    const vx = (q.p.x - q.old.x) * 0.96, vy = (q.p.y - q.old.y) * 0.96, vz = (q.p.z - q.old.z) * 0.96;
    q.old.copy(q.p);
    q.p.x += vx; q.p.y += vy - 9.8 * len(1) * dt * dt * 30; q.p.z += vz;
  }
  if (ball) {
    for (const q of net.pts) {
      if (q.pin) continue;
      const dx = q.p.x - ball.x, dy = q.p.y - ball.y, dz = q.p.z - ball.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < ballR + 0.02 && d > 1e-5) {
        const s = (ballR + 0.02 - d) / d;
        q.p.x += dx * s; q.p.y += dy * s; q.p.z += dz * s;
      }
    }
  }
  for (let k = 0; k < 3; k++) for (const [i, j, rest] of net.links) {
    const a = net.pts[i], b = net.pts[j];
    const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-5) continue;
    const f = (d - rest) / d * 0.5;
    if (!a.pin) { a.p.x += dx * f; a.p.y += dy * f; a.p.z += dz * f; }
    if (!b.pin) { b.p.x -= dx * f; b.p.y -= dy * f; b.p.z -= dz * f; }
  }
  let k = 0;
  for (const [i, j] of net.links) {
    const a = net.pts[i].p, b = net.pts[j].p;
    net.arr[k++] = a.x; net.arr[k++] = a.y; net.arr[k++] = a.z;
    net.arr[k++] = b.x; net.arr[k++] = b.y; net.arr[k++] = b.z;
  }
  net.geo.attributes.position.needsUpdate = true;
}

/** everything that is not a player or the ball */
export function buildCourt(scene, trim) {
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture(trim), roughness: 0.34, metalness: 0.02,
  });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.halfLen * 2, len(0.2), COURT.halfWid * 2), floorMat);
  floor.position.y = -len(0.1);
  floor.receiveShadow = true;
  scene.add(floor);

  // the surround: a dark apron, then the stands
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.halfLen * 2 + len(8), len(0.18), COURT.halfWid * 2 + len(8)),
    new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.8 }));
  apron.position.y = -len(0.12);
  apron.receiveShadow = true;
  scene.add(apron);

  // the stands, as eight steps going up and back on all four sides, so
  // the crowd has something to sit on and the arena has a shape
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x1b2431, roughness: 0.9 });
  const stepMat2 = new THREE.MeshStandardMaterial({ color: 0x222d3d, roughness: 0.9 });
  const rise = len(0.55), run = len(0.95);
  for (let r = 0; r < 8; r++) {
    const y = rise + r * rise, z = COURT.halfWid + len(1.9) + r * run;
    for (const s of [-1, 1]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(COURT.halfLen * 2 + len(8), rise, run),
        r % 2 ? stepMat : stepMat2);
      step.position.set(0, y - rise / 2, s * z);
      step.receiveShadow = true;
      scene.add(step);
      const endStep = new THREE.Mesh(new THREE.BoxGeometry(run, rise, COURT.halfWid * 2 + len(4)),
        r % 2 ? stepMat : stepMat2);
      endStep.position.set(s * (COURT.halfLen + len(1.9) + r * run), y - rise / 2, 0);
      endStep.receiveShadow = true;
      scene.add(endStep);
    }
  }
  // and a dark back wall behind the top row
  for (const s of [-1, 1]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(COURT.halfLen * 2 + len(22), len(9.5), len(0.6)),
      new THREE.MeshStandardMaterial({ color: 0x232b38, roughness: 1 }));
    back.position.set(0, len(4.75), s * (COURT.halfWid + len(9.6)));
    scene.add(back);
    const backEnd = new THREE.Mesh(new THREE.BoxGeometry(len(0.6), len(9.5), COURT.halfWid * 2 + len(20)),
      new THREE.MeshStandardMaterial({ color: 0x232b38, roughness: 1 }));
    backEnd.position.set(s * (COURT.halfLen + len(9.6)), len(4.75), 0);
    scene.add(backEnd);
  }

  const crowd = buildCrowd(scene);
  const hoops = [buildHoop(scene, -1, trim), buildHoop(scene, 1, trim)];

  // the roof, so the arena is a room: dark, with light rigs in it
  // THE ROOF IS PALE AND LOWER. Black at thirteen metres was invisible,
  // which is worse than ugly - it read as no ceiling at all. A grey deck
  // at nine and a half catches the key light, gives the hall a lid, and
  // puts a horizon behind the top row of seats.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.halfLen * 2 + len(24), len(0.4), COURT.halfWid * 2 + len(24)),
    new THREE.MeshStandardMaterial({ color: 0x39414d, roughness: 0.95 }));
  roof.position.y = len(9.5);
  scene.add(roof);

  // roof trusses, because a flat lid is a lid and a trussed one is a building
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.9 });
  for (let i = -3; i <= 3; i++) {
    const t = new THREE.Mesh(
      new THREE.BoxGeometry(COURT.halfLen * 2 + len(20), len(0.34), len(0.34)), trussMat);
    t.position.set(0, len(9.1), i * len(3.4));
    scene.add(t);
  }

  // THE LIGHT RIGS ARE THE BRIGHTEST THING IN THE PICTURE and they should
  // look like it: a white panel with a soft glow plate under it.
  for (const x of [-len(9), -len(3), len(3), len(9)]) for (const z of [-len(4.5), len(4.5)]) {
    const rig = new THREE.Mesh(new THREE.BoxGeometry(len(3.0), len(0.26), len(1.1)),
      new THREE.MeshBasicMaterial({ color: 0xfffaf0 }));
    rig.position.set(x, len(8.85), z);
    scene.add(rig);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(len(4.4), len(2.2)),
      new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.16,
                                    depthWrite: false }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(x, len(8.6), z);
    scene.add(glow);
  }

  return { floor, hoops, crowd };
}
