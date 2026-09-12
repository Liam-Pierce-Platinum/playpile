// =====================================================================
// HIGHRISE :: main.js - boot, loop, and the floor you are on
// =====================================================================
import * as THREE from '../vendor/three.module.js';
import { plan, build, WALL_H, toWorld, W, D } from './level.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import * as Doors from './doors.js';
import { makeActor } from './actor.js';
import { toCell, W as PW, D as PD, EMPTY } from './plan.js';
import { preloadRef, cityscape } from './refprops.js';
import { Building, FLOORS } from './building.js';
import { loadEdits } from './edits.js';
import { Editor } from './editor.js';
import { Intro } from './intro.js';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));

// A FIXED, FLAT LIGHT RIG, on purpose.
//
// The look this is chasing lit its levels by baking value into the
// textures and putting one weak key on top. Real-time shadows and
// physical falloff read as a decade later, and cost frames that this
// wants to spend on bodies. So: a hemisphere for the room, one weak key
// for form, and a fog that eats the far end of a corridor - which is
// also what makes a long sightline feel dangerous instead of merely long.
const scene = new THREE.Scene();
// FOG THAT STILL EATS A CORRIDOR BUT LETS YOU SEE THE CITY.
// At 20-62 metres the skyline was solid fog. A 46 m corridor is still
// well into the haze at 26-150, and a building 90 m out reads as a
// building 90 m out - which is the entire point of putting it there.
// FAR ENOUGH TO SEE THE CITY, near enough that the far ring dissolves
// rather than ending. The skyline now runs out to 420 m (refprops.js
// cityscape) and a 150 m fog cut it off in a hard grey wall halfway
// through the third row.
scene.fog = new THREE.Fog(0x1d2430, 40, 460);
scene.background = new THREE.Color(0x1d2430);
// Bright and flat, because the reference is. A 2004 office level was lit
// by baked value in the texture plus a generous ambient - murk is a later
// decade's idea, and it also hides the very texture detail this whole
// look is built on.
scene.add(new THREE.HemisphereLight(0xdce6f2, 0x4a4038, 2.35));
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffeedd, 0.85);
key.position.set(0.4, 1, 0.25);
scene.add(key);

// NEAR PLANE 0.12, NOT 0.05.
//
// Depth precision is dominated by the near/far RATIO, and when the far
// plane went from 140 m to 700 m for the skyline it went from 2,800:1 to
// 14,000:1. That quietly broke every decal in the game: a bullet hole
// sits 6 mm off a wall and blood 4 mm off the floor, and at that ratio
// those offsets are smaller than the depth buffer can tell apart, so they
// failed the depth test against the surface they were on and simply did
// not draw. Liam asked me to "add bullet holes" - they had been there all
// along and had become invisible.
//
// 0.12 m is closer than the player's eye ever gets to a wall (his own
// radius is 0.32), so nothing clips, and it buys back more than half the
// precision on its own.
const camera = new THREE.PerspectiveCamera(78, 1, 0.12, 700);

// ---------------------------------------------------------------------
export const game = {
  floor: 1, kills: 0, level: null, player: null,
  t: 0, dt: 0, paused: true,
  log: (msg) => {
    const el = document.getElementById('log');
    const d = document.createElement('div');
    d.textContent = msg;
    el.appendChild(d);
    setTimeout(() => d.remove(), 3600);
    while (el.children.length > 5) el.firstChild.remove();
  },
};

// =====================================================================
// THE BUILDING
// =====================================================================
//
// Liam: *"I meant in like a each level is physical ... its like a
// physical building with levels"*.
//
// There is no longer any such thing as loading a floor. Every storey the
// player has been near exists at its true height in the same scene, and
// which one he is "on" is a reading taken off his feet - see
// building.js. `world` is just a shorthand for whichever storey that is.
const building = new Building(scene);
game.building = building;
let world = null;

