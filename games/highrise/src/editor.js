// =====================================================================
// HIGHRISE :: editor.js - FLY THE BUILDING AND FIX WHAT IS WRONG
// =====================================================================
//
// Liam: *"scaling is a big problem so far although graphics are amazing
// you struggle with positioning and scaling ... make it so if I click six
// I have unity style movment and access to edting all of the levels of
// the building"*.
//
// He is right, and it is the one class of mistake the screenshot tools
// cannot catch. A contact sheet tells me whether a vending machine LOOKS
// right; it cannot tell me that it is 1.95 m when it should be 1.80, or
// that it is standing four centimetres inside a wall, because those only
// show up when you can get next to the thing and look at it from angles
// nobody chose in advance.
//
// So: a free camera, click to select, and a panel that puts the actual
// numbers on screen - position, rotation, scale, AND the world size in
// metres, which is the number that is usually wrong. Nudge it until it is
// right and press P; the console gets a line I can paste straight into
// the declaration it came from.
//
// It is a development tool and it makes no attempt to be anything else:
// it does not save, it does not undo, and everything it changes is gone
// when the floor reloads. The point is to find the right number, not to
// build a level editor.
import * as THREE from '../vendor/three.module.js';
import { saveEdits, nameOf, keyOf, stagePlanEdit, PLAN_KEY } from './edits.js';
import { FLOORS } from './building.js';
import { toCell, toWorld, CELL, WALL_H, W as PW, D as PD, WALL, EMPTY, GLASS, CORE } from './plan.js';
import { assetList, spawnProp, removeProp } from './level.js';
import { Gizmo } from './gizmo.js';

const HELP = [
  ['right-drag', 'look around (mouse hides)'],
  ['W A S D', 'fly'],
  ['SPACE / C', 'up / down'],
  ['SHIFT', 'fly fast'],
  ['left click', 'select what is under the cursor'],
  ['drag arrows', 'move it'],
  ['drag ring', 'turn it'],
  ['drag grey cube', 'scale all three axes'],
  ['drag COLOURED cube', 'stretch that axis only  (X red · Y green · Z blue)'],
  ['X/Y/Z + - =', 'stretch one axis from the keyboard'],
  ['arrows', 'move on X / Z'],
  ['PGUP / PGDN', 'move on Y'],
  [', .', 'rotate'],
  ['- =', 'scale'],
  ['[ ]', 'step size'],
  ['F7 / F8', 'fly down / up a storey'],
  ['CTRL+S', 'SAVE — makes every edit permanent'],
  ['P', 'print the numbers to the console'],
  ['BACKSPACE', 'deselect'],
  ['CTRL+D', 'duplicate it where it stands'],
  ['DELETE', 'remove the selected thing'],
  ['F6', 'back to the game'],
];

export class Editor {
  constructor(scene, game, loadFloor) {
    this.scene = scene;
    this.game = game;
    this.loadFloor = loadFloor;
    this.on = false;
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
    this.cam.position.set(0, 6, 14);
    this.yaw = 0; this.pitch = -0.35;
    this.vel = new THREE.Vector3();
    this.step = 0.05;
    this.sel = null;
    this.look = false;
    this.keys = {};
    // WHAT HAS BEEN TOUCHED SINCE THE LAST SAVE, per storey. Only these
    // get written - saving the whole floor would bake thousands of
    // generated transforms into edits.json and freeze the generator.
    this.dirty = new Map();
    this.saving = false;
    this.dragging = false;
    this.note = ''; this.noteT = 0;
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clickAt = null;

    // ---- WALL MODE ----------------------------------------------------
    //
    // Liam: *"let me not just make platforms but select individual walls
    // and extend them so I can change the layout by hand"*.
    //
    // A wall is not a prop and cannot be one. Props are objects with a
    // transform, so an edit moves them; a wall is a CELL in the floor
    // plan, merged into one mesh per material with three hundred others,
    // and the only way to move it is to build the storey again somewhere
    // else. So this is a second, separate mode: B turns it on, the
    // crosshair paints cells, and the storey is rebuilt each stroke.
    this.wallMode = false;
    this.wallCell = null;
    this.wallCursor = new THREE.Mesh(
      new THREE.BoxGeometry(CELL, WALL_H, CELL),
      new THREE.MeshBasicMaterial({ color: 0x50e0ff, wireframe: true, depthTest: false }));
    this.wallCursor.renderOrder = 999;
    this.wallCursor.visible = false;
    scene.add(this.wallCursor);

    // A WIREFRAME BOX ROUND THE SELECTION, not a colour change: the
    // objects here share materials with a dozen others on the floor, so
    // tinting one tints all of them.
    // DRAG HANDLES ON THE SELECTION - see gizmo.js
    this.gizmo = new Gizmo(scene);
    this.boxHelper = new THREE.Box3Helper(new THREE.Box3(), 0x50e0ff);
    this.boxHelper.visible = false;
    scene.add(this.boxHelper);
    // and a grid, so "is this thing level and on the floor" is answerable
    this.grid = new THREE.GridHelper(60, 60, 0x3a4652, 0x232b33);
    this.grid.visible = false;
    scene.add(this.grid);

    this.buildPanel();
    this.buildBar();
    this.bind();
  }

