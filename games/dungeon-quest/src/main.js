// DUNGEON QUEST -- Level 1.
//
// States: title -> play <-> shop, with death and victory as interrupts.
// See GAME_DESIGN.md for the spec and what is still to come.
import * as THREE from 'three';
import { N64Pipeline } from './render/n64.js';
import { LEVELS } from './world/levels.js';
import { PROLOGUE } from './game/story.js';
import { Cutscene } from './ui/cutscene.js';
import { buildCharacter, CLASS_INFO } from './art/characters.js';
import { blob, cone } from './art/shapes.js';
import * as T from './art/textures.js';
import { Input } from './player/input.js';
import { PlayerController } from './player/controller.js';
import { CharacterAnimator } from './player/animator.js';
import { FollowCamera } from './camera/followCamera.js';
import { Progress, ARROW_COST } from './game/progress.js';
import { WARDROBE, SLOTS, SLOT_NAMES, priceOf, isLocked } from './game/wardrobe.js';
import { Briefing } from './ui/briefing.js';
import { Combat } from './game/combat.js';
import { Enemy, Camp, findCluster, setPlayerClass } from './game/enemyAI.js';
import { Loot, ThrownPotion } from './game/loot.js';
import { Inventory, POTIONS, FOOD, ARTIFACTS, DIP_ARROWS, DIP_EFFECT } from './game/items.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { LevelMap } from './ui/map.js';
import { TravelMap } from './ui/travelMap.js';
import { Snowfall } from './world/weather.js';
import { Villager } from './art/folk.js';
import { RideDragon, DRAGON_ATTACKS } from './game/ride.js';
import { PadNav } from './ui/padNav.js';
import { SPELLS, boundSpell } from './game/spells.js';
import { SecondPlayer } from './game/coop.js';
import { buildGoldenKey } from './ui/shotsDark.js';
import { PEACE } from './world/levels.js';
import { CUTSCENE_CLASS } from './ui/cutsceneStage.js';
import * as crazygames from './crazygames.js';

/* ================= boot ================= */

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setClearColor('#5f6f56');

const pipeline = new N64Pipeline(renderer, { internalHeight: 240, maxWidth: 480 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 120);

let levelIdx = 0;
let level = LEVELS[0];
let world = level.build(scene);

const input = new Input(canvas);
const follow = new FollowCamera(camera, { pivotHeight: 1.35, lookHeight: 1.15 });
follow.colliders = world.colliders;

const controller = new PlayerController(world);
const progress = new Progress();
const inventory = new Inventory();
controller.inventory = inventory;

const combat = new Combat(scene, world, document.getElementById('popups'));
const loot = new Loot(scene, world, combat);
const hud = new Hud();
const cutscene = new Cutscene();
const travel = new TravelMap();
const sidebar = document.getElementById('sidebar');

/** Witch bolts home on this, which tracks the player. */
const playerAnchor = new THREE.Object3D();
playerAnchor.userData.lookHeight = 1.0;
scene.add(playerAnchor);

/* ================= state ================= */

let mode = 'title';
let playerRig = null;
let playerAnim = null;
let enemies = [];
let camps = new Map();
let thrown = [];
let activeFlame = null;
let flameTick = 0;
let flameMode = 'cone';
let lockTarget = null;
let lockEnemy = null;
let currentArea = null;
let titleT = 0;
let respawnGrace = 0;
let boss = null;
let bossSpawned = false;
let nearCorpse = null;
let lockSuppress = 0;          // seconds of free look after a double-tap TAB
let dragonFlame = null;
let roostShot = null;   // the dragon currently holding the wide shot        // the boss's active breath, so it can be steered

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/* ================= day / night ================= */

const DAY = {
  hemi: 1.05, sun: 1.5, bounce: 0.42, ambient: 0.42,
  sky: new THREE.Color('#5f6f56'), fogNear: 20, fogFar: 74,
};
// Night still has to READ at 240p through a dither -- pitch black just looks
// like a bug. This is "lit by one fire", not "lights off".
const NIGHT = {
  hemi: 0.34, sun: 0.16, bounce: 0.12, ambient: 0.24,
  sky: new THREE.Color('#131a2c'), fogNear: 10, fogFar: 48,
};

function setNight(on) {
  const L = world.lights;
  // "Day" is whatever the level authored -- a mine's daylight is torchlight.
  const p = on ? NIGHT : (L.base || DAY);
  L.hemi.intensity = p.hemi;
  L.sun.intensity = p.sun;
  L.bounce.intensity = p.bounce;
  L.ambient.intensity = p.ambient;
  L.sun.color.set(on ? '#6a7fc0' : (p.sunColor || '#fff2d0'));
  scene.background = p.sky;
  scene.fog.color.copy(p.sky);
  scene.fog.near = p.fogNear;
  scene.fog.far = p.fogFar;
  renderer.setClearColor(p.sky);
  // the campfire carries the scene at night
  for (const f of world.campfires || []) {
    f.userData.light.distance = on ? 30 : 14;
  }
}

/* ================= player ================= */

function buildPlayer(classId, look) {
  if (playerRig) {
    scene.remove(playerRig.root);
    playerRig.dispose();
  }
  // The wardrobe is layered on top of whatever colours came in, so every
  // caller -- title screen, respawn, level change -- gets the worn outfit
  // without any of them having to know the mirror exists.
  playerRig = buildCharacter(classId, progress.lookFor(classId, look));
  playerAnim = new CharacterAnimator(playerRig);
  scene.add(playerRig.root);
  hud.setClass(CLASS_INFO[classId].name);
  document.getElementById('dash-row').style.display =
    classId === 'knight' ? '' : 'none';
  return playerRig;
}

function applyStats(classId) {
  setPlayerClass(classId);   // knights get a longer read on physical wind-ups
  const s = progress.stats(classId);
  const hpFrac = controller.maxHp > 0 ? controller.hp / controller.maxHp : 1;
  const manaFrac = controller.maxMana > 0 ? controller.mana / controller.maxMana : 1;
  controller.configure(classId, s);
  controller.hp = Math.max(1, Math.round(s.maxHp * hpFrac));
  controller.mana = s.maxMana * manaFrac;
  inventory.maxArrows = s.maxArrows;
  loot.maxArrows = s.maxArrows;
  inventory.arrows = Math.min(inventory.arrows, s.maxArrows);
  return s;
}

/* ================= combat wiring ================= */

combat.onEnemyHit = (enemy, damage, source, projectile) => {
  let dmg = damage;
  // a dipped arrow carries its potion's bite
  if (source === 'arrow' && projectile?.dipBonus) dmg += projectile.dipBonus;
  hitEnemy(enemy, dmg, source);
};
// a thrown chunk of ice freezes exactly like a swung one
combat.onPlayerHit = (damage, kind, p) =>
  damagePlayer(damage, p?.src || null, p?.dtype || null);
combat.onArrowLost = (pos) => {
  // spent arrows can be picked back up -- ammo is the archer's whole economy
  // Spent arrows used to drop where they landed, which meant a cloud of them
  // bobbing around the archer's feet during any fight at close range. They go
  // back into the quiver through the HOLD gesture now, not off the floor.
};

function hitEnemy(enemy, damage, source = 'melee') {
  if (enemy.dead) return;
  const dealt = enemy.takeDamage(damage, controller.position, source);
  // No colour tint on hit: the health bar, the damage number and the spark
  // carry the feedback, and repainting a model orange looked terrible.
  combat.hitSpark(enemy.position, '#ffd98a', 3);
  _v.copy(enemy.position);
  _v.y += (enemy.stats.lookHeight || 1) * 0.9;
  combat.popup(_v, String(dealt), source === 'special' ? 'crit' : 'dmg');
  if (enemy.dead) onEnemyDeath(enemy);
}

function onEnemyDeath(enemy) {
  combat.deathPuff(enemy.position, enemy.kind === 'slime' ? '#3d7fd6' : '#9aa08a');
  loot.dropFor(enemy, progress.stats(controller.classId).coinBonus);
  if (lockEnemy === enemy) clearLock();
  if (enemy.isBoss) {
    if (roostShot === enemy) { roostShot = null; follow.setWideShot(null); }
    follow.shake(0.5, 1.2);
    setTimeout(() => { if (mode === 'play') onVictory(); }, 2200);
  }
}

function damagePlayer(amount, from, type) {
  if (respawnGrace > 0) return;
  const taken = controller.takeDamage(amount, from ? from.position : null, type);
  // Ice does not knock you down, it sets AROUND you. No shield helps.
  if (type === 'ice' && taken && controller.freeze(from?.stats?.freezeTime ?? 3.0)) {
    ctx.hint('FROZEN -- MASH TO BREAK OUT');
    follow.shake(0.2, 0.35);
  }
  if (!taken) return;
  _v.copy(controller.position);
  _v.y += 1.7;
  combat.popup(_v, `-${taken}`, 'hurt');
  follow.shake(controller.blocking ? 0.06 : 0.17, 0.22);
  if (controller.dead) onPlayerDeath();
}

const ctx = {
  combat,
  damagePlayer,
  hint: (text) => {
    _v.copy(controller.position); _v.y += 2.3;
    combat.popup(_v, text, 'warn');
  },
  shake: (a, d) => follow.shake(a, d),
  spawnEnemyProjectile: (enemy, from, dir) => {
    const p = enemy.stats.projectile || {};
    combat.spawn({
      from, dir, speed: p.speed ?? 15, damage: enemy.stats.damage,
      owner: 'enemy', kind: p.kind || 'bolt', color: p.color || '#7fe07a',
      src: enemy, dtype: enemy.stats.damageType || null,
      homing: p.homing ? playerAnchor : null, turnRate: 1.8, life: 3.0,
    });
  },
  onDragonBreath: (dragon) => {
    const st = dragon.stats;
    dragonFlame = combat.spawnFlameCone({
      range: st.breathRange * (dragon.phase2 ? 1.15 : 1),
      // it opens up as it comes -- the cone you dodge is wider than the mouth
      halfAngle: st.breathAngle,
      duration: dragon.strikeTime(),
      color: st.breathColor || '#7fc44a',
      hot: st.breathHot || '#e8ffb0',
      coolColor: st.breathCool || '#3f7a2a',
    });
    dragonFlame.owner = dragon;
    follow.shake(0.14, 0.4);
  },
  telegraph: (opts) => combat.telegraph(opts),
  /* ---- the aerial set-piece ---- */
  // The dragon settles at one end of the chamber and charges. The camera pulls
  // right back so the room, the boulders and the dragon are all on screen at
  // once -- you cannot be asked to find cover in four seconds if you cannot
  // see where the cover is.
  onDragonRoost: (dragon, seconds) => {
    roostShot = dragon;
    // Steep and high: the fire rakes the whole floor, so the only place to
    // put a camera that is not inside the fire is ABOVE it looking down.
    // Side-on and high: you see the dragon at one end, yourself at the other,
    // and every boulder in between. This shot exists for the FOUR SECONDS of
    // charging -- it is handed back the moment the fire actually starts, so
    // you run for cover on your own camera rather than a cinematic one.
    follow.setWideShot(dragon.position, { dist: 33, pitch: 0.44, height: 5.0 });
    hud.announce('TAKE COVER');
    combat.telegraph({
      follow: dragon,
      range: (world.mapData?.arena?.r ?? 26) * 1.5,
      halfAngle: (dragon.stats.breathAngle ?? 0.3) * 1.9,
      duration: seconds,
      color: dragon.stats.breathColor || '#ff5a1e',
    });
  },
  onDragonRoostFire: (dragon) => {
    // camera back to the player: they need to see their own cover now
    roostShot = null;
    follow.setWideShot(null);
    const st = dragon.stats;
    // Long enough to cross the chamber, not so long it swallows the camera.
    const reach = (world.mapData?.arena?.r ?? 26) * 1.5;
    dragonFlame = combat.spawnFlameCone({
      range: reach,
      // a JET that rakes, not a dome -- a 30 degree cone 45 metres long simply
      // filled the screen with orange and showed nothing
      halfAngle: (st.breathAngle ?? 0.3) * 1.05,
      duration: st.roostBreath ?? 2.1,
      color: st.breathColor || '#ff5a1e',
      hot: st.breathHot || '#ffe8a0',
      coolColor: st.breathCool || '#8c1d0c',
    });
    dragonFlame.owner = dragon;
    dragonFlame.roost = true;
    follow.shake(0.26, st.roostBreath ?? 2.1);
  },
  /** The other aerial pass: blocks of ice hurled down one at a time. */
  onDragonHurlStart: (dragon) => {
    hud.announce('DODGE');
    ctx.hint('IT IS THROWING -- MOVE');
  },
  onDragonHurl: (dragon, player) => {
    const st = dragon.stats;
    const from = dragon.position.clone();
    from.y += st.lookHeight * 0.8;
    // aimed where you ARE, so walking out of it works and standing does not
    _dir.set(player.position.x - from.x,
      (player.position.y + 0.9) - from.y,
      player.position.z - from.z).normalize();
    combat.telegraph({
      position: { x: player.position.x, z: player.position.z },
      shape: 'circle', range: 2.6, duration: 0.5, color: '#9fe4ff',
    });
    combat.spawn({
      from, dir: _dir, speed: st.projectile?.speed ?? 18,
      damage: st.hurlDamage ?? 20, owner: 'enemy',
      kind: 'ice', color: st.projectile?.color || '#bfe8ff',
      src: dragon, dtype: 'ice', life: 3.0,
    });
    follow.shake(0.08, 0.16);
  },
  /* ---- the summoning ---- */
  // It leaves the fight and goes and sits on a rock. What it CALLS is the
  // fight now; the dragon itself is untouchable and untargetable until it
  // comes back down, so the answer is to clear the floor before it does.
  onDragonSummonStart: (dragon) => {
    if (lockEnemy === dragon) setLock(null);
    hud.announce('IT IS RAISING THEM');
    ctx.hint('KILL WHAT IT CALLS');
    follow.shake(0.3, 0.8);
  },
  onDragonSummon: (dragon, S) => {
    for (let i = 0; i < S.each; i++) {
      const a2 = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 12;
      const x = controller.position.x + Math.cos(a2) * r;
      const z = controller.position.z + Math.sin(a2) * r;
      const kind = S.kinds[(Math.random() * S.kinds.length) | 0];
      const e = new Enemy(kind, scene, world, x, z);
      e.spawnedByBoss = true;   // summoned: it does not come back on a respawn
      e.alertMeter = 1;
      e.setState('chase');
      enemies.push(e);
      // they come UP out of the ground
      _v2.set(x, world.groundHeight(x, z) + 0.3, z);
      combat.hitSpark(_v2, '#b070ff', 12);
      combat.telegraph({
        position: { x, z }, shape: 'circle', range: 1.8,
        duration: 0.45, color: '#8a3fd0',
      });
    }
    follow.shake(0.14, 0.3);
  },
  onDragonSummonEnd: () => {
    hud.announce('IT IS COMING DOWN');
  },
  onDragonRoostEnd: (dragon) => {
    roostShot = null;
    follow.setWideShot(null);
  },
  onCommand: (leader, n) => {
    _v.copy(leader.position);
    _v.y += leader.stats.lookHeight + 0.6;
    combat.popup(_v, n > 1 ? 'TO ARMS!' : 'THERE!', 'warn');
  },
};

/* ================= aiming ================= */

/**
 * What a shot should tilt toward. The lock target if there is one, otherwise
 * the nearest enemy roughly in front -- a flat bolt sails clean over a slime,
 * so shots need to aim DOWN at short things whether or not you locked on.
 */
function autoAimTarget() {
  if (lockTarget) return lockTarget;
  const fx = Math.sin(controller.yaw), fz = Math.cos(controller.yaw);
  let best = null, bestScore = -Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.position.x - controller.position.x;
    const dz = e.position.z - controller.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 22) continue;
    const facing = d < 0.01 ? 1 : (dx / d) * fx + (dz / d) * fz;
    if (facing < 0.55) continue;                 // must be broadly ahead
    const score = facing * 4 - d * 0.15;
    if (score > bestScore) { bestScore = score; best = e.root; }
  }
  return best;
}

