// Procedural 32x32 pixel textures. The N64 had ~4KB of texture memory, so
// 32x32 is not a stylistic choice so much as a historical one.
import * as THREE from 'three';

const SIZE = 32;
const cache = new Map();

/* ---------------- colour helpers ---------------- */
export function hexToRgb(h) {
  if (typeof h === 'string') {
    // ACCEPT WHAT WE PRODUCE. shade() hands back 'rgb(r,g,b)' and mix()
    // takes colours in - so without this, composing the two silently
    // parses 'rgb(63,82,58)' as hex, gets NaN, and paints black. Which is
    // exactly what it did: the canopy came out at mean luminance 10.
    if (h.charCodeAt(0) !== 35) {           // not '#', so it is 'rgb(...)'
      const p = h.slice(h.indexOf('(') + 1, h.indexOf(')')).split(',');
      return [+p[0] | 0, +p[1] | 0, +p[2] | 0];
    }
    h = parseInt(h.slice(1), 16);
  }
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}
export function rgbToCss(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
/** amt > 0 lightens, amt < 0 darkens. Returns a CSS colour for canvas use. */
export function shade(hex, amt) {
  const [r, g, b] = shadeRgb(hex, amt);
  return rgbToCss(r, g, b);
}

/** Same shift, but returns '#rrggbb' so it can be fed back into these builders. */
export function shadeHex(hex, amt) {
  const [r, g, b] = shadeRgb(hex, amt);
  const v = ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
  return '#' + v.toString(16).padStart(6, '0');
}

// =====================================================================
// LIGHT IS WARM AND SHADOW IS COOL
// =====================================================================
//
// This function used to mix towards pure black and pure white, and it is
// the reason every texture in the game measured as ONE HUE. Measured, on
// the sixteen sheets, before this change:
//
//     colours 10   hues 1.4   contrast 85
//
// A sheet built out of shade(base, ±k) cannot be anything else: every
// texel is on the straight line from black to the base colour to white,
// so however much noise is scattered over it there is exactly one hue in
// there and about eight values of it.
//
// Real 16-bit art - and real surfaces - do not work that way. A shadow
// takes its colour from the sky and goes BLUE; a highlight takes its
// colour from the light and goes AMBER. Rotating the hue as the value
// changes costs nothing, changes no call site, and is most of the
// difference between "a brown rectangle" and "wood".
//
// The two ends are deliberately not extreme. Mix towards real black and
// the shadows go muddy; these are a deep slate-violet and a warm bone.
const SHADOW = [26, 24, 44];
const LIGHT  = [255, 246, 214];

function shadeRgb(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? SHADOW : LIGHT, p = Math.abs(amt);
  return [r + (t[0] - r) * p, g + (t[1] - g) * p, b + (t[2] - b) * p];
}

/**
 * Mix two colours; 0 is all `a`, 1 is all `b`.
 *
 * Returns HEX rather than `rgb(...)`, because `shade(mix(...))` and
 * `mix(mix(...), ...)` are written constantly below and the result has to
 * be something every one of these functions reads the same way.
 */
export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  const v = (((r1 + (r2 - r1) * t) | 0) << 16) | (((g1 + (g2 - g1) * t) | 0) << 8)
          | ((b1 + (b2 - b1) * t) | 0);
  return '#' + (v >>> 0).toString(16).padStart(6, '0');
}

/**
 * A shade of `color` with the amount jittered, so a surface gets a RAMP
 * of tones instead of the same three.
 *
 * Nearly every generator here used to pick from a fixed pair -
 * `shade(c, -0.2)` and `shade(c, 0.12)` - which is why half the sheets
 * measured five distinct colours whatever was drawn on them. A hand
 * painted 32-pixel texture has twenty or thirty tones in it; this is how
 * they get there without inventing structure that is not real.
 */
function vary(color, rand, base, spread) {
  return shade(color, base + (rand() - 0.5) * spread);
}

// =====================================================================
// ORDERED DITHER - the technique, not a trick
// =====================================================================
//
// The N64 rendered 16-bit colour and dithered its way between the steps,
// and the artists dithered their textures for the same reason: a 4x4
// Bayer matrix turns two colours into a readable gradient that costs no
// extra palette entries. It is the one thing you can do on a 32-pixel
// sheet that genuinely multiplies the colour count without inventing
// detail that is not there.
//
// `f(x, y)` returns 0..1 - how far towards `b` this texel should be. Any
// gradient, any falloff, any blob.
const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

// AND WHY THE THRESHOLD IS JITTERED.
//
// A pure Bayer dither over a field where `f` is nearly CONSTANT lays
// down the 4x4 matrix itself, unchanged, across the whole area. At one
// texel per pixel that is invisible and correct. Magnified - which is
// what a ground tile under a third-person camera is - it becomes a
// four-pixel CHECKERBOARD, and the snow on the mountain came out looking
// like a bathroom floor.
//
// A deterministic per-texel jitter of about a tenth of the range breaks
// the lock without softening the pattern anywhere it is doing real work,
// because where `f` varies the gradient dominates the jitter.
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function dither(ctx, s, a, b, f, alpha = 1) {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const t = f(x, y);
    if (t <= 0) continue;
    const on = t * 16 > BAYER[y & 3][x & 3] + (hash2(x, y) - 0.5) * 3.2;
    if (!on && t < 1) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/**
 * A soft blob, dithered. Every generator below wants this: it is how a
 * stain, a bruise, a patch of rust or a knot in wood is drawn without
 * either a hard edge or a blur.
 */
function blob(ctx, s, cx, cy, r, colour, strength = 1) {
  dither(ctx, s, null, colour, (x, y) => {
    const dx = Math.min(Math.abs(x - cx), s - Math.abs(x - cx));
    const dy = Math.min(Math.abs(y - cy), s - Math.abs(y - cy));
    const d = Math.hypot(dx, dy) / r;
    return d >= 1 ? 0 : (1 - d) * strength;
  });
}

/* ---------------- deterministic rng ---------------- */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------- core ---------------- */
function makeTex(key, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  draw(x, rng(seedOf(key)), SIZE);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.sourceColor = key.replace(/^[a-z]+/, '');
  // Remember WHICH generator drew this, not just what colour it was drawn in.
  // That is what lets a whole model be repainted afterwards -- a dark goblin is
  // the same goblin with every texture regenerated in a different colour.
  t.sourceKind = (key.match(/^[a-z]+/) || [''])[0];
  cache.set(key, t);
  return t;
}

/** Generators that can be re-run for a different colour, by name. */
const GENERATORS = {};
export function registerGenerator(name, fn) { GENERATORS[name] = fn; }

/**
 * Redraw a texture in a new colour using the generator that made it.
 * Returns the original if it did not come from one of ours.
 */
export function retint(map, color) {
  if (!map || !map.sourceKind) return map;
  const gen = GENERATORS[map.sourceKind];
  return gen ? gen(color) : map;
}

/**
 * Repaint an entire built model. `shift` maps an original colour to a new one;
 * anything not named is passed through `fallback(hex)`, which is how a whole
 * creature gets pushed into a palette in one pass.
 */
export function repaint(root, { shift = {}, fallback = null } = {}) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (!m.map || !m.map.sourceColor) return m;
      const src = m.map.sourceColor;
      const want = shift[src] || (fallback ? fallback(src) : null);
      if (!want || want === src) return m;
      const next = m.clone();
      next.map = retint(m.map, want);
      next.needsUpdate = true;
      return next;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return root;
}

