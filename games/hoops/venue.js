// =====================================================================
// HOOPS :: venue.js - THE PLACE THE GAME IS PLAYED IN
// =====================================================================
//
// Liam: *"make more detailed background and stuff and street ball"*.
//
// Everything that is not the ball, the ring or the ten people lives in
// here: the ground under their feet, the lines painted on it, and the
// whole world behind. Two of them, picked by name:
//
//   ARENA   the indoor game done properly - a boarded floor with grain
//           and a logo, a full raked bowl of crowd, LED sponsor boards, a
//           hanging scoreboard, lighting rigs, championship banners, a
//           tunnel, and the courtside row seen from behind.
//   STREET  an outdoor blacktop - cracked asphalt with the paint worn off
//           it, a chain-link fence with a gate, a battered plywood board
//           on a scaffold pole, and a city block behind: brownstones,
//           fire escapes, a painted mural, parked cars, a hydrant,
//           benches, a boombox, streetlights, and people hanging on the
//           fence watching.
//
// ---------------------------------------------------------------------
// WHAT THE CAMERA CAN SEE, WHICH IS THE WHOLE DESIGN
// ---------------------------------------------------------------------
//
// HOOPS is watched through an ORTHOGRAPHIC camera 20 units wide and 26.2
// tall, leaned 0.30 rad down. That one number decides everything in this
// file, because a tilted flat camera does something a perspective camera
// does not: DEPTH TURNS INTO HEIGHT ON SCREEN, at a fixed exchange rate.
//
//     screenY = (y - camY) * cos(tilt)  -  z * sin(tilt)
//
// Two consequences, and they are not small:
//
//   THE FURTHER BACK A THING IS, THE LOWER ITS CEILING. At the back of
//   the court a thing can be 15.8 units tall before it leaves the top of
//   the frame; thirty units back that has fallen to 7.8, and by z = -42
//   the top of the frame is BELOW the floor. So there is no such thing as
//   a distant backdrop here. Everything readable lives between z = 0 and
//   z = -34, and a "far skyline" is a waste of triangles.
//
//   ANYTHING IN FRONT OF THE COURT CLIMBS THE SCREEN AND HIDES IT. A
//   sponsor board two units tall standing five units in front of the
//   sideline covers HALF THE FLOOR. The working rule, derived not
//   guessed: in front of the court, nothing at all until z = +15, and
//   nothing over ~2.5 units tall after that. That is why the courtside
//   row is seen from behind and sits at z = 16 and beyond.
//
// The frame therefore reads, top to bottom: roof, background, a band of
// barrier, THE COURT, the apron, and a foreground band along the bottom.
// The court itself is only a tenth of the picture - which is why the
// other nine tenths being empty navy was worth fixing.
//
// ---------------------------------------------------------------------
// HOW IT STAYS CHEAP
// ---------------------------------------------------------------------
//
// This runs on phones, so the rule is one draw call per IDEA, not one per
// box. Three tricks do nearly all of it:
//
//   VERTEX COLOURS AND A MERGE. `Chunk` collects hundreds of boxes and
//   cylinders, bakes each one's colour into its vertices and its position
//   into its coordinates, and hands back ONE mesh with ONE material. A
//   whole city block, a whole raked stand, an entire fence, all one call.
//
//   THE GROUND IS A PAINTING. The floorboards, the grain, the key, the
//   arc, the logo, the cracks in the asphalt and the weeds growing
//   through them are drawn into a single canvas in world coordinates and
//   laid on one plane. Lines drawn this way are round where they should
//   be round, which the old strip-of-boxes arc never was.
//
//   THE CROWD IS INSTANCED. Two instanced meshes carry six hundred to
//   fifteen hundred people. The ones near enough to read are real
//   `person()` bodies from kit.js, because those are the ones you can
//   actually see put their arms up.
//
// ---------------------------------------------------------------------
//   import { VENUES, buildVenue } from './venue.js';
//   const v = buildVenue('street', C);   // C is half.js's court layout
//   scene.add(v.group);
//   v.step(dt, { ball, scored });        // every frame
//   v.cheer(2);                          // when one goes in
//   v.dispose();                         // when the court changes
// ---------------------------------------------------------------------
import { THREE, mat, paint, clamp, lerp } from '../_deck/deck3d.js';
import { person } from './kit.js';

export const VENUES = ['arena', 'street'];

// The floor, hardcoded on purpose: this file must not import half.js,
// because half.js is going to want to import this one.
const FLOOR = -5.4;
// how far the camera leans down, and what the frame is - only used to
// decide what is worth building, never to position the camera
const TILT = 0.30;
const screenY = (y, z) => (y - (FLOOR + 3.4)) * Math.cos(TILT) - z * Math.sin(TILT);

// ---------------------------------------------------------------------
// A REPEATABLE RANDOM.
//
// Every crack in the asphalt, every crowd shirt and every lit window
// comes out of here, so a venue looks the SAME every time it is built.
// That matters twice: the test sheet is comparable between runs, and a
// player who drops out and comes back is in the same place rather than in
// a place that looks like it but isn't.
// ---------------------------------------------------------------------
function rng(seed) {
  let a = (seed | 0) || 7;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================================
// THE MERGE
// =====================================================================
//
// Three.js ships a BufferGeometryUtils with a merger in it; the module in
// games/_deck is the core build and does not have one, so here is the
// forty lines that matter. Everything that comes in must be indexed and
// must have position, normal and uv - which BoxGeometry, CylinderGeometry
// and PlaneGeometry all are and all do.
// =====================================================================
function mergeGeos(list) {
  let vc = 0, ic = 0;
  for (const g of list) {
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3);
  const uv = new Float32Array(vc * 2), col = new Float32Array(vc * 3);
  const idx = vc > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal;
    const u = g.attributes.uv, c = g.attributes.color;
    const N = p.count;
    for (let i = 0; i < N; i++) {
      const j = vo + i;
      pos[j * 3] = p.getX(i); pos[j * 3 + 1] = p.getY(i); pos[j * 3 + 2] = p.getZ(i);
      if (n) { nor[j * 3] = n.getX(i); nor[j * 3 + 1] = n.getY(i); nor[j * 3 + 2] = n.getZ(i); }
      if (u) { uv[j * 2] = u.getX(i); uv[j * 2 + 1] = u.getY(i); }
      if (c) { col[j * 3] = c.getX(i); col[j * 3 + 1] = c.getY(i); col[j * 3 + 2] = c.getZ(i); }
      else { col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = 1; }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < N; i++) idx[io + i] = vo + i;
    io += g.index ? g.index.count : N;
    vo += N;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _eu = new THREE.Euler();

/**
 * A PILE OF SOLIDS THAT WILL BECOME ONE MESH.
 *
 * Add boxes, cylinders and quads wherever you like in whatever colours
 * you like; `mesh()` bakes the lot into a single geometry with the
 * colours living in the vertices. The colour is set through THREE.Color
 * so it lands in the same linear working space the materials use -
 * writing raw hex bytes into the attribute is the bug that makes a merged
 * model look washed out next to an unmerged one.
 */
class Chunk {
  constructor() { this.list = []; }
  add(geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, uvRect = null) {
    _eu.set(rx, ry, rz);
    _m4.makeRotationFromEuler(_eu);
    _m4.setPosition(x, y, z);
    geo.applyMatrix4(_m4);
    const n = geo.attributes.position.count;
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    } else if (uvRect) {
      const u = geo.attributes.uv;
      for (let i = 0; i < n; i++) {
        u.setXY(i, uvRect[0] + u.getX(i) * uvRect[2], uvRect[1] + u.getY(i) * uvRect[3]);
      }
    }
    _col.set(col);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = _col.r; c[i * 3 + 1] = _col.g; c[i * 3 + 2] = _col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.list.push(geo);
    return this;
  }
  box(w, h, d, col, x, y, z, rx, ry, rz) {
    return this.add(new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz);
  }
  cyl(rt, rb, h, seg, col, x, y, z, rx, ry, rz) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), col, x, y, z, rx, ry, rz);
  }
  quad(w, h, col, x, y, z, rx, ry, rz, uvRect) {
    return this.add(new THREE.PlaneGeometry(w, h), col, x, y, z, rx, ry, rz, uvRect);
  }
  /** a box leaning along x, for braces and fire escape stairs */
  strut(len, thick, col, x1, y1, x2, y2, z) {
    const dx = x2 - x1, dy = y2 - y1;
    const L = Math.hypot(dx, dy) || len;
    return this.box(L, thick, thick, col, (x1 + x2) / 2, (y1 + y2) / 2, z, 0, 0, Math.atan2(dy, dx));
  }
  empty() { return this.list.length === 0; }
  mesh(o = {}) {
    const g = mergeGeos(this.list);
    this.list = [];
    const m = o.basic
      ? new THREE.MeshBasicMaterial({ vertexColors: true, map: o.map || null,
          transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity,
          side: o.side || THREE.FrontSide, depthWrite: o.depthWrite !== false })
      : new THREE.MeshLambertMaterial({ vertexColors: true, map: o.map || null,
          transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity,
          alphaTest: o.alphaTest || 0, side: o.side || THREE.FrontSide,
          emissive: new THREE.Color(o.emissive || 0x000000) });
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = !!o.cast;
    mesh.receiveShadow = !!o.receive;
    if (o.renderOrder) mesh.renderOrder = o.renderOrder;
    return mesh;
  }
}

// =====================================================================
// THE GROUND, PAINTED
// =====================================================================

/**
 * The rectangle of world the ground texture covers.
 *
 * The street reaches much further FORWARD than the arena does, because
 * the bottom third of the frame is bare lot on a street court and is
 * courtside seating in an arena - and bare anything wants painting on.
 */
function groundRect(C, front = 13) {
  return { x0: C.x0 - 8, x1: C.x1 + 8, z0: C.z0 - 4.5, z1: C.z1 + front };
}
/** pixels per world unit, held to a texture a phone will not choke on */
const ppuFor = (W, D) => clamp(Math.min(1700 / W, 1500 / D), 18, 44);

/**
 * Draw the court's markings, in WORLD UNITS, into a canvas whose
 * transform has already been set so that one unit is `ppu` pixels.
 *
 * Both venues call this with a different pen: the arena gets crisp white
 * paint on wood, the street gets whatever is left of the white paint
 * after ten years of weather. Everything is read off `C`, so the half
 * court gets one baseline and one key and the full court gets two of
 * each plus a halfway line, without either being written down twice.
 */
function courtLines(g, C, pen) {
  const d = C.z1 - C.z0, hz = d / 2;
  const lw = pen.lw || 0.13;
  g.lineCap = 'butt';
  g.lineJoin = 'round';

  const stroke = (a) => { g.strokeStyle = pen.paint; g.lineWidth = lw * (a || 1); g.stroke(); };
  const line = (x1, z1, x2, z2, a) => {
    g.beginPath(); g.moveTo(x1, z1); g.lineTo(x2, z2); stroke(a);
  };

  // the sidelines, and the far end of the world
  line(C.x0, -hz, C.x1, -hz);
  line(C.x0, hz, C.x1, hz);

  for (const rim of C.rims) {
    const base = rim.board + rim.face * 0.6;     // the baseline, behind the ring
    const f = rim.face;
    // baseline
    line(base, -hz, base, hz);
    // the key: painted in, then outlined
    const keyW = 6.1, keyD = 4.8;
    const kx = Math.min(base, base - f * keyW), kw = keyW;
    if (pen.keyFill) {
      g.fillStyle = pen.keyFill;
      g.fillRect(kx, -keyD / 2, kw, keyD);
    }
    g.beginPath();
    g.rect(kx, -keyD / 2, kw, keyD);
    stroke();
    // the free-throw circle: solid on the key side, dashed on the other
    const fx = base - f * keyW;
    g.beginPath(); g.arc(fx, 0, 2.4, -Math.PI / 2, Math.PI / 2, f < 0); stroke();
    g.setLineDash([0.5, 0.42]);
    g.beginPath(); g.arc(fx, 0, 2.4, Math.PI / 2, Math.PI * 1.5, f < 0); stroke();
    g.setLineDash([]);
    // the restricted area under the ring
    g.beginPath(); g.arc(rim.x, rim.z, 1.55, Math.PI / 2, -Math.PI / 2, f > 0); stroke(0.8);
    // the three point line: an arc off the ring, with the two straight
    // runs to the baseline where it would otherwise fall off the side
    const arc = C.arc, corner = hz - 0.55;
    const th = Math.asin(clamp(corner / arc, -1, 1));
    g.beginPath();
    g.arc(rim.x, rim.z, arc, -th + (f > 0 ? Math.PI : 0), th + (f > 0 ? Math.PI : 0), f < 0);
    stroke();
    const cx = rim.x - f * Math.cos(th) * arc;
    line(cx, -corner, base, -corner);
    line(cx, corner, base, corner);
    // the backboard's shadow on the floor, so the ring has a root
    g.fillStyle = pen.scuff || 'rgba(0,0,0,0.10)';
    g.fillRect(rim.board - f * 0.05, -2.1, f * 0.5, 4.2);
  }

  // the halfway line, or on a half court the line you take it back behind
  if (C.rims.length > 1) {
    line(C.check, -hz, C.check, hz, 1);
    g.beginPath(); g.arc(C.check, 0, 2.3, 0, Math.PI * 2); stroke();
  } else {
    g.strokeStyle = pen.check || pen.paint;
    g.lineWidth = lw * 1.3;
    g.beginPath(); g.moveTo(C.check, -hz); g.lineTo(C.check, hz); g.stroke();
  }
}

/** a block of speckle, the cheapest way to stop a flat fill looking flat */
function speckle(g, R, n, x, y, w, h, cols, sz = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(R() * cols.length) | 0];
    const s = sz * (0.4 + R() * 1.2);
    g.fillRect(x + R() * w, y + R() * h, s, s);
  }
}

