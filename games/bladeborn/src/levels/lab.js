// CHAPTER I. COLD STORAGE. Site 9, Block C, one continuous level: wake up strapped to a table in steel restraints,
// DOUBLE-CLICK to rip out of them (claws pop, the metal tears), carve through the lab (the combat tutorial), out
// through the control room into the courtyard and learn to move (the traversal tutorial), then over Block A's
// wall onto the roofs (on to ROOFTOP ESCAPE).
// Layout (north = -z): restraint room (z 18..28) -> observation booth -> corridor -> containment wing (z -3..-23)
// -> checkpoint corridor -> security hall (z -37..-63) -> control room -> the courtyard (z -63.5..-112):
//   generator house (5 m) -> tower B (16 m, rapid climb) -> four exhaust stacks (leap, corner swing, leap)
//   -> slide down the last stack onto the bay wall (12.5 m) -> ground slam into the loading bay -> climb Block A.
// Each section spawns its own people when it starts, so a checkpoint retry only rebuilds what is still ahead.
import { removeBox } from '../world.js';
import { sfx } from '../audio.js';
import { wallX, wallZ, room, pipe, monitor, tank, tips, key, watcher, clawsOut, bigPrompt, twisted } from './lab_kit.js';
import { instancer, forestRing } from './escape_kit.js';

const SECTIONS = ['start', 'corridor', 'wing', 'gate', 'hall', 'yard', 'stacks', 'bay'];
const PI = Math.PI;
// courtyard pieces: [x, z, w, d, y0, h]
const GEN = [-9, -72, 8, 6, 0, 5], TOWER = [-9, -79, 8, 8, 0, 16];
const STACKS = [[-1, -79, 0, 24], [6, -79, 0, 25], [6, -86.5, 0, 26], [6, -94.25, 12.5, 14.5]]; // [x, z, y0, h], 2.4 m square
const WALL_Y = 12.5; // the bay wall's walkway (z -92..-97)

