// Enemy behaviour.
//
// Every mob runs one state machine -- patrol / suspicious / chase / windup /
// strike / recover -- and the differences come out of its stats block. On top
// of that sits a DETECTION model (sight cone, hearing, an alert meter) so that
// crouching and cover actually mean something, and CAMPS so a group notices
// together instead of one at a time.
import * as THREE from 'three';
import { buildEnemy } from '../art/enemies.js';
import {
  buildGreenDragon, buildRedDragon, buildIceDragon, buildBlackDragon,
  DragonAnimator,
} from '../art/dragon.js';

/** Every dragon shares one skeleton and one animator; only the stats differ. */
const DRAGONS = {
  greenDragon: buildGreenDragon,
  redDragon: buildRedDragon,
  iceDragon: buildIceDragon,
  blackDragon: buildBlackDragon,
};
import { makeAnimator } from '../player/animator.js';
import { blob } from '../art/shapes.js';
import * as T from '../art/textures.js';
import { ShadowMonsterAnimator } from '../art/darkEnemies.js';

const GRAVITY = -26;
const _v = new THREE.Vector3();

function dampAngle(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}

/* ---------------- camps ---------------- */

/**
 * A camp is a group that shares awareness. Alert one and the whole camp turns,
 * which is what forces the player to think before walking in.
 */
export class Camp {
  constructor(x, z, radius = 7) {
    this.center = new THREE.Vector3(x, 0, z);
    this.radius = radius;
    this.members = [];
    this.alerted = false;
    this.alarmT = 0;
  }

  add(enemy) {
    enemy.camp = this;
    this.members.push(enemy);
    return enemy;
  }

  /** One member spotted something: everyone else converges. */
  raise(pos) {
    this.alerted = true;
    this.alarmT = 12;
    for (const m of this.members) {
      if (m.dead) continue;
      m.lastKnown.copy(pos);
      m.alertMeter = Math.max(m.alertMeter, 0.85);
      if (m.state === 'patrol') m.setState('suspicious');
    }
  }

  get alive() { return this.members.filter(m => !m.dead).length; }

  update(dt) {
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      if (this.alarmT <= 0) this.alerted = false;
    }
  }
}

/* ---------------- enemy ---------------- */

/* ---------------- melee allowance ---------------- */
// Attacks you dodge by TIMING rather than by standing somewhere else.
const PHYSICAL = new Set(['melee', 'leap', 'lash']);
let physicalRead = 1;       // mob swings
let bossPhysicalRead = 1;   // the dragon tail sweep, which is already slow

/**
 * Called whenever the player class changes. Only the knight gets the extra
 * window -- the wizard and archer already dodge by keeping their distance.
 */
export function setPlayerClass(classId) {
  const knight = classId === 'knight';
  physicalRead = knight ? 1.45 : 1;
  bossPhysicalRead = knight ? 1.2 : 1;
}

export class Enemy {
  constructor(kind, scene, world, x, z, opts = {}) {
    if (DRAGONS[kind]) {
      this.entity = DRAGONS[kind]();
      this.animator = new DragonAnimator(this.entity);
    } else {
      this.entity = buildEnemy(kind);
      this.animator = this.entity.arms && this.entity.arms.L && this.entity.arms.L.glow
        ? new ShadowMonsterAnimator(this.entity)
        : makeAnimator(this.entity);
    }
    this.kind = kind;
    this.root = this.entity.root;
    this.stats = this.entity.stats;
    this.world = world;
    this.scene = scene;

    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this.dead = false;
    this.deathT = 0;
    this.lootable = 0;            // arrows recoverable from the body
    this.looted = false;
    // set by the shrine: a kill banked at a checkpoint never comes back
    this.banked = false;
    this.arrowsStuck = 0;

    this.state = 'patrol';
    this.t = 0;
    this.cooldown = Math.random() * 1.5;
    this.commandCooldown = 3;
    this.chargeCooldown = 4;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.speed = 0;
    this.vy = 0;
    this.airborne = false;
    this.leapHit = false;
    this.knock = new THREE.Vector3();
    this.hurtT = 0;
    this.rallied = 0;             // speed boost from a commander

    this.alertMeter = 0;
    this.lastKnown = new THREE.Vector3(x, 0, z);
    this.homeX = x;
    this.homeZ = z;
    this.camp = null;
    this.patrolT = Math.random() * 4;
    this.patrolAngle = Math.random() * Math.PI * 2;
    this.attackKind = 'melee';
    this.flying = false;
    this.altitude = 0;
    this.flyCooldown = (this.stats.flyCooldown ?? 16) * 0.5;
    // it does not open with the summoning -- you get a straight fight first
    this.summonCooldown = (this.stats.summon?.cooldown ?? 26) * 0.62;
    // the wizard can freeze THEM now, not only the other way round
    this.frozen = 0;
    this.passes = 0;

    this.root.position.set(x, world.groundHeight(x, z), z);
    // remembered so a respawn can put it back exactly here
    this.startYaw = this.yaw;
    this.root.rotation.y = this.yaw;
    this.root.userData.lookHeight = this.stats.lookHeight;
    this.root.userData.enemy = this;
    scene.add(this.root);
  }