  // -------------------------------------------------------------------
  buildPanel() {
    const el = document.createElement('div');
    el.id = 'editor';
    el.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'bottom:0', 'width:288px', 'z-index:20',
      'background:rgba(10,12,16,.90)', 'color:#cfd3dc', 'display:none',
      'font:11px/1.55 ui-monospace,Consolas,monospace', 'padding:12px 14px',
      'border-right:1px solid #2a323c', 'overflow:auto', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
    this.el = el;
  }

  /**
   * THE ASSET BAR.
   *
   * Liam: *"make it so there is a low bar that I can pull stuff out of
   * like tables and stuff like an asset list I can pull from"*.
   *
   * Every prop the game can make, along the bottom, click one to drop it
   * in front of you. Two rows: what came out of his reference packs, and
   * what the game builds itself - because those are genuinely different
   * kinds of thing and he knows which is which.
   */
  buildBar() {
    const el = document.createElement('div');
    el.id = 'assetbar';
    el.style.cssText = [
      'position:fixed', 'left:288px', 'right:0', 'bottom:0', 'z-index:21',
      'background:rgba(10,12,16,.94)', 'border-top:1px solid #2a323c',
      'font:11px ui-monospace,Consolas,monospace', 'color:#cfd3dc',
      'padding:7px 10px', 'display:none', 'max-height:38vh', 'overflow:auto',
    ].join(';');
    document.body.appendChild(el);
    this.bar = el;
    this.barBuilt = false;
  }