/** THE BOARDED FLOOR: planks along the length, grain, a key and a logo */
function arenaGround(C, seed) {
  const r = groundRect(C);
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  const ppu = ppuFor(W, D);
  const cw = Math.round(W * ppu), ch = Math.round(D * ppu);
  const R = rng(seed + 11);
  const tex = paint(cw, ch, (g) => {
    g.setTransform(ppu, 0, 0, ppu, -r.x0 * ppu, -r.z0 * ppu);
    // the dark arena floor the court is laid on
    g.fillStyle = '#14181f'; g.fillRect(r.x0, r.z0, W, D);
    // the boards - a plank is 0.42 units wide and runs the length
    const px0 = C.x0 - 3.4, px1 = C.x1 + 3.4, pz0 = C.z0 - 2.4, pz1 = C.z1 + 2.4;
    g.fillStyle = '#c08b52'; g.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    for (let z = pz0; z < pz1; z += 0.42) {
      const t = R();
      g.fillStyle = 'rgba(' + (t > 0.5 ? '255,232,196,' + (0.03 + t * 0.06)
                                       : '60,32,12,' + (0.03 + t * 0.07)) + ')';
      g.fillRect(px0, z, px1 - px0, 0.42);
      // the seam between planks, and a butt joint every so often
      g.fillStyle = 'rgba(52,28,10,0.42)';
      g.fillRect(px0, z, px1 - px0, 0.035);
      let x = px0 + R() * 5;
      while (x < px1) { g.fillRect(x, z, 0.035, 0.42); x += 3 + R() * 7; }
    }
    // grain: long thin scratches along the boards
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = 'rgba(70,40,16,' + (0.03 + R() * 0.07) + ')';
      g.fillRect(px0 + R() * (px1 - px0), pz0 + R() * (pz1 - pz0), 0.4 + R() * 2.2, 0.025);
    }
    // the stained border outside the lines, with the venue's name on it
    g.fillStyle = 'rgba(24,14,6,0.55)';
    g.fillRect(px0, pz0, px1 - px0, C.z0 - pz0 + 0.06);
    g.fillRect(px0, C.z1 - 0.06, px1 - px0, pz1 - C.z1 + 0.06);
    g.save();
    g.translate((C.x0 + C.x1) / 2, C.z0 - 1.25);
    g.scale(1, 1);
    g.fillStyle = 'rgba(232,226,210,0.5)';
    g.font = '700 0.62px ui-monospace,Menlo,Consolas,monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('P L A Y P I L E   A R E N A', 0, 0);
    g.restore();

    courtLines(g, C, { paint: '#f2ecdc', keyFill: 'rgba(28,58,104,0.82)',
                       check: '#d8ac4a', lw: 0.12, scuff: 'rgba(0,0,0,0.12)' });

    // the centre logo, in the open half of a half court and dead centre
    // of a full one
    const lx = C.rims.length > 1 ? C.check : (C.x0 + C.check) / 2;
    g.save();
    g.translate(lx, 0);
    g.globalAlpha = 0.85;
    g.strokeStyle = '#d8ac4a'; g.lineWidth = 0.1;
    g.beginPath(); g.arc(0, 0, 2.05, 0, 6.2832); g.stroke();
    g.fillStyle = 'rgba(28,58,104,0.5)';
    g.beginPath(); g.arc(0, 0, 1.95, 0, 6.2832); g.fill();
    g.fillStyle = '#e8e2d2';
    g.font = '700 1.5px ui-monospace,Menlo,Consolas,monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PP', 0, 0.06);
    g.restore();

    // scuffs where players actually stand
    for (const rim of C.rims) {
      const gr = g.createRadialGradient(rim.x - rim.face * 3, 0, 0.5, rim.x - rim.face * 3, 0, 4.5);
      gr.addColorStop(0, 'rgba(255,255,255,0.07)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(rim.x - rim.face * 8, -5, 10, 10);
    }
  }, 'linear');
  tex.anisotropy = 4;
  return { tex, r };
}

/** THE BLACKTOP: tar, cracks, weeds and whatever is left of the paint */
function streetGround(C, seed) {
  const r = groundRect(C, 27);
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  const ppu = ppuFor(W, D);
  const cw = Math.round(W * ppu), ch = Math.round(D * ppu);
  const R = rng(seed + 23);
  const tex = paint(cw, ch, (g) => {
    g.setTransform(ppu, 0, 0, ppu, -r.x0 * ppu, -r.z0 * ppu);
    g.fillStyle = '#4b5057'; g.fillRect(r.x0, r.z0, W, D);
    // patches of newer and older sealant, which is what makes real
    // asphalt look like asphalt rather than like grey paper
    for (let i = 0; i < 46; i++) {
      const x = r.x0 + R() * W, z = r.z0 + R() * D;
      const w = 2 + R() * 9, h = 1.5 + R() * 5;
      g.fillStyle = R() > 0.5 ? 'rgba(26,29,34,0.20)' : 'rgba(150,154,160,0.16)';
      g.beginPath();
      g.ellipse(x, z, w / 2, h / 2, R() * 3, 0, 6.2832);
      g.fill();
    }
    speckle(g, R, 5200, r.x0, r.z0, W, D,
      ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.22)', 'rgba(180,170,160,0.06)'], 0.07);

    // THE PAINT, WORN. Drawn in full and then eaten away: a faded line is
    // not a fainter line, it is a line with holes in it.
    g.save();
    g.globalAlpha = 0.66;
    courtLines(g, C, { paint: '#d6d2c6', keyFill: 'rgba(120,52,40,0.45)',
                       check: '#c8b45a', lw: 0.14, scuff: 'rgba(0,0,0,0.16)' });
    g.restore();
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(78,84,92,' + (0.25 + R() * 0.6) + ')';
      const x = C.x0 - 1 + R() * (C.x1 - C.x0 + 2), z = C.z0 - 1 + R() * (C.z1 - C.z0 + 2);
      g.beginPath(); g.ellipse(x, z, 0.1 + R() * 0.5, 0.08 + R() * 0.3, R() * 3, 0, 6.2832); g.fill();
    }
    g.globalCompositeOperation = 'source-over';

    // CRACKS. A crack is a walk, not a line: it wanders, it forks, and it
    // has a pale lip on one side where the surface has lifted.
    const crack = (x, z, ang, len, wide) => {
      let cx2 = x, cz = z, a = ang;
      g.beginPath(); g.moveTo(cx2, cz);
      const pts = [[cx2, cz]];
      for (let s = 0; s < len; s++) {
        a += (R() - 0.5) * 0.9;
        cx2 += Math.cos(a) * 0.5; cz += Math.sin(a) * 0.5;
        g.lineTo(cx2, cz); pts.push([cx2, cz]);
      }
      g.strokeStyle = 'rgba(22,25,29,0.62)'; g.lineWidth = wide; g.stroke();
      g.strokeStyle = 'rgba(150,152,155,0.22)'; g.lineWidth = wide * 0.7;
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i) g.lineTo(p[0] + 0.05, p[1] + 0.06); else g.moveTo(p[0] + 0.05, p[1] + 0.06);
      }
      g.stroke();
      return pts;
    };
    for (let i = 0; i < 16; i++) {
      const pts = crack(r.x0 + R() * W, r.z0 + R() * D, R() * 6.28, 8 + R() * 22, 0.035 + R() * 0.04);
      if (R() > 0.4) {
        const p = pts[(pts.length * 0.4) | 0];
        crack(p[0], p[1], R() * 6.28, 4 + R() * 8, 0.03);
      }
      // weeds in the crack, painted, with real ones planted on top later
      for (let k = 0; k < pts.length; k += 5) {
        if (R() > 0.7) {
          g.fillStyle = 'rgba(58,74,36,' + (0.4 + R() * 0.4) + ')';
          g.beginPath();
          g.ellipse(pts[k][0], pts[k][1], 0.18 + R() * 0.2, 0.1 + R() * 0.12, R() * 3, 0, 6.2832);
          g.fill();
        }
      }
    }
    // the edge of the lot: dirt, grit and grass creeping in
    const edge = (x, z, w, h) => {
      for (let i = 0; i < 520; i++) {
        const t = R();
        g.fillStyle = t > 0.6 ? 'rgba(64,78,40,0.5)' : 'rgba(92,80,60,0.42)';
        g.beginPath();
        g.ellipse(x + R() * w, z + R() * h, 0.1 + R() * 0.3, 0.06 + R() * 0.2, 0, 0, 6.2832);
        g.fill();
      }
    };
    edge(r.x0, r.z0, W, 2.4);
    edge(r.x0, r.z1 - 2.6, W, 2.6);
    edge(r.x0, r.z0, 2.4, D);
    edge(r.x1 - 2.4, r.z0, 2.4, D);

    // a drain, a manhole and somebody's tag
    const mh = (x, z) => {
      g.fillStyle = '#24262a'; g.beginPath(); g.arc(x, z, 0.52, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(120,124,128,0.5)'; g.lineWidth = 0.05;
      g.beginPath(); g.arc(x, z, 0.44, 0, 6.2832); g.stroke();
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.moveTo(x - 0.4, z - 0.32 + i * 0.11); g.lineTo(x + 0.4, z - 0.32 + i * 0.11);
        g.stroke();
      }
    };
    mh(C.x0 + 1.5, C.z1 + 3.2);
    mh(C.x1 - 2.2, C.z0 - 2.6);
    g.save();
    g.translate((C.x0 + C.check) / 2, C.z1 + 1.35);
    g.rotate(-0.08);
    g.globalAlpha = 0.55;
    g.fillStyle = '#c9a63c';
    g.font = '700 1.05px ui-monospace,Menlo,Consolas,monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('KING OF THE BLOCK', 0, 0);
    g.restore();
  }, 'linear');
  tex.anisotropy = 4;
  return { tex, r };
}

/** lay a painted ground texture down as one plane */
function groundPlane(got) {
  const { tex, r } = got;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0),
    new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((r.x0 + r.x1) / 2, FLOOR + 0.012, (r.z0 + r.z1) / 2);
  m.receiveShadow = true;
  return m;
}

// =====================================================================
// THE CROWD
// =====================================================================
//
// Two kinds, for one reason: a body you can see put its arms up is worth
// thirteen draw calls, and a body forty units away in the dark is worth
// a twenty-fourth of one.
//
//   FEATURED  a real kit.js `person()`, posed, animated, ~a dozen of them
//             in the row nearest the camera.
//   MASS      two instanced meshes - torsos and heads - carrying six
//             hundred to fifteen hundred people between them.
// =====================================================================

/** the geometry one instanced spectator is made of */
function spectatorGeos() {
  const torso = new Chunk();
  torso.box(0.62, 0.78, 0.36, '#ffffff', 0, 0.39, 0);
  torso.box(0.24, 0.5, 0.22, '#ffffff', -0.42, 0.44, 0.02);
  torso.box(0.24, 0.5, 0.22, '#ffffff', 0.42, 0.44, 0.02);
  const head = new Chunk();
  head.box(0.34, 0.36, 0.34, '#ffffff', 0, 1.0, 0);
  head.box(0.37, 0.12, 0.37, '#8e7d6a', 0, 1.2, 0);
  return { torso: mergeGeos(torso.list), head: mergeGeos(head.list) };
}

/**
 * A SEA OF PEOPLE, as two instanced meshes.
 *
 * `seats` is a list of {x,y,z,s,shirt,skin}. Everything after that is
 * bookkeeping so that a cheer can lift them all without rebuilding
 * anything: the base matrix of each one is kept as five numbers and the
 * matrix array is only rewritten while the cheer is actually running.
 */
function massCrowd(seats) {
  const geo = spectatorGeos();
  const n = seats.length;
  const torso = new THREE.InstancedMesh(geo.torso, mat('#ffffff', { vertexColors: false }), n);
  const head = new THREE.InstancedMesh(geo.head, mat('#ffffff'), n);
  torso.castShadow = head.castShadow = false;
  torso.receiveShadow = head.receiveShadow = false;
  torso.frustumCulled = head.frustumCulled = false;
  head.frustumCulled = false;
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const s = seats[i];
    m.makeScale(s.s, s.s, s.s);
    m.setPosition(s.x, s.y, s.z);
    torso.setMatrixAt(i, m); head.setMatrixAt(i, m);
    torso.setColorAt(i, c.set(s.shirt));
    head.setColorAt(i, c.set(s.skin));
  }
  torso.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  torso.instanceColor.needsUpdate = head.instanceColor.needsUpdate = true;

  let lastUp = -1;
  function pose(t, up) {
    // nothing to do while nobody is cheering and nobody was cheering
    if (up <= 0 && lastUp <= 0) return;
    lastUp = up;
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      const lift = up * (0.22 + 0.16 * Math.sin(t * 9 + s.ph)) * s.s;
      m.makeScale(s.s, s.s, s.s);
      m.setPosition(s.x, s.y + lift, s.z);
      torso.setMatrixAt(i, m); head.setMatrixAt(i, m);
    }
    torso.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  }
  return { torso, head, pose };
}

/**
 * TAKE A BODY OUT OF THE SHADOW PASS.
 *
 * A kit.js person() is thirteen meshes and every one of them casts, so
 * sixteen people watching from behind a fence were three hundred and
 * twenty draw calls - half of them in the shadow map, for shadows that
 * land on a pavement nobody can see. The players on the court keep
 * theirs; nothing in the background needs one.
 */
function noShadow(o) {
  o.traverse((c) => { c.castShadow = false; c.receiveShadow = false; });
  return o;
}

/**
 * FOLD A BODY DOWN TO THREE MESHES.
 *
 * kit.js's person() is thirteen separate boxes on five joints, which is
 * exactly right for the six players on the court - every joint of theirs
 * is used every frame. A spectator uses two of them. His legs are
 * crossed under a seat and stay crossed; his chest leans the same way
 * for the whole match; the only thing that ever moves is his arms going
 * up and the seat springing under him.
 *
 * So: pose him, then bake everything that is not an arm into ONE mesh,
 * and each arm into one more. Thirteen draw calls become three, the
 * colours ride along in the vertices, and the bit that has to move still
 * moves because the arm pivots are left standing.
 *
 * IT MUST BE CALLED BEFORE THE BODY IS PLACED. The bake reads world
 * matrices, and the only way those are the body's own local space is if
 * the group is still sitting at the origin.
 */
function foldPerson(p) {
  // kit.js is somebody else's file and its insides are allowed to
  // change; only the signature is promised. If a body ever comes back
  // without the joints this walks, leave it alone rather than throw -
  // an unfolded crowd is a slower venue, a crash is no venue at all.
  if (!p || !p.g || !p.arms || !p.arms.length || !p.arms[0].pivot) return p;
  p.g.position.set(0, 0, 0);
  p.g.rotation.set(0, 0, 0);
  p.g.updateMatrixWorld(true);
  const bodyGeos = [], armGeos = p.arms.map(() => []), dead = [];
  const inv = new THREE.Matrix4();
  const owner = (o) => {
    for (let i = 0; i < p.arms.length; i++) {
      for (let q = o; q; q = q.parent) if (q === p.arms[i].pivot) return i;
    }
    return -1;
  };
  p.g.traverse((o) => {
    if (!o.isMesh) return;
    const a = owner(o);
    const g = o.geometry.clone();
    if (a >= 0) {
      inv.copy(p.arms[a].pivot.matrixWorld).invert().multiply(o.matrixWorld);
      g.applyMatrix4(inv);
    } else {
      g.applyMatrix4(o.matrixWorld);
    }
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const col = o.material && o.material.color ? o.material.color : _col.set('#ffffff');
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    (a >= 0 ? armGeos[a] : bodyGeos).push(g);
    dead.push(o);
  });
  const seen = new Set();
  for (const o of dead) {
    o.geometry.dispose();
    if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.dispose(); }
    if (o.parent) o.parent.remove(o);
  }
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  if (bodyGeos.length) {
    const m = new THREE.Mesh(mergeGeos(bodyGeos), lam());
    m.castShadow = m.receiveShadow = false;
    p.g.add(m);
  }
  for (let i = 0; i < p.arms.length; i++) {
    if (!armGeos[i].length) continue;
    const m = new THREE.Mesh(mergeGeos(armGeos[i]), lam());
    m.castShadow = m.receiveShadow = false;
    p.arms[i].pivot.add(m);
    // the forearm is baked into the arm now, so its joint is gone
    p.arms[i].fore.rotation.set(0, 0, 0);
  }
  p.folded = true;
  return p;
}