function aimDir(out) {
  const t = autoAimTarget();
  if (t) {
    out.set(
      t.position.x - controller.position.x,
      (t.position.y + (t.userData.lookHeight ?? 1) * 0.55)
        - (controller.position.y + 1.15),
      t.position.z - controller.position.z
    ).normalize();
  } else {
    out.set(Math.sin(controller.yaw), 0, Math.cos(controller.yaw));
  }
  return out;
}

function handPos(side, out) {
  const hand = playerRig.arms[side].hand;
  hand.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(hand.matrixWorld);
}

/**
 * Where a shot leaves the body. Deliberately the chest and only slightly
 * forward, NOT the outstretched hand: at point-blank the hand is already past
 * the target, and the projectile spawns behind it and flies away.
 */
function muzzlePos(out) {
  return out.set(
    controller.position.x + Math.sin(controller.yaw) * 0.42,
    controller.position.y + 1.15,
    controller.position.z + Math.cos(controller.yaw) * 0.42
  );
}

/** Fire one arrow, spending a dipped one first if any are prepared. */
function fireArrow(from, dir, damage, opts = {}) {
  let dmg = damage;
  let tint = null;
  let dipBonus = 0;
  if (inventory.dipped > 0 && inventory.dipEffect) {
    dipBonus = inventory.dipEffect.bonus;
    tint = inventory.dipEffect.color;
    inventory.dipped--;
    if (inventory.dipped <= 0) inventory.dipEffect = null;
  }
  const p = combat.spawn({
    from, dir, damage: dmg, owner: 'player', kind: 'arrow',
    speed: opts.speed ?? 30, tint,
    homing: opts.homing || null, turnRate: opts.turnRate ?? 4.2,
    pierce: opts.pierce || 0,
  });
  const rec = combat.projectiles[combat.projectiles.length - 1];
  if (rec) rec.dipBonus = dipBonus;
  return p;
}

function onStrike(kind, def) {
  const s = controller.stats;
  const classId = controller.classId;
  aimDir(_dir);

  // Out of mana or out of arrows: the staff and the bow are both just wood.
  // Flat 1 damage -- MIGHT does not touch it, because it is not your weapon,
  // it is the thing you had left.
  if (def.desperate) {
    const targets = combat.meleeTargets(controller.position, controller.yaw,
      def.range, def.arc, enemies);
    for (const e of targets) hitEnemy(e, def.damage, 'melee');
    combat.slashArc(controller.position, controller.yaw, def.range);
    follow.shake(0.03, 0.10);
    return;
  }

  /* ---------------- knight ---------------- */
  if (classId === 'knight') {
    if (kind === 'attack') {
      const targets = combat.meleeTargets(controller.position, controller.yaw,
        def.range, def.arc, enemies);
      for (const e of targets) hitEnemy(e, s.damage, 'melee');
      combat.slashArc(controller.position, controller.yaw, def.range);
      follow.shake(0.05, 0.14);
      return;
    }
    // special
    if (s.specialMode === 'execute' && lockEnemy && !lockEnemy.dead) {
      // EXECUTION: close the gap, then finish a tier-1 foe outright.
      const target = lockEnemy;
      _v.set(target.position.x - controller.position.x, 0,
        target.position.z - controller.position.z);
      const d = _v.length();
      if (d > 1.4) {
        _v.normalize();
        const stop = Math.max(0, d - 1.3);
        const nx = controller.position.x + _v.x * stop;
        const nz = controller.position.z + _v.z * stop;
        if (!world.blocked(nx, nz, controller.position.y)) {
          controller.position.x = nx;
          controller.position.z = nz;
        }
      }
      combat.thrustFx(controller.position, controller.yaw, 3.4, '#fff0c0');
      combat.hitSpark(target.position, '#ffe9a8', 12);
      follow.shake(0.28, 0.35);
      if (target.tier === 1) {
        target.execute();
        _v.copy(target.position); _v.y += target.stats.lookHeight;
        combat.popup(_v, 'EXECUTED', 'crit');
        onEnemyDeath(target);
      } else {
        hitEnemy(target, Math.round(s.special * 2.4), 'special');
      }
      return;
    }
    const range = def.range * (s.specialReach || 1);
    const targets = combat.meleeTargets(controller.position, controller.yaw,
      range, def.arc, enemies);
    for (const e of targets) hitEnemy(e, s.special, 'special');
    combat.thrustFx(controller.position, controller.yaw, range);
    follow.shake(0.09, 0.14);
    return;
  }

  /* ---------------- wizard ---------------- */
  if (classId === 'wizard') {
    if (kind === 'attack') {
      const from = muzzlePos(_v).clone();
      // Bolts HOME when locked on -- otherwise they sail over a slime's head.
      combat.spawn({
        from, dir: _dir, speed: 20, damage: s.damage, owner: 'player',
        kind: 'bolt', color: '#8a7fd0',
        homing: autoAimTarget(), turnRate: 3.6 * (s.homing || 1), life: 2.6,
      });
      return;
    }
    if (s.specialMode === 'firestorm') {
      // FIRESTORM: both hands, spinning, everything nearby burns.
      flameMode = 'ring';
      activeFlame = combat.spawnFlameRing({
        radius: 4.4 * (s.specialReach || 1),
        duration: def.strike + 0.15,
        damage: s.special, color: '#ff7a2c',
      });
      follow.shake(0.16, 0.5);
    } else {
      // close-range cone from the open hand
      flameMode = 'cone';
      activeFlame = combat.spawnFlameCone({
        range: def.range * (s.specialReach || 1),
        halfAngle: 0.42, duration: def.strike + 0.1,
        damage: s.special, color: '#ff7a2c',
      });
      follow.shake(0.06, 0.3);
    }
    flameTick = 0;
    return;
  }

  /* ---------------- archer ---------------- */
  const from = muzzlePos(_v).clone();
  const speed = 30 * (s.arrowSpeed || 1);
  if (kind === 'attack') {
    fireArrow(from, _dir, s.damage, {
      speed, homing: autoAimTarget(), turnRate: 4.5,
    });
    return;
  }
  // TWIN / VOLLEY -- these home so they actually reach the locked target
  const count = s.specialMode === 'volley' ? 3 : 2;
  const spread = 0.07 / (s.spreadTighten || 1);
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * spread;
    const d = _dir.clone();
    const c = Math.cos(off), sn = Math.sin(off);
    d.set(d.x * c - d.z * sn, d.y, d.x * sn + d.z * c).normalize();
    fireArrow(from.clone(), d, s.special, {
      speed, homing: autoAimTarget(), turnRate: 6.0, pierce: 1,
    });
  }
  follow.shake(0.05, 0.12);
}

function onNoResource(kind) {
  _v.copy(controller.position);
  _v.y += 1.9;
  if (controller.usesMana) combat.popup(_v, 'NO MANA', 'warn');
  else if (controller.usesArrows) combat.popup(_v, 'NO ARROWS', 'warn');
}

/* ================= lock-on ================= */

/** Can this thing be targeted at all right now? */
function lockable(e) {
  return !e.dead && e.state !== 'summon';
}

function autoLock() {
  // Free look: a double tap of TAB drops the lock and holds it off, so the
  // camera does not instantly re-acquire the thing you just let go of.
  if (lockSuppress > 0) { if (lockEnemy) setLock(null); return; }
  const f = follow.forward;
  let best = null, bestScore = -Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    // A dragon up on its summoning rock is out of the fight and OUT OF REACH:
    // locking on to it would point the camera away from the thing it called.
    if (!lockable(e)) continue;
    const dx = e.position.x - controller.position.x;
    const dz = e.position.z - controller.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 19) continue;
    const facing = d < 0.01 ? 1 : (dx / d) * f.x + (dz / d) * f.z;
    if (facing < -0.35) continue;
    const score = -d + facing * 3.5 + (e === lockEnemy ? 2.5 : 0)
      + (e.isBoss ? 6 : 0) + (e.tier === 2 ? 2 : 0);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  setLock(best);
}

function setLock(enemy) {
  lockEnemy = enemy || null;
  lockTarget = enemy ? enemy.root : null;
  follow.setLockTarget(lockTarget);
}
function clearLock() { setLock(null); }

function cycleTarget() {
  const live = enemies
    .filter(e => lockable(e) && e.distTo(controller.position) < 22)
    .sort((a, b) => a.distTo(controller.position) - b.distTo(controller.position));
  if (!live.length) return;
  const i = live.indexOf(lockEnemy);
  setLock(live[(i + 1) % live.length]);
}

/* ================= enemies ================= */

function campFor(id) {
  if (!id) return null;
  if (!camps.has(id)) {
    const def = world.campDefs.find(c => c.id === id);
    camps.set(id, new Camp(def?.x ?? 0, def?.z ?? 0, def?.radius ?? 9));
  }
  return camps.get(id);
}

function spawnNearbyEnemies() {
  // At peace, nothing spawns -- unless you have come back through it mounted,
  // which is a fresh run of the campaign and has to have a campaign in it.
  if (progress.finished && !progress.dragonRun) return;
  for (const s of world.enemySpawns) {
    if (s.spawned) continue;
    const d = Math.hypot(s.x - controller.position.x, s.z - controller.position.z);
    if (d > 75) continue;
    s.spawned = true;
    const e = new Enemy(s.kind, scene, world, s.x, s.z);
    const camp = campFor(s.camp);
    if (camp) camp.add(e);
    enemies.push(e);
  }

  // the dragon wakes when you enter the hollow
  if (!bossSpawned && gateOpen && controller.position.z > world.arenaTrigger) {
    bossSpawned = true;
    mode = 'cutscene';
    input.enabled = false;
    hud.show(false);
    sidebar.hidden = true;
    cutscene.play(level.bossIntro, () => {
      boss = new Enemy(level.boss, scene, world,
        world.dragonSpawn.x, world.dragonSpawn.z, { yaw: Math.PI });
      boss.alertMeter = 1;
      boss.setState('chase');
      enemies.push(boss);
      bossWave = 0;
      mode = 'play';
      input.enabled = true;
      hud.show(true);
      sidebar.hidden = false;
      follow.shake(0.3, 1.0);
    });
  }
}