  get position() { return this.root.position; }
  get isBoss() { return !!this.stats.boss; }
  get tier() { return this.stats.tier; }

  distTo(p) {
    return Math.hypot(p.x - this.root.position.x, p.z - this.root.position.z);
  }

  takeDamage(n, fromPos, source) {
    if (this.dead) return 0;
    this.hp -= n;
    this.hurtT = 0.22;
    // Being hit is proof enough that something is there.
    this.alertMeter = 1;
    if (fromPos) this.lastKnown.set(fromPos.x, 0, fromPos.z);
    if (this.state === 'patrol' || this.state === 'suspicious') this.setState('chase');
    this.camp?.raise(fromPos || this.position);

    if (source === 'arrow') this.arrowsStuck++;

    if (fromPos && !this.isBoss) {
      _v.set(this.root.position.x - fromPos.x, 0, this.root.position.z - fromPos.z);
      if (_v.lengthSq() > 0.0001) {
        const k = this.tier === 2 ? 1.4 : (this.kind === 'zombie' ? 2.0 : 3.2);
        _v.normalize().multiplyScalar(k);
        this.knock.add(_v);
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathT = 0;
      this.state = 'dead';
      const [lo, hi] = this.stats.arrows || [0, 0];
      this.lootable = this.arrowsStuck + lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    return n;
  }

  /** Instantly kill -- the knight's execution mastery. */
  execute() {
    if (this.dead) return false;
    this.hp = 0;
    this.dead = true;
    this.deathT = 0;
    this.state = 'dead';
    const [lo, hi] = this.stats.arrows || [0, 0];
    this.lootable = this.arrowsStuck + lo + Math.floor(Math.random() * (hi - lo + 1));
    return true;
  }

  moveBy(dx, dz) {
    const p = this.root.position;
    const r = this.stats.hitRadius || 0.4;
    // Same rule as the player: if we start embedded, move anyway and let
    // depenetration push us out, rather than jamming against the world.
    const embedded = this.world.blocked(p.x, p.z, p.y, r, 0.5);
    if (embedded || !this.world.blocked(p.x + dx, p.z, p.y, r, 0.5)) p.x += dx;
    if (embedded || !this.world.blocked(p.x, p.z + dz, p.y, r, 0.5)) p.z += dz;
    const fixed = this.world.depenetrate(p, r, 0.5);
    p.x = fixed.x;
    p.z = fixed.z;
  }

  /* ---------------- detection ---------------- */

  /**
   * Can this mob see the player right now? Range is scaled by how visible the
   * player is making themselves -- crouching roughly halves it, and crouching
   * inside cover reduces it to almost nothing.
   */
  canSee(player) {
    const d = this.distTo(player.position);
    const effRange = this.stats.sightRange * (player.visibility ?? 1);
    if (d > effRange) return false;
    if (d > 1.2) {
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const dot = (dx / d) * Math.sin(this.yaw) + (dz / d) * Math.cos(this.yaw);
      if (dot < Math.cos(this.stats.sightAngle ?? 1.0)) return false;
    }
    // A boss does not lose you behind a rock -- it is the whole point of the
    // room and it knows you are in it.
    if (this.isBoss) return true;
    return !this.world.lineBlocked(
      this.position.x, this.position.z, player.position.x, player.position.z,
      this.position.y + 0.9
    );
  }

  /** Running is loud, and cover does not muffle it. */
  canHear(player) {
    if (!player.running || player.speed < 2.5) return false;
    return this.distTo(player.position) < (this.stats.hearRange ?? 6);
  }

  updateDetection(dt, player) {
    if (player.dead) { this.alertMeter = Math.max(0, this.alertMeter - dt * 0.6); return; }

    const sees = this.canSee(player);
    const hears = this.canHear(player);

    if (sees) {
      const d = Math.max(1, this.distTo(player.position));
      // closer = spotted faster
      const rate = 1.4 + (this.stats.sightRange / d) * 0.5;
      this.alertMeter = Math.min(1, this.alertMeter + dt * rate);
      this.lastKnown.set(player.position.x, 0, player.position.z);
    } else if (hears) {
      this.alertMeter = Math.min(0.9, this.alertMeter + dt * 1.1);
      this.lastKnown.set(player.position.x, 0, player.position.z);
    } else {
      this.alertMeter = Math.max(0, this.alertMeter - dt * 0.35);
    }

    if (this.alertMeter >= 1 && this.state !== 'chase' &&
        !['windup', 'strike', 'recover', 'charge', 'dead',
          'takeoff', 'perch', 'roostfire', 'hurl', 'summon',
          'land'].includes(this.state)) {
      this.setState('chase');
      this.camp?.raise(this.lastKnown);
    } else if (this.alertMeter > 0.35 && this.state === 'patrol') {
      this.setState('suspicious');
    }
  }

  get alertLevel() {
    if (this.state === 'chase' || this.alertMeter >= 1) return 'alert';
    if (this.alertMeter > 0.3) return 'suspicious';
    return 'calm';
  }

  /* ---------------- update ---------------- */

  update(dt, player, ctx) {
    const pos = this.root.position;

    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.7);
      if (!this.isBoss) {
        this.root.rotation.z = k * ((this.kind === 'slime' || this.kind === 'rimeSlime') ? 0 : 1.45);
        this.root.position.y = this.world.groundHeight(pos.x, pos.z) - k * 0.12;
        if ((this.kind === 'slime' || this.kind === 'rimeSlime')) this.root.scale.setScalar(1 - k * 0.85);
      } else {
        this.root.rotation.z = k * 0.35;
        this.root.position.y = this.world.groundHeight(pos.x, pos.z) - k * 0.4;
      }
      // Bodies REMAIN, because the archer has to pull arrows out of them.
      this.root.visible = (this.kind === 'slime' || this.kind === 'rimeSlime') ? this.deathT < 0.7 : true;
      return;
    }

    this.hurtT = Math.max(0, this.hurtT - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.commandCooldown = Math.max(0, this.commandCooldown - dt);
    this.chargeCooldown = Math.max(0, this.chargeCooldown - dt);
    this.flyCooldown = Math.max(0, this.flyCooldown - dt);
    this.summonCooldown = Math.max(0, (this.summonCooldown ?? 0) - dt);

    /* ---- frozen ----
     * Encased by the wizard's RIME. It cannot act, it cannot move, and it
     * stands there in a block of ice until it thaws.
     */
    if (this.frozen > 0) {
      this.frozen -= dt;
      this.speed = 0;
      if (!this.iceBlock) {
        const mat = new THREE.MeshLambertMaterial({
          map: T.flatTex('#bfe8ff'), transparent: true, opacity: 0.5,
          flatShading: true, depthWrite: false, fog: true,
        });
        const r = (this.stats.hitRadius || 0.4) * 2.4;
        this.iceBlock = blob(r, mat, [1, 1.35, 1], 6, 5,
          [0, (this.stats.lookHeight || 1.2) * 0.62, 0]);
        this.root.add(this.iceBlock);
      }
      this.iceBlock.visible = true;
      this.animator.update(dt, { speed: 0, grounded: true });
      this.root.position.y = this.world.groundHeight(
        this.root.position.x, this.root.position.z);
      return;
    }
    if (this.iceBlock) this.iceBlock.visible = false;
    this.rallied = Math.max(0, this.rallied - dt);

    if (this.knock.lengthSq() > 0.0001) {
      this.moveBy(this.knock.x * dt, this.knock.z * dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
    }

    this.updateDetection(dt, player);

    const dist = this.distTo(player.position);
    this.speed = 0;
    this.t += dt;

    const moveSpeed = this.stats.speed * (this.rallied > 0 ? 1.28 : 1);

    switch (this.state) {
      /* ---- patrol: wander near home, looking around ---- */
      case 'patrol': {
        this.patrolT -= dt;
        if (this.patrolT <= 0) {
          this.patrolT = 2.5 + Math.random() * 3.5;
          this.patrolAngle = Math.random() * Math.PI * 2;
        }
        const homeDist = Math.hypot(pos.x - this.homeX, pos.z - this.homeZ);
        if (homeDist > 6) {
          this.patrolAngle = Math.atan2(this.homeX - pos.x, this.homeZ - pos.z);
        }
        if (this.patrolT > 1.4) {
          const s = moveSpeed * 0.30;
          this.moveBy(Math.sin(this.patrolAngle) * s * dt, Math.cos(this.patrolAngle) * s * dt);
          this.speed = s;
        }
        this.yaw = dampAngle(this.yaw, this.patrolAngle, 3, dt);
        break;
      }

      /* ---- suspicious: go and look at the last known spot ---- */
      case 'suspicious': {
        const dx = this.lastKnown.x - pos.x, dz = this.lastKnown.z - pos.z;
        const len = Math.hypot(dx, dz);
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 5, dt);
        if (len > 1.4) {
          const s = moveSpeed * 0.55;
          this.moveBy((dx / len) * s * dt, (dz / len) * s * dt);
          this.speed = s;
        } else if (this.t > 2.6) {
          // nothing here; go back to the post
          this.lastKnown.set(this.homeX, 0, this.homeZ);
          if (this.alertMeter < 0.2) this.setState('patrol');
          else this.t = 0;
        }
        if (this.alertMeter <= 0.05) this.setState('patrol');
        break;
      }

      /* ---- chase ---- */
      case 'chase': {
        if (player.dead) { this.setState('patrol'); break; }
        if (this.alertMeter <= 0.15 && dist > this.stats.sightRange) {
          this.setState('suspicious');
          break;
        }
        const dx = player.position.x - pos.x;
        const dz = player.position.z - pos.z;
        const len = Math.hypot(dx, dz) || 1;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 7, dt);

        // commanders rally the pack instead of just brawling
        if (this.stats.commander && this.commandCooldown <= 0 && this.camp) {
          this.commandCooldown = this.stats.commandCooldown;
          let rallied = 0;
          for (const m of this.camp.members) {
            if (m === this || m.dead || m.tier > 1) continue;
            if (m.distTo(this.position) > this.stats.commandRange) continue;
            m.alertMeter = 1;
            m.lastKnown.copy(player.position);
            m.rallied = 5;
            if (m.state === 'patrol' || m.state === 'suspicious') m.setState('chase');
            rallied++;
          }
          if (rallied) ctx?.onCommand?.(this, rallied);
        }

        // the corrupted knight closes the gap with a charge
        if (this.stats.charge && this.chargeCooldown <= 0 &&
            dist > this.stats.attackRange * 1.6 && dist < this.stats.charge.range) {
          this.chargeCooldown = this.stats.charge.cooldown;
          this.setState('charge');
          this.chargeDir = { x: dx / len, z: dz / len };
          break;
        }

        // THE SUMMONING outranks everything: it stops fighting entirely and
        // goes and sits on a rock while its dead walk in.
        if (this.stats.summon && this.summonCooldown <= 0) {
          const S = this.stats.summon;
          this.summonCooldown = S.cooldown;
          const arena = this.world.mapData?.arena;
          this.perchAt = {
            x: arena ? arena.x : this.homeX,
            z: (arena ? arena.z : this.homeZ) + (arena ? arena.r * 0.7 : 16),
          };
          this.perchFrom = { x: pos.x, z: pos.z };
          this.perchT = 0;
          this.summonT = 0;
          this.summonWave = 0;
          this.flying = true;
          this.setState('summon');
          ctx?.onDragonSummonStart?.(this);
          break;
        }

        // a winged dragon takes to the air on its own schedule
        if (this.stats.canFly && this.flyCooldown <= 0) {
          this.setState('takeoff');
          break;
        }
        if (this.pickAttack(dist) && this.cooldown <= 0) {
          this.setState('windup');
          this.telegraphAttack(ctx, player);
          break;
        }

        const wantDist = this.desiredRange();
        if (dist > wantDist) {
          this.moveBy((dx / len) * moveSpeed * dt, (dz / len) * moveSpeed * dt);
          this.speed = moveSpeed;
        } else if (dist < wantDist * 0.55 && this.stats.ranged) {
          // casters back off to keep their range
          this.moveBy(-(dx / len) * moveSpeed * 0.7 * dt, -(dz / len) * moveSpeed * 0.7 * dt);
          this.speed = moveSpeed * 0.7;
        }
        break;
      }

      /* ---- charge (corrupted knight) ---- */
      /* ---- flight (red dragon) ---- */
      case 'summon': {
        // Up on its rock. It does not attack, it cannot be locked on to, and
        // it is not the fight -- what it CALLS is the fight. Clearing them is
        // the only thing that ends this.
        const S = this.stats.summon;
        this.perchT = Math.min(1, this.perchT + dt * 0.8);
        const e = this.perchT * this.perchT * (3 - 2 * this.perchT);
        pos.x = this.perchFrom.x + (this.perchAt.x - this.perchFrom.x) * e;
        pos.z = this.perchFrom.z + (this.perchAt.z - this.perchFrom.z) * e;
        this.altitude = Math.min(S.perch, this.altitude + dt * 9);
        this.yaw = dampAngle(this.yaw, Math.atan2(
          player.position.x - pos.x, player.position.z - pos.z), 2.0, dt);

        this.summonT += dt;
        const per = S.duration / S.waves;
        if (this.summonT >= (this.summonWave + 1) * per - per * 0.5
            && this.summonWave < S.waves) {
          this.summonWave++;
          ctx?.onDragonSummon?.(this, S);
        }
        if (this.summonT >= S.duration) {
          ctx?.onDragonSummonEnd?.(this);
          this.setState('land');
        }
        break;
      }

      case 'takeoff': {
        // Straight up, on the spot. It is not circling anybody.
        this.flying = true;
        this.altitude = Math.min(11, this.altitude + dt * 8);
        this.yaw = dampAngle(this.yaw, Math.atan2(
          player.position.x - pos.x, player.position.z - pos.z), 3.2, dt);
        if (this.altitude >= 10.9) {
          // Cross to the FAR END of the chamber, on the far side of the player
          // from where it is now, so the whole room ends up between you.
          const arena = this.world.mapData?.arena;
          const cx = arena ? arena.x : this.homeX;
          const cz = arena ? arena.z : this.homeZ;
          // not right against the wall -- it has to stay comfortably in frame
          const rr = arena ? arena.r * 0.62 : 18;
          let ax = player.position.x - cx, az = player.position.z - cz;
          const al = Math.hypot(ax, az);
          if (al < 1) { ax = 0; az = -1; } else { ax /= al; az /= al; }
          this.perchAt = { x: cx - ax * rr, z: cz - az * rr };
          this.perchFrom = { x: pos.x, z: pos.z };
          this.perchT = 0;
          this.chargeT = 0;
          this.warned = false;
          this.passes = (this.passes || 0) + 1;
          this.setState('perch');
        }
        break;
      }

      case 'perch': {
        // Glide to the end of the room, then hang there and CHARGE. The whole
        // point of the move is that it stands still and visible while you run:
        // the threat is the four seconds, not the flying.
        this.perchT = Math.min(1, this.perchT + dt * 0.9);
        const e = this.perchT * this.perchT * (3 - 2 * this.perchT);   // smoothstep
        pos.x = this.perchFrom.x + (this.perchAt.x - this.perchFrom.x) * e;
        pos.z = this.perchFrom.z + (this.perchAt.z - this.perchFrom.z) * e;
        this.yaw = dampAngle(this.yaw, Math.atan2(
          player.position.x - pos.x, player.position.z - pos.z), 4.0, dt);
        this.speed = this.stats.speed;

        if (this.perchT < 1) break;

        if (!this.warned) {
          this.warned = true;
          ctx?.onDragonRoost?.(this, this.chargeTime());
          ctx?.hint?.('GET BEHIND A BOULDER!');
        }
        this.chargeT += dt;
        if (this.chargeT >= this.chargeTime()) {
          this.roostT = 0;
          this.roostTick = 0;
          this.rakeDir = this.rakeDir === 1 ? -1 : 1;   // alternate the sweep
          // The ice dragon alternates: one pass is the sheet you hide from,
          // the next is a volley of hurled ice you dodge in the open.
          if (this.stats.hurlCount && (this.passes % 2 === 0)) {
            this.hurlLeft = this.stats.hurlCount;
            this.hurlTick = 0;
            this.setState('hurl');
            ctx?.onDragonHurlStart?.(this);
          } else {
            this.setState('roostfire');
            ctx?.onDragonRoostFire?.(this);
          }
        }
        break;
      }

      case 'hurl': {
        // Hanging in the air, throwing blocks of ice down at you one at a
        // time. Cover is no help here -- these are aimed, and you sidestep
        // them. That is the difference between this pass and the last one.
        this.yaw = dampAngle(this.yaw, Math.atan2(
          player.position.x - pos.x, player.position.z - pos.z), 5.0, dt);
        this.hurlTick -= dt;
        // stop THROWING once the volley is spent, then let the timer run on
        // into the negative as the beat before it moves again
        if (this.hurlTick <= 0 && this.hurlLeft > 0) {
          this.hurlTick = this.stats.hurlInterval ?? 0.55;
          this.hurlLeft--;
          ctx?.onDragonHurl?.(this, player);
        }
        if (this.hurlLeft <= 0 && this.hurlTick < -0.6) {
          ctx?.onDragonRoostEnd?.(this);
          if (this.passes < (this.stats.roostPasses ?? 2)) {
            this.perchFrom = { x: pos.x, z: pos.z };
            this.perchT = 0;
            this.chargeT = 0;
            this.warned = false;
            const arena = this.world.mapData?.arena;
            const cx = arena ? arena.x : this.homeX;
            const cz = arena ? arena.z : this.homeZ;
            this.perchAt = { x: cx - (this.perchAt.x - cx), z: cz - (this.perchAt.z - cz) };
            this.passes++;
            this.setState('perch');
          } else {
            this.passes = 0;
            this.setState('land');
          }
        }
        break;
      }

      case 'roostfire': {
        // A sheet of fire down the length of the chamber. Cover is the ONLY
        // answer -- blocking does nothing, and there is nowhere to outrun it.
        this.roostT += dt;
        // It RAKES the chamber rather than aiming: the head swings through a
        // wide arc so the jet sweeps the whole floor. That is why cover, not
        // dodging, is the answer -- there is no side of the room to run to.
        {
          const dur = this.stats.roostBreath ?? 2.0;
          const k = Math.min(1, this.roostT / dur);
          const at = Math.atan2(player.position.x - pos.x, player.position.z - pos.z);
          this.yaw = at + (this.rakeDir || 1) * (0.85 - k * 1.7);
        }
        this.roostTick -= dt;
        if (this.roostTick <= 0) {
          this.roostTick = 0.22;
          const covered = this.world.inCover
            && this.world.inCover(player.position.x, player.position.z);
          if (!covered) {
            ctx?.damagePlayer?.(this.stats.roostDamage ?? 24, this,
              this.stats.roostType || 'flame');
          }
        }
        if (this.roostT >= (this.stats.roostBreath ?? 2.0)) {
          ctx?.onDragonRoostEnd?.(this);
          if (this.passes < (this.stats.roostPasses ?? 2)) {
            this.perchFrom = { x: pos.x, z: pos.z };
            this.perchT = 0;
            this.chargeT = 0;
            this.warned = false;
            // swap ends for the second pass
            const arena = this.world.mapData?.arena;
            const cx = arena ? arena.x : this.homeX;
            const cz = arena ? arena.z : this.homeZ;
            this.perchAt = { x: cx - (this.perchAt.x - cx), z: cz - (this.perchAt.z - cz) };
            this.passes++;
            this.setState('perch');
          } else {
            this.passes = 0;
            this.setState('land');
          }
        }
        break;
      }

      case 'land': {
        this.altitude = Math.max(0, this.altitude - dt * 8);
        if (this.altitude <= 0.01) {
          this.flying = false;
          this.flyCooldown = this.stats.flyCooldown ?? 16;
          ctx?.shake?.(0.3, 0.5);
          this.setState('recover');
        }
        break;
      }

      case 'charge': {
        const s = this.stats.charge.speed;
        this.moveBy(this.chargeDir.x * s * dt, this.chargeDir.z * s * dt);
        this.speed = s;
        this.yaw = dampAngle(this.yaw, Math.atan2(this.chargeDir.x, this.chargeDir.z), 10, dt);
        if (dist < this.stats.attackRange * 0.9) {
          ctx?.damagePlayer?.(Math.round(this.stats.damage * 0.7), this);
          this.setState('recover');
        } else if (this.t > 0.85) {
          this.setState('chase');
        }
        break;
      }

      case 'windup': {
        const dx = player.position.x - pos.x, dz = player.position.z - pos.z;
        let face = Math.atan2(dx, dz);
        // For a tail sweep the dragon TURNS ITS BACK on you during the wind-up,
        // so the tail is the thing coming at you and you can see it coming.
        if (this.isBoss && this.attackKind === 'lash') face += Math.PI;
        this.yaw = dampAngle(this.yaw, face, this.isBoss ? 4.5 : 9, dt);
        if (this.t >= this.windupTime()) {
          this.setState('strike');
          this.onStrikeStart(player, ctx);
        }
        break;
      }

      case 'strike': {
        if ((this.kind === 'slime' || this.kind === 'rimeSlime')) this.updateLeap(dt, player, ctx);
        if (this.attackKind === 'breath') this.updateBreath(dt, player, ctx);
        if (this.attackKind === 'lash') this.updateSweep(dt, player, ctx);
        if (this.t >= this.strikeTime() && !this.airborne) this.setState('recover');
        break;
      }

      case 'recover': {
        if (this.t >= this.stats.recover) {
          this.cooldown = this.stats.attackCooldown * (0.8 + Math.random() * 0.4)
            * (this.phase2 ? 0.72 : 1);
          this.setState(this.alertMeter > 0.3 ? 'chase' : 'patrol');
        }
        break;
      }
    }

    /* gravity */
    const gy = this.world.groundHeight(pos.x, pos.z, pos.y);
    if (this.airborne) {
      this.vy += GRAVITY * dt;
      pos.y += this.vy * dt;
      if (pos.y <= gy) {
        pos.y = gy;
        this.vy = 0;
        this.airborne = false;
        ctx?.combat?.hitSpark(pos, '#7fb0e0', 4);
        this.setState('recover');
      }
    } else {
      pos.y = gy + (this.altitude || 0);
    }

    this.root.rotation.y = this.yaw;

    /* animation */
    const inAttack = ['windup', 'strike', 'recover'].includes(this.state);
    const atk = inAttack
      ? {
        style: this.animStyle(),
        phase: this.state,
        k: Math.min(1, this.t / Math.max(0.01, this.phaseDuration())),
      }
      : null;

    if (this.isBoss) {
      const dx = player.position.x - pos.x, dz = player.position.z - pos.z;
      const rel = Math.atan2(dx, dz) - this.yaw;
      this.animator.update(dt, {
        speed: this.speed, attack: atk, hurt: this.hurtT > 0,
        aimYaw: Math.atan2(Math.sin(rel), Math.cos(rel)),
        aimPitch: -0.1,
      });
    } else {
      this.animator.update(dt, {
        speed: this.speed,
        maxSpeed: this.stats.speed,
        grounded: !this.airborne,
        vy: this.vy,
        running: this.rallied > 0,
        hunch: this.entity.hunch ?? 0,
        height: 0,
        attack: atk,
        hurt: this.hurtT > 0,
      });
    }
  }

