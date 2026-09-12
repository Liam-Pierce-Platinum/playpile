// =====================================================================
// STACK - drop each slab on the one below. Now in side-view 3D.
// =====================================================================
//
// Liam: *"side view 3D for stack"*.
//
// The rule is unchanged and it is still the whole game: what hangs over
// the edge is cut off, so being late costs you width, and width is your
// margin for being late next time. A perfect drop pays the width back.
//
// What 3D adds here is not depth of play, it is READABILITY. A slab is a
// real block with a lit top, a bright front and a shaded side, so you can
// see the overhang before you drop - the sliver of front face that is
// hanging over nothing is visible as a different shade. In the flat
// version that information was a one-pixel colour change.
//
// Two things keep it a 2D game to play:
//   - the camera is ORTHOGRAPHIC and dead side-on plus a few degrees, so
//     nothing on the left leans differently from anything on the right;
//   - the slab slides along X only. Nothing ever moves towards the lens.
//
// The cut-off piece is now a real falling solid that tumbles off the
// tower and lands on the ground, which is the bit that actually sells it.
import { Deck3D, THREE, mat, box, clamp, rnd, lerp } from '../_deck/deck3d.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck3D({ key: 'stack', w: 460, h: 720, units: 17, bg: '#0b1018',
                       tilt: 0.20, scale: 2 });

const BH = 0.62;               // slab height, world units
const BD = 5.0;                // slab depth - it never changes
const BASE_W = 6.2;
const PERFECT = 0.12;
const GROUND_Y = -3.4;

let blocks, cur, debris, score, combo, over, started, camY, shake;
const root = new THREE.Group();
D.scene.add(root);

// ---- the world that is not the tower --------------------------------
// A ground plane and a far wall, so the shadow has somewhere to land and
// the tower is standing in a place rather than floating in a void.
{
  const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 1.2, 40), mat('#161f2c'));
  ground.position.set(0, GROUND_Y - 0.6, 0);
  ground.receiveShadow = true;
  D.scene.add(ground);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(120, 200), mat('#0e141e'));
  back.position.set(0, 40, -18);
  back.receiveShadow = true;
  D.scene.add(back);
}

const hue = (i) => (202 + i * 7) % 360;
const colOf = (i, dark = 0) => new THREE.Color().setHSL(hue(i) / 360, 0.42, 0.52 - dark);

function slabMesh(w, i) {
  // Six materials: top lit, front bright, sides darker. That split is
  // what makes an overhang visible - the front face of the part hanging
  // over nothing catches the light differently from the part supported.
  const c = colOf(i);
  const top = mat(c.clone().offsetHSL(0, 0, 0.10));
  const side = mat(c.clone().offsetHSL(0, 0, -0.10));
  const front = mat(c);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, BH, BD),
    [side, side, top, mat(c.clone().offsetHSL(0, 0, -0.18)), front, side]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function reset() {
  for (const b of blocks || []) root.remove(b.mesh);
  for (const d of debris || []) root.remove(d.mesh);
  blocks = []; debris = [];
  score = 0; combo = 0; over = false; camY = 0; shake = 0;
  const m = slabMesh(BASE_W, 0);
  m.position.set(0, GROUND_Y + BH / 2, 0);
  root.add(m);
  blocks.push({ x: 0, w: BASE_W, y: m.position.y, mesh: m });
  spawn();
}

function spawn() {
  const top = blocks[blocks.length - 1];
  const dir = Math.random() < 0.5 ? 1 : -1;
  const m = slabMesh(top.w, blocks.length);
  const y = top.y + BH;
  m.position.set(dir > 0 ? -9 : 9, y, 0);
  root.add(m);
  cur = { x: m.position.x, w: top.w, y, dir, mesh: m,
          speed: 4.2 + Math.min(6.5, score * 0.22) };
}

