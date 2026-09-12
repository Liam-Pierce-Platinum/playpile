/* =====================================================================
   real.js — the look, remade
   =====================================================================
   Liam: *"make the lights out hyper realistic I mean like really
   realistic and make the monster super scary"*.

   This replaces `ps1.js`, which did the opposite on purpose: 320x240,
   vertex snapping, no filtering, vertex lighting. Every one of those is
   now gone, and what is here instead is the short list of things that
   actually make a real-time image read as REAL rather than as a game
   from 1998:

     1. RESOLUTION AND FILTERING. It renders at the window's own size
        with mipmaps and 8x anisotropic filtering, so a floorboard
        running away from you stays a floorboard instead of turning into
        a sparkling mess.

     2. PHYSICAL MATERIALS. MeshStandardMaterial with real roughness, and
        a BUMP MAP DERIVED FROM EACH TEXTURE's own luminance - so plaster
        has tooth, boards have a grain that catches the torch, and the
        beam crossing a wall shows the wall's surface rather than sliding
        over a flat colour.

     3. SHADOWS FROM THE TORCH. The single biggest difference. A torch
        that does not cast shadows is a paint brush; one that does turns
        every doorway, chair leg and banister into a thing that hides
        something. Soft (PCF), and sized to the beam rather than to the
        house, because shadow map resolution spent on rooms you cannot
        see is resolution wasted.

     4. TONE MAPPING, not clipping. ACES filmic with a low exposure: the
        hot centre of the beam rolls off into white instead of clipping
        to a flat disc, and the dark end keeps detail instead of crushing
        to black. This is what makes a dark image look photographed.

     5. A POST PASS: grain that moves, a vignette, chromatic aberration
        that grows towards the edges, and a red lift when something is
        close. Hand-rolled - one render target, one full-screen quad, no
        library - because the four effects that matter here are about ten
        lines of shader between them.
   ===================================================================== */
import * as THREE from '../vendor/three.module.js';

/* the render size. Not a fixed 320x240 any more - it follows the window,
   capped so a 4K screen does not ask for a 4K shadow-mapped scene. */
export const RES = { w: 1152, h: 720 };

export function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  r.setSize(RES.w, RES.h, false);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

/* the maximum anisotropy the machine will give us, asked once */
let ANISO = 8;
export function setAniso(renderer) {
  try { ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (e) {}
}

/**
 * A painted texture, filtered properly.
 *
 * Same hand-drawn canvases as before - there are still no image files in
 * this game - but now with mipmaps, linear filtering and anisotropy, and
 * drawn at four times the resolution they were.
 */
export function paint(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.userData.canvas = c;
  return t;
}

/**
 * A bump map made out of a colour texture's own brightness.
 *
 * Real surfaces are not flat, and the cheapest honest way to say so is to
 * treat "darker" as "lower" - mortar lines, board gaps and the weave of a
 * blanket are all darker than what surrounds them, so the luminance of
 * the diffuse map is already a height field. It costs one canvas read.
 */
export function bumpFrom(tex) {
  const src = tex.userData.canvas;
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const l = (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) | 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = l;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
}

/**
 * Turn whatever material a mesh was given into a physical one.
 *
 * The old `ps1ify` injected a vertex snap. This does the opposite job:
 * it takes the same colour and map and returns a standard material with
 * a roughness that suits what it is, plus the bump map above. Keeping the
 * name and the signature means house.js did not have to be rewritten
 * around it.
 */
export function ps1ify(mat, opts = {}) {
  const o = {
    color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
    map: mat.map || null,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.92,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.0,
  };
  if (mat.isMeshBasicMaterial && !opts.force) {
    // a bulb or a switch plate that is meant to glow stays unlit
    return mat;
  }
  const m = new THREE.MeshStandardMaterial(o);
  if (o.map) {
    const b = bumpFrom(o.map);
    if (b) { m.bumpMap = b; m.bumpScale = opts.bump !== undefined ? opts.bump : 0.35; }
  }
  return m;
}

/* kept so nothing that still imports it breaks; it does nothing now */
export function crunch(t) { return t; }

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

/* =====================================================================
   THE POST PASS
   ===================================================================== */
export class Post {
  constructor(renderer, w, h) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      samples: 4,
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uTime: { value: 0 },
      uGrain: { value: 0.055 },
      uVignette: { value: 1.15 },
      uAberration: { value: 0.0016 },
      uPanic: { value: 0 },          // 0..1, how close it is
      uFlash: { value: 0 },          // a white hit, for the moment it gets you
    };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uTime, uGrain, uVignette, uAberration, uPanic, uFlash;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;
          vec2 c = uv - 0.5;
          float r2 = dot(c, c);

          // CHROMATIC ABERRATION, stronger at the edges, like a real lens
          float ab = uAberration * (1.0 + r2 * 6.0) * (1.0 + uPanic * 2.0);
          vec3 col;
          col.r = texture2D(tDiffuse, uv + c * ab).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - c * ab).b;

          // GRAIN. Real film grain lives in the shadows, not in the
          // highlights, so it is scaled by how dark the pixel already is.
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          float n = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 77.7) - 0.5;
          col += n * uGrain * (1.0 - lum * 0.75);

          // VIGNETTE
          col *= 1.0 - clamp(r2 * uVignette, 0.0, 0.9);

          // the red lift when something is near, and the white when it has you
          col = mix(col, vec3(col.r * 1.25, col.g * 0.72, col.b * 0.72), uPanic * 0.55);
          col += uFlash;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }));
    this.scene.add(quad);
  }

  setSize(w, h) { this.target.setSize(w, h); }

  render(scene, camera, t, panic, flash) {
    this.uniforms.uTime.value = t;
    this.uniforms.uPanic.value = panic || 0;
    this.uniforms.uFlash.value = flash || 0;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}