  get phase2() { return this.isBoss && this.hp < this.maxHp * 0.5; }

  /** Which attack fits the current distance? Sets attackKind. */
  pickAttack(dist) {
    if (this.isBoss) {
      if (dist <= this.stats.attackRange) { this.attackKind = 'lash'; return true; }
      if (dist <= this.stats.breathRange) { this.attackKind = 'breath'; return true; }
      return false;
    }
    // A STREAM is not boss-only: the ice witch holds one on you the same way.
    if (this.stats.breathRange && dist <= this.stats.breathRange) {
      this.attackKind = 'breath';
      return true;
    }
    if (this.stats.ranged) {
      // A thrower that lets you walk right up to it is not a threat. The ice
      // golem stops lobbing and starts swinging once you are inside its reach.
      if (this.stats.melee && dist <= this.stats.melee.range) {
        this.attackKind = 'melee';
        return true;
      }
      this.attackKind = 'ranged';
      return dist <= this.stats.attackRange;
    }
    this.attackKind = this.kind === 'slime' || this.kind === 'rimeSlime' ? 'leap' : 'melee';
    return dist <= this.stats.attackRange;
  }

  desiredRange() {
    if (this.stats.ranged) return this.stats.attackRange * 0.75;
    if ((this.kind === 'slime' || this.kind === 'rimeSlime')) return this.stats.attackRange * 0.55;
    if (this.isBoss) return this.stats.attackRange * 0.8;
    return 1.0;
  }