/* ================= boss waves ================= */

let bossWave = 0;
const WAVE_KINDS = ['skeleton', 'zombie', 'crossbowSkeleton', 'slime'];

/**
 * Classic wave boss: at each quarter of its health the dragon calls up the
 * dead, so the fight is never just you and one big target.
 */
function updateBossWaves() {
  if (!boss || boss.dead) return;
  const frac = boss.hp / boss.maxHp;
  const wanted = frac < 0.25 ? 3 : frac < 0.5 ? 2 : frac < 0.75 ? 1 : 0;
  if (wanted <= bossWave) return;
  bossWave = wanted;

  const count = 2 + wanted;
  const arena = world.arena;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random();
    const r = 17 + Math.random() * 6;
    const x = arena.x + Math.cos(a) * r;
    const z = arena.z + Math.sin(a) * r;
    const kind = WAVE_KINDS[(Math.random() * WAVE_KINDS.length) | 0];
    const e = new Enemy(kind, scene, world, x, z);
    e.alertMeter = 1;
    e.setState('chase');
    enemies.push(e);
    combat.deathPuff(e.position, '#6a5f80');
  }
  hud.announce('IT CALLS THE DEAD');
  follow.shake(0.18, 0.6);
}

function resetEnemies() {
  for (const e of enemies) e.dispose();
  enemies = [];
  camps = new Map();
  boss = null;
  bossSpawned = false;
  for (const s of world.enemySpawns) s.spawned = false;
}

/* ================= interaction ================= */

let nearChest = null;
let nearShop = false;
let nearTavern = null;
let nearMirror = null;
let nearArtifact = null;

function updateInteractions() {
  nearChest = null;
  nearShop = false;
  nearCorpse = null;

  nearTavern = null;
  nearMirror = null;

  // any of the roadside merchants, not just the one at the mouth
  for (const s of (world.shops || [world.shopPosition])) {
    if (Math.hypot(controller.position.x - s.x, controller.position.z - s.z) < 4.0) {
      nearShop = true;
      break;
    }
  }
  for (const t of (world.taverns || [])) {
    if (Math.hypot(controller.position.x - t.x, controller.position.z - t.z) < 4.2) {
      nearTavern = t;
      break;
    }
  }

  for (const c of world.chests) {
    if (c.opened) continue;
    if (Math.hypot(controller.position.x - c.position.x,
      controller.position.z - c.position.z) < 2.4) { nearChest = c; break; }
  }

  // pulling arrows out of bodies -- the archer's main resupply
  if (inventory.maxArrows > 0 && !inventory.full) {
    for (const e of enemies) {
      if (!e.dead || e.looted || e.lootable <= 0) continue;
      if (e.distTo(controller.position) < 2.4) { nearCorpse = e; break; }
    }
  }

  for (const m of world.mirrors || []) {
    if (Math.hypot(controller.position.x - m.x, controller.position.z - m.z) < 2.6) {
      nearMirror = m; break;
    }
  }

  if (nearMirror) hud.setPrompt('<kbd>SPACE</kbd> LOOK IN THE MIRROR');
  else if (nearTavern) hud.setPrompt('<kbd>SPACE</kbd> ENTER ' + nearTavern.name);
  else if (nearShop) hud.setPrompt('<kbd>SPACE</kbd> TRADE WITH THE MERCHANT');
  else if (nearChest) hud.setPrompt('<kbd>SPACE</kbd> OPEN CHEST');
  else if (nearCorpse) {
    // arrows are HELD for now, not tapped -- the prompt has to say so
    hud.setPrompt(`HOLD <kbd>&#8592;</kbd>+<kbd>&#8594;</kbd> TO PULL ARROWS (${nearCorpse.lootable})`);
  }
  else hud.setPrompt(null);
}

function doInteract() {
  if (riding) { dismount(); return; }
  if (atCageDoor()) { unlockCage(); return; }
  if (canMount()) { mount(); return; }
  if (nearMirror) { openMirror(); return; }
  if (nearTavern) { openTavern(nearTavern); return; }
  if (nearShop) { openShop(); return; }
  if (nearChest) {
    loot.openChest(nearChest, progress.stats(controller.classId).coinBonus);
    combat.hitSpark(nearChest.position, '#f2c14e', 8);
    nearChest = null;
    return;
  }
  // Arrows are no longer a tap: hold ATTACK and SPECIAL together for three
  // seconds and every body in reach gives its arrows up at once. See
  // onChannel() -- SPACE is for chests, merchants and doors now.
}

/* ================= consumables ================= */

function drinkPotion() {
  const wantMana = controller.maxMana > 0 && controller.mana < controller.maxMana * 0.5;
  const kind = inventory.bestGood(wantMana);
  if (!kind) return;
  const def = POTIONS[kind];
  if (def.heal && controller.hp >= controller.maxHp && !def.mana) return;
  if (def.mana && !def.heal && controller.mana >= controller.maxMana) return;
  inventory.takePotion(kind);
  _v.copy(controller.position); _v.y += 1.8;
  if (def.heal) { controller.heal(def.heal); combat.popup(_v, `+${def.heal}`, 'heal'); }
  if (def.mana) {
    controller.restoreMana(def.mana);
    _v.y += 0.4;
    combat.popup(_v, `+${def.mana} MANA`, 'mana');
  }
  combat.hitSpark(controller.position, def.color, 6);
}

/** Slot 2: throw for knight/wizard, DIP for the archer. */
function potionSlotTwo() {
  if (controller.classId === 'archer') { dipArrows(); return; }
  throwPotion();
}

function dipArrows() {
  const kind = inventory.anyPotion();
  if (!kind) return;
  if (inventory.arrows <= 0) {
    _v.copy(controller.position); _v.y += 1.9;
    combat.popup(_v, 'NO ARROWS TO DIP', 'warn');
    return;
  }
  inventory.takePotion(kind);
  const fx = DIP_EFFECT[kind] || DIP_EFFECT.poison;
  inventory.dipped = Math.min(inventory.arrows, DIP_ARROWS);
  inventory.dipEffect = fx;
  _v.copy(controller.position); _v.y += 1.8;
  combat.popup(_v, `${fx.name} ARROWS x${inventory.dipped}`, 'heal');
  combat.hitSpark(controller.position, fx.color, 8);
}

function throwPotion() {
  const kind = inventory.bestBad();
  if (!kind) return;
  const def = POTIONS[kind];

  let target;
  const cluster = groupCluster();
  if (cluster && cluster.length > 1) {
    target = new THREE.Vector3();
    for (const e of cluster) target.add(e.position);
    target.divideScalar(cluster.length);
  } else if (lockTarget) {
    target = lockTarget.position.clone();
  } else {
    target = controller.position.clone().add(
      _v.set(Math.sin(controller.yaw), 0, Math.cos(controller.yaw)).multiplyScalar(8));
    target.y = world.groundHeight(target.x, target.z);
  }

  inventory.takePotion(kind);
  const p = new ThrownPotion(scene, world, combat, controller.position, target, kind);
  p.onBurst = () => {
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.position.x - p.blastAt.x, e.position.z - p.blastAt.z);
      if (d <= def.radius) {
        hitEnemy(e, Math.round(def.damage * (1 - (d / def.radius) * 0.45)), 'special');
      }
    }
    follow.shake(0.12, 0.25);
  };
  thrown.push(p);
}

function eatFood() {
  const kind = inventory.firstFood();
  if (!kind) return;
  const def = FOOD[kind];
  inventory.takeFood(kind);
  controller.eat(def.heal, def.over, def.mana || 0);
  _v.copy(controller.position); _v.y += 1.8;
  combat.popup(_v, def.name, 'heal');
}

function groupCluster() {
  const near = enemies.filter(e => !e.dead && !e.isBoss &&
    e.distTo(controller.position) < 16);
  return findCluster(near, 3.6, 2);
}

/* ================= modes ================= */

const screens = new Screens(progress, {
  onClassChange: (classId, look) => { buildPlayer(classId, look); applyStats(classId); },
  onLookChange: (look) => buildPlayer(screens.classId, look),
  onStart: (classId, look) => startRun(classId, look),
  onLeaveShop: () => {
    mode = 'play';
    input.enabled = true;
    hud.show(true);
    sidebar.hidden = false;
  },
  onUpgrade: () => applyStats(controller.classId),
  onRespawn: () => respawn(),
  onRestart: () => restartLevel(),
  onTitle: () => toTitle(),
  currentLevel: () => level,
  inventory: () => inventory,
  onBuyBook: () => hud.announce('THE BOOK IS YOURS'),
  onLearnSpell: (id) => hud.announce(SPELLS[id].name + ' LEARNED'),
  onBindSpell: (id) => hud.announce(SPELLS[id].name + ' ON BLOCK'),
  onBuyArrows: (n) => {
    inventory.addArrows(n);
    hud.announce(`+${n} ARROWS`);
  },
  onBuyMap: () => refreshMapRow(),
});

function toTitle() {
  mode = 'title';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  hud.clearBars();
  hud.setPrompt(null);
  hud.setGroupLock(0);
  sidebar.hidden = true;
  combat.clear();
  loot.clear();
  resetEnemies();
  thrown = [];
  activeFlame = null;
  clearLock();
  setNight(true);
  buildPlayer(screens.classId, screens.look);
  applyStats(screens.classId);
  controller.reset(world.titleCamp.seat.x, world.titleCamp.seat.z);
  titleT = 0;
}

/* ================= levels, checkpoints, gates ================= */

let checkpoint = null;          // the shrine we respawn at
let gateOpen = false;
let midGateOpen = false;

/** Tear the current level down and build another. */
function loadLevel(idx) {
  levelIdx = Math.max(0, Math.min(LEVELS.length - 1, idx));
  level = LEVELS[levelIdx];
  resetEnemies();
  loot.clear();
  combat.clear();
  clearLock();
  world.dispose();
  world = level.build(scene);
  // EVERY system that captured the old world has to be repointed, or the new
  // level runs against the previous one's collision and ground heights.
  follow.colliders = world.colliders;
  controller.world = world;
  combat.world = world;
  loot.world = world;
  setWeather(world.weather);
  player2?.setWorld(world);
  populate();
  setupSecret();
  checkpoint = null;
  gateOpen = false;
  progress.level = level.id;
  progress.save();
}

/** Light the nearest shrine when the player reaches it. */
function updateCheckpoints() {
  if (!world.checkpoints) return;
  for (const c of world.checkpoints) {
    if (c.claimed) continue;
    if (Math.hypot(controller.position.x - c.x, controller.position.z - c.z) > 3.4) continue;
    c.claimed = true;
    c.flame.visible = true;
    c.light.intensity = 2.2;
    checkpoint = c;
    bankKills();
    // Reaching the shrine at the mouth of the hollow with the level already
    // cleared is the one moment worth calling out: from here nothing you
    // killed comes back, however many times the dragon kills you.
    showCheckpoint(c.name, enemiesRemaining() === 0);
    // banking progress also tops you up a little -- the shrine is a mercy
    controller.heal(controller.maxHp * 0.25);
    controller.restoreMana(controller.maxMana * 0.25);
  }
}

const checkpointMsg = document.getElementById('checkpoint-msg');
let checkpointT = 0;
function showCheckpoint(name, cleared = false) {
  checkpointMsg.textContent = cleared
    ? 'CHECKPOINT — ' + name + ' — THE DEAD STAY DOWN'
    : 'CHECKPOINT — ' + name;
  checkpointMsg.classList.add('show');
  checkpointT = 2.6;
}

/**
 * The hollow stays shut until the valley is clear. You cannot skip the level
 * and run straight at the dragon.
 */
const gateMsg = document.getElementById('gate-msg');
/**
 * The MIDPOINT gate. Level four has a mini-boss standing in the road halfway
 * up, and the road past it stays shut until it is dead. Unlike the arena gate
 * this one does not care about the rest of the level -- one thing bars it.
 */
function updateMidGate() {
  const g = world.midGate;
  if (!g || midGateOpen) return;
  const alive = enemies.some(e => e.kind === g.kind && !e.dead)
    || world.enemySpawns.some(sp => sp.kind === g.kind && !sp.spawned);
  if (!alive) {
    midGateOpen = true;
    gateMsg.hidden = true;
    hud.announce('THE ROAD IS OPEN');
    return;
  }
  // Show the message from just SHORT of the line, not only while being
  // clamped on it -- clamping puts you exactly on holdAt, and "z > holdAt" is
  // then false on the very next frame, so the sign flickered off instantly.
  if (controller.position.z >= g.holdAt - 1.5) {
    if (controller.position.z > g.holdAt) {
      controller.position.z = g.holdAt;
      controller.velocity.z = Math.min(0, controller.velocity.z);
    }
    gateMsg.hidden = false;
    gateMsg.innerHTML = g.name;
  } else if (controller.position.z < g.holdAt - 14) {
    gateMsg.hidden = true;
  }
}

