// =====================================================================
// NASCAR :: post.js - THE CAMERA, NOT THE RENDERER
// =====================================================================
//
// Liam: "real motion blur like a high quality racing game", "no cartoon
// lines". The cartoon lines he means are speed streaks drawn on a 2D
// canvas over the top of the picture, which is what the drift sandbox and
// APEX both do. They read as a comic book. This does the thing itself.
//
// Four passes, all hand written - there is no EffectComposer in the
// vendored three.js and there does not need to be:
//
//   1. THE SCENE goes into a half-float target with a DEPTH TEXTURE
//      attached, because everything below needs to know how far away
//      each pixel is.
//
//   2. MOTION BLUR BY REPROJECTION. For every pixel, reconstruct where it
//      is in the world from its depth, ask where that point was on the
//      screen LAST frame, and smear along the line between the two. That
//      is a real velocity, not a guess from the speedometer: it blurs
//      correctly when you turn the camera, when you crest the banking,
//      and not at all when you are stationary.
//
//      Its one classic artifact is that the car you are FOLLOWING moves
//      with the camera, so reprojection says it moved and smears it. So
//      the blur is faded out close to the camera - under about fifteen
//      metres it is almost off. The world streaks, your own car stays
//      sharp, which is what the television picture looks like anyway.
//
//   3. BLOOM, at quarter resolution: a bright pass and two separable
//      blurs. The sun, the sparks off the wall and the hot sky above the
//      grandstand all need somewhere to spill.
//
//   4. THE COMPOSITE: bloom added, a little chromatic aberration at the
//      edges of the frame, a vignette, and film grain fine enough that
//      you only notice it when it is gone.
//
// QUALITY is one number. At 0 the whole chain is bypassed and the scene
// renders straight to the screen, which is the fallback if the frame rate
// will not hold.
import * as THREE from '../vendor/three.module.js';

const QUAD = new THREE.PlaneGeometry(2, 2);

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// ---- 1. bright pass, and downsample to a quarter ----------------------
const BRIGHT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uSoft;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThreshold, uThreshold + uSoft, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

