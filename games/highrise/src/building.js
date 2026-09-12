// =====================================================================
// HIGHRISE :: building.js - ONE BUILDING, NOT ELEVEN LEVELS
// =====================================================================
//
// Liam: *"when I said make stairs physical I meant in like a each level
// is physical not the transport to the next level is physical like its
// like a physical building with levels"*.
//
// He is right and I built the wrong thing. The stairs were physical - you
// climbed real treads - but the top of them ran a trigger that tore the
// floor out of the scene, built a new one, and put you at the bottom of
// the next flight with a fade over it. From the inside that is a lift
// with extra steps. A building is not a sequence of rooms you are moved
// between; it is one object with height, and the whole point of a
// stairwell is that you can look down it.
//
// So: every storey exists at its true altitude at the same time, in the
// same scene, in the same coordinate system. Floor 3's carpet is at
// y = 6.0 because it IS six metres up. You climb the stairs and you are
// on floor 3, not because anything fired but because that is where your
// feet are. Look back down the well and floor 2 is under you with the
// bodies still on it.
//
// WHAT THAT COSTS, and how it is paid:
//
//   - Geometry. Eleven storeys of merged meshes is a lot of draw calls,
//     so only the three you can possibly see - below, on, above - are
//     visible. They are never destroyed, only hidden, because a floor
//     that rebuilds is a floor that forgets where the bodies were.
//   - Build time. A storey takes a moment to generate, so they are built
//     on FIRST APPROACH rather than all at boot, and then kept forever.
//     You can only ever be one storey away from an unbuilt one.
//   - Collision. The player needs the solids of three storeys at once, in
//     absolute coordinates. Those are computed once per floor at build
//     and re-concatenated only when he changes storey - not per frame.
//
// The floor number is now a READING, not a state: it is derived from the
// player's height. Nothing sets it, and nothing can disagree with it.
import * as THREE from '../vendor/three.module.js';
import { plan } from './plan.js';
import { build, WALL_H, syncProps, spawnProp, clearDoorways, clearMiddles,
         thinOut } from './level.js';
import { applyEdits, applyPlanEdits, PLAN_KEY } from './edits.js';
import { buildNav } from './nav.js';

import { FLOOR_COUNT } from './mode.js';

// THREE IN BUILD MODE, ELEVEN IN PLAY. Liam: *"get me three empty floors
// that I can fill out"* - a building you can hold in your head while you
// work on it, rather than eleven you will never finish.
export const FLOORS = FLOOR_COUNT;