function updateGate() {
  updateMidGate();
  if (!world.arenaTrigger) return;
  const remaining = enemiesRemaining();
  if (!gateOpen && remaining === 0) {
    gateOpen = true;
    gateMsg.hidden = true;
    hud.announce('THE WAY IS OPEN');
    return;
  }
  if (gateOpen) return;

  // hold the player at the mouth of the hollow
  const gateZ = world.arenaTrigger - 6;
  if (controller.position.z > gateZ) {
    controller.position.z = gateZ;
    controller.velocity.z = Math.min(0, controller.velocity.z);
    gateMsg.hidden = false;
    gateMsg.innerHTML =
      `THE HOLLOW IS SEALED<br><b>${remaining}</b> STILL DRAW BREATH IN THE VALLEY`;
  } else if (controller.position.z < gateZ - 14) {
    gateMsg.hidden = true;
  }
}

/** Live mobs plus groups that have not spawned yet. */
function enemiesRemaining() {
  const alive = enemies.filter(e => !e.dead && !e.isBoss).length;
  const unspawned = world.enemySpawns.filter(s => !s.spawned).length;
  return alive + unspawned;
}

function startRun(classId, look, showIntro = true) {
  CUTSCENE_CLASS.id = classId;   // the `hero` diorama builds whoever you picked
  CUTSCENE_CLASS.look = progress.lookFor(classId, look);
  setNight(level.night);
  buildPlayer(classId, look);
  const s = applyStats(classId);
  controller.reset(world.spawn.x, world.spawn.z);
  controller.hp = controller.maxHp;
  controller.mana = controller.maxMana;
  inventory.potions = {};
  inventory.food = {};
  inventory.dipped = 0;
  inventory.dipEffect = null;
  inventory.maxArrows = s.maxArrows;
  inventory.arrows = s.maxArrows;              // start with a full quiver
  inventory.artifacts = [...progress.artifacts];
  inventory.addPotion('heal', 2);
  if (classId === 'wizard') inventory.addPotion('mana', 2);
  inventory.addFood('bread', 1);

  resetEnemies();
  loot.clear();
  combat.clear();
  clearLock();
  // artifacts the player has not already claimed
  for (const a of world.artifactSpots) {
    if (progress.hasArtifact(a.id)) continue;
    _v.set(a.x, world.groundHeight(a.x, a.z), a.z);
    loot.spawnArtifact(_v, a.id);
  }
  // Only the archer can do anything with an arrow. Scattering bundles of them
  // around a knight or a wizard is clutter that follows you the whole level.
  if (inventory.maxArrows > 0) {
    for (const a of world.arrowSpots) {
      _v.set(a.x, world.groundHeight(a.x, a.z), a.z);
      loot.spawnArrows(_v, a.n, false);
    }
  }
  for (const f of world.foodSpots) {
    _v.set(f.x, world.groundHeight(f.x, f.z), f.z);
    loot.spawnFood(_v, f.kind, false);
  }
  for (const c of world.chests) { c.opened = false; c.lid.rotation.x = 0; }

  for (const c of world.checkpoints || []) {
    c.claimed = false;
    c.flame.visible = false;
    c.light.intensity = 0;
  }
  checkpoint = null;
  gateOpen = false;
  midGateOpen = false;
  gateMsg.hidden = true;

  // Re-checked on every run start, not only on a level load: picking the key
  // up mid-level has to put something in the cage without a reload, and a
  // death-restart must not leave a freed dragon behind.
  setupSecret();

  currentArea = null;
  respawnGrace = 1.0;
  follow._initialized = false;
  follow.yaw = Math.PI;

  // Restarting after a death is not the start of a chapter -- you have already
  // watched that. Straight back into it.
  if (!showIntro) {
    mode = 'play';
    input.enabled = true;
    hud.show(true);
    sidebar.hidden = false;
    hud.announce(world.areas[0].name);
    refreshMapRow();
    return;
  }

  mode = 'cutscene';
  input.enabled = false;
  hud.show(false);
  sidebar.hidden = true;
  // opening crawl, then the chapter card, then play
  const openers = progress.seenPrologue ? level.intro : [...PROLOGUE, ...level.intro];
  progress.seenPrologue = true;
  progress.save();
  cutscene.play(openers, () => {
    // The controls come AFTER the opening crawl and before the first step,
    // once per class -- the moment the player is about to need them, not
    // buried in a menu they will never open.
    if (briefedFor === classId) { beginPlaying(); return; }
    briefedFor = classId;
    briefing.show(classId, input.pad.connected, beginPlaying);
  });
  refreshMapRow();
}

/** Hand the controls over. Shared by the briefing and the skip-intro path. */
function beginPlaying() {
  mode = 'play';
  input.enabled = true;
  hud.show(true);
  sidebar.hidden = false;
  hud.announce(world.areas[0].name);
}

/* ================= taverns ================= */
// Rest for coin, and buy the relics you did not find in the field.

const REST_COST = 20;
const RELIC_PRICE = { emberShard: 260, mossCharm: 190, thiefsCoin: 210,
  owlFeather: 230, ironBand: 200, hollowIdol: 280 };

const tavernEl = document.getElementById('tavern');

function openTavern(t) {
  mode = 'tavern';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  sidebar.hidden = true;
  document.getElementById('tavern-name').textContent = t.name;
  renderTavern();
  tavernEl.hidden = false;
}

function closeTavern() {
  tavernEl.hidden = true;
  mode = 'play';
  input.enabled = true;
  hud.show(true);
  sidebar.hidden = false;
}

function renderTavern() {
  document.getElementById('tavern-coin').textContent = progress.coin;
  const rest = document.getElementById('btn-rest');
  const rested = controller.hp >= controller.maxHp
    && controller.mana >= controller.maxMana
    && (!inventory.maxArrows || inventory.arrows >= inventory.maxArrows);
  rest.disabled = progress.coin < REST_COST || rested;
  rest.textContent = rested ? 'ALREADY RESTED' : `REST — ${REST_COST} COIN`;

  const list = document.getElementById('relic-list');
  list.innerHTML = '';
  for (const [id, def] of Object.entries(ARTIFACTS)) {
    const owned = progress.hasArtifact(id);
    const price = RELIC_PRICE[id] ?? 250;
    const card = document.createElement('div');
    card.className = 'upg' + (owned ? ' maxed' : '');
    card.innerHTML = `
      <div class="upg-top"><span class="upg-name">${def.name}</span></div>
      <div class="upg-desc">${def.desc}</div>`;
    const btn = document.createElement('button');
    btn.textContent = owned ? 'OWNED' : `BUY — ${price}`;
    btn.disabled = owned || progress.coin < price;
    btn.addEventListener('click', () => {
      if (progress.coin < price || progress.hasArtifact(id)) return;
      progress.coin -= price;
      progress.addArtifact(id);
      inventory.addArtifact(id);
      applyStats(controller.classId);
      renderTavern();
    });
    card.appendChild(btn);
    list.appendChild(card);
  }
}

document.getElementById('btn-rest').addEventListener('click', () => {
  if (progress.coin < REST_COST) return;
  progress.coin -= REST_COST;
  progress.save();
  controller.hp = controller.maxHp;
  controller.mana = controller.maxMana;
  if (inventory.maxArrows) inventory.arrows = inventory.maxArrows;
  renderTavern();
});
document.getElementById('btn-leave-tavern').addEventListener('click', closeTavern);

/* ================= the mirror =================
 * Standing at the glass outside any tavern. Pieces are ten coin, worn
 * immediately, and the rig is rebuilt on the spot so you can see what you
 * bought before you pay for the next one.
 */

const mirrorEl = document.getElementById('mirror');

function openMirror() {
  mode = 'mirror';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  sidebar.hidden = true;
  renderMirror();
  mirrorEl.hidden = false;
}

function closeMirror() {
  mirrorEl.hidden = true;
  mode = 'play';
  input.enabled = true;
  hud.show(true);
  sidebar.hidden = false;
}

/** Put a piece on and rebuild the character wearing it. */
function wearPiece(slot, piece) {
  const cls = controller.classId;
  if (!progress.wear(cls, slot, piece)) {
    hud.announce(isLocked(piece, progress) ? 'NOT YET EARNED' : 'NOT ENOUGH COIN');
    return;
  }
  // Rebuilt in place: same position, same facing, same animation state, new
  // clothes. Rerunning startRun here would respawn the player at the gate.
  const wasYaw = playerRig.root.rotation.y;
  buildPlayer(cls, progress.look || {});
  playerRig.root.position.copy(controller.position);
  playerRig.root.rotation.y = wasYaw;
  renderMirror();
}

function renderMirror() {
  document.getElementById('mirror-coin').textContent = progress.coin;
  const cls = controller.classId;
  const worn = progress.outfit(cls);
  const list = document.getElementById('mirror-list');
  list.innerHTML = '';

  for (const slot of SLOTS[cls]) {
    const head = document.createElement('div');
    head.className = 'slot-head';
    head.textContent = SLOT_NAMES[slot];
    list.appendChild(head);

    for (const piece of WARDROBE[cls][slot]) {
      const on = worn[slot].id === piece.id;
      const locked = isLocked(piece, progress);
      const owned = progress.ownsPiece(cls, slot, piece);
      const cost = priceOf(cls, slot, piece);

      const card = document.createElement('div');
      card.className = 'upg'
        + (on ? ' worn' : '') + (locked ? ' locked' : '') + (piece.dragon ? ' dragon' : '');
      card.innerHTML = `
        <div class="upg-top">
          <span class="upg-name">${piece.name}</span>
          ${on ? '<span class="worn-tag">WORN</span>' : ''}
        </div>
        <div class="upg-desc">${piece.desc}</div>`;

      const btn = document.createElement('button');
      if (locked) { btn.textContent = 'KILL THE BLACK DRAGON'; btn.disabled = true; }
      else if (on) { btn.textContent = 'WEARING'; btn.disabled = true; }
      else if (owned || cost === 0) { btn.textContent = piece.dragon ? 'WEAR — EARNED' : 'WEAR'; }
      else {
        btn.textContent = `BUY — ${cost}`;
        btn.disabled = progress.coin < cost;
      }
      btn.addEventListener('click', () => wearPiece(slot, piece));
      card.appendChild(btn);
      list.appendChild(card);
    }
  }
}

/* ================= satchel ================= */
// E opens it. Food is eaten from here one item at a time; relics are listed
// because a player who bought six of them deserves to be able to read them.

const satchelEl = document.getElementById('satchel');

function openSatchel() {
  mode = 'satchel';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  sidebar.hidden = true;
  renderSatchel();
  satchelEl.hidden = false;
}

function closeSatchel() {
  satchelEl.hidden = true;
  mode = 'play';
  input.enabled = true;
  hud.show(true);
  sidebar.hidden = false;
}

function renderSatchel() {
  document.getElementById('satchel-coin').textContent = progress.coin;

  const foodList = document.getElementById('satchel-food');
  foodList.innerHTML = '';
  const kinds = Object.keys(inventory.food).filter(k => inventory.food[k] > 0);
  if (!kinds.length) {
    foodList.innerHTML = '<div class="upg maxed"><div class="upg-desc">Nothing to eat.</div></div>';
  }
  for (const kind of kinds) {
    const def = FOOD[kind];
    const card = document.createElement('div');
    card.className = 'upg';
    card.innerHTML = `
      <div class="upg-top">
        <span class="upg-name">${def.name}</span>
        <span class="pips">x${inventory.food[kind]}</span>
      </div>
      <div class="upg-desc">Heals ${def.heal} over ${def.over}s.</div>`;
    const btn = document.createElement('button');
    const full = controller.hp >= controller.maxHp;
    btn.textContent = full ? 'ALREADY FULL' : 'EAT';
    btn.disabled = full;
    btn.addEventListener('click', () => {
      if (!inventory.takeFood(kind)) return;
      controller.eat(def.heal, def.over, def.mana || 0);
      renderSatchel();
    });
    card.appendChild(btn);
    foodList.appendChild(card);
  }

  // the map, if this level's chart has been bought
  const mapList = document.getElementById('satchel-map');
  mapList.innerHTML = '';
  {
    const has = progress.hasMap(level.id);
    const card = document.createElement('div');
    card.className = 'upg' + (has ? '' : ' maxed');
    card.innerHTML = `
      <div class="upg-top"><span class="upg-name">MAP — ${level.name}</span></div>
      <div class="upg-desc">${has
        ? 'Shrines, taverns, merchants and every chest you have not opened.'
        : 'You have no chart of this place. The merchant sells one.'}</div>`;
    const btn = document.createElement('button');
    btn.textContent = has ? 'READ IT' : 'NOT BOUGHT';
    btn.disabled = !has;
    btn.addEventListener('click', () => openMap());
    card.appendChild(btn);
    mapList.appendChild(card);
  }

  const relicList = document.getElementById('satchel-relics');
  relicList.innerHTML = '';
  if (!inventory.artifacts.length) {
    relicList.innerHTML = '<div class="upg maxed"><div class="upg-desc">No relics yet. They are hidden off the road, and sold in taverns.</div></div>';
  }
  for (const id of inventory.artifacts) {
    const def = ARTIFACTS[id];
    if (!def) continue;
    const card = document.createElement('div');
    card.className = 'upg maxed';
    card.innerHTML = `
      <div class="upg-top"><span class="upg-name" style="color:${def.color}">${def.name}</span></div>
      <div class="upg-desc">${def.desc}</div>`;
    relicList.appendChild(card);
  }
}