/** speckle noise: the workhorse of every texture below */
function speckle(x, rand, n, colors, s) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[(rand() * colors.length) | 0];
    x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
  }
}

/* ---------------- materials ----------------
 *
 * MEASURED, then rebuilt. `node tools/tex.mjs` reports, per sheet, the
 * number of distinct colours, the number of distinct HUES, the contrast
 * and the share of texels that sit on an edge. Before this pass the
 * sixteen sheets averaged 10 colours, 1.4 hues and 85 contrast, with 40%
 * of texels on an edge - which sounds like a lot of detail and is not.
 * It was per-pixel `speckle()` static over a single-hue gradient: noise
 * where there should be STRUCTURE.
 *
 * Three rules came out of doing this the same way on HIGHRISE:
 *
 *  1. STRUCTURE, NOT STATIC. Courses, grain, rings, weave, scales. A
 *     surface is made of THINGS, and at 32 pixels you can still see
 *     three or four of them. Noise is what goes on top afterwards.
 *  2. EVERY MATERIAL FAILS IN ITS OWN WAY. Steel chips to bare metal and
 *     bleeds rust DOWNWARDS from each rivet. Cloth frays at a cut edge
 *     and gets darned. Leather cracks along the fold it is bent at.
 *     Wood splits away from a knot. Bone stains at the ends. Running one
 *     `speckle()` over all of them is what makes fifteen materials look
 *     like one material.
 *  3. HUE MOVES WITH VALUE - see the note on shade(), above.
 */

/** Woven fabric - tunics, robes, cloaks. */
export function clothTex(color) {
  return makeTex('cloth' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // THE WEAVE. Weft goes over and under warp, so a woven surface is a
    // two-tone checker at thread scale - not stripes.
    for (let y = 0; y < s; y++) for (let i = 0; i < s; i++) {
      const over = ((i >> 1) + (y >> 1)) & 1;
      x.fillStyle = vary(color, rand, over ? 0.11 : -0.13, 0.13);
      x.fillRect(i, y, 1, 1);
    }
    // dye takes unevenly on hand-dyed cloth: two or three soft patches
    for (let i = 0; i < 3; i++) {
      blob(x, s, rand() * s, rand() * s, 6 + rand() * 7,
        shade(color, rand() < 0.5 ? -0.2 : 0.16), 0.55);
    }
    // ITS OWN WEAR: fraying at a cut edge, and one darned patch in a
    // wool that never quite matched.
    x.fillStyle = shade(color, -0.45);
    for (let i = 0; i < s; i++) if (rand() < 0.5) x.fillRect(i, 0, 1, 1 + ((rand() * 2) | 0));
    const dx = (rand() * (s - 6)) | 0, dy = 6 + ((rand() * (s - 12)) | 0);
    for (let a = 0; a < 5; a++) for (let q = 0; q < 4; q++) {
      x.fillStyle = shade(mix(color, '#8a7f6a', 0.5), ((a + q) & 1) ? 0.08 : -0.1);
      x.fillRect(dx + a, dy + q, 1, 1);
    }
  });
}

/** Steel / iron plate with rivets. */
export function metalTex(color) {
  return makeTex('metal' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // brushed sheen, dithered rather than banded - a hard band on metal
    // reads as a painted stripe
    dither(x, s, null, shade(color, 0.30), (i) => Math.max(0, Math.sin(i * 0.42) * 0.8));
    dither(x, s, null, shade(color, -0.26), (i) => Math.max(0, -Math.sin(i * 0.42 + 1.1) * 0.7));
    // a plate seam, with rivets LIT ON TOP that drop a shadow - a rivet
    // drawn as one bright square is a bright square
    const seam = (s / 2) | 0;
    x.fillStyle = shade(color, -0.5); x.fillRect(0, seam, s, 1);
    x.fillStyle = shade(color, 0.18); x.fillRect(0, seam + 1, s, 1);
    for (let i = 3; i < s; i += 8) {
      x.fillStyle = shade(color, 0.55); x.fillRect(i, seam - 3, 2, 1);
      x.fillStyle = shade(color, 0.20); x.fillRect(i, seam - 2, 2, 1);
      x.fillStyle = shade(color, -0.45); x.fillRect(i, seam - 1, 2, 1);
      // ITS OWN WEAR: rust bleeds DOWN from the fixing, because water does
      let y = seam + 2;
      while (y < s && rand() < 0.72) {
        x.fillStyle = mix('#7a3b1c', shade(color, -0.1), (y - seam) / s);
        x.fillRect(i + ((rand() * 2) | 0), y, 1, 1);
        y++;
      }
    }
    // chipped to bare metal on the high points
    for (let i = 0; i < 7; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      x.fillStyle = vary(color, rand, 0.42, 0.28); x.fillRect(cx, cy, 1 + ((rand() * 2) | 0), 1);
      x.fillStyle = vary(color, rand, -0.4, 0.24); x.fillRect(cx, cy + 1, 1, 1);
    }
  });
}