  fillBar() {
    if (this.barBuilt || !this.bar) return;
    let groups;
    try { groups = assetList(); } catch (e) { return; }
    if (!groups.some((g) => g.names.length)) return;   // packs not loaded yet
    this.bar.innerHTML = '';
    for (const { group, names } of groups) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:5px;line-height:1.9';
      const lbl = document.createElement('span');
      // Liam: *"put them each in there own categories"*. One row per
      // category, and the two that matter in a fight get a colour so you
      // can find them without reading.
      const TITLE = {
        enemies: 'ENEMIES', weapons: 'WEAPONS', doors: 'DOORS',
        seating: 'SEATING', kitchen: 'KITCHEN', decoration: 'DECORATION',
        office: 'OFFICE', storage: 'STORAGE', structure: 'STRUCTURE',
        imported: 'FROM YOUR PACKS',
      };
      const HUE = {
        enemies: '#c8412f', weapons: '#e0c040', doors: '#9a7a4a',
        seating: '#7f9a6b', kitchen: '#6b8f9a', decoration: '#9a6b8f',
        storage: '#8a8a6b', structure: '#7a7f8a',
      };
      lbl.textContent = (TITLE[group] || group.toUpperCase()) + '  ';
      lbl.style.cssText = 'color:' + (HUE[group] || '#6b7480')
        + ';letter-spacing:.1em;margin-right:6px;display:inline-block;min-width:96px';
      row.appendChild(lbl);
      for (const nm of names) {
        const b = document.createElement('button');
        b.textContent = nm.replace(/^(foe|gun)_/, '');
        // the variant letter, dimmed, so a row of deskA deskB deskC reads
        // as one prop with three faces rather than three props
        if (/[A-C]$/.test(nm) && !/^(foe|gun)_/.test(nm)) {
          b.textContent = nm.slice(0, -1);
          const v = document.createElement('span');
          v.textContent = nm.slice(-1);
          v.style.cssText = 'opacity:.55;margin-left:3px';
          b.appendChild(v);
        }
        b.style.cssText = [
          'background:#1b2028', 'color:#cfd3dc', 'border:1px solid #2f3945',
          'border-radius:3px', 'padding:2px 7px', 'margin:0 3px 3px 0',
          'cursor:pointer', 'font:inherit',
        ].join(';');
        b.onmouseenter = () => { b.style.background = '#2a3340'; };
        b.onmouseleave = () => { b.style.background = '#1b2028'; };
        b.onclick = (e) => { e.stopPropagation(); this.drop(nm); };
        row.appendChild(b);
      }
      this.bar.appendChild(row);
    }
    this.barBuilt = true;
  }

  /** put one down, four metres in front of the camera, and select it */
  drop(name) {
    const w = this.game.level;
    if (!w) return;
    // ---- WHERE YOU ARE LOOKING, NOT FOUR METRES AHEAD ----------------
    //
    // Liam: *"make the stuff spawn right infront of where the user me is
    // looking"*.
    //
    // It used to step four metres along the camera's HEADING - ignoring
    // pitch entirely - so looking down at a spot on the floor and pressing
    // a button put the thing four metres away at eye height, usually
    // through a wall. Casting a ray through the middle of the screen and
    // dropping it where that ray meets something puts it exactly where
    // the crosshair is, which is what "in front of where I am looking"
    // means when you are aiming at a floor.
    //
    // Nothing under the crosshair - looking out of a window, or up - falls
    // back to a point on the floor plane three metres ahead, so the
    // button always does something.
    const c = this.cam;
    this.ray.setFromCamera({ x: 0, y: 0 }, c);
    let x = null, z = null;
    const hits = this.ray.intersectObject(w.group, true);
    for (const h of hits) {
      if (h.object === this.boxHelper || h.object === this.grid) continue;
      if (h.distance < 0.4) continue;              // not the thing you are inside
      x = h.point.x; z = h.point.z;
      break;
    }
    if (x === null) {
      const dir = this.ray.ray.direction;
      const drop = dir.y < -0.02
        ? (w.base - c.position.y) / dir.y            // meet the floor
        : 3.0 / Math.max(0.2, Math.hypot(dir.x, dir.z));
      const t = Math.max(0.8, Math.min(14, drop));
      x = c.position.x + dir.x * t; z = c.position.z + dir.z * t;
    }
    const g = spawnProp(w, name, +x.toFixed(2), +z.toFixed(2), 0);
    if (!g) { this.game.log('cannot place ' + name); return; }
    if (this.game.building) this.game.building.resync(w);
    this.sel = g;
    this.boxHelper.visible = true;
    this.touch(g);
    this.note = 'placed ' + name; this.noteT = 2;
    this.game.log('placed ' + name);
  }

  /**
   * Copy the selection, exactly where it stands.
   *
   * Liam: *"make ctrl D duplicate an object in the exact area it is in at
   * that moment"*. In place, not offset - the copy lands on top of the
   * original and becomes the selection, so the very next thing you do is
   * drag it off with the gizmo. Offsetting it by a guessed amount would
   * just be a different wrong position to correct.
   *
   * The copy takes the original's rotation and scale too, because the
   * reason you duplicate a thing is almost always to make a row of it.
   */
  duplicate() {
    const w = this.game.level, o = this.sel;
    if (!w || !o) { this.game.log('nothing selected'); return; }
    const name = o.userData.refName || o.userData.propName;
    if (!name) { this.game.log('that is part of the building, not a prop'); return; }
    const g = spawnProp(w, name, +o.position.x.toFixed(2), +o.position.z.toFixed(2), o.rotation.y);
    if (!g) { this.game.log('cannot copy ' + name); return; }
    g.position.y = o.position.y;
    g.scale.copy(o.scale);
    if (this.game.building) this.game.building.resync(w);
    this.sel = g;
    this.boxHelper.visible = true;
    this.touch(g);
    this.note = 'copied ' + name; this.noteT = 2;
    this.game.log('copied ' + name + ' — drag it off');
  }

  /** and take one away */
  erase() {
    const w = this.game.level, o = this.sel;
    if (!w || !o) return;
    const key = keyOf(o);
    if (!removeProp(w, o)) { this.game.log('that is part of the building, not a prop'); return; }
    this.sel = null;
    this.boxHelper.visible = false;
    if (this.game.building) this.game.building.resync(w);
    // RECORDED AS A DELETION, so it stays deleted after a reload. The
    // server prunes a null entry rather than storing it for ever.
    if (!this.dirty.has(w.n)) this.dirty.set(w.n, {});
    this.dirty.get(w.n)[key] = o.userData.handmade ? null : { hidden: true, p: [0, -999, 0] };
    this.note = 'deleted ' + key; this.noteT = 2;
    this.game.log('deleted — CTRL+S to keep it gone');
  }

  bind() {
    addEventListener('keydown', (e) => {
      if (e.code === 'F6') { e.preventDefault(); this.toggle(); return; }
      if (!this.on) return;
      this.keys[e.code] = true;
      this.command(e);
      // Do not let the game see anything while the editor has the keyboard.
      if (e.code !== 'F12') e.preventDefault();
    }, true);
    addEventListener('keyup', (e) => { if (this.on) this.keys[e.code] = false; }, true);

    addEventListener('mousedown', (e) => {
      if (!this.on) return;
      if (e.button === 2) {
        this.look = true;
        e.preventDefault();
        // POINTER LOCK FOR THE DRAG ONLY.
        //
        // Without it the cursor walks to the edge of the window and the
        // turn stops halfway round, which is maddening in a free camera.
        // Locking for the duration of the right-button drag gives an
        // unlimited turn and hands the pointer straight back on release -
        // so the cursor is visible exactly when you need to point at
        // something and out of the way exactly when you do not.
        document.body.classList.add('looking');
        const c = document.getElementById('gl');
        if (c && !document.pointerLockElement) c.requestPointerLock();
      }
      if (e.button === 0 && this.wallMode) {
        // in wall mode the left button paints and nothing else - a
        // selection you cannot see the point of is worse than no
        // selection at all
        this.paintAt(e.clientX, e.clientY, e.shiftKey ? EMPTY : WALL);
        e.preventDefault();
        return;
      }
      if (e.button === 0) {
        // THE GIZMO GETS FIRST REFUSAL. If the pointer is on a handle
        // this is a drag, not a new selection - otherwise grabbing an
        // arrow that happens to lie over another prop would select that
        // prop instead of moving the one you meant.
        if (this.sel) {
          this.rayFrom(e.clientX, e.clientY);
          const h = this.gizmo.pick(this.ray);
          if (h) {
            this.gizmo.begin(h, this.sel, this.ray);
            this.dragging = true;
            e.preventDefault();
            return;
          }
        }
        this.clickAt = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    }, true);
    addEventListener('mouseup', (e) => {
      if (this.on && e.button === 0 && this.dragging) {
        this.dragging = false;
        this.gizmo.end();
        this.touch(this.sel);
        if (this.game.building) this.game.building.resync(this.game.level);
        return;
      }
      if (!this.on || e.button !== 2) return;
      this.look = false;
      document.body.classList.remove('looking');
      if (document.pointerLockElement) document.exitPointerLock();
    }, true);
    // right-drag is the look control, so the browser must keep its menu
    addEventListener('contextmenu', (e) => { if (this.on) e.preventDefault(); }, true);
    addEventListener('mousemove', (e) => {
      if (!this.on) return;
      if (this.dragging) {
        this.rayFrom(e.clientX, e.clientY);
        // SHIFT SNAPS, to the current step size. A gizmo you cannot snap
        // is fine for roughing out and useless for lining two desks up.
        if (this.gizmo.move(this.ray, e.shiftKey ? this.step : 0)) {
          this.touch(this.sel);
          if (this.game.building) this.game.building.resync(this.game.level);
        }
        return;
      }
      if (this.wallMode && !this.look) { this.hoverCell(e.clientX, e.clientY); return; }
      if (this.sel && !this.look) {
        this.rayFrom(e.clientX, e.clientY);
        this.gizmo.paint(this.gizmo.pick(this.ray));
      }
      if (!this.look) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0025));
    }, true);
  }

  toggle() {
    this.on = !this.on;
    this.el.style.display = this.on ? 'block' : 'none';
    this.boxHelper.visible = false;
    this.gizmo.root.visible = false;
    this.grid.visible = this.on;
    // THE HUD COMES OFF.
    //
    // Not tidiness - correctness. The frame loop returns early while the
    // editor is open, so nothing updates the hurt vignette, and it
    // freezes at whatever it was: at boot that is 0.85 red over the whole
    // screen. Judging a texture's colour or a prop's scale through a red
    // filter is worse than not looking at all.
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = this.on ? 'none' : '';
    if (this.on) this.fillBar();
    if (this.bar) this.bar.style.display = this.on ? 'block' : 'none';
    // AND THE MOUSE COMES BACK. The page sets `cursor:none` on the body,
    // which is right for a shooter with a painted crosshair and useless
    // in a tool you click things with - you cannot aim a pointer you
    // cannot see. See the .editing rule in index.html.
    document.body.classList.toggle('editing', this.on);
    document.body.classList.remove('looking');

    if (this.on) {
      // START WHERE THE PLAYER IS. Dropping the camera at the origin means
      // the first thing you do every single time is fly back to whatever
      // you were looking at.
      const p = this.game.player;
      this.cam.position.set(p.pos.x, p.pos.y + 2.6, p.pos.z + 3.5);
      this.yaw = p.yaw; this.pitch = -0.25;
      this.game.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      const boot = document.getElementById('boot');
      if (boot) boot.style.display = 'none';
    } else {
      this.sel = null;
      // ANYTHING HE JUST PUT DOWN BECOMES REAL ON THE WAY OUT. Waiting
      // for a reload to find out whether the room he built works is not
      // "feeling it out".
      if (this.game.combat) this.game.combat.realise(this.game.level);
      // ---- AND THE GAME STARTS AGAIN --------------------------------
      //
      // Opening the editor pauses the game and closing it did NOT unpause
      // it, so F6 out of the editor left you standing in a frozen world:
      // nothing stepped, so you could not pick anything up, could not
      // fire, and nothing moved. A test of the flare gun found it - the
      // pickup was on the floor, the player was standing on it, and
      // loot() had not run for a single frame.
      //
      // If the pointer lock is refused the existing pointerlockchange
      // handler puts the pause screen back up, so this cannot strand him
      // either way.
      if (this.game.player && this.game.player.alive) {
        this.game.paused = false;
        const c = document.getElementById('gl');
        if (c && !document.pointerLockElement) c.requestPointerLock();
      }
    }
    // and markers are visible while building and invisible while playing
    const w2 = this.game.level;
    if (w2 && w2.group) for (const o of w2.group.children)
      if (o.userData.isMarker) o.visible = this.on;
  }

  // -------------------------------------------------------------------
  command(e) {
    const s = this.sel;
    const k = e.code;
    if (k === 'BracketLeft') this.step = Math.max(0.005, this.step / 2);
    if (k === 'BracketRight') this.step = Math.min(2, this.step * 2);
    if (k === 'Backspace') { this.sel = null; this.boxHelper.visible = false; }
    if (k === 'Delete') { this.erase(); return; }
    // FLY A STOREY, do not reload one. The building is physical now
    // (building.js): floor 4 is simply twelve metres up, so "go to floor
    // 4" is a camera move, and the floor you left stays exactly as it is.
    if (k === 'F7') this.goFloor(this.game.floor - 1);
    if (k === 'F8') this.goFloor(this.game.floor + 1);
    if (k === 'KeyB' && !e.ctrlKey && !e.metaKey) { this.toggleWallMode(); return; }
    if (k === 'KeyS' && (e.ctrlKey || e.metaKey)) { this.save(); return; }
    if (k === 'KeyD' && (e.ctrlKey || e.metaKey)) { this.duplicate(); return; }
    if (!s) return;
    const d = this.step;
    // ---- THE ARROWS MOVE IT THE WAY YOU ARE LOOKING ------------------
    //
    // Liam: *"make the arrows left right and up down swapped right now
    // they are opposite so swap them"*.
    //
    // They were opposite, and swapping them would have been the wrong
    // fix: these moved along WORLD x and z, so whether LEFT went left
    // depended entirely on which way the camera happened to be facing.
    // Facing -Z they were correct; facing +Z all four were inverted,
    // which is the case he hit. Swapping would have fixed that facing and
    // broken the other one.
    //
    // So they are camera-relative now - left is left from where you are
    // standing, always. SNAPPED to the nearest world axis rather than
    // taken as the raw heading, because a nudge should stay square to the
    // building: at a 40-degree camera angle a free-direction nudge walks
    // a desk diagonally off the grid and there is no way back.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const F = Math.abs(fx) > Math.abs(fz)          // forward, snapped
      ? { x: Math.sign(fx), z: 0 } : { x: 0, z: Math.sign(fz) };
    const R = { x: -F.z, z: F.x };                 // right of that
    if (k === 'ArrowLeft')  { s.position.x -= R.x * d; s.position.z -= R.z * d; }
    if (k === 'ArrowRight') { s.position.x += R.x * d; s.position.z += R.z * d; }
    if (k === 'ArrowUp')    { s.position.x += F.x * d; s.position.z += F.z * d; }
    if (k === 'ArrowDown')  { s.position.x -= F.x * d; s.position.z -= F.z * d; }
    if (k === 'PageUp') s.position.y += d;
    if (k === 'PageDown') s.position.y -= d;
    if (k === 'Comma') s.rotation.y -= 0.0873;          // five degrees
    if (k === 'Period') s.rotation.y += 0.0873;
    // SCALE IS A RATIO, not an addition. Nudging a scale by 0.05 is a
    // different amount of change on a 0.3 m prop and a 2 m one, and it is
    // the small ones that are usually wrong.
    // - and = scale everything. Hold X, Y or Z and they scale that axis
    // alone, which is the fast way to stretch a wall without going near
    // the gizmo.
    // this.keys is keyed by e.code, so the names are KeyX / KeyY / KeyZ.
    const ax = this.keys.KeyX ? 'x' : this.keys.KeyY ? 'y' : this.keys.KeyZ ? 'z' : null;
    if (k === 'Minus' || k === 'Equal') {
      const m = k === 'Equal' ? (1 + d) : 1 / (1 + d);
      if (ax) s.scale[ax] = Math.max(0.02, s.scale[ax] * m);
      else s.scale.multiplyScalar(m);
    }
    if (k === 'KeyP') this.print();
    // THE COLLIDER FOLLOWS THE OBJECT, and it follows it NOW - not on the
    // next reload. Liam moves a desk and walks into it a second later;
    // if collision only caught up at boot, the editor would be a tool for
    // making the level worse.
    if ('ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Comma Period Minus Equal'
        .split(' ').includes(k) && this.game.building)
      this.game.building.resync(this.game.level);
    // anything that changed it is a thing worth remembering
    if ('ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Comma Period Minus Equal'
        .split(' ').includes(k)) this.touch(s);
  }

  /**
   * What to call the thing you clicked. Most of a floor is merged
   * structure with no name at all, and "(unnamed)" tells you nothing -
   * whereas "Mesh 4296 tris #8a8378" is enough to know you have hold of
   * the walls and not the ceiling.
   */
  label(s) {
    if (s.userData.refName) return s.userData.refName;
    if (s.name) return s.name;
    let tris = 0, col = null;
    s.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const a = o.geometry.index || o.geometry.attributes.position;
      tris += a.count / 3;
      if (!col && o.material && o.material.color) col = o.material.color.getHexString();
    });
    return s.type + ' · ' + Math.round(tris) + ' tris' + (col ? ' · #' + col : '');
  }

  /**
   * Move the free camera to a storey. Nothing is rebuilt and nothing is
   * unloaded - the building only needs telling that somebody is up there
   * so it can generate what has never been visited.
   */
  goFloor(n) {
    const B = this.game.building;
    if (!B) { this.loadFloor(Math.max(1, n)); return; }
    const t = Math.max(1, Math.min(FLOORS, n));
    const w = B.ensure(t);
    if (!w) return;
    // the PLAYER is what the building tracks, so he goes too - otherwise
    // it hides the storey you just flew to
    const p = this.game.player;
    p.pos.y = w.base + 0.05;
    p.vel.set(0, 0, 0);
    B.update(p.pos.y + 0.05);
    this.cam.position.y = w.base + 2.6;
    this.game.floor = t;
    // AND game.level, or touch() keys your edits against the storey you
    // flew away from and saves them onto the wrong floor.
    this.game.level = w;
    const el = document.getElementById('fnum');
    if (el) el.textContent = t;
  }

  /** remember that this object has been moved, so SAVE knows to write it */
  touch(o) {
    if (!o) return;
    const w = this.game.level;
    if (!w) return;
    if (w.group.children.indexOf(o) < 0) return;   // not a thing this can key
    // KEYED TO THE OBJECT, NOT ITS POSITION IN A LIST. See edits.js: the
    // old index-based key was invalidated by any change to the furnisher,
    // which meant my own work silently threw away his.
    const key = keyOf(o);
    if (!this.dirty.has(w.n)) this.dirty.set(w.n, {});
    const rec = {
      p: [+o.position.x.toFixed(4), +o.position.y.toFixed(4), +o.position.z.toFixed(4)],
      r: +o.rotation.y.toFixed(5),
      // one number while it is uniform, three when it is not: the file
      // stays readable and every edit made before non-uniform scaling
      // existed still loads
      s: (Math.abs(o.scale.x - o.scale.y) < 1e-4 && Math.abs(o.scale.x - o.scale.z) < 1e-4)
        ? +o.scale.x.toFixed(5)
        : [+o.scale.x.toFixed(5), +o.scale.y.toFixed(5), +o.scale.z.toFixed(5)],
    };
    // A THING HE PLACED HIMSELF HAS TO SAY WHAT IT IS. The generator will
    // never make it, so the only record that it exists at all is this.
    if (o.userData.handmade) rec.add = nameOf(o);
    this.dirty.get(w.n)[key] = rec;
  }

  /**
   * WRITE IT DOWN. Liam: *"make it so that all edits I make are
   * permenetly changed"*.
   *
   * Everything touched since the last save, on every storey visited this
   * session, goes to the server and into edits.json - which building.js
   * reads back on every future boot. Nothing else is written.
   */
  // ===================================================================
  // WALL MODE
  // ===================================================================

  toggleWallMode() {
    this.wallMode = !this.wallMode;
    this.wallCursor.visible = false;
    if (this.wallMode) {
      this.sel = null;
      this.boxHelper.visible = false;
      this.gizmo.hide && this.gizmo.hide();
      this.note = 'WALL MODE — click to build, shift-click to knock through, B to leave';
    } else {
      this.note = 'wall mode off';
    }
    this.noteT = 4;
  }

  /**
   * Which cell of the floor plan the pointer is over.
   *
   * The ray is cast at the storey's own FLOOR PLANE rather than at the
   * geometry. Hitting the geometry sounds better and is worse: aim at a
   * wall and you get the cell the wall is in only if you hit its top;
   * hit its side and the intersection is on the boundary between two
   * cells and rounds either way depending on which face you caught.
   * A plane at the carpet is unambiguous, and it is the plane the plan
   * grid actually lives on.
   */
  cellUnder(px, py) {
    this.rayFrom(px, py);
    const y = (this.game.floor - 1) * WALL_H;
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    const t = (y - o.y) / d.y;
    if (t <= 0) return null;
    const wx = o.x + d.x * t, wz = o.z + d.z * t;
    const [cx, cz] = toCell(wx, wz);
    if (cx < 0 || cz < 0 || cx >= PW || cz >= PD) return null;
    return [cx, cz];
  }

  hoverCell(px, py) {
    const c = this.cellUnder(px, py);
    this.wallCell = c;
    this.wallCursor.visible = !!c;
    if (!c) return;
    const [wx, wz] = toWorld(c[0], c[1]);
    this.wallCursor.position.set(wx, (this.game.floor - 1) * WALL_H + WALL_H / 2, wz);
  }

  /**
   * Paint one cell and build the storey again.
   *
   * Rebuilding a whole floor per click sounds heavy and is about a
   * hundred milliseconds - and it is the only honest option, because a
   * wall's geometry is merged into the floor's. Trying to add one box in
   * place would leave the collision grid, the AI's flow field and the
   * plan's own room list all describing a building that no longer exists.
   */
  paintAt(px, py, v) {
    const c = this.cellUnder(px, py);
    if (!c) return;
    const n = this.game.floor;

    // ---- A WALL YOU BUILD MATCHES WHAT IT IS BUILT ONTO ---------------
    //
    // Liam: *"the wall that I can make right now is not the right
    // texture"*.
    //
    // It was not a material bug - tools/wallskin.mjs fires a ray at a
    // painted wall and at a built one and they come back as the same
    // merged mesh with the same 512 sheet. The trouble is that painting
    // always wrote WALL, and WALL is office plaster. The building has
    // three kinds of structure: plaster partitions, the BRICK core the
    // stairs are cut into, and GLASS curtain wall. Continue the core with
    // a painted cell and you got a strip of magnolia plasterboard let
    // into the brickwork; continue the glazing and you got the same in
    // the middle of a window.
    //
    // So a new cell takes the kind of the structure it touches. Painting
    // in open floor still gives a partition, which is what it should give
    // - there is nothing to match.
    if (v === WALL) {
      const P = this.game.level && this.game.level.plan;
      if (P) {
        const tally = {};
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = P.at(c[0] + ox, c[1] + oz);
          if (q === CORE || q === GLASS) tally[q] = (tally[q] || 0) + 1;
        }
        const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
        if (best) v = +best;
      }
    }
    const rec = stagePlanEdit(n, c[0], c[1], v);
    if (!this.dirty.has(n)) this.dirty.set(n, {});
    this.dirty.get(n)[PLAN_KEY] = rec;
    if (this.game.building) {
      this.game.building.rebuild(n);
      const w = this.game.building.floors.get(n);
      if (w) { this.game.level = w; this.game.building.resync(w); }
    }
    const KIND = { 1: 'wall', 2: 'glass', 3: 'brick core' };
    this.note = (v ? KIND[v] + ' at ' : 'cleared ') + c[0] + ',' + c[1]
      + '  (' + rec.cells.length + ' cell edits on floor ' + n + ')';
    this.noteT = 2.5;
  }

  async save() {
    if (this.saving || !this.dirty.size) {
      if (!this.dirty.size) this.game.log('nothing changed to save');
      return;
    }
    this.saving = true;
    const floors = [...this.dirty.keys()];
    try {
      let total = 0;
      for (const [floor, items] of this.dirty) {
        const r = await saveEdits(floor, items);
        total = r.edits;
      }
      this.dirty.clear();
      this.game.log('saved — ' + total + ' edits on ' + floors.length + ' floor(s)');
      this.note = 'SAVED ' + total + ' edits';
      this.noteT = 3;
    } catch (e) {
      this.game.log('SAVE FAILED: ' + e.message);
      this.note = 'SAVE FAILED — ' + e.message;
      this.noteT = 8;
      console.error(e);
    }
    this.saving = false;
  }

  print() {
    const s = this.sel;
    if (!s) return;
    const b = new THREE.Box3().setFromObject(s);
    const sz = b.getSize(new THREE.Vector3());
    const f = (v) => v.toFixed(3);
    const name = this.label(s);
    console.log(
      '%c' + name + '%c\n' +
      '  position [' + f(s.position.x) + ', ' + f(s.position.y) + ', ' + f(s.position.z) + ']\n' +
      '  rotationY ' + (s.rotation.y * 180 / Math.PI).toFixed(1) + ' deg\n' +
      '  scale    ' + f(s.scale.x) + ' x ' + f(s.scale.y) + ' x ' + f(s.scale.z) + '\n' +
      '  SIZE     ' + f(sz.x) + ' x ' + f(sz.y) + ' x ' + f(sz.z) + ' m' +
      (s.userData.refName
        ? '\n  -> refprops.js:  ' + s.userData.refName + ': { ..., size: '
          + f(Math.max(sz.x, sz.y, sz.z)) + ' }'
        : ''),
      'color:#7de08a;font-weight:bold', 'color:inherit');
    this.game.log('printed ' + name + ' to the console');
  }

  // -------------------------------------------------------------------
  /** point `this.ray` at a screen position */
  rayFrom(px, py) {
    this.mouse.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.cam);
  }

  pick(w, h) {
    if (!this.clickAt) return;
    this.mouse.set((this.clickAt.x / w) * 2 - 1, -(this.clickAt.y / h) * 2 + 1);
    this.clickAt = null;
    this.ray.setFromCamera(this.mouse, this.cam);
    const hits = this.ray.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (hit.object === this.boxHelper || hit.object === this.grid) continue;
      // WALK UP TO SOMETHING WORTH SELECTING. The thing under the cursor
      // is usually a Mesh three levels inside an imported group; selecting
      // the mesh lets you move a vending machine's door away from the
      // vending machine, which is never what anybody meant.
      let o = hit.object;
      while (o.parent && o.parent !== this.scene && !o.userData.refName
             && !o.parent.userData.editorContainer) o = o.parent;
      this.sel = o;
      this.boxHelper.visible = true;
      return;
    }
    this.sel = null;
    this.boxHelper.visible = false;
  }

  update(dt, w, h) {
    if (!this.on) return;
    this.pick(w, h);

    // ---- Unity-style fly ---------------------------------------------
    const fast = this.keys.ShiftLeft || this.keys.ShiftRight ? 4 : 1;
    const slow = this.keys.ControlLeft ? 0.25 : 1;
    const sp = 7 * fast * slow;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const want = new THREE.Vector3();
    if (this.keys.KeyW) { want.x -= fx; want.z -= fz; }
    if (this.keys.KeyS) { want.x += fx; want.z += fz; }
    if (this.keys.KeyA) { want.x -= fz; want.z += fx; }
    if (this.keys.KeyD) { want.x += fz; want.z -= fx; }
    if (this.keys.Space) want.y += 1;
    if (this.keys.KeyC) want.y -= 1;
    if (want.lengthSq()) want.normalize().multiplyScalar(sp);
    // a little inertia, because a camera that stops dead is hard to aim
    this.vel.lerp(want, Math.min(1, dt * 12));
    this.cam.position.addScaledVector(this.vel, dt);
    // pitch also drives forward motion, which is what makes it feel Unity
    if (this.keys.KeyW || this.keys.KeyS) {
      const s2 = (this.keys.KeyW ? 1 : -1) * sp * dt * Math.sin(this.pitch);
      this.cam.position.y += s2;
    }
    this.cam.rotation.set(0, 0, 0);
    this.cam.rotateY(this.yaw);
    this.cam.rotateX(this.pitch);

    if (this.sel) {
      this.boxHelper.box.setFromObject(this.sel);
      this.boxHelper.visible = true;
    }
    this.gizmo.update(this.sel, this.cam);
    const base = (this.game.level && this.game.level.base) || 0;
    this.grid.position.set(Math.round(this.cam.position.x), base + 0.01,
                           Math.round(this.cam.position.z));
    if (this.noteT > 0) this.noteT -= dt;
    this.panel();
  }

  panel() {
    const s = this.sel;
    let unsaved = 0;
    for (const items of this.dirty.values()) unsaved += Object.keys(items).length;
    const f = (v) => (v >= 0 ? ' ' : '') + v.toFixed(3);
    let info = '<span style="color:#6b7480">nothing selected — left click something</span>';
    if (s) {
      const b = new THREE.Box3().setFromObject(s);
      const sz = b.getSize(new THREE.Vector3());
      const name = this.label(s);
      info = '<b style="color:#7de08a">' + name + '</b><br>'
        + 'pos   ' + f(s.position.x) + f(s.position.y) + f(s.position.z) + '<br>'
        + 'rotY  ' + (s.rotation.y * 180 / Math.PI).toFixed(1) + '&deg;<br>'
        + 'scale ' + f(s.scale.x) + ' ' + f(s.scale.y) + ' ' + f(s.scale.z) + '<br>'
        + '<span style="color:#f0d9a8">size  ' + sz.x.toFixed(3) + ' x '
        + sz.y.toFixed(3) + ' x ' + sz.z.toFixed(3) + ' m</span><br>'
        + '<span style="color:#6b7480">bottom at y = ' + b.min.y.toFixed(3) + '</span>';
    }
    this.el.innerHTML =
      '<div style="color:#c8412f;letter-spacing:.22em;font-weight:700">EDITOR</div>'
      + '<div style="color:#6b7480;margin-bottom:10px">floor ' + this.game.floor
      + ' &middot; step ' + this.step.toFixed(3) + ' m</div>'
      + (this.noteT > 0
          ? '<div style="color:#7de08a;margin-bottom:8px">' + this.note + '</div>' : '')
      + (unsaved
          ? '<div style="color:#e8b45a;margin-bottom:8px">' + unsaved
            + ' unsaved change' + (unsaved === 1 ? '' : 's') + ' — CTRL+S</div>' : '')
      + '<div style="border-top:1px solid #2a323c;padding-top:8px;margin-bottom:10px">' + info + '</div>'
      + '<div style="border-top:1px solid #2a323c;padding-top:8px;color:#6b7480">'
      + HELP.map(([k, v]) => '<div><span style="color:#cfd3dc;display:inline-block;width:96px">'
          + k + '</span>' + v + '</div>').join('')
      + '</div>';
  }
}