document.getElementById('btn-leave-satchel').addEventListener('click', closeSatchel);
document.getElementById('btn-leave-mirror').addEventListener('click', closeMirror);

/* ================= the ice block ================= */
// What being frozen LOOKS like: a faceted block of aerated ice around the
// hero that cracks visibly as you struggle out of it.

let iceBlock = null;
function buildIceBlock() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    map: T.flatTex('#bfe8ff'), transparent: true, opacity: 0.5,
    flatShading: true, depthWrite: false, fog: true,
  });
  const core = blob(0.86, mat, [1, 1.25, 1], 6, 5, [0, 1.0, 0]);
  g.add(core);
  // shards sticking out of it, so it reads as ice and not as a bubble
  for (let i = 0; i < 9; i++) {
    const a2 = (i / 9) * Math.PI * 2;
    const sh = cone(0.16, 0.5 + (i % 3) * 0.22, mat, 5,
      [Math.cos(a2) * 0.7, 0.5 + (i % 4) * 0.42, Math.sin(a2) * 0.7]);
    sh.rotation.set(Math.cos(a2) * 0.5, 0, -Math.sin(a2) * 0.5);
    g.add(sh);
  }
  g.visible = false;
  scene.add(g);
  return g;
}

/* ================= two players =================
 * Plug a second controller in and the screen halves: player one on top, player
 * two underneath, each with their own camera. The world is drawn twice into
 * the same low-resolution buffer and the N64 filter runs over the whole thing
 * afterwards, so both halves share one dither grid rather than each getting
 * their own crawling one.
 */

let player2 = null;

let wasCoop = false;
function coopActive() {
  const on = !!player2 && player2.connected;
  if (!on && wasCoop) { wasCoop = false; resize(); }   // give the view back
  if (on) wasCoop = true;
  return on;
}

function ensureSecondPlayer() {
  const padCount = (navigator.getGamepads ? navigator.getGamepads() : [])
    .filter(g => g && g.connected).length;
  if (padCount >= 2 && !player2) {
    // player two is whichever class player one is not, so a party of two is
    // never two knights
    const order = ['knight', 'wizard', 'archer'];
    const cls = order[(order.indexOf(controller.classId) + 1) % order.length];
    const rig = buildCharacter(cls, progress.lookFor(cls));
    player2 = new SecondPlayer(scene, world, rig, cls, {
      padIndex: 1, stats: progress.stats(cls),
    });
    player2.spawnAt(controller.position.x + 2.5, controller.position.z - 1.5);
    hud.announce('PLAYER TWO');
  } else if (padCount < 2 && player2) {
    player2.dispose();
    player2 = null;
    hud.announce('PLAYER TWO LEFT');
  }
}

function updateCoop(dt) {
  ensureSecondPlayer();
  if (!player2) return;
  player2.update(dt, {
    onStrike: (kind, def) => onSecondStrike(kind, def),
    onNoResource: () => {},
  });
  if (player2.controller.dead) {
    // they get back up next to you rather than ending the run
    player2.controller.dead = false;
    player2.controller.hp = player2.controller.maxHp * 0.4;
    player2.spawnAt(controller.position.x + 2, controller.position.z);
    hud.announce('PLAYER TWO IS UP');
  }
}

/** Player two swings at whatever is in front of THEM. */
function onSecondStrike(kind, def) {
  const c = player2.controller;
  const s = progress.stats(c.classId);
  if (c.classId === 'knight' || kind === 'attack') {
    const targets = combat.meleeTargets(c.position, c.yaw,
      def.range ?? 2.4, def.arc ?? 1.1, enemies);
    const dmg = def.desperate ? def.damage : s.damage;
    for (const e of targets) hitEnemy(e, dmg, 'melee');
    combat.slashArc(c.position, c.yaw, def.range ?? 2.4);
  }
}

/** MENDING LIGHT reaches whoever else is on the screen. */
function healAllies(sp) {
  if (!player2) return;
  const d = player2.controller.position.distanceTo(controller.position);
  if (d > (sp.radius ?? 24)) return;
  player2.controller.heal(sp.allyHeal);
  _v2.copy(player2.controller.position); _v2.y += 1.7;
  combat.popup(_v2, `+${sp.allyHeal}`, 'heal');
  combat.hitSpark(player2.controller.position, sp.colour, 10);
}

/* ================= spells =================
 * A bought spell sits under the BLOCK key. The wizard has no business behind
 * a shield anyway, and one slot means choosing what goes in it is a decision
 * rather than a menu of eight hotkeys.
 *
 * Every spell resolves through one of three shapes -- on yourself, on what you
 * are locked on to, or on everything around you -- so adding another is a
 * catalogue entry and nothing more.
 */

let spellCooldown = 0;
const overTime = [];        // poison, burn: { target, left, every, t, damage, colour }

function castBoundSpell() {
  const sp = boundSpell(progress);
  if (!sp || controller.classId !== 'wizard') return false;
  if (spellCooldown > 0) return false;
  if (controller.mana < sp.mana) { ctx.hint('NOT ENOUGH MANA'); return false; }

  if (sp.cast === 'target' && !lockEnemy) { ctx.hint('NOTHING LOCKED ON'); return false; }

  controller.mana -= sp.mana;
  spellCooldown = sp.cooldown;
  hud.announce(sp.name);
  follow.shake(0.12, 0.25);

  if (sp.cast === 'aoe') return castAoe(sp);
  if (sp.cast === 'target') return castAtTarget(sp);
  return castOnSelf(sp);
}

function castAoe(sp) {
  const c = controller.position;
  combat.telegraph({
    position: { x: c.x, z: c.z }, shape: 'circle',
    range: sp.radius, duration: 0.5, color: sp.colour,
  });
  _v.copy(c); _v.y += 0.8;
  combat.hitSpark(_v, sp.colour, 16);
  for (const e of enemies) {
    if (e.dead || e.distTo(c) > sp.radius) continue;
    if (sp.damage) hitEnemy(e, sp.damage, 'special');
    if (sp.freeze) freezeEnemy(e, sp.freeze);
    if (sp.ticks) addOverTime(e, sp);
  }
  return true;
}

function castAtTarget(sp) {
  const e = lockEnemy;
  if (sp.burn || sp.ticks) {
    addOverTime(e, sp);
    combat.hitSpark(e.position, sp.colour, 10);
    if (sp.damage && !sp.ticks) hitEnemy(e, sp.damage, 'special');
    return true;
  }
  // a bolt that will not be dodged
  _v.copy(controller.position); _v.y += 1.25;
  _dir.set(e.position.x - _v.x, (e.position.y + 0.9) - _v.y, e.position.z - _v.z).normalize();
  combat.spawn({
    from: _v, dir: _dir, speed: sp.speed ?? 13, damage: sp.damage,
    owner: 'player', kind: 'bolt', color: sp.colour,
    homing: e.root, turnRate: 6.0, life: 4.0,
  });
  return true;
}

function castOnSelf(sp) {
  if (sp.heal) {
    controller.heal(sp.heal);
    _v.copy(controller.position); _v.y += 1.7;
    combat.popup(_v, `+${sp.heal}`, 'heal');
    combat.hitSpark(controller.position, sp.colour, 12);
  }
  // in two-player it reaches whoever else is on the screen
  if (sp.allyHeal && typeof healAllies === 'function') healAllies(sp);
  return true;
}

/** Poison and burn: the same machinery, different colour and source. */
function addOverTime(target, sp) {
  overTime.push({
    target, left: sp.ticks, every: sp.interval ?? 1.0, t: 0,
    damage: sp.damage, colour: sp.colour,
  });
}

function updateSpells(dt) {
  spellCooldown = Math.max(0, spellCooldown - dt);
  for (let i = overTime.length - 1; i >= 0; i--) {
    const o = overTime[i];
    if (!o.target || o.target.dead) { overTime.splice(i, 1); continue; }
    o.t -= dt;
    if (o.t > 0) continue;
    o.t = o.every;
    o.left--;
    hitEnemy(o.target, o.damage, 'special');
    _v2.copy(o.target.position); _v2.y += 0.9;
    combat.hitSpark(_v2, o.colour, 3);
    if (o.left <= 0) overTime.splice(i, 1);
  }
}

/** Ice, from the player's side of the fight. */
function freezeEnemy(e, seconds) {
  e.frozen = Math.max(e.frozen || 0, seconds);
  e.setState('recover');
  e.cooldown = Math.max(e.cooldown, seconds);
  combat.hitSpark(e.position, '#bfe8ff', 8);
}

/* ================= channelling =================
 * Hold ATTACK and SPECIAL together (C-left and C-right on a pad). It is the
 * same gesture for both ranged classes and it means the same thing: stop
 * fighting for a moment and put your ammunition back by hand.
 */

const HARVEST_TIME = 2.0;      // seconds the archer must hold it
const HARVEST_RANGE = 6.0;     // how far it reaches for bodies
const MANA_CHANNEL = 3.0;      // mana a second for the wizard

let channelRing = null;

function onChannel(c, held, dt) {
  if (c.classId === 'wizard') {
    // no threshold: it just tops up, slowly, for as long as you stand there
    c.restoreMana(MANA_CHANNEL * dt);
    if (Math.random() < dt * 9) {
      _v.copy(c.position); _v.y += 1.0 + Math.random();
      combat.hitSpark(_v, '#7aa8ee', 2);
    }
    hud.setPrompt('DRAWING MANA');
    return;
  }

  // the archer: two seconds, then every body in reach gives its arrows up
  const left = Math.max(0, HARVEST_TIME - held);
  if (left > 0) {
    hud.setPrompt(`PULLING ARROWS — ${left.toFixed(1)}s`);
    if (Math.random() < dt * 6) {
      _v.copy(c.position); _v.y += 0.7;
      combat.hitSpark(_v, '#d8c9a8', 2);
    }
    return;
  }
  harvestArrows(c);
  c.channelT = 0;              // hold again for the next batch
}

function harvestArrows(c) {
  let got = 0;
  for (const e of enemies) {
    if (!e.dead || e.looted || e.lootable <= 0) continue;
    if (e.distTo(c.position) > HARVEST_RANGE) continue;
    got += inventory.addArrows(e.lootable);
    e.looted = true;
    e.lootable = 0;
    combat.hitSpark(e.position, '#d8c9a8', 6);
  }
  _v.copy(c.position); _v.y += 1.8;
  if (got > 0) {
    combat.popup(_v, `+${got} ARROWS`, 'heal');
    hud.announce('QUIVER FILLED');
  } else {
    combat.popup(_v, 'NOTHING TO PULL', 'warn');
  }
}

function onChannelEnd() {
  hud.setPrompt(null);
}

/* ================= controller menus =================
 * Whichever full-screen panel is up gets the D-pad, a highlight and A to
 * confirm. The panels themselves know nothing about it -- padNav reads the
 * DOM, so a screen added later works without being registered.
 */

const padNav = new PadNav();

// The sidebar shows the controller's layout only when one is plugged in --
// the keyboard scheme stays exactly as it was, and both are always live.
input.pad.onConnect = (id, on) => {
  const rows = document.getElementById('pad-rows');
  if (rows) rows.hidden = !on;
  if (on) hud.announce('CONTROLLER READY');
};

/** Whichever panel is currently on top, or null if we are playing. */
function openPanel() {
  const ids = ['title', 'briefing', 'shop', 'tavern', 'mirror', 'satchel',
    'levelsel', 'death', 'victory'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.hidden) return el;
  }
  return null;
}

/**
 * The d-pad has two jobs and never both at once: it walks the highlight around
 * an open panel, and with nothing open it swings the camera. Splitting them by
 * "is a panel up" means the player never has to learn a mode.
 */
const PAD_LOOK_YAW = 2.3;      // radians a second
const PAD_LOOK_PITCH = 1.15;

function updatePadMenus(dt) {
  // The map is a picture, not a list: there is nothing to highlight, so A or B
  // simply shuts it. Without this a pad player could open the map and be stuck
  // looking at it.
  if (mode === 'map') {
    padNav.attach(null);
    const nav = input.pad.navPressed();
    if (nav.confirm || nav.back) {
      closeMap();
      input.pad.consume('interact');
      input.pad.consume('satchel');
    }
    return;
  }
  const panel = openPanel();
  padNav.attach(panel);
  if (!panel) {
    if (input.pad.connected) {
      const h = (input.pad.action('dpadRight') ? 1 : 0) - (input.pad.action('dpadLeft') ? 1 : 0);
      const v = (input.pad.action('dpadDown') ? 1 : 0) - (input.pad.action('dpadUp') ? 1 : 0);
      // Fed in as mouse delta so the camera treats it as manual look and drops
      // out of auto-follow exactly the way dragging the mouse does.
      if (h) input.mouseDX += h * PAD_LOOK_YAW * dt;
      if (v) input.mouseDY += v * PAD_LOOK_PITCH * dt;
    }
    return;
  }
  padNav.update(dt, input.pad);
  const nav = input.pad.navPressed();
  if (nav.confirm) {
    padNav.activate();
    input.pad.consume('interact');
  } else if (nav.back) {
    // the close button is the panel's last full-width one, by convention
    const outs = panel.querySelectorAll('button.wide');
    outs[outs.length - 1]?.click();
    input.pad.consume('satchel');
  }
}

