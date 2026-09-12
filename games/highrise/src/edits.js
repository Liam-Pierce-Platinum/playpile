import { asset } from './base.js';
import { W as W_, D as D_ } from './plan.js';
// =====================================================================
// HIGHRISE :: edits.js - CORRECTIONS THAT OUTLIVE THE TAB
// =====================================================================
//
// Liam: *"make it so that all edits I make are permenetly changed"*.
//
// The editor could already move, rotate and scale anything on any floor;
// what it could not do was remember. Every correction died on reload,
// which made it a measuring instrument rather than a tool - you could
// find that the copier was two metres tall, but you could not fix it,
// you could only tell me and wait.
//
// HOW IT WORKS, and why this shape:
//
// A storey is GENERATED, not authored. plan.js and level.js build it from
// a seed, so there is no file to edit - the vending machine on floor 3
// does not exist anywhere until the moment you walk up to it. So an edit
// cannot be a change to source data. It is a PATCH, applied after the
// floor is built, keyed by where the object sits in that floor's own
// child list.
//
//     { "3": { "12:vending": { "p": [x,y,z], "r": ry, "s": scale } } }
//
// The key carries the index AND the name, and the name is checked before
// the patch is applied. That is the whole safety mechanism: if I change
// the furnisher and child 12 stops being a vending machine, the edit is
// skipped and reported rather than silently scaling a wall. It is not
// bulletproof - reorder two vending machines and the patch follows the
// index, not the object - but it degrades into "does nothing", which is
// the right way for a tool like this to fail.
//
// Deleting edits.json puts the whole building back.
let DATA = {};
let loaded = false;
const skipped = [];

/** read the saved corrections. Called once, before the first floor. */
export async function loadEdits() {
  try {
    const r = await fetch(asset('edits.json'), { cache: 'no-store' });
    DATA = r.ok ? await r.json() : {};
  } catch (e) {
    // A DEV TOOL MUST NEVER STOP THE GAME BOOTING. No file, no server
    // route, bad JSON - the building still has to open.
    console.warn('edits.json not loaded:', e.message);
    DATA = {};
  }
  loaded = true;
  return DATA;
}

export function editsFor(floor) { return DATA[String(floor)] || {}; }
export function allEdits() { return DATA; }
export function editsReady() { return loaded; }

/** a stable-ish name for a thing on a floor, for the key and the check */
export function nameOf(o) {
  return o.userData.refName || o.name || o.type;
}

/**
 * Put the saved corrections back onto a freshly built storey.
 *
 * Applied to the group's DIRECT children only, which is the same set the
 * editor lets you select (see Editor.pick) - so anything you could edit
 * is something this can restore, and nothing else is touched.
 */
/**
 * The key an edit is stored under.
 *
 * Liam: *"make sure when you update this stuff you don't undo the changes
 * I do to the map"*.
 *
 * This used to be `<child index>:<name>`, and that was a trap I built for
 * him. The index is a position in `world.group.children`, which is
 * whatever order level.js happened to add things in - so ANY change I
 * make to the furnisher renumbers everything after the line I touched. In
 * one session I added a water cooler loop, changed three room pools, and
 * dropped a bin under each desk; every one of those shifted the indices
 * and quietly stranded every edit on every floor. The name check meant it
 * failed safe rather than moving the wrong object, but "failed safe" here
 * means his work silently did nothing.
 *
 * So the key is now the object's IDENTITY: what it is, and where the
 * generator put it. Neither of those moves when I add a prop somewhere
 * else on the floor, or reorder the pools, or add a new kind of thing.
 * The generated position is stamped on at build time - see
 * Building.ensure - BEFORE any edit is applied, so it is stable across
 * reloads even for objects the user has since dragged somewhere else.
 */
export function keyOf(o) {
  const g = o.userData.gen || o.position;
  // A COPY LANDS ON TOP OF ITS ORIGINAL, so identity alone is no longer
  // unique - CTRL+D would give both objects the same key and the second
  // would overwrite the first in edits.json. spawnProp stamps a counter
  // when it finds the spot already taken; it is only present on copies,
  // so every key written before this still reads back unchanged.
  const d = o.userData.dup ? '#' + o.userData.dup : '';
  return nameOf(o) + '@' + g.x.toFixed(2) + ',' + g.z.toFixed(2) + d;
}

