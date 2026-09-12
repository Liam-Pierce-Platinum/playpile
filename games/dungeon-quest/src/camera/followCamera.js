// Third-person follow camera.
//
// The feel comes from four things layered on top of each other:
//   1. the pivot lags behind the player (the "camera guy" running to keep up)
//   2. vertical lag is slower than horizontal, so jumps read as jumps
//   3. the camera drifts back behind the player only after you stop steering it
//   4. it pulls in fast off walls and eases back out slowly
import * as THREE from 'three';

/** Framerate-independent exponential smoothing. */
function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}
function dampAngle(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}

const MIN_PITCH = -0.55;   // looking up
const MAX_PITCH = 1.05;    // looking down

export class FollowCamera {
  constructor(camera, opts = {}) {
    this.camera = camera;

    this.yaw = Math.PI;
    this.pitch = 0.28;
    // Fixed distance -- no zoom. Pulled in 1.7x from the old 5.0 for a tight
    // over-the-shoulder framing.
    this.dist = 2.95;
    this.targetDist = 2.95;
    this.minDist = 1.2;
    this.maxDist = 5.3;

    this.pivotHeight = opts.pivotHeight ?? 1.35;
    this.lookHeight = opts.lookHeight ?? 1.15;
    // Over-the-shoulder: the camera sits off to one side so the hero occupies
    // the left of frame and whatever they are fighting stays visible on the
    // right, instead of hiding directly behind their own head.
    this.shoulder = opts.shoulder ?? 0.95;

    this.pivot = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.baseFov = opts.fov ?? 62;
    this.fov = this.baseFov;

    this.colliders = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = this.maxDist + 1;
    this.collidedDist = this.dist;

    this.lockTarget = null;
    this.idleSinceInput = 0;
    this.autoAlignDelay = 1.1;

    this.shakeAmount = 0;
    this.shakeTime = 0;
    this._shoulderX = 0;
    this._shoulderZ = 0;
    this._initialized = false;
    // Set-piece framing: pulls right back so the whole chamber is on screen.
    this.wide = null;
  }

  /**
   * Frame a boss set-piece: camera swings behind the player on the player ->
   * focus axis and pulls a long way back, so you can see the dragon, the room
   * and every boulder in it at once. Pass null to hand control back.
   */
  setWideShot(focus, opts = {}) {
    this.wide = focus ? {
      focus,
      dist: opts.dist ?? 21,
      pitch: opts.pitch ?? 0.52,
      height: opts.height ?? 4.0,
      // Watch it from the SIDE, not down the barrel. Framing the shot behind
      // the player put the camera inside the sheet of fire, which filled the
      // screen with orange and showed nothing at all.
      side: opts.side !== false,
    } : null;
  }

  /** Camera-relative movement basis, so WASD always means what you see. */
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  setLockTarget(obj) {
    this.lockTarget = obj || null;
  }
  toggleLock(obj) {
    this.lockTarget = this.lockTarget ? null : (obj || null);
    return this.lockTarget;
  }

