// CREATURE SPRITE ENGINE. Builds a pixel monster from a body PLAN plus attachable PARTS,
// a palette and a size class. Pure JS (no DOM): returns Grids that sprites.js turns into
// canvases, and that tools/check.mjs can rasterise in node.
//
// Pipeline per frame: plan -> anchors (body, head, legs, arms, tail, back line, wings) ->
// parts drawn back-to-front, each in its own LAYER. A layer is filled flat, gets patterns,
// gets edge shading (light from the top-left), and is composited with a darker "seam" line
// where it overlaps what is already drawn. Then the face is drawn and the whole sprite gets
// an outer outline. All 9 frames are cropped to their shared bounding box.
// Sprites face RIGHT. Coordinates below are in a 32-unit "base box" (ground at y=27.5)
// scaled by k = sizePx / 32.
import { Grid, mix, dk, lt, luma } from './pix.js';

export const SIZES = { tiny: 24, small: 32, medium: 40, large: 48, huge: 56 };
export const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge'];
export const HITBOX = { tiny: 5, small: 6.5, medium: 8, large: 9.5, huge: 11 };
export const FRAMES = ['idle0', 'idle1', 'blink', 'walk0', 'walk1', 'walk2', 'walk3', 'atk', 'hurt'];
const G = 27.5; // ground line in base units

export const PLANS = {
  biped: 'Upright chibi: big head on a small round body, two stubby legs, nub arms.',
  quadruped: 'Four legs, long horizontal body, head out front on a short neck (dog, cat, deer, lion).',
  serpent: 'Legless coil lying on the ground, rising into a raised neck and head. Slithers.',
  flyer: 'Bird/bat body that hovers; wings flap every frame, tiny tucked feet.',
  floater: 'Fish or jelly: hovering oval body with the face on the body (no separate head).',
  blob: 'Squishy dome sitting on the ground, face on the body. Squashes and stretches.',
  insect: 'Three segments (abdomen, thorax, head) on six thin legs. Antennae by default.',
  plant: 'Rooted bulb in the ground, a stem, leaf arms and a flower/bulb head. Hops and sways.',
  golem: 'Boxy rock torso with a small sunken head, huge fists and short thick legs.',
  ghost: 'Round head-body that trails into a wispy tail. Floats, no legs.',
  shell: 'Turtle: big dome shell over a low body, head poking out front, four stubby legs.',
  dragon: 'Upright reptile: thick hind legs, small arms, long neck and heavy tapering tail.',
};
export const HEADLESS = new Set(['blob', 'floater', 'ghost']);
export const FLOATING = new Set(['flyer', 'floater', 'ghost']);

export const PLAN_DEFAULTS = {
  biped: { head: 'round', eyes: 'round', mouth: 'smile', cheeks: 'blush' },
  quadruped: { head: 'muzzle', eyes: 'round', mouth: 'smile', cheeks: 'none' },
  serpent: { head: 'round', eyes: 'round', mouth: 'smile', cheeks: 'none' },
  flyer: { head: 'beaked', eyes: 'round', mouth: 'beak', wings: 'feather', tail: 'fan', cheeks: 'none' },
  floater: { head: 'none', eyes: 'round', mouth: 'smile', fins: 'side', tail: 'fin', cheeks: 'blush' },
  blob: { head: 'none', eyes: 'round', mouth: 'smile', cheeks: 'blush' },
  insect: { head: 'round', eyes: 'compound', mouth: 'none', ears: 'antenna', cheeks: 'none' },
  plant: { head: 'bulb', eyes: 'round', mouth: 'smile', cheeks: 'blush' },
  golem: { head: 'block', eyes: 'glowing', mouth: 'none', claws: 'mitts', cheeks: 'none' },
  ghost: { head: 'none', eyes: 'round', mouth: 'smile', cheeks: 'none' },
  shell: { head: 'round', eyes: 'round', mouth: 'smile', shell: 'dome', cheeks: 'none' },
  dragon: { head: 'long', eyes: 'fierce', mouth: 'fangs', wings: 'bat', tail: 'none', cheeks: 'none' },
};

export const BUILDS = {
  normal: { w: 1, h: 1, head: 1, legs: 1 },
  chubby: { w: 1.15, h: 1.05, head: 1, legs: 0.85 },
  slim: { w: 0.85, h: 1, head: 0.95, legs: 1.1 },
  long: { w: 1.22, h: 0.9, head: 0.95, legs: 0.95 },
  stocky: { w: 1.1, h: 0.95, head: 0.95, legs: 0.7 },
  leggy: { w: 0.92, h: 0.95, head: 0.95, legs: 1.45 },
  bighead: { w: 0.9, h: 0.9, head: 1.2, legs: 0.9 },
  tall: { w: 0.9, h: 1.2, head: 1, legs: 1.1 },
};

// Every part slot and every legal value, with what it looks like. tools/check.mjs and
// SPECIES_GUIDE.md both read this table.
export const PARTS = {
  head: {
    round: 'Big round chibi head.', wide: 'Wide, squat head.', tall: 'Tall egg-shaped head.',
    fox: 'Round head with a pointed snout and black nose.', muzzle: 'Round head with a soft belly-coloured muzzle (dog/bear).',
    frog: 'Wide flat head, eyes sit on top bumps.', block: 'Chamfered square head (robot/rock).',
    bulb: 'Onion-shaped head with a pointed top.', beaked: 'Small round bird head (pair with mouth: beak).',
    long: 'Reptile head with a long snout and nostril.', none: 'No head: face on the body (forced for blob, floater, ghost).',
  },
  eyes: {
    round: 'Classic chibi eyes with a white glint.', sparkle: 'Big anime eyes, coloured iris, two glints.',
    sleepy: 'Half-closed lidded eyes.', fierce: 'Small eyes under angry slanted brows.',
    compound: 'Big faceted bug eyes in the eye colour.', cyclops: 'One huge eye in the middle.',
    glowing: 'Solid glowing eyes, no pupil.', dot: 'Tiny beady eyes.', happy: '^ ^ closed happy eyes.',
  },
  mouth: {
    smile: 'Small v smile.', cat: 'w-shaped cat mouth.', fangs: 'Line mouth with two white fangs.',
    beak: 'Bird beak pointing forward.', tusks: 'Two tusks poking up from the lower jaw.',
    grin: 'Wide grin full of teeth.', tongue: 'Smile with the tongue out.', none: 'No mouth.',
  },
  cheeks: { blush: 'Pink blush marks.', spark: 'Round electric cheek pouches.', freckles: 'Three freckle dots.', none: 'Nothing.' },
  ears: {
    cat: 'Pointed triangle ears.', bunny: 'Long upright rabbit ears.', round: 'Round mouse/bear ears.',
    floppy: 'Ears that hang down the sides.', fin: 'Ribbed fin-ears.', leaf: 'Leaf-shaped ears with a midrib.',
    bat: 'Huge pointy bat ears.', tuft: 'Feathery owl tufts.', antenna: 'Two antennae with glowing tips.', none: 'No ears.',
  },
  horns: {
    single: 'One unicorn horn on the forehead.', twin: 'Two short horns on top.', ram: 'Curled ram horns on the sides.',
    bull: 'Horns that go out sideways then up.', stubs: 'Two tiny nubs.', crystal: 'A crystal cluster on top.', none: 'None.',
  },
  antlers: { branch: 'Deer antlers with tines.', paddle: 'Broad flat moose-style antlers.', twig: 'Little wooden twigs with a leaf.', none: 'None.' },
  crest: {
    tuft: 'Three-feather plume.', fin: 'Ribbed fin on the head.', flame: 'A fire on the head.', sprout: 'Stem with two leaves.',
    mohawk: 'Row of spikes along the head.', petals: 'Ring of flower petals.', crown: 'Small gold crown.',
    curl: 'A curly cowlick.', cap: 'Acorn cap.', mushroom: 'Big spotted mushroom cap over the head.', none: 'None.',
  },
  mane: { fluffy: 'Round fluffy mane around the head.', spiky: 'Spiky mane.', flame: 'Mane of fire tongues.', leafy: 'Mane of leaves.', none: 'None.' },
  wings: {
    feather: 'Bird wing with darker primary feathers.', bat: 'Membrane wing with finger bones.', bug: 'Two clear veined insect wings.',
    fairy: 'Butterfly wings with spots.', tiny: 'A stubby little wing.', fin: 'Flying-fish fin wing with ribs.',
    flame: 'Wing made of fire tongues.', leaf: 'Big leaf wings.', none: 'None.',
  },
  tail: {
    flame: 'Short tail with a flame on the tip.', leaf: 'Thin stem tail ending in a leaf.', fin: 'Fish tail fin.',
    club: 'Tail ending in a spiked club.', curly: 'Pig-curl tail.', split: 'Forked tail with two barbed prongs.',
    fluffy: 'Big fluffy plume.', bolt: 'Zigzag lightning tail.', stinger: 'Segmented scorpion arc with a stinger.',
    long: 'Long thin tail with a tuft.', fan: 'Fan of tail feathers.', none: 'No tail.',
  },
  fins: {
    dorsal: 'Shark fin on the back.', side: 'Pectoral fin on the side.', both: 'Dorsal + side fins.',
    sail: 'Big ribbed sail along the back.', gills: 'Frilly axolotl gills behind the head.', tentacles: 'Wavy tentacles hanging under the body.', none: 'None.',
  },
  shell: { dome: 'Turtle dome shell with plates.', spiral: 'Snail spiral shell on the back.', plates: 'Armadillo armour bands.', spiky: 'Dome shell with spikes.', none: 'None.' },
  spikes: { back: 'Row of triangle spikes along the back.', quills: 'Many thin porcupine quills.', crystals: 'Crystal shards along the back.', studs: 'Round studs along the back.', none: 'None.' },
  claws: { claws: 'White claws on hands/front feet.', pincers: 'Crab pincers on the arms.', mitts: 'Huge round fists.', scythes: 'Mantis blades on the arms.', none: 'None.' },
  leaves: {
    leaves: 'Leaves sprouting from the back.', petals: 'Petal collar around the neck.', bloom: 'A big flower on the back.',
    vines: 'Vines hanging from the body.', mushrooms: 'Little mushrooms growing on the back.', none: 'None.',
  },
  gem: { forehead: 'Gem on the forehead.', chest: 'Gem on the chest.', tail: 'Gem on the tail tip.', back: 'Gem on the back.', none: 'None.' },
};
// list-valued slots
export const LIST_PARTS = {
  pattern: {
    belly: 'Belly patch (on by default).', plain: 'No belly patch.', spots: 'Spots in palette.spot.', stripes: 'Stripes over the back in palette.pattern.',
    gradient: 'Body fades toward the accent colour at the bottom.', mask: 'Band across the eyes.', socks: 'Leg tips in the accent colour.',
    tipped: 'Tail tip and ear tips in accent2.', rings: 'Ringed tail.', diamonds: 'Diamond marks along the back.',
  },
  extras: { whiskers: 'Whiskers.', brows: 'Thick eyebrows.', nose: 'Dark nose dot.', fluff: 'Chest fluff tuft.', scar: 'Scar over the near eye.' },
};
// parts that define the silhouette (used by the duplicate check)
export const MAIN_PARTS = ['ears', 'horns', 'antlers', 'crest', 'mane', 'wings', 'tail', 'fins', 'shell', 'spikes', 'claws', 'leaves'];

export const PALETTE_KEYS = {
  main: 'REQUIRED. Body colour.', belly: 'REQUIRED. Belly / muzzle colour.', accent: 'REQUIRED. Parts colour (fins, flames, ears inside, shell).',
  accent2: 'Light accent (tips, flame cores). Default: accent lightened.', eye: 'Iris colour (sparkle/compound/glowing use it).',
  horn: 'Horns and antlers. Default ivory.', wing: 'Wing colour. Default main (feather) or accent.', beak: 'Beak. Default orange.',
  gem: 'Gem. Default the type colour.', pattern: 'Stripes / mask / diamonds. Default main darkened.', spot: 'Spots. Default accent.',
  cheek: 'Blush / cheek pouches.', stem: 'Plant stem.', leaf: 'Plant leaf arms. Default: stem lightened.', outline: 'Outer outline. Default main darkened a lot.',
};

// ------------------------------------------------------------------ form resolution
function normParts(plan, ...layers) {
  const out = { ...PLAN_DEFAULTS[plan] };
  for (const L of layers) if (L) for (const [k, v] of Object.entries(L)) out[k] = v == null ? 'none' : v;
  out.pattern = [].concat(out.pattern || []);
  out.extras = [].concat(out.extras || []);
  if (HEADLESS.has(plan)) out.head = 'none';
  return out;
}
function normBuild(b) {
  if (!b) return { ...BUILDS.normal };
  if (typeof b === 'string') return { ...(BUILDS[b] || BUILDS.normal) };
  const o = { ...BUILDS.normal, ...b };
  for (const k of ['w', 'h', 'head', 'legs']) o[k] = Math.max(0.6, Math.min(1.6, +o[k] || 1));
  return o;
}
// Turn a species data object + stage (0 base, 1 evolved) into a fully resolved form.
export function resolveForm(def, stage = 0) {
  const ev = stage ? def.evolved || {} : null;
  const plan = (ev && ev.plan) || def.plan;
  const baseSize = def.size || 'small';
  const size = ev ? ev.size || SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, SIZE_ORDER.indexOf(baseSize) + 1)] : baseSize;
  return {
    name: ev ? ev.name : def.name, plan, size,
    parts: normParts(plan, def.parts, ev && ev.parts),
    palette: { ...def.palette, ...(ev && ev.palette) },
    build: normBuild(ev && ev.build !== undefined ? ev.build : def.build),
    float: FLOATING.has(plan),
  };
}