/** put the player on storey n, on foot. Only used at boot and on death. */
export function loadFloor(n, arrive) {
  const w = building.ensure(n);
  if (!w) return null;
  building.update(Building.baseY(n) + 0.5);
  syncFloor(true);

  const P = w.plan, p = game.player;
  const [px, pz] = toWorld(P.spawn.x, P.spawn.z);
  // AND NEVER START INSIDE ANYTHING, whatever put it there. A spawn that
  // depends on the furnisher behaving is a spawn that breaks the next
  // time the furnisher changes. Spiral out to the nearest place a man
  // actually fits.
  const base = w.base;
  let sx = px, sz = pz;
  // AND NOT NEXT TO ANYBODY, EITHER.
  //
  // Liam: *"make the player not spawn next to bad guys"*. combat.js keeps
  // a clear radius round this point when it fills the floor, which is the
  // real fix; this is the second half of it, because men move. If one has
  // wandered onto the spawn by the time you arrive, the same spiral that
  // already finds a space you fit in will step over him.
  const clearOfMen = (x, z) => {
    const C = game.combat;
    if (!C) return true;
    for (const m of C.actors) {
      if (!m.alive || (m.floor || 1) !== n) continue;
      if (Math.hypot(m.x - x, m.z - z) < 7) return false;
    }
    return true;
  };
  // room for a man, ignoring who is standing in it
  const clearOfThings = (x, z) => !w.solids.some((b) =>
    Math.abs(x - b.x) < b.w/2 + 0.34 && Math.abs(z - b.z) < b.d/2 + 0.34
    && b.y - b.h/2 < 1.7 && b.y + b.h/2 > 0.05);
  const fits = (x, z) => clearOfMen(x, z) && clearOfThings(x, z);
  // THE SPIRAL MUST NOT LEAVE THE BUILDING.
  //
  // Liam: *"I accidentally somehow moved the players spawn point to
  // outside of the building"*. He had not moved anything - he had placed
  // a man two and a half metres from the spawn. `clearOfMen` then refused
  // every point near it, the spiral walked outward looking for somewhere
  // that fit, and OUTSIDE THE FLOOR PLATE EVERY POINT FITS, because there
  // is no furniture out there to collide with and no men standing in it.
  // So the first "free" spot it found was off the edge of the world, and
  // it reported success.
  //
  // A spawn candidate has to be a cell the plan says you can stand in.
  // That is the test that was missing, and it is the one that cannot be
  // satisfied by open air.
  const onFloor = (x, z) => {
    const [cx, cz] = toCell(x, z);
    if (cx < 1 || cz < 1 || cx >= PW - 1 || cz >= PD - 1) return false;
    return P.at(cx, cz) === EMPTY;
  };
  if (!fits(sx, sz) || !onFloor(sx, sz)) {
    // TWO PASSES. The first keeps its distance from the men, which is
    // what you want; the second gives that up rather than give up the
    // building, because being spawned near somebody is a bad start and
    // being spawned in the sky is not a start at all.
    let found = false;
    for (const mindMen of [true, false]) {
      outer:
      for (let rad = 0.5; rad <= 14; rad += 0.5) {
        for (let k = 0; k < 16; k++) {
          const x = px + Math.cos(k / 16 * 6.2832) * rad;
          const z = pz + Math.sin(k / 16 * 6.2832) * rad;
          if (!onFloor(x, z)) continue;
          if (mindMen ? fits(x, z) : clearOfThings(x, z)) {
            sx = x; sz = z; found = true; break outer;
          }
        }
      }
      if (found) break;
    }
    // and if even THAT fails, the middle of the first room beats a guess
    if (!found && P.rooms && P.rooms.length) {
      const r = P.rooms[0];
      const [rx, rz] = toWorld((r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1);
      sx = rx; sz = rz;
    }
  }
  p.pos.set(sx, base, sz);
  p.vel.set(0, 0, 0);
  const [ex, ez] = toWorld(P.exits[0].x, P.exits[0].z);
  p.yaw = Math.atan2(-(ex - sx), -(ez - sz));
  syncFloor(true);
  return w;
}

/**
 * Read the storey off the player's feet and tell everything else.
 *
 * This runs every frame and does nothing at all on the frames where he
 * has not crossed a slab - which is almost all of them. When he HAS, the
 * building builds and reveals what he can now see, the collision set is
 * rebuilt from three storeys, and the new storey is peopled if it has
 * never been peopled before.
 */
function syncFloor(force) {
  const p = game.player;
  if (!building.update(p.pos.y + 0.05) && !force) return;
  world = building.current();
  if (!world) return;
  game.level = world;
  game.floor = world.n;
  document.getElementById('fnum').textContent = world.n;
  if (game.combat) {
    game.combat.building = building;
    // ONE STOREY OF WARNING. The men on the floor above are spawned
    // before you get there, so you can hear them through the slab and so
    // that walking up the last three treads does not pop a fight into
    // existence in front of you.
    for (const k of [world.n, world.n + 1]) {
      const w = building.get(k);
      if (w) { game.combat.populate(w.plan, k, w.base); game.combat.realise(w); }
    }
  }
}

// ---------------------------------------------------------------------
// input
// ---------------------------------------------------------------------
const keys = {};
const CODE = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: 'space',
               ShiftLeft: 'shift', ControlLeft: 'ctrl', KeyR: 'r', KeyE: 'e', KeyQ: 'q', KeyV: 'v', KeyF: 'melee', KeyH: 'bandage' };
