// =====================================================================
// HIGHRISE :: ai.js - MEN WHO KNOW WHEN TO COME AND WHEN TO WAIT
// =====================================================================
//
// Liam: *"make the NPCs have very smart intelligence for advancing so
// they know when to approach and when to stay back and shoot and take
// cover"*, and separately that the fight should be *"not impossible ...
// but not a walk in the park"*.
//
// Those two together rule out the two easy answers. Enemies that charge
// are free kills; enemies that camp are a chore. What makes a firefight
// is that the pressure on you VARIES - somebody is always coming, but
// never everybody, and the ones who are not coming are shooting so you
// cannot look at the one who is.
//
// So the intelligence here is not in any single man. It is in a shared
// budget:
//
//   * The squad holds a small number of ADVANCE TOKENS. Only a token
//     holder may close on the player. Everyone else holds cover and
//     fires. When a token holder dies or reaches its goal, the token
//     goes back and somebody else moves.
//   * A man with no token still repositions SIDEWAYS - to a cover spot
//     with a different angle. That is what makes a room feel like it is
//     closing in without anybody rushing you.
//   * Everybody who is being shot at ducks. Suppression is real: it
//     stops them shooting back for a moment, which is what makes YOUR
//     covering fire worth spending ammo on.
//
// The individual decisions are the small ones: is there a wall between
// us, is my magazine empty, is this the range my weapon likes.
import { W, D, CELL, toWorld, toCell, EMPTY } from './plan.js';
import { blocker } from './collide.js';

// ---------------------------------------------------------------------
// SIGHT - a grid walk, because the walls are a grid
// ---------------------------------------------------------------------
export function canSee(P, ax, az, bx, bz) {
  let [x0, z0] = toCell(ax, az);
  const [x1, z1] = toCell(bx, bz);
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
  let err = dx - dz, n = 0;
  while (n++ < 200) {
    if (x0 === x1 && z0 === z1) return true;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x0 += sx; }
    if (e2 < dx) { err += dx; z0 += sz; }
    if (x0 < 0 || z0 < 0 || x0 >= W || z0 >= D) return false;
    // GLASS DOES NOT STOP A BULLET OR A LOOK. That is the whole point of
    // a glazed perimeter: the ledge route is exposed, and so is anyone
    // standing at a window.
    const v = P.at(x0, z0);
    if (v === 1 || v === 3) return false;
  }
  return false;
}

// ---------------------------------------------------------------------
// PATHS - breadth first from the player, once per second, shared by all
// ---------------------------------------------------------------------
//
// Every enemy on the floor wants to know the way to the same place, so
// computing one flow field beats running A* fifty times. It also gives
// the AI something A* does not: the DISTANCE from every cell to the
// player, which is what "hold at eight metres" needs to be cheap.
export function flowField(P, tx, tz, nav) {
  const dist = new Int32Array(W * D).fill(-1);
  const [sx, sz] = toCell(tx, tz);
  if (sx < 0 || sz < 0 || sx >= W || sz >= D) return dist;
  const q = [sz * W + sx];
  dist[sz * W + sx] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cz = (c / W) | 0, d = dist[c];
    for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + ox, nz = cz + oz;
      if (nx < 1 || nz < 1 || nx >= W-1 || nz >= D-1) continue;
      const i = nz * W + nx;
      if (dist[i] >= 0) continue;
      // THE FURNITURE COUNTS. `nav` is the plan grid OR'd with every
      // prop a man cannot step over or duck under (nav.js) - without it
      // the shortest route to the player goes straight through a desk,
      // and a man takes it and grinds against the desk forever because
      // the cell on the far side never gets any closer.
      if (nav ? nav[i] : P.at(nx, nz) !== EMPTY) continue;
      dist[i] = d + 1;
      q.push(i);
    }
  }
  return dist;
}

