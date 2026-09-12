// Player movement and action states.
//
// Movement keeps the quality-of-life rules that separate a good 3D game from a
// bad one: coyote time, a jump buffer, variable jump height, step-up. On top
// of that sits an action machine for attack / special / block / dash, and the
// per-class resources those actions spend.
import * as THREE from 'three';
import { MANA_COST, ARROW_COST } from '../game/progress.js';

const GRAVITY = -24.0;
const JUMP_VELOCITY = 8.2;
// Deliberately slower than the first pass: the valley should take a while to
// cross, and mobs need time to notice you.
const WALK_SPEED = 2.7;
const RUN_SPEED = 5.1;
const CROUCH_SPEED = 1.5;
const GROUND_ACCEL = 38.0;
const AIR_ACCEL = 13.0;
const GROUND_FRICTION = 16.0;
const AIR_FRICTION = 0.8;
const TURN_RATE = 13.0;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.14;
const RADIUS = 0.32;
const STEP_HEIGHT = 0.42;

// Dashing FORWARD is a commitment -- it closes ground and it costs you.
const DASH_SPEED = 15.0;
const DASH_TIME = 0.20;
const DASH_COOLDOWN = 1.15;
// The sidestep dart: shorter and snappier than the knight's dash.
const DART_SPEED = 20.0;
const DART_TIME = 0.15;
const DART_COOLDOWN = 0.48;
// Darting BACK is an escape, not an attack, so it reads as a dart rather than
// a dash: same snap, same short lock, and it cancels whatever you were doing.
const BACK_SPEED = 19.0;
const BACK_TIME = 0.15;
const BACK_COOLDOWN = 0.55;

/** Per-class action timings. Everything reads from here. */
export const ACTIONS = {
  knight: {
    attack: { style: 'slash', windup: 0.14, strike: 0.16, recover: 0.26, range: 2.4, arc: 1.10, cooldown: 0.18 },
    special: { style: 'jab', windup: 0.14, strike: 0.15, recover: 0.36, range: 3.2, arc: 0.45, cooldown: 2.2, lunge: 6.5 },
  },
  wizard: {
    // Bolts cost mana, so the cooldown can stay short -- the pool is the limit.
    attack: { style: 'cast', windup: 0.20, strike: 0.10, recover: 0.30, cooldown: 0.34 },
    // The flame is now a CLOSE-RANGE cone, not a long beam.
    special: { style: 'beam', windup: 0.24, strike: 0.55, recover: 0.45, cooldown: 7.0, range: 5.2 },
  },
  archer: {
    // Slow, deliberate shots. A full draw-and-loose is about 1.2s.
    attack: { style: 'shoot', windup: 0.30, strike: 0.09, recover: 0.30, cooldown: 0.52 },
    special: { style: 'twinshot', windup: 0.34, strike: 0.12, recover: 0.34, cooldown: 3.0 },
  },
};

/**
 * OUT OF MANA, OUT OF ARROWS.
 *
 * A wizard holding a staff and an archer holding a bow are both holding a
 * stick, and standing there being eaten because a number hit zero is not a
 * game. So the basic attack falls back to a swing. It does ONE damage --
 * enough to finish something already dying, never enough to be a strategy.
 * The special has no fallback: that one you pay for.
 */
export const DESPERATE = {
  style: 'slash', windup: 0.16, strike: 0.14, recover: 0.32,
  range: 2.2, arc: 1.00, cooldown: 0.46, desperate: true, damage: 1,
};

function dampAngle(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}

export class PlayerController {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.yaw = 0;

    this.grounded = true;
    this.groundY = 0;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.speed = 0;
    this.running = false;
    this.crouching = false;
    this.hidden = false;          // set by the world: in cover AND crouched

    this.justLanded = false;
    this.justJumped = false;
    this.landImpact = 0;

    this.classId = 'knight';
    this.stats = null;
    this.hp = 100;
    this.maxHp = 100;
    this.mana = 0;
    this.maxMana = 0;
    this.dead = false;
    this.action = null;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.blocking = false;
    this.invuln = 0;
    this.hurtT = 0;
    this.lunge = 0;