/** how far a prop may have drifted and still be recognised, in metres */
const SNAP = 1.25;

/**
 * Props I have RENAMED, old name -> new name.
 *
 * Every one of these is the same mesh out of the same file; only the
 * label changed, because I worked out what the thing actually was. But an
 * edit is keyed by name, so a rename of mine silently orphans Liam's
 * work - which is precisely what he came back about. Renaming something
 * is not a reason for him to lose an afternoon.
 *
 * ADD TO THIS EVERY TIME A PROP IS RENAMED. It costs one line and the
 * alternative is telling him to do it again.
 */
const ALIAS = {
  // 'officebin' was office-pack mesh 8, which turned out to be a bin
  // modelled lying on its side with its contents coming out - litter,
  // not a bin. It is not placed upright anywhere any more, so an edit
  // made on one goes to the real bin instead: lata_de_lixo_de_ps1, which
  // is a proper upright bin and is what he thought he was moving.
  // 'door' was the single hinged door for about an hour before it became
  // doorA/doorB/doorC (left-hung, right-hung, double). Anything placed
  // under the old name lands on the left-hung one, which is what it was.
  door: 'doorA',
  monitor: 'bin',
  officebin: 'bin',
  printer: 'workstation',
  desk: 'workstation',      // office pack mesh 6 is the whole cluster
  pctower: 'vcr',           // mesh 9 is a disc player
  chair: 'seatpad',         // mesh 0 is two cushions with no frame
  drafting: 'cabinets',     // mesh 11 is two tall cabinets
  openbook: 'deskmat',
  sofa: 'armchair',        // procedural sofa replaced by the leather chair
};
/**
 * Everything on this floor that could be what an edit named.
 *
 * THE LITERAL NAME COMES FIRST, and that ordering is the whole point.
 * level.js has procedural furniture whose groups are named 'desk' and
 * 'chair' - the same words as two of the renamed reference props - so
 * translating through ALIAS unconditionally took an edit made on a
 * procedural desk and went looking for a workstation instead. An alias is
 * a fallback for when the original name has gone, never a substitution
 * for a name that is still in use.
 */
const candidates = (byName, nm) => {
  const lit = byName.get(nm) || [];
  if (lit.length) return lit;
  const a = ALIAS[nm];
  return (a && byName.get(a)) || [];
};

/**
 * Apply a storey's saved corrections.
 *
 * `spawn(world, name, x, z, ry)` is handed in by building.js so this can
 * put back props that were never generated. Liam places things from the
 * asset bar; those exist only in edits.json, so an edit has to be able to
 * ADD as well as move. Without it, everything he built vanished on
 * reload - which the first run of tools/build.mjs reported as two props
 * placed, saved, and zero present afterwards.
 */
// ---------------------------------------------------------------------
// WALL EDITS - changing the LAYOUT, not just what stands on it
// ---------------------------------------------------------------------
//
// Liam: *"let me not just make platforms but select individual walls and
// extend them so I can change the layout by hand"*.
//
// A wall in this building is not an object. Every cell of the plan grid
// that is WALL becomes a box, and all of them are merged into one mesh
// per storey - so there is nothing to select and nothing to drag (that
// is R11 in STYLE.md, and it is why placing 'wall' props was the only
// answer available before now).
//
// The thing that IS editable is the plan the mesh is built from. So a
// wall edit is a cell edit: [x, z, value], stored under a reserved key
// so it travels in the same edits.json as everything else, applied
// BEFORE the geometry is built rather than after.
//
// It has to be before. Props are moved after the floor is built because
// a prop is an object with a transform; a wall has no transform to
// change - the only way to move it is to build it somewhere else.
export const PLAN_KEY = '#plan';

/** Cell edits saved for a storey, as a Map keyed "x,z". */
export function planEdits(floor) {
  const E = editsFor(floor);
  const rec = E && E[PLAN_KEY];
  const out = new Map();
  if (rec && Array.isArray(rec.cells))
    for (const c of rec.cells) out.set(c[0] + ',' + c[1], c[2]);
  return out;
}