/** Chainmail - real rings, offset row to row. */
export function mailTex(color) {
  return makeTex('mail' + color, (x, rand, s) => {
    // the gambeson underneath shows through every gap; without it the
    // mail reads as a dotted metal sheet
    x.fillStyle = shade(mix(color, '#3a3128', 0.55), -0.3);
    x.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 3) {
      const off = (y / 3) & 1 ? 2 : 0;
      for (let i = off; i < s + 4; i += 4) {
        // a ring: lit on the upper left, dark on the lower right, hole
        // through the middle
        x.fillStyle = vary(color, rand, 0.34, 0.18); x.fillRect(i % s, y, 3, 1);
        x.fillStyle = vary(color, rand, 0.02, 0.14); x.fillRect(i % s, y + 1, 1, 1);
        x.fillStyle = vary(color, rand, -0.34, 0.18); x.fillRect((i + 2) % s, y + 1, 1, 1);
        x.fillStyle = vary(color, rand, -0.18, 0.16); x.fillRect(i % s, y + 2, 3, 1);
      }
    }
    // ITS OWN WEAR: burst rings, showing the padding through the hole
    for (let i = 0; i < 4; i++) {
      x.fillStyle = shade('#3a3128', -0.35);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 2, 2);
    }
    // and a polished patch where a strap has rubbed it bright
    blob(x, s, rand() * s, rand() * s, 7, shade(color, 0.32), 0.5);
  });
}

/** Leather - belts, boots, quivers, archer gear. */
export function leatherTex(color) {
  return makeTex('leather' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // PEBBLE GRAIN: scattered cells, each lit on top and shadowed below.
    // This is what makes leather read as leather and not as felt.
    for (let i = 0; i < 90; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      x.fillStyle = vary(color, rand, 0.13, 0.16); x.fillRect(cx, cy, 2, 1);
      x.fillStyle = vary(color, rand, -0.20, 0.16); x.fillRect(cx, cy + 1, 2, 1);
    }
    // THE FOLD. Leather is bent in one place all its life, and that is
    // where it darkens, creases and finally cracks.
    const fy = 8 + ((rand() * (s - 16)) | 0);
    dither(x, s, null, shade(color, -0.30), (_i, y) => Math.max(0, 1 - Math.abs(y - fy) / 4));
    for (let i = 0; i < s; i += 1 + ((rand() * 3) | 0)) {
      x.fillStyle = shade(color, -0.5);
      x.fillRect(i, fy + ((rand() * 3) | 0) - 1, 1 + ((rand() * 2) | 0), 1);
    }
    // scuffed pale where it rubs, and waxed stitching down both edges
    blob(x, s, rand() * s, rand() * s, 5, shade(color, 0.26), 0.6);
    x.fillStyle = mix(color, '#e8dfc8', 0.7);
    for (let y = 1; y < s; y += 3) { x.fillRect(1, y, 1, 2); x.fillRect(s - 2, y, 1, 2); }
  });
}

/** Bare skin / flesh. */
export function skinTex(color) {
  return makeTex('skin' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // SUBSURFACE. Skin is lit THROUGH, not just on - so the mid tones go
    // red and the thin places go redder. Without it a skin sheet is the
    // same construction as a cloth sheet in a paler colour.
    dither(x, s, null, mix(color, '#b2543f', 0.45),
      (i, y) => 0.42 * (0.5 + 0.5 * Math.sin(i * 0.5 + y * 0.31)));
    for (let i = 0; i < 3; i++) {
      blob(x, s, rand() * s, rand() * s, 5 + rand() * 4, mix(color, '#c06a5a', 0.5), 0.4);
    }
    // pores, and a few freckles - one pixel each, not a spray
    for (let i = 0; i < 26; i++) {
      x.fillStyle = vary(color, rand, -0.14, 0.20);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
    for (let i = 0; i < 5; i++) {
      x.fillStyle = mix(color, '#6b4326', 0.35 + rand() * 0.4);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
  });
}

/** Rotting flesh - blotches, wounds, and a hue that has gone wrong. */
export function rotTex(color) {
  return makeTex('rot' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // decay is a HUE shift, not a value one: living flesh goes green,
    // then grey, then purple where the blood has settled
    for (let i = 0; i < 5; i++) {
      blob(x, s, rand() * s, rand() * s, 5 + rand() * 6,
        mix(color, i & 1 ? '#4a3350' : '#7c8a3a', 0.55), 0.7);
    }
    // WOUNDS: a dark opening with a paler torn rim, not a red square
    for (let i = 0; i < 5; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      const w = 2 + ((rand() * 4) | 0), h = 2 + ((rand() * 3) | 0);
      x.fillStyle = mix(color, '#e0b0a0', 0.5);
      x.fillRect(cx - 1, cy - 1, w + 2, h + 2);
      x.fillStyle = '#5a2430'; x.fillRect(cx, cy, w, h);
      x.fillStyle = '#2a0f16'; x.fillRect(cx, cy + h - 1, w, 1);
    }
    for (let i = 0; i < 60; i++) {
      x.fillStyle = rand() < 0.5 ? vary(color, rand, -0.35, 0.28) : mix(color, '#c9c07a', 0.15 + rand() * 0.5);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
  });
}

/** Dry bone. */
export function boneTex(color = '#ded3b4') {
  return makeTex('bone' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // bone is a bundle of lengthwise fibres, so the grain runs one way
    dither(x, s, null, shade(color, -0.16), (i) => 0.5 + 0.5 * Math.sin(i * 1.1));
    // POROUS ENDS. The cancellous bone at each end is full of pits, and
    // that is the detail that says bone rather than old ivory.
    for (let i = 0; i < 40; i++) {
      const cy = rand() < 0.5 ? (rand() * 6) | 0 : s - 1 - ((rand() * 6) | 0);
      x.fillStyle = vary(color, rand, -0.34, 0.24);
      x.fillRect((rand() * s) | 0, cy, 1, 1);
    }
    // cracks, which follow the grain rather than wandering
    for (let i = 0; i < 4; i++) {
      const cx = (rand() * s) | 0;
      for (let y = 0; y < s; y += 2) {
        if (rand() < 0.25) continue;
        x.fillStyle = vary(color, rand, -0.42, 0.22);
        x.fillRect(cx + ((rand() * 3) | 0) - 1, y, 1, 2);
      }
    }
    // ITS OWN WEAR: stained brown at one end, from the ground it lay in
    dither(x, s, null, mix(color, '#6b5a34', 0.6),
      (_i, y) => Math.max(0, (y - s * 0.6) / (s * 0.4)));
  });
}

