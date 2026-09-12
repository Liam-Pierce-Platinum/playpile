/* =====================================================================
   ps1.js — the look
   =====================================================================
   Four things make a PlayStation game look like a PlayStation game, and
   none of them is polygon count:

     1. IT RENDERS AT 320x240 and gets blown up. Everything else follows
        from that - the chunky edges, the crawling texture detail, the
        way a doorway forty feet away is nine pixels wide.
     2. VERTEX SNAPPING. The console had no sub-pixel precision in its
        transform, so geometry twitched onto a coarse grid as it moved.
        That wobble is the single most recognisable thing about it.
     3. NO TEXTURE FILTERING and no mipmaps, so surfaces sparkle.
     4. VERTEX LIGHTING and heavy fog, because there was no budget for
        anything else - which happens to be exactly right for a game
        about one torch in a dark house.

   The snap is done by hand in the vertex shader: divide through by w,
   quantise x and y onto the low-resolution grid, multiply back. Doing it
   after the divide is the whole point; quantising before it snaps to the
   wrong grid and the wobble comes out uniform instead of getting worse
   with distance, which is backwards.
   ===================================================================== */
import * as THREE from '../vendor/three.module.js';

export const RES = { w: 320, h: 240 };

/* the snap, injected into whatever material a mesh already has */
export function ps1ify(mat, jitter) {
  const amount = jitter === undefined ? 1 : jitter;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = { value: new THREE.Vector2(RES.w * 0.5, RES.h * 0.5) };
    shader.uniforms.uJitter = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec2 uGrid;',
        'uniform float uJitter;',
      ].join('\n'))
      .replace('#include <project_vertex>', [
        '#include <project_vertex>',
        '/* the wobble: quantise in normalised device space, AFTER the',
        '   perspective divide, so it gets coarser with distance */',
        'if (uJitter > 0.0) {',
        '  float w = gl_Position.w;',
        '  vec2 ndc = gl_Position.xy / w;',
        '  ndc = floor(ndc * uGrid + 0.5) / uGrid;',
        '  gl_Position.xy = mix(gl_Position.xy, ndc * w, uJitter);',
        '}',
      ].join('\n'));
    mat.userData.shader = shader;
  };
  mat.needsUpdate = true;
  return mat;
}

/* a flat texture with no filtering and no mips, the way the hardware did it */
export function crunch(tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* a canvas texture drawn by hand, then crunched. Everything in the house
   is textured this way - there are no image files to load, so the whole
   game is one folder of source. */
export function paint(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  return crunch(new THREE.CanvasTexture(c));
}

/* a small deterministic generator, so a texture is the same every run */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    let x = s;
    x ^= x >>> 15; x = Math.imul(x, 2246822519);
    x ^= x >>> 13; x = Math.imul(x, 3266489917);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
}

export function makeRenderer(canvas) {
    /* preserveDrawingBuffer costs a little, and without it the canvas reads
     back BLACK to anything that screenshots it - which had me chasing a
     lighting bug that did not exist. */
  const r = new THREE.WebGLRenderer({ canvas, antialias: false,
    preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  /* the third argument is the important one: DO NOT touch the CSS size.
     The backing store stays at 320x240 and the page stretches it, which
     is what makes a pixel a block of pixels instead of a smear. */
  r.setPixelRatio(1);
  r.setSize(RES.w, RES.h, false);
  r.shadowMap.enabled = false;
  return r;
}