/* ================= level select =================
 * Q, once the game is finished. The whole campaign is behind you at that
 * point and walking back through four levels to reach one of them is not a
 * challenge, it is an errand.
 */

const levelSelEl = document.getElementById('levelsel');

function levelSelectAvailable() {
  return progress.finished && (mode === 'play');
}

function openLevelSelect() {
  mode = 'levelsel';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  sidebar.hidden = true;
  renderLevelSelect();
  levelSelEl.hidden = false;
}

function closeLevelSelect() {
  levelSelEl.hidden = true;
  mode = 'play';
  input.enabled = true;
  hud.show(true);
  sidebar.hidden = false;
}

function renderLevelSelect() {
  const list = document.getElementById('levelsel-list');
  list.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const here = i === levelIdx;
    const card = document.createElement('div');
    card.className = 'upg' + (here ? ' maxed' : '');
    card.innerHTML = `
      <div class="upg-top"><span class="upg-name">${L.name}</span></div>
      <div class="upg-desc">CHAPTER ${i + 1}${here ? ' — you are here' : ''}</div>`;
    const btn = document.createElement('button');
    btn.textContent = here ? 'HERE' : 'GO';
    btn.disabled = here;
    btn.addEventListener('click', () => {
      levelSelEl.hidden = true;
      const cls = controller.classId;
      const look = (playerRig && playerRig.look) || screens.look;
      const wasRiding = riding;
      if (wasRiding) dismount();
      loadLevel(i);
      startRun(cls, look, false);
      if (wasRiding || progress.dragonRun) mountAtSpawn();
    });
    card.appendChild(btn);
    list.appendChild(card);
  });
}

document.getElementById('btn-leave-levelsel')
  .addEventListener('click', closeLevelSelect);

/**
 * Run the whole campaign again, mounted. The kingdom goes back to being
 * hostile -- there is no point flying a dragon through an empty valley -- and
 * you start chapter one already in the air.
 */
function restartAsDragon() {
  if (!progress.rideUnlocked) {
    hud.announce('YOU HAVE NOTHING TO RIDE');
    return;
  }
  progress.dragonRun = true;
  progress.level = LEVELS[0].id;
  progress.save();
  const cls = controller.classId;
  const look = (playerRig && playerRig.look) || screens.look;
  if (riding) dismount();
  levelSelEl.hidden = true;
  loadLevel(0);
  startRun(cls, look, false);
  mountAtSpawn();
  hud.announce('AGAIN, FROM THE AIR');
}

document.getElementById('btn-dragon-restart')
  ?.addEventListener('click', restartAsDragon);

/* ================= the peace =================
 * Once the last dragon is down every level reopens with its people in it and
 * nothing hostile left. It is the SAME level -- same road, same shops, same
 * shrines -- which is the whole point: you walk back through the places you
 * fought for and they are lived in.
 */

let villagers = [];

function clearVillagers() {
  for (const v of villagers) v.dispose();
  villagers = [];
}

function populate() {
  clearVillagers();
  if (!progress.finished || progress.dragonRun) return;
  const spec = PEACE[level.id];
  const spots = world.peaceSpots || [];
  if (!spec || !spots.length) return;
  for (let i = 0; i < spec.count; i++) {
    const spot = spots[i % spots.length];
    const role = spec.roles[i % spec.roles.length];
    const extra = i >= spots.length;
    villagers.push(new Villager(
      scene, world,
      spot.x + (extra ? (Math.random() - 0.5) * 6 : 0),
      spot.z + (extra ? (Math.random() - 0.5) * 6 : 0),
      role, i * 37 + 11, { roam: spot.roam ?? 5 }
    ));
  }
}

function updateVillagers(dt) {
  for (const v of villagers) v.update(dt);
}

/* ================= the key, the wall, and what is behind it =================
 * The last thing in the game. Carry the key back to the mouth of the valley,
 * stand at the sealed wall and press SPACE: the rock goes down into the
 * ground, and there is a young dragon behind it that will carry you.
 */

let rideDragon = null;
let cageState = null;      // { t } while the cage is being opened
let heldKey = null;        // the key model in the hero's hand

function setupSecret() {
  rideDragon?.dispose();
  rideDragon = null;
  cageState = null;
  const c = world.dragonCage;

  // NOTHING is in the cage until you have the key.
  //
  // It used to be built with the level, which meant a small green dragon was
  // sitting behind the rock from the first frame of a new game -- visible from
  // the title camp, and reachable by anyone who wandered through the false
  // wall on their way out of the valley mouth. The secret has to be earned
  // before it exists.
  if (!progress.hasKey && !progress.rideUnlocked) return;

  if (c && !progress.rideUnlocked) {
    // you have the key but have not turned it: it is in there, and caged
    rideDragon = new RideDragon(scene, world, c.denX, c.denZ);
    return;
  }

  // Once it is free it FOLLOWS YOU: every level gets one, waiting where you
  // came in. Leaving it behind in chapter one would make the whole thing a
  // one-level toy.
  if (c) {
    rideDragon = new RideDragon(scene, world, c.denX, c.denZ);
    openCageInstantly();
  } else {
    const sp = world.spawn;
    rideDragon = new RideDragon(scene, world, sp.x + 3.5, sp.z - 2);
  }
}

function openCageInstantly() {
  const c = world.dragonCage;
  if (!c) return;
  c.door.rotation.y = -2.1;
  c.doorBox.solid = false;
  for (const b of c.barBoxes) b.solid = false;
  c.opened = true;
}

function updateKeyInHand() {
  const want = progress.hasKey && !riding;
  if (want && !heldKey) {
    // small: the cutscene key is enormous, but a person carries it slung
    heldKey = buildGoldenKey(0.17);
    scene.add(heldKey);
  } else if (!want && heldKey) {
    scene.remove(heldKey);
    heldKey = null;
  }
  if (!heldKey) return;
  const c = controller.position;
  heldKey.position.set(
    c.x - Math.sin(controller.yaw) * 0.34 + Math.cos(controller.yaw) * 0.22,
    c.y + 0.92,
    c.z - Math.cos(controller.yaw) * 0.34 - Math.sin(controller.yaw) * 0.22
  );
  heldKey.rotation.set(0.25, controller.yaw + 0.4, 1.05);
}

/** Are we at the cage door with the key, and is it still locked? */
function atCageDoor() {
  const c = world.dragonCage;
  if (!c || c.opened || !progress.hasKey) return false;
  return Math.hypot(controller.position.x - c.standX,
    controller.position.z - c.standZ) < 5.5;
}

function unlockCage() {
  const c = world.dragonCage;
  if (!c) return;
  cageState = { t: 0 };
  input.enabled = false;
  follow.shake(0.22, 1.2);
  ctx.hint('IT TURNS');
  _v.set(c.standX - 1.2, 3.2, c.standZ);
  combat.hitSpark(_v, '#ffd76a', 14);
}

function updateCage(dt) {
  const c = world.dragonCage;
  if (!cageState || !c) return;
  cageState.t += dt;
  // the lock drops off, then the door swings wide
  if (cageState.t < 0.7) {
    c.lock.position.y -= dt * 4.2;
    c.lock.rotation.z += dt * 3.0;
  } else if (!cageState.dropped) {
    cageState.dropped = true;
    c.lock.visible = false;
    // the bars stop being a wall the moment the door starts to move
    c.doorBox.solid = false;
    for (const b of c.barBoxes) b.solid = false;
  }
  if (cageState.t >= 0.7) {
    const k = Math.min(1, (cageState.t - 0.7) / 1.8);
    const e = k * k * (3 - 2 * k);
    c.door.rotation.y = -2.1 * e;
    if (k >= 1 && !cageState.done) {
      cageState.done = true;
      c.opened = true;
      progress.rideUnlocked = true;
      progress.save();
      input.enabled = true;
      hud.announce('IT IS FREE');
      ctx.hint('SPACE TO RIDE');
      cageState = null;
    }
  }
}

/* ---- riding ---- */

let riding = false;
let fogOnFoot = null;
const _seat = new THREE.Vector3();

/** Put the dragon at the player and get straight on it. */
function mountAtSpawn() {
  if (!rideDragon) return;
  rideDragon.pos.set(controller.position.x, controller.position.y, controller.position.z);
  rideDragon.altitude = 0;
  mount();
}

function canMount() {
  // Generous radius -- it is a big animal and you should not have to hunt for
  // the spot -- but the cage has to be OPEN. Distance alone let you mount it
  // straight through the bars.
  if (riding || !rideDragon) return false;
  const c = world.dragonCage;
  if (c && !c.opened) return false;
  return rideDragon.distTo(controller.position) < 9.0;
}

/** The sidebar shows whichever set of controls you are actually using. */
function showRideControls(on) {
  const rows = document.getElementById('ride-rows');
  if (rows) rows.hidden = !on;
}

function mount() {
  // Fog is the game's draw distance, and on foot that is the point. Up here it
  // is the opposite of the point -- you climbed to LOOK at the place.
  fogOnFoot = { near: scene.fog.near, far: scene.fog.far };
  riding = true;
  rideDragon.mounted = true;
  rideDragon.yaw = controller.yaw;
  playerRig.root.rotation.z = 0;
  showRideControls(true);
  hud.announce('HOLD ON');
  ctx.hint('W A S D FLY / UP CLIMB / DOWN DIVE');
}

function dismount() {
  if (fogOnFoot) {
    scene.fog.near = fogOnFoot.near;
    scene.fog.far = fogOnFoot.far;
    fogOnFoot = null;
  }
  riding = false;
  rideDragon.mounted = false;
  rideDragon.altitude = 0;
  rideDragon.speed = 0;
  const p2 = rideDragon.pos;
  controller.reset(p2.x + 2.5, p2.z);
  showRideControls(false);
  hud.announce('DOWN');
}

/** The dragon's tail: a wide sweep that catches everything around it. */
function dragonTail(d) {
  const def = DRAGON_ATTACKS.TAIL;
  // a live snapshot: sweepFx tracks it for the length of the swing
  const at = { position: d.pos, yaw: d.yaw };
  combat.sweepFx(at, def.range, 0.34, d.pos.y + d.altitude + 0.4);
  follow.shake(0.22, 0.3);
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.position.x - d.pos.x, dz = e.position.z - d.pos.z;
    if (dx * dx + dz * dz > def.range * def.range) continue;
    // it only reaches what is roughly level with it
    if (Math.abs(e.position.y - (d.pos.y + d.altitude)) > 6) continue;
    hitEnemy(e, def.damage, 'special');
  }
}

/** The dragon's breath: a long cone out of its mouth. */
function dragonBreath(d) {
  const def = DRAGON_ATTACKS.BREATH;
  const flame = combat.spawnFlameCone({
    range: def.range, halfAngle: def.halfAngle, duration: def.strike + 0.15,
    color: '#ff7a2c', hot: '#ffe8a0', coolColor: '#8c3a12',
  });
  d.mouth(_v);
  _dir.set(Math.sin(d.yaw), -0.16, Math.cos(d.yaw)).normalize();
  flame.obj.position.copy(_v);
  flame.obj.lookAt(_v.x + _dir.x * 5, _v.y + _dir.y * 5, _v.z + _dir.z * 5);
  flame.owner = null;
  follow.shake(0.16, def.strike);
  for (const e of combat.coneTargets(_v, _dir, def.range, def.halfAngle, enemies)) {
    hitEnemy(e, def.damage, 'special');
  }
}

function updateRide(dt) {
  if (!rideDragon) return;
  rideDragon.update(dt, input, follow);
  rideDragon.updateAction(dt, { onTail: dragonTail, onBreath: dragonBreath });
  if (!riding) return;
  // the hero sits on it; the controller is only along for the ride
  rideDragon.seat(_seat);
  controller.position.copy(_seat);
  controller.velocity.set(0, 0, 0);
  controller.yaw = rideDragon.yaw;
  playerRig.root.position.copy(_seat);
  playerRig.root.rotation.y = rideDragon.yaw;
  playerAnim.update(dt, { speed: 0, grounded: true, sitting: true });
  // Look DOWN while flying. The whole point of being up here is seeing the
  // level from above; at the walking pitch you get a screenful of fog.
  const k = 1 - Math.exp(-2.0 * dt);
  follow.pitch += (0.62 - follow.pitch) * k;
  follow.targetDist += (6.5 - follow.targetDist) * k;
  // and open the fog out with the altitude, so climbing genuinely shows you
  // more of the level rather than more grey
  if (fogOnFoot) {
    const lift = 1 + (rideDragon.altitude / 40) * 2.6;
    scene.fog.near += (fogOnFoot.near * lift - scene.fog.near) * k;
    scene.fog.far += (fogOnFoot.far * lift - scene.fog.far) * k;
  }
}