/** Translucent jelly. */
export function slimeTex(color) {
  return makeTex('slime' + color, (x, rand, s) => {
    x.fillStyle = shade(color, -0.12);
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) {
      x.fillStyle = vary(color, rand, -0.06, 0.26);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
    // DEPTH. Bubbles further in are bigger, dimmer and bluer; the ones
    // at the surface are small and bright. Drawing them all the same
    // size in one colour is what made this read as spotted paint.
    for (let d = 3; d >= 1; d--) {
      const n = d * 6, r = d * 1.6;
      for (let i = 0; i < n; i++) {
        blob(x, s, rand() * s, rand() * s, r,
          shade(mix(color, '#9fe8d0', 0.25 * d), 0.10 * (4 - d)), 0.75);
      }
    }
    // a bright specular, and a dark rim where the body curves away
    x.fillStyle = shade(color, 0.7); x.fillRect(5, 4, 4, 2); x.fillRect(4, 6, 2, 2);
    x.fillStyle = shade(color, 0.45); x.fillRect(9, 4, 1, 1);
    dither(x, s, null, shade(color, -0.42),
      (_i, y) => Math.max(0, (y - s * 0.72) / (s * 0.28)));
  });
}

/** Wood - staves, bows, crates, planks. */
export function woodTex(color) {
  return makeTex('wood' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // GROWTH RINGS, not random stripes: fibres run the length of the
    // piece and vary in width, dark late wood against pale early wood.
    let i = 0;
    while (i < s) {
      const w = 1 + ((rand() * 3) | 0);
      const v = (rand() - 0.45) * 0.5;
      x.fillStyle = shade(color, v);
      x.fillRect(i, 0, w, s);
      if (rand() < 0.5) { x.fillStyle = shade(color, v - 0.22); x.fillRect(i, 0, 1, s); }
      i += w;
    }
    // A KNOT, with the grain BENDING round it - the single detail that
    // reads as wood from across a room.
    const kx = 6 + ((rand() * (s - 12)) | 0), ky = 6 + ((rand() * (s - 12)) | 0);
    for (let r = 5; r >= 1; r--) {
      x.fillStyle = shade(color, r & 1 ? -0.34 : -0.14);
      x.fillRect(kx - r, ky - ((r / 2) | 0), r * 2, 1);
      x.fillRect(kx - r, ky + ((r / 2) | 0), r * 2, 1);
    }
    blob(x, s, kx, ky, 2.5, shade(color, -0.52), 1);
    // ITS OWN WEAR: the split always starts at the knot and runs with
    // the grain, and the end grain is chipped pale.
    for (let y = 0; y < s; y++) {
      if (rand() < 0.3) continue;
      x.fillStyle = shade(color, -0.45);
      x.fillRect(kx + ((rand() * 3) | 0) - 1, y, 1, 1);
    }
    for (let k = 0; k < 6; k++) {
      x.fillStyle = shade(color, 0.22);
      x.fillRect((rand() * s) | 0, s - 1 - ((rand() * 2) | 0), 1 + ((rand() * 2) | 0), 1);
    }
  });
}

/**
 * Flat colour. Deliberately still flat: this one is used for effect
 * quads - telegraph rings, damage flashes, sparks - where any detail at
 * all reads as dirt on the screen. It gets one dithered pass so it
 * grades instead of banding on a curved surface, and nothing else.
 */
export function flatTex(color) {
  return makeTex('flat' + color, (x, _r, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    dither(x, s, null, shade(color, 0.06), (i, y) => (i + y) / (s * 2) * 0.5);
  });
}

/**
 * Ground.
 *
 * The most-looked-at texture in the game by a wide margin - it is under
 * the player for the whole of every level - and it was 500 random
 * pixels. It is made of THINGS now: clumps of growth, pebbles that catch
 * the light on top and drop a shadow, and bare trodden earth between.
 */
export function groundTex(color, accent) {
  return makeTex('ground' + color + accent, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // trodden patches: bare, paler, warmer earth showing through
    for (let i = 0; i < 3; i++) {
      blob(x, s, rand() * s, rand() * s, 7 + rand() * 6,
        shade(mix(color, '#8a7350', 0.5), 0.05), 0.6);
    }
    // clumps of growth, in three tones so the ground is not one green
    for (let i = 0; i < 26; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      const c = rand() < 0.4 ? accent
        : rand() < 0.5 ? shade(accent, 0.18) : mix(accent, color, 0.55);
      const n = 3 + ((rand() * 4) | 0);
      for (let q = 0; q < n; q++) {
        x.fillStyle = c;
        x.fillRect((cx + ((rand() * 4) | 0) - 2 + s) % s,
                   (cy + ((rand() * 4) | 0) - 2 + s) % s, 1, 1);
      }
    }
    // pebbles: lit cap, body, shadow. Three pixels each, and they are
    // the reason the ground has a surface rather than a colour.
    for (let i = 0; i < 12; i++) {
      const cx = (rand() * (s - 2)) | 0, cy = (rand() * (s - 3)) | 0;
      const w = 1 + ((rand() * 2) | 0);
      x.fillStyle = vary(color, rand, 0.34, 0.24); x.fillRect(cx, cy, w, 1);
      x.fillStyle = vary(color, rand, 0.06, 0.20); x.fillRect(cx, cy + 1, w, 1);
      x.fillStyle = vary(color, rand, -0.40, 0.22); x.fillRect(cx, cy + 2, w, 1);
    }
    for (let i = 0; i < 90; i++) {
      x.fillStyle = vary(color, rand, rand() < 0.5 ? -0.2 : 0.12, 0.26);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
  });
}

