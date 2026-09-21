// =====================================================================
// HOOPS :: kit.js - THE BODY, WHAT IT WEARS, THE BALL AND THE NET
// =====================================================================
//
// The pieces both modes are built out of. STAND STILL (game.js) has one
// of each; HALF COURT (half.js) has ten people, one ball and the same
// net, so they live here rather than in either mode.
//
// ---------------------------------------------------------------------
// CHIBI. Liam: "upgrade player graphics to a nice chibi low poly".
// ---------------------------------------------------------------------
//
// The old body was a stack of eight boxes in adult proportions - a head a
// seventh of its height - which at the size this camera draws a player is
// a suit on a coat hanger. A chibi is the opposite trade: the head is a
// THIRD of the height and carries all the character (hair, a face, a cap),
// the torso is a rounded barrel, the limbs are short and thick, and the
// hands and shoes are deliberately oversized so they still read from the
// far side of a full court.
//
// THE JOINTS ARE UNCHANGED, and that is not an accident: half.js and
// game.js pose this body every frame through `hips`, `chest`,
// `arms[i].pivot`, `arms[i].fore`, `legs[i].pivot` and `legs[i].knee`,
// rotating them about the same axes. Anything here may change shape; none
// of it may change what those six handles mean.
//
// WHAT HE IS WEARING is an `outfit` object - see DEFAULT_OUTFIT. Two
// kinds, because Liam asked for both: a `jersey` (vest and shorts, team
// colours, number on the back) and `street` (a baggy tee and baggy jeans).
// Everything else - skin, hair, headwear, shoes, socks, wristband - is
// picked from the lists below, which is what the wardrobe on the home
// screen is choosing from.
import { THREE, mat, box, paint, rnd, pick } from '../_deck/deck3d.js';

// how high the hips sit, in body units. EXPORTED because the poses in
// half.js and game.js set `hips.position.y` themselves, and a chibi has
// shorter legs than the old body did - if the two ever disagree he stands
// with his feet through the floor or hovering above it.
export const HIP_Y = 0.94;

export const HAIRS = ['short', 'fade', 'afro', 'bun', 'bald'];
export const HEADWEAR = ['none', 'headband', 'cap', 'beanie'];
export const SKINS = ['#f2c9a0', '#e0a87a', '#c68642', '#8d5524', '#5c3317', '#3d2314'];
export const HAIR_COLS = ['#1b1410', '#3a2a1b', '#6b4423', '#b07a3c', '#d9d2c5', '#1f6f8b'];
export const SHOE_COLS = ['#f4f4f6', '#15181f', '#e8392e', '#2f7de0', '#35d07f', '#f2c200'];
export const TEE_COLS = ['#f4f4f6', '#15181f', '#e8392e', '#2f7de0', '#35d07f', '#f2c200', '#a259ff', '#ff7a00'];
export const JEAN_COLS = ['#3b5f8a', '#25405e', '#6f7d8c', '#2b2f36', '#8a7a5e'];
// what can be printed on a jersey. Bought in the shop - see wardrobe.js.
export const DESIGNS = ['plain', 'stripe', 'hoops', 'flame', 'camo'];

export const DEFAULT_OUTFIT = {
  kind: 'jersey',            // 'jersey' | 'street'
  design: 'plain',           // what is printed on it: see DESIGNS
  shirt: '#e8392e',          // vest or tee
  trim: '#f4f4f6',           // piping, waistband, tee sleeve band
  jeans: '#3b5f8a',          // street only
  skin: '#c68642',
  hair: 'short',
  hairCol: '#1b1410',
  head: 'none',              // headband / cap / beanie
  headCol: '#15181f',
  shoes: '#f4f4f6',
  socks: '#f4f4f6',
  band: false,               // a wristband
  number: 7,
};

/** a random one, for the crowd and for bots that have not been dressed */
export function randomOutfit(kind = 'jersey', shirtCol) {
  return {
    ...DEFAULT_OUTFIT, kind,
    shirt: shirtCol || pick(TEE_COLS),
    trim: pick(['#f4f4f6', '#15181f', '#f2c200']),
    jeans: pick(JEAN_COLS),
    skin: pick(SKINS),
    hair: pick(HAIRS), hairCol: pick(HAIR_COLS),
    head: pick(['none', 'none', 'none', 'headband', 'cap', 'beanie']),
    headCol: pick(TEE_COLS),
    shoes: pick(SHOE_COLS), socks: pick(['#f4f4f6', '#15181f']),
    band: Math.random() < 0.3,
    number: 1 + Math.floor(Math.random() * 40),
  };
}