  shake(amount = 0.15, duration = 0.25) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  /**
   * @param dt      seconds
   * @param input   Input instance
   * @param player  { position: Vector3, facing: Vector3, speed: number, grounded: bool }
   */
  update(dt, input, player) {
    // ---- manual look ----
    const mdx = input.mouseDX, mdy = input.mouseDY;
    if (mdx || mdy) {
      this.yaw -= mdx;
      this.pitch += mdy;
      this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch));
      this.idleSinceInput = 0;
    } else {
      this.idleSinceInput += dt;
    }

    // ---- a set-piece wide shot beats everything else ----
    if (this.wide) {
      const f = this.wide.focus;
      this._tmp.set(player.position.x - f.x, 0, player.position.z - f.z);
      const sep = this._tmp.length() || 0.001;
      let wantYaw = Math.atan2(this._tmp.x / sep, this._tmp.z / sep);
      if (this.wide.side) wantYaw += Math.PI / 2;
      this.yaw = dampAngle(this.yaw, wantYaw, 3.2, dt);
      this.pitch = damp(this.pitch, this.wide.pitch, 2.6, dt);
      this.targetDist = damp(this.targetDist, this.wide.dist, 2.2, dt);
    } else

    // ---- lock-on overrides framing ----
    if (this.lockTarget) {
      this._tmp.set(
        player.position.x - this.lockTarget.position.x, 0,
        player.position.z - this.lockTarget.position.z
      );
      const sep = this._tmp.length() || 0.001;
      // sit behind the player on the player->target axis
      const wantYaw = Math.atan2(this._tmp.x / sep, this._tmp.z / sep);
      this.yaw = dampAngle(this.yaw, wantYaw, 6.0, dt);
      this.pitch = damp(this.pitch, 0.20, 5.0, dt);
      const wantDist = Math.min(4.4, 2.1 + sep * 0.19);
      this.targetDist = damp(this.targetDist, wantDist, 4.0, dt);
    } else if (
      this.idleSinceInput > this.autoAlignDelay &&
      player.speed > 0.6 &&
      player.grounded
    ) {
      // ---- lazy auto-align behind the player ----
      const f = player.facing;
      const wantYaw = Math.atan2(-f.x, -f.z);
      const rate = 0.9 + Math.min(player.speed, 8) * 0.30;
      this.yaw = dampAngle(this.yaw, wantYaw, rate, dt);
    }

    // ---- pivot lag: horizontal snappier than vertical ----
    // A wide shot pivots on the MIDPOINT between the hero and what it is
    // framing, so neither one ends up off the edge of the screen.
    // Weighted toward what is being framed rather than dead centre: the
    // sidebar eats the right quarter of the screen, and the player already
    // knows where they are standing. The DRAGON is the thing to look at.
    const W = 0.5;   // the camera orbits the midpoint; the LOOK target biases
    const px = this.wide
      ? player.position.x + (this.wide.focus.x - player.position.x) * W
      : player.position.x;
    const pz = this.wide
      ? player.position.z + (this.wide.focus.z - player.position.z) * W
      : player.position.z;
    const py = player.position.y + this.pivotHeight
      + (this.wide ? this.wide.height : 0);
    if (!this._initialized) {
      this.pivot.set(px, py, pz);
      this.lookAt.set(px, player.position.y + this.lookHeight, pz);
      // seed the camera behind the player too, or frame one is a wild swing
      const cp0 = Math.cos(this.pitch);
      this.camPos.set(
        px + Math.sin(this.yaw) * cp0 * this.dist,
        py + Math.sin(this.pitch) * this.dist,
        pz + Math.cos(this.yaw) * cp0 * this.dist
      );
      this.collidedDist = this.dist;
      this._initialized = true;
    }
    this.pivot.x = damp(this.pivot.x, px, 17.0, dt);
    this.pivot.z = damp(this.pivot.z, pz, 17.0, dt);
    // slower vertical, and slower still while airborne so jumps have arc
    this.pivot.y = damp(this.pivot.y, py, player.grounded ? 9.0 : 4.0, dt);

    // ---- where the camera wants to be ----
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.dist = damp(this.dist, this.targetDist, 8.0, dt);

    let wantDist = this.dist;

    // ---- wall collision: pull in immediately, ease back out ----
    // A set-piece shot ignores it. Being briefly inside a rock for six seconds
    // is a far smaller problem than the camera snapping to two metres and
    // hiding the room the shot exists to show.
    if (this.colliders.length && !this.wide) {
      this.ray.set(this.pivot, this._dir);
      this.ray.far = this.dist + 0.4;
      const hits = this.ray.intersectObjects(this.colliders, true);
      if (hits.length) {
        wantDist = Math.max(this.minDist * 0.6, hits[0].distance - 0.35);
      }
    }
    this.collidedDist = wantDist < this.collidedDist
      ? wantDist                                        // snap in
      : damp(this.collidedDist, wantDist, 3.0, dt);     // ease out

    this._desired.copy(this.pivot).addScaledVector(this._dir, this.collidedDist);

    // shoulder offset, perpendicular to the view direction
    const rx = this._dir.z, rz = -this._dir.x;
    const rlen = Math.hypot(rx, rz) || 1;
    this._shoulderX = (rx / rlen) * this.shoulder;
    this._shoulderZ = (rz / rlen) * this.shoulder;
    this._desired.x += this._shoulderX;
    this._desired.z += this._shoulderZ;

    // never let it dip through the floor
    const floor = (player.groundY ?? 0) + 0.45;
    if (this._desired.y < floor) this._desired.y = floor;

    // Final smoothing. Kept tight -- a mushy camera reads as input lag even
    // when the character is responding instantly.
    this.camPos.x = damp(this.camPos.x, this._desired.x, 24.0, dt);
    this.camPos.y = damp(this.camPos.y, this._desired.y, 20.0, dt);
    this.camPos.z = damp(this.camPos.z, this._desired.z, 24.0, dt);

    // ---- look target ----
    let lx = player.position.x, ly = player.position.y + this.lookHeight, lz = player.position.z;
    if (this.wide) {
      // Centring on the player alone left the dragon off the right-hand edge.
      // Aim between them, biased toward the dragon -- the sidebar covers the
      // right quarter of the screen, so the far subject needs the extra room.
      const f = this.wide.focus, w = 0.65;
      lx = player.position.x + (f.x - player.position.x) * w;
      lz = player.position.z + (f.z - player.position.z) * w;
      ly = player.position.y + this.lookHeight + this.wide.height * 0.55;
    } else if (this.lockTarget) {
      const t = this.lockTarget.position;
      const th = this.lockTarget.userData?.lookHeight ?? 0.7;
      lx = lx * 0.6 + t.x * 0.4;
      ly = ly * 0.6 + (t.y + th) * 0.4;
      lz = lz * 0.6 + t.z * 0.4;
    }
    // carry a fraction of the shoulder offset into the aim point, which is
    // what actually pushes the hero off-centre instead of just orbiting them
    lx += this._shoulderX * 0.55;
    lz += this._shoulderZ * 0.55;

    this.lookAt.x = damp(this.lookAt.x, lx, 19.0, dt);
    this.lookAt.y = damp(this.lookAt.y, ly, 13.0, dt);
    this.lookAt.z = damp(this.lookAt.z, lz, 19.0, dt);

    // ---- screen shake ----
    let sx = 0, sy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, this.shakeTime) * this.shakeAmount;
      sx = (Math.random() * 2 - 1) * k;
      sy = (Math.random() * 2 - 1) * k;
      if (this.shakeTime <= 0) this.shakeAmount = 0;
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.lookAt);

    // ---- speed FOV kick ----
    const want = this.baseFov + Math.min(player.speed / 7, 1) * 5.5;
    this.fov = damp(this.fov, want, 4.0, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