/* ---------------- faces ----------------
 * Ocarina of Time painted faces onto the head texture instead of modelling
 * them. On a sphere, three.js puts u=0.25 at +Z, so the face lives a quarter
 * of the way across the texture.
 */

const FACE_W = 64, FACE_H = 32;

function makeFaceTex(key, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = FACE_W; c.height = FACE_H;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  draw(x, rng(seedOf(key)), FACE_W, FACE_H);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** u=0.25 is dead centre of the face. */
const FX = FACE_W * 0.25;

/**
 * A humanoid face. eyeColor/browColor let the same builder serve heroes,
 * zombies and anything else with two eyes.
 */
export function faceTex(skin, opts = {}) {
  const {
    eye = '#2b2a33', white = '#efe9dc', brow = '#3a2a18',
    mouth = null, glow = false, key = 'face',
  } = opts;
  return makeFaceTex(`${key}${skin}${eye}${white}${brow}${mouth}${glow}`, (x, rand, w, h) => {
    x.fillStyle = shade(skin, 0);
    x.fillRect(0, 0, w, h);
    speckle(x, rand, 90, [shade(skin, -0.10), shade(skin, 0.09)], w);
    // shade the underside so the jaw reads
    x.fillStyle = shade(skin, -0.16);
    x.fillRect(0, h - 6, w, 6);

    const eyeY = 11, eyeW = 4, eyeH = 5;
    for (const s of [-1, 1]) {
      const ex = FX + s * 5 - eyeW / 2;
      if (!glow) {
        x.fillStyle = white;
        x.fillRect(ex, eyeY, eyeW, eyeH);
        x.fillStyle = eye;
        x.fillRect(ex + (s < 0 ? 2 : 1), eyeY + 1, 2, 3);
      } else {
        x.fillStyle = eye;
        x.fillRect(ex - 1, eyeY - 1, eyeW + 2, eyeH + 2);
      }
      x.fillStyle = brow;
      x.fillRect(ex - 1, eyeY - 3, eyeW + 2, 2);
    }
    if (mouth) {
      x.fillStyle = mouth;
      x.fillRect(FX - 3, eyeY + 9, 6, 2);
    }
  });
}

/** Bare skull: hollow sockets and a tooth row. */
export function skullTex(bone = '#ded3b4') {
  return makeFaceTex('skull' + bone, (x, rand, w, h) => {
    x.fillStyle = shade(bone, 0);
    x.fillRect(0, 0, w, h);
    speckle(x, rand, 120, [shade(bone, -0.2), shade(bone, 0.12), '#a89772'], w);
    for (const s of [-1, 1]) {
      x.fillStyle = '#0a0a0c';
      x.fillRect(FX + s * 5 - 3, 10, 5, 6);
    }
    x.fillStyle = '#0a0a0c';
    x.fillRect(FX - 1, 17, 2, 3);                    // nasal cavity
    x.fillStyle = shade(bone, -0.35);
    for (let i = -4; i <= 4; i += 2) x.fillRect(FX + i, 23, 1, 4);   // teeth
  });
}

/* ---------------- rock, wood and green things ---------------- */

/** Tree bark: ridges with real depth. */
export function barkTex(color) {
  return makeTex('bark' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // RIDGES, not stripes. Each ridge is lit on its left face, mid on
    // top and dark in the fissure beside it - three pixels wide and it
    // reads as relief instead of as paint.
    let i = 0;
    while (i < s) {
      const w = 2 + ((rand() * 3) | 0);
      x.fillStyle = vary(color, rand, 0.20, 0.20); x.fillRect(i, 0, 1, s);
      for (let q = 1; q < w; q++) {
        x.fillStyle = vary(color, rand, 0.02, 0.18); x.fillRect(i + q, 0, 1, s);
      }
      x.fillStyle = vary(color, rand, -0.42, 0.20); x.fillRect(i + w, 0, 1, s);
      // the fissure wanders rather than running dead straight
      for (let y = 0; y < s; y += 2) {
        x.fillStyle = shade(color, -0.42);
        x.fillRect(i + w + ((rand() * 3) | 0) - 1, y, 1, 2);
      }
      i += w + 1;
    }
    // ITS OWN WEAR: lichen. Cool grey-green, only in the fissures where
    // it stays damp, and it is the thing that stops bark being brown.
    for (let k = 0; k < 5; k++) {
      blob(x, s, rand() * s, rand() * s, 3 + rand() * 3,
        mix(color, '#93a68c', 0.75), 0.7);
    }
  });
}

/** Canopy leaves. */
export function leafTex(color) {
  return makeTex('leaf' + color, (x, rand, s) => {
    // the SKY GAP behind the canopy: cooler and darker, so the leaves
    // have something to be in front of
    x.fillStyle = shade(mix(color, '#2b3a44', 0.5), -0.24);
    x.fillRect(0, 0, s, s);
    // three depths of clump, and a hue ramp from yellow-green in the
    // light to blue-green in the shade - which is what a canopy is
    for (let d = 0; d < 3; d++) {
      const n = [16, 20, 26][d];
      for (let i = 0; i < n; i++) {
        const cx = rand() * s, cy = rand() * s, r = 2 + rand() * (3 - d * 0.6);
        const c = mix(mix(color, '#4a6b3a', 0.4 - d * 0.2),
                      d === 2 ? '#c9d47a' : '#3a5a55', 0.18 + rand() * 0.2);
        blob(x, s, cx, cy, r, shade(c, -0.22 + d * 0.16), 0.9);
      }
    }
    // catchlights on the topmost leaves only
    for (let i = 0; i < 10; i++) {
      x.fillStyle = shade(mix(color, '#e2e8a0', 0.35), 0.2);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1 + ((rand() * 2) | 0));
    }
  });
}