export default {
  id: 'lab',
  title: 'COLD STORAGE',
  flags: { gunsKill: false },
  env: { bg: 0x343436, fog: [22, 95], hemi: 0.5, sun: 0.55, exposure: 0.95 },
  bounds: [-19, -111, 19, 30],

  build(L) {
    if (!this.inCompound) { const I = instancer(L); forestRing(L, I, [-70, -170, 70, 70], 80, 17); I.flush(); } // the woods round the compound: backdrop only
    const T = L.THREE;
    this.binds = []; this.alarmed = false; this.stackBoxes = []; this.bayUp = false; this.holding = false; this.fitting = false; this.struggle = 0; this.keep = false;
    L.floor(0, -15.75, 34, 95.5, { mat: 'tile' });

    // ---- restraint room: the table with its steel restraints, the observation glass on its north wall ----
    room(L, -6, 18, 6, 28, { h: 4.2, mat: 'tile', n: [{ c: 0, w: 6, y0: 0.3, y1: 2.7 }] });
    this.obs = L.window(0, 18, { axis: 'x', w: 6, h: 2.4, y: 0.3 });
    L.box(0, 0, 23.1, 1.0, 0.85, 2.3, { mat: 'steel' });                        // the table
    for (const [k, bone, w] of [['wrist', 'handL', 0.2], ['wrist', 'handR', 0.2], ['chest', 'torso', 1.0], ['ankle', 'footL', 0.2], ['ankle', 'footR', 0.2]]) this.binds.push(this.binding(L, k, bone, w));
    L.mesh(new T.CylinderGeometry(0.45, 0.6, 0.22, 10), 'steel', 0, 3.4, 23.1);   // surgical lamp
    L.box(2.5, 0, 24.6, 0.7, 1.05, 0.55, { mat: 'metal' }); monitor(L, 2.5, 1.05, 24.6, -PI / 2);
    L.box(-5.4, 0, 25.5, 0.9, 2.2, 3.2, { mat: 'paint' }); L.box(5.4, 0, 21, 0.9, 1.2, 2.2, { mat: 'paintDark' });
    L.light(0, 4.05, 23.1, { intensity: 6, dist: 10 });

    // ---- observation booth: two consoles, the alarm on the east wall, an auto door north ----
    wallZ(L, -6, 13, 18, { h: 3.5 }); wallZ(L, 6, 13, 18, { h: 3.5 });
    wallX(L, 13, -6, 6, { h: 3.5 }, [{ c: 0, w: 2, y1: 2.8 }]);
    L.box(0, 3.5, 15.5, 12.3, 0.3, 5.3, { mat: 'concreteDark' });
    L.door(0, 13, { axis: 'x', w: 2, h: 2.8, auto: true });
    for (const x of [-4.3, 4.3]) { L.box(x, 0, 16.9, 2.8, 0.9, 0.8, { mat: 'paintDark', cover: true }); monitor(L, x - 0.6, 0.9, 16.9); monitor(L, x + 0.6, 0.9, 16.9); }
    L.mesh(new T.BoxGeometry(0.12, 0.4, 0.3), 'black', 5.8, 1.4, 14.3);          // the alarm
    L.light(0, 3.4, 15.5, { intensity: 4, dist: 8 });

    // ---- corridor south -> north ----
    wallZ(L, -2.5, -3, 13, { h: 4 }); wallZ(L, 2.5, -3, 13, { h: 4 });
    L.box(0, 4, 5, 5.3, 0.3, 16.3, { mat: 'concreteDark' });
    pipe(L, -2.15, 3.7, 13, -2.15, -3); pipe(L, -1.9, 3.75, 13, -1.9, -3, 0.06);
    L.box(2.15, 0, 7, 0.5, 2.0, 2.4, { mat: 'metal' });                            // lockers
    L.box(-1.85, 0, 3, 0.7, 0.9, 2.0, { mat: 'steel' });                           // a gurney
    L.light(0, 3.9, 5, { intensity: 6, dist: 13 });

    // ---- containment wing: specimen tanks, benches; locked doors south and north ----
    room(L, -12, -23, 12, -3, { h: 6, mat: 'tile', s: [{ c: 0, w: 2.2, y1: 2.8 }], n: [{ c: 0, w: 2.2, y1: 2.8 }] });
    this.wingDoor = L.door(0, -3, { axis: 'x', w: 2.2, h: 2.8, locked: true });
    this.gateDoor = L.door(0, -23, { axis: 'x', w: 2.2, h: 2.8, locked: true });
    for (const z of [-7, -12, -17]) tank(L, -9.3, z);
    tank(L, 9.5, -20.5, { body: false });
    for (const z of [-9, -15]) { L.box(5.5, 0, z, 4.5, 0.95, 1.3, { mat: 'steel', cover: true }); monitor(L, 4.6, 0.95, z); }
    L.box(-3.5, 0, -12, 1.3, 0.95, 4, { mat: 'steel', cover: true });
    L.mesh(new T.BoxGeometry(0.12, 0.4, 0.3), 'black', -11.8, 1.4, -20);         // wing alarm
    pipe(L, -11.6, 5.4, -3, -11.6, -23, 0.14); pipe(L, 11.6, 5.4, -3, 11.6, -23, 0.14);
    L.light(-5, 5.85, -9, { intensity: 10, dist: 17 }); L.light(5, 5.85, -17.5, { intensity: 10, dist: 17 });

    // ---- checkpoint corridor ----
    wallZ(L, -2, -37, -23, { h: 4 }); wallZ(L, 2, -37, -23, { h: 4 });
    L.box(0, 4, -30, 4.3, 0.3, 14.3, { mat: 'concreteDark' });
    pipe(L, 1.65, 3.7, -23, 1.65, -37);
    L.light(0, 3.9, -30, { intensity: 6, dist: 12 });

    // ---- security hall: crates, a gun platform, pillars; the control room against the north wall ----
    room(L, -14, -63, 14, -37, { h: 7, mat: 'concrete', s: [{ c: 0, w: 2.2, y1: 2.8 }], n: [{ c: 0, w: 2.2, y1: 2.8 }] });
    this.hallDoor = L.door(0, -37, { axis: 'x', w: 2.2, h: 2.8, locked: true });
    for (const [x, z] of [[-5, -42], [5, -44], [-8, -51], [8.5, -50.5], [-2, -48], [3, -53]]) L.box(x, 0, z, 1.6, 1.4, 1.6, { mat: 'metal', cover: true, tile: 1.2 });
    L.box(-10, 0, -45.5, 5, 2.4, 3, { mat: 'concreteDark' }); L.box(-10, 0, -43.5, 1.4, 1.2, 1.0, { mat: 'concreteDark' }); // gun platform + step
    for (const x of [-6, 6]) L.box(x, 0, -47, 0.8, 7, 0.8, { mat: 'concrete' });
    // control room (x -5..5, z -63..-56): sealed door, the window you go through, the yard door in its back wall
    wallX(L, -56, -5, 5, { h: 3.2 }, [{ c: -0.5, w: 5, y0: 0.3, y1: 2.6 }, { c: 3.6, w: 1.6, y1: 2.6 }]);
    this.crWin = L.window(-0.5, -56, { axis: 'x', w: 5, h: 2.3, y: 0.3 });
    L.door(3.6, -56, { axis: 'x', w: 1.6, h: 2.6, locked: true });
    wallZ(L, -5, -63, -56, { h: 3.2 }); wallZ(L, 5, -63, -56, { h: 3.2 });
    L.box(0, 3.2, -59.5, 10.3, 0.3, 7.3, { mat: 'concreteDark' });
    L.box(-3.2, 0, -61.9, 2.6, 0.9, 0.9, { mat: 'paintDark' }); L.box(3, 0, -61.9, 2.4, 0.9, 0.9, { mat: 'paintDark' });
    for (const x of [-3.8, -2.6, 2.4, 3.6]) monitor(L, x, 0.9, -61.9);
    L.mesh(new T.BoxGeometry(0.3, 0.4, 0.12), 'black', 4.8, 1.4, -59);
    this.panel = L.mesh(new T.BoxGeometry(0.34, 0.5, 0.1), 'metal', 1.65, 1.35, -62.8); // the yard door's lock panel
    L.light(-6, 6.85, -44, { intensity: 10, dist: 18 }); L.light(7, 6.85, -52, { intensity: 10, dist: 18 }); L.light(0, 3.1, -59.5, { intensity: 4, dist: 8 });
    this.yardDoor = L.door(0, -63.15, { axis: 'x', w: 2.2, h: 2.8, locked: true });

    this.buildYard(L);

    // ---- checkpoints (respawn points; walking through the volume saves there) ----
    L.checkpoint('start', 1.15, 0, 22.8, PI);
    L.checkpoint('corridor', 0, 0, 11.5, PI, { at: [0, 11.5], r: 1.8 });
    L.checkpoint('wing', 0, 0, -1.2, PI, { at: [0, -4.6], r: 1.6 });
    L.checkpoint('gate', 0, 0, -24.6, PI, { at: [0, -24.6], r: 1.5 });
    L.checkpoint('hall', 0, 0, -35.6, PI, { at: [0, -35.6], r: 1.4 });
    L.checkpoint('yard', 0, 0, -65.5, PI, { at: [0, -65.5], r: 1.8 });
    L.checkpoint('stacks', -7, TOWER[5], -79, PI / 2, { box: [-9, TOWER[5] - 0.1, -79, 8, 3, 8] });
    L.checkpoint('bay', -3, WALL_Y, -94.5, PI, { box: [0, WALL_Y - 0.1, -94.5, 30, 3, 5] });
  },

  // ---- the courtyard: night, floodlights, smooth anti-climb walls; only the tutorial's pieces take claws ----
  buildYard(L) {
    const T = L.THREE, smooth = { noClimb: true };
    L.floor(0, -88, 42, 49, { mat: 'concreteDark' });
    // Block C's back wall (smooth steel cladding) with the yard door, the side walls, Block A at the north end
    L.box(-10.65, 0, -63.3, 19.3, 18, 0.3, { mat: 'concrete', flags: smooth }); L.box(10.65, 0, -63.3, 19.3, 18, 0.3, { mat: 'concrete', flags: smooth });
    L.box(0, 2.8, -63.3, 2.2, 15.2, 0.3, { mat: 'concrete', flags: smooth });
    for (const s of [-1, 1]) {
      L.box(s * 20.15, 0, -88, 0.3, 18, 49.6, { mat: 'concrete', flags: smooth });
      L.box(s * 20.15, 18, -88, 0.3, 30, 49.6, { visible: false, flags: smooth });
      for (let z = -66; z > -112; z -= 4) L.mesh(new T.BoxGeometry(0.08, 0.5, 0.08), 'steel', s * 19.95, 18.2, z); // wire posts
      pipe(L, s * 19.9, 18.45, -63.5, s * 19.9, -112, 0.03);
    }
    L.box(0, 18, -63.3, 40, 30, 0.3, { visible: false, flags: smooth });
    L.box(0, 0, -122, 40.6, 14, 20, { mat: 'concrete', flags: smooth });            // Block A (z -132..-112)
    this.aStrip = L.box(0, 0, -111.875, 6, 14, 0.25, { mat: 'concreteLight' });      // its rough service face: the way up
    for (let y = 2; y < 14; y += 2.4) L.mesh(new T.BoxGeometry(6.05, 0.1, 0.05), 'concreteDark', 0, y, -111.74);
    L.box(-8, 14, -120, 4, 3, 3, { mat: 'concreteDark' }); L.box(9, 14, -118, 2.6, 1.4, 1.8, { mat: 'metal' }); L.box(12, 14, -124, 2.6, 1.4, 1.8, { mat: 'metal' });
    L.box(0, 14, -132.2, 40.6, 1, 0.4, { mat: 'concreteDark' });                     // roof parapet (the far edge)
    for (const s of [-1, 1]) L.box(s * 20.15, 14, -122, 0.3, 1, 20, { mat: 'concreteDark' });
    // beyond Block A: the rest of Site 9's roofs (the way chapter II goes), seen from the roof at the chapter's end
    if (!this.inCompound) { const far = [[-26, -146, 16, 12, 17], [-6, -146, 14, 12, 14], [12, -150, 18, 14, 11], [-14, -168, 20, 14, 24], [10, -172, 16, 14, 20], [30, -160, 14, 20, 15], [-34, -178, 18, 16, 30], [0, -192, 30, 14, 36]];
    const lit = [];
    for (const [x, z, w, d, hh] of far) {
      L.mesh(new T.BoxGeometry(w, hh, d), 'concreteDark', x, hh / 2, z);
      for (let y = 3; y < hh - 1; y += 3) for (let k = -w / 2 + 1.5; k < w / 2 - 1; k += 2.4) if (((x * 7 + y * 13 + k * 5) | 0) % 5 === 0) lit.push([x + k, y, z + d / 2 + 0.03]);
    }
    const win = new T.InstancedMesh(new T.BoxGeometry(0.9, 1.1, 0.05), L.mat('lamp'), lit.length), M = new T.Matrix4();
    lit.forEach((p, i) => win.setMatrixAt(i, M.makeTranslation(p[0], p[1], p[2]))); win.castShadow = false; L.deco(win); }
    // generator house (5 m) and tower B (16 m) on top of each other's edge: the first climbs
    L.box(GEN[0], GEN[4], GEN[1], GEN[2], GEN[5], GEN[3], { mat: 'concreteDark' });
    L.box(TOWER[0], TOWER[4], TOWER[1], TOWER[2], TOWER[5], TOWER[3], { mat: 'concrete' });
    for (const x of [-11.5, -9, -6.5]) L.mesh(new T.BoxGeometry(1.4, 0.9, 0.06), 'black', x, 2.4, -68.97); // generator louvres
    L.box(-11, 5, -71, 2.4, 1.2, 1.6, { mat: 'metal' });                           // a unit on the generator roof
    for (let y = 4; y < 16; y += 3) L.mesh(new T.BoxGeometry(8.05, 0.12, 0.05), 'concreteDark', -9, y, -74.97);
    // the exhaust stacks over the yard
    for (const [x, z, y0, h] of STACKS) {
      this.stackBoxes.push(L.box(x, y0, z, 2.4, h, 2.4, { mat: 'concreteLight' }));
      for (let y = y0 + 3; y < y0 + h; y += 4) L.mesh(new T.BoxGeometry(2.5, 0.16, 2.5), 'steel', x, y, z);
      L.mesh(new T.BoxGeometry(2.0, 0.6, 2.0), 'black', x, y0 + h + 0.3, z);
    }
    // the bay wall: a 5 m thick, 12.5 m wall walked along the top. Smooth both sides
    L.box(0, 0, -94.5, 40.3, WALL_Y, 5, { mat: 'concreteDark', flags: smooth });
    for (const z of [-91.8, -97.2]) pipe(L, -20, 3.2, z, 20, z, 0.12);
    // the yard: a truck, crates, floodlight poles
    L.box(9, 0, -70, 2.4, 2.6, 5.6, { mat: 'paint', cover: true }); L.box(9, 0, -66.4, 2.4, 2, 1.6, { mat: 'paintDark' });
    for (const [x, z] of [[14, -76], [15.5, -78], [-16, -88], [12, -90]]) L.box(x, 0, z, 1.5, 1.4, 1.5, { mat: 'metal', cover: true, tile: 1.2 });
    // the loading bay (z -97..-112): a truck, a dock, crates; the guards under the slam stand here
    L.box(4, 0, -106, 2.4, 2.6, 6, { mat: 'paint', cover: true }); L.box(4, 0, -102.2, 2.4, 2, 1.6, { mat: 'paintDark' });
    L.box(-12, 0, -109.5, 12, 1.2, 5, { mat: 'concreteDark' });
    for (const [x, z] of [[-14, -103], [-12.4, -102.6], [13, -108], [14.4, -106]]) L.box(x, 0, z, 1.4, 1.3, 1.4, { mat: 'metal', cover: true, tile: 1.2 });
    for (const [x, z] of [[-18.5, -70], [18.5, -84], [-18.5, -104], [18.5, -108]]) { // floodlight poles
      L.mesh(new T.BoxGeometry(0.25, 11, 0.25), 'steel', x, 5.5, z);
      const lamp = L.mesh(new T.BoxGeometry(1.0, 0.5, 0.5), 'lamp', x - Math.sign(x) * 0.6, 11, z); lamp.castShadow = false;
    }
    L.light(-16, 10.5, -70, { intensity: 22, dist: 30 }); L.light(16, 10.5, -84, { intensity: 22, dist: 30 });
    L.light(0, 11, -104, { intensity: 20, dist: 26 }); L.light(0, 3.4, -64.4, { intensity: 5, dist: 8 });
    L.light(6, 22, -88, { intensity: 10, dist: 24 });
  },

  async start(L, ctx) {
    const S = this, G = L.G;
    S.tip = tips(L); S.w = watcher(L); S.big = bigPrompt(L);
    L.on('alarm', () => { if (S.alarmed) return; S.alarmed = true; L.say('PA', 'Breach in Block C. All security to containment.', 3); });
    L.every(() => { // smooth steel (noClimb): the claws skid off it in sparks and he drops
      const h = G.hero, w = h.climbing && h.wall; if (!w || !w.box?.noClimb) return;
      const n = w.normal, p = h.pos.clone().addScaledVector(n, -0.3).setY(h.pos.y + 1.7);
      G.fx.sparksAt?.(p, n, 10, 0.8); G.fx.scratch?.(p, n, 0.35, new L.THREE.Vector3(0, -1, 0)); sfx.scrape();
      h.leaveWall(); h.vel.set(n.x * 1.6, -1, n.z * 1.6); h.regrab = 0.5;
      if (!S.slipT || L.time - S.slipT > 8) { S.slipT = L.time; L.say('', 'Smooth steel: the claws skid off. Bare concrete takes them.', 2.6); }
    });
    L.every(() => { // the restraints sit on the body (they follow his wrists, ankles and chest)
      if (!S.fitting) return; for (const b of S.binds) S.fit(L, b);
    });
    const i = Math.max(0, SECTIONS.indexOf(ctx.checkpoint));
    // state behind the checkpoint: glass gone, restraints torn, doors open
    if (i > 0) { S.obs.broken = true; removeBox(S.obs.b); S.tearAll(L, true); clawsOut(G); }
    const doors = [null, null, S.wingDoor, S.gateDoor, S.hallDoor];
    for (let k = 1; k < Math.min(i, 4); k++) doors[k + 1] && (doors[k + 1].unlock(), doors[k + 1].open());
    if (i >= 5) { S.crWin.broken = true; removeBox(S.crWin.b); S.yardDoor.unlock(); S.yardDoor.open(); }
    if (i === 0) await S.intro(L);
    for (let k = i; k < SECTIONS.length; k++) await S['s_' + SECTIONS[k]](L);
  },

  unload() { this.tip?.remove(); this.big?.remove(); this.unlisten?.(); },

  // ---------- the restraints: a steel bracket bolted to the table, a band over the limb ----------
  binding(L, kind, bone, w) {
    const T = L.THREE, g = new T.Group(), steel = L.mat('steel');
    const base = new T.Mesh(new T.BoxGeometry(w + 0.12, 0.04, 0.16), L.mat('metal')); base.position.y = 0.87; g.add(base);
    const band = new T.Group(); g.add(band);
    L.deco(g);
    return { kind, bone, w, g, band, base, steel, built: false, torn: false, p: new T.Vector3() };
  },
  fit(L, b) { // put a band over its bone (built on the first fit, to the limb's real height)
    const G = L.G, T = L.THREE, j = G.hero.rig.j[b.bone]; if (!j || b.torn) return;
    G.hero.rig.root.updateMatrixWorld(true);
    const p = b.bone === 'torso' ? j.localToWorld(new T.Vector3(0, 0.32, 0)) : b.bone.startsWith('foot') ? j.localToWorld(new T.Vector3(0, 0.08, 0)) : j.getWorldPosition(new T.Vector3());
    if (b.bone === 'torso') p.x = 0;
    if (!b.built) {
      b.built = true; const top = Math.max(1.0, p.y + 0.09) - 0.85, t = 0.035, d = b.kind === 'chest' ? 0.12 : 0.09;
      const bar = new T.Mesh(new T.BoxGeometry(b.w, t, d), b.steel); bar.position.y = 0.85 + top; b.band.add(bar);
      for (const s of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(t, top, d), b.steel); post.position.set(s * (b.w / 2 - t / 2), 0.85 + top / 2, 0); b.band.add(post); }
      for (const s of [-1, 1]) { const bolt = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.05), L.mat('black')); bolt.position.set(s * (b.w / 2 + 0.03), 0.9, 0); b.band.add(bolt); }
      b.top = 0.85 + top;
    }
    const k = this.struggle > 0 ? (Math.random() - 0.5) * 0.02 * Math.min(1, this.struggle * 4) : 0;
    b.g.position.set(p.x + k, 0, p.z); b.band.position.y = k * 0.5; b.p.set(p.x, b.top || 1, p.z);
  },
  // tear one restraint: the band rips in two twisted halves that fly off, sparks, a torn stub stays on the bracket
  tear(L, b, quiet) {
    if (b.torn) return; b.torn = true; const G = L.G, T = L.THREE;
    b.band.visible = false;
    const stub = (s) => { const m = new T.Mesh(twisted(T, 0.09, 0.035, 0.09, 1.6 * s, 0.05), b.steel); m.position.set(s * (b.w / 2 - 0.03), (b.top || 1) - 0.06, 0); m.rotation.z = s * 0.9; b.g.add(m); };
    stub(-1); stub(1);
    if (quiet) return;
    const p = b.p.clone();
    for (const s of [-1, 1]) {
      const half = L.mesh(twisted(T, b.w * 0.5 + 0.05, 0.035, b.kind === 'chest' ? 0.12 : 0.09, 2.4 * s, 0.12 * s), 'steel', p.x + s * b.w * 0.22, p.y, p.z);
      L.fling(half, new T.Vector3(s * (1.5 + Math.random() * 2.5), 3 + Math.random() * 3, (Math.random() - 0.5) * 3), 12);
    }
    G.fx.sparksAt?.(p, new T.Vector3(0, 1, 0), 22, 1.4);
    G.fx.gouge?.(p.clone().setY(0.86), new T.Vector3(0, 1, 0), 0.35, new T.Vector3(1, 0, 0), 1);
    sfx.clang(); sfx.metal(); G.shake(0.32);
  },
  tearAll(L, quiet) { for (const b of this.binds) { if (!b.built) this.fit(L, b); this.tear(L, b, quiet); } this.fitting = false; },

  // ---------- the wake-up: memory, the restraints, DOUBLE-CLICK to rip out ----------
  async intro(L) {
    const G = L.G, S = this, V = (x, y, z) => new L.THREE.Vector3(x, y, z);
    L.enemy('scientist', -3.6, 15.4, { yaw: 0, tag: 'booth' });
    L.enemy('scientist', 3.6, 15.4, { yaw: 0, alarm: [5.4, 14.3], tag: 'booth' });
    const me = L.actor({ hero: true, pose: 'lie' }); me.place(0, 0.98, 23.15, 0);
    S.me = me; S.fitting = true;
    await L.cutscene({
      shots: [
        { from: [0.35, 2.9, 21.6], to: [0.25, 2.15, 21.95], look: [0, 1.0, 22.45], lookTo: [0, 1.0, 22.35], fov: 46, fovTo: 34, dur: 7.5 },
        { from: [-3.4, 1.65, 14.4], to: [-2.6, 1.65, 14.9], look: [0, 1.1, 23], fov: 40, dur: 6.5 },
        { from: [1.5, 1.4, 24.3], to: [1.25, 1.3, 23.9], look: [0.2, 1.0, 23.2], fov: 38, fovTo: 34, dur: 4.5 },
      ],
      lines: [
        [0.4, 'PA', 'Subject C-9. Sedation holding at forty percent.', 3],
        [3.7, 'SCIENTIST', 'Heart rate is climbing. He should be under.', 3],
      ],
    });
    // the hold: he is awake, strapped down. Clicks strain the restraints; a double-click rips out of them
    const ripped = new Promise(r => { S.rip = r; });
    let last = -9, n = 0;
    const onDown = e => {
      if (!S.holding || (e.button !== 0 && e.button !== 2)) return;
      const t = (globalThis.performance?.now?.() || Date.now()) / 1000;
      if (t - last < 0.4) { S.rip(); return; }
      last = t; n++; S.struggle = 0.35; sfx.metal(); G.shake(0.12);
      if (n === 1) L.wait(0.45).then(() => { if (S.holding) L.say('SCIENTIST', 'Restraints are holding. Steel, rated to-', 2.2); });
    };
    try { globalThis.addEventListener?.('mousedown', onDown); S.unlisten = () => globalThis.removeEventListener?.('mousedown', onDown); } catch (_) {}
    L.every(dt => { if (S.struggle > 0) S.struggle -= dt; });
    S.holding = true;
    S.big.show(`DOUBLE-CLICK`, 'rip out of the restraints');
    L.cutscene({ shots: [{ from: [1.25, 2.35, 24.4], to: [1.15, 2.25, 24.25], look: [0, 0.95, 23.05], fov: 46, dur: 9999 }], skippable: false, letterbox: false });
    await ripped;
    S.holding = false; S.unlisten?.(); S.big.hide();
    G.cut?.stop(false);
    // the rip: claws out, the steel tears, he swings off the table
    const arms = (up) => ({ lie: true, crouch: 0, legs: { tl: 0, tr: 0, kl: 0.05, kr: 0.05 }, armL: { dir: V(0.3, up ? 0.2 : -0.4, 1), bend: 0.7, k: 30 }, armR: { dir: V(-0.3, up ? 0.2 : -0.4, 1), bend: 0.7, k: 30 } });
    const wrists = S.binds.filter(b => b.kind === 'wrist'), chest = S.binds.find(b => b.kind === 'chest'), ankles = S.binds.filter(b => b.kind === 'ankle');
    await L.cutscene({
      shots: [
        { from: [1.9, 1.6, 24.9], to: [1.75, 1.55, 24.7], look: [0.25, 1.0, 23.0], fov: 40, fovTo: 34, dur: 1.4, shake: 2 },
        { from: [2.4, 2.7, 26.0], to: [2.1, 2.5, 25.6], look: [0, 1.0, 23.0], fov: 46, dur: 1.6 },
        { from: [-2.4, 1.6, 20.6], to: [-2.1, 1.6, 20.9], look: [1.15, 1.35, 22.8], fov: 40, fovTo: 34, dur: 5.4 },
      ],
      lines: [
        [2.9, 'SCIENTIST', 'He tore through the restraints!', 1.9],
        [4.9, 'SCIENTIST', 'That glass is rated for a truck. He is going nowhere.', 2.6],
        [7.6, 'CALDER', 'Watch me.', 1.2],
      ],
      beats: [
        [0.05, () => { me.pose(arms(false)); clawsOut(G); sfx.snik?.(true); G.shake(0.25); }],
        [0.35, () => { for (const b of wrists) S.tear(L, b); me.pose(arms(true)); }],
        [1.0, () => { me.pose({ ...arms(true), crouch: 0.3 }); S.tear(L, chest); }],
        [1.6, () => { for (const b of ankles) S.tear(L, b); }],
        [2.6, () => { S.fitting = false; me.place(1.15, 0, 22.8, PI); me.pose('guard'); G.shake(0.2); sfx.land?.(0.6); }],
      ],
      end: () => {
        L.dropActor(me); S.tearAll(L, false); clawsOut(G);
        const h = G.hero; h.pos.set(1.15, 0, 22.8); h.vel.set(0, 0, 0); h.yaw = PI; G.input.yaw = PI;
      },
    });
  },

  // ---------- restraint room + booth ----------
  async s_start(L) {
    const S = this;
    L.objective('glass', 'Break out of the restraint room');
    S.tip.show('glass', 'BREAK THE GLASS', [`${key('SHIFT')} sprint into it, or leap and slash it with ${key('LMB')} / ${key('RMB')}.`]);
    await L.until(() => S.obs.broken);
    L.done('glass');
    L.objective('booth', 'Kill the scientists before they reach the alarm');
    S.tip.show('claws', 'YOUR CLAWS', [`${key('LMB')} left claw  ·  ${key('RMB')} right claw.`, 'Each strike hits the one man nearest the dot.', `${key('LMB')} + ${key('RMB')} together: claws out. Hold both to sheathe.`]);
    await L.until(() => L.alive('booth') === 0 || L.hero.pos.z < 9);
    L.done('booth'); S.tip.hide('claws');
  },

  // ---------- corridor: aimed strikes, then combos ----------
  async s_corridor(L) {
    const S = this;
    L.objective('out', 'Find a way out of Block C');
    const g1 = L.enemy('guard_baton', 0, 0.5, { yaw: 0, tag: 'c1' });
    await L.until(() => L.hero.pos.z < 12.4 || g1.mode === 'alert');
    S.tip.show('aim', 'AIM YOUR STRIKES', ['Every strike lands where the dot is.', 'HEAD or NECK: a kill. ARMS: his guard drops. LEGS: he limps, then kneels. GUT: he bleeds.']);
    await L.until(() => L.alive('c1') === 0);
    S.tip.hide('aim');
    S.wingDoor.unlock(); S.wingDoor.open();
    L.enemy('guard_baton', 0, -6, { mode: 'alert', tag: 'c2', hp: 80 });
    L.say('GUARD', 'Contact, Block C corridor!', 2);
    S.w.uppercut = false;
    S.tip.show('combo', 'COMBOS', [`Alternate ${key('LMB')} ${key('RMB')} ${key('LMB')} ${key('RMB')} without a pause.`, 'The fourth strike is an UPPERCUT.']);
    await L.until(() => S.w.uppercut || L.alive('c2') === 0);
    await L.until(() => L.alive('c2') === 0);
    S.tip.hide('combo');
  },

  // ---------- containment wing: block, parry, limbs ----------
  async s_wing(L) {
    const S = this;
    S.wingDoor.unlock(); S.wingDoor.open();
    L.enemy('scientist', 5.2, -10.3, { yaw: 0, tag: 'wsci' });
    L.enemy('scientist', -5.5, -19, { yaw: 0, alarm: [-11.3, -20], tag: 'wsci' });
    L.enemy('guard_baton', -3, -16.5, { patrol: [[-3, -16.5], [3, -16.5, 2], [3, -20.5], [-3, -20.5, 2]], tag: 'wing', hp: 90 });
    L.enemy('guard_baton', 8.5, -21.5, { yaw: 0, tag: 'wing', hp: 90 });
    L.objective('wing', 'Clear the containment wing');
    await L.until(() => L.hero.pos.z < -3.6);
    if (L.alive('wing')) {
      S.tip.show('block', 'BLOCK AND PARRY', [`Hold ${key('MIDDLE MOUSE')} to block. Kicks and heavy chops break a held block.`, 'Block just as his swing lands = PARRY: he drops to his knees.', `Or double-click ${key('LMB')}: a quick block; the second click parries.`]);
      await L.until(() => S.w.parried || L.alive('wing') === 0);
    }
    S.w.resetParts();
    if (L.alive('wing')) {
      S.tip.show('limb', 'TAKE HIM APART', ['Aim at an ARM: the first cut drops his guard, the next takes it off.', 'Aim at a LEG: he limps, then goes down.']);
      await L.until(() => S.w.limb || L.alive('wing') === 0);
    }
    await L.until(() => L.alive('wing') === 0);
    S.tip.hide(); L.done('wing');
  },

  // ---------- checkpoint corridor: the finisher ----------
  async s_gate(L) {
    const S = this, G = L.G;
    S.gateDoor.unlock(); S.gateDoor.open();
    L.enemy('guard_baton', 0, -32, { yaw: 0, tag: 'gate', hp: 150 });
    L.objective('gate', 'Get through the checkpoint');
    await L.until(() => L.hero.pos.z < -23.6);
    S.keep = true; G.finGain(1);
    L.every(() => { if (S.keep && !S.w.finisher) G.finMeter = 1.02; });
    S.tip.show('fin', 'FINISHER', ['The red bar (bottom left) fills as you land hits, parry and dodge.', `When it pulses: double-click ${key('LMB')} on him. Where you aim picks how he dies.`, 'It is full now. Use it.']);
    await L.until(() => S.w.finisher || L.alive('gate') === 0);
    S.keep = false; S.tip.hide('fin');
    await L.until(() => L.alive('gate') === 0);
    L.done('gate');
  },

  // ---------- security hall: rifles, the control room glass, the yard door ----------
  async s_hall(L) {
    const S = this, G = L.G;
    S.hallDoor.unlock(); S.hallDoor.open();
    L.enemy('guard_rifle', -10, -45.5, { y: 2.4, yaw: 0, hold: true, tag: 'hall' });
    L.enemy('guard_rifle', 6, -42, { patrol: [[6, -42], [6, -54, 2], [-2, -55], [-2, -42, 2]], tag: 'hall' });
    L.enemy('guard_baton', 0, -50, { yaw: 0, tag: 'hall' });
    L.enemy('scientist', 1.2, -60, { yaw: PI, alarm: [4.5, -59], tag: 'cr' });
    L.objective('hall', 'Cross the security hall');
    await L.until(() => L.hero.pos.z < -37.4);
    S.tip.show('guns', 'RIFLES', ['Rifles fire two-round bursts. Do not stand in the open: close in from cover.', `A held block (${key('MIDDLE MOUSE')}) deflects rounds. A parry sends them back.`]);
    await L.until(() => L.alive('hall') === 0);
    S.tip.hide('guns'); L.done('hall');
    L.say('PA', 'Control room, lock down. Seal the doors.', 2.6);
    L.objective('ctrl', 'Get into the control room');
    S.tip.show('glass2', 'THROUGH THE GLASS', [`The door is sealed. ${key('SHIFT')} sprint, leap or slash through the window.`]);
    await L.until(() => S.crWin.broken);
    L.done('ctrl'); S.tip.hide('glass2');
    L.objective('door', 'Open the yard door');
    await L.until(() => L.hero.pos.z < -60.4);
    // he drives a claw through the lock panel
    const T = L.THREE, p = new T.Vector3(1.65, 1.35, -62.75);
    G.fx.sparksAt?.(p, new T.Vector3(0, 0, 1), 26, 1.2); G.fx.gouge?.(p, new T.Vector3(0, 0, 1), 0.4, new T.Vector3(0, -1, 0), 1); sfx.clang(); G.shake(0.2);
    S.panel.rotation.z = 0.5; S.panel.position.y -= 0.12;
    S.yardDoor.unlock(); S.yardDoor.open(); L.done('door');
    L.say('CALDER', 'Air.', 1.2);
  },

  // ---------- the courtyard: climb, rapid climb ----------
  async s_yard(L) {
    const S = this, h = L.hero;
    if (!S.bayUp) S.spawnBay(L);
    L.objective('yard', 'Get over the courtyard: up the generator house');
    L.say('PA', 'He is in the north yard. Seal the gate. Nobody goes out there alone.', 3.2);
    await L.until(() => h.pos.z < -66.5);
    S.tip.show('climb', 'CLAW-CLIMB', ['The yard walls are smooth steel. Concrete takes claws.', `Jump at the wall and click ${key('LMB')} or ${key('RMB')} in the air to claw in.`, `Then click ${key('LMB')} ${key('RMB')} ${key('LMB')} to climb. Over the top, you pull yourself up.`]);
    await L.until(() => h.pos.y > GEN[5] - 0.3);
    L.done('yard'); S.tip.hide('climb');
    L.objective('tower', 'Climb tower B');
    S.w.lunge = false;
    S.tip.show('lunge', 'CLIMB FAST', ['Tower B is 16 m. Claw in from the generator roof.', `Alternate ${key('LMB')} ${key('RMB')} FAST: he rips both claws out and LUNGES up 2 m at a time.`]);
    await L.until(() => h.pos.y > TOWER[5] - 0.3 && !h.climbing);
    L.done('tower'); S.tip.hide('lunge');
  },

  // ---------- the stacks: leap, corner swing, leap; slide down onto the bay wall ----------
  async s_stacks(L) {
    const S = this, h = L.hero, G = L.G;
    if (!S.bayUp) S.spawnBay(L);
    const on = i => h.climbing && h.wall?.box === S.stackBoxes[i];
    const reached = i => S.stackBoxes.slice(i).some((_, k) => on(i + k)) || h.pos.z < -92;
    L.objective('stacks', 'Cross the exhaust stacks to the bay wall');
    S.tip.show('jump', 'LEAP AND GRAB', [`${key('SHIFT')} run off the edge at the stack, ${key('SPACE')} jump.`, `Click ${key('LMB')} / ${key('RMB')} in the air: the claws bite into it.`]);
    await L.until(() => reached(0));
    S.w.swing = false; S.w.leap = false;
    if (!reached(1)) {
      S.tip.show('swing', 'ROUND THE CORNER', [`${key('A')} / ${key('D')} on a wall: swing sideways. At an edge he swings round the corner.`, 'Get onto the face that looks at the next stack.']);
      await L.until(() => S.w.swing || reached(1) || !h.climbing && h.pos.y < 3);
      if (!reached(1)) {
        S.tip.show('leap', 'WALL LEAP', ['Look at the next stack.', `${key('SPACE')}: he kicks off and leaps where you look. Click in the air to grab it.`]);
        await L.until(() => reached(1));
      }
    }
    S.tip.show('chain', 'KEEP MOVING', [`${key('A')} / ${key('D')} round to the face that looks at the next one, then ${key('SPACE')} leap.`, 'Fall and you climb again. The stacks take claws all the way down.']);
    await L.until(() => reached(3));
    S.tip.show('slide', 'SLIDE DOWN', [`Hold ${key('S')}: he slides down on one dragging claw.`, `Let go to stop. ${key('SPACE')} leaps off.`]);
    await L.until(() => (h.pos.z < -92.1 && Math.abs(h.pos.y - WALL_Y) < 0.2 && !h.climbing) || h.pos.z < -97.2);
    S.tip.hide(); L.done('stacks');
  },

  // ---------- the loading bay: ground slam; then up Block A ----------
  spawnBay(L) {
    this.bayUp = true;
    L.enemy('guard_baton', -1.6, -103.4, { yaw: 0.4, tag: 'bay' });
    L.enemy('guard_baton', 1.4, -104.6, { yaw: -2.6, tag: 'bay' });
    L.enemy('guard_rifle', -9, -100, { patrol: [[-9, -100, 2], [-9, -108, 2]], tag: 'bay' });
  },
  async s_bay(L) {
    const S = this, h = L.hero, G = L.G;
    if (!S.bayUp) S.spawnBay(L);
    L.objective('bay', 'Clear the loading bay');
    await L.until(() => h.pos.z < -92 && !h.climbing);
    if (L.alive('bay')) S.tip.show('slam', 'GROUND SLAM', ['Three below, under the light.', `Jump off. Click the SAME claw TWICE in the air: ${key('LMB')} ${key('LMB')}. He drives down and slams.`, 'The higher you fall, the bigger it hits.']);
    let slam = false;
    L.every(() => { if (!slam && h.diving && h.pos.z < -97) { slam = true; L.say('PA', 'Bay three! He came down on the loading bay!', 2.4); } });
    await L.until(() => h.pos.z < -97.5 || L.alive('bay') === 0);
    await L.wait(1.2); S.tip.hide('slam');
    await L.until(() => L.alive('bay') === 0);
    L.done('bay');
    L.objective('out', 'Climb Block A to the roofs');
    S.tip.show('outtip', 'UP AND OUT', ['Block A is smooth steel, all but its rough concrete service face (lit, by the truck).', `Claw in and alternate ${key('LMB')} ${key('RMB')} fast.`]);
    await L.until(() => h.pos.y > 13.8 && h.pos.z < -112.1 && !h.climbing);
    S.tip.hide(); L.done('out');
    await L.cutscene({
      shots: [
        { from: [3.5, 15.6, -110.5], to: [2.6, 16.2, -111.4], look: [0, 14.9, -113.5], fov: 42, dur: 3.2 },
        { from: [-6, 17.5, -114], to: [-3, 18.4, -116], look: [2, 17, -160], fov: 48, dur: 4.6 },
      ],
      lines: [
        [0.3, 'PA', 'Subject C-9 is on the roof of Block A. All units to the roofs.', 3],
        [3.4, 'PA', 'Seal the roof hatches. There is nowhere for him to go.', 2.4],
        [5.9, 'CALDER', 'Then I will make somewhere.', 1.8],
      ],
    });
    if (this.next) return this.next(L); // inside SITE 9 (compound.js) the open compound follows
    L.end();
  },
};