// ------------------------------------------------------------------ frames
function frameParams(frame) {
  const f = { bob: 0, sq: 0, lean: 0, phase: -1, flap: 0.2, wig: 0, blink: false, atk: false, hurt: false, flick: 0 };
  if (frame === 'idle1') { f.sq = 0.5; f.flap = -0.5; f.wig = 0.6; f.bob = -0.5; f.flick = 1; }
  if (frame === 'blink') f.blink = true;
  if (frame.startsWith('walk')) { const p = +frame[4]; f.phase = p; f.bob = p & 1 ? -1 : 0; f.wig = [0, 1, 0, -1][p]; f.flap = [1, -0.2, -1, -0.2][p]; f.flick = p & 1; }
  if (frame === 'atk') { f.atk = true; f.lean = 2; f.sq = -0.5; f.flap = -1; f.wig = 1; f.flick = 1; }
  if (frame === 'hurt') { f.hurt = true; f.lean = -1.5; f.sq = 0.7; f.flap = 0.8; f.wig = -1; }
  return f;
}

function derivePal(p, typeCol) {
  const main = p.main || '#c0a0d0', accent = p.accent || typeCol;
  return {
    main, belly: p.belly || lt(main, 0.55), accent, accent2: p.accent2 || lt(accent, 0.45),
    eye: p.eye || null, glow: p.eye || lt(typeCol, 0.35), horn: p.horn || '#f4e6c4', wing: p.wing || null,
    beak: p.beak || '#ffb347', gem: p.gem || typeCol, pattern: p.pattern || dk(main, 0.38), spot: p.spot || p.pattern || accent,
    cheek: p.cheek || '#ff8aa8', stem: p.stem || dk(accent, 0.25), out: p.outline || dk(main, 0.82),
  };
}

function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
const rot = (pts, a, s, bx, by) => { const c = Math.cos(a), sn = Math.sin(a); return pts.map(([x, y]) => [bx + (x * c - y * sn) * s, by + (x * sn + y * c) * s]); };
const ellPts = (cx, cy, rx, ry, a = 0, n = 18) => { const o = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; o.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); } return rot(o, a, 1, 0, 0); };
const DEG = Math.PI / 180;
const INK = '#1e1426';

