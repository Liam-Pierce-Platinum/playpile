/* =====================================================================
   KICKBACK — main
   ===================================================================== */
import {
  W, H, P, initCanvas, gfx, present, clear, rect, px, poly, circle,
  cam, toScreenX, toScreenY, toWorldX, toWorldY, PPM, snapCamera, scale, rng,
} from './pix.js';
import { drawCity, buildCity } from './city.js';
import { buildLevel, drawBackWall, drawLight, drawStructure, drawForeground, drawCrate, L, HX, TOP, stairSpan } from './level2d.js';
import { B } from './rig2d.js';
import { Player, Enemy, UPGRADES, G, GUN, rollMods, makeFX, fire, falloff, rayBoxes, enemyMark } from './game.js';

const canvas = document.getElementById('view');
initCanvas(canvas);
buildCity();

const level = buildLevel();
const player = new Player(-HX + 8, 0.05);
const enemies = [];
for (const s of level.spawns) {
  if (s.f === 0 && Math.abs(s.x - player.x) < 8) continue;
  enemies.push(new Enemy(s.x, s.y + 0.05, s.tier, s.kind));
}

/* ---- the world, as everything that shoots needs to see it --------------- */
const world = {
  solids: level.solids, level, enemies, player,
  fx: null, freeze: 0,
  /* how long the crosshair has left to say the last shot landed */
  hit: 0, hitKill: false,
  /* ---- the firing token ---------------------------------------------------
     One man on a floor may be lining up a shot at a time. Four telegraphs
     landing together is not four times the difficulty, it is an unavoidable
     death - and it also destroys the read, because you cannot tell which
     of them is the one about to fire. */
  token: null,
  takeToken(e) {
    if (this.token && this.token.alive && this.token.state === 'aim' && this.token !== e) return false;
    this.token = e;
    return true;
  },
  releaseToken(e) { if (this.token === e) this.token = null; },
  blow(bar) {
    if (!bar.alive) return;
    bar.alive = false;
    const i = this.solids.indexOf(bar.solid);
    if (i >= 0) this.solids.splice(i, 1);
    const F = this.fx;
    F.pop(bar.x, bar.y + 0.5, 1.9, 0.34, P.hot);
    F.burst(bar.x, bar.y + 0.5, 46, 12, 0.8, [P.hot, P.flame, P.red, P.rust3], 1);
    F.shake = Math.min(2, F.shake + 1.3);
    /* everything close gets hurt AND thrown, and the throw is the
       interesting half: a drum is a free shell if you are willing to be
       standing beside it when it goes */
    const R = 4.4;
    for (const a of [this.player, ...this.enemies]) {
      if (!a.alive) continue;
      const dx = a.x - bar.x, dy = (a.y + 0.6) - (bar.y + 0.5);
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const f = 1 - d / R, n = Math.max(0.25, d);
      a.hurt(44 * f * f, 0, 0, this);
      a.vx += (dx / n) * 17 * f;
      a.vy += Math.max(0.4, dy / n) * 16 * f;
      if (a.vy > 1) { a.y += 0.04; a.grounded = false; }
    }
    for (const o of this.level.barrels) {
      if (!o.alive || o === bar) continue;
      if (Math.hypot(o.x - bar.x, o.y - bar.y) < R * 0.9)
        setTimeout(() => this.blow(o), 80 + Math.random() * 140);
    }
  },
};

