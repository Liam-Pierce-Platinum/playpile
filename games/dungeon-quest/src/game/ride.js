// THE LITTLE DRAGON.
//
// What was behind the wall. It is the same skeleton as the four you killed,
// scaled down to something that will carry a person, and it is the only thing
// in the game that is on your side.
//
// Riding is a separate movement mode: you sit on its shoulders, it flies, and
// the whole level is suddenly a thing you look down at instead of walk along.
import * as THREE from 'three';
import { buildGreenDragon } from '../art/dragon.js';
import * as T from '../art/textures.js';

const UP_SPEED = 9.0;
const FLY_SPEED = 17.0;
const TURN = 2.2;
const CEILING = 96;

// Its attacks. Slower than a person's -- it is a dragon, it commits.
const TAIL = { windup: 0.26, strike: 0.34, recover: 0.40, range: 7.5, damage: 42 };
const BREATH = { windup: 0.34, strike: 0.55, recover: 0.55, range: 15, halfAngle: 0.34, damage: 26 };
const TAIL_COOLDOWN = 0.95;
const BREATH_COOLDOWN = 2.1;
export const DRAGON_ATTACKS = { TAIL, BREATH };

export class RideDragon {
  constructor(scene, world, x, z) {
    this.scene = scene;
    this.world = world;
    this.entity = buildGreenDragon();

    // a young one: pale, warm, and a quarter the size of its parents
    T.repaint(this.entity.root, {
      shift: {
        '#3f6b2e': '#8fbf5a', '#2e5222': '#d8e8b0', '#35502a': '#a8d070',
      },
    });
    this.entity.root.scale.setScalar(0.62);

    this.root = this.entity.root;
    this.pos = new THREE.Vector3(x, world.groundHeight(x, z), z);
    this.yaw = 0;
    this.altitude = 0;
    this.speed = 0;
    this.t = 0;
    this.mounted = false;

    // Its two attacks. The tail is a wide sweep under you; the breath is a
    // long cone out in front. Both run on the same little state machine the
    // player's actions use: windup -> strike -> recover.
    this.action = null;
    this.tailCooldown = 0;
    this.breathCooldown = 0;

    scene.add(this.root);
    this.pose(0);
  }

  /** Where the rider sits: on the shoulders, ahead of the wings. */
  seat(out) {
    // between the wings, not on the neck: back a little and low enough that
    // the rider is ON it rather than standing above it
    const bob = this.mounted ? Math.sin(this.t * 1.9) * 0.35 : 0;
    out.set(
      this.pos.x - Math.sin(this.yaw) * 0.15,
      this.pos.y + this.altitude + bob + 0.98,
      this.pos.z - Math.cos(this.yaw) * 0.15
    );
    return out;
  }

  distTo(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  get busy() { return !!this.action; }

  /** Where the mouth is, for spawning fire out of it. */
  mouth(out) {
    out.set(
      this.pos.x + Math.sin(this.yaw) * 2.2,
      this.pos.y + this.altitude + 1.45,
      this.pos.z + Math.cos(this.yaw) * 2.2
    );
    return out;
  }

  startTail() {
    if (this.action || this.tailCooldown > 0) return false;
    this.tailCooldown = TAIL_COOLDOWN;
    this.action = { kind: 'tail', phase: 'windup', t: 0, fired: false };
    return true;
  }

  startBreath() {
    if (this.action || this.breathCooldown > 0) return false;
    this.breathCooldown = BREATH_COOLDOWN;
    this.action = { kind: 'breath', phase: 'windup', t: 0, fired: false };
    return true;
  }

  /** Drives the attack machine. `hooks` fires the actual damage and effects. */
  updateAction(dt, hooks) {
    this.tailCooldown = Math.max(0, this.tailCooldown - dt);
    this.breathCooldown = Math.max(0, this.breathCooldown - dt);
    const a = this.action;
    if (!a) return;
    const def = a.kind === 'tail' ? TAIL : BREATH;
    a.t += dt;
    const dur = def[a.phase];
    if (a.phase === 'strike' && !a.fired) {
      a.fired = true;
      if (a.kind === 'tail') hooks.onTail?.(this);
      else hooks.onBreath?.(this);
    }
    if (a.t < dur) return;
    a.t = 0;
    a.fired = false;
    if (a.phase === 'windup') a.phase = 'strike';
    else if (a.phase === 'strike') a.phase = 'recover';
    else this.action = null;
  }

  /**
   * @param input  the shared Input; WASD flies it, ↑ climbs, ↓ descends
   * @param cam    the follow camera, for a camera-relative wish direction
   */
  update(dt, input, cam) {
    this.t += dt;

    if (!this.mounted) {
      // waiting: it sits, breathes, and looks around
      this.altitude = 0;
      this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);
      this.pose(0);
      this.entity.head.rotation.y = Math.sin(this.t * 0.5) * 0.35;
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
      return;
    }

    // ---- flight ----
    const f = cam.forward, r = cam.right;
    let wx = 0, wz = 0;
    if (input.action('moveUp')) { wx += f.x; wz += f.z; }
    if (input.action('moveDown')) { wx -= f.x; wz -= f.z; }
    if (input.action('moveRight')) { wx += r.x; wz += r.z; }
    if (input.action('moveLeft')) { wx -= r.x; wz -= r.z; }
    const wl = Math.hypot(wx, wz);

    const boost = input.action('run') ? 1.55 : 1;
    if (wl > 0.001) {
      const want = Math.atan2(wx / wl, wz / wl);
      let e = want - this.yaw;
      e = Math.atan2(Math.sin(e), Math.cos(e));
      this.yaw += e * Math.min(1, dt * TURN);
      const target = this.busy ? FLY_SPEED * 0.28 : FLY_SPEED * boost;
      this.speed += (target - this.speed) * Math.min(1, dt * 2.2);
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 1.6);
    }