// ---- 2. separable gaussian -------------------------------------------
const BLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uStep;
void main() {
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
  s += (texture2D(tDiffuse, vUv + uStep * 1.3846).rgb
      + texture2D(tDiffuse, vUv - uStep * 1.3846).rgb) * 0.316216;
  s += (texture2D(tDiffuse, vUv + uStep * 3.2308).rgb
      + texture2D(tDiffuse, vUv - uStep * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(s, 1.0);
}`;

// ---- 3. the composite -------------------------------------------------
const COMPOSITE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uBlur;        // overall strength, 0 = off
uniform float uBloom;
uniform float uVignette;
uniform float uAberration;
uniform float uGrain;
uniform float uTime;
uniform vec2 uNearFar;
uniform int uSamples;
uniform float uExposure;

vec3 rrt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(OUT * rrt(IN * c), 0.0, 1.0);
}

float viewDepth(float d) {
  // non-linear depth back to metres
  float n = uNearFar.x, f = uNearFar.y;
  float z = d * 2.0 - 1.0;
  return (2.0 * n * f) / (f + n - z * (f - n));
}

void main() {
  vec2 uv = vUv;
  float d = texture2D(tDepth, uv).x;

  // ---- motion blur ---------------------------------------------------
  vec3 col;
  if (uBlur > 0.001) {
    vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 world = uInvViewProj * clip;
    world /= world.w;
    vec4 prev = uPrevViewProj * world;
    vec2 prevUv = (prev.xy / prev.w) * 0.5 + 0.5;
    vec2 vel = (uv - prevUv) * uBlur;
    // THE CAR YOU ARE FOLLOWING moves with the camera, so reprojection
    // thinks it moved and smears it. Fade the blur out close in.
    float dist = viewDepth(d);
    vel *= smoothstep(7.0, 26.0, dist);
    // and never let one pixel smear across a fifth of the screen
    float len = length(vel);
    if (len > 0.035) vel *= 0.035 / len;
    col = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 12; i++) {
      if (i >= uSamples) break;
      float t = (float(i) / float(max(uSamples - 1, 1))) - 0.5;
      float w = 1.0 - abs(t) * 0.7;
      col += texture2D(tDiffuse, uv + vel * t).rgb * w;
      wsum += w;
    }
    col /= wsum;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }

  // ---- chromatic aberration, only out at the edges ---------------------
  if (uAberration > 0.0001) {
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    vec2 off = c * r2 * uAberration;
    col.r = texture2D(tDiffuse, uv + off).r;
    col.b = texture2D(tDiffuse, uv - off).b;
  }

  // ---- bloom -----------------------------------------------------------
  col += texture2D(tBloom, uv).rgb * uBloom;

  // ---- vignette and grain ----------------------------------------------
  vec2 q = (uv - 0.5) * 2.0;
  col *= 1.0 - uVignette * dot(q, q) * 0.34;

  // ---- TONE MAPPING HAPPENS HERE, and exactly once ---------------------
  //
  // The scene is rendered into a half-float target with the renderer's own
  // tone mapping switched OFF, so what is in that target is linear HDR -
  // which is what the bloom threshold needs to mean anything, and what a
  // sun in the sky needs to be allowed to be brighter than white.
  //
  // The first version left the renderer tone mapping into the target and
  // then let this pass run as well, which applied ACES twice and produced
  // a speedway at dusk on a sunny afternoon. The sRGB encode below is the
  // other half of the same mistake: a raw ShaderMaterial gets no colour
  // space conversion from three, so linear values went to the screen
  // unencoded and everything was dark again for a different reason.
  col *= uExposure;
  col = aces(col);

  float g = fract(sin(dot(uv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function pass(frag, uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(QUAD, mat));
  return { scene, mat, uniforms };
}

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quality = 1;
    this.prevViewProj = new THREE.Matrix4();
    this.skipBlur = 2;
    this.invViewProj = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.time = 0;

    this.bright = pass(BRIGHT, {
      tDiffuse: { value: null }, uThreshold: { value: 1.05 }, uSoft: { value: 0.55 },
    });
    this.blur = pass(BLUR, { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.comp = pass(COMPOSITE, {
      tDiffuse: { value: null }, tBloom: { value: null }, tDepth: { value: null },
      uInvViewProj: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uBlur: { value: 1.0 }, uBloom: { value: 0.55 }, uVignette: { value: 0.55 },
      uAberration: { value: 0.0022 }, uGrain: { value: 0.022 }, uTime: { value: 0 },
      uNearFar: { value: new THREE.Vector2(camera.near, camera.far) },
      uSamples: { value: 9 }, uExposure: { value: 1.0 },
    });
    this.setSize(renderer.domElement.width, renderer.domElement.height);
    this.setQuality(1);
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (this.rt) { this.rt.dispose(); this.a.dispose(); this.b.dispose(); }
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthTexture: depth, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    const qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    const opt = { type: THREE.HalfFloatType, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.a = new THREE.WebGLRenderTarget(qw, qh, opt);
    this.b = new THREE.WebGLRenderTarget(qw, qh, opt);
    this.w = w; this.h = h; this.qw = qw; this.qh = qh;
  }

  /**
   * 0 = straight to the screen, 1 = the lot, 0.5 = blur but no bloom.
   *
   * WHO TONE MAPS is decided here and NOWHERE ELSE, once, because getting
   * it wrong is invisible until you look at a screenshot and getting it
   * wrong twice is invisible for longer. three applies its own tone
   * mapping when it renders to a render target as well as to the screen,
   * so with the chain on it must be told not to: the target then holds
   * linear HDR, which is what the bloom threshold needs to mean anything,
   * and the composite below does ACES exactly once.
   *
   * It is set here rather than per frame because changing
   * renderer.toneMapping recompiles every shader in the scene, and doing
   * that twice a frame is a slideshow.
   */
  setQuality(q) {
    this.quality = q;
    this.renderer.toneMapping = q > 0 ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    const u = this.comp.uniforms;
    // WHY 1.9 AND NOT 1. three's own ACES pass multiplies by
    // toneMappingExposure / 0.6 before the fit, which is a 1.7x boost
    // baked into the renderer that nobody ever sees. Hand-rolling ACES
    // without it produced a speedway at dusk on a sunny afternoon and
    // three separate wrong theories about the colour pipeline before
    // somebody thought to put a known grey through it and read the
    // number back.
    u.uExposure.value = 2.05;
    u.uBloom.value = q >= 1 ? 0.55 : 0;
    u.uAberration.value = q >= 1 ? 0.0022 : 0;
    u.uGrain.value = q >= 1 ? 0.022 : 0;
    u.uSamples.value = q >= 1 ? 9 : 5;
  }

  /** how hard to blur, 0..1 - main.js turns it up with speed */
  setBlur(x) { this.comp.uniforms.uBlur.value = x; }

  /**
   * Forget where the camera was last frame.
   *
   * Call this on any cut: a camera change, a reset, a teleport. Marking
   * it rather than clearing it, because the matrix is only meaningful
   * once the NEXT frame has been rendered from the new position.
   */
  resetHistory() { this.skipBlur = 2; }

  render(dt) {
    const r = this.renderer;
    if (this.quality <= 0) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    // ---- the scene, in linear HDR ----------------------------------------
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);

    // ---- bloom ----------------------------------------------------------
    if (this.quality >= 1) {
      this.bright.uniforms.tDiffuse.value = this.rt.texture;
      r.setRenderTarget(this.a);
      r.render(this.bright.scene, this.cam);
      for (const [from, to, sx, sy] of [
        [this.a, this.b, 1 / this.qw, 0], [this.b, this.a, 0, 1 / this.qh],
        [this.a, this.b, 2 / this.qw, 0], [this.b, this.a, 0, 2 / this.qh],
      ]) {
        this.blur.uniforms.tDiffuse.value = from.texture;
        this.blur.uniforms.uStep.value.set(sx, sy);
        r.setRenderTarget(to);
        r.render(this.blur.scene, this.cam);
      }
    }

    // ---- composite -------------------------------------------------------
    const u = this.comp.uniforms;
    u.tDiffuse.value = this.rt.texture;
    u.tBloom.value = this.quality >= 1 ? this.a.texture : this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.uTime.value = this.time;
    u.uNearFar.value.set(this.camera.near, this.camera.far);
    this.tmp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    u.uInvViewProj.value.copy(this.tmp).invert();
    u.uPrevViewProj.value.copy(this.skipBlur > 0 ? this.tmp : this.prevViewProj);
    if (this.skipBlur > 0) this.skipBlur--;
    r.setRenderTarget(null);
    r.render(this.comp.scene, this.cam);
    this.prevViewProj.copy(this.tmp);
  }
}