// ---------------------------------------------------------------------
export class Squad {
  constructor(P) {
    this.P = P;
    this.field = null;
    this.fieldAt = -99;
    // HOW MANY MAY COME AT ONCE. Two is the number that makes a room
    // feel busy without becoming a queue to die in; it rises by one
    // every twenty floors so the building gets meaner as you climb.
    this.tokens = 2;
    this.held = new Set();
  }
  update(P, px, pz, t, floor, nav) {
    if (t - this.fieldAt > 0.45) {
      this.field = flowField(P, px, pz, nav);
      this.fieldAt = t;
      this.tokens = 2 + Math.floor(floor / 20);
    }
  }
  wants(a) {
    if (this.held.has(a.id)) return true;
    if (this.held.size >= this.tokens) return false;
    this.held.add(a.id);
    return true;
  }
  release(a) { this.held.delete(a.id); }
  distAt(x, z) {
    if (!this.field) return 9999;
    const [cx, cz] = toCell(x, z);
    if (cx < 0 || cz < 0 || cx >= W || cz >= D) return 9999;
    const d = this.field[cz * W + cx];
    return d < 0 ? 9999 : d;
  }
}

// ---------------------------------------------------------------------
// ONE MAN
// ---------------------------------------------------------------------
const SPEED = { hold: 0, walk: 2.1, move: 3.5, rush: 5.0 };