addEventListener('keydown', (e) => {
  const k = CODE[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
  if (/^Digit[1-8]$/.test(e.code)) keys.slot = +e.code.slice(5);
});
addEventListener('keyup', (e) => { const k = CODE[e.code]; if (k) keys[k] = false; });
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  game.player.look(e.movementX, e.movementY);
  // handed to the arms, so the weapon lags the camera instead of being
  // welded to it
  if (game.combat) {
    game.combat.lookDX = (game.combat.lookDX || 0) + e.movementX * 0.010;
    game.combat.lookDY = (game.combat.lookDY || 0) + e.movementY * 0.010;
  }
});
addEventListener('mousedown', (e) => {
  if (e.button === 0) keys.fire = true;
  if (e.button === 2) keys.melee = true;      // a shove, always available
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mouseup', (e) => { if (e.button === 0) keys.fire = false; });
// THE WHEEL, because eight weapons is more than a hand wants to reach for
// mid-fight, and the one you need in a hurry is whichever you just picked
// up off the floor.
addEventListener('wheel', (e) => {
  if (!document.pointerLockElement) return;
  keys.wheel = e.deltaY > 0 ? 1 : -1;
}, { passive: true });

const bootEl = document.getElementById('boot');
const deadEl = document.getElementById('dead');
// ---------------------------------------------------------------------
// THE OPENING
// ---------------------------------------------------------------------
//
// Liam asked for a cutscene before the first floor: a car pulls up,
// somebody hands him a note and a reason, and he looks up at the tower.
// See intro.js - it owns its own scene and camera and shares only the
// renderer, so nothing below has to know about it.
//
// It runs ONCE, on the first game you start, and never on a death
// restart: a cutscene you have to sit through every time you are killed
// is the fastest way to make a player stop dying gracefully.
let intro = null;
let introSeen = false;

const start = () => {
  if (!game.player.alive) restart();
  bootEl.style.display = 'none';
  deadEl.style.display = 'none';
  if (!introSeen) {
    introSeen = true;
    game.paused = true;
    intro = new Intro(renderer);
    window.__intro = intro;   // tools/intro.mjs scrubs it
    intro.onDone = () => {
      intro = null;
      game.paused = false;
      // ---- YOU CANNOT TAKE THE POINTER WITHOUT A GESTURE ------------
      //
      // Liam: *"if the person plays the whole cut scene through they end
      // up not being able to move the character but only shoot"*.
      //
      // Exactly that, and the browser says so: "A user gesture is
      // required to request Pointer Lock." SKIPPING the cutscene is a
      // gesture, so the lock is granted and everything works; WATCHING
      // it means the last click was twenty-eight seconds ago and the
      // request is refused. And the refusal is silent in gameplay terms,
      // because `mousedown` is not gated on the lock and `mousemove` is
      // - so the gun still fires and the camera will not turn, which is
      // what "can't move, only shoot" feels like from the inside.
      //
      // So: ask, and if the answer is no, put the title card up. Its
      // click is a gesture, it already calls start(), and start() now
      // knows the cutscene has been seen.
      const offer = () => {
        if (document.pointerLockElement) return;
        game.paused = true;
        bootEl.style.display = 'grid';
      };
      try {
        const pr = canvas.requestPointerLock && canvas.requestPointerLock();
        if (pr && pr.catch) pr.catch(offer);
      } catch (e) { offer(); }
      // and a check a moment later, because the older API returns
      // nothing at all and fails by simply not happening
      setTimeout(offer, 150);
    };
    return;
  }
  canvas.requestPointerLock();
  game.paused = false;
};

// ANY KEY OR CLICK SKIPS IT. Attached to the window rather than to the
// overlay because the overlay is `pointer-events: none` - it has to not
// swallow the click that grabs the mouse when the scene ends.
const skipIntro = () => { if (intro) intro.finish(); };
addEventListener('keydown', skipIntro, true);
addEventListener('mousedown', skipIntro, true);
bootEl.addEventListener('click', start);
deadEl.addEventListener('click', start);
document.addEventListener('pointerlockchange', () => {
  if (window.__editor && window.__editor.on) return;
  if (!document.pointerLockElement && game.player && game.player.alive) {
    game.paused = true;
    bootEl.style.display = 'grid';
    return;
  }
  // And the other way round. The offer above gives up after 150 ms, but
  // a slow grant can land after that - which would leave the title card
  // sitting over a game that is already running. If the lock turns up
  // late, take the card away.
  if (document.pointerLockElement && bootEl.style.display === 'grid') {
    bootEl.style.display = 'none';
    game.paused = false;
  }
});

function restart() {
  game.kills = 0;
  game.player = new Player(world);
  if (game.combat) game.combat.reset();
  loadFloor(1);
}

// ---------------------------------------------------------------------
await preloadRef();
// THE SAVED CORRECTIONS, before any storey is generated. building.js
// applies them as each floor is built, so this has to be in memory first.
await loadEdits();
// THE SKYLINE, once. It belongs to the scene rather than to a floor -
// going up a storey does not rebuild Manhattan.
scene.add(cityscape(7));
game.player = new Player(null);
// THE MERCENARY HIMSELF - the same base mesh as everyone he is shooting,
// which is the point of having one base: he belongs to the same game.
{
  const a = makeActor('runner', 999331);
  scene.add(a.mesh);
  game.player.mesh = a.mesh;
  game.player.anim = a.anim;
  game.player.body = a.body;
  window.__playerMesh = a.mesh;
}
const combat = new Combat(scene, camera, game);
game.combat = combat;
// THE REFERENCE PACK LOADS BEFORE THE FIRST FLOOR EXISTS.
//
// level.js builds a floor synchronously, so anything it wants to place
// has to be in memory already. Top-level await in a module is exactly
// what this is for, and it costs one pause at boot instead of a floor
// that populates itself a second after you are standing in it.
loadFloor(1);
game.player.pos.y = 0;

// ---------------------------------------------------------------------
// THE EDITOR (F6)
// ---------------------------------------------------------------------
//
// Liam asked for this on "six". Six is the AK-47 and digits 1-9 are the
// whole weapon wheel, so it is on F6 instead - same finger, nothing
// broken. See editor.js for why it exists at all: positioning and scaling
// are the one class of mistake the screenshot tools cannot catch.
const editor = new Editor(scene, game, loadFloor);
window.__editor = editor;

// ---------------------------------------------------------------------
// THE WAY UP
// ---------------------------------------------------------------------
//
// Four routes, and none of them is a door you press a key at: standing on
// one for a moment is enough. Stopping the player to read a prompt is the
// same momentum tax as a loot bar, and this game is one long forward move.
//
// The floor does NOT have to be cleared. Liam asked for a tower you climb
// killing hundreds, not a tower that locks until you have swept it - the
// choice between fighting through and running for the stairs with four
// men behind you is the most interesting one on any floor.
// THE WAY UP IS THE STAIRS, AND THAT IS ALL IT IS.
//
// There used to be a trigger here: stand near the top of a flight (or a
// lift shaft, or a hole, or a window ledge) for a third of a second and
// the floor was torn down and rebuilt around you behind a wipe. Liam:
// *"I meant ... each level is physical not the transport to the next
// level is physical"*. So it is deleted. You climb, and at the top of the
// climb your feet are three metres higher than they were, which is what
// being on the next floor means. You can also walk back DOWN, which the
// trigger never allowed and a building always has.

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // THE CUTSCENE OWNS THE FRAME WHILE IT RUNS, like the editor below.
  // Nothing else steps, so the floor behind it is exactly as it was when
  // the scene ends and the first thing the player does is his own.
  if (intro) {
    const iw = innerWidth, ih = innerHeight;
    if (canvas.width !== iw * renderer.getPixelRatio()) renderer.setSize(iw, ih, false);
    intro.update(dt, iw / ih);
    return;
  }

  // THE EDITOR OWNS THE FRAME WHEN IT IS OPEN. Nothing steps - no AI, no
  // physics, no timers - so you can leave it open, go and make a cup of
  // tea, and come back to the same fight you paused.
  if (editor && editor.on) {
    const ew = innerWidth, eh = innerHeight;
    if (canvas.width !== ew * renderer.getPixelRatio()) renderer.setSize(ew, eh, false);
    editor.cam.aspect = ew / eh; editor.cam.updateProjectionMatrix();
    editor.update(dt, ew, eh);

    // ---- AND THE MEN STAND UP ----------------------------------------
    //
    // Nothing steps while the editor is open, which is the right rule and
    // had one bad consequence: an actor that has never been through
    // anim.update() is still in its BIND pose, arms straight out. So
    // every man Liam places came out T-posing at him while he was
    // building - measurably, shoulderR.rotation.z of 0 where a standing
    // man is 1.61 - and a floor full of mannequins is hard to judge.
    //
    // One tick each, at zero speed, is a man standing still. It is not
    // "the AI running": nothing decides anything, nobody moves, and the
    // fight you paused is still exactly paused.
    if (combat && combat.actors) {
      for (const a of combat.actors) {
        if (!a.anim || !a.alive) continue;
        a.anim.update(dt, { speed: 0, maxSpeed: 4, t: game.t, weapon: a.gun });
        if (a.mesh) a.mesh.rotation.y = a.yaw;
      }
    }

    // AND THE MAN STAYS VISIBLE, which is the point: a 1.78 m human next
    // to the prop is the only scale reference that means anything.
    if (game.player.mesh) {
      game.player.mesh.visible = true;
      game.player.mesh.position.set(game.player.pos.x, game.player.pos.y, game.player.pos.z);
      game.player.mesh.rotation.y = game.player.yaw;
    }
    renderer.render(scene, editor.cam);
    return;
  }

  if (!game.paused) {
    game.t += dt; game.dt = dt;
    // BEFORE the player moves, not after. A door reads the velocity he
    // had when he walked into it, and the collision he is about to be
    // resolved against has to be where the leaf is NOW - resolve first
    // and he spends every frame being stopped by a door that has already
    // swung out of his way.
    Doors.step(world, game.player, dt,
      combat.actors && combat.actors.filter((a) => (a.floor || 1) === game.floor));
    game.player.step(dt, keys, building.solids);
    syncFloor();
    combat.step(dt, game.player, world.plan, keys);
  }
  // the body stands where the player is and faces where he is aiming
  const p0 = game.player, pm = p0.mesh;
  if (pm) {
    pm.visible = p0.third;
    pm.position.set(p0.pos.x, p0.pos.y, p0.pos.z);
    // NO CORRECTION ANGLE, ANYWHERE, EVER AGAIN.
    //
    // The mesh is baked facing -Z (tools/bake_actor.mjs), and player.yaw
    // is already in that convention - look at the movement basis in
    // player.js: W moves along (-sin yaw, -cos yaw). So this line is the
    // whole of it. The old static mesh needed `yaw + PI` here and
    // `yaw - PI/2` in combat.js, two different fudges for one un-normalised
    // model, and one of them was always wrong. That is exactly what Liam
    // saw as everyone being turned ninety degrees left.
    pm.rotation.y = p0.yaw;
    if (p0.anim) p0.anim.update(dt, {
      speed: p0.speed || 0, t: game.t, crouch: p0.crouch,
      weapon: combat.held === 'fists' ? null : combat.held,
      unarmed: combat.held === 'fists',
      aimYaw: 0, aimPitch: p0.pitch,
    });
  }
  game.player.applyTo(camera, building.solids);

  const w = innerWidth, h = innerHeight;
  if (canvas.width !== w * renderer.getPixelRatio()) renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  // AND THEN THE ARMS, over the top, at their own field of view. See the
  // long note in hands.js: a 78-degree lens is right for a corridor and
  // ruinous for anything thirty centimetres in front of it.
  if (!game.player.third) combat.hands.render(renderer, camera.aspect);

  // HUD
  const p = game.player;
  document.getElementById('hpfill').style.width = (100 * p.hp / p.maxHp) + '%';
  // stamina - see the note in player.js on why the slide needed a cost
  const sf = document.getElementById('stamfill');
  if (sf) {
    const k = Math.max(0, Math.min(1, (p.stam || 0) / (p.stamMax || 1)));
    sf.style.width = (k * 100) + '%';
    const sb = sf.parentNode;
    sb.classList.toggle('spent', k < 0.34);
    // the refusal flash is driven by a class the animation restarts on,
    // so it has to come OFF before it can go back on
    if (p.stamFlash > 0.001) sb.classList.add('no');
    else sb.classList.remove('no');
  }
  document.getElementById('knum').textContent = game.kills + '  ·  ' + combat.remaining + ' UP';
  // the dodge window, and what is left in the medical kit
  const ifEl = document.getElementById('iframe'), ifT = document.getElementById('iftext');
  if (ifEl) { const on = p.iframe > 0 ? '1' : '0'; ifEl.style.opacity = on; ifT.style.opacity = on; }
  const bn = document.getElementById('bnum');
  if (bn && bn.textContent !== String(p.bandages)) {
    bn.textContent = p.bandages;
    document.getElementById('meds').classList.toggle('none', p.bandages <= 0);
  }
  const hurtEl = document.getElementById('hurt');
  hurtEl.style.opacity = Math.max(0, 1 - (game.t - p.lastHurt) * 2.2) * 0.85;
  if (!p.alive && deadEl.style.display !== 'grid') {
    deadEl.style.display = 'grid';
    document.exitPointerLock();
    game.paused = true;
  }
}
requestAnimationFrame(frame);

// A HANDLE FOR THE TOOLS.
//
// tools/look.mjs cannot play well enough to prove anything on its own -
// it walks into the first wall. Given the game object it can put the
// player where a fight is, watch the AI decide, and photograph the
// result, which is the only way to check any of this without a person.
window.__game = game;
// the live key state, so a tool can tell "the key never arrived" apart
// from "the key arrived and the code ignored it"
window.__keys = keys;
window.__gfx = { scene, camera, renderer };   // tools: draw-call and mesh census
window.__world = () => world;
window.__building = building;
window.__loadFloor = loadFloor;
window.__combat = combat;
window.__restart = restart;   // tools/restart.mjs drives a real new run
import('./ai.js').then((m) => { window.__seeTest = (ax,az,bx,bz) => m.canSee(world.plan, ax, az, bx, bz); });

export { scene, camera, renderer, keys };