/**
 * Write the saved cell edits into a freshly generated plan.
 *
 * Returns how many cells were changed. Doors and rooms are left alone:
 * they are the generator's description of its own layout and re-deriving
 * them from an edited grid is a much bigger job than this - so a wall
 * painted across a doorway blocks it, which is what anyone would expect.
 */
export function applyPlanEdits(P, floor) {
  const cells = planEdits(floor);
  if (!cells.size) return 0;
  let done = 0;
  for (const [k, v] of cells) {
    const [x, z] = k.split(',').map(Number);
    if (!(x >= 0 && z >= 0 && x < W_ && z < D_)) continue;
    P.g[z * W_ + x] = v;
    done++;
  }
  return done;
}

/**
 * Change one cell, now, in memory, and hand back the whole cell list.
 *
 * A rebuild reads `planEdits`, which reads the loaded DATA - so an edit
 * that lives only in the editor's `dirty` map is invisible to the rebuild
 * that is supposed to show it. Painting a wall would do nothing until you
 * saved and reloaded, which is not a tool anybody can use.
 *
 * So the stage goes in DATA immediately (the same place a save would put
 * it) and the returned array goes in `dirty` so it also reaches the disk.
 */
export function stagePlanEdit(floor, x, z, v) {
  const key = String(floor);
  if (!DATA[key]) DATA[key] = {};
  const rec = DATA[key][PLAN_KEY] || (DATA[key][PLAN_KEY] = { cells: [] });
  const i = rec.cells.findIndex((c) => c[0] === x && c[1] === z);
  if (i >= 0) rec.cells[i] = [x, z, v]; else rec.cells.push([x, z, v]);
  return { cells: rec.cells.slice() };
}

/** what the generator would have put there, before any edit */
export function stagedCell(floor, x, z) {
  const rec = (DATA[String(floor)] || {})[PLAN_KEY];
  if (!rec) return undefined;
  const c = rec.cells.find((q) => q[0] === x && q[1] === z);
  return c ? c[2] : undefined;
}