const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
const shade = (c, d) => col(c).clone().offsetHSL(0, 0, d);

/** a low-poly rounded lump: a sphere at eight segments, squashed to shape */
function blobGeo(w, h, d) {
  const g = new THREE.SphereGeometry(0.5, 8, 6);
  g.scale(w, h, d);
  return g;
}
const blob = (w, h, d, material) => new THREE.Mesh(blobGeo(w, h, d), material);

/** the face: eyes, brows and a mouth, painted so the head stays two triangles deep */
function faceTexture(skinCol) {
  return paint(64, 64, (g) => {
    g.fillStyle = '#' + col(skinCol).getHexString();
    g.fillRect(0, 0, 64, 64);
    // the eyes sit on the front quarter of the sphere's wrap
    // SMALL EYES, WIDE APART, WELL CLEAR OF THE BROWS. The first pass had
    // big ellipses with a heavy brow a few pixels above them, and at the
    // size a player is drawn the two merged into one dark band - every man
    // on the floor appeared to be wearing sunglasses.
    g.fillStyle = '#15181f';
    g.beginPath(); g.ellipse(25, 31, 2.6, 3.4, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(39, 31, 2.6, 3.4, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(25.9, 29.8, 1.0, 1.2, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(39.9, 29.8, 1.0, 1.2, 0, 0, 7); g.fill();
    // a light brow, and a smile
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(21, 23.5); g.lineTo(28.5, 22.5); g.moveTo(35.5, 22.5); g.lineTo(43, 23.5); g.stroke();
    g.strokeStyle = 'rgba(60,20,10,0.55)'; g.lineWidth = 1.8;
    g.beginPath(); g.arc(32, 36, 4.6, 0.35, Math.PI - 0.35); g.stroke();
  });
}

/**
 * THE PRINT ON A JERSEY. The torso is a squashed sphere, so its texture
 * wraps round it - which means a stripe drawn down the middle of the
 * canvas runs down his front, and a band across it runs round his chest.
 * That is the whole trick; the designs below are four rectangles each.
 */
function shirtTexture(o) {
  return paint(64, 64, (g) => {
    const base = '#' + col(o.shirt).getHexString();
    const trim = '#' + col(o.trim).getHexString();
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    if (o.design === 'stripe') {
      g.fillStyle = trim;
      g.fillRect(26, 0, 5, 64); g.fillRect(34, 0, 5, 64);
    } else if (o.design === 'hoops') {
      g.fillStyle = trim;
      g.fillRect(0, 18, 64, 7); g.fillRect(0, 38, 64, 7);
    } else if (o.design === 'flame') {
      for (let i = 0; i < 10; i++) {
        g.fillStyle = i % 2 ? trim : '#' + col(o.shirt).clone().offsetHSL(0, 0, -0.18).getHexString();
        g.beginPath();
        g.moveTo(i * 7, 64); g.lineTo(i * 7 + 4, 40 + (i % 3) * 6); g.lineTo(i * 7 + 8, 64);
        g.closePath(); g.fill();
      }
    } else if (o.design === 'camo') {
      for (let i = 0; i < 26; i++) {
        g.fillStyle = i % 3 === 0 ? trim : '#' + col(o.shirt).clone().offsetHSL(0, 0, (i % 2 ? 0.1 : -0.13)).getHexString();
        g.beginPath();
        g.ellipse(Math.random() * 64, Math.random() * 64, 5 + Math.random() * 7, 4 + Math.random() * 5, Math.random() * 3, 0, 7);
        g.fill();
      }
    }
  });
}

/** the number on the back of a jersey */
function numberTexture(shirtCol, trimCol, number) {
  return paint(64, 64, (g) => {
    g.fillStyle = '#' + col(shirtCol).getHexString();
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#' + col(trimCol).getHexString();
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(number), 32, 34);
  });
}

const FACE_CACHE = new Map(), NUM_CACHE = new Map();
const faceMap = (c) => {
  const k = '' + c;
  if (!FACE_CACHE.has(k)) FACE_CACHE.set(k, faceTexture(c));
  return FACE_CACHE.get(k);
};
const numMap = (s, t, n) => {
  const k = s + '|' + t + '|' + n;
  if (!NUM_CACHE.has(k)) NUM_CACHE.set(k, numberTexture(s, t, n));
  return NUM_CACHE.get(k);
};

/**
 * A CHIBI PERSON, at any scale, with joints that turn.
 *
 * Sizes are in units of `scale * 2`, so scale 0.5 is a body about 2.2
 * units tall with its hips at HIP_Y - which is what the players and the
 * crowd have always been built at.
 *
 * `outfit` is optional: without it he gets a jersey in `shirtCol` and the
 * skin colour given, which is exactly what every existing call expects.
 */
export function person(scale, shirtCol, skinCol, outfit) {
  const g = new THREE.Group();
  const S = scale * 2;
  const o = { ...DEFAULT_OUTFIT, ...(outfit || {}) };
  if (shirtCol !== undefined && shirtCol !== null && !outfit) o.shirt = shirtCol;
  if (skinCol !== undefined && skinCol !== null && !outfit) o.skin = skinCol;
  const street = o.kind === 'street';

  // a printed jersey needs its own texture; a plain one is a flat colour
  const printed = !street && o.design && o.design !== 'plain';
  const shirtM = printed ? new THREE.MeshLambertMaterial({ map: shirtTexture(o) }) : mat(col(o.shirt));
  const trimM = mat(col(o.trim));
  const legM = mat(street ? col(o.jeans) : shade(o.shirt, -0.16));
  const skinM = mat(col(o.skin));
  const headM = new THREE.MeshLambertMaterial({ map: faceMap(o.skin) });
  const hairM = mat(col(o.hairCol));
  const shoeM = mat(col(o.shoes));
  const sockM = mat(col(o.socks));
  const hatM = mat(col(o.headCol));

  const hips = new THREE.Group(); g.add(hips);
  const chest = new THREE.Group(); hips.add(chest);

  // ---- TORSO: a rounded barrel, wider at the shoulders -------------------
  const torso = blob(0.78 * S, 0.66 * S, 0.50 * S, shirtM);
  torso.position.y = 0.30 * S;
  chest.add(torso);
  if (street) {
    // a tee hangs loose over the waist, with short sleeves at the shoulder
    const hem = blob(0.80 * S, 0.30 * S, 0.54 * S, shirtM);
    hem.position.y = 0.12 * S;
    chest.add(hem);
    for (const s of [-1, 1]) {
      const sl = blob(0.26 * S, 0.26 * S, 0.34 * S, shirtM);
      sl.position.set(s * 0.40 * S, 0.40 * S, 0);
      chest.add(sl);
    }
  } else {
    // a vest: shoulder straps and a piped neck
    for (const s of [-1, 1]) {
      const strap = box(0.12 * S, 0.30 * S, 0.30 * S, trimM);
      strap.position.set(s * 0.26 * S, 0.52 * S, 0);
      chest.add(strap);
    }
    const waist = blob(0.80 * S, 0.16 * S, 0.52 * S, trimM);
    waist.position.y = 0.06 * S;
    chest.add(waist);
    // the number, on a panel across the back
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.44 * S, 0.34 * S),
      new THREE.MeshLambertMaterial({ map: numMap(o.shirt, o.trim, o.number) }));
    num.position.set(0, 0.34 * S, -0.26 * S);
    num.rotation.y = Math.PI;
    chest.add(num);
  }

  // ---- HEAD: a third of him, and where all the character is --------------
  const head = new THREE.Group();
  head.position.y = 0.90 * S;
  chest.add(head);
  const skull = blob(0.86 * S, 0.84 * S, 0.80 * S, headM);
  // WHERE THE FACE ENDS UP. A sphere wraps its texture starting at +X, so
  // the painted face looked out of the side of his head; a quarter turn
  // brings it round to +Z, which is where the camera and the ring are.
  skull.rotation.y = -Math.PI / 2;
  head.add(skull);
  const ear = (s) => { const e = blob(0.08 * S, 0.16 * S, 0.12 * S, skinM); e.position.set(s * 0.44 * S, -0.02 * S, -0.06 * S); head.add(e); };
  ear(-1); ear(1);

  if (o.hair !== 'bald') {
    if (o.hair === 'afro') {
      const a = blob(1.02 * S, 0.86 * S, 0.98 * S, hairM);
      a.position.y = 0.16 * S;
      head.add(a);
    } else {
      // a cap of hair over the crown, with a fringe at the front
      const cap = blob(0.88 * S, 0.56 * S, 0.84 * S, hairM);
      cap.position.y = 0.26 * S;
      head.add(cap);
      if (o.hair === 'short' || o.hair === 'fade') {
        const fringe = box(0.72 * S, 0.14 * S, 0.12 * S, hairM);
        fringe.position.set(0, 0.26 * S, 0.38 * S);
        head.add(fringe);
      }
      if (o.hair === 'bun') {
        const bun = blob(0.30 * S, 0.30 * S, 0.30 * S, hairM);
        bun.position.set(0, 0.34 * S, -0.40 * S);
        head.add(bun);
      }
    }
  }
  if (o.head === 'headband') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * S, 0.45 * S, 0.12 * S, 10), hatM);
    b.position.y = 0.22 * S;
    head.add(b);
  } else if (o.head === 'beanie') {
    const b = blob(0.92 * S, 0.66 * S, 0.88 * S, hatM);
    b.position.y = 0.24 * S;
    head.add(b);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.47 * S, 0.47 * S, 0.14 * S, 10), shade(o.headCol, -0.08) === undefined ? hatM : mat(shade(o.headCol, -0.08)));
    rim.position.y = 0.10 * S;
    head.add(rim);
  } else if (o.head === 'cap') {
    const crown = blob(0.90 * S, 0.60 * S, 0.86 * S, hatM);
    crown.position.y = 0.26 * S;
    head.add(crown);
    const peak = box(0.62 * S, 0.06 * S, 0.40 * S, hatM);
    peak.position.set(0, 0.16 * S, 0.44 * S);
    head.add(peak);
  }

  // ---- ARMS: short, thick, with big hands --------------------------------
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.44 * S, 0.50 * S, 0);
    const upper = blob(0.24 * S, 0.46 * S, 0.24 * S, street ? shirtM : skinM);
    upper.position.y = -0.20 * S;
    pivot.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.40 * S;
    const lower = blob(0.22 * S, 0.42 * S, 0.22 * S, skinM);
    lower.position.y = -0.18 * S;
    fore.add(lower);
    const hand = blob(0.28 * S, 0.26 * S, 0.24 * S, skinM);
    hand.position.y = -0.40 * S;
    fore.add(hand);
    if (o.band) {
      const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * S, 0.13 * S, 0.08 * S, 8), trimM);
      wb.position.y = -0.30 * S;
      fore.add(wb);
    }
    pivot.add(fore);
    chest.add(pivot);
    arms.push({ pivot, fore, side: s });
  }

  // ---- LEGS: short, and baggy if he is in jeans --------------------------
  const legs = [];
  const wide = street ? 1.35 : 1;
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.20 * S, 0, 0);
    const thigh = blob(0.30 * S * wide, 0.48 * S, 0.32 * S * wide, legM);
    thigh.position.y = -0.22 * S;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44 * S;
    const shin = blob(0.26 * S * wide, 0.46 * S, 0.28 * S * wide, street ? legM : sockM);
    shin.position.y = -0.22 * S;
    knee.add(shin);
    if (!street) {
      // the sock tops, which is most of what says basketball
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * S, 0.15 * S, 0.16 * S, 8), trimM);
      sock.position.y = -0.34 * S;
      knee.add(sock);
    }
    const shoe = blob(0.34 * S, 0.22 * S, 0.52 * S, shoeM);
    shoe.position.set(0, -0.48 * S, 0.08 * S);
    knee.add(shoe);
    const sole = box(0.34 * S, 0.07 * S, 0.50 * S, mat(shade(o.shoes, -0.35)));
    sole.position.set(0, -0.55 * S, 0.08 * S);
    knee.add(sole);
    pivot.add(knee);
    hips.add(pivot);
    legs.push({ pivot, knee, side: s });
  }

  hips.position.y = HIP_Y * S;
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  return { g, hips, chest, arms, legs, head, scale, outfit: o, height: 2.2 * scale };
}