export function think(a, ctx, dt) {
  const { P, squad, player, t } = ctx;
  if (!a.alive) return;

  // ---- HE IS ONLY IN THIS FIGHT IF HE IS ON THIS FLOOR --------------
  //
  // Liam: *"the player will randomly take damage with no real villian
  // nearby ... stop enemies from knowing the player is there without
  // seeing them"*. Both of those were the same bug, and I introduced it
  // when I made the building physical.
  //
  // Everything in here was two-dimensional, because until the tower
  // stacked there was only ever one storey and there was nothing above
  // or below to be confused with. canSee() walks the plan grid on x and
  // z; range was hypot(dx, dz). So a guard standing on floor 3 directly
  // over your head measured a range of about half a metre, walked an
  // unobstructed line to you across HIS OWN floor plan, decided he could
  // see you, and opened fire through eight hundred millimetres of
  // reinforced concrete. You took the damage; the muzzle flash and the
  // tracer were three metres above the ceiling where you never saw them.
  // His whole squad then converged on a player they had never laid eyes
  // on, which is the second half of what Liam is describing.
  //
  // Two changes, and they have to be both:
  //
  //   1. RANGE IS THREE-DIMENSIONAL. That alone fixes the weapon bands,
  //      the 26 m alerting gate, "too close", and the enemy's own melee
  //      reach - every one of which was reading a man on another storey
  //      as being at point-blank.
  //   2. A HARD FLOOR GATE on sight. A slab is not a wall you might see
  //      round; there is no angle from which floor 3 can see floor 2, so
  //      it is not a distance test, it is a flat no.
  // ---- HE IS LOOKING FOR A HEAD, NOT A BODY ------------------------
  //
  // Liam: *"the player can lean out from behind cover and shoot at the
  // enemies"*. That only means anything if leaning also EXPOSES him. So
  // every sight test is against the leaned head - the same point his own
  // shots leave from - while the path he walks still aims at the body,
  // because you walk to a man, not to his head.
  const hx = (player.head && player.head.x) || player.pos.x;
  const hz = (player.head && player.head.z) || player.pos.z;
  const dy = player.pos.y - (a.base || 0);
  const sameFloor = Math.abs(dy) < 1.9;

  // ---- HE LEANS OUT, FIRES, AND DUCKS BACK -------------------------
  //
  // Liam: *"see if you can make enemies do this to so we have john wick
  // plus old movie style gun scenes where the player and enemies get out
  // from behind cover to shoot for a couple seconds then duck back"*.
  //
  // The squad already decided WHO advances and who holds; what it had no
  // concept of was a man being briefly UNAVAILABLE. Everyone in cover
  // could see and be seen continuously, so a firefight was a flat
  // exchange - nobody ever appeared or disappeared, and there was no
  // moment to move in.
  //
  // So a man in cover runs a cycle: hidden for a couple of seconds, out
  // for one or two. While he is out he leans - genuinely, the same way
  // the player does, offsetting the point he sees and shoots FROM - and
  // while he is in he cannot see you and you cannot hit him. That single
  // rhythm is what makes a room worth reading: you learn his timing, and
  // the two seconds he is down is the ground you cross.
  a.peekT = (a.peekT || 0) - dt;
  if (a.peekT <= 0) {
    a.exposed = !a.exposed;
    // out for one or two seconds, in for two or three, and never in step
    // with the man beside him
    a.peekT = a.exposed ? 0.9 + Math.random() * 1.1 : 1.6 + Math.random() * 1.5;
  }
  // WHICH SIDE HE COMES OUT ON is whichever one can actually see the
  // player - a man who leans into the wall he is hiding behind is a man
  // shooting drywall.
  //
  // ---- AND THE THINGS IN THE ROOM COUNT NOW -------------------------
  //
  // Liam: *"make it so the player can use objects so they don't get hit
  // by bullets like a barrier to hide behind"*.
  //
  // canSee() walks the PLAN GRID, so until now the only thing in this
  // building that stopped a look or a round was a wall. Every barrier,
  // counter, locker bank and filing cabinet was see-through and
  // shoot-through: you could crouch behind a concrete barrier and be shot
  // dead through it.
  //
  // Blocking the bullet alone would not have been enough. If they still
  // SAW you through the barrier, 85% of them hold cover and plink at it
  // forever, and you would be pinned by men who could never hit you. So
  // sight and the bullet are gated by the same test - and then hiding
  // does what hiding is for: they lose you, and fall back on believing
  // you are where they last saw you, which is already how the rest of
  // this file thinks.
  const eyeY = a.base + a.body.height * 0.78;
  const hy = player.pos.y + (player.eye || 1.63) * 0.9;
  const cov = ctx.cover;
  const looks = (fx, fz) => canSee(P, fx, fz, hx, hz)
    && !(cov && blocker(cov, fx, eyeY, fz, hx, hy, hz));

  const rgx = Math.cos(a.yaw), rgz = -Math.sin(a.yaw);
  let side = 0;
  if (a.exposed && sameFloor) {
    // HE COMES OUT THE SIDE THAT CLEARS THE OBJECT, not just the wall.
    for (const sd of [1, -1]) {
      if (looks(a.x + rgx * 0.55 * sd, a.z + rgz * 0.55 * sd)) { side = sd; break; }
    }
    // ---- AND HE LEANS OUT TO LOOK, NOT ONLY TO SHOOT -----------------
    //
    // Liam: *"make the enemies visibly lean out to shoot at the
    // player"*. Measured before this: they leaned 5% of the time. The
    // reason was this test - a man only came out if coming out ALREADY
    // gave him a sightline, so the one moment he most wants to lean, when
    // he has lost you behind something and is trying to find you again,
    // was the one moment he stood still.
    //
    // That is backwards. Leaning out is how you look round an edge. If
    // neither side sees you he comes out on the side nearer to where he
    // believes you are - and either finds you, or does not and ducks back
    // when his peek timer runs out. He cannot shoot from here (a.fire
    // needs `sees`), so this buys the look and nothing else.
    //
    // Only while he is holding a position. A man crossing the floor in
    // `seek` or `push` leaning the whole way looks drunk, not careful.
    if (!side && a.aware && (a.state === 'cover' || a.state === 'fight' || a.state === 'back')) {
      const d1 = Math.hypot(a.x + rgx * 0.55 - a.lx, a.z + rgz * 0.55 - a.lz);
      const d2 = Math.hypot(a.x - rgx * 0.55 - a.lx, a.z - rgz * 0.55 - a.lz);
      side = d1 < d2 ? 1 : -1;
    }
  }
  a.lean = (a.lean || 0) + (side - (a.lean || 0)) * Math.min(1, dt * 6);
  // the point he sees and shoots from, published for combat.js
  a.fx = a.x + rgx * a.lean * 0.55;
  a.fz = a.z + rgz * a.lean * 0.55;

  const dx = hx - a.fx, dz = hz - a.fz;
  const range = Math.hypot(dx, dy, dz);
  const flat = Math.hypot(dx, dz);
  const sees = sameFloor && flat < 44 && looks(a.fx, a.fz);
  if (sees) { a.lastSeen = t; a.lx = hx; a.lz = hz; }

  // ---- WHAT HE BELIEVES, WHICH IS NOT WHAT IS TRUE ------------------
  //
  // Liam: *"make them good at hiding behind walls and leaning out and
  // getting behind cover with real sight so if they don't see the player
  // they just assume they are where they were last"*.
  //
  // They were cheating, and the cheat was structural: every goal, every
  // cover test and every angle was computed against player.pos - the
  // player's ACTUAL position - so a man who had not seen you for six
  // seconds still walked a perfect line to where you were now. It looks
  // like clairvoyance because it is.
  //
  // From here down nothing reads the player's position directly. It reads
  // BELIEF: where he is if he can see him, and the last place he saw him
  // if he cannot. That one substitution is what makes breaking line of
  // sight worth doing - you leave a man shooting at a doorway you are no
  // longer standing in.
  const bx = sees ? hx : a.lx;
  const bz = sees ? hz : a.lz;
  const bRange = Math.hypot(bx - a.fx, bz - a.fz);

  // ---- suppression: being shot at stops you shooting back ----------
  a.suppress = Math.max(0, a.suppress - dt * 1.6);
  const ducking = a.suppress > 0.8;

  // ---- what does this weapon want? ---------------------------------
  // The range band IS the personality. A shotgun that hangs back and an
  // AK that charges are both wrong, and both read as stupid.
  const G = a.gun;
  const want = G.melee ? 1.4 : (G.range < 25 ? 6 : 14);
  const tooClose = range < want * 0.55;
  const tooFar = range > want * 1.55;

  // ---- decide -------------------------------------------------------
  let state = 'hold';
  if (!a.aware) {
    // not yet alerted: idle until seen, heard, or told
    if (sees && range < 26) { a.aware = true; a.alertAt = t; }
    else { a.state = 'idle'; a.speed = 0; a.faceX = a.faceX || 0; a.faceZ = a.faceZ || 1; return; }
  }

  // AND AN ALERTED MAN ON ANOTHER STOREY STILL CANNOT CHASE YOU THROUGH
  // A FLOOR. He holds what he knows and searches his own floor for it -
  // which is right: you were up there a moment ago, and when you come
  // back down the stairs he is still looking.
  if (!sameFloor) {
    a.state = 'seek';
    a.fire = false;
    a.goal = { x: a.lx, z: a.lz };
    a.speed = SPEED.walk;
    a.sees = false;
    a.range = range;
    squad.release(a);
    a.faceX = (a.lx - a.x); a.faceZ = (a.lz - a.z);
    return;
  }

  // ---- OUT OF AMMUNITION IS A DECISION, NOT AN END ------------------
  //
  // Liam wanted NPCs *"capable of hand to hand combat"*. The moment that
  // matters is this one: a man with an empty rifle and no spare
  // magazines, with you closing on him. He throws the rifle down and
  // comes at you - which is both the right behaviour and the clearest
  // possible signal to the player that this one is now a different kind
  // of problem. It also means the rifle is on the floor, in front of
  // him, and you both know it.
  if (a.gunId && !G.melee && a.mag <= 0 && a.spare <= 0) a.wantDrop = true;
  const brawler = !a.gunId || G.melee;

  // ---- WHAT MAKES A HOLDER STOP HOLDING ----------------------------
  //
  // Liam: *"if the player gets up close and personal the enemies will
  // adapt and thats only if the player is melee or is close to the enemy
  // like really close"*.
  //
  // Two triggers and nothing else. A man does not abandon good cover
  // because the fight has gone on a while; he abandons it because
  // somebody is about to be inside it with him.
  //
  //   * REALLY CLOSE - four and a half metres, which is across a room,
  //     not down a corridor.
  //   * OR COMING WITH A BLADE - the reach is longer for that, because a
  //     man with a machete at seven metres is four seconds from your
  //     throat and standing still is how you die.
  const pressed = range < 4.5 || (player.armedMelee && range < 7.5);

  if (t - a.lastSeen > 6.5) state = 'seek';        // lost him: go looking
  else if (a.stagger > 0) state = 'cover';
  else if (!brawler && a.mag <= 0 && a.spare > 0) state = 'reload';
  else if (brawler && sees) state = 'brawl';
  else if (pressed) {
    // ADAPT. Back off and keep shooting if there is room to; if he is
    // already inside your reach, or you have nothing to shoot with, meet
    // him with your hands.
    state = (brawler || a.mag <= 0) ? 'brawl' : (tooClose ? 'back' : 'fight');
  }
  else if (ducking) state = 'cover';
  else if (!sees) state = 'seek';
  else if (tooClose) state = 'back';
  // ---- AND ONLY THE ONE IN SEVEN EVER ADVANCES --------------------
  //
  // This used to read `tooFar || squad.wants(a)`, and `tooFar` is true of
  // almost everybody at the start of a fight - a rifleman wants to be
  // fourteen metres away and the room is twenty across. So the whole
  // floor walked at you at once, which is the opposite of the scene Liam
  // is describing. Now a HOLDER never advances at all: he finds a wall
  // and works it. Everybody else still needs a squad token.
  else if (!a.holds && (tooFar || squad.wants(a))) state = 'push';
  else state = sees ? 'fight' : 'cover';

  a.state = state;

  // ---- act ----------------------------------------------------------
  a.fire = false;
  switch (state) {
    case 'reload': {
      a.reloadT = (a.reloadT || 0) + dt;
      a.speed = SPEED.walk;
      a.goal = coverSpot(a, ctx) || { x: a.lx, z: a.lz };
      if (a.reloadT === dt) a.anim.play('reloadMag', G.reload);
      if (a.reloadT > G.reload) {
        const take = Math.min(G.mag, a.spare);
        a.mag = take; a.spare -= take; a.reloadT = 0;
      }
      break;
    }

    // ---- CLOSING TO ARM'S LENGTH ------------------------------------
    //
    // A man with a machete or with nothing does not take cover and he
    // does not hold a firing line. He runs at you, and the only thing
    // that makes that fair is that you can hear him coming and he has to
    // cross the room. He does NOT slow down at the end - a brawler who
    // decelerates into range is a brawler who never arrives.
    case 'brawl':
      // he is close enough to see; belief and truth are the same thing
      a.goal = { x: bx, z: bz };
      a.speed = range < G.reach * 0.9 ? 0 : SPEED.rush;
      a.fire = false;
      squad.release(a);
      break;

    case 'cover': {
      // Hold what we have; only move if this spot is not actually cover.
      const spot = coverSpot(a, ctx);
      a.goal = spot || { x: a.x, z: a.z };
      a.speed = spot ? SPEED.move : 0;
      // AND HE SHOOTS ON THE WAY OUT. Cover used to mean "does nothing",
      // which made half the room furniture. Now it means "waits, leans
      // out, fires, ducks" - and the ducking is what gives the player a
      // window to move up.
      a.fire = a.exposed && sees;
      break;
    }

    case 'seek':
      // Walk the flow field toward where he was. Not a sprint: a man
      // hunting somebody with a gun does not run round blind corners.
      a.goal = { x: a.lx, z: a.lz };
      a.speed = SPEED.move;
      squad.release(a);
      break;

    case 'back':
      a.goal = { x: a.x - dx / flat * 4, z: a.z - dz / flat * 4 };
      a.speed = SPEED.move;
      a.fire = true;
      break;

    case 'push':
      a.goal = { x: bx, z: bz };
      a.speed = G.melee ? SPEED.rush : SPEED.move;
      // fire on the move, badly - that is the trade for closing
      a.fire = sees && Math.random() < 0.55;
      a.moving = true;
      if (range < want) { squad.release(a); a.state = 'fight'; }
      break;

    default: {   // fight: hold a firing position, shuffle for the angle
      squad.release(a);
      a.speed = 0;
      // THE SAME PULSE AS COVER. A man holding a line who never stops
      // firing gives the player nothing to time, and four of them is a
      // wall of tracer with no gap in it. He fires while he is out and
      // reads the room while he is not.
      a.fire = a.exposed;
      // SIDESTEP. A man who never moves is a target; a man who crosses
      // the room is a fool. He slides between nearby firing spots, which
      // is what makes a room feel like it is closing in.
      a.strafeT = (a.strafeT || 0) - dt;
      if (a.strafeT <= 0) {
        a.strafeT = 1.4 + Math.random() * 2.2;
        const s = Math.random() < 0.5 ? 1 : -1;
        a.goal = { x: a.x - dz / flat * 2.4 * s, z: a.z + dx / flat * 2.4 * s };
        a.speed = SPEED.walk;
      }
      break;
    }
  }

  // ---- WHERE HE WANTS TO LOOK ---------------------------------------
  //
  // Only the DIRECTION, not the angle. combat.js turns his feet toward it
  // slowly and takes up the remainder with his waist, which is what makes
  // a man tracking you look like a man rather than a turret. Writing
  // `a.yaw` straight from here - which the old version did - snapped him
  // instantly and left nothing for the spine to do.
  //
  // And the DIRECTION IS THE DIRECTION. The mesh is baked facing -Z now,
  // so there is no quarter turn to add anywhere, and the two different
  // correction angles that used to live in combat.js and main.js are
  // gone. That was Liam's *"characters visibly turned left 90 degrees"*.
  const known = sees || t - a.lastSeen < 3;
  a.faceX = known ? -(player.pos.x - a.x) : (a.goal ? -(a.goal.x - a.x) : 0);
  a.faceZ = known ? -(player.pos.z - a.z) : (a.goal ? -(a.goal.z - a.z) : 1);
  a.sees = sees;
  a.range = range;
}