/**
 * POSE A BODY WITHOUT ASSUMING IT HAS THAT JOINT.
 *
 * Same reason as foldPerson's guard: kit.js's internals are somebody
 * else's to change, and a background body that cannot bend a knee is a
 * background body standing up straight, not an exception in a game loop.
 */
function jointed(p) {
  const none = { rotation: { x: 0, y: 0, z: 0, set() {} } };
  return {
    chest: (p && p.chest) || none,
    arms: (p && p.arms) || [],
    legs: (p && p.legs) || [],
  };
}

/** a shirt colour that belongs to a crowd rather than to a paint box */
function crowdShirt(R) {
  const h = [0.02, 0.58, 0.08, 0.0, 0.62, 0.11, 0.33, 0.95][(R() * 8) | 0];
  return new THREE.Color().setHSL(h, 0.18 + R() * 0.5, 0.22 + R() * 0.4);
}
function crowdSkin(R) {
  return new THREE.Color().setHSL(0.05 + R() * 0.06, 0.34, 0.3 + R() * 0.36);
}

// =====================================================================
// THE ARENA
// =====================================================================
function buildArena(C, opts) {
  // the scoreboards this venue owns, repainted through the API setScore
  const scoreboards = [];
  const seed = opts.seed === undefined ? 7 : opts.seed;
  const R = rng(seed);
  const group = new THREE.Group();
  const cx = (C.x0 + C.x1) / 2;
  // HOW WIDE THE BUILDING IS, decided by the camera rather than by the
  // floor. An InstancedMesh with frustumCulled off draws every instance
  // it has, so a row of seats out at x = -24 is a row of seats the GPU
  // transforms sixty times a second and never shows anybody. A half
  // court's camera is nailed to x = -1.6 and sees twenty units, so the
  // bowl is twenty-eight wide and not forty-five - forty per cent of the
  // crowd, gone, with nothing to see for it. A full court's camera
  // tracks, so there it really does need the whole floor.
  const camX = C.rims.length > 1 ? cx : -1.6;
  const half = C.rims.length > 1 ? (C.x1 - C.x0) / 2 + 12 : 14;
  const ax0 = camX - half, ax1 = camX + half;
  const AW = ax1 - ax0;
  const upd = [];
  let cheer = 0, t = 0;

  // ---- the floor ---------------------------------------------------
  const ground = groundPlane(arenaGround(C, seed));
  group.add(ground);
  // the concrete the whole thing sits on, so the floor has an edge
  const slab = new Chunk();
  slab.box(AW + 24, 0.9, 120, '#10141b', cx, FLOOR - 0.45, -6);
  group.add(slab.mesh({ receive: true }));

  // ---- the bowl ----------------------------------------------------
  //
  // Fourteen rows at a rake of 0.62 up per 1.15 back. Real arenas are
  // steeper; this one is deliberately not, because at 0.83 the tenth row
  // has already left the top of the frame and a stand you can only see
  // four rows of does not read as a stand. As drawn, the crowd fills the
  // screen from just above the court to just under the roof.
  const ROWS = 14, RISE = 0.62, DEEP = 1.15;
  const BZ = C.z0 - 3.2;                     // the foot of the barrier
  const Z0 = BZ - 1.9;                       // the first row, behind it
  const rowY = (i) => FLOOR + 0.45 + i * RISE;
  const rowZ = (i) => Z0 - i * DEEP;
  const WALK = 6;                            // the row that is a walkway

  // where the tunnel mouth is: a gap chewed out of the bottom rows
  const tun = C.rims.length > 1 ? [cx - 13, cx - 9] : [C.x0 - 0.4, C.x0 + 3.2];

  const bowl = new Chunk();
  const seats = [];
  for (let i = 0; i < ROWS; i++) {
    const y = rowY(i), z = rowZ(i);
    const walk = i === WALK;
    // the step itself, in up to two pieces so the tunnel can pass through
    const segs = (i < 4) ? [[ax0, tun[0]], [tun[1], ax1]] : [[ax0, ax1]];
    const fade = lerp(0.85, 0.15, Math.pow(i / (ROWS - 1), 0.7));
    const tone = (hex) => '#' + [0, 2, 4].map((k) =>
      Math.round(parseInt(hex.slice(1 + k, 3 + k), 16) * fade).toString(16).padStart(2, '0')).join('');
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.5) continue;
      bowl.box(s1 - s0, RISE + 0.1, DEEP, tone(i < WALK ? '#2b3446' : '#222a39'),
        (s0 + s1) / 2, y - RISE / 2 + 0.05, z);
      if (!walk) {
        // the seats: one long back per row. At this distance the gaps
        // between individual seats are under a pixel, and the people sit
        // in front of them anyway.
        bowl.box(s1 - s0, 0.42, 0.12, tone(i < WALK ? '#b7452f' : '#1d2a3c'),
          (s0 + s1) / 2, y + 0.21, z - DEEP / 2 + 0.16);
        bowl.box(s1 - s0, 0.08, 0.42, tone(i < WALK ? '#9b3a28' : '#18222f'),
          (s0 + s1) / 2, y + 0.04, z - DEEP / 2 + 0.42);
      } else {
        // a walkway needs a handrail or it reads as a missing row
        bowl.box(s1 - s0, 0.06, 0.06, '#8d97a8', (s0 + s1) / 2, y + 0.75, z + DEEP / 2 - 0.1);
        for (let x = s0 + 1; x < s1; x += 3.6) {
          bowl.box(0.06, 0.8, 0.06, '#7c8695', x, y + 0.4, z + DEEP / 2 - 0.1);
        }
      }
    }
    if (walk) continue;
    // and the people in it
    const dens = i < WALK ? 0.62 : 0.70;
    for (let x = ax0 + 0.6; x < ax1 - 0.4; x += dens) {
      if (i < 4 && x > tun[0] - 0.4 && x < tun[1] + 0.4) continue;
      if (R() > (i < WALK ? 0.93 : 0.8)) continue;        // a few empty seats
      // THE BOWL GOES DARK AS IT GOES UP, because the light is over the
      // court and not over the crowd. It is also the only thing keeping
      // the players readable in front of fifteen hundred people: the
      // first pass had the top row as bright as the front row and the
      // whole upper half of the frame fought the game for attention.
      const dim = lerp(0.82, 0.13, Math.pow(i / (ROWS - 1), 0.7));
      const sh = crowdShirt(R).multiplyScalar(dim);
      const sk = crowdSkin(R).multiplyScalar(dim);
      seats.push({ x: x + (R() - 0.5) * 0.18, y: y + 0.02, z: z + 0.1,
                   s: 0.86 + R() * 0.2, shirt: sh, skin: sk, ph: R() * 6.28 });
    }
  }
  // THE FACADE ABOVE THE TOP ROW, which is the top edge of the picture.
  // A row of lit executive boxes along it, because a flat dark band at
  // the top of the frame is a wall and a row of little warm windows is a
  // building with people in the rest of it.
  const topY = rowY(ROWS - 1), topZ = rowZ(ROWS - 1);
  bowl.box(AW, 10, 0.6, '#161d29', cx, topY + 5.4, topZ - 0.9);
  bowl.box(AW, 0.5, 1.2, '#0e131c', cx, topY + 0.5, topZ - 0.4);
  for (let x = ax0 + 2; x < ax1 - 2; x += 4.4) {
    bowl.box(3.2, 1.5, 0.3, '#0a0e15', x, topY + 1.9, topZ - 0.75);
    bowl.box(3.6, 0.22, 0.45, '#2a3444', x, topY + 2.75, topZ - 0.72);
  }
  // the two end walls, so the bowl does not look like a cut-off slice
  bowl.box(1.0, 14, ROWS * DEEP + 3, '#151c27', ax0 - 0.4, FLOOR + 6, Z0 - ROWS * DEEP / 2);
  bowl.box(1.0, 14, ROWS * DEEP + 3, '#151c27', ax1 + 0.4, FLOOR + 6, Z0 - ROWS * DEEP / 2);

  // ---- the tunnel --------------------------------------------------
  // A hole in the bottom four rows with something lit at the end of it,
  // which is the detail that says "this room has a rest of the building".
  const tw = tun[1] - tun[0], tcx = (tun[0] + tun[1]) / 2;
  bowl.box(tw + 1.4, 0.5, 0.7, '#2b3446', tcx, rowY(4) + 0.3, Z0 - 3.6);
  bowl.box(0.55, 3.6, 4.6, '#283244', tun[0] - 0.28, FLOOR + 1.8, Z0 - 2.0);
  bowl.box(0.55, 3.6, 4.6, '#283244', tun[1] + 0.28, FLOOR + 1.8, Z0 - 2.0);
  // the lintel over it, thin, with the section number on a plate
  bowl.box(tw + 1.4, 0.3, 4.6, '#232c3c', tcx, FLOOR + 3.75, Z0 - 2.0);
  bowl.box(1.9, 0.44, 0.12, '#141b26', tcx, FLOOR + 3.3, Z0 - 0.35);
  // it has to be DARK down there or it is not a tunnel, it is a window.
  // Only the far end is lit, and only a doorway's worth of it.
  bowl.box(tw, 3.6, 0.3, '#05070b', tcx, FLOOR + 1.8, Z0 - 4.2);
  bowl.box(tw + 0.1, 0.5, 4.4, '#090c12', tcx, FLOOR + 3.35, Z0 - 2.1);
  bowl.box(0.5, 3.4, 4.4, '#0b0f16', tun[0] + 0.2, FLOOR + 1.7, Z0 - 2.1);
  bowl.box(0.5, 3.4, 4.4, '#0b0f16', tun[1] - 0.2, FLOOR + 1.7, Z0 - 2.1);
  group.add(bowl.mesh({}));

  const mass = massCrowd(seats);
  group.add(mass.torso); group.add(mass.head);

  // the lit end of the tunnel, plus the LED ribbon and lamps - anything
  // that is meant to be a light source is unlit geometry, because a
  // lambert surface cannot be brighter than the light falling on it
  const glow = new Chunk();
  // the far end of the tunnel: a doorway's worth of warm light with a
  // body standing in it, not a lit panel the size of a garage door
  glow.quad(1.5, 2.0, '#b08a52', tcx + 0.4, FLOOR + 1.0, Z0 - 4.05);
  glow.quad(0.5, 1.25, '#1a1410', tcx + 0.25, FLOOR + 0.63, Z0 - 4.02);
  glow.quad(0.34, 0.34, '#1a1410', tcx + 0.25, FLOOR + 1.42, Z0 - 4.02);
  glow.quad(tw - 0.9, 0.1, '#5f4a2c', tcx, FLOOR + 3.42, Z0 - 4.04);
  // the lit strip along the tunnel ceiling, and the green EXIT plate
  glow.quad(0.2, 3.4, '#6a5936', tcx, FLOOR + 3.55, Z0 - 2.1, -Math.PI / 2, 0, 0);
  glow.quad(1.5, 0.3, '#2d7a45', tcx, FLOOR + 3.3, Z0 - 0.28);
  // the LED ring at the top of the bowl
  glow.box(AW, 0.34, 0.1, '#2a4a96', cx, topY + 1.15, topZ - 0.5);

  // ---- the sponsor boards at the foot of the stand -----------------
  const led = paint(1024, 96, (g, w, h) => {
    const bands = ['#0d2c5a', '#7a1b1b', '#12402a', '#3a2a66', '#5a3a10'];
    const names = ['PLAYPILE', 'DECK MOTORS', 'HOOPS+', 'CITY BANK', 'OLDIE AUDIO',
                   'NIGHT SHIFT', 'APEX FUEL', 'GRIND CITY'];
    // EIGHT PANELS OF EXACTLY 128, because the texture repeats along the
    // board and a panel of any other width gets cut in half at the seam.
    let x = 0, i = 0;
    while (x < w) {
      const bw = 128;
      g.fillStyle = bands[i % bands.length];
      g.fillRect(x, 0, bw, h);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x, 0, bw, 6);
      // SMALL TEXT WITH AIR ROUND IT. At 26px the name filled the panel
      // top to bottom and a row of sponsor boards read as a headline
      // running across the picture, louder than the game in front of it.
      g.fillStyle = 'rgba(233,238,246,0.92)';
      g.font = '700 15px ui-monospace,Menlo,Consolas,monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(names[i % names.length], x + bw / 2, h / 2 + 8);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x + bw / 2 - 16, h / 2 - 16, 32, 10);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + bw - 3, 0, 3, h);
      x += bw; i++;
    }
    // the scanline that says LED rather than painted board
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 1); }
  }, 'linear');
  led.wrapS = THREE.RepeatWrapping;
  led.repeat.set(Math.max(2, Math.round(AW / 22)), 1);
  // IT SITS ON A PLINTH, and the table in front of it is shorter than
  // the plinth is tall. First time round the board was on the floor and
  // the scorer's table stood in front of it, which turned eight sponsors
  // into a dark bar with the tops of some letters over it.
  // UNLIT, BUT NOT FULL BRIGHTNESS. A MeshBasicMaterial is as bright as
  // its texture, so a ring of sponsor boards came out as the loudest
  // thing in the frame - brighter than the floor the game is played on.
  // The colour multiplier pulls it back to "lit sign in a dark hall".
  const ledBoard = new THREE.Mesh(new THREE.PlaneGeometry(AW, 1.25),
    new THREE.MeshBasicMaterial({ map: led, color: 0x8e96a2 }));
  ledBoard.position.set(cx, FLOOR + 1.3, BZ - 0.02);
  group.add(ledBoard);
  const ledBack = new Chunk();
  ledBack.box(AW, 1.5, 0.5, '#0b0f16', cx, FLOOR + 1.3, BZ - 0.3);
  ledBack.box(AW, 0.7, 0.8, '#161d29', cx, FLOOR + 0.35, BZ - 0.1);
  ledBack.box(AW, 0.14, 0.9, '#28323f', cx, FLOOR + 2.02, BZ - 0.1);
  group.add(ledBack.mesh({ receive: true }));

  // ---- what hangs over the court -----------------------------------
  // PODS ON CABLES, NOT A TRUSS ACROSS THE WHOLE HALL.
  //
  // The first pass ran two full-width lattice girders over the court.
  // Silhouetted against a wall of lit crowd they came out as two
  // horizontal bars of diagonal hatching stretching from one side of the
  // picture to the other - the eye read them as damage, not as rigging.
  // Discrete light pods on thin cables read instantly as what they are,
  // cost a fifth as many triangles, and leave the crowd behind them
  // visible, which is the whole point of hanging something in front of
  // it.
  const rig = new Chunk();
  const RIGY = FLOOR + 12.1;
  for (const z of [-3.6, 2.4]) {
    for (let x = ax0 + 5.5; x < ax1 - 4; x += 6.4) {
      const y = RIGY + (z > 0 ? -0.5 : 0);
      rig.box(3.4, 0.55, 1.5, '#0c1017', x, y, z);
      rig.box(3.7, 0.16, 1.7, '#161d27', x, y + 0.34, z);
      rig.box(0.09, 4.0, 0.09, '#0c1017', x - 1.3, y + 2.2, z);
      rig.box(0.09, 4.0, 0.09, '#0c1017', x + 1.3, y + 2.2, z);
      // the little safety line that says the thing is hung, not floating
      rig.strut(2, 0.05, '#0c1017', x - 1.3, y + 1.4, x + 1.3, y + 3.0, z);
    }
    // one thin catwalk rail behind them, for depth
    rig.box(ax1 - ax0 - 6, 0.12, 0.12, '#121823', cx, RIGY + 3.3, z - 1.4);
  }
  // THE ROOF STARTS WELL BEHIND THE COURT, and that is not decoration.
  // The camera looks DOWN, so what it sees of a ceiling is the TOP of
  // it, which occludes everything behind. A roof reaching out over the
  // court therefore drew a flat black band across the upper third of the
  // frame and took the banners and the top of the bowl with it. Starting
  // it at z = -13 puts its near edge above the top of the picture.
  rig.box(AW + 8, 0.5, 40, '#080b11', cx, FLOOR + 15.4, Z0 - 20);
  for (let x = ax0; x < ax1; x += 9) rig.box(0.55, 0.8, 36, '#10151d', x, FLOOR + 14.9, Z0 - 20);
  group.add(rig.mesh({}));

  // the lamps themselves: unlit white, in a grid under each pod
  for (const z of [-3.6, 2.4]) {
    for (let x = ax0 + 5.5; x < ax1 - 4; x += 6.4) {
      const y = RIGY + (z > 0 ? -0.5 : 0);
      for (let k = -1; k <= 1; k++) {
        glow.quad(0.85, 1.1, '#fff6d8', x + k * 1.05, y - 0.29, z, -Math.PI / 2, 0, 0);
        glow.quad(0.85, 0.2, '#f4e3b4', x + k * 1.05, y - 0.2, z + 0.76);
      }
    }
  }

  // ---- the scoreboard ----------------------------------------------
  // THE SCOREBOARD IS THE REAL SCORE. It was painted once with invented
  // numbers, which is fine in a screenshot and wrong the moment somebody
  // scores - so the drawing is a function, the venue keeps the canvas, and
  // half.js pushes the numbers in through setScore(). It only redraws when
  // one of them changes; a scoreboard does not need sixty frames a second.
  const sbState = { home: 0, away: 0, clock: '', shot: 24 };
  const drawBoard = (g, w, h) => {
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1d2636'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 30px ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#e2584a'; g.fillText('HOME', w * 0.2, 44);
    g.fillStyle = '#4a86e2'; g.fillText('AWAY', w * 0.8, 44);
    g.font = '700 86px ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#ffb648';
    g.fillText(String(sbState.home).padStart(2, '0'), w * 0.2, 120);
    g.fillText(String(sbState.away).padStart(2, '0'), w * 0.8, 120);
    g.font = '700 54px ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#e9eef6'; g.fillText(sbState.clock || '', w * 0.5, 116);
    g.font = '700 22px ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#7d8798'; g.fillText('SHOT  ' + sbState.shot, w * 0.5, 62);
    g.fillStyle = '#12203a'; g.fillRect(10, h - 56, w - 20, 46);
    g.fillStyle = '#7fb0ff';
    g.font = '700 26px ui-monospace,Menlo,Consolas,monospace';
    g.fillText('* * *  P L A Y P I L E  * * *', w / 2, h - 32);
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, w, 1); }
  };
  const sbTex = paint(512, 256, drawBoard, 'linear');
  scoreboards.push({ tex: sbTex, state: sbState, draw: drawBoard });
  const sb = new THREE.Group();
  const sbFace = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.1),
    new THREE.MeshBasicMaterial({ map: sbTex }));
  sbFace.position.z = 1.31;
  sb.add(sbFace);
  const sbBody = new Chunk();
  sbBody.box(6.6, 3.5, 2.6, '#10151f', 0, 0, 0);
  sbBody.box(7.2, 0.3, 3.2, '#232c3b', 0, 1.9, 0);
  sbBody.box(0.16, 4.2, 0.16, '#2b323d', -2.4, 4.0, 0);
  sbBody.box(0.16, 4.2, 0.16, '#2b323d', 2.4, 4.0, 0);
  sb.add(sbBody.mesh({}));
  sb.position.set(cx, FLOOR + 9.6, 0.4);
  group.add(sb);

  // ---- banners, hanging off the roof at the back -------------------
  const banTex = paint(256, 512, (g, w, h) => {
    g.fillStyle = '#7a1b26'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8ac4a'; g.fillRect(8, 8, w - 16, 10);
    g.fillRect(8, h - 18, w - 16, 10);
    g.textAlign = 'center'; g.fillStyle = '#f0e7d2';
    g.font = '700 46px ui-monospace,Menlo,Consolas,monospace';
    g.fillText('CHAMPIONS', w / 2, 120);
    g.font = '700 62px ui-monospace,Menlo,Consolas,monospace';
    g.fillText('2026', w / 2, 210);
    g.beginPath(); g.arc(w / 2, 330, 58, 0, 6.2832);
    g.strokeStyle = '#d8ac4a'; g.lineWidth = 7; g.stroke();
    g.font = '700 54px ui-monospace,Menlo,Consolas,monospace';
    g.fillText('PP', w / 2, 348);
  }, 'linear');
  const banners = [];
  for (let i = 0; i < 6; i++) {
    const bx = ax0 + 6 + i * (AW - 12) / 5;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.4),
      new THREE.MeshLambertMaterial({ map: banTex, side: THREE.DoubleSide,
        emissive: new THREE.Color(0x30242a) }));
    // HIGH, BUT NOT SO HIGH THEY ARE OFF THE TOP. At z = -7 the frame
    // runs out at y = FLOOR + 15.2, and the first pass hung them at 14.2
    // with a 3.4 drop, i.e. entirely above the picture.
    b.position.set(bx, FLOOR + 9.2, Z0 - 5.5 - (i % 2) * 1.2);
    group.add(b);
    banners.push({ m: b, ph: R() * 6.28 });
  }

  // ---- camera flashes in the dark half of the bowl ------------------
  //
  // Forty little unlit squares that blink one at a time. It is the
  // cheapest thing in this file and it is the thing that makes a still
  // crowd look like a live one.
  const flashGeo = new THREE.PlaneGeometry(0.34, 0.26);
  const flash = new THREE.InstancedMesh(flashGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), 40);
  flash.frustumCulled = false;
  const fSpots = [];
  for (let i = 0; i < 40; i++) {
    const row = 4 + ((R() * (ROWS - 5)) | 0);
    fSpots.push({ x: ax0 + 1 + R() * (AW - 2), y: rowY(row) + 0.9, z: rowZ(row) + 0.3, on: 0 });
  }
  const fm = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) { fm.makeScale(0, 0, 0); flash.setMatrixAt(i, fm); }
  group.add(flash);

  group.add(glow.mesh({ basic: true }));

  // ---- the front row, in the flesh ---------------------------------
  // ...and the same rule as the street's watchers: spread across what
  // the camera can SEE, not across what has been built
  const featured = [];
  const nFeat = C.rims.length > 1 ? 15 : 11;
  const fFoc = C.rims.length > 1 ? cx : -1.6;
  const fSpan = C.rims.length > 1 ? (C.x1 - C.x0 + 8) : 20;
  for (let i = 0; i < nFeat; i++) {
    const x = fFoc - fSpan / 2 + (i + 0.4 + (R() - 0.5) * 0.4) * fSpan / nFeat;
    const p = person(0.34, crowdShirt(R), crowdSkin(R));
    // pose, THEN fold, THEN place - see foldPerson
    const J = jointed(p);
    for (const l of J.legs) { l.pivot.rotation.x = -1.45; l.knee.rotation.x = 1.5; }
    J.chest.rotation.x = 0.1;
    for (const a of J.arms) { a.pivot.rotation.x = -1.2; a.fore.rotation.x = -1.1; }
    foldPerson(p);
    p.g.position.set(x, rowY(0) + 0.06, rowZ(0) + 0.24);
    p.g.rotation.y = (R() - 0.5) * 0.7;
    group.add(noShadow(p.g));
    featured.push({ p, ph: R() * 6.28, y: p.g.position.y });
  }

  // ---- THE FOREGROUND BAND -----------------------------------------
  //
  // Everything from here on is IN FRONT of the court, which is why it is
  // all under two and a half units tall and all past z = 15: see the
  // header. Courtside seats seen from behind, a pair of camera operators
  // and the backs of the near LED boards.
  const fg = new Chunk();
  fg.box(AW + 10, 1.0, 0.45, '#0d121a', cx, FLOOR + 0.5, 15.2);
  fg.box(AW + 10, 0.12, 0.7, '#1b2434', cx, FLOOR + 1.02, 15.35);
  const fgSeats = [];
  for (let rowI = 0; rowI < 7; rowI++) {
    const z = 17.4 + rowI * 2.9, y = FLOOR + rowI * 0.3;
    fg.box(AW + 12, 0.5 + rowI * 0.25, 1.1, '#151c28', cx, y + 0.25, z + 0.55);
    for (let x = ax0 - 3; x < ax1 + 3; x += 0.78) {
      fg.box(0.62, 0.58, 0.12, rowI % 2 ? '#8c3526' : '#1d2a3c', x, y + 0.72, z + 0.36);
      if (R() > 0.22) {
        // the near rows are the far side of the light too, so they dim
        // going FORWARD the same way the bowl dims going back
        const dim = lerp(0.62, 0.3, rowI / 6);
        fgSeats.push({ x: x + (R() - 0.5) * 0.2, y: y + 0.42, z,
                       s: 0.9 + R() * 0.2,
                       shirt: crowdShirt(R).multiplyScalar(dim),
                       skin: crowdSkin(R).multiplyScalar(dim), ph: R() * 6.28 });
      }
    }
  }
  // two camera operators with their backs to us
  for (const cxx of [cx - 7, cx + 6]) {
    fg.cyl(0.08, 0.08, 1.5, 6, '#20262f', cxx, FLOOR + 0.75, 16.6);
    fg.box(0.55, 0.42, 0.9, '#181d26', cxx, FLOOR + 1.6, 16.6);
    fg.cyl(0.2, 0.2, 0.3, 10, '#0c0f14', cxx, FLOOR + 1.62, 16.1, Math.PI / 2, 0, 0);
  }
  group.add(fg.mesh({}));
  const fgCrowd = massCrowd(fgSeats);
  group.add(fgCrowd.torso); group.add(fgCrowd.head);

  // ---- what the ring is bolted to ----------------------------------
  //
  // half.js draws the board, the ring and a thin post. This adds the part
  // an arena has and a park does not: the padded stanchion behind the
  // baseline, the arm that reaches out to the board, and a shot clock on
  // top of it. It is drawn AROUND half.js's post rather than instead of
  // it, so it is correct whether or not the post is still there.
  if (opts.hoops !== false) {
    const h = new Chunk();
    for (const rim of C.rims) {
      const f = rim.face, bx = rim.board + f * 0.75;
      h.box(2.0, 1.2, 2.6, '#12171f', bx + f * 0.9, FLOOR + 0.6, 0);
      h.box(2.2, 0.25, 2.8, '#1a212c', bx + f * 0.9, FLOOR + 1.3, 0);
      // SLIM AND DARK. A 0.9 column in slate blue stood beside the ring
      // looking like a pillar holding the roof up; the real thing is a
      // black post you are not supposed to look at.
      h.box(0.52, 8.6, 0.62, '#161c26', bx + f * 0.25, FLOOR + 4.6, 0);
      h.strut(3, 0.22, '#161c26', bx + f * 0.9, FLOOR + 2.2, bx - f * 0.1, FLOOR + 5.4, 0);
      h.box(1.6, 0.3, 0.3, '#232c3b', bx - f * 0.3, C.rimY + 1.0, 0);
      // padding round the bottom of the post, which is the thing that
      // says "somebody expects a person to run into this"
      h.box(0.95, 2.4, 1.5, '#7a1b26', bx + f * 0.25, FLOOR + 1.2, 0);
      // the shot clock on top of the board
      h.box(1.5, 0.75, 0.3, '#0a0d13', rim.board, C.rimY + 3.0, 0);
      h.quad(1.2, 0.5, '#ff7a2f', rim.board - f * 0.17, C.rimY + 3.0, 0, 0, f > 0 ? 0 : Math.PI, 0);
      // and the board's own frame
      h.box(0.1, 0.16, 4.5, '#3b4661', rim.board + f * 0.06, C.rimY + 2.72, 0);
      h.box(0.1, 0.16, 4.5, '#3b4661', rim.board + f * 0.06, C.rimY - 0.4, 0);
    }
    group.add(h.mesh({ cast: true, receive: true }));
  }

  // ---- what moves --------------------------------------------------
  upd.push((dt) => {
    const up = cheer > 0 ? clamp(cheer * 1.3, 0, 1) : 0;
    mass.pose(t, up);
    fgCrowd.pose(t, up * 0.6);
    for (const f of featured) {
      const p = f.p;
      p.g.position.y = f.y + up * (0.3 + 0.2 * Math.sin(t * 9 + f.ph));
      const raise = up * (2.3 + 0.4 * Math.sin(t * 11 + f.ph));
      const ar = p.arms || [];
      for (let i = 0; i < ar.length; i++) {
        ar[i].pivot.rotation.z = (i ? -1 : 1) * (0.2 + raise);
        ar[i].pivot.rotation.x = -1.2 + up * 1.0;
      }
    }
    for (const b of banners) {
      b.m.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.02;
      b.m.position.x += Math.sin(t * 0.5 + b.ph) * 0.0006;
    }
    // the flashes: more of them, and brighter, when something happened
    const rate = 0.9 + up * 9;
    for (let i = 0; i < 40; i++) {
      const s = fSpots[i];
      s.on -= dt;
      if (s.on < -0.02 && Math.random() < rate * dt * 0.25) s.on = 0.05 + Math.random() * 0.06;
      const k = s.on > 0 ? 1 : 0;
      fm.makeScale(k, k, k);
      fm.setPosition(s.x, s.y, s.z);
      flash.setMatrixAt(i, fm);
    }
    flash.instanceMatrix.needsUpdate = true;
  });

  return finish(group, upd, () => cheer, (v) => { cheer = v; }, (dt) => { t += dt; return t; }, scoreboards);
}