/** Cliff rock: strata, with the fractures that come with them. */
export function cliffTex(color) {
  return makeTex('cliff' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // BEDDING PLANES. Each band is a different rock, so it gets its own
    // hue as well as its own value - a cliff is not one grey.
    let y = 0;
    while (y < s) {
      const band = 2 + ((rand() * 5) | 0);
      const c = mix(color, rand() < 0.5 ? '#6a5540' : '#4a5560', rand() * 0.45);
      x.fillStyle = shade(c, (rand() - 0.5) * 0.30);
      x.fillRect(0, y, s, band);
      // lit lip on top of the bed, shadow under it
      x.fillStyle = shade(c, 0.26); x.fillRect(0, y, s, 1);
      x.fillStyle = shade(c, -0.46); x.fillRect(0, y + band - 1, s, 1);
      y += band;
    }
    // FRACTURES run vertically, across the beds, and step sideways at
    // each one - which is the detail that stops strata reading as a
    // stack of painted stripes.
    for (let k = 0; k < 3; k++) {
      let cx = (rand() * s) | 0;
      for (let yy = 0; yy < s; yy++) {
        if (rand() < 0.18) cx += (rand() < 0.5 ? -1 : 1);
        x.fillStyle = shade(color, -0.5);
        x.fillRect((cx + s) % s, yy, 1, 1);
      }
    }
    // scree: chips that have spalled off, catching light on their top
    for (let i = 0; i < 18; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      x.fillStyle = vary(color, rand, 0.30, 0.26); x.fillRect(cx, cy, 1 + ((rand() * 2) | 0), 1);
      x.fillStyle = vary(color, rand, -0.34, 0.24); x.fillRect(cx, cy + 1, 1, 1);
    }
  });
}

/* ---------------- the families the game was faking ----------------
 *
 * Every one of these was being painted with `flatTex` or with a
 * generator meant for something else. The worst of it: the DRAGONS -
 * the things the whole game is named after and the only models a player
 * looks at for a full minute - were wearing `leafTex`, a canopy of
 * leaves, because it was the closest thing to a scale pattern in the
 * file.
 */

/** Dressed masonry: courses, mortar, and no two blocks the same. */
export function stoneTex(color) {
  return makeTex('stone' + color, (x, rand, s) => {
    // MORTAR FIRST, then lay blocks on top of it. Drawing the joints as
    // lines over a filled rectangle gives you joints of one width that
    // all meet perfectly, which no wall has ever done.
    x.fillStyle = shade(mix(color, '#8a8272', 0.55), -0.28);
    x.fillRect(0, 0, s, s);
    const H = 7;
    for (let row = 0, y = 0; y < s; row++, y += H) {
      // every other course is offset half a block: a stack bond looks
      // like a grid and a grid looks like a floor
      let cx = (row & 1) ? -5 : 0;
      while (cx < s) {
        const w = 8 + ((rand() * 5) | 0);
        const c = mix(color, rand() < 0.5 ? '#7a6f5e' : '#5e6470', rand() * 0.35);
        for (let bx = 0; bx < w - 1; bx++) for (let by = 0; by < H - 1; by++) {
          const px = (cx + bx + s) % s;
          x.fillStyle = shade(c, by === 0 ? 0.20 : by === H - 2 ? -0.30 : (rand() - 0.5) * 0.12);
          x.fillRect(px, y + by, 1, 1);
        }
        // ITS OWN WEAR: knocked corners, showing paler fresh stone
        if (rand() < 0.45) {
          x.fillStyle = shade(c, 0.30);
          x.fillRect((cx + w - 2 + s) % s, y + H - 2, 1, 1);
        }
        cx += w;
      }
    }
    // damp and moss collect in the joints, never on the faces
    for (let i = 0; i < 5; i++) {
      blob(x, s, rand() * s, ((rand() * 5) | 0) * H, 3 + rand() * 3, '#4a5c3a', 0.55);
    }
  });
}

/**
 * Dragon scale. Overlapping rows, each scale lit along its leading edge
 * and shadowed where the next one laps over it.
 */
export function scaleTex(color) {
  return makeTex('scale' + color, (x, rand, s) => {
    x.fillStyle = shade(color, -0.30);
    x.fillRect(0, 0, s, s);
    const W = 5, H = 4;
    for (let row = 0, y = -2; y < s; row++, y += H) {
      const off = (row & 1) ? (W / 2) | 0 : 0;
      for (let cx = -W + off; cx < s + W; cx += W) {
        // a scale is a rounded diamond: widest in the middle, tapering
        // to the tip that laps over the row below
        const c = shade(color, (rand() - 0.5) * 0.16);
        for (let by = 0; by < H + 1; by++) {
          const t = by / H;
          const half = Math.max(0, ((W / 2) * (1 - Math.abs(t - 0.35) * 1.4)) | 0);
          for (let bx = -half; bx <= half; bx++) {
            const px = (cx + bx + s * 2) % s, py = y + by;
            if (py < 0 || py >= s) continue;
            // leading edge catches the light, trailing edge is under the
            // scale in front of it
            const v = by === 0 ? 0.34 : by >= H - 1 ? -0.34 : 0.06 - t * 0.2;
            x.fillStyle = shade(c, v);
            x.fillRect(px, py, 1, 1);
          }
        }
      }
    }
    // a keel of harder, paler scale down one side, and the odd chipped
    // one - a dragon that has been fought has scales missing
    dither(x, s, null, shade(color, 0.22), (i) => Math.max(0, 1 - Math.abs(i - s * 0.25) / 4));
    for (let i = 0; i < 4; i++) {
      blob(x, s, rand() * s, rand() * s, 2, shade(mix(color, '#3a2a24', 0.6), -0.2), 1);
    }
  });
}