/** the ball's skin: leather, seams, and the two side arcs */
export function ballTexture() {
  return paint(64, 64, (g) => {
    g.fillStyle = '#e07a2c'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.06) + ')';
      g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
    }
    g.strokeStyle = '#2a1a10'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
    g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke();
    g.beginPath(); g.arc(4, 32, 22, -1, 1); g.stroke();
    g.beginPath(); g.arc(60, 32, 22, Math.PI - 1, Math.PI + 1); g.stroke();
  });
}

/** the boards: planks with a grain, used for the floor and the backboard */
export function boardTexture(repX = 8, repY = 3) {
  const t = paint(128, 128, (g) => {
    g.fillStyle = '#c99a5b'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y, 128, 1.5);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(90,60,30,' + (0.05 + Math.random() * 0.08) + ')';
        g.fillRect(Math.random() * 128, y + Math.random() * 15, 6 + Math.random() * 20, 1);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

/**
 * THE NET, as twelve strands of beads.
 *
 * Verlet points: each bead remembers where it was, moves by the
 * difference, and is then pulled back to the bead above it and to its
 * neighbours round the ring. The ball pushes them out of its way.
 */
export function makeNet(rimR, strands = 12, rows = 5) {
  const pts = [], links = [];
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < strands; s++) {
      const a = s / strands * Math.PI * 2;
      const rad = rimR * (1 - r * 0.11);
      const p = new THREE.Vector3(Math.cos(a) * rad, -r * 0.24, Math.sin(a) * rad);
      pts.push({ p, old: p.clone(), pinned: r === 0 });
    }
  }
  const idx = (r, s) => r * strands + ((s + strands) % strands);
  for (let r = 0; r < rows; r++) for (let s = 0; s < strands; s++) {
    if (r > 0) links.push([idx(r - 1, s), idx(r, s), pts[idx(r - 1, s)].p.distanceTo(pts[idx(r, s)].p)]);
    links.push([idx(r, s), idx(r, s + 1), pts[idx(r, s)].p.distanceTo(pts[idx(r, s + 1)].p)]);
  }
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(strands * (rows - 1) * 2 * 3 + strands * rows * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xf4f1e8, transparent: true, opacity: 0.9 }));

  function step(dt, ballLocal, ballR = 0.42) {
    const damp = 0.985;
    for (const n of pts) {
      if (n.pinned) continue;
      const vx = (n.p.x - n.old.x) * damp, vy = (n.p.y - n.old.y) * damp, vz = (n.p.z - n.old.z) * damp;
      n.old.copy(n.p);
      n.p.x += vx; n.p.y += vy - 9 * dt * dt * 60; n.p.z += vz;
    }
    if (ballLocal) {
      for (const n of pts) {
        if (n.pinned) continue;
        const d = n.p.distanceTo(ballLocal);
        if (d < ballR + 0.05 && d > 0.0001) {
          n.p.addScaledVector(n.p.clone().sub(ballLocal).normalize(), ballR + 0.05 - d);
        }
      }
    }
    for (let k = 0; k < 3; k++) {
      for (const [i, j, rest] of links) {
        const a = pts[i], c = pts[j];
        const d = a.p.distanceTo(c.p);
        if (d < 0.0001) continue;
        const diff = (d - rest) / d * 0.5;
        const dx = (c.p.x - a.p.x) * diff, dy = (c.p.y - a.p.y) * diff, dz = (c.p.z - a.p.z) * diff;
        if (!a.pinned) { a.p.x += dx; a.p.y += dy; a.p.z += dz; }
        if (!c.pinned) { c.p.x -= dx; c.p.y -= dy; c.p.z -= dz; }
      }
    }
    let k = 0;
    const put = (v) => { arr[k++] = v.x; arr[k++] = v.y; arr[k++] = v.z; };
    for (let r = 0; r < rows; r++) for (let s = 0; s < strands; s++) {
      if (r > 0) { put(pts[idx(r - 1, s)].p); put(pts[idx(r, s)].p); }
      put(pts[idx(r, s)].p); put(pts[idx(r, s + 1)].p);
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { mesh, step, pts };
}

export function kitColours(teamHue, i) {
  return {
    shirt: new THREE.Color().setHSL(teamHue, 0.55, 0.42 + (i % 3) * 0.05),
    skin: new THREE.Color().setHSL(rnd(0.05, 0.11), 0.38, rnd(0.34, 0.68)),
  };
}