// =====================================================================
// THE STREET
// =====================================================================
//
// The one he asked for by name. A fenced blacktop with a city block
// behind it, and enough going on in that block that the eye has somewhere
// to go between possessions.
// =====================================================================
function buildStreet(C, opts) {
  const seed = opts.seed === undefined ? 5 : opts.seed;
  const R = rng(seed);
  const group = new THREE.Group();
  const cx = (C.x0 + C.x1) / 2;
  const gr = groundRect(C);
  const LX0 = gr.x0 - 10, LX1 = gr.x1 + 10;
  const LW = LX1 - LX0;
  const upd = [];
  let cheer = 0, t = 0;

  // the depths everything sits at, front to back
  const FENCE_Z = C.z0 - 2.6;      // the fence behind the court
  const VERGE_Z = C.z0 - 4.2;      // dirt between fence and pavement
  const PAVE_Z = -10.5;            // near pavement
  const ROAD_Z = -14.5;            // the road
  const PAVE2_Z = -18.2;           // far pavement
  const BLOCK_Z = -20.5;           // where the buildings start

  // ---- sky ---------------------------------------------------------
  //
  // A single painted plane, well behind everything. The tilt means the
  // top of the frame at this depth is barely above the rooftops, so the
  // sky is a narrow band and all of its interest - the sun, the haze, the
  // three clouds - is packed into the part that will actually be seen.
  //
  // The band of this texture that is ever on screen is the middle third
  // of it - v 0.25 to 0.67, worked out from the projection above - so
  // the gradient stops and the sun are placed to land INSIDE that band
  // rather than spread evenly over a plane that is mostly behind the
  // rooftops. First pass had the sun at 0.3 and it was never once
  // visible.
  const skyTex = paint(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.00, '#1d5cb0');
    sky.addColorStop(0.30, '#2f79cc');
    sky.addColorStop(0.46, '#6fa9e2');
    sky.addColorStop(0.62, '#a9cdea');
    sky.addColorStop(0.72, '#dfd6c6');
    sky.addColorStop(0.82, '#f6cf9e');
    sky.addColorStop(1.00, '#f0b878');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // the sun, low and to the left, which is where deck3d's key light is
    const sx = w * 0.30, sy = h * 0.42;
    const gl = g.createRadialGradient(sx, sy, 6, sx, sy, 190);
    gl.addColorStop(0, 'rgba(255,248,222,1)');
    gl.addColorStop(0.12, 'rgba(255,238,186,0.85)');
    gl.addColorStop(0.45, 'rgba(255,226,170,0.25)');
    gl.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = gl; g.fillRect(sx - 200, sy - 200, 400, 400);
    g.fillStyle = '#fffbe8';
    g.beginPath(); g.arc(sx, sy, 26, 0, 6.2832); g.fill();
    // clouds, drawn as overlapping blobs and kept flat-bottomed
    const cloud = (x, y, s, a) => {
      g.save(); g.translate(x, y); g.scale(s, s * 0.62);
      g.fillStyle = 'rgba(255,255,255,' + a + ')';
      g.beginPath();
      for (const b of [[-60, 6, 34], [-22, -10, 44], [18, -2, 38], [54, 10, 28], [0, 14, 40]]) {
        g.moveTo(b[0] + b[2], b[1]); g.arc(b[0], b[1], b[2], 0, 6.2832);
      }
      g.fill();
      g.fillStyle = 'rgba(190,206,226,' + (a * 0.5) + ')';
      g.beginPath();
      for (const b of [[-40, 20, 24], [6, 22, 28], [44, 20, 20]]) {
        g.moveTo(b[0] + b[2], b[1]); g.arc(b[0], b[1], b[2], 0, 6.2832);
      }
      g.fill();
      g.restore();
    };
    cloud(w * 0.55, h * 0.33, 1.0, 0.85);
    cloud(w * 0.80, h * 0.46, 0.8, 0.7);
    cloud(w * 0.16, h * 0.56, 0.6, 0.5);
    cloud(w * 0.40, h * 0.60, 0.5, 0.35);
    cloud(w * 0.95, h * 0.30, 0.7, 0.55);
    // birds
    g.strokeStyle = 'rgba(40,52,68,0.5)'; g.lineWidth = 2;
    for (const b of [[560, 200, 1], [586, 212, 0.8], [604, 192, 0.7]]) {
      g.beginPath();
      g.moveTo(b[0] - 9 * b[2], b[1]); g.quadraticCurveTo(b[0], b[1] - 6 * b[2], b[0] + 9 * b[2], b[1]);
      g.stroke();
    }
  }, 'linear');
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(150, LW + 70), 26),
    new THREE.MeshBasicMaterial({ map: skyTex }));
  sky.position.set(cx, FLOOR - 1.0, -44);
  group.add(sky);
  // and a plain slab of the same blue above it, for the angles this game
  // never uses but a screenshot tool does
  const skyTop = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(150, LW + 70), 40),
    new THREE.MeshBasicMaterial({ color: 0x1d5cb0 }));
  skyTop.position.set(cx, FLOOR + 31.9, -44.1);
  group.add(skyTop);

  // ---- the ground --------------------------------------------------
  group.add(groundPlane(streetGround(C, seed)));

  // the rest of the lot, the verge, the pavements and the road, all as
  // flat slabs of colour under and around the painted part
  const gnd = new Chunk();
  gnd.box(LW + 40, 0.8, 80, '#474c53', cx, FLOOR - 0.4, 12);     // the lot
  gnd.box(LW + 40, 0.82, 4.2, '#4a4436', cx, FLOOR - 0.39, VERGE_Z - 0.9);  // dirt verge
  gnd.box(LW + 40, 0.9, 5.0, '#6f6d68', cx, FLOOR - 0.34, PAVE_Z);          // pavement
  gnd.box(LW + 40, 0.9, 5.0, '#6f6d68', cx, FLOOR - 0.34, PAVE2_Z);
  gnd.box(LW + 40, 0.92, 0.35, '#8a877f', cx, FLOOR - 0.28, PAVE_Z - 2.5);  // kerbs
  gnd.box(LW + 40, 0.92, 0.35, '#8a877f', cx, FLOOR - 0.28, PAVE2_Z + 2.5);
  gnd.box(LW + 40, 0.86, 5.4, '#2d3036', cx, FLOOR - 0.37, ROAD_Z);         // the road
  for (let x = LX0 - 15; x < LX1 + 15; x += 4.2) {                          // its centre line
    gnd.box(2.2, 0.02, 0.14, '#c8bc62', x, FLOOR + 0.07, ROAD_Z);
  }
  // pavement slabs, so it is not one grey stripe
  for (let x = LX0 - 15; x < LX1 + 15; x += 2.2) {
    gnd.box(0.06, 0.03, 4.9, '#5d5b56', x, FLOOR + 0.12, PAVE_Z);
  }
  group.add(gnd.mesh({ receive: true }));

  // ---- THE FENCE ---------------------------------------------------
  //
  // Chain link is a texture with holes in it, not geometry: a real mesh
  // of that gauge is tens of thousands of triangles and reads as a grey
  // smear anyway. alphaTest rather than blending, so it sorts correctly
  // against the crowd standing behind it.
  const linkTex = paint(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineWidth = 3.6; g.lineCap = 'round';
    for (const [col, off] of [['rgba(28,32,36,0.8)', 3], ['rgba(186,192,198,0.95)', 0]]) {
      g.strokeStyle = col;
      for (let i = -2; i < 6; i++) {
        g.beginPath();
        g.moveTo(i * 32 + off, off); g.lineTo(i * 32 + 128 + off, 128 + off); g.stroke();
        g.beginPath();
        g.moveTo(i * 32 + off, 128 + off); g.lineTo(i * 32 + 128 + off, off); g.stroke();
      }
    }
  }, 'linear');
  linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping;

  const FH = 5.6;                                   // how tall the fence is
  const mkFence = (z, x0, x1, h, rep) => {
    const tex = linkTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set((x1 - x0) / 1.35, h / 1.35);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, h),
      new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.42,
        side: THREE.DoubleSide, color: 0xa3abb2 }));
    m.position.set((x0 + x1) / 2, FLOOR + h / 2, z);
    return m;
  };
  group.add(mkFence(FENCE_Z, LX0, LX1, FH));

  const fence = new Chunk();
  const POST = '#767d84';
  for (let x = LX0; x <= LX1 + 0.01; x += 3.0) {
    fence.cyl(0.13, 0.13, FH + 0.3, 8, POST, x, FLOOR + (FH + 0.3) / 2, FENCE_Z);
  }
  fence.box(LX1 - LX0, 0.12, 0.12, POST, (LX0 + LX1) / 2, FLOOR + FH - 0.06, FENCE_Z);
  fence.box(LX1 - LX0, 0.1, 0.1, POST, (LX0 + LX1) / 2, FLOOR + FH * 0.5, FENCE_Z);
  fence.box(LX1 - LX0, 0.1, 0.1, POST, (LX0 + LX1) / 2, FLOOR + 0.12, FENCE_Z);
  // the gate: two leaves, one of them hanging open, because they always are
  const gx = C.rims.length > 1 ? cx + 10 : C.x0 + 2.5;
  fence.cyl(0.16, 0.16, FH + 0.5, 8, '#5f666d', gx - 1.6, FLOOR + (FH + 0.5) / 2, FENCE_Z);
  fence.cyl(0.16, 0.16, FH + 0.5, 8, '#5f666d', gx + 1.6, FLOOR + (FH + 0.5) / 2, FENCE_Z);
  const leaf = (ox, ang) => {
    const g2 = new THREE.Group();
    const f2 = new Chunk();
    f2.box(1.5, 0.09, 0.09, '#9aa1a8', 0.75, 0, 0);
    f2.box(1.5, 0.09, 0.09, '#9aa1a8', 0.75, -3.9, 0);
    f2.box(0.09, 3.9, 0.09, '#9aa1a8', 0.03, -1.95, 0);
    f2.box(0.09, 3.9, 0.09, '#9aa1a8', 1.48, -1.95, 0);
    g2.add(f2.mesh({}));
    const mesh = mkFence(0, 0.03, 1.48, 3.9);
    mesh.position.set(0.75, -1.95, 0);
    g2.add(mesh);
    g2.position.set(ox, FLOOR + 4.1, FENCE_Z);
    g2.rotation.y = ang;
    return g2;
  };
  group.add(leaf(gx - 1.5, 0.0));
  group.add(leaf(gx + 1.5, Math.PI - 0.85));

  // a bulge and a rip in the fence, down at the far end
  fence.strut(2, 0.08, '#9aa1a8', LX1 - 7.6, FLOOR + 2.4, LX1 - 6.1, FLOOR + 3.6, FENCE_Z + 0.08);

  // ---- the near fence, along the bottom of the frame ----------------
  //
  // Only three and a half units tall and twenty units forward, which is
  // exactly as much fence as can stand in front of the court without
  // climbing up the screen and covering it. See the header.
  group.add(mkFence(20, LX0 - 8, LX1 + 8, 3.4));
  for (let x = LX0 - 8; x <= LX1 + 8; x += 3.0) {
    fence.cyl(0.13, 0.13, 3.6, 8, POST, x, FLOOR + 1.8, 20);
  }
  fence.box(LX1 - LX0 + 16, 0.12, 0.12, POST, cx, FLOOR + 3.4, 20);
  fence.box(LX1 - LX0 + 16, 0.1, 0.1, POST, cx, FLOOR + 0.14, 20);
  group.add(fence.mesh({ cast: true }));

  // ---- and what is on this side of it ------------------------------
  //
  // The bottom quarter of the frame is in front of the court and cannot
  // hold anything tall, but it is a long way down the screen: past
  // z = 23 an object can be five units tall and still sit under the
  // baseline. So the near lot gets a hedge, a bench, bikes and a bin,
  // and the frame stops ending in flat tarmac.
  const near = new Chunk();
  const NEAR_X0 = LX0 - 10, NEAR_X1 = LX1 + 10;
  // a kerb, then the grass verge that closes the bottom of the frame
  near.box(NEAR_X1 - NEAR_X0, 0.5, 0.4, '#8a877f', cx, FLOOR + 0.22, 26.6);
  near.box(NEAR_X1 - NEAR_X0, 0.42, 26, '#3a5130', cx, FLOOR + 0.3, 40.2);
  near.box(NEAR_X1 - NEAR_X0, 0.46, 2.6, '#44603a', cx, FLOOR + 0.34, 28.4);
  // bushes along it, in clumps rather than as a hedge - a hedge across
  // the whole width was a green bar, which is worse than nothing
  for (let x = NEAR_X0 + 2; x < NEAR_X1; x += 2.1) {
    if ((x * 7.3 % 1) > 0.55) continue;
    const bh = 1.3 + (x * 13.7 % 1) * 1.1;
    const bz = 31.4 + (x * 3.1 % 1) * 3.0;
    near.box(2.0, bh, 2.0, '#2f4a24', x, FLOOR + bh / 2, bz);
    near.box(1.7, 0.55, 1.7, '#44662d', x, FLOOR + bh - 0.1, bz);
    near.box(1.1, 0.4, 1.1, '#547a36', x + 0.3, FLOOR + bh + 0.15, bz - 0.2);
  }
  // a bench and a bin on the grass, both seen from behind
  const nb = (x, z) => {
    for (const dx of [-1.1, 1.1]) near.box(0.22, 1.1, 0.22, '#3b4048', x + dx, FLOOR + 0.75, z);
    for (let k = 0; k < 3; k++) near.box(2.7, 0.18, 0.3, '#7a5433', x, FLOOR + 1.3, z - 0.4 + k * 0.4);
    for (let k = 0; k < 3; k++) near.box(2.7, 0.3, 0.16, '#7a5433', x, FLOOR + 1.6 + k * 0.36, z + 0.45);
  };
  nb(cx + 7.5, 34.0);
  nb(cx - 11, 35.0);
  near.cyl(0.55, 0.48, 1.5, 10, '#3c6b4a', cx + 10.2, FLOOR + 0.95, 34.0);
  near.cyl(0.6, 0.6, 0.18, 10, '#2c4f37', cx + 10.2, FLOOR + 1.78, 34.0);
  // a lamppost base and a bin this side of the near fence
  near.cyl(0.18, 0.22, 4.4, 8, '#4a5058', cx + 13.5, FLOOR + 2.2, 23.2);
  near.box(0.95, 1.3, 0.95, '#3c6b4a', cx - 4.2, FLOOR + 0.65, 22.6);
  near.box(1.05, 0.16, 1.05, '#2c4f37', cx - 4.2, FLOOR + 1.36, 22.6);
  group.add(near.mesh({ cast: true, receive: true }));

  // ---- THE CITY BLOCK ----------------------------------------------
  //
  // Real boxes, one merged mesh, with their faces papered by a single
  // atlas so a brownstone, a shuttered shop and a painted mural cost one
  // draw call between them.
  const atlas = paint(1024, 1024, (g) => {
    const R2 = rng(seed + 3);
    const tile = (tx, ty, draw) => { g.save(); g.translate(tx * 256, ty * 256); draw(g); g.restore(); };
    const brick = (gg, base, mortar) => {
      gg.fillStyle = mortar; gg.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 5) {
        for (let x = (y / 5) % 2 ? -5 : 0; x < 256; x += 11) {
          gg.fillStyle = base;
          gg.globalAlpha = 0.72 + R2() * 0.28;
          gg.fillRect(x + 1, y + 1, 9, 3);
        }
      }
      gg.globalAlpha = 1;
    };
    const win = (gg, x, y, w, h, lit) => {
      gg.fillStyle = '#20252c'; gg.fillRect(x - 2, y - 2, w + 4, h + 4);
      gg.fillStyle = lit ? '#f2d48c' : (R2() > 0.5 ? '#2c3a4a' : '#1b2430');
      gg.fillRect(x, y, w, h);
      gg.fillStyle = 'rgba(255,255,255,0.13)';
      gg.fillRect(x, y, w, h * 0.42);
      gg.fillStyle = '#39414c';
      gg.fillRect(x, y + h / 2 - 1, w, 2);
      gg.fillRect(x + w / 2 - 1, y, 2, h);
      if (R2() > 0.6) { gg.fillStyle = '#8a3b33'; gg.fillRect(x, y, w, 5); }   // an awning
      gg.fillStyle = '#4a4f57'; gg.fillRect(x - 4, y + h + 2, w + 8, 4);       // the sill
    };
    // 0,0 brownstone, 1,0 brownstone (other brick), 2,0 concrete block
    tile(0, 0, (gg) => {
      brick(gg, '#8a4a34', '#5c3b2e');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) win(gg, 22 + c * 78, 22 + r * 60, 44, 40, R2() > 0.72);
    });
    tile(1, 0, (gg) => {
      brick(gg, '#6d5a4c', '#4a3e36');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) win(gg, 16 + c * 60, 30 + r * 78, 36, 54, R2() > 0.78);
    });
    tile(2, 0, (gg) => {
      gg.fillStyle = '#8e9095'; gg.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 700; i++) {
        gg.fillStyle = 'rgba(0,0,0,' + (R2() * 0.10) + ')';
        gg.fillRect(R2() * 256, R2() * 256, 3, 2);
      }
      for (let y = 0; y < 256; y += 64) { gg.fillStyle = 'rgba(0,0,0,0.18)'; gg.fillRect(0, y, 256, 2); }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) win(gg, 24 + c * 76, 34 + r * 76, 52, 44, R2() > 0.8);
    });
    // 3,0 shuttered shop fronts
    tile(3, 0, (gg) => {
      gg.fillStyle = '#3a3f46'; gg.fillRect(0, 0, 256, 256);
      brick(gg, '#7a4638', '#54382d');
      gg.fillStyle = '#2b3138'; gg.fillRect(0, 150, 256, 106);
      for (let x = 4; x < 256; x += 7) { gg.fillStyle = 'rgba(255,255,255,0.07)'; gg.fillRect(x, 154, 3, 98); }
      gg.fillStyle = '#c8b03a'; gg.fillRect(0, 138, 256, 16);
      gg.fillStyle = '#20242a';
      gg.font = '700 15px ui-monospace,Menlo,Consolas,monospace';
      gg.textAlign = 'center'; gg.fillText('BODEGA  ·  OPEN 24H', 128, 151);
      gg.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 40; i++) gg.fillRect(R2() * 256, 160 + R2() * 90, 10, 3);
    });
    // 0,1 - 1,1 THE MURAL, two tiles wide
    tile(0, 1, (gg) => {
      brick(gg, '#7c4b3a', '#553529');
      gg.fillStyle = 'rgba(16,20,30,0.88)'; gg.fillRect(0, 0, 512, 256);
      // a sunburst behind a ball
      const cx2 = 256, cy2 = 130;
      for (let i = 0; i < 18; i++) {
        gg.fillStyle = i % 2 ? 'rgba(232,140,42,0.55)' : 'rgba(210,84,40,0.45)';
        gg.beginPath(); gg.moveTo(cx2, cy2);
        const a = i / 18 * 6.2832, b = (i + 1) / 18 * 6.2832;
        gg.arc(cx2, cy2, 200, a, b); gg.fill();
      }
      gg.fillStyle = '#e07a2c';
      gg.beginPath(); gg.arc(cx2, cy2, 54, 0, 6.2832); gg.fill();
      gg.strokeStyle = '#20140c'; gg.lineWidth = 4;
      gg.beginPath(); gg.moveTo(cx2 - 54, cy2); gg.lineTo(cx2 + 54, cy2); gg.stroke();
      gg.beginPath(); gg.moveTo(cx2, cy2 - 54); gg.lineTo(cx2, cy2 + 54); gg.stroke();
      gg.beginPath(); gg.arc(cx2 - 74, cy2, 46, -0.9, 0.9); gg.stroke();
      gg.beginPath(); gg.arc(cx2 + 74, cy2, 46, Math.PI - 0.9, Math.PI + 0.9); gg.stroke();
      gg.fillStyle = '#f3e9d6';
      gg.font = '700 40px ui-monospace,Menlo,Consolas,monospace';
      gg.textAlign = 'center';
      gg.fillText('RUN THE BLOCK', cx2, 46);
      gg.font = '700 22px ui-monospace,Menlo,Consolas,monospace';
      gg.fillStyle = '#d8ac4a';
      gg.fillText('EST. 1974  ·  NO BLOOD NO FOUL', cx2, 226);
    });
    // 2,1 a wall of tags
    // A GRUBBY WALL, NOT FIVE LEGIBLE WORDS. One tile gets stamped four
    // times across a wide building, and four copies of "ZEE" in a row
    // announce the wallpaper louder than anything else in the scene. So:
    // small, overlapping, half painted out, and readable as "somebody
    // has been at this wall" rather than as any particular word.
    tile(2, 1, (gg) => {
      brick(gg, '#6a6560', '#4a463f');
      const tags = ['KRX', 'ZEE', 'BOOM', '98', 'ACE', 'TRK', 'VEX', '7TH', 'OZ'];
      for (let i = 0; i < 22; i++) {
        gg.save();
        gg.translate(R2() * 250, 20 + R2() * 220);
        gg.rotate((R2() - 0.5) * 0.7);
        gg.fillStyle = 'hsl(' + ((R2() * 360) | 0) + ',55%,' + (34 + R2() * 26) + '%)';
        gg.font = '700 ' + (11 + R2() * 17) + 'px ui-monospace,Menlo,Consolas,monospace';
        gg.globalAlpha = 0.35 + R2() * 0.35;
        gg.fillText(tags[(R2() * tags.length) | 0], 0, 0);
        gg.restore();
      }
      // painted over in patches, the way a landlord does it
      gg.globalAlpha = 0.75;
      for (let i = 0; i < 9; i++) {
        gg.fillStyle = R2() > 0.5 ? '#6f6a64' : '#5d5a55';
        gg.fillRect(R2() * 220, R2() * 210, 30 + R2() * 60, 24 + R2() * 40);
      }
      gg.globalAlpha = 1;
    });
    // 3,1 a blank painted ad wall
    tile(3, 1, (gg) => {
      brick(gg, '#8a4a34', '#5c3b2e');
      gg.globalAlpha = 0.75;
      gg.fillStyle = '#20304a'; gg.fillRect(12, 20, 232, 150);
      gg.globalAlpha = 1;
      gg.fillStyle = '#e8dcc0';
      gg.font = '700 30px ui-monospace,Menlo,Consolas,monospace';
      gg.textAlign = 'center';
      gg.fillText('OLDIE', 128, 72);
      gg.font = '700 15px ui-monospace,Menlo,Consolas,monospace';
      gg.fillText('CASSETTES · DECKS', 128, 100);
      gg.fillText('CORNER OF 7TH', 128, 126);
      gg.globalAlpha = 0.35;
      for (let i = 0; i < 300; i++) {
        gg.fillStyle = 'rgba(90,60,45,0.5)';
        gg.fillRect(12 + R2() * 232, 20 + R2() * 150, 4, 3);
      }
      gg.globalAlpha = 1;
    });
    // 0,2 THE ROOF. Worth more care than it sounds: the camera looks
    // DOWN, so on a two-storey block it is the rooftops, not the walls,
    // that fill the top of the frame - and the first pass made them one
    // flat grey rectangle the size of a building.
    tile(0, 2, (gg) => {
      gg.fillStyle = '#54565a'; gg.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        gg.fillStyle = R2() > 0.5 ? 'rgba(0,0,0,' + (R2() * 0.35) + ')'
                                  : 'rgba(210,214,220,' + (R2() * 0.18) + ')';
        gg.fillRect(R2() * 256, R2() * 256, 2, 2);
      }
      // tar seams between rolls of felt, and patches over the leaks
      gg.strokeStyle = 'rgba(24,26,29,0.55)'; gg.lineWidth = 3;
      for (let y = 14; y < 256; y += 34) {
        gg.beginPath();
        for (let x = 0; x <= 256; x += 16) gg.lineTo(x, y + Math.sin(x * 0.2 + y) * 1.6);
        gg.stroke();
      }
      for (let i = 0; i < 7; i++) {
        gg.fillStyle = 'rgba(30,32,36,0.4)';
        gg.beginPath();
        gg.ellipse(R2() * 256, R2() * 256, 12 + R2() * 26, 9 + R2() * 18, R2() * 3, 0, 6.2832);
        gg.fill();
      }
      // a skylight and a couple of puddles
      gg.fillStyle = '#6c7076'; gg.fillRect(150, 40, 54, 40);
      gg.fillStyle = '#9fb4c6'; gg.fillRect(154, 44, 46, 32);
      gg.fillStyle = 'rgba(150,170,190,0.22)';
      gg.beginPath(); gg.ellipse(60, 190, 30, 16, 0.3, 0, 6.2832); gg.fill();
    });
  }, 'linear');
  const TILE = 1 / 4;
  // the fourth number of each is not uv - it is "may this be mirrored?".
  // Mirroring a wall of windows is free variety; mirroring the BODEGA
  // sign put "H42 NEPO" over the shop next door.
  const T_BROWN = [0, 3 * TILE, TILE, TILE, 1];
  const T_BRICK2 = [TILE, 3 * TILE, TILE, TILE, 1];
  const T_CONC = [2 * TILE, 3 * TILE, TILE, TILE, 1];
  const T_SHOP = [3 * TILE, 3 * TILE, TILE, TILE, 0];
  const T_MURAL = [0, 2 * TILE, 2 * TILE, TILE, 0];
  const T_TAGS = [2 * TILE, 2 * TILE, TILE, TILE, 0];
  const T_AD = [3 * TILE, 2 * TILE, TILE, TILE, 0];
  const T_ROOF = [0, TILE, TILE, TILE, 1];

  const city = new Chunk();       // the solid masses
  const skin = new Chunk();       // the papered faces
  const detail = new Chunk();     // fire escapes, cornices, tanks

  // A block is: a box, a face quad a hair in front of it, a cornice, and
  // whatever is bolted to the front.
  const buildings = [];
  let bx = LX0 - 14;
  let i = 0;
  while (bx < LX1 + 14) {
    const bw = 6 + R() * 7;
    const tall = R();
    // MOSTLY TWO AND THREE STOREYS, WITH THE ODD TALL ONE. The first
    // pass ran 5 to 15 units and every building filled the frame to the
    // top: no sky, no skyline, just wall. The square on `tall` is what
    // makes tall rare rather than average.
    const bh = 5.6 + tall * tall * 9.0;
    const bz = BLOCK_Z - R() * 5;
    const bd = 6 + R() * 6;
    const face = [T_BROWN, T_BRICK2, T_CONC, T_BROWN, T_SHOP, T_TAGS, T_AD][i % 7];
    const body = ['#7a4230', '#5f5044', '#7d7f84', '#7a4230', '#6d4032', '#5e5a55', '#7a4230'][i % 7];
    buildings.push({ x: bx + bw / 2, w: bw, h: bh, z: bz, d: bd, face, body });
    bx += bw + 0.25 + R() * 0.4;
    i++;
  }
  // PUT THE MURAL WHERE THE CAMERA IS ACTUALLY POINTING. On a half
  // court that is x = -1.6 and not the middle of the floor, which is
  // why the first pass hung the best thing in the scene half off the
  // left edge of the frame.
  // ...and a few units to the LEFT of it, because the ring, its pole and
  // its board stand on the right of a half court and a mural behind them
  // is a mural with a scaffold pole down the middle of it.
  const focus = (C.rims.length > 1 ? cx : -1.6) - 4.5;
  let best = -1, bestScore = -1;
  for (let k = 0; k < buildings.length; k++) {
    const b = buildings[k];
    const d2 = Math.abs(b.x - focus);
    // in frame at all, first; widest and lowest of those, second
    const sc = (d2 < 8 ? 100 : 0) + b.w - d2 * 0.8 - Math.max(0, b.h - 9) * 1.5;
    if (sc > bestScore) { bestScore = sc; best = k; }
  }
  if (best >= 0) { buildings[best].mural = true; buildings[best].face = T_BRICK2; }

  for (const b of buildings) {
    const y0 = FLOOR, top = y0 + b.h;
    city.box(b.w, b.h, b.d, b.body, b.x, y0 + b.h / 2, b.z - b.d / 2);
    // THE FACE. Repeating a 256px tile up a ten unit wall would smear,
    // so the quad is cut into storeys and each storey gets a whole tile.
    {
      const storeys = Math.max(1, Math.round(b.h / 3.4));
      const sh = b.h / storeys;
      // A SHOP FRONT IS NOT A PATTERN. Anything with words on it gets
      // one panel for the whole width, or the same bodega opens twice
      // next door to itself.
      const across = b.face[4] ? Math.max(1, Math.round(b.w / 3.6)) : 1;
      const cwid = b.w / across;
      for (let sI = 0; sI < storeys; sI++) {
        for (let a = 0; a < across; a++) {
          // flip every other panel left to right, which is free and
          // stops a wide wall reading as one tile stamped four times
          const f2 = (b.face[4] && R() > 0.5)
            ? [b.face[0] + b.face[2], b.face[1], -b.face[2], b.face[3]] : b.face;
          skin.quad(cwid, sh, '#ffffff',
            b.x - b.w / 2 + cwid * (a + 0.5), y0 + sh * (sI + 0.5), b.z + 0.03,
            0, 0, 0, f2);
        }
      }
    }
    // THE MURAL IS PAINTED ON THE WALL, NOT INSTEAD OF IT. Giving it the
    // whole face made the building a billboard: no brick, no windows, no
    // edges, and a basketball stretched to whatever shape the wall
    // happened to be. Inset, on its own 2:1 patch, it reads as somebody
    // having painted a gable end - which is the thing being drawn.
    // ANCHORED NEAR THE GROUND, not under the cornice: hung off the top
    // of a five storey building it went straight out of the top of the
    // frame, because the camera's ceiling falls as things get further
    // away. Low on the wall it is in shot whatever the building does.
    if (b.mural) {
      const mh = Math.min((b.w - 1.0) / 2, b.h - 1.6, 5.0);
      const mw = mh * 2;
      skin.quad(mw, mh, '#ffffff', b.x, y0 + 1.0 + mh / 2, b.z + 0.06, 0, 0, 0, T_MURAL);
      detail.box(mw + 0.3, 0.14, 0.12, '#3c3128', b.x, y0 + 0.9, b.z + 0.07);
      detail.box(mw + 0.3, 0.14, 0.12, '#3c3128', b.x, y0 + 1.12 + mh, b.z + 0.07);
    }
    // cornice, roof, and the low parapet round it
    detail.box(b.w + 0.5, 0.45, b.d + 0.4, '#585c62', b.x, top + 0.2, b.z - b.d / 2);
    skin.quad(b.w, b.d, '#ffffff', b.x, top + 0.46, b.z - b.d / 2, -Math.PI / 2, 0, 0, T_ROOF);
    detail.box(b.w, 0.5, 0.2, '#4e5157', b.x, top + 0.7, b.z + 0.05);
    // a fire escape, on the taller ones
    if (b.h > 8 && b.w > 7) {
      const fx = b.x + (R() - 0.5) * (b.w - 5);
      for (let lvl = 1; lvl < Math.floor(b.h / 3.2); lvl++) {
        const ly = y0 + lvl * 3.2;
        detail.box(4.0, 0.1, 1.1, '#2e3238', fx, ly, b.z + 0.55);
        detail.box(4.0, 0.06, 0.06, '#3a3f46', fx, ly + 0.95, b.z + 1.08);
        detail.box(4.0, 0.06, 0.06, '#3a3f46', fx, ly + 0.5, b.z + 1.08);
        for (let k = -2; k <= 2; k++) detail.box(0.06, 1.0, 0.06, '#3a3f46', fx + k, ly + 0.5, b.z + 1.08);
        // the diagonal flight down to the next one
        detail.box(2.9, 0.09, 0.85, '#2e3238', fx + 1.5, ly - 1.55, b.z + 0.75, 0, 0, 0.83);
      }
    }
    // a water tower, on one of them
    if (b.h > 12 && R() > 0.35) {
      const wx = b.x + (R() - 0.5) * (b.w - 3);
      for (const dx of [-0.9, 0.9]) for (const dz of [-0.9, 0.9]) {
        detail.box(0.16, 2.2, 0.16, '#4a3b2c', wx + dx, top + 1.5, b.z - b.d / 2 + dz);
      }
      detail.cyl(1.35, 1.35, 3.0, 12, '#5d452f', wx, top + 4.1, b.z - b.d / 2);
      detail.cyl(0.1, 1.45, 1.0, 12, '#3d2f22', wx, top + 6.1, b.z - b.d / 2);
      detail.box(2.9, 0.1, 0.1, '#33261c', wx, top + 3.3, b.z - b.d / 2 + 1.36);
      detail.box(2.9, 0.1, 0.1, '#33261c', wx, top + 4.9, b.z - b.d / 2 + 1.36);
    }
    // ROOFTOP CLUTTER. On a low block the roof is a big slab of the
    // picture, so it gets what a real one has on it: the stair head, air
    // handling, vents and a chimney.
    const rz = b.z - b.d / 2;
    if (b.d > 10) {
      detail.box(2.6, 2.2, 2.4, '#6b6560', b.x + (R() - 0.5) * (b.w - 4), top + 1.3, rz - 1.4);
      detail.box(2.9, 0.3, 2.7, '#4e5157', b.x + (R() - 0.5) * (b.w - 4), top + 2.5, rz - 1.4);
    }
    for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
      const ux = b.x + (R() - 0.5) * (b.w - 1.6), uz = rz + (R() - 0.5) * (b.d - 2);
      const uw = 0.8 + R() * 0.9;
      detail.box(uw, 0.7, uw * 0.8, '#8d9299', ux, top + 0.55, uz);
      detail.box(uw * 0.9, 0.12, uw * 0.7, '#6f757c', ux, top + 0.95, uz);
    }
    if (R() > 0.4) {
      detail.cyl(0.26, 0.26, 1.5, 8, '#9aa0a6', b.x + (R() - 0.5) * b.w * 0.8, top + 0.95, rz + 1.2);
      detail.cyl(0.36, 0.3, 0.25, 8, '#7d848c', b.x + (R() - 0.5) * b.w * 0.8, top + 1.8, rz + 1.2);
    }
    if (R() > 0.55) {
      detail.box(1.0, 1.8, 1.0, '#6a4a3a', b.x + (R() - 0.5) * b.w * 0.7, top + 1.1, rz - 2.5);
      detail.box(1.2, 0.2, 1.2, '#4a3830', b.x + (R() - 0.5) * b.w * 0.7, top + 2.05, rz - 2.5);
    }
    // aerials and a satellite dish
    if (R() > 0.5) {
      const ax = b.x + (R() - 0.5) * b.w * 0.7;
      detail.box(0.06, 1.6 + R() * 1.4, 0.06, '#3c414a', ax, top + 1.2, b.z - 1.2);
      detail.box(0.9, 0.05, 0.05, '#3c414a', ax, top + 2.0, b.z - 1.2);
      detail.box(0.7, 0.05, 0.05, '#3c414a', ax, top + 1.6, b.z - 1.2);
    }
    if (R() > 0.65) {
      detail.cyl(0.55, 0.55, 0.14, 10, '#b9bcc0',
        b.x + (R() - 0.5) * b.w * 0.6, top + 0.9, b.z - 0.6, 1.1, 0, 0);
    }
    // air conditioners hanging out of a couple of windows
    if (R() > 0.5) {
      detail.box(0.7, 0.5, 0.45, '#9aa0a6',
        b.x + (R() - 0.5) * (b.w - 2), y0 + 3.4 + Math.floor(R() * 2) * 3.4, b.z + 0.28);
    }
  }
  group.add(city.mesh({ receive: true }));
  group.add(detail.mesh({}));
  group.add(skin.mesh({ map: atlas, side: THREE.DoubleSide }));

  // ---- street furniture --------------------------------------------
  const st = new Chunk();
  const lampGlow = new Chunk();
  // streetlights: the head leans out over the road
  for (let x = LX0 - 6; x < LX1 + 8; x += 17) {
    const lx = x + 3;
    st.cyl(0.16, 0.2, 7.6, 8, '#4a5058', lx, FLOOR + 3.8, PAVE_Z - 1.6);
    st.box(0.14, 0.14, 2.6, '#4a5058', lx, FLOOR + 7.5, PAVE_Z - 2.9);
    st.box(0.8, 0.28, 1.5, '#4a5058', lx, FLOOR + 7.3, PAVE_Z - 4.0);
    lampGlow.quad(0.66, 1.3, '#ffe9b0', lx, FLOOR + 7.14, PAVE_Z - 4.0, -Math.PI / 2, 0, 0);
    // a sign strapped to the pole
    st.box(0.9, 0.55, 0.06, '#2e6b3c', lx + 0.5, FLOOR + 5.4, PAVE_Z - 1.45);
  }
  // the hydrant, on the near pavement
  const hx = cx - 6.5;
  st.cyl(0.32, 0.36, 1.1, 10, '#b03028', hx, FLOOR + 0.9, PAVE_Z + 1.3);
  st.cyl(0.24, 0.3, 0.3, 10, '#8d231d', hx, FLOOR + 1.5, PAVE_Z + 1.3);
  st.cyl(0.11, 0.11, 0.26, 8, '#8d231d', hx, FLOOR + 1.62, PAVE_Z + 1.3);
  st.cyl(0.16, 0.16, 0.5, 8, '#8d231d', hx, FLOOR + 1.15, PAVE_Z + 1.3, 0, 0, Math.PI / 2);
  st.box(0.9, 0.16, 0.9, '#5d6168', hx, FLOOR + 0.42, PAVE_Z + 1.3);
  // bins, a mailbox and a bus stop
  st.box(0.9, 1.25, 0.9, '#3c6b4a', cx + 8.5, FLOOR + 0.95, PAVE_Z + 1.2);
  st.box(1.0, 0.16, 1.0, '#2c4f37', cx + 8.5, FLOOR + 1.6, PAVE_Z + 1.2);
  st.box(0.8, 1.15, 0.7, '#2a5c8c', cx - 11.5, FLOOR + 0.9, PAVE_Z + 1.4);
  st.cyl(0.07, 0.07, 3.2, 6, '#5a6068', cx + 13, FLOOR + 1.6, PAVE_Z + 1.4);
  st.box(0.75, 0.55, 0.07, '#c8c3b4', cx + 13, FLOOR + 3.0, PAVE_Z + 1.4);

  // benches, this side of the fence, where you sit and wait for next
  const bench = (x, z) => {
    for (const dx of [-0.85, 0.85]) {
      st.box(0.16, 0.85, 0.16, '#3b4048', x + dx, FLOOR + 0.42, z - 0.3);
      st.box(0.16, 0.85, 0.16, '#3b4048', x + dx, FLOOR + 0.42, z + 0.3);
    }
    for (let k = 0; k < 3; k++) st.box(2.1, 0.13, 0.26, '#7a5433', x, FLOOR + 0.88, z - 0.32 + k * 0.32);
    for (let k = 0; k < 3; k++) st.box(2.1, 0.26, 0.13, '#7a5433', x, FLOOR + 1.15 + k * 0.3, z - 0.45);
  };
  bench(C.x0 + 1.5, C.z0 - 1.3);
  bench(C.x0 + 4.4, C.z0 - 1.3);

  // the boombox, on the deck by the fence
  const boom = new THREE.Group();
  {
    const b2 = new Chunk();
    b2.box(2.0, 1.0, 0.7, '#22262c', 0, 0, 0);
    b2.box(2.05, 0.12, 0.74, '#3a4049', 0, 0.44, 0);
    b2.box(0.62, 0.3, 0.1, '#0e1114', 0, 0.06, 0.36);
    for (let k = 0; k < 5; k++) b2.box(0.06, 0.14, 0.06, '#8d949c', -0.22 + k * 0.11, 0.07, 0.43);
    b2.cyl(0.03, 0.03, 1.1, 6, '#9aa1a8', 0.86, 0.72, 0, 0, 0, -0.25);
    boom.add(b2.mesh({ cast: true }));
    const cone = new Chunk();
    cone.cyl(0.3, 0.3, 0.1, 12, '#15181c', -0.62, 0, 0.36, Math.PI / 2, 0, 0);
    cone.cyl(0.19, 0.19, 0.14, 12, '#2c3138', -0.62, 0, 0.4, Math.PI / 2, 0, 0);
    const cone2 = cone.mesh({});
    boom.add(cone2);
    const cR = new Chunk();
    cR.cyl(0.3, 0.3, 0.1, 12, '#15181c', 0.62, 0, 0.36, Math.PI / 2, 0, 0);
    cR.cyl(0.19, 0.19, 0.14, 12, '#2c3138', 0.62, 0, 0.4, Math.PI / 2, 0, 0);
    const cone3 = cR.mesh({});
    boom.add(cone3);
    boom.position.set(C.x0 + 6.6, FLOOR + 0.5, C.z0 - 1.5);
    boom.rotation.y = -0.2;
    group.add(boom);
    upd.push(() => {
      const p = 1 + Math.sin(t * 9.4) * 0.09 + Math.sin(t * 3.1) * 0.03;
      cone2.scale.set(p, p, 1); cone3.scale.set(p, p, 1);
    });
  }
  // a duffel bag and a spare ball
  st.box(1.2, 0.5, 0.55, '#2f3a4a', C.x0 + 5.3, FLOOR + 0.25, C.z0 - 1.9, 0, 0.3, 0);
  st.cyl(0.13, 0.13, 1.1, 6, '#26303e', C.x0 + 5.3, FLOOR + 0.5, C.z0 - 1.9, 0, 0.3, 0);

  // WEEDS, ONLY WHERE THEY BELONG. Scattered across the open lot they
  // were flat green cards lying in the middle of a basketball court; up
  // against the foot of the fence they are the reason the fence has a
  // foot. Two crossed quads each, so they have a side.
  for (let k = 0; k < 110; k++) {
    const wx = LX0 + R() * LW;
    const h = 0.35 + R() * 0.8;
    const wz = FENCE_Z - 0.3 + R() * 0.55;
    const col = R() > 0.4 ? '#41582c' : '#5c6b33';
    st.quad(0.55, h, col, wx, FLOOR + h / 2, wz, 0, R() * 3, 0);
    st.quad(0.55, h, col, wx, FLOOR + h / 2, wz, 0, R() * 3 + 1.4, 0);
  }
  // and a thin line of them where the lot meets its own edge
  for (let k = 0; k < 40; k++) {
    const wx = gr.x0 + R() * (gr.x1 - gr.x0);
    const h = 0.25 + R() * 0.4;
    st.quad(0.45, h, '#4e6b33', wx, FLOOR + h / 2, 20 - 0.3 + R() * 0.6, 0, R() * 3, 0);
  }
  group.add(st.mesh({ cast: true, receive: true, side: THREE.DoubleSide }));
  group.add(lampGlow.mesh({ basic: true }));

  // ---- the parked cars, and one that goes past ---------------------
  //
  // Three parked at the kerb and one driving, because a street with
  // nothing moving on it is a photograph of a street.
  const carBody = (cc, col, dark) => {
    cc.box(4.4, 0.85, 1.9, col, 0, 0.55, 0);
    cc.box(4.55, 0.35, 1.95, col, 0, 0.3, 0);
    cc.box(2.5, 0.8, 1.75, col, -0.15, 1.3, 0);
    cc.box(2.3, 0.6, 1.8, '#151a22', -0.15, 1.35, 0);          // the glass
    cc.box(2.34, 0.16, 1.84, col, -0.15, 1.66, 0);
    cc.box(4.5, 0.14, 1.96, dark, 0, 0.12, 0);                  // the sill
    cc.box(0.2, 0.3, 1.7, '#d8d2c0', 2.22, 0.62, 0);            // lights
    cc.box(0.2, 0.22, 1.7, '#8c2a22', -2.22, 0.66, 0);
    for (const dx of [-1.45, 1.45]) for (const dz of [-0.95, 0.95]) {
      cc.cyl(0.42, 0.42, 0.28, 10, '#14171c', dx, 0.42, dz, Math.PI / 2, 0, 0);
      cc.cyl(0.2, 0.2, 0.3, 8, '#7d848c', dx, 0.42, dz, Math.PI / 2, 0, 0);
    }
  };
  const parked = new Chunk();
  const carCols = [['#8c2f2a', '#5d1f1c'], ['#25406b', '#16294a'], ['#c3b048', '#8a7a2c'],
                   ['#3c4b4a', '#232e2e'], ['#7d7f86', '#4c4e54']];
  let px = LX0 - 8;
  while (px < LX1 + 8) {
    if (R() > 0.42) {
      const cc = carCols[(R() * carCols.length) | 0];
      const tmp = new Chunk();
      carBody(tmp, cc[0], cc[1]);
      for (const g2 of tmp.list) {
        g2.translate(px, FLOOR, ROAD_Z + 1.5);
        parked.list.push(g2);
      }
    }
    px += 5.4 + R() * 3.4;
  }
  group.add(parked.mesh({ cast: true, receive: true }));

  const mover = new THREE.Group();
  {
    const cc = new Chunk();
    carBody(cc, '#d8b23a', '#96781f');
    cc.box(1.1, 0.35, 0.5, '#f0e2b0', -0.1, 1.85, 0);            // a cab light
    mover.add(cc.mesh({ cast: true }));
    mover.position.set(LX0 - 20, FLOOR, ROAD_Z - 1.4);
    group.add(mover);
  }
  let carX = LX0 - 20;
  upd.push((dt) => {
    carX += dt * 7.5;
    if (carX > LX1 + 24) carX = LX0 - 24;
    mover.position.x = carX;
  });

  // ---- THE BATTERED BOARD ON A POLE --------------------------------
  //
  // Wrapped AROUND whatever half.js has already put there - a slightly
  // bigger board and a fatter pole in the same place - so the park hoop
  // is right whether or not the indoor one has been switched off.
  if (opts.hoops !== false) {
    const plyTex = paint(256, 192, (g, w, h) => {
      const R2 = rng(seed + 9);
      g.fillStyle = '#b9a988'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = 'rgba(' + (R2() > 0.5 ? '120,96,64,' : '220,206,176,') + (R2() * 0.3) + ')';
        g.fillRect(R2() * w, R2() * h, 6 + R2() * 16, 1);
      }
      // the rot at the bottom corners, and the rust off the bolts
      for (const [x, y] of [[0, h], [w, h], [0, 0], [w, 0]]) {
        const gg = g.createRadialGradient(x, y, 4, x, y, 70);
        gg.addColorStop(0, 'rgba(58,44,30,0.75)');
        gg.addColorStop(1, 'rgba(58,44,30,0)');
        g.fillStyle = gg; g.fillRect(x - 70, y - 70, 140, 140);
      }
      g.strokeStyle = '#2a2e33'; g.lineWidth = 7;
      g.strokeRect(4, 4, w - 8, h - 8);
      // the shooter's square, repainted once and chipped since
      g.strokeStyle = '#c9412c'; g.lineWidth = 9;
      g.strokeRect(w * 0.31, h * 0.44, w * 0.38, h * 0.40);
      for (let k = 0; k < 120; k++) {
        g.fillStyle = 'rgba(185,169,136,' + (0.4 + R2() * 0.6) + ')';
        g.fillRect(w * 0.28 + R2() * w * 0.45, h * 0.40 + R2() * h * 0.48, 5, 4);
      }
      // a tag across the corner
      g.save();
      g.translate(w * 0.2, h * 0.24); g.rotate(-0.18);
      g.fillStyle = 'rgba(40,92,160,0.7)';
      g.font = '700 34px ui-monospace,Menlo,Consolas,monospace';
      g.fillText('KRX', 0, 0);
      g.restore();
      for (const [x, y] of [[18, 20], [w - 18, 20], [18, h - 20], [w - 18, h - 20]]) {
        g.fillStyle = '#6a5a42'; g.beginPath(); g.arc(x, y, 6, 0, 6.2832); g.fill();
        g.fillStyle = 'rgba(120,70,30,0.5)';
        g.beginPath(); g.ellipse(x, y + 14, 6, 16, 0, 0, 6.2832); g.fill();
      }
    }, 'linear');
    const ply = new THREE.MeshLambertMaterial({ map: plyTex });
    for (const rim of C.rims) {
      const f = rim.face;
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 4.4), ply);
      bb.position.set(rim.board, C.rimY + 1.2, rim.z);
      bb.castShadow = true;
      group.add(bb);
      const h = new Chunk();
      // THE POLE STOPS AT THE BOARD. It is fat enough to swallow
      // half.js's square post - a 0.34 box needs a radius of 0.25 to
      // disappear inside a cylinder - and no taller than the thing it
      // holds up, which the first pass got wrong by three and a half
      // units of scaffold sticking up into the sky.
      const poleTop = C.rimY + 1.7, poleH = poleTop - FLOOR;
      h.cyl(0.31, 0.35, poleH, 10, '#5a6068', rim.board + f * 0.7, FLOOR + poleH / 2, 0);
      h.cyl(0.36, 0.36, 0.14, 10, '#6c737a', rim.board + f * 0.7, poleTop, 0);
      h.cyl(0.46, 0.5, 0.9, 10, '#4a4f56', rim.board + f * 0.7, FLOOR + 0.45, 0);
      h.box(1.4, 0.55, 1.4, '#6a6f76', rim.board + f * 0.7, FLOOR + 0.15, 0);  // concrete footing
      // the arm, with a brace under it
      h.box(1.5, 0.26, 0.26, '#5a6068', rim.board + f * 0.35, C.rimY + 0.95, 0);
      h.strut(1.6, 0.18, '#5a6068',
        rim.board + f * 0.68, C.rimY - 0.5, rim.board + f * 0.06, C.rimY + 0.9, 0);
      // the brackets that hold the board on
      h.box(0.4, 0.22, 1.9, '#3f454c', rim.board + f * 0.26, C.rimY + 2.1, 0);
      h.box(0.4, 0.22, 1.9, '#3f454c', rim.board + f * 0.26, C.rimY + 0.3, 0);
      // tape and a padlocked chain round the pole, at hand height
      h.cyl(0.38, 0.38, 0.35, 10, '#c2b04a', rim.board + f * 0.7, FLOOR + 2.6, 0);
      group.add(h.mesh({ cast: true, receive: true }));
    }
  }

  // ---- the people watching -----------------------------------------
  //
  // Leaning on the fence, sitting on the bench, waiting for next. Real
  // bodies, because there are few enough of them to be looked at.
  // THEY GO WHERE THE FRAME IS, NOT WHERE THE LOT IS.
  //
  // Each one costs thirteen draw calls, so putting nine of them evenly
  // across forty-nine units of fence - which is what the first pass did
  // - buys two people in shot and pays for nine. A half court's camera
  // never moves, so its watchers are spread across exactly the twenty
  // units it can see; a full court's camera tracks, so there they are
  // spread across the floor.
  const watchers = [];
  const spots = [];
  const foc = C.rims.length > 1 ? cx : -1.6;
  const span = C.rims.length > 1 ? (C.x1 - C.x0 + 8) : 19;
  const wn = C.rims.length > 1 ? 13 : 9;
  for (let k = 0; k < wn; k++) {
    spots.push({ x: foc - span / 2 + (k + 0.3 + R() * 0.5) * span / wn,
                 z: FENCE_Z - 0.55, lean: true });
  }
  // SITTING IS NOT STANDING WITH BENT LEGS. person()'s origin is its
  // FEET and its hips are 1.22 above that, so a body put on the seat
  // hovers a metre over the bench - which is exactly what the first pass
  // did. The origin has to go BELOW the floor for the hips to land on
  // the plank.
  spots.push({ x: C.x0 + 1.5, z: C.z0 - 1.05, sit: true });
  spots.push({ x: C.x0 + 4.4, z: C.z0 - 1.05, sit: true });
  spots.push({ x: C.x0 + 7.6, z: C.z0 - 1.9, lean: false });
  for (const s of spots) {
    // stronger colours than the arena's crowd gets: there are a dozen of
    // these and they stand behind a grey fence, so a muted palette turns
    // them all into the fence
    const p = person(0.5, new THREE.Color().setHSL(
      [0.02, 0.58, 0.12, 0.33, 0.95, 0.08][(R() * 6) | 0], 0.45 + R() * 0.3, 0.3 + R() * 0.22),
      crowdSkin(R));
    const J = jointed(p);
    if (s.lean) {
      // both hands hooked over the fence rail above his head
      J.chest.rotation.x = 0.12;
      for (const a of J.arms) { a.pivot.rotation.x = -0.35; a.pivot.rotation.z = a.side * -0.1; a.fore.rotation.x = -1.45; }
      if (J.legs[0]) J.legs[0].pivot.rotation.x = -0.18;
      if (J.legs[1]) J.legs[1].pivot.rotation.x = 0.16;
    } else if (s.sit) {
      for (const l of J.legs) { l.pivot.rotation.x = -1.4; l.knee.rotation.x = 1.45; }
      for (const a of J.arms) { a.pivot.rotation.x = -0.5; a.fore.rotation.x = -0.6; }
      J.chest.rotation.x = 0.16;
    } else {
      for (const a of J.arms) { a.pivot.rotation.z = a.side * 0.22; a.fore.rotation.x = -0.5; }
    }
    // pose, THEN fold, THEN place - see foldPerson
    foldPerson(p);
    p.g.position.set(s.x, FLOOR + (s.sit ? -0.30 : 0), s.z);
    p.g.rotation.y = (R() - 0.5) * 0.5;
    group.add(noShadow(p.g));
    watchers.push({ p, ph: R() * 6.28, y: p.g.position.y, kind: s.sit ? 'sit' : (s.lean ? 'lean' : 'stand') });
  }

  // ---- a little outdoor light ---------------------------------------
  //
  // deck3d lights this game for an indoor court. One cool hemisphere on
  // top of that is the whole difference between "a gym with the walls
  // taken off" and "outside, in the afternoon".
  const hemi = new THREE.HemisphereLight(0xc6e0ff, 0x8a7048, 0.6);
  group.add(hemi);

  // ---- what moves --------------------------------------------------
  upd.push(() => {
    const up = cheer > 0 ? clamp(cheer * 1.3, 0, 1) : 0;
    for (const wch of watchers) {
      const p = wch.p, s = Math.sin(t * 1.6 + wch.ph);
      p.g.position.y = wch.y + up * (0.35 + 0.2 * Math.sin(t * 9 + wch.ph)) + s * 0.012;
      // only the arm pivots survive the fold, so a cheer is said with
      // those and with the bounce above - which is all it was ever
      // really said with
      if (wch.kind === 'lean') {
        const raise = up * 2.2;
        for (const a of (p.arms || [])) {
          a.pivot.rotation.x = -0.35 - raise * 0.55 + s * 0.03;
          a.pivot.rotation.z = a.side * (-0.1 - raise * 0.35);
        }
      } else if (wch.kind === 'sit') {
        for (const a of (p.arms || [])) { a.pivot.rotation.x = -0.5 - up * 1.9; }
      } else {
        for (const a of (p.arms || [])) {
          a.pivot.rotation.z = a.side * (0.22 + up * 1.6);
          a.pivot.rotation.x = -up * 0.4;
        }
      }
    }
  });

  return finish(group, upd, () => cheer, (v) => { cheer = v; }, (dt) => { t += dt; return t; }, []);
}