// ------------------------------------------------------------------ painter
class Painter {
  constructor(form, frame, typeCol, seed) {
    this.form = form; this.p = form.parts; this.S = SIZES[form.size] || 32; this.k = this.S / 32;
    this.W = Math.round(this.S * 1.9); this.H = Math.round(this.S * 1.9);
    this.ox = Math.round((this.W - this.S) / 2); this.oy = this.H - this.S - 2;
    this.g = new Grid(this.W, this.H); this.fr = frameParams(frame); this.pal = derivePal(form.palette, typeCol);
    this.bd = form.build; this.seed = seed; this.pat = new Set(this.p.pattern); this.ext = new Set(this.p.extras);
    this.typeCol = typeCol;
  }
  X(b) { return this.ox + b * this.k; }
  Y(b) { return this.oy + b * this.k; }
  E(cx, cy, rx, ry, c) { this.g.ell(this.X(cx), this.Y(cy), rx * this.k, ry * this.k, c); }
  Pg(pts, c) { this.g.poly(pts.map(([x, y]) => [this.X(x), this.Y(y)]), c); }
  Ln(x0, y0, x1, y1, c) {
    if (this.k >= 1.45) this.g.capsule(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), 0.8, 0.8, c);
    else this.g.line(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), c);
  }
  Cap(x0, y0, x1, y1, r0, r1, c) { this.g.capsule(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), r0 * this.k, r1 * this.k, c); }
  Dot(x, y, c) { this.g.set(this.X(x), this.Y(y), c); }
  // Draw fn into its own layer, then pattern/shade/seam-composite it.
  layer(fn, opt = {}) {
    const D = this.g, L = new Grid(D.w, D.h); this.g = L; fn(); this.g = D;
    if (opt.post) opt.post(L);
    if (opt.shade !== false) shadeLayer(L, this.k);
    if (opt.glint) opt.glint(L);
    const w = L.w, h = L.h;
    if (opt.seam !== false) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (L.px[y * w + x]) continue;
        if (!(L.get(x + 1, y) || L.get(x - 1, y) || L.get(x, y + 1) || L.get(x, y - 1))) continue;
        const d = D.px[y * w + x]; if (d) D.px[y * w + x] = dk(d, 0.5);
      }
    }
    for (let i = 0; i < L.px.length; i++) if (L.px[i]) D.px[i] = L.px[i];
  }

  // -------------------------------------------------------------- plan anchors
  anchors() {
    const f = this.fr, b = this.bd, plan = this.form.plan, P = this.p;
    const sw = (i) => (f.phase < 0 ? 0 : Math.sin((f.phase / 4) * Math.PI * 2 + i * Math.PI));
    const lift = (i) => (f.phase < 0 ? 0 : Math.max(0, Math.cos((f.phase / 4) * Math.PI * 2 + i * Math.PI)) * 1.1);
    const A = { plan, legs: [], arms: [], back: [] };
    const ellBack = (cx, cy, rx, ry, a0, a1, n = 7) => { const o = []; for (let i = 0; i < n; i++) { const a = (a0 + ((a1 - a0) * i) / (n - 1)) * DEG; o.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, a }); } return o; };
    if (plan === 'biped') {
      const legL = 3 * b.legs, rx = 5.8 * b.w * (1 + f.sq * 0.08), ry = 5.6 * b.h * (1 - f.sq * 0.08);
      const bottom = G - legL * 0.55, cx = 15.5 + f.lean * 0.4, cy = bottom - ry + f.bob * 0.7;
      A.body = { kind: 'ell', cx, cy, rx, ry };
      const hr = 6.4 * b.head; A.head = { cx: cx + 1 + f.lean * 0.4, cy: cy - ry - hr * 0.45 + Math.max(0, f.sq) * 0.6, r: hr };
      for (const [i, s] of [[0, -1], [1, 1]]) A.legs.push({ hx: cx + s * 2.6 * b.w, hy: bottom - 1 + f.bob * 0.7, fx: cx + s * 2.6 * b.w + sw(i) * 1.6 + (f.atk && s > 0 ? 1.5 : 0), fy: G - lift(i), w: 1.5, far: s < 0 });
      A.arms.push({ x: cx - rx * 0.88, y: cy - ry * 0.05, ex: cx - rx * 1.1 - sw(1) * 0.6, ey: cy + ry * 0.35, far: true });
      A.arms.push({ x: cx + rx * 0.62, y: cy - ry * 0.05, ex: cx + rx * 0.95 + (f.atk ? 2.6 : sw(0) * 0.6), ey: cy + ry * 0.45 - (f.atk ? 1.8 : 0), far: false });
      A.tail = { x: cx - rx * 0.8, y: cy + ry * 0.3, s: 1 };
      A.back = ellBack(cx, cy, rx, ry, 150, 250, 5);
      A.wing = { x: cx - rx * 0.35, y: cy - ry * 0.55, s: 0.75, front: false };
      A.belly = { cx: cx + 0.9, cy: cy + ry * 0.25, rx: rx * 0.62, ry: ry * 0.62 };
      A.neck = { x: cx + 0.6, y: cy - ry * 0.9 };
    } else if (plan === 'quadruped') {
      const legL = 4.2 * b.legs, rx = 8.2 * b.w * (1 + f.sq * 0.05), ry = 4.8 * b.h * (1 - f.sq * 0.08);
      const cx = 14 + f.lean * 0.4, cy = G - legL - ry * 0.55 + f.bob * 0.7;
      A.body = { kind: 'ell', cx, cy, rx, ry };
      const hr = 5.6 * b.head; A.head = { cx: cx + rx * 0.85 + 1.6 + f.lean * 0.5, cy: cy - ry - hr * 0.15 + Math.max(0, f.sq) * 0.5, r: hr };
      A.neckE = { cx: (cx + rx * 0.62 + A.head.cx) / 2, cy: (cy - ry * 0.35 + A.head.cy) / 2 + 0.5, rx: 2.8 * b.head, ry: 3.6 };
      const hipY = cy + ry * 0.3;
      [[cx - rx * 0.58, 0, false], [cx + rx * 0.55, 1, false], [cx - rx * 0.58 + 1.8, 1, true], [cx + rx * 0.55 + 1.8, 0, true]].forEach(([x, i, far]) => {
        A.legs.push({ hx: x, hy: hipY - (far ? 0.6 : 0), fx: x + sw(i) * 1.5, fy: G - (far ? 0.9 : 0) - lift(i), w: 1.5 * Math.min(1.2, b.w), far });
      });
      A.frontFeet = A.legs.filter((l) => l.hx > cx);
      A.tail = { x: cx - rx * 0.92, y: cy - ry * 0.35, s: 1.1 };
      A.back = ellBack(cx, cy, rx, ry, 195, 290, 6);
      A.wing = { x: cx - 0.5, y: cy - ry * 0.8, s: 0.95, front: false };
      A.belly = { cx: cx + 1, cy: cy + ry * 0.5, rx: rx * 0.72, ry: ry * 0.45 };
      A.neck = { x: A.neckE.cx, y: A.neckE.cy };
    } else if (plan === 'serpent') {
      const pts = [], ph = f.phase < 0 ? (f.flick ? 0.6 : 0) : f.phase * 1.57;
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const t = i / n; let x, y, r;
        if (t < 0.62) { const u = t / 0.62; x = 3.5 + u * 15.5 * b.w; y = G - 2.6 - Math.sin(u * Math.PI * 2 + ph) * 1.1; r = 1.4 + 2.8 * Math.pow(u, 0.7); }
        else { const u = (t - 0.62) / 0.38; const x0 = 3.5 + 15.5 * b.w, y0 = G - 2.6; x = x0 + Math.sin(u * Math.PI * 0.6) * 4 - u * u * 1.5 + f.lean * u; y = y0 - u * 11 * b.h; r = 4.2 - u * 1.2; }
        pts.push({ x, y: y + f.bob * (t > 0.6 ? 1 : 0), r: r * Math.min(1.25, b.w) });
      }
      A.chain = pts;
      const top = pts[n];
      const hr = 5.4 * b.head; A.head = { cx: top.x + 1.8 + f.lean * 0.6, cy: top.y - hr * 0.55, r: hr };
      A.body = { kind: 'chain', cx: 12, cy: G - 4, rx: 9, ry: 4 };
      A.tail = { x: pts[0].x, y: pts[0].y, s: 0.8 };
      A.back = pts.filter((_, i) => i > 1 && i < n - 1 && i % 2 === 0).map((p) => ({ x: p.x, y: p.y - p.r, a: -90 * DEG }));
      A.wing = { x: pts[11].x - 1, y: pts[11].y - 2, s: 0.8, front: false };
      A.sideFin = { x: pts[12].x + 1, y: pts[12].y + 1 };
      A.neck = { x: pts[n - 1].x, y: pts[n - 1].y };
    } else if (plan === 'flyer') {
      const rx = 6 * b.w * (1 + f.sq * 0.06), ry = 5.6 * b.h * (1 - f.sq * 0.06);
      const cx = 15 + f.lean * 0.5, cy = 15.5 + f.bob + (f.flap < 0 ? -1 : 0);
      A.body = { kind: 'ell', cx, cy, rx, ry };
      const hr = 5.2 * b.head; A.head = { cx: cx + rx * 0.7, cy: cy - ry - hr * 0.1, r: hr };
      A.feet = [{ x: cx - 1, y: cy + ry - 0.5 }, { x: cx + 1.8, y: cy + ry - 0.5 }];
      A.tail = { x: cx - rx * 0.85, y: cy + ry * 0.2, s: 1 };
      A.back = ellBack(cx, cy, rx, ry, 190, 260, 5);
      A.wing = { x: cx - 0.5, y: cy - ry * 0.35, s: 1.05 * Math.max(b.w, 0.9), front: true };
      A.belly = { cx: cx + 1.2, cy: cy + ry * 0.3, rx: rx * 0.62, ry: ry * 0.58 };
      A.arms = [];
      A.neck = { x: cx + rx * 0.45, y: cy - ry * 0.85 };
    } else if (plan === 'floater') {
      const rx = 8.5 * b.w * (1 + f.sq * 0.06), ry = 6.2 * b.h * (1 - f.sq * 0.06);
      const cx = 15.5 + f.lean * 0.5, cy = 15.5 + f.bob + (f.phase >= 0 ? [0, -0.5, -1, -0.5][f.phase] : 0);
      A.body = { kind: 'ell', cx, cy, rx, ry };
      A.head = { cx: cx + rx * 0.25, cy: cy - ry * 0.25, r: Math.min(rx, ry) * 0.95, virtual: true };
      A.face = { x: cx + rx * 0.42, y: cy - ry * 0.12, s: ry / 6.4 };
      A.tail = { x: cx - rx * 0.9, y: cy, s: 1.1 };
      A.back = ellBack(cx, cy, rx, ry, 200, 290, 6);
      A.wing = { x: cx - 1, y: cy - ry * 0.5, s: 0.85, front: true };
      A.sideFin = { x: cx + rx * 0.1, y: cy + ry * 0.25 };
      A.belly = { cx: cx + 1, cy: cy + ry * 0.55, rx: rx * 0.8, ry: ry * 0.42 };
      A.under = { cx, y: cy + ry * 0.7, rx };
    } else if (plan === 'blob') {
      let sq = f.sq; if (f.phase >= 0) sq = [-0.7, 0.4, 0.9, 0.4][f.phase];
      const rx = 9.5 * b.w * (1 + sq * 0.14), ry = 7.4 * b.h * (1 - sq * 0.14);
      const hop = f.phase === 0 ? -1.5 : 0;
      const cx = 16 + f.lean * 0.7, cy = G - ry + 0.6 + hop;
      A.body = { kind: 'blob', cx, cy, rx, ry, cut: G + hop };
      A.head = { cx: cx + rx * 0.15, cy: cy - ry * 0.35, r: Math.min(rx, ry) * 0.95, virtual: true };
      A.face = { x: cx + rx * 0.3, y: cy - ry * 0.1, s: ry / 6.6 };
      A.tail = { x: cx - rx * 0.85, y: cy + ry * 0.2, s: 1 };
      A.back = ellBack(cx, cy, rx, ry, 195, 285, 6);
      A.wing = { x: cx - rx * 0.4, y: cy - ry * 0.55, s: 0.8, front: false };
      A.arms = [{ x: cx + rx * 0.82, y: cy + ry * 0.2, ex: cx + rx * 1.02 + (f.atk ? 2 : 0), ey: cy + ry * 0.35, far: false, nub: true }];
      A.belly = { cx: cx + 1, cy: cy + ry * 0.45, rx: rx * 0.6, ry: ry * 0.5 };
    } else if (plan === 'insect') {
      const lean = f.lean * 0.5, by = 19.5 + f.bob * 0.6 - (b.legs - 1) * 2;
      A.abd = { cx: 8.5 + lean, cy: by + 0.3, rx: 5.6 * b.w, ry: 4.4 * b.h };
      A.thorax = { cx: 14.2 + lean, cy: by, rx: 3.5, ry: 3.1 };
      A.body = { kind: 'insect', cx: 11, cy: by, rx: 8, ry: 4.4 };
      const hr = 4.9 * b.head; A.head = { cx: 19.6 + lean * 1.4, cy: by - 3.6, r: hr };
      [[12.6, -2.4, 0, false], [14.4, 0, 1, false], [16.2, 2.4, 0, false], [13.6, -1.6, 1, true], [15.2, 0.5, 0, true], [16.8, 2.8, 1, true]].forEach(([hx, spread, i, far]) => {
        A.legs.push({ hx, hy: by + 1.5, kx: hx + spread * 0.9, ky: by + 3 + (far ? -0.6 : 0), fx: hx + spread * 1.6 + sw(i) * 1.1, fy: G - (far ? 0.8 : 0) - lift(i) * 0.8, thin: true, far });
      });
      A.tail = { x: A.abd.cx - A.abd.rx * 0.9, y: A.abd.cy, s: 0.85 };
      A.back = ellBack(A.abd.cx, A.abd.cy, A.abd.rx, A.abd.ry, 200, 300, 5);
      A.wing = { x: 13.5 + lean, y: by - 2.5, s: 0.95, front: false };
      A.arms = [{ x: 16.6 + lean, y: by + 0.5, ex: 19 + lean + (f.atk ? 2 : 0), ey: by + 2 - (f.atk ? 1.5 : 0), far: false, thin: true }];
      A.belly = null; A.neck = { x: 16.5, y: by - 1.5 };
    } else if (plan === 'plant') {
      const sway = f.phase >= 0 ? [0, 1, 0, -1][f.phase] : f.lean * 0.6 + (f.flick ? 0.5 : 0);
      const hop = f.phase === 1 || f.phase === 3 ? -1.3 : 0;
      const brx = 7.4 * b.w, bry = 4.2 * b.h;
      A.bulb = { cx: 16, cy: G - bry + 0.8 + hop, rx: brx, ry: bry, cut: G + hop };
      A.body = { kind: 'plant', cx: 16, cy: G - bry, rx: brx, ry: bry };
      const hr = 6.6 * b.head; A.head = { cx: 16.5 + sway + f.lean * 0.4, cy: G - 2 * bry - 7 * b.legs - hr * 0.7 + hop + f.bob * 0.6, r: hr };
      A.stem = { x0: 16, y0: A.bulb.cy - bry * 0.6, x1: A.head.cx - 0.3, y1: A.head.cy + hr * 0.6 };
      const my = (A.stem.y0 + A.stem.y1) / 2 + 0.5;
      A.leafArms = [{ x: 15.5 + sway * 0.5, y: my, s: -1 }, { x: 16.8 + sway * 0.5, y: my + 0.5, s: 1 }];
      A.tail = { x: 16 - brx * 0.85, y: A.bulb.cy, s: 0.8 };
      A.back = ellBack(16, A.bulb.cy, brx, bry, 190, 250, 4);
      A.wing = { x: A.stem.x1 - 1, y: A.head.cy + hr * 0.5, s: 0.75, front: false };
      A.roots = true;
      A.belly = null; A.neck = { x: A.stem.x1, y: A.stem.y1 };
    } else if (plan === 'golem') {
      const hw = 7.6 * b.w * (1 + f.sq * 0.05), hh = 6.4 * b.h * (1 - f.sq * 0.06), legL = 3 * b.legs;
      const cx = 15.5 + f.lean * 0.4, cy = G - legL - hh + f.bob * 0.6;
      A.body = { kind: 'box', cx, cy, hw, hh, c: 2.6 * b.w, rx: hw, ry: hh };
      const hr = 4.6 * b.head; A.head = { cx: cx + 2.2 + f.lean * 0.4, cy: cy - hh - hr * 0.35, r: hr };
      for (const [i, s] of [[0, -1], [1, 1]]) A.legs.push({ hx: cx + s * 3.6, hy: cy + hh - 1, fx: cx + s * 3.6 + sw(i) * 1.2, fy: G - lift(i) * 0.7, w: 2.3, far: s < 0, block: true });
      A.arms.push({ x: cx - hw + 0.5, y: cy - hh + 2.5, ex: cx - hw - 0.8 - sw(1) * 0.6, ey: cy + hh * 0.55, far: true, big: true });
      A.arms.push({ x: cx + hw - 1, y: cy - hh + 2.5, ex: cx + hw + 1.2 + (f.atk ? 3 : sw(0) * 0.6), ey: cy + hh * 0.5 - (f.atk ? 2.5 : 0), far: false, big: true });
      A.tail = { x: cx - hw * 0.9, y: cy + hh * 0.3, s: 1 };
      A.back = [0, 0.25, 0.5, 0.75].map((t) => ({ x: cx - hw + 1.5 + t * (hw * 1.4), y: cy - hh, a: -90 * DEG })).concat([{ x: cx - hw, y: cy - hh + 3, a: 200 * DEG }]);
      A.wing = { x: cx - hw * 0.4, y: cy - hh + 1, s: 0.85, front: false };
      A.belly = { cx: cx + 1, cy: cy + 1, rx: hw * 0.55, ry: hh * 0.55, box: true };
      A.neck = { x: cx + 1.5, y: cy - hh };
    } else if (plan === 'ghost') {
      const r = 7.4 * b.w, cx = 16 + f.lean * 0.6, cy = 12.5 + f.bob + (f.phase >= 0 ? [0, -0.7, -1.2, -0.7][f.phase] : 0) + (b.h - 1) * -3;
      const wave = f.phase >= 0 ? f.phase * 1.57 : f.flick * 0.8;
      A.body = { kind: 'ghost', cx, cy, rx: r, ry: r * 0.95 * b.h };
      const chain = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; chain.push({ x: cx - 0.5 - t * 7.5 + Math.sin(t * 5 + wave) * 1.2 * t, y: cy + 1.5 + t * 10 * b.h, r: r * (0.95 - t * 0.82) }); }
      A.chain = chain;
      A.head = { cx: cx + 0.6, cy: cy - r * 0.25, r: r * 0.95, virtual: true };
      A.face = { x: cx + r * 0.3, y: cy - r * 0.05, s: r / 6.6 };
      const tip = chain[10]; A.tail = { x: tip.x, y: tip.y, s: 0.8 };
      A.back = ellBack(cx, cy, r, r * 0.95, 180, 250, 5);
      A.wing = { x: cx - r * 0.5, y: cy - r * 0.3, s: 0.8, front: false };
      A.arms = [{ x: cx - r * 0.95, y: cy + r * 0.45, ex: cx - r * 1.2, ey: cy + r * 0.6, far: true, nub: true }, { x: cx + r * 0.85, y: cy + r * 0.45, ex: cx + r * 1.15 + (f.atk ? 2 : 0), ey: cy + r * 0.55 - (f.atk ? 1 : 0), far: false, nub: true }];
      A.belly = null;
    } else if (plan === 'shell') {
      const rx = 9 * b.w, ry = 7 * b.h, cx = 14 + f.lean * 0.3, cy = G - 5.2 + f.bob * 0.6 + (f.sq > 0 ? 0.4 : 0);
      A.body = { kind: 'shell', cx, cy, rx, ry };
      const hr = 4.8 * b.head; A.head = { cx: cx + rx + 1.2 + f.lean * 0.8 + (f.hurt ? -1.5 : 0), cy: cy - 2.2 + f.bob * 0.3, r: hr };
      A.neckE = { cx: cx + rx * 0.82, cy: cy + 0.2, rx: 2.8, ry: 2.4 };
      [[cx - rx * 0.55, 0, false], [cx + rx * 0.5, 1, false], [cx - rx * 0.3, 1, true], [cx + rx * 0.72, 0, true]].forEach(([x, i, far]) => A.legs.push({ hx: x, hy: cy + 0.5, fx: x + sw(i) * 1.2, fy: G - (far ? 0.8 : 0) - lift(i) * 0.6, w: 1.8, far, stub: true }));
      A.frontFeet = A.legs.filter((l) => l.hx > cx);
      A.tail = { x: cx - rx * 0.95, y: cy + 0.8, s: 0.8 };
      A.back = ellBack(cx, cy, rx, ry, 200, 330, 6);
      A.wing = { x: cx - 1, y: cy - ry * 0.7, s: 0.9, front: false };
      A.belly = null; A.neck = { x: A.neckE.cx, y: A.neckE.cy };
    } else { // dragon
      const rx = 6.8 * b.w * (1 + f.sq * 0.05), ry = 6.2 * b.h * (1 - f.sq * 0.06);
      const cx = 13.5 + f.lean * 0.4, cy = G - 2.6 * b.legs - ry * 0.85 + f.bob * 0.7;
      A.body = { kind: 'dragon', cx, cy, rx, ry };
      A.chest = { cx: cx + rx * 0.45, cy: cy - ry * 0.4, rx: rx * 0.62, ry: ry * 0.78 };
      const hr = 5.2 * b.head; A.head = { cx: cx + rx * 1.0 + 1.5 + f.lean * 0.6, cy: cy - ry - hr * 0.9 + Math.max(0, f.sq) * 0.6, r: hr };
      A.neckChain = [0, 0.33, 0.66, 1].map((t) => ({ x: A.chest.cx + (A.head.cx - 1 - A.chest.cx) * t, y: A.chest.cy - 1 + (A.head.cy + 1 - A.chest.cy + 1) * t, r: 2.9 - t * 0.5 }));
      const tailPts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; tailPts.push({ x: cx - rx * 0.6 - t * 10 * b.w, y: cy + ry * 0.4 + t * 2.8 - Math.sin(t * Math.PI) * 1.6 + f.wig * t * t * 1.2, r: 3 * (1 - t * 0.78) * Math.min(1.2, b.w) }); }
      A.chain = tailPts;
      for (const [i, s] of [[0, 1], [1, -1]]) { const far = s < 0; A.legs.push({ hx: cx + (far ? 2 : 0) - 0.5, hy: cy + ry * 0.35 - (far ? 0.6 : 0), fx: cx + (far ? 2 : 0) + 1 + sw(i) * 1.4, fy: G - (far ? 0.8 : 0) - lift(i), w: 2.4, far, thigh: true }); }
      A.arms.push({ x: A.chest.cx + 2.5, y: A.chest.cy + 1.5, ex: A.chest.cx + 4 + (f.atk ? 2.5 : 0), ey: A.chest.cy + 4 - (f.atk ? 2 : 0), far: true });
      A.arms.push({ x: A.chest.cx + 1.5, y: A.chest.cy + 2, ex: A.chest.cx + 3.5 + (f.atk ? 3 : 0), ey: A.chest.cy + 5 - (f.atk ? 2 : 0), far: false });
      const tip = tailPts[8]; A.tail = { x: tip.x, y: tip.y, s: 0.9 };
      A.back = [...tailPts.slice(1, 6).reverse().map((p) => ({ x: p.x, y: p.y - p.r, a: -95 * DEG })), ...ellBack(cx, cy, rx, ry, 230, 290, 3)];
      A.wing = { x: cx - 0.5, y: cy - ry * 0.7, s: 1.1, front: false };
      A.belly = { cx: A.chest.cx + 1, cy: cy, rx: rx * 0.45, ry: ry * 0.85, plates: true };
      A.neck = { x: A.neckChain[2].x, y: A.neckChain[2].y };
    }
    if (!A.neck) A.neck = { x: A.head.cx - 1, y: A.head.cy + A.head.r * 0.8 };
    return A;
  }

  // -------------------------------------------------------------- render
  render() {
    const A = (this.A = this.anchors()), P = this.p, pal = this.pal;
    const has = (k) => P[k] && P[k] !== 'none';
    // 1 behind everything: far wing, tail, back parts, mane-behind
    if (has('wings')) this.wing(P.wings, A.wing, true);
    if (has('wings') && !A.wing.front) this.wing(P.wings, A.wing, false);
    if (has('tail')) this.layer(() => this.tail(P.tail, A.tail));
    if (has('fins') && ['dorsal', 'both', 'sail'].includes(P.fins)) this.layer(() => this.backFin(P.fins));
    if (has('spikes')) this.layer(() => this.spikes(P.spikes));
    if (has('leaves') && ['leaves', 'bloom', 'mushrooms'].includes(P.leaves)) this.layer(() => this.backLeaves(P.leaves));
    if (has('fins') && P.fins === 'tentacles') this.layer(() => this.tentacles());
    // far limbs
    for (const l of A.legs.filter((l) => l.far)) this.layer(() => this.leg(l, true));
    for (const a of A.arms.filter((a) => a.far)) this.layer(() => this.arm(a, true));
    // body
    this.layer(() => this.body(), { post: (L) => this.bodyPattern(L), glint: (L) => A.head.virtual && this.glint(L, A.head.cx - A.head.r * 0.45, A.head.cy - A.head.r * 0.45) });
    if (A.body.kind !== 'shell' && has('shell')) this.layer(() => this.shellPart(P.shell));
    if (has('fins') && ['side', 'both'].includes(P.fins)) this.layer(() => this.sideFin());
    if (has('leaves') && P.leaves === 'vines') this.layer(() => this.vines());
    for (const l of A.legs.filter((l) => !l.far)) this.layer(() => this.leg(l, false));
    if (A.leafArms) for (const la of A.leafArms) this.layer(() => this.leafArm(la));
    if (has('wings') && A.wing.front) this.wing(P.wings, A.wing, false);
    if (A.feet) this.layer(() => { for (const ft of A.feet) { this.Ln(ft.x, ft.y, ft.x - 0.5, ft.y + 2.2, pal.beak); this.Ln(ft.x - 0.5, ft.y + 2.2, ft.x + 1, ft.y + 2.5, pal.beak); } }, { shade: false });
    // head region
    const H = A.head;
    if (has('mane')) this.layer(() => this.mane(P.mane));
    if (has('fins') && P.fins === 'gills') this.layer(() => this.gills());
    if (has('leaves') && P.leaves === 'petals') this.layer(() => this.petalCollar());
    if (has('antlers')) this.layer(() => this.antlers(P.antlers));
    if (has('horns') && P.horns !== 'single') this.layer(() => this.horns(P.horns, true));
    if (has('ears')) this.layer(() => this.ears(P.ears));
    if (has('crest') && P.crest !== 'mushroom' && P.crest !== 'cap') this.layer(() => this.crest(P.crest));
    if (!H.virtual) this.layer(() => this.head(), { post: (L) => this.headPattern(L), glint: (L) => this.glint(L, H.cx - H.r * 0.5, H.cy - H.r * 0.5) });
    else if (this.pat.has('mask')) this.maskBand();
    if (has('crest') && (P.crest === 'mushroom' || P.crest === 'cap')) this.layer(() => this.crest(P.crest));
    if (has('horns')) this.layer(() => this.horns(P.horns, false));
    this.face();
    for (const a of A.arms.filter((a) => !a.far)) this.layer(() => this.arm(a, false));
    if (has('gem')) this.gem(P.gem);
    this.g.outline(pal.out);
    return this.g;
  }

  // -------------------------------------------------------------- body
  body() {
    const A = this.A, B = A.body, pal = this.pal, m = pal.main, plain = this.pat.has('plain');
    const belly = () => { if (!A.belly || plain) return; const b = A.belly; if (b.box) { this.Pg([[b.cx - b.rx, b.cy - b.ry], [b.cx + b.rx, b.cy - b.ry], [b.cx + b.rx * 0.8, b.cy + b.ry], [b.cx - b.rx * 0.8, b.cy + b.ry]], pal.belly); return; } this.E(b.cx, b.cy, b.rx, b.ry, pal.belly); if (b.plates) for (let y = b.cy - b.ry + 2; y < b.cy + b.ry - 0.5; y += 2) this.Ln(b.cx - b.rx * 0.7, y, b.cx + b.rx * 0.7, y, dk(pal.belly, 0.25)); };
    if (B.kind === 'ell') { this.E(B.cx, B.cy, B.rx, B.ry, m); if (A.neckE) this.E(A.neckE.cx, A.neckE.cy, A.neckE.rx, A.neckE.ry, m); belly(); if (this.ext.has('fluff')) this.fluff(A.neck.x + 0.5, A.neck.y + 1.5); }
    else if (B.kind === 'blob') { this.E(B.cx, B.cy, B.rx, B.ry, m); this.cutBelow(B.cut); belly(); this.cutBelow(B.cut); }
    else if (B.kind === 'chain') { for (const p of A.chain) this.E(p.x, p.y, p.r, p.r, m); if (!plain) for (const p of A.chain) this.E(p.x + p.r * 0.15, p.y + p.r * 0.45, p.r * 0.62, p.r * 0.5, pal.belly); }
    else if (B.kind === 'ghost') { for (const p of A.chain) this.E(p.x, p.y, p.r, p.r, m); this.E(B.cx, B.cy, B.rx, B.ry, m); }
    else if (B.kind === 'insect') { const a = A.abd, t = A.thorax; this.E(a.cx, a.cy, a.rx, a.ry, m); this.E(t.cx, t.cy, t.rx, t.ry, dk(m, 0.12)); if (!plain) this.E(a.cx + 0.5, a.cy + a.ry * 0.45, a.rx * 0.7, a.ry * 0.4, pal.belly); }
    else if (B.kind === 'plant') { const b = A.bulb; this.E(b.cx, b.cy, b.rx, b.ry, m); this.cutBelow(b.cut); this.Cap(A.stem.x0, A.stem.y0, A.stem.x1, A.stem.y1, 1.2, 1, pal.stem); for (const s of [-1, 0, 1]) this.Ln(b.cx + s * b.rx * 0.6, b.cut - 0.5, b.cx + s * b.rx * 0.8 + s, b.cut + 0.3, dk(m, 0.3)); }
    else if (B.kind === 'box') { const { cx, cy, hw, hh, c } = B; this.Pg([[cx - hw + c, cy - hh], [cx + hw - c, cy - hh], [cx + hw, cy - hh + c], [cx + hw, cy + hh - c], [cx + hw - c, cy + hh], [cx - hw + c, cy + hh], [cx - hw, cy + hh - c], [cx - hw, cy - hh + c]], m); belly(); }
    else if (B.kind === 'shell') { const { cx, cy, rx } = B; this.E(cx, cy + 0.6, rx * 0.95, 3.4, pal.belly); this.Cap(A.neckE.cx - 1, A.neckE.cy, A.neckE.cx + 1.5, A.neckE.cy - 1, 2.3, 2.1, m); this.shellDome(this.p.shell && this.p.shell !== 'none' ? this.p.shell : 'dome', cx, cy, rx, B.ry); }
    else if (B.kind === 'dragon') { for (const p of A.chain) this.E(p.x, p.y, p.r, p.r, m); this.E(B.cx, B.cy, B.rx, B.ry, m); this.E(A.chest.cx, A.chest.cy, A.chest.rx, A.chest.ry, m); for (const p of A.neckChain) this.E(p.x, p.y, p.r, p.r, m); belly(); }
  }
  cutBelow(yb) { const y0 = Math.floor(this.Y(yb)); for (let y = y0; y < this.g.h; y++) for (let x = 0; x < this.g.w; x++) this.g.px[y * this.g.w + x] = null; }
  fluff(x, y) { const c = lt(this.pal.belly, 0.3); this.Pg([[x - 2, y - 1], [x - 1, y + 2.5], [x, y + 0.8], [x + 1, y + 3], [x + 2, y + 0.6], [x + 2.5, y - 1]], c); }

  // column-relative patterns on the body layer
  bodyPattern(L) {
    const pal = this.pal, pat = this.pat, k = this.k, w = L.w;
    const cols = new Map();
    for (let x = 0; x < w; x++) { let t = -1, b = -1; for (let y = 0; y < L.h; y++) if (L.px[y * w + x]) { if (t < 0) t = y; b = y; } if (t >= 0) cols.set(x, [t, b]); }
    const v = (x, y) => { const c = cols.get(x); return c ? (y - c[0]) / Math.max(1, c[1] - c[0]) : 0; };
    const R = rng(this.seed + 'spots'); const spots = [];
    if (pat.has('spots')) {
      const mains = []; for (let i = 0; i < L.px.length; i++) if (L.px[i] === pal.main) mains.push(i);
      for (let n = 0; n < 40 && spots.length < Math.max(3, Math.round(mains.length / (40 * k * k))); n++) {
        const i = mains[Math.floor(R() * mains.length)]; if (i == null) break; const x = i % w, y = (i / w) | 0;
        if (v(x, y) > 0.75) continue;
        if (spots.every((s) => Math.hypot(s.x - x, s.y - y) > 3.5 * k)) spots.push({ x, y, r: (0.9 + R() * 0.8) * k });
      }
    }
    const horiz = ['quadruped', 'serpent', 'insect', 'floater', 'dragon', 'shell'].includes(this.form.plan);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (L.px[i] !== pal.main) continue;
      let c = pal.main; const vv = v(x, y);
      if (pat.has('gradient')) { const t = (vv - 0.4) / 0.6; if (t > 0.66) c = mix(pal.main, pal.accent, 0.55); else if (t > 0.33) c = mix(pal.main, pal.accent, 0.28); }
      if (pat.has('stripes')) { const band = Math.floor((horiz ? x : x + (y * 0.4)) / (2.3 * k)); if (band % 3 === 0 && vv < 0.55) c = pal.pattern; }
      if (pat.has('diamonds') && vv < 0.32) { const u = ((x / (4 * k)) % 1 + 1) % 1; if (Math.abs(u - 0.5) * 2 + vv * 2.4 < 0.75) c = pal.pattern; }
      for (const s of spots) if (Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) <= s.r) c = pal.spot;
      L.px[i] = c;
    }
  }
  headPattern(L) {
    const pal = this.pal, H = this.A.head, k = this.k, w = L.w;
    if (this.pat.has('stripes')) for (let i = 0; i < L.px.length; i++) { if (L.px[i] !== pal.main) continue; const x = i % w, y = (i / w) | 0; const dy = (y - this.Y(H.cy - H.r)) / (H.r * k * 2); const xx = x - this.X(H.cx - H.r * 0.2); if (dy < 0.28 && Math.abs(xx) % (2.6 * k) < 1.1 * k && xx < 2 * k) L.px[i] = pal.pattern; }
    if (this.pat.has('spots')) { const sx = this.X(H.cx - H.r * 0.55), sy = this.Y(H.cy - H.r * 0.35); for (let i = 0; i < L.px.length; i++) { if (L.px[i] !== pal.main) continue; const x = i % w, y = (i / w) | 0; if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 1.3 * k) L.px[i] = pal.spot; } }
  }
  maskBand() { const F = this.faceAnchor(); this.layer(() => this.E(F.x, F.y + 0.6, F.gap * 1.9, 1.8 * F.s, this.pal.pattern), { seam: false }); }
  glint(L, bx, by) { const x = Math.round(this.X(bx)), y = Math.round(this.Y(by)); const c = L.get(x, y); if (!c) return; const H = lt(this.pal.main, 0.75); L.set(x, y, H); if (this.k > 1.1 && L.get(x + 1, y)) L.set(x + 1, y, H); }

  // -------------------------------------------------------------- limbs
  leg(l, far) {
    const pal = this.pal, m = far ? dk(pal.main, 0.2) : pal.main, sock = this.pat.has('socks') ? pal.accent : null;
    if (l.thin) { const c = far ? dk(pal.main, 0.35) : dk(pal.main, 0.15); this.Ln(l.hx, l.hy, l.kx, l.ky, c); this.Ln(l.kx, l.ky, l.fx, l.fy, c); this.Dot(l.fx, l.fy, sock || c); return; }
    if (l.thigh) { this.E(l.hx, l.hy, l.w * 1.5, l.w * 1.6, m); this.Cap(l.hx + 0.5, l.hy + 1, l.fx, l.fy - 1.2, l.w * 0.8, l.w * 0.6, m); this.E(l.fx + 0.8, l.fy - 0.9, 2.6, 1.3, sock || dk(m, 0.12)); if (this.p.claws === 'claws') this.toes(l.fx + 3, l.fy - 0.5); return; }
    const footC = sock || dk(m, 0.1);
    if (l.block) { this.Pg([[l.hx - l.w, l.hy], [l.hx + l.w, l.hy], [l.fx + l.w, l.fy - 1], [l.fx - l.w, l.fy - 1]], m); this.E(l.fx + 0.4, l.fy - 1, l.w * 1.25, 1.4, footC); return; }
    this.Cap(l.hx, l.hy, l.fx, l.fy - 1, l.w * 0.85, l.w * 0.7, m);
    if (sock) this.Cap(l.fx, l.fy - 1.6, l.fx, l.fy - 1, l.w * 0.75, l.w * 0.7, sock);
    this.E(l.fx + 0.4, l.fy - 0.9, l.w * (l.stub ? 1.05 : 1.2), 1.1, footC);
    if (!far && this.p.claws === 'claws' && this.A.frontFeet && this.A.frontFeet.includes(l)) this.toes(l.fx + l.w + 0.6, l.fy - 0.6);
  }
  toes(x, y) { for (let i = 0; i < 3; i++) this.Dot(x - i * 0.9, y + (i === 1 ? 0.2 : 0), '#fff4e0'); }
  arm(a, far) {
    const pal = this.pal, m = far ? dk(pal.main, 0.22) : pal.main, cl = this.p.claws;
    if (a.thin && cl !== 'scythes' && cl !== 'pincers') { this.Ln(a.x, a.y, a.ex, a.ey, dk(pal.main, 0.15)); return; }
    if (a.nub) { this.E(a.ex, a.ey, 1.8, 1.5, m); return; }
    if (cl === 'mitts' || a.big) {
      this.Cap(a.x, a.y, a.ex, a.ey - 1.5, a.big ? 2.2 : 1.3, a.big ? 2 : 1.1, m);
      const r = cl === 'mitts' ? (a.big ? 3.2 : 2.4) : a.big ? 2.4 : 1.5;
      this.E(a.ex, a.ey, r, r * 0.92, cl === 'mitts' ? (far ? dk(pal.accent, 0.2) : pal.accent) : m);
      if (cl === 'mitts' && !far) for (let i = 0; i < 3; i++) this.Dot(a.ex + r * 0.55, a.ey - r * 0.45 + i * r * 0.45, dk(pal.accent, 0.35));
      return;
    }
    this.Cap(a.x, a.y, a.ex, a.ey, 1.25, 1.05, m);
    if (cl === 'pincers') {
      const c = far ? dk(pal.accent, 0.2) : pal.accent, x = a.ex + 1, y = a.ey, op = this.fr.atk ? 1.6 : 0.6;
      this.E(x, y, 2.4, 2, c);
      this.Pg([[x, y - 1.5], [x + 4.2, y - 2.5 - op], [x + 3.4, y - 0.4]], c);
      this.Pg([[x, y + 0.5], [x + 3.8, y + 1.2 + op * 0.5], [x + 3.2, y + 1.9]], c);
    } else if (cl === 'scythes') {
      const c = far ? dk(pal.accent2, 0.2) : pal.accent2;
      this.Pg([[a.ex - 0.5, a.ey - 1], [a.ex + 1.5, a.ey - 5.5 - (this.fr.atk ? 1 : 0)], [a.ex + 4.5, a.ey - 6.5], [a.ex + 2.2, a.ey - 4], [a.ex + 0.8, a.ey + 0.8]], c);
    } else if (cl === 'claws' && !far) this.toes(a.ex + 1.4, a.ey + 0.6);
  }
  leafArm(la) {
    const lc = this.form.palette.leaf || lt(this.pal.stem, 0.25), c = la.s < 0 ? dk(lc, 0.12) : lc, f = this.fr.flap * 0.4 + (this.fr.atk && la.s > 0 ? -0.6 : 0);
    const pts = rot([[0, 0], [3, -1.6], [6.2, -0.4], [3.4, 1.2]], (la.s > 0 ? -0.25 : Math.PI + 0.25) + f * la.s, 1, la.x, la.y);
    this.Pg(pts, c); this.Ln(pts[0][0], pts[0][1], pts[2][0], pts[2][1], dk(c, 0.25));
  }

  // -------------------------------------------------------------- head + face
  head() {
    const H = this.A.head, pal = this.pal, m = pal.main, r = H.r, kind = this.p.head;
    const { cx, cy } = H;
    if (kind === 'wide') this.E(cx, cy, r * 1.2, r * 0.82, m);
    else if (kind === 'tall') this.E(cx, cy, r * 0.86, r * 1.05, m);
    else if (kind === 'frog') { this.E(cx, cy + r * 0.1, r * 1.28, r * 0.72, m); const F = this.faceAnchor(); for (const ex of [F.x - F.gap, F.x + F.gap]) this.E(ex, F.y, r * 0.36, r * 0.36, m); }
    else if (kind === 'block') { const w = r * 0.98, h = r * 0.86, c = r * 0.3; this.Pg([[cx - w + c, cy - h], [cx + w - c, cy - h], [cx + w, cy - h + c], [cx + w, cy + h - c], [cx + w - c, cy + h], [cx - w + c, cy + h], [cx - w, cy + h - c], [cx - w, cy - h + c]], m); }
    else if (kind === 'bulb') { this.E(cx, cy, r, r * 0.9, m); this.Pg([[cx - r * 0.45, cy - r * 0.7], [cx + 0.3 + this.fr.flick * 0.4, cy - r * 1.45], [cx + r * 0.5, cy - r * 0.7]], m); }
    else if (kind === 'beaked') this.E(cx, cy, r * 0.92, r * 0.88, m);
    else this.E(cx, cy, r, r * 0.92, m);
    if (kind === 'fox') {
      this.Pg([[cx + r * 0.45, cy - r * 0.15], [cx + r * 1.45, cy + r * 0.35], [cx + r * 0.45, cy + r * 0.72]], m);
      this.Pg([[cx + r * 0.5, cy + r * 0.32], [cx + r * 1.38, cy + r * 0.4], [cx + r * 0.5, cy + r * 0.7]], pal.belly);
      this.E(cx + r * 1.38, cy + r * 0.32, 0.9, 0.8, INK);
    } else if (kind === 'muzzle') {
      this.E(cx + r * 0.72, cy + r * 0.35, r * 0.55, r * 0.42, pal.belly);
      this.E(cx + r * 1.1, cy + r * 0.12, 1.1, 0.8, INK);
    } else if (kind === 'long') {
      this.E(cx + r * 0.95, cy + r * 0.3, r * 0.85, r * 0.45, m);
      this.E(cx + r * 1.0, cy + r * 0.55, r * 0.7, r * 0.22, pal.belly);
      this.Dot(cx + r * 1.6, cy + r * 0.05, dk(m, 0.6));
    } else if (!this.pat.has('plain') && (kind === 'round' || kind === 'wide' || kind === 'tall' || kind === 'beaked')) {
      this.E(cx + r * 0.32, cy + r * 0.5, r * 0.55, r * 0.32, mix(m, pal.belly, 0.6));
    }
    if (this.pat.has('mask')) { const F = this.faceAnchor(); this.E(F.x, F.y + 0.5, F.gap * 1.9, 1.7 * F.s, pal.pattern); }
  }
  faceAnchor() {
    const A = this.A, H = A.head, r = H.r, kind = this.p.head;
    if (A.face) { const s = A.face.s; return { x: A.face.x, y: A.face.y, gap: 2.8 * s, mx: A.face.x + 0.2, my: A.face.y + 2.6 * s, s }; }
    const s = r / 6.4;
    if (kind === 'fox') return { x: H.cx + r * 0.15, y: H.cy - r * 0.05, gap: r * 0.36, mx: H.cx + r * 0.95, my: H.cy + r * 0.58, s };
    if (kind === 'muzzle') return { x: H.cx + r * 0.2, y: H.cy - r * 0.15, gap: r * 0.38, mx: H.cx + r * 0.85, my: H.cy + r * 0.55, s };
    if (kind === 'long') return { x: H.cx + r * 0.1, y: H.cy - r * 0.25, gap: r * 0.36, mx: H.cx + r * 1.25, my: H.cy + r * 0.48, s, longMouth: true };
    if (kind === 'frog') return { x: H.cx + r * 0.2, y: H.cy - r * 0.55, gap: r * 0.6, mx: H.cx + r * 0.3, my: H.cy + r * 0.35, s, wide: true };
    if (kind === 'wide') return { x: H.cx + r * 0.28, y: H.cy, gap: r * 0.5, mx: H.cx + r * 0.3, my: H.cy + r * 0.42, s };
    if (kind === 'beaked') return { x: H.cx + r * 0.22, y: H.cy - r * 0.1, gap: r * 0.38, mx: H.cx + r * 0.7, my: H.cy + r * 0.2, s };
    return { x: H.cx + r * 0.25, y: H.cy + r * 0.02, gap: r * 0.42, mx: H.cx + r * 0.28, my: H.cy + r * 0.45, s };
  }
  face() {
    const P = this.p, pal = this.pal, fr = this.fr, F = this.faceAnchor(), g = this.g, k = this.k;
    const H = this.A.head;
    const eh = Math.max(2, Math.min(6, Math.round(H.r * k * 0.5 * (this.A.face ? 0.85 : 1)))), ew = eh >= 4 ? 3 : 2;
    let style = P.eyes;
    const headCol = H.virtual ? pal.main : pal.main;
    const darkBody = luma(headCol) < 95 || this.pat.has('mask');
    const ex = [Math.round(this.X(F.x - F.gap) - ew / 2), Math.round(this.X(F.x + F.gap * 0.85) - ew / 2)];
    const ey = Math.round(this.Y(F.y) - eh / 2);
    if (fr.atk && !['cyclops', 'compound', 'glowing'].includes(style)) style = 'fierce';
    if (fr.hurt) style = style === 'cyclops' ? 'cyclopsX' : 'x';
    if (fr.blink && style !== 'compound' && style !== 'glowing') style = style === 'cyclops' ? 'cyclopsBlink' : 'blink';
    const iris = pal.eye;
    const drawEye = (x, y, side) => {
      if (darkBody && ['round', 'sparkle', 'fierce', 'dot'].includes(style)) g.rect(x - 1, y - 1, ew + 2, eh + 2, '#fff4e0');
      switch (style) {
        case 'round': g.rect(x, y, ew, eh, INK); if (iris && eh >= 4) g.rect(x, y + eh - 2, ew, 1, iris); g.set(x, y, '#ffffff'); if (eh >= 5) g.set(x + 1, y, '#ffffff'); break;
        case 'sparkle': g.rect(x, y - 1, ew, eh + 1, INK); g.rect(x, y + Math.floor(eh / 2), ew, Math.ceil(eh / 2) - 1, iris || '#5a7aff'); g.set(x, y - 1, '#ffffff'); if (ew > 2) g.set(x + 1, y - 1, '#ffffff'); g.set(x + ew - 1, y + eh - 2, '#ffffff'); break;
        case 'sleepy': g.rect(x - (ew > 2 ? 0 : 0), y + eh - 2, ew + 1, 1, INK); g.rect(x, y + eh - 1, ew, 1, iris || INK); break;
        case 'fierce': { g.rect(x, y + 1, ew, eh - 1, INK); g.set(x, y + 1, '#ffffff'); if (side < 0) g.line(x - 1, y - 1, x + ew, y, INK); else g.line(x - 1, y, x + ew, y - 1, INK); if (iris && eh >= 4) g.rect(x, y + eh - 1, ew, 1, iris); break; }
        case 'compound': { const c = iris || '#e0405a'; const cx = x + ew / 2, cy = y + eh / 2, r = eh * 0.72; g.ell(cx, cy, r, r * 1.05, (nx, ny, px, py) => ((px + py) % 2 ? c : dk(c, 0.3))); g.set(Math.floor(cx - r * 0.4), Math.floor(cy - r * 0.45), '#ffffff'); break; }
        case 'glowing': { const c = pal.glow; g.rect(x, y, ew, eh, c); g.rect(x, y + 1, ew, Math.max(1, eh - 2), lt(c, 0.6)); break; }
        case 'dot': g.rect(x, y + Math.floor(eh / 2) - 1, Math.max(1, ew - 1), 2, INK); break;
        case 'happy': g.set(x - 0, y + 2, INK); g.set(x + 1, y + 1, INK); g.set(x + 2, y + 2, INK); if (ew > 2) g.set(x + 3, y + 3, INK); break;
        case 'blink': g.rect(x, y + eh - 1, ew + (ew > 2 ? 0 : 0), 1, INK); break;
        case 'x': g.set(x, y, INK); g.set(x + 1, y + 1, INK); g.set(x + 2, y + 2, INK); g.set(x + 2, y, INK); g.set(x, y + 2, INK); break;
      }
    };
    if (style.startsWith('cyclops')) {
      const cx = this.X(F.x), cy = this.Y(F.y), r = eh * 1.05;
      if (style === 'cyclopsBlink') g.line(cx - r, cy + 1, cx + r, cy + 1, INK);
      else if (style === 'cyclopsX') { g.line(cx - 2, cy - 2, cx + 2, cy + 2, INK); g.line(cx - 2, cy + 2, cx + 2, cy - 2, INK); }
      else { g.ell(cx, cy, r, r * 0.9, '#fff8f0'); g.ell(cx + r * 0.2, cy + 0.3, r * 0.58, r * 0.6, iris || '#3a8aff'); g.ell(cx + r * 0.25, cy + 0.3, r * 0.28, r * 0.3, INK); g.set(cx - r * 0.2, cy - r * 0.35, '#ffffff'); }
    } else { drawEye(ex[0], ey, -1); drawEye(ex[1], ey, 1); }
    // brows / scar
    if (this.ext.has('brows') || (this.form.size !== 'tiny' && false)) { const c = dk(pal.main, 0.65); g.line(ex[0] - 1, ey - 2, ex[0] + ew, ey - 1, c); g.line(ex[1] - 1, ey - 1, ex[1] + ew, ey - 2, c); }
    if (this.ext.has('scar')) { const c = lt(pal.main, 0.5); g.line(ex[1] - 1, ey - 2, ex[1] + ew + 1, ey + eh + 1, c); }
    // cheeks
    const cy2 = ey + eh;
    if (P.cheeks === 'blush') { g.rect(ex[0] - 2, cy2, 2, 1, pal.cheek); g.rect(ex[1] + ew, cy2, 2, 1, pal.cheek); }
    if (P.cheeks === 'spark') { const c = this.form.palette.cheek || '#ffd23a'; g.ell(ex[0] - 1, cy2 + 1, 1.6 * Math.max(1, k), 1.4 * Math.max(1, k), c); g.ell(ex[1] + ew + 1, cy2 + 1, 1.4 * Math.max(1, k), 1.3 * Math.max(1, k), c); }
    if (P.cheeks === 'freckles') { const c = dk(pal.main, 0.4); g.set(ex[0] - 2, cy2 + 1, c); g.set(ex[0] - 1, cy2, c); g.set(ex[0], cy2 + 1, c); }
    // mouth
    const mx = Math.round(this.X(F.mx)), my = Math.round(this.Y(F.my)) + (style === 'x' ? 0 : 0);
    let mouth = P.mouth;
    if (fr.atk && !['beak', 'none'].includes(mouth)) mouth = 'open';
    if (fr.hurt && !['beak', 'none'].includes(mouth)) mouth = 'o';
    const R = '#7a1a2a';
    switch (mouth) {
      case 'smile': g.set(mx - 1, my, INK); g.set(mx, my + 1, INK); g.set(mx + 1, my, INK); break;
      case 'cat': g.set(mx - 2, my, INK); g.set(mx - 1, my + 1, INK); g.set(mx, my, INK); g.set(mx + 1, my + 1, INK); g.set(mx + 2, my, INK); break;
      case 'fangs': if (F.longMouth) g.line(mx - 4 * F.s, my, mx + 1, my, INK); else g.line(mx - 1, my, mx + 1, my, INK); g.set(mx - 1, my + 1, '#ffffff'); g.set(mx + 1, my + 1, '#ffffff'); break;
      case 'tusks': g.line(mx - 1, my, mx + 1, my, INK); for (const s of [-2, 2]) { g.set(mx + s, my, '#fff4d8'); g.set(mx + s, my - 1, '#fff4d8'); g.set(mx + s + (s < 0 ? -1 : 1), my - 2, '#fff4d8'); } break;
      case 'grin': g.rect(mx - 2, my, 5, 2, R); g.rect(mx - 2, my, 5, 1, '#ffffff'); break;
      case 'tongue': g.set(mx - 1, my, INK); g.set(mx, my + 1, INK); g.set(mx + 1, my, INK); g.rect(mx, my + 1, 1, 2, '#ff6a8a'); break;
      case 'open': g.rect(mx - 1, my, 3, 2, R); g.set(mx, my + 1, '#ff6a7a'); g.set(mx - 1, my, '#ffffff'); break;
      case 'o': g.rect(mx - 1, my, 2, 2, R); break;
      case 'beak': { const b = pal.beak, open = fr.atk || fr.hurt ? 1 : 0, s = Math.max(1, F.s * k); const bx = mx - 1, by = my - 1; g.poly([[bx, by - 1.6 * s], [bx + 3.6 * s, by + 0.2], [bx, by + 0.6]], lt(b, 0.15)); g.poly([[bx, by + 0.6 + open], [bx + 2.8 * s, by + 0.8 + open], [bx, by + 1.8 * s + open]], dk(b, 0.2)); break; }
    }
    if (F.longMouth && mouth !== 'fangs' && mouth !== 'beak') g.line(mx - 4 * F.s, my, mx - 2, my, dk(pal.main, 0.55));
    if (this.ext.has('nose') && !['fox', 'muzzle', 'long'].includes(P.head)) g.rect(mx, my - 2, 1, 1, INK);
    if (this.ext.has('whiskers')) { const c = dk(pal.main, 0.55); for (const d of [-1, 1]) { g.line(mx + 2, my - 1 + d, mx + 2 + 3 * k, my - 1 + d * 2, c); g.line(ex[0] - 2, my - 1 + d, ex[0] - 2 - 3 * k, my - 1 + d * 2, c); } }
  }

  // -------------------------------------------------------------- head parts
  earBase(theta, H) { return [H.cx + Math.cos(theta * DEG) * H.r * 0.82, H.cy + Math.sin(theta * DEG) * H.r * 0.82]; }
  ears(kind) {
    const H = this.A.head, pal = this.pal, s = H.r / 6.4, flick = this.fr.flick, tip = this.pat.has('tipped') ? pal.accent2 : null;
    for (const [side, th] of [[-1, -118], [1, -64]]) {
      const [bx, by] = this.earBase(th, H), a = (th + 90) * DEG, m = side < 0 ? dk(pal.main, 0.1) : pal.main;
      const R = (pts) => rot(pts, a, s, bx, by);
      if (kind === 'cat') { this.Pg(R([[-2.6, 1.5], [0.4, -5.2], [2.6, 1.5]]), m); this.Pg(R([[-1.2, 0.6], [0.3, -3], [1.2, 0.6]]), pal.accent); if (tip) this.Pg(R([[-0.5, -3.4], [0.4, -5.2], [1, -3.4]]), tip); }
      else if (kind === 'bunny') { const t = side * (flick ? 0.8 : 0); this.Pg(R([[-1.9, 1.5], [-1.6 + t, -9], [-0.4 + t, -10.2], [0.9 + t, -10], [1.9 + t, -8.5], [1.9, 1.5]]), m); this.Pg(R([[-0.8, 0.5], [-0.6 + t, -7.8], [0.8 + t, -7.8], [0.9, 0.5]]), pal.accent); if (tip) this.Pg(R([[-1.6 + t, -8.5], [-0.4 + t, -10.2], [1.9 + t, -8.5]]), tip); }
      else if (kind === 'round') { const [cx, cy] = R([[0, -1.6]])[0]; this.E(cx, cy, 2.7 * s, 2.6 * s, m); this.E(cx, cy + 0.2, 1.4 * s, 1.3 * s, pal.accent); }
      else if (kind === 'floppy') { const bx2 = H.cx + (side < 0 ? -H.r * 0.72 : -H.r * 0.12), by2 = H.cy - H.r * 0.62, sw = flick ? 0.6 : 0, o = -1, s = H.r / 4.9; this.Pg([[bx2 + 1.4 * s, by2], [bx2 + o * 2.2 * s, by2 - 0.8 * s], [bx2 + o * 3.4 * s + sw, by2 + 4.2 * s], [bx2 + o * 2.2 * s + sw, by2 + 6.4 * s], [bx2 + 0.2 * s, by2 + 3.4 * s]], side < 0 ? dk(pal.accent, 0.12) : pal.accent); }
      else if (kind === 'fin') { const p = R([[-2, 1.5], [3.4, -5.4 - flick * 0.6], [1.4, -1], [2.8, 1.5]]); this.Pg(p, pal.accent); this.Ln(...R([[0, 0.5]])[0], ...R([[2.6, -4]])[0], dk(pal.accent, 0.3)); }
      else if (kind === 'leaf') { const p = R([[0, 1.5], [-2.2, -3], [0.3, -7.4], [2.2, -3]]); this.Pg(p, pal.accent); this.Ln(...R([[0, 1]])[0], ...R([[0.2, -6]])[0], dk(pal.accent, 0.3)); }
      else if (kind === 'bat') { this.Pg(R([[-3.2, 1.5], [-1.2, -8.5], [3.2, 1.5]]), m); this.Pg(R([[-1.6, 0.6], [-0.9, -6], [1.6, 0.6]]), pal.accent); }
      else if (kind === 'tuft') this.Pg(R([[-1.4, 1], [-2.6, -4.2], [-0.2, -1.4], [0.6, -5.2], [1.2, -1.2], [2.8, -3.6], [2, 1]]), side < 0 ? dk(pal.accent, 0.1) : pal.accent);
      else if (kind === 'antenna') { const [tx, ty] = R([[1.6 + side * 0.6, -6.5 - (flick && side > 0 ? 1 : 0)]])[0]; this.Ln(bx, by, tx, ty, dk(pal.main, 0.55)); this.E(tx, ty, 1.3 * s, 1.3 * s, pal.accent2); }
    }
  }
  horns(kind, behind) {
    const H = this.A.head, pal = this.pal, s = H.r / 6.4, hc = pal.horn;
    if (kind === 'single') { if (behind) return; const [bx, by] = this.earBase(-62, H); this.Pg(rot([[-1.5, 1.2], [-0.2, -6.4], [0.6, -6.6], [1.5, 1.2]], 0.45, s, bx, by), hc); const p = rot([[0, -1], [0, -3.5]], 0.45, s, bx, by); this.Ln(p[0][0] - 0.6, p[0][1], p[1][0] + 0.6, p[1][1], dk(hc, 0.25)); return; }
    if (kind === 'crystal') { if (!behind) return; const bx = H.cx + 0.2, by = H.cy - H.r * 0.7; this.Pg([[bx - 3 * s, by + 1], [bx - 2 * s, by - 4.5 * s], [bx + 0.3 * s, by + 1]], pal.accent2); this.Pg([[bx - 0.6 * s, by + 1], [bx + 1.4 * s, by - 7.5 * s], [bx + 3.3 * s, by + 1]], pal.accent); this.Pg([[bx + 2.8 * s, by + 1], [bx + 4.8 * s, by - 3 * s], [bx + 5.6 * s, by + 1.5]], pal.accent2); return; }
    const sides = [[-1, kind === 'twin' || kind === 'stubs' ? -112 : kind === 'ram' ? -150 : -168], [1, kind === 'twin' || kind === 'stubs' ? -68 : kind === 'ram' ? -35 : -12]];
    for (const [side, th] of sides) {
      const far = side < 0; if (behind !== far && kind !== 'twin' && kind !== 'stubs') continue; if ((kind === 'twin' || kind === 'stubs') && !behind) continue;
      const [bx, by] = this.earBase(th, H), c = far ? dk(hc, 0.15) : hc;
      if (kind === 'twin') this.Pg(rot([[-1.3, 1.2], [side * 0.8, -5.4], [1.3, 1.2]], (th + 90) * DEG * 0.7, s, bx, by), c);
      else if (kind === 'stubs') this.E(bx, by - 0.6 * s, 1.4 * s, 1.3 * s, c);
      else if (kind === 'ram') { let px = bx, py = by; for (let i = 1; i <= 10; i++) { const t = i / 10, ang = (th - 40 * side) * DEG + side * t * 5.2, rr = (3.4 - 1.8 * t) * s; const cx = bx + side * 1.6 * s, cy = by + 1.6 * s; const nx = cx + Math.cos(ang) * rr, ny = cy + Math.sin(ang) * rr; this.Cap(px, py, nx, ny, (1.5 - t * 0.7) * s, (1.4 - t * 0.7) * s, i % 3 ? c : dk(c, 0.2)); px = nx; py = ny; } }
      else if (kind === 'bull') { const o = side; const p1 = [bx + o * 3 * s, by - 0.4 * s], p2 = [bx + o * 4.4 * s, by - 3.8 * s]; this.Cap(bx, by, p1[0], p1[1], 1.4 * s, 1.1 * s, c); this.Cap(p1[0], p1[1], p2[0], p2[1], 1.1 * s, 0.45 * s, c); }
    }
  }
  antlers(kind) {
    const H = this.A.head, s = H.r / 6.4, c0 = this.form.palette.horn || (kind === 'twig' ? '#8a5a34' : '#d8b080');
    for (const [side, th] of [[-1, -112], [1, -70]]) {
      const [bx, by] = this.earBase(th, H), c = side < 0 ? dk(c0, 0.15) : c0, o = side < 0 ? -1 : 1;
      if (kind === 'paddle') { this.Cap(bx, by, bx + o * 1.5 * s, by - 3 * s, 0.9 * s, 0.9 * s, c); this.Pg([[bx + o * 0.5 * s, by - 3 * s], [bx + o * 1 * s, by - 7.5 * s], [bx + o * 3 * s, by - 6 * s], [bx + o * 4.5 * s, by - 7.8 * s], [bx + o * 5.5 * s, by - 5 * s], [bx + o * 3.5 * s, by - 2.5 * s]], c); continue; }
      const top = [bx + o * 1.6 * s, by - 7 * s];
      this.Cap(bx, by, top[0], top[1], 0.75 * s, 0.5 * s, c);
      const t1 = [bx + o * 0.8 * s, by - 3 * s], t2 = [bx + o * 1.3 * s, by - 5.4 * s];
      this.Cap(t1[0], t1[1], t1[0] + o * 2.4 * s, t1[1] - 1.8 * s, 0.6 * s, 0.4 * s, c);
      if (kind === 'branch') this.Cap(t2[0], t2[1], t2[0] - o * 1.8 * s, t2[1] - 1.6 * s, 0.55 * s, 0.4 * s, c);
      if (kind === 'twig' && side > 0) this.E(top[0] + 1 * s, top[1], 1.5 * s, 0.9 * s, this.pal.accent);
    }
  }
  crest(kind) {
    const H = this.A.head, pal = this.pal, s = H.r / 6.4, fl = this.fr.flick;
    const bx = H.cx + H.r * 0.05, by = H.cy - H.r * (H.virtual ? 0.85 : 0.88);
    if (kind === 'tuft') { [[-2.6, -5.2], [-0.4, -6.6], [1.8, -4.6]].forEach(([dx, dy], i) => { this.Cap(bx + (i - 1) * 1.1 * s, by + 0.5, bx + dx * s - fl * 0.5, by + dy * s, 0.9 * s, 0.6 * s, i === 1 ? pal.accent : dk(pal.accent, 0.12)); this.E(bx + dx * s - fl * 0.5, by + dy * s, 0.8 * s, 0.8 * s, pal.accent2); }); }
    else if (kind === 'fin') { this.Pg([[bx - 4 * s, by + 1.5], [bx - 3.2 * s, by - 2.6 * s], [bx - 0.4 * s, by - 5 * s - fl * 0.5], [bx + 2.6 * s, by - 3.4 * s], [bx + 3.4 * s, by + 1.5]], pal.accent); for (const d of [-2, 0, 2]) this.Ln(bx + d * s * 0.6, by, bx + d * s * 1.1, by - 3.6 * s, dk(pal.accent, 0.28)); }
    else if (kind === 'flame') { const f = fl; this.Pg([[bx - 4 * s, by + 2], [bx - 3 * s - f, by - 6 * s], [bx - 0.6, by - 2 * s], [bx + 1 * s, by - 9 * s + f], [bx + 2 * s, by - 3 * s], [bx + 4 * s + f, by - 6 * s], [bx + 4 * s, by + 2]], pal.accent); this.Pg([[bx - 2 * s, by + 1], [bx + 1 * s, by - 5 * s + f], [bx + 2.5 * s, by + 1]], pal.accent2); }
    else if (kind === 'sprout') { this.Ln(bx, by + 1, bx, by - 3 * s, pal.stem); this.E(bx - 2.2 * s, by - 3 * s + fl * 0.5, 2.8 * s, 1.6 * s, (nx, ny) => (ny < 0 ? pal.accent2 : pal.accent)); this.E(bx + 2.6 * s, by - 3.8 * s - fl * 0.5, 2.8 * s, 1.6 * s, (nx, ny) => (ny < 0 ? pal.accent2 : pal.accent)); }
    else if (kind === 'mohawk') { for (let i = 0; i < 4; i++) { const th = (-155 + i * 32) * DEG, x = H.cx + Math.cos(th) * H.r * 0.85, y = H.cy + Math.sin(th) * H.r * 0.85; this.Pg(rot([[-1.3, 1], [0, -3.6], [1.3, 1]], th + Math.PI / 2, s, x, y), i % 2 ? pal.accent : pal.accent2); } }
    else if (kind === 'petals') { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; this.E(bx + Math.cos(a) * 4 * s, by + 1 + Math.sin(a) * 3.2 * s, 2.2 * s, 2.2 * s, i % 2 ? pal.accent : pal.accent2); } this.E(bx, by, 1.8 * s, 1.6 * s, '#ffe04a'); }
    else if (kind === 'crown') { const c = '#ffd54a'; this.Pg([[bx - 3 * s, by + 1], [bx - 3 * s, by - 3.5 * s], [bx - 1.5 * s, by - 1.5 * s], [bx, by - 4.5 * s], [bx + 1.5 * s, by - 1.5 * s], [bx + 3 * s, by - 3.5 * s], [bx + 3 * s, by + 1]], c); this.Dot(bx, by - 1 * s, '#ff4a6a'); }
    else if (kind === 'curl') { let px = bx, py = by + 0.5; for (let i = 1; i <= 8; i++) { const a = -Math.PI / 2 + i * 0.75, r = (2.2 - i * 0.18) * s; const nx = bx + 1 * s + Math.cos(a) * r, ny = by - 2.2 * s + Math.sin(a) * r; this.Cap(px, py, nx, ny, 0.8 * s, 0.7 * s, pal.main); px = nx; py = ny; } }
    else if (kind === 'cap') { const c = pal.accent; this.E(bx, by + 1.6 * s, H.r * 0.95, 3 * s, (nx, ny, x, y) => (ny > 0.45 ? null : (x + y) % 3 === 0 ? dk(c, 0.3) : c)); this.Cap(bx, by - 1.4 * s, bx + 0.4 * s, by - 3 * s, 0.6 * s, 0.6 * s, dk(c, 0.3)); }
    else if (kind === 'mushroom') { const c = pal.accent, cy = by + 1.2 * s; this.E(bx, cy, H.r * 1.35, H.r * 0.72, (nx, ny) => (ny > 0.35 ? null : c)); const R = rng(this.seed + 'm'); for (let i = 0; i < 4; i++) this.E(bx + (R() - 0.5) * H.r * 1.8, cy - H.r * (0.15 + R() * 0.35), 0.9 * s, 0.8 * s, '#fff8ee'); }
  }
  mane(kind) {
    const H = this.A.head, pal = this.pal, cx = H.cx - H.r * 0.42, cy = H.cy + H.r * 0.12, R = H.r * 1.02, n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (this.fr.flick ? 0.12 : 0), x = cx + Math.cos(a) * R * 0.9, y = cy + Math.sin(a) * R * 0.85;
      const c = i % 2 ? pal.accent : dk(pal.accent, 0.15);
      if (kind === 'fluffy') this.E(x, y, H.r * 0.42, H.r * 0.42, c);
      else if (kind === 'spiky') this.Pg(rot([[-1.6, 0], [0, -4.2], [1.6, 0]], a + Math.PI / 2, H.r / 6.4, x, y), c);
      else if (kind === 'flame') { if (Math.sin(a) > 0.5) { this.E(x, y, H.r * 0.35, H.r * 0.35, c); continue; } this.Pg(rot([[-1.6, 0.5], [0.2 - (i % 2) * 0.5, -4.8 - (i % 3)], [1.6, 0.5]], a * 0.4 + Math.PI / 2 * 0.6 * Math.sign(Math.cos(a)) * 0 - 0, H.r / 6.4, x, y), i % 3 === 0 ? pal.accent2 : c); }
      else if (kind === 'leafy') this.Pg(rot([[0, 1], [-1.6, -2], [0, -4.6], [1.6, -2]], a + Math.PI / 2, H.r / 6.4, x, y), c);
    }
    this.E(cx, cy, R * 0.9, R * 0.84, dk(pal.accent, 0.08));
  }
  gills() {
    const H = this.A.head, c = this.pal.accent, s = H.r / 6.4, fl = this.fr.flick * 0.5;
    for (const [side, base] of [[-1, [H.cx - H.r * 0.75, H.cy + H.r * 0.1]], [1, [H.cx + H.r * 0.15, H.cy - H.r * 0.7]]]) {
      const angs = side < 0 ? [-2.4, -2.9, 2.75] : [-1.9, -1.45, -1.0];
      angs.forEach((a, i) => { const L = (3.6 - i * 0.3) * s, x = base[0] + Math.cos(a + fl) * L, y = base[1] + Math.sin(a + fl) * L; this.Cap(base[0], base[1], x, y, 0.9 * s, 0.7 * s, side < 0 ? dk(c, 0.1) : c); this.Dot(x, y, this.pal.accent2); });
    }
  }
  petalCollar() { const N = this.A.neck, c = this.pal.accent, s = this.A.head.r / 6.4; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; this.E(N.x + Math.cos(a) * 3.2 * s, N.y + Math.sin(a) * 1.4 * s + 0.5, 2.1 * s, 1.5 * s, i % 2 ? c : this.pal.accent2); } }

  // -------------------------------------------------------------- body parts
  backPts(n) { const B = this.A.back; if (B.length <= n) return B; const o = []; for (let i = 0; i < n; i++) o.push(B[Math.round((i * (B.length - 1)) / Math.max(1, n - 1))]); return o; }
  spikes(kind) {
    const pal = this.pal, s = Math.max(0.8, this.A.head.r / 6.4);
    const pts = this.backPts(kind === 'quills' ? 7 : this.k > 1.2 ? 5 : 4);
    pts.forEach((p, i) => {
      const a = p.a + Math.PI / 2;
      if (kind === 'back') this.Pg(rot([[-1.3, 1], [0, -3.4 - (i % 2) * 0.8], [1.3, 1]], a - 0.2, s, p.x, p.y), i % 2 ? pal.accent : pal.accent2);
      else if (kind === 'quills') { const L = 4.5 * s, aa = p.a - 0.45; this.Ln(p.x, p.y, p.x + Math.cos(aa) * L, p.y + Math.sin(aa) * L, i % 2 ? pal.accent2 : lt(pal.accent2, 0.3)); this.Ln(p.x + 0.6, p.y, p.x + 0.6 + Math.cos(aa + 0.15) * L * 0.8, p.y + Math.sin(aa + 0.15) * L * 0.8, pal.accent); }
      else if (kind === 'crystals') this.Pg(rot([[-1.4, 1], [-1, -2.4 - (i % 3)], [0, -3.6 - (i % 3)], [1, -2.4 - (i % 3)], [1.4, 1]], a - 0.25, s, p.x, p.y), i % 2 ? pal.accent : pal.accent2);
      else if (kind === 'studs') this.E(p.x, p.y, 1.3 * s, 1.3 * s, i % 2 ? pal.accent : pal.accent2);
    });
  }
  backFin(kind) {
    const pal = this.pal, B = this.A.back, s = Math.max(0.8, this.A.head.r / 6.4);
    if (kind === 'sail') {
      const top = B.map((p, i) => { const t = i / (B.length - 1), h = (1.5 + Math.sin(t * Math.PI) * 4.5) * s; return [p.x + Math.cos(p.a) * h - 0.6 * h * 0.3, p.y + Math.sin(p.a) * h]; });
      this.Pg([...B.map((p) => [p.x, p.y + 0.8]), ...top.reverse()], pal.accent);
      B.forEach((p, i) => { const t = top[B.length - 1 - i]; this.Ln(p.x, p.y, t[0], t[1], dk(pal.accent, 0.3)); });
      return;
    }
    const p = B[Math.floor(B.length / 2)];
    this.Pg(rot([[-2.4, 1], [0.6, -5 - this.fr.flick * 0.5], [2.4, 1]], p.a + Math.PI / 2 - 0.25, s, p.x, p.y), pal.accent);
  }
  sideFin() { const A = this.A, f = A.sideFin || { x: A.body.cx + A.body.rx * 0.2, y: A.body.cy + A.body.ry * 0.3 }, s = Math.max(0.8, (A.head.r || 6) / 6.4), fl = this.fr.flap * 0.8; this.Pg([[f.x, f.y], [f.x - 1 * s, f.y + 3.8 * s + fl], [f.x - 4.2 * s, f.y + 3 * s + fl], [f.x - 2.4 * s, f.y + 0.4]], this.pal.accent); }
  tentacles() { const U = this.A.under || { cx: this.A.body.cx, y: this.A.body.cy + this.A.body.ry * 0.7, rx: this.A.body.rx }; const ph = this.fr.phase >= 0 ? this.fr.phase : this.fr.flick; for (let i = 0; i < 5; i++) { const x0 = U.cx - U.rx * 0.65 + (i * U.rx * 1.3) / 4; let px = x0, py = U.y; for (let j = 1; j <= 4; j++) { const nx = x0 + Math.sin(j * 1.2 + ph * 1.5 + i) * 1.2, ny = U.y + j * 1.7; this.Cap(px, py, nx, ny, 1.1 - j * 0.15, 1 - j * 0.15, j === 4 ? this.pal.accent : i % 2 ? this.pal.main : dk(this.pal.main, 0.12)); px = nx; py = ny; } } }
  vines() { const B = this.A.body, c = this.pal.accent; for (const fx of [-0.55, 0.1]) { const x = B.cx + B.rx * fx, y = B.cy + B.ry * 0.3; for (let j = 0; j < 4; j++) { this.Dot(x + Math.sin(j + this.fr.flick) * 0.8, y + j * 1.4, dk(c, 0.2)); if (j % 2) this.E(x + 0.8, y + j * 1.4, 0.9, 0.7, c); } } }
  backLeaves(kind) {
    const pal = this.pal, s = Math.max(0.85, this.A.head.r / 6.4), B = this.A.back;
    if (kind === 'bloom') { const p = B[Math.floor(B.length / 2)]; const cx = p.x + Math.cos(p.a) * 1.5, cy = p.y + Math.sin(p.a) * 1.5; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; this.E(cx + Math.cos(a) * 2.8 * s, cy + Math.sin(a) * 2.4 * s, 2.2 * s, 2 * s, i % 2 ? pal.accent : pal.accent2); } this.E(cx, cy, 1.6 * s, 1.5 * s, '#ffe04a'); return; }
    if (kind === 'mushrooms') { this.backPts(3).forEach((p, i) => { const h = (1.8 + i % 2) * s; const tx = p.x + Math.cos(p.a) * h, ty = p.y + Math.sin(p.a) * h; this.Cap(p.x, p.y, tx, ty, 0.7 * s, 0.6 * s, '#f4ead8'); this.E(tx, ty - 0.3, 2 * s, 1.3 * s, (nx, ny) => (ny > 0.3 ? null : pal.accent)); this.Dot(tx - 0.6 * s, ty - 0.8 * s, '#ffffff'); }); return; }
    this.backPts(3).forEach((p, i) => { const pts = rot([[0, 1], [-1.8, -2], [0, -5.2 - (i % 2)], [1.8, -2]], p.a + Math.PI / 2 - 0.35 + (i - 1) * 0.3, s, p.x, p.y); this.Pg(pts, i % 2 ? pal.accent : dk(pal.accent, 0.1)); this.Ln(pts[0][0], pts[0][1], pts[2][0], pts[2][1], dk(pal.accent, 0.3)); });
  }
  shellDome(style, cx, cy, rx, ry) {
    const pal = this.pal, c = pal.accent, d = dk(c, 0.32), rim = pal.accent2, k = this.k;
    if (style === 'spiral') { const R = Math.max(rx, ry) * 0.72, sx = cx - rx * 0.1, sy = cy - ry * 0.45; this.E(sx, sy, R, R, c); for (let i = 0; i < 60; i++) { const t = i / 60, a = t * Math.PI * 4, r = R * (1 - t) * 0.9; this.Dot(sx + Math.cos(a) * r, sy + Math.sin(a) * r, d); } return; }
    this.E(cx, cy, rx, ry, (nx, ny) => (ny > 0.12 ? null : ny > -0.05 ? rim : c));
    if (style === 'plates') { for (let i = -2; i <= 2; i++) this.Ln(cx + i * rx * 0.3, cy - ry * 0.9 + Math.abs(i) * 1.2, cx + i * rx * 0.36, cy, d); return; }
    // hex-ish plate lines
    const top = cy - ry; this.Ln(cx - rx * 0.4, cy - ry * 0.55, cx + rx * 0.4, cy - ry * 0.55, d);
    for (const f of [-0.7, -0.2, 0.3, 0.75]) this.Ln(cx + rx * f, cy - 0.2, cx + rx * f * 0.6, cy - ry * 0.55, d);
    for (const f of [-0.4, 0.4]) this.Ln(cx + rx * f, cy - ry * 0.55, cx + rx * f * 0.6, top + 1, d);
    if (style === 'spiky') for (const f of [-0.55, 0, 0.55]) { const x = cx + rx * f, y = cy - ry * Math.sqrt(1 - f * f) + 0.5; this.Pg([[x - 1.4 * k, y + 1], [x, y - 3.4], [x + 1.4 * k, y + 1]], rim); }
  }
  shellPart(style) { const B = this.A.body; const rx = (B.rx || 6) * 1.02, ry = (B.ry || 5) * 0.95; this.shellDome(style, B.cx - (B.rx || 6) * 0.15, B.cy - (B.ry || 5) * 0.1 + (style === 'spiral' ? 0 : ry * 0.05), rx, ry); }

  // -------------------------------------------------------------- tail
  tail(kind, T) {
    const pal = this.pal, s = T.s * Math.max(0.85, this.A.head.r / 6.4), wig = this.fr.wig, fl = this.fr.flick;
    const tipC = this.pat.has('tipped') ? pal.accent2 : pal.accent, rings = this.pat.has('rings');
    const path = (len, rise, r0, r1, col = pal.main, n = 7) => {
      let px = T.x, py = T.y, out = [T.x, T.y];
      for (let i = 1; i <= n; i++) { const t = i / n, x = T.x - len * s * t, y = T.y - rise * s * Math.pow(t, 1.4) + wig * Math.sin(t * Math.PI) * 0.9 * s; this.Cap(px, py, x, y, (r0 + (r1 - r0) * (t - 1 / n)) * s, (r0 + (r1 - r0) * t) * s, rings && i % 2 ? pal.pattern : col); px = x; py = y; out = [x, y]; }
      return out;
    };
    if (kind === 'flame') { const [x, y] = path(4, 3.2, 1.3, 0.9); this.E(x - 0.5, y, 2.2 * s, 2 * s, pal.accent); this.Pg(rot([[-2.2, 1], [-2.6, -2.5 - fl], [-0.8, -1.5], [0, -5.6 + fl], [1, -1.5], [2.4, -3], [2.2, 1]], -0.3, s, x - 0.5, y - 1), pal.accent); this.Pg(rot([[-1, 0.5], [0, -3.2 + fl], [1, 0.5]], -0.3, s, x - 0.5, y - 0.5), pal.accent2); }
    else if (kind === 'leaf') { const [x, y] = path(3.5, 2.6, 0.7, 0.55, pal.stem); const pts = rot([[0, 0], [-3, -2.2], [-6.4, -1], [-3.2, 1.2]], -0.5 + wig * 0.15, s, x, y); this.Pg(pts, tipC); this.Ln(pts[0][0], pts[0][1], pts[2][0], pts[2][1], dk(pal.accent, 0.3)); }
    else if (kind === 'fin') { const [x, y] = path(2.6, 0.6, 1.7, 1.1); this.Pg(rot([[0.5, -0.6], [-4, -4.6 - fl], [-2.4, 0], [-4, 4.2 + fl], [0.5, 0.8]], wig * 0.15, s, x, y), tipC); }
    else if (kind === 'club') { const [x, y] = path(5, 1.6, 1.5, 1.1); this.E(x - 1, y, 2.8 * s, 2.5 * s, pal.accent); for (const a of [-2.2, -1.2, 2.4]) this.Pg(rot([[-0.9, 0], [0, -2.2], [0.9, 0]], a, s, x - 1 + Math.cos(a - Math.PI / 2) * 2.4 * s, y + Math.sin(a - Math.PI / 2) * 2.4 * s), pal.accent2); }
    else if (kind === 'curly') { let px = T.x, py = T.y; const cx = T.x - 2.2 * s, cy = T.y - 1.8 * s; for (let i = 1; i <= 12; i++) { const a = i * 0.5 + (fl ? 0.2 : 0), r = (2.2 - i * 0.1) * s; const nx = cx + Math.cos(a) * r, ny = cy + Math.sin(a) * r; this.Cap(px, py, nx, ny, 0.9 * s, 0.8 * s, pal.main); px = nx; py = ny; } }
    else if (kind === 'split') { const [x, y] = path(4, 3, 1.3, 0.8); for (const [dx, dy] of [[-2.8, -2.6], [-3.2, 0.6]]) { const ex = x + (dx - wig * 0.3) * s, ey = y + dy * s; this.Cap(x, y, ex, ey, 0.7 * s, 0.5 * s, pal.main); this.Pg(rot([[-1.2, 0], [0, -2], [1.2, 0]], Math.atan2(ey - y, ex - x) + Math.PI / 2, s, ex, ey), tipC); } }
    else if (kind === 'fluffy') { this.E(T.x - 2.6 * s - wig * 0.4, T.y - 3.4 * s, 3.4 * s, 4.2 * s, pal.main); this.E(T.x - 3.2 * s - wig * 0.4, T.y - 6.4 * s, 2 * s, 1.5 * s, this.pat.has('tipped') ? pal.accent2 : lt(pal.main, 0.55)); }
    else if (kind === 'bolt') { const x = T.x, y = T.y, f = fl; this.Pg(rot([[1, -1], [-4, -4], [-2, -4], [-7, -9 - f], [-3, -3], [-5, -3], [1, 2]], 0, s, x, y), pal.accent); }
    else if (kind === 'stinger') { let px = T.x, py = T.y; for (let i = 1; i <= 6; i++) { const t = i / 6, x = T.x - 3.5 * s * Math.sin(t * Math.PI * 0.75) - wig * 0.4 * t, y = T.y - 7 * s * t; this.Cap(px, py, x, y, (1.4 - t * 0.4) * s, (1.3 - t * 0.4) * s, i % 2 ? pal.main : dk(pal.main, 0.15)); px = x; py = y; } this.Pg([[px - 1 * s, py], [px + 3.2 * s, py + 1 * s + (this.fr.atk ? 1 : 0)], [px + 0.4 * s, py + 1.4 * s]], tipC); }
    else if (kind === 'long') { const [x, y] = path(8, 1.6, 1.1, 0.55, pal.main, 9); this.E(x - 0.6, y, 1.6 * s, 1.4 * s, tipC); }
    else if (kind === 'fan') { for (let i = 0; i < 4; i++) { const a = (162 + i * 18 + wig * 4) * DEG, L = 5.4 * s; const ex = T.x + Math.cos(a) * L, ey = T.y + Math.sin(a) * L * 0.9 - 1; this.Cap(T.x, T.y, ex, ey, 1 * s, 1.3 * s, i % 2 ? pal.main : dk(pal.main, 0.12)); this.E(ex, ey, 1.2 * s, 1.2 * s, tipC); } }
  }

  // -------------------------------------------------------------- wings
  wing(kind, W, far) {
    const pal = this.pal, s = W.s * (this.form.plan === 'flyer' ? 1 : 0.95);
    const flap = this.fr.flap, ang = -0.1 + flap * 0.55 + (far ? -0.2 : 0);
    const bx = W.x + (far ? 1.2 : 0), by = W.y + (far ? -0.8 : 0);
    const wc = pal.wing || (kind === 'feather' || kind === 'tiny' ? pal.main : pal.accent);
    const D = (c) => (far ? dk(c, 0.2) : c), R = (pts) => rot(pts, ang, s, bx, by);
    this.layer(() => {
      if (kind === 'feather') { this.Pg(R([[0, 0], [1, -2.5], [-2, -5.5], [-6, -7], [-10, -6.5], [-9, -4.5], [-11, -3.5], [-9, -2], [-10, -0.5], [-7, 0.5], [-7.5, 2], [-4, 2]]), D(wc)); this.Pg(R([[-6, -7], [-10, -6.5], [-9, -4.5], [-11, -3.5], [-9, -2], [-10, -0.5], [-7, 0.5], [-6.4, -3]]), D(pal.accent)); const l = R([[-1, -2], [-6, -4.5]]); this.Ln(l[0][0], l[0][1], l[1][0], l[1][1], D(lt(wc, 0.25))); }
      else if (kind === 'bat') { const p = R([[0, 0], [-1, -6], [-4, -8], [-10, -7.5], [-8.5, -4.5], [-9.5, -2], [-6.5, -2.5], [-6, 0.5], [-3.5, -1], [-1.5, 2]]); this.Pg(p, D(mix(pal.accent, pal.main, 0.35))); for (const t of [3, 5, 7]) this.Ln(p[2][0], p[2][1], p[t][0], p[t][1], D(dk(pal.main, 0.3))); this.Ln(p[0][0], p[0][1], p[1][0], p[1][1], D(pal.main)); this.Ln(p[1][0], p[1][1], p[2][0], p[2][1], D(pal.main)); }
      else if (kind === 'bug') { const c = pal.wing || '#e8f6ff'; this.Pg(R(ellPts(-4.6, -3.6, 5, 2.4, -0.45)), D(c)); this.Pg(R(ellPts(-3.4, 0, 3.4, 1.7, 0.25)), D(lt(c, 0.3))); const v = R([[0, 0], [-8, -6]]); this.Ln(v[0][0], v[0][1], v[1][0], v[1][1], D('#9ad0f0')); }
      else if (kind === 'fairy') { this.Pg(R(ellPts(-4.6, -4.4, 4.8, 3.6, -0.5)), D(pal.accent)); this.Pg(R(ellPts(-4.6, -4.4, 2.6, 1.9, -0.5)), D(pal.accent2)); this.Pg(R(ellPts(-3.4, 0.8, 3, 2.1, 0.45)), D(pal.accent)); const c = R([[-5.6, -5]])[0]; this.E(c[0], c[1], 0.9, 0.9, D(pal.main)); }
      else if (kind === 'tiny') { this.Pg(R(ellPts(-1.8, -1, 2.6, 1.6, -0.4)), D(wc)); this.Pg(R(ellPts(-3.4, -1.8, 1.1, 0.9, -0.4)), D(pal.accent)); }
      else if (kind === 'fin') { const p = R([[0, 0], [-3, -5], [-9, -6], [-6, -3], [-8, -1], [-2, 1.2]]); this.Pg(p, D(pal.accent)); for (const t of [2, 4]) this.Ln(p[0][0], p[0][1], p[t][0], p[t][1], D(dk(pal.accent, 0.3))); }
      else if (kind === 'flame') { this.Pg(R([[0, 0], [-2, -5], [-3, -3], [-6, -8 - this.fr.flick], [-6, -3], [-9, -5], [-7, 0], [-3, 1.5]]), D(pal.accent)); this.Pg(R([[-1, -0.5], [-3, -3.5], [-4.5, -1.5], [-2, 0.5]]), D(pal.accent2)); }
      else if (kind === 'leaf') { const p = R(ellPts(-4.2, -3, 5, 2.1, -0.6)); this.Pg(p, D(pal.accent)); const v = R([[0, 0], [-8.4, -5.5]]); this.Ln(v[0][0], v[0][1], v[1][0], v[1][1], D(dk(pal.accent, 0.3))); }
    }, { shade: kind !== 'bug' });
  }

  gem(where) {
    const A = this.A, H = A.head, c = this.pal.gem, k = this.k; let x, y;
    if (where === 'forehead') { const F = this.faceAnchor(); x = F.x; y = F.y - F.gap * 1.25; }
    else if (where === 'chest') { const b = A.belly || A.body; x = (b.cx || A.body.cx) + 0.5; y = (b.cy || A.body.cy) - (b.ry || 3) * 0.45; if (A.body.kind === 'chain') { const p = A.chain[12]; x = p.x + 1; y = p.y; } }
    else if (where === 'tail') { x = A.tail.x; y = A.tail.y - 0.5; }
    else { const p = A.back[Math.floor(A.back.length / 2)]; x = p.x; y = p.y + 1; }
    const r = Math.max(1.2, 1.3 * k * Math.max(0.8, H.r / 6.4));
    this.g.ell(this.X(x), this.Y(y), r, r, (nx, ny) => (ny < -0.3 && nx < 0 ? '#ffffff' : ny > 0.3 ? dk(c, 0.3) : c));
  }
}