  /** How long you get to reach cover once it has settled at the far end. */
  chargeTime() { return this.stats.roostCharge ?? 4.0; }

  windupTime() {
    let t = this.stats.windup * (this.phase2 ? 0.8 : 1);
    // The knight has to stand inside a mob's reach to do anything at all, so
    // it eats every telegraphed swing the ranged classes just walk away from.
    // Give it -- and only it -- a longer read on PHYSICAL wind-ups. Breath and
    // ranged shots are untouched: those are dodged by position, not timing.
    if (PHYSICAL.has(this.attackKind)) t *= this.isBoss ? bossPhysicalRead : physicalRead;
    return t;
  }
  strikeTime() {
    if (this.attackKind === 'breath') return this.stats.strike * (this.phase2 ? 2.4 : 1.6);
    return this.stats.strike;
  }
  phaseDuration() {
    if (this.state === 'windup') return this.windupTime();
    if (this.state === 'strike') return this.strikeTime();
    return this.stats.recover;
  }

  animStyle() {
    if (this.isBoss) return this.attackKind === 'breath' ? 'breath' : 'lash';
    if (this.stats.ranged) return 'cast';
    return this.entity.attackStyle || 'fists';
  }

  /**
   * Show the incoming attack before it lands: a danger zone on the ground that
   * fills as the windup completes, plus a hot tint on the attacker. Between
   * them the player always has a readable moment to step out or dash.
   */
  telegraphAttack(ctx, player) {
    const s = this.stats;
    const dur = this.windupTime();
    if (!ctx?.telegraph) return;

    if ((this.kind === 'slime' || this.kind === 'rimeSlime')) {
      // the slime commits to where you are NOW -- move and it lands short
      ctx.telegraph({
        shape: 'circle', position: player.position.clone(),
        range: 1.7, duration: dur + s.strike * 0.6, color: '#4f9fe0',
      });
    } else if (this.attackKind === 'breath') {
      ctx.telegraph({
        follow: this, range: s.breathRange, halfAngle: s.breathAngle,
        duration: dur, color: s.breathColor || '#8fd46a',
      });
      ctx.hint?.('DART ASIDE!');
    } else if (this.attackKind === 'lash') {
      ctx.telegraph({
        follow: this, range: s.attackRange, halfAngle: 1.9,
        duration: dur, color: '#ff8a3c',
      });
      ctx.hint?.('JUMP!');
    } else if (s.thrust) {
      // A pitchfork goes straight down the line. Backing off keeps you in it;
      // the only thing that works is stepping out of the lane.
      ctx.telegraph({
        follow: this, range: s.attackRange, halfAngle: 0.16,
        duration: dur, color: '#b070ff',
      });
      ctx.hint?.('STEP ASIDE!');
    } else if (this.attackKind === 'ranged') {
      // a narrow firing lane -- step out of the line and the shot misses
      ctx.telegraph({
        follow: this, range: Math.min(s.attackRange, 15), halfAngle: 0.09,
        duration: dur, color: '#ffd23c',
      });
    } else {
      ctx.telegraph({
        follow: this, range: s.attackRange, halfAngle: 0.9,
        duration: dur, color: '#ff5a3c',
      });
    }

  }