/** Glacier ice: deep blue with fracture planes, frosted on the surface. */
export function iceTex(color = '#8fc7e8') {
  return makeTex('ice' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // depth: ice is BLUER the further you see into it, so the deep parts
    // are dithered towards a saturated blue rather than towards black
    dither(x, s, null, mix(color, '#1e4a86', 0.7),
      (i, y) => 0.55 * (0.5 + 0.5 * Math.sin(i * 0.28 + y * 0.19)));
    // FRACTURE PLANES: long straight-ish cleavages, bright where they
    // catch the light and dark on the far side
    for (let k = 0; k < 5; k++) {
      let cx = rand() * s;
      const slope = (rand() - 0.5) * 1.4;
      for (let y = 0; y < s; y++) {
        const px = ((cx + slope * y) | 0) % s;
        x.fillStyle = shade(color, 0.45); x.fillRect((px + s) % s, y, 1, 1);
        x.fillStyle = shade(color, -0.32); x.fillRect((px + 1 + s) % s, y, 1, 1);
      }
    }
    // trapped air, and a frosted rime on the surface
    for (let i = 0; i < 22; i++) {
      x.fillStyle = vary(color, rand, 0.45, 0.40);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
    for (let i = 0; i < 3; i++) blob(x, s, rand() * s, rand() * s, 4, '#eaf4ff', 0.5);
  });
}

/** Settled snow: nearly white, but its shadows are blue. */
export function snowTex(color = '#eef4fb') {
  return makeTex('snow' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // DIMPLES. Snow is not flat and it is not noisy - it is a field of
    // soft hollows, and the hollows are blue because they are lit by sky.
    for (let i = 0; i < 26; i++) {
      blob(x, s, rand() * s, rand() * s, 2 + rand() * 3,
        mix(color, '#7fa4cc', 0.3 + rand() * 0.5), 0.6);
    }
    for (let i = 0; i < 14; i++) {
      x.fillStyle = '#ffffff';
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
    // a wind crust: one direction, shallow, catching light along its edge
    dither(x, s, null, mix(color, '#c8d8ea', 0.6), (i, y) => Math.max(0, Math.sin((i + y * 0.4) * 0.5)) * 0.4);
  });
}

/** Moss and lichen, for the damp side of everything. */
export function mossTex(color = '#4a6b3a') {
  return makeTex('moss' + color, (x, rand, s) => {
    x.fillStyle = shade(color, -0.2);
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 130; i++) {
      const c = rand() < 0.3 ? mix(color, '#c9d47a', 0.2 + rand() * 0.45)
        : rand() < 0.5 ? vary(color, rand, 0.16, 0.24) : vary(color, rand, -0.24, 0.26);
      x.fillStyle = c;
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1 + ((rand() * 2) | 0));
    }
    for (let i = 0; i < 6; i++) {
      blob(x, s, rand() * s, rand() * s, 3 + rand() * 3, mix(color, '#93a68c', 0.6), 0.5);
    }
  });
}

/** Rust, for anything iron that has been left in a mine. */
export function rustTex(color = '#7a3b1c') {
  return makeTex('rust' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // rust is layered: black pitting under, orange scale over, and a
    // powdery bloom on top. Three passes, three hues.
    for (let i = 0; i < 8; i++) blob(x, s, rand() * s, rand() * s, 3 + rand() * 4, '#2e1a12', 0.7);
    for (let i = 0; i < 10; i++) {
      blob(x, s, rand() * s, rand() * s, 2 + rand() * 4, mix(color, '#c8712f', 0.6), 0.8);
    }
    for (let i = 0; i < 50; i++) {
      x.fillStyle = mix(color, '#d9a45a', 0.15 + rand() * 0.7);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
    // and the metal still showing through where it has flaked away
    for (let i = 0; i < 4; i++) blob(x, s, rand() * s, rand() * s, 2, '#8a8f96', 0.6);
  });
}

/** Gold, for coins, crowns, the key and every piece of trim. */
export function goldTex(color = '#d4af37') {
  return makeTex('gold' + color, (x, rand, s) => {
    x.fillStyle = shade(color, 0);
    x.fillRect(0, 0, s, s);
    // gold is a MIRROR, so what it shows is the environment: a bright
    // band, a dark band, and a hot line between them. Uniform yellow
    // with noise on it is brass at best.
    dither(x, s, null, shade(color, 0.55), (_i, y) => Math.max(0, 1 - Math.abs(y - s * 0.32) / 5));
    dither(x, s, null, mix(color, '#5e3f10', 0.6), (_i, y) => Math.max(0, 1 - Math.abs(y - s * 0.72) / 6));
    x.fillStyle = '#fff6c8';
    for (let i = 0; i < s; i += 1) if (rand() < 0.5) x.fillRect(i, (s * 0.30) | 0, 1, 1);
    // tarnish in the recesses, and the scratches of being carried
    for (let i = 0; i < 6; i++) blob(x, s, rand() * s, rand() * s, 2, '#6b5a1e', 0.6);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = vary(color, rand, 0.4, 0.35);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 2 + ((rand() * 3) | 0), 1);
    }
  });
}

/** A cut gem, for artifacts and shrine stones. */
export function gemTex(color = '#5fa0c0') {
  return makeTex('gem' + color, (x, rand, s) => {
    x.fillStyle = shade(color, -0.35);
    x.fillRect(0, 0, s, s);
    // FACETS. A gem is flat planes at different angles, so it is bands
    // of solid tone with hard edges - the one material where noise is
    // exactly wrong.
    for (let i = 0; i < 9; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      const w = 4 + ((rand() * 8) | 0), h = 4 + ((rand() * 8) | 0);
      x.fillStyle = shade(color, (rand() - 0.4) * 0.9);
      x.fillRect(cx, cy, w, h);
    }
    // the internal fire: a hot core seen through the stone
    blob(x, s, s * 0.4, s * 0.45, 6, shade(color, 0.5), 0.8);
    x.fillStyle = '#ffffff';
    x.fillRect((s * 0.3) | 0, (s * 0.28) | 0, 2, 2);
  });
}