// ---------------------------------------------------------------------
// COVER - a cell that breaks the line, next to one that does not
// ---------------------------------------------------------------------
//
// That second half is the whole idea. Anywhere out of sight is "safe",
// and a man who runs somewhere safe has left the fight. Cover worth
// taking is somewhere he can be SAFE AND STILL SHOOT by leaning out -
// so the test is a hidden cell with a visible neighbour.
function coverSpot(a, ctx) {
  const { P } = ctx;
  // AGAINST WHERE HE THINKS YOU ARE. Picking cover against the player's
  // real position means he hides from somewhere he has no reason to know
  // about - and, worse, stops hiding the instant you move, which looks
  // like the wall stopped working.
  const px = a.lx, pz = a.lz;
  const [cx, cz] = toCell(a.x, a.z);
  let best = null, bestScore = -1e9;
  for (let oz = -5; oz <= 5; oz++) for (let ox = -5; ox <= 5; ox++) {
    const nx = cx + ox, nz = cz + oz;
    if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= D - 1) continue;
    if (P.at(nx, nz) !== EMPTY) continue;
    const [wx, wz] = toWorld(nx, nz);
    if (canSee(P, wx, wz, px, pz)) continue;                        // must be hidden
    let peek = false;
    for (const [px2, pz2] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const [ex, ez] = toWorld(nx + px2, nz + pz2);
      if (P.at(nx + px2, nz + pz2) !== EMPTY) continue;
      if (canSee(P, ex, ez, px, pz)) { peek = true; break; }
    }
    if (!peek) continue;                                            // must be able to lean out
    const near = Math.hypot(wx - a.x, wz - a.z);
    const toPlayer = Math.hypot(wx - px, wz - pz);
    const score = -near * 1.2 - Math.abs(toPlayer - (a.gun.range < 25 ? 7 : 13)) * 0.8;
    if (score > bestScore) { bestScore = score; best = { x: wx, z: wz }; }
  }
  return best;
}