export function applyEdits(world, spawn) {
  const E = editsFor(world.n);
  const keys = Object.keys(E);
  if (!keys.length) return 0;
  const kids = world.group.children;

  // everything on this floor, indexed by identity and by name
  const byKey = new Map(), byName = new Map();
  kids.forEach((o, i) => {
    byKey.set(keyOf(o), o);
    const nm = nameOf(o);
    if (!byName.has(nm)) byName.set(nm, []);
    byName.get(nm).push(o);
  });

  // WHAT ACTUALLY GOT APPLIED, by key, recorded on the floor itself.
  //
  // tools/edits.mjs used to re-derive this by looking for an object whose
  // key matched, and got it wrong the moment a key was matched through an
  // ALIAS - it reported five of Liam's edits as lost when they had been
  // applied correctly. A check that reconstructs what the code did is a
  // second implementation to get wrong; this is the code telling it.
  world.appliedEdits = [];
  let n = 0, moved = 0;
  for (const key of keys) {
    const e = E[key];
    if (!e) continue;

    let o = byKey.get(key);

    // ---- SOMETHING HE PUT THERE HIMSELF -----------------------------
    //
    // No generated prop can match, because there was never one to match:
    // the entry carries the name of the thing to make.
    if (!o && e.add && spawn) {
      const at = key.indexOf('@');
      const [gx, gz] = at > 0 ? key.slice(at + 1).split(',').map(Number)
                              : [e.p ? e.p[0] : 0, e.p ? e.p[2] : 0];
      o = spawn(world, e.add, gx, gz, 0);
      if (o) {
        o.userData.gen = { x: +gx.toFixed(3), y: 0, z: +gz.toFixed(3) };
        o.userData.handmade = true;
        byKey.set(keyOf(o), o);
      }
    }

    // ---- LEGACY KEYS, from before this changed ----------------------
    //
    // The old form was `<index>:<name>`. Anything saved under it is still
    // honoured - by NAME and nearest position, never by the index, which
    // is the thing that was wrong - and it gets rewritten to the new form
    // the next time that floor is saved.
    if (!o && /^\d+:/.test(key)) {
      const cands = candidates(byName, key.slice(key.indexOf(':') + 1));
      if (cands.length === 1) o = cands[0];
      else if (cands.length && e.p) {
        // SEVERAL OF THAT KIND ON THE FLOOR, and no reliable index. The
        // edit does carry one more piece of evidence: where he MOVED it
        // to. A man nudging a bin moves it a little, so the bin he meant
        // is overwhelmingly likely to be the one nearest that spot.
        let best = null, bestD = 1e9;
        for (const c of cands) {
          const g = c.userData.gen || c.position;
          const d = Math.hypot(g.x - e.p[0], g.z - e.p[2]);
          if (d < bestD) { bestD = d; best = c; }
        }
        o = best;
      }
      if (o) moved++;
    }

    // ---- OR THE GENERATOR NUDGED IT ---------------------------------
    //
    // A change to the plan can move a prop by a few centimetres without
    // meaning to lose it. If exactly one thing of that name is within
    // arm's reach of where the edit was made, that is it.
    if (!o) {
      const at = key.indexOf('@');
      if (at > 0) {
        const nm = key.slice(0, at);
        // strip the copy counter before reading the coordinates
        const co = key.slice(at + 1).split('#')[0];
        const [kx, kz] = co.split(',').map(Number);
        // IF THERE IS ONLY ONE OF THEM ON THE FLOOR, IT IS THAT ONE.
        //
        // The distance limit exists to stop an edit attaching to the
        // wrong bin when there are nine bins. Where the floor holds
        // exactly one copier, there is nothing to confuse it with and
        // refusing to match because it has moved two metres just loses
        // work for no gain.
        const pool = candidates(byName, nm);
        let best = null, bestD = pool.length === 1 ? 1e9 : SNAP;
        for (const c of pool) {
          const g = c.userData.gen || c.position;
          const d = Math.hypot(g.x - kx, g.z - kz);
          if (d < bestD) { bestD = d; best = c; }
        }
        if (best) { o = best; moved++; }
      }
    }

    if (!o) { skipped.push('floor ' + world.n + '  ' + key); continue; }
    if (e.p) o.position.set(e.p[0], e.p[1], e.p[2]);
    if (typeof e.r === 'number') o.rotation.y = e.r;
    // 's' was a single number. It still is, for every edit Liam has
    // already made - so a number still means "the same on all three".
    // Non-uniform edits save an array instead.
    if (Array.isArray(e.s)) o.scale.set(e.s[0], e.s[1], e.s[2]);
    else if (typeof e.s === 'number') o.scale.setScalar(e.s);
    if (e.hidden) o.visible = false;
    o.userData.edited = true;
    world.appliedEdits.push(key);
    n++;
  }
  if (moved) console.log('floor ' + world.n + ': ' + moved
    + ' edit(s) re-matched after the generator moved things');
  return n;
}

/**
 * Edits that could not be placed, and are therefore sitting in
 * edits.json doing nothing. NOT an error and NOT discarded - the floor
 * they belong to may simply not have been visited yet. Read with
 * `node tools/edits.mjs`, which is the check to run after changing
 * anything in level.js or plan.js.
 */
export function strandedEdits() { return skipped.slice(); }

/**
 * Send a storey's corrections to the server, which merges them into
 * edits.json. Returns what the server says it now holds.
 */
export async function saveEdits(floor, items) {
  const body = {};
  body[String(floor)] = items;
  // KEEP THE IN-MEMORY COPY IN STEP, so a floor rebuilt later in this
  // same session gets what you just saved rather than what was on disk
  // when the page loaded.
  DATA[String(floor)] = Object.assign(DATA[String(floor)] || {}, items);
  for (const k of Object.keys(DATA[String(floor)]))
    if (DATA[String(floor)][k] === null) delete DATA[String(floor)][k];
  const r = await fetch(asset('edits'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('save failed: ' + r.status + ' ' + await r.text());
  return r.json();
}