/* ================= weather ================= */
// Built with the level and thrown away with it. It follows the camera, so a
// few hundred flakes cover a whole mountain.

let weather = null;

function setWeather(spec) {
  weather?.dispose();
  weather = null;
  if (spec && spec.kind === 'snow') weather = new Snowfall(scene, spec);
}

function updateIceBlock() {
  if (!iceBlock) iceBlock = buildIceBlock();
  const on = controller.isFrozen;
  iceBlock.visible = on;
  if (!on) return;
  iceBlock.position.copy(controller.position);
  // it shrinks and clears as you break out, so progress is readable
  const left = 1 - controller.struggle;
  iceBlock.scale.setScalar(0.72 + left * 0.34);
  iceBlock.rotation.y += 0.4 * (1 - left);
  for (const c of iceBlock.children) {
    c.material.opacity = 0.20 + left * 0.34;
  }
}

/* ================= the bought map ================= */
// M reads it, once you have paid for this level's chart at its merchant.

const levelMap = new LevelMap();
const briefing = new Briefing();
// One briefing per class per session: shown the first time you play a hero,
// not every time you walk into a new chapter as them.
let briefedFor = null;
const mapRow = document.getElementById('map-row');

function refreshMapRow() {
  mapRow.hidden = !progress.hasMap(level.id);
  const q = document.getElementById('q-row');
  if (q) q.hidden = !progress.finished;
}

function openMap() {
  if (!progress.hasMap(level.id)) {
    ctx.hint('NO MAP OF THIS PLACE');
    return;
  }
  // reading it from the satchel means the satchel has to get out of the way
  satchelEl.hidden = true;
  mode = 'map';
  input.enabled = false;
  input.releaseLock();
  sidebar.hidden = true;
  levelMap.show(level, world, controller);
}

function closeMap() {
  levelMap.hide();
  mode = 'satchel';
  renderSatchel();
  satchelEl.hidden = false;
}

/**
 * Closing keys for every screen, in ONE listener.
 *
 * These cannot live in the Input class -- it is disabled while a screen is up.
 * They cannot be separate listeners either: the map closes back to the satchel,
 * and with two listeners the same E keystroke closed the map and then closed
 * the satchel it had just opened, dumping the player straight onto the road.
 * One ordered handler with an early return out of each branch fixes that.
 *
 * The map has no key of its own any more. It is read from the satchel, which
 * is also the only way a controller could ever reach it: the pad has no spare
 * button and B already opens the bag.
 */
addEventListener('keydown', (e) => {
  const esc = e.code === 'Escape';
  if (briefing.open) {
    if (e.code === 'Space' || e.code === 'Enter' || esc) { e.preventDefault(); briefing.hide(); }
    return;
  }
  if (mode === 'map') {
    if (esc || e.code === 'KeyE' || e.code === 'KeyM') { e.preventDefault(); closeMap(); }
    return;
  }
  if (mode === 'mirror') {
    if (esc) { e.preventDefault(); closeMirror(); }
    return;
  }
  if (mode === 'satchel') {
    if (esc || e.code === 'KeyE') { e.preventDefault(); closeSatchel(); }
  }
});

function openShop() {
  mode = 'shop';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  sidebar.hidden = true;
  screens.openShop(controller.classId);
}

function onPlayerDeath() {
  mode = 'death';
  input.enabled = false;
  input.releaseLock();
  hud.setPrompt(null);
  hud.setGroupLock(0);
  screens.setCheckpointAvailable(!!checkpoint, checkpoint ? checkpoint.name : '');
  setTimeout(() => { if (mode === 'death') screens.showDeath(); }, 900);
}

/** Start the level again from the top, keeping coin and upgrades. */
function restartLevel() {
  const cls = controller.classId;
  const look = (playerRig && playerRig.look) || screens.look;
  for (const s of world.enemySpawns) s.spawned = false;
  startRun(cls, look, false);
}

/**
 * Death sends you back to the shrine AND puts the world back with you.
 *
 * Everything you killed since that shrine gets up again where it was standing,
 * and everything still alive walks back to where it started. Otherwise dying
 * is a way of clearing a level: die, respawn, walk past the bodies. The
 * checkpoint is supposed to be a place you got to, not a saved kill count.
 */
function respawn() {
  mode = 'play';
  input.enabled = true;
  hud.show(true);
  sidebar.hidden = false;
  const at = checkpoint || { x: world.spawn.x, z: world.spawn.z };
  controller.reset(at.x, at.z);
  applyStats(controller.classId);
  controller.hp = controller.maxHp;
  controller.mana = controller.maxMana;
  respawnGrace = 1.4;
  clearLock();
  follow._initialized = false;
  playerRig.root.rotation.z = 0;

  restoreEnemiesToCheckpoint();

  for (const c of camps.values()) { c.alerted = false; c.alarmT = 0; }
  hud.announce(checkpoint ? checkpoint.name : world.areas[0].name);
}

/**
 * Undo every kill since the last shrine, and send the survivors home.
 *
 * A dead mob is not rebuilt -- it is the same Enemy, revived in place, which
 * keeps its camp membership and its patrol anchor intact. The boss is left
 * alone: reviving it would undo the gate and the whole arena sequence.
 */
/**
 * Lighting a shrine BANKS every kill made up to that point. Those bodies are
 * done: dying later must not undo work the player already paid a checkpoint
 * for. Only kills made after the last shrine come back.
 */
function bankKills() {
  for (const e of enemies) if (e.dead) e.banked = true;
}

function restoreEnemiesToCheckpoint() {
  let revived = 0;
  for (const e of enemies) {
    if (e.isBoss) continue;
    if (e.dead) {
      if (e.banked) continue;             // killed before the last shrine
      if (e.spawnedByBoss) continue;      // summoned mobs stay dead
      e.revive();
      revived++;
    } else {
      e.returnHome();
    }
  }
  if (revived) hud.announce(`${revived} RISE AGAIN`);
}

function onVictory() {
  mode = 'cutscene';
  input.enabled = false;
  input.releaseLock();
  hud.show(false);
  sidebar.hidden = true;

  progress.unlocked = Math.max(progress.unlocked, levelIdx + 2);
  // The LAST dragon ends the game properly: the kingdom reopens at peace and
  // you walk out of the closing scene carrying the key. Until now only the dev
  // button did this, which meant the real ending did not actually end anything.
  if (levelIdx + 1 >= LEVELS.length) {
    progress.finished = true;
    progress.hasKey = true;
    progress.dragonRun = false;
  }
  progress.save();

  cutscene.play(level.outro, () => {
    if (levelIdx + 1 < LEVELS.length) {
      // You do not teleport between chapters -- the map shows you walking it.
      const fromId = level.id;
      const toId = LEVELS[levelIdx + 1].id;
      travel.play(fromId, toId, () => {
        loadLevel(levelIdx + 1);
        startRun(controller.classId, playerRig.look);
      });
    } else {
      // Straight back into the world rather than onto a menu: the whole point
      // of the ending is that you can go and walk around in it.
      const cls = controller.classId;
      const look = (playerRig && playerRig.look) || screens.look;
      loadLevel(0);
      startRun(cls, look, false);
      hud.announce('THE KINGDOM IS YOURS');
      ctx.hint('YOU HAVE THE KEY');
    }
  });
}

function updateArea() {
  const z = controller.position.z;
  const area = world.areas.find(a => z >= a.z[0] && z <= a.z[1]);
  if (area && area !== currentArea) {
    currentArea = area;
    hud.announce(area.name);
  }
}

/* ================= sidebar ================= */

document.getElementById('fx-btns').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  [...e.currentTarget.querySelectorAll('button')].forEach(n => n.classList.remove('on'));
  b.classList.add('on');
  pipeline.enabled = b.dataset.fx === 'on';
});

canvas.addEventListener('click', () => { if (mode === 'play') input.requestLock(); });

/* ================= dev tools ================= */
// Deliberately plain buttons in the sidebar rather than hidden key combos --
// they exist so the game can be tested quickly, not to be discovered.

function devJump(z) {
  if (mode !== 'play') return;
  const x = world.valleyCentre ? world.valleyCentre(z) : 0;
  controller.position.set(x, world.groundHeight(x, z), z);
  controller.velocity.set(0, 0, 0);
  follow._initialized = false;
}

const DEV = {
  'dev-coin': () => { progress.addCoin(500); },
  'dev-heal': () => {
    controller.hp = controller.maxHp;
    controller.mana = controller.maxMana;
    if (inventory.maxArrows) inventory.arrows = inventory.maxArrows;
    inventory.addPotion('heal', 2);
  },
  'dev-skip': () => devJump(Math.min(controller.position.z + 45, world.zEnd - 30)),
  'dev-arena': () => { gateOpen = true; gateMsg.hidden = true; devJump(world.arenaTrigger + 3); },
  'dev-clear': () => {
    for (const e of enemies) if (!e.dead && !e.isBoss) { e.execute(); onEnemyDeath(e); }
    for (const s of world.enemySpawns) s.spawned = true;
  },
  'dev-next': () => {
    if (levelIdx + 1 >= LEVELS.length) { hud.announce('NO FURTHER LEVELS YET'); return; }
    loadLevel(levelIdx + 1);
    startRun(controller.classId, playerRig.look);
  },
  // Skip to the epilogue: every dragon dead, every level unlocked, the key in
  // your hand. Rebuilds the level you are standing in so the change is
  // immediate rather than waiting for the next load.
  'dev-finish': () => {
    progress.finished = true;
    progress.hasKey = true;
    progress.unlocked = LEVELS.length;
    progress.seenPrologue = true;
    progress.save();
    const cls = controller.classId;
    const look = (playerRig && playerRig.look) || screens.look;
    loadLevel(levelIdx);
    startRun(cls, look, false);
    hud.announce('THE DRAGONS ARE GONE');
    hud.setPrompt?.(null);
    ctx.hint('YOU HAVE THE KEY');
  },
  'dev-reset': () => {
    progress.reset();
    inventory.artifacts = [];
    applyStats(controller.classId);
    screens.refreshTitle();
    clearVillagers();
    hud.announce('PROGRESS ERASED');
  },
};
for (const [id, fn] of Object.entries(DEV)) {
  document.getElementById(id)?.addEventListener('click', () => {
    fn();
    canvas.focus();
  });
}

/* ================= resize ================= */