// edge-based shading: lit top edge, shadowed bottom/right edges, darker bottom rim
function shadeLayer(L, k) {
  const w = L.w, h = L.h, src = L.px.slice(), d = Math.max(1, Math.round(k * 1.3));
  const e = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !src[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = src[y * w + x]; if (!c) continue;
    if (e(x, y + 1)) { L.px[y * w + x] = dk(c, 0.42); continue; }
    let sh = false; for (let j = 2; j <= d + 1 && !sh; j++) if (e(x, y + j)) sh = true;
    if (!sh && e(x + 1, y)) sh = true;
    if (sh) { L.px[y * w + x] = dk(c, 0.24); continue; }
    if (e(x, y - 1) || (e(x - 1, y) && e(x - 1, y - 1))) L.px[y * w + x] = lt(c, 0.3);
  }
}

// Render all 9 frames of a form, cropped to their shared box.
// Returns { frames: {name: Grid}, w, h, ax, footY }: ax = body centre x, footY = ground row.
export function renderForm(form, typeCol, seed = form.name) {
  const grids = {}; let bb = null, meta = null;
  for (const fr of FRAMES) {
    const P = new Painter(form, fr, typeCol, seed);
    const g = P.render(); grids[fr] = g; meta = P;
    const b = g.bbox(); if (!b) continue;
    bb = bb ? { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) } : b;
  }
  bb = bb || { x0: 0, y0: 0, x1: 1, y1: 1 };
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  const frames = {}; for (const fr of FRAMES) frames[fr] = grids[fr].crop(bb.x0, bb.y0, w, h);
  return { frames, w, h, ax: meta.ox + 16 * meta.k - bb.x0, footY: Math.min(h, meta.oy + G * meta.k - bb.y0 + 0.5) };
}