/* ---- input ---------------------------------------------------------------- */
const IN = { left: false, right: false, aim: 0, fire: false, fire2: false, reload: false };
let mx = W * 0.7, my = H * 0.4, held = false, held2 = false;
const KEY = { KeyA: 'left', KeyD: 'right', ArrowLeft: 'left', ArrowRight: 'right' };
addEventListener('keydown', (e) => {
  if (KEY[e.code]) IN[KEY[e.code]] = true;
  if (e.code === 'KeyR') IN.reload = true;
  if (e.code === 'KeyP') paused = !paused;
  if (choosing && /Digit[123]/.test(e.code)) pick(+e.code.slice(5) - 1);
  if (['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { if (KEY[e.code]) IN[KEY[e.code]] = false; });
addEventListener('blur', () => { IN.left = IN.right = false; held = held2 = false; });
addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  /* deliberately NOT clamped. The aim wants the true angle even when the
     pointer is off the picture; only the drawn crosshair gets pinned. */
  mx = (e.clientX - r.left) / r.width * W;
  my = (e.clientY - r.top) / r.height * H;
});
addEventListener('mousedown', (e) => {
  if (choosing) return;
  if (e.button === 0) { held = true; IN.fire = true; }
  if (e.button === 2) { held2 = true; IN.fire2 = true; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) held = false; if (e.button === 2) held2 = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mouseleave', () => { held = held2 = false; });

function aimFromMouse() {
  const wx = toWorldX(mx), wy = toWorldY(my);
  return Math.atan2(wy - (player.y + B.shoulder), wx - player.x);
}

/* ---- the upgrade crate ----------------------------------------------------- */
let choosing = null, paused = false, won = false, winT = 0, time = 0;
function offer(crate) {
  const pool = UPGRADES.filter((u) => (player.owned[u.id] || 0) < u.max);
  const R = rng(1234 + crate.f * 77);
  const picks = [];
  const bag = pool.slice();
  while (picks.length < Math.min(3, bag.length)) {
    const i = (R() * bag.length) | 0;
    picks.push(bag.splice(i, 1)[0]);
  }
  choosing = { crate, picks };
}
function pick(i) {
  if (!choosing || !choosing.picks[i]) return;
  const u = choosing.picks[i];
  player.owned[u.id] = (player.owned[u.id] || 0) + 1;
  player.regear();
  player.shells = player.mods.shells;
  /* AND IT PATCHES YOU UP. Not all the way - a floor you took badly is
     still a floor you took badly - but there is no other healing in the
     building and six floors on one bar is not a run, it is a coin flip.
     The crate at the top of every stair is the checkpoint. */
  player.hp = Math.min(100, player.hp + 45);
  choosing.crate.taken = true;
  choosing = null;
}

/* ---- camera ----------------------------------------------------------------
   Leads toward the aim and settles on the STOREY rather than on the
   player's exact height, or every recoil jump throws the whole building up
   and down the screen. Snapped to whole pixels, always. */
function updateCamera(dt) {
  const lead = Math.cos(player.aim) * 2.6;
  const wantX = Math.max(-HX + 7.0, Math.min(HX - 7.0, player.x + lead));
  const storeyY = Math.round(player.y / L.storey) * L.storey;
  const wantY = (player.grounded ? storeyY + 2.0 : player.y * 0.55 + storeyY * 0.45 + 1.8);
  cam.x += (wantX - cam.x) * Math.min(1, 6 * dt);
  cam.y += (wantY - cam.y) * Math.min(1, (player.grounded ? 4.5 : 8.5) * dt);
  const s = world.fx.shake;
  cam.sx = Math.round((Math.random() - 0.5) * s * 7);
  cam.sy = Math.round((Math.random() - 0.5) * s * 7);
  snapCamera();
}

/* ---- the loop --------------------------------------------------------------- */
function step(dt) {
  /* HITSTOP. A few frames where nothing moves at all. It is the oldest
     trick in the book and there is no substitute for it: without it a
     shotgun hit is a number going down, with it the whole screen flinches. */
  if (world.freeze > 0) { world.freeze -= dt; world.fx.update(dt); return; }
  time += dt;
  world.hit = Math.max(0, world.hit - dt);
  IN.aim = aimFromMouse();
  if (held) IN.fire = true;
  if (held2) IN.fire2 = true;
  player.update(dt, IN, world);
  IN.fire = IN.fire2 = IN.reload = false;
  for (const e of enemies) e.update(dt, world, player);
  world.fx.update(dt);
  for (const c of level.crates) {
    if (c.taken) continue;
    if (Math.abs(c.x - player.x) < 0.8 && Math.abs(c.y - player.y) < 1.4) { offer(c); break; }
  }
  if (!won && player.alive && player.y > TOP - 0.5) { won = true; winT = 0; }
  if (won) winT += dt;
}

function render() {
  const g = gfx();
  clear(P.ink);
  drawCity(g, cam);
  drawBackWall(level, cam.y);
  drawLight(level, cam.y, time);
  drawStructure(level, cam.y);
  for (const c of level.crates) drawCrate(c, time);
  for (const e of enemies) if (!e.alive) e.draw(e.mods);
  for (const e of enemies) if (e.alive) e.draw(e.mods);
  player.draw(player.mods);
  drawMarks();
  world.fx.draw();
  drawForeground(cam.y, time);
  vignette(g);
  drawHUD(g);
  if (choosing) drawChoice(g);
  present();
}

/* THE MARK OVER A MAN'S HEAD.
   At this resolution you cannot read a pose from across a floor, so the
   thing an enemy is doing has to be written above him: a yellow bang when
   he first sees you, a red bracket that closes over half a second while he
   lines the shot up, two dots while he is reloading and helpless. Those
   three symbols are the entire combat interface, and without them the
   fight is guesswork. */
/* A VIGNETTE, in four steps of the palette rather than a gradient. It is
   worth more than it sounds: the frame stops being a rectangle of even
   brightness, and the eye is pushed to the middle where the fight is. */
function vignette(g) {
  g.globalAlpha = 0.10;
  for (let i = 0; i < 5; i++) {
    const t = i * 5;
    g.fillStyle = P.ink;
    g.fillRect(0, t, W, 5); g.fillRect(0, H - t - 5, W, 5);
    g.fillRect(t, 0, 5, H); g.fillRect(W - t - 5, 0, 5, H);
  }
  g.globalAlpha = 1;
}

function drawMarks() {
  const g = gfx();
  for (const e of enemies) {
    const m2 = enemyMark(e);
    if (!m2) continue;
    const sx = toScreenX(e.x), sy = toScreenY(e.y + 1.62);
    if (sx < -12 || sx > W + 12) continue;
    if (m2.kind === 'spot') {
      px(sx - 1, sy - 8, 3, 6, P.gold);
      px(sx - 1, sy - 1, 3, 2, P.gold);
    } else if (m2.kind === 'aim') {
      /* a bracket that closes. How far shut it is IS how long you have. */
      const f = 1 - m2.t / m2.of;
      const w2 = Math.round(9 - f * 6);
      px(sx - w2, sy - 8, 2, 8, P.red);
      px(sx + w2 - 2, sy - 8, 2, 8, P.red);
      px(sx - w2, sy - 8, w2 * 2, 2, P.red);
      if (f > 0.8) px(sx - 3, sy - 6, 6, 4, P.hot);
    } else {
      const k = (time * 6 | 0) % 3;
      for (let i = 0; i < 3; i++) px(sx - 4 + i * 4, sy - 5, 2, 2, i === k ? P.gold : P.slate);
    }
  }
}

/* ---- the overlay -------------------------------------------------------------
   Drawn at 480x270, in the same pixels as the game. A crisp modern HUD
   over a chunky game is the commonest way this look gets broken. */
function shellIcon(g, x, y, full) {
  px(x, y, 5, 11, full ? P.red : P.deep);
  px(x, y, 5, 4, full ? P.gold : P.slate);
  px(x, y, 1, 11, full ? '#f06058' : P.slate);
}
function drawHUD(g) {
  const m = player.mods;
  /* shells */
  for (let i = 0; i < m.shells; i++) shellIcon(g, 8 + i * 7, H - 18, i < player.shells);
  if (player.reload > 0) {
    const f = 1 - player.reload / m.reload;
    px(8, H - 22, m.shells * 7 - 2, 2, P.deep);
    px(8, H - 22, (m.shells * 7 - 2) * f, 2, P.gold);
  }
  /* health, in blocks that go rather than a bar that shrinks */
  const blocks = 10, have = Math.ceil(Math.max(0, player.hp) / 100 * blocks);
  for (let i = 0; i < blocks; i++)
    px(8 + i * 6, H - 30, 4, 4, i < have ? (have <= 3 ? P.red : P.sky5) : P.deep);
  /* where you are, and what is between you and the roof */
  g.font = '8px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillStyle = P.bone;
  g.fillText('FLOOR ' + (player.floor + 1) + '/' + L.floors, 8, 12);
  const left = enemies.filter((e) => e.alive && Math.abs(e.homeY - player.y) < L.storey * 0.9).length;
  if (left) { g.fillStyle = P.red; g.fillText(left + ' HERE', 8, 22); }
  /* what you are carrying */
  {
    let yy = 12;
    g.textAlign = 'right';
    for (const id in player.owned) {
      const u = UPGRADES.find((q) => q.id === id);
      g.fillStyle = P.gold;
      g.fillText(u.name + (player.owned[id] > 1 ? ' x' + player.owned[id] : ''), W - 8, yy);
      yy += 9;
    }
  }
  /* THE CROSSHAIR IS THE PATTERN, and this is the only honest way to tell
     somebody what a shotgun's range is. Four ticks sitting at the actual
     radius the pellets will cover at the distance you are pointing: close
     up they are almost touching, across the room they are a hand's width
     apart, and you can SEE the gun opening as you back off. Then the
     colour is the falloff - white inside the sweet spot, bone through the
     middle of the curve, grey once you are past the end of the gun. There
     is no number anywhere and there does not need to be. */
  const cx = Math.max(3, Math.min(W - 4, Math.round(mx)));
  const cy = Math.max(3, Math.min(H - 4, Math.round(my)));
  const off = (cx !== Math.round(mx) || cy !== Math.round(my));
  const aimD = Math.hypot(toWorldX(mx) - player.x, toWorldY(my) - (player.y + B.shoulder));
  /* FOUR CORNERS, NOT FOUR TICKS. The first version put a tick at the true
     pattern radius, which at six metres is twenty-five pixels out - and
     four lone pixels twenty-five apart are not a crosshair, they are four
     bits of litter. An L at each corner reads as ONE box however wide it
     opens. And the radius is the pattern scaled down rather than actual
     size, because honest and unreadable is still unreadable. */
  const r = Math.max(4, Math.min(16, Math.round(3 + Math.tan(m.spread) * aimD * PPM * 0.45)));
  const reach = aimD <= m.range;
  const fall = falloff(Math.min(aimD, m.range), m);
  /* and the colour is the falloff: white where it kills, gold through the
     middle of the curve, rust where it is down to a chip, grey once you
     are past the end of the gun */
  const col = player.shells <= 0 ? P.red
    : !reach ? P.slate
      : fall > 0.95 ? P.white : (fall > 0.55 ? P.gold : P.rust3);
  for (const [ox2, oy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx2 = cx + ox2 * r, by2 = cy + oy2 * r;
    px(ox2 < 0 ? bx2 : bx2 - 2, by2, 3, 1, col);
    px(bx2, oy2 < 0 ? by2 : by2 - 2, 1, 3, col);
  }
  /* a pip in the middle, one pixel, so the thing you are pointing at is
     never hidden by the thing telling you where you are pointing */
  px(cx, cy, 1, 1, off ? P.gold : col);
  /* past the end of the gun the box gets a bar through it, which says
     "nothing you do from here does anything" without a word */
  if (!reach && player.shells > 0) px(cx - r + 2, cy, r * 2 - 4, 1, P.slate);
  /* THE HIT MARKER, and it is not decoration. A shotgun at this range is
     seven rays and a number going down somewhere off the side of the
     screen; without a mark here the honest player conclusion is that
     shooting people does nothing at all. Four diagonals, white for a hit
     and red for a kill, kicking outward as they fade. */
  if (world.hit > 0) {
    const f2 = world.hit / 0.26;
    const sp = 3 + Math.round((1 - f2) * 3);
    const col = world.hitKill ? P.red : P.white;
    for (const [dx2, dy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      for (let i = 0; i < 3; i++)
        px(cx + dx2 * (sp + i), cy + dy2 * (sp + i), 1, 1, col);
  }

  if (!player.alive) {
    px(0, 0, W, H, 'rgba(21,18,30,0.62)');
    g.textAlign = 'center';
    g.fillStyle = P.red; g.font = '20px ui-monospace, monospace';
    g.fillText('DOWN', W / 2, H / 2 - 2);
    g.fillStyle = P.bone; g.font = '8px ui-monospace, monospace';
    g.fillText('reload the page', W / 2, H / 2 + 14);
  } else if (won) {
    g.textAlign = 'center';
    g.fillStyle = P.gold; g.font = '20px ui-monospace, monospace';
    g.fillText('THE ROOF', W / 2, 52);
  }
  g.textAlign = 'left';
}

function drawChoice(g) {
  px(0, 0, W, H, 'rgba(21,18,30,0.78)');
  g.textAlign = 'center';
  g.fillStyle = P.gold; g.font = '10px ui-monospace, monospace';
  g.fillText('PICK ONE', W / 2, 40);
  const n = choosing.picks.length;
  const cw = 128, gap = 12;
  const x0 = (W - (n * cw + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    const u = choosing.picks[i];
    const x = x0 + i * (cw + gap), y = 62, ch = 128;
    px(x, y, cw, ch, P.deep);
    px(x, y, cw, 2, P.gold);
    px(x, y + ch - 2, cw, 2, P.slate);
    px(x, y, 2, ch, P.slate); px(x + cw - 2, y, 2, ch, P.slate);
    g.fillStyle = P.gold; g.font = '9px ui-monospace, monospace';
    g.fillText(u.name, x + cw / 2, y + 22);
    g.fillStyle = P.bone; g.font = '8px ui-monospace, monospace';
    u.blurb.split('\n').forEach((line, k) => g.fillText(line, x + cw / 2, y + 44 + k * 11));
    const have = player.owned[u.id] || 0;
    g.fillStyle = P.mid;
    g.fillText(have ? 'HAVE ' + have + ' / ' + u.max : '', x + cw / 2, y + ch - 26);
    g.fillStyle = P.white; g.font = '12px ui-monospace, monospace';
    g.fillText('[' + (i + 1) + ']', x + cw / 2, y + ch - 10);
  }
  g.textAlign = 'left';
}

let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.2) dt = 0.2;
  if (!paused && !choosing) {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 5) { acc -= STEP; step(STEP); }
    updateCamera(dt);
  }
  render();
}

world.fx = makeFX();
cam.x = player.x; cam.y = 2;
requestAnimationFrame(frame);

window.KB = {
  player, enemies, world, level, IN, cam, G, GUN, UPGRADES,
  B, L, HX, TOP, stairSpan, fire, rayBoxes, toWorldX, toWorldY, toScreenX, toScreenY,
  setMouse: (x, y) => { mx = x; my = y; },
  pause: (v) => { paused = v; },
  step, render, rollMods,
  pickUpgrade: (id) => { player.owned[id] = (player.owned[id] || 0) + 1; player.regear(); },
  get choosing() { return choosing; },
  choose: pick,
};