// =====================================================================
// the thing every venue hands back
// =====================================================================
function finish(group, upd, getCheer, setCheer, tick, boards = []) {
  let dead = false;
  return {
    group,
    /**
     * The numbers on the venue's own scoreboard. half.js calls this; a
     * venue without a board (the blacktop has no scoreboard, because a
     * blacktop does not) simply has nothing to repaint.
     */
    setScore(home, away, clock, shot) {
      for (const b of boards) {
        const st = b.state;
        if (st.home === home && st.away === away && st.clock === clock && st.shot === shot) continue;
        st.home = home; st.away = away; st.clock = clock; st.shot = shot;
        const c = b.tex.image;
        b.draw(c.getContext('2d'), c.width, c.height);
        b.tex.needsUpdate = true;
      }
    },
    /**
     * @param dt   seconds
     * @param ctx  { ball, scored } - optional, and treated as such: this
     *             is called from a game loop that may not have a ball yet
     */
    step(dt, ctx) {
      if (dead) return;
      const d = (typeof dt === 'number' && dt > 0 && dt < 0.5) ? dt : 1 / 60;
      tick(d);
      let c = getCheer();
      if (c > 0) { c -= d; setCheer(c < 0 ? 0 : c); }
      if (ctx && ctx.scored) setCheer(Math.max(getCheer(), 1.6));
      for (const f of upd) f(d);
    },
    /** a basket went in; n is how good it was */
    cheer(n) {
      const k = typeof n === 'number' && isFinite(n) ? n : 1;
      setCheer(Math.max(getCheer(), clamp(1.2 + k * 0.35, 1.2, 3.2)));
    },
    dispose() {
      dead = true;
      const seen = new Set();
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) {
          if (seen.has(m)) continue;
          seen.add(m);
          for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k]) m[k].dispose();
          m.dispose();
        }
      });
      if (group.parent) group.parent.remove(group);
      group.clear();
    },
  };
}

/**
 * Build one.
 *
 * @param kind  'arena' | 'street'
 * @param C     half.js's court: { id, x0, x1, z0, z1, rimY, arc, check,
 *                                 rims: [{ x, z, board, face }] }
 * @param opts  { seed, hoops }
 */
export function buildVenue(kind, C, opts = {}) {
  const k = VENUES.indexOf(kind) >= 0 ? kind : 'arena';
  return k === 'street' ? buildStreet(C, opts) : buildArena(C, opts);
}