    // The arrow keys are the dragon's now: UP and DOWN fly it, LEFT is the
    // tail, RIGHT is fire. It cannot climb while it is swinging something.
    if (!this.busy) {
      if (input.action('jump')) this.altitude += UP_SPEED * dt;
      if (input.action('block')) this.altitude -= UP_SPEED * dt;
    }
    if (input.pressedAction('attack')) this.startTail();
    if (input.pressedAction('special')) this.startBreath();
    // it will not let you fly into the ground, and it will not go to the moon
    this.altitude = Math.max(0, Math.min(CEILING, this.altitude));

    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;

    // Stay over the level. Past its ends there is no ground mesh at all, so
    // flying out is not freedom, it is a screenful of fog.
    const w = this.world;
    const z0 = (w.mapData?.zStart ?? -16) + 4;
    const z1 = (w.zEnd ?? 300) - 4;
    this.pos.z = Math.max(z0, Math.min(z1, this.pos.z));
    if (w.valleyCentre) {
      const c = w.valleyCentre(this.pos.z);
      const hw = (w.valleyHalfWidth ? w.valleyHalfWidth(this.pos.z) : 20) + 26;
      this.pos.x = Math.max(c - hw, Math.min(c + hw, this.pos.x));
    }
    this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);

    const bob = Math.sin(this.t * 1.9) * 0.35;
    this.root.position.set(this.pos.x, this.pos.y + this.altitude + bob, this.pos.z);
    this.root.rotation.y = this.yaw;
    // bank into the turn, and pitch with the climb
    this.root.rotation.z = -Math.sin(this.t * 0.8) * 0.05
      - (this.speed / FLY_SPEED) * 0.10;
    this.root.rotation.x = (input.action('jump') ? -0.16 : 0)
      + (input.action('block') ? 0.18 : 0);
    this.pose(1);
  }

  /** Wings furled on the ground, beating in the air. */
  pose(flying) {
    const e = this.entity;
    const beat = Math.sin(this.t * (flying ? 4.4 : 0.9));
    const a = this.action;
    // how far through the current attack, 0..1, for posing
    const k = a ? Math.min(1, a.t / ((a.kind === 'tail' ? TAIL : BREATH)[a.phase] || 0.2)) : 0;
    for (const s of ['L', 'R']) {
      const w = e.wings[s];
      const rest = w.userData.rest;
      if (flying) {
        w.rotation.set(-0.15 + beat * 0.30, rest.y * 0.25,
          w.userData.side * (-1.15 + beat * 0.45));
      } else {
        w.rotation.set(rest.x + beat * 0.03, rest.y, rest.z);
      }
    }
    e.neck.joints.forEach((j, i) => {
      j.rotation.x = (flying ? -0.10 : 0.16) + Math.sin(this.t * 1.2 + i) * 0.03;
    });
    // THE TAIL: coiled to one side on the wind-up, whipped through on the
    // strike, so the swing is something you watch rather than something that
    // simply happens.
    let tailSwing = 0;
    if (a && a.kind === 'tail') {
      if (a.phase === 'windup') tailSwing = -1.1 * k;
      else if (a.phase === 'strike') tailSwing = -1.1 + 2.6 * k;
      else tailSwing = 1.5 * (1 - k);
    }
    e.tail.joints.forEach((j, i) => {
      j.rotation.y = Math.sin(this.t * (flying ? 2.2 : 0.8) - i * 0.5) * 0.16
        + tailSwing * (0.5 + i * 0.16);
    });

    // THE BREATH: head back, then thrown forward with the jaw wide
    if (a && a.kind === 'breath') {
      const rear = a.phase === 'windup' ? k : 1;
      const throwF = a.phase === 'strike' ? k : (a.phase === 'recover' ? 1 - k : 0);
      e.neck.joints.forEach((j, i) => {
        j.rotation.x = -0.10 + (-0.34 * rear + 0.42 * throwF) * (1 - i * 0.12);
      });
      e.jaw.rotation.x = 0.10 + 0.72 * (a.phase === 'strike' ? 1 : k * 0.4);
    } else {
      e.jaw.rotation.x = 0.06;
    }
    if (!flying) e.head.rotation.x = 0.1;
  }

  dispose() {
    this.scene.remove(this.root);
    this.entity.dispose();
  }
}