function resize() {
  const w = innerWidth, h = innerHeight;
  pipeline.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  cutscene.stage.resize(w / h);
  if (player2) {
    // half the height, so each viewport is twice as wide as it is tall
    player2.camera.aspect = w / (h / 2);
    player2.camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
resize();

/* ================= pickup feedback ================= */

loot.onCoin = (v) => {
  progress.addCoin(v);
  if (Math.random() < 0.28) {
    _v.copy(controller.position); _v.y += 1.5;
    combat.popup(_v, '+' + v, 'coin');
  }
};
loot.onPotion = (kind) => {
  _v.copy(controller.position); _v.y += 1.7;
  combat.popup(_v, POTIONS[kind].name, 'heal');
};
loot.onArrows = (n) => {
  _v.copy(controller.position); _v.y += 1.7;
  combat.popup(_v, `+${n} ARROWS`, 'heal');
};
loot.onFood = (kind) => {
  _v.copy(controller.position); _v.y += 1.7;
  combat.popup(_v, FOOD[kind].name, 'heal');
};
loot.onArtifact = (id) => {
  const def = ARTIFACTS[id];
  progress.addArtifact(id);
  inventory.addArtifact(id);
  applyStats(controller.classId);
  _v.copy(controller.position); _v.y += 2.0;
  combat.popup(_v, def.name, 'crit');
  combat.hitSpark(controller.position, def.color, 14);
  follow.shake(0.10, 0.4);
};

/* ================= loop ================= */

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  input.beginFrame();   // the pad is read once, before anything asks it anything
  updatePadMenus(dt);

  cutscene.update(dt);
  travel.update(dt);
  updateCage(dt);

  crazygames.setPlaying(mode === 'play');   // portal analytics; no-op off-portal

  if (mode === 'title') updateTitle(dt);
  else if (mode === 'play') updatePlay(dt);
  else updatePaused(dt);

  const flick = 0.85 + Math.sin(performance.now() * 0.011) * 0.15;
  for (const t of world.torches) {
    t.userData.light.intensity = 1.3 * flick;
    t.userData.flame.scale.set(flick, 0.9 + flick * 0.2, flick);
  }
  // shrine flames: they were static, which made a lit checkpoint read as a
  // prop rather than as something burning
  const now = performance.now() * 0.001;
  for (const c of world.checkpoints || []) {
    if (!c.claimed || !c.flame) continue;
    const k = 0.86 + Math.sin(now * 9 + c.x) * 0.14;
    c.flame.scale.set(k, 0.92 + k * 0.18, k);
    for (const layer of c.flame.children) {
      if (layer.userData.spin) layer.rotation.y += layer.userData.spin * dt;
      if (layer.userData.scroll && layer.material.map) {
        layer.material.map.offset.y -= layer.userData.scroll * dt;
      }
    }
  }
  for (const f of world.campfires || []) {
    const k = 0.85 + Math.sin(performance.now() * 0.009 + f.position.x) * 0.15;
    f.userData.light.intensity = (mode === 'title' ? 5.0 : 2.2) * k;
    f.userData.flame.scale.set(k, 0.9 + k * 0.25, k);
    f.userData.inner.scale.set(k, 1.1 - k * 0.2, k);
  }

  // A staged cutscene shot replaces the world for the length of that beat.
  if (cutscene.active && cutscene.stage.active) {
    pipeline.render(cutscene.stage.scene, cutscene.stage.camera);
  } else if (coopActive() && mode === 'play') {
    // BOTH cameras get the half-height aspect while the screen is split, not
    // just player two's -- otherwise player one's view is stretched into a
    // letterbox and the top half looks broken.
    const size = pipeline.internalSize;
    const wantAspect = size.x / (size.y / 2);
    for (const c of [camera, player2.camera]) {
      if (Math.abs(c.aspect - wantAspect) > 0.001) {
        c.aspect = wantAspect;
        c.updateProjectionMatrix();
      }
    }
    pipeline.renderSplit(scene, [{ camera }, { camera: player2.camera }]);
  } else {
    pipeline.render(scene, camera);
  }
  input.endFrame();
}

/** Title: the hero resting against the tree at night, lit by the fire. */
function updateTitle(dt) {
  titleT += dt;
  const camp = world.titleCamp;

  playerRig.root.position.set(camp.seat.x, world.groundHeight(camp.seat.x, camp.seat.z), camp.seat.z);
  playerRig.root.rotation.set(0, Math.atan2(
    camp.lookAt.x - camp.seat.x, camp.lookAt.z - camp.seat.z) + 0.25, 0);
  playerAnim.update(dt, {
    speed: 0, maxSpeed: 6, grounded: true, vy: 0, running: false,
    hunch: 0, height: 0, attack: null, blocking: false, sitting: true,
  });

  // Sit the camera on the fire's OPEN side -- a free orbit swings the trunk
  // between us and the hero for half of every revolution.
  const away = Math.atan2(
    camp.fire.position.x - camp.tree.position.x,
    camp.fire.position.z - camp.tree.position.z
  );
  const a = away + Math.sin(titleT * 0.11) * 0.40;
  const r = 4.3 + Math.sin(titleT * 0.07) * 0.35;
  const cx = camp.fire.position.x + Math.sin(a) * r;
  const cz = camp.fire.position.z + Math.cos(a) * r;
  camera.position.set(cx, 2.05 + Math.sin(titleT * 0.13) * 0.12, cz);
  const mid = _v.set(
    (camp.seat.x + camp.fire.position.x) / 2,
    0.95,
    (camp.seat.z + camp.fire.position.z) / 2
  );
  // aim slightly off-centre so the pair sits in the gap between the UI panels
  const dx = mid.x - cx, dz = mid.z - cz;
  const len = Math.hypot(dx, dz) || 1;
  camera.lookAt(mid.x - (-dz / len) * 0.5, mid.y, mid.z - (dx / len) * 0.5);
}

function updatePaused(dt) {
  playerAnim.update(dt, {
    speed: 0, maxSpeed: 6, grounded: controller.grounded, vy: 0, running: false,
    hunch: 0, height: 0, attack: null, blocking: false,
    hurt: mode === 'death',
  });
  playerRig.root.position.copy(controller.position);
  playerRig.root.rotation.y = controller.yaw;
  if (mode === 'death') {
    playerRig.root.rotation.z = Math.min(1.4, playerRig.root.rotation.z + dt * 3);
  }
  follow.update(dt, input, controller.camState);
}

function updatePlay(dt) {
  respawnGrace = Math.max(0, respawnGrace - dt);

  if (input.pressed('KeyH')) sidebar.classList.toggle('hidden');
  if (input.pressedAction('interact')) doInteract();
  if (input.pressedAction('drinkPotion')) drinkPotion();
  if (input.pressedAction('throwPotion')) potionSlotTwo();
  if (input.pressedAction('useFood')) eatFood();
  // BLOCK doubles as the spell key once a wizard has something bound to it
  if (input.pressedAction('block') && controller.classId === 'wizard'
      && boundSpell(progress)) {
    castBoundSpell();
  }
  if (input.pressedAction('satchel')) { openSatchel(); return; }
  if (input.pressedAction('levelSelect') && levelSelectAvailable()) {
    openLevelSelect(); return;
  }
  // TAB cycles targets; TAB TAB releases the lock entirely for free look.
  if (input.doubleTapped('cycleTarget')) {
    lockSuppress = 8;
    setLock(null);
    hud.setFreeLook(true);
  } else if (input.pressedAction('cycleTarget')) {
    if (lockSuppress > 0) { lockSuppress = 0; hud.setFreeLook(false); }
    cycleTarget();
  }
  if (lockSuppress > 0) {
    lockSuppress = Math.max(0, lockSuppress - dt);
    if (lockSuppress === 0) hud.setFreeLook(false);
  }

  spawnNearbyEnemies();

  if (!lockEnemy || lockEnemy.dead || lockEnemy.distTo(controller.position) > 21) autoLock();
  else if (Math.random() < 0.06) autoLock();

  if (!riding) controller.update(dt, input, follow, lockTarget, {
    onStrike, onNoResource, onChannel, onChannelEnd,
    onFreezeTick: () => {
      _v.copy(controller.position); _v.y += 1.7;
      combat.popup(_v, '-1', 'hurt');
    },
    onFreezeBreak: () => {
      _v.copy(controller.position); _v.y += 1.0;
      combat.hitSpark(_v, '#bfe8ff', 10);
      follow.shake(0.16, 0.24);
    },
  });
  // the freeze ticks its own damage, so death has to be polled here too
  if (controller.dead && mode === 'play') onPlayerDeath();
  updateIceBlock();
  weather?.update(dt, camera);
  updateVillagers(dt);
  updateRide(dt);
  updateKeyInHand();
  updateSpells(dt);
  updateCoop(dt);

  // cover only counts while crouched -- standing in a bush hides nothing
  controller.hidden = controller.crouching &&
    world.inCover(controller.position.x, controller.position.z);

  playerAnchor.position.copy(controller.position);
  playerAnchor.position.y += 1.0;

  playerRig.root.position.copy(controller.position);
  playerRig.root.rotation.y = controller.yaw;
  playerRig.root.rotation.z = 0;
  playerAnim.update(dt, controller.animState());

  if (controller.justLanded && controller.landImpact > 0.55) {
    follow.shake(0.10 * controller.landImpact, 0.18);
  }

  /* the dragon's breath: follow its mouth, and splash off a raised shield */
  if (dragonFlame) {
    if (dragonFlame.life <= 0 || !dragonFlame.owner || dragonFlame.owner.dead) {
      dragonFlame = null;
    } else {
      const d = dragonFlame.owner;
      _v.set(d.position.x, d.position.y + d.stats.lookHeight * 0.85, d.position.z);
      _dir.set(Math.sin(d.yaw), -0.10, Math.cos(d.yaw)).normalize();
      dragonFlame.obj.position.copy(_v);
      dragonFlame.obj.lookAt(_v.x + _dir.x * 5, _v.y + _dir.y * 5, _v.z + _dir.z * 5);

      // If the knight has the shield up and is facing it, the fire STOPS at
      // the shield and washes outward instead of engulfing him.
      const dx = controller.position.x - _v.x;
      const dz = controller.position.z - _v.z;
      const dist = Math.hypot(dx, dz);
      const inLine = dist > 0.2 &&
        ((dx / dist) * _dir.x + (dz / dist) * _dir.z) > Math.cos(dragonFlame.halfAngle + 0.12);
      const facingIt = controller.facing.x * -_dir.x + controller.facing.z * -_dir.z > 0.15;

      if (!dragonFlame.roost && controller.blocking && facingIt && inLine
          && dist < dragonFlame.range) {
        dragonFlame.setLength(dist - 0.35);
        if (Math.random() < 0.55) {
          _v2.set(
            controller.position.x - controller.facing.x * 0.5, 1.05,
            controller.position.z - controller.facing.z * 0.5
          );
          _v2.x += controller.facing.x * 0.9;
          _v2.z += controller.facing.z * 0.9;
          combat.hitSpark(_v2, '#e8ffb0', 3);
        }
      } else {
        dragonFlame.setLength(dragonFlame.range);
      }
    }
  }

  /* flame: follow the hand, tick damage */
  if (activeFlame) {
    if (activeFlame.life <= 0) {
      activeFlame = null;
    } else {
      if (flameMode === 'ring') {
        activeFlame.obj.position.copy(controller.position);
      } else {
        const from = handPos('L', _v);
        aimDir(_dir);
        activeFlame.obj.position.copy(from);
        activeFlame.obj.lookAt(from.x + _dir.x * 5, from.y + _dir.y * 5, from.z + _dir.z * 5);
      }
      flameTick -= dt;
      if (flameTick <= 0) {
        flameTick = 0.14;
        const targets = flameMode === 'ring'
          ? combat.radiusTargets(controller.position, activeFlame.radius, enemies)
          : combat.coneTargets(handPos('L', _v), aimDir(_dir),
            activeFlame.range, activeFlame.halfAngle, enemies);
        for (const e of targets) {
          hitEnemy(e, Math.max(1, Math.round(activeFlame.damage * 0.32)), 'special');
        }
      }
    }
  }

  for (const c of camps.values()) c.update(dt);
  for (const e of enemies) e.update(dt, controller, ctx);

  for (const c of world.chests) {
    if (!c.opened) continue;
    c.lid.rotation.x = Math.max(-1.9, c.lid.rotation.x - dt * 4);
  }

  for (let i = thrown.length - 1; i >= 0; i--) {
    const p = thrown[i];
    const was = p.done;
    p.update(dt);
    if (p.done && !was) p.onBurst?.();
    if (p.done) thrown.splice(i, 1);
  }

  loot.update(dt, controller, inventory);
  combat.update(dt, enemies, controller, camera);
  follow.update(dt, input, controller.camState);

  // Keep the camera inside the valley. The cliffs are decoration rather than
  // raycast colliders, so without this it slides into the rock and the screen
  // fills with the dark inside of a cliff face.
  {
    const cz = camera.position.z;
    const cxCentre = world.valleyCentre(cz);
    const limit = world.valleyHalfWidth(cz) - 1.2;
    const off = camera.position.x - cxCentre;
    if (off > limit) camera.position.x = cxCentre + limit;
    else if (off < -limit) camera.position.x = cxCentre - limit;
  }

  updateInteractions();
  updateArea();
  updateCheckpoints();
  updateGate();
  updateBossWaves();

  if (checkpointT > 0) {
    checkpointT -= dt;
    if (checkpointT <= 0) checkpointMsg.classList.remove('show');
  }

  const cluster = groupCluster();
  const canThrow = controller.classId !== 'archer' && inventory.bestBad();
  hud.setGroupLock(cluster && cluster.length > 1 && canThrow ? cluster.length : 0);

  // worst alert level nearby, for the stealth readout
  let spotted = 'calm';
  for (const e of enemies) {
    if (e.dead || e.distTo(controller.position) > 26) continue;
    const l = e.alertLevel;
    if (l === 'alert') { spotted = 'alert'; break; }
    if (l === 'suspicious') spotted = 'suspicious';
  }

  hud.update(dt, {
    player: controller, progress, inventory, enemies,
    lockTarget, camera, boss: boss && !boss.dead ? boss : null, spotted,
    bossName: level?.bossName,
  });
}

crazygames.init();
toTitle();
frame();

window.__dmg = damagePlayer;   // test hook: drive the damage path directly
window.__Box3 = THREE.Box3;   // test hook
window.DUNGEONQUEST = {
  scene, controller, follow, pipeline, progress, inventory, combat, loot,
  cutscene, travel, levelMap,
  // getters, not captured values -- `world` and `level` are replaced whenever
  // the campaign moves on, and a stale reference silently reads the old level
  get world() { return world; },
  get level() { return level; },
  get levelIdx() { return levelIdx; },
  get enemies() { return enemies; },
  get player() { return playerRig; },
  get mode() { return mode; },
  get boss() { return boss; },
  get riding() { return riding; },
  get player2() { return player2; },
  get rideDragon() { return rideDragon; },
  get villagers() { return villagers; },
  get checkpoint() { return checkpoint; },
  get gateOpen() { return gateOpen; },
  enemiesRemaining,
  startRun, openShop, loadLevel, openMirror, buildPlayer, input, padNav,
  rebuildPlayer: () => {
    const y = playerRig.root.rotation.y;
    buildPlayer(controller.classId, progress.look || {});
    playerRig.root.position.copy(controller.position);
    playerRig.root.rotation.y = y;
  },
};
window.QOTD = window.DUNGEONQUEST;   // legacy alias -- the e2e scripts use it
populate();
setupSecret();
console.log('DUNGEON QUEST — level 1 ready');