  onStrikeStart(player, ctx) {
    const stats = this.stats;

    if ((this.kind === 'slime' || this.kind === 'rimeSlime')) {
      const dx = player.position.x - this.root.position.x;
      const dz = player.position.z - this.root.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const power = Math.min(1, len / stats.attackRange);
      this.leapVX = (dx / len) * (5.0 + power * 3.5);
      this.leapVZ = (dz / len) * (5.0 + power * 3.5);
      this.vy = 7.4;
      this.airborne = true;
      this.leapHit = false;
      return;
    }

    if (this.attackKind === 'ranged') {
      _v.set(
        player.position.x - this.position.x,
        (player.position.y + 1.0) - (this.position.y + stats.lookHeight),
        player.position.z - this.position.z
      ).normalize();
      const from = this.position.clone();
      from.y += stats.lookHeight;
      ctx?.spawnEnemyProjectile?.(this, from, _v);
      return;
    }

    if (this.attackKind === 'breath') {
      this.breathTick = 0;
      ctx?.onDragonBreath?.(this);
      return;
    }

    if (this.attackKind === 'lash') {
      // A LOW tail sweep. It reaches all the way around, so there is nowhere
      // to run sideways -- you jump it. Anything airborne is clean over the top.
      // The hit is resolved continuously during the strike so the damage lands
      // when the tail visibly passes through you, not on the first frame.
      this.sweepHit = false;
      ctx?.combat?.sweepFx(this, stats.attackRange, this.strikeTime());
      ctx?.shake?.(0.22, 0.35);
      return;
    }

    // plain fists / blade -- or, for a thrower caught up close, its shatter
    const m = stats.melee;
    const reach = m && this.attackKind === 'melee' && stats.ranged ? m.range : stats.attackRange;
    const dmg = m && this.attackKind === 'melee' && stats.ranged ? m.damage : stats.damage;
    // a thrust is narrow; a swing is wide
    if (this.arcHit(player, reach, stats.thrust ? 0.20 : 0.9)) {
      ctx?.damagePlayer?.(dmg, this, stats.damageType);
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    ctx?.combat?.hitSpark(
      _v.set(this.position.x + fx * 0.9, this.position.y + 1.0, this.position.z + fz * 0.9),
      this.kind === 'skeleton' ? '#e6dcc0' : '#8aa06a', 3
    );
  }

  arcHit(player, reach, halfAngle) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d > reach) return false;
    if (d < 0.01) return true;
    const dot = (dx / d) * Math.sin(this.yaw) + (dz / d) * Math.cos(this.yaw);
    return dot > Math.cos(halfAngle);
  }

  /**
   * The tail sweeps through an arc over the whole strike. You are hit only
   * when the tail is actually passing through you AND your feet are down --
   * which is what makes jumping it a real, readable decision.
   */
  updateSweep(dt, player, ctx) {
    if (this.sweepHit) return;
    const k = Math.min(1, this.t / Math.max(0.01, this.strikeTime()));
    // the tail travels from one side to the other across the strike
    // the dragon has turned its back, so the tail lies along yaw + PI
    const tailYaw = this.yaw + Math.PI;
    const sweepAngle = tailYaw - 1.7 + k * 3.4;

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d > this.stats.attackRange || d < 0.4) return;

    const dot = (dx / d) * Math.sin(sweepAngle) + (dz / d) * Math.cos(sweepAngle);
    if (dot < Math.cos(0.42)) return;             // the tail is not here yet

    this.sweepHit = true;
    const airborne = (player.position.y - (player.groundY ?? 0)) > 0.75;
    if (airborne) {
      ctx?.hint?.('CLEAR!');
      return;
    }
    ctx?.damagePlayer?.(this.stats.damage, this, 'tail');
  }

  updateBreath(dt, player, ctx) {
    this.breathTick = (this.breathTick ?? 0) - dt;
    if (this.breathTick > 0) return;
    this.breathTick = 0.18;
    const range = this.stats.breathRange * (this.phase2 ? 1.15 : 1);
    if (this.arcHit(player, range, this.stats.breathAngle)) {
      ctx?.damagePlayer?.(this.stats.breathDamage, this, this.stats.breathType || 'flame');
    }
  }

  updateLeap(dt, player, ctx) {
    this.moveBy(this.leapVX * dt, this.leapVZ * dt);
    this.leapVX *= 1 - dt * 0.7;
    this.leapVZ *= 1 - dt * 0.7;
    if (!this.leapHit) {
      const d = this.distTo(player.position);
      if (d < 1.2 && Math.abs(this.root.position.y - player.position.y) < 1.8) {
        this.leapHit = true;
        ctx?.damagePlayer?.(this.stats.damage, this, this.stats.damageType);
      }
    }
  }

  /**
   * Get up again, exactly where you were standing when the level started.
   * Same object, so its camp still knows about it and its patrol anchor and
   * its loot are all still correct.
   */
  revive() {
    this.dead = false;
    this.deathT = 0;
    this.hp = this.maxHp;
    this.looted = false;
    // arrows come back with it -- it is the same body, standing up again
    this.lootable = 0;
    this.arrowsStuck = 0;
    this.alertMeter = 0;
    this.cooldown = 0;
    this.airborne = false;
    this.vy = 0;
    this.altitude = 0;
    this.flying = false;
    this.root.visible = true;
    this.root.scale.setScalar(1);
    this.root.rotation.set(0, this.startYaw ?? 0, 0);
    this.entity.resetPose?.();
    this.returnHome();
  }

  /** Walk back to where you were standing before any of this started. */
  returnHome() {
    this.root.position.set(this.homeX,
      this.world.groundHeight(this.homeX, this.homeZ), this.homeZ);
    this.yaw = this.startYaw ?? this.yaw;
    this.alertMeter = 0;
    this.rallied = 0;
    this.setState('patrol');
  }

  setState(s) { this.state = s; this.t = 0; }

  dispose() {
    this.scene.remove(this.root);
    this.entity.dispose();
  }
}

/* ---------------- group lock-on helper ---------------- */

/**
 * Enemies bunched close enough together to be worth one thrown potion.
 */
export function findCluster(enemies, radius = 3.4, minSize = 2) {
  let best = null;
  for (const e of enemies) {
    if (e.dead) continue;
    const group = enemies.filter(o =>
      !o.dead && Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) <= radius);
    if (group.length >= minSize && (!best || group.length > best.length)) best = group;
  }
  return best;
}