function drop() {
  const top = blocks[blocks.length - 1];
  const l = Math.max(cur.x - cur.w / 2, top.x - top.w / 2);
  const r = Math.min(cur.x + cur.w / 2, top.x + top.w / 2);
  const overlap = r - l;

  if (overlap <= 0) {                          // missed the tower entirely
    over = true; D.record(score);
    fall(cur.x, cur.y, cur.w, blocks.length, cur.dir * 2);
    root.remove(cur.mesh); cur = null;
    D.noise(0.34, 0.08, 260);
    return;
  }

  const off = Math.abs(cur.x - top.x);
  if (off <= PERFECT) {
    combo++;
    const gain = combo >= 3 ? 0.30 : 0.10;
    cur.x = top.x;
    cur.w = Math.min(BASE_W, cur.w + gain);
    D.beep(520 + combo * 60, 0.09, 'triangle', 0.06, 260);
  } else {
    combo = 0;
    const cutW = cur.w - overlap;
    const cutX = cur.x < top.x ? (cur.x - cur.w / 2 + cutW / 2) : (cur.x + cur.w / 2 - cutW / 2);
    fall(cutX, cur.y, cutW, blocks.length, cur.x < top.x ? -1.6 : 1.6);
    cur.x = (l + r) / 2; cur.w = overlap;
    D.beep(220, 0.05, 'square', 0.045, -80);
    shake = Math.min(0.16, cutW * 0.05);
  }

  // rebuild the mesh at its new width - a slab that was sliced is a
  // narrower box, not a scaled one, or the bevel of light on its front
  // stretches with it
  root.remove(cur.mesh);
  const m = slabMesh(cur.w, blocks.length);
  m.position.set(cur.x, cur.y, 0);
  root.add(m);
  blocks.push({ x: cur.x, w: cur.w, y: cur.y, mesh: m });
  score++;

  if (cur.w < 0.22) { over = true; D.record(score); D.noise(0.4, 0.08, 240); cur = null; return; }
  spawn();
}

/** the piece that was cut off, as a real solid that tumbles away */
function fall(x, y, w, i, push) {
  const m = slabMesh(w, i);
  m.position.set(x, y, 0);
  root.add(m);
  debris.push({ mesh: m, vy: 0.6, vx: push, spin: rnd(-3.5, 3.5), spinZ: rnd(-2, 2) });
}

function step(dt) {
  if (!started) {
    home.step(dt);
    return;
  }

  if (!over && cur) {
    cur.x += cur.dir * cur.speed * dt;
    const limit = 8.4;
    if (cur.x < -limit) { cur.x = -limit; cur.dir = 1; }
    if (cur.x > limit) { cur.x = limit; cur.dir = -1; }
    cur.mesh.position.x = cur.x;
    if (D.tapped()) drop();
  } else if (D.tapped()) {
    home.finish(score);
    started = false; return;
  }

  for (const d of debris) {
    d.vy -= 22 * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.rotation.z += d.spin * dt;
    d.mesh.rotation.x += d.spinZ * dt;
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    if (debris[i].mesh.position.y < GROUND_Y - 14) { root.remove(debris[i].mesh); debris.splice(i, 1); }
  }

  // THE CAMERA CLIMBS WITH THE TOWER, smoothly, and only once the top of
  // it is past the middle of the screen. Following every slab makes the
  // whole world jump on every drop.
  const topY = blocks.length ? blocks[blocks.length - 1].y : 0;
  const want = Math.max(0, topY - (GROUND_Y + D.viewH * 0.34));
  camY = lerp(camY, want, Math.min(1, dt * 4));
  shake *= 0.86;
  D.lookAt(rnd(-shake, shake), camY + rnd(-shake, shake) + D.viewH * 0.12);

  D.hud('SCORE ' + score, 'BEST ' + D.best + (combo >= 2 ? '   x' + combo : ''));
  if (over) D.card('DROPPED', [score + ' slabs', 'best ' + D.best], 'click to go again');
}

const board = new Board('stack', { unit: 'SLABS', format: (v) => v + ' slabs' });
const home = new Home(D, {
  title: 'STACK',
  lines: ['drop each slab on the one below',
          'what hangs over the edge is cut off',
          'a perfect drop gives the width back'],
  board,
  buttons: [{ label: 'BUILD', sub: 'one button, as high as you can', fn: () => { started = true; reset(); } }],
  hint: 'CLICK or SPACE to drop · P pause',
});

reset(); started = false;

if (D.shot) {
  started = true;
  for (let i = 1; i <= 12; i++) {
    const top = blocks[blocks.length - 1];
    const off = (i % 3 === 0) ? 0 : rnd(-0.5, 0.5);
    const w = Math.max(2.4, top.w - Math.abs(off));
    const x = top.x + off;
    const m = slabMesh(w, i);
    m.position.set(x, top.y + BH, 0);
    root.add(m);
    blocks.push({ x, w, y: m.position.y, mesh: m });
    score++;
  }
  root.remove(cur.mesh); spawn();
  cur.x = blocks[blocks.length - 1].x - 1.9; cur.mesh.position.x = cur.x;
  fall(blocks[blocks.length - 1].x + 2.2, blocks[blocks.length - 1].y - 1, 0.9, 7, 1.2);
  camY = Math.max(0, blocks[blocks.length - 1].y - (GROUND_Y + D.viewH * 0.34));
}

D.run(step);
