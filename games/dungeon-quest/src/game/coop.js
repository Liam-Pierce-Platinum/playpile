// TWO PLAYERS, ONE SCREEN.
//
// The console's answer to co-op was to halve the picture and give each player
// their own camera, and that is what this is. Player one keeps the keyboard
// (or the first pad); player two gets the second pad.
//
// Player two is a full character with their own controller, camera, animator
// and HUD-less status — they are not a follower. Everything they do runs
// through the same systems player one uses, so a spell, a dash, a block and a
// death all behave identically for both.
import * as THREE from 'three';
import { PlayerController } from '../player/controller.js';
import { FollowCamera } from '../camera/followCamera.js';
import { CharacterAnimator } from '../player/animator.js';
import { GamepadInput } from '../player/gamepad.js';

/**
 * A second Input that reads ONLY a chosen pad index, so the two players never
 * steal each other's buttons. It presents the same surface as the keyboard
 * Input, which is what lets the controller and the menus stay device-blind.
 */
export class PadOnlyInput {
  constructor(padIndex = 1) {
    this.padIndex = padIndex;
    this.pad = new GamepadInput();
    this.pad.only = padIndex;
    this.enabled = true;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
  }

  beginFrame() { this.pad.poll(); }
  endFrame() {}
  action(name) { return this.enabled && this.pad.action(name); }
  pressedAction(name) { return this.enabled && this.pad.pressedAction(name); }
  doubleTapped() { return false; }
  down() { return false; }
  pressed() { return false; }
  clicked() { return false; }
  requestLock() {}
  releaseLock() {}

  axis() {
    if (!this.enabled) return { x: 0, y: 0 };
    return { x: this.pad.moveX, y: -this.pad.moveY };
  }
}

export class SecondPlayer {
  constructor(scene, world, rig, classId, opts = {}) {
    this.scene = scene;
    this.rig = rig;
    this.classId = classId;
    scene.add(rig.root);

    this.input = new PadOnlyInput(opts.padIndex ?? 1);
    this.controller = new PlayerController(world);
    this.controller.configure(classId, opts.stats);
    this.animator = new CharacterAnimator(rig);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
    this.follow = new FollowCamera(this.camera, {});
    this.follow.colliders = world.colliders;

    this.active = true;
  }

  get position() { return this.controller.position; }

  /** True while a second pad is actually plugged in. */
  get connected() { return this.input.pad.connected; }

  spawnAt(x, z) {
    this.controller.reset(x, z);
    this.follow._initialized = false;
  }

  setWorld(world) {
    this.controller.world = world;
    this.follow.colliders = world.colliders;
  }

  update(dt, hooks) {
    this.input.beginFrame();
    this.controller.update(dt, this.input, this.follow, null, hooks);
    this.rig.root.position.copy(this.controller.position);
    this.rig.root.rotation.y = this.controller.yaw;
    this.animator.update(dt, this.controller.animState());
    this.follow.update(dt, this.input, this.controller);
    this.input.endFrame();
  }

  dispose() {
    this.rig.root.parent?.remove(this.rig.root);
    this.rig.dispose?.();
  }
}
