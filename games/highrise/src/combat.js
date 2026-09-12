// =====================================================================
// HIGHRISE :: combat.js - SHOOTING, HITTING, BLEEDING, LOOTING
// =====================================================================
//
// Liam, this round: *"numbers don't swap through weapons or at least not
// visibly"*, *"no clear way to loot bodies which is a huge thing"*, *"add
// good looking muzzel flash"*, *"a very brutal violent with realistic
// blood physics"*, *"add in hand to hand combat"*, and *"make the NPC's
// smart able to shoot and have random weapons and capable of hand to hand
// combat"*.
//
// Every one of those was a real gap and each is fixed at its cause:
//
//   * SWAPPING. setWeapon() used to return false in silence if you did
//     not own the weapon - and you only ever owned two of the seven, so
//     five of the number keys did nothing and said nothing. There is now
//     a visible eight-slot strip, un-owned slots are drawn dark, and
//     pressing a key you cannot use tells you why.
//   * LOOTING. It was instant and silent and only guns dropped. Bodies
//     now say what they are carrying, from across a room, and everything
//     drops - including the melee weapons, which were the interesting
//     half of the loot table and never appeared.
//   * FLASH. There was none. See fx.js.
//   * BLOOD. See blood.js - five kinds now, and it goes up walls.
//   * FISTS. A whole weapon, with a combo, plus a takedown from behind.
//   * NPCs. Random loadouts from a weighted table, and any of them will
//     drop the gun and come at you with their hands when the magazine is
//     empty and you are too close for them to reload.
import * as THREE from '../vendor/three.module.js';
import { GUNS, ORDER, weaponMesh, muzzleOf } from './guns.js';
import { MARKERS } from './props.js';
import { slide, unstick, buildNav } from './nav.js';
import { Hands } from './hands.js';
import { makeActor } from './actor.js';
import { think, Squad, canSee } from './ai.js';
import { blocker } from './collide.js';
import { toWorld, toCell, W, D, EMPTY } from './plan.js';
import { rng } from './rng.js';
import { GEN } from './mode.js';
import { FX } from './fx.js';
import { Blood } from './blood.js';
import { Gore } from './gore.js';
import { holdFor } from './anim.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 6.28318; while (d < -Math.PI) d += 6.28318; return d; };

// What each weapon does when it is swung AT you, rather than by you.
// Deliberately its own table - see the note where it is used.
const ENEMY_MELEE = { fists: 13, knife: 26, bat: 22, axe: 36, ext: 20 };

// Where a bullet landed on a man, so the flinch and the blood know.
function partAt(y, h) {
  const f = y / h;
  if (f > 0.86) return 'head';
  if (f < 0.42) return Math.random() < 0.5 ? 'legR' : 'legL';
  if (f > 0.62 && Math.random() < 0.30) return Math.random() < 0.5 ? 'armR' : 'armL';
  return 'body';
}

export class Combat {
  constructor(scene, camera, game) {
    this.scene = scene; this.camera = camera; this.game = game;
    this.fx = new FX(scene);
    this.blood = new Blood(scene, camera);
    this.gore = new Gore(scene, this.blood);
    this.actors = [];
    this.pickups = [];
    // ONE SQUAD PER STOREY, and a record of which storeys have been
    // peopled - because populate() is now called every time you climb
    // into somewhere new and must not fill the same floor twice.
    this.squads = new Map();
    this.peopled = new Set();
    this.building = null;
    this.tracers = new THREE.Group(); scene.add(this.tracers);

    // ---- what the player has -----------------------------------------
    //
    // Liam: *"give the player less ammo and just a glock and a knife at
    // the start with the enemies having like way less bulllets when
    // looting"*.
    //
    // One magazine in the gun and one in your pocket. That is the whole
    // ammunition economy at the start of a run, and it is deliberately
    // not enough - thirty-four rounds does not clear a floor of sixteen
    // men, so the answer to the floor has to be the machete, the fists,
    // and whatever you take off the first man you get close enough to.
    // Ammunition being scarce is what makes closing the distance the
    // point of the game rather than a stunt.
    this.held = 'glock';
    this.ammo = { glock: 17, ak: 0, shotgun: 0, ext: 100, flare: 2 };
    this.mag = { glock: 17, ak: 0, shotgun: 0, ext: 100, flare: 1 };
    // FISTS ARE ALWAYS OWNED. They are slot 1, they never run out, and
    // being able to fall back to them is what stops an empty magazine
    // being the end of the fight.
    this.owned = new Set(['fists', 'knife', 'glock']);
    this.cool = 0; this.reloading = 0; this.kick = 0;
    this.combo = 0; this.comboT = 0;
    this.hands = new Hands(camera);
    scene.add(camera);
    this.setWeapon('glock');
    this.buildSlots();
  }