    // FROZEN: aerated ice sets around you. A shield is no use against it --
    // there is nothing to block, you are simply encased. You break out by
    // struggling (changing direction), and it costs you a point a second.
    // CHANNELLING: holding attack and special together at the same time. It
    // is the same gesture for both ranged classes and it means the same thing
    // -- stop fighting and top your ammunition back up by hand.
    //   archer  : three seconds pulls the arrows out of nearby bodies
    //   wizard  : +2 mana a second for as long as you hold it
    this.channelT = 0;
    this.channelGrace = 0;
    this.channelling = false;
    this.frozen = 0;          // seconds of ice left if you do nothing
    this.struggle = 0;        // how far through breaking out you are, 0..1
    this._lastWish = 0;
    this.freezeTick = 0;
    this.dashT = 0;
    this.dashCooldown = 0;
    this.dashSpeed = DASH_SPEED;
    this.dashDir = new THREE.Vector3();

    this.inventory = null;        // set by main; the archer reads arrows from it
    this.regenPool = 0;           // food healing, applied over time
    this.regenRate = 0;
    this.manaPool = 0;
    this.manaRate = 0;

    this._wish = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  configure(classId, stats) {
    this.classId = classId;
    this.stats = stats;
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.maxMana = stats.maxMana;
    this.mana = stats.maxMana;
    this.specialMax = ACTIONS[classId].special.cooldown;
    this.dead = false;
    if (this.inventory) {
      this.inventory.maxArrows = stats.maxArrows;
      this.inventory.arrows = Math.min(this.inventory.arrows, stats.maxArrows);
    }
  }