export class Building {
  constructor(scene) {
    this.scene = scene;
    this.floors = new Map();
    this.cur = 0;
    this.solids = [];
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  static baseY(n) { return (n - 1) * WALL_H; }

  /**
   * Throw a storey away and build it again.
   *
   * A wall edit changes the plan, and the plan is only read at build
   * time, so there is nothing to update in place. ensure() re-applies the
   * floor's saved PROP edits on the way back, so nothing anyone has
   * placed is lost in the rebuild.
   */
  rebuild(n) {
    const old = this.floors.get(n);
    if (old) {
      this.root.remove(old.group);
      old.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      this.floors.delete(n);
    }
    const w = this.ensure(n);
    if (this._lastY !== undefined) this.update(this._lastY);
    return w;
  }

  /** the storey a given height is standing on */
  static at(y) {
    return Math.min(FLOORS, Math.max(1, Math.floor(y / WALL_H + 0.02) + 1));
  }

  /** build storey n if it does not exist yet, and keep it forever */
  ensure(n) {
    if (n < 1 || n > FLOORS) return null;
    if (this.floors.has(n)) return this.floors.get(n);

    const P = plan(n);
    // THE LAYOUT EDITS GO ON FIRST - a wall has no transform, so the only
    // way to move one is to build it somewhere else. See edits.js.
    const cells = applyPlanEdits(P, n);
    if (cells) console.log('floor ' + n + ': ' + cells + ' wall cell(s) edited');
    const w = build(P);
    const base = Building.baseY(n);
    w.n = n; w.base = base; w.plan = P;
    // the men's map of this storey, now that it has a plan to read
    buildNav(w);
    w.group.position.y = base;
    // A CONTAINER, not a selectable object - see Editor.pick().
    w.group.userData.editorContainer = true;
    w.group.userData.floor = n;

    // EVERYTHING THE REST OF THE GAME READS IS ABSOLUTE.
    //
    // level.js builds a storey in its own frame with the carpet at zero,
    // which is right - it should not have to know how high up it is. This
    // is the one place that translation happens, once, at build time,
    // rather than every frame in the collision loop.
    // Filled in below, AFTER the saved edits have moved things - see
    // the note on order at the applyEdits call.
    w.solidsAbs = [];
    if (w.stairTop) {
      w.stairAbs = { ...w.stairTop, y: w.stairTop.y + base };
      if (w.stairTop.foot) w.stairAbs.foot = { ...w.stairTop.foot };
    }
    if (w.hole) w.holeAbs = { ...w.hole, y0: base, y1: base + WALL_H };

    // THE ROOF. The top storey has nothing above it to be its ceiling, so
    // without this you climb the last flight and walk off into the sky.
    if (n === FLOORS) {
      const S = 200;
      w.solidsAbs.push({ x: 0, y: base + WALL_H + 0.3, z: 0, w: S, h: 0.6, d: S, slab: true });
    }

    // AND THE CORRECTIONS GO ON, before anyone sees it.
    //
    // Applied after build and before the group is added to the scene, so
    // a storey never appears wrong and then snaps. The solids were
    // computed above from the GENERATED transforms - an edit that moves a
    // prop does not move its collider, which is a real limitation and the
    // right trade: the alternative is re-deriving every collider on every
    // floor build to catch the handful of props anyone has nudged.
    // WHERE THE GENERATOR PUT EACH THING, recorded before anything is
    // allowed to move it. This is the identity an edit is keyed to, so it
    // has to be the ORIGINAL position - not where the user has since
    // dragged it - or the key would change every time he saved.
    for (const o of w.group.children) {
      o.userData.gen = { x: +o.position.x.toFixed(3),
                         y: +o.position.y.toFixed(3),
                         z: +o.position.z.toFixed(3) };
    }

    const edited = applyEdits(w, spawnProp);
    if (edited) console.log('floor ' + n + ': ' + edited + ' saved edit(s) applied');

    // ---- AND ONLY NOW IS THE ROOM AS FULL AS IT IS GOING TO BE ------
    //
    // build() already thins the furniture, but Liam's own placements land
    // AFTER it — and on floor 1 that is 178 of them. The break room he
    // walked into measured 22% standable because the generator had filled
    // it and then eighteen counters, a fridge, a microwave and a vending
    // machine of his went in on top of that.
    //
    // Running it again here is the whole fix, and the ORDER is the point:
    // his props are never removed (they are `handmade`), so what gives
    // way is ours. If he wants to brick a room up, he still can.
    // ---- AND ONLY NOW ARE THE COLLIDERS TRUE ------------------------
    //
    // Order matters and it did not use to. The absolute collider list was
    // built from the generated positions and THEN the saved edits moved
    // the models, so every prop Liam had ever repositioned had its
    // collision left behind at the factory setting. Deriving after the
    // edits - and from the objects themselves, via syncProps - is what
    // makes a moved prop actually solid where it now stands.
    syncProps(w);

    // ---- AND ONLY NOW IS THE ROOM AS FULL AS IT IS GOING TO BE ------
    //
    // build() already thins the furniture, but Liam's own placements land
    // AFTER it - on floor 1 that is 157 of them - so the count build()
    // made was of half the room. The break room he walked into measured
    // 22% standable because the generator had filled it and then eighteen
    // counters, a fridge, a microwave and a vending machine of his went in
    // on top.
    //
    // It has to be AFTER syncProps, not before: until the colliders are
    // rebuilt from the edited positions, `w.props` is the pre-edit list
    // and the pass measures a room nobody is standing in. Called one
    // paragraph earlier it removed nothing at all and looked as if it did
    // not work.
    //
    // The ORDER of the two is the point: HIS props are never removed
    // (they are `handmade`), so what gives way is ours. If he wants to
    // brick a room up, he still can.
    // THE ORDER MATTERS: doorways, then the middle of the room, then
    // whatever is still too much. clearMiddles takes out the islands you
    // walk into, which is most of the crowding, so thinOut usually has
    // nothing left to do by the time it runs.
    const cleared = clearDoorways(w) + clearMiddles(w) + thinOut(w);
    if (cleared) console.log('floor ' + n + ': ' + cleared
      + ' of our props removed to keep it walkable');

    w.solidsAbs = w.struct.map((b) => ({ ...b, y: b.y + base })).concat(w.props);
    w.solids = w.struct.concat(w.props);

    this.root.add(w.group);
    this.floors.set(n, w);
    return w;
  }

  /**
   * Tell the building where the player is. Builds what he is about to
   * need, shows what he can see, hides what he cannot, and returns true
   * if he has changed storey since last time.
   */
  update(y) {
    this._lastY = y;
    const n = Building.at(y);
    if (n === this.cur) return false;
    this.cur = n;

    // ONE STOREY OF LOOK-AHEAD IN EACH DIRECTION. You cannot get further
    // than that from where you are without passing through here again.
    for (const k of [n, n + 1, n - 1]) this.ensure(k);

    for (const [k, w] of this.floors) w.group.visible = Math.abs(k - n) <= 1;

    // the collision set: three storeys, concatenated once
    this.solids = [];
    for (const k of [n - 1, n, n + 1]) {
      const w = this.floors.get(k);
      if (w) this.solids = this.solids.concat(w.solidsAbs);
    }
    return true;
  }

  /**
   * A prop moved. Re-derive that storey's colliders and the live set.
   *
   * Called by the editor on every nudge, so what you can walk into
   * matches what you can see WHILE you are dragging things about, not
   * only after a reload.
   */
  resync(w) {
    if (!w) return;
    syncProps(w);
    w.solidsAbs = w.struct.map((b) => ({ ...b, y: b.y + w.base })).concat(w.props);
    w.solids = w.struct.concat(w.props);
    this.solids = [];
    for (const k of [this.cur - 1, this.cur, this.cur + 1]) {
      const f = this.floors.get(k);
      if (f) this.solids = this.solids.concat(f.solidsAbs);
    }
  }

  get(n) { return this.floors.get(n) || null; }
  current() { return this.floors.get(this.cur) || null; }

  /** the plan grid at a given height, for AI, blood and gibs */
  planAt(y) {
    const w = this.floors.get(Building.at(y));
    return w ? w.plan : null;
  }
}