  // ---- population ----------------------------------------------------
  /**
   * Fill storey `floor` with men, ONCE.
   *
   * This used to wipe the game: every actor removed, every pickup
   * removed, the blood cleared. That made sense when only one storey
   * existed at a time. Now the building is physical (building.js) and
   * floor 2 is still down there while you are on floor 3, with the bodies
   * and the shell casings and the blood exactly where you left them - so
   * this ADDS a storey's worth of men and never takes any away.
   *
   * Everything a man needs to know about where he is lives on him:
   * `base` is his storey's altitude and `P` is his storey's grid. Two
   * men on two floors think against two different maps in the same loop.
   */
  populate(P, floor, base = 0) {
    if (this.peopled.has(floor)) return;
    this.peopled.add(floor);
    // BUILD MODE HAS NOBODY IN IT. Liam is placing the men himself.
    if (!GEN.men) { this.squads.set(floor, new Squad(P)); return 0; }
    this.squads.set(floor, new Squad(P));

    const r = rng(floor * 104729 + 7);
    // A LOT MORE, AND THEY GO DOWN FAST. Liam: *"add in a lot of enemies
    // that are easier to kill"*. Sixteen men with sixty hit points is a
    // completely different game from six with a hundred and ten: the floor
    // stops being a series of duels and becomes a room you have to keep
    // moving through, which is the John Wick shape.
    const n = Math.min(34, 10 + Math.floor(floor * 0.9));
    const roster = ['guard', 'guard', 'suit', 'rifle', 'runner', 'heavy', 'brawler'];
    const bias = Math.min(1, floor / 30);

    // ---- NOBODY IS STANDING WHERE YOU ARRIVE -------------------------
    //
    // Liam: *"make the player not spawn next to bad guys"*.
    //
    // Men were dropped in a random cell of a random room, and one of
    // those rooms is the room you walk into the floor in. Arriving inside
    // somebody's reach is not difficulty, it is a coin toss you lose
    // before you can look at the screen.
    //
    // There are two ways onto a floor and both are kept clear: the
    // floor's own spawn point (where you start, and where you restart)
    // and the stairwell (where you come up from the storey below). The
    // stairwell gets a smaller radius than the spawn - it is a doorway
    // you fight your way out of, not a safe room - but it does not get
    // to have a man in it when you emerge.
    const clear = [];
    if (P.spawn) {
      const [sx, sz] = toWorld(P.spawn.x, P.spawn.z);
      clear.push({ x: sx, z: sz, r: 11 });
    }
    if (P.stair) {
      const [tx, tz] = toWorld(P.stair.x + P.stair.w / 2, P.stair.z + P.stair.d / 2);
      clear.push({ x: tx, z: tz, r: 6.5 });
    }
    const tooNear = (wx, wz) => clear.some((c) => Math.hypot(wx - c.x, wz - c.z) < c.r);

    // TRY AGAIN RATHER THAN GIVE UP. The old loop skipped a man whose
    // cell was solid, so a floor quietly ended up with fewer than it
    // asked for; with a keep-out zone on top of that it would have been
    // noticeably emptier. Each man gets a few attempts at a legal cell.
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const type = r.chance(bias * 0.5) ? r.pick(['rifle', 'heavy', 'rifle', 'brawler'])
                                        : r.pick(roster);
      for (let tryN = 0; tryN < 14; tryN++) {
        const rm = r.pick(P.rooms);
        const cx = Math.round(r.range(rm.x0 + 1, rm.x1 - 1));
        const cz = Math.round(r.range(rm.z0 + 1, rm.z1 - 1));
        if (P.at(cx, cz) !== EMPTY) continue;
        const [wx, wz] = toWorld(cx, cz);
        if (tooNear(wx, wz)) continue;
        this.spawn(type, cx, cz, floor * 31 + i, P, floor, base);
        placed++;
        break;
      }
    }
    return placed;
  }

  /**
   * Turn a storey's markers into the things they stand for.
   *
   * Liam: *"make it so I can add in enemies counters coupards and way
   * more things flare guns"*. He places a marker from the asset bar; this
   * is where it becomes a man or a weapon on the floor.
   *
   * Runs after the floor is built and after the saved edits have been
   * applied, so it sees everything he has put down. Each marker is only
   * realised ONCE - it carries a flag - and it hides itself afterwards,
   * because a spawn point standing inside the guard it spawned is not
   * something anybody wants to look at. The editor shows them again.
   */
  realise(world) {
    if (!world || !world.group) return 0;
    let made = 0;
    for (const o of world.group.children) {
      const nm = o.userData.propName;
      const m = nm && MARKERS[nm];
      if (!m || o.userData.realised) continue;
      o.userData.realised = true;
      o.userData.isMarker = true;
      o.visible = false;
      const [cx, cz] = toCell(o.position.x, o.position.z);
      if (m.kind === 'foe') {
        // HIS OWN SEED, off where he stands, so the same man comes back
        // in the same clothes every time the floor is generated.
        const seed = Math.round(o.position.x * 71) ^ Math.round(o.position.z * 131) ^ 0x5f3a;
        const a = this.spawn(m.what, cx, cz, seed, world.plan, world.n, world.base,
          m.gun === undefined ? null : m.gun);
        if (a) { a.x = o.position.x; a.z = o.position.z; a.yaw = o.rotation.y; }
      } else if (m.what === 'bandage') {
        this.pickups.push(this.makePickup(null, o.position.x, o.position.z,
                                          { kind: 'bandage', n: 2 }, world.base));
      } else {
        const G = GUNS[m.what];
        this.pickups.push(this.makePickup(m.what, o.position.x, o.position.z,
          { ammo: m.what === 'flare' ? 2 : (G && G.mag ? G.mag : 0) }, world.base));
      }
      made++;
    }
    if (made) this.game.log('placed ' + made + ' of your own');
    return made;
  }

  /**
   * Start the run again: every man, every body, every dropped rifle and
   * every mark on every floor. The BUILDING stays - it is the same tower
   * and the same plans - but nobody in it remembers you.
   */
  reset() {
    for (const a of this.actors) a.mesh.parent && a.mesh.parent.remove(a.mesh);
    for (const p of this.pickups) p.mesh.parent && p.mesh.parent.remove(p.mesh);
    this.actors = []; this.pickups = [];
    this.squads.clear(); this.peopled.clear();
    this.blood.clear();
    this.gore.clear();
    // EVERY MARK THE LAST RUN LEFT. Liam: *"bullet casings are not
    // removed"*. Blood and dismemberment were being cleared and nothing
    // else, so a new run started standing in the brass, smoke and bullet
    // holes of the one before it.
    this.fx.clear();

    // ---- AND THE MEN LIAM PLACED HIMSELF COME BACK -------------------
    //
    // Liam: *"when respawning the enemies don't also respawn"*.
    //
    // Half right, and the half that was wrong is the interesting half.
    // Clearing `peopled` is enough for the GENERATED men - people() runs
    // again for that floor and makes a new squad. But a hand-placed man
    // comes from a MARKER prop, and realise() stamps `realised` on the
    // marker so it is only ever used once. The marker belongs to the
    // floor, not to combat, so it survives a reset with the stamp still
    // on it and is skipped forever.
    //
    // The flag is a property of THIS RUN, so this run is what has to take
    // it off - every marker on every storey that has been built.
    const b = this.building || (this.game && this.game.building);
    if (b && b.floors) {
      for (const w of b.floors.values()) {
        if (!w || !w.group) continue;
        for (const o of w.group.children) {
          if (o.userData && o.userData.isMarker) {
            o.userData.realised = false;
            o.visible = false;         // still a marker, still not drawn in play
          }
        }
      }
    }
  }

  spawn(type, cx, cz, seed, P = null, floor = 1, base = 0, wantGun = null) {
    const r = rng(seed * 2654435761 >>> 0);
    const made = makeActor(type, seed);
    const { mesh, body, anim, K } = made;
    // a placed man can be told what to carry; a generated one draws
    // from his kind's weighted list as before
    const gun = wantGun !== null ? wantGun : made.gun;
    const [x, z] = toWorld(cx, cz);
    mesh.position.set(x, base, z);
    this.scene.add(mesh);
    const G = gun ? GUNS[gun] : GUNS.fists;

    // THE WEAPON IS PARENTED TO HIS HAND, not drawn at an offset from
    // his hip. That one change is most of why these men stopped looking
    // like cardboard: the gun goes where the hand goes, through every
    // frame of every animation, for free.
    let held = null;
    if (gun) { held = weaponMesh(gun); body.grip.add(held); }

    const a = {
      id: seed + '_' + this.actors.length, type, mesh, body, anim, K,
      P, floor, base,
      gunId: gun, gun: G, held,
      x, z, yaw: 0, aimYaw: 0, hp: K.hp, maxHp: K.hp, alive: true,
      mag: G.mag || 99, reloadT: 0, cool: 0, suppress: 0, swingT: 0,
      aware: false, lastSeen: -99, lx: x, lz: z, state: 'idle', speed: 0,
      // ---- MOST OF THEM HOLD ----------------------------------------
      //
      // Liam: *"make 85% of enemies just do the lean and shoot agains the
      // player to make that movie style"*.
      //
      // Decided once, here, off his own seed rather than per frame - a
      // man who re-rolls his temperament every tick reads as indecisive
      // rather than as cautious. A HOLDER never chooses to advance: he
      // finds a wall, leans out, fires, ducks back. The one in seven who
      // is not a holder is what stops a floor becoming a stalemate.
      holds: r ? r.chance(0.85) : Math.random() < 0.85,
      // ---- AND HE IS NOT THE MAN NEXT TO HIM ------------------------
      //
      // `K.acc` is an ARCHETYPE - every guard in the building was the
      // same 0.60 shot, so a room of four read as one opponent standing
      // in four places. This rolls each man a personal marksmanship off
      // his own seed, once, the same way `holds` decides his temperament:
      // about a third of any given type are noticeably worse than their
      // kind and a few are noticeably better. It is what makes one man
      // in a room the one you deal with first.
      marks: Math.max(0.14, Math.min(0.92,
        (K.acc || 0.5) * (0.70 + (r ? r.range(0, 1) : Math.random()) * 0.62))),
      goal: null, fire: false, deadT: 0, unarmed: !gun,
      // A MAN CARRIES PART OF A MAGAZINE, not two spare ones. This was
      // 17-34 rounds off a pistol and 30-60 off a rifle, which meant one
      // body refilled you and the ammunition economy did not exist.
      spare: G.mag ? Math.max(2, Math.round(G.mag * (0.18 + Math.random() * 0.32))) : 0,
    };
    this.actors.push(a);
    if (a) { /* returned below, so realise() can put him where the marker is */ }
    return a;
  }

  // ---- the weapon strip ------------------------------------------------
  //
  // Liam: *"numbers don't swap through weapons or at least not visibly"*.
  //
  // Both halves of that were true. Most of the keys genuinely did nothing
  // because setWeapon() bailed out when you did not own the weapon, and
  // even the ones that worked changed nothing you could see except a name
  // in the corner. A shooter with eight weapons needs a rack.
  buildSlots() {
    const el = document.getElementById('slots');
    if (!el) return;
    el.innerHTML = '';
    this.slotEls = {};
    ORDER.forEach((id, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = '<b>' + (i + 1) + '</b><span>' + GUNS[id].name + '</span><i></i>';
      el.appendChild(d);
      this.slotEls[id] = d;
    });
    this.refreshSlots();
  }

  refreshSlots() {
    if (!this.slotEls) return;
    for (const id of ORDER) {
      const d = this.slotEls[id];
      const G = GUNS[id];
      const have = this.owned.has(id);
      d.classList.toggle('has', have);
      d.classList.toggle('cur', id === this.held);
      const amt = d.querySelector('i');
      // WRITE ONLY WHEN IT CHANGED. This runs every frame so the count
      // ticks down as you fire - the first version refreshed the rack
      // only on a pickup, so the number in the slot and the number in
      // the corner disagreed all through a magazine.
      const txt = G.melee && !G.spray ? '—'
        : ((this.mag[id] | 0) + ' / ' + (this.ammo[id] | 0));
      if (amt.textContent !== txt) amt.textContent = txt;
    }
  }

  setWeapon(id, quiet) {
    if (!GUNS[id]) return false;
    if (!this.owned.has(id)) {
      // SAY SO. A key that does nothing is indistinguishable from a bug,
      // and Liam reported it as one.
      if (!quiet) this.game.log("you don't have a " + GUNS[id].name);
      return false;
    }
    if (id === this.held) return true;
    this.held = id;
    this.reloading = 0;
    this.combo = 0;
    this.hands.setWeapon(id);
    const nm = document.getElementById('gunname');
    if (nm) nm.textContent = GUNS[id].name;
    this.refreshSlots();
    return true;
  }

  /** the next weapon you actually own, for the mouse wheel */
  cycle(dir) {
    const own = ORDER.filter((id) => this.owned.has(id));
    const i = own.indexOf(this.held);
    this.setWeapon(own[(i + dir + own.length) % own.length]);
  }

  ammoText() {
    const G = GUNS[this.held];
    const el = document.getElementById('ammo');
    if (!el) return;
    if (G.melee && !G.spray) el.innerHTML = '&infin;';
    else el.innerHTML = (this.mag[this.held] | 0) + '<small>/' + (this.ammo[this.held] | 0) + '</small>';
  }

  reload() {
    const G = GUNS[this.held];
    if (G.melee || this.reloading) return;
    if (this.mag[this.held] >= G.mag || !this.ammo[this.held]) return;
    this.reloading = G.reload;
    this.hands.play(G.shellByShell ? 'reloadShell' : 'reloadMag', G.reload);
  }

  // =====================================================================
  // FIRING
  // =====================================================================
  fire(player, P) {
    const G = GUNS[this.held];
    if (this.cool > 0 || this.reloading > 0) return;
    if (!G.melee) {
      if (!this.mag[this.held]) { this.reload(); return; }
      this.mag[this.held]--;
    }

    const dir = V3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const eye = player.eyePoint();   // leaned - see Player.eyePoint

    if (G.melee) return this.swing(player, P, G, dir, eye, this.held);

    this.cool = G.rate;
    this.kick = Math.min(1, this.kick + (G.recoil || 1) * 0.1);
    this.hands.punch((G.recoil || 1) * 0.055);
    if (G.shellByShell) this.hands.play('pump', 0.42);

    // ---- THE FLASH ----------------------------------------------------
    //
    // At the actual muzzle of the actual model, which is why the baker
    // measures where that is. A flash at a typed offset is wrong for six
    // of the seven weapons and has to be re-typed whenever a model moves.
    const mz = this.hands.muzzleWorld();
    const right = V3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.fx.muzzle(mz, dir, right, G.flash || 1);

    for (let p = 0; p < (G.pellets || 1); p++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * G.spread;
      d.y += (Math.random() - 0.5) * G.spread;
      d.z += (Math.random() - 0.5) * G.spread;
      d.normalize();
      this.hitscan(eye, d, G, P, player);
    }
    this.tracer(mz, dir, G.range);
  }

  hitscan(eye, d, G, P, player) {
    let best = null, bestT = G.range;
    for (const a of this.actors) {
      if (!a.alive) continue;
      // A CAPSULE TESTED AS A CYLINDER: cheap, and correct enough for a
      // man-sized target at the ranges this game fights at.
      //
      // The horizontal part of the direction must be NORMALISED before it
      // is projected, or every angled shot measures short and a man you
      // are clearly aiming at survives.
      const hx = d.x, hz = d.z;
      const hl = Math.hypot(hx, hz) || 1e-6;
      const ux = hx / hl, uz = hz / hl;
      // HIS LEANED POSITION, not his footprint. He steps out from cover
      // to shoot; the half second he is out there is the half second you
      // can hit him, and testing against a.x/a.z would make peeking free
      // for him in exactly the way it used to be free for the player.
      const ax = a.fx !== undefined ? a.fx : a.x, az = a.fz !== undefined ? a.fz : a.z;
      const ox = ax - eye.x, oz = az - eye.z;
      const t = ox * ux + oz * uz;
      if (t < 0.35 || t > bestT) continue;
      const off = Math.hypot(ox - ux * t, oz - uz * t);
      if (off > 0.40) continue;
      const py = eye.y + (d.y / hl) * t;
      const H = a.body.height;
      // HIS OWN FLOOR IS HIS ZERO. Measured against a fixed ground the
      // man on the storey above was a torso shot from below, through a
      // concrete slab.
      const ry = py - a.base;
      if (ry < 0.05 || ry > H * 1.03) continue;
      if (!canSee(P, eye.x, eye.z, ax, az)) continue;
      // AND THE SAME COVER RULE THAT PROTECTS YOU PROTECTS HIM. A man
      // behind a counter is behind a counter; the only reason to make
      // this asymmetric would be to make the game easier, and the point
      // of putting a barrier in the room is that both of you can read it.
      if (this.cover
          && blocker(this.cover, eye.x, eye.y, eye.z, ax, py, az))
        continue;
      best = { a, t, py }; bestT = t;
    }
    // A CASE IN FRONT OF HIM TAKES THE ROUND. Tested before the man, or
    // you could shoot a fire axe out of its cabinet through a guard.
    const hitCase = this.caseHit(eye, d, best ? best.t : G.range);
    if (hitCase) { this.breakCase(hitCase, d); return; }
    if (best) {
      const part = partAt(best.py - best.a.base, best.a.body.height);
      const head = part === 'head';
      if (G.burns) this.fx.litFlare(V3(best.a.x, best.a.base + 0.05, best.a.z));
      const dmg = G.dmg * (head ? 2.8 : part.startsWith('leg') ? 0.7 : 1);
      this.maybeSever(best.a, part, d, this.held, best.t, best.a.hp - dmg <= 0);
      this.damage(best.a, dmg, d, part, false, player);
      return;
    }
    // ---- nothing hit: put the round in whatever is there --------------
    //
    // Liam: *"add bullet holes to walls when shooting"*. They were there
    // and they were invisible, and the reason is worth writing down.
    //
    // The impact point came from traceWall(), which walks the PLAN GRID -
    // it knows which cells are wall and returns the point where the ray
    // crosses a cell boundary. That is the right tool for "can he see me"
    // and the wrong one for "where did the bullet land", because the grid
    // does not know about anything standing in front of it. Measured: the
    // grid said the surface was at z 10.960, the thing actually in the way
    // was a door leaf at 11.050, and the bullet hole was placed nine
    // centimetres INSIDE it. Every hole in the game was behind the
    // surface it belonged on.
    //
    // So the mark is placed by raycasting the geometry. It costs one ray
    // per shot - not per frame - and it means holes land on doors, desks
    // and filing cabinets as well as walls, which is what anybody would
    // expect from shooting them.
    const shot = this.markHit(eye, d, G.range, P);
    if (shot) {
      this.fx.impact(shot.p, shot.n, shot.kind);
      if (G.burns) this.fx.litFlare(shot.p);
    }
  }

  /**
   * Where the round actually lands, and what it hit.
   *
   * The geometry first, because that is what the player can see. The grid
   * is kept as a fallback for the case where the raycast finds nothing -
   * a shot out through the glazing, say - so a miss still leaves a mark
   * somewhere sensible rather than nothing at all.
   */
  markHit(eye, d, range, P) {
    const w = this.game.level;
    if (w && w.group) {
      if (!this._ray) this._ray = new THREE.Raycaster();
      this._ray.set(eye, d);
      this._ray.near = 0.05;
      this._ray.far = range;
      const hits = this._ray.intersectObject(w.group, true);
      for (const h of hits) {
        // skip the things a bullet would not mark
        const nm = h.object.name || (h.object.parent && h.object.parent.name) || '';
        if (nm === 'glass') continue;
        const n = h.face
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
          : d.clone().negate();
        // face the mark back along the shot, never into the surface
        if (n.dot(d) > 0) n.negate();
        const metal = /metal|chrome|rail|duct|pipe/.test(nm);
        return { p: h.point.clone(), n, kind: metal ? 'metal' : 'wall' };
      }
    }
    const g = this.traceWall(eye, d, range, P);
    return g ? { p: g.p, n: g.n, kind: 'wall' } : null;
  }

  /** where a ray meets the first solid cell - the grid, walked */
  traceWall(eye, d, range, P) {
    const step = 0.22;
    let px = eye.x, py = eye.y, pz = eye.z;
    const hl = Math.hypot(d.x, d.z) || 1e-6;
    for (let t = 0; t < range; t += step) {
      const nx = px + d.x / hl * step, ny = py + d.y / hl * step, nz = pz + d.z / hl * step;
      if (ny <= 0.02) return { p: V3(nx, 0.02, nz), n: V3(0, 1, 0) };
      if (ny >= 2.97) return { p: V3(nx, 2.96, nz), n: V3(0, -1, 0) };
      const [cx, cz] = toCell(nx, nz);
      if (cx < 0 || cz < 0 || cx >= W || cz >= D) return null;
      if (P.at(cx, cz) !== EMPTY) {
        const [ox, oz] = toCell(px, pz);
        const n = cx !== ox ? V3(cx > ox ? -1 : 1, 0, 0) : V3(0, 0, cz > oz ? -1 : 1);
        return { p: V3(nx, ny, nz), n };
      }
      px = nx; py = ny; pz = nz;
    }
    return null;
  }

  // =====================================================================
  // MELEE AND HAND TO HAND
  // =====================================================================
  //
  // Liam: *"add in hand to hand combat"*.
  //
  // Fists are a real weapon, not a fallback: fast, almost no reach, and
  // they STAGGER. That makes closing the distance a decision rather than
  // a mistake - a rifleman at two metres is a worse fighter than a runner
  // with a machete, and getting inside his arms is how you win a room you
  // have no ammunition for.
  //
  // The combo is the other half. Three hits, each faster than the last,
  // and the third one puts him down - so a fist fight has a rhythm you
  // can be interrupted out of, which is what makes it a fight.
  swing(player, P, G, dir, eye, weaponId) {
    const now = this.game.t;
    if (G.combo && now - this.comboT < 1.1) this.combo = (this.combo + 1) % 3;
    else this.combo = 0;
    this.comboT = now;

    const last = G.combo && this.combo === 2;
    this.cool = G.rate * (G.combo ? [1, 0.85, 1.35][this.combo] : 1);
    const anim = !G.combo ? 'swing'
      : this.combo === 0 ? 'punchR' : this.combo === 1 ? 'punchL' : 'elbow';
    this.hands.play(anim, this.cool * 1.5);

    for (const c of this.cabinets()) {
      if (c.broken) continue;
      if (Math.hypot(c.x - eye.x, c.z - eye.z) > G.reach + 0.4) continue;
      this.breakCase(c, dir);
    }
    let hit = 0;
    for (const a of this.actors) {
      if (Math.abs(a.base - player.pos.y) > 1.9) continue;   // not through the floor
      // A CORPSE IS STILL THERE. Swinging an axe into a body on the floor
      // should do what an axe does; skipping dead actors entirely meant
      // the most obvious thing a player will try did nothing at all.
      if (!a.alive) {
        if (!G.exec) continue;
        const dx0 = a.x - eye.x, dz0 = a.z - eye.z;
        const d0 = Math.hypot(dx0, dz0);
        if (d0 > G.reach) continue;
        if ((dx0 / d0) * dir.x + (dz0 / d0) * dir.z < Math.cos(G.arc)) continue;
        const p2 = ['head', 'armR', 'armL', 'legR', 'legL'][Math.floor(Math.random() * 5)];
        if (this.gore.sever(a, p2, dir, 1.1)) {
          this.blood.onLens(d0, 0.9);
          hit++;
        }
        continue;
      }
      const dx = a.x - eye.x, dz = a.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d > G.reach) continue;
      if ((dx / d) * dir.x + (dz / d) * dir.z < Math.cos(G.arc)) continue;

      // ---- A TAKEDOWN, from behind ---------------------------------
      //
      // If he has not seen you and you are behind him, it is over. That
      // is the reward for moving quietly through a floor rather than
      // announcing yourself with an AK, and it is the most Wick thing in
      // the game.
      const behind = Math.cos(angDiff(Math.atan2(-dx, -dz), a.yaw)) < -0.15;
      if ((G.exec || G.unarmed) && (!a.aware || behind) && d < G.reach * 0.85) {
        this.execute(a, dir, player, weaponId);
        return;
      }
      const mult = last ? 2.1 : 1;
      // WHERE a swing lands decides what comes off. An axe swung level
      // takes an arm; swung high it takes a head. Picked here rather than
      // in damage() because only a swing has an aim point on a BODY.
      const hi = this.camera.rotation.x > 0.10;
      const lo = this.camera.rotation.x < -0.22;
      const part = hi ? 'head' : lo ? (Math.random() < 0.5 ? 'legR' : 'legL')
                 : (Math.random() < 0.45 ? (Math.random() < 0.5 ? 'armR' : 'armL') : 'body');
      const dmg = G.dmg * mult * (part === 'head' ? 2.4 : 1);
      const lethal = a.hp - dmg <= 0;
      this.maybeSever(a, part, dir, weaponId, d, lethal);
      this.damage(a, dmg, dir, part, true, player);
      // IT GOES ON WHAT HIT HIM. Not on a timer and not on the kill - on
      // every blow that lands on a body, which is why a machete looks
      // worse three rooms in than it did at the door.
      this.hands.bloodied(lethal || part === 'head');
      if (a.alive && (G.stagger || 0) * mult > 0.5) {
        a.stagger = 0.45 * (G.stagger || 1) * mult;
        a.anim.play('elbow', 0.3, 0.4);
      }
      hit++;
    }
    if (hit) this.hands.punch(0.10);
  }

  execute(a, dir, player, weaponId) {
    a.hp = 0;
    // AND THE ARM MOVES. A takedown skipped hands.play() entirely, so the
    // most cinematic kill in the game was a blade holding perfectly
    // still while a man folded up in front of it - which is also why the
    // swing test kept reporting no animation: with a man in reach and
    // unaware, every one of its swings became an execution.
    this.hands.play('swing', 0.42);
    this.hands.bloodied(true);
    // AN AXE TAKEDOWN TAKES THE HEAD. This is the single most Wick image
    // in the game and the first build could not produce it: the execution
    // branch ran before the dismemberment check and simply set hp to
    // zero, so a silent kill with a fire axe looked exactly like a silent
    // kill with your hands.
    if (weaponId === 'axe' || weaponId === 'knife')
      this.gore.sever(a, 'head', dir, 1.5);
    this.blood.spray(a.x, a.base + a.body.height * 0.86, a.z, dir.x, 0.15, dir.z, 90, 1.6);
    this.blood.onLens(Math.hypot(a.x - player.pos.x, a.z - player.pos.z), 1.4);
    this.game.log('down — quietly');
    this.kill(a, dir, 'crumple');
  }

  // =====================================================================
  /**
   * DOES THIS TAKE SOMETHING OFF?
   *
   * Only edges and point-blank shotguns. If a pistol round could remove
   * an arm then every weapon in the game feels the same, and the axe -
   * which is slow, and which you are meant to have chosen deliberately -
   * stops being worth the swing. The whole point of a dismemberment rule
   * is that it separates the weapons.
   */
  maybeSever(a, part, dir, weaponId, range, lethal) {
    const p = Gore.severs(weaponId, part, range, lethal);
    if (!p || Math.random() > p) return false;
    const done = this.gore.sever(a, part, dir, lethal ? 1.35 : 0.85);
    if (done && part === 'head' && a.alive) { a.hp = 0; }
    return done;
  }

  damage(a, n, dir, part, melee, player) {
    a.hp -= n;
    a.suppress = 2.2;
    a.aware = true;
    a.lastSeen = this.game.t;
    a.lx = this.game.player.pos.x; a.lz = this.game.player.pos.z;

    const H = a.body.height;
    const y = part === 'head' ? H * 0.90 : part.startsWith('leg') ? H * 0.28 : H * 0.62;
    const force = part === 'head' ? 1.8 : melee ? 1.3 : 1;
    this.blood.spray(a.x, a.base + y, a.z, dir.x, dir.y * 0.4 + 0.1, dir.z,
                     part === 'head' ? 46 : melee ? 34 : 20, force);
    a.anim.hurt(dir.x, dir.z, part, Math.min(1.4, n / 45));
    if (player) this.blood.onLens(Math.hypot(a.x - player.pos.x, a.z - player.pos.z),
                                  part === 'head' ? 1.0 : 0.45);

    // EVERYBODY NEARBY HEARS IT AND STARTS LOOKING - on this storey.
    //
    // Liam: *"stop enemies from knowing the player is there without
    // seeing them or nearby comrades seeing the player"*. A comrade
    // being shot at is exactly the thing that should alert you, so this
    // stays - but it was alerting men on the floors above and below too,
    // and what they were told to look at was a point on THEIR floor
    // where nothing had happened.
    //
    // And note what is passed: a.x, a.z - where their friend is, not
    // where the player is. A man who hears a shot knows where his mate
    // was standing. He does not know where you are, and he has to come
    // and find out.
    for (const o of this.actors) {
      if (o === a || !o.alive || o.aware) continue;
      if ((o.floor || 1) !== (a.floor || 1)) continue;
      if (Math.hypot(o.x - a.x, o.z - a.z) < 14) { o.aware = true; o.lx = a.x; o.lz = a.z; }
    }
    if (a.hp <= 0 && a.alive) this.kill(a, dir, part === 'head' ? 'crumple' : null);
  }

  kill(a, dir, deathKind) {
    a.alive = false;
    a.deadT = 0;
    this.game.kills++;

    // A DEATH IS A DIRECTION. Shot in the chest he sits down backwards;
    // shot in the back he goes onto his face; head shot and his legs go
    // first. Picking by the hit is most of what stops a hundred deaths
    // looking like one animation.
    const facing = Math.cos(angDiff(Math.atan2(dir.x, dir.z), a.yaw));
    const kind = deathKind || (facing > 0 ? 'face' : 'back');
    a.anim.die(kind);
    a.fallDir = Math.atan2(dir.x, dir.z);

    this.blood.spray(a.x, a.base + a.body.height * 0.62, a.z, dir.x, 0.25, dir.z, 60, 1.4);
    this.blood.pool(a.x, a.z, 1.5 + Math.random() * 1.0, a.base);

    this.drop(a);
  }

  /**
   * WHAT HE WAS CARRYING IS NOW ON THE FLOOR.
   *
   * Liam: *"no clear way to loot bodies which is a huge thing"*. Two
   * things were wrong. Melee weapons never dropped at all - which quietly
   * deleted half the loot table, because a machete or an axe off a body
   * is the most interesting thing you can find. And a pickup was an
   * unlit model lying flat on a dark carpet with nothing to say it was
   * there.
   */
  /** one thing lying on the floor, waiting to be walked over */
  makePickup(gunId, x, z, opts = {}, base = 0) {
    const g = new THREE.Group();
    if (gunId) {
      const mesh = weaponMesh(gunId);
      mesh.rotation.set(0, 0, Math.PI / 2);
      g.add(mesh);
    } else {
      // a first aid box, which is a white box with a green cross on it and
      // needs to be nothing more than that
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.18),
        new THREE.MeshLambertMaterial({ color: 0xe8e6de }));
      const gm = new THREE.MeshBasicMaterial({ color: 0x2f7d43 });
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.01), gm);
      const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.13), gm);
      a1.position.y = a2.position.y = 0.071;
      b.add(a1, a2);
      g.add(b);
    }
    g.position.set(x, base + 0.10, z);
    g.rotation.y = Math.random() * 6.283;

    // A HALO ON THE FLOOR. Additive, flat, and it pulses - you can see
    // one across a dark office, which is the entire point.
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6,
        color: opts.kind === 'bandage' ? 0x6fe08a : 0xffffff }));
    halo.position.y = -0.09;
    g.add(halo);
    this.scene.add(g);
    return { mesh: g, halo, gun: gunId, kind: opts.kind, n: opts.n || 0,
             ammo: opts.ammo || 0, x, z, base, t: Math.random() * 6 };
  }

  drop(a) {
    if (!a.gunId) return;
    if (a.held) { a.body.grip.remove(a.held); a.held = null; }
    this.pickups.push(this.makePickup(a.gunId, a.x, a.z, { ammo: a.spare }, a.base));
  }

  /**
   * Walking over a body is still enough - a hold-to-loot bar is the most
   * momentum-killing thing in a shooter and this game is one long forward
   * move. What is new is that you can SEE it coming and you are told what
   * you got.
   */
  loot(player) {
    let near = null, nearD = 2.6;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      // AND NOT THROUGH THE FLOOR. Without the height test you loot the
      // rifle off the man lying directly below you.
      if (Math.abs((p.base || 0) - player.pos.y) > 1.6) continue;
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d < nearD) { nearD = d; near = p; }
      if (d > 1.5) continue;
      if (p.kind === 'bandage') {
        player.bandages += p.n;
        this.game.log('+' + p.n + ' bandages');
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
        continue;
      }
      const G = GUNS[p.gun];
      const had = this.owned.has(p.gun);
      this.owned.add(p.gun);
      if (!G.melee || G.spray) {
        this.ammo[p.gun] = (this.ammo[p.gun] || 0) + p.ammo;
        if (!had) this.mag[p.gun] = G.mag;
      }
      // TAKE IT AND USE IT, if it is new. Stopping to press a key to
      // equip the thing you just walked over is the same momentum tax as
      // the loot bar it replaced.
      if (!had) this.setWeapon(p.gun);
      this.game.log((had ? '+' + p.ammo + ' ' : 'picked up ') + G.name);
      this.scene.remove(p.mesh);
      this.pickups.splice(i, 1);
      this.refreshSlots();
    }
    const el = document.getElementById('prompt');
    if (el) {
      if (near) {
        const G = near.kind === 'bandage' ? null : GUNS[near.gun];
        el.textContent = G ? G.name + (G.melee && !G.spray ? '' : '  ·  ' + near.ammo + ' rounds')
                           : near.n + ' bandages';
        el.style.opacity = '1';
      } else el.style.opacity = '0';
    }
  }

  // =====================================================================
  // THE WALL CASES
  // =====================================================================
  //
  // Liam: *"add in a flare gun being able to be taken off of walls by
  // smashing open cases or taking it off the wall"*. Both, and neither
  // costs a key or a pause: shoot it from across the room and the glass
  // goes and the thing drops on the floor, or walk into it and take it
  // off the bracket. The first is loud and leaves it where it fell; the
  // second means being there. That is a real choice in a fight.
  /**
   * The wall cases on the storey the player is standing on.
   *
   * They carry no height of their own - level.js builds them in floor
   * space - so the storey's base is stamped on as they are handed out.
   * Without it you smash a fire-axe cabinet that is two floors up.
   */
  cabinets() {
    const w = this.game.level;
    if (!w || !w.cabinets) return [];
    const base = w.base || 0;
    for (const c of w.cabinets) c.base = base;
    return w.cabinets;
  }

  breakCase(c, dir) {
    if (c.broken) return;
    c.broken = true;
    if (c.pane) { c.mesh.remove(c.pane); c.pane.geometry.dispose(); }
    // glass, going everywhere
    for (let i = 0; i < 14; i++) {
      const v = V3((Math.random() - 0.5) * 3.5, 1 + Math.random() * 3, (Math.random() - 0.5) * 3.5);
      if (dir) { v.x += dir.x * 2.2; v.z += dir.z * 2.2; }
      this.fx.spark.spawn(V3(c.x, c.y, c.z), { dur: 0.5 + Math.random() * 0.4,
        size: 0.035, vel: v, gravity: 16, color: 0xbfe4ff });
    }
    this.fx.impact(V3(c.x, c.y, c.z), dir || V3(0, 0, 1), 'metal');
    this.spawnFromCase(c);
  }

  /** the thing falls out and lies on the floor as ordinary loot */
  spawnFromCase(c) {
    c.mesh.visible = false;
    if (c.item === 'bandage') {
      this.pickups.push(this.makePickup(null, c.x, c.z, { kind: 'bandage', n: 2 }, c.base || 0));
    } else {
      this.pickups.push(this.makePickup(c.item, c.x, c.z,
        { ammo: c.item === 'flare' ? 2 : 0 }, c.base || 0));
    }
    this.game.log(c.item === 'bandage' ? 'first aid' : GUNS[c.item].name + ' — take it');
  }

  /** near enough to lift it straight off the wall */
  checkCases(player, dt) {
    for (const c of this.cabinets()) {
      if (c.broken) continue;
      if (Math.abs((c.base || 0) - player.pos.y) > 1.7) continue;
      if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 1.25) continue;
      c.broken = true;
      c.mesh.visible = false;
      if (c.item === 'bandage') {
        player.bandages += 2;
        this.game.log('+2 bandages');
      } else {
        const had = this.owned.has(c.item);
        this.owned.add(c.item);
        const G = GUNS[c.item];
        if (!G.melee || G.spray) {
          this.ammo[c.item] = (this.ammo[c.item] || 0) + (c.item === 'flare' ? 2 : G.mag);
          if (!had) this.mag[c.item] = G.mag;
        }
        if (!had) this.setWeapon(c.item);
        this.game.log('took the ' + G.name + ' off the wall');
        this.refreshSlots();
      }
    }
  }

  /** does this shot hit a case before it hits anything else? */
  caseHit(eye, d, maxT) {
    let best = null, bt = maxT;
    for (const c of this.cabinets()) {
      if (c.broken) continue;
      const ox = c.x - eye.x, oy = c.y - eye.y, oz = c.z - eye.z;
      const t = ox * d.x + oy * d.y + oz * d.z;
      if (t < 0.4 || t > bt) continue;
      const off = Math.hypot(ox - d.x * t, oy - d.y * t, oz - d.z * t);
      if (off > c.r) continue;
      best = c; bt = t;
    }
    return best;
  }

  tracer(from, dir, len) {
    const g = new THREE.BufferGeometry().setFromPoints([V3(0, 0, 0), dir.clone().multiplyScalar(len)]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.45 }));
    l.position.copy(from);
    l.userData.t = 0.045;
    this.tracers.add(l);
  }

  // =====================================================================
  // PER FRAME
  // =====================================================================
  step(dt, player, P, keys) {
    const t = this.game.t;
    // WHAT IS STANDING IN THE ROOM. Read once a frame and handed to every
    // sight test and every round fired, so cover means the same thing to
    // the AI, to their bullets and to yours. See blocker() in collide.js.
    this.cover = (this.game.level && this.game.level.props) || null;
    this.cool = Math.max(0, this.cool - dt);
    this.kick *= Math.pow(0.02, dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const G = GUNS[this.held];
        const take = Math.min(G.mag - this.mag[this.held], this.ammo[this.held]);
        this.mag[this.held] += take;
        this.ammo[this.held] -= take;
        this.refreshSlots();
      }
    }

    this.hands.update(dt, {
      speed: player.speed || 0, bob: player.bob, stance: player.stance,
      sprint: keys.shift && keys.w && !player.crouch,
      dx: this.lookDX || 0, dy: this.lookDY || 0, third: player.third,
      combo: this.combo,
    });
    this.lookDX *= 0.75; this.lookDY *= 0.75;

    // ---- input --------------------------------------------------------
    if (keys.fire) {
      const G = GUNS[this.held];
      if (G.auto || !this._wasFire) this.fire(player, P);
    }
    this._wasFire = keys.fire;
    if (keys.r) { this.reload(); keys.r = false; }
    if (keys.melee) {
      // A SHOVE, WHATEVER IS IN YOUR HANDS. With fists equipped this is
      // just the punch; with a rifle it is a fast strike that does not
      // cost you the weapon you are holding.
      keys.melee = false;
      if (this.cool <= 0) {
        const was = this.held;
        const G = GUNS[was].melee ? GUNS[was] : GUNS.fists;
        const dir = V3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const eye = player.eyePoint();   // leaned - see Player.eyePoint
        this.swing(player, P, G, dir, eye, GUNS[was].melee ? was : 'fists');
        if (!GUNS[was].melee) this.hands.setWeapon(was);
      }
    }
    if (keys.slot) {
      const id = ORDER[keys.slot - 1];
      if (id) this.setWeapon(id);
      keys.slot = 0;
    }
    if (keys.wheel) { this.cycle(keys.wheel); keys.wheel = 0; }

    this.loot(player);
    this.checkCases(player, dt);
    this.ammoText();
    this.refreshSlots();

    for (let i = this.tracers.children.length - 1; i >= 0; i--) {
      const l = this.tracers.children[i];
      l.userData.t -= dt;
      l.material.opacity = Math.max(0, l.userData.t * 10);
      if (l.userData.t <= 0) { this.tracers.remove(l); l.geometry.dispose(); }
    }
    this.blood.step(dt, P);
    this.gore.step(dt, P);
    this.fx.step(dt);

    for (const p of this.pickups) {
      p.t += dt;
      p.mesh.position.y = p.base + 0.10 + Math.sin(p.t * 1.8) * 0.035;
      p.mesh.rotation.y += dt * 0.55;
      p.halo.material.opacity = 0.42 + Math.sin(p.t * 2.6) * 0.16;
    }

    this.stepActors(dt, player, P, t);
  }

  // ---- the men --------------------------------------------------------
  stepActors(dt, player, P, t) {
    // WHAT HE IS HOLDING CHANGES HOW THEY BEHAVE. A man with a machete
    // walking at you is a different problem from a man with a rifle, and
    // the room should react to it - see the "pressed" test in ai.js.
    const hg = GUNS[this.held];
    player.armedMelee = !!(hg && (hg.melee || this.held === 'fists'));
    // EACH STOREY'S SQUAD AGAINST ITS OWN MAP. The squad that matters
    // is the one on the player's floor; the others hold what they know.
    // ONE FLOW FIELD, ON THE FLOOR HE IS ACTUALLY ON.
    //
    // This was building a fresh path-to-the-player for EVERY peopled
    // storey, so the men two floors up had a live route to your exact
    // position at all times. The moment any of them was alerted - by a
    // shot, or by the sight bug above - they walked it. That is the
    // clearest possible case of "knowing the player is there without
    // seeing them", and it was costing a breadth-first search per floor
    // per half second for men who cannot even reach you.
    //
    // The other storeys keep whatever field they last had, which is
    // right: it is where you were when you left, and it is what they go
    // and search.
    const sq = this.squads.get(this.game.floor);
    if (sq) {
      const w = this.building && this.building.get(this.game.floor);
      sq.update(w ? w.plan : P, player.pos.x, player.pos.z, t, this.game.floor,
        w ? w.nav : null);
    }
    for (const a of this.actors) {
      // A MAN TWO STOREYS AWAY IS NOT IN THIS FIGHT. Without this every
      // floor you have ever visited keeps thinking, and eleven storeys of
      // men is three hundred pathfinds a frame for a fight happening on
      // one of them. He is not deleted - walk back down and he is still
      // standing where he was.
      // FROZEN, unless he is on YOUR storey. Liam: "make all enemies
      // freeze on one level while the player is on the other". It was
      // one floor of slack either way - the men above and below kept
      // thinking, walking and shooting - which is what made a floor you
      // had already left keep making noise, and what made the storey
      // above busy before you had climbed to it.
      if ((a.floor || 1) !== this.game.floor) {
        // AND HE PUTS THE GUN DOWN ON HIS WAY OUT.
        //
        // Skipping him leaves whatever he was doing frozen on him, so a
        // man who had you in his sights when you left floor five was
        // still flagged as seeing you and still flagged as firing three
        // storeys later. Nothing acted on it - actorFire is below this
        // line - but it is a lie sitting in the state, and the first
        // thing that reads it will act on it.
        a.sees = false; a.fire = false; a.acq = 0; a.swingT = 0;
        continue;
      }
      const aP = a.P || P;
      // his own storey's world - the nav mask and the boxes he collides
      // with belong to the floor he is standing on, not the one you are
      const aw = (this.building && this.building.get(a.floor || 1)) || this.game.level;
      const cov = this.cover;
      const sq = this.squads.get(a.floor) || this.squads.get(this.game.floor);
      if (!a.alive) {
        a.deadT += dt;
        // THE BODY TOPPLES AS A RIGID ROTATION about its feet, while the
        // skeleton goes slack underneath. A cheap ragdoll spends its
        // first half second flailing and ends folded through its own
        // hip; this reads as a man falling over, which is the point.
        const k = Math.min(1, a.deadT * 1.9);
        const fall = k * k * (3 - 2 * k) * (Math.PI / 2) * 0.92;
        a.mesh.rotation.set(0, a.yaw, 0);
        a.mesh.rotateOnWorldAxis(
          new THREE.Vector3(Math.cos(a.fallDir || 0), 0, -Math.sin(a.fallDir || 0)), -fall);
        a.mesh.position.y = a.base - 0.06 * k;
        a.anim.update(dt, { speed: 0, t });
        if (a.deadT > 0.35 && a.deadT - dt <= 0.35) this.blood.floor(a.x, a.z, 1.3, a.base);
        continue;
      }

      a.stagger = Math.max(0, (a.stagger || 0) - dt);
      // HE LOSES YOU WHEN YOU MOVE LIKE THAT. Not a rule about damage -
      // a rule about tracking: a man mid-burst does not re-acquire a
      // target that just dived sideways, and having to start his reaction
      // timer again is what turns a dodge into ground you gained.
      if (player.iframe > 0 && a.acq) a.acq = 0;
      // The props of the floor the PLAYER is on. Sight is already gated
      // to the same storey, so no other floor's furniture can be in the
      // way, and this is one array instead of eleven.
      think(a, { P: aP, squad: sq, player, t, combat: this, cover: cov }, dt);

      // HE THROWS THE EMPTY RIFLE DOWN AND COMES AT YOU. The weapon
      // leaves his hand, lands as a pickup with no ammunition in it, and
      // his hold cross-fades to fists - which anim.js does over a fifth
      // of a second, so it reads as a decision rather than a pop.
      if (a.wantDrop) {
        a.wantDrop = false;
        this.drop(a);
        a.gunId = null; a.gun = GUNS.fists; a.unarmed = true;
        this.game.log('he is out — and coming');
      }

      // ---- move, sliding along EVERYTHING ------------------------------
      //
      // Liam: *"the enemies can just phase through walls partitions
      // objects"*. They did. This was one plan-grid lookup at the
      // destination's centre - so a desk, a partition, a locker bank and
      // a filing cabinet were all thin air to a man, and with no radius
      // in the test he clipped every wall corner he rounded as well.
      //
      // nav.js does it properly now: the real boxes, with his radius,
      // per axis so he slides instead of sticking. See the long note
      // there for why the PATHING uses a different structure.
      let moved = 0;
      const R = 0.32;
      if (a.goal && a.speed > 0 && a.stagger <= 0) {
        const gx = a.goal.x - a.x, gz = a.goal.z - a.z;
        const d = Math.hypot(gx, gz);
        if (d > 0.3) {
          const step = a.speed * dt;
          moved += slide(aw, a, a.x + gx / d * step, a.z + gz / d * step, R);
        }
      }
      // AND HE GETS OUT OF ANYTHING HE IS ALREADY INSIDE. The world moves
      // under these men - a door swings into one, Liam drops a cabinet on
      // one in the editor, a floor is rebuilt around one - and without
      // this every direction is refused and he is welded there.
      if (a._stuckT === undefined) a._stuckT = 0;
      a._stuckT += dt;
      // FIVE TIMES A SECOND, not twice. At 0.5 s a man shoved into a
      // desk by a door or by another man stayed there for up to half a
      // second, which is long enough to see and was 1.4% of samples.
      if (a._stuckT > 0.2) { a._stuckT = 0; unstick(aw, a, R); }
      // HE LEANS WITH HIS SIGHTLINE. ai.js publishes a.fx/a.fz - the
      // point he is actually seeing and shooting from while peeking out
      // of cover - and the body has to be there too, or you would be
      // shot by a man who looks like he is still behind the pillar.
      a.mesh.position.set(a.fx !== undefined ? a.fx : a.x, a.base,
                          a.fz !== undefined ? a.fz : a.z);

      // ---- FACING. No correction angle, ever again ---------------------
      //
      // The mesh was rotated into the game's axes by the baker, so -Z is
      // the way he looks and `rotation.y = yaw` is the whole of it. The
      // old model needed `yaw - PI/2` here and `yaw + PI` in main.js, and
      // Liam saw the result: everybody turned ninety degrees left.
      //
      // He also turns his FEET slowly and takes up the difference with
      // his waist, which is what stops a man tracking you reading as a
      // turret on a pole.
      const want = Math.atan2(a.faceX || 0, a.faceZ || 1);
      const df = angDiff(want, a.yaw);
      a.yaw += df * Math.min(1, dt * 5.5);
      a.aimYaw = angDiff(want, a.yaw);

      // ---- AND HE VISIBLY LEANS ---------------------------------------
      //
      // Liam: *"make the enemies visibly lean out to shoot at the
      // player"*. They already stepped out - the body has been placed at
      // a.fx/a.fz for a while - but a man translated 55 cm sideways and
      // left bolt upright does not read as leaning. It reads as sliding,
      // and half the time you cannot tell it happened at all.
      //
      // A tilt is what names the pose. YXZ order so the roll is applied
      // in his own frame BEFORE the yaw: he tips about his own forward
      // axis, towards the side he stepped out on, whichever way he
      // happens to be facing. With the default XYZ order the tilt is
      // about the world axis and a man facing sideways leans backwards.
      a.mesh.rotation.order = 'YXZ';
      a.lean = a.lean || 0;
      a.mesh.rotation.z = -a.lean * 0.30;         // ~17 degrees at full lean
      a.mesh.rotation.y = a.yaw;

      const speed = moved / Math.max(dt, 1e-4);
      a.anim.update(dt, {
        speed, t, crouch: a.state === 'cover' && a.suppress > 1,
        weapon: a.gunId, unarmed: !a.gunId,
        aimYaw: a.aimYaw, aimPitch: a.sees ? clampP(a, player) : 0,
      });

      this.actorFire(a, dt, player, t);
    }
  }

  // ---- an enemy taking a shot, or a swing -----------------------------
  actorFire(a, dt, player, t) {
    a.cool -= dt;
    // A BELT AND BRACES FLOOR GATE. ai.js already refuses to set a.sees
    // across a slab, but this is the function that actually takes health
    // off the player and it should not depend on another module having
    // got it right.
    if (Math.abs(player.pos.y - (a.base || 0)) >= 1.9) { a.acq = 0; a.swingT = 0; return; }
    // HOW LONG BEFORE HE SHOOTS. Liam: *"make the NPC's reaction times
    // slower"*. Half a second was a man who was already aiming at where
    // you were going to be; this is a man who has to see you first, and
    // it is what makes coming round a corner fast actually pay.
    //
    // It is also where a dodge cashes out: iframes stop the damage, but
    // a dodge that does not also BREAK HIS AIM just makes you briefly
    // immortal instead of hard to hit. See stepActors.
    if (a.sees && !a.acq) a.acq = t + (a.K.react || 0.55) + Math.random() * 0.5;
    if (!a.sees) a.acq = 0;
    const G = a.gun;

    // ---- HAND TO HAND, from their side ---------------------------------
    //
    // Liam wanted NPCs *"capable of hand to hand combat"*. Any of them
    // will use their hands: a man whose magazine is empty with you two
    // metres away is not going to reload, and a brawler never had a gun
    // to begin with. It is also what stops the answer to every room being
    // "run at the rifleman".
    const closeIn = a.range < (G.melee ? G.reach : 2.3);
    const mustBrawl = !a.gunId || (a.mag <= 0 && a.range < 3.0) || G.melee;
    if (closeIn && mustBrawl && a.cool <= 0 && a.stagger <= 0) {
      a.cool = (G.melee ? G.rate : 0.75) + Math.random() * 0.35;
      const kick = !G.melee && Math.random() < 0.3;
      a.anim.play(kick ? 'kick' : (Math.random() < 0.5 ? 'punchR' : 'punchL'), a.cool * 1.3);
      a.swingT = t + a.cool * 0.42;             // the hit lands mid-swing
      // WHAT AN ENEMY'S SWING DOES TO YOU IS ITS OWN NUMBER.
      //
      // Reusing the weapon's own damage is wrong by a factor of three,
      // because those numbers are balanced against enemies with 70 to 175
      // hit points and you have a hundred. The first build did exactly
      // that and a heavy with a fire axe hit for 147 - a guaranteed
      // one-shot kill from a man you never saw coming. Being hit hard
      // should be a reason to back off, not the end of the run.
      a.swingDmg = (ENEMY_MELEE[a.gunId || 'fists'] || 15)
                 * (a.gunId ? 1 : (a.K.fist || 1))
                 * (kick ? 1.35 : 1);
      return;
    }
    // the swing connects a moment after it starts, if you are still there
    if (a.swingT && t >= a.swingT) {
      a.swingT = 0;
      // THREE-DIMENSIONAL, like everything else that decides whether he
      // can touch you. This was a floor-plan distance, so a guard on the
      // storey above who happened to be over your head punched you
      // through the ceiling - one of the two sources of Liam's *"random
      // damage with no real villian nearby"*. The other was his rifle;
      // see ai.js.
      const dy = player.pos.y - (a.base || 0);
      const d = Math.hypot(player.pos.x - a.x, dy, player.pos.z - a.z);
      if (Math.abs(dy) < 1.9 && d < (G.melee ? G.reach : 2.5) + 0.3) {
        player.hurt(a.swingDmg * (0.75 + Math.random() * 0.5), t);
        player.shove((player.pos.x - a.x) / d, (player.pos.z - a.z) / d, 3.4);
      }
    }

    if (!a.fire || a.cool > 0 || !a.sees || !a.acq || t <= a.acq || a.suppress >= 1.4) return;
    if (G.melee || !a.gunId) return;
    if (a.mag <= 0) return;

    // BURSTS WITH GAPS, NOT A HOSE. The weight of a firefight comes from
    // the gaps - a burst, a pause while he re-sights, another burst -
    // because the gaps are when you move, and a fight you can move in is
    // one you win by being better rather than by having more health.
    a.burst = (a.burst || 0) - 1;
    if (a.burst > 0) { a.cool = G.rate * 1.9; a.burstN = (a.burstN || 0) + 1; }
    else { a.burst = 2 + Math.floor(Math.random() * 3); a.cool = 0.9 + Math.random() * 0.9; a.burstN = 0; }
    a.mag--;
    a.anim.play('fire', 0.16);

    // his flash, from his actual muzzle, which is on his actual hand
    const mz = new THREE.Vector3();
    if (a.held) {
      a.held.updateWorldMatrix(true, false);
      mz.copy(muzzleOf(a.gunId)).applyMatrix4(a.held.matrixWorld);
    } else mz.set(a.fx !== undefined ? a.fx : a.x, a.base + a.body.height * 0.78,
                  a.fz !== undefined ? a.fz : a.z);
    // AT THE HEAD HE CAN ACTUALLY SEE. Aiming at the body while the
    // player is leaned means a man who has stepped out from cover is shot
    // at through the cover he stepped out of.
    // ---- WHERE HE AIMS, AND HOW BADLY --------------------------------
    //
    // Liam: *"they shouldn't be able to headshot every time the NPC's
    // need flaws"*.
    //
    // He is right, and the reason was structural rather than a number
    // being set too high. The round was never simulated at all. The
    // tracer was drawn from his muzzle to `player.head` - dead centre,
    // every shot, at any range, from any state, moving or still - and
    // then a SEPARATE dice roll decided whether you took damage.
    //
    // So a miss was invisible. The round still flew through your skull;
    // it just did nothing when it got there. Forty percent of his shots
    // "missed" you and there was no way on the screen to tell. Every man
    // in the building read as a machine that headshot you on command and
    // occasionally chose not to.
    //
    // Two changes, and they have to be both:
    //
    //   1. HE AIMS AT THE CHEST. Nobody aims at a head. A head shot is
    //      now something that HAPPENS - a round that strayed high - and
    //      that is exactly why it is allowed to hurt as much as it does.
    //   2. THE ERROR IS A DIRECTION, NOT A PROBABILITY. He rolls a real
    //      aim error, the tracer goes THERE, and whether it hits is a
    //      question of geometry. Rounds crack off the wall beside your
    //      head. That feedback is the whole point: you can watch him
    //      miss, so you can tell a bad shot from good cover.
    const spd = Math.hypot(player.vel.x, player.vel.z);
    // HE SHOOTS AT WHERE YOU WERE, by about a tenth of a second, and by
    // more if he is a poor shot. This is what makes strafing pay.
    const lag = 0.08 * (0.55 / (a.marks || 0.5));
    const aimH = player.eye * 0.70;                       // centre mass
    const to = new THREE.Vector3(player.pos.x - player.vel.x * lag,
                                 player.pos.y + aimH,
                                 player.pos.z - player.vel.z * lag);
    const dir = to.clone().sub(mz).normalize();
    const dist = mz.distanceTo(to);

    // ONE SIGMA OF AIM ERROR IN RADIANS, and everything that is wrong
    // with him multiplies it. 0.028 is a settled average man: about a
    // third of a metre at twelve, which is a hit rather more often than
    // not, and most of a miss at twenty-five.
    const settle = Math.min(1, (t - a.acq) / 1.2);
    const err = 0.028
      * (0.55 / (a.marks || 0.5))          // this man, personally
      * (2.2 - 1.2 * settle)               // his first round is wild
      * (1 + spd * 0.10)                   // you are moving
      * (1 + a.suppress * 0.80)            // he is being shot at
      * (a.state === 'push' ? 1.8 : 1);    // and firing on the advance
    // RECOIL WALKS UP AND RIGHT. Four rounds into a burst he is shooting
    // over your head - which is why the burst has to end, and why the
    // gaps between them are the ground you cross.
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
    const bn = a.burstN || 0;
    const offX = gauss() * err + bn * 0.004;
    const offY = gauss() * err * 0.8 + bn * 0.010;
    const rgt = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const upv = new THREE.Vector3().crossVectors(rgt, dir).normalize();
    dir.addScaledVector(rgt, offX).addScaledVector(upv, offY).normalize();
    to.copy(mz).addScaledVector(dir, Math.max(1, dist));
    const right = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    this.fx.muzzle(mz, dir, right, G.flash || 1);

    // ---- DOES IT GET THERE? -------------------------------------------
    //
    // He decided to shoot a frame or two ago and the world has moved
    // since - so the round is traced NOW, against the objects on the
    // floor, from his muzzle to the head he is aiming at. If a barrier is
    // in the way the barrier takes it: the tracer stops there, the round
    // sparks off it, and the player takes nothing. That, and not a hit
    // chance, is what makes ducking behind something worth doing.
    //
    // Note it is skipInside: he is allowed to shoot over the top of the
    // cover he is leaning on, which is the whole of his own peek cycle.
    const stop = this.cover
      ? blocker(this.cover, mz.x, mz.y, mz.z, to.x, to.y, to.z)
      : null;
    if (stop) {
      const reach = to.distanceTo(mz) * (stop.hitT || 1);
      this.tracer(mz, dir, reach);
      const shot = this.markHit(mz, dir, reach + 0.4, a.P || this.game.level.plan);
      if (shot) this.fx.impact(shot.p, shot.n, shot.kind);
      // and he knows he is being shot AT even if the shot ate a wall
      return;
    }
    // ---- DID IT ACTUALLY HIT HIM? ------------------------------------
    //
    // Geometry, not a dice roll. The round went where it went; this only
    // asks whether the player was standing in the way of it.
    const mX = offX * dist;                    // metres off, left or right
    const hitH = aimH + offY * dist;           // height up his body it crosses
    if (Math.abs(mX) < 0.28 && hitH > 0.10 && hitH < 1.78) {
      this.tracer(mz, dir, dist);
      // WHERE it landed decides what it did. The head is a narrow window
      // high up: you get one when a round strays, not when he decides to
      // take one, and that is the only reason it is allowed to hurt this
      // much.
      const head = hitH > 1.45 && Math.abs(mX) < 0.14;
      const mult = head ? 2.0 : hitH < 0.80 ? 0.55 : 1;
      // NO LENS BLOOD FROM BEING SHOT. That is the hurt vignette's job,
      // and stacking both meant four hits in a firefight left the screen
      // solid red. The lens is for blood you are close enough to WEAR -
      // i.e. blood you caused.
      player.hurt(G.dmg * 0.42 * mult * (0.8 + Math.random() * 0.4), t);
    } else {
      // A MISS YOU CAN SEE. It carries past you and cracks off whatever
      // is behind - the feedback that was missing entirely before, and
      // the thing that tells you whether you are winning because you are
      // moving well or because he is a bad shot.
      const shot = this.markHit(mz, dir, dist + 14, a.P || this.game.level.plan);
      this.tracer(mz, dir, shot ? mz.distanceTo(shot.p) : dist + 14);
      if (shot) this.fx.impact(shot.p, shot.n, shot.kind);
    }
  }

  /**
   * How many are left ON THIS FLOOR.
   *
   * With the building physical this used to count every man in the tower
   * - the storey above is peopled before you get there - so the HUD read
   * "33 UP" on a floor with sixteen men on it.
   */
  get remaining() {
    const f = this.game.floor;
    return this.actors.filter((a) => a.alive && (a.floor || 1) === f).length;
  }
}

function clampP(a, player) {
  const dy = (player.pos.y + 1.4) - (a.base + a.body.height * 0.78);
  return Math.max(-0.7, Math.min(0.7, dy / Math.max(1.5, a.range)));
}

let HALO = null;
function haloTexture() {
  if (HALO) return HALO;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  g.addColorStop(0, 'rgba(255,210,130,0.75)');
  g.addColorStop(0.35, 'rgba(255,170,70,0.28)');
  g.addColorStop(1, 'rgba(255,150,50,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  HALO = new THREE.CanvasTexture(c);
  HALO.colorSpace = THREE.SRGBColorSpace;
  return HALO;
}