  reset(x = 0, z = 0) {
    this.position.set(x, this.world.groundHeight(x, z), z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.action = null;
    this.blocking = false;
    this.crouching = false;
    this.dead = false;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.invuln = 0;
    this.dashT = 0;
    this.regenPool = 0;
    this.manaPool = 0;
  }

  get busy() { return this.action !== null; }
  get dashing() { return this.dashT > 0; }
  get usesMana() { return this.maxMana > 0; }

  /** Only the two ranged classes have anything to channel FOR. */
  get usesChannel() { return this.classId === 'archer' || this.classId === 'wizard'; }
  get usesArrows() { return this.classId === 'archer'; }

  /** Can the given action be paid for right now? */
  canAfford(kind) {
    if (this.usesMana) return this.mana >= MANA_COST[kind];
    if (this.usesArrows) return (this.inventory?.arrows ?? 0) >= ARROW_COST[kind];
    return true;
  }

  pay(kind) {
    if (this.usesMana) { this.mana = Math.max(0, this.mana - MANA_COST[kind]); return true; }
    if (this.usesArrows) return this.inventory.takeArrows(ARROW_COST[kind]);
    return true;
  }

  takeDamage(amount, fromPos, type = 'hit') {
    if (this.dead || this.invuln > 0) return 0;
    let dmg = amount;
    if (this.blocking) {
      // Blocking only works against things in FRONT of you.
      let frontal = true;
      if (fromPos) {
        const dx = fromPos.x - this.position.x, dz = fromPos.z - this.position.z;
        const d = Math.hypot(dx, dz) || 1;
        frontal = (dx / d) * this.facing.x + (dz / d) * this.facing.z > 0.15;
      }
      // Ice is the exception: it is not a blow arriving, it is the air itself
      // setting around you, so there is nothing for a shield to be between.
      if (frontal && type !== 'ice') {
        dmg *= 1 - (this.stats?.blockCut ?? 0.5);
        // A steel shield is exactly what you want between you and dragonfire:
        // the knight can stand in the breath and survive it.
        if (type === 'flame' && this.classId === 'knight') dmg *= 0.22;
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.invuln = this.blocking ? 0.25 : 0.55;
    this.hurtT = 0.3;
    if (fromPos) {
      this._tmp.set(this.position.x - fromPos.x, 0, this.position.z - fromPos.z);
      if (this._tmp.lengthSq() > 0.0001) {
        this._tmp.normalize().multiplyScalar(this.blocking ? 2.2 : 4.6);
        this.velocity.x += this._tmp.x;
        this.velocity.z += this._tmp.z;
      }
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.action = null; }
    return dmg;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  restoreMana(n) { this.mana = Math.min(this.maxMana, this.mana + n); }

  /** Encase the player in ice for n seconds. Repeat hits top it up, not stack. */
  freeze(seconds = 3.0) {
    if (this.dead) return false;
    const was = this.frozen > 0;
    this.frozen = Math.max(this.frozen, seconds);
    if (!was) {
      this.struggle = 0;
      this.freezeTick = 1.0;
      this.velocity.set(0, 0, 0);
      this.action = null;
      this.dashT = 0;
    }
    return !was;
  }

  get isFrozen() { return this.frozen > 0; }

  /** Food heals gradually rather than instantly. */
  eat(healAmount, seconds, manaAmount = 0) {
    this.regenPool += healAmount;
    this.regenRate = healAmount / Math.max(0.5, seconds);
    if (manaAmount) {
      this.manaPool += manaAmount;
      this.manaRate = manaAmount / Math.max(0.5, seconds);
    }
  }

  startAction(kind) {
    if (this.busy || this.dead || this.dashing) return false;
    let def = ACTIONS[this.classId][kind];
    if (!def) return false;
    if (kind === 'attack' && this.attackCooldown > 0) return false;
    if (kind === 'special' && this.specialCooldown > 0) return false;
    if (!this.canAfford(kind)) {
      // empty pool, empty quiver: swing the stick instead
      if (kind !== 'attack' || !this.usesChannel) return false;
      def = DESPERATE;
    }
    this.action = { kind, def, phase: 'windup', t: 0, fired: false };
    this.blocking = false;
    this.crouching = false;
    if (kind === 'special' && def.lunge) this.lunge = def.lunge;
    return true;
  }

  /**
   * Evasive burst.
   *  - forward/back (double tap W / S) is the KNIGHT's dash: long, and its
   *    reward for having to fight up close.
   *  - left/right (double tap A / D) is the DART, and every class has it,
   *    because dodging a dragon's flame is not a knight-only problem.
   */
  startDash(sign, lateral = false) {
    if (!lateral && this.classId !== 'knight') return false;
    if (this.dashCooldown > 0 || this.dashing || this.dead) return false;
    // Backward and sideways are both ESCAPES. Only the forward lunge commits.
    const evasive = lateral || sign < 0;
    // A dodge you cannot start because you are mid-swing is a dodge that feels
    // broken -- but a dodge that EATS a swing already on its way to the target
    // is worse. An escape cancels the wind-up (you changed your mind) and the
    // recovery (nothing is happening), and waits out the strike itself, which
    // is under two tenths of a second.
    if (this.busy) {
      if (!evasive) return false;
      if (this.action && this.action.phase === 'strike') return false;
      this.action = null;
    }
    // Kill existing momentum so the burst starts from zero instead of blending
    // out of a walk -- that blend is what read as lag.
    this.velocity.x = 0;
    this.velocity.z = 0;

    const time = lateral ? DART_TIME : (evasive ? BACK_TIME : DASH_TIME);
    this.dashT = time;
    this.dashSpeed = lateral ? DART_SPEED : (evasive ? BACK_SPEED : DASH_SPEED);
    this.dashCooldown = (lateral ? DART_COOLDOWN : (evasive ? BACK_COOLDOWN : DASH_COOLDOWN))
      * (this.stats?.dashCooldown ?? 1);

    if (lateral) {
      // right = forward x up
      this.dashDir.set(-Math.cos(this.yaw) * sign, 0, Math.sin(this.yaw) * sign);
    } else {
      this.dashDir.set(this.facing.x * sign, 0, this.facing.z * sign);
    }
    this.invuln = Math.max(this.invuln, time + 0.06);
    return true;
  }

  update(dt, input, cam, lockTarget, hooks = {}) {
    this.justLanded = false;
    this.justJumped = false;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    /* regeneration from food */
    if (this.regenPool > 0) {
      const tick = Math.min(this.regenPool, this.regenRate * dt);
      this.heal(tick);
      this.regenPool -= tick;
    }
    if (this.manaPool > 0) {
      const tick = Math.min(this.manaPool, this.manaRate * dt);
      this.restoreMana(tick);
      this.manaPool -= tick;
    }
    /* passive mana regen */
    if (this.usesMana && this.stats) {
      this.restoreMana(this.stats.manaRegen * dt);
    }

    if (this.dead) {
      this.velocity.x *= 1 - Math.min(1, 8 * dt);
      this.velocity.z *= 1 - Math.min(1, 8 * dt);
      this.moveHorizontal(this.velocity.x * dt, this.velocity.z * dt);
      this.position.y = this.world.groundHeight(this.position.x, this.position.z, this.position.y);
      this.speed = 0;
      return;
    }

    /* ---------------- frozen ----------------
     * Encased. You cannot move, attack, block or dash; you STRUGGLE out by
     * changing direction, and it costs a point a second while you are in there.
     */
    if (this.frozen > 0) {
      this.frozen -= dt;
      this.blocking = false;
      this.crouching = false;
      this.action = null;
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      this.position.y = this.world.groundHeight(this.position.x, this.position.z, this.position.y);

      // one damage a second, ignoring invulnerability -- the ice is already on you
      this.freezeTick -= dt;
      if (this.freezeTick <= 0) {
        this.freezeTick = 1.0;
        this.hp -= 1;
        this.hurtT = 0.2;
        hooks.onFreezeTick?.();
        // main polls controller.dead after damage; same convention here
        if (this.hp <= 0) { this.hp = 0; this.dead = true; this.action = null; }
      }

      // Struggling: it is the CHANGE of direction that cracks it, not holding
      // one key down. Mash left-right, or forward-back.
      const wish = (input.action('moveUp') ? 1 : 0) | (input.action('moveDown') ? 2 : 0)
        | (input.action('moveLeft') ? 4 : 0) | (input.action('moveRight') ? 8 : 0);
      if (wish && wish !== this._lastWish) this.struggle += 0.14;
      this._lastWish = wish;
      if (input.pressedAction('jump') || input.pressedAction('attack')) this.struggle += 0.10;
      this.struggle = Math.min(1, this.struggle);

      if (this.struggle >= 1 || this.frozen <= 0) {
        this.frozen = 0;
        this.struggle = 0;
        this.invuln = Math.max(this.invuln, 0.4);
        hooks.onFreezeBreak?.();
      }
      return;
    }

    /* ---- channelling ----
     * Both action buttons at once. Checked BEFORE the ordinary action input,
     * because holding the two together would otherwise fire an attack on the
     * frame the second one goes down and then never let go of it.
     */
    /* Nobody presses two keys on the same frame.
     *
     * Whichever one lands first fires its action, and by the time the second
     * arrives the character is busy and the channel can never start -- so
     * trying to channel cost a special and its mana every time. The window is
     * only ten or twenty milliseconds but it is the common case, not the rare
     * one.
     *
     * The fix leans on WHEN the cost is paid: nothing is spent until the
     * strike, so an action still in its wind-up can be thrown away for free.
     * Hold both and whatever just started is simply abandoned.
     */
    const bothHeld = this.usesChannel
      && input.action('attack') && input.action('special');
    if (bothHeld && this.action && this.action.phase === 'windup') {
      this.action = null;
    }
    const wantChannel = bothHeld && !this.busy && !this.dashing && this.grounded;
    if (wantChannel) {
      this.channelT += dt;
      this.channelGrace = 0.28;
      this.channelling = true;
      hooks.onChannel?.(this, this.channelT, dt);
    } else if (this.channelling) {
      // A single frame where you are momentarily airborne, or where the two
      // key states are read a frame apart, must not throw away two and a half
      // seconds of holding. Give it a moment before it counts as let go.
      this.channelGrace -= dt;
      if (this.channelGrace <= 0) {
        hooks.onChannelEnd?.(this);
        this.channelT = 0;
        this.channelling = false;
      }
    }

    /* ---------------- action input ---------------- */
    if (!wantChannel) {
      if (input.pressedAction('attack')) {
        if (!this.startAction('attack') && !this.canAfford('attack')) hooks.onNoResource?.('attack');
      }
      if (input.pressedAction('special')) {
        if (!this.startAction('special') && !this.canAfford('special')) hooks.onNoResource?.('special');
      }
    }
    if (input.doubleTapped('moveUp')) this.startDash(1);
    if (input.doubleTapped('moveDown')) this.startDash(-1);
    if (input.doubleTapped('moveRight')) this.startDash(1, true);
    if (input.doubleTapped('moveLeft')) this.startDash(-1, true);

    this.blocking = !this.busy && !this.dashing && input.action('block') && this.grounded;
    this.crouching = !this.busy && !this.dashing && !this.blocking
      && input.action('crouch') && this.grounded;

    /* ---------------- action machine ---------------- */
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const dur = a.def[a.phase];
      if (a.phase === 'strike' && !a.fired) {
        a.fired = true;
        if (a.def.desperate || this.pay(a.kind)) hooks.onStrike?.(a.kind, a.def);
      }
      if (a.t >= dur) {
        a.t = 0;
        if (a.phase === 'windup') a.phase = 'strike';
        else if (a.phase === 'strike') a.phase = 'recover';
        else {
          const drawMod = this.usesArrows ? (this.stats?.drawSpeed ?? 1) : 1;
          if (a.kind === 'attack') this.attackCooldown = (a.def.cooldown ?? 0.1) * drawMod;
          else this.specialCooldown = a.def.cooldown ?? 1.5;
          this.action = null;
        }
      }
    }

    /* ---------------- movement ---------------- */
    const ax = input.axis();
    const f = cam.forward, r = cam.right;
    this._wish.set(f.x * ax.y + r.x * ax.x, 0, f.z * ax.y + r.z * ax.x);
    const wishLen = this._wish.length();
    if (wishLen > 0.001) this._wish.multiplyScalar(1 / wishLen);

    this.running = input.action('run') && !this.crouching;
    const statSpeed = this.stats?.speed ?? 1;
    let maxSpeed = (this.running ? RUN_SPEED : WALK_SPEED) * statSpeed * Math.min(1, wishLen);
    if (this.crouching) maxSpeed = CROUCH_SPEED * statSpeed * Math.min(1, wishLen);
    if (this.blocking) maxSpeed *= 0.38;
    if (this.busy) maxSpeed *= 0.26;

    if (this.dashing) {
      this.dashT -= dt;
      this.velocity.x = this.dashDir.x * this.dashSpeed * (this.stats?.dashPower ?? 1);
      this.velocity.z = this.dashDir.z * this.dashSpeed * (this.stats?.dashPower ?? 1);
    } else {
      const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
      if (wishLen > 0.001) {
        this.velocity.x += this._wish.x * accel * dt;
        this.velocity.z += this._wish.z * accel * dt;
        const h = Math.hypot(this.velocity.x, this.velocity.z);
        if (h > maxSpeed && this.lunge <= 0) {
          const k = maxSpeed / h;
          this.velocity.x *= k;
          this.velocity.z *= k;
        }
      } else {
        const fr = this.grounded ? GROUND_FRICTION : AIR_FRICTION;
        const drop = 1 - Math.min(1, fr * dt);
        this.velocity.x *= drop;
        this.velocity.z *= drop;
      }
    }

    if (this.lunge > 0) {
      this.velocity.x += Math.sin(this.yaw) * this.lunge * dt * 9;
      this.velocity.z += Math.cos(this.yaw) * this.lunge * dt * 9;
      this.lunge = Math.max(0, this.lunge - dt * 26);
    }

    /* ---------------- facing ---------------- */
    if (lockTarget) {
      this._tmp.set(
        lockTarget.position.x - this.position.x, 0,
        lockTarget.position.z - this.position.z
      );
      if (this._tmp.lengthSq() > 0.0001) {
        this._tmp.normalize();
        this.yaw = dampAngle(this.yaw, Math.atan2(this._tmp.x, this._tmp.z),
          this.busy ? 18 : 12, dt);
      }
    } else if (wishLen > 0.001 && !this.busy) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this._wish.x, this._wish.z), TURN_RATE, dt);
    }
    this.facing.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    /* ---------------- jump ---------------- */
    if (input.pressedAction('jump')) this.jumpBuffer = JUMP_BUFFER;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.blocking && !this.crouching) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.justJumped = true;
    }

    const holding = input.action('jump');
    if (!holding && this.velocity.y > 0) this.velocity.y += GRAVITY * 1.7 * dt;
    else this.velocity.y += GRAVITY * dt;
    if (this.velocity.y < -30) this.velocity.y = -30;

    /* ---------------- integrate ---------------- */
    this.moveHorizontal(this.velocity.x * dt, this.velocity.z * dt);
    this.position.y += this.velocity.y * dt;

    const gy = this.world.groundHeight(this.position.x, this.position.z, this.position.y);
    this.groundY = gy;
    if (this.position.y <= gy + 0.001 && this.velocity.y <= 0) {
      if (!this.grounded) {
        this.justLanded = true;
        this.landImpact = Math.min(1, -this.velocity.y / 14);
      }
      this.position.y = gy;
      this.velocity.y = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  moveHorizontal(dx, dz) {
    const w = this.world;
    // If we START inside something, do not test at all -- just move and let
    // depenetration sort it out. Testing from inside rejects every direction
    // and welds the player to the spot.
    const embedded = w.blocked(this.position.x, this.position.z,
      this.position.y, RADIUS, STEP_HEIGHT);

    const nx = this.position.x + dx;
    if (embedded || !w.blocked(nx, this.position.z, this.position.y, RADIUS, STEP_HEIGHT)) {
      this.position.x = nx;
    } else {
      this.velocity.x *= 0.2;
    }
    const nz = this.position.z + dz;
    if (embedded || !w.blocked(this.position.x, nz, this.position.y, RADIUS, STEP_HEIGHT)) {
      this.position.z = nz;
    } else {
      this.velocity.z *= 0.2;
    }

    const fixed = w.depenetrate(this.position, RADIUS, STEP_HEIGHT);
    this.position.x = fixed.x;
    this.position.z = fixed.z;
  }

  /** How loud/visible the player is right now, 0..1. Enemy AI multiplies by this. */
  get visibility() {
    let v = 1;
    if (this.crouching) v *= 0.42 * (this.stats?.stealth ?? 1);
    if (this.hidden) v *= 0.15;
    if (this.running) v *= 1.35;
    return v;
  }

  animState() {
    return {
      speed: this.speed,
      maxSpeed: RUN_SPEED * (this.stats?.speed ?? 1),
      grounded: this.grounded,
      vy: this.velocity.y,
      running: this.running,
      justLanded: this.justLanded,
      landImpact: this.landImpact,
      hunch: 0,
      height: this.position.y - this.groundY,
      blocking: this.blocking,
      crouching: this.crouching,
      dashing: this.dashing,
      // the animator needs to know WHICH channel, not just that there is one
      channel: this.channelling
        ? { kind: this.classId, t: this.channelT }
        : null,
      hurt: this.hurtT > 0.2,
      attack: this.action
        ? {
          style: this.action.def.style,
          phase: this.action.phase,
          k: Math.min(1, this.action.t / Math.max(0.01, this.action.def[this.action.phase])),
        }
        : null,
    };
  }

  get camState() {
    return {
      position: this.position,
      facing: this.facing,
      speed: this.speed,
      grounded: this.grounded,
      groundY: this.groundY,
    };
  }
}