/** Fur / pelt, for wolves, cloaks and anything that was an animal. */
export function furTex(color = '#6b5a44') {
  return makeTex('fur' + color, (x, rand, s) => {
    x.fillStyle = shade(color, -0.2);
    x.fillRect(0, 0, s, s);
    // fur LIES IN A DIRECTION. Strokes that all run the same way, with a
    // pale tip and a dark root, is the whole of it.
    for (let i = 0; i < 260; i++) {
      const cx = (rand() * s) | 0, cy = (rand() * s) | 0;
      const len = 2 + ((rand() * 3) | 0);
      const pale = rand() < 0.4;
      for (let k = 0; k < len; k++) {
        x.fillStyle = vary(color, rand, (pale ? 0.22 : -0.05) - k * 0.10, 0.18);
        x.fillRect((cx + ((k * 0.4) | 0)) % s, (cy + k) % s, 1, 1);
      }
    }
    // a paler underside patch, because no animal is one colour
    blob(x, s, rand() * s, rand() * s, 8, shade(color, 0.24), 0.5);
  });
}

/** Embers and cooling coals, for braziers, forges and the lava seams. */
export function emberTex(color = '#c8341c') {
  return makeTex('ember' + color, (x, rand, s) => {
    // black crust, cracked, with the heat showing through the cracks -
    // which is the right way round. Lit coal drawn as orange with dark
    // spots reads as a rug.
    x.fillStyle = '#221a17';
    x.fillRect(0, 0, s, s);
    for (let k = 0; k < 7; k++) {
      let cx = rand() * s, cy = rand() * s;
      for (let i = 0; i < 26; i++) {
        cx = (cx + (rand() * 3 | 0) - 1 + s) % s;
        cy = (cy + (rand() * 3 | 0) - 1 + s) % s;
        x.fillStyle = mix(color, '#ffd08a', rand() * 0.7);
        x.fillRect(cx | 0, cy | 0, 1, 1);
      }
    }
    for (let i = 0; i < 5; i++) blob(x, s, rand() * s, rand() * s, 3, shade(color, 0.3), 0.45);
    for (let i = 0; i < 30; i++) {
      x.fillStyle = '#3a2c26';
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1 + ((rand() * 2) | 0), 1);
    }
  });
}

/** Still water, for the mine pools and the mountain tarns. */
export function waterTex(color = '#2f5d78') {
  return makeTex('water' + color, (x, rand, s) => {
    x.fillStyle = shade(color, -0.1);
    x.fillRect(0, 0, s, s);
    // two interfering wave trains, which is what makes water read as a
    // surface rather than as a blue floor
    dither(x, s, null, shade(color, 0.28),
      (i, y) => Math.max(0, Math.sin(i * 0.5 + y * 0.22) * 0.9));
    dither(x, s, null, shade(color, -0.30),
      (i, y) => Math.max(0, Math.sin(i * 0.19 - y * 0.44 + 2) * 0.7));
    for (let i = 0; i < 14; i++) {
      x.fillStyle = shade(color, 0.55);
      x.fillRect((rand() * s) | 0, (rand() * s) | 0, 1 + ((rand() * 2) | 0), 1);
    }
  });
}

/**
 * Flame. Ragged alpha and a hot-to-cool gradient along the length, so a cone
 * wearing this reads as fire rather than as a coloured cone. Scroll the
 * texture's offset over time and it licks.
 */
export function fireTex(hot = '#fff0b0', mid = '#ff9a2c', cool = '#c8341c') {
  return makeTex('fire' + hot + mid + cool, (x, rand, s) => {
    x.clearRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      // v runs along the cone: hot at the mouth, cooling toward the tip
      const v = y / s;
      const col = v < 0.28 ? hot : v < 0.62 ? mid : cool;
      for (let i = 0; i < s; i++) {
        // ragged tongues: drop pixels more often the further out we go
        const edge = Math.abs(i / s - 0.5) * 2;
        const keep = (1 - v * 0.75) * (1 - edge * 0.8);
        if (rand() > keep) continue;
        x.fillStyle = col;
        x.fillRect(i, y, 1, 1);
      }
    }
    // bright core streaks down the middle
    for (let i = 0; i < 26; i++) {
      const cx = (s * 0.5 + (rand() - 0.5) * s * 0.3) | 0;
      const cy = (rand() * s * 0.6) | 0;
      x.fillStyle = hot;
      x.fillRect(cx, cy, 1 + ((rand() * 2) | 0), 2 + ((rand() * 3) | 0));
    }
  });
}


/* register every single-colour generator, so repaint() can re-run them */
registerGenerator('cloth', clothTex);
registerGenerator('metal', metalTex);
registerGenerator('mail', mailTex);
registerGenerator('leather', leatherTex);
registerGenerator('skin', skinTex);
registerGenerator('rot', rotTex);
registerGenerator('bone', boneTex);
registerGenerator('slime', slimeTex);
registerGenerator('wood', woodTex);
registerGenerator('flat', flatTex);
registerGenerator('bark', barkTex);
registerGenerator('leaf', leafTex);
registerGenerator('cliff', cliffTex);
registerGenerator('skull', skullTex);
registerGenerator('stone', stoneTex);
registerGenerator('scale', scaleTex);
registerGenerator('ice', iceTex);
registerGenerator('snow', snowTex);
registerGenerator('moss', mossTex);
registerGenerator('rust', rustTex);
registerGenerator('gold', goldTex);
registerGenerator('gem', gemTex);
registerGenerator('fur', furTex);
registerGenerator('ember', emberTex);
registerGenerator('water', waterTex);