// ---- batch2: extra part values (water/ice/sky batch) ----
// crest 'spout': a whale's water spout fountaining up from the top of the head/body.
PARTS.crest.spout = 'Water spout fountaining from the top (whales).';
// crest 'puffs': a cluster of round cloud bumps over the top (clouds, cotton, foam).
PARTS.crest.puffs = 'Cluster of round cloud puffs over the top.';
{
  const baseCrest = Painter.prototype.crest;
  Painter.prototype.crest = function (kind) {
    if (kind === 'puffs') {
      const H = this.A.head, r = H.r, c = this.pal.main, fl = this.fr.flick * 0.3;
      const cx = H.cx, cy = H.cy - r * (H.virtual ? 0.55 : 0.7);
      this.E(cx - r * 0.62, cy + r * 0.25, r * 0.5, r * 0.45, c);
      this.E(cx + r * 0.6, cy + r * 0.2 - fl, r * 0.48, r * 0.44, c);
      this.E(cx - r * 0.12, cy - r * 0.15 + fl, r * 0.62, r * 0.55, c);
      this.E(cx - r * 0.25, cy - r * 0.3 + fl, r * 0.22, r * 0.14, lt(c, 0.5));
      return;
    }
    if (kind !== 'spout') return baseCrest.call(this, kind);
    const H = this.A.head, s = H.r / 6.4, fl = this.fr.flick;
    const bx = H.cx + H.r * 0.05, by = H.cy - H.r * (H.virtual ? 0.85 : 0.88);
    const w = '#7ccff8', w2 = '#e4f8ff', top = by - 5.2 * s - fl * 0.4;
    this.Cap(bx, by + 1, bx, top, 1.1 * s, 0.8 * s, w);
    for (const o of [-1, 1]) {
      this.Cap(bx, top, bx + o * 2.6 * s, top - 0.6 * s, 0.9 * s, 0.9 * s, w);
      this.Cap(bx + o * 2.6 * s, top - 0.6 * s, bx + o * 3.8 * s, top + 1.6 * s, 0.9 * s, 0.6 * s, w);
      this.E(bx + o * 4.2 * s, top + 3.4 * s + fl * 0.3, 0.75 * s, 0.85 * s, w);
    }
    this.Cap(bx, by - 0.5 * s, bx, top, 0.4 * s, 0.4 * s, w2);
    this.E(bx, top - 0.4 * s, 1.0 * s, 0.7 * s, w2);
  };
}
